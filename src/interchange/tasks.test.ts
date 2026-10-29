import { expect, it } from 'vitest';
import { importMarkdown } from './markdown-import';
import { importSemanticHtml } from './html-import';
import { parseClipboardHtml } from './html-ast';
import { exportFragment } from './export-plan';
import { fragmentText, serializeSelection } from './serializer';
import { ReactiveEditor } from '../reactive-editor/editor';
const states = (f: ReturnType<typeof importMarkdown>) => f.fragment!.blocks.filter(b => typeof b.data.checked === 'boolean').map(b => b.data.checked);
it('imports Markdown task states, nested tasks and compound paragraphs without converting code or escaped prefixes', () => {
  const f = importMarkdown('- [ ] Open\n- [x] Done\n- [X] Also done\n  - [ ] Child\n\n  Details\n- ordinary\n- ` [x] ` literal\n- \\[x] escaped');
  expect(states(f)).toEqual([false, true, false, true]);
  expect(fragmentText(f.fragment!)).toContain('Open'); expect(fragmentText(f.fragment!)).toContain('[x] escaped');
  expect(f.fragment!.blocks.filter(b => b.data.checked !== undefined).every(b => b.type === 'container-block')).toBe(true);
});
it('extracts only a leading HTML checkbox as inert state', () => {
  const f = importSemanticHtml(parseClipboardHtml('<ul><li><input type="checkbox" checked onclick="evil()">Done<script>evil()</script></li><li><p><input type="checkbox">Open</p><p>Detail</p></li><li>Not a task<input type="checkbox" checked></li></ul>').tree);
  expect(states(f)).toEqual([true, false]); expect(JSON.stringify(f.fragment)).not.toContain('evil'); expect(f.notice).toContain('Active HTML');
});
it.each(['markdown', 'html'] as const)('round trips mixed native and legacy tasks through %s with checked state and annotations', format => {
  const editor = new ReactiveEditor({ type: 'document-block', children: [{ type: 'indented-list-block', children: [
    { id: 'direct', type: 'standoff-editor-block', checked: false, text: 'Open', standoffProperties: [{ type: 'style/bold', start: 0, end: 3 }] },
    { type: 'checkbox-block', checked: true, children: [{ type: 'standoff-editor-block', text: 'Legacy' }] },
    { type: 'container-block', checked: true, metadata: { htmlListItem: {} }, children: [{ type: 'standoff-editor-block', text: 'Compound' }, { type: 'standoff-editor-block', text: 'Detail' }] },
    { type: 'standoff-editor-block', text: 'Ordinary' },
  ] }, { type: 'standoff-editor-block', checked: true, text: 'Standalone' }] });
  try {
    const fragment = serializeSelection(editor.repository.readState(), [{ placementKey: editor.repository.state.rootPlacementKey }]);
    const output = exportFragment(fragment, format);
    expect(output.text).not.toContain('[checkbox-block]');
    const imported = format === 'markdown' ? importMarkdown(output.text) : importSemanticHtml(parseClipboardHtml(output.text).tree);
    expect(states(imported)).toEqual([false, true, true, true]);
    expect(fragmentText(imported.fragment!)).toContain('Detail');
    expect(imported.fragment!.blocks.some(b => b.inline?.properties.some(p => p.type === 'style/bold'))).toBe(true);
  } finally { editor.dispose(); }
});
