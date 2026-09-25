'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Building2, ExternalLink, HeartPulse, Loader2, Phone, ShieldCheck, Users } from 'lucide-react'

interface HospitalSummary {
  id: string
  name: string | null
  address_line: string | null
  phone: string | null
}

interface ContactRow {
  id: string
  name: string | null
  relationship: string | null
  phone: string | null
  email: string | null
}

interface PatientProfileResponse {
  has_patient_record: boolean
  patient?: {
    dob: string | null
    gender: string | null
    blood_group: string | null
    allergies: string | null
    abha_id: string | null
  }
  insurance?: {
    provider: string | null
    policy_number: string | null
    valid_till: string | null
  }
  primary_hospital?: HospitalSummary | null
  secondary_hospital?: HospitalSummary | null
  emergency_contacts?: ContactRow[]
}

// "27 Jul 2026"
function formatDate(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-gray-500">{label}</div>
      <div className={value ? 'text-sm text-gray-900' : 'text-sm text-gray-400'}>
        {value || 'Not provided'}
      </div>
    </div>
  )
}

function HospitalBlock({ label, hospital }: { label: string; hospital?: HospitalSummary | null }) {
  return (
    <div className="rounded-lg border bg-gray-50 p-3">
      <div className="text-xs uppercase tracking-wide text-gray-500 mb-1">{label}</div>
      {!hospital ? (
        <div className="text-sm text-gray-400">Not selected</div>
      ) : (
        <>
          <div className="text-sm font-medium text-gray-900">
            {hospital.name || <span className="text-amber-700">Hospital record missing ({hospital.id.slice(0, 8)}…)</span>}
          </div>
          {hospital.address_line && <div className="text-xs text-gray-600">{hospital.address_line}</div>}
          {hospital.phone && (
            <div className="text-xs text-gray-600 flex items-center mt-0.5">
              <Phone className="h-3 w-3 mr-1" />
              {hospital.phone}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Read-only patient profile panel for the admin user-details page: hospitals,
 * insurance, emergency contacts and the key medical fields the patient entered
 * in the mobile app. Editing lives on the full patient record
 * (/admin/patients/[userId]); this card links there.
 *
 * Renders nothing for accounts that have no patient row.
 */
export function UserPatientProfileCard({ userId }: { userId: string }) {
  const [data, setData] = useState<PatientProfileResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setFailed(false)
      try {
        const res = await fetch(`/api/admin/users/${userId}/patient-profile`)
        if (!res.ok) {
          if (!cancelled) setFailed(true)
          return
        }
        const json: PatientProfileResponse = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  if (!loading && !failed && data && !data.has_patient_record) return null

  const contacts = data?.emergency_contacts ?? []

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center">
              <HeartPulse className="h-5 w-5 mr-2" />
              Patient Profile
            </CardTitle>
            <CardDescription>
              Hospitals, insurance and emergency contacts as entered in the app. Read-only here —
              open the patient record to change them.
            </CardDescription>
          </div>
          {data?.has_patient_record && (
            <Link href={`/admin/patients/${userId}`}>
              <Button type="button" variant="outline" size="sm">
                <ExternalLink className="h-4 w-4 mr-1" />
                Open patient record
              </Button>
            </Link>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {loading ? (
          <div className="flex items-center text-sm text-gray-500">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading patient profile…
          </div>
        ) : failed || !data ? (
          <p className="text-sm text-red-600">Could not load the patient profile.</p>
        ) : (
          <>
            {/* Hospitals */}
            <section>
              <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Building2 className="h-4 w-4 mr-1.5 text-blue-600" />
                Hospitals
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <HospitalBlock label="Primary hospital" hospital={data.primary_hospital} />
                <HospitalBlock label="Secondary hospital" hospital={data.secondary_hospital} />
              </div>
            </section>

            {/* Insurance */}
            <section>
              <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <ShieldCheck className="h-4 w-4 mr-1.5 text-green-600" />
                Insurance
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 rounded-lg border bg-gray-50 p-3">
                <Field label="Provider" value={data.insurance?.provider} />
                <Field label="Policy number" value={data.insurance?.policy_number} />
                <Field
                  label="Valid till"
                  value={data.insurance?.valid_till ? formatDate(data.insurance.valid_till) : null}
                />
              </div>
            </section>

            {/* Emergency contacts */}
            <section>
              <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <Users className="h-4 w-4 mr-1.5 text-teal-600" />
                Emergency contacts
                <Badge className="ml-2 bg-gray-100 text-gray-700">{contacts.length}</Badge>
              </div>
              {contacts.length === 0 ? (
                <p className="text-sm text-gray-400">No emergency contacts added.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {contacts.map((c) => (
                    <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <div>
                        <span className="font-medium text-gray-900">{c.name || 'Unnamed contact'}</span>
                        {c.relationship && (
                          <Badge className="ml-2 bg-gray-100 text-gray-700">{c.relationship}</Badge>
                        )}
                      </div>
                      <div className="text-gray-600 text-right">
                        {c.phone && <div>{c.phone}</div>}
                        {c.email && <div className="text-xs">{c.email}</div>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Medical basics */}
            <section>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Field label="Blood group" value={data.patient?.blood_group} />
                <Field label="Date of birth" value={data.patient?.dob ? formatDate(data.patient.dob) : null} />
                <Field label="Gender" value={data.patient?.gender} />
                <Field label="ABHA ID" value={data.patient?.abha_id} />
              </div>
              {data.patient?.allergies && (
                <div className="mt-3">
                  <Field label="Allergies" value={data.patient.allergies} />
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  )
}
