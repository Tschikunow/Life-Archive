/* LIFEARCHIVE encrypted full backup (texts + media), no third-party zip library */
(function(){
'use strict';
const encoder=new TextEncoder(),decoder=new TextDecoder();
const BACKUP_LIMIT=160*1024*1024;
const fields=['kind','title','body','event_date','event_time','location','category','status','rating','tags','metadata','is_sensitive','unlock_at'];
const crcTable=new Uint32Array(256);
for(let n=0;n<256;n++){let c=n;for(let i=0;i<8;i++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0}
function word(d,o,v){d.setUint16(o,v,true)}function dword(d,o,v){d.setUint32(o,v,true)}
function makeZip(files){
 const parts=[],central=[];let offset=0;
 for(const file of files){
  const name=encoder.encode(file.name),data=file.bytes,crc=crc32(data);
  if(name.length>65535||data.length>0xffffffff)throw Error('Einzeldatei zu groß');
  const local=new Uint8Array(30+name.length),h=new DataView(local.buffer);
  dword(h,0,0x04034b50);word(h,4,20);word(h,6,0x0800);word(h,8,0);word(h,10,0);word(h,12,33);
  dword(h,14,crc);dword(h,18,data.length);dword(h,22,data.length);word(h,26,name.length);local.set(name,30);
  parts.push(local,data);
  const entry=new Uint8Array(46+name.length),v=new DataView(entry.buffer);
  dword(v,0,0x02014b50);word(v,4,20);word(v,6,20);word(v,8,0x0800);word(v,10,0);
  word(v,12,0);word(v,14,33);dword(v,16,crc);dword(v,20,data.length);dword(v,24,data.length);
  word(v,28,name.length);dword(v,42,offset);entry.set(name,46);central.push(entry);
  offset+=local.length+data.length;
 }
 if(files.length>65535)throw Error('Zu viele Dateien');
 let centralLength=0;for(const entry of central)centralLength+=entry.length;
 const end=new Uint8Array(22),v=new DataView(end.buffer);
 dword(v,0,0x06054b50);word(v,8,files.length);word(v,10,files.length);dword(v,12,centralLength);dword(v,16,offset);
 return new Blob([...parts,...central,end],{type:'application/zip'});
}
function readZip(raw){
 const view=new DataView(raw),bytes=new Uint8Array(raw),files=new Map();let p=0;
 while(p+30<=raw.byteLength&&view.getUint32(p,true)===0x04034b50){
  const flag=view.getUint16(p+6,true),method=view.getUint16(p+8,true);
  if(method!==0||(flag&8))throw Error('ZIP-Format nicht unterstützt');
  const crc=view.getUint32(p+14,true),size=view.getUint32(p+18,true);
  const nameLen=view.getUint16(p+26,true),extra=view.getUint16(p+28,true);
  const pos=p+30+nameLen+extra;
  if(pos+size>raw.byteLength)throw Error('ZIP ist unvollständig');
  const name=decoder.decode(bytes.slice(p+30,p+30+nameLen));
  const payload=bytes.slice(pos,pos+size);
  if(crc32(payload)!==crc)throw Error('ZIP-Datei ist beschädigt: '+name);
  if(files.has(name)||files.size>10000)throw Error('Ungültiges ZIP-Archiv');
  files.set(name,payload);p=pos+size;
 }
 return files;
}
async function keyFor(password,salt){
 const base=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:310000,hash:'SHA-256'},base,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function encryptBackup(zip,password){
 const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
 const key=await keyFor(password,salt),encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,await zip.arrayBuffer());
 return new Blob([encoder.encode('LIFA1'),salt,iv,encrypted],{type:'application/octet-stream'});
}
async function decryptBackup(file,password){
 const buffer=await file.arrayBuffer(),bytes=new Uint8Array(buffer);
 if(decoder.decode(bytes.slice(0,5))!=='LIFA1'||bytes.length<60)throw Error('Keine LIFEARCHIVE-Sicherung');
 const salt=bytes.slice(5,21),iv=bytes.slice(21,33);
 const key=await keyFor(password,salt);
 try{return await crypto.subtle.decrypt({name:'AES-GCM',iv},key,bytes.slice(33))}
 catch(e){throw Error('Passwort falsch oder Sicherung beschädigt')}
}
async function readAll(table){
 const records=[];let start=0;
 for(let page=0;page<100;page++){
  const {data,error}=await db.from(table).select('*').order('id',{ascending:true}).range(start,start+499);
  if(error)throw error;
  records.push(...data);
  if(data.length<500)break;
  start+=data.length;
 }
 if(records.length>=50000)throw Error('Zu viele Datensätze für diesen Export');
 return records;
}
function saveBlob(blob,filename){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000)}
function filenameSafe(v){return String(v||'Datei').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,125)||'Datei'}
async function exportFull(password,onProgress){
 const permission=await db.rpc('archive_vault_status');
 if(permission.error||!permission.data?.unlocked)throw Error('Archivcode muss zuvor bestätigt werden');
 const [items,links,media,pref]=await Promise.all([readAll('archive_items'),readAll('archive_links'),readAll('archive_media'),db.from('archive_preferences').select('display_name,birth_date').maybeSingle()]);
 if(pref.error)throw pref.error;
 const files=[],manifest={format:'LIFEARCHIVE_BACKUP',version:3,created_at:new Date().toISOString(),profile:pref.data||{},items,links,media:[]};
 let size=0;
 for(let i=0;i<media.length;i++){
  const m=media[i];onProgress('Lade Datei '+(i+1)+' von '+media.length+'…');
  const res=await db.storage.from('lifearchive-private').download(m.storage_path);
  if(res.error)throw Error('Mediendatei fehlt oder nicht zugänglich: '+m.file_name);
  const bytes=new Uint8Array(await res.data.arrayBuffer());
  size+=bytes.length;if(size>BACKUP_LIMIT)throw Error('Deine Medien überschreiten die 160-MB-Grenze für einen einzelnen Browser-Export');
  const name='media/'+m.id+'/'+filenameSafe(m.file_name);
  files.push({name,bytes});
  manifest.media.push({id:m.id,file_name:m.file_name,mime_type:m.mime_type,item_id:m.item_id,zip_name:name});
 }
 onProgress('Verschlüssele Archiv…');
 files.unshift({name:'manifest.json',bytes:encoder.encode(JSON.stringify(manifest))});
 const zipped=makeZip(files);
 if(zipped.size>BACKUP_LIMIT+10*1024*1024)throw Error('Archiv ist zu groß');
 const encrypted=await encryptBackup(zipped,password);
 saveBlob(encrypted,'LIFEARCHIVE-'+new Date().toISOString().slice(0,10)+'.lifa');
 return {items:items.length,media:media.length};
}
async function importFull(file,password,onProgress){
 if(!file||file.size>BACKUP_LIMIT+10*1024*1024)throw Error('Sicherung zu groß');
 onProgress('Entschlüssele Sicherung…');
 const files=readZip(await decryptBackup(file,password)),mf=files.get('manifest.json');
 if(!mf)throw Error('Sicherung enthält kein Manifest');
 const m=JSON.parse(decoder.decode(mf));
 if(m.format!=='LIFEARCHIVE_BACKUP'||m.version!==3||!Array.isArray(m.items)||!Array.isArray(m.links)||!Array.isArray(m.media))throw Error('Unbekanntes Backup-Format');
 if(m.items.length>50000||m.links.length>100000||m.media.length>10000)throw Error('Sicherung enthält zu viele Einträge');
 const ids=new Map();let imported=0,uploaded=0;
 for(const item of m.items){
  if(!['person','event','chapter','diary','capsule','place'].includes(item.kind))throw Error('Ungültige Eintragskategorie');
  onProgress('Stelle Einträge wieder her: '+(imported+1)+'/'+m.items.length);
  const row={user_id:uid()};
  for(const name of fields)if(Object.prototype.hasOwnProperty.call(item,name))row[name]=item[name];
  const {data,error}=await db.from('archive_items').insert(row).select('id').single();
  if(error)throw error;ids.set(item.id,data.id);imported++;
 }
 for(const link of m.links){
  const a=ids.get(link.source_id),b=ids.get(link.target_id);
  if(!a||!b||a===b)continue;
  const {error}=await db.from('archive_links').insert({user_id:uid(),source_id:a,target_id:b,relation:'related'});
  if(error)throw error;
 }
 for(const medium of m.media){
  const bytes=files.get(medium.zip_name);
  if(!bytes)throw Error('Mediendatei fehlt in Sicherung: '+medium.file_name);
  onProgress('Stelle Mediendatei wieder her: '+(uploaded+1)+'/'+m.media.length);
  const path=uid()+'/'+crypto.randomUUID()+'/'+filenameSafe(medium.file_name);
  const {error:up}=await db.storage.from('lifearchive-private').upload(path,new Blob([bytes]),{contentType:medium.mime_type||'application/octet-stream'});
  if(up)throw up;
  const {error:ins}=await db.from('archive_media').insert({user_id:uid(),item_id:ids.get(medium.item_id)||null,storage_path:path,file_name:String(medium.file_name||'Datei').slice(0,250),mime_type:medium.mime_type||null});
  if(ins){await db.storage.from('lifearchive-private').remove([path]);throw ins}
  uploaded++;
 }
 await loadAll();
 return {items:imported,media:uploaded};
}
const previousSettings=settings;
settings=function(c){
 previousSettings(c);
 const block=document.createElement('section');block.className='panel';
 block.innerHTML='<h2>Verschlüsselte Komplettsicherung</h2><p>Sichere deine Texte, Verknüpfungen sowie Fotos, Videos und Dokumente gemeinsam in einer verschlüsselten Datei. Die Sicherung wird nur auf deinem Gerät erstellt.</p>'+
 '<form id="full-backup-form" class="stack" style="max-width:500px"><label>Eigenes Sicherungspasswort (mindestens 12 Zeichen)<input required type="password" id="backup-password" minlength="12" autocomplete="new-password"></label><button type="submit" class="btn primary">Verschlüsselte Komplettsicherung herunterladen</button></form>'+
 '<div class="notice" style="margin-top:15px">Wichtig: Ohne dieses Passwort kannst du die Sicherung nicht wiederherstellen. Bewahre sie unabhängig von Supabase auf. Pro Sicherung sind aktuell maximal 160 MB Medien möglich.</div>'+
 '<h3>Sicherung wiederherstellen</h3><p>Importiert Daten zusätzlich. Für eine saubere Wiederherstellung möglichst ein leeres Archiv verwenden. Bei Fehlern können Teile bereits eingefügt sein.</p>'+
 '<form class="stack" id="full-restore-form" style="max-width:500px"><label>Verschlüsselte Sicherung<input id="restore-full-file" type="file" required accept=".lifa"></label><label>Sicherungspasswort<input id="restore-full-password" type="password" required></label><button class="btn" type="submit">Sicherung wiederherstellen</button></form><p id="backup-progress" class="muted" role="status" aria-live="polite"></p>';
 c.append(block);
 const progress=document.getElementById('backup-progress');const update=t=>progress.textContent=t;
 document.getElementById('full-backup-form').onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  try{const password=document.getElementById('backup-password').value;if(password.length<12)throw Error('Sicherungspasswort zu kurz');const report=await exportFull(password,update);update('Sicherung erstellt: '+report.items+' Einträge und '+report.media+' Mediendateien')}catch(error){err(error);update('Sicherung fehlgeschlagen: '+error.message)}finally{b.disabled=false;document.getElementById('backup-password').value=''}
 };
 document.getElementById('full-restore-form').onsubmit=async e=>{
  e.preventDefault();const b=e.submitter,bundle=document.getElementById('restore-full-file').files[0],password=document.getElementById('restore-full-password').value;
  if(!bundle)return;
  if(!confirm('Sicherung zusätzlich importieren? Bereits vorhandene Daten bleiben erhalten, Duplikate sind möglich.'))return;
  b.disabled=true;
  try{const report=await importFull(bundle,password,update);update('Wiederhergestellt: '+report.items+' Einträge und '+report.media+' Mediendateien');toast('Sicherung wiederhergestellt')}catch(error){err(error);update('Import abgebrochen: '+error.message+' – eventuell wurden bereits Daten eingefügt.')}finally{b.disabled=false;document.getElementById('restore-full-password').value=''}
 };
};
})();