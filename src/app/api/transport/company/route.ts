import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'
import { TransportCompanyService } from '@/services/transportCompanyService'
import { UserService } from '@/services/userService'

// GET /api/transport/company - Get current transport company information
export async function GET(request: NextRequest) {
  try {
    // Parse query parameters first
    const { searchParams } = new URL(request.url)
    // SECURITY: the ?test=true bypass (unauthenticated, hard-coded transport.test@example.com)
    // must NEVER be honored in production — it would expose real data unauthenticated.
    const testMode = process.env.NODE_ENV !== 'production' && searchParams.get('test') === 'true'

    let currentUser: any = null

    if (testMode) {
      // Use test transport company user
      const { data: testUser, error: testError } = await UserService.getUserByEmail('transport.test@example.com')
      if (testError || !testUser) {
        return NextResponse.json({ error: 'Test user not found' }, { status: 404 })
      }
      currentUser = testUser
    } else {
      const { user: authUser, appUser } = await getAuthedUser()

      if (!authUser) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // appUser IS the caller's public.users row
      if (!appUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      if (appUser.role !== 'transport_company') {
        return NextResponse.json({ error: 'Forbidden - Transport company access required' }, { status: 403 })
      }

      currentUser = appUser
    }

    // Get transport company information
    const company = await TransportCompanyService.getTransportCompanyByUserId(currentUser.id)

    return NextResponse.json({
      company,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport company:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch transport company',
        success: false
      },
      { status: 500 }
    )
  }
}

// PUT /api/transport/company - Update transport company information
export async function PUT(request: NextRequest) {
  try {
    const { user: authUser, appUser } = await getAuthedUser()

    if (!authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row
    if (!appUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (appUser.role !== 'transport_company') {
      return NextResponse.json({ error: 'Forbidden - Transport company access required' }, { status: 403 })
    }

    const user: any = appUser

    const body = await request.json()

    // Prepare update data for transport company
    const updateData: any = {}
    if (body.company_name !== undefined) updateData.company_name = body.company_name
    if (body.address_line !== undefined) updateData.address_line = body.address_line
    if (body.registration_number !== undefined) updateData.registration_number = body.registration_number
    if (body.license_valid_till !== undefined) updateData.license_valid_till = body.license_valid_till

    // Handle location fields with proper foreign key IDs
    if (body.country_id !== undefined) updateData.country_id = body.country_id || null
    if (body.state_id !== undefined) updateData.state_id = body.state_id || null
    if (body.city_id !== undefined) updateData.city_id = body.city_id || null
    if (body.pincode_id !== undefined) updateData.pincode_id = body.pincode_id || null

    // Update or create transport company information
    const updatedCompany = await TransportCompanyService.upsertTransportCompany(user.id, updateData)

    return NextResponse.json({
      company: updatedCompany,
      message: 'Transport company updated successfully',
      success: true
    })
  } catch (error) {
    console.error('Error updating transport company:', error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to update transport company',
        success: false
      },
      { status: 500 }
    )
  }
}
