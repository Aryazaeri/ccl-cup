import assert from 'node:assert/strict'
import { DEFAULT_SITE_SETTINGS, cleanSiteSettings, whatsappLink } from '../src/lib/siteSettings'

let checks = 0
function check(name: string, fn: () => void) { fn(); checks++; console.log(`  ok   ${name}`) }

check('defaults are valid and leave contact links empty', () => {
  const { settings, error } = cleanSiteSettings(DEFAULT_SITE_SETTINGS)
  assert.equal(error, '')
  assert.deepEqual([settings.instagramUrl, settings.youtubeUrl, settings.linkedinUrl, settings.whatsappNumber], ['', '', '', ''])
})

check('default rules state the five-player minimum and permitted transfers (item 16)', () => {
  const rules = DEFAULT_SITE_SETTINGS.rules.join(' ')
  assert.match(rules, /at least five players/)
  assert.match(rules, /Transfers during a season are allowed/)
  assert.doesNotMatch(rules, /only one club per season/)
})

check('fields are trimmed, blank rules dropped, WhatsApp kept to digits', () => {
  const { settings, error } = cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, aboutIntro: '  Hi  ', rules: [' A ', '', '  '], whatsappNumber: '+90 555 123 45 67' })
  assert.equal(error, '')
  assert.equal(settings.aboutIntro, 'Hi')
  assert.deepEqual(settings.rules, ['A'])
  assert.equal(settings.whatsappNumber, '905551234567')
})

check('links must be full https addresses', () => {
  assert.match(cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, instagramUrl: 'instagram.com/ccl' }).error, /Instagram link/)
  assert.match(cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, youtubeUrl: 'http://youtube.com/x' }).error, /YouTube link/)
  assert.equal(cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, linkedinUrl: 'https://linkedin.com/company/ccl' }).error, '')
})

check('WhatsApp numbers need 8 to 15 digits', () => {
  assert.match(cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, whatsappNumber: '12345' }).error, /8 to 15 digits/)
  assert.equal(cleanSiteSettings({ ...DEFAULT_SITE_SETTINGS, whatsappNumber: '905551234567' }).error, '')
})

check('WhatsApp link is empty without a number and encodes the greeting', () => {
  assert.equal(whatsappLink({ whatsappNumber: '', whatsappMessage: 'Hi' }), '')
  assert.equal(whatsappLink({ whatsappNumber: '905551234567', whatsappMessage: 'Hi there!' }), 'https://wa.me/905551234567?text=Hi%20there!')
})

console.log(`site settings: ${checks} checks passed`)
