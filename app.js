/* ═══════════════ CONFIG ═══════════════ */
const APP_VERSION='b5.5.1';
const SUPA_URL='https://oekgtocjtloptrjacmcu.supabase.co';
const SUPA_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9la2d0b2NqdGxvcHRyamFjbWN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYzMDM2NTAsImV4cCI6MjA5MTg3OTY1MH0.oioNTJ7qWraS0LR3DQcfFvQ9J6V28gbGrwsOEJ6jbk8';
const ADMIN_PIN='7519', BUCKET='schedules';
const SEEDS=[
{name:"Marymede Catholic College Stage 5",levels:["GRD","GRD-L1","L1","L1-L2","L2"],areas:["BORED PIERS","COLUMNS","CONVENTIONAL STAIRS / SUSPENDED","LIFT BASE & PIT WALLS","PAD & STRIP FOOTINGS - EXTERNAL CANOPY","RAFT & PAD FOOTINGS","SCREED","SUSPENDED FLOOR"]},
{name:"Qudos Port Arlington",levels:["B1","B1-LOWER GRD","GRD","GRD-UPPER GRD","GRD-UPPER GRD (S041)","GRD-UPPER GRD (S042)","GRD-UPPER GRD (S043)","L1 (S051)","L1 (S052)","L1 - L2 (S051)","L1 - L2 (S052)","L1-L2","L2 (S056)","L2 (S057)","LOWER GRD","LOWER GRD - GRD (S036)","LOWER GRD - GRD (S037)","LOWER GRD - GRD (S038)","ROOF (S053)","ROOF (S061)","ROOF (S062)","UPPER GRD (S046)","UPPER GRD (S047)","UPPER GRD (S048)","UPPER GRD - L1","UPPER GRD - L1 (S046)","UPPER GRD - L1 (S047)"],areas:["CAPPING BEAM","COLUMNS","DINCEL WALLS","HOBS","INSITU WALLS","LSCAPE TERRACE BONDECK","PAD FOOTINGS","PAD FOOTINGS & PILE CAP","PILE CAP & BEAM","PILES","RC POOL","SHOTCRETE UNDERSPRAY","SHOTCRETE WALL","SOG & RAMP","STAIR & LIFT RAFT","STAIR LID","STAIRFORM STAIRS / SUSPENDED","SUSPENDED FLOOR","WET JOINTS"]},
{name:"Summerset Oakleigh",levels:["B1","B1-GRD","GRD","GRD - ILA","GRD - RACF","GRD-L1 - ILA","GRD-L1 - RACF","L1 - ILA","L1 - RACF","L1-L2 - ILA","L1-L2 - RACF","L2 - ILA","L2 - RACF","L2-ROOF - ILA","L2-ROOF - RACF","ROOF-RACF"],areas:["(OPTION 1) MATERIAL HOIST PAD","(OPTION 2) LOADING BAY PADS","COLUMNS","DOWN TURN WALL","LIFT BASE & PIT WALLS","PAD & STRIP FOOTINGS","PILE CAP","RAMP","RETAINING WALL FOOTINGS","SOG","STAIR RAFT","STAIRFORM STAIRS / SUSPENDED","SUSPENDED FLOOR"]},
{name:"Trinity Grammar School",levels:["GRD","GRD-L1","L1","PLANT PLATFORM"],areas:["COLUMNS","CONVENTIONAL STAIRS / SUSPENDED","FOOTINGS","LIFT BASE & PIT WALLS","RAFT SLAB","RETAINING WALLS","SUSPENDED FLOOR","TIERED SEATING","UPSTAND"]}];
const ST_CLS={'Not Ordered':'pill-notordered','Ordered':'pill-ordered','Scheduled':'pill-scheduled','Delivered':'pill-delivered','Cancelled':'pill-cancelled'};
const EMAIL_FOOTER_TEXT='\n\nIf these changes are not acceptable, please contact a DBCC representative immediately to resolve the matter.';
let sb=null;
function initSupabase(){
  if(sb)return sb;
  if(typeof supabase==='undefined')throw new Error('Supabase client library not loaded. Check your internet connection and refresh.');
  if(!SUPA_URL||!/^https?:\/\//.test(SUPA_URL))throw new Error('Invalid Supabase URL configuration: "'+SUPA_URL+'"');
  if(!SUPA_KEY)throw new Error('Missing Supabase key configuration.');
  sb=supabase.createClient(SUPA_URL,SUPA_KEY);
  return sb}
let projects=[],entries=[],emailContacts=[],pendingFile=null,pendingMarkups=[],editingId=null,adminUnlocked=false;
// b5.3 multi-upload: each item = {id, file, splitRef, supDate, schedule, weight, drawing, extracted, status}
let multiUploadItems=[],multiUploadSeq=0;
let sortCol="created_at",sortAsc=false,userName=localStorage.getItem('reo_user_name')||'';
let currentEntryType='scheduled',selectedOrderId=null,selectedIds=new Set(),dpSelected={},pdfjsLoaded=false;

/* ═══ HELPERS ═══ */
function today(){return new Date().toISOString().slice(0,10)}
function fmtDate(d){if(!d)return '';const p=d.split('-');return p.length===3?`${p[2]}/${p[1]}/${p[0]}`:d}
function esc(s){const d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML}
function fmtSize(b){return b<1024?b+' B':b<1048576?(b/1024).toFixed(1)+' KB':(b/1048576).toFixed(1)+' MB'}
function closeOv(id){document.getElementById(id).classList.remove('show')}
function $(id){return document.getElementById(id)}
function hasMismatch(e){return e.our_delivery_date&&e.supplier_delivery_date&&e.our_delivery_date!==e.supplier_delivery_date&&!e.mismatch_resolved}

/* ═══ CHUNKED COMMENTS (b5.1) ═══
   Each comment column (aus_reo_comment, dbcc_comment) stores a JSON array of chunks:
     [{text, authors:[name1,name2], created_at, edited_at?}, ...]
   When a user adds a chunk: authors=[currentUser].
   When a user edits an existing chunk:
     - If they're already in authors → no change.
     - If they're not → append their name to authors (deduplicated, order preserved).
     - If text becomes empty → remove the chunk entirely.
   Cleared comments (everyone removed) → column set to null. */
function parseChunks(raw){
  if(!raw)return[];
  try{const a=JSON.parse(raw);return Array.isArray(a)?a:[]}
  catch{return[]}}
function chunksToJson(chunks){return chunks.length?JSON.stringify(chunks):null}
// Plain-text rendering for tooltips, CSV, emails — joins chunks by newlines, includes authors.
function chunksToPlain(chunks){
  if(!chunks.length)return'';
  return chunks.map(c=>{const auth=Array.isArray(c.authors)?c.authors.join(' · '):'';return c.text+(auth?' ['+auth+']':'')}).join('\n');}
// HTML rendering for full display in popups / detail view. Each chunk on its own line with pill.
function chunksToHtml(chunks){
  if(!chunks.length)return'<span style="color:var(--muted);font-style:italic">No comments</span>';
  return chunks.map(c=>{
    const auth=Array.isArray(c.authors)?c.authors:[];
    const pill=auth.length?' <span class="cmt-pill">'+auth.map(esc).join(' · ')+'</span>':'';
    return '<div class="cmt-line">'+esc(c.text||'').replace(/\n/g,'<br>')+pill+'</div>'}).join('');}
// Dashboard cell — shorter preview (first chunk truncated), with the latest pill.
function chunksToCell(chunks){
  if(!chunks.length)return'<span style="color:#ccc">—</span>';
  // Show last chunk's text + pill for that chunk only — most recent is most relevant.
  const last=chunks[chunks.length-1];
  const auth=Array.isArray(last.authors)?last.authors:[];
  const pill=auth.length?' <span class="cmt-pill">'+esc(auth[auth.length-1])+'</span>':'';
  const text=String(last.text||'').slice(0,50)+(last.text&&last.text.length>50?'…':'');
  const more=chunks.length>1?' <span style="color:var(--muted);font-size:10px">(+'+(chunks.length-1)+')</span>':'';
  return esc(text)+pill+more;}
// Compute the new authors list for an edited chunk: existing authors + currentUser, deduplicated, order preserved.
function appendAuthor(existing,name){
  const arr=Array.isArray(existing)?existing.slice():[];
  if(!arr.includes(name))arr.push(name);
  return arr;}

// Days between a date string (yyyy-mm-dd) and today. Positive = past, negative = future.
function daysAgo(d){if(!d)return null;const ms=Date.now()-new Date(d).getTime();return Math.floor(ms/86400000)}

// Is the install overdue? Schedule attached, supplier_delivery_date passed by N days,
// and not yet marked installed and not yet "Delivered"/"Cancelled".
function isOverdueInstall(e){
  if(!e.file_url||e.installed_date||e.status==='Cancelled'||e.status==='Delivered')return false;
  const d=daysAgo(e.supplier_delivery_date);
  return d!=null&&d>=(appSettings.overdue_install_days||3)}

// Is the delivery late? supplier_delivery_date has passed but status isn't "Delivered".
function isLateDelivery(e){
  if(!e.supplier_delivery_date||e.status==='Delivered'||e.status==='Cancelled')return false;
  const d=daysAgo(e.supplier_delivery_date);
  return d!=null&&d>0}
function getStatusPill(s,t,hold){let h='';if(t==='loose')h='<span class="pill pill-loose">Ad Hoc</span> ';h+='<span class="pill '+(ST_CLS[s]||'pill-notordered')+'">'+esc(s)+'</span>';if(hold)h+='<span class="pill pill-onhold">⏸ ON HOLD</span>';return h}
function parseAusDate(s){const p=s.split('/');if(p.length!==3)return null;let[d,m,y]=p;if(y.length===2)y='20'+y;return`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}
async function auditLog(o){
  // Defensive: every audit row must have a name. If userName is somehow empty here, refuse to
  // write a blank-identifier row (would create an unattributed "?" event in Notifications) and
  // surface the prompt so the user fills it in. The caller's operation may have already
  // succeeded — that's a separate problem the UI gate above should be preventing.
  if(!userName||!userName.trim()){
    console.warn('[REO] auditLog blocked — no user name set. Operation:',o);
    try{$('nameOverlay').classList.add('show')}catch(_){}
    return new Error('No user name set');
  }
  const{error}=await sb.from('audit_log').insert({...o,user_identifier:userName});
  if(error)console.warn('[REO] auditLog insert failed:',error.message,o);
  return error;
}
function confirmDialog(title,msg,okLabel,okClass,onOk){
  $('confirmModal').innerHTML=`<h3>${esc(title)}<button class="modal-close" onclick="closeOv('confirmOv')">&times;</button></h3><p style="font-size:13px;color:var(--mid);margin-bottom:16px;line-height:1.5">${msg}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-sec btn-sm" onclick="closeOv('confirmOv')">Cancel</button><button class="btn ${okClass||''} btn-sm" id="confirmOkBtn" style="width:auto">${esc(okLabel||'OK')}</button></div>`;
  $('confirmOv').classList.add('show');
  $('confirmOkBtn').onclick=()=>{closeOv('confirmOv');onOk()}}

/* ═══ INIT ═══ */
async function waitForSupabase(maxMs=8000){const start=Date.now();while(typeof supabase==='undefined'){if(Date.now()-start>maxMs)throw new Error('Supabase client library failed to load. Check your internet connection.');await new Promise(r=>setTimeout(r,100))}}
function isSiteViewMode(){try{return new URLSearchParams(location.search).get('view')==='site'}catch(_){return false}}
function isForemanViewMode(){try{return new URLSearchParams(location.search).get('view')==='foreman'}catch(_){return false}}
// Fetch version.json from the server with cache busting. If a newer version is available,
// force-reload the page with a cache-bypass query string so the browser fetches fresh app.js
// and index.html. This solves the "users have stale cached app.js" problem after a deploy.
//
// Loop protection: we set a sessionStorage flag before reloading. If the flag is already
// set and we STILL see a version mismatch, give up — something is misconfigured (e.g. CDN
// cache hasn't propagated, or version.json hasn't been updated). Better to load the stale
// version than to trap the user in an infinite reload.
async function checkForNewVersion(){
  // If we just reloaded for a version mismatch, don't loop. Clear the flag once we get past
  // the check successfully or once we've already retried once.
  if(sessionStorage.getItem('reo_version_reload_attempted')==='1'){
    sessionStorage.removeItem('reo_version_reload_attempted');
    return;
  }
  try{
    // Race a fetch against a 3-second timeout — we don't want to block the app on a slow network.
    const ctrl=new AbortController();
    const timeoutId=setTimeout(()=>ctrl.abort(),3000);
    const res=await fetch('version.json?_='+Date.now(),{cache:'no-store',signal:ctrl.signal});
    clearTimeout(timeoutId);
    if(!res.ok)return;
    const data=await res.json();
    if(!data||!data.version)return;
    if(data.version===APP_VERSION)return;
    // Version mismatch — set loop guard and reload with cache-bust query strings.
    console.log('[REO] Version mismatch. Have',APP_VERSION,'— server has',data.version,'— reloading.');
    sessionStorage.setItem('reo_version_reload_attempted','1');
    // Strip any existing ?v= or ?_= params and add a fresh cache-bust
    const url=new URL(location.href);
    url.searchParams.set('_v',data.version);
    url.searchParams.set('_t',Date.now());
    location.replace(url.toString());
    // Block here so the rest of init() doesn't run while we reload
    await new Promise(()=>{});
  }catch(e){
    // Network error, timeout, JSON parse error — fail silent. App still works on cached version.
    console.log('[REO] Version check skipped:',e.message);
  }
}

async function init(){
  // Show the version in the footer badge so anyone can verify what's running.
  const vb=$('versionBadge');if(vb)vb.textContent=APP_VERSION;
  // Check for new version FIRST, before doing anything else.
  // If a newer version is deployed, force-reload to bypass cache.
  // Has built-in loop protection: if we've already reloaded once this session and still
  // see a mismatch, give up and continue (something else is wrong, don't trap the user).
  await checkForNewVersion();
  try{await waitForSupabase();initSupabase()}catch(e){$('loadingScreen').innerHTML='<div style="text-align:center;padding:20px"><h2 style="color:var(--err)">Setup Error</h2><p style="color:var(--muted);font-size:13px">'+esc(e.message)+'</p><button class="btn btn-sm" onclick="location.reload()" style="width:auto;margin-top:12px">Retry</button></div>';return}
  // Site View (steel fixers — read-only, no login)
  if(isSiteViewMode()){
    try{
      await loadProjects();await loadEntries();
      populateSiteDropdowns();subscribeSiteRealtime();
      $('loadingScreen').style.display='none';
      $('nameOverlay').classList.remove('show');
      $('siteApp').style.display='block';
      renderSite();
    }catch(e){$('loadingScreen').innerHTML='<div style="text-align:center;padding:20px"><h2 style="color:var(--err)">Connection Error</h2><p style="color:var(--muted);font-size:13px">'+esc(e.message)+'</p><button class="btn btn-sm" onclick="location.reload()" style="width:auto;margin-top:12px">Retry</button></div>'}
    return}
  // Foreman View (site foreman — mark delivered + install dates, name required for audit)
  if(isForemanViewMode()){
    try{
      await loadProjects();await loadEntries();
      populateForemanDropdowns();subscribeForemanRealtime();
      $('loadingScreen').style.display='none';
      $('nameOverlay').classList.remove('show');
      foremanName=localStorage.getItem('reo_foreman_name')||'';
      if(!foremanName){
        // Show the overlay; do NOT render the app yet. saveForemanName() will re-enter init().
        $('fmNameOverlay').classList.add('show');
        setTimeout(()=>{const ni=$('fmNameInput');if(ni)ni.focus()},80);
        return;
      }
      $('fmUserChip').textContent=foremanName;
      $('foremanApp').style.display='block';
      renderForeman();
    }catch(e){$('loadingScreen').innerHTML='<div style="text-align:center;padding:20px"><h2 style="color:var(--err)">Connection Error</h2><p style="color:var(--muted);font-size:13px">'+esc(e.message)+'</p><button class="btn btn-sm" onclick="location.reload()" style="width:auto;margin-top:12px">Retry</button></div>'}
    return}
  $('userChip').textContent=userName;
  // Name gate — the dashboard is the only view that lets a user write changes (create entries,
  // upload schedules, send emails, cancel, etc.) so every audit row must have a name attached.
  // If localStorage doesn't have a name (cleared / new browser / incognito), show the prompt
  // and STOP here — do not load the dashboard until saveName() is called and re-enters init().
  if(!userName){
    $('loadingScreen').style.display='none';
    $('nameOverlay').classList.add('show');
    setTimeout(()=>{const ni=$('nameInput');if(ni)ni.focus()},80);
    return;
  }
  $('nameOverlay').classList.remove('show');
  try{
    await loadProjects();if(projects.length===0)await seedProjects();
    await loadEntries();await loadEmailContacts();
    await loadPeople();await loadAssignments();await loadAppSettings();
    populateDropdowns();subscribeRealtime();
    $('inpDate').value=today();$('inpLooseDate').value=today();
    $('loadingScreen').style.display='none';$('mainApp').style.display='block';
    setupDragDrop();renderDash();renderAdminProj();renderAdminProgram();renderAdminFixers();
  }catch(e){$('loadingScreen').innerHTML='<div style="text-align:center;padding:20px"><h2 style="color:var(--err)">Connection Error</h2><p style="color:var(--muted);font-size:13px">'+esc(e.message)+'</p><button class="btn btn-sm" onclick="location.reload()" style="width:auto;margin-top:12px">Retry</button></div>'}}

function saveName(){const n=$('nameInput').value.trim();if(!n)return alert('Please enter your name');localStorage.setItem('reo_user_name',n);userName=n;$('nameOverlay').classList.remove('show');$('loadingScreen').style.display='flex';$('loadingScreen').innerHTML='<div class="spinner"></div><p style="color:var(--muted);font-size:13px">Loading your data...</p>';init()}

/* ═══ DATA ═══ */
async function loadProjects(){const{data,error}=await sb.from('projects').select('*').order('name');if(error)throw error;projects=data.map(p=>({id:p.id,name:p.name,levels:p.levels?p.levels.split('||').filter(Boolean):[],areas:p.areas?p.areas.split('||').filter(Boolean):[]}))}
async function seedProjects(){const rows=SEEDS.map(p=>({name:p.name,levels:p.levels.join('||'),areas:p.areas.join('||')}));await sb.from('projects').insert(rows);await loadProjects()}
async function loadEntries(){const{data,error}=await sb.from('entries').select('*').order('created_at',{ascending:false});if(error)throw error;entries=data;$('countNum').textContent=entries.length}

async function loadEmailContacts(){
  const{data,error}=await sb.from('email_contacts').select('*').order('sort_order',{ascending:true}).order('id',{ascending:true});
  if(error){emailContacts=[];return}emailContacts=data||[]}

// ═══ PEOPLE / ASSIGNMENTS / SETTINGS ═══
// Loaded lazily — first time the admin tab is opened. Falls back to empty/defaults on error
// so the rest of the app keeps working even before the b5.0 SQL migration has been run.
let people=[],assignments=[],appSettings={overdue_install_days:3};
async function loadPeople(){
  try{const{data,error}=await sb.from('people').select('*').order('role',{ascending:true}).order('name');
    if(error)throw error;people=data||[]}catch(e){console.warn('[REO] loadPeople failed (run migration_b5.0.sql?):',e.message);people=[]}}
async function loadAssignments(){
  try{const{data,error}=await sb.from('project_assignments').select('*');
    if(error)throw error;assignments=data||[]}catch(e){console.warn('[REO] loadAssignments failed:',e.message);assignments=[]}}
async function loadAppSettings(){
  try{const{data,error}=await sb.from('app_settings').select('*');
    if(error)throw error;
    const map={};(data||[]).forEach(r=>{map[r.key]=r.value});
    appSettings={overdue_install_days:parseInt(map.overdue_install_days||'3',10)||3}
  }catch(e){console.warn('[REO] loadAppSettings failed:',e.message);appSettings={overdue_install_days:3}}}
async function saveAppSetting(key,value){
  await sb.from('app_settings').upsert({key,value:String(value),updated_at:new Date().toISOString()},{onConflict:'key'});
  await loadAppSettings()}
// Helper: people assigned to a project (DBCC only — Aus Reo are tracked but not assigned)
function peopleForProject(name){
  const ids=assignments.filter(a=>a.project_name===name).map(a=>a.person_id);
  return people.filter(p=>p.role==='DBCC'&&ids.includes(p.id))}
function projectsForPerson(personId){
  return assignments.filter(a=>a.person_id===personId).map(a=>a.project_name)}
async function refreshAll(){
  await Promise.all([loadProjects(),loadEntries()]);
  if(isForemanViewMode()){populateForemanDropdowns();renderForeman();return}
  if(isSiteViewMode()){populateSiteDropdowns();renderSite();return}
  populateDropdowns();renderDash()}
function subscribeRealtime(){
  sb.channel('e').on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadEntries().then(()=>{renderDash();renderActionRequired()})).subscribe();
  sb.channel('p').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>loadProjects().then(()=>{populateDropdowns();if(adminUnlocked)renderProjList()})).subscribe();
  // Audit log realtime — when a new audit row appears, refresh the Notifications list
  // (only if the user is currently on that page, otherwise it'll refresh next time they switch).
  sb.channel('al').on('postgres_changes',{event:'INSERT',schema:'public',table:'audit_log'},()=>{
    const onNotif=$('pageNotif')&&$('pageNotif').classList.contains('active');
    if(onNotif)loadNotifications();
  }).subscribe();}

/* ═══ DROPDOWNS ═══ */
function populateDropdowns(){
  const names=projects.map(p=>p.name);
  ['selProj','fProj','dpProj','nfProj'].forEach(id=>{const sel=$(id);if(!sel)return;const f=sel.options[0]?.text||'';sel.innerHTML=`<option value="">${f}</option>`;names.forEach(n=>sel.appendChild(new Option(n,n)))});
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
  $('markupSection').style.display='none';
  const mu=$('multiUploadSection');if(mu)mu.style.display='none';multiUploadItems=[];
  $('commentsSection').style.display=t==='loose'?'block':'none';
  $('submitBtn').style.display=t==='loose'?'block':'none';
  if(t==='loose')$('uploadStepLabel').textContent='③ Upload (Optional)';
  onLevelAreaChange()}

function onProjChange(){
  const p=$('selProj').value,lS=$('selLevel'),aS=$('selArea');
  const proj=projects.find(pr=>pr.name===p);
  if(!proj){lS.innerHTML='<option value="">Select project first</option>';lS.disabled=true;aS.innerHTML='<option value="">Select project first</option>';aS.disabled=true;hideFormSteps();return}
  lS.innerHTML='<option value="">Select level...</option>';proj.levels.forEach(l=>lS.appendChild(new Option(l,l)));lS.disabled=false;
  aS.innerHTML='<option value="">Select area...</option>';proj.areas.forEach(a=>aS.appendChild(new Option(a,a)));aS.disabled=false;
  onLevelAreaChange()}

function hideFormSteps(){['orderListSection','uploadSection','scheduleSection','markupSection','commentsSection'].forEach(id=>$(id).style.display='none');$('submitBtn').style.display='none';selectedOrderId=null}

function onLevelAreaChange(){
  if(currentEntryType==='loose')return;
  const proj=$('selProj').value,level=$('selLevel').value,area=$('selArea').value;
  if(!proj){hideFormSteps();return}
  const matching=entries.filter(e=>e.project===proj&&e.entry_type==='scheduled'&&(!level||e.level===level)&&(!area||e.area===area));
  const sec=$('orderListSection'),content=$('orderListContent');
  if(matching.length===0){
    sec.style.display='block';
    let h=`<div class="warn-msg" style="margin-top:0">No orders found.${level&&area?' You can still submit — it will be flagged as <b>Unmatched</b>.':' Select level and area to narrow down.'}</div>`;
    if(level&&area){
      // Offer both single and multi-upload even when no placeholder exists yet.
      h+=`<div style="margin-top:14px;padding:12px 14px;background:#FFF8E7;border:1px solid #F0D785;border-radius:8px"><div style="font-size:12px;color:var(--gray-dk);margin-bottom:10px">Uploading one schedule, or splitting this delivery into several?</div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec btn-sm" onclick="startUnmatchedEntry()" style="width:auto">Single upload</button><button class="btn btn-sm" onclick="startMultiUpload()" style="width:auto;background:var(--accent);color:#fff">⊕ Multi-upload (split delivery)</button></div></div>`;
    }
    content.innerHTML=h;
    return}
  sec.style.display='block';
  let html='<p style="font-size:12px;color:var(--muted);margin-bottom:10px">Orders for <b>'+esc(proj)+'</b>'+(level?' / '+esc(level):'')+(area?' / '+esc(area):'')+':</p>';
  matching.forEach(e=>{
    const has=!!e.schedule,can=!has&&e.status!=='Cancelled'&&e.status!=='Delivered';
    html+=`<div class="order-item${selectedOrderId===e.id?' selected':''}${can?'':' disabled'}" ${can?`onclick="selectOrder(${e.id})"`:''}><div class="order-item-info"><div class="oi-title">${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' <span style="color:var(--accent-dk)">('+esc(e.split_reference)+')</span>':''}</div><div class="oi-meta">Ordered Delivery: ${fmtDate(e.our_delivery_date)||'Not set'} · ${e.status}${has?' · '+esc(e.schedule):''}</div></div><div>${has?'<span class="pill pill-scheduled">Has Schedule</span>':can?'<span class="pill pill-ordered">Attach →</span>':'<span class="pill pill-cancelled">'+esc(e.status)+'</span>'}</div></div>`});
  // Always offer an escape hatch: even when matching orders exist (e.g. all "Has Schedule"),
  // the user might need to create another entry — common case is when a single placeholder was
  // created but the actual delivery is being split into multiple parts and Aus Reo is uploading
  // separate schedules for each. This unmatched entry will be flagged with the orange ⚠ icon.
  if(level&&area){
    const allDone=matching.every(e=>!!e.schedule||e.status==='Cancelled'||e.status==='Delivered');
    const hint=allDone
      ? 'All matching orders already have a schedule. If this is a separate / split delivery, create a new unmatched entry below.'
      : 'None of these match? Create a new unmatched entry instead.';
    // Collect existing split refs in this Level/Area combo so the user can inherit one,
    // e.g. picking "Bottom reo" so the new entry is grouped with the right pour.
    const existingSplits=[...new Set(matching.map(e=>e.split_reference).filter(Boolean))];
    let splitPicker='';
    if(existingSplits.length){
      splitPicker=`<div style="margin-bottom:10px"><label style="display:block;font-size:11px;color:var(--gray-dk);font-weight:600;margin-bottom:4px">Split Reference (optional)</label>
        <select id="unmatchedSplitSel" onchange="onUnmatchedSplitChange()" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px;background:#fff">
          <option value="">— None —</option>
          ${existingSplits.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('')}
          <option value="__custom__">Custom…</option>
        </select>
        <input type="text" id="unmatchedSplitCustom" placeholder="Type custom split reference (e.g. Bottom reo - Part 2)" style="display:none;margin-top:6px;width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      </div>`;
    }else{
      splitPicker=`<div style="margin-bottom:10px"><label style="display:block;font-size:11px;color:var(--gray-dk);font-weight:600;margin-bottom:4px">Split Reference (optional)</label>
        <input type="text" id="unmatchedSplitCustom" placeholder="e.g. Top Reo, Bottom reo, Part 1 — leave blank if not split" style="width:100%;padding:7px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      </div>`;
    }
    html+=`<div style="margin-top:14px;padding:12px 14px;background:#FFF8E7;border:1px solid #F0D785;border-radius:8px"><div style="font-size:12px;color:var(--gray-dk);margin-bottom:10px">⚠ ${hint}</div>${splitPicker}<div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-sec btn-sm" onclick="startUnmatchedEntry()" style="width:auto">Create new unmatched entry</button><button class="btn btn-sm" onclick="startMultiUpload()" style="width:auto;background:var(--accent);color:#fff">⊕ Multi-upload (split delivery)</button></div></div>`;
  }
  content.innerHTML=html}

// Toggle the custom-split text input visibility based on dropdown choice.
function onUnmatchedSplitChange(){
  const sel=$('unmatchedSplitSel'),inp=$('unmatchedSplitCustom');
  if(!sel||!inp)return;
  if(sel.value==='__custom__'){inp.style.display='block';inp.focus()}
  else{inp.style.display='none';inp.value=''}
}

// Read the chosen split reference (from the dropdown or the custom text input).
// Returns null if none.
function getUnmatchedSplitRef(){
  const sel=$('unmatchedSplitSel'),inp=$('unmatchedSplitCustom');
  if(sel&&sel.value&&sel.value!=='__custom__'&&sel.value!=='')return sel.value;
  if(inp&&inp.value.trim())return inp.value.trim();
  return null;
}

// Begin upload flow as an unmatched entry (no placeholder selected). Used when:
//  (a) no matching orders exist for the project/level/area combo, or
//  (b) matching orders exist but they all have schedules / are unsuitable, and the user
//      wants to add an additional entry — e.g. a split delivery they didn't pre-plan.
function startUnmatchedEntry(){
  selectedOrderId=null;
  // Capture the chosen split reference NOW so it persists through the upload flow.
  // (The dropdown lives in the order list area which doesn't get re-rendered, so this
  // is mostly belt-and-braces — but storing it in window state makes it clearly available
  // when the form is submitted.)
  window._unmatchedSplitRef=getUnmatchedSplitRef();
  $('uploadSection').style.display='block';$('uploadStepLabel').textContent='② Upload Schedule';
  $('detailsStepLabel').textContent='③ Schedule Details';
  $('commentsSection').style.display='block';$('submitBtn').style.display='block';
  if(pendingFile){$('scheduleSection').style.display='block';$('markupSection').style.display='block'}
  // Scroll the upload section into view so it's obvious the form has progressed
  setTimeout(()=>{const u=$('uploadSection');if(u)u.scrollIntoView({behavior:'smooth',block:'center'})},80);
}

/* ═══ MULTI-UPLOAD (b5.3) — split deliveries ═══
   Pick Project/Level/Area once, add multiple schedule PDFs. Each PDF:
     - gets its own extraction
     - gets its own split reference + supplier delivery date
     - becomes its own dashboard row
   The FIRST split fills the oldest empty placeholder for this Level/Area (if one exists);
   remaining splits create new unmatched rows. */
function startMultiUpload(){
  const proj=$('selProj').value,level=$('selLevel').value,area=$('selArea').value;
  if(!proj||!level||!area){alert('Select project, level and area first');return}
  // Hide the single-entry sections, show the multi-upload panel.
  ['orderListSection','uploadSection','scheduleSection','markupSection','commentsSection','submitBtn'].forEach(id=>{const el=$(id);if(el)el.style.display='none'});
  multiUploadItems=[];multiUploadSeq=0;
  $('multiUploadSection').style.display='block';
  // Count empty placeholders for context.
  const emptyPlaceholders=entries.filter(e=>e.project===proj&&e.level===level&&e.area===area&&!e.schedule&&e.status!=='Cancelled'&&e.status!=='Delivered');
  $('multiUploadHeader').innerHTML=`Splitting delivery for <b>${esc(proj)}</b> / ${esc(level)} / ${esc(area)}.`
    +(emptyPlaceholders.length?` The first PDF will fill the existing empty placeholder${emptyPlaceholders.length>1?' (oldest)':''}; the rest create new rows.`:` Each PDF creates a new row (flagged Unmatched).`);
  renderMultiUploadList();
  setTimeout(()=>{const u=$('multiUploadSection');if(u)u.scrollIntoView({behavior:'smooth',block:'start'})},80);
}

function cancelMultiUpload(){
  multiUploadItems=[];
  $('multiUploadSection').style.display='none';
  $('multiUploadErr').innerHTML='';
  onLevelAreaChange();// restore the order list view
}

async function addMultiFiles(fileList){
  const files=[...fileList].filter(f=>f.name.toLowerCase().endsWith('.pdf'));
  $('multiFileInp').value='';
  if(!files.length){alert('Please add PDF files only');return}
  for(const file of files){
    const item={id:++multiUploadSeq,file,splitRef:'',supDate:'',schedule:'',weight:'',drawing:'',extracted:null,status:'extracting'};
    multiUploadItems.push(item);
    renderMultiUploadList();
    // Run extraction for this file (async, updates the row when done).
    extractMultiItem(item);
  }
}

async function extractMultiItem(item){
  try{
    const ext=await doPdfExtract(item.file);
    if(ext._needsOcr){
      item.status='rejected';
      renderMultiUploadList();
      return;
    }
    item.extracted=ext;
    item.status='ready';
    // Pre-fill fields from extraction.
    if(ext.ctrlCode)item.schedule=ext.ctrlCode;
    if(ext.weight)item.weight=ext.weight;
    if(ext.drawing)item.drawing=ext.drawing;
    if(ext.shipDate){const iso=parseAusDate(ext.shipDate);if(iso)item.supDate=iso}
    renderMultiUploadList();
  }catch(e){
    item.status='error';item.errorMsg=e.message||'extraction failed';
    renderMultiUploadList();
  }
}

function updateMultiItem(id,field,value){
  const item=multiUploadItems.find(x=>x.id===id);if(!item)return;
  item[field]=value;
  // Don't re-render on every keystroke — just update the submit button state.
  refreshMultiSubmitState();
}

function removeMultiItem(id){
  multiUploadItems=multiUploadItems.filter(x=>x.id!==id);
  renderMultiUploadList();
}

function refreshMultiSubmitState(){
  const btn=$('multiSubmitBtn');if(!btn)return;
  const ready=multiUploadItems.filter(i=>i.status==='ready');
  // Submit enabled only if at least one ready item and none still extracting.
  const anyExtracting=multiUploadItems.some(i=>i.status==='extracting');
  btn.disabled=ready.length===0||anyExtracting;
  btn.textContent=ready.length>1?`Submit All (${ready.length})`:'Submit';
}

function renderMultiUploadList(){
  const w=$('multiUploadList');if(!w)return;
  if(!multiUploadItems.length){w.innerHTML='<div style="font-size:12px;color:var(--muted);font-style:italic;padding:8px 0">No files added yet. Use the box below to add schedule PDFs.</div>';refreshMultiSubmitState();return}
  w.innerHTML=multiUploadItems.map((item,idx)=>{
    let statusBadge='';
    if(item.status==='extracting')statusBadge='<span style="color:var(--accent-dk);font-size:11px">⏳ Reading PDF…</span>';
    else if(item.status==='ready')statusBadge='<span style="color:var(--success);font-size:11px">✓ Ready</span>';
    else if(item.status==='rejected')statusBadge='<span style="color:var(--err);font-size:11px">⚠ Image PDF — not usable</span>';
    else if(item.status==='error')statusBadge='<span style="color:var(--err);font-size:11px">Extraction failed</span>';
    const disabled=item.status==='rejected'?'opacity:.55':'';
    const fields=item.status==='rejected'
      ? `<div style="font-size:11px;color:var(--err);margin-top:6px">This PDF is an image (Print-to-PDF). Re-export using Save As PDF / Export as PDF and add it again.</div>`
      : `<div class="row2" style="margin-top:8px">
          <div class="fg" style="margin:0"><label style="font-size:11px">Schedule Number</label><input type="text" value="${esc(item.schedule)}" oninput="updateMultiItem(${item.id},'schedule',this.value)" style="font-family:'JetBrains Mono',monospace;font-size:12px;padding:6px 8px"></div>
          <div class="fg" style="margin:0"><label style="font-size:11px">Split Reference</label><input type="text" value="${esc(item.splitRef)}" oninput="updateMultiItem(${item.id},'splitRef',this.value)" placeholder="e.g. Part ${idx+1}" style="font-size:12px;padding:6px 8px"></div>
        </div>
        <div class="row2" style="margin-top:6px">
          <div class="fg" style="margin:0"><label style="font-size:11px">Supplier Delivery Date</label><input type="date" value="${esc(item.supDate)}" oninput="updateMultiItem(${item.id},'supDate',this.value)" style="font-size:12px;padding:6px 8px"></div>
          <div class="fg" style="margin:0"><label style="font-size:11px">Weight (T)</label><input type="number" step="0.001" value="${esc(item.weight)}" oninput="updateMultiItem(${item.id},'weight',this.value)" style="font-family:'JetBrains Mono',monospace;font-size:12px;padding:6px 8px"></div>
        </div>`;
    return `<div class="sel-item" style="${disabled}">
      <div class="sel-item-header">
        <div class="sel-item-title" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">📄 ${esc(item.file.name)}</div>
        <div style="display:flex;align-items:center;gap:10px">${statusBadge}<button onclick="removeMultiItem(${item.id})" style="background:none;border:none;color:var(--err);cursor:pointer;font-size:16px;line-height:1">×</button></div>
      </div>
      ${fields}
    </div>`;
  }).join('');
  refreshMultiSubmitState();
}

async function submitMultiUpload(){
  const err=$('multiUploadErr');err.innerHTML='';
  const proj=$('selProj').value,level=$('selLevel').value,area=$('selArea').value;
  const ed=today();// submission date = today for all
  const ready=multiUploadItems.filter(i=>i.status==='ready');
  if(!ready.length){err.innerHTML='<div class="error-msg">No ready files to submit.</div>';return}
  // Validate each ready item has a schedule number.
  for(const item of ready){
    if(!item.schedule.trim()){err.innerHTML='<div class="error-msg">Every schedule needs a Schedule Number. Check '+esc(item.file.name)+'.</div>';return}
  }
  const btn=$('multiSubmitBtn');btn.disabled=true;btn.textContent='Uploading…';
  try{
    // Find empty placeholders for this Level/Area — oldest first (by created_at ascending).
    let emptyPlaceholders=entries.filter(e=>e.project===proj&&e.level===level&&e.area===area&&!e.schedule&&e.status!=='Cancelled'&&e.status!=='Delivered')
      .sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0));
    let placeholderIdx=0;
    let created=0;
    for(const item of ready){
      const furl=await uploadFile(item.file,proj,level,area);
      const fname=item.file.name;
      const ex=item.extracted||{};
      const breakdown=extractionBreakdown(ex);
      const wt=item.weight?parseFloat(item.weight):null;
      const supD=item.supDate||null;
      const splitRef=item.splitRef.trim()||null;
      if(placeholderIdx<emptyPlaceholders.length){
        // Fill the existing empty placeholder.
        const ph=emptyPlaceholders[placeholderIdx];placeholderIdx++;
        const up={schedule:item.schedule.trim(),entry_date:ed,supplier_delivery_date:supD,file_url:furl,file_name:fname,status:'Scheduled',total_weight:wt,drawing_reference:item.drawing.trim()||null,split_reference:splitRef||ph.split_reference,...breakdown};
        if(ph.our_delivery_date&&supD&&ph.our_delivery_date!==supD)up.mismatch_resolved=false;
        const{error}=await sb.from('entries').update(up).eq('id',ph.id);if(error)throw error;
        await auditLog({entry_id:ph.id,action:'UPDATE',field_changed:'schedule_attached',new_value:`${item.schedule.trim()} (${fname}) [split upload]`});
      }else{
        // Create a new unmatched row.
        const{data,error}=await sb.from('entries').insert({project:proj,level,area,schedule:item.schedule.trim(),status:'Scheduled',entry_date:ed,file_url:furl,file_name:fname,entry_type:'scheduled',total_weight:wt,drawing_reference:item.drawing.trim()||null,supplier_delivery_date:supD,split_reference:splitRef,unmatched:true,...breakdown}).select().single();
        if(error)throw error;
        await auditLog({entry_id:data.id,action:'CREATE',new_value:`UNMATCHED: ${proj}/${level}${splitRef?' ('+splitRef+')':''}/${item.schedule.trim()} [split upload]`});
      }
      created++;
    }
    multiUploadItems=[];
    $('multiUploadSection').style.display='none';
    $('successOv').classList.add('show');
  }catch(e){
    err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>';
  }
  btn.disabled=false;refreshMultiSubmitState();
}

function selectOrder(id){
  selectedOrderId=id;onLevelAreaChange();
  $('uploadSection').style.display='block';$('uploadStepLabel').textContent='③ Upload Schedule';
  $('detailsStepLabel').textContent='④ Schedule Details';
  $('commentsSection').style.display='block';$('submitBtn').style.display='block';
  if(pendingFile){$('scheduleSection').style.display='block';$('markupSection').style.display='block'}}

/* ═══ DRAG & DROP ═══ */
function setupDragDrop(){
  const z=$('formDropZone');if(z){
    ['dragenter','dragover'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.add('dragover')}));
    ['dragleave','drop'].forEach(ev=>z.addEventListener(ev,e=>{e.preventDefault();z.classList.remove('dragover')}));
    z.addEventListener('drop',e=>{if(e.dataTransfer.files.length)setFile(e.dataTransfer.files)})}
  const mz=$('markupDropZone');if(mz){
    ['dragenter','dragover'].forEach(ev=>mz.addEventListener(ev,e=>{e.preventDefault();mz.classList.add('dragover')}));
    ['dragleave','drop'].forEach(ev=>mz.addEventListener(ev,e=>{e.preventDefault();mz.classList.remove('dragover')}));
    mz.addEventListener('drop',e=>{if(e.dataTransfer.files.length)addMarkups(e.dataTransfer.files)})}
  const muz=$('multiDropZone');if(muz){
    ['dragenter','dragover'].forEach(ev=>muz.addEventListener(ev,e=>{e.preventDefault();muz.classList.add('dragover')}));
    ['dragleave','drop'].forEach(ev=>muz.addEventListener(ev,e=>{e.preventDefault();muz.classList.remove('dragover')}));
    muz.addEventListener('drop',e=>{if(e.dataTransfer.files.length)addMultiFiles(e.dataTransfer.files)})}}

function setFile(fl){
  if(!fl.length)return;pendingFile=fl[0];renderFile();$('fileInp').value='';
  $('scheduleSection').style.display='block';
  $('markupSection').style.display='block';
  if(pendingFile.name.toLowerCase().endsWith('.pdf'))extractPdfData(pendingFile)}

function renderFile(){
  if(!pendingFile){$('flist').innerHTML='';return}
  $('flist').innerHTML='<div class="fitem"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📄 '+esc(pendingFile.name)+' <span style="color:var(--muted);font-size:11px">('+fmtSize(pendingFile.size)+')</span></span><button onclick="clearPendingFile()">×</button></div>'}
function clearPendingFile(){pendingFile=null;renderFile();$('extractInfo').innerHTML='';$('scheduleSection').style.display='none';$('markupSection').style.display='none'}

function addMarkups(fl){for(const f of fl)pendingMarkups.push(f);$('markupInp').value='';renderMarkupList()}
function removePendingMarkup(i){pendingMarkups.splice(i,1);renderMarkupList()}
function renderMarkupList(){
  $('mkList').innerHTML=pendingMarkups.map((f,i)=>`<div class="fitem mitem"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📐 ${esc(f.name)} <span style="color:var(--muted);font-size:11px">(${fmtSize(f.size)})</span></span><button onclick="removePendingMarkup(${i})">×</button></div>`).join('')}

/* ═══ PDF EXTRACTION ═══ */
async function loadPdfJs(){if(pdfjsLoaded)return;return new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';s.onload=()=>{pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';pdfjsLoaded=true;res()};s.onerror=rej;document.head.appendChild(s)})}

// Lazy-load Tesseract.js OCR engine. Only fired when a PDF has no text layer.
let tesseractLoaded=false;
async function loadTesseract(){if(tesseractLoaded)return;return new Promise((res,rej)=>{const s=document.createElement('script');s.src='https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.0.5/tesseract.min.js';s.onload=()=>{tesseractLoaded=true;res()};s.onerror=rej;document.head.appendChild(s)})}

/* Number parsing helpers for Aus Reo PDFs (European decimals, thousands separators).
   parseReoNum: treats LAST separator (. or ,) as the decimal. Matches all observed values.
   parseReoInt: integer with any thousands separators stripped.
   parseReoDim: single-separator decimal (dimensions like 5.8, 0,3). */
function parseReoNum(s){if(s==null)return NaN;const str=String(s).trim();if(!str)return NaN;
  const ld=str.lastIndexOf('.'),lc=str.lastIndexOf(',');let di=-1;
  if(ld>=0&&lc>=0)di=Math.max(ld,lc);else if(lc>=0)di=lc;else if(ld>=0)di=ld;
  if(di<0)return parseFloat(str);
  const ip=str.slice(0,di).replace(/[.,\s]/g,''),dp=str.slice(di+1).replace(/[.,\s]/g,'');
  const v=parseFloat(ip+'.'+dp);return isNaN(v)?NaN:v}
function parseReoInt(s){if(s==null)return NaN;const v=parseInt(String(s).trim().replace(/[.,\s]/g,''),10);return isNaN(v)?NaN:v}
function parseReoDim(s){if(s==null)return NaN;const v=parseFloat(String(s).trim().replace(',','.'));return isNaN(v)?NaN:v}

// Run all the Aus Reo regex patterns on a text blob. Same logic regardless of source (native text or OCR).
// `allText` is the combined text from all pages; `pageOneText` is just page 1 (used for header fields where order matters).
function parseReoText(pageOneText, allText){
  const e={};let m;
  const t=pageOneText||'';
  const a=allText||pageOneText||'';
  // ── HEADER FIELDS — strict label-adjacent first, OCR-tolerant fallbacks after ──
  // Words that show up in Aus Reo letterheads but are NOT Ctrl Codes — guard against
  // OCR placing address text right after the "Ctrl Code:" colon.
  const FALSE_POS=new Set(['AUS','REO','PTY','LTD','ABN','NSW','VIC','QLD','TAS','ACT','PDF','GFB','REV','REF','PROJ','UNIT','PHONE','FAX','BOX','GST','TOTAL','EACH','MESH','BAR']);
  const looksLikeReoCodeFallback=v=>{
    if(v.length!==4)return false;
    if(!/[A-Z]/.test(v)||!/\d/.test(v))return false;
    if(FALSE_POS.has(v))return false;
    if(/^(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\d+$/.test(v))return false;
    if(/^ABN\d+$/.test(v))return false;
    // Reject Aus Reo product codes — they share the 4-char letter+digit pattern with Ctrl Codes.
    // RL57, RL58 (mesh / RL elevations), SL72/82/92/102 (square mesh), L8TM, 8TM3 (trench mesh).
    // None of the 13 known Aus Reo Ctrl Codes follow these patterns, so this is safe.
    if(/^RL\d/.test(v))return false;        // RL57, RL58, RL72, RL92, RL102 etc
    if(/^SL\d/.test(v))return false;        // SL52, SL62, SL72, SL82, SL92, SL102
    if(/TM\d/.test(v))return false;         // L8TM, 8TM3, L11TM, etc
    return true};
  // Anchor signals for an Aus Reo schedule. Used to gate the most aggressive (label-less) fallbacks.
  // Browser Tesseract garbles small labels more aggressively than CLI Tesseract, so we anchor on
  // multiple distinctive strings — generic Aus Reo / template strings, not data that varies per job
  // and not generic terms (e.g. "Sunshine North" — a real Melbourne suburb; "Total Weight: X Tonne"
  // — a generic format any rebar supplier could use). Any one of these suffices.
  const looksLikeAusReo=s=>/AUS\s*REO|ausreo|Reinforcement\s*Schedule|Reo\s*Schedule|Ctrl\s*Code|Ship\s*Date|Build\s*with\s*confidence|Bunnett\s*Street|Bar\s*Mark|BAR\s*SUMMARY|MISCELLANEOUS\s*PRODUCT\s*SUMMARY|Multiplier:/i.test(s);

  // Ctrl Code — strict label-adjacent (allows all-letter codes like UQYH/UXEH).
  m=t.match(/Ctrl\s*Code:\s*([A-Za-z0-9]+)/i);
  if(m&&/[A-Za-z]/.test(m[1])&&m[1].length>=3&&m[1].length<=5){
    const v=m[1].trim().toUpperCase();
    if(!FALSE_POS.has(v))e.ctrlCode=v;
  }
  // If strict regex hit a false-positive (OCR put address after colon), look further in same window.
  if(!e.ctrlCode){
    const idx=t.search(/Ctrl\s*Code:/i);
    if(idx>=0){
      const labelM=t.slice(idx).match(/Ctrl\s*Code:/i);
      const startAfter=idx+(labelM?labelM[0].length:10);
      const searchWindow=t.slice(startAfter,startAfter+300);
      const tokenRe=/\b([A-Za-z0-9]{3,5})\b/g;
      let cm;
      while((cm=tokenRe.exec(searchWindow))!==null){
        const v=cm[1].toUpperCase();
        if(!/[A-Za-z]/.test(cm[1]))continue;
        if(FALSE_POS.has(v))continue;
        if(/^(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\d+$/.test(v))continue;
        if(/^ABN\d+$/.test(v))continue;
        // Reject Aus Reo product codes (rectangular mesh, square mesh, trench mesh) so we
        // don't pick up "RL57" from a "Description: CC6. START RL57.700" elevation reference.
        if(/^RL\d/.test(v))continue;
        if(/^SL\d/.test(v))continue;
        if(/TM\d/.test(v))continue;
        if(v.length===4&&/\d/.test(v)&&/[A-Z]/.test(v)){e.ctrlCode=v;break}
        if(!e.ctrlCode)e.ctrlCode=v;
      }
    }
  }
  // Ship Date — strict
  m=t.match(/Ship\s*Date:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);if(m)e.shipDate=m[1].trim();
  m=t.match(/Drawing:\s*([A-Za-z0-9\-\s]+?)(?=\s{2,}|Bar|Desc|$)/i);if(m)e.drawing=m[1].trim();
  // Weight — primary source is the header "Wt: X T". The value sometimes sits on the line
  // AFTER the "Wt:" label (e.g. "Wt:\n...Jason Mahony 8,977 T"), so we also look at the
  // header block for a "<num> T" near a Sales Rep / Wt context.
  m=t.match(/Wt:\s*([\d.,]+)\s*T\b/i);
  if(m){const v=parseReoNum(m[1]);if(!isNaN(v))e.weight=v}
  if(e.weight==null){
    // "Total Weight: X Tonne" — but a schedule can contain misleading SUB-totals such as
    // "End varying set - Total Weight: 0,137 Tonne" in the body. The TRUE grand total is the
    // largest "Total Weight" value on the page, so collect them all and take the max.
    const totals=[];
    const twRe=/Total\s*Weight:\s*([\d.,]+)\s*Tonne/gi;let tw;
    while((tw=twRe.exec(a))!==null){const v=parseReoNum(tw[1]);if(!isNaN(v))totals.push(v)}
    if(totals.length)e.weight=Math.max(...totals);
  }
  if(e.weight==null){
    // Last resort: a standalone "<num> T" in the header block near the Sales Rep line.
    const hm=t.match(/Sales\s*Rep:[^\n]*?([\d.,]+)\s*T\b/i);
    if(hm){const v=parseReoNum(hm[1]);if(!isNaN(v))e.weight=v}
  }

  // ── OCR-FRIENDLY FALLBACKS ──
  // OCR can garble labels ("Ctri Code" instead of "Ctrl Code") or scatter values across the page.
  // These fallbacks use tolerant label-matching and Aus-Reo-shaped code detection.

  // Ctrl Code fallback 1 — tolerant label, then Aus-Reo-shaped 4-char code in nearby window
  if(!e.ctrlCode){
    // \b + \s+ (not \s*) between the two words — prevents matching "Concrete Construction"
    // (which contains C+...+C pattern). "Ctrl Code", "Ctri Code", "Cirl Code" still match.
    const labelRe=/\bC[a-z]{2,4}\s+C[a-z]{2,4}\s*[:;.]?/i;
    const lm=a.match(labelRe);
    if(lm){
      const idx=a.indexOf(lm[0]);
      const startAfter=idx+lm[0].length;
      const searchWindow=a.slice(startAfter,startAfter+300);
      const tokenRe=/\b([A-Z0-9]{4})\b/g;
      let cm;
      while((cm=tokenRe.exec(searchWindow))!==null){
        const v=cm[1].toUpperCase();
        if(looksLikeReoCodeFallback(v)){e.ctrlCode=v;break}
      }
    }
  }
  // Ctrl Code fallback 2 — no recognisable label. Only if doc smells like Aus Reo.
  if(!e.ctrlCode&&looksLikeAusReo(a)){
    const head=a.slice(0,1500);
    const tokenRe=/\b([A-Z0-9]{4})\b/g;
    let cm;
    while((cm=tokenRe.exec(head))!==null){
      const v=cm[1].toUpperCase();
      if(looksLikeReoCodeFallback(v)){e.ctrlCode=v;break}
    }
  }
  // Ship Date fallback — tolerant label
  if(!e.shipDate){
    // \b + \s+ between the two words — prevents matching "Schedule" (a single word that
    // happens to contain S+...+d). "Ship Date", "Shlp Date", "Shio Dote" still match.
    const labelRe=/\bS[a-z]{2,4}\s+D[a-z]{2,4}\s*[:;.]?/i;
    const lm=a.match(labelRe);
    if(lm){
      const idx=a.indexOf(lm[0]);
      const searchWindow=a.slice(idx,idx+300);
      const sm=searchWindow.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})/);
      if(sm)e.shipDate=sm[1];
    }
  }
  // Ship Date fallback 2 — no recognisable label. Only run if doc smells like Aus Reo (gates it
  // away from non-Aus-Reo PDFs that happen to contain dates).
  // Excludes "Last Activity" timestamp at the bottom of page 1 (Aus Reo footer).
  if(!e.shipDate&&looksLikeAusReo(a)){
    const headText=t||a.slice(0,2000);
    const cleaned=headText.replace(/Last\s*Activity[\s\S]{0,80}/gi,' ');
    const dm=cleaned.match(/\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/);
    if(dm)e.shipDate=dm[1];
  }
  // Weight fallback — allow space inside "W t" (OCR artefact) and "We" as Tesseract misread.
  // Also gated on Aus Reo signal: OneSteel/competitor schedules can contain "Wt: X T" too.
  if(e.weight==null&&looksLikeAusReo(a)){
    m=a.match(/\bW\s*[te]\s*:?\s*([\d.,]+)\s*T(?:onne)?\b/i);
    if(m){const v=parseReoNum(m[1]);if(!isNaN(v))e.weight=v}}
  // Decide whether to continue with deeper extraction (BAR SUMMARY / mesh / trench).
  // Continue if: (a) we found a Ctrl Code, OR (b) the doc clearly smells like Aus Reo via
  // distinctive anchors. The (b) path lets us still extract bar weight / mesh / dates from
  // OCR'd schedules even when browser Tesseract garbles the actual Ctrl Code text.
  if(!e.ctrlCode&&!looksLikeAusReo(a)){
    if(typeof console!=='undefined'&&console.log){
      console.log('[REO PARSE] no ctrl code, no Aus Reo signal — skipping',{
        textLen:a.length,
        hasCtrlLabel:/Ctrl\s*Code/i.test(a),
        hasAusReoSignal:looksLikeAusReo(a),
        allDates:(a.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g)||[]).slice(0,8),
        first400:a.slice(0,400)
      });
    }
    return e;
  }
  // ════════════════════════════════════════════════════════════════════════════════
  // SELF-CHECKING EXTRACTION (b5.5) — full document understanding + reconciliation.
  // Reads BAR SUMMARY, SPIRAL WEIGHT SUMMARY (both reinforcement), MISCELLANEOUS PRODUCT
  // SUMMARY (accessories), and the body line items. Deducts starter bars (-SB marks) from
  // the invoiceable bar weight. Reconciles (Bar + Spiral + Misc) against stated Total Weight.
  // ════════════════════════════════════════════════════════════════════════════════
  // reoNum2 — Aus Reo mixes decimal separators: "0,137" (comma) and "0.137" (dot), and uses
  // dots/commas as thousands separators inconsistently. Treat the LAST separator as the decimal.
  const reoNum2=s=>{
    if(s==null)return NaN;let str=String(s).trim();if(!str)return NaN;
    if(/[.,]/.test(str)){
      const lc=str.lastIndexOf(','),ld=str.lastIndexOf('.');const dp=Math.max(lc,ld);
      const ip=str.slice(0,dp).replace(/[.,]/g,'');const dec=str.slice(dp+1).replace(/[^\d]/g,'');
      str=ip+'.'+dec;
    }
    const v=parseFloat(str);return isNaN(v)?NaN:v;
  };
  // Read the TOTAL tonne from a named summary section, bounded so SPIRAL/MISC don't bleed into BAR.
  const sectionTotal=(name,tonneGroup)=>{
    const start=a.search(new RegExp(name,'i'));if(start<0)return null;
    const rest=a.slice(start+name.length);
    const nextHdr=rest.search(/(?:BAR|SPIRAL\s*WEIGHT|MISCELLANEOUS\s*PRODUCT)\s*SUMMARY/i);
    const section=nextHdr>=0?rest.slice(0,nextHdr):rest;
    const mm2=section.match(new RegExp('TOTAL\\s+'+tonneGroup,'i'));
    return mm2?reoNum2(mm2[1]):null;
  };
  // BAR / SPIRAL: "TOTAL <items> <pieces> <tonne>" — items/pieces may use . or , as separators.
  const barSummary=sectionTotal('BAR SUMMARY','[\\d.,]+\\s+[\\d.,]+\\s+([\\d.,]+)');
  const spiralSummary=sectionTotal('SPIRAL WEIGHT SUMMARY','[\\d.,]+\\s+[\\d.,]+\\s+([\\d.,]+)');
  const miscSummary=sectionTotal('MISCELLANEOUS PRODUCT SUMMARY','([\\d.,]+)');

  // ── Body line items: starter bars + bar fallback ──
  // Starter bars: a Bar Mark ending in "-SB" followed by a real bar product (N/Y/R). Detected by
  // the mark suffix ALONE — the "STARTER BARS" description is corroborating but never required.
  let bodyStarter=0,starterCount=0,bodyBarSum=0,bodyBarFound=false;
  for(const line of a.split('\n')){
    // <mark> <product Nxx/Yxx/Rxx> <qty> ... <tonne at end>
    const bm=line.match(/^\s*([A-Z0-9.\-]+)\s+(N\d+|Y\d+|R\d+)[A-Z]*\s+(\d+)\s+.*?([\d]+[.,]\d+)\s*$/);
    if(bm){
      const mark=bm[1].toUpperCase(),tonne=reoNum2(bm[4]);
      if(isNaN(tonne)||tonne<=0)continue;
      if(/-SB$/.test(mark)){bodyStarter+=tonne;starterCount++;}
      bodyBarSum+=tonne;bodyBarFound=true;
    }
  }

  // ── Reinforcement bar weight (before starter deduction) ──
  // Prefer the authoritative BAR SUMMARY (+ SPIRAL). Fall back to summed body bar line items
  // for small orders that have no BAR SUMMARY (e.g. 2DD7). The fallback excludes accessories.
  let barReoTotal=null;
  if(barSummary!=null||spiralSummary!=null){
    barReoTotal=(barSummary||0)+(spiralSummary||0);
  }else if(bodyBarFound){
    // No summary — sum genuine reinforcing-bar line items, excluding accessories & mesh/trench.
    let s=0,found=false;
    const liRe=/\b([A-Z]{1,4}\d+[A-Z0-9]*)\s+(\d+(?:\.\d+)?)\s+Each\s+([^\n]*?)\s+([\d.]+)\s*(?:\n|$)/gi;
    let li;
    while((li=liRe.exec(a))!==null){
      const code=li[1].toUpperCase(),desc=(li[3]||''),tonne=reoNum2(li[4]);
      if(isNaN(tonne)||tonne<=0)continue;
      if(/^(SL|RL)\d/.test(code))continue;
      if(/TM\d/.test(code))continue;
      if(/chair|tie\s*wire|tie-wire|spacer|joining\s*tape|tape|membrane|film|plastic|delivery|cartage|grease|stool|trestle|\bclip\b|belt\s*pack|dowel/i.test(desc))continue;
      if(/^(SOG|PTBC|PCF|BC|TW|DEL|PBFB|PBF|SPC|JT|DWB|DWL)\d*/i.test(code))continue;
      const isBarCode=/^[NYR]\d/.test(code);
      const isBarDesc=/\bBar\s+D?500|deformed|round\s*bar|\bN\d{2}\b/i.test(desc)&&!/chair/i.test(desc);
      if(isBarCode||isBarDesc){s+=tonne;found=true}
    }
    if(found)barReoTotal=Math.round(s*1000)/1000;
  }

  // ── MESH (SL/RL) sum of qty × width × length, handling split text layout ──
  let meshSqm=0,meshFound=false;
  const meshReInline=/\b((?:SL|RL)\d+[A-Z]*)\s+([\d.,]+)\s+Each\s+(?:Square|Rectangular|Reinforcing)?\s*Mesh\s+(?:(?:SL|RL)\d+[A-Z]*\s+)?effective\s*area\s*([\d.,]+)\s*[xX]\s*([\d.,]+)\s*m/gi;
  let mm3,inlineMatched=false;
  while((mm3=meshReInline.exec(a))!==null){
    const qty=parseReoInt(mm3[2]),w=parseReoDim(mm3[3]),l=parseReoDim(mm3[4]);
    if(!isNaN(qty)&&!isNaN(w)&&!isNaN(l)){meshSqm+=qty*w*l;meshFound=true;inlineMatched=true}}
  if(!inlineMatched){
    const codeRe=/\b((?:SL|RL)\d+[A-Z]*)\s+(\d+)\s+Each/gi;let cm2;
    while((cm2=codeRe.exec(a))!==null){
      const qty=parseReoInt(cm2[2]);
      const win=a.slice(Math.max(0,cm2.index-90),cm2.index+130);
      if(!/mesh|effective\s*area/i.test(win))continue;
      const dim=win.match(/([\d.]+)\s*[xX]\s*([\d.]+)\s*m\b/);
      if(dim){const w=parseReoDim(dim[1]),l=parseReoDim(dim[2]);if(!isNaN(qty)&&!isNaN(w)&&!isNaN(l)){meshSqm+=qty*w*l;meshFound=true}}
    }
  }
  // ── TRENCH MESH (TM) sum of qty × longest dimension ──
  let trenchLm=0,trenchFound=false;
  const trenchRe=/\b([A-Z]*\d*TM\d+[A-Z]*)\s+([\d.,]+)\s+Each\s+Trench\s*Mesh\s+(?:\d+mm\s+)?([\d.,]+)\s*[xX]\s*([\d.,]+)\s*m/gi;
  let tr;while((tr=trenchRe.exec(a))!==null){
    const qty=parseReoInt(tr[2]),aa=parseReoDim(tr[3]),bb=parseReoDim(tr[4]);
    if(!isNaN(qty)&&!isNaN(aa)&&!isNaN(bb)){trenchLm+=qty*Math.max(aa,bb);trenchFound=true}}

  // ── Final invoiceable figures ──
  e.starterWeight=starterCount>0?Math.round(bodyStarter*1000)/1000:null;
  if(barReoTotal!=null){
    // Bar weight feeding invoicing EXCLUDES starter bars (we fix those, not the steel fixers).
    const barForFixing=Math.round((barReoTotal-bodyStarter)*1000)/1000;
    e.barWeight=barForFixing;
  }
  if(meshFound)e.meshSqm=Math.round(meshSqm*100)/100;
  if(trenchFound)e.trenchLm=Math.round(trenchLm*100)/100;

  // ── RECONCILIATION (sanity check) ──
  // Compare (Bar summary + Spiral + Misc) against the stated Total Weight. If they don't match
  // within 0.01T, flag the row for review. Starter % safety net flags when starters > 50%.
  if(e.weight!=null&&(barSummary!=null||spiralSummary!=null||miscSummary!=null)){
    const components=(barSummary||0)+(spiralSummary||0)+(miscSummary||0);
    const diff=Math.round((e.weight-components)*1000)/1000;
    e.reconDiff=diff;
    e.reconStatus=Math.abs(diff)<=0.01?'reconciled':'review';
    if(e.reconStatus==='review')e.reconReason='Totals do not match (diff '+diff+'T)';
  }else{
    // Nothing to reconcile against (no summaries, or no total) — leave status null per spec.
    e.reconStatus=null;
  }
  // Starter > 50% safety net (independent of reconciliation).
  if(e.weight&&e.starterWeight!=null&&e.starterWeight>0.5*e.weight){
    e.reconStatus='review';
    e.reconReason=(e.reconReason?e.reconReason+'; ':'')+'Starter bars exceed 50% of total';
  }

  // Diagnostic — compact single line.
  if(typeof console!=='undefined'&&console.log){
    console.log('[REO PARSE]',e.ctrlCode||'?','wt='+(e.weight??'-'),'bar='+(e.barWeight??'-'),'starter='+(e.starterWeight??'-'),'mesh='+(e.meshSqm??'-'),'trench='+(e.trenchLm??'-'),'recon='+(e.reconStatus||'none')+(e.reconDiff?('/'+e.reconDiff):''));
  }
  return e}

// Get text from a PDF using its native text layer. Returns {pageOneText, allText, hasText, numPages}.
// Build the DB column object for an extraction result, including b5.5 reconciliation fields.
// Used by all upload paths so the schema stays consistent.
function extractionBreakdown(ex){
  ex=ex||{};
  return {
    bar_weight: ex.barWeight!=null?ex.barWeight:null,
    mesh_sqm: ex.meshSqm!=null?ex.meshSqm:null,
    trench_mesh_lm: ex.trenchLm!=null?ex.trenchLm:null,
    starter_weight: ex.starterWeight!=null?ex.starterWeight:null,
    recon_status: ex.reconStatus||null,
    recon_diff: ex.reconDiff!=null?ex.reconDiff:null,
    recon_reason: ex.reconReason||null,
    recon_reviewed: false,
    recon_reviewed_by: null,
    extraction_method: ex._extractionMethod||null
  };
}

async function getPdfNativeText(file){
  await loadPdfJs();const buf=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const pageTexts=[];let allText='';
  for(let i=1;i<=pdf.numPages;i++){try{const pp=await pdf.getPage(i);const tt=await pp.getTextContent();const txt=tt.items.map(x=>x.str).join(' ');pageTexts.push(txt);allText+=' '+txt}catch(_){pageTexts.push('')}}
  return {pageOneText:pageTexts[0]||'',allText:allText.trim(),hasText:allText.trim().length>50,numPages:pdf.numPages,pdf}}

// Render each page of a PDF to a canvas image, then OCR each. Returns combined text.
// `onProgress(pageNum, totalPages, stage)` called during work so UI can update.
async function getPdfOcrText(file,onProgress){
  await loadPdfJs();await loadTesseract();
  const buf=await file.arrayBuffer();const pdf=await pdfjsLib.getDocument({data:buf}).promise;
  const total=pdf.numPages;
  const pageTexts=[];
  // Single Tesseract worker reused across pages — much faster than recreating
  if(onProgress)onProgress(0,total,'init');
  const worker=await window.Tesseract.createWorker('eng');
  try{
    for(let i=1;i<=total;i++){
      if(onProgress)onProgress(i,total,'render');
      const pg=await pdf.getPage(i);
      // 2x scale = better OCR accuracy at the cost of a bit more memory.
      const viewport=pg.getViewport({scale:2});
      const canvas=document.createElement('canvas');canvas.width=viewport.width;canvas.height=viewport.height;
      const ctx=canvas.getContext('2d');
      await pg.render({canvasContext:ctx,viewport}).promise;
      if(onProgress)onProgress(i,total,'ocr');
      const{data}=await worker.recognize(canvas);
      pageTexts.push(data.text||'');
      // Free the canvas — important when iterating 50+ pages
      canvas.width=0;canvas.height=0;
    }
  }finally{await worker.terminate()}
  return {pageOneText:pageTexts[0]||'',allText:pageTexts.join(' ').trim(),numPages:total}}

// Main entry point. Tries native text first; if PDF is image-only, returns _needsOcr=true
// for the caller to decide whether to invoke OCR (so UI can show the warning first).
async function doPdfExtract(file){
  const native=await getPdfNativeText(file);
  if(!native.hasText){return {_needsOcr:true,_numPages:native.numPages,_extractionMethod:null}}
  const parsed=parseReoText(native.pageOneText,native.allText);
  parsed._extractionMethod='native';
  return parsed}

// Run OCR on a PDF and return parsed fields. Caller must supply a progress callback for the UI.
async function doPdfOcrExtract(file,onProgress){
  const ocr=await getPdfOcrText(file,onProgress);
  const parsed=parseReoText(ocr.pageOneText,ocr.allText);
  parsed._extractionMethod='ocr';
  return parsed}

// Apply extracted fields to the New Entry form and update the info panel.
function applyExtractedToForm(ext){
  if(ext.ctrlCode)$('inpSched').value=ext.ctrlCode;
  if(ext.weight)$('inpWeight').value=ext.weight;
  if(ext.drawing)$('inpDrawing').value=ext.drawing;
  if(ext.shipDate){const iso=parseAusDate(ext.shipDate);if(iso)$('inpSupDate').value=iso}}

function buildExtractionSummary(ext){
  const ff=[];
  if(ext.ctrlCode)ff.push('Schedule: <b>'+esc(ext.ctrlCode)+'</b>');
  if(ext.weight)ff.push('Wt: <b>'+ext.weight+'T</b>');
  if(ext.shipDate)ff.push('Ship: <b>'+esc(ext.shipDate)+'</b>');
  if(ext.drawing)ff.push('Drawing: <b>'+esc(ext.drawing)+'</b>');
  if(ext.barWeight!=null)ff.push('Bars: <b>'+ext.barWeight+'T</b>');
  if(ext.meshSqm!=null)ff.push('Mesh: <b>'+ext.meshSqm+'m²</b>');
  if(ext.trenchLm!=null)ff.push('Trench: <b>'+ext.trenchLm+'LM</b>');
  return ff}

async function extractPdfData(file){
  const info=$('extractInfo');info.innerHTML='<div class="info-msg">Reading PDF...</div>';
  try{
    const ext=await doPdfExtract(file);
    // Image-only PDF — REJECT. We used to auto-OCR these, but browser Tesseract is too unreliable
    // for the steel-fixers extraction we need (bar weight, mesh, trench mesh). Force the user to
    // re-export from their scheduling software using "Save As PDF" / "Export as PDF" instead of
    // "Print to PDF". Aus Reo's scheduling software supports both — they just need to use the right one.
    if(ext._needsOcr){
      info.innerHTML=`
<div class="error-msg" style="margin-top:8px;line-height:1.5">
  <div style="font-weight:700;margin-bottom:6px">⚠ This PDF can't be used — it's an image, not a real PDF</div>
  <div style="font-size:13px;margin-bottom:8px">It looks like this file was made using <b>"Print to PDF"</b>, which turns each page into an image. We can't reliably extract bar weight, mesh, or trench mesh data from image-only PDFs.</div>
  <div style="font-size:13px;margin-bottom:8px"><b>Please re-export the schedule from your scheduling software using "Save As PDF" or "Export as PDF"</b> (not "Print to PDF"), and upload that version instead.</div>
  <div style="font-size:12px;color:var(--gray-dk)">If you're not sure how to do this, ask your IT support or check your scheduling software's export options.</div>
</div>`;
      // Clear the pending file so the user can't proceed with this upload
      pendingFile=null;renderFile();
      $('scheduleSection').style.display='none';$('markupSection').style.display='none';
      return}
    // Native text extraction succeeded
    applyExtractedToForm(ext);
    const ff=buildExtractionSummary(ext);
    info.innerHTML=ff.length
      ? `<div class="success-msg" style="margin-top:8px">Extracted: ${ff.join(' · ')}</div>`
      : '<div class="warn-msg" style="margin-top:8px">Could not detect schedule data. Please fill in the fields manually.</div>';
    pendingFile._extracted=ext;
  }catch(e){
    console.error(e);
    info.innerHTML='<div class="warn-msg" style="margin-top:8px">Extraction failed: '+esc(e.message||'unknown error')+'</div>'}}

async function uploadFile(file,project,level,area){
  const safe=file.name.replace(/[^a-zA-Z0-9._-]/g,'_'),ts=Date.now()+'_'+Math.floor(Math.random()*9999);
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
      // Ad Hoc orders are often real schedules (small/loose deliveries). If a PDF was uploaded and
      // extracted, save the schedule code + weight breakdown so Steel Fixers picks them up too.
      const ex=pendingFile&&pendingFile._extracted||{};
      const looseSchedule=ex.ctrlCode||null;
      const looseWeight=ex.weight!=null?ex.weight:null;
      const breakdown=extractionBreakdown(ex);
      const{data,error}=await sb.from('entries').insert({project,level:level||null,area:area||null,schedule:looseSchedule,status:'Not Ordered',entry_date:ed,comments:desc+(comments?'\n'+comments:''),file_url:furl,file_name:fname,entry_type:'loose',total_weight:looseWeight,drawing_reference:ex.drawing||null,...breakdown}).select().single();
      if(error)throw error;
      await auditLog({entry_id:data.id,action:'CREATE',new_value:`LOOSE: ${project}/${level||'-'}/${area||'-'}${looseSchedule?' ('+looseSchedule+')':''}`});
    }else{
      const schedule=$('inpSched').value.trim(),ed=$('inpDate').value,supD=$('inpSupDate').value||null;
      const weight=$('inpWeight').value||null,drawing=$('inpDrawing').value.trim()||null;
      if(!schedule)throw new Error('Enter schedule number');if(!ed)throw new Error('Select submission date');
      let furl=null,fname=null;
      if(pendingFile){info.innerHTML='<div class="info-msg">Uploading schedule...</div>';furl=await uploadFile(pendingFile,project,level,area);fname=pendingFile.name}
      let mkNew=[];
      if(pendingMarkups.length){
        info.innerHTML='<div class="info-msg">Uploading markup plans...</div>';
        for(const f of pendingMarkups){try{const u=await uploadFile(f,project+'/_markups',level,area);mkNew.push({url:u,name:f.name,uploaded_by:userName,date:today()})}catch(_){}}}
      // Pull extracted weight breakdown from the PDF (if any)
      const ex=pendingFile&&pendingFile._extracted||{};
      const breakdown=extractionBreakdown(ex);
      if(selectedOrderId){
        const entry=entries.find(e=>e.id===selectedOrderId);
        const existing=entry.markup_plans?JSON.parse(entry.markup_plans):[];
        const combined=[...existing,...mkNew];
        const up={schedule,entry_date:ed,supplier_delivery_date:supD,file_url:furl,file_name:fname,status:'Scheduled',total_weight:weight?parseFloat(weight):null,drawing_reference:drawing,comments:comments||entry.comments,...breakdown};
        if(combined.length)up.markup_plans=JSON.stringify(combined);
        if(entry.our_delivery_date&&supD&&entry.our_delivery_date!==supD)up.mismatch_resolved=false;
        const{error}=await sb.from('entries').update(up).eq('id',selectedOrderId);if(error)throw error;
        await auditLog({entry_id:selectedOrderId,action:'UPDATE',field_changed:'schedule_attached',new_value:`${schedule} (${fname||'no file'})`});
      }else{
        // For unmatched entries, capture the user's split_reference choice. Read the dropdown /
        // custom-text input at SUBMIT TIME so that picking the dropdown after clicking the
        // "Create new unmatched entry" button still works. Falls back to the value captured at
        // button-click time (window._unmatchedSplitRef) in case the order list got re-rendered
        // (e.g. user changed level/area after starting the unmatched flow) and the dropdown is gone.
        const splitRef=getUnmatchedSplitRef()||window._unmatchedSplitRef||null;
        const{data,error}=await sb.from('entries').insert({project,level:level||null,area:area||null,schedule,status:'Scheduled',entry_date:ed,comments:comments||null,file_url:furl,file_name:fname,entry_type:'scheduled',total_weight:weight?parseFloat(weight):null,drawing_reference:drawing,supplier_delivery_date:supD,split_reference:splitRef,markup_plans:mkNew.length?JSON.stringify(mkNew):null,unmatched:true,...breakdown}).select().single();
        if(error)throw error;
        await auditLog({entry_id:data.id,action:'CREATE',new_value:`UNMATCHED: ${project}/${level||'-'}${splitRef?' ('+splitRef+')':''}/${schedule}`});
        // Clear the captured split ref so it doesn't leak into the next submission
        window._unmatchedSplitRef=null;
      }}
    info.innerHTML='';$('successOv').classList.add('show');
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}
  btn.disabled=false;btn.textContent='Submit Entry'}

function resetForm(){
  $('selProj').value='';$('inpSched').value='';$('inpDate').value=today();$('inpLooseDate').value=today();
  $('inpLooseDesc').value='';$('inpComm').value='';$('inpSupDate').value='';$('inpWeight').value='';
  $('inpDrawing').value='';pendingFile=null;pendingMarkups=[];selectedOrderId=null;
  multiUploadItems=[];const mu=$('multiUploadSection');if(mu)mu.style.display='none';
  $('flist').innerHTML='';$('mkList').innerHTML='';$('formErr').innerHTML='';$('formInfo').innerHTML='';$('extractInfo').innerHTML='';
  onProjChange();setEntryType('scheduled')}

/* ═══ DASHBOARD ═══ */
function getFiltered(){
  let list=entries.slice();
  const fp=$('fProj').value,fl=$('fLevel').value,fa=$('fArea').value,fs=$('fStatus').value,ft=$('fType').value,fm=$('fMismatch').value,fh=$('fHold').value,fq=$('fSearch').value.toLowerCase().trim();
  if(fp)list=list.filter(e=>e.project===fp);if(fl)list=list.filter(e=>e.level===fl);if(fa)list=list.filter(e=>e.area===fa);
  if(fs)list=list.filter(e=>e.status===fs);if(ft)list=list.filter(e=>e.entry_type===ft);
  if(fh==='hold')list=list.filter(e=>e.on_hold);if(fh==='nohold')list=list.filter(e=>!e.on_hold);
  if(fm==='mismatch')list=list.filter(e=>hasMismatch(e));if(fm==='unmatched')list=list.filter(e=>e.unmatched);
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area,e.comments,chunksToPlain(parseChunks(e.aus_reo_comment)),chunksToPlain(parseChunks(e.dbcc_comment)),e.drawing_reference].some(f=>(f||'').toLowerCase().includes(fq)));
  list.sort((a,b)=>{let va=a[sortCol]||'',vb=b[sortCol]||'';
    if(['entry_date','created_at','our_delivery_date','supplier_delivery_date'].includes(sortCol)){va=new Date(va||0);vb=new Date(vb||0);return sortAsc?va-vb:vb-va}
    if(sortCol==='total_weight'){va=parseFloat(va)||0;vb=parseFloat(vb)||0;return sortAsc?va-vb:vb-va}
    return sortAsc?String(va).localeCompare(String(vb)):String(vb).localeCompare(String(va))});return list}

function renderDash(){
  const all=entries,f=getFiltered(),mc=all.filter(e=>hasMismatch(e)).length,hc=all.filter(e=>e.on_hold).length;
  $('statsArea').innerHTML=[{n:all.length,l:"Total",c:"var(--accent-dk)"},{n:all.filter(e=>e.status==="Not Ordered").length,l:"Not Ordered",c:"var(--gray)"},{n:all.filter(e=>e.status==="Ordered").length,l:"Ordered",c:"var(--info)"},{n:all.filter(e=>e.status==="Scheduled").length,l:"Scheduled",c:"var(--accent-dk)"},{n:all.filter(e=>e.status==="Delivered").length,l:"Delivered",c:"var(--success)"},{n:hc,l:"⏸ On Hold",c:"var(--warn)"},{n:mc,l:"⚠ Mismatches",c:"var(--warn)"}].map(s=>`<div class="stat"><div class="stat-n" style="color:${s.c}">${s.n}</div><div class="stat-l">${s.l}</div></div>`).join('');
  updateBulkBar();
  const w=$('dashTable');
  if(!f.length){w.innerHTML=`<div class="empty"><p>${all.length===0?'No entries yet.':'No matches.'}</p></div>`;return}
  const ar=c=>sortCol===c?(sortAsc?' ▲':' ▼'):'';
  const allCk=f.every(e=>selectedIds.has(e.id));
  w.innerHTML=`<table><thead><tr><th class="no-sort" style="width:36px"><input type="checkbox" ${allCk?'checked':''} onchange="toggleAll(this.checked)"></th><th onclick="tSort('project')">Project${ar('project')}</th><th onclick="tSort('level')">Level${ar('level')}</th><th onclick="tSort('area')">Area${ar('area')}</th><th onclick="tSort('schedule')">Schedule${ar('schedule')}</th><th onclick="tSort('total_weight')">Wt${ar('total_weight')}</th><th onclick="tSort('status')">Status${ar('status')}</th><th onclick="tSort('our_delivery_date')">Ordered Delivery${ar('our_delivery_date')}</th><th onclick="tSort('supplier_delivery_date')">Supplier${ar('supplier_delivery_date')}</th><th onclick="tSort('entry_date')">Submitted${ar('entry_date')}</th><th class="no-sort">Schedule File</th><th class="no-sort">Markup Plans</th><th class="no-sort" style="max-width:120px">Aus Reo Comments</th><th class="no-sort" style="max-width:120px">DBCC Comments</th><th class="no-sort">Actions</th></tr></thead><tbody>${f.map(e=>{
    const mm=hasMismatch(e),cn=e.status==='Cancelled',mp=e.markup_plans?JSON.parse(e.markup_plans):[];
    return`<tr class="${cn?'cancelled':''}${e.on_hold?' on-hold':''}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="handleRowDrop(event,${e.id});this.classList.remove('drag-over')">
<td class="td-check"><input type="checkbox" ${selectedIds.has(e.id)?'checked':''} onchange="toggleSel(${e.id},this.checked)"></td>
<td class="proj-td" title="${esc(e.project)}">${esc(e.project)}${e.unmatched?'<span class="unmatched-icon" title="No placeholder existed">⚠</span>':''}</td>
<td>${esc(e.level||'—')}${e.split_reference?' <span style="font-size:10px;color:var(--accent-dk);font-weight:600">('+esc(e.split_reference)+')</span>':''}</td>
<td title="${esc(e.area||'')}">${esc(e.area||'—')}</td>
<td class="sched-td">${e.schedule?esc(e.schedule):'<span style="color:#ccc">—</span>'}${e.extraction_method==='ocr'?' <span class="ocr-badge" title="Extracted via OCR — verify values">🔍</span>':''}</td>
<td>${e.total_weight?`<span class="weight-td" onclick="editWeight(${e.id})">${e.total_weight}T</span>`:`<span style="color:#ccc;cursor:pointer" onclick="editWeight(${e.id})">—</span>`}</td>
<td>${getStatusPill(e.status,e.entry_type,e.on_hold)}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.our_delivery_date)||'<span style="color:#ccc">—</span>'}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.supplier_delivery_date)||'<span style="color:#ccc">—</span>'}${mm?'<span class="mismatch-icon" title="Dates mismatch">⚠️</span>':''}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.entry_date)||'—'}</td>
<td>${e.file_url?`<a class="att-link" href="${e.file_url}" target="_blank">📄 ${esc((e.file_name||'').slice(0,14))}</a>`:`<button class="action-btn" onclick="uploadScheduleFile(${e.id})" style="color:var(--accent-dk);font-size:10px">+ Upload</button>`}</td>
<td>${mp.length?`<button class="att-link markup-link" onclick="viewMarkups(${e.id})">📐 ${mp.length}</button>`:''}<button class="action-btn" onclick="uploadMarkup(${e.id})" style="font-size:10px;color:var(--info)">+📐</button></td>
<td class="comment-td" onclick="editChunkComment(${e.id},'aus_reo')" title="${esc(chunksToPlain(parseChunks(e.aus_reo_comment)))}"><div class="comment-preview">${chunksToCell(parseChunks(e.aus_reo_comment))}</div></td>
<td class="comment-td" onclick="editChunkComment(${e.id},'dbcc')" title="${esc(chunksToPlain(parseChunks(e.dbcc_comment)))}"><div class="comment-preview">${chunksToCell(parseChunks(e.dbcc_comment))}</div></td>
<td><div class="action-cell">
${e.status!=='Cancelled'?`<span class="hold-toggle${e.on_hold?' on':''}" onclick="toggleHold(${e.id})" title="Toggle On Hold"><span class="hold-slider"></span></span>`:''}
<button class="action-btn view" onclick="showDetail(${e.id})">View</button>
${['Scheduled','Ordered'].includes(e.status)?`<button class="action-btn deliver" onclick="markDelivered(${e.id})">✓</button>`:''}
${e.status!=='Cancelled'&&e.status!=='Delivered'?`<button class="action-btn cancel" onclick="cancelEntry(${e.id})">✗</button>`:''}
${e.status==='Cancelled'?`<button class="action-btn reinstate" onclick="reinstateEntry(${e.id})">↺</button>`:''}
${mm?`<button class="action-btn resolve" onclick="resolveMismatch(${e.id})">Fix</button><button class="action-btn mail" onclick="openMismatchEmail(${e.id})">✉</button>`:''}
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

/* ═══ ON HOLD TOGGLE ═══ */
async function toggleHold(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  if(e.on_hold){
    // Turning OFF — no prompt
    await sb.from('entries').update({on_hold:false}).eq('id',id);
    await auditLog({entry_id:id,action:'ON_HOLD',field_changed:'on_hold',old_value:'true',new_value:'false'});
    await loadEntries();renderDash();
  }else{
    // Turning ON — ask about notification
    confirmDialog('Put on Hold?',`Put <b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.schedule?' ('+esc(e.schedule)+')':''} on hold?<br><br>You'll be asked if you want to send a notification email.`,'Put On Hold','btn-dark',async()=>{
      await sb.from('entries').update({on_hold:true,previous_status:e.status}).eq('id',id);
      await auditLog({entry_id:id,action:'ON_HOLD',field_changed:'on_hold',old_value:'false',new_value:'true'});
      await loadEntries();renderDash();
      // Then prompt for email
      setTimeout(()=>confirmDialog('Send Notification?','Send an email notification about this hold?','Send Email','',()=>openHoldEmail(id)),200);
    })}}

/* ═══ ROW DRAG-DROP ATTACH ═══ */
function handleRowDrop(event,id){event.preventDefault();const f=event.dataTransfer.files;if(!f.length)return;openAttachModal(id,f[0])}

function openAttachModal(id,file){
  const e=entries.find(x=>x.id===id);if(!e)return;window._attFile=file;window._attExt={};
  $('detailModal').innerHTML=`<h3>Attach Schedule<button class="modal-close" onclick="closeOv('detailOv')">&times;</button></h3>
<div class="info-msg" style="margin-top:0;margin-bottom:14px">Attaching <b>${esc(file.name)}</b> to: <b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div>
<div class="fg"><label>Schedule Number <span class="req">*</span></label><input type="text" id="att_sched" style="font-family:'JetBrains Mono',monospace"></div>
<div class="row2"><div class="fg"><label>Supplier Delivery Date <span class="req">*</span></label><input type="date" id="att_supD"></div><div class="fg"><label>Submission Date <span class="req">*</span></label><input type="date" id="att_subD" value="${today()}"></div></div>
<div class="row2"><div class="fg"><label>Weight (T)</label><input type="number" step="0.001" id="att_wt" style="font-family:'JetBrains Mono',monospace"></div><div class="fg"><label>Drawing Reference</label><input type="text" id="att_draw"></div></div>
<div id="att_info"></div><div id="att_err"></div>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('detailOv')">Cancel</button><button class="btn btn-sm" onclick="confirmAttach(${id})" id="att_btn" style="width:auto">Attach</button></div>`;
  $('detailOv').classList.add('show');
  // Auto-extract for PDFs (with OCR fallback for image-only PDFs)
  if(file.name.toLowerCase().endsWith('.pdf'))runAttachExtraction(file)}

async function runAttachExtraction(file){
  const info=$('att_info');if(!info)return;
  info.innerHTML='<div class="info-msg">Reading PDF...</div>';
  try{
    const ext=await doPdfExtract(file);
    // Image-only PDF — REJECT (see comment in extractPdfData for rationale).
    if(ext._needsOcr){
      info.innerHTML=`
<div class="error-msg" style="margin-top:8px;line-height:1.5">
  <div style="font-weight:700;margin-bottom:6px">⚠ This PDF can't be used — it's an image, not a real PDF</div>
  <div style="font-size:13px;margin-bottom:8px">It looks like this file was made using <b>"Print to PDF"</b>, which turns each page into an image. We can't reliably extract bar weight, mesh, or trench mesh data from image-only PDFs.</div>
  <div style="font-size:13px;margin-bottom:8px"><b>Please re-export the schedule from your scheduling software using "Save As PDF" or "Export as PDF"</b> (not "Print to PDF"), and upload that version instead.</div>
  <div style="font-size:12px;color:var(--gray-dk)">Close this dialog, re-export the file properly, and try attaching again.</div>
</div>`;
      // Disable the Attach button so user cannot save with this image-only file
      window._attFile=null;window._attExt={};
      const btn=$('att_btn');if(btn){btn.disabled=true;btn.textContent='Re-export PDF first'}
      return}
    window._attExt=ext;
    applyExtractedToAttach(ext);
    const ff=buildExtractionSummary(ext);
    info.innerHTML=ff.length
      ? '<div class="success-msg" style="margin-top:8px">'+ff.join(' · ')+'</div>'
      : '<div class="warn-msg" style="margin-top:8px">Could not detect schedule data. Please fill in fields manually.</div>';
  }catch(e){
    console.error(e);
    info.innerHTML='<div class="warn-msg" style="margin-top:8px">Extraction failed: '+esc(e.message||'unknown error')+'</div>'}}

function applyExtractedToAttach(ext){
  if(ext.ctrlCode)$('att_sched').value=ext.ctrlCode;
  if(ext.shipDate){const iso=parseAusDate(ext.shipDate);if(iso)$('att_supD').value=iso}
  if(ext.weight)$('att_wt').value=ext.weight;
  if(ext.drawing)$('att_draw').value=ext.drawing}

async function confirmAttach(id){
  const err=$('att_err');err.innerHTML='';
  if(!window._attFile)return err.innerHTML='<div class="error-msg">No valid file to attach. Please re-export your PDF and try again.</div>';
  const s=$('att_sched').value.trim(),sd=$('att_supD').value,sub=$('att_subD').value,wt=$('att_wt').value,dr=$('att_draw').value.trim();
  if(!s)return err.innerHTML='<div class="error-msg">Schedule required</div>';
  if(!sd)return err.innerHTML='<div class="error-msg">Supplier date required</div>';
  if(!sub)return err.innerHTML='<div class="error-msg">Submission date required</div>';
  const btn=$('att_btn');btn.disabled=true;btn.textContent='Uploading...';
  try{const e=entries.find(x=>x.id===id),file=window._attFile,ex=window._attExt||{};
    const furl=await uploadFile(file,e.project,e.level,e.area);
    const up={schedule:s,entry_date:sub,supplier_delivery_date:sd,file_url:furl,file_name:file.name,status:'Scheduled',total_weight:wt?parseFloat(wt):null,drawing_reference:dr||null,...extractionBreakdown(ex)};
    if(e.our_delivery_date&&sd!==e.our_delivery_date)up.mismatch_resolved=false;
    const{error}=await sb.from('entries').update(up).eq('id',id);if(error)throw error;
    await auditLog({entry_id:id,action:'UPDATE',field_changed:'schedule_attached',new_value:s});
    closeOv('detailOv');await loadEntries();renderDash();
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}btn.disabled=false;btn.textContent='Attach'}

function uploadScheduleFile(id){
  const inp=document.createElement('input');inp.type='file';inp.accept='.pdf,.dwg,.xlsx,.xls,.doc,.docx,.jpg,.jpeg,.png';
  inp.onchange=()=>{if(inp.files.length)openAttachModal(id,inp.files[0])};inp.click()}

/* ═══ STATUS ACTIONS ═══ */
async function markDelivered(id){const e=entries.find(x=>x.id===id);if(!e)return;
  confirmDialog('Mark Delivered?',`Mark "${esc(e.schedule||e.project)}" as delivered?`,'Mark Delivered','',async()=>{
    await sb.from('entries').update({status:'Delivered',on_hold:false}).eq('id',id);
    await auditLog({entry_id:id,action:'UPDATE',field_changed:'status',old_value:e.status,new_value:'Delivered'});
    await loadEntries();renderDash()})}

function cancelEntry(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('cancelModal').innerHTML=`<h3>Cancel Entry<button class="modal-close" onclick="closeOv('cancelOv')">&times;</button></h3><p style="font-size:13px;color:var(--mid);margin-bottom:14px">Cancel "${esc(e.schedule||e.project)}"?</p><div class="fg"><label>Reason <span class="req">*</span></label><textarea id="cancelR"></textarea></div><div id="cancelErr"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('cancelOv')">Keep</button><button class="btn btn-err btn-sm" onclick="doCancel(${id})">Cancel Entry</button></div>`;
  $('cancelOv').classList.add('show')}
async function doCancel(id){const r=$('cancelR').value.trim();if(!r)return $('cancelErr').innerHTML='<div class="error-msg">Reason required</div>';
  const e=entries.find(x=>x.id===id);await sb.from('entries').update({status:'Cancelled',cancel_reason:r,on_hold:false}).eq('id',id);
  await auditLog({entry_id:id,action:'CANCEL',field_changed:'status',old_value:e.status,new_value:'Cancelled: '+r});closeOv('cancelOv');await loadEntries();renderDash()}

function reinstateEntry(id){const e=entries.find(x=>x.id===id);if(!e)return;
  confirmDialog('Reinstate Entry?','Reinstate this cancelled entry?','Reinstate','',async()=>{
    let ns='Not Ordered';if(e.file_url||e.schedule)ns='Scheduled';else if(e.our_delivery_date)ns='Ordered';
    await sb.from('entries').update({status:ns,cancel_reason:null}).eq('id',id);
    await auditLog({entry_id:id,action:'REINSTATE',field_changed:'status',old_value:'Cancelled',new_value:ns});
    await loadEntries();renderDash()})}

function resolveMismatch(id){
  confirmDialog('Resolve Mismatch?','Mark the date mismatch as resolved? The two dates remain different, but will no longer be flagged.','Resolve','',async()=>{
    await sb.from('entries').update({mismatch_resolved:true,mismatch_resolved_by:userName,mismatch_resolved_at:new Date().toISOString()}).eq('id',id);
    await auditLog({entry_id:id,action:'MISMATCH_RESOLVED',field_changed:'mismatch_resolved',new_value:'true'});
    await loadEntries();renderDash()})}

/* ═══ WEIGHT / COMMENT / MARKUP ═══ */
function editWeight(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('weightModal').innerHTML=`<h3>Weight<button class="modal-close" onclick="closeOv('weightOv')">&times;</button></h3><div class="fg"><label>Tonnes</label><input type="number" step="0.001" id="wInp" value="${e.total_weight||''}" style="font-family:'JetBrains Mono',monospace"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('weightOv')">Cancel</button><button class="btn btn-sm" onclick="saveWeight(${id})" style="width:auto">Save</button></div>`;$('weightOv').classList.add('show')}
async function saveWeight(id){const v=$('wInp').value;const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({total_weight:v?parseFloat(v):null}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'total_weight',old_value:String(e.total_weight||''),new_value:v||''});
  closeOv('weightOv');await loadEntries();renderDash()}

function editComment(id){const e=entries.find(x=>x.id===id);if(!e)return;
  $('commentModal').innerHTML=`<h3>Comment<button class="modal-close" onclick="closeOv('commentOv')">&times;</button></h3><div class="fg"><textarea id="cmtInp" rows="4">${esc(e.comments||'')}</textarea></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn btn-sec btn-sm" onclick="closeOv('commentOv')">Cancel</button><button class="btn btn-sm" onclick="saveCmt(${id})" style="width:auto">Save</button></div>`;$('commentOv').classList.add('show')}
async function saveCmt(id){const v=$('cmtInp').value.trim();const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({comments:v||null}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'comments',old_value:e.comments||'',new_value:v||''});
  closeOv('commentOv');await loadEntries();renderDash()}

/* ═══ b5.1 — chunked comment editor ═══
   Used for both Aus Reo Comments and DBCC Comments. Each chunk is editable in-place.
   When user saves: any chunk whose text changed gets currentUser appended to its authors list.
   The "Add to comment" textarea creates a new chunk authored by currentUser.
   Clear-all wipes the entire column. */
function editChunkComment(id,col){
  // col = 'aus_reo' or 'dbcc'
  const e=entries.find(x=>x.id===id);if(!e)return;
  const colName=col==='aus_reo'?'aus_reo_comment':'dbcc_comment';
  const colLabel=col==='aus_reo'?'Aus Reo Comments':'DBCC Comments';
  const chunks=parseChunks(e[colName]);
  // Render existing chunks as textareas (one per chunk) so they can be edited individually.
  const chunkHtml=chunks.map((c,i)=>{
    const auth=Array.isArray(c.authors)?c.authors:[];
    const pillHtml=auth.length?'<div class="cmt-pill-row">'+auth.map(esc).map(n=>'<span class="cmt-pill">'+n+'</span>').join('')+'</div>':'';
    return`<div class="chunk-edit-row" data-i="${i}">
      <textarea class="chunk-edit-text" rows="2" data-original="${esc(c.text||'')}">${esc(c.text||'')}</textarea>
      ${pillHtml}
    </div>`;
  }).join('');
  const intro=chunks.length
    ? `<p style="font-size:11px;color:var(--muted);margin-bottom:10px">Edit a line below to update it. Empty a line to delete it. Your name will be added to any line you change.</p>`
    : `<p style="font-size:11px;color:var(--muted);margin-bottom:10px">No comments yet. Add one below.</p>`;
  $('commentModal').innerHTML=`<h3>${esc(colLabel)} <span style="font-size:11px;color:var(--muted);font-weight:normal">— ${esc(e.project)} / ${esc(e.level||'—')} / ${esc(e.area||'—')}</span><button class="modal-close" onclick="closeOv('commentOv')">&times;</button></h3>
${intro}
<div id="chunkList">${chunkHtml}</div>
<div class="fg" style="margin-top:14px;border-top:1px solid var(--border);padding-top:14px">
  <label style="display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:var(--gray-dk)">Add new comment</label>
  <textarea id="newChunkInp" rows="3" placeholder="Type your comment..."></textarea>
</div>
<div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px">
  <button class="btn btn-err btn-sm" onclick="clearChunkComment(${id},'${col}')" style="width:auto" ${chunks.length?'':'disabled'}>Clear All</button>
  <div style="display:flex;gap:8px"><button class="btn btn-sec btn-sm" onclick="closeOv('commentOv')">Cancel</button><button class="btn btn-sm" onclick="saveChunkComment(${id},'${col}')" style="width:auto">Save</button></div>
</div>`;
  $('commentOv').classList.add('show');
  setTimeout(()=>{const ta=$('newChunkInp');if(ta)ta.focus()},80)}

async function saveChunkComment(id,col){
  const e=entries.find(x=>x.id===id);if(!e)return;
  const colName=col==='aus_reo'?'aus_reo_comment':'dbcc_comment';
  const old=parseChunks(e[colName]);
  // 1. Walk existing chunks: keep those still non-empty; if text changed, append currentUser.
  const updated=[];
  document.querySelectorAll('#chunkList .chunk-edit-row').forEach(row=>{
    const i=parseInt(row.getAttribute('data-i'),10);
    const orig=old[i];if(!orig)return;
    const ta=row.querySelector('.chunk-edit-text');
    const newText=(ta.value||'').trim();
    if(!newText)return;// removed
    const changed=newText!==(orig.text||'').trim();
    const newAuthors=changed?appendAuthor(orig.authors,userName):orig.authors;
    const c={text:newText,authors:newAuthors,created_at:orig.created_at};
    if(changed)c.edited_at=new Date().toISOString();
    updated.push(c);
  });
  // 2. New chunk from "Add new comment" box, if any.
  const newText=($('newChunkInp').value||'').trim();
  if(newText){updated.push({text:newText,authors:[userName],created_at:new Date().toISOString()})}
  // 3. Persist.
  const newJson=chunksToJson(updated);
  await sb.from('entries').update({[colName]:newJson}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:colName,old_value:chunksToPlain(old).slice(0,200),new_value:chunksToPlain(updated).slice(0,200)});
  closeOv('commentOv');await loadEntries();renderDash();}

function clearChunkComment(id,col){
  const colName=col==='aus_reo'?'aus_reo_comment':'dbcc_comment';
  const colLabel=col==='aus_reo'?'Aus Reo Comments':'DBCC Comments';
  confirmDialog(`Clear all ${colLabel}?`,'This will remove every line in this column. Audit log captures who cleared it. This cannot be undone.','Clear All','btn-err',async()=>{
    const e=entries.find(x=>x.id===id);if(!e)return;
    const old=parseChunks(e[colName]);
    await sb.from('entries').update({[colName]:null}).eq('id',id);
    await auditLog({entry_id:id,action:'UPDATE',field_changed:colName+'_cleared',old_value:chunksToPlain(old).slice(0,200),new_value:'(cleared)'});
    closeOv('commentOv');await loadEntries();renderDash();
  });
}

function uploadMarkup(id){const inp=document.createElement('input');inp.type='file';inp.accept='.pdf,.jpg,.jpeg,.png,.dwg';inp.multiple=true;
  inp.onchange=async()=>{if(!inp.files.length)return;try{const e=entries.find(x=>x.id===id);
    const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
    for(const file of inp.files){const furl=await uploadFile(file,e.project+'/_markups',e.level,e.area);mp.push({url:furl,name:file.name,uploaded_by:userName,date:today()})}
    await sb.from('entries').update({markup_plans:JSON.stringify(mp)}).eq('id',id);
    await auditLog({entry_id:id,action:'UPDATE',field_changed:'markup_plans',new_value:'Added '+inp.files.length+' file(s)'});
    await loadEntries();renderDash();}catch(e){alert('Failed: '+e.message)}};inp.click()}

function viewMarkups(id){const e=entries.find(x=>x.id===id);if(!e)return;const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  $('markupModal').innerHTML=`<h3>Markup Plans<button class="modal-close" onclick="closeOv('markupOv')">&times;</button></h3><p style="font-size:12px;color:var(--muted);margin-bottom:12px">${esc(e.project)} / ${esc(e.level||'')} / ${esc(e.area||'')}</p>${mp.map((m,i)=>`<div class="fitem mitem"><a href="${m.url}" target="_blank" style="color:var(--info);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📐 ${esc(m.name)}</a> <span style="color:var(--muted);font-size:10px">by ${esc(m.uploaded_by||'?')}</span><button onclick="removeMarkup(${id},${i})">×</button></div>`).join('')}${!mp.length?'<p style="color:var(--muted);padding:14px 0">None yet.</p>':''}<button class="btn btn-sec btn-sm" onclick="uploadMarkup(${id});closeOv('markupOv')" style="margin-top:12px">+ Add Markup</button>`;$('markupOv').classList.add('show')}
async function removeMarkup(id,idx){
  confirmDialog('Remove Markup?','Remove this markup plan?','Remove','btn-err',async()=>{
    const e=entries.find(x=>x.id===id);const mp=JSON.parse(e.markup_plans||'[]');mp.splice(idx,1);
    await sb.from('entries').update({markup_plans:mp.length?JSON.stringify(mp):null}).eq('id',id);
    await auditLog({entry_id:id,action:'UPDATE',field_changed:'markup_plans',old_value:'Removed'});
    await loadEntries();renderDash();closeOv('markupOv')})}

/* ═══ DETAIL ═══ */
function showDetail(id){const e=entries.find(x=>x.id===id);if(!e)return;const mm=hasMismatch(e),mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  $('detailModal').innerHTML=`<h3>Entry Details<button class="modal-close" onclick="closeOv('detailOv')">&times;</button></h3>
${e.entry_type==='loose'?'<span class="pill pill-loose" style="margin-bottom:12px;display:inline-block">Ad Hoc</span> ':''}
${e.on_hold?'<span class="pill pill-onhold" style="margin-bottom:12px;display:inline-block;margin-left:0">⏸ ON HOLD</span>':''}
${e.unmatched?'<div class="warn-msg" style="margin-top:0;margin-bottom:12px">⚠ Unmatched entry — no placeholder existed when submitted</div>':''}
<div class="drow"><div class="dlbl">Project</div><div class="dval">${esc(e.project)}</div></div>
<div class="drow"><div class="dlbl">Level</div><div class="dval">${esc(e.level||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div></div>
<div class="drow"><div class="dlbl">Area</div><div class="dval">${esc(e.area||'—')}</div></div>
<div class="drow"><div class="dlbl">Schedule</div><div class="dval" style="font-family:'JetBrains Mono',monospace">${esc(e.schedule||'—')}</div></div>
<div class="drow"><div class="dlbl">Drawing</div><div class="dval">${esc(e.drawing_reference||'—')}</div></div>
<div class="drow"><div class="dlbl">Weight</div><div class="dval">${e.total_weight?e.total_weight+' T':'—'}</div></div>
<div class="drow"><div class="dlbl">Status</div><div class="dval">${getStatusPill(e.status,e.entry_type,e.on_hold)}</div></div>
${e.cancel_reason?`<div class="drow"><div class="dlbl">Cancel Reason</div><div class="dval" style="color:var(--err)">${esc(e.cancel_reason)}</div></div>`:''}
<div class="drow"><div class="dlbl">Ordered Delivery</div><div class="dval">${fmtDate(e.our_delivery_date)||'—'}</div></div>
<div class="drow"><div class="dlbl">Supplier Date</div><div class="dval">${fmtDate(e.supplier_delivery_date)||'—'}${mm?' ⚠️':''}</div></div>
<div class="drow"><div class="dlbl">Submitted</div><div class="dval">${fmtDate(e.entry_date)||'—'}</div></div>
<div class="drow"><div class="dlbl">Aus Reo Comments</div><div class="dval">${chunksToHtml(parseChunks(e.aus_reo_comment))}</div></div>
<div class="drow"><div class="dlbl">DBCC Comments</div><div class="dval">${chunksToHtml(parseChunks(e.dbcc_comment))}</div></div>
<div class="drow"><div class="dlbl">Schedule File</div><div class="dval">${e.file_url?`<a class="att-link" href="${e.file_url}" target="_blank">📄 ${esc(e.file_name)}</a>`:'None'}</div></div>
<div class="drow"><div class="dlbl">Markup Plans</div><div class="dval">${mp.length?mp.map(m=>`<a class="att-link markup-link" href="${m.url}" target="_blank">📐 ${esc(m.name)}</a>`).join(' '):'None'}</div></div>
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
  // Build the "Danger Zone" section that lets the user surgically delete:
  //   - the attached schedule only (schedule file + extracted data — keeps markup plans)
  //   - individual markup plans (one at a time, no impact on schedule)
  // Both kept separate so you can fix one without nuking the other.
  const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  const hasSchedule=!!(e.file_url||e.schedule);
  const hasMarkups=mp.length>0;
  let dangerSection='';
  if(hasSchedule||hasMarkups){
    dangerSection=`<div style="margin-top:18px;padding:12px 14px;background:#FFF8E7;border:1px solid #F0D785;border-radius:8px">
      <div style="font-size:12px;font-weight:700;color:var(--gray-dk);margin-bottom:8px">⚠ Danger Zone</div>`;
    if(hasSchedule){
      dangerSection+=`<div style="margin-bottom:${hasMarkups?'12':'0'}px;padding-bottom:${hasMarkups?'12':'0'}px;${hasMarkups?'border-bottom:1px solid #F0D785':''}">
        <div style="font-size:12px;font-weight:600;color:var(--gray-dk);margin-bottom:4px">Schedule</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:6px">${esc(e.schedule||e.file_name||'attached schedule')}</div>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.4">Clears the schedule file, schedule number, supplier date, drawing reference, and weight breakdown (bar / mesh / trench). Markup plans are NOT affected.</p>
        <button class="btn btn-err btn-sm" onclick="removeScheduleFromEntry(${id})" style="width:auto">Delete schedule only</button>
      </div>`;
    }
    if(hasMarkups){
      dangerSection+=`<div>
        <div style="font-size:12px;font-weight:600;color:var(--gray-dk);margin-bottom:6px">Markup Plans (${mp.length})</div>
        <p style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.4">Click × to remove a single file. The schedule is NOT affected.</p>
        ${mp.map((m,i)=>`<div style="display:flex;align-items:center;gap:8px;padding:6px 8px;background:#fff;border:1px solid #EFE8DA;border-radius:6px;margin-bottom:6px">
          <a href="${m.url}" target="_blank" style="flex:1;color:var(--info);font-size:12px;text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(m.name)}">📐 ${esc(m.name)}</a>
          <span style="color:var(--muted);font-size:10px;white-space:nowrap">by ${esc(m.uploaded_by||'?')}</span>
          <button class="btn btn-err btn-sm" onclick="removeMarkupFromEdit(${id},${i})" style="width:auto;padding:3px 9px;font-size:11px;flex-shrink:0" title="Delete this markup file">×</button>
        </div>`).join('')}
      </div>`;
    }
    dangerSection+='</div>';
  }
  $('editModal').innerHTML=`<h3>Edit Entry<button class="modal-close" onclick="closeOv('editOv')">&times;</button></h3>
<div class="fg"><label>Project</label><select id="ed_proj">${projects.map(p=>`<option${p.name===e.project?' selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
<div class="row2"><div class="fg"><label>Level</label><select id="ed_level"><option value="">None</option>${(proj?proj.levels:[]).map(l=>`<option${l===e.level?' selected':''}>${esc(l)}</option>`).join('')}</select></div><div class="fg"><label>Area</label><select id="ed_area"><option value="">None</option>${(proj?proj.areas:[]).map(a=>`<option${a===e.area?' selected':''}>${esc(a)}</option>`).join('')}</select></div></div>
<div class="row2"><div class="fg"><label>Schedule</label><input type="text" id="ed_sched" value="${esc(e.schedule||'')}" style="font-family:'JetBrains Mono',monospace"></div><div class="fg"><label>Submission Date</label><input type="date" id="ed_date" value="${e.entry_date||''}"></div></div>
<div class="row2"><div class="fg"><label>Ordered Delivery Date</label><input type="date" id="ed_ourD" value="${e.our_delivery_date||''}"></div><div class="fg"><label>Supplier Delivery Date</label><input type="date" id="ed_supD" value="${e.supplier_delivery_date||''}"></div></div>
<div class="row2"><div class="fg"><label>Drawing Reference</label><input type="text" id="ed_draw" value="${esc(e.drawing_reference||'')}"></div><div class="fg"><label>Weight (T)</label><input type="number" step="0.001" id="ed_wt" value="${e.total_weight||''}" style="font-family:'JetBrains Mono',monospace"></div></div>
<div class="fg"><label>Split Reference</label><input type="text" id="ed_split" value="${esc(e.split_reference||'')}"></div>
<div class="info-msg" style="margin-top:8px;font-size:12px;background:#F0F5FF;border-color:#C7D2FE;color:var(--info)">💡 Comments are now edited directly on the dashboard — click the Aus Reo Comments or DBCC Comments cell on the row.</div>
${dangerSection}
<div id="edErr"></div>
<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-sec btn-sm" onclick="closeOv('editOv')">Cancel</button><button class="btn btn-sm" onclick="saveEdit(${id})" style="width:auto">Save</button></div>`;
  $('editOv').classList.add('show');
  $('ed_proj').onchange=()=>{const pn=$('ed_proj').value,p=projects.find(x=>x.name===pn);$('ed_level').innerHTML='<option value="">None</option>'+(p?p.levels.map(l=>`<option>${esc(l)}</option>`).join(''):'');$('ed_area').innerHTML='<option value="">None</option>'+(p?p.areas.map(a=>`<option>${esc(a)}</option>`).join(''):'')}}

function removeScheduleFromEntry(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  confirmDialog(
    'Remove Schedule?',
    'This will clear the schedule file, schedule number, supplier date, drawing reference, and weight breakdown for:<br><br><b>'+esc(e.project)+'</b> / '+esc(e.level||'—')+' / '+esc(e.area||'—')+(e.schedule?' · '+esc(e.schedule):'')+'<br><br>Markup plans, comments, and dispute status will be kept. The placeholder entry will remain so a new schedule can be attached. This cannot be undone.',
    'Remove Schedule',
    'btn-err',
    async()=>{
      const newStatus=e.our_delivery_date?'Ordered':'Not Ordered';
      // Clear schedule fields and the extraction breakdown. Explicitly DO NOT clear:
      //   markup_plans, sf_comment, sf_dispute, installed_date — those survive a re-upload.
      // Also clear extraction_method so the 🔍 OCR badge disappears with the old data.
      const{error}=await sb.from('entries').update({
        schedule:null,file_url:null,file_name:null,
        supplier_delivery_date:null,drawing_reference:null,total_weight:null,
        bar_weight:null,mesh_sqm:null,trench_mesh_lm:null,
        starter_weight:null,recon_status:null,recon_diff:null,recon_reason:null,recon_reviewed:false,recon_reviewed_by:null,
        extraction_method:null,
        status:newStatus,mismatch_resolved:true
      }).eq('id',id);
      if(error){alert('Error: '+error.message);return}
      await auditLog({entry_id:id,action:'UPDATE',field_changed:'schedule_removed',old_value:e.schedule||e.file_name||'',new_value:'cleared'});
      closeOv('editOv');await loadEntries();renderDash()})}

// Remove a single markup plan from inside the Edit modal. Re-opens the modal afterwards
// so the user can continue editing or remove additional markups without re-navigating.
async function removeMarkupFromEdit(id,idx){
  const e=entries.find(x=>x.id===id);if(!e)return;
  const mp=JSON.parse(e.markup_plans||'[]');
  if(idx<0||idx>=mp.length)return;
  const fileName=mp[idx].name||'(unnamed)';
  confirmDialog(
    'Remove Markup?',
    'Remove this markup plan?<br><br><b>📐 '+esc(fileName)+'</b><br><br>The schedule and other markup plans will not be affected. This cannot be undone.',
    'Remove',
    'btn-err',
    async()=>{
      mp.splice(idx,1);
      const{error}=await sb.from('entries').update({markup_plans:mp.length?JSON.stringify(mp):null}).eq('id',id);
      if(error){alert('Error: '+error.message);return}
      await auditLog({entry_id:id,action:'UPDATE',field_changed:'markup_plans',old_value:'Removed: '+fileName,new_value:mp.length+' remaining'});
      await loadEntries();renderDash();
      // Re-open the edit modal so further markups can be removed in one go
      openEditEntry(id);
    })}

async function saveEdit(id){const e=entries.find(x=>x.id===id);if(!e)return;const err=$('edErr');err.innerHTML='';
  const nv={project:$('ed_proj').value,level:$('ed_level').value||null,area:$('ed_area').value||null,schedule:$('ed_sched').value.trim()||null,entry_date:$('ed_date').value||null,our_delivery_date:$('ed_ourD').value||null,supplier_delivery_date:$('ed_supD').value||null,drawing_reference:$('ed_draw').value.trim()||null,total_weight:$('ed_wt').value?parseFloat($('ed_wt').value):null,split_reference:$('ed_split').value.trim()||null};
  if(!nv.project)return err.innerHTML='<div class="error-msg">Project required</div>';
  if(e.status==='Not Ordered'&&nv.our_delivery_date)nv.status='Ordered';
  if((e.status==='Not Ordered'||e.status==='Ordered')&&nv.schedule)nv.status='Scheduled';
  if(nv.our_delivery_date&&nv.supplier_delivery_date&&nv.our_delivery_date!==nv.supplier_delivery_date&&(e.our_delivery_date!==nv.our_delivery_date||e.supplier_delivery_date!==nv.supplier_delivery_date)){nv.mismatch_resolved=false}
  const ch=[];['project','level','area','schedule','entry_date','our_delivery_date','supplier_delivery_date','drawing_reference','total_weight','split_reference'].forEach(k=>{if(String(e[k]||'')!==String(nv[k]||''))ch.push({field:k,old:e[k]||'',new:nv[k]||''})});
  if(!ch.length){closeOv('editOv');return}
  const{error}=await sb.from('entries').update(nv).eq('id',id);if(error)return err.innerHTML='<div class="error-msg">'+esc(error.message)+'</div>';
  await sb.from('audit_log').insert(ch.map(c=>({entry_id:id,action:'UPDATE',field_changed:c.field,old_value:String(c.old),new_value:String(c.new),user_identifier:userName})));
  closeOv('editOv');await loadEntries();renderDash();
  // Prompt for delivery date change notification
  const ourChanged=ch.find(c=>c.field==='our_delivery_date');
  if(ourChanged){setTimeout(()=>confirmDialog('Delivery Date Changed','Ordered delivery date changed from <b>'+(fmtDate(ourChanged.old)||'not set')+'</b> to <b>'+(fmtDate(ourChanged.new)||'not set')+'</b>.<br><br>Send notification email?','Send Email','',()=>openDateChangeEmail(id,ourChanged.old,ourChanged.new)),200)}}

async function deleteEntry(id){
  if(!adminUnlocked)return;
  confirmDialog('Delete Permanently?','This cannot be undone. Delete this entry?','Delete','btn-err',async()=>{
    const e=entries.find(x=>x.id===id);
    await sb.from('entries').delete().eq('id',id);
    if(e)await auditLog({entry_id:id,action:'DELETE',old_value:`${e.project}/${e.schedule||'LOOSE'}`});
    closeOv('detailOv');await loadEntries();renderDash()})}

/* ═══ EMAIL DRAFTS ═══ */
function emailModal(subject,body,entryId,auditContext){
  const def=emailContacts.find(c=>c.is_default);
  const others=emailContacts.filter(c=>!c.is_default);
  const toVal=def?def.email:'';
  const ccCheckboxes=others.length
    ? `<div style="display:flex;flex-direction:column;gap:6px;background:var(--input);border:1px solid var(--border);border-radius:6px;padding:10px 12px">${others.map((c,i)=>`<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--gray-dk);cursor:pointer"><input type="checkbox" class="em_cc_box" data-email="${esc(c.email)}" style="width:auto"> <b>${esc(c.label)}</b> <span style="color:var(--muted);font-family:'JetBrains Mono',monospace;font-size:11px">${esc(c.email)}</span></label>`).join('')}</div>`
    : '<p style="font-size:11px;color:var(--muted);margin:0;font-style:italic">No additional contacts saved. Add them in Admin → Email Contacts.</p>';
  $('emailModal').innerHTML=`<h3>Send Email<button class="modal-close" onclick="closeOv('emailOv')">&times;</button></h3>
<div class="fg"><label>To</label><input type="email" id="em_to" value="${esc(toVal)}" placeholder="orders@ausreo.com.au"></div>
<div class="fg"><label>CC <span style="font-weight:400;color:var(--muted);font-size:11px">(tick to include, or add custom below)</span></label>${ccCheckboxes}<input type="text" id="em_cc_extra" placeholder="Add another email (optional)" style="margin-top:6px"></div>
<div class="fg"><label>Subject</label><input type="text" id="em_sub" value="${esc(subject)}"></div>
<div class="fg"><label>Message</label><textarea id="em_body" rows="12" style="font-size:13px">${esc(body)}</textarea></div>
<p style="font-size:11px;color:var(--muted);margin-top:4px">Clicking Send will open your default email app (Outlook, Gmail, etc.) with the message pre-filled. Review and hit Send in your email app.</p>
<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('emailOv')">Cancel</button><button class="btn btn-purple btn-sm" onclick="sendEmail(${entryId},'${esc(auditContext)}')" style="width:auto">✉ Open in Email</button></div>`;$('emailOv').classList.add('show')}

function openMismatchEmail(id){const e=entries.find(x=>x.id===id);if(!e)return;
  const subject=`Date Mismatch — ${e.project} / ${e.level||''} / ${e.area||''}`;
  const body=`Hi,\n\nThere is a date mismatch on the following schedule:\n\nProject: ${e.project}\nLevel: ${e.level||'—'} / Area: ${e.area||'—'}${e.split_reference?' ('+e.split_reference+')':''}\nSchedule: ${e.schedule||'—'}\n\nOur Ordered Delivery Date: ${fmtDate(e.our_delivery_date)||'Not set'}\nYour Supplier Delivery Date: ${fmtDate(e.supplier_delivery_date)||'Not set'}\n\nPlease confirm the correct date.${EMAIL_FOOTER_TEXT}\n\nRegards,\n${userName}\nDebono Bros Concreting`;
  emailModal(subject,body,id,'mismatch')}

function openDateChangeEmail(id,oldD,newD){const e=entries.find(x=>x.id===id);if(!e)return;
  const subject=`Delivery Date Change — ${e.project} / ${e.level||''} / ${e.area||''}`;
  const body=`Hi,\n\nOur ordered delivery date has been updated for the following:\n\nProject: ${e.project}\nLevel: ${e.level||'—'} / Area: ${e.area||'—'}${e.split_reference?' ('+e.split_reference+')':''}\nSchedule: ${e.schedule||'—'}\n\nPrevious Date: ${fmtDate(oldD)||'Not set'}\nNew Date: ${fmtDate(newD)||'Not set'}\n\nPlease confirm receipt and the revised supplier delivery date.${EMAIL_FOOTER_TEXT}\n\nRegards,\n${userName}\nDebono Bros Concreting`;
  emailModal(subject,body,id,'date_change')}

function openHoldEmail(id){const e=entries.find(x=>x.id===id);if(!e)return;
  const subject=`ON HOLD — ${e.project} / ${e.level||''} / ${e.area||''}`;
  const body=`Hi,\n\nThe following schedule has been placed ON HOLD:\n\nProject: ${e.project}\nLevel: ${e.level||'—'} / Area: ${e.area||'—'}${e.split_reference?' ('+e.split_reference+')':''}\nSchedule: ${e.schedule||'—'}\nOrdered Delivery Date: ${fmtDate(e.our_delivery_date)||'Not set'}\n\nPlease pause any processing on this item until further notice. We will confirm when the hold is lifted.${EMAIL_FOOTER_TEXT}\n\nRegards,\n${userName}\nDebono Bros Concreting`;
  emailModal(subject,body,id,'on_hold')}

async function sendEmail(id,context){
  const to=$('em_to').value.trim(),sub=$('em_sub').value.trim(),body=$('em_body').value.trim();
  if(!to)return alert('Enter recipient');
  // Gather CC list from checkboxes + manual extra
  const ccEmails=[];
  document.querySelectorAll('.em_cc_box:checked').forEach(b=>{const e=b.getAttribute('data-email');if(e)ccEmails.push(e)});
  const extra=($('em_cc_extra')&&$('em_cc_extra').value||'').trim();
  if(extra)ccEmails.push(extra);
  const cc=ccEmails.join(',');
  // IMPORTANT: log the audit entry BEFORE opening the mailto URL.
  // Some browsers (mobile especially) suspend or unfocus the page when mailto: triggers
  // the OS email handler, which can drop the audit log insert if it runs after.
  // Doing the insert first guarantees the notification timeline gets the entry.
  const auditNote='To: '+to+(cc?' · CC: '+cc:'')+' — '+sub;
  try{await auditLog({entry_id:id,action:'EMAIL_SENT',field_changed:context,new_value:auditNote})}
  catch(e){console.warn('[REO] email audit log failed:',e.message)}
  let url=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
  if(cc)url+=`&cc=${encodeURIComponent(cc)}`;
  window.open(url,'_blank');
  closeOv('emailOv')}

/* ═══ EXPORT ═══ */
function exportCSV(){const d=getFiltered();if(!d.length)return alert('No data');
  const h=['Project','Level','Area','Split','Schedule','Drawing','Weight','Status','On Hold','Type','Ordered Delivery','Supplier Date','Submitted','Aus Reo Comments','DBCC Comments','File'];
  const rows=d.map(e=>[e.project,e.level||'',e.area||'',e.split_reference||'',e.schedule||'',e.drawing_reference||'',e.total_weight||'',e.status,e.on_hold?'Yes':'',e.entry_type,e.our_delivery_date||'',e.supplier_delivery_date||'',e.entry_date||'',chunksToPlain(parseChunks(e.aus_reo_comment))||e.comments||'',chunksToPlain(parseChunks(e.dbcc_comment))||'',e.file_name||'']);
  const csv=[h,...rows].map(r=>r.map(c=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`reo-${today()}.csv`;a.click()}

/* ═══ NAV ═══ */
function showPage(p){
  document.querySelectorAll('.page').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(el=>el.classList.remove('active'));
  $({form:'pageForm',dash:'pageDash',notif:'pageNotif',admin:'pageAdmin'}[p]).classList.add('active');
  $({form:'tabForm',dash:'tabDash',notif:'tabNotif',admin:'tabAdmin'}[p]).classList.add('active');
  if(p==='form'){
    // Refresh today's date — fixes the issue where the value was set at init time and never updated
    const inpD=$('inpDate'),inpL=$('inpLooseDate');
    if(inpD&&!editingId)inpD.value=today();
    if(inpL&&!editingId)inpL.value=today()}
  if(p==='dash')renderDash();
  if(p==='notif')loadNotifications();
  if(p==='admin'&&adminUnlocked)showAdminSub('proj')}

/* ═══ NOTIFICATIONS TAB ═══ */
const NOTIF_ACTIONS=['CREATE','UPDATE','CANCEL','REINSTATE','EMAIL_SENT','ON_HOLD','MISMATCH_RESOLVED','BULK_CREATE'];
const DELIVERY_FIELDS=['our_delivery_date','supplier_delivery_date','status','schedule_attached'];

async function loadNotifications(){
  const el=$('notifList');el.innerHTML='<div class="empty"><p>Loading...</p></div>';
  // Determine which actions to fetch based on the active type filter. When a specific filter
  // is selected we query the DB for JUST that action type — otherwise the 500-row limit (which
  // loads the 500 most-recent events of ALL types) would hide older emails / mismatches / bulk
  // creates behind a wall of more-frequent UPDATE rows. This was the "filters show nothing" bug.
  const ft=$('nfType')?$('nfType').value:'';
  let q=sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(500);
  if(ft==='SCHEDULE_UPLOAD'){
    // Schedule uploads = UPDATE/schedule_attached OR CREATE (unmatched). Fetch both action types,
    // then narrow to schedule-upload rows in renderNotif via isScheduleUpload().
    q=sb.from('audit_log').select('*').in('action',['UPDATE','CREATE']).order('created_at',{ascending:false}).limit(500);
  }else if(ft){
    q=sb.from('audit_log').select('*').eq('action',ft).order('created_at',{ascending:false}).limit(500);
  }else{
    q=sb.from('audit_log').select('*').in('action',NOTIF_ACTIONS).order('created_at',{ascending:false}).limit(500);
  }
  const{data,error}=await q;
  if(error){el.innerHTML='<div class="empty"><p>Error loading notifications</p></div>';return}
  window._notifData=data;renderNotif()}

// Action-Required pinned section at the top of the Notifications tab.
// Lists currently-actionable items: mismatches, unmatched, overdue installs, late deliveries.
// Hidden when there's nothing to action.
function renderActionRequired(){
  const card=$('actionRequiredCard'),list=$('actionRequiredList'),cnt=$('arCount');
  if(!card||!list)return;
  const mismatches=entries.filter(e=>hasMismatch(e)&&e.status!=='Cancelled');
  const unmatched=entries.filter(e=>e.unmatched&&e.status!=='Cancelled');
  const lateDel=entries.filter(e=>isLateDelivery(e));
  const overdueInst=entries.filter(e=>isOverdueInstall(e));
  const total=mismatches.length+unmatched.length+lateDel.length+overdueInst.length;
  if(total===0){card.style.display='none';return}
  card.style.display='block';
  cnt.textContent=total+' total';
  // Helper to render a row showing project / level / area / schedule
  const row=e=>{
    const ctx=`<b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' <span style="color:var(--accent-dk);font-size:11px">('+esc(e.split_reference)+')</span>':''}${e.schedule?' · <span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:var(--accent-dk)">'+esc(e.schedule)+'</span>':''}`;
    return `<div onclick="showDetail(${e.id})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:6px;cursor:pointer;font-size:12px;line-height:1.4;border:1px solid #f0ebe1;margin-bottom:5px;background:#fff" onmouseover="this.style.background='#FEF6E5'" onmouseout="this.style.background='#fff'"><div style="flex:1">${ctx}</div></div>`;
  };
  let html='';
  if(mismatches.length){
    html+=`<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:600;color:var(--warn-dk);margin-bottom:6px">⚠ ${mismatches.length} mismatched (date conflict needs reconciling)</div>`;
    mismatches.slice(0,5).forEach(e=>{
      const days=daysAgo(e.entry_date)||0;
      html+=row(e).replace('</div></div>',`</div><span style="font-size:11px;color:var(--muted);white-space:nowrap">${days}d open</span></div>`);
    });
    if(mismatches.length>5)html+=`<div style="font-size:11px;color:var(--muted);padding:4px 10px"><a onclick="showPage('dash');setTimeout(()=>{const f=document.getElementById('fM');if(f){f.value='mismatch';f.dispatchEvent(new Event('change'))}},80)" style="color:var(--accent-dk);cursor:pointer;text-decoration:underline">+${mismatches.length-5} more — view in Dashboard</a></div>`;
    html+='</div>';
  }
  if(unmatched.length){
    html+=`<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:600;color:#cc7a00;margin-bottom:6px">⚠ ${unmatched.length} unmatched (schedule uploaded with no placeholder)</div>`;
    unmatched.slice(0,5).forEach(e=>{
      const days=daysAgo(e.entry_date)||0;
      html+=row(e).replace('</div></div>',`</div><span style="font-size:11px;color:var(--muted);white-space:nowrap">${days}d open</span></div>`);
    });
    if(unmatched.length>5)html+=`<div style="font-size:11px;color:var(--muted);padding:4px 10px"><a onclick="showPage('dash');setTimeout(()=>{const f=document.getElementById('fM');if(f){f.value='unmatched';f.dispatchEvent(new Event('change'))}},80)" style="color:var(--accent-dk);cursor:pointer;text-decoration:underline">+${unmatched.length-5} more — view in Dashboard</a></div>`;
    html+='</div>';
  }
  if(lateDel.length){
    html+=`<div style="margin-bottom:14px"><div style="font-size:12px;font-weight:600;color:var(--err);margin-bottom:6px">⚠ ${lateDel.length} late delivery (supplier date passed, not marked Delivered)</div>`;
    lateDel.slice(0,5).forEach(e=>{
      const days=daysAgo(e.supplier_delivery_date)||0;
      html+=row(e).replace('</div></div>',`</div><span style="font-size:11px;color:var(--err);white-space:nowrap;font-weight:600">${days}d late</span></div>`);
    });
    if(lateDel.length>5)html+=`<div style="font-size:11px;color:var(--muted);padding:4px 10px">+${lateDel.length-5} more — view in Dashboard</div>`;
    html+='</div>';
  }
  if(overdueInst.length){
    const N=appSettings.overdue_install_days||3;
    html+=`<div><div style="font-size:12px;font-weight:600;color:#7a4d00;margin-bottom:6px">⏱ ${overdueInst.length} overdue install (more than ${N} days since delivery, not marked installed)</div>`;
    overdueInst.slice(0,5).forEach(e=>{
      const days=daysAgo(e.supplier_delivery_date)||0;
      html+=row(e).replace('</div></div>',`</div><span style="font-size:11px;color:#7a4d00;white-space:nowrap;font-weight:600">${days}d ago</span></div>`);
    });
    if(overdueInst.length>5)html+=`<div style="font-size:11px;color:var(--muted);padding:4px 10px">+${overdueInst.length-5} more</div>`;
    html+='</div>';
  }
  list.innerHTML=html;
}

function renderNotif(){
  // Always refresh the action-required pinned section first.
  renderActionRequired();
  const data=window._notifData||[];const el=$('notifList');
  const ft=$('nfType').value,fp=$('nfProj').value,fq=$('nfSearch').value.toLowerCase().trim();
  // Build entry map for project lookup
  const em={};entries.forEach(e=>em[e.id]=e);
  // Helper: is this audit log entry a schedule upload?
  // Two cases: UPDATE/schedule_attached (attach to existing placeholder) or CREATE with
  // new_value starting "UNMATCHED:" (a fresh entry created via the unmatched-upload flow).
  const isScheduleUpload=a=>(a.action==='UPDATE'&&a.field_changed==='schedule_attached')||(a.action==='CREATE'&&typeof a.new_value==='string'&&a.new_value.startsWith('UNMATCHED:'));
  let list=data.slice();
  if(ft==='SCHEDULE_UPLOAD'){
    // Pseudo-filter — not a single action type, matches both attach + unmatched-create.
    list=list.filter(isScheduleUpload);
  }else if(ft){
    list=list.filter(a=>a.action===ft);
  }
  // Only keep UPDATE actions that are delivery-related (skip noise like comment edits)
  list=list.filter(a=>a.action!=='UPDATE'||DELIVERY_FIELDS.includes(a.field_changed)||!a.field_changed);
  if(fp)list=list.filter(a=>{const e=em[a.entry_id];return e&&e.project===fp});
  if(fq)list=list.filter(a=>{const e=em[a.entry_id];const hay=[a.action,a.field_changed,a.old_value,a.new_value,a.user_identifier,e?e.project:'',e?e.level:'',e?e.area:''].join(' ').toLowerCase();return hay.includes(fq)});
  if(!list.length){el.innerHTML='<div class="empty"><p>No notifications match.</p></div>';return}
  el.innerHTML=list.map(a=>{
    const e=em[a.entry_id];const ctx=e?`<b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.schedule?' <span style="font-family:\'JetBrains Mono\',monospace;color:var(--accent-dk)">'+esc(e.schedule)+'</span>':''}`:'';
    let icon='update',iconChar='✎',msg='';
    if(a.action==='CREATE'){
      // Distinguish a "schedule was uploaded as unmatched" from other creates so the user
      // can scan for upload events at a glance. The new_value string is set in the submit
      // handler to "UNMATCHED: project/level (split)/SCHEDULE_CODE".
      if(typeof a.new_value==='string'&&a.new_value.startsWith('UNMATCHED:')){
        icon='create';iconChar='📎';
        const sched=a.new_value.split('/').pop()||'';
        msg=`Schedule uploaded (unmatched): <b>${esc(sched)}</b> — ${ctx}`;
      }else{
        icon='create';iconChar='+';
        msg=`New entry created — ${ctx}`;
      }
    }
    else if(a.action==='BULK_CREATE'){icon='create';iconChar='⚡';msg=`<b>Bulk create:</b> ${esc(a.new_value)}`}
    else if(a.action==='UPDATE'&&a.field_changed==='our_delivery_date'){icon='update';iconChar='📅';msg=`Ordered delivery date changed from <b>${fmtDate(a.old_value)||'not set'}</b> to <b>${fmtDate(a.new_value)||'not set'}</b> — ${ctx}`}
    else if(a.action==='UPDATE'&&a.field_changed==='supplier_delivery_date'){icon='update';iconChar='📅';msg=`Supplier delivery date changed from <b>${fmtDate(a.old_value)||'not set'}</b> to <b>${fmtDate(a.new_value)||'not set'}</b> — ${ctx}`}
    else if(a.action==='UPDATE'&&a.field_changed==='schedule_attached'){icon='create';iconChar='📎';msg=`Schedule attached: <b>${esc(a.new_value)}</b> — ${ctx}`}
    else if(a.action==='UPDATE'&&a.field_changed==='status'){icon='update';iconChar='⇄';msg=`Status changed from <b>${esc(a.old_value)}</b> to <b>${esc(a.new_value)}</b> — ${ctx}`}
    else if(a.action==='UPDATE'){icon='update';iconChar='✎';msg=`Updated <b>${esc(a.field_changed||'entry')}</b> — ${ctx}`}
    else if(a.action==='CANCEL'){icon='cancel';iconChar='✗';msg=`<b>Cancelled</b> — ${ctx}${a.new_value?' <span style="color:var(--muted)">('+esc(a.new_value)+')</span>':''}`}
    else if(a.action==='REINSTATE'){icon='resolve';iconChar='↺';msg=`<b>Reinstated</b> — ${ctx}`}
    else if(a.action==='EMAIL_SENT'){icon='email';iconChar='✉';msg=`<b>Email sent</b> — ${esc(a.new_value)}${ctx?' — '+ctx:''}`}
    else if(a.action==='ON_HOLD'){icon='hold';iconChar='⏸';msg=`<b>${a.new_value==='true'?'Put ON HOLD':'Hold released'}</b> — ${ctx}`}
    else if(a.action==='MISMATCH_RESOLVED'){icon='resolve';iconChar='✓';msg=`<b>Mismatch resolved</b> — ${ctx}`}
    const t=new Date(a.created_at).toLocaleString('en-AU');
    return `<div class="notif-item"><div class="notif-icon ${icon}">${iconChar}</div><div class="notif-body"><div class="notif-time">${t}<span class="audit-user">${esc(a.user_identifier||'?')}</span></div><div class="notif-msg">${msg}</div></div></div>`}).join('')}

/* ═══ ADMIN ═══ */
function checkPin(){
  if($('pinInp').value===ADMIN_PIN){adminUnlocked=true;$('pinGate').style.display='none';$('adminContent').style.display='block';showAdminSub('proj');$('pinInp').value='';$('pinErr').innerHTML=''}
  else{$('pinErr').innerHTML='<div class="error-msg">Wrong PIN</div>';$('pinInp').value=''}}
function lockAdmin(){adminUnlocked=false;$('pinGate').style.display='block';$('adminContent').style.display='none'}
function showAdminSub(s){['proj','program','fixers','people','assign','account','contacts','audit'].forEach(t=>{
  const tab=$('at'+t.charAt(0).toUpperCase()+t.slice(1));if(tab)tab.classList.toggle('active',t===s);
  const panel=$('admin'+t.charAt(0).toUpperCase()+t.slice(1));if(panel)panel.style.display=t===s?'block':'none'});
  if(s==='proj')renderAdminProj();if(s==='program')renderAdminProgram();if(s==='fixers')renderAdminFixers();
  if(s==='people')renderAdminPeople();if(s==='assign')renderAdminAssign();if(s==='account')renderAdminAccount();
  if(s==='contacts')renderAdminContacts();if(s==='audit')loadAuditLog()}

/* ═══ ADMIN: PROJECTS ═══ */
function renderAdminProj(){
  $('adminProj').innerHTML=`<div class="card" style="margin-bottom:18px"><h3 style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--gray-dk)" id="aFormTitle">Add New Project</h3><div class="fg"><label>Project Name</label><input type="text" id="newProjName" placeholder="e.g. New School Stage 2"></div><div class="row2"><div class="fg"><label>Levels <span style="font-weight:400;color:var(--muted);font-size:11px">(one per line)</span></label><textarea id="newLevels" rows="6" style="font-family:'JetBrains Mono',monospace;font-size:12px"></textarea></div><div class="fg"><label>Areas <span style="font-weight:400;color:var(--muted);font-size:11px">(one per line)</span></label><textarea id="newAreas" rows="6" style="font-family:'JetBrains Mono',monospace;font-size:12px"></textarea></div></div><div style="display:flex;gap:10px;margin-top:14px"><button class="btn btn-sm" onclick="saveProject()" id="saveProjBtn" style="width:auto">Add Project</button><button class="btn btn-sec btn-sm" onclick="cancelPE()" id="cancelPE" style="display:none;width:auto">Cancel</button></div><div id="projErr"></div></div><div class="card"><h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--gray-dk)">Projects (<span id="projCount">${projects.length}</span>)</h3><div class="proj-list" id="projList"></div></div>`;renderProjList()}

function renderProjList(){$('projCount').textContent=projects.length;
  $('projList').innerHTML=projects.length?projects.map(p=>`<div class="proj-item"><div class="proj-item-info"><h4>${esc(p.name)}</h4><div class="counts"><b>${p.levels.length}</b> levels · <b>${p.areas.length}</b> areas</div><div class="sum">${esc(p.levels.slice(0,6).join(', '))}</div></div><div class="proj-actions"><button class="btn btn-sec btn-sm" onclick="editProj(${p.id})">Edit</button><button class="btn btn-err btn-sm" onclick="deleteProj(${p.id})">Delete</button></div></div>`).join(''):'<div class="empty">No projects</div>'}

function editProj(id){const p=projects.find(pr=>pr.id===id);if(!p)return;editingId=id;$('aFormTitle').textContent='Edit Project';$('newProjName').value=p.name;$('newLevels').value=p.levels.join('\n');$('newAreas').value=p.areas.join('\n');$('saveProjBtn').textContent='Save';$('cancelPE').style.display='inline-block'}
function cancelPE(){editingId=null;$('aFormTitle').textContent='Add New Project';$('newProjName').value='';$('newLevels').value='';$('newAreas').value='';$('saveProjBtn').textContent='Add Project';$('cancelPE').style.display='none';$('projErr').innerHTML=''}

async function saveProject(){const err=$('projErr');err.innerHTML='';
  const name=$('newProjName').value.trim(),levels=$('newLevels').value.split('\n').map(s=>s.trim()).filter(Boolean),areas=$('newAreas').value.split('\n').map(s=>s.trim()).filter(Boolean);
  if(!name)return err.innerHTML='<div class="error-msg">Name required</div>';
  const data={name,levels:levels.join('||'),areas:areas.join('||')};
  if(editingId){const old=projects.find(p=>p.id===editingId);const{error}=await sb.from('projects').update(data).eq('id',editingId);if(error)return err.innerHTML='<div class="error-msg">'+esc(error.message)+'</div>';
    await auditLog({action:'PROJECT_EDIT',field_changed:name,old_value:`${old.name} (${old.levels.length}L)`,new_value:`${name} (${levels.length}L)`});
  }else{if(projects.find(p=>p.name.toLowerCase()===name.toLowerCase()))return err.innerHTML='<div class="error-msg">Already exists</div>';
    const{error}=await sb.from('projects').insert(data);if(error)return err.innerHTML='<div class="error-msg">'+esc(error.message)+'</div>';
    await auditLog({action:'PROJECT_ADD',new_value:`${name} (${levels.length}L/${areas.length}A)`})}
  cancelPE();await loadProjects();populateDropdowns();renderProjList()}

function deleteProj(id){const p=projects.find(pr=>pr.id===id);if(!p)return;
  confirmDialog('Delete Project?','Delete "'+esc(p.name)+'"? Existing entries will not be affected.','Delete','btn-err',async()=>{
    await sb.from('projects').delete().eq('id',id);await auditLog({action:'PROJECT_DELETE',old_value:p.name});
    await loadProjects();populateDropdowns();renderProjList()})}

/* ═══ ADMIN: DELIVERY PROGRAM ═══ */
function renderAdminProgram(){
  $('adminProgram').innerHTML=`<div class="card" style="margin-bottom:20px"><div class="fg"><label>Select Project</label><select id="dpProj" onchange="onDpProjChange()"><option value="">Choose...</option>${projects.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></div></div><div id="dpContent" style="display:none"><div class="card" style="margin-bottom:20px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px"><div><h3 style="font-size:15px;font-weight:700;color:var(--gray-dk);margin-bottom:2px">Level / Area Grid</h3><p style="font-size:12px;color:var(--muted)">Tick empty cells to create placeholders. Click a green cell with a number to add another (e.g. for split pours).</p></div><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="dpSelectAll()">Select All</button><button class="btn btn-ghost btn-sm" onclick="dpClearAll()">Clear</button></div></div><div class="grid-wrap" id="dpGridWrap"></div></div><div id="dpSelArea" style="display:none"><div class="card"><h3 style="font-size:15px;font-weight:700;color:var(--gray-dk);margin-bottom:4px">Selected (<span id="dpSelCount">0</span>)</h3><p style="font-size:12px;color:var(--muted);margin-bottom:14px">Set splits and per-delivery dates.</p><div id="dpSelList"></div><button class="btn" onclick="dpCreate()" id="dpCreateBtn">Create Placeholder Entries</button><div id="dpErr"></div><div id="dpSuc"></div></div></div></div>`}

function onDpProjChange(){dpSelected={};const p=$('dpProj').value;$('dpContent').style.display=p?'block':'none';if(p)renderDpGrid()}
function renderDpGrid(){const pn=$('dpProj').value,proj=projects.find(p=>p.name===pn);if(!proj)return;
  const pe=entries.filter(e=>e.project===pn);
  let h='<table class="grid-table"><thead><tr><th class="corner-th">Level \\ Area</th>';
  proj.areas.forEach(a=>{h+=`<th class="area-th" title="${esc(a)}">${esc(a)}</th>`});
  h+='</tr></thead><tbody>';
  proj.levels.forEach(lv=>{h+=`<tr><td class="level-td">${esc(lv)}</td>`;
    proj.areas.forEach(ar=>{const k=lv+'||'+ar,ex=pe.filter(e=>e.level===lv&&e.area===ar),ck=dpSelected[k];
      // Existing cell — clickable to ADD MORE placeholders (split pours, additional parts).
      // Empty cell — clickable to create FIRST placeholder.
      // 'add-more' class layered on 'has-entry' shows that the user is adding another to existing.
      let cls='grid-cell';
      let inner='';
      let title='';
      if(ex.length){
        cls+=' has-entry';
        if(ck)cls+=' add-more';
        inner=ck?String(ex.length+ck.splits.length):String(ex.length);
        title=ck?`${ex.length} exist · adding ${ck.splits.length} more`:`${ex.length} placeholder${ex.length>1?'s':''} exist · click to add another`;
      }else{
        if(ck)cls+=' checked';
        title=ck?'Selected — click to deselect':'Click to create a placeholder';
      }
      h+=`<td><div class="${cls}" onclick="toggleDp('${k.replace(/'/g,"\\'")}')" title="${esc(title)}">${inner}</div></td>`});h+='</tr>'});
  h+='</tbody></table>';$('dpGridWrap').innerHTML=h;renderDpSel()}

function toggleDp(k){if(dpSelected[k])delete dpSelected[k];else dpSelected[k]={splits:[{label:'',date:''}]};renderDpGrid()}
function dpSelectAll(){const pn=$('dpProj').value,proj=projects.find(p=>p.name===pn);if(!proj)return;
  const pe=entries.filter(e=>e.project===pn);proj.levels.forEach(lv=>{proj.areas.forEach(ar=>{const k=lv+'||'+ar;if(!pe.some(e=>e.level===lv&&e.area===ar)&&!dpSelected[k])dpSelected[k]={splits:[{label:'',date:''}]}})});renderDpGrid()}
function dpClearAll(){dpSelected={};renderDpGrid()}

function renderDpSel(){const keys=Object.keys(dpSelected);$('dpSelArea').style.display=keys.length?'block':'none';
  if(!keys.length)return;const total=keys.reduce((s,k)=>s+dpSelected[k].splits.length,0);$('dpSelCount').textContent=total;
  const pn=$('dpProj').value,pe=entries.filter(e=>e.project===pn);
  let html='';keys.sort().forEach(k=>{const[lv,ar]=k.split('||'),sel=dpSelected[k];
    // How many placeholders already exist for this Level/Area? Used to show a hint and to
    // suggest sensible default split labels for the new ones being added.
    const existCount=pe.filter(e=>e.level===lv&&e.area===ar).length;
    const titleSuffix=existCount?` <span style="font-size:11px;color:var(--accent-dk);font-weight:600">(adding to ${existCount} existing)</span>`:'';
    html+=`<div class="sel-item"><div class="sel-item-header"><div class="sel-item-title">${esc(lv)} / ${esc(ar)}${titleSuffix}</div><div class="sel-item-controls"><button onclick="dpRemSplit('${k.replace(/'/g,"\\'")}')">−</button><span>${sel.splits.length}</span><button onclick="dpAddSplit('${k.replace(/'/g,"\\'")}')">+</button><button onclick="delete dpSelected['${k.replace(/'/g,"\\'")}'];renderDpGrid()" style="color:var(--err);border-color:#f5c6c6">×</button></div></div>`;
    sel.splits.forEach((sp,i)=>{
      // Placeholder text for the label input. If we're adding to existing, suggest the next Part number.
      const ph=existCount>0?'Part '+(existCount+i+1)+' (recommended)':(sel.splits.length>1?'Part '+(i+1):'No split');
      html+=`<div class="split-row"><input type="text" value="${esc(sp.label)}" placeholder="${ph}" onchange="dpSelected['${k.replace(/'/g,"\\'")}'].splits[${i}].label=this.value"><input type="date" value="${sp.date||''}" onchange="dpSelected['${k.replace(/'/g,"\\'")}'].splits[${i}].date=this.value">${sel.splits.length>1?`<button class="remove-split" onclick="dpSelected['${k.replace(/'/g,"\\'")}'].splits.splice(${i},1);renderDpSel()">×</button>`:'<span style="width:24px"></span>'}</div>`});
    html+='</div>'});$('dpSelList').innerHTML=html}

function dpAddSplit(k){if(!dpSelected[k])return;const n=dpSelected[k].splits.length;
  // Auto-label existing splits as Part 1, Part 2... when adding a second
  if(n===1&&!dpSelected[k].splits[0].label)dpSelected[k].splits[0].label='Part 1';
  dpSelected[k].splits.push({label:'Part '+(n+1),date:''});renderDpSel()}
function dpRemSplit(k){if(!dpSelected[k]||dpSelected[k].splits.length<=1)return;dpSelected[k].splits.pop();renderDpSel()}

async function dpCreate(){const err=$('dpErr'),suc=$('dpSuc');err.innerHTML='';suc.innerHTML='';
  const pn=$('dpProj').value,keys=Object.keys(dpSelected);if(!keys.length)return err.innerHTML='<div class="error-msg">Select combinations</div>';
  const btn=$('dpCreateBtn');btn.disabled=true;btn.textContent='Creating...';const bid='b_'+Date.now();
  try{const rows=[];keys.forEach(k=>{const[lv,ar]=k.split('||');dpSelected[k].splits.forEach((sp,i)=>{
    rows.push({project:pn,level:lv,area:ar,schedule:null,status:sp.date?'Ordered':'Not Ordered',entry_type:'scheduled',our_delivery_date:sp.date||null,split_reference:dpSelected[k].splits.length>1?(sp.label||'Part '+(i+1)):(sp.label||null),order_batch_id:bid})})});
    const{error}=await sb.from('entries').insert(rows);if(error)throw error;
    await auditLog({action:'BULK_CREATE',new_value:`${rows.length} placeholders for ${pn}`});
    dpSelected={};await loadEntries();renderDpGrid();suc.innerHTML=`<div class="success-msg">Created ${rows.length} entries!</div>`;
    // If any of these rows had an Ordered Delivery Date set, offer to notify
    const datedRows=rows.filter(r=>r.our_delivery_date);
    if(datedRows.length){setTimeout(()=>confirmDialog('Notify Aus Reo','You set ordered delivery dates for <b>'+datedRows.length+'</b> '+(datedRows.length===1?'entry':'entries')+'.<br><br>Send notification email?','Send Email','',()=>openOrderCreatedEmail(datedRows,pn)),200)}
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}
  btn.disabled=false;btn.textContent='Create Placeholder Entries'}

function openOrderCreatedEmail(rows,projectName){
  const isBulk=rows.length>1;
  const subject=isBulk
    ? `Orders Created — ${projectName} (${rows.length} entries)`
    : `Order Created — ${projectName} / ${rows[0].level||''} / ${rows[0].area||''}`;
  const lines=rows.map(r=>{const loc=`${r.level||'—'} / ${r.area||'—'}${r.split_reference?' ('+r.split_reference+')':''}`;return `${r.project} / ${loc} — ${fmtDate(r.our_delivery_date)||'TBC'}`});
  const intro=isBulk
    ? `The following ordered delivery dates have been set:`
    : `An ordered delivery date has been set for the following:`;
  const body=`Hi,\n\n${intro}\n\n${lines.join('\n')}\n\nPlease confirm receipt and the supplier delivery ${isBulk?'dates':'date'}.${EMAIL_FOOTER_TEXT}\n\nRegards,\n${userName}\nDebono Bros Concreting`;
  emailModal(subject,body,null,'order_created')}

/* ═══ ADMIN: STEEL FIXERS ═══ */
let sfSort={col:'our_delivery_date',asc:true};

function renderAdminFixers(){
  const proj=[...new Set(entries.filter(e=>e.schedule&&e.file_url).map(e=>e.project))].sort();
  const levels=[...new Set(entries.filter(e=>e.schedule&&e.file_url&&e.level).map(e=>e.level))].sort();
  const areas=[...new Set(entries.filter(e=>e.schedule&&e.file_url&&e.area).map(e=>e.area))].sort();
  $('adminFixers').innerHTML=`
<div class="card" style="margin-bottom:14px">
  <h3 style="font-size:15px;font-weight:700;margin-bottom:10px;color:var(--gray-dk)">Steel Fixers</h3>
  <p style="font-size:12px;color:var(--muted);margin-bottom:14px">Bar weight is the invoiceable reinforcement (bars + spiral), with <b>starter bars deducted</b> (shown separately). Mesh in m², trench mesh in LM. Each schedule is reconciled against its stated total weight — rows that don't add up are flagged <span style="color:var(--err)">⚠ Review</span>; click <b>Mark Reviewed</b> once you've checked one. Values are click-to-edit. Use the Comment column for notes, and click Dispute Raised to cycle ✓ resolved / ✗ disputed / — N/A.</p>
  <div class="filters" style="margin-bottom:0">
    <select id="sfProj" onchange="renderSfTable()"><option value="">All Projects</option>${proj.map(p=>`<option>${esc(p)}</option>`).join('')}</select>
    <select id="sfLevel" onchange="renderSfTable()"><option value="">All Levels</option>${levels.map(l=>`<option>${esc(l)}</option>`).join('')}</select>
    <select id="sfArea" onchange="renderSfTable()"><option value="">All Areas</option>${areas.map(a=>`<option>${esc(a)}</option>`).join('')}</select>
    <input type="text" id="sfSearch" placeholder="Search schedule..." oninput="renderSfTable()">
    <button class="btn btn-sec btn-sm" onclick="exportSfCSV()">Export CSV</button>
  </div>
</div>
<div class="tcard"><div class="tscroll" id="sfTable"></div></div>`;
  renderSfTable()}

function getSfFiltered(){
  const fp=$('sfProj').value,fl=$('sfLevel').value,fa=$('sfArea').value,fq=($('sfSearch').value||'').toLowerCase().trim();
  let list=entries.filter(e=>e.schedule&&e.file_url);
  if(fp)list=list.filter(e=>e.project===fp);
  if(fl)list=list.filter(e=>e.level===fl);
  if(fa)list=list.filter(e=>e.area===fa);
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area,e.drawing_reference].some(f=>(f||'').toLowerCase().includes(fq)));
  list.sort((a,b)=>{let va=a[sfSort.col],vb=b[sfSort.col];
    if(['our_delivery_date','installed_date'].includes(sfSort.col)){va=new Date(va||0);vb=new Date(vb||0);return sfSort.asc?va-vb:vb-va}
    if(['bar_weight','mesh_sqm','trench_mesh_lm','total_weight'].includes(sfSort.col)){va=parseFloat(va)||0;vb=parseFloat(vb)||0;return sfSort.asc?va-vb:vb-va}
    if(sfSort.col==='sf_dispute'){
      // Sort order: cross (most urgent) → tick → dash → null (empty). Reversed if asc=false.
      const rank={cross:0,tick:1,dash:2};
      const ra=va in rank?rank[va]:3,rb=vb in rank?rank[vb]:3;
      return sfSort.asc?ra-rb:rb-ra;
    }
    return sfSort.asc?String(va||'').localeCompare(String(vb||'')):String(vb||'').localeCompare(String(va||''))});
  return list}

function renderSfTable(){
  const list=getSfFiltered();
  const w=$('sfTable');if(!w)return;
  if(!list.length){w.innerHTML='<div class="empty"><p>No entries with schedules attached yet.</p></div>';return}
  const ar=c=>sfSort.col===c?(sfSort.asc?' ▲':' ▼'):'';
  let sumBar=0,sumMesh=0,sumTr=0,sumInstalled=0,sumDisputes=0,sumStarter=0,sumReview=0;
  list.forEach(e=>{sumBar+=parseFloat(e.bar_weight)||0;sumMesh+=parseFloat(e.mesh_sqm)||0;sumTr+=parseFloat(e.trench_mesh_lm)||0;sumStarter+=parseFloat(e.starter_weight)||0;if(e.installed_date)sumInstalled++;if(e.sf_dispute==='cross')sumDisputes++;if(e.recon_status==='review'&&!e.recon_reviewed)sumReview++});
  w.innerHTML=`<table><thead><tr>
<th onclick="sfTSort('project')">Project${ar('project')}</th>
<th onclick="sfTSort('level')">Level${ar('level')}</th>
<th onclick="sfTSort('area')">Area${ar('area')}</th>
<th onclick="sfTSort('schedule')">Schedule${ar('schedule')}</th>
<th onclick="sfTSort('our_delivery_date')">Ordered Delivery${ar('our_delivery_date')}</th>
<th onclick="sfTSort('bar_weight')" style="text-align:right">Bar Weight (T)${ar('bar_weight')}</th>
<th onclick="sfTSort('starter_weight')" style="text-align:right">Starter Bars (T)${ar('starter_weight')}</th>
<th onclick="sfTSort('mesh_sqm')" style="text-align:right">Mesh (m²)${ar('mesh_sqm')}</th>
<th onclick="sfTSort('trench_mesh_lm')" style="text-align:right">Trench Mesh (LM)${ar('trench_mesh_lm')}</th>
<th onclick="sfTSort('recon_status')" style="text-align:center">Reconciliation${ar('recon_status')}</th>
<th class="no-sort">Schedule File</th>
<th class="no-sort">Markup Plans</th>
<th onclick="sfTSort('installed_date')">Installed Date${ar('installed_date')}</th>
<th class="no-sort">Comments</th>
<th onclick="sfTSort('sf_dispute')" style="text-align:center">Dispute Raised${ar('sf_dispute')}</th>
</tr></thead><tbody>${list.map(e=>{
  const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  const mpCell=mp.length
    ? `<button class="att-link markup-link" onclick="viewMarkups(${e.id})" style="border:none;cursor:pointer;font-family:inherit">📐 ${mp.length}</button>`
    : '<span style="color:#ccc">—</span>';
  const instDate=e.installed_date
    ? `<span class="weight-td" onclick="sfEditInstalled(${e.id})" style="white-space:nowrap;font-size:11px">${fmtDate(e.installed_date)}</span>`
    : `<span class="weight-td" onclick="sfEditInstalled(${e.id})" style="color:#ccc;font-size:11px">Set date</span>`;
  // Comment cell — click to edit. Truncate long text with title tooltip.
  const cmt=e.sf_comment||'';
  const cmtDisplay=cmt
    ? `<span class="weight-td" onclick="sfEditComment(${e.id})" title="${esc(cmt)}" style="font-size:11px;color:var(--mid);max-width:140px;display:inline-block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;vertical-align:middle">${esc(cmt)}</span>`
    : `<span class="weight-td" onclick="sfEditComment(${e.id})" style="color:#ccc;font-size:11px">Add note</span>`;
  // Dispute cell — click to cycle through 4 states: null → tick → cross → dash → null.
  const disp=sfDisputeCell(e);
  // Reconciliation cell — green ✓ reconciled, amber ⚠ review (with reason). A "Reviewed"
  // acknowledgement clears the warning once a human has eyeballed it.
  const reconCell=sfReconCell(e);
  return `<tr>
<td class="proj-td" title="${esc(e.project)}">${esc(e.project)}${e.extraction_method==='ocr'?' <span class="ocr-badge" title="This entry was extracted using OCR — please double-check the values">🔍 OCR</span>':''}</td>
<td>${esc(e.level||'—')}${e.split_reference?' <span style="font-size:10px;color:var(--accent-dk);font-weight:600">('+esc(e.split_reference)+')</span>':''}</td>
<td title="${esc(e.area||'')}">${esc(e.area||'—')}</td>
<td class="sched-td">${esc(e.schedule)}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.our_delivery_date)||'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('bar_weight',${e.id})">${e.bar_weight!=null?parseFloat(e.bar_weight).toFixed(3):'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('starter_weight',${e.id})">${e.starter_weight!=null&&parseFloat(e.starter_weight)>0?'<span style="color:var(--accent-dk)">−'+parseFloat(e.starter_weight).toFixed(3)+'</span>':'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('mesh_sqm',${e.id})">${e.mesh_sqm!=null?parseFloat(e.mesh_sqm).toFixed(2):'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('trench_mesh_lm',${e.id})">${e.trench_mesh_lm!=null?parseFloat(e.trench_mesh_lm).toFixed(2):'<span style="color:#ccc">—</span>'}</td>
<td style="text-align:center">${reconCell}</td>
<td><a class="att-link" href="${e.file_url}" target="_blank">📄 ${esc((e.file_name||'').slice(0,16))}</a></td>
<td>${mpCell}</td>
<td>${instDate}</td>
<td>${cmtDisplay}</td>
<td style="text-align:center">${disp}</td>
</tr>`}).join('')}
<tr style="background:#FAFAF8;font-weight:700;border-top:2px solid var(--border)">
<td colspan="5" style="text-align:right;color:var(--gray-dk)">TOTALS (${list.length} entries)</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumBar.toFixed(3)} T</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumStarter>0?'−'+sumStarter.toFixed(3):''}</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumMesh.toFixed(2)} m²</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumTr.toFixed(2)} LM</td>
<td style="text-align:center;color:var(--accent-dk);font-size:11px">${sumReview} to review</td>
<td></td>
<td></td>
<td class="sched-td" style="color:var(--accent-dk);font-size:11px">${sumInstalled}/${list.length} installed</td>
<td></td>
<td class="sched-td" style="text-align:center;color:var(--accent-dk);font-size:11px">${sumDisputes} disputed</td>
</tr>
</tbody></table>`}

function sfTSort(c){if(sfSort.col===c)sfSort.asc=!sfSort.asc;else{sfSort.col=c;sfSort.asc=true}renderSfTable()}

// Reconciliation cell for the Steel Fixers table.
//  • null status (manual entry / nothing to check) → em dash
//  • reconciled → green ✓
//  • review, not yet acknowledged → amber ⚠ with reason tooltip + "Reviewed" button
//  • review, acknowledged → green ✓ Reviewed (by name)
function sfReconCell(e){
  if(!e.recon_status)return '<span style="color:#ccc">—</span>';
  if(e.recon_status==='reconciled')return '<span title="Bar + Spiral + Misc matches the schedule total" style="color:var(--success);font-weight:600;font-size:11px">✓ Reconciled</span>';
  // review
  if(e.recon_reviewed){
    return '<span title="Flagged then checked by '+esc(e.recon_reviewed_by||'someone')+'" style="color:var(--success);font-weight:600;font-size:11px">✓ Reviewed'+(e.recon_reviewed_by?'<br><span style="font-weight:400;color:var(--muted)">'+esc(e.recon_reviewed_by)+'</span>':'')+'</span>';
  }
  const reason=e.recon_reason||'Needs review';
  return '<span title="'+esc(reason)+'" style="color:var(--err);font-weight:600;font-size:11px;cursor:help">⚠ Review</span><br><button class="btn btn-sm" style="width:auto;font-size:10px;padding:2px 8px;margin-top:3px" onclick="sfMarkReviewed('+e.id+')">Mark Reviewed</button>';
}
async function sfMarkReviewed(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  const by=userName||foremanName||'Unknown';
  await sb.from('entries').update({recon_reviewed:true,recon_reviewed_by:by}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'recon_reviewed',old_value:'false',new_value:'true ('+by+')'});
  await loadEntries();renderSfTable();
}

function sfEdit(field,id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  const labels={bar_weight:'Bar Weight (T)',starter_weight:'Starter Bars (T)',mesh_sqm:'Square Mesh (m²)',trench_mesh_lm:'Trench Mesh (LM)'};
  const step=field==='bar_weight'?'0.001':'0.01';
  $('weightModal').innerHTML=`<h3>${esc(labels[field])}<button class="modal-close" onclick="closeOv('weightOv')">&times;</button></h3><p style="font-size:12px;color:var(--muted);margin-bottom:10px">${esc(e.project)} / ${esc(e.level||'—')} / ${esc(e.area||'—')} · ${esc(e.schedule||'')}</p><div class="fg"><input type="number" step="${step}" id="sfInp" value="${e[field]!=null?e[field]:''}" style="font-family:'JetBrains Mono',monospace" placeholder="Leave blank to clear"></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn btn-sec btn-sm" onclick="closeOv('weightOv')">Cancel</button><button class="btn btn-sm" onclick="sfSave('${field}',${id})" style="width:auto">Save</button></div>`;
  $('weightOv').classList.add('show')}

async function sfSave(field,id){
  const v=$('sfInp').value,nv=v===''?null:parseFloat(v);
  const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({[field]:nv,extraction_method:'manual'}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:field,old_value:String(e[field]||''),new_value:String(nv==null?'':nv)+' (manual)'});
  closeOv('weightOv');await loadEntries();renderAdminFixers()}

function sfEditInstalled(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  $('weightModal').innerHTML=`<h3>Installed Date<button class="modal-close" onclick="closeOv('weightOv')">&times;</button></h3><p style="font-size:12px;color:var(--muted);margin-bottom:10px">${esc(e.project)} / ${esc(e.level||'—')} / ${esc(e.area||'—')} · ${esc(e.schedule||'')}</p><div class="fg"><label style="display:block;margin-bottom:4px">Date installed on site</label><input type="date" id="sfDateInp" value="${e.installed_date||''}"></div><div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px"><button class="btn btn-err btn-sm" onclick="sfClearInstalled(${id})" style="width:auto" ${e.installed_date?'':'disabled'}>Clear</button><div style="display:flex;gap:8px"><button class="btn btn-sec btn-sm" onclick="closeOv('weightOv')">Cancel</button><button class="btn btn-sm" onclick="sfSaveInstalled(${id})" style="width:auto">Save</button></div></div>`;
  $('weightOv').classList.add('show')}

async function sfSaveInstalled(id){
  const v=$('sfDateInp').value,nv=v||null;
  const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({installed_date:nv}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'installed_date',old_value:String(e.installed_date||''),new_value:String(nv||'')});
  closeOv('weightOv');await loadEntries();renderAdminFixers()}

async function sfClearInstalled(id){
  const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({installed_date:null}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'installed_date',old_value:String(e.installed_date||''),new_value:''});
  closeOv('weightOv');await loadEntries();renderAdminFixers()}

// ─── Comments column ───
function sfEditComment(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  const cur=e.sf_comment||'';
  $('weightModal').innerHTML=`<h3>Comment<button class="modal-close" onclick="closeOv('weightOv')">&times;</button></h3><p style="font-size:12px;color:var(--muted);margin-bottom:10px">${esc(e.project)} / ${esc(e.level||'—')} / ${esc(e.area||'—')} · ${esc(e.schedule||'')}</p><div class="fg"><label style="display:block;margin-bottom:4px">Notes for steel fixers</label><textarea id="sfCmtInp" rows="4" style="width:100%;padding:8px;border:1px solid var(--border);border-radius:6px;font-family:inherit;font-size:13px;resize:vertical" placeholder="e.g. delivered with shortage, awaiting credit note">${esc(cur)}</textarea></div><div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px"><button class="btn btn-err btn-sm" onclick="sfClearComment(${id})" style="width:auto" ${cur?'':'disabled'}>Clear</button><div style="display:flex;gap:8px"><button class="btn btn-sec btn-sm" onclick="closeOv('weightOv')">Cancel</button><button class="btn btn-sm" onclick="sfSaveComment(${id})" style="width:auto">Save</button></div></div>`;
  $('weightOv').classList.add('show');
  setTimeout(()=>{const ta=$('sfCmtInp');if(ta)ta.focus()},50)}

async function sfSaveComment(id){
  const v=($('sfCmtInp').value||'').trim(),nv=v||null;
  const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({sf_comment:nv}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'sf_comment',old_value:String(e.sf_comment||''),new_value:String(nv||'')});
  closeOv('weightOv');await loadEntries();renderAdminFixers()}

async function sfClearComment(id){
  const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({sf_comment:null}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'sf_comment',old_value:String(e.sf_comment||''),new_value:''});
  closeOv('weightOv');await loadEntries();renderAdminFixers()}

// ─── Dispute Raised column ───
// 4-state cycle on click: null (empty) → tick (resolved/agreed) → cross (disputed) → dash (n/a) → null.
// Stored as text in column sf_dispute. Sort order: cross, tick, dash, null (so disputed entries surface).
function sfDisputeCell(e){
  const v=e.sf_dispute||null;
  const labels={tick:'Resolved / agreed',cross:'Dispute raised',dash:'N/A — not applicable'};
  if(v==='tick')return `<span onclick="sfToggleDispute(${e.id})" title="${labels.tick} — click to change" style="cursor:pointer;color:var(--success);font-size:18px;font-weight:700;padding:0 4px;user-select:none">✓</span>`;
  if(v==='cross')return `<span onclick="sfToggleDispute(${e.id})" title="${labels.cross} — click to change" style="cursor:pointer;color:var(--err);font-size:18px;font-weight:700;padding:0 4px;user-select:none">✗</span>`;
  if(v==='dash')return `<span onclick="sfToggleDispute(${e.id})" title="${labels.dash} — click to change" style="cursor:pointer;color:#9a9a9a;font-size:18px;font-weight:700;padding:0 4px;user-select:none">—</span>`;
  return `<span onclick="sfToggleDispute(${e.id})" title="Click to mark this row" style="cursor:pointer;color:#d8d4ce;font-size:14px;padding:1px 6px;border:1px dashed #d8d4ce;border-radius:3px;user-select:none">·</span>`}

async function sfToggleDispute(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  // Cycle: null → tick → cross → dash → null
  const cur=e.sf_dispute||null;
  const next=cur===null?'tick':cur==='tick'?'cross':cur==='cross'?'dash':null;
  await sb.from('entries').update({sf_dispute:next}).eq('id',id);
  await auditLog({entry_id:id,action:'UPDATE',field_changed:'sf_dispute',old_value:String(cur||''),new_value:String(next||'')});
  await loadEntries();renderAdminFixers()}

function exportSfCSV(){
  const list=getSfFiltered();if(!list.length)return alert('No data');
  const h=['Project','Level','Area','Split','Schedule','Ordered Delivery','Bar Weight (T)','Starter Bars (T)','Mesh (m²)','Trench Mesh (LM)','Reconciliation','Recon Diff (T)','Reviewed By','Markup Plans','Installed Date','File','Comment','Dispute Raised'];
  // Map dispute state to a clear English label for the CSV
  const dispLabel=v=>v==='tick'?'Resolved':v==='cross'?'Disputed':v==='dash'?'N/A':'';
  const reconLabel=e=>!e.recon_status?'':e.recon_status==='reconciled'?'Reconciled':(e.recon_reviewed?'Reviewed':'REVIEW: '+(e.recon_reason||''));
  const rows=list.map(e=>{const mp=e.markup_plans?JSON.parse(e.markup_plans):[];return [e.project,e.level||'',e.area||'',e.split_reference||'',e.schedule||'',e.our_delivery_date||'',e.bar_weight??'',e.starter_weight??'',e.mesh_sqm??'',e.trench_mesh_lm??'',reconLabel(e),e.recon_diff??'',e.recon_reviewed_by||'',mp.length,e.installed_date||'',e.file_name||'',e.sf_comment||'',dispLabel(e.sf_dispute)]});
  // Totals row
  let sumBar=0,sumMesh=0,sumTr=0,sumInstalled=0,sumDisputes=0,sumStarter=0;list.forEach(e=>{sumBar+=parseFloat(e.bar_weight)||0;sumMesh+=parseFloat(e.mesh_sqm)||0;sumTr+=parseFloat(e.trench_mesh_lm)||0;sumStarter+=parseFloat(e.starter_weight)||0;if(e.installed_date)sumInstalled++;if(e.sf_dispute==='cross')sumDisputes++});
  rows.push(['','','','','','TOTALS',sumBar.toFixed(3),sumStarter.toFixed(3),sumMesh.toFixed(2),sumTr.toFixed(2),'','','','',sumInstalled+'/'+list.length+' installed','','',sumDisputes+' disputed']);
  const csv=[h,...rows].map(r=>r.map(c=>`"${String(c??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download=`steel-fixers-${today()}.csv`;a.click()}

/* ═══ ADMIN: EMAIL CONTACTS ═══ */
async function renderAdminContacts(){
  await loadEmailContacts();
  const def=emailContacts.find(c=>c.is_default);
  $('adminContacts').innerHTML=`
<div class="card" style="margin-bottom:18px">
  <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--gray-dk)">Email Contacts</h3>
  <p style="font-size:12px;color:var(--muted);margin-bottom:14px">Saved addresses appear in every email modal. The default is pre-filled in the To field; others appear as CC checkboxes.</p>
  <div class="row2" style="margin-bottom:10px">
    <div class="fg" style="margin-bottom:0"><label>Label</label><input type="text" id="ecLabel" placeholder="e.g. Aus Reo Scheduling"></div>
    <div class="fg" style="margin-bottom:0"><label>Email Address</label><input type="email" id="ecEmail" placeholder="orders@ausreo.com.au"></div>
  </div>
  <div style="display:flex;gap:10px;margin-top:10px;align-items:center">
    <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--gray-dk);cursor:pointer"><input type="checkbox" id="ecDefault" style="width:auto"> Set as default</label>
    <button class="btn btn-sm" onclick="saveEmailContact()" id="ecAddBtn" style="width:auto;margin-left:auto">Add Contact</button>
    <button class="btn btn-sec btn-sm" onclick="cancelEcEdit()" id="ecCancelBtn" style="display:none;width:auto">Cancel</button>
  </div>
  <div id="ecErr"></div>
</div>
<div class="card">
  <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--gray-dk)">Saved (<span>${emailContacts.length}</span>)</h3>
  ${emailContacts.length?`<div class="proj-list">${emailContacts.map(c=>`
    <div class="proj-item" style="align-items:center">
      <div style="flex:1;min-width:0">
        <div style="font-weight:600;color:var(--gray-dk);display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          ${esc(c.label||'(no label)')}
          ${c.is_default?'<span class="pill" style="background:var(--accent-lt);color:var(--accent-dk);font-size:9px;padding:2px 8px">DEFAULT</span>':''}
        </div>
        <div style="font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--muted);margin-top:2px;word-break:break-all">${esc(c.email)}</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        ${c.is_default?'':`<button class="btn btn-ghost btn-sm" onclick="setDefaultContact(${c.id})" title="Make default" style="width:auto">Make Default</button>`}
        <button class="btn btn-ghost btn-sm" onclick="editContact(${c.id})" style="width:auto">Edit</button>
        <button class="btn btn-err btn-sm" onclick="deleteContact(${c.id})" style="width:auto">Delete</button>
      </div>
    </div>`).join('')}</div>`:'<div class="empty"><p>No contacts yet. Add one above.</p></div>'}
</div>`}

let _editingContactId=null;

function editContact(id){
  const c=emailContacts.find(x=>x.id===id);if(!c)return;
  _editingContactId=id;
  $('ecLabel').value=c.label||'';
  $('ecEmail').value=c.email||'';
  $('ecDefault').checked=!!c.is_default;
  $('ecAddBtn').textContent='Save Changes';
  $('ecCancelBtn').style.display='inline-flex';
  $('ecLabel').focus()}

function cancelEcEdit(){
  _editingContactId=null;
  $('ecLabel').value='';$('ecEmail').value='';$('ecDefault').checked=false;
  $('ecAddBtn').textContent='Add Contact';
  $('ecCancelBtn').style.display='none';
  $('ecErr').innerHTML=''}

async function saveEmailContact(){
  const label=$('ecLabel').value.trim(),email=$('ecEmail').value.trim(),isDefault=$('ecDefault').checked;
  const err=$('ecErr');err.innerHTML='';
  if(!label)return err.innerHTML='<div class="error-msg">Label is required</div>';
  if(!email||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return err.innerHTML='<div class="error-msg">Enter a valid email address</div>';
  const btn=$('ecAddBtn');btn.disabled=true;
  try{
    if(isDefault){await sb.from('email_contacts').update({is_default:false}).neq('id',-1)}
    if(_editingContactId){
      const{error}=await sb.from('email_contacts').update({label,email,is_default:isDefault}).eq('id',_editingContactId);
      if(error)throw error;
      await auditLog({action:'UPDATE',field_changed:'email_contact',new_value:label+' <'+email+'>'});
    }else{
      const{error}=await sb.from('email_contacts').insert({label,email,is_default:isDefault,sort_order:emailContacts.length});
      if(error)throw error;
      await auditLog({action:'CREATE',field_changed:'email_contact',new_value:label+' <'+email+'>'});}
    cancelEcEdit();await renderAdminContacts();
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}
  btn.disabled=false}

async function setDefaultContact(id){
  const c=emailContacts.find(x=>x.id===id);if(!c)return;
  await sb.from('email_contacts').update({is_default:false}).neq('id',-1);
  await sb.from('email_contacts').update({is_default:true}).eq('id',id);
  await auditLog({action:'UPDATE',field_changed:'email_contact_default',new_value:c.label+' <'+c.email+'>'});
  await renderAdminContacts()}

async function deleteContact(id){
  const c=emailContacts.find(x=>x.id===id);if(!c)return;
  confirmDialog('Delete Contact','Remove <b>'+esc(c.label)+'</b> from the contacts list?','Delete','',async()=>{
    await sb.from('email_contacts').delete().eq('id',id);
    await auditLog({action:'DELETE',field_changed:'email_contact',old_value:c.label+' <'+c.email+'>'});
    await renderAdminContacts()})}

/* ═══ ADMIN: PEOPLE ═══
   Manage names + roles. DBCC = internal staff, eligible for project assignments.
   Aus Reo = supplier contacts, tracked but not assigned to projects. */
async function renderAdminPeople(){
  // Refresh in case another admin added someone since the tab last opened.
  await loadPeople();
  const el=$('adminPeople');
  // The form for adding a new person + the list of existing.
  el.innerHTML=`<div class="card" style="margin-bottom:18px">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:14px;color:var(--gray-dk)">Add Person</h3>
    <div class="row2">
      <div class="fg"><label>Name</label><input type="text" id="newPersonName" placeholder="e.g. Selva D"></div>
      <div class="fg"><label>Role</label><select id="newPersonRole"><option value="DBCC">DBCC</option><option value="Aus Reo">Aus Reo</option></select></div>
    </div>
    <div style="display:flex;gap:10px;margin-top:8px"><button class="btn btn-sm" onclick="addPerson()" style="width:auto">Add Person</button></div>
    <div id="personErr"></div>
  </div>
  <div class="card">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--gray-dk)">People (<span>${people.length}</span>)</h3>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px">DBCC = internal staff (can be assigned to projects). Aus Reo = supplier contacts (tracked only).</p>
    ${people.length===0?'<div class="empty"><p>No people yet. Add some above.</p></div>':`
      <div style="display:flex;flex-direction:column;gap:6px">
        ${people.map(p=>`<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:#fff;border:1px solid var(--border);border-radius:6px">
          <span style="flex:1;font-weight:600;color:var(--gray-dk)">${esc(p.name)}</span>
          <select onchange="setPersonRole(${p.id},this.value)" style="padding:4px 8px;border:1px solid var(--border);border-radius:5px;font-size:12px;background:#fff">
            <option value="DBCC"${p.role==='DBCC'?' selected':''}>DBCC</option>
            <option value="Aus Reo"${p.role==='Aus Reo'?' selected':''}>Aus Reo</option>
          </select>
          <button class="btn btn-err btn-sm" onclick="deletePerson(${p.id})" style="width:auto;padding:4px 10px;font-size:11px">Delete</button>
        </div>`).join('')}
      </div>`}
  </div>`;
}
async function addPerson(){
  const name=$('newPersonName').value.trim(),role=$('newPersonRole').value;
  const err=$('personErr');err.innerHTML='';
  if(!name)return err.innerHTML='<div class="error-msg" style="margin-top:8px">Name required</div>';
  if(people.some(p=>p.name.toLowerCase()===name.toLowerCase()))return err.innerHTML='<div class="error-msg" style="margin-top:8px">A person with that name already exists</div>';
  const{error}=await sb.from('people').insert({name,role});
  if(error)return err.innerHTML='<div class="error-msg" style="margin-top:8px">'+esc(error.message)+'</div>';
  await auditLog({action:'CREATE',field_changed:'person',new_value:`${name} (${role})`});
  await renderAdminPeople();
}
async function setPersonRole(id,role){
  const p=people.find(x=>x.id===id);if(!p||p.role===role)return;
  // If demoting from DBCC to Aus Reo, drop their project assignments since Aus Reo can't be assigned.
  let removed=0;
  if(p.role==='DBCC'&&role==='Aus Reo'){
    const{error,count}=await sb.from('project_assignments').delete({count:'exact'}).eq('person_id',id);
    if(!error)removed=count||0;
  }
  await sb.from('people').update({role}).eq('id',id);
  await auditLog({action:'UPDATE',field_changed:'person_role',old_value:`${p.name}: ${p.role}`,new_value:`${p.name}: ${role}${removed?' (removed '+removed+' assignment'+(removed===1?'':'s')+')':''}`});
  await loadPeople();await loadAssignments();renderAdminPeople();
}
function deletePerson(id){
  const p=people.find(x=>x.id===id);if(!p)return;
  const projCount=projectsForPerson(id).length;
  const detailMsg=projCount?`This person is assigned to ${projCount} project${projCount===1?'':'s'}. Those assignments will also be removed. `:'';
  confirmDialog('Delete Person?',`${detailMsg}This cannot be undone.<br><br><b>${esc(p.name)}</b> (${p.role})`,'Delete','btn-err',async()=>{
    // Cascade in project_assignments handles the assignments side via FK ON DELETE CASCADE.
    const{error}=await sb.from('people').delete().eq('id',id);
    if(error){alert('Error: '+error.message);return}
    await auditLog({action:'DELETE',field_changed:'person',old_value:`${p.name} (${p.role})`});
    await loadPeople();await loadAssignments();renderAdminPeople();
  });
}

/* ═══ ADMIN: PROJECT ASSIGNMENTS ═══
   For each project, multi-select which DBCC people own it. */
async function renderAdminAssign(){
  await loadPeople();await loadAssignments();
  const el=$('adminAssign');
  const dbccPeople=people.filter(p=>p.role==='DBCC');
  if(!projects.length){el.innerHTML='<div class="card"><div class="empty"><p>No projects yet. Add some on the Projects tab.</p></div></div>';return}
  if(!dbccPeople.length){el.innerHTML='<div class="card"><div class="empty"><p>No DBCC people yet. Add some on the People tab first.</p></div></div>';return}
  el.innerHTML=`<div class="card">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:8px;color:var(--gray-dk)">Project Assignments</h3>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px">Click a name to toggle assignment for that project. Only DBCC people are listed. Used by the Accountability tab.</p>
    <div style="display:flex;flex-direction:column;gap:14px">
      ${projects.map(pr=>{
        const assigned=peopleForProject(pr.name);
        const assignedIds=new Set(assigned.map(p=>p.id));
        return `<div style="padding:12px 14px;background:#fff;border:1px solid var(--border);border-radius:8px">
          <div style="font-weight:700;color:var(--gray-dk);margin-bottom:8px">${esc(pr.name)}</div>
          <div style="display:flex;flex-wrap:wrap;gap:6px">
            ${dbccPeople.map(p=>{
              const on=assignedIds.has(p.id);
              return `<button onclick="toggleAssignment('${esc(pr.name).replace(/'/g,"\\'")}',${p.id})" class="btn btn-sm" style="width:auto;padding:5px 12px;font-size:12px;background:${on?'var(--accent)':'#fff'};color:${on?'#fff':'var(--gray-dk)'};border:1px solid ${on?'var(--accent)':'var(--border)'};font-weight:${on?'600':'500'}">${on?'✓ ':''}${esc(p.name)}</button>`;
            }).join('')}
          </div>
          ${assigned.length===0?'<div style="font-size:11px;color:var(--muted);margin-top:6px;font-style:italic">⚠ Unassigned</div>':''}
        </div>`;
      }).join('')}
    </div>
  </div>`;
}
async function toggleAssignment(projectName,personId){
  const exists=assignments.find(a=>a.project_name===projectName&&a.person_id===personId);
  const p=people.find(x=>x.id===personId);
  if(exists){
    await sb.from('project_assignments').delete().eq('id',exists.id);
    await auditLog({action:'DELETE',field_changed:'assignment',old_value:`${p?.name}: ${projectName}`});
  }else{
    await sb.from('project_assignments').insert({project_name:projectName,person_id:personId});
    await auditLog({action:'CREATE',field_changed:'assignment',new_value:`${p?.name}: ${projectName}`});
  }
  await loadAssignments();renderAdminAssign();
}

/* ═══ ADMIN: ACCOUNTABILITY ═══
   Date-range review showing per-person open issues + resolution times.
   Default range: current Mon-Fri week. */
function getMondayOfThisWeek(){
  const d=new Date();const day=d.getDay();// 0=Sun, 1=Mon ... 6=Sat
  const diff=day===0?-6:1-day;// shift back to Monday
  d.setDate(d.getDate()+diff);d.setHours(0,0,0,0);return d;
}
function getFridayOfThisWeek(){
  const m=getMondayOfThisWeek();const f=new Date(m);f.setDate(m.getDate()+4);f.setHours(23,59,59,999);return f;
}
function fmtIsoDate(d){return d.toISOString().slice(0,10)}
let _accountRange={from:fmtIsoDate(getMondayOfThisWeek()),to:fmtIsoDate(getFridayOfThisWeek())};

async function renderAdminAccount(){
  await loadPeople();await loadAssignments();await loadAppSettings();
  const el=$('adminAccount');
  // Date range filter at top + threshold setting
  el.innerHTML=`<div class="card" style="margin-bottom:14px">
    <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
      <div>
        <label style="display:block;font-size:11px;color:var(--gray-dk);font-weight:600;margin-bottom:4px">From</label>
        <input type="date" id="accFrom" value="${_accountRange.from}" style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      </div>
      <div>
        <label style="display:block;font-size:11px;color:var(--gray-dk);font-weight:600;margin-bottom:4px">To</label>
        <input type="date" id="accTo" value="${_accountRange.to}" style="padding:6px 9px;border:1px solid var(--border);border-radius:6px;font-size:12px">
      </div>
      <div style="display:flex;gap:6px;margin-top:18px">
        <button class="btn btn-ghost btn-sm" onclick="setAccountPreset('thisWeek')" style="width:auto;padding:6px 12px;font-size:11px">This Week</button>
        <button class="btn btn-ghost btn-sm" onclick="setAccountPreset('lastWeek')" style="width:auto;padding:6px 12px;font-size:11px">Last Week</button>
        <button class="btn btn-ghost btn-sm" onclick="setAccountPreset('last30')" style="width:auto;padding:6px 12px;font-size:11px">Last 30 days</button>
        <button class="btn btn-sm" onclick="applyAccountRange()" style="width:auto;padding:6px 14px;font-size:11px">Apply</button>
      </div>
      <div style="margin-left:auto;border-left:1px solid var(--border);padding-left:14px">
        <label style="display:block;font-size:11px;color:var(--gray-dk);font-weight:600;margin-bottom:4px">Overdue install threshold</label>
        <div style="display:flex;align-items:center;gap:6px"><input type="number" id="overdueThresholdInp" value="${appSettings.overdue_install_days}" min="1" max="60" style="width:60px;padding:6px;border:1px solid var(--border);border-radius:6px;font-size:12px"><span style="font-size:11px;color:var(--muted)">days</span><button class="btn btn-sm" onclick="saveOverdueThreshold()" style="width:auto;padding:5px 10px;font-size:11px">Save</button></div>
      </div>
    </div>
  </div>
  <div id="accountBody"></div>`;
  renderAccountBody();
}
function setAccountPreset(p){
  if(p==='thisWeek'){_accountRange={from:fmtIsoDate(getMondayOfThisWeek()),to:fmtIsoDate(getFridayOfThisWeek())}}
  else if(p==='lastWeek'){const m=getMondayOfThisWeek();m.setDate(m.getDate()-7);const f=new Date(m);f.setDate(m.getDate()+4);_accountRange={from:fmtIsoDate(m),to:fmtIsoDate(f)}}
  else if(p==='last30'){const t=new Date();const f=new Date(t);f.setDate(t.getDate()-30);_accountRange={from:fmtIsoDate(f),to:fmtIsoDate(t)}}
  $('accFrom').value=_accountRange.from;$('accTo').value=_accountRange.to;applyAccountRange();
}
function applyAccountRange(){
  _accountRange={from:$('accFrom').value,to:$('accTo').value};
  renderAccountBody();
}
async function saveOverdueThreshold(){
  const n=parseInt($('overdueThresholdInp').value,10);
  if(isNaN(n)||n<1||n>60)return alert('Enter a number between 1 and 60');
  await saveAppSetting('overdue_install_days',n);
  await auditLog({action:'UPDATE',field_changed:'overdue_install_days',new_value:String(n)});
  alert('Saved. Threshold: '+n+' days');
}

// Render the body of the accountability tab. Heavy lifting:
//  - Pulls audit log entries within the date range
//  - For each DBCC person, computes per-project open issues and resolutions
async function renderAccountBody(){
  const body=$('accountBody');if(!body)return;
  body.innerHTML='<div class="empty"><p>Loading…</p></div>';
  const fromIso=_accountRange.from+'T00:00:00';
  const toIso=_accountRange.to+'T23:59:59';
  // Pull audit log entries in range — used for "resolutions this week" and per-issue resolution times.
  let logs=[];
  try{
    const{data,error}=await sb.from('audit_log').select('*').gte('created_at',fromIso).lte('created_at',toIso).order('created_at',{ascending:true}).limit(2000);
    if(error)throw error;logs=data||[];
  }catch(e){console.warn('[REO] audit log fetch failed:',e.message);logs=[]}
  const dbccPeople=people.filter(p=>p.role==='DBCC');
  if(!dbccPeople.length){
    body.innerHTML='<div class="card"><div class="empty"><p>No DBCC people configured. Add some on the People tab.</p></div></div>';
    return;
  }
  // Per-entry resolution times (audit log: MISMATCH_RESOLVED action).
  // Map of entry_id -> [{when, by}] for resolutions in range.
  const resolutionsInRange={};
  logs.filter(l=>l.action==='MISMATCH_RESOLVED').forEach(l=>{
    if(!resolutionsInRange[l.entry_id])resolutionsInRange[l.entry_id]=[];
    resolutionsInRange[l.entry_id].push({when:l.created_at,by:l.user_identifier||'?'});
  });
  // For each resolved entry, look up the original mismatch detection time from full audit history.
  // Mismatch is "detected" the first time supplier_delivery_date was set to a value different
  // from our_delivery_date. Approximate: use entry creation time if no clear marker.
  const resolvedEntryIds=Object.keys(resolutionsInRange);
  let detectionTimes={};
  if(resolvedEntryIds.length){
    try{
      const{data}=await sb.from('audit_log').select('entry_id,field_changed,old_value,new_value,created_at').in('entry_id',resolvedEntryIds.map(Number)).in('field_changed',['supplier_delivery_date','schedule_attached']).order('created_at',{ascending:true});
      (data||[]).forEach(l=>{
        if(!detectionTimes[l.entry_id])detectionTimes[l.entry_id]=l.created_at;
      });
    }catch(e){/* fallback: use entry created_at */}
  }
  // Build per-person aggregates
  let html='';
  // First a "summary grid" showing all people side-by-side
  html+=`<div class="card" style="margin-bottom:14px">
    <h3 style="font-size:15px;font-weight:700;margin-bottom:6px;color:var(--gray-dk)">Accountability Review</h3>
    <p style="font-size:11px;color:var(--muted);margin-bottom:14px">Range: <b>${fmtDate(_accountRange.from)} → ${fmtDate(_accountRange.to)}</b>. "Open" counts use today's data (not the range). Resolutions and time-to-resolve use the range.</p>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">
      <thead><tr style="background:#FAFAF8;border-bottom:2px solid var(--border)">
        <th style="text-align:left;padding:8px 10px">Person</th>
        <th style="text-align:left;padding:8px 10px">Projects</th>
        <th style="text-align:right;padding:8px 10px">Open Mismatches</th>
        <th style="text-align:right;padding:8px 10px">Open Unmatched</th>
        <th style="text-align:right;padding:8px 10px">Late Deliveries</th>
        <th style="text-align:right;padding:8px 10px">Overdue Install</th>
        <th style="text-align:right;padding:8px 10px">Resolved (range)</th>
        <th style="text-align:right;padding:8px 10px">Avg Resolution</th>
      </tr></thead>
      <tbody>`;
  dbccPeople.forEach(p=>{
    const projs=projectsForPerson(p.id);
    const myEntries=entries.filter(e=>projs.includes(e.project));
    const open={mm:myEntries.filter(e=>hasMismatch(e)&&e.status!=='Cancelled'),
                un:myEntries.filter(e=>e.unmatched&&e.status!=='Cancelled'),
                lt:myEntries.filter(e=>isLateDelivery(e)),
                od:myEntries.filter(e=>isOverdueInstall(e))};
    // Resolutions in range BY THIS PERSON
    const myResolutions=Object.entries(resolutionsInRange).flatMap(([eid,arr])=>arr.filter(r=>r.by===p.name).map(r=>({eid:Number(eid),when:r.when})));
    let avgMs=0;
    if(myResolutions.length){
      const durations=myResolutions.map(r=>{
        const start=detectionTimes[r.eid];
        if(!start)return null;
        return new Date(r.when).getTime()-new Date(start).getTime();
      }).filter(d=>d!=null&&d>0);
      if(durations.length)avgMs=durations.reduce((a,b)=>a+b,0)/durations.length;
    }
    const avgTxt=avgMs?(avgMs/86400000).toFixed(1)+'d':'—';
    const oldestAge=arr=>arr.length?Math.max(...arr.map(e=>daysAgo(e.entry_date)||0)):0;
    const cell=(arr,colorWhen)=>{
      if(arr.length===0)return '<span style="color:var(--muted)">0</span>';
      const o=oldestAge(arr);
      const col=o>=colorWhen?'var(--err)':'var(--gray-dk)';
      return `<span style="font-weight:700;color:${col}">${arr.length}</span> <span style="font-size:10px;color:var(--muted)">(oldest ${o}d)</span>`;
    };
    html+=`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:10px;font-weight:600;color:var(--gray-dk)">${esc(p.name)}</td>
      <td style="padding:10px;color:var(--muted);font-size:11px">${projs.length?projs.map(esc).join(', '):'<i>none assigned</i>'}</td>
      <td style="text-align:right;padding:10px">${cell(open.mm,7)}</td>
      <td style="text-align:right;padding:10px">${cell(open.un,7)}</td>
      <td style="text-align:right;padding:10px">${cell(open.lt,3)}</td>
      <td style="text-align:right;padding:10px">${cell(open.od,7)}</td>
      <td style="text-align:right;padding:10px;font-weight:600;color:var(--success)">${myResolutions.length||'—'}</td>
      <td style="text-align:right;padding:10px;font-weight:600;color:var(--gray-dk)">${avgTxt}</td>
    </tr>`;
  });
  // Unassigned aggregate (issues on projects with no one assigned) — for visibility
  const unassignedProjects=projects.filter(pr=>peopleForProject(pr.name).length===0).map(pr=>pr.name);
  if(unassignedProjects.length){
    const myEntries=entries.filter(e=>unassignedProjects.includes(e.project));
    const open={mm:myEntries.filter(e=>hasMismatch(e)&&e.status!=='Cancelled'),
                un:myEntries.filter(e=>e.unmatched&&e.status!=='Cancelled'),
                lt:myEntries.filter(e=>isLateDelivery(e)),
                od:myEntries.filter(e=>isOverdueInstall(e))};
    const total=open.mm.length+open.un.length+open.lt.length+open.od.length;
    if(total){
      html+=`<tr style="border-bottom:1px solid var(--border);background:#FFF8E7">
        <td style="padding:10px;font-weight:600;color:var(--warn-dk)">⚠ Unassigned projects</td>
        <td style="padding:10px;color:var(--muted);font-size:11px">${unassignedProjects.map(esc).join(', ')}</td>
        <td style="text-align:right;padding:10px">${open.mm.length||'<span style="color:var(--muted)">0</span>'}</td>
        <td style="text-align:right;padding:10px">${open.un.length||'<span style="color:var(--muted)">0</span>'}</td>
        <td style="text-align:right;padding:10px">${open.lt.length||'<span style="color:var(--muted)">0</span>'}</td>
        <td style="text-align:right;padding:10px">${open.od.length||'<span style="color:var(--muted)">0</span>'}</td>
        <td style="text-align:right;padding:10px;color:var(--muted)">—</td>
        <td style="text-align:right;padding:10px;color:var(--muted)">—</td>
      </tr>`;
    }
  }
  html+='</tbody></table></div></div>';
  // Per-person drill-down: list the actual issues so it's not just numbers
  dbccPeople.forEach(p=>{
    const projs=projectsForPerson(p.id);
    if(!projs.length)return;
    const myEntries=entries.filter(e=>projs.includes(e.project));
    const issues=[];
    myEntries.filter(e=>hasMismatch(e)&&e.status!=='Cancelled').forEach(e=>issues.push({type:'mismatch',e,age:daysAgo(e.entry_date)||0}));
    myEntries.filter(e=>e.unmatched&&e.status!=='Cancelled').forEach(e=>issues.push({type:'unmatched',e,age:daysAgo(e.entry_date)||0}));
    myEntries.filter(e=>isLateDelivery(e)).forEach(e=>issues.push({type:'late',e,age:daysAgo(e.supplier_delivery_date)||0}));
    myEntries.filter(e=>isOverdueInstall(e)).forEach(e=>issues.push({type:'overdue_install',e,age:daysAgo(e.supplier_delivery_date)||0}));
    if(!issues.length)return;
    issues.sort((a,b)=>b.age-a.age);
    const tag={mismatch:'<span style="background:#FEF3C7;color:#92400E;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">MISMATCH</span>',
               unmatched:'<span style="background:#FED7AA;color:#9A3412;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">UNMATCHED</span>',
               late:'<span style="background:#FEE2E2;color:#991B1B;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">LATE</span>',
               overdue_install:'<span style="background:#FFEDD5;color:#7A4D00;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600">NO INSTALL</span>'};
    html+=`<div class="card" style="margin-bottom:12px"><h4 style="font-size:13px;font-weight:700;color:var(--gray-dk);margin-bottom:10px">${esc(p.name)} — open issues (${issues.length})</h4>
      <div style="display:flex;flex-direction:column;gap:6px">
        ${issues.map(({type,e,age})=>`<div onclick="showDetail(${e.id})" style="display:flex;align-items:center;gap:10px;padding:8px 10px;background:#fff;border:1px solid var(--border);border-radius:6px;cursor:pointer;font-size:12px" onmouseover="this.style.background='#FAFAF8'" onmouseout="this.style.background='#fff'">
          ${tag[type]}
          <span style="flex:1"><b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' <span style="color:var(--accent-dk);font-size:11px">('+esc(e.split_reference)+')</span>':''}${e.schedule?' · <span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;color:var(--accent-dk)">'+esc(e.schedule)+'</span>':''}</span>
          <span style="white-space:nowrap;color:${age>=7?'var(--err)':'var(--muted)'};font-size:11px;font-weight:600">${age}d</span>
        </div>`).join('')}
      </div></div>`;
  });
  body.innerHTML=html;
}


async function loadAuditLog(){const{data,error}=await sb.from('audit_log').select('*').order('created_at',{ascending:false}).limit(300);
  const el=$('adminAudit');
  el.innerHTML=`<div class="card"><h3 style="font-size:15px;font-weight:700;margin-bottom:12px;color:var(--gray-dk)">Change History</h3><div style="max-height:620px;overflow-y:auto">${error?'<div class="empty">Error</div>':!data?.length?'<div class="empty">No activity</div>':data.map(a=>{const t=new Date(a.created_at).toLocaleString('en-AU');let d='';
    if(a.action==='CREATE')d='Created: <b>'+esc(a.new_value)+'</b>';
    else if(a.action==='BULK_CREATE')d='<b>'+esc(a.new_value)+'</b>';
    else if(a.action==='UPDATE')d='<b>'+esc(a.field_changed)+'</b>: "'+esc(a.old_value)+'" → "'+esc(a.new_value)+'"';
    else if(a.action==='CANCEL')d='<b>Cancelled</b> #'+a.entry_id+(a.new_value?' — '+esc(a.new_value):'');
    else if(a.action==='REINSTATE')d='<b>Reinstated</b> #'+a.entry_id;
    else if(a.action==='DELETE')d='<b>Deleted</b>: '+esc(a.old_value);
    else if(a.action==='EMAIL_SENT')d='<b>Email</b>: '+esc(a.new_value);
    else if(a.action==='ON_HOLD')d='<b>On Hold</b>: '+esc(a.old_value||'')+' → '+esc(a.new_value||'');
    else if(a.action==='MISMATCH_RESOLVED')d='<b>Mismatch resolved</b> #'+a.entry_id;
    else if(a.action==='PROJECT_ADD')d='Project added: <b>'+esc(a.new_value)+'</b>';
    else if(a.action==='PROJECT_EDIT')d='Project edited: '+esc(a.old_value)+' → <b>'+esc(a.new_value)+'</b>';
    else if(a.action==='PROJECT_DELETE')d='Project deleted: <b>'+esc(a.old_value)+'</b>';
    else d=esc(a.action)+': '+esc(a.new_value||'');
    return`<div class="audit-item"><div class="audit-time">${t}<span class="audit-user">${esc(a.user_identifier||'?')}</span></div><div class="audit-details">${d}</div></div>`}).join('')}</div></div>`}

/* ═══ SITE VIEW (steel fixers — read-only) ═══ */
function populateSiteDropdowns(){
  const names=projects.map(p=>p.name);
  const pSel=$('svProj');if(pSel){pSel.innerHTML='<option value="">All Projects</option>';names.forEach(n=>pSel.appendChild(new Option(n,n)))}
  const allL=new Set(),allA=new Set();projects.forEach(p=>{p.levels.forEach(l=>allL.add(l));p.areas.forEach(a=>allA.add(a))});
  const lSel=$('svLevel');if(lSel){lSel.innerHTML='<option value="">All Levels</option>';[...allL].sort().forEach(l=>lSel.appendChild(new Option(l,l)))}
  const aSel=$('svArea');if(aSel){aSel.innerHTML='<option value="">All Areas</option>';[...allA].sort().forEach(a=>aSel.appendChild(new Option(a,a)))}
}

function subscribeSiteRealtime(){
  sb.channel('sv_e').on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadEntries().then(()=>renderSite())).subscribe();
  sb.channel('sv_p').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>loadProjects().then(()=>{populateSiteDropdowns();renderSite()})).subscribe()}

function renderSite(){
  const fp=$('svProj').value,fl=$('svLevel').value,fa=$('svArea').value,fq=($('svSearch').value||'').toLowerCase().trim();
  const w=$('siteList');
  // Constrain Level/Area dropdowns to the selected project's own lists
  refreshSiteLevelAreaOptions();
  // Step-by-step gating: require a project first
  if(!fp){
    $('siteCountNum').textContent=0;
    w.innerHTML='<div class="sv-empty" style="padding:80px 20px"><div style="font-size:40px;margin-bottom:10px">📁</div><p style="font-size:14px;font-weight:600;color:var(--gray-dk);margin-bottom:4px">Select a project to begin</p><p>Pick a project from the dropdown above to see schedules and markup plans.</p></div>';
    return}
  let list=entries.filter(e=>e.project===fp);
  if(fl)list=list.filter(e=>e.level===fl);
  if(fa)list=list.filter(e=>e.area===fa);
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area].some(f=>(f||'').toLowerCase().includes(fq)));
  // Sort: pending/ordered first by delivery date (soonest first), then delivered, then cancelled
  const rank={'Not Ordered':0,'Ordered':1,'Scheduled':2,'Delivered':3,'Cancelled':4};
  list.sort((a,b)=>{
    const ra=rank[a.status]??99,rb=rank[b.status]??99;if(ra!==rb)return ra-rb;
    const da=new Date(a.our_delivery_date||'2099-01-01'),db=new Date(b.our_delivery_date||'2099-01-01');
    return da-db});
  $('siteCountNum').textContent=list.length;
  if(!list.length){w.innerHTML='<div class="sv-empty"><p>No schedules match these filters.</p></div>';return}
  w.innerHTML='<div class="sv-list">'+list.map(e=>{
    const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
    const cls=e.status==='Delivered'?' delivered':e.status==='Cancelled'?' cancelled':'';
    const statusPill=`<span class="pill ${ST_CLS[e.status]||'pill-notordered'}">${esc(e.status)}</span>`;
    // Files section
    let filesHtml='';
    if(e.file_url){filesHtml+=`<a class="sv-file-link" href="${e.file_url}" target="_blank" rel="noopener"><span class="sv-file-icon">📄</span><span class="sv-file-name">${esc(e.file_name||'Schedule')}</span></a>`}
    mp.forEach(m=>{filesHtml+=`<a class="sv-file-link markup" href="${m.url}" target="_blank" rel="noopener"><span class="sv-file-icon">📐</span><span class="sv-file-name">${esc(m.name||'Markup plan')}</span></a>`});
    if(!filesHtml)filesHtml='<div class="sv-no-files">No files attached yet</div>';
    return `<div class="sv-card${cls}">
      <div class="sv-card-head">
        <div style="flex:1;min-width:0">
          <div class="sv-proj">${esc(e.project)}</div>
          <div class="sv-loc">${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div>
        </div>
        ${e.schedule?`<span class="sv-sched">${esc(e.schedule)}</span>`:''}
      </div>
      <div class="sv-date">📅 Delivery: <b>${fmtDate(e.our_delivery_date)||'Not set'}</b> · ${statusPill}</div>
      <div class="sv-files">${filesHtml}</div>
    </div>`}).join('')+'</div>'}

// When the project changes in Site View, narrow the Level/Area dropdowns to that project's lists.
function refreshSiteLevelAreaOptions(){
  const fp=$('svProj').value;
  const lSel=$('svLevel'),aSel=$('svArea');if(!lSel||!aSel)return;
  const prevL=lSel.value,prevA=aSel.value;
  let levels=[],areas=[];
  if(fp){const p=projects.find(x=>x.name===fp);if(p){levels=p.levels.slice();areas=p.areas.slice()}}
  else{const allL=new Set(),allA=new Set();projects.forEach(p=>{p.levels.forEach(l=>allL.add(l));p.areas.forEach(a=>allA.add(a))});levels=[...allL].sort();areas=[...allA].sort()}
  lSel.innerHTML='<option value="">All Levels</option>';levels.forEach(l=>lSel.appendChild(new Option(l,l)));
  aSel.innerHTML='<option value="">All Areas</option>';areas.forEach(a=>aSel.appendChild(new Option(a,a)));
  // Preserve prior selection if still valid; otherwise reset
  if(levels.includes(prevL))lSel.value=prevL;
  if(areas.includes(prevA))aSel.value=prevA}

/* ═══ FOREMAN VIEW (b5.2) ═══
   Like site view but with write access to: installed_date + Delivered status.
   Name prompt on first open (localStorage), audit-logged as the foreman's name. */
let foremanName='';
function saveForemanName(){
  const n=($('fmNameInput').value||'').trim();if(!n)return alert('Please enter your name');
  foremanName=n;localStorage.setItem('reo_foreman_name',n);
  $('fmNameOverlay').classList.remove('show');$('fmUserChip').textContent=n;
  // The init() name gate returned early; now that the name is set, re-run init to render the app.
  init();
}
// Audit log helper that uses the foreman's name instead of userName.
// Defensive: if there's no name (shouldn't happen since UI now blocks until set), refuse to
// write a generic 'Foreman' row and re-show the prompt so the gap doesn't go unnoticed.
async function foremanAudit(o){
  if(!foremanName||!foremanName.trim()){
    console.warn('[REO] foremanAudit blocked — no foreman name set. Operation:',o);
    try{$('fmNameOverlay').classList.add('show')}catch(_){}
    return new Error('No foreman name set');
  }
  const{error}=await sb.from('audit_log').insert({...o,user_identifier:foremanName});
  if(error)console.warn('[REO] foremanAudit insert failed:',error.message,o);
  return error;
}
function populateForemanDropdowns(){
  const ps=$('fmProj');if(!ps)return;
  ps.innerHTML='<option value="">All Projects</option>';
  projects.forEach(p=>ps.appendChild(new Option(p.name,p.name)));
  refreshForemanLevelAreaOptions();
}
function refreshForemanLevelAreaOptions(){
  const fp=$('fmProj').value;const lSel=$('fmLevel'),aSel=$('fmArea');if(!lSel||!aSel)return;
  const prevL=lSel.value,prevA=aSel.value;let levels=[],areas=[];
  if(fp){const p=projects.find(x=>x.name===fp);if(p){levels=p.levels.slice();areas=p.areas.slice()}}
  else{const allL=new Set(),allA=new Set();projects.forEach(p=>{p.levels.forEach(l=>allL.add(l));p.areas.forEach(a=>allA.add(a))});levels=[...allL].sort();areas=[...allA].sort()}
  lSel.innerHTML='<option value="">All Levels</option>';levels.forEach(l=>lSel.appendChild(new Option(l,l)));
  aSel.innerHTML='<option value="">All Areas</option>';areas.forEach(a=>aSel.appendChild(new Option(a,a)));
  if(levels.includes(prevL))lSel.value=prevL;
  if(areas.includes(prevA))aSel.value=prevA;
}
function subscribeForemanRealtime(){
  sb.channel('fm_e').on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadEntries().then(()=>renderForeman())).subscribe();
  sb.channel('fm_p').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>loadProjects().then(()=>{populateForemanDropdowns();renderForeman()})).subscribe();
}
function renderForeman(){
  const fp=$('fmProj').value,fl=$('fmLevel').value,fa=$('fmArea').value,fq=($('fmSearch').value||'').toLowerCase().trim();
  const w=$('foremanList');
  refreshForemanLevelAreaOptions();
  if(!fp){
    $('fmCountNum').textContent=0;
    w.innerHTML='<div class="sv-empty" style="padding:80px 20px"><div style="font-size:40px;margin-bottom:10px">📁</div><p style="font-size:14px;font-weight:600;color:var(--gray-dk);margin-bottom:4px">Select a project to begin</p><p>Pick a project from the dropdown above to see deliveries.</p></div>';
    return}
  let list=entries.filter(e=>e.project===fp&&e.status!=='Cancelled');
  if(fl)list=list.filter(e=>e.level===fl);
  if(fa)list=list.filter(e=>e.area===fa);
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area].some(f=>(f||'').toLowerCase().includes(fq)));
  // Sort: not-delivered first by delivery date, then delivered
  list.sort((a,b)=>{
    const da=a.status==='Delivered'?1:0,db=b.status==='Delivered'?1:0;if(da!==db)return da-db;
    const x=new Date(a.our_delivery_date||'2099-01-01'),y=new Date(b.our_delivery_date||'2099-01-01');return x-y});
  $('fmCountNum').textContent=list.length;
  if(!list.length){w.innerHTML='<div class="sv-empty"><p>No deliveries match these filters.</p></div>';return}
  w.innerHTML='<div class="sv-list">'+list.map(e=>{
    const delivered=e.status==='Delivered';
    const cls=delivered?' delivered':'';
    const statusPill=`<span class="pill ${ST_CLS[e.status]||'pill-notordered'}">${esc(e.status)}</span>`;
    let filesHtml='';
    if(e.file_url){filesHtml+=`<a class="sv-file-link" href="${e.file_url}" target="_blank" rel="noopener"><span class="sv-file-icon">📄</span><span class="sv-file-name">${esc(e.file_name||'Schedule')}</span></a>`}
    const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
    mp.forEach(m=>{filesHtml+=`<a class="sv-file-link markup" href="${m.url}" target="_blank" rel="noopener"><span class="sv-file-icon">📐</span><span class="sv-file-name">${esc(m.name||'Markup plan')}</span></a>`});
    if(!filesHtml)filesHtml='<div class="sv-no-files">No files attached yet</div>';
    // Action row: install date + delivered toggle
    const installHtml=e.installed_date
      ? `<div class="fm-installed">✓ Installed: <b>${fmtDate(e.installed_date)}</b> <button class="fm-mini-btn" onclick="foremanSetInstall(${e.id})">Change</button></div>`
      : `<button class="fm-action-btn install" onclick="foremanSetInstall(${e.id})">📌 Set Install Date</button>`;
    const deliveredHtml=delivered
      ? `<button class="fm-action-btn undo" onclick="foremanUndoDelivered(${e.id})">↩ Undo Delivered</button>`
      : `<button class="fm-action-btn deliver" onclick="foremanMarkDelivered(${e.id})">✓ Mark Delivered</button>`;
    return `<div class="sv-card${cls}">
      <div class="sv-card-head">
        <div style="flex:1;min-width:0">
          <div class="sv-proj">${esc(e.project)}</div>
          <div class="sv-loc">${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' ('+esc(e.split_reference)+')':''}</div>
        </div>
        ${e.schedule?`<span class="sv-sched">${esc(e.schedule)}</span>`:''}
      </div>
      <div class="sv-date">📅 Delivery: <b>${fmtDate(e.our_delivery_date)||'Not set'}</b> · ${statusPill}</div>
      <div class="sv-files">${filesHtml}</div>
      <div class="fm-actions">${deliveredHtml}${installHtml}</div>
    </div>`}).join('')+'</div>'}

async function foremanMarkDelivered(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  await sb.from('entries').update({status:'Delivered'}).eq('id',id);
  await foremanAudit({entry_id:id,action:'UPDATE',field_changed:'status',old_value:e.status,new_value:'Delivered'});
  await loadEntries();renderForeman();
}
async function foremanUndoDelivered(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  // Revert to a sensible prior status: Scheduled if it has a schedule, else Ordered/Not Ordered.
  const revert=e.schedule?'Scheduled':(e.our_delivery_date?'Ordered':'Not Ordered');
  await sb.from('entries').update({status:revert}).eq('id',id);
  await foremanAudit({entry_id:id,action:'UPDATE',field_changed:'status',old_value:'Delivered',new_value:revert+' (undo)'});
  await loadEntries();renderForeman();
}
function foremanSetInstall(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  $('weightModal').innerHTML=`<h3>Install Date<button class="modal-close" onclick="closeOv('weightOv')">&times;</button></h3><p style="font-size:12px;color:var(--muted);margin-bottom:10px">${esc(e.project)} / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.schedule?' · '+esc(e.schedule):''}</p><div class="fg"><label style="display:block;margin-bottom:4px">Date installed on site</label><input type="date" id="fmDateInp" value="${e.installed_date||''}"></div><div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px"><button class="btn btn-err btn-sm" onclick="foremanClearInstall(${id})" style="width:auto" ${e.installed_date?'':'disabled'}>Clear</button><div style="display:flex;gap:8px"><button class="btn btn-sec btn-sm" onclick="closeOv('weightOv')">Cancel</button><button class="btn btn-sm" onclick="foremanSaveInstall(${id})" style="width:auto">Save</button></div></div>`;
  $('weightOv').classList.add('show');
}
async function foremanSaveInstall(id){
  const v=$('fmDateInp').value,nv=v||null;const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({installed_date:nv}).eq('id',id);
  await foremanAudit({entry_id:id,action:'UPDATE',field_changed:'installed_date',old_value:String(e.installed_date||''),new_value:String(nv||'')});
  closeOv('weightOv');await loadEntries();renderForeman();
}
async function foremanClearInstall(id){
  const e=entries.find(x=>x.id===id);
  await sb.from('entries').update({installed_date:null}).eq('id',id);
  await foremanAudit({entry_id:id,action:'UPDATE',field_changed:'installed_date',old_value:String(e.installed_date||''),new_value:''});
  closeOv('weightOv');await loadEntries();renderForeman();
}

init();
