import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'
import { TransportCompanyService } from '@/services/transportCompanyService'
import { supabase } from '@/lib/supabase'
import { driverUniqueErrorMessage } from '@/lib/driverErrors'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const driverId = id
    const { searchParams } = new URL(request.url)
    // SECURITY: the ?test=true bypass (unauthenticated, hard-coded transport.test@example.com)
    // must NEVER be honored in production — it would expose/mutate real data unauthenticated.
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
      const { user, appUser } = await getAuthedUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // appUser IS the caller's public.users row
      if (!appUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Check if user is transport company
      if (appUser.role !== 'transport_company') {
        return NextResponse.json({ error: 'Access denied. Transport company role required.' }, { status: 403 })
      }

      currentUser = appUser
    }

    // Get driver by ID with user information
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select(`
        *,
        user:users!drivers_user_id_fkey(
          id,
          full_name,
          email,
          first_name,
          last_name,
          phone,
          role,
          created_at
        )
      `)
      .eq('user_id', driverId)
      .single()

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // Check if the driver belongs to the current transport company
    let transportCompany
    try {
      transportCompany = await TransportCompanyService.getTransportCompanyByUserId(currentUser.id)
    } catch (companyError) {
      return NextResponse.json({ error: 'Transport company not found' }, { status: 404 })
    }

    if (driver.transport_company_id !== transportCompany.user_id) {
      return NextResponse.json({ error: 'Access denied. Driver does not belong to your company.' }, { status: 403 })
    }

    return NextResponse.json({
      success: true,
      data: driver
    })

  } catch (error) {
    console.error('Error fetching driver:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const driverId = id
    const { searchParams } = new URL(request.url)
    // SECURITY: the ?test=true bypass (unauthenticated, hard-coded transport.test@example.com)
    // must NEVER be honored in production — it would expose/mutate real data unauthenticated.
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
      const { user, appUser } = await getAuthedUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // appUser IS the caller's public.users row
      if (!appUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Check if user is transport company
      if (appUser.role !== 'transport_company') {
        return NextResponse.json({ error: 'Access denied. Transport company role required.' }, { status: 403 })
      }

      currentUser = appUser
    }

    // Get driver by ID first to verify ownership
    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', driverId)
      .single()

    if (driverError || !driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // Check if the driver belongs to the current transport company
    let transportCompany
    try {
      transportCompany = await TransportCompanyService.getTransportCompanyByUserId(currentUser.id)
    } catch (companyError) {
      return NextResponse.json({ error: 'Transport company not found' }, { status: 404 })
    }

    if (driver.transport_company_id !== transportCompany.user_id) {
      return NextResponse.json({ error: 'Access denied. Driver does not belong to your company.' }, { status: 403 })
    }

    // Delete the driver (this will also delete the associated user due to CASCADE)
    const { error: deleteError } = await supabase
      .from('drivers')
      .delete()
      .eq('user_id', driverId)

    if (deleteError) {
      return NextResponse.json({ error: 'Failed to delete driver' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Driver deleted successfully'
    })

  } catch (error) {
    console.error('Error deleting driver:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const driverId = id
    const { searchParams } = new URL(request.url)
    // SECURITY: the ?test=true bypass (unauthenticated, hard-coded transport.test@example.com)
    // must NEVER be honored in production — it would expose/mutate real data unauthenticated.
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
      const { user, appUser } = await getAuthedUser()
      if (!user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }

      // appUser IS the caller's public.users row
      if (!appUser) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 })
      }

      // Check if user is transport company
      if (appUser.role !== 'transport_company') {
        return NextResponse.json({ error: 'Access denied. Transport company role required.' }, { status: 403 })
      }

      currentUser = appUser
    }

    // Get existing driver to verify ownership
    const { data: existingDriver, error: driverError } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', driverId)
      .single()

    if (driverError || !existingDriver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 })
    }

    // Check if the driver belongs to the current transport company
    let transportCompany
    try {
      transportCompany = await TransportCompanyService.getTransportCompanyByUserId(currentUser.id)
    } catch (companyError) {
      return NextResponse.json({ error: 'Transport company not found' }, { status: 404 })
    }

    if (existingDriver.transport_company_id !== transportCompany.user_id) {
      return NextResponse.json({ error: 'Access denied. Driver does not belong to your company.' }, { status: 403 })
    }

    // Parse request body
    const formData = await request.json()

    // Validate required fields
    if (!formData.full_name || !formData.email || !formData.phone || !formData.license_number) {
      return NextResponse.json({
        error: 'Missing required fields: full_name, email, phone, license_number'
      }, { status: 400 })
    }

    // Check if email already exists (excluding current driver's email)
    const { data: existingUser } = await UserService.getUserByEmail(formData.email)
    if (existingUser && existingUser.id !== existingDriver.user_id) {
      return NextResponse.json({
        error: 'A user with this email already exists'
      }, { status: 400 })
    }

    // Update user information
    const userData = {
      email: formData.email,
      full_name: formData.full_name,
      first_name: formData.first_name || '',
      last_name: formData.last_name || '',
      phone: formData.phone
    }

    const { data: updatedUser, error: userUpdateError } = await UserService.updateUser(existingDriver.user_id, userData)
    if (userUpdateError || !updatedUser) {
      return NextResponse.json({
        error: userUpdateError || 'Failed to update user'
      }, { status: 500 })
    }

    // Update driver information with actual table fields
    const driverData = {
      license_number: formData.license_number,
      // Trim to null so a blank/whitespace value stays NULL (distinct under the
      // UNIQUE constraint) instead of colliding as a stored '' — otherwise a
      // second driver with no Aadhar falsely hits "already exists".
      aadhar_number: formData.aadhar_number?.trim() || null,
      is_verified: formData.is_verified || false,
      status: formData.status || 'available',
      latitude: formData.latitude || null,
      longitude: formData.longitude || null,
      country_id: formData.country_id || null,
      state_id: formData.state_id || null,
      city_id: formData.city_id || null,
      pincode_id: formData.pincode_id || null,
      address_line: formData.address_line || null,
      firstname: formData.first_name || null,
      lastname: formData.last_name || null,
      last_updated_at: new Date().toISOString()
    }

    const { data: updatedDriver, error: driverUpdateError } = await supabase
      .from('drivers')
      .update(driverData)
      .eq('user_id', driverId)
      .select()
      .single()

    if (driverUpdateError || !updatedDriver) {
      const duplicateMsg = driverUniqueErrorMessage(driverUpdateError)
      return NextResponse.json({
        error: duplicateMsg || driverUpdateError?.message || 'Failed to update driver'
      }, { status: duplicateMsg ? 409 : 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Driver updated successfully',
      data: {
        user: updatedUser,
        driver: updatedDriver
      }
    })

  } catch (error) {
    console.error('Error updating driver:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
