'use client'

import { Badge } from '@/components/ui/badge'
import { CheckCircle, AlertTriangle, MinusCircle } from 'lucide-react'
import { TermsStatus, termsStatusLabel } from '@/lib/terms'

const STYLES: Record<TermsStatus, { className: string; Icon: typeof CheckCircle }> = {
  accepted: { className: 'bg-green-100 text-green-800', Icon: CheckCircle },
  outdated: { className: 'bg-amber-100 text-amber-800', Icon: AlertTriangle },
  not_accepted: { className: 'bg-gray-100 text-gray-600', Icon: MinusCircle },
}

/**
 * The "Terms Status" badge — Accepted (green) / Outdated (amber) / Not Accepted
 * (gray). `status` is derived server-side (src/lib/terms.ts) against the current
 * version, so the badge never re-implements the comparison. Falls back to
 * Not Accepted when the status is missing (e.g. the API is pre-migration).
 */
export function TermsStatusBadge({
  status,
  className,
}: {
  status?: TermsStatus | null
  className?: string
}) {
  const resolved: TermsStatus = status ?? 'not_accepted'
  const { className: styleClass, Icon } = STYLES[resolved]
  return (
    <Badge className={`${styleClass} ${className || ''}`}>
      <Icon className="h-3 w-3 mr-1" />
      {termsStatusLabel(resolved)}
    </Badge>
  )
}
