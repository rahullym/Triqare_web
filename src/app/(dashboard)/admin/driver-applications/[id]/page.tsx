'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { RoleGuard } from '@/components/auth/RoleGuard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { ArrowLeft, Loader2, CheckCircle2, FileText, History } from 'lucide-react'

type Status = 'pending' | 'approved' | 'rejected'

interface ApplicationDetail {
  id: string
  reference_number: string
  full_name: string
  phone: string
  email: string
  date_of_birth: string
  address: string
  city: string
  state: string
  pincode: string
  emergency_contact_name: string
  emergency_contact_phone: string
  aadhaar_number: string | null
  aadhaar_last4: string
  vehicle_registration: string
  vehicle_type: string
  vehicle_make_model: string | null
  vehicle_year: number | null
  ambulance_permit_number: string | null
  license_number: string | null
  license_last4: string
  license_expiry: string
  license_type: string | null
  driving_experience_years: number | null
  previous_ambulance_experience: boolean | null
  status: Status
  rejection_reason: string | null
  reviewed_at: string | null
  created_at: string
  documents: Record<string, { name: string; url: string | null }[]>
}

interface Prior {
  reference_number: string
  created_at: string
  status: Status
  rejection_reason: string | null
  reviewed_at: string | null
}

const MAX_REASON = 1000

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 py-1.5 text-sm">
      <dt className="text-[#666666]">{label}</dt>
      <dd className="col-span-2 break-words text-[#1a1a1a]">{value || '—'}</dd>
    </div>
  )
}

export default function ApplicationDetailPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const [app, setApp] = useState<ApplicationDetail | null>(null)
  const [priors, setPriors] = useState<Prior[]>([])
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/driver-applications/${id}`)
      if (!res.ok) throw new Error('load failed')
      const data = (await res.json()) as { application: ApplicationDetail; priors: Prior[] }
      setApp(data.application)
      setPriors(data.priors)
    } catch {
      toast.error('Could not load application')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void load()
  }, [load])

  const approve = async () => {
    setWorking(true)
    try {
      const res = await fetch(`/api/admin/driver-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Application approved — email sent to applicant')
      await load()
    } catch {
      toast.error('Failed to approve')
    } finally {
      setWorking(false)
    }
  }

  const confirmReject = async () => {
    if (!reason.trim()) {
      setReasonError('Please enter rejection reason')
      return
    }
    setWorking(true)
    try {
      const res = await fetch(`/api/admin/driver-applications/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason: reason.trim() }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error)
      }
      toast.success('Application rejected — email sent to applicant')
      setRejectOpen(false)
      setReason('')
      await load()
    } catch (e) {
      toast.error(e instanceof Error && e.message ? e.message : 'Failed to reject')
    } finally {
      setWorking(false)
    }
  }

  return (
    <RoleGuard allowedRoles={['admin']}>
      <div className="mx-auto max-w-3xl space-y-5 p-4 sm:p-6">
        <Link href="/admin/driver-applications" className="inline-flex items-center gap-1 text-sm text-[#003366] hover:underline">
          <ArrowLeft className="h-4 w-4" /> Back to applications
        </Link>

        {loading || !app ? (
          <div className="flex items-center justify-center py-16 text-[#666666]">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h1 className="text-xl font-bold text-[#1a1a1a]">{app.full_name}</h1>
                <p className="text-sm text-[#666666]">{app.reference_number}</p>
              </div>
              <Badge
                className={
                  app.status === 'approved'
                    ? 'bg-green-100 text-green-800 border-green-200'
                    : app.status === 'rejected'
                      ? 'bg-red-100 text-red-800 border-red-200'
                      : 'bg-amber-100 text-amber-800 border-amber-200'
                }
              >
                {app.status.charAt(0).toUpperCase() + app.status.slice(1)}
              </Badge>
            </div>

            {/* Personal */}
            <Card className="border-[#e6e6e6]">
              <CardHeader className="pb-2"><CardTitle className="text-base text-[#003366]">Personal</CardTitle></CardHeader>
              <CardContent>
                <dl className="divide-y divide-[#f0f0f0]">
                  <Row label="Phone" value={app.phone} />
                  <Row label="Email" value={app.email} />
                  <Row label="Date of Birth" value={app.date_of_birth} />
                  <Row label="Address" value={app.address} />
                  <Row label="City" value={app.city} />
                  <Row label="State" value={app.state} />
                  <Row label="Pincode" value={app.pincode} />
                  <Row label="Aadhaar" value={app.aadhaar_number ?? `••••••••${app.aadhaar_last4}`} />
                  <Row label="Emergency Contact" value={`${app.emergency_contact_name} · ${app.emergency_contact_phone}`} />
                </dl>
              </CardContent>
            </Card>

            {/* Vehicle */}
            <Card className="border-[#e6e6e6]">
              <CardHeader className="pb-2"><CardTitle className="text-base text-[#003366]">Vehicle</CardTitle></CardHeader>
              <CardContent>
                <dl className="divide-y divide-[#f0f0f0]">
                  <Row label="Registration" value={app.vehicle_registration} />
                  <Row label="Type" value={app.vehicle_type} />
                  <Row label="Make / Model" value={app.vehicle_make_model} />
                  <Row label="Year" value={app.vehicle_year} />
                  <Row label="Ambulance Permit" value={app.ambulance_permit_number} />
                </dl>
              </CardContent>
            </Card>

            {/* License */}
            <Card className="border-[#e6e6e6]">
              <CardHeader className="pb-2"><CardTitle className="text-base text-[#003366]">License</CardTitle></CardHeader>
              <CardContent>
                <dl className="divide-y divide-[#f0f0f0]">
                  <Row label="License No." value={app.license_number ?? `••••${app.license_last4}`} />
                  <Row label="Expiry" value={app.license_expiry} />
                  <Row label="Type" value={app.license_type} />
                  <Row label="Experience" value={app.driving_experience_years != null ? `${app.driving_experience_years} yrs` : '—'} />
                  <Row label="Prev. Ambulance Exp." value={app.previous_ambulance_experience == null ? '—' : app.previous_ambulance_experience ? 'Yes' : 'No'} />
                </dl>
              </CardContent>
            </Card>

            {/* Documents */}
            <Card className="border-[#e6e6e6]">
              <CardHeader className="pb-2"><CardTitle className="text-base text-[#003366]">Documents</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {Object.entries(app.documents).map(([type, files]) => (
                  <div key={type} className="text-sm">
                    <p className="font-medium text-[#333333]">{type.replace(/_/g, ' ')}</p>
                    <ul className="mt-1 space-y-1">
                      {files.map((f, i) => (
                        <li key={i}>
                          {f.url ? (
                            <a href={f.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[#003366] hover:underline">
                              <FileText className="h-3.5 w-3.5" /> {f.name}
                            </a>
                          ) : (
                            <span className="text-[#999999]">{f.name} (unavailable)</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Reapplication history */}
            {priors.length > 0 && (
              <Card className="border-[#ccd9e6]">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-[#003366]">
                    <History className="h-4 w-4" /> Reapplication history
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {priors.map((p) => (
                    <div key={p.reference_number} className="rounded border border-[#e6e6e6] p-2 text-sm">
                      <span className="font-medium">{p.reference_number}</span> · {p.status} ·{' '}
                      {new Date(p.created_at).toLocaleDateString()}
                      {p.rejection_reason && <p className="mt-1 text-xs text-[#cc3333]">Reason: {p.rejection_reason}</p>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Review status / actions */}
            {app.status === 'pending' ? (
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setRejectOpen(true)} disabled={working} className="border-[#cc3333] text-[#cc3333] hover:bg-[#f5cccc]/30">
                  Reject
                </Button>
                <Button onClick={approve} disabled={working} className="bg-green-600 text-white hover:bg-green-700">
                  {working ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                  Approve
                </Button>
              </div>
            ) : (
              <div className="rounded-md border border-[#e6e6e6] bg-[#f9f9f9] p-3 text-sm text-[#666666]">
                {app.status === 'approved' ? 'Approved' : 'Rejected'}
                {app.reviewed_at && ` on ${new Date(app.reviewed_at).toLocaleString()}`}
                {app.rejection_reason && <p className="mt-1 text-[#cc3333]">Reason: {app.rejection_reason}</p>}
              </div>
            )}
          </>
        )}

        {/* Reject modal */}
        <Dialog open={rejectOpen} onOpenChange={(o) => { setRejectOpen(o); if (!o) setReasonError(null) }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Application{app ? ` - ${app.full_name}` : ''}</DialogTitle>
              <DialogDescription>
                Provide a clear reason. It will be emailed to the applicant.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Textarea
                value={reason}
                onChange={(e) => { setReason(e.target.value); if (reasonError) setReasonError(null) }}
                maxLength={MAX_REASON}
                rows={5}
                placeholder="e.g., Driving license expired, Police verification certificate missing..."
                aria-invalid={!!reasonError}
                className={reasonError ? 'border-[#cc3333]' : ''}
              />
              <div className="flex justify-between text-xs">
                <span className="text-[#cc3333]">{reasonError}</span>
                <span className="text-[#999999]">{reason.length}/{MAX_REASON}</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectOpen(false)} disabled={working}>Cancel</Button>
              <Button onClick={confirmReject} disabled={working} className="bg-[#cc3333] text-white hover:bg-[#b32d2d]">
                {working && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Confirm Rejection
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </RoleGuard>
  )
}
