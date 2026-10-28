import assert from 'node:assert/strict'
import { isDefinitiveSaveRejection, saveWithAsset } from '../src/lib/assetSaveUtils'

let discarded = 0
const fresh = async () => ({ url: 'https://example.test/crest.svg', path: 'logos/new.svg' })
const discard = async () => { discarded++ }
await assert.rejects(saveWithAsset(fresh, async () => { throw Object.assign(new Error('Duplicate club'), { code: '23505' }) }, discard), /Duplicate club/)
assert.equal(discarded, 1, 'a rejected row discards only its new upload')
await assert.rejects(saveWithAsset(async () => ({ url: 'existing.svg' }), async () => { throw new Error('Rejected') }, discard))
assert.equal(discarded, 1, 'an existing crest is never discarded')
await assert.rejects(saveWithAsset(async () => { throw new Error('Upload failed') }, async () => { throw new Error('Should not persist') }, discard), /Upload failed/)
assert.equal(discarded, 1, 'a failed upload does not trigger row save or cleanup')
assert.equal(await saveWithAsset(fresh, async (url) => url, discard), 'https://example.test/crest.svg')
assert.equal(discarded, 1, 'a committed club keeps its crest')
await assert.rejects(saveWithAsset(fresh, async () => { throw Object.assign(new Error('Duplicate club'), { code: '23505' }) }, async () => { throw new Error('Storage unavailable') }), /Duplicate club.*could not be cleaned up/)
assert.equal(isDefinitiveSaveRejection(new Error('Wrapper', { cause: { code: '42501' } })), true)
assert.equal(isDefinitiveSaveRejection(new Error('Network timeout')), false)
await assert.rejects(saveWithAsset(fresh, async () => { throw new Error('Connection lost') }, discard), /uncertain.*retained/)
assert.equal(discarded, 1, 'an ambiguous commit preserves its uploaded image')
console.log('8 asset save checks passed')
