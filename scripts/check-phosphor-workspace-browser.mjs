// Focused main-workspace launch, file association and on-disk round-trip check.
// Uses an isolated store and the real App; only Cavern startup is bypassed.
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { createServer } from "vite";

const store = await mkdtemp(path.join(tmpdir(), "phosphor-proof-")),
  profile = await mkdtemp(path.join(tmpdir(), "phosphor-browser-"));
await mkdir(path.join(store, "vault"));
await mkdir("artifacts/phosphor", { recursive: true });
const backend = spawn(
  process.execPath,
  ["scripts/native-production-test-host.mjs"],
  {
    env: {
      ...process.env,
      PROOF_ROOT: store,
      PROOF_PORT: "0",
      PROOF_SQLITE: "1",
    },
    stdio: ["ignore", "pipe", "inherit"],
  },
);
const port = await new Promise((resolve, reject) => {
  backend.stdout.once("data", (b) => resolve(JSON.parse(b.toString()).port));
  backend.once("error", reject);
});
process.env.PORT = String(port);
const vite = await createServer({
  plugins: [{
    name: "phosphor-workspace-proof",
    resolveId(id) { if (id === "/__phosphor-proof.js") return "\0phosphor-proof"; },
    load(id) { if (id === "\0phosphor-proof") return `
      import { render } from 'solid-js/web';
      import { createComponent } from 'solid-js';
      import App from '/src/App.tsx';
      import '/src/index.css';
      render(() => createComponent(App, { configuration: { features: { cavernStartup: false } } }), document.getElementById('root'));
    `; },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url !== '/__phosphor-workspace') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end(await server.transformIndexHtml(req.url, '<html><body><div id="root"></div><script type="module" src="/__phosphor-proof.js"></script></body></html>'));
      });
    },
  }],
  server: { host: "127.0.0.1", port: 0, hmr: false },
});
await vite.listen();
const chrome = spawn(
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  [
    "--headless=new",
    "--enable-unsafe-swiftshader",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    "--user-data-dir=" + profile,
    "about:blank",
  ],
);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let out = "";
    chrome.stderr.on("data", (b) => {
      out += b;
      const m = out.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    chrome.once("error", reject);
  });
  socket = new WebSocket(endpoint);
  await new Promise((r) => socket.addEventListener("open", r, { once: true }));
  let id = 0;
  const pending = new Map(),
    errors = [];
  socket.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.id) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      m.error ? p?.reject(m.error) : p?.resolve(m.result);
    }
    if (m.method === "Runtime.exceptionThrown")
      errors.push(m.params.exceptionDetails);
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      const timeout = setTimeout(() => { pending.delete(n); reject(Error('CDP timeout: ' + method)); }, 30000);
      pending.set(n, { resolve: value => { clearTimeout(timeout); resolve(value); }, reject: error => { clearTimeout(timeout); reject(error); } });
      socket.send(
        JSON.stringify({
          id: n,
          method,
          params,
          ...(sessionId ? { sessionId } : {}),
        }),
      );
    });
  const { targetId } = await send("Target.createTarget", {
    url: "about:blank",
  });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true }, sessionId);
  });
  const evaluate = async (expression) => {
    if (expression.includes("await ") && !expression.startsWith("(async()=>"))
      expression = "(async()=>{" + expression + "})()";
    const result = await send(
      "Runtime.evaluate",
      { expression, returnByValue: true, awaitPromise: true },
      sessionId,
    );
    if (result.exceptionDetails)
      throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send("Runtime.enable", {}, sessionId);
  await send("Page.enable", {}, sessionId);
  await send(
    "Emulation.setDeviceMetricsOverride",
    {
      width: 1536,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    },
    sessionId,
  );
  await send(
    "Page.navigate",
    { url: `http://127.0.0.1:${vite.httpServer.address().port}/phosphor` },
    sessionId,
  );
  await evaluate(
    `(async()=>{for(let i=0;i<400;i++){if(document.querySelector('.ph-cell'))return;await new Promise(r=>setTimeout(r,40));}throw Error('Phosphor did not mount: '+document.body.textContent.slice(0,1200))})()`,
  );

  const checks = [];
  const check = (name, value) => { assert.equal(value, true, name); checks.push(name); console.log('Passed: ' + name); };
  const wait = async expression => {
    for (let i = 0; i < 200; i++) {
      if (await evaluate(expression)) return;
      await new Promise(r => setTimeout(r, 50));
    }
    throw Error('Timed out: ' + expression + '\n' + JSON.stringify(await evaluate('document.body.innerText')) + '\n' + JSON.stringify(errors));
  };
  check('/phosphor retains the rain demo', await evaluate(`document.querySelector('.ph-cell-surface').textContent.includes('remembered city')`));
  const mainUrl = `http://127.0.0.1:${vite.httpServer.address().port}/__phosphor-workspace`;
  console.log('Navigate to fresh workspace');
  await send('Page.navigate', { url: mainUrl }, sessionId);
  await new Promise(r=>setTimeout(r,500));
  await wait(`document.querySelector('[data-system-menu-trigger=workspace]')`);
  await evaluate(`document.querySelector('[data-system-menu-trigger=workspace]').click()`);
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Open Phosphor')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Open Phosphor').click()`);
  await wait(`document.querySelectorAll('.ph-cell').length===960`);
  await evaluate(`window.root=document.querySelector('.phosphor');window.api=(await import('/src/features/phosphor/view.tsx')).phosphorPresentation(root);window.model=await import('/src/features/phosphor/model.ts');window.click=t=>[...root.querySelectorAll('button')].find(b=>b.textContent===t).click();window.field=(label,value)=>{const e=root.querySelector('[aria-label="'+label+'"]');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}`);
  check('workspace launcher opens a blank Screen', await evaluate(`api.read().text.trim()===''`));
  await evaluate(`click('WRITE');root.querySelector('textarea').focus()`);
  await send('Input.insertText', { text: 'Phosphor saved from Mutable' }, sessionId);
  check('workspace Screen accepts real keyboard input', await evaluate(`api.read().text.startsWith('Phosphor saved from Mutable')`));
  await evaluate(`api.commit(model.paint(api.read(),[{column:3,row:4}],'\uf813',model.ATTRIBUTES),'MouseText with display attributes');window.expected=api.read();click('File');field('Document folder','vault');field('Document filename','workspace.phosphor');click('Save .phosphor')`);
  await wait(`api.status().includes('Saved native Document')`);
  const expected = await evaluate('expected');
  check('MouseText remains a single original glyph', expected.text.includes('\uf813'));
  check('all three independent display attributes are saved', ['phosphor/inverse','phosphor/blink','phosphor/underline'].every(type=>expected.marks.some(mark=>mark.type===type)));
  const bytes = await (await import('node:fs/promises')).readFile(path.join(store,'vault/workspace.phosphor'),'utf8');
  check('Save .phosphor writes the native file to disk', bytes.includes('phosphor-screen-block'));
  await evaluate(`click('Close')`);
  await wait(`root.dataset.materialReady==='true'`);
  const { data } = await send('Page.captureScreenshot', {format:'png'}, sessionId);
  await writeFile('artifacts/phosphor/workspace-integration.png', Buffer.from(data,'base64'));

  // Navigation destroys the editor and its native session: reopening must read disk.
  console.log('Navigate to fresh workspace');
  await send('Page.navigate', { url: mainUrl }, sessionId);
  await new Promise(r=>setTimeout(r,500));
  await wait(`document.querySelector('[data-system-menu-trigger=workspace]')`);
  await evaluate(`document.querySelector('[data-system-menu-trigger=workspace]').click()`);
  await wait(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Open Phosphor')`);
  await evaluate(`[...document.querySelectorAll('button')].find(b=>b.textContent==='Open Phosphor').click()`);
  await wait(`document.querySelectorAll('.ph-cell').length===960`);
  await evaluate(`window.root=document.querySelector('.phosphor');window.click=t=>[...root.querySelectorAll('button')].find(b=>b.textContent===t).click();click('File');for(const [label,value] of [['Document folder','vault'],['Document filename','workspace.phosphor']]){const e=root.querySelector('[aria-label="'+label+'"]');e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}click('Open .phosphor')`);
  await wait(`document.querySelectorAll('.phosphor').length===2`);
  const reopened = await evaluate(`(async()=>{const {phosphorPresentation}=await import('/src/features/phosphor/view.tsx');return phosphorPresentation([...document.querySelectorAll('.phosphor')].find(r=>r!==root)).read()})()`);
  check('fresh Open .phosphor restores exact text, glyphs, attributes and Screen settings', isDeepStrictEqual(reopened, expected));

  console.log('Navigate to fresh workspace');
  await send('Page.navigate', { url: mainUrl }, sessionId);
  await new Promise(r=>setTimeout(r,500));
  await wait(`document.querySelector('[data-system-menu-trigger=workspace]')`);
  await evaluate(`document.querySelector('[data-system-menu-trigger=workspace]').click();[...document.querySelectorAll('button')].find(b=>b.textContent==='Open Document from Server…').click()`);
  await wait(`document.querySelector('[data-folder="vault"]')`);
  await evaluate(`document.querySelector('[data-folder="vault"]').click()`);
  await wait(`[...document.querySelectorAll('[role=option]')].some(e=>e.textContent.includes('workspace.phosphor'))`);
  await evaluate(`[...document.querySelectorAll('[role=option]')].find(e=>e.textContent.includes('workspace.phosphor')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await wait(`document.querySelectorAll('.ph-cell').length===960`);
  const associated = await evaluate(`(async()=>{const {phosphorPresentation}=await import('/src/features/phosphor/view.tsx');return phosphorPresentation(document.querySelector('.phosphor')).read()})()`);
  check('Mutable OS opens .phosphor files in Phosphor with exact saved content', isDeepStrictEqual(associated, expected));
  check('no uncaught browser exceptions', errors.length===0);
  await writeFile('artifacts/phosphor/workspace-integration-results.json', JSON.stringify({checks,errors},null,2));
  console.log(JSON.stringify({passed:checks.length}));
} finally {
  socket?.close();
  chrome.kill("SIGKILL");
  backend.kill("SIGKILL");
  vite.httpServer?.closeAllConnections();
  await vite.close();
  await new Promise((r) => setTimeout(r, 200));
  await rm(profile, { recursive: true, force: true });
  await rm(store, { recursive: true, force: true });
}
