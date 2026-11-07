/* LIFEARCHIVE 0.2 */
(function(){
'use strict';
const editor0=editItem,calendar0=calendar,settings0=settings,detail0=showDetail;
const fields={person:[['nickname','Spitzname'],['birthday','Geburtstag','date'],['met_on','Kennenlernen am','date'],['met_where','Kennenlernort'],['relationship','Beziehung'],['story','Geschichte','textarea'],['notes','Notizen','textarea']],chapter:[['starts_on','Beginn','date'],['ends_on','Ende','date']],event:[['thoughts','Persönliche Gedanken','textarea']]};
const clean=v=>esc(String(v??''));
function enhanceEditor(x,kind){
 const form=document.getElementById('itemform');if(!form)return;
 const el=document.createElement('div');el.className='wide';el.id='extra-area';form.querySelector('.actions').before(el);
 function refresh(){
 const type=form.elements.kind.value;
 const f=fields[type]||[];
 el.innerHTML=f.length?'<h3>Weitere Angaben</h3><div class="formgrid">'+f.map(([k,title,input])=>'<label class="'+(input==='textarea'?'wide':'')+'">'+clean(title)+(input==='textarea'?'<textarea data-meta="'+k+'">'+clean(x?.metadata?.[k]||'')+'</textarea>':'<input data-meta="'+k+'" type="'+(input||'text')+'" value="'+clean(x?.metadata?.[k]||'')+'">')+'</label>').join('')+'</div>':'';
 }
 refresh();form.elements.kind.addEventListener('change',refresh);
 const key=x?'edit:'+x.id:'new:'+(kind||'event');
 const info=document.createElement('small');info.style.color='var(--muted)';info.textContent='Entwürfe werden automatisch gesichert';form.querySelector('.actions').prepend(info);
 let timeout;
 const draftValues=()=>{const a={};form.querySelectorAll('[name]').forEach(e=>{if(e.type==='checkbox'){if(e.name==='related'){if(e.checked)(a.related??=[]).push(e.value)}else a[e.name]=e.checked}else a[e.name]=e.value});const meta={};form.querySelectorAll('[data-meta]').forEach(e=>meta[e.dataset.meta]=e.value);return {values:a,meta}};
 const schedule=()=>{clearTimeout(timeout);info.textContent='Noch nicht gesichert';timeout=setTimeout(async()=>{try{const r=await db.from('archive_drafts').upsert({user_id:uid(),draft_key:key,payload:draftValues()},{onConflict:'user_id,draft_key'});if(r.error)throw r.error;info.textContent='Entwurf gesichert'}catch(e){info.textContent='Entwurf konnte nicht gesichert werden'}},1300)};
 form.addEventListener('input',schedule);
 db.from('archive_drafts').select('payload').eq('draft_key',key).maybeSingle().then(({data})=>{if(!data?.payload||!confirm('Vorhandenen Entwurf wiederherstellen?'))return;const p=data.payload;form.querySelectorAll('[name]').forEach(e=>{if(!(e.name in (p.values||{})))return;if(e.type==='checkbox')e.checked=e.name==='related'?(p.values.related||[]).includes(e.value):!!p.values[e.name];else e.value=p.values[e.name]});refresh();form.querySelectorAll('[data-meta]').forEach(e=>{if(e.dataset.meta in (p.meta||{}))e.value=p.meta[e.dataset.meta]})});
 let busy=false;
 form.onsubmit=async ev=>{
 ev.preventDefault();if(busy)return;busy=true;clearTimeout(timeout);const btn=form.querySelector('[type="submit"]');btn.disabled=true;
 try{
 const fd=new FormData(form),v=n=>String(fd.get(n)||'').trim(),meta={...(x?.metadata||{})};
 form.querySelectorAll('[data-meta]').forEach(e=>meta[e.dataset.meta]=e.value);
 const data={user_id:uid(),kind:v('kind'),title:v('title'),body:v('body'),event_date:v('event_date')||null,event_time:v('event_time')||null,location:v('location'),category:v('category'),status:v('status'),rating:v('rating')?Number(v('rating')):null,tags:v('tags').split(',').map(s=>s.trim()).filter(Boolean),is_sensitive:fd.has('is_sensitive'),unlock_at:v('unlock_at')?new Date(v('unlock_at')).toISOString():null,metadata:meta};
 if(!data.title)throw Error('Titel fehlt');
 const request=x?db.from('archive_items').update(data).eq('id',x.id):db.from('archive_items').insert(data);
 const res=await request.select().single();if(res.error)throw res.error;
 const id=res.data.id,selected=fd.getAll('related');
 if(x){const d=await db.from('archive_links').delete().or('source_id.eq.'+id+',target_id.eq.'+id);if(d.error)throw d.error}
 if(selected.length){const i=await db.from('archive_links').insert(selected.filter(p=>p!==id).map(target_id=>({user_id:uid(),source_id:id,target_id,relation:'related'})));if(i.error)throw i.error}
 await db.from('archive_drafts').delete().eq('draft_key',key);
 form.closest('.modalbg').remove();state.detail=id;await loadAll();toast('Gespeichert');
 }catch(e){err(e)}finally{busy=false;btn.disabled=false}
 };
}
editItem=function(x,kind){editor0(x,kind);enhanceEditor(x,kind)};
showDetail=function(id){detail0(id);const x=state.items.find(z=>z.id===id);if(!x)return;const m=x.metadata||{},types=x.kind==='person'?[['nickname','Spitzname'],['birthday','Geburtstag'],['met_on','Kennenlernen'],['met_where','Ort'],['relationship','Beziehung'],['story','Geschichte'],['notes','Notizen']]:x.kind==='chapter'?[['starts_on','Beginn'],['ends_on','Ende']]:x.kind==='event'?[['thoughts','Gedanken']]:[];const filled=types.filter(([k])=>m[k]);if(filled.length){const section=document.createElement('section');section.className='panel';section.innerHTML='<h2>Details</h2>'+filled.map(([k,t])=>'<div style="margin:14px 0"><small class="muted">'+clean(t)+'</small><div style="white-space:pre-wrap">'+clean(m[k])+'</div></div>').join('');document.getElementById('content').append(section)}};
let year=new Date().getFullYear(),month=new Date().getMonth();
calendar=function(c){
 const first=new Date(year,month,1),last=new Date(year,month+1,0).getDate(),off=(first.getDay()+6)%7;
 let boxes=Array(off).fill('<div></div>');
 for(let day=1;day<=last;day++){const d=year+'-'+String(month+1).padStart(2,'0')+'-'+String(day).padStart(2,'0');
 const es=state.items.filter(x=>x.event_date===d),bs=state.items.filter(x=>x.kind==='person'&&x.metadata?.birthday?.slice(5)===d.slice(5));
 boxes.push('<button class="archive-day" data-day="'+d+'"><b>'+day+'</b>'+es.slice(0,2).map(x=>'<small>'+clean(x.title)+'</small>').join('')+bs.slice(0,1).map(x=>'<small>🎂 '+clean(x.title)+'</small>').join('')+'</button>')}
 c.innerHTML=title('Lebenskalender','Alle Erinnerungen und Geburtstage', '')+'<section class="panel"><div class="toolbar"><button class="btn" id="month-prev">←</button><h2 style="margin:0;text-transform:capitalize">'+first.toLocaleDateString('de-DE',{month:'long',year:'numeric'})+'</h2><button class="btn" id="month-next">→</button><button class="btn" id="month-today">Heute</button></div><div class="archive-calendar">'+['Mo','Di','Mi','Do','Fr','Sa','So'].map(d=>'<strong>'+d+'</strong>').join('')+boxes.join('')+'</div></section><section class="panel" id="day-summary"><p>Wähle einen Tag</p></section>';
 document.getElementById('month-prev').onclick=()=>{month--;if(month<0){month=11;year--}calendar(c)};
 document.getElementById('month-next').onclick=()=>{month++;if(month>11){month=0;year++}calendar(c)};
 document.getElementById('month-today').onclick=()=>{year=new Date().getFullYear();month=new Date().getMonth();calendar(c)};
 c.querySelectorAll('[data-day]').forEach(b=>b.onclick=()=>{const d=b.dataset.day,entries=state.items.filter(x=>x.event_date===d||x.kind==='person'&&x.metadata?.birthday?.slice(5)===d.slice(5));document.getElementById('day-summary').innerHTML='<h2>'+clean(d)+'</h2>'+(entries.length?entries.map(itemCard).join(''):'<p>Keine Einträge</p>');bindItems()});
};
settings=function(c){settings0(c);const p=document.createElement('section');p.className='panel';p.innerHTML='<h2>Archiv-Sicherung importieren</h2><p>Ein gespeicherter JSON-Export kann zusätzlich importiert werden. Bestehende Einträge bleiben erhalten. Medien-Dateien sind nicht enthalten.</p><input id="restore-file" type="file" accept=".json,application/json"><button class="btn" id="restore-archive">JSON importieren</button>';c.append(p);
 document.getElementById('restore-archive').onclick=async()=>{const file=document.getElementById('restore-file').files[0];if(!file)return toast('Bitte JSON-Datei auswählen');if(file.size>12e6)return toast('Datei zu groß');try{const data=JSON.parse(await file.text());if(!Array.isArray(data.items)||!Array.isArray(data.links)||data.items.length>5000)throw Error('Keine gültige Sicherung');if(!confirm(data.items.length+' Einträge zusätzlich importieren?'))return;
 const map=new Map();let count=0;for(const item of data.items){if(!['person','event','chapter','diary','capsule','place'].includes(item.kind))continue;const old=item.id;const r=await db.from('archive_items').insert({user_id:uid(),kind:item.kind,title:String(item.title||'').slice(0,500),body:item.body||'',event_date:item.event_date||null,event_time:item.event_time||null,location:item.location||'',category:item.category||'',status:item.status||'',rating:item.rating||null,tags:item.tags||[],metadata:item.metadata||{},is_sensitive:!!item.is_sensitive,unlock_at:item.unlock_at||null}).select('id').single();if(r.error)throw r.error;map.set(old,r.data.id);count++}
 for(const link of data.links){const a=map.get(link.source_id),b=map.get(link.target_id);if(!a||!b||a===b)continue;const r=await db.from('archive_links').insert({user_id:uid(),source_id:a,target_id:b,relation:'related'});if(r.error)throw r.error}
 await loadAll();toast(count+' Einträge importiert')}catch(e){err(e)}};
};
const css=document.createElement('style');css.textContent='.archive-calendar{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:5px}.archive-calendar>strong{text-align:center;color:var(--muted);padding:10px 0}.archive-day{min-height:85px;background:#14141e;color:white;border:1px solid var(--border);border-radius:9px;display:flex;flex-direction:column;text-align:left;gap:5px;padding:8px;overflow:hidden}.archive-day:hover{border-color:#a68bff}.archive-day small{background:#36274e;padding:3px;border-radius:4px;white-space:nowrap;text-overflow:ellipsis;overflow:hidden}.archive-day b{font-size:12px}@media(max-width:600px){.archive-day{min-height:60px;padding:3px}.archive-day small{font-size:8px}}';document.head.append(css);
})();