import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { blankToNull, LOCATION_FK_FIELDS } from '@/lib/blankToNull'
import { rollbackProvisionedUser } from '@/lib/provisionRollback'
import { EMAIL_REGEX, PHONE_REGEX } from '@/lib/validation/driverApplication'

const VALID_STATUSES = ['available', 'assigned', 'on_trip', 'inactive'] as const

/**
 * Create a driver AND their login in one step — the single-record twin of the
 * bulk CSV importer. See the transport-company provision route for why the
 * profile-only `POST /api/drivers` was not enough on its own.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  const supabase = createClient()

  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.full_name ?? '').trim()
    const licenseNumber = String(body.license_number ?? '').trim()
    const phone = String(body.phone ?? '').trim()
    const transportCompanyId = String(body.transport_company_id ?? '').trim()

    if (!email || !fullName || !licenseNumber) {
      return NextResponse.json(
        { error: 'Full name, email and licence number are all required.', success: false },
        { status: 400 }
      )
    }
    // drivers.transport_company_id is NOT NULL on the database, so a driver with
    // no company cannot be stored at all — say so before creating a login.
    if (!transportCompanyId) {
      return NextResponse.json(
        { error: 'A transport company is required. Every driver must belong to one.', success: false },
        { status: 400 }
      )
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: `"${body.email}" is not a valid email address.`, success: false }, { status: 400 })
    }
    if (phone && !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        {
          error: `"${phone}" is not a valid 10-digit Indian mobile number (no country code, no leading zero).`,
          success: false,
        },
        { status: 400 }
      )
    }

    const status = String(body.status ?? 'available').trim().toLowerCase()
    if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`, success: false },
        { status: 400 }
      )
    }

    const { data: company } = await supabase
      .from('transport_companies')
      .select('user_id, company_name')
      .eq('user_id', transportCompanyId)
      .maybeSingle()
    if (!company) {
      return NextResponse.json(
        { error: 'That transport company no longer exists. Reload the page and pick again.', success: false },
        { status: 400 }
      )
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingUser) {
      return NextResponse.json(
        { error: `An account already exists for ${email}. Select it under "Use an existing user" instead.`, success: false },
        { status: 409 }
      )
    }

    const created = await createSupabaseAuthUser(email, fullName, 'driver', phone || undefined)
    if (!created.success || !created.appUserId) {
      return NextResponse.json(
        { error: created.error || 'Failed to create the login for this driver.', success: false },
        { status: 400 }
      )
    }
    const appUserId = created.appUserId

    await supabase.from('users').update({ full_name: fullName, phone: phone || null }).eq('id', appUserId)

    const profile = blankToNull(
      {
        user_id: appUserId,
        transport_company_id: transportCompanyId,
        license_number: licenseNumber,
        // Nullable UNIQUE: a stored '' collides on the second driver without one.
        aadhar_number: String(body.aadhar_number ?? '').trim() || null,
        is_verified: body.is_verified === true,
        status,
        address_line: String(body.address_line ?? '').trim() || null,
        country_id: body.country_id ?? null,
        state_id: body.state_id ?? null,
        city_id: body.city_id ?? null,
        pincode_id: body.pincode_id ?? null,
        last_updated_at: new Date().toISOString(),
      },
      LOCATION_FK_FIELDS
    )

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .insert(profile)
      .select()
      .single()

    if (driverError) {
      // Remove the login AND its users row, not just the login — see
      // rollbackProvisionedUser. Leaving the users row behind makes the email
      // check above reject the operator's corrected retry.
      const { warning } = await rollbackProvisionedUser({
        authUserId: created.authUserId,
        appUserId,
      })
      const message = /license_number/.test(driverError.message)
        ? 'That licence number is already registered to another driver.'
        : /aadhar_number/.test(driverError.message)
          ? 'That Aadhaar number is already registered to another driver.'
          : `The driver record could not be saved: ${driverError.message}`
      return NextResponse.json(
        { error: warning ? `${message} ${warning}` : message, success: false },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        driver,
        message: `${fullName} added to ${company.company_name}. They can sign in after using "Forgot password" to set a password.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error provisioning driver:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create driver', success: false },
      { status: 500 }
    )
  }
}
