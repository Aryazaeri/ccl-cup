import { Languages } from 'lucide-react'
import { useAdminLanguage } from '../i18n/AdminLanguageContext'
import type { AdminLanguage } from '../i18n/adminLanguage'

export function AdminLanguageSwitch() {
  const { language, setLanguage, tr } = useAdminLanguage()
  return <label className="admin-language-switch">
    <Languages size={16} aria-hidden="true" />
    <span>{tr('Language')}</span>
    <select aria-label={tr('Admin language')} value={language} onChange={(e) => setLanguage(e.target.value as AdminLanguage)}>
      <option value="en" lang="en">English</option>
      <option value="tr" lang="tr">Türkçe</option>
    </select>
  </label>
}
