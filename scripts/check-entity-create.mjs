// Run after npm run build, against Vite on BENCHMARK_URL (default :3000).
// Uses a real API with isolated in-memory SurrealDB; never writes user data.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

import express from "express";
import cors from "cors";
import { Surreal } from "surrealdb";
import { surrealdbNodeEngines } from "@surrealdb/node";
import { createEntitySearchRouter } from "../dist/server/entity-search.js";
const db = new Surreal({ engines: surrealdbNodeEngines() });
await db.connect("mem://"); await db.use({ namespace: "test", database: "entity_creation" });
const app = express(); app.use(cors()); app.use(express.json()); app.use('/api', createEntitySearchRouter(() => db));
const server = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
const apiBase = `http://127.0.0.1:${server.address().port}`;
const profile = await mkdtemp(path.join(tmpdir(), "speedy-entity-list-"));
const chrome = spawn(process.env.CHROME_BIN ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", [
  "--headless=new", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
]);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    chrome.stderr.on("data", chunk => { output += chunk; const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/); if (match) resolve(match[1]); });
    chrome.once("error", reject);
    setTimeout(() => reject(new Error("Chrome startup timeout")), 15000).unref();
  });
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", event => {
    const response = JSON.parse(event.data), task = pending.get(response.id);
    if (!task) return;
    pending.delete(response.id);
    response.error ? task.reject(new Error(JSON.stringify(response.error))) : task.resolve(response.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id, timer = setTimeout(() => { pending.delete(requestId); reject(new Error(`Timed out: ${method}`)); }, 30000);
    pending.set(requestId, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };

  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: process.env.BENCHMARK_URL ?? "http://localhost:3000/" }, sessionId);
  await evaluate("new Promise(resolve => setTimeout(resolve, 1200))");
  await evaluate(`(async () => {
    const { ReactiveEditor } = await import('/src/reactive-editor/editor.ts');
    const { registerApplicationViews } = await import('/src/application/features.ts');
    const { ReactiveTreeView } = await import('/src/rendering/reactive-tree-view.tsx');
    const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
    const webPath = source.split('"').find(part => part.includes('/solid-js_web.js'));
    const { render, createComponent } = await import(webPath);
    const originalFetch = window.fetch;
    window.fetch = (input, options) => {
      const url = String(input);
      return originalFetch(url.startsWith('/api/entities') || url.startsWith('/api/findAgents') ? ${JSON.stringify(apiBase)} + url : input, options);
    };
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;padding:30px;background:white;z-index:9000;overflow:auto';
    document.body.append(host);
    const editor = new ReactiveEditor({ type:'document-block', children:[{id:'text',type:'standoff-editor-block',text:'Ariadne Test Entity'}] });
    registerApplicationViews(editor);
    const projection = editor.createView('entity-create-browser');
    const dispose = render(() => createComponent(ReactiveTreeView, {editor, projection}), host);
    editor.installGateway(document);
    const node = Object.values(projection.state.nodes).find(item => item.payload.id === 'text');
    const mount = editor.mounts.get(node.key);
    mount.focus(); mount.restoreInlineSelection({anchor:0,head:19});
    window.entityCreateCheck = {editor, host, dispose, originalFetch, mount};
  })()`);
  const key = async (type, value, code, modifiers = 0, text = undefined) => send("Input.dispatchKeyEvent", { type, key:value, code, modifiers, ...(text ? {text} : {}) }, sessionId);
  await key('keyDown',';','Semicolon',2); await key('keyUp',';','Semicolon',2);
  await key('keyDown','r','KeyR',0,'r'); await key('keyUp','r','KeyR');
  let point;
  for (let i=0;i<40&&!point;i++) {
    point = await evaluate(`new Promise(resolve => setTimeout(() => {
      const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Create entity “Ariadne Test Entity”');
      const r=b?.getBoundingClientRect(); resolve(r?{x:r.x+r.width/2,y:r.y+r.height/2}:null);
    },100))`);
  }
  assert.ok(point, 'Create button appears after real database reports no matches');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point},sessionId);
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point},sessionId);
  let result;
  for (let i=0;i<40;i++) {
    result=await evaluate(`new Promise(resolve=>setTimeout(()=>resolve({
      open:!!document.querySelector('[aria-label="Search entities"][role="dialog"]'),
      property:entityCreateCheck.editor.encodeDocument().children[0].standoffProperties?.[0],
      focused:document.activeElement===entityCreateCheck.mount.focusElement
    }),100))`);
    if(!result.open)break;
  }
  assert.equal(result.open,false); assert.equal(result.focused,true);
  assert.equal(result.property?.type,'codex/entity-reference');
  assert.equal(result.property?.metadata.entityName,'Ariadne Test Entity');
  const [entities]=await db.query('SELECT * FROM Agent');
  assert.equal(entities.length,1); assert.equal(entities[0].name,'Ariadne Test Entity');
  assert.equal(String(entities[0].id.id),result.property.value);
  assert.deepEqual(await evaluate(`(()=>{const e=entityCreateCheck.editor;e.repository.undo();const removed=!e.encodeDocument().children[0].standoffProperties;e.repository.redo();return {removed,value:e.encodeDocument().children[0].standoffProperties[0].value}})()`),{removed:true,value:result.property.value});
  console.log(JSON.stringify({passed:true,checks:['real API empty-name lookup','visible Create action','pointer creation in SurrealDB','immediate native entity-reference link','editor focus restoration','annotation Undo/Redo']},null,2));
  await evaluate('entityCreateCheck.dispose();entityCreateCheck.editor.dispose();entityCreateCheck.host.remove();window.fetch=entityCreateCheck.originalFetch');
} finally {
  if (socket && socket.readyState !== WebSocket.CLOSED) {
    const closed = new Promise(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.close(); await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 1000))]);
  }
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once("exit", resolve)); chrome.kill("SIGKILL"); await exited;
  }
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy();
  await new Promise(resolve => server.close(resolve)); await db.close();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
