import { webUrl, type WebIdentity } from "./model";
import { resourceUrl } from "../interchange/resource-url";
import { academicIdentifier } from "../academic/identifiers";
import { doiInput } from "../interchange/scholarly";
import { wikipediaInput } from "../interchange/encyclopedia";
import { iiifInput } from "../iiif/model";
import { pdfInput } from "../pdf/model";
const mapsHosts = [
  "www.google.com",
  "google.com",
  "maps.google.com",
  "www.google.co.uk",
  "www.google.com.au",
];
/** No substring providers, URL probes, redirects or fabricated geocoding. */
export function recognizeWeb(source: string): WebIdentity {
  const u = webUrl(source),
    result: WebIdentity = { source, url: u.href, provider: "web" };
  if (u.protocol !== "https:")
    return {
      ...result,
      diagnostic: "HTTP link only; acquisition requires HTTPS.",
    };
  if (["maps.app.goo.gl", "goo.gl"].includes(u.hostname))
    return {
      ...result,
      provider: "google-maps",
      diagnostic:
        "Shortened map URL retained. Cross-origin expansion is not enabled; open the original and copy its full place URL.",
    };
  if (
    mapsHosts.includes(u.hostname) &&
    (u.pathname.startsWith("/maps") || u.hostname === "maps.google.com")
  ) {
    result.provider = "google-maps";
    let query: string | undefined;
    const place = /^\/maps\/place\/([^/]+)/.exec(u.pathname);
    if (place) {
      try {
        query = decodeURIComponent(place[1].replace(/\+/g, " "));
      } catch {}
    }
    const explicit =
      u.searchParams.getAll("q").length === 1
        ? u.searchParams.get("q")
        : u.searchParams.get("api") === "1" &&
            u.pathname === "/maps/search/" &&
            u.searchParams.getAll("query").length === 1
          ? u.searchParams.get("query")
          : undefined;
    if (!/\/dir(?:\/|$)|\/streetview(?:\/|$)/.test(u.pathname))
      query ??= explicit ?? undefined;
    else query = undefined;
    if (query && query.length <= 500) {
      result.location = { query };
      const pair = /^(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)$/.exec(query);
      if (pair) {
        const lat = Number(pair[1]),
          lon = Number(pair[2]);
        if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180)
          result.location.coordinates = [lat, lon];
        else delete result.location;
      }
      const id = u.searchParams.get("query_place_id");
      if (result.location && id && /^[\w-]{10,250}$/.test(id))
        result.location.placeId = id;
    }
    result.diagnostic = result.location
      ? "Location supplied in the URL; not independently geocoded or verified as an address."
      : "No unambiguous location in this URL. Viewport coordinates are not a location pin.";
    return result;
  }
  if (/^(?:www\.|maps\.)?google\.[a-z.]+$/.test(u.hostname) && u.pathname.startsWith('/maps'))return {...result,provider:'google-maps',diagnostic:'This Google Maps host is not supported; open the original URL.'};
  const x =
    [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
    ].includes(u.hostname) &&
    /^\/([A-Za-z0-9_]{1,15}|i\/web)\/status\/(\d{1,25})(?:\/(?:photo|video)\/\d+)?\/?$/.exec(
      u.pathname,
    );
  if (x)
    return {
      ...result,
      provider: "x",
      id: x[2],
      account: x[1],
      url: `https://x.com/${x[1]}/status/${x[2]}`,
    };
  const b =
    u.hostname === "bsky.app" &&
    /^\/profile\/(did:plc:[a-z2-7]{24}|[a-zA-Z0-9][a-zA-Z0-9.-]{1,252})\/post\/([a-z2-7]{13})\/?$/.exec(
      u.pathname,
    );
  if (b)
    return {
      ...result,
      provider: "bluesky",
      account: b[1],
      id: b[2],
      url: `https://bsky.app/profile/${b[1]}/post/${b[2]}`,
    };
  // Known social home/profile/search pages are link cards, never a post scraper.
  if (
    [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
      "bsky.app",
      "mobile.twitter.com",
    ].includes(u.hostname)
  )
    result.diagnostic =
      "Not a supported individual public post; retained as a link.";
  return result;
}
/** Specialized importers always win, even when their feature is disabled. */
export function webCandidate(value: string): boolean {
  try {
    if (
      academicIdentifier(value) ||
      doiInput(value) ||
      wikipediaInput(value) ||
      iiifInput(value) ||
      pdfInput(value)
    )
      return false;
    const r = resourceUrl(value);
    if (!r || r.video || r.kind === "image") return false;
    const u = webUrl(value);
    if (
      [
        "youtube.com",
        "www.youtube.com",
        "m.youtube.com",
        "music.youtube.com",
        "youtu.be",
        "www.youtube-nocookie.com",
        "vimeo.com",
        "www.vimeo.com",
        "player.vimeo.com",
      ].includes(u.hostname)
    )
      return false;
    return !/\.(?:pdf|json|xml|csv|tsv|yaml|yml|toml|txt|md|markdown|bib|bibtex|ris|epub|alto|page|ink|inkpkg)$/i.test(
      u.pathname,
    );
  } catch {
    return false;
  }
}
export function providerEndpoint(
  i: WebIdentity,
): { url: string; format: "html" | "x-oembed" | "bluesky" } | undefined {
  if (i.diagnostic || i.provider === "google-maps") return;
  if (i.provider === "x")
    return {
      url: `https://publish.x.com/oembed?url=${encodeURIComponent(i.url)}&omit_script=true&dnt=true&hide_thread=true`,
      format: "x-oembed",
    };
  if (i.provider === "bluesky")
    return {
      url: `https://public.api.bsky.app/xrpc/app.bsky.feed.getPostThread?uri=${encodeURIComponent(`at://${i.account}/app.bsky.feed.post/${i.id}`)}&depth=0&parentHeight=0`,
      format: "bluesky",
    };
  const u = new URL(i.url);
  u.hash = "";
  return { url: u.href, format: "html" };
}
