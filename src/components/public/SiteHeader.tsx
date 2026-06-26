'use client'

// Shared public-site header. Single source of truth for marketing/public-page
// chrome so the homepage and inner pages (drivers, apply, demo, registration) stay aligned.
import Link from 'next/link'
import { Logo } from '@/components/ui/logo'
import { Smartphone, Menu } from 'lucide-react'
import { APP_STORE_URL, PLAY_STORE_URL } from '@/lib/appLinks'
import { StoreBadge } from '@/components/public/StoreBadge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const RED = '#cc3333'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-slate-50/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-2">
        <Link href="/" aria-label="TriQare home">
          <Logo size="header" showText={false} />
        </Link>
        <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 lg:flex">
          <Link href="/#platform" className="hover:text-slate-900">Platform</Link>
          <Link href="/#mobile" className="hover:text-slate-900">Mobile app</Link>
          <Link href="/drivers" className="hover:text-slate-900">Drive with QSoS</Link>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Mobile hamburger — exposes the nav links (incl. the driver utility) on
              small screens, where the desktop nav (lg:flex) is hidden. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="inline-flex items-center justify-center rounded-lg border border-slate-300 p-2 text-slate-700 transition hover:bg-white focus:outline-none lg:hidden">
                <Menu className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-56 p-2 bg-white text-slate-900 border border-slate-200 shadow-lg">
              <div className="flex flex-col">
                <Link href="/#platform" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Platform</Link>
                <Link href="/#mobile" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Mobile app</Link>
                <Link href="/drivers" className="rounded-md px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100">Drive with QSoS</Link>
                <Link href="/demo" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Live demo</Link>
                <Link href="/sign-in" className="rounded-md px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100">Sign in</Link>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="hidden items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white focus:outline-none md:inline-flex">
                <Smartphone className="h-4 w-4" /> Get the app
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} className="w-64 p-3 bg-white text-slate-900 border border-slate-200 shadow-lg">
              <div className="space-y-2.5">
                <StoreBadge
                  href={APP_STORE_URL}
                  img="/badges/app-store.svg"
                  alt="Download on the App Store"
                  platform="ios"
                  line1="Download on the"
                  line2="App Store"
                />
                <StoreBadge
                  href={PLAY_STORE_URL}
                  img="/badges/google-play.svg"
                  alt="Get it on Google Play"
                  platform="android"
                  line1="GET IT ON"
                  line2="Google Play"
                />
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/demo" className="hidden rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-white sm:inline-flex">
            Live demo
          </Link>
          <Link href="/sign-in" className="hidden text-sm font-semibold text-slate-700 hover:text-slate-900 sm:block">Sign in</Link>
          <Link href="/sign-up" className="hidden items-center rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 lg:inline-flex" style={{ background: RED }}>
            Get started
          </Link>
        </div>
      </div>
    </header>
  )
}
