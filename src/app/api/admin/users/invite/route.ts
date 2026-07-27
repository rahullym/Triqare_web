import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { sendUserInvitation } from '@/lib/invitations'
import { UserRole } from '@/types'

// POST /api/admin/users/invite - Send invitation to a new user (admin only)
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    const { email, role } = body

    console.log('Received invitation request:', { email, role })

    // Validate required fields
    if (!email || !role) {
      return NextResponse.json({
        error: 'Missing required fields: email and role are required'
      }, { status: 400 })
    }

    // Validate role
    const validRoles: UserRole[] = ['admin', 'ert', 'transport_company', 'patient', 'driver']
    if (!validRoles.includes(role)) {
      return NextResponse.json({
        error: 'Invalid role. Must be one of: ' + validRoles.join(', ')
      }, { status: 400 })
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json({
        error: 'Invalid email format'
      }, { status: 400 })
    }

    // Send the invitation via Supabase Auth. The helper creates the (unconfirmed)
    // auth user, emails the invite link, and applies the intended role.
    const result = await sendUserInvitation(email, role as UserRole, gate.appUser.id)

    if (!result.success) {
      const message = result.error || 'Unknown error'
      console.error('Invitation error:', message)

      // Supabase returns an error when the user already exists / was already invited.
      if (/already|exists|registered|duplicate/i.test(message)) {
        return NextResponse.json({
          error: 'A user with this email address already exists or has a pending invitation'
        }, { status: 409 })
      }

      return NextResponse.json({
        error: `Failed to create invitation: ${message}`
      }, { status: 500 })
    }

    console.log('Invitation created successfully:', {
      id: result.invitationId,
      email: result.email,
    })

    return NextResponse.json({
      success: true,
      invitation: {
        id: result.invitationId,
        email: result.email,
        status: 'pending',
        role,
      },
      message: `Invitation sent successfully to ${email}. They will receive an email with a link to set up their account.`
    })

  } catch (error) {
    console.error('Error creating invitation:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/admin/users/invite - List all pending invitations (admin only)
export async function GET(_request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    // "Pending invitations" are Supabase auth users who were invited but have not
    // yet confirmed their email (i.e. not yet set a password / signed in).
    const supabase = createClient()
    const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })

    if (error) {
      console.error('Error fetching invitations:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const invitations = (data?.users || [])
      .filter((u) => u.invited_at && !u.email_confirmed_at)
      .map((u) => ({
        id: u.id,
        email: u.email,
        status: 'pending',
        role: (u.app_metadata as Record<string, any>)?.role,
        invitedBy: (u.user_metadata as Record<string, any>)?.invited_by,
        invitedAt: (u.user_metadata as Record<string, any>)?.invited_at || u.invited_at,
        createdAt: u.created_at,
      }))

    return NextResponse.json({
      success: true,
      invitations,
    })

  } catch (error) {
    console.error('Error fetching invitations:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
