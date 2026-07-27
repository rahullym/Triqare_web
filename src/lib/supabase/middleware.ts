import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Refreshes the Supabase auth session cookie for the request and returns the
 * current user. Mirrors the @supabase/ssr Next.js middleware pattern: it must run
 * on every matched request so the access/refresh token stays fresh and the same
 * cookies are visible to Server Components and route handlers.
 *
 * Returns both the (possibly cookie-mutated) response and the authenticated user
 * so the caller (src/middleware.ts) can decide on redirects.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  // IMPORTANT: getUser() (not getSession()) — it revalidates the token with the
  // Supabase Auth server. Do not run any code between creating the client and this
  // call, per @supabase/ssr guidance.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabaseResponse, user }
}
