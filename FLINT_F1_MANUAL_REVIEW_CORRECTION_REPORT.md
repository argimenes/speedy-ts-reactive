# Flint F1 manual-review correction

Date: 1 October 2026. Scope: shared vault-directory chooser and generic Desktop Window Maximize/Restore. F2 has not begun.

The two UI corrections pass qualification. **Manual testing against the user's legacy Codex OS collection remains blocked by a separate legacy-to-native import gap.** The native browser proof below uses isolated fixtures, not converted copies of that collection.

## Findings and corrected workflow

The running localhost server was several days old and returned 404 for native vault discovery. It was rebuilt/restarted; the current client is on `http://localhost:3000`, with the server on port 3002.

The configured Documents root is `/Users/iianneill/Documents/GitHub/speedy-ts-reactive/data`. `.` denotes that permitted root. `..` cannot escape it; this is intentional confinement, not a missing parent-directory special case. Current discovery completes with 15 folders, 91 other files and zero native Documents. The store reports read-only. Those settings were not broadened.

Flint now exposes **Choose Vault…** in Library and through its Open Vault actions. It uses the existing `DocumentBrowser`/`DocumentDialog`, with a directory-only mode, folder tree, Parent, Refresh, loading/errors, cancellation and focus restoration. Selection invokes the existing native vault acquisition/discovery path. The relative-path input remains an advanced option. Empty native discovery explicitly explains that legacy JSON is not listed as native Documents.

Directory listing grants no admission, binding or write authority. No native store, identity, pairing, relocation, recovery or confinement policy was changed.

## Generic Maximize/Restore

The ordinary Window chrome now provides Maximize/Restore, enabled by the default-on `windowMaximize` flag. It derives its fitted rectangle from the Desktop work area, below the 28-pixel system bar, and follows viewport/work-area changes. Maximized Windows render above the object-bank strip. Stored normal position and size remain untouched; Restore returns to them, including after a manual move/resize. Minimize/restore remembers a maximized state during the mounted Window lifetime. The editor subtree remains mounted.

This Desktop behavior does not override Canvas/Spatial hosts that already supply their own geometry. It uses no browser fullscreen or special Flint host.

## Qualification and captures

- **97 tests passed** across shared browser, Window, Compact, Flint lifecycle/vault, legacy server-store and native vault-store suites. Includes confinement, symlink, read-only, relocation and recovery coverage.
- **42 real-browser checks passed**, with no uncaught exceptions: real directory selection, reopening two native files after restart, search/references/backlinks, two Windows, occurrence-independent navigation, native selection/focus, IME, Entity panels, margins, viewport resizing, maximize/restore after move/resize, and an ordinary non-Flint Window.
- Typecheck and production build passed.

Reproduce with `node scripts/check-flint-f1-correction-browser.mjs`. It uses an isolated temporary managed store. [Check results](artifacts/flint-f1-correction/browser/browser-results.json).

Captures: [directory chooser](artifacts/flint-f1-correction/browser/choose-vault-expanded.png), [maximized Flint](artifacts/flint-f1-correction/browser/maximized.png), [restored after move/resize](artifacts/flint-f1-correction/browser/restored-after-move-resize.png), [ordinary Window](artifacts/flint-f1-correction/browser/ordinary-window-maximized.png), [reopened backlinks](artifacts/flint-f1-correction/browser/reopened-backlinks.png).

## Remaining legacy collection gap

**Subsequent decision:** the [content recognition strategy](MUTABLE_VAULT_CONTENT_RECOGNITION_STRATEGY.md) supersedes the import-first recommendation below. Supported historical Documents should be recognized/admitted through their existing codecs without mandatory conversion, renaming or Markdown generation, with an explicit safe Save capability. Compatibility Open remains deferred after P3; this report's original qualification does not establish it. See the [current product checkpoint](FLINT_APPLICATION_IMPLEMENTATION_PLAN.md#9-post-p3-product-checkpoint).

The nominated `data/*.json` files include legacy `main-list-block` Documents. Existing `PersistenceService.loadDocument` and the legacy Block codec can open those trees; `viewTypeFor` maps that legacy type to a Document view. This does not establish the native resource identity, native envelope or verified persistence binding required by Flint vault search and backlinks. The native Open path currently accepts native resources or explicit Markdown import, not legacy JSON import. Renaming extensions would not solve this.

The smallest next correction is an explicit **Import legacy Document** action: reuse the confined legacy loader and decoder, validate an isolated candidate, establish unambiguous canonical identity and Block/reference mapping, then save a new native pair through the existing guarded native save path. Preserve the original JSON. Qualify a representative pair of actual legacy Documents before offering bulk conversion; report unresolved legacy references or unsupported payloads rather than inventing native relationships. A writable destination is required for durable import; the current server remains read-only.

No legacy files were converted or modified, and no import pipeline or persistence redesign was introduced in this correction. Review is still required before claiming that the user's collection can exercise Flint's multi-Document features.
