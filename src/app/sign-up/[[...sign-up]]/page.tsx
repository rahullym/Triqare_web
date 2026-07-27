import { SignUpForm } from '@/components/auth/SignUpForm'
import { Logo } from '@/components/ui/logo'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#ccd9e6] to-[#e6e6e6] flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-20 w-20 bg-white rounded-full flex items-center justify-center mb-6 shadow-lg border-2 border-[#003366]/20">
            <Logo size="md" />
          </div>
          <p className="text-[#666666] text-sm">
            Create your account to get started
          </p>
        </div>

        {/* Supabase Sign-Up */}
        <div className="flex justify-center">
          <SignUpForm redirectUrl="/dashboard" />
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-sm text-[#666666]">
            Already have an account?{' '}
            <a href="/sign-in" className="font-medium text-[#cc3333] hover:text-[#b32d2d] transition-colors duration-200">
              Sign in here
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
