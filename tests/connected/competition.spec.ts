import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
const workdir=process.env.CCL_TEST_WORKDIR!
if(!workdir||fs.existsSync(path.join(workdir,'supabase/.temp/project-ref')))throw new Error('Disposable local database required')
const status=JSON.parse(execFileSync('supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL))throw new Error('Refusing remote API')
const project=fs.readFileSync(path.join(workdir,'supabase/config.toml'),'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1]
if(!project)throw new Error('Local project identity required for fixture cleanup')
const container=`supabase_db_${project}`
const accounts=JSON.parse(fs.readFileSync(path.join(workdir,'credentials.private.json'),'utf8'))
const owner=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const teamIds:number[]=[]
let seasonId=0,matchId=0,playerIds:number[]=[],clubIds:number[]=[]
const stamp=`Connected ${Date.now()}`
async function login(page:Page, role:'operator'|'editor', section:string) {
 await page.goto(`/#admin/${section.toLowerCase()}`)
 await page.getByLabel('Email',{exact:true}).fill(accounts[role].email)
 await page.getByLabel('Password',{exact:true}).fill(accounts[role].password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await expect(page.getByRole('heading',{name:section,level:1,exact:true})).toBeVisible()
}
test.beforeAll(async()=>{
 const s=await owner.from('seasons').insert({name:stamp,slug:`connected-${Date.now()}`,year:2026,city:'Antalya',status:'draft',season_type:'league',starts_on:'2026-12-01'}).select('id').single()
 expect(s.error).toBeNull();seasonId=Number(s.data!.id)
 for(const side of ['HOME','AWAY']) {
  const r=await owner.rpc('create_season_entry',{entry:{season_id:seasonId,name:`${stamp} ${side}`,slug:`connected-${side.toLowerCase()}-${Date.now()}`},player_ids:[],new_players:Array.from({length:8},(_,i)=>({full_name:`${stamp} ${side} P${i+1}`,shirt_number:i+1,position:i===0?'goalkeeper':'forward'}))})
  expect(r.error).toBeNull();teamIds.push(Number(r.data))
 }
 const squads=await owner.from('squad_memberships').select('player_id').eq('season_id',seasonId);expect(squads.error).toBeNull();playerIds=squads.data!.map(r=>Number(r.player_id))
 const teams=await owner.from('teams').select('club_id').in('id',teamIds);clubIds=teams.data!.map(r=>Number(r.club_id))
 const match=await owner.from('matches').insert({season_id:seasonId,home_team_id:teamIds[0],away_team_id:teamIds[1],stage:'group',kickoff_at:'2026-12-20T15:00:00Z',publication_status:'draft'}).select('id').single()
 expect(match.error).toBeNull();matchId=Number(match.data!.id)
})
test.afterAll(async()=>{
 if(seasonId){const r=await owner.from('seasons').delete().eq('id',seasonId);expect(r.error).toBeNull()}
 if(playerIds.length){const r=await owner.from('players').delete().in('id',playerIds);expect(r.error).toBeNull()}
 if(clubIds.length){
  // Persistent identity history is internal, so remove only these disposable
  // fixtures through local SQL after their tournament/people have been removed.
  expect(clubIds.every(Number.isSafeInteger)).toBeTruthy()
  execFileSync('docker',['exec',container,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`delete from public.club_entry_identity where club_id in (${clubIds.join(',')}); delete from public.clubs where id in (${clubIds.join(',')});`],{stdio:'pipe'})
 }
})
test('operator records a registered goal, selects actual match lineups and completes play',async({page})=>{
 await login(page,'operator','Matches')
 await page.locator('.filter-bar .filter-group').filter({hasText:'Season:'}).locator('select').selectOption(String(seasonId))
 await page.getByTitle('Manage events',{exact:true}).click()
 const events=page.getByRole('dialog',{name:/Match Events Timeline:/})
 await events.getByLabel('Player',{exact:true}).selectOption({label:`#2 ${stamp} HOME P2`})
 await events.getByRole('button',{name:'Add Event to Timeline'}).click()
 await expect(events.getByRole('heading',{name:'Logged Events (1)'})).toBeVisible()
 await events.getByRole('button',{name:'Close',exact:true}).click()
 await page.getByTitle('Edit score & details',{exact:true}).click()
 const score=page.getByRole('dialog',{name:/Match Scorekeeper:/})
 await expect(score.locator('input[name=homeScore]')).toHaveValue('1')
 await expect(score.locator('input[name=homeScore]')).toHaveAttribute('readonly','')
 await expect(score.getByLabel(`Match selection for ${stamp} HOME P1`,{exact:true})).toHaveValue('starter')
 await score.getByLabel('Match Status',{exact:true}).selectOption('completed')
 expect(await score.locator('.admin-form').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy()
 expect(await score.locator('.match-lineup-fields').evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy()
 await page.screenshot({path:test.info().outputPath('selected-match-lineups.png'),fullPage:true})
 await score.getByRole('button',{name:'Save match result'}).click()
 await expect(score).toHaveCount(0)
 const stored=await owner.from('matches').select('home_score,away_score,match_status,score_source,started_at,match_squads(player_id,lineup_role,is_goalkeeper)').eq('id',matchId).single()
 expect(stored.error).toBeNull();expect(stored.data!.home_score).toBe(1);expect(stored.data!.away_score).toBe(0);expect(stored.data!.match_status).toBe('completed');expect(stored.data!.score_source).toBe('events');expect(stored.data!.started_at).toBeTruthy()
 expect(stored.data!.match_squads.filter(r=>r.lineup_role==='starter')).toHaveLength(16)
 expect(stored.data!.match_squads.filter(r=>r.is_goalkeeper)).toHaveLength(2)
 await page.reload()
 await page.locator('.filter-bar .filter-group').filter({hasText:'Season:'}).locator('select').selectOption(String(seasonId))
 await expect(page.locator('.admin-table').filter({has:page.getByTitle('Edit score & details')})).toContainText('1 - 0')
})
test('editor reads draft standings and has no competition edit shortcuts',async({page})=>{
 await login(page,'editor','Overview')
 await expect(page.locator('.quick-actions').getByRole('button',{name:'Schedule Match'})).toHaveCount(0)
 const menu=page.getByRole('button',{name:'Open admin menu',exact:true});if(await menu.isVisible())await menu.click()
 await page.getByRole('navigation',{name:'Admin sections',exact:true}).getByRole('button',{name:'Standings',exact:true}).click()
 await page.getByRole('combobox').filter({has:page.locator(`option[value="${seasonId}"]`)}).selectOption(String(seasonId))
 await expect(page.locator('.admin-shell')).toContainText(`${stamp} HOME`)
 await expect(page.getByRole('button',{name:'Generate knockout draw'})).toHaveCount(0)
})

test('operator records and revokes a tournament-specific staff suspension',async({page})=>{
 await login(page,'operator','Players')
 await page.getByRole('button',{name:`Edit player ${stamp} HOME P3`,exact:true}).click()
 const section=page.locator('.player-suspensions')
 await section.getByLabel('Duration').selectOption('matches')
 await section.getByLabel('Matches *',{exact:true}).fill('2')
 await section.getByLabel('Staff decision / reason *',{exact:true}).fill('Connected suspension verification')
 await section.getByRole('button',{name:'Record suspension'}).click()
 await expect(section.getByText(/2 of 2 matches remaining/)).toBeVisible()
 const stored=await owner.from('player_suspensions').select('season_id,match_count,reason').eq('season_id',seasonId).eq('reason','Connected suspension verification').single()
 expect(stored.error).toBeNull();expect(stored.data!.match_count).toBe(2)
 await section.getByRole('button',{name:'Revoke suspension'}).click()
 await expect(section.getByText(/Revoked/)).toBeVisible()
})
