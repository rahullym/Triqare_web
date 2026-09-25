'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const VOLUME_KEY = 'qsos.hospital.alertVolume'
const DEFAULT_VOLUME = 0.6

function storedVolume(): number {
  try {
    const parsed = Number.parseFloat(window.localStorage.getItem(VOLUME_KEY) ?? '')
    return Number.isFinite(parsed) ? Math.min(1, Math.max(0.15, parsed)) : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

/**
 * A short two-note chime for a new dashboard notification. Shares the SOS
 * siren's volume setting so there is one volume for the whole dashboard.
 *
 * Browsers keep an AudioContext suspended until a user gesture, so the context
 * is resumed on the first click or keypress anywhere on the page. Until then a
 * chime cannot play and `blocked` is reported for the UI to show.
 */
export function useChime() {
  const ctxRef = useRef<AudioContext | null>(null)
  const [blocked, setBlocked] = useState(false)

  const context = useCallback((): AudioContext | null => {
    if (ctxRef.current) return ctxRef.current
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctor) return null
    ctxRef.current = new Ctor()
    return ctxRef.current
  }, [])

  useEffect(() => {
    const unlock = () => {
      const ctx = context()
      if (!ctx) return
      void ctx.resume().then(() => setBlocked(ctx.state !== 'running')).catch(() => undefined)
    }
    document.addEventListener('pointerdown', unlock)
    document.addEventListener('keydown', unlock)
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
      void ctxRef.current?.close().catch(() => undefined)
      ctxRef.current = null
    }
  }, [context])

  const play = useCallback(() => {
    try {
      const ctx = context()
      if (!ctx) return
      if (ctx.state !== 'running') {
        void ctx.resume().catch(() => undefined)
        // resume() can flip the state synchronously; TS narrowing cannot know.
        if ((ctx.state as AudioContextState) !== 'running') {
          setBlocked(true)
          return
        }
      }
      const volume = storedVolume()
      // E6 then A6: bright enough to cut through a ward, short enough not to
      // be mistaken for the SOS siren.
      ;[1318.5, 1760].forEach((freq, i) => {
        const t = ctx.currentTime + i * 0.18
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'sine'
        osc.frequency.setValueAtTime(freq, t)
        gain.gain.setValueAtTime(0, t)
        gain.gain.linearRampToValueAtTime(volume, t + 0.01)
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t)
        osc.stop(t + 0.36)
      })
    } catch {
      setBlocked(true)
    }
  }, [context])

  return { play, blocked }
}
