// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ProxyOptions } from 'vite';
import config from '../../vite.config.js';

describe('development upload proxy', () => {
  const proxy = config.server!.proxy!['/uploads'] as ProxyOptions;
  it.each(['?import', '?raw', '?url', '?v=123&import'])('leaves %s asset transforms to Vite', query => {
    const url = '/uploads/medieval-template.jpg' + query;
    expect(proxy.bypass!({ url } as IncomingMessage, {} as ServerResponse, proxy)).toBe(url);
  });
  it('continues proxying ordinary uploaded media to Node', () => {
    expect(proxy.bypass!({ url: '/uploads/medieval-template.jpg' } as IncomingMessage, {} as ServerResponse, proxy)).toBeUndefined();
  });
  it('keeps the JavaScript and TypeScript Vite configs identical', async () => {
    const [js, ts] = await Promise.all(['js', 'ts'].map(extension => readFile(new URL(`../../vite.config.${extension}`, import.meta.url), 'utf8')));
    expect(js).toBe(ts);
  });
});
