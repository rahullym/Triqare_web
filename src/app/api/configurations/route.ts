import { NextRequest, NextResponse } from 'next/server'
import { ConfigurationService } from '@/services/configurationService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

// GET /api/configurations - Get all configurations
export async function GET() {
  try {
    const { data, error } = await ConfigurationService.getConfigurations()

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error in GET /api/configurations:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// POST /api/configurations - Create or update a configuration
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const body = await request.json()

    // Validate required fields
    if (!body.key || typeof body.key !== 'string') {
      return NextResponse.json(
        { error: 'Key is required and must be a string' },
        { status: 400 }
      )
    }

    if (body.value === undefined || body.value === null) {
      return NextResponse.json(
        { error: 'Value is required' },
        { status: 400 }
      )
    }

    const { data, error } = await ConfigurationService.upsertConfiguration({
      key: body.key.trim(),
      value: String(body.value)
    })

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (err) {
    console.error('Error in POST /api/configurations:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

