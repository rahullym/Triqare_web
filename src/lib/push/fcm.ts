// FCM transport — the only place that talks to Firebase.
//
// Sends via the FCM HTTP v1 API through firebase-admin, which handles the
// service-account OAuth exchange for us. Callers hand it a set of device tokens
// and a payload; it fans out and reports which tokens are dead.
//
// IMPORTANT: FCM tokens are scoped to the Firebase project that minted them. The
// service account in FIREBASE_SERVICE_ACCOUNT must belong to the SAME project as
// the google-services.json bundled into the mobile app (sos-app-24a59-8fb38), or
// every send fails with a SenderId mismatch.

import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getMessaging } from 'firebase-admin/messaging'

/**
 * The Android channel the app creates at MAX importance — heads-up + sound.
 * Must stay in lockstep with `Triqare-app/services/fcm-service.ts`: a push naming
 * a channel the app has not created falls back to the silent "Miscellaneous"
 * bucket, which for an ambulance dispatch means the driver never hears it.
 *
 * v2 because a channel's sound cannot be changed after creation — the custom SOS
 * ringtone required a new id.
 */
export const SOS_CHANNEL_ID = 'sos-emergency-v2'

/**
 * The bundled SOS ringtone. Android resolves this against `res/raw` (no file
 * extension); iOS wants the filename, so the two differ by design.
 */
const SOS_SOUND_ANDROID = 'sos_alert'
const SOS_SOUND_IOS = 'sos_alert.wav'

export interface PushPayload {
  title: string
  body: string
  /** Routed on by the mobile app. FCM requires every data value to be a string. */
  data: Record<string, string>
  /** `high` wakes a dozing device immediately. Use it for anything time-critical. */
  priority?: 'high' | 'normal'
}

export interface SendResult {
  sent: number
  failed: number
  /** Tokens FCM reports as permanently dead — the caller should stop storing them. */
  invalidTokens: string[]
  /**
   * True when nothing was even attempted because the sender is not configured
   * (FIREBASE_SERVICE_ACCOUNT missing or unparseable). Without this, that case is
   * indistinguishable from "FCM rejected the send" — both report failed=N — which
   * sent a live debug down the wrong path for hours.
   */
  notConfigured?: boolean
  /** Diagnostic only (never the secret): why the sender is unavailable + the raw env length. */
  configReason?: 'missing' | 'unparseable'
  configLen?: number
}

let app: App | null = null

/**
 * Why the sender is unavailable, for diagnostics only. NEVER contains the secret —
 * just a reason code and the raw value's length, which is enough to tell "not set"
 * from "set but truncated/mangled by the dashboard" without leaking anything.
 */
let configReason: 'missing' | 'unparseable' | undefined
let configLen = 0

export function getSenderConfigDiagnostic(): {
  reason?: 'missing' | 'unparseable'
  len: number
} {
  return { reason: configReason, len: configLen }
}

/**
 * Lazily initialize the Admin SDK. Returns null (rather than throwing) when the
 * service account is not configured, so a misconfigured deploy degrades to
 * "pushes don't send" instead of "every SOS write 500s".
 */
function getFirebaseApp(): App | null {
  if (app) return app

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  configLen = raw ? raw.length : 0
  if (!raw) {
    configReason = 'missing'
    console.warn('[push] FIREBASE_SERVICE_ACCOUNT is not set — push notifications disabled')
    return null
  }

  try {
    // Accept either raw JSON or base64-encoded JSON: the private key is multi-line,
    // and some dashboards mangle newlines in plain env values.
    const json = raw.trim().startsWith('{')
      ? raw
      : Buffer.from(raw, 'base64').toString('utf8')
    const serviceAccount = JSON.parse(json)

    const existing = getApps()
    app = existing.length
      ? existing[0]
      : initializeApp({ credential: cert(serviceAccount) }, 'push')

    configReason = undefined
    return app
  } catch (err) {
    configReason = 'unparseable'
    console.error(
      `[push] FIREBASE_SERVICE_ACCOUNT could not be parsed (raw length ${configLen}; expected ~3196 for the base64 blob — a shorter value means the dashboard truncated it)`,
      err
    )
    return null
  }
}

/**
 * Push `payload` to every token in `tokens`. Deduplicates, tolerates an empty list,
 * and never throws — a send failure must not take down the caller.
 */
export async function sendToTokens(tokens: string[], payload: PushPayload): Promise<SendResult> {
  const unique = [...new Set(tokens.filter((t) => typeof t === 'string' && t.trim().length > 0))]
  if (unique.length === 0) return { sent: 0, failed: 0, invalidTokens: [] }

  const firebase = getFirebaseApp()
  if (!firebase) {
    const diag = getSenderConfigDiagnostic()
    return {
      sent: 0,
      failed: unique.length,
      invalidTokens: [],
      notConfigured: true,
      configReason: diag.reason,
      configLen: diag.len,
    }
  }

  const priority = payload.priority ?? 'high'

  try {
    const response = await getMessaging(firebase).sendEachForMulticast({
      tokens: unique,
      // A `notification` block means Android/iOS render the tray notification
      // themselves when the app is backgrounded or killed — no JS runs. The `data`
      // block rides along for tap-routing. Foreground delivery has no OS-rendered
      // notification, so the app re-presents it locally (see services/fcm-messaging.ts).
      notification: { title: payload.title, body: payload.body },
      data: payload.data,
      android: {
        priority,
        notification: {
          // Without an explicit channel the OS drops these into the low-importance
          // "Miscellaneous" bucket — silent, no heads-up. Fatal for SOS dispatch.
          channelId: SOS_CHANNEL_ID,
          // On Android 8+ the CHANNEL owns the sound and this field is ignored;
          // it still matters on older devices, so both name the SOS ringtone.
          sound: SOS_SOUND_ANDROID,
          defaultVibrateTimings: true,
        },
      },
      apns: {
        payload: { aps: { sound: SOS_SOUND_IOS, badge: 1 } },
        headers: { 'apns-priority': priority === 'high' ? '10' : '5' },
      },
    })

    const invalidTokens: string[] = []
    response.responses.forEach((r, i) => {
      if (r.success) return
      const code = r.error?.code
      // These two mean the token will never work again (app uninstalled, data
      // cleared, token rotated). Anything else — network blip, quota — is transient
      // and the token must be kept.
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(unique[i])
      } else {
        console.warn(`[push] send failed for a token: ${code ?? 'unknown error'}`)
      }
    })

    return {
      sent: response.successCount,
      failed: response.failureCount,
      invalidTokens,
    }
  } catch (err) {
    console.error('[push] sendEachForMulticast threw', err)
    return { sent: 0, failed: unique.length, invalidTokens: [] }
  }
}

export interface SenderVerifyResult {
  /** FIREBASE_SERVICE_ACCOUNT is present and parses into a Firebase app. */
  configured: boolean
  /** When not configured: why + the raw env length (never the secret). */
  reason?: 'missing' | 'unparseable'
  len: number
  /**
   * Whether the service account can actually AUTHENTICATE to FCM. Determined by a
   * dry-run send (delivers nothing) to a deliberately-invalid token:
   *  - 'ok'         → FCM rejected the token but ACCEPTED the credentials → the
   *                   service account works. This is the definitive "push can send".
   *  - 'failed'     → FCM rejected the credentials (wrong/expired key, wrong project).
   *  - 'unconfigured' → couldn't even init (see reason).
   *  - 'unknown'    → an unexpected error; see detail.
   */
  fcmAuth: 'ok' | 'failed' | 'unconfigured' | 'unknown'
  /** Diagnostic error code/message from the dry run (never secrets). */
  detail?: string
}

/**
 * Verify the sender end-to-end WITHOUT delivering anything: init the Admin SDK, then
 * do an FCM dry-run send to a dummy token. A dry run validates credentials + message
 * against Google's servers but never delivers, so this is a safe, on-demand health
 * check for "is FIREBASE_SERVICE_ACCOUNT set correctly on this deploy" — the single
 * make-or-break unknown that otherwise only surfaces on a real SOS.
 */
export async function verifySender(): Promise<SenderVerifyResult> {
  const firebase = getFirebaseApp()
  if (!firebase) {
    const diag = getSenderConfigDiagnostic()
    return { configured: false, reason: diag.reason, len: diag.len, fcmAuth: 'unconfigured' }
  }

  const diag = getSenderConfigDiagnostic()
  try {
    await getMessaging(firebase).send(
      { token: 'push-selftest-invalid-token-000', notification: { title: 't', body: 'b' } },
      true // dryRun — validates only, delivers nothing
    )
    // A dummy token can't actually succeed; if it somehow does, creds are clearly fine.
    return { configured: true, len: diag.len, fcmAuth: 'ok' }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code ?? ''
    const message = (err as { message?: string })?.message ?? String(err)
    // Token-level rejections mean AUTH SUCCEEDED (we reached FCM; it just disliked the
    // fake token) → the service account is good.
    if (
      code === 'messaging/invalid-argument' ||
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    ) {
      return { configured: true, len: diag.len, fcmAuth: 'ok' }
    }
    // Credential/permission failures mean the service account itself is bad.
    if (
      code.includes('credential') ||
      code.includes('authentication') ||
      /PERMISSION_DENIED|UNAUTHENTICATED|invalid_grant|account not found/i.test(message)
    ) {
      return { configured: true, len: diag.len, fcmAuth: 'failed', detail: code || message }
    }
    return { configured: true, len: diag.len, fcmAuth: 'unknown', detail: code || message }
  }
}
