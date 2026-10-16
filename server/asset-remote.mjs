import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import ipaddr from 'ipaddr.js';
import { IMAGE_LIMITS } from './asset-image-validation.mjs';
export function remoteAssetUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.port && url.port !== '443' || url.username || url.password || url.hash || value.length > 4096) throw Error('Remote images require a credential-free HTTPS URL on port 443.');
  return url;
}
export function publicAddress(address) {
  try { const ip = ipaddr.parse(address); return ip.range() === 'unicast' && !(ip.kind() === 'ipv6' && ip.isIPv4MappedAddress()); } catch { return false; }
}
/** Explicit consent is checked by the route. DNS and redirects cannot change the allowed origin/address policy. */
export async function acquireRemoteAsset(value, signal, dependencies = {}) {
  const origin = remoteAssetUrl(value).origin, resolve = dependencies.lookup ?? lookup, connect = dependencies.request ?? request;
  const controller = new AbortController(), cancel = () => controller.abort();
  signal?.throwIfAborted(); signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(cancel, 15000);
  try {
    let url = remoteAssetUrl(value);
    for (let hop = 0; hop <= 3; hop++) {
      controller.signal.throwIfAborted();
      if (url.origin !== origin) throw Error('A different image origin requires new consent.');
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const answers = await Promise.race([resolve(host, { all: true, verbatim: true }), new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(Error('Image download cancelled or timed out.')), { once: true }))]);
      controller.signal.throwIfAborted();
      if (!answers.length || answers.some(a => !publicAddress(a.address))) throw Error('Remote image address is not public.');
      const address = answers[0];
      const result = await new Promise((resolve, reject) => {
        const req = connect(url, { agent: false, signal: controller.signal, headers: { Accept: 'image/png, image/jpeg', 'Accept-Encoding': 'identity' }, lookup: (_host, options, cb) => options?.all ? cb(null, [address]) : cb(null, address.address, address.family) }, res => {
          if ([301,302,303,307,308].includes(res.statusCode)) { const redirect = res.headers.location; res.destroy(); resolve({ redirect }); return; }
          if (res.statusCode !== 200 || res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity' || Number(res.headers['content-length'] ?? 0) > IMAGE_LIMITS.bytes) { res.destroy(); reject(Error('Remote image response was rejected.')); return; }
          const chunks = []; let size = 0;
          res.on('data', chunk => { size += chunk.length; if (size > IMAGE_LIMITS.bytes) { req.destroy(Error('Remote image exceeds the byte limit.')); return; } chunks.push(chunk); });
          res.on('end', () => resolve({ bytes: Buffer.concat(chunks) })); res.on('error', reject); res.on('aborted', () => reject(Error('Remote image response was interrupted.')));
        });
        req.on('error', reject); req.end();
      });
      if (result.bytes) return result.bytes;
      if (!result.redirect || hop === 3) throw Error('Remote image redirect limit exceeded.');
      url = remoteAssetUrl(new URL(result.redirect, url).href);
    }
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', cancel); }
}
