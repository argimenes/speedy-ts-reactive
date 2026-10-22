import {createEffect,onCleanup} from 'solid-js';
import type {ReactiveEditor} from '../../reactive-editor/editor';
import type {CompletionSession} from './session';

const HIGHLIGHT_NAME='mutable-scry-source';

/** Presentation only: resolve two endpoints, without changing editing DOM,
 * native selection, authored content or measuring layout. The browser paints
 * the range through wrapping, scrolling and zoom. Each owner releases only its
 * own range, allowing independent editor sessions to coexist. */
export function retainSourceHighlight(editor:ReactiveEditor,session:CompletionSession) {
 if(typeof CSS==='undefined'||!CSS.highlights||typeof Highlight==='undefined')return;
 let previous:Range|undefined;
 const clear=()=>{
  const highlight=CSS.highlights.get(HIGHLIGHT_NAME);
  if(previous&&highlight){
   highlight.delete(previous);
   if(!highlight.size)CSS.highlights.delete(HIGHLIGHT_NAME);
  }
  previous=undefined;
 };
 createEffect(()=>{
  session.state.revision;clear();const source=session.source;if(!source.brackets)return;
  const mount=editor.mounts.get(source.nodeKey);if(!mount?.root.isConnected)return;
  const start=mount.inlineBoundary?.(source.start),end=mount.inlineBoundary?.(source.end);
  if(!start||!end)return;
  const range=mount.root.ownerDocument.createRange();
  range.setStart(start.node,start.offset);range.setEnd(end.node,end.offset);
  const highlight=CSS.highlights.get(HIGHLIGHT_NAME)??new Highlight();
  highlight.add(range);CSS.highlights.set(HIGHLIGHT_NAME,highlight);previous=range;
 });
 onCleanup(clear);
}
