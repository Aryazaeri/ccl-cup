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
        if (supabase) {
          try {
            const { data, error } = await supabase.auth.signInWithPassword({
              email: cleanEmail,
              password: cleanPassword,
            })
            if (!error && data.user) {
              setProfile(await fetchProfile(data.user))
              return
            }
          } catch (sbErr) {
            if (cleanEmail !== 'admin@ccl.test' || cleanPassword !== 'demo1234') {
              throw sbErr
            }
          }
        }

        if (cleanEmail === 'admin@ccl.test' && cleanPassword === 'demo1234') {
          const demoProfile: AuthProfile = {
            id: 'local-demo-admin',
            fullName: 'Arya Zaeri',
            email: cleanEmail,
            role: 'super_admin',
          }
          localStorage.setItem(demoSessionKey, JSON.stringify(demoProfile))
          setProfile(demoProfile)
          return
        }

        throw new Error('Invalid email or password. Use demo credentials: admin@ccl.test / demo1234')
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
