import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'

// Only honor internal, same-origin redirect targets to avoid open-redirect abuse.
function sanitizeRedirectUrl(raw: string | null): string {
  if (!raw) return '/dashboard'
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  return '/dashboard'
}

/**
 * OAuth / email-link landing route. Supabase redirects here with a `code` after
 * Google/Apple sign-in (and after email confirmation links). We exchange the code
 * for a session (which sets the auth cookies) and forward the user on.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeRedirectUrl(searchParams.get('redirect_url'))

  if (code) {
    const supabase = await createServerSupabaseClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      const signIn = new URL('/sign-in', origin)
      signIn.searchParams.set('error', 'auth_callback_failed')
      return NextResponse.redirect(signIn)
    }
  }

  return NextResponse.redirect(`${origin}${next}`)
}
