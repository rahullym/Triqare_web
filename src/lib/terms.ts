// Shared Terms & Conditions status derivation.
//
// The backend is the source of truth: the users table carries the denormalised
// "most recent acceptance" (terms_accepted / terms_version / terms_accepted_at)
// and configurations.current_terms_version is the current version. This helper
// turns that raw state into the "Terms Status" the Admin Dashboard shows, so the
// API and the UI derive it identically.
//
// (User Type — Patient / Emergency Contact / both — lives in userClassification.ts.)

export type TermsStatus = 'accepted' | 'outdated' | 'not_accepted'

const TERMS_STATUS_LABELS: Record<TermsStatus, string> = {
  accepted: 'Accepted',
  outdated: 'Outdated',
  not_accepted: 'Not Accepted',
}

export function termsStatusLabel(status: TermsStatus): string {
  return TERMS_STATUS_LABELS[status]
}

/**
 * Derive a user's Terms status by comparing the version they accepted against
 * the current version.
 *   - never accepted            -> 'not_accepted'
 *   - accepted the current one  -> 'accepted'
 *   - accepted an older one     -> 'outdated'
 * `currentVersion` is configurations.current_terms_version; when it is unknown
 * (null) we cannot call anything "outdated", so any accepted version reads as
 * 'accepted'.
 */
export function deriveTermsStatus(
  acceptedVersion: string | null | undefined,
  currentVersion: string | null | undefined
): TermsStatus {
  const accepted = (acceptedVersion ?? '').trim()
  if (!accepted) return 'not_accepted'
  const current = (currentVersion ?? '').trim()
  if (!current) return 'accepted'
  return accepted === current ? 'accepted' : 'outdated'
}
