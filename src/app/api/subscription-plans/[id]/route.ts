import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionPlanService } from '@/services/subscriptionPlanService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/subscription-plans/[id] - Get a single subscription plan
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const result = await SubscriptionPlanService.getSubscriptionPlanById(id)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in GET /api/subscription-plans/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/subscription-plans/[id] - Update a subscription plan
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const body = await request.json()
    
    // Validate data types if provided
    if (body.price !== undefined && (typeof body.price !== 'number' || body.price <= 0)) {
      return NextResponse.json(
        { error: 'Price must be a positive number' },
        { status: 400 }
      )
    }

    if (body.duration_days !== undefined && (typeof body.duration_days !== 'number' || body.duration_days <= 0)) {
      return NextResponse.json(
        { error: 'Duration days must be a positive number' },
        { status: 400 }
      )
    }

    const result = await SubscriptionPlanService.updateSubscriptionPlan(id, body)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in PUT /api/subscription-plans/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/subscription-plans/[id] - Delete a subscription plan
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const result = await SubscriptionPlanService.deleteSubscriptionPlan(id)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json({ message: 'Subscription plan deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/subscription-plans/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
