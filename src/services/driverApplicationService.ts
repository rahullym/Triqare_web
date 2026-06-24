import { createServerClient } from '@/lib/supabase/server'

/**
 * Data-access layer for driver_applications. SERVER-ONLY (uses the service-role
 * client). All public + admin access funnels through here.
 */

export type DriverApplicationStatus = 'pending' | 'approved' | 'rejected'

export interface DriverApplicationRow {
  id: string
  reference_number: string
  full_name: string
  phone: string
  email: string
  date_of_birth: string
  address: string
  city: string
  state: string
  pincode: string
  emergency_contact_name: string
  emergency_contact_phone: string
  aadhaar_ciphertext: string
  aadhaar_iv: string
  aadhaar_tag: string
  aadhaar_last4: string
  vehicle_registration: string
  vehicle_type: string
  vehicle_make_model: string | null
  vehicle_year: number | null
  ambulance_permit_number: string | null
  license_ciphertext: string
  license_iv: string
  license_tag: string
  license_last4: string
  license_expiry: string
  license_type: string | null
  driving_experience_years: number | null
  previous_ambulance_experience: boolean | null
  document_storage_path: string
  documents: Record<string, string[]>
  status: DriverApplicationStatus
  rejection_reason: string | null
  reviewed_by: string | null
  reviewed_at: string | null
  submitted_at: string
  created_at: string
  updated_at: string
}

export type InsertApplicationInput = Omit<
  DriverApplicationRow,
  'id' | 'status' | 'rejection_reason' | 'reviewed_by' | 'reviewed_at' | 'submitted_at' | 'created_at' | 'updated_at'
>

export async function generateReferenceNumber(): Promise<string> {
  const supabase = createServerClient()
  const { data, error } = await supabase.rpc('next_driver_application_ref')
  if (error || !data) {
    throw new Error(`Failed to generate reference number: ${error?.message ?? 'no data'}`)
  }
  return data as string
}

export async function insertApplication(
  input: InsertApplicationInput,
): Promise<{ id: string; reference_number: string }> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('driver_applications')
    .insert({ ...input, status: 'pending' })
    .select('id, reference_number')
    .single()
  if (error || !data) {
    throw new Error(`Failed to insert application: ${error?.message ?? 'no data'}`)
  }
  return data as { id: string; reference_number: string }
}

export async function listApplications(status?: DriverApplicationStatus): Promise<DriverApplicationRow[]> {
  const supabase = createServerClient()
  let query = supabase
    .from('driver_applications')
    .select('*')
    .order('created_at', { ascending: false })
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(`Failed to list applications: ${error.message}`)
  return (data ?? []) as DriverApplicationRow[]
}

export async function getApplicationById(id: string): Promise<DriverApplicationRow | null> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('driver_applications')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(`Failed to fetch application: ${error.message}`)
  return (data as DriverApplicationRow | null) ?? null
}

/** Prior applications matching this email OR phone (excluding the given id) — reapplication history. */
export async function findPriorApplications(
  email: string,
  phone: string,
  excludeId: string,
): Promise<DriverApplicationRow[]> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('driver_applications')
    .select('*')
    .or(`email.eq.${email},phone.eq.${phone}`)
    .neq('id', excludeId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(`Failed to fetch prior applications: ${error.message}`)
  return (data ?? []) as DriverApplicationRow[]
}

export async function updateReview(
  id: string,
  review: { status: DriverApplicationStatus; rejection_reason: string | null; reviewed_by: string },
): Promise<DriverApplicationRow> {
  const supabase = createServerClient()
  const { data, error } = await supabase
    .from('driver_applications')
    .update({
      status: review.status,
      rejection_reason: review.rejection_reason,
      reviewed_by: review.reviewed_by,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single()
  if (error || !data) throw new Error(`Failed to update review: ${error?.message ?? 'no data'}`)
  return data as DriverApplicationRow
}
