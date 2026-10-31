import type { ReactiveEditor } from '../reactive-editor/editor';
import { isTabRow, tabOrientation, type TabOrientation } from '../block-tree/tab-orientation';
import type { BlockMenuItem } from './block-menu-types';

export { registerTabCommands as registerTabOrientationCommands } from './tab-commands';
export function tabOrientationMenu(editor: ReactiveEditor, rowKey: string | undefined): BlockMenuItem[] {
  if (!editor.features.verticalTabs || !rowKey || !isTabRow(editor.node(rowKey)?.viewType)) return [];
  const current = tabOrientation(editor.node(rowKey)?.payload.metadata);
  return [{ label: 'Tab orientation', children: (['horizontal', 'vertical'] as TabOrientation[]).map(orientation => ({
    label: orientation === 'horizontal' ? 'Horizontal' : 'Vertical',
    disabled: orientation === current || !editor.commandRegistry.canExecute(`tabs.orientation.${orientation}`, { targetKey: rowKey, args: undefined }),
    run: () => editor.commandRegistry.execute(`tabs.orientation.${orientation}`, { targetKey: rowKey, args: undefined }),
  })) }];
}
