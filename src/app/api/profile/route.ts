import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'

// GET /api/profile - Get current user's profile
export async function GET() {
  try {
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row.
    // SECURITY: do NOT fabricate a default (admin) profile. An authenticated user
    // with no DB record is in an onboarding-required state.
    if (!appUser) {
      console.log('Authenticated user has no DB record — onboarding required')
      return NextResponse.json(
        { error: 'Profile not found', code: 'onboarding_required' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user: appUser })
  } catch (error) {
    console.error('Error in GET /api/profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/profile - Update current user's profile
export async function PUT(request: NextRequest) {
  try {
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // appUser IS the caller's public.users row.
    // SECURITY: do NOT fabricate a default admin profile (see GET handler).
    // An authenticated user with no DB record cannot update a profile that
    // does not exist; treat as onboarding-required.
    if (!appUser) {
      console.log('Authenticated user has no DB record — onboarding required')
      return NextResponse.json(
        { error: 'Profile not found', code: 'onboarding_required' },
        { status: 404 }
      )
    }

    const currentUser: any = appUser

    const body = await request.json()

    // Prepare update data - only include fields that are provided
    const updateData: any = {}

    // Basic fields
    if (body.first_name !== undefined) updateData.first_name = body.first_name
    if (body.last_name !== undefined) updateData.last_name = body.last_name
    if (body.full_name !== undefined) updateData.full_name = body.full_name
    if (body.bio !== undefined) updateData.bio = body.bio
    if (body.phone !== undefined) updateData.phone = body.phone

    // Personal information
    if (body.date_of_birth !== undefined) updateData.date_of_birth = body.date_of_birth
    // Skip address field as it doesn't exist in users table - use transport_companies.address_line instead
    // if (body.address !== undefined) updateData.address = body.address
    if (body.emergency_contact_name !== undefined) updateData.emergency_contact_name = body.emergency_contact_name
    if (body.emergency_contact_phone !== undefined) updateData.emergency_contact_phone = body.emergency_contact_phone

    // Work/Professional information
    if (body.employee_id !== undefined) updateData.employee_id = body.employee_id
    if (body.department !== undefined) updateData.department = body.department
    if (body.position !== undefined) updateData.position = body.position

    // Avatar/Profile image
    if (body.avatar_url !== undefined) updateData.avatar_url = body.avatar_url

    // Medical fields (for patients)
    if (body.blood_type !== undefined) updateData.blood_type = body.blood_type
    if (body.allergies !== undefined) updateData.allergies = body.allergies
    if (body.medical_conditions !== undefined) updateData.medical_conditions = body.medical_conditions
    if (body.medications !== undefined) updateData.medications = body.medications
    if (body.insurance_provider !== undefined) updateData.insurance_provider = body.insurance_provider
    if (body.insurance_number !== undefined) updateData.insurance_number = body.insurance_number
    if (body.last_checkup !== undefined) updateData.last_checkup = body.last_checkup

    // Driver fields - Skip fields that don't exist in the users table schema
    // Note: These fields should be stored in the drivers table or transport_companies table instead
    // if (body.license_number !== undefined) updateData.license_number = body.license_number
    // if (body.license_class !== undefined) updateData.license_class = body.license_class
    // if (body.license_expiry !== undefined) updateData.license_expiry = body.license_expiry
    // if (body.medical_cert_expiry !== undefined) updateData.medical_cert_expiry = body.medical_cert_expiry
    // if (body.years_experience !== undefined) updateData.years_experience = body.years_experience
    // if (body.special_certifications !== undefined) updateData.special_certifications = body.special_certifications
    // if (body.languages_spoken !== undefined) updateData.languages_spoken = body.languages_spoken
    // if (body.current_shift !== undefined) updateData.current_shift = body.current_shift
    // if (body.vehicle_assigned !== undefined) updateData.vehicle_assigned = body.vehicle_assigned

    // Always update the timestamp
    updateData.updated_at = new Date().toISOString()

    // Perform the actual database update for the authenticated user.
    const { data: updatedUser, error: updateError } = await UserService.updateUser(currentUser.id, updateData)

    if (updateError) {
      console.error('Error updating user profile:', updateError)
      return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 })
    }

    return NextResponse.json({
      message: 'Profile updated successfully',
      user: updatedUser
    })
  } catch (error) {
    console.error('Error in PUT /api/profile:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
