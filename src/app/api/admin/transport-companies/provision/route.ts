import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseAuthUser } from '@/lib/clerk-user-creation'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { blankToNull, LOCATION_FK_FIELDS } from '@/lib/blankToNull'
import { rollbackProvisionedUser } from '@/lib/provisionRollback'
import { EMAIL_REGEX, PHONE_REGEX } from '@/lib/validation/driverApplication'

/**
 * Create a transport company AND its login in one step.
 *
 * WHY. `POST /api/transport-companies` only writes the profile row and demands an
 * existing `user_id`, so adding a real company through the dashboard meant first
 * creating a user under Users → Add User (inventing a password for someone else)
 * and then coming back here to attach the company. The bulk CSV importer already
 * did the whole job in one pass; the single-record path did not. This closes that
 * gap using the same provisioning the importer uses.
 */
export async function POST(request: NextRequest) {
  const gate = await requireAdmin()
  if (gate.error) return gate.error

  // Service-role: provisioning a login is a privileged write, and the anon client
  // used elsewhere in this file's neighbours only works while RLS stays permissive.
  const supabase = createClient()

  try {
    const body = await request.json()
    const email = String(body.email ?? '').trim().toLowerCase()
    const fullName = String(body.full_name ?? '').trim()
    const companyName = String(body.company_name ?? '').trim()
    const phone = String(body.phone ?? '').trim()

    if (!email || !fullName || !companyName) {
      return NextResponse.json(
        { error: 'Contact name, email and company name are all required.', success: false },
        { status: 400 }
      )
    }
    if (!EMAIL_REGEX.test(email)) {
      return NextResponse.json({ error: `"${body.email}" is not a valid email address.`, success: false }, { status: 400 })
    }
    if (phone && !PHONE_REGEX.test(phone)) {
      return NextResponse.json(
        {
          error: `"${phone}" is not a valid 10-digit Indian mobile number (no country code, no leading zero).`,
          success: false,
        },
        { status: 400 }
      )
    }

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()
    if (existingUser) {
      return NextResponse.json(
        { error: `An account already exists for ${email}. Select it under "Use an existing user" instead.`, success: false },
        { status: 409 }
      )
    }

    // Create the login. The handle_new_auth_user() trigger provisions the
    // public.users row from the trusted app_metadata.role — do NOT insert one here.
    const created = await createSupabaseAuthUser(email, fullName, 'transport_company', phone || undefined)
    if (!created.success || !created.appUserId) {
      return NextResponse.json(
        { error: created.error || 'Failed to create the login for this company.', success: false },
        { status: 400 }
      )
    }
    const appUserId = created.appUserId

    await supabase.from('users').update({ full_name: fullName, phone: phone || null }).eq('id', appUserId)

    const profile = blankToNull(
      {
        user_id: appUserId,
        company_name: companyName,
        registration_number: String(body.registration_number ?? '').trim() || null,
        license_valid_till: String(body.license_valid_till ?? '').trim() || null,
        address_line: String(body.address_line ?? '').trim() || null,
        is_verified: body.is_verified === true,
        country_id: body.country_id ?? null,
        state_id: body.state_id ?? null,
        city_id: body.city_id ?? null,
        pincode_id: body.pincode_id ?? null,
      },
      LOCATION_FK_FIELDS
    )

    const { data: company, error: companyError } = await supabase
      .from('transport_companies')
      .insert(profile)
      .select()
      .single()

    if (companyError) {
      // Roll the login back rather than leave an orphan account that blocks the
      // email address on the operator's next attempt. Deleting the auth user is
      // not enough on its own — the users row outlives it (ON DELETE SET NULL)
      // and it is the users row the email check reads.
      const { warning } = await rollbackProvisionedUser({
        authUserId: created.authUserId,
        appUserId,
      })
      const message = `The transport company record could not be saved: ${companyError.message}`
      return NextResponse.json(
        { error: warning ? `${message} ${warning}` : message, success: false },
        { status: 400 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        transportCompany: company,
        message: `${companyName} created. ${email} can sign in after using "Forgot password" to set a password.`,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error provisioning transport company:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create transport company', success: false },
      { status: 500 }
    )
  }
}
