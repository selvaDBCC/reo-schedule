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
function getStatusPill(s,t,hold){let h='';if(t==='loose')h='<span class="pill pill-loose">Ad Hoc</span> ';h+='<span class="pill '+(ST_CLS[s]||'pill-notordered')+'">'+esc(s)+'</span>';if(hold)h+='<span class="pill pill-onhold">⏸ ON HOLD</span>';return h}
function parseAusDate(s){const p=s.split('/');if(p.length!==3)return null;let[d,m,y]=p;if(y.length===2)y='20'+y;return`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`}
async function auditLog(o){await sb.from('audit_log').insert({...o,user_identifier:userName})}
function confirmDialog(title,msg,okLabel,okClass,onOk){
  $('confirmModal').innerHTML=`<h3>${esc(title)}<button class="modal-close" onclick="closeOv('confirmOv')">&times;</button></h3><p style="font-size:13px;color:var(--mid);margin-bottom:16px;line-height:1.5">${msg}</p><div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-sec btn-sm" onclick="closeOv('confirmOv')">Cancel</button><button class="btn ${okClass||''} btn-sm" id="confirmOkBtn" style="width:auto">${esc(okLabel||'OK')}</button></div>`;
  $('confirmOv').classList.add('show');
  $('confirmOkBtn').onclick=()=>{closeOv('confirmOv');onOk()}}

/* ═══ INIT ═══ */
async function waitForSupabase(maxMs=8000){const start=Date.now();while(typeof supabase==='undefined'){if(Date.now()-start>maxMs)throw new Error('Supabase client library failed to load. Check your internet connection.');await new Promise(r=>setTimeout(r,100))}}
function isSiteViewMode(){try{return new URLSearchParams(location.search).get('view')==='site'}catch(_){return false}}
async function init(){
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
  if(!userName){$('loadingScreen').style.display='none';$('nameOverlay').classList.add('show');return}
  $('nameOverlay').classList.remove('show');
  $('userChip').textContent=userName;
  try{
    await loadProjects();if(projects.length===0)await seedProjects();
    await loadEntries();await loadEmailContacts();populateDropdowns();subscribeRealtime();
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
async function refreshAll(){await Promise.all([loadProjects(),loadEntries()]);populateDropdowns();renderDash()}
function subscribeRealtime(){
  sb.channel('e').on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadEntries().then(renderDash)).subscribe();
  sb.channel('p').on('postgres_changes',{event:'*',schema:'public',table:'projects'},()=>loadProjects().then(()=>{populateDropdowns();if(adminUnlocked)renderProjList()})).subscribe()}

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
    content.innerHTML=`<div class="warn-msg" style="margin-top:0">No orders found.${level&&area?' You can still submit — it will be flagged as <b>Unmatched</b>.':' Select level and area to narrow down.'}</div>`;
    if(level&&area){$('uploadSection').style.display='block';$('uploadStepLabel').textContent='② Upload Schedule';$('detailsStepLabel').textContent='③ Schedule Details';$('commentsSection').style.display='block';$('submitBtn').style.display='block';selectedOrderId=null}
    return}
  sec.style.display='block';
  let html='<p style="font-size:12px;color:var(--muted);margin-bottom:10px">Orders for <b>'+esc(proj)+'</b>'+(level?' / '+esc(level):'')+(area?' / '+esc(area):'')+':</p>';
  matching.forEach(e=>{
    const has=!!e.schedule,can=!has&&e.status!=='Cancelled'&&e.status!=='Delivered';
    html+=`<div class="order-item${selectedOrderId===e.id?' selected':''}${can?'':' disabled'}" ${can?`onclick="selectOrder(${e.id})"`:''}><div class="order-item-info"><div class="oi-title">${esc(e.level||'—')} / ${esc(e.area||'—')}${e.split_reference?' <span style="color:var(--accent-dk)">('+esc(e.split_reference)+')</span>':''}</div><div class="oi-meta">Ordered Delivery: ${fmtDate(e.our_delivery_date)||'Not set'} · ${e.status}${has?' · '+esc(e.schedule):''}</div></div><div>${has?'<span class="pill pill-scheduled">Has Schedule</span>':can?'<span class="pill pill-ordered">Attach →</span>':'<span class="pill pill-cancelled">'+esc(e.status)+'</span>'}</div></div>`});
  content.innerHTML=html}

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
    mz.addEventListener('drop',e=>{if(e.dataTransfer.files.length)addMarkups(e.dataTransfer.files)})}}

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
  // Weight — "Wt: 10,014 T" then fallback "Total Weight: X Tonne"
  m=t.match(/Wt:\s*([\d.,]+)\s*T/i);if(m){const v=parseReoNum(m[1]);if(!isNaN(v))e.weight=v}
  if(e.weight==null){m=a.match(/Total\s*Weight:\s*([\d.,]+)\s*Tonne/i);if(m){const v=parseReoNum(m[1]);if(!isNaN(v))e.weight=v}}

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
  // ── BAR SUMMARY TOTAL ──
  // Native PDF: "TOTAL items pieces tonne" appears on a single line. Strict same-line match works.
  // OCR PDF: Tesseract often reads the row labels first ("N12, N16, TOTAL") then dumps all data
  // rows beneath, so a greedy "TOTAL\s+\d+\s+\d+\s+\d+" picks up the FIRST data row, not the total.
  // Fix: prefer same-line strict match; otherwise scan all 3-number rows in scope and use the last.
  const bsIdx=a.search(/BAR\s*SUMMARY/i);
  if(bsIdx>=0){
    const slice=a.slice(bsIdx);
    const endIdx=slice.search(/MISCELLANEOUS\s*PRODUCT\s*SUMMARY/i);
    const scope=endIdx>0?slice.slice(0,endIdx):slice;
    // Strict same-line TOTAL (uses [ \t]+ instead of \s+ to NOT cross newlines)
    let bw=null;
    const strictTm=scope.match(/TOTAL[ \t]+(\d+)[ \t]+([\d.,]+)[ \t]+([\d.,]+)/i);
    if(strictTm){const v=parseReoNum(strictTm[3]);if(!isNaN(v))bw=v}
    if(bw===null){
      // OCR fallback: collect all (items, pieces, tonne) rows in scope; the last is the total.
      const rowRe=/(?:^|\s)(\d{1,3})\s+([\d,]+)\s+([\d.]+)(?=\s|$)/g;
      const rows=[];let rm;
      while((rm=rowRe.exec(scope))!==null){
        const items=parseInt(rm[1],10);
        // Use parseReoInt for pieces — it strips commas without treating "2,794" as "2.794"
        const pieces=parseReoInt(rm[2]);
        const tonne=parseReoNum(rm[3]);
        if(isNaN(items)||isNaN(pieces)||isNaN(tonne))continue;
        if(items<1||items>999)continue;
        if(pieces<items)continue;
        if(!/\./.test(rm[3]))continue;
        if(tonne<0.001||tonne>9999)continue;
        rows.push(tonne);
      }
      if(rows.length)bw=rows[rows.length-1];
    }
    if(bw!=null)e.barWeight=bw;
  }
  // ── MESH (SL/RL codes) sum of qty × width × length ──
  let meshSqm=0,meshFound=false;
  const meshRe=/\b((?:SL|RL)\d+[A-Z]*)\s+([\d.,]+)\s+Each\s+(?:Square|Rectangular|Reinforcing)?\s*Mesh\s+(?:(?:SL|RL)\d+[A-Z]*\s+)?effective\s*area\s*([\d.,]+)\s*[xX]\s*([\d.,]+)\s*m/gi;
  let mm;while((mm=meshRe.exec(a))!==null){
    const qty=parseReoInt(mm[2]),w=parseReoDim(mm[3]),l=parseReoDim(mm[4]);
    if(!isNaN(qty)&&!isNaN(w)&&!isNaN(l)){meshSqm+=qty*w*l;meshFound=true}}
  // ── TRENCH MESH (TM codes + "Trench Mesh" text) sum of qty × longer dimension ──
  let trenchLm=0,trenchFound=false;
  const trenchRe=/\b([A-Z]*\d*TM\d+[A-Z]*)\s+([\d.,]+)\s+Each\s+Trench\s*Mesh\s+(?:\d+mm\s+)?([\d.,]+)\s*[xX]\s*([\d.,]+)\s*m/gi;
  let tr;while((tr=trenchRe.exec(a))!==null){
    const qty=parseReoInt(tr[2]),aa=parseReoDim(tr[3]),bb=parseReoDim(tr[4]);
    if(!isNaN(qty)&&!isNaN(aa)&&!isNaN(bb)){trenchLm+=qty*Math.max(aa,bb);trenchFound=true}}
  if(meshFound)e.meshSqm=Math.round(meshSqm*100)/100;
  if(trenchFound)e.trenchLm=Math.round(trenchLm*100)/100;
  // Diagnostic — logs the final extraction state. Helps debug when browser Tesseract
  // produces different output than expected. Safe to leave on; trivial overhead.
  if(typeof console!=='undefined'&&console.log){
    console.log('[REO PARSE]',{
      ctrl:e.ctrlCode||null,date:e.shipDate||null,wt:e.weight??null,
      bar:e.barWeight??null,mesh:e.meshSqm??null,trench:e.trenchLm??null,
      textLen:a.length,
      hasShipLabel:/Ship\s*Date/i.test(a),
      hasTolerantShipLabel:/\bS[a-z]{2,4}\s+D[a-z]{2,4}/i.test(a),
      allDates:(a.match(/\d{1,2}\/\d{1,2}\/\d{2,4}/g)||[]).slice(0,8),
      first400:a.slice(0,400)
    });
  }
  return e}

// Get text from a PDF using its native text layer. Returns {pageOneText, allText, hasText, numPages}.
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
      const{data,error}=await sb.from('entries').insert({project,level:level||null,area:area||null,schedule:null,status:'Not Ordered',entry_date:ed,comments:desc+(comments?'\n'+comments:''),file_url:furl,file_name:fname,entry_type:'loose'}).select().single();
      if(error)throw error;
      await auditLog({entry_id:data.id,action:'CREATE',new_value:`LOOSE: ${project}/${level||'-'}/${area||'-'}`});
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
      const breakdown={bar_weight:ex.barWeight!=null?ex.barWeight:null,mesh_sqm:ex.meshSqm!=null?ex.meshSqm:null,trench_mesh_lm:ex.trenchLm!=null?ex.trenchLm:null,extraction_method:ex._extractionMethod||null};
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
        const{data,error}=await sb.from('entries').insert({project,level:level||null,area:area||null,schedule,status:'Scheduled',entry_date:ed,comments:comments||null,file_url:furl,file_name:fname,entry_type:'scheduled',total_weight:weight?parseFloat(weight):null,drawing_reference:drawing,supplier_delivery_date:supD,markup_plans:mkNew.length?JSON.stringify(mkNew):null,unmatched:true,...breakdown}).select().single();
        if(error)throw error;
        await auditLog({entry_id:data.id,action:'CREATE',new_value:`UNMATCHED: ${project}/${level||'-'}/${schedule}`});
      }}
    info.innerHTML='';$('successOv').classList.add('show');
  }catch(e){err.innerHTML='<div class="error-msg">'+esc(e.message)+'</div>'}
  btn.disabled=false;btn.textContent='Submit Entry'}

function resetForm(){
  $('selProj').value='';$('inpSched').value='';$('inpDate').value=today();$('inpLooseDate').value=today();
  $('inpLooseDesc').value='';$('inpComm').value='';$('inpSupDate').value='';$('inpWeight').value='';
  $('inpDrawing').value='';pendingFile=null;pendingMarkups=[];selectedOrderId=null;
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
  if(fq)list=list.filter(e=>[e.schedule,e.project,e.level,e.area,e.comments,e.drawing_reference].some(f=>(f||'').toLowerCase().includes(fq)));
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
  w.innerHTML=`<table><thead><tr><th class="no-sort" style="width:36px"><input type="checkbox" ${allCk?'checked':''} onchange="toggleAll(this.checked)"></th><th onclick="tSort('project')">Project${ar('project')}</th><th onclick="tSort('level')">Level${ar('level')}</th><th onclick="tSort('area')">Area${ar('area')}</th><th onclick="tSort('schedule')">Schedule${ar('schedule')}</th><th onclick="tSort('total_weight')">Wt${ar('total_weight')}</th><th onclick="tSort('status')">Status${ar('status')}</th><th onclick="tSort('our_delivery_date')">Ordered Delivery${ar('our_delivery_date')}</th><th onclick="tSort('supplier_delivery_date')">Supplier${ar('supplier_delivery_date')}</th><th onclick="tSort('entry_date')">Submitted${ar('entry_date')}</th><th class="no-sort">Schedule File</th><th class="no-sort">Markup Plans</th><th class="no-sort" style="max-width:140px">Comments</th><th class="no-sort">Actions</th></tr></thead><tbody>${f.map(e=>{
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
<td class="comment-td" onclick="editComment(${e.id})" title="${esc(e.comments||'')}"><div class="comment-preview">${esc(e.comments||'—')}</div></td>
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
    const up={schedule:s,entry_date:sub,supplier_delivery_date:sd,file_url:furl,file_name:file.name,status:'Scheduled',total_weight:wt?parseFloat(wt):null,drawing_reference:dr||null,bar_weight:ex.barWeight!=null?ex.barWeight:null,mesh_sqm:ex.meshSqm!=null?ex.meshSqm:null,trench_mesh_lm:ex.trenchLm!=null?ex.trenchLm:null,extraction_method:ex._extractionMethod||null};
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
<div class="drow"><div class="dlbl">Comments</div><div class="dval">${esc(e.comments)||'—'}</div></div>
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
  const removeSchedSection=e.file_url||e.schedule
    ? `<div style="margin-top:14px;padding:12px 14px;background:#FFF8E7;border:1px solid #F0D785;border-radius:8px"><div style="font-size:12px;font-weight:600;color:var(--gray-dk);margin-bottom:4px">⚠ Remove Attached Schedule</div><p style="font-size:11px;color:var(--muted);margin-bottom:8px;line-height:1.5">Use this if the wrong schedule was uploaded. The schedule file, schedule number, supplier date, drawing reference, and weight breakdown will be cleared. The placeholder entry stays so you can re-attach the correct schedule.</p><button class="btn btn-err btn-sm" onclick="removeScheduleFromEntry(${id})" style="width:auto">Remove Schedule from this Entry</button></div>`
    : '';
  $('editModal').innerHTML=`<h3>Edit Entry<button class="modal-close" onclick="closeOv('editOv')">&times;</button></h3>
<div class="fg"><label>Project</label><select id="ed_proj">${projects.map(p=>`<option${p.name===e.project?' selected':''}>${esc(p.name)}</option>`).join('')}</select></div>
<div class="row2"><div class="fg"><label>Level</label><select id="ed_level"><option value="">None</option>${(proj?proj.levels:[]).map(l=>`<option${l===e.level?' selected':''}>${esc(l)}</option>`).join('')}</select></div><div class="fg"><label>Area</label><select id="ed_area"><option value="">None</option>${(proj?proj.areas:[]).map(a=>`<option${a===e.area?' selected':''}>${esc(a)}</option>`).join('')}</select></div></div>
<div class="row2"><div class="fg"><label>Schedule</label><input type="text" id="ed_sched" value="${esc(e.schedule||'')}" style="font-family:'JetBrains Mono',monospace"></div><div class="fg"><label>Submission Date</label><input type="date" id="ed_date" value="${e.entry_date||''}"></div></div>
<div class="row2"><div class="fg"><label>Ordered Delivery Date</label><input type="date" id="ed_ourD" value="${e.our_delivery_date||''}"></div><div class="fg"><label>Supplier Delivery Date</label><input type="date" id="ed_supD" value="${e.supplier_delivery_date||''}"></div></div>
<div class="row2"><div class="fg"><label>Drawing Reference</label><input type="text" id="ed_draw" value="${esc(e.drawing_reference||'')}"></div><div class="fg"><label>Weight (T)</label><input type="number" step="0.001" id="ed_wt" value="${e.total_weight||''}" style="font-family:'JetBrains Mono',monospace"></div></div>
<div class="fg"><label>Split Reference</label><input type="text" id="ed_split" value="${esc(e.split_reference||'')}"></div>
<div class="fg"><label>Comments</label><textarea id="ed_comm">${esc(e.comments||'')}</textarea></div>
${removeSchedSection}
<div id="edErr"></div>
<div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end"><button class="btn btn-sec btn-sm" onclick="closeOv('editOv')">Cancel</button><button class="btn btn-sm" onclick="saveEdit(${id})" style="width:auto">Save</button></div>`;
  $('editOv').classList.add('show');
  $('ed_proj').onchange=()=>{const pn=$('ed_proj').value,p=projects.find(x=>x.name===pn);$('ed_level').innerHTML='<option value="">None</option>'+(p?p.levels.map(l=>`<option>${esc(l)}</option>`).join(''):'');$('ed_area').innerHTML='<option value="">None</option>'+(p?p.areas.map(a=>`<option>${esc(a)}</option>`).join(''):'')}}

function removeScheduleFromEntry(id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  confirmDialog(
    'Remove Schedule?',
    'This will clear the schedule file, schedule number, supplier date, drawing reference, and weight breakdown for:<br><br><b>'+esc(e.project)+'</b> / '+esc(e.level||'—')+' / '+esc(e.area||'—')+(e.schedule?' · '+esc(e.schedule):'')+'<br><br>The placeholder entry will remain so a new schedule can be attached. Markup plans will also be cleared. This cannot be undone.',
    'Remove Schedule',
    'btn-err',
    async()=>{
      const newStatus=e.our_delivery_date?'Ordered':'Not Ordered';
      const{error}=await sb.from('entries').update({
        schedule:null,file_url:null,file_name:null,
        supplier_delivery_date:null,drawing_reference:null,total_weight:null,
        bar_weight:null,mesh_sqm:null,trench_mesh_lm:null,
        markup_plans:null,
        status:newStatus,mismatch_resolved:true
      }).eq('id',id);
      if(error){alert('Error: '+error.message);return}
      await auditLog({entry_id:id,action:'UPDATE',field_changed:'schedule_removed',old_value:e.schedule||e.file_name||'',new_value:'cleared'});
      closeOv('editOv');await loadEntries();renderDash()})}

async function saveEdit(id){const e=entries.find(x=>x.id===id);if(!e)return;const err=$('edErr');err.innerHTML='';
  const nv={project:$('ed_proj').value,level:$('ed_level').value||null,area:$('ed_area').value||null,schedule:$('ed_sched').value.trim()||null,entry_date:$('ed_date').value||null,our_delivery_date:$('ed_ourD').value||null,supplier_delivery_date:$('ed_supD').value||null,drawing_reference:$('ed_draw').value.trim()||null,total_weight:$('ed_wt').value?parseFloat($('ed_wt').value):null,split_reference:$('ed_split').value.trim()||null,comments:$('ed_comm').value.trim()||null};
  if(!nv.project)return err.innerHTML='<div class="error-msg">Project required</div>';
  if(e.status==='Not Ordered'&&nv.our_delivery_date)nv.status='Ordered';
  if((e.status==='Not Ordered'||e.status==='Ordered')&&nv.schedule)nv.status='Scheduled';
  if(nv.our_delivery_date&&nv.supplier_delivery_date&&nv.our_delivery_date!==nv.supplier_delivery_date&&(e.our_delivery_date!==nv.our_delivery_date||e.supplier_delivery_date!==nv.supplier_delivery_date)){nv.mismatch_resolved=false}
  const ch=[];['project','level','area','schedule','entry_date','our_delivery_date','supplier_delivery_date','drawing_reference','total_weight','split_reference','comments'].forEach(k=>{if(String(e[k]||'')!==String(nv[k]||''))ch.push({field:k,old:e[k]||'',new:nv[k]||''})});
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
  let url=`mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(sub)}&body=${encodeURIComponent(body)}`;
  if(cc)url+=`&cc=${encodeURIComponent(cc)}`;
  window.open(url,'_blank');
  const auditNote='To: '+to+(cc?' · CC: '+cc:'')+' — '+sub;
  await auditLog({entry_id:id,action:'EMAIL_SENT',field_changed:context,new_value:auditNote});
  closeOv('emailOv')}

/* ═══ EXPORT ═══ */
function exportCSV(){const d=getFiltered();if(!d.length)return alert('No data');
  const h=['Project','Level','Area','Split','Schedule','Drawing','Weight','Status','On Hold','Type','Ordered Delivery','Supplier Date','Submitted','Comments','File'];
  const rows=d.map(e=>[e.project,e.level||'',e.area||'',e.split_reference||'',e.schedule||'',e.drawing_reference||'',e.total_weight||'',e.status,e.on_hold?'Yes':'',e.entry_type,e.our_delivery_date||'',e.supplier_delivery_date||'',e.entry_date||'',e.comments||'',e.file_name||'']);
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
  const{data,error}=await sb.from('audit_log').select('*').in('action',NOTIF_ACTIONS).order('created_at',{ascending:false}).limit(500);
  if(error){el.innerHTML='<div class="empty"><p>Error loading notifications</p></div>';return}
  window._notifData=data;renderNotif()}

function renderNotif(){
  const data=window._notifData||[];const el=$('notifList');
  const ft=$('nfType').value,fp=$('nfProj').value,fq=$('nfSearch').value.toLowerCase().trim();
  // Build entry map for project lookup
  const em={};entries.forEach(e=>em[e.id]=e);
  let list=data.slice();
  if(ft)list=list.filter(a=>a.action===ft);
  // Only keep UPDATE actions that are delivery-related
  list=list.filter(a=>a.action!=='UPDATE'||DELIVERY_FIELDS.includes(a.field_changed)||!a.field_changed);
  if(fp)list=list.filter(a=>{const e=em[a.entry_id];return e&&e.project===fp});
  if(fq)list=list.filter(a=>{const e=em[a.entry_id];const hay=[a.action,a.field_changed,a.old_value,a.new_value,a.user_identifier,e?e.project:'',e?e.level:'',e?e.area:''].join(' ').toLowerCase();return hay.includes(fq)});
  if(!list.length){el.innerHTML='<div class="empty"><p>No notifications match.</p></div>';return}
  el.innerHTML=list.map(a=>{
    const e=em[a.entry_id];const ctx=e?`<b>${esc(e.project)}</b> / ${esc(e.level||'—')} / ${esc(e.area||'—')}${e.schedule?' <span style="font-family:\'JetBrains Mono\',monospace;color:var(--accent-dk)">'+esc(e.schedule)+'</span>':''}`:'';
    let icon='update',iconChar='✎',msg='';
    if(a.action==='CREATE'){icon='create';iconChar='+';msg=`New entry created — ${ctx}`}
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
function showAdminSub(s){['proj','program','fixers','contacts','audit'].forEach(t=>{
  const tab=$('at'+t.charAt(0).toUpperCase()+t.slice(1));if(tab)tab.classList.toggle('active',t===s);
  const panel=$('admin'+t.charAt(0).toUpperCase()+t.slice(1));if(panel)panel.style.display=t===s?'block':'none'});
  if(s==='proj')renderAdminProj();if(s==='program')renderAdminProgram();if(s==='fixers')renderAdminFixers();if(s==='contacts')renderAdminContacts();if(s==='audit')loadAuditLog()}

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
  $('adminProgram').innerHTML=`<div class="card" style="margin-bottom:20px"><div class="fg"><label>Select Project</label><select id="dpProj" onchange="onDpProjChange()"><option value="">Choose...</option>${projects.map(p=>`<option>${esc(p.name)}</option>`).join('')}</select></div></div><div id="dpContent" style="display:none"><div class="card" style="margin-bottom:20px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:8px"><div><h3 style="font-size:15px;font-weight:700;color:var(--gray-dk);margin-bottom:2px">Level / Area Grid</h3><p style="font-size:12px;color:var(--muted)">Tick to create placeholders. Green = exists.</p></div><div style="display:flex;gap:6px"><button class="btn btn-ghost btn-sm" onclick="dpSelectAll()">Select All</button><button class="btn btn-ghost btn-sm" onclick="dpClearAll()">Clear</button></div></div><div class="grid-wrap" id="dpGridWrap"></div></div><div id="dpSelArea" style="display:none"><div class="card"><h3 style="font-size:15px;font-weight:700;color:var(--gray-dk);margin-bottom:4px">Selected (<span id="dpSelCount">0</span>)</h3><p style="font-size:12px;color:var(--muted);margin-bottom:14px">Set splits and per-delivery dates.</p><div id="dpSelList"></div><button class="btn" onclick="dpCreate()" id="dpCreateBtn">Create Placeholder Entries</button><div id="dpErr"></div><div id="dpSuc"></div></div></div></div>`}

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
    sel.splits.forEach((sp,i)=>{const ph=sel.splits.length>1?'Part '+(i+1):'No split';
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
  <p style="font-size:12px;color:var(--muted);margin-bottom:14px">Processed bar weight, mesh, and trench mesh extracted from each schedule. Values are editable if the PDF extraction missed anything.</p>
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
    return sfSort.asc?String(va||'').localeCompare(String(vb||'')):String(vb||'').localeCompare(String(va||''))});
  return list}

function renderSfTable(){
  const list=getSfFiltered();
  const w=$('sfTable');if(!w)return;
  if(!list.length){w.innerHTML='<div class="empty"><p>No entries with schedules attached yet.</p></div>';return}
  const ar=c=>sfSort.col===c?(sfSort.asc?' ▲':' ▼'):'';
  let sumBar=0,sumMesh=0,sumTr=0,sumInstalled=0;
  list.forEach(e=>{sumBar+=parseFloat(e.bar_weight)||0;sumMesh+=parseFloat(e.mesh_sqm)||0;sumTr+=parseFloat(e.trench_mesh_lm)||0;if(e.installed_date)sumInstalled++});
  w.innerHTML=`<table><thead><tr>
<th onclick="sfTSort('project')">Project${ar('project')}</th>
<th onclick="sfTSort('level')">Level${ar('level')}</th>
<th onclick="sfTSort('area')">Area${ar('area')}</th>
<th onclick="sfTSort('schedule')">Schedule${ar('schedule')}</th>
<th onclick="sfTSort('our_delivery_date')">Ordered Delivery${ar('our_delivery_date')}</th>
<th onclick="sfTSort('bar_weight')" style="text-align:right">Bar Weight (T)${ar('bar_weight')}</th>
<th onclick="sfTSort('mesh_sqm')" style="text-align:right">Mesh (m²)${ar('mesh_sqm')}</th>
<th onclick="sfTSort('trench_mesh_lm')" style="text-align:right">Trench Mesh (LM)${ar('trench_mesh_lm')}</th>
<th class="no-sort">Schedule File</th>
<th class="no-sort">Markup Plans</th>
<th onclick="sfTSort('installed_date')">Installed Date${ar('installed_date')}</th>
</tr></thead><tbody>${list.map(e=>{
  const mp=e.markup_plans?JSON.parse(e.markup_plans):[];
  const mpCell=mp.length
    ? `<button class="att-link markup-link" onclick="viewMarkups(${e.id})" style="border:none;cursor:pointer;font-family:inherit">📐 ${mp.length}</button>`
    : '<span style="color:#ccc">—</span>';
  const instDate=e.installed_date
    ? `<span class="weight-td" onclick="sfEditInstalled(${e.id})" style="white-space:nowrap;font-size:11px">${fmtDate(e.installed_date)}</span>`
    : `<span class="weight-td" onclick="sfEditInstalled(${e.id})" style="color:#ccc;font-size:11px">Set date</span>`;
  return `<tr>
<td class="proj-td" title="${esc(e.project)}">${esc(e.project)}${e.extraction_method==='ocr'?' <span class="ocr-badge" title="This entry was extracted using OCR — please double-check the values">🔍 OCR</span>':''}</td>
<td>${esc(e.level||'—')}${e.split_reference?' <span style="font-size:10px;color:var(--accent-dk);font-weight:600">('+esc(e.split_reference)+')</span>':''}</td>
<td title="${esc(e.area||'')}">${esc(e.area||'—')}</td>
<td class="sched-td">${esc(e.schedule)}</td>
<td style="white-space:nowrap;font-size:11px">${fmtDate(e.our_delivery_date)||'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('bar_weight',${e.id})">${e.bar_weight!=null?parseFloat(e.bar_weight).toFixed(3):'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('mesh_sqm',${e.id})">${e.mesh_sqm!=null?parseFloat(e.mesh_sqm).toFixed(2):'<span style="color:#ccc">—</span>'}</td>
<td class="weight-td" style="text-align:right" onclick="sfEdit('trench_mesh_lm',${e.id})">${e.trench_mesh_lm!=null?parseFloat(e.trench_mesh_lm).toFixed(2):'<span style="color:#ccc">—</span>'}</td>
<td><a class="att-link" href="${e.file_url}" target="_blank">📄 ${esc((e.file_name||'').slice(0,16))}</a></td>
<td>${mpCell}</td>
<td>${instDate}</td>
</tr>`}).join('')}
<tr style="background:#FAFAF8;font-weight:700;border-top:2px solid var(--border)">
<td colspan="5" style="text-align:right;color:var(--gray-dk)">TOTALS (${list.length} entries)</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumBar.toFixed(3)} T</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumMesh.toFixed(2)} m²</td>
<td class="sched-td" style="text-align:right;color:var(--accent-dk)">${sumTr.toFixed(2)} LM</td>
<td></td>
<td></td>
<td class="sched-td" style="color:var(--accent-dk);font-size:11px">${sumInstalled}/${list.length} installed</td>
</tr>
</tbody></table>`}

function sfTSort(c){if(sfSort.col===c)sfSort.asc=!sfSort.asc;else{sfSort.col=c;sfSort.asc=true}renderSfTable()}

function sfEdit(field,id){
  const e=entries.find(x=>x.id===id);if(!e)return;
  const labels={bar_weight:'Bar Weight (T)',mesh_sqm:'Square Mesh (m²)',trench_mesh_lm:'Trench Mesh (LM)'};
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

function exportSfCSV(){
  const list=getSfFiltered();if(!list.length)return alert('No data');
  const h=['Project','Level','Area','Split','Schedule','Ordered Delivery','Bar Weight (T)','Mesh (m²)','Trench Mesh (LM)','Markup Plans','Installed Date','File'];
  const rows=list.map(e=>{const mp=e.markup_plans?JSON.parse(e.markup_plans):[];return [e.project,e.level||'',e.area||'',e.split_reference||'',e.schedule||'',e.our_delivery_date||'',e.bar_weight??'',e.mesh_sqm??'',e.trench_mesh_lm??'',mp.length,e.installed_date||'',e.file_name||'']});
  // Totals row
  let sumBar=0,sumMesh=0,sumTr=0,sumInstalled=0;list.forEach(e=>{sumBar+=parseFloat(e.bar_weight)||0;sumMesh+=parseFloat(e.mesh_sqm)||0;sumTr+=parseFloat(e.trench_mesh_lm)||0;if(e.installed_date)sumInstalled++});
  rows.push(['','','','','','TOTALS',sumBar.toFixed(3),sumMesh.toFixed(2),sumTr.toFixed(2),'',sumInstalled+'/'+list.length+' installed','']);
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

init();
