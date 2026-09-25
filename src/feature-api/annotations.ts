import type { JsonObject, CommandDefinition } from "../block-tree/types";
import type { BindingAction, BindingRegistry } from "../input/bindings";
import type { FeatureAction, Disposer } from "../runtime/features";
import type { SearchMatch, SearchRange, SearchScope, ScopeKind, TextSearch } from "../runtime/text-search";
import type { SearchRunner } from "../runtime/search-worker";
import type { SessionDecorations } from "../runtime/session-decorations";
type DecorationStyle = NonNullable<Parameters<SessionDecorations["attachMatches"]>[2]>;
import type { AnnotationContribution, AnnotationTarget } from "../runtime/annotation-contributions";
import type { PanelDefinition, PanelSession } from "../runtime/panel-contributions";
import type { EffectDefinition } from "../runtime/effect-contributions";
import type { DocumentPositionMarker } from "../runtime/document-position-markers";

export interface AnnotationText {
  readonly key: string; readonly contentKey: string; readonly placementKey: string; readonly version: number;
  readonly cells: readonly { readonly text: string; readonly plain: boolean }[];
  readonly properties: readonly JsonObject[];
}
export interface AnnotationCapabilities {
  revision(): number;
  text(key: string): AnnotationText | undefined;
  path(key: string): { key: string; label: string }[];
  scope(key: string, kind?: ScopeKind): SearchScope;
  documentTexts(key: string): { scope: SearchScope; texts: AnnotationText[] };
  selection(key: string): AnnotationTarget[];
  beforeChange(listener: () => void): Disposer;
  afterChange(listener: () => void): Disposer;
  search(runner?: SearchRunner): Pick<TextSearch, "searchText" | "dispose">;
  annotate(groups: readonly (readonly SearchRange[])[], type: string, value: string, metadata: JsonObject, revision: number, label: string): string[];
  openPanel(type: string, owner: string, data: unknown, selection?: readonly AnnotationTarget[]): PanelSession;
  decorations(owner: string): {
    ranges(ranges: SearchRange[], style: DecorationStyle): void;
    matches(set: Parameters<SessionDecorations["attachMatches"]>[1], style: DecorationStyle): void;
    visible(visible: boolean): void; active(id: string): void; clear(): void; dispose(): void;
  };
  reveal(match: SearchMatch, valid: () => boolean): Promise<boolean>;
  revealMarker(marker: DocumentPositionMarker, valid: () => boolean): Promise<boolean>;
  currentPage(scope: SearchScope, key: string): string | undefined;
  pageKeys(key: string): ReadonlySet<string>;
  concertina: {
    activate(owner: string, scope: SearchScope, markers: DocumentPositionMarker[], active: string | undefined, replaced: () => void): void;
    clear(owner: string): void; active(id: string): void;
  };
  bindings: Pick<BindingRegistry, "dispatch" | "label">;
  register: {
    panel(definition: PanelDefinition): void;
    effect(definition: EffectDefinition): void;
    annotation(definition: AnnotationContribution): void;
    command(definition: CommandDefinition<void>): void;
    binding(definition: BindingAction): void;
    action(definition: FeatureAction): void;
  };
}
