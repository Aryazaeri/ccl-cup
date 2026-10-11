import { test, expect, type Page } from '@playwright/test'
import { autoSeedBracket, generateEmptyBracket } from '../../src/lib/bracketUtils'
import type { Season, Team } from '../../src/types'

const clubs: Team[] = ['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'].map((name, index) => ({ id: index + 1, seasonId: 1, name, countryCode: 'TR', color: '#63e35b', played: 0, goalDifference: 0, points: 0 }))
const base: Season = { id: 1, city: 'Antalya', year: 2026, name: 'Browser QA', fullName: 'Browser QA', isActive: true, seasonType: 'league', league: { teamCount: 4, slots: clubs.map((club, index) => ({ position: index + 1, teamId: club.id })) } }

async function seed(page: Page, season: Season = base) {
  await page.addInitScript((data) => {
    if (!localStorage.getItem('ccl-cup:data:v7')) localStorage.setItem('ccl-cup:data:v7', JSON.stringify(data))
  }, { seasons: [season], teams: clubs, players: [{ id: 100, teamId: 1, teamName: 'ALPHA', fullName: 'Test Striker', position: 'forward', strongFoot: 'right', isCaptain: false, shirtNumber: 9, activeSeasonIds: [1], goals: 0, assists: 0 }], matches: [], stories: [], media: [], sponsors: [] })
}
async function login(page: Page, route = 'matches') {
  await page.goto(`/#admin/${route}`)
  await page.getByLabel('Email', { exact: true }).fill('demo@ccl.local')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('heading', { name: new RegExp(`^${route}$`, 'i'), level: 1 })).toBeVisible()
}
async function navigate(page: Page, section: string) {
  const menu = page.getByRole('button', { name: 'Open admin menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Admin sections', exact: true }).getByRole('button', { name: section, exact: true }).click()
}
async function preview(page: Page, phase: 'table' | 'knockout' = 'table', publication = 'Scheduled') {
  await page.getByRole('button', { name: 'Plan fixtures', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Plan fixtures', exact: true })
  await dialog.getByRole('combobox', { name: 'Stage', exact: true }).selectOption(phase)
  await dialog.getByLabel('First match date', { exact: true }).fill('2026-12-30')
  await dialog.getByLabel('Venue', { exact: true }).fill('Browser Ground')
  await dialog.getByRole('combobox', { name: 'Visibility', exact: true }).selectOption(publication)
  await dialog.getByRole('button', { name: 'Preview schedule', exact: true }).click()
  return dialog
}
async function score(page: Page, index: number, home: string, away: string) {
  await page.getByRole('button', { name: 'Edit score & details', exact: true }).nth(index).click()
  const dialog = page.getByRole('dialog')
  await dialog.locator('input[name="homeScore"]').fill(home)
  await dialog.locator('input[name="awayScore"]').fill(away)
  await dialog.getByRole('button', { name: /Save/ }).click()
  await expect(dialog).toHaveCount(0)
}

test('invalid login stays on the form and successful login survives reload', async ({ page }) => {
  await seed(page)
  await page.goto('/#admin/matches')
  await page.getByLabel('Password', { exact: true }).fill('wrong')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Invalid email or password.')
  await expect(page.getByLabel('Password', { exact: true })).toHaveValue('wrong')
  await page.getByLabel('Password', { exact: true }).fill('demo1234')
  await page.getByRole('button', { name: 'Sign in', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Matches', exact: true, level: 1 })).toBeVisible()
})

for (const grouped of [false, true]) {
  test(`${grouped ? 'group' : 'league'} canvas retains assignments after a failed save and supports retry`, async ({ page }) => {
    const season: Season = grouped ? { ...base, seasonType: 'group_league', groupCount: 2, groupLeague: { groupCount: 2, groups: [
      { id: 'a', name: 'Group A', slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 2 }] },
      { id: 'b', name: 'Group B', slots: [{ position: 1, teamId: 3 }, { position: 2, teamId: 4 }] },
    ] } } : base
    await seed(page, season)
    await login(page, 'seasons')
    await page.getByRole('button', { name: `Open ${grouped ? 'group tables' : 'league table'} for Browser QA`, exact: true }).click()
    const dialog = page.getByRole('dialog')
    // Exercise the actual persistence failure path without product-only test controls.
    await page.evaluate(() => {
      const original = Storage.prototype.setItem
      Storage.prototype.setItem = function (key, value) {
        if (key === 'ccl-cup:data:v7') throw new Error('Test storage unavailable')
        return original.call(this, key, value)
      }
      Object.assign(window, { restoreStorage: () => { Storage.prototype.setItem = original } })
    })
    await dialog.getByRole('button', { name: grouped ? /Save groups/ : /Save league table/ }).click()
    await expect(dialog.getByRole('alert')).toHaveText('Test storage unavailable')
    await expect(dialog.getByText('ALPHA', { exact: true }).first()).toBeVisible()
    await page.evaluate(() => { (window as unknown as { restoreStorage: () => void }).restoreStorage() })
    await dialog.getByRole('button', { name: grouped ? /Save groups/ : /Save league table/ }).click()
    await expect(dialog).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: `Open ${grouped ? 'group tables' : 'league table'} for Browser QA`, exact: true })).toBeVisible()
  })
}

test('schedule is persisted once, drafts stay hidden and published fixtures appear publicly', async ({ page }) => {
  await seed(page)
  await login(page)
  let dialog = await preview(page, 'table', 'Draft')
  await expect(dialog.getByRole('heading', { name: '6 new fixtures · 0 existing games kept' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Create 6 fixtures', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Matches & Scorekeeping (6)', exact: true })).toBeVisible()
  await page.reload()
  dialog = await preview(page, 'table', 'Draft')
  await expect(dialog.getByText('No new fixtures are needed for this selection.', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'View site', exact: true }).click()
  await expect(page.getByText('Browser Ground', { exact: true })).toHaveCount(0)
  await page.goto('/#admin/matches')
  await page.getByRole('button', { name: 'Edit score & details', exact: true }).first().click()
  dialog = page.getByRole('dialog')
  await dialog.getByRole('combobox', { name: 'Public Visibility', exact: true }).selectOption('Scheduled')
  await dialog.getByRole('button', { name: /Save/ }).click()
  await page.getByRole('button', { name: 'View site', exact: true }).click()
  await expect(page.getByText('Browser Ground', { exact: true }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('knockout fixtures advance winners and generate the final once', async ({ page }) => {
  await seed(page, { ...base, seasonType: 'tournament', bracket: autoSeedBracket(generateEmptyBracket(4), clubs, false) })
  await login(page)
  let dialog = await preview(page, 'knockout')
  await expect(dialog.getByRole('heading', { name: '2 new fixtures · 0 existing games kept' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Create 2 fixtures', exact: true }).click()
  await score(page, 0, '2', '0')
  await score(page, 1, '1', '0')
  dialog = await preview(page, 'knockout')
  await expect(dialog.getByRole('heading', { name: '1 new fixture · 2 existing games kept' })).toBeVisible()
  await expect(dialog.getByRole('row').filter({ hasText: 'ALPHA vs CHARLIE' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Create 1 fixture', exact: true }).click()
  await score(page, 2, '3', '0')
  await page.getByRole('button', { name: 'View site', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Knockout bracket', exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Champion', exact: true }).getByText('ALPHA', { exact: true })).toBeVisible()
})

test('groups qualify into generated semis and a final while group results stay unchanged', async ({ page }) => {
  await seed(page, { ...base, seasonType: 'group_league', groupCount: 2, groupLeague: { groupCount: 2, groups: [
    { id: 'a', name: 'Group A', slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 2 }] },
    { id: 'b', name: 'Group B', slots: [{ position: 1, teamId: 3 }, { position: 2, teamId: 4 }] },
  ] }, bracket: { ...generateEmptyBracket(4), qualification: { qualifiersPerTable: 2 } } })
  await login(page)
  let dialog = await preview(page)
  await dialog.getByRole('button', { name: 'Create 2 fixtures', exact: true }).click()
  await score(page, 0, '2', '0')
  await score(page, 1, '1', '0')
  await navigate(page, 'Standings')
  await page.getByRole('button', { name: 'Generate knockout draw', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Regenerate draw', exact: true })).toBeVisible()
  await navigate(page, 'Matches')
  dialog = await preview(page, 'knockout')
  await dialog.getByRole('button', { name: 'Create 2 fixtures', exact: true }).click()
  await score(page, 2, '3', '0')
  await score(page, 3, '1', '0')
  dialog = await preview(page, 'knockout')
  await dialog.getByRole('button', { name: 'Create 1 fixture', exact: true }).click()
  await score(page, 4, '2', '0')
  await page.getByRole('button', { name: 'View site', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Champion', exact: true }).getByText('ALPHA', { exact: true })).toBeVisible()
  const groupWinner = page.getByRole('row').filter({ hasText: 'ALPHA' })
  await expect(groupWinner.getByRole('cell', { name: '3', exact: true })).toBeVisible()
})

test('an event remains attached to the same player after transfer and rename', async ({ page }) => {
  await seed(page)
  await login(page)
  const dialog = await preview(page)
  await dialog.getByRole('button', { name: 'Create 6 fixtures', exact: true }).click()
  await score(page, 0, '1', '0')
  await page.getByRole('row').filter({ hasText: 'ALPHA vs DELTA' }).getByRole('button', { name: '(0)', exact: true }).click()
  const events = page.getByRole('dialog')
  await events.getByRole('combobox', { name: 'Player', exact: true }).selectOption('100')
  await events.getByRole('button', { name: 'Add Event to Timeline', exact: true }).click()
  await expect(events.getByText('Test Striker', { exact: true })).toBeVisible()
  await events.getByRole('button', { name: 'Close', exact: true }).click()
  await navigate(page, 'Players')
  await page.getByRole('button', { name: 'Edit player Test Striker', exact: true }).click()
  const player = page.getByRole('dialog')
  await player.getByLabel('Full Name *', { exact: true }).fill('Renamed Striker')
  await player.getByRole('combobox', { name: 'Assigned Club / Team', exact: true }).selectOption('2')
  await player.getByRole('button', { name: /Save/ }).click()
  const row = page.getByRole('row').filter({ hasText: 'Renamed Striker' })
  await expect(row).toContainText('BRAVO')
  await expect(row.getByRole('cell', { name: /⚽ 1.*🎯 0/ })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('row').filter({ hasText: 'Renamed Striker' })).toContainText('BRAVO')
  await expect(page.getByRole('row').filter({ hasText: 'Renamed Striker' }).getByRole('cell', { name: /⚽ 1.*🎯 0/ })).toBeVisible()
})

test('a changed draw cannot create fixtures that were not reviewed', async ({ page }) => {
  await seed(page, { ...base, seasonType: 'tournament', bracket: autoSeedBracket(generateEmptyBracket(4), clubs, false) })
  await login(page)
  const dialog = await preview(page, 'knockout')
  await expect(dialog.getByRole('heading', { name: '2 new fixtures · 0 existing games kept' })).toBeVisible()
  // Simulate another staff session reseeding the draw after this preview.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem('ccl-cup:data:v7')!)
    const ties = data.seasons[0].bracket.rounds[0].matches
    const firstAway = ties[0].slot2
    ties[0].slot2 = { ...ties[1].slot1, slotId: ties[0].slot2.slotId }
    ties[1].slot1 = { ...firstAway, slotId: ties[1].slot1.slotId }
    localStorage.setItem('ccl-cup:data:v7', JSON.stringify(data))
  })
  await dialog.getByRole('button', { name: 'Create 2 fixtures', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('The table or draw changed')
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ccl-cup:data:v7')!).matches.length)).toBe(0)
})
