import { NextRequest, NextResponse } from 'next/server'
import { PatientService } from '@/services/patientService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/patients - Get all patients with optional filtering
export async function GET(request: NextRequest) {
  // Staff-only: patient PII must not be exposed to unauthenticated/wrong-role callers
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { searchParams } = new URL(request.url)
    
    const filters = {
      gender: searchParams.get('gender') || undefined,
      blood_group: searchParams.get('blood_group') || undefined,
      primary_hospital_id: searchParams.get('primary_hospital_id') || undefined,
      country_id: searchParams.get('country_id') || undefined,
      state_id: searchParams.get('state_id') || undefined,
      city_id: searchParams.get('city_id') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined
    }

    const result = await PatientService.getPatients(filters)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      patients: result.data,
      count: result.count
    })
  } catch (error) {
    console.error('Error in GET /api/patients:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/patients - Create a new patient
export async function POST(request: NextRequest) {
  // Admin-only write
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const body = await request.json()

    // Validate required fields
    const requiredFields = ['user_id']
    const missingFields = requiredFields.filter(field => !body[field])

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate gender if provided
    if (body.gender) {
      const validGenders = ['Male', 'Female', 'Other']
      if (!validGenders.includes(body.gender)) {
        return NextResponse.json(
          { error: 'Invalid gender. Must be one of: Male, Female, Other' },
          { status: 400 }
        )
      }
    }

    // Validate blood group if provided
    if (body.blood_group) {
      const validBloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
      if (!validBloodGroups.includes(body.blood_group)) {
        return NextResponse.json(
          { error: 'Invalid blood group. Must be one of: A+, A-, B+, B-, AB+, AB-, O+, O-' },
          { status: 400 }
        )
      }
    }

    const result = await PatientService.createPatient(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { patient: result.data },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error in POST /api/patients:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
