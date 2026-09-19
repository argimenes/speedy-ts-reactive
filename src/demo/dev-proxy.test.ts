// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import config from '../../vite.config.js';

describe('development proxy', () => {
  it('proxies only the API because bundled media is repository-owned', () => {
    expect(config.server!.proxy).toEqual({ '/api': 'http://127.0.0.1:3002' });
  });
  it('keeps the JavaScript and TypeScript Vite configs identical', async () => {
    const [js, ts] = await Promise.all(['js', 'ts'].map(extension => readFile(new URL(`../../vite.config.${extension}`, import.meta.url), 'utf8')));
    expect(js).toBe(ts);
  });
});
