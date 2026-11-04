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
