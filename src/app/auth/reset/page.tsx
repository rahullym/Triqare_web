'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBrowserSupabase } from '@/lib/supabase/browser'
import { Logo } from '@/components/ui/logo'

const inputCls =
  'w-full px-3 py-2 border border-[#d1d5db] rounded-md shadow-sm placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/50 focus:border-[#cc3333]'
const primaryBtn =
  'w-full bg-[#cc3333] hover:bg-[#b32d2d] text-white font-medium py-2 px-4 rounded-md transition-all duration-200 shadow-sm hover:shadow-md disabled:opacity-60'

// 'email'    → ask for the address and send the code
// 'code'     → type the emailed code + the new password
// 'password' → already holding a recovery session (legacy link), so no code needed
type Step = 'email' | 'code' | 'password'

const RESEND_COOLDOWN_SECONDS = 30

// Mirrors the project's Auth → Email OTP Length setting (verified: recovery codes
// arrive as 8 digits). Change here if that setting changes.
const OTP_LENGTH = 8

// Supabase's raw messages are accurate but read like API errors.
function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('expired') || m.includes('invalid')) {
    return 'That code is wrong or has expired. Request a new one below.'
  }
  if (m.includes('should be different')) {
    return 'Choose a password different from your current one.'
  }
  return message
}

function ResetPasswordForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = getBrowserSupabase()

  const [step, setStep] = useState<Step>('email')
  const [ready, setReady] = useState(false)
  const [email, setEmail] = useState(searchParams.get('email') ?? '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [cooldown, setCooldown] = useState(0)
  const [done, setDone] = useState(false)

  // A session here means the user arrived from a legacy recovery link (the
  // callback route exchanged the code) or is simply signed in — either way they
  // can set a password without typing a code.
  useEffect(() => {
    supabase.auth.getSession().then((res: { data: { session: unknown } }) => {
      if (res.data.session) setStep('password')
      setReady(true)
    })
  }, [supabase])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault()
    const address = email.trim()
    if (!address) {
      setError('Enter your email address.')
      return
    }
    setError(null)
    setNotice(null)
    setLoading(true)
    // redirectTo is kept only as a fallback for a link-bearing template; the
    // shipped "Reset Password" template (supabase/email-templates/recovery.html)
    // carries the {{ .Token }} code that the form below asks for.
    const { error } = await supabase.auth.resetPasswordForEmail(address, {
      redirectTo: `${window.location.origin}/auth/callback?redirect_url=/auth/reset`,
    })
    setLoading(false)
    if (error) {
      setError(error.message)
      return
    }
    setStep('code')
    setCooldown(RESEND_COOLDOWN_SECONDS)
    setNotice(`We sent a code (${OTP_LENGTH} digits) to ${address}.`)
  }

  function validatePassword(): string | null {
    if (password.length < 8) return 'Password must be at least 8 characters.'
    if (password !== confirm) return 'Passwords do not match.'
    return null
  }

  async function finish() {
    setDone(true)
    setTimeout(() => router.replace('/dashboard'), 1200)
  }

  // Verifying the code signs the user in (recovery session), which is what lets
  // updateUser set the password on the account.
  async function submitCode(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    const invalid = validatePassword()
    if (invalid) {
      setError(invalid)
      return
    }
    if (code.trim().length < OTP_LENGTH) {
      setError(`Enter the ${OTP_LENGTH}-digit code from the email.`)
      return
    }
    setLoading(true)
    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'recovery',
    })
    if (verifyError) {
      setLoading(false)
      setError(friendlyError(verifyError.message))
      return
    }
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (updateError) {
      setError(friendlyError(updateError.message))
      return
    }
    await finish()
  }

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const invalid = validatePassword()
    if (invalid) {
      setError(invalid)
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) {
      setError(friendlyError(error.message))
      return
    }
    await finish()
  }

  const passwordFields = (
    <>
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
        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
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
    </>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg border-2 border-red-100">
            <Logo size="md" />
          </div>
          <p className="text-gray-600 text-sm">
            {step === 'email' ? 'Reset your password' : 'Set a new password'}
          </p>
        </div>

        <div className="w-full bg-white shadow-xl rounded-lg border border-[#e6e6e6] p-8">
          {error && (
            <div className="mb-4 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
          {notice && !done && (
            <div className="mb-4 rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              {notice}
            </div>
          )}

          {done ? (
            <div className="rounded-md bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-700">
              Password updated. Redirecting…
            </div>
          ) : step === 'email' ? (
            <form onSubmit={sendCode} className="space-y-4">
              <p className="text-sm text-gray-600">
                Enter your email and we&apos;ll send you a code ({OTP_LENGTH} digits).
              </p>
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
              <button type="submit" disabled={loading || !ready} className={primaryBtn}>
                {loading ? 'Sending…' : 'Send code'}
              </button>
              <button
                type="button"
                onClick={() => router.push('/sign-in')}
                className="w-full text-sm font-medium text-gray-500 hover:text-gray-700"
              >
                Back to sign in
              </button>
            </form>
          ) : step === 'code' ? (
            <form onSubmit={submitCode} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reset code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={OTP_LENGTH}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  className={`${inputCls} text-center text-lg tracking-[0.4em] font-semibold`}
                  placeholder={'0'.repeat(OTP_LENGTH)}
                />
              </div>
              {passwordFields}
              <button type="submit" disabled={loading} className={primaryBtn}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
              <button
                type="button"
                onClick={() => sendCode()}
                disabled={loading || cooldown > 0}
                className="w-full text-sm font-medium text-red-600 hover:text-red-700 disabled:text-gray-400"
              >
                {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
              </button>
            </form>
          ) : (
            <form onSubmit={submitPassword} className="space-y-4">
              {passwordFields}
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

// useSearchParams (the ?email= prefill from sign-in) needs a Suspense boundary,
// same as /verify-email.
export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
          <p className="text-sm text-gray-600">Loading…</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  )
}
