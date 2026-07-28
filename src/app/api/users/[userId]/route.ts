import { NextRequest, NextResponse } from 'next/server'
import { UserService } from '@/services/userService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/users/[userId] - Get a single user by ID
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const result = await UserService.getUserById(userId)

    if (result.error) {
      return NextResponse.json(
        { error: result.error },
        { status: 500 }
      )
    }

    if (!result.data) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ user: result.data })
  } catch (error) {
    console.error('Error in GET /api/users/[userId]:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/users/[userId] - Update a user by ID
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { userId } = await params
    const body = await request.json()

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    // Validate role if provided
    if (body.role) {
      const validRoles = ['admin', 'ert', 'transport_company', 'driver', 'patient']
      if (!validRoles.includes(body.role)) {
        return NextResponse.json(
          { 
            error: `Invalid role. Must be one of: ${validRoles.join(', ')}`,
            success: false 
          },
          { status: 400 }
        )
      }
    }

    const result = await UserService.updateUser(userId, body)

    if (result.error) {
      return NextResponse.json(
        { error: result.error, success: false },
        { status: 500 }
      )
    }

    if (!result.data) {
      return NextResponse.json(
        { error: 'User not found', success: false },
        { status: 404 }
      )
    }

    return NextResponse.json({
      user: result.data,
      success: true
    })
  } catch (error) {
    console.error('Error in PUT /api/users/[userId]:', error)
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    )
  }
}

// DELETE /api/users/[userId] - Delete a user by ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { userId } = await params

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const result = await UserService.deleteUser(userId)

    if (result.error) {
      return NextResponse.json(
        { error: result.error, success: false },
        { status: 500 }
      )
    }

    return NextResponse.json({
      message: 'User deleted successfully',
      success: true
    })
  } catch (error) {
    console.error('Error in DELETE /api/users/[userId]:', error)
    return NextResponse.json(
      { error: 'Internal server error', success: false },
      { status: 500 }
    )
  }
}
