'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js'
import { getBrowserSupabase } from '@/lib/supabase/browser'
import type { UserRole } from '@/types'

export interface AppUser {
  id: string // public.users.id — the join key for every child table
  authUserId: string // auth.users.id (auth.uid())
  email: string
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  phone?: string | null
  role: UserRole
  isActive: boolean
  accountType?: string | null
}

interface AuthContextValue {
  session: Session | null
  authUser: User | null
  appUser: AppUser | null
  role: UserRole | null
  loading: boolean
  signOut: () => Promise<void>
  refetchAppUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const VALID_ROLES: UserRole[] = ['admin', 'ert', 'transport_company', 'patient', 'driver']

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const supabase = useMemo(() => getBrowserSupabase(), [])

  const [session, setSession] = useState<Session | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)
  const authUser = session?.user ?? null
  const authUserId = authUser?.id ?? null

  // Resolve the public.users row for the signed-in auth user (RLS scopes this to
  // their own row via the `sb_auth: users select own` policy).
  const fetchAppUser = useCallback(
    async (uid: string): Promise<AppUser | null> => {
      const { data, error } = await supabase
        .from('users')
        .select(
          'id, auth_user_id, email, first_name, last_name, full_name, phone, role, is_active, account_type',
        )
        .eq('auth_user_id', uid)
        .maybeSingle()

      if (error || !data) return null
      return {
        id: data.id,
        authUserId: data.auth_user_id,
        email: data.email,
        firstName: data.first_name,
        lastName: data.last_name,
        fullName: data.full_name,
        phone: data.phone,
        role: data.role as UserRole,
        isActive: data.is_active,
        accountType: data.account_type,
      }
    },
    [supabase],
  )

  // Track the auth session.
  useEffect(() => {
    let active = true

    supabase.auth.getSession().then((res: { data: { session: Session | null } }) => {
      if (!active) return
      setSession(res.data.session)
      if (!res.data.session) setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, newSession: Session | null) => {
      setSession(newSession)
      if (!newSession) {
        setAppUser(null)
        setLoading(false)
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [supabase])

  // Load the app user whenever the auth user changes.
  const lastLoadedUid = useRef<string | null>(null)
  useEffect(() => {
    let active = true
    if (!authUserId) {
      lastLoadedUid.current = null
      return
    }
    if (lastLoadedUid.current === authUserId && appUser) return

    setLoading(true)
    fetchAppUser(authUserId).then((u) => {
      if (!active) return
      lastLoadedUid.current = authUserId
      setAppUser(u)
      setLoading(false)
    })

    return () => {
      active = false
    }
  }, [authUserId, appUser, fetchAppUser])

  const refetchAppUser = useCallback(async () => {
    if (!authUserId) return
    const u = await fetchAppUser(authUserId)
    setAppUser(u)
  }, [authUserId, fetchAppUser])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSession(null)
    setAppUser(null)
    router.replace('/sign-in')
  }, [supabase, router])

  const role = useMemo<UserRole | null>(() => {
    const r = appUser?.role
    return r && VALID_ROLES.includes(r) ? r : null
  }, [appUser])

  const value: AuthContextValue = {
    session,
    authUser,
    appUser,
    role,
    loading,
    signOut,
    refetchAppUser,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}
