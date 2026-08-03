/**
 * Name→id resolution for CSV bulk import.
 *
 * WHY THIS EXISTS. The upload routes used to resolve transport companies and
 * locations with `.ilike(...).single()` and fall back to `null` on ANY failure:
 *
 *   const { data } = await supabase.from('transport_companies')
 *     .select('user_id').ilike('company_name', name).single()
 *   return data?.user_id || null
 *
 * `.single()` returns an error — not a row — both when nothing matched and when
 * MORE than one row matched. Discarding that error meant a typo'd company name,
 * or two similarly-named companies, produced `transport_company_id: null` and the
 * driver was still created and counted under "Created N drivers successfully".
 * The operator saw a clean import and got unassigned drivers.
 *
 * These helpers return a discriminated result instead, so callers can fail the
 * row and say which value was wrong.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type LookupResult<T> =
  | { status: 'found'; id: T }
  | { status: 'not_found' }
  | { status: 'ambiguous'; count: number }
  | { status: 'error'; message: string }

/**
 * Resolve exactly one row by a case-insensitive name match.
 *
 * Fetches up to two rows rather than using `.single()`: two is all it takes to
 * prove ambiguity, and it keeps "no match" and "several matches" distinguishable
 * — which is the whole point.
 */
async function lookupOne(
  supabase: SupabaseClient,
  table: string,
  idColumn: string,
  nameColumn: string,
  value: string,
  extraFilter?: { column: string; value: string }
): Promise<LookupResult<string>> {
  let query = supabase.from(table).select(idColumn).ilike(nameColumn, value.trim()).limit(2)
  if (extraFilter) {
    query = query.eq(extraFilter.column, extraFilter.value)
  }

  const { data, error } = await query
  if (error) {
    return { status: 'error', message: error.message }
  }
  const rows = (data ?? []) as unknown as Record<string, string>[]
  if (rows.length === 0) {
    return { status: 'not_found' }
  }
  if (rows.length > 1) {
    return { status: 'ambiguous', count: rows.length }
  }
  const id = rows[0]?.[idColumn]
  if (!id) {
    return { status: 'error', message: `row matched but ${idColumn} was empty` }
  }
  return { status: 'found', id }
}

export async function lookupTransportCompanyId(
  supabase: SupabaseClient,
  companyName: string
): Promise<LookupResult<string>> {
  return lookupOne(supabase, 'transport_companies', 'user_id', 'company_name', companyName)
}

export interface LocationIds {
  country_id: string | null
  state_id: string | null
  city_id: string | null
  pincode_id: string | null
}

/**
 * Resolve the country → state → city → pincode chain.
 *
 * Each level is scoped to the one above it, so "Kochi" is only matched inside the
 * named state. Errors accumulate rather than short-circuiting: an operator fixing
 * a spreadsheet wants every bad cell in the row named at once, not one per upload.
 *
 * A blank cell is not an error — location is optional. A cell that was FILLED IN
 * but did not resolve is, because that is the case the old code silently dropped.
 */
export async function resolveLocationIds(
  supabase: SupabaseClient,
  record: {
    country_name?: string
    state_name?: string
    city_name?: string
    pincode?: string
  }
): Promise<{ ids: LocationIds; errors: string[] }> {
  const ids: LocationIds = { country_id: null, state_id: null, city_id: null, pincode_id: null }
  const errors: string[] = []

  const describe = (label: string, value: string, result: LookupResult<string>): string => {
    if (result.status === 'ambiguous') {
      return `${label} "${value}" matches ${result.count} records — it is ambiguous.`
    }
    if (result.status === 'error') {
      return `${label} "${value}" could not be looked up: ${result.message}`
    }
    return `${label} "${value}" was not found.`
  }

  const country = record.country_name?.trim()
  if (country) {
    const result = await lookupOne(supabase, 'countries', 'id', 'name', country)
    if (result.status === 'found') ids.country_id = result.id
    else errors.push(describe('Country', country, result))
  }

  const state = record.state_name?.trim()
  if (state) {
    if (!ids.country_id) {
      errors.push(`State "${state}" cannot be resolved without a valid country.`)
    } else {
      const result = await lookupOne(supabase, 'states', 'id', 'name', state, {
        column: 'country_id',
        value: ids.country_id,
      })
      if (result.status === 'found') ids.state_id = result.id
      else errors.push(describe('State', state, result))
    }
  }

  const city = record.city_name?.trim()
  if (city) {
    if (!ids.state_id) {
      errors.push(`City "${city}" cannot be resolved without a valid state.`)
    } else {
      const result = await lookupOne(supabase, 'cities', 'id', 'name', city, {
        column: 'state_id',
        value: ids.state_id,
      })
      if (result.status === 'found') ids.city_id = result.id
      else errors.push(describe('City', city, result))
    }
  }

  const pincode = record.pincode?.trim()
  if (pincode) {
    if (!ids.city_id) {
      errors.push(`Pincode "${pincode}" cannot be resolved without a valid city.`)
    } else {
      const result = await lookupOne(supabase, 'pincodes', 'id', 'code', pincode, {
        column: 'city_id',
        value: ids.city_id,
      })
      if (result.status === 'found') ids.pincode_id = result.id
      else errors.push(describe('Pincode', pincode, result))
    }
  }

  return { ids, errors }
}
