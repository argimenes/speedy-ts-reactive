import { expect, it, vi } from 'vitest';
import { inspectUri, passiveVideo, playerUrl, videoFragment, urlFragment } from './uri';
import { materializeFragment } from './materialize';
import { exportFragment } from './export-plan';
import { prepareInterchange } from './operations';
it('classifies locally and builds only fixed official player URLs',()=>{
 const fetch=vi.spyOn(globalThis,'fetch');
 for(const url of ['https://youtu.be/M7lc1UVf-VE','https://www.youtube.com/watch?v=M7lc1UVf-VE','https://www.youtube.com/embed/M7lc1UVf-VE'])expect(playerUrl(inspectUri(url).video!)).toBe('https://www.youtube-nocookie.com/embed/M7lc1UVf-VE?autoplay=0');
 expect(playerUrl(inspectUri('https://vimeo.com/76979871').video!)).toBe('https://player.vimeo.com/video/76979871?autoplay=0&dnt=1');
 expect(inspectUri('https://example.org/source.md').format).toBe('markdown');expect(inspectUri('http://example.org').acquirable).toBe(false);
 expect(urlFragment('https://unknown.example/path').blocks[0].inline!.properties[0].type).toBe('reference/url');expect(fetch).not.toHaveBeenCalled();fetch.mockRestore();
});
it('never turns spoofed, credentialed, duplicate, or arbitrary-query links into players',()=>{
 for(const url of ['https://youtube.com.attacker.test/watch?v=M7lc1UVf-VE','https://youtu.be/M7lc1UVf-VE?autoplay=1','https://www.youtube.com/watch?v=M7lc1UVf-VE&v=M7lc1UVf-VE','https://youtube.com/redirect?v=M7lc1UVf-VE','http://vimeo.com/76979871','https://vimeo.com/76979871?h=secret','https://player.vimeo.com/video/../76979871','https://vimeo.com/0','https://youtube.com/watch?v=../../evil','https://vimeo.com/76979871#fragment'])expect(inspectUri(url).video,url).toBeUndefined();
 for(const url of ['javascript:alert(1)','file:///a','https://user:pw@youtube.com/watch?v=M7lc1UVf-VE','https://youtube.com\\@evil.test/'])expect(()=>inspectUri(url)).toThrow();
});
it('validates native descriptors and keeps invalid/unknown versions inert on materialization',()=>{
 const v=inspectUri('https://vimeo.com/76979871').video!,f=videoFragment(v),native=materializeFragment(f),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];expect(root.viewType).toBe('mutable/video-block');
 f.blocks[0].data.video={...v,canonicalUrl:'https://evil.test'};expect(passiveVideo(f.blocks[0].data.video)).toBeUndefined();const rejected=materializeFragment(f);expect(rejected.state.contents[rejected.state.placements[rejected.roots[0]].contentKey].viewType).toBe('mutable/opaque-block');
 expect(passiveVideo({...v,version:2})).toBeUndefined();
});
it('semantic/offline projection contains only a provider link and no iframe/poster/player',()=>{
 const f=videoFragment(inspectUri('https://vimeo.com/76979871').video!);
 for(const format of ['html','markdown','text'] as const){const result=exportFragment(f,format);expect(result.text).toContain('https://vimeo.com/76979871');expect(result.text).not.toMatch(/iframe|player.vimeo|img/);}
});
it('reuses semantic adapters with response-relative links and separately consented image descriptors',async()=>{
 const resource={source:'<base href="https://evil.test/"><p><a href="next">next</a><img src="photo.png"></p>',url:'https://example.org/folder/page',format:'html' as const,mediaType:'text/html',byteHash:'a'.repeat(64)};
 const result=await prepareInterchange({kind:'linked-text',resource,mode:'native'});expect(result.fragment.blocks[0].inline!.properties[0].target).toEqual({kind:'url',url:'https://example.org/folder/next'});expect(result.fragment.assets[0].source).toEqual({kind:'remote',url:'https://example.org/folder/photo.png'});
 const source=await prepareInterchange({kind:'linked-text',resource,mode:'link'});expect(source.fragment.blocks[0].data.text).toBe(resource.source);expect((source.fragment.blocks[0].data.metadata as any).sourceLink.url).toBe(resource.url);
});
