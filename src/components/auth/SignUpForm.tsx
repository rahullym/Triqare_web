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

export function SignUpForm({ redirectUrl }: { redirectUrl: string }) {
  const router = useRouter()
  const supabase = getBrowserSupabase()

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState<null | 'password' | 'google' | 'apple'>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const callbackUrl = () =>
    `${window.location.origin}/auth/callback?redirect_url=${encodeURIComponent(redirectUrl)}`

  async function signUpWithPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading('password')
    // Role is NOT set here — the handle_new_auth_user() trigger defaults new
    // self-signups to 'patient'. user_metadata only carries display name.
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: callbackUrl(),
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: `${firstName} ${lastName}`.trim(),
        },
      },
    })
    setLoading(null)
    if (error) {
      setError(error.message)
      return
    }
    // If email confirmation is enabled, no session yet — tell the user to verify.
    if (!data.session) {
      setNotice('Check your email to confirm your account, then sign in.')
      return
    }
    router.replace(redirectUrl)
    router.refresh()
  }

  async function signUpWithOAuth(provider: 'google' | 'apple') {
    setError(null)
    setNotice(null)
    setLoading(provider)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: callbackUrl() },
    })
    if (error) {
      setError(error.message)
      setLoading(null)
    }
  }

  return (
    <div className="w-full bg-white shadow-xl rounded-lg border border-[#e6e6e6] p-8">
      <h1 className="text-2xl font-bold text-[#1a1a1a] mb-1">Create your account</h1>
      <p className="text-[#666666] text-sm mb-6">Get started with Triqare</p>

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
          onClick={() => signUpWithOAuth('google')}
          disabled={loading !== null}
          className={socialBtn}
        >
          {loading === 'google' ? 'Redirecting…' : 'Continue with Google'}
        </button>
        <button
          type="button"
          onClick={() => signUpWithOAuth('apple')}
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

      <form onSubmit={signUpWithPassword} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">First name</label>
            <input
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputCls}
              placeholder="Jane"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Last name</label>
            <input
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputCls}
              placeholder="Doe"
            />
          </div>
        </div>
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
          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder="At least 8 characters"
          />
        </div>
        <button type="submit" disabled={loading !== null} className={primaryBtn}>
          {loading === 'password' ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </div>
  )
}
