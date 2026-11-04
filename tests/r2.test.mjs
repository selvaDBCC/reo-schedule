// REO b5.14 (stage 2) — tests for the level / area pairs screens behind app_settings pairs_live.
// Plain node:test, no packages, nothing touches a server. Run from the repo root:  node --test
//
// app.js is loaded the way the page loads it (minus the final init()) inside a node:vm context, as in r1.test.mjs, so
// these check the real code. R2_APP_JS points the same tests at another copy (a mutation check: they must then fail).
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const SRC=readFileSync(process.env.R2_APP_JS||new URL('../app.js',import.meta.url),'utf8');
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
const plain=x=>JSON.parse(JSON.stringify(x));   // arrays made inside the vm have their own prototype

// ── Fixtures: Barwon (6, linked) and 1033 Nepean Hwy (7, REO-only pair) ──
const PAIRS=[
  {id:1,project_id:6,level:'GRD',area:'SLAB',sort_order:0,status:'active',source:'master_ops'},
  {id:2,project_id:6,level:'GRD',area:'COLUMNS',sort_order:1,status:'active',source:'master_ops'},
  {id:3,project_id:6,level:'L1',area:'SLAB',sort_order:2,status:'active',source:'master_ops'},
  {id:4,project_id:6,level:'L1',area:'WALLS',sort_order:5,status:'retired',source:'master_ops'},
  {id:5,project_id:6,level:'B1',area:'PILES',sort_order:null,status:'active',source:'master_ops'},
  {id:6,project_id:6,level:'GRD-L1',area:'COLUMNS',sort_order:3,status:'active',source:'master_ops'},
  {id:7,project_id:7,level:'Driveway',area:'Excavation',sort_order:1,status:'active',source:'reo_local'},
];
const PROJECTS=[
  {id:6,name:'Barwon Reservoir',supplier:'Aus Reo',levels:['GRD','L1','GRD-L1','B1'],areas:['SLAB','COLUMNS','WALLS','PILES'],hubProjectId:'8f0c0000-0000-4000-8000-000000000006',hubShortCode:'BAR',hubName:'Barwon Reservoir'},
  {id:7,name:'1033 Nepean Hwy',supplier:'Aus Reo',levels:['Driveway'],areas:['Excavation'],hubProjectId:null,hubShortCode:null,hubName:null},
  {id:8,name:'New Job',supplier:'ARC',levels:[],areas:[],hubProjectId:null,hubShortCode:null,hubName:null},
];
function setPairs(on,pairs=PAIRS,projects=PROJECTS){app.__p={on,pairs,projects};run('pairsLive=__p.on;projectPairs=JSON.parse(JSON.stringify(__p.pairs));projects=JSON.parse(JSON.stringify(__p.projects));')}

test('pairs_live: only "on" turns the restrictions on — missing, off or anything else is off', ()=>{
  for(const v of ['on','ON',' on ','On'])assert.equal(app.pairsSwitchOn(v),true,JSON.stringify(v));
  for(const v of ['off','',' ','yes','true','1','onn',null,undefined,1,true,{}])assert.equal(app.pairsSwitchOn(v),false,JSON.stringify(v));
});

test('the order rule: smallest sort_order first, none last, ties by name; the pair filter keeps one level\'s active pairs', ()=>{
  const p6=app.pairsOf(6,PAIRS);
  assert.deepEqual(plain(app.activeLevels(p6)),['GRD','L1','GRD-L1','B1'],'L1 by its active pair (2); B1 has no sort_order → last');
  assert.deepEqual(plain(app.orderNames(p6,'area')),['SLAB','COLUMNS','WALLS','PILES'],'an area by the smallest sort_order among its pairs');
  assert.deepEqual(plain(app.areasForLevel(p6,'GRD')),['SLAB','COLUMNS']);
  assert.deepEqual(plain(app.areasForLevel(p6,'L1')),['SLAB'],'a retired pair is not offered');
  assert.deepEqual(plain(app.areasForLevel(p6,'NOPE')),[]);
  assert.deepEqual(plain(app.orderNames([{level:'ROOF',sort_order:9},{level:'PLANT',sort_order:9},{level:'A',sort_order:null},{level:'B1',sort_order:10}],'level')),['PLANT','ROOF','B1','A'],'ties by name');
  assert.deepEqual(plain(app.pairsOf('7',PAIRS)).map(p=>p.id),[7],'a project id from a select (text) finds its pairs');
  assert.ok(app.isActivePairIn(p6,'GRD','SLAB'));assert.ok(!app.isActivePairIn(p6,'L1','WALLS'));assert.ok(!app.isActivePairIn(p6,'GRD','WALLS'));
  assert.ok(!app.isActivePairIn(p6,'GRD ','SLAB'),'names are compared exactly, as the database does');
});

test("pairProblem says what the database guard says, in its words", ()=>{
  const p6=app.pairsOf(6,PAIRS);
  const P=o=>app.pairProblem(p6,o);
  assert.equal(P({level:'GRD',area:'SLAB',entryType:'scheduled'}),null);
  assert.equal(P({level:'',area:'',entryType:'loose'}),null,'Ad hoc may leave both blank');
  assert.equal(P({level:'  ',area:null,entryType:'loose'}),null,'spaces count as blank');
  assert.equal(P({level:'',area:'',entryType:'scheduled'}),'Pick a level and area — or send it as Ad hoc.');
  assert.equal(P({level:'GRD',area:'',entryType:'loose'}),'Pick both a level and an area, or leave both blank.');
  assert.equal(P({level:'',area:'SLAB',entryType:'scheduled'}),'Pick both a level and an area, or leave both blank.');
  assert.equal(P({level:'',area:'',entryType:'loose',wasPlaced:true}),"A placed entry can't be un-placed — move it to another level/area.");
  assert.equal(P({level:'L1',area:'WALLS',entryType:'scheduled'}),"L1 / WALLS isn't a level/area on this job — refresh, or send it as Ad hoc.",'a retired pair is refused for a new placement');
  assert.equal(P({level:'GRD',area:'WALLS',entryType:'loose'}),"GRD / WALLS isn't a level/area on this job — refresh, or send it as Ad hoc.");
});

test('the Ad hoc pill: one pill; with pairs live an Ad hoc entry with no level / area says DBCC will place it', ()=>{
  const loose={entry_type:'loose',level:null,area:'  '},placed={entry_type:'loose',level:'GRD',area:'SLAB'},sched={entry_type:'scheduled',level:null,area:null};
  assert.ok(app.isUnplaced(loose));assert.ok(!app.isUnplaced(placed));assert.ok(!app.isUnplaced(sched));assert.ok(!app.isUnplaced(null));
  setPairs(false);
  assert.equal(app.getStatusPill('Not Ordered','loose',false,true),'<span class="pill pill-loose">Ad Hoc</span> <span class="pill pill-notordered">Not Ordered</span>','off: exactly as b5.13');
  setPairs(true);
  const on=app.getStatusPill('Not Ordered','loose',false,true);
  assert.equal(on,'<span class="pill pill-loose">Ad hoc — DBCC will place it</span> <span class="pill pill-notordered">Not Ordered</span>');
  assert.equal((on.match(/pill-loose/g)||[]).length,1,'one pill, not two');
  assert.match(app.getStatusPill('Delivered','loose',false,false),/>Ad Hoc</,'a placed Ad hoc entry keeps the old words');
  assert.ok(!/pill-loose/.test(app.getStatusPill('Ordered','scheduled',false,false)));
  setPairs(false);
});

// A stand-in for the Supabase client: records every call and answers from `answer(q)`.
function fakeSb(answer){
  const calls=[];
  const from=table=>{
    const q={table,op:'select',payload:null,filters:[],returning:false,range:null,cols:null};
    const b={
      select(c){if(q.op!=='select')q.returning=true;else q.cols=c;return b},
      update(p){q.op='update';q.payload=p;return b},insert(p){q.op='insert';q.payload=p;return b},delete(){q.op='delete';return b},
      eq(c,v){q.filters.push(['eq',c,v]);return b},is(c,v){q.filters.push(['is',c,v]);return b},in(c,v){q.filters.push(['in',c,v]);return b},
      neq(){return b},order(){return b},limit(){return b},range(a,z){q.range=[a,z];return b},maybeSingle(){q.single=true;return b},single(){q.single=true;return b},
      then(res,rej){calls.push(q);return Promise.resolve(answer(q)||{data:null,error:null}).then(res,rej)}};
    return b};
  return{from,calls,channel:()=>({on(){return this},subscribe(){return this}})};
}
const useSb=sb=>{app.__sb=sb;run('sb=__sb')};

test('loadPairs: pairs_live missing / off → nothing else is read and every screen stays as b5.13', async()=>{
  for(const row of [null,{value:'off'},{value:'yes'}]){
    setPairs(true);
    const sb=fakeSb(q=>q.table==='app_settings'?{data:row,error:null}:{data:PAIRS,error:null});useSb(sb);
    await app.loadPairs();
    assert.deepEqual(sb.calls.map(c=>c.table),['app_settings'],'project_pairs is not read');
    assert.deepEqual(sb.calls[0].filters.map(f=>[...f]),[['eq','key','pairs_live']]);
    assert.equal(run('pairsLive'),false);assert.equal(run('projectPairs.length'),0);
  }
});

test('loadPairs: on → every pair is read, page by page (the database stops at 1,000 rows without saying so)', async()=>{
  setPairs(false);
  const many=Array.from({length:1203},(_,i)=>({id:i+1,project_id:String(6),level:'L'+i,area:'A',sort_order:String(i),status:'active',source:'master_ops'}));
  const sb=fakeSb(q=>q.table==='app_settings'?{data:{value:'on'},error:null}:{data:many.slice(q.range[0],q.range[1]+1),error:null});useSb(sb);
  await app.loadPairs();
  assert.deepEqual(sb.calls.map(c=>c.table+(c.range?':'+c.range.join('-'):'')),['app_settings','project_pairs:0-999','project_pairs:1000-1999']);
  assert.equal(run('pairsLive'),true);assert.equal(run('projectPairs.length'),1203);
  assert.deepEqual(plain(run('projectPairs[5]')),{id:6,project_id:6,level:'L5',area:'A',sort_order:5,status:'active',source:'master_ops'},'ids and order as numbers');
});

test('loadPairs: on, but the pairs can\'t be read → the error goes up and the pairs on screen stay; an unreadable switch keeps its mode', async()=>{
  setPairs(true);
  let sb=fakeSb(q=>q.table==='app_settings'?{data:{value:'on'},error:null}:{data:null,error:{message:'permission denied for table project_pairs'}});useSb(sb);
  await assert.rejects(app.loadPairs(),e=>/permission denied/.test(e.message));
  assert.equal(run('pairsLive'),true);assert.equal(run('projectPairs.length'),PAIRS.length,'the last good pairs stay');
  for(const was of [true,false]){
    setPairs(was);
    sb=fakeSb(q=>q.table==='app_settings'?{data:null,error:{message:'TypeError: Failed to fetch'}}:{data:PAIRS,error:null});useSb(sb);
    await app.loadPairs();
    assert.equal(run('pairsLive'),was,'a failed read of the switch never flips it');
  }
  setPairs(false);
});

test('loadProjects keeps each job\'s Master-OPS link and reads the pairs with the projects', async()=>{
  setPairs(false);
  const sb=fakeSb(q=>q.table==='projects'?{data:[{id:6,name:'Barwon Reservoir',supplier:'Aus Reo',levels:'GRD||L1',areas:'SLAB',hub_project_id:'u-6',hub_short_code:'BAR',hub_name:'Barwon'},{id:7,name:'1033 Nepean Hwy',supplier:null,levels:'',areas:'',hub_project_id:null}],error:null}
    :q.table==='app_settings'?{data:{value:'on'},error:null}:{data:PAIRS,error:null});useSb(sb);
  await app.loadProjects();
  assert.deepEqual(plain(run('projects')).map(p=>[p.name,p.hubProjectId,p.hubShortCode,p.supplier,p.levels]),[['Barwon Reservoir','u-6','BAR','Aus Reo',['GRD','L1']],['1033 Nepean Hwy',null,null,'Aus Reo',[]]]);
  assert.deepEqual(sb.calls.map(c=>c.table),['projects','app_settings','project_pairs']);
  assert.equal(run('pairsLive'),true);
  setPairs(false);
});

// Fake page elements: getElementById answers from this map (a select's options are only its innerHTML here).
function fakePage(values){
  const els={};
  for(const[id,v]of Object.entries(values))els[id]={id,value:v,innerHTML:'',textContent:'',disabled:false,style:{},onchange:null,
    classList:{add(){},remove(){},toggle(){},contains:()=>false},focus(){},contains:()=>false};
  app.document.getElementById=id=>els[id]||null;
  return els;
}
const opts=html=>[...html.matchAll(/<option value="([^"]*)"( selected)?>([^<]*)<\/option>/g)].map(m=>m[3]+(m[2]?' *':''));

test('New Entry (pairs live): pick the level, the area list holds only that level\'s pairs; picks stay while they\'re there', ()=>{
  setPairs(true);
  run("currentEntryType='scheduled';authRole='dbcc';");
  const els=fakePage({selProj:'Barwon Reservoir',selLevel:'',selArea:'',laHint:''});
  app.entryPairFill('','');
  assert.deepEqual(opts(els.selLevel.innerHTML),['Select level...','GRD','L1','GRD-L1','B1']);
  assert.equal(els.selLevel.disabled,false);
  assert.deepEqual(opts(els.selArea.innerHTML),['Pick a level first']);assert.equal(els.selArea.disabled,true);
  els.selLevel.value='L1';app.entryAreaFill('');
  assert.deepEqual(opts(els.selArea.innerHTML),['Select area...','SLAB'],'L1 / WALLS is retired — not offered');
  // the lists change under the form (a pair added): the picks stay
  els.selArea.value='SLAB';
  app.entryPairFill('L1','SLAB');assert.equal(els.selLevel.value,'L1');assert.equal(els.selArea.value,'SLAB');
  // a pick that is no longer there goes back to blank
  app.entryPairFill('L1','WALLS');assert.equal(els.selArea.value,'');
  app.entryPairFill('L9','SLAB');assert.equal(els.selLevel.value,'');assert.equal(els.selArea.disabled,true);
  // a job with no pairs: nothing to pick, and the line says why
  els.selProj.value='New Job';app.entryPairFill('','');
  assert.deepEqual(opts(els.selLevel.innerHTML),['No levels from Master-OPS yet']);assert.equal(els.selLevel.disabled,true);
  assert.match(els.laHint.innerHTML,/Not linked to Master-OPS yet — nothing can be ordered\./);
  setPairs(false);
});

test('New Entry (pairs live): the supplier\'s way out, the Ad hoc rule — and nothing at all while off', ()=>{
  setPairs(true);
  const els=fakePage({selProj:'Barwon Reservoir',selLevel:'',selArea:'',laHint:''});
  run("currentEntryType='scheduled';authRole='supplier';");app.refreshLaHint();
  assert.match(els.laHint.innerHTML,/<button type="button" class="link-btn" onclick="sendAsAdHoc\(\)">Can't find the level \/ area\? Send it as Ad hoc — DBCC will place it<\/button>/);
  run("authRole='dbcc';");app.refreshLaHint();
  assert.equal(els.laHint.innerHTML,'','DBCC adds a level / area in Master-OPS — no ad hoc nudge');
  run("currentEntryType='loose';");app.refreshLaHint();
  assert.match(els.laHint.innerHTML,/Pick both, or leave both blank — DBCC will place it\./);
  setPairs(false);app.refreshLaHint();
  assert.equal(els.laHint.innerHTML,'','off: no line at all');
  run("currentEntryType='scheduled';authRole=null;");
});

test('New Entry (pairs live): Submit says the guard\'s words first and sends nothing', async()=>{
  setPairs(true);
  for(const [type,level,area,words] of [
    ['loose','GRD','',/Pick both a level and an area, or leave both blank\./],
    ['scheduled','L1','WALLS',/L1 \/ WALLS isn&#39;t a level\/area on this job — refresh, or send it as Ad hoc\./],
  ]){
    const els=fakePage({selProj:'Barwon Reservoir',selLevel:level,selArea:area,inpComm:'',formErr:'',formInfo:'',submitBtn:'',inpLooseDesc:'chairs',inpLooseDate:'2026-11-04'});
    app.__t=type;run('currentEntryType=__t;selectedOrderId=null;');
    const sb=fakeSb(()=>({data:null,error:null}));useSb(sb);
    await app.submitEntry();
    assert.match(els.formErr.innerHTML,words);
    assert.equal(sb.calls.length,0,'nothing uploaded, nothing written');
  }
  run("currentEntryType='scheduled';");setPairs(false);
});

// ── Edit with pairs live ──
function snap(row){app.__snap={id:row.id,row,form:null};run('editSnap=JSON.parse(JSON.stringify(__snap))')}
test('Edit (pairs live): the entry\'s own retired pair stays picked and marked; another level offers only its active areas', ()=>{
  setPairs(true);
  snap({id:9,project:'Barwon Reservoir',level:'L1',area:'WALLS',entry_type:'scheduled'});
  let h=app.editLevelAreaHtml('Barwon Reservoir',true);
  assert.deepEqual(opts(h.level),['Pick a level…','GRD','L1 *','GRD-L1','B1']);
  assert.deepEqual(opts(h.area),['Pick an area…','WALLS — no longer on this job in Master-OPS *','SLAB']);
  // the person picks another level: only its active pairs; nothing is picked for them
  const els=fakePage({ed_proj:'Barwon Reservoir',ed_level:'GRD',ed_area:'WALLS'});
  h=app.editLevelAreaHtml('Barwon Reservoir',false);
  assert.deepEqual(opts(h.area),['Pick an area… *','SLAB','COLUMNS']);
  // back on the entry's own level: its own area comes back
  els.ed_level.value='L1';h=app.editLevelAreaHtml('Barwon Reservoir',false);
  assert.deepEqual(opts(h.area),['Pick an area…','WALLS — no longer on this job in Master-OPS *','SLAB']);
  // an Ad hoc entry not placed yet: None is its value
  snap({id:10,project:'Barwon Reservoir',level:null,area:null,entry_type:'loose'});
  h=app.editLevelAreaHtml('Barwon Reservoir',true);
  assert.deepEqual(opts(h.level),['None *','GRD','L1','GRD-L1','B1']);assert.deepEqual(opts(h.area),['None *']);
  // moved to a job without the level → nothing picked (Save then says so in the guard's words)
  snap({id:11,project:'Barwon Reservoir',level:'GRD',area:'SLAB',entry_type:'scheduled'});
  fakePage({ed_proj:'1033 Nepean Hwy',ed_level:'GRD',ed_area:'SLAB'});
  h=app.editLevelAreaHtml('1033 Nepean Hwy',false);
  assert.deepEqual(opts(h.level),['Pick a level… *','Driveway']);assert.deepEqual(opts(h.area),['Pick a level first *']);
  setPairs(false);
});

test('Edit (pairs live): Save\'s pre-check — unchanged passes even on a retired pair, a change must be a pair', ()=>{
  setPairs(true);
  const row={project:'Barwon Reservoir',level:'L1',area:'WALLS',entry_type:'scheduled'};
  const P=f=>app.editPairProblem(row,{...row,...f});
  assert.equal(P({}),null,'dates / status edits on a retired pair still save');
  assert.equal(P({area:'SLAB'}),null);
  assert.equal(P({level:'GRD'}),"GRD / WALLS isn't a level/area on this job — refresh, or send it as Ad hoc.");
  assert.equal(P({level:'',area:''}),"A placed entry can't be un-placed — move it to another level/area.");
  assert.equal(P({area:''}),'Pick both a level and an area, or leave both blank.');
  assert.equal(P({project:'1033 Nepean Hwy'}),"L1 / WALLS isn't a level/area on this job — refresh, or send it as Ad hoc.",'a move to another job is checked on that job');
  assert.equal(P({project:'1033 Nepean Hwy',level:'Driveway',area:'Excavation'}),null);
  assert.equal(app.editPairProblem({project:'Barwon Reservoir',level:null,area:null,entry_type:'loose'},{project:'Barwon Reservoir',level:'',area:''}),null,'null and "" are the same blank');
  setPairs(false);
});

test('Edit (pairs off): exactly b5.13 — the level / area lists are the job\'s free lists', ()=>{
  setPairs(false);
  snap({id:9,project:'Barwon Reservoir',level:'L1',area:'WALLS',entry_type:'scheduled'});
  const h=app.editLevelAreaHtml('Barwon Reservoir',true);
  assert.deepEqual(opts(h.level),['None','GRD','L1 *','GRD-L1','B1']);
  assert.deepEqual(opts(h.area),['None','SLAB','COLUMNS','WALLS *','PILES']);
});

test('a projects / pairs change: off does what b5.13 did; on keeps the form in step; a switch redraws the screens', ()=>{
  const a2=loadApp(),r2=src=>vm.runInContext(src,a2);   // its own copy: this test replaces functions
  r2(`__calls=[];populateDropdowns=()=>__calls.push('populate');renderProjList=()=>__calls.push('projList');refreshEntryForm=()=>__calls.push('form');
      redrawForPairsMode=()=>__calls.push('redraw');adminUnlocked=true;`);
  const calls=()=>plain(r2('__calls.splice(0)'));
  r2('pairsLive=false;pairsModeShown=null');a2.onProjectsChanged();assert.deepEqual(calls(),['populate','projList'],'the first call only notes the mode');
  a2.onProjectsChanged();assert.deepEqual(calls(),['populate','projList'],'off: exactly what the b5.13 realtime handler did');
  r2('pairsLive=true');a2.onProjectsChanged();assert.deepEqual(calls(),['populate','projList','redraw'],'off → on redraws');
  a2.onProjectsChanged();assert.deepEqual(calls(),['populate','projList','form']);
  r2('pairsLive=false');a2.onProjectsChanged();assert.deepEqual(calls(),['populate','projList','redraw'],'on → off redraws back');
});

// ── The delivery grid (pairs live) ──
const E=(id,level,area,o={})=>({id,project:'Barwon Reservoir',level,area,status:'Ordered',entry_type:'scheduled',schedule:null,...o});
const BARWON_ENTRIES=[
  E(1,'GRD','SLAB'),E(2,'GRD','SLAB',{status:'Cancelled'}),            // an active pair with 2 entries (cancelled counts, as before)
  E(3,'L1','WALLS'),                                                    // a retired pair that still has an entry → amber
  E(4,'ROOF','PLANT',{status:'Delivered'}),                             // never a pair → amber (orphan), its names go last
  E(5,null,'',{entry_type:'loose',schedule:'2LGU'}),                    // Ad hoc, not placed → listed under the grid
  E(6,'GRD','',{entry_type:'loose'}),                                    // half-placed → listed too, never dropped
];
test('gridModel: rows / columns by the order rule; active, retired, orphan, none; nothing dropped', ()=>{
  const m=app.gridModel(PROJECTS[0],app.pairsOf(6,PAIRS),BARWON_ENTRIES);
  assert.deepEqual(plain(m.levels),['GRD','L1','GRD-L1','B1','ROOF'],'retired L1/WALLS shows because it has an entry; ROOF (orphan) last');
  assert.deepEqual(plain(m.areas),['SLAB','COLUMNS','WALLS','PILES','PLANT']);
  const st=(l,a)=>{const c=m.cell(l,a);return c.state+':'+c.count};
  assert.equal(st('GRD','SLAB'),'active:2');assert.equal(st('GRD','COLUMNS'),'active:0');assert.equal(st('B1','PILES'),'active:0');
  assert.equal(st('L1','WALLS'),'retired:1');assert.equal(st('ROOF','PLANT'),'orphan:1');
  assert.equal(st('GRD','WALLS'),'none:0');assert.equal(st('GRD','PLANT'),'none:0');
  assert.deepEqual(plain(m.unplaced).map(e=>e.id),[5,6]);
  assert.equal(m.linked,true);assert.equal(m.hasPairs,true);assert.equal(m.activeCount,5);
  // a retired pair with no entries isn't shown at all
  const m2=app.gridModel(PROJECTS[0],app.pairsOf(6,PAIRS),[]);
  assert.deepEqual(plain(m2.areas),['SLAB','COLUMNS','PILES']);assert.equal(m2.cell('L1','WALLS').state,'none');
  // not linked, no pairs
  const m3=app.gridModel(PROJECTS[2],[],[]);
  assert.equal(m3.linked,false);assert.equal(m3.hasPairs,false);assert.equal(m3.activeCount,0);assert.equal(app.pairGridHtml(m3,new Set()),'');
});

test('pairGridHtml: one div per cell with its state, count and words; names only as escaped data attributes', ()=>{
  const HOSTILE='GRD" onmouseover="alert(1)';
  const pairs=[{id:1,project_id:9,level:HOSTILE,area:"L1 '); alert(1); ('",sort_order:0,status:'active'},{id:2,project_id:9,level:'L1',area:'<b>X</b>',sort_order:1,status:'active'}];
  const m=app.gridModel({id:9,hubProjectId:'u'},pairs,[{id:1,level:'L1',area:'<b>X</b>',status:'Ordered'}]);
  const ticks=new Set([app.cellKey('L1','<b>X</b>')]);
  const h=app.pairGridHtml(m,ticks);
  assert.ok(!/onmouseover="alert|<b>X<\/b>|alert\(1\); \('/.test(h),'no name reaches the page raw');
  // every attribute of every tag, read the way a browser would (quoted values are whole: a name can't close one)
  const attrNames=[...h.matchAll(/<[a-z]+((?:\s+[a-z-]+="[^"]*")*)\s*>/g)].flatMap(t=>[...t[1].matchAll(/\s([a-z-]+)="/g)].map(x=>x[1]));
  assert.equal(attrNames.length,[...h.matchAll(/="/g)].length,'every attribute was read');
  assert.deepEqual(attrNames.filter(n=>/^on/.test(n)),[],'no inline handlers in the grid — one listener on the grid reads the data attributes');
  assert.match(h,/data-level="GRD&quot; onmouseover=&quot;alert\(1\)" data-area="L1 &#39;\); alert\(1\); \(&#39;" data-state="active"/);
  assert.match(h,/<div class="grid-cell pair has-entry ticked" data-level="L1" data-area="&lt;b&gt;X&lt;\/b&gt;" data-state="active" title="L1 \/ &lt;b&gt;X&lt;\/b&gt; — 1 entry\. Click to open its card\." role="button" tabindex="0">1<\/div>/);
  assert.match(h,/class="grid-cell not-pair"[^>]*title="L1 \/ L1 &#39;\); alert\(1\); \(&#39; isn&#39;t on this job in Master-OPS — add it there in Project Setup\."/);
  const b=app.pairGridHtml(app.gridModel(PROJECTS[0],app.pairsOf(6,PAIRS),BARWON_ENTRIES),new Set());
  assert.match(b,/class="grid-cell pair" data-level="GRD" data-area="COLUMNS" data-state="active" title="GRD \/ COLUMNS — on this job\. Click to order\."[^>]*><\/div>/);
  assert.match(b,/class="grid-cell retired" data-level="L1" data-area="WALLS" data-state="retired" title="L1 \/ WALLS — no longer on this job in Master-OPS — move these \(1 entry\)\. Nothing new can be ordered here\."[^>]*>1<\/div>/);
  assert.match(b,/class="grid-cell retired" data-level="ROOF" data-area="PLANT" data-state="orphan"[^>]*>1<\/div>/);
  assert.match(b,/<th class="corner-th">/,'the sticky corner, header row and level column classes');
  assert.equal((b.match(/class="level-td"/g)||[]).length,5);
});

// A page for the delivery program tab (a fresh app copy: this replaces openCellCard).
function programApp(){
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  a.__p={pairs:PAIRS,projects:PROJECTS,entries:BARWON_ENTRIES};
  r(`pairsLive=true;projectPairs=JSON.parse(JSON.stringify(__p.pairs));projects=JSON.parse(JSON.stringify(__p.projects));entries=JSON.parse(JSON.stringify(__p.entries));
     __opened=[];openCellCard=c=>__opened.push(c);`);
  const els={};
  for(const id of ['adminProgram','dpProj','dpContent','dpNotice','dpBanner','dpGridWrap','dpPickBar','dpUnplaced','dpMultiBtn'])
    els[id]={id,value:'',innerHTML:'',textContent:'',style:{},classList:{toggle(){},add(){},remove(){}}};
  els.dpProj.value='Barwon Reservoir';
  a.document.getElementById=id=>els[id]||null;
  return{a,r,els};
}
test('a grid press: grey → the banner in words; green / amber → its card; selecting several ticks; Select all green', ()=>{
  const{a,r,els}=programApp();
  a.renderPairGrid();
  assert.match(els.dpGridWrap.innerHTML,/grid-table pair-grid/);assert.equal(els.dpNotice.innerHTML,'');
  assert.match(els.dpUnplaced.innerHTML,/2 entries on this job have no level \/ area yet — Ad hoc items are placed by DBCC in Master-OPS/);
  a.dpCellPress('GRD','WALLS');
  assert.match(els.dpBanner.innerHTML,/<b>GRD \/ WALLS<\/b> isn't on this job in Master-OPS — add it there in Project Setup\./);
  assert.equal(r('__opened.length'),0,'a grey cell opens nothing');
  a.dpCellPress('GRD','SLAB');
  assert.equal(els.dpBanner.innerHTML,'','the banner goes once a real cell is pressed');
  assert.deepEqual(plain(r('__opened')),[[{level:'GRD',area:'SLAB'}]]);
  a.dpCellPress('L1','WALLS');assert.deepEqual(plain(r('__opened[1]')),[{level:'L1',area:'WALLS'}],'amber opens its card too (to move or cancel what is there)');
  // select several
  a.dpToggleMulti();a.dpCellPress('GRD','COLUMNS');a.dpCellPress('B1','PILES');a.dpCellPress('B1','PILES');a.dpCellPress('GRD','WALLS');
  assert.deepEqual(plain([...r('dpPick.ticks')]),[a.cellKey('GRD','COLUMNS')],'ticked, unticked; grey never ticks');
  assert.match(els.dpPickBar.innerHTML,/<b>1<\/b> cell ticked/);
  assert.equal(r('__opened.length'),2,'ticking opens nothing');
  a.dpSelectAllGreen();
  assert.deepEqual(plain([...r('dpPick.ticks')]).map(k=>JSON.parse(k).join(' / ')).sort(),['B1 / PILES','GRD / COLUMNS','GRD / SLAB','GRD-L1 / COLUMNS','L1 / SLAB'],'every active pair — never the amber or grey ones');
  a.dpOpenTicked();assert.equal(r('__opened[2].length'),5);
  a.dpClearTicks();assert.equal(r('dpPick.ticks.size'),0);
  a.dpToggleMulti();assert.equal(r('dpPick.multi'),false);
});

test('the grid says when nothing can be ordered: not linked, or linked with no pairs yet', ()=>{
  const{a,r,els}=programApp();
  els.dpProj.value='New Job';a.renderPairGrid();
  assert.match(els.dpNotice.innerHTML,/Not linked to Master-OPS yet — nothing can be ordered\./);assert.equal(els.dpGridWrap.innerHTML,'');
  r("projects.push({id:12,name:'Linked No Pairs',supplier:'ARC',levels:[],areas:[],hubProjectId:'u-12'})");
  els.dpProj.value='Linked No Pairs';a.renderPairGrid();
  assert.match(els.dpNotice.innerHTML,/No levels or areas from Master-OPS on this job yet — nothing can be ordered\./);
  els.dpProj.value='1033 Nepean Hwy';a.renderPairGrid();
  assert.equal(els.dpNotice.innerHTML,'','an REO-only pair can be ordered');assert.match(els.dpGridWrap.innerHTML,/data-level="Driveway" data-area="Excavation"/);
});

test('a ticked cell whose pair Master-OPS removed drops out of the selection on the next refresh', ()=>{
  const{a,r}=programApp();
  a.dpSelectAllGreen();assert.ok(r('dpPick.ticks.has(cellKey("GRD","COLUMNS"))'));
  r("projectPairs.find(p=>p.level==='GRD'&&p.area==='COLUMNS').status='retired'");
  a.refreshProgramViews();
  assert.ok(!r('dpPick.ticks.has(cellKey("GRD","COLUMNS"))'));assert.ok(r('dpPick.ticks.has(cellKey("GRD","SLAB"))'));
});

// ── The cell card ──
const FILE_URL='https://oekgtocjtloptrjacmcu.supabase.co/storage/v1/object/public/project-files/Barwon/1_mp.pdf';
const CARD_ENTRIES=[
  E(21,'GRD','SLAB',{schedule:'U9AV',split_reference:'Part 1',our_delivery_date:'2026-11-05',status:'Scheduled',supplier_delivery_date:'2026-11-05'}),
  E(22,'GRD','SLAB',{schedule:null,split_reference:'Part 2',our_delivery_date:null,status:'Not Ordered'}),
  E(23,'L1','WALLS',{schedule:'UT2X',status:'Ordered',our_delivery_date:'2026-11-10'}),
];
// A fresh app copy with a page whose elements are made as they are asked for; emailModal and loadEntries recorded.
function cardApp({role='dbcc',answer}={}){
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  a.__p={pairs:PAIRS,projects:PROJECTS,entries:CARD_ENTRIES,role};
  r(`pairsLive=true;authRole=__p.role;userName='Chris';adminUnlocked=true;
     projectPairs=JSON.parse(JSON.stringify(__p.pairs));projects=JSON.parse(JSON.stringify(__p.projects));entries=JSON.parse(JSON.stringify(__p.entries));
     projectFiles=[{id:31,project_name:'Barwon Reservoir',scope:'level_area',level:'GRD',area:'SLAB',label:'GRD slab marking plan',file_url:${JSON.stringify(FILE_URL)},superseded:false,category:'marking_plan'},
                   {id:32,project_name:'Barwon Reservoir',scope:'project',level:null,area:null,label:'Sequence "A"',file_url:'javascript:alert(1)',superseded:false,category:'other'}];
     emailContacts=[{id:1,label:'Aus Reo scheduler',email:'sched@ausreo.example',supplier:'Aus Reo'}];projectSchedulers=[{project_name:'Barwon Reservoir',contact_id:1}];
     __mail=[];emailModal=(subject,body,id,ctx,pn,opts)=>__mail.push({subject,body,id,ctx,pn,opts});
     __loads=0;loadEntries=async()=>{__loads++};renderDash=()=>{};confirmDialog=(t,m,ok,c,fn)=>{__confirm={t,m,fn}};`);
  const els={};
  a.document.getElementById=id=>els[id]||(els[id]={id,value:'',innerHTML:'',textContent:'',disabled:false,style:{},scrollTop:0,
    classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(){},contains(c){return this._s.has(c)}},contains:()=>false,addEventListener(){},removeEventListener(){}});
  els.dpProj=a.document.getElementById('dpProj');els.dpProj.value='Barwon Reservoir';
  const sb=fakeSb(answer||(()=>({data:null,error:null})));a.__sb=sb;r('sb=__sb');
  return{a,r,els,sb};
}
test('the card opens for DBCC only, keeps its own job, and lays its cells out in grid order', ()=>{
  for(const role of ['supplier','crew',null]){const{a,r}=cardApp({role});a.openCellCard([{level:'GRD',area:'SLAB'}]);assert.equal(r('cellCard'),null,`never for ${role}`)}
  const{a,r,els}=cardApp();
  a.openCellCard([{level:'L1',area:'WALLS'},{level:'GRD',area:'WALLS'},{level:'GRD',area:'COLUMNS'},{level:'GRD',area:'SLAB'},{level:'GRD',area:'SLAB'}]);
  const cc=plain(r('({project:cellCard.project,supplier:cellCard.supplier,cells:cellCard.cells,orders:cellCard.orders})'));
  assert.equal(cc.project,'Barwon Reservoir');assert.equal(cc.supplier,'Aus Reo');
  assert.deepEqual(cc.cells.map(c=>c.level+' / '+c.area),['GRD / SLAB','GRD / COLUMNS','L1 / WALLS'],'grid order; the grey cell and the repeat dropped');
  assert.deepEqual(Object.keys(cc.orders).map(k=>JSON.parse(k).join(' / ')),['GRD / COLUMNS'],'an empty green cell gets one placeholder ready; a cell with orders and an amber cell none');
  assert.ok(els.cellCardOv.classList.contains('show'));
  // the page's project select changing (a realtime refresh resetting it) doesn't move the card
  els.dpProj.value='';assert.equal(r('cellCard.project'),'Barwon Reservoir');
});

test('the card shows each entry with its split, status, dates, files, comments and actions — names escaped, never in handlers', ()=>{
  const{a,r,els}=cardApp();
  r(`entries.push({id:24,project:'Barwon Reservoir',level:'GRD',area:'SLAB',schedule:'<img src=x onerror=alert(1)>',split_reference:'Top "reo"',status:'Ordered',entry_type:'scheduled',our_delivery_date:'2026-11-12',
     dbcc_comment:JSON.stringify([{text:'pour moved',authors:['Chris']}])})`);
  a.openCellCard([{level:'GRD',area:'SLAB'},{level:'L1',area:'WALLS'}]);
  const h=els.cellCardModal.innerHTML;
  assert.ok(!/<img src=x/.test(h),'a schedule name never reaches the page raw');
  assert.match(h,/<span class="cc-split">\(Top &quot;reo&quot;\)<\/span>/,'the split reference, orange');
  assert.match(h,/<span class="cc-split">\(Part 1\)<\/span>/);
  assert.match(h,/id="ccDate_21" value="2026-11-05" oninput="ccDateDraft\(21,this\.value\)"><button class="action-btn cc-save" id="ccDateBtn_21" onclick="ccSaveDate\(21\)" disabled>Save date<\/button>/);
  assert.match(h,/onclick="cancelEntry\(22,true\)"/,'cancel goes through the dashboard\'s dialog, with a reason');
  assert.match(h,/onclick="uploadScheduleFile\(22\)"/,'attach a schedule where there is none');
  assert.match(h,/onclick="uploadMarkup\(21\)"/);assert.match(h,/onclick="editChunkComment\(24,'dbcc'\)"/);
  assert.match(h,/DBCC: pour moved/);
  assert.match(h,/L1 \/ WALLS is no longer on this job in Master-OPS — move these entries to a level \/ area that is \(Move…\)\. Nothing new can be ordered here\./);
  assert.match(h,/onclick="openEditEntry\(23\)"[^>]*>Move…/,'an entry on an amber cell can be moved');
  assert.ok(!/openEditEntry\(21\)/.test(h),'a green cell\'s entries don\'t need moving');
  assert.match(h,/<a href="https:\/\/oekgtocjtloptrjacmcu[^"]*1_mp\.pdf" target="_blank" rel="noopener noreferrer">GRD slab marking plan<\/a>/,'the cell\'s own reference file, to tick for the email');
  assert.match(h,/One email to Aus Reo/);assert.match(h,/sched@ausreo\.example/);
  assert.match(h,/Hold, reinstate and date mismatches stay on the Dashboard\./);
  assert.match(h,/>Email the changes<\/button>/);assert.match(h,/id="ccSendBtn" onclick="ccCreateAndEmail\(\)" style="width:auto;margin:0" disabled>/,'nothing to send yet');
});

test('ccPlanRows: the b5.13 split-label rule, one date for all or one each; a cell that left the job is refused', ()=>{
  const cellOf=k=>{const[l,a]=JSON.parse(k);return{level:l,area:a,state:l==='L1'?'retired':'active'}};
  const K=(l,a)=>app.cellKey(l,a);
  const orders={[K('GRD','SLAB')]:[{label:'',date:'2026-11-20'}],[K('GRD','COLUMNS')]:[{label:' Top ',date:''},{label:'',date:'2026-11-21'}],[K('L1','WALLS')]:[{label:'x',date:''}]};
  const keys=[K('GRD','SLAB'),K('GRD','COLUMNS'),K('L1','WALLS'),K('B1','PILES')];
  let p=app.ccPlanRows(keys,orders,cellOf,'all','2026-11-18');
  assert.deepEqual(plain(p.groups).map(g=>g.rows.map(r=>[r.level,r.area,r.split_reference,r.our_delivery_date,r.status])),[
    [['GRD','SLAB',null,'2026-11-18','Ordered']],
    [['GRD','COLUMNS','Top','2026-11-18','Ordered'],['GRD','COLUMNS','Part 2','2026-11-18','Ordered']]]);
  assert.deepEqual(plain(p.groups[0].rows[0]),{level:'GRD',area:'SLAB',schedule:null,status:'Ordered',entry_type:'scheduled',our_delivery_date:'2026-11-18',split_reference:null});
  assert.deepEqual(plain(p.refused),[{key:K('L1','WALLS'),level:'L1',area:'WALLS',n:1,words:'L1 / WALLS is no longer on this job in Master-OPS — nothing was created there.'}]);
  p=app.ccPlanRows(keys,orders,cellOf,'each','2026-11-18');
  assert.deepEqual(plain(p.groups).flatMap(g=>g.rows.map(r=>[r.our_delivery_date,r.status])),[['2026-11-20','Ordered'],[null,'Not Ordered'],['2026-11-21','Ordered']]);
  p=app.ccPlanRows(keys,orders,cellOf,'all','');
  assert.deepEqual(plain(p.groups).flatMap(g=>g.rows.map(r=>r.status)),['Not Ordered','Not Ordered','Not Ordered'],'no date → Not Ordered, as before');
});

test('the card\'s log: what goes in the one email', ()=>{
  const log={created:[],dates:[],cancels:[]};
  const e=(id,o={})=>({id,level:'GRD',area:'SLAB',split_reference:null,schedule:null,...o});
  app.ccLogDate(log,e(1,{schedule:'U9AV',split_reference:'Part 1'}),'2026-11-05','2026-11-12');
  app.ccLogDate(log,e(1,{schedule:'U9AV',split_reference:'Part 1'}),'2026-11-12','2026-11-14');
  assert.deepEqual(plain(log.dates).map(r=>[r.old,r.new]),[['2026-11-05','2026-11-14']],'changed twice: first old, last new');
  app.ccLogDate(log,e(1),'2026-11-14','2026-11-05');assert.equal(log.dates.length,0,'changed back: nothing to tell');
  log.created.push({id:9,level:'GRD',area:'COLUMNS',split:null,date:null});
  app.ccLogDate(log,e(9,{area:'COLUMNS'}),'','2026-11-20');
  assert.deepEqual(plain(log.created),[{id:9,level:'GRD',area:'COLUMNS',split:null,date:'2026-11-20'}],'a placeholder made here just gets its date — a new order, not a change');
  assert.equal(log.dates.length,0);
  app.ccLogDate(log,e(2,{schedule:'UT2X'}),'2026-11-10','');
  app.ccLogCancel(log,e(2,{schedule:'UT2X'}),'pour cancelled');
  assert.deepEqual(plain(log.dates),[],'a cancellation replaces the date change');
  assert.deepEqual(plain(log.cancels).map(r=>[r.id,r.reason]),[[2,'pour cancelled']]);
  app.ccLogCancel(log,e(9,{area:'COLUMNS'}),'not needed');
  assert.deepEqual(plain(log.created),[],'made here and cancelled before the email: the supplier never hears of it');
  assert.equal(log.cancels.length,1);
});

test('cellCardEmail: one email from everything saved — new orders, date changes, cancellations, ticked files', ()=>{
  const log={created:[{id:9,level:'GRD',area:'COLUMNS',split:'Part 1',date:'2026-11-20'},{id:10,level:'GRD',area:'COLUMNS',split:'Part 2',date:null}],
    dates:[{id:1,level:'GRD',area:'SLAB',split:'Part 1',schedule:'U9AV',old:'2026-11-05',new:'2026-11-12'},{id:3,level:'B1',area:'PILES',split:null,schedule:null,old:'',new:'2026-11-30'}],
    cancels:[{id:2,level:'L1',area:'WALLS',split:null,schedule:'UT2X',reason:'wall redesigned — see "RFI 12"'}]};
  const m=app.cellCardEmail({project:'Barwon Reservoir',supplier:'Aus Reo',log,sender:'Chris',
    files:[{label:'GRD slab marking plan',url:FILE_URL},{label:'Sequence',url:'javascript:alert(1)'}]});
  assert.equal(m.subject,'REO orders — Barwon Reservoir (1 new, 2 date changes, 1 cancelled)');
  assert.equal(m.body,
`Hi Aus Reo,

The following changes have been made to our REO orders for Barwon Reservoir:

NEW ORDERS — DBCC requested delivery date
• GRD / COLUMNS (Part 1) — 20/11/2026

DBCC REQUESTED DELIVERY DATE CHANGED
• GRD / SLAB (Part 1) · U9AV — 05/11/2026 → 12/11/2026
• B1 / PILES — not set → 30/11/2026

CANCELLED
• L1 / WALLS · UT2X — reason: wall redesigned — see "RFI 12"

─── Reference documents ───
• GRD slab marking plan: ${FILE_URL}

Please confirm receipt and your production delivery dates.

If these changes are not acceptable, please contact a DBCC representative immediately to resolve the matter.

Regards,
Chris
Debono Bros Concreting`);
  assert.ok(!/javascript:/.test(m.body),'a link that isn\'t on the REO file store is left out');
  const c=app.cellCardEmail({project:'P',supplier:'ARC',log:{created:[],dates:[],cancels:[{id:1,level:'A',area:'B',reason:'r'}]},files:[],sender:'S'});
  assert.equal(c.subject,'REO orders — P (1 cancelled)');assert.match(c.body,/^Hi ARC,/);assert.match(c.body,/Please confirm receipt\./,'nothing dated: no dates asked for');
  assert.equal(app.cellCardEmail({project:'P',supplier:'ARC',log:{created:[{id:1,date:null}],dates:[],cancels:[]},files:[{label:'x',url:FILE_URL}],sender:'S'}),null,'nothing to tell the supplier: no email');
});

test('a date changed in the card: saved only while it is what the card showed; history after the write; it goes in the email', async()=>{
  const{a,r,els,sb}=cardApp({answer:q=>q.table==='entries'&&q.op==='update'?{data:[{id:22}],error:null}:{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  els.ccDate_22=a.document.getElementById('ccDate_22');els.ccDate_22.value='2026-11-19';
  await a.ccSaveDate(22);
  const[upd,...hist]=sb.calls;
  assert.equal(upd.op,'update');assert.deepEqual({...upd.payload},{our_delivery_date:'2026-11-19',status:'Ordered'},'Not Ordered → Ordered, today\'s rule');
  assert.deepEqual(upd.filters.map(f=>[...f]),[['eq','id',22],['is','our_delivery_date',null],['eq','status','Not Ordered']]);
  assert.ok(upd.returning);
  assert.deepEqual(hist.map(h=>[h.table,h.payload.field_changed,h.payload.old_value,h.payload.new_value,h.payload.user_identifier]),
    [['audit_log','our_delivery_date','','2026-11-19','Chris'],['audit_log','status','Not Ordered','Ordered','Chris']]);
  assert.deepEqual(plain(r('cellCard.log.dates')),[{id:22,level:'GRD',area:'SLAB',split:'Part 2',schedule:null,old:'',new:'2026-11-19'}]);
  assert.match(els.cellCardModal.innerHTML,/Saved — it goes in the email\./);
  assert.match(els.cellCardModal.innerHTML,/Date: GRD \/ SLAB \(Part 2\) — not set → 19\/11\/2026/);
  // the mismatch rule: a production date on file that now differs flags it again
  const t=cardApp({answer:q=>q.table==='entries'?{data:[{id:21}],error:null}:{data:null,error:null}});
  t.a.openCellCard([{level:'GRD',area:'SLAB'}]);t.a.document.getElementById('ccDate_21').value='2026-11-07';
  await t.a.ccSaveDate(21);
  assert.deepEqual({...t.sb.calls[0].payload},{our_delivery_date:'2026-11-07',mismatch_resolved:false});
});

test('a date that changed meanwhile, or a refusal: nothing written to history, said where it happened, listed as not saved', async()=>{
  for(const [answer,words] of [[{data:[],error:null},/the entry changed meanwhile/],[{data:null,error:{message:'Suppliers cannot change the ordered (DBCC) delivery date'}},/the database refused it: Suppliers cannot/]]){
    const{a,r,els,sb}=cardApp({answer:q=>q.table==='entries'?answer:{data:null,error:null}});
    a.openCellCard([{level:'GRD',area:'SLAB'}]);a.document.getElementById('ccDate_22').value='2026-11-19';
    await a.ccSaveDate(22);
    assert.deepEqual(sb.calls.map(c=>c.table+':'+c.op),['entries:update'],'no history line');
    assert.equal(r('cellCard.log.dates.length'),0,'not in the email');
    assert.match(r('cellCard.notes[22]'),words);
    assert.match(els.cellCardModal.innerHTML,/Not saved — left out of the email:/);
  }
});

test('Create + email: one insert per cell; a refused cell is left out and listed; ONE email from everything saved', async()=>{
  const{a,r,els,sb}=cardApp({answer:q=>{
    if(q.table!=='entries'||q.op!=='insert')return{data:null,error:null};
    if(q.payload[0].area==='COLUMNS'&&q.payload[0].level==='GRD-L1')return{data:null,error:{message:"GRD-L1 / COLUMNS isn't a level/area on this job — refresh, or send it as Ad hoc."}};
    return{data:q.payload.map((p,i)=>({id:100+i+(p.level==='B1'?10:0),...p})),error:null}}});
  a.openCellCard([{level:'GRD',area:'SLAB'},{level:'GRD-L1',area:'COLUMNS'},{level:'B1',area:'PILES'}]);
  // saved earlier in the card: a cancellation (through the dashboard's dialog)
  r(`ccAfterCancel(entries.find(e=>e.id===21),'redesign')`);
  r(`cellCard.allDate='2026-11-25';ccAddOrder(cellKey('GRD','SLAB'))`);   // one more on the cell that has orders
  await a.ccCreateAndEmail();
  const ins=sb.calls.filter(c=>c.op==='insert'&&c.table==='entries');
  assert.deepEqual(plain(ins.map(c=>c.payload.map(p=>[p.project,p.level,p.area,p.our_delivery_date,p.status,p.entry_type]))),[
    [['Barwon Reservoir','GRD','SLAB','2026-11-25','Ordered','scheduled']],
    [['Barwon Reservoir','GRD-L1','COLUMNS','2026-11-25','Ordered','scheduled']],
    [['Barwon Reservoir','B1','PILES','2026-11-25','Ordered','scheduled']]],'the card\'s own job on every row, one insert per cell');
  assert.ok(ins.every(c=>c.payload[0].order_batch_id===ins[0].payload[0].order_batch_id),'one batch');
  const audit=sb.calls.filter(c=>c.table==='audit_log');
  assert.deepEqual(audit.map(c=>[c.payload.action,c.payload.new_value]),[['BULK_CREATE','2 placeholders for Barwon Reservoir']],'history counts only what was made');
  const mail=plain(r('__mail'));assert.equal(mail.length,1,'ONE email');
  assert.equal(mail[0].pn,'Barwon Reservoir');assert.equal(mail[0].ctx,'cell_card');assert.deepEqual(mail[0].opts.files,[]);
  assert.equal(mail[0].subject,'REO orders — Barwon Reservoir (2 new, 1 cancelled)');
  assert.match(mail[0].body,/• GRD \/ SLAB — 25\/11\/2026\n• B1 \/ PILES — 25\/11\/2026/);
  assert.ok(!/GRD-L1/.test(mail[0].body),'the refused cell is not in the email');
  assert.match(mail[0].body,/CANCELLED\n• GRD \/ SLAB \(Part 1\) · U9AV — reason: redesign/);
  const h=els.cellCardModal.innerHTML;
  assert.match(h,/Not saved — left out of the email:<\/b><ul><li>1 new placeholder at GRD-L1 \/ COLUMNS — the database refused it: GRD-L1 \/ COLUMNS isn&#39;t a level\/area on this job — refresh, or send it as Ad hoc\.<\/li>/);
  assert.match(h,/Created 2 placeholders\. One cell was not saved — left out of the email \(listed above\)\./);
  assert.deepEqual(Object.keys(plain(r('cellCard.orders'))).map(k=>JSON.parse(k).join(' / ')),['GRD-L1 / COLUMNS'],'the refused cell keeps its placeholder to try again');
  // trying again fails the same way: listed once, the cell's placeholder still waiting
  r('__mail.length=0');await a.ccCreateAndEmail();
  assert.equal(r('cellCard.failed.length'),1,'the same refusal is listed once');
  assert.equal(r('__mail.length'),1,'the saved items still make their one email');
  // the email dialog says it was opened → what it carried is done
  r('__mail[0].opts.onSent()');
  assert.deepEqual(plain(r('cellCard.log')),{created:[],dates:[],cancels:[]});
  assert.match(els.cellCardModal.innerHTML,/The email \(3 items\) is open in your email app — check it there and press Send\./);
});

test('the card refuses an empty job, and a job that is gone — nothing is sent', async()=>{
  const{a,r,els,sb}=cardApp();
  a.openCellCard([{level:'GRD',area:'COLUMNS'}]);
  r("cellCard.project=''");await a.ccCreateAndEmail();
  assert.match(els.cellCardModal.innerHTML,/This card has no job — close it and open the cell again\. Nothing was saved\./);
  r("cellCard.project='Gone Job'");await a.ccCreateAndEmail();
  assert.match(els.cellCardModal.innerHTML,/This job is no longer in the list — close the card and refresh\. Nothing was saved\./);
  assert.equal(sb.calls.length,0);assert.equal(r('__mail.length'),0);
});

test('only undated placeholders: created, said, and no email', async()=>{
  const{a,r,els,sb}=cardApp({answer:q=>q.op==='insert'&&q.table==='entries'?{data:q.payload.map((p,i)=>({id:200+i,...p})),error:null}:{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'COLUMNS'}]);
  await a.ccCreateAndEmail();
  assert.equal(sb.calls.filter(c=>c.op==='insert'&&c.table==='entries').length,1);
  assert.equal(r('__mail.length'),0);
  assert.match(els.cellCardModal.innerHTML,/Created 1 placeholder \(1 with no DBCC requested date — Not Ordered, not in the email\)\. Nothing to email/);
  // given a date later in the card, it goes in the next email as a NEW order
  r(`entries.push({id:200,project:'Barwon Reservoir',level:'GRD',area:'COLUMNS',status:'Not Ordered',entry_type:'scheduled',our_delivery_date:null})`);
  a.document.getElementById('ccDate_200').value='2026-12-01';
  a.__sb2=fakeSb(()=>({data:[{id:200}],error:null}));r('sb=__sb2');
  await a.ccSaveDate(200);
  assert.deepEqual(plain(r('cellCard.log.created')),[{id:200,level:'GRD',area:'COLUMNS',split:null,date:'2026-12-01'}]);
  assert.equal(r('cellCard.log.dates.length'),0);
});

test('a cancel from the card lands in its email; a refused cancel is listed as not saved', async()=>{
  const{a,r,els}=cardApp({answer:q=>q.table==='entries'?{data:[{id:22}],error:null}:{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  r("cellCard.notes[22]='<span class=\"cc-ok\">Saved — it goes in the email.</span>';cellCard.dateDraft[22]='2026-12-01'");   // a date saved earlier
  a.cancelEntry(22,true);
  assert.match(els.cancelModal.innerHTML,/onclick="doCancel\(22,true\)"/);
  a.document.getElementById('cancelR').value='not needed';
  await a.doCancel(22,true);
  assert.deepEqual(plain(r('cellCard.log.cancels')).map(c=>[c.id,c.reason]),[[22,'not needed']]);
  assert.equal(r('cellCard.notes[22]'),undefined,'the earlier "goes in the email" note no longer holds once it is cancelled');
  assert.equal(r('cellCard.dateDraft[22]'),undefined);
  const t=cardApp({answer:q=>q.table==='entries'?{data:null,error:{message:'new row violates row-level security policy'}}:{data:null,error:null}});
  t.a.openCellCard([{level:'GRD',area:'SLAB'}]);t.a.cancelEntry(22,true);t.a.document.getElementById('cancelR').value='x';
  await t.a.doCancel(22,true);
  assert.equal(t.r('cellCard.log.cancels.length'),0);
  assert.match(t.a.document.getElementById('ccSend').innerHTML,/Not saved — left out of the email:<\/b><ul><li>Cancelling GRD \/ SLAB \(Part 2\) — the database refused it: new row violates/);
  // the dashboard's own cancel (no card) is exactly as before
  const d=cardApp({answer:q=>q.table==='entries'?{data:[{id:22}],error:null}:{data:null,error:null}});
  d.a.cancelEntry(22);assert.match(d.a.document.getElementById('cancelModal').innerHTML,/onclick="doCancel\(22,false\)"/);
});

test('closing the card with saved changes not emailed asks first; an untouched card just closes', ()=>{
  const{a,r,els}=cardApp();
  a.openCellCard([{level:'GRD',area:'COLUMNS'}]);a.ccClose();
  assert.equal(r('cellCard'),null);assert.ok(!els.cellCardOv.classList.contains('show'));
  a.openCellCard([{level:'GRD',area:'SLAB'}]);r(`ccAfterCancel(entries.find(e=>e.id===21),'x')`);a.ccClose();
  assert.notEqual(r('cellCard'),null,'not closed yet');
  assert.match(r('__confirm.m'),/1 change saved in this card hasn&#39;t been emailed — it stays saved, only the email is left out\./);
  r('__confirm.fn()');assert.equal(r('cellCard'),null);
});

// ── The project editor, project delete and the Files pickers ──
function adminApp({live=true,answer}={}){
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  a.__p={pairs:PAIRS,projects:PROJECTS,entries:CARD_ENTRIES,live};
  r(`pairsLive=__p.live;authRole='dbcc';userName='Chris';adminUnlocked=true;
     projectPairs=JSON.parse(JSON.stringify(__p.pairs));projects=JSON.parse(JSON.stringify(__p.projects));entries=JSON.parse(JSON.stringify(__p.entries));
     entries.push({id:40,project:'1033 Nepean Hwy',level:'Driveway',area:'Excavation',status:'Ordered',entry_type:'scheduled'});
     emailContacts=[];projectSchedulers=[];projectFiles=[];__alerts=[];alert=m=>__alerts.push(String(m));
     loadProjects=async()=>{};populateDropdowns=()=>{};confirmDialog=(t,m,ok,c,fn)=>{__confirmed=fn};`);
  const els={};
  a.document.getElementById=id=>els[id]||(els[id]={id,value:'',innerHTML:'',textContent:'',title:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}}});
  a.document.querySelector=()=>({value:'level_area'});
  const sb=fakeSb(answer||(()=>({data:null,error:null})));a.__sb=sb;r('sb=__sb');
  return{a,r,els,sb};
}
test('project editor (pairs live): a linked job is read-only — its lists come from Master-OPS; a new job has no Levels / Areas boxes', ()=>{
  const{a,els}=adminApp();
  a.renderAdminProj();
  assert.ok(!/newLevels|newAreas|textarea/.test(els.adminProj.innerHTML),'no Levels / Areas boxes');
  assert.match(els.projPairsBox?els.projPairsBox.innerHTML:els.adminProj.innerHTML,/Levels and areas come from Master-OPS once the job is linked to it/);
  a.editProj(6);
  assert.equal(els.newProjName.disabled,true);assert.equal(els.newProjSupplier.disabled,true);
  assert.equal(els.saveProjBtn.style.display,'none');assert.equal(els.cancelPE.textContent,'Close');
  assert.match(els.projPairsBox.innerHTML,/Linked to Master-OPS \(BAR\)\.<\/b> Its name, supplier and levels and areas come from Master-OPS — change them in Project Setup there\./);
  assert.match(els.projPairsBox.innerHTML,/<li><b>GRD<\/b> — SLAB · COLUMNS<\/li>/);
  assert.match(els.projPairsBox.innerHTML,/No longer on this job in Master-OPS: L1 \/ WALLS/);
  // an unlinked job with entries filed under its name: the name stays, the supplier can change
  a.editProj(7);
  assert.equal(els.newProjName.disabled,true);assert.equal(els.newProjSupplier.disabled,false);assert.equal(els.saveProjBtn.style.display,'');
  assert.match(els.projPairsBox.innerHTML,/Not linked to Master-OPS\.<\/b> Its level \/ area pair is REO-only \(set by a migration\):/);
  assert.match(els.projPairsBox.innerHTML,/The name stays as it is: entries and pairs are filed under it\./);
  a.editProj(8);
  assert.equal(els.newProjName.disabled,false);assert.match(els.projPairsBox.innerHTML,/Not linked to Master-OPS yet — nothing can be ordered\./);
  a.cancelPE();assert.equal(els.newProjName.disabled,false);assert.equal(els.aFormTitle.textContent,'Add New Project');
});

test('project editor (pairs live): a new job is a name and a supplier; a linked job is never sent; the list shows each job\'s link', async()=>{
  let t=adminApp();const el=id=>t.a.document.getElementById(id);
  t.a.renderAdminProj();el('newProjName').value='Stead Park';el('newProjSupplier').value='ARC';
  await t.a.saveProject();
  assert.deepEqual(t.sb.calls.map(c=>[c.table,c.op]),[['projects','insert'],['audit_log','insert']]);
  assert.deepEqual({...t.sb.calls[0].payload},{name:'Stead Park',supplier:'ARC',levels:'',areas:''});
  t=adminApp();t.a.renderAdminProj();t.a.editProj(6);el('saveProjBtn').style.display='';await t.a.saveProject();
  assert.equal(t.sb.calls.length,0);assert.match(el('projErr').innerHTML,/This job is linked to Master-OPS — its name, supplier and levels \/ areas come from Master-OPS and can&#39;t be changed here\./);
  t=adminApp();t.a.renderAdminProj();t.a.editProj(7);el('newProjSupplier').value='ARC';await t.a.saveProject();
  assert.deepEqual({...t.sb.calls[0].payload},{supplier:'ARC'},'only what changed; the filed name is never sent');
  assert.equal(t.sb.calls[0].op,'update');
  const list=el('projList').innerHTML;
  assert.match(list,/Barwon Reservoir<span class="pill"[^>]*>Aus Reo<\/span><span class="pill pill-linked"[^>]*>Master-OPS · BAR<\/span>/);
  assert.match(list,/New Job<span class="pill"[^>]*>ARC<\/span><span class="pill pill-unlinked">Not linked to Master-OPS<\/span>/);
  assert.match(list,/<b>5<\/b> level \/ area pairs · 1 no longer on the job/);
  assert.ok(!/deleteProj\(6\)|deleteProj\(7\)/.test(list),'a job with pairs or a link has no Delete');assert.match(list,/deleteProj\(8\)/);
  assert.match(list,/onclick="editProj\(6\)">View</);
});

test('deleting a job writes its history only after the database removed it, and says why not', async()=>{
  for(const [answer,said,hist] of [
    [{data:[{id:8}],error:null},null,true],
    [{data:null,error:{code:'23503',message:'update or delete on table "projects" violates foreign key constraint'}},/^Not deleted — this job has level \/ area pairs \(or other records\) that point at it, so it can't be deleted — it stays\.$/,false],
    [{data:[],error:null},/^Not deleted — the job wasn't deleted/,false]]){
    for(const live of [true,false]){
      const{a,r,sb}=adminApp({live,answer:q=>q.table==='projects'?answer:{data:null,error:null}});
      a.renderAdminProj();a.deleteProj(8);await r('__confirmed()');
      assert.deepEqual(sb.calls.map(c=>c.table+':'+c.op),hist?['projects:delete','audit_log:insert']:['projects:delete']);
      assert.ok(sb.calls[0].returning,'the delete asks for the row back');
      const al=plain(r('__alerts'));if(said)assert.match(al[0]||'',said);else assert.equal(al.length,0);
    }
  }
});

test('project editor (pairs off): exactly b5.13 — the Levels / Areas boxes', ()=>{
  const{a,els}=adminApp({live:false});
  a.renderAdminProj();
  assert.match(els.adminProj.innerHTML,/<textarea id="newLevels"/);assert.match(els.adminProj.innerHTML,/<textarea id="newAreas"/);
});

test('Files (pairs live): a level + area file is tagged with one of the job\'s pairs', async()=>{
  const{a,els,sb}=adminApp();
  els.pfProj=a.document.getElementById('pfProj');els.pfProj.value='Barwon Reservoir';
  a.pfOnProjChange();
  assert.deepEqual(opts(els.pfLevel.innerHTML),['Choose level…','GRD','L1','GRD-L1','B1']);
  assert.deepEqual(opts(els.pfArea.innerHTML),['Pick a level first']);assert.equal(els.pfArea.disabled,true);
  els.pfLevel.value='L1';a.pfOnLevelChange();
  assert.deepEqual(opts(els.pfArea.innerHTML),['Choose area…','SLAB'],'only that level\'s active pairs');assert.equal(els.pfArea.disabled,false);
  // an upload tagged with a level / area that isn't a pair is refused before anything is sent
  els.pfArea.value='WALLS';
  for(const[id,v]of Object.entries({pfCat:'marking_plan',pfLabel:'x',pfSuperseding:false}))a.document.getElementById(id).value=v;
  a.document.getElementById('pfSuperseding').checked=false;
  vm.runInContext("window._pfPendingFile={name:'a.pdf'}",a);
  await a.pfUpload();
  assert.match(a.document.getElementById('pfUploadErr').innerHTML,/L1 \/ WALLS isn't a level \/ area on this job in Master-OPS — pick it from the list/);
  assert.equal(sb.calls.length,0);
});

test('the email dialog without the card is unchanged: no file list taken over, no callback carried', ()=>{
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  r(`emailContacts=[];projectSchedulers=[];projectFiles=[];entries=[];__got=0;`);
  const els={};a.document.getElementById=id=>els[id]||(els[id]={id,innerHTML:'',value:'',classList:{add(){},remove(){}}});
  a.emailModal('S','B',null,'cell_card','Barwon Reservoir',{files:[],onSent:()=>{}});
  assert.equal(typeof r('emailAfterSend'),'function');
  a.emailModal('S','B',null,'order_created','Barwon Reservoir');
  assert.equal(r('emailAfterSend'),null,'a later email never fires the card\'s callback');
});

// ── Stage 3 review fixes ──
test('Edit: a supplier can\'t change an entry\'s job, level or area — REO 0012 refuses it whether pairs are live or not', ()=>{
  for(const live of [false,true])for(const role of ['supplier','dbcc']){
    const{a,r,els}=cardApp({role});r(`pairsLive=${live}`);
    a.openEditEntry(21);
    const h=els.editModal.innerHTML,locked=role==='supplier',tag=`${role}, pairs ${live?'on':'off'}`;
    for(const id of ['ed_proj','ed_level','ed_area'])assert.equal(new RegExp(`<select id="${id}" disabled>`).test(h),locked,`${tag}: ${id}`);
    assert.equal(/Only DBCC can change the job, level or area once an entry is made — ask DBCC\./.test(h),locked,tag);
    assert.equal(/id="ed_ourD" value="2026-11-05" disabled/.test(h),locked,`${tag}: DBCC's requested date, as before`);
  }
});

test('the b5.13 grid (pairs off) never creates placeholders on no job — the project list changed under it', async()=>{
  const a=loadApp(),r=src=>vm.runInContext(src,a);
  r(`pairsLive=false;userName='Chris';entries=[];loadEntries=async()=>{};
     projects=[{id:6,name:'Barwon Reservoir',supplier:'Aus Reo',levels:['GRD'],areas:['SLAB']}];
     dpSelected={'GRD||SLAB':{splits:[{label:'',date:''}]}};`);
  const els={};
  a.document.getElementById=id=>els[id]||(els[id]={id,value:'',innerHTML:'',textContent:'',disabled:false,style:{},classList:{add(){},remove(){},toggle(){}}});
  const sb=fakeSb(()=>({data:null,error:null}));a.__sb=sb;r('sb=__sb');
  for(const pn of ['','Gone Job']){
    a.document.getElementById('dpProj').value=pn;
    await a.dpCreate();
    assert.match(els.dpErr.innerHTML,/Pick the project again — the project list changed\. Nothing was created\./,pn||'(blank)');
    assert.equal(sb.calls.length,0,'nothing sent');
  }
  els.dpProj.value='Barwon Reservoir';await a.dpCreate();
  assert.deepEqual(sb.calls.map(c=>c.table+':'+c.op),['entries:insert','audit_log:insert'],'a job that is there creates as before');
  assert.equal(sb.calls[0].payload[0].project,'Barwon Reservoir');
});

test('the card: a retry that lands takes its "Not saved" line off — it is in the email now', async()=>{
  // a date: refused (no connection), then saved
  let fail=true;
  const{a,r,els}=cardApp({answer:q=>q.table==='entries'&&q.op==='update'?(fail?{data:null,error:{message:'TypeError: Failed to fetch'}}:{data:[{id:22}],error:null}):{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  a.document.getElementById('ccDate_22').value='2026-11-19';
  await a.ccSaveDate(22);
  assert.equal(r('cellCard.failed.length'),1);assert.match(els.cellCardModal.innerHTML,/Not saved — left out of the email:/);
  await a.ccSaveDate(22);
  assert.equal(r('cellCard.failed.length'),1,'the same refusal again: still one line');
  fail=false;await a.ccSaveDate(22);
  assert.equal(r('cellCard.failed.length'),0,'saved on the retry: off the list');
  assert.ok(!/Not saved — left out of the email/.test(els.cellCardModal.innerHTML));
  assert.deepEqual(plain(r('cellCard.log.dates')).map(d=>[d.id,d.new]),[[22,'2026-11-19']]);
  // a cell's new placeholders: refused, then made on the next press
  let refuse=true;
  const t=cardApp({answer:q=>{
    if(q.table!=='entries'||q.op!=='insert')return{data:null,error:null};
    return refuse?{data:null,error:{message:'TypeError: Failed to fetch'}}:{data:q.payload.map((p,i)=>({id:300+i,...p})),error:null}}});
  t.a.openCellCard([{level:'GRD',area:'COLUMNS'}]);t.r("cellCard.allDate='2026-11-25'");
  await t.a.ccCreateAndEmail();
  assert.equal(t.r('cellCard.failed.length'),1);assert.equal(t.r('__mail.length'),0,'nothing saved, nothing to email');
  refuse=false;await t.a.ccCreateAndEmail();
  assert.equal(t.r('cellCard.failed.length'),0,'made on the second press: off the list');
  assert.equal(t.r('__mail.length'),1,'and in the one email');assert.match(t.r('__mail[0].body'),/• GRD \/ COLUMNS — 25\/11\/2026/);
  // a refused date on an entry that is then cancelled from the card: the date line goes with the cancel
  const c=cardApp({answer:q=>q.table==='entries'&&q.op==='update'?(q.payload.status==='Cancelled'?{data:[{id:22}],error:null}:{data:null,error:{message:'TypeError: Failed to fetch'}}):{data:null,error:null}});
  c.a.openCellCard([{level:'GRD',area:'SLAB'}]);c.a.document.getElementById('ccDate_22').value='2026-11-19';
  await c.a.ccSaveDate(22);assert.equal(c.r('cellCard.failed.length'),1);
  c.a.cancelEntry(22,true);c.a.document.getElementById('cancelR').value='not needed';await c.a.doCancel(22,true);
  assert.equal(c.r('cellCard.failed.length'),0);assert.deepEqual(plain(c.r('cellCard.log.cancels')).map(x=>x.id),[22]);
});

test('the card: a date someone else saved while this one was typed is never written over unseen', async()=>{
  const{a,r,els,sb}=cardApp({answer:q=>q.table==='entries'&&q.op==='update'?{data:[{id:21}],error:null}:{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'SLAB'}]);
  a.ccDateDraft(21,'2026-11-08');                                     // typing starts from 05/11 …
  r("entries.find(e=>e.id===21).our_delivery_date='2026-11-07'");      // … someone else saves 07/11 meanwhile (realtime)
  a.document.getElementById('ccDate_21').value='2026-11-08';
  await a.ccSaveDate(21);
  assert.equal(sb.calls.length,0,'nothing written, no history');
  assert.match(r('cellCard.notes[21]'),/Not saved — the DBCC requested date changed meanwhile — it is now 07\/11\/2026\. Check it and press Save date again\./);
  assert.match(els.cellCardModal.innerHTML,/<li>DBCC requested date for GRD \/ SLAB \(Part 1\) · U9AV — the DBCC requested date changed meanwhile — it is now 07\/11\/2026/);
  assert.equal(r('cellCard.log.dates.length'),0,'not in the email');
  // pressed again, now that it has been said: saved from the date that is there now
  await a.ccSaveDate(21);
  assert.deepEqual(sb.calls.map(c=>c.table+':'+c.op),['entries:update','audit_log:insert']);
  assert.deepEqual(sb.calls[0].filters.map(f=>[...f]),[['eq','id',21],['eq','our_delivery_date','2026-11-07'],['eq','status','Scheduled']]);
  assert.deepEqual(plain(r('cellCard.log.dates')).map(d=>[d.old,d.new]),[['2026-11-07','2026-11-08']]);
  assert.equal(r('cellCard.failed.length'),0);
  // typed back to the date that is there: nothing to save, nothing said
  a.ccDateDraft(21,'2026-11-08');r("entries.find(e=>e.id===21).our_delivery_date='2026-11-08'");
  await a.ccSaveDate(21);assert.equal(sb.calls.length,2,'no second write');
});

// ── Fix round (4 Nov evening): one save at a time in the card ──
const tick=()=>new Promise(s=>setTimeout(s,1));
const SEND_BTN=/<button class="btn btn-sm" id="ccSendBtn" onclick="ccCreateAndEmail\(\)" style="width:auto;margin:0"( disabled)?>([^<]*)<\/button>/;

test('Create + email runs once at a time: a redraw mid-run never brings the button back, and nothing typed meanwhile is lost', async()=>{
  const held=[];let inserts=0;
  const{a,r,els,sb}=cardApp({answer:q=>{
    if(q.table!=='entries'||q.op!=='insert')return{data:null,error:null};
    const n=++inserts;return new Promise(ok=>held.push(()=>ok({data:q.payload.map((p,i)=>({id:400+n*10+i,...p})),error:null})))}});
  a.openCellCard([{level:'GRD',area:'COLUMNS'},{level:'B1',area:'PILES'},{level:'GRD-L1',area:'COLUMNS'}]);   // three empty green cells
  r("cellCard.allDate='2026-11-20'");
  const first=a.ccCreateAndEmail();
  await tick();
  assert.deepEqual([...els.ccSend.innerHTML.match(SEND_BTN)].slice(1),[' disabled','Saving…'],'pressed: "Saving…" before the first insert answers');
  // while the first insert is held: a label typed, a placeholder added / removed, the dates, a file ticked, a realtime refresh
  r("ccSetOrder(cellKey('B1','PILES'),0,'label','Top');ccAddOrder(cellKey('B1','PILES'));ccRemoveOrder(cellKey('GRD-L1','COLUMNS'),0);ccSetAllDate('2026-12-01');ccSetDateMode('each')");
  r('ccTickFile(31,true)');a.afterEntriesLoaded();
  const h=els.cellCardModal.innerHTML;
  assert.deepEqual([...h.match(SEND_BTN)].slice(1),[' disabled','Saving…'],'every redraw draws the button "Saving…", disabled');
  assert.equal((h.match(/<input type="text" value="" placeholder="No split" oninput="ccSetOrder\([^"]*\)" readonly>/g)||[]).length,3,'the placeholders are read-only');
  assert.match(h,/onclick="ccAddOrder\([^"]*\)" title="Add a placeholder" disabled>\+<\/button>/);
  assert.match(h,/id="ccAllDate" value="2026-11-20" oninput="ccSetAllDate\(this\.value\)" disabled>/);
  assert.deepEqual(plain(r('Object.values(cellCard.orders)')),[[{label:'',date:''}],[{label:'',date:''}],[{label:'',date:''}]],'nothing typed while it ran is taken in and then dropped');
  assert.equal(r("cellCard.allDate+'|'+cellCard.dateMode"),'2026-11-20|all');
  const second=a.ccCreateAndEmail();   // pressed again
  for(let i=0;i<20;i++){await tick();while(held.length)held.shift()()}
  await first;await second;
  assert.equal(inserts,3,'one insert per cell — never a second set');
  assert.equal(r('__mail.length'),1,'one email');
  assert.deepEqual(plain(r('cellCard.log.created.map(x=>x.level+" / "+x.area)')),['GRD / COLUMNS','GRD-L1 / COLUMNS','B1 / PILES'],'grid order, each once');
  assert.deepEqual(plain(r('cellCard.orders')),{},'made: the placeholders leave the card');
  assert.equal(r('cellCard.busy'),false);
  assert.deepEqual([...els.cellCardModal.innerHTML.match(SEND_BTN)].slice(1),[undefined,'Email the changes'],'done: the button is back');
  assert.equal(sb.calls.filter(c=>c.table==='audit_log'&&c.payload.action==='BULK_CREATE').length,1);
});

test('a run takes only its own placeholders off the card; a cell it refused keeps them to try again', async()=>{
  const{a,r}=cardApp({answer:q=>q.table==='entries'&&q.op==='insert'?(q.payload[0].level==='B1'?{data:null,error:{message:'new row violates row-level security policy'}}:{data:q.payload.map((p,i)=>({id:500+i,...p})),error:null}):{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'COLUMNS'},{level:'B1',area:'PILES'}]);
  r("cellCard.allDate='2026-11-20'");
  // a placeholder added to a cell after its run planned it (the screen can't, it is read-only then): it stays
  r("__extra={label:'Later',date:''};__run=ccCreateAndEmail();cellCard.orders[cellKey('GRD','COLUMNS')].push(__extra)");
  await r('__run');
  assert.deepEqual(plain(r("cellCard.orders[cellKey('GRD','COLUMNS')]")),[{label:'Later',date:''}],'not dropped unseen');
  assert.deepEqual(plain(r("cellCard.orders[cellKey('B1','PILES')]")),[{label:'',date:''}],'refused: still waiting');
});

test('a date save runs once at a time; the card waits for it before emailing or closing', async()=>{
  const held=[];
  const{a,r,els,sb}=cardApp({answer:q=>q.table==='entries'&&q.op==='update'?new Promise(ok=>held.push(()=>ok({data:[{id:22}],error:null}))):{data:null,error:null}});
  a.openCellCard([{level:'GRD',area:'SLAB'},{level:'GRD',area:'COLUMNS'}]);
  a.ccDateDraft(22,'2026-11-19');a.document.getElementById('ccDate_22').value='2026-11-19';
  const p1=a.ccSaveDate(22);await tick();
  assert.equal(els.ccDate_22.readOnly,true,'the box being saved is read-only at once');
  a.afterEntriesLoaded();   // a realtime refresh redraws the card mid-save
  const h=els.cellCardModal.innerHTML;
  assert.match(h,/id="ccDate_22" value="2026-11-19" oninput="ccDateDraft\(22,this\.value\)" readonly><button class="action-btn cc-save" id="ccDateBtn_22" onclick="ccSaveDate\(22\)" disabled>Saving…<\/button>/);
  assert.deepEqual([...h.match(SEND_BTN)].slice(1),[' disabled','Saving…'],'the email waits for the date');
  a.ccDateDraft(22,'2026-11-21');   // typed while it saves: refused, so it can't be dropped when the save lands
  const p2=a.ccSaveDate(22);         // pressed again
  await a.ccCreateAndEmail();assert.equal(r('__mail.length'),0,'no email mid-save');
  a.ccClose();assert.notEqual(r('cellCard'),null,'not closed mid-save');
  assert.match(els.ccSend.innerHTML,/Still saving — close the card once it has finished\./);
  while(held.length)held.shift()();await p1;await p2;
  assert.deepEqual(sb.calls.map(c=>c.table+':'+c.op),['entries:update','audit_log:insert','audit_log:insert'],'one write, its history once');
  assert.deepEqual(plain(r('cellCard.log.dates')).map(d=>[d.id,d.new]),[[22,'2026-11-19']]);
  assert.equal(r('cellCard.dateDraft[22]'),undefined);
  assert.ok(!/Still saving/.test(els.cellCardModal.innerHTML),'done: the "still saving" words go');
  assert.match(els.cellCardModal.innerHTML,/Saved — it goes in the email\./);
  a.ccClose();assert.match(r('__confirm.m'),/1 change saved in this card hasn&#39;t been emailed/,'now it can be closed (it asks first: not emailed yet)');
});

test('a save whose reload fails part-way still finishes: the button comes back and the words are shown', async()=>{
  const{a,r,els}=cardApp({answer:q=>q.table==='entries'&&q.op==='update'?{data:[{id:22}],error:null}:{data:null,error:null}});
  r("loadEntries=async()=>{throw new Error('TypeError: Failed to fetch')}");
  a.openCellCard([{level:'GRD',area:'SLAB'}]);a.ccDateDraft(22,'2026-11-19');a.document.getElementById('ccDate_22').value='2026-11-19';
  await a.ccSaveDate(22);
  assert.equal(r('cellCard.saving.size'),0);
  assert.match(els.cellCardModal.innerHTML,/Saved — it goes in the email\./);
  r(`cellCard.allDate='2026-11-25';ccAddOrder(cellKey('GRD','SLAB'))`);
  a.__sb=fakeSb(q=>q.table==='entries'&&q.op==='insert'?{data:q.payload.map((p,i)=>({id:600+i,...p})),error:null}:{data:null,error:null});r('sb=__sb');
  await a.ccCreateAndEmail();
  assert.equal(r('cellCard.busy'),false);assert.equal(r('__mail.length'),1);
  // and a run that stops part-way (here: the history write throws) says so, keeps what it made, and frees the button
  const t=cardApp({answer:q=>{if(q.table==='audit_log')throw new Error('boom');return q.table==='entries'&&q.op==='insert'?{data:q.payload.map((p,i)=>({id:700+i,...p})),error:null}:{data:null,error:null}}});
  t.a.openCellCard([{level:'GRD',area:'COLUMNS'}]);t.r("cellCard.allDate='2026-11-25'");
  await t.a.ccCreateAndEmail();
  assert.equal(t.r('cellCard.busy'),false);
  assert.match(t.els.cellCardModal.innerHTML,/<div class="error-msg">Stopped part-way \(boom\)\. What was made is under "Saved in this card" — check the cells before pressing again\.<\/div>/);
  assert.deepEqual(plain(t.r('cellCard.log.created')).map(x=>x.id),[700],'the cell made before it stopped is in the card\'s log');
  assert.deepEqual([...t.els.cellCardModal.innerHTML.match(SEND_BTN)].slice(1),[undefined,'Email the changes']);
});
