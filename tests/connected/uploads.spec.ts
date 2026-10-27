import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const workdir = process.env.CCL_TEST_WORKDIR!
if (!workdir || fs.existsSync(path.join(workdir,'supabase/.temp/project-ref'))) throw new Error('Disposable local stack required')
const status = JSON.parse(execFileSync('supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL)) throw new Error('Non-local API refused')
const accounts = JSON.parse(fs.readFileSync(path.join(workdir,'credentials.private.json'),'utf8'))
const owner = createClient(status.API_URL,status.SERVICE_ROLE_KEY ?? status.SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const image = { name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWbQAAAAASUVORK5CYII=','base64') }
const objects = new Set<string>(), titles = new Set<string>()
const objectPath = (url:string) => decodeURIComponent(new URL(url).pathname.split('/club-assets/')[1])
async function present(object:string) {
  const [folder,name] = object.split('/')
  const r = await owner.storage.from('club-assets').list(folder,{search:name})
  if(r.error) throw new Error(r.error.message)
  return r.data.some((r) => r.name===name)
}
async function openStory(page:Page) {
  await page.goto('/#admin/content')
  await page.getByLabel('Email',{exact:true}).fill(accounts.super_one.email)
  await page.getByLabel('Password',{exact:true}).fill(accounts.super_one.password)
  await page.getByRole('button',{name:'Sign in',exact:true}).click()
  await expect(page.getByRole('heading',{name:'Content',level:1,exact:true})).toBeVisible()
  await page.getByRole('button',{name:/New Story|Write Story|Write Article/}).click()
  const dialog=page.getByRole('dialog',{name:'Write New Story',exact:true})
  const title=`Upload regression ${Date.now()} ${Math.random().toString(36).slice(2,6)}`
  titles.add(title)
  await dialog.getByLabel('Headline / Title *',{exact:true}).fill(title)
  await expect(dialog.getByRole('combobox',{name:/Publication Status/})).toHaveValue('Draft')
  return {dialog,title}
}
async function upload(page:Page,dialog:ReturnType<Page['getByRole']>) {
  const uploaded=page.waitForResponse((r) => r.url().includes('/storage/v1/object/club-assets/articles/') && r.request().method()==='POST')
  await dialog.locator('input[type=file]').setInputFiles(image)
  const response=await uploaded
  expect(response.ok()).toBeTruthy()
  const object=objectPath(response.url());objects.add(object)
  await expect(dialog.getByRole('button',{name:'Upload',exact:true})).toBeEnabled()
  return object
}
test.afterEach(async () => {
  for(const title of titles) { const r=await owner.from('articles').delete().eq('title',title);if(r.error) throw new Error(r.error.message) }
  if(objects.size) { const r=await owner.storage.from('club-assets').remove([...objects]);if(r.error) throw new Error(r.error.message) }
  for(const object of objects) expect(await present(object)).toBeFalsy()
  objects.clear();titles.clear()
})
test('closing during upload removes the late receipt',async ({page}) => {
  const {dialog}=await openStory(page)
  let release!:()=>void, signal!:()=>void, object=''
  const gate=new Promise<void>((r)=>{release=r}), started=new Promise<void>((r)=>{signal=r})
  await page.route('**/storage/v1/object/club-assets/articles/**',async(route)=>{
    if(route.request().method()!=='POST') return route.continue()
    object=objectPath(route.request().url());objects.add(object);signal();await gate;await route.continue()
  })
  const completed=page.waitForResponse((r)=>r.url().includes('/storage/v1/object/club-assets/articles/') && r.request().method()==='POST')
  await dialog.locator('input[type=file]').setInputFiles(image);await started
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
  await expect(dialog).toHaveCount(0);release();await completed
  await expect.poll(()=>present(object)).toBeFalsy()
})
test('Escape, X and backdrop cannot close a pending save; committed image survives',async ({page})=>{
  const {dialog,title}=await openStory(page), object=await upload(page,dialog)
  let release!:()=>void,signal!:()=>void
  const gate=new Promise<void>((r)=>{release=r}),started=new Promise<void>((r)=>{signal=r})
  await page.route('**/rest/v1/articles',async(route)=>{
    if(route.request().method()!=='POST') return route.continue()
    signal();await gate;await route.continue()
  })
  await dialog.getByRole('button',{name:'Save Draft',exact:true}).click();await started
  await page.keyboard.press('Escape');await expect(dialog).toBeVisible()
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeDisabled()
  release();await expect(dialog).toHaveCount(0)
  const row=await owner.from('articles').select('cover_image_url,status').eq('title',title).single()
  expect(row.error).toBeNull();expect(row.data?.status).toBe('draft');expect(row.data?.cover_image_url).not.toContain('?token=')
  expect(await present(object)).toBeTruthy()
})
test('a definitive rejected save cleans its unused image after cancellation',async ({page})=>{
  const {dialog}=await openStory(page),object=await upload(page,dialog)
  await page.route('**/rest/v1/articles',async(route)=>route.request().method()==='POST'
    ? route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({code:'42501',message:'Synthetic rejected save'})}) : route.continue())
  await dialog.getByRole('button',{name:'Save Draft',exact:true}).click()
  await expect(dialog.getByText('Synthetic rejected save',{exact:true})).toBeVisible()
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
  await expect.poll(()=>present(object)).toBeFalsy()
})
test('ambiguous network failure retains image for a possible late commit',async ({page})=>{
  const {dialog,title}=await openStory(page),object=await upload(page,dialog)
  const canonical=await dialog.locator('input[type=hidden][name=coverImageUrl]').inputValue()
  await page.route('**/rest/v1/articles',async(route)=>route.request().method()==='POST' ? route.abort('failed') : route.continue())
  await dialog.getByRole('button',{name:'Save Draft',exact:true}).click()
  await expect(dialog.getByRole('button',{name:'Cancel',exact:true})).toBeEnabled()
  await dialog.getByRole('button',{name:'Cancel',exact:true}).click()
  expect(await present(object)).toBeTruthy()
  const committed=await owner.from('articles').insert({title,slug:`late-regression-${Date.now()}`,status:'draft',cover_image_url:canonical})
  expect(committed.error).toBeNull();expect(await present(object)).toBeTruthy()
})
