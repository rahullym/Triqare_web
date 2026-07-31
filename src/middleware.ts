import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Public routes — reachable without a Supabase session. Preserved verbatim from
// the previous Clerk middleware allow-list (each entry keeps its original reason).
// Matched as prefixes: an entry "/foo" matches "/foo" and "/foo/anything".
const PUBLIC_PREFIXES = [
  '/', // exact-only, handled specially below
  '/sign-in',
  '/sign-up',
  '/demo',
  '/register',
  // Registration POSTs to /api/register/* before a session exists (row creation
  // keys off the caller-supplied ids), so it must be reachable pre-auth.
  '/api/register',
  '/setup',
  '/mobile-app-required',
  '/test-mobile-redirect',
  '/api/webhooks',
  // SOS push-dispatch webhook — called machine-to-machine by the Postgres pg_net
  // trigger (no user session); it authenticates via PUSH_DISPATCH_SECRET.
  '/api/push',
  // Emergency-contact invite — called by the mobile app (no web session); IP
  // rate-limited, best-effort email only.
  '/api/emergency-contacts',
  // App-feedback submit — mobile app, no web session; IP rate-limited, email only.
  '/api/app-feedback',
  '/api/sync-users',
  '/api/sync-clerk-to-tables',
  '/api/debug',
  '/api/auth', // /api/auth/signin-direct and the OAuth callback
  '/api/cron',
  '/api/announcements/active',
  '/api/seed',
  '/api/users/locations',
  '/api/erteam',
  '/api/transport-companies',
  '/api/drivers',
  '/api/patients',
  '/api/hospitals',
  '/drivers',
  '/test-users',
  // The OAuth code-exchange landing route.
  '/auth/callback',
  // Password reset — the emailed 6-digit code is typed here, so the visitor has
  // no session yet (verifyOtp creates one).
  '/auth/reset',
]

function isPublic(pathname: string): boolean {
  if (pathname === '/') return true
  // Prefix match mirrors the old Clerk `"/foo(.*)"` route matchers.
  return PUBLIC_PREFIXES.some((p) => p !== '/' && pathname.startsWith(p))
}

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request)
  const { pathname } = request.nextUrl

  // Always let the session-refresh response through for public routes.
  if (isPublic(pathname)) {
    return supabaseResponse
  }

  // Allow test mode for transport API routes (parity with the old middleware).
  if (
    pathname.startsWith('/api/transport/') &&
    request.nextUrl.searchParams.get('test') === 'true'
  ) {
    return supabaseResponse
  }

  // Unauthenticated → sign-in, preserving the intended destination.
  if (!user) {
    const signInUrl = new URL('/sign-in', request.url)
    signInUrl.searchParams.set('redirect_url', pathname)
    return NextResponse.redirect(signInUrl)
  }

  // Authenticated: authorization (role gating) is handled by the client-side
  // guards + server route checks, same as before.
  return supabaseResponse
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|apk|webmanifest)).*)',
    // Always run for API routes.
    '/(api|trpc)(.*)',
  ],
}
