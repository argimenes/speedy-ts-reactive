# Native knowledge index investigation

Read [the architectural/prototype report](../../../MUTABLE_NATIVE_KNOWLEDGE_INDEX_PROTOTYPE_REPORT.md) before using these results. This folder is a disposable experiment, not a production service API.

```sh
npx tsc --noEmit --project tsconfig.native-knowledge.json
npx vitest run src/qualification/native-knowledge/index.test.ts
node scripts/benchmark-native-knowledge.mjs 100 1000 10000
```

The runner creates a temporary synthetic vault, measures native reads/decoding/extraction/querying in a fresh Node process for each size, writes results under `artifacts/native-knowledge`, then deletes the temporary vault. It does not scan a user's vault, start a server, admit native resources, create editor occurrences or open a database. The 10,000-Document full-decoder run is deliberately expensive; use `100` for a quick check.

- `extract.ts`: qualified native decoding and detached facts extraction.
- `index.ts`: saved/effective contributions, typed inverse lookups and bounded traversal.
- `overlay.ts`: one borrowed canonical resource's deferred live contribution; disposal suppresses disk fallback.
- `files.ts`: read-only filesystem probe, **not** the managed-store security/relocation implementation.
- `fixture.ts`: native-encoder-generated research notes with Unicode, margins, annotations, linked Entity mentions and Document references.
- `benchmark.ts`: timings, memory, count checks, lookups, native text matching and one-resource replacement.
- `index.test.ts`: facts, ambiguity, native preservation, boundaries, invalidation and typing-path proof.

Disk facts contain observed locations/hashes, not authorized persistence bindings or save generations. A real provider still needs the existing source-availability, ownership, conflict and action-revalidation contracts. Only standoff native text and Document-root reference resolution are qualified here; no complete application-hosting or arbitrary Block-target coverage is claimed.

The file probe accepts `.ink` with the existing native JSON decoder, but retains the earlier shared-`stem.md` collision experiment. It does **not** implement the report's recommended `.ink.md` convention or any production file migration. Pair naming and receipts remain unchanged in the application.

The broad full-text benchmark preserves the existing matcher's 50,000-candidate guard. A reported budget error is a result, not a successfully completed full-vault search.
