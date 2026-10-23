# Flint Save status and saved-index follow-up

## Findings and changes

The running backend predated the missing-Block-ID fix and had recorded the original error after the reported Save. Its idle SQLite lease subsequently renewed during investigation; the replacement worker loaded the updated projection code and resumed indexing the live vault. During that initial investigation, no backend restart, browser reload, source-file rewrite or forced Save was performed.

The index sweep processes a substantial unchanged inventory before later filenames. It now prioritizes missing Resource rows, then changed content/path evidence, then unchanged resources. Discovery, duplicate quarantine, per-resource publication checks and incomplete-sweep deletion protections are unchanged. This ordering change was activated in the subsequent approved restart.

Flint's file capability previously treated a resolved storage Promise as success even when its receipt said failed or pending. Such a Save could leave the dirty dot visible without an error in the main window. The capability now forwards unsuccessful outcomes to Flint's existing error display. It does not clear dirty state on failure or acknowledge newer edits.

## Qualification

- Actual Chrome, real Flint and editor components, production HTTP Save routes, isolated copy of the user's Masque Document: **17 checks passed**, no browser exceptions.
- Save button and Command-S both persisted edits and cleared the native dirty flag and visible tab dot. Subsequent rendering kept them clean.
- Injecting an external-file change reproduced the missing-error defect before the fix. After the fix, the failed Save displays its reason, preserves local dirty state and leaves the external file untouched.
- Native session and compact Flint shell suites: **19 tests passed**, including edits made while an earlier Save is pending.
- Saved indexer suite: **24 tests passed**, including new/changed-first ordering, missing IDs, partial coverage, conflicts, cancellation and relocation safeguards.
- Client/server TypeScript checks and diff whitespace validation passed.

Browser results: [browser-results.json](flint-save-status-qualification/browser-results.json). Reproduce with `PROOF_DOCUMENT=/path/to/a/native/document node scripts/qualify-flint-save-status-browser.mjs`; it only saves an isolated temporary copy.

## Remaining live-session verification

The reported Masque failure itself was not reproduced: successful Saves of the real-file copy clear its dot. The user's exact Save message and confirmation of whether the indicator is Document-level or Workspace-level remain requested. No dirty flag has been forcibly reset.

On 2026-10-23, after the user confirmed restarting was safe, a fresh development server started and the imported Cavern reopened. The compiled backend includes the new indexing order. Both frontend HTTP and backend API checks succeeded.

The live SQL database now contains all **10 saved Hofmann references in Pasting tests**. A source-validated request to the application's `/api/sqlite/knowledge/entities` endpoint with `op: db-mentions` also returned **10**, using the existing canonical Entity GUID. See [live API evidence](flint-save-status-qualification/live-hofmann-index.json). No source Document was saved or rewritten for this verification.

Whole-vault reconciliation remains in progress; this establishes the saved Pasting tests count, not complete coverage of every Document. The user should reload/reopen Mutable OS after the restart and refresh the Entity list to replace cached counts.
