import { NextRequest, NextResponse } from 'next/server'
import { UserRole } from '@/types'
import { UserService } from '@/services/userService'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

// The [userId] param is now the public.users.id (uuid). Role lives in
// public.users.role (source of truth) instead of Clerk metadata.

// GET /api/users/[userId]/role - Get user role (admin only)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user, appUser } = await getAuthedUser()
    const { userId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!appUser || appUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const { data: target, error } = await UserService.getUserById(userId)
    if (error || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({
      userId: target.id,
      role: target.role,
      email: target.email,
      firstName: target.first_name,
      lastName: target.last_name,
    })
  } catch (error) {
    console.error('Error fetching user role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PUT /api/users/[userId]/role - Update user role
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user, appUser } = await getAuthedUser()
    const { userId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUserRole = appUser?.role as UserRole | undefined
    // Allow self-assignment ONLY for a role-less user updating their own account.
    const isSelfAssignment = appUser?.id === userId && !currentUserRole

    if (!isSelfAssignment && currentUserRole !== 'admin') {
      return NextResponse.json(
        { error: 'Forbidden - Admin access required or self-assignment for users without roles' },
        { status: 403 },
      )
    }

    const body = await request.json()
    const { role } = body

    const validRoles: UserRole[] = ['admin', 'ert', 'transport_company', 'patient', 'driver']
    if (!role || !validRoles.includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role. Must be one of: ' + validRoles.join(', ') },
        { status: 400 },
      )
    }

    // SECURITY: privilege-escalation guard. A role-less user self-assigning may ONLY
    // claim the non-privileged 'patient' role; all privileged roles require an admin.
    const SELF_ASSIGNABLE_ROLES: UserRole[] = ['patient']
    if (isSelfAssignment && currentUserRole !== 'admin' && !SELF_ASSIGNABLE_ROLES.includes(role)) {
      return NextResponse.json(
        { error: 'Forbidden - self-assignment is limited to the patient role; privileged roles require an administrator' },
        { status: 403 },
      )
    }

    // Source of truth: public.users.role.
    const dbUpdateResult = await UserService.updateUser(userId, { role })
    if (dbUpdateResult.error || !dbUpdateResult.data) {
      return NextResponse.json({ error: dbUpdateResult.error || 'User not found' }, { status: 400 })
    }

    // Best-effort: mirror the role into the auth user's app_metadata so a future
    // re-provision reflects it. (users.role remains authoritative.)
    if (dbUpdateResult.data.auth_user_id) {
      try {
        const admin = createClient()
        await admin.auth.admin.updateUserById(dbUpdateResult.data.auth_user_id, {
          app_metadata: { role },
        })
      } catch (e) {
        console.warn('Could not mirror role into auth app_metadata:', e)
      }
    }

    return NextResponse.json({
      success: true,
      userId: dbUpdateResult.data.id,
      role: dbUpdateResult.data.role,
      email: dbUpdateResult.data.email,
      firstName: dbUpdateResult.data.first_name,
      lastName: dbUpdateResult.data.last_name,
      message: `User role updated to ${role}`,
      databaseUpdated: true,
    })
  } catch (error) {
    console.error('Error updating user role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE /api/users/[userId]/role - Demote a user to the base 'patient' role
// (users.role is NOT NULL, so a role cannot be fully removed).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const { user, appUser } = await getAuthedUser()
    const { userId } = await params

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!appUser || appUser.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const dbUpdateResult = await UserService.updateUser(userId, { role: 'patient' })
    if (dbUpdateResult.error || !dbUpdateResult.data) {
      return NextResponse.json({ error: dbUpdateResult.error || 'User not found' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      userId: dbUpdateResult.data.id,
      role: dbUpdateResult.data.role,
      email: dbUpdateResult.data.email,
      message: 'User role reset to patient',
      databaseUpdated: true,
    })
  } catch (error) {
    console.error('Error removing user role:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
