#!/usr/bin/env node
/*
 * READ-ONLY: is the promoted build ACTUALLY serving to users?
 *
 * The Play Developer API is not proof of publication. With managed publishing
 * ON, `edits.commit` succeeds and tracks.get reports `status: completed` while
 * the release sits in "Ready to publish" and reaches nobody — which is exactly
 * how 2.0.3 and 2.0.4 both silently failed to ship. The only ground truth is
 * the public store listing, so check that after EVERY promote.
 *
 *   node scripts/_play-verify-live.js            # expects app.json's version
 *   EXPECT=2.0.4 node scripts/_play-verify-live.js
 */
const PKG = 'com.sosapp.emergency'
const IOS_BUNDLE = 'com.triqare.qsos'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36'

const expected =
  process.env.EXPECT ||
  require('/Users/rahul/Triqare/Triqare-app/app.json').expo.version

;(async () => {
  // SAMPLE, don't single-shot. While a release propagates, Google's fleet
  // serves the old and new listing side by side — consecutive identical
  // requests returned 2.0.4, 2.0.4, then 2.0.2. One fetch is a coin toss and
  // will happily report either "live" or "stuck" while both are half true.
  const SAMPLES = Number(process.env.SAMPLES || 6)
  const seen = []
  for (let i = 0; i < SAMPLES; i++) {
    try {
      const html = await (
        await fetch(
          `https://play.google.com/store/apps/details?id=${PKG}&hl=en&gl=IN`,
          { headers: { 'User-Agent': UA, 'Cache-Control': 'no-cache' } }
        )
      ).text()
      // The listing's version lives in the page's data blob under key "141",
      // shaped `"141":[[["2.0.2"]],[[[minSdk]],[[[24,"7.0"]]]]]`. Do NOT just
      // regex the page for a version-shaped string — it also carries unrelated
      // Google build numbers (2.22.81) that outsort the real one.
      seen.push(html.match(/"141":\[\[\["([^"]+)"\]\]/)?.[1] || null)
    } catch (e) {
      seen.push(null)
    }
  }
  const tally = seen.reduce((a, v) => ((a[v] = (a[v] || 0) + 1), a), {})
  const hits = tally[expected] || 0
  const play = hits === SAMPLES ? expected : hits > 0 ? `${expected} on ${hits}/${SAMPLES} (propagating)` : seen[0]

  let ios = null
  try {
    const j = await (
      await fetch(`https://itunes.apple.com/lookup?bundleId=${IOS_BUNDLE}&country=in`)
    ).json()
    ios = j.results?.[0]?.version || null
  } catch (e) {
    console.log('itunes lookup failed:', e.message)
  }

  const mark = (v) => (v === expected ? 'LIVE' : `${v || '?'}`)
  console.log(`expecting ${expected}`)
  console.log(`  Play      ${mark(play)}`)
  console.log(`  App Store ${mark(ios)}`)
  console.log(`  (play samples: ${JSON.stringify(tally)})`)
  process.exit(play === expected && ios === expected ? 0 : 1)
})()
