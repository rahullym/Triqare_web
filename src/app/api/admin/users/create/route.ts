import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'
import { UserRole } from '@/types'

// POST /api/admin/users/create - Create a login-capable user via Supabase Auth (admin only)
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    const { email, firstName, lastName, role, password } = body

    if (!email || !firstName || !role) {
      return NextResponse.json(
        { error: 'Missing required fields: email, firstName, and role are required' },
        { status: 400 },
      )
    }
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required. Please provide a password for the new user.' },
        { status: 400 },
      )
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters long' }, { status: 400 })
    }

    const validRoles: UserRole[] = ['admin', 'ert', 'transport_company', 'patient', 'driver']
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: 'Invalid role. Must be one of: ' + validRoles.join(', ') }, { status: 400 })
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
    }

    const fullName = [firstName, lastName].filter(Boolean).join(' ')
    const admin = createClient()

    // Create the Supabase auth user. The handle_new_auth_user() trigger provisions
    // (or links by email) the public.users row using the trusted app_metadata.role.
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName || '', full_name: fullName },
      app_metadata: { role },
    })

    if (createError || !created.user) {
      const msg = createError?.message || 'Failed to create user'
      if (/already|registered|exists|duplicate/i.test(msg)) {
        return NextResponse.json({ error: 'A user with this email address already exists' }, { status: 409 })
      }
      return NextResponse.json({ error: `Failed to create user: ${msg}` }, { status: 400 })
    }

    // Resolve the provisioned public.users row.
    const { data: dbUser } = await UserService.getUserByAuthId(created.user.id)

    // Force the role on. handle_new_auth_user() reads raw_app_meta_data at INSERT
    // time, but GoTrue applies the caller's app_metadata in a second statement, so
    // the trigger falls back to its 'patient' default — an admin picking "driver"
    // here got a patient. (Same fix as createSupabaseAuthUser; this route creates
    // the auth user directly rather than going through that helper.)
    if (dbUser?.id && dbUser.role !== role) {
      const { error: roleError } = await admin.from('users').update({ role }).eq('id', dbUser.id)
      if (roleError) {
        return NextResponse.json(
          { error: `User created but the ${role} role could not be applied: ${roleError.message}` },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        id: created.user.id,
        databaseId: dbUser?.id,
        email: created.user.email,
        firstName,
        lastName,
        role,
        createdAt: created.user.created_at,
        passwordSetupRequired: false,
      },
      message: 'User created successfully and saved to database',
    })
  } catch (error) {
    console.error('Error creating user:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
