// Run against an already-running Vite server. Uses an isolated Chrome profile
// and an in-memory document; it does not save or call the document API.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const profile = await mkdtemp(path.join(tmpdir(), "speedy-minimap-"));
const chrome = spawn(process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ["--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"]);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = ""; chrome.stderr.on("data", chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.once("error", reject); setTimeout(() => reject(new Error("Chrome startup timeout")), 15000).unref();
  });
  socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
  let id = 0; const pending = new Map();
  socket.addEventListener("message", event => { const response = JSON.parse(event.data), task = pending.get(response.id); if (!task) return; pending.delete(response.id); response.error ? task.reject(new Error(JSON.stringify(response.error))) : task.resolve(response.result); });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id, timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 30000);
    pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" }); const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async expression => { const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result.value; };
  await send("Emulation.setDeviceMetricsOverride", { width: 1100, height: 760, deviceScaleFactor: 2, mobile: false }, sessionId);
  await send("Page.navigate", { url: process.env.BENCHMARK_URL ?? "http://localhost:3000/" }, sessionId); await evaluate("new Promise(resolve => setTimeout(resolve, 1200))");
  await evaluate(`(async()=>{
    const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
    const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const webPath=source.split('"').find(part=>part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));const {render,createComponent}=await import(webPath);
    const paragraphs=Array.from({length:36},(_,index)=>({id:'p'+index,type:'standoff-editor-block',text:(index%4===0?'Needle ':'')+'Paragraph '+index+' '.repeat(20),...(index===0?{relation:{rightMargin:{id:'note',type:'right-margin-block',children:[{type:'standoff-editor-block',text:'Margin note'}]}}}:{})}));
    paragraphs.push({id:'tabs',type:'tab-row-block',children:[{type:'tab-block',metadata:{name:'Visible',active:true},children:[]},{type:'tab-block',metadata:{name:'Hidden'},children:[{id:'hidden',type:'standoff-editor-block',text:'Needle hidden'}]}]});
    const editor=new ReactiveEditor({type:'document-block',children:[{id:'page',type:'page-block',children:paragraphs},{id:'other-page',type:'page-block',children:[{type:'standoff-editor-block',text:'Needle other page'}]}]});registerCoreViews(editor);const projection=editor.createView('minimap-browser');
    const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:fixed;left:20px;top:20px;width:1000px;height:700px;padding:0;background:#ddd';document.body.append(host);
    const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);const page=editor.mounts.get(Object.values(projection.state.nodes).find(node=>node.payload.id==='page').key).root;page.style.cssText+='width:900px;height:560px;margin:30px;';
    const first=Object.values(projection.state.nodes).find(node=>node.payload.id==='p0');editor.find.open(first.key);editor.find.setQuery('Needle');await editor.find.flush();
    window.minimapCheck={editor,projection,host,page,dispose};await new Promise(resolve=>setTimeout(resolve,250));
  })()`);
  const opened = await evaluate(`(()=>{const rail=document.querySelector('[data-page-minimap]'),canvas=rail.querySelector('canvas'),page=minimapCheck.page,main=page.querySelector('.reactive-page__main'),note=page.querySelector('.reactive-relation--rightMargin'),source=minimapCheck.editor.mounts.get(Object.values(minimapCheck.projection.state.nodes).find(node=>node.payload.id==='p0').key).root,rr=rail.getBoundingClientRect(),mr=main.getBoundingClientRect(),pr=page.getBoundingClientRect(),sr=source.getBoundingClientRect(),find=document.querySelector('[data-document-find]'),fr=find.getBoundingClientRect(),bar=find.querySelector('.document-find__windowbar').getBoundingClientRect(),close=find.querySelector('[aria-label="Close Find"]').getBoundingClientRect();return{width:rr.width,height:rr.height,pageHeight:pr.height,pageScrollHeight:page.scrollHeight,rightOfMain:rr.left-mr.right,markers:rail.getAttribute('aria-label'),canvasPixels:[canvas.width,canvas.height],revision:minimapCheck.editor.repository.state.revision,active:minimapCheck.editor.find.state.active,noteGap:note.getBoundingClientRect().left-source.getBoundingClientRect().right,clickY:rr.top+((sr.top-pr.top+page.scrollTop)/Math.max(page.scrollHeight,pr.height)*rr.height),railTop:rr.top,find:{left:fr.left,top:fr.top,barX:bar.left+80,barY:bar.top+bar.height/2,closeRight:close.right,panelRight:fr.right}};})()`);
  assert.equal(opened.width, 20); assert.equal(opened.height, opened.pageHeight); assert.equal(opened.rightOfMain, 32); assert.match(opened.markers, /hidden/); assert.deepEqual(opened.canvasPixels, [40, Math.round(opened.height * 2)]); assert.ok(opened.noteGap >= 60); assert.equal(opened.active, -1);
  assert.ok(Math.abs(opened.find.closeRight - opened.find.panelRight) <= 2);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: opened.find.barX, y: opened.find.barY, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: opened.find.barX - 80, y: opened.find.barY + 30, button: "left", buttons: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: opened.find.barX - 80, y: opened.find.barY + 30, button: "left", buttons: 0, clickCount: 1 }, sessionId);
  const findMoved = await evaluate(`(()=>{const rect=document.querySelector('[data-document-find]').getBoundingClientRect();return{left:rect.left,top:rect.top,revision:minimapCheck.editor.repository.state.revision};})()`);
  assert.equal(findMoved.left, opened.find.left - 80); assert.equal(findMoved.top, opened.find.top + 30); assert.equal(findMoved.revision, opened.revision);
  const clickX = await evaluate("document.querySelector('[data-page-minimap]').getBoundingClientRect().left+10");
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickX, y: opened.clickY, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickX, y: opened.clickY, button: "left", buttons: 0, clickCount: 1 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  const clicked = await evaluate(`(()=>({active:minimapCheck.editor.find.state.active,revision:minimapCheck.editor.repository.state.revision}))()`);
  assert.equal(clicked.active, 0); assert.equal(clicked.revision, opened.revision);
  const thumbY = opened.railTop + (opened.pageHeight / opened.pageScrollHeight * opened.height) / 2;
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: clickX, y: thumbY, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: clickX, y: thumbY + 120, button: "left", buttons: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: clickX, y: thumbY + 120, button: "left", buttons: 0, clickCount: 1 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,100))");
  const scrolled = await evaluate(`(()=>({scrollTop:minimapCheck.page.scrollTop,revision:minimapCheck.editor.repository.state.revision}))()`);
  assert.ok(scrolled.scrollTop > 0); assert.equal(scrolled.revision, opened.revision);
  await send("Input.dispatchMouseEvent", { type: "mouseWheel", x: clickX, y: thumbY + 120, deltaX: 0, deltaY: 80 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,50))");
  const wheelScrolled = await evaluate(`(()=>({scrollTop:minimapCheck.page.scrollTop,revision:minimapCheck.editor.repository.state.revision}))()`);
  assert.ok(wheelScrolled.scrollTop > scrolled.scrollTop); assert.equal(wheelScrolled.revision, opened.revision);
  await evaluate("minimapCheck.page.scrollTop=0");
  await evaluate("minimapCheck.editor.minimap.configure({side:'left',blendMode:'source-over'});new Promise(resolve=>setTimeout(resolve,500))");
  const configured = await evaluate(`(()=>{const rail=document.querySelector('[data-page-minimap]'),main=minimapCheck.page.querySelector('.reactive-page__main'),rr=rail.getBoundingClientRect(),mr=main.getBoundingClientRect();return{side:rail.dataset.side,leftGap:mr.left-rr.right,blend:minimapCheck.editor.minimap.state.options.blendMode,inlineLeft:rail.style.left,revision:minimapCheck.editor.minimap.state.revision};})()`);
  assert.equal(configured.side, "left"); assert.equal(configured.leftGap, 32); assert.equal(configured.blend, "source-over");
  await evaluate("minimapCheck.page.style.height='620px';new Promise(resolve=>setTimeout(resolve,150))");
  assert.equal(await evaluate("document.querySelector('[data-page-minimap]').getBoundingClientRect().height"), 620);
  await evaluate("minimapCheck.editor.find.close(false);new Promise(resolve=>setTimeout(resolve,50))"); assert.equal(await evaluate("document.querySelector('[data-page-minimap]')"), null);
  console.log(JSON.stringify({ opened, findMoved, clicked, scrolled, wheelScrolled, configured, resizedHeight: 620, closeRemoved: true }, null, 2));
  await evaluate("minimapCheck.dispose();minimapCheck.editor.dispose();minimapCheck.host.remove()");
} finally {
  socket?.close(); if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once("exit", resolve)); chrome.kill("SIGKILL"); await exited; }
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
