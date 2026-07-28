import { NextRequest, NextResponse } from 'next/server'
import { PatientSubscriptionService } from '@/services/patientSubscriptionService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/patient-subscriptions - Get all patient subscriptions with optional filtering
export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { searchParams } = new URL(request.url)
    
    const filters = {
      patient_id: searchParams.get('patient_id') || undefined,
      subscription_plan_id: searchParams.get('subscription_plan_id') || undefined,
      payment_status: searchParams.get('payment_status') || undefined,
      subscription_status: searchParams.get('subscription_status') || undefined,
      search: searchParams.get('search') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined
    }

    const result = await PatientSubscriptionService.getPatientSubscriptions(filters)
    
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
    console.error('Error in GET /api/patient-subscriptions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/patient-subscriptions - Create a new patient subscription
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    
    // Validate required fields
    if (!body.patient_id || !body.plan_id || !body.start_date || !body.end_date || !body.payment_status || !body.subscription_status) {
      return NextResponse.json(
        { error: 'Missing required fields: patient_id, plan_id, start_date, end_date, payment_status, subscription_status' },
        { status: 400 }
      )
    }

    // Validate payment_status
    const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded']
    if (!validPaymentStatuses.includes(body.payment_status)) {
      return NextResponse.json(
        { error: 'Invalid payment_status. Must be one of: pending, paid, failed, refunded' },
        { status: 400 }
      )
    }

    // Validate subscription_status
    const validSubscriptionStatuses = ['active', 'expired', 'cancelled']
    if (!validSubscriptionStatuses.includes(body.subscription_status)) {
      return NextResponse.json(
        { error: 'Invalid subscription_status. Must be one of: active, expired, cancelled' },
        { status: 400 }
      )
    }

    // Validate dates
    const startDate = new Date(body.start_date)
    const endDate = new Date(body.end_date)
    
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return NextResponse.json(
        { error: 'Invalid date format for start_date or end_date' },
        { status: 400 }
      )
    }

    if (endDate <= startDate) {
      return NextResponse.json(
        { error: 'End date must be after start date' },
        { status: 400 }
      )
    }

    const result = await PatientSubscriptionService.createPatientSubscription(body)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    return NextResponse.json(result.data, { status: 201 })
  } catch (error) {
    console.error('Error in POST /api/patient-subscriptions:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
