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
    // Nobody was ever assigned, and the SYSTEM (not the patient) ended it → the
    // patient is still waiting and does not know help isn't coming; their contacts
    // don't either. Checked first so a timeout is never misread as a user cancel.
    if (isSystemTimeout(row, newStatus)) return 'sos.no_driver'

    // Otherwise the request was cancelled — by the patient, or after a driver was
    // already assigned. Two audiences hang off this:
    //   • an assigned driver (oldDriverId) must STAND DOWN — the highest-consequence
    //     miss in the system, or a driver keeps blue-lighting to a dead emergency;
    //   • the emergency contacts, who were alerted on sos.created, get the ALL-CLEAR
    //     even when the patient cancelled before any driver accepted — otherwise they
    //     are left believing an emergency is still active.
    // The patient themselves is deliberately NOT in this event's push audience (they
    // did it and are looking at the screen); the driver/contact audiences handle it.
    return 'sos.cancelled'
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

/**
 * Every live FCM token for a set of users, across ALL their devices.
 *
 * Unions two sources and de-duplicates:
 *   - device_tokens: the multi-device store (one row per physical device), the
 *     source of truth once the new APK ships.
 *   - users.fcm_token: the legacy single-token column, still written by every app
 *     build in parallel during the rollout.
 * Reading both means push keeps working no matter which side (DB migration / new
 * APK) is deployed first, and a device on an older build is still reachable.
 *
 * Only tokens belonging to ACTIVE users are returned — an active-user set is
 * resolved first and device tokens are filtered against it, so a deactivated
 * account is never pushed to even if a stale device row lingers.
 */
async function tokensForUsers(
  supabase: ReturnType<typeof createClient>,
  userIds: string[]
): Promise<string[]> {
  const ids = Array.from(new Set(userIds.filter(Boolean)))
  if (ids.length === 0) return []

  const tokens = new Set<string>()

  // Active users + their legacy token in one read.
  const { data: users, error: usersErr } = await supabase
    .from('users')
    .select('id, fcm_token')
    .in('id', ids)
    .eq('is_active', true)

  if (usersErr) {
    console.error('[push] failed to load users for token lookup', usersErr)
    return []
  }

  const activeIds: string[] = []
  for (const u of users ?? []) {
    const row = u as { id: string; fcm_token: string | null }
    activeIds.push(row.id)
    if (row.fcm_token) tokens.add(row.fcm_token)
  }
  if (activeIds.length === 0) return []

  // Every active device row for those active users. A missing table (migration not
  // applied yet) degrades to the legacy column above rather than failing the send.
  const { data: devices, error: devErr } = await supabase
    .from('device_tokens')
    .select('token')
    .in('user_id', activeIds)
    .eq('is_active', true)

  if (devErr) {
    console.warn('[push] device_tokens lookup failed (using legacy tokens only)', devErr.message)
  } else {
    for (const d of devices ?? []) {
      const token = (d as { token: string | null }).token
      if (token) tokens.add(token)
    }
  }

  return [...tokens]
}

/** Every live FCM token of a single user, across all their devices. */
async function tokenForUser(
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string[]> {
  if (!userId) return []
  return tokensForUsers(supabase, [userId])
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
    .select('user_id, current_latitude, current_longitude, status')
    .eq('status', 'available')

  if (error) {
    console.error('[push] failed to load available drivers', error)
    return []
  }

  const radiusKm = await getRadiusKm(supabase)
  const sosLat = row.location_lat
  const sosLon = row.location_lon

  const eligibleUserIds: string[] = []
  let outOfRange = 0
  let noLocation = 0

  for (const d of data ?? []) {
    if (!d.user_id) continue

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

    eligibleUserIds.push(d.user_id)
  }

  // Resolve every eligible driver's tokens across all their devices (active users
  // only). Done in one batched lookup rather than per-driver.
  const tokens = await tokensForUsers(supabase, eligibleUserIds)

  if (outOfRange || noLocation) {
    console.log(
      `[push] sos.created audience: ${eligibleUserIds.length} driver(s) / ${tokens.length} device(s) — ${outOfRange} outside ${radiusKm}km, ${noLocation} included without coordinates (fail-open)`
    )
  }

  return tokens
}

/**
 * Tokens of this patient's emergency contacts who resolve to a real, active user
 * account with a live device token.
 *
 * The link is emergency_contacts.contact_user_id → users.id, populated by the DB
 * triggers in emergency_contact_user_linking.sql whenever a contact's email matches
 * an account (whether that account already existed when it was added, or signs up
 * later). This is the fix for the old model, which only tagged users.invited_by_user_id
 * at a brand-new account's signup and therefore never reached contacts who were already
 * registered when they were added. Contacts with no matching account (no email, or an
 * email nobody has registered) have contact_user_id = NULL and are unreachable by push —
 * they still get the alert EMAIL, which keys off emergency_contacts.email directly.
 *
 * Two queries + JS merge (PostgREST nested embeds are unreliable DB-wide here).
 * `exclude` drops any token already in the primary audience so nobody is double-pushed.
 */
async function tokensForPatientEmergencyContacts(
  supabase: ReturnType<typeof createClient>,
  patientUserId: string | null,
  exclude: string[] = []
): Promise<string[]> {
  if (!patientUserId) return []

  // 1. Which of this patient's contacts are linked to an account?
  const { data: contacts, error: contactErr } = await supabase
    .from('emergency_contacts')
    .select('contact_user_id')
    .eq('patient_id', patientUserId)
    .not('contact_user_id', 'is', null)

  if (contactErr) {
    // Most likely the linking migration hasn't been applied yet (column missing).
    // Degrade quietly — the email path still reaches contacts.
    console.error('[push] failed to load linked emergency contacts', contactErr)
    return []
  }

  const contactUserIds = Array.from(
    new Set(
      (contacts ?? [])
        .map((c) => (c as { contact_user_id: string | null }).contact_user_id)
        .filter((id): id is string => !!id)
    )
  )
  if (contactUserIds.length === 0) return []

  // 2. Their live device tokens (all devices, both sources), minus any already in
  //    the primary audience so nobody is double-pushed.
  const excluded = new Set(exclude)
  const tokens = await tokensForUsers(supabase, contactUserIds)
  return tokens.filter((t) => !excluded.has(t))
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
 * SOS lifecycle events an emergency contact is EMAILED about — the milestones that
 * change what a contact should DO: the initial alert (act / call 108), the all-clear
 * on hospital arrival, a cancellation (stand down), and — most important — a
 * no-driver outcome (help isn't coming; check on them / call 108). The intermediate
 * en-route transitions are push-only to avoid email fatigue. Reaches every contact
 * with an email address, app-installed or not.
 */
const EMAIL_EVENTS = new Set<SOSPushEvent>([
  'sos.created',
  'sos.arrived_hospital',
  'sos.cancelled',
  'sos.no_driver',
])

/**
 * The email `kind` (copy variant in sendSOSContactAlertEmails) for each emailed
 * event. Kept explicit so a cancellation / no-driver outcome is NEVER sent with the
 * "safely arrived at hospital" all-clear copy.
 */
const EMAIL_KIND: Partial<Record<SOSPushEvent, 'triggered' | 'resolved' | 'cancelled' | 'no_driver'>> = {
  'sos.created': 'triggered',
  'sos.arrived_hospital': 'resolved',
  'sos.cancelled': 'cancelled',
  'sos.no_driver': 'no_driver',
}

/**
 * SOS lifecycle events an app-installed emergency contact is push-notified about —
 * the full lifecycle including the two endings (cancelled / no-driver), so a contact
 * who was alerted on sos.created always hears how it ended.
 */
const CONTACT_EVENTS = new Set<SOSPushEvent>([
  'sos.created',
  'sos.accepted',
  'sos.transport_arrived',
  'sos.picked_up',
  'sos.arrived_hospital',
  'sos.cancelled',
  'sos.no_driver',
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
    case 'sos.cancelled':
      return {
        title: `${patient}'s SOS was cancelled`,
        body: `The emergency request for ${patient} has been cancelled. No transport is being dispatched.`,
        data,
      }
    case 'sos.no_driver':
      return {
        title: `No driver found for ${patient}`,
        body: `We could not find a driver for ${patient}'s SOS. Please check on them, or call 108.`,
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

/**
 * Stop pushing to tokens FCM has told us are permanently dead. Prunes BOTH stores:
 * the per-device row (deleted) and the legacy users.fcm_token column (nulled), so a
 * dead token can't survive in either place.
 */
async function pruneInvalidTokens(
  supabase: ReturnType<typeof createClient>,
  tokens: string[]
): Promise<void> {
  if (tokens.length === 0) return

  const { error: devErr } = await supabase
    .from('device_tokens')
    .delete()
    .in('token', tokens)
  if (devErr) console.warn('[push] failed to prune invalid device_tokens', devErr.message)

  const { error: legacyErr } = await supabase
    .from('users')
    .update({ fcm_token: null, fcm_token_updated_at: null })
    .in('fcm_token', tokens)
  if (legacyErr) console.warn('[push] failed to prune invalid legacy tokens', legacyErr.message)

  if (!devErr || !legacyErr) console.log(`[push] pruned ${tokens.length} unregistered token(s)`)
}

/**
 * Record one send attempt's outcome (counts only — no tokens, no PII) so delivery
 * health is queryable instead of scattered across function logs. Best-effort: a
 * logging failure (e.g. the table not migrated yet) must never affect the push.
 */
async function logDelivery(
  supabase: ReturnType<typeof createClient>,
  entry: {
    requestId: string
    event: SOSPushEvent
    audience: 'primary' | 'contact'
    recipients: number
    sent: number
    failed: number
    invalid: number
    notConfigured: boolean
  }
): Promise<void> {
  if (entry.recipients === 0) return
  try {
    const { error } = await supabase.from('push_deliveries').insert({
      request_id: entry.requestId,
      event: entry.event,
      audience: entry.audience,
      recipients: entry.recipients,
      sent: entry.sent,
      failed: entry.failed,
      invalid: entry.invalid,
      not_configured: entry.notConfigured,
    })
    if (error) console.warn('[push] failed to log delivery', error.message)
  } catch (err) {
    console.warn('[push] logDelivery threw', err)
  }
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
        kind: EMAIL_KIND[event] ?? 'triggered',
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
    await logDelivery(supabase, {
      requestId: row.id,
      event,
      audience: 'primary',
      recipients: tokens.length,
      sent: result.sent,
      failed: result.failed,
      invalid: result.invalidTokens.length,
      notConfigured: !!result.notConfigured,
    })
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
    await logDelivery(supabase, {
      requestId: row.id,
      event,
      audience: 'contact',
      recipients: contactTokens.length,
      sent: result.sent,
      failed: result.failed,
      invalid: result.invalidTokens.length,
      notConfigured: !!result.notConfigured,
    })
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
