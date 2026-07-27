import { SignInForm } from '@/components/auth/SignInForm'
import { Logo } from '@/components/ui/logo'

// Only honor internal, same-origin redirect targets to avoid open-redirect abuse.
function sanitizeRedirectUrl(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return '/dashboard'
  // Must be a root-relative path and not a protocol-relative ("//host") URL.
  if (raw.startsWith('/') && !raw.startsWith('//')) {
    return raw
  }
  return '/dashboard'
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string | string[] }>
}) {
  const params = await searchParams
  const redirectUrl = sanitizeRedirectUrl(params?.redirect_url)

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg border-2 border-red-100">
            <Logo size="md" />
          </div>
          <p className="text-gray-600 text-sm">
            Sign in to access your dashboard
          </p>
        </div>

        {/* Supabase Sign-In */}
        <div className="flex justify-center">
          <SignInForm redirectUrl={redirectUrl} />
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-gray-500">
            Don't have an account?{' '}
            <a href="/sign-up" className="font-medium text-red-600 hover:text-red-700 transition-colors duration-200">
              Sign up here
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
