import type { CommandDefinition, NodeKey } from "../block-tree/types";
import type { SelectionGesturePolicy } from "../input/selection-gestures";
import type { CurrentTextOperation } from "../runtime/current-text-operation";
import type { FeatureToolbarContribution } from "../runtime/features";
import type { AnnotationApplication, SelectionVisibility } from "../runtime/range-annotations";
import type { TextSelectionSnapshot } from "../runtime/selection-snapshot";
import type { TextRangeSnapshot, TextRanges } from "../runtime/text-ranges";

export interface TextCaret { nodeKey: NodeKey; index: number }
/** Capabilities for the existing retained-range operation, not a Block runtime. */
export interface TextOperationCapabilities {
  ranges: Pick<TextRanges, "snapshot" | "validate">;
  queries: {
    text(key: NodeKey): { key: NodeKey; viewId: string; length: number } | undefined;
    view(key: NodeKey): string | undefined;
    contains(scope: NodeKey | undefined, key: NodeKey): boolean;
    documentScope(key: NodeKey): NodeKey | undefined;
  };
  annotations: { apply(ranges: readonly TextRangeSnapshot[], type: string, value?: string, attributes?: Readonly<Record<string, number | string>>): AnnotationApplication };
  edits: { delete(ranges: readonly TextRangeSnapshot[], label: string): TextCaret };
  selection: { clearLive(): void; finish(snapshot: TextSelectionSnapshot): void; restoreCaret(caret: TextCaret): void; cancelGesture(): void };
  visibility: SelectionVisibility;
  decorations: { set(ranges: readonly TextRangeSnapshot[], style: { type: string; fill: string; priority: number }): void; clear(): void };
  register: {
    gesture(policy: Omit<SelectionGesturePolicy, "owner">): void;
    operation(operation: CurrentTextOperation): void;
    beforeChange(listener: () => void): void;
    command(command: CommandDefinition<void>): void;
    toolbar(contribution: FeatureToolbarContribution): void;
  };
}
