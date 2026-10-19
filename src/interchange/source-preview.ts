import {markdownTree} from './markdown-import';
import {compileHtmlPreview,compilePreviewTree} from './html-source-preview';
import type {SourceFormat} from './source-block';
export {boundedCss,previewCsp} from './html-source-preview';
/** Shared bounded preview renderer; Markdown parsing stays outside HTML-only hosts. */
export function compileSourcePreview(source:string,format:SourceFormat){if(format==='html')return compileHtmlPreview(source);const parsed=markdownTree(source);return compilePreviewTree(parsed.tree,parsed.warnings);}
