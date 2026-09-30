import type { CanonicalRepository } from '../block-tree/repository';
const bindings = new WeakMap<CanonicalRepository, { ids: Set<string>; dispose?: () => void }>();
export function markNativeBinding(repository: CanonicalRepository, id: string) {
  let entry = bindings.get(repository); if (!entry) bindings.set(repository, entry = { ids: new Set() }); entry.ids.add(id);
}
export function assertLegacySaveAllowed(repository: CanonicalRepository) {
  if (bindings.get(repository)?.ids.size) throw new Error('This session contains native Documents. Save them individually through Flint; Workspace/tree saving cannot preserve their resource semantics.');
}
export function ownNativeSession(repository: CanonicalRepository, dispose: () => void) {
  let entry = bindings.get(repository); if (!entry) bindings.set(repository, entry = { ids: new Set() }); entry.dispose = dispose;
}
export function disposeNativeSession(repository: CanonicalRepository) { bindings.get(repository)?.dispose?.(); }
