import {createSignal,Show} from 'solid-js';
import {DocumentDialog} from '../demo/document-dialog';

export type SaveCollisionChoice = {action:'overwrite'} | {action:'rename';filename:string} | {action:'cancel'};
export function DocumentSaveCollision(props:{filename:string;suggested:string;overwriteUnavailable?:string;choose:(choice:SaveCollisionChoice)=>void}) {
  const [name,setName]=createSignal(props.suggested);
  const valid=()=>!!name().trim()&&!/[\\/\x00-\x1f]/.test(name())&&!name().startsWith('.')&&/\.(ink|phosphor|mutable\.json)$/.test(name());
  return <DocumentDialog title="File already exists" compact onClose={()=>props.choose({action:'cancel'})}>
    <div style={{padding:'1rem'}}>
      <p>“{props.filename}” already exists. Do you want to overwrite it with this Document?</p>
      <p>Overwriting replaces the saved file. This Document keeps its own identity; references to the replaced Document are not redirected.</p>
      <Show when={props.overwriteUnavailable}><p role="status">{props.overwriteUnavailable}</p></Show>
      <label>Different filename <input aria-label="Different filename" value={name()} onInput={e=>setName(e.currentTarget.value)}/></label>
      <div style={{display:'flex',gap:'0.5rem','flex-wrap':'wrap','margin-top':'1rem'}}>
        <button data-autofocus onClick={()=>props.choose({action:'cancel'})}>Cancel</button>
        <button disabled={!valid()} onClick={()=>props.choose({action:'rename',filename:name().trim()})}>Save with a different name</button>
        <button disabled={!!props.overwriteUnavailable} onClick={()=>props.choose({action:'overwrite'})}>Overwrite</button>
      </div>
    </div>
  </DocumentDialog>;
}
