import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'
import { TransportCompanyService } from '@/services/transportCompanyService'
import { supabase } from '@/lib/supabase'
import { driverUniqueErrorMessage } from '@/lib/driverErrors'

export async function POST(request: NextRequest) {
  try {
    // Parse query parameters first
    const { searchParams } = new URL(request.url)
    // SECURITY: the ?test=true bypass (unauthenticated, hard-coded transport.test@example.com)
    // must NEVER be honored in production — it would expose/mutate real data unauthenticated.
    const testMode = process.env.NODE_ENV !== 'production' && searchParams.get('test') === 'true'
    
    let currentUser: any = null
    let transportCompany: any = null
    
    if (testMode) {
      // Use test transport company user
      const { data: testUser, error: testError } = await UserService.getUserByEmail('transport.test@example.com')
      if (testError || !testUser) {
        return NextResponse.json({ error: 'Test user not found' }, { status: 404 })
      }
      currentUser = testUser
      
      // Get test transport company
      try {
        transportCompany = await TransportCompanyService.getTransportCompanyByUserId(testUser.id)
      } catch (companyError) {
        return NextResponse.json({ error: 'Test transport company not found' }, { status: 404 })
      }
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

      // Get transport company (keyed by the resolved public.users.id)
      const company = await TransportCompanyService.getTransportCompanyByUserId(currentUser.id)
      transportCompany = company
    }

    // Parse request body
    const formData = await request.json()

    // Validate required fields
    if (!formData.full_name || !formData.email || !formData.phone || !formData.license_number) {
      return NextResponse.json({ 
        error: 'Missing required fields: full_name, email, phone, license_number' 
      }, { status: 400 })
    }

    // Check if email already exists
    const { data: existingUser } = await UserService.getUserByEmail(formData.email)
    if (existingUser) {
      return NextResponse.json({ 
        error: 'A user with this email already exists' 
      }, { status: 400 })
    }

    // Create user first
    const userData = {
      clerk_user_id: `driver_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`, // Generate unique clerk_id for test
      email: formData.email,
      full_name: formData.full_name,
      first_name: formData.first_name || '',
      last_name: formData.last_name || '',
      phone: formData.phone,
      role: 'driver' as const,
      created_by: currentUser.id
    }

    const { data: newUser, error: userCreateError } = await UserService.createUser(userData)
    if (userCreateError || !newUser) {
      return NextResponse.json({ 
        error: userCreateError || 'Failed to create user' 
      }, { status: 500 })
    }

    // Create driver record with actual table structure
    const driverData = {
      user_id: newUser.id,
      transport_company_id: transportCompany.user_id,
      license_number: formData.license_number,
      // Trim to null so a blank/whitespace value stays NULL (distinct under the
      // UNIQUE constraint) instead of colliding as a stored '' — otherwise a
      // second driver with no Aadhar falsely hits "already exists".
      aadhar_number: formData.aadhar_number?.trim() || null,
      is_verified: formData.is_verified || false,
      status: formData.status || 'available',
      current_request_id: null,
      latitude: formData.latitude || null,
      longitude: formData.longitude || null,
      country_id: formData.country_id || null,
      state_id: formData.state_id || null,
      city_id: formData.city_id || null,
      pincode_id: formData.pincode_id || null,
      address_line: formData.address_line || null,
      firstname: formData.first_name || null,
      lastname: formData.last_name || null
    }

    // Create driver record directly using Supabase since we're working with existing table structure
    const { data: newDriver, error: driverCreateError } = await supabase
      .from('drivers')
      .insert([driverData])
      .select()
      .single()

    if (driverCreateError || !newDriver) {
      // If driver creation fails, we should clean up the user record
      await UserService.deleteUser(newUser.id)
      const duplicateMsg = driverUniqueErrorMessage(driverCreateError)
      return NextResponse.json({
        error: duplicateMsg || driverCreateError?.message || 'Failed to create driver'
      }, { status: duplicateMsg ? 409 : 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Driver created successfully',
      data: {
        user: newUser,
        driver: newDriver
      }
    })

  } catch (error) {
    console.error('Error creating driver:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
