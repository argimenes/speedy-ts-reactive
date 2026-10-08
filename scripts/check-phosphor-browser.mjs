// Focused Phosphor acceptance, using only an isolated native store.
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
      pending.set(n, { resolve, reject });
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
    { width: 1536, height: 1100, deviceScaleFactor: 1, mobile: false },
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
  await evaluate(
    `window.root=document.querySelector('.phosphor');window.api=(await import('/src/features/phosphor/view.tsx')).phosphorPresentation(root);window.model=await import('/src/features/phosphor/model.ts');window.input=root.querySelector('textarea');window.click=t=>{const b=[...root.querySelectorAll('button')].find(b=>b.textContent===t||b.getAttribute('aria-label')===t);if(!b)throw Error('Button '+t);b.click()};window.wait=async f=>{for(let i=0;i<200;i++){if(f())return;await new Promise(r=>setTimeout(r,30));}throw Error('Condition timed out')};`,
  );
  const checks = [];
  const check = (name, value) => {
    assert.equal(value, true, name);
    checks.push(name);
    console.log("Passed: " + name);
  };
  check(
    "40 × 24 native Screen mounts",
    await evaluate(
      `api.read().settings.columns===40&&root.querySelectorAll('.ph-cell').length===960`,
    ),
  );
  await evaluate(`await wait(()=>root.dataset.materialReady==='true')`);
  const shot = async (name) => {
    const { data } = await send(
      "Page.captureScreenshot",
      { format: "png" },
      sessionId,
    );
    await writeFile(
      "artifacts/phosphor/" + name + ".png",
      Buffer.from(data, "base64"),
    );
  };
  await evaluate("document.fonts.ready");
  await shot("01-amber-scene");
  await evaluate(`click('WRITE');input.focus();`);
  await send("Input.insertText", { text: "Hello" }, sessionId);
  check(
    "real input edits native characters",
    await evaluate(`api.read().text.startsWith('Hello')`),
  );
  await evaluate(`api.undo()`);
  check(
    "Ink Undo restores previous text",
    await evaluate(`!api.read().text.startsWith('Hello')`),
  );
  await evaluate(`api.redo()`);
  check(
    "Ink Redo restores text",
    await evaluate(`api.read().text.startsWith('Hello')`),
  );
  await evaluate(`click('DRAW');click('Pencil');window.before=api.read().text`);
  const point = await evaluate(
    `(()=>{const r=root.querySelector('.ph-cell-surface').getBoundingClientRect(),c=root.querySelector('.ph-cell').getBoundingClientRect();return {x:r.left+c.width*4.5,y:r.top+c.height*2.5}})()`,
  );
  await send(
    "Input.dispatchMouseEvent",
    { type: "mouseMoved", ...point },
    sessionId,
  );
  await send(
    "Input.dispatchMouseEvent",
    { type: "mousePressed", button: "left", clickCount: 1, ...point },
    sessionId,
  );
  await send(
    "Input.dispatchMouseEvent",
    { type: "mouseReleased", button: "left", clickCount: 1, ...point },
    sessionId,
  );
  check(
    "real pointer maps to exact cell",
    await evaluate(`Array.from(api.read().text)[2*41+4]==='*'`),
  );
  await evaluate(`api.undo()`);
  check("one stroke is one undo", await evaluate(`api.read().text===before`));
  await evaluate(`api.redo()`);
  const gesture = async (tool, from, to = from) => {
    await evaluate(`click(${JSON.stringify(tool)})`);
    const points = await evaluate(
      `(()=>{const r=root.querySelector('.ph-cell-surface').getBoundingClientRect(),c=root.querySelector('.ph-cell').getBoundingClientRect();return ${JSON.stringify([from, to])}.map(([x,y])=>({x:r.left+c.width*(x+.5),y:r.top+c.height*(y+.5)}))})()`,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mousePressed", button: "left", clickCount: 1, ...points[0] },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseMoved", button: "left", buttons: 1, ...points[1] },
      sessionId,
    );
    await send(
      "Input.dispatchMouseEvent",
      { type: "mouseReleased", button: "left", clickCount: 1, ...points[1] },
      sessionId,
    );
  };
  await evaluate(`click('Glyph #')`);
  await gesture("Line", [1, 20], [8, 20]);
  await gesture("Rectangle", [10, 20], [15, 22]);
  check(
    "Line and Rectangle draw exact cell outlines",
    await evaluate(
      `api.read().text.split('\\n')[20].slice(1,9)==='########'&&api.read().text.split('\\n')[21].slice(10,16)==='#    #'`,
    ),
  );
  await gesture("Pick", [1, 20]);
  check(
    "Pick recovers glyph",
    await evaluate(`root.querySelector('.ph-glyph-preview').textContent==='#'`),
  );
  await gesture("Select", [1, 20], [8, 20]);
  await evaluate(`click('Copy')`);
  await gesture("Stamp", [1, 21]);
  check(
    "rectangular copy and Stamp preserve shape",
    await evaluate(`api.read().text.split('\\n')[21].slice(1,9)==='########'`),
  );
  await gesture("Select", [1, 21], [8, 21]);
  await gesture("Move", [1, 21], [1, 22]);
  check(
    "Move clears source and preserves destination",
    await evaluate(
      `api.read().text.split('\\n')[21].slice(1,9)==='        '&&api.read().text.split('\\n')[22].slice(1,9)==='########'`,
    ),
  );
  await evaluate(`click('Apple II')`);
  check(
    "all 32 MouseText codes plus cursor in picker",
    await evaluate(
      `root.querySelectorAll('.ph-characters button').length===33`,
    ),
  );
  await evaluate(`click('Running man, left · $46')`);
  await gesture("Pencil", [20, 23]);
  await gesture("Select", [20, 23]);
  await evaluate(`click('Copy')`);
  await gesture("Stamp", [22, 23]);
  check(
    "Apple supplementary glyph remains one cell through clipboard",
    await evaluate(
      `Array.from(api.read().text)[23*41+20]===String.fromCodePoint(0x1fbb2)&&Array.from(api.read().text)[23*41+22]===String.fromCodePoint(0x1fbb2)`,
    ),
  );
  await shot("02-mousetext");
  check(
    "bitmap fonts use original cell advances",
    await evaluate(
      `(()=>{const c=document.createElement('canvas').getContext('2d');c.font='16px "Phosphor Apple 40"';return c.measureText('A').width===14})()`,
    ),
  );
  await gesture("Select", [1, 22], [8, 22]);
  await evaluate(
    `window.setField=(label,value)=>{const i=root.querySelector('[aria-label="'+label+'"]');i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}))};setField('Tag name','rain-scene');click('Apply tag');`,
  );
  check(
    "invisible tag has native cell anchors",
    await evaluate(
      `api.read().marks.some(m=>m.type===model.TAG&&m.start===22*41+1&&m.end===22*41+8)&&root.querySelector('[aria-label="Tag display"]').value==='invisible'`,
    ),
  );
  await evaluate(`window.saveNotice=await api.save('vault','rain.ink')`);
  check(
    "save refreshes native Cavern",
    await evaluate(`!saveNotice.includes('unavailable')`),
  );
  await evaluate(
    `window.entity=await api.createEntity('The Waste Land');window.results=await api.searchEntities('The Waste Land')`,
  );
  check(
    "canonical SQLite entity creation and search",
    await evaluate(`results.some(e=>e.id===entity.id)`),
  );
  await evaluate(
    `api.commit({...api.read(),marks:[...api.read().marks,{id:crypto.randomUUID(),type:model.ENTITY,value:entity.id,metadata:{entityName:entity.name},start:22*41+1,end:22*41+8}]},'Link canonical entity');window.saved=JSON.stringify(api.read());await api.save('vault','rain.ink')`,
  );
  check(
    "native .ink save finishes",
    await evaluate(`api.status().startsWith('Saved')`),
  );
  await evaluate(
    `click('File');click('Letter');await wait(()=>document.querySelectorAll('.phosphor').length===2)`,
  );
  check(
    "new work preserves existing screen",
    await evaluate(`JSON.stringify(api.read())===saved`),
  );
  await evaluate(
    `window.letterRoot=[...document.querySelectorAll('.phosphor')].find(r=>r!==root);window.letter=(await import('/src/features/phosphor/view.tsx')).phosphorPresentation(letterRoot)`,
  );
  check(
    "letter uses native prose with vertical scrolling",
    await evaluate(
      `letter.read().settings.columns===80&&letter.read().settings.scroll&&letter.read().settings.layout==='prose'`,
    ),
  );
  await evaluate(
    `window.letterInput=letterRoot.querySelector('textarea');letterInput.focus();window.lclick=t=>[...letterRoot.querySelectorAll('button')].find(b=>b.textContent===t).click();window.lfield=(label,value)=>{const i=letterRoot.querySelector('[aria-label="'+label+'"]');i.value=value;i.dispatchEvent(new Event('input',{bubbles:true}))}`,
  );
  await send("Input.insertText", { text: "Notes: " }, sessionId);
  check(
    "letter inserts ordinary text without losing existing prose",
    await evaluate(`letter.read().text.startsWith('Notes: Dear friend,')`),
  );
  await evaluate(
    `letterInput.setSelectionRange(0,5);letterInput.dispatchEvent(new Event('select',{bubbles:true}));letterRoot.querySelector('.ph-cell-settings input').click();window.clipboard=new DataTransfer();letterInput.dispatchEvent(new ClipboardEvent('copy',{clipboardData:clipboard,bubbles:true,cancelable:true}));letterInput.setSelectionRange(letterInput.value.length,letterInput.value.length);letterInput.dispatchEvent(new Event('select',{bubbles:true}));letterInput.dispatchEvent(new ClipboardEvent('paste',{clipboardData:clipboard,bubbles:true,cancelable:true}));`,
  );
  check(
    "linear clipboard preserves text and authored attribute",
    await evaluate(
      `letter.read().text.endsWith('Notes')&&letter.read().marks.some(m=>m.type===model.ATTRIBUTES[0]&&m.end===Array.from(letter.read().text).length-1)`,
    ),
  );
  await evaluate(
    `lclick('Find');lfield('Find text','friend');lfield('Replacement text','writer');lclick('Find next');lclick('Replace')`,
  );
  check(
    "prose Find and Replace edits the selected match",
    await evaluate(
      `letter.read().text.includes('Dear writer,')&&!letter.read().text.includes('Dear friend,')`,
    ),
  );
  await evaluate(`window.savedLetter=JSON.stringify(letter.read())`);
  await evaluate(
    `await letter.save('vault','letter.ink');await api.open('vault','rain.ink');await wait(()=>document.querySelectorAll('.phosphor').length===3)`,
  );
  check(
    "Open preserves exact geometry and text",
    await evaluate(
      `(async()=>{const m=await import('/src/features/phosphor/view.tsx');return [...document.querySelectorAll('.phosphor')].filter(r=>r!==root&&r!==letterRoot).every(r=>JSON.stringify(m.phosphorPresentation(r).read())===saved)})()`,
    ),
  );
  await send(
    "Emulation.setEmulatedMedia",
    { features: [{ name: "forced-colors", value: "active" }] },
    sessionId,
  );
  await evaluate(`await wait(()=>root.dataset.materialReady==='false')`);
  check(
    "forced colours keeps editor mounted",
    await evaluate(`input.isConnected&&JSON.stringify(api.read())===saved`),
  );
  const expected = await evaluate("saved"),
    expectedLetter = await evaluate("savedLetter");
  const loaded = new Promise((resolve) => {
    const onMessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.method === "Page.loadEventFired" && m.sessionId === sessionId) {
        socket.removeEventListener("message", onMessage);
        resolve();
      }
    };
    socket.addEventListener("message", onMessage);
  });
  await send("Page.reload", {}, sessionId);
  await loaded;
  await evaluate(
    `(async()=>{for(let i=0;i<300;i++){const root=document.querySelector('.phosphor');if(root&&(await import('/src/features/phosphor/view.tsx')).phosphorPresentation(root))return;await new Promise(r=>setTimeout(r,40));}throw Error('Reload failed')})()`,
  );
  await evaluate(
    `window.root=document.querySelector('.phosphor');window.api=(await import('/src/features/phosphor/view.tsx')).phosphorPresentation(root);await api.open('vault','rain.ink');await api.open('vault','letter.ink')`,
  );
  const reopened = await evaluate(
    `(async()=>{const m=await import('/src/features/phosphor/view.tsx');return [...document.querySelectorAll('.phosphor')].map(r=>m.phosphorPresentation(r).read())})()`,
  );
  check(
    "fresh browser reload reads the saved file with exact semantics",
    reopened.some((data) => isDeepStrictEqual(data, JSON.parse(expected))),
  );
  check(
    "fresh reopen retains prose and clipboard attributes",
    reopened.some((data) =>
      isDeepStrictEqual(data, JSON.parse(expectedLetter)),
    ),
  );
  check("no uncaught browser exceptions", errors.length === 0);
  await writeFile(
    "artifacts/phosphor/browser-results.json",
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      passed: checks.length,
      url: "http://localhost:3000/phosphor",
    }),
  );
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
