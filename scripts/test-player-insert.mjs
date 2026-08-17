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

async function test() {
  console.log('Fetching teams...')
  const { data: teams, error: tErr } = await supabase.from('teams').select('*')
  console.log('Teams in DB:', teams?.map(t => ({ id: t.id, name: t.name })))

  const targetTeam = teams?.[0]
  console.log('Testing player insert for team:', targetTeam?.name, 'ID:', targetTeam?.id)

  const testPlayer = {
    team_id: targetTeam?.id ?? null,
    full_name: 'Test Player',
    shirt_number: 10,
    position: 'forward',
    strong_foot: 'right',
    nationality: 'TR',
    is_captain: false,
    active_seasons: ['2026 - Summer League'],
    goals: 0,
    assists: 0,
  }

  const { data: pData, error: pErr } = await supabase.from('players').insert(testPlayer).select()
  if (pErr) {
    console.error('❌ Insert player error:', JSON.stringify(pErr, null, 2))
  } else {
    console.log('✅ Insert player Success:', pData)
  }
}

test()
