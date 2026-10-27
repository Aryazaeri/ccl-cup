// Decrypt and verify into a NEW local review directory. Never touches a database.
import fs from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { decryptBackup } from './backup-crypto.mjs'
let temporary,created=false,destination
try {
  const archive=process.env.CCL_RESTORE_ARCHIVE,passphrase=process.env.CCL_BACKUP_PASSPHRASE
  if(!archive||!passphrase||!process.env.CCL_RESTORE_DIRECTORY)throw new Error('Configure CCL_RESTORE_ARCHIVE, CCL_BACKUP_PASSPHRASE and a new CCL_RESTORE_DIRECTORY')
  destination=path.resolve(process.env.CCL_RESTORE_DIRECTORY)
  await fs.mkdir(destination,{mode:0o700});created=true
  temporary=await fs.mkdtemp(path.join(tmpdir(),'ccl-restore-'))
  const tar=path.join(temporary,'verified.tar.gz')
  await decryptBackup(archive,tar,passphrase)
  const listing=execFileSync('tar',['-tzf',tar],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n')
  if(listing.some((entry)=>path.isAbsolute(entry)||entry.split('/').includes('..')))throw new Error('Unsafe archive paths')
  const types=execFileSync('tar',['-tvzf',tar],{encoding:'utf8',maxBuffer:8*1024*1024}).trim().split('\n')
  if(types.some((entry)=>!['-','d'].includes(entry[0])))throw new Error('Links and special files are not accepted')
  execFileSync('tar',['-xzf',tar,'-C',destination],{stdio:'pipe'})
  const manifest=JSON.parse(await fs.readFile(path.join(destination,'manifest.json'),'utf8'))
  if(manifest.format!==1||!Array.isArray(manifest.objects)||!Array.isArray(manifest.buckets))throw new Error('Unsupported backup manifest')
  const hash=async(file)=>createHash('sha256').update(await fs.readFile(file)).digest('hex')
  for(const name of ['roles.sql','schema.sql','data.sql','storage-schema.sql']) {
    if(await hash(path.join(destination,name))!==manifest.database[name])throw new Error('Database dump checksum mismatch')
  }
  for(const object of manifest.objects) {
    if(!/^[a-f0-9]{64}$/.test(object.hash)||typeof object.path!=='string'||typeof object.bucket!=='string')throw new Error('Invalid object manifest')
    const file=path.join(destination,'objects',object.hash)
    if((await fs.stat(file)).size!==object.bytes||await hash(file)!==object.hash)throw new Error('Storage object checksum mismatch')
  }
  console.log(`Backup authenticated and verified: ${manifest.objects.length} files. Review the restore runbook before restoring database or Storage.`)
} catch {
  if(created)await fs.rm(destination,{recursive:true,force:true})
  console.error('Restore extraction failed; no database was changed. Check private inputs, archive integrity and a new destination path.')
  process.exitCode=1
} finally {if(temporary)await fs.rm(temporary,{recursive:true,force:true})}
