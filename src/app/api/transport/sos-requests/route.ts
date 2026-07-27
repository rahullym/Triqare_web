import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'
import { supabase } from '@/lib/supabase'

// GET /api/transport/sos-requests - Get SOS requests assigned to the transport company's drivers
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)

    // Authenticate + authorize as a transport_company user. The previous ?test=true
    // bypass let unauthenticated callers read patient PII in production; it has been
    // removed (see middleware.ts — the matching middleware bypass is also gated).
    const { user, appUser } = await getAuthedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }
    if (appUser.role !== 'transport_company') {
      return NextResponse.json({ error: 'Forbidden - Transport company access required' }, { status: 403 })
    }

    const currentUser: any = appUser

    // Parse additional query parameters
    const status = searchParams.get('status') || undefined
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 50
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0

    // Resolve this company's drivers (drivers.transport_company_id == company user_id).
    // The canonical dispatch flow writes the driver inline on sos_requests.driver_id,
    // so we scope the SOS list by driver_id IN (company's driver user_ids).
    const { data: companyDrivers, error: driversError } = await supabase
      .from('drivers')
      .select('user_id')
      .eq('transport_company_id', currentUser.id)

    if (driversError) {
      console.error('Error fetching transport company drivers:', driversError)
      return NextResponse.json({ error: 'Failed to fetch SOS requests' }, { status: 500 })
    }

    const driverIds = [...new Set((companyDrivers || []).map(d => d.user_id).filter(Boolean))]

    // No drivers => no assignable SOS requests for this company.
    if (driverIds.length === 0) {
      return NextResponse.json({ requests: [], count: 0, success: true })
    }

    // NOTE: avoid PostgREST nested embeds (patients!inner / sos_request_assigned) — the FK
    // relationships are not in this DB's schema cache, so embeds 500. Fetch scalar
    // sos_requests columns (including the inline driver), then batch-fetch related rows.
    let query = supabase
      .from('sos_requests')
      .select(`
        id, patient_id, requested_at, assigned_at, completed_at, auto_assigned, status,
        location_lat, location_lon, patient_name, patient_phone,
        driver_id, driver_name, driver_phone
      `, { count: 'exact' })
      .in('driver_id', driverIds)
      .order('requested_at', { ascending: false })

    // Apply status filter
    if (status) {
      query = query.eq('status', status)
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1)

    const { data: sosRequests, error, count } = await query

    if (error) {
      console.error('Error fetching transport company SOS requests:', error)
      return NextResponse.json(
        { error: 'Failed to fetch SOS requests' },
        { status: 500 }
      )
    }

    const patientIds = [...new Set((sosRequests || []).map(r => r.patient_id).filter(Boolean))]

    // Batch-fetch patient profiles + their user identity and merge in JS.
    const [{ data: patients }, { data: patientUsers }] = await Promise.all([
      supabase.from('patients').select('user_id, dob, gender, blood_group, allergies, abha_id, insurance_provider, insurance_policy_number, insurance_valid_till, emergency_contact_name, emergency_contact_phone, emergency_contact_relation, latitude, longitude, address_line').in('user_id', patientIds),
      supabase.from('users').select('id, full_name, email, phone').in('id', patientIds),
    ])

    const patientById = Object.fromEntries((patients || []).map(p => [p.user_id, p]))
    const userById = Object.fromEntries((patientUsers || []).map(u => [u.id, u]))

    // Transform the data to match the expected format
    const transformedData = (sosRequests || []).map((request: any) => {
      const p = patientById[request.patient_id] as any
      const pu = userById[request.patient_id] as any
      return {
        id: request.id,
        patient_id: request.patient_id,
        patient_name: request.patient_name || pu?.full_name || 'Unknown Patient',
        patient_email: pu?.email || '',
        patient_phone: request.patient_phone || pu?.phone || '',
        patient_details: {
          dob: p?.dob,
          gender: p?.gender,
          blood_group: p?.blood_group,
          allergies: p?.allergies,
          abha_id: p?.abha_id,
          insurance_provider: p?.insurance_provider,
          insurance_policy_number: p?.insurance_policy_number,
          insurance_valid_till: p?.insurance_valid_till,
          emergency_contact_name: p?.emergency_contact_name,
          emergency_contact_phone: p?.emergency_contact_phone,
          emergency_contact_relation: p?.emergency_contact_relation,
          latitude: p?.latitude,
          longitude: p?.longitude,
          address_line: p?.address_line,
          emergency_contacts: []
        },
        // Canonical inline driver model.
        assigned_driver: request.driver_id ? {
          id: request.driver_id,
          name: request.driver_name,
          email: '',
          phone: request.driver_phone
        } : null,
        requested_at: request.requested_at,
        assigned_at: request.assigned_at,
        completed_at: request.completed_at,
        auto_assigned: request.auto_assigned,
        status: request.status
      }
    })

    return NextResponse.json({
      requests: transformedData,
      count: count || 0,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport company SOS requests:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch SOS requests',
        success: false
      },
      { status: 500 }
    )
  }
}
