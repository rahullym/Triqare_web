import { createServerClient } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'
import { UserRole } from '@/types'

export interface InvitationResult {
  success: boolean
  invitationId?: string
  email: string
  error?: string
}

/**
 * Invite a user via Supabase Auth. This creates an (unconfirmed) auth user and
 * emails them an invite link that lands on /auth/callback to set their password.
 * The handle_new_auth_user() trigger provisions/links the public.users row; we
 * then set the intended role (trusted) on both app_metadata and users.role.
 *
 * @param email     - invitee email
 * @param role      - role to grant
 * @param invitedBy - id of the admin who invited (stored in metadata)
 */
export async function sendUserInvitation(
  email: string,
  role: UserRole,
  invitedBy?: string,
): Promise<InvitationResult> {
  try {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return { success: false, email, error: 'Invalid email format' }
    }

    const validRoles: UserRole[] = ['admin', 'ert', 'transport_company', 'patient', 'driver']
    if (!validRoles.includes(role)) {
      return { success: false, email, error: `Invalid role. Must be one of: ${validRoles.join(', ')}` }
    }

    const admin = createServerClient()
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/auth/callback?redirect_url=/dashboard`

    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        invited_by: invitedBy || 'csv_import',
        invited_at: new Date().toISOString(),
        source: 'csv_import',
      },
    })

    if (error || !data.user) {
      // Supabase returns an error if the user already exists.
      return { success: false, email, error: error?.message || 'Failed to send invitation' }
    }

    // inviteUserByEmail cannot set app_metadata directly, so the trigger created
    // the row as 'patient'. Promote to the intended role (trusted, service-role).
    try {
      await admin.auth.admin.updateUserById(data.user.id, { app_metadata: { role } })
    } catch (e) {
      console.warn('Could not set app_metadata role on invited user:', e)
    }
    await UserService.updateUserByAuthId(data.user.id, { role })

    return { success: true, invitationId: data.user.id, email }
  } catch (error) {
    console.error('Error sending invitation:', error)
    return {
      success: false,
      email,
      error: error instanceof Error ? error.message : 'Failed to send invitation',
    }
  }
}

/**
 * Send bulk invitations (e.g. CSV import).
 */
export async function sendBulkInvitations(
  users: Array<{ email: string; role: UserRole }>,
  invitedBy?: string,
): Promise<InvitationResult[]> {
  const results: InvitationResult[] = []
  for (const user of users) {
    results.push(await sendUserInvitation(user.email, user.role, invitedBy))
  }
  return results
}
