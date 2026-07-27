import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types based on users table schema
export interface DatabaseUser {
  id: string
  clerk_user_id?: string | null
  auth_user_id?: string | null
  account_type?: string | null
  onboarding_completed?: boolean | null

  // Terms & Conditions acceptance (denormalised "most recent acceptance").
  // Full audit history lives in the terms_acceptances table.
  terms_accepted?: boolean | null
  terms_version?: string | null
  terms_accepted_at?: string | null
  email: string
  first_name?: string | null
  last_name?: string | null
  full_name?: string | null
  phone?: string | null
  bio?: string | null
  role: 'admin' | 'ert' | 'transport_company' | 'driver' | 'patient'
  avatar_url?: string | null
  is_active: boolean
  last_sign_in_at?: string | null
  created_at: string
  updated_at: string
  created_by?: string | null

  // Additional profile fields
  date_of_birth?: string | null
  gender?: string | null
  address?: string | null
  city?: string | null
  state?: string | null
  zip_code?: string | null
  country?: string | null

  // Emergency contact information
  emergency_contact_name?: string | null
  emergency_contact_phone?: string | null
  emergency_contact_relationship?: string | null

  // Medical information (for patients)
  medical_conditions?: string | null
  allergies?: string | null
  medications?: string | null
  blood_type?: string | null

  // Work information (for ERT, drivers, etc.)
  department?: string | null
  position?: string | null
  employee_id?: string | null

  // Patient-specific fields
  insurance_provider?: string | null
  insurance_number?: string | null
  last_checkup?: string | null

  // Driver-specific fields
  license_number?: string | null
  license_class?: string | null
  license_expiry?: string | null
  medical_cert_expiry?: string | null
  years_experience?: string | null
  special_certifications?: string | null
  languages_spoken?: string | null
  current_shift?: string | null
  vehicle_assigned?: string | null
  rating?: number | null
  total_trips?: number | null
  last_trip?: string | null

  // Preferences and settings
  notification_preferences?: {
    email: boolean
    sms: boolean
    push: boolean
  } | null
  language_preference?: string | null
  timezone?: string | null
}

// User creation input type
export interface CreateUserInput {
  clerk_user_id: string
  email: string
  first_name?: string
  last_name?: string
  full_name?: string
  phone?: string
  bio?: string
  role: 'admin' | 'ert' | 'transport_company' | 'driver' | 'patient'
  avatar_url?: string
  created_by?: string

  // Additional profile fields
  date_of_birth?: string
  gender?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  country?: string

  // Emergency contact information
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relationship?: string

  // Medical information (for patients)
  medical_conditions?: string
  allergies?: string
  medications?: string
  blood_type?: string

  // Work information
  department?: string
  position?: string
  employee_id?: string
  transport_company_id?: string

  // Preferences
  notification_preferences?: {
    email: boolean
    sms: boolean
    push: boolean
  }
  language_preference?: string
  timezone?: string
}

// User update input type
export interface UpdateUserInput {
  email?: string
  first_name?: string
  last_name?: string
  full_name?: string
  phone?: string
  bio?: string
  role?: 'admin' | 'ert' | 'transport_company' | 'driver' | 'patient'
  avatar_url?: string
  is_active?: boolean
  last_sign_in_at?: string

  // Additional profile fields
  date_of_birth?: string
  gender?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  country?: string

  // Emergency contact information
  emergency_contact_name?: string
  emergency_contact_phone?: string
  emergency_contact_relationship?: string

  // Medical information (for patients)
  medical_conditions?: string
  allergies?: string
  medications?: string
  blood_type?: string

  // Work information
  department?: string
  position?: string
  employee_id?: string
  transport_company_id?: string

  // Preferences
  notification_preferences?: {
    email: boolean
    sms: boolean
    push: boolean
  }
  language_preference?: string
  timezone?: string
}
