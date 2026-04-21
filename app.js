/* ═════════ CONFIG ═════════ */
const SUPA_URL='[oekgtocjtloptrjacmcu.supabase.co](https://oekgtocjtloptrjacmcu.supabase.co)';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9la2d0b2NqdGxvcHRyamFjbWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDM2NTAsImV4cCI6MjA5MTg3OTY1MH0.oioNTJ7qWraS0LR3DQcfFvQ9J6V28gbGrwsOEJ6jbk8';
const ADMIN_PIN='7519',BUCKET='schedules';
const sb=supabase.createClient(SUPA_URL,SUPA_KEY);
let projects=[],entries=[],editingId=null,pendingFile=null,markupFiles=[],userName=localStorage.getItem('reo_user_name')||'';
let adminUnlocked=false,sortCol="created_at",sortAsc=false,selectedIds=new Set();

/* ═════════ HELPERS ═════════ */
const $=id=>document.getElementById(id);
const today=()=>new Date().toISOString().slice(0,10);
const fmtDate=d=>d?(d.split('-').reverse().join('/')||d):'';
const esc=s=>{const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML};
const fmtSize=b=>b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB';
function parseAusDate(s){const p=s.split('/');if(p.length!==3)return;let[d,m,y]=p;if(y.length===2)y='20'+y;return`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;}
function hasMismatch(e){return e.our_delivery_date&&e.supplier_delivery_date&&e.our_delivery_date!==e.supplier_delivery_date&&!e.mismatch_resolved;}
function getPill(status){const c={NotOrdered:'pill-notordered',Ordered:'pill-ordered',Scheduled:'pill-scheduled',Delivered:'pill-delivered',Cancelled:'pill-cancelled'};return `<span class="pill ${c[status?.replace(' ','')]||'pill-notordered'}">${esc(status||'—')}</span>`;}
async function auditLog(obj){await sb.from('audit_log').insert({...obj,user_identifier:userName});}

/* ═════════ INIT ═════════ */
async function init(){
  if(!userName){$('loadingScreen').style.display='none';$('nameOverlay').classList.add('show');return;}
  $('userChip').textContent=userName;
  try{
    await loadProjects();await loadEntries();
    subscribeRealtime();populateDropdowns();
    $('inpDate').value=today();
    $('loadingScreen').style.display='none';$('mainApp').style.display='block';
    setupDragDrop();renderDash();renderAdminProj();
  }catch(e){$('loadingScreen').innerHTML=`<div style="text-align:center;padding:20px"><h2 style="color:var(--err)">Connection Error</h2><p style="color:var(--muted);font-size:13px">${e.message}</p><button class="btn btn-sm" onclick="location.reload()" style="width:auto;margin-top:12px">Retry</button></div>`;}
}
function saveName(){const n=$('nameInput').value.trim();if(!n)return alert('Please enter your name');localStorage.setItem('reo_user_name',n);userName=n;$('nameOverlay').classList.remove('show');$('loadingScreen').style.display='flex';init();}

/* ═════════ LOAD DATA ═════════ */
async function loadProjects(){const{data,error}=await sb.from('projects').select('*').order('name');if(error)throw error;projects=data.map(p=>({id:p.id,name:p.name,levels:p.levels?p.levels.split('||'):[ ] ,areas:p.areas?p.areas.split('||'):[] }));}
async function loadEntries(){const{data,error}=await sb.from('entries').select('*').order('created_at',{ascending:false});if(error)throw error;entries=data;$('countNum').textContent=entries.length;}
function subscribeRealtime(){
  sb.channel('entries').on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadEntries().then(renderDash)).subscribe();
  sb.channel('projects').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>loadProjects().then(populateDropdowns)).subscribe();
}

/* ═════════ DROPDOWNS ═════════ */
function populateDropdowns(){
  const names=projects.map(p=>p.name);
  ['selProj','fProj','dpProj'].forEach(id=>{
    const el=$(id);if(!el)return;
    const first=el.options[0]?.text||'';el.innerHTML=`<option value="">${first}</option>`;
    names.forEach(n=>el.appendChild(new Option(n,n)));
  });
}

/* ═════════ NEW ENTRY ═════════ */
function setEntryType(t){
  const isLoose=t==='loose';
  $('typeSchedBtn').classList.toggle('active',!isLoose);
  $('typeLooseBtn').classList.toggle('active',isLoose);
  ['orderListSection','uploadSection','scheduleSection','markupUploadSection','commentsSection','submitBtn'].forEach(id=>$(id).style.display=isLoose?(id==='uploadSection'||id==='commentsSection'||id==='submitBtn')?'block':'none':'none');
  $('inpSupDate').value='';$('inpSched').value='';pendingFile=null;
  if(!isLoose)onProjChange();
}

/* project change */
function onProjChange(){
  const proj=$('selProj').value;const lS=$('selLevel'),aS=$('selArea');
  const p=projects.find(x=>x.name===proj);
  if(!p){lS.disabled=aS.disabled=true;hideSteps();return;}
  lS.innerHTML='<option value="">Select level…</option>';p.levels.forEach(l=>lS.appendChild(new Option(l,l)));lS.disabled=false;
  aS.innerHTML='<option value="">Select area…</option>';p.areas.forEach(a=>aS.appendChild(new Option(a,a)));aS.disabled=false;
  onLevelAreaChange();
}

function hideSteps(){['orderListSection','uploadSection','scheduleSection','markupUploadSection','commentsSection'].forEach(id=>$(id).style.display='none');$('submitBtn').style.display='none';}
function onLevelAreaChange(){
  const proj=$('selProj').value,lev=$('selLevel').value,ar=$('selArea').value;
  if(!proj)return hideSteps();
  const matching=entries.filter(e=>e.project===proj&&(!lev||e.level===lev)&&(!ar||e.area===ar)&&!e.unmatched);
  const cont=$('orderListContent');
  if(!matching.length){
    $('orderListSection').style.display='block';
    cont.innerHTML='<div class="warn-msg">No placeholder orders found — new entry will be flagged as Unmatched.</div>';
    $('uploadSection').style.display='block';$('scheduleSection').style.display='block';$('markupUploadSection').style.display='block';$('commentsSection').style.display='block';$('submitBtn').style.display='block';return;
  }
  $('orderListSection').style.display='block';
  cont.innerHTML=matching.map(e=>`<div class="order-item ${e.schedule?'disabled':''}" ${!e.schedule?`onclick="selectOrder(${e.id})"`:''}>
      <div>
        <div class="oi-title">${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div>
        <div class="oi-meta">${e.our_delivery_date?'Delivery: '+fmtDate(e.our_delivery_date):'No delivery set'} · ${esc(e.status)}</div>
      </div>
      <div>${e.schedule?'<span class="pill pill-scheduled">Has Schedule</span>':'<span class="pill pill-ordered">Attach →</span>'}</div>
    </div>`).join('');
}
let selectedOrderId=null;
function selectOrder(id){selectedOrderId=id;$('uploadSection').style.display='block';$('scheduleSection').style.display='block';$('markupUploadSection').style.display='block';$('commentsSection').style.display='block';$('submitBtn').style.display='block';}

/* file upload / markup */
function setupDragDrop(){
  const z=$('formDropZone');if(!z)return;
  ['dragenter','dragover'].forEach(x=>z.addEventListener(x,e=>{e.preventDefault();z.classList.add('dragover');}));
  ['dragleave','drop'].forEach(x=>z.addEventListener(x,e=>{e.preventDefault();z.classList.remove('dragover');}));
  z.addEventListener('drop',e=>{if(e.dataTransfer.files.length)setFile(e.dataTransfer.files)});
}
function setFile(fl){
  if(!fl.length)return;pendingFile=fl[0];$('flist').innerHTML=`<div class="fitem"><span>📄 ${esc(pendingFile.name)} <small>${fmtSize(pendingFile.size)}</small></span><button onclick="pendingFile=null;$('flist').innerHTML=''">×</button></div>`;
  $('scheduleSection').style.display='block';if(pendingFile.name.toLowerCase().endsWith('.pdf'))extractPdfData(pendingFile);
}
function setMarkupFiles(fs){
  markupFiles=[...fs];$('markupList').innerHTML=markupFiles.map(f=>`<div class="fitem"><span>📐 ${esc(f.name)}</span><button onclick="markupFiles.splice(${markupFiles.indexOf(f)},1);setMarkupFiles(markupFiles)">×</button></div>`).join('');
}

/* pdf.js extraction */
let pdfjsLoaded=false;
async function loadPdfJs(){if(pdfjsLoaded)return;return new Promise((res,rej)=>{const s=document.createElement('script');s.src='[cdnjs.cloudflare.com](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js)';s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='[cdnjs.cloudflare.com](https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js)';pdfjsLoaded=true;res();};s.onerror=rej;document.head.appendChild(s);});}
async function extractPdfData(file){
  await loadPdfJs();
  const buf=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  let text='';const page=await pdf.getPage(1);const content=await page.getTextContent();text=content.items.map(i=>i.str).join(' ');
  const grab=(rx)=>{const m=text.match(rx);return m?m[1].trim():null;};
  const ctrl=grab(/Ctrl\s*Code:\s*([A-Za-z0-9]+)/i);
  const ship=grab(/Ship\s*Date:\s*([\d\/]+)/i);
  let weight=grab(/Wt:\s*([\d.,]+)\s*T/i);
  if(!weight){weight=grab(/Total\s*Weight:\s*([\d.,]+)\s*Tonne/i);}
  if(weight)weight=parseFloat(weight.replace(',','.'));
  const drawing=grab(/Drawing:\s*([A-Za-z0-9\-\s]+?)(?=\s{2,}|Bar|Desc|$)/i);
  const info=[];
  if(ctrl){$('inpSched').value=ctrl;info.push(`Schedule:<b>${ctrl}</b>`);}
  if(ship){const iso=parseAusDate(ship);$('inpSupDate').value=iso;info.push(`Ship:<b>${ship}</b>`);}
  if(weight){$('inpWeight').value=weight;info.push(`Wt:<b>${weight} T</b>`);}
  if(drawing){$('inpDrawing').value=drawing;info.push(`Drg:<b>${drawing}</b>`);}
  $('extractInfo').innerHTML=info.length?`<div class="success-msg">Extracted: ${info.join(' · ')}</div>`:'<div class="warn-msg">Could not detect data.</div>';
}

/* upload to Supabase storage */
async function uploadFile(file,project,level,area,sub=''){
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_');
  const path=[project,level||'_',area||'_',sub].filter(Boolean).join('/')+'/'+Date.now()+'_'+safe;
  const{error}=await sb.storage.from(BUCKET).upload(path,file,{upsert:false});if(error)throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

/* submit */
async function submitEntry(){
  const proj=$('selProj').value,lev=$('selLevel').value,ar=$('selArea').value;
  const schedule=$('inpSched').value.trim(),date=$('inpDate').value,sup=$('inpSupDate').value||null;
  if(!proj)return showErr('Select a project');if(!date)return showErr('Select submission date');
  const btn=$('submitBtn');btn.disabled=true;btn.textContent='Saving …';
  try{
    let furl=null;
    if(pendingFile){furl=await uploadFile(pendingFile,proj,lev,ar);}
    let markupUrls=[];
    for(const m of markupFiles){markupUrls.push(await uploadFile(m,proj,lev,ar,'markups'));}

    if(selectedOrderId){  // attach schedule
      const up={schedule,file_url:furl,file_name:pendingFile?.name||null,supplier_delivery_date:sup,status:'Scheduled',entry_date:date,unmatched:false,total_weight:parseFloat($('inpWeight').value)||null,drawing_reference:$('inpDrawing').value||null};
      const entry=entries.find(e=>e.id===selectedOrderId);
      await sb.from('entries').update(up).eq('id',selectedOrderId);
      await auditLog({entry_id:selectedOrderId,action:'UPDATE',field_changed:'schedule_attached',new_value:schedule});
    }else{  // new unmatched
      await sb.from('entries').insert({project:proj,level:lev||null,area:ar||null,schedule,status:'Scheduled',entry_date:date,supplier_delivery_date:sup,file_url:furl,file_name:pendingFile?.name||null,entry_type:'scheduled',unmatched:true,total_weight:parseFloat($('inpWeight').value)||null,drawing_reference:$('inpDrawing').value||null});
      await auditLog({action:'CREATE',new_value:`UNMATCHED ${proj}/${schedule}`});
    }
    markupFiles=[];pendingFile=null;$('successOv').classList.add('show');
  }catch(e){showErr(e.message);}btn.disabled=false;btn.textContent='Submit Entry';
}
function showErr(msg){$('formErr').innerHTML=`<div class="error-msg">${esc(msg)}</div>`;}

/* ═════════ DASHBOARD ═════════ */
function getFiltered(){
  let list=entries.slice();const fq=$('fSearch').value.toLowerCase();
  if($('fProj').value)list=list.filter(e=>e.project===$('fProj').value);
  if($('fLevel').value)list=list.filter(e=>e.level===$('fLevel').value);
  if($('fArea').value)list=list.filter(e=>e.area===$('fArea').value);
  if($('fStatus').value)list=list.filter(e=>e.status===$('fStatus').value);
  if($('fType').value)list=list.filter(e=>e.entry_type===$('fType').value);
  if($('fMismatch').value==='mismatch')list=list.filter(hasMismatch);
  if($('fMismatch').value==='unmatched')list=list.filter(e=>e.unmatched);
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area,e.comments].some(x=>(x||'').toLowerCase().includes(fq)));
  return list.sort((a,b)=>sortAsc?(a[sortCol]>b[sortCol]?1:-1):(a[sortCol]<b[sortCol]?1:-1));
}
function renderDash(){
  const f=getFiltered();const t=$('dashTable');
  const arrow=c=>sortCol===c?(sortAsc?' ▲':' ▼'):'';
  if(!f.length){t.innerHTML='<div class="empty"><p>No entries found</p></div>';return;}
  t.innerHTML=`<table><thead><tr>
  <th></th><th onclick="tSort('project')">Project${arrow('project')}</th><th>Level</th><th>Area</th><th>Schedule</th><th>Weight</th><th>Status</th><th>Ordered Delivery${arrow('our_delivery_date')}</th><th>Supplier</th><th>Submitted</th><th>Files</th><th>Comments</th><th>Actions</th></tr></thead><tbody>
  ${f.map(e=>`
  <tr>
  <td><input type="checkbox" onchange="toggleSel(${e.id},this.checked)" ${selectedIds.has(e.id)?'checked':''}></td>
  <td>${esc(e.project)}${e.unmatched?' ⚠':''}</td>
  <td>${esc(e.level||'—')}</td><td>${esc(e.area||'—')}</td>
  <td>${esc(e.schedule||'—')}</td><td>${e.total_weight||'—'}</td>
  <td>${getPill(e.status)}${e.on_hold?'<span class="pill pill-scheduled" style="background:var(--accent);color:#fff;margin-left:4px">ON HOLD</span>':''}</td>
  <td>${fmtDate(e.our_delivery_date)||'—'}</td><td>${fmtDate(e.supplier_delivery_date)||'—'}${hasMismatch(e)?'⚠️':''}</td><td>${fmtDate(e.entry_date)||'—'}</td>
  <td>${e.file_url?`<a href="${e.file_url}" target="_blank" class="att-link">📄</a>`:''}</td>
  <td><div class="comment-preview" onclick="editComment(${e.id})">${esc(e.comments||'—')}</div></td>
  <td><div class="action-cell">
      <button class="action-btn" onclick="showDetail(${e.id})">View</button>
      <div class="hold-toggle${e.on_hold?' on':''}" onclick="toggleHold(${e.id},${e.on_hold})"><span>${e.on_hold?'ON HOLD':''}</span></div>
      ${e.status!=='Delivered'&&e.status!=='Cancelled'?`<button class="action-btn deliver" onclick="markDelivered(${e.id})">✓</button>`:''}
      ${e.status!=='Cancelled'?`<button class="action-btn cancel" onclick="cancelEntry(${e.id})">✗</button>`:''}
  </div></td></tr>`).join('')}</tbody></table>`;
}
function tSort(c){if(sortCol===c)sortAsc=!sortAsc;else{sortCol=c;sortAsc=true;}renderDash();}
function toggleSel(id,ch){if(ch)selectedIds.add(id);else selectedIds.delete(id);}
function refreshAll(){loadEntries().then(renderDash);}

/* ═════════ ON HOLD ═════════ */
async function toggleHold(id,is){
  if(is){await sb.from('entries').update({on_hold:false}).eq('id',id);await auditLog({entry_id:id,action:'ON_HOLD_OFF'});}
  else{
    if(!confirm('Put this entry ON HOLD?\nSend notification email?')){await sb.from('entries').update({on_hold:true}).eq('id',id);await auditLog({entry_id:id,action:'ON_HOLD_ON'});}
    else{
      const e=entries.find(x=>x.id===id);
      const body=`Hi,\n\nThe following schedule has been placed ON HOLD:\nProject: ${e.project}\nLevel: ${e.level||''} / Area: ${e.area||''}\nSchedule: ${e.schedule||''}\n\nRegards,\n${userName}\nDebono Bros Concreting`;
      window.open(`mailto:?subject=ON HOLD – ${encodeURIComponent(e.project)}&body=${encodeURIComponent(body)}`,'_blank');
      await sb.from('entries').update({on_hold:true,previous_status:e.status}).eq('id',id);await auditLog({entry_id:id,action:'ON_HOLD_ON',new_value:e.status});
    }
  }
  await loadEntries();renderDash();
}

/* ===== OTHER EXISTING ACTIONS KEPT COMPACT ===== */
async function markDelivered(id){await sb.from('entries').update({status:'Delivered'}).eq('id',id);await auditLog({entry_id:id,action:'UPDATE',field_changed:'status',new_value:'Delivered'});await loadEntries();renderDash();}
function cancelEntry(id){const r=prompt('Cancel reason?');if(!r)return;sb.from('entries').update({status:'Cancelled',cancel_reason:r}).eq('id',id);auditLog({entry_id:id,action:'CANCEL',new_value:r});setTimeout(()=>loadEntries().then(renderDash),400);}
function editComment(id){const e=entries.find(x=>x.id===id);const v=prompt('Edit comment',e.comments||'');if(v==null)return;sb.from('entries').update({comments:v}).eq('id',id);auditLog({entry_id:id,action:'UPDATE',field_changed:'comments',new_value:v});setTimeout(()=>loadEntries().then(renderDash),400);}
function showDetail(id){alert('Detail view placeholder – see admin for full info');}

/* ═════════ NOTIFICATIONS ═════════ */
async function renderNotifications(){
  const{data,error}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(200);
  if(error){$('notifyTimeline').innerHTML='<div class="empty">Load error</div>';return;}
  $('notifyTimeline').innerHTML=data.map(a=>{
    const d=new Date(a.created_at).toLocaleString('en‑AU');
    return `<div class="audit-item"><div class="audit-time">${d}<span class="audit-user">${esc(a.user_identifier||'?')}</span></div><div class="audit-details">${esc(a.action)} ${a.field_changed?`(${esc(a.field_changed)})`:''} ${a.new_value?esc(a.new_value):''}</div></div>`;
  }).join('');
}

/* ═════════ ADMIN (unchanged core functions shortened) ═════════ */
function checkPin(){if($('pinInp').value===ADMIN_PIN){adminUnlocked=true;$('pinGate').style.display='none';$('adminContent').style.display='block';showAdminSub('proj');}else{$('pinErr').innerHTML='<div class="error-msg">Wrong PIN</div>';}}
function lockAdmin(){adminUnlocked=false;$('pinGate').style.display='block';$('adminContent').style.display='none';}
function showAdminSub(s){['proj','program','fixers','audit'].forEach(x=>{$('admin'+x.charAt(0).toUpperCase()+x.slice(1)).style.display=s===x?'block':'none';$('at'+x.charAt(0).toUpperCase()+x.slice(1)).classList.toggle('active',s===x);});if(s==='audit')renderNotifications();}
function renderAdminProj(){ $('adminProj').innerHTML='<div class="card"><p style="font-size:13px;color:var(--muted)">Project management coming soon (reuses old functions).</p></div>'; }

/* ═════════ NAVIGATION ═════════ */
function showPage(p){
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el=>el.classList.remove('active'));
  const map={form:'pageForm',dash:'pageDash',notify:'pageNotify',admin:'pageAdmin'};
  $(map[p]).classList.add('active');
  $('tab'+p.charAt(0).toUpperCase()+p.slice(1)).classList.add('active');
  if(p==='dash')renderDash();if(p==='notify')renderNotifications();
}

/* ═════════ START ═════════ */
init();
