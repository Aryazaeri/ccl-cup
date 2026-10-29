export function countdownDemoData(now = Date.now()) {
  const kickoffAt = new Date(now + 2 * 86400000 + 3 * 3600000).toISOString()
  return {
    seasons: [{ id: 900000, city: 'Antalya', year: 2026, name: 'Countdown demo', fullName: 'ICC countdown demo — test fixture', status: 'published' }],
    teams: ['Demo Home', 'Demo Away'].map((name, i) => ({ id: i + 1, clubId: i + 1, seasonId: 900000, name, countryCode: 'TR', color: '#0a3a28', played: 0, points: 0, goalDifference: 0 })),
    players: [], stories: [], sponsors: [],
    matches: [{ id: 900001, seasonId: 900000, home: 'Demo Home', away: 'Demo Away', homeTeamId: 1, awayTeamId: 2, stage: 'friendly', date: new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/Istanbul' }).format(new Date(kickoffAt)), time: new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Istanbul' }).format(new Date(kickoffAt)), kickoffAt, venue: 'Demo pitch — test fixture', matchStatus: 'scheduled', status: 'Scheduled', events: [], squads: [], streamUrl: 'https://www.youtube.com/watch?v=iMk7phHzBo4' }],
    media: Array.from({ length: 8 }, (_, i) => ({ id: 910000 + i, seasonId: 900000, matchId: 900001, title: `Demo media ${i + 1} — archive replay sample`, kind: i === 7 ? 'photo' : 'highlight', isPublished: true, externalUrl: i === 7 ? 'https://drive.google.com/drive/folders/17h8AYkfMjcbKS_gw_vlI9-JH5qxQQJFf?usp=share_link' : 'https://www.youtube.com/watch?v=99tSqk3lYp4' })),
  }
}
