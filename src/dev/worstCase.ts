/**
 * Dev-only stress data for the public site (break-ui).
 *
 * Open the site with `?data=worst`, `?data=empty` or `?data=one` before the
 * hash, e.g. http://127.0.0.1:5173/?data=worst#site. The fixture replaces what
 * the repository loads, so the components see it exactly as they see real
 * data. Every value is something a real club, player or editor could enter:
 * the database puts no length limit on any of these text columns.
 *
 * Imported only behind `import.meta.env.DEV`, so none of it ships.
 */
import type { TournamentData } from '../services/tournamentRepository'

export type FixtureKind = 'worst' | 'empty' | 'one'

export const FIXTURE_KINDS: FixtureKind[] = ['worst', 'empty', 'one']

// Demo club name -> worst-case name. Real naming patterns: a long German
// compound with no break opportunity, a long multi-word holding company, a
// three-letter club, Vietnamese and Turkish diacritics.
const CLUB_NAMES: Record<string, string> = {
  'NOVA FC': 'RÜCKVERSICHERUNGSGESELLSCHAFT',
  MARMARA: 'Northwind Industries Holdings Europe',
  UNION: 'AXA',
  NORTHSIDE: 'Nguyễn & Partners Hà Nội FC',
  BOSPHORUS: 'İş Yatırım Menkul Değerler Spor Kulübü',
}

const PLAYER_NAMES = [
  'Aleksandra Wiśniewska-Kowalczyk',
  'Jo',
  'Muhammed Emin Karadağlıoğlu',
  'Nguyễn Thị Phương Thảo',
  'Bartholomew Fitzgerald-Montgomery III',
]

const club = (name: string) => CLUB_NAMES[name] ?? name

function worst(base: TournamentData): TournamentData {
  const seasons = base.seasons.map((s) => (s.year === 2026 ? { ...s, city: 'Frankfurt am Main' } : s))

  const teams = base.teams.map((t) => ({
    ...t,
    name: club(t.name),
    // ATLAS SK keeps its name but loses its country and logo.
    countryCode: t.name === 'ATLAS SK' ? '' : t.countryCode,
    logoUrl: t.name === 'ATLAS SK' ? undefined : t.logoUrl,
  }))

  // Events carry their own copy of the player and club names, so rename those too.
  const renamed = new Map<string, string>()
  const players = base.players.map((p, i) => {
    const fullName = i < PLAYER_NAMES.length ? PLAYER_NAMES[i] : p.fullName
    renamed.set(p.fullName, fullName)
    return { ...p, teamName: club(p.teamName), fullName }
  })

  let completedSeen = 0
  const matches = base.matches.map((m) => {
    const events = (m.events ?? []).map((e) => ({
      ...e,
      teamName: club(e.teamName),
      playerName: renamed.get(e.playerName) ?? e.playerName,
    }))
    const next = { ...m, home: club(m.home), away: club(m.away), events }
    if (m.matchStatus !== 'completed') {
      return { ...next, venue: 'Pitch 3 · Sportpark Hohe Warte Nordkurve Ost', stage: 'Quarter-final' }
    }
    completedSeen += 1
    // One double-digit scoreline, one goalless draw settled on a long shootout.
    if (completedSeen === 1) return { ...next, homeScore: 12, awayScore: 11 }
    if (completedSeen === 2) return { ...next, homeScore: 0, awayScore: 0, homePenalties: 10, awayPenalties: 9 }
    return next
  })

  const stories = base.stories.map((s, i) =>
    i === 0
      ? {
          ...s,
          summary: undefined,
          coverImageUrl: undefined,
          title:
            'Rückversicherungsgesellschaft and Northwind Industries Holdings Europe share the points after a 12–11 thriller that went to the very last kick of the evening',
        }
      : i === 1
        ? { ...s, title: 'Draw' }
        : s,
  )

  return { ...base, seasons, teams, players, matches, stories }
}

function empty(base: TournamentData): TournamentData {
  return { ...base, teams: [], players: [], matches: [], stories: [], media: [], sponsors: [] }
}

function one(base: TournamentData): TournamentData {
  const [home, away] = base.teams
  const players = base.players.filter((p) => p.teamId === home.id).slice(0, 1)
  const scorer = players[0]
  const match = {
    ...base.matches.find((m) => m.matchStatus === 'completed')!,
    home: home.name,
    away: away.name,
    homeScore: 1,
    awayScore: 0,
    homePenalties: undefined,
    awayPenalties: undefined,
    events: scorer
      ? [{ id: 1, matchId: 0, teamId: home.id, teamName: home.name, playerName: scorer.fullName, eventType: 'goal' as const, minute: 9 }]
      : [],
  }
  return { ...base, teams: [home, away], players, matches: [match], stories: base.stories.slice(0, 1) }
}

export function fixture(kind: string, base: TournamentData): TournamentData {
  if (kind === 'empty') return empty(base)
  if (kind === 'one') return one(base)
  return worst(base)
}

/** Bottom-centre segmented control; plain on purpose, it is not part of the design. */
export function mountToggle() {
  const current = new URLSearchParams(location.search).get('data') ?? 'demo'
  const bar = document.createElement('nav')
  bar.setAttribute('aria-label', 'Dev data fixture')
  bar.style.cssText =
    'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:9999;display:flex;gap:2px;padding:3px;border-radius:999px;background:#d4d4d4;font:500 12px system-ui;box-shadow:0 2px 8px rgba(0,0,0,.2)'
  for (const kind of ['demo', ...FIXTURE_KINDS]) {
    const link = document.createElement('a')
    const url = new URL(location.href)
    if (kind === 'demo') url.searchParams.delete('data')
    else url.searchParams.set('data', kind)
    link.href = url.toString()
    link.textContent = kind === 'demo' ? 'Demo data' : kind === 'worst' ? 'Worst case' : kind === 'empty' ? 'Empty' : 'One'
    link.style.cssText = `padding:5px 12px;border-radius:999px;color:#171717;text-decoration:none;${kind === current ? 'background:#fff' : ''}`
    bar.append(link)
  }
  document.body.append(bar)

  // Second row: switch between the redesign vibes.
  const currentVibe = new URLSearchParams(location.search).get('vibe') ?? 'programme'
  const vibes = bar.cloneNode(false) as HTMLElement
  vibes.setAttribute('aria-label', 'Design vibe')
  vibes.style.bottom = '52px'
  for (const [key, label] of [['programme', 'Current'], ['sport', 'Sports app'], ['zine', 'Fanzine'], ['night', 'Night match'], ['terrace', 'Terrace print']]) {
    const link = document.createElement('a')
    const url = new URL(location.href)
    if (key === 'programme') url.searchParams.delete('vibe')
    else url.searchParams.set('vibe', key)
    link.href = url.toString()
    link.textContent = label
    link.style.cssText = `padding:5px 12px;border-radius:999px;color:#171717;text-decoration:none;${key === currentVibe ? 'background:#fff' : ''}`
    vibes.append(link)
  }
  document.body.append(vibes)
}
