/** Presentation suffixes share the native Document codec; workspaces stay distinct. */
// Browsing admits every JSON filename. Content validation belongs to Open.
export const isDocumentName = name => typeof name === 'string' && (/\.json$/i.test(name) || isNativeDocumentName(name));
export const isNativeDocumentName = name => typeof name === 'string' && /\.(ink|phosphor|mutable\.json)$/.test(name);
export const isDerivedMarkdownName = name => typeof name === 'string' && /\.(ink|phosphor)\.md$/.test(name);
export const isWorkspaceName = name => typeof name === 'string' && /\.(desktop|canvas|world)$/.test(name);
export const nativeDocumentStem = name => name.replace(/\.(ink|phosphor|mutable\.json)$/, '');
/** First manual Save only. A matching title is never evidence of resource identity. */
export function availableNativeFilename(name, occupied) {
  const suffix = isNativeDocumentName(name) ? name.slice(nativeDocumentStem(name).length) : '.ink';
  const stem = (isNativeDocumentName(name) ? nativeDocumentStem(name) : name)
    .normalize('NFC').replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^[.\s]+|[.\s]+$/g, '').slice(0, 120) || 'Document';
  const used = new Set(occupied.map(value => value.normalize('NFC').toLowerCase()));
  let filename = stem + suffix;
  for (let number = 2; used.has(filename.toLowerCase()); number++) filename = `${stem} (${number})${suffix}`;
  return filename;
}
export function markdownProjectionName(name) {
  if (!isNativeDocumentName(name)) throw Error('Expected a native Document filename');
  return name.endsWith('.mutable.json') ? name.replace(/\.mutable\.json$/, '.md') : name + '.md';
}
