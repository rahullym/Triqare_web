'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Browser Supabase client for Client Components.
 *
 * Uses @supabase/ssr's cookie-based storage so the session is shared with the
 * server (middleware + Server Components / route handlers). User-scoped reads made
 * through this client carry the Supabase access token, so RLS (`sb_auth: *`
 * policies) scopes them to the signed-in user. Do NOT use the legacy
 * `@/lib/supabase` singleton for authenticated reads — it is a plain anon client
 * with no session cookie and would run as `anon`.
 */
let browserClient: ReturnType<typeof createBrowserClient> | undefined

export function getBrowserSupabase(): ReturnType<typeof createBrowserClient> {
  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )
  }
  return browserClient!
}
