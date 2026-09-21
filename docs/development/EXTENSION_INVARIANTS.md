# Extension contracts and invariants

These rules are more important than the shape of any one interface.

| Rule | Why | What breaks when violated |
| --- | --- | --- |
| Treat `CanonicalRepository` state as read-only; mutate through `TreeCommands`. | Commands clone data, validate intent, attach identity/metadata, and publish one consistent commit. | Solid may miss changes; derived indexes, undo, persistence, and history can disagree. |
| Never mutate `BlockTreeProjection` or `BlockNode.payload`. | A projection is reconstructed from canonical records and may have several occurrences. | The next projection update overwrites the change; other views and save output never see it. |
| Keep authored `payload.id` stable. | References and Block-scoped history identify authored Blocks across save/reopen. | Links and historical lookup cannot reliably follow the Block. |
| Do not persist `NodeKey`, `ContentKey`, or runtime `PlacementKey` as a semantic Block reference. | They are runtime identities; `NodeKey` is also view/route-specific. | Reopen or another view points at nothing or the wrong occurrence. Use authored IDs and explicit reference formats. |
| Distinguish content, placement, and occurrence. | Shared/transcluded content may appear through several edges and views. | A local focus/layout action may accidentally edit shared content, or a shared edit may be stored only in one occurrence. |
| Preserve owned versus reference placement semantics. | Ownership determines reachability/lifetime; reference edges share without owning. | Removing a reference can delete the source, or cycles/orphans can enter the graph. |
| Use structural commands for children, inline content, and relations. | These fields require placement/location/cycle validation and pruning. | `setPayloadField` rejects `children`/`relation`; hand-built records can corrupt ownership. |
| Keep persisted payload JSON-shaped. | Cloning, codecs, commit capture, workers, and hashing assume data values. | Functions, DOM nodes, class instances, sparse arrays, or cycles fail serialization/history. |
| One user action should normally be one command/transaction. | Undo labels, validation, rendering, and durable grouping operate at commit boundaries. | One gesture becomes many undo steps and excessive projection/history work. |
| Use specific command descriptors for authored changes. | Durable grouping/genealogy and Block attribution use command IDs and subjects. | Raw commits fall back to an unattributed `repository.commit` event. |
| A view owns and cleans up its DOM effects. | Solid can remount occurrences; portals can outlive local tree positions. | Stale listeners/observers target removed DOM, duplicate actions, or leak memory. |
| Register a `MountHandle` for gateway/focus/measurement participation. | The gateway maps browser events to model occurrences through mounts. | Input is routed to an ancestor or cannot capture/restore selection. |
| Keep browser selection/session state outside canonical content. | Selection is view-specific and ephemeral, especially with multiple views. | Saving one view's caret changes document semantics and mirrors fight over selection. |
| Let native text input use `beforeinput`/composition; do not infer typed text from `keydown`. | Keyboard events do not model IME, paste, dictation, or all Unicode input. | Text duplicates, composition breaks, and caret/range mapping drifts. |
| Standoff edit APIs use half-open boundaries; persisted active ranges are inclusive. | Replacement and semantic ranges have different natural forms. | Properties grow/shrink at the wrong edge or address the wrong Cells. |
| Derive graphical coordinates from current DOM; never persist pixels. | Reflow, zoom, fonts, scrolling, and window size change geometry. | Decorations detach from their semantic targets. |
| Coalesce geometry measurement and observe every real layout cause. | DOM measurement is expensive and only correct after layout. | Jank from repeated layout or stale SVG after resize/image/font changes. |
| Passive decoration SVG should not capture pointer/accessibility input. | The editable DOM and explicit HTML controls own interaction. | Caret placement and screen-reader output become unreliable. |
| Register every Block view for every editor instance. | Registries are per `ReactiveEditor`; discovery is explicit. | The same saved type renders as `UnknownBlockView` in a new/load path. |
| Use generic codecs unless the normalized representation truly differs. | Generic payload/children round-tripping preserves legacy wire details. | Unnecessary codec branches create format divergence and compatibility risk. |
| Unknown data must survive when it is not owned by the extension. | Codex loads legacy/future fields and opaque relations. | Saving with the extension silently deletes data it did not understand. |
| Treat history restore as a new command. | Durable history is immutable evidence; current state remains independently undoable. | Rewriting archive state invalidates chronology and verification. |

## Renderer assumptions

A registered Block view receives only `nodeKey`. It obtains the active editor/projection through `useReactiveView`, reads reactive node fields, and may be mounted more than once for shared content. The view must tolerate its node disappearing during cleanup. `BlockOutlet` adds the general Block-selection handle after the registered view; do not assume your component is the only sibling DOM for an occurrence.

## Selection assumptions

`SelectionService` stores Cell-boundary selections per occurrence. Native browser selection is an adapter/input, not authority. Structural commands may invalidate occurrences; editor subscribers prune Block selection and close overlays with missing owners. If an operation needs to retain a caret, capture logical boundaries before the commit and restore after projection/DOM update.

## Persistence assumptions

Normal document codecs preserve payload and known structure, but runtime state is disposable. Verify that a fresh `ReactiveEditor(encodedDto)` plus registration reproduces the feature. An extension which only works without reconstructing the editor is incomplete.
