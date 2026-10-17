import assert from 'node:assert/strict'
import { allRows } from '../src/lib/allRows'

let checks = 0
async function check(name: string, fn: () => Promise<void>) { await fn(); checks++; console.log(`  ok   ${name}`) }

// A fake table of 2,405 rows behind an API that returns at most `cap` rows per request.
const table = Array.from({ length: 2405 }, (_, i) => i)
const api = (cap: number) => (from: number, to: number) =>
  Promise.resolve({ data: table.slice(from, Math.min(to + 1, from + cap)), error: null })

await check('reads every row past the 1000-row cap', async () => {
  const { data, error } = await allRows(api(1000))
  assert.equal(error, null)
  assert.deepEqual(data, table)
})

await check('a lower server cap still reads every row once', async () => {
  const { data } = await allRows(api(300))
  assert.deepEqual(data, table)
})

await check('an error stops and is returned', async () => {
  const { error } = await allRows(() => Promise.resolve({ data: null, error: new Error('boom') }))
  assert.match(String(error), /boom/)
})

console.log(`allRows: ${checks} checks passed`)
