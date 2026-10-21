# Reconstruction boundary proofs

Isolated investigation after accepted E1.3. No production module imports this directory. The fixture uses current mount/attach primitives to construct and abandon a second editor of the same canonical Document. It deliberately does **not** implement or claim a replacement transaction.

- `proof-support.tsx`: real Flint source and runtime Document-window candidate, using existing session/disposal authorities.
- `boundary.test.tsx`: canonical/undo continuity, failed construction, original-host occupancy, capture-guard limitation, independent source close and finite cleanup cycles.
- `browser-fixture.tsx`: actual PdfBlockView/PDF.js parser, canvas and text layer; demonstrates canonical continuity and transient-state loss, with isolated byte responses.

Run from the repository root:

```sh
npx vitest run scripts/e1-reconstruction/boundary.test.tsx --maxWorkers=1 --minWorkers=1
node scripts/qualify-window-manager.mjs --reconstruction-proof
npx tsc --project scripts/e1-reconstruction/tsconfig.json
```

See [assessment](../../MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_ASSESSMENT.md), [qualification](../../MUTABLE_WINDOW_MANAGER_RECONSTRUCTION_QUALIFICATION.md) and [E1.4 proposal](../../MUTABLE_WINDOW_MANAGER_E1_4_DURABLE_TOPOLOGY_PROPOSAL.md). The architecture-change stop condition is in effect; these fixtures do not authorize or enable fallback or Desktop 5.
