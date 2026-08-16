import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

const envPath = path.resolve(process.cwd(), '.env.local')
let supabaseUrl = ''
let supabaseAnonKey = ''

if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8')
  for (const line of content.split('\n')) {
    if (line.startsWith('VITE_SUPABASE_URL=')) {
      supabaseUrl = line.replace('VITE_SUPABASE_URL=', '').trim()
    }
    if (line.startsWith('VITE_SUPABASE_ANON_KEY=')) {
      supabaseAnonKey = line.replace('VITE_SUPABASE_ANON_KEY=', '').trim()
    }
  }
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

async function testAll() {
  console.log('Testing full CRUD against:', supabaseUrl)

  // TEST 1: ADD SEASON
  console.log('\n--- 1. Testing addSeason ---')
  const season = {
    id: Date.now(),
    name: 'db deneme',
    city: 'Antalya',
    year: 2026,
    fullName: 'Antalya 2026 db deneme',
    seasonType: 'tournament',
    teamCount: 8,
    groupCount: null,
    bracket: null,
    league: null,
    groupLeague: null,
    parentSeasonId: null,
    isActive: true,
  }

  const { data: sData, error: sErr } = await supabase.from('seasons').insert({
    id: season.id,
    name: season.name,
    slug: slugify(season.fullName || season.name),
    is_current: season.isActive ?? true,
    city: season.city,
    year: season.year,
    full_name: season.fullName,
    season_type: season.seasonType ?? 'tournament',
    team_count: season.teamCount ?? 8,
    group_count: season.groupCount ?? null,
    bracket: season.bracket ?? null,
    league: season.league ?? null,
    group_league: season.groupLeague ?? null,
    parent_season_id: season.parentSeasonId ?? null,
  }).select()

  if (sErr) {
    console.error('❌ addSeason Error:', JSON.stringify(sErr, null, 2))
  } else {
    console.log('✅ addSeason Success:', sData)
  }

  // TEST 2: ADD TEAM
  console.log('\n--- 2. Testing addTeam ---')
  const team = {
    id: Date.now() + 1,
    name: 'ERDEM',
    shortName: 'ERD',
    countryCode: 'ES',
    countryName: 'Spain',
    color: '#63e35b',
    secondaryColor: '#071525',
    logoUrl: null,
    managerName: null,
    coachName: null,
    bio: null,
    tournamentFormat: 'Champions Cup',
    groupName: 'Group A',
  }

  const { data: tData, error: tErr } = await supabase.from('teams').insert({
    id: team.id,
    season_id: sData?.[0]?.id ?? null,
    name: team.name,
    slug: slugify(team.name),
    short_name: team.shortName ?? team.name.slice(0, 3).toUpperCase(),
    country_code: team.countryCode || 'TR',
    country_name: team.countryName || 'Turkey',
    primary_color: team.color,
    secondary_color: team.secondaryColor || '#071525',
    logo_url: team.logoUrl || null,
    manager_name: team.managerName || null,
    coach_name: team.coachName || null,
    biography: team.bio || null,
    tournament_format: team.tournamentFormat || 'Champions Cup',
    group_name: team.groupName || 'Group A',
  }).select()

  if (tErr) {
    console.error('❌ addTeam Error:', JSON.stringify(tErr, null, 2))
  } else {
    console.log('✅ addTeam Success:', tData)
  }

  // TEST 3: LOAD REMOTE
  console.log('\n--- 3. Testing loadRemote ---')
  const [seasonsRes, teamsRes, matchesRes, storiesRes, playersRes] = await Promise.all([
    supabase.from('seasons').select('*').order('created_at', { ascending: false }),
    supabase.from('teams').select('*').order('name'),
    supabase
      .from('matches')
      .select('*, home:teams!matches_home_team_id_fkey(name), away:teams!matches_away_team_id_fkey(name), match_events(*)')
      .order('kickoff_at', { ascending: true }),
    supabase.from('articles').select('*').order('published_at', { ascending: false }),
    supabase.from('players').select('*, team:teams(name)').order('full_name'),
  ])

  console.log('Seasons res error:', seasonsRes.error)
  console.log('Teams res error:', teamsRes.error)
  console.log('Matches res error:', matchesRes.error)
  console.log('Stories res error:', storiesRes.error)
  console.log('Players res error:', playersRes.error)
}

testAll()
