import { NextRequest, NextResponse } from 'next/server'
import { DriverService } from '@/services/driverService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    const { id } = await params
    const body = await request.json()

    // Validate required fields
    if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
      return NextResponse.json(
        {
          error: 'Latitude and longitude are required and must be numbers',
          success: false
        },
        { status: 400 }
      )
    }

    // Validate coordinate ranges
    if (body.latitude < -90 || body.latitude > 90) {
      return NextResponse.json(
        {
          error: 'Latitude must be between -90 and 90',
          success: false
        },
        { status: 400 }
      )
    }

    if (body.longitude < -180 || body.longitude > 180) {
      return NextResponse.json(
        {
          error: 'Longitude must be between -180 and 180',
          success: false
        },
        { status: 400 }
      )
    }

    const result = await DriverService.updateDriverLocation(id, body.latitude, body.longitude)

    return NextResponse.json({
      driver: result,
      success: true
    })
  } catch (error) {
    console.error('Error updating driver location:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to update driver location',
        success: false 
      },
      { status: 500 }
    )
  }
}
