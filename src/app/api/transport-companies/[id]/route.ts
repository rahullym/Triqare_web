import { NextRequest, NextResponse } from 'next/server'
import { TransportCompanyService } from '@/services/transportCompanyService'
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
    const transportCompany = await TransportCompanyService.getTransportCompanyById(resolvedParams.id)

    return NextResponse.json({
      transportCompany,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport company:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch transport company',
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

    // Validate license_valid_till format if provided
    if (body.license_valid_till) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(body.license_valid_till)) {
        return NextResponse.json(
          { 
            error: 'Invalid license_valid_till format. Use YYYY-MM-DD',
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

    const transportCompany = await TransportCompanyService.updateTransportCompany(resolvedParams.id, body)

    return NextResponse.json({
      transportCompany,
      success: true
    })
  } catch (error) {
    console.error('Error updating transport company:', error)
    
    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('duplicate key')) {
      if (error.message.includes('registration_number')) {
        return NextResponse.json(
          { 
            error: 'Registration number already exists',
            success: false 
          },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to update transport company',
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
    await TransportCompanyService.deleteTransportCompany(resolvedParams.id)

    return NextResponse.json({
      message: 'Transport company deleted successfully',
      success: true
    })
  } catch (error) {
    console.error('Error deleting transport company:', error)
    
    // Handle foreign key constraint violations
    if (error instanceof Error && error.message.includes('foreign key')) {
      return NextResponse.json(
        { 
          error: 'Cannot delete transport company with associated drivers. Please remove drivers first.',
          success: false 
        },
        { status: 409 }
      )
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to delete transport company',
        success: false 
      },
      { status: 500 }
    )
  }
}
