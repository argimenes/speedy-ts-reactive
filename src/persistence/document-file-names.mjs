/** Presentation suffixes share the native Document codec; workspaces stay distinct. */
export const isNativeDocumentName = name => typeof name === 'string' && (name.endsWith('.ink') || name.endsWith('.mutable.json'));
export const isDerivedMarkdownName = name => typeof name === 'string' && name.endsWith('.ink.md');
export const isWorkspaceName = name => typeof name === 'string' && /\.(desktop|canvas|world)$/.test(name);
export const nativeDocumentStem = name => name.replace(/\.(ink|mutable\.json)$/, '');
export function markdownProjectionName(name) {
  if (!isNativeDocumentName(name)) throw Error('Expected a native Document filename');
  return name.endsWith('.ink') ? name + '.md' : name.replace(/\.mutable\.json$/, '.md');
}
