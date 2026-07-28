import { NextRequest, NextResponse } from 'next/server'
import { HospitalService } from '@/services/hospitalService'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/hospitals/search - Search hospitals by name or address
export async function GET(request: NextRequest) {
  // Staff-only read
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { searchParams } = new URL(request.url)
    const query = searchParams.get('q')
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10

    if (!query) {
      return NextResponse.json(
        { error: 'Search query is required' },
        { status: 400 }
      )
    }

    const result = await HospitalService.searchHospitals(query, limit)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ hospitals: result.data })
  } catch (error) {
    console.error('Error in GET /api/hospitals/search:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
