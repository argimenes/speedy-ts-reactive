/** A bounded visual digest, not a Document DTO or editable projection. */
export type PreviewBlock = { kind: "widget"; label: string } | { kind: "text"; text: string; heading?: number } | { kind: "image"; url: string; alt: string };
export interface DocumentPreview { title: string; blocks: readonly PreviewBlock[]; truncated: boolean }
export interface PreviewImageSlot { url: string; x: number; y: number; width: number; height: number }
export function previewImageUrl(value: unknown): string | undefined {
  return typeof value === "string" && /^(https?:\/\/|data:image\/|\/(?!\/))/i.test(value) ? value : undefined;
}
/** Static recognisability at paper scale. No annotations, selection or effects
 * are interpreted here; those remain the responsibility of the live editor. */
export function paintDocumentPreview(ctx: CanvasRenderingContext2D, preview: DocumentPreview): PreviewImageSlot[] {
  const w = ctx.canvas.width, h = ctx.canvas.height, margin = 38, inner = w - margin * 2, bottom = h - 28;
  const images: PreviewImageSlot[] = [];
  ctx.fillStyle = "#f5efe0"; ctx.fillRect(0, 0, w, h);
  // Low contrast fixed paper fibres: no acquired texture or animation.
  ctx.fillStyle = "#b1a38a10"; for (let i = 0; i < 420; i++) ctx.fillRect((i * 137) % w, (i * 53) % h, 1, 1);
  let y = 28;
  ctx.fillStyle = "#887b69"; ctx.font = "10px system-ui"; ctx.fillText("DOCUMENT · PREVIEW", margin, y); y += 32;
  const lines = (text: string, size: number, limit: number) => {
    const words = text.replace(/\s+/g, " ").trim().split(" "); let line = "", count = 0;
    for (const word of words) {
      const next = line ? line + " " + word : word;
      if (line && ctx.measureText(next).width > inner) {
        ctx.fillText(line, margin, y, inner); y += size * 1.4; line = word;
        if (++count >= limit || y > bottom - size) return;
      } else line = next;
    }
    if (line && y < bottom) { ctx.fillText(line, margin, y, inner); y += size * 1.4; }
  };
  ctx.fillStyle = "#342f29"; ctx.font = "28px Georgia"; lines(preview.title, 28, 2); y += 10;
  ctx.fillStyle = "#bba98a"; ctx.fillRect(margin, y, inner, 1); y += 24;
  for (const block of preview.blocks) {
    if (y >= bottom - 18) break;
    if (block.kind === "widget") {
      ctx.fillStyle = "#e4ddcf"; ctx.fillRect(margin, y, inner, 48);
      ctx.fillStyle = "#6b6357"; ctx.font = "14px Georgia"; ctx.fillText(block.label, margin + 12, y + 29, inner - 24); y += 62;
    } else if (block.kind === "image") {
      const height = Math.min(inner * .53, bottom - y - 12); if (height < 36) break;
      ctx.fillStyle = "#e2dbcc"; ctx.fillRect(margin, y, inner, height);
      ctx.fillStyle = "#6b6357"; ctx.font = "12px Georgia"; ctx.fillText(block.alt || "Image", margin + 12, y + 24, inner - 24);
      images.push({ url: block.url, x: margin, y, width: inner, height }); y += height + 18;
    } else {
      const size = block.heading ? Math.max(17, 26 - block.heading * 2) : 15;
      ctx.fillStyle = "#494039"; ctx.font = `${block.heading ? "bold " : ""}${size}px Georgia`;
      for (const paragraph of block.text.split("\n")) { lines(paragraph, size, block.heading ? 2 : 8); if (y >= bottom - size) break; }
      y += block.heading ? 6 : 12;
    }
  }
  if (preview.truncated || y >= bottom - 18) { ctx.fillStyle = "#8d806e"; ctx.font = "12px Georgia"; ctx.fillText("…", margin, h - 12); }
  return images;
}
