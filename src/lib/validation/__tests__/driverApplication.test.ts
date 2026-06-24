import { describe, it, expect } from 'vitest'
import {
  driverApplicationSchema,
  isAtLeastYearsOld,
  isFutureDate,
  VALIDATION_MESSAGES,
} from '@/lib/validation/driverApplication'

// Format LOCAL date components (the production validators parse `${iso}T00:00:00`
// as local time, so building the string via toISOString()/UTC would be off-by-one).
function fmtLocal(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function isoDaysFromNow(days: number): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + days)
  return fmtLocal(d)
}

function isoYearsFromNow(years: number, extraDays = 0): string {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setFullYear(d.getFullYear() + years)
  d.setDate(d.getDate() + extraDays)
  return fmtLocal(d)
}

const validBase = () => ({
  full_name: 'Asha Rao',
  phone: '9876543210',
  email: 'asha@example.com',
  date_of_birth: isoYearsFromNow(-30),
  address: '12 MG Road',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560001',
  aadhaar_number: '123412341234',
  emergency_contact_name: 'Ravi Rao',
  emergency_contact_phone: '9876500000',
  vehicle_registration: 'KA01AB1234',
  vehicle_type: 'ambulance' as const,
  ambulance_permit_number: 'PERMIT-1',
  license_number: 'DL-1234',
  license_expiry: isoYearsFromNow(2),
  license_type: 'LMV' as const,
})

describe('date helpers', () => {
  it('isAtLeastYearsOld: exactly 21 today passes, one day short fails', () => {
    expect(isAtLeastYearsOld(isoYearsFromNow(-21), 21)).toBe(true)
    expect(isAtLeastYearsOld(isoYearsFromNow(-21, 1), 21)).toBe(false)
  })
  it('isFutureDate: tomorrow is future, today/yesterday are not', () => {
    expect(isFutureDate(isoDaysFromNow(1))).toBe(true)
    expect(isFutureDate(isoDaysFromNow(0))).toBe(false)
    expect(isFutureDate(isoDaysFromNow(-1))).toBe(false)
  })
})

describe('driverApplicationSchema', () => {
  it('accepts a valid application', () => {
    expect(driverApplicationSchema.safeParse(validBase()).success).toBe(true)
  })

  const cases: { field: string; value: unknown; message: string }[] = [
    { field: 'email', value: 'not-an-email', message: VALIDATION_MESSAGES.email },
    { field: 'phone', value: '12345', message: VALIDATION_MESSAGES.phone },
    { field: 'emergency_contact_phone', value: '999', message: VALIDATION_MESSAGES.phone },
    { field: 'aadhaar_number', value: '12345', message: VALIDATION_MESSAGES.aadhaar },
    { field: 'pincode', value: '123', message: VALIDATION_MESSAGES.pincode },
  ]
  for (const c of cases) {
    it(`rejects bad ${c.field} with the spec message`, () => {
      const res = driverApplicationSchema.safeParse({ ...validBase(), [c.field]: c.value })
      expect(res.success).toBe(false)
      if (!res.success) {
        const issue = res.error.issues.find((i) => i.path[0] === c.field)
        expect(issue?.message).toBe(c.message)
      }
    })
  }

  it('rejects under-21 applicants', () => {
    const res = driverApplicationSchema.safeParse({ ...validBase(), date_of_birth: isoYearsFromNow(-18) })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.find((i) => i.path[0] === 'date_of_birth')?.message).toBe(VALIDATION_MESSAGES.dobAge)
    }
  })

  it('rejects an expired license', () => {
    const res = driverApplicationSchema.safeParse({ ...validBase(), license_expiry: isoYearsFromNow(-1) })
    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.issues.find((i) => i.path[0] === 'license_expiry')?.message).toBe(VALIDATION_MESSAGES.licenseExpired)
    }
  })

  it('treats optional numeric fields as optional', () => {
    const res = driverApplicationSchema.safeParse({ ...validBase(), vehicle_year: '', driving_experience_years: '' })
    expect(res.success).toBe(true)
  })

  it('accepts a blank ambulance permit number and license type', () => {
    const res = driverApplicationSchema.safeParse({
      ...validBase(),
      ambulance_permit_number: '',
      license_type: '',
    })
    expect(res.success).toBe(true)
  })
})
