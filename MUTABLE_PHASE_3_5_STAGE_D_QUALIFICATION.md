# Phase 3.5 Stage D — Intelligent URI Importing and Passive VideoBlocks

Date: 2026-10-16. Stage D is implemented behind the existing default-on `documentInterchange` flag. This report records its qualification and remaining browser/provider limits. Stage E, Phase 3.6 and Phase 4 have not begun.

## UI and operation contracts

Right-click a text Block or a Block within a Document and choose **Inspect / Import linked resource…**, enter an absolute URL, then choose one operation:

- **Insert URL link:** a normal `reference/url`, without network access.
- **Insert passive VideoBlock:** available for recognized, validated YouTube/Vimeo URLs; no player, thumbnail, oEmbed, title or favicon request.
- **Import HTML / Markdown / text as native Ink at the destination:** converts a separately consented response through the existing fragment worker and insertion planner.
- **Embed HTML / Markdown source copy:** the Ink document owns an independent authoritative source snapshot.
- **Link HTML / Markdown source snapshot:** retains a portable source URL and hash baseline. **Reconnect / refresh source…** requests fresh consent, checks for local edits and offers replacement or separate insertion.
- **Import PNG/JPEG image:** uses the existing explicit image chooser, admission, immutable-original storage and lease protocol. Declining acquisition retains an inert placeholder.

Insertion uses the captured caret/selection or an explicit Block gap, and is one undoable edit. Opening existing native files and importing local files as new Ink documents retain their existing separate actions and save semantics. Nothing writes back to an external source. Document saving remains manual.

Ordinary URL typing/pasting and existing clipboard handlers are unchanged. Local inspection is syntax-only. Choosing a fetch operation opens a second confirmation showing the exact URL, format and network implications. Cancel before this confirmation creates no request or document edit.

## Implementation and security

`src/interchange/uri.ts` provides local classification, versioned descriptor validation and fixed provider URL generation. Unknown hosts, unsupported provider endpoints, extra/duplicate query payloads, invalid IDs, credentials and lookalike hosts cannot become players. Unsupported provider links can remain ordinary links; classification does not guess or remove arbitrary parameters.

Text transport shares `server/asset-remote.mjs` with the existing image adapter. It retains public-address DNS checks, connection pinning, rejection of mixed public/private answers, same-origin redirect validation (maximum three), a 15-second overall deadline, identity content encoding, no credentials/cookies and the existing service concurrency limit. Image admission and its limits remain unchanged.

Text admission has fixed policies:

| Choice | Required response media type | Bounds |
| --- | --- | --- |
| HTML | `text/html` | 2 MiB, 200,000 Unicode scalars |
| Markdown | `text/markdown` or explicitly interpreted `text/plain` | Same |
| Text | `text/plain` | Same |

UTF-8 is the default; declared UTF-8 and US-ASCII are supported and validated. Unsupported charsets, conflicting HTML charset declarations, compression, binary controls, mismatched formats and excessive streams are rejected. Legacy encodings are rejected. Explicit Markdown interpretation accepts a plain-text response; an HTML document masquerading as Markdown is rejected.

Acquisition leases record the exact normalized URL **and format**, independently of remote-image consent. The server checks lease/session/Cavern authority before and after acquisition. Text-only leases are closed with the existing abort/cleanup operation after the response is obtained; no binary asset publication is needed. Interrupted operations never replay a fetch or document insertion. Images requested by imported content require independent consent and admission.

The existing network-inert HTML/Markdown adapters receive an optional response base URL only for this explicit remote operation. Relative links and image descriptors resolve against the final, validated response URL; an authored HTML `<base>` cannot change it. The default clipboard/local-file paths retain their existing behavior. Source Blocks preserve authoritative decoded source without running it; their existing isolated previews remain unchanged.

All document commits use `DocumentInterchange`, `MutableFragment`, worker materialization and the existing command/history infrastructure. Selection, repository revision, view existence and Cavern session are rechecked across asynchronous boundaries. Cancellation or a changed destination prevents insertion. Refresh changes source text and its baseline in one transaction, with exact Undo restoration.

## Passive video lifecycle

`mutable/video-block` stores only a version-1 `{provider, providerId, canonicalUrl, title?}` descriptor. It does not reuse legacy eager YouTube Blocks. Runtime activation is owned by a mounted SolidJS occurrence, not canonical data.

**Load player — connect to provider** explicitly discloses provider network, origin, IP-address and cookie/storage implications. Only that action creates an iframe. It uses:

- Fixed YouTube privacy-enhanced or Vimeo player URLs; `autoplay=0`, and Vimeo `dnt=1`.
- `sandbox="allow-scripts allow-same-origin allow-presentation"`.
- Only fullscreen and picture-in-picture permission delegation.
- `referrerpolicy="strict-origin-when-cross-origin"`, sharing origin rather than the document URL/path.

The URL/parameter choices follow [YouTube's embed specification](https://developers.google.com/youtube/player_parameters), [YouTube privacy-enhanced embedding](https://support.google.com/youtube/answer/171780?hl=en), [YouTube's embedded-client identity requirements](https://developers.google.com/youtube/terms/required-minimum-functionality#embedded-player-api-client-identity), and [Vimeo player parameters](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters). These settings do not make an activated player network-free or guarantee absence of provider cookies.

Unload, descriptor replacement, hidden presentation, browser-tab hiding, Block deletion, view closure and editor disposal remove activated players. Undo/Redo and reopening remain passive. Only activated occurrences observe presentation attributes on their finite ancestor chain; there is no document-subtree observer or typing subscription. Native/clipboard/package materialization validates descriptors; invalid/unknown versions remain inert. Semantic export and the offline viewer emit provider links, never iframes.

## Qualification

- **181 Vitest regressions passed** (148 interchange/persistence tests plus 33 editor clipboard tests) across interchange, source Blocks, URI operations, native persistence, definition ownership and managed assets. New cases cover strict local classification, safe export, consent separation, conversion, exact Undo/Redo, cancelled/stale caret/edit/view/Cavern operations, remote-source conflicts, feature-off behavior and player teardown.
- **27 Node tests passed.** Transport tests exercise DNS pinning/rebinding, redirects, format/charset/encoding mismatch, stream limits and cancellation. Storage tests cover exact typed consent, expiry, token/session mismatch and revocation, alongside existing original-byte and recovery checks.
- `scripts/check-uri-import-browser.mjs` uses real Flint/SolidJS, Chrome, temporary Caverns, the real HTTP lease/remote-text endpoints and insertion worker. Only the HTTPS transport is replaced for its deterministic page fixture; it still goes through the bounded acquisition policy. No user document is modified.
- The existing Stage C browser harness also passes cross-Cavern package import, original-byte asset admission/deduplication, save/reopen, source refresh/Undo and the standalone offline viewer, with zero external requests and zero application errors.
- The browser check passes network-free ordinary URL input, no acquisition before consent or after cancellation, separate page-image consent, passive insertion, native save/reopen, one-step Undo/Redo and explicit player unload/deletion.
- Live official YouTube and Vimeo frames loaded their player UI and video elements under the chosen policy and initially remained paused. The automated playback probes did **not** establish advancing playback (time remained zero/readyState zero). This is a qualification limitation, not evidence of successful playback. The provider link remains available and permissions were not relaxed. Manual playback qualification in the target browser remains necessary.

Build qualification: `npm run build:client`, `node scripts/build-sqlite-foundation.mjs`, `npm run build:server`, and `npm run typecheck`. The existing SQLite prerequisite between the client and server builds remains necessary; no build-system refactor was introduced. The client build retains its existing large-chunk warnings.

### Matched typing measurements

The existing real Flint Michelangelo-letter benchmark ran 40 alternating edits in the same 499-character paragraph, with eight paragraphs mounted, Normal caret mode and no vault rows.

| `documentInterchange` | Synchronous median | Synchronous p95 | Snapshots | Save-status reads |
| --- | ---: | ---: | ---: | ---: |
| Disabled | 3.9 ms | 6.0 ms | 0 | 0 |
| Enabled | 3.7 ms | 5.7 ms | 0 | 0 |

Both restored the original text and passed real Chrome character-input/Undo checks. These runs show no regression, not a claimed speed improvement or guaranteed screen latency. An initial harness startup/cleanup attempt produced no measurements; a temporary diagnostic copy (removed afterwards) bounded cleanup and printed errors without changing measured input logic. The paired successful runs used that identical harness. Raw results and profiles are in `/tmp/stage-d-typing-off` and `/tmp/stage-d-typing-on` for this session.

### Remaining limits and scope

- Chrome/macOS is the exercised browser. Safari, Firefox, Windows/Linux and their provider/clipboard differences remain follow-up qualification, as before.
- Provider playback, availability, account/age/geographic restrictions, DRM and network policies vary. Players always retain a direct provider link; neither failed playback nor provider requests authorize broader iframe permissions or a server video download.
- Provider URLs with unsupported sharing/start/playlist/unlisted-access parameters remain links. No remote posters, crawling, article extraction, login/session forwarding or video downloading was added.
- Text acquisition uses the existing managed-acquisition service and requires an active Cavern. Its existing managed-asset feature/service prerequisite is unchanged.
- Earlier clipboard compatibility, asset-maintenance and full-Cavern relocation follow-ups remain recorded; this stage does not expand that work.

Stage D stops here for acceptance. Stage E still requires its separate go/no-go decision.
