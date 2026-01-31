import { supabase } from '@/lib/supabase'

export interface Driver {
  user_id: string
  transport_company_id: string
  license_number: string
  aadhar_number?: string
  is_verified: boolean
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  current_request_id?: string
  latitude?: number
  longitude?: number
  last_updated_at: string
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
  address_line?: string
  // Joined data from users table
  user?: {
    id: string
    full_name: string
    email: string
    role: string
    created_at: string
  }
  // Joined transport company data
  transport_company?: {
    user_id: string
    company_name: string
    registration_number?: string
    is_verified: boolean
  }
  // Joined location data
  country?: { id: string; name: string }
  state?: { id: string; name: string }
  city?: { id: string; name: string }
  pincode?: { id: string; code: string }
  // Current SOS request data
  current_request?: {
    id: string
    status: string
    created_at: string
  }
}

export interface CreateDriverData {
  user_id: string
  transport_company_id: string
  license_number: string
  aadhar_number?: string
  is_verified?: boolean
  status: 'available' | 'assigned' | 'on_trip' | 'inactive'
  latitude?: number
  longitude?: number
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
  address_line?: string
  created_by?: string // Optional - Transport company user who is creating this driver
  license_class?: string
  license_expiry?: string
  medical_cert_expiry?: string
  years_experience?: number
  special_certifications?: string
  languages_spoken?: string
  vehicle_assigned?: string
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relationship?: string
  preferred_shift?: 'morning' | 'afternoon' | 'night' | 'flexible'
  max_distance_km?: number
}

export interface UpdateDriverData {
  transport_company_id?: string
  license_number?: string
  aadhar_number?: string
  is_verified?: boolean
  status?: 'available' | 'assigned' | 'on_trip' | 'inactive'
  current_request_id?: string
  latitude?: number
  longitude?: number
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
  address_line?: string
  license_class?: string
  license_expiry?: string
  medical_cert_expiry?: string
  years_experience?: number
  special_certifications?: string
  languages_spoken?: string
  vehicle_assigned?: string
  rating?: number
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relationship?: string
  preferred_shift?: 'morning' | 'afternoon' | 'night' | 'flexible'
  max_distance_km?: number
  is_online?: boolean
}

export interface DriverFilters {
  search?: string
  status?: 'available' | 'assigned' | 'on_trip' | 'inactive'
  transport_company_id?: string
  is_verified?: boolean
  country_id?: string
  state_id?: string
  city_id?: string
  limit?: number
  offset?: number
}

export class DriverService {
  static async getDrivers(filters: DriverFilters = {}) {
    try {
      let query = supabase
        .from('drivers')
        .select(`
          *,
          user:users!drivers_user_id_fkey(
            id,
            full_name,
            email,
            phone,
            role,
            created_at,
            first_name,
            last_name
          ),
          transport_company:transport_companies!drivers_transport_company_id_fkey(
            user_id,
            company_name,
            registration_number,
            is_verified
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `, { count: 'exact' })

      // Apply filters
      if (filters.search) {
        query = query.or(`license_number.ilike.%${filters.search}%,aadhar_number.ilike.%${filters.search}%`)
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.transport_company_id) {
        query = query.eq('transport_company_id', filters.transport_company_id)
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

      // Order by last updated
      query = query.order('last_updated_at', { ascending: false })

      const { data, error, count } = await query

      if (error) {
        console.error('Error fetching drivers:', error)
        throw new Error(error.message)
      }

      return {
        drivers: data as Driver[],
        count: count || 0
      }
    } catch (error) {
      console.error('Error in getDrivers:', error)
      throw error
    }
  }

  // Get drivers for a specific transport company (for transport company users)
  static async getDriversForTransportCompany(transportCompanyUserId: string, filters: Omit<DriverFilters, 'transport_company_id'> = {}) {
    try {
      // First get the transport company ID from the user ID
      const { data: transportCompany, error: companyError } = await supabase
        .from('transport_companies')
        .select('user_id')
        .eq('user_id', transportCompanyUserId)
        .single()

      if (companyError) {
        console.error('Error fetching transport company:', companyError)
        throw new Error('Transport company not found')
      }

      // Now get drivers for this transport company
      return await this.getDrivers({
        ...filters,
        transport_company_id: transportCompany.user_id
      })
    } catch (error) {
      console.error('Error in getDriversForTransportCompany:', error)
      throw error
    }
  }

  static async getDriverById(id: string) {
    try {
      const { data, error } = await supabase
        .from('drivers')
        .select(`
          *,
          user:users!drivers_user_id_fkey(
            id,
            full_name,
            email,
            phone,
            role,
            created_at,
            first_name,
            last_name
          ),
          transport_company:transport_companies!drivers_transport_company_id_fkey(
            user_id,
            company_name,
            registration_number,
            is_verified,
            address_line
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .eq('user_id', id)
        .single()

      if (error) {
        console.error('Error fetching driver:', error)
        throw new Error(error.message)
      }

      return data as Driver
    } catch (error) {
      console.error('Error in getDriverById:', error)
      throw error
    }
  }

  static async createDriver(data: CreateDriverData) {
    try {
      // Filter out fields that don't exist in the database
      const {
        created_by,
        license_class,
        license_expiry,
        medical_cert_expiry,
        years_experience,
        special_certifications,
        languages_spoken,
        vehicle_assigned,
        emergency_contact_name,
        emergency_contact_phone,
        emergency_contact_relationship,
        preferred_shift,
        ...validData
      } = data

      const { data: result, error } = await supabase
        .from('drivers')
        .insert([{
          ...validData,
          last_updated_at: new Date().toISOString()
        }])
        .select(`
          *,
          user:users!drivers_user_id_fkey(
            id,
            full_name,
            email,
            role,
            created_at
          ),
          transport_company:transport_companies!drivers_transport_company_id_fkey(
            user_id,
            company_name,
            registration_number,
            is_verified
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .single()

      if (error) {
        console.error('Error creating driver:', error)
        throw new Error(error.message)
      }

      return result as Driver
    } catch (error) {
      console.error('Error in createDriver:', error)
      throw error
    }
  }

  static async updateDriver(id: string, data: UpdateDriverData) {
    try {
      const { data: result, error } = await supabase
        .from('drivers')
        .update({
          ...data,
          last_updated_at: new Date().toISOString()
        })
        .eq('user_id', id)
        .select(`
          *,
          user:users!drivers_user_id_fkey(
            id,
            full_name,
            email,
            role,
            created_at
          ),
          transport_company:transport_companies!drivers_transport_company_id_fkey(
            user_id,
            company_name,
            registration_number,
            is_verified
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .single()

      if (error) {
        console.error('Error updating driver:', error)
        throw new Error(error.message)
      }

      return result as Driver
    } catch (error) {
      console.error('Error in updateDriver:', error)
      throw error
    }
  }

  static async deleteDriver(id: string) {
    try {
      const { error } = await supabase
        .from('drivers')
        .delete()
        .eq('user_id', id)

      if (error) {
        console.error('Error deleting driver:', error)
        throw new Error(error.message)
      }

      return { success: true }
    } catch (error) {
      console.error('Error in deleteDriver:', error)
      throw error
    }
  }

  static async updateDriverLocation(id: string, latitude: number, longitude: number) {
    try {
      const { data: result, error } = await supabase
        .from('drivers')
        .update({
          latitude,
          longitude,
          last_updated_at: new Date().toISOString()
        })
        .eq('user_id', id)
        .select()
        .single()

      if (error) {
        console.error('Error updating driver location:', error)
        throw new Error(error.message)
      }

      return result
    } catch (error) {
      console.error('Error in updateDriverLocation:', error)
      throw error
    }
  }

  static async getDriverStats() {
    try {
      const [totalResult, availableResult, assignedResult, onTripResult, inactiveResult, verifiedResult] = await Promise.all([
        supabase.from('drivers').select('user_id', { count: 'exact', head: true }),
        supabase.from('drivers').select('user_id', { count: 'exact', head: true }).eq('status', 'available'),
        supabase.from('drivers').select('user_id', { count: 'exact', head: true }).eq('status', 'assigned'),
        supabase.from('drivers').select('user_id', { count: 'exact', head: true }).eq('status', 'on_trip'),
        supabase.from('drivers').select('user_id', { count: 'exact', head: true }).eq('status', 'inactive'),
        supabase.from('drivers').select('user_id', { count: 'exact', head: true }).eq('is_verified', true)
      ])

      return {
        total: totalResult.count || 0,
        available: availableResult.count || 0,
        assigned: assignedResult.count || 0,
        on_trip: onTripResult.count || 0,
        inactive: inactiveResult.count || 0,
        verified: verifiedResult.count || 0
      }
    } catch (error) {
      console.error('Error in getDriverStats:', error)
      throw error
    }
  }



  // Get drivers for a specific transport company (since created_by column doesn't exist)
  static async getDriversCreatedBy(createdByUserId: string, filters: DriverFilters = {}) {
    try {
      // Since created_by column doesn't exist, we'll get drivers by transport_company_id
      // First, check if the user is a transport company
      const { data: transportCompany } = await supabase
        .from('transport_companies')
        .select('user_id')
        .eq('user_id', createdByUserId)
        .single()

      if (!transportCompany) {
        return { drivers: [], count: 0 }
      }

      let query = supabase
        .from('drivers')
        .select(`
          *,
          user:users!drivers_user_id_fkey(
            id,
            full_name,
            email,
            role,
            created_at,
            phone,
            first_name,
            last_name
          ),
          transport_company:transport_companies!drivers_transport_company_id_fkey(
            user_id,
            company_name,
            registration_number,
            is_verified
          ),
          country:countries(id, name),
          state:states(id, name),
          city:cities(id, name),
          pincode:pincodes(id, code)
        `)
        .eq('transport_company_id', transportCompany.user_id)

      // Apply filters
      if (filters.search) {
        query = query.or(`license_number.ilike.%${filters.search}%,aadhar_number.ilike.%${filters.search}%`)
      }

      if (filters.status) {
        query = query.eq('status', filters.status)
      }

      if (filters.is_verified !== undefined) {
        query = query.eq('is_verified', filters.is_verified)
      }

      if (filters.limit) {
        query = query.limit(filters.limit)
      }

      if (filters.offset) {
        query = query.range(filters.offset, (filters.offset + (filters.limit || 10)) - 1)
      }

      query = query.order('created_at', { ascending: false })

      const { data, error } = await query

      if (error) {
        console.error('Error fetching drivers created by user:', error)
        throw new Error(error.message)
      }

      return data as Driver[]
    } catch (error) {
      console.error('Error in getDriversCreatedBy:', error)
      throw error
    }
  }
}
