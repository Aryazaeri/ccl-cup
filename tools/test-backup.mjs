// Read/write only the explicitly supplied disposable local stack.
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
const workdir=process.env.CCL_TEST_WORKDIR
assert.ok(workdir,'Set CCL_TEST_WORKDIR to a disposable local Supabase stack')
await assert.rejects(fs.access(path.join(workdir,'supabase/.temp/project-ref')))
const status=JSON.parse(execFileSync('supabase',['status','--workdir',workdir,'-o','json'],{encoding:'utf8',stdio:['ignore','pipe','pipe']}))
assert.match(status.API_URL,/^http:\/\/(127\.0\.0\.1|localhost):\d+$/)
const api=createClient(status.API_URL,status.SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
const root=await fs.mkdtemp(path.join(os.tmpdir(),'ccl-backup-integration-'))
const object=`articles/backup-check-${randomUUID()}.png`,bytes=randomBytes(128)
try {
 const upload=await api.storage.from('club-assets').upload(object,bytes,{contentType:'image/png'});assert.equal(upload.error,null)
 const env={...process.env,CCL_BACKUP_DATABASE_URL:status.DB_URL,CCL_BACKUP_SUPABASE_URL:status.API_URL,CCL_BACKUP_SERVICE_KEY:status.SERVICE_ROLE_KEY,CCL_BACKUP_PASSPHRASE:randomBytes(32).toString('base64'),CCL_BACKUP_OUTPUT:path.join(root,'local.cclbak'),CCL_BACKUP_BUCKET:''}
 for(const [script,extra] of [['backup.mjs',{}],['restore-backup.mjs',{CCL_RESTORE_ARCHIVE:env.CCL_BACKUP_OUTPUT,CCL_RESTORE_DIRECTORY:path.join(root,'verified')}]]) {
  const r=spawnSync('node',[`tools/${script}`],{stdio:'inherit',env:{...env,...extra}});assert.equal(r.status,0)
 }
 const restored=path.join(root,'verified'),manifest=JSON.parse(await fs.readFile(path.join(restored,'manifest.json'),'utf8'))
 const saved=manifest.objects.find(o=>o.path===object);assert.ok(saved)
 assert.deepEqual(await fs.readFile(path.join(restored,'objects',saved.hash)),bytes)
 assert.ok((await fs.readFile(path.join(restored,'data.sql'),'utf8')).includes('COPY "auth"."users"'))
 assert.ok(!(await fs.readFile(path.join(restored,'data.sql'),'utf8')).includes('COPY "storage".'))
 assert.ok((await fs.readFile(path.join(restored,'storage-schema.sql'),'utf8')).includes('CREATE POLICY'))
 console.log('Actual SQL/Auth dump, encrypted extraction, Storage policy export and uploaded-byte recovery passed')
} finally {
 const r=await api.storage.from('club-assets').remove([object]);assert.equal(r.error,null)
 api.auth.stopAutoRefresh();await fs.rm(root,{recursive:true,force:true})
}
