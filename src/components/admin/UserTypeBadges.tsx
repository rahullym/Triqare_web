'use client'

import { Badge } from '@/components/ui/badge'
import { HeartPulse, LifeBuoy } from 'lucide-react'
import { UserTypeFlags } from '@/lib/userClassification'

interface UserTypeBadgesProps extends UserTypeFlags {
  /** Show a neutral placeholder when the account is neither type. Default: hidden. */
  showNone?: boolean
  className?: string
}

/**
 * Renders the account's user-type classification as one or two badges.
 *
 * A "Patient + Emergency Contact" account shows BOTH badges side by side —
 * per the requirement, we surface both statuses rather than merging or
 * replacing one with the other.
 */
export function UserTypeBadges({
  is_patient,
  is_emergency_contact,
  showNone = false,
  className,
}: UserTypeBadgesProps) {
  if (!is_patient && !is_emergency_contact) {
    if (!showNone) return null
    return (
      <span className={className}>
        <Badge className="bg-gray-100 text-gray-600">—</Badge>
      </span>
    )
  }

  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className || ''}`}>
      {is_patient && (
        <Badge className="bg-purple-100 text-purple-800">
          <HeartPulse className="h-3 w-3 mr-1" />
          Patient
        </Badge>
      )}
      {is_emergency_contact && (
        <Badge className="bg-teal-100 text-teal-800">
          <LifeBuoy className="h-3 w-3 mr-1" />
          Emergency Contact
        </Badge>
      )}
    </span>
  )
}
