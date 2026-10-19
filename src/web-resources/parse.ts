import {everydayProjection} from "./everyday-parse";
import { parse } from "parse5";
import { recognizeWeb, providerEndpoint } from "./registry";
import { safeWebUrl, type WebOriginal, type WebProjection } from "./model";
const text = (v: unknown, max = 2000) =>
  typeof v === "string"
    ? v
        .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
        .trim()
        .slice(0, max)
    : undefined;
const date = (v: unknown) =>
  typeof v === "string" &&
  v.length <= 80 &&
  /^\d{4}-\d\d-\d\d(?:T|$)/.test(v) &&
  Number.isFinite(Date.parse(v))
    ? v
    : undefined;
function tree(source: string) {
  const root = parse(source),
    nodes: any[] = [];
  const pending: [any, number][] = [[root, 0]];
  while (pending.length) {
    const [n, d] = pending.pop()!;
    if (d > 64 || nodes.length >= 50000)
      throw Error("Metadata HTML structure limit");
    nodes.push(n);
    for (const c of n.childNodes ?? []) pending.push([c, d + 1]);
  }
  return nodes;
}
const attr = (n: any, k: string) =>
  n.attrs?.find((a: any) => a.name === k)?.value;
function nodeText(n: any): string {
  let s = "",
    todo = [n];
  while (todo.length && s.length < 20000) {
    const v = todo.pop();
    if (["script", "style", "template", "noscript"].includes(v.tagName))
      continue;
    if (v.nodeName === "#text") s += v.value;
    for (let i = (v.childNodes?.length ?? 0) - 1; i >= 0; i--)
      todo.push(v.childNodes[i]);
  }
  return text(s, 12000) ?? "";
}
function json(body: string) {
  const v = JSON.parse(body);
  let count = 0;
  const todo: [any, number][] = [[v, 0]];
  while (todo.length) {
    const [n, d] = todo.pop()!;
    if (++count > 50000 || d > 64) throw Error("Metadata JSON structure limit");
    if (n && typeof n === "object")
      for (const c of Object.values(n)) todo.push([c, d + 1]);
  }
  return v;
}
export function webProjection(o: WebOriginal): WebProjection {
  if (
    o?.version !== 1 ||
    !["url", "html", "x-oembed", "bluesky", "spotify", "soundcloud", "github", "apple-podcast", "calendar", "feed"].includes(o.format) ||
    typeof o.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(o.capturedAt)) ||
    (o.failure !== undefined &&
      (typeof o.failure !== "string" || o.failure.length > 500)) ||
    (o.body !== undefined &&
      (typeof o.body !== "string" ||
        new TextEncoder().encode(o.body).length > 2 * 1024 * 1024))
  )
    throw Error("Invalid web capture");
  if(o.intent!==undefined&&(o.intent!=="feed"||o.adapter!=="everyday-v1"))throw Error("Unknown web intent");
  if(o.adapter!==undefined&&o.adapter!=="everyday-v1")throw Error("Unknown web adapter");
  if(o.adapter==="everyday-v1")return everydayProjection(o);
  const i = recognizeWeb(o.source),
    endpoint = providerEndpoint(i),
    p: WebProjection = {
      provider: i.provider,
      diagnostics: [],
      status: "link-only",
    };
  if (i.diagnostic) p.diagnostics.push(i.diagnostic);
  if (i.location) p.location = i.location;
  if (o.failure) {
    p.status = "unavailable";
    p.diagnostics.push(o.failure);
  }
  if (o.format === "url") {
    if (o.body !== undefined || o.endpoint !== undefined)
      throw Error("Unexpected URL-only response");
    return p;
  }
  if (
    !endpoint ||
    o.format !== endpoint.format ||
    !o.endpoint ||
    new URL(o.endpoint).origin !== new URL(endpoint.url).origin
  )
    throw Error("Capture endpoint/provider mismatch");
  if (i.provider !== "web" && o.endpoint !== endpoint.url)
    throw Error("Provider endpoint changed");
  if (typeof o.body !== "string") throw Error("Missing retained response");
  p.status = "captured";
  if (o.format === "html") {
    const nodes = tree(o.body),
      meta = new Map<string, string>();
    for (const n of nodes)
      if (n.tagName === "meta") {
        const key = (
            attr(n, "property") ??
            attr(n, "name") ??
            ""
          ).toLowerCase(),
          v = attr(n, "content");
        if (v && !meta.has(key)) meta.set(key, v);
      }
    p.title = text(
      meta.get("og:title") ??
        nodeText(nodes.find((n) => n.tagName === "title") ?? {}),
      500,
    );
    p.description = text(meta.get("og:description") ?? meta.get("description"));
    p.site = text(meta.get("og:site_name"), 200);
    p.author = text(meta.get("author"), 300);
    p.published = date(meta.get("article:published_time") ?? meta.get("date"));
    p.type = text(meta.get("og:type"), 100);
    p.image = safeWebUrl(meta.get("og:image"), o.endpoint);
    const canonical = safeWebUrl(
      meta.get("og:url") ??
        attr(
          nodes.find(
            (n) => n.tagName === "link" && attr(n, "rel") === "canonical",
          ) ?? {},
          "href",
        ),
      o.endpoint,
    );
    if (canonical && new URL(canonical).origin === new URL(o.endpoint).origin)
      p.canonicalUrl = canonical;
    if (!p.title && !p.description)
      p.diagnostics.push(
        "No useful public page metadata supplied; original link retained.",
      );
  } else if (o.format === "x-oembed") {
    const j = json(o.body);
    if (
      j.type !== "rich" ||
      (j.provider_name !== "Twitter" && j.provider_name !== "X") ||
      typeof j.html !== "string"
    )
      throw Error("Unsupported X oEmbed response");
    const nodes = tree(j.html),
      quote = nodes.find(
        (n) =>
          n.tagName === "blockquote" &&
          /\btwitter-tweet\b/.test(attr(n, "class") ?? ""),
      );
    if (!quote) throw Error("No public post in X response");
    const links = nodes
      .filter((n) => n.tagName === "a")
      .map((n) => safeWebUrl(attr(n, "href")))
      .filter(Boolean);
    if (
      !links.some((url) => {
        try {
          const x = recognizeWeb(url!);
          return x.provider === "x" && x.id === i.id;
        } catch {
          return false;
        }
      })
    )
      throw Error("X response post identity mismatch");
    p.social = {
      platform: "x",
      text: text(
        nodeText(
          (quote.childNodes ?? []).find((n: any) => n.tagName === "p") ?? {},
        ),
        12000,
      ),
      author: text(j.author_name, 300),
      handle: i.account === "i/web" ? undefined : i.account,
      attachments: [],
    };
    p.author = p.social.author;
    p.site = "X";
    p.embedId = i.id;
    // A visible date label may be localized; do not fabricate an ISO timestamp.
    p.diagnostics.push(
      "X oEmbed may omit timestamps and attachment details. Interactive content is separate from this capture.",
    );
  } else {
    const j = json(o.body),
      post = j.thread?.post;
    if (!post || j.thread?.$type !== "app.bsky.feed.defs#threadViewPost")
      throw Error("Public Bluesky post unavailable");
    if (
      (post.labels?.length ?? 0) > 0 ||
      (post.author?.labels?.length ?? 0) > 0
    )
      throw Error("Labelled Bluesky content is not imported by this viewer");
    if (
      post.record?.$type !== "app.bsky.feed.post" ||
      typeof post.author?.did !== "string" ||
      !/^did:plc:[a-z2-7]{24}$/.test(post.author.did) ||
      post.uri !== `at://${post.author.did}/app.bsky.feed.post/${i.id}` ||
      (i.account!.startsWith("did:")
        ? post.author.did !== i.account
        : post.author.handle?.toLowerCase() !== i.account!.toLowerCase())
    )
      throw Error("Bluesky post identity mismatch");
    const e = post.embed,
      attachments: NonNullable<WebProjection["social"]>["attachments"] = [];
    for (const a of (Array.isArray(e?.images) ? e.images : []).slice(0, 4))
      attachments.push({
        type: "image",
        description: text(a.alt, 1000),
        url: safeWebUrl(a.fullsize),
      });
    if (e?.external)
      attachments.push({
        type: "external",
        description: text(e.external.title, 500),
        url: safeWebUrl(e.external.uri),
      });
    if (e?.$type === "app.bsky.embed.video#view")
      attachments.push({ type: "video", description: text(e.alt, 1000) });
    const q = e?.record?.record ?? e?.record;
    const quote =
      q?.$type === "app.bsky.embed.record#viewRecord" &&
      !q.labels?.length &&
      !q.author?.labels?.length
        ? {
            text: text(q.value?.text, 2000),
            author: text(q.author?.displayName ?? q.author?.handle, 300),
          }
        : undefined;
    p.social = {
      platform: "bluesky",
      text: text(post.record.text, 12000),
      author: text(post.author.displayName, 300),
      handle: text(post.author.handle, 300),
      avatar: safeWebUrl(post.author.avatar),
      published: date(post.record.createdAt),
      attachments,
      quote,
    };
    p.published = p.social.published;
    p.author = p.social.author;
    p.site = "Bluesky";
    p.embedId = post.uri;
  }
  return JSON.parse(JSON.stringify(p));
}
export function parseWebBytes(bytes: Uint8Array) {
  if (bytes.length > 3 * 1024 * 1024)
    throw Error("Web original envelope limit");
  const o = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  try {
    return webProjection(o);
  } catch (e) {
    return webProjection({
      version: 1,
      source: o.source,
      capturedAt: o.capturedAt,
      format: "url",
      ...(o.adapter==="everyday-v1"?{adapter:"everyday-v1" as const,...(o.intent==="feed"||o.format==="feed"?{intent:"feed" as const}:{})}:{}),
      failure: String(e).slice(0, 500),
    });
  }
}
