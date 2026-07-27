import { NextResponse } from 'next/server'
import { createClient, getAuthedUser } from '@/lib/supabase/server'

type Supabase = ReturnType<typeof createClient>

/**
 * Resolves the authenticated transport-company owner and returns the
 * service-role client scoped for their queries. SERVER-ONLY.
 *
 * Returns { companyUserId, supabase } on success, or { error } (a ready
 * NextResponse) for the caller to return.
 */
export async function getTransportCompany(): Promise<
  { companyUserId: string; supabase: Supabase; error?: undefined } | { error: NextResponse }
> {
  const supabase = createClient()
  const { user, appUser } = await getAuthedUser()
  if (!user) {
    return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  if (!appUser) {
    return { error: NextResponse.json({ error: 'User not found' }, { status: 404 }) }
  }
  if (appUser.role !== 'transport_company') {
    return {
      error: NextResponse.json(
        { error: 'Forbidden - transport company access required' },
        { status: 403 },
      ),
    }
  }

  const { data: company, error: companyError } = await supabase
    .from('transport_companies')
    .select('user_id')
    .eq('user_id', appUser.id as string)
    .single()
  if (companyError || !company) {
    return { error: NextResponse.json({ error: 'Transport company not found' }, { status: 404 }) }
  }

  return { companyUserId: company.user_id, supabase }
}

/** Confirms a driver belongs to the given transport company (ownership check). */
export async function driverBelongsToCompany(
  supabase: Supabase,
  driverId: string,
  companyUserId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('drivers')
    .select('user_id')
    .eq('user_id', driverId)
    .eq('transport_company_id', companyUserId)
    .maybeSingle()
  return !!data
}
