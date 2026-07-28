import { NextRequest, NextResponse } from 'next/server'
import { HospitalService } from '@/services/hospitalService'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/hospitals/stats - Get hospital statistics
export async function GET(request: NextRequest) {
  // Staff-only read
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const result = await HospitalService.getHospitalStats()

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ stats: result.data })
  } catch (error) {
    console.error('Error in GET /api/hospitals/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
