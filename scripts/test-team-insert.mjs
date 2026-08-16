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
  console.log('Testing team insert...')
  const testTeam = {
    name: 'ERDEM',
    slug: 'erdem-' + Date.now(),
    short_name: 'ERD',
    country_code: 'ES',
    country_name: 'Spain',
    primary_color: '#63e35b',
    secondary_color: '#071525',
    logo_url: null,
    manager_name: null,
    coach_name: null,
    biography: null,
    tournament_format: 'Champions Cup',
    group_name: 'Group A',
    played: 0,
    goal_difference: 0,
    points: 0,
  }

  const { data, error } = await supabase.from('teams').insert(testTeam).select()
  if (error) {
    console.error('❌ Insert team error:', JSON.stringify(error, null, 2))
  } else {
    console.log('✅ Insert team successful!', data)
  }
}

test()
