// Real Auth/Storage regression against the explicitly selected isolated stack.
// No production credentials, project .env files, or application data are read.
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createServer } from 'vite'
import { createClient } from '@supabase/supabase-js'
import assert from 'node:assert/strict'

const workdir = process.env.CCL_TEST_WORKDIR
assert.ok(workdir, 'Set CCL_TEST_WORKDIR to the disposable local Supabase workdir')
assert.ok(!fs.existsSync(path.join(workdir, 'supabase/.temp/project-ref')), 'Refuse a linked project')
const status = JSON.parse(execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
assert.match(status.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/)
const credentials = JSON.parse(fs.readFileSync(path.join(workdir, 'credentials.private.json'), 'utf8'))
process.env.VITE_SUPABASE_URL = status.API_URL
process.env.VITE_SUPABASE_ANON_KEY = status.ANON_KEY ?? status.PUBLISHABLE_KEY
const vite = await createServer({ root: process.cwd(), configFile: false, envDir: false, appType: 'custom',
  cacheDir: path.join(workdir, 'fix-storage-cache'), logLevel: 'error', mode: 'production',
  server: { middlewareMode: true, hmr: false }, define: { 'import.meta.env.DEV': 'false' } })
const { supabase } = await vite.ssrLoadModule('/src/lib/supabase.ts')
const assets = await vite.ssrLoadModule('/src/lib/assetStorage.ts')
const owner = createClient(status.API_URL, status.SERVICE_ROLE_KEY ?? status.SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const anon = createClient(status.API_URL, process.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const bytes = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWbQAAAAASUVORK5CYII=', 'base64')
const paths = [], articles = []
let checks = 0
const check = (name, condition) => { assert.ok(condition, name); checks++; console.log(`PASS ${name}`) }
async function login(role) {
  await supabase.auth.signOut()
  const { error } = await supabase.auth.signInWithPassword(credentials[role])
  assert.ifError(error)
}
async function upload(folder) {
  const receipt = await assets.uploadAssetReceipt(new File([bytes], 'test.png', { type: 'image/png' }), folder)
  paths.push(receipt.path)
  return receipt
}
async function exists(object) {
  const [folder, name] = object.split('/')
  const result = await owner.storage.from('club-assets').list(folder, { search: name })
  assert.ifError(result.error)
  return result.data.some((r) => r.name === name)
}
async function anonymousRead(object) { return !(await anon.storage.from('club-assets').download(object)).error }
try {
  await login('editor')
  const draft = await upload('articles')
  check('Unreferenced article bytes private', !(await anonymousRead(draft.path)))
  check('Old permanent public route denied', !(await fetch(draft.url)).ok)
  const preview = await assets.assetDisplayUrl(draft.url)
  check('Editor signed draft preview renders', (await fetch(preview)).ok)
  check('Signed preview canonicalizes before persistence', assets.canonicalAssetUrl(preview) === draft.url)
  const article = await owner.from('articles').insert({ title: 'Private asset regression', slug: `private-regression-${Date.now()}`, status: 'draft', cover_image_url: draft.url }).select('id').single()
  assert.ifError(article.error); articles.push(article.data.id)
  check('Saved draft bytes remain private', !(await anonymousRead(draft.path)))
  await assets.discardUploadedAsset(draft)
  check('Ambiguous/successful save cleanup preserves referenced file', await exists(draft.path))
  await owner.from('articles').update({ status: 'scheduled', published_at: new Date(Date.now() + 3600_000).toISOString() }).eq('id', article.data.id)
  check('Future scheduled image private', !(await anonymousRead(draft.path)))
  await owner.from('articles').update({ published_at: new Date(Date.now() - 1000).toISOString() }).eq('id', article.data.id)
  check('Due scheduled image public through authorized API', await anonymousRead(draft.path))
  const due = await anon.from('articles').select('id').eq('id', article.data.id)
  check('Due scheduled story automatically visible', !due.error && due.data.length === 1)
  await owner.from('articles').update({ status: 'draft' }).eq('id', article.data.id)
  check('Unpublication revokes new anonymous image access', !(await anonymousRead(draft.path)))
  await login('operator')
  await assert.rejects(assets.discardUploadedAsset(draft))
  check('Operator cannot delete editorial file', await exists(draft.path))
  const moved = await supabase.storage.from('club-assets').move(draft.path, `players/${draft.path.split('/')[1]}`)
  check('Operator cannot move draft image into public folder', !!moved.error)
  const person = await upload('players')
  await login('editor')
  await assert.rejects(assets.discardUploadedAsset(person))
  check('Editor cannot delete player file', await exists(person.path))
  const unused = await upload('media')
  await assets.discardUploadedAsset(unused)
  check('Failed/cancelled save cleans unreferenced upload', !(await exists(unused.path)))
  await login('viewer')
  await assert.rejects(assets.uploadAssetReceipt(new File([bytes], 'test.png', { type: 'image/png' }), 'articles'))
  check('Viewer upload rejected', true)
} finally {
  for (const id of articles) await owner.from('articles').delete().eq('id', id)
  await owner.storage.from('club-assets').remove(paths)
  await supabase.auth.signOut(); supabase.auth.stopAutoRefresh(); owner.auth.stopAutoRefresh(); anon.auth.stopAutoRefresh()
  await vite.close()
  assert.ok((await Promise.all(paths.map(exists))).every((present) => !present), 'Test object cleanup')
}
console.log(`${checks} real Auth/Storage checks passed; disposable files and rows cleaned`)
