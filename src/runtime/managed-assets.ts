import { assetKey, managedAsset, type AssetManifest, type ManagedAssetReference } from '../interchange/managed-asset';
export interface AssetContext { cavernId?: string; session?: string }
export interface AssetLease { id: string; token: string; cavernId: string }
/** Session-owned runtime URLs only; original references remain canonical. */
export class ManagedAssets {
  private entries = new Map<string, { users: number; controller: AbortController; promise: Promise<string>; url?: string }>();
  private alive = true;
  constructor(private context: () => AssetContext, private enabled: () => boolean) {}
  async request(path: string, body: unknown, signal?: AbortSignal, lease?: AssetLease) {
    const scope = this.context();
    if (!this.alive || !this.enabled() || !scope.cavernId || !scope.session) throw Error('Choose a Cavern before importing images.');
    const form = body instanceof FormData;
    const response = await fetch(`/api/assets/${path}`, { method: 'POST', signal, headers: { 'X-Mutable-Cavern': scope.session, ...(!form ? { 'Content-Type': 'application/json' } : {}), ...(lease ? { 'X-Mutable-Asset-Lease': lease.token } : {}) }, body: form ? body : JSON.stringify(body ?? {}) });
    if (scope.session !== this.context().session || scope.cavernId !== this.context().cavernId || !this.alive) throw Error('The Cavern changed; asset import cancelled.');
    const result = await response.json(); if (!response.ok || !result.Success) throw Error(result.Error || 'Asset operation failed.');
    return result.Data;
  }
  begin(remoteConsent: string[], signal?: AbortSignal): Promise<AssetLease> { return this.request('begin', { remoteConsent }, signal); }
  verify(asset: ManagedAssetReference, signal?: AbortSignal): Promise<AssetManifest> { return this.request('verify', asset, signal); }
  async stage(lease: AssetLease, file: Blob, signal?: AbortSignal): Promise<AssetManifest> {
    const form = new FormData(); form.append('asset', file, 'clipboard-image');
    return this.request(`${lease.id}/images/stage`, form, signal, lease);
  }
  remote(lease: AssetLease, url: string, signal?: AbortSignal): Promise<AssetManifest> { return this.request(`${lease.id}/images/remote`, { url }, signal, lease); }
  action(lease: AssetLease, action: string, signal?: AbortSignal) { return this.request(`${lease.id}/${action}`, {}, signal, lease); }
  bind(image: HTMLImageElement, value: unknown): () => void {
    const asset = managedAsset(value), scope = this.context();
    if (!asset || !this.alive || !this.enabled() || asset.cavernId !== scope.cavernId || !scope.session) { image.removeAttribute('src'); return () => {}; }
    const key = `${scope.session}/${assetKey(asset)}`;
    let entry = this.entries.get(key);
    if (!entry) {
      const controller = new AbortController();
      entry = { users: 0, controller, promise: Promise.resolve('') };
      const current = entry;
      entry.promise = (async () => {
        const r = await fetch(`/api/assets/${encodeURIComponent(asset.assetId)}/content?cavernId=${encodeURIComponent(asset.cavernId)}`, { headers: { 'X-Mutable-Cavern': scope.session! }, signal: controller.signal });
        if (!r.ok) throw Error('Managed asset is unavailable.');
        const blob = await r.blob();
        if (controller.signal.aborted || !this.alive || this.context().session !== scope.session || this.context().cavernId !== asset.cavernId || !['image/png','image/jpeg'].includes(blob.type) || blob.size > 10*1024*1024) throw Error('Managed asset response was rejected.');
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');
        if (`sha256:${digest}` !== asset.assetId || controller.signal.aborted || !this.alive) throw Error('Managed asset integrity failure.');
        return current.url = URL.createObjectURL(blob);
      })();
      this.entries.set(key, entry);
    }
    entry.users++; let alive = true;
    entry.promise.then(url => { if (alive && this.alive && scope.session === this.context().session) image.src = url; }).catch(() => { if (alive) { image.removeAttribute('src'); image.title = 'Image unavailable in this Cavern'; } });
    return () => { alive = false; if (--entry!.users === 0) { entry!.controller.abort(); if (entry!.url) URL.revokeObjectURL(entry!.url); this.entries.delete(key); } };
  }
  dispose() { this.alive = false; for (const entry of this.entries.values()) { entry.controller.abort(); if (entry.url) URL.revokeObjectURL(entry.url); } this.entries.clear(); }
}
