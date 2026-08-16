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

async function test() {
  console.log('Fetching seasons...')
  const { data: seasons, error: sErr } = await supabase.from('seasons').select('*')
  console.log('Seasons in DB:', seasons?.map(s => ({ id: s.id, name: s.name, year: s.year })))

  const targetSeason = seasons?.[0]
  console.log('Testing team insert ARYA with season_id:', targetSeason?.id)

  const uniqueSlug = `${slugify('ARYA')}-${Date.now().toString(36)}`
  const { data: tData, error: tErr } = await supabase.from('teams').insert({
    name: 'ARYA',
    slug: uniqueSlug,
    short_name: 'ARY',
    country_code: 'FR',
    country_name: 'France',
    primary_color: '#63e35b',
    secondary_color: '#071525',
    logo_url: null,
    manager_name: null,
    coach_name: null,
    biography: null,
    tournament_format: 'Champions Cup',
    group_name: null,
    season_id: targetSeason?.id ?? null,
  }).select()

  if (tErr) {
    console.error('❌ Insert ARYA error:', JSON.stringify(tErr, null, 2))
  } else {
    console.log('✅ Insert ARYA Success:', tData)
  }
}

test()
