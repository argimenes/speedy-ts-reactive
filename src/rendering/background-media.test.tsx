// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render } from "solid-js/web";
import { ReactiveEditor } from "../reactive-editor/editor";
import { registerCoreViews } from "./register-core-views";
import { ReactiveTreeView } from "./reactive-tree-view";
import { mediaUrl, youtubeId, youtubeBackgroundUrl, backgroundTypes } from "./backgrounds";

const shader = vi.hoisted(() => ({ mount: vi.fn(), dispose: vi.fn(), speed: vi.fn() }));
vi.mock("@paper-design/shaders", () => ({ ShaderMount: class { constructor(...args: unknown[]) { shader.mount(...args); } dispose = shader.dispose; setSpeed = shader.speed; }, getShaderColorFromString: (colour: string) => colour, meshGradientFragmentShader: "shader" }));
const cleanup: Array<() => void> = [];
beforeEach(() => {
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as WebGLRenderingContext);
  shader.mount.mockClear(); shader.dispose.mockClear(); shader.speed.mockClear();
});
afterEach(() => { cleanup.splice(0).reverse().forEach(dispose => dispose()); document.body.replaceChildren(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount() {
  const editor = new ReactiveEditor({ id: "bg", type: "image-background-block", metadata: { url: "/first.jpg", future: "keep" }, future: 7, relation: { leftMargin: { type: "document-block", id: "margin", children: [] } }, children: [{ id: "text", type: "plain-text-block", text: "keep mounted" }] });
  registerCoreViews(editor); const projection = editor.createView("background-test");
  const host = document.body.appendChild(document.createElement("div"));
  cleanup.push(() => editor.dispose(), render(() => <ReactiveTreeView editor={editor} projection={projection} />, host));
  return { editor, projection, host, key: projection.state.rootKey };
}
describe("background media", () => {
  it("parses supported YouTube forms and rejects unsafe sources and lookalike hosts", () => {
    for (const url of ["Zsqep7_9_mw", "https://youtu.be/Zsqep7_9_mw?t=2", "https://www.youtube.com/watch?v=Zsqep7_9_mw&list=x", "https://www.youtube.com/shorts/Zsqep7_9_mw", "https://www.youtube-nocookie.com/embed/Zsqep7_9_mw"]) expect(youtubeId(url)).toBe("Zsqep7_9_mw");
    for (const url of ["", "https://youtube.com.evil.example/watch?v=Zsqep7_9_mw", "javascript:alert(1)", "https://youtu.be/invalid"]) expect(youtubeId(url)).toBeUndefined();
    expect(mediaUrl("javascript:alert(1)")).toBeUndefined(); expect(mediaUrl("data:text/html,bad")).toBeUndefined();
    expect(mediaUrl("/image-backgrounds/wood.jpg")).toBe("/image-backgrounds/wood.jpg");
    const url = new URL(youtubeBackgroundUrl("Zsqep7_9_mw")!);
    for (const [key, value] of Object.entries({ mute: "1", autoplay: "1", loop: "1", playlist: "Zsqep7_9_mw", controls: "0", disablekb: "1" })) expect(url.searchParams.get(key)).toBe(value);
  });
  it("switches all four types, cleans up media, and preserves descendants, identity and relations through undo", async () => {
    const { editor, key, host } = mount(); const textarea = host.querySelector("textarea"); const identity = editor.node(key)!.contentKey;
    for (const type of backgroundTypes.slice(1)) {
      editor.commands.setBackground(key, { type, metadata: { url: type === "youtube-video-background-block" ? "Zsqep7_9_mw" : "/rain.mp4" } });
      expect(host.querySelector("textarea")).toBe(textarea); expect(editor.node(key)!.contentKey).toBe(identity);
      expect((editor.encodeDocument().metadata as any).future).toBe("keep");
      if (type === "video-background-block") { expect(host.querySelector("video")?.muted).toBe(true); expect(host.querySelector("video")?.loop).toBe(true); }
      if (type === "youtube-video-background-block") { expect(host.querySelector("video")).toBeNull(); expect(host.querySelector("iframe")?.src).toContain("youtube-nocookie.com/embed/Zsqep7_9_mw"); expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled(); }
    }
    await vi.waitFor(() => expect(shader.mount).toHaveBeenCalledOnce());
    editor.repository.undo(); expect(shader.dispose).toHaveBeenCalledOnce(); expect(host.querySelector("iframe")).not.toBeNull();
    editor.repository.undo(); editor.repository.undo();
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/first.jpg"); expect(host.querySelector("textarea")).toBe(textarea);
    const encoded = editor.encodeDocument(); expect(encoded.id).toBe("bg"); expect(encoded.future).toBe(7); expect((encoded.relation?.leftMargin as any).id).toBe("margin"); expect((encoded.metadata as any).future).toBe("keep");
    expect(() => editor.commands.setBackground(key, { type: "fake-background-block" })).toThrow();
  });
  it("reacts to source/playback settings, reports failed loads, and uses a static shader fallback", async () => {
    const { editor, key, host } = mount();
    host.querySelector("img")!.dispatchEvent(new Event("error")); expect(host.textContent).toContain("could not load");
    editor.commands.setBackground(key, { type: "youtube-video-background-block", metadata: { url: "bad" } }); expect(host.querySelector("iframe")).toBeNull(); expect(host.textContent).toContain("valid YouTube");
    editor.commands.setPayloadField(key, "metadata", { url: "Zsqep7_9_mw", paused: true, muted: false });
    const frame = host.querySelector("iframe")!; expect(frame.src).toContain("autoplay=0"); expect(frame.src).toContain("mute=0");
    vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
    editor.commands.setBackground(key, { type: "canvas-background-block" });
    expect(frame.src).toBe("about:blank");
    await vi.waitFor(() => expect(host.querySelector("[data-static-fallback=true]")).not.toBeNull()); expect(shader.mount).not.toHaveBeenCalled();
  });
  it("pauses shader motion for reduced-motion and visibility changes and removes its listeners", async () => {
    const listeners = new Set<() => void>();
    const motion = { matches: true, addEventListener: (_: string, fn: () => void) => listeners.add(fn), removeEventListener: (_: string, fn: () => void) => listeners.delete(fn) };
    vi.stubGlobal("matchMedia", () => motion);
    const { editor, key } = mount(); editor.commands.setBackground(key, { type: "canvas-background-block" });
    await vi.waitFor(() => expect(shader.mount).toHaveBeenCalledOnce()); expect(shader.mount.mock.calls[0][4]).toBe(0);
    motion.matches = false; listeners.forEach(fn => fn()); expect(shader.speed).toHaveBeenCalledWith(0.25);
    editor.repository.undo(); expect(shader.dispose).toHaveBeenCalledOnce(); expect(listeners.size).toBe(0);
  });
});
