# Mutable Window Manager — D1 qualification

Implemented 20 October 2026 against accepted Milestone C, commit `458c6fa`. Scope: **Named Layouts and Reliable Workspace Restoration** only. The existing default-enabled `mutableWindowManager` flag owns the implementation; its disabled path remains exclusive. No load tests, production-data writes, automatic migrations, new file extensions or Milestone E work were performed.

## Result and review entry points

D1 provides named arrangements, retained-session switching, resource-specific saved-Proposition reopening, unavailable-resource recovery and versioned persistence in the existing workspace JSON containers.

- Runtime arrangements: [named-layouts.ts](src/application/named-layouts.ts).
- UI: [named-layouts.tsx](src/rendering/named-layouts.tsx), under **Workspace → Windows → Named arrangements**.
- Contract and validation: [managed-desktop.ts](src/persistence/managed-desktop.ts).
- Save/load coordination: [persistence.ts](src/reactive-editor/persistence.ts), [workspace-manifest.ts](src/reactive-editor/workspace-manifest.ts).
- Application restoration: [Thesis view](src/features/thesis/view.tsx), [restoration queue](src/application/workspace-restoration.ts), [unavailable-window boundary](src/rendering/window-restoration.tsx), [Document recovery](src/rendering/document-reference-view.tsx).
- Filesystem protections: [server store](server/workspace-store.ts), [local JSON writer](src/demo/browser-json-file.ts).
- Full browser assertions: [D1 browser evidence](MUTABLE_WINDOW_MANAGER_D1_BROWSER_EVIDENCE.json).

## Implemented behavior

### Named arrangements and live sessions

**Save arrangement as…**, **Save current arrangement**, selection, rename and deletion operate inside the current workspace. Names must be nonempty and unique without case distinctions. Each arrangement has its own durable identity and revision. Saving an arrangement captures presentation state in memory and marks the workspace dirty; **Save Workspace** performs the file write. A changed current arrangement does not silently overwrite its named snapshot.

Selection applies window bounds, pinned state, minimized/maximized intent, order and the split-tree/tab selection together. It uses the existing placement/session identity: application DOM is neither reparented nor reconstructed. Windows launched after the selected snapshot remain mounted but hidden/inert; the registry window list can reveal them. Owned tools follow their windows. Deleting an arrangement does not close application sessions.

Composition, owner/workspace modals and pending close requests block selection before geometry changes. An active geometry gesture is canceled when selecting an arrangement. Existing focus bookmarks are remembered, then one eligible window is activated after visibility settles. A stale last-active hint falls back to an eligible visible window. Arrangement changes do not call Document or Proposition Save.

The implementation continues to use C's layout solver, minimum-size constraints, temporary tab fallback, geometry controller and surface ownership. Named visibility applies only on Desktop; it does not introduce Canvas/Spatial hosting.

### Resource restoration and recovery

Saved Thesis views record a **canonical Proposition Entity identity and Vault identity**, an optional explicit Cavern identity, and a Vault location hint. Reopening validates the Cavern and the Vault GUID before requesting the exact Entity. The response identity must match. Archived Propositions remain resolvable. Two views of the same Proposition instantiate independent editing sessions around the same canonical resource; no Entity or Block is created during restoration.

Unsaved draft contents, undo history, source bookmarks, pending operation receipts and tools remain session-only. A saved Proposition with newer unsaved edits persists its canonical reference, not those edits. A new unsaved Proposition has no invented durable resource identity. Its transient tile/arrangement slots are omitted from the detached saved arrangement; its live session remains intact.

Application restore reads run through a cancellable queue, with at most four active restoration tasks per manager. Document manifest resolution also uses four bounded workers. Request generations, AbortSignals and disposal checks prevent late results from replacing canceled or removed targets. Restored Proposition editors do not steal focus when asynchronous data arrives.

D1 permits unavailable resources and unsupported descriptors to remain as placeholders while usable windows open. Unknown application IDs, descriptor versions and resource descriptors retain their JSON fields and stable identities through Save. Malformed window/layout graphs still reject the entire load before live workspace replacement.

Recovery operations are explicit:

- **Retry** rechecks the original identity and authority.
- **Locate/Relink** checks the selected Document's exact identity, or the selected Vault GUID and original Proposition Entity. Filenames/titles never establish identity.
- **Cancel recovery/restoration** prevents a late result from taking over the view.
- **Remove unavailable window** removes presentation entries, including named memberships. It does not delete canonical files, Entities or Blocks from the external stores.

An unsupported descriptor cannot be safely relinked until its application understands that descriptor version; its placeholder explains this and supports Retry/Remove. Conflicting/ambiguous identities are not rebound by guessing. A known Ink descriptor with a missing presentation reference can reconstruct only that exact resource-table reference. A local missing embedded Document can be located through the JSON picker. An already live canonical Document is reused rather than overwritten with a duplicate loaded copy.

### Persistence and compatibility

The outer formats remain `speedy-local-workspace` schema 2 and `speedy-workspace` schema 2; the presentation envelope remains version 1 and filenames remain `.json`.

**Managed Desktop version 4** adds:

| Field | Contract |
|---|---|
| `views` / `windows` | Existing durable view/window IDs and anchors; independent of runtime IDs and domain identities |
| `layout` | Current C split-tree contract version 1, including floating membership and per-layer order |
| `layouts[]` | Named snapshots with `id`, `name`, `revision`, window geometry/mode/layer records, layout and optional last-active hint |
| `activeLayout` | Optional selected named-snapshot identity; does not imply that the current arrangement has been saved back to that snapshot |
| `lastActive` | Optional current focus hint, never a runtime focus lease |
| Proposition resource | Vault-scoped canonical Entity reference, with Cavern scope where applicable and a location hint |
| Server resource `unavailable: true` | Explicit unresolved reference; no content write or fabricated replacement |

Every named snapshot receives the geometry, identity, ownership, tree and ordering checks used for C layouts. Duplicate names/IDs, invalid bounds, unknown selected-arrangement IDs, duplicate/mis-layered membership, unsupported future Desktop versions and runtime-only payloads are rejected. Unknown extension fields remain preserved.

D0 Desktop 2 and C Desktop 3 still load and save under their original rules. Loading does not rewrite or upgrade them. The application’s explicit **Upgrade Workspace and Save as…** action requests Desktop 4 and a new filename. Introducing named arrangements or selected-Proposition descriptors into an older workspace also requires that explicit path. Both writers reject in-place D0/C → D1 upgrades and D1 downgrades. The low-level explicit D0 capture option remains available for backward-compatible callers and fixtures.

Local saves continue to embed available Document content. Server saves remain manifests with external references and write **no Document content**. A partially restored server manifest preserves unavailable identities and sources. It cannot be exported as a supposedly self-contained local workspace until its external Documents are resolved; that operation fails explicitly.

Save acknowledgements compare repository, visibility, presentation, shell-layout and named-arrangement revisions. A late successful Save does not acknowledge later changes. A canceled picker, aborted/failed write or canceled request does not acknowledge the captured state. Local writes retain pre-write identity/version/CAS checks and stream abort handling. Server writes retain path confinement, staging, atomic replacement and optimistic concurrency. D1 unavailable references do not bypass Document-content write protections.

## Qualification evidence

### Automated tests

The selected regression comparison used the accepted C selection (38 files) plus the three D1 suites:

- `src/application/named-layouts.test.tsx`
- `src/application/workspace-restoration.test.ts`
- `server/workspace-store-d1.test.ts`

The 41-file run completed with **431 passed, 13 failed**, and the previously established drag/drop uncaught error. The final nine-suite recovery/compatibility follow-up passed **89/89 tests**. After the last upgrade-retention correction, the named-layout suite passed **22/22 tests**. These overlapping follow-ups are not added to the regression total. Client and server `npm run typecheck` and `git diff --check` both passed.

The 13 failures are unchanged from the accepted baseline:

| Suite | Failures | Existing issue |
|---|---:|---|
| `application-startup.test.tsx` | 6 | Startup controls/Canvas expectations |
| `workspace-demo.test.tsx` | 3 | Revision-only toolbar and older shortcut expectations |
| `timer.test.tsx` | 3 | Mount teardown and document-action assumptions |
| `block-selection.test.tsx` | 1 | Synthetic drag/drop lacks `dataTransfer.files`; also emits the known uncaught TypeError |

No new regression failure remained after qualification. No unrelated baseline failures were repaired or suppressed. This is a selected regression suite, not the entire repository suite.

D1 tests exercise stable identity round trips; live DOM and selection continuity; hidden later-launched sessions; pinned order and window modes; modal/pending-close rejection; dirty acknowledgement during pending Save; malformed named layouts; unsupported-descriptor preservation/removal; all-missing server references; identity mismatch/anonymous-file rejection; stale recovery after removal; bounded restore scheduling and disposal; unavailable-reference server round trips; explicit upgrade/downgrade refusal; pre-rename failure with original bytes preserved; and stale retry rejection after a committed replacement.

The typing check asserts no repository snapshot, restore-descriptor lookup or arrangement capture during an ordinary text edit. These are bounded-work assertions, not latency or load measurements.

### Actual browser interactions

Chrome **155**, through the isolated CDP runner:

| Fixture | Passing checks | Evidence |
|---|---:|---|
| D1 session continuity | 39 | Trusted text/pointer/key input, named menu cancellation, real Flint/Thesis/Entity components, undo/redo, source navigation, pending receipt retry, modal blocking, viewport and actual browser zoom |
| D1 persistence/restoration | 35 | Local cancel/failure/round trip; saved archived Proposition; independent drafts of one resource; Cavern/Vault/Entity mismatch; cancellation/stale result; local and server Locate/Relink; mixed missing resources; unsupported descriptors; version/flag rejection |
| C interaction compatibility | 76 | Existing solver, drag/touch/key, retained application and surface qualification |
| C persistence compatibility | 23 | Existing D0/C local and server persistence qualification |

Browser fetches are intercepted and never reach a running application backend. Local picker/stream fixtures use in-memory handles and actual browser `File` objects. Server store tests separately exercise real loopback HTTP and temporary filesystem directories, including injected filesystem failures. Native OS picker permissions and power-loss durability are not claimed by these fixtures.

The browser runner now drains its final CDP input-resume replies before closing Chrome. A cleanup race originally emitted a timeout after all assertions had passed; the final D1 run exits successfully. The menu test also needed to account for the existing submenu arrow text. These were harness corrections, not suppressed application failures. Implementation-time failures also caught an intermediate Desktop 3/4 version mismatch during capture, a latest-format upgrade not being retained after acknowledgement, and a recovery error-message syntax/type issue; these were fixed and covered by the passing follow-ups. A filesystem fault-injection assertion was corrected to account for macOS `/private` path normalization.

## Architectural refinements and remaining limits

1. **Version choice:** D1 is Desktop **4**, following the shipped D0 2/C 3 contracts. It does not reuse the older illustrative version number in the planning example. Named snapshots use the existing C layout tree format.
2. **Session representation:** runtime snapshots use canonical placement keys internally and map to durable restore keys only on explicit Save. They are separate from Caverns and do not become resource owners.
3. **Partial restore boundary:** strict D0/C loading remains unchanged. Graceful partial recovery is a D1 capability enabled by explicit format upgrade. Unknown descriptor versions can be retained and removed, but cannot be interpreted or safely relinked by an older application.
4. **Native/history resources:** existing native-resource and durable-history Save restrictions remain. D1 does not package native resource pairs into legacy workspace JSON or change their Save protocol.
5. **Interrupted server response:** cancellation after dispatch can leave a completed server write whose response was not acknowledged. The client remains dirty; a stale retry is rejected by CAS. Reopen/Save As is the existing recovery path. No automatic crash recovery or claim of OS power-loss durability is added.
6. **Browser coverage:** functional evidence is Chrome only. No Safari/Firefox, physical mobile device, assistive-technology session, real OS picker permission exercise or production Vault mutation was performed. Existing C tests cover pointer/touch/key and composition gating; D1 adds menu keyboard cancellation and real application continuity.
7. **Workspace membership:** restoring a named arrangement does not recreate an explicitly deleted shell anchor or canonical resource. Missing resources retain placeholders; a live arrangement referencing a subsequently removed anchor refuses the switch until the entry is removed or the arrangement is saved again.
8. **Future work excluded:** no cross-host transfer, Canvas/Spatial rehosting, tool docking/promotion, automatic session recovery, new workspace extensions or Milestone E functionality. Existing transitions into other presentation hosts retain their pre-D1 lifecycle limitations.

## Reproduction

```sh
npm run typecheck
npx vitest run src/application/named-layouts.test.tsx \
  src/application/workspace-restoration.test.ts \
  server/workspace-store-d1.test.ts
node scripts/qualify-window-manager.mjs --d1
node scripts/qualify-window-manager.mjs --d1-persistence
node scripts/qualify-window-manager.mjs --c
node scripts/qualify-window-manager.mjs --c-persistence
git diff --check
```

For the full selected regression comparison, use the C report’s 38-file selection and append the three D1 files above. All browser profiles/processes, Vite servers and temporary server stores are cleaned up by the runners. Qualification sources and evidence remain as review artifacts.
