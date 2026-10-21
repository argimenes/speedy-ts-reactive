// @vitest-environment jsdom
import {afterEach,describe,it,expect,vi} from 'vitest';
import {candidate,setup,settle} from './proof-support';
const stops:Array<()=>void>=[];
afterEach(()=>{stops.splice(0).reverse().forEach(stop=>stop());vi.restoreAllMocks();vi.unstubAllGlobals();document.body.replaceChildren();localStorage.clear();});
async function start(){vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'isolated proof'}),{status:503})));const f=await setup();stops.push(()=>f.dispose());return f;}
describe('Reconstruction assessment: primitives, not a product handover',()=>{
 it('opens the same canonical unsaved content without Save, canonical writes or duplicate resources',async()=>{
  const f=await start(),s=f.source,n=f.text(s);f.editor.commands.replaceInlineRange(n.key,0,0,'Unsaved ');
  const revision=f.editor.repository.state.revision,contents=Object.keys(f.editor.repository.state.contents),requests=vi.mocked(fetch).mock.calls.length;
  const c=candidate(f);stops.push(c.dispose);await settle();
  expect(c.session.id).not.toBe(s.id);expect(c.session.projection.viewId).not.toBe(s.projection.viewId);
  expect(f.text(c.session).contentKey).toBe(n.contentKey);expect(f.editor.mounts.get(f.text(c.session).key)!.captureText!()).toContain('Unsaved');
  expect(f.editor.repository.state.revision).toBe(revision);expect(Object.keys(f.editor.repository.state.contents)).toEqual(contents);expect(vi.mocked(fetch).mock.calls.length).toBe(requests);
  f.editor.repository.undo();expect(f.editor.mounts.get(f.text(c.session).key)!.captureText!()).not.toContain('Unsaved');expect(s.current()).toBe(true);
 });
 it('shows initial attachment is not replacement: two sessions remain and original slot/Return identity is not inherited',async()=>{
  const f=await start(),store=f.workspace.documentSessions!,sourceLease=store.transfers.current(f.source)!;
  const c=candidate(f);stops.push(c.dispose);await settle();
  expect(store.size).toBe(2);expect(store.transfers.current(f.source)).toBe(sourceLease);
  expect(store.transfers.atOrigin(c.session)).toBe(true);expect(store.transfers.hasTransferredSessions()).toBe(false);
  // A naive adapter would bypass the moved-topology persistence guard.
  expect(()=>store.transfers.assertPersistable()).not.toThrow();
  await expect(store.transfers.transfer(c.session,sourceLease)).rejects.toThrow('occupied');
  expect(f.source.current()).toBe(true);expect(c.session.current()).toBe(true);
 });
 it('disposes an aborted candidate exactly once while retaining the source editor and subscriptions',async()=>{
  const f=await start(),store=f.workspace.documentSessions!,mount=f.editor.mounts.get(f.text(f.source).key),dispose=vi.spyOn(f.editor,'disposeView');
  const c=candidate(f);c.dispose();c.dispose();await settle();
  expect(dispose).toHaveBeenCalledTimes(1);expect(c.session.current()).toBe(false);expect(store.size).toBe(1);expect(f.source.current()).toBe(true);expect(f.editor.mounts.get(f.text(f.source).key)).toBe(mount);
 });
 it('cleans up a failed renderer without retiring the original session',async()=>{
  const f=await start(),store=f.workspace.documentSessions!,dispose=vi.spyOn(f.editor,'disposeView');
  expect(()=>store.mount({ownerKey:'failed',slotKey:'failed',windowId:'failed',placement:f.source.projection.node(f.source.rootKey)!.placementKey,coordinates:f.source.host.coordinates},()=>{throw Error('renderer failed');})).toThrow('renderer failed');
  expect(store.size).toBe(1);expect(dispose).toHaveBeenCalledTimes(1);expect(f.source.current()).toBe(true);
 });
 it('does not coordinate source closure with a separate candidate using current primitives',async()=>{
  const f=await start(),c=candidate(f);stops.push(c.dispose);
  await f.editor.closeView(f.source.host.windowId);await settle();
  expect(f.source.current()).toBe(false);expect(c.session.current()).toBe(true);
  expect(f.workspace.documentSessions!.transfers.current(c.session)!.port.windowId).toBe(c.id);
 });
 it('does not leak candidate sessions after three bounded preparation/abort cycles',async()=>{
  const f=await start(),store=f.workspace.documentSessions!,before=store.transfers.diagnostics(),views=f.editor.projections.size;
  for(let i=0;i<3;i++){const c=candidate(f);c.dispose();await settle();}
  expect(store.size).toBe(1);expect(f.editor.projections.size).toBe(views);expect(store.transfers.diagnostics()).toEqual(before);
 });
});
