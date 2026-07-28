import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { requireRole, STAFF_ROLES } from '@/lib/auth/requireRole'

export interface UserLocation {
  id: string
  full_name: string
  email: string
  role: 'patient' | 'driver'
  phone?: string
  avatar_url?: string
  is_active: boolean
  latitude: number
  longitude: number
  last_updated_at?: string
  // Driver specific
  status?: string
  license_number?: string
  company_name?: string
}

export async function GET() {
  // Staff-only: map data (patient/driver locations + PII) must not be exposed to
  // unauthenticated/wrong-role callers
  const gate = await requireRole(STAFF_ROLES)
  if (gate.error) return gate.error
  try {
    const locations: UserLocation[] = []

    // 1. Get all drivers with location from drivers table
    const { data: drivers, error: driversError } = await supabase
      .from('drivers')
      .select(`
        user_id,
        latitude,
        longitude,
        status,
        license_number,
        last_updated_at,
        user:users!drivers_user_id_fkey(
          id,
          full_name,
          email,
          role,
          phone,
          avatar_url,
          is_active
        ),
        transport_company:transport_companies!drivers_transport_company_id_fkey(
          company_name
        )
      `)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)

    if (driversError) {
      console.error('Error fetching driver locations:', driversError)
    } else if (drivers) {
      for (const driver of drivers) {
        // Handle user data - may be object or array depending on relationship
        const userData = Array.isArray(driver.user) ? driver.user[0] : driver.user
        const companyData = Array.isArray(driver.transport_company) ? driver.transport_company[0] : driver.transport_company

        if (userData && driver.latitude && driver.longitude) {
          const user = userData as { id: string; full_name: string; email: string; role: string; phone?: string; avatar_url?: string; is_active: boolean }
          locations.push({
            id: user.id,
            full_name: user.full_name || 'Unknown Driver',
            email: user.email,
            role: 'driver',
            phone: user.phone,
            avatar_url: user.avatar_url,
            is_active: user.is_active,
            latitude: parseFloat(String(driver.latitude)),
            longitude: parseFloat(String(driver.longitude)),
            last_updated_at: driver.last_updated_at,
            status: driver.status,
            license_number: driver.license_number,
            company_name: (companyData as { company_name?: string } | null)?.company_name
          })
        }
      }
    }

    // 2. Get patients with location from patients table
    // patients table uses user_id as primary key
    // Get all patients and filter for valid lat/lng in code (handles null, 0, empty string)
    const { data: patients, error: patientsError } = await supabase
      .from('patients')
      .select(`
        user_id,
        latitude,
        longitude,
        user:users!patients_user_id_fkey(
          id,
          full_name,
          email,
          phone,
          avatar_url,
          is_active
        )
      `)

    if (patientsError) {
      console.error('Error fetching patient locations:', patientsError)
    } else if (patients) {
      console.log('All patients fetched:', patients.length)
      for (const patient of patients) {
        const userData = Array.isArray(patient.user) ? patient.user[0] : patient.user

        // Check for valid lat/lng (not null, not 0, not empty string)
        const lat = patient.latitude ? parseFloat(String(patient.latitude)) : 0
        const lng = patient.longitude ? parseFloat(String(patient.longitude)) : 0

        console.log(`Patient ${patient.user_id}: lat=${patient.latitude}, lng=${patient.longitude}, parsed: ${lat}, ${lng}`)

        if (lat !== 0 && lng !== 0 && !isNaN(lat) && !isNaN(lng)) {
          const user = userData as { id: string; full_name: string; email: string; phone?: string; avatar_url?: string; is_active: boolean } | null
          locations.push({
            id: patient.user_id,
            full_name: user?.full_name || 'Unknown Patient',
            email: user?.email || '',
            role: 'patient',
            phone: user?.phone,
            avatar_url: user?.avatar_url,
            is_active: user?.is_active ?? true,
            latitude: lat,
            longitude: lng
          })
        }
      }
      console.log('Patients with valid location added:', locations.filter(l => l.role === 'patient').length)
    }

    // 3. Get hospitals with location
    const { data: hospitals, error: hospitalsError } = await supabase
      .from('hospitals')
      .select('id, name, latitude, longitude, status, phone, email')
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .eq('status', 'active')

    if (hospitalsError) {
      console.error('Error fetching hospital locations:', hospitalsError)
    }

    return NextResponse.json({
      success: true,
      data: {
        users: locations,
        hospitals: hospitals || []
      },
      count: {
        drivers: locations.filter(l => l.role === 'driver').length,
        patients: locations.filter(l => l.role === 'patient').length,
        hospitals: hospitals?.length || 0
      }
    })
  } catch (error) {
    console.error('Error fetching user locations:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch locations', success: false },
      { status: 500 }
    )
  }
}

