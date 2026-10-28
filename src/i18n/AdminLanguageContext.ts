import { createContext, useContext } from 'react'
import { translateAdmin, type AdminLanguage, type TranslationValues } from './adminLanguage'

export type AdminLanguageValue = {
  language: AdminLanguage
  setLanguage: (language: AdminLanguage) => void
  tr: (source: string, values?: TranslationValues) => string
}
export const AdminLanguageContext = createContext<AdminLanguageValue>({ language: 'en', setLanguage: () => {}, tr: (source, values) => translateAdmin('en', source, values) })
export const useAdminLanguage = () => useContext(AdminLanguageContext)
