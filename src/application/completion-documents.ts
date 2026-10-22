import type { ReactiveEditor } from '../reactive-editor/editor';
import type { VaultKnowledge } from './vault-knowledge';
const contexts = new WeakMap<ReactiveEditor, Set<{ accepts(key:string):boolean; knowledge:VaultKnowledge }>>();
export function registerCompletionDocuments(editor:ReactiveEditor, context:{accepts(key:string):boolean;knowledge:VaultKnowledge}) {
  let set=contexts.get(editor); if(!set)contexts.set(editor,set=new Set()); set.add(context); return ()=>{set!.delete(context);};
}
export function completionDocuments(editor:ReactiveEditor,key:string) {
  const matches=[...contexts.get(editor)??[]].filter(c=>c.accepts(key));
  if(matches.length!==1)throw Error('Native Document lookup requires an active saved Flint Document in a selected Cavern.');
  return matches[0].knowledge;
}
