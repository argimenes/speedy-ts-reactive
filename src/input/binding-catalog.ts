import { BindingRegistry, chord, keyboard as k, mouse, type Trigger } from "./bindings";

export function registerInputActions(registry: BindingRegistry, platform = typeof navigator === "undefined" ? "" : navigator.platform) {
  const add = (id: string, name: string, description: string, category: string, scope: string, defaults: Trigger[], tags: string[] = []) => registry.register({ id, name, description, category, scope, defaults, tags, handler: context => context.run(id) });
  const primary = /Mac|iPhone|iPad|iPod/i.test(platform) ? "Meta" : "Ctrl";
  add("find.open", "Find in document", "Find text recursively in the current Page, Container, or Document.", "Find", "document-find-open", [k("f", primary)]);
  for (const [id, name, trigger] of [["next", "Next match", k("Enter")], ["previous", "Previous match", k("Enter", "Shift")], ["close", "Close Find", k("Escape")]] as const) add(`find.${id}`, name, "Navigate search matches or close the session without changing document content.", "Find", "document-find", [trigger]);
  for (const [id, name, key] of [["close", "Cancel entity search", "Escape"], ["choose", "Link selected entity", "Enter"], ["next", "Next entity result", "ArrowDown"], ["previous", "Previous entity result", "ArrowUp"]]) add(`entity.${id}`, name, "Navigate the entity search dialog without changing the document until a result is selected.", "Entities", "entity-search", [k(key)]);
  add("entity.clear", "Clear entity search", "Clear the entity query.", "Entities", "entity-search", [k("Backspace", "Ctrl"), k("Backspace", "Meta")]);
  add("entity.candidates.open", "Find other occurrences", "Review scoped text matches as candidates for the nominated entity.", "Entities", "entity-search", [k("a",primary,"Shift")], ["search","bulk"]);
  add("entity.candidates.selectAll", "Find/select all matching mentions", "Select all eligible mention targets, not just the visible results page. Native text fields retain Select All.", "Entities", "entity-search", primary === "Meta" ? [k("a","Ctrl"),k("a","Meta")] : [k("a","Ctrl")], ["search","bulk","selection"]);
  for (const [id,name,key] of [["next","Next candidate","ArrowDown"],["previous","Previous candidate","ArrowUp"],["toggle","Toggle candidate"," "]]) add(`entity.candidates.${id}`,name,"Navigate candidate rows; Space checks or excludes a mention.","Entities","entity-search/candidates",[k(key)],["selection"]);
  const entityReferenceChord = chord(k(";", "Ctrl"), k("r"));
  const entityListingChord = chord(k(";", "Ctrl"), k("l"));
  const timerChord = chord(k(";", "Ctrl"), k("t"));
  const stickyChord = chord(k(";", "Ctrl"), k("n"));
  const workspaceOpenChord = chord(k(";", "Ctrl"), k("o"));
  const workspaceSaveChord = chord(k(";", "Ctrl"), k("s"));
  add("entity.open", "Entity reference", "Search the graph for an entity to link to selected text.", "Entities", "editor/standoff", [entityReferenceChord]);
  add("cross.entity", "Entity reference across Blocks", "Search for one entity shared by the selected Block-local ranges.", "Entities", "cross-text", [entityReferenceChord]);
  add("entity.list.open", "Entity listing", "List entities referenced by standoff properties in the current Document.", "Entities", "editor", [entityListingChord], ["listing", "mentions"]);
  add("cross.entityList", "Entity listing from cross-Block selection", "List entities referenced by standoff properties in the current Document.", "Entities", "cross-text", [entityListingChord], ["listing", "mentions"]);
  add("timer.create", "Add timer", "Replace an empty focused text Block with a timer, or insert one after non-empty text.", "Blocks & Margins", "editor", [timerChord], ["timer", "pomodoro"]);
  add("sticky.createFloating", "New Sticky Note", "Create a floating yellow Sticky Note in the current Workspace.", "Blocks & Margins", "editor", [stickyChord], ["sticky", "note"]);
  add("cross.timerCreate", "Add timer from cross-Block selection", "Insert a timer after the selected text Block.", "Blocks & Margins", "cross-text", [timerChord], ["timer", "pomodoro"]);
  add("workspace.open", "Open Workspace", "Load a Workspace manifest and its externally referenced Documents.", "Documents", "editor", [workspaceOpenChord], ["workspace", "files"]);
  add("workspace.save", "Save Workspace", "Save the Background and window layout plus separate referenced Document files.", "Documents", "editor", [workspaceSaveChord], ["workspace", "files"]);
  for (const [id, name, shift] of [["undo", "Undo change", false], ["redo", "Redo change", true]] as const) add(`history.${id}`, name, "Apply document history, including text, annotations and Block changes. Dialog fields retain native undo.", "Text Editing", "document-history", [k("z", "Ctrl", ...(shift ? ["Shift" as const] : [])), k("z", "Meta", ...(shift ? ["Shift" as const] : []))], ["history"]);
  for (const direction of ["Left", "Right", "Up", "Down"]) add(`cross.extend${direction}`, `Extend text selection ${direction.toLowerCase()}`, "Experimental: extend within a supported paragraph stream; structural boundaries are barriers.", "Text Selection", "cross-text", [k(`Arrow${direction}`, "Shift")]);
  add("cross.cancel", "Collapse cross-Block text selection", "Return to editing at the selection head.", "Text Selection", "cross-text", [k("Escape")]);
  add("cross.undo", "Undo from cross-Block selection", "Undo document history and safely collapse the experimental selection.", "Text Selection", "cross-text", [k("z", "Ctrl"), k("z", "Meta")]);
  add("cross.redo", "Redo from cross-Block selection", "Redo document history and safely collapse the experimental selection.", "Text Selection", "cross-text", [k("z", "Ctrl", "Shift"), k("z", "Meta", "Shift")]);
  for (const [type, key] of [["style/bold", "b"], ["style/italics", "i"], ["style/underline", "u"]]) add(`cross.style.${type}`, `Apply ${type} across Blocks`, "Create independent local properties in one undoable operation.", "Text Selection", "cross-text", [k(key, primary)]);
  for (const [id, key] of [["copy", "c"], ["cut", "x"], ["paste", "v"]]) add(`selection.${id}`, `${id[0].toUpperCase()}${id.slice(1)} Blocks`, "Use the internal selected-Block clipboard. Paste inserts after the selection; editor text and external clipboard data are separate.", "Block Selection", "block-handle", [k(key, primary)], ["clipboard", "blocks"]);
  add("selection.delete", "Delete selected Blocks", "Delete the normalized selection in one undoable operation.", "Block Selection", "block-handle", [k("Delete"), k("Backspace")], ["blocks"]);
  for (const [id, name, defaults] of [
    ["single", "Select Block", [mouse(0, "click"), k(" ")]],
    ["toggle", "Toggle selected Block", [mouse(0, "click", "Ctrl"), mouse(0, "click", "Meta"), k(" ", "Ctrl"), k(" ", "Meta")]],
    ["range", "Select Block range", [mouse(0, "click", "Shift"), k(" ", "Shift")]],
    ["add-range", "Add Block range", [mouse(0, "click", "Ctrl", "Shift"), mouse(0, "click", "Meta", "Shift")]],
    ["previous", "Select previous Block", [k("ArrowUp")]], ["next", "Select next Block", [k("ArrowDown")]],
    ["extend-previous", "Extend Block selection upwards", [k("ArrowUp", "Shift")]], ["extend-next", "Extend Block selection downwards", [k("ArrowDown", "Shift")]],
    ["clear", "Clear selected Blocks", [k("Escape")]], ["edit", "Edit selected Block", [k("Enter")]],
  ] as Array<[string, string, Trigger[]]>) add(`selection.${id}`, name, "Select whole Blocks using their gutter handles, independently of native text selection. Drag a handle to reorder the selected group within its parent list.", "Block Selection", "block-handle", defaults, ["selection", "blocks"]);
  add("annotation.open", "Inspect annotations", "Open annotations encompassing the caret's left Cell.", "Annotations", "editor/standoff", [k(".", "Ctrl"), k("/", "Ctrl"), k("/", "Meta"), { kind: "custom", name: "inspect-annotation" }]);
  for (const side of ["left", "right"] as const) add(`margin.${side}`, `Open ${side} margin`, "Create or focus the margin owned by the current Block.", "Blocks & Margins", "editor/standoff", [k(side === "left" ? "ArrowLeft" : "ArrowRight", "Ctrl", "Shift")]);
  add("text.paragraph", "New paragraph", "Split at the caret or insert an empty neighbouring paragraph.", "Text Editing", "editor/standoff", [k("Enter")]);
  add("tabs.create", "To tab / add tab", "Wrap the focused text Block in a tab row, or append an independent copy in a new tab when already inside a tab. Browser-reserved Ctrl+T may require Alt+T or the toolbar instead.", "Blocks & Margins", "editor/standoff", [k("t", "Ctrl"), k("t", "Alt")], ["tabs", "alternatives"]);
  for (const direction of ["Left", "Right", "Up", "Down"]) add(`block.${direction.toLowerCase()}`, `Navigate ${direction.toLowerCase()} at boundary`, "Move to the adjacent editable Block only at a collapsed block boundary; otherwise native caret movement applies.", "Navigation", "editor", [k(`Arrow${direction}`)]);
  add("block.delete", "Delete current Block", "Remove the focused Block and transfer focus to a surviving neighbour.", "Blocks & Margins", "editor", [k("Delete", "Shift"), k("Backspace", "Shift")]);
  add("menu.open", "Open Block menu", "Show actions for the Block or background under the pointer/focus.", "Windows", "editor", [k("ContextMenu"), k("F10", "Shift"), mouse(0, "click", "Ctrl"), mouse(2, "contextmenu"), mouse(0, "contextmenu", "Ctrl")]);
  for (const [id, name, triggers] of [
    ["left", "Move left", [k("ArrowLeft", "Shift")]], ["right", "Move right", [k("ArrowRight", "Shift")]],
    ["previous-word", "Previous word", [k("ArrowLeft", "Alt")]], ["next-word", "Next word", [k("ArrowRight", "Alt")]],
    ["expand", "Expand", [k("="), k("+", "Shift")]], ["contract", "Contract", [k("-")]], ["delete", "Delete annotation", [k("d"), k("Delete")]],
  ] as Array<[string, string, Trigger[]]>) add(`annotation.${id}`, name, id === "delete" ? "Mark the selected annotation deleted; undo restores it." : `${name} the selected annotation's inclusive Cell range.`, "Annotations", "monitor", triggers, ["range"]);
  add("monitor.close", "Close annotation monitor", "Close the monitor and restore the document caret.", "Windows", "monitor", [k("Escape")]);
  for (const [id, key] of [["previous", "ArrowUp"], ["next", "ArrowDown"], ["controls", "ArrowRight"]]) add(`monitor.${id}`, `Monitor: ${id}`, "Navigate from the annotation list without changing its ranges.", "Navigation", "monitor/list", [k(key)]);
  for (const direction of ["Left", "Right", "Up", "Down"]) add(`monitor.control${direction}`, `Controls: ${direction.toLowerCase()}`, "Move focus between annotation action buttons; left from the first returns to the list.", "Navigation", "monitor/actions", [k(`Arrow${direction}`)]);
  for (const [id, label, key, shift] of [["undo", "Undo", "z", false], ["redo", "Redo", "z", true]] as const) add(`monitor.${id}`, `${label} from monitor`, "Close the monitor and apply document history. Text fields keep native undo.", "Text Editing", "monitor", [k(key, "Ctrl", ...(shift ? ["Shift" as const] : [])), k(key, "Meta", ...(shift ? ["Shift" as const] : []))]);
  for (const [id, name, key] of [["close", "Close Block menu", "Escape"], ["tab", "Leave Block menu", "Tab"], ["back", "Previous menu", "ArrowLeft"], ["next", "Next menu item", "ArrowDown"], ["previous", "Previous menu item", "ArrowUp"], ["first", "First menu item", "Home"], ["last", "Last menu item", "End"], ["enter", "Open submenu", "ArrowRight"]]) add(`menu.${id}`, name, "Navigate the Block context menu without executing unrelated commands.", "Navigation", "menu", [k(key)]);
  for (const [id, name, key, shift] of [["open", "Open document", "o", false], ["save", "Save document", "s", false], ["saveAs", "Save document as", "s", true]] as const) add(`document.${id}`, name, "Use the document browser/store; unsaved-change and overwrite protections still apply.", "Documents", "workspace", [k(key, "Ctrl", ...(shift ? ["Shift" as const] : [])), k(key, "Meta", ...(shift ? ["Shift" as const] : [])), ...(id === "save" ? [{ kind: "custom" as const, name: "save-document" }] : [])]);
  add("bindings.open", "Input bindings", "Browse, record, reassign and restore application input bindings.", "Windows", "workspace", [{ kind: "custom", name: "toggle-bindings" }]);
  for (const [id, name] of [["bold", "Bold selection"], ["italics", "Italicise selection"], ["left", "Align left"], ["center", "Align centre"], ["right", "Align right"], ["justify", "Justify"], ["h1", "Heading 1"], ["h2", "Heading 2"], ["h3", "Heading 3"], ["h4", "Heading 4"], ["indent", "Increase indent"], ["outdent", "Decrease indent"], ["clear", "Clear formatting"]]) add(`style.${id}`, name, "Apply formatting to the focused Block or selected text using the document formatting toolbar's action.", "Styles", "editor/standoff", []);
}
