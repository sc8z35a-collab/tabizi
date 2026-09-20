'use strict';
/* The Verdant Wilds — a fully procedural, client-side Three.js world. */
(() => {
  const $ = id => document.getElementById(id);
  if (!window.THREE) { $('loading').style.display = 'none'; $('error-message').hidden = false; return; }
  const T = THREE;
  const testing = new URLSearchParams(location.search).get('selftest') === '1';
  const objectReview = testing && new URLSearchParams(location.search).get('review') === 'objects';
  // Installed after the expansion is built; the initial grass pass remains safe.
  let sceneryClearance = () => false;
  let renderer;
  try {
    renderer = new T.WebGLRenderer({ canvas: $('world'), antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch (e) {
    $('loading').style.display = 'none'; $('error-message').hidden = false; return;
  }
  renderer.setPixelRatio(1); // Actual preset is applied by resize() before the first frame.
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.13;
  const scene = new T.Scene();
  scene.background = new T.Color('#9dbbc0');
  scene.fog = new T.FogExp2('#b2c6b5', 0.00065);
  const camera = new T.PerspectiveCamera(58, innerWidth / innerHeight, 0.15, 3600);
  const clock = new T.Clock();
  const dummy = new T.Object3D();
  let seed = 4713;
  function rand() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const mix = (a,b,t) => a + (b-a)*t;
  const clamp = (x,a,b) => Math.max(a, Math.min(b,x));
  function hash(x,z) { const a = Math.sin(x*127.1+z*311.7)*43758.5453; return a-Math.floor(a); }
  function noise(x,z) {
    const ix = Math.floor(x), iz = Math.floor(z); let fx = x-ix, fz = z-iz;
    fx = fx*fx*(3-2*fx); fz = fz*fz*(3-2*fz);
    return mix(mix(hash(ix,iz),hash(ix+1,iz),fx),mix(hash(ix,iz+1),hash(ix+1,iz+1),fx),fz);
  }
  function fbm(x,z) { return noise(x,z)*.57 + noise(x*2.03,z*2.03)*.27 + noise(x*4.07,z*4.07)*.11 + noise(x*8.1,z*8.1)*.05; }
  function height(x,z) {
    let h = (fbm(x*.0045+40,z*.0045+20)-.44)*91;
    h += Math.sin(x*.013 + z*.006)*6 + Math.sin(z*.016)*3;
    h += (noise(x*.065,z*.065)-.5)*.85;
    const lake = Math.hypot((x-158)/1.22,z+258);
    const basin = 1 - smooth(80,145,lake);
    h = mix(h,-3.5,basin);
    return h;
  }
  function smooth(a,b,x) { const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t); }
  function lakeDistance(x,z) { return Math.hypot((x-158)/1.22,z+258); }
  const sun = new T.DirectionalLight('#fff1ca', 3.05);
  sun.position.set(-240,310,-300);sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);sun.shadow.camera.left=-72;sun.shadow.camera.right=72;sun.shadow.camera.top=72;sun.shadow.camera.bottom=-72;sun.shadow.camera.near=1;sun.shadow.camera.far=700;sun.shadow.normalBias=.055;sun.shadow.bias=-.0001;
  scene.add(sun, sun.target);
  const hemi = new T.HemisphereLight('#dce9ec','#6a713b',2.15);scene.add(hemi);
  const skyUniforms = { uTime:{value:0}, uWarm:{value:.28}, uStorm:{value:0}, uSun:{value:new T.Vector3(-.46,.24,-.75).normalize()} };
  const sky = new T.Mesh(new T.SphereGeometry(3000,48,24), new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,uniforms:skyUniforms,
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`precision highp float;
      varying vec3 vDir;uniform float uTime;uniform float uWarm;uniform float uStorm;uniform vec3 uSun;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      float fb(vec2 p){float v=0.;float a=.5;for(int i=0;i<5;i++){v+=n(p)*a;p=p*2.03+vec2(4.7,7.1);a*=.5;}return v;}
      void main(){vec3 d=normalize(vDir);float y=max(d.y,0.);vec3 zenith=mix(vec3(.21,.43,.56),vec3(.31,.43,.51),uWarm);vec3 horizon=mix(vec3(.79,.86,.80),vec3(.95,.81,.61),uWarm);vec3 col=mix(horizon,zenith,pow(y,.45));float sd=max(dot(d,uSun),0.);col+=vec3(1.,.81,.44)*pow(sd,12.)*.22;col+=vec3(1.,.91,.67)*pow(sd,520.)*1.9;
      vec2 p=d.xz/(max(d.y,.05)+.18)*2.1+vec2(uTime*.0015,0.);float cloud=fb(p);float mask=smoothstep(.48,.76,cloud)*smoothstep(.005,.14,d.y);vec3 cc=mix(vec3(.67,.75,.73),vec3(1.,.97,.86),smoothstep(.45,.8,cloud));col=mix(col,cc,mask*.92);vec3 stormSky=mix(vec3(.31,.37,.39),vec3(.095,.14,.17),pow(y,.4));stormSky+=fb(p*1.4)*.09;col=mix(col,stormSky,uStorm*.90);gl_FragColor=vec4(col,1.);}`
  }));scene.add(sky);

  // A textured, vertex-coloured continuous landscape, not an image backdrop.
  const groundCanvas=document.createElement('canvas');groundCanvas.width=groundCanvas.height=512;
  const gc=groundCanvas.getContext('2d');const image=gc.createImageData(512,512);
  for(let i=0;i<image.data.length;i+=4){const v=rand()*28;image.data[i]=110+v;image.data[i+1]=122+v;image.data[i+2]=63+v*.65;image.data[i+3]=255;}gc.putImageData(image,0,0);
  for(let i=0;i<16000;i++){gc.strokeStyle=rand()>.5?'#bbb88835':'#4f652c35';const x=rand()*512,y=rand()*512;gc.beginPath();gc.moveTo(x,y);gc.lineTo(x+rand()*3,y+3+rand()*6);gc.stroke();}
  const groundTexture=new T.CanvasTexture(groundCanvas);groundTexture.wrapS=groundTexture.wrapT=T.RepeatWrapping;groundTexture.repeat.set(190,190);groundTexture.colorSpace=T.SRGBColorSpace;groundTexture.anisotropy=renderer.capabilities.getMaxAnisotropy();
  const groundGeo=new T.PlaneGeometry(3200,3200,480,480);groundGeo.rotateX(-Math.PI/2);
  const gp=groundGeo.attributes.position;const gColors=[];const c=new T.Color();
  for(let i=0;i<gp.count;i++){const x=gp.getX(i),z=gp.getZ(i);gp.setY(i,height(x,z));const n=fbm(x*.012+1,z*.012);c.setHSL(.20+n*.035,.27+n*.13,.43+n*.2);const ld=lakeDistance(x,z);if(ld<109)c.lerp(new T.Color('#c5be8f'),1-smooth(88,109,ld));gColors.push(c.r,c.g,c.b);}
  groundGeo.setAttribute('color',new T.Float32BufferAttribute(gColors,3));groundGeo.computeVertexNormals();
  // Reuse the same height vertices at a coarser index stride; no terrain rebuild on quality changes.
  const terrainIndices={1:groundGeo.index};
  for(const step of [2]){const ids=[];for(let y=0;y<480;y+=step)for(let x=0;x<480;x+=step){const a=y*481+x,b=(y+step)*481+x;ids.push(a,b,a+step,b,b+step,a+step);}terrainIndices[step]=new T.Uint32BufferAttribute(ids,1);}
  const ground=new T.Mesh(groundGeo,new T.MeshStandardMaterial({map:groundTexture,vertexColors:true,roughness:1}));ground.receiveShadow=true;scene.add(ground);

  // Distant ridgelines: three atmospheric layers, with exposed stone and snow caps.
  for(let layer=0;layer<3;layer++){
    const mg=new T.PlaneGeometry(6400,1100,200,38);mg.rotateX(-Math.PI/2);const p=mg.attributes.position,cols=[];
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),localZ=p.getZ(i),z=localZ-1230-layer*420;
      const ridge=Math.pow(Math.max(0,Math.sin((localZ+550)/1100*Math.PI)),1.2);
      const profile=115+noise(x*.0027+layer*5,layer+1)*430+noise(x*.008,layer*2)*100;
      const h=ridge*profile+(fbm(x*.014,z*.014)-.3)*ridge*100-25;
      p.setXYZ(i,x,h,z);
      c.set(layer===0?'#617766':layer===1?'#829595':'#a1afb1');
      const detail=noise(x*.023,z*.023);c.multiplyScalar(.7+detail*.55);
      if(h>315+noise(x*.019,z*.019)*85)c.lerp(new T.Color('#e5e6da'),smooth(320,470,h)*.9);
      cols.push(c.r,c.g,c.b);
    }
    mg.setAttribute('color',new T.Float32BufferAttribute(cols,3));mg.computeVertexNormals();const m=new T.Mesh(mg,new T.MeshStandardMaterial({vertexColors:true,roughness:1,flatShading:false}));scene.add(m);
  }
  // A still lake nestled into the terrain. Fine normal-like wave highlights are shader generated.
  const waterUniforms={uTime:{value:0},uSun:skyUniforms.uSun,uStorm:skyUniforms.uStorm};
  const lake=new T.Mesh(new T.CircleGeometry(100,128),new T.ShaderMaterial({
    transparent:true,depthWrite:false,uniforms:waterUniforms,
    vertexShader:`varying vec3 vWater;varying vec2 vLocal;
      void main(){vLocal=position.xy;vec4 world=modelMatrix*vec4(position,1.);vWater=world.xyz;gl_Position=projectionMatrix*viewMatrix*world;}`,
    fragmentShader:`precision highp float;
      varying vec3 vWater;varying vec2 vLocal;uniform float uTime;uniform vec3 uSun;uniform float uStorm;
      void main(){
        vec2 p=vWater.xz;
        float wx=cos(p.x*.75+p.y*.42+uTime*.9)*.055+cos(p.x*3.7-uTime*1.6)*.018;
        float wz=cos(p.y*.83-p.x*.3+uTime*.65)*.045+sin(p.y*4.1+uTime*1.3)*.014;
        vec3 n=normalize(vec3(wx,1.,wz)*(vec3(1.)+vec3(uStorm*1.4,0.,uStorm*1.4)));
        vec3 viewDir=normalize(cameraPosition-vWater);
        float fresnel=.04+.96*pow(1.-max(dot(n,viewDir),0.),5.);
        vec3 reflected=reflect(-viewDir,n);
        vec3 sky=mix(vec3(.62,.76,.78),vec3(.21,.42,.57),clamp(reflected.y,0.,1.));
        sky=mix(sky,vec3(.2,.29,.33),uStorm*.8);
        float sunGlint=pow(max(dot(n,normalize(viewDir+uSun)),0.),280.);
        float depth=smoothstep(83.,99.,length(vLocal));
        vec3 water=mix(vec3(.055,.21,.20),vec3(.27,.39,.27),depth);
        vec3 color=mix(water,sky,.25+fresnel*.65)+vec3(1.,.88,.61)*sunGlint*2.*(1.-uStorm*.8);
        float haze=1.-exp(-length(cameraPosition-vWater)*(.0008+uStorm*.002));
        color=mix(color,vec3(.56,.66,.65),haze);
        float edge=1.-smoothstep(95.,100.,length(vLocal));
        gl_FragColor=vec4(color,edge*.94);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  lake.rotation.x=-Math.PI/2;lake.scale.x=1.22;lake.position.set(158,-1.2,-258);scene.add(lake);

  // Wind-reactive instanced meadow; close vegetation follows the traveller.
  const grassGeo=new T.BufferGeometry();
  grassGeo.setAttribute('position',new T.Float32BufferAttribute([-.065,0,0,.065,0,0,-.048,.43,0,.048,.43,0,-.025,.8,.04,.025,.8,.04,0,1.15,.12],3));
  grassGeo.setAttribute('uv',new T.Float32BufferAttribute([0,0,1,0,0,.4,1,.4,0,.75,1,.75,.5,1],2));
  grassGeo.setIndex([0,1,2,1,3,2,2,3,4,3,5,4,4,5,6]);grassGeo.computeVertexNormals();
  const windUniform={value:0};
  const grassMat=new T.MeshStandardMaterial({color:'#b5bd71',side:T.DoubleSide,roughness:.95});
  grassMat.onBeforeCompile=shader=>{shader.uniforms.uWind=windUniform;shader.vertexShader='uniform float uWind;\nvarying float vBladeHeight;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
    vBladeHeight=position.y;
    vec3 ip=vec3(instanceMatrix[3]);
    float wind=sin(ip.x*.11+ip.z*.075+uWind*1.55)*.28+sin(ip.x*.39+uWind*2.8)*.09;
    transformed.x+=wind*pow(position.y,1.7);
    transformed.z+=cos(ip.z*.13+uWind*1.25)*.13*position.y*position.y;`);
    shader.fragmentShader='varying float vBladeHeight;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb *= mix(vec3(.47,.57,.33),vec3(1.11,1.08,.77),smoothstep(0.,1.05,vBladeHeight));');
  };
  const grassCount=98000;const grass=new T.InstancedMesh(grassGeo,grassMat,grassCount);grass.instanceMatrix.setUsage(T.DynamicDrawUsage);grass.frustumCulled=false;grass.receiveShadow=true;scene.add(grass);
  const grassOffsets=new Float32Array(grassCount*4);
  for(let i=0;i<grassCount;i++){const r=Math.pow(rand(),.63)*172,angle=rand()*Math.PI*2;grassOffsets[i*4]=Math.cos(angle)*r;grassOffsets[i*4+1]=Math.sin(angle)*r;grassOffsets[i*4+2]=rand()*Math.PI;grassOffsets[i*4+3]=.45+rand()*.83;const n=rand();c.setHSL(.185+n*.065,.35+n*.16,.39+n*.19);grass.setColorAt(i,c);}
  let grassCenterX=Infinity,grassCenterZ=Infinity,grassCursor=0,grassTarget=30000,grassPending=false;
  grass.count=0;
  function plantGrass(px,pz,immediate=false){
    const x=Math.round(px/35)*35,z=Math.round(pz/35)*35;
    if(Math.hypot(x-grassCenterX,z-grassCenterZ)>200)grass.count=0;
    grassCenterX=x;grassCenterZ=z;grassCursor=0;grassPending=true;
    if(immediate)updateGrass(grassTarget);
  }
  function updateGrass(budget=1500){
    if(!grassPending)return;
    const start=grassCursor,end=Math.min(grassTarget,start+budget);
    for(let i=start;i<end;i++){const x=grassOffsets[i*4]+grassCenterX,z=grassOffsets[i*4+1]+grassCenterZ,h=height(x,z);let s=grassOffsets[i*4+3];if(lakeDistance(x,z)<96||h< -1.4||sceneryClearance(x,z))s=0;
      const pathX=14*Math.sin(z*.019)-4;if(Math.abs(x-pathX)<1.8&&z<95&&z>-200)s*=.16;
      dummy.position.set(x,h-.05,z);dummy.rotation.set(0,grassOffsets[i*4+2],0);dummy.scale.set(s*.58,s*.72,s*.72);dummy.updateMatrix();grass.setMatrixAt(i,dummy.matrix);
    }
    const range=grass.instanceMatrix.updateRange;
    const lo=range.count<0?start*16:Math.min(range.offset,start*16),hi=range.count<0?end*16:Math.max(range.offset+range.count,end*16);
    range.offset=lo;range.count=hi-lo;grass.instanceMatrix.needsUpdate=true;
    grassCursor=end;grass.count=Math.min(grassTarget,Math.max(grass.count,end));grassPending=end<grassTarget;
  }

  // Wildflowers with stems, pale petals and warm centres.
  const flowers=new T.Group();scene.add(flowers);
  const flowerGeo=new T.IcosahedronGeometry(.115,0);const flowerMat=new T.MeshStandardMaterial({color:'#fff0c0',roughness:.85});
  const flowerHeads=new T.InstancedMesh(flowerGeo,flowerMat,2400);const stemMesh=new T.InstancedMesh(new T.CylinderGeometry(.012,.017,.6,3),new T.MeshStandardMaterial({color:'#6a7939'}),2400);
  for(let i=0;i<2400;i++){const x=(rand()-.5)*300,z=(rand()-.5)*300+25,h=height(x,z),s=.7+rand()*.7;dummy.position.set(x,h+.58*s,z);dummy.rotation.set(rand()*.5,rand()*6,0);dummy.scale.set(s,s*.5,s);if(h<0)dummy.scale.setScalar(0);dummy.updateMatrix();flowerHeads.setMatrixAt(i,dummy.matrix);c.set(rand()>.20?'#f3e7b5':'#adc3d4');flowerHeads.setColorAt(i,c);dummy.position.y=h+.28*s;dummy.scale.set(s,s,s);dummy.updateMatrix();stemMesh.setMatrixAt(i,dummy.matrix);}flowers.add(flowerHeads,stemMesh);

  // Wind-shaped woodland with irregular organic canopies.
  const crownGeo=new T.IcosahedronGeometry(1,2);const cp=crownGeo.attributes.position;
  for(let i=0;i<cp.count;i++){const x=cp.getX(i),y=cp.getY(i),z=cp.getZ(i),s=.82+noise(x*4.1+z*2,y*4.1)*.33;cp.setXYZ(i,x*s,y*s,z*s);}crownGeo.computeVertexNormals();
  const crownLite=new T.IcosahedronGeometry(1,1),lp=crownLite.attributes.position;
  for(let i=0;i<lp.count;i++){const x=lp.getX(i),y=lp.getY(i),z=lp.getZ(i),s=.82+noise(x*4.1+z*2,y*4.1)*.33;lp.setXYZ(i,x*s,y*s,z*s);}crownLite.computeVertexNormals();
  const treeCount=255;const crowns=new T.InstancedMesh(crownGeo,new T.MeshStandardMaterial({color:'#849554',roughness:1}),treeCount*7);
  const trunks=new T.InstancedMesh(new T.CylinderGeometry(.24,.43,1,7),new T.MeshStandardMaterial({color:'#665b43',roughness:1}),treeCount);
  crowns.castShadow=true;crowns.receiveShadow=true;trunks.castShadow=true;
  for(let i=0;i<treeCount;i++){
    let x,z;if(i<25){x=(i%2===0?-1:1)*(35+rand()*95);z=-20-rand()*330;}else{x=(rand()-.5)*1900;z=(rand()-.65)*1700;}
    if(lakeDistance(x,z)<125)x+=200;
    const h=height(x,z),s=5+rand()*8;
    dummy.position.set(x,h+s*.45,z);dummy.rotation.set(0,rand()*6,.035);dummy.scale.set(s*.16,s*.92,s*.16);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);
    for(let j=0;j<7;j++){const a=j*2.4;const r=j===6?0:s*.29;dummy.position.set(x+Math.cos(a)*r,h+s*(j===6?1.18:.83)+rand()*s*.13,z+Math.sin(a)*r);dummy.rotation.set(rand()*.7,rand()*6,rand()*.5);dummy.scale.set(s*(.32+rand()*.14),s*(.31+rand()*.19),s*(.32+rand()*.13));dummy.updateMatrix();crowns.setMatrixAt(i*7+j,dummy.matrix);c.setHSL(.21+rand()*.045,.26+rand()*.22,.23+rand()*.13);crowns.setColorAt(i*7+j,c);}
  }scene.add(crowns,trunks);
  const rockGeo=new T.DodecahedronGeometry(1,1);const rp=rockGeo.attributes.position;
  for(let i=0;i<rp.count;i++){const s=.8+rand()*.3;rp.setXYZ(i,rp.getX(i)*s,rp.getY(i)*s,rp.getZ(i)*s);}rockGeo.computeVertexNormals();
  const rocks=new T.InstancedMesh(rockGeo,new T.MeshStandardMaterial({color:'#8b9075',roughness:1,flatShading:true}),380);rocks.castShadow=true;rocks.receiveShadow=true;
  for(let i=0;i<380;i++){let x=(rand()-.5)*1600,z=(rand()-.65)*1500;const s=1+rand()*4;dummy.position.set(x,height(x,z)+s*.16,z);dummy.rotation.set(rand(),rand()*6,rand());dummy.scale.set(s,s*.55,s*.8);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);c.setHSL(.16,.09,.34+rand()*.22);rocks.setColorAt(i,c);}scene.add(rocks);

  const landmarks=[{id:'tower',name:'風渡りの古塔',x:-28,z:-178,r:14},{id:'lake',name:'空映しの湖',x:158,z:-139,r:19},{id:'stones',name:'はじまりの石環',x:-258,z:-346,r:17}];
  let saved={};try{saved=JSON.parse(localStorage.getItem('verdant-wilds-v1')||'{}');}catch(e){}
  if (!saved || typeof saved !== 'object' || testing) saved = {};
  const discovered=new Set(Array.isArray(saved.discovered)?saved.discovered.filter(id=>landmarks.some(l=>l.id===id)):[]);
  const stoneMat=new T.MeshStandardMaterial({color:'#a5a48c',roughness:.97});
  function box(w,h,d,mat,x,y,z,parent){const m=new T.Mesh(new T.BoxGeometry(w,h,d),mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  const tower=new T.Group();tower.position.set(landmarks[0].x,height(landmarks[0].x,landmarks[0].z),landmarks[0].z);scene.add(tower);
  const brickMats=['#a6a48d','#979c83','#b2af98','#8e977d'].map(color=>new T.MeshStandardMaterial({color,roughness:1}));
  // A broken stone gateway and the remnants of an old watchtower.
  for(let side=-1;side<=1;side+=2){for(let row=0;row<8;row++){box(1.5,.85,1.7,brickMats[row%4],side*2.35,row*.86+.43,0,tower);}box(2,.4,2.1,stoneMat,side*2.35,7.06,0,tower);}
  const arch=new T.Mesh(new T.TorusGeometry(2.35,.66,6,20,Math.PI),stoneMat);arch.position.set(0,6.5,0);arch.castShadow=true;tower.add(arch);
  for(let row=0;row<14;row++){for(let side=0;side<4;side++){if(row>10&&rand()>.58)continue;const a=side*Math.PI/2;const block=box(side%2?1.1:4.2,.77,side%2?4.2:1.1,brickMats[(row+side)%4],7+Math.sin(a)*2.1,row*.79+.39,-4+Math.cos(a)*2.1,tower);if(row>11)block.rotation.z=(rand()-.5)*.12;}}
  for(let i=0;i<16;i++){const b=box(1+rand(),.4+rand()*.6,.8+rand(),brickMats[i%4],(rand()-.5)*16,.2,(rand()-.5)*12,tower);b.rotation.set(rand()*.5,rand()*6,rand()*.3);}
  const bannerMat=new T.MeshStandardMaterial({color:'#b88a51',side:T.DoubleSide,roughness:1});const bannerGeo=new T.PlaneGeometry(1.4,3.5,6,12);const banner=new T.Mesh(bannerGeo,bannerMat);banner.position.set(4.5,8.1,-1.4);tower.add(banner);
  const circle=new T.Group();circle.position.set(-258,height(-258,-346),-346);scene.add(circle);
  for(let i=0;i<8;i++){const a=i/8*Math.PI*2,x=Math.cos(a)*9,z=Math.sin(a)*9,y=height(x-258,z-346)-circle.position.y;const s=3+rand()*2;const m=box(1.7,s,1.3,brickMats[i%4],x,y+s/2,z,circle);m.rotation.z=(rand()-.5)*.18;if(i%2===0)box(5,.8,1.5,stoneMat,Math.cos(a+.25)*8.5,y+s,z+1.7,circle);}
  const lakeShrine=new T.Group();lakeShrine.position.set(158,height(158,-139),-139);scene.add(lakeShrine);box(3,.5,3,stoneMat,0,.25,0,lakeShrine);box(.8,3,.8,stoneMat,0,1.9,0,lakeShrine);const shrineCap=new T.Mesh(new T.OctahedronGeometry(.85),new T.MeshStandardMaterial({color:'#d9c891',metalness:.45,roughness:.36}));shrineCap.position.y=3.8;lakeShrine.add(shrineCap);
  const glowCanvas=document.createElement('canvas');glowCanvas.width=glowCanvas.height=128;const glowCtx=glowCanvas.getContext('2d');const glow=glowCtx.createRadialGradient(64,64,0,64,64,64);glow.addColorStop(0,'rgba(255,242,190,1)');glow.addColorStop(.15,'rgba(255,227,147,.65)');glow.addColorStop(.4,'rgba(255,218,135,.15)');glow.addColorStop(1,'rgba(255,218,135,0)');glowCtx.fillStyle=glow;glowCtx.fillRect(0,0,128,128);const glowTex=new T.CanvasTexture(glowCanvas);
  landmarks.forEach(l=>{l.y=height(l.x,l.z);const g=new T.Group();g.position.set(l.x,l.y+5,l.z);const gem=new T.Mesh(new T.OctahedronGeometry(.44),new T.MeshStandardMaterial({color:'#ffe5a0',emissive:'#ebba5e',emissiveIntensity:1.4,metalness:.45,roughness:.2}));g.add(gem);const sprite=new T.Sprite(new T.SpriteMaterial({map:glowTex,transparent:true,depthWrite:false,blending:T.AdditiveBlending}));sprite.scale.set(5,5,1);g.add(sprite);l.glow=g;l.gem=gem;g.visible=!discovered.has(l.id);scene.add(g);});

  // A little traveller, with a hand-shaped cloak, leather pack, and animated limbs.
  const player=new T.Group();scene.add(player);
  const cloth=new T.MeshStandardMaterial({color:'#e4d9b7',roughness:1,side:T.DoubleSide});
  const dark=new T.MeshStandardMaterial({color:'#4a5145',roughness:1});const leather=new T.MeshStandardMaterial({color:'#745439',roughness:1});const red=new T.MeshStandardMaterial({color:'#ab5a3b',roughness:1,side:T.DoubleSide});
  const torso=new T.Mesh(new T.CylinderGeometry(.29,.39,.8,10),cloth);torso.position.y=1.24;torso.castShadow=true;player.add(torso);
  const capeGeo=new T.CylinderGeometry(.31,.69,1.14,14,8,true,Math.PI*.48,Math.PI*1.06);const cape=new T.Mesh(capeGeo,cloth);cape.position.set(0,1.09,.05);cape.rotation.y=0;cape.castShadow=true;player.add(cape);
  const head=new T.Mesh(new T.SphereGeometry(.245,16,12),new T.MeshStandardMaterial({color:'#c6a17d',roughness:1}));head.position.y=1.92;player.add(head);
  const hood=new T.Mesh(new T.SphereGeometry(.29,16,12,0,Math.PI*2,0,Math.PI*.64),cloth);hood.position.set(0,1.99,.055);hood.rotation.x=-.25;hood.castShadow=true;player.add(hood);
  const scarf=new T.Mesh(new T.TorusGeometry(.27,.09,6,14),red);scarf.rotation.x=Math.PI/2;scarf.position.y=1.7;player.add(scarf);
  const scarfTail=new T.Mesh(new T.PlaneGeometry(.19,.74,2,8),red);scarfTail.position.set(-.3,1.33,.37);scarfTail.rotation.z=-.2;player.add(scarfTail);
  const pack=box(.46,.52,.26,leather,0,1.29,.37,player);box(.38,.09,.29,cloth,0,1.6,.38,player);box(.055,.52,.02,dark,-.14,1.31,.515,player);box(.055,.52,.02,dark,.14,1.31,.515,player);
  const limbs=[];for(let i=0;i<2;i++){const limb=new T.Group();limb.position.set(i===0?-.18:.18,.79,0);const leg=new T.Mesh(new T.CylinderGeometry(.1,.115,.59,7),dark);leg.position.y=-.26;limb.add(leg);box(.22,.2,.34,leather,0,-.58,-.05,limb);player.add(limb);limbs.push(limb);}
  for(let i=0;i<2;i++){const arm=new T.Mesh(new T.CapsuleGeometry(.10,.49,4,8),cloth);arm.position.set(i===0?-.36:.36,1.22,0);arm.rotation.z=i===0?-.16:.16;player.add(arm);}
  player.traverse(o=>{if(o.isMesh)o.castShadow=true;});
  const state={x:0,z:62,y:0,yaw:0,pitch:.10,vy:0,jump:0,onGround:true,running:false,sensitivity:1,moving:0,walkTime:0};
  if(Number.isFinite(saved.x)&&Number.isFinite(saved.z)&&Math.abs(saved.x)<1400&&Math.abs(saved.z)<1400){state.x=saved.x;state.z=saved.z;}
  state.y=height(state.x,state.z);player.position.set(state.x,state.y,state.z);plantGrass(state.x,state.z,true);
  camera.position.set(state.x,state.y+5.7,state.z+10.3);camera.lookAt(state.x,state.y+2,state.z-13);

  // Input: independent pointers allow moving and looking at the same time.
  const keys=new Set();const joy={x:0,y:0,id:null};let lookPointer=null,lastLookX=0,lastLookY=0;let paused=false;
  const joystick=$('joystick'),knob=$('joystick-knob');
  function moveStick(e){const r=joystick.getBoundingClientRect(),max=r.width*.32;let x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;const len=Math.hypot(x,y);if(len>max){x*=max/len;y*=max/len;}joy.x=x/max;joy.y=y/max;knob.style.transform=`translate(${x}px,${y}px)`;}
  joystick.addEventListener('pointerdown',e=>{e.preventDefault();if(paused||expansion.dead||joy.id!==null)return;joy.id=e.pointerId;joystick.setPointerCapture(e.pointerId);moveStick(e);startAudioIfEnabled();});
  joystick.addEventListener('pointermove',e=>{if(e.pointerId===joy.id)moveStick(e);});
  function resetStick(){joy.id=null;joy.x=joy.y=0;knob.style.transform='';}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])joystick.addEventListener(type,e=>{if(e.pointerId===joy.id)resetStick();});
  $('world').addEventListener('pointerdown',e=>{if(paused||expansion.dead||lookPointer!==null)return;lookPointer=e.pointerId;lastLookX=e.clientX;lastLookY=e.clientY;$('world').setPointerCapture(e.pointerId);startAudioIfEnabled();});
  $('world').addEventListener('pointermove',e=>{if(e.pointerId!==lookPointer||paused)return;state.yaw-=(e.clientX-lastLookX)*.004*state.sensitivity;state.pitch=clamp(state.pitch+(e.clientY-lastLookY)*.003*state.sensitivity,expansion.airship?.aboard?-1.1:-.3,expansion.airship?.aboard?1.1:.85);lastLookX=e.clientX;lastLookY=e.clientY;});
  const endLook=()=>{lookPointer=null;};for(const type of ['pointerup','pointercancel','lostpointercapture'])$('world').addEventListener(type,e=>{if(e.pointerId===lookPointer)endLook();});
  window.addEventListener('keydown',e=>{if(paused||expansion.dead)return;if(e.code==='Space'&&e.target.closest?.('button,input,select'))return;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='Space'&&!e.repeat)jump();if(e.code==='KeyM')openDialog('map-dialog');});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();resetStick();endLook();});
  function jump(){if(expansion.airship?.aboard){if(!paused)expansion.airship.jump();return;}if(state.onGround&&!paused&&!expansion.mounted&&!expansion.dead){state.vy=7.4;state.onGround=false;}}
  $('jump-button').addEventListener('pointerdown',e=>{e.preventDefault();jump();startAudioIfEnabled();});$('jump-button').addEventListener('click',e=>{if(e.detail===0)jump();});
  $('run-button').addEventListener('click',()=>{if(paused||expansion.dead)return;state.running=!state.running;$('run-button').classList.toggle('active',state.running);$('run-button').setAttribute('aria-pressed',String(state.running));});
  let audioContext=null,audioGain=null,audioEnabled=false;
  function createAudio(){
    const AudioContext=window.AudioContext||window.webkitAudioContext;if(!AudioContext)return;
    audioContext=new AudioContext();audioGain=audioContext.createGain();audioGain.gain.value=0;audioGain.connect(audioContext.destination);
    const buf=audioContext.createBuffer(1,audioContext.sampleRate*6,audioContext.sampleRate);const data=buf.getChannelData(0);let last=0;for(let i=0;i<data.length;i++){last=(last+(Math.random()*2-1)*.023)/1.025;data[i]=last*3.4;}
    const wind=audioContext.createBufferSource();wind.buffer=buf;wind.loop=true;const filter=audioContext.createBiquadFilter();filter.type='lowpass';filter.frequency.value=780;wind.connect(filter);filter.connect(audioGain);wind.start();
    const bird=()=>{if(audioEnabled&&audioContext.state==='running'){const t=audioContext.currentTime;const osc=audioContext.createOscillator(),g=audioContext.createGain();osc.type='sine';osc.frequency.setValueAtTime(2100+Math.random()*600,t);osc.frequency.exponentialRampToValueAtTime(3400,t+.10);osc.frequency.exponentialRampToValueAtTime(2400,t+.23);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.025,t+.03);g.gain.exponentialRampToValueAtTime(.001,t+.3);osc.connect(g);g.connect(audioGain);osc.start(t);osc.stop(t+.32);}setTimeout(bird,3500+Math.random()*6500);};setTimeout(bird,2000);
  }
  // Short synthesized cues share the existing mute control; no audio downloads.
  let lastCueAt=0;
  function playCue(kind){
    if(!audioEnabled||!audioContext||audioContext.state!=='running')return;
    const t=audioContext.currentTime;if(t-lastCueAt<.035)return;lastCueAt=t;
    const notes={swing:[350,100,.12],charged:[150,700,.3],hit:[180,55,.12],hurt:[90,38,.25],dodge:[600,180,.15],perfect:[440,1100,.4],ready:[650,950,.13],pickup:[700,1250,.18],sense:[330,880,.6]};
    const [from,to,duration]=notes[kind]||notes.hit,osc=audioContext.createOscillator(),gain=audioContext.createGain();
    osc.type=kind==='hurt'?'triangle':'sine';osc.frequency.setValueAtTime(from,t);osc.frequency.exponentialRampToValueAtTime(to,t+duration);
    gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(.17,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);
    osc.connect(gain);gain.connect(audioGain);osc.start(t);osc.stop(t+duration+.02);osc.onended=()=>{osc.disconnect();gain.disconnect();};
  }
  function startAudioIfEnabled(){if(audioEnabled&&audioContext)audioContext.resume().catch(()=>{});}
  $('sound-button').addEventListener('click',()=>{if(!audioContext)createAudio();if(!audioContext)return;audioEnabled=!audioEnabled;audioContext.resume().catch(()=>{});audioGain.gain.setTargetAtTime(audioEnabled?.45:0,audioContext.currentTime,.4);$('sound-button').classList.toggle('muted',!audioEnabled);$('sound-button').title=audioEnabled?'環境音をオフ':'環境音をオン';$('sound-button').setAttribute('aria-pressed',String(audioEnabled));});
  $('fullscreen-button').addEventListener('click',async()=>{try{if(document.fullscreenElement){await document.exitFullscreen();}else{if(!document.documentElement.requestFullscreen){$('ambient-caption').textContent='このブラウザーでは全画面表示に対応していません。';return;}await document.documentElement.requestFullscreen();if(screen.orientation&&screen.orientation.lock)await screen.orientation.lock('landscape').catch(()=>{});}}catch(e){$('ambient-caption').textContent='スマホを横向きにしてお楽しみください。';}});
  function openDialog(id){if(expansion.dead)return;expansion.pauseInputs();keys.clear();resetStick();paused=true;$(id).showModal();if(id==='map-dialog')drawLargeMap();}
  $('controls-guide').addEventListener('click',()=>{$('settings-dialog').close();openDialog('guide-dialog');});
  $('settings-button').addEventListener('click',()=>openDialog('settings-dialog'));$('guide-button').addEventListener('click',()=>openDialog('guide-dialog'));$('map-button').addEventListener('click',()=>openDialog('map-dialog'));
  document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));document.querySelectorAll('dialog').forEach(d=>{d.addEventListener('close',()=>{paused=!!document.querySelector('dialog[open]');});d.addEventListener('click',e=>{if(d.id==='defeat-dialog')return;if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});});
  $('quality-select').addEventListener('change',()=>{autoScale=1;resetFrameWindow();resize();applyWorldQuality();});
  $('density-select').addEventListener('change',()=>expansion.setSceneryDensity(Number($('density-select').value)));
  $('sensitivity-slider').addEventListener('input',e=>state.sensitivity=Number(e.target.value));$('hud-toggle').addEventListener('change',e=>document.body.classList.toggle('clean-hud',!e.target.checked));$('detail-toggle').addEventListener('change',e=>document.body.classList.toggle('immersive',!e.target.checked));$('motion-toggle').checked=matchMedia('(prefers-reduced-motion: reduce)').matches;document.body.classList.toggle('reduced-motion',$('motion-toggle').checked);$('motion-toggle').addEventListener('change',e=>document.body.classList.toggle('reduced-motion',e.target.checked));$('dismiss-portrait').addEventListener('click',()=>$('portrait-hint').style.display='none');
  function applyTime(){
    const v=Number($('time-slider').value),storm=skyUniforms.uStorm.value;
    skyUniforms.uWarm.value=v*.75;sun.color.setHSL(.10-v*.045,.20+v*.30,.91);
    sun.intensity=(3.35-v*.8)*(1-storm*.79);sun.position.y=420-v*280;
    hemi.intensity=(2.35-v*.65)*(1-storm*.42);
    skyUniforms.uSun.value.set(-.46,.8-v*.65,-.75).normalize();
    const minutes=Math.round((10+v*10)*60);
    $('world-time').textContent=`${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;
    $('time-label').textContent=v<.35?'澄んだ昼':v<.75?'夕暮れ前':'黄金の夕暮れ';
    renderer.shadowMap.needsUpdate=true;
  }
  $('time-slider').addEventListener('input',applyTime);applyTime();
  const renderSize=new T.Vector2();
  let autoScale=1,frameSeconds=0,frameSamples=0,slowWindows=0,fastWindows=0,frameAverage=0;
  function resetFrameWindow(){frameSeconds=0;frameSamples=0;slowWindows=fastWindows=0;}
  function sampleFrame(seconds){
    if(Number($('quality-select').value)!==0||paused||document.hidden){resetFrameWindow();return;}
    if(!Number.isFinite(seconds)||seconds<=0||seconds>1)return;
    frameSeconds+=seconds;frameSamples++;
    if(frameSeconds<2||frameSamples<20)return;
    frameAverage=frameSeconds/frameSamples;frameSeconds=frameSamples=0;
    slowWindows=frameAverage>.028?slowWindows+1:0;
    fastWindows=frameAverage<.018?fastWindows+1:0;
    const next=slowWindows>=2?Math.max(.65,autoScale-.1):fastWindows>=5?Math.min(1,autoScale+.05):autoScale;
    if(next!==autoScale){autoScale=next;slowWindows=fastWindows=0;resize();}
  }
  function resize(){
    const w=Math.max(1,innerWidth),h=Math.max(1,innerHeight),preset=Number($('quality-select').value);
    const native=window.devicePixelRatio||1;
    const requested=preset===0?autoScale:preset===4?3840/Math.max(w,h):preset===3?Math.max(2,native*1.25):preset===2?Math.max(1.5,native):1;
    // Limit total pixels as well as each dimension: safe for rotated phones and large displays.
    const gl=renderer.getContext();if(gl.isContextLost())return;
    const viewport=gl.getParameter(gl.MAX_VIEWPORT_DIMS);if(!viewport)return;
    const maxDim=Math.min(renderer.capabilities.maxTextureSize,gl.getParameter(gl.MAX_RENDERBUFFER_SIZE),viewport[0],viewport[1]);
    const budget=preset===0?1600000:preset===4?8294400:preset===3?6291456:4194304;
    const ratio=Math.min(requested,Math.sqrt(budget/(w*h)),maxDim/w,maxDim/h);
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setPixelRatio(ratio);renderer.setSize(w,h);
    renderer.getDrawingBufferSize(renderSize);
    $('resolution-label').textContent=`${renderSize.x} × ${renderSize.y}`;
    $('quality-label').textContent={0:'PERFORMANCE',1:'STANDARD',2:'ULTRA',3:'EXTREME',4:'UHD'}[preset];
  }
  function applyWorldQuality(){
    const preset=Number($('quality-select').value),size=Math.min(preset===0?1024:preset===1?2048:4096,renderer.capabilities.maxTextureSize);
    if(sun.shadow.mapSize.x!==size){sun.shadow.mapSize.set(size,size);if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null;}sun.shadow.needsUpdate=true;}
    const target=preset===0?30000:preset===1?49000:grassCount;
    if(target!==grassTarget){grassTarget=target;grass.count=Math.min(grass.count,target);plantGrass(state.x,state.z);}
    groundGeo.setIndex(terrainIndices[preset<=1?2:1]);
    crowns.geometry=preset===0?crownLite:crownGeo;
    crowns.boundingSphere=null;
    renderer.shadowMap.autoUpdate=preset!==0;
    renderer.shadowMap.needsUpdate=true;
    expansion.setPerformanceMode(preset===0);
    document.body.classList.toggle('performance-mode',preset===0);
  }
  window.addEventListener('resize',resize);resize();

  // The same height field powers the illustrated maps, including the real lake.
  const mapSize=1024,mapSpan=4600;
  const mapBase=document.createElement('canvas');mapBase.width=mapBase.height=mapSize;
  const mb=mapBase.getContext('2d'),mi=mb.createImageData(mapSize,mapSize);
  for(let py=0;py<mapSize;py++)for(let px=0;px<mapSize;px++){
    const x=(px/mapSize-.5)*mapSpan,z=(py/mapSize-.5)*mapSpan,h=height(x,z),v=noise(x*.04,z*.04),index=(py*mapSize+px)*4;
    const contour=Math.abs((h+100)%5)<.38;let r=85+h*.6+v*8,g=108+h*.55+v*8,b=78+h*.4;
    if(lakeDistance(x,z)<97){r=92;g=137;b=134;}if(contour){r-=13;g-=13;b-=10;}
    mi.data[index]=r;mi.data[index+1]=g;mi.data[index+2]=b;mi.data[index+3]=255;
  }
  mb.putImageData(mi,0,0);
  const mapCtx=$('minimap').getContext('2d');let lastMapLabels=[];
  function drawMap(ctx,w,h,large){
    ctx.clearRect(0,0,w,h);ctx.save();ctx.beginPath();
    if(large)ctx.rect(0,0,w,h);else ctx.arc(w/2,h/2,w/2,0,Math.PI*2);ctx.clip();
    // Frame both the memories and the traveller, including the world edges.
    const minX=Math.min(-425,state.x-120),maxX=Math.max(325,state.x+120);
    const minZ=Math.min(-464,state.z-120),maxZ=Math.max(204,state.z+120);
    const span=large?Math.max(850,maxX-minX,(maxZ-minZ)*w/h):480;
    const centerX=large?(minX+maxX)/2:state.x,centerZ=large?(minZ+maxZ)/2:state.z,scale=w/span;
    const sx=((centerX-span/2)/mapSpan+.5)*mapSize,sy=((centerZ-span*h/w/2)/mapSpan+.5)*mapSize;
    ctx.fillStyle='#617555';ctx.fillRect(0,0,w,h);ctx.drawImage(mapBase,sx,sy,span/mapSpan*mapSize,span*h/w/mapSpan*mapSize,0,0,w,h);
    ctx.strokeStyle='#e5e2b91a';ctx.lineWidth=1;
    for(let i=1;i<5;i++){ctx.beginPath();ctx.moveTo(w*i/5,0);ctx.lineTo(w*i/5,h);ctx.stroke();ctx.beginPath();ctx.moveTo(0,h*i/5);ctx.lineTo(w,h*i/5);ctx.stroke();}
    const mx=x=>(x-centerX)*scale+w/2,mz=z=>(z-centerZ)*scale+h/2;
    const labels=[],cssScale=large?w/Math.max(1,$('large-map').clientWidth):1;
    function drawLabel(text,x,y,primary=false){
      const font=(primary?11:9)*cssScale;ctx.font=`${font}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      const width=ctx.measureText(text).width+8,height=font+8;
      for(const dy of [height,-height,height*2,-height*2]){
        const left=clamp(x-width/2,4,w-width-4),top=y+dy-height/2;
        const box={left,top,right:left+width,bottom:top+height,text};
        if(top<4||box.bottom>h-4||labels.some(r=>box.left<r.right&&box.right>r.left&&box.top<r.bottom&&box.bottom>r.top))continue;
        labels.push(box);ctx.fillStyle='#1d3329e8';ctx.fillRect(left,top,width,height);
        ctx.fillStyle=primary?'#f3ecd5':'#d8be8c';ctx.fillText(text,left+width/2,top+height/2);return;
      }
    }
    ctx.beginPath();ctx.setLineDash([3,7]);ctx.strokeStyle='#ede0a65e';landmarks.forEach((l,i)=>i?ctx.lineTo(mx(l.x),mz(l.z)):ctx.moveTo(mx(l.x),mz(l.z)));ctx.stroke();ctx.setLineDash([]);
    landmarks.forEach(l=>{const x=mx(l.x),z=mz(l.z);ctx.save();ctx.translate(x,z);ctx.rotate(Math.PI/4);ctx.fillStyle='#e6d39c';ctx.strokeStyle='#efdeaa';ctx.lineWidth=large?2:1.5;const size=large?6:4;if(discovered.has(l.id))ctx.fillRect(-size,-size,size*2,size*2);else ctx.strokeRect(-size,-size,size*2,size*2);ctx.restore();if(large)drawLabel(l.name,x,z,true);});
    expansion.drawMap(ctx,mx,mz,large,drawLabel);
    ctx.save();ctx.translate(mx(state.x),mz(state.z));ctx.rotate(-state.yaw);ctx.fillStyle='#fff5d6';ctx.shadowBlur=10;ctx.shadowColor='#fcf3c3';ctx.beginPath();ctx.moveTo(0,-9);ctx.lineTo(-5,6);ctx.lineTo(0,3);ctx.lineTo(5,6);ctx.closePath();ctx.fill();ctx.restore();ctx.restore();
    if(large)lastMapLabels=labels;
  }
  function drawLargeMap(){drawMap($('large-map').getContext('2d'),700,550,true);$('map-legend').replaceChildren(...landmarks.map(l=>{const s=document.createElement('span');s.textContent=`${discovered.has(l.id)?'◆':'◇'} ${l.name}`;return s;}));}
  window.addEventListener('resize',()=>{if($('map-dialog').open)drawLargeMap();});
  function save(){if(testing)return;try{localStorage.setItem('verdant-wilds-v1',JSON.stringify({x:state.x,z:state.z,discovered:[...discovered]}));}catch(e){}}
  window.addEventListener('pagehide',save);
  let toastTimeout=0;function discover(l){discovered.add(l.id);l.glow.visible=false;$('discovery-name').textContent=l.name;$('discovery-toast').classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('discovery-toast').classList.remove('show'),6500);if(discovered.size===3){$('ambient-caption').textContent='すべての記憶を集めた。その先も、旅はつづく。';}save();}
  const markerVector=new T.Vector3();let uiTick=0,saveTick=0;
  function updateUI(dt){uiTick+=dt;saveTick+=dt;if(saveTick>8){save();saveTick=0;}if(uiTick<.12)return;uiTick=0;
    landmarks.forEach(l=>{if(!discovered.has(l.id)&&Math.hypot(state.x-l.x,state.z-l.z)<l.r)discover(l);});
    const target=landmarks.find(l=>!discovered.has(l.id));
    $('quest-progress').textContent=`${discovered.size} / 3 の記憶`;
    if(target){const distance=Math.round(Math.hypot(target.x-state.x,target.z-state.z));$('quest-title').textContent=`${target.name}を見つける`;$('quest-distance').textContent=`${distance} m`;
      markerVector.set(target.x,target.y+13,target.z).project(camera);const visible=markerVector.z<1&&markerVector.z>-1&&Math.abs(markerVector.x)<.94&&Math.abs(markerVector.y)<.9;
      $('landmark-marker').style.opacity=visible?'1':'0';$('landmark-marker').style.left=`${(markerVector.x*.5+.5)*innerWidth}px`;$('landmark-marker').style.top=`${(-markerVector.y*.5+.5)*innerHeight}px`;$('marker-label').textContent=target.name;$('marker-distance').textContent=distance+' m';
    }else{$('quest-title').textContent='草原の記憶をすべて見つけた';$('quest-distance').textContent='旅はつづく';$('landmark-marker').style.opacity=0;}
    const names=['N','NE','E','SE','S','SW','W','NW'];const heading=((Math.round(-state.yaw/(Math.PI/4))%8)+8)%8;$('compass-main').textContent=names[heading];$('compass-left').textContent=names[(heading+7)%8];$('compass-right').textContent=names[(heading+1)%8];
    $('map-coordinates').textContent=`E ${Math.round(state.x).toString().padStart(4,'0')} · N ${Math.round(-state.z).toString().padStart(4,'0')}`;drawMap(mapCtx,280,280,false);
  }

  // Small drifting seeds and distant birds bring the landscape to life.
  const moteGeo=new T.BufferGeometry();const motePos=new Float32Array(180*3);for(let i=0;i<180;i++){motePos[i*3]=(rand()-.5)*100;motePos[i*3+1]=rand()*14;motePos[i*3+2]=(rand()-.5)*100;}moteGeo.setAttribute('position',new T.BufferAttribute(motePos,3));const motes=new T.Points(moteGeo,new T.PointsMaterial({color:'#fff4c9',size:.075,transparent:true,opacity:.68,depthWrite:false}));scene.add(motes);
  const birds=[];const birdMat=new T.MeshBasicMaterial({color:'#52645d',side:T.DoubleSide});const wingGeo=new T.BufferGeometry();wingGeo.setAttribute('position',new T.Float32BufferAttribute([0,0,0,1.1,.12,.16,.2,0,.31],3));wingGeo.computeVertexNormals();for(let i=0;i<12;i++){const g=new T.Group();const left=new T.Mesh(wingGeo,birdMat),right=new T.Mesh(wingGeo,birdMat);right.scale.x=-1;g.add(left,right);scene.add(g);birds.push({g,left,right,phase:rand()*6,r:80+rand()*140,y:65+rand()*65});}
  const expansion=window.createWildfront({T,scene,camera,renderer,state,player,height,lakeDistance,keys,ground,rocks,trunks,crowns,stoneMat,brickMats,sun,hemi,skyUniforms,testing,openDialog,discovered,playCue,resetInputs:()=>{keys.clear();resetStick();endLook();state.running=false;$('run-button').classList.remove('active');$('run-button').setAttribute('aria-pressed','false');},getPaused:()=>paused});
  let contextLost=false;
  $('world').addEventListener('webglcontextlost',event=>{
    event.preventDefault();contextLost=true;paused=true;keys.clear();resetStick();expansion.pauseInputs();
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());
    $('loading').style.display='none';$('error-message').hidden=false;
    $('error-message').querySelector('h2').textContent='描画が中断されました';
    $('error-message').querySelector('p').textContent='画面の復旧を待っています。戻らない場合は再読み込みしてください。保存済みの旅の記録は維持されます。';
  });
  $('world').addEventListener('webglcontextrestored',()=>{
    contextLost=false;resize();applyWorldQuality();$('error-message').hidden=true;
    paused=objectReview||!!document.querySelector('dialog[open]');
  });
  document.addEventListener('visibilitychange',()=>{if(document.hidden){keys.clear();resetStick();endLook();expansion.pauseInputs();}});
  sceneryClearance=expansion.sceneryClearance;
  plantGrass(state.x,state.z,true);
  applyWorldQuality();
  const objectViews=expansion.getObjectViews();let reviewView=null,reviewZoom=1;
  function setObjectView(id){
    const view=objectViews.find(v=>v.id===id);if(!testing||!view)return false;
    reviewView=view;reviewZoom=1;paused=true;keys.clear();resetStick();expansion.pauseInputs();
    expansion.test.teleport(view.target[0],view.target[2]);player.visible=false;
    expansion.setSceneryDensity(Number($('density-select').value));
    plantGrass(state.x,state.z,true);renderer.shadowMap.needsUpdate=true;
    document.body.dataset.shot=view.id;
    if($('photo-title')){$('photo-title').textContent=view.name;$('photo-shot').value=view.id;$('photo-zoom').value='1';}
    return true;
  }
  function reviewCamera(){if(!reviewView)return;const t=reviewView.target,e=reviewView.eye;
    const portrait=Math.max(1,1.15/camera.aspect);
    camera.position.set(t[0]+(e[0]-t[0])*reviewZoom*portrait,t[1]+(e[1]-t[1])*reviewZoom*portrait,t[2]+(e[2]-t[2])*reviewZoom*portrait);
    camera.fov=48;camera.updateProjectionMatrix();camera.lookAt(...t);
  }
  if(objectReview){
    document.body.classList.add('object-review');
    const panel=document.createElement('section');panel.className='photo-panel';panel.setAttribute('aria-label','景観フォトツアー');
    panel.innerHTML='<div class="photo-heading"><small>THE VERDANT WILDS / OBJECT STUDIES</small><h1 id="photo-title"></h1><p>実際の3D描画 · セーブなし · 全12構図</p></div><div class="photo-controls"><button id="photo-prev" aria-label="前の構図">←</button><select id="photo-shot" aria-label="撮影する構図"></select><button id="photo-next" aria-label="次の構図">→</button><label>画質<select id="photo-quality"><option value="0">動作優先</option><option value="1" selected>標準</option><option value="2">Ultra</option><option value="4">UHD</option></select></label><label class="photo-zoom">距離<input id="photo-zoom" type="range" min="0.7" max="1.6" step="0.05" value="1"></label><button id="photo-save">PNG保存</button><a href="previews/index.html">画像一覧</a><a href="index.html">探索へ戻る</a></div>';
    document.body.append(panel);
    for(const v of objectViews){const option=document.createElement('option');option.value=v.id;option.textContent=v.name;$('photo-shot').append(option);}
    const change=id=>{setObjectView(id);const url=new URL(location.href);url.searchParams.set('shot',id);history.replaceState(null,'',url);};
    $('photo-shot').addEventListener('change',e=>change(e.target.value));
    const next=step=>change(objectViews[(objectViews.findIndex(v=>v.id===reviewView.id)+step+objectViews.length)%objectViews.length].id);
    $('photo-prev').addEventListener('click',()=>next(-1));$('photo-next').addEventListener('click',()=>next(1));
    $('photo-quality').addEventListener('change',e=>{$('quality-select').value=e.target.value;$('quality-select').dispatchEvent(new Event('change'));updateGrass(grassCount);});
    $('photo-zoom').addEventListener('input',e=>reviewZoom=Number(e.target.value));
    $('photo-save').addEventListener('click',()=>{reviewCamera();renderer.render(scene,camera);renderer.domElement.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='verdant-'+reviewView.id+'.png';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');});
    $('quality-select').value='1';resize();applyWorldQuality();
    setObjectView(new URLSearchParams(location.search).get('shot'))||setObjectView(objectViews[0].id);
  }
  const camDesired=new T.Vector3(),lookTarget=new T.Vector3();let elapsed=0,firstFrame=true,shadowTick=0,pauseRenderTick=0;const capeBase=capeGeo.attributes.position.array.slice();const bannerBase=bannerGeo.attributes.position.array.slice();
  function animate(){requestAnimationFrame(animate);const raw=clock.getDelta();
    if(document.hidden||contextLost){resetFrameWindow();return;}
    if(!firstFrame)sampleFrame(raw);
    pauseRenderTick+=raw;
    if(paused&&!firstFrame&&pauseRenderTick<.1)return;
    pauseRenderTick=0;
    const dt=Math.min(raw,.045);elapsed+=dt;windUniform.value=elapsed;skyUniforms.uTime.value=elapsed;waterUniforms.uTime.value=elapsed;
    if(!paused&&!expansion.dead){let mx=joy.x,mz=joy.y;if(keys.has('KeyW')||keys.has('ArrowUp'))mz-=1;if(keys.has('KeyS')||keys.has('ArrowDown'))mz+=1;if(keys.has('KeyA')||keys.has('ArrowLeft'))mx-=1;if(keys.has('KeyD')||keys.has('ArrowRight'))mx+=1;
      let strength=Math.hypot(mx,mz);if(strength>1){mx/=strength;mz/=strength;strength=1;}const wantsRun=state.running||keys.has('ShiftLeft')||keys.has('ShiftRight')||(joy.id!==null&&strength>.88);const running=expansion.prepareMove(dt,{mx,mz,running:wantsRun});const speed=running?20:8.5;
      const fov=$('motion-toggle').checked?58:58+(running?5:0);camera.fov=mix(camera.fov,fov,1-Math.exp(-dt*3));camera.updateProjectionMatrix();
      if(expansion.airship.aboard){expansion.airship.setInput({mx,mz,running});}
      else if(!expansion.mounted){
      const dx=mx*Math.cos(state.yaw)+mz*Math.sin(state.yaw),dz=-mx*Math.sin(state.yaw)+mz*Math.cos(state.yaw);
      let nx=clamp(state.x+dx*speed*dt,-1430,1430),nz=clamp(state.z+dz*speed*dt,-1430,1430);
      // No invisible water floor: the shore gently blocks entry into deep water.
      if(lakeDistance(nx,nz)<97){const a=Math.atan2(nz+258,(nx-158)/1.22);nx=158+Math.cos(a)*97*1.22;nz=-258+Math.sin(a)*97;}
      state.x=nx;state.z=nz;state.moving=mix(state.moving,strength,1-Math.exp(-dt*9));state.walkTime+=dt*(running?13:8)*strength;
      state.vy-=18*dt;state.jump+=state.vy*dt;if(state.jump<=0){state.jump=0;state.vy=0;state.onGround=true;}
      state.y=height(state.x,state.z);player.position.set(state.x,state.y+state.jump+Math.sin(state.walkTime*2)*.035*strength,state.z);
      expansion.airship.collideGroundPlayer();
      if(strength>.05){let target=Math.atan2(-dx,-dz);let diff=Math.atan2(Math.sin(target-player.rotation.y),Math.cos(target-player.rotation.y));player.rotation.y+=diff*(1-Math.exp(-dt*10));}
      limbs[0].rotation.x=Math.sin(state.walkTime)*.65*state.moving;limbs[1].rotation.x=-Math.sin(state.walkTime)*.65*state.moving;torso.rotation.z=Math.sin(state.walkTime)*.02*state.moving;
      const capePos=capeGeo.attributes.position;for(let i=0;i<capePos.count;i++){const free=1-(capeBase[i*3+1]+.57)/1.14;capePos.setZ(i,capeBase[i*3+2]+Math.sin(elapsed*3.7+capeBase[i*3]*4)*.08*free+state.moving*free*.12);}capePos.needsUpdate=true;
      scarfTail.rotation.x=Math.sin(elapsed*4)*.15+state.moving*.5;
      const distance=innerWidth<innerHeight?12:10.8;const horizontal=distance*Math.cos(state.pitch);
      camDesired.set(state.x+Math.sin(state.yaw)*horizontal,state.y+2.3+Math.sin(state.pitch)*distance+state.jump*.6,state.z+Math.cos(state.yaw)*horizontal);
      camDesired.y=Math.max(camDesired.y,height(camDesired.x,camDesired.z)+1.1);
      camera.position.lerp(camDesired,1-Math.exp(-dt*5.5));lookTarget.set(state.x,state.y+1.7+state.jump*.7,state.z);camera.lookAt(lookTarget);
      }else{expansion.drive(dt,{mx,mz,running});}
      if(!grassPending&&Math.hypot(state.x-grassCenterX,state.z-grassCenterZ)>45)plantGrass(state.x,state.z);
      updateGrass();
    }
    const bp=bannerGeo.attributes.position;for(let i=0;i<bp.count;i++){const free=(1.75-bannerBase[i*3+1])/3.5;bp.setZ(i,Math.sin(elapsed*2.2+bannerBase[i*3+1]*1.7)*.24*free);}bp.needsUpdate=true;
    landmarks.forEach(l=>{l.glow.position.y=l.y+5+Math.sin(elapsed*1.5)*.35;l.gem.rotation.y=elapsed*.5;});
    birds.forEach((b,i)=>{const a=elapsed*.025+b.phase;b.g.position.set(Math.cos(a)*b.r-45,b.y+Math.sin(a*3)*8,Math.sin(a)*b.r-300);b.g.rotation.y=-a;b.left.rotation.z=Math.sin(elapsed*3.3+i)*.28;b.right.rotation.z=-Math.sin(elapsed*3.3+i)*.28;});
    motes.position.set(state.x+Math.sin(elapsed*.04)*5,state.y,state.z);motes.rotation.y=elapsed*.012;
    sun.position.x=state.x-240;sun.position.z=state.z-300;sun.target.position.set(state.x,state.y,state.z);sky.position.copy(camera.position);
    expansion.update(dt,paused);
    windUniform.value=elapsed*expansion.windSpeed;
    if(!paused&&!expansion.dead)updateUI(dt);
    shadowTick+=raw;if(shadowTick>=.1){renderer.shadowMap.needsUpdate=true;shadowTick=0;}
    reviewCamera();sky.position.copy(camera.position);
    renderer.render(scene,camera);
    if(firstFrame){firstFrame=false;document.body.dataset.ready='true';$('loading').classList.add('done');setTimeout(()=>$('loading').style.display='none',1400);console.info('Verdant Wilds ready: terrain, 98000 wind-animated grass blades, 3 landmarks, touch and keyboard controls.');}
  }
  if(new URLSearchParams(location.search).get('airship')==='1'&&!objectReview)expansion.airship.board(true);
  animate();
  if(testing&&new URLSearchParams(location.search).get('review')==='boss')expansion.test.prepareBoss();
  // Diagnostics; state-mutating verification hooks exist only in selftest mode.
  window.verdantWorld={expansion,getState:()=>({position:{x:state.x,y:state.y,z:state.z},jump:state.jump,onGround:state.onGround,yaw:state.yaw,running:state.running,discovered:[...discovered],paused,grass:grassCount,graphics:{preset:Number($('quality-select').value),width:renderSize.x,height:renderSize.y,pixelRatio:renderer.getPixelRatio(),shadowSize:sun.shadow.mapSize.x,activeGrass:grass.count,grassTarget,grassPending,terrainTriangles:groundGeo.index.count/3,autoScale,frameAverageMs:frameAverage*1000,shadowEveryFrame:renderer.shadowMap.autoUpdate},scenery:expansion.getSceneryStats(),webgl:renderer.capabilities.isWebGL2?'WebGL2':'WebGL1',drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles})};
  if(testing)window.verdantWorld.test={sampleFrame,resetFrameWindow,setObjectView,mapLabels:()=>lastMapLabels.map(r=>({...r})),flushGrass:()=>updateGrass(grassCount),renderReview(){reviewCamera();sky.position.copy(camera.position);renderer.shadowMap.needsUpdate=true;renderer.render(scene,camera);return renderer.domElement.toDataURL('image/png');}};
})();
