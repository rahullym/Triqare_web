import { NextRequest, NextResponse } from 'next/server'
import { getAuthedUser } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    console.log('Testing profile API authentication flow...')

    // Test the auth flow
    const { user, appUser } = await getAuthedUser()

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'No authenticated user',
        message: 'This endpoint requires authentication. User must be signed in.'
      })
    }

    console.log('Authenticated user ID:', user.id)

    // Resolve the caller's public.users row (previously via Clerk id lookup)
    return NextResponse.json({
      success: true,
      message: 'Profile auth test completed',
      authenticatedUserId: user.id,
      userLookupResult: {
        success: !!appUser,
        error: appUser ? null : 'No matching users row for the authenticated user',
        user: appUser ? {
          id: appUser.id,
          auth_user_id: appUser.auth_user_id,
          email: appUser.email,
          full_name: appUser.full_name,
          role: appUser.role,
          first_name: appUser.first_name,
          last_name: appUser.last_name,
          phone: appUser.phone,
          department: appUser.department,
          employee_id: appUser.employee_id,
          bio: appUser.bio,
          avatar_url: appUser.avatar_url
        } : null
      }
    })

  } catch (error) {
    console.error('Profile auth test error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to test profile auth',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
