'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { HOSPITAL_CARD } from '@/components/hospital/StatTile'

interface ProfileResponse {
  deleted: boolean
  registrations: {
    id: string
    registration_type: 'PRIMARY' | 'SECONDARY'
    registered_since: string
    status: 'ACTIVE' | 'INACTIVE'
    patient_name: string | null
    patient_phone: string | null
    blood_group: string | null
    known_conditions: string | null
  }[]
  user: Record<string, string | null> | null
  patient: Record<string, string | number | boolean | null> | null
  emergencyContacts: {
    id: string
    name: string
    relationship: string | null
    phone: string | null
    email: string | null
    is_primary?: boolean
  }[]
}

/**
 * Fields the QSoS app does not yet capture render as "Not provided" rather than
 * being hidden. The section is part of the clinical picture whether or not this
 * patient filled it in, and an absent row is indistinguishable from a row that
 * was never asked for.
 */
const NOT_PROVIDED = 'Not provided'

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  const empty = value == null || String(value).trim() === ''
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-neutral-400">{label}</dt>
      <dd className={empty ? 'text-sm text-neutral-400' : 'text-sm text-neutral-800'}>
        {empty ? NOT_PROVIDED : value}
      </dd>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={`${HOSPITAL_CARD} p-6`}>
      <h2 className="mb-4 text-base font-semibold text-[#003366]">{title}</h2>
      {children}
    </section>
  )
}

function ageFrom(dob: string | null | undefined): string | null {
  if (!dob) return null
  const birth = new Date(dob)
  if (Number.isNaN(birth.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - birth.getFullYear()
  const m = now.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--
  return `${age} years`
}

export default function HospitalPatientProfilePage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = use(params)
  const [data, setData] = useState<ProfileResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Re-fetched on focus so an update made in the QSoS app shows up without the
  // admin reaching for refresh (US-003 AC2).
  useEffect(() => {
    let cancelled = false
    const load = async () => {
      const res = await fetch(`/api/hospital/patients/${patientId}`)
      const body = await res.json()
      if (cancelled) return
      if (!res.ok) setError(body.error ?? 'Could not load this patient.')
      else setData(body)
    }
    void load()
    const onFocus = () => void load()
    window.addEventListener('focus', onFocus)
    const timer = window.setInterval(load, 30_000)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
      window.clearInterval(timer)
    }
  }, [patientId])

  if (error) {
    return (
      <div className={`${HOSPITAL_CARD} p-8 text-center`}>
        <p className="text-sm text-[#cc3333]">{error}</p>
        <Link href="/hospital/patients" className="mt-4 inline-block text-sm font-medium text-[#003366] hover:underline">
          Back to patients
        </Link>
      </div>
    )
  }
  if (!data) return <p className="text-sm text-neutral-500">Loading patient…</p>

  const reg = data.registrations[0]
  const u = data.user
  const p = data.patient
  const name = (u?.full_name as string) || reg?.patient_name || 'Unknown patient'
  const insurance = p?.insurance_provider || p?.insurance_policy_number

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          {/* The app stores the photo as a data URI on users.avatar_url. */}
          {u?.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={u.avatar_url as string}
              alt={`Photo of ${name}`}
              className="mt-6 h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white"
            />
          ) : null}
          <div>
          <Link href="/hospital/patients" className="text-sm text-neutral-500 hover:underline">
            ← Registered Patients
          </Link>
          <h1 className="mt-1 text-2xl font-semibold text-[#003366]">{name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {data.registrations.map((r) => (
              <span key={r.id} className="rounded-full bg-[#ccd9e6] px-2 py-0.5 text-xs font-semibold text-[#003366]">
                {r.registration_type}
              </span>
            ))}
            {reg?.status === 'INACTIVE' && (
              <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-semibold text-neutral-600">
                INACTIVE
              </span>
            )}
          </div>
          </div>
        </div>
      </header>

      {data.deleted && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This patient has deleted their QSoS account. What follows is the record retained by your
          hospital at the time they were registered — it is read-only and no longer updates.
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Personal Details">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Full Name" value={name} />
            <Field label="Date of Birth" value={(p?.dob as string) ?? (u?.date_of_birth as string)} />
            <Field label="Age" value={ageFrom((p?.dob as string) ?? (u?.date_of_birth as string))} />
            <Field label="Gender" value={(p?.gender as string) ?? (u?.gender as string)} />
            <Field label="Mobile Number" value={(u?.phone as string) ?? reg?.patient_phone} />
            <div className="col-span-2">
              <Field
                label="Registered Address"
                value={
                  (p?.address_line as string) ||
                  [u?.address, u?.city, u?.state, u?.zip_code].filter(Boolean).join(', ') ||
                  null
                }
              />
            </div>
          </dl>
        </Section>

        <Section title="Medical Information">
          <dl className="grid grid-cols-2 gap-4">
            <Field label="Blood Group" value={(p?.blood_group as string) ?? reg?.blood_group} />
            <Field label="Organ Donor" value={p?.organ_donor == null ? null : p.organ_donor ? 'Yes' : 'No'} />
            <div className="col-span-2">
              <Field label="Known Conditions & Diagnoses" value={(p?.known_conditions as string) ?? reg?.known_conditions} />
            </div>
            <Field label="Medication Allergies" value={(p?.medication_allergies as string) ?? (p?.allergies as string)} />
            <Field label="Environmental Allergies" value={p?.environmental_allergies as string} />
            <div className="col-span-2">
              <Field label="Current Medications" value={p?.current_medications as string} />
            </div>
            <div className="col-span-2">
              <Field label="Disability / Mobility" value={p?.mobility_flags as string} />
            </div>
            <div className="col-span-2">
              <Field label="Additional Notes" value={p?.medical_notes as string} />
            </div>
          </dl>
        </Section>

        <Section title="Insurance Details">
          {insurance ? (
            <dl className="grid grid-cols-2 gap-4">
              <Field label="Provider" value={p?.insurance_provider as string} />
              <Field label="Policy Number" value={p?.insurance_policy_number as string} />
              <Field label="Policy Type" value={p?.insurance_policy_type as string} />
              <Field label="Valid From" value={p?.insurance_valid_from as string} />
              <Field label="Valid Until" value={p?.insurance_valid_till as string} />
              <Field label="Insurer Emergency Number" value={p?.insurer_emergency_phone as string} />
              <div className="col-span-2">
                <Field label="Coverage Summary" value={p?.insurance_coverage_summary as string} />
              </div>
            </dl>
          ) : (
            <p className="text-sm text-neutral-400">No insurance information provided.</p>
          )}
        </Section>

        <Section title="Emergency Contacts">
          {data.emergencyContacts.length === 0 ? (
            <p className="text-sm text-neutral-400">No emergency contacts on file.</p>
          ) : (
            <ul className="space-y-4">
              {data.emergencyContacts.map((c, i) => (
                <li key={c.id}>
                  <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">
                    {c.is_primary || i === 0 ? 'Primary' : `Contact ${i + 1}`}
                  </p>
                  <p className="text-sm font-medium text-neutral-800">{c.name}</p>
                  <p className="text-sm text-neutral-600">
                    {[c.relationship || 'Relationship not provided', c.phone, c.email].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </div>
  )
}
