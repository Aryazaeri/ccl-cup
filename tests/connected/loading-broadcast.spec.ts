import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
const workdir=process.env.CCL_TEST_WORKDIR!
if(!workdir||fs.existsSync(path.join(workdir,'supabase/.temp/project-ref')))throw new Error('Disposable local stack required')
const status=JSON.parse(execFileSync('supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
if(!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL))throw new Error('Remote API refused')
const project=fs.readFileSync(path.join(workdir,'supabase/config.toml'),'utf8').match(/^project_id\s*=\s*"([A-Za-z0-9_-]+)"/m)?.[1]
if(!project)throw new Error('Local project identity required')
const accounts=JSON.parse(fs.readFileSync(path.join(workdir,'credentials.private.json'),'utf8'))
const owner=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const stamp=`Loading ${Date.now()}`,seasons:number[]=[],teams:number[]=[],players:number[]=[],clubs:number[]=[],matches:number[]=[],objects:string[]=[]
const tables=new Set(['seasons','teams','matches','articles','players','media_assets','sponsors','squad_memberships','clubs','club_roster'])
// Keep the dev-only fixture switcher out of the real application controls.
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{
  const style=document.createElement('style');style.textContent='nav[aria-label="Dev data fixture"]{display:none!important}';document.head.append(style)
 }))
})
test.beforeAll(async()=>{
 for(const year of [2090,2089]){
  const s=await owner.from('seasons').insert({name:`${stamp} ${year}`,slug:`loading-${randomUUID()}`,city:'Antalya',year,status:'published',season_type:'league',starts_on:`${year}-01-01`,ends_on:`${year}-12-31`}).select('id').single()
  expect(s.error).toBeNull();const sid=Number(s.data!.id);seasons.push(sid)
  const entries:number[]=[]
  for(const side of ['Home','Away']){
   const r=await owner.rpc('create_season_entry',{entry:{season_id:sid,name:`${stamp} ${year} ${side}`,slug:`loading-${randomUUID()}`},player_ids:[],new_players:Array.from({length:6},(_,i)=>({full_name:`${stamp} ${year} ${side} P${i+1}`,shirt_number:i+1,position:i===0?'goalkeeper':'forward'}))})
   expect(r.error).toBeNull();entries.push(Number(r.data));teams.push(Number(r.data))
  }
  const m=await owner.from('matches').insert({season_id:sid,home_team_id:entries[0],away_team_id:entries[1],stage:'group',kickoff_at:`${year}-12-20T15:00:00Z`,publication_status:'draft'}).select('id').single()
  expect(m.error).toBeNull();matches.push(Number(m.data!.id))
 }
 const memberships=await owner.from('squad_memberships').select('player_id').in('team_id',teams);expect(memberships.error).toBeNull();players.push(...memberships.data!.map(r=>Number(r.player_id)))
 const entries=await owner.from('teams').select('club_id').in('id',teams);clubs.push(...entries.data!.map(r=>Number(r.club_id)))
 const bytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWbQAAAAASUVORK5CYII=','base64')
 for(const team of teams.slice(0,2)){
  const object=`logos/loading-${randomUUID()}.png`;objects.push(object)
  const upload=await owner.storage.from('club-assets').upload(object,bytes,{contentType:'image/png'});expect(upload.error).toBeNull()
  const update=await owner.from('teams').update({logo_url:owner.storage.from('club-assets').getPublicUrl(object).data.publicUrl}).eq('id',team);expect(update.error).toBeNull()
 }
})
test.afterAll(async()=>{
 if(teams.length){
  const memberships=await owner.from('squad_memberships').select('player_id').in('team_id',teams)
  if(memberships.error)throw memberships.error
  for(const r of memberships.data)if(!players.includes(Number(r.player_id)))players.push(Number(r.player_id))
  const entries=await owner.from('teams').select('club_id').in('id',teams)
  if(entries.error)throw entries.error
  for(const r of entries.data)if(!clubs.includes(Number(r.club_id)))clubs.push(Number(r.club_id))
 }
 if(seasons.length){const r=await owner.from('seasons').delete().in('id',seasons);expect(r.error).toBeNull()}
 if(players.length){const r=await owner.from('players').delete().in('id',players);expect(r.error).toBeNull()}
 if(clubs.length){
  expect(clubs.every(Number.isSafeInteger)).toBeTruthy()
  execFileSync('docker',['exec',`supabase_db_${project}`,'psql','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-c',`delete from club_entry_identity where club_id in (${clubs.join(',')}); delete from clubs where id in (${clubs.join(',')});`],{stdio:'pipe'})
 }
 if(objects.length){const r=await owner.storage.from('club-assets').remove(objects);expect(r.error).toBeNull()}
})
test('public start loads one tournament in eight table reads and signs its images in one batch',async({page})=>{
 const reads:URL[]=[],signs:unknown[]=[]
 page.on('request',r=>{const url=new URL(r.url());if(url.pathname.startsWith('/rest/v1/')&&tables.has(url.pathname.split('/').pop()!))reads.push(url);if(url.pathname==='/storage/v1/object/sign/club-assets')signs.push(r.postDataJSON())})
 const started=Date.now();await page.goto('/#site')
 await expect(page.getByRole('heading',{name:'Standings',exact:true})).toBeVisible()
 await expect(page.locator('.pg-fixture').filter({hasText:`${stamp} 2090 Home`})).toBeVisible()
 expect(reads).toHaveLength(8)
 expect(reads.some(u=>['clubs','club_roster'].includes(u.pathname.split('/').pop()!))).toBeFalsy()
 for(const name of ['teams','matches','squad_memberships'])expect(reads.find(u=>u.pathname.endsWith('/'+name))?.searchParams.get('season_id')).toBe(`eq.${seasons[0]}`)
 expect(reads.find(u=>u.pathname.endsWith('/players'))?.searchParams.get('squad_memberships.season_id')).toBe(`eq.${seasons[0]}`)
 expect(signs).toHaveLength(1);expect((signs[0] as {paths:string[]}).paths).toHaveLength(2)
 console.log(JSON.stringify({viewport:test.info().project.name,publicTableReads:reads.length,signingRequests:signs.length,localReadyMs:Date.now()-started}))
 await page.locator('.season-button').click()
 await page.getByRole('option',{name:new RegExp(`${stamp} 2089`)}).click()
 await expect(page.locator('.pg-fixture').filter({hasText:`${stamp} 2089 Home`})).toBeVisible()
 await expect(page.locator('.pg-fixture').filter({hasText:`${stamp} 2090 Home`})).toHaveCount(0)
})
test('a failed tournament switch preserves the current page and Retry loads the requested tournament',async({page})=>{
 await page.goto('/#site')
 await expect(page.locator('.pg-fixture').filter({hasText:`${stamp} 2090 Home`})).toBeVisible()
 let outage=true
 // The SDK retries 503 internally. A non-retried read rejection exercises the visible Retry path.
 await page.route('**/rest/v1/matches?**',async route=>{
  const url=new URL(route.request().url())
  if(outage&&url.searchParams.get('season_id')===`eq.${seasons[1]}`)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Synthetic read rejection'})})
  await route.continue()
 })
 await page.locator('.season-button').click()
 await page.getByRole('option',{name:new RegExp(`${stamp} 2089`)}).click()
 await expect(page.getByRole('alert')).toContainText('could not be refreshed')
 await expect(page.locator('.pg-fixture').filter({hasText:`${stamp} 2090 Home`})).toBeVisible()
 outage=false
 await page.getByRole('button',{name:'Retry',exact:true}).click()
 await expect(page.locator('.pg-fixture').filter({hasText:`${stamp} 2089 Home`})).toBeVisible()
 await expect(page.getByRole('alert')).toHaveCount(0)
})

test('a shared match link opens its older published tournament',async({page})=>{
 await page.goto(`/#site/match/${matches[1]}`)
 const details=page.getByRole('dialog',{name:'Match details',exact:true})
 await expect(details).toBeVisible();await expect(details).toContainText(`${stamp} 2089 Home`)
 await expect(page.locator('.season-button')).toContainText('2089')
})
test('staff login does not fetch the tournament workspace until authenticated',async({page})=>{
 const reads:string[]=[];let profiles=0
 page.on('request',r=>{const name=new URL(r.url()).pathname.split('/').pop()!;if(tables.has(name))reads.push(name);if(name==='profiles')profiles++})
 await page.goto('/#admin/matches')
 await expect(page.getByLabel('Email',{exact:true})).toBeVisible();expect(reads).toHaveLength(0)
 await page.getByLabel('Email',{exact:true}).fill(accounts.operator.email)
 await page.getByLabel('Password',{exact:true}).fill(accounts.operator.password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await expect(page.getByRole('heading',{name:'Matches',level:1,exact:true})).toBeVisible()
 expect(profiles).toBe(1)
 for(const name of tables)expect(reads.filter(n=>n===name)).toHaveLength(1)
})
test('a scheduled match saves its YouTube URL and exposes it before kickoff',async({page})=>{
 let youtubeRequests=0
 page.on('request',r=>{if(/(^|\.)(youtube(?:-nocookie)?\.com|ytimg\.com)$/.test(new URL(r.url()).hostname))youtubeRequests++})
 await page.goto('/#admin/matches')
 await page.getByLabel('Email',{exact:true}).fill(accounts.operator.email)
 await page.getByLabel('Password',{exact:true}).fill(accounts.operator.password)
 await page.getByRole('button',{name:'Sign in',exact:true}).click()
 await page.locator('.filter-bar .filter-group').filter({hasText:'Season:'}).locator('select').selectOption(String(seasons[0]))
 await page.getByTitle('Edit score & details',{exact:true}).click()
 const edit=page.getByRole('dialog',{name:/Match Scorekeeper:/}),url='https://www.youtube.com/watch?v=jfKfPfyJRdk'
 await edit.getByLabel('Broadcast URL').fill(url)
 await expect(edit.getByLabel('Match Status',{exact:true})).toHaveValue('scheduled')
 await edit.getByRole('button',{name:'Save match result'}).click();await expect(edit).toHaveCount(0)
 const stored=await owner.from('matches').select('stream_url,match_status').eq('id',matches[0]).single()
 expect(stored.error).toBeNull();expect(stored.data).toEqual({stream_url:url,match_status:'scheduled'})
 await page.getByRole('button',{name:'View site',exact:true}).click()
 await page.locator('.pg-fixture').filter({hasText:`${stamp} 2090 Home`}).click()
 const details=page.getByRole('dialog',{name:'Match details',exact:true})
 await expect(details.getByRole('link',{name:'Open on YouTube',exact:true})).toHaveAttribute('href',url)
 await expect(details.getByRole('button',{name:/Play broadcast for/})).toBeVisible()
 await expect(details.locator('iframe')).toHaveCount(0)
 expect(youtubeRequests).toBe(0)
 let embedded=0
 await page.route('https://www.youtube-nocookie.com/embed/**',async route=>{embedded++;await route.fulfill({status:200,contentType:'text/html',body:'<html><head><title>Test broadcast</title></head><body style="background:#112337;color:white;font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0">YouTube player test</body></html>'})})
 await details.getByRole('button',{name:/Play broadcast for/}).click()
 const frame=details.locator('iframe')
 await expect(frame).toHaveAttribute('src','https://www.youtube-nocookie.com/embed/jfKfPfyJRdk?autoplay=1&playsinline=1&rel=0')
 await expect.poll(()=>embedded).toBe(1)
 await expect(frame).toBeVisible()
 await expect(frame).toHaveAttribute('referrerpolicy','strict-origin-when-cross-origin')
 expect(await details.evaluate(el=>el.scrollWidth<=el.clientWidth+1)).toBeTruthy()
 await page.screenshot({path:test.info().outputPath('scheduled-broadcast-player.png')})
 await details.getByRole('button',{name:'Close',exact:true}).click()
 const banner=page.locator('main .pg-broadcast')
 await expect(banner).toContainText('Scheduled broadcast')
 await expect(banner.locator('iframe')).toHaveCount(0)
 await banner.scrollIntoViewIfNeeded()
 await page.screenshot({path:test.info().outputPath('scheduled-broadcast-banner.png')})
 await banner.getByRole('button',{name:/Play broadcast for/}).click()
 await expect(banner.locator('iframe')).toBeVisible()
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy()

})
