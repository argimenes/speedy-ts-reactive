# Autocomplete interceptors and current editor integration

22 October 2026. Analysis and design recommendations only; no editor behaviour is changed.

The original [autocomplete component](../../src/library/original/components/autocomplete.js) combines Entity lookup, text substitution, annotation shorthand and relationship creation. Its strongest idea is resolving knowledge references while the user writes. Its implementation also mixes temporary UI with authored text, replaces editor keyboard handlers globally, and performs asynchronous writes without the current application's validation and lifecycle protections.

**The important semantic distinction:** in this implementation, `[[…]]` and `((…))` both ultimately create legacy `agent` standoff properties. Square brackets normally replace the input with the selected Entity's name; parentheses normally retain the input as the mention text. Neither delimiter inherently creates a Document reference, Block transclusion or backlink record. A backlink is the reverse view of a committed reference, not another name for its delimiters.

For the current editor, I recommend retaining that distinction between **target identity**, **authored mention text** and **search query**, while making Document references and Entity mentions separate choices. The existing Entity tool and native Document reference services provide much of the domain behaviour. A small occurrence-scoped autocomplete UI and input adapter would still be new work.

Navigation: [text patterns](#text-patterns-and-their-effects), [keys](#keyboard-interception), [UI and UX](#ui-and-ux-assessment), [function inventory](#function-inventory), [current editor integration](#integration-with-the-current-editor), [cross-system recommendations](#recommendations-informed-by-other-systems), [slash commands](#slash-commands).

## Reading map and interpretation boundaries

| Source | What it establishes |
| --- | --- |
| [autocomplete.js](../../src/library/original/components/autocomplete.js) | Patterns, keyboard overrides, search modes, popup, mutations and cleanup analysed below. |
| [text-add.js](../../src/library/original/parts/text-add.js#L420) | Connects `onTextChanged` to the interceptor; constructs it and connects ArrowSelector selections to `applyToSelection`. |
| [text-window bindings](../../src/library/original/bindings/text-window.js#L84) | External entry shortcuts `control-[` and `control-9`. |
| [original editor](../../src/library/original/modules/speedy/editor-new-2.js#L3116) | Calls the text-change hook after insertion; deletion also calls it when updating the caret. Character handlers intercept input before ordinary insertion. |
| [getMatches](../../src/library/original/helpers.js#L540) | Regex rules default to global, case-insensitive matching and report inclusive end indices. |
| [style schemas](../../src/library/original/tags/style.js) and [experimental schemas](../../src/library/original/tags/lab.js) | Clarify the visual meaning of unusual properties such as air-quotes, capital, todo and clock. |
| [current Entity tool documentation](LINK_ENTITY_REFERENCE.md) | Existing target/query separation, explicit creation, canonical Entity service and recovery boundaries. |

The legacy findings are a static reading of these paths, not a claim that every branch has been exercised against the old server. Interpretations of incomplete paths are identified below. Proposed bindings and patterns are not existing Mutable commands unless explicitly described as such.

## How a text change is processed

`handleTextChange` receives the current text container, its cells and caret. It processes the **whole supplied container text**, rather than just the newly inserted suffix:

1. Try completing an unfinished relationship between existing Entity annotations.
2. Find literal replacement strings and replace their first occurrence per replacement entry. If anything changed, restore the caret, close autocomplete and return.
3. Find annotation/command regex matches. Remove delimiters and apply properties or execute custom handlers. If a rule was processed, close autocomplete and return.
4. If not already searching, look for `[[`, `((`, `##` or `//`, set up a bracketed range and select a mode.
5. If active, reset pagination, derive the text inside the brackets and issue a search.

This ordering matters: substitutions and formatting rules run even during a lookup. Several rules can operate on the same original `text`/`cells` snapshot. The opener tests are independent `if` statements inside one initial state test, so mixed openers can overwrite one another's setup. There is no general escape grammar, nesting parser or caret-local token boundary here. The buffer's `maxInterval: 200` is not a working debounce for this pipeline.

## Text patterns and their effects

### Reference and relationship openers

| Input or action | Search and text mode | Result and interpretation |
| --- | --- | --- |
| `[[query` | Agents; Name; Replace | Auto-inserts `]]`; selected Entity name replaces the interior, an `agent` property holds its GUID, and brackets are removed. A canonical-name completion workflow. |
| `((mention` | Agents; Alias; Overlay | Auto-inserts `))`; retains the mention text, applies the selected Entity GUID as `agent`, then removes brackets. An annotation workflow for prose already written. Alias search does **not** itself add a canonical alias. |
| `##query` | Agents; Name; Replace; Hashtag | Inserts closing `##`. Incomplete hashtag specialization: choosing an existing candidate replaces text but skips the `Entity` annotation branch. Quick-adding still creates an `agent`; no explicit hashtag type is sent in that request. |
| `//relation` | Relationship endpoint; Name; Replace | Inserts closing `//`; selects a relation type and creates an unresolved `metaRelation` carrying `attributes.metaRelationTypeGuid`. Completion later attempts to connect flanking Entity annotations. |
| `))` by itself | None | Only a comment suggests alias-searching the preceding word. No implementation. |
| ArrowSelector selection | Agents; Name; Overlay | `applyToSelection` searches the selected text without adding bracket cells; normal confirmation annotates the original range. |
| `Ctrl+[` / `Ctrl+9` | Square / round modes above | Wrap the current word in the relevant brackets and start lookup. These are actual Control bindings, not automatic Command equivalents. |

`setupSearchArea` finds the first opener in the container. It inserts the closer immediately after it when followed by whitespace/a line break; otherwise it places the closer at the next word's end. Thus typing an opener before an existing word can wrap that word. It does not first establish that an appropriate closer is absent, so pasted complete syntax is not a safe general import path.

### Literal replacements

These use case-sensitive `indexOf`, with no word-boundary or code-context check. The replacement table is complete below. Multiple occurrences of one token are not all replaced in the same pass.

| Input | Replacement | Input | Replacement |
| --- | --- | --- | --- |
| `->` | ➤ | `<>` | 🔷 |
| `<3` | ❤️ | `>-` | ⤚ |
| `--` | — | `[ ]` | ☐ |
| `[X]` | ✅ | `:x:` | ❌ |
| `:P` | 😛 | `::` | ▀▄ |
| `(")` | ✌ | `:bolt:` | ⚡ |
| `:light:` | 💡 | `:time:` | ⏲️ |
| `:date:` | 📅 | `:watch:` | ⌚ |
| `:tent:` | ⛺ | `:thinking:` | 🤔 |
| `:joy:` | 😂 | `:grinning:` | 😀 |
| `:cry:` | 😢 | `:sweat:` | 😓 |
| `:disappointed:` | 😞 | `:anguished:` | 😧 |
| `:astonished:` | 😲 | `:dizzy_face:` | 😵 |
| `:open_mouth:` | 😮 | `:scream:` | 😱 |
| `:cold_sweat:` | 😰 | `b/n` | between |
| `c/d` | could | `w/d` | would |
| `r/n/s` | relations | `b/c` | because |

These are text changes, not structured tasks, dates or semantic Entities. For example, `[ ]` inserts a checkbox character; it does not establish task state.

### Formatting and annotation wrappers

For ordinary rules, the interior remains text, the wrapper cells are deleted, and the named property is created. Rendering and any animation belong to the corresponding property schema. Here `text` denotes the captured interior.

| Pattern | Property or operation |
| --- | --- |
| `^^text^^`, `/sup/text/` | `superscript`. Double carets are not highlighting in this implementation. |
| `~~text~~`, `/s/text/` | `strike`. |
| `_text_` | `italics`. |
| `__text__`, `/u/text/` | `underline`. The single-underscore rule runs earlier, creating an overlap hazard. |
| `*text*`, `/b/text/` | `bold`; unlike common Markdown's single-asterisk emphasis. |
| `` `text` `` | `code`. |
| `[(text)]` | `item-number`; delegates visual treatment to the schema. |
| `[<text>]` | `rectangle`; interpreted as a rectangle decoration around the range. |
| `<<text>>` | `capital`; the schema hides the starting character and inserts a decorative letter image from `/Images/hypnerotomachie/`. This is an ornamental initial, not ordinary uppercasing. |
| `""text""` | `air-quotes`; the schema places left/right air-quote images around the range. |
| `/sub/text/` | `subscript`. |
| `/spin/text/` | `clock`; its block animation rotates the containing element. It does not insert the current time. |
| `/todo/text/` | `todo`; the schema draws a numbered “todo” label above the range, rather than establishing checked/unchecked task state. |
| `/drop/text/` | `drop`; the schema defines a falling-text animation. The interceptor creates the decoration; this branch does not explicitly start its animation as it does for block-format rules. |
| `/h/text/` | `highlight`. |
| `/lg/text/`, `/sm/text/` | `size` with `2rem` or `0.75rem`. |
| `/arial/text/`, `/mono/text/` | `font` with `Arial` or `Monospace`. |
| `/red/text/`, `/blue/text/` | `colour` with `red` or `blue`. |

### Commands and custom patterns

| Pattern | Implemented action and qualification |
| --- | --- |
| `[image/URL]` | Creates a zero-point `image` property using the URL, invokes schema animation init/start, and deletes the entire token. |
| `/br/` | Removes the token and inserts an `hr` zero-point property at the following cell. Despite the name, this asks for a horizontal rule, not a newline. |
| `/pp/text/` | Removes wrappers and places 😼 before and after the retained text. |
| `/right/`, `/center/` | Removes token and creates block alignment from the following position to the container end. |
| `/h1/`, `/h2/`, `/h3/` | Applies size `2.5rem`, `2rem`, or `1.5rem` to the container text. These are visual sizes, not a semantic heading hierarchy. `/h3/` rereads container cells after removing the token; the others retain the earlier cell array. |
| `&&` | Attempts to reuse a preceding relationship operator, connect its earlier Entity to a following Entity, and annotate the `&&` range with the created relationship GUID. Does not remove `&&`. |
| URL-like text | A URL regex is present, but its custom handler immediately returns. It creates no reference. A match can nevertheless set `rulesProcessed` and end autocomplete handling. |
| `[today]` | Replaces token with local `dd/mm/yyyy`, calls `/Admin/Agent/FindOrCreate`, then annotates the inserted date as `agent` on success. This has an immediate server-side creation/find effect. |

`/i/text/` and automatic quotation annotation are commented out. Sentence regeneration is implemented but its call from the text-change pipeline is commented out. These are not active interceptors.

## Keyboard interception

The popup's `show()` installs replacements in `editor.event.keyboard`; `hide()` attempts to restore the handlers saved at construction. These overrides are editor-wide for that instance rather than a scoped popup binding lease.

### Keys while the popup is open

| Key | Method | Actual purpose |
| --- | --- | --- |
| Down / Up | `handleDownArrow`, `handleUpArrow` | Move candidate selection. Down at the last result may fetch and append another page. |
| Home / End | `handleHome`, `handleEnd` | Jump to first/last loaded candidate. |
| Enter | `handleEnter` | Choose candidate; when no results exist, quick-create an Entity or relation type. External endpoints import the selected record. |
| Escape | `handleEscape` | Delete bracket cells and close. Usually preserves interior text, but Reinstate mode has a loss-of-original-text risk described below. |
| Tab | `handleTab` | Toggle Name/Alias search, reset results and search again; does not move focus. |
| `*` | `handleScope` | Toggle Partial/Exact search. |
| `+` | `handleAddNewItem` | Explicit quick-add Entity/relation type, even if results exist. |
| `:` | `handleSearchInput` | Enter Reinstate: remember original surface text, delete it, let the user type another search string, then restore the original text when confirming a result. |
| `0`–`9` | `setIndexByNumber` | Immediately select and commit the zero-based candidate at that index. Digits are not inserted into the query. |
| Ctrl+K | `handleWikipediaSearch` | Toggle the Agents/“Wikipedia” endpoint. The external search actually calls Wikidata. |
| Ctrl+G | `handleGNDSearch` | Toggle GND/Agents search. |
| Ctrl+A | `toggleSelections` | Highlight matching occurrences throughout the Document for copying the eventual Entity annotation onto them. Not ordinary Select All. |
| Ctrl+C | `toggleContexts` | Cycle Graph/Local discovery. Not ordinary Copy. |

The `!ENTER`, `!TAB` and similar names are the original editor's event identifiers, not literal `!` keys. Numeric indices start at zero; additional loaded results can have indices beyond the ten directly addressable keys.

### Boundary adjustment keys

These move the actual delimiter cells, changing the annotation target and then repeating the search. “Left” and “right” below mean the opening and closing boundaries, not current caret movement.

| Binding | Boundary change |
| --- | --- |
| Ctrl+Left / Ctrl+Right | Closing boundary to previous/next word. |
| Ctrl+Shift+Left / Ctrl+Shift+Right | Closing boundary one character backward/forward. |
| Ctrl+Alt+Left / Ctrl+Alt+Right | Opening boundary to previous/next word. |
| Ctrl+Shift+Alt+Left / Ctrl+Shift+Alt+Right | Opening boundary one character backward/forward. |

The six Shift/Alt arrow combinations are installed by `attachHandlers` but absent from `editorHandlerNames`, so the normal restoration list does not restore them. Word adjustment relies on `\b(\w+)\b`; this is not a multilingual word-segmentation solution.

## Search and mutation behaviour

| Path | What it does |
| --- | --- |
| Graph Entity lookup | POST `/Admin/Agent/AutocompleteSearchJson` with query, Name/Alias flag, Exact flag, page, ten rows, frequency ordering and `Direction: "Ascending"`. The client does not establish what ranking that server combination ultimately produces. |
| Local lookup | Groups existing nondeleted `agent` properties by GUID, collects mention strings as aliases and sorts by descending reference count. It does not filter these groups by the current query or implement Exact matching. |
| Relationship lookup | POST `/Admin/Agent/SearchRelationsJson`. Relation cache is populated, but its read path is commented out, as is the Entity cache read path. |
| “Wikipedia” | JSONP to Wikidata `wbsearchentities`, English. Acceptance POSTs the selected record to `/Admin/Agent/AddWikipediaAgent`. |
| GND | GET `http://lobid.org/gnd/search`; maps authority metadata. Acceptance POSTs `/Admin/Agent/AddGNDAgent`. The literal endpoint is HTTP. |
| Entity creation | POST `/Admin/Agent/QuickAdd`, then annotate the current input range with the returned identity. |
| Relation creation | POST `/Admin/MetaRelationType/QuickAdd` for a type; later POST `/Admin/MetaRelation/QuickAdd` for the triple. |

Ordinary subsequent text changes dispatch through `fetchEntities` or `fetchRelations`, not a general dispatcher for the selected external endpoint. Consequently, toggling an external source is not a consistently maintained search mode. Responses do not have AbortControllers, query generations, owner-lifetime fences or target revalidation in this component; a late response can replace newer results or call `show()` after closure.

`scanForCompletions` checks the current container for the first unresolved `metaRelation`. If Entity annotations flank it, `completeMetaRelation` creates a server relationship and publishes `autocomplete/meta-relation-created`. This runs before normal pattern processing and again on close. There is no in-flight deduplication here. “Next” helpers compare annotation **end** positions, so they do not uniformly prove that an annotation starts after the operator.

## UI and UX assessment

### What is worth preserving

The popup is adjacent to the writing position, supports keyboard and pointer selection, and exposes candidate names, aliases, usage counts and optional media icons. Name completion and mention preservation are useful separate operations. Reinstate recognises a real need: a writer may want the visible text to be “he” but search for “Leonardo da Vinci.” Boundary adjustment and review of additional occurrences are also useful, provided they remain explicit and reversible.

### What would frustrate users

The panel is a draggable body-level element, 450px wide, with 375px scrolling result regions. It is positioned once from a cell's viewport rectangle using absolute page coordinates and raised through the old global z-index allocator. This component has no corresponding owner-group visibility policy, viewport clamping, scroll/zoom anchor invalidation or explicit disposal method. It lacks listbox/option semantics, active-descendant announcements and a clear loading/error/empty-result presentation.

More seriously, text being composed becomes a control surface: typing a digit chooses a result, `+` creates knowledge, and `:` temporarily deletes the prose. Tab stops being focus navigation, and Control shortcuts stop doing expected editing operations. An empty result list is especially dangerous: Enter cannot distinguish “create this Entity” from “continue writing” or “the search has not finished.”

The brackets are real editor cells marked `isBracket`, not merely a visual affordance. They disappear on confirmation; they are not the persisted representation of the link. Escape removes them too. In Reinstate mode, Escape never reinserts `originalText`, so the original surface text can be lost while the replacement query remains. `close()` itself does not generally remove brackets or clear all saved range state.

### Double brackets and double parentheses in Mutable

Examples of the legacy intent:

```text
[[leon]] + choose Leonardo da Vinci
    → Leonardo da Vinci, annotated with that Entity GUID

((the painter)) + choose Leonardo da Vinci
    → the painter, annotated with the same Entity GUID
```

The second example requires finding that Entity through an alias or an independently entered query; the code cannot infer the identity from arbitrary prose. Creating a mention must not silently teach a new canonical alias.

For the current product, the user's proposed vocabulary suggests a clearer split:

- **`[[…]]`: Document reference.** Choose a specific Document; optionally choose a supported Block target later. Its incoming reference is shown by the target's backlink service.
- **`((…))`: Entity mention.** Preserve the authored phrase; resolve an Entity through a separately editable query. Offer “Use canonical name” as an explicit alternative.

That is a deliberate change from the old square-bracket behaviour. It must be decided as a product rule before implementation. It also conflicts with the Roam/Logseq convention in which `((…))` refers to a Block; the recommendations below make that tradeoff explicit.

Entity GUIDs, Document IDs, Block IDs and view occurrence keys must remain distinct. Choosing an Entity named “Project Atlas” cannot imply a link to a Document with the same title. Search results should identify their target kind and location, and never resolve ambiguous names by guessing.

## Function inventory

This inventory groups all 98 declared methods of `Autocomplete`, including its constructor; names are preserved for source navigation. Result-model methods are covered separately.

### Construction and lifetime

| Methods | Purpose |
| --- | --- |
| `constructor` | Initializes Knockout state, bracket/range references, modes, results, cache, context and handler backup; constructs and mounts the popup. |
| `storeEditorHandlers`, `restoreEditorHandlers`, `copyHandlers` | Save/restore only the named keyboard handler subset. |
| `setEditorEvents` | Overwrite supplied keyboard handlers. |
| `load` | Append popup to `document.body` and make it jQuery-draggable. |
| `setMode` | Show for Replace/Overlay; hide for other modes when called through this method. Other code also sets `textMode` directly. |
| `attachHandlers`, `detachHandlers` | Install the popup keyboard map or restore the saved subset. |
| `show`, `hide` | Highlight first item/install handlers/raise/show, or hide/deactivate/restore handlers. |
| `close` | Hide, reset pagination/results/modes/context, attempt relationship completion and remove highlights. `buffer.length = 0` does not clear `buffer.values`. |
| `createPanel`, `setPositionFromCell` | Build the Knockout candidate UI; position beneath a cell. |

`TextMode.Command`, `State.Open`, `SearchMode.Relationship` and the sensitivity value have no effective workflow in this file. Graph/Local context uses a plain numeric field, so its computed label has no normal Knockout observable dependency. These declarations should not be treated as finished features.

### Text recognition and range operations

| Methods | Purpose |
| --- | --- |
| `handleTextChange` | Main completion/substitution/annotation/search pipeline. |
| `regenerateSentenceProperties` | Replaces contained `text/sentence` annotations with newly detected sentences; call disabled in the pipeline. |
| `applyToSelection` | Start annotation lookup over an existing range. |
| `setupSearchArea`, `wrapInBrackets` | Capture opener/create closer, or insert both delimiters around an existing word. |
| `findCurrentWord` | Locate the regex word containing the left side of the caret. |
| `handleControlSquareBracket`, `handleControlRoundBracket` | Wrap current word and start canonical-name or alias-preserving lookup. |
| `getInput` | Collect non-bracket cells between delimiters, or read the saved selection range. |
| `getRange` | Traverse the cell linked list inclusively from start to end; assumes the end is reachable. |
| `getRangeCells` | Intended interior traversal; loop never advances `current`. Appears unused and unsafe to call. |
| `removeCell`, `removeWrapper`, `removeBrackets` | Delete token cells without per-cell caret movement; bracket cleanup then marks/recalculates offsets. |
| `replaceTextWith` | Replace first matching literal token and restore caret. |
| `replaceTwoWith`, `replaceThreeWith` | Replace recent buffered cells; buffer population is not implemented here and these helpers are not invoked by the main pipeline. |
| `insertBeforeAnchor`, `insertAfterAnchor` | Delegate to editor cell insertion APIs. |
| `insertAfterNew` | Build character spans after an anchor and manually reconnect the linked list. |
| `insertAfter` | Older bracket insertion helper; calls `this.brackets.push` although brackets is an object, not an array. Appears unused. |
| `insertBefore`, `insertText` | Build text fragments, remove trailing carriage-return cell and manually reconnect neighbouring cells. `insertText` defaults to `range` anchors. |

### Search and result navigation

| Methods | Purpose |
| --- | --- |
| `fetchEntities`, `fetchEntitiesFromLocal`, `fetchRelations` | Fetch graph candidates, derive local candidates, or fetch relationship types. |
| `fetchWikipediaEntities`, `fetchGNDEntities` | Query external authority services and normalize results. |
| `setEntities`, `setResults`, `setRelations` | Set pagination/result models and show/update the panel. Relation append mistakenly appends raw results rather than the wrapped result models. |
| `handleWikipediaSearch`, `handleGNDSearch` | Toggle external/Agents sources and initiate a request. |
| `handleScope`, `handleTab`, `toggleContexts` | Change match strictness, Name/Alias or Graph/Local context. These call Entity fetching rather than consistently routing every source. |
| `handleHome`, `handleEnd`, `jumpTo` | Move to an absolute result index and highlight/scroll. |
| `handleUpArrow`, `handleDownArrow` | Move through candidates, including downwards pagination. |
| `highlight`, `highlightFirstItem`, `updateScroll` | Maintain selected-result appearance and visibility. Scroll queries the whole document by `data-agent-guid`; external models do not provide `Guid`. |
| `setIndexByNumber`, `entitySelected` | Set result index from digit or pointer and invoke confirmation. |

### Target adjustment

Each `handleControl…` method below moves a bracket edge and calls `updateSearchFromBracketSelection`, which reads the changed interior and fetches Entities.

| Handler | Movement implementation |
| --- | --- |
| `handleControlShiftAltRight` | `shiftLeftBracketToNextChar` |
| `handleControlAltLeft` | `shiftLeftBracketToPreviousWord` |
| `handleControlShiftAltLeft` | `shiftLeftBracketToPreviousChar` |
| `handleControlAltRight` | `shiftLeftBracketToNextWord` |
| `handleControlShiftRight` | `shiftRightBracketToNextChar` |
| `handleControlRight` | `shiftRightBracketToNextWord` |
| `handleControlShiftLeft` | `shiftRightBracketToPreviousChar` |
| `handleControlLeft` | `shiftRightBracketToPreviousWord` |

These eight `shift…` methods use `editor.moveCells`, then mark and update offsets. Their boundary guards are uneven; several word paths assume an adjacent word exists.

### Confirmation and knowledge mutations

| Methods | Purpose |
| --- | --- |
| `handleEnter` | Dispatch external import/new-item creation, or apply Replace/Overlay/Reinstate using the chosen candidate. |
| `handleEscape` | Remove delimiters and close without committing a chosen reference. |
| `handleSearchInput` | Store/delete surface text so another query can temporarily occupy its place. |
| `handleAddNewItem` | Route explicit creation to Entity or relation-type quick-add. |
| `handleAddNewEntity` | Create Entity, restore/replace/preserve text according to mode, annotate and close. |
| `handleAddNewRelation` | Create a relation type and unresolved property. It depends on `range.start/end`, which the ordinary bracket setup does not initialize. |
| `handleAddWikipediaEntity`, `handleAddGNDEntity` | Import authority result, optionally replace text, create `agent`, and close. Replacement uses `insertText`'s range defaults. |
| `toggleSelections`, `highlightMatches`, `highlightMatchesInContainer` | Toggle Document-wide word matches, excluding some already annotated ranges, and create temporary highlight properties. Query text is interpolated into a regex without escaping. |
| `copyEntityReferenceToHighlights`, `removeHighlights` | Annotate highlighted occurrences with the selected Entity, or remove highlight properties. |
| `scanForCompletions`, `completeMetaRelation` | Find unresolved relation and create a triple from flanking Entity properties; publish created-relation notification. |
| `extendMetaRelation` | Use `&&` to extend an earlier relation type to another Entity. |
| `getPreviousProperty`, `getNextProperty` | Find valued properties of a requested type near a cell in the container. |
| `getPreviousAgent`, `getNextAgent`, `getFlankingAgents` | Find Entity annotations around an unresolved relation. |

The result classes `EntitySearchResult`, `RelationSearchResult`, `WikidataSearchResult` and `GNDSearchResult` normalize different response shapes. Each has `constructor`, `setSelected`, `highlight`, `unhighlight` and `getName`; their name fields are respectively `Name`, `Name`, `label` and `preferredName`. Only the first two expose the `Guid` used by generic scrolling logic.

## Integration with the current editor

### Reuse boundaries

| Existing mechanism | Reuse and remaining work |
| --- | --- |
| [InputGateway](../../src/input/gateway.ts#L138) | Owns beforeinput, composition, selection and text edits. Add a narrow post-accepted-edit notification or equivalent adapter for eligible local input; no general autocomplete hook currently appears here. Do not install a competing document-wide input gateway. |
| [BindingRegistry](../../src/input/bindings.ts) | Use scoped actions while a completion session is eligible. Release the scope on cancellation/disposal; never overwrite saved keyboard maps. |
| [Entity capabilities](../../src/feature-api/entities.ts) and [Entity search](../../src/features/entity-references/search-view.tsx) | Reuse vault-scoped resolution, query cancellation, explicit Entity creation and outcome recovery. Existing Link/Replace & Link already distinguish target from query. The floating tool is not yet a reusable inline picker; share narrow service/action logic rather than embedding another editor or copying the entire tool. |
| [Annotation capabilities](../../src/application/annotation-capabilities.ts#L48) | `replaceAndAnnotate`, validation, temporary ranges and target watching supply mutation primitives. `watchTarget` deliberately invalidates a target when its own text changes; an inline typing session must update its own token snapshot through validated edits, not reuse a fixed selection snapshot indefinitely. |
| [Native Document references](../../src/application/vault-knowledge.ts#L145) | Current picker captures nonempty selected ranges, requires eligible source/target identity and creates `codex/block-reference` with target Block ID plus `metadata.documentId`. A collapsed-caret, delimiter-consuming insertion needs a small adapter and atomic command path; it is not already provided by `picker/createReference`. |
| [Canonical backlinks](../../src/application/canonical-backlinks.ts) | Derive incoming Document references from committed native annotations. Reuse coverage/currentness policies; do not maintain a second backlink table from typed brackets. |
| [ApplicationSurfacePortal](../../src/rendering/window-manager.tsx) and [tool anchoring](../../src/rendering/managed-floating-tool.ts) | Own a lightweight popup under its actual hosting application. Use existing positioning concepts and valid shared geometry where available; do not promise a complete cell cache where one is not implemented. |
| [Document sessions](../../src/application/document-sessions.ts) | Scope transient state to the live occurrence/session, not merely the shared Document ID. A picker must not act in a different Flint tab or window after activation changes. |

### Proposed minimal interaction lifecycle

1. Let the normal text edit commit immediately. Recognize a trigger only around that edit and caret in a supported editable text occurrence. Ignore paste/import, Undo/Redo, remote canonical updates, code/literal contexts, multiple carets and IME composition for an initial implementation.
2. Keep a transient session containing the source occurrence, canonical content identity, token boundaries, content version, query, target kind, request generation and popup state. Do not persist it.
3. Keep the browser caret in the editor. Filter local command metadata immediately; debounce/cancel remote knowledge queries and publish only results matching the current source/query generation.
4. On selection, validate both source range and canonical target identity again. In one transaction, remove the accepted syntax, preserve or replace the authored label as requested, and create the appropriate existing annotation. Restore caret after the committed range.
5. On cancellation, leave the user's literal text intact and create no reference. Suppress immediate retriggering on the same cancelled token until deliberate re-entry or a fresh trigger. This is a safer policy than the legacy unconditional bracket deletion.
6. Dismiss ephemeral results when the owner hides, the source closes, the caret exits the token, a modal takes ownership, or the target becomes stale. Abort optional reads and invalidate focus callbacks. An already dispatched Entity write needs the existing explicit recovery receipt, not silent abandonment.

Initially, keep typed delimiters as ordinary text and use a decoration or ghost closer rather than inserting additional closing cells automatically. If literal complete delimiters already exist, commit can consume the validated pair. This keeps cancellation simple and avoids new temporary canonical content. Selecting existing prose and invoking the Entity command should continue to use the current target/query tool without rewriting the selection into a query.

The acceptance transaction should undo to exactly the pre-acceptance text and caret. Entity database creation is a separate domain operation: Document Undo removes its mention, not the canonical Entity. Document edits mark the existing dirty state; Document and Workspace Save stay manual. Neither typing a trigger nor closing a popup should save or index a Document.

### Performance and qualification requirements

Recognition cost should follow the edited token, not the Document or vault. Avoid whole-container regex passes, document snapshots, full Entity inventories and geometry scans on ordinary typing. Reuse cached geometry when valid; otherwise measure only the anchor region in a coalesced frame, accounting for wrapping, scroll, zoom, fonts and owner geometry. Optional results must not delay immediate text feedback.

Qualification should cover literal escapes, empty/no-result states, digits/punctuation, same-name identities, cancellation without text loss, pasting complete syntax, cross-Block/multi-selection rejection, Unicode/graphemes, IME, Undo/Redo, delayed/out-of-order results, owner hide/close and Flint tab switches. Add bounded-work assertions for unrelated typing and backend calls. Use actual Flint browser typing measurements if implementation changes the input path; no such benchmark or load test is part of this analysis.

Ship any future substantial autocomplete feature behind a default-enabled flag with an exclusive ordinary-input fallback, following repository conventions. This document does not authorize its implementation.

## Recommendations informed by other systems

### Relevant conventions

These comparisons concern the documented interactions, not a proposal to copy the other systems' storage models. Sources were checked on 22 October 2026. Roam's public help is available here through its [readable help-graph mirror](https://roamdocs.fyi/); the direct application URLs return a JavaScript shell to the text reader. Logseq examples below refer to its published file-graph documentation; they should not be assumed to describe every newer DB-graph interaction.

| System | Documented convention | Useful lesson for Mutable |
| --- | --- | --- |
| Roam | `[[` opens page-reference suggestions; linked references collect incoming links. `(())` addresses reusable Blocks. Its `/` menu exposes references, embeds, formatting and other actions. | Distinguish a link to a knowledge resource from reuse of a Block's content. Keep commands discoverable while writing. [Page references](https://roamdocs.fyi/help/page-references), [Block references](https://roamdocs.fyi/help/block-references), [slash commands](https://roamdocs.fyi/help/commands). |
| Obsidian | Wikilinks support files, headings and Blocks, with display labels such as `[[Example\|Custom name]]`. Aliases are distinct from a one-off display label. Its core slash-command feature opens after a line start or whitespace. | Separate target identity from display text; scope triggers to plausible writing positions. [Internal links](https://obsidian.md/help/links), [aliases](https://obsidian.md/help/Linking%2Bnotes%2Band%2Bfiles/Aliases), [slash commands](https://obsidian.md/help/Plugins/Slash%2Bcommands). |
| Logseq | Its tutorial uses `[[` for pages, `((` for Blocks, `/` for commands, and Tab/Shift+Tab for outline indentation. Block references display referenced content; embeds include a richer branch presentation. | Keep outline navigation available, and make the difference between reference and embed visible. [Tutorial](https://github.com/logseq/docs/blob/master/pages/tutorial.md?plain=1), [Block references](https://github.com/logseq/docs/blob/master/pages/The%20basics%20of%20block%20references.md). |
| Notion | `[[` prioritizes page linking; `@` can mention people, pages or dates. `/` offers searchable content actions. | Show the target kind and likely action; use discoverable menus instead of requiring memorized syntax. Mutable's Entity mentions must not imply notifications. [Keyboard and slash commands](https://www.notion.com/help/keyboard-shortcuts), [mentions](https://www.notion.com/help/comments-mentions-and-reminders). |

The main compatibility tension is `((…))`: Mutable's legacy interpretation is an **Entity mention**, while the cited Roam/Logseq convention is a **Block reference**. Given the requested distinction, my recommendation is to retain parentheses for Entity mentions and use an explicit `/block` picker for Block references initially. Label the popup “Entity mention” so users see the difference immediately. If Roam-compatible typing later takes precedence, choose `((…))` for Blocks and `@` for Entities as an explicit alternative product decision; never let one untyped query silently select either kind.

### Suggested text patterns

These are proposed entry affordances. They should commit existing native structures where supported, not introduce a new persisted markup language. Begin with references and a command menu; the later rows can be enabled independently.

| Pattern | Recommended behaviour | Priority and boundary |
| --- | --- | --- |
| `[[query` | Search eligible Documents; explicit selection inserts a native reference with a readable label. | First: separate Document identity from title; show location for equal titles. No automatic new Document on an empty result. |
| `[[target\|label]]` | Optional display-label syntax: resolve target, retain `label` as authored text. | Follow-up. A pipe edits this occurrence's label; it does not rename a Document or create a canonical alias. Require a resolved target rather than binding by text alone. |
| `((phrase` | Resolve an Entity while preserving `phrase`; allow editing Search independently from Target. | First, matching the requested Entity-mention model. Canonical-name replacement is a separate explicit action. |
| `@query` | Optional quick insertion of an Entity's preferred name; use the same Entity service and picker. | Later convenience alias. Trigger at a word boundary, never inside an email address; no notification semantics. |
| `/query` | Filter available editor commands. | First. See the separate design below. |
| `# `, `## `, `### ` at Block start | Convert to a semantic heading level when the renderer/model supports it. | Formatting follow-up. Commit on the space; do not interpret a bare `#` as both a heading and a tag. |
| `- ` or `1. ` at Block start | Start an unordered/ordered list using existing list capabilities. | Follow-up. Preserve child Blocks; do not rebuild the Document from parsed Markdown. |
| `[ ] ` or `- [ ] ` at Block start | Create a genuine task with checked state, if a supported task model exists. | Capability-gated. A checkbox glyph alone is not a task. |
| `> ` at Block start | Apply a quotation Block style/structure. | Follow-up with a reversible conversion. |
| `**text**`, `*text*`, `~~text~~`, inline backticks | Bold, italic, strike and code shorthand through existing annotation commands. | Optional Markdown-like profile. This intentionally differs from legacy `*bold*` and `__underline__`; use longest-token precedence and never run formatting rules inside code. |
| `#topic` or `#[[multiword topic]]` | Candidate tag lookup, if Mutable defines canonical tag semantics. | Defer until “tag” means something explicit in Mutable. Do not revive the incomplete `##` path as a pseudo-Entity type. |
| `![[target]]` | Optional shorthand for an explicitly supported embed/transclusion. | Defer until the existing reference/transclusion path is qualified for that target. Do not imply a copy, independent view session or generic rehosting. |

Literal text must remain possible. A preceding backslash should suppress a proposed trigger in the input parser, and Escape should dismiss an already opened picker without deleting prose. This is an authoring rule, not a demand to reinterpret all stored backslashes on load. Pasted paths, URLs, code, mathematical parentheses and historical Documents should not be retroactively processed.

### Suggested key policy

The common actions should have simple, visible controls. Do not make a new Ctrl/Alt/Shift chord vocabulary the primary way to adjust target boundaries.

| Action | Proposed binding or policy |
| --- | --- |
| Open Entity reference for selected text | Keep existing **Ctrl+`;`, then `r`**, including on macOS, and the toolbar action. Do not replace this accepted binding. |
| Open Document reference for selected text | Candidate **Ctrl+`;`, then `d`** in the editor scope, subject to a full binding/conflict check before implementation. Also expose it in the toolbar/menu. |
| Open editor commands without typing a slash | Candidate **Ctrl+`;`, then `/`**, with a visible menu button for discoverability and mobile access. It preserves a nonempty selection as the command target. |
| Next/previous suggestion | Up/Down only while the completion list is open and belongs to the active text occurrence. |
| Accept suggestion | Enter for the highlighted, enabled result. Never let “no results” imply creation. While loading/no results, Enter should not be swallowed indefinitely; dismiss and let normal paragraph input proceed unless a visible submenu owns it. |
| Dismiss | Escape leaves the typed query literal and releases the completion scope. In a submenu, first Escape returns to the parent; the next dismisses. |
| Tab/Shift+Tab | Preserve focus/outline navigation. Close the popup without committing before forwarding the normal action; do not use Tab to toggle Name/Alias. |
| Home/End and Left/Right | Retain ordinary caret behaviour in the text editor. Leaving the token closes completion. A deliberately focused list may provide its own conventional navigation. |
| Digits, `+`, `*`, `:` | Ordinary query characters. No bare-digit commit, punctuation-driven creation or temporary deletion of the target. |
| Copy, Cut, Paste, Select All, Undo/Redo, Save | Preserve existing platform and application bindings. A completion session must not steal these operations. |
| Link navigation | Keep existing explicit Follow/Open actions. Offer a preview and context menu before assigning another global navigation shortcut. |

Do not borrow desktop-app `Cmd/Ctrl+P` as a new browser command palette shortcut. Preserve Mutable's established **Cmd/Ctrl+Shift+P Thesis action** as well. Candidate bindings above need testing on Mac Chrome, Windows browsers, international layouts and assistive technology; they are not declarations that every environment leaves them free.

### Reference picker presentation

Use a compact anchored popup with roughly six to eight visible results, a scrollable remainder and a stable footer. Show target type, canonical name/title, matched alias or snippet, and location where needed. Preserve the current highlighted candidate by identity as results stream in, so a late response does not change what Enter will choose.

For an Entity phrase that differs from its lookup query, the expanded form could read:

```text
Entity mention
Target: “the painter”        Keep authored text
Search: leonardo

› Leonardo da Vinci         Entity · matched name
  Leonardo DiCaprio         Entity · matched name

Link mention    Use canonical name    More options…
```

“More options” can open the existing Entity tool for aliases, creation and reviewed additional occurrences. Choosing that action must transfer a validated target bookmark explicitly; merely moving focus into the tool is not enough. The compact picker should not duplicate the full inspector's service subscriptions or mutation recovery UI.

Keep editor focus during ordinary inline completion. The optional separate Search field receives focus only when the user chooses to edit the query independently, with a clear return action. Use an accessible combobox/listbox relationship and active-result announcements; actionable controls belong in a separately navigable footer, not inside noninteractive options. Pointer selection must retain the source bookmark; touch should have an ordinary tap path without hover or modifier requirements. Verify the eventual contenteditable accessibility pattern in a real browser rather than assuming ARIA attributes alone establish it.

## Slash commands

This section uses **forward slash `/`** as requested by the example. Backslash `\` is reserved here for literal escaping.

The original `/sup/text/` and `/h1/` forms are completed-token substitutions. The proposed `/` UI is a searchable command picker: typing `/hea` suggests “Heading”; it does not require a final slash or execute while the user is still typing.

### Twelve starter command families

These are a product shortlist, not twelve already implemented actions. **Reuse** means there is a relevant existing service/workflow; it still needs a slash adapter and qualification. **Gated** means do not enable it until the named model/rendering capability is established.

| Command and aliases | Intended action | Initial delivery boundary |
| --- | --- | --- |
| `/link`, `/document` | Choose a Document and insert a native reference at the caret, or link an explicitly captured selection. | Reuse native reference identity/validation; add the collapsed-caret insertion adapter. Do not create a Document merely because search is empty. |
| `/entity`, `/mention` | Resolve and link an Entity; preserve selected prose or insert a name at an empty target. | Reuse Entity service and full tool for advanced actions. No silent canonical Entity creation. |
| `/block`, `/reference` | Find a specific Block, showing source Document and surrounding context, and insert a reference. | Gated on a supported arbitrary-Block selection/insertion path. Existing Document-root references alone do not prove this workflow. |
| `/embed`, `/transclude` | Choose a supported reference target and insert a live transclusion. | Gated on qualified canonical reuse, editing policy and cycle handling. Never disguise a text copy as a live embed. |
| `/backlinks` | Open incoming references for the current Document without inserting content. | Reuse the current host's backlinks capability; show its coverage and freshness. Label this as navigation, not insertion. |
| `/proposition`, `/thesis` | Create a Thesis draft from the captured selection using the existing source backlink workflow. | Reuse the established Thesis command; no auto-Save. Require a valid source selection and preserve existing draft/close protections. |
| `/heading`, `/h1`, `/h2`, `/h3` | Choose or directly apply a heading level to the current Block. | Gated on semantic heading support; legacy font sizes are not an adequate substitute. Preserve text and children. |
| `/list`, `/bullet`, `/number` | Choose unordered or ordered list presentation for the eligible current Block. | Reuse a qualified list conversion where available; otherwise gate. Keep Tab indentation separate from menu navigation. |
| `/todo`, `/task` | Create or convert to an unchecked task. | Gated on a persisted task-state contract and renderer. Do not emit only `☐`. |
| `/quote` | Convert the eligible Block into a quotation. | Reuse supported formatting/structure and Undo. If the selection is partial, offer an explicit whole-Block conversion rather than quietly extending it. |
| `/code` | Insert/convert a code Block, with a language choice when supported. | Gated on the selected renderer; an inline-code alternative can use existing annotations. Turn off other text interceptors inside code. |
| `/date`, `/today` | Open a date chooser or insert today's local date with a visible format preview. | Plain date text is the smallest initial action. A journal/Entity link is a separate explicit choice, not a hidden server write. |

For a small first implementation, prioritize `/link`, `/entity`, `/backlinks`, `/proposition` and `/date`, plus whichever formatting commands already have a qualified native handler. Keep `/block` and `/embed` visible in this design backlog but unavailable in the shipped picker until their functionality exists. Additional candidates after this set are `/image`, `/citation`, `/divider`, `/template` and `/highlight`; none requires enlarging the first release to a universal insert menu.

### Triggering and matching

- Open after `/` at Block start or after whitespace in eligible prose. A slash in `https://`, `and/or`, a filename, or a code span does not open the menu. If an initially plausible slash becomes a path or noncommand token, dismiss without modifying it.
- A second slash should dismiss the single-slash menu and remain literal initially. The legacy `//relationship//` workflow should not compete with commands or URL input; a future explicit `/relationship` would be easier to understand.
- Match names, aliases and concise descriptions locally. Rank exact command/alias matches before fuzzy matches. Keep the initial list predictable rather than rearranging it during an interaction based on usage telemetry.
- Recognize only the active token, with a modest query-length bound. Never rescan earlier paragraphs for `/todo/` or execute commands from pasted text, restored workspaces or another occurrence's edits.
- Opening commands from a toolbar or binding with selected text uses that captured selection. Typing `/` over a native selection still follows ordinary replacement semantics; do not pretend the replaced text is an intact command target.

### Menu UI

Place the menu near the caret, below when space permits and above when necessary, within the owning application surface. Re-anchor on valid geometry changes or dismiss safely. Use the same transient completion controller as reference lookup, with a local command provider instead of a second input system.

```text
Document text: /li│

┌ Insert or act ────────────────────────────────────┐
│ › Link Document      Reference an existing note   │
│   List               Bulleted or numbered         │
│   Entity mention     Link a person or concept     │
│                                                   │
│ ↑↓ Choose     Enter Continue     Esc Keep text    │
└───────────────────────────────────────────────────┘
```

This sketch illustrates labels and controls, not exact ranking. An actual `/li` result set should follow the specified name/alias/description matching. Group results into **References**, **Structure**, **Formatting** and **Actions** only when enough results exist to justify grouping. Show the action's effect and any existing keyboard shortcut. Avoid internal API names, IDs and feature-flag terminology in the normal menu.

Selecting a command that needs arguments opens a small second step in the same popup: Document candidates, Entity candidates, heading levels or a date picker. Show a breadcrumb such as “Insert → Document reference,” retain the source bookmark and offer Back/Cancel. Use the existing full tool when a complex workflow needs it. Missing permissions or an ineligible target should produce a brief explanation, not an enabled action that fails after consuming the user's text.

### Commit and cancellation

Keep `/query` literal until the user confirms an executable action and any required arguments. Insert/format actions should remove the validated command token and make their content change in **one native Undo transaction**. If the action fails or its target becomes stale, preserve the text and explain the failure. Do not remove the token before awaiting a remote lookup.

For navigation-only actions such as `/backlinks`, opening the UI must not rewrite unrelated content. If invoked by typed syntax, remove only the confirmed token as an explicit undoable text change; invocation through a binding does not change the Document. External effects and editor Undo cannot be a distributed transaction: Entity creation and opening Thesis must retain their existing operation/lifecycle safeguards. Cancelled requests must never manufacture a successful result or save receipt.

Escape, clicking back into prose, moving the caret outside the token or hiding the owner dismisses the transient menu. Preserve all typed text on cancellation, keep the normal typing/Save bindings, and gate all asynchronous callbacks by the originating occurrence and request generation. Test this with a search still pending, an unrelated Thesis launch, a Flint tab switch, minimization, browser zoom and a source edit in another view.

### Decisions needed before implementation

1. Confirm the semantic split: `[[Document]]` plus `((Entity mention))`, or Roam-compatible parentheses for Blocks with another Entity trigger. My recommendation above follows the user's Entity-mention vocabulary.
2. Confirm literal-on-cancel behaviour and the initial ghost-closer approach; these intentionally differ from the old destructive bracket handling.
3. Select the first command subset according to existing native capabilities. The twelve families are a direction, not authorization for new task, heading or transclusion models.
4. Qualify proposed scoped bindings against the current binding registry and actual browsers, preserving the existing Thesis shortcut and manual Save.

## Scry provisional text and literal bracket exploration — 23 October 2026

> Historical exploration. The later user clarification and implementation below supersede its proposed cancellation behaviour and separate-span approach. **Cancel now keeps the authored phrase**, and production rendering uses the existing character-cell owners. See [implementation qualification](SCRY_PROVISIONAL_CELLS_QUALIFICATION.md).

### Outcome and scope

Literal `[[` / `]]` and `((` / `))` characters can participate in normal text layout without being canonical document edits. The recommended approach is real text nodes inside in-flow bracket elements, plus an occurrence-local provisional TextBlock draft. This is not a CSS-generated bracket or a highlight. Only successful linking publishes the final text and annotation to the repository.

This section records an investigation and an isolated browser proof, not a production implementation. Production Scry currently still uses the purple highlight and commits phrase typing. The new cancellation, history and Save semantics below are requirements for the replacement, not claims about current behaviour. These decisions supersede the earlier Scry cancellation proposals in this document; slash commands and other completion modes are not changed by this decision.

### User-confirmed interaction contract

- Display actual in-flow bracket characters, but never persist them as part of the Document during Scry.
- Keep phrase edits provisional. Cancel discards those edits and restores the pre-Scry phrase. Boundary movement and independent search-query changes also remain provisional.
- Suspend document Undo and Redo until Scry completes or is cancelled. Neither boundary moves, search changes, trigger characters nor provisional phrase edits create history entries or clear the existing redo stack.
- A successful link is one document history action. Undo removes the new entity-reference annotation and reverses any text changes belonging to that action. Redo restores that completed action; neither operation reopens Scry or restores temporary brackets.
- A newly created canonical Entity remains in the knowledge graph when the document action is undone. Entity creation and document annotation are separate persistence domains.
- Save during Scry asks the user to finish or cancel Scry before saving. It must not silently save an older canonical version while displaying provisional text, silently cancel the draft, or save the brackets.
- Preserve the existing mode distinction: parentheses retain the final mention wording; square brackets use the selected Entity's canonical name. An independent query does not replace mention wording.

Example: start with `the pianist`, enter Scry, provisionally change it to `the young pianist`, then link an Entity. Confirmation produces the final phrase and annotation in one history entry. Undo returns to `the pianist` without the new annotation. Cancel before confirmation returns to `the pianist` without changing history. If only the boundaries changed, Undo after confirmation removes only the newly created annotation.

### What the browser experiment demonstrates

The `--inline-bracket-proof` option in [the existing diagnosis harness](../../scripts/diagnose-scry-boundary-browser.mjs) loads a native Document into an isolated, real Flint presentation. It reads the source fixture without saving or changing its file. It uses a 926-cell TextBlock within a repository containing 15,791 content records and 15,791 placements. This is a bounded interaction proof, not load testing.

The experiment inserts literal opening and closing text in normal-flow spans, moves the endpoints four times using retained cell references, and removes the markers. Instrumentation covers `snapshot`, `commit`, `transaction`, `replaceInlineRange`, `pruneUnreachable`, `diff`, and `publish`.

Seven browser assertions passed:

1. The real TextBlock displays the bracket characters in its text flow.
2. Boundary movement preserves canonical text, occurrence keys and history availability.
3. An explicit endpoint mapping preserves the intended native caret endpoint.
4. No instrumented repository or command operations occur during insertion and movement.
5. The existing unadapted mount APIs demonstrably misinterpret the inserted markers.
6. Removing the markers restores the exact original DOM children, including node identities.
7. No uncaught browser exceptions occur.

Evidence: [browser results](scry-provisional-exploration/literal-bracket-proof.json), [screenshot](scry-provisional-exploration/literal-bracket-proof.png). The existing autocomplete suite also passed: 34 tests. Those tests qualify the current implementation, not the proposed provisional typing behaviour.

The experiment does **not** prove provisional typing, IME, annotation geometry, Undo suspension, Save interception, final linking or failure rollback. Its explicit caret mapping is experimental and is not installed in production. It does not establish user-visible latency from headless timing, or imply that the browser performs no layout work when in-flow text moves.

Reproduce:

```sh
BENCHMARK_OUTPUT=docs/development/scry-provisional-exploration \
  node scripts/diagnose-scry-boundary-browser.mjs --inline-bracket-proof
npx vitest run src/features/autocomplete/autocomplete.test.ts
```

### Why simply reinserting characters is insufficient

In [the current interceptor](../../src/features/autocomplete/index.tsx), each phrase edit calls `replaceInlineRange`. The first typed opening delimiter is also committed and then removed when the second delimiter starts Scry. These operations are inconsistent with the new whole-interaction history boundary, even where the incremental text-edit path avoids snapshots.

[The TextBlock renderer](../../src/rendering/standoff-editor-view.tsx) uses `flow.children[index]` for text capture, endpoint resolution and annotation geometry. Caret restoration also uses `childNodes`, and pointer hit testing enumerates children. Extra marker spans shift these indices. In the proof, the unmodified capture API included the opening brackets and the original boundary API returned a marker rather than the intended text cell. Changing only the marker drawing code would therefore be incorrect.

[DirectCharacterCells](../../src/rendering/direct-character-cells.ts) owns the character DOM. A draft must cooperate with this owner rather than let two independent writers reorder its nodes. The legacy Solid cell renderer also requires explicit handling when the direct-DOM feature is disabled.

Undo is reachable through shortcuts, native input events, command registry actions and direct repository callers. Blocking Command-Z alone is insufficient. Save is likewise reachable through commands and controls; intercepting only Command-S would leave bypasses.

The current composition-start handler cancels completion, then reconciles browser text against the canonical model on composition end. That behaviour cannot be carried over unchanged: cancelling a provisional draft under an active browser composition could lose text or publish it outside the intended action.

### Recommended implementation boundaries

1. **One local draft for one mounted occurrence.** Retain source content identity, ViewId, occurrence key, source revision, original selection, original cell references and a local edit sequence. Read the affected TextBlock once when establishing the draft; do not capture the repository or entire Document. Keep authored cells unchanged until confirmation. Draft characters get local presentation identities, not canonical Block identities.
2. **Explicit logical-to-DOM mapping.** Maintain a logical cell collection excluding the two bracket markers. Selection, hit testing, text capture, clipboard handling and annotation range resolution must use this mapping during Scry. Move marker nodes using retained endpoints; do not repeatedly search the document DOM. Keep the current highlighting implementation out of the bracket presentation.
3. **Provisional input from the first delimiter.** The first `[` or `(` must remain visible while awaiting a possible second delimiter without creating a Scry history artefact. If the next input proves it is ordinary punctuation, publish ordinary typing with its normal history semantics. Matching second input starts the draft. Literal punctuation, escaped delimiters, selections and composition need separate regression cases.
4. **Local phrase editing.** Typing, deletion and plain-text paste change the draft and its text-cell mapping only. Preserve unchanged canonical cell identities and retain removed source nodes until completion. Do not implement this as a transaction held open across user interaction or asynchronous search. Search follows the provisional phrase, with existing cancellation/generation checks.
5. **History suspension at the shared authority.** Use a scoped, reliably released history guard, covering command availability and execution as well as native Undo/Redo events. Preserve the previous undo/redo stacks. Do not disable unrelated histories such as window-layout history. Every cancellation, failed startup and disposal path must release the guard.
6. **One bounded final commit.** Revalidate the source occurrence and source content revision, and confirm the chosen Entity still exists. Prepare the actual text edits and new annotation before publishing. Publish once to history; never replace the entire TextBlock merely to remove bracket nodes. Preserve existing overlapping annotations and unchanged Cell IDs. Use a targeted operation batch rather than the existing whole-repository `commands.transaction` draft. The latter currently starts with a repository snapshot.
7. **LER integration uses the same final action.** Current `entityRanges` and `scry.batch` paths assume canonical text offsets. Provisional ranges must not be passed to them as canonical ranges. Linking, creating-and-linking and reviewed mention binding must either prepare one valid final operation batch or explicitly explain why an action is unavailable; they must not commit the draft early or discard its edits. Existing Entity-creation receipts and stale-response protections remain intact.
8. **Save and lifecycle gates.** Gate Document Save and applicable Workspace Save entry points before capture or dirty-state acknowledgement. Offer continuing Scry or explicitly cancelling it; Save itself cannot choose an Entity to finish linking. Do not queue an implicit save for later. On cancellation, restore the original draft source and selection. If another view has changed canonical content, discard the stale draft and render the current canonical state; never restore the old baseline over someone else's edit.

Boundary motion needs endpoint updates, bounded phrase/query derivation and necessary local layout invalidation. Provisional typing costs should follow the affected TextBlock and its annotations. No Document-wide scan, repository transaction, full snapshot, dirty-state publication or backlinks-inventory rebuild belongs in either path. Reflow from real in-flow characters is legitimate; shared geometry must be invalidated for the affected flow and its reflow dependencies rather than remaining stale.

### Conditions to qualify before replacing production Scry

- Character and word movement at both boundaries, including zero-length spans, block ends, wrapped text, punctuation, combining characters and emoji.
- Typing/paste/delete followed by cancellation restores exact source text, annotations, cells and pre-existing history. Genuine non-Scry typing remains immediate.
- Literal trigger recognition never leaks temporary punctuation into history, saving, clipboard content or indexing.
- Successful linking, name replacement and Entity creation produce one document action; Undo/Redo never resurrect brackets or delete the canonical Entity.
- Overlapping entity references remain legal; final text changes rebase surviving properties correctly rather than deleting them through whole-phrase replacement.
- Annotation geometry, caret placement, pointer selection and scrolling remain correct as brackets change wrapping. Use shared geometry invalidation; do not add a global cell sweep.
- Keyboard, menu, native input and direct command history routes respect the guard. Save controls and Workspace Save respect the provisional state.
- IME, source edits in another view, tab switching, application hide/close, pending Entity creation and failed linking have explicit, tested outcomes.
- Existing source and reviewed-mention LER actions cannot bypass the provisional commit boundary.
- Both current character renderers are qualified, with no silently unsafe fallback.
- Real Flint browser tests instrument snapshots, commits, transactions, scans, unrelated reads/updates and requests. Repeat the existing affected-document typing comparison when production input handling changes; use it as comparative evidence, not a claim of guaranteed user-perceived latency.

The bracket rendering itself is feasible and demonstrated. The substantive work is the provisional input and coordinate mapping, together with consistent history and Save gates. No production code or persistence format was changed by this exploration.


## Implemented Scry provisional cells — 23 October 2026

The final interpretation of `MUTABLE_SCRY_PROVISIONAL_CELLS_FEATURE_BRIEF.md` includes the user's subsequent clarification: **Escape cancels linking, not the text the user typed.** `[[Flo]]` or `((Flo))` becomes plain `Flo` on cancellation. No Entity reference is created. This supersedes the brief's earlier discard-on-cancel examples.

Both opening and closing brackets are temporary presentation cells in the existing character renderer. The first trigger character is provisional too. While Scry is active, source typing/deletion/paste changes an occurrence-local draft; boundary changes update only its range. Neither path publishes Document content, creates history entries, takes repository snapshots or saves files. Search in the LER window may be edited independently.

When Scry ends:

- **Choose an Entity with `[[…]]`:** publish its canonical name and the Entity reference together.
- **Choose an Entity with `((…))`:** publish the final authored phrase and Entity reference together.
- **Escape/Cancel:** publish the final authored text without a reference. If text is unchanged, publish nothing and retain the previous Undo/Redo stacks.
- **Undo after completion:** undo that single Document action. A newly created Entity remains in the knowledge graph.

Document Undo/Redo is guarded at the shared repository authority during Scry. Save asks the user to finish linking or cancel Scry and keep the phrase; Save must then be invoked again. No temporary cells enter file formats. The default-enabled `scryProvisionalCells` flag retains the legacy path when disabled.

The [A–D qualification report](SCRY_PROVISIONAL_CELLS_QUALIFICATION.md) records the implementation boundaries, actual Flint/LER browser evidence for both renderers, regression comparison, timing results and remaining restrictions.
