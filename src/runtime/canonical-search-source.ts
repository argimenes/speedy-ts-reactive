import type { RepositoryState } from '../block-tree/types';
import type { SearchSource } from './search-matching';

/** Read native text without a projection. Inline widgets split runs; offsets remain Cell boundaries. */
export async function canonicalSearchSource(state: RepositoryState, contentKey: string, version: number, signal?: AbortSignal, maxUnits = Infinity): Promise<SearchSource> {
  const content = state.contents[contentKey];
  if (!content) throw new Error('Search source disappeared');
  const result: SearchSource = {contentKey, version, coordinate: content.inlineKind === 'standoff' ? 'cell' : 'utf16', runs: []};
  if (content.inlineKind !== 'standoff') { const text = String(content.payload.text ?? ''); if(text.length > maxUnits) throw new Error('Native text exceeds the bounded search budget'); result.runs.push({text}); }
  else {
    let text = '', used = 0, boundaries: number[] = [0];
    for (let index = 0; index < content.inlineContent.length; index++) {
      if (index && index % 2048 === 0) { await new Promise(resolve => setTimeout(resolve, 0)); signal?.throwIfAborted(); }
      const cell = state.contents[state.placements[content.inlineContent[index]]?.contentKey];
      if (cell?.viewType === 'text-cell') {
        const part = String(cell.payload.text ?? ''); used += part.length; if(used > maxUnits) throw new Error('Native text exceeds the bounded search budget');
        boundaries[text.length] = index;
        for (let i = 1; i < part.length; i++) boundaries[text.length + i] = -1;
        text += part; boundaries[text.length] = index + 1;
      } else { result.runs.push({text, boundaries}); text = ''; boundaries = [index + 1]; }
    }
    result.runs.push({text, boundaries});
  }
  signal?.throwIfAborted(); return result;
}
