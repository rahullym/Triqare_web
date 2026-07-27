import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      authUserId,
      firstName,
      lastName,
      email,
      phone,
      companyName,
      registrationNumber,
      addressLine,
      licenseValidTill,
      countryId,
      stateId,
      cityId,
      pincodeId
    } = body

    console.log('Creating transport company registration for:', { email, authUserId, companyName })

    // Basic input validation (defense-in-depth; the client also validates).
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (typeof authUserId !== 'string' || !authUserId.trim()) {
      return NextResponse.json(
        { success: false, error: 'Invalid registration request' },
        { status: 400 },
      )
    }
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return NextResponse.json(
        { success: false, error: 'A valid email is required' },
        { status: 400 },
      )
    }
    if (typeof firstName !== 'string' || !firstName.trim() ||
        typeof lastName !== 'string' || !lastName.trim()) {
      return NextResponse.json(
        { success: false, error: 'First and last name are required' },
        { status: 400 },
      )
    }
    if (typeof companyName !== 'string' || !companyName.trim()) {
      return NextResponse.json(
        { success: false, error: 'Company name is required' },
        { status: 400 },
      )
    }

    // The handle_new_auth_user() DB trigger already created (and linked) the
    // public.users row for this auth identity. Resolve it — do NOT insert a users
    // row or set the role here (the trigger owns that).
    const { data: user, error: lookupError } = await UserService.getUserByAuthId(authUserId)
    if (lookupError) {
      console.error('Error resolving user by auth id:', lookupError)
      return NextResponse.json(
        { success: false, error: 'Failed to resolve user account' },
        { status: 500 },
      )
    }
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Account not found. Please try signing in again.' },
        { status: 404 },
      )
    }

    const supabase = createClient()

    // Idempotency / anti-duplicate guard: if a transport company profile already
    // exists for this user, treat the (retried) registration as success.
    const { data: existingCompany } = await supabase
      .from('transport_companies')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingCompany) {
      return NextResponse.json({
        success: true,
        message: 'Transport company already registered',
        data: { user, transportCompany: existingCompany },
      })
    }

    // Patch profile fields onto the (trigger-created) users row. Never touches the
    // role or any auth-identity column.
    const profileUpdates: Record<string, any> = {
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`,
      phone,
      is_active: true,
    }

    const { data: updatedUser, error: userError } = await UserService.updateUser(user.id, profileUpdates)

    if (userError) {
      console.error('Error updating user:', userError)
      return NextResponse.json({
        success: false,
        error: 'Failed to update user record'
      }, { status: 500 })
    }

    console.log('✅ Updated user:', updatedUser)

    // Create transport company record. NOTE: unlike the old Clerk flow we do NOT
    // delete the users row on failure — it is the auth identity, and deleting it
    // would orphan the login.
    const { data: transportCompany, error: transportCompanyError } = await supabase
      .from('transport_companies')
      .insert([
        {
          user_id: user.id,
          company_name: companyName,
          address_line: addressLine,
          registration_number: registrationNumber,
          license_valid_till: licenseValidTill || null,
          is_verified: false, // Will be verified by admin
          country_id: countryId || null,
          state_id: stateId || null,
          city_id: cityId || null,
          pincode_id: pincodeId || null
        }
      ])
      .select()
      .single()

    if (transportCompanyError) {
      console.error('Error creating transport company:', transportCompanyError)
      return NextResponse.json({
        success: false,
        error: 'Failed to create transport company record'
      }, { status: 500 })
    }

    console.log('✅ Created transport company:', transportCompany)

    return NextResponse.json({
      success: true,
      message: 'Transport company registration successful',
      data: {
        user: updatedUser || user,
        transportCompany
      }
    })

  } catch (error: unknown) {
    console.error('Transport company registration error:', error)
    return NextResponse.json({
      success: false,
      error: 'Registration failed'
    }, { status: 500 })
  }
}
