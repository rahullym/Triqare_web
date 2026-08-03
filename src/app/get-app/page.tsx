'use client'

import { useEffect, useState } from 'react'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appLinks'

/**
 * One link that does the right thing: open QSoS if it is installed, otherwise
 * send the visitor to their store listing.
 *
 * WHY A WEB PAGE AND NOT A LINK STRAIGHT TO THE APP. Emails cannot run code and
 * cannot see what is installed on the device, so an invite can only ever carry a
 * single static URL. That URL has to land somewhere that CAN make the decision.
 * This page is that somewhere — `/get-app` is what every "Get the app" call to
 * action points at.
 *
 * ANDROID uses an `intent:` URL. Chrome resolves it against the installed package
 * and, when the package is absent, follows `S.browser_fallback_url` to Play by
 * itself. That is a first-class Android mechanism: no timers, no guessing, and no
 * error dialog when the app is missing.
 *
 * iOS has no such mechanism, so it gets the classic race: ask for the custom
 * scheme, and if we are still on screen a moment later, conclude nothing handled
 * it and go to the App Store. `pagehide`/`visibilitychange` cancel the fallback
 * when the app DOES open — without that, a user who gets handed off to the app
 * comes back to Safari sitting on the App Store page.
 *
 * DESKTOP gets neither; it just shows both badges, because there is nothing to
 * open and silently redirecting a laptop to a phone store is a dead end.
 *
 * A future upgrade is Android App Links + iOS Universal Links, which would let
 * `https://triqare.com/get-app` open the app with no interstitial at all. That
 * needs `.well-known/assetlinks.json` (signing-cert fingerprint), an
 * apple-app-site-association file, and native intent-filter/entitlement changes —
 * a bigger change than this page, and this page keeps working underneath it.
 */

const APP_SCHEME_URL = 'qsos://'
const ANDROID_PACKAGE = 'com.sosapp.emergency'
const IOS_FALLBACK_MS = 1500

type Platform = 'android' | 'ios' | 'desktop'

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop'
  const ua = navigator.userAgent || ''
  if (/android/i.test(ua)) return 'android'
  // iPadOS 13+ reports a desktop UA, so the touch-point check is what catches iPads.
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Macintosh/.test(ua) && typeof document !== 'undefined' && navigator.maxTouchPoints > 1) return 'ios'
  return 'desktop'
}

export default function GetAppPage() {
  const [platform, setPlatform] = useState<Platform | null>(null)

  useEffect(() => {
    const detected = detectPlatform()
    setPlatform(detected)

    if (detected === 'android') {
      const fallback = encodeURIComponent(PLAY_STORE_URL)
      window.location.replace(
        `intent://open#Intent;scheme=qsos;package=${ANDROID_PACKAGE};S.browser_fallback_url=${fallback};end`
      )
      return
    }

    if (detected === 'ios') {
      let cancelled = false
      // If the app takes over, this tab is backgrounded — that is our only signal
      // that the scheme was handled, so use it to call off the store redirect.
      const cancel = () => {
        cancelled = true
      }
      const onVisibility = () => {
        if (document.visibilityState === 'hidden') cancel()
      }
      window.addEventListener('pagehide', cancel)
      document.addEventListener('visibilitychange', onVisibility)

      window.location.href = APP_SCHEME_URL
      const timer = window.setTimeout(() => {
        if (!cancelled) window.location.replace(APP_STORE_URL)
      }, IOS_FALLBACK_MS)

      return () => {
        window.clearTimeout(timer)
        window.removeEventListener('pagehide', cancel)
        document.removeEventListener('visibilitychange', onVisibility)
      }
    }
  }, [])

  const isMobile = platform === 'android' || platform === 'ios'

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md text-center">
        <h1 className="text-2xl font-semibold text-slate-900">TriQare QSoS</h1>
        <p className="mt-3 text-slate-600">
          {isMobile
            ? 'Opening the app… if nothing happens, use the link below to install it.'
            : 'QSoS is a mobile app. Install it on your phone to continue.'}
        </p>

        {/* Always rendered, never only a fallback: an automatic redirect can be
            blocked by an in-app email browser, and the visitor still needs a way out. */}
        <div className="mt-8 flex flex-col items-center gap-3">
          {platform !== 'ios' && (
            <a
              href={PLAY_STORE_URL}
              className="inline-flex w-64 items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Get it on Google Play
            </a>
          )}
          {platform !== 'android' && (
            <a
              href={APP_STORE_URL}
              className="inline-flex w-64 items-center justify-center rounded-lg bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              Download on the App Store
            </a>
          )}
        </div>

        {isMobile && (
          <p className="mt-6 text-sm text-slate-500">
            Already installed?{' '}
            <a href={APP_SCHEME_URL} className="font-semibold text-[#cc3333] underline">
              Open QSoS
            </a>
          </p>
        )}
      </div>
    </main>
  )
}
