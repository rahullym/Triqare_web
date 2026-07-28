import { NextRequest, NextResponse } from 'next/server'
import { TransportCompanyService } from '@/services/transportCompanyService'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

export async function GET(request: NextRequest) {
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const stats = await TransportCompanyService.getTransportCompanyStats()

    return NextResponse.json({
      stats,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport company stats:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch transport company stats',
        success: false 
      },
      { status: 500 }
    )
  }
}
