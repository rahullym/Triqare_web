#!/usr/bin/env node
/**
 * Generate the "Secret Key (for OAuth)" JWT that Supabase → Auth → Providers →
 * Apple expects. This is NOT the .p8 file — it's a short-lived ES256 JWT signed
 * with the .p8. Apple caps its lifetime at ~6 months, so re-run this and paste
 * the new value into Supabase before it expires.
 *
 * Usage:
 *   node scripts/gen-apple-secret.js <path-to-.p8> <KEY_ID>
 *
 * Example:
 *   node scripts/gen-apple-secret.js ~/Downloads/AuthKey_ABC123DEF4.p8 ABC123DEF4
 *
 * Team ID and Services ID are pre-filled for Triqare; override via env if needed:
 *   APPLE_TEAM_ID=... APPLE_SERVICES_ID=... node scripts/gen-apple-secret.js ...
 */

const crypto = require('crypto')
const fs = require('fs')

const TEAM_ID = process.env.APPLE_TEAM_ID || '7UY9C5NGCL'
const SERVICES_ID = process.env.APPLE_SERVICES_ID || 'in.triqare.qsos.signin' // the client_id (Services ID)
const P8_PATH = process.argv[2]
const KEY_ID = process.argv[3]

if (!P8_PATH || !KEY_ID) {
  console.error('Usage: node scripts/gen-apple-secret.js <path-to-.p8> <KEY_ID>')
  process.exit(1)
}

function b64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(P8_PATH))

const now = Math.floor(Date.now() / 1000)
const header = { alg: 'ES256', kid: KEY_ID }
const payload = {
  iss: TEAM_ID,
  iat: now,
  exp: now + 60 * 60 * 24 * 180, // 180 days — under Apple's ~6-month max
  aud: 'https://appleid.apple.com',
  sub: SERVICES_ID,
}

const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`
const signature = crypto.sign('sha256', Buffer.from(signingInput), {
  key: privateKey,
  dsaEncoding: 'ieee-p1363', // raw R||S signature — the format JWT requires
})

const jwt = `${signingInput}.${b64url(signature)}`

console.log('\nApple client secret (paste into Supabase → Auth → Providers → Apple → "Secret Key (for OAuth)"):\n')
console.log(jwt)
console.log(`\nExpires: ${new Date(payload.exp * 1000).toISOString()} — regenerate before then.\n`)
