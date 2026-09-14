// Run against an already-running Vite server. Uses an isolated Chrome profile,
// an in-memory document and a stubbed read-only summary response.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";

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
  await send("Emulation.setDeviceMetricsOverride", { width: 375, height: 740, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send("Page.navigate", { url: process.env.BENCHMARK_URL ?? "http://localhost:3000/" }, sessionId);
  await evaluate("new Promise(resolve => setTimeout(resolve, 1200))");
  await evaluate(`(async () => {
    const { ReactiveEditor } = await import('/src/reactive-editor/editor.ts');
    const { registerCoreViews } = await import('/src/rendering/register-core-views.ts');
    const { ReactiveTreeView } = await import('/src/rendering/reactive-tree-view.tsx');
    const source = await (await fetch('/src/rendering/reactive-tree-view.tsx')).text();
    const webPath = source.split('"').find(part => part.startsWith('/node_modules/.vite/deps/solid-js_web.js'));
    const { render, createComponent } = await import(webPath);
    const originalFetch = window.fetch;
    window.fetch = async (input, options) => String(input).includes('/api/entities/summary')
      ? { ok: true, json: async () => ({ Success: true, Results: [{ id: 'alpha', name: 'Alpha', mentions: 8 }, { id: 'beta', name: 'Beta', mentions: 21 }] }) }
      : originalFetch(input, options);
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;inset:0;padding:30px;background:white;z-index:9000;overflow:auto';
    document.body.append(host);
    const editor = new ReactiveEditor({ type: 'document-block', children: [
      { id: 'a', type: 'standoff-editor-block', text: 'Alpha Beta', standoffProperties: [
        { id: 'alpha-ref', type: 'codex/entity-reference', value: 'alpha', start: 0, end: 4 },
        { id: 'beta-ref-1', type: 'codex/entity-reference', value: 'beta', start: 6, end: 9 },
      ] },
      { id: 'b', type: 'standoff-editor-block', text: 'Beta', standoffProperties: [
        { id: 'beta-ref-2', type: 'codex/entity-reference', value: 'beta', start: 0, end: 3 },
      ] },
    ] });
    registerCoreViews(editor);
    const projection = editor.createView('entity-list-browser');
    const dispose = render(() => createComponent(ReactiveTreeView, { editor, projection }), host);
    editor.installGateway(document);
    const node = name => Object.values(projection.state.nodes).find(item => item.payload.id === name);
    const mount = editor.mounts.get(node('a').key);
    mount.focus(); mount.restoreInlineSelection({ anchor: 0, head: 5 });
    window.entityListCheck = { editor, host, dispose, originalFetch, mount };
  })()`);
  const key = async (type, value, code, modifiers = 0, text = undefined) => send("Input.dispatchKeyEvent", { type, key: value, code, modifiers, ...(text ? { text } : {}) }, sessionId);
  await key("keyDown", ";", "Semicolon", 2); await key("keyUp", ";", "Semicolon", 2);
  await key("keyDown", "l", "KeyL", 0, "l"); await key("keyUp", "l", "KeyL");
  const opened = await evaluate(`new Promise(resolve => setTimeout(() => {
    const panel = document.querySelector('[aria-label="Entities in document"]');
    const rows = [...panel.querySelectorAll('tbody tr')]; const rect = panel.getBoundingClientRect();
    resolve({ names: rows.map(row => row.cells[0].textContent), graph: rows.map(row => row.cells[1].textContent), document: rows.map(row => row.cells[2].textContent), x: rect.x, right: rect.right, width: rect.width,
      point: (() => { const r = rows[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })() });
  }, 100))`);
  assert.deepEqual(opened.names, ["Beta", "Alpha"]); assert.deepEqual(opened.graph, ["21", "8"]); assert.deepEqual(opened.document, ["2", "1"]);
  assert.ok(opened.x >= 8 && opened.right <= 367 && opened.width <= 359, JSON.stringify(opened));
  await send("Input.dispatchMouseEvent", { type: "mouseMoved", ...opened.point, button: "none" }, sessionId);
  const highlight = await evaluate(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve({
    paths: [...document.querySelectorAll('path[data-property-type="editor/entity-list-preview"]')].length,
    fills: [...document.querySelectorAll('path[data-property-type="editor/entity-list-preview"]')].map(path => path.getAttribute('fill')),
    history: entityListCheck.editor.repository.canUndo(),
  }))))`);
  assert.ok(highlight.paths >= 2, JSON.stringify(highlight)); assert.ok(highlight.fills.every(fill => fill === "#ffe34d")); assert.equal(highlight.history, false);
  await key("keyDown", "Escape", "Escape"); await key("keyUp", "Escape", "Escape");
  const closed = await evaluate(`new Promise(resolve => setTimeout(() => resolve({
    open: entityListCheck.editor.entityList.state.open,
    panel: !!document.querySelector('[aria-label="Entities in document"]'),
    highlights: document.querySelectorAll('path[data-property-type="editor/entity-list-preview"]').length,
    focusRestored: document.activeElement === entityListCheck.mount.focusElement,
    selected: getSelection().toString(),
  }), 50))`);
  assert.deepEqual(closed, { open: false, panel: false, highlights: 0, focusRestored: true, selected: "Alpha" });
  console.log(JSON.stringify({ opened, highlight, closed }, null, 2));
  await evaluate("entityListCheck.dispose(); entityListCheck.editor.dispose(); entityListCheck.host.remove(); window.fetch = entityListCheck.originalFetch");
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once("exit", resolve)); chrome.kill("SIGKILL"); await exited;
  }
  chrome.stdin?.destroy(); chrome.stdout?.destroy(); chrome.stderr?.destroy();
  await rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
