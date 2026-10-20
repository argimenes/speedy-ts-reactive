# E1.0 isolated boundary proofs

This directory is experimental only. No production entry point imports it.
It does not implement a session store, host-lease coordinator or Detach command.

Run from the repository root:

```sh
MWM_TRACE=1 node scripts/e1-boundary/run-browser.mjs
npx vitest run scripts/e1-boundary/persistence.test.ts \
  src/application/flint-transient-proof.test.ts \
  src/application/flint-lifecycle.test.tsx \
  src/persistence/managed-desktop.test.ts
npx tsc --noEmit -p scripts/e1-boundary/tsconfig.json
```

The browser runner requires the installed Chrome binary, or `CHROME_BIN`.
It creates its own Vite server and temporary Chrome profile, blocks backend
access, runs finite correctness checks, prints JSON evidence and cleans up.
It does not run a benchmark or load test.

The browser fixture uses production components. Private retained roots and
shared-projection islands are created once at first mount in the experiment;
they are not hot migrations of existing production tab owners. Expected
negative controls demonstrate source-owned Ink cleanup, fixed portal ownership,
native focus/scroll loss and iframe reload.

The persistence tests call only existing validators and capture/materialization
functions. They neither implement nor accept the proposed Desktop 5 contract.

See the [qualification report](../../MUTABLE_WINDOW_MANAGER_E1_0_QUALIFICATION.md)
and [persistence proposal](../../MUTABLE_WINDOW_MANAGER_E1_PERSISTENCE_PROPOSAL.md).
