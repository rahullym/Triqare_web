import { NextResponse } from 'next/server'
import { announcementService } from '@/services/announcementService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const announcement = await announcementService.getAnnouncementById(id)
    
    if (!announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(announcement)
  } catch (error) {
    console.error('Error fetching announcement:', error)
    return NextResponse.json(
      { error: 'Failed to fetch announcement' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { id } = await params
    const body = await request.json()

    const announcement = await announcementService.updateAnnouncement(id, {
      title: body.title,
      message: body.message,
      link_url: body.link_url,
      is_active: body.is_active,
      start_at: body.start_at,
      end_at: body.end_at,
    })

    if (!announcement) {
      return NextResponse.json(
        { error: 'Announcement not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(announcement)
  } catch (error) {
    console.error('Error updating announcement:', error)
    return NextResponse.json(
      { error: 'Failed to update announcement' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { id } = await params
    const success = await announcementService.deleteAnnouncement(id)

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to delete announcement' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting announcement:', error)
    return NextResponse.json(
      { error: 'Failed to delete announcement' },
      { status: 500 }
    )
  }
}

