import fs from 'node:fs'
import path from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import assert from 'node:assert/strict'
const workdir = process.env.CCL_TEST_WORKDIR
assert.ok(workdir, 'Set CCL_TEST_WORKDIR to the disposable local Supabase workdir')
assert.ok(!fs.existsSync(path.join(workdir, 'supabase/.temp/project-ref')), 'Refuse linked projects')
const status = JSON.parse(execFileSync('supabase', ['status', '--workdir', workdir, '-o', 'json'], { encoding: 'utf8', stdio: ['ignore','pipe','pipe'] }))
assert.match(status.API_URL, /^http:\/\/(127\.0\.0\.1|localhost):\d+$/)
const result = spawnSync(path.join(process.cwd(), 'node_modules/.bin/playwright'), ['test', '--config', 'playwright.connected.config.ts', ...process.argv.slice(2)], {
  stdio: 'inherit', env: { ...process.env, CCL_TEST_SUPABASE_URL: status.API_URL, CCL_TEST_SUPABASE_KEY: status.ANON_KEY ?? status.PUBLISHABLE_KEY },
})
process.exitCode = result.status ?? 1
