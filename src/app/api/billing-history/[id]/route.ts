import { NextRequest, NextResponse } from 'next/server'
import { BillingHistoryService } from '@/services/billingHistoryService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/billing-history/[id] - Get a single billing history record
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const result = await BillingHistoryService.getBillingHistoryById(id)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in GET /api/billing-history/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/billing-history/[id] - Update a billing history record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const body = await request.json()
    
    // Validate amount if provided
    if (body.amount !== undefined && (typeof body.amount !== 'number' || body.amount <= 0)) {
      return NextResponse.json(
        { error: 'Amount must be a positive number' },
        { status: 400 }
      )
    }

    // Validate status if provided
    if (body.status) {
      const validStatuses = ['pending', 'paid', 'failed', 'refunded']
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'Invalid status. Must be one of: pending, paid, failed, refunded' },
          { status: 400 }
        )
      }
    }

    const result = await BillingHistoryService.updateBillingHistory(id, body)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in PUT /api/billing-history/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/billing-history/[id] - Delete a billing history record
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const result = await BillingHistoryService.deleteBillingHistory(id)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json({ message: 'Billing history record deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/billing-history/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
