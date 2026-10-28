import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const workdir = process.env.CCL_TEST_WORKDIR!
if (!workdir || fs.existsSync(path.join(workdir, 'supabase/.temp/project-ref'))) throw new Error('Disposable local database required')
const status = JSON.parse(execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(status.API_URL)) throw new Error('Non-local API refused')
const accounts = JSON.parse(fs.readFileSync(path.join(workdir, 'credentials.private.json'), 'utf8'))
const owner = createClient(status.API_URL, status.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
const seasonNames = new Set<string>(), clubNames = new Set<string>(), titles = new Set<string>()
async function login(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ccl-cup:admin-language:v1', 'tr')
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style'); style.textContent = 'nav[aria-label="Dev data fixture"] { display: none !important; }'; document.head.append(style)
    })
  })
  await page.goto('/#admin/seasons')
  await page.getByLabel('E-posta', { exact: true }).fill(accounts.super_one.email)
  await page.getByLabel('Şifre', { exact: true }).fill(accounts.super_one.password)
  await page.getByRole('button', { name: 'Giriş yap', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sezonlar', level: 1, exact: true })).toBeVisible()
}
async function navigate(page: Page, name: string) {
  const menu = page.getByRole('button', { name: 'Yönetim menüsünü aç', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Yönetim bölümleri' }).getByRole('button', { name, exact: true }).click()
  await expect(page.getByRole('heading', { name, level: 1, exact: true })).toBeVisible()
}
test.afterEach(async () => {
  for (const title of titles) { const r = await owner.from('articles').delete().eq('title', title); expect(r.error).toBeNull() }
  for (const name of seasonNames) { const r = await owner.from('seasons').delete().eq('name', name); expect(r.error).toBeNull() }
  for (const name of clubNames) { const r = await owner.from('clubs').delete().eq('name', name); expect(r.error).toBeNull() }
  titles.clear(); seasonNames.clear(); clubNames.clear()
})
test('Turkish staff creates a season with groups, registers a club and publishes an unchanged Turkish story', async ({ page, browser }) => {
  const stamp = Date.now(), seasonName = `Türkçe Turnuva ${stamp}`, clubName = `İstanbul Kulübü ${stamp}`, title = `Hafta sonu duyurusu ${stamp}`
  seasonNames.add(seasonName); clubNames.add(clubName); titles.add(title)
  await login(page)
  await page.getByRole('button', { name: 'Yeni sezon', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Yeni sezon', exact: true })
  await dialog.getByLabel('Sezon adı *', { exact: true }).fill(seasonName)
  await dialog.getByLabel('Başlangıç tarihi *').fill('2028-06-01')
  await dialog.getByRole('combobox', { name: 'Yıl *', exact: true }).selectOption('2028')
  await dialog.getByRole('combobox', { name: 'Format *', exact: true }).selectOption('group_league')
  await dialog.getByRole('combobox', { name: 'Grup sayısı *', exact: true }).selectOption('2')
  await dialog.getByRole('button', { name: 'Sezon ekle', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const season = await owner.from('seasons').select('id,season_type,status,group_league').eq('name', seasonName).single()
  expect(season.error).toBeNull(); expect(season.data!.season_type).toBe('group_league'); expect(season.data!.status).toBe('draft')
  expect(season.data!.group_league.groups).toHaveLength(2)
  const id = Number(season.data!.id)
  await page.getByRole('combobox', { name: 'Yıla göre filtrele', exact: true }).selectOption('2028')
  const row = page.getByRole('row').filter({ hasText: seasonName })
  await row.getByRole('button', { name: /grup tablolarını aç/ }).click()
  await expect(page.getByRole('button', { name: 'Grupları kaydet (0 takım)', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Grupları kaydet (0 takım)', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Grupları kaydet (0 takım)', exact: true })).toHaveCount(0)
  await navigate(page, 'Takımlar')
  await page.getByRole('button', { name: 'Yeni kulüp kaydet', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Kulüp kaydet', exact: true })
  await dialog.getByLabel('Kulüp adı *', { exact: true }).fill(clubName)
  await dialog.getByRole('button', { name: 'Kulüp kaydını kaydet', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const club = await owner.from('clubs').select('id,name,profile').eq('name', clubName).single()
  expect(club.error).toBeNull(); expect(club.data!.profile.countryCode).toBe('TR')
  await navigate(page, 'İçerik')
  await page.getByRole('button', { name: 'Yeni yazı', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Yeni yazı yaz', exact: true })
  await dialog.getByLabel('Başlık *', { exact: true }).fill(title)
  await dialog.getByRole('combobox', { name: 'Kategori', exact: true }).selectOption('announcement')
  await dialog.getByRole('combobox', { name: /^Sezon/ }).selectOption(String(id))
  await dialog.getByLabel('Özet (kısa tanıtım)', { exact: true }).fill('İstanbul’da buluşuyoruz; Şule ve Çağrı hazır.')
  await dialog.getByRole('button', { name: 'Taslağı kaydet', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const story = await owner.from('articles').select('id,title,category,status,summary').eq('title', title).single()
  expect(story.error).toBeNull(); expect(story.data!.status).toBe('draft'); expect(story.data!.category).toBe('announcement')
  expect(story.data!.summary).toBe('İstanbul’da buluşuyoruz; Şule ve Çağrı hazır.')
  await page.getByRole('row').filter({ hasText: title }).getByRole('button', { name: 'Yayınla', exact: true }).click()
  await expect(page.getByRole('row').filter({ hasText: title })).toContainText('Yayında')
  await navigate(page, 'Sezonlar')
  await page.getByRole('combobox', { name: 'Yıla göre filtrele', exact: true }).selectOption('2028')
  await row.getByRole('button', { name: /sezonunu düzenle/ }).click()
  dialog = page.getByRole('dialog', { name: /Sezonu düzenle:/ })
  await dialog.getByLabel('Bitiş tarihi', { exact: true }).fill('2028-07-01')
  await dialog.getByRole('combobox', { name: 'Görünürlük', exact: true }).selectOption('published')
  await dialog.getByRole('button', { name: 'Değişiklikleri kaydet', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  // Use a separate anonymous tab to prove published content is not a staff-only view.
  const guest = await browser.newContext({ viewport: page.viewportSize()! })
  const publicPage = await guest.newPage()
  try {
  await publicPage.goto(`/#site/story/${story.data!.id}`)
  await expect(publicPage.getByRole('dialog', { name: 'News', exact: true }).getByRole('heading', { name: title, exact: true })).toBeVisible()
  await expect(publicPage.getByRole('dialog', { name: 'News', exact: true }).locator('.reader-lead')).toHaveText('İstanbul’da buluşuyoruz; Şule ve Çağrı hazır.')
  await expect(publicPage.locator('html')).toHaveAttribute('lang', 'en')
  } finally { await guest.close() }
})
