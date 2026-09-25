import { NextRequest, NextResponse } from 'next/server'
import { auditHospitalAccess, requireHospital } from '@/lib/auth/requireHospital'

/**
 * GET /api/hospital/patients/[patientId] — the full patient profile (US-003).
 *
 * The registration row is fetched FIRST and scoped to the caller's hospital: it
 * is both the authorisation check (this patient is registered with me) and the
 * fallback source of truth. Only then is the live profile read. A patient who
 * deleted their account has no users/patients row left, so the panel falls back
 * to the snapshot rather than 404ing (US-003 AC3).
 *
 * Every call writes to hospital_audit_log — this is the DPDPA-relevant read.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ patientId: string }> },
) {
  const ctx = await requireHospital()
  if ('error' in ctx) return ctx.error
  const { supabase, hospitalId } = ctx
  const { patientId } = await params

  // Authorisation: scoped to hospital_id, so another hospital's patient is a
  // 404 here regardless of what id is supplied.
  const { data: registrations, error: regError } = await supabase
    .from('hospital_patient_registrations')
    .select('id, patient_id, registration_type, registered_since, status, patient_name, patient_phone, blood_group, known_conditions')
    .eq('hospital_id', hospitalId)
    .eq('patient_id', patientId)
    .is('archived_at', null)

  if (regError) return NextResponse.json({ error: regError.message }, { status: 500 })
  if (!registrations?.length) {
    return NextResponse.json({ error: 'Patient not found' }, { status: 404 })
  }

  await auditHospitalAccess(ctx, 'VIEW_PATIENT_PROFILE', { patientId })

  const [
    { data: user, error: userError },
    { data: patient, error: patientError },
    { data: contacts, error: contactsError },
  ] = await Promise.all([
    supabase
      .from('users')
      // '*' rather than a column list: the live users table has drifted from
      // the repo schema, and one missing column errors the whole read -- which
      // this route used to report as a deleted account.
      .select('*')
      .eq('id', patientId)
      .maybeSingle(),
    supabase
      .from('patients')
      .select(
        'user_id, dob, gender, blood_group, allergies, medication_allergies, environmental_allergies, known_conditions, current_medications, mobility_flags, organ_donor, medical_notes, address_line, insurance_provider, insurance_policy_number, insurance_policy_type, insurance_valid_from, insurance_valid_till, insurance_coverage_summary, insurer_emergency_phone',
      )
      .eq('user_id', patientId)
      .maybeSingle(),
    supabase
      .from('emergency_contacts')
      // The app never writes is_primary; selecting or ordering by it made the
      // whole read fail and every patient show "No emergency contacts".
      .select('*')
      .eq('patient_id', patientId),
  ])

  // A failed read is not a deleted account. Treating a query error as "no row"
  // told hospitals a live patient had deleted their QSoS account.
  if (userError) console.error('[hospital/patients] users read failed', patientId, userError)
  if (patientError) console.error('[hospital/patients] patients read failed', patientId, patientError)
  if (contactsError) console.error('[hospital/patients] emergency_contacts read failed', patientId, contactsError)

  // Primary first (where the column exists), then in the order they were added,
  // matching the list the patient sees in the app.
  const emergencyContacts = [...(contacts ?? [])].sort(
    (a, b) =>
      Number(!!b.is_primary) - Number(!!a.is_primary) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')),
  )

  // '*' was read, so project down: the hospital sees profile fields only, never
  // tokens or internal ids that also live on users.
  const USER_FIELDS = [
    'id', 'full_name', 'first_name', 'last_name', 'email', 'phone', 'avatar_url',
    'date_of_birth', 'gender', 'address', 'city', 'state', 'zip_code',
  ] as const
  const profile = user
    ? Object.fromEntries(USER_FIELDS.map((k) => [k, (user as Record<string, unknown>)[k] ?? null]))
    : null

  return NextResponse.json({
    // `deleted` tells the UI to present the record as a read-only historical
    // snapshot rather than a live profile that simply happens to be sparse.
    // Only when BOTH rows are confirmed absent: a patients row still existing
    // means the account was not deleted.
    deleted: !userError && !patientError && !user && !patient,
    registrations,
    user: profile,
    patient: patient ?? null,
    emergencyContacts,
  })
}
