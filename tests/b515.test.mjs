// REO b5.15 (REO Build A, 9 Nov 2026) — tests for Chris's answers a2 / a3 / a4 / a5 and Q7's rule for orders.
// Plain node:test, no packages, nothing touches a server. Run from the repo root:  node --test
//
// app.js is loaded the way the page loads it (minus the final init()) inside a node:vm context, as in r1.test.mjs, so
// these check the real code. B515_APP_JS points the same tests at another copy (a mutation check: they must then fail).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const SRC=readFileSync(process.env.B515_APP_JS||new URL('../app.js',import.meta.url),'utf8');
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
const run=src=>vm.runInContext(src,app);
const plain=x=>JSON.parse(JSON.stringify(x));
const FILE_URL='https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/schedules/Barwon/GRD/1_mp.pdf';

// A stand-in for the Supabase client: records every call (table, op, payload, filters) and answers from `answer(q)`.
function fakeSb(answer){
  const calls=[];
  const from=table=>{
    const q={table,op:'select',payload:null,filters:[],returning:false,single:false,cols:null,order:null,limit:null};
    const b={
      select(c){if(q.op!=='select')q.returning=true;else q.cols=c;return b},
      update(p){q.op='update';q.payload=p;return b},insert(p){q.op='insert';q.payload=p;return b},delete(){q.op='delete';return b},
      upsert(p,o){q.op='upsert';q.payload=p;q.onConflict=o&&o.onConflict;return b},
      eq(c,v){q.filters.push(['eq',c,v]);return b},is(c,v){q.filters.push(['is',c,v]);return b},in(c,v){q.filters.push(['in',c,v]);return b},
      neq(){return b},order(c,o){q.order=[c,o];return b},limit(n){q.limit=n;return b},range(){return b},maybeSingle(){q.single=true;return b},single(){q.single=true;return b},
      then(res,rej){calls.push(q);return Promise.resolve(answer(q)||{data:null,error:null}).then(res,rej)}};
    return b};
  return{from,calls,channel:()=>({on(){return this},subscribe(){return this}})};
}
// A page whose elements are made as they are asked for (the dialogs draw into them).
function page(a){
  const els={};
  a.document.getElementById=id=>els[id]||(els[id]={id,value:'',innerHTML:'',textContent:'',disabled:false,readOnly:false,style:{},scrollTop:0,
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(){},contains(c){return this._s.has(c)}},contains:()=>false,addEventListener(){},removeEventListener(){},focus(){},select(){}});
  return els;
}
// Decode what a browser does to an attribute value.
const decodeAttr=s=>s.replace(/&(amp|lt|gt|quot|#39);/g,(m,n)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[n]));

const PAIRS=[
  {id:1,project_id:6,level:'GRD',area:'SLAB',sort_order:0,status:'active',source:'master_ops'},
  {id:2,project_id:6,level:'GRD',area:'COLUMNS',sort_order:1,status:'active',source:'master_ops'},
  {id:3,project_id:6,level:'L1',area:'SLAB',sort_order:2,status:'active',source:'master_ops'},
  {id:4,project_id:6,level:'L1',area:'WALLS',sort_order:5,status:'retired',source:'master_ops'},
];
const PROJECTS=[
  {id:6,name:'Barwon "Res"',supplier:'Aus Reo',levels:['GRD','L1'],areas:['SLAB','COLUMNS','WALLS'],hubProjectId:'8f0c0000-0000-4000-8000-000000000006',hubShortCode:'BAR',hubName:'Barwon Reservoir'},
  {id:8,name:'Jacksons Creek',supplier:'ARC',levels:['GRD'],areas:['SLAB'],hubProjectId:null,hubShortCode:null,hubName:null},
];
const E=(id,level,area,o={})=>({id,project:'Barwon "Res"',level,area,schedule:null,split_reference:null,status:'Not Ordered',entry_type:'scheduled',our_delivery_date:null,supplier_delivery_date:null,entry_date:'2026-11-01',drawing_reference:null,total_weight:null,...o});
const ENTRIES=[
  E(21,'GRD','SLAB',{schedule:'U9AV',split_reference:'Part 1',our_delivery_date:'2026-11-05',status:'Scheduled',supplier_delivery_date:'2026-11-05',total_weight:2.5}),
  E(23,'L1','WALLS',{schedule:'UT2X',status:'Ordered',our_delivery_date:'2026-11-10'}),
  E(30,null,null,{entry_type:'loose',schedule:'ADHOC-1',status:'Ordered',our_delivery_date:'2026-11-12'}),
  E(31,null,null,{entry_type:'loose',schedule:'ADHOC-2',status:'Cancelled'}),
];
// A fresh app copy signed in as DBCC with the fixtures above, pairs live.
function dbccApp({role='dbcc',answer,realEmail=false,pairsLive=true}={}){
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  a.__p={pairs:PAIRS,projects:PROJECTS,entries:ENTRIES,role,pairsLive};
  r(`pairsLive=__p.pairsLive;authRole=__p.role;userName='Chris';adminUnlocked=true;
     projectPairs=JSON.parse(JSON.stringify(__p.pairs));projects=JSON.parse(JSON.stringify(__p.projects));entries=JSON.parse(JSON.stringify(__p.entries));
     projectFiles=[];
     emailContacts=[{id:1,label:'Drew',email:'drew@ausreo.example',supplier:'Aus Reo'},{id:2,label:'Bolek',email:'bolek@arc.example',supplier:'ARC'}];
     projectSchedulers=[{project_name:'Barwon "Res"',contact_id:1}];
     __mail=[];${realEmail?'':'emailModal=(subject,body,id,ctx,pn,opts)=>__mail.push({subject,body,id,ctx,pn,opts});'}
     __loads=0;loadEntries=async()=>{__loads++};renderDash=()=>{};confirmDialog=(t,m,ok,c,fn)=>{__confirm={t,m,fn}};__alerts=[];alert=m=>__alerts.push(String(m));`);
  const els=page(a);
  els.dpProj=a.document.getElementById('dpProj');els.dpProj.value='Barwon "Res"';
  const sb=fakeSb(answer||(()=>({data:null,error:null})));a.__sb=sb;r('sb=__sb');
  return{a,r,els,sb};
}

// ── a3-5: the greeting ──
test('greetingFor: the scheduler(s) by name where known, else the supplier', ()=>{
  assert.equal(app.greetingFor([],'ARC'),'Hi ARC,');
  assert.equal(app.greetingFor(null,'Aus Reo'),'Hi Aus Reo,');
  assert.equal(app.greetingFor([],''),'Hi team,');
  assert.equal(app.greetingFor([{label:'Drew',email:'d@x'}],'Aus Reo'),'Hi Drew,');
  assert.equal(app.greetingFor([{label:'Drew'},{label:'Bolek'}],'ARC'),'Hi Drew and Bolek,');
  assert.equal(app.greetingFor([{label:'Drew'},{label:' Bolek '},{label:'Sam'}],'ARC'),'Hi Drew, Bolek and Sam,');
  assert.equal(app.greetingFor([{label:''},{label:null}],'ARC'),'Hi ARC,','a contact with no label is not a name');
});

// ── a3 price reference: settings with defaults ──
test('priceRefFor: the app_settings row when set, else the fixed default per supplier; an unknown supplier gets none', ()=>{
  assert.equal(app.priceRefFor('Aus Reo',{}),'Price as per quotation SQ000081216-2');
  assert.equal(app.priceRefFor('ARC',{price_ref_arc:''}),'Price as per ARC price guide 1 Jul 2026');
  assert.equal(app.priceRefFor('Aus Reo',{price_ref_ausreo:' Price as per quotation SQ000090000-1 '}),'Price as per quotation SQ000090000-1');
  assert.equal(app.priceRefFor('ARC',{price_ref_arc:'Price as per ARC guide Jan 2027'}),'Price as per ARC guide Jan 2027');
  assert.equal(app.priceRefFor('Someone',{}),'');
  // the page's own settings are the default argument
  run(`appSettings={overdue_install_days:3,price_ref_ausreo:'',price_ref_arc:'ARC words'}`);
  assert.equal(app.priceRefFor('ARC'),'ARC words');assert.equal(app.priceRefFor('Aus Reo'),'Price as per quotation SQ000081216-2');
  run(`appSettings={overdue_install_days:3,price_ref_ausreo:'',price_ref_arc:''}`);
});

test('loadAppSettings reads price_ref_ausreo / price_ref_arc beside overdue_install_days; a failed read keeps the defaults', async()=>{
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  let sb=fakeSb(q=>q.table==='app_settings'?{data:[{key:'overdue_install_days',value:'5'},{key:'price_ref_arc',value:'ARC Jan 2027'}],error:null}:null);
  a.__sb=sb;r('sb=__sb');
  await a.loadAppSettings();
  assert.deepEqual(plain(r('appSettings')),{overdue_install_days:5,price_ref_ausreo:'',price_ref_arc:'ARC Jan 2027'});
  assert.equal(a.priceRefFor('ARC'),'ARC Jan 2027');assert.equal(a.priceRefFor('Aus Reo'),'Price as per quotation SQ000081216-2');
  sb=fakeSb(()=>({data:null,error:{message:'no'}}));a.__sb=sb;r('sb=__sb');
  await a.loadAppSettings();
  assert.deepEqual(plain(r('appSettings')),{overdue_install_days:3,price_ref_ausreo:'',price_ref_arc:''});
});

test('the settings panel (DBCC admin): two price-reference boxes, saved as app_settings rows; a supplier login gets none', async()=>{
  const{a,r,els,sb}=dbccApp();
  r(`loadPeople=async()=>{};loadAssignments=async()=>{};loadAppSettings=async()=>{};renderAccountBody=()=>{};appSettings.price_ref_arc='ARC "guide" 2027'`);
  await a.renderAdminAccount();
  const h=els.adminAccount.innerHTML;
  assert.match(h,/Price reference on order emails — Aus Reo<\/label>/);
  assert.match(h,/<input type="text" id="priceRefInp_price_ref_ausreo" value="" placeholder="Price as per quotation SQ000081216-2"/);
  assert.match(h,/<input type="text" id="priceRefInp_price_ref_arc" value="ARC &quot;guide&quot; 2027" placeholder="Price as per ARC price guide 1 Jul 2026"/,'the saved words, escaped');
  assert.match(h,/onclick="savePriceRef\(&quot;Aus Reo&quot;\)"/,'the supplier name through jsArg');
  assert.match(h,/Now: ARC &quot;guide&quot; 2027/);
  a.document.getElementById('priceRefInp_price_ref_ausreo').value='  Price as per quotation SQ000090000-1 ';
  await a.savePriceRef('Aus Reo');
  const up=sb.calls.find(c=>c.table==='app_settings');
  assert.ok(up,'the row is written');assert.equal(up.op,'upsert');assert.equal(up.onConflict,'key');
  assert.equal(up.payload.key,'price_ref_ausreo');assert.equal(up.payload.value,'Price as per quotation SQ000090000-1','trimmed');
  const hist=sb.calls.find(c=>c.table==='audit_log');
  assert.equal(hist.payload.field_changed,'price_ref_ausreo');assert.equal(hist.payload.new_value,'Price as per quotation SQ000090000-1');
  await a.savePriceRef('Nobody');assert.equal(sb.calls.filter(c=>c.table==='app_settings').length,1,'an unknown supplier writes nothing');
  const s=dbccApp({role:'supplier'});
  s.r(`loadPeople=async()=>{};loadAssignments=async()=>{};loadAppSettings=async()=>{};renderAccountBody=()=>{}`);
  await s.a.renderAdminAccount();
  assert.ok(!/Price reference on order emails/.test(s.els.adminAccount.innerHTML),'not for a supplier');
  await s.a.savePriceRef('ARC');assert.equal(s.sb.calls.length,0,'a supplier can\'t save it');
});

// ── Q7's rule for orders ──
test('galvanisedItem: GAL / GALV / GALVANISED as words in the split label, split reference, drawing reference, schedule or the card note', ()=>{
  assert.equal(app.galvanisedItem({split:'GAL bars'}),true);
  assert.equal(app.galvanisedItem({split_reference:'galvanised starters'}),true);
  assert.equal(app.galvanisedItem({drawing_reference:'S-201 (GALV)'}),true);
  assert.equal(app.galvanisedItem({schedule:'VBEG-GAL'}),true);
  assert.equal(app.galvanisedItem({schedule:'VBEG'},'all galvanized please'),true);
  assert.equal(app.galvanisedItem({split:'SL82',schedule:'UT2X',drawing_reference:'S-100'}),false);
  assert.equal(app.galvanisedItem({split:'GALAXY'}),false,'GAL inside a word is not the item');
  assert.equal(app.galvanisedItem({split:'Part 1 - Regal'}),false);
  assert.equal(app.galvanisedItem(null),false);
});

test('a galvanised new order: the supplier line carries the quotation words only; the sender is warned with "required"', ()=>{
  const log={created:[{id:9,level:'GRD',area:'COLUMNS',split:'GAL starters',date:'2026-11-20'},{id:10,level:'GRD',area:'SLAB',split:'SL82',date:'2026-11-21'}],dates:[],cancels:[]};
  const L=plain(app.cellCardLines(log));
  assert.deepEqual(L.created,['GRD / COLUMNS (GAL starters) — 20/11/2026 — galvanised — price per your written quotation no. ______ (to be quoted on this order)','GRD / SLAB (SL82) — 21/11/2026']);
  assert.deepEqual(L.gal,['GRD / COLUMNS (GAL starters)']);
  const m=app.cellCardEmail({project:'P',supplier:'Aus Reo',log,files:[],sender:'Chris'});
  assert.match(m.body,/• GRD \/ COLUMNS \(GAL starters\) — 20\/11\/2026 — galvanised — price per your written quotation no\. ______ \(to be quoted on this order\)\n• GRD \/ SLAB \(SL82\) — 21\/11\/2026\nPrice as per quotation SQ000081216-2/);
  assert.ok(!/required|DBCC's rule|\brule\b/i.test(m.body.replace(/Debono Bros Concreting|DBCC representative|DBCC requested|our REO orders/g,'')),'the internal words never reach the supplier');
  assert.deepEqual(plain(m.gal),['GRD / COLUMNS (GAL starters)']);
  assert.equal(app.galWarning('GRD / COLUMNS (GAL starters)'),'Galvanised item GRD / COLUMNS (GAL starters) — a written per-project price with its quote number is required before this goes out');
  // the bulk email marks the same way, from the entry's own fields
  const b=app.orderCreatedEmail([{project:'P',level:'GRD',area:'SLAB',split_reference:'GALV mesh',our_delivery_date:'2026-11-20'},{project:'P',level:'L1',area:'SLAB',our_delivery_date:'2026-11-21'}],'P',{supplier:'ARC',sender:'Chris'});
  assert.match(b.body,/• P \/ GRD \/ SLAB \(GALV mesh\) — 20\/11\/2026 — galvanised — price per your written quotation no\. ______ \(to be quoted on this order\)\n• P \/ L1 \/ SLAB — 21\/11\/2026\nPrice as per ARC price guide 1 Jul 2026/);
  assert.deepEqual(plain(b.gal),['GRD / SLAB (GALV mesh)']);
  assert.ok(!/required/.test(b.body));
});

test('the cell card shows the sender\'s galvanised warning under "Saved in this card", escaped', ()=>{
  const{a,r,els}=dbccApp();
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  r(`cellCard.log.created.push({id:99,level:'GRD',area:'SLAB',split:'GAL <b>"x"</b>',date:'2026-11-20'})`);
  a.ccRefresh();
  const h=els.cellCardModal.innerHTML;
  assert.match(h,/<div class="warn-msg cc-gal">Galvanised item GRD \/ SLAB \(GAL &lt;b&gt;&quot;x&quot;&lt;\/b&gt;\) — a written per-project price with its quote number is required before this goes out<\/div>/);
  assert.ok(!/<b>"x"<\/b>/.test(h));
});

// ── a3 (2, 3, 5): the order email's shape ──
test('cellCardEmail: CANCELLED → DATE CHANGED → NEW ORDERS, the count line first, the scheduler greeted, the price reference under NEW ORDERS, a reply per line asked for', ()=>{
  const log={created:[{id:9,level:'GRD',area:'COLUMNS',split:'Part 1',date:'2026-11-20'}],
    dates:[{id:1,level:'GRD',area:'SLAB',split:'Part 1',schedule:'U9AV',old:'2026-11-05',new:'2026-11-12'}],
    cancels:[{id:2,level:'L1',area:'WALLS',split:null,schedule:'UT2X',reason:'wall redesigned'}]};
  const m=app.cellCardEmail({project:'Barwon "Res"',supplier:'Aus Reo',log,files:[],sender:'Chris',schedulers:[{label:'Drew',email:'d@x'}],priceRef:'Price as per quotation SQ000090000-1'});
  assert.equal(m.body,
`Hi Drew,

This email covers 3 orders: 1 new, 1 date change, 1 cancelled — please confirm you have every line.

The following changes have been made to our REO orders for Barwon "Res":

CANCELLED
• L1 / WALLS · UT2X — reason: wall redesigned

DBCC REQUESTED DELIVERY DATE CHANGED
• GRD / SLAB (Part 1) · U9AV — 05/11/2026 → 12/11/2026

NEW ORDERS — DBCC requested delivery date
• GRD / COLUMNS (Part 1) — 20/11/2026
Price as per quotation SQ000090000-1

Please reply confirming each line above (one line per order), and your production delivery dates.

If these changes are not acceptable, please contact a DBCC representative immediately to resolve the matter.

Regards,
Chris
Debono Bros Concreting`);
  assert.deepEqual(plain(m.count),{n:3,parts:'1 new, 1 date change, 1 cancelled',words:'3 orders: 1 new, 1 date change, 1 cancelled'});
  assert.equal(m.subject,'REO orders — Barwon "Res" (1 new, 1 date change, 1 cancelled)');
  const i=s=>m.body.indexOf(s);
  assert.ok(i('CANCELLED')<i('DBCC REQUESTED DELIVERY DATE CHANGED')&&i('DBCC REQUESTED DELIVERY DATE CHANGED')<i('NEW ORDERS'),'section order');
  // one line: singular; the price reference given as '' prints nothing; no new orders → no price line at all
  const one=app.cellCardEmail({project:'P',supplier:'ARC',log:{created:[{id:9,level:'GRD',area:'SLAB',split:null,date:'2026-11-20'}],dates:[],cancels:[]},files:[],sender:'S',priceRef:''});
  assert.match(one.body,/^Hi ARC,\n\nThis email covers 1 order: 1 new — please confirm you have every line\.\n/);
  assert.ok(!/Price as per/.test(one.body));
  const none=app.cellCardEmail({project:'P',supplier:'ARC',log:{created:[],dates:[{id:1,level:'GRD',area:'SLAB',split:null,schedule:null,old:'',new:'2026-11-12'}],cancels:[]},files:[],sender:'S'});
  assert.ok(!/Price as per/.test(none.body),'a date change alone: no price line');
  assert.match(none.body,/This email covers 1 order: 1 date change — please confirm you have every line\./);
});

test('the card passes the job\'s schedulers and the supplier\'s price reference, and hands the count and the galvanised items to the email dialog', async()=>{
  const{a,r}=dbccApp();
  r(`appSettings.price_ref_ausreo='Price as per quotation SQ000090000-1'`);
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  r(`cellCard.log.created=[{id:9,level:'GRD',area:'SLAB',split:'GAL',date:'2026-11-20'}];cellCard.orders={}`);
  await a.ccCreateAndEmail();
  const m=plain(r('__mail'))[0];
  assert.match(m.body,/^Hi Drew,\n\nThis email covers 1 order: 1 new/);
  assert.match(m.body,/Price as per quotation SQ000090000-1/);
  assert.deepEqual(m.opts.count,{n:1,parts:'1 new',words:'1 order: 1 new'});
  assert.deepEqual(m.opts.gal,['GRD / SLAB (GAL)']);
  assert.equal(m.ctx,'cell_card');
});

test('openOrderCreatedEmail (the bulk email): the same greeting, count, price reference and close — NEW ORDERS only', ()=>{
  const{a,r}=dbccApp();
  a.openOrderCreatedEmail([{project:'Barwon "Res"',level:'GRD',area:'SLAB',split_reference:'Part 1',our_delivery_date:'2026-11-20'},{project:'Barwon "Res"',level:'L1',area:'SLAB',our_delivery_date:null}],'Barwon "Res"');
  const m=plain(r('__mail'))[0];
  assert.equal(m.subject,'Orders Created — Barwon "Res" (2 entries)');
  assert.equal(m.body,
`Hi Drew,

This email covers 2 orders: 2 new — please confirm you have every line.

The following DBCC requested delivery dates have been set:

NEW ORDERS — DBCC requested delivery date
• Barwon "Res" / GRD / SLAB (Part 1) — 20/11/2026
• Barwon "Res" / L1 / SLAB — TBC
Price as per quotation SQ000081216-2

Please reply confirming each line above (one line per order), and your production delivery dates.

If these changes are not acceptable, please contact a DBCC representative immediately to resolve the matter.

Regards,
Chris
Debono Bros Concreting`);
  assert.equal(m.ctx,'order_created');assert.deepEqual(m.opts.count,{n:2,parts:'2 new',words:'2 orders: 2 new'});
  // an ARC job with no scheduler: the supplier greeted, ARC's price reference
  a.openOrderCreatedEmail([{project:'Jacksons Creek',level:'GRD',area:'SLAB',our_delivery_date:'2026-11-20'}],'Jacksons Creek');
  const j=plain(r('__mail'))[1];
  assert.equal(j.subject,'Order Created — Jacksons Creek / GRD / SLAB');
  assert.match(j.body,/^Hi ARC,\n\nThis email covers 1 order: 1 new — please confirm you have every line\./);
  assert.match(j.body,/\nPrice as per ARC price guide 1 Jul 2026\n/);
});

// ── a2: the copy-across panel ──
test('emailAllText: To, CC (only when set), Subject, a blank line, the message', ()=>{
  assert.equal(app.emailAllText({to:'a@x',cc:'b@x, c@x',sub:'S',body:'Hi\n\nBody'}),'To: a@x\nCC: b@x, c@x\nSubject: S\n\nHi\n\nBody');
  assert.equal(app.emailAllText({to:'a@x',cc:'',sub:'S',body:'B'}),'To: a@x\nSubject: S\n\nB');
  assert.equal(app.emailAllText({to:'',sub:'',body:''}),'To: \nSubject: \n\n');
});

test('the copy-across panel: the count first, To and Subject shown (escaped), the galvanised warning, and Copy all copies everything', async()=>{
  const{a,r,els}=dbccApp({realEmail:true});
  const clip=[];a.navigator={clipboard:{writeText:async s=>{clip.push(s)}}};
  a.emailHold({id:null,context:'cell_card',to:'drew@ausreo.example" onfocus="alert(1)',cc:'',sub:'REO orders — Barwon "Res" (3 new)',body:'Hi Drew,\n\nbody',nFiles:0,len:2500,
    count:{n:3,parts:'2 new, 1 cancelled',words:'3 orders: 2 new, 1 cancelled'},gal:['GRD / SLAB (GAL <x>)']});
  const h=els.emLong.innerHTML;
  assert.match(h,/<p class="em-count"><b>This email: 3 orders<\/b> — 2 new, 1 cancelled<\/p>/);
  assert.ok(h.indexOf('em-count')<h.indexOf('em-steps'),'the count is at the top');
  assert.match(h,/<input type="text" id="emL_to" value="drew@ausreo\.example&quot; onfocus=&quot;alert\(1\)" readonly>/,'a quote in the address never closes the attribute');
  assert.ok(!/" onfocus="alert/.test(h));
  assert.match(h,/<input type="text" id="emL_sub" value="REO orders — Barwon &quot;Res&quot; \(3 new\)" readonly>/);
  assert.match(h,/<div class="warn-msg em-gal">Galvanised item GRD \/ SLAB \(GAL &lt;x&gt;\) — a written per-project price with its quote number is required before this goes out<\/div>/);
  assert.match(h,/<button class="btn btn-sec btn-sm" onclick="emailCopyAll\(\)">Copy all<\/button>/);
  assert.match(h,/Press <b>Copy all<\/b>/);
  await a.emailCopyAll();
  assert.deepEqual(clip,['To: drew@ausreo.example" onfocus="alert(1)\nSubject: REO orders — Barwon "Res" (3 new)\n\nHi Drew,\n\nbody']);
  assert.match(els.emL_msg.innerHTML,/Everything \(To, Subject and the message\) is copied — paste it into your email\./);
  // a clipboard that refuses: the by-hand words; the per-part Copy still works as b5.14
  a.navigator={clipboard:{writeText:async()=>{throw new Error('denied')}}};a.document.execCommand=()=>false;
  await a.emailCopyAll();
  assert.match(els.emL_msg.innerHTML,/The browser wouldn't copy it\. Select it above and press Ctrl\+C/);
  a.navigator={clipboard:{writeText:async s=>{clip.push(s)}}};
  await a.emailCopy('emL_sub');assert.equal(clip[1],'REO orders — Barwon "Res" (3 new)');
  // a singular count, a CC line in Copy all, and no count / gal → no count line, no warning
  a.emailHold({id:null,context:'x',to:'a@x',cc:'b@x',sub:'S',body:'B',nFiles:0,len:2500,count:{n:1,parts:'1 new',words:'1 order: 1 new'},gal:[]});
  assert.match(els.emLong.innerHTML,/<b>This email: 1 order<\/b> — 1 new/);
  await a.emailCopyAll();assert.equal(clip[2],'To: a@x\nCC: b@x\nSubject: S\n\nB');
  a.emailHold({id:5,context:'mismatch',to:'a@x',cc:'',sub:'S',body:'B',nFiles:0,len:2500});
  assert.ok(!/em-count|em-gal/.test(els.emLong.innerHTML));
  assert.equal(r('emailHeld').count,undefined);
});

test('a too-long cell card email reaches the panel with its count and galvanised items; the dialog itself warns the sender', async()=>{
  const{a,r,els}=dbccApp({realEmail:true});
  a.open=()=>{};
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  r(`cellCard.log.created=Array.from({length:40},(_,i)=>({id:1000+i,level:'GRD',area:'SLAB',split:i?'Part '+(i+1):'GAL Part 1',date:'2026-11-20'}));cellCard.orders={}`);
  await a.ccCreateAndEmail();
  assert.match(els.emailModal.innerHTML,/<div class="warn-msg em-gal">Galvanised item GRD \/ SLAB \(GAL Part 1\) — a written per-project price with its quote number is required before this goes out<\/div>/,'the dialog warns the sender');
  assert.ok(!/Galvanised item/.test(decodeAttr(els.emailModal.innerHTML.match(/<textarea id="em_body"[^>]*>([\s\S]*?)<\/textarea>/)[1])),'never in the body');
  const g=id=>a.document.getElementById(id);
  g('em_to').value='drew@ausreo.example';g('em_sub').value='REO orders — Barwon "Res" (40 new)';g('em_body').value=run('"x".repeat(2200)');
  await a.sendEmail(null,'cell_card');
  assert.match(els.emLong.innerHTML,/<b>This email: 40 orders<\/b> — 40 new/);
  assert.match(els.emLong.innerHTML,/em-gal/);
  // a plain row email after it: the dialog forgets the card's count
  a.openMismatchEmail(21);
  assert.deepEqual(plain(r('emailOpts')),{count:null,gal:[]});
});
