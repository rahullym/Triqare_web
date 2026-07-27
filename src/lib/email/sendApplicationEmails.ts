/**
 * Transactional email for driver applications (Resend).
 *
 * SERVER-ONLY. Degrades to a safe no-op (logging only the reference number,
 * never PII) when RESEND_API_KEY is absent, so submission never fails on email.
 * Resend is lazily imported so the no-op path has no hard runtime dependency.
 */

// Sender domain MUST be verified in Resend. triqare.com is verified (triqare.in is not),
// so the default sends from .com; override via EMAIL_FROM only with another verified domain.
const FROM = process.env.EMAIL_FROM || 'QSoS <noreply@triqare.com>'
const SUPPORT = 'support@triqare.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://triqare.in'

/** Escape user-provided values before interpolating into email HTML (anti-injection). */
function esc(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface SendArgs {
  to: string | string[]
  subject: string
  html: string
  text: string
}

async function send({ to, subject, html, text }: SendArgs): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    // No email provider configured — do not block the flow, do not log PII.
    console.warn('[email] RESEND_API_KEY not set; skipping send for subject prefix:', subject.split(' - ')[0])
    return
  }
  try {
    const { Resend } = await import('resend')
    const resend = new Resend(apiKey)
    await resend.emails.send({ from: FROM, to, subject, html, text })
  } catch (err) {
    // Email failures must never fail the request that triggered them.
    console.error('[email] send failed:', err instanceof Error ? err.message : 'unknown')
  }
}

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;background:#ffffff">
    <div style="background:#cc3333;padding:18px 24px;color:#ffffff;font-size:18px;font-weight:bold">TriQare · QSoS</div>
    <div style="padding:24px;font-size:14px;line-height:1.6">
      <h2 style="margin:0 0 12px;color:#003366;font-size:18px">${title}</h2>
      ${bodyHtml}
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e6e6e6;color:#999999;font-size:12px">
      © TriQare Healthtech · <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a>
    </div>
  </div></body></html>`
}

// ── Applicant confirmation + admin notification (on submit) ─────────────────
export async function sendSubmissionEmails(args: {
  applicationId: string
  referenceNumber: string
  fullName: string
  email: string
  phone: string
  submittedAt: string
  summary?: { vehicleType?: string; licenseType?: string; experienceYears?: number | null }
}): Promise<void> {
  const { applicationId, referenceNumber, fullName, email, phone, submittedAt, summary } = args
  const nameH = esc(fullName)
  const emailH = esc(email)
  const phoneH = esc(phone)

  const confirmText = `Dear ${fullName},

Thank you for applying to drive with QSoS. We have received your application.

Reference number: ${referenceNumber}

Our team is reviewing your documents and will get back to you within 48 hours. If you have any questions, contact us at ${SUPPORT}.

Best regards,
TriQare Team`

  // Applicant confirmation + admin notification go out concurrently. Each send()
  // swallows its own errors, so Promise.all never rejects and never blocks success.
  const sends: Promise<void>[] = []

  sends.push(send({
    to: email,
    subject: `QSoS Driver Application Received - ${referenceNumber}`,
    text: confirmText,
    html: shell('Application Received', `
      <p>Dear <strong>${nameH}</strong>,</p>
      <p>Thank you for applying to drive with QSoS. We have received your application.</p>
      <p style="background:#f5f5f5;border-radius:6px;padding:12px;text-align:center">
        Reference number<br><strong style="color:#003366;font-size:16px">${referenceNumber}</strong>
      </p>
      <p>Our team is reviewing your documents and will get back to you within <strong>48 hours</strong>.</p>
      <p>Questions? Contact us at <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a>.</p>
      <p>Best regards,<br>TriQare Team</p>`),
  }))

  // Admin notification — recipient(s) from ADMIN_NOTIFICATION_EMAIL (comma-separated
  // list supported, e.g. "info@triqare.com,triqare@gmail.com"); final address TBD by TriQare.
  const recipients = (process.env.ADMIN_NOTIFICATION_EMAIL ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (recipients.length) {
    const reviewLink = `${APP_URL}/admin/driver-applications/${applicationId}`
    const summaryLine = [
      summary?.vehicleType && `Vehicle: ${summary.vehicleType}`,
      summary?.licenseType && `License: ${summary.licenseType}`,
      summary?.experienceYears != null && `Experience: ${summary.experienceYears} yrs`,
    ]
      .filter(Boolean)
      .join(' · ')
    sends.push(send({
      to: recipients,
      subject: `New Driver Application Received - ${fullName} - ${submittedAt.slice(0, 10)}`,
      text: `New driver application.

Driver: ${fullName}
Reference: ${referenceNumber}
Date/Time: ${submittedAt}
Phone: ${phone}
Email: ${email}
Summary: ${summaryLine || 'n/a'}

View full application: ${reviewLink}`,
      html: shell('New Driver Application', `
        <p><strong>${nameH}</strong> has submitted a driver application.</p>
        <ul style="padding-left:18px">
          <li>Driver: <strong>${nameH}</strong></li>
          <li>Reference: <strong>${referenceNumber}</strong></li>
          <li>Date/Time: ${submittedAt}</li>
          <li>Phone: ${phoneH}</li>
          <li>Email: ${emailH}</li>
          ${summaryLine ? `<li>Summary: ${esc(summaryLine)}</li>` : ''}
        </ul>
        <p><a href="${reviewLink}" style="background:#cc3333;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">View full application</a></p>`),
    }))
  }

  await Promise.all(sends)
}

// ── Emergency-contact invitation ────────────────────────────────────────────
/**
 * Invite a person (by email) whom a user just added as an emergency contact to
 * create their own QSoS account. Best-effort: the private `send` helper already
 * no-ops when RESEND_API_KEY is absent and swallows its own errors, so a
 * missing/mis-configured provider never fails the caller.
 */
export async function sendEmergencyContactInviteEmail(args: {
  email: string
  contactName?: string | null
  inviterName?: string | null
}): Promise<void> {
  const { email } = args
  const contactName = args.contactName?.trim() || 'there'
  const inviter = args.inviterName?.trim() || 'A TriQare user'
  const greetH = esc(contactName)
  const inviterH = esc(inviter)

  await send({
    to: email,
    subject: `${inviter} added you as an emergency contact on TriQare QSoS`,
    text: `Hi ${contactName},

${inviter} has added you as an emergency contact on TriQare QSoS, our emergency-response app.

You can create your own free account so you can be reached and use the app yourself:
  1. Download the TriQare QSoS app.
  2. Sign up / log in using THIS email address (${email}).

Once you're in, you have access to every feature of the app. Note: the Emergency (SOS) button works only while you are physically within India.

Questions? Contact ${SUPPORT}.

— TriQare Team`,
    html: shell('You were added as an emergency contact', `
      <p>Hi <strong>${greetH}</strong>,</p>
      <p><strong>${inviterH}</strong> has added you as an emergency contact on <strong>TriQare QSoS</strong>, our emergency-response app.</p>
      <p>Create your own free account so you can be reached and use the app yourself:</p>
      <ol style="padding-left:18px">
        <li>Download the <strong>TriQare QSoS</strong> app.</li>
        <li>Sign up / log in using <strong>this email address</strong> (${esc(email)}).</li>
      </ol>
      <p>Once you're in, you have access to every feature of the app. The Emergency (SOS) button works only while you are physically within India.</p>
      <p style="text-align:center;margin:20px 0">
        <a href="${APP_URL}" style="background:#cc3333;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">Get the app</a>
      </p>
      <p>Questions? Contact <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a>.</p>
      <p>— TriQare Team</p>`),
  })
}

// ── Emergency-contact SOS alert ─────────────────────────────────────────────
/**
 * Alert a patient's emergency contacts BY EMAIL when they trigger an SOS
 * (kind='triggered') and again when they safely reach hospital (kind='resolved').
 *
 * This is the channel that reaches contacts who do NOT have the app — the push
 * path (sosPush.ts) only reaches contacts who signed up and installed it. Sent
 * one message PER recipient so contacts never see each other's addresses, and
 * best-effort (send() no-ops without RESEND_API_KEY and swallows its own errors),
 * so email never blocks or fails the SOS dispatch webhook.
 */
export async function sendSOSContactAlertEmails(args: {
  recipients: string[]
  patientName?: string | null
  kind: 'triggered' | 'resolved'
  location?: { lat: number; lon: number } | null
}): Promise<void> {
  const recipients = Array.from(
    new Set(args.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean)),
  )
  if (recipients.length === 0) return

  const patient = args.patientName?.trim() || 'Someone who listed you as an emergency contact'
  const patientH = esc(patient)
  const mapUrl =
    args.location && Number.isFinite(args.location.lat) && Number.isFinite(args.location.lon)
      ? `https://www.google.com/maps/search/?api=1&query=${args.location.lat},${args.location.lon}`
      : null

  let subject: string
  let text: string
  let html: string

  if (args.kind === 'triggered') {
    subject = `🚨 Emergency SOS from ${patient}`
    text = `${patient} has triggered an emergency SOS on TriQare QSoS and requested urgent medical transport. You are listed as one of their emergency contacts.
${mapUrl ? `\nTheir location: ${mapUrl}\n` : ''}
If you cannot reach ${patient}, call 108 (emergency services) immediately.

— TriQare QSoS`
    html = shell('🚨 Emergency SOS Alert', `
      <p><strong>${patientH}</strong> has just triggered an <strong style="color:#cc3333">emergency SOS</strong> on TriQare QSoS and requested urgent medical transport.</p>
      <p>You are listed as one of their emergency contacts.</p>
      ${
        mapUrl
          ? `<p style="text-align:center;margin:20px 0">
               <a href="${mapUrl}" style="background:#cc3333;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none">View their location</a>
             </p>`
          : ''
      }
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px">
        If you cannot reach <strong>${patientH}</strong>, call <strong>108</strong> (emergency services) immediately.
      </div>`)
  } else {
    subject = `${patient} has safely arrived at the hospital`
    text = `Update: ${patient} has safely arrived at the hospital. Their SOS is now complete.

— TriQare QSoS`
    html = shell('SOS Resolved', `
      <p><strong>${patientH}</strong> has safely arrived at the hospital.</p>
      <p>Their SOS is now complete. No further action is needed.</p>`)
  }

  // One message per recipient (each send() swallows its own errors → Promise.all
  // never rejects), so a bad address or provider hiccup can't block the others.
  await Promise.all(recipients.map((to) => send({ to, subject, html, text })))
}

// ── App feedback ────────────────────────────────────────────────────────────
/**
 * Emails in-app feedback to the Triqare team so the mobile user never has to
 * leave the app to open a mail client. Best-effort (send() no-ops without
 * RESEND_API_KEY). Recipient defaults to info@triqare.com (override via
 * FEEDBACK_EMAIL).
 */
export async function sendAppFeedbackEmail(args: {
  category: string
  message: string
  name?: string | null
  email?: string | null
  phone?: string | null
  userId?: string | null
  platform?: string | null
  appVersion?: string | null
}): Promise<void> {
  const to = process.env.FEEDBACK_EMAIL || 'info@triqare.com'
  const name = args.name?.trim() || 'A Triqare user'
  const category = args.category?.trim() || 'General'
  const msg = args.message?.trim() || ''

  const rows: [string, string][] = [
    ['Category', category],
    ['Name', name],
    ['Email', args.email?.trim() || '—'],
    ['Phone', args.phone?.trim() || '—'],
    ['User ID', args.userId?.trim() || '—'],
    ['Platform', args.platform?.trim() || '—'],
    ['App version', args.appVersion?.trim() || '—'],
  ]

  await send({
    to,
    subject: `App Feedback (${category}) from ${name}`,
    text: `App Feedback

Category: ${category}

${msg}

— User —
${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}`,
    html: shell(`App Feedback · ${esc(category)}`, `
      <p style="white-space:pre-wrap;background:#f5f5f5;border-radius:6px;padding:12px">${esc(msg)}</p>
      <table style="font-size:13px;border-collapse:collapse">
        ${rows
          .map(
            ([k, v]) =>
              `<tr><td style="padding:2px 10px 2px 0;color:#666">${esc(k)}</td><td style="padding:2px 0"><strong>${esc(v)}</strong></td></tr>`,
          )
          .join('')}
      </table>`),
  })
}

// ── Approval ────────────────────────────────────────────────────────────────
export async function sendApprovalEmail(args: {
  referenceNumber: string
  fullName: string
  email: string
  /** Present when a brand-new login was created for this driver. */
  tempPassword?: string | null
}): Promise<void> {
  const { referenceNumber, fullName, email, tempPassword } = args

  // A driver account is provisioned on approval, so the approval email is also
  // their way in. Without credentials here they'd have no idea how to sign in.
  const credsText = tempPassword
    ? `
You can now sign in to the QSoS driver app:
  Email:    ${email}
  Password: ${tempPassword}

Please change this password after your first sign-in.
`
    : `
You can now sign in to the QSoS driver app using this email address (${email}).
If you don't know your password, use "Forgot Password" in the app to set one.
`

  const credsHtml = tempPassword
    ? `<div style="background:#f0f6ff;border:1px solid #b9d4ff;border-radius:6px;padding:12px">
         <strong>Your driver app sign-in</strong><br>
         Email: <strong>${esc(email)}</strong><br>
         Temporary password: <strong style="font-family:monospace">${esc(tempPassword)}</strong><br>
         <span style="color:#666">Please change this password after your first sign-in.</span>
       </div>`
    : `<div style="background:#f0f6ff;border:1px solid #b9d4ff;border-radius:6px;padding:12px">
         <strong>Your driver app sign-in</strong><br>
         Sign in with this email address: <strong>${esc(email)}</strong>.<br>
         <span style="color:#666">If you don't know your password, use "Forgot Password" in the app.</span>
       </div>`

  await send({
    to: email,
    subject: 'Congratulations! Your QSoS Driver Application is Approved',
    text: `Dear ${fullName},

Congratulations! Your QSoS driver application (${referenceNumber}) has been approved.
${credsText}
Questions? Contact ${SUPPORT}.

Welcome to the QSoS family!
- TriQare Team`,
    html: shell('Application Approved 🎉', `
      <p>Dear <strong>${esc(fullName)}</strong>,</p>
      <p>Congratulations! Your QSoS driver application (<strong>${referenceNumber}</strong>) has been <strong style="color:#16a34a">approved</strong>.</p>
      ${credsHtml}
      <p>Questions? Contact <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a>.</p>
      <p>Welcome to the QSoS family!<br>- TriQare Team</p>`),
  })
}

// ── Rejection ─────────────────────────────────────────────────────────────
export async function sendRejectionEmail(args: {
  referenceNumber: string
  fullName: string
  email: string
  reason: string
}): Promise<void> {
  const { referenceNumber, fullName, email, reason } = args
  await send({
    to: email,
    subject: 'QSoS Driver Application - Action Required',
    text: `Dear ${fullName},

Thank you for your interest in driving with QSoS. After reviewing your application (${referenceNumber}), we are unable to approve it at this time.

Reason(s) for rejection:
${reason}

You are welcome to reapply once the above is addressed: ${APP_URL}/drivers

Questions? Contact ${SUPPORT}.

Regards,
TriQare Team`,
    html: shell('Action Required', `
      <p>Dear <strong>${esc(fullName)}</strong>,</p>
      <p>Thank you for your interest in driving with QSoS. After reviewing your application (<strong>${referenceNumber}</strong>), we are unable to approve it at this time.</p>
      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:12px">
        <strong>Reason(s) for rejection:</strong><br>${esc(reason).replace(/\n/g, '<br>')}
      </div>
      <p>You are welcome to <a href="${APP_URL}/drivers" style="color:#cc3333">reapply</a> once the above is addressed.</p>
      <p>Questions? Contact <a href="mailto:${SUPPORT}" style="color:#cc3333">${SUPPORT}</a>.</p>
      <p>Regards,<br>TriQare Team</p>`),
  })
}
