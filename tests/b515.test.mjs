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

// ── a4: the Edit dialog can't place a BLANK ad hoc entry ──
test('editPairProblem: an unplaced ad hoc row whose form fills a level or area → "Complete this in Master-OPS"; a placed row still moves', ()=>{
  const{a}=dbccApp();
  const words='Complete this in Master-OPS — an ad hoc item is placed on REO Schedules there (the lobby → Place ad hoc), and the next pull brings it here.';
  const loose={project:'Barwon "Res"',level:null,area:null,entry_type:'loose'};
  assert.equal(a.editPairProblem(loose,{project:'Barwon "Res"',level:'GRD',area:'SLAB'}),words,'even an active pair');
  assert.equal(a.editPairProblem(loose,{project:'Barwon "Res"',level:'GRD',area:''}),words);
  assert.equal(a.editPairProblem(loose,{project:'Barwon "Res"',level:'',area:'SLAB'}),words);
  assert.equal(a.editPairProblem(loose,{project:'Barwon "Res"',level:'',area:''}),null,'both blank: unchanged');
  assert.equal(a.editPairProblem(loose,{project:'Jacksons Creek',level:'',area:''}),null,'moved to another job, still Ad hoc there');
  assert.equal(a.editPairProblem({...loose,level:'',area:''},{project:'Barwon "Res"',level:'GRD',area:'SLAB'}),words,'"" and null are the same blank');
  const placed={project:'Barwon "Res"',level:'L1',area:'WALLS',entry_type:'scheduled'};
  assert.equal(a.editPairProblem(placed,{project:'Barwon "Res"',level:'GRD',area:'SLAB'}),null,'a placed entry moves to an active pair as b5.14');
  assert.equal(a.editPairProblem(placed,{project:'Barwon "Res"',level:'GRD',area:'WALLS'}),"GRD / WALLS isn't a level/area on this job — refresh, or send it as Ad hoc.");
  const placedLoose={project:'Barwon "Res"',level:'GRD',area:'SLAB',entry_type:'loose'};
  assert.equal(a.editPairProblem(placedLoose,{project:'Barwon "Res"',level:'GRD',area:'COLUMNS'}),null,'an ad hoc entry already placed moves like any other');
});

test('the Edit dialog (pairs live): an unplaced ad hoc entry\'s level / area are disabled with the hint; a placed entry\'s are enabled; Save refuses a placement', async()=>{
  const{a,r,els,sb}=dbccApp();
  a.document.getElementById('ed_proj').value='Barwon "Res"';   // the stub page holds no <option>s: the select's value is set as a browser would from the picked option
  a.openEditEntry(30);
  let h=els.editModal.innerHTML;
  assert.match(h,/<select id="ed_proj">/,'the job can still change');
  assert.match(h,/<select id="ed_level" disabled>/);assert.match(h,/<select id="ed_area" disabled>/);
  assert.match(h,/<div class="hint" id="ed_adhoc_hint"[^>]*>Complete this in Master-OPS — an ad hoc item is placed on REO Schedules there \(the lobby → Place ad hoc\), and the next pull brings it here\.<\/div>/);
  // re-enabled by hand and filled: Save refuses before anything is sent
  a.document.getElementById('ed_level').value='GRD';a.document.getElementById('ed_area').value='SLAB';
  await a.saveEdit(30);
  assert.equal(sb.calls.length,0,'nothing sent');
  assert.match(els.edErr.innerHTML,/Complete this in Master-OPS — an ad hoc item is placed on REO Schedules there/);
  // a placed entry: as b5.14
  a.openEditEntry(21);
  h=els.editModal.innerHTML;
  assert.match(h,/<select id="ed_level">/);assert.match(h,/<select id="ed_area">/);
  assert.ok(!/ed_adhoc_hint/.test(h));
  // pairs off: nothing of this (the b5.13 dialog)
  const off=dbccApp({pairsLive:false});
  off.a.openEditEntry(30);
  assert.match(off.els.editModal.innerHTML,/<select id="ed_level">/);assert.ok(!/ed_adhoc_hint/.test(off.els.editModal.innerHTML));
  // a supplier: the b5.14 lock and its words, not the ad hoc ones
  const s=dbccApp({role:'supplier'});
  s.a.openEditEntry(30);
  assert.match(s.els.editModal.innerHTML,/<select id="ed_level" disabled>/);
  assert.match(s.els.editModal.innerHTML,/Only DBCC can change the job, level or area once an entry is made — ask DBCC\./);
  assert.ok(!/ed_adhoc_hint/.test(s.els.editModal.innerHTML));
});

// ── a5: the conflict names the fields and who changed them; what was typed survives "Reload the entry" ──
// A page whose Edit dialog behaves like a browser's: when the dialog is drawn, each ed_* input / select takes the value
// (or the selected option) the HTML gives it, and `disabled` is honoured — so the snapshot openEditEntry takes is real.
function formPage(a,els){
  const sync=h=>{for(const m of h.matchAll(/<(input|select) [^>]*?id="(ed_\w+)"([^>]*)>/g)){const[,tag,id,rest]=m,el=a.document.getElementById(id);
      el.disabled=/\bdisabled\b/.test(rest);
      if(tag==='input'){const v=/ value="([^"]*)"/.exec(m[0]);el.value=v?decodeAttr(v[1]):''}
      else{const body=h.slice(m.index+m[0].length,h.indexOf('</select>',m.index));const s=/<option value="([^"]*)" selected>/.exec(body)||/<option value="([^"]*)"/.exec(body);el.value=s?decodeAttr(s[1]):''}}};
  els.editModal={id:'editModal',_h:'',get innerHTML(){return this._h},set innerHTML(h){this._h=h;sync(h)},style:{},classList:{add(){},remove(){},contains:()=>false}};
  return els;
}
const todayAt=(h,m)=>{const n=new Date();return new Date(n.getFullYear(),n.getMonth(),n.getDate(),h,m).toISOString()};
// fidelity review F4 (9 Nov 2026): a history row for a dialog the test opens NOW is stamped from the clock, never a fixed
// 10:12 — editConflictWords keeps only rows from the dialog's opening (less a minute), so a fixed time passed only near
// 10:12. `justNow` = one second from now; `hhmm` = how the refusal prints it (a date before it if the day turned over).
const justNow=()=>new Date(Date.now()+1000);
const hhmm=d=>'(?:\\d\\d/\\d\\d )?'+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');

test('editConflictWords: each field with who and when from the history since the dialog opened; no / refused / stale history → "changed meanwhile"; never throws', ()=>{
  const since=todayAt(9,0);
  const hist=[{field_changed:'supplier_delivery_date',user_identifier:'Maryanne',created_at:todayAt(9,58)},
    {field_changed:'level',user_identifier:'Old Hand',created_at:todayAt(8,0)},   // before the dialog opened: an earlier change, not this one
    {field_changed:'level',user_identifier:'Drew',created_at:todayAt(10,12)}];
  const W=s=>`This entry changed while you were editing — ${s}. Nothing was saved.`;
  assert.equal(app.editConflictWords(['level','supplier_delivery_date'],hist,since),W('Level (by Drew, 10:12), Production delivery date (by Maryanne, 09:58)'));
  assert.equal(app.editConflictWords(['level','status'],hist,since),W('Level (by Drew, 10:12), Status (changed meanwhile)'),'a field with no history row');
  for(const h of [[],null,undefined,{data:'not rows'},'x'])assert.equal(app.editConflictWords(['level'],h,since),W('Level (changed meanwhile)'),'history '+JSON.stringify(h));
  assert.equal(app.editConflictWords(['level'],[hist[1]],since),W('Level (changed meanwhile)'),'a row older than the dialog is not this change');
  assert.equal(app.editConflictWords(['level'],[hist[1]],null),W('Level (by Old Hand, 08:00)'),'with no opening time every row counts');
  assert.equal(app.editConflictWords(['level'],[{field_changed:'level',user_identifier:'',created_at:todayAt(10,0)}],since),W('Level (changed meanwhile)'),'no name on the row');
  assert.equal(app.editConflictWords(['level'],[{field_changed:'level',user_identifier:'Drew',created_at:'garbage'}],null),W('Level (by Drew)'),'a bad time: the name alone');
  assert.equal(app.editConflictWords(['level'],[{field_changed:'level',user_identifier:'Drew',created_at:'2026-11-03T10:12:00'}],null,new Date(2026,10,9,12,0)),W('Level (by Drew, 03/11 10:12)'),'another day carries its date');
  // no field named (the conditional update landed nowhere): the fresh history says which fields moved
  assert.equal(app.editConflictWords([],hist,since),W('Level (by Drew, 10:12), Production delivery date (by Maryanne, 09:58)'));
  assert.equal(app.editConflictWords([],[{field_changed:'schedule_removed',user_identifier:'X',created_at:todayAt(10,0)}],since),'This entry changed while you were editing. Nothing was saved.','only the dialog\'s fields are named');
  assert.equal(app.editConflictWords([],[],since),'This entry changed while you were editing. Nothing was saved.');
  assert.equal(app.editConflictWords(null,null,null),'This entry changed while you were editing. Nothing was saved.');
});

test('saveEdit on a conflict: the refusal names the field and who (DBCC reads the history); a refused or thrown history read still shows it', async()=>{
  const at=justNow();
  let audit=()=>({data:[{field_changed:'level',user_identifier:'Drew <b>',created_at:at.toISOString()}],error:null});
  const{a,els,sb}=dbccApp({answer:q=>q.table==='entries'&&q.op==='select'?{data:{...ENTRIES[0],level:'L1'},error:null}:q.table==='audit_log'&&q.op==='select'?audit():q.op==='update'?{data:[{id:21}],error:null}:null});
  formPage(a,els);
  a.openEditEntry(21);
  const g=id=>a.document.getElementById(id);
  assert.equal(g('ed_sched').value,'U9AV','the page reads the dialog\'s values');assert.equal(g('ed_level').value,'GRD');
  g('ed_sched').value='U9AV-2';
  await a.saveEdit(21);
  assert.deepEqual(sb.calls.map(c=>c.table+':'+c.op),['entries:select','audit_log:select'],'nothing written');
  const hq=sb.calls[1];assert.equal(hq.cols,'field_changed,user_identifier,created_at');assert.deepEqual([...hq.filters[0]],['eq','entry_id',21]);assert.deepEqual(plain(hq.order),['created_at',{ascending:false}]);assert.equal(hq.limit,30);
  assert.match(els.edErr.innerHTML,new RegExp('^<div class="error-msg">This entry changed while you were editing — Level \\(by Drew &lt;b&gt;, '+hhmm(at)+'\\)\\. Nothing was saved\\.<div style="margin-top:8px"><button class="btn btn-sec btn-sm" onclick="reloadEditEntry\\(21\\)"'),'escaped');
  assert.ok(!/Drew <b>/.test(els.edErr.innerHTML));
  // refused (a supplier login can't read audit_log): the dialog still shows, "changed meanwhile"
  audit=()=>({data:null,error:{message:'permission denied for table audit_log'}});
  await a.saveEdit(21);
  assert.match(els.edErr.innerHTML,/— Level \(changed meanwhile\)\. Nothing was saved\./);
  assert.match(els.edErr.innerHTML,/onclick="reloadEditEntry\(21\)"/);
  // the read throws: the same
  audit=()=>{throw new Error('boom')};
  await a.saveEdit(21);
  assert.match(els.edErr.innerHTML,/— Level \(changed meanwhile\)\. Nothing was saved\./);
});

test('editReapply: only the fields the person changed that the reloaded entry doesn\'t already hold; never the job / level / area of an unplaced row', ()=>{
  const shown={project:'P',level:'GRD',area:'SLAB',schedule:'U9AV',entry_date:'2026-11-01',our_delivery_date:'',supplier_delivery_date:'',drawing_reference:'',total_weight:'2.5',split_reference:''};
  const typed={...shown,schedule:'U9AV-2',total_weight:'3.1',supplier_delivery_date:'2026-11-06'};
  const reloaded={...shown,level:'L1',supplier_delivery_date:'2026-11-06'};
  const row={entry_type:'scheduled',level:'GRD',area:'SLAB'};
  const reapply=(...x)=>plain(app.editReapply(...x));   // the vm realm's arrays, as plain values
  assert.deepEqual(reapply(typed,shown,reloaded,row),['schedule','total_weight'],'the typed date equals the reloaded one: dropped; the level the person never touched: never re-applied over Drew\'s');
  assert.deepEqual(reapply(shown,shown,reloaded,row),[]);
  assert.deepEqual(reapply({...shown,level:'L1'},shown,{...shown,level:'GRD'},row),['level'],'a placed row\'s level the person changed is kept');
  const loose={entry_type:'loose',level:null,area:null},s2={...shown,level:'',area:''};
  assert.deepEqual(reapply({...s2,project:'Q',level:'GRD',area:'SLAB',schedule:'X'},s2,s2,loose),['schedule'],'an unplaced row: its job / level / area never');
  assert.deepEqual(reapply(null,shown,reloaded,row),[]);assert.deepEqual(reapply(typed,null,reloaded,row),[]);assert.deepEqual(reapply(typed,shown,null,row),[]);
});

test('"Reload the entry" keeps what was typed (not saved), writes it back over the reloaded entry, lists it, and Save then sends only the real changes', async()=>{
  const changed={...ENTRIES[0],level:'L1',area:'SLAB',supplier_delivery_date:'2026-11-06'};   // Drew moved it to L1 / SLAB and set the production date
  const at=justNow();
  const{a,r,els,sb}=dbccApp({answer:q=>q.table==='entries'&&q.op==='select'?{data:{...changed},error:null}:q.table==='audit_log'&&q.op==='select'?{data:[{field_changed:'level',user_identifier:'Drew',created_at:at.toISOString()}],error:null}:q.op==='update'?{data:[{id:21}],error:null}:null});
  formPage(a,els);
  a.__db=changed;r(`loadEntries=async()=>{__loads++;entries=__db?entries.map(e=>e.id===21?JSON.parse(JSON.stringify(__db)):e):entries.filter(e=>e.id!==21)}`);
  a.openEditEntry(21);
  const g=id=>a.document.getElementById(id);
  g('ed_sched').value='U9AV-2';g('ed_wt').value='3.1';g('ed_draw').value='S-100';g('ed_supD').value='2026-11-06';
  await a.saveEdit(21);
  assert.match(els.edErr.innerHTML,new RegExp('Level \\(by Drew, '+hhmm(at)+'\\)'));
  await a.reloadEditEntry(21);
  assert.equal(r('__loads'),1);
  assert.equal(g('ed_level').value,'L1','the reloaded entry\'s level (Drew\'s change), not the stale one');
  assert.equal(g('ed_area').value,'SLAB');
  assert.equal(g('ed_sched').value,'U9AV-2');assert.equal(g('ed_wt').value,'3.1');assert.equal(g('ed_draw').value,'S-100');
  assert.equal(els.ed_kept.innerHTML,'<div class="hint" style="margin-top:8px">Your typed values are kept (not saved yet): Schedule, Drawing reference, Weight</div>','the typed date equals the reloaded one: not listed');
  assert.equal(r('editSnap.form.schedule'),'U9AV','Save compares against the database\'s values, not the typed ones');
  assert.equal(r('editSnap.form.level'),'L1');assert.equal(r('editSnap.row.level'),'L1');
  assert.equal(r('editKeep'),null);
  sb.calls.length=0;
  await a.saveEdit(21);
  const upd=sb.calls.find(c=>c.op==='update');
  assert.ok(upd,'saved');
  assert.deepEqual({...upd.payload},{schedule:'U9AV-2',drawing_reference:'S-100',total_weight:3.1},'only the real changes');
  const guard=Object.fromEntries(upd.filters.filter(f=>f[1]!=='id').map(f=>[f[1],f[0]==='is'?null:f[2]]));
  assert.equal(guard.level,'L1','guarded by the reloaded values');assert.equal(guard.supplier_delivery_date,'2026-11-06');
  // a plain open (no Reload before it) keeps nothing and lists nothing
  els.ed_kept.innerHTML='';
  a.openEditEntry(21);
  assert.equal(els.ed_kept.innerHTML,'');assert.equal(r('editKeep'),null);
  // the entry gone on reload: the dialog closes, nothing is kept
  g('ed_sched').value='GONE';a.__db=null;
  await a.reloadEditEntry(21);
  assert.deepEqual(plain(r('__alerts')),['This entry is no longer there — it may have been deleted.']);
  assert.equal(r('editKeep'),null);
});

test('a typed value for a disabled select is never written back: an unplaced ad hoc entry stays unplaced after Reload', async()=>{
  const{a,r,els}=dbccApp({answer:q=>q.table==='entries'&&q.op==='select'?{data:{...ENTRIES[2],status:'Cancelled'},error:null}:q.table==='audit_log'?{data:[],error:null}:null});
  formPage(a,els);
  a.__db={...ENTRIES[2],status:'Cancelled'};r(`loadEntries=async()=>{entries=entries.map(e=>e.id===30?JSON.parse(JSON.stringify(__db)):e)}`);
  a.openEditEntry(30);
  const g=id=>a.document.getElementById(id);
  assert.equal(g('ed_level').disabled,true);
  g('ed_level').value='GRD';g('ed_area').value='SLAB';g('ed_split').value='Part 9';   // the selects re-enabled by hand and filled
  g('ed_level').disabled=false;g('ed_area').disabled=false;
  await a.saveEdit(30);
  assert.match(els.edErr.innerHTML,/Complete this in Master-OPS/,'a4 refuses first');
  g('ed_level').disabled=true;g('ed_area').disabled=true;
  r(`editSnap.row.status='Ordered'`);   // make the next Save reach the database and conflict on status
  g('ed_level').disabled=false;g('ed_area').disabled=false;g('ed_level').value='';g('ed_area').value='';
  await a.saveEdit(30);
  assert.match(els.edErr.innerHTML,/Status \(changed meanwhile\)/);
  g('ed_level').value='GRD';g('ed_area').value='SLAB';
  await a.reloadEditEntry(30);
  assert.equal(g('ed_level').value,'','never placed from here');assert.equal(g('ed_area').value,'');
  assert.equal(g('ed_split').value,'Part 9');
  assert.equal(els.ed_kept.innerHTML,'<div class="hint" style="margin-top:8px">Your typed values are kept (not saved yet): Split reference</div>');
});
