import { it, expect } from "vitest";
import { recognizeWeb, webCandidate, providerEndpoint } from "./registry";
import { webUrl, type WebOriginal } from "./model";
import { parseWebBytes, webProjection } from "./parse";
import { socialEmbed, blueskyFrame, acquireEmbedSlot } from "./embed";
import { resourceUrl } from "../interchange/resource-url";
const original = (source: string, body?: string): WebOriginal => {
  const p = providerEndpoint(recognizeWeb(source));
  return {
    version: 1,
    source,
    capturedAt: "2026-10-19T00:00:00Z",
    ...(p
      ? { format: p.format, endpoint: p.url, body: body ?? "" }
      : { format: "url" }),
  };
};
const parsed = (o: WebOriginal) =>
  parseWebBytes(new TextEncoder().encode(JSON.stringify(o)));
it("reserves all specialized providers and file types, including unchanged YouTube/Vimeo timestamps", () => {
  for (const url of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s",
    "https://youtu.be/dQw4w9WgXcQ?t=12",
    "https://vimeo.com/12345#t=30s",
    "https://player.vimeo.com/video/12345",
    "https://doi.org/10.1000/test",
    "https://en.wikipedia.org/wiki/Douglas_Adams",
    "https://example.org/manifest.json",
    "https://example.org/x.pdf",
    "https://example.org/a.xml",
    "https://example.org/a.csv",
    "https://example.org/a.epub",
    "https://example.org/a.JPG",
  ])
    expect(webCandidate(url)).toBe(false);
  expect(
    resourceUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s")?.video
      ?.provider,
  ).toBe("youtube");
  expect(resourceUrl("https://vimeo.com/12345#t=30s")?.video?.provider).toBe(
    "vimeo",
  );
  expect(webCandidate("https://example.org/article?t=42#section")).toBe(true);
});
it("recognizes exact resource hosts and rejects malicious URLs", () => {
  for (const u of [
    "javascript:alert(1)",
    "https://user:password@example.org",
    "https://example.org:444/a",
    "https://example.org/a b",
    "https://x.com\\@evil.org/a",
  ])
    expect(() => webUrl(u)).toThrow();
  expect(recognizeWeb("https://x.com.evil.org/user/status/123").provider).toBe(
    "web",
  );
  expect(recognizeWeb("https://x.com/search?q=hello").diagnostic).toMatch(
    /Not a supported/,
  );
  const x = recognizeWeb("https://twitter.com/jack/status/20?t=123#x");
  expect(x.source).toContain("?t=123#x");
  expect(x.url).toBe("https://x.com/jack/status/20");
  expect(x.id).toBe("20");
});
it("maps explicit URL locations without misrepresenting viewport centres or search/home pages", () => {
  expect(
    recognizeWeb("https://www.google.com/maps/@-33,151,15z").location,
  ).toBeUndefined();
  expect(
    recognizeWeb("https://www.google.com/maps/dir/A/B").location,
  ).toBeUndefined();
  expect(
    recognizeWeb("https://maps.google.com/?q=-33.8569,151.2152").location
      ?.coordinates,
  ).toEqual([-33.8569, 151.2152]);
  expect(
    recognizeWeb("https://maps.google.com/?q=999,20&query_place_id=abcdefghijk")
      .location,
  ).toBeUndefined();
  expect(
    recognizeWeb(
      "https://www.google.com/maps/place/Sydney+Opera+House/@-33,151,15z",
    ).location?.coordinates,
  ).toBeUndefined();
  expect(
    providerEndpoint(recognizeWeb("https://maps.app.goo.gl/abc")),
  ).toBeUndefined();
});
it("extracts metadata as inert text, keeps missing fields missing and never follows oEmbed discovery", () => {
  const p = parsed(
    original(
      "https://example.org/post?q=1#part",
      '<title>Fallback</title><meta property="og:title" content="&lt;script&gt;bad&lt;/script&gt;"><meta property="og:description" content="Words"><meta property="og:image" content="/image.png"><meta property="article:published_time" content="2020-01-02T13:45:01+10:00"><meta property="og:url" content="https://evil.org/canonical"><link type="application/json+oembed" href="https://127.0.0.1/api"><script>fetch("https://evil.org")</script>',
    ),
  );
  expect(p.title).toBe("<script>bad</script>");
  expect(p.image).toBe("https://example.org/image.png");
  expect(p.canonicalUrl).toBeUndefined();
  expect(p.published).toBe("2020-01-02T13:45:01+10:00");
  expect(p.author).toBeUndefined();
  expect(
    parsed(original("https://example.org", "<p>nothing</p>")).diagnostics,
  ).toHaveLength(1);
  expect(
    parsed(
      original(
        "https://example.org",
        '<meta property="article:published_time" content="tomorrow">',
      ),
    ).published,
  ).toBeUndefined();
});
it("uses official X oEmbed text only and validates returned post identity", () => {
  const o = original(
    "https://x.com/jack/status/20",
    JSON.stringify({
      type: "rich",
      provider_name: "Twitter",
      author_name: "Jack",
      html: '<blockquote class="twitter-tweet"><p>Hello &amp; welcome</p><a href="https://twitter.com/jack/status/20">Date</a></blockquote><script>alert(1)</script>',
    }),
  );
  const p = parsed(o);
  expect(p.social?.text).toBe("Hello & welcome");
  expect(p.social?.published).toBeUndefined();
  const embed = socialEmbed({ source: o.source, projection: p } as any)!;
  expect(embed).toContain("platform.twitter.com/widgets.js");
  expect(embed).not.toContain("alert(1)");
  expect(embed).not.toContain("Hello");
  expect(
    parsed({ ...o, body: o.body!.replace("/status/20", "/status/21") }).status,
  ).toBe("unavailable");
});
it("bounds Bluesky to one identified post and suppresses public-display opt-outs", () => {
  const did = "did:plc:abcdefghijklmnopqrstuvwxyz".slice(0, 32),
    key = "3jvzb3zh4zc2s",
    url = `https://bsky.app/profile/bsky.app/post/${key}`;
  const body = {
    thread: {
      $type: "app.bsky.feed.defs#threadViewPost",
      post: {
        uri: `at://${did}/app.bsky.feed.post/${key}`,
        author: { did, handle: "bsky.app", displayName: "Bluesky" },
        record: {
          $type: "app.bsky.feed.post",
          text: "Hello",
          createdAt: "2026-10-19T02:03:04Z",
        },
      },
    },
  };
  const o = original(url, JSON.stringify(body)),
    p = parsed(o);
  expect(p.social?.text).toBe("Hello");
  expect(providerEndpoint(recognizeWeb(url))?.url).toContain(
    "depth=0&parentHeight=0",
  );
  expect(blueskyFrame({ source: url, projection: p } as any)).toContain(
    "embed.bsky.app",
  );
  (body.thread.post.author as any).labels = [{ val: "!no-unauthenticated" }];
  expect(parsed({ ...o, body: JSON.stringify(body) }).status).toBe(
    "unavailable",
  );
});
it("retains failure fallback and bounds HTML/JSON parsing", () => {
  expect(
    parsed({
      ...original("https://example.org"),
      format: "url",
      body: undefined,
      endpoint: undefined,
      failure: "HTTP 403",
    }).status,
  ).toBe("unavailable");
  expect(
    parsed(
      original(
        "https://example.org",
        "<div>".repeat(100) + "x" + "</div>".repeat(100),
      ),
    ).status,
  ).toBe("unavailable");
  expect(() =>
    webProjection({
      ...original("https://example.org"),
      body: "a".repeat(2 * 1024 * 1024 + 1),
    }),
  ).toThrow(/capture/);
});
it("limits and independently releases interactive viewer ownership", () => {
  const editor = {},
    owners = Array.from({ length: 5 }, () => ({})),
    release = owners.slice(0, 4).map((o) => acquireEmbedSlot(editor, o));
  expect(() => acquireEmbedSlot(editor, owners[4])).toThrow(/maximum/);
  release[1]();
  const next = acquireEmbedSlot(editor, owners[4]);
  next();
  release.forEach((f) => f());
  expect(() => acquireEmbedSlot(editor, {})).not.toThrow();
});
