import * as T from "three";
import { PAGE_TILT, surfaceHeight } from "./arrangement";
import { handoffPose, type PagePose } from "./handoff";
import { alignmentCorners, editingRectangle, projectCss, studyCamera, deskPoint, type ScreenRect } from "./camera";
import { STUDY, type SpatialLayout, type SpatialObject, type SpatialPlacement } from "./model";

export interface SceneStatus { frames: number; geometries: number; textures: number; calls: number; alignmentError: number; width: number; height: number }
/** One disposable GPU lifetime. No editor, content renderer, timers or global controls. */
export function createStudyScene(canvas: HTMLCanvasElement, invalidateStatus: (status: SceneStatus) => void, fail: (message: string) => void) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.outputColorSpace = T.SRGBColorSpace; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.2;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap;
  const scene = new T.Scene(); scene.background = new T.Color(0x080e1b);
  const world = new T.Group(), proxies = new T.Group(); scene.add(world, proxies);
  let width = 1, height = 1, disposed = false, lost = false, frame = 0, count = 0, generation = 0;
  let layout: SpatialLayout | undefined, objects: readonly SpatialObject[] = [], signature = "", selected: string | undefined, rehearsal = false;
  let camera = studyCamera({ kind: "perspective", yaw: 0, approach: 0 }, width, height);
  let alignment: T.Mesh | undefined;
  const hits: T.Object3D[] = [];
  const pages = new Map<string, { page: T.Group }>();
  let pickup: { id: string; rect: ScreenRect; progress: number; opacity: number } | undefined;
  let renderSignature = "";
  let arrangement: SpatialPlacement | undefined;
  const loading = new Set<HTMLImageElement>();
  const cancelImages = () => { for (const image of loading) { image.onload = image.onerror = null; image.src = ""; } loading.clear(); };
  const material = (color: number, roughness = .75, metalness = 0) => new T.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = (parent: T.Object3D, geometry: T.BufferGeometry, mat: T.Material, x: number, y: number, z: number) => {
    const value = new T.Mesh(geometry, mat); value.position.set(x, y, z); value.castShadow = false; value.receiveShadow = true; parent.add(value); return value;
  };
  const box = (parent: T.Object3D, w: number, h: number, d: number, color: number, x: number, y: number, z: number) => mesh(parent, new T.BoxGeometry(w, h, d), material(color), x, y, z);
  const cylinder = (parent: T.Object3D, top: number, bottom: number, h: number, color: number, x: number, y: number, z: number, metal = 0) => mesh(parent, new T.CylinderGeometry(top, bottom, h, 32), material(color, .4, metal), x, y, z);
  let seed = 177;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const texture = (w: number, h: number, paint: (ctx: CanvasRenderingContext2D) => void) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h; paint(c.getContext("2d")!);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  };
  const wood = texture(1024, 256, ctx => {
    ctx.fillStyle = "#70452c"; ctx.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 1300; i++) { const y = random() * 256; ctx.strokeStyle = `rgba(${random() > .4 ? "39,18,8" : "208,143,82"},${.05 + random() * .14})`; ctx.lineWidth = .4 + random() * 1.2; ctx.beginPath(); for (let x = 0; x <= 1024; x += 16) { const yy = y + Math.sin(x / 90 + y / 35) * 1.8; if (!x) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); } ctx.stroke(); }
  });
  wood.wrapS = wood.wrapT = T.RepeatWrapping; wood.repeat.set(1.8, 1.8);
  const deskMat = new T.MeshStandardMaterial({ map: wood, roughness: .48, color: 0xb89979 });
  const annulus = new T.Shape(), half = STUDY.arc * Math.PI / 360;
  for (let i = 0; i <= 80; i++) { const a = -half + i / 80 * half * 2, x = Math.sin(a) * STUDY.outerRadius, z = Math.cos(a) * STUDY.outerRadius; if (!i) annulus.moveTo(x, z); else annulus.lineTo(x, z); }
  for (let i = 80; i >= 0; i--) { const a = -half + i / 80 * half * 2; annulus.lineTo(Math.sin(a) * STUDY.innerRadius, Math.cos(a) * STUDY.innerRadius); } annulus.closePath();
  const desk = mesh(world, new T.ExtrudeGeometry(annulus, { depth: STUDY.thickness, bevelEnabled: true, bevelSegments: 3, steps: 1, bevelSize: .008, bevelThickness: .008 }), deskMat, 0, -STUDY.thickness - .008, 0);
  desk.rotation.x = -Math.PI / 2;
  for (const x of [-1.1, 1.1]) box(world, .16, .71, .4, 0x332017, x, -.41, -.62);
  box(world, 5, .06, 5.4, 0x241b17, 0, -.79, -.4);
  box(world, 4.7, 3, .16, 0x34271e, 0, .6, -2.4);
  for (const side of [-1, 1]) box(world, .16, 3, 5, 0x2c251f, side * 2.32, .6, -.2);
  // The window is an inexpensive emissive exterior, with layered mountain silhouettes.
  const sky = texture(1024, 768, ctx => {
    const g = ctx.createLinearGradient(0, 0, 0, 768); g.addColorStop(0, "#060d20"); g.addColorStop(.55, "#1c304c"); g.addColorStop(1, "#283745"); ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 768);
    for (let i = 0; i < 290; i++) { ctx.fillStyle = `rgba(211,229,255,${.15 + random() * .65})`; ctx.beginPath(); ctx.arc(random() * 1024, random() * 450, .4 + random() * .8, 0, Math.PI * 2); ctx.fill(); }
    for (let layer = 0; layer < 4; layer++) {
      const points: Array<[number, number]> = []; for (let x = -60; x < 1100; x += 45 + random() * 65) points.push([x, 280 + layer * 105 + random() * 100]);
      ctx.beginPath(); ctx.moveTo(-60, 768); points.forEach(p => ctx.lineTo(...p)); ctx.lineTo(1100, 768); ctx.closePath(); ctx.fillStyle = ["#34465d", "#233449", "#152737", "#0c1b29"][layer]; ctx.fill();
      if (layer === 0) for (let i = 1; i < points.length - 1; i++) { const [x, y] = points[i]; if (y > points[i - 1][1] || y > points[i + 1][1]) continue; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 34, y + 50); ctx.lineTo(x + 10, y + 28); ctx.lineTo(x - 4, y + 44); ctx.lineTo(x - 27, y + 32); ctx.closePath(); ctx.fillStyle = "#7890a7"; ctx.fill(); }
    }
    for (let i = 0; i < 100; i++) { const x = random() * 1024, y = 627 + Math.sin(x / 150) * 22 + random() * 48; ctx.fillStyle = random() > .25 ? "#bc884b" : "#edc287"; ctx.fillRect(x, y, 1.5, 1); }
  });
  mesh(world, new T.PlaneGeometry(3.02, 2.32), new T.MeshBasicMaterial({ map: sky }), 0, 1.04, -2.29);
  for (const x of [-1.55, 1.55]) box(world, .12, 2.52, .17, 0x3e2a1d, x, 1.02, -2.17);
  for (const y of [-.18, 2.23]) box(world, 3.22, .13, .2, 0x4c3220, 0, y, -2.16);
  for (const x of [-.76, .76]) box(world, .035, 2.38, .08, 0x3a281d, x, 1.02, -2.16);
  box(world, 3.3, .065, .36, 0x583b27, 0, -.23, -2.11);
  // Shelves sit on the flanking walls; books have ordinary 18–28cm heights.
  for (const side of [-1, 1]) {
    const shelf = new T.Group(); shelf.position.set(side * 1.99, -.71, -1.86); shelf.rotation.y = -side * .25; world.add(shelf);
    box(shelf, 1.1, 2.3, .06, 0x241812, 0, 1.15, -.17);
    for (const x of [-.58, .58]) box(shelf, .08, 2.35, .35, 0x493120, x, 1.15, 0);
    for (let row = 0; row < 5; row++) {
      const y = .05 + row * .46; box(shelf, 1.24, .045, .38, 0x614229, 0, y, 0);
      for (let i = 0; i < 11; i++) {
        const h = .19 + random() * .13, w = .035 + random() * .025, x = -.49 + i * .093;
        const book = box(shelf, w, h, .16 + random() * .03, [0x4c2923, 0x373d30, 0x253544, 0x735333, 0x665749][Math.floor(random() * 5)], x, y + h / 2 + .024, 0);
        book.rotation.z = (random() - .5) * .12;
        for (const offset of [-.065, .065]) box(book, w * .8, .004, .002, 0xa28b59, 0, offset, .098);
      }
    }
  }
  // Lamp, cup, books, inkpot and quill are decorative and physically scaled.
  const lamp = new T.Group(); lamp.position.set(-.81, .012, -.9); world.add(lamp);
  cylinder(lamp, .085, .105, .018, 0x7b6039, 0, .009, 0, .65);
  cylinder(lamp, .012, .014, .35, 0x947948, 0, .19, 0, .65);
  const shade = mesh(lamp, new T.SphereGeometry(.135, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), material(0x244b38, .3), .03, .36, 0); shade.scale.set(1.4, .62, .8);
  const bulb = mesh(lamp, new T.SphereGeometry(.025, 16, 8), new T.MeshBasicMaterial({ color: 0xffd29b }), .03, .353, 0);
  const light = new T.PointLight(0xffc084, 1.6, 3, 2); light.position.copy(lamp.position).add(bulb.position); scene.add(light);
  const deskLight = new T.SpotLight(0xffc894, 1.2, 3, 1.1, .8); deskLight.position.set(-.7, .8, -.65); deskLight.target.position.set(0, 0, -.85); deskLight.castShadow = true; deskLight.shadow.mapSize.set(512, 512); deskLight.shadow.bias = -.001; scene.add(deskLight, deskLight.target);
  const cup = new T.Group(); cup.position.set(.52, .01, -.69); world.add(cup);
  cylinder(cup, .041, .034, .087, 0xc7b08a, 0, .044, 0);
  cylinder(cup, .036, .036, .002, 0x21130b, 0, .087, 0);
  const handle = mesh(cup, new T.TorusGeometry(.026, .008, 12, 24), material(0xb49a71, .38), .048, .051, 0); handle.rotation.y = .3;
  cylinder(cup, .069, .069, .006, 0xb5a17c, 0, .003, 0);
  for (let i = 0; i < 3; i++) {
    const book = new T.Group(); book.position.set(1.08, .012 + i * .033, -.53); book.rotation.y = .15 - i * .1; world.add(book);
    box(book, .18, .025, .25, 0xc2b38c, 0, .014, 0);
    for (const y of [0, .03]) box(book, .19, .004, .26, [0x393c2a, 0x643624, 0x2f3440][i], 0, y, 0);
  }
  cylinder(world, .023, .037, .047, 0x151720, -.42, .03, -.68);
  cylinder(world, .026, .024, .007, 0x8c723d, -.42, .057, -.68, .7);
  const quill = mesh(world, new T.ConeGeometry(.018, .21, 4), material(0xbba881), -.43, .15, -.68); quill.rotation.z = -.25; quill.scale.z = .15;
  const ambient = new T.HemisphereLight(0x9daecf, 0x31231c, .65); scene.add(ambient);
  const moon = new T.DirectionalLight(0x90afd2, .55); moon.position.set(1, 3, -4); scene.add(moon);
  const fill = new T.PointLight(0xffb971, 7, 7); fill.position.set(0, 1.7, .5); scene.add(fill);

  function release(root: T.Object3D) {
    const geometries = new Set<T.BufferGeometry>(), materials = new Set<T.Material>(), textures = new Set<T.Texture>();
    root.traverse(node => { const m = node as T.Mesh; if (m.geometry) geometries.add(m.geometry); for (const mat of m.material ? Array.isArray(m.material) ? m.material : [m.material] : []) { materials.add(mat); Object.values(mat).forEach(v => { if (v instanceof T.Texture) textures.add(v); }); } });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.clear();
  }
  function rebuild() {
    generation++; cancelImages(); const current = generation; release(proxies); hits.length = 0; pages.clear();
    for (const [index, p] of (layout?.placements ?? []).entries()) {
      const object = objects.find(o => o.id === p.objectId) ?? { id: p.objectId, label: p.objectId, kind: "placeholder", reason: "missing" };
      const group = new T.Group(); group.position.set(p.position.x, surfaceHeight(index), p.position.z); group.rotation.y = p.heading; proxies.add(group);
      const page = new T.Group(); page.rotation.x = p.posture === "lying" ? -Math.PI / 2 : PAGE_TILT; group.add(page);
      const paper = box(page, p.size.width, p.size.height, .0015, object.reason ? 0xa79b8a : 0xf0e5c9, 0, p.size.height / 2, 0);
      paper.castShadow = true;
      page.updateWorldMatrix(true, false);
      pages.set(object.id, { page });
      const label = texture(512, 724, ctx => {
        ctx.fillStyle = object.reason ? "#c5bbaa" : "#f7edda"; ctx.fillRect(0, 0, 512, 724);
        ctx.fillStyle = "#665d4e"; ctx.font = "18px Georgia"; ctx.fillText(object.kind === "document" ? "CODEX · DOCUMENT" : object.kind === "image" ? "PHOTOGRAPH" : "WORKSPACE OBJECT", 44, 55);
        ctx.fillStyle = "#302e29"; ctx.font = "28px Georgia";
        const title = object.label.replace(/\.json$/, ""); ctx.fillText(title.length > 29 ? title.slice(0, 27) + "…" : title, 44, 106);
        ctx.strokeStyle = "#bcb19b"; ctx.beginPath(); ctx.moveTo(44, 128); ctx.lineTo(468, 128); ctx.stroke();
        ctx.fillStyle = "#bdb49f"; for (let i = 0; i < 23; i++) ctx.fillRect(44, 169 + i * 18, i % 7 === 6 ? 238 : 398 - (i % 3) * 13, 3);
        ctx.fillStyle = "#8e826d"; ctx.font = "17px Georgia"; ctx.fillText(object.reason ?? "Preview · double-click to read", 44, 671);
      });
      const surface = mesh(page, new T.PlaneGeometry(p.size.width * .96, p.size.height * .97), new T.MeshStandardMaterial({ map: label, roughness: 1 }), 0, p.size.height / 2, .001);
      surface.receiveShadow = false;
      for (const m of [paper, surface]) { m.userData.objectId = object.id; hits.push(m); }
      if (object.kind === "image" && object.imageUrl) {
        const img = new Image(); loading.add(img); img.crossOrigin = "anonymous";
        img.onload = () => {
          loading.delete(img);
          if (disposed || current !== generation) return;
          try {
            const c = document.createElement("canvas"); c.width = 768; c.height = Math.round(768 * p.size.height / p.size.width);
            const ctx = c.getContext("2d")!, ratio = Math.min((c.width - 32) / img.width, (c.height - 32) / img.height);
            ctx.fillStyle = "#f4ead8"; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, (c.width - img.width * ratio) / 2, (c.height - img.height * ratio) / 2, img.width * ratio, img.height * ratio);
            const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; const mat = surface.material as T.MeshStandardMaterial; mat.map?.dispose(); mat.map = t; mat.needsUpdate = true; request();
          } catch { /* Cross-origin/decoder failures leave the labelled print. */ }
        };
        img.onerror = () => { loading.delete(img); }; img.src = object.imageUrl;
      }
      if (selected === object.id) {
        const edge = new T.LineSegments(new T.EdgesGeometry(paper.geometry), new T.LineBasicMaterial({ color: 0xd6b56c })); edge.position.copy(paper.position); page.add(edge);
      }
    }
  }
  function render() {
    frame = 0; if (disposed || lost || document.hidden || !layout) return;
    camera = studyCamera(layout.camera, width, height);
    if (alignment) { scene.remove(alignment); release(alignment); alignment = undefined; }
    let error = 0;
    if (rehearsal) {
      const rect = editingRectangle(width, height), points = alignmentCorners(camera, { width, height }, rect);
      const expected = [[rect.x, rect.y], [rect.x + rect.width, rect.y], [rect.x + rect.width, rect.y + rect.height], [rect.x, rect.y + rect.height]];
      error = Math.max(...points.map((p, i) => { const v = projectCss(p, camera, width, height); return Math.hypot(v.x - expected[i][0], v.y - expected[i][1]); }));
      const g = new T.BufferGeometry().setFromPoints([points[0], points[3], points[1], points[1], points[3], points[2]]);
      alignment = new T.Mesh(g, new T.MeshBasicMaterial({ color: 0xffedc9, transparent: true, opacity: .18, side: T.DoubleSide, depthTest: false })); alignment.renderOrder = 10; scene.add(alignment);
    }
    for (const [id, entry] of pages) {
      const { page } = entry, moving = pickup?.id === id ? pickup : undefined;
      const index = layout.placements.findIndex(p => p.objectId === id), p = arrangement?.objectId === id ? arrangement : layout.placements[index];
      if (!p) continue;
      page.parent!.position.set(p.position.x, surfaceHeight(index), p.position.z); page.parent!.rotation.y = p.heading;
      page.position.set(0, 0, 0); page.rotation.set(p.posture === "lying" ? -Math.PI / 2 : PAGE_TILT, 0, 0); page.scale.set(1, 1, 1);
      page.updateWorldMatrix(true, false);
      const home: PagePose = { center: page.localToWorld(new T.Vector3(0, p.size.height / 2, 0)), rotation: page.getWorldQuaternion(new T.Quaternion()), width: p.size.width, height: p.size.height };
      if (moving) {
        const pose = handoffPose(home, camera, { width, height }, moving.rect, moving.progress);
        page.quaternion.copy(page.parent!.getWorldQuaternion(new T.Quaternion()).invert().multiply(pose.rotation));
        const origin = pose.center.clone().add(new T.Vector3(0, -pose.height / 2, 0).applyQuaternion(pose.rotation));
        page.position.copy(page.parent!.worldToLocal(origin)); page.scale.set(pose.width / home.width, pose.height / home.height, 1);
        if (moving.progress === 1) {
          page.updateWorldMatrix(true, false);
          for (const [x, y] of [[-1, 1], [1, 1], [1, 0], [-1, 0]]) {
            const point = projectCss(page.localToWorld(new T.Vector3(x * home.width / 2, y * home.height, 0)), camera, width, height);
            error = Math.max(error, Math.hypot(point.x - moving.rect.x - (x + 1) / 2 * moving.rect.width, point.y - moving.rect.y - (1 - y) * moving.rect.height));
          }
        }
      }
      page.visible = !moving || moving.opacity > 0;
      page.traverse(node => { const m = (node as T.Mesh).material; for (const mat of m ? Array.isArray(m) ? m : [m] : []) { (node as T.Mesh).renderOrder = index; mat.transparent = !!moving && moving.opacity < 1; mat.opacity = moving?.opacity ?? 1; } });
    }
    renderer.render(scene, camera); count++;
    invalidateStatus({ frames: count, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, calls: renderer.info.render.calls, alignmentError: error, width, height });
  }
  function request() { if (!disposed && !lost && !document.hidden && !frame) frame = requestAnimationFrame(render); }
  const contextLost = (event: Event) => { event.preventDefault(); lost = true; cancelAnimationFrame(frame); frame = 0; generation++; cancelImages(); deskLight.shadow.dispose(); deskLight.shadow.map = null; release(scene); fail("Graphics paused. Your workspace is preserved. Retry the study or return to Desktop."); };
  const contextRestored = () => { if (!disposed) fail("Graphics recovered. Retry the study to rebuild the scene; your workspace is preserved."); };
  const visibility = () => { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } else request(); };
  canvas.addEventListener("webglcontextlost", contextLost); canvas.addEventListener("webglcontextrestored", contextRestored); document.addEventListener("visibilitychange", visibility);
  return {
    update(next: SpatialLayout, summaries: readonly SpatialObject[], selection?: string, align = false) {
      const nextSignature = JSON.stringify([next, summaries, selection, align]);
      if (renderSignature === nextSignature) return; renderSignature = nextSignature;
      layout = next; objects = summaries; selected = selection; rehearsal = align;
      const key = JSON.stringify([next.placements, summaries, selection]); if (key !== signature) { signature = key; rebuild(); } request();
    },
    previewPlacement(value?: SpatialPlacement) { arrangement = value; request(); },
    deskPoint(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect(); return deskPoint(camera, { width: rect.width, height: rect.height }, clientX - rect.left, clientY - rect.top);
    },
    handoff(id?: string, rect?: ScreenRect, progress = 0, opacity = 1) {
      pickup = id && rect ? { id, rect, progress, opacity } : undefined; request();
    },
    resize(w: number, h: number) { width = Math.max(1, w); height = Math.max(1, h); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5)); renderer.setSize(width, height, false); request(); },
    hit(clientX: number, clientY: number) {
      const rect = canvas.getBoundingClientRect(), ray = new T.Raycaster(); ray.setFromCamera(new T.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), camera);
      return ray.intersectObjects(hits, false)[0]?.object.userData.objectId as string | undefined;
    },
    dispose() {
      if (disposed) return; disposed = true; generation++; cancelImages(); cancelAnimationFrame(frame);
      canvas.removeEventListener("webglcontextlost", contextLost); canvas.removeEventListener("webglcontextrestored", contextRestored); document.removeEventListener("visibilitychange", visibility);
      deskLight.shadow.dispose(); release(scene); renderer.dispose(); if (!lost) renderer.forceContextLoss();
    },
  };
}
