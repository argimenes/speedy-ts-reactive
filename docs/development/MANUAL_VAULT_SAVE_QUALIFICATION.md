# Manual Document Save and Vault destinations

Date: 2026-10-23

## Cause

Flint's default Notes and Ideas tabs were fresh canonical Documents with no native file binding. Save opened Storage and recovery; choosing Notes.ink then collided with the different resource already stored there. A title is not proof of canonical identity, so the server correctly refused the implicit replacement.

## Behaviour

- Save / Command-S / Control-S saves a new named Flint or standalone Ink Document into the active/default Vault. Subsequent saves use the established filename.
- A first-save filename collision opens **Overwrite**, **Save with a different name**, and **Cancel**. The alternative filename is suggested but never chosen silently.
- Explicit overwrite preserves the live Document's canonical identity; references to the displaced resource are not redirected. The existing managed publication journal preserves displaced file bytes. No persistence format changed.
- Overwrite permission is scoped to the exact reviewed resource ID and file hash. Changed destinations, pending target saves and read-only storage remain protected. Interrupted publication can recover the captured generation.
- A Document with an outside-Vault source prompts for a Vault destination. Save creates a copy there and leaves the original untouched. Native editing sessions, projections and DOM remain live; later saves use the chosen Vault location.
- Imported external Documents prompt for their initial Vault location. The older browser-local Document controls also route Save to a Vault copy instead of writing through the original browser file handle. Their established Mutable JSON codec is preserved.
- Local self-contained Workspace saving is unchanged. All Document saving remains manual. Destination listing, confirmation and serialization occur only on explicit Save.

## Qualification

**103 tests passed in 8 suites**: native server storage, native session, Flint shell, Flint Vault, workspace Open/Save, standalone Document Save, Document browser, and local Workspace controls. Tests include empty/occupied Notes destinations, retry after rejected first Save, overwrite cancellation, stale confirmation, interrupted overwrite recovery, preserving displaced bytes, Vault changes during selection, outside-source preservation, retained DOM/projection identity, source browser handle protection and existing bounded typing-work checks.

**66 real Chrome assertions passed**, using real application/editor components and production HTTP storage routes in isolated temporary stores:

- [Flint overwrite: 26 checks](manual-vault-save-qualification/flint-overwrite.json).
- [Flint different filename: 26 checks](manual-vault-save-qualification/flint-rename.json).
- [Standalone Ink outside-Vault copy: 14 checks](manual-vault-save-qualification/ink-vault-copy.json).

These exercise actual editor input, Save, cancellation, Command-S, dirty indicators where present, persisted bytes, source preservation, external-change rejection and visible errors. No browser exceptions occurred in these passing runs. Client TypeScript, server compilation and diff whitespace checks passed. [Combined test output](manual-vault-save-qualification/tests.log).

Reproduce with `scripts/qualify-flint-save-status-browser.mjs`: `PROOF_FIRST_SAVE=1` selects collision/rename; add `PROOF_OVERWRITE=1` for overwrite. For standalone Ink use `PROOF_INK=1 PROOF_OUTSIDE=1 PROOF_DOCUMENT=artifacts/flint-b1.2/b.mutable.json`. `PROOF_ARTIFACTS` selects output location.

## Limits and activation

- Overwriting a resource already loaded in the current workspace is deliberately unavailable; choose another filename. This avoids stranding a second live editing session. Invalid/unreadable or pending target resources likewise require another name or recovery.
- Overwrite does not adopt the displaced Document's identity or repair references to it.
- The standalone Ink browser proof uses a simple text Document. A rich-widget fixture became dirty during initial rendering, before any Save; that independent widget lifecycle behaviour was not changed or qualified here.
- The entire repository regression suite was not rerun; no new failures remained in the targeted suites. Earlier established full-suite failures are not claimed to have been fixed.
- No live user file was overwritten during qualification. After explicit restart approval, the development server was rebuilt and restarted on 2026-10-23 at approximately 10:16 AEST. The imported Cavern reopened; frontend and backend returned HTTP 200. A deliberately invalid overwrite request confirmed the new handler is running and rejected the request before publication. [Restart evidence](manual-vault-save-qualification/restart.json). Reload the browser to acquire the new Cavern session.
