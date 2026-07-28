import { NextRequest, NextResponse } from 'next/server'
import { DriverService } from '@/services/driverService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const resolvedParams = await params
    const driver = await DriverService.getDriverById(resolvedParams.id)

    return NextResponse.json({
      driver,
      success: true
    })
  } catch (error) {
    console.error('Error fetching driver:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch driver',
        success: false 
      },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const resolvedParams = await params
    const body = await request.json()
    
    // Validate status if provided
    if (body.status) {
      const validStatuses = ['available', 'assigned', 'on_trip', 'inactive']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { 
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            success: false 
          },
          { status: 400 }
        )
      }
    }

    // Validate is_verified if provided
    if (body.is_verified !== undefined && typeof body.is_verified !== 'boolean') {
      return NextResponse.json(
        { 
          error: 'is_verified must be a boolean value',
          success: false 
        },
        { status: 400 }
      )
    }

    // Validate coordinates if provided
    if (body.latitude !== undefined || body.longitude !== undefined) {
      if (body.latitude !== undefined && (typeof body.latitude !== 'number' || body.latitude < -90 || body.latitude > 90)) {
        return NextResponse.json(
          { 
            error: 'Latitude must be a number between -90 and 90',
            success: false 
          },
          { status: 400 }
        )
      }

      if (body.longitude !== undefined && (typeof body.longitude !== 'number' || body.longitude < -180 || body.longitude > 180)) {
        return NextResponse.json(
          { 
            error: 'Longitude must be a number between -180 and 180',
            success: false 
          },
          { status: 400 }
        )
      }
    }

    const driver = await DriverService.updateDriver(resolvedParams.id, body)

    return NextResponse.json({
      driver,
      success: true
    })
  } catch (error) {
    console.error('Error updating driver:', error)
    
    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('duplicate key')) {
      if (error.message.includes('license_number')) {
        return NextResponse.json(
          { 
            error: 'License number already exists',
            success: false 
          },
          { status: 409 }
        )
      }
      if (error.message.includes('aadhar_number')) {
        return NextResponse.json(
          { 
            error: 'Aadhar number already exists',
            success: false 
          },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to update driver',
        success: false 
      },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const resolvedParams = await params
    await DriverService.deleteDriver(resolvedParams.id)

    return NextResponse.json({
      message: 'Driver deleted successfully',
      success: true
    })
  } catch (error) {
    console.error('Error deleting driver:', error)
    
    // Handle foreign key constraint violations
    if (error instanceof Error && error.message.includes('foreign key')) {
      return NextResponse.json(
        { 
          error: 'Cannot delete driver with active SOS requests. Please resolve requests first.',
          success: false 
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to delete driver',
        success: false 
      },
      { status: 500 }
    )
  }
}
