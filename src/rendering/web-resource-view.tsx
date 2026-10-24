import { ReverseInformation } from './reversible-surface';
import {everydayFrame,isLocalSource} from "../web-resources/everyday";
import {
  createMemo,
  createSignal,
  createEffect,
  on,
  onMount,
  onCleanup,
  For,
  Show,
} from "solid-js";
import type { BlockViewProps } from "../block-tree/types";
import { useReactiveView } from "../reactive-editor/context";
import {
  webCapture,
  safeWebUrl,
  type SocialPost,
} from "../web-resources/model";
import { socialEmbed, blueskyFrame, acquireEmbedSlot } from "../web-resources/embed";
import { HttpApplicationServices } from "../runtime/application-services";
import { managedAsset } from "../interchange/managed-asset";
export function SocialPostViewer(props: { post: SocialPost }) {
  return (
    <div class="web-resource-post">
      <Show when={props.post.author || props.post.handle}>
        <strong>{props.post.author}</strong>{" "}
        <span>{props.post.handle ? "@" + props.post.handle : ""}</span>
      </Show>
      <Show when={props.post.published}>
        <p>
          <time dateTime={props.post.published}>{props.post.published}</time>
        </p>
      </Show>
      <p style={{ "white-space": "pre-wrap" }}>{props.post.text}</p>
      <For each={props.post.attachments}>
        {(a) => (
          <p>
            Attached {a.type}
            {a.description ? ": " + a.description : ""}{" "}
            <Show when={safeWebUrl(a.url)}>
              <a
                href={safeWebUrl(a.url)}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open attachment
              </a>
            </Show>
          </p>
        )}
      </For>
      <Show when={props.post.quote}>
        {(q) => (
          <blockquote>
            {q().author}
            <p>{q().text}</p>
          </blockquote>
        )}
      </Show>
    </div>
  );
}
export function WebResourceView(props: BlockViewProps) {
  const { editor, projection } = useReactiveView(),
    node = () => projection.state.nodes[props.nodeKey],
    capture = createMemo(() => {
      const v = node()?.payload.web;
      return webCapture(v) ? v : undefined;
    }),
    p = () => capture()?.projection;
  const [status, setStatus] = createSignal(""),
    [confirm, setConfirm] = createSignal(false),
    [srcdoc, setSrcdoc] = createSignal<string>(),
    [src, setSrc] = createSignal<string>(),
    [image, setImage] = createSignal<string>(),
    [busy, setBusy] = createSignal(false);
  let epoch = 0;
  let root!: HTMLElement,
    alive = true,
    release: (() => void) | undefined;
  const owner = {},
    controller = new AbortController();
  const api = new HttpApplicationServices(() => {
    const c = editor.readAssetContext();
    if (!c.cavernId || !c.session) throw Error("Open the source Vault");
    return { cavernId: c.cavernId, session: c.session };
  });
  const close = () => {
    epoch++;
    setSrc(undefined);
    setSrcdoc(undefined);
    setConfirm(false);
    release?.();
    release = undefined;
  };
  // Reuse the existing view-close unload registry; no video behaviour changes.
  onCleanup(editor.interchange.registerVideo(projection.viewId, close));
  createEffect(
    on(
      () => capture()?.snapshotId,
      () => {
        close();
        if (image()) URL.revokeObjectURL(image()!);
        setImage(undefined);
      },
    ),
  );
  onMount(() =>
    onCleanup(
      editor.mounts.register(props.nodeKey, {
        root,
        focusElement: root,
        inputPolicy: "opaque-widget",
        focus: () => root.focus(),
      }),
    ),
  );
  onCleanup(() => {
    alive = false;
    controller.abort();
    release?.();
    if (image()) URL.revokeObjectURL(image()!);
  });
  const run = async (fn: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      if (alive) setStatus(String(e));
    } finally {
      if (alive) setBusy(false);
    }
  };
  const activate = () =>
    run(async () => {
      const c = capture(),
        token = epoch;
      if (!c) return;
      release = acquireEmbedSlot(editor, owner);
      try {
        if (p()?.provider === "google-maps") {
          const result = await api.call(
            "web.embed",
            { source: c.source },
            controller.signal,
          );
          if (
            !alive ||
            token !== epoch ||
            capture()?.snapshotId !== c.snapshotId
          ) {
            release?.();
            release = undefined;
            return;
          }
          if (!result.url) {
            setStatus(result.message ?? "Map unavailable");
            release?.();
            release = undefined;
          } else {
            const u = new URL(result.url);
            if (
              u.origin !== "https://www.google.com" ||
              u.pathname !== "/maps/embed/v1/place"
            )
              throw Error("Invalid map embed");
            setSrc(u.href);
          }
        } else if(editor.features.everydayWebResources&&everydayFrame(c)){setSrc(everydayFrame(c));} else if(blueskyFrame(c)){setSrc(blueskyFrame(c));} else {
          const html = socialEmbed(c);
          if (!html) throw Error("Official embed unavailable for this capture");
          setSrcdoc(html);
        }
        setConfirm(false);
      } catch (e) {
        release?.();
        release = undefined;
        throw e;
      }
    });
  const loadImage = () =>
    run(async () => {
      const token=epoch,ref = managedAsset(node()?.payload.webThumbnail);
      if (!ref) return;
      if(ref.cavernId!==editor.readAssetContext().cavernId)throw Error("Thumbnail belongs to another Vault");
      const original = await api.call(
        "resources.original",
        { assetId: ref.assetId },
        controller.signal,
      );
      if (!alive||token!==epoch) return;
      if (!["image/png", "image/jpeg"].includes(original.mediaType))
        throw Error("Invalid thumbnail original");
      setImage(
        URL.createObjectURL(
          new Blob([original.bytes.slice().buffer], {
            type: original.mediaType,
          }),
        ),
      );
    });
  return (
    <article
      ref={root}
      tabindex="0"
      class="web-resource-card"
      data-web-provider={p()?.provider}
      style={{
        border: "1px solid var(--flint-border, #d8d3c8)",
        "border-radius": "8px",
        padding: "14px",
        margin: "12px 0",
        "max-width": "760px",
        background: "var(--flint-panel, #faf9f6)",
        "overflow-wrap": "anywhere",
      }}
    >
      <Show
        when={capture()}
        fallback={
          <p>Invalid web resource. Original authored data is preserved.</p>
        }
      >
        {(c) => (
          <>
            <header>
              <small>
                {p()?.site ??
                  (p()?.provider === "google-maps"
                    ? "Google Maps"
                    : p()?.provider === "web"
                      ? new URL(c().source).hostname
                      : p()?.provider)}{" "}
                · Captured preview
              </small>
              <h3 title={p()?.everyday?.origins?.title} style={{ margin: "6px 0" }}>
                {p()?.title ??
                  p()?.location?.query ??
                  (p()?.social ? "Public post" : "Web link")}
              </h3>
            </header>
            <Show
              when={p()?.social}
              fallback={
                <>
                  <p>{p()?.description}</p>
                  <Show when={p()?.author}>
                    <p>{p()?.author}</p>
                  </Show>
                  <Show when={p()?.published}>
                    <time dateTime={p()?.published}>{p()?.published}</time>
                  </Show>
                </>
              }
            >
              {(post) => <SocialPostViewer post={post()} />}
            </Show>
            <Show when={p()?.everyday}>{e=><section aria-label="Resource details">
              <p>{e().identity.type}{e().identity.id?' · '+e().identity.id:''}{e().identity.account?' · '+e().identity.account:''}{e().identity.marketplace?' · '+e().identity.marketplace:''}</p>
              <For each={e().fields}>{f=><p title={'Source: '+f.provenance}><strong>{f.label}: </strong>{f.value}</p>}</For>
              <For each={e().items}>{item=><details><summary>{item.title??'Untitled source component'}</summary><For each={item.fields}>{f=><p title={'Source: '+f.provenance}><strong>{f.label}: </strong>{f.value}</p>}</For><Show when={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer">Open item</a></Show>{' '}<Show when={item.enclosure}><a href={item.enclosure} target="_blank" rel="noopener noreferrer">Open remote enclosure (networked; not retained)</a></Show></details>}</For>
            </section>}</Show>
            <Show when={p()?.location?.coordinates}>
              {(xy) => <p>URL coordinates: {xy().join(", ")}</p>}
            </Show>
            <Show when={image()}>
              {(url) => (
                <img
                  src={url()}
                  alt="Retained preview image"
                  style={{ "max-width": "100%", "max-height": "240px" }}
                />
              )}
            </Show>
            <Show when={!image() && managedAsset(node()?.payload.webThumbnail)}>
              <button disabled={busy()} onClick={loadImage}>
                Show retained thumbnail
              </button>
            </Show>
            <ReverseInformation nodeKey={props.nodeKey}><For each={p()?.diagnostics}>
              {(d) => <p style={{ "font-size": ".9em" }}>{d}</p>}
            </For>
            <Show when={!isLocalSource(c().source)}><p>
              <a
                href={safeWebUrl(c().source)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {p()?.provider === "google-maps"
                  ? "Open in Google Maps"
                  : p()?.provider === "drive" ? "Open in Google Drive" : "Open original"}
              </a>{" "}
              <button
                onClick={() =>
                  run(async () => {
                    await navigator.clipboard.writeText(c().source);
                    if (alive) setStatus("Link copied");
                  })
                }
              >
                Copy link
              </button>
            </p></Show></ReverseInformation>
            <Show when={p()?.location || socialEmbed(c()) || blueskyFrame(c()) || editor.features.everydayWebResources&&everydayFrame(c())}>
              <Show
                when={!src() && !srcdoc()}
                fallback={
                  <button onClick={close}>Unload interactive content</button>
                }
              >
                <button disabled={busy()} onClick={() => setConfirm((v) => !v)}>
                  {p()?.provider === "google-maps"
                    ? "Load map"
                    : p()?.everyday ? "Load music / podcast player" : "Load original post"}
                </button>
              </Show>
            </Show>
            <Show when={confirm()}>
              <div role="group" aria-label="Third-party content permission">
                <p>
                  Loading contacts{" "}
                  {p()?.provider === "google-maps"
                    ? "Google"
                    : p()?.provider === "x"
                      ? "X"
                      : p()?.provider === "bluesky" ? "Bluesky" : p()?.site ?? p()?.provider}{" "}
                  from your browser. The provider may collect network
                  information, use cookies and load media. This live content is
                  not the retained original and may be unavailable offline.
                </p>
                <button disabled={busy()} onClick={activate}>
                  Allow and load
                </button>
                <button onClick={close}>Cancel</button>
              </div>
            </Show>
            <Show when={src() || srcdoc()}>
              <iframe
                title="Optional live provider content"
                src={src()}
                srcdoc={srcdoc()}
                sandbox={
                  src() ? "allow-scripts allow-same-origin" : "allow-scripts"
                }
                allow={src()?.startsWith("https://open.spotify.com/embed/")?"encrypted-media":undefined}
                referrerpolicy={
                  src() ? "strict-origin-when-cross-origin" : "no-referrer"
                }
                style={{ width: "100%", height: "440px", border: "0" }}
              />
              <ReverseInformation nodeKey={props.nodeKey}><p>
                Provider content may be blocked or unavailable. The captured
                preview remains on the front; the original link is on the reverse.
              </p></ReverseInformation>
            </Show>
            <ReverseInformation nodeKey={props.nodeKey}>            <details>
              <summary>Source and capture</summary>
              <p>{c().source}</p>
              <Show when={p()?.canonicalUrl}>
                <p>{p()?.everyday?"Resource URL":"Provider-declared canonical URL"}: {p()?.canonicalUrl}</p>
              </Show>
              <p>
                {c().capturedAt} · {c().snapshotId}
              </p>
              <p>
                Metadata is an unreviewed source assertion. Interactive state is
                not saved.
              </p>
              <Show when={!isLocalSource(c().source)}><button
                onClick={() =>
                  void editor.interchange.importWebResource(
                    props.nodeKey,
                    c().source,
                  )
                }
              >
                Capture again…
              </button></Show>
            </details></ReverseInformation>
          </>
        )}
      </Show>
      <p role="status">{status()}</p>
    </article>
  );
}
