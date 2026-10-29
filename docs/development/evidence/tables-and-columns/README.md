# Tables and Columns Evidence

The files listed immediately below exercise pre-implementation functionality. Increment 1 evidence is listed separately. None of these harnesses saves user documents.

- `probe-existing.mjs`: isolated Chromium/Flint probe, adapted from the existing list qualification harness; run from the repository root.
- `observations.json`: identity, caret, snapshot count, selection eligibility, native reload, sizing and nested-grid dissolution observations.
- `existing-grid-wide.png`: the current Flint renderer at the measured wide size; this is not a proposed design mockup.
- `tests.txt`: eight relevant existing suites, 161 passing tests and one failing drag/drop test with one uncaught error.
- `baseline-selection.txt`: the same drag/drop failure reproduced at unchanged `7aa2efd` in an isolated checkout.

```sh
node docs/development/evidence/tables-and-columns/probe-existing.mjs
npx vitest run src/rendering/block-context-menu.test.tsx src/rendering/block-selection.test.tsx src/rendering/reversible-surface.test.tsx src/features/autocomplete/autocomplete.test.ts src/interchange/html-import.test.ts src/interchange/markdown-import.test.ts src/interchange/document-interchange.test.ts src/persistence/native-resource.test.ts
```

The probe defaults to `/tmp/tables-columns-investigation`; set `BENCHMARK_OUTPUT` to change its artifact destination. Its snapshot observation is a counter, not a structural-performance benchmark. The 440 px case constrains the table directly, rather than resizing the whole browser window. The native reload uses serialized bytes in memory.

## Increment 1

- `increment1/increment1.json`: direct-cell renderer, annotated native Masque document, canonical operations and paired structural/typing timings.
- `increment1-solid/increment1.json`: the same checks using Solid character cells.
- `increment1/independent-cell-flow.png`: four vertically flowing Blocks versus two paragraphs in a neighbouring cell, within one table row.
- `increment1-tests.txt`: 205 passing tests across 11 relevant suites.
- `increment1-targeted-final.txt`: final table/commit-notification recheck after selection guard and independent-flow fixture refinements.
- `increment1-typecheck.txt`: reactive and server TypeScript checks.

Run each browser measurement sequentially, without concurrent tests:

```sh
BENCHMARK_DOCUMENT_PATH='vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink' BENCHMARK_OUTPUT=/tmp/tables-direct node scripts/qualify-tables-browser.mjs
BENCHMARK_DIRECT_CELLS=false BENCHMARK_DOCUMENT_PATH='vaults/imported/documents/edgar-allan-poe/masque-of-the-red-death-[1c48f303].ink' BENCHMARK_OUTPUT=/tmp/tables-solid node scripts/qualify-tables-browser.mjs
```

These are headless Chromium observations using real Flint components. Typing timings measure the beforeinput handler, its microtask settlement and the next frame separately; frame timing is not a guarantee of user-visible latency. Structural measurements compare the existing menu conversion with the new canonical operation in the same loaded document (two warmups and twelve samples per path). There is one canonical snapshot per accepted structural action, none during ordinary typing. No slash/UI acceptance tests are implied by the API probe.
