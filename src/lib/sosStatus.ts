// Canonical SOS request status workflow — must match the DB CHECK constraint
// (migrations/99_updates/update_sos_status_workflow.sql).
//
//   SOS Triggered → Driver En Route → Transport Arrived → User Picked Up → Arrived at Hospital
//                                                                       ↘ Cancelled (any stage)
//
// Legacy snake_case values (pending/assigned/in_progress/completed/cancelled) appear
// throughout older code and clients; normalizeSOSStatus() maps them to the canonical
// values so the DB constraint is never violated.

export const SOS_STATUSES = [
  'SOS Triggered',
  'Driver En Route',
  'Transport Arrived',
  'User Picked Up',
  'Arrived at Hospital',
  'Cancelled',
  // Expiry as its own terminal state: a no-driver timeout is NOT a user cancel, and
  // reporting/copy had been telling them apart by sniffing status_history for an
  // actor='system' tag. See migrations/99_updates/sos_lifecycle_timestamps.sql.
  'Timed Out',
] as const

export type SOSStatus = (typeof SOS_STATUSES)[number]

const CANONICAL = new Set<string>(SOS_STATUSES)

// legacy / alias → canonical
const LEGACY_MAP: Record<string, SOSStatus> = {
  pending: 'SOS Triggered',
  triggered: 'SOS Triggered',
  sos_triggered: 'SOS Triggered',
  assigned: 'Driver En Route',
  accepted: 'Driver En Route',
  en_route: 'Driver En Route',
  driver_en_route: 'Driver En Route',
  arrived: 'Transport Arrived',
  transport_arrived: 'Transport Arrived',
  in_progress: 'User Picked Up',
  picked_up: 'User Picked Up',
  user_picked_up: 'User Picked Up',
  completed: 'Arrived at Hospital',
  arrived_at_hospital: 'Arrived at Hospital',
  cancelled: 'Cancelled',
  canceled: 'Cancelled',
  timed_out: 'Timed Out',
  timedout: 'Timed Out',
  expired: 'Timed Out',
}

/** Returns the canonical status for any input, or null if unrecognized. */
export function normalizeSOSStatus(input?: string | null): SOSStatus | null {
  if (!input) return null
  if (CANONICAL.has(input)) return input as SOSStatus
  const key = input.toLowerCase().trim().replace(/\s+/g, '_')
  return LEGACY_MAP[key] ?? null
}

/**
 * Terminal states end the request lifecycle. A request in one of these is never
 * reactivated and never redistributed to drivers as a new emergency.
 *
 * Exported as a list too, because several queries need it as a value (history
 * listings, `.in()` filters) and hand-written copies of it are what let 'Timed Out'
 * go missing from half the codebase in the first place.
 */
export const SOS_TERMINAL_STATUSES = [
  'Arrived at Hospital',
  'Cancelled',
  'Timed Out',
] as const satisfies readonly SOSStatus[]

export function isTerminalStatus(status?: string | null): boolean {
  return (SOS_TERMINAL_STATUSES as readonly string[]).includes(status ?? '')
}

export function isActiveStatus(status?: string | null): boolean {
  return !!status && !isTerminalStatus(status)
}

/** Append an entry to the JSON-string status_history column. Tolerant of bad input. */
export function appendStatusHistory(existing: unknown, status: string): string {
  let arr: Array<{ status: string; timestamp: string }> = []
  try {
    if (typeof existing === 'string' && existing.trim()) arr = JSON.parse(existing)
    else if (Array.isArray(existing)) arr = existing as typeof arr
  } catch {
    arr = []
  }
  if (!Array.isArray(arr)) arr = []
  arr.push({ status, timestamp: new Date().toISOString() })
  return JSON.stringify(arr)
}

export function initStatusHistory(status: SOSStatus = 'SOS Triggered'): string {
  return JSON.stringify([{ status, timestamp: new Date().toISOString() }])
}
