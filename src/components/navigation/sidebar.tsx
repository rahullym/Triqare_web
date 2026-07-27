'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { getNavigationForRole, getProfileNavItem } from '@/lib/navigation'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronRight, User, LogOut } from 'lucide-react'
import { useState } from 'react'
import { UserRole } from '@/types'
import { useAuth } from '@/components/auth/AuthProvider'
import { Logo } from '@/components/ui/logo'

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  ert: 'Emergency Response',
  transport_company: 'Transport Company',
}

export function Sidebar() {
  const pathname = usePathname()
  const { signOut } = useAuth()
  const [expandedItems, setExpandedItems] = useState<string[]>([])

  // Determine role based on current path
  const getCurrentRole = (): UserRole => {
    if (pathname.startsWith('/admin')) return 'admin'
    if (pathname.startsWith('/erteam')) return 'ert'
    if (pathname.startsWith('/transport')) return 'transport_company'
    if (pathname.startsWith('/patient')) return 'patient'
    if (pathname.startsWith('/driver')) return 'driver'
    return 'admin' // default
  }

  const role = getCurrentRole()

  const toggleExpanded = (href: string) => {
    setExpandedItems(prev =>
      prev.includes(href) ? prev.filter(item => item !== href) : [...prev, href]
    )
  }

  const navigationItems = getNavigationForRole(role)
  const profileNavItem = getProfileNavItem(role)

  const renderNavItem = (item: any, level = 0) => {
    const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
    const hasChildren = item.children && item.children.length > 0
    const isExpanded = expandedItems.includes(item.href)
    const Icon = item.icon

    return (
      <div key={item.href}>
        <div
          className={cn(
            "group flex items-center justify-between rounded-2xl px-3.5 py-2.5 text-sm transition-colors cursor-pointer",
            level > 0 && "ml-3 py-2",
            isActive
              ? "bg-[#003366] font-semibold text-white shadow-sm"
              : "text-slate-500 hover:bg-slate-50 hover:text-slate-800"
          )}
          onClick={() => {
            if (hasChildren) toggleExpanded(item.href)
          }}
        >
          <Link
            href={hasChildren ? '#' : item.href}
            className="flex flex-1 items-center"
            onClick={(e) => hasChildren && e.preventDefault()}
          >
            <Icon className={cn("mr-3 h-[18px] w-[18px] shrink-0", isActive ? "text-white" : "text-slate-400 group-hover:text-slate-600")} />
            <span className="flex-1">{item.title}</span>
            {item.badge && (
              <span className={cn("ml-2 rounded-full px-2 text-[11px] font-bold", isActive ? "bg-white/20 text-white" : "bg-[#f5cccc] text-[#cc3333]")}>
                {item.badge}
              </span>
            )}
          </Link>
          {hasChildren && (
            <div className={cn("ml-2", isActive ? "text-white" : "text-slate-400")}>
              {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </div>
          )}
        </div>

        {hasChildren && isExpanded && (
          <div className="mt-1 space-y-1">
            {item.children.map((child: any) => renderNavItem(child, level + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <aside className="flex w-60 shrink-0 flex-col rounded-3xl bg-white p-5 shadow-[0_8px_30px_rgba(0,51,102,0.06)]">
      {/* Brand */}
      <div className="mb-6 flex items-center gap-2.5 px-1">
        <Logo size="xs" showText={false} />
        <span className="text-[15px] font-bold tracking-tight text-slate-900">triqare</span>
      </div>

      {/* Navigation */}
      <div className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Menu</div>
      <nav className="space-y-1.5">
        {navigationItems.map((item) => renderNavItem(item))}
      </nav>

      {/* Account card + sign out */}
      <div className="mt-auto space-y-2 pt-5">
        <Link href={profileNavItem.href} className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3 transition hover:bg-slate-100">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ccd9e6]">
            <User className="h-4 w-4 text-[#003366]" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-slate-900">{profileNavItem.title}</div>
            <div className="truncate text-xs text-slate-500">{ROLE_LABEL[role] ?? 'Member'}</div>
          </div>
        </Link>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-500 transition hover:border-[#cc3333]/30 hover:bg-[#f5cccc]/30 hover:text-[#cc3333] focus:outline-none focus:ring-2 focus:ring-[#cc3333]/30"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
