import { recognizeWeb } from "./registry";
import type { WebCapture } from "./model";
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
/** Locally authored shell only; never inject the provider's returned HTML. */
export function socialEmbed(c: WebCapture): string | undefined {
  if(c.projection.provider!=="x")return;
  const i = recognizeWeb(c.source);
  if (c.projection.status !== "captured") return;
  if (i.provider === "x" && c.projection.embedId === i.id) {
    return `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src https://platform.twitter.com https://cdn.syndication.twimg.com; style-src 'unsafe-inline'; frame-src https://platform.twitter.com; connect-src https://syndication.twitter.com; img-src https://pbs.twimg.com https://abs.twimg.com; base-uri 'none'; form-action 'none'"><blockquote class="twitter-tweet" data-dnt="true" data-conversation="none"><a href="${escape(i.url)}">Open original post</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script>`;
  }
}
/** Exact iframe path produced by Bluesky's official embed script. No host-page script needed. */
export function blueskyFrame(c:WebCapture):string|undefined {
 if(c.projection.provider!=='bluesky')return;
 const i=recognizeWeb(c.source);
 if(c.projection.status==='captured'&&i.provider==='bluesky'&&typeof c.projection.embedId==='string'&&new RegExp('^at://did:plc:[a-z2-7]{24}/app\\.bsky\\.feed\\.post/'+i.id+'$').test(c.projection.embedId))return 'https://embed.bsky.app/embed/'+c.projection.embedId.slice(5);
}

const hosts = new WeakMap<object, Set<object>>();
export function acquireEmbedSlot(editor: object, owner: object): () => void {
  let active = hosts.get(editor);
  if (!active) hosts.set(editor, (active = new Set()));
  if (active.size >= 4 && !active.has(owner))
    throw Error("Close another web embed first (maximum four per editor).");
  active.add(owner);
  return () => active!.delete(owner);
}
