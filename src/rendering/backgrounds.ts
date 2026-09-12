export const backgroundTypes = ["image-background-block", "video-background-block", "youtube-video-background-block", "canvas-background-block"] as const;
export type BackgroundType = typeof backgroundTypes[number];
export const isBackgroundType = (type: string): type is BackgroundType => backgroundTypes.includes(type as BackgroundType);
export const backgroundImages = [
  { label: "Green aurora", url: "/image-backgrounds/green-aurora.jpg" },
  { label: "Desktop", url: "/image-backgrounds/wood.jpg" },
  { label: "High", url: "/image-backgrounds/clouds.jpg" },
  { label: "Aurora over snow", url: "/image-backgrounds/snow-aurora.jpg" },
];
export const defaultBackgroundUrls: Partial<Record<BackgroundType, string>> = {
  "image-background-block": backgroundImages[0].url,
  "video-background-block": "/video-backgrounds/rain.mp4",
  "youtube-video-background-block": "https://www.youtube.com/watch?v=Zsqep7_9_mw",
};

export function mediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const text = value.trim();
  try {
    const url = new URL(text, "https://local.invalid/");
    return ["http:", "https:", "blob:"].includes(url.protocol) ? text : undefined;
  } catch { return undefined; }
}

export function youtubeId(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (/^[\w-]{11}$/.test(text)) return text;
  try {
    const url = new URL(text);
    if (!["http:", "https:"].includes(url.protocol)) return undefined;
    const host = url.hostname.replace(/^www\./, "");
    let id: string | null | undefined;
    if (host === "youtu.be") id = url.pathname.split("/")[1];
    else if (["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"].includes(host)) {
      id = url.pathname === "/watch" ? url.searchParams.get("v") : /^\/(embed|shorts|live)\//.test(url.pathname) ? url.pathname.split("/")[2] : undefined;
    }
    return id && /^[\w-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

export function youtubeBackgroundUrl(value: unknown, paused = false, muted = true): string | undefined {
  const id = youtubeId(value);
  if (!id) return undefined;
  const params = new URLSearchParams({ autoplay: paused ? "0" : "1", mute: muted ? "1" : "0", loop: "1", playlist: id, controls: "0", disablekb: "1", fs: "0", playsinline: "1", rel: "0", iv_load_policy: "3" });
  return `https://www.youtube-nocookie.com/embed/${id}?${params}`;
}
