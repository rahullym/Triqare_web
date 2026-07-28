import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// Push-notification delivery health.
//
// Reads public.push_deliveries (service-role only — RLS denies anon/authenticated)
// and returns aggregate stats + the most recent send attempts, so an admin can see
// whether SOS pushes are actually landing. Each row is one send attempt logged by
// src/lib/push/sosPush.ts (one per event × audience).

export const runtime = 'nodejs'

// Look back this far for the summary tiles. The table always shows the newest rows.
const WINDOW_DAYS = 7
const STATS_ROW_CAP = 5000 // safety cap on rows aggregated in-process
const TABLE_ROWS = 100

interface DeliveryRow {
  id: string
  request_id: string | null
  event: string
  audience: string
  recipients: number
  sent: number
  failed: number
  invalid: number
  not_configured: boolean
  created_at: string
}

export async function GET(_request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const supabase = await createClient()

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabase
      .from('push_deliveries')
      .select('id, request_id, event, audience, recipients, sent, failed, invalid, not_configured, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(STATS_ROW_CAP)

    if (error) {
      // Most likely the migration hasn't been applied on this DB yet.
      return NextResponse.json(
        { error: `Could not read push_deliveries: ${error.message}`, success: false },
        { status: 500 }
      )
    }

    const rows = (data ?? []) as DeliveryRow[]

    let recipients = 0
    let sent = 0
    let failed = 0
    let invalid = 0
    let notConfiguredAttempts = 0
    const byEvent: Record<string, { attempts: number; recipients: number; sent: number; failed: number }> = {}

    for (const r of rows) {
      recipients += r.recipients ?? 0
      sent += r.sent ?? 0
      failed += r.failed ?? 0
      invalid += r.invalid ?? 0
      if (r.not_configured) notConfiguredAttempts += 1

      const e = (byEvent[r.event] ??= { attempts: 0, recipients: 0, sent: 0, failed: 0 })
      e.attempts += 1
      e.recipients += r.recipients ?? 0
      e.sent += r.sent ?? 0
      e.failed += r.failed ?? 0
    }

    const deliveryRate = recipients > 0 ? Math.round((sent / recipients) * 1000) / 10 : null

    const stats = {
      windowDays: WINDOW_DAYS,
      attempts: rows.length,
      recipients,
      sent,
      failed,
      invalid,
      notConfiguredAttempts,
      deliveryRate, // percent, or null when nothing was attempted
      lastAttemptAt: rows[0]?.created_at ?? null,
      byEvent: Object.entries(byEvent)
        .map(([event, v]) => ({ event, ...v }))
        .sort((a, b) => b.attempts - a.attempts),
      capped: rows.length >= STATS_ROW_CAP,
    }

    return NextResponse.json({ success: true, stats, rows: rows.slice(0, TABLE_ROWS) })
  } catch (err) {
    console.error('[push-health] failed', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unknown error', success: false },
      { status: 500 }
    )
  }
}
