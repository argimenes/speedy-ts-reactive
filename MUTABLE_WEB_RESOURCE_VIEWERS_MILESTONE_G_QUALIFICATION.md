# Milestone G — Web Resource Viewers qualification

19 October 2026. **Provisionally accepted**, subject to the final Maps and X checks recorded in the [qualification addendum](MUTABLE_WEB_RESOURCE_VIEWERS_MILESTONE_G_QUALIFICATION_ADDENDUM.md). The addendum supersedes the initial interpretation of X's interactive failure: the retained opaque-origin sandbox conflicts with X's CORS policy. E remains accepted and closed; earlier milestone acceptance states are unchanged. This delivery adds no canonical knowledge schema, new parser dependency, mapping application, scraper, account/feed client, publishing feature, TEI or AI ingestion.

## Delivery and access

One default-enabled `webResourceViewers` flag gates the native `mutable/web-resource-block`, explicit clipboard routing, typed HTTP operations and original admission. Use Command/Control–Shift–V for an eligible web URL, or choose **Capture native web preview** in **Inspect / Import linked resource…**. Review acquisition, then the captured metadata, before inserting one undoable Block. Ordinary paste and typing never request metadata. Images, YouTube/Vimeo, academic identifiers, Wikipedia, IIIF, PDFs and structured/document file extensions retain priority. Existing video routing, presentation and activation code is unchanged. Turning G off retains the previous generic iframe-paste path.

The card provides native text, source attribution, capture time, original/canonical URL distinction, Copy link, Open original and optional third-party activation. Capture again creates a new occurrence/capture after review, not a silent refresh. Presentation, thumbnail visibility and embed state are local and not saved. Document saving remains manual.

## Provider and URL matrix

| Provider/forms | Native preview and retained fields | Interactive content | Offline and failure behaviour |
| --- | --- | --- | --- |
| Generic credential-free HTTP(S) URL, excluding specialised handlers/extensions | HTTPS HTML Open Graph or standard title/site/description/author/type/published time; same-origin provider-declared canonical URL; image URL retained without loading | None: arbitrary frames/scripts and discovered oEmbed endpoints are not activated | Retained metadata or link-only/diagnosed failure. HTTP stays a network-free link |
| Google Maps: supported google.com, maps.google.com, google.co.uk and google.com.au `/maps/place/…`, explicit `q`, Maps URLs `api=1` query/place ID | Explicit URL query/location and valid latitude/longitude pair, clearly labelled URL evidence rather than independent geocoding | Optional restricted Maps Embed API **place** iframe; requires host configuration and an explicit click | Card/external link works without credentials. Viewport `@…` centres, directions, ambiguous/home/search forms are not promoted to pins. Shortlinks and unsupported Maps hosts remain diagnosed external links |
| X/Twitter: exact supported host and `/<account>/status/<numeric-id>` or `/i/web/status/<id>`; optional photo/video suffix | Official `publish.x.com/oembed`; text and supplied author; exact source URL and stable post ID; no invented timestamp/attachment metadata | Locally authored sandbox shell loads the official X widget after consent, never the returned HTML | Live metadata worked. The widget reported no results in Chromium; captured text/external link remained usable |
| Bluesky: `bsky.app/profile/<handle-or-did:plc>/post/<rkey>` | Official public getPostThread with depth/parentHeight zero; verified DID/handle/post ID, text, supplied author/handle/date, limited attachment/quote metadata; labelled/opt-out content withheld | Exact official `embed.bsky.app/embed/<AT-URI>` iframe after consent; no host-page widget script needed | Live public metadata and actual live embed text were demonstrated. Captured preview works offline; private/deleted/labelled/mismatched responses become diagnosed fallback |

Unsupported social home/profile/search URLs remain links, not scraped posts. Generic pages may supply Open Graph metadata but do not acquire new provider-specific adapters. Bluesky was chosen for its documented public single-post API and official embed interface. No feeds, replies, social graph, engagement polling, posting or authentication are implemented.

## Identity, persistence and recovery

The exact supplied URL, endpoint, capture time, immutable JSON source envelope, projection and document occurrence are separate. The envelope retains the validated UTF-8 response text; it is not a full webpage archive, screenshot, provider revision guarantee or redistributed interactive application. Native preview metadata is unreviewed. There is no canonical Entity/Claim port on the web service.

`web.import`, `web.resume` and `web.embed` are typed, transport-independent operations on the existing Vault host. Import jobs checkpoint the retained original before projection. Worker failure can resume without fetching again; cancellation and stale destination checks prevent insertion. Failed jobs expose `mutable-web-job:UUID` for explicit resume. Completed failed-provider captures remain immutable fallbacks; use Capture again to make a new attempt. A process interruption before the original checkpoint can require reacquisition. Generic job execution cannot bypass the dedicated resume handler.

`.inkpkg` closure includes the immutable JSON original and any separately consented retained PNG/JPEG thumbnail. Import validates the projection against the retained envelope, rejects tampering, rebases managed references and allocates fresh occurrence identities. It does not create canonical records or activate an embed. The passive standalone reader keeps its existing unknown-resource fallback; full native G previews are qualified in Flint, not newly implemented in that standalone viewer.

## Security and bounds

- Existing HTTPS public-DNS validation, connection pinning, no credentials/cookies, same-origin redirects (maximum three), 15-second acquisition timeout and response limits remain unchanged. Maps shortlink expansion is deliberately unsupported rather than weakening those protections.
- One public page/post request; 2 MiB response, UTF-8, validated HTML/JSON Content-Type. No subresource crawling or arbitrary oEmbed discovery fetch. Only fixed official X and Bluesky endpoints are used for those adapters.
- Parsing runs in the existing bounded worker: 50,000 nodes, depth 64, bounded projected fields and attachments, 3 MiB JSON original envelope. Existing worker/native/fragment/package budgets still apply and can reject otherwise parseable input.
- Eight admitted jobs, serial captures, 60-second operation deadline; existing executor and HTTP limits remain. No new IndexedDB, SQL job tables or filesystem authority.
- Fetched text is escaped by Solid. X provider HTML is parsed for text and identity only, never inserted into the host. Bluesky labels/opt-outs and unknown post identities do not produce native post content.
- Four active G embeds per editor, fixed 440-pixel viewport, explicit unload, view-close/editor cleanup and stale activation checks. Maps/Bluesky use exact cross-origin embed URLs with sandboxed scripts/origin capability but no forms, popups, downloads or top navigation. X uses an opaque sandbox and an explicit CSP around a locally authored widget shell. Provider scripts never execute in the editor's origin. Provider frames may themselves load media/telemetry and use browser cookies after consent; no promise of anonymous third-party viewing is made.
- Remote images never load merely because metadata contains their URL. Generic thumbnails require a separate permission/rights choice and existing validated PNG/JPEG acquisition. The retained image is shown only through an explicit local-original action. A URL does not establish redistribution rights.

## Google Maps setup and privacy

Set `MUTABLE_GOOGLE_MAPS_EMBED_KEY` in the Node service environment to a browser-usable key restricted to **Maps Embed API** and approved HTTP referrers. Configure the Google project/API and billing as required by Google. No key is supplied, hardcoded, put into native data or included in packages. Only explicit map activation requests an iframe URL containing the key; such browser visibility follows Google's documented key model. The iframe uses `strict-origin-when-cross-origin` so referrer restrictions can work without sending the editor path/query. No actual configured map rendering is claimed in this qualification.

Primary sources checked: [Maps modes](https://developers.google.com/maps/documentation/embed/embedding-map), [usage/billing](https://developers.google.com/maps/documentation/embed/usage-and-billing), [key restrictions](https://developers.google.com/maps/api-security-best-practices), [X embedding](https://help.x.com/en/using-x/how-to-embed-a-post), [registered X endpoint](https://oembed.org/providers/x), [Bluesky API](https://docs.bsky.app/docs/api/app-bsky-feed-get-post-thread), [Bluesky embed guide](https://bsky.network/docs/advanced-guides/oembed/), and [official iframe construction](https://embed.bsky.app/static/embed.js).

## Executed automated and live checks

- `src/web-resources`, `server/application-services/web.test.ts` and existing URL/video classifiers: 38 tests passed initially. Coverage includes hostile URLs, provider identity, missing/unsafe metadata, original timestamps, no arbitrary discovery, structured parsing limits, cancellation, real worker/asset/journal recovery, bounded queue, configured/unconfigured key handling, package reconstruction and tampering rejection.
- Broader selected integration/package/E/F regression: **78 tests across 13 files passed**.
- A–D services, F parsers and clipboard UI: **103 of 104 passed on the first run**. The one failure was the old generic-URL test expecting an iframe while G is enabled. It now explicitly verifies the legacy feature-off case; YouTube/Vimeo continue with G enabled. The complete 62-test clipboard suite and nine G model/package checks then passed (71 total).
- Protected remote acquisition: **18 Node tests passed**, including G MIME, private DNS, redirect, HTTP denial and size checks; existing acquisition tests remain intact.
- `scripts/check-web-resources-live.mjs`: built service host, isolated temporary Vault, original hashes and completed-job resume verified. Generic `https://example.com` returned Example Domain (724-byte envelope, 1.7 s); Maps URL generated a network-free location card (128 bytes, 1.3 s); X `jack/status/20` returned public post text (884 bytes, 1.6 s); Bluesky's official orientation post returned text, author and timestamp (2,589 bytes, 1.7 s). These are observed smoke timings, not guarantees. No implicit canonical service calls occurred.

Live original and fixture evidence are distinct. Fixture post text drives deterministic browser import checks; the optional provider frames actually contacted official services. No fixture is claimed as proof of an interactive provider's current availability.

## Browser and performance qualification

`scripts/check-web-resources-browser.mjs` passed in **Chrome 155.0.8059.80 on macOS** using actual Flint/Solid rendering, the trusted Command-Shift-V event, real review dialogs, typed HTTP, built preparation worker, filesystem jobs and managed assets in isolated temporary Vault roots. It demonstrated four native card types, no third-party network before activation, one-step insertion Undo/Redo, manual save, cold native reopen into a fresh editor, view-close unloading, and package import into a second asset root with fresh occurrence IDs and byte-identical originals. Reopen/package import did not reactivate embeds. Offline cards stayed readable; canonical calls were zero. The four-card package was 14,355 bytes.

The probe enabled network inspection for child frames as well as the top-level editor. Bluesky's live iframe displayed the actual official post text. X contacted its official widget endpoints but reported no results and a provider-side exception; no exception originated in the editor. The no-key Google Maps path displayed its explicit configuration fallback without a provider call. No configured Google map, successful X interactive rendering, Safari or Firefox support is claimed. Unit/package tests additionally verify exact retained PNG thumbnail bytes and cross-Vault reference rebinding; a new end-to-end thumbnail download was not part of this browser probe.

The existing real Flint typing benchmark ran six times in mixed order, without concurrent builds/tests, on the Michelangelo letter fixture (eight paragraphs, 499-character measured paragraph, 40 insert/delete inputs plus actual Chrome text input and Undo):

| Configuration | Run 1 synchronous median / p95 | Run 2 synchronous median / p95 |
| --- | --- | --- |
| G disabled | 3.7 / 5.8 ms | 4.0 / 6.8 ms |
| G enabled, no card | 3.8 / 7.1 ms | 4.0 / 6.4 ms |
| G enabled, captured card mounted | 3.6 / 6.1 ms | 4.0 / 6.1 ms |

All runs restored the original text and recorded **zero service requests, worker starts, repository snapshots and document-status reads during measured edits**. Real text input/Undo assertions passed. Frame medians were approximately 16.6–16.7 ms; variable headless tails are not a guaranteed user-visible latency. These observations show no consistent G-enabled deterioration. They do not benchmark typing while an actively running third-party embed consumes CPU; third-party runtime cost remains a reason for opt-in activation and bounded concurrent frames.

Artifacts: `/tmp/mutable-g-browser-final.log`, `/tmp/mutable-g-live1.log`, `/tmp/mutable-g-regressions.log`, `/tmp/mutable-g-provider-regressions.log`, `/tmp/mutable-g-ui-recheck.log`, `/tmp/mutable-g-package-final.log`, `/tmp/mutable-g-security.log`, and `/tmp/mutable-g-typing-{off,on,source}-{1,2}/results.json`. These are local qualification artifacts, not portable application data. TypeScript checks and production client/server builds pass; existing chunk-size/dynamic-import notices remain. The final export guard includes G original closure independently of the older cross-resource flag.

## Dependencies, failures and limitations

No dependency was added or upgraded. Qualification-time `npm audit --json` still reports the previously recorded 13 findings: 1 low, 4 moderate, 2 high, 6 critical in the existing dependency trees. They remain separate maintenance work; G does not claim to resolve them.

Recorded failed probes: the tampered-package test initially expected rejection at archive opening, but the existing writer correctly rejected it earlier during creation; the expectation was corrected. The browser fixture's first direct compiled-module import lacked Node extension rewriting; its Vite SSR replacement then could not resolve the filesystem journal's dynamic URL import. The fixture now bundles its service adapters with the existing esbuild tooling, uses the actual built worker, and leaves production build configuration unchanged. Initial nested Bluesky widget framing was blank; using the exact official cross-origin iframe eliminated the unnecessary wrapper and displayed the real post. X's widget returned no results and a provider-side exception; its native metadata remained usable, and no broader sandbox permissions were introduced for X.

Remaining boundaries: no Maps credentials/live map qualification; no shortlink cross-origin expansion; X interactive availability is not established; no arbitrary generic-site iframe or arbitrary oEmbed discovery; no guaranteed full-page/remote-media archival; no automatic metadata refresh or removal reconciliation; no avatar/media downloading for social posts; conservative suppression of any Bluesky labelled post/author; generic HTML must be UTF-8. Documented budgets and unknown-provider fallbacks remain intentional. Safari/Firefox and Windows/Linux are not qualified by these Chrome/macOS checks.

## Acceptance gate

Milestone G is provisionally accepted. The requested final provider checks and remaining integration boundaries are recorded in the [qualification addendum](MUTABLE_WEB_RESOURCE_VIEWERS_MILESTONE_G_QUALIFICATION_ADDENDUM.md): configured Maps rendering awaits manual qualification; X interactive rendering is incompatible with the retained sandbox in the tested browser. Implementation stops here. Do not begin Spotify, GitHub, shopping/recipe/event viewers, additional social providers, AI ingestion, TEI XML or another milestone without explicit authorisation.
