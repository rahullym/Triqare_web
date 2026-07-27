import { createClient } from '@supabase/supabase-js'
import { createServerClient as createSSRServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * SERVICE-ROLE client. Bypasses RLS — use for privileged server work (admin
 * provisioning, dispatch, cross-user reads). NOT tied to the request's session.
 * Kept under its original name so existing API-route imports keep working.
 */
export function createServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

// Back-compat aliases: existing routes import `createClient` and/or
// `createServiceRoleClient` for the service-role client.
export { createServerClient as createClient }
export { createServerClient as createServiceRoleClient }

/**
 * SESSION-BOUND SSR client. Reads the Supabase auth cookie for the current
 * request, so `supabase.auth.getUser()` returns the signed-in user and RLS
 * applies. Use this in Server Components and route handlers to authenticate the
 * caller (replaces Clerk's `auth()`); do privileged DB work with the service-role
 * client above once the caller is authenticated + authorized.
 *
 * Next 15: `cookies()` is async, so this returns a Promise.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component (read-only cookies). Safe to ignore:
            // the middleware refreshes the session cookie on every request.
          }
        },
      },
    },
  )
}

/**
 * Convenience: authenticate the current request and resolve the app user row.
 * Returns { user, appUser } where `user` is the Supabase auth user (auth.uid())
 * and `appUser` is the matching public.users row (id, role, ...). Either may be
 * null. Uses the service-role client for the users lookup so it is not gated by
 * RLS (the caller is already authenticated via the session client).
 */
export async function getAuthedUser() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { user: null, appUser: null as null | Record<string, unknown> }

  const admin = createServerClient()
  const { data: appUser } = await admin
    .from('users')
    .select('*')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return { user, appUser }
}
