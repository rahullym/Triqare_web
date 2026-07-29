import { supabase } from '@/lib/supabase'
import { type EmergencyContact as ExistingEmergencyContact } from '@/services/emergencyContactService'
import { SOSRequestService } from '@/services/sosRequestService'
import { type SOSStatus, SOS_TERMINAL_STATUSES } from '@/lib/sosStatus'

export interface SOSRequest {
  id: string
  patient_id: string
  requested_at: string
  assigned_at?: string
  completed_at?: string
  auto_assigned: boolean
  // Canonical vocabulary, not a copy of it. This union had drifted — it was missing
  // 'Timed Out' — which is exactly the failure mode that duplicating a status list
  // invites. src/lib/sosStatus.ts is the single source of truth and is what the DB
  // CHECK constraint mirrors.
  status: SOSStatus

  // Joined data
  patient?: {
    user_id: string
    full_name: string
    email: string
    phone?: string
    blood_group?: string
    allergies?: string
    emergency_contact_name?: string
    emergency_contact_phone?: string
    latitude?: number
    longitude?: number
    address_line?: string
    emergency_contacts?: EmergencyContact[]
  }

  assigned_driver?: {
    id: string
    full_name: string
    email: string
    phone?: string
  }
}

export type EmergencyContact = ExistingEmergencyContact

export interface Patient {
  user_id: string
  full_name: string
  email: string
  phone?: string
  // Patient-specific medical fields
  dob?: string
  gender?: 'Male' | 'Female' | 'Other'
  blood_group?: 'A+' | 'A-' | 'B+' | 'B-' | 'O+' | 'O-' | 'AB+' | 'AB-'
  allergies?: string
  abha_id?: string
  // Insurance information
  insurance_provider?: string
  insurance_policy_number?: string
  insurance_valid_till?: string
  // Hospital preferences
  primary_hospital_id?: string
  secondary_hospital_id?: string
  // Emergency contact
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relation?: string
  // Location information
  latitude?: number
  longitude?: number
  country_id?: string
  state_id?: string
  city_id?: string
  pincode_id?: string
  address_line?: string
  // Location reference data
  country?: { id: string; name: string }
  state?: { id: string; name: string }
  city?: { id: string; name: string }
  pincode?: { id: string; code: string }
  // Hospital reference data
  primary_hospital?: { id: string; name: string; phone?: string }
  secondary_hospital?: { id: string; name: string; phone?: string }
  // Related data
  emergency_contacts?: EmergencyContact[]
}

export interface Driver {
  id: string
  full_name: string
  email: string
  phone?: string
}

export class SOSService {
  // Get historical SOS requests (completed, cancelled, timed out)
  static async getHistoricalSOSRequests(filters?: {
    status?: (typeof SOS_TERMINAL_STATUSES)[number]
    dateRange?: 'today' | 'week' | 'month' | 'quarter' | 'all'
    search?: string
    limit?: number
    offset?: number
  }): Promise<{ data: SOSRequest[] | null; error: string | null; total?: number }> {
    try {
      console.log('🔍 Loading historical SOS requests...')

      // Build query for historical statuses
      let query = supabase
        .from('sos_requests')
        .select('*', { count: 'exact' })
        // Includes 'Timed Out'. Without it, every no-driver expiry would drop out of
        // the history view the moment the reaper started recording them as such.
        .in('status', [...SOS_TERMINAL_STATUSES])
        .order('completed_at', { ascending: false })

      // Apply status filter
      if (filters?.status) {
        query = query.eq('status', filters.status)
      }

      // Apply date range filter
      if (filters?.dateRange && filters.dateRange !== 'all') {
        const now = new Date()
        let startDate: Date

        switch (filters.dateRange) {
          case 'today':
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate())
            break
          case 'week':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            break
          case 'month':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1)
            break
          case 'quarter':
            const quarterStart = Math.floor(now.getMonth() / 3) * 3
            startDate = new Date(now.getFullYear(), quarterStart, 1)
            break
          default:
            startDate = new Date(0) // Beginning of time
        }

        query = query.gte('completed_at', startDate.toISOString())
      }

      // Apply pagination
      if (filters?.limit) {
        query = query.limit(filters.limit)
      }
      if (filters?.offset) {
        query = query.range(filters.offset, (filters.offset + (filters?.limit || 50)) - 1)
      }

      const { data: sosRequests, error: sosError, count } = await query

      if (sosError) {
        console.error('Error fetching historical SOS requests:', sosError)
        return { data: null, error: sosError.message }
      }

      if (!sosRequests || sosRequests.length === 0) {
        console.log('📋 No historical SOS requests found')
        return { data: [], error: null, total: 0 }
      }

      console.log(`🚨 Found ${sosRequests.length} historical SOS requests`)

      // Get unique patient IDs
      const patientIds = [...new Set(sosRequests.map(sos => sos.patient_id))]

      // Load patient records
      const { data: patientRecords, error: patientsError } = await supabase
        .from('patients')
        .select('*')
        .in('user_id', patientIds)

      if (patientsError) {
        console.log('⚠️  Error fetching patient records:', patientsError.message)
      }

      // Load user records for patients
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .in('id', patientIds)

      if (usersError) {
        console.log('⚠️  Error fetching user records:', usersError.message)
      }

      // Load emergency contacts
      const { data: emergencyContacts, error: contactsError } = await supabase
        .from('emergency_contacts')
        .select('*')
        .in('patient_id', patientIds)

      if (contactsError) {
        console.log('⚠️  Error fetching emergency contacts:', contactsError.message)
      }

      // Driver assignments are already in the sos_requests table via driver_id field
      // No need to query sos_request_assigned table separately
      const driverAssignments = sosRequests
        .filter(sos => sos.driver_id)
        .map(sos => ({
          sos_request_id: sos.id,
          driver_id: sos.driver_id,
          assigned_at: sos.assigned_at
        }))

      console.log(`📋 Found ${driverAssignments.length} SOS requests with driver assignments`)

      // Load driver user records
      const driverIds = driverAssignments?.map(da => da.driver_id).filter(Boolean) || []
      const { data: drivers, error: driverUsersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .in('id', driverIds)

      if (driverUsersError) {
        console.log('⚠️  Error fetching driver users:', driverUsersError.message)
      }

      // Create lookup maps
      const patientRecordMap = new Map()
      patientRecords?.forEach(record => {
        patientRecordMap.set(record.user_id, record)
      })

      const usersMap = new Map()
      users?.forEach(user => {
        usersMap.set(user.id, user)
      })

      const emergencyContactsMap = new Map()
      emergencyContacts?.forEach(contact => {
        if (!emergencyContactsMap.has(contact.patient_id)) {
          emergencyContactsMap.set(contact.patient_id, [])
        }
        emergencyContactsMap.get(contact.patient_id).push(contact)
      })

      const driverAssignmentMap = new Map()
      driverAssignments?.forEach(assignment => {
        driverAssignmentMap.set(assignment.sos_request_id, {
          driver_id: assignment.driver_id,
          assigned_at: assignment.assigned_at
        })
      })

      const driversMap = new Map()
      drivers?.forEach(driver => {
        driversMap.set(driver.id, driver)
      })

      // Transform the data
      const transformedData = sosRequests.map(request => {
        const patientRecord = patientRecordMap.get(request.patient_id) || {}
        const user = usersMap.get(request.patient_id)
        const userEmergencyContacts = emergencyContactsMap.get(request.patient_id) || []
        const driverAssignment = driverAssignmentMap.get(request.id)
        const assignedDriver = driverAssignment?.driver_id ? driversMap.get(driverAssignment.driver_id) : null

        return {
          ...request,
          patient: user ? {
            user_id: user.id,
            full_name: user.full_name || '',
            email: user.email || '',
            phone: user.phone || '',
            // Medical information
            dob: patientRecord.dob,
            gender: patientRecord.gender,
            blood_group: patientRecord.blood_group,
            allergies: patientRecord.allergies,
            abha_id: patientRecord.abha_id,
            // Insurance information
            insurance_provider: patientRecord.insurance_provider,
            insurance_policy_number: patientRecord.insurance_policy_number,
            insurance_valid_till: patientRecord.insurance_valid_till,
            // Hospital preferences
            primary_hospital_id: patientRecord.primary_hospital_id,
            secondary_hospital_id: patientRecord.secondary_hospital_id,
            // Emergency contact
            emergency_contact_name: patientRecord.emergency_contact_name,
            emergency_contact_phone: patientRecord.emergency_contact_phone,
            emergency_contact_relation: patientRecord.emergency_contact_relation,
            // Location information
            latitude: patientRecord.latitude,
            longitude: patientRecord.longitude,
            address_line: patientRecord.address_line,
            // Emergency contacts array
            emergency_contacts: userEmergencyContacts
          } : null,
          assigned_driver: assignedDriver ? {
            id: assignedDriver.id,
            full_name: assignedDriver.full_name || '',
            email: assignedDriver.email || '',
            phone: assignedDriver.phone || ''
          } : null,
          assigned_at: driverAssignment?.assigned_at
        }
      })

      // Apply search filter on transformed data if provided
      let filteredData = transformedData
      if (filters?.search) {
        const searchTerm = filters.search.toLowerCase()
        filteredData = transformedData.filter(request =>
          request.patient?.full_name?.toLowerCase().includes(searchTerm) ||
          request.id.toLowerCase().includes(searchTerm) ||
          request.assigned_driver?.full_name?.toLowerCase().includes(searchTerm)
        )
      }

      console.log(`✅ Successfully loaded ${filteredData.length} historical SOS requests`)
      return { data: filteredData, error: null, total: count || 0 }
    } catch (error) {
      console.error('❌ Error in getHistoricalSOSRequests:', error)
      return { data: null, error: error instanceof Error ? error.message : 'Unknown error occurred' }
    }
  }

  // Get all SOS requests with patient and driver details
  static async getSOSRequests(): Promise<{ data: SOSRequest[] | null; error: string | null }> {
    try {
      console.log('🔍 Loading SOS requests...')

      // Reap-on-view: enforce the no-driver timeout before reading so requests that
      // have outlived `sos_request_timeout_minutes` stop showing as active here (and,
      // via the resulting realtime UPDATE, on every other open dashboard). Non-fatal —
      // the list must still load even if the sweep fails. (Throttled inside the service.)
      await SOSRequestService.expireStaleRequests().catch((e) =>
        console.warn('SOS timeout sweep failed (non-fatal):', e)
      )

      // First, load all SOS requests
      const { data: sosRequests, error: sosError } = await supabase
        .from('sos_requests')
        .select('*')
        .order('requested_at', { ascending: false })

      if (sosError) {
        console.error('Error fetching SOS requests:', sosError)
        return { data: null, error: sosError.message }
      }

      if (!sosRequests || sosRequests.length === 0) {
        console.log('📋 No SOS requests found')
        return { data: [], error: null }
      }

      console.log(`🚨 Found ${sosRequests.length} SOS requests`)

      // Get unique patient IDs
      const patientIds = [...new Set(sosRequests.map(sos => sos.patient_id))]

      // Load patient records with location data
      const { data: patientRecords, error: patientsError } = await supabase
        .from('patients')
        .select(`
          *,
          countries:country_id(id, name),
          states:state_id(id, name),
          cities:city_id(id, name),
          pincodes:pincode_id(id, code),
          hospitals:primary_hospital_id(id, name, phone),
          secondary_hospitals:secondary_hospital_id(id, name, phone)
        `)
        .in('user_id', patientIds)

      if (patientsError) {
        console.log('⚠️  Error fetching patient records:', patientsError.message)
      } else {
        console.log(`🏥 Found ${patientRecords?.length || 0} patient records with location data`)
      }

      // Load user records for patients
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .in('id', patientIds)

      if (usersError) {
        console.log('⚠️  Error fetching user records:', usersError.message)
      }

      // Load emergency contacts
      const { data: emergencyContacts, error: contactsError } = await supabase
        .from('emergency_contacts')
        .select('*')
        .in('patient_id', patientIds)

      if (contactsError) {
        console.log('⚠️  Error fetching emergency contacts:', contactsError.message)
      }

      // Driver assignments are already in the sos_requests table via driver_id field
      const driverAssignments = sosRequests
        .filter(sos => sos.driver_id)
        .map(sos => ({
          sos_request_id: sos.id,
          driver_id: sos.driver_id
        }))

      console.log(`📋 Found ${driverAssignments.length} SOS requests with driver assignments`)

      // Load driver user records
      const driverIds = driverAssignments?.map(da => da.driver_id).filter(Boolean) || []
      const { data: drivers, error: driverUsersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .in('id', driverIds)

      if (driverUsersError) {
        console.log('⚠️  Error fetching driver users:', driverUsersError.message)
      }

      // Create lookup maps
      const patientRecordMap = new Map()
      patientRecords?.forEach(record => {
        patientRecordMap.set(record.user_id, record)
      })

      const usersMap = new Map()
      users?.forEach(user => {
        usersMap.set(user.id, user)
      })

      const emergencyContactsMap = new Map()
      emergencyContacts?.forEach(contact => {
        if (!emergencyContactsMap.has(contact.patient_id)) {
          emergencyContactsMap.set(contact.patient_id, [])
        }
        emergencyContactsMap.get(contact.patient_id).push(contact)
      })

      const driverAssignmentMap = new Map()
      driverAssignments?.forEach(assignment => {
        driverAssignmentMap.set(assignment.sos_request_id, assignment.driver_id)
      })

      const driversMap = new Map()
      drivers?.forEach(driver => {
        driversMap.set(driver.id, driver)
      })

      // Transform the data
      const transformedData = sosRequests.map(request => {
        const patientRecord = patientRecordMap.get(request.patient_id) || {}
        const user = usersMap.get(request.patient_id)
        const userEmergencyContacts = emergencyContactsMap.get(request.patient_id) || []
        const driverId = driverAssignmentMap.get(request.id)
        const assignedDriver = driverId ? driversMap.get(driverId) : null

        return {
          ...request,
          patient: user ? {
            user_id: user.id,
            full_name: user.full_name || '',
            email: user.email || '',
            phone: user.phone || '',
            // Medical information
            dob: patientRecord.dob,
            gender: patientRecord.gender,
            blood_group: patientRecord.blood_group,
            allergies: patientRecord.allergies,
            abha_id: patientRecord.abha_id,
            // Insurance information
            insurance_provider: patientRecord.insurance_provider,
            insurance_policy_number: patientRecord.insurance_policy_number,
            insurance_valid_till: patientRecord.insurance_valid_till,
            // Hospital preferences
            primary_hospital_id: patientRecord.primary_hospital_id,
            secondary_hospital_id: patientRecord.secondary_hospital_id,
            // Emergency contact
            emergency_contact_name: patientRecord.emergency_contact_name,
            emergency_contact_phone: patientRecord.emergency_contact_phone,
            emergency_contact_relation: patientRecord.emergency_contact_relation,
            // Location information
            latitude: patientRecord.latitude,
            longitude: patientRecord.longitude,
            country_id: patientRecord.country_id,
            state_id: patientRecord.state_id,
            city_id: patientRecord.city_id,
            pincode_id: patientRecord.pincode_id,
            address_line: patientRecord.address_line,
            // Location reference data
            country: patientRecord.countries,
            state: patientRecord.states,
            city: patientRecord.cities,
            pincode: patientRecord.pincodes,
            // Hospital reference data
            primary_hospital: patientRecord.hospitals,
            secondary_hospital: patientRecord.secondary_hospitals,
            // Emergency contacts
            emergency_contacts: userEmergencyContacts
          } : undefined,
          assigned_driver: assignedDriver ? {
            id: assignedDriver.id,
            full_name: assignedDriver.full_name,
            email: assignedDriver.email,
            phone: assignedDriver.phone
          } : undefined
        }
      })

      console.log(`✅ Successfully loaded ${transformedData.length} SOS requests with patient data`)
      return { data: transformedData, error: null }
    } catch (err) {
      console.error('💥 Unexpected error fetching SOS requests:', err)
      return { data: null, error: 'Failed to fetch SOS requests' }
    }
  }

  // Get all patients for SOS creation
  static async getPatients(): Promise<{ data: Patient[] | null; error: string | null }> {
    try {
      console.log('🔍 Loading patients for SOS creation...')

      // First, load all users with role 'patient'
      const { data: users, error: usersError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'patient')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (usersError) {
        console.error('Error fetching patient users:', usersError)
        return { data: null, error: usersError.message }
      }

      if (!users || users.length === 0) {
        console.log('⚠️  No patient users found')
        return { data: [], error: null }
      }

      console.log(`📋 Found ${users.length} patient users`)

      // Get patient records for these users (if they exist) with location data
      const userIds = users.map(u => u.id)
      const { data: patientRecords, error: patientsError } = await supabase
        .from('patients')
        .select(`
          *,
          countries:country_id(id, name),
          states:state_id(id, name),
          cities:city_id(id, name),
          pincodes:pincode_id(id, code),
          hospitals:primary_hospital_id(id, name, phone),
          secondary_hospitals:secondary_hospital_id(id, name, phone)
        `)
        .in('user_id', userIds)

      if (patientsError) {
        console.log('⚠️  Error fetching patient records (continuing with user data only):', patientsError.message)
      }

      console.log(`🏥 Found ${patientRecords?.length || 0} patient records with reference data`)

      // Get emergency contacts for these users
      const { data: emergencyContacts, error: contactsError } = await supabase
        .from('emergency_contacts')
        .select('*')
        .in('patient_id', userIds)

      if (contactsError) {
        console.log('⚠️  Error fetching emergency contacts (continuing without):', contactsError.message)
      }

      console.log(`📞 Found ${emergencyContacts?.length || 0} emergency contacts`)

      // Create lookup maps for efficient data merging
      const patientRecordMap = new Map()
      patientRecords?.forEach(record => {
        patientRecordMap.set(record.user_id, record)
      })

      const emergencyContactsMap = new Map()
      emergencyContacts?.forEach(contact => {
        if (!emergencyContactsMap.has(contact.patient_id)) {
          emergencyContactsMap.set(contact.patient_id, [])
        }
        emergencyContactsMap.get(contact.patient_id).push(contact)
      })

      // Transform users with patient data to Patient interface
      const transformedData = users.map(user => {
        const patientRecord = patientRecordMap.get(user.id) || {}
        const userEmergencyContacts = emergencyContactsMap.get(user.id) || []

        return {
          user_id: user.id,
          full_name: user.full_name || '',
          email: user.email || '',
          phone: user.phone || '',
          // Medical information
          dob: patientRecord.dob,
          gender: patientRecord.gender,
          blood_group: patientRecord.blood_group,
          allergies: patientRecord.allergies,
          abha_id: patientRecord.abha_id,
          // Insurance information
          insurance_provider: patientRecord.insurance_provider,
          insurance_policy_number: patientRecord.insurance_policy_number,
          insurance_valid_till: patientRecord.insurance_valid_till,
          // Hospital preferences
          primary_hospital_id: patientRecord.primary_hospital_id,
          secondary_hospital_id: patientRecord.secondary_hospital_id,
          // Emergency contact
          emergency_contact_name: patientRecord.emergency_contact_name,
          emergency_contact_phone: patientRecord.emergency_contact_phone,
          emergency_contact_relation: patientRecord.emergency_contact_relation,
          // Location information
          latitude: patientRecord.latitude,
          longitude: patientRecord.longitude,
          country_id: patientRecord.country_id,
          state_id: patientRecord.state_id,
          city_id: patientRecord.city_id,
          pincode_id: patientRecord.pincode_id,
          address_line: patientRecord.address_line,
          // Location reference data
          country: patientRecord.countries,
          state: patientRecord.states,
          city: patientRecord.cities,
          pincode: patientRecord.pincodes,
          // Hospital reference data
          primary_hospital: patientRecord.hospitals,
          secondary_hospital: patientRecord.secondary_hospitals,
          // Emergency contacts
          emergency_contacts: userEmergencyContacts
        }
      })

      console.log(`✅ Successfully loaded ${transformedData.length} patients for SOS creation`)
      return { data: transformedData, error: null }
    } catch (err) {
      console.error('💥 Unexpected error fetching patients:', err)
      return { data: null, error: 'Failed to fetch patients' }
    }
  }

  // Get all drivers for assignment
  static async getDrivers(): Promise<{ data: Driver[] | null; error: string | null }> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'driver')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (error) {
        console.error('Error fetching drivers:', error)
        return { data: null, error: error.message }
      }

      return { data: data || [], error: null }
    } catch (err) {
      console.error('Unexpected error fetching drivers:', err)
      return { data: null, error: 'Failed to fetch drivers' }
    }
  }

  // Get available drivers (not assigned to active SOS cases)
  static async getAvailableDrivers(): Promise<{ data: Driver[] | null; error: string | null }> {
    try {
      console.log('🔍 Loading available drivers...')

      // First, get all active drivers
      const { data: allDrivers, error: driversError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('role', 'driver')
        .eq('is_active', true)
        .order('full_name', { ascending: true })

      if (driversError) {
        console.error('Error fetching drivers:', driversError)
        return { data: null, error: driversError.message }
      }

      if (!allDrivers || allDrivers.length === 0) {
        console.log('⚠️  No drivers found')
        return { data: [], error: null }
      }

      console.log(`📋 Found ${allDrivers.length} total drivers`)

      // Get drivers who are currently assigned to active SOS cases
      // Use the sos_requests table directly since it has driver_id field
      const { data: busyDrivers, error: busyError } = await supabase
        .from('sos_requests')
        .select('driver_id')
        .not('driver_id', 'is', null)
        .in('status', [
          'SOS Triggered',
          'Driver En Route',
          'Transport Arrived',
          'User Picked Up'
        ])

      if (busyError) {
        console.error('Error fetching busy drivers:', busyError)
        return { data: null, error: 'Failed to check driver availability' }
      }

      // Create set of busy driver IDs
      const busyDriverIds = new Set(busyDrivers?.map(bd => bd.driver_id).filter(id => id) || [])
      console.log(`🚗 Found ${busyDriverIds.size} drivers with active assignments`)

      // Filter out busy drivers
      const availableDrivers = allDrivers.filter(driver => !busyDriverIds.has(driver.id))

      console.log(`✅ ${availableDrivers.length} drivers available for assignment`)
      if (availableDrivers.length > 0) {
        console.log('Available drivers:')
        availableDrivers.slice(0, 5).forEach((driver, index) => {
          console.log(`   ${index + 1}. ${driver.full_name} (${driver.email})`)
        })
        if (availableDrivers.length > 5) {
          console.log(`   ... and ${availableDrivers.length - 5} more`)
        }
      }

      return { data: availableDrivers, error: null }
    } catch (err) {
      console.error('💥 Unexpected error fetching available drivers:', err)
      return { data: null, error: 'Failed to fetch available drivers' }
    }
  }

  // Create new SOS request
  static async createSOSRequest(patientId: string): Promise<{ data: SOSRequest | null; error: string | null }> {
    try {
      console.log('🚨 Creating SOS request for patient ID:', patientId)

      // First, ensure the user exists and is a patient
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, full_name, email, role, is_active')
        .eq('id', patientId)
        .eq('role', 'patient')
        .eq('is_active', true)
        .single()

      if (userError || !user) {
        console.error('❌ User not found or not a patient:', userError)
        return { data: null, error: 'Patient not found or invalid' }
      }

      console.log('✅ Found patient user:', user)

      // Check if patient record exists (might be required for foreign key constraint)
      const { data: patientRecord, error: patientCheckError } = await supabase
        .from('patients')
        .select('user_id')
        .eq('user_id', patientId)
        .single()

      if (patientCheckError && patientCheckError.code !== 'PGRST116') {
        console.log('⚠️  Error checking patient record:', patientCheckError)
      }

      if (!patientRecord) {
        console.log('⚠️  No patient record found, creating basic patient record...')
        const { error: createPatientError } = await supabase
          .from('patients')
          .insert([{
            user_id: patientId
          }])

        if (createPatientError) {
          console.log('⚠️  Could not create patient record:', createPatientError)
          // Continue anyway, might not be required
        } else {
          console.log('✅ Created basic patient record')
        }
      }

      // Create the SOS request
      console.log('📝 Creating SOS request...')
      const { data, error } = await supabase
        .from('sos_requests')
        .insert([{
          patient_id: patientId,
          status: 'SOS Triggered',
          auto_assigned: true,
          requested_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating SOS request:', error)
        console.error('Error details:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })

        // Check if it's a foreign key constraint error
        if (error.code === '23503') {
          if (error.message.includes('auth.users') || error.message.includes('patient_id')) {
            console.error('🔧 SCHEMA FIX REQUIRED!')
            console.error('Run this API endpoint to fix: POST /api/debug/fix-user-references')
            console.error('Or run the SQL script: fix-user-references.sql')
            return {
              data: null,
              error: 'Cannot create SOS request: The patient_id references auth.users table but we are using public.users. Database schema mismatch detected. patient_id should reference public.users please do needful changes everywhere'
            }
          }
          if (error.message.includes('violates foreign key constraint')) {
            return {
              data: null,
              error: `Foreign key constraint error: ${error.message}. Please ensure the patient exists in public.users table.`
            }
          }
          return {
            data: null,
            error: `Foreign key constraint error: ${error.message}`
          }
        }

        // Check if it's an RLS error
        if (error.code === '42501' || error.message.includes('row-level security')) {
          console.error('🔒 RLS Policy Issue Detected!')
          console.error('To fix this issue, run the following SQL command in Supabase SQL Editor:')
          console.error('ALTER TABLE public.sos_requests DISABLE ROW LEVEL SECURITY;')
          console.error('OR create a proper RLS policy:')
          console.error('CREATE POLICY "allow_ert_all" ON public.sos_requests FOR ALL USING (true) WITH CHECK (true);')

          return {
            data: null,
            error: 'Row Level Security Error: Cannot create SOS request. The sos_requests table has RLS enabled but no policies allow insertion. Please run: ALTER TABLE public.sos_requests DISABLE ROW LEVEL SECURITY; in Supabase SQL Editor.'
          }
        }

        // Check for other common errors
        if (error.code === '42P01') {
          return {
            data: null,
            error: 'Table does not exist: sos_requests table not found in database.'
          }
        }

        return { data: null, error: error.message || 'Unknown database error' }
      }

      console.log('✅ SOS request created successfully:', data)
      return { data: data as SOSRequest, error: null }
    } catch (err) {
      console.error('💥 Unexpected error creating SOS request:', err)
      return { data: null, error: 'Failed to create SOS request' }
    }
  }

  // Assign driver to SOS request
  static async assignDriver(sosRequestId: string, driverId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      console.log(`🚗 Attempting to assign driver ${driverId.slice(0, 8)}... to SOS ${sosRequestId.slice(0, 8)}...`)

      // First, validate that the driver exists in the users table
      console.log('🔍 Validating driver exists in users table...')
      const { data: driverUser, error: driverUserError } = await supabase
        .from('users')
        .select('id, full_name, email, role, is_active')
        .eq('id', driverId)
        .eq('role', 'driver')
        .eq('is_active', true)
        .single()

      if (driverUserError || !driverUser) {
        console.error('❌ Driver not found in users table:', driverUserError)
        return {
          success: false,
          error: `Driver not found or invalid. Driver ID ${driverId.slice(0, 8)}... does not exist in users table or is not an active driver.`
        }
      }

      console.log('✅ Driver validated:', driverUser.full_name, driverUser.email)

      // Check if the driver is already assigned to an active SOS case
      console.log('🔍 Checking if driver has active assignments...')
      const { data: activeAssignments, error: checkError } = await supabase
        .from('sos_requests')
        .select('id, status, requested_at')
        .eq('driver_id', driverId)
        .in('status', [
          'Driver Assigned',
          'Driver En Route',
          'Patient Picked Up',
          'At Hospital',
          'SOS Triggered',
          'driver_assigned',
          'in_progress'
        ])

      if (checkError) {
        console.error('Error checking driver assignments:', checkError)
        return { success: false, error: 'Failed to check driver availability' }
      }

      if (activeAssignments && activeAssignments.length > 0) {
        const activeCases = activeAssignments.map(a => ({
          id: a.id,
          status: a.status,
          requested_at: a.requested_at
        }))

        console.log(`❌ Driver is already assigned to ${activeCases.length} active case(s):`)
        activeCases.forEach((case_, index) => {
          console.log(`   ${index + 1}. ${case_.id.slice(0, 8)}... - ${case_.status} - ${new Date(case_.requested_at).toLocaleString()}`)
        })

        return {
          success: false,
          error: `Driver is already assigned to an active SOS case (${activeCases[0].status}). Driver must complete or cancel current case before taking a new assignment.`
        }
      }

      console.log('✅ Driver is available for assignment')

      // Check if the SOS request is in a valid state for assignment
      const { data: sosRequest, error: sosError } = await supabase
        .from('sos_requests')
        .select('id, status, patient_id')
        .eq('id', sosRequestId)
        .single()

      if (sosError) {
        console.error('Error fetching SOS request:', sosError)
        return { success: false, error: 'SOS request not found' }
      }

      if (sosRequest.status !== 'SOS Triggered') {
        console.log(`⚠️  SOS request status is '${sosRequest.status}', not 'SOS Triggered'`)
        return {
          success: false,
          error: `Cannot assign driver to SOS request with status '${sosRequest.status}'. Only 'SOS Triggered' cases can be assigned.`
        }
      }

      // Check if SOS request already has a driver assigned
      const { data: existingAssignment, error: existingError } = await supabase
        .from('sos_requests')
        .select('driver_id')
        .eq('id', sosRequestId)
        .single()

      if (existingAssignment?.driver_id && !existingError) {
        console.log(`⚠️  SOS request already has driver assigned: ${existingAssignment.driver_id.slice(0, 8)}...`)
        return {
          success: false,
          error: 'SOS request already has a driver assigned'
        }
      }

      // Proceed with assignment - update the sos_requests table directly
      console.log('📝 Assigning driver to SOS request...')
      console.log('Assignment details:', {
        sosRequestId: sosRequestId.slice(0, 8) + '...',
        driverId: driverId.slice(0, 8) + '...',
        driverName: driverUser.full_name,
        timestamp: new Date().toISOString()
      })

      const { error: assignError } = await supabase
        .from('sos_requests')
        .update({
          driver_id: driverId,
          assigned_at: new Date().toISOString(),
          status: 'Driver En Route'
        })
        .eq('id', sosRequestId)

      if (assignError) {
        console.error('❌ Error assigning driver:', assignError)
        console.error('Error details:', {
          code: assignError.code,
          message: assignError.message,
          details: assignError.details,
          hint: assignError.hint
        })

        if (assignError.code === '23503') {
          return {
            success: false,
            error: `Foreign key constraint violation: Driver ID ${driverId.slice(0, 8)}... does not exist in the users table. This indicates a database schema issue.`
          }
        }

        return { success: false, error: assignError.message }
      }

      // Update the SOS request status and assigned_at timestamp
      console.log('📊 Updating SOS request status...')
      const { error: updateError } = await supabase
        .from('sos_requests')
        .update({
          status: 'Driver En Route',
          assigned_at: new Date().toISOString()
        })
        .eq('id', sosRequestId)

      if (updateError) {
        console.error('Error updating SOS request status:', updateError)
        return { success: false, error: updateError.message }
      }

      console.log('✅ Driver assignment completed successfully')
      return { success: true, error: null }
    } catch (err) {
      console.error('💥 Unexpected error assigning driver:', err)
      return { success: false, error: 'Failed to assign driver' }
    }
  }

  // Update SOS request status
  static async updateStatus(sosRequestId: string, status: SOSRequest['status']): Promise<{ success: boolean; error: string | null }> {
    try {
      const updateData: any = { status }

      // Set completed_at timestamp when status is Arrived at Hospital
      if (status === 'Arrived at Hospital') {
        updateData.completed_at = new Date().toISOString()
      }

      const { error } = await supabase
        .from('sos_requests')
        .update(updateData)
        .eq('id', sosRequestId)

      if (error) {
        console.error('Error updating SOS request status:', error)
        return { success: false, error: error.message }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Unexpected error updating SOS request status:', err)
      return { success: false, error: 'Failed to update status' }
    }
  }

  // Delete SOS request
  static async deleteSOSRequest(sosRequestId: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error } = await supabase
        .from('sos_requests')
        .delete()
        .eq('id', sosRequestId)

      if (error) {
        console.error('Error deleting SOS request:', error)
        return { success: false, error: error.message }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Unexpected error deleting SOS request:', err)
      return { success: false, error: 'Failed to delete SOS request' }
    }
  }

  // Get SOS request by ID with full details
  static async getSOSRequestById(sosRequestId: string): Promise<{ data: SOSRequest | null; error: string | null }> {
    try {
      console.log(`🔍 Loading SOS request details for ID: ${sosRequestId}`)

      // First, load the SOS request
      const { data: sosRequest, error: sosError } = await supabase
        .from('sos_requests')
        .select('*')
        .eq('id', sosRequestId)
        .single()

      if (sosError) {
        console.error('Error fetching SOS request:', sosError)
        return { data: null, error: sosError.message }
      }

      if (!sosRequest) {
        console.log('⚠️  SOS request not found')
        return { data: null, error: 'SOS request not found' }
      }

      console.log(`🚨 Found SOS request for patient: ${sosRequest.patient_id}`)

      // Load patient record (if exists)
      const { data: patientRecord, error: patientError } = await supabase
        .from('patients')
        .select('*')
        .eq('user_id', sosRequest.patient_id)
        .single()

      if (patientError && patientError.code !== 'PGRST116') {
        console.log('⚠️  Error fetching patient record:', patientError.message)
      }

      // Load user record for patient
      const { data: user, error: userError } = await supabase
        .from('users')
        .select('id, full_name, email, phone')
        .eq('id', sosRequest.patient_id)
        .single()

      if (userError) {
        console.log('⚠️  Error fetching user record:', userError.message)
      }

      // Load emergency contacts
      const { data: emergencyContacts, error: contactsError } = await supabase
        .from('emergency_contacts')
        .select('*')
        .eq('patient_id', sosRequest.patient_id)

      if (contactsError) {
        console.log('⚠️  Error fetching emergency contacts:', contactsError.message)
      }

      // Driver assignment is already in the sosRequest.driver_id field
      // No need to query sos_request_assigned table separately

      // Load driver user record if assigned
      let assignedDriver = null
      if (sosRequest?.driver_id) {
        const { data: driver, error: driverError } = await supabase
          .from('users')
          .select('id, full_name, email, phone')
          .eq('id', sosRequest.driver_id)
          .single()

        if (driverError) {
          console.log('⚠️  Error fetching driver user:', driverError.message)
        } else {
          assignedDriver = driver
        }
      }

      // Transform the data
      const transformedData = {
        ...sosRequest,
        patient: user ? {
          user_id: user.id,
          full_name: user.full_name || '',
          email: user.email || '',
          phone: user.phone || '',
          // Medical information from patient record
          dob: patientRecord?.dob,
          gender: patientRecord?.gender,
          blood_group: patientRecord?.blood_group,
          allergies: patientRecord?.allergies,
          abha_id: patientRecord?.abha_id,
          // Insurance information
          insurance_provider: patientRecord?.insurance_provider,
          insurance_policy_number: patientRecord?.insurance_policy_number,
          insurance_valid_till: patientRecord?.insurance_valid_till,
          // Hospital preferences
          primary_hospital_id: patientRecord?.primary_hospital_id,
          secondary_hospital_id: patientRecord?.secondary_hospital_id,
          // Emergency contact
          emergency_contact_name: patientRecord?.emergency_contact_name,
          emergency_contact_phone: patientRecord?.emergency_contact_phone,
          emergency_contact_relation: patientRecord?.emergency_contact_relation,
          // Location information
          latitude: patientRecord?.latitude,
          longitude: patientRecord?.longitude,
          country_id: patientRecord?.country_id,
          state_id: patientRecord?.state_id,
          city_id: patientRecord?.city_id,
          pincode_id: patientRecord?.pincode_id,
          address_line: patientRecord?.address_line,
          // Emergency contacts
          emergency_contacts: emergencyContacts || []
        } : undefined,
        assigned_driver: assignedDriver ? {
          id: assignedDriver.id,
          full_name: assignedDriver.full_name,
          email: assignedDriver.email,
          phone: assignedDriver.phone
        } : undefined
      }

      console.log(`✅ Successfully loaded SOS request with patient data`)
      return { data: transformedData as SOSRequest, error: null }
    } catch (err) {
      console.error('💥 Unexpected error fetching SOS request:', err)
      return { data: null, error: 'Failed to fetch SOS request' }
    }
  }

  // Get all drivers with their status (online, offline, busy)
  static async getAllDriversWithStatus(): Promise<{ data: any[] | null; error: string | null }> {
    try {
      console.log('🔍 Fetching all drivers with status...')

      // Get all users with driver role first, then left join with drivers table
      const { data: allDrivers, error: driversError } = await supabase
        .from('users')
        .select(`
          id,
          full_name,
          email,
          phone,
          first_name,
          last_name,
          employee_id,
          created_at,
          is_active,
          last_sign_in_at,
          drivers (
            user_id,
            transport_company_id,
            license_number,
            aadhar_number,
            is_verified,
            status,
            current_request_id,
            latitude,
            longitude,
            last_updated_at,
            country_id,
            state_id,
            city_id,
            pincode_id,
            address_line,
            transport_companies (
              user_id,
              company_name,
              registration_number,
              is_verified
            ),
            countries (
              id,
              name
            ),
            states (
              id,
              name
            ),
            cities (
              id,
              name
            )
          )
        `)
        .eq('role', 'driver')
        .eq('is_active', true)

      if (driversError) {
        console.error('Error fetching drivers:', driversError)
        console.error('Error details:', {
          message: driversError.message,
          details: driversError.details,
          hint: driversError.hint,
          code: driversError.code
        })
        return { data: null, error: `Failed to fetch drivers: ${driversError.message}` }
      }

      console.log(`📋 Found ${allDrivers?.length || 0} total drivers`)

      // Get drivers who are currently assigned to active SOS cases
      const { data: busyDrivers, error: busyError } = await supabase
        .from('sos_requests')
        .select('driver_id, assigned_at, id, status, requested_at')
        .not('driver_id', 'is', null)
        .in('status', [
          'SOS Triggered',
          'Driver En Route',
          'Transport Arrived',
          'User Picked Up'
        ])

      if (busyError) {
        console.error('Error fetching busy drivers:', busyError)
        return { data: null, error: 'Failed to check driver availability' }
      }

      console.log(`🚗 Found ${busyDrivers?.length || 0} busy drivers`)

      // Create a map of busy drivers with their current assignment
      const busyDriverMap = new Map()
      busyDrivers?.forEach(sosRequest => {
        busyDriverMap.set(sosRequest.driver_id, {
          current_assignment: {
            id: sosRequest.id,
            status: sosRequest.status,
            requested_at: sosRequest.requested_at
          },
          assigned_at: sosRequest.assigned_at
        })
      })

      // Transform drivers with status
      const driversWithStatus = allDrivers?.map(user => {
        // Get driver data (may be null if user doesn't have driver record)
        const driverData = user.drivers?.[0] || null

        const isAssigned = busyDriverMap.has(user.id)
        const assignment = busyDriverMap.get(user.id)

        // Determine status based on various factors
        let status = 'offline'

        // Check if driver has current_request_id or is in busy status
        if (driverData?.current_request_id || driverData?.status === 'assigned' || driverData?.status === 'on_trip') {
          status = 'busy'
        } else if (isAssigned) {
          status = 'busy'
        } else if (user.is_active && (driverData?.status === 'available' || !driverData)) {
          // Consider online if user is active and driver status is available (or no driver record)
          const lastSignIn = user.last_sign_in_at ? new Date(user.last_sign_in_at) : null
          const now = new Date()
          const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)

          if (lastSignIn && lastSignIn > twentyFourHoursAgo) {
            status = 'online'
          }
        }

        return {
          // Driver table fields (with defaults if no driver record)
          id: user.id,
          user_id: user.id,
          transport_company_id: driverData?.transport_company_id || null,
          license_number: driverData?.license_number || 'Not provided',
          aadhar_number: driverData?.aadhar_number || null,
          is_verified: driverData?.is_verified || false,
          driver_status: driverData?.status || 'inactive',
          current_request_id: driverData?.current_request_id || null,
          latitude: driverData?.latitude || null,
          longitude: driverData?.longitude || null,
          last_updated_at: driverData?.last_updated_at || user.created_at,
          address_line: driverData?.address_line || null,
          country_id: driverData?.country_id || null,
          state_id: driverData?.state_id || null,
          city_id: driverData?.city_id || null,
          pincode_id: driverData?.pincode_id || null,

          // User table fields
          full_name: user.full_name || '',
          email: user.email || '',
          phone: user.phone || '',
          first_name: user.first_name || '',
          last_name: user.last_name || '',
          employee_id: user.employee_id || '',
          created_at: user.created_at || '',
          is_active: user.is_active || false,
          last_sign_in_at: user.last_sign_in_at || '',

          // Transport company info
          transport_company: driverData?.transport_companies || null,

          // Location info
          country: driverData?.countries || null,
          state: driverData?.states || null,
          city: driverData?.cities || null,

          // Calculated status
          status,
          current_assignment: assignment?.current_assignment || null,
          assigned_at: assignment?.assigned_at || null
        }
      }) || []

      console.log(`✅ Processed ${driversWithStatus.length} drivers with status`)

      return { data: driversWithStatus, error: null }
    } catch (error) {
      console.error('Error in getAllDriversWithStatus:', error)
      return { data: null, error: 'Failed to fetch drivers with status' }
    }
  }

}
