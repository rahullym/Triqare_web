import { NextRequest, NextResponse } from 'next/server'
import { TransportCompanyService } from '@/services/transportCompanyService'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'
import { blankToNull, LOCATION_FK_FIELDS } from '@/lib/blankToNull'

export async function GET(request: NextRequest) {
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const { searchParams } = new URL(request.url)
    
    const filters = {
      search: searchParams.get('search') || undefined,
      is_verified: searchParams.get('is_verified') ? searchParams.get('is_verified') === 'true' : undefined,
      country_id: searchParams.get('country_id') || undefined,
      state_id: searchParams.get('state_id') || undefined,
      city_id: searchParams.get('city_id') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : 10,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : 0
    }

    const { transportCompanies, count } = await TransportCompanyService.getTransportCompanies(filters)

    return NextResponse.json({
      transportCompanies,
      count,
      success: true
    })
  } catch (error) {
    console.error('Error fetching transport companies:', error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to fetch transport companies',
        success: false 
      },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error
  try {
    // The add form holds untouched optional fields as '' and posts them verbatim.
    // Postgres rejects '' for a uuid column (22P02), so leaving the optional
    // location fields blank — which the form invites — failed the whole insert.
    const body = blankToNull(await request.json(), [...LOCATION_FK_FIELDS, 'license_valid_till'])

    // Validate required fields
    if (!body.user_id || !body.company_name) {
      return NextResponse.json(
        { 
          error: 'Missing required fields: user_id and company_name are required',
          success: false 
        },
        { status: 400 }
      )
    }

    // Validate license_valid_till format if provided
    if (body.license_valid_till) {
      const dateRegex = /^\d{4}-\d{2}-\d{2}$/
      if (!dateRegex.test(body.license_valid_till)) {
        return NextResponse.json(
          { 
            error: 'Invalid license_valid_till format. Use YYYY-MM-DD',
            success: false 
          },
          { status: 400 }
        )
      }
    }

    const transportCompany = await TransportCompanyService.createTransportCompany(body)

    return NextResponse.json({
      transportCompany,
      success: true
    }, { status: 201 })
  } catch (error) {
    console.error('Error creating transport company:', error)
    
    // Handle unique constraint violations
    if (error instanceof Error && error.message.includes('duplicate key')) {
      if (error.message.includes('registration_number')) {
        return NextResponse.json(
          { 
            error: 'Registration number already exists',
            success: false 
          },
          { status: 409 }
        )
      }
    }

    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : 'Failed to create transport company',
        success: false 
      },
      { status: 500 }
    )
  }
}
