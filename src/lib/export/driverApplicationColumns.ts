import type { DriverApplicationRow } from '@/services/driverApplicationService'

/**
 * Driver-application export column mapping — the SINGLE place to remap columns.
 *
 * ⚠️ QP2-21: TriQare's official driver Excel template has NOT been received yet.
 * The headers/order below are provisional. When the template arrives, edit ONLY
 * this file — reorder, rename `header`s, add/remove entries — and nothing else in
 * the export pipeline changes.
 *
 * Sensitive PII (Aadhaar, license number) is MASKED by default (`sensitive: true`).
 * Exporting full decrypted values would require a deliberate, audited change here
 * plus decryption in the export route — intentionally not enabled.
 */

export interface ExportColumn {
  /** Header text, exactly as the target template requires. */
  header: string
  /** Cell value for a row. */
  value: (row: DriverApplicationRow) => string
  /** True if this column carries (masked) PII. */
  sensitive?: boolean
}

const yesNo = (v: boolean | null): string => (v == null ? '' : v ? 'Yes' : 'No')
const str = (v: string | number | null): string => (v == null ? '' : String(v))
const dateTime = (v: string | null): string => (v ? new Date(v).toLocaleString() : '')

export const driverApplicationExportColumns: ExportColumn[] = [
  { header: 'Reference No.', value: (r) => r.reference_number },
  { header: 'Full Name', value: (r) => r.full_name },
  { header: 'Phone', value: (r) => r.phone },
  { header: 'Email', value: (r) => r.email },
  { header: 'Date of Birth', value: (r) => str(r.date_of_birth) },
  { header: 'Address', value: (r) => r.address },
  { header: 'City', value: (r) => str(r.city) },
  { header: 'State', value: (r) => str(r.state) },
  { header: 'Pincode', value: (r) => str(r.pincode) },
  { header: 'Aadhaar (masked)', value: (r) => `XXXXXXXX${r.aadhaar_last4}`, sensitive: true },
  { header: 'Emergency Contact Name', value: (r) => r.emergency_contact_name },
  { header: 'Emergency Contact Phone', value: (r) => r.emergency_contact_phone },
  { header: 'Vehicle Registration', value: (r) => r.vehicle_registration },
  { header: 'Vehicle Type', value: (r) => r.vehicle_type },
  { header: 'Make / Model', value: (r) => str(r.vehicle_make_model) },
  { header: 'Year of Manufacture', value: (r) => str(r.vehicle_year) },
  { header: 'Ambulance Permit No.', value: (r) => str(r.ambulance_permit_number) },
  { header: 'License No. (masked)', value: (r) => `XXXX${r.license_last4}`, sensitive: true },
  { header: 'License Expiry', value: (r) => str(r.license_expiry) },
  { header: 'License Type', value: (r) => str(r.license_type) },
  { header: 'Driving Experience (yrs)', value: (r) => str(r.driving_experience_years) },
  { header: 'Previous Ambulance Experience', value: (r) => yesNo(r.previous_ambulance_experience) },
  { header: 'Status', value: (r) => r.status },
  { header: 'Rejection Reason', value: (r) => str(r.rejection_reason) },
  { header: 'Submitted At', value: (r) => dateTime(r.submitted_at) },
  { header: 'Reviewed At', value: (r) => dateTime(r.reviewed_at) },
]
