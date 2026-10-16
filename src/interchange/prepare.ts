import { fragmentGroup, validateFragment, type InterchangeScope, type MutableFragment } from './fragment';
import { materializeFragment } from './materialize';
import { importClipboard, type ClipboardRepresentations } from './transport';
import type { BlockFragment } from '../block-tree/clipboard';

export interface PastePreparation {
  data: ClipboardRepresentations; plain: boolean; scope: InterchangeScope;
  assets: Array<[string, string]>; blocks: Array<[string, boolean]>; selections: number;
  semanticHtml?: boolean;
  markdown?: boolean;
  asMarkdown?: boolean;
  fragment?: MutableFragment;
  parseOnly?: boolean;
}
export interface PreparedPaste { fragment?: MutableFragment; notice?: string; natives?: BlockFragment[] }
export function preparePaste(input: PastePreparation): PreparedPaste {
  const imported = input.fragment ? { fragment: validateFragment(input.fragment), notice: undefined } : importClipboard(input.data, input.plain, input.semanticHtml, input.markdown, input.asMarkdown), fragment = imported.fragment;
  if (!fragment || input.parseOnly) return imported;
  const groups: MutableFragment['roots'][] = [[]];
  for (const root of fragment.roots) { groups.at(-1)!.push(root); if (root.separatorAfter === 'selection-gap') groups.push([]); }
  if (!groups.at(-1)!.length) groups.pop();
  if (input.selections > 1 && groups.length !== 1 && groups.length !== input.selections) throw Error('Selection group counts differ. Paste into one range or matching ranges.');
  const natives = Array.from({ length: input.selections }, (_, index) => {
    const selected = input.selections > 1 && groups.length > 1 ? fragmentGroup(fragment, groups[input.selections - 1 - index]) : fragment;
    return materializeFragment(selected, input.scope, new Map(input.assets), new Map(input.blocks));
  });
  return { ...imported, natives };
}
