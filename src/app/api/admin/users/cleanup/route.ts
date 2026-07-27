import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { UserService } from '@/services/userService'

// POST /api/admin/users/cleanup - Clean up duplicate users in database (admin only)
export async function POST(_request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    // Clean up duplicate users
    const { success, error, cleaned } = await UserService.cleanupDuplicateUsers()

    if (!success) {
      return NextResponse.json({
        error: `Failed to cleanup duplicates: ${error}`
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully cleaned up ${cleaned} duplicate users`,
      cleaned
    })

  } catch (error) {
    console.error('Error cleaning up duplicate users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/admin/users/cleanup - Get duplicate users information
export async function GET(_request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    // Find duplicate users
    const { data: duplicates, error } = await UserService.findDuplicateUsers()

    if (error) {
      return NextResponse.json({
        error: `Failed to find duplicates: ${error}`
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      duplicates: duplicates || [],
      totalDuplicates: duplicates?.length || 0,
      totalAffectedUsers: duplicates?.reduce((sum, dup) => sum + dup.count, 0) || 0
    })

  } catch (error) {
    console.error('Error finding duplicate users:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
