# Milestone H — execution plan and reconnaissance

19 October 2026. The user's “Read and execute” authorizes implementation and qualification of the supplied H brief. G is accepted and closed, with its Maps/X limitations retained. No new account subsystem, scraping engine or viewer milestone is authorized.

**Closure status: Milestone H is accepted and closed.** This plan is retained as the implementation record. The [qualification report](MUTABLE_EVERYDAY_WEB_RESOURCES_MILESTONE_H_QUALIFICATION.md#closure-and-future-enhancement-candidates) records acceptance, retained limitations and future enhancement candidates; these candidates are not outstanding H defects. No further implementation or resource-viewer expansion is authorized.

## Existing behaviour and focused additions

| Family | Existing G behaviour | H addition | Access / qualification |
| --- | --- | --- | --- |
| Spotify | Generic HTML metadata | Exact track/album/playlist/artist/show/episode identities, official oEmbed metadata, opt-in official player | Public response only, no OAuth/stream extraction. Live metadata and browser player checked separately |
| SoundCloud | Generic HTML metadata | Official oEmbed for public tracks/sets/user links, native metadata and opt-in widget | Public endpoint; private/shortened links fall back. No authenticated API |
| Apple Music, Bandcamp | Generic metadata where supplied | Retain G fallback; no duplicate adapter | Apple Music's catalog API needs developer authorization; no suitably documented general Bandcamp metadata endpoint identified |
| GitHub/Gist | Generic HTML metadata | One documented REST request for repo/issue/PR/commit/release/Gist, bounded typed fields | Unauthenticated public access/rate limits; never clone, execute, fetch raw files or paginate |
| Amazon/eBay | Generic HTML metadata if returned | Exact marketplace/product identity, source/variant context, explicit link-only card | Official catalog APIs require credentials/affiliate or production approval. No marketplace page acquisition, fabricated price or availability |
| Calendar | No event parser | Local UTF-8 ICS and explicit HTTPS ICS capture; bounded event/master/exception/cancellation summaries | ICAL.js, retain complete original including unsupported properties; no recurrence expansion, RSVP or calendar mutation |
| Google Calendar/Outlook links | Generic HTML metadata/login page possible | Recognized link-only event card | No account access or inferred event details |
| Drive/Docs/Sheets/Slides | Generic HTML metadata/login page possible | Typed file identity and permission-aware link-only card | Share URL does not prove access. No automatic download, export, OAuth or iframe |
| Podcasts | Spotify/Apple generic metadata; no feed parser | Spotify forms, Apple public lookup, explicit RSS/Atom feed/local file capture with bounded item summaries | No crawling or subscriptions. Enclosure URLs retained as external links, not downloaded. Optional playback through Spotify's consent-activated player only |

## Integration decisions

Reuse `mutable/web-resource-block`, the web service, durable job queue, worker, immutable JSON source envelopes, MutableFragment insertion, manual-save and package reconstruction. Add one default-enabled `everydayWebResources` flag subordinate to G's web infrastructure. Existing originals keep their old adapter interpretation; H originals explicitly record the adapter version so package re-projection is deterministic. Turning H off disables new capture and player activation while preserving passive saved cards.

Local event/feed files are explicitly selected, never inferred from filesystem paths; preserve validated UTF-8 bytes (including BOM/newlines) losslessly as envelope text. The displayed local-source identity is distinct from an HTTP URL. Remote responses retain exact validated UTF-8 text. Retain source/capture/occurrence identities separately and mark typed fields as source assertions, not canonical facts. Package admission recomputes projections from originals.

Protected acquisition remains HTTPS-only, pinned public DNS, same-origin bounded redirects, no ambient authorization/cookies, 15-second request deadline and 2 MiB response limit. No shortlink expansion. One response per capture. Existing serial queue of eight and 60-second job / 30-second worker limits remain. XML uses the existing saxes parser with no DTD/entities, depth 32 / 20,000 elements; project at most 25 feed items. ICS: at most 20,000 lines / nesting 16 / 100 event components, at most 25 displayed events; no occurrence generation or timezone conversion guesses. Projection remains capped at 40 KiB; overflow fields are truncated with diagnostics. Original bytes remain complete within admission bounds.

## Delivery and qualification

1. Add recognizers, bounded pure projections and tests, then service/file integration.
2. Extend the native card with typed fields/items and explicit music-player activation/disposal; keep provider HTML out of the host DOM.
3. Verify native history/save/reopen, immutable originals, cross-Vault packages, offline/no-request behaviour, provider failures, acquisition security, E/F/G/video regressions, typecheck/build and matched typing runs. Separate fixtures, live smoke and actual browser rendering/playback evidence. Record all remaining limits in `MUTABLE_EVERYDAY_WEB_RESOURCES_MILESTONE_H_QUALIFICATION.md`, then stop for acceptance.

## Provider and dependency evidence

- [Spotify oEmbed](https://developer.spotify.com/documentation/embeds/reference/oembed) and [embed instructions](https://developer.spotify.com/documentation/embeds/tutorials/creating-an-embed): fixed official endpoint and player; metadata does not promise playable media.
- [SoundCloud oEmbed](https://developers.soundcloud.com/docs/oembed): public JSON endpoint; do not execute returned markup.
- [GitHub rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api): unauthenticated REST generally 60 requests/hour/IP, plus secondary limits; no retry loop or pagination.
- [Amazon Creators API registration](https://affiliate-program.amazon.com/creatorsapi/docs/en-us/onboarding/register-for-creators-api), [eBay buying application requirements](https://www.developer.ebay.com/develop/get-started/get-started-on-a-buying-application): not open catalog APIs; link-only here.
- [Google publishing/sharing](https://support.google.com/docs/answer/183965): publishing and sharing differ; no permission inference.
- [Apple lookup API](https://developer.apple.com/library/archive/documentation/AudioVideo/Conceptual/iTuneSearchAPI/index.html): public catalog metadata only; no episode history discovery.
- [ICAL.js](https://github.com/kewisch/ical.js), version 2.2.1, MPL-2.0: maintained dependency-free parser shared by host worker/package validation. No recurrence iteration. Existing saxes/parse5 handle XML/HTML; no new framework.
