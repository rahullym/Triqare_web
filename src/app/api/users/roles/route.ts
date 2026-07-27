import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser, createClient } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'
import { UserRole } from '@/types'

// GET /api/users/roles - Get all users with their roles (admin only)
export async function GET(request: NextRequest) {
  try {
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (appUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const role = searchParams.get('role') as UserRole | null
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = createClient()
    let query = supabase
      .from('users')
      .select('id, email, first_name, last_name, role, created_at, last_sign_in_at, avatar_url', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (role) query = query.eq('role', role)

    const { data, count, error } = await query
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const users = (data || []).map((u) => ({
      id: u.id,
      email: u.email || '',
      firstName: u.first_name || '',
      lastName: u.last_name || '',
      fullName: `${u.first_name || ''} ${u.last_name || ''}`.trim() || 'Unknown User',
      role: (u.role as UserRole) || null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at,
      imageUrl: u.avatar_url,
    }))

    // Role statistics come from the full table, not just the current page.
    const { data: allRoles } = await supabase.from('users').select('role')
    const roleStats = {
      admin: allRoles?.filter((u) => u.role === 'admin').length || 0,
      ert: allRoles?.filter((u) => u.role === 'ert').length || 0,
      transport_company: allRoles?.filter((u) => u.role === 'transport_company').length || 0,
      patient: allRoles?.filter((u) => u.role === 'patient').length || 0,
      driver: allRoles?.filter((u) => u.role === 'driver').length || 0,
      unassigned: allRoles?.filter((u) => !u.role).length || 0,
      total: allRoles?.length || 0,
    }

    const total = count || 0
    return NextResponse.json({
      users,
      pagination: { total, limit, offset, hasMore: offset + limit < total },
      roleStats,
    })
  } catch (error) {
    console.error('Error fetching users with roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/users/roles - Bulk update user roles (admin only).
// Each update = { userId: <public.users.id>, role: UserRole }.
export async function POST(request: NextRequest) {
  try {
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (appUser?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden - Admin access required' }, { status: 403 })
    }

    const body = await request.json()
    const { updates } = body
    if (!Array.isArray(updates)) {
      return NextResponse.json({ error: 'Updates must be an array' }, { status: 400 })
    }

    const validRoles: UserRole[] = ['admin', 'ert', 'transport_company', 'patient', 'driver']
    const admin = createClient()
    const results: Array<{ userId: string; success?: boolean; role?: string; error?: string }> = []

    for (const update of updates) {
      const { userId, role } = update
      if (!userId) {
        results.push({ userId, error: 'User ID is required' })
        continue
      }
      if (!role || !validRoles.includes(role)) {
        results.push({ userId, error: 'Invalid role' })
        continue
      }

      const { data, error } = await UserService.updateUser(userId, { role })
      if (error || !data) {
        results.push({ userId, error: error || 'Failed to update user' })
        continue
      }
      // Mirror the role into the auth user's app_metadata (users.role stays authoritative).
      if (data.auth_user_id) {
        try {
          await admin.auth.admin.updateUserById(data.auth_user_id, { app_metadata: { role } })
        } catch {
          /* non-fatal */
        }
      }
      results.push({ userId, success: true, role })
    }

    return NextResponse.json({
      success: true,
      results,
      message: `Processed ${updates.length} role updates`,
    })
  } catch (error) {
    console.error('Error bulk updating user roles:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
