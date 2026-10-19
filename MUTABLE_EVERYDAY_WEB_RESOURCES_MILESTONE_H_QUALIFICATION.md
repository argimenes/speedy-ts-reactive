# Milestone H — Everyday Web Resources qualification

19 October 2026. **Accepted and closed by the user within the supported subsets and limitations below.** Implementation is scoped to the supplied H brief. Milestone G remains accepted and closed with its documented Maps/X limitations; their permissions and acquisition mechanisms are unchanged. This report separates deterministic fixtures, live metadata, browser rendering and playback evidence.

## Access and integration

The default-enabled `everydayWebResources` flag extends G's `webResourceViewers` infrastructure. Use **Command/Control–Shift–V** or **Inspect / Import linked resource → Capture native web preview**. Acquisition and the resulting card are reviewed before insertion. For feeds without `.rss`/`.atom` extensions, use the explicit **Capture podcast feed (RSS / Atom)** choice; XML keeps its existing specialised routing unless that choice is made. Use the existing file import/insert picker or document drop for `.ics`, `.rss` and `.atom`. Local `.xml` files retain their existing structured/academic interpretation; save/select an explicitly named `.rss` or `.atom` copy to import one as a feed.

One existing `mutable/web-resource-block` presents the result. No new native Block family, canonical mutation port, URL pipeline or database schema was added. H can be disabled independently: new H acquisition and music activation are disabled, G generic behaviour remains, and saved H cards stay passive/readable. The host also enforces the flag. Local files have a `mutable-file:` source identity and filename, not a fabricated HTTP URL or Open-original action.

The supplied URL—including queries/anchors and product variant context—is retained separately from normalized identity and trusted response URL. H records its adapter version in the immutable JSON original; earlier G originals keep their original interpretation. Typed fields carry source paths; common metadata carries field provenance. Titles, state, dates and descriptions are captured assertions, never canonical or current facts. UTF-8 local files retain exact bytes through reversible envelope text, including BOM and CRLF; original envelopes and admitted thumbnails use existing immutable assets and package closure. The original can contain unsupported calendar/feed fields, Gist code or commit response data, none of which is executed.

## Provider matrix

| Provider / supported input | Acquisition and retained presentation | Interactive / credentials | Qualification and offline behaviour |
| --- | --- | --- | --- |
| Spotify full `open.spotify.com` track, album, playlist, artist, show, episode; optional `intl-xx` prefix | Fixed official oEmbed; title, supplied author/description/artwork URI, resource type and ID. Accepts observed `rich` or `video` response shapes and checks returned iframe identity | Consent-activated, locally constructed official player; no OAuth, stream extraction or retained audio | Recognition/identity fixtures and live metadata passed. Player qualification recorded below. Native card works offline; playback does not |
| SoundCloud public user, track and `/sets/` links | Official JSON oEmbed; supplied title/author/description/artwork URI. Private-token and short links fall back | Consent-activated official widget with autoplay false; no account integration | Fixture and live Forss/Flickermood metadata passed; browser result below. Native metadata offline |
| Apple Music / Bandcamp | Existing G generic Open Graph/HTML metadata where available; no new adapter | No new player/API. Apple Music catalog requires developer authorization; Bandcamp's documented embed workflow does not establish a general public URL metadata endpoint | Generic G behaviour retained, not newly claimed as provider-specific qualification |
| GitHub repo, issue, PR, 7–40 digit hex commit SHA, tagged release; public Gist ID | One official REST request. Response identity checked; description/language, title/state/merged, summary/SHA, name/tag or up to ten Gist filenames as applicable | No OAuth, clone, pagination, raw-file fetch, Git client or execution. Unauthenticated limits apply; 403/404/429 become diagnosed captures without retries | All types fixture tested; repository and issue live success, unavailable PR live 404. Other types are fixture-qualified only. Snapshot state remains offline, labelled captured |
| Amazon ten enumerated marketplaces / eBay eight; ASIN and numeric item forms | **URL-only**, including marketplace/identifier and exact supplied variant/query context. No page/catalog fetch, price, seller or availability claim | Official catalog access requires credentials/affiliate or production approval; not introduced | Syntax, false hosts, no-request/fallback and persistence qualified. Example IDs are syntax fixtures, not verified listings |
| ICS local UTF-8 file / explicit HTTPS `.ics` | ICAL.js event summaries: title, timezone-labelled start/end, organizer/location/status/description, parsed recurrence/exclusion/exception information and cancellation method | No recurrence expansion, alarm execution, timezone conversion, RSVP or calendar integration | Timezone/all-day/master/exception/cancellation/bounds fixtures and live CalendarLabs US Holidays capture; original bytes and package reconstruction checked. Offline summaries use retained original |
| Google Calendar / Outlook event links | URL-only; no invented event details or account access | Original-link action only | Recognition/no-request fixtures. Account/private event access unqualified and out of scope |
| Docs/Sheets/Slides `/d/ID`, Drive `/file/d/ID`, `/open?id=ID`, `/uc?id=ID` | URL identity/type only; no inferred sharing permission, title or thumbnail | **Open in Google Drive**; no OAuth, download, export, sync or embed | Identity/private-link fallback and no network qualified. Actual private/public file content access is not claimed |
| Apple Podcasts show ID / episode query | Show: one fixed public lookup; supplied title/publisher/artwork URI/feed URL. Episode: link-only rather than substituting show metadata | No automatic discovery fetch, OAuth or Apple player | Show live success (The Daily); episode recognition/fallback fixtures. Native card offline |
| Explicit RSS 2.0 / Atom, `.rss`/`.atom` local files | Existing saxes parser; channel metadata, up to 25 source-order items, date/duration/GUID/enclosure metadata; identities scoped to source feed | Enclosures are **external networked links**, not downloaded audio. No built-in enclosure player, subscription/history crawl or transcription. Spotify podcasts can use the optional Spotify player | RSS/Atom/hostile XML/bounds fixtures and local-feed browser path. The 20,503,506-byte Simplecast feed was refused by the unchanged 2 MiB transport budget; this is an intentional fallback, not successful live-feed import |

Artwork URLs never cause automatic image loads. URL captures offer the existing explicit permitted PNG/JPEG thumbnail admission. Local event/feed imports retain artwork references without offering thumbnail acquisition in the batch; the renderer displays only explicitly retained local thumbnails, also on request.

## Boundaries and dependencies

Protected requests retain HTTPS/public-DNS pinning, same-origin redirects (three maximum), no cookies or authorization, 15-second timeout and 2 MiB response budget. Compressed responses remain subject to the existing transport's refusal; no decompression or shortlink bypass was added. Apple lookup alone accepts its observed `text/javascript` MIME as **strict JSON data**, never executable JavaScript/JSONP. Fixed endpoints and response identity checks remain in force.

Original envelopes are capped at 3 MiB, jobs at the existing eight queued / one active capture, with 60-second operation and 30-second worker budgets. HTML/JSON keep 50,000 nodes/depth 64. Feeds reject DTDs/external entities and bound XML to 20,000 elements/depth 32. ICS is limited to 20,000 physical lines, 65,536 characters per physical line, component depth 16 and 100 events; at most 25 components are displayed without expanding recurrences. Display fields and items are capped to keep projections below 40 KiB; omissions are diagnosed and the complete admitted original remains retained. These are bounded subsets, not complete calendar/feed clients.

Music frames use fixed trusted cross-origin URLs and the existing scripts/same-origin sandbox, with no forms, popup, top-navigation or download permissions. Spotify receives only the additional encrypted-media Permissions Policy capability; no autoplay permission is granted. Local consent, active-frame slots (four/editor), unmount/view-close disposal and no serialized player state reuse G's lifecycle. G's X script-only sandbox is unchanged. No source HTML or provider script executes in Mutable's origin.

Added **ical.js 2.2.1**, MPL-2.0, dependency-free; saxes/parse5 and all other existing parsers are reused. Lockfile changes add only that package. Qualification-time audit remains **13 existing findings: 1 low, 4 moderate, 2 high, 6 critical**; no `ical.js` finding. No dependency upgrades or unrelated audit remediation occurred.

## Qualification evidence

- **175 tests across 14 files passed** in the final serialized regression run, including H/G models and packages, E academic, F structured, A/C/D application-service workflows, URL/video classification and all 62 clipboard UI tests. Existing academic tests passed at their original timeouts; no test deadlines were changed. Command: `npx vitest run src/web-resources server/application-services/web.test.ts src/academic src/structured src/interchange/resource-url.test.ts src/rendering/mutable-clipboard.test.tsx server/application-services/academic.test.ts server/application-services/iiif.test.ts server/application-services/pdf.test.ts server/application-services/structured.test.ts --maxWorkers=1 --minWorkers=1`.
- **19 protected-acquisition Node tests passed**, including H fixed endpoints, MIME, BOM/CRLF fidelity, no credentials, private DNS, cross-origin redirects and rate limits. H tests additionally cover malformed/deceptive identities, product/Drive absence of invented data, source versioning, host/client feature-off behaviour, zero-request link cards, local original fidelity, resumed jobs without acquisition, malicious feed XML, timezone/recurrence/cancellation, all GitHub resource kinds and package tamper rejection.
- `npm run typecheck` and the final production client/server `npm run build` passed. Existing dynamic-import/chunk-size notices remain; no build-system refactoring was made.
- **Real Flint in Chrome 155.0.8059.80 on macOS**: trusted Command-Shift-V, actual file picker for ICS/RSS, two review steps, nine native cards, no external request before activation, one-step insertion Undo/Redo, explicit native save, cold reopen, view-close unloading, second-Vault package import with fresh occurrences and byte-identical originals, and offline native cards all passed. Canonical calls: **zero**. Package: **33,855 bytes**. Metadata fixtures are deterministic; the music frames contacted the real providers. The standalone package reader retains its existing inert unknown-resource fallback, not a new full H renderer.
- **Observed interactive rendering:** Spotify displayed “Never Gonna Give You Up” / Rick Astley, and SoundCloud displayed Forss / Flickermood in their actual cross-origin frames. A Spotify “Play on Spotify” action attempted a popup and was blocked by the retained sandbox. SoundCloud's Play control was clicked, but the probe did not observe media-time progression. **Neither audible playback nor sustained playback is qualified.** No permissions were widened to force it; the native Open original links remain available. Final browser run had no runtime exceptions.
- **Live host-service smoke:** Spotify (both observed oEmbed shapes), SoundCloud, GitHub repository/issue, Apple Podcasts' The Daily and a remote CalendarLabs ICS succeeded through the protected host, real worker, journal and immutable asset store. Original hashes and completed-job resume were verified. Test PR `/pull/2` and release `/releases/tag/v1.9.9` returned honest HTTP 404 fallbacks; those links are not evidence of an API incompatibility. Both Simplecast and NPR test feeds exceeded the 2 MiB budget and remained diagnosed fallbacks. Live RSS/Atom acquisition success is therefore not claimed; parsing and the full local-feed UI/persistence path are fixture-qualified.

### Failures and reruns

The first service-test run overlapped a production build which temporarily removed its worker artifact: three tests failed with a missing worker; a fourth exposed an unnecessarily changed specialised-import error message, which was restored. The first broad concurrent run then had four five-second academic timeouts, and an overlapping single-file rerun had one. The final serialized run passed all 175 without increasing timeouts. These scheduling failures are recorded, not hidden as passing initial runs.

Live Spotify `type: video` and Apple lookup `text/javascript` exposed narrowly scoped response-shape/MIME corrections, with identity checks and strict JSON parsing retained. A local-file browser probe exposed social embed helpers attempting HTTP recognition on local sources; provider guards fixed that. The first player probe encountered a destroyed Chrome execution context during reload; idempotent polling now tolerates context replacement. Another package probe correctly rejected stale compiled projections after provenance fields changed during development; a clean full build aligned writer/worker inputs, and final package reconstruction passed. Explicit feed intent is now retained even in acquisition/parser failures so arbitrary feed URLs remain valid fallback captures.

### Typing isolation

Six matched, sequential real Flint runs used the same Michelangelo fixture (eight paragraphs; 499-character measured paragraph; 40 insert/delete edits plus actual Chrome character input and Undo). No builds, provider probes or test suites ran concurrently. H remained subordinate to the same enabled G/editor settings.

| Configuration | Run 1 synchronous median / p95 | Run 2 synchronous median / p95 |
| --- | --- | --- |
| H disabled | 9.1 / 11.3 ms | 8.2 / 18.8 ms |
| H enabled, no H card | 9.5 / 15.2 ms | 9.3 / 18.3 ms |
| H enabled, 25-event native calendar card mounted | 8.4 / 10.5 ms | 6.9 / 9.5 ms |

All six recorded **zero application-service requests, worker starts, repository snapshots and document-status reads during measured edits**. Text restoration and trusted character input/Undo passed. No consistent H-related deterioration was established: enabled/disabled tails overlap and the populated H card was not slower. Frame medians varied from 22.1 to 31.5 ms, with large headless tails; these are qualification observations, not a guarantee of user-visible latency or an absolute comparison to G's earlier machine conditions. Active third-party players were not included in typing benchmarks. Parsing, acquisition and package work remain explicit operations, outside typing.

Reproduce with `BENCHMARK_EVERYDAY_WEB=false`, default enabled, or `BENCHMARK_EVERYDAY_SOURCE=1`, using `scripts/benchmark-flint-typing-browser.mjs` and a distinct `BENCHMARK_OUTPUT` directory per run. Results: `/tmp/mutable-h-typing-{off1,off2,on1,on2,card1,card2}/results.json`.

### Reproduction artifacts

- `scripts/check-everyday-web-browser.mjs` — isolated real Flint, temporary Vaults and Chrome profile; no user's documents modified.
- `scripts/check-everyday-web-live.mjs` — explicit live public captures in a temporary Vault; no canonical port. Provider availability can change.
- Local artifacts: `/tmp/mutable-h-regressions-final.log`, `/tmp/mutable-h-security-final.log`, `/tmp/mutable-h-build-final.log`, `/tmp/mutable-h-typecheck-final.log`, `/tmp/mutable-h-browser-final.log`, `/tmp/mutable-h-live2.log`, `/tmp/mutable-h-live-final.log`, `/tmp/mutable-h-audit.json`. These temporary files are not portable application data; the results above are the retained qualification record.

## Provider references

The [execution plan](MUTABLE_EVERYDAY_WEB_RESOURCES_MILESTONE_H_IMPLEMENTATION_PLAN.md) records the initial reconnaissance and official API/access references. Additional evidence: [Apple Music developer tokens](https://developer.apple.com/documentation/applemusicapi/generating-developer-tokens), [Bandcamp's own embed workflow](https://get.bandcamp.help/en/articles/15263071-how-do-i-create-a-bandcamp-embedded-player), and [GitHub release API](https://docs.github.com/en/rest/releases). Metadata preview, permission to retain artwork and actual playback are separate capabilities.

## Closure and future enhancement candidates

Milestone H is accepted and closed. Preserve the existing resource acquisition, privacy, security, persistence, offline reconstruction and typing-performance guarantees, together with this qualification record and regression coverage.

The following are future enhancement candidates, not outstanding Milestone H defects:

- Qualification of sustained Spotify/SoundCloud playback.
- Improved handling of large podcast RSS/Atom feeds.
- Richer Amazon/eBay and Google Drive previews where legitimate provider access becomes available.
- Cross-browser and cross-platform testing.

The documented provider limitations and existing dependency audit findings remain recorded above. Safari/Firefox, Windows/Linux and general third-party playback compatibility require separate actual tests; no qualification is inferred from Chrome/macOS results.

No further Milestone H implementation is required. Another milestone, expanded resource-viewer scope, account synchronization, unofficial acquisition, AI ingestion or TEI XML requires explicit user authorization.
