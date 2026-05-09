import { SignIn } from '@clerk/nextjs'
import { Logo } from '@/components/ui/logo'

export default function SignInPage() {
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

        {/* Clerk Sign-In Component */}
        <div className="flex justify-center">
          <SignIn
            appearance={{
              elements: {
                formButtonPrimary: 'bg-[#cc3333] hover:bg-[#b32d2d] text-white font-medium py-2 px-4 rounded-md transition-all duration-200 shadow-sm hover:shadow-md',
                card: 'bg-white shadow-xl rounded-lg border border-[#e6e6e6] p-8',
                headerTitle: 'text-2xl font-bold text-[#1a1a1a] mb-2',
                headerSubtitle: 'text-[#666666] text-sm mb-6',
                socialButtonsBlockButton: 'border border-[#d1d5db] hover:bg-[#f9fafb] text-[#1a1a1a] font-medium py-2 px-4 rounded-md transition-colors duration-200',
                socialButtonsBlockButtonText: 'text-[#1a1a1a] font-medium',
                formFieldInput: 'w-full px-3 py-2 border border-[#d1d5db] rounded-md shadow-sm placeholder-[#999999] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/50 focus:border-[#cc3333]',
                formFieldLabel: 'block text-sm font-medium text-gray-700 mb-1',
                footerActionLink: 'text-red-600 hover:text-red-700 font-medium',
                identityPreviewText: 'text-gray-600',
                identityPreviewEditButton: 'text-red-600 hover:text-red-700'
              },
              layout: {
                socialButtonsPlacement: 'top',
                socialButtonsVariant: 'blockButton'
              }
            }}
            fallbackRedirectUrl="/dashboard"
            signUpUrl="/sign-up"
          />
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
