/** Focused geometry regression: real entity/Find controls, real Workspace CSS. */
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import { readFile } from 'node:fs/promises';
import { isolatedBrowser } from './stage-c-gates/browser.mjs';

const browser = await isolatedBrowser();
const savedDocument = process.env.CONCERTINA_DOCUMENT ? await readFile(process.env.CONCERTINA_DOCUMENT, 'utf8') : undefined;
const vite = await createServer({ configFile: false, cacheDir: `/tmp/speedy-concertina-cache-${process.pid}`, plugins: [solidPlugin(), {
  name: 'concertina-fixture', configureServer(server) {
    if (savedDocument) server.middlewares.use('/__saved-document.json', (_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(savedDocument); });
    server.middlewares.use('/__concertina', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html><body></body></html>'); });
  },
}], server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
try {
  await vite.listen();
  const page = await browser.launch();
  await page.navigate(`http://127.0.0.1:${vite.httpServer.address().port}/__concertina`);
  await page.evaluate(`window.pageless = ${process.env.CONCERTINA_PAGELESS === '1'}`);
  await page.evaluate(String.raw`(async () => {
    const {ReactiveEditor} = await import('/src/reactive-editor/editor.ts');
    const {registerEntityTestViews: registerCoreViews,entityTestList} = await import('/src/features/entity-references/test-support.ts');
    const {ReactiveTreeView} = await import('/src/rendering/reactive-tree-view.tsx');
    const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
    const {render, createComponent} = await import(source.split('"').find(p => p.includes('/solid-js_web.js')));
    await import('/src/index.css'); await import('/src/demo/workspace-demo.css');
    window.createConcertinaEditor = {ReactiveEditor,registerCoreViews,entityTestList,ReactiveTreeView,render,createComponent};
    window.originalFetch=window.fetch;
    window.fetch = async () => ({ok:true,json:async()=>({Success:true,Results:[{id:'alpha',name:'Alpha',mentions:3}]})});
    const text = 'Alpha\n' + 'Some ordinary intervening text.\n'.repeat(60) + 'Alpha';
    const ref = (start) => ({type:'codex/entity-reference',value:'alpha',start,end:start+4});
    const blocks = [
      {id:'a',type:'standoff-editor-block',text,standoffProperties:[ref(0),ref(text.length-5)]},
      {id:'gap',type:'standoff-editor-block',text:'Unmatched intervening paragraph.\n'.repeat(20)},
      {id:'b',type:'standoff-editor-block',text:'Alpha nearby',standoffProperties:[ref(0)]},
    ];
    const editor = new ReactiveEditor({type:window.pageless?'main-list-block':'document-block',children:window.pageless?blocks:[{id:'page',type:'page-block',children:blocks}]});
    registerCoreViews(editor); const projection=editor.createView('concertina-browser');
    const host=document.body.appendChild(document.createElement('div')); host.className='workspace-demo';
    host.style.cssText='display:block;width:650px;height:600px;overflow:auto;background:white';
    const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);
    const node=id=>Object.values(projection.state.nodes).find(n=>n.payload.id===id);
    const root=id=>editor.mounts.get(node(id).key).root;
    const surface=()=>root('a').querySelector('.reactive-standoff-surface');
    const settle=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>setTimeout(r,80))));
    const geometry=()=>({height:surface().getBoundingClientRect().height,scroll:surface().scrollTop,
      clipped:surface().classList.contains('reactive-concertina-viewport'),gapHidden:getComputedStyle(root('gap')).display==='none',
      separation:root('b').getBoundingClientRect().top-root('a').getBoundingClientRect().bottom,
      text:surface().querySelector('.reactive-standoff-flow').textContent,
      revision:editor.repository.state.revision,undo:editor.repository.canUndo()});
    window.check={editor,entityList:entityTestList(editor),node,root,surface,geometry,settle,text,dispose};
    await settle();
  })()`);
  if (savedDocument) {
    const report = await page.evaluate(String.raw`(async()=>{
      check.dispose(); check.editor.dispose(); document.body.replaceChildren();
      const {ReactiveEditor,registerCoreViews,entityTestList,ReactiveTreeView,render,createComponent}=createConcertinaEditor;
      const dto=await (await originalFetch('/__saved-document.json')).json();
      const editor=new ReactiveEditor(dto); registerCoreViews(editor); const projection=editor.createView('saved-concertina');
      const host=document.body.appendChild(document.createElement('div'));host.className='workspace-demo';host.style.cssText='display:block;width:650px;height:600px;overflow:auto';
      const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);
      await check.settle();
      const nodes=Object.values(projection.state.nodes);
      const origin=nodes.find(n=>n.viewType==='standoff-editor-block' && n.inlineContent.length>100 && editor.mounts.get(n.key));
      const baseline=JSON.stringify(editor.repository.snapshot()), naturalHeight=host.scrollHeight;
      entityTestList(editor).open(origin.key); await check.settle();
      const buttons=[...document.querySelectorAll('.document-entity-list__focus')];
      const list={pageKey:entityTestList(editor).state.pageKey,rows:entityTestList(editor).state.rows.map(r=>({id:r.id,count:r.ranges.length,page:entityTestList(editor).pageOccurrenceCount(r.id)})),buttons:buttons.map(b=>({title:b.title,disabled:b.disabled}))};
      buttons.find(b=>!b.disabled)?.click();await check.settle();
      const entity={active:entityTestList(editor).state.concertinaEntityId,owner:editor.concertina.state.owner,hidden:document.querySelectorAll('[data-concertina-hidden]').length,clipped:document.querySelectorAll('.reactive-concertina-viewport').length,height:host.scrollHeight};
      entityTestList(editor).close(false); editor.find.open(origin.key);editor.find.setQuery('the');await editor.find.flush();
      const findButton=document.querySelector('[aria-label^="Concertina matching Blocks on current"]');
      const find={pageKey:editor.find.state.pageKey,disabled:findButton.disabled,matches:editor.find.state.result.matches.length};
      findButton.click();await check.settle();
      Object.assign(find,{requested:editor.find.state.concertinaRequested,owner:editor.concertina.state.owner,hidden:document.querySelectorAll('[data-concertina-hidden]').length,clipped:document.querySelectorAll('.reactive-concertina-viewport').length,height:host.scrollHeight});
      editor.find.close(false);await check.settle();
      const unchanged=JSON.stringify(editor.repository.snapshot())===baseline && !editor.repository.canUndo(), restoredHeight=host.scrollHeight;
      dispose();editor.dispose();return {list,entity,find,naturalHeight,restoredHeight,unchanged};
    })()`);
    console.log(JSON.stringify({entityRows:report.list.rows.length,enabledFocusButtons:report.list.buttons.filter(b=>!b.disabled).length,
      entity:report.entity,find:report.find,naturalHeight:report.naturalHeight,restoredHeight:report.restoredHeight,unchanged:report.unchanged},null,2));
    assert.ok(report.list.buttons.some(b=>!b.disabled));
    assert.ok(report.entity.owner && report.entity.hidden + report.entity.clipped > 0);
    assert.ok(report.find.requested && report.find.owner && report.find.hidden + report.find.clipped > 0);
    assert.ok(report.entity.height < report.naturalHeight && report.find.height < report.naturalHeight);
    assert.equal(report.restoredHeight,report.naturalHeight); assert.equal(report.unchanged,true);
  } else {
  const before = await page.evaluate('check.geometry()');
  await page.evaluate(`check.entityList.open(check.node('a').key)`);
  await page.evaluate('check.settle()');
  await page.evaluate(`document.querySelector('[aria-label^="Focus occurrences of Alpha on current"]').click()`);
  await page.evaluate('check.settle()');
  const focused = await page.evaluate('check.geometry()');
  console.log(JSON.stringify({ before, focused }, (key, value) => key === 'text' ? value.length : value, 2));
  assert.ok(before.height > 1000); assert.ok(focused.height <= 360 && focused.clipped);
  assert.ok(focused.gapHidden); assert.ok(focused.separation < 30);
  assert.equal(focused.text, before.text); assert.equal(focused.revision, before.revision); assert.equal(focused.undo, false);
  await page.evaluate(`check.entityList.navigateConcertina(1);`);
  await page.evaluate('check.settle()');
  const next = await page.evaluate('check.geometry()');
  assert.ok(next.scroll > focused.scroll + 500); assert.ok(next.height <= 360);
  await page.evaluate(`document.querySelector('[aria-label^="Focus occurrences of Alpha on current"]').click()`);
  await page.evaluate('check.settle()');
  const restored = await page.evaluate('check.geometry()');
  assert.equal(restored.height, before.height); assert.equal(restored.gapHidden, false); assert.equal(restored.scroll, before.scroll);
  await page.evaluate(`check.entityList.close(false); check.editor.find.open(check.node('a').key); check.editor.find.setQuery('Alpha'); check.editor.find.flush()`);
  await page.evaluate(`document.querySelector('[aria-label^="Concertina matching Blocks on current"]').click(); check.settle()`);
  const find = await page.evaluate('check.geometry()');
  assert.ok(find.clipped && find.height <= 360 && find.gapHidden && find.separation < 30);
  await page.evaluate(`check.editor.find.close(false); check.settle()`);
  const end = await page.evaluate('check.geometry()');
  assert.deepEqual(end, before);
  console.log(JSON.stringify({passed:true,nextScroll:next.scroll,findHeight:find.height,restoredHeight:end.height}));
  await page.evaluate('check.dispose(); check.editor.dispose()');
  }
} finally { await browser.close(); await vite.close(); }
