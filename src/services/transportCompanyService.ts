import { supabase } from '@/lib/supabase'
import { blankToNull, LOCATION_FK_FIELDS } from '@/lib/blankToNull'

/**
 * Optional columns the edit form holds as '' when the operator leaves them blank.
 *
 * The location ids are uuid columns — Postgres rejects '' outright
 * (22P02 invalid input syntax for type uuid: ""), which is why simply flipping
 * "Pending" to "Verified" on a company with no pincode failed with an
 * unactionable "Failed to update transport company".
 *
 * `registration_number` is nullable UNIQUE: stored as '' it collides with the
 * next company that also has none ("duplicate key"), where NULLs never collide.
 */
const BLANKABLE_FIELDS = [
  ...LOCATION_FK_FIELDS,
  'registration_number',
  'license_valid_till',
  'address_line',
] as const

export interface TransportCompany {
  user_id: string
  company_name: string
  address_line?: string
  registration_number?: string
  license_valid_till?: string
  is_verified: boolean
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
  // Joined data from users table
  user?: {
    id: string
    full_name: string
    email: string
    phone?: string | null
    role: string
    created_at: string
  }
  // Joined location data
  country?: { id: string; name: string }
  state?: { id: string; name: string }
  city?: { id: string; name: string }
  pincode?: { id: string; code: string }
  // Driver count
  driver_count?: number
}

export interface CreateTransportCompanyData {
  user_id: string
  company_name: string
  address_line?: string
  registration_number?: string
  license_valid_till?: string
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
}

export interface UpdateTransportCompanyData {
  company_name?: string
  address_line?: string
  registration_number?: string
  license_valid_till?: string
  is_verified?: boolean
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
}

export interface TransportCompanyFilters {
  search?: string
  is_verified?: boolean
  country_id?: string
  state_id?: string
  city_id?: string
  limit?: number
  offset?: number
}

export class TransportCompanyService {
  static async getTransportCompanies(filters: TransportCompanyFilters = {}) {
    try {
      let query = supabase
        .from('transport_companies')
        .select(`
          *,
          user:users!transport_companies_user_id_fkey(
            id,
            full_name,
            email,
            role,
            created_at
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `, { count: 'exact' })

      // Apply filters
      if (filters.search) {
        query = query.or(`company_name.ilike.%${filters.search}%,registration_number.ilike.%${filters.search}%`)
      }

      if (filters.is_verified !== undefined) {
        query = query.eq('is_verified', filters.is_verified)
      }

      if (filters.country_id) {
        query = query.eq('country_id', filters.country_id)
      }

      if (filters.state_id) {
        query = query.eq('state_id', filters.state_id)
      }

      if (filters.city_id) {
        query = query.eq('city_id', filters.city_id)
      }

      // Apply pagination
      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      if (filters.offset) {
        query = query.range(filters.offset, filters.offset + (filters.limit || 10) - 1)
      }

      // Order by company name
      query = query.order('company_name', { ascending: true })

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching transport companies:', error)
        throw new Error(error.message)
      }

      // Get driver counts for each transport company
      const companiesWithDriverCount = await Promise.all(
        (data || []).map(async (company) => {
          const { count: driverCount } = await supabase
            .from('drivers')
            .select('user_id', { count: 'exact', head: true })
            .eq('transport_company_id', company.user_id)

          return {
            ...company,
            driver_count: driverCount || 0
          }
        })
      )

      return {
        transportCompanies: companiesWithDriverCount as TransportCompany[],
        count: count || 0
      }
    } catch (error) {
      console.error('Error in getTransportCompanies:', error)
      throw error
    }
  }

  static async getTransportCompanyById(id: string) {
    try {
      const { data, error } = await supabase
        .from('transport_companies')
        .select(`
          *,
          user:users!transport_companies_user_id_fkey(
            id,
            full_name,
            email,
            phone,
            role,
            created_at
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code),
          drivers(
            user_id,
            license_number,
            status,
            is_verified,
            user:users!drivers_user_id_fkey(
              id,
              full_name,
              email,
              phone
            )
          )
        `)
        .eq('user_id', id)
        .single()

      if (error) {
        console.error('Error fetching transport company:', error)
        throw new Error(error.message)
      }

      return data as TransportCompany & { drivers: any[] }
    } catch (error) {
      console.error('Error in getTransportCompanyById:', error)
      throw error
    }
  }

  // Get transport company by user ID (for current logged-in transport company user)
  static async getTransportCompanyByUserId(userId: string) {
    try {
      const { data, error } = await supabase
        .from('transport_companies')
        .select(`
          *,
          user:users!transport_companies_user_id_fkey(
            id,
            full_name,
            email,
            phone,
            role,
            created_at
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .eq('user_id', userId)
        .single()

      if (error) {
        console.error('Error fetching transport company by user ID:', error)
        throw new Error(error.message)
      }

      return data as TransportCompany
    } catch (error) {
      console.error('Error in getTransportCompanyByUserId:', error)
      throw error
    }
  }

  static async createTransportCompany(data: CreateTransportCompanyData) {
    try {
      const { data: result, error } = await supabase
        .from('transport_companies')
        .insert([blankToNull(data as unknown as Record<string, unknown>, BLANKABLE_FIELDS)])
        .select(`
          *,
          user:users!transport_companies_user_id_fkey(
            id,
            full_name,
            email,
            role,
            created_at
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .single()

      if (error) {
        console.error('Error creating transport company:', error)
        throw new Error(error.message)
      }

      return result as TransportCompany
    } catch (error) {
      console.error('Error in createTransportCompany:', error)
      throw error
    }
  }

  static async updateTransportCompany(id: string, data: UpdateTransportCompanyData) {
    try {
      const { data: result, error } = await supabase
        .from('transport_companies')
        .update(blankToNull(data as unknown as Record<string, unknown>, BLANKABLE_FIELDS))
        .eq('user_id', id)
        .select(`
          *,
          user:users!transport_companies_user_id_fkey(
            id,
            full_name,
            email,
            role,
            created_at
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .single()

      if (error) {
        console.error('Error updating transport company:', error)
        throw new Error(error.message)
      }

      return result as TransportCompany
    } catch (error) {
      console.error('Error in updateTransportCompany:', error)
      throw error
    }
  }

  static async upsertTransportCompany(userId: string, data: UpdateTransportCompanyData) {
    try {
      // First try to update existing record
      const { data: existingCompany } = await supabase
        .from('transport_companies')
        .select('user_id')
        .eq('user_id', userId)
        .single()

      if (existingCompany) {
        // Company exists, update it
        return await this.updateTransportCompany(userId, data)
      } else {
        // Company doesn't exist, create it
        const createData: CreateTransportCompanyData = {
          user_id: userId,
          company_name: data.company_name || 'Transport Company',
          address_line: data.address_line,
          registration_number: data.registration_number,
          license_valid_till: data.license_valid_till,
          country_id: data.country_id,
          state_id: data.state_id,
          city_id: data.city_id,
          pincode_id: data.pincode_id,
        }
        return await this.createTransportCompany(createData)
      }
    } catch (error) {
      console.error('Error in upsertTransportCompany:', error)
      throw error
    }
  }

  static async deleteTransportCompany(id: string) {
    try {
      const { error } = await supabase
        .from('transport_companies')
        .delete()
        .eq('user_id', id)

      if (error) {
        console.error('Error deleting transport company:', error)
        throw new Error(error.message)
      }

      return { success: true }
    } catch (error) {
      console.error('Error in deleteTransportCompany:', error)
      throw error
    }
  }

  static async getTransportCompanyStats() {
    try {
      const [totalResult, verifiedResult, unverifiedResult] = await Promise.all([
        supabase.from('transport_companies').select('user_id', { count: 'exact', head: true }),
        supabase.from('transport_companies').select('user_id', { count: 'exact', head: true }).eq('is_verified', true),
        supabase.from('transport_companies').select('user_id', { count: 'exact', head: true }).eq('is_verified', false)
      ])

      return {
        total: totalResult.count || 0,
        verified: verifiedResult.count || 0,
        unverified: unverifiedResult.count || 0
      }
    } catch (error) {
      console.error('Error in getTransportCompanyStats:', error)
      throw error
    }
  }
}
