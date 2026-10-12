import * as T from 'three';

/** A small neutral lighting environment: two broad openings, no imagery or
 * baked surface shading. PMREM is generated once, never in the pointer path. */
export function createCrystalEnvironment(renderer:T.WebGLRenderer) {
  const width=256,height=128,data=new Float32Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=x/width,v=y/height;
    const opening=12*Math.exp(-(((u-.51)/.05)**2)-(((v-.65)/.12)**2));
    const secondary=3*Math.exp(-(((u-.73)/.025)**2)-(((v-.4)/.12)**2));
    const sky=.12+.22*(1-v),light=sky+opening+secondary,i=(y*width+x)*4;
    const warm=1.5*Math.exp(-(((u-.25)/.09)**2)-(((v-.8)/.10)**2));
    data.set([light*.98+warm,light+warm*.55,light*1.025+warm*.2,1],i);
  }
  const source=new T.DataTexture(data,width,height,T.RGBAFormat,T.FloatType);
  source.mapping=T.EquirectangularReflectionMapping;source.needsUpdate=true;
  const generator=new T.PMREMGenerator(renderer),target=generator.fromEquirectangular(source);
  generator.dispose();source.dispose();return target;
}

/** Linear thickness/roughness data. The perimeter has little optical path;
 * the central body absorbs light over a longer path. */
export function createCrystalMaps() {
  const width=64,height=128,thickness=new Uint8Array(width*height*4),roughness=new Uint8Array(thickness.length);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=(x/(width-1)-.5)*2,v=y/(height-1);
    const depth=Math.max(.2,1-Math.hypot(u,(v-.5)*2)*.6);
    const grain=Math.sin(x*12.9898+y*78.233)*43758.5453%1;
    const cloud=Math.sin(x*.13+y*.06)*Math.sin(y*.14)*.035;
    const i=(y*width+x)*4,r=Math.round((.88+cloud+grain*.025)*255);
    thickness.set([255,depth*255,255,255],i);roughness.set([r,r,r,255],i);
  }
  const map=(data:Uint8Array)=>{const t=new T.DataTexture(data,width,height,T.RGBAFormat);t.colorSpace=T.NoColorSpace;t.magFilter=T.LinearFilter;t.minFilter=T.LinearFilter;t.needsUpdate=true;return t;};
  return {thickness:map(thickness),roughness:map(roughness)};
}

/** Only the diode receives this small optical halo; ordinary highlights are
 * never post-processed. It is oriented with the lens and occluded on the back. */
export function createDiodeHalo() {
  return new T.ShaderMaterial({
    transparent:true,depthWrite:false,blending:T.AdditiveBlending,
    uniforms:{colour:{value:new T.Color()},strength:{value:0}},
    vertexShader:'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader:`varying vec2 vUv; uniform vec3 colour; uniform float strength;
      void main(){float r=length(vUv-.5)*2.;float halo=exp(-pow((r-.60)*10.,2.))*(1.-smoothstep(.8,1.,r));
      gl_FragColor=vec4(colour,halo*strength*.38);}`,
  });
}
