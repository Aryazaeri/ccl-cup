import type { Story } from '../types'

export function isStoryPublic(story: Story, now = Date.now()): boolean {
  if (story.status === 'Published') return !story.publishedAt || Date.parse(story.publishedAt) <= now
  return story.status === 'Scheduled' && !!story.publishedAt && Date.parse(story.publishedAt) <= now
}

export function publicationDate(value?: string, locale = 'en-GB'): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat(locale, {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul',
  }).format(date) : value
}

export function publicationInput(value?: string): string {
  if (!value || !Number.isFinite(Date.parse(value))) return ''
  return new Date(Date.parse(value) + 3 * 60 * 60 * 1000).toISOString().slice(0, 16)
}
