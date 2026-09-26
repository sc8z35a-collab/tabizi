'use strict';
/*
 * Verdant Wilds — cinematic HDR post-processing for the FLAGSHIP preset.
 *
 * Pipeline (all linear, half-float):
 *   1. Scene  -> 4x MSAA HDR render target with a resolved depth texture.
 *   2. Bloom  -> Karis-averaged soft-knee prefilter, 6-level 13-tap downsample
 *                chain and additive 9-tap tent upsample (energy conserving).
 *   3. Shafts -> sky/depth occlusion mask around the projected sun, then a
 *                64-tap radial blur at quarter resolution (real occlusion by
 *                terrain, trees, buildings and the airship).
 *   4. Final  -> depth-based sun in-scattering haze, exposure, ACES filmic
 *                tone mapping, colour grading, vignette, film grain, dithering
 *                and linear -> sRGB output.
 *
 * Built only from Three.js 0.158 core classes, no extra downloads.
 */
window.VerdantPostFX = function createPostFX(T, renderer) {
  const gl = renderer.getContext();
  const webgl2 = renderer.capabilities.isWebGL2;
  const halfFloatOK = webgl2 || !!renderer.extensions.get('EXT_color_buffer_half_float');
  const supported = webgl2 && halfFloatOK;
  const maxSamples = webgl2 ? Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0) : 0;
  const LEVELS = 6;

  const rtOptions = { type: T.HalfFloatType, format: T.RGBAFormat, depthBuffer: false, stencilBuffer: false,
    minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false };
  let sceneRT = null, mips = [], shaftA = null, shaftB = null, width = 0, height = 0;

  const quadCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new T.Scene();
  const quad = new T.Mesh(new T.PlaneGeometry(2, 2), null);
  quad.frustumCulled = false; quadScene.add(quad);

  const vertexShader = 'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}';
  const pass = (fragmentShader, uniforms, extra = {}) => new T.ShaderMaterial({
    vertexShader, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false, ...extra });

  // 13-tap "Call of Duty" downsample. The first pass applies a soft-knee
  // threshold and a Karis average so single bright pixels never flicker.
  const downMat = pass(`precision highp float;varying vec2 vUv;uniform sampler2D tSrc;uniform vec2 uTexel;uniform float uFirst;uniform float uThreshold;uniform float uKnee;
    vec3 pre(vec3 c){float br=max(c.r,max(c.g,c.b));float soft=clamp(br-uThreshold+uKnee,0.,2.*uKnee);soft=soft*soft/(4.*uKnee+1e-4);float w=max(soft,br-uThreshold)/max(br,1e-4);return c*w;}
    float karis(vec3 c){return 1./(1.+dot(c,vec3(.2126,.7152,.0722))*.25);}
    vec3 s(vec2 o){return min(texture2D(tSrc,vUv+o*uTexel).rgb,vec3(64.));}
    void main(){
      vec3 a=s(vec2(-2,2)),b=s(vec2(0,2)),c=s(vec2(2,2)),d=s(vec2(-2,0)),e=s(vec2(0)),f=s(vec2(2,0)),g=s(vec2(-2,-2)),h=s(vec2(0,-2)),i=s(vec2(2,-2)),j=s(vec2(-1,1)),k=s(vec2(1,1)),l=s(vec2(-1,-1)),m=s(vec2(1,-1));
      vec3 g0=(j+k+l+m)*.25,g1=(a+b+d+e)*.25,g2=(b+c+e+f)*.25,g3=(d+e+g+h)*.25,g4=(e+f+h+i)*.25;
      vec3 col;
      if(uFirst>.5){g0=pre(g0);g1=pre(g1);g2=pre(g2);g3=pre(g3);g4=pre(g4);
        float w0=karis(g0)*.5,w1=karis(g1)*.125,w2=karis(g2)*.125,w3=karis(g3)*.125,w4=karis(g4)*.125;
        col=(g0*w0+g1*w1+g2*w2+g3*w3+g4*w4)/(w0+w1+w2+w3+w4);
      }else col=g0*.5+(g1+g2+g3+g4)*.125;
      gl_FragColor=vec4(col,1.);}`,
  { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uFirst: { value: 0 }, uThreshold: { value: 1 }, uKnee: { value: .6 } });

  // 3x3 tent upsample, additively blended onto the next larger mip.
  const upMat = pass(`precision highp float;varying vec2 vUv;uniform sampler2D tSrc;uniform vec2 uTexel;uniform float uRadius;uniform float uWeight;
    void main(){vec2 o=uTexel*uRadius;vec3 c=texture2D(tSrc,vUv).rgb*4.;
      c+=(texture2D(tSrc,vUv+vec2(o.x,0.)).rgb+texture2D(tSrc,vUv-vec2(o.x,0.)).rgb+texture2D(tSrc,vUv+vec2(0.,o.y)).rgb+texture2D(tSrc,vUv-vec2(0.,o.y)).rgb)*2.;
      c+=texture2D(tSrc,vUv+o).rgb+texture2D(tSrc,vUv-o).rgb+texture2D(tSrc,vUv+vec2(o.x,-o.y)).rgb+texture2D(tSrc,vUv+vec2(-o.x,o.y)).rgb;
      gl_FragColor=vec4(c/16.*uWeight,1.);}`,
  { tSrc: { value: null }, uTexel: { value: new T.Vector2() }, uRadius: { value: 1 }, uWeight: { value: 1 } },
  { blending: T.CustomBlending, blendEquation: T.AddEquation, blendSrc: T.OneFactor, blendDst: T.OneFactor, transparent: true });

  // Sun-shaft source: only unoccluded sky near the sun contributes.
  const shaftMaskMat = pass(`precision highp float;varying vec2 vUv;uniform sampler2D tColor;uniform sampler2D tDepth;uniform vec2 uSun;uniform float uAspect;
    void main(){float d=texture2D(tDepth,vUv).x;float sky=step(.99995,d);vec3 c=texture2D(tColor,vUv).rgb;
      vec2 v=(vUv-uSun)*vec2(uAspect,1.);float fall=exp(-dot(v,v)*14.);
      float l=dot(min(c,vec3(8.)),vec3(.2126,.7152,.0722));gl_FragColor=vec4(vec3(sky*fall*max(l-.55,0.)*1.6),1.);}`,
  { tColor: { value: null }, tDepth: { value: null }, uSun: { value: new T.Vector2(.5, .5) }, uAspect: { value: 1 } });

  const shaftBlurMat = pass(`precision highp float;varying vec2 vUv;uniform sampler2D tSrc;uniform vec2 uSun;uniform float uLength;uniform float uNoise;
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){vec2 delta=(vUv-uSun)*uLength/64.;vec2 uv=vUv-delta*h(gl_FragCoord.xy+uNoise);float decay=1.,sum=0.,acc=0.;
      for(int i=0;i<64;i++){acc+=texture2D(tSrc,uv).r*decay;sum+=decay;decay*=.972;uv-=delta;}
      gl_FragColor=vec4(vec3(acc/sum),1.);}`,
  { tSrc: { value: null }, uSun: { value: new T.Vector2() }, uLength: { value: .9 }, uNoise: { value: 0 } });

  const finalMat = pass(`precision highp float;varying vec2 vUv;
    uniform sampler2D tScene;uniform sampler2D tDepth;uniform sampler2D tBloom;uniform sampler2D tShaft;
    uniform float uExposure;uniform float uBloom;uniform float uShaft;uniform float uHaze;uniform float uTime;uniform float uVignette;uniform float uGrain;uniform float uSaturation;uniform float uContrast;uniform float uStorm;uniform float uWarm;
    uniform vec3 uSunColor;uniform vec3 uSunDir;uniform mat4 uInvProj;uniform mat4 uCamWorld;uniform float uNear;uniform float uFar;
    vec3 RRTAndODTFit(vec3 v){vec3 a=v*(v+.0245786)-.000090537;vec3 b=v*(.983729*v+.4329510)+.238081;return a/b;}
    vec3 aces(vec3 c){const mat3 i=mat3(vec3(.59719,.07600,.02840),vec3(.35458,.90834,.13383),vec3(.04823,.01566,.83777));const mat3 o=mat3(vec3(1.60475,-.10208,-.00327),vec3(-.53108,1.10813,-.07276),vec3(-.07367,-.00605,1.07602));
      c*=uExposure/.6;c=i*c;c=RRTAndODTFit(c);c=o*c;return clamp(c,0.,1.);}
    vec3 toSRGB(vec3 c){return mix(c*12.92,1.055*pow(c,vec3(1./2.4))-.055,step(.0031308,c));}
    float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
    void main(){
      vec3 col=texture2D(tScene,vUv).rgb;float d=texture2D(tDepth,vUv).x;
      vec4 ray=uInvProj*vec4(vUv*2.-1.,1.,1.);vec3 dir=normalize((uCamWorld*vec4(ray.xyz/ray.w,0.)).xyz);
      if(d<.99995){float z=d*2.-1.;float dist=2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));
        float mie=pow(max(dot(dir,uSunDir),0.),8.);float haze=(1.-exp(-dist*.00042))*uHaze;
        col+=uSunColor*haze*(.006+mie*.10)*(1.-uStorm*.85);}
      col+=texture2D(tBloom,vUv).rgb*uBloom;
      col+=uSunColor*texture2D(tShaft,vUv).r*uShaft*(1.-uStorm*.9);
      col=aces(col);
      float luma=dot(col,vec3(.2126,.7152,.0722));
      col=mix(vec3(luma),col,uSaturation);
      col=mix(col,col*col*(3.-2.*col),uContrast);
      vec3 shadowTint=mix(vec3(.97,1.,1.04),vec3(.96,.99,1.05),uWarm);vec3 lightTint=mix(vec3(1.03,1.01,.97),vec3(1.06,1.,.92),uWarm);
      col*=mix(shadowTint,lightTint,smoothstep(.15,.85,luma));
      vec2 v=vUv-.5;v.x*=1.25;col*=1.-uVignette*smoothstep(.25,.85,length(v));
      col=clamp(col,0.,1.);col=toSRGB(col);
      col+=(h(vUv*1731.+uTime)-.5)*uGrain;
      col+=(h(gl_FragCoord.xy+fract(uTime))-.5)/255.;
      gl_FragColor=vec4(col,1.);}`,
  { tScene: { value: null }, tDepth: { value: null }, tBloom: { value: null }, tShaft: { value: null },
    uExposure: { value: 1.13 }, uBloom: { value: .045 }, uShaft: { value: .5 }, uHaze: { value: 1 }, uTime: { value: 0 },
    uVignette: { value: .24 }, uGrain: { value: .018 }, uSaturation: { value: 1.1 }, uContrast: { value: .14 }, uStorm: { value: 0 }, uWarm: { value: .3 },
    uSunColor: { value: new T.Color(1, .86, .62) }, uSunDir: { value: new T.Vector3(0, 1, 0) },
    uInvProj: { value: new T.Matrix4() }, uCamWorld: { value: new T.Matrix4() }, uNear: { value: .15 }, uFar: { value: 3600 } });

  function makeRT(w, h) { const rt = new T.WebGLRenderTarget(Math.max(1, w), Math.max(1, h), rtOptions); rt.texture.generateMipmaps = false; return rt; }
  function dispose() {
    if (sceneRT) { sceneRT.depthTexture && sceneRT.depthTexture.dispose(); sceneRT.dispose(); }
    mips.forEach(m => m.dispose()); shaftA && shaftA.dispose(); shaftB && shaftB.dispose();
    sceneRT = null; mips = []; shaftA = shaftB = null; width = height = 0;
  }
  function setSize(w, h) {
    w = Math.max(1, Math.floor(w)); h = Math.max(1, Math.floor(h));
    if (w === width && h === height && sceneRT) return;
    dispose(); width = w; height = h;
    const depthTexture = new T.DepthTexture(w, h, T.UnsignedIntType);
    depthTexture.minFilter = depthTexture.magFilter = T.NearestFilter;
    sceneRT = new T.WebGLRenderTarget(w, h, { type: T.HalfFloatType, format: T.RGBAFormat, depthBuffer: true, stencilBuffer: false,
      samples: maxSamples, depthTexture, minFilter: T.LinearFilter, magFilter: T.LinearFilter, generateMipmaps: false });
    let mw = w, mh = h;
    for (let i = 0; i < LEVELS; i++) { mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); mips.push(makeRT(mw, mh)); }
    shaftA = makeRT(w >> 2, h >> 2); shaftB = makeRT(w >> 2, h >> 2);
  }
  function blit(material, target) { quad.material = material; renderer.setRenderTarget(target); renderer.render(quadScene, quadCamera); }

  const bufferSize = new T.Vector2(), sunWorld = new T.Vector3(), sunNDC = new T.Vector3(), camDir = new T.Vector3();
  const state = { enabled: false, frames: 0, samples: maxSamples, sunVisible: 0, bloom: finalMat.uniforms.uBloom.value };
  let time = 0;

  /** Renders the frame. `p` supplies world lighting that changes every frame. */
  function render(scene, camera, p = {}) {
    if (window.verdantPostFXOverrides) p = Object.assign({}, p, window.verdantPostFXOverrides);
    if (!sceneRT) { renderer.getDrawingBufferSize(bufferSize); setSize(bufferSize.x, bufferSize.y); }
    time = (time + (p.dt || .016)) % 1000;
    const prevTarget = renderer.getRenderTarget(), prevAutoClear = renderer.autoClear;
    renderer.setRenderTarget(sceneRT); renderer.clear(true, true, false); renderer.render(scene, camera);
    renderer.autoClear = true;

    // Bloom chain.
    let src = sceneRT.texture, sw = width, sh = height;
    downMat.uniforms.uThreshold.value = p.threshold ?? 1.0;
    for (let i = 0; i < LEVELS; i++) {
      downMat.uniforms.tSrc.value = src; downMat.uniforms.uTexel.value.set(1 / sw, 1 / sh); downMat.uniforms.uFirst.value = i === 0 ? 1 : 0;
      blit(downMat, mips[i]); src = mips[i].texture; sw = mips[i].width; sh = mips[i].height;
    }
    renderer.autoClear = false;
    for (let i = LEVELS - 1; i > 0; i--) {
      upMat.uniforms.tSrc.value = mips[i].texture; upMat.uniforms.uTexel.value.set(1 / mips[i].width, 1 / mips[i].height);
      upMat.uniforms.uWeight.value = i === LEVELS - 1 ? 1 : .85; blit(upMat, mips[i - 1]);
    }
    renderer.autoClear = true;

    // Sun shafts: project the sun direction onto the screen.
    const sunDir = p.sunDir || finalMat.uniforms.uSunDir.value;
    sunWorld.copy(camera.position).addScaledVector(sunDir, 2000);
    camera.getWorldDirection(camDir);
    const facing = camDir.dot(sunDir);
    sunNDC.copy(sunWorld).project(camera);
    const sx = sunNDC.x * .5 + .5, sy = sunNDC.y * .5 + .5;
    const edge = Math.max(0, 1 - Math.max(Math.abs(sunNDC.x), Math.abs(sunNDC.y)) * .55);
    const visible = facing > 0 ? Math.min(1, facing * 3) * Math.min(1, edge * 1.6) : 0;
    state.sunVisible = visible;
    let shaftStrength = 0;
    if (visible > .001) {
      shaftMaskMat.uniforms.tColor.value = sceneRT.texture; shaftMaskMat.uniforms.tDepth.value = sceneRT.depthTexture;
      shaftMaskMat.uniforms.uSun.value.set(sx, sy); shaftMaskMat.uniforms.uAspect.value = width / height;
      blit(shaftMaskMat, shaftA);
      shaftBlurMat.uniforms.tSrc.value = shaftA.texture; shaftBlurMat.uniforms.uSun.value.set(sx, sy); shaftBlurMat.uniforms.uNoise.value = time;
      blit(shaftBlurMat, shaftB);
      shaftStrength = (p.shafts ?? .55) * visible;
    }

    const u = finalMat.uniforms;
    u.tScene.value = sceneRT.texture; u.tDepth.value = sceneRT.depthTexture; u.tBloom.value = mips[0].texture;
    u.tShaft.value = shaftStrength > 0 ? shaftB.texture : mips[LEVELS - 1].texture;
    u.uShaft.value = shaftStrength; u.uExposure.value = p.exposure ?? renderer.toneMappingExposure;
    u.uBloom.value = p.bloom ?? state.bloom; u.uStorm.value = p.storm || 0; u.uWarm.value = p.warm ?? .3; u.uTime.value = time;
    u.uHaze.value = p.haze ?? 1; if (p.sunColor) u.uSunColor.value.copy(p.sunColor); u.uSunDir.value.copy(sunDir);
    u.uInvProj.value.copy(camera.projectionMatrixInverse); u.uCamWorld.value.copy(camera.matrixWorld); u.uNear.value = camera.near; u.uFar.value = camera.far;
    u.uVignette.value = p.vignette ?? .24; u.uGrain.value = p.grain ?? .018;
    blit(finalMat, prevTarget);
    renderer.autoClear = prevAutoClear;
    state.frames++;
  }
  return {
    supported, render, setSize, dispose,
    get enabled() { return state.enabled; }, set enabled(v) { state.enabled = !!v && supported; if (!state.enabled) dispose(); },
    info: () => ({ supported, enabled: state.enabled, msaa: maxSamples, bloomLevels: LEVELS, width, height, frames: state.frames,
      sunVisible: +state.sunVisible.toFixed(3), halfFloat: halfFloatOK }),
  };
};
