import { createServerClient } from '@/lib/supabase/server'

/**
 * Undo a half-finished provisioning attempt.
 *
 * WHY THIS EXISTS. Admin provisioning is two writes that are not a transaction:
 * `createSupabaseAuthUser()` creates the login (and the `handle_new_auth_user()`
 * trigger provisions the matching `public.users` row), and only then does the
 * caller INSERT the `drivers` / `transport_companies` profile. When that second
 * write fails — a duplicate `license_number`, a NOT NULL company, a bad uuid —
 * the login and the users row survive with no profile attached.
 *
 * That leftover is not merely untidy, it is self-blocking: every provisioning
 * path checks `users.email` first and refuses with "an account already exists",
 * so the operator cannot re-import the corrected row. They have to find and
 * delete the account by hand before retrying. This is the same orphan-account
 * failure the CSV importer was already fixed for once, arriving through the
 * error path instead of the happy one.
 *
 * ORDER MATTERS. `users.auth_user_id` is `REFERENCES auth.users(id) ON DELETE
 * SET NULL` (migrations/99_updates/supabase_auth_migration.sql), so deleting the
 * auth user does NOT remove the users row — it just nulls the link and destroys
 * the evidence of which row belonged to that login. The users row therefore goes
 * first, while it can still be matched on `auth_user_id`.
 *
 * Best-effort by construction: it returns a warning rather than throwing, because
 * every caller is already on an error path and reporting the ORIGINAL failure
 * matters more than reporting the cleanup of it.
 */
export async function rollbackProvisionedUser(params: {
  authUserId?: string | null
  appUserId?: string | null
}): Promise<{ warning: string | null }> {
  const { authUserId, appUserId } = params
  if (!authUserId && !appUserId) {
    return { warning: null }
  }

  const admin = createServerClient()
  const problems: string[] = []

  if (appUserId) {
    // Scoped to `auth_user_id` as well as the id: it proves the row is the one
    // this provisioning attempt caused. The trigger LINKS a pre-existing users
    // row by email instead of creating one, and deleting a real account because
    // its driver profile failed to insert would be far worse than an orphan.
    // (Callers pre-check the email, so that branch should be unreachable — this
    // makes it unreachable by construction rather than by convention.)
    let query = admin.from('users').delete().eq('id', appUserId)
    if (authUserId) {
      query = query.eq('auth_user_id', authUserId)
    }
    const { error } = await query
    if (error) {
      problems.push(`users row ${appUserId} could not be removed: ${error.message}`)
    }
  }

  if (authUserId) {
    const { error } = await admin.auth.admin.deleteUser(authUserId)
    if (error) {
      problems.push(`login ${authUserId} could not be removed: ${error.message}`)
    }
  }

  if (problems.length === 0) {
    return { warning: null }
  }

  const warning = `Clean-up was incomplete (${problems.join('; ')}) — delete the account under Admin → Users before retrying this row.`
  console.error('[provisionRollback]', warning)
  return { warning }
}
