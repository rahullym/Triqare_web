import { NextRequest, NextResponse } from 'next/server'
import { PatientSubscriptionService } from '@/services/patientSubscriptionService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/patient-subscriptions/stats - Get patient subscription statistics
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const result = await PatientSubscriptionService.getPatientSubscriptionStats()
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in GET /api/patient-subscriptions/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
