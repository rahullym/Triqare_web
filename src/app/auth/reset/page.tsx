'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/browser'
import { Logo } from '@/components/ui/logo'

const inputCls =
  'w-full px-3 py-2 border border-[#d1d5db] rounded-md shadow-sm placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/50 focus:border-[#cc3333]'
const primaryBtn =
  'w-full bg-[#cc3333] hover:bg-[#b32d2d] text-white font-medium py-2 px-4 rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-60'

export default function ResetPasswordPage() {
  const router = useRouter()
  const supabase = getBrowserSupabase()

  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  // The callback route already exchanged the recovery code for a session, so the
  // user should have an active (recovery) session here.
  useEffect(() => {
    supabase.auth.getSession().then((res: { data: { session: unknown } }) => {
      if (!res.data.session) {
        setError('This reset link is invalid or has expired. Request a new one.')
      }
      setReady(true)
    })
  }, [supabase])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== confirm) {
      setError('Passwords do not match.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setDone(true)
    setTimeout(() => router.replace('/dashboard'), 1200)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg border-2 border-red-100">
            <Logo size="md" />
          </div>
          <p className="text-gray-600 text-sm">Set a new password</p>
        </div>

        <div className="w-full bg-white shadow-xl rounded-lg border border-[#e6e6e6] p-8">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {done ? (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              Password updated. Redirecting…
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">New password</label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputCls}
                  placeholder="At least 8 characters"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirm password
                </label>
                <input
                  type="password"
                  autoComplete="new-password"
                  required
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={inputCls}
                  placeholder="Re-enter password"
                />
              </div>
              <button type="submit" disabled={loading || !ready} className={primaryBtn}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
