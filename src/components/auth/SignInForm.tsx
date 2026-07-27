'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/browser'

const inputCls =
  'w-full px-3 py-2 border border-[#d1d5db] rounded-md shadow-sm placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/50 focus:border-[#cc3333]'
const primaryBtn =
  'w-full bg-[#cc3333] hover:bg-[#b32d2d] text-white font-medium py-2 px-4 rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-60'
const socialBtn =
  'w-full flex items-center justify-center gap-2 border border-[#d1d5db] hover:bg-[#f9fafb] text-[#1a1a1a] font-medium py-2 px-4 rounded-md transition-colors duration-200 disabled:opacity-60'

export function SignInForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter()
  const supabase = getBrowserSupabase()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState<null | 'password' | 'google' | 'apple' | 'reset'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?redirect_url=${encodeURIComponent(redirectUrl)}`

  async function signInWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading('password')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(error.message)
      setLoading(null)
      return
    }
    router.replace(redirectUrl)
    router.refresh()
  }

  async function signInWithOAuth(provider: 'google' | 'apple') {
    setError(null)
    setNotice(null)
    setLoading(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    })
    // On success the browser is redirected away; only reached on error.
    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  async function sendReset() {
    if (!email) {
      setError('Enter your email above first, then tap "Forgot password?".')
      return
    }
    setError(null)
    setLoading('reset')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Route through the callback so the PKCE recovery code is exchanged for a
      // session, then land on the reset form.
      redirectTo: `${window.location.origin}/auth/callback?redirect_url=/auth/reset`,
    })
    setLoading(null)
    if (error) setError(error.message)
    else setNotice('Password reset email sent. Check your inbox.')
  }

  return (
    <div className="w-full bg-white shadow-xl rounded-lg border border-[#e6e6e6] p-8">
      <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Sign in</h1>
      <p className="text-[#666666] text-sm mb-6">Welcome back to Triqare</p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
          {notice}
        </div>
      )}

      <div className="space-y-2 mb-4">
        <button
          type="button"
          onClick={() => signInWithOAuth('google')}
          disabled={loading !== null}
          className={socialBtn}
        >
          {loading === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </button>
        <button
          type="button"
          onClick={() => signInWithOAuth('apple')}
          disabled={loading !== null}
          className={socialBtn}
        >
          {loading === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
        </button>
      </div>

      <div className="flex items-center gap-3 my-4">
        <div className="h-px flex-1 bg-[#e6e6e6]" />
        <span className="text-xs text-[#999]">or</span>
        <div className="h-px flex-1 bg-[#e6e6e6]" />
      </div>

      <form onSubmit={signInWithPassword} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="you@example.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <button
              type="button"
              onClick={sendReset}
              disabled={loading !== null}
              className="text-xs font-medium text-red-600 hover:text-red-700"
            >
              {loading === 'reset' ? 'Sending…' : 'Forgot password?'}
            </button>
          </div>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="••••••••"
          />
        </div>
        <button type="submit" disabled={loading !== null} className={primaryBtn}>
          {loading === 'password' ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
