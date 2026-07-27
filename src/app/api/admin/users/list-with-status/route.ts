import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth/requireAdmin'
import { createClient } from '@/lib/supabase/server'
import { deriveTermsStatus } from '@/lib/terms'
import {
  computeUserTypeFlags,
  UserTypeFilter,
} from '@/lib/userClassification'

const VALID_USER_TYPES: UserTypeFilter[] = ['all', 'patient', 'emergency_contact', 'both']

/**
 * Load the set of users.id that are referenced as someone's emergency contact
 * via the DB-maintained link (emergency_contacts.contact_user_id). This is the
 * authoritative "is_emergency_contact" signal alongside account_type. Returns an
 * empty array (and logs) if the column/table isn't present yet, so the endpoint
 * degrades gracefully rather than 500-ing.
 */
async function loadEmergencyContactUserIds(
  supabase: ReturnType<typeof createClient>
): Promise<string[]> {
  const { data, error } = await supabase
    .from('emergency_contacts')
    .select('contact_user_id')
    .not('contact_user_id', 'is', null)

  if (error) {
    console.warn('Could not load emergency-contact links (classification degraded):', error.message)
    return []
  }
  const ids = new Set<string>()
  for (const row of data || []) {
    if (row.contact_user_id) ids.add(row.contact_user_id as string)
  }
  return Array.from(ids)
}

/**
 * Read configurations.current_terms_version — the single source of truth for
 * which T&C version is current. Returns null if the row/table isn't present yet
 * (migration not applied), in which case any accepted version reads as
 * "Accepted" rather than "Outdated".
 */
async function loadCurrentTermsVersion(
  supabase: ReturnType<typeof createClient>
): Promise<string | null> {
  const { data, error } = await supabase
    .from('configurations')
    .select('value')
    .eq('key', 'current_terms_version')
    .maybeSingle()

  if (error) {
    console.warn('Could not load current_terms_version (terms status degraded):', error.message)
    return null
  }
  return (data?.value ?? null) as string | null
}

export async function GET(request: NextRequest) {
  try {
    const gate = await requireAdmin()
    if (gate.error) return gate.error

    // Get query parameters
    const searchParams = request.nextUrl.searchParams
    const role = searchParams.get('role')
    const search = searchParams.get('search')
    const userTypeParam = (searchParams.get('userType') || 'all') as UserTypeFilter
    const userType: UserTypeFilter = VALID_USER_TYPES.includes(userTypeParam) ? userTypeParam : 'all'
    const limit = parseInt(searchParams.get('limit') || '10')
    const offset = parseInt(searchParams.get('offset') || '0')

    // Service-role client; bypasses RLS.
    const supabase = createClient()

    // The set of accounts that ARE emergency contacts (via the maintained link).
    const ecIds = await loadEmergencyContactUserIds(supabase)
    const ecIdSet = new Set(ecIds)
    const ecInList = ecIds.length ? `(${ecIds.join(',')})` : null

    // Current T&C version — the source of truth for the "Outdated" derivation.
    const currentTermsVersion = await loadCurrentTermsVersion(supabase)

    // "Both" requires at least one linked contact; short-circuit the empty case.
    if (userType === 'both' && !ecInList) {
      return NextResponse.json({ data: [], count: 0 })
    }

    let query = supabase
      .from('users')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })

    // Base filters
    if (role) {
      query = query.eq('role', role)
    }
    if (search) {
      // Strip PostgREST-reserved characters (, . ( ) : *) so the term cannot inject
      // extra OR predicates or break the query.
      const safeSearch = search.replace(/[,.()*:%\\]/g, '').slice(0, 100)
      if (safeSearch) {
        query = query.or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
      }
    }

    // User-type filter — applied in-query so `count` and pagination stay
    // consistent with the flag definitions in src/lib/userClassification.ts.
    // account_type is CHECK-constrained to 'patient' | 'emergency_contact', so
    // account_type <> 'emergency_contact' is equivalent to account_type = 'patient'.
    switch (userType) {
      case 'patient':
        // is_patient && !is_emergency_contact
        query = query.eq('role', 'patient').eq('account_type', 'patient')
        if (ecInList) query = query.not('id', 'in', ecInList)
        break
      case 'both':
        // is_patient && is_emergency_contact (EC via linkage only, since
        // account_type must be 'patient' for is_patient to hold).
        query = query.eq('role', 'patient').eq('account_type', 'patient').in('id', ecIds)
        break
      case 'emergency_contact': {
        // is_emergency_contact: account_type='emergency_contact' OR id in linked set
        const ecPredicate = ecInList
          ? `account_type.eq.emergency_contact,id.in.${ecInList}`
          : `account_type.eq.emergency_contact`
        query = query.or(ecPredicate)
        // AND NOT is_patient: role<>'patient' OR account_type<>'patient'
        query = query.or('role.neq.patient,account_type.neq.patient')
        break
      }
      case 'all':
      default:
        break
    }

    query = query.range(offset, offset + limit - 1)

    const { data: users, error, count } = await query

    if (error) {
      console.error('Error fetching users:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // "Status" is derived from users.is_active; the type flags are derived from
    // account_type + the emergency-contact linkage (source of truth).
    const enrichedUsers = (users || []).map((user) => {
      const flags = computeUserTypeFlags({
        role: user.role,
        account_type: user.account_type,
        isEmergencyContactLinked: ecIdSet.has(user.id),
      })
      return {
        ...user,
        status: user.is_active ? 'active' : 'inactive',
        banned: !user.is_active,
        is_patient: flags.is_patient,
        is_emergency_contact: flags.is_emergency_contact,
        // Terms & Conditions: raw fields flow through via ...user
        // (terms_accepted / terms_version / terms_accepted_at); terms_status is
        // derived against the current version so the UI never re-implements it.
        terms_status: deriveTermsStatus(user.terms_version, currentTermsVersion),
      }
    })

    return NextResponse.json({
      data: enrichedUsers,
      count: count || 0,
      current_terms_version: currentTermsVersion,
    })
  } catch (error: any) {
    console.error('Error fetching users with status:', error)
    return NextResponse.json({
      error: error.message || 'Failed to fetch users',
    }, { status: 500 })
  }
}
