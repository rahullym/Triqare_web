import { SignUp } from '@clerk/nextjs'
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

        {/* Clerk Sign-Up Component */}
        <div className="flex justify-center">
          <SignUp
            appearance={{
              elements: {
                formButtonPrimary: 'bg-[#cc3333] hover:bg-[#b32d2d] text-white font-medium py-2 px-4 rounded-md transition-all duration-200 shadow-sm hover:shadow-md',
                card: 'bg-white shadow-xl rounded-lg border border-[#e6e6e6] p-8',
                headerTitle: 'text-2xl font-bold text-[#1a1a1a] mb-2',
                headerSubtitle: 'text-[#666666] text-sm mb-6',
                socialButtonsBlockButton: 'border border-[#d1d5db] hover:bg-[#f9fafb] text-[#1a1a1a] font-medium py-2 px-4 rounded-md transition-colors duration-200',
                socialButtonsBlockButtonText: 'text-[#1a1a1a] font-medium',
                formFieldInput: 'w-full px-3 py-2 border border-[#d1d5db] rounded-md shadow-sm placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/50 focus:border-[#cc3333]',
                formFieldLabel: 'block text-sm font-medium text-[#1a1a1a] mb-1',
                footerActionLink: 'text-[#cc3333] hover:text-[#b32d2d] font-medium',
                identityPreviewText: 'text-[#666666]',
                identityPreviewEditButton: 'text-[#cc3333] hover:text-[#b32d2d]'
              },
              layout: {
                socialButtonsPlacement: 'top',
                socialButtonsVariant: 'blockButton'
              }
            }}
            fallbackRedirectUrl="/dashboard"
            signInUrl="/sign-in"
          />
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
