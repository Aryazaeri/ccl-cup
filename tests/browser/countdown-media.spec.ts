import { test, expect } from '@playwright/test'
import { countdownDemoData } from '../../tools/countdown-demo-data.mjs'

test('direct match link counts down, stops at kickoff, and preserves broadcast and media links', async ({ page }) => {
  const now = Date.parse('2026-10-29T12:00:00Z')
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  await page.addInitScript((data) => localStorage.setItem('ccl-cup:data:v8', JSON.stringify(data)), countdownDemoData(now))
  await page.goto('/#site/match/900001')
  const dialog = page.getByRole('dialog', { name: 'Match details', exact: true })
  const countdown = dialog.getByRole('region', { name: 'Kickoff countdown' })
  await expect(countdown).toContainText('Kickoff in')
  await expect(countdown.getByRole('timer')).toContainText('02days03hours00minutes00seconds')
  await page.clock.fastForward(1000)
  await expect(countdown.getByRole('timer')).toContainText('02days02hours59minutes59seconds')
  await expect(dialog.getByRole('link', { name: /Open on YouTube/ })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=iMk7phHzBo4')
  await expect(dialog.getByRole('region', { name: 'Match media' }).getByRole('link')).toHaveCount(8)
  await page.clock.fastForward(2 * 86400000 + 3 * 3600000 - 1000)
  const live = dialog.getByRole('region', { name: 'Live match broadcast' })
  await expect(live.getByRole('status')).toContainText('Live')
  await expect(live.getByRole('link', { name: 'Watch live on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=iMk7phHzBo4')
  await expect(countdown).toHaveCount(0)
  await expect(dialog.locator('.match-score-center .status-pill')).toHaveText('Live')
  await expect(dialog.locator('.pg-broadcast-label')).toHaveText('Live broadcast')
  await page.keyboard.press('Escape')
  const media = page.locator('#media')
  await expect(media.locator('.media-item')).toHaveCount(6)
  await media.getByRole('button', { name: /Show more media/ }).click()
  await expect(media.locator('.media-item')).toHaveCount(8)
  await media.getByRole('button', { name: 'Photos', exact: true }).click()
  await expect(media.locator('.media-item')).toHaveCount(1)
  await expect(media.getByRole('link')).toHaveAttribute('href', /drive.google.com/)
})

test('coming up moves a fixture at kickoff without a reload and retains the broadcast', async ({ page }) => {
  const now = Date.parse('2026-10-30T09:00:00Z')
  await page.clock.install({ time: now - 1000 })
  await page.clock.pauseAt(now)
  const data = countdownDemoData(now)
  const original = data.matches[0]
  data.matches = [
    { ...original, kickoffAt: '2026-10-30T12:00:02+03:00', time: '12:00' },
    { ...original, id: 900002, home: 'Future Home', kickoffAt: '2026-10-30T13:00:00+03:00', time: '13:00' },
  ]
  await page.addInitScript((value) => localStorage.setItem('ccl-cup:data:v8', JSON.stringify(value)), data)
  await page.goto('/#site')
  const coming = page.locator('#fixtures div').filter({ has: page.getByRole('heading', { name: 'Coming up', exact: true }) }).last()
  await expect(coming).toContainText('Demo Home')
  await expect(page.locator('.pg-next')).toContainText('Demo Home')
  await page.clock.fastForward(2000)
  await expect(coming).not.toContainText('Demo Home')
  await expect(coming).toContainText('Future Home')
  await expect(page.locator('.pg-next')).toContainText('Future Home')
  const awaiting = page.getByRole('region', { name: 'Awaiting result', exact: true })
  await expect(awaiting).toContainText('Demo Home')
  await expect(awaiting).toContainText('Kickoff passed')
  await awaiting.getByRole('button').click()
  await expect(page.getByRole('region', { name: 'Live match broadcast' }).getByRole('link', { name: 'Watch live on YouTube' })).toHaveAttribute('href', original.streamUrl)
})
