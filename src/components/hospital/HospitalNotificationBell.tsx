'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useChime } from '@/hooks/useChime'
import { useHospitalRealtime } from '@/hooks/useHospitalRealtime'
import { useHospital } from './HospitalContext'

interface HospitalNotification {
  id: string
  type: string
  message: string
  read_at: string | null
  created_at: string
}

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

/** Notification centre (6.11): bell, unread badge, mark one or all as read. */
export function HospitalNotificationBell() {
  const { hospital } = useHospital()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<HospitalNotification[]>([])
  const [unread, setUnread] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const { play, blocked } = useChime()
  // Ids already on screen. null until the first load, so opening the dashboard
  // does not chime for the backlog.
  const seen = useRef<Set<string> | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/hospital/notifications')
    if (!res.ok) return
    const data = await res.json()
    const list: HospitalNotification[] = data.notifications ?? []
    // SOS notifications are left to the beacon, which already sounds the siren.
    const fresh = list.some((n) => !n.read_at && n.type !== 'SOS' && seen.current && !seen.current.has(n.id))
    seen.current = new Set(list.map((n) => n.id))
    if (fresh) play()
    setItems(list)
    setUnread(data.unread ?? 0)
  }, [play])

  useEffect(() => {
    if (hospital) void load()
  }, [hospital, load])

  useHospitalRealtime('hospital_notifications', hospital?.hospitalId ?? null, {
    onChange: () => void load(),
  })

  // Close on outside click so the panel does not sit over the patient list.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function mark(body: { id?: string; all?: boolean }) {
    await fetch('/api/hospital/notifications/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    void load()
  }

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        className="relative rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
      >
        <span aria-hidden className="text-lg">🔔</span>
        {blocked && (
          <span className="absolute -bottom-1 -right-1 text-[10px]" title="Click anywhere on the page to enable notification sound">
            🔇
          </span>
        )}
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#cc3333] px-1 text-[11px] font-bold text-white">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-96 overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <span className="text-sm font-semibold text-[#003366]">Notifications</span>
            {unread > 0 && (
              <button onClick={() => mark({ all: true })} className="text-xs font-medium text-[#cc3333] hover:underline">
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-neutral-500">Nothing yet.</p>
            ) : (
              items.map((n) => (
                <button
                  key={n.id}
                  onClick={() => !n.read_at && mark({ id: n.id })}
                  className={`flex w-full gap-3 border-b border-neutral-100 px-4 py-3 text-left last:border-0 hover:bg-neutral-50 ${
                    n.read_at ? 'opacity-60' : ''
                  }`}
                >
                  <span
                    aria-hidden
                    className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-[#cc3333]'}`}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug text-neutral-800">{n.message}</span>
                    <span className="mt-1 block text-xs text-neutral-400">{timeAgo(n.created_at)}</span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
