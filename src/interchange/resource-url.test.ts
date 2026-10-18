import { describe, expect, it } from 'vitest';
import { resourceBlock, resourceUrl } from './resource-url';
import { materializeFragment } from './materialize';

describe('explicit resource URL classification', () => {
  it.each([
    ['https://youtu.be/M7lc1UVf-VE?si=share', 'youtube'],
    ['https://www.youtube.com/watch?v=M7lc1UVf-VE&t=12s', 'youtube'],
    ['https://www.youtube.com/live/M7lc1UVf-VE', 'youtube'],
    ['https://vimeo.com/76979871?share=copy', 'vimeo'],
    ['https://player.vimeo.com/video/76979871', 'vimeo'],
    ['https://example.org/photo.JPG?size=large', 'image'],
    ['https://example.org/a.png#history', 'image'],
    ['https://example.org/page', 'iframe'],
    ['https://youtube.com.attacker.test/watch?v=M7lc1UVf-VE', 'iframe'],
    ['https://youtube.com/watch?v=M7lc1UVf-VE&v=abcdefghijk', 'iframe'],
    ['https://vimeo.com/76979871?h=secret', 'iframe'],
  ])('classifies %s as %s without probing', (url, kind) => expect(resourceUrl(url)?.kind).toBe(kind));
  it.each(['ordinary text','https://a.test/ https://b.test/','javascript:alert(1)','file:///tmp/a','https://user:secret@example.org/'])('does not activate %s', value => expect(resourceUrl(value)).toBeUndefined());
  it('retains the original URL independently of canonical provider playback', () => {
    const url='https://youtu.be/M7lc1UVf-VE?si=original&t=25';
    const {native}=resourceBlock(url),root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
    expect(root.viewType).toBe('youtube-player-block');expect(root.payload.sourceUrl).toBe(url);
    expect(root.payload.video).toMatchObject({provider:'youtube',canonicalUrl:'https://www.youtube.com/watch?v=M7lc1UVf-VE'});
  });
  it('uses bounded iframe defaults without activating ordinary clipboard carriers', () => {
    const {fragment,native}=resourceBlock('https://example.org/page?q=original');
    const root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
    expect(root.payload.metadata).toMatchObject({height:600,resourceEmbed:true});
    const imported=materializeFragment(fragment);
    expect(imported.state.contents[imported.state.placements[imported.roots[0]].contentKey].viewType).toBe('mutable/opaque-block');
  });
  it('requires an admitted PNG/JPEG and keeps portable original identity on the ImageBlock', () => {
    expect(()=>resourceBlock('https://example.org/photo.png')).toThrow('validated');
    const ref={kind:'managed' as const,cavernId:'c',assetId:'sha256:'+'a'.repeat(64)};
    const {native}=resourceBlock('https://example.org/photo.png?from=source',{cavernId:ref.cavernId,assetId:ref.assetId,mediaType:'image/png',byteLength:100,width:3,height:2});
    const root=native.state.contents[native.state.placements[native.roots[0]].contentKey];
    expect(root.viewType).toBe('image-block');expect(root.payload.asset).toEqual(ref);
    expect(root.payload.sourceUrl).toBe('https://example.org/photo.png?from=source');
  });
});
