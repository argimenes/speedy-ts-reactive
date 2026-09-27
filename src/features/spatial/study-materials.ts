/** Static procedural materials, generated once per scene lifetime. */
function noise(seed: number) { return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
export function paintWalnut(ctx: CanvasRenderingContext2D) {
  const random = noise(41), { width: w, height: h } = ctx.canvas;
  ctx.fillStyle = "#725035"; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 1700; i++) {
    const y = random() * h; ctx.strokeStyle = `rgba(${random() > .35 ? "42,24,14" : "196,155,102"},${.025 + random() * .08})`; ctx.lineWidth = .3 + random() * .8;
    ctx.beginPath(); for (let x = 0; x <= w; x += 8) { const yy = y + Math.sin(x / 160 + y / 23) * 3 + Math.sin(x / 49 + y / 7) * .5; if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke();
  }
  for (let i = 0; i < 20; i++) { ctx.strokeStyle = "#442b1910"; ctx.lineWidth = .6; ctx.beginPath(); ctx.ellipse(w * .64, h * .67, 12 + i * 9, 1 + i * .7, .025, 0, Math.PI * 2); ctx.stroke(); }
}
export function paintAlpineNight(ctx: CanvasRenderingContext2D) {
  const random = noise(97), w = ctx.canvas.width, h = ctx.canvas.height;
  const sky = ctx.createLinearGradient(0, 0, 0, h); sky.addColorStop(0, "#070e21"); sky.addColorStop(.58, "#20334c"); sky.addColorStop(1, "#374855"); ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
  for (let i = 0; i < 250; i++) { ctx.fillStyle = `rgba(210,224,249,${.15 + random() * .5})`; ctx.beginPath(); ctx.arc(random() * w, random() * h * .5, .3 + random() * .65, 0, Math.PI * 2); ctx.fill(); }
  const ridge = (base: number, amplitude: number, layer: number) => {
    const points: [number, number][] = [];
    for (let x = -20; x <= w + 20; x += 8) {
      const crest = Math.abs(Math.sin(x / 145 + layer * 1.4)) * .58 + Math.abs(Math.sin(x / 67 + layer)) * .27 + Math.abs(Math.sin(x / 29 + layer)) * .15;
      points.push([x, base - amplitude * crest + (random() - .5) * 5]);
    }
    return points;
  };
  for (let layer = 0; layer < 5; layer++) {
    const points = ridge(h * (.55 + layer * .082), h * (.26 - layer * .035), layer);
    ctx.beginPath(); ctx.moveTo(-20, h); points.forEach(p => ctx.lineTo(...p)); ctx.lineTo(w + 20, h); ctx.closePath();
    const tone = ctx.createLinearGradient(0, h * .25, 0, h); tone.addColorStop(0, ["#586777", "#3e5062", "#2e4052", "#243848", "#152a36"][layer]); tone.addColorStop(1, "#172b38"); ctx.fillStyle = tone; ctx.fill();
    if (layer < 2) {
      ctx.beginPath(); points.forEach(([x,y],i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      [...points].reverse().forEach(([x,y]) => ctx.lineTo(x,y + 7 + Math.abs(Math.sin(x / 17)) * 13)); ctx.closePath(); ctx.fillStyle = layer ? "#9eadb82d" : "#bdc8d26e"; ctx.fill();
    }
  }
  // A quiet lake and distant shore lights make the exterior read as depth.
  ctx.beginPath(); ctx.moveTo(w * .37, h * .77); ctx.bezierCurveTo(w * .75, h * .76, w * .82, h * .94, w * 1.1, h); ctx.lineTo(w * .1, h); ctx.bezierCurveTo(w * .45, h * .9, w * .13, h * .8, w * .37, h * .77);
  ctx.fillStyle = "#304859"; ctx.fill();
  for (let i = 0; i < 110; i++) {
    const x = random() * w, y = h * (.785 + .045 * Math.sin(x / 180)) + random() * 12;
    ctx.fillStyle = random() > .2 ? "#e2b36b94" : "#ffdc98cc"; ctx.fillRect(x, y, 1 + random(), 1);
    if (x > w * .3 && x < w * .7) { ctx.fillStyle = "#dfb47016"; ctx.fillRect(x, y + 8, .8, 4 + random() * 14); }
  }
  const haze = ctx.createLinearGradient(0, h * .62, 0, h); haze.addColorStop(0, "#73909b00"); haze.addColorStop(.55, "#73909b0b"); haze.addColorStop(1, "#00101b16"); ctx.fillStyle = haze; ctx.fillRect(0, h * .62, w, h * .38);
  for (let i = 0; i < 25; i++) {
    const x = i < 12 ? random() * w * .19 : w * (.84 + random() * .16), y = h * (.87 + random() * .11), height = 18 + random() * 48;
    ctx.fillStyle = "#0b1b24"; ctx.fillRect(x - 1, y - height, 2, height + 8);
    for (let tier = 0; tier < 4; tier++) { const top = y - height + tier * height * .18, spread = height * (.08 + tier * .055); ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x + spread, top + height * .4); ctx.lineTo(x - spread, top + height * .4); ctx.closePath(); ctx.fill(); }
  }
}
