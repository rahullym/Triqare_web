import { NextRequest, NextResponse } from 'next/server'
import { PatientService } from '@/services/patientService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/patients/[id] - Get a single patient by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Staff-only: patient PII must not be exposed to unauthenticated/wrong-role callers
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      )
    }

    const result = await PatientService.getPatientById(id)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    if (!result.data) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ patient: result.data })
  } catch (error) {
    console.error('Error in GET /api/patients/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/patients/[id] - Update a patient
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Admin-only write
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const { id } = await params
    const body = await request.json()

    if (!id) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
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

    const result = await PatientService.updatePatient(id, body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    if (!result.data) {
      return NextResponse.json(
        { error: 'Patient not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ patient: result.data })
  } catch (error) {
    console.error('Error in PUT /api/patients/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/patients/[id] - Delete a patient
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Admin-only write
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'Patient ID is required' },
        { status: 400 }
      )
    }

    const result = await PatientService.deletePatient(id)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ message: 'Patient deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/patients/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
