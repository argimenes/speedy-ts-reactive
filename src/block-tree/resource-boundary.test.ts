import { describe, expect, it, vi } from 'vitest';
import { CanonicalRepository } from './repository';
import { decodeDocument } from './codecs';
import { TreeCommands } from './commands';
import type { CanonicalResourceBoundaryResult, CooperativeBoundaryOptions } from './resource-boundary';
import type { ContentRecord, ExistingBlockDto, RepositoryOperation } from './types';

function repository(children: ExistingBlockDto[] = [{ id: 'p', type: 'standoff-editor-block', text: 'a😀bc' }]) {
  return new CanonicalRepository(decodeDocument({ id: 'root', type: 'document-block', metadata: { documentId: 'doc' }, children }).state);
}
function content(r: CanonicalRepository, id: string) { return Object.values(r.readState().contents).find(c => c.payload.id === id)!; }
function placement(r: CanonicalRepository, c: ContentRecord) { return Object.values(r.readState().placements).find(p => p.contentKey === c.key)!; }
function evidence(result: CanonicalResourceBoundaryResult) {
  return result.status === 'ready' ? { ...result, token: { revision: result.token.revision } } : result;
}
async function parity(r: CanonicalRepository, id = 'doc', options: CooperativeBoundaryOptions = {}) {
  const before = r.snapshot(), sync = r.readCanonicalResourceBoundary(id);
  const cooperative = await r.readCanonicalResourceBoundaryCooperative(id, {
    maxStepsPerSlice: 1, yieldControl: () => Promise.resolve(), ...options,
  });
  expect(evidence(cooperative)).toEqual(evidence(sync));
  expect(r.snapshot()).toEqual(before);
  expect(Object.isFrozen(cooperative)).toBe(true);
  if (cooperative.status === 'ready') {
    expect(r.isBoundaryCurrent(cooperative.token)).toBe(true);
    expect(Object.isFrozen(cooperative.token)).toBe(true);
    expect(Object.isFrozen(cooperative.retainedDefinitionKeys)).toBe(true);
  }
  return cooperative;
}

it('enables semantic evidence by default and supports count-only constructor rollback', async () => {
  const r = repository(); expect(r.hasResourceBoundaryEvidence).toBe(true);
  expect((await parity(r)).status).toBe('ready');
  const old = new CanonicalRepository(r.snapshot(), { resourceBoundaryEvidence: false });
  expect(old.hasResourceBoundaryEvidence).toBe(false);
  expect(await old.readCanonicalResourceBoundaryCooperative('doc')).toEqual(old.readCanonicalResourceBoundary('doc'));
  expect(old.readCanonicalResourceBoundary('doc').status).toBe('unavailable');
  const commands = new TreeCommands(old, k => k), p = placement(old, content(old, 'p'));
  commands.replaceInlineRange(p.key, 0, 0, 'Z'); old.undo(); old.redo();
  expect(content(old, 'p').inlineContent.length).toBe(5);
});

it('matches sync evidence through edits, split, empty insertion, undo branches and root/placement-only changes', async () => {
  const r = repository(), commands = new TreeCommands(r, k => k), p = placement(r, content(r, 'p'));
  const check = async (action: () => unknown) => { action(); expect((await parity(r)).status).toBe('ready'); };
  await check(() => commands.replaceInlineRange(p.key, 1, 1, 'test'));
  await check(() => commands.splitStandoff(p.key, 3));
  await check(() => r.undo()); await check(() => r.redo()); await check(() => r.undo());
  await check(() => commands.insertEmptyStandoffSibling(p.key, 'after')); expect(r.canRedo()).toBe(false);
  await check(() => r.undo());
  await check(() => r.commit('Reference role', [{ kind: 'put-placement', record: { ...p, kind: 'reference' } }]));
  await check(() => r.undo());
  const root = { ...r.readState().placements[r.readState().rootPlacementKey] };
  await check(() => r.commit('Replace root', [
    { kind: 'remove-placement', key: root.key }, { kind: 'put-placement', record: { ...root, key: 'new-root' } }, { kind: 'set-root', key: 'new-root' },
  ]));
  await check(() => r.undo());
});

it('matches retained definitions, outside/shared ownership, duplicate identities and missing resources', async () => {
  const r = repository([{ id: 'p', type: 'standoff-editor-block', text: 'one' }, { id: 'q', type: 'standoff-editor-block', text: 'two' }]);
  const root = content(r, 'root'), p = content(r, 'p'), q = content(r, 'q');
  const retained = { ...p, key: 'retained', payload: { id: 'retained' }, inlineContent: [], definitionOwnerKey: root.key };
  r.commit('Retain', [{ kind: 'put-content', record: retained }]);
  expect(await parity(r)).toMatchObject({ status: 'ready', retainedDefinitionKeys: ['retained'] });
  const cell = r.readState().placements[p.inlineContent[0]];
  r.commit('Share Cell', [{ kind: 'put-placement', record: { ...cell, key: 'shared' } }, { kind: 'put-content', record: { ...q, inlineContent: [...q.inlineContent, 'shared'] } }]);
  expect((await parity(r)).status).toBe('invalid'); r.undo(); await parity(r);
  r.commit('Duplicate ID', [{ kind: 'put-content', record: { ...root, key: 'duplicate', children: [], payload: { id: 'different-root', metadata: { documentId: 'doc' } } } }]);
  expect((await parity(r)).status).toBe('ambiguous'); r.undo();
  expect((await parity(r, 'absent')).status).toBe('missing');
  const rp = placement(r, p);
  r.commit('Second owner', [{ kind: 'put-placement', record: { ...rp, key: 'outside' } }, { kind: 'put-content', record: { ...root, children: [...root.children, 'outside'] } }]);
  expect((await parity(r)).status).toBe('invalid');
});

it('matches unavailable global validation and unclassified fast mutations without a query repair', async () => {
  const r = repository([{ id: 'child', type: 'document-block' }]);
  const root = content(r, 'root'), p = placement(r, content(r, 'child'));
  r.commit('Legacy duplicate owner', [{ kind: 'put-placement', record: { ...p, key: 'duplicate-owner', placementId: undefined } }, { kind: 'put-content', record: { ...root, children: [...root.children, 'duplicate-owner'] } }]);
  expect((await parity(r)).status).toBe('unavailable');
  r.undo(); expect((await parity(r)).status).toBe('ready');
  const exotic = repository(), c = content(exotic, 'p');
  exotic.commit('Exotic host', [{ kind: 'put-content', record: { ...c, viewType: 'future-host' } }]);
  exotic.commit('Exotic payload', [{ kind: 'put-content', record: { ...content(exotic, 'p'), payload: { ...c.payload, id: 'changed' } } }]);
  expect((await parity(exotic)).status).toBe('unavailable');
});

it('binds tokens to issuance, repository instance and revision; exposes only detached incoming evidence', async () => {
  const r = repository(), result = await parity(r); if (result.status !== 'ready') throw Error('Expected ready');
  expect(r.isBoundaryCurrent({ ...result.token })).toBe(false);
  const replacement = new CanonicalRepository(r.snapshot()); expect(replacement.isBoundaryCurrent(result.token)).toBe(false);
  const p = content(r, 'p'), incoming = r.incomingOwnedPlacements(result.token, p.key);
  expect(Object.isFrozen(incoming)).toBe(true); expect(Object.isFrozen(incoming[0].location?.slot)).toBe(true);
  expect(incoming[0].location).not.toBe(r.locationOf(incoming[0].placementKey));
  r.commit('Edit', [{ kind: 'put-content', record: { ...p, payload: { ...p.payload, extra: 'x' } } }]);
  expect(r.isBoundaryCurrent(result.token)).toBe(false);
  expect(() => r.incomingOwnedPlacements(result.token, p.key)).toThrow('Stale');
  r.undo(); expect(r.isBoundaryCurrent(result.token)).toBe(false);
});

it('never publishes partial ready evidence and rejects mutation even at the final suspension', async () => {
  const r = repository(); let yields = 0;
  await parity(r, 'doc', { yieldControl: async () => { yields++; } });
  for (const at of [1, Math.floor(yields / 2), yields]) {
    const current = repository(); let calls = 0;
    const result = await current.readCanonicalResourceBoundaryCooperative('doc', { maxStepsPerSlice: 1, yieldControl: async () => {
      if (++calls === at) { const c = content(current, 'p'); current.commit('During audit', [{ kind: 'put-content', record: { ...c, payload: { ...c.payload, text: 'new' } } }]); }
    } });
    expect(result).toMatchObject({ status: 'unavailable', reason: expect.stringContaining('revision changed') });
    expect('token' in result).toBe(false);
  }
  let release!: () => void, settled = false;
  const pending = r.readCanonicalResourceBoundaryCooperative('doc', { maxStepsPerSlice: 1, yieldControl: () => new Promise(resolve => { release = resolve; }) });
  void pending.then(() => { settled = true; });
  await Promise.resolve(); expect(settled).toBe(false);
  const c = content(r, 'p'); r.commit('Invalidate suspended read', [{ kind: 'put-content', record: { ...c, payload: { ...c.payload, changed: true } } }]);
  release(); expect((await pending).status).toBe('unavailable');
});

it('invalidates after an unrelated change and after Undo even when authored content is restored', async () => {
  for (const undo of [false, true]) {
    const r = repository([{ id: 'child', type: 'document-block', children: [{ id: 'q', type: 'standoff-editor-block', text: 'other' }] }]);
    let changed = false;
    const result = await r.readCanonicalResourceBoundaryCooperative('doc', { maxStepsPerSlice: 1, yieldControl: async () => {
      if (changed) return; changed = true; const c = content(r, 'q');
      r.commit('Unrelated nested resource edit', [{ kind: 'put-content', record: { ...c, payload: { ...c.payload, extra: true } } }]);
      if (undo) r.undo();
    } });
    expect(result.status).toBe('unavailable'); expect((await parity(r)).status).toBe('ready');
  }
});

it('aborts before work or between slices, releases work on scheduler rejection and validates budgets', async () => {
  const r = repository(), signal = AbortSignal.abort();
  await expect(r.readCanonicalResourceBoundaryCooperative('doc', { signal })).rejects.toMatchObject({ name: 'AbortError' });
  const controller = new AbortController(); let yields = 0;
  await expect(r.readCanonicalResourceBoundaryCooperative('doc', { signal: controller.signal, maxStepsPerSlice: 1, yieldControl: async () => { yields++; controller.abort(); } })).rejects.toMatchObject({ name: 'AbortError' });
  expect(yields).toBe(1);
  await expect(r.readCanonicalResourceBoundaryCooperative('doc', { maxStepsPerSlice: 1, yieldControl: async () => { throw Error('Scheduler stopped'); } })).rejects.toThrow('Scheduler stopped');
  for (const options of [{ maxStepsPerSlice: 0 }, { maxStepsPerSlice: 1.5 }, { maxSliceMs: NaN }, { maxSliceMs: 0 }]) {
    await expect(r.readCanonicalResourceBoundaryCooperative('doc', options)).rejects.toThrow('slice budget');
  }
  expect((await parity(r)).status).toBe('ready');
});

describe.each(['cells', 'children', 'retention', 'incoming'] as const)('cooperative locality for large %s', kind => {
  it('slices the inner traversal without any repository dictionary enumeration', async () => {
    const size = 1500, r = repository(kind === 'children'
      ? Array.from({ length: size }, (_, i) => ({ id: `p${i}`, type: 'plain-text-block', text: 'x' }))
      : [{ id: 'p', type: 'standoff-editor-block', text: kind === 'cells' ? 'x'.repeat(size) : 'short' }]);
    if (kind === 'retention' || kind === 'incoming') {
      const root = content(r, 'root'), p = content(r, 'p'), pk = placement(r, p), ops: RepositoryOperation[] = [];
      for (let i = 0; i < size; i++) ops.push(kind === 'retention'
        ? { kind: 'put-content', record: { ...p, key: `retained-${i}`, payload: { id: `retained-${i}` }, definitionOwnerKey: root.key, inlineContent: [] } }
        : { kind: 'put-placement', record: { ...pk, key: `external-${i}`, kind: 'reference' } });
      if (kind === 'incoming') ops.push({ kind: 'put-content', record: { ...root, children: [...root.children, ...Array.from({ length: size }, (_, i) => `external-${i}`)] } });
      r.commit('Large incident set', ops);
    }
    const expected = r.readCanonicalResourceBoundary('doc'); expect(expected.status).toBe('ready');
    const state = r.readState(); let visits = 0, previous = 0, maxVisits = 0, slices = 0;
    const protect = <T extends object>(value: T) => new Proxy(value, {
      ownKeys() { throw Error('Repository dictionary enumeration'); },
      get(target, key, receiver) { if (typeof key === 'string') visits++; return Reflect.get(target, key, receiver); },
    });
    const spy = vi.spyOn(r, 'readState').mockReturnValue({ ...state, contents: protect(state.contents), placements: protect(state.placements) });
    try {
      const result = await r.readCanonicalResourceBoundaryCooperative('doc', { maxStepsPerSlice: 32, yieldControl: async () => { slices++; maxVisits = Math.max(maxVisits, visits - previous); previous = visits; } });
      maxVisits = Math.max(maxVisits, visits - previous);
      expect(evidence(result)).toEqual(evidence(expected)); expect(slices).toBeGreaterThan(40); expect(maxVisits).toBeLessThanOrEqual(65);
    } finally { spy.mockRestore(); }
  }, 30000);
});

it('preserves registered roots, owned-external/resolved boundaries and reference versus ownership cycles cooperatively', async () => {
  const state = decodeDocument({ id: 'workspace', type: 'workspace-block', children: [{ id: 'bank', type: 'workspace-object-bank-block', children: [
    { id: 'a', type: 'document-block', metadata: { documentId: 'A' }, children: [{ id: 'p', type: 'standoff-editor-block', text: 'one' }] },
    { id: 'b', type: 'document-block', metadata: { documentId: 'B' }, children: [{ id: 'q', type: 'standoff-editor-block', text: 'two' }] },
  ] }] }).state;
  for (const p of Object.values(state.placements)) if (state.contents[p.contentKey].viewType === 'document-block') { p.kind = 'reference'; p.resourceRegistration = true; }
  const r = new CanonicalRepository(state), a = content(r, 'a'), b = content(r, 'b');
  const descriptor = (id: string) => ({ kind: 'block' as const, targetId: id.toLowerCase(), source: { scope: 'document' as const, resourceId: id }, version: { kind: 'unpinned' as const } });
  r.commit('External owned resource', [
    { kind: 'put-placement', record: { key: 'ab', kind: 'owned', contentKey: 'unresolved-b', externalReference: descriptor('B') } },
    { kind: 'put-content', record: { ...a, children: [...a.children, 'ab'] } },
  ]);
  expect((await parity(r, 'A')).status).toBe('ready'); expect((await parity(r, 'B')).status).toBe('ready');
  r.commit('Resolve external resource', [{ kind: 'put-placement', record: { key: 'ab', kind: 'owned', contentKey: b.key, resolvedReference: descriptor('B') } }]);
  expect((await parity(r, 'A')).status).toBe('ready'); const before = await parity(r, 'B'); expect(before.status).toBe('ready');
  const reverse = (kind: 'owned' | 'reference'): RepositoryOperation[] => [
    { kind: 'put-placement', record: { key: 'ba', kind, contentKey: 'unresolved-a', externalReference: descriptor('A') } },
    { kind: 'put-content', record: { ...b, children: [...b.children, 'ba'] } },
  ];
  expect(() => r.commit('Cycle', reverse('owned'))).toThrow('cycle');
  if (before.status === 'ready') expect(r.isBoundaryCurrent(before.token)).toBe(true);
  expect(() => r.commit('Duplicate claim', [
    { kind: 'put-placement', record: { key: 'ab2', kind: 'owned', contentKey: 'unresolved-b2', externalReference: descriptor('B') } },
    { kind: 'put-content', record: { ...a, children: [...a.children, 'ab2'] } },
  ])).toThrow('multiple');
  r.commit('Reference cycle', reverse('reference'));
  expect((await parity(r, 'A')).status).toBe('ready'); expect((await parity(r, 'B')).status).toBe('ready');
});
