# Mutable OS Task Lists Legacy Investigation and Implementation Plan

Recommend **B: a targeted refactor** that preserves legacy checkbox data and adds task state to existing list items. This plan covers compatibility, prefix recognition, interaction, editing, interchange and qualification.

**Status:** Approach B implemented and qualified. See [Task Lists Qualification](TASK_LISTS_QUALIFICATION.md) for results and limits. The investigation findings describe the pre-implementation baseline.

## Existing implementation

| Area | Finding |
| --- | --- |
| Persistent model | Legacy `checkbox-block` stores a top-level `checked` boolean and owns child Blocks. It is not a standoff annotation. |
| Legacy creation | `DocumentBlock.makeCheckbox()` wraps an existing Block. The old text processor recognises `[ ]`, without the proposed complete-prefix rules. |
| Current rendering | `CheckboxView()` renders a native checkbox and changes `payload.checked` through `setPayloadField()`. |
| Persistence and history | Browser probes confirmed toggling, Undo/Redo, native serialization/reload, and retention of `checked` in native clipboard data. Moving the wrapper preserved placement, state and descendants. |
| Compound content | Checkbox wrappers can contain multiple Blocks. `data/checkbox-test.json` includes checked and unchecked examples wrapping TextBlocks, PlainTextBlocks and a TabRow. |
| List metadata | `htmlListItem` currently identifies imported compound items and holds numbering overrides. It has no implemented task-state field. |

Legacy checkbox documents require continued support. The native persistence checks exercised serialization and reload in memory; they did not write a user document to disk.

## Defects and limitations

The current renderer places all child content inside a `<label>`. A real mouse click on task text toggled the enclosing checkbox and moved focus to the checkbox. Text editing and completion toggling therefore have overlapping activation areas.

- A checkbox wrapper inside a list displays both the list bullet and its checkbox.

- Enter creates another paragraph inside the checkbox wrapper rather than another task.

- Tab on its text creates a nested list inside the wrapper rather than indenting the logical task.

- One checkbox toggle rebuilt both mounted projections in the browser probe.

- Space toggles a focused checkbox, but there is no task-aware command for toggling completion from the task text.

Nested content can render, and existing list collapse helpers provide useful building blocks. Task-aware nesting, exit and compound-item behaviour still need qualification.

The old `CheckboxBlock` uses inconsistent history notifications and attribute-based checkbox updates. Those mechanisms should not be carried into the current implementation. Current reactive Undo/Redo was verified; legacy-engine Undo was not.

### Interchange gaps

| Format | Current behaviour |
| --- | --- |
| Markdown import | Retains `[ ]` and `[x]` as literal item text. |
| HTML import | Removes `<input>` elements, including checked state, under its existing sanitization policy. |
| HTML and Markdown export | Falls back to a `[checkbox-block]` label and child content rather than task semantics. |
| Native representation | Preserves the `checked` payload field through serialization/reload and native clipboard data. |

## Recommended architecture

Use **item-level task state**, rather than a specialised task-list container. Reuse the existing `checked` field with the following semantics:

| Item | State |
| --- | --- |
| Ordinary item with no `checked` field | Ordinary list item |
| `checked: false` | Unchecked task |
| `checked: true` | Checked task |
| Legacy `checkbox-block` without `checked` | Unchecked task, preserving legacy semantics |

Apply task state to the logical item: the direct TextBlock, or the ContainerBlock for a compound item. Retain `htmlListItem` for compound-item identity and numbering metadata.

Existing `checkbox-block` wrappers remain intact and use the same task-state accessor, toggle command and checkbox control. Preserve the original TextBlock identity, annotations, owned relations and placement semantics.

This supports mixed ordinary and task items without a new Block type or mandatory migration. Pure reuse would retain the wrapper-editing and interaction defects. Replacement would unnecessarily disturb existing identities and complex legacy content.

### Proposed structures

The XML illustrates DTO fields; `checked` is stored in the canonical payload.

```xml
<indented-list-block metadata='{"htmlList":{"ordered":false}}'>
  <standoff-editor-block id="A" checked="false">
    <text>Review the draft</text>
    <!-- Existing annotations, relations and children retained -->
  </standoff-editor-block>

  <container-block id="B" checked="true"
                  metadata='{"htmlListItem":{}}'>
    <standoff-editor-block id="B1">
      <text>Completed task</text>
    </standoff-editor-block>
    <standoff-editor-block id="B2">
      <text>Supporting detail</text>
    </standoff-editor-block>
    <indented-list-block>
      <!-- Nested items -->
    </indented-list-block>
  </container-block>

  <standoff-editor-block id="C">
    <text>Ordinary item without a checkbox</text>
  </standoff-editor-block>
</indented-list-block>
```

Legacy structure remains supported unchanged:

```xml
<checkbox-block id="legacy-item" checked="true">
  <standoff-editor-block id="original-text">
    <text>Existing task</text>
  </standoff-editor-block>
</checkbox-block>
```

## Proposed interaction

- Replace the bullet with a checkbox. Use a separate disclosure control for collapse.

- Keep the Block handle in its own gutter. Existing handles are faintly visible at rest; task-row styling can reveal them only on hover, selection or keyboard focus.

- Only the checkbox hit area toggles completion. Text, disclosure controls and drag handles must not activate it.

- Pointer toggling preserves the text caret and selection. Retain keyboard focus and native Space activation.

- Provide a rebindable **Toggle task completion** command without taking over Scry shortcuts.

- Enter creates an **unchecked** next task, regardless of the preceding task’s state.

- Enter on an empty task follows existing list-exit behaviour and removes task status when returning to ordinary text.

- Tab and Shift-Tab move the logical item with its descendants and completion state.

- Within compound items, preserve ordinary paragraph editing. Create a next task only at the agreed item boundary, not after every child paragraph.

- Checked styling is presentation only; it must not add or remove text annotations.

## Prefix recognition and undo

The existing immediate conversion of `- ` conflicts with recognising complete task prefixes:

```text
type "- " → immediately becomes a list
type "[ ] " → now inside that list, where conversion is prohibited
```

### Recommended disambiguation

Track a narrow continuation of a **fresh automatic conversion**:

1. Keep immediate `- ` conversion.

2. If `[` immediately follows in that untouched, newly created empty item, restore the literal `- [` in the original TextBlock.

3. Complete `- [ ] `, `- [x] ` or `- [X] ` through the normal native conversion path.

4. Clear continuation eligibility on navigation, selection changes, unrelated edits, paste, composition or Scry interception.

Previously existing list items remain literal. Restoring the literal candidate before final conversion allows the proposed conversion operation to restore the complete prefix with one Undo, without rewriting arbitrary history. The restoration must preserve original prefix annotations through a bounded conversion record.

The approved review requested comparison with direct conversion inside the fresh list. That comparison below selects native restoration to preserve exact literal-prefix Undo without introducing synthetic history.

### Conversion constraints

Reuse `indented-list-block`, native inline prefix removal and the existing automatic conversion machinery. Recognise completion by a user-typed space only in eligible contexts; preserve the single-selection and caret requirements and exclude composition, paste, literal/code contexts and Scry-owned input.

Restore the caret at the beginning of the task text. One Undo must restore the complete literal prefix, including uppercase `X` when typed, and the original Block structure. Redo must restore task structure and completion state. Preserve existing `- `, `* ` and positive-integer ordered-list conversion.

## Implementation increments

1. **Task model and compatibility:** introduce shared task-state and logical-item resolution; retain legacy wrappers without migration.

2. **Safe rendering and toggling:** remove enclosing-label activation, separate checkbox/disclosure/handle hit areas, and make toggles independently undoable with local updates.

3. **Prefix conversion:** implement the agreed disambiguation policy, native prefix removal and exact literal-prefix Undo using the existing list conversion machinery.

4. **Task-specific editing:** add unchecked continuation, empty-item exit, state-preserving indentation and movement, and narrowly defined compound boundaries.

5. **Interchange and qualification:** recognise task semantics in Markdown and safe HTML import; export checked state explicitly. Preserve native persistence and manual saving.

Do not introduce a new Block type, migrate legacy documents, implement general list merging or undertake a general ContainerBlock editing rewrite. Keep dirty-state tracking cheap and retain manual document saving.

## Qualification plan

| Area | Required coverage |
| --- | --- |
| Prefixes | `- [ ] `, `- [x] ` and `- [X] `; existing ordinary and ordered prefixes without regression |
| History and caret | Exact literal-prefix Undo, Redo, original identity and annotations, caret recovery |
| Input isolation | Scry, IME/composition, paste, literal/code contexts, multiple selections and ineligible caret positions |
| Controls | Pointer and keyboard activation; text, disclosure and handle isolation; selection preservation |
| Structure | Mixed items, nested and collapsed branches, compound and legacy items, movement and indentation |
| Editing | Unchecked next task, empty-task exit, agreed compound Enter boundary and outermost outdent policy |
| Persistence and interchange | Native state round trips, clipboard state, semantic Markdown and safe HTML round trips |
| Bounded work | No snapshots or unrelated projection rebuilds during conversion/toggling; no word-count or entity-inventory refresh for completion-only changes |

Benchmark annotated, nested documents with the real Flint typing harness. Unmatched input must not enter structural transactions or snapshot paths. Compare task conversion with established prefix measurements; measured results are in the qualification report. Headless handler timing must not be presented as guaranteed user-visible latency.

### Investigation results

| Probe | Result |
| --- | --- |
| Checkbox click | Completion toggled |
| Undo and Redo | Completion restored correctly |
| Native serialization and reload | Checked state retained |
| Native clipboard representation | Checked state retained |
| Wrapper movement | Placement, state and two descendants retained |
| Keyboard Space on checkbox | Completion toggled |
| Real mouse click on task text | Completion toggled and checkbox took focus, confirming the interaction defect |
| Toggle projection work | Both mounted projections rebuilt |
| Checkbox inside list | Bullet and checkbox both visible |
| Enter inside wrapper | Added a paragraph within the wrapper |
| Tab inside wrapper | Created an inner list rather than indenting the logical task |

## Approved refinements and prefix comparison

Outermost outdent preserves completion on a standalone task-bearing Block. Compound items retain paragraph editing; a collapsed caret at the end of their final direct paragraph creates an unchecked sibling task. Selected-text Enter and internal paragraph boundaries remain paragraph editing. Shared task operations cover direct TextBlocks, compound ContainerBlocks and legacy checkbox wrappers.

| Concern | Direct item conversion with history coalescing | Native restoration and conversion |
| --- | --- | --- |
| Live structure | Keeps the original list wrapper throughout. | Reverses the fresh wrap on the first bracket; final conversion creates a new wrapper. Original TextBlock identity and descendants remain intact. |
| One-step literal Undo | Ordinary coalescing returns to `- `, not the never-authored full literal prefix. Requires a synthetic baseline and rebased preceding history entries. | The full literal prefix exists before conversion. Its native inverse restores text, structure and exact annotations. |
| Repeated Undo and Redo | Needs new history semantics and journal qualification; rewriting only the final inverse leaves earlier entries inconsistent. | Reuses the existing native history branch and exact inverses, including preceding typing. |
| Annotations | Must reconstruct the original prefix annotations and rebase virtual suffix edits in the synthetic baseline. | The fresh wrap inverse restores original prefix Cells and annotations before ordinary native typing continues. |
| Complexity | Lower live structural work, higher history complexity. | More local structural changes, no new history storage or coalescing API. |
| Performance | Potentially cheaper live conversion, but not implemented or benchmarked. | Uses existing bounded list-wrap validation and projection updates. Qualification measures the full continuation as well as final conversion. |

**Selected approach:** native restoration. A weak, occurrence-specific candidate records only placement, view, repository revision and a bounded prefix string. It is eligible only immediately after automatic hyphen-space conversion. Navigation, selection changes, paste, composition, unrelated mutations and Scry-owned input invalidate it. There is no open transaction or full-document draft across keystrokes.

The initial reversal is guarded by the exact unchanged repository revision and available Undo history. It restores only the immediately preceding automatic list conversion. Subsequent native typing creates a normal history branch. The final conversion removes the entire literal prefix and sets completion in one command; one Undo restores the full literal, including uppercase `X`.

Scry normally reserves the first opening bracket provisionally. For an untouched fresh task candidate only, it yields that bracket to task recognition. A second opening bracket transfers ownership to Scry and restores the list context; active Scry sessions always retain their input. This is a narrow coordination rule, not a general input or handoff framework.

New task input and editing use the default-enabled `taskLists` feature flag, following repository conventions. Legacy checkbox data and safe checkbox interaction remain supported. No document migration, Block type, serialized format change or automatic save is introduced.

## Qualification requirements

The qualification report records the final checks and measured timings. Required evidence includes exact literal-prefix Undo and Redo, replay of the native history journal, original TextBlock identity and annotation preservation, Scry arbitration, task and compound editing, separate checkbox/disclosure/Block-handle hit areas, native and semantic round trips, and real Flint input measurements.

Completion-only mutations must use a locally validated payload update. They must not rebuild projections, schedule word counts, refresh entity inventories or invalidate backlink summaries. Ordinary unmatched typing must retain its existing bounded path.

## Code reference

Paths are relative to the `speedy-ts-reactive` repository.

| Concern | Main references |
| --- | --- |
| Legacy model and creation | `src/blocks/checkbox-block.ts`; `src/blocks/document-block.ts` — `makeCheckbox()`; `src/library/text-processor.ts` |
| Current checkbox rendering | `src/rendering/core-block-views.tsx` — `CheckboxView()`; `src/rendering/register-core-views.ts` |
| List ownership and conversion | `src/runtime/text-lists.ts` — `listItemOwner()`, `listItemChildren()`, `wrapTextBlockInList()`, `convertTypedListPrefix()`, `exitEmptyListItem()` |
| Commands and input interception | `src/block-tree/commands.ts`; `src/input/gateway.ts` |
| Import and export | `src/interchange/markdown-import.ts`; `src/interchange/html-import.ts`; `src/interchange/html-ast.ts`; `src/interchange/export-plan.ts` |
| Native clipboard and persistence | `src/interchange/serializer.ts`; `src/persistence/native-resource.ts`; `src/block-tree/codecs.ts` |
| Handles and list styling | `src/rendering/block-selection.tsx`; `src/rendering/block-selection.css`; `src/index.css` |
| Legacy examples | `data/checkbox-test.json`; `data/test.json`; `data/clock.json`; `data/blur.json` |

