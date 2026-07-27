import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'
import { supabase } from '@/lib/supabase'

// GET /api/transport/assignments - Get assignments for the transport company's drivers
export async function GET(request: NextRequest) {
  try {
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row (id, role, ...)
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (appUser.role !== 'transport_company') {
      return NextResponse.json({ error: 'Forbidden - Transport company access required' }, { status: 403 })
    }

    const currentUser: any = appUser

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || undefined
    const type = searchParams.get('type') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    // Get SOS requests assigned to drivers from this transport company
    let query = supabase
      .from('sos_requests')
      .select(`
        id,
        patient_id,
        requested_at,
        assigned_at,
        completed_at,
        auto_assigned,
        status,
        patients!inner (
          user_id,
          dob,
          gender,
          blood_group,
          allergies,
          abha_id,
          insurance_provider,
          insurance_policy_number,
          insurance_valid_till,
          emergency_contact_name,
          emergency_contact_phone,
          emergency_contact_relation,
          latitude,
          longitude,
          address_line,
          users!inner (
            id,
            full_name,
            email,
            phone,
            first_name,
            last_name
          )
        ),
        sos_request_assigned!inner (
          assigned_at,
          users!inner (
            id,
            full_name,
            email,
            phone,
            drivers!inner (
              transport_company_id,
              license_number,
              status,
              transport_companies!inner (
                user_id
              )
            )
          )
        )
      `)
      .eq('sos_request_assigned.users.drivers.transport_companies.user_id', currentUser.id)
      .order('requested_at', { ascending: false })

    // Apply status filter
    if (status) {
      query = query.eq('status', status)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching transport company assignments:', error)
      return NextResponse.json(
        { error: 'Failed to fetch assignments' },
        { status: 500 }
      )
    }

    // Transform the data to match the expected format
    const transformedData = data?.map((request: any) => ({
      id: request.id,
      assignmentId: `ASG-${request.id.slice(-8).toUpperCase()}`,
      type: 'emergency', // All SOS requests are emergency type
      status: request.status === 'completed' ? 'completed' : 
              request.status === 'driver_assigned' ? 'assigned' :
              request.status === 'in_progress' ? 'in_progress' : 'assigned',
      priority: 'high', // All emergency requests are high priority
      patientName: request.patients?.users?.full_name || 'Unknown Patient',
      pickupLocation: request.patients?.address_line || 'Unknown Location',
      dropoffLocation: 'Hospital', // Default destination for emergency requests
      scheduledTime: request.requested_at,
      assignedVehicle: 'AMB-001', // Default vehicle ID
      assignedDriver: request.sos_request_assigned?.[0]?.users?.full_name || 'Unassigned',
      estimatedDuration: '30 min', // Default duration
      distance: '5.2 km', // Default distance
      fare: 0, // Emergency services are typically free
      notes: `Emergency transport for ${request.patients?.users?.full_name}`,
      contactNumber: request.patients?.emergency_contact_phone || request.patients?.users?.phone || '',
      patient_details: {
        email: request.patients?.users?.email,
        phone: request.patients?.users?.phone,
        blood_group: request.patients?.blood_group,
        allergies: request.patients?.allergies,
        emergency_contact_name: request.patients?.emergency_contact_name,
        emergency_contact_phone: request.patients?.emergency_contact_phone,
        emergency_contact_relation: request.patients?.emergency_contact_relation
      },
      driver_details: {
        id: request.sos_request_assigned?.[0]?.users?.id,
        name: request.sos_request_assigned?.[0]?.users?.full_name,
        email: request.sos_request_assigned?.[0]?.users?.email,
        phone: request.sos_request_assigned?.[0]?.users?.phone,
        license_number: request.sos_request_assigned?.[0]?.users?.drivers?.license_number,
        status: request.sos_request_assigned?.[0]?.users?.drivers?.status
      },
      requested_at: request.requested_at,
      assigned_at: request.assigned_at,
      completed_at: request.completed_at
    })) || []

    return NextResponse.json({
      assignments: transformedData,
      count: count || 0,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport company assignments:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch assignments',
        success: false 
      },
      { status: 500 }
    )
  }
}
