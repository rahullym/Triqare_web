#!/usr/bin/env node
/**
 * Push the version-controlled Supabase Auth email templates
 * (supabase/email-templates/*.html) to the live project via the Management API.
 *
 * Exists because the reset-password email must carry the 6-digit {{ .Token }}
 * instead of a reset link — both clients complete the reset by asking the user to
 * type the code — and the Dashboard is the only other place that setting lives.
 *
 * Usage (from web-production/):
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-auth-email-templates.js            # show current, then apply
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-auth-email-templates.js --dry-run  # show current only
 *
 * The access token is a Supabase personal access token (Dashboard → Account →
 * Access Tokens). It is read from the env var and never written to disk. The
 * project ref is derived from NEXT_PUBLIC_SUPABASE_URL in .env.local, or set
 * PROJECT_REF to override.
 */
const fs = require('fs')
const path = require('path')

const TEMPLATE_DIR = path.join(__dirname, '..', 'supabase', 'email-templates')

// Template file → the two Management API auth-config keys it owns.
const TEMPLATES = {
  recovery: {
    subject: 'Your Triqare password reset code',
    subjectKey: 'mailer_subjects_recovery',
    contentKey: 'mailer_templates_recovery_content',
  },
}

const token = (process.env.SUPABASE_ACCESS_TOKEN || '').trim()
if (!token) {
  console.error('Usage: SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-auth-email-templates.js [--dry-run]')
  process.exit(1)
}

function projectRef() {
  if (process.env.PROJECT_REF) return process.env.PROJECT_REF.trim()
  const envFile = fs.existsSync('.env.local') ? '.env.local' : '.env.netlify'
  const text = fs.readFileSync(envFile, 'utf8')
  const m = text.match(/^\s*NEXT_PUBLIC_SUPABASE_URL\s*=\s*["']?https:\/\/([a-z0-9]+)\.supabase\.co/m)
  if (!m) throw new Error(`Could not read a project ref from ${envFile}; set PROJECT_REF=...`)
  return m[1]
}

async function api(ref, method, body) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} config/auth → ${res.status}: ${text.slice(0, 400)}`)
  return text ? JSON.parse(text) : {}
}

// A template that still points at {{ .ConfirmationURL }} is the bug this script
// fixes, so call it out explicitly rather than just dumping the HTML.
function describe(html) {
  if (!html) return 'default Supabase template (no override set)'
  const hasLink = html.includes('.ConfirmationURL')
  const hasToken = html.includes('.Token')
  return `${html.length} chars — link: ${hasLink ? 'YES' : 'no'}, token: ${hasToken ? 'YES' : 'no'}`
}

async function main() {
  const dryRun = process.argv.includes('--dry-run')
  const ref = projectRef()
  console.log(`project: ${ref}${dryRun ? '  (dry run)' : ''}\n`)

  const current = await api(ref, 'GET')

  const patch = {}
  for (const [name, keys] of Object.entries(TEMPLATES)) {
    const file = path.join(TEMPLATE_DIR, `${name}.html`)
    if (!fs.existsSync(file)) {
      console.log(`${name}: no ${name}.html — skipped`)
      continue
    }
    // Comments would travel in the sent email's source, so keep repo notes out of
    // recipients' inboxes.
    const html = fs.readFileSync(file, 'utf8').replace(/<!--[\s\S]*?-->\s*/g, '').trim()
    if (!html.includes('.Token')) {
      throw new Error(`${name}.html has no {{ .Token }} — refusing to apply a codeless template`)
    }
    console.log(`${name}:`)
    console.log(`  live  → ${describe(current[keys.contentKey])}`)
    console.log(`  local → ${describe(html)}`)
    patch[keys.contentKey] = html
    patch[keys.subjectKey] = keys.subject
  }

  if (dryRun) {
    console.log('\ndry run — nothing applied')
    return
  }
  if (!Object.keys(patch).length) {
    console.log('\nnothing to apply')
    return
  }

  const after = await api(ref, 'PATCH', patch)
  console.log('\napplied:')
  for (const [name, keys] of Object.entries(TEMPLATES)) {
    if (!(keys.contentKey in patch)) continue
    console.log(`  ${name}: ${describe(after[keys.contentKey])} | subject: ${after[keys.subjectKey]}`)
  }
  console.log('\nSend yourself a reset to confirm the email now shows a code, not a link.')
}

main().catch((err) => {
  console.error(`\nFAILED: ${err.message}`)
  process.exit(1)
})
