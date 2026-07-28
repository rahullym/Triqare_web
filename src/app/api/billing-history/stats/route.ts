import { NextRequest, NextResponse } from 'next/server'
import { BillingHistoryService } from '@/services/billingHistoryService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/billing-history/stats - Get billing history statistics
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const result = await BillingHistoryService.getBillingHistoryStats()
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in GET /api/billing-history/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
