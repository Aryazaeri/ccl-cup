export type PresetLogo = {
  id: string
  name: string
  category: 'shields' | 'animals' | 'classic' | 'modern'
  svg: string
}

// Generate high quality SVG Data URLs for preset emblems
function makeSvgDataUri(svgContent: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent.trim())}`
}

export const PRESET_LOGOS: { id: string; name: string; url: string; category: string }[] = [
  {
    id: 'crest-lion',
    name: 'Aslan Şampiyon Arma',
    category: 'animals',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <path d="M50 5 L88 20 L80 75 L50 95 L20 75 L12 20 Z" fill="#0f172a" stroke="#eab308" stroke-width="3"/>
        <path d="M50 12 L80 24 L74 70 L50 86 L26 70 L20 24 Z" fill="#1e293b"/>
        <circle cx="50" cy="45" r="22" fill="#eab308"/>
        <path d="M42 36 C42 36 46 32 50 32 C54 32 58 36 58 36 C58 36 62 40 62 46 C62 54 50 62 50 62 C50 62 38 54 38 46 C38 40 42 36 42 36 Z" fill="#0f172a"/>
        <circle cx="46" cy="42" r="2" fill="#eab308"/>
        <circle cx="54" cy="42" r="2" fill="#eab308"/>
        <polygon points="50,22 53,28 60,29 55,34 56,41 50,37 44,41 45,34 40,29 47,28" fill="#eab308"/>
      </svg>
    `),
  },
  {
    id: 'crest-eagle',
    name: 'Kartal Güç Arma',
    category: 'animals',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <polygon points="50,5 90,25 82,80 50,95 18,80 10,25" fill="#1e1b4b" stroke="#38bdf8" stroke-width="3"/>
        <path d="M50 16 L78 28 L72 72 L50 85 L28 72 L22 28 Z" fill="#0f172a"/>
        <path d="M50 30 L65 42 L60 52 L50 48 L40 52 L35 42 Z" fill="#38bdf8"/>
        <path d="M50 48 L56 65 L50 62 L44 65 Z" fill="#e0f2fe"/>
        <polygon points="50,20 54,26 62,27 56,32 58,40 50,35 42,40 44,32 38,27 46,26" fill="#38bdf8"/>
      </svg>
    `),
  },
  {
    id: 'crest-crown',
    name: 'Kraliyet Tacı Arma',
    category: 'classic',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <path d="M50 6 L85 22 L78 78 L50 94 L22 78 L15 22 Z" fill="#831843" stroke="#f472b6" stroke-width="3"/>
        <path d="M50 14 L78 28 L72 72 L50 86 L28 72 L22 28 Z" fill="#500724"/>
        <path d="M30 58 L30 45 L40 52 L50 38 L60 52 L70 45 L70 58 Z" fill="#f472b6"/>
        <circle cx="30" cy="42" r="3" fill="#fbcfe8"/>
        <circle cx="50" cy="35" r="4" fill="#fbcfe8"/>
        <circle cx="70" cy="42" r="3" fill="#fbcfe8"/>
        <rect x="30" y="60" width="40" height="6" rx="2" fill="#fbcfe8"/>
      </svg>
    `),
  },
  {
    id: 'crest-star',
    name: 'Yıldız Atletik Arma',
    category: 'modern',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="44" fill="#042f2e" stroke="#2dd4bf" stroke-width="3"/>
        <circle cx="50" cy="50" r="36" fill="#134e4a"/>
        <polygon points="50,22 57,38 74,39 61,50 66,66 50,56 34,66 39,50 26,39 43,38" fill="#2dd4bf"/>
        <circle cx="50" cy="50" r="8" fill="#042f2e"/>
      </svg>
    `),
  },
  {
    id: 'crest-shield-lightning',
    name: 'Yıldırım Kalkanı',
    category: 'modern',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <path d="M50 5 L88 20 L80 75 L50 95 L20 75 L12 20 Z" fill="#18181b" stroke="#f59e0b" stroke-width="3"/>
        <path d="M50 12 L80 24 L74 70 L50 86 L26 70 L20 24 Z" fill="#27272a"/>
        <polygon points="54,26 36,52 48,52 44,74 64,46 52,46" fill="#fbbf24"/>
      </svg>
    `),
  },
  {
    id: 'crest-soccer-ball',
    name: 'Klasik Futbol Kalkanı',
    category: 'classic',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <path d="M50 5 L85 18 L76 74 L50 95 L24 74 L15 18 Z" fill="#1e3a8a" stroke="#60a5fa" stroke-width="3"/>
        <circle cx="50" cy="50" r="24" fill="#ffffff"/>
        <polygon points="50,38 58,44 55,54 45,54 42,44" fill="#1e3a8a"/>
        <path d="M50 38 L50 26 M58 44 L68 40 M55 54 L62 62 M45 54 L38 62 M42 44 L32 40" stroke="#1e3a8a" stroke-width="2.5"/>
      </svg>
    `),
  },
  {
    id: 'crest-flame',
    name: 'Ateş Meşale Arma',
    category: 'modern',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <path d="M50 6 L86 24 L78 78 L50 94 L22 78 L14 24 Z" fill="#431407" stroke="#ea580c" stroke-width="3"/>
        <path d="M50 14 L78 28 L72 72 L50 86 L28 72 L22 28 Z" fill="#1c1917"/>
        <path d="M50 24 C50 24 64 42 64 54 C64 62 58 68 50 68 C42 68 36 62 36 54 C36 42 50 24 50 24 Z" fill="#ea580c"/>
        <path d="M50 38 C50 38 58 48 58 56 C58 61 54 64 50 64 C46 64 42 61 42 56 C42 48 50 38 50 38 Z" fill="#fbbf24"/>
      </svg>
    `),
  },
  {
    id: 'crest-diamond',
    name: 'Elmas Armada',
    category: 'modern',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <polygon points="50,6 94,50 50,94 6,50" fill="#14532d" stroke="#4ade80" stroke-width="3"/>
        <polygon points="50,16 84,50 50,84 16,50" fill="#052e16"/>
        <polygon points="50,30 70,50 50,70 30,50" fill="#4ade80"/>
        <polygon points="50,38 62,50 50,62 38,50" fill="#052e16"/>
      </svg>
    `),
  },
  {
    id: 'crest-corporate-v',
    name: 'Zafer & Vizyon Arma',
    category: 'classic',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <path d="M50 5 L88 20 L80 75 L50 95 L20 75 L12 20 Z" fill="#022c22" stroke="#10b981" stroke-width="3"/>
        <path d="M30 32 L50 68 L70 32 L60 32 L50 52 L40 32 Z" fill="#10b981"/>
        <polygon points="50,18 53,24 60,25 55,30 56,37 50,33 44,37 45,30 40,25 47,24" fill="#34d399"/>
      </svg>
    `),
  },
  {
    id: 'crest-phoenix',
    name: 'Zümrüdüanka Arma',
    category: 'animals',
    url: makeSvgDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" fill="none">
        <circle cx="50" cy="50" r="44" fill="#3b0764" stroke="#c084fc" stroke-width="3"/>
        <circle cx="50" cy="50" r="36" fill="#1e1b4b"/>
        <path d="M50 25 C50 25 60 38 72 38 C65 48 55 48 50 68 C45 48 35 48 28 38 C40 38 50 25 50 25 Z" fill="#c084fc"/>
        <circle cx="50" cy="36" r="4" fill="#fae8ff"/>
      </svg>
    `),
  },
]
