/** Presentation suffixes share the native Document codec; workspaces stay distinct. */
// Browsing admits every JSON filename. Content validation belongs to Open.
export const isDocumentName = name => typeof name === 'string' && (/\.json$/i.test(name) || isNativeDocumentName(name));
export const isNativeDocumentName = name => typeof name === 'string' && /\.(ink|phosphor|mutable\.json)$/.test(name);
export const isDerivedMarkdownName = name => typeof name === 'string' && /\.(ink|phosphor)\.md$/.test(name);
export const isWorkspaceName = name => typeof name === 'string' && /\.(desktop|canvas|world)$/.test(name);
export const nativeDocumentStem = name => name.replace(/\.(ink|phosphor|mutable\.json)$/, '');
export function markdownProjectionName(name) {
  if (!isNativeDocumentName(name)) throw Error('Expected a native Document filename');
  return name.endsWith('.mutable.json') ? name.replace(/\.mutable\.json$/, '.md') : name + '.md';
}
