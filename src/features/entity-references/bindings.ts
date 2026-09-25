import { chord, keyboard as k } from "../../feature-api";
import type { AnnotationCapabilities } from "../../feature-api";
export function registerEntityBindings(api: AnnotationCapabilities, platform = typeof navigator === "undefined" ? "" : navigator.platform) {
  const add = (id: string, name: string, description: string, category: string, scope: string, defaults: Parameters<AnnotationCapabilities["register"]["binding"]>[0]["defaults"], tags: string[] = []) => api.register.binding({ id, name, description, category, scope, defaults, tags, handler: context => context.run(id) });
  const primary = /Mac|iPhone|iPad|iPod/i.test(platform) ? "Meta" : "Ctrl";
  for (const [id, name, key] of [["close", "Cancel entity search", "Escape"], ["choose", "Link selected entity", "Enter"], ["next", "Next entity result", "ArrowDown"], ["previous", "Previous entity result", "ArrowUp"]]) add(`entity.${id}`, name, "Navigate the entity search dialog without changing the document until a result is selected.", "Entities", "entity-search", [k(key)]);
  add("entity.clear", "Clear entity search", "Clear the entity query.", "Entities", "entity-search", [k("Backspace", "Ctrl"), k("Backspace", "Meta")]);
  add("entity.candidates.open", "Find other occurrences", "Review scoped text matches as candidates for the nominated entity.", "Entities", "entity-search", [k("a",primary,"Shift")], ["search","bulk"]);
  add("entity.candidates.selectAll", "Find/select all matching mentions", "Select all eligible mention targets, not just the visible results page. Native text fields retain Select All.", "Entities", "entity-search", primary === "Meta" ? [k("a","Ctrl"),k("a","Meta")] : [k("a","Ctrl")], ["search","bulk","selection"]);
  for (const [id,name,key] of [["next","Next candidate","ArrowDown"],["previous","Previous candidate","ArrowUp"],["toggle","Toggle candidate"," "]]) add(`entity.candidates.${id}`,name,"Navigate candidate rows; Space checks or excludes a mention.","Entities","entity-search/candidates",[k(key)],["selection"]);
  const entityReferenceChord = chord(k(";", "Ctrl"), k("r"));
  const entityListingChord = chord(k(";", "Ctrl"), k("l"));
  add("entity.open", "Entity reference", "Search the graph for an entity to link to selected text.", "Entities", "editor/standoff", [entityReferenceChord]);
  add("cross.entity", "Entity reference across Blocks", "Search for one entity shared by the selected Block-local ranges.", "Entities", "cross-text", [entityReferenceChord]);
  add("entity.list.open", "Entity listing", "List entities referenced by standoff properties in the current Document.", "Entities", "editor", [entityListingChord], ["listing", "mentions"]);
  add("cross.entityList", "Entity listing from cross-Block selection", "List entities referenced by standoff properties in the current Document.", "Entities", "cross-text", [entityListingChord], ["listing", "mentions"]);
}
