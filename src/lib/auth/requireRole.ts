import { NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'

/**
 * Role guards for API routes, companions to requireAdmin(). Authenticate via the
 * Supabase session cookie, then (for requireRole) require the caller's
 * public.users.role to be in the allowed set. SERVER-ONLY.
 *
 * `requireAuth`  — any authenticated user with a public.users row.
 * `requireRole`  — authenticated AND role ∈ roles.
 * STAFF_ROLES     — the web-dashboard roles (admin / ert / transport_company).
 *                   Patients and drivers use the mobile app, not these routes, so
 *                   staff-only reads keep patient PII off unauthenticated / wrong-role
 *                   callers even though every user now has an auth identity.
 */
export type AppRole = 'admin' | 'ert' | 'transport_company' | 'patient' | 'driver'

export const STAFF_ROLES: AppRole[] = ['admin', 'ert', 'transport_company']

type GuardResult =
  | { userId: string; appUser: Record<string, any>; error?: undefined }
  | { userId?: undefined; appUser?: undefined; error: NextResponse }

export async function requireAuth(): Promise<GuardResult> {
  const { user, appUser } = await getAuthedUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!appUser) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { userId: user.id, appUser: appUser as Record<string, any> }
}

export async function requireRole(roles: AppRole[]): Promise<GuardResult> {
  const gate = await requireAuth()
  if (gate.error) return gate
  const role = gate.appUser.role as AppRole | undefined
  if (!role || !roles.includes(role)) {
    return {
      error: NextResponse.json({ error: 'Forbidden - insufficient role' }, { status: 403 }),
    }
  }
  return gate
}
