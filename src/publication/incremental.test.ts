import {it,expect} from 'vitest';
import {canonical,projectionPolicy,publicManifest} from './incremental';import {defaultReader} from './reader';
it('canonicalizes dependencies, retains disclosure/version inputs and excludes CSS-only tokens',()=>{
 expect(canonical({z:1,a:{b:2,a:1},missing:undefined})).toBe(canonical({a:{a:1,b:2},z:1}));
 const profile={title:'Site',route:'index.html',images:false,outboundLinks:false,includeMargins:false,reader:defaultReader()};
 expect(projectionPolicy(profile)).toEqual(projectionPolicy({...profile,reader:{...profile.reader,theme:{...profile.reader.theme,name:'compact',size:22}}}));
 for(const changed of [{...profile,images:true},{...profile,route:'new.html'},{...profile,reader:{...profile.reader,search:false}}])expect(canonical(projectionPolicy(changed))).not.toBe(canonical(projectionPolicy(profile)));
 expect(projectionPolicy(profile).generator).toBeTruthy();
});
it('canonical public manifests exclude staging identities and preserve the explicit entry page',()=>{
 expect(publicManifest([{path:'z.html',hash:'z',size:1,mediaType:'text/html',unit:'doc-0999',entry:true},{path:'a.html',hash:'a',size:2,mediaType:'text/html',unit:'doc-0000'}])).toEqual([{path:'a.html',hash:'a',size:2,mediaType:'text/html'},{path:'z.html',hash:'z',size:1,mediaType:'text/html',entry:true}]);
});
