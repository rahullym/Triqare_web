import { NextRequest, NextResponse } from 'next/server'
import { PatientSubscriptionService } from '@/services/patientSubscriptionService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/patient-subscriptions/[id] - Get a single patient subscription
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const result = await PatientSubscriptionService.getPatientSubscriptionById(id)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in GET /api/patient-subscriptions/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/patient-subscriptions/[id] - Update a patient subscription
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const body = await request.json()
    
    // Validate payment_status if provided
    if (body.payment_status) {
      const validPaymentStatuses = ['pending', 'paid', 'failed', 'refunded']
      if (!validPaymentStatuses.includes(body.payment_status)) {
        return NextResponse.json(
          { error: 'Invalid payment_status. Must be one of: pending, paid, failed, refunded' },
          { status: 400 }
        )
      }
    }

    // Validate subscription_status if provided
    if (body.subscription_status) {
      const validSubscriptionStatuses = ['active', 'expired', 'cancelled']
      if (!validSubscriptionStatuses.includes(body.subscription_status)) {
        return NextResponse.json(
          { error: 'Invalid subscription_status. Must be one of: active, expired, cancelled' },
          { status: 400 }
        )
      }
    }

    // Validate dates if provided
    if (body.start_date || body.end_date) {
      const startDate = body.start_date ? new Date(body.start_date) : null
      const endDate = body.end_date ? new Date(body.end_date) : null
      
      if (startDate && isNaN(startDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format for start_date' },
          { status: 400 }
        )
      }

      if (endDate && isNaN(endDate.getTime())) {
        return NextResponse.json(
          { error: 'Invalid date format for end_date' },
          { status: 400 }
        )
      }

      if (startDate && endDate && endDate <= startDate) {
        return NextResponse.json(
          { error: 'End date must be after start date' },
          { status: 400 }
        )
      }
    }

    const result = await PatientSubscriptionService.updatePatientSubscription(id, body)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json(result.data)
  } catch (error) {
    console.error('Error in PUT /api/patient-subscriptions/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/patient-subscriptions/[id] - Delete a patient subscription
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const { id } = await params
    const result = await PatientSubscriptionService.deletePatientSubscription(id)
    
    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: result.error.includes('not found') ? 404 : 500 }
      )
    }

    return NextResponse.json({ message: 'Patient subscription deleted successfully' })
  } catch (error) {
    console.error('Error in DELETE /api/patient-subscriptions/[id]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
