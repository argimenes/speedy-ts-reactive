// @vitest-environment jsdom
import {afterEach, expect, it, vi} from 'vitest';
import {ReactiveEditor} from '../reactive-editor/editor';
import {nativeDocumentSession} from './native-session';
const editors: ReactiveEditor[] = [];
afterEach(() => { for (const editor of editors.splice(0)) editor.dispose(); vi.unstubAllGlobals(); });
function session() {
  const editor = new ReactiveEditor({id:crypto.randomUUID(),type:'workspace-block',children:[]});
  editors.push(editor); return nativeDocumentSession(editor);
}
const listing = {root:'.',documents:[],folders:['notes'],complete:true};
const success = () => new Response(JSON.stringify({Success:true,Data:listing}));
it.each(['json','html'])('loads through legacy discovery when the browse endpoint returns a %s 404, and remembers the fallback', async format => {
  const fetch = vi.fn(async (url: string) => url.endsWith('/browse')
    ? new Response(format === 'json' ? JSON.stringify({Success:false,Error:'This service is unavailable in the current Cavern.'}) : '<html>Cannot POST /api/native/vault/browse</html>',{status:404})
    : success());
  vi.stubGlobal('fetch',fetch); const service = session();
  for (const mode of ['cached','reconcile','verify'] as const) expect(await service.browseVault('.',mode)).toEqual(listing);
  expect(fetch.mock.calls.map(([url])=>url)).toEqual(['/api/native/vault/browse',...Array(3).fill('/api/native/vault/discover')]);
});
it('uses the cache endpoint when supported',async()=>{
  const fetch = vi.fn(async(_url: string)=>success()); vi.stubGlobal('fetch',fetch);
  expect(await session().browseVault('.','cached')).toEqual(listing);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toBe('/api/native/vault/browse');
});
it.each([403,409,500,503])('does not hide a %s failure with a fallback scan',async status=>{
  const fetch = vi.fn(async()=>new Response(JSON.stringify({Success:false,Error:'Storage unavailable'}),{status}));
  vi.stubGlobal('fetch',fetch);
  await expect(session().browseVault('.','cached')).rejects.toMatchObject({status});
  expect(fetch).toHaveBeenCalledTimes(1);
});
it('does not start a fallback scan after cancellation',async()=>{
  const controller = new AbortController();
  const fetch = vi.fn(async()=>{controller.abort();return new Response('{}',{status:404});});vi.stubGlobal('fetch',fetch);
  await expect(session().browseVault('.','cached',controller.signal)).rejects.toBeTruthy();
  expect(fetch).toHaveBeenCalledTimes(1);
});
