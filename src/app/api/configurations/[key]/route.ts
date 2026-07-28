import { NextRequest, NextResponse } from 'next/server'
import { ConfigurationService } from '@/services/configurationService'
import { requireAdmin } from '@/lib/auth/requireAdmin'

interface RouteParams {
  params: Promise<{ key: string }>
}

// GET /api/configurations/[key] - Get a single configuration by key
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { key } = await params
    const decodedKey = decodeURIComponent(key)
    
    const { data, error } = await ConfigurationService.getConfigurationByKey(decodedKey)

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    if (!data) {
      return NextResponse.json(
        { error: 'Configuration not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error in GET /api/configurations/[key]:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// PUT /api/configurations/[key] - Update a configuration by key
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { key } = await params
    const decodedKey = decodeURIComponent(key)
    const body = await request.json()

    if (body.value === undefined || body.value === null) {
      return NextResponse.json(
        { error: 'Value is required' },
        { status: 400 }
      )
    }

    const { data, error } = await ConfigurationService.updateConfiguration(decodedKey, {
      value: String(body.value)
    })

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (err) {
    console.error('Error in PUT /api/configurations/[key]:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// DELETE /api/configurations/[key] - Delete a configuration by key
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(); if (gate.error) return gate.error
  try {
    const { key } = await params
    const decodedKey = decodeURIComponent(key)
    
    const { error } = await ConfigurationService.deleteConfiguration(decodedKey)

    if (error) {
      return NextResponse.json({ error }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Error in DELETE /api/configurations/[key]:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

