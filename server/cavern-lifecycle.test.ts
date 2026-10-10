// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import express from 'express';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCavernLifecycle } from './cavern-lifecycle';
import { SqliteKnowledgeHost } from './sqlite-knowledge-host';

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => {
  for (const dispose of cleanup.splice(0).reverse()) await dispose();
  vi.restoreAllMocks();
});

async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'cavern-lease-')));
  cleanup.push(() => fs.rm(root, { recursive: true, force: true }));
  const lifecycle = createCavernLifecycle({ stateFile: path.join(root, 'preferences.json') });
  cleanup.push(() => lifecycle.close());
  const app = express();
  app.use(express.json());
  app.use('/api/cavern', lifecycle.router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  cleanup.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const port = (server.address() as { port: number }).port;
  const call = async (action: string, body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/cavern/${action}`, body === undefined ? undefined : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    return { status: response.status, ...await response.json() };
  };
  const opened = await call('establish', { path: path.join(root, 'vault'), intent: 'create' });
  expect(opened.Success, opened.Error).toBe(true);
  const current = opened.Data.current;
  const policy = { version: 1, opaqueTypes: ['application-block', 'timer-block'] };
  const acquire = vi.spyOn(SqliteKnowledgeHost.prototype, 'acquire');
  expect((await call('index', { session: current.session, policy })).Success).toBe(true);
  const host = acquire.mock.contexts[0] as SqliteKnowledgeHost;
  const lease = (await acquire.mock.results[0].value).lease;
  return { call, current, policy, host, lease, acquire };
}

it('reopens the idle Cavern index once for concurrent startup/status requests, preserving policy and session', async () => {
  const f = await fixture();
  // Expiry uses release internally. Exercise the same real host path without
  // waiting ten minutes or advancing unrelated worker timers.
  await f.host.release(f.lease);
  await expect(f.host.status(f.lease)).rejects.toThrow('SQLite lease expired');
  const responses = await Promise.all([f.call('startup', {}), f.call('status'), f.call('status')]);
  for (const response of responses) {
    expect(response.Success).toBe(true);
    expect(response.Data.current).toEqual(f.current);
    expect(response.Data.index.vaultGuid).toBe(f.current.cavernGuid);
    expect(response.Data.index.coverage).toHaveProperty('complete');
  }
  expect(f.acquire).toHaveBeenCalledTimes(2);
  expect(f.acquire).toHaveBeenLastCalledWith('.', f.policy);
  const replacement = (await f.acquire.mock.results[1].value).lease;
  expect(replacement).not.toBe(f.lease);

  // Explicit reconciliation must also recover, including a later expiry.
  await f.host.release(replacement);
  expect((await f.call('index', { session: f.current.session, policy: f.policy })).Success).toBe(true);
  expect(f.acquire).toHaveBeenCalledTimes(3);
});

it('does not retry unrelated SQLite failures or accept stale Cavern sessions', async () => {
  const f = await fixture();
  vi.spyOn(f.host, 'status').mockRejectedValue(new Error('SQLite unavailable'));
  expect(await f.call('startup', {})).toMatchObject({ Success: false, Error: 'SQLite unavailable' });
  expect(await f.call('index', { session: 'old', policy: f.policy })).toMatchObject({ Success: false, Error: 'The current Cavern changed.' });
  expect(f.acquire).toHaveBeenCalledTimes(1);
});
