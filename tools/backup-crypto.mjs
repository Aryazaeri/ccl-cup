import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import fs from 'node:fs'
import { pipeline } from 'node:stream/promises'

const MAGIC=Buffer.from('CCLBAK01')
const HEADER=MAGIC.length+16+12
export async function encryptBackup(input,output,passphrase) {
  if(!passphrase || passphrase.length<24) throw new Error('Use a backup passphrase of at least 24 characters')
  const salt=randomBytes(16),iv=randomBytes(12),key=scryptSync(passphrase,salt,32)
  const cipher=createCipheriv('aes-256-gcm',key,iv)
  let created=false
  try {
    await fs.promises.writeFile(output,Buffer.concat([MAGIC,salt,iv]),{flag:'wx',mode:0o600});created=true
    await pipeline(fs.createReadStream(input),cipher,fs.createWriteStream(output,{flags:'a',mode:0o600}))
    await fs.promises.appendFile(output,cipher.getAuthTag())
  } catch(error) {if(created)await fs.promises.rm(output,{force:true});throw error}
  finally { key.fill(0) }
}
export async function decryptBackup(input,output,passphrase) {
  const file=await fs.promises.open(input,'r')
  let created=false
  try {
    const {size}=await file.stat()
    if(size<HEADER+16) throw new Error('Incomplete backup')
    const header=Buffer.alloc(HEADER),tag=Buffer.alloc(16)
    await file.read(header,0,HEADER,0);await file.read(tag,0,16,size-16)
    if(!header.subarray(0,MAGIC.length).equals(MAGIC)) throw new Error('Unsupported backup format')
    const key=scryptSync(passphrase,header.subarray(MAGIC.length,MAGIC.length+16),32)
    try {
      const decipher=createDecipheriv('aes-256-gcm',key,header.subarray(MAGIC.length+16))
      decipher.setAuthTag(tag)
      const destination=await fs.promises.open(output,'wx',0o600);created=true
      await pipeline(fs.createReadStream(input,{start:HEADER,end:size-17}),decipher,destination.createWriteStream())
    } finally { key.fill(0) }
  } catch(error) { if(created)await fs.promises.rm(output,{force:true});throw error }
  finally { await file.close() }
}

export function expiredBackupVersions(versions,now=new Date(),days=30) {
  const cutoff=now.getTime()-days*86_400_000
  return versions.filter((v)=>v.Key?.startsWith('ccl-backups/') && v.VersionId && v.LastModified && new Date(v.LastModified).getTime()<cutoff)
}
