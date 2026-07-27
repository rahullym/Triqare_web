'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileText, Loader2, History } from 'lucide-react'
import { TermsStatusBadge } from '@/components/admin/TermsStatusBadge'
import { TermsStatus } from '@/lib/terms'

interface AcceptanceRow {
  id: string
  terms_version: string
  accepted_at: string
}

interface TermsHistoryResponse {
  terms_accepted: boolean
  terms_version: string | null
  terms_accepted_at: string | null
  current_terms_version: string | null
  terms_status: TermsStatus
  history: AcceptanceRow[]
}

// "27 Jul 2026, 2:30 pm"
function formatDateTime(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

/**
 * Read-only Terms & Conditions panel for the user details page.
 * Shows the current status, the latest accepted version + timestamp, and the
 * full append-only acceptance history — all sourced from the backend
 * (/api/admin/users/[userId]/terms-history), which is the source of truth.
 */
export function UserTermsCard({ userId }: { userId: string }) {
  const [data, setData] = useState<TermsHistoryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/admin/users/${userId}/terms-history`)
        if (!res.ok) {
          if (!cancelled) setFailed(true)
          return
        }
        const json: TermsHistoryResponse = await res.json()
        if (!cancelled) setData(json)
      } catch {
        if (!cancelled) setFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [userId])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center">
          <FileText className="h-5 w-5 mr-2" />
          Terms &amp; Conditions
        </CardTitle>
        <CardDescription>
          Whether this user has accepted the Terms, which version, and when —
          plus the full acceptance history.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center text-gray-500 text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Loading terms status…
          </div>
        ) : failed || !data ? (
          <p className="text-sm text-gray-500">
            Terms acceptance information is unavailable.
          </p>
        ) : (
          <>
            {/* Status · latest version · latest date */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                  Status
                </div>
                <TermsStatusBadge status={data.terms_status} />
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                  Latest Version
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {data.terms_version || '—'}
                </div>
                {data.current_terms_version && (
                  <div className="text-xs text-gray-500 mt-0.5">
                    Current: {data.current_terms_version}
                  </div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium uppercase tracking-wide text-gray-500 mb-1">
                  Accepted On
                </div>
                <div className="text-sm font-medium text-gray-900">
                  {formatDateTime(data.terms_accepted_at)}
                </div>
              </div>
            </div>

            {data.terms_status === 'outdated' && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                This user accepted an older version ({data.terms_version}). The
                current version is {data.current_terms_version}. They will be
                asked to re-accept on their next app launch.
              </p>
            )}

            {/* Acceptance history */}
            <div>
              <div className="flex items-center text-sm font-medium text-gray-700 mb-2">
                <History className="h-4 w-4 mr-1.5" />
                Acceptance History
              </div>
              {data.history.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No acceptance has been recorded for this user yet.
                </p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {data.history.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-center justify-between px-3 py-2 text-sm"
                    >
                      <span className="font-medium text-gray-900">
                        {row.terms_version}
                        {data.current_terms_version &&
                          row.terms_version === data.current_terms_version && (
                            <span className="ml-2 text-xs font-normal text-green-700">
                              (current)
                            </span>
                          )}
                      </span>
                      <span className="text-gray-600">
                        {formatDateTime(row.accepted_at)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
