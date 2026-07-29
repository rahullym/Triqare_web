import { describe, expect, it } from 'vitest'
import {
  buildPatientConfirmationPayload,
  classify,
  remainingLifetimeSeconds,
} from '@/lib/push/sosPush'

// `classify` and `remainingLifetimeSeconds` are the two decisions that determine
// whether a phone sirens. Both are pure, and both have already been the site of a
// real incident: a two-day-old SOS reaching a driver as a live emergency.

type Row = Parameters<typeof classify>[0]

const NOW = Date.parse('2026-07-29T10:00:00.000Z')

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: 'req-1',
    status: 'SOS Triggered',
    patient_id: 'patient-1',
    patient_name: 'Asha',
    driver_id: null,
    driver_name: null,
    driver_phone: null,
    location_lat: 12.9,
    location_lon: 77.6,
    status_history: null,
    requested_at: new Date(NOW).toISOString(),
    expires_at: new Date(NOW + 180_000).toISOString(),
    triggered_by: 'PATIENT',
    ...overrides,
  } as Row
}

function transition(overrides: Partial<Parameters<typeof classify>[1]> = {}) {
  return {
    requestId: 'req-1',
    oldStatus: null,
    newStatus: 'SOS Triggered',
    oldDriverId: null,
    newDriverId: null,
    ...overrides,
  }
}

describe('classify', () => {
  it('treats an insert as a creation only when it lands as SOS Triggered', () => {
    expect(classify(row(), transition())).toBe('sos.created')
    expect(
      classify(row({ status: 'Cancelled' }), transition({ newStatus: 'Cancelled' }))
    ).toBeNull()
  })

  it('maps each forward transition to its lifecycle event', () => {
    const cases: Array<[string, string]> = [
      ['Driver En Route', 'sos.accepted'],
      ['Transport Arrived', 'sos.transport_arrived'],
      ['User Picked Up', 'sos.picked_up'],
      ['Arrived at Hospital', 'sos.arrived_hospital'],
    ]
    for (const [newStatus, expected] of cases) {
      expect(
        classify(row({ status: newStatus }), transition({ oldStatus: 'SOS Triggered', newStatus }))
      ).toBe(expected)
    }
  })

  it('separates a no-driver expiry from a deliberate cancel', () => {
    // The distinction drives completely different copy: "you can stand down" vs
    // "help is not coming, call 108".
    expect(
      classify(
        row({ status: 'Timed Out' }),
        transition({ oldStatus: 'SOS Triggered', newStatus: 'Timed Out' })
      )
    ).toBe('sos.no_driver')

    expect(
      classify(
        row({ status: 'Cancelled' }),
        transition({ oldStatus: 'SOS Triggered', newStatus: 'Cancelled' })
      )
    ).toBe('sos.cancelled')
  })

  it('still reads the actor tag on pre-migration rows written as Cancelled', () => {
    // Rows created before 'Timed Out' was a permitted status recorded an expiry as
    // 'Cancelled' + actor:'system'. Those must not be announced as a user cancel.
    const legacyTimeout = row({
      status: 'Cancelled',
      status_history: JSON.stringify([
        { status: 'SOS Triggered', timestamp: '2026-07-29T09:00:00.000Z' },
        { status: 'Cancelled', timestamp: '2026-07-29T09:03:00.000Z', actor: 'system' },
      ]),
    })
    expect(
      classify(legacyTimeout, transition({ oldStatus: 'SOS Triggered', newStatus: 'Cancelled' }))
    ).toBe('sos.no_driver')
  })

  it('treats a patient cancel as a cancel even with history present', () => {
    const userCancel = row({
      status: 'Cancelled',
      status_history: JSON.stringify([
        { status: 'SOS Triggered', timestamp: '2026-07-29T09:00:00.000Z' },
        { status: 'Cancelled', timestamp: '2026-07-29T09:01:00.000Z', actor: 'patient' },
      ]),
    })
    expect(
      classify(userCancel, transition({ oldStatus: 'SOS Triggered', newStatus: 'Cancelled' }))
    ).toBe('sos.cancelled')
  })

  it('survives unparseable status history without crashing a live dispatch', () => {
    const broken = row({ status: 'Cancelled', status_history: '{not json' })
    expect(
      classify(broken, transition({ oldStatus: 'SOS Triggered', newStatus: 'Cancelled' }))
    ).toBe('sos.cancelled')
  })

  it('emits nothing for a same-status rewrite', () => {
    expect(
      classify(row(), transition({ oldStatus: 'SOS Triggered', newStatus: 'SOS Triggered' }))
    ).toBeNull()
  })
})

describe('remainingLifetimeSeconds', () => {
  it('is the time left until the server-set deadline', () => {
    expect(remainingLifetimeSeconds(row(), NOW)).toBe(180)
    expect(remainingLifetimeSeconds(row(), NOW + 60_000)).toBe(120)
  })

  it('returns 0 once expired, which is the caller signal to send nothing', () => {
    expect(remainingLifetimeSeconds(row(), NOW + 180_000)).toBe(0)
    expect(remainingLifetimeSeconds(row(), NOW + 999_000)).toBe(0)
  })

  it('is 0 for the two-day-old SOS that started all this', () => {
    const twoDaysLater = NOW + 2 * 24 * 60 * 60 * 1000
    expect(remainingLifetimeSeconds(row(), twoDaysLater)).toBe(0)
  })

  it('falls back to requested_at + 3 min when expires_at is missing', () => {
    // Rows written before the expiry migration must still be bounded — treating a
    // missing deadline as "no deadline" is exactly the stale-siren bug.
    const preMigration = row({ expires_at: null })
    expect(remainingLifetimeSeconds(preMigration, NOW)).toBe(180)
    expect(remainingLifetimeSeconds(preMigration, NOW + 200_000)).toBe(0)
  })

  it('fails OPEN when no deadline can be derived at all', () => {
    // A malformed timestamp must not silently drop a possibly-live emergency, so
    // this returns the default TTL rather than 0.
    const undated = row({ expires_at: null, requested_at: null })
    expect(remainingLifetimeSeconds(undated, NOW)).toBeGreaterThan(0)

    const garbage = row({ expires_at: 'not-a-date', requested_at: 'also-not-a-date' })
    expect(remainingLifetimeSeconds(garbage, NOW)).toBeGreaterThan(0)
  })

  it('prefers a valid expires_at over the requested_at fallback', () => {
    const longWindow = row({
      requested_at: new Date(NOW).toISOString(),
      expires_at: new Date(NOW + 600_000).toISOString(),
    })
    expect(remainingLifetimeSeconds(longWindow, NOW)).toBe(600)
  })
})

describe('buildPatientConfirmationPayload', () => {
  // UAT-SOS-005 (Critical). The patient is the only participant with no other
  // evidence their SOS left the device — drivers get a siren, contacts get an alert
  // and an email. These assertions exist so that reassurance cannot be silently
  // turned into an alarm, or lost in a refactor of the audience logic.

  it('reassures rather than alarms, and never renders as a siren', () => {
    const payload = buildPatientConfirmationPayload(row())

    expect(payload.title).toBe('SOS sent')
    expect(payload.body).toMatch(/finding the nearest ambulance/i)

    // Data-only would route this to the headless handler, which loops the siren.
    // The patient must NOT be sirened by their own confirmation.
    expect(payload.dataOnly).not.toBe(true)
  })

  it('is addressed to the patient and carries the request it confirms', () => {
    const payload = buildPatientConfirmationPayload(row({ id: 'req-42' }))

    // A distinct type: routing this as sos_new_request would send the patient to
    // the driver screens.
    expect(payload.data.type).toBe('sos_confirmation')
    expect(payload.data.requestId).toBe('req-42')
  })

  it('does not leak driver identity before anyone has accepted', () => {
    // Creation-time only — there is no driver yet, and implying one exists would be
    // a lie told to someone in an emergency.
    const payload = buildPatientConfirmationPayload(row())
    expect(JSON.stringify(payload)).not.toMatch(/driver/i)
  })
})
