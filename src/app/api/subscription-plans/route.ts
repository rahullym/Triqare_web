import { NextRequest, NextResponse } from 'next/server'
import { SubscriptionPlanService } from '@/services/subscriptionPlanService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/subscription-plans - Get all subscription plans with optional filtering
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { searchParams } = new URL(request.url)
    
    const filters = {
      is_active: searchParams.get('is_active') ? searchParams.get('is_active') === 'true' : undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined
    }

    const result = await SubscriptionPlanService.getSubscriptionPlans(filters)
    
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
    console.error('Error in GET /api/subscription-plans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/subscription-plans - Create a new subscription plan
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    
    // Validate required fields
    if (!body.name || !body.price || !body.duration_days) {
      return NextResponse.json(
        { error: 'Missing required fields: name, price, duration_days' },
        { status: 400 }
      )
    }

    // Validate data types
    if (typeof body.price !== 'number' || body.price <= 0) {
      return NextResponse.json(
        { error: 'Price must be a positive number' },
        { status: 400 }
      )
    }

    if (typeof body.duration_days !== 'number' || body.duration_days <= 0) {
      return NextResponse.json(
        { error: 'Duration days must be a positive number' },
        { status: 400 }
      )
    }

    const result = await SubscriptionPlanService.createSubscriptionPlan(body)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/subscription-plans:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
