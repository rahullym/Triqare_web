import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/userService'

export async function GET(request: NextRequest) {
  try {
    console.log('Testing profile data loading...')

    // Get all users from the database
    const { data: users, error } = await UserService.getUsers({})

    if (error) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch users',
        details: error
      }, { status: 500 })
    }

    if (!users || users.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'No users found in database',
        users: []
      })
    }

    // Test resolving a specific user by their Supabase auth id (fallback to legacy clerk id).
    const testUser = users[0]
    const { data: userByClerkId, error: clerkError } = testUser.auth_user_id
      ? await UserService.getUserByAuthId(testUser.auth_user_id)
      : await UserService.getUserByClerkId(testUser.clerk_user_id ?? '')

    return NextResponse.json({
      success: true,
      message: 'Profile test completed',
      totalUsers: users.length,
      sampleUser: testUser,
      userByClerkIdTest: {
        success: !clerkError,
        error: clerkError,
        data: userByClerkId
      },
      allUsers: users.map(u => ({
        id: u.id,
        clerk_user_id: u.clerk_user_id,
        email: u.email,
        full_name: u.full_name,
        role: u.role,
        first_name: u.first_name,
        last_name: u.last_name,
        phone: u.phone,
        department: u.department,
        employee_id: u.employee_id
      }))
    })

  } catch (error) {
    console.error('Profile test error:', error)
    return NextResponse.json({ 
      success: false,
      error: 'Failed to test profile',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
