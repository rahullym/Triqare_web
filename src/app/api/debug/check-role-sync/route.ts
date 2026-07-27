import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/userService'
import { getAuthedUser } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  try {
    // Require an authenticated caller.
    const { user, appUser } = await getAuthedUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    console.log('Checking database role assignments...')

    // Clerk has been removed. Role sync between Clerk and the database no longer
    // applies — the database is now the single source of truth for roles. This
    // endpoint reports each user's database role (plus the role implied by their
    // email pattern) so mismatches can still be spotted.
    const { data: dbUsers, error } = await UserService.getUsers({})

    if (error || !dbUsers) {
      return NextResponse.json({
        success: false,
        error: 'Failed to fetch database users',
        details: error
      }, { status: 500 })
    }

    const roleComparisons = dbUsers.map((dbUser) => {
      const emailPattern = getEmailRolePattern(dbUser.email || '')
      const roleMatch = emailPattern === null || dbUser.role === emailPattern
      return {
        userId: dbUser.id,
        email: dbUser.email,
        databaseRole: dbUser.role,
        emailRolePattern: emailPattern,
        roleMatch,
        recommendedAction: roleMatch
          ? 'Database role is consistent'
          : `Database role "${dbUser.role}" differs from email pattern "${emailPattern}"`
      }
    })

    const totalUsers = roleComparisons.length
    const syncedUsers = roleComparisons.filter(c => c.roleMatch).length
    const unsyncedUsers = roleComparisons.filter(c => !c.roleMatch).length

    return NextResponse.json({
      success: true,
      message: 'Database role check completed (Clerk sync no longer applies)',
      requestedBy: (appUser?.email as string) ?? user.email ?? null,
      summary: {
        totalUsers,
        syncedUsers,
        unsyncedUsers,
        syncRate: totalUsers > 0 ? `${Math.round((syncedUsers / totalUsers) * 100)}%` : '0%'
      },
      roleComparisons,
      recommendations: [
        'Clerk has been removed; the database is the source of truth for roles.',
        unsyncedUsers > 0
          ? `${unsyncedUsers} users have a database role that differs from their email pattern`
          : 'All database roles are consistent with their email patterns'
      ]
    })

  } catch (error) {
    console.error('Role check error:', error)
    return NextResponse.json({
      success: false,
      error: 'Failed to check roles',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

function getEmailRolePattern(email: string): string | null {
  if (email.includes('admin')) return 'admin'
  if (email.includes('ert')) return 'ert'
  if (email.includes('transport')) return 'transport_company'
  if (email.includes('patient')) return 'patient'
  if (email.includes('driver')) return 'driver'
  return null
}
