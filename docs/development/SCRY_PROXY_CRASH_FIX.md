# Scry activation proxy crash — 22 October 2026

## Cause and reproduction

Reproduced the exact reported `get` proxy invariant error. `annotationCapabilities.documentAnnotations()` passed live Solid store `blockProperties` arrays from citation and web-article Blocks into recursive `immutable()`. Freezing these proxies violates JavaScript's invariant that a non-configurable, non-writable property must return its actual value. Subsequent access to object elements can instead return Solid's wrapped object and throw.

Opening Scry mounts the shared Linked Entity Reference interface, which calls `collectDocumentEntities()`. In Chrome, adding citation/web-article Entity references to the real Flint fixture reproduced the exception in that collector during Scry activation. In the application the workspace-wide error boundary displays the reported load-error screen. The purple CSS highlight was not the failing operation.

The previous browser fixture did not include these resource Blocks. That coverage gap is now closed. Tests use an in-memory fixture and do not save user Documents.

## Fix

`src/application/annotation-capabilities.ts` now detaches only each resource Block's annotation metadata before freezing the public inventory result, matching the existing handling of text annotations. No full Document/repository snapshots, content writes, Save changes or new persistence formats were added. Purple range highlighting and boundary shortcuts remain intact.

Regression tests cover both Block types, repeated inventory reads, detached immutable results, still-mutable live properties, subsequent annotation changes, unchanged repository revision and zero repository snapshots during reads. The real-browser fixture now includes both resource types and explicitly types `((`, verifies the source highlight, cancels and checks that live metadata remains readable. Existing `[[`, boundary movement, editing, linking, Undo and window lifecycle checks also run against this fixture.

## Qualification

- Before fix: both new unit cases reproduce the exact proxy exception; Chrome reproduces the same exception with a stack through `collectDocumentEntities` and `EntitySearch`.
- After fix: **99 tests passed; 2 established baseline failures** in Entity candidate tests expecting two repository snapshots where zero occur. No new failures in the selected suites.
- **96 Chrome checks passed**, with no browser exceptions.
- Client TypeScript and `git diff --check` passed.

Evidence: [unit reproduction](scry-proxy-crash-qualification/unit-before.txt), [Chrome reproduction and stack](scry-proxy-crash-qualification/browser-before.txt), [unit results](scry-proxy-crash-qualification/unit-after.txt), [browser results](scry-proxy-crash-qualification/browser-after.json), [typecheck](scry-proxy-crash-qualification/typecheck.txt).

The fix prevents new freezes. It does not unfreeze objects in an already affected in-memory session or claim recovery of unsaved editing state after the workspace error boundary has fired.
