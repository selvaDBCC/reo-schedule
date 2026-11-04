// REO b5.14 (release R1) — tests for the front-end guard rails. Plain node:test, no packages, nothing touches a server.
// Run from the repo root:  node --test   (finds tests/*.test.mjs; Node 24 reads "node --test tests/" as a file and fails)
//
// app.js is a browser script, not a module, so it is loaded here the way the page loads it — minus the final init() —
// inside a node:vm context with the few globals its top level touches stubbed. Every function in it is then callable
// and the tests check the real code, not a copy.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// R1_APP_JS lets a mutation check point the same tests at a deliberately broken copy (they must then fail).
const SRC=readFileSync(process.env.R1_APP_JS||new URL('../app.js',import.meta.url),'utf8');

function loadApp(){
  const body=SRC.replace(/\ninit\(\);\s*$/,'\n');
  assert.notEqual(body,SRC,'app.js should end with init(); (the loader strips it so nothing starts)');
  const store={getItem:()=>null,setItem(){},removeItem(){}};
  const ctx={console,URL,setTimeout,clearTimeout,localStorage:store,sessionStorage:store,
    document:{addEventListener(){},getElementById:()=>null,querySelectorAll:()=>[],querySelector:()=>null},
    location:{search:'',hash:'',href:'http://localhost/',pathname:'/'}};
  ctx.window=ctx;
  vm.createContext(ctx);
  vm.runInContext(body,ctx,{filename:'app.js'});
  return ctx;
}
const app=loadApp();

// What a browser does to a quoted attribute value before it runs it as a handler: decode the character references.
const decodeAttr=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(m,n)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[n]));

// Names a supplier (or anyone with a login) could type into a level / area / project / schedule / file name.
const NASTY=[
  'GRD" onmouseover="alert(1)',
  "L1 '); alert(1); ('",
  "a\\'b",
  'a\\"b\\',
  '</script><script>alert(1)</script>',
  "Tom & Jerry's \"slab\" <b>",
  'line\u2028sep\u2029end',
  '`${alert(1)}`',
  'L1 (S051) / GRD - ILA',
  '',
  '&quot;&#39;&amp;',
];

test('esc() escapes & < > " and \' so text is safe in HTML text and inside a quoted attribute', ()=>{
  assert.equal(app.esc(`<a href="x" title='y'>&</a>`),'&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
  assert.equal(app.esc(null),'');
  assert.equal(app.esc(undefined),'');
  assert.equal(app.esc(0),'0');
  assert.equal(app.esc(12.5),'12.5');
  assert.equal(app.esc('L1 (S051)'),'L1 (S051)');
  for(const v of NASTY){
    const out=app.esc(v);
    assert.ok(!/["'<>]/.test(out),`esc left a quote or bracket in ${JSON.stringify(v)}`);
    assert.equal(decodeAttr(out),v,'decoding esc() gives the value back');
  }
});

test('jsArg() hands any value to an inline handler intact and never closes the attribute', ()=>{
  for(const v of [...NASTY,42,0,-1.5,null,true,false]){
    const arg=app.jsArg(v);
    assert.ok(!/["'<>]/.test(arg),`jsArg left a raw quote or bracket for ${JSON.stringify(v)}: ${arg}`);
    // the handler text a browser would run for onclick="f(${jsArg(v)})"
    let got='unset';
    new Function('f',decodeAttr(`f(${arg})`))(x=>{got=x});
    assert.deepEqual(got,v,`round trip of ${JSON.stringify(v)}`);
  }
  assert.equal(app.jsArg(undefined),'null','undefined becomes null, never an empty argument');
});

test('safeUrl() only lets http(s) links on the REO file store through', ()=>{
  const ok='https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/Qudos/L1/1_x.pdf';
  assert.equal(app.safeUrl(ok),ok);
  assert.equal(app.safeUrl('  '+ok+'  '),ok,'surrounding spaces are trimmed');
  assert.equal(app.safeUrl('https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/a b.pdf'),
    'https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/a%20b.pdf');
  for(const bad of [
    'javascript:alert(1)','JaVaScRiPt:alert(1)','  javascript:alert(1)','java\tscript:alert(1)','vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>','https://evil.example/schedule.pdf',
    'https://oekgtocjtloptrjacmcu.supabase.co.evil.example/x.pdf','https://oekgtocjtloptrjacmcu.supabase.co:8443/x.pdf',
    'http://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/x.pdf','//oekgtocjtloptrjacmcu.supabase.co/x.pdf',
    '/storage/v1/object/public/x.pdf','x.pdf','','   ',null,undefined,42,{},['https://x'],
  ])assert.equal(app.safeUrl(bad),'',`should refuse ${JSON.stringify(bad)}`);
});

test('fileLinkAttrs() links a file-store URL and leaves anything else unlinked', ()=>{
  const ok='https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/x.pdf?a=1&b=2';
  assert.equal(app.fileLinkAttrs(ok),`href="${ok.replace('&','&amp;')}" target="_blank" rel="noopener noreferrer"`);
  for(const bad of ['javascript:alert(1)','https://evil.example/x.pdf','x" onclick="alert(1)',null]){
    const a=app.fileLinkAttrs(bad);
    assert.ok(!/href=/.test(a),`no href for ${JSON.stringify(bad)}`);
    assert.ok(!/["'][^"']*["'][^"']*on[a-z]+=/.test(a));
  }
});

// ── Foreman / Site: cards stay where they are ──
// spread first: arrays made inside the vm context have their own Array prototype, and strict deepEqual checks it
const ids=rows=>[...rows].map(r=>r.e.id);
const newIds=r=>[...r.top,...r.main].filter(x=>x.isNew).map(x=>x.e.id);
const E=(id,status,date)=>({id,status,our_delivery_date:date});

test('Foreman cards keep the order taken when the list was opened; delivered cards change in place', ()=>{
  const open=e=>e.status!=='Delivered';
  let list=[E(1,'Ordered','2026-11-10'),E(2,'Delivered','2026-11-01'),E(3,'Scheduled','2026-11-05'),E(4,'Not Ordered',null)];
  let r=app.keepCardOrder(null,'Qudos||',list,app.fmSort,open);
  assert.deepEqual(ids(r.main),[3,1,4,2],'fresh order: not delivered first by DBCC requested date, delivered last');
  assert.equal(r.top.length,0);assert.equal(r.kept,false);assert.deepEqual(newIds(r),[]);

  // own edit: 3 marked delivered — a fresh sort would move it to the bottom; the kept order leaves it first
  list=list.map(e=>e.id===3?{...e,status:'Delivered'}:e);
  r=app.keepCardOrder(r.state,'Qudos||',list,app.fmSort,open);
  assert.deepEqual(ids(r.main),[3,1,4,2]);assert.equal(r.kept,true);
  assert.equal(r.main[0].e.status,'Delivered','the card is drawn with its new status, in the same place');
  assert.deepEqual(newIds(r),[]);

  // realtime: a new open entry → its own block at the top, tagged New; nothing already on screen moves
  list=[...list,E(5,'Ordered','2026-11-20')];
  r=app.keepCardOrder(r.state,'Qudos||',list,app.fmSort,open);
  assert.deepEqual(ids(r.top),[5]);assert.deepEqual(ids(r.main),[3,1,4,2]);assert.deepEqual(newIds(r),[5]);

  // a new entry that is already delivered → the end of the list, tagged New
  list=[...list,E(6,'Delivered','2026-10-01')];
  r=app.keepCardOrder(r.state,'Qudos||',list,app.fmSort,open);
  assert.deepEqual(ids(r.top),[5]);assert.deepEqual(ids(r.main),[3,1,4,2,6]);assert.deepEqual(newIds(r).sort(),[5,6]);

  // an entry that leaves (cancelled elsewhere) drops out; New stays New on later refreshes; a later new one goes above
  list=[...list.filter(e=>e.id!==1),E(7,'Ordered','2026-11-02')];
  r=app.keepCardOrder(r.state,'Qudos||',list,app.fmSort,open);
  assert.deepEqual(ids(r.top),[7,5]);assert.deepEqual(ids(r.main),[3,4,2,6]);assert.deepEqual(newIds(r).sort(),[5,6,7]);

  // a new card marked delivered stays in the New block where it is
  list=list.map(e=>e.id===7?{...e,status:'Delivered'}:e);
  r=app.keepCardOrder(r.state,'Qudos||',list,app.fmSort,open);
  assert.deepEqual(ids(r.top),[7,5]);

  // picking another level / area (another key) or Re-sort (no previous state) takes a fresh order, nothing New
  const fresh=[...list].sort(app.fmSort).map(e=>e.id);
  for(const again of [app.keepCardOrder(r.state,'Qudos|L1|',list,app.fmSort,open),app.keepCardOrder(null,'Qudos||',list,app.fmSort,open)]){
    assert.deepEqual(ids(again.main),fresh);assert.equal(again.top.length,0);assert.deepEqual(newIds(again),[]);assert.equal(again.kept,false);
  }
});

test('Site cards: same rule — new open ones on top, new delivered / cancelled ones on the end', ()=>{
  const open=e=>e.status!=='Delivered'&&e.status!=='Cancelled';
  let list=[E(1,'Cancelled','2026-11-01'),E(2,'Scheduled','2026-11-09'),E(3,'Not Ordered','2026-11-20'),E(4,'Delivered','2026-11-02')];
  let r=app.keepCardOrder(null,'k',list,app.svSort,open);
  assert.deepEqual(ids(r.main),[3,2,4,1],'fresh: Not Ordered, Ordered, Scheduled, Delivered, Cancelled — then by date');
  list=[...list.map(e=>e.id===3?{...e,status:'Ordered'}:e),E(5,'Cancelled',null),E(6,'Ordered','2026-11-03')];
  r=app.keepCardOrder(r.state,'k',list,app.svSort,open);
  assert.deepEqual(ids(r.top),[6]);assert.deepEqual(ids(r.main),[3,2,4,1,5]);
});

test('keepCardOrder never changes the list it is given', ()=>{
  const list=[E(2,'Ordered','2026-11-09'),E(1,'Ordered','2026-11-01')];const copy=JSON.stringify(list);
  const r=app.keepCardOrder(null,'k',list,app.fmSort,()=>true);
  app.keepCardOrder(r.state,'k',[...list,E(3,'Ordered',null)],app.fmSort,()=>true);
  assert.equal(JSON.stringify(list),copy);
});

// ── Edit dialog: never "None" for the entry's own level / area; Save sends only what the person changed ──
const keys=o=>Object.keys(o).sort();
const CUR={id:7,project:'Barwon',level:'GRD',area:'SLAB',schedule:null,entry_date:'2026-11-01',our_delivery_date:null,
  supplier_delivery_date:'2026-11-09',drawing_reference:null,total_weight:2.5,split_reference:null,status:'Not Ordered',entry_type:'scheduled'};
const FORM0={project:'Barwon',level:'GRD',area:'SLAB',schedule:'',entry_date:'2026-11-01',our_delivery_date:'',
  supplier_delivery_date:'2026-11-09',drawing_reference:'',total_weight:'2.5',split_reference:''};

test('Edit: Save sends only the fields the person changed (and the status rules those changes trigger)', ()=>{
  let r=app.editPatch(CUR,FORM0,{...FORM0},false);
  assert.equal(r.changed.length,0);assert.deepEqual(keys(r.patch),[]);

  r=app.editPatch(CUR,FORM0,{...FORM0,split_reference:'Part 2'},false);
  assert.deepEqual([...r.changed],['split_reference']);assert.deepEqual({...r.patch},{split_reference:'Part 2'});

  // DBCC requested date set on a Not Ordered entry → Ordered; the two dates now differ → the mismatch flag comes back
  r=app.editPatch(CUR,FORM0,{...FORM0,our_delivery_date:'2026-11-05'},false);
  assert.deepEqual({...r.patch},{our_delivery_date:'2026-11-05',status:'Ordered',mismatch_resolved:false});

  // schedule typed on an Ordered entry → Scheduled
  r=app.editPatch({...CUR,status:'Ordered'},FORM0,{...FORM0,schedule:'VHKQ'},false);
  assert.deepEqual({...r.patch},{schedule:'VHKQ',status:'Scheduled'});

  // no status rule fires when the field it reads wasn't touched (the old dialog re-applied it on every save)
  r=app.editPatch({...CUR,our_delivery_date:'2026-11-05'},{...FORM0,our_delivery_date:'2026-11-05'},{...FORM0,our_delivery_date:'2026-11-05',drawing_reference:'S001'},false);
  assert.deepEqual({...r.patch},{drawing_reference:'S001'});

  // weight: cleared → null, typed → a number; a cleared level → null (only because the person cleared it)
  assert.deepEqual({...app.editPatch(CUR,FORM0,{...FORM0,total_weight:''},false).patch},{total_weight:null});
  assert.deepEqual({...app.editPatch(CUR,FORM0,{...FORM0,total_weight:'3.125'},false).patch},{total_weight:3.125});
  assert.deepEqual({...app.editPatch(CUR,FORM0,{...FORM0,level:''},false).patch},{level:null});

  // a supplier never sends DBCC's requested date
  r=app.editPatch(CUR,FORM0,{...FORM0,our_delivery_date:'2026-12-01',supplier_delivery_date:'2026-11-10'},true);
  assert.deepEqual([...r.changed],['supplier_delivery_date']);assert.ok(!('our_delivery_date' in r.patch));
});

test("Edit: the entry's own level / area are always offered and picked — never None", ()=>{
  const off=app.editOptions(['L1','L2'],'OLD LEVEL','None',"not on this job's list");
  assert.match(off,/<option value="OLD LEVEL" selected>OLD LEVEL — not on this job&#39;s list<\/option>/);
  assert.ok(!/<option value="" selected>/.test(off),'None is not picked');
  assert.equal((off.match(/ selected/g)||[]).length,1);

  const on=app.editOptions(['L1','L2'],'L2','None','x');
  assert.equal(on,'<option value="">None</option><option value="L1">L1</option><option value="L2" selected>L2</option>');
  assert.match(app.editOptions(['L1'],null,'None','x'),/^<option value="" selected>None<\/option>/);
  assert.match(app.editOptions(['A'],'GRD" onmouseover="x','None','x'),/value="GRD&quot; onmouseover=&quot;x" selected/);

  // level / area for the job picked in the dialog (opening, then after a project change)
  vm.runInContext(`projects=[{name:'Barwon',levels:['GRD','L1'],areas:['SLAB','COLUMNS']},{name:'Qudos',levels:['L1'],areas:['WALLS']}];
    editSnap={id:7,row:{project:'Barwon',level:'OLD LEVEL',area:'SLAB'},form:null};`,app);
  let h=app.editLevelAreaHtml('Barwon',true);
  assert.match(h.level,/value="OLD LEVEL" selected/);assert.match(h.area,/value="SLAB" selected/);
  h=app.editLevelAreaHtml('Qudos',false);   // moved to a job without either → None, and nothing off-list offered
  assert.match(h.level,/value="" selected/);assert.ok(!/OLD LEVEL/.test(h.level));assert.match(h.area,/value="" selected/);
  vm.runInContext(`editSnap={id:8,row:{project:'Barwon',level:'L1',area:'SLAB'},form:null};`,app);
  assert.match(app.editLevelAreaHtml('Qudos',false).level,/value="L1" selected/,'a job that has the same level keeps it');
});

test('Edit: the guard compares database values exactly (null is not "")', ()=>{
  assert.ok(app.sameDbValue(null,undefined));assert.ok(app.sameDbValue(2.5,2.5));assert.ok(app.sameDbValue('2026-11-01','2026-11-01'));
  assert.ok(!app.sameDbValue(null,''));assert.ok(!app.sameDbValue('GRD','GRD '));assert.ok(!app.sameDbValue(2.5,2.4));
  // what "changed underneath" covers: every field the dialog shows, plus the status and type its rules read
  const guard=[...vm.runInContext('EDIT_GUARD',app)].sort();
  assert.deepEqual(guard,['area','drawing_reference','entry_date','entry_type','level','our_delivery_date','project','schedule',
    'split_reference','status','supplier_delivery_date','total_weight']);
});

// A stand-in for the Supabase client: records every call (table, op, payload, filters) and answers from `answer(q)`.
function fakeSb(answer){
  const calls=[];
  const from=table=>{
    const q={table,op:'select',payload:null,filters:[],returning:false,single:false};
    const b={
      select(){if(q.op!=='select')q.returning=true;return b},
      update(p){q.op='update';q.payload=p;return b},insert(p){q.op='insert';q.payload=p;return b},delete(){q.op='delete';return b},
      eq(c,v){q.filters.push(['eq',c,v]);return b},is(c,v){q.filters.push(['is',c,v]);return b},in(c,v){q.filters.push(['in',c,v]);return b},
      neq(){return b},order(){return b},limit(){return b},maybeSingle(){q.single=true;return b},single(){q.single=true;return b},
      then(res,rej){calls.push(q);return Promise.resolve(answer(q)||{data:null,error:null}).then(res,rej)}};
    return b};
  return{from,calls,channel:()=>({on(){return this},subscribe(){return this}})};
}
// Fake page elements for one dialog: getElementById answers from this map.
function fakePage(values){
  const els={};
  for(const[id,v]of Object.entries(values))els[id]={id,value:v,innerHTML:'',textContent:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}}};
  app.document.getElementById=id=>els[id]||null;
  return els;
}
function withApp(src){vm.runInContext(src,app)}
withApp(`loadEntries=async()=>{};renderDash=()=>{};renderForeman=()=>{};confirmDialog=(t,m,ok,c,fn)=>{globalThis.__confirmed=fn};userName='Tester';foremanName='Fiona';`);
const editPage=form=>fakePage({ed_proj:form.project,ed_level:form.level,ed_area:form.area,ed_sched:form.schedule,ed_date:form.entry_date,
  ed_ourD:form.our_delivery_date,ed_supD:form.supplier_delivery_date,ed_draw:form.drawing_reference,ed_wt:form.total_weight,
  ed_split:form.split_reference,edErr:'',edSaveBtn:'',editOv:''});
function openSnap(row,form){app.__snap={id:row.id,row,form};withApp('editSnap=JSON.parse(JSON.stringify(__snap))')}

test('Edit Save: only the changed field is sent, guarded by every value the dialog showed; history after the write', async()=>{
  openSnap(CUR,FORM0);const els=editPage({...FORM0,split_reference:'Part 2'});
  const sb=fakeSb(q=>q.table==='entries'&&q.op==='select'?{data:{...CUR},error:null}:q.op==='update'?{data:[{id:7}],error:null}:{data:null,error:null});
  app.__sb=sb;withApp('sb=__sb');
  await app.saveEdit(7);
  const [read,upd,hist]=sb.calls;
  assert.equal(sb.calls.length,3);
  assert.equal(read.op,'select');assert.deepEqual([...read.filters[0]],['eq','id',7]);
  assert.equal(upd.op,'update');assert.deepEqual({...upd.payload},{split_reference:'Part 2'},'only the field the person changed');
  assert.ok(upd.returning,'the update asks for the changed row back (0 rows = not saved)');
  const guard=Object.fromEntries(upd.filters.filter(f=>f[1]!=='id').map(f=>[f[1],f[0]==='is'?null:f[2]]));
  for(const k of vm.runInContext('EDIT_GUARD',app))assert.ok(k in guard,`update is conditional on ${k}`);
  assert.equal(guard.level,'GRD');assert.equal(guard.schedule,null);assert.equal(guard.total_weight,2.5);
  assert.equal(hist.table,'audit_log');
  assert.deepEqual([...hist.payload].map(r=>({...r})),[{entry_id:7,action:'UPDATE',field_changed:'split_reference',old_value:'',new_value:'Part 2',user_identifier:'Tester'}]);
  assert.equal(els.edErr.innerHTML,'');
});

test('Edit Save: an entry changed underneath is not saved — "changed while you were editing — reload"', async()=>{
  openSnap(CUR,FORM0);const els=editPage({...FORM0,split_reference:'Part 2'});
  const sb=fakeSb(q=>q.op==='select'?{data:{...CUR,level:'L1',status:'Ordered'},error:null}:{data:[{id:7}],error:null});
  app.__sb=sb;withApp('sb=__sb');
  await app.saveEdit(7);
  assert.deepEqual(sb.calls.map(c=>c.op),['select'],'no update, no history');
  assert.match(els.edErr.innerHTML,/This entry changed while you were editing — reload\. Nothing was saved — changed meanwhile: Level, Status\./);
  assert.match(els.edErr.innerHTML,/onclick="reloadEditEntry\(7\)"/);
});

test('Edit Save: a row that changed between the check and the write (0 rows) or a refusal writes no history', async()=>{
  for(const [answer,words] of [
    [{data:[],error:null},/This entry changed while you were editing — reload/],
    [{data:null,error:{message:'Suppliers cannot change the ordered (DBCC) delivery date'}},/Not saved — the database refused it: Suppliers cannot change the ordered \(DBCC\) delivery date/],
    [{data:null,error:{message:'TypeError: Failed to fetch'}},/Not saved — couldn&#39;t reach the database/],
  ]){
    openSnap(CUR,FORM0);const els=editPage({...FORM0,supplier_delivery_date:'2026-11-12'});
    const sb=fakeSb(q=>q.op==='select'?{data:{...CUR},error:null}:q.op==='update'?answer:{data:null,error:null});
    app.__sb=sb;withApp('sb=__sb');
    await app.saveEdit(7);
    assert.deepEqual(sb.calls.map(c=>c.op),['select','update']);
    assert.match(els.edErr.innerHTML,words);
  }
});

test('Edit Save: nothing changed → nothing is sent', async()=>{
  openSnap(CUR,FORM0);editPage({...FORM0});
  const sb=fakeSb(()=>({data:null,error:null}));app.__sb=sb;withApp('sb=__sb');
  await app.saveEdit(7);
  assert.equal(sb.calls.length,0);
});

// ── History only after the database write succeeded ──
const alerts=[];app.alert=m=>alerts.push(String(m));
const ENTRY={id:5,project:'Barwon',level:'GRD',area:'SLAB',schedule:'U9AV',status:'Scheduled',dbcc_comment:null,aus_reo_comment:null};
// answers: what the entries write returns — ok (the row back), refused (an error), zero (no rows: not allowed / gone)
const WRITE={ok:{data:[{id:5}],error:null},refused:{data:null,error:{message:'Crew (Site/Foreman) can only update delivery status'}},zero:{data:[],error:null}};
function runWith(answer){
  const sb=fakeSb(q=>q.table==='entries'&&(q.op==='update'||q.op==='delete')?answer:{data:null,error:null});
  app.__sb=sb;withApp(`sb=__sb;entries=[${JSON.stringify(ENTRY)}];adminUnlocked=true;`);alerts.length=0;
  return sb}
const ops=sb=>sb.calls.map(c=>c.table+':'+c.op);

test('markDelivered writes its history line only after the database changed the row', async()=>{
  for(const [k,expect,said] of [['ok',['entries:update','audit_log:insert'],null],
    ['refused',['entries:update'],/^Not marked delivered — the database refused it: Crew/],
    ['zero',['entries:update'],/^Not marked delivered — the entry wasn't changed/]]){
    const sb=runWith(WRITE[k]);fakePage({});
    await app.markDelivered(5);await app.__confirmed();   // the confirm dialog's OK
    assert.deepEqual(ops(sb),expect,k);
    assert.ok(sb.calls[0].returning,'the update asks for the row back');
    if(said)assert.match(alerts[0]||'',said);else assert.equal(alerts.length,0);
    if(k==='ok')assert.deepEqual({...sb.calls[1].payload},{entry_id:5,action:'UPDATE',field_changed:'status',old_value:'Scheduled',new_value:'Delivered',user_identifier:'Tester'});
  }
});

test('doCancel writes its history line only after the database changed the row, and says why not', async()=>{
  for(const [k,expect,said] of [['ok',['entries:update','audit_log:insert'],null],
    ['refused',['entries:update'],/Not cancelled — the database refused it: Crew/],['zero',['entries:update'],/Not cancelled — the entry wasn&#39;t changed/]]){
    const sb=runWith(WRITE[k]);const els=fakePage({cancelR:'  wrong pour  ',cancelErr:'',cancelBtn:'',cancelOv:''});
    await app.doCancel(5);
    assert.deepEqual(ops(sb),expect,k);
    assert.equal(sb.calls[0].payload.status,'Cancelled');assert.equal(sb.calls[0].payload.cancel_reason,'wrong pour');
    if(said)assert.match(els.cancelErr.innerHTML,said);else assert.equal(els.cancelErr.innerHTML,'');
    assert.equal(els.cancelBtn.disabled,false,'the button is usable again');
  }
});

test('deleteEntry writes its history line only after the database removed the row', async()=>{
  for(const [k,expect,said] of [['ok',['entries:delete','audit_log:insert'],null],
    ['refused',['entries:delete'],/^Not deleted — the database refused it/],['zero',['entries:delete'],/^Not deleted — the entry wasn't deleted/]]){
    const sb=runWith(WRITE[k]);fakePage({detailOv:''});
    await app.deleteEntry(5);await app.__confirmed();   // the confirm dialog's OK
    assert.deepEqual(ops(sb),expect,k);assert.ok(sb.calls[0].returning);
    if(said)assert.match(alerts[0]||'',said);else assert.equal(alerts.length,0);
  }
});

test('the foreman view writes its history line only after the database changed the row', async()=>{
  for(const [k,expect] of [['ok',['entries:update','audit_log:insert']],['refused',['entries:update']],['zero',['entries:update']]]){
    const sb=runWith(WRITE[k]);fakePage({});
    await app.foremanMarkDelivered(5);
    assert.deepEqual(ops(sb),expect,k);
    if(k==='ok')assert.equal(sb.calls[1].payload.user_identifier,'Fiona','signed with the foreman name');
    else assert.match(alerts[0]||'',/^Not marked delivered — /);
  }
});

test('every change to an entries row goes through writeEntry (or the guarded Edit save / delete) and its answer is used', ()=>{
  const fnAt=i=>{const head=SRC.slice(0,i);const m=[...head.matchAll(/\n(?:async )?function ([A-Za-z0-9_$]+)\(/g)].pop();return m&&m[1]};
  const direct=[...SRC.matchAll(/sb\.from\('entries'\)\.(update|delete)\(/g)].map(m=>fnAt(m.index));
  assert.deepEqual([...new Set(direct)].sort(),['deleteEntry','saveEdit','writeEntry'],'a direct entries update / delete outside the three checked paths');
  const unchecked=[...SRC.matchAll(/(.{0,12})\bwriteEntry\(/g)].filter(m=>!/function $/.test(m[1])&&!/=\s*await $/.test(m[1]));
  assert.deepEqual(unchecked.map(m=>'app.js:'+SRC.slice(0,m.index).split('\n').length),[],'a writeEntry() whose answer is thrown away');
  assert.ok([...SRC.matchAll(/=\s*await writeEntry\(/g)].length>=25,'the entry writes use writeEntry');
});

// ── Static sweep: pins that no data string is ever written into handler code or a link again ──

// Every on<event>="…" attribute value written in app.js, with the ${…} / '+…+' expressions inside it.
function handlerAttributes(){
  const found=[];const re=/\son([a-z]+)=\\?"/g;let m;
  while((m=re.exec(SRC))){
    let j=m.index+m[0].length,exprs=[],text='';
    for(;j<SRC.length;j++){
      if(SRC.startsWith('${',j)){let d=1,k=j+2;for(;k<SRC.length&&d;k++){if(SRC[k]==='{')d++;else if(SRC[k]==='}')d--}
        exprs.push(SRC.slice(j+2,k-1).trim());text+='${…}';j=k-1;continue}
      if(SRC.startsWith("'+",j)){const k=SRC.indexOf("+'",j+2);exprs.push(SRC.slice(j+2,k).trim());text+='…';j=k+1;continue}
      if(SRC[j]==='"'||SRC[j]==='\n')break;
      text+=SRC[j];
    }
    found.push({line:SRC.slice(0,m.index).split('\n').length,event:m[1],text,exprs});
  }
  return found;
}

test('every inline handler carries data only through jsArg() or a numeric id', ()=>{
  const numeric=/^(?:(?:e|p|c|f|item|r\.entry)\.)?id$|^i$|^idx$/;
  const handlers=handlerAttributes();
  assert.ok(handlers.length>100,`expected the app's inline handlers, found ${handlers.length}`);
  const bad=[];
  for(const h of handlers)for(const x of h.exprs){
    if(/^jsArg\(.+\)$/s.test(x)||numeric.test(x))continue;
    bad.push(`app.js:${h.line} on${h.event}="${h.text}" — \${${x}}`);
  }
  assert.deepEqual(bad,[],'a data value reached handler code without jsArg()');
  // and nobody quotes by hand any more
  assert.ok(!/replace\(\/'\/g/.test(SRC),"hand-quoting with .replace(/'/g, …) is back");
});

test('every link to a file goes through safeUrl() (fileLinkAttrs) — the one exception is checked by isSafeUrl()', ()=>{
  const hrefs=[];const re=/href="(\$\{[^}]*\}|'\+[^+]*\+')/g;let m;
  while((m=re.exec(SRC)))hrefs.push(m[1]);
  assert.deepEqual(hrefs.sort(),["${esc(s)}","'+esc(p.url)+'"].sort(),'href built from data outside fileLinkAttrs()');
  // the comment-link exception: renderChunkText refuses unsafe schemes before it builds the <a>
  const rct=SRC.slice(SRC.indexOf('function renderChunkText'),SRC.indexOf('function chunksToHtml'));
  assert.ok(/if\(!isSafeUrl\(p\.url\)\)return esc\(p\.label\);[\s\S]*href="'\+esc\(p\.url\)\+'"/.test(rct));
  assert.ok(/s\?`href="\$\{esc\(s\)\}"/.test(SRC.slice(SRC.indexOf('function fileLinkAttrs'))));
});

test('attribute values built from data are escaped', ()=>{
  // value / title / placeholder / data-* attributes with an interpolation: each must be esc(…), a number or a constant.
  const allowed=/^esc\(.+\)$|^(?:(?:e|p|c|f|item)\.)?id$|^i$|^idx$|^idx\+1$|^today\(\)$|^step$|^files\.length$|^labels\.(?:tick|cross|dash)$/s;
  const bad=[];const re=/\s(value|title|placeholder|data-[a-z-]+)="([^"]*)"/g;let m;
  while((m=re.exec(SRC))){
    for(const x of [...m[2].matchAll(/\$\{([^}]*)\}/g)].map(y=>y[1].trim()))
      if(!allowed.test(x)&&!/^files\.length===1\?''/.test(x))bad.push(`app.js:${SRC.slice(0,m.index).split('\n').length} ${m[1]}="${m[2]}"`);
  }
  assert.deepEqual(bad,[]);
});

// ── Fix round (4 Nov evening) ──
test('Recalculate All stays off: it says why, asks nothing, fetches nothing and writes nothing', async()=>{
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  const calls=[];const sb={from:t=>{const b={select(){return b},update(p){calls.push(t+':update');return b},insert(){calls.push(t+':insert');return b},eq(){return b},is(){return b},then(res){return Promise.resolve({data:[{id:1}],error:null}).then(res)}};return b}};
  a.__sb=sb;
  r(`sb=__sb;adminUnlocked=true;userName='Chris';__alerts=[];alert=m=>__alerts.push(String(m));__asked=0;confirm=()=>{__asked++;return true};__fetched=0;fetch=async()=>{__fetched++;throw new Error('no')};
     entries=[{id:50,project:'Al-Taqwa',level:'GRD',area:'SLAB',schedule:'WAV4',file_url:'https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/WAV4.pdf',starter_weight:0.42,status:'Delivered',entry_type:'scheduled'}];`);
  await a.recalcOpenPreview();
  assert.deepEqual([...r('__alerts')],['Recalculate All is off until Chris decides on starter bars — the schedules on file keep the weights they were read with. To re-read one schedule: Edit the entry → Delete schedule only, then upload the PDF again.']);
  assert.equal(r('__asked'),0,'not even the "Continue?" question');
  assert.equal(r('__fetched'),0,'no schedule fetched');
  // the apply step writes nothing either, whatever reaches it
  r(`recalcResults=[{entry:entries[0],oldValues:{starter_weight:0.42,recon_status:'ok'},newValues:{starter_weight:null,recon_status:'review'},changed:true}];
     document.querySelectorAll=()=>[{getAttribute:()=>'0',checked:true}];document.getElementById=()=>({disabled:false,textContent:''});`);
  await a.recalcApply();
  assert.deepEqual(calls,[],'no entry written, no history line');
  assert.equal(r('RECALC_ALL_ON'),false);
  // if it is ever switched on: each PDF is read with the upload's own switch, and no row starts ticked
  const pre=SRC.slice(SRC.indexOf('async function recalcOpenPreview'),SRC.indexOf('function rcSelectAll'));
  assert.ok(pre.includes('looksLikeArc(native.allText)?parseArcText(native.pageOneText,native.allText):parseReoText(native.pageOneText,native.allText)'),'ARC schedules read by the ARC reader');
  assert.ok(!/parsed=parseReoText\(/.test(pre),'never the Aus Reo reader alone');
  assert.ok(/<input type="checkbox" class="rc-apply-box" data-idx="\$\{i\}">/.test(pre)&&!/rc-apply-box[^>]*checked/.test(pre),'rows start unticked');
});

// ── Review fix: one odd JSON value written by another login (a supplier, or the shared crew login) can't blank the dashboard ──
const plainJ=x=>JSON.parse(JSON.stringify(x));   // arrays made inside the vm have their own prototype
// What the comment / notes / markup columns might hold after someone writes to them directly (they are plain text).
const ODD=['null','x','[null]','[{"authors":"y"}]','[{"name":5}]','{}','5','"text"','[[1,2]]','[1,"a",true]','',
  '[{"text":{"a":1},"authors":[null,7,"Chris"],"created_at":{"x":1}}]','[{"url":["https://a"],"name":{"n":1},"uploaded_by":3,"date":null}]'];

test('parseChunks and parseMarkups read whatever another login wrote: a list of objects with text fields, or nothing', ()=>{
  for(const v of [...ODD,null,undefined,42,{},[]]){
    const tag=JSON.stringify(v)??String(v);
    const ch=plainJ(app.parseChunks(v)),mk=plainJ(app.parseMarkups(v));
    assert.ok(Array.isArray(ch)&&Array.isArray(mk),tag);
    for(const c of ch){assert.equal(typeof c.text,'string',tag);assert.ok(Array.isArray(c.authors)&&c.authors.every(a=>typeof a==='string'&&a),tag)}
    for(const m of mk)for(const k of ['url','name','uploaded_by','date'])assert.equal(typeof m[k],'string',`${tag}: ${k}`);
    // and everything that draws them
    for(const f of ['chunksToPlain','chunksToCell','chunksToHtml'])assert.equal(typeof app[f](app.parseChunks(v)),'string',`${f} ${tag}`);
    assert.equal(typeof app.foremanCell({progress_pct:null,foreman_notes:v}),'string',tag);
  }
  assert.deepEqual(plainJ(app.parseChunks('[null]')),[],'a list item that is not an object is dropped');
  assert.deepEqual(plainJ(app.parseChunks('[{"authors":"y"}]')),[{text:'',authors:[]}],'authors that are not a list read as none');
  assert.deepEqual(plainJ(app.parseChunks('[{"text":7,"authors":[null,7,"Chris",""]}]')),[{text:'7',authors:['7','Chris']}]);
  assert.deepEqual(plainJ(app.parseMarkups('[{"name":5}]')),[{name:'5',url:'',uploaded_by:'',date:''}]);
  for(const v of ['null','x','{}','5','"text"'])assert.deepEqual(plainJ(app.parseMarkups(v)),[],v);
  // a well-formed value reads exactly as before — every field it carries kept
  const good=[{text:'pour moved — see [plan](https://x.example/p.pdf)',authors:['Chris','Troy'],created_at:'2026-11-01T00:00:00Z',edited_at:'2026-11-02T00:00:00Z'}];
  assert.deepEqual(plainJ(app.parseChunks(JSON.stringify(good))),good);
  const mgood=[{url:'https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/a.pdf',name:'a.pdf',uploaded_by:'Chris',date:'2026-11-01'}];
  assert.deepEqual(plainJ(app.parseMarkups(JSON.stringify(mgood))),mgood);
});

// A fresh app with a page whose elements are made as they are asked for.
function pageApp(){
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  const els={};
  a.document.getElementById=id=>els[id]||(els[id]={id,value:'',innerHTML:'',textContent:'',disabled:false,checked:false,style:{},
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(){},contains(c){return this._s.has(c)}},focus(){}});
  return{a,r,els};
}
const FILE='https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/';
const oddRows=()=>ODD.map((v,i)=>({id:100+i,project:'Barwon',level:'GRD',area:'SLAB',schedule:'S'+i,status:'Ordered',entry_type:'scheduled',file_url:FILE+'s'+i+'.pdf',file_name:'s'+i+'.pdf',
  markup_plans:v,foreman_notes:v,aus_reo_comment:v,dbcc_comment:v}));

test('every screen draws an entry holding odd JSON: the dashboard (all of it), search, detail, markups, edit, Steel Fixers, Site and Foreman', ()=>{
  const{a,r,els}=pageApp();
  a.__rows=oddRows();
  r(`entries=JSON.parse(JSON.stringify(__rows));projects=[{id:1,name:'Barwon',supplier:'Aus Reo',levels:['GRD'],areas:['SLAB'],hubProjectId:null}];projectFiles=[];authRole='dbcc';adminUnlocked=true;`);
  a.renderDash();
  const t=els.dashTable.innerHTML;
  for(const e of a.__rows)assert.ok(t.includes(`showDetail(${e.id})`),`row ${e.id} (${JSON.stringify(e.markup_plans)}) is drawn`);
  els.fSearch.value='chris';assert.doesNotThrow(()=>a.renderDash(),'the search box reads the comments too');
  for(const e of a.__rows){
    const tag=JSON.stringify(e.markup_plans);
    assert.doesNotThrow(()=>a.showDetail(e.id),tag);assert.match(els.detailModal.innerHTML,/Entry Details/);
    assert.doesNotThrow(()=>a.viewMarkups(e.id),tag);
    assert.doesNotThrow(()=>a.openEditEntry(e.id),tag);
    assert.doesNotThrow(()=>a.siteCardHtml({e,isNew:false}),tag);
    assert.doesNotThrow(()=>a.foremanCardHtml({e,isNew:false}),tag);
  }
  assert.doesNotThrow(()=>a.renderSfTable());
  for(const e of a.__rows)assert.ok(els.sfTable.innerHTML.includes(`sfEditInstalled(${e.id})`),`Steel Fixers row ${e.id}`);
  // the good fields still show: a markup with a number for a name, a note whose authors were not a list
  a.__rows=[{id:7,project:'Barwon',level:'GRD',area:'SLAB',schedule:'U9AV',status:'Ordered',entry_type:'scheduled',
    markup_plans:JSON.stringify([null,{url:FILE+'m.pdf',name:5,uploaded_by:'Chris'}]),foreman_notes:'[{"text":"fixed","authors":"Fiona"}]'}];
  r('entries=JSON.parse(JSON.stringify(__rows))');els.fSearch.value='';a.renderDash();
  assert.match(els.dashTable.innerHTML,/onclick="viewMarkups\(7\)">📐 1<\/button>/);
  assert.match(els.dashTable.innerHTML,/<span title="fixed" style="cursor:help">📝1<\/span>/);
  a.viewMarkups(7);assert.match(els.markupModal.innerHTML,/📐 5<\/a> <span style="color:var\(--muted\);font-size:10px">by Chris<\/span><button onclick="removeMarkup\(7,0\)">/);
});

test('a row holding odd JSON can be repaired from the screen: a save writes the cleaned list back', async()=>{
  const{a,r,els}=pageApp();
  const sb=fakeSb(q=>q.table==='entries'?{data:[{id:7}],error:null}:{data:null,error:null});a.__sb=sb;
  a.__rows=[{id:7,project:'Barwon',level:'GRD',area:'SLAB',schedule:'U9AV',status:'Ordered',entry_type:'scheduled',
    markup_plans:JSON.stringify([null,{url:FILE+'a.pdf',name:'a.pdf',uploaded_by:'Chris',date:'2026-11-01'},'junk',{url:FILE+'b.pdf',name:5}]),
    foreman_notes:'[null,{"text":"half done","authors":"Fiona"}]',dbcc_comment:'[7]'}];
  r(`sb=__sb;entries=JSON.parse(JSON.stringify(__rows));userName='Chris';foremanName='Fiona';authRole='dbcc';
     loadEntries=async()=>{};renderDash=()=>{};renderForeman=()=>{};confirmDialog=(t,m,ok,c,fn)=>{__confirmed=fn};`);
  // remove the first markup the screen lists: the odd items go, the other markup stays
  a.viewMarkups(7);assert.match(els.markupModal.innerHTML,/removeMarkup\(7,1\)/);assert.ok(!/removeMarkup\(7,2\)/.test(els.markupModal.innerHTML),'two markups listed');
  await a.removeMarkup(7,0);await r('__confirmed()');
  const w=sb.calls.filter(c=>c.table==='entries'&&c.op==='update');
  assert.deepEqual(JSON.parse(w[0].payload.markup_plans),[{url:FILE+'b.pdf',name:'5',uploaded_by:'',date:''}]);
  // the foreman adds a note: the note before it stays, the odd item goes
  a.document.getElementById('fmNoteInp').value='finished';
  await a.foremanSaveNote(7);
  const notes=JSON.parse(sb.calls.filter(c=>c.table==='entries'&&c.op==='update')[1].payload.foreman_notes);
  assert.deepEqual(notes.map(n=>[n.text,n.authors]),[['half done',[]],['finished',['Fiona']]]);
  // a DBCC comment saved over an odd value
  a.editChunkComment(7,'dbcc');assert.match(els.commentModal.innerHTML,/No comments yet/);
  a.document.getElementById('newChunkInp').value='call Bolek';a.document.querySelectorAll=()=>[];
  await a.saveChunkComment(7,'dbcc');
  const c=JSON.parse(sb.calls.filter(c=>c.table==='entries'&&c.op==='update')[2].payload.dbcc_comment);
  assert.deepEqual(c.map(x=>[x.text,x.authors]),[['call Bolek',['Chris']]]);
});

test('every read of a JSON column goes through parseChunks / parseMarkups — never a bare JSON.parse', ()=>{
  const at=i=>'app.js:'+SRC.slice(0,i).split('\n').length;
  const bare=[...SRC.matchAll(/JSON\.parse\(([^)]*)\)/g)].filter(m=>/markup_plans|foreman_notes|_comment\b|\[col(?:Name)?\]/.test(m[1]));
  assert.deepEqual(bare.map(m=>at(m.index)+' '+m[0]),[],'a JSON column parsed outside the two readers');
  const unread=[];
  for(const m of SRC.matchAll(/\b\w+(?:\.\w+)*\.(markup_plans|foreman_notes|aus_reo_comment|dbcc_comment)\b(=?)/g)){
    if(m[2])continue;   // a write (up.markup_plans=…)
    const want=m[1]==='markup_plans'?'parseMarkups(':'parseChunks(';
    if(!SRC.slice(0,m.index).endsWith(want))unread.push(at(m.index)+' '+m[0]);
  }
  for(const m of SRC.matchAll(/\b\w+\[col(?:Name)?\]/g))if(!SRC.slice(0,m.index).endsWith('parseChunks('))unread.push(at(m.index)+' '+m[0]);
  assert.deepEqual(unread,[],'a JSON column read without its reader');
  assert.ok([...SRC.matchAll(/parseMarkups\(/g)].length>=15&&[...SRC.matchAll(/parseChunks\(/g)].length>=20,'the readers are in use');
});
