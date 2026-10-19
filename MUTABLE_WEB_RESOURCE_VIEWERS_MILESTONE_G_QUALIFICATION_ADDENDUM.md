# Milestone G — Final provider qualification addendum

19 October 2026. Milestone G is **provisionally accepted**. This addendum addresses only the two requested integration checks; accepted capture, persistence, offline reconstruction and other viewer behaviour remain unchanged.

## Google Maps: configured rendering remains unqualified

No `MUTABLE_GOOGLE_MAPS_EMBED_KEY` was available in the qualification process environment or checkout dotenv configuration. No successful interactive map is claimed. The existing no-key fallback and activation-only URL construction remain qualified; the latter uses a dummy key in tests and does not demonstrate Google rendering.

### Exact manual qualification procedure

1. In a Google Cloud project, complete Google's [account/billing setup and enable Maps Embed API](https://developers.google.com/maps/documentation/embed/get-api-key). Create a dedicated browser key restricted to **Maps Embed API** and **Websites**. Allow the actual Flint frontend origin, e.g. `http://localhost:3000/*` (and `http://127.0.0.1:3000/*` only if used). Restrict the frontend origin, not backend port 3002. See [Google's key guidance](https://developers.google.com/maps/api-security-best-practices).
2. Restart the Node application-service host with the key in its environment. For the repository's zsh development environment, run the following from the repository root; the prompt avoids placing the value in shell history:

   ```zsh
   read -rs 'MUTABLE_GOOGLE_MAPS_EMBED_KEY?Maps Embed key: '
   export MUTABLE_GOOGLE_MAPS_EMBED_KEY
   npm run dev
   # After stopping the dev server:
   unset MUTABLE_GOOGLE_MAPS_EMBED_KEY
   ```

   `scripts/dev.mjs` passes its environment to Node; putting the value only in a Vite `.env.local` file does not configure this host. Do not use a `VITE_` variable. If Vite chooses another port, update the allowed referrer accordingly.
3. In Flint, open a disposable document and use Command/Control–Shift–V with `https://www.google.com/maps/search/?api=1&query=Sydney%20Opera%20House`. Complete capture review. Confirm a native location card and **no Google iframe/request before activation**. Save manually once to establish a clean baseline.
4. Choose **Load map → Allow and load**. In DevTools confirm an iframe request to `https://www.google.com/maps/embed/v1/place`, with the intended query and an origin-only `Referer` matching the configured frontend. Keep the existing `allow-scripts allow-same-origin` sandbox and `strict-origin-when-cross-origin` referrer policy. This referrer policy matches [Google's documented integration](https://developers.google.com/maps/documentation/embed/embedding-map).
5. **Pass requires visible map tiles, the expected location marker/label, working drag-to-pan and zoom controls**, and no key/referrer/API configuration error. An iframe element or HTTP 200 alone is insufficient. Record browser/version, OS, frontend origin, date and a screenshot without a visible key. Do not retain unredacted network URLs/HAR files containing the key.
6. Unload interactive content and confirm the iframe disappears. Reactivate, then close/reopen the document: it must return to the passive card. Activation/pan/zoom/unload must not dirty the saved document or add Undo entries. Inspect the saved `.ink` and an exported `.inkpkg`: neither may contain the key or active iframe URL/state. Native metadata must remain readable offline.
7. With the key unset and host restarted, repeat activation: the configuration message and original-link fallback must remain usable, with no Google frame created. If the configured test fails, record the exact provider error and referrer without the key; do not relax the sandbox or key restrictions.

Until those steps pass, **configured Maps rendering is an explicitly unqualified integration boundary**, including compatibility between Google's runtime and our retained sandbox.

## X/Twitter

**Confirmed integration incompatibility with X's current runtime under the required sandbox; not a missing test post or general provider outage.** Interactive X rendering remains unqualified. The earlier report's description of an exception originating in provider code must not be read as attributing the failure solely to X availability.

The focused live probe used Chrome **155.0.8059.80 on macOS**, a fresh browser profile without authentication, the actual production `socialEmbed()` function, unchanged `sandbox="allow-scripts"`, unchanged CSP and `no-referrer`. Each case had 20 seconds to render. Nested-frame requests, response headers, browser CORS/security diagnostics and rendered text were inspected.

| Public post tested | Official oEmbed metadata | Mutable's sandboxed shell | Separate X-owned page control |
| --- | --- | --- | --- |
| [jack, status 20](https://x.com/jack/status/20) | HTTP 200, matching author/post | Post-data request blocked by CORS; original-link fallback only | HTTP 200 post data; actual post text and controls rendered |
| [NASA, 7 April 2026](https://x.com/NASA/status/2041557036274475228) | HTTP 200, matching author/post; public at test time | Same CORS failure | HTTP 200 post data; actual NASA post text and controls rendered |

The newer NASA post is a currently accessible public post, not a claim that it is NASA's latest post. Controls navigated a **separate top-level browser page** to the exact official `platform.twitter.com/embed/Tweet.html` URL generated by X's widget. They did not change any Mutable iframe permissions or run provider code in the editor. Successful control rendering is not successful Mutable embedding.

Both sandboxed cases loaded `widgets.js` and the provider's `Tweet.html` with HTTP 200. The subsequent browser-owned `cdn.syndication.twimg.com/tweet-result` request failed with `AllowOriginMismatch`: its requesting origin was `null`, while the response allowed `https://platform.twitter.com`. The script-only sandbox's opaque origin applies to the nested provider frame too. The direct provider control received HTTP 200 JSON and rendered the same posts, establishing that post availability and the supplied post identifiers were not the cause. X's attempted JavaScript-URL helper also triggered our CSP's inline-script prohibition; the CORS denial independently prevents the post data from reaching its renderer.

No sandbox flags, CSP allowances, authentication, proxying or unofficial acquisition endpoint were added. The `tweet-result` traffic was observed from X's own browser runtime only; it is not a new application-service endpoint. Removing the wrapper alone would not resolve an opaque-origin restriction while retaining the same sandbox. **No safe production correction within the requested security constraints was established**, so native captured metadata and **Open original** remain the usable X paths. A different isolation design would require separate review; it was not implemented here.

## Changes, reproducibility and remaining limits

- Added `scripts/check-web-resources-x-qualification.mjs`, a live diagnostic using production shell generation and separate provider controls. Run `node scripts/check-web-resources-x-qualification.mjs > /tmp/mutable-g-x-addendum.json`. It uses temporary Chrome profile/local host, cleans them up and does not open a Vault. `CHROME_BIN` can select a Chrome executable. Its successful exit means the diagnostic completed, **not** that embedding passed.
- Evidence from this run: `/tmp/mutable-g-x-addendum.json` and `/tmp/mutable-g-x-addendum.log`. These are temporary local artifacts; the table and causal diagnostics above are the retained qualification record.
- Re-ran `npx vitest run src/web-resources/web.test.ts server/application-services/web.test.ts`: **13 tests passed**, covering provider recognition/parsing and service boundaries, including configured/unconfigured key handling. No production code changed, so previous typing, persistence and package qualification stands; no new performance claim is made.
- Corrected the main report's status to provisional acceptance and linked this addendum. Maps remains awaiting a real restricted-key test; X is a demonstrated incompatibility with the retained sandbox. Safari/Firefox and Windows/Linux remain unqualified. No additional viewer or milestone was started.
