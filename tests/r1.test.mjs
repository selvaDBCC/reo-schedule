// REO b5.14 (release R1) — tests for the front-end guard rails. Plain node:test, no packages, nothing touches a server.
// Run from the repo root:  node --test tests/
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
