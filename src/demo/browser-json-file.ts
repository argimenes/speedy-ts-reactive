import { desktopOf, validateManagedContainer } from "../persistence/managed-desktop";
export interface BrowserFileHandle {
  readonly name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void>; abort?(): Promise<void> }>;
}

export interface BrowserJsonFile<T = unknown> {
  filename: string;
  value: T;
  handle?: BrowserFileHandle;
}

type FilePickerWindow = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<BrowserFileHandle[]>;
  showSaveFilePicker?: (options?: unknown) => Promise<BrowserFileHandle>;
};

const jsonTypes = [{ description: "JSON files", accept: { "application/json": [".json"] } }];

function filename(value: string, fallback: string): string {
  const trimmed = value.trim() || fallback;
  return /\.json$/i.test(trimmed) ? trimmed : `${trimmed}.json`;
}

function cancelled(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

async function read(file: File, handle?: BrowserFileHandle): Promise<BrowserJsonFile> {
  let value: unknown;
  try { value = JSON.parse(await file.text()); }
  catch (error) {
    if (error instanceof SyntaxError) throw new Error(`${file.name || "The selected file"} does not contain valid JSON.`);
    throw error;
  }
  return { filename: filename(file.name, "Document.json"), value, handle };
}

function inputFile(): Promise<File | undefined> {
  return new Promise(resolve => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.hidden = true;
    const finish = (file?: File) => { input.remove(); resolve(file); };
    input.addEventListener("change", () => finish(input.files?.[0]), { once: true });
    input.addEventListener("cancel", () => finish(), { once: true });
    document.body.append(input);
    input.click();
  });
}

export async function openJsonFile(): Promise<BrowserJsonFile | undefined> {
  const picker = window as FilePickerWindow;
  if (picker.showOpenFilePicker) {
    try {
      const [handle] = await picker.showOpenFilePicker({ multiple: false, types: jsonTypes, excludeAcceptAllOption: false });
      return handle ? read(await handle.getFile(), handle) : undefined;
    } catch (error) {
      if (cancelled(error)) return undefined;
      throw error;
    }
  }
  const file = await inputFile();
  return file ? read(file) : undefined;
}

async function writeHandle(handle: BrowserFileHandle, contents: string): Promise<void> {
  const writable = await handle.createWritable();
  try { await writable.write(contents); await writable.close(); }
  catch (error) { await writable.abort?.().catch(() => undefined); throw error; }
}

function download(contents: string, suggestedName: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = suggestedName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  queueMicrotask(() => URL.revokeObjectURL(url));
}

export async function saveJsonFile(
  value: unknown,
  options: { suggestedName: string; handle?: BrowserFileHandle; saveAs?: boolean; workspace?: { expected?: unknown; createOnly?: boolean } },
): Promise<{ filename: string; handle?: BrowserFileHandle } | undefined> {
  const suggestedName = filename(options.suggestedName, "Document.json");
  const contents = `${JSON.stringify(value, null, 2)}\n`;
  const write = async (handle: BrowserFileHandle) => {
    if (options.workspace) {
      const file = await handle.getFile();
      const contents = await file.text();
      if (contents.trim()) {
        if (options.workspace.createOnly) throw new Error("Upgrade requires a new Workspace file. Choose a new filename.");
        let previous: any;
        try { previous = JSON.parse(contents); } catch { throw new Error("The existing Workspace is malformed; choose a new filename."); }
        if ((previous.kind || previous.schemaVersion !== undefined) && !(previous.kind === 'speedy-workspace' && [1,2].includes(previous.schemaVersion) || previous.kind === 'speedy-local-workspace' && previous.schemaVersion === 2)) throw new Error("Unsupported existing Workspace version; choose a new filename.");
        if (previous.schemaVersion === 2) {
          validateManagedContainer(previous);
          const next = value as any;
          if (next.kind !== previous.kind || next.schemaVersion !== 2 || next.workspaceId !== previous.workspaceId) throw new Error("Managed Workspace identity/format cannot be overwritten.");
          if ((desktopOf(next.root)?.version ?? 0) < desktopOf(previous.root)!.version) throw new Error("A shell layout cannot be overwritten by an older Desktop format. Choose a new filename.");
          if (JSON.stringify(previous) !== JSON.stringify(options.workspace.expected)) throw new Error("The Workspace changed outside this session. Reopen it or choose a new filename.");
        } else if ((value as any)?.schemaVersion === 2) throw new Error("Upgrade requires Save As to a new Workspace filename.");
      } else if (options.workspace.expected && !options.saveAs) throw new Error("The Workspace was emptied outside this session. Choose a new filename.");
    }
    await writeHandle(handle, contents);
  };
  if (options.handle && !options.saveAs) {
    await write(options.handle);
    return { filename: filename(options.handle.name, suggestedName), handle: options.handle };
  }
  const picker = window as FilePickerWindow;
  if (picker.showSaveFilePicker) {
    try {
      const handle = await picker.showSaveFilePicker({ suggestedName, types: jsonTypes, excludeAcceptAllOption: false });
      await write(handle);
      return { filename: filename(handle.name, suggestedName), handle };
    } catch (error) {
      if (cancelled(error)) return undefined;
      throw error;
    }
  }
  download(contents, suggestedName);
  return { filename: suggestedName };
}
