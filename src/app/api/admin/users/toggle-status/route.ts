import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'

// POST /api/admin/users/toggle-status - Activate/deactivate a user (admin only).
// Body: { userId: <public.users.id>, action: 'ban' | 'unban' }
// Deactivation flips users.is_active AND bans the Supabase auth user so they
// cannot obtain a session.
export async function POST(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    const body = await request.json()
    // Accept `userId` (public.users.id); tolerate the legacy `clerkUserId` field name.
    const targetId: string | undefined = body.userId || body.clerkUserId
    const action: string | undefined = body.action

    if (!targetId || !action) {
      return NextResponse.json({ error: 'Missing required fields: userId and action' }, { status: 400 })
    }
    if (action !== 'ban' && action !== 'unban') {
      return NextResponse.json({ error: 'Invalid action. Must be "ban" or "unban"' }, { status: 400 })
    }

    const supabase = createClient()
    const { data: target, error: findError } = await supabase
      .from('users')
      .select('id, auth_user_id, role')
      .eq('id', targetId)
      .maybeSingle()

    if (findError || !target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Prevent admin from deactivating themselves.
    if (target.id === gate.appUser.id) {
      return NextResponse.json({ error: 'You cannot deactivate your own account' }, { status: 400 })
    }
    // Prevent deactivating other admins.
    if (target.role === 'admin' && action === 'ban') {
      return NextResponse.json({ error: 'Cannot deactivate admin accounts' }, { status: 403 })
    }

    const isActive = action === 'unban'
    const { error: updateError } = await supabase
      .from('users')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', target.id)
    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    // Mirror the block onto the auth user so a deactivated user can't sign in.
    if (target.auth_user_id) {
      try {
        await supabase.auth.admin.updateUserById(target.auth_user_id, {
          ban_duration: action === 'ban' ? '876000h' : 'none',
        } as any)
      } catch (e) {
        console.warn('Could not update auth ban state:', e)
      }
    }

    return NextResponse.json({
      success: true,
      message: action === 'ban' ? 'User deactivated successfully' : 'User activated successfully',
      action,
      userId: target.id,
    })
  } catch (error: any) {
    console.error('Error toggling user status:', error)
    return NextResponse.json({ error: error.message || 'Failed to update user status' }, { status: 500 })
  }
}
