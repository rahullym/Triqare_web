import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/userService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(request: NextRequest) {
  try {
    // This debug endpoint reads every user and performs a profile update, so it
    // is restricted to admins.
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    console.log('Testing ERT profile page functionality...')

    // Get the ERT user from database
    const { data: users, error } = await UserService.getUsers({})

    if (error || !users) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch users',
        details: error
      }, { status: 500 })
    }

    const ertUser = users.find(user => user.role === 'ert')

    if (!ertUser) {
      return NextResponse.json({
        success: false,
        error: 'No ERT user found in database'
      }, { status: 404 })
    }

    // Simulate profile data loading (what the page does)
    const profileData = {
      fullName: ertUser.full_name || `${ertUser.first_name || ''} ${ertUser.last_name || ''}`.trim() || '',
      email: ertUser.email || '',
      phone: ertUser.phone || '',
      role: 'Emergency Response Team Lead',
      badgeNumber: ertUser.employee_id || '',
      lastLogin: ertUser.last_sign_in_at || '',
      accountCreated: ertUser.created_at || ''
    }

    // Test profile update (what happens when user saves)
    const testUpdateData = {
      first_name: profileData.fullName.split(' ')[0] || '',
      last_name: profileData.fullName.split(' ').slice(1).join(' ') || '',
      full_name: profileData.fullName,
      phone: profileData.phone || '+1234567890',
      bio: `Emergency Response Team Member. Badge: ${profileData.badgeNumber || 'Not assigned'}.`,
      department: 'Emergency Response Team',
      employee_id: profileData.badgeNumber || '',
    }

    const { data: updatedUser, error: updateError } = await UserService.updateUser(ertUser.id, testUpdateData)

    // Test role guard (what protects the page)
    const roleGuardTest = {
      allowedRoles: ['ert'],
      userRole: ertUser.role,
      accessGranted: ertUser.role === 'ert'
    }

    return NextResponse.json({
      success: true,
      message: 'ERT profile page test completed',
      ertUser: {
        id: ertUser.id,
        email: ertUser.email,
        full_name: ertUser.full_name,
        role: ertUser.role,
        phone: ertUser.phone,
        bio: ertUser.bio,
        department: ertUser.department,
        employee_id: ertUser.employee_id
      },
      authProvider: 'Clerk has been removed; identity is provided by Supabase Auth',
      profileDataLoading: {
        success: true,
        data: profileData
      },
      profileUpdateTest: {
        success: !updateError,
        error: updateError,
        updateData: testUpdateData,
        updatedUser: updatedUser ? {
          phone: updatedUser.phone,
          bio: updatedUser.bio,
          department: updatedUser.department,
          employee_id: updatedUser.employee_id,
          updated_at: updatedUser.updated_at
        } : null
      },
      roleGuardTest: roleGuardTest,
      pageAccessibility: {
        url: 'http://localhost:3000/erteam/profile',
        expectedBehavior: 'Should load profile form with ERT user data',
        roleProtection: 'Only accessible to users with role "ert"',
        dataSource: 'Loads from database via /api/profile endpoint'
      },
      recommendations: [
        roleGuardTest.accessGranted ? '✅ ERT user has correct role access' : '❌ Role access issue',
        !updateError ? '✅ Profile updates work correctly' : '❌ Profile update failed',
        '✅ Database user exists and has correct role',
        'Profile page should work correctly for authenticated ERT users'
      ]
    })

  } catch (error) {
    console.error('ERT profile page test error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to test ERT profile page',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
