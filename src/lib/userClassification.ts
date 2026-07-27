// =============================================================================
// USER TYPE CLASSIFICATION
// =============================================================================
// The admin dashboard classifies every account as one (or both) of:
//   * Patient
//   * Emergency Contact
//   * Patient + Emergency Contact
//
// The ticket describes these as two backend flags — `is_patient` and
// `is_emergency_contact`. There are no physical columns by those names; instead
// we DERIVE them, server-side, from the authoritative relational data so they
// can never drift out of sync:
//
//   is_patient           = the account is a patient in its own right, i.e. a
//                          patient-role account whose origin is NOT an emergency
//                          contact invite. Concretely:
//                              role = 'patient' AND account_type <> 'emergency_contact'
//                          (account_type is CHECK-constrained to
//                           'patient' | 'emergency_contact', default 'patient';
//                           it defaults to 'patient' for every role, so we MUST
//                           gate on role='patient' — otherwise an admin/driver
//                           would read as a patient.)
//
//   is_emergency_contact = the account is listed as someone's emergency contact.
//                          Authoritative signal is the DB-maintained link
//                          emergency_contacts.contact_user_id -> users.id
//                          (resolved by trigger + one-time backfill on email),
//                          OR an account that was itself invited as an emergency
//                          contact (account_type = 'emergency_contact').
//
// An account invited as an emergency contact (account_type='emergency_contact')
// is deliberately classified is_patient=false → "Emergency Contact", even though
// it uses the patient app. That distinct account_type exists precisely to record
// that origin, and the stakeholder wants those users surfaced as Emergency
// Contacts, not Patients.
//
// This module is isomorphic (no server-only imports) so the same definitions are
// used by the API (source of truth) and the React UI (rendering).
// =============================================================================

export type UserTypeFilter = 'all' | 'patient' | 'emergency_contact' | 'both'

export interface UserTypeFlags {
  is_patient: boolean
  is_emergency_contact: boolean
}

export interface UserTypeSignals {
  role: string
  account_type?: string | null
  /** True when the account is referenced as someone's emergency contact
   *  (emergency_contacts.contact_user_id, or an email/phone match). */
  isEmergencyContactLinked: boolean
}

/** Derive the two authoritative flags from the raw account signals. */
export function computeUserTypeFlags(signals: UserTypeSignals): UserTypeFlags {
  const accountType = signals.account_type || 'patient'
  const is_patient = signals.role === 'patient' && accountType !== 'emergency_contact'
  const is_emergency_contact =
    accountType === 'emergency_contact' || signals.isEmergencyContactLinked
  return { is_patient, is_emergency_contact }
}

/** Human label for a set of flags. Returns null for accounts that are neither
 *  (e.g. admin / ERT / driver / transport staff with no patient-app identity). */
export function userTypeLabel(flags: UserTypeFlags): string | null {
  if (flags.is_patient && flags.is_emergency_contact) return 'Patient + Emergency Contact'
  if (flags.is_patient) return 'Patient'
  if (flags.is_emergency_contact) return 'Emergency Contact'
  return null
}

/** Does an account match the selected user-type filter? */
export function matchesUserTypeFilter(flags: UserTypeFlags, filter: UserTypeFilter): boolean {
  switch (filter) {
    case 'patient':
      return flags.is_patient && !flags.is_emergency_contact
    case 'emergency_contact':
      return flags.is_emergency_contact && !flags.is_patient
    case 'both':
      return flags.is_patient && flags.is_emergency_contact
    case 'all':
    default:
      return true
  }
}

/** Filter tabs, in display order, for the Users page. */
export const USER_TYPE_FILTERS: { value: UserTypeFilter; label: string }[] = [
  { value: 'all', label: 'All Users' },
  { value: 'patient', label: 'Patients' },
  { value: 'emergency_contact', label: 'Emergency Contacts' },
  { value: 'both', label: 'Patient + Emergency Contact' },
]
