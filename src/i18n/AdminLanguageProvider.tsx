import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { ADMIN_LANGUAGE_KEY, readAdminLanguage, translateAdmin, type AdminLanguage, type AdminMessages } from './adminLanguage'
import { AdminLanguageContext, type AdminLanguageValue } from './AdminLanguageContext'

export function AdminLanguageProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [preference, setPreference] = useState<AdminLanguage>(readAdminLanguage)
  const [messages, setMessages] = useState<AdminMessages>({})
  const [loadError, setLoadError] = useState(false)
  const loadTurkish = useCallback(() => {
    void import('./admin.tr.json').then((module) => { setMessages(module.default); setLoadError(false) }).catch(() => setLoadError(true))
  }, [])
  useEffect(() => { if (enabled) loadTurkish() }, [enabled, loadTurkish])
  const language = enabled ? preference : 'en'
  useEffect(() => {
    const previous = document.documentElement.lang
    document.documentElement.lang = language
    return () => { document.documentElement.lang = previous }
  }, [language])
  const value = useMemo<AdminLanguageValue>(() => ({
    language,
    setLanguage(next) {
      setPreference(next)
      try { localStorage.setItem(ADMIN_LANGUAGE_KEY, next) } catch { /* Language switching still works when storage is unavailable. */ }
    },
    tr: (source, values) => translateAdmin(language, source, values, messages),
  }), [language, messages])
  return <AdminLanguageContext.Provider value={value}>{enabled && preference === 'tr' && loadError && <p className="admin-language-error" role="alert" lang="tr">Türkçe yüklenemedi. <button type="button" onClick={() => window.location.reload()}>Sayfayı yeniden yükle</button></p>}{children}</AdminLanguageContext.Provider>
}
