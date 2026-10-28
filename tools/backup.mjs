// Server-side only. Never uses project .env files or VITE_* credentials.
import fs from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createHash,randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { createClient } from '@supabase/supabase-js'
import { S3Client,PutObjectCommand,ListObjectVersionsCommand,DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { encryptBackup,expiredBackupVersions } from './backup-crypto.mjs'

const required=(name)=>{const value=process.env[name];if(!value)throw new Error(`Configure ${name}`);return value}
const run=(command,args)=>{
  try{return execFileSync(command,args,{stdio:['ignore','pipe','pipe'],maxBuffer:8*1024*1024})}
  catch{throw new Error(`${command} failed during backup. No archive was uploaded; check private connection configuration.`)}
}
let temporary,partial
try {
  const database=required('CCL_BACKUP_DATABASE_URL'),url=required('CCL_BACKUP_SUPABASE_URL'),key=required('CCL_BACKUP_SERVICE_KEY')
  const passphrase=required('CCL_BACKUP_PASSPHRASE'),output=path.resolve(required('CCL_BACKUP_OUTPUT'))
  if(passphrase.length<24)throw new Error('Use a backup passphrase of at least 24 characters')
  temporary=await fs.mkdtemp(path.join(tmpdir(),'ccl-backup-'))
  const content=path.join(temporary,'content');await fs.mkdir(content,{mode:0o700});await fs.mkdir(path.join(content,'objects'),{mode:0o700})
  for(const [file,options] of [['roles.sql',['--role-only']],['schema.sql',[]],['storage-schema.sql',['--schema','storage']],['data.sql',['--data-only','--use-copy','--schema','public,auth,import']]]) {
    run('supabase',['db','dump','--db-url',database,'--file',path.join(content,file),...options])
    await fs.chmod(path.join(content,file),0o600)
  }
  // Storage bytes and bucket configuration are exported through the API below.
  // Re-uploading them restores Storage metadata; copying internal Storage tables
  // fails across service versions and would create rows without object bytes.
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}})
  const buckets=await client.storage.listBuckets();if(buckets.error)throw new Error('Storage bucket inventory failed')
  const manifest={format:1,createdAt:new Date().toISOString(),sourceApi:url,buckets:[],objects:[],database:{}}
  for(const b of buckets.data) {
    manifest.buckets.push({name:b.name,public:b.public,fileSizeLimit:b.file_size_limit,allowedMimeTypes:b.allowed_mime_types})
    const walk=async(prefix='')=>{
      for(let offset=0;;offset+=1000) {
        const r=await client.storage.from(b.name).list(prefix,{limit:1000,offset,sortBy:{column:'name',order:'asc'}})
        if(r.error)throw new Error('Storage listing failed')
        for(const item of r.data) {
          const object=prefix?`${prefix}/${item.name}`:item.name
          if(!item.id){await walk(object);continue}
          const downloaded=await client.storage.from(b.name).download(object)
          if(downloaded.error)throw new Error('Storage object changed or could not be backed up; retry before accepting this backup')
          const bytes=Buffer.from(await downloaded.data.arrayBuffer()),hash=createHash('sha256').update(bytes).digest('hex')
          await fs.writeFile(path.join(content,'objects',hash),bytes,{mode:0o600})
          manifest.objects.push({bucket:b.name,path:object,hash,bytes:bytes.length,contentType:item.metadata?.mimetype??'application/octet-stream'})
        }
        if(r.data.length<1000)break
      }
    }
    await walk()
  }
  client.auth.stopAutoRefresh()
  for(const name of ['roles.sql','schema.sql','data.sql','storage-schema.sql'])manifest.database[name]=createHash('sha256').update(await fs.readFile(path.join(content,name))).digest('hex')
  await fs.writeFile(path.join(content,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600})
  const tar=path.join(temporary,'backup.tar.gz');run('tar',['-czf',tar,'-C',content,'.'])
  await fs.mkdir(path.dirname(output),{recursive:true})
  partial=output+'.'+randomUUID()+'.partial';await encryptBackup(tar,partial,passphrase);await fs.link(partial,output);await fs.rm(partial);partial=undefined
  const size=(await fs.stat(output)).size
  if(process.env.CCL_BACKUP_BUCKET) {
    const endpoint=required('CCL_BACKUP_S3_ENDPOINT');if(!endpoint.startsWith('https://'))throw new Error('Off-site backups require HTTPS')
    const s3=new S3Client({endpoint,region:required('CCL_BACKUP_S3_REGION'),forcePathStyle:true,
      credentials:{accessKeyId:required('CCL_BACKUP_ACCESS_KEY_ID'),secretAccessKey:required('CCL_BACKUP_SECRET_ACCESS_KEY')}})
    const bucket=process.env.CCL_BACKUP_BUCKET,versions=[]
    let keyMarker,versionMarker
    do {
      const r=await s3.send(new ListObjectVersionsCommand({Bucket:bucket,Prefix:'ccl-backups/',KeyMarker:keyMarker,VersionIdMarker:versionMarker}))
      versions.push(...(r.Versions??[]),...(r.DeleteMarkers??[]));keyMarker=r.IsTruncated?r.NextKeyMarker:undefined;versionMarker=r.NextVersionIdMarker
    }while(keyMarker)
    // A strict byte budget protects the selected free-storage allowance.
    // Never delete the last available backup to make room for a new one.
    const budget=Number(process.env.CCL_BACKUP_MAX_BYTES??9_000_000_000),total=versions.reduce((n,v)=>n+(v.Size??0),0)
    if(total+size>budget)throw new Error('Backup storage budget would be exceeded. The encrypted local copy was retained; no remote archives deleted.')
    const name=`ccl-backups/${new Date().toISOString().replace(/[:.]/g,'-')}.cclbak`
    await s3.send(new PutObjectCommand({Bucket:bucket,Key:name,Body:createReadStream(output),ContentLength:size,ContentType:'application/octet-stream'}))
    const expired=expiredBackupVersions(versions,new Date(),30)
    for(let i=0;i<expired.length;i+=1000) {
      const removed=await s3.send(new DeleteObjectsCommand({Bucket:bucket,Delete:{Objects:expired.slice(i,i+1000).map((v)=>({Key:v.Key,VersionId:v.VersionId}))}}))
      if(removed.Errors?.length)throw new Error('Backup uploaded, but retention cleanup failed. Review the backup job before accepting retention as healthy.')
    }
    s3.destroy()
    console.log('Encrypted off-site backup uploaded; versions older than 30 days pruned within the dedicated prefix.')
  }
  console.log(`Backup complete: ${manifest.objects.length} files; ${size} encrypted bytes. Credentials and plaintext dumps were not retained.`)
} catch(error) {
  // Do not print SDK/CLI error objects: they can include authorization headers.
  console.error(error instanceof Error?error.message:'Backup failed')
  process.exitCode=1
} finally {if(partial)await fs.rm(partial,{force:true});if(temporary)await fs.rm(temporary,{recursive:true,force:true})}
