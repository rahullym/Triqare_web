import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/users/[userId]/patient-profile
 *
 * Read-only patient profile summary for the admin user-details page: the
 * hospitals the patient picked, their insurance, and their emergency contacts.
 *
 * Uses the service-role client on purpose. The rest of the admin patient stack
 * reads through the public anon client, which returns empty rows (not errors)
 * the moment RLS is enabled on patients / emergency_contacts — an admin page
 * must not silently blank out when that happens.
 */

interface HospitalSummary {
  id: string
  name: string | null
  address_line: string | null
  phone: string | null
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { userId } = await params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const supabase = createClient()

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select(
        'user_id, dob, gender, blood_group, allergies, abha_id, insurance_provider, insurance_policy_number, insurance_valid_till, primary_hospital_id, secondary_hospital_id, updated_at'
      )
      .eq('user_id', userId)
      .maybeSingle()

    if (patientError) {
      return NextResponse.json({ error: patientError.message }, { status: 500 })
    }

    if (!patient) {
      return NextResponse.json({ has_patient_record: false })
    }

    // Look hospitals up by id rather than via an FK-hint embed so the response
    // does not depend on the live constraint names.
    const hospitalIds = [patient.primary_hospital_id, patient.secondary_hospital_id].filter(
      (id): id is string => typeof id === 'string' && id.length > 0
    )

    const hospitalsById = new Map<string, HospitalSummary>()
    if (hospitalIds.length > 0) {
      const { data: hospitals, error: hospitalsError } = await supabase
        .from('hospitals')
        .select('id, name, address_line, phone')
        .in('id', hospitalIds)
      if (hospitalsError) {
        return NextResponse.json({ error: hospitalsError.message }, { status: 500 })
      }
      for (const h of hospitals ?? []) hospitalsById.set(h.id, h as HospitalSummary)
    }

    // A dangling id (hospital row deleted) still surfaces as a row so the admin
    // can see that a selection exists even though it no longer resolves.
    const resolveHospital = (id: string | null): HospitalSummary | null => {
      if (!id) return null
      return hospitalsById.get(id) ?? { id, name: null, address_line: null, phone: null }
    }

    const { data: contacts, error: contactsError } = await supabase
      .from('emergency_contacts')
      .select('id, name, relationship, phone, email, created_at')
      .eq('patient_id', userId)
      .order('created_at', { ascending: true })

    if (contactsError) {
      return NextResponse.json({ error: contactsError.message }, { status: 500 })
    }

    return NextResponse.json({
      has_patient_record: true,
      patient: {
        dob: patient.dob,
        gender: patient.gender,
        blood_group: patient.blood_group,
        allergies: patient.allergies,
        abha_id: patient.abha_id,
        updated_at: patient.updated_at,
      },
      insurance: {
        provider: patient.insurance_provider,
        policy_number: patient.insurance_policy_number,
        valid_till: patient.insurance_valid_till,
      },
      primary_hospital: resolveHospital(patient.primary_hospital_id),
      secondary_hospital: resolveHospital(patient.secondary_hospital_id),
      emergency_contacts: contacts ?? [],
    })
  } catch (error) {
    console.error('Error in GET /api/admin/users/[userId]/patient-profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
