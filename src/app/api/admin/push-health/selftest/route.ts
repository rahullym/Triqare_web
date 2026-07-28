import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { verifySender, sendToTokens } from '@/lib/push/fcm'

// Push pipeline self-test (admin only).
//
// GET  → verifies the FCM sender credentials WITHOUT sending (dry-run) and reports
//        the live token inventory, so an admin can confirm the pipeline can actually
//        deliver before a real SOS ever happens.
// POST → sends ONE real test notification to a chosen token, to prove end-to-end
//        delivery on a device on demand. { token } in the body.

export const runtime = 'nodejs'

interface RecentDevice {
  role: string | null
  user_id: string
  tokenTail: string
  platform: string | null
  created_at: string
  is_active: boolean
}

export async function GET(_request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    // 1. Sender credentials — the make-or-break check, done without delivering.
    const firebase = await verifySender()

    // 2. Token inventory (service-role reads; RLS-bypassing).
    const supabase = await createClient()

    const { count: deviceTotal } = await supabase
      .from('device_tokens')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)

    const { data: roleRows } = await supabase
      .from('device_tokens')
      .select('role')
      .eq('is_active', true)
      .limit(5000)

    const byRole: Record<string, number> = {}
    for (const r of roleRows ?? []) {
      const role = (r as { role: string | null }).role ?? 'unknown'
      byRole[role] = (byRole[role] ?? 0) + 1
    }

    const { count: legacyCount } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .not('fcm_token', 'is', null)
      .eq('is_active', true)

    const { data: recentRows } = await supabase
      .from('device_tokens')
      .select('id, role, user_id, token, platform, created_at, is_active')
      .order('created_at', { ascending: false })
      .limit(15)

    const recent: (RecentDevice & { id: string })[] = (recentRows ?? []).map((r) => {
      const row = r as {
        id: string; role: string | null; user_id: string; token: string
        platform: string | null; created_at: string; is_active: boolean
      }
      return {
        id: row.id,
        role: row.role,
        user_id: row.user_id,
        tokenTail: row.token ? `…${row.token.slice(-6)}` : '',
        platform: row.platform,
        created_at: row.created_at,
        is_active: row.is_active,
      }
    })

    return NextResponse.json({
      success: true,
      firebase,
      tokens: {
        deviceTotal: deviceTotal ?? 0,
        byRole,
        legacyCount: legacyCount ?? 0,
        recent,
      },
    })
  } catch (err) {
    console.error('[push-selftest] GET failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error', success: false },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    let body: { token?: string; deviceId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body', success: false }, { status: 400 })
    }

    // Accept either a raw token, or a device_tokens.id to look the token up server-side
    // (so the UI never has to handle full tokens).
    let token = typeof body.token === 'string' ? body.token.trim() : ''

    if (!token && typeof body.deviceId === 'string') {
      const supabase = await createClient()
      const { data } = await supabase
        .from('device_tokens')
        .select('token')
        .eq('id', body.deviceId)
        .maybeSingle()
      token = (data as { token?: string } | null)?.token ?? ''
    }

    if (!token) {
      return NextResponse.json({ error: 'A token or deviceId is required', success: false }, { status: 400 })
    }

    const result = await sendToTokens([token], {
      title: '🔔 TriQare push self-test',
      body: 'If you can see this, push delivery is working on this device.',
      data: { type: 'selftest' },
    })

    return NextResponse.json({ success: true, result })
  } catch (err) {
    console.error('[push-selftest] POST failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error', success: false },
      { status: 500 }
    )
  }
}
