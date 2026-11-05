import { test, expect } from '@playwright/test'
import { countdownDemoData } from '../../tools/countdown-demo-data.mjs'

test('saved story URLs are clickable, preserve surrounding text, and fit the popup', async ({ page, context }) => {
  const driveUrl = 'https://drive.google.com/drive/folders/1rvHbPsH58sVh-lgskNZ4QqRFbetfRRv0?usp=sharing'
  const balancedUrl = 'https://example.com/photos_(draw)?season=2026&album=1'
  const data = countdownDemoData()
  data.stories = [{
    id: 900001, title: 'Draw ceremony photos', status: 'Published', category: 'news', publishedAt: '2026-01-01',
    summary: 'Photos: www.example.com/gallery.',
    body: `Click the link to view photos from the draw ceremony.\n${driveUrl}\n\nMore photos (${balancedUrl}).\n\n<script>alert("unsafe")</script> javascript:alert(1) https://`,
  }]
  await page.addInitScript((value) => localStorage.setItem('ccl-cup:data:v8', JSON.stringify(value)), data)
  await page.goto('/#site/story/900001')
  const dialog = page.getByRole('dialog', { name: 'News', exact: true })
  const driveLink = dialog.getByRole('link', { name: driveUrl, exact: true })
  await expect(driveLink).toHaveAttribute('href', driveUrl)
  await expect(driveLink).toHaveAttribute('target', '_blank')
  await expect(driveLink).toHaveAttribute('rel', 'noopener noreferrer')
  await expect(dialog.getByRole('link', { name: 'www.example.com/gallery', exact: true })).toHaveAttribute('href', 'https://www.example.com/gallery')
  await expect(dialog.getByRole('link', { name: balancedUrl, exact: true })).toHaveAttribute('href', balancedUrl)
  await expect(dialog.getByRole('link')).toHaveCount(3)
  await expect(dialog.locator('.reader-body')).toContainText(`<script>alert("unsafe")</script> javascript:alert(1) https://`)
  await expect(dialog.locator('script')).toHaveCount(0)
  await expect(dialog.locator('.reader-body')).toContainText(`More photos (${balancedUrl}).`)
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)

  // Exercise the anchor without contacting Google or changing a production record.
  await context.route('https://drive.google.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<h1>Album destination</h1>' }))
  const popupPromise = page.waitForEvent('popup')
  await driveLink.click()
  const popup = await popupPromise
  await expect(popup).toHaveURL(driveUrl)
  await expect(popup.getByRole('heading', { name: 'Album destination' })).toBeVisible()
  await popup.close()
  await expect(dialog).toBeVisible()
})
