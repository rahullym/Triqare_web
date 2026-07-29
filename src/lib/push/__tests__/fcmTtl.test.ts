import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The TTL is the fix for a real incident: with none set, FCM stores an undelivered
// dispatch for FOUR WEEKS and hands it to the driver's phone on reconnect, sirening
// for an emergency that ended days earlier.
//
// The two fields have DIFFERENT units and shapes, which is exactly how this gets
// silently reverted to the default:
//   android.ttl      → a DURATION in MILLISECONDS
//   apns-expiration  → an ABSOLUTE UNIX time in SECONDS
// These tests pin both.

const sendEachForMulticast = vi.fn()

vi.mock('firebase-admin/app', () => ({
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => []),
  initializeApp: vi.fn(() => ({ name: 'push' })),
}))

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({ sendEachForMulticast })),
}))

const NOW_MS = Date.parse('2026-07-29T10:00:00.000Z')
const NOW_SECONDS = Math.floor(NOW_MS / 1000)

async function send(payloadOverrides: Record<string, unknown> = {}) {
  const { sendToTokens } = await import('@/lib/push/fcm')
  await sendToTokens(['token-a'], {
    title: 'T',
    body: 'B',
    data: { type: 'sos_new_request' },
    ...payloadOverrides,
  } as Parameters<typeof sendToTokens>[1])
  return sendEachForMulticast.mock.calls.at(-1)?.[0]
}

beforeEach(() => {
  vi.resetModules()
  sendEachForMulticast.mockReset()
  sendEachForMulticast.mockResolvedValue({ successCount: 1, failureCount: 0, responses: [{ success: true }] })
  process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
    project_id: 'sos-app-24a59-8fb38',
    client_email: 'test@example.com',
    private_key: 'key',
  })
  vi.useFakeTimers()
  vi.setSystemTime(NOW_MS)
})

afterEach(() => {
  vi.useRealTimers()
  delete process.env.FIREBASE_SERVICE_ACCOUNT
})

describe('push TTL', () => {
  it('always sets an expiry — never falls back to FCM’s four-week default', async () => {
    const message = await send()
    expect(message.android.ttl).toBeDefined()
    expect(message.apns.headers['apns-expiration']).toBeDefined()
  })

  it('expresses android.ttl as a duration in milliseconds', async () => {
    const message = await send({ ttlSeconds: 90 })
    expect(message.android.ttl).toBe(90_000)
  })

  it('expresses apns-expiration as an absolute epoch time in seconds', async () => {
    const message = await send({ ttlSeconds: 90 })
    // Absolute, not a duration: now + ttl. A duration here would mean 1970.
    expect(message.apns.headers['apns-expiration']).toBe(String(NOW_SECONDS + 90))
  })

  it('applies the default TTL when a caller omits one', async () => {
    const { DEFAULT_PUSH_TTL_SECONDS } = await import('@/lib/push/fcm')
    const message = await send()
    expect(message.android.ttl).toBe(DEFAULT_PUSH_TTL_SECONDS * 1000)
    expect(message.apns.headers['apns-expiration']).toBe(
      String(NOW_SECONDS + DEFAULT_PUSH_TTL_SECONDS)
    )
  })

  it('clamps a negative or expired TTL to zero rather than sending a bad header', async () => {
    const message = await send({ ttlSeconds: -30 })
    expect(message.android.ttl).toBe(0)
    expect(message.apns.headers['apns-expiration']).toBe(String(NOW_SECONDS))
  })

  it('sets a TTL on data-only sends too — the dispatch that actually sirens', async () => {
    const message = await send({ dataOnly: true, ttlSeconds: 120 })
    // Data-only is the driver dispatch path; it must not be the one that leaks.
    expect(message.notification).toBeUndefined()
    expect(message.android.ttl).toBe(120_000)
    expect(message.apns.headers['apns-expiration']).toBe(String(NOW_SECONDS + 120))
  })

  it('keeps the SOS channel on notification sends so alerts are never silent', async () => {
    const message = await send()
    const { SOS_CHANNEL_ID } = await import('@/lib/push/fcm')
    expect(message.android.notification.channelId).toBe(SOS_CHANNEL_ID)
  })
})
