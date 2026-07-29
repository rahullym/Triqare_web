import { describe, expect, it } from 'vitest'
import {
  SOS_STATUSES,
  SOS_TERMINAL_STATUSES,
  isActiveStatus,
  isTerminalStatus,
  normalizeSOSStatus,
} from '@/lib/sosStatus'

// The SOS lifecycle is the contract the DB CHECK constraint mirrors, so a drift here
// is a 23514 in the middle of a live emergency. These tests pin the vocabulary.
describe('SOS status vocabulary', () => {
  it('includes Timed Out as a distinct status, not an alias of Cancelled', () => {
    expect(SOS_STATUSES).toContain('Timed Out')
    expect(SOS_STATUSES).toContain('Cancelled')
    expect(normalizeSOSStatus('Timed Out')).toBe('Timed Out')
    // The whole point of #11: expiry must not collapse into a user cancel.
    expect(normalizeSOSStatus('Timed Out')).not.toBe('Cancelled')
  })

  it('normalizes the legacy/alias spellings of an expiry', () => {
    expect(normalizeSOSStatus('timed_out')).toBe('Timed Out')
    expect(normalizeSOSStatus('TIMED OUT')).toBe('Timed Out')
    // 'expired' is the spec's word for it; the DB value is 'Timed Out'.
    expect(normalizeSOSStatus('expired')).toBe('Timed Out')
  })

  it('rejects anything outside the vocabulary rather than guessing', () => {
    expect(normalizeSOSStatus('Nonsense')).toBeNull()
    expect(normalizeSOSStatus('')).toBeNull()
    expect(normalizeSOSStatus(null)).toBeNull()
    expect(normalizeSOSStatus(undefined)).toBeNull()
  })

  it('still maps the historical snake_case vocabulary', () => {
    expect(normalizeSOSStatus('pending')).toBe('SOS Triggered')
    expect(normalizeSOSStatus('assigned')).toBe('Driver En Route')
    expect(normalizeSOSStatus('in_progress')).toBe('User Picked Up')
    expect(normalizeSOSStatus('completed')).toBe('Arrived at Hospital')
  })
})

describe('terminal statuses', () => {
  it('treats all three endings as terminal', () => {
    expect(isTerminalStatus('Arrived at Hospital')).toBe(true)
    expect(isTerminalStatus('Cancelled')).toBe(true)
    expect(isTerminalStatus('Timed Out')).toBe(true)
  })

  it('does not treat any in-flight status as terminal', () => {
    for (const status of [
      'SOS Triggered',
      'Driver En Route',
      'Transport Arrived',
      'User Picked Up',
    ]) {
      expect(isTerminalStatus(status)).toBe(false)
      expect(isActiveStatus(status)).toBe(true)
    }
  })

  it('keeps the exported list and the predicate in agreement', () => {
    // These drifted apart before — the list is what queries use, the predicate what
    // logic uses, and a mismatch is how 'Timed Out' fell out of the history view.
    for (const status of SOS_TERMINAL_STATUSES) {
      expect(isTerminalStatus(status)).toBe(true)
    }
    for (const status of SOS_STATUSES) {
      expect(isTerminalStatus(status)).toBe(
        (SOS_TERMINAL_STATUSES as readonly string[]).includes(status)
      )
    }
  })

  it('fails closed on an unknown status (not terminal → still tracked)', () => {
    expect(isTerminalStatus('Something New')).toBe(false)
    expect(isTerminalStatus(null)).toBe(false)
    expect(isTerminalStatus(undefined)).toBe(false)
  })
})
