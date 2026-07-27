import { NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'

/**
 * Admin authorization guard for API routes. Authenticates via the Supabase
 * session cookie, then requires the caller's public.users row to have
 * role === 'admin'. SERVER-ONLY.
 *
 * `userId` in the success result is the Supabase auth user id (auth.uid());
 * `appUser` is the caller's public.users row (id, role, email, ...).
 */
type AdminGuardResult =
  | { userId: string; appUser: Record<string, any>; error?: undefined }
  | { userId?: undefined; appUser?: undefined; error: NextResponse }

export async function requireAdmin(): Promise<AdminGuardResult> {
  const { user, appUser } = await getAuthedUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!appUser || appUser.role !== 'admin') {
    return {
      error: NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 }),
    }
  }
  return { userId: user.id, appUser: appUser as Record<string, any> }
}
