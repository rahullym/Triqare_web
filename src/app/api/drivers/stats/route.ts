import { NextRequest, NextResponse } from 'next/server'
import { DriverService } from '@/services/driverService'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

export async function GET(request: NextRequest) {
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const stats = await DriverService.getDriverStats()

    return NextResponse.json({
      stats,
      success: true
    })
  } catch (error) {
    console.error('Error fetching driver stats:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch driver stats',
        success: false 
      },
      { status: 500 }
    )
  }
}
