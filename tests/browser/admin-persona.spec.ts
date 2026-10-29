import { test, expect, type Page } from '@playwright/test'
import { generateEmptyBracket } from '../../src/lib/bracketUtils'
import type { Match, MediaAsset, Player, PlayerPosition, Season, Sponsor, Story, Team } from '../../src/types'

/*
 * An organiser walking through every admin screen in local demo mode (blank
 * Supabase env, data in localStorage). Each test seeds its own competition:
 *
 *   Spring Cup     (id 1, current)  group league: A = ALPHA, BRAVO · B = CHARLIE, DELTA
 *   Autumn League  (id 2)           league: ECHO, FOXTROT
 *   Knockout Trophy(id 3)           4-team knockout: HOTEL, INDIA, JULIET, KILO
 *
 * Every club has six players, and ALPHA v BRAVO is the one fixture.
 */

type Data = { seasons: Season[]; teams: Team[]; players: Player[]; matches: Match[]; stories: Story[]; media: MediaAsset[]; sponsors: Sponsor[] }

const crest = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="%2363e35b"/></svg>'
const positions: PlayerPosition[] = ['goalkeeper', 'defender', 'defender', 'midfielder', 'midfielder', 'forward']
const title = (name: string) => name[0] + name.slice(1).toLowerCase()

function fixture(): Data {
  const club = (id: number, name: string, seasonId: number): Team => ({
    id, seasonId, clubId: id, name, countryCode: 'TR', color: '#63e35b', logoUrl: crest, played: 0, goalDifference: 0, points: 0,
  })
  const teams = [
    club(1, 'ALPHA', 1), club(2, 'BRAVO', 1), club(3, 'CHARLIE', 1), club(4, 'DELTA', 1),
    club(5, 'ECHO', 2), club(6, 'FOXTROT', 2),
    club(7, 'HOTEL', 3), club(8, 'INDIA', 3), club(9, 'JULIET', 3), club(10, 'KILO', 3),
  ]
  const players = teams.flatMap((team) => positions.map((position, index): Player => ({
    id: team.id * 100 + index + 1,
    squads: [{ seasonId: team.seasonId!, teamId: team.id }],
    activeSeasonIds: [team.seasonId!],
    fullName: `${title(team.name)} P${index + 1}`,
    shirtNumber: index + 1,
    position,
  })))
  const seasons: Season[] = [
    {
      id: 1, city: 'Antalya', year: 2026, startDate: '2026-10-01', name: 'Spring Cup', fullName: 'Antalya 2026 Spring Cup', isActive: true, status: 'published',
      seasonType: 'group_league', groupCount: 2, teamCount: 4,
      groupLeague: { groupCount: 2, groups: [
        { id: 'group_a', name: 'Group A', slots: [{ position: 1, teamId: 1 }, { position: 2, teamId: 2 }] },
        { id: 'group_b', name: 'Group B', slots: [{ position: 1, teamId: 3 }, { position: 2, teamId: 4 }] },
      ] },
    },
    {
      id: 2, city: 'İzmir', year: 2026, startDate: '2026-09-01', name: 'Autumn League', fullName: 'İzmir 2026 Autumn League', isActive: false, status: 'published',
      seasonType: 'league', teamCount: 2, league: { teamCount: 2, slots: [{ position: 1, teamId: 5 }, { position: 2, teamId: 6 }] },
    },
    {
      id: 3, city: 'Bodrum', year: 2026, startDate: '2026-08-01', name: 'Knockout Trophy', fullName: 'Bodrum 2026 Knockout Trophy', isActive: false, status: 'published',
      seasonType: 'tournament', teamCount: 4, bracket: generateEmptyBracket(4),
    },
  ]
  const matches: Match[] = [{
    id: 1, seasonId: 1, home: 'ALPHA', away: 'BRAVO', homeTeamId: 1, awayTeamId: 2, stage: 'Group A',
    date: '20 Dec', time: '18:00', kickoffAt: '2026-12-20T15:00:00Z', venue: 'QA Ground', matchStatus: 'scheduled', status: 'Scheduled', events: [],
  }]
  return { seasons, teams, players, matches, stories: [], media: [], sponsors: [] }
}

async function seed(page: Page, data: Data = fixture()) {
  await page.addInitScript((payload) => {
    // Signed in once per tab, so signing out survives a reload.
    if (!sessionStorage.getItem('qa:signed-in')) {
      sessionStorage.setItem('qa:signed-in', '1')
      localStorage.setItem('ccl-cup:demo-session:v1', JSON.stringify({ id: 'local-demo-admin', fullName: 'Local Demo Admin', email: 'demo@ccl.local', role: 'super_admin' }))
    }
    if (!localStorage.getItem('ccl-cup:data:v8')) localStorage.setItem('ccl-cup:data:v8', JSON.stringify(payload))
    // The dev server's fixture switcher (src/dev/worstCase.ts, never built for
    // production) floats over the bottom of the screen; keep it out of the way.
    document.addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style')
      style.textContent = 'nav[aria-label="Dev data fixture"] { display: none !important; }'
      document.head.append(style)
    })
  }, data)
}

async function open(page: Page, section: string, data?: Data) {
  await seed(page, data)
  await page.goto(`/#admin/${section.toLowerCase()}`)
  await expect(page.getByRole('heading', { name: section, exact: true, level: 1 })).toBeVisible()
}

async function navigate(page: Page, section: string) {
  const menu = page.getByRole('button', { name: 'Open admin menu', exact: true })
  if (await menu.isVisible()) await menu.click()
  await page.getByRole('navigation', { name: 'Admin sections', exact: true }).getByRole('button', { name: section, exact: true }).click()
  await expect(page.getByRole('heading', { name: section, exact: true, level: 1 })).toBeVisible()
}

async function viewSite(page: Page) {
  await page.getByRole('button', { name: 'View site', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Standings', exact: true })).toBeVisible()
}

async function publicSeasons(page: Page) {
  await page.locator('.season-button').click()
  return page.getByRole('listbox', { name: 'Choose a season' })
}


const seasonRow = (page: Page, fullName: string) => page.getByRole('row').filter({ hasText: fullName })
const teamsSeasonFilter = (page: Page) => page.locator('.filter-bar .filter-group').filter({ hasText: 'Season:' }).locator('select')
const matchRow = (page: Page, fixtureName: string) => page.getByRole('row').filter({ hasText: fixtureName })

/* ------------------------------------------------------------------ *
 * Seasons
 * ------------------------------------------------------------------ */

test.describe('Seasons', () => {
  test('a new season starts as a hidden draft and appears publicly once published', async ({ page }) => {
    await open(page, 'Seasons')
    await page.getByRole('button', { name: 'New Season' }).click()
    let dialog = page.getByRole('dialog', { name: 'New Season', exact: true })
    await dialog.getByLabel('City *').selectOption('İzmir')
    await dialog.getByLabel('Season name *').fill('Winter Open')
    await dialog.getByLabel('Format *').selectOption('league')
    await expect(dialog.getByLabel('Visibility')).toHaveValue('draft')
    await dialog.getByLabel('Start date *').fill('2026-12-01')
    await dialog.getByRole('button', { name: 'Add season', exact: true }).click()
    await expect(dialog).toHaveCount(0)

    const row = seasonRow(page, 'İzmir 2026 Winter Open')
    await expect(row).toContainText('Draft')
    await expect(row).not.toContainText('Public default')

    await viewSite(page)
    let menu = await publicSeasons(page)
    await expect(menu.getByRole('option', { name: /Spring Cup/ })).toBeVisible()
    await expect(menu.getByRole('option', { name: /Winter Open/ })).toHaveCount(0)

    await page.goto('/#admin/seasons')
    await page.getByRole('button', { name: 'Edit season İzmir 2026 Winter Open' }).click()
    dialog = page.getByRole('dialog', { name: 'Edit Season: İzmir 2026 Winter Open' })
    await dialog.getByLabel('Visibility').selectOption('published')
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(seasonRow(page, 'İzmir 2026 Winter Open')).toContainText('Published')

    await viewSite(page)
    menu = await publicSeasons(page)
    await expect(menu.getByRole('option', { name: /Winter Open/ })).toBeVisible()
  })

  test('editing a season renames it everywhere', async ({ page }) => {
    await open(page, 'Seasons')
    await page.getByRole('button', { name: 'Edit season İzmir 2026 Autumn League' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit Season: İzmir 2026 Autumn League' })
    await dialog.getByLabel('Season name *').fill('Autumn Classic')
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(seasonRow(page, 'İzmir 2026 Autumn Classic')).toBeVisible()
    await navigate(page, 'Teams')
    await expect(teamsSeasonFilter(page).locator('option', { hasText: '2026 — Autumn Classic' })).toHaveCount(1)
  })

  test('season search and year filter narrow the list', async ({ page }) => {
    await open(page, 'Seasons')
    await expect(page.getByRole('heading', { name: 'Seasons & Tournaments (3 · 2026)' })).toBeVisible()
    await page.getByPlaceholder('Search seasons or cities…').fill('bodrum')
    await expect(page.getByRole('heading', { name: 'Seasons & Tournaments (1 · 2026)' })).toBeVisible()
    await expect(seasonRow(page, 'Bodrum 2026 Knockout Trophy')).toBeVisible()
    await expect(seasonRow(page, 'Antalya 2026 Spring Cup')).toHaveCount(0)
  })

  test('latest published start date determines the public default, including future tournaments', async ({ page }) => {
    await open(page, 'Seasons')
    await page.getByRole('button', { name: 'Edit season İzmir 2026 Autumn League' }).click()
    const dialog = page.getByRole('dialog', { name: 'Edit Season: İzmir 2026 Autumn League' })
    await dialog.getByLabel('Start date *').fill('2026-12-01')
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(seasonRow(page, 'İzmir 2026 Autumn League')).toContainText('Public default')
    await expect(seasonRow(page, 'Antalya 2026 Spring Cup')).not.toContainText('Public default')
  })

  test('deleting a season needs its name typed and explains what is kept', async ({ page }) => {
    const data = fixture()
    data.stories = [{ id: 50, title: 'Autumn kicks off', status: 'Published', seasonId: 2, category: 'news', publishedAt: '01 Oct 2026' }]
    await open(page, 'Seasons', data)
    await page.getByRole('button', { name: 'Delete season İzmir 2026 Autumn League' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete season', exact: true })
    await expect(dialog).toContainText('Delete 2026 Autumn League and everything recorded under it?')
    await expect(dialog).toContainText('2 club entries in this season will be deleted; the clubs stay registered')
    await expect(dialog).toContainText('1 article and 0 media items are kept as unpublished drafts with no season')
    await expect(dialog).toContainText('Every fixture in this season is deleted, along with its match events')
    const confirm = dialog.getByRole('button', { name: 'Delete season', exact: true })
    await expect(confirm).toBeDisabled()
    await dialog.getByPlaceholder('Autumn League').fill('Autumn')
    await expect(confirm).toBeDisabled()
    await dialog.getByPlaceholder('Autumn League').fill('Autumn League')
    await expect(confirm).toBeEnabled()
    await confirm.click()
    await expect(dialog).toHaveCount(0)
    await expect(seasonRow(page, 'İzmir 2026 Autumn League')).toHaveCount(0)
    await viewSite(page)
    const menu = await publicSeasons(page)
    await expect(menu.getByRole('option', { name: /Autumn League/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(page.getByText('Autumn kicks off')).toHaveCount(0)
  })

  test('a deleted season\'s article is kept as an unpublished draft, as the dialog says', async ({ page }) => {
    const data = fixture()
    data.stories = [{ id: 50, title: 'Autumn kicks off', status: 'Published', seasonId: 2, category: 'news', publishedAt: '01 Oct 2026' }]
    await open(page, 'Seasons', data)
    await page.getByRole('button', { name: 'Delete season İzmir 2026 Autumn League' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete season', exact: true })
    await dialog.getByPlaceholder('Autumn League').fill('Autumn League')
    await dialog.getByRole('button', { name: 'Delete season', exact: true }).click()
    await navigate(page, 'Content')
    await expect(page.getByRole('row').filter({ hasText: 'Autumn kicks off' })).toContainText('Draft')
  })

  test('deleting a season deletes its clubs, as the dialog says', async ({ page }) => {
    await open(page, 'Seasons')
    await page.getByRole('button', { name: 'Delete season İzmir 2026 Autumn League' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete season', exact: true })
    await dialog.getByPlaceholder('Autumn League').fill('Autumn League')
    await dialog.getByRole('button', { name: 'Delete season', exact: true }).click()
    await navigate(page, 'Teams')
    await teamsSeasonFilter(page).selectOption('all')
    await expect(page.getByRole('row').filter({ hasText: 'ECHO' })).toHaveCount(0)
  })
})

/* ------------------------------------------------------------------ *
 * Draw canvases
 * ------------------------------------------------------------------ */

test.describe('Draw canvases', () => {
  function withStaleGroups(): Data {
    const data = fixture()
    // ECHO is an Autumn League club left in the Spring draw (a copied layout).
    data.seasons[0].groupLeague = { groupCount: 2, groups: [
      { id: 'group_a', name: 'Group A', slots: [{ position: 1, teamId: 5, teamName: 'ECHO' }] },
      { id: 'group_b', name: 'Group B', slots: [] },
    ] }
    return data
  }

  test('group draw: place clubs by click, save, and see groups publicly; other seasons\' clubs are not placed', async ({ page }) => {
    await open(page, 'Seasons', withStaleGroups())
    await page.getByRole('button', { name: 'Open group tables for Antalya 2026 Spring Cup' }).click()
    const canvas = page.getByRole('dialog', { name: /Antalya 2026 Spring Cup - Group tables/ })
    const sidebar = canvas.locator('.bracket-teams-sidebar')
    await expect(sidebar.locator('.sidebar-stats-row')).toHaveText(/Placed:\s*0 \/ 4 clubs/)
    await expect(sidebar).not.toContainText('ECHO')
    const group = (name: string) => canvas.locator('.group-card-column').filter({ hasText: name })
    await expect(group('Group A')).not.toContainText('ECHO')

    const place = async (club: string, groupName: string) => {
      await sidebar.locator('.draggable-team-card').filter({ hasText: club }).click()
      await group(groupName).locator('.league-file-slot-row.empty').click()
    }
    await place('ALPHA', 'Group A')
    await place('BRAVO', 'Group A')
    await place('CHARLIE', 'Group B')
    await place('DELTA', 'Group B')
    await expect(group('Group A')).toContainText('2 teams')
    await canvas.getByRole('button', { name: 'Save groups (4 teams)' }).click()
    await expect(canvas).toHaveCount(0)

    await navigate(page, 'Teams')
    await expect(page.getByRole('row').filter({ hasText: 'ALPHA' })).toContainText('Group A')
    await expect(page.getByRole('row').filter({ hasText: 'DELTA' })).toContainText('Group B')
    await viewSite(page)
    const tabs = page.getByRole('tablist', { name: 'Choose a group' })
    await expect(tabs.getByRole('tab', { name: 'Group A' })).toBeVisible()
    await tabs.getByRole('tab', { name: 'Group B' }).click()
    await expect(page.locator('#standings').getByRole('row').filter({ hasText: 'CHARLIE' })).toBeVisible()
  })

  test('group draw opened from the season editor does not show other seasons\' clubs', async ({ page }) => {
    await open(page, 'Seasons', withStaleGroups())
    await page.getByRole('button', { name: 'Edit season Antalya 2026 Spring Cup' }).click()
    await page.getByRole('dialog', { name: 'Edit Season: Antalya 2026 Spring Cup' }).getByRole('button', { name: /Open group tables/ }).click()
    const canvas = page.getByRole('dialog', { name: /Antalya 2026 Spring Cup - Group tables/ })
    await expect(canvas.locator('.group-card-column').filter({ hasText: 'Group A' })).not.toContainText('ECHO')
    await expect(canvas.locator('.bracket-teams-sidebar')).not.toContainText('ECHO')
  })

  test('league table canvas adds only this season\'s clubs and the table shows publicly', async ({ page }) => {
    const data = fixture()
    data.seasons[1].league = { teamCount: 0, slots: [] }
    await open(page, 'Seasons', data)
    await page.getByRole('button', { name: 'Open league table for İzmir 2026 Autumn League' }).click()
    let canvas = page.getByRole('dialog', { name: /İzmir 2026 Autumn League - League table/ })
    await canvas.getByRole('button', { name: 'Add all clubs' }).click()
    await canvas.getByRole('button', { name: 'Save league table (2 teams)' }).click()
    await expect(canvas).toHaveCount(0)
    await page.getByRole('button', { name: 'Open league table for İzmir 2026 Autumn League' }).click()
    canvas = page.getByRole('dialog', { name: /İzmir 2026 Autumn League - League table/ })
    await expect(canvas.getByText('2 teams placed')).toBeVisible()
    await canvas.getByRole('button', { name: 'Close', exact: true }).click()

    await viewSite(page)
    const menu = await publicSeasons(page)
    await menu.getByRole('option', { name: /Autumn League/ }).click()
    const standings = page.locator('#standings')
    await expect(standings.getByRole('row').filter({ hasText: 'ECHO' })).toBeVisible()
    await expect(standings.getByRole('row').filter({ hasText: 'FOXTROT' })).toBeVisible()
    await expect(standings.getByRole('row').filter({ hasText: 'ALPHA' })).toHaveCount(0)
  })

  test('knockout bracket canvas: auto draw, save, and the draw shows publicly', async ({ page }) => {
    await open(page, 'Seasons')
    await page.getByRole('button', { name: 'Open knockout bracket for Bodrum 2026 Knockout Trophy' }).click()
    const canvas = page.getByRole('dialog', { name: /Bodrum 2026 Knockout Trophy - Knockout bracket/ })
    await expect(canvas.locator('.bracket-teams-sidebar')).not.toContainText('ALPHA')
    await canvas.getByRole('button', { name: 'Auto draw' }).click()
    await canvas.getByRole('button', { name: 'Save bracket' }).click()
    await expect(canvas).toHaveCount(0)

    await viewSite(page)
    const menu = await publicSeasons(page)
    await menu.getByRole('option', { name: /Knockout Trophy/ }).click()
    const bracket = page.getByRole('region', { name: 'Knockout bracket' })
    for (const club of ['HOTEL', 'INDIA', 'JULIET', 'KILO']) await expect(bracket.getByText(club, { exact: true })).toBeVisible()
  })
})

/* ------------------------------------------------------------------ *
 * Teams
 * ------------------------------------------------------------------ */

test.describe('Teams', () => {
  test('a club registers without players, then needs five in its empty tournament squad', async ({ page }) => {
    await open(page, 'Teams')
    await teamsSeasonFilter(page).selectOption('2')
    await page.getByRole('button', { name: 'Register New Club' }).click()
    const registration = page.getByRole('dialog', { name: 'Register club', exact: true })
    await registration.getByLabel('Club name *').fill('GOLF')
    await registration.getByRole('button', { name: 'Save club registration' }).click()
    await expect(registration).toHaveCount(0)
    const registered = page.locator('tr').filter({ hasText: 'GOLF' })
    await expect(registered).toContainText('0')
    await page.getByLabel('Entry tournament').selectOption('2')
    await registered.getByRole('button', { name: 'Enter tournament' }).click()
    const dialog = page.getByRole('dialog', { name: 'Enter GOLF in 2026 — Autumn League' })
    await dialog.getByRole('button', { name: /Preset crests/ }).click()
    await dialog.getByTitle('Lion Champion Crest').click()
    await dialog.getByRole('button', { name: /^4\. Squad Roster/ }).click()
    await expect(dialog.getByRole('button', { name: /^4\. Squad Roster/ })).toContainText('(0/5+)')
    await dialog.getByRole('button', { name: /Create a new player/ }).click()
    const addNew = async (n: number) => {
      await dialog.getByPlaceholder('Player full name *').fill(`Golf Rookie ${n}`)
      await dialog.getByPlaceholder('Forma #').fill(String(n))
      await dialog.getByRole('button', { name: '+ Add to squad' }).click()
    }
    for (let n = 1; n <= 4; n++) await addNew(n)
    await dialog.getByRole('button', { name: 'Register Club', exact: true }).click()
    await expect(dialog.getByText('Add at least 5 players in the Squad tab before registering (4 so far).')).toBeVisible()
    await addNew(5)
    await dialog.getByRole('button', { name: 'Register Club', exact: true }).click()
    const created = page.getByRole('dialog', { name: 'Manage Club: GOLF' })
    await expect(created).toBeVisible()
    await created.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.teams-table tr').filter({ hasText: 'GOLF' })).toContainText('5 Players')
    await teamsSeasonFilter(page).selectOption('1')
    await expect(page.locator('.teams-table tr').filter({ hasText: 'GOLF' })).toHaveCount(0)
  })

  test('editing a club saves its staff and the public club page shows them', async ({ page }) => {
    await open(page, 'Teams')
    await page.getByRole('button', { name: 'Edit ALPHA details' }).click()
    const dialog = page.getByRole('dialog', { name: 'Manage Club: ALPHA' })
    await dialog.getByRole('button', { name: '2. Staff & Bio' }).click()
    await dialog.getByLabel('Manager / Director Name').fill('Jane Boss')
    await dialog.getByLabel('Club Biography & Background').fill('Founded by the QA department.')
    await dialog.getByRole('button', { name: 'Save Club Changes' }).click()
    await expect(dialog).toBeHidden() // a saved edit closes the form
    await expect(page.getByRole('row').filter({ hasText: 'ALPHA' })).toContainText('Jane Boss')

    await page.goto('/#site/team/1')
    const club = page.getByRole('dialog', { name: 'Club and squad' })
    await expect(club).toContainText('Jane Boss')
    await expect(club).toContainText('Founded by the QA department.')
  })

  test('a club without fixtures can move season, taking its squad', async ({ page }) => {
    await open(page, 'Teams')
    await teamsSeasonFilter(page).selectOption({ label: '2026 — Autumn League' })
    await page.getByRole('button', { name: 'Edit ECHO details' }).click()
    const dialog = page.getByRole('dialog', { name: 'Manage Club: ECHO' })
    await dialog.getByRole('button', { name: '3. Tournament & Group' }).click()
    const picker = dialog.getByLabel('Season *')
    await expect(picker).toBeEnabled()
    await expect(dialog.getByText('Changing the season moves this club and its squad.')).toBeVisible()
    await picker.selectOption('1')
    await dialog.getByRole('button', { name: 'Save Club Changes' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('row').filter({ hasText: 'ECHO' })).toHaveCount(0)

    await teamsSeasonFilter(page).selectOption({ label: '2026 — Spring Cup' })
    await expect(page.getByRole('row').filter({ hasText: 'ECHO' })).toContainText('6 Players (Registered)')
    await navigate(page, 'Players')
    await page.getByRole('button', { name: 'Edit player Echo P1' }).click()
    await expect(page.getByRole('dialog', { name: 'Edit Player: Echo P1' })).toContainText('2026 — Spring Cup · ECHO')
  })

  test('a club with fixtures has its season locked, with the reason shown', async ({ page }) => {
    await open(page, 'Teams')
    await page.getByRole('button', { name: 'Edit ALPHA details' }).click()
    const dialog = page.getByRole('dialog', { name: 'Manage Club: ALPHA' })
    await dialog.getByRole('button', { name: '3. Tournament & Group' }).click()
    await expect(dialog.getByLabel('Season *')).toBeDisabled()
    await expect(dialog.getByText('This entry has fixtures and stays in this season. Add the same club to another season below.')).toBeVisible()
  })

  test('a club with fixtures enters ongoing and future seasons without moving its original entry', async ({ page }) => {
    const data = fixture()
    data.seasons.push({ id: 4, city: 'Antalya', year: 2027, name: 'Future Cup', fullName: 'Antalya 2027 Future Cup', startDate: '2027-06-01', status: 'draft', seasonType: 'league' })
    data.matches[0] = { ...data.matches[0], matchStatus: 'completed', scoreSource: 'legacy', lineupSource: 'legacy', homeScore: 2, awayScore: 0, kickoffAt: '2026-10-01T15:00:00Z' }
    await open(page, 'Teams', data)
    for (const [target, name] of [[2, '2026 — Autumn League'], [4, '2027 — Future Cup']] as const) {
      await teamsSeasonFilter(page).selectOption('1')
      await page.getByRole('button', { name: 'Edit ALPHA details', exact: true }).click()
      let dialog = page.getByRole('dialog', { name: 'Manage Club: ALPHA' })
      await dialog.getByRole('button', { name: '3. Tournament & Group' }).click()
      await expect(dialog.getByLabel('Season *')).toBeDisabled()
      if (target === 4) await expect(dialog.getByLabel('Destination season').locator('option[value="2"]')).toHaveCount(0)
      await dialog.getByLabel('Destination season').selectOption(String(target))
      await dialog.getByRole('button', { name: 'Add to another season', exact: true }).click()
      dialog = page.getByRole('dialog', { name: `Enter ALPHA in ${name}`, exact: true })
      await expect(dialog.getByRole('button', { name: /^4\. Squad Roster/ })).toHaveText('4. Squad Roster (0/5+)')
      await dialog.getByRole('button', { name: /^4\. Squad Roster/ }).click()
      for (let id = 101; id <= 105; id++) {
        await dialog.locator('.inline-player-fields select').selectOption(String(id))
        await dialog.getByRole('button', { name: '+ Add to squad', exact: true }).click()
      }
      await dialog.getByRole('button', { name: 'Register Club', exact: true }).click()
      await page.getByRole('dialog', { name: 'Manage Club: ALPHA' }).getByRole('button', { name: 'Close', exact: true }).click()
    }
    await page.reload()
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('ccl-cup:data:v8')!))
    const alpha = saved.teams.filter((t: Team) => t.clubId === 1)
    expect(alpha.map((t: Team) => t.seasonId).sort()).toEqual([1, 2, 4])
    expect(alpha.find((t: Team) => t.seasonId === 1).id).toBe(1)
    expect(saved.matches[0]).toMatchObject({ homeTeamId: 1, homeScore: 2, awayScore: 0 })
    expect(saved.players.find((p: Player) => p.id === 101).squads.map((entry: { seasonId: number }) => entry.seasonId).sort()).toEqual([1, 2, 4])
  })

  test('an existing club keeps its identity and starts a new tournament squad empty', async ({ page }) => {
    await open(page, 'Teams')
    await page.getByRole('combobox', { name: 'Enter a club from another season' }).selectOption({ label: 'FOXTROT · last in 2026 — Autumn League' })
    const dialog = page.getByRole('dialog', { name: 'Enter FOXTROT in 2026 — Spring Cup' })
    await dialog.getByRole('button', { name: '4. Squad Roster (0/5+)' }).click()
    await dialog.getByRole('button', { name: /Create a new player/ }).click()
    for (let n = 1; n <= 5; n++) {
      await dialog.getByPlaceholder('Player full name *').fill(`Foxtrot New ${n}`)
      await dialog.getByPlaceholder('Forma #').fill(String(n))
      await dialog.getByRole('button', { name: '+ Add to squad' }).click()
    }
    await dialog.getByRole('button', { name: 'Register Club', exact: true }).click()
    const created = page.getByRole('dialog', { name: 'Manage Club: FOXTROT' })
    await expect(created).toBeVisible()
    await created.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.locator('.teams-table tr').filter({ hasText: 'FOXTROT' })).toContainText('5 Players')
    await teamsSeasonFilter(page).selectOption({ label: '2026 — Autumn League' })
    await expect(page.getByRole('row').filter({ hasText: 'FOXTROT' })).toBeVisible()
  })

  test('deleting a club confirms first; a club with fixtures cannot be deleted', async ({ page }) => {
    await open(page, 'Teams')
    await page.getByRole('button', { name: 'Delete club ALPHA' }).click()
    const refused = page.getByRole('dialog', { name: 'Club cannot be deleted' })
    await expect(refused).toContainText('appears in 1 fixture')
    await refused.locator('.confirm-actions').getByRole('button', { name: 'Close' }).click()
    await expect(page.getByRole('row').filter({ hasText: 'ALPHA' })).toBeVisible()

    await page.getByRole('button', { name: 'Delete club CHARLIE' }).click()
    const dialog = page.getByRole('dialog', { name: 'Delete club', exact: true })
    await expect(dialog).toContainText("6 players leave this season's squad")
    await dialog.getByRole('button', { name: 'Delete club', exact: true }).click()
    await expect(page.getByRole('row').filter({ hasText: 'CHARLIE' })).toHaveCount(0)
    await navigate(page, 'Players')
    await expect(page.getByRole('row').filter({ hasText: 'Charlie P1' })).toContainText('Free agent')
  })
})

/* ------------------------------------------------------------------ *
 * Squad canvas
 * ------------------------------------------------------------------ */

test('squad canvas saves a fixed eight-a-side club default and shows it publicly', async ({ page }) => {
  await open(page, 'Teams')
  await page.getByRole('button', { name: 'Formation and pitch canvas for ALPHA' }).click()
  let canvas = page.getByRole('dialog', { name: /ALPHA — Squad & formation/ })
  await expect(canvas.getByLabel('Formation:')).toHaveValue('8v8')
  await expect(canvas.getByLabel('Formation:').locator('option')).toHaveCount(1)
  await expect(canvas.getByRole('button', { name: /Pitch View \(6\/8\)/ })).toBeVisible()
  await canvas.getByRole('button', { name: /Save Squad to Club/ }).click()
  await expect(canvas).toHaveCount(0)
  await page.getByRole('button', { name: 'Formation and pitch canvas for ALPHA' }).click()
  canvas = page.getByRole('dialog', { name: /ALPHA — Squad & formation/ })
  await expect(canvas.getByLabel('Formation:')).toHaveValue('8v8')
  await canvas.getByRole('button', { name: 'Cancel' }).click()
  await page.goto('/#site/team/1')
  await expect(page.getByRole('dialog', { name: 'Club and squad' }).getByText('Lineup · 8-a-side · 3–3–1')).toBeVisible()
})

/* ------------------------------------------------------------------ *
 * Players
 * ------------------------------------------------------------------ */

test.describe('Players', () => {
  test('register a player into a club, then edit them', async ({ page }) => {
    await open(page, 'Players')
    await page.getByRole('button', { name: 'Register Player' }).click()
    let dialog = page.getByRole('dialog', { name: 'Register New Player' })
    await dialog.getByLabel('Full Name *').fill('New Signing')
    await dialog.getByLabel('Club this season').selectOption({ label: 'BRAVO (🇹🇷)' })
    await dialog.getByLabel('Shirt Number (1–99)').fill('77')
    await dialog.getByLabel('Position').selectOption('midfielder')
    await dialog.getByRole('button', { name: 'Register Player', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const row = page.getByRole('row').filter({ hasText: 'New Signing' })
    await expect(row).toContainText('BRAVO')
    await expect(row).toContainText('77')

    await page.getByRole('button', { name: 'Edit player New Signing' }).click()
    dialog = page.getByRole('dialog', { name: 'Edit Player: New Signing' })
    await dialog.getByLabel('Full Name *').fill('Renamed Signing')
    await dialog.getByLabel('Shirt Number (1–99)').fill('8')
    await dialog.getByLabel('Team Captain (C)').check()
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const renamed = page.getByRole('row').filter({ hasText: 'Renamed Signing' })
    await expect(renamed).toContainText('8')
    await expect(renamed.getByLabel('Team Captain')).toBeVisible()
  })

  test('pre-kickoff transfers can leave an entered club below five', async ({ page }) => {
    await open(page, 'Players')
    await page.getByRole('button', { name: 'Edit player Alpha P6' }).click()
    let dialog = page.getByRole('dialog', { name: 'Edit Player: Alpha P6' })
    await dialog.getByLabel('Club this season').selectOption({ label: 'BRAVO (🇹🇷)' })
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('row').filter({ hasText: 'Alpha P6' })).toContainText('BRAVO')

    await page.getByRole('button', { name: 'Edit player Alpha P5' }).click()
    dialog = page.getByRole('dialog', { name: 'Edit Player: Alpha P5' })
    await dialog.getByLabel('Club this season').selectOption({ label: 'BRAVO (🇹🇷)' })
    await dialog.getByRole('button', { name: 'Save Changes', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('row').filter({ hasText: 'Alpha P5' })).toContainText('BRAVO')
  })

  test('the squad roster hub allows releases below the entry minimum', async ({ page }) => {
    await open(page, 'Teams')
    await page.getByRole('button', { name: 'Manage squad roster for ALPHA' }).click()
    const hub = page.getByRole('dialog', { name: 'Squad Roster Hub: ALPHA' })
    await hub.getByRole('button', { name: /Create a new player/ }).click()
    await hub.getByPlaceholder('Player Full Name *').fill('Hub Recruit')
    await hub.getByPlaceholder('Shirt #').fill('23')
    await hub.getByRole('button', { name: '+ Register' }).click()
    await expect(hub.getByRole('row').filter({ hasText: 'Hub Recruit' })).toBeVisible()
    await expect(hub).toContainText('7 Players (Ready)')

    await hub.getByRole('row').filter({ hasText: 'Hub Recruit' }).getByRole('button', { name: /Remove/ }).click()
    await hub.getByRole('row').filter({ hasText: 'Alpha P6' }).getByRole('button', { name: /Remove/ }).click()
    await expect(hub).toContainText('5 Players (Ready)')
    await hub.getByRole('row').filter({ hasText: 'Alpha P5' }).getByRole('button', { name: /Remove/ }).click()
    await expect(hub.getByRole('row').filter({ hasText: 'Alpha P5' })).toHaveCount(0)
  })
})

/* ------------------------------------------------------------------ *
 * Matches
 * ------------------------------------------------------------------ */

async function logGoal(page: Page, fixtureName: string, team: string, player: string) {
  await matchRow(page, fixtureName).getByTitle('Manage events').click()
  const events = page.getByRole('dialog', { name: `Match Events Timeline: ${fixtureName}` })
  await events.getByLabel('Team', { exact: true }).selectOption(team)
  await events.getByLabel('Player', { exact: true }).selectOption({ label: player })
  await events.getByLabel('Event Type').selectOption('goal')
  await events.getByRole('button', { name: 'Add Event to Timeline' }).click()
  await events.getByRole('button', { name: 'Close', exact: true }).click()
}

test.describe('Matches', () => {
  test('schedule a fixture; the same club on both sides is refused', async ({ page }) => {
    await open(page, 'Matches')
    await page.getByRole('button', { name: 'Schedule Match' }).click()
    const dialog = page.getByRole('dialog', { name: 'Create match fixture' })
    await expect(dialog.getByLabel('Season *')).toHaveValue('1')
    await dialog.getByLabel('Home team').selectOption('CHARLIE')
    await dialog.getByLabel('Away team').selectOption('CHARLIE')
    await dialog.getByRole('button', { name: 'Create fixture' }).click()
    await expect(dialog.getByText('Home and Away teams must be different.')).toBeVisible()
    await dialog.getByLabel('Away team').selectOption('DELTA')
    await dialog.getByLabel('Stage').fill('Group B')
    await dialog.getByLabel('Venue').fill('QA Park')
    await dialog.getByLabel('Date', { exact: true }).fill('25 Oct')
        await dialog.getByRole('button', { name: 'Create fixture' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Matches & Scorekeeping (2)' })).toBeVisible()
    await expect(matchRow(page, 'CHARLIE vs DELTA')).toContainText('QA Park')
    await viewSite(page)
    await expect(page.getByText('QA Park').first()).toBeVisible()
  })

  test('registered-player goals derive the score; explicit completion updates standings', async ({ page }) => {
    await open(page, 'Matches')
    await logGoal(page, 'ALPHA vs BRAVO', 'ALPHA', '#6 Alpha P6')
    await logGoal(page, 'ALPHA vs BRAVO', 'ALPHA', '#5 Alpha P5')
    await logGoal(page, 'ALPHA vs BRAVO', 'BRAVO', '#6 Bravo P6')
    await matchRow(page, 'ALPHA vs BRAVO').getByTitle('Edit score & details').click()
    const dialog = page.getByRole('dialog', { name: 'Match Scorekeeper: ALPHA vs BRAVO' })
    await expect(dialog.locator('select[name="matchStatus"]')).toHaveValue('scheduled')
    await expect(dialog.getByLabel('ALPHA score', { exact: true })).toHaveValue('2')
    await expect(dialog.getByLabel('ALPHA score', { exact: true })).toHaveAttribute('readonly', '')
    await dialog.getByLabel('Match Status', { exact: true }).selectOption('completed')
    await dialog.getByRole('button', { name: 'Save match result' }).click()
    await expect(dialog).toHaveCount(0)
    const row = matchRow(page, 'ALPHA vs BRAVO')
    await expect(row).toContainText('2 - 1')
    await expect(row).toContainText('completed')

    await navigate(page, 'Standings')
    const groupA = page.locator('.admin-panel').filter({ has: page.getByRole('heading', { name: 'Group A' }) })
    await expect(groupA.getByRole('row').nth(1)).toContainText('ALPHA')
    await expect(groupA.getByRole('row').filter({ hasText: 'ALPHA' }).getByRole('cell').nth(9)).toHaveText('3')

    await viewSite(page)
    const standings = page.locator('#standings')
    await expect(standings.getByRole('row').filter({ hasText: 'ALPHA' }).locator('.pg-points')).toHaveText('3')
    await expect(standings.getByRole('row').filter({ hasText: 'BRAVO' }).locator('.pg-points')).toHaveText('0')
  })

  test('drawn knockouts require direct penalties and a winner', async ({ page }) => {
    const data = fixture()
    data.matches[0].stage = 'Final'
    await open(page, 'Matches', data)
    await matchRow(page, 'ALPHA vs BRAVO').getByTitle('Edit score & details').click()
    const dialog = page.getByRole('dialog', { name: 'Match Scorekeeper: ALPHA vs BRAVO' })
    await dialog.getByLabel('Match Status', { exact: true }).selectOption('completed')
    await dialog.getByRole('button', { name: 'Save match result' }).click()
    await expect(dialog.getByText('A drawn knockout match requires direct penalties with a winner.')).toBeVisible()
    await dialog.getByLabel('ALPHA penalties').fill('3')
    await dialog.getByLabel('BRAVO penalties').fill('3')
    await dialog.getByRole('button', { name: 'Save match result' }).click()
    await expect(dialog.getByText('A penalty shootout needs a winner. Enter the final shootout score.')).toBeVisible()
    await dialog.getByLabel('ALPHA penalties').fill('4')
    await dialog.getByRole('button', { name: 'Save match result' }).click()
    await expect(dialog).toHaveCount(0)
    await expect(matchRow(page, 'ALPHA vs BRAVO')).toContainText('(4–3p)')
  })

  test('match events: goals move the score, cards do not, deleting a goal takes it back off', async ({ page }) => {
    await open(page, 'Matches')
    await matchRow(page, 'ALPHA vs BRAVO').getByTitle('Manage events').click()
    const events = page.getByRole('dialog', { name: 'Match Events Timeline: ALPHA vs BRAVO' })
    const addButton = events.getByRole('button', { name: 'Add Event to Timeline' })
    await expect(addButton).toBeVisible()
    // It used to render white-on-white; the admin green must reach it.
    expect(await addButton.evaluate((el) => [getComputedStyle(el).backgroundColor, getComputedStyle(el).color])).toEqual(['rgb(36, 159, 52)', 'rgb(255, 255, 255)'])

    const add = async (team: string, player: string, type: string, minute: string) => {
      await events.getByLabel('Team').selectOption(team)
      await events.getByLabel('Player').selectOption({ label: player })
      await events.getByLabel('Event Type').selectOption(type)
      await events.getByLabel('Minute (0–50)').fill(minute)
      await addButton.click()
    }
    await add('ALPHA', '#6 Alpha P6', 'goal', '12')
    await expect(events.getByRole('heading', { name: 'Logged Events (1)' })).toBeVisible()
    await expect(matchRow(page, 'ALPHA vs BRAVO')).toContainText('1 - 0')
    await add('BRAVO', '#4 Bravo P4', 'penalty_scored', '30')
    await expect(matchRow(page, 'ALPHA vs BRAVO')).toContainText('1 - 1')
    await add('BRAVO', '#2 Bravo P2', 'yellow_card', '40')
    await add('ALPHA', '#3 Alpha P3', 'red_card', '45')
    await expect(events.getByRole('heading', { name: 'Logged Events (4)' })).toBeVisible()
    await expect(matchRow(page, 'ALPHA vs BRAVO')).toContainText('1 - 1')

    await events.locator('.event-item').filter({ hasText: 'Alpha P6' }).getByTitle('Remove event').click()
    const confirm = page.getByRole('dialog', { name: 'Delete match event' })
    await expect(confirm).toContainText('Remove the goal for Alpha P6 at 12\'?')
    await confirm.getByRole('button', { name: 'Delete event' }).click()
    await expect(events.getByRole('heading', { name: 'Logged Events (3)' })).toBeVisible()
    await expect(matchRow(page, 'ALPHA vs BRAVO')).toContainText('0 - 1')
  })

  test('an own goal can be recorded and counts for the other club', async ({ page }) => {
    await open(page, 'Matches')
    await matchRow(page, 'ALPHA vs BRAVO').getByTitle('Manage events').click()
    const events = page.getByRole('dialog', { name: 'Match Events Timeline: ALPHA vs BRAVO' })
    await expect(events.getByLabel('Event Type').locator('option', { hasText: /own goal/i })).toHaveCount(1)
    await events.getByLabel('Team').selectOption('BRAVO')
    await events.getByLabel('Event Type').selectOption('own_goal')
    await events.getByRole('button', { name: 'Add Event to Timeline' }).click()
    await expect(matchRow(page, 'ALPHA vs BRAVO')).toContainText('1 - 0')
  })

  test('deleting a played fixture warns that the table changes', async ({ page }) => {
    const data = fixture()
    Object.assign(data.matches[0], { homeScore: 1, awayScore: 0, matchStatus: 'completed' })
    await open(page, 'Matches', data)
    await matchRow(page, 'ALPHA vs BRAVO').getByTitle('Delete match').click()
    const dialog = page.getByRole('dialog', { name: 'Delete fixture' })
    await expect(dialog).toContainText('This result counts towards the table')
    await dialog.getByRole('button', { name: 'Delete fixture' }).click()
    await expect(page.getByRole('heading', { name: 'Matches & Scorekeeping (0)' })).toBeVisible()
  })
})

/* ------------------------------------------------------------------ *
 * Content, media, sponsors
 * ------------------------------------------------------------------ */

test.describe('Content and media', () => {
  test('stories: draft stays hidden, publish shows it, edit, unpublish and delete', async ({ page }) => {
    await open(page, 'Content')
    await page.getByRole('button', { name: 'New Story' }).click()
    let dialog = page.getByRole('dialog', { name: 'Write New Story' })
    await dialog.getByLabel('Headline / Title *').fill('Cup draw announced')
    await dialog.getByRole('combobox', { name: /^Season/ }).selectOption({ label: '2026 — Spring Cup' })
    await dialog.getByLabel('Publication Status').selectOption('Draft')
    await dialog.getByLabel('Summary (Brief teaser)').fill('Groups are set.')
    await expect(dialog.getByLabel('Publication Status')).toHaveValue('Draft')
    await dialog.getByRole('button', { name: 'Save Draft' }).click()
    await expect(dialog).toHaveCount(0)
    const row = () => page.getByRole('row').filter({ hasText: /Cup draw/ })
    await expect(row()).toContainText('Draft')

    await viewSite(page)
    await expect(page.getByText('Cup draw announced')).toHaveCount(0)
    await page.goto('/#admin/content')
    await row().getByRole('button', { name: 'Publish' }).click()
    await expect(row()).toContainText('Published')
    await viewSite(page)
    await expect(page.getByText('Cup draw announced').first()).toBeVisible()

    await page.goto('/#admin/content')
    await row().getByRole('button', { name: 'Edit' }).click()
    dialog = page.getByRole('dialog', { name: 'Edit Story Article' })
    await dialog.getByLabel('Headline / Title *').fill('Cup draw confirmed')
    await dialog.getByRole('button', { name: 'Publish Story' }).click()
    await expect(row()).toContainText('Cup draw confirmed')
    await row().getByRole('button', { name: 'Unpublish' }).click()
    await expect(row()).toContainText('Draft')

    await page.getByRole('button', { name: 'Delete Cup draw confirmed' }).click()
    await page.getByRole('dialog', { name: 'Delete story' }).getByRole('button', { name: 'Delete story' }).click()
    await expect(row()).toHaveCount(0)
  })

  test('image upload field: a picked image is previewed, a bad type refused, and cancelling discards it', async ({ page }) => {
    await open(page, 'Content')
    await page.getByRole('button', { name: 'New Story' }).click()
    let dialog = page.getByRole('dialog', { name: 'Write New Story' })
    const field = dialog.locator('.image-upload-field')
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
    await field.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
    await expect(field.getByText('Use a PNG, JPG, WEBP, SVG or GIF image.')).toBeVisible()
    await field.locator('input[type="file"]').setInputFiles({ name: 'cover.png', mimeType: 'image/png', buffer: png })
    await expect(field.locator('.image-upload-preview img')).toHaveAttribute('src', /^data:image\/png/)
    await expect(field.getByPlaceholder('Upload a file, or paste an image URL')).toHaveValue(/^data:image\/png/)
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)

    await page.getByRole('button', { name: 'New Story' }).click()
    dialog = page.getByRole('dialog', { name: 'Write New Story' })
    await expect(dialog.locator('.image-upload-field').getByPlaceholder('Upload a file, or paste an image URL')).toHaveValue('')
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('ccl-cup:data:v8')!).stories.length)).toBe(0)
  })

  // Media and sponsor writes need Supabase; in local demo mode the screens
  // list seeded rows and must say why a change cannot be saved.
  test('media and sponsors: seeded items show publicly; demo mode explains why edits need Supabase', async ({ page }) => {
    const data = fixture()
    data.sponsors = [{ id: 1, name: 'Anadolu Enerji', displayOrder: 0, isActive: true, seasonId: 1, websiteUrl: 'https://example.com' }]
    data.media = [{ id: 1, title: 'Opening night highlights', kind: 'highlight', externalUrl: 'https://example.com/v', isPublished: true, seasonId: 1, sponsorId: 1 }]
    await open(page, 'Media', data)
    const card = page.locator('.media-admin-card').filter({ hasText: 'Opening night highlights' })
    await expect(card).toContainText('Published')
    await expect(card).toContainText('Presented by Anadolu Enerji')
    await card.getByRole('button', { name: 'Unpublish' }).click()
    await expect(page.getByText('Media needs a connected Supabase project.')).toBeVisible()
    await page.getByRole('button', { name: 'Add asset' }).click()
    const dialog = page.getByRole('dialog', { name: 'Add media asset' })
    await dialog.getByLabel('Title *').fill('Matchday 2')
    await dialog.getByLabel('Link URL *').fill('https://example.com/m2')
    await dialog.getByRole('button', { name: 'Save asset' }).click()
    await expect(dialog.getByText('Media needs a connected Supabase project.')).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()

    await navigate(page, 'Sponsors')
    const sponsor = page.getByRole('row').filter({ hasText: 'Anadolu Enerji' })
    await expect(sponsor).toContainText('Active')
    await sponsor.getByRole('button', { name: 'Hide' }).click()
    await expect(page.getByText('Sponsors needs a connected Supabase project.')).toBeVisible()

    await viewSite(page)
    await expect(page.getByRole('heading', { name: 'Highlights' })).toBeVisible()
    await expect(page.getByText('Opening night highlights')).toBeVisible()
    await expect(page.locator('#sponsors')).toContainText('Anadolu Enerji')
    // Scoped to the season: gone when another season is selected.
    const menu = await publicSeasons(page)
    await menu.getByRole('option', { name: /Autumn League/ }).click()
    await expect(page.getByText('Opening night highlights')).toHaveCount(0)
  })
})

/* ------------------------------------------------------------------ *
 * Moderation, users, settings, overview
 * ------------------------------------------------------------------ */

test.describe('Organisation', () => {
  // On a 390px phone no admin screen may be wider than the screen: filter
  // selects shrink to fit and `.table-wrap` tables scroll inside their card,
  // so dialogs open on-screen and can be tapped.
  test('every admin screen fits the screen width', async ({ page }) => {
    const data = fixture()
    data.sponsors = [{ id: 1, name: 'Anadolu Enerji', displayOrder: 0, isActive: true, seasonId: 1, websiteUrl: 'https://example.com' }]
    await open(page, 'Overview', data)
    const overflowing: string[] = []
    for (const section of ['Seasons', 'Teams', 'Players', 'Matches', 'Standings', 'Content', 'Comments', 'Media', 'Sponsors', 'Users', 'Settings']) {
      await navigate(page, section)
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= Math.ceil(window.visualViewport!.width))
      if (!fits) overflowing.push(section)
    }
    expect(overflowing).toEqual([])
  })

  test('comments and users need Supabase and say so in demo mode; moderation defaults to the current season', async ({ page }) => {
    await open(page, 'Comments')
    await expect(page.getByText('Comment moderation needs a connected Supabase project.')).toBeVisible()
    await expect(page.locator('.filter-group').filter({ hasText: 'Season:' }).locator('select')).toHaveValue('1')
    await navigate(page, 'Users')
    await expect(page.getByText('User management needs a connected Supabase project.')).toBeVisible()
  })

  test('site settings validate links and WhatsApp, then show on the public site', async ({ page }) => {
    await open(page, 'Settings')
    const form = page.locator('form.admin-form')
    await form.getByLabel('About — introduction').fill('The QA cup for organisers.')
    await form.getByLabel('Competition rules (one per line)').fill('Rule one for QA\nRule two for QA')
    await form.getByLabel('Instagram link').fill('http://instagram.com/cclcup')
    await form.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('The Instagram link must be a full https:// address.')).toBeVisible()
    await form.getByLabel('Instagram link').fill('https://instagram.com/cclcup')
    await form.getByLabel('WhatsApp number').fill('1234567')
    await form.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByText('Enter the WhatsApp number in international format: 8 to 15 digits, country code first.')).toBeVisible()
    await form.getByLabel('WhatsApp number').fill('+90 555 123 4567')
    await form.getByRole('button', { name: 'Save settings' }).click()
    await expect(page.getByRole('status')).toHaveText('Saved. The public site shows the new settings on its next load.')
    await expect(form.getByLabel('WhatsApp number')).toHaveValue('905551234567')

    await page.goto('/#site')
    await expect(page.getByText('The QA cup for organisers.')).toBeVisible()
    await expect(page.locator('#about')).toContainText('Rule two for QA')
    await expect(page.getByRole('link', { name: 'Instagram' })).toHaveAttribute('href', 'https://instagram.com/cclcup')
    await expect(page.getByRole('link', { name: 'Chat with us on WhatsApp' })).toHaveAttribute('href', /^https:\/\/wa\.me\/905551234567\?text=/)
  })

  test('overview shows live counts and quick actions; signing out returns to the login', async ({ page }) => {
    await open(page, 'Overview')
    const metrics = page.locator('.metric-strip')
    await expect(metrics.locator('div').filter({ hasText: 'Seasons & Tournaments' })).toContainText('1')
    await expect(metrics.locator('div').filter({ hasText: 'Clubs & Teams' })).toContainText('4')
    await expect(metrics.locator('div').filter({ hasText: 'Registered Players' })).toContainText('24')
    await expect(metrics.locator('div').filter({ hasText: 'Scheduled Matches' })).toContainText('1')
    await page.getByLabel('Overview tournament').selectOption('2')
    await expect(metrics.locator('div').filter({ hasText: 'Clubs & Teams' })).toContainText('2')
    await expect(metrics.locator('div').filter({ hasText: 'Registered Players' })).toContainText('12')
    await expect(metrics.locator('div').filter({ hasText: 'Scheduled Matches' })).toContainText('0')
    await page.locator('.quick-actions').getByRole('button', { name: 'Schedule Match' }).click()
    await expect(page.getByRole('dialog', { name: 'Create match fixture' })).toBeVisible()
    await page.getByRole('dialog', { name: 'Create match fixture' }).getByRole('button', { name: 'Cancel' }).click()

    const menu = page.getByRole('button', { name: 'Open admin menu', exact: true })
    if (await menu.isVisible()) await menu.click()
    await page.getByRole('button', { name: 'Sign out' }).click()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Email', { exact: true })).toBeVisible()
  })
})
