import { NextResponse } from 'next/server'
import { MockUserStore } from '@/lib/mockUserStore'
import { getAuthedUser } from '@/lib/supabase/server'

// GET /api/debug/mock-store - Check what's in the mock store
export async function GET() {
  try {
    const { user, appUser } = await getAuthedUser()

    const allUsers = MockUserStore.getAllUsers()
    const userCount = MockUserStore.getUserCount()

    return NextResponse.json({
      success: true,
      currentUserId: user?.id ?? null,
      userCount,
      currentUserInStore: appUser ? 'Found' : 'Not found',
      allUsers: allUsers.map(u => ({
        id: u.id,
        clerk_user_id: u.clerk_user_id,
        email: u.email,
        full_name: u.full_name,
        role: u.role
      }))
    })
  } catch (error) {
    console.error('Error checking mock store:', error)
    return NextResponse.json({
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 })
  }
}
