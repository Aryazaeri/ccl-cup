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
  console.log('Testing inserting Free Agent player (team_id: null)...')
  const { data, error } = await supabase.from('players').insert({
    team_id: null,
    full_name: 'erdem can kahveci',
    shirt_number: 36,
    position: 'forward',
    strong_foot: 'right',
    nationality: 'TR',
    is_captain: true,
    active_seasons: ['2027 - Ankara 2027 UCL-eque'],
    goals: 0,
    assists: 0,
  }).select()

  if (error) {
    console.error('❌ Insert error:', error)
  } else {
    console.log('✅ Insert SUCCESS! Player created:', data)
  }
}

test()
