import { UserRole } from '@/types'
import {
  LayoutDashboard,
  Users,
  Building2,
  Truck,
  UserCheck,
  Settings,
  AlertTriangle,
  Map,
  History,
  BarChart3,
  Phone,
  Car,
  Activity,
  Bell,
  Clock,
  UserPlus,
  TrendingUp,
  FileText,
  Zap,
  CreditCard,
  Receipt,
  Package,
  Database,
  Globe,
  MapPin,
  Building,
  Shield,
  User,
  Upload,
  Megaphone,
  Download
} from 'lucide-react'

export interface NavItem {
  title: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  roles: UserRole[]
  description?: string
  badge?: string
  children?: NavItem[]
}

// Role-based navigation configuration
export const navigationConfig: Record<UserRole, NavItem[]> = {
  admin: [
    {
      title: 'Admin Dashboard',
      href: '/admin/dashboard',
      icon: LayoutDashboard,
      roles: ['admin'],
      description: 'System overview and analytics'
    },
    {
      title: 'SOS Dashboard',
      href: '/sos',
      icon: AlertTriangle,
      roles: ['admin'],
      description: 'Live emergency SOS requests'
    },
    {
      title: 'Push Health',
      href: '/admin/push-health',
      icon: Bell,
      roles: ['admin'],
      description: 'FCM push notification delivery health'
    },
    {
      title: 'Driver Applications',
      href: '/admin/driver-applications',
      icon: FileText,
      roles: ['admin'],
      description: 'Review QSoS ambulance partner KYC applications'
    },
    {
      title: 'My Profile',
      href: '/admin/profile',
      icon: User,
      roles: ['admin'],
      description: 'View and edit your profile'
    },
    {
      title: 'User Management',
      href: '/admin/users',
      icon: Users,
      roles: ['admin'],
      description: 'Manage system users and roles',
      children: [
        {
          title: 'All Users',
          href: '/admin/users',
          icon: Users,
          roles: ['admin']
        },
        {
          title: 'Add User',
          href: '/admin/users/add',
          icon: UserPlus,
          roles: ['admin']
        },
        {
          title: 'Assign Roles',
          href: '/admin/users/assign-roles',
          icon: Shield,
          roles: ['admin']
        },
        {
          title: 'Role Management',
          href: '/admin/users/roles',
          icon: Shield,
          roles: ['admin']
        },
      ]
    },
    {
      title: 'System Management',
      href: '/admin/system',
      icon: Settings,
      roles: ['admin'],
      description: 'System configuration and settings',
      children: [
        {
          title: 'Hospitals',
          href: '/admin/hospitals',
          icon: Building2,
          roles: ['admin']
        },
        {
          title: 'Patients',
          href: '/admin/patients',
          icon: Users,
          roles: ['admin']
        },
        {
          title: 'Drivers',
          href: '/admin/drivers',
          icon: UserCheck,
          roles: ['admin']
        },
        {
          title: 'Ambulances',
          href: '/ambulances',
          icon: Truck,
          roles: ['admin']
        },
        {
          title: 'Transport Companies',
          href: '/admin/transport-companies',
          icon: Building2,
          roles: ['admin']
        },
        {
          title: 'Database Management',
          href: '/admin/database',
          icon: Database,
          roles: ['admin']
        },
        {
          title: 'System Monitoring',
          href: '/admin/monitoring',
          icon: Activity,
          roles: ['admin']
        },
        {
          title: 'Site Settings',
          href: '/admin/site-settings',
          icon: Settings,
          roles: ['admin']
        },
        {
          title: 'Announcements',
          href: '/admin/announcements',
          icon: Megaphone,
          roles: ['admin']
        }
      ]
    },
    {
      title: 'Master Data',
      href: '/admin/master-data',
      icon: Database,
      roles: ['admin'],
      description: 'Manage location and reference data',
      children: [
        {
          title: 'Bulk Upload',
          href: '/admin/master-data/bulk-upload',
          icon: Upload,
          roles: ['admin']
        },
        {
          title: 'Countries',
          href: '/admin/master-data/countries',
          icon: Globe,
          roles: ['admin']
        },
        {
          title: 'States',
          href: '/admin/master-data/states',
          icon: MapPin,
          roles: ['admin']
        },
        {
          title: 'Cities',
          href: '/admin/master-data/cities',
          icon: Building,
          roles: ['admin']
        },
        {
          title: 'Pincodes',
          href: '/admin/master-data/pincodes',
          icon: MapPin,
          roles: ['admin']
        }
      ]
    },
    {
      title: 'Accounting',
      href: '/admin/accounting',
      icon: CreditCard,
      roles: ['admin'],
      description: 'Financial management and billing',
      children: [
        {
          title: 'Subscription Plans',
          href: '/admin/accounting/subscription-plans',
          icon: Package,
          roles: ['admin']
        },
        {
          title: 'Patient Subscriptions',
          href: '/admin/accounting/patient-subscriptions',
          icon: Users,
          roles: ['admin']
        },
        {
          title: 'Payment History',
          href: '/admin/accounting/payment-history',
          icon: Receipt,
          roles: ['admin']
        }
      ]
    },
    {
      title: 'Reports & Analytics',
      href: '/admin/reports',
      icon: BarChart3,
      roles: ['admin'],
      description: 'System-wide reports and analytics',
      children: [
        {
          title: 'Performance Analytics',
          href: '/admin/analytics',
          icon: TrendingUp,
          roles: ['admin']
        },
        {
          title: 'Data Export',
          href: '/admin/export',
          icon: Download,
          roles: ['admin']
        }
      ]
    },

  ],

  ert: [
    {
      title: 'ERT Dashboard',
      href: '/erteam/dashboard',
      icon: LayoutDashboard,
      roles: ['ert'],
      description: 'Emergency response overview'
    },
    {
      title: 'My Profile',
      href: '/erteam/profile',
      icon: User,
      roles: ['ert'],
      description: 'View and edit your profile'
    },
    {
      title: 'SOS Management',
      href: '/erteam/sos',
      icon: AlertTriangle,
      roles: ['ert'],
      description: 'Active emergency cases',
      badge: 'urgent',
      children: [
        {
          title: 'Active Cases',
          href: '/erteam/sos',
          icon: AlertTriangle,
          roles: ['ert']
        },
        {
          title: 'Case History',
          href: '/erteam/sos/history',
          icon: History,
          roles: ['ert']
        }
      ]
    },
    {
      title: 'Live Monitoring',
      href: '/erteam/monitoring',
      icon: Map,
      roles: ['ert'],
      description: 'Real-time location tracking',
      children: [
        {
          title: 'Live Map',
          href: '/erteam/map',
          icon: MapPin,
          roles: ['ert']
        },

        {
          title: 'Driver Status',
          href: '/erteam/drivers',
          icon: UserCheck,
          roles: ['ert']
        }
      ]
    },
    {
      title: 'Assignment Center',
      href: '/erteam/assignments',
      icon: Phone,
      roles: ['ert'],
      description: 'Manage driver assignments'
    },
    {
      title: 'Emergency History',
      href: '/erteam/history',
      icon: History,
      roles: ['ert'],
      description: 'Past emergency responses'
    },
    {
      title: 'Notifications',
      href: '/erteam/notifications',
      icon: Bell,
      roles: ['ert'],
      description: 'System alerts and updates'
    }
  ],

  transport_company: [
    {
      title: 'Transport Dashboard',
      href: '/transport/dashboard',
      icon: LayoutDashboard,
      roles: ['transport_company'],
      description: 'Driver operations overview'
    },
    {
      title: 'My Profile',
      href: '/transport/profile',
      icon: User,
      roles: ['transport_company'],
      description: 'View and edit your profile'
    },
    {
      title: 'Driver Management',
      href: '/transport/drivers',
      icon: UserCheck,
      roles: ['transport_company'],
      description: 'Manage your drivers',
      children: [
        {
          title: 'All Drivers',
          href: '/transport/drivers',
          icon: UserCheck,
          roles: ['transport_company']
        },
        {
          title: 'Add Driver',
          href: '/transport/drivers/add',
          icon: UserPlus,
          roles: ['transport_company']
        },
        {
          title: 'Driver Performance',
          href: '/transport/drivers/performance',
          icon: TrendingUp,
          roles: ['transport_company']
        }
      ]
    },
    {
      title: 'Assignments',
      href: '/transport/assignments',
      icon: Phone,
      roles: ['transport_company'],
      description: 'Current and past assignments'
    },

    {
      title: 'Performance Reports',
      href: '/transport/reports',
      icon: BarChart3,
      roles: ['transport_company'],
      description: 'Company performance metrics'
    }
  ],

  patient: [
    {
      title: 'My Profile',
      href: '/patient/profile',
      icon: User,
      roles: ['patient'],
      description: 'View and edit your profile'
    },
    {
      title: 'Emergency Services',
      href: '/patient/emergency',
      icon: AlertTriangle,
      roles: ['patient'],
      description: 'Request emergency assistance'
    },
    {
      title: 'My Requests',
      href: '/patient/requests',
      icon: History,
      roles: ['patient'],
      description: 'View your service requests'
    }
  ],

  driver: [
    {
      title: 'My Profile',
      href: '/driver/profile',
      icon: User,
      roles: ['driver'],
      description: 'View and edit your profile'
    },
    {
      title: 'Active Assignments',
      href: '/driver/assignments',
      icon: MapPin,
      roles: ['driver'],
      description: 'Current transport assignments'
    },
    {
      title: 'Trip History',
      href: '/driver/history',
      icon: History,
      roles: ['driver'],
      description: 'View completed trips'
    }
  ]
}

// Role-specific profile navigation items
export const getProfileNavItem = (role: UserRole): NavItem => {
  const profilePaths = {
    admin: '/admin/profile',
    ert: '/erteam/profile',
    transport_company: '/transport/profile',
    patient: '/patient/profile',
    driver: '/driver/profile'
  }

  const profileTitles = {
    admin: 'Admin Profile',
    ert: 'ERT Profile',
    transport_company: 'Company Profile',
    patient: 'Patient Profile',
    driver: 'Driver Profile'
  }

  return {
    title: profileTitles[role] || 'My Profile',
    href: profilePaths[role] || '/profile',
    icon: Settings,
    roles: [role],
    description: 'Manage your account settings'
  }
}

// Common navigation items available to all roles
export const commonNavItems: NavItem[] = []

// Get navigation items for a specific role
export function getNavigationForRole(role: UserRole | null): NavItem[] {
  if (!role) return []
  
  const roleNavigation = navigationConfig[role] || []
  return [...roleNavigation, ...commonNavItems]
}

// Get default dashboard path for role
export function getDefaultDashboardPath(role: UserRole | null): string {
  switch (role) {
    case 'admin':
      return '/admin/dashboard'
    case 'ert':
      return '/erteam/dashboard'
    case 'transport_company':
      return '/transport/dashboard'
    case 'patient':
      return '/mobile-app-required' // Redirect patients to mobile app
    case 'driver':
      return '/mobile-app-required' // Redirect drivers to mobile app
    default:
      return '/dashboard'
  }
}

// Check if user has access to a specific path
export function hasAccessToPath(userRole: UserRole | null, path: string): boolean {
  if (!userRole) return false

  // Admin users have access to all admin paths
  if (userRole === 'admin' && path.startsWith('/admin/')) {
    return true
  }

  // ERT users have access to all erteam paths
  if (userRole === 'ert' && path.startsWith('/erteam/')) {
    return true
  }

  // Transport company users have access to all transport paths
  if (userRole === 'transport_company' && path.startsWith('/transport/')) {
    return true
  }

  // Patient users should use mobile app - only allow mobile-app-required page
  if (userRole === 'patient') {
    return path === '/mobile-app-required'
  }

  // Driver users should use mobile app - only allow mobile-app-required page
  if (userRole === 'driver') {
    return path === '/mobile-app-required'
  }

  // Web users (admin, ert, transport_company) have access to profile page
  if (path === '/profile' && ['admin', 'ert', 'transport_company'].includes(userRole)) {
    return true
  }

  // Check navigation items for other paths
  const allNavItems = getNavigationForRole(userRole)

  // Check main items and children
  const hasAccess = (items: NavItem[]): boolean => {
    return items.some(item => {
      if (item.href === path) return true
      if (item.children) return hasAccess(item.children)
      return false
    })
  }

  return hasAccess(allNavItems)
}

// Get breadcrumb trail for a path
export function getBreadcrumbs(userRole: UserRole | null, path: string): NavItem[] {
  if (!userRole) return []
  
  const allNavItems = getNavigationForRole(userRole)
  const breadcrumbs: NavItem[] = []
  
  const findPath = (items: NavItem[], currentPath: NavItem[] = []): boolean => {
    for (const item of items) {
      const newPath = [...currentPath, item]
      
      if (item.href === path) {
        breadcrumbs.push(...newPath)
        return true
      }
      
      if (item.children && findPath(item.children, newPath)) {
        return true
      }
    }
    return false
  }
  
  findPath(allNavItems)
  return breadcrumbs
}
