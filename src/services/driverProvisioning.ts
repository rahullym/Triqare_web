/**
 * Turns an APPROVED driver application into an account that can actually log in.
 *
 * Creates a Supabase Auth user (role=driver via trusted app_metadata). The
 * handle_new_auth_user() DB trigger provisions/links the public.users row by
 * email (so drivers/SOS records already pointing at that user_id stay intact);
 * we then fill in the driver profile fields and upsert the `drivers` row.
 *
 * Idempotent: safe to re-run for the same application (reuses an existing auth
 * user / updates existing rows), so a failed approval can simply be retried.
 */

import { randomBytes } from 'crypto'

import { createServerClient } from '@/lib/supabase/server'
import { decryptField } from '@/lib/crypto/fieldEncryption'
import type { DriverApplicationRow } from './driverApplicationService'

export interface ProvisionResult {
  authUserId: string
  userId: string
  /** Set only when we just created the auth account, so the approval email can carry it. */
  tempPassword: string | null
}

/** Random 18+ char password for the initial account (the driver resets it). */
function generateTempPassword(): string {
  return `Tq${randomBytes(12).toString('base64url')}!7`
}

function tryDecrypt(ciphertext: string, iv: string, tag: string): string | null {
  try {
    return decryptField({ ciphertext, iv, tag })
  } catch {
    return null // ENCRYPTION_KEY missing/rotated — fall back to the masked last4
  }
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/)
  return { firstName: parts[0] || 'Driver', lastName: parts.slice(1).join(' ') }
}

export async function provisionApprovedDriver(app: DriverApplicationRow): Promise<ProvisionResult> {
  const email = app.email.trim().toLowerCase()
  const { firstName, lastName } = splitName(app.full_name)
  const supabase = createServerClient()

  // ── 1. Supabase auth identity (reuse if this email already has a login) ─────
  const { data: existingUser } = await supabase
    .from('users')
    .select('id, auth_user_id')
    .eq('email', email)
    .maybeSingle()

  let authUserId: string
  let tempPassword: string | null = null

  if (existingUser?.auth_user_id) {
    authUserId = existingUser.auth_user_id
    // Make sure the role marks them a driver (mobile app routes on this).
    await supabase.auth.admin.updateUserById(authUserId, { app_metadata: { role: 'driver' } })
  } else {
    tempPassword = generateTempPassword()
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName || '', full_name: app.full_name },
      app_metadata: { role: 'driver' },
    })
    if (createError || !created.user) {
      throw new Error(`Failed to create driver auth user: ${createError?.message ?? 'no user returned'}`)
    }
    authUserId = created.user.id
  }

  // ── 2. Supabase users row — the trigger created/linked it; resolve + fill in ─
  const { data: userRow, error: userLookupError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (userLookupError || !userRow) {
    throw new Error(`Driver user row was not provisioned: ${userLookupError?.message ?? 'not found'}`)
  }
  const userId = userRow.id

  const { error: profileError } = await supabase
    .from('users')
    .update({
      first_name: firstName,
      last_name: lastName || null,
      full_name: app.full_name,
      phone: app.phone,
      role: 'driver',
      is_active: true,
    })
    .eq('id', userId)
  if (profileError) throw new Error(`Failed to update driver user row: ${profileError.message}`)

  // ── 3. drivers row (user_id is the PK → upsert is idempotent) ──────────────
  const licenseNumber =
    tryDecrypt(app.license_ciphertext, app.license_iv, app.license_tag) ??
    `****${app.license_last4}`

  const { error: driverError } = await supabase.from('drivers').upsert(
    {
      user_id: userId,
      license_number: licenseNumber,
      license_class: app.license_type,
      license_expiry: app.license_expiry,
      years_experience: app.driving_experience_years,
      vehicle_type: app.vehicle_type,
      vehicle_number: app.vehicle_registration,
    },
    { onConflict: 'user_id' },
  )
  if (driverError) throw new Error(`Failed to create driver record: ${driverError.message}`)

  return { authUserId, userId, tempPassword }
}
