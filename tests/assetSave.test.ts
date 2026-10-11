import assert from 'node:assert/strict'
import { saveWithAsset } from '../src/lib/assetSaveUtils'

let discarded = 0
const fresh = async () => ({ url: 'https://example.test/crest.svg', path: 'logos/new.svg' })
const discard = async () => { discarded++ }
await assert.rejects(saveWithAsset(fresh, async () => { throw new Error('Duplicate club') }, discard), /Duplicate club/)
assert.equal(discarded, 1, 'a rejected row discards only its new upload')
await assert.rejects(saveWithAsset(async () => ({ url: 'existing.svg' }), async () => { throw new Error('Rejected') }, discard))
assert.equal(discarded, 1, 'an existing crest is never discarded')
await assert.rejects(saveWithAsset(async () => { throw new Error('Upload failed') }, async () => { throw new Error('Should not persist') }, discard), /Upload failed/)
assert.equal(discarded, 1, 'a failed upload does not trigger row save or cleanup')
assert.equal(await saveWithAsset(fresh, async (url) => url, discard), 'https://example.test/crest.svg')
assert.equal(discarded, 1, 'a committed club keeps its crest')
await assert.rejects(saveWithAsset(fresh, async () => { throw new Error('Duplicate club') }, async () => { throw new Error('Storage unavailable') }), /Duplicate club.*could not be cleaned up/)
console.log('5 asset save checks passed')
