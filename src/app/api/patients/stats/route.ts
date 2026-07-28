import { NextRequest, NextResponse } from 'next/server'
import { PatientService } from '@/services/patientService'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/patients/stats - Get patient statistics
export async function GET(request: NextRequest) {
  // Staff-only: patient PII must not be exposed to unauthenticated/wrong-role callers
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const result = await PatientService.getPatientStats()

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ stats: result.data })
  } catch (error) {
    console.error('Error in GET /api/patients/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
