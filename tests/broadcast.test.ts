import assert from 'node:assert/strict'
import { broadcastUrlError, featuredBroadcast, youtubeEmbedUrl, youtubeVideoId } from '../src/lib/broadcast'
import type { Match } from '../src/types'
const id='M7lc1UVf-VE'
for(const url of [`https://www.youtube.com/watch?v=${id}&si=tracking`,`https://youtu.be/${id}?si=tracking`,`https://www.youtube.com/live/${id}`,`https://www.youtube.com/embed/${id}`,`https://m.youtube.com/shorts/${id}`,`https://www.youtube-nocookie.com/embed/${id}`])assert.equal(youtubeVideoId(url),id)
for(const url of [`javascript:alert(1)`,`https://youtube.com.evil.example/watch?v=${id}`,`https://evil.youtube.com/watch?v=${id}`,`https://youtube.com@evil.example/watch?v=${id}`,`https://www.youtube.com/watch?v=bad`, `https://www.youtube.com/@channel/live`,`https://www.youtube.com/playlist?list=123`])assert.equal(youtubeVideoId(url),undefined)
assert.equal(youtubeEmbedUrl(id),`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0`)
assert.throws(()=>youtubeEmbedUrl('invalid/identity'))
assert.equal(broadcastUrlError(''),'')
assert.equal(broadcastUrlError('https://example.com/broadcast'),'')
assert.ok(broadcastUrlError('https://youtube.com/@channel/live'))
assert.ok(broadcastUrlError('javascript:alert(1)'))
const match=(n:number,status:Match['matchStatus']):Match=>({id:n,home:'A',away:'B',date:'20 Dec',time:'18:00',venue:'CCL Arena',stage:'Group',status:'Scheduled',matchStatus:status,kickoffAt:`2026-12-${20+n}T15:00:00Z`,streamUrl:`https://youtu.be/${id}`})
assert.equal(featuredBroadcast([match(1,'scheduled'),match(2,'live')])?.id,2)
assert.equal(featuredBroadcast([match(2,'scheduled'),match(1,'scheduled')])?.id,1)
assert.equal(featuredBroadcast([match(1,'postponed'),match(2,'completed')]),undefined)
console.log('YouTube link parsing, safe embed URLs, validation and scheduled/live selection passed')
