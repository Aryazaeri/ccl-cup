import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

export type UserRole = 'super_admin' | 'admin' | 'editor' | 'match_operator' | 'viewer'
export type AuthProfile = { id: string; fullName: string; email: string; role: UserRole }

type AuthContextValue = {
  loading: boolean
  profile: AuthProfile | null
  backend: 'supabase' | 'local-demo'
  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)
const demoSessionKey = 'ccl-cup:demo-session:v1'

/**
 * Credentials for the offline prototype only. They are accepted solely when no
 * Supabase project is configured, so they can never unlock real data.
 */
export const DEMO_EMAIL = 'demo@ccl.local'
export const DEMO_PASSWORD = 'demo1234'

/** Roles permitted to manage each area of the admin panel. */
export const PERMISSIONS = {
  seasons: ['super_admin', 'admin'],
  teams: ['super_admin', 'admin', 'match_operator'],
  players: ['super_admin', 'admin', 'match_operator'],
  matches: ['super_admin', 'admin', 'match_operator'],
  standings: ['super_admin', 'admin', 'match_operator', 'editor'],
  content: ['super_admin', 'admin', 'editor'],
  media: ['super_admin', 'admin', 'editor'],
  sponsors: ['super_admin', 'admin', 'editor'],
  users: ['super_admin', 'admin'],
} as const satisfies Record<string, readonly UserRole[]>

export type PermissionArea = keyof typeof PERMISSIONS

/**
 * Mirrors the database's row-level security in the UI.
 *
 * This is presentation only — RLS remains the real boundary. Its purpose is to
 * stop the panel from offering an editor a "Delete club" button that the
 * database is going to reject anyway.
 */
export function can(role: UserRole | undefined, area: PermissionArea): boolean {
  if (!role) return false
  return (PERMISSIONS[area] as readonly UserRole[]).includes(role)
}

async function fetchProfile(user: User): Promise<AuthProfile> {
  if (!supabase) throw new Error('Supabase is not configured.')
  const { data, error } = await supabase.from('profiles').select('full_name,role').eq('id', user.id).single()
  if (error) throw error
  return { id: user.id, fullName: data.full_name || user.email || 'CCL User', email: user.email ?? '', role: data.role as UserRole }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<AuthProfile | null>(null)

  useEffect(() => {
    if (!supabase) {
      const saved = localStorage.getItem(demoSessionKey)
      if (saved) {
        try { setProfile(JSON.parse(saved) as AuthProfile) }
        catch { localStorage.removeItem(demoSessionKey) }
      }
      setLoading(false)
      return
    }

    let mounted = true
    supabase.auth.getUser().then(async ({ data }) => {
      if (!mounted) return
      if (data.user) {
        try { setProfile(await fetchProfile(data.user)) } catch { setProfile(null) }
      }
      setLoading(false)
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return
      if (!session?.user) {
        setProfile(null)
        setLoading(false)
        return
      }
      queueMicrotask(() => fetchProfile(session.user).then(setProfile).catch(() => setProfile(null)).finally(() => setLoading(false)))
    })
    return () => { mounted = false; listener.subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    loading,
    profile,
    backend: isSupabaseConfigured ? 'supabase' : 'local-demo',
    async signIn(email, password) {
      setLoading(true)
      const cleanEmail = email.trim().toLowerCase()
      const cleanPassword = password.trim()

      try {
        // When a real project is configured, Supabase Auth is the ONLY way in.
        // There is deliberately no local fallback here: a hardcoded credential
        // that still worked against a live database would be a backdoor into
        // production, not a convenience.
        if (supabase) {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password: cleanPassword,
          })
          if (error) throw new Error(error.message)
          if (!data.user) throw new Error('Invalid email or password.')
          setProfile(await fetchProfile(data.user))
          return
        }

        // Local mode only — no backend, no real data, nothing to protect.
        if (cleanEmail === DEMO_EMAIL && cleanPassword === DEMO_PASSWORD) {
          const demoProfile: AuthProfile = {
            id: 'local-demo-admin',
            fullName: 'Local Demo Admin',
            email: cleanEmail,
            role: 'super_admin',
          }
          localStorage.setItem(demoSessionKey, JSON.stringify(demoProfile))
          setProfile(demoProfile)
          return
        }

        throw new Error('Invalid email or password.')
      } finally {
        setLoading(false)
      }
    },
    async signOut() {
      if (supabase) await supabase.auth.signOut()
      localStorage.removeItem(demoSessionKey)
      setProfile(null)
    },
  }), [loading, profile])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider.')
  return value
}

export function canAccessAdmin(role: UserRole) {
  return role !== 'viewer'
}
