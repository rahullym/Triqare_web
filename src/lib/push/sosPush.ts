// SOS → push domain logic: classify a status transition into an event, work out
// who needs to hear about it, and send.
//
// Every SOS write path in the system (patient app, driver app, ER-team dashboard,
// timeout reaper) lands here via the notify_push_on_sos_change DB trigger, so this
// is the single definition of "what gets a push".

import { createClient } from '@/lib/supabase/server'
import { sendToTokens, type PushPayload } from './fcm'
import { sendSOSContactAlertEmails } from '@/lib/email/sendApplicationEmails'

/** Matches the driver app's fallback in app/(driver)/index.tsx. */
const DEFAULT_RADIUS_KM = 30

export interface SOSTransition {
  requestId: string
  /** null on create. */
  oldStatus: string | null
  newStatus: string
  oldDriverId: string | null
  newDriverId: string | null
}

export type SOSPushEvent =
  | 'sos.created'
  | 'sos.accepted'
  | 'sos.transport_arrived'
  | 'sos.picked_up'
  | 'sos.arrived_hospital'
  | 'sos.no_driver'
  | 'sos.cancelled'

export interface DispatchResult {
  event: SOSPushEvent | null
  recipients: number
  sent: number
  failed: number
  /** Emergency-contact alert emails attempted for this event (best-effort, fire-and-forget). */
  emailed?: number
  /**
   * Set when the sender itself is not configured (FIREBASE_SERVICE_ACCOUNT missing
   * or unparseable on this deploy) — i.e. nothing was sent because we couldn't even
   * initialise Firebase, NOT because FCM rejected anything. Surfaced in the webhook
   * response so a misconfigured deploy is obvious instead of looking like a
   * delivery failure.
   */
  notConfigured?: boolean
  /** Diagnostic only: 'missing' (env unset) vs 'unparseable' (set but mangled), + raw length. */
  configReason?: 'missing' | 'unparseable'
  configLen?: number
}

interface SOSRow {
  id: string
  status: string
  patient_id: string
  patient_name: string | null
  driver_id: string | null
  driver_name: string | null
  driver_phone: string | null
  location_lat: number | null
  location_lon: number | null
  status_history: string | null
}

const TERMINAL_STATUSES = new Set(['Cancelled', 'Timed Out'])

/**
 * A no-driver timeout is persisted as 'Cancelled' (the CHECK constraint historically
 * had no 'Timed Out' value, and both writers still down-map), and is distinguished
 * from a deliberate user cancel ONLY by the actor tag on the last status_history
 * entry. Both the mobile timeout path and the server-side reaper tag it actor='system'.
 */
function isSystemTimeout(row: SOSRow, newStatus: string): boolean {
  if (newStatus === 'Timed Out') return true

  try {
    const history = row.status_history ? JSON.parse(row.status_history) : []
    if (!Array.isArray(history) || history.length === 0) return false
    return history[history.length - 1]?.actor === 'system'
  } catch {
    return false
  }
}

/** Which event, if any, this transition represents. */
export function classify(row: SOSRow, t: SOSTransition): SOSPushEvent | null {
  const { oldStatus, newStatus, oldDriverId } = t

  // Creation.
  if (oldStatus === null) {
    return newStatus === 'SOS Triggered' ? 'sos.created' : null
  }

  if (newStatus === 'Driver En Route') return 'sos.accepted'
  if (newStatus === 'Transport Arrived') return 'sos.transport_arrived'
  if (newStatus === 'User Picked Up') return 'sos.picked_up'
  if (newStatus === 'Arrived at Hospital') return 'sos.arrived_hospital'

  if (TERMINAL_STATUSES.has(newStatus)) {
    // A driver was already on the way and the request ended → they must stand down.
    // This is the highest-consequence miss in the whole system: without it a driver
    // keeps blue-lighting to an emergency that no longer exists.
    if (oldDriverId) return 'sos.cancelled'

    // Nobody was ever assigned, and the system (not the patient) ended it → the
    // patient is still waiting and does not know help isn't coming.
    if (isSystemTimeout(row, newStatus)) return 'sos.no_driver'

    // Patient cancelled before any driver accepted. They did it themselves and are
    // looking at the screen — nothing to tell anyone.
    return null
  }

  // Any other transition (e.g. a no-op re-write of the same status) is not a
  // push event.
  return null
}

/** Haversine, km. */
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

async function getRadiusKm(supabase: ReturnType<typeof createClient>): Promise<number> {
  const { data } = await supabase
    .from('configurations')
    .select('value')
    .eq('key', 'driver_sos_request_radius_km')
    .maybeSingle()

  const match = String(data?.value ?? '').trim().match(/-?\d+(?:\.\d+)?/)
  const parsed = match ? parseFloat(match[0]) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RADIUS_KM
}

/** FCM token of a single user, if they have one and are still active. */
async function tokenForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string[]> {
  if (!userId) return []
  const { data } = await supabase
    .from('users')
    .select('fcm_token, is_active')
    .eq('id', userId)
    .maybeSingle()

  return data?.fcm_token && data.is_active ? [data.fcm_token] : []
}

/**
 * Tokens of every driver who could take this request: online, active, has a device
 * token, and within the dispatch radius.
 *
 * Fails OPEN on missing coordinates — a driver with no last-known location, or an
 * SOS with no coordinates, still gets the push. Reaching one driver too many is
 * recoverable (the app's own radius filter hides the request); reaching none is not.
 */
async function tokensForNearbyDrivers(
  supabase: ReturnType<typeof createClient>,
  row: SOSRow
): Promise<string[]> {
  const { data, error } = await supabase
    .from('drivers')
    .select('user_id, current_latitude, current_longitude, status, users!inner(fcm_token, is_active)')
    .eq('status', 'available')

  if (error) {
    console.error('[push] failed to load available drivers', error)
    return []
  }

  const radiusKm = await getRadiusKm(supabase)
  const sosLat = row.location_lat
  const sosLon = row.location_lon

  const tokens: string[] = []
  let outOfRange = 0
  let noLocation = 0

  for (const d of data ?? []) {
    // Supabase types the !inner embed as an array; it is 1:1 here (drivers.user_id PK).
    const user = (Array.isArray(d.users) ? d.users[0] : d.users) as
      | { fcm_token: string | null; is_active: boolean }
      | undefined

    if (!user?.fcm_token || !user.is_active) continue

    const hasDriverLoc = d.current_latitude != null && d.current_longitude != null
    const hasSosLoc = sosLat != null && sosLon != null

    if (hasDriverLoc && hasSosLoc) {
      const km = distanceKm(Number(d.current_latitude), Number(d.current_longitude), sosLat, sosLon)
      if (km > radiusKm) {
        outOfRange++
        continue
      }
    } else {
      noLocation++
    }

    tokens.push(user.fcm_token)
  }

  if (outOfRange || noLocation) {
    console.log(
      `[push] sos.created audience: ${tokens.length} driver(s) — ${outOfRange} outside ${radiusKm}km, ${noLocation} included without coordinates (fail-open)`
    )
  }

  return tokens
}

/**
 * Tokens of this patient's emergency contacts who have their OWN app account and a
 * live device token. A contact is linked when they accept the invite and sign up:
 * their users row is tagged account_type='emergency_contact' + invited_by_user_id =
 * the patient's user id (mobile linkInvitedEmergencyContactAccount does this).
 * Phone-only contacts who never installed the app have no account/token and are
 * unreachable here.
 *
 * `exclude` drops any token already in the primary audience so nobody is double-pushed.
 */
async function tokensForPatientEmergencyContacts(
  supabase: ReturnType<typeof createClient>,
  patientUserId: string | null,
  exclude: string[] = []
): Promise<string[]> {
  if (!patientUserId) return []

  const { data, error } = await supabase
    .from('users')
    .select('fcm_token')
    .eq('invited_by_user_id', patientUserId)
    .eq('account_type', 'emergency_contact')
    .eq('is_active', true)
    .not('fcm_token', 'is', null)

  if (error) {
    console.error('[push] failed to load emergency-contact accounts', error)
    return []
  }

  const excluded = new Set(exclude)
  const tokens: string[] = []
  for (const r of data ?? []) {
    const token = (r as { fcm_token: string | null }).fcm_token
    if (token && !excluded.has(token)) tokens.push(token)
  }
  return tokens
}

/**
 * Email addresses of ALL this patient's emergency contacts (the emergency_contacts
 * table), regardless of whether they installed the app. This is the channel that
 * reaches phone/email-only contacts the push path cannot. `emergency_contacts.patient_id`
 * references patients(user_id) = users.id = sos_requests.patient_id, so we key off the
 * same id the push audience uses.
 */
async function emailsForPatientEmergencyContacts(
  supabase: ReturnType<typeof createClient>,
  patientUserId: string | null
): Promise<string[]> {
  if (!patientUserId) return []

  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('email')
    .eq('patient_id', patientUserId)
    .not('email', 'is', null)

  if (error) {
    console.error('[push] failed to load emergency-contact emails', error)
    return []
  }

  const emails: string[] = []
  for (const r of data ?? []) {
    const email = (r as { email: string | null }).email?.trim()
    if (email) emails.push(email)
  }
  return emails
}

/**
 * SOS lifecycle events an emergency contact is EMAILED about — the essential pair:
 * the initial alert (they may need to act / call 108) and the all-clear on hospital
 * arrival. Deliberately narrower than CONTACT_EVENTS to avoid emailing every
 * intermediate transition (email fatigue + deliverability). Reaches every contact
 * with an email address, app-installed or not.
 */
const EMAIL_EVENTS = new Set<SOSPushEvent>(['sos.created', 'sos.arrived_hospital'])

/**
 * SOS lifecycle events an app-installed emergency contact is notified about. Covers
 * the full positive lifecycle; sos.no_driver / sos.cancelled are intentionally left
 * out under the current scope (add them here + a buildContactPayload case to include).
 */
const CONTACT_EVENTS = new Set<SOSPushEvent>([
  'sos.created',
  'sos.accepted',
  'sos.transport_arrived',
  'sos.picked_up',
  'sos.arrived_hospital',
])

function buildPayload(event: SOSPushEvent, row: SOSRow): PushPayload {
  const patient = row.patient_name?.trim() || 'A patient'
  const driver = row.driver_name?.trim() || 'Your driver'

  switch (event) {
    case 'sos.created':
      return {
        title: '🚨 New SOS request',
        body: `${patient} needs emergency transport. Tap to view and accept.`,
        data: {
          type: 'sos_new_request',
          requestId: row.id,
          ...(row.patient_name ? { patientName: row.patient_name } : {}),
          ...(row.location_lat != null ? { latitude: String(row.location_lat) } : {}),
          ...(row.location_lon != null ? { longitude: String(row.location_lon) } : {}),
        },
      }

    case 'sos.accepted':
      return {
        title: 'Driver on the way',
        body: `${driver} accepted your SOS and is en route to you.`,
        data: {
          type: 'sos_accepted',
          requestId: row.id,
          ...(row.driver_name ? { driverName: row.driver_name } : {}),
          ...(row.driver_phone ? { driverPhone: row.driver_phone } : {}),
        },
      }

    case 'sos.transport_arrived':
      return {
        title: 'Your ambulance has arrived',
        body: `${driver} is at your pickup location.`,
        data: { type: 'sos_transport_arrived', requestId: row.id },
      }

    case 'sos.picked_up':
      return {
        title: 'On the way to hospital',
        body: `${driver} has picked you up and is heading to the hospital.`,
        data: { type: 'sos_picked_up', requestId: row.id },
      }

    case 'sos.arrived_hospital':
      return {
        title: 'Arrived at hospital',
        body: 'You have reached the hospital. Stay safe — your SOS is now complete.',
        data: { type: 'sos_arrived_hospital', requestId: row.id },
      }

    case 'sos.no_driver':
      return {
        title: 'No driver available',
        body: 'We could not find a driver for your SOS. Please call 108 immediately.',
        data: { type: 'sos_no_driver', requestId: row.id },
      }

    case 'sos.cancelled':
      return {
        title: 'SOS cancelled',
        body: `${patient} cancelled this request. You can stand down.`,
        data: { type: 'sos_cancelled', requestId: row.id },
      }
  }
}

/**
 * Contact-facing copy for the SOS lifecycle. Distinct from buildPayload (which speaks
 * to the patient/driver): a contact hears about SOMEONE ELSE's emergency, so every
 * line names the patient. All events share the `sos_contact_alert` type; the mobile
 * app routes it to the patient home (a contact holds a normal patient account).
 */
function buildContactPayload(event: SOSPushEvent, row: SOSRow): PushPayload {
  const patient = row.patient_name?.trim() || 'Someone you are an emergency contact for'
  const driver = row.driver_name?.trim() || 'A driver'
  const data: Record<string, string> = {
    type: 'sos_contact_alert',
    event,
    requestId: row.id,
    ...(row.patient_name ? { patientName: row.patient_name } : {}),
  }

  switch (event) {
    case 'sos.accepted':
      return {
        title: `Help is on the way for ${patient}`,
        body: `${driver} accepted the SOS and is en route to ${patient}.`,
        data,
      }
    case 'sos.transport_arrived':
      return {
        title: `Ambulance reached ${patient}`,
        body: `${driver} has arrived at ${patient}'s location.`,
        data,
      }
    case 'sos.picked_up':
      return {
        title: `${patient} is on the way to hospital`,
        body: `${driver} picked up ${patient} and is heading to the hospital.`,
        data,
      }
    case 'sos.arrived_hospital':
      return {
        title: `${patient} arrived at the hospital`,
        body: `${patient} has reached the hospital. The SOS is now complete.`,
        data,
      }
    case 'sos.created':
    default:
      return {
        title: `🚨 ${patient} triggered an SOS`,
        body: `${patient} has requested emergency transport. We'll keep you updated.`,
        data,
      }
  }
}

/** Stop pushing to tokens FCM has told us are permanently dead. */
async function pruneInvalidTokens(
  supabase: ReturnType<typeof createClient>,
  tokens: string[]
): Promise<void> {
  if (tokens.length === 0) return
  const { error } = await supabase
    .from('users')
    .update({ fcm_token: null, fcm_token_updated_at: null })
    .in('fcm_token', tokens)

  if (error) console.warn('[push] failed to prune invalid tokens', error)
  else console.log(`[push] pruned ${tokens.length} unregistered token(s)`)
}

/**
 * Entry point: turn one SOS transition into zero or more pushes.
 * Never throws — the caller is a webhook that must always answer 200.
 */
export async function dispatchSOSPush(t: SOSTransition): Promise<DispatchResult> {
  const empty: DispatchResult = { event: null, recipients: 0, sent: 0, failed: 0 }
  const supabase = createClient()

  const { data: row, error } = await supabase
    .from('sos_requests')
    .select(
      'id, status, patient_id, patient_name, driver_id, driver_name, driver_phone, location_lat, location_lon, status_history'
    )
    .eq('id', t.requestId)
    .maybeSingle<SOSRow>()

  if (error || !row) {
    console.error(`[push] sos_request ${t.requestId} not found`, error)
    return empty
  }

  const event = classify(row, t)
  if (!event) return empty

  // Primary audience for this event.
  //
  // The row we just re-read is authoritative; the trigger's driver_id can already be
  // stale by the time we run. For a stand-down we must reach the driver who WAS
  // assigned at the moment of the transition, which only the trigger knows.
  const tokens =
    event === 'sos.created'
      ? await tokensForNearbyDrivers(supabase, row)
      : event === 'sos.cancelled'
        ? await tokenForUser(supabase, t.oldDriverId)
        : await tokenForUser(supabase, row.patient_id)

  // Secondary audience: the patient's app-installed emergency contacts, for the
  // lifecycle events they follow. Independent of `tokens` — contacts must still hear
  // "SOS triggered" even when no driver is nearby — and de-duplicated against it.
  const contactTokens = CONTACT_EVENTS.has(event)
    ? await tokensForPatientEmergencyContacts(supabase, row.patient_id, tokens)
    : []

  // Email audience: ALL emergency contacts with an email address (app-installed or
  // not), for the alert + all-clear events. Independent of the push audience, so it
  // must run BEFORE the "no push recipients" early-return below — a patient may have
  // emailable contacts but no nearby driver and no app-installed contact. Awaited
  // (not fire-and-forget) because on serverless an un-awaited send is killed when the
  // handler returns; sendSOSContactAlertEmails swallows its own errors so it never
  // throws or blocks the push result.
  let emailed = 0
  if (EMAIL_EVENTS.has(event)) {
    const contactEmails = await emailsForPatientEmergencyContacts(supabase, row.patient_id)
    if (contactEmails.length > 0) {
      await sendSOSContactAlertEmails({
        recipients: contactEmails,
        patientName: row.patient_name,
        kind: event === 'sos.created' ? 'triggered' : 'resolved',
        location:
          row.location_lat != null && row.location_lon != null
            ? { lat: row.location_lat, lon: row.location_lon }
            : null,
      })
      emailed = contactEmails.length
      console.log(`[push] ${event} for ${row.id}: ${emailed} emergency-contact alert email(s) queued`)
    }
  }

  if (tokens.length === 0 && contactTokens.length === 0) {
    console.log(`[push] ${event} for ${row.id}: no push recipients`)
    return { event, recipients: 0, sent: 0, failed: 0, ...(emailed ? { emailed } : {}) }
  }

  let sent = 0
  let failed = 0
  let notConfigured = false
  let configReason: 'missing' | 'unparseable' | undefined
  let configLen: number | undefined
  const invalidTokens: string[] = []

  if (tokens.length > 0) {
    const result = await sendToTokens(tokens, buildPayload(event, row))
    sent += result.sent
    failed += result.failed
    invalidTokens.push(...result.invalidTokens)
    if (result.notConfigured) {
      notConfigured = true
      configReason = result.configReason
      configLen = result.configLen
    } else {
      console.log(
        `[push] ${event} for ${row.id}: ${result.sent}/${tokens.length} delivered${result.failed ? `, ${result.failed} failed` : ''}`
      )
    }
  }

  if (contactTokens.length > 0) {
    const result = await sendToTokens(contactTokens, buildContactPayload(event, row))
    sent += result.sent
    failed += result.failed
    invalidTokens.push(...result.invalidTokens)
    if (result.notConfigured) {
      notConfigured = true
      configReason = result.configReason
      configLen = result.configLen
    } else {
      console.log(
        `[push] ${event} for ${row.id}: ${result.sent}/${contactTokens.length} emergency-contact(s) notified`
      )
    }
  }

  await pruneInvalidTokens(supabase, invalidTokens)

  if (notConfigured) {
    // Loud and unambiguous: nothing was sent because the SENDER is misconfigured
    // on this deploy, not because FCM refused anything.
    console.error(
      `[push] ${event} for ${row.id}: NOT SENT — FIREBASE_SERVICE_ACCOUNT missing/unparseable on this deploy (set it and redeploy)`
    )
  }

  return {
    event,
    recipients: tokens.length + contactTokens.length,
    sent,
    failed,
    ...(emailed ? { emailed } : {}),
    ...(notConfigured ? { notConfigured: true, configReason, configLen } : {}),
  }
}
