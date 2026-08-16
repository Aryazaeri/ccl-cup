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

console.log('--- Testing Supabase Connection ---')
console.log('URL:', supabaseUrl)
console.log('Key length:', supabaseAnonKey ? supabaseAnonKey.length : 0)

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERROR: Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  try {
    console.log('\n1. Querying "seasons" table...')
    const seasonsRes = await supabase.from('seasons').select('*').limit(5)
    if (seasonsRes.error) {
      console.error('❌ Seasons query error:', seasonsRes.error)
    } else {
      console.log('✅ Seasons query successful! Rows found:', seasonsRes.data.length)
      if (seasonsRes.data.length > 0) {
        console.log('Sample season:', seasonsRes.data[0])
      }
    }

    console.log('\n2. Querying "teams" table...')
    const teamsRes = await supabase.from('teams').select('*').limit(5)
    if (teamsRes.error) {
      console.error('❌ Teams query error:', teamsRes.error)
    } else {
      console.log('✅ Teams query successful! Rows found:', teamsRes.data.length)
    }

    console.log('\n3. Testing insert into "seasons"...')
    const testSeasonId = Date.now()
    const insertRes = await supabase.from('seasons').insert({
      name: 'Connection Test Cup',
      slug: 'connection-test-cup-' + testSeasonId,
      city: 'Antalya',
      year: 2026,
      full_name: 'Antalya 2026 Connection Test Cup',
      season_type: 'tournament',
      team_count: 8,
      is_current: false,
    }).select()

    if (insertRes.error) {
      console.error('❌ Insert season test failed:', insertRes.error)
    } else {
      console.log('✅ Insert test succeeded! Created ID:', insertRes.data[0]?.id)

      // Clean up test row
      if (insertRes.data[0]?.id) {
        await supabase.from('seasons').delete().eq('id', insertRes.data[0].id)
        console.log('🧹 Cleaned up test record.')
      }
    }

  } catch (err) {
    console.error('❌ Unexpected connection error:', err)
  }
}

test()
