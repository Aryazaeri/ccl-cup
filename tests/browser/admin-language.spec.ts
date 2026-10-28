import { test, expect, type Page } from '@playwright/test'

const dataKey = 'ccl-cup:data:v8'
async function seedAdmin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('ccl-cup:demo-session:v1', JSON.stringify({ id: 'language-admin', fullName: 'Deniz', email: 'demo@ccl.local', role: 'super_admin' }))
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nav[aria-label="Dev data fixture"] { display: none !important; }'
      document.head.append(style)
    })
  })
}
async function turkish(page: Page, section = 'overview') {
  await seedAdmin(page)
  await page.goto(`/#admin/${section}`)
  await page.getByRole('combobox', { name: 'Admin language', exact: true }).selectOption('tr')
  await expect(page.getByRole('combobox', { name: 'Yönetim paneli dili', exact: true })).toHaveValue('tr')
  await expect(page.locator('html')).toHaveAttribute('lang', 'tr')
}
async function navigate(page: Page, section: string) {
  const menu = page.getByRole('button', { name: 'Yönetim menüsünü aç', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Yönetim bölümleri' }).getByRole('button', { name: section, exact: true }).click()
  await expect(page.getByRole('heading', { name: section, level: 1, exact: true })).toBeVisible()
}

test('Turkish persists across all admin sections and reloads; the public site stays English', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await turkish(page)
  await expect(page).toHaveTitle('CCL Cup')
  for (const label of ['Sezonlar', 'Takımlar', 'Oyuncular', 'Maçlar', 'Puan durumu', 'İçerik', 'Yorumlar', 'Medya', 'Sponsorlar', 'Kullanıcılar', 'Ayarlar', 'Genel bakış']) {
    await navigate(page, label)
    expect(await page.locator('body').evaluate((el) => el.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  }
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Genel bakış', level: 1 })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('turkish-admin-overview.png'), fullPage: false })
  await page.getByRole('button', { name: 'Siteyi görüntüle', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Standings', exact: true })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto('/#admin')
  await expect(page.getByRole('heading', { name: 'Genel bakış', level: 1 })).toBeVisible()
  expect(errors).toEqual([])
})

test('changing language keeps a filled season form and saves canonical format and visibility values', async ({ page }) => {
  await turkish(page, 'seasons')
  await page.getByRole('button', { name: 'Yeni sezon', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Yeni sezon', exact: true })
  await dialog.getByLabel('Sezon adı *', { exact: true }).fill('İstanbul Türkçe Kupası')
  await dialog.getByLabel('Başlangıç tarihi *').fill('2027-04-01')
  await dialog.getByLabel('Format *').selectOption('group_league')
  await expect(dialog.getByLabel('Görünürlük')).toHaveValue('draft')
  // Switch language while the form is open using the existing header control.
  await page.getByRole('combobox', { name: 'Yönetim paneli dili' }).selectOption('en')
  dialog = page.getByRole('dialog', { name: 'New Season', exact: true })
  await expect(dialog.getByLabel('Season name *')).toHaveValue('İstanbul Türkçe Kupası')
  await expect(dialog.getByLabel('Format *')).toHaveValue('group_league')
  await page.getByRole('combobox', { name: 'Admin language' }).selectOption('tr')
  dialog = page.getByRole('dialog', { name: 'Yeni sezon', exact: true })
  await dialog.getByRole('button', { name: 'Sezon ekle', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), dataKey)
  const season = stored.seasons.find((s: { name: string }) => s.name === 'İstanbul Türkçe Kupası')
  expect(season.seasonType).toBe('group_league')
  expect(season.status).toBe('draft')
  expect(season.startDate).toBe('2027-04-01')
  await expect(page.getByRole('row').filter({ hasText: 'İstanbul Türkçe Kupası' })).toContainText('Taslak')
})

test('Turkish player and story forms save original user content and enum identities', async ({ page }) => {
  await turkish(page, 'players')
  await page.getByRole('button', { name: 'Oyuncu kaydet', exact: true }).click()
  let dialog = page.getByRole('dialog', { name: 'Yeni oyuncu kaydet', exact: true })
  await dialog.getByLabel('Tam adı *', { exact: true }).fill('Şule Işık')
  await dialog.getByRole('combobox', { name: 'Mevki', exact: true }).selectOption('defender')
  await dialog.getByRole('button', { name: 'Oyuncu kaydet', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  let stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), dataKey)
  expect(stored.players.find((p: { fullName: string }) => p.fullName === 'Şule Işık').position).toBe('defender')
  await navigate(page, 'İçerik')
  await page.getByRole('button', { name: 'Yeni yazı', exact: true }).click()
  dialog = page.getByRole('dialog', { name: 'Yeni yazı yaz', exact: true })
  await dialog.getByLabel('Başlık *', { exact: true }).fill('Hafta sonu turnuva duyurusu')
  await dialog.getByRole('combobox', { name: 'Kategori', exact: true }).selectOption('announcement')
  await dialog.getByLabel('Özet (kısa tanıtım)').fill('İstanbul’da görüşmek üzere.')
  await expect(dialog.getByLabel('Yayın durumu')).toHaveValue('Draft')
  await dialog.getByRole('button', { name: 'Taslağı kaydet', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), dataKey)
  const story = stored.stories.find((s: { title: string }) => s.title === 'Hafta sonu turnuva duyurusu')
  expect(story.category).toBe('announcement')
  expect(story.status).toBe('Draft')
  expect(story.summary).toBe('İstanbul’da görüşmek üzere.')
  const row = page.getByRole('row').filter({ hasText: 'Hafta sonu turnuva duyurusu' })
  await expect(row).toContainText('Taslak')
  await row.getByRole('button', { name: 'Yayınla', exact: true }).click()
  await expect(row).toContainText('Yayında')
  await page.screenshot({ path: test.info().outputPath('turkish-content-published.png'), fullPage: false })
  await row.getByRole('button', { name: 'Hafta sonu turnuva duyurusu kaydını sil', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: 'Yazıyı sil', exact: true })
  await expect(confirm).toContainText('Bu işlem geri alınamaz.')
  await confirm.getByRole('button', { name: 'İptal', exact: true }).click()
  await expect(row).toBeVisible()
})

test('login offers Turkish and remembers the language', async ({ page }) => {
  await page.goto('/#admin')
  await page.getByRole('combobox', { name: 'Admin language' }).selectOption('tr')
  await expect(page.getByRole('heading', { name: 'Turnuvayı yönetmek için giriş yapın' })).toBeVisible()
  await expect(page.getByLabel('E-posta', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Şifre', { exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('turkish-admin-login.png'), fullPage: false })
  await page.reload()
  await expect(page.getByRole('button', { name: 'Giriş yap', exact: true })).toBeVisible()
})

test('a failed Turkish download offers a reload that recovers the selected language', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('ccl-cup:admin-language:v1', 'tr'))
  let blocked = false
  await page.route('**/src/i18n/admin.tr.json*', (route) => {
    if (!blocked) { blocked = true; return route.abort('failed') }
    return route.continue()
  })
  await page.goto('/#admin')
  await expect(page.getByRole('alert')).toContainText('Türkçe yüklenemedi.')
  await page.getByRole('button', { name: 'Sayfayı yeniden yükle' }).click()
  await expect(page.getByRole('heading', { name: 'Turnuvayı yönetmek için giriş yapın' })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
})
