import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * Guards the fix for "Failed to update transport company".
 *
 * country_id / state_id / city_id / pincode_id are uuid columns (verified against
 * the live schema). The edit form holds a cleared optional field as '', and
 * Postgres rejects '' for uuid with 22P02 — so flipping Pending -> Verified on a
 * company with no pincode failed outright. registration_number is nullable
 * UNIQUE, where a stored '' collides with the next company that also has none.
 */

const captured: { update?: Record<string, unknown>; insert?: Record<string, unknown> } = {}

function resultChain() {
  const chain: any = {
    eq: () => chain,
    select: () => chain,
    single: async () => ({ data: { user_id: 'company-1' }, error: null }),
  }
  return chain
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      update: (payload: Record<string, unknown>) => {
        captured.update = payload
        return resultChain()
      },
      insert: (rows: Record<string, unknown>[]) => {
        captured.insert = rows[0]
        return resultChain()
      },
    }),
  },
}))

const { TransportCompanyService } = await import('../transportCompanyService')

beforeEach(() => {
  captured.update = undefined
  captured.insert = undefined
})

describe('TransportCompanyService.updateTransportCompany', () => {
  it('sends NULL, never "", for blank optional columns', async () => {
    await TransportCompanyService.updateTransportCompany('company-1', {
      company_name: 'MJ Ambulance Service',
      is_verified: true,
      registration_number: '',
      license_valid_till: '',
      address_line: '',
      country_id: 'country-uuid',
      state_id: 'state-uuid',
      city_id: 'city-uuid',
      pincode_id: '',
    })

    expect(captured.update).toMatchObject({
      company_name: 'MJ Ambulance Service',
      is_verified: true,
      registration_number: null,
      license_valid_till: null,
      address_line: null,
      country_id: 'country-uuid',
      state_id: 'state-uuid',
      city_id: 'city-uuid',
      pincode_id: null,
    })
  })

  it('is enough on its own to flip verification on a company with no location', async () => {
    await TransportCompanyService.updateTransportCompany('company-1', {
      is_verified: true,
      country_id: '',
      state_id: '',
      city_id: '',
      pincode_id: '',
    })

    expect(captured.update).toEqual({
      is_verified: true,
      country_id: null,
      state_id: null,
      city_id: null,
      pincode_id: null,
    })
  })

  it('leaves values that were filled in untouched', async () => {
    await TransportCompanyService.updateTransportCompany('company-1', {
      registration_number: 'KL0123UPDATE',
      license_valid_till: '2035-12-31',
      pincode_id: 'pincode-uuid',
    })

    expect(captured.update).toMatchObject({
      registration_number: 'KL0123UPDATE',
      license_valid_till: '2035-12-31',
      pincode_id: 'pincode-uuid',
    })
  })

  it('applies the same coercion on create', async () => {
    await TransportCompanyService.createTransportCompany({
      user_id: 'user-1',
      company_name: 'New Company',
      registration_number: '',
      pincode_id: '',
    })

    expect(captured.insert).toMatchObject({
      company_name: 'New Company',
      registration_number: null,
      pincode_id: null,
    })
  })
})
