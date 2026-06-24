import { z } from 'zod'

/**
 * Shared validation for the QSoS driver application.
 * Single source of truth used by BOTH the client form and the server submit
 * route, so the exact regexes/messages from the spec never drift apart.
 */

export const VEHICLE_TYPES = ['ambulance', 'medical_van'] as const
export const LICENSE_TYPES = ['LMV', 'HMV'] as const

export type VehicleType = (typeof VEHICLE_TYPES)[number]
export type LicenseType = (typeof LICENSE_TYPES)[number]

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  ambulance: 'Ambulance',
  medical_van: 'Medical Van',
}

// Spec regexes (verbatim).
export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const PHONE_REGEX = /^\d{10}$/
export const AADHAAR_REGEX = /^\d{12}$/
export const PINCODE_REGEX = /^\d{6}$/

export const VALIDATION_MESSAGES = {
  required: 'This field is required',
  email: 'Please enter a valid email address',
  phone: 'Phone number must be 10 digits',
  aadhaar: 'Aadhaar number must be 12 digits',
  pincode: 'Pincode must be 6 digits',
  dobAge: 'Driver must be at least 21 years old',
  licenseExpired: 'Driving license is expired. Please renew before applying.',
  missingMandatory: 'Please fill all mandatory fields',
} as const

export const MIN_DRIVER_AGE = 21

/** True when `dobISO` (YYYY-MM-DD) makes the applicant at least `minYears` old today. */
export function isAtLeastYearsOld(dobISO: string, minYears: number): boolean {
  const dob = new Date(`${dobISO}T00:00:00`)
  if (Number.isNaN(dob.getTime())) return false
  const threshold = new Date()
  threshold.setHours(0, 0, 0, 0)
  threshold.setFullYear(threshold.getFullYear() - minYears)
  return dob.getTime() <= threshold.getTime()
}

/** True when `iso` (YYYY-MM-DD) is strictly after today. */
export function isFutureDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00`)
  if (Number.isNaN(d.getTime())) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return d.getTime() > today.getTime()
}

const requiredString = (message = VALIDATION_MESSAGES.required) =>
  z.string().trim().min(1, message)

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === '' ? undefined : v))

// Empty string / null → undefined, then coerce to an int within range.
const optionalInt = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.coerce.number().int().min(min).max(max).optional(),
  )

// Empty string / null → undefined, then validate against the enum (optional).
// Lets a <Select> sit at its placeholder ('') and still count as "not provided".
const optionalEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? undefined : v),
    z.enum(values).optional(),
  )

export const driverApplicationSchema = z.object({
  // Personal
  full_name: requiredString(),
  phone: requiredString().regex(PHONE_REGEX, VALIDATION_MESSAGES.phone),
  email: requiredString().regex(EMAIL_REGEX, VALIDATION_MESSAGES.email),
  date_of_birth: requiredString().refine(
    (v) => isAtLeastYearsOld(v, MIN_DRIVER_AGE),
    VALIDATION_MESSAGES.dobAge,
  ),
  address: requiredString(),
  city: requiredString(),
  state: requiredString(),
  pincode: requiredString().regex(PINCODE_REGEX, VALIDATION_MESSAGES.pincode),
  aadhaar_number: requiredString().regex(AADHAAR_REGEX, VALIDATION_MESSAGES.aadhaar),
  emergency_contact_name: requiredString(),
  emergency_contact_phone: requiredString().regex(PHONE_REGEX, VALIDATION_MESSAGES.phone),

  // Vehicle
  vehicle_registration: requiredString(),
  vehicle_type: z.enum(VEHICLE_TYPES, { message: VALIDATION_MESSAGES.required }),
  vehicle_make_model: optionalString,
  vehicle_year: optionalInt(1900, 2100),
  ambulance_permit_number: optionalString,

  // License
  license_number: requiredString(),
  license_expiry: requiredString().refine(
    (v) => isFutureDate(v),
    VALIDATION_MESSAGES.licenseExpired,
  ),
  license_type: optionalEnum(LICENSE_TYPES),

  // Additional
  driving_experience_years: optionalInt(0, 80),
  previous_ambulance_experience: z.boolean().optional(),
})

export type DriverApplicationInput = z.infer<typeof driverApplicationSchema>

/** Server-side submit payload: the form fields plus the upload draft context. */
export const driverApplicationSubmitSchema = driverApplicationSchema.extend({
  draftId: z.string().uuid(),
  // documentType -> array of draft storage paths (fields can hold multiple
  // files, e.g. front+back / photos). Presence of all REQUIRED docs is checked
  // in the route against the storage lib's required set.
  documents: z.record(z.string(), z.array(z.string().min(1)).min(1)),
})

export type DriverApplicationSubmitInput = z.infer<typeof driverApplicationSubmitSchema>
