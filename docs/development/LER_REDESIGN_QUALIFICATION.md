# LER redesign qualification

Implemented 28 October 2026 against `8daadc7`. The latest user instruction supersedes the earlier rollout proposal: this is the standard LER path, with **no new feature flag**. Existing feature switches retain their defaults. Feature Two, entity-type filtering, pipeline infrastructure, document persistence and shared renderer/Window Manager internals are unchanged.

## Implementation milestones

| Increment | Delivered | Qualification |
| --- | --- | --- |
| 1. Session and compatibility | Feature-owned session ID, owner identity, immutable original A, independent graph/local queries B, separate mention query C, compact prepared identity. Existing resolver and native write/recovery paths retained. | Preparation makes no document/history change; original remains visible across inspection, review and adjusted working targets. Creation, retry receipts, recovery, Replace & Link and disposal tests pass. |
| 2. Owned live inventory | Shared per-document lease over owned child/relation membership. Foreign references and nested documents excluded; repeated presentations do not multiply counts. Logical shared annotations count once. Live forms, counts and cached canonical names/aliases are separate. | Unsaved edits, retargeting, deletion, moves, Undo and edits after Undo pass. Block references remain included. Unaffected entity objects and DOM rows retain identity. Query filtering makes no document reads or canonical requests. |
| 3. Compact command view | Command-first standalone LER; printable first-character handoff; immediate `*`, `@`, `~`; clickable selectors; `/` action interface; literal field input; `\|` reserved. Enter/index links, Shift+Enter prepares, Right inspects. | Real Chrome verifies first-character insertion exactly once and native query select-all. Unit tests cover editing, IME guards, layered Escape and remapped bindings. Existing Scry source editing retains its distinct focus context. |
| 4. Expansion and review | Expansion uses A, with case-insensitive whole-word defaults when appropriate; advanced case/substring/regex rules; owned-only search; preview, exclusions and manual C review. Prepared entity and accepted count remain visible. | Stale accepted ranges block commit until refreshed or excluded. Final validation precedes native batch annotation. Empty accepted sets never fall back to A. One Undo/Redo covers the batch; a 300-range/100-Block test verifies one commit without snapshots. Scry draft plus batch remains atomic. |
| 5. Advanced capabilities and qualification | Creation/recovery, rename/aliases, authority panel, existing recent scopes, source boundaries and managed floating shells retained through contextual views. | Typecheck, focused tests and browser checks below pass. Scry geometry, zoom, source boundaries and lifecycle remain qualified without broad renderer or Window Manager changes. |

“Document Entities” means distinct entities linked in the active document’s owned content **now**, including unsaved changes. It opens with an empty local filter independently of the graph query, sorts by linked-occurrence count, and shows linked surface forms. “Saved document” continues to use saved resolver/index coverage. Unavailable canonical metadata leaves local identities/counts visible with a coverage notice.

The `/` interface presents actions; it does not implement a command parser or pipeline. Original ranges carry captured content, placement and version identity. Existing scoped services retain vault/source authority. No universal handoff record or cross-window session retention was introduced.

## Automated evidence

- `npm run typecheck`: passed, including client and server projects.
- **144 tests across 13 focused files passed** in the final combined run. Coverage includes entity views/controllers/listing/lifecycle, the new live index and keyboard interactions, text search, document entity notifications, autocomplete and provisional integration. An expansion integration test verifies foreign exclusion and deduplication of owned presentations through final annotation.
- `scripts/qualify-ler-browser.mjs`: **15 checks passed**, zero browser exceptions.
- `scripts/qualify-scry-browser.mjs`: **105 checks passed**, zero browser exceptions. Assertions were updated for progressive disclosure, compact dimensions, explicit preparation and layered Escape. Source, creation, alias, undo, geometry and lifecycle checks remain exercised.
- `git diff --check`: passed.

Browser harnesses use in-memory copies and an isolated entity resolver. They neither save fixture documents nor create entities in the user's vault. Screenshots were inspected for live browsing and advanced review; the latter keeps A, preparation and the Link action above the scrollable preview.

Reproduce focused tests:

```sh
npx vitest run src/features/entity-references \
  src/application/live-document-entities.test.ts \
  src/application/document-entity-changes.test.ts \
  src/runtime/text-search.test.ts \
  src/features/autocomplete/provisional-integration.test.ts \
  src/features/autocomplete/autocomplete.test.ts
node scripts/qualify-ler-browser.mjs
node scripts/qualify-scry-browser.mjs
```

## Real Flint typing measurements

Same native letter fixture, real Flint components, headless Chrome/SwiftShader, 40 alternating insert/delete events per run. Values are milliseconds, median / p95. The before sample was captured before implementation. Browser runs were kept separate from one another; these short samples still show substantial run-to-run variation.

| Scenario | Unopened vault entries | Handler | Through queued work |
| --- | ---: | ---: | ---: |
| Before, LER closed | 1,000 | 6.2 / 9.4 | 14.2 / 18.4 |
| After, LER closed | 1,000 | 7.4 / 11.4 | 16.8 / 25.1 |
| Live browsing, outside linked span | 1,000 | 6.6 / 8.7 | 15.3 / 17.1 |
| Live browsing, inside linked span, final index | 1,000 | 9.0 / 15.3 | 20.6 / 30.9 |
| Review open, final count handling | 1,000 | 7.9 / 10.9 | 17.6 / 24.1 |
| Live browsing, outside linked span | 0 | 12.9 / 27.9 | 16.9 / 38.6 |

Every measured scenario passed: **zero snapshots, service requests or worker starts; 40 document-status reads for 40 edits**, with either 1 or 1,001 Explorer rows. Open-LER scenarios also made **zero canonical entity reads/searches during measured typing**. Real Chrome text insertion and Undo restored the expected source.

Adapter/controller regressions additionally assert no unrelated content reads or inventory publications for offset-only edits; no canonical requests for edited surfaces; preserved unrelated row DOM; and no full target-selection/count scan during review invalidation. Initial inventory construction, explicit expansion and explicit refresh may read their owned scope. They are not per-keystroke work.

The timings do **not** establish unchanged latency: final inside-span samples are slower than the closed baseline, and the zero-entry run was noisier than the 1,000-entry run. Bounded-work assertions pass, but headless frame timing is not input-to-display latency certification. No renderer changes were made to chase this variance.

To reproduce a scenario, set `BENCHMARK_OUTPUT`, `BENCHMARK_VAULT_SIZE=1000` and optionally `BENCHMARK_LER=live|review`, `BENCHMARK_LER_INSIDE=1` before running `node scripts/benchmark-flint-typing-browser.mjs`. Local artifacts are under `/tmp/ler-before`, `/tmp/ler-after-closed-final`, `/tmp/ler-after-live-outside`, `/tmp/ler-live-inside-final`, `/tmp/ler-review-final`, `/tmp/ler-after-live-zero`, `/tmp/ler-browser-qualified` and `/tmp/ler-scry-browser`.

## Remaining manual qualification

VoiceOver/NVDA, real OS IME sessions and headed input-to-display latency have not been manually qualified. Automated composition guards, native field behavior, real browser input, geometry and zoom checks passed. Authority providers and canonical persistence were not exercised against live external services; their retained service paths are covered by the existing tests, and browser creation uses the isolated resolver.
