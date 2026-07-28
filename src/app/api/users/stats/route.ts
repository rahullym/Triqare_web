import { NextResponse } from 'next/server'
import { UserService } from '@/services/userService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/users/stats - aggregate user statistics (admin dashboard)
export async function GET() {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const result = await UserService.getUserStats()

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ stats: result.data })
  } catch (error) {
    console.error('Error in GET /api/users/stats:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
