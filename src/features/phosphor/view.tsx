import {
  For,
  Show,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import type { PhosphorPort } from "./port";
import {
  ASCII,
  APPLE,
  ATTRIBUTES,
  TAG,
  ENTITY,
  chars,
  cleanInput,
  project,
  cellAt,
  offsetAt,
  validate,
  rectangle,
  line,
  box,
  paint,
  write,
  resize,
  splice,
  copyRectangle,
  stamp,
  type Cell,
  type Rectangle,
  type Pattern,
  type ScreenData,
  type Mark,
} from "./model";
import { GLYPH_ENCODING, glyphInfo, glyphLabel } from "./glyphs";
import "./phosphor.css";

const presentations = new WeakMap<HTMLElement, PhosphorPort>();
export const phosphorPresentation = (root: HTMLElement) =>
  presentations.get(root);
type Tool =
  | "Pencil"
  | "Pick"
  | "Eraser"
  | "Line"
  | "Rectangle"
  | "Filled rectangle"
  | "Select"
  | "Move"
  | "Stamp";
const tools: Tool[] = [
  "Pencil",
  "Pick",
  "Eraser",
  "Line",
  "Rectangle",
  "Filled rectangle",
  "Select",
  "Move",
  "Stamp",
];
type Display = "invisible" | "underline" | "inverse";
export function PhosphorView(props: { port: PhosphorPort }) {
  const api = props.port,
    data = createMemo(() => api.read()),
    rows = createMemo(() => project(data()));
  validate(data());
  const [mode, setMode] = createSignal<"write" | "draw">(
      data().settings.layout === "spatial" ? "draw" : "write",
    ),
    [tool, setTool] = createSignal<Tool>("Pencil"),
    [glyph, setGlyph] = createSignal("*");
  const [insert, setInsert] = createSignal(data().settings.layout === "prose"),
    [anchor, setAnchor] = createSignal(0),
    [head, setHead] = createSignal(0),
    [focused, setFocused] = createSignal(false);
  const [selection, setSelection] = createSignal<Rectangle>(),
    [pattern, setPattern] = createSignal<Pattern>(),
    [preview, setPreview] = createSignal<Cell[]>([]);
  const [palette, setPalette] = createSignal<"ASCII" | "Apple II" | "Recent">(
      "ASCII",
    ),
    [recent, setRecent] = createSignal<string[]>([
      "*",
      ".",
      "-",
      "|",
      "/",
      "\\",
      "#",
    ]);
  const [brush, setBrush] = createSignal<string[]>([]),
    [tagDisplay, setTagDisplay] = createSignal<Display>("invisible"),
    [entityDisplay, setEntityDisplay] = createSignal<Display>("underline");
  const [message, setMessage] = createSignal(
      "Ready. Every character has a place.",
    ),
    [busy, setBusy] = createSignal(false),
    [find, setFind] = createSignal(""),
    [replacement, setReplacement] = createSignal("");
  const [storage, setStorage] = createSignal(false),
    [folder, setFolder] = createSignal(api.location()?.folder ?? "."),
    [filename, setFilename] = createSignal(
      api.location()?.filename ?? `${api.title()}.ink`,
    );
  const [searchOpen, setSearchOpen] = createSignal(false),
    [tag, setTag] = createSignal(""),
    [entityQuery, setEntityQuery] = createSignal(""),
    [entities, setEntities] = createSignal<{ id: string; name: string }[]>([]);
  const [effects, setEffects] = createSignal(true),
    [reduced, setReduced] = createSignal(false),
    [ready, setReady] = createSignal(false),
    [cellWidth, setCellWidth] = createSignal(14);
  let root!: HTMLDivElement,
    input!: HTMLTextAreaElement,
    surface!: HTMLDivElement,
    viewport!: HTMLDivElement,
    left!: HTMLElement,
    right!: HTMLElement;
  let material:
    | Awaited<
        ReturnType<(typeof import("./material"))["createPhosphorMaterial"]>
      >
    | undefined;
  let drag:
      | {
          start: Cell;
          last: Cell;
          base: ScreenData;
          revision: number;
          cells: Cell[];
          tool: Tool;
        }
      | undefined,
    composing = false,
    compositionText = "";
  let alive = true;
  onCleanup(() => {
    alive = false;
    material?.dispose();
  });
  const cursorCell = createMemo(() => cellAt(data(), head()));
  const columns = createMemo(() => data().settings.columns);
  const [firstRow, setFirstRow] = createSignal(0);
  const visibleRows = createMemo(() => {
    const start = Math.max(0, firstRow() - 3),
      end = Math.min(Math.max(24, rows().length), start + 42);
    return Array.from(
      { length: Math.max(0, end - start) },
      (_, i) => start + i,
    );
  });
  const lineHeight = () => (cellWidth() * (columns() === 80 ? 16 : 8)) / 7,
    length = () => chars(data().text).length;
  const range = () => ({
    start: Math.min(anchor(), head()),
    end: Math.max(anchor(), head()),
  });
  const act = (work: () => void) => {
    try {
      work();
    } catch (e) {
      setMessage(String(e instanceof Error ? e.message : e));
    }
  };
  const run = async (work: () => Promise<void>) => {
    if (busy()) return;
    setBusy(true);
    try {
      await work();
    } catch (e) {
      if (alive) setMessage(String(e instanceof Error ? e.message : e));
    } finally {
      if (alive) setBusy(false);
    }
  };
  const chooseGlyph = (g: string) => {
    setGlyph(g);
    setRecent((v) => [g, ...v.filter((x) => x !== g)].slice(0, 16));
  };
  const focus = () => {
    input.focus({ preventScroll: true });
    setFocused(true);
  };
  const caret = (offset: number, extend = false) => {
    let next = Math.max(0, Math.min(length(), offset));
    if (
      data().settings.layout === "spatial" &&
      chars(data().text)[next] === "\n"
    )
      next += offset >= head() ? 1 : -1;
    setHead(next);
    if (!extend) setAnchor(next);
  };
  const commit = (next: ScreenData, label: string, revision?: number) =>
    api.commit(next, label, revision);
  const settings = (patch: Partial<ScreenData["settings"]>) =>
    act(() => {
      commit(
        resize(data(), { ...data().settings, ...patch }),
        "Change Screen geometry",
      );
      setSelection(undefined);
      caret(Math.min(head(), length()));
    });
  const selectedRanges = () =>
    selection()
      ? Array.from(
          { length: selection()!.bottom - selection()!.top + 1 },
          (_, i) => ({
            start:
              (selection()!.top + i) * (data().settings.columns + 1) +
              selection()!.left,
            end:
              (selection()!.top + i) * (data().settings.columns + 1) +
              selection()!.right +
              1,
          }),
        )
      : [range()].filter((r) => r.end > r.start);
  const mark = (
    type: string,
    value?: string,
    metadata?: Record<string, unknown>,
  ) =>
    act(() => {
      const ranges = selectedRanges();
      if (!ranges.length) throw Error("Select characters first.");
      const next = {
        ...data(),
        marks: [
          ...data().marks,
          ...ranges.map((r) => ({
            id: crypto.randomUUID(),
            type,
            value,
            metadata,
            start: r.start,
            end: r.end - 1,
          })),
        ],
      };
      commit(next, "Annotate characters");
      setMessage(
        type === ENTITY ? "Entity reference linked." : "Characters annotated.",
      );
    });
  const attribute = (type: string) =>
    act(() => {
      const active = brush().includes(type);
      setBrush((b) => (active ? b.filter((t) => t !== type) : [...b, type]));
      const ranges = selectedRanges();
      if (!ranges.length) return;
      if (!active) {
        mark(type);
        return;
      }
      const marks = data().marks.flatMap((p) => {
        if (p.type !== type) return [p];
        let pieces = [p];
        for (const r of ranges)
          pieces = pieces.flatMap((s) =>
            s.end < r.start || s.start >= r.end
              ? [s]
              : [
                  { ...s, end: r.start - 1 },
                  { ...s, id: crypto.randomUUID(), start: r.end },
                ].filter((s) => s.end >= s.start),
          );
        return pieces;
      });
      commit({ ...data(), marks }, "Clear character attribute");
    });
  const inputText = (value: string, inherited: Mark[] = []) =>
    act(() => {
      const r = range(),
        clean = cleanInput(
          value,
          data().settings.tab,
          cellAt(data(), r.start).column,
        ),
        result = write(data(), r.start, r.end, clean.text, insert());
      // Authored attributes apply to newly typed glyphs, independently of selection styling.
      if (brush().length && result.caret > r.start)
        for (const type of brush())
          result.data.marks.push({
            id: crypto.randomUUID(),
            type,
            start: r.start,
            end: Math.min(chars(result.data.text).length - 1, result.caret - 1),
          });
      if (clean.text === value)
        for (const m of inherited) {
          const start = result.positions[m.start],
            end = result.positions[m.end];
          if (
            start !== undefined &&
            end !== undefined &&
            end < chars(result.data.text).length
          )
            result.data.marks.push({
              ...m,
              id: crypto.randomUUID(),
              start,
              end,
            });
        }
      commit(result.data, "Type characters");
      setHead(result.caret);
      setAnchor(result.caret);
      setSelection(undefined);
      setMessage(
        clean.replaced
          ? `${clean.replaced} unsupported character(s) replaced with ?.`
          : "Writing.",
      );
    });
  const remove = (backwards = false) =>
    act(() => {
      if (mode() === "draw" && selection()) {
        commit(
          paint(
            data(),
            box(
              { column: selection()!.left, row: selection()!.top },
              { column: selection()!.right, row: selection()!.bottom },
              true,
            ),
            " ",
            [],
          ),
          "Clear rectangle",
        );
        return;
      }
      if (backwards && head() === 0 && anchor() === 0) return;
      const r = range(),
        start =
          r.end > r.start ? r.start : Math.max(0, head() - (backwards ? 1 : 0)),
        end = r.end > r.start ? r.end : Math.min(length(), start + 1);
      if (start === end) return;
      if (data().settings.layout === "prose")
        commit(splice(data(), start, end, ""), "Delete characters");
      else {
        const cells = [];
        for (let i = start; i < end; i++)
          if (chars(data().text)[i] !== "\n") cells.push(cellAt(data(), i));
        commit(paint(data(), cells, " ", []), "Erase characters");
      }
      caret(start);
    });
  const copied = () => {
    if (selection()) return copyRectangle(data(), selection()!);
    const r = range();
    return {
      version: 1 as const,
      rows: chars(data().text).slice(r.start, r.end).join("").split("\n"),
      marks: data()
        .marks.filter((p) => p.end >= r.start && p.start < r.end)
        .map((p) => ({
          ...p,
          id: crypto.randomUUID(),
          start: Math.max(r.start, p.start) - r.start,
          end: Math.min(r.end - 1, p.end) - r.start,
        })),
    };
  };
  const copy = (event?: ClipboardEvent, cut = false) =>
    act(() => {
      const p = copied();
      setPattern(p);
      if (event) {
        event.preventDefault();
        event.clipboardData?.setData("text/plain", p.rows.join("\n"));
        event.clipboardData?.setData(
          "application/x-phosphor-text",
          JSON.stringify({
            encoding: GLYPH_ENCODING,
            text: p.rows.join("\n"),
            marks: p.marks,
          }),
        );
        if (selection())
          event.clipboardData?.setData(
            "application/x-phosphor-rectangle",
            JSON.stringify(p),
          );
      } else
        void navigator.clipboard
          ?.writeText(p.rows.join("\n"))
          .catch(() =>
            setMessage(
              "Pattern copied in Phosphor. Use Cmd/Ctrl+C for the system clipboard.",
            ),
          );
      if (cut) remove();
      else setMessage("Copied characters and attributes.");
    });
  const pastePattern = (p = pattern()) =>
    act(() => {
      if (!p) throw Error("Copy a rectangular pattern first.");
      commit(stamp(data(), p, cursorCell()), "Stamp selection");
    });
  const paste = (e: ClipboardEvent) => {
    e.preventDefault();
    const raw = e.clipboardData?.getData("application/x-phosphor-rectangle");
    if (raw && data().settings.layout === "spatial") {
      act(() => {
        const p = JSON.parse(raw) as Pattern;
        pastePattern(p);
      });
    } else {
      const rich = e.clipboardData?.getData("application/x-phosphor-text");
      if (rich)
        act(() => {
          const value = JSON.parse(rich);
          if (
            value.encoding !== GLYPH_ENCODING ||
            typeof value.text !== "string" ||
            !Array.isArray(value.marks)
          )
            throw Error("Unsupported Phosphor clipboard.");
          validate({
            text: value.text,
            marks: value.marks,
            settings: { ...data().settings, layout: "prose", scroll: true },
          });
          inputText(value.text, value.marks);
        });
      else inputText(e.clipboardData?.getData("text/plain") ?? "");
    }
  };
  const findNext = () => {
    if (!find()) return;
    const text = data().text,
      from = chars(text).slice(0, head()).join("").length;
    let i = text.indexOf(find(), from);
    if (i < 0) i = text.indexOf(find());
    if (i < 0) {
      setMessage("No match.");
      return;
    }
    const start = chars(text.slice(0, i)).length;
    setAnchor(start);
    setHead(start + chars(find()).length);
    setMessage("Match selected.");
    focus();
  };
  const replace = (all = false) =>
    act(() => {
      if (!find()) return;
      const nextText = cleanInput(replacement()).text;
      if (
        data().settings.layout === "spatial" &&
        chars(find()).length !== chars(nextText).length
      )
        throw Error("Spatial replacement must keep the same cell width.");
      let next = data();
      const matches: number[] = [];
      if (all) {
        let pos = 0;
        for (;;) {
          const i = next.text.indexOf(find(), pos);
          if (i < 0) break;
          matches.push(chars(next.text.slice(0, i)).length);
          pos = i + find().length;
        }
      } else {
        const r = range();
        if (chars(data().text).slice(r.start, r.end).join("") !== find()) {
          findNext();
          return;
        }
        matches.push(r.start);
      }
      for (const start of matches.reverse())
        next = splice(next, start, start + chars(find()).length, nextText);
      commit(next, all ? "Replace all" : "Replace match");
      setMessage(`Replaced ${matches.length} match(es).`);
    });
  const key = (e: KeyboardEvent) => {
    if (e.isComposing) return;
    const primary = e.metaKey || e.ctrlKey;
    if (primary) {
      const k = e.key.toLowerCase();
      if (["z", "y", "a", "f", "s"].includes(k)) {
        e.preventDefault();
        e.stopPropagation();
        if (k === "z") e.shiftKey ? api.redo() : api.undo();
        if (k === "y") api.redo();
        if (k === "a") {
          setAnchor(0);
          setHead(length());
        }
        if (k === "f") setSearchOpen(true);
        if (k === "s") setStorage(true);
      }
      return;
    }
    if (
      [
        "ArrowLeft",
        "ArrowRight",
        "ArrowUp",
        "ArrowDown",
        "Home",
        "End",
        "Backspace",
        "Delete",
        "Tab",
        "Enter",
        "Escape",
        "Insert",
      ].includes(e.key)
    ) {
      e.preventDefault();
      e.stopPropagation();
      const c = cursorCell(),
        r = rows()[c.row];
      if (e.key === "ArrowLeft") caret(head() - 1, e.shiftKey);
      if (e.key === "ArrowRight") caret(head() + 1, e.shiftKey);
      if (e.key === "ArrowUp" || e.key === "ArrowDown")
        caret(
          offsetAt(data(), {
            column: c.column,
            row: c.row + (e.key === "ArrowUp" ? -1 : 1),
          }),
          e.shiftKey,
        );
      if (e.key === "Home") caret(r.start, e.shiftKey);
      if (e.key === "End")
        caret(
          r.start +
            (data().settings.layout === "spatial" ? r.length - 1 : r.length),
          e.shiftKey,
        );
      if (e.key === "Backspace") remove(true);
      if (e.key === "Delete") remove();
      if (e.key === "Tab") inputText("\t");
      if (e.key === "Enter") inputText("\n");
      if (e.key === "Escape") {
        setSelection(undefined);
        setPreview([]);
        setAnchor(head());
        drag = undefined;
      }
      if (e.key === "Insert") setInsert((v) => !v);
    }
  };
  const point = (e: PointerEvent): Cell => {
    const r = surface.getBoundingClientRect(),
      scale = r.width / (data().settings.columns * cellWidth()) || 1;
    return {
      column: Math.max(
        0,
        Math.min(
          data().settings.columns - 1,
          Math.floor((e.clientX - r.left) / scale / cellWidth()),
        ),
      ),
      row: Math.max(
        0,
        Math.min(
          rows().length - 1,
          Math.floor((e.clientY - r.top) / scale / lineHeight()),
        ),
      ),
    };
  };
  const down = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    focus();
    surface.setPointerCapture(e.pointerId);
    const c = point(e);
    caret(offsetAt(data(), c), e.shiftKey);
    if (mode() === "write") {
      drag = {
        start: c,
        last: c,
        base: data(),
        revision: api.revision(),
        cells: [],
        tool: "Select",
      };
      return;
    }
    act(() => {
      if (data().settings.layout !== "spatial")
        throw Error("Choose Spatial layout before drawing.");
      if (tool() === "Pick") {
        const i = offsetAt(data(), c);
        chooseGlyph(chars(data().text)[i] ?? " ");
        setBrush(
          data()
            .marks.filter(
              (p) =>
                p.start <= i &&
                p.end >= i &&
                ATTRIBUTES.includes(p.type as any),
            )
            .map((p) => p.type),
        );
        return;
      }
      if (tool() === "Stamp") {
        pastePattern();
        return;
      }
      drag = {
        start: c,
        last: c,
        base: data(),
        revision: api.revision(),
        cells: [c],
        tool: tool(),
      };
      if (tool() === "Select") setSelection(rectangle(c, c));
      else setPreview([c]);
    });
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const c = point(e);
    if (mode() === "write") {
      caret(offsetAt(data(), c), true);
      return;
    }
    if (drag.tool === "Select") setSelection(rectangle(drag.start, c));
    else if (drag.tool === "Line") setPreview(line(drag.start, c));
    else if (drag.tool === "Rectangle" || drag.tool === "Filled rectangle")
      setPreview(box(drag.start, c, drag.tool === "Filled rectangle"));
    else if (drag.tool === "Move") setPreview([c]);
    else {
      drag.cells.push(...line(drag.last, c));
      setPreview([...drag.cells]);
    }
    drag.last = c;
  };
  const up = () => {
    const gesture = drag;
    drag = undefined;
    if (!gesture) return;
    if (mode() === "draw" && gesture.tool !== "Select")
      act(() => {
        let next = gesture.base;
        if (gesture.tool === "Move") {
          const r = selection();
          if (!r) throw Error("Select a rectangle before Move.");
          const p = copyRectangle(next, r);
          next = paint(
            next,
            box(
              { column: r.left, row: r.top },
              { column: r.right, row: r.bottom },
              true,
            ),
            " ",
            [],
          );
          next = stamp(next, p, gesture.last);
          setSelection(
            rectangle(gesture.last, {
              column: gesture.last.column + chars(p.rows[0]).length - 1,
              row: gesture.last.row + p.rows.length - 1,
            }),
          );
        } else
          next = paint(
            next,
            preview().length ? preview() : gesture.cells,
            gesture.tool === "Eraser" ? " " : glyph(),
            gesture.tool === "Eraser" ? [] : brush(),
          );
        commit(next, gesture.tool + " stroke", gesture.revision);
      });
    setPreview([]);
  };
  const marked = createMemo(() => {
    const map = new Map<number, Set<string>>();
    for (const m of data().marks) {
      if (m.isDeleted) continue;
      let type = m.type;
      if (type === TAG) type = "phosphor/" + tagDisplay();
      if (type === ENTITY) type = "phosphor/" + entityDisplay();
      if (!ATTRIBUTES.includes(type as any)) continue;
      for (let i = m.start; i <= m.end; i++) {
        let set = map.get(i);
        if (!set) map.set(i, (set = new Set()));
        set.add(type);
      }
    }
    return map;
  });
  const selected = (row: number, col: number, index: number) => {
    const r = selection();
    return mode() === "draw" && r
      ? row >= r.top && row <= r.bottom && col >= r.left && col <= r.right
      : index >= range().start && index < range().end;
  };
  const pending = createMemo(
    () => new Set(preview().map((c) => `${c.row}:${c.column}`)),
  );
  createEffect(() => {
    data();
    const max = length();
    if (head() > max) setHead(max);
    if (anchor() > max) setAnchor(max);
    if (input && !composing) {
      input.value = data().text;
      input.setSelectionRange(
        chars(data().text).slice(0, Math.min(anchor(), head())).join("").length,
        chars(data().text).slice(0, Math.max(anchor(), head())).join("").length,
        anchor() > head() ? "backward" : "forward",
      );
    }
    const y = cursorCell().row * lineHeight();
    if (viewport && focused()) {
      if (y < viewport.scrollTop) viewport.scrollTop = y;
      if (y + lineHeight() > viewport.scrollTop + viewport.clientHeight)
        viewport.scrollTop = y + lineHeight() - viewport.clientHeight;
    }
  });
  const fitCells = () => {
    const pixelWidth = columns() === 80 ? 3.5 : 7,
      scale = Math.max(
        1,
        Math.floor(
          Math.min(
            (viewport.clientWidth - 48) / (columns() * pixelWidth),
            (viewport.clientHeight - 32) / (24 * 8),
          ),
        ),
      );
    setCellWidth(pixelWidth * scale);
  };
  onMount(() => {
    presentations.set(root, api);
    onCleanup(() => presentations.delete(root));
    onCleanup(api.mount(root, input));
    const observer = new ResizeObserver(fitCells);
    observer.observe(viewport);
    onCleanup(() => observer.disconnect());
    const motion = matchMedia("(prefers-reduced-motion: reduce)"),
      colours = matchMedia("(forced-colors: active)");
    const change = () => setReduced(motion.matches || colours.matches);
    change();
    motion.addEventListener("change", change);
    colours.addEventListener("change", change);
    onCleanup(() => {
      motion.removeEventListener("change", change);
      colours.removeEventListener("change", change);
    });
  });
  createEffect(() => {
    const enabled = effects() && !reduced();
    mode();
    columns();
    let disposed = false;
    material?.dispose();
    material = undefined;
    setReady(false);
    if (enabled && root)
      void import("./material").then((m) => {
        if (disposed) return;
        try {
          material = m.createPhosphorMaterial(
            root,
            [viewport, left, right].filter(Boolean),
            setReady,
          );
        } catch {
          setMessage("Simple surfaces active. Editing remains available.");
        }
      });
    onCleanup(() => {
      disposed = true;
    });
    if (viewport) fitCells();
  });
  const linkEntity = (entity: { id: string; name: string }) =>
    mark(ENTITY, entity.id, { entityId: entity.id, entityName: entity.name });
  return (
    <div
      ref={root}
      class="phosphor"
      data-material-ready={ready()}
      data-reduced={reduced() || !effects()}
      data-mode={mode()}
      style={{
        "--cell-width": `${cellWidth()}px`,
        "--columns": columns(),
        "--ph-glyph-font":
          columns() === 80 ? '"Phosphor Apple 80"' : '"Phosphor Apple 40"',
      }}
    >
      <div class="ph-ui">
        <header class="ph-title">
          <span class="ph-emblem">Φ</span>
          <span>
            Phosphor <span class="ph-muted">—</span> {api.title()}.ink
          </span>
          <span class="ph-title-note">SAME THING. MANY FORMS.</span>
        </header>
        <nav class="ph-menu" aria-label="Phosphor commands">
          <button onClick={() => setStorage((v) => !v)}>File</button>
          <button onClick={() => api.undo()}>Undo</button>
          <button onClick={() => api.redo()}>Redo</button>
          <button onClick={() => setSearchOpen((v) => !v)}>Find</button>
          <span class="ph-spacer" />
          <div class="ph-segment">
            <button
              aria-pressed={mode() === "write"}
              onClick={() => {
                setMode("write");
                setSelection(undefined);
                focus();
              }}
            >
              WRITE
            </button>
            <button
              aria-pressed={mode() === "draw"}
              onClick={() => {
                if (data().settings.layout === "prose") {
                  setMessage("Choose Spatial layout to draw without reflow.");
                }
                setMode("draw");
                focus();
              }}
            >
              DRAW
            </button>
          </div>
          <button aria-pressed={insert()} onClick={() => setInsert((v) => !v)}>
            {insert() ? "INSERT" : "OVERWRITE"}
          </button>
          <div class="ph-segment">
            <For each={[40, 80] as const}>
              {(n) => (
                <button
                  aria-pressed={data().settings.columns === n}
                  onClick={() => settings({ columns: n })}
                >
                  {n} COL
                </button>
              )}
            </For>
          </div>
        </nav>
        <Show when={storage()}>
          <section class="ph-drawer" aria-label="File controls">
            <button onClick={() => api.newDocument("blank")}>New screen</button>
            <button onClick={() => api.newDocument("letter")}>Letter</button>
            <button onClick={() => api.newDocument("rain")}>ASCII scene</button>
            <button onClick={() => api.newDocument("poem")}>
              Concrete poem
            </button>
            <label>
              Folder
              <input
                aria-label="Document folder"
                value={folder()}
                onInput={(e) => setFolder(e.currentTarget.value)}
              />
            </label>
            <label>
              File
              <input
                aria-label="Document filename"
                value={filename()}
                onInput={(e) => setFilename(e.currentTarget.value)}
              />
            </label>
            <button
              disabled={busy()}
              onClick={() =>
                void run(async () => {
                  setMessage(await api.save(folder(), filename()));
                })
              }
            >
              Save .ink
            </button>
            <button
              disabled={busy()}
              onClick={() =>
                void run(async () => {
                  await api.open(folder(), filename());
                  setMessage("Opened in another window.");
                })
              }
            >
              Open .ink
            </button>
            <button onClick={() => setStorage(false)}>Close</button>
          </section>
        </Show>
        <Show when={searchOpen()}>
          <section class="ph-drawer" aria-label="Find and replace">
            <input
              aria-label="Find text"
              value={find()}
              onInput={(e) => setFind(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") findNext();
              }}
            />
            <button onClick={findNext}>Find next</button>
            <input
              aria-label="Replacement text"
              value={replacement()}
              onInput={(e) => setReplacement(e.currentTarget.value)}
            />
            <button onClick={() => replace()}>Replace</button>
            <button onClick={() => replace(true)}>Replace all</button>
            <button onClick={() => setSearchOpen(false)}>Close</button>
          </section>
        </Show>
        <div class="ph-workspace">
          <aside
            ref={left}
            class="ph-palette ph-panel"
            aria-label="Characters and drawing tools"
          >
            <h2>Characters</h2>
            <div class="ph-segment">
              <For each={["ASCII", "Apple II", "Recent"] as const}>
                {(name) => (
                  <button
                    aria-pressed={palette() === name}
                    onClick={() => setPalette(name)}
                  >
                    {name}
                  </button>
                )}
              </For>
            </div>
            <div
              class="ph-characters"
              classList={{ "ph-mousetext-picker": palette() === "Apple II" }}
            >
              <For
                each={
                  palette() === "ASCII"
                    ? ASCII
                    : palette() === "Apple II"
                      ? APPLE
                      : recent()
                }
              >
                {(g) => (
                  <button
                    aria-label={glyphLabel(g)}
                    title={
                      glyphInfo(g)
                        ? `${glyphLabel(g)} · U+${g.codePointAt(0)!.toString(16).toUpperCase()}`
                        : `U+${g.codePointAt(0)!.toString(16).toUpperCase()}`
                    }
                    aria-pressed={glyph() === g}
                    onClick={() => chooseGlyph(g)}
                  >
                    <span>{g === " " ? "␣" : g}</span>
                    <Show when={palette() === "Apple II"}>
                      <small>
                        ${glyphInfo(g)!.code.toString(16).toUpperCase()}
                      </small>
                    </Show>
                  </button>
                )}
              </For>
            </div>
            <h2>Tools</h2>
            <div class="ph-tools">
              <For each={tools}>
                {(t) => (
                  <button
                    aria-label={t}
                    aria-pressed={tool() === t}
                    onClick={() => setTool(t)}
                  >
                    <span>
                      {
                        {
                          Pencil: "╱",
                          Pick: "◇",
                          Eraser: "□",
                          Line: "╱",
                          Rectangle: "□",
                          "Filled rectangle": "■",
                          Select: "⊞",
                          Move: "↔",
                          Stamp: "▣",
                        }[t]
                      }
                    </span>
                    {t}
                  </button>
                )}
              </For>
            </div>
            <div class="ph-small-actions">
              <button onClick={() => copy()}>Copy</button>
              <button onClick={() => copy(undefined, true)}>Cut</button>
              <button onClick={() => pastePattern()}>Paste</button>
            </div>
            <p class="ph-hint">
              Drag to draw. Select a rectangle, then Move or Stamp. Cmd/Ctrl+C,
              X, V work here.
            </p>
          </aside>
          <main class="ph-editor">
            <div class="ph-screen-heading">
              Screen 1{" "}
              <span>
                ({data().settings.columns} × 24) —{" "}
                {data().settings.scroll ? "Scroll" : "Fixed"}
              </span>
              <span class="ph-spacer" />
              <small>
                {data().settings.layout === "spatial" ? "SPATIAL" : "PROSE"}
              </small>
            </div>
            <div class="ph-ruler" aria-hidden="true">
              <div class="ph-ruler-track">
                <For each={[0, columns() / 4, columns() / 2, columns() - 1]}>
                  {(n) => (
                    <span style={{ left: `${n * cellWidth()}px` }}>{n}</span>
                  )}
                </For>
              </div>
            </div>
            <div
              ref={viewport}
              class="ph-screen-viewport"
              data-ph-panel
              onScroll={() =>
                setFirstRow(Math.floor(viewport.scrollTop / lineHeight()))
              }
            >
              <textarea
                ref={input}
                class="ph-input"
                aria-label="Phosphor character screen"
                spellcheck={false}
                autocapitalize="off"
                autocomplete="off"
                value={data().text}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                onKeyDown={key}
                onCopy={(e) => copy(e)}
                onCut={(e) => copy(e, true)}
                onPaste={paste}
                onBeforeInput={(e) => {
                  if (composing || e.isComposing) return;
                  const text = e.data;
                  if (e.inputType.startsWith("insert") && text) {
                    e.preventDefault();
                    inputText(text);
                  } else if (
                    e.inputType === "insertLineBreak" ||
                    e.inputType === "insertParagraph"
                  ) {
                    e.preventDefault();
                    inputText("\n");
                  } else if (e.inputType.startsWith("delete")) {
                    e.preventDefault();
                    remove(e.inputType.includes("Backward"));
                  }
                }}
                onSelect={() => {
                  if (composing) return;
                  const value = input.value,
                    a = chars(value.slice(0, input.selectionStart)).length,
                    b = chars(value.slice(0, input.selectionEnd)).length;
                  if (input.selectionDirection === "backward") {
                    setAnchor(b);
                    setHead(a);
                  } else {
                    setAnchor(a);
                    setHead(b);
                  }
                }}
                onCompositionStart={() => {
                  composing = true;
                  compositionText = "";
                }}
                onCompositionUpdate={(e) => {
                  compositionText = e.data;
                }}
                onCompositionEnd={(e) => {
                  composing = false;
                  inputText(e.data || compositionText);
                  input.value = data().text;
                }}
                onInput={() => {
                  if (!composing) input.value = data().text;
                }}
              />
              <div
                ref={surface}
                class="ph-cell-surface"
                style={{
                  "--cell-width": `${cellWidth()}px`,
                  "--line-height": `${lineHeight()}px`,
                  "--columns": data().settings.columns,
                  "--glyph-size": `${lineHeight()}px`,
                  height: `${Math.max(24, rows().length) * lineHeight()}px`,
                }}
                onPointerDown={down}
                onPointerMove={move}
                onPointerUp={up}
                onPointerCancel={() => {
                  drag = undefined;
                  setPreview([]);
                }}
                aria-hidden="true"
              >
                <For each={visibleRows()}>
                  {(y) => (
                    <div
                      class="ph-row"
                      style={{ top: `${y * lineHeight()}px` }}
                    >
                      <span class="ph-row-number">{y + 1}</span>
                      <For
                        each={Array.from(
                          { length: data().settings.columns },
                          (_, i) => i,
                        )}
                      >
                        {(x) => {
                          const index = () => rows()[y]?.start + x,
                            valid = () => !!rows()[y] && x < rows()[y].length,
                            flags = () =>
                              valid() ? marked().get(index()) : undefined;
                          return (
                            <span
                              class="ph-cell"
                              classList={{
                                "ph-inverse": flags()?.has(ATTRIBUTES[0]),
                                "ph-blink": flags()?.has(ATTRIBUTES[1]),
                                "ph-underline": flags()?.has(ATTRIBUTES[2]),
                                "ph-selected":
                                  valid() && selected(y, x, index()),
                                "ph-caret":
                                  focused() &&
                                  cursorCell().row === y &&
                                  cursorCell().column === x,
                                "ph-preview": pending().has(`${y}:${x}`),
                              }}
                            >
                              <span class="ph-glyph">
                                {pending().has(`${y}:${x}`) && tool() !== "Move"
                                  ? tool() === "Eraser"
                                    ? " "
                                    : glyph()
                                  : (chars(rows()[y]?.text ?? "")[x] ?? " ")}
                              </span>
                            </span>
                          );
                        }}
                      </For>
                    </div>
                  )}
                </For>
              </div>
            </div>
            <div class="ph-screen-foot">
              A place for words. A space for forms.<span>INK NATIVE</span>
            </div>
          </main>
          <aside ref={right} class="ph-inspector ph-panel">
            <h2>Cell</h2>
            <div class="ph-cell-settings">
              <output class="ph-glyph-preview">
                {glyph() === " " ? "␣" : glyph()}
              </output>
              <div>
                <For each={ATTRIBUTES}>
                  {(type) => (
                    <label>
                      <input
                        type="checkbox"
                        checked={brush().includes(type)}
                        onChange={() => attribute(type)}
                      />
                      {type.split("/")[1]}
                    </label>
                  )}
                </For>
              </div>
            </div>
            <h2>Document</h2>
            <label>
              Title
              <input
                aria-label="Document title"
                value={api.title()}
                onChange={(e) => api.rename(e.currentTarget.value)}
              />
            </label>
            <label>
              Layout
              <select
                aria-label="Screen layout"
                value={data().settings.layout}
                onChange={(e) =>
                  settings({
                    layout: e.currentTarget.value as "spatial" | "prose",
                  })
                }
              >
                <option value="spatial">Spatial / artwork</option>
                <option value="prose">Prose / soft wrap</option>
              </select>
            </label>
            <label>
              Scroll mode
              <select
                aria-label="Scroll mode"
                value={data().settings.scroll ? "scroll" : "fixed"}
                onChange={(e) =>
                  settings({ scroll: e.currentTarget.value === "scroll" })
                }
              >
                <option value="fixed">Fixed · 24 rows</option>
                <option value="scroll">Vertical scroll</option>
              </select>
            </label>
            <label>
              Tab stops
              <select
                aria-label="Tab stops"
                value={data().settings.tab}
                onChange={(e) =>
                  settings({ tab: Number(e.currentTarget.value) as 4 | 8 })
                }
              >
                <option value="4">4</option>
                <option value="8">8</option>
              </select>
            </label>
            <h2>Entities & tags</h2>
            <For
              each={[
                { name: "Tag display", get: tagDisplay, set: setTagDisplay },
                {
                  name: "Entity display",
                  get: entityDisplay,
                  set: setEntityDisplay,
                },
              ]}
            >
              {(item) => (
                <label>
                  {item.name}
                  <select
                    aria-label={item.name}
                    value={item.get()}
                    onChange={(e) => item.set(e.currentTarget.value as Display)}
                  >
                    <option value="invisible">Invisible</option>
                    <option value="underline">Underline</option>
                    <option value="inverse">Inverse</option>
                  </select>
                </label>
              )}
            </For>
            <label>
              Tag selected text
              <input
                aria-label="Tag name"
                value={tag()}
                onInput={(e) => setTag(e.currentTarget.value)}
              />
            </label>
            <button
              disabled={!tag().trim()}
              onClick={() => {
                mark(TAG, tag().trim());
              }}
            >
              Apply tag
            </button>
            <label>
              Find entity
              <input
                aria-label="Entity search"
                value={entityQuery()}
                onInput={(e) => setEntityQuery(e.currentTarget.value)}
              />
            </label>
            <div class="ph-small-actions">
              <button
                disabled={busy() || !entityQuery().trim()}
                onClick={() =>
                  void run(async () => {
                    setEntities(await api.searchEntities(entityQuery()));
                    setMessage("Choose a canonical Entity below.");
                  })
                }
              >
                Search
              </button>
              <button
                disabled={busy() || !entityQuery().trim()}
                onClick={() =>
                  void run(async () => {
                    const entity = await api.createEntity(entityQuery().trim());
                    setEntities([entity]);
                    setMessage(
                      "Entity created. Select text and link it below.",
                    );
                  })
                }
              >
                Create
              </button>
            </div>
            <For each={entities()}>
              {(e) => (
                <button class="ph-entity-result" onClick={() => linkEntity(e)}>
                  {e.name} ↗
                </button>
              )}
            </For>
            <ul class="ph-marks">
              <For
                each={data().marks.filter(
                  (p) => p.type === TAG || p.type === ENTITY,
                )}
              >
                {(p) => (
                  <li>
                    <button
                      onClick={() => {
                        setAnchor(p.start);
                        setHead(p.end + 1);
                        setSelection(undefined);
                        focus();
                      }}
                    >
                      {p.type === TAG ? "#" : "↗"}{" "}
                      {String(p.metadata?.entityName ?? p.value)}
                    </button>
                    <button
                      aria-label="Remove semantic mark"
                      onClick={() =>
                        act(() =>
                          commit(
                            {
                              ...data(),
                              marks: data().marks.filter((m) => m.id !== p.id),
                            },
                            "Remove semantic mark",
                          ),
                        )
                      }
                    >
                      ×
                    </button>
                  </li>
                )}
              </For>
            </ul>
            <label class="ph-effects">
              <input
                type="checkbox"
                checked={effects()}
                onChange={(e) => setEffects(e.currentTarget.checked)}
              />{" "}
              Material effects
            </label>
            <p class="ph-hint">
              Semantic marks remain in Ink when invisible. Entities use the
              saved Document’s Cavern.
            </p>
          </aside>
        </div>
        <footer class="ph-status">
          <span>Phosphor</span>
          <span>
            {mode().toUpperCase()}　│　Glyph:{" "}
            <span class="ph-status-glyph">{glyph()}</span>　│　
            {insert() ? "INSERT" : "OVERWRITE"}
          </span>
          <span class="ph-spacer" />
          <span>
            Row {cursorCell().row + 1}, Col {cursorCell().column + 1}
          </span>
          <span>{ready() ? "AMBER GLASS" : "SIMPLE SURFACES"}</span>
        </footer>
        <div class="ph-notice" role="status">
          {message()} <span>{api.status()}</span>
        </div>
      </div>
    </div>
  );
}
