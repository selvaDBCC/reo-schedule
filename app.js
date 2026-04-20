/* ═══════════════ CONFIG ═══════════════ */
const SUPA_URL='https://oekgtocjtloptrjacmcu.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9la2d0b2NqdGxvcHRyamFjbWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDM2NTAsImV4cCI6MjA5MTg3OTY1MH0.oioNTJ7qWraS0LR3DQcfFvQ9J6V28gbGrwsOEJ6jbk8';
const ADMIN_PIN='7519', BUCKET='schedules';
const SEEDS=[
{name:"Marymede Catholic College Stage 5",levels:["GRD","GRD-L1","L1","L1-L2","L2"],areas:["BORED PIERS","COLUMNS","CONVENTIONAL STAIRS / SUSPENDED","LIFT BASE & PIT WALLS","PAD & STRIP FOOTINGS - EXTERNAL CANOPY","RAFT & PAD FOOTINGS","SCREED","SUSPENDED FLOOR"]},
{name:"Qudos Port Arlington",levels:["B1","B1-LOWER GRD","GRD","GRD-UPPER GRD","GRD-UPPER GRD (S041)","GRD-UPPER GRD (S042)","GRD-UPPER GRD (S043)","L1 (S051)","L1 (S052)","L1 - L2 (S051)","L1 - L2 (S052)","L1-L2","L2 (S056)","L2 (S057)","LOWER GRD","LOWER GRD - GRD (S036)","LOWER GRD - GRD (S037)","LOWER GRD - GRD (S038)","ROOF (S053)","ROOF (S061)","ROOF (S062)","UPPER GRD (S046)","UPPER GRD (S047)","UPPER GRD (S048)","UPPER GRD - L1","UPPER GRD - L1 (S046)","UPPER GRD - L1 (S047)"],areas:["CAPPING BEAM","COLUMNS","DINCEL WALLS","HOBS","INSITU WALLS","LSCAPE TERRACE BONDECK","PAD FOOTINGS","PAD FOOTINGS & PILE CAP","PILE CAP & BEAM","PILES","RC POOL","SHOTCRETE UNDERSPRAY","SHOTCRETE WALL","SOG & RAMP","STAIR & LIFT RAFT","STAIR LID","STAIRFORM STAIRS / SUSPENDED","SUSPENDED FLOOR","WET JOINTS"]},
{name:"Summerset Oakleigh",levels:["B1","B1-GRD","GRD","GRD - ILA","GRD - RACF","GRD-L1 - ILA","GRD-L1 - RACF","L1 - ILA","L1 - RACF","L1-L2 - ILA","L1-L2 - RACF","L2 - ILA","L2 - RACF","L2-ROOF - ILA","L2-ROOF - RACF","ROOF-RACF"],areas:["(OPTION 1) MATERIAL HOIST PAD","(OPTION 2) LOADING BAY PADS","COLUMNS","DOWN TURN WALL","LIFT BASE & PIT WALLS","PAD & STRIP FOOTINGS","PILE CAP","RAMP","RETAINING WALL FOOTINGS","SOG","STAIR RAFT","STAIRFORM STAIRS / SUSPENDED","SUSPENDED FLOOR"]},
{name:"Trinity Grammar School",levels:["GRD","GRD-L1","L1","PLANT PLATFORM"],areas:["COLUMNS","CONVENTIONAL STAIRS / SUSPENDED","FOOTINGS","LIFT BASE & PIT WALLS","RAFT SLAB","RETAINING WALLS","SUSPENDED FLOOR","TIERED SEATING","UPSTAND"]}];
const ST_CLS={'Not Ordered':'pill-notordered','Ordered':'pill-ordered','Scheduled':'pill-scheduled','Delivered':'pill-delivered','Cancelled':'pill-cancelled'};
const sb=supabase.createClient(SUPA_URL,SUPA_KEY);
let projects=[],entries=[],pendingFile=null,editingId=null,adminUnlocked=false;
let sortCol="created_at",sortAsc=false,userName=localStorage.getItem('reo_user_name')||'';
let currentEntryType='scheduled',selectedOrderId=null,selectedIds=new Set(),dpSelected={},pdfjsLoaded=false;

/* ═══ HELPERS ═══ */
function today(){return new Date().toISOString().slice(0,10)}
function fmtDate(d){if(!d)return '';const p=d.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:d}
function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
function fmtSize(b){return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'}
function closeOv(id){document.getElementById(id).classList.remove('show')}
function hasMismatch(e){return e.our_delivery_date&&e.supplier_delivery_date&&e.our_delivery_date!==e.supplier_delivery_date&&!e.mismatch_resolved}
function getStatusPill(s,t){let h='';if(t==='loose')h='<span class="pill pill-loose">Ad Hoc</span> ';return h+'<span class="pill '+(ST_CLS[s]||'pill-notordered')+'">'+esc(s)+'</span>'}
function parseAusDate(s){const p=s.split('/');if(p.length!==3)return null;let[d,m,y]=p;if(y.length===2)y='20'+y;return`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}
async function auditLog(o){await sb.from('audit_log').insert({...o,user_identifier:userName})}

/* ═══ INIT ═══ */
async function init(){
  if(!userName){$('loadingScreen').style.display='none';$('nameOverlay').classList.add('show');return}
  $('userChip').textContent=userName;
  try{
    await loadProjects();if(projects.length===0)await seedProjects();
    await loadEntries();populateDropdowns();subscribeRealtime();
    $('inpDate').value=today();$('inpLooseDate').value=today();
    $('loadingScreen').style.display='none';$('mainApp').style.display='block';
    setupDragDrop();renderDash();renderAdminProj();renderAdminProgram();
  }catch(e){$('loadingScreen').innerHTML='<div style="text-align:center;padding:20px"><h2 style="color:var(--err)">Connection Error</h2><p style="color:var(--muted);font-size:13px">'+esc(e.message)+'</p><button class="btn btn-sm" onclick="location.reload()" style="width:auto;margin-top:12px">Retry</button></div>'}}
function $(id){return document.getElementById(id)}
function saveName(){const n=$('nameInput').value.trim();if(!n)return alert('Please enter your name');localStorage.setItem('reo_user_name',n);userName=n;$('nameOverlay').classList.remove('show');$('loadingScreen').style.display='flex';init()}

/* ═══ DATA ═══ */
async function loadProjects(){const{data,error}=await sb.from('projects').select('*').order('name');if(error)throw error;projects=data.map(p=>({id:p.id,name:p.name,levels:p.levels?p.levels.split('||').filter(Boolean):[],areas:p.areas?p.areas.split('||').filter(Boolean):[]}))}
async function seedProjects(){const rows=SEEDS.map(p=>({name:p.name,levels:p.levels.join('||'),areas:p.areas.join('||')}));await sb.from('projects').insert(rows);await loadProjects()}
async function loadEntries(){const{data,error}=await sb.from('entries').select('*').order('created_at',{ascending:false});if(error)throw error;entries=data;$('countNum').textContent=entries.length}
async function refreshAll(){await Promise.all([loadProjects(),loadEntries()]);populateDropdowns();renderDash()}
function subscribeRealtime(){
  sb.channel('e').on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadEntries().then(renderDash)).subscribe();
  sb.channel('p').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>loadProjects().then(()=>{populateDropdowns();if(adminUnlocked)renderProjList()})).subscribe()}

/* ═══ DROPDOWNS ═══ */
function populateDropdowns(){
  const names=projects.map(p=>p.name);
  ['selProj','fProj','dpProj'].forEach(id=>{const sel=$(id);if(!sel)return;const f=sel.options[0]?.text||'';sel.innerHTML=`<option value="">${f}</option>`;names.forEach(n=>sel.appendChild(new Option(n,n)))});
  const allL=new Set(),allA=new Set();projects.forEach(p=>{p.levels.forEach(l=>allL.add(l));p.areas.forEach(a=>allA.add(a))});
  const fL=$('fLevel');fL.innerHTML='<option value="">All Levels</option>';[...allL].sort().forEach(l=>fL.appendChild(new Option(l,l)));
  const fA=$('fArea');fA.innerHTML='<option value="">All Areas</option>';[...allA].sort().forEach(a=>fA.appendChild(new Option(a,a)))}

/* ═══ FORM: ENTRY TYPE ═══ */
function setEntryType(t){
  currentEntryType=t;selectedOrderId=null;
  $('typeSchedBtn').classList.toggle('active',t==='scheduled');
  $('typeLooseBtn').classList.toggle('active',t==='loose');
  $('looseSection').style.display=t==='loose'?'block':'none';
  $('orderListSection').style.display='none';
  $('uploadSection').style.display=t==='loose'?'block':'none';
  $('scheduleSection').style.display='none';
  $('commentsSection').style.display=t==='loose'?'block':'none';
  $('submitBtn').style.display=t==='loose'?'block':'none';
  if(t==='loose'){$('uploadStepLabel').textContent='③ Upload (Optional)'}
  onLevelAreaChange()}

function onProjChange(){
  const p=$('selProj').value,lS=$('selLevel'),aS=$('selArea');
  const proj=projects.find(pr=>pr.name===p);
  if(!proj){lS.innerHTML='<option value="">Select project first</option>';lS.disabled=true;aS.innerHTML='<option value="">Select project first</option>';aS.disabled=true;hideFormSteps();return}
  lS.innerHTML='<option value="">Select level...</option>';proj.levels.forEach(l=>lS.appendChild(new Option(l,l)));lS.disabled=false;
  aS.innerHTML='<option value="">Select area...</option>';proj.areas.forEach(a=>aS.appendChild(new Option(a,a)));aS.disabled=false;
  onLevelAreaChange()}

function hideFormSteps(){['orderListSection','uploadSection','scheduleSection','commentsSection'].forEach(id=>$(id).style.display='none');$('submitBtn').style.display='none';selectedOrderId=null}

function onLevelAreaChange(){
  if(currentEntryType==='loose')return;
  const proj=$('selProj').value,level=$('selLevel').value,area=$('selArea').value;
  if(!proj){hideFormSteps();return}
  const matching=entries.filter(e=>e.project===proj&&e.entry_type==='scheduled'&&(!level||e.level===level)&&(!area||e.area===area));
  const sec=$('orderListSection'),content=$('orderListContent');
  if(matching.length===0){
    sec.style.display='block';
    content.innerHTML=`<div class="warn-msg" style="margin-top:0">No orders found.${level&&area?' You can still submit — it will be flagged as <b>Unmatched</b>.':' Select level and area to narrow down.'}</div>`;
    if(level&&area){$('uploadSection').style.display='block';$('uploadStepLabel').textContent='② Upload Schedule';$('detailsStepLabel').textContent='③ Schedule Details';$('commentsSection').style.display='block';$('submitBtn').style.display='block';selectedOrderId=null}
    return}
  sec.style.display='block';
  let html='<p style="font-size:12px;color:var(--muted);margin-bottom:10px">Orders for <b>'+esc(proj)+'</b>'+(level?' / '+esc(level):'')+(area?' / '+esc(area):'')+':</p>';
  matching.forEach(e=>{
    const has=!!e.schedule,can=!has&&e.status!=='Cancelled'&&e.status!=='Delivered';
    html+=`<div class="order-item${selectedOrderId===e.id?' selected':''}${can?'':' disabled'}" ${can?`onclick="selectOrder(${e.id})"`:''}><div class="order-item-info"><div class="oi-title">${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' <span style="color:var(--accent-dk)">('+esc(e.split_reference)+')</span>':''}</div><div class="oi-meta">Delivery: ${fmtDate(e.our_delivery_date)||'Not set'} · ${e.status}${has?' · '+esc(e.schedule):''}</div></div><div>${has?'<span class="pill pill-scheduled">Has Schedule</span>':can?'<span class="pill pill-ordered">Attach →</span>':'<span class="pill pill-cancelled">'+esc(e.status)+'</span>'}</div></div>`});
  content.innerHTML=html}

function selectOrder(id){
  selectedOrderId=id;onLevelAreaChange();
  $('uploadSection').style.display='block';$('uploadStepLabel').textContent='③ Upload Schedule';
  $('detailsStepLabel').textContent='④ Schedule Details';
  $('commentsSection').style.display='block';$('submitBtn').style.display='block';
  if(pendingFile)$('scheduleSection').style.display='block'}

/* ═══ DRAG & DROP ═══ */
function setupDragDrop(){
  const z=$('formDropZone');if(!z)return;
  ['dragenter','dragover'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.add('dragover')}));
  ['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.remove('dragover')}));
  z.addEventListener('drop',e=>{if(e.dataTransfer.files.length)setFile(e.dataTransfer.files)})}

function setFile(fl){
  if(!fl.length)return;pendingFile=fl[0];renderFile();$('fileInp').value='';
  $('scheduleSection').style.display='block';
  if(pendingFile.name.toLowerCase().endsWith('.pdf'))extractPdfData(pendingFile)}

function renderFile(){
  if(!pendingFile){$('flist').innerHTML='';return}
  $('flist').innerHTML='<div class="fitem"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 '+esc(pendingFile.name)+' <span style="color:var(--muted);font-size:11px">('+fmtSize(pendingFile.size)+')</span></span><button onclick="pendingFile=null;renderFile();$(\'extractInfo\').innerHTML=\'\';$(\'scheduleSection\').style.display=\'none\'">×</button></div>'}

/* ═══ PDF EXTRACTION ═══ */
async function loadPdfJs(){if(pdfjsLoaded)return;return new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';pdfjsLoaded=true;res()};s.onerror=rej;document.head.appendChild(s)})}

async function doPdfExtract(file){
  await loadPdfJs();const buf=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const pg=await pdf.getPage(1);const tc=await pg.getTextContent();const t=tc.items.map(i=>i.str).join(' ');
  const e={};let m;
  m=t.match(/Ctrl\s*Code:\s*([A-Za-z0-9]+)/i);if(m)e.ctrlCode=m[1].trim();
  m=t.match(/Rel\s*No:\s*(\d+)/i);if(m)e.relNo=m[1].trim();
  m=t.match(/Ship\s*Date:\s*([\d\/]+)/i);if(m)e.shipDate=m[1].trim();
  m=t.match(/Wt:\s*([\d.]+)\s*T/i);if(m)e.weight=parseFloat(m[1]);
  m=t.match(/Drawing:\s*([A-Za-z0-9\-\s]+?)(?=\s{2,}|Bar|Desc|$)/i);if(m)e.drawing=m[1].trim();
  return e}

async function extractPdfData(file){
  const info=$('extractInfo');info.innerHTML='<div class="info-msg">Extracting from PDF...</div>';
  try{
    const ext=await doPdfExtract(file);
    if(ext.ctrlCode)$('inpSched').value=ext.ctrlCode;
    if(ext.relNo)$('inpRev').value=ext.relNo;
    if(ext.weight)$('inpWeight').value=ext.weight;
    if(ext.drawing)$('inpDrawing').value=ext.drawing;
    if(ext.shipDate){const iso=parseAusDate(ext.shipDate);if(iso)$('inpSupDate').value=iso}
    const ff=[];
    if(ext.ctrlCode)ff.push('Schedule: <b>'+esc(ext.ctrlCode)+'</b>');
    if(ext.relNo)ff.push('Rev: <b>'+esc(ext.relNo)+'</b>');
    if(ext.weight)ff.push('Wt: <b>'+ext.weight+'T</b>');
    if(ext.shipDate)ff.push('Ship: <b>'+esc(ext.shipDate)+'</b>');
    if(ext.drawing)ff.push('Drawing: <b>'+esc(ext.drawing)+'</b>');
    info.innerHTML=ff.length?`<div class="success-msg" style="margin-top:8px">Extracted: ${ff.join(' · ')}</div>`:'<div class="warn-msg" style="margin-top:8px">Could not detect data.</div>';
    pendingFile._extracted=ext;
  }catch(e){info.innerHTML='<div class="warn-msg" style="margin-top:8px">Extraction failed.</div>'}}

async function uploadFile(file,project,level,area){
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),ts=Date.now();
  const folder=[project,level||'_',area||'_'].map(s=>s.replace(/[^a-zA-Z0-9._-]/g,'_')).join('/');
  const path=`${folder}/${ts}_${safe}`;
  const{error}=await sb.storage.from(BUCKET).upload(path,file,{upsert:false});if(error)throw error;
  return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl}

/* ═══ SUBMIT ═══ */
async function submitEntry(){
  const err=$('formErr'),info=$('formInfo');err.innerHTML='';info.innerHTML='';
  const project=$('selProj').value,level=$('selLevel').value,area=$('selArea').value,comments=$('inpComm').value.trim();
  if(!project)return err.innerHTML='<div class="error-msg">Select a project</div>';
  const btn=$('submitBtn');btn.disabled=true;btn.textContent='Saving...';
  try{
    if(currentEntryType==='loose'){
      const desc=$('inpLooseDesc').value.trim(),ed=$('inpLooseDate').value;
      if(!desc)throw new Error('Enter a description');if(!ed)throw new Error('Select a date');
      let furl=null,fname=null;
      if(pendingFile){info.innerHTML='<div class="info-msg">Uploading...</div>';furl=await uploadFile(pendingFile,project,level,area);fname=pendingFile.name}
      const{data,error}=await sb.from('entries').insert({project,level:level||null,area:area||null,schedule:null,status:'Not Ordered',entry_date:ed,comments:desc+(comments?'\n'+comments:''),file_url:furl,file_name:fname,entry_type:'loose'}).select().single();
      if(error)throw error;
      await auditLog({entry_id:data.id,action:'CREATE',new_value:`LOOSE: ${project}/${level||'-'}/${area||'-'}`});
    }else{
      const schedule=$('inpSched').value.trim(),ed=$('inpDate').value,supD=$('inpSupDate').value||null;
      const weight=$('inpWeight').value||null,drawing=$('inpDrawing').value.trim()||null,rev=$('inpRev').value.trim()||null;
      if(!schedule)throw new Error('Enter schedule number');if(!ed)throw new Error('Select submission date');
      let furl=null,fname=null;
      if(pendingFile){info.innerHTML='<div class="info-msg">Uploading...</div>';furl=await uploadFile(pendingFile,project,level,area);fname=pendingFile.name}
      if(selectedOrderId){
        const entry=entries.find(e=>e.id===selectedOrderId);
        const up={schedule,entry_date:ed,supplier_delivery_date:supD,file_url:furl,file_name:fname,status:'Scheduled',total_weight:weight?parseFloat(weight):null,drawing_reference:drawing,revision_number:rev,comments:comments||entry.comments};
        if(entry.our_delivery_date&&supD&&entry.our_delivery_date!==supD)up.mismatch_resolved=false;
        const{error}=await sb.from('entries').update(up).eq('id',selectedOrderId);if(error)throw error;
        await auditLog({entry_id:selectedOrderId,action:'UPDATE',field_changed:'schedule_attached',new_value:`${schedule} (${fname||'no file'})`});
      }else{
        const{data,error}=await sb.from('entries').insert({project,level:level||null,area:area||null,schedule,status:'Scheduled',entry_date:ed,comments:comments||null,file_url:furl,file_name:fname,entry_type:'scheduled',total_weight:weight?parseFloat(weight):null,drawing_reference:drawing,revision_number:rev,supplier_delivery_date:supD,unmatched:true}).select().single();
        if(error)throw error;
        await auditLog({entry_id:data.id,action:'CREATE',new_value:`UNMATCHED: ${project}/${level||'-'}/${schedule}`});
      }}
    info.innerHTML='';$('successOv').classList.add('show');
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}
  btn.disabled=false;btn.textContent='Submit Entry'}

function resetForm(){
  $('selProj').value='';$('inpSched').value='';$('inpDate').value=today();$('inpLooseDate').value=today();
  $('inpLooseDesc').value='';$('inpComm').value='';$('inpSupDate').value='';$('inpWeight').value='';
  $('inpDrawing').value='';$('inpRev').value='';pendingFile=null;selectedOrderId=null;
  $('flist').innerHTML='';$('formErr').innerHTML='';$('formInfo').innerHTML='';$('extractInfo').innerHTML='';
  onProjChange();setEntryType('scheduled')}

/* ═══ DASHBOARD ═══ */
function getFiltered(){
  let list=entries.slice();
  const fp=$('fProj').value,fl=$('fLevel').value,fa=$('fArea').value,fs=$('fStatus').value,ft=$('fType').value,fm=$('fMismatch').value,fq=$('fSearch').value.toLowerCase().trim();
  if(fp)list=list.filter(e=>e.project===fp);if(fl)list=list.filter(e=>e.level===fl);if(fa)list=list.filter(e=>e.area===fa);
  if(fs)list=list.filter(e=>e.status===fs);if(ft)list=list.filter(e=>e.entry_type===ft);
  if(fm==='mismatch')list=list.filter(e=>hasMismatch(e));if(fm==='unmatched')list=list.filter(e=>e.unmatched);
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area,e.comments,e.drawing_reference].some(f=>(f||'').toLowerCase().includes(fq)));
  list.sort((a,b)=>{let va=a[sortCol]||'',vb=b[sortCol]||'';
    if(['entry_date','created_at','our_delivery_date','supplier_delivery_date'].includes(sortCol)){va=new Date(va||0);vb=new Date(vb||0);return sortAsc?va-vb:vb-va}
    if(sortCol==='total_weight'){va=parseFloat(va)||0;vb=parseFloat(vb)||0;return sortAsc?va-vb:vb-va}
    return sortAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va))});return list}

function renderDash(){
  const all=entries,f=getFiltered(),mc=all.filter(e=>hasMismatch(e)).length;
  $('statsArea').innerHTML=[{n:all.length,l:"Total",c:"var(--accent-dk)"},{n:all.filter(e=>e.status==="Not Ordered").length,l:"Not Ordered",c:"var(--gray)"},{n:all.filter(e=>e.status==="Ordered").length,l:"Ordered",c:"var(--info)"},{n:all.filter(e=>e.status==="Scheduled").length,l:"Scheduled",c:"var(--accent-dk)"},{n:all.filter(e=>e.status==="Delivered").length,l:"Delivered",c:"var(--success)"},{n:all.filter(e=>e.status==="Cancelled").length,l:"Cancelled",c:"var(--err)"},{n:mc,l:"⚠ Mismatches",c:"var(--warn)"}].map(s=>`<div class="stat"><div class="stat-n" style="color:${s.c}">${s.n}</div><div class="stat-l">${s.l}</div></div>`).join('');
  updateBulkBar();
  const w=$('dashTable');
  if(!f.length){w.innerHTML=`<div class="empty"><p>${all.length===0?'No entries yet.':'No matches.'}</p></div>`;return}
  const ar=c=>sortCol===c?(sortAsc?' ▲':' ▼'):'';
  const allCk=f.every(e=>selectedIds.has(e.id));
  w.innerHTML=`<table><thead><tr><th class="no-sort" style="width:36px"><input type="checkbox" ${allCk?'checked':''} onchange="toggleAll(this.checked)"></th><th onclick="tSort('project')">Project${ar('project')}</th><th onclick="tSort('level')">Level${ar('level')}</th><th onclick="tSort('area')">Area${ar('area')}</th><th onclick="tSort('schedule')">Schedule${ar('schedule')}</th><th onclick="tSort('total_weight')">Wt${ar('total_weight')}</th><th onclick="tSort('status')">Status${ar('status')}</th><th onclick="tSort('our_delivery_date')">Our Date${ar('our_delivery_date')}</th><th onclick="tSort('supplier_delivery_date')">Supplier${ar('supplier_delivery_date')}</th><th onclick="tSort('entry_date')">Submitted${ar('entry_date')}</th><th class="no-sort">Files</th><th class="no-sort" style="max-width:140px">Comments</th><th class="no-sort">Actions</th></tr></thead><tbody>${f.map(e=>{
    const mm=hasMismatch(e),cn=e.status==='Cancelled',mp=e.markup_plans?JSON.parse(e.markup_plans):[];
    return`<tr class="${cn?'cancelled':''}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleRowDrop(event,${e.id});this.classList.remove('drag-over')">
<td class="td-check"><input type="checkbox" ${selectedIds.has(e.id)?'checked':''} onchange="toggleSel(${e.id},this.checked)"></td>
<td class="proj-td" title="${esc(e.project)}">${esc(e.project)}${e.unmatched?'<span class="unmatched-icon" title="No placeholder existed">⚠</span>':''}</td>
<td>${esc(e.level||'—')}${e.split_reference?' <span style="font-size:10px;color:var(--accent-dk);font-weight:600">('+esc(e.split_reference)+')</span>':''}</td>
<td title="${esc(e.area||'')}">${esc(e.area||'—')}</td>
<td class="sched-td">${e.schedule?esc(e.schedule)+(e.revision_number?'<span style="color:var(--muted);font-size:10px"> r'+esc(e.revision_number)+'</span>':''):'<span style="color:#ccc">—</span>'}</td>
<td>${e.total_weight?`<span class="weight-td" onclick="editWeight(${e.id})">${e.total_weight}T</span>`:`<span style="color:#ccc;cursor:pointer" onclick="editWeight(${e.id})">—</span>`}</td>
<td>${getStatusPill(e.status,e.entry_type)}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.our_delivery_date)||'<span style="color:#ccc">—</span>'}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.supplier_delivery_date)||'<span style="color:#ccc">—</span>'}${mm?'<span class="mismatch-icon" title="Dates mismatch">⚠️</span>':''}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.entry_date)||'—'}</td>
<td>${e.file_url?`<a class="att-link" href="${e.file_url}" target="_blank">📄 ${esc((e.file_name||'').slice(0,12))}</a>`:''}${mp.length?`<button class="att-link markup-link" onclick="viewMarkups(${e.id})">📐 ${mp.length}</button>`:''}<button class="action-btn" onclick="uploadMarkup(${e.id})" style="font-size:10px;color:var(--info)">+📐</button></td>
<td class="comment-td" onclick="editComment(${e.id})" title="${esc(e.comments||'')}"><div class="comment-preview">${esc(e.comments||'—')}</div></td>
<td><div class="action-cell">
<button class="action-btn view" onclick="showDetail(${e.id})">View</button>
${['Scheduled','Ordered'].includes(e.status)?`<button class="action-btn deliver" onclick="markDelivered(${e.id})">✓</button>`:''}
${e.status!=='Cancelled'&&e.status!=='Delivered'?`<button class="action-btn cancel" onclick="cancelEntry(${e.id})">✗</button>`:''}
${e.status==='Cancelled'?`<button class="action-btn reinstate" onclick="reinstateEntry(${e.id})">↺</button>`:''}
${mm?`<button class="action-btn resolve" onclick="resolveMismatch(${e.id})">Fix</button><button class="action-btn mail" onclick="openEmailDraft(${e.id})">✉</button>`:''}
</div></td></tr>`}).join('')}</tbody></table>`}

function tSort(c){if(sortCol===c)sortAsc=!sortAsc;else{sortCol=c;sortAsc=true}renderDash()}

/* ═══ SELECTION ═══ */
function toggleSel(id,ck){if(ck)selectedIds.add(id);else selectedIds.delete(id);updateBulkBar();renderDash()}
function toggleAll(ck){getFiltered().forEach(e=>{if(ck)selectedIds.add(e.id);else selectedIds.delete(e.id)});updateBulkBar();renderDash()}
function clearSel(){selectedIds.clear();updateBulkBar();renderDash()}
function updateBulkBar(){const n=selectedIds.size;$('bulkBar').classList.toggle('show',n>0);$('bulkCount').textContent=n+' selected'}

async function bulkDownload(type){
  const sel=entries.filter(e=>selectedIds.has(e.id)),files=[];
  sel.forEach(e=>{
    if((type==='schedules'||type==='all')&&e.file_url)files.push({url:e.file_url,name:`sched_${e.schedule||e.id}.${(e.file_name||'pdf').split('.').pop()}`});
    if((type==='markups'||type==='all')&&e.markup_plans){JSON.parse(e.markup_plans).forEach((m,i)=>files.push({url:m.url,name:`markup_${e.id}_${i}.${(m.name||'pdf').split('.').pop()}`}))}});
  if(!files.length)return alert('No files');
  if(files.length===1){window.open(files[0].url,'_blank');return}
  try{const zip=new JSZip();$('bulkCount').textContent='Downloading...';
    for(const f of files){try{const r=await fetch(f.url);zip.file(f.name.replace(/[^a-zA-Z0-9._-]/g,'_'),await r.blob())}catch(e){}}
    const blob=await zip.generateAsync({type:'blob'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`reo-files-${today()}.zip`;a.click();$('bulkCount').textContent=selectedIds.size+' selected';
  }catch(e){alert('Failed: '+e.message)}}

/* ═══ DRAG DROP DASHBOARD ═══ */
function handleRowDrop(event,id){event.preventDefault();const f=event.dataTransfer.files;if(!f.length)return;openAttachModal(id,f[0])}
function openAttachModal(id,file){
  const e=entries.find(x=>x.id===id);if(!e)return;window._attFile=file;window._attExt={};
  let ep=null;if(file.name.toLowerCase().endsWith('.pdf'))ep=doPdfExtract(file);
  $('detailModal').innerHTML=`<h3>Attach Schedule<button class="modal-close" onclick="closeOv('detailOv')">&times;</button></h3>
<div class="info-msg" style="margin-top:0;margin-bottom:14px">Attaching <b>${esc(file.name)}</b> to: <b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div>
<div class="fg"><label>Schedule Number <span class="req">*</span></label><input type="text" id="att_sched" style="font-family:'JetBrains Mono',monospace"></div>
<div class="row2"><div class="fg"><label>Supplier Date <span class="req">*</span></label><input type="date" id="att_supD"></div><div class="fg"><label>Submission Date <span class="req">*</span></label><input type="date" id="att_subD" value="${today()}"></div></div>
<div id="att_info"></div><div id="att_err"></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('detailOv')">Cancel</button><button class="btn btn-sm" onclick="confirmAttach(${id})" id="att_btn" style="width:auto">Attach</button></div>`;
  $('detailOv').classList.add('show');
  if(ep){$('att_info').innerHTML='<div class="info-msg">Extracting...</div>';
    ep.then(ext=>{window._attExt=ext;if(ext.ctrlCode)$('att_sched').value=ext.ctrlCode;if(ext.shipDate){const iso=parseAusDate(ext.shipDate);if(iso)$('att_supD').value=iso}
      const ff=[];if(ext.ctrlCode)ff.push(ext.ctrlCode);if(ext.weight)ff.push(ext.weight+'T');if(ext.shipDate)ff.push(ext.shipDate);
      $('att_info').innerHTML=ff.length?'<div class="success-msg" style="margin-top:8px">'+ff.join(' · ')+'</div>':'';
    }).catch(()=>{$('att_info').innerHTML=''})}}

async function confirmAttach(id){
  const err=$('att_err');err.innerHTML='';const s=$('att_sched').value.trim(),sd=$('att_supD').value,sub=$('att_subD').value;
  if(!s)return err.innerHTML='<div class="error-msg">Schedule required</div>';if(!sd)return err.innerHTML='<div class="error-msg">Supplier date required</div>';if(!sub)return err.innerHTML='<div class="error-msg">Submission date required</div>';
  const btn=$('att_btn');btn.disabled=true;btn.textContent='Uploading...';
  try{const e=entries.find(x=>x.id===id),ext=window._attExt||{},file=window._attFile;
    const furl=await uploadFile(file,e.project,e.level,e.area);
    const up={schedule:s,entry_date:sub,supplier_delivery_date:sd,file_url:furl,file_name:file.name,status:'Scheduled',total_weight:ext.weight||null,drawing_reference:ext.drawing||null,revision_number:ext.relNo||null};
    if(e.our_delivery_date&&sd!==e.our_delivery_date)up.mismatch_resolved=false;
    const{error}=await sb.from('entries').update(up).eq('id',id);if(error)throw error;
    await auditLog({entry_id:id,action:'UPDATE',field_changed:'schedule_attached',new_value:s});
    closeOv('detailOv');await loadEntries();renderDash();
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}btn.disabled=false;btn.textContent='Attach'}

/* ═══ STATUS ACTIONS ═══ */
async function markDelivered(id){const e=entries.find(x=>x.id===id);if(!e||!confirm('Mark as Delivered?'))return;
  await sb.from('entries').update({status:'Delivered'}).eq('id',id);await auditLog({entry_id:id,action:'UPDATE',field_changed:'status',old_value:e.status,new_value:'Delivered'});await loadEntries();renderDash()}

function cancelEntry(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('cancelModal').innerHTML=`<h3>Cancel<button class="modal-close" onclick="closeOv('cancelOv')">&times;</button></h3><p style="font-size:13px;color:var(--mid);margin-bottom:14px">Cancel "${esc(e.schedule||e.project)}"?</p><div class="fg"><label>Reason <span class="req">*</span></label><textarea id="cancelR"></textarea></div><div id="cancelErr"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('cancelOv')">Keep</button><button class="btn btn-err btn-sm" onclick="doCancel(${id})">Cancel Entry</button></div>`;
  $('cancelOv').classList.add('show')}
async function doCancel(id){const r=$('cancelR').value.trim();if(!r)return $('cancelErr').innerHTML='<div class="error-msg">Reason required</div>';
  const e=entries.find(x=>x.id===id);await sb.from('entries').update({status:'Cancelled',cancel_reason:r}).eq('id',id);
  await auditLog({entry_id:id,action:'CANCEL',field_changed:'status',old_value:e.status,new_value:'Cancelled'});closeOv('cancelOv');await loadEntries();renderDash()}

async function reinstateEntry(id){const e=entries.find(x=>x.id===id);if(!e||!confirm('Reinstate?'))return;
  let ns='Not Ordered';if(e.file_url||e.schedule)ns='Scheduled';else if(e.our_delivery_date)ns='Ordered';
  await sb.from('entries').update({status:ns,cancel_reason:null}).eq('id',id);
  await auditLog({entry_id:id,action:'REINSTATE',field_changed:'status',old_value:'Cancelled',new_value:ns});await loadEntries();renderDash()}

async function resolveMismatch(id){if(!confirm('Mark resolved?'))return;
  await sb.from('entries').update({mismatch_resolved:true,mismatch_resolved_by:userName,mismatch_resolved_at:new Date().toISOString()}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'mismatch_resolved',new_value:'true'});await loadEntries();renderDash()}

/* ═══ WEIGHT / COMMENT / MARKUP ═══ */
function editWeight(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('weightModal').innerHTML=`<h3>Weight<button class="modal-close" onclick="closeOv('weightOv')">&times;</button></h3><div class="fg"><label>Tonnes</label><input type="number" step="0.001" id="wInp" value="${e.total_weight||''}" style="font-family:'JetBrains Mono',monospace"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('weightOv')">Cancel</button><button class="btn btn-sm" onclick="saveWeight(${id})" style="width:auto">Save</button></div>`;$('weightOv').classList.add('show')}
async function saveWeight(id){const v=$('wInp').value;await sb.from('entries').update({total_weight:v?parseFloat(v):null}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'total_weight',new_value:v||''});closeOv('weightOv');await loadEntries();renderDash()}

function editComment(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('commentModal').innerHTML=`<h3>Comment<button class="modal-close" onclick="closeOv('commentOv')">&times;</button></h3><div class="fg"><textarea id="cmtInp" rows="4">${esc(e.comments||'')}</textarea></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn btn-sec btn-sm" onclick="closeOv('commentOv')">Cancel</button><button class="btn btn-sm" onclick="saveCmt(${id})" style="width:auto">Save</button></div>`;$('commentOv').classList.add('show')}
async function saveCmt(id){const v=$('cmtInp').value.trim();const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({comments:v||null}).eq('id',id);await auditLog({entry_id:id,action:'UPDATE',field_changed:'comments',old_value:e.comments||'',new_value:v||''});closeOv('commentOv');await loadEntries();renderDash()}

function uploadMarkup(id){const inp=document.createElement('input');inp.type='file';inp.accept='.pdf,.jpg,.jpeg,.png,.dwg';
  inp.onchange=async()=>{if(!inp.files.length)return;const file=inp.files[0];try{const e=entries.find(x=>x.id===id);
    const furl=await uploadFile(file,e.project+'/_markups',e.level,e.area);
    const mp=e.markup_plans?JSON.parse(e.markup_plans):[];mp.push({url:furl,name:file.name,uploaded_by:userName,date:today()});
    await sb.from('entries').update({markup_plans:JSON.stringify(mp)}).eq('id',id);
    await auditLog({entry_id:id,action:'UPDATE',field_changed:'markup_plans',new_value:'Added: '+file.name});
    await loadEntries();renderDash();}catch(e){alert('Failed: '+e.message)}};inp.click()}

function viewMarkups(id){const e=entries.find(x=>x.id===id);if(!e)return;const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  $('markupModal').innerHTML=`<h3>Markup Plans<button class="modal-close" onclick="closeOv('markupOv')">&times;</button></h3><p style="font-size:12px;color:var(--muted);margin-bottom:12px">${esc(e.project)} / ${esc(e.level||'')} / ${esc(e.area||'')}</p>${mp.map((m,i)=>`<div class="fitem"><a href="${m.url}" target="_blank" style="color:var(--info);text-decoration:none">📐 ${esc(m.name)}</a> <span style="color:var(--muted);font-size:10px">by ${esc(m.uploaded_by||'?')}</span><button onclick="removeMarkup(${id},${i})">×</button></div>`).join('')}${!mp.length?'<p style="color:var(--muted)">None yet.</p>':''}<button class="btn btn-sec btn-sm" onclick="uploadMarkup(${id});closeOv('markupOv')" style="margin-top:12px">+ Add</button>`;$('markupOv').classList.add('show')}
async function removeMarkup(id,idx){if(!confirm('Remove?'))return;const e=entries.find(x=>x.id===id);const mp=JSON.parse(e.markup_plans||'[]');mp.splice(idx,1);
  await sb.from('entries').update({markup_plans:mp.length?JSON.stringify(mp):null}).eq('id',id);await auditLog({entry_id:id,action:'UPDATE',field_changed:'markup_plans',old_value:'Removed'});await loadEntries();renderDash();closeOv('markupOv')}

/* ═══ DETAIL ═══ */
function showDetail(id){const e=entries.find(x=>x.id===id);if(!e)return;const mm=hasMismatch(e),mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  $('detailModal').innerHTML=`<h3>Details<button class="modal-close" onclick="closeOv('detailOv')">&times;</button></h3>
${e.entry_type==='loose'?'<span class="pill pill-loose" style="margin-bottom:12px;display:inline-block">Ad Hoc</span>':''}
${e.unmatched?'<div class="warn-msg" style="margin-top:0;margin-bottom:12px">⚠ Unmatched entry</div>':''}
<div class="drow"><div class="dlbl">Project</div><div class="dval">${esc(e.project)}</div></div>
<div class="drow"><div class="dlbl">Level</div><div class="dval">${esc(e.level||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div></div>
<div class="drow"><div class="dlbl">Area</div><div class="dval">${esc(e.area||'—')}</div></div>
<div class="drow"><div class="dlbl">Schedule</div><div class="dval" style="font-family:'JetBrains Mono',monospace">${esc(e.schedule||'—')}${e.revision_number?' r'+esc(e.revision_number):''}</div></div>
<div class="drow"><div class="dlbl">Drawing</div><div class="dval">${esc(e.drawing_reference||'—')}</div></div>
<div class="drow"><div class="dlbl">Weight</div><div class="dval">${e.total_weight?e.total_weight+' T':'—'}</div></div>
<div class="drow"><div class="dlbl">Status</div><div class="dval">${getStatusPill(e.status,e.entry_type)}</div></div>
${e.cancel_reason?`<div class="drow"><div class="dlbl">Cancel Reason</div><div class="dval" style="color:var(--err)">${esc(e.cancel_reason)}</div></div>`:''}
<div class="drow"><div class="dlbl">Our Delivery</div><div class="dval">${fmtDate(e.our_delivery_date)||'—'}</div></div>
<div class="drow"><div class="dlbl">Supplier Date</div><div class="dval">${fmtDate(e.supplier_delivery_date)||'—'}${mm?' ⚠️':''}</div></div>
<div class="drow"><div class="dlbl">Submitted</div><div class="dval">${fmtDate(e.entry_date)||'—'}</div></div>
<div class="drow"><div class="dlbl">Comments</div><div class="dval">${esc(e.comments)||'—'}</div></div>
<div class="drow"><div class="dlbl">File</div><div class="dval">${e.file_url?`<a class="att-link" href="${e.file_url}" target="_blank">📄 ${esc(e.file_name)}</a>`:'None'}</div></div>
<div class="drow"><div class="dlbl">Markups</div><div class="dval">${mp.length?mp.map(m=>`<a class="att-link markup-link" href="${m.url}" target="_blank">📐 ${esc(m.name)}</a>`).join(' '):'None'}</div></div>
<div style="margin-top:20px;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
${e.status!=='Cancelled'&&e.status!=='Delivered'?`<button class="btn btn-err btn-sm" onclick="closeOv('detailOv');cancelEntry(${e.id})">Cancel</button>`:''}
${e.status==='Cancelled'?`<button class="btn btn-sec btn-sm" onclick="closeOv('detailOv');reinstateEntry(${e.id})">Reinstate</button>`:''}
<button class="btn btn-sec btn-sm" onclick="closeOv('detailOv');openEditEntry(${e.id})">Edit</button>
${['Scheduled','Ordered'].includes(e.status)?`<button class="btn btn-sm" style="width:auto;background:var(--success)" onclick="closeOv('detailOv');markDelivered(${e.id})">✓ Delivered</button>`:''}
${adminUnlocked?`<button class="btn btn-err btn-sm" onclick="deleteEntry(${e.id})">Delete</button>`:''}
</div>`;$('detailOv').classList.add('show')}

/* ═══ EDIT ═══ */
function openEditEntry(id){const e=entries.find(x=>x.id===id);if(!e)return;
  const proj=projects.find(p=>p.name===e.project);
  $('editModal').innerHTML=`<h3>Edit<button class="modal-close" onclick="closeOv('editOv')">&times;</button></h3>
<div class="fg"><label>Project</label><select id="ed_proj">${projects.map(p=>`<option${p.name===e.project?' selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
<div class="row2"><div class="fg"><label>Level</label><select id="ed_level"><option value="">None</option>${(proj?proj.levels:[]).map(l=>`<option${l===e.level?' selected':''}>${esc(l)}</option>`).join('')}</select></div><div class="fg"><label>Area</label><select id="ed_area"><option value="">None</option>${(proj?proj.areas:[]).map(a=>`<option${a===e.area?' selected':''}>${esc(a)}</option>`).join('')}</select></div></div>
<div class="row2"><div class="fg"><label>Schedule</label><input type="text" id="ed_sched" value="${esc(e.schedule||'')}" style="font-family:'JetBrains Mono',monospace"></div><div class="fg"><label>Submission Date</label><input type="date" id="ed_date" value="${e.entry_date||''}"></div></div>
<div class="row2"><div class="fg"><label>Our Delivery Date</label><input type="date" id="ed_ourD" value="${e.our_delivery_date||''}"></div><div class="fg"><label>Supplier Date</label><input type="date" id="ed_supD" value="${e.supplier_delivery_date||''}"></div></div>
<div class="row2"><div class="fg"><label>Drawing</label><input type="text" id="ed_draw" value="${esc(e.drawing_reference||'')}"></div><div class="fg"><label>Revision</label><input type="text" id="ed_rev" value="${esc(e.revision_number||'')}"></div></div>
<div class="fg"><label>Split Reference</label><input type="text" id="ed_split" value="${esc(e.split_reference||'')}"></div>
<div class="fg"><label>Comments</label><textarea id="ed_comm">${esc(e.comments||'')}</textarea></div>
<div id="edErr"></div>
<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-sec btn-sm" onclick="closeOv('editOv')">Cancel</button><button class="btn btn-sm" onclick="saveEdit(${id})" style="width:auto">Save</button></div>`;
  $('editOv').classList.add('show')}

async function saveEdit(id){const e=entries.find(x=>x.id===id);if(!e)return;const err=$('edErr');err.innerHTML='';
  const nv={project:$('ed_proj').value,level:$('ed_level').value||null,area:$('ed_area').value||null,schedule:$('ed_sched').value.trim()||null,entry_date:$('ed_date').value||null,our_delivery_date:$('ed_ourD').value||null,supplier_delivery_date:$('ed_supD').value||null,drawing_reference:$('ed_draw').value.trim()||null,revision_number:$('ed_rev').value.trim()||null,split_reference:$('ed_split').value.trim()||null,comments:$('ed_comm').value.trim()||null};
  if(!nv.project)return err.innerHTML='<div class="error-msg">Project required</div>';
  if(e.status==='Not Ordered'&&nv.our_delivery_date)nv.status='Ordered';
  if((e.status==='Not Ordered'||e.status==='Ordered')&&nv.schedule)nv.status='Scheduled';
  if(nv.our_delivery_date&&nv.supplier_delivery_date&&nv.our_delivery_date!==nv.supplier_delivery_date&&(e.our_delivery_date!==nv.our_delivery_date||e.supplier_delivery_date!==nv.supplier_delivery_date)){nv.mismatch_resolved=false}
  const ch=[];['project','level','area','schedule','entry_date','our_delivery_date','supplier_delivery_date','drawing_reference','revision_number','split_reference','comments'].forEach(k=>{if((e[k]||'')!==(nv[k]||''))ch.push({field:k,old:e[k]||'',new:nv[k]||''})});
  if(!ch.length){closeOv('editOv');return}
  const{error}=await sb.from('entries').update(nv).eq('id',id);if(error)return err.innerHTML='<div class="error-msg">'+esc(error.message)+'</div>';
  await sb.from('audit_log').insert(ch.map(c=>({entry_id:id,action:'UPDATE',field_changed:c.field,old_value:String(c.old),new_value:String(c.new),user_identifier:userName})));
  closeOv('editOv');await loadEntries();renderDash()}

async function deleteEntry(id){if(!adminUnlocked||!confirm('Delete permanently?'))return;const e=entries.find(x=>x.id===id);
  await sb.from('entries').delete().eq('id',id);if(e)await auditLog({entry_id:id,action:'DELETE',old_value:`${e.project}/${e.schedule||'LOOSE'}`});
  closeOv('detailOv');await loadEntries();renderDash()}

/* ═══ EMAIL ═══ */
function openEmailDraft(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('emailModal').innerHTML=`<h3>Email<button class="modal-close" onclick="closeOv('emailOv')">&times;</button></h3>
<div class="fg"><label>To</label><input type="email" id="em_to" placeholder="orders@ausreo.com.au"></div>
<div class="fg"><label>Subject</label><input type="text" id="em_sub" value="${esc(`Date Mismatch — ${e.project} / ${e.level||''} / ${e.area||''}`)}"></div>
<div class="fg"><label>Message</label><textarea id="em_body" rows="10" style="font-size:13px">${esc(`Hi,\n\nDate mismatch:\nProject: ${e.project}\nLevel: ${e.level||'—'} / Area: ${e.area||'—'}${e.split_reference?' ('+e.split_reference+')':''}\nSchedule: ${e.schedule||'—'}\n\nOur Date: ${fmtDate(e.our_delivery_date)||'Not set'}\nYour Date: ${fmtDate(e.supplier_delivery_date)||'Not set'}\n\nPlease confirm.\n\nRegards,\n${userName}\nDebono Bros Concreting`)}</textarea></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('emailOv')">Cancel</button><button class="btn btn-purple btn-sm" onclick="sendEmail(${id})" style="width:auto">✉ Send</button></div>`;$('emailOv').classList.add('show')}
async function sendEmail(id){const to=$('em_to').value.trim(),sub=$('em_sub').value.trim(),body=$('em_body').value.trim();if(!to)return alert('Enter recipient');
  window.open(`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`,'_blank');
  await auditLog({entry_id:id,action:'EMAIL_SENT',new_value:'To: '+to});closeOv('emailOv')}

/* ═══ EXPORT ═══ */
function exportCSV(){const d=getFiltered();if(!d.length)return alert('No data');
  const h=['Project','Level','Area','Split','Schedule','Rev','Drawing','Weight','Status','Type','Our Date','Supplier Date','Submitted','Comments','File'];
  const rows=d.map(e=>[e.project,e.level||'',e.area||'',e.split_reference||'',e.schedule||'',e.revision_number||'',e.drawing_reference||'',e.total_weight||'',e.status,e.entry_type,e.our_delivery_date||'',e.supplier_delivery_date||'',e.entry_date||'',e.comments||'',e.file_name||'']);
  const csv=[h,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`reo-${today()}.csv`;a.click()}

/* ═══ NAV ═══ */
function showPage(p){
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el=>el.classList.remove('active'));
  $({form:'pageForm',dash:'pageDash',admin:'pageAdmin'}[p]).classList.add('active');
  $({form:'tabForm',dash:'tabDash',admin:'tabAdmin'}[p]).classList.add('active');
  if(p==='dash')renderDash();if(p==='admin'&&adminUnlocked)showAdminSub('proj')}

/* ═══ ADMIN ═══ */
function checkPin(){if($('pinInp').value===ADMIN_PIN){adminUnlocked=true;$('pinGate').style.display='none';$('adminContent').style.display='block';showAdminSub('proj');$('pinInp').value='';$('pinErr').innerHTML=''}else{$('pinErr').innerHTML='<div class="error-msg">Wrong PIN</div>';$('pinInp').value=''}}
function lockAdmin(){adminUnlocked=false;$('pinGate').style.display='block';$('adminContent').style.display='none'}
function showAdminSub(s){['proj','program','audit'].forEach(t=>{
  const tab=$('at'+t.charAt(0).toUpperCase()+t.slice(1));if(tab)tab.classList.toggle('active',t===s);
  const panel=$('admin'+t.charAt(0).toUpperCase()+t.slice(1));if(panel)panel.style.display=t===s?'block':'none'});
  if(s==='proj')renderAdminProj();if(s==='program')renderAdminProgram();if(s==='audit')loadAuditLog()}

/* ═══ ADMIN: PROJECTS ═══ */
function renderAdminProj(){
  $('adminProj').innerHTML=`<div class="card" style="margin-bottom:18px"><h3 style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--gray-dk)" id="aFormTitle">Add New Project</h3><div class="fg"><label>Project Name</label><input type="text" id="newProjName" placeholder="e.g. New School Stage 2"></div><div class="row2"><div class="fg"><label>Levels <span style="font-weight:400;color:var(--muted);font-size:11px">(one per line)</span></label><textarea id="newLevels" rows="6" style="font-family:'JetBrains Mono',monospace;font-size:12px"></textarea></div><div class="fg"><label>Areas <span style="font-weight:400;color:var(--muted);font-size:11px">(one per line)</span></label><textarea id="newAreas" rows="6" style="font-family:'JetBrains Mono',monospace;font-size:12px"></textarea></div></div><div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-sm" onclick="saveProject()" id="saveProjBtn" style="width:auto">Add Project</button><button class="btn btn-sec btn-sm" onclick="cancelPE()" id="cancelPE" style="display:none;width:auto">Cancel</button></div><div id="projErr"></div></div><div class="card"><h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--gray-dk)">Projects (<span id="projCount">${projects.length}</span>)</h3><div class="proj-list" id="projList"></div></div>`;renderProjList()}
function renderProjList(){$('projCount').textContent=projects.length;
  $('projList').innerHTML=projects.length?projects.map(p=>`<div class="proj-item"><div class="proj-item-info"><h4>${esc(p.name)}</h4><div class="counts"><b>${p.levels.length}</b> levels · <b>${p.areas.length}</b> areas</div><div class="sum">${esc(p.levels.slice(0,6).join(', '))}</div></div><div class="proj-actions"><button class="btn btn-sec btn-sm" onclick="editProj(${p.id})">Edit</button><button class="btn btn-err btn-sm" onclick="deleteProj(${p.id})">Delete</button></div></div>`).join(''):'<div class="empty">No projects</div>'}
function editProj(id){const p=projects.find(pr=>pr.id===id);if(!p)return;editingId=id;$('aFormTitle').textContent='Edit Project';$('newProjName').value=p.name;$('newLevels').value=p.levels.join('\n');$('newAreas').value=p.areas.join('\n');$('saveProjBtn').textContent='Save';$('cancelPE').style.display='inline-block'}
function cancelPE(){editingId=null;$('aFormTitle').textContent='Add New Project';$('newProjName').value='';$('newLevels').value='';$('newAreas').value='';$('saveProjBtn').textContent='Add Project';$('cancelPE').style.display='none';$('projErr').innerHTML=''}
async function saveProject(){const err=$('projErr');err.innerHTML='';const name=$('newProjName').value.trim(),levels=$('newLevels').value.split('\n').map(s=>s.trim()).filter(Boolean),areas=$('newAreas').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!name)return err.innerHTML='<div class="error-msg">Name required</div>';
  const data={name,levels:levels.join('||'),areas:areas.join('||')};
  if(editingId){const old=projects.find(p=>p.id===editingId);const{error}=await sb.from('projects').update(data).eq('id',editingId);if(error)return err.innerHTML='<div class="error-msg">'+esc(error.message)+'</div>';
    await auditLog({action:'PROJECT_EDIT',field_changed:name,old_value:`${old.name} (${old.levels.length}L)`,new_value:`${name} (${levels.length}L)`});
  }else{if(projects.find(p=>p.name.toLowerCase()===name.toLowerCase()))return err.innerHTML='<div class="error-msg">Already exists</div>';
    const{error}=await sb.from('projects').insert(data);if(error)return err.innerHTML='<div class="error-msg">'+esc(error.message)+'</div>';
    await auditLog({action:'PROJECT_ADD',new_value:`${name} (${levels.length}L/${areas.length}A)`})}
  cancelPE();await loadProjects();populateDropdowns();renderProjList()}
async function deleteProj(id){const p=projects.find(pr=>pr.id===id);if(!p||!confirm('Delete "'+p.name+'"?'))return;
  await sb.from('projects').delete().eq('id',id);await auditLog({action:'PROJECT_DELETE',old_value:p.name});await loadProjects();populateDropdowns();renderProjList()}

/* ═══ ADMIN: DELIVERY PROGRAM ═══ */
function renderAdminProgram(){
  $('adminProgram').innerHTML=`<div class="card" style="margin-bottom:20px"><div class="fg"><label>Select Project</label><select id="dpProj" onchange="onDpProjChange()"><option value="">Choose...</option>${projects.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></div></div><div id="dpContent" style="display:none"><div class="card" style="margin-bottom:20px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px"><div><h3 style="font-size:15px;font-weight:700;color:var(--gray-dk);margin-bottom:2px">Level / Area Grid</h3><p style="font-size:12px;color:var(--muted)">Tick to create placeholders. Green = exists.</p></div><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="dpSelectAll()">Select All</button><button class="btn btn-ghost btn-sm" onclick="dpClearAll()">Clear</button></div></div><div class="grid-wrap" id="dpGridWrap"></div></div><div id="dpSelArea" style="display:none"><div class="card"><h3 style="font-size:15px;font-weight:700;color:var(--gray-dk);margin-bottom:4px">Selected (<span id="dpSelCount">0</span>)</h3><p style="font-size:12px;color:var(--muted);margin-bottom:14px">Set splits and per-delivery dates.</p><div id="dpSelList"></div><button class="btn" onclick="dpCreate()" id="dpCreateBtn">Create Placeholders</button><div id="dpErr"></div><div id="dpSuc"></div></div></div></div>`}

function onDpProjChange(){dpSelected={};const p=$('dpProj').value;$('dpContent').style.display=p?'block':'none';if(p)renderDpGrid()}
function renderDpGrid(){const pn=$('dpProj').value,proj=projects.find(p=>p.name===pn);if(!proj)return;
  const pe=entries.filter(e=>e.project===pn);
  let h='<table class="grid-table"><thead><tr><th class="corner-th">Level \\ Area</th>';
  proj.areas.forEach(a=>{h+=`<th class="area-th" title="${esc(a)}">${esc(a)}</th>`});
  h+='</tr></thead><tbody>';
  proj.levels.forEach(lv=>{h+=`<tr><td class="level-td">${esc(lv)}</td>`;
    proj.areas.forEach(ar=>{const k=lv+'||'+ar,ex=pe.filter(e=>e.level===lv&&e.area===ar),ck=dpSelected[k];
      h+=ex.length?`<td><div class="grid-cell has-entry" title="${ex.length} exist">${ex.length}</div></td>`:`<td><div class="grid-cell${ck?' checked':''}" onclick="toggleDp('${k.replace(/'/g,"\\'")}')"</div></td>`});h+='</tr>'});
  h+='</tbody></table>';$('dpGridWrap').innerHTML=h;renderDpSel()}
function toggleDp(k){if(dpSelected[k])delete dpSelected[k];else dpSelected[k]={splits:[{label:'',date:''}]};renderDpGrid()}
function dpSelectAll(){const pn=$('dpProj').value,proj=projects.find(p=>p.name===pn);if(!proj)return;
  const pe=entries.filter(e=>e.project===pn);proj.levels.forEach(lv=>{proj.areas.forEach(ar=>{const k=lv+'||'+ar;if(!pe.some(e=>e.level===lv&&e.area===ar)&&!dpSelected[k])dpSelected[k]={splits:[{label:'',date:''}]}})});renderDpGrid()}
function dpClearAll(){dpSelected={};renderDpGrid()}

function renderDpSel(){const keys=Object.keys(dpSelected);$('dpSelArea').style.display=keys.length?'block':'none';
  if(!keys.length)return;const total=keys.reduce((s,k)=>s+dpSelected[k].splits.length,0);$('dpSelCount').textContent=total;
  let html='';keys.sort().forEach(k=>{const[lv,ar]=k.split('||'),sel=dpSelected[k];
    html+=`<div class="sel-item"><div class="sel-item-header"><div class="sel-item-title">${esc(lv)} / ${esc(ar)}</div><div class="sel-item-controls"><button onclick="dpRemSplit('${k.replace(/'/g,"\\'")}')">−</button><span>${sel.splits.length}</span><button onclick="dpAddSplit('${k.replace(/'/g,"\\'")}')">+</button><button onclick="delete dpSelected['${k.replace(/'/g,"\\'")}'];renderDpGrid()" style="color:var(--err);border-color:#f5c6c6">×</button></div></div>`;
    sel.splits.forEach((sp,i)=>{html+=`<div class="split-row"><input type="text" value="${esc(sp.label)}" placeholder="${sel.splits.length>1?'Part '+(i+1):'No split'}" onchange="dpSelected['${k.replace(/'/g,"\\'")}'].splits[${i}].label=this.value"><input type="date" value="${sp.date||''}" onchange="dpSelected['${k.replace(/'/g,"\\'")}'].splits[${i}].date=this.value">${sel.splits.length>1?`<button class="remove-split" onclick="dpSelected['${k.replace(/'/g,"\\'")}'].splits.splice(${i},1);renderDpSel()">×</button>`:'<span style="width:24px"></span>'}</div>`});
    html+='</div>'});$('dpSelList').innerHTML=html}

function dpAddSplit(k){if(!dpSelected[k])return;dpSelected[k].splits.push({label:'Part '+(dpSelected[k].splits.length+1),date:''});renderDpSel()}
function dpRemSplit(k){if(!dpSelected[k]||dpSelected[k].splits.length<=1)return;dpSelected[k].splits.pop();renderDpSel()}

async function dpCreate(){const err=$('dpErr'),suc=$('dpSuc');err.innerHTML='';suc.innerHTML='';
  const pn=$('dpProj').value,keys=Object.keys(dpSelected);if(!keys.length)return err.innerHTML='<div class="error-msg">Select combinations</div>';
  const btn=$('dpCreateBtn');btn.disabled=true;btn.textContent='Creating...';const bid='b_'+Date.now();
  try{const rows=[];keys.forEach(k=>{const[lv,ar]=k.split('||');dpSelected[k].splits.forEach((sp,i)=>{
    rows.push({project:pn,level:lv,area:ar,schedule:null,status:sp.date?'Ordered':'Not Ordered',entry_type:'scheduled',our_delivery_date:sp.date||null,split_reference:dpSelected[k].splits.length>1?(sp.label||'Part '+(i+1)):sp.label||null,order_batch_id:bid})})});
    const{error}=await sb.from('entries').insert(rows);if(error)throw error;
    await auditLog({action:'BULK_CREATE',new_value:`${rows.length} placeholders for ${pn}`});
    dpSelected={};await loadEntries();renderDpGrid();suc.innerHTML=`<div class="success-msg">Created ${rows.length} entries!</div>`;
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}btn.disabled=false;btn.textContent='Create Placeholders'}

/* ═══ AUDIT LOG ═══ */
async function loadAuditLog(){const{data,error}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(300);
  const el=$('adminAudit');
  el.innerHTML=`<div class="card"><h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--gray-dk)">Change History</h3><div style="max-height:620px;overflow-y:auto">${error?'<div class="empty">Error</div>':!data?.length?'<div class="empty">No activity</div>':data.map(a=>{const t=new Date(a.created_at).toLocaleString('en-AU');let d='';
    if(a.action==='CREATE')d='Created: <b>'+esc(a.new_value)+'</b>';
    else if(a.action==='BULK_CREATE')d='<b>'+esc(a.new_value)+'</b>';
    else if(a.action==='UPDATE')d='<b>'+esc(a.field_changed)+'</b>: "'+esc(a.old_value)+'" → "'+esc(a.new_value)+'"';
    else if(a.action==='CANCEL')d='<b>Cancelled</b> #'+a.entry_id;
    else if(a.action==='REINSTATE')d='<b>Reinstated</b> #'+a.entry_id;
    else if(a.action==='DELETE')d='<b>Deleted</b>: '+esc(a.old_value);
    else if(a.action==='EMAIL_SENT')d='<b>Email</b>: '+esc(a.new_value);
    else if(a.action==='PROJECT_ADD')d='Added: <b>'+esc(a.new_value)+'</b>';
    else if(a.action==='PROJECT_EDIT')d='Edited: '+esc(a.old_value)+' → <b>'+esc(a.new_value)+'</b>';
    else if(a.action==='PROJECT_DELETE')d='Deleted: <b>'+esc(a.old_value)+'</b>';
    else d=esc(a.action)+': '+esc(a.new_value||'');
    return`<div class="audit-item"><div class="audit-time">${t}<span class="audit-user">${esc(a.user_identifier||'?')}</span></div><div class="audit-details">${d}</div></div>`}).join('')}</div></div>`}

init();
