import { NextRequest, NextResponse } from 'next/server'
import { DriverService, type DriverDutyFilter } from '@/services/driverService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'
import { blankToNull, LOCATION_FK_FIELDS } from '@/lib/blankToNull'
import { createServiceRoleClient } from '@/lib/supabase/server'

const DUTY_FILTERS = new Set<string>(['on_trip', 'on_duty', 'needs_attention', 'off_duty'])

export async function GET(request: NextRequest) {
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { searchParams } = new URL(request.url)
    
    const filters = {
      search: searchParams.get('search') || undefined,
      // Duty states, not raw drivers.status values — see DriverFilters. An
      // unrecognised value is dropped rather than passed through, so a stale
      // bookmark (?status=available) lists everyone instead of nothing.
      status: DUTY_FILTERS.has(searchParams.get('status') || '')
        ? (searchParams.get('status') as DriverDutyFilter)
        : undefined,
      transport_company_id: searchParams.get('transport_company_id') || undefined,
      is_verified: searchParams.get('is_verified') ? searchParams.get('is_verified') === 'true' : undefined,
      country_id: searchParams.get('country_id') || undefined,
      state_id: searchParams.get('state_id') || undefined,
      city_id: searchParams.get('city_id') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    }

    const { drivers, count } = await DriverService.getDrivers(filters)

    return NextResponse.json({
      drivers,
      count,
      success: true
    })
  } catch (error) {
    console.error('Error fetching drivers:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch drivers',
        success: false 
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    // Optional uuid fields arrive as '' from the add form; Postgres rejects that
    // with 22P02. See blankToNull.
    const body = blankToNull(await request.json(), LOCATION_FK_FIELDS)

    // Validate required fields
    if (!body.user_id || !body.transport_company_id || !body.license_number || !body.status) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: user_id, transport_company_id, license_number, and status are required',
          success: false 
        },
        { status: 400 }
      )
    }

    // Validate status
    const validStatuses = ['available', 'assigned', 'on_trip', 'inactive']
    if (!validStatuses.includes(body.status)) {
      return NextResponse.json(
        { 
          error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
          success: false 
        },
        { status: 400 }
      )
    }

    // Validate coordinates if provided
    if (body.latitude !== undefined || body.longitude !== undefined) {
      if (typeof body.latitude !== 'number' || typeof body.longitude !== 'number') {
        return NextResponse.json(
          { 
            error: 'Latitude and longitude must be numbers',
            success: false 
          },
          { status: 400 }
        )
      }

      if (body.latitude < -90 || body.latitude > 90) {
        return NextResponse.json(
          { 
            error: 'Latitude must be between -90 and 90',
            success: false 
          },
          { status: 400 }
        )
      }

      if (body.longitude < -180 || body.longitude > 180) {
        return NextResponse.json(
          { 
            error: 'Longitude must be between -180 and 180',
            success: false 
          },
          { status: 400 }
        )
      }
    }

    // The add form also offers plain 'patient' accounts (anyone created under
    // Users, or who signed up in the app, starts as patient). Staff accounts
    // must never be turned into drivers.
    const admin = createServiceRoleClient()
    const { data: targetUser } = await admin
      .from('users')
      .select('id, role')
      .eq('id', body.user_id)
      .maybeSingle()
    if (!targetUser) {
      return NextResponse.json({ error: 'That user no longer exists.', success: false }, { status: 400 })
    }
    if (targetUser.role !== 'driver' && targetUser.role !== 'patient') {
      return NextResponse.json(
        { error: `That account is a ${targetUser.role} account and cannot be made a driver.`, success: false },
        { status: 400 }
      )
    }

    const driver = await DriverService.createDriver(body)

    // The mobile app routes on users.role, so a driver profile on a patient
    // account would still open the patient app.
    if (targetUser.role !== 'driver') {
      const { error: roleError } = await admin.from('users').update({ role: 'driver' }).eq('id', targetUser.id)
      if (roleError) {
        await admin.from('drivers').delete().eq('user_id', targetUser.id)
        return NextResponse.json(
          { error: `Could not set the driver role on that account: ${roleError.message}`, success: false },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      driver,
      success: true
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating driver:', error)
    
    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('duplicate key')) {
      if (error.message.includes('license_number')) {
        return NextResponse.json(
          { 
            error: 'License number already exists',
            success: false 
          },
          { status: 409 }
        )
      }
      if (error.message.includes('aadhar_number')) {
        return NextResponse.json(
          { 
            error: 'Aadhar number already exists',
            success: false 
          },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create driver',
        success: false 
      },
      { status: 500 }
    )
  }
}
