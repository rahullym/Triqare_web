import { NextRequest, NextResponse } from 'next/server'
import { announcementService } from '@/services/announcementService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

export async function GET(request: NextRequest) {
  const gate = await requireRole(STAFF_ROLES); if (gate.error) return gate.error
  try {
    const searchParams = request.nextUrl.searchParams
    const limit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined
    const offset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined

    const { announcements, count } = await announcementService.getAnnouncements({ limit, offset })
    return NextResponse.json({ announcements, count })
  } catch (error) {
    console.error('Error fetching announcements:', error)
    return NextResponse.json(
      { error: 'Failed to fetch announcements' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const body = await request.json()

    if (!body.title || !body.message) {
      return NextResponse.json(
        { error: 'Title and message are required' },
        { status: 400 }
      )
    }

    const announcement = await announcementService.createAnnouncement({
      title: body.title,
      message: body.message,
      link_url: body.link_url || null,
      is_active: body.is_active ?? true,
      start_at: body.start_at || null,
      end_at: body.end_at || null,
    })

    return NextResponse.json(announcement, { status: 201 })
  } catch (error) {
    console.error('Error creating announcement:', error)
    return NextResponse.json(
      { error: 'Failed to create announcement' },
      { status: 500 }
    )
  }
}

