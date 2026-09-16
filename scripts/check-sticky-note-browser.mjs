// Run against Vite or the built app. Uses an isolated Chrome profile and never saves.
// Node 22+; optional CHROME_BIN and STICKY_NOTE_URL environment variables.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const profile = await mkdtemp(path.join(tmpdir(), 'speedy-sticky-check-'));
const chrome = spawn(process.env.CHROME_BIN ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank',
]);
let socket;
try {
  const endpoint = await new Promise((resolve, reject) => {
    let output = '';
    chrome.stderr.on('data', chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) resolve(match[1]);
    });
    chrome.once('error', reject);
    setTimeout(() => reject(new Error('Chrome startup timed out')), 15000).unref();
  });
  socket = new WebSocket(endpoint);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let id = 0;
  const pending = new Map();
  socket.addEventListener('message', event => {
    const result = JSON.parse(event.data), request = pending.get(result.id);
    if (!request) return;
    pending.delete(result.id);
    result.error ? request.reject(new Error(JSON.stringify(result.error))) : request.resolve(result.result);
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const requestId = ++id;
    pending.set(requestId, { resolve, reject });
    socket.send(JSON.stringify({ id: requestId, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false }, sessionId);
  await send('Page.navigate', { url: process.env.STICKY_NOTE_URL ?? 'http://localhost:3000/' }, sessionId);
  await evaluate(`new Promise((resolve, reject) => {
    const start = performance.now();
    const check = () => {
      if ([...document.querySelectorAll('button')].some(button => button.textContent === 'New Sticky Note')) resolve();
      else if (performance.now() - start > 10000) reject(new Error('Workspace did not load'));
      else setTimeout(check, 50);
    }; check();
  })`);
  const click = async point => {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 }, sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 }, sessionId);
  };
  await click(await evaluate(`(() => {
    const rect = [...document.querySelectorAll('button')].find(button => button.textContent === 'New Sticky Note').getBoundingClientRect();
    return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  })()`));
  await evaluate('new Promise(resolve => requestAnimationFrame(resolve))');
  const before = await evaluate(`document.querySelector('.reactive-sticky-draft').getBoundingClientRect().toJSON()`);
  await click({ x: before.x + 40, y: before.y + 60 });
  const type = async text => {
    for (const character of text) {
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: character, text: character }, sessionId);
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: character }, sessionId);
    }
  };
  await type('H');
  await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const after = await evaluate(`(() => {
    const note = document.querySelector('.reactive-window--sticky');
    if (!note) return null;
    const rect = note.getBoundingClientRect();
    return {
      rect: rect.toJSON(), visible: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
      onTop: note.contains(document.elementFromPoint(rect.left + 30, rect.top + 50)),
      focused: note.contains(document.activeElement), text: note.querySelector('[contenteditable=true]')?.textContent,
    };
  })()`);
  console.log(JSON.stringify({ before, after }, null, 2));
  assert.ok(after, 'Typing must leave a mounted Sticky Note');
  assert.equal(after.visible, true, 'Typing must keep the Sticky Note in the viewport');
  for (const axis of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(after.rect[axis] - before[axis]) < 1, `Typing must preserve ${axis}`);
  assert.equal(after.onTop, true, 'The note must receive pointer hits above the Document');
  assert.equal(after.focused, true, 'Typing must keep focus in the note');
  await type('ello note');
  assert.equal(await evaluate(`document.querySelector('.reactive-window--sticky [contenteditable=true]').textContent`), 'Hello note');
  console.log('Sticky Note first-keystroke position, size, visibility, focus, and continued typing: passed');
  const enter = async () => {
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
  };
  await enter();
  await type('Second paragraph');
  const paragraphs = await evaluate(`(() => {
    const flows = [...document.querySelectorAll('.reactive-window--sticky [contenteditable=true]')];
    return flows.map(flow => ({ text: flow.textContent, rect: flow.getBoundingClientRect().toJSON() }));
  })()`);
  console.log(JSON.stringify({ paragraphs }, null, 2));
  assert.equal(paragraphs.length, 2, 'Enter must create a second text Block');
  assert.equal(paragraphs[1].text, 'Second paragraph');
  const gap = paragraphs[1].rect.top - paragraphs[0].rect.bottom;
  assert.ok(gap >= 0 && gap <= 12, `Paragraphs should follow each other closely; gap was ${gap}px`);
  for (let index = 0; index < 10; index++) {
    await enter();
    await type(`Line ${index + 3}`);
  }
  const overflow = await evaluate(`(() => {
    const note = document.querySelector('.reactive-window--sticky');
    const content = note.querySelector('.reactive-sticky-note__content');
    const flows = [...content.querySelectorAll('[contenteditable=true]')];
    const gap = flows[1].getBoundingClientRect().top - flows[0].getBoundingClientRect().bottom;
    content.scrollTop = content.scrollHeight;
    const last = flows.at(-1).getBoundingClientRect(), viewport = content.getBoundingClientRect();
    return {
      count: flows.length, gap, scrollable: content.scrollHeight > content.clientHeight,
      lastVisible: last.top >= viewport.top && last.bottom <= viewport.bottom,
      windowRect: note.getBoundingClientRect().toJSON(),
    };
  })()`);
  assert.equal(overflow.count, 12);
  assert.ok(Math.abs(overflow.gap - gap) < 1, 'More paragraphs must not redistribute the gap');
  assert.equal(overflow.scrollable, true, 'Long notes must scroll as one document');
  assert.equal(overflow.lastVisible, true, 'Scrolling must reveal the last paragraph');
  for (const axis of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(overflow.windowRect[axis] - before[axis]) < 1, `Overflow must preserve window ${axis}`);
  console.log('Sticky Note Enter spacing, repeated Enter, and scrolling overflow: passed');
} finally {
  socket?.close();
  if (chrome.pid && chrome.exitCode === null && chrome.signalCode === null) {
    const exited = new Promise(resolve => chrome.once('exit', resolve));
    chrome.kill('SIGKILL');
    await exited;
  }
  await rm(profile, { recursive: true, force: true });
}
