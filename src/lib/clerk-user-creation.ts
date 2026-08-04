import { createServerClient } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'

/**
 * Create a login-capable user in Supabase Auth with a temporary password.
 * The user resets the password later via "Forgot password". The
 * handle_new_auth_user() DB trigger provisions/links the public.users row using
 * the trusted `app_metadata.role`, so this returns both the auth user id and the
 * resolved public.users.id.
 *
 * (File name kept for import stability; this replaces the old Clerk implementation.)
 *
 * NOTE: phone is intentionally NOT part of the auth identity — the caller persists
 * it on the Supabase users/driver row. The `_phone` param is kept for callers.
 */
export async function createSupabaseAuthUser(
  email: string,
  fullName: string,
  role: string,
  _phone?: string,
): Promise<{ success: boolean; authUserId?: string; appUserId?: string; error?: string }> {
  try {
    const admin = createServerClient()
    const temporaryPassword = generateTemporaryPassword()

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      email_confirm: true, // admin-provisioned accounts are pre-confirmed
      user_metadata: {
        first_name: fullName.split(' ')[0] || fullName,
        last_name: fullName.split(' ').slice(1).join(' ') || '',
        full_name: fullName,
      },
      app_metadata: { role }, // trusted role source read by the DB trigger
    })

    if (error || !data.user) {
      return { success: false, error: error?.message || 'Failed to create auth user' }
    }

    // The trigger created/linked the public.users row; resolve its internal id.
    const { data: appUser } = await UserService.getUserByAuthId(data.user.id)
    if (!appUser?.id) {
      return { success: false, authUserId: data.user.id, error: 'Auth user created but no users row was provisioned' }
    }

    // Force the role onto the provisioned row.
    //
    // handle_new_auth_user() reads `NEW.raw_app_meta_data->>'role'`, but GoTrue
    // INSERTs the auth.users row with only its own provider metadata and applies
    // the caller's app_metadata in a SECOND statement — so at trigger time the
    // role key is absent and the function falls back to its 'patient' default.
    // Every admin-provisioned driver and transport company therefore landed as a
    // patient: profile row present, but wrong role, so they could not sign in as
    // a driver and never appeared in the driver lists.
    //
    // The trigger also links an existing users row by email rather than creating
    // one, in which case it does not touch the role at all. Setting it here covers
    // both branches and keeps the fix in one place for every caller.
    if (appUser.role !== role) {
      const { error: roleError } = await admin.from('users').update({ role }).eq('id', appUser.id)
      if (roleError) {
        return {
          success: false,
          authUserId: data.user.id,
          appUserId: appUser.id,
          error: `User created but the ${role} role could not be applied: ${roleError.message}`,
        }
      }
    }

    return { success: true, authUserId: data.user.id, appUserId: appUser.id }
  } catch (error: any) {
    console.error(`Error creating Supabase auth user ${email}:`, error)
    return { success: false, error: error?.message || 'Failed to create user' }
  }
}

/**
 * Back-compat shim for callers still importing `createClerkUser`. Returns the same
 * shape they expect, but `clerkUserId` now carries the Supabase AUTH user id.
 * IMPORTANT: callers must NOT also insert their own public.users row — the trigger
 * already created it. Prefer migrating callers to `createSupabaseAuthUser`.
 */
export async function createClerkUser(
  email: string,
  fullName: string,
  role: string,
  phone?: string,
): Promise<{ success: boolean; clerkUserId?: string; appUserId?: string; error?: string }> {
  const r = await createSupabaseAuthUser(email, fullName, role, phone)
  return { success: r.success, clerkUserId: r.authUserId, appUserId: r.appUserId, error: r.error }
}

/**
 * Generate a secure temporary password. User resets it via "Forgot Password".
 */
function generateTemporaryPassword(): string {
  const length = 16
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
  let password = ''
  password += 'A'
  password += 'a'
  password += '1'
  password += '!'
  for (let i = password.length; i < length; i++) {
    password += charset.charAt(Math.floor(Math.random() * charset.length))
  }
  return password.split('').sort(() => Math.random() - 0.5).join('')
}
