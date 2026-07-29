import { supabase } from '@/lib/supabase'
import {
  SOS_STATUSES,
  normalizeSOSStatus,
  isTerminalStatus,
  appendStatusHistory,
  initStatusHistory,
  type SOSStatus,
} from '@/lib/sosStatus'

// Shape of the live sos_requests row (inline driver model is canonical).
interface DatabaseSOSRequest {
  id: string
  patient_id: string
  requested_at: string
  assigned_at?: string | null
  completed_at?: string | null
  auto_assigned: boolean
  status: string
  location_lat?: number | null
  location_lon?: number | null
  patient_name?: string | null
  patient_phone?: string | null
  driver_id?: string | null
  driver_name?: string | null
  driver_phone?: string | null
  status_history?: string | null
  created_at?: string
  updated_at?: string
}

export interface SOSRequestStats {
  total: number
  pending: number       // SOS Triggered (awaiting driver)
  assigned: number      // Driver En Route
  in_progress: number   // Transport Arrived + User Picked Up
  completed: number     // Arrived at Hospital
  cancelled: number     // Cancelled
}

/** Free a driver back to the available pool (terminal SOS or unassignment). */
async function releaseDriver(driverUserId?: string | null) {
  if (!driverUserId) return
  await supabase
    .from('drivers')
    .update({ status: 'available', is_available: true, current_request_id: null })
    .eq('user_id', driverUserId)
}

/** Keep the legacy sos_request_assigned junction in sync (back-compat for older readers). */
async function syncAssignmentJunction(sosRequestId: string, driverUserId: string) {
  const { data: existing } = await supabase
    .from('sos_request_assigned')
    .select('id')
    .eq('sos_request_id', sosRequestId)
  const payload = { driver_id: driverUserId, assigned_at: new Date().toISOString() }
  if (existing && existing.length > 0) {
    await supabase.from('sos_request_assigned').update(payload).eq('sos_request_id', sosRequestId)
  } else {
    await supabase.from('sos_request_assigned').insert({ sos_request_id: sosRequestId, ...payload })
  }
}

/* ------------------------------------------------------------------ *
 * No-driver timeout reaper                                           *
 * ------------------------------------------------------------------ *
 * The patient app already times out its own SOS after the configured
 * window — but that timer only runs while the patient's app is open and
 * on the home screen. A request created from a dashboard (ER-team "Create
 * SOS"), or left behind when the app is backgrounded/closed, would
 * otherwise sit in 'SOS Triggered' forever when no driver is available and
 * keep showing as active on every dashboard. This reaper enforces the same
 * timeout server-side. It runs whenever a dashboard fetches the SOS list
 * (reap-on-view) and from /api/cron/expire-sos-requests. */
const DEFAULT_SOS_TIMEOUT_MINUTES = 3
// Reap-on-view fires this from every list fetch (incl. realtime refetches),
// so throttle to at most one sweep per window per runtime instance.
const EXPIRE_THROTTLE_MS = 15_000
let lastExpireRunAt = 0

/** Read the admin-set `sos_request_timeout_minutes` (tolerant of "3", "3 min", …). Falls back to 3. */
async function getSosTimeoutMinutes(): Promise<number> {
  const { data } = await supabase
    .from('configurations')
    .select('value')
    .eq('key', 'sos_request_timeout_minutes')
    .maybeSingle()
  const match = String(data?.value ?? '').trim().match(/-?\d+(?:\.\d+)?/)
  const parsed = match ? parseFloat(match[0]) : NaN
  // A zero / negative / garbage value is an operator typo — never disable the safety net.
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_SOS_TIMEOUT_MINUTES
}

/**
 * Append the terminal 'Timed Out' history entry for a no-driver expiry.
 *
 * Records 'Timed Out' as itself now that the CHECK constraint permits it
 * (migrations/99_updates/sos_lifecycle_timestamps.sql). The actor='system' tag is
 * KEPT even though the status is now self-describing: rows written before that
 * migration are 'Cancelled' + actor='system', and the push classifier still reads
 * the tag to tell those apart from a real user cancel.
 */
function appendTimedOutHistory(existing: unknown): string {
  let arr: Array<Record<string, unknown>> = []
  try {
    if (typeof existing === 'string' && existing.trim()) arr = JSON.parse(existing)
    else if (Array.isArray(existing)) arr = existing as typeof arr
  } catch { arr = [] }
  if (!Array.isArray(arr)) arr = []
  arr.push({
    status: 'Timed Out',
    timestamp: new Date().toISOString(),
    actor: 'system',
    note: 'Timed out — no driver available',
  })
  return JSON.stringify(arr)
}

export class SOSRequestService {
  static async getStats(): Promise<SOSRequestStats> {
    try {
      const { data, error } = await supabase.from('sos_requests').select('status')
      if (error) throw error

      const stats: SOSRequestStats = { total: data.length, pending: 0, assigned: 0, in_progress: 0, completed: 0, cancelled: 0 }
      data.forEach((request) => {
        switch (normalizeSOSStatus(request.status)) {
          case 'SOS Triggered': stats.pending++; break
          case 'Driver En Route': stats.assigned++; break
          case 'Transport Arrived':
          case 'User Picked Up': stats.in_progress++; break
          case 'Arrived at Hospital': stats.completed++; break
          case 'Cancelled': stats.cancelled++; break
        }
      })
      return stats
    } catch (error) {
      console.error('Error fetching SOS request stats:', error)
      throw error
    }
  }

  /**
   * Assign a driver to an SOS request. Writes the canonical inline model
   * (driver_id/name/phone + status 'Driver En Route'), marks the driver busy,
   * appends to status_history, and dual-writes the legacy junction.
   */
  static async assignDriver(
    sosRequestId: string,
    driverUserId: string,
    opts: { autoAssigned?: boolean } = {}
  ): Promise<DatabaseSOSRequest> {
    // 1. Load the request + guard against terminal state.
    const { data: current, error: curErr } = await supabase
      .from('sos_requests')
      .select('id, status, status_history, driver_id')
      .eq('id', sosRequestId)
      .single()
    if (curErr || !current) throw new Error('SOS request not found')
    if (isTerminalStatus(current.status)) throw new Error('Cannot assign a driver to a completed or cancelled request')

    // 2. Resolve the driver (must be a real driver user) + denormalized contact info.
    const { data: driverUser, error: dErr } = await supabase
      .from('users')
      .select('id, full_name, phone, role')
      .eq('id', driverUserId)
      .eq('role', 'driver')
      .single()
    if (dErr || !driverUser) throw new Error('Driver not found or invalid role')

    // 3. Availability guard against the real source of truth (drivers table).
    const { data: driverRow } = await supabase
      .from('drivers')
      .select('status, current_request_id')
      .eq('user_id', driverUserId)
      .maybeSingle()
    if (driverRow && driverRow.status !== 'available' && driverRow.current_request_id !== sosRequestId) {
      throw new Error('Driver is already assigned to another active SOS request')
    }

    // 4. Write canonical inline assignment on the request.
    const { data: updated, error: upErr } = await supabase
      .from('sos_requests')
      .update({
        status: 'Driver En Route',
        assigned_at: new Date().toISOString(),
        auto_assigned: opts.autoAssigned ?? false,
        driver_id: driverUser.id,
        driver_name: driverUser.full_name,
        driver_phone: driverUser.phone,
        status_history: appendStatusHistory(current.status_history, 'Driver En Route'),
      })
      .eq('id', sosRequestId)
      .select()
      .single()
    if (upErr) { console.error('assignDriver: sos update failed', upErr); throw new Error(upErr.message) }

    // 5. Mark the driver busy + dual-write the legacy junction (best-effort).
    await supabase
      .from('drivers')
      .update({ status: 'on_trip', is_available: false, current_request_id: sosRequestId })
      .eq('user_id', driverUser.id)
    try { await syncAssignmentJunction(sosRequestId, driverUser.id) } catch (e) { console.warn('junction sync failed (non-fatal):', e) }

    return updated
  }

  /** Update status with enum normalization, history, timestamps, and driver release on terminal. */
  static async updateStatus(sosRequestId: string, status: string): Promise<DatabaseSOSRequest> {
    const canonical = normalizeSOSStatus(status)
    if (!canonical) throw new Error(`Invalid status value: must be one of ${SOS_STATUSES.join(', ')}`)

    const { data: current, error: curErr } = await supabase
      .from('sos_requests')
      .select('id, status_history, driver_id')
      .eq('id', sosRequestId)
      .single()
    if (curErr || !current) throw new Error('SOS request not found')

    const patch: Record<string, unknown> = {
      status: canonical,
      status_history: appendStatusHistory(current.status_history, canonical),
    }
    if (canonical === 'Arrived at Hospital') patch.completed_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('sos_requests')
      .update(patch)
      .eq('id', sosRequestId)
      .select()
      .single()
    if (error) { console.error('updateStatus: sos update failed', error); throw new Error(error.message) }

    // Free the driver when the request reaches a terminal state.
    if (isTerminalStatus(canonical)) await releaseDriver(current.driver_id)
    return data
  }

  /** Remove a driver assignment and return the request to the unassigned state. */
  static async unassignDriver(sosRequestId: string): Promise<void> {
    const { data: current } = await supabase
      .from('sos_requests')
      .select('driver_id, status_history')
      .eq('id', sosRequestId)
      .single()
    await supabase
      .from('sos_requests')
      .update({
        status: 'SOS Triggered',
        driver_id: null,
        driver_name: null,
        driver_phone: null,
        assigned_at: null,
        status_history: appendStatusHistory(current?.status_history, 'SOS Triggered'),
      })
      .eq('id', sosRequestId)
    await releaseDriver(current?.driver_id)
    await supabase.from('sos_request_assigned').delete().eq('sos_request_id', sosRequestId)
  }

  static async getById(id: string): Promise<DatabaseSOSRequest | null> {
    try {
      const { data, error } = await supabase.from('sos_requests').select('*').eq('id', id).single()
      if (error) {
        if (error.code === 'PGRST116') return null
        throw error
      }
      return data
    } catch (error) {
      console.error('Error fetching SOS request:', error)
      throw error
    }
  }

  static async getAll(): Promise<DatabaseSOSRequest[]> {
    try {
      const { data, error } = await supabase.from('sos_requests').select('*').order('requested_at', { ascending: false })
      if (error) throw error
      return data || []
    } catch (error) {
      console.error('Error fetching SOS requests:', error)
      throw error
    }
  }

  static async create(sosRequest: Partial<DatabaseSOSRequest>): Promise<DatabaseSOSRequest> {
    try {
      const status: SOSStatus = normalizeSOSStatus(sosRequest.status) ?? 'SOS Triggered'
      const { data, error } = await supabase
        .from('sos_requests')
        .insert([{
          ...sosRequest,
          status,
          requested_at: sosRequest.requested_at ?? new Date().toISOString(),
          status_history: sosRequest.status_history ?? initStatusHistory(status),
        }])
        .select()
        .single()
      if (error) throw error
      return data
    } catch (error) {
      console.error('Error creating SOS request:', error)
      throw error
    }
  }

  static async delete(id: string): Promise<void> {
    try {
      const { error } = await supabase.from('sos_requests').delete().eq('id', id)
      if (error) throw error
    } catch (error) {
      console.error('Error deleting SOS request:', error)
      throw error
    }
  }

  /**
   * Auto-reset stale no-driver requests (the "workflow reset" timeout enforced
   * server-side). Flips every request still in 'SOS Triggered' with no driver
   * assigned and older than the admin-configurable `sos_request_timeout_minutes`
   * to the constraint-safe terminal 'Cancelled', tagging the status_history entry
   * actor='system' / 'Timed out — no driver available' so it stays distinguishable
   * from a deliberate user cancel. Throttled per runtime instance; the cron
   * endpoint passes { force: true } to bypass the throttle.
   */
  static async expireStaleRequests(opts: { force?: boolean } = {}): Promise<{ expired: number; error?: string }> {
    const now = Date.now()
    if (!opts.force && now - lastExpireRunAt < EXPIRE_THROTTLE_MS) return { expired: 0 }
    lastExpireRunAt = now

    try {
      const minutes = await getSosTimeoutMinutes()
      const cutoffIso = new Date(now - minutes * 60_000).toISOString()

      // Stale = still awaiting a driver (none assigned) past the timeout window.
      const { data: stale, error: selErr } = await supabase
        .from('sos_requests')
        .select('id, status_history')
        .eq('status', 'SOS Triggered')
        .is('driver_id', null)
        .lt('requested_at', cutoffIso)

      if (selErr) {
        console.error('expireStaleRequests: select failed', selErr)
        return { expired: 0, error: selErr.message }
      }
      if (!stale?.length) return { expired: 0 }

      let expired = 0
      for (const row of stale) {
        // Guarded update: only flip a row that is STILL unassigned 'SOS Triggered',
        // so a driver who accepted in the race between this select and update is not
        // clobbered (the guarded predicate then matches 0 rows and we skip it).
        const history = appendTimedOutHistory(row.status_history)
        const expireWith = (status: string) =>
          supabase
            .from('sos_requests')
            .update({ status, status_history: history })
            .eq('id', row.id)
            .eq('status', 'SOS Triggered')
            .is('driver_id', null)
            .select('id')

        let { data: updated, error: updErr } = await expireWith('Timed Out')

        // 23514 = check_violation: this database has not had
        // migrations/99_updates/sos_lifecycle_timestamps.sql applied yet, so
        // 'Timed Out' is not a permitted status. Fall back to the old down-mapped
        // 'Cancelled' rather than leaving the request live — an un-expired request
        // keeps sirening on every nearby driver's phone, which is the exact failure
        // this reaper exists to prevent. The actor='system' tag in the history above
        // still marks it as a timeout, so nothing downstream misreads it as a user
        // cancel. Logged at error level: this should never be the steady state.
        if (updErr?.code === '23514') {
          console.error(
            `expireStaleRequests: 'Timed Out' rejected by the status CHECK constraint — apply migrations/99_updates/sos_lifecycle_timestamps.sql. Falling back to 'Cancelled' for ${row.id}.`
          )
          ;({ data: updated, error: updErr } = await expireWith('Cancelled'))
        }

        if (updErr) {
          console.error(`expireStaleRequests: update ${row.id} failed`, updErr)
          continue
        }
        if (updated?.length) expired++
      }
      if (expired) {
        console.log(`⏱️ expireStaleRequests: timed out ${expired} no-driver SOS request(s) older than ${minutes}m`)
      }
      return { expired }
    } catch (e) {
      console.error('expireStaleRequests: unexpected error', e)
      return { expired: 0, error: e instanceof Error ? e.message : 'unknown error' }
    }
  }
}
