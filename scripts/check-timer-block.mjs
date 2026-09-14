// Run against an already-running Vite server. Uses an isolated Chrome profile
// and an in-memory document; it does not save or call the document API.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

const profile = await mkdtemp(path.join(tmpdir(), "speedy-timer-"));
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
  await send("Emulation.setDeviceMetricsOverride", { width: 900, height: 700, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: process.env.BENCHMARK_URL ?? "http://localhost:3000/" }, sessionId); await evaluate("new Promise(resolve => setTimeout(resolve, 1200))");
  await evaluate(`(async()=>{
    const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts'); const {registerCoreViews}=await import('/src/rendering/register-core-views.ts'); const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
    const source=await(await fetch('/src/rendering/reactive-tree-view.tsx')).text(); const webPath=source.split('"').find(part=>part.startsWith('/node_modules/.vite/deps/solid-js_web.js')); const {render,createComponent}=await import(webPath);
    const host=document.createElement('div');host.style.cssText='position:fixed;inset:0;padding:40px;background:white;z-index:9000';document.body.append(host);
    const editor=new ReactiveEditor({type:'document-block',children:[{id:'text',type:'standoff-editor-block',text:'Work session'}]});registerCoreViews(editor);const projection=editor.createView('timer-browser');
    const dispose=render(()=>createComponent(ReactiveTreeView,{editor,projection}),host);editor.installGateway(document);const text=Object.values(projection.state.nodes).find(node=>node.payload.id==='text');editor.mounts.get(text.key).focus();
    window.timerCheck={editor,host,dispose,projection};
  })()`);
  const key = async (type, value, code, modifiers = 0, text) => send("Input.dispatchKeyEvent", { type, key: value, code, modifiers, ...(text ? { text } : {}) }, sessionId);
  await key("keyDown", ";", "Semicolon", 2); await key("keyUp", ";", "Semicolon", 2); await key("keyDown", "t", "KeyT", 0, "t"); await key("keyUp", "t", "KeyT");
  const opened = await evaluate(`new Promise(resolve=>setTimeout(()=>{const timer=document.querySelector('.reactive-timer'),blocks=timerCheck.editor.encodeDocument().children;resolve({types:blocks.map(block=>block.type),display:timer.querySelector('output').textContent,width:timer.getBoundingClientRect().width,focused:document.activeElement===timer});},80))`);
  assert.deepEqual(opened.types, ["standoff-editor-block", "timer-block"]); assert.equal(opened.display, "05:00"); assert.equal(opened.width, 260); assert.equal(opened.focused, true);
  await evaluate(`(()=>{const input=document.querySelector('[aria-label="Timer duration in minutes and seconds"]');input.value='00:02';input.dispatchEvent(new InputEvent('input',{bubbles:true}));[...document.querySelectorAll('.reactive-timer button')].find(button=>button.textContent==='Set').click();})()`);
  const startPoint = await evaluate(`(()=>{const button=[...document.querySelectorAll('.reactive-timer button')].find(button=>button.textContent==='Start'),r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  for (const type of ["mousePressed", "mouseReleased"]) await send("Input.dispatchMouseEvent", { type, ...startPoint, button: "left", buttons: type === "mousePressed" ? 1 : 0, clickCount: 1 }, sessionId);
  const startRevision = await evaluate("timerCheck.editor.repository.state.revision"); await evaluate("new Promise(resolve=>setTimeout(resolve,2200))");
  const completed = await evaluate(`(()=>({display:document.querySelector('.reactive-timer output').textContent,done:document.querySelector('.reactive-timer').textContent.includes('Time’s up'),revision:timerCheck.editor.repository.state.revision,payload:timerCheck.editor.encodeDocument().children[1].timer}))()`);
  assert.equal(completed.display, "00:00"); assert.equal(completed.done, true); assert.equal(completed.revision, startRevision); assert.equal(completed.payload.mode, "running");
  await evaluate("[...document.querySelectorAll('.reactive-timer button')].find(button=>button.textContent==='Done').click()"); await evaluate("Promise.resolve()");
  assert.deepEqual(await evaluate("timerCheck.editor.encodeDocument().children.map(block=>block.type)"), ["standoff-editor-block"]);
  await evaluate("timerCheck.editor.repository.undo()"); assert.equal(await evaluate("document.querySelector('.reactive-timer').textContent.includes('Time’s up')"), true);
  console.log(JSON.stringify({ opened, completed, doneRemoval: true, undo: true }, null, 2));
  await evaluate("timerCheck.dispose();timerCheck.editor.dispose();timerCheck.host.remove()");
} finally {
  socket?.close(); if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) { const exited = new Promise(resolve => chrome.once("exit", resolve)); chrome.kill("SIGKILL"); await exited; }
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy(); await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
