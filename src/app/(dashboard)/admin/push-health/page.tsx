'use client'

import { useState, useEffect } from 'react'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui/table'
import { LoadingSkeleton } from '@/components/ui/loading-skeleton'
import {
  BellRing,
  Send,
  XCircle,
  Ban,
  Activity,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'

interface ByEvent {
  event: string
  attempts: number
  recipients: number
  sent: number
  failed: number
}

interface PushHealthStats {
  windowDays: number
  attempts: number
  recipients: number
  sent: number
  failed: number
  invalid: number
  notConfiguredAttempts: number
  deliveryRate: number | null
  lastAttemptAt: string | null
  byEvent: ByEvent[]
  capped: boolean
}

interface DeliveryRow {
  id: string
  request_id: string | null
  event: string
  audience: string
  recipients: number
  sent: number
  failed: number
  invalid: number
  not_configured: boolean
  created_at: string
}

const TINT = {
  navy: 'bg-[#ccd9e6] text-[#003366]',
  red: 'bg-[#f5cccc] text-[#cc3333]',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
} as const

const CARD = 'rounded-3xl bg-white shadow-[0_8px_30px_rgba(0,51,102,0.05)]'

function StatCard({ label, value, sub, icon: Icon, tint }: {
  label: string; value: React.ReactNode; sub: string; icon: typeof Send; tint: keyof typeof TINT
}) {
  return (
    <div className={`${CARD} p-5`}>
      <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-2xl ${TINT[tint]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
      <div className="mt-1 text-sm font-medium text-slate-600">{label}</div>
      <div className="mt-0.5 text-xs text-slate-400">{sub}</div>
    </div>
  )
}

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

export default function PushHealthPage() {
  const [stats, setStats] = useState<PushHealthStats | null>(null)
  const [rows, setRows] = useState<DeliveryRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/admin/push-health')
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch push health')
      }
      setStats(data.stats)
      setRows(data.rows ?? [])
      setError(null)
    } catch (err) {
      console.error('Error fetching push health:', err)
      setError(err instanceof Error ? err.message : 'Failed to load push health')
      toast.error('Failed to load push health')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchHealth()
  }, [])

  if (loading) {
    return (
      <RoleGuard allowedRoles={['admin']}>
        <div className="space-y-6">
          <LoadingSkeleton />
        </div>
      </RoleGuard>
    )
  }

  if (error || !stats) {
    return (
      <RoleGuard allowedRoles={['admin']}>
        <div className={`${CARD} mx-auto mt-6 max-w-md p-10 text-center`}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f5cccc]">
            <AlertTriangle className="h-7 w-7 text-[#cc3333]" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-slate-900">Failed to Load Push Health</h2>
          <p className="mb-5 text-sm text-slate-500">{error}</p>
          <Button onClick={fetchHealth} className="rounded-full bg-[#cc3333] hover:bg-[#b32d2d]">
            Try Again
          </Button>
        </div>
      </RoleGuard>
    )
  }

  const rate = stats.deliveryRate
  const rateTint: keyof typeof TINT = rate === null ? 'navy' : rate >= 90 ? 'emerald' : rate >= 60 ? 'amber' : 'red'

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Push Notification Health</h1>
            <p className="mt-1 text-sm text-slate-500">
              FCM delivery outcomes over the last {stats.windowDays} days
              {stats.lastAttemptAt ? ` · last send ${fmtTime(stats.lastAttemptAt)}` : ' · no sends yet'}
              {stats.capped ? ' · showing a capped sample' : ''}
            </p>
          </div>
          <Button variant="outline" onClick={fetchHealth} className="rounded-full">
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Not-configured alert — the loudest possible signal that a deploy can't send */}
        {stats.notConfiguredAttempts > 0 && (
          <div className="flex items-start gap-4 rounded-3xl border border-[#f0b4b4] bg-[#fdecec] p-5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#f5cccc]">
              <AlertTriangle className="h-5 w-5 text-[#cc3333]" />
            </span>
            <div>
              <p className="text-sm font-bold text-[#cc3333]">
                {stats.notConfiguredAttempts} send attempt{stats.notConfiguredAttempts === 1 ? '' : 's'} could not be sent — the sender is not configured
              </p>
              <p className="mt-1 text-sm text-slate-600">
                FIREBASE_SERVICE_ACCOUNT is missing or unparseable on the deploy that handled these. Nothing was
                delivered for them. Set the env var (base64 of the sos-app-24a59-8fb38 service account) and redeploy.
              </p>
            </div>
          </div>
        )}

        {/* Stat tiles */}
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <StatCard
            label="Delivery rate"
            value={rate === null ? '—' : `${rate}%`}
            sub={rate === null ? 'no sends yet' : 'delivered / attempted'}
            icon={Activity}
            tint={rateTint}
          />
          <StatCard label="Delivered" value={stats.sent} sub={`of ${stats.recipients} device(s)`} icon={Send} tint="emerald" />
          <StatCard label="Failed" value={stats.failed} sub="FCM rejected" icon={XCircle} tint={stats.failed > 0 ? 'red' : 'navy'} />
          <StatCard label="Dead tokens" value={stats.invalid} sub="pruned as invalid" icon={Ban} tint={stats.invalid > 0 ? 'amber' : 'navy'} />
          <StatCard label="Send attempts" value={stats.attempts} sub={`${stats.windowDays}-day window`} icon={BellRing} tint="navy" />
          <StatCard
            label="Unconfigured"
            value={stats.notConfiguredAttempts}
            sub={stats.notConfiguredAttempts > 0 ? 'sender not set up' : 'all deploys OK'}
            icon={AlertTriangle}
            tint={stats.notConfiguredAttempts > 0 ? 'red' : 'emerald'}
          />
        </div>

        {/* By event */}
        <div className={`${CARD} p-6`}>
          <h2 className="mb-4 text-base font-bold text-slate-900">By event ({stats.windowDays}d)</h2>
          {stats.byEvent.length === 0 ? (
            <p className="text-sm text-slate-400">No sends recorded in this window.</p>
          ) : (
            <div className="space-y-3">
              {stats.byEvent.map((e) => {
                const r = e.recipients > 0 ? Math.round((e.sent / e.recipients) * 100) : null
                return (
                  <div key={e.event} className="flex items-center justify-between gap-4">
                    <span className="font-mono text-sm text-slate-700">{e.event}</span>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="text-slate-400">{e.attempts} attempt{e.attempts === 1 ? '' : 's'}</span>
                      <span className="text-emerald-600">{e.sent} sent</span>
                      {e.failed > 0 && <span className="text-[#cc3333]">{e.failed} failed</span>}
                      <span className="w-14 text-right font-semibold text-slate-900">{r === null ? '—' : `${r}%`}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Recent deliveries table */}
        <div className={`${CARD} p-6`}>
          <h2 className="mb-4 text-base font-bold text-slate-900">Recent send attempts</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-slate-400">No send attempts recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Audience</TableHead>
                    <TableHead className="text-right">Recipients</TableHead>
                    <TableHead className="text-right">Sent</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Dead</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="whitespace-nowrap text-xs text-slate-500">{fmtTime(r.created_at)}</TableCell>
                      <TableCell className="font-mono text-xs">{r.event}</TableCell>
                      <TableCell>
                        <Badge variant={r.audience === 'contact' ? 'secondary' : 'outline'}>{r.audience}</Badge>
                      </TableCell>
                      <TableCell className="text-right">{r.recipients}</TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600">{r.sent}</TableCell>
                      <TableCell className="text-right">{r.failed > 0 ? <span className="font-semibold text-[#cc3333]">{r.failed}</span> : 0}</TableCell>
                      <TableCell className="text-right text-amber-600">{r.invalid || 0}</TableCell>
                      <TableCell>
                        {r.not_configured ? (
                          <Badge variant="destructive">not configured</Badge>
                        ) : r.failed > 0 ? (
                          <Badge variant="destructive">partial</Badge>
                        ) : (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">delivered</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>
    </RoleGuard>
  )
}
