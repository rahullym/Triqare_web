import { NextRequest, NextResponse } from 'next/server'
import { HospitalService } from '@/services/hospitalService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

// GET /api/hospitals/[id] - Get a single hospital by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Staff-only read
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { id } = await params

    if (!id) {
      return NextResponse.json(
        { error: 'Hospital ID is required' },
        { status: 400 }
      )
    }

    const result = await HospitalService.getHospitalById(id)

    if (result.error) {
      if (result.error.includes('No rows returned')) {
        return NextResponse.json(
          { error: 'Hospital not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ hospital: result.data })
  } catch (error) {
    console.error('Error in GET /api/hospitals/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/hospitals/[id] - Update a hospital
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
        { error: 'Hospital ID is required' },
        { status: 400 }
      )
    }

    // Validate hospital_type if provided
    if (body.hospital_type) {
      const validTypes = ['government', 'private', 'specialty', 'other']
      if (!validTypes.includes(body.hospital_type)) {
        return NextResponse.json(
          { error: 'Invalid hospital_type. Must be one of: government, private, specialty, other' },
          { status: 400 }
        )
      }
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

    const result = await HospitalService.updateHospital(id, body)

    if (result.error) {
      if (result.error.includes('No rows returned')) {
        return NextResponse.json(
          { error: 'Hospital not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({ hospital: result.data })
  } catch (error) {
    console.error('Error in PUT /api/hospitals/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/hospitals/[id] - Delete a hospital
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
        { error: 'Hospital ID is required' },
        { status: 400 }
      )
    }

    const result = await HospitalService.deleteHospital(id)

    if (result.error) {
      if (result.error.includes('No rows returned')) {
        return NextResponse.json(
          { error: 'Hospital not found' },
          { status: 404 }
        )
      }
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { message: 'Hospital deleted successfully' },
      { status: 200 }
    )
  } catch (error) {
    console.error('Error in DELETE /api/hospitals/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
