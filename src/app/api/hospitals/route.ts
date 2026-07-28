import { NextRequest, NextResponse } from 'next/server'
import { HospitalService } from '@/services/hospitalService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/hospitals - Get all hospitals with optional filtering
export async function GET(request: NextRequest) {
  // Staff-only read
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { searchParams } = new URL(request.url)
    
    const filters = {
      status: searchParams.get('status') || undefined,
      hospital_type: searchParams.get('hospital_type') || undefined,
      city_id: searchParams.get('city_id') || undefined,
      pincode_id: searchParams.get('pincode_id') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined
    }

    const result = await HospitalService.getHospitals(filters)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      hospitals: result.data,
      count: result.count
    })
  } catch (error) {
    console.error('Error in GET /api/hospitals:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/hospitals - Create a new hospital
export async function POST(request: NextRequest) {
  // Admin-only write
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const body = await request.json()

    // Validate required fields
    const requiredFields = ['name', 'hospital_type', 'address_line', 'phone', 'emergency_contact_person', 'emergency_contact_phone']
    const missingFields = requiredFields.filter(field => !body[field])

    if (missingFields.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missingFields.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate hospital_type
    const validTypes = ['government', 'private', 'specialty', 'other']
    if (!validTypes.includes(body.hospital_type)) {
      return NextResponse.json(
        { error: 'Invalid hospital_type. Must be one of: government, private, specialty, other' },
        { status: 400 }
      )
    }

    // Validate status if provided
    if (body.status) {
      const validStatuses = ['active', 'inactive', 'under_review', 'suspended']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be one of: active, inactive, under_review, suspended' },
          { status: 400 }
        )
      }
    }

    const result = await HospitalService.createHospital(body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { hospital: result.data },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error in POST /api/hospitals:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
