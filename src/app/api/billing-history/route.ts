import { NextRequest, NextResponse } from 'next/server'
import { BillingHistoryService } from '@/services/billingHistoryService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/billing-history - Get all billing history with optional filtering
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { searchParams } = new URL(request.url)
    
    const filters = {
      patient_id: searchParams.get('patient_id') || undefined,
      subscription_id: searchParams.get('subscription_id') || undefined,
      status: searchParams.get('status') || undefined,
      payment_method: searchParams.get('payment_method') || undefined,
      payment_gateway: searchParams.get('payment_gateway') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined
    }

    const result = await BillingHistoryService.getBillingHistory(filters)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json({
      data: result.data,
      count: result.count
    })
  } catch (error) {
    console.error('Error in GET /api/billing-history:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/billing-history - Create a new billing history record
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    
    // Validate required fields
    if (!body.patient_id || !body.subscription_id || !body.amount || !body.transaction_id || !body.status) {
      return NextResponse.json(
        { error: 'Missing required fields: patient_id, subscription_id, amount, transaction_id, status' },
        { status: 400 }
      )
    }

    // Validate amount
    if (typeof body.amount !== 'number' || body.amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['pending', 'paid', 'failed', 'refunded']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be one of: pending, paid, failed, refunded' },
        { status: 400 }
      )
    }

    const result = await BillingHistoryService.createBillingHistory(body)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/billing-history:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
