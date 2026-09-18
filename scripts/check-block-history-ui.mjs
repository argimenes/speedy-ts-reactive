// Focused real-browser UI seam check. Start Vite first; no server/save mutation.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { isolatedBrowser } from './stage-c-gates/browser.mjs';
const browser = await isolatedBrowser();
const url = process.env.HISTORY_UI_URL ?? 'http://127.0.0.1:3000/pilot';
const wait = async (page, expression) => {
  for (let i = 0; i < 120; i++) {
    if (await page.evaluate(expression)) return;
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw Error(`UI condition timed out: ${expression}\n${await page.evaluate('document.body.innerText.slice(-3000)')}`);
};
try {
  const page = await browser.launch(); await page.navigate(url);
  await wait(page, 'document.querySelector("[data-block-id=standoff-1]")');
  const open = async () => {
    await page.evaluate(`document.querySelector('[data-block-id=standoff-1]').dispatchEvent(new MouseEvent('contextmenu',{button:2,bubbles:true,cancelable:true}))`);
    await wait(page, 'document.querySelector(".reactive-block-menu")');
    await page.evaluate(`[...document.querySelectorAll('.reactive-block-menu button')].find(b=>b.textContent==='History…').click()`);
    await wait(page, 'document.querySelector(".block-history-comparison-summary")');
  };
  await open();
  assert.equal(await page.evaluate('document.querySelectorAll("[data-history-revision]").length'), 1);
  await page.evaluate(`document.querySelector('[aria-label="Close Block history"]').click()`);
  await wait(page, '!document.querySelector(".block-history-panel")');
  const before = await page.evaluate(`document.querySelector('[data-block-id=standoff-1] [contenteditable=true]').textContent`);
  await page.evaluate(`(() => {
    const flow=document.querySelector('[data-block-id=standoff-1] [contenteditable=true]');
    flow.focus(); const range=document.createRange(); range.selectNodeContents(flow); range.collapse(false);
    const selection=document.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    flow.dispatchEvent(new InputEvent('beforeinput',{bubbles:true,cancelable:true,inputType:'insertText',data:' A recorded edit.'}));
  })()`);
  const after = await page.evaluate(`document.querySelector('[data-block-id=standoff-1] [contenteditable=true]').textContent`);
  assert.equal(after, before + ' A recorded edit.');
  await open();
  assert.equal(await page.evaluate('document.querySelectorAll("[data-history-revision]").length'), 2);
  await page.evaluate('document.querySelector("[data-history-revision]").click()');
  await wait(page, `document.querySelector('[aria-label="Selected historical state"] .block-history-text')?.textContent === ${JSON.stringify(before)}`);
  assert.equal(await page.evaluate(`document.querySelector('[aria-label="Latest recorded state"] .block-history-text').textContent`), after);
  assert.equal(await page.evaluate(`document.querySelector('[data-block-id=standoff-1] [contenteditable=true]').textContent`), after);
  assert.equal(await page.evaluate('document.querySelector(".block-history-panel iframe, .block-history-panel [contenteditable=true]") === null'), true);

  // Screenshot through a second CDP connection; the unchanged gate helper has no screenshot API.
  const endpoint = browser.diagnostics.stderr.match(/DevTools listening on (ws:\/\/\S+)/)[1];
  const socket = new WebSocket(endpoint); await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let sequence = 0; const pending = new Map();
  socket.addEventListener('message', event => { const data = JSON.parse(event.data); if (!pending.has(data.id)) return; const task = pending.get(data.id); pending.delete(data.id); data.error ? task.reject(Error(JSON.stringify(data.error))) : task.resolve(data.result); });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => { const id = ++sequence; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })); });
  try {
    const { targetInfos } = await send('Target.getTargets'), target = targetInfos.find(t => t.url === url);
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
    const screenshot = await send('Page.captureScreenshot', { format: 'png' }, sessionId);
    await writeFile('BLOCK_HISTORY_UI_PREVIEW.png', Buffer.from(screenshot.data, 'base64'));
  } finally { socket.close(); }
  const result = { passed: true, browser: page.version.product, baselineRevisions: 1, afterEditRevisions: 2, original: before, latest: after, historicalSelectionLeavesLiveDocumentUnchanged: true, screenshot: 'BLOCK_HISTORY_UI_PREVIEW.png' };
  await writeFile('BLOCK_HISTORY_UI_CHECK.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result, null, 2));
} finally { await browser.close(); }
