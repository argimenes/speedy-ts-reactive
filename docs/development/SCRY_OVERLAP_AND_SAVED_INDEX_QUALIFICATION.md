# Scry overlap and saved Entity index qualification

2026-10-22

## Scry

Removed the explicit Entity-reference overlap rejection from selection-boundary movement and direct linking. Both selection edges can now cross existing references by word or character. Movement changes only the transient Scry selection: no Document commit, repository snapshot, undo entry or annotation mutation.

Linking unchanged prose now uses the existing annotation-only command. Previously, replacing the selection with identical text could remove enclosed annotations and recreate text Cells. The new path preserves existing annotation IDs, values and ranges, Cell identities and editing DOM; one Undo removes only the new annotation.

Also corrected code/literal detection: `/code|literal/` accidentally matched `codex/entity-reference`. Detection now matches complete type-name segments, allowing Scry to open over existing Entity references while retaining literal/code exclusions.

This applies to direct Scry linking, including `((...))` and unchanged-text `[[...]]` confirmation. Actual text replacement with a different canonical name retains the existing replacement/rebasing semantics. Reviewed bulk-occurrence eligibility rules are unchanged.

## Saved Entity index

The saved Pasting tests Document contains ten Josef Hofmann references. Its Resource row was missing from SQL because an unrelated workspace reference Block lacked an ID and aborted the entire index sweep.

The indexer now continues with independent valid resources after per-file inspection or staging failures. Duplicate Resource/Block identities quarantine both conflicting candidates. Incomplete sweeps report issues and cannot authorize deletion or relocate an existing indexed identity. Cancellation and changed-source fences still stop publication.

Missing IDs in successfully decoded legacy Blocks receive deterministic resource-local UUIDs in the private indexing projection. Existing IDs are preserved, duplicates remain errors, and generated IDs carry `indexIdentity` provenance in SQL attributes. Source files and live repositories are not rewritten. The extraction profile advances to v3; SQL tables and workspace formats are unchanged.

These generated IDs are index recovery identities, not a repair written into the original file. They remain stable for unchanged structural positions and ordinary text edits; rearranging an ID-less legacy Block can change its generated identity. Missing Resource identity or a malformed native format remains a validation error for that file.

## Evidence

- 46/46 focused autocomplete and saved-projection tests passed, including overlap, Undo/Redo, no-snapshot boundary movement, code/literal exclusions, deterministic missing IDs and workspace references.
- 41/41 Node indexer, host and foreground tests passed: independent publication after malformed/duplicate/staging errors, incomplete-sweep deletion protection, stale-source rejection, cancellation, worker failure and relocation protection.
- The broader autocomplete, Entity-reference and saved-facts run retained the two established Entity candidate failures expecting two snapshots where the implementation performs zero. Its new test initially assumed Block output order; that assertion was corrected and the affected suite rerun successfully. No new product regression was identified.
- 104/104 actual Chrome/Flint checks passed with no browser exceptions. New checks exercise real trigger typing and word/character shortcuts across three existing references, direct LER confirmation, retained Cell/DOM identity and single Undo. Existing placement, resizing, zoom, IME, cancellation and application-lifecycle checks also passed. See [browser results](scry-overlap-qualification/browser-results.json).
- Isolated copies of the actual `20261016.work.json` and `pasting-tests.mutable.json` indexed successfully: SQL returned ten Hofmann mentions. Adding malformed JSON kept coverage incomplete while both valid files still reconciled. Original and copied source bytes remained unchanged; the temporary vault was removed. See [saved-index evidence](scry-overlap-qualification/saved-index-proof.json).
- Client and server TypeScript checks and `git diff --check` passed.

## Runtime status

The running development server was not restarted and the live vault database was not rewritten during qualification. The backend indexer changes require a server restart and a normal reconciliation; refreshing Entity counts alone rereads existing SQL. Manual Document Save semantics remain unchanged.
