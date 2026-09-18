/** Bounded spike: isolated immutable on-disk fixtures, native authority and Chrome. */
import assert from 'node:assert/strict';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import express from 'express';
import { build } from 'esbuild';
import { createServer } from 'vite';
import solid from 'vite-plugin-solid';
import { isolatedBrowser } from './stage-c-gates/browser.mjs';
const destination = process.env.SELECTIVE_HISTORY_RESULT ?? 'BLOCK_HISTORY_SELECTIVE_SPIKE_RESULTS.json';
const transportOnly = process.env.SELECTIVE_HISTORY_TRANSPORT_ONLY === '1';
try { await access(destination); throw Error(`Refusing to overwrite ${destination}`); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const directory = await mkdtemp(path.join(tmpdir(), 'codex-selective-spike-'));
const result = { passed: false, transportOnly, started: new Date().toISOString(), fixtures: [], errors: [] };
let browser, vite, server;
try {
  const bundle = path.join(directory, 'prepare.mjs');
  await build({ entryPoints: ['scripts/selective-history-fixtures.ts'], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22' });
  const { prepare } = await import(pathToFileURL(bundle).href), fixtures = new Map();
  for (const [name, surrounding, length] of [['modest-small', 500, 200], ['modest-medium', 5000, 200], ['modest-large', 25000, 200], ['large-single', 0, 25000]]) {
    if (transportOnly && name !== 'large-single') continue;
    console.log(`Materializing ${name}`);
    const fixture = await prepare(directory, name, surrounding, length, !transportOnly); fixtures.set(name, fixture); result.fixtures.push({ ...fixture.stats, samples: [], parity: [] });
    console.log(JSON.stringify(fixture.stats)); global.gc?.();
  }
  const app = express();
  app.get('/__selective/:name/:action/:key?', async (req, res) => {
    try {
      const f = fixtures.get(req.params.name); if (!f) throw Error('Unknown fixture');
      const action = req.params.action, key = req.params.key;
      if (action === 'metadata') res.json(f.metadata);
      else if (action === 'path') res.json(await f.archive.path(Number(key)));
      else if (action === 'certificate') res.json(await f.authority.certificate(Number(key), String(req.query.revisionId)) ?? null);
      else if (action === 'blob') { res.set('Content-Type', 'application/octet-stream'); res.send(Buffer.from(await f.blobs.get(key))); }
      else throw Error('Unknown operation');
    } catch (error) { res.status(400).send(String(error)); }
  });
  server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  vite = await createServer({ configFile: false, plugins: [solid(), { name: 'selective-check', configureServer(s) {
    s.middlewares.use('/__selective-check', (_req, res) => { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><body><script type="module" src="/src/history/selective-spike/browser-check.tsx"></script>'); });
  } }], server: { host: '127.0.0.1', port: 0, hmr: false, watch: { ignored: ['**/*'] }, proxy: { '/__selective/': `http://127.0.0.1:${server.address().port}` } }, logLevel: 'error' });
  await vite.listen();
  for (const fixture of result.fixtures) {
    browser = await isolatedBrowser(); const page = await browser.launch(); result.browser = page.version.product;
    await page.navigate(`http://127.0.0.1:${vite.httpServer.address().port}/__selective-check`);
    for (let i = 0; i < 100 && !await page.evaluate('!!window.selectiveCheck'); i++) await new Promise(resolve => setTimeout(resolve, 100));
    await page.evaluate(`window.selectiveCheck.init(${JSON.stringify(fixture.name)})`);
    if (transportOnly) {
      const initial = await page.evaluate(`window.selectiveCheck.run('full',1,true,false)`), markup = initial.html.replace(/<!--.*?-->/gs, '');
      delete initial.html; fixture.preparation = initial;
      for (let round = 0; round < 4; round++) for (const compact of [false, true]) {
        const sample = await page.evaluate(`window.selectiveCheck.run('full',1,false,${compact},'transport')`);
        assert.equal(sample.html.replace(/<!--.*?-->/gs, ''), markup); delete sample.html; fixture.samples.push(sample);
        console.log(JSON.stringify({ round, compact, totalMs: sample.totalMs, workerMs: sample.workerMs, jsonBytes: sample.jsonBytes }));
      }
      fixture.previewParity = true; fixture.browserDiagnostics = browser.diagnostics;
      await browser.close(); browser = undefined; continue;
    }
    const html = new Map();
    for (const [reader, compact] of [['full', false], ['selective', false], ...(fixture.name === 'large-single' ? [['full', true], ['selective', true]] : [])]) {
      for (const [i, sequence] of [3, 0, 1, 2, 1, 3].entries()) {
        const sample = await page.evaluate(`window.selectiveCheck.run(${JSON.stringify(reader)},${sequence},${i === 0},${compact})`);
        // Ignore Solid comment markers only; text, styling and element structure agree.
        const markup = sample.html.replace(/<!--.*?-->/gs, '');
        if (html.has(sequence)) assert.equal(markup, html.get(sequence)); else html.set(sequence, markup);
        delete sample.html; fixture.samples.push(sample);
        console.log(JSON.stringify({ fixture: fixture.name, reader, compact, sequence, ms: Math.round(sample.totalMs), fetched: sample.diagnostics?.bytes ?? sample.diagnostics?.fetchedBytes }));
      }
    }
    for (const sequence of [0, 1, 2, 3]) { await page.evaluate(`window.selectiveCheck.verify(${sequence})`); fixture.parity.push(sequence); }
    fixture.previewAndGraphParity = true; fixture.browserDiagnostics = browser.diagnostics;
    await browser.close(); browser = undefined;
  }
  result.passed = true;
} catch (error) { result.errors.push(String(error?.stack ?? error)); console.error(error); process.exitCode = 1; }
finally {
  result.finished = new Date().toISOString(); await writeFile(destination, JSON.stringify(result, null, 2) + '\n');
  await browser?.close(); await vite?.close(); if (server) await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
