# Milestone G execution plan

19 October 2026. Implemented and submitted for acceptance; see [qualification](MUTABLE_WEB_RESOURCE_VIEWERS_MILESTONE_G_QUALIFICATION.md). The execution scope below is retained. Authorised by the supplied feature brief. E remains accepted/closed; no other milestone status changes.

## Repository reuse and boundaries

Keep the existing YouTube/Vimeo dispatch, player views and URL semantics intact. Preserve academic/PDF/IIIF and structured-file priority before the generic handler. Add one default-enabled `webResourceViewers` flag, one native `mutable/web-resource-block`, a small pure recognizer/presentation model, and scoped `web.import/resume/embed` operations. No canonical mutations or new SQLite tables. Use existing durable jobs, bounded executor, protected acquisition, immutable JSON originals, MutableFragment/history/manual save and package asset closure. Lazy parsing and Solid-owned local embed state do no work on ordinary typing.

## Delivery slices

| Slice | Implementation | Qualification |
| --- | --- | --- |
| G1 | Exact-host/path registry; bounded HTML Open Graph/standard metadata; retained source/provenance envelope; preview before insertion | Hostile URLs/HTML, absent metadata, no automatic endpoint discovery; specialized dispatch regression |
| G2 | Google Maps place/query/coordinate card from explicitly encoded URL evidence; configured Embed API place mode only | Ambiguous viewport coordinates never treated as a pin; no scraping; no-key fallback; activation/disposal |
| G3 | Shared single-post presentation; X official oEmbed; Bluesky public single-post API with replies/parents disabled | Provider identity/label checks, denied/deleted fallback; explicit official embed activation; live smoke |
| G4 | Save/reopen/Undo, exact-original package closure/rebinding, offline preview and inert standalone fallback | Durable recovery/cancellation, privacy, real Chromium, typing benchmarks, typecheck/build and A–F regressions |

## Provider/configuration decisions

Bluesky is selected for its documented unauthenticated single-post API and official embeds; no account, feed or social graph acquisition. Respect public-display opt-outs and moderation labels. X uses the official publish endpoint; failed/private/rate-limited posts retain a diagnosed link fallback, never a scraping workaround. Generic pages use only one bounded HTML response; arbitrary oEmbed discovery endpoints and arbitrary interactive frames are not allowed. Cross-origin redirects (including shortened Maps links) fall back truthfully rather than expanding the shared transport policy.

Maps cards describe URL evidence, not independently geocoded facts. API keys are optional host configuration, restricted to Maps Embed and approved website referrers; never persisted in native Blocks/packages. Embed activation may expose the configured browser key to Google under its documented usage model. No credentials means a working card/external link. Direction/search/homepage/Street View forms are not treated as verified places.

Original and canonical URLs remain separate. Metadata assertions stay unreviewed. Thumbnails require explicit permission and use only existing protected PNG/JPEG admission; remote URLs alone never render images. Interactive state is ephemeral, unloaded on close and not serialized. At most four active G embeds per editor; each has a bounded viewport. Fallback/error captures may be explicitly retried as new captures, without silently refreshing existing Blocks.

Initial limits: 2 MiB HTML/JSON, 50,000 parsed nodes/depth 64, bounded text/attachment fields, one post/page per operation, eight queued imports, serial capture execution, 60-second job deadline with existing 15-second remote and 30-second worker bounds. No extra dependencies planned; reuse parse5.

## Sources checked before implementation

- [Maps Embed modes](https://developers.google.com/maps/documentation/embed/embedding-map), [billing/key requirements](https://developers.google.com/maps/documentation/embed/usage-and-billing), [key restrictions](https://developers.google.com/maps/api-security-best-practices).
- [X official embedding](https://help.x.com/en/using-x/how-to-embed-a-post), [X Publish](https://publish.x.com/), [registered oEmbed endpoint](https://oembed.org/providers/x).
- [Bluesky public post API](https://docs.bsky.app/docs/api/app-bsky-feed-get-post-thread), [official embed guide](https://bsky.network/docs/advanced-guides/oembed/).

Maps Embed currently has no per-request charge but requires a key and configured Google project/billing. No configured key or actual map success is assumed. Provider availability is tested independently from fixture correctness. Milestone G is now provisionally accepted; see the [final provider qualification addendum](MUTABLE_WEB_RESOURCE_VIEWERS_MILESTONE_G_QUALIFICATION_ADDENDUM.md) for the exact manual Maps check and confirmed X sandbox/CORS incompatibility. No additional viewer or milestone is authorised.
