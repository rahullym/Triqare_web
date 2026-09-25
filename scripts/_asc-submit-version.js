#!/usr/bin/env node
/*
 * Create the 2.0.2 App Store version, attach build 6, and submit it for review.
 *
 * eas submit only uploads a binary — everything below is what App Store Connect
 * still needs before a build can reach users, and none of it happens on its own:
 *   1. an appStoreVersion record for 2.0.2 (only 2.0.0 exists today)
 *   2. "What's New" text on each localization (Apple rejects an update without it)
 *   3. the build attached to that version
 *   4. a review submission, actually submitted
 *
 * releaseType defaults to MANUAL: it passes review and then WAITS for someone
 * to press Release, rather than going live at an unpredictable hour. Set
 * RELEASE_TYPE=AFTER_APPROVAL to have it release itself the moment it is
 * approved.
 *
 * Prints what it finds at each step and stops at the first failure, so a missing
 * prerequisite (screenshots, age rating) is legible rather than a bare 409.
 */
const fs = require('fs')
const crypto = require('crypto')

const KEY_ID = 'K752QH8TUP'
const ISSUER = '886b1827-ae88-46e7-a137-5a07b904c932'
const KEY_PATH = '/Users/rahul/.appstoreconnect/private_keys/AuthKey_K752QH8TUP.p8'
const APP_ID = '6762559111'

const VERSION = process.env.VERSION || '2.0.2'
const BUILD_ID = process.env.BUILD_ID || 'cbbf66b1-eeb7-4c96-ab72-5a8b3827f7c0' // build 6
const SUBMIT = process.env.SUBMIT !== '0'
const RELEASE_TYPE = process.env.RELEASE_TYPE || 'MANUAL'

const WHATS_NEW = process.env.WHATS_NEW || `• Emergency contacts can now raise an SOS for the patient they are linked to.
• The SOS button no longer stays active abroad while your location is still being worked out.
• When no ambulance can be assigned, the app now says so plainly and offers a one-tap call to 108, instead of reporting it as a cancellation.`

function jwt() {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const input = `${b64({ alg: 'ES256', kid: KEY_ID, typ: 'JWT' })}.${b64({
    iss: ISSUER, iat: now, exp: now + 900, aud: 'appstoreconnect-v1',
  })}`
  const sig = crypto.sign('sha256', Buffer.from(input), {
    key: fs.readFileSync(KEY_PATH),
    dsaEncoding: 'ieee-p1363',
  })
  return `${input}.${sig.toString('base64url')}`
}

const TOKEN = jwt()
async function api(path, method = 'GET', body) {
  const r = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const text = await r.text()
  let parsed
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = text }
  return { status: r.status, body: parsed }
}

const errs = (res) =>
  (res.body?.errors || [])
    .map((e) => `${e.status} ${e.code}: ${e.title}${e.detail ? ' — ' + e.detail : ''}`)
    .join('\n    ') || JSON.stringify(res.body).slice(0, 400)

;(async () => {
  // 1. The version record ------------------------------------------------------
  const existing = await api(
    `/v1/apps/${APP_ID}/appStoreVersions?filter[versionString]=${VERSION}&fields[appStoreVersions]=versionString,appStoreState,releaseType`
  )
  let versionId = existing.body?.data?.[0]?.id
  if (versionId) {
    console.log(`✓ version ${VERSION} already exists (${existing.body.data[0].attributes.appStoreState}) — reusing`)
  } else {
    const created = await api('/v1/appStoreVersions', 'POST', {
      data: {
        type: 'appStoreVersions',
        attributes: { platform: 'IOS', versionString: VERSION, releaseType: RELEASE_TYPE },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    })
    if (created.status !== 201) return console.log(`✗ create version failed (${created.status}):\n    ${errs(created)}`)
    versionId = created.body.data.id
    console.log(`✓ created version ${VERSION} (${RELEASE_TYPE} release) — ${versionId}`)
  }

  // 2. What's New --------------------------------------------------------------
  const locs = await api(
    `/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations?fields[appStoreVersionLocalizations]=locale,whatsNew`
  )
  if (!locs.body?.data?.length) {
    console.log(`✗ no localizations on the version — metadata must be set in App Store Connect first:\n    ${errs(locs)}`)
    return
  }
  for (const l of locs.body.data) {
    const patched = await api(`/v1/appStoreVersionLocalizations/${l.id}`, 'PATCH', {
      data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew: WHATS_NEW } },
    })
    console.log(
      patched.status === 200
        ? `✓ what's-new set for ${l.attributes.locale}`
        : `✗ what's-new failed for ${l.attributes.locale} (${patched.status}):\n    ${errs(patched)}`
    )
  }

  // 3. Attach the build --------------------------------------------------------
  const attached = await api(`/v1/appStoreVersions/${versionId}/relationships/build`, 'PATCH', {
    data: { type: 'builds', id: BUILD_ID },
  })
  if (attached.status !== 204) return console.log(`✗ attaching the build failed (${attached.status}):\n    ${errs(attached)}`)
  console.log(`✓ build attached (${BUILD_ID})`)

  if (!SUBMIT) return console.log('\nSUBMIT=0 — stopping before review submission.')

  // 4. Review submission -------------------------------------------------------
  const open = await api(
    `/v1/reviewSubmissions?filter[app]=${APP_ID}&filter[state]=READY_FOR_REVIEW,WAITING_FOR_REVIEW,IN_REVIEW&fields[reviewSubmissions]=state`
  )
  let submissionId = open.body?.data?.[0]?.id
  if (submissionId) {
    console.log(`• reusing open review submission ${submissionId} (${open.body.data[0].attributes.state})`)
  } else {
    const rs = await api('/v1/reviewSubmissions', 'POST', {
      data: {
        type: 'reviewSubmissions',
        attributes: { platform: 'IOS' },
        relationships: { app: { data: { type: 'apps', id: APP_ID } } },
      },
    })
    if (rs.status !== 201) return console.log(`✗ create review submission failed (${rs.status}):\n    ${errs(rs)}`)
    submissionId = rs.body.data.id
    console.log(`✓ review submission created — ${submissionId}`)
  }

  const item = await api('/v1/reviewSubmissionItems', 'POST', {
    data: {
      type: 'reviewSubmissionItems',
      relationships: {
        reviewSubmission: { data: { type: 'reviewSubmissions', id: submissionId } },
        appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } },
      },
    },
  })
  if (item.status !== 201 && item.status !== 409) {
    return console.log(`✗ adding the version to the submission failed (${item.status}):\n    ${errs(item)}`)
  }
  console.log(item.status === 409 ? '• version already on the submission' : '✓ version added to the submission')

  const sent = await api(`/v1/reviewSubmissions/${submissionId}`, 'PATCH', {
    data: { type: 'reviewSubmissions', id: submissionId, attributes: { submitted: true } },
  })
  if (sent.status !== 200) return console.log(`✗ submitting failed (${sent.status}):\n    ${errs(sent)}`)
  console.log(`✓ SUBMITTED for App Review — state now ${sent.body?.data?.attributes?.state}`)
})().catch((e) => console.error('FATAL', e.message))
