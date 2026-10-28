export type AdminLanguage = 'en' | 'tr'
export const ADMIN_LANGUAGE_KEY = 'ccl-cup:admin-language:v1'
export type TranslationValues = Record<string, string | number | undefined | null>
export type AdminMessages = Record<string, string>

/** Only interface copy is passed here; stored names, articles and enum values stay untouched. */
export function translateAdmin(language: AdminLanguage, source: string, values: TranslationValues = {}, messages: AdminMessages = {}): string {
  const key = source.trim()
  const translated = language === 'tr' && Object.hasOwn(messages, key) ? messages[key] : undefined
  const template = translated === undefined ? source : source.slice(0, source.length - source.trimStart().length) + translated + source.slice(source.trimEnd().length)
  return template.replace(/\{([A-Za-z]\w*)\}/g, (token, key: string) => Object.hasOwn(values, key) ? String(values[key] ?? '') : token)
}

export function readAdminLanguage(): AdminLanguage {
  try { return localStorage.getItem(ADMIN_LANGUAGE_KEY) === 'tr' ? 'tr' : 'en' } catch { return 'en' }
}
