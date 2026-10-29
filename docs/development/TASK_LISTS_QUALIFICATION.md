# Mutable OS Task Lists Qualification

Approach B is implemented: native TextBlocks and compound ContainerBlocks carry optional `checked` state, while legacy `checkbox-block` documents remain supported without migration. The default-enabled `taskLists` flag controls new task input, presentation and editing. Manual document saving is unchanged.

## Prefix decision

The [plan comparison](TASK_LISTS_LEGACY_INVESTIGATION_AND_IMPLEMENTATION_PLAN.md#approved-refinements-and-prefix-comparison) selects native restoration. Keeping the fresh list wrapper while coalescing existing Undo entries would restore only the original `- `; the complete task prefix never existed in that ordinary Block. Recovering it requires a synthetic baseline and rebased preceding history entries, including annotation state. Playback grouping does not provide those Undo semantics.

Immediate `- ` conversion remains. If the first `[` follows in that untouched item, a revision-guarded inverse restores the original prefix and its annotations. Native typing then completes `- [ ] `, `- [x] ` or `- [X] `; the final conversion removes the prefix and sets completion in one command. One Undo restores the complete literal prefix and ordinary Block. Redo, repeated Undo and durable history replay are qualified.

The original TextBlock, placement, annotations, relations and descendants remain intact; the list wrapper is recreated. This is the deliberate tradeoff against the proposed direct-conversion alternative. Recognition uses a bounded occurrence-specific receipt, with no open transaction across keystrokes. Navigation, selection changes, composition, paste, unrelated changes and Scry ownership invalidate it. A second opening bracket transfers to Scry in list context.

## Five increments delivered

| Increment | Result |
| --- | --- |
| Model and compatibility | Shared task-state resolution and mutation for direct TextBlocks, ContainerBlocks and legacy checkbox wrappers. State is persistent payload data, independent of rendering. |
| Controls and rendering | Separate native checkbox, child-list disclosure and Block-handle hit areas. Clicking text does not toggle completion. Pointer toggles preserve selection; Space operates a focused checkbox. `task.toggle` is rebindable without a default Scry-conflicting shortcut. |
| Prefix conversion | Fresh hyphen-list continuation only; exact checked/unchecked and uppercase literal-prefix Undo. Existing hyphen, asterisk and ordered conversion remain qualified. |
| Editing | Enter creates an unchecked sibling; ordinary internal compound paragraphs split normally. Only a collapsed caret at the end of the final direct paragraph continues a compound task. Tab/Shift-Tab move the logical task. Outermost outdent retains a standalone task and descendants. Empty-task exit returns to ordinary text. |
| Interchange and qualification | Semantic Markdown and safe leading HTML checkboxes import/export completion, including mixed and compound items. Native serialization/reload retains completion and collapse state. |

Task controls are added to existing renderer roots, retaining mounted text views and focus through Undo/Redo. A completion-only repository update changes indexed occurrences locally. It does not rebuild document projections, schedule word counts, rebuild entity inventories or refresh backlink summaries. Existing backlink navigation still uses repository-revision freshness checks when explicitly queried.

## Verification

- Reactive and server TypeScript checks passed with `npm run typecheck`.
- The affected regression checks and follow-up passed **473 tests**. Two additional failures in the isolated portable-document codec spike reproduce on unchanged `7aa2efd`; they are not introduced by task lists. The initial history-replay fixture needed an authored document ID; the corrected fixture passes all three prefix cases, including exact journal replay.
- The final focused run passed **114 tests** across task editing, prefix history, ordinary list prefixes and the standoff editor.
- Real Chromium with Flint components passed **61 checks** across existing lists and tasks. A final task-only run passed **18 checks**, including actual character input, keyboard Undo/Redo, pointer and Space activation, hit-area separation, nesting, collapse, standalone outdent and native serialization/reload. Both runs reported no browser exceptions.
- Bounded-work assertions cover snapshot-free task prefixes and direct-task Enter, no projection rebuilds on toggles, no word-count scheduling or live-entity inventory publication, and constant-work rejection of long unmatched prefixes. Existing 25k-document inline and list-wrap checks also passed.

Native reload checks use serialized bytes and a new editor in memory. They do not write user documents to disk. Semantic interchange preserves task meaning; it need not reproduce the same wrapper structure as native persistence. Arbitrary native controls inside legacy wrappers retain their existing editing behaviour; task paragraph editing targets standoff TextBlocks.

Evidence is retained in [evidence/task-lists](evidence/task-lists/): affected-suite and focused logs, baseline failure reproduction, browser results, screenshot and benchmark measurements.

## Flint performance

Before/after runs used unchanged `7aa2efd` and the implementation in separate sequential Chromium sessions. Ordinary typing used the existing 499-character paragraph in an eight-paragraph Michelangelo letter. Prefix runs added annotations and nested child Blocks, with 936 document characters, two warmups and 20 measured conversions.

| Synchronous handler measurement | Median | p95 |
| --- | ---: | ---: |
| Ordinary typing before | 8.4 ms | 11.1 ms |
| Ordinary typing after | 8.6 ms | 12.3 ms |
| Hyphen conversion before | 4.7 ms | 7.9 ms |
| Hyphen conversion after | 3.7 ms | 6.1 ms |
| Task final-space conversion | 4.5 ms | 9.2 ms |
| Task continuation, sum of five handlers | 14.8 ms | 23.8 ms |

The continuation sum covers initial hyphen-space conversion, `[`, `x`, `]` and final space; it is not time spent in one keystroke. All prefix measurements recorded **zero snapshots** and verified exact literal Undo. Ordinary typing recorded zero snapshots, save-status reads, unrelated vault-row updates or service requests, and restored the source text.

An additional annotated, nested *Masque of the Red Death* run covered **16,010 document characters**. Across 20 conversions after two warmups, the final task keystroke measured **5.5 ms median / 9.2 ms p95**; the five-handler continuation sum measured **17.8 / 25.2 ms**. It also recorded zero snapshots and passed literal Undo and real Chromium character input. The benchmark selects a mounted text occurrence, excluding hidden paragraphs from its input target.

These samples do not establish statistically significant timing parity or improvement. The ordinary-typing p95 increased by 1.2 ms in this pair; no extra whole-document work was observed. Headless frame waits remain diagnostic and are not presented as user-visible input latency. Task receipt selection tracking reuses the gateway's existing selection capture.

## Reproduction

```sh
npm run typecheck
npx vitest run src/rendering/task-lists.test.tsx src/rendering/task-prefix-comparison.test.tsx src/rendering/list-prefix.test.tsx src/rendering/standoff-editor-view.test.tsx
QUALIFY_TASK_LISTS=1 node scripts/qualify-text-lists-browser.mjs
BENCHMARK_LIST_PREFIX=1 BENCHMARK_LIST_PREFIX_RICH=1 BENCHMARK_TASK_PREFIX=1 node scripts/benchmark-flint-typing-browser.mjs
```

Use `QUALIFY_TASK_ONLY=1` for the focused browser run and `BENCHMARK_OUTPUT` for its artifact destination. `BENCHMARK_DOCUMENT_PATH` selects another native document fixture. These harnesses read fixtures into isolated sessions and do not save them.

General list merging, additional task prefixes, new Block types and broad ContainerBlock editing changes remain outside this implementation.
