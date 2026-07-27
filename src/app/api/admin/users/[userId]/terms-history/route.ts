import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { deriveTermsStatus } from '@/lib/terms'

interface AcceptanceRow {
  id: string
  terms_version: string
  accepted_at: string
}

/**
 * GET /api/admin/users/[userId]/terms-history
 *
 * The backend is the source of truth for all T&C acceptance shown on the
 * dashboard. Returns, for one account:
 *   - the latest acceptance (denormalised on users: terms_version / _accepted_at)
 *   - the derived status (Accepted / Outdated / Not Accepted) vs the current version
 *   - the full append-only acceptance history from terms_acceptances (most recent
 *     first) — evidence of every version the user ever accepted.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createClient()

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, terms_accepted, terms_version, terms_accepted_at')
      .eq('id', userId)
      .maybeSingle()

    if (userError) {
      return NextResponse.json({ error: userError.message }, { status: 500 })
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Current version — source of truth for the Outdated derivation.
    const { data: cfg } = await supabase
      .from('configurations')
      .select('value')
      .eq('key', 'current_terms_version')
      .maybeSingle()
    const currentVersion = (cfg?.value ?? null) as string | null

    // Full audit history (append-only), newest first.
    const { data: historyRows, error: historyError } = await supabase
      .from('terms_acceptances')
      .select('id, terms_version, accepted_at')
      .eq('user_id', userId)
      .order('accepted_at', { ascending: false })

    if (historyError) {
      // The table may not exist yet (migration not applied). Degrade to the
      // denormalised latest acceptance rather than failing the whole panel.
      console.warn('Could not load terms_acceptances history:', historyError.message)
    }

    const history = (historyRows || []) as AcceptanceRow[]

    return NextResponse.json({
      terms_accepted: !!user.terms_accepted,
      terms_version: user.terms_version ?? null,
      terms_accepted_at: user.terms_accepted_at ?? null,
      current_terms_version: currentVersion,
      terms_status: deriveTermsStatus(user.terms_version, currentVersion),
      history,
    })
  } catch (error: any) {
    console.error('Error loading terms history:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load terms history' },
      { status: 500 }
    )
  }
}
