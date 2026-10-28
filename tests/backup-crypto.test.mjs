import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes } from 'node:crypto'
import { encryptBackup,decryptBackup,expiredBackupVersions } from '../tools/backup-crypto.mjs'
const directory=await fs.mkdtemp(path.join(tmpdir(),'ccl-crypto-check-'))
try {
  const raw=path.join(directory,'input'),encrypted=path.join(directory,'encrypted'),restored=path.join(directory,'restored')
  const contents=randomBytes(1024*1024),passphrase=randomBytes(32).toString('base64')
  await fs.writeFile(raw,contents,{mode:0o600})
  await encryptBackup(raw,encrypted,passphrase);await decryptBackup(encrypted,restored,passphrase)
  assert.ok((await fs.readFile(restored)).equals(contents))
  assert.equal((await fs.stat(encrypted)).mode&0o777,0o600)
  await assert.rejects(decryptBackup(encrypted,restored,passphrase))
  assert.ok((await fs.readFile(restored)).equals(contents), 'Existing restore destination must survive an exclusive-create failure')
  await assert.rejects(decryptBackup(encrypted,path.join(directory,'wrong'),randomBytes(32).toString('base64')))
  const tampered=await fs.readFile(encrypted);tampered[100]^=1;await fs.writeFile(encrypted,tampered)
  await assert.rejects(decryptBackup(encrypted,path.join(directory,'corrupt'),passphrase))
  await assert.rejects(fs.access(path.join(directory,'corrupt')))
  assert.deepEqual(expiredBackupVersions([
    {Key:'ccl-backups/old',VersionId:'1',LastModified:'2026-09-01'},
    {Key:'ccl-backups/recent',VersionId:'2',LastModified:'2026-10-26'},
    {Key:'unrelated/old',VersionId:'3',LastModified:'2026-09-01'},
  ],new Date('2026-10-27')).map((r)=>r.Key),['ccl-backups/old'])
  console.log('Backup encryption roundtrip, authentication, private file mode and scoped 30-day retention passed')
} finally {await fs.rm(directory,{recursive:true,force:true})}
