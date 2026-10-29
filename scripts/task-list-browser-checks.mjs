// Runs inside the existing real-Flint list qualification harness. In-memory only.
export async function qualifyTasks({ evaluate, send, sessionId, check, key, resourceId }) {
  await evaluate("proof.parent=n=>proof.view.parentOf(n.key);proof.taskAnchor=()=>{let n=proof.editor.nodeForPlacementInView(proof.text.placementKey,proof.view.viewId);while(proof.parent(n)&&!['document-block','page-block','fixed-size-page-block'].includes(proof.parent(n).viewType))n=proof.parent(n);return n.key;}");
  const type = async text => { for (const character of text) await send('Input.insertText', { text: character }, sessionId); };
  for (const suffix of ['[ ] ', '[x] ', '[X] ']) {
    await evaluate(`proof.taskPlacement=proof.editor.commands.insert({id:crypto.randomUUID(),type:'standoff-editor-block',text:'-',standoffProperties:[{id:crypto.randomUUID(),type:'style/bold',start:0,end:0}]},{kind:'after',anchorKey:proof.taskAnchor()});proof.task=()=>proof.editor.nodeForPlacementInView(proof.taskPlacement,proof.view.viewId);proof.taskMount=()=>proof.editor.mounts.get(proof.task().key);proof.taskText=()=>proof.task().inlineContent.map(k=>proof.editor.node(k).payload.text).join('');proof.taskMount().focus();proof.taskMount().restoreInlineSelection({anchor:1,head:1});`);
    await type(' ' + suffix);
    check(`Real typed ${suffix} creates a task with the caret at its start`, await evaluate(`proof.task().payload.checked===${suffix[1] !== ' '}&&proof.taskText()===''&&proof.taskMount().captureInlineSelection().anchor===0`));
    await key('z', 4);
    check(`Single Undo restores exact literal - ${suffix}`, await evaluate(`proof.taskText()===${JSON.stringify('- ' + suffix)}&&proof.parent(proof.task()).viewType!=='indented-list-block'&&proof.task().payload.standoffProperties[0].end===0`));
    await key('z', 12);
    check(`Redo restores ${suffix} completion`, await evaluate(`proof.task().payload.checked===${suffix[1] !== ' '}`));
  }
  await evaluate('proof.taskMount().focus();proof.taskMount().restoreInlineSelection({anchor:0,head:0})');
  await type('Task text');
  const click = async expression => {
    const point = await evaluate(`(()=>{const e=${expression};e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, sessionId);
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }, sessionId);
  };
  await click("proof.taskMount().root.querySelector('.reactive-standoff-flow')");
  check('Real click on task text does not toggle completion', await evaluate('proof.task().payload.checked===true'));
  await evaluate('proof.selection=proof.taskMount().captureInlineSelection()');
  await click("proof.taskMount().root.closest('.reactive-task-row').querySelector('.reactive-task-checkbox')");
  check('Checkbox mouse activation preserves text focus and selection', await evaluate('proof.task().payload.checked===false&&document.activeElement===proof.taskMount().focusElement&&JSON.stringify(proof.selection)===JSON.stringify(proof.taskMount().captureInlineSelection())'));
  await evaluate("proof.taskMount().root.closest('.reactive-task-row').querySelector('.reactive-task-checkbox').focus()");
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, sessionId);
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 }, sessionId);
  check('Native Space toggles the focused checkbox', await evaluate('proof.task().payload.checked===true'));
  await evaluate('proof.taskMount().focus();proof.taskMount().restoreInlineSelection({anchor:9,head:9})');
  await key('Enter'); await type('Child'); await key('Tab');
  check('Enter creates an unchecked task and Tab nests it', await evaluate("proof.editor.node(proof.editor.focus.state.focusedKey).payload.checked===false&&proof.parent(proof.parent(proof.editor.node(proof.editor.focus.state.focusedKey))).placementKey===proof.taskPlacement"));
  check('Checkbox disclosure and Block handle hit areas do not overlap', await evaluate(`(()=>{
    const root=proof.taskMount().root, controls=[root.querySelector(':scope > .reactive-task-checkbox'),root.querySelector(':scope > .block-selection-handle'),root.closest('[data-list-item]').querySelector(':scope > button')];
    const rects=controls.map(c=>c.getBoundingClientRect());return rects.every((a,i)=>rects.every((b,j)=>i===j||a.right<=b.left||b.right<=a.left||a.bottom<=b.top||b.bottom<=a.top));
  })()`));
  await click("proof.taskMount().root.closest('[data-list-item]').querySelector(':scope > button')");
  check('Disclosure collapses descendants without toggling completion', await evaluate('proof.task().payload.checked===true&&proof.task().payload.metadata.listCollapsed===true'));
  await evaluate('proof.taskMount().focus();proof.taskMount().restoreInlineSelection({anchor:0,head:0})'); await key('Tab', 8);
  check('Outermost outdent retains a standalone task and its collapsed descendants', await evaluate("proof.parent(proof.task()).viewType!=='indented-list-block'&&proof.task().payload.checked===true&&proof.taskMount().root.closest('.reactive-task-row').querySelector('.reactive-task-disclosure')!==null&&proof.taskMount().root.querySelector('.reactive-list[hidden]')!==null"));
  check('Native serialization and reload retain task completion and collapsed descendants', await evaluate(`(async()=>{
    const {captureNative,nativeText,admitNative}=await import('/src/persistence/native-resource.ts');
    const {ReactiveEditor}=await import('/src/reactive-editor/editor.ts');
    const {registerCoreViews}=await import('/src/rendering/register-core-views.ts');
    const {ReactiveTreeView}=await import('/src/rendering/reactive-tree-view.tsx');
    const bytes=new TextEncoder().encode(nativeText(captureNative(proof.editor.repository.readState(),${JSON.stringify(resourceId)})));
    const loaded=new ReactiveEditor({type:'workspace-object-bank-block',children:[]});
    const state=loaded.repository.readState(),admitted=admitNative(loaded.repository,bytes,state.placements[state.rootPlacementKey].contentKey);
    registerCoreViews(loaded);const view=loaded.createView('task-reload',admitted.placementKey),host=document.body.appendChild(document.createElement('div'));
    const dispose=proof.render(()=>proof.createComponent(ReactiveTreeView,{editor:loaded,projection:view}),host);
    try {
      const item=Object.values(view.state.nodes).find(n=>n.payload.id===proof.task().payload.id),root=loaded.mounts.get(item.key).root;
      return item.payload.checked===true&&item.payload.metadata.listCollapsed===true&&root.querySelector('.reactive-task-checkbox').checked&&root.querySelector('.reactive-list[hidden]')!==null;
    } finally {dispose();loaded.dispose();host.remove();}
  })()`));
}
