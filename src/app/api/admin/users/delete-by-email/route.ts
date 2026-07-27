import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { UserService } from '@/services/userService'

// POST /api/admin/users/delete-by-email - Delete a user by email (admin only).
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    const { email } = body
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: user, error: findError } = await supabase
      .from('users')
      .select('id, auth_user_id, email, full_name, role')
      .eq('email', email)
      .maybeSingle()

    if (findError || !user) {
      return NextResponse.json({ error: 'User not found', email }, { status: 404 })
    }

    // UserService.deleteUser removes the Supabase auth user (if linked) then the
    // app row (CASCADE handles related records).
    const { success, error } = await UserService.deleteUser(user.id)
    if (!success) {
      return NextResponse.json({ error: error || 'Failed to delete user' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted user: ${user.email}`,
      user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role },
    })
  } catch (error) {
    console.error('Error in delete-by-email:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
