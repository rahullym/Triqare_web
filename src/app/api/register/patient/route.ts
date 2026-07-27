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
      dateOfBirth,
      gender,
      address,
      city,
      state,
      zipCode,
      emergencyContactName,
      emergencyContactPhone,
      emergencyContactRelationship,
      bloodType,
      medicalConditions,
      allergies,
      medications,
      insuranceProvider,
      insuranceNumber
    } = body

    console.log('Creating patient registration for:', { email, authUserId })

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

    // Idempotency / anti-duplicate guard: if a patient profile already exists for
    // this user, treat the (retried) registration as success rather than inserting
    // a second row.
    const { data: existingPatient } = await supabase
      .from('patients')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (existingPatient) {
      return NextResponse.json({
        success: true,
        message: 'Patient already registered',
        data: { user, patient: existingPatient },
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
      date_of_birth: dateOfBirth,
      gender,
      address,
      city,
      state,
      zip_code: zipCode,
      // Business rule: main patients are India-only. Hard-lock server-side so the
      // stored country can't be anything else regardless of the submitted value.
      country: 'India',
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
      emergency_contact_relationship: emergencyContactRelationship,
      medical_conditions: medicalConditions,
      allergies,
      medications,
      blood_type: bloodType,
      insurance_provider: insuranceProvider,
      insurance_number: insuranceNumber,
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

    // Create patient record. NOTE: unlike the old Clerk flow we do NOT delete the
    // users row on failure — it is the auth identity, and deleting it would orphan
    // the login.
    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .insert([
        {
          user_id: user.id,
          dob: dateOfBirth,
          gender,
          blood_group: bloodType
        }
      ])
      .select()
      .single()

    if (patientError) {
      console.error('Error creating patient:', patientError)
      return NextResponse.json({
        success: false,
        error: 'Failed to create patient record'
      }, { status: 500 })
    }

    console.log('✅ Created patient:', patient)

    return NextResponse.json({
      success: true,
      message: 'Patient registration successful',
      data: {
        user: updatedUser || user,
        patient
      }
    })

  } catch (error: unknown) {
    console.error('Patient registration error:', error)
    return NextResponse.json({
      success: false,
      error: 'Registration failed'
    }, { status: 500 })
  }
}
