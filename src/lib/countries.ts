export type Country = {
  code: string
  name: string
  flag: string
}

export const COUNTRIES: Country[] = [
  { code: 'TR', name: 'Turkey', flag: '🇹🇷' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪' },
  { code: 'GB', name: 'United Kingdom', flag: '🇬🇧' },
  { code: 'NL', name: 'Netherlands', flag: '🇳🇱' },
  { code: 'FR', name: 'France', flag: '🇫🇷' },
  { code: 'ES', name: 'Spain', flag: '🇪🇸' },
  { code: 'IT', name: 'Italy', flag: '🇮🇹' },
  { code: 'PT', name: 'Portugal', flag: '🇵🇹' },
  { code: 'BE', name: 'Belgium', flag: '🇧🇪' },
  { code: 'AT', name: 'Austria', flag: '🇦🇹' },
  { code: 'CH', name: 'Switzerland', flag: '🇨🇭' },
  { code: 'PL', name: 'Poland', flag: '🇵🇱' },
  { code: 'SE', name: 'Sweden', flag: '🇸🇪' },
  { code: 'NO', name: 'Norway', flag: '🇳🇴' },
  { code: 'DK', name: 'Denmark', flag: '🇩🇰' },
  { code: 'GR', name: 'Greece', flag: '🇬🇷' },
  { code: 'RO', name: 'Romania', flag: '🇷🇴' },
  { code: 'BG', name: 'Bulgaria', flag: '🇧🇬' },
  { code: 'HR', name: 'Croatia', flag: '🇭🇷' },
  { code: 'RS', name: 'Serbia', flag: '🇷🇸' },
  { code: 'AZ', name: 'Azerbaijan', flag: '🇦🇿' },
  { code: 'KZ', name: 'Kazakhstan', flag: '🇰🇿' },
  { code: 'AE', name: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'US', name: 'United States', flag: '🇺🇸' },
]

export function getCountry(code?: string): Country {
  if (!code) return { code: 'TR', name: 'Turkey', flag: '🇹🇷' }
  const found = COUNTRIES.find((c) => c.code.toUpperCase() === code.toUpperCase())
  return found ?? { code, name: code, flag: '🌐' }
}

/**
 * A real flag bitmap for a country code, or null when the code is not a
 * plausible ISO 3166-1 alpha-2 pair.
 *
 * The cutout backdrop used to render `country.flag` — the emoji glyph — at
 * 8rem and skew it. An emoji cannot look like cloth no matter what transform
 * is applied to it, so the reference site (eurobusinesscup.com) uses flag
 * artwork instead. flagcdn serves one bitmap per country with no key and no
 * per-country asset for us to bundle, so any code we can already store gets a
 * flag without further work.
 */
export function flagImageUrl(code: string | undefined, width: 160 | 320 | 640 = 640): string | null {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`
}
