/**
 * Hospital onboarding email (US-001).
 *
 * SERVER-ONLY. Follows sendApplicationEmails.ts: lazy Resend import, and a
 * no-op (never a throw) when RESEND_API_KEY is absent, so provisioning a
 * hospital never fails because email is misconfigured. The caller is told
 * whether the send actually happened so the admin UI can say so honestly
 * rather than claiming an email went out that did not.
 *
 * Content is fixed by the spec — subject line, greeting, both body paragraphs,
 * the credentials block, the CTA label, the 72-hour notice and the footer are
 * all prescribed. Treat them as copy, not as suggestions.
 */

// Sender domain MUST be verified in Resend. triqare.com is verified; triqare.in
// is not, and store review already rejected a build over that dead domain.
const FROM = process.env.HOSPITAL_EMAIL_FROM || 'QSOS by Triqare <noreply@triqare.com>'
const SUPPORT = 'info@triqare.com'
const SUPPORT_PHONE = '+91 93249 11500'
const SUPPORT_PHONE_TEL = '+919324911500'

/**
 * Base URL for the portal. Deliberately NOT NEXT_PUBLIC_APP_URL: on Netlify that
 * is the raw triqareweb20.netlify.app host, which put an unbranded address in
 * front of hospitals. portal.triqare.com is the primary domain on the same site.
 */
const APP_URL = process.env.HOSPITAL_PORTAL_BASE_URL || 'https://portal.triqare.com'
const PORTAL_PATH = process.env.NEXT_PUBLIC_HOSPITAL_PORTAL_PATH || '/hospital'

export function hospitalPortalUrl(): string {
  return `${APP_URL.replace(/\/+$/, '')}${PORTAL_PATH}`
}

export function hospitalSetupUrl(token: string): string {
  return `${hospitalPortalUrl()}/set-password?token=${encodeURIComponent(token)}`
}

/** Escape hospital-supplied values before interpolating into email HTML. */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface HospitalOnboardingEmailArgs {
  hospitalName: string
  adminEmail: string
  temporaryPassword: string
  token: string
  expiryHours: number
}

export interface EmailSendResult {
  sent: boolean
  reason?: 'not_configured' | 'send_failed'
}

export async function sendHospitalOnboardingEmail(
  args: HospitalOnboardingEmailArgs,
): Promise<EmailSendResult> {
  const { hospitalName, adminEmail, temporaryPassword, token, expiryHours } = args
  const loginUrl = hospitalPortalUrl()
  const setupUrl = hospitalSetupUrl(token)

  const subject = "Your hospital is now live on QSOS — here's how to get started"

  const text = `Dear ${hospitalName} Team,

${hospitalName} has been registered on QSOS. Your hospital will now appear in the QSoS app for patients to select as their primary or secondary emergency hospital.

Use the details below to access your QSOS Hospital Dashboard for the first time.

Login URL: ${loginUrl}
Email: ${adminEmail}
Temporary Password: ${temporaryPassword}

Set up your dashboard: ${setupUrl}

This link is valid for ${expiryHours} hours. After it expires, contact ${SUPPORT} or call ${SUPPORT_PHONE} and we will send you a new one.

Triqare Healthtech Private Limited │ Vikhroli West, Mumbai │ ${SUPPORT} │ ${SUPPORT_PHONE}`

  const html = `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff">
    <div style="background:#cc3333;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">QSOS by Triqare</div>
    <div style="padding:24px;font-size:14px;line-height:1.6">
      <p style="margin:0 0 16px">Dear <strong>${esc(hospitalName)}</strong> Team,</p>
      <p style="margin:0 0 16px"><strong>${esc(hospitalName)}</strong> has been registered on QSOS. Your hospital will now appear in the QSoS app for patients to select as their primary or secondary emergency hospital.</p>
      <p style="margin:0 0 16px">Use the details below to access your QSOS Hospital Dashboard for the first time.</p>
      <table style="width:100%;background:#f5f7fa;border-radius:6px;padding:16px;margin:0 0 20px;font-size:14px" cellpadding="6" cellspacing="0">
        <tr><td style="color:#667;width:150px">Login URL</td><td><a href="${esc(loginUrl)}" style="color:#cc3333">${esc(loginUrl)}</a></td></tr>
        <tr><td style="color:#667">Email</td><td><strong>${esc(adminEmail)}</strong></td></tr>
        <tr><td style="color:#667">Temporary Password</td><td><strong style="font-family:monospace;font-size:15px">${esc(temporaryPassword)}</strong></td></tr>
      </table>
      <p style="margin:0 0 24px;text-align:center">
        <a href="${esc(setupUrl)}" style="display:inline-block;background:#003366;color:#ffffff;text-decoration:none;padding:13px 28px;border-radius:6px;font-weight:bold">Set Up My Dashboard</a>
      </p>
      <p style="margin:0;color:#667;font-size:13px">This link is valid for <strong>${expiryHours} hours</strong>. After it expires, contact <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a> or call <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#cc3333">${SUPPORT_PHONE}</a> and we will send you a new one.</p>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e6e6e6;color:#999999;font-size:12px">
      Triqare Healthtech Private Limited │ Vikhroli West, Mumbai │ <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a> │ <a href="tel:${SUPPORT_PHONE_TEL}" style="color:#cc3333">${SUPPORT_PHONE}</a>
    </div>
  </div></body></html>`

  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // Never log the credentials or the token.
    console.warn('[email] RESEND_API_KEY not set; hospital onboarding email not sent')
    return { sent: false, reason: 'not_configured' }
  }

  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    await resend.emails.send({ from: FROM, to: adminEmail, subject, html, text })
    return { sent: true }
  } catch (err) {
    console.error('[email] hospital onboarding send failed:', err instanceof Error ? err.message : 'unknown')
    return { sent: false, reason: 'send_failed' }
  }
}
