// Run against an already-running Vite server. Uses an isolated Chrome profile
// and an in-memory Block tree; it does not save or call the document API.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const profile = await mkdtemp(path.join(tmpdir(), "speedy-window-icon-"));
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
  await send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 720, deviceScaleFactor: 2, mobile: false }, sessionId);
  await send("Page.navigate", { url: process.env.BENCHMARK_URL ?? "http://localhost:3000/" }, sessionId); await evaluate("new Promise(resolve => setTimeout(resolve, 1000))");
  await evaluate(`(async()=>{
    const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
    const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text();const webPath=source.split('"').find(part=>part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));const {render,createComponent}=await import(webPath);
    const editor=new ReactiveEditor({id:'window',type:'document-window-block',metadata:{title:'Browser notes',position:{x:40,y:45},size:{w:840,h:500},state:'normal',zIndex:2},children:[{id:'doc',type:'document-block',children:[{id:'page',type:'page-block',children:[{id:'text',type:'plain-text-block',text:'Browser selection check'},{id:'source',type:'standoff-editor-block',text:'Margin source',relation:{leftMargin:{id:'margin',type:'left-margin-block',children:[{id:'note',type:'plain-text-block',text:'Browser margin note'}]}}}]}]}]});registerCoreViews(editor);const projection=editor.createView('window-icon-browser');
    const host=document.createElement('div');host.className='workspace-demo';host.style.cssText='position:relative;width:1000px;height:720px;padding:0';document.body.replaceChildren(host);const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);
    const text=Object.values(projection.state.nodes).find(node=>node.payload.id==='text'),textarea=editor.mounts.get(text.key).focusElement;textarea.focus();textarea.setSelectionRange(2,9,'forward');window.windowIconCheck={editor,projection,host,dispose};
  })()`);
  const minimize = await evaluate(`(()=>{const button=document.querySelector('[aria-label="Minimize window"]'),r=button.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: minimize.x, y: minimize.y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: minimize.x, y: minimize.y, button: "left", buttons: 0, clickCount: 1 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,50))");
  const minimized = await evaluate(`(()=>{const icon=document.querySelector('[data-window-icon]'),r=icon.getBoundingClientRect(),win=Object.values(windowIconCheck.projection.state.nodes).find(node=>node.payload.id==='window'),position=win.payload.metadata.position;return{kind:icon.dataset.iconKind,label:icon.getAttribute('aria-label'),width:r.width,height:r.height,childrenMounted:!!document.querySelector('textarea'),state:win.payload.metadata.state,position:{x:position.x,y:position.y},revision:windowIconCheck.editor.repository.state.revision,x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert.equal(minimized.kind, "document"); assert.equal(minimized.label, "Restore Browser notes"); assert.equal(minimized.width, 96); assert.ok(minimized.height >= 92); assert.equal(minimized.childrenMounted, false); assert.equal(minimized.state, "minimized"); assert.equal(minimized.revision, 1);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: minimized.x, y: minimized.y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: minimized.x + 70, y: minimized.y + 35, button: "left", buttons: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: minimized.x + 70, y: minimized.y + 35, button: "left", buttons: 0, clickCount: 1 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,50))");
  const moved = await evaluate(`(()=>{const icon=document.querySelector('[data-window-icon]'),r=icon.getBoundingClientRect(),win=Object.values(windowIconCheck.projection.state.nodes).find(node=>node.payload.id==='window'),position=win.payload.metadata.position;return{exists:!!icon,position:{x:position.x,y:position.y},revision:windowIconCheck.editor.repository.state.revision,x:r.left+r.width/2,y:r.top+r.height/2};})()`);
  assert.equal(moved.exists, true); assert.deepEqual(moved.position, { x: 110, y: 80 }); assert.equal(moved.revision, 2);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: moved.x, y: moved.y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: moved.x, y: moved.y, button: "left", buttons: 0, clickCount: 1 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,80))");
  const restored = await evaluate(`(()=>{const root=document.querySelector('[data-block-id="window"]'),textarea=document.querySelector('textarea'),win=Object.values(windowIconCheck.projection.state.nodes).find(node=>node.payload.id==='window');return{icon:!!document.querySelector('[data-window-icon]'),state:win.payload.metadata.state,width:root.getBoundingClientRect().width,height:root.getBoundingClientRect().height,transform:root.style.transform,selection:[textarea.selectionStart,textarea.selectionEnd],focused:document.activeElement===textarea,revision:windowIconCheck.editor.repository.state.revision};})()`);
  assert.equal(restored.icon, false); assert.equal(restored.state, "normal"); assert.equal(restored.width, 840); assert.equal(restored.height, 500); assert.equal(restored.transform, "translate(110px, 80px)"); assert.deepEqual(restored.selection, [2, 9]); assert.equal(restored.focused, true); assert.equal(restored.revision, 3);
  await evaluate("windowIconCheck.editor.repository.undo();new Promise(resolve=>setTimeout(resolve,30))"); assert.equal(await evaluate("!!document.querySelector('[data-window-icon]')"), true);
  await evaluate("windowIconCheck.editor.repository.redo();new Promise(resolve=>setTimeout(resolve,30))"); assert.equal(await evaluate("!!document.querySelector('[data-window-icon]')"), false);
  const resize = await evaluate(`(()=>{const handle=document.querySelector('.reactive-window__resize'),r=handle.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2,revision:windowIconCheck.editor.repository.state.revision};})()`);
  await send("Input.dispatchMouseEvent", { type: "mousePressed", x: resize.x, y: resize.y, button: "left", buttons: 1, clickCount: 1 }, sessionId);
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: resize.x - 150, y: resize.y - 100, button: "left", buttons: 1 }, sessionId);
  const preview = await evaluate(`(()=>{const root=document.querySelector('[data-block-id="window"]'),win=Object.values(windowIconCheck.projection.state.nodes).find(node=>node.payload.id==='window'),size=win.payload.metadata.size;return{width:root.getBoundingClientRect().width,height:root.getBoundingClientRect().height,stored:{w:size.w,h:size.h},revision:windowIconCheck.editor.repository.state.revision};})()`);
  assert.equal(preview.width, 690); assert.equal(preview.height, 400); assert.deepEqual(preview.stored, { w: 840, h: 500 }); assert.equal(preview.revision, resize.revision);
  await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: resize.x - 150, y: resize.y - 100, button: "left", buttons: 0, clickCount: 1 }, sessionId); await evaluate("new Promise(resolve=>setTimeout(resolve,120))");
  const resized = await evaluate(`(()=>{const root=document.querySelector('[data-block-id="window"]'),win=Object.values(windowIconCheck.projection.state.nodes).find(node=>node.payload.id==='window'),size=win.payload.metadata.size,button=[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='Margins (1)');return{width:root.getBoundingClientRect().width,height:root.getBoundingClientRect().height,stored:{w:size.w,h:size.h},revision:windowIconCheck.editor.repository.state.revision,marginsCollapsed:root.classList.contains('reactive-window--margins-collapsed'),marginButton:!!button};})()`);
  assert.equal(resized.width, 690); assert.equal(resized.height, 400); assert.deepEqual(resized.stored, { w: 690, h: 400 }); assert.equal(resized.revision, resize.revision + 1); assert.equal(resized.marginsCollapsed, true); assert.equal(resized.marginButton, true);
  await evaluate(`[...document.querySelectorAll('button')].find(item=>item.textContent.trim()==='Margins (1)').click();new Promise(resolve=>setTimeout(resolve,50))`);
  const drawer = await evaluate(`(()=>({open:!!document.querySelector('.reactive-window__margin-drawer'),items:document.querySelectorAll('[data-margin-drawer-item]').length,noteValue:document.querySelector('[data-block-id="note"] textarea')?.value,revision:windowIconCheck.editor.repository.state.revision}))()`);
  assert.equal(drawer.open, true); assert.equal(drawer.items, 1); assert.equal(drawer.noteValue, "Browser margin note"); assert.equal(drawer.revision, resized.revision);
  await evaluate(`document.querySelector('[aria-label="Close margins"]').click();windowIconCheck.editor.repository.undo();new Promise(resolve=>setTimeout(resolve,120))`);
  const resizeUndone = await evaluate(`(()=>{const root=document.querySelector('[data-block-id="window"]'),win=Object.values(windowIconCheck.projection.state.nodes).find(node=>node.payload.id==='window'),size=win.payload.metadata.size;return{width:root.getBoundingClientRect().width,height:root.getBoundingClientRect().height,stored:{w:size.w,h:size.h},drawer:!!document.querySelector('.reactive-window__margin-drawer')};})()`);
  assert.equal(resizeUndone.width, 840); assert.equal(resizeUndone.height, 500); assert.deepEqual(resizeUndone.stored, { w: 840, h: 500 }); assert.equal(resizeUndone.drawer, false);
  console.log(JSON.stringify({ minimized, moved, restored, undoRedo: true, preview, resized, drawer, resizeUndone }, null, 2));
  await evaluate("windowIconCheck.dispose();windowIconCheck.editor.dispose();windowIconCheck.host.remove()");
} finally {
  socket?.close(); if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once("exit", resolve)); chrome.kill("SIGKILL"); await exited; }
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
