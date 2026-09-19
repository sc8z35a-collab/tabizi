'use strict';
/* Wildfront: real-time vehicles, encounters, weather and physically based detail.
   No services, secrets, generated images, or simulated buttons are used. */
window.createWildfront = function (ctx) {
  const {T,scene,camera,renderer,state,player,height,lakeDistance,keys,ground,rocks,trunks,crowns,stoneMat,brickMats,sun,hemi,skyUniforms,testing,openDialog,discovered} = ctx;
  const $ = id => document.getElementById(id);
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)), lerp=(a,b,t)=>a+(b-a)*t;
  const home={x:state.x,z:state.z};
  let elapsed=0, mounted=null, dead=false, hp=100, potions=3, kills=0, bossWins=0, attackCD=0, dodgeCD=0, invincible=0, healCD=0, combatTimer=0, noticeTimer=0, hurtTimer=0, dodgeTime=0;
  let boss=null, nextRaid=105, activeEncounter=null;
  const enemies=[], projectiles=[], effects=[], entities=[], wheels=[], propellers=[];
  // All new mechanics use simulation time and share the existing pause/death gates.
  let stamina=100, regenDelay=0, exhausted=false, combo=0, comboTime=0;
  let chargeTime=0, attackHeld=false, attackPointer=null, queuedAttack=0;
  let focusTime=0, empowered=0, perfectDodges=0, senseTime=0, senseCD=0, collected=0;
  let moveX=0, moveZ=0, dodgeX=0, dodgeZ=1, feedbackTime=0;
  const pickups=[];
  const sanctuaries=[{id:'tower',x:-28,z:-178},{id:'lake',x:158,z:-139},{id:'stones',x:-258,z:-346}].map(p=>({...p,cooldown:0}));
  function cue(kind){if(ctx.playCue)ctx.playCue(kind);if($('haptics-toggle').checked&&navigator.vibrate)navigator.vibrate(kind==='perfect'?[15,35,25]:12);}
  function spend(amount){if(stamina<amount){$('stamina-fill').parentElement.classList.add('empty');return false;}stamina-=amount;regenDelay=.65;return true;}
  function prepareMove(dt,input){
    const len=Math.hypot(input.mx,input.mz);moveX=input.mx*Math.cos(state.yaw)+input.mz*Math.sin(state.yaw);moveZ=-input.mx*Math.sin(state.yaw)+input.mz*Math.cos(state.yaw);
    if(stamina>28)exhausted=false;
    const running=input.running&&len>.1&&!exhausted&&stamina>0&&!attackHeld;
    if(running&&!mounted){stamina=Math.max(0,stamina-18*dt);regenDelay=.45;if(stamina===0)exhausted=true;}
    return mounted?input.running:running;
  }
  function targetEnemy(){
    // Prefer the view direction, but keep close threats easy to hit on touchscreens.
    return enemies.filter(e=>!e.dead&&Math.hypot(e.x-state.x,e.z-state.z)<85).sort((a,b)=>score(a)-score(b))[0];
  }
  function score(e){const dx=e.x-state.x,dz=e.z-state.z,d=Math.hypot(dx,dz)||1;return d+(1+(dx*Math.sin(state.yaw)+dz*Math.cos(state.yaw))/d)*18;}

  const wet={value:0}, cloud={value:0};
  let store={};try{store=JSON.parse(localStorage.getItem('verdant-wildfront-v2')||'{}')||{};}catch(e){}
  if(!testing){kills=Number.isFinite(store.kills)?Math.max(0,store.kills):0;bossWins=Number.isFinite(store.bossWins)?Math.max(0,store.bossWins):0;}
  const weather={type:'clear',target:0,intensity:0,age:0,auto:true,flash:0,lightningAt:8};
  function persist(){if(testing)return;try{localStorage.setItem('verdant-wildfront-v2',JSON.stringify({kills,bossWins}));}catch(e){}}
  window.addEventListener('pagehide',persist);
  function notice(message,duration=3.4){$('action-notice').textContent=message;noticeTimer=duration;$('action-notice').classList.add('visible');}
  const M=(color,metalness=0,roughness=.7)=>new T.MeshStandardMaterial({color,metalness,roughness});
  const steel=M('#81918e',.85,.25), darkMetal=M('#25312f',.7,.32), rubber=M('#202321',.06,.88), cream=M('#d9d9c4',.42,.28), brass=M('#bda56e',.75,.26);
  const carPaint=new T.MeshPhysicalMaterial({color:'#476c60',metalness:.72,roughness:.22,clearcoat:1,clearcoatRoughness:.12});
  const planePaint=new T.MeshPhysicalMaterial({color:'#e1d9bd',metalness:.6,roughness:.27,clearcoat:.85,clearcoatRoughness:.18});
  const glass=new T.MeshPhysicalMaterial({color:'#608c96',metalness:.22,roughness:.08,transparent:true,opacity:.66,clearcoat:1,side:T.DoubleSide,depthWrite:false});
  const red=M('#a75031',.5,.27), lightMat=new T.MeshStandardMaterial({color:'#fff3c6',emissive:'#fff0bc',emissiveIntensity:2.2,roughness:.2});
  const rearMat=new T.MeshStandardMaterial({color:'#b82515',emissive:'#ef3820',emissiveIntensity:.8});
  function mesh(geo,mat,parent,x=0,y=0,z=0){const m=new T.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function sphere(parent,mat,x,y,z,sx,sy=sx,sz=sx){const m=mesh(new T.SphereGeometry(1,20,14),mat,parent,x,y,z);m.scale.set(sx,sy,sz);return m;}
  function box(parent,mat,x,y,z,w,h,d){return mesh(new T.BoxGeometry(w,h,d),mat,parent,x,y,z);}
  function bevel(parent,mat,x,y,z,w,h,d,r=.08){r=Math.min(r,w*.2,h*.2,d*.2);const s=new T.Shape();s.moveTo(-w/2+r,-h/2+r);s.lineTo(w/2-r,-h/2+r);s.lineTo(w/2-r,h/2-r);s.lineTo(-w/2+r,h/2-r);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:d-2*r,steps:1,bevelEnabled:true,bevelSegments:3,bevelThickness:r,bevelSize:r,curveSegments:6});g.translate(0,0,-d/2+r);return mesh(g,mat,parent,x,y,z);}
  function rod(parent,mat,a,b,r=.04,r2=r){const v1=new T.Vector3(...a),v2=new T.Vector3(...b);const m=mesh(new T.CylinderGeometry(r2,r,v1.distanceTo(v2),12),mat,parent);m.position.copy(v1).add(v2).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),v2.sub(v1).normalize());return m;}
  function textTexture(text,color='#f2e7c6',background='transparent'){const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const c=canvas.getContext('2d');if(background!=='transparent'){c.fillStyle=background;c.fillRect(0,0,512,128);}c.fillStyle=color;c.font='600 56px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,256,64);const t=new T.CanvasTexture(canvas);t.colorSpace=T.SRGBColorSpace;return t;}
  function decal(parent,text,x,y,z,w,h,rot=0,color){const mat=new T.MeshStandardMaterial({map:textTexture(text,color),transparent:true,depthWrite:false,roughness:.6,side:T.DoubleSide});const m=mesh(new T.PlaneGeometry(w,h),mat,parent,x,y,z);m.rotation.y=rot;return m;}

  // Sky-derived reflection lighting gives bodywork and glass readable, curved highlights.
  const envCanvas=document.createElement('canvas');envCanvas.width=1024;envCanvas.height=512;const ec=envCanvas.getContext('2d');const grad=ec.createLinearGradient(0,0,0,512);grad.addColorStop(0,'#567e9a');grad.addColorStop(.40,'#adc4c8');grad.addColorStop(.49,'#ede3bb');grad.addColorStop(.51,'#758661');grad.addColorStop(1,'#263725');ec.fillStyle=grad;ec.fillRect(0,0,1024,512);const eg=ec.createRadialGradient(255,133,4,255,133,160);eg.addColorStop(0,'#fff8de');eg.addColorStop(.15,'#f4eac5');eg.addColorStop(1,'#f4eac500');ec.fillStyle=eg;ec.fillRect(0,0,1024,512);const envTex=new T.CanvasTexture(envCanvas);envTex.mapping=T.EquirectangularReflectionMapping;envTex.colorSpace=T.SRGBColorSpace;const pmrem=new T.PMREMGenerator(renderer);const envTarget=pmrem.fromEquirectangular(envTex);scene.environment=envTarget.texture;envTex.dispose();pmrem.dispose();
  [carPaint,planePaint,steel,glass,brass].forEach(m=>m.envMapIntensity=1.25);

  // Surface detail is layered over the existing world, keeping previous exploration intact.
  const load=new T.TextureLoader();load.load('images/grass-color.jpg',texture=>{texture.colorSpace=T.SRGBColorSpace;texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(420,420);texture.anisotropy=renderer.capabilities.getMaxAnisotropy();ground.material.map=texture;ground.material.needsUpdate=true;},undefined,()=>console.warn('Detailed grass texture unavailable; using procedural ground fallback.'));
  function makeDetail(kind){const cv=document.createElement('canvas');cv.width=cv.height=512;const c=cv.getContext('2d'),im=c.createImageData(512,512);for(let y=0;y<512;y++)for(let x=0;x<512;x++){let n=Math.sin(x*12.9898+y*78.233)*43758.5453;n-=Math.floor(n);let v=kind==='bark'?100+Math.sin(x*.19+Math.sin(y*.023)*1.6)*39+Math.sin(x*.77)*22+n*26:127+Math.sin(x*.038+Math.sin(y*.034)*3)*17+Math.sin(y*.13+x*.035)*11+n*39;const crack=kind==='bark'?Math.pow(Math.abs(Math.sin(x*.095+Math.sin(y*.015))),32):Math.pow(Math.abs(Math.sin(x*.035+Math.sin(y*.032)*2)),38);v-=crack*62;const i=(y*512+x)*4;im.data[i]=v;im.data[i+1]=v;im.data[i+2]=v;im.data[i+3]=255;}c.putImageData(im,0,0);const texture=new T.CanvasTexture(cv);texture.wrapS=texture.wrapT=T.RepeatWrapping;texture.repeat.set(kind==='bark'?3:2,kind==='bark'?2:2);texture.anisotropy=8;return texture;}
  const stoneBump=makeDetail('stone'),barkBump=makeDetail('bark');
  [stoneMat,...brickMats,rocks.material].forEach(m=>{m.bumpMap=stoneBump;m.bumpScale=.18;m.roughness=.88;m.needsUpdate=true;});trunks.material.bumpMap=barkBump;trunks.material.bumpScale=.16;trunks.material.needsUpdate=true;
  const groundBump=stoneBump.clone();groundBump.repeat.set(800,800);groundBump.needsUpdate=true;ground.material.bumpMap=groundBump;ground.material.bumpScale=.055;
  const shaderNoise=`float wfHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}float wfNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(wfHash(i),wfHash(i+vec2(1.,0.)),f.x),mix(wfHash(i+vec2(0.,1.)),wfHash(i+1.),f.x),f.y);}`;
  function upgradeSurface(material,kind){material.onBeforeCompile=shader=>{shader.uniforms.wfWet=wet;shader.vertexShader='varying vec3 wfPos;\n'+shader.vertexShader;shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
      vec4 wfWorld = vec4(transformed,1.);
      #ifdef USE_INSTANCING
      wfWorld = instanceMatrix * wfWorld;
      #endif
      wfPos=(modelMatrix*wfWorld).xyz;`);
      shader.fragmentShader='varying vec3 wfPos;uniform float wfWet;\n'+shaderNoise+'\n'+shader.fragmentShader;
      const terrain=kind==='terrain';shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      float wfPatch=wfNoise(wfPos.xz*.043);float fine=wfNoise(wfPos.xz*1.7);
      diffuseColor.rgb *= mix(.82,1.2,wfPatch)*mix(.9,1.08,fine);
      ${terrain?`float trail=1.-smoothstep(1.3,4.0,abs(wfPos.x-(14.*sin(wfPos.z*.019)-4.)));trail*=1.-smoothstep(180.,230.,abs(wfPos.z+50.));diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.27,.22,.12)*(.8+fine*.4),trail*.7);float slope=1.-abs(normalize(cross(dFdx(wfPos),dFdy(wfPos))).y);diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.24,.26,.21),smoothstep(.18,.48,slope)*.75);`:`float moss=wfNoise(wfPos.xz*.8+wfPos.y*.3);diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.59,.77,.36),smoothstep(.59,.78,moss)*.7);`}
      diffuseColor.rgb*=1.-wfWet*.19;`);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.38,wfWet*.65);');};material.customProgramCacheKey=()=>kind+'-wildfront';material.needsUpdate=true;}
  upgradeSurface(ground.material,'terrain');upgradeSurface(rocks.material,'rock');brickMats.forEach(m=>upgradeSurface(m,'stone'));upgradeSurface(stoneMat,'stone');
  // Thousands of small stones and real leaf clusters, rather than a flat colour upgrade.
  const pebbles=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),M('#a49c7c',0,.91),1900);const d=new T.Object3D(),cc=new T.Color();let seed=9751;function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
  for(let i=0;i<1900;i++){const x=(random()-.5)*600+home.x,z=(random()-.5)*600+home.z,s=.06+random()*.35;d.position.set(x,height(x,z)+s*.18,z);d.rotation.set(random()*3,random()*6,random()*3);d.scale.set(s,s*.5,s*.7);if(lakeDistance(x,z)<100)d.scale.setScalar(0);d.updateMatrix();pebbles.setMatrixAt(i,d.matrix);cc.setHSL(.13,.12,.35+random()*.2);pebbles.setColorAt(i,cc);}pebbles.receiveShadow=true;scene.add(pebbles);
  const leafGeo=new T.SphereGeometry(1,7,5);const leaves=new T.InstancedMesh(leafGeo,M('#577747',0,.92),6000);const treeMatrix=new T.Matrix4(),treePos=new T.Vector3(),treeScale=new T.Vector3(),treeQuat=new T.Quaternion();
  for(let i=0;i<6000;i++){crowns.getMatrixAt(i%crowns.count,treeMatrix);treeMatrix.decompose(treePos,treeQuat,treeScale);const a=random()*Math.PI*2,b=Math.acos(random()*2-1),r=.92;d.position.set(treePos.x+Math.cos(a)*Math.sin(b)*treeScale.x*r,treePos.y+Math.cos(b)*treeScale.y*r,treePos.z+Math.sin(a)*Math.sin(b)*treeScale.z*r);d.rotation.set(random()*2,random()*6,random()*3);const s=.12+random()*.25;d.scale.set(s*2.4,s*.35,s);d.updateMatrix();leaves.setMatrixAt(i,d.matrix);cc.setHSL(.21+random()*.05,.30,.20+random()*.19);leaves.setColorAt(i,cc);}leaves.receiveShadow=true;scene.add(leaves);

  // Spatially batched scenery: shared geometry/materials, local bounds and distance culling.
  // These are decorative objects; they deliberately do not alter combat or vehicle collision.
  function createScenery() {
    const groups = new Map(), batches = new Map(), counts = {}, sites = [];
    const transform = new T.Object3D(), tint = new T.Color();
    let scenerySeed = 20260919, density = .4, range = 460, tick = 0;
    const rng = () => { scenerySeed = (scenerySeed * 1664525 + 1013904223) >>> 0; return scenerySeed / 4294967296; };
    const wood = M('#786047', 0, .88), foliage = M('#66854a', 0, .94);
    wood.bumpMap = barkBump; wood.bumpScale = .10;
    const slate = M('#4e686a', .12, .75), plaster = M('#d2c4a0', 0, .96);
    const stone = M('#969983', 0, .94); stone.bumpMap = stoneBump; stone.bumpScale = .17; upgradeSurface(stone, 'stone');
    const amber = new T.MeshStandardMaterial({color:'#ffe0a0',emissive:'#ffb34e',emissiveIntensity:1.5,roughness:.4});
    const petal = M('#ede2c0', 0, .9), cap = M('#b87950', 0, .88);
    const shapes = {
      timber: [new T.BoxGeometry(1,1,1), wood, true],
      trunk: [new T.CylinderGeometry(.72,1,1,10), wood, true],
      pine: [new T.ConeGeometry(1,1,12,2), foliage, true],
      shrub: [new T.IcosahedronGeometry(1,1), foliage, false],
      stone: [new T.DodecahedronGeometry(1,1), stone, true],
      wall: [new T.BoxGeometry(1,1,1), plaster, true],
      roof: [new T.BoxGeometry(1,1,1), slate, true],
      metal: [new T.BoxGeometry(1,1,1), darkMetal, true],
      lamp: [new T.BoxGeometry(1,1,1), amber, false],
      flower: [new T.SphereGeometry(1,7,4), petal, false],
      stem: [new T.CylinderGeometry(.6,1,1,4), foliage, false],
      mushroom: [new T.SphereGeometry(1,10,6,0,Math.PI*2,0,Math.PI/2), cap, false]
    };
    const fern = new T.BufferGeometry();
    const vertices = [], indices = [];
    for (let j = 0; j < 6; j++) {
      const y = j * .12, width = .26 * (1-j/7), k = vertices.length/3;
      vertices.push(0,y,y*.7, -width,y+.11,y*.7+.06, 0,y+.14,y*.7+.1, width,y+.11,y*.7+.06);
      indices.push(k,k+1,k+2,k,k+2,k+3);
    }
    fern.setAttribute('position', new T.Float32BufferAttribute(vertices,3)); fern.setIndex(indices); fern.computeVertexNormals();
    const fernMat = foliage.clone(); fernMat.side = T.DoubleSide;
    shapes.fern = [fern, fernMat, false];
    function add(kind,x,y,z,sx,sy,sz,rx=0,ry=0,rz=0,color=null,detail=false) {
      const cx = Math.floor(x/240), cz = Math.floor(z/240), cell = `${cx}:${cz}:${detail}`;
      if (!groups.has(cell)) {
        const g = new T.Group(); g.position.set(cx*240,0,cz*240); scene.add(g);
        g.updateMatrix();g.matrixAutoUpdate=false;groups.set(cell,{g,x:cx*240+120,z:cz*240+120,detail});
      }
      const key = `${cell}:${kind}`;
      if (!batches.has(key)) batches.set(key,{cell,kind,items:[],detail});
      transform.position.set(x-cx*240,y,z-cz*240); transform.rotation.set(rx,ry,rz); transform.scale.set(sx,sy,sz); transform.updateMatrix();
      batches.get(key).items.push({matrix:transform.matrix.clone(),color:color||'#ffffff'});
    }
    function record(kind) { counts[kind] = (counts[kind]||0)+1; }
    function plantPoint(i, total) {
      // Most detail lives along the initial journey; a second band fills the wider world.
      for(let attempt=0;attempt<80;attempt++) {
        const near=i<total*.7, x=(rng()-.5)*(near?660:2350), z=(rng()-.5)*(near?720:2350)-(near?110:0);
        const path=14*Math.sin(z*.019)-4;
        if(lakeDistance(x,z)<112 || height(x,z)<-1 || (Math.abs(x-path)<5 && z>-215 && z<100) || Math.hypot(x,z-62)<22) continue;
        if(Math.hypot(x+28,z+178)<19 || Math.hypot(x+258,z+346)<26 || Math.hypot(x-158,z+139)<18) continue;
        return {x,z,y:height(x,z)};
      }
      return null;
    }
    for(let i=0;i<520;i++) {
      const p=plantPoint(i,520); if(!p)continue; const {x,y,z}=p, h=7+rng()*14;
      add('trunk',x,y+h*.36,z,.22,h*.72,.22);
      for(let j=0;j<4;j++)add('pine',x,y+h*(.48+j*.14),z,h*(.24-j*.041),h*.46,h*(.24-j*.041),0,rng()*6,0,new T.Color().setHSL(.25+rng()*.04,.23+rng()*.12,.28+rng()*.13));
      record('conifers');
    }
    for(let i=0;i<2100;i++) {
      const p=plantPoint(i,2100);if(!p)continue;const s=.45+rng()*1.1;
      for(let j=0;j<3;j++)add('shrub',p.x+Math.cos(j*2.1)*s*.5,p.y+s*.45,p.z+Math.sin(j*2.1)*s*.5,s*.65,s*.62,s*.65,0,rng()*6,0,new T.Color().setHSL(.19+rng()*.1,.32,.4+rng()*.12),true);
      record('shrubs');
    }
    for(let i=0;i<2200;i++) {
      const p=plantPoint(i,2200);if(!p)continue;const s=.6+rng()*.9;
      for(let j=0;j<6;j++)add('fern',p.x,p.y,p.z,s,s,s,-.42,j*Math.PI/3,0,null,true);
      record('ferns');
    }
    for(let i=0;i<6200;i++) {
      const p=plantPoint(i,6200);if(!p)continue;const s=.3+rng()*.4;
      add('stem',p.x,p.y+s*.5,p.z,.016,s,.016,0,0,0,null,true);
      add('flower',p.x,p.y+s,p.z,.13,.065,.13,0,rng()*6,0,['#eee3b5','#bca5d7','#efd494','#93bfd4'][i%4],true);
      record('wildflowers');
    }
    for(let i=0;i<900;i++) {
      const p=plantPoint(i,900);if(!p)continue;const s=.12+rng()*.22;
      add('trunk',p.x,p.y+s*.5,p.z,s*.18,s,s*.18,0,0,0,'#f5dfae',true);
      add('mushroom',p.x,p.y+s,p.z,s,s*.6,s,0,0,0,i%3?'#ddba8f':'#b96d51',true);record('mushrooms');
    }
    for(let i=0;i<1400;i++) {
      const p=plantPoint(i,1400);if(!p)continue;const s=.25+rng()*1.5;
      add('stone',p.x,p.y+s*.22,p.z,s,s*.5,s*.8,rng(),rng()*6,rng(),null,i>500);record('boulders');
    }
    for(let i=0;i<120;i++) {
      const p=plantPoint(i,120);if(!p)continue;const a=rng()*6,s=1+rng();
      add('trunk',p.x,p.y+.35,p.z,.32,s*3,.32,Math.PI/2,a);
      add('trunk',p.x+.3,p.y+.55,p.z,.09,1.4,.09,.7,a,1);record('fallenLogs');
    }
    // Built places are composed of instanced beams, stonework, roof panels and lanterns.
    function site(name,x,z,type) {
      const y=height(x,z), size=type==='camp'?4:6;
      sites.push({name,x,z,type});record(type);
      const put=(kind,dx,dy,dz,sx,sy,sz,rx=0,ry=0,rz=0)=>add(kind,x+dx,y+dy,z+dz,sx,sy,sz,rx,ry,rz);
      for(let j=0;j<12;j++) {
        const dx=(j%4-1.5)*2,dz=(Math.floor(j/4)-1)*2;
        add('stone',x+dx,height(x+dx,z+dz)+.1,z+dz,1.25,.3,1.15,0,rng()*.1);
      }
      if(type==='ruins') {
        for(let side=-1;side<=1;side+=2)for(let row=0;row<6;row++)put('stone',side*3,row*.8+.5,0,.85,.48,.9);
        for(let j=0;j<7;j++){const a=j/6*Math.PI;put('stone',Math.cos(a)*3,5+Math.sin(a)*2.8,0,.9,.5,.85,0,0,a-Math.PI/2);}
        for(let j=0;j<8;j++)put('stone',(rng()-.5)*12,.3,2+rng()*5,1,.4,.7,0,rng()*6);
      } else if(type==='camp') {
        for(const side of [-1,1])put('roof',side*1.2,1.3,0,.12,3.5,4.2,0,0,-side*.75);
        put('timber',0,2.6,0,.1,.1,4.8);
        for(let j=0;j<9;j++){const a=j/9*Math.PI*2;put('stone',Math.cos(a)*.9,.2,5+Math.sin(a)*.9,.3,.2,.3);}
        put('timber',0,.25,5,1.3,.22,.23,0,.4);put('timber',0,.3,5,1.3,.22,.23,0,-.5);
      } else {
        // Layered emissive window panes, crossbars, corner beams and a pitched roof.
        put('wall',0,1.9,0,6,3.6,4.8);
        for(const side of [-1,1]) {
          put('roof',side*1.65,4.15,0,3.9,.2,6.0,0,0,-side*.48);
          for(const dz of [-2.5,2.5])put('timber',side*3,1.95,dz,.24,4,.24);
          put('metal',side*1.8,2,2.43,1.12,1.3,.12);
          put('lamp',side*1.8,2,2.51,.91,1.05,.05);
          put('timber',side*1.8,2,2.57,.065,1.25,.08);put('timber',side*1.8,2,2.57,1.1,.065,.08);
        }
        put('timber',0,1.2,2.46,1.2,2.3,.15);put('metal',.4,1.1,2.58,.08,.08,.08);
        for(let j=0;j<3;j++)put('stone',0,.15+j*.16,3.8-j*.4,1,.2,.4);
        put('stone',1.8,4.7,-1.5,.6,1.4,.6);
      }
      // Supply crates, barrels and a fenced garden accompany each site.
      for(let j=0;j<3;j++) {
        put('timber',size+j*1.2,.45,1,1,.9,.85);
        for(const dx of [-.34,.34])put('metal',size+j*1.2+dx,.46,1,.06,.96,.92);
        put('trunk',-size,.52,j*1.1,.42,1.05,.42);
      }
      for(let j=0;j<8;j++) {
        const dx=(j-3.5)*2,z1=z-5.5,h=height(x+dx,z1);
        add('timber',x+dx,h+.65,z1,.14,1.3,.14);
        if(j<7)for(const yy of [.45,1])add('timber',x+dx+1,h+yy,z1,2.1,.09,.10);
      }
      put('timber',-size,1.8,3,.14,3.6,.14);put('metal',-size,3.4,3,.55,.08,.5);
      put('lamp',-size,3.05,3,.28,.5,.28);put('metal',-size,2.78,3,.45,.08,.45);
    }
    site('風待ちの山小屋',-42,5,'cabins');site('草原の野営地',35,-32,'camp');
    site('風車の農園',78,-88,'cabins');site('古い街道門',-79,-124,'ruins');
    site('湖畔の小屋',295,-161,'cabins');site('森の休息地',-170,-70,'camp');
    for(let i=0;i<12;i++) { const p=plantPoint(i,12);if(p)site(['旅人の小屋','忘れられた門','野営地'][i%3],p.x,p.z,['cabins','ruins','camp'][i%3]); }
    // Large rotating windmill: one small animated hierarchy; static surroundings remain batched.
    const mill=new T.Group();mill.position.set(65,height(65,-88),-88);scene.add(mill);
    mesh(new T.CylinderGeometry(1.4,2.5,11,16),plaster,mill,0,5.5,0);
    mesh(new T.ConeGeometry(2.3,3,16),slate,mill,0,12,0);
    const rotor=new T.Group();rotor.position.set(0,9,2);mill.add(rotor);
    for(let i=0;i<4;i++) {
      const arm=new T.Group();arm.rotation.z=i*Math.PI/2;rotor.add(arm);
      box(arm,wood,0,3.2,0,.18,6.4,.18);
      for(let j=0;j<9;j++)box(arm,plaster,.48,1.9+j*.47,0,1.25,.3,.09);
    }
    sphere(rotor,wood,0,0,.08,.4);record('windmills');
    const meshes=[];
    for(const batch of batches.values()) {
      const [geo,mat,shadow]=shapes[batch.kind];
      const m=new T.InstancedMesh(geo,mat,batch.items.length);
      batch.items.forEach((item,i)=>{m.setMatrixAt(i,item.matrix);m.setColorAt(i,tint.set(item.color));});
      m.castShadow=shadow&&!batch.detail;m.receiveShadow=true;m.computeBoundingSphere();m.updateMatrix();m.matrixAutoUpdate=false;
      groups.get(batch.cell).g.add(m);meshes.push({m,total:m.count,detail:batch.detail});
    }
    const instanceCount=meshes.reduce((n,b)=>n+b.total,0);
    batches.clear(); // Drop construction matrices after uploading the fixed world layout.
    function update(dt) {
      rotor.rotation.z-=dt*.22;tick+=dt;
      if(tick<.25)return;tick=0;
      for(const cell of groups.values())cell.g.visible=Math.hypot(state.x-cell.x,state.z-cell.z)<(cell.detail?range*.42:range)+170;
      mill.visible=Math.hypot(state.x-65,state.z+88)<range;
    }
    function setDensity(value) {
      density=clamp(value,.35,1);range=density<.6?460:density<.9?620:900;
      for(const b of meshes)b.m.count=b.detail?Math.ceil(b.total*density):b.total;
      tick=1;update(0);
    }
    setDensity(Number($('density-select').value));
    return {update,setDensity,sites,stats:()=>({counts:{...counts},instances:instanceCount,activeInstances:meshes.reduce((n,b)=>n+b.m.count,0),batches:meshes.length,density,range})};
  }
  const scenery = createScenery();
  let performanceMode=true;
  function setPerformanceMode(enabled){performanceMode=enabled;leaves.count=enabled?2000:6000;pebbles.count=enabled?950:1900;rainGeo.setDrawRange(0,(enabled?1200:rainCount)*2);}

  // Detailed all-terrain grand tourer: shaped body, layered windows, wheel tread,
  // brakes, alloy spokes, headlights, interior, luggage rack, seams and badges.
  function makeWheel(parent,x,y,z,r=.49,width=.31){const g=new T.Group();g.position.set(x,y,z);parent.add(g);const tire=mesh(new T.TorusGeometry(r*.74,r*.26,10,32),rubber,g);tire.rotation.y=Math.PI/2;tire.scale.z=width/(r*.52);const side=x<0?-1:1;
    const rim=mesh(new T.CylinderGeometry(r*.62,r*.62,.07,32),steel,g,side*.16,0,0);rim.rotation.z=Math.PI/2;
    const brake=mesh(new T.CylinderGeometry(r*.48,r*.48,.04,24),darkMetal,g,side*.21,0,0);brake.rotation.z=Math.PI/2;
    for(let i=0;i<8;i++){const a=i*Math.PI/4;rod(g,steel,[side*.235,Math.cos(a)*r*.12,Math.sin(a)*r*.12],[side*.235,Math.cos(a)*r*.57,Math.sin(a)*r*.57],.032);}
    sphere(g,brass,side*.25,0,0,.065);
    const tread=new T.InstancedMesh(new T.BoxGeometry(.35,.065,.14),rubber,32);for(let i=0;i<32;i++){const a=i/32*Math.PI*2;d.position.set(0,Math.cos(a)*r,Math.sin(a)*r);d.rotation.set(a,0,.13);d.scale.set(1,1,1);d.updateMatrix();tread.setMatrixAt(i,d.matrix);}g.add(tread);wheels.push(g);return g;}
  function makeCar(){const g=new T.Group();g.name='Wayfarer GT';
    bevel(g,darkMetal,0,.62,0,2.19,.42,4.55,.10);bevel(g,carPaint,0,1.02,-.10,2.22,.64,4.54,.13);
    bevel(g,carPaint,0,1.36,-1.35,2.16,.26,1.71,.10);bevel(g,carPaint,0,1.48,1.45,2.12,.42,1.20,.10);
    bevel(g,glass,0,1.93,.05,1.92,.96,1.95,.17);bevel(g,carPaint,0,2.41,.15,1.97,.16,2.21,.07);
    for(const side of [-1,1]){rod(g,carPaint,[side*.99,1.49,-1.0],[side*.91,2.35,-.83],.065);rod(g,carPaint,[side*.99,1.5,1.1],[side*.91,2.35,1.1],.075);rod(g,darkMetal,[side*1.0,1.52,.25],[side*.96,2.34,.25],.037);bevel(g,steel,side*1.135,1.29,.47,.035,.06,.31,.01);bevel(g,carPaint,side*1.30,1.83,-.75,.33,.22,.37,.06);rod(g,darkMetal,[side*1.06,1.79,-.7],[side*1.27,1.82,-.72],.035);
      bevel(g,darkMetal,side*1.12,.61,.03,.12,.10,2.60,.03);for(const z of [-1.44,1.44]){const arch=mesh(new T.TorusGeometry(.56,.065,8,24,Math.PI),darkMetal,g,side*1.10,.66,z);arch.rotation.y=Math.PI/2;makeWheel(g,side*1.12,.54,z);}
      const seam=box(g,darkMetal,side*1.116,1.11,.23,.009,.45,.015);decal(g,'W F',side*1.126,1.24,-.63,.57,.22,side*Math.PI/2,'#d4cba2');
      bevel(g,lightMat,side*.77,1.15,-2.34,.43,.17,.06,.025);bevel(g,rearMat,side*.83,1.20,2.22,.30,.13,.06,.02);box(g,lightMat,side*.77,1.02,-2.35,.41,.025,.03);
      bevel(g,darkMetal,side*.45,1.24,.24,.57,.61,.67,.10);bevel(g,darkMetal,side*.45,1.76,.51,.57,.76,.24,.10);bevel(g,cream,side*.45,2.06,.54,.31,.25,.23,.05);
      rod(g,steel,[side*.65,2.55,-.6],[side*.65,2.55,.96],.045);}
    bevel(g,darkMetal,0,1.03,-2.36,.99,.37,.04,.02);for(let i=0;i<9;i++)box(g,steel,-.43+i*.107,1.05,-2.389,.032,.27,.02);
    bevel(g,steel,0,.69,-2.4,2.17,.11,.18,.03);bevel(g,steel,0,.69,2.31,2.13,.13,.16,.03);decal(g,'WAYFARER',0,.79,-2.50,.82,.17,Math.PI,'#d8e0cb');
    rod(g,darkMetal,[-.57,1.63,-.49],[-.57,1.78,-.65],.065);const steering=mesh(new T.TorusGeometry(.21,.023,8,24),darkMetal,g,-.57,1.84,-.67);steering.rotation.x=.47;
    for(let i=0;i<4;i++)rod(g,darkMetal,[-.78,2.57,-.55+i*.46],[.78,2.57,-.55+i*.46],.035);
    bevel(g,M('#998664',0,.9),0,2.75,.29,1.16,.28,.73,.07);rod(g,darkMetal,[-.4,2.94,-.09],[-.4,2.94,.68],.028);rod(g,darkMetal,[.4,2.94,-.09],[.4,2.94,.68],.028);
    return g;
  }
  // A streamlined expedition aircraft with aerofoil planform, tapered fuselage,
  // canopy and cockpit, segmented control surfaces, bracing and moving propeller.
  function wing(parent,span,chord,x,y,z,mat){const s=new T.Shape();s.moveTo(-span/2,.33);s.lineTo(-span/2+.45,-.48);s.lineTo(-.7,-chord*.53);s.lineTo(.7,-chord*.53);s.lineTo(span/2-.45,-.48);s.quadraticCurveTo(span/2+.08,.12,span/2,.34);s.lineTo(.9,chord*.5);s.lineTo(-.9,chord*.5);s.closePath();const g=new T.ExtrudeGeometry(s,{depth:.09,bevelEnabled:true,bevelSize:.065,bevelThickness:.035,bevelSegments:3,steps:1});g.rotateX(Math.PI/2);return mesh(g,mat,parent,x,y,z);}
  function makePlane(){const g=new T.Group();g.name='Kestrel S-2';const points=[new T.Vector2(.06,-3.65),new T.Vector2(.37,-3.32),new T.Vector2(.59,-2.60),new T.Vector2(.67,-1.8),new T.Vector2(.69,-.5),new T.Vector2(.51,1.2),new T.Vector2(.24,2.5),new T.Vector2(.07,3.65)];const body=mesh(new T.LatheGeometry(points,48),planePaint,g,0,1.55,0);body.rotation.x=Math.PI/2;
    wing(g,11.6,2.25,0,1.65,-.8,planePaint);wing(g,4.10,1.07,0,1.62,2.72,planePaint);
    const tailShape=new T.Shape();tailShape.moveTo(0,0);tailShape.lineTo(-.1,1.82);tailShape.quadraticCurveTo(.45,1.94,1.33,.16);tailShape.closePath();const tg=new T.ExtrudeGeometry(tailShape,{depth:.12,bevelEnabled:true,bevelSize:.04,bevelThickness:.025,bevelSegments:3});tg.rotateY(-Math.PI/2);mesh(tg,red,g,0,1.57,2.46);
    const canopy=sphere(g,glass,0,2.02,-.82,.54,.54,1.14);canopy.scale.y=.52;
    rod(g,steel,[-.47,2.10,-1.52],[.47,2.10,-1.52],.035);rod(g,darkMetal,[-.42,2.28,-.18],[.42,2.28,-.18],.032);
    bevel(g,darkMetal,0,1.94,-.36,.48,.49,.23,.08);bevel(g,darkMetal,0,1.76,-.77,.47,.12,.60,.04);box(g,darkMetal,0,1.95,-1.47,.64,.25,.12);for(let i=0;i<3;i++){const dial=mesh(new T.CircleGeometry(.058,16),steel,g,-.18+i*.18,2,-1.4);}
    const prop=new T.Group();prop.position.set(0,1.55,-3.63);g.add(prop);const blade=bevel(prop,darkMetal,0,0,0,.16,2.54,.06,.028);const blade2=bevel(prop,darkMetal,0,0,0,.16,2.54,.06,.028);blade2.rotation.z=Math.PI/2;const spinner=mesh(new T.ConeGeometry(.33,.59,32),steel,prop,0,0,-.15);spinner.rotation.x=-Math.PI/2;propellers.push(prop);
    for(const side of [-1,1]){rod(g,steel,[side*.46,1.31,-1.1],[side*1.29,.46,-1.35],.07);rod(g,darkMetal,[side*.3,1.19,.06],[side*1.29,.46,-1.35],.042);makeWheel(g,side*1.31,.43,-1.35,.39,.24);
      rod(g,steel,[side*.54,1.22,-.37],[side*3.78,1.53,-.43],.035);box(g,red,side*4.55,1.73,-.72,.72,.022,1.12);box(g,darkMetal,side*3.3,1.73,.04,3.15,.008,.018);
      for(let i=0;i<12;i++)sphere(g,steel,side*(.8+i*.35),1.74,-1.40,.018);
      const navMat=new T.MeshStandardMaterial({color:side<0?'#c52f24':'#58d8ab',emissive:side<0?'#b82719':'#32bc83',emissiveIntensity:1.5});sphere(g,navMat,side*5.72,1.69,-.43,.075);
      decal(g,'KESTREL',side*.58,1.64,.15,1.0,.21,side*Math.PI/2,'#485b52');}
    const tailWheel=makeWheel(g,0,.24,2.65,.20,.14);rod(g,steel,[0,1.31,2.3],[0,.30,2.65],.043);
    const marking=decal(g,'S — 2',-2.8,1.76,-.75,1.65,.58,0,'#455d53');marking.rotation.x=-Math.PI/2;
    return g;
  }
  function label(name,type,object,offset=3){const el=document.createElement('div');el.className='entity-label '+type;const icon=document.createElement('span');icon.textContent=type==='car'?'◇':type==='plane'?'✧':'';const title=document.createElement('span');title.textContent=name;const sub=document.createElement('small');el.append(icon,title,sub);$('entity-labels').append(el);return {el,title,sub,object,offset};}
  const car={type:'car',name:'WAYFARER GT',g:makeCar(),heading:.25,speed:0,lift:0};
  const plane={type:'plane',name:'KESTREL S-2',g:makePlane(),heading:-.20,speed:0,lift:0};
  for(const v of [car,plane]){scene.add(v.g);v.label=label(v.name,v.type,v.g,v.type==='car'?3.5:3.2);entities.push(v);}
  function terrainPose(v){const x=v.g.position.x,z=v.g.position.z,f=2.0,s=Math.sin(v.heading),c=Math.cos(v.heading);const front=height(x-s*f,z-c*f),back=height(x+s*f,z+c*f);const left=height(x-c,z+s),right=height(x+c,z-s);v.g.rotation.set(Math.atan2(front-back,4)*.65,v.heading,-Math.atan2(right-left,2)*.55,'YXZ');v.g.position.y=height(x,z);}
  function placeVehicle(v,initial=false){if(mounted===v){notice('停車して降りてから再配置してください');return false;}v.speed=0;v.lift=0;v.heading=state.yaw+(v.type==='car'?.28:-.25);const side=v.type==='car'?-1:1,space=v.type==='car'?7:15;let x=state.x+Math.cos(state.yaw)*space*side-Math.sin(state.yaw)*8,z=state.z-Math.sin(state.yaw)*space*side-Math.cos(state.yaw)*8;if(lakeDistance(x,z)<115){x=home.x+space*side;z=home.z-8;}x=clamp(x,-1390,1390);z=clamp(z,-1390,1390);v.g.position.set(x,height(x,z),z);terrainPose(v);if(!initial)notice(v.name+' を近くに配置しました');return true;}
  placeVehicle(car,true);placeVehicle(plane,true);
  // Dock stones and expedition crates visually anchor the starting area.
  const camp=new T.Group();camp.position.set(home.x-14,height(home.x-14,home.z-1),home.z-1);scene.add(camp);const crateMat=M('#807450',.1,.8);for(let i=0;i<4;i++){const c=bevel(camp,crateMat,(i%2)*1.3,Math.floor(i/2)*.65+.32,0,1.1,.61,.81,.06);box(camp,darkMetal,(i%2)*1.3,Math.floor(i/2)*.65+.64,0,.07,.03,.85);}rod(camp,steel,[-2,0,0],[-2,4.2,0],.055);const flag=mesh(new T.PlaneGeometry(1.55,.88,5,4),new T.MeshStandardMaterial({map:textTexture('WILDFRONT','#e5dcc0','#47604f'),side:T.DoubleSide}),camp,-1.24,3.6,0);const flagBase=flag.geometry.attributes.position.array.slice();

  function setMounted(v){mounted=v;player.visible=!v;state.jump=0;state.vy=0;state.onGround=true;$('vehicle-dashboard').hidden=!v;document.body.classList.toggle('mounted',!!v);$('interact-label').textContent=v?'降りる':'乗る';$('jump-label').textContent=v&&v.type==='plane'?'上昇':'ジャンプ';$('descend-button').hidden=!v||v.type!=='plane';$('dodge-button').disabled=!!v;$('run-button').querySelector('span').textContent=v?'ブースト':'走る';if(v){state.x=v.g.position.x;state.z=v.g.position.z;state.y=v.g.position.y;state.yaw=v.heading;state.pitch=.15;$('vehicle-name').textContent=v.name;notice(v.type==='plane'?'上で加速 → 上昇を押して離陸。降下で着陸':'上下でアクセル・後退 / 左右でハンドル');}else notice('乗り物から降りました');}
  function interact(){if(dead||ctx.getPaused())return false;if(mounted){if(Math.abs(mounted.speed)>3){notice('速度を落とし、停車してから降りてください');return false;}if(mounted.type==='plane'&&mounted.lift>1.2){notice('着陸してから降りてください');return false;}const v=mounted;state.x=clamp(v.g.position.x+Math.cos(v.heading)*3,-1430,1430);state.z=clamp(v.g.position.z-Math.sin(v.heading)*3,-1430,1430);state.y=height(state.x,state.z);player.position.set(state.x,state.y,state.z);v.speed=0;setMounted(null);return true;}const near=[car,plane].filter(v=>Math.hypot(v.g.position.x-state.x,v.g.position.z-state.z)<(v.type==='plane'?8:5)).sort((a,b)=>a.g.position.distanceTo(player.position)-b.g.position.distanceTo(player.position))[0];if(!near){notice('車・飛行機に近づいて「乗る」。雷アイコンで呼び出せます');return false;}setMounted(near);return true;}
  let ascendHeld=false,descendHeld=false;
  function holdButton(button,change){button.addEventListener('pointerdown',e=>{e.preventDefault();if(ctx.getPaused()||dead)return;change(true);if(e.isTrusted)button.setPointerCapture(e.pointerId);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(ev,()=>change(false));}
  holdButton($('jump-button'),v=>ascendHeld=v);holdButton($('descend-button'),v=>descendHeld=v);window.addEventListener('blur',()=>{ascendHeld=descendHeld=false;});
  function drive(dt,input){if(!mounted||dead)return;const v=mounted,boost=input.running;const forward=-input.mz,steer=input.mx;
    if(v.type==='car'){const max=boost?45:31;v.speed+=forward*19*dt;v.speed*=Math.exp(-(Math.abs(forward)<.05?1.25:.20)*dt);v.speed=clamp(v.speed,-12,max);v.heading-=steer*1.05*dt*clamp(Math.abs(v.speed)/5,.08,1)*Math.sign(v.speed||1);}
    else{v.speed+=forward*14*dt;v.speed*=Math.exp(-(v.lift>1?.065:.35)*dt);v.speed=clamp(v.speed,0,boost?68:53);v.heading-=steer*.66*dt*clamp(v.speed/12,0,1);const ascend=ascendHeld||keys.has('Space'),descend=descendHeld||keys.has('KeyQ');if(ascend&&v.speed>14)v.lift+=Math.min(18,v.speed*.4)*dt;if(descend)v.lift-=15*dt;if(v.speed<17)v.lift-=Math.max(2,17-v.speed)*dt;v.lift=clamp(v.lift,0,360);}
    let nx=clamp(v.g.position.x-Math.sin(v.heading)*v.speed*dt,-1410,1410),nz=clamp(v.g.position.z-Math.cos(v.heading)*v.speed*dt,-1410,1410);
    if((v.type==='car'||v.lift<3)&&lakeDistance(nx,nz)<104){v.speed=-v.speed*.18;notice('深い水辺には入れません');nx=v.g.position.x;nz=v.g.position.z;}
    if(Math.abs(nx)>=1410||Math.abs(nz)>=1410)v.speed*=.8;
    v.g.position.set(nx,height(nx,nz)+v.lift,nz);
    if(v.type==='car'||v.lift<1)terrainPose(v);else{v.g.rotation.order='YXZ';v.g.rotation.y=v.heading;v.g.rotation.x=lerp(v.g.rotation.x,(ascendHeld||keys.has('Space'))?.17:(descendHeld||keys.has('KeyQ'))?-.17:0,1-Math.exp(-dt*4));v.g.rotation.z=lerp(v.g.rotation.z,steer*.36,1-Math.exp(-dt*3));}
    state.x=nx;state.z=nz;state.y=v.g.position.y;player.position.copy(v.g.position);state.moving=0;state.jump=0;
    const camYaw=state.yaw;const distance=v.type==='plane'?18:11;const desired=new T.Vector3(nx+Math.sin(camYaw)*distance,state.y+5.2+Math.sin(state.pitch)*distance,nz+Math.cos(camYaw)*distance);desired.y=Math.max(desired.y,height(desired.x,desired.z)+1.8);camera.position.lerp(desired,1-Math.exp(-dt*4));camera.lookAt(nx,state.y+1.45,nz);
    // Unless the player drags to look around, the chase camera gently tracks turns.
    const delta=Math.atan2(Math.sin(v.heading-state.yaw),Math.cos(v.heading-state.yaw));if(Math.abs(steer)>.04)state.yaw+=delta*(1-Math.exp(-dt*1.7));
    for(const w of wheels)if(v.g===w.parent)w.rotation.x-=v.speed*dt*1.7;
    $('vehicle-speed').textContent=Math.round(Math.abs(v.speed)*3.6);$('vehicle-detail').textContent=v.type==='plane'?`対地高度 ${Math.round(v.lift)} m · ${v.lift>2?'AIRBORNE':'GROUND'}`:'AWD · '+(v.speed<-.1?'REVERSE':boost?'BOOST':'DRIVE');$('vehicle-help').textContent=v.type==='plane'?'加速＋上昇で離陸 / 減速＋降下で着陸':'スティックで加速・操舵 / ブーストで高速走行';
  }

  // Articulated enemies. Greenskins are distinct from the masked human faction.
  const skinGreen=M('#71833f'),skinHuman=M('#b98d69'),factionCloth=M('#4b4842'),goblinLeather=M('#655032'),bone=M('#d7caa0'),armor=M('#586665',.7,.46),bossSkin=M('#655f4a'),eyesMat=new T.MeshStandardMaterial({color:'#ffc15b',emissive:'#ff8b22',emissiveIntensity:2.2});
  function makeEnemy(type){const root=new T.Group(),human=type==='creatures',isBoss=type==='boss';const body=new T.Group();root.add(body);const skin=isBoss?bossSkin:human?skinHuman:skinGreen,cloth=human?factionCloth:goblinLeather;
    const torso=mesh(new T.CylinderGeometry(human?.29:.40,human?.32:.33,.77,12),cloth,body,0,1.21,0);bevel(body,armor,0,1.33,-.29,.57,.60,.12,.05);rod(body,brass,[-.27,1.53,-.37],[.24,1.03,-.37],.037);
    sphere(body,skin,0,1.93,0,human?.24:.36,human?.29:.29,human?.23:.27);sphere(body,skin,0,1.84,-.23,.20,.13,.15);
    if(!human){for(const side of [-1,1]){const ear=mesh(new T.ConeGeometry(.14,.52,8),skin,body,side*.43,2.00,0);ear.rotation.z=-side*Math.PI/2.7;const fang=mesh(new T.ConeGeometry(.05,.20,8),bone,body,side*.12,1.78,-.32);fang.rotation.x=.23;sphere(body,eyesMat,side*.12,1.97,-.267,.043,.032,.026);}}
    else{const hood=mesh(new T.SphereGeometry(.31,16,12,0,Math.PI*2,0,Math.PI*.6),factionCloth,body,0,2.04,.03);hood.rotation.x=-.13;bevel(body,darkMetal,0,1.87,-.232,.36,.17,.10,.025);for(const side of [-1,1])sphere(body,eyesMat,side*.09,2.01,-.233,.027,.015,.02);const sash=box(body,red,0,1.10,-.36,.11,.58,.025);sash.rotation.z=.5;decal(body,'C',0,1.43,-.37,.19,.18,Math.PI,'#dfb992');}
    const legs=[],arms=[];for(const side of [-1,1]){const leg=new T.Group();leg.position.set(side*.20,.87,0);body.add(leg);rod(leg,cloth,[0,0,0],[0,-.50,.025],.13,.115);bevel(leg,darkMetal,0,-.64,-.10,.24,.24,.38,.045);legs.push(leg);const arm=new T.Group();arm.position.set(side*.42,1.57,0);body.add(arm);rod(arm,skin,[0,0,0],[side*.10,-.49,-.03],.10,.14);sphere(arm,skin,side*.10,-.55,-.04,.12);const pad=sphere(arm,armor,0,.02,0,.23,.17,.23);arms.push(arm);}
    const weapon=new T.Group();arms[1].add(weapon);weapon.position.set(.08,-.49,-.1);rod(weapon,goblinLeather,[0,0,0],[0,.90,0],.043);if(human){bevel(weapon,steel,0,.79,0,.11,.87,.055,.02);bevel(weapon,brass,0,.31,0,.35,.065,.11,.02);}else{bevel(weapon,armor,.12,.75,0,.46,.40,.12,.055);for(let i=0;i<3;i++){const spike=mesh(new T.ConeGeometry(.055,.18,8),bone,weapon,.12+i*.1,.98,0);}}
    if(isBoss){root.scale.setScalar(3.7);for(const side of [-1,1]){const horn=mesh(new T.ConeGeometry(.18,.92,12),bone,body,side*.31,2.46,.02);horn.rotation.z=-side*.38;for(let i=0;i<3;i++){const spike=mesh(new T.ConeGeometry(.10,.40,8),bone,body,side*(.45+i*.10),1.85-i*.10,0);spike.rotation.z=-side*.65;}}sphere(body,new T.MeshStandardMaterial({color:'#e7a459',emissive:'#ef912d',emissiveIntensity:2}),0,1.32,-.40,.13);}
    if(!human&&!isBoss)root.scale.set(.85,.82,.85);
    return {g:root,body,legs,arms,weapon};
  }
  function spawnEnemy(type,x,z,index=0){const model=makeEnemy(type);model.g.position.set(x,height(x,z),z);scene.add(model.g);const maxHP=type==='boss'?900:type==='creatures'?100:65;const e={...model,type,x,z,homeX:x,homeZ:z,hp:maxHP,maxHP,attackTimer:.5+index*.17,windup:0,phase:1,dead:false,deathAge:0,hit:0,aggro:false,walk:0,index,retreat:0,ring:null,ringRadius:0,special:0};e.label=label(type==='boss'?'嵐喰らい、グロム':type==='creatures'?'クリーチャーズ':'ゴブリン','enemy '+type,e.g,type==='boss'?10:2.5);const track=document.createElement('span');track.className='enemy-health';const fill=document.createElement('i');track.append(fill);e.label.el.append(track);e.fill=fill;enemies.push(e);return e;}
  function safeEnemyPoint(x,z){x=clamp(x,-1370,1370);z=clamp(z,-1370,1370);if(lakeDistance(x,z)<107){const a=Math.atan2(z+258,(x-158)/1.22);x=158+Math.cos(a)*113*1.22;z=-258+Math.sin(a)*113;}return {x,z};}
  function spawnGroup(type,ambush=false){const count=type==='creatures'?8:6;if(enemies.filter(e=>!e.dead&&e.type===type).length>=count*2){notice('すでに周辺に襲撃隊がいます');return false;}const centerX=ambush?state.x:home.x+(type==='creatures'?-85:59),centerZ=ambush?state.z:home.z-(type==='creatures'?105:65);for(let i=0;i<count;i++){const a=i/count*Math.PI*2+.32,r=ambush?26+i%3*3:5+i%3*2;const p=safeEnemyPoint(centerX+Math.cos(a)*r,centerZ+Math.sin(a)*r);const e=spawnEnemy(type,p.x,p.z,i);e.aggro=ambush;}if(ambush){activeEncounter=type;combatTimer=12;notice(type==='creatures'?'襲撃！クリーチャーズが包囲している':'ゴブリンの群れが現れた',5);}return true;}
  spawnGroup('goblin');spawnGroup('creatures');
  function startBoss(){if(boss&&!boss.dead){notice('ボスとの戦いは、まだ終わっていません');return false;}if(mounted&&mounted.lift>10){notice('ボスに挑むには、地上に戻ってください');return false;}const p=safeEnemyPoint(state.x-Math.sin(state.yaw)*35,state.z-Math.cos(state.yaw)*35);boss=spawnEnemy('boss',p.x,p.z);boss.aggro=true;activeEncounter='boss';setWeather('storm');$('boss-hud').hidden=false;notice('WORLD BOSS — 嵐喰らい、グロム',5);return true;}

  // Player weapon, visible pulse projectiles, hit sparks and readable area telegraphs.
  const sword=new T.Group();sword.position.set(.43,1.15,-.03);player.add(sword);rod(sword,goblinLeather,[0,-.11,0],[0,.30,0],.042);bevel(sword,brass,0,.30,0,.39,.065,.13,.02);bevel(sword,steel,0,.87,0,.12,1.07,.046,.012);const tip=mesh(new T.ConeGeometry(.087,.22,4),steel,sword,0,1.50,0);sword.rotation.z=-.27;
  const projectileGeo=new T.SphereGeometry(.14,12,8),projectileMat=new T.MeshBasicMaterial({color:'#b8eff4'}),sparkGeo=new T.IcosahedronGeometry(.045,0),sparkMat=new T.MeshBasicMaterial({color:'#ffe1a2'});
  function burst(x,y,z,color=0xffdea0){for(let i=0;i<9;i++){const m=mesh(sparkGeo,color===0x9eefff?cyanSpark:color===0xaee6b2?greenSpark:sparkMat,scene,x,y,z);m.castShadow=false;m.receiveShadow=false;effects.push({m,life:.45,total:.45,v:new T.Vector3((Math.random()-.5)*6,Math.random()*4,(Math.random()-.5)*6)});}}
  const cyanSpark=new T.MeshBasicMaterial({color:0x9eefff}),greenSpark=new T.MeshBasicMaterial({color:0xaee6b2});
  const targetRing=new T.Mesh(new T.RingGeometry(.65,.72,40),new T.MeshBasicMaterial({color:0xffe4a5,transparent:true,opacity:.65,side:T.DoubleSide,depthWrite:false}));
  targetRing.rotation.x=-Math.PI/2;targetRing.visible=false;scene.add(targetRing);
  const trail=new T.InstancedMesh(new T.OctahedronGeometry(.15),new T.MeshBasicMaterial({color:0xffe9a8,transparent:true,opacity:.85,depthWrite:false}),18);
  trail.instanceMatrix.setUsage(T.DynamicDrawUsage);trail.frustumCulled=false;trail.visible=false;scene.add(trail);
  const trailDummy=new T.Object3D();
  function wave(x,z,r,color=0x9eefff,arc=Math.PI*2){
    const g=new T.RingGeometry(r*.91,r,48,1,0,arc);g.rotateX(-Math.PI/2);
    const m=new T.Mesh(g,new T.MeshBasicMaterial({color,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}));
    m.position.set(x,height(x,z)+.3,z);m.rotation.y=-player.rotation.y;scene.add(m);
    effects.push({m,life:.5,total:.5,v:new T.Vector3(),ring:true});
  }
  function sense(){if(dead||ctx.getPaused()||senseCD>0)return false;senseTime=9;senseCD=12;wave(state.x,state.z,8,0xffe4a5);cue('sense');return true;}
  $('sense-button').addEventListener('click',sense);
  function beginAttack(){if(dead||ctx.getPaused()||attackHeld)return;attackHeld=true;chargeTime=0;}
  function releaseAttack(){if(!attackHeld)return;const charged=chargeTime>=.65;attackHeld=false;chargeTime=0;attack(charged);}
  function cancelAttack(){attackHeld=false;attackPointer=null;chargeTime=0;queuedAttack=0;}
  function dropPickup(e){
    if(pickups.length>=40){scene.remove(pickups.shift().m);}
    const m=new T.Mesh(projectileGeo,greenSpark);m.scale.setScalar(1.7);m.position.set(e.x,height(e.x,e.z)+.9,e.z);scene.add(m);pickups.push({m,life:35,age:0});
  }
  function sensoryStep(dt){
    regenDelay=Math.max(0,regenDelay-dt);if(regenDelay===0)stamina=Math.min(100,stamina+26*dt);
    comboTime=Math.max(0,comboTime-dt);if(comboTime===0)combo=0;
    focusTime=Math.max(0,focusTime-dt);empowered=Math.max(0,empowered-dt);senseTime=Math.max(0,senseTime-dt);senseCD=Math.max(0,senseCD-dt);feedbackTime=Math.max(0,feedbackTime-dt);
    if(attackHeld){chargeTime=Math.min(1.2,chargeTime+dt);if(chargeTime>=.65&&chargeTime-dt<.65)cue('ready');}
    if(queuedAttack>0){queuedAttack-=dt;if(attackCD===0){queuedAttack=0;attack();}}
    for(let i=pickups.length-1;i>=0;i--){const p=pickups[i];p.life-=dt;p.age+=dt;const dx=state.x-p.m.position.x,dz=state.z-p.m.position.z,dist=Math.hypot(dx,dz),low=state.y-height(state.x,state.z)<5;
      if(dist<9&&low){p.m.position.x+=dx*Math.min(1,dt*5);p.m.position.z+=dz*Math.min(1,dt*5);}
      p.m.position.y=height(p.m.position.x,p.m.position.z)+.9+Math.sin(p.age*4)*.16;
      if(dist<1.6&&low){hp=Math.min(100,hp+6);stamina=Math.min(100,stamina+18);collected++;if(collected%3===0)potions=Math.min(3,potions+1);cue('pickup');burst(state.x,state.y+1,state.z,0xaee6b2);p.life=0;}
      if(p.life<=0){scene.remove(p.m);pickups.splice(i,1);}
    }
    for(const p of sanctuaries){p.cooldown=Math.max(0,p.cooldown-dt);if(discovered.has(p.id)&&p.cooldown===0&&Math.hypot(state.x-p.x,state.z-p.z)<12&&state.y-height(state.x,state.z)<5&&(hp<100||stamina<90||potions<3)){hp=100;stamina=100;potions=3;p.cooldown=45;wave(p.x,p.z,12,0xaee6b2);cue('sense');}}
    const goal=sanctuaries.find(p=>!discovered.has(p.id));trail.visible=senseTime>0&&!!goal;
    if(trail.visible){const dx=goal.x-state.x,dz=goal.z-state.z,len=Math.hypot(dx,dz)||1;
      for(let i=0;i<18;i++){const dist=Math.min(len,3+i*2.8+(elapsed*4)%2.8),x=state.x+dx/len*dist,z=state.z+dz/len*dist;trailDummy.position.set(x,height(x,z)+.7+Math.sin(elapsed*3-i*.5)*.2,z);trailDummy.rotation.y=elapsed;trailDummy.scale.setScalar(1-i*.035);trailDummy.updateMatrix();trail.setMatrixAt(i,trailDummy.matrix);}trail.instanceMatrix.needsUpdate=true;
    }
  }
  function hurtPlayer(amount){if(dead||invincible>0||!Number.isFinite(amount)||amount<=0)return false;hp=Math.max(0,hp-amount);combo=0;comboTime=0;cancelAttack();cue('hurt');invincible=.55;hurtTimer=.30;combatTimer=9;burst(state.x,state.y+1,state.z);if(hp<=0){dead=true;if(mounted){mounted.speed=0;setMounted(null);}player.visible=true;ctx.resetInputs?.();player.rotation.z=-Math.PI/2;$('defeat-dialog').showModal();keys.clear();noticeTimer=0;persist();}return true;}
  function hitEnemy(e,damage){if(e.dead)return;e.hp=Math.max(0,e.hp-damage);e.aggro=true;e.hit=.18;cue('hit');if(e.type!=='boss'){const len=Math.hypot(e.x-state.x,e.z-state.z)||1;const p=safeEnemyPoint(e.x+(e.x-state.x)/len*.65,e.z+(e.z-state.z)/len*.65);e.x=p.x;e.z=p.z;}burst(e.x,e.g.position.y+(e.type==='boss'?4:1.4),e.z);combatTimer=7;if(e.hp<=0){e.dead=true;e.deathAge=0;e.label.el.style.display='none';if(e.ring){scene.remove(e.ring);e.ring.geometry.dispose();e.ring.material.dispose();e.ring=null;}kills++;dropPickup(e);if(e.type==='boss'){bossWins++;$('boss-hud').hidden=true;potions=Math.min(3,potions+2);notice('BOSS DEFEATED — 嵐喰らいを討伐。回復薬を獲得',6);activeEncounter=null;}persist();}}
  function attack(charged=false){
    if(dead||ctx.getPaused())return false;
    if(attackCD>0){if(attackCD<.2&&!charged)queuedAttack=.22;return false;}
    const cost=mounted?0:charged?32:8;if(!spend(cost))return false;
    combo=comboTime>0?combo%3+1:1;comboTime=1.25;attackCD=mounted?.25:charged?.72:combo===3?.55:.32;
    const target=targetEnemy(),power=empowered>0?1.65:1;empowered=0;
    const damage=(charged?84:combo===3?58:combo===2?43:36)*power;
    const reach=charged?6:3.9;wave(state.x,state.z,reach,charged?0x9eefff:0xffe4a5,charged||combo===3?Math.PI*2:Math.PI*1.2);cue(charged?'charged':'swing');
    if(!mounted&&target&&Math.hypot(target.x-state.x,target.z-state.z)<reach){
      player.rotation.y=Math.atan2(state.x-target.x,state.z-target.z);
      const victims=charged||combo===3?enemies.filter(e=>!e.dead&&Math.hypot(e.x-state.x,e.z-state.z)<reach):[target];victims.forEach(e=>hitEnemy(e,damage));
    }else{
      const origin=new T.Vector3(state.x,state.y+(mounted?2.4:1.48),state.z);
      const dir=target?new T.Vector3(target.x,target.g.position.y+(target.type==='boss'?4:1.3),target.z).sub(origin).normalize():new T.Vector3(-Math.sin(state.yaw),.01,-Math.cos(state.yaw));
      const m=mesh(projectileGeo,projectileMat,scene);m.position.copy(origin).addScaledVector(dir,mounted?3:1);m.scale.setScalar(charged?2.4:1);m.castShadow=false;
      projectiles.push({m,dir,life:2.7,damage:mounted?25:damage*.9,speed:75});
    }
    return true;
  }
  function dodge(){
    if(dead||ctx.getPaused()||mounted||dodgeCD>0||!spend(25))return false;
    cancelAttack();dodgeCD=.85;invincible=.46;dodgeTime=.26;
    const len=Math.hypot(moveX,moveZ);dodgeX=len>.1?moveX/len:Math.sin(state.yaw);dodgeZ=len>.1?moveZ/len:Math.cos(state.yaw);
    const perfect=enemies.some(e=>!e.dead&&e.windup>0&&e.windup<.3&&Math.hypot(state.x-(e.type==='boss'?e.strikeX:e.x),state.z-(e.type==='boss'?e.strikeZ:e.z))<(e.type==='boss'?(e.phase===2?13:10):3.3));
    if(perfect){focusTime=1.25;invincible=1.25;empowered=3;stamina=Math.min(100,stamina+20);perfectDodges++;feedbackTime=.5;wave(state.x,state.z,5);cue('perfect');}else{wave(state.x,state.z,1.4);cue('dodge');}
    return true;
  }
  function heal(){if(dead||ctx.getPaused()||potions<=0||hp>=100||healCD>0)return false;potions--;hp=Math.min(100,hp+55);healCD=1;wave(state.x,state.z,3,0xaee6b2);cue('pickup');notice('体力を回復した');return true;}
  function respawn(){enemies.forEach(e=>{if(!e.dead){e.aggro=false;e.windup=0;e.attackTimer=2;if(Math.hypot(e.homeX-home.x,e.homeZ-home.z)<65){const angle=e.index*.71+1.2;const safe=safeEnemyPoint(home.x+Math.cos(angle)*100,home.z+Math.sin(angle)*100);e.homeX=safe.x;e.homeZ=safe.z;}e.g.position.set(e.homeX,height(e.homeX,e.homeZ),e.homeZ);e.x=e.homeX;e.z=e.homeZ;if(e.ring){scene.remove(e.ring);e.ring.geometry.dispose();e.ring.material.dispose();e.ring=null;}}});if(boss&&!boss.dead){boss.hp=boss.maxHP;boss.phase=1;boss.aggro=false;}hp=100;potions=3;stamina=100;exhausted=false;regenDelay=0;combo=0;comboTime=0;dodgeCD=0;attackCD=0;focusTime=0;empowered=0;feedbackTime=0;moveX=moveZ=0;cancelAttack();ctx.resetInputs?.();dead=false;invincible=8;dodgeTime=0;combatTimer=0;state.x=home.x;state.z=home.z;state.y=height(home.x,home.z);state.yaw=0;state.jump=0;state.vy=0;state.onGround=true;player.position.set(state.x,state.y,state.z);player.rotation.set(0,0,0);setMounted(null);$('defeat-dialog').close();$('boss-hud').hidden=true;notice('拠点に復帰。8秒間の保護があります');persist();}
  $('defeat-dialog').addEventListener('cancel',e=>e.preventDefault());$('respawn-button').addEventListener('click',respawn);$('attack-button').addEventListener('pointerdown',e=>{e.preventDefault();if(attackPointer!==null)return;attackPointer=e.pointerId;beginAttack();if(e.isTrusted)e.currentTarget.setPointerCapture(e.pointerId);});
  $('attack-button').addEventListener('click',e=>{if(e.detail===0)attack();});
  $('dodge-button').addEventListener('click',e=>{if(e.detail===0)dodge();});
  $('attack-button').addEventListener('pointerup',e=>{if(e.pointerId!==attackPointer)return;attackPointer=null;releaseAttack();});
  for(const ev of ['pointercancel','lostpointercapture'])$('attack-button').addEventListener(ev,cancelAttack);
  window.addEventListener('blur',()=>{cancelAttack();ascendHeld=descendHeld=false;moveX=moveZ=0;});
  $('interact-button').addEventListener('click',interact);$('dodge-button').addEventListener('pointerdown',e=>{e.preventDefault();dodge();});$('heal-button').addEventListener('click',heal);
  function ringAt(x,z,r){
    const base=height(x,z),geo=new T.RingGeometry(0,r,72,8);geo.rotateX(-Math.PI/2);
    const p=geo.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,height(x+p.getX(i),z+p.getZ(i))-base+.16);
    geo.computeVertexNormals();
    const mat=new T.MeshBasicMaterial({color:'#dc6339',transparent:true,opacity:.30,side:T.DoubleSide,depthWrite:false});
    const m=new T.Mesh(geo,mat);m.position.set(x,base,z);scene.add(m);return m;
  }
  function enemyStep(dt){for(const e of enemies){if(e.dead){e.deathAge+=dt;e.g.rotation.z=lerp(e.g.rotation.z,-Math.PI/2,dt*5);e.g.position.y=height(e.x,e.z)-Math.max(0,e.deathAge-1)*.6;if(e.deathAge>3){e.g.visible=false;e.label.el.style.display='none';}continue;}
      e.hit=Math.max(0,e.hit-dt);e.attackTimer-=dt;const distance=Math.hypot(state.x-e.x,state.z-e.z),high=state.y-height(state.x,state.z)>7;
      if(distance<34&&!dead&&!high)e.aggro=true;if(distance>125||dead)e.aggro=false;
      if(e.type==='boss'&&e.hp<e.maxHP*.5)e.phase=2;
      const attacking=e.aggro&&!high&&!dead;const speed=e.type==='boss'?(e.phase===2?6.5:4.1):e.type==='creatures'?5.5:4.2;
      if(attacking){combatTimer=Math.max(combatTimer,1);if(e.type==='boss')$('boss-hud').hidden=false;let tx=state.x,tz=state.z;const melee=e.type==='boss'?7:2.05;
        if(e.windup>0){e.windup-=dt;e.arms[1].rotation.x=-1.7+Math.sin(elapsed*18)*.1;if(e.ring)e.ring.material.opacity=.3+Math.sin(elapsed*14)*.13;if(e.windup<=0){if(e.type==='boss'){const blast=e.phase===2?13:10;if(Math.hypot(state.x-e.strikeX,state.z-e.strikeZ)<blast&&!high&&state.jump<.8)hurtPlayer(e.phase===2?34:26);burst(e.strikeX,height(e.strikeX,e.strikeZ)+.8,e.strikeZ);if(e.ring){effects.push({m:e.ring,life:.35,total:.35,v:new T.Vector3(),ring:true});e.ring=null;}}else if(distance<3.0)hurtPlayer(e.type==='creatures'?10:8);e.attackTimer=e.type==='boss'?(e.phase===2?2.5:3.4):1.4;}}
        else if(distance<melee&&e.attackTimer<=0){e.windup=e.type==='boss'?1.35:.55;e.strikeX=state.x;e.strikeZ=state.z;if(e.type==='boss'){e.ring=ringAt(e.strikeX,e.strikeZ,e.phase===2?13:10);$('boss-hint').textContent='地面が赤く光ったら、その外へ！ジャンプでも回避可能';}}
        else if(distance>melee*.85){if(e.type==='creatures'&&distance>7){const a=e.index/8*Math.PI*2;tx+=Math.cos(a)*5;tz+=Math.sin(a)*5;}let dx=tx-e.x,dz=tz-e.z,len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
          // Local separation keeps the human band from collapsing into one model.
          for(const other of enemies){if(other===e||other.dead)continue;const ox=e.x-other.x,oz=e.z-other.z,r=Math.hypot(ox,oz);if(r>.01&&r<1.8){dx+=ox/r*(1.8-r)*.75;dz+=oz/r*(1.8-r)*.75;}}
          const stagger=e.hit>0?.15:1;const p=safeEnemyPoint(e.x+dx*speed*dt*stagger,e.z+dz*speed*dt*stagger);e.x=p.x;e.z=p.z;e.walk+=dt*speed*2.2;}
        e.g.rotation.y=Math.atan2(e.x-state.x,e.z-state.z);
      }else{const tx=e.homeX+Math.sin(elapsed*.16+e.index)*3,tz=e.homeZ+Math.cos(elapsed*.16+e.index)*3;const dist=Math.hypot(tx-e.x,tz-e.z);if(dist>.5){e.x+=(tx-e.x)/dist*dt*.7;e.z+=(tz-e.z)/dist*dt*.7;e.walk+=dt*1.8;}e.windup=0;if(e.ring){scene.remove(e.ring);e.ring.geometry.dispose();e.ring.material.dispose();e.ring=null;}}
      e.g.position.set(e.x,height(e.x,e.z),e.z);e.body.rotation.z=e.hit>0?Math.sin(e.hit*40)*.13:0;e.legs[0].rotation.x=Math.sin(e.walk)*.48;e.legs[1].rotation.x=-Math.sin(e.walk)*.48;if(e.windup<=0)e.arms[1].rotation.x=lerp(e.arms[1].rotation.x,Math.sin(e.walk)*.3,dt*7);e.arms[0].rotation.x=-Math.sin(e.walk)*.3;e.fill.style.width=(e.hp/e.maxHP*100)+'%';e.label.el.classList.toggle('winding',e.windup>0);e.label.el.classList.toggle('wounded',e.hp<e.maxHP);
      if(mounted&&Math.abs(mounted.speed)>8&&distance<3.3&&!high&&e.hit<=0)hitEnemy(e,Math.abs(mounted.speed)*1.5);
    }
    // Reclaim defeated models and their label nodes to bound repeated event sessions.
    for(let i=enemies.length-1;i>=0;i--){const e=enemies[i];if(e.dead&&e.deathAge>10){scene.remove(e.g);e.g.traverse(o=>{if(o.isMesh){o.geometry.dispose();if(o.material.map){o.material.map.dispose();o.material.dispose();}}});e.label.el.remove();enemies.splice(i,1);}}
  }
  function projectileStep(dt){for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i],start=p.m.position.clone();p.m.position.addScaledVector(p.dir,p.speed*dt);p.life-=dt;const segment=p.m.position.clone().sub(start),den=segment.lengthSq();for(const e of enemies){if(e.dead)continue;const center=new T.Vector3(e.x,e.g.position.y+(e.type==='boss'?4:1.3),e.z);const t=clamp(center.clone().sub(start).dot(segment)/(den||1),0,1);if(start.clone().addScaledVector(segment,t).distanceTo(center)<(e.type==='boss'?3.7:.85)){hitEnemy(e,p.damage);p.life=0;break;}}if(p.life<=0||p.m.position.y<height(p.m.position.x,p.m.position.z)){scene.remove(p.m);projectiles.splice(i,1);}}
    for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;e.m.position.addScaledVector(e.v,dt);if(!e.ring)e.v.y-=6*dt;else{e.m.scale.setScalar(1+(1-e.life/e.total)*.15);e.m.material.opacity=Math.max(0,e.life/e.total)*.5;}if(e.life<=0){scene.remove(e.m);if(e.ring){e.m.geometry.dispose();e.m.material.dispose();}effects.splice(i,1);}}
  }

  // Weather affects the sky shader, fog, lighting, wind speed and material wetness.
  const rainCount=3500,rainPositions=new Float32Array(rainCount*6),rainSeeds=new Float32Array(rainCount*3);for(let i=0;i<rainCount;i++){rainSeeds[i*3]=(random()-.5)*110;rainSeeds[i*3+1]=random()*55;rainSeeds[i*3+2]=(random()-.5)*110;}
  const rainGeo=new T.BufferGeometry();rainGeo.setAttribute('position',new T.BufferAttribute(rainPositions,3).setUsage(T.DynamicDrawUsage));const rain=new T.LineSegments(rainGeo,new T.LineBasicMaterial({color:'#c2d7df',transparent:true,opacity:0,depthWrite:false}));rain.frustumCulled=false;rain.visible=false;scene.add(rain);
  const lightningLight=new T.DirectionalLight('#d9e8ff',0);lightningLight.position.set(20,120,-40);scene.add(lightningLight);
  function setWeather(type){if(!['clear','rain','storm','fog'].includes(type))return false;weather.type=type;weather.target=type==='clear'?0:type==='storm'?1:type==='rain'?.6:.78;weather.age=0;weather.lightningAt=5+Math.random()*7;$('weather-status').textContent={clear:'CLEAR SKIES',rain:'PASSING RAIN',storm:'THUNDERSTORM',fog:'MISTY HIGHLANDS'}[type];$('weather-description').textContent={clear:'晴れ、穏やかな風',rain:'雨、濡れた草の匂い',storm:'雷雨、強い風に注意',fog:'濃霧、視界不良'}[type];document.querySelectorAll('[data-weather]').forEach(b=>b.classList.toggle('selected',b.dataset.weather===type));notice({clear:'雲の切れ間から光が差し込む',rain:'天候イベント — 草原に雨が降り始めた',storm:'天候イベント — 雷雲が近づいている',fog:'天候イベント — 深い霧が草原を包む'}[type]);return true;}
  function weatherStep(dt){weather.age+=dt;weather.intensity=lerp(weather.intensity,weather.target,1-Math.exp(-dt*.25));wet.value=lerp(wet.value,weather.type==='rain'||weather.type==='storm'?weather.intensity:0,1-Math.exp(-dt*.22));cloud.value=weather.intensity;if(skyUniforms.uStorm)skyUniforms.uStorm.value=cloud.value;
    const time=Number($('time-slider').value);sun.intensity=(3.35-time*.8)*(1-weather.intensity*.79);hemi.intensity=(2.35-time*.65)*(1-weather.intensity*.42);scene.fog.density=lerp(scene.fog.density,weather.type==='fog'?.009:weather.type==='storm'?.0028:weather.type==='rain'?.0016:.00065,1-Math.exp(-dt*.3));scene.fog.color.lerp(new T.Color(weather.type==='storm'?'#72868b':weather.type==='fog'?'#adb9b2':'#b2c6b5'),1-Math.exp(-dt*.22));
    rain.visible=(weather.type==='rain'||weather.type==='storm')&&weather.intensity>.02;rain.material.opacity=weather.intensity*.30;
    if(rain.visible){const wind=weather.type==='storm'?7:2;for(let i=0;i<(performanceMode?1200:rainCount);i++){const x=rainSeeds[i*3]+state.x+Math.sin(elapsed*.4+i)*1.3,y=((rainSeeds[i*3+1]-elapsed*28)%55+55)%55+state.y-7,z=rainSeeds[i*3+2]+state.z;const j=i*6;rainPositions[j]=x;rainPositions[j+1]=y;rainPositions[j+2]=z;rainPositions[j+3]=x-wind*.13;rainPositions[j+4]=y+1.65;rainPositions[j+5]=z+.20;}rainGeo.attributes.position.needsUpdate=true;}
    weather.flash=Math.max(0,weather.flash-dt*3.5);if(weather.type==='storm'&&weather.age>weather.lightningAt){weather.flash=.8;weather.lightningAt=weather.age+8+Math.random()*13;const bolt=[];const x=state.x+(Math.random()-.5)*180,z=state.z-100-Math.random()*150;for(let i=0;i<9;i++)bolt.push(new T.Vector3(x+(Math.random()-.5)*12,height(x,z)+120-i*14,z));const geo=new T.BufferGeometry().setFromPoints(bolt),mat=new T.LineBasicMaterial({color:'#e7eeff',transparent:true});const line=new T.Line(geo,mat);scene.add(line);effects.push({m:line,life:.24,total:.24,v:new T.Vector3(),ring:true});}
    lightningLight.intensity=$('motion-toggle').checked?0:weather.flash*5;$('lightning-overlay').style.opacity=weather.flash*.17;
    if(weather.auto&&weather.age>110&&!(boss&&!boss.dead)){const cycle=['clear','rain','storm','fog'];setWeather(cycle[(cycle.indexOf(weather.type)+1)%4]);}
  }
  function eventsUI(){if(dead)return;openDialog('events-dialog');}
  $('events-button').addEventListener('click',eventsUI);$('event-shortcut').addEventListener('click',eventsUI);$('auto-weather').addEventListener('change',e=>weather.auto=e.target.checked);
  document.querySelectorAll('[data-weather]').forEach(b=>b.addEventListener('click',()=>{setWeather(b.dataset.weather);$('events-dialog').close();}));
  document.querySelectorAll('[data-event]').forEach(b=>b.addEventListener('click',()=>{const event=b.dataset.event;if(event==='car')placeVehicle(car);else if(event==='plane')placeVehicle(plane);else if(event==='boss')startBoss();else spawnGroup(event==='goblins'?'goblin':'creatures',true);$('events-dialog').close();}));
  window.addEventListener('keydown',e=>{if(e.repeat||ctx.getPaused()||dead)return;if(e.code==='KeyE'){e.preventDefault();interact();}if(e.code==='KeyJ'){e.preventDefault();beginAttack();}if(e.code==='KeyC'){e.preventDefault();sense();}if(e.code==='KeyF'){e.preventDefault();dodge();}if(e.code==='KeyR'){e.preventDefault();heal();}});
  window.addEventListener('keyup',e=>{if(e.code==='KeyJ')releaseAttack();});
  const projected=new T.Vector3();let hudClock=0;
  function projectLabel(l,maxDistance){const distance=Math.hypot(l.object.position.x-state.x,l.object.position.z-state.z);projected.copy(l.object.position);projected.y+=l.offset;projected.project(camera);const visible=distance<maxDistance&&projected.z<1&&projected.z>-1&&Math.abs(projected.x)<.94&&Math.abs(projected.y)<.88;if(!visible){l.el.style.display='none';return;}l.el.style.display='flex';l.el.style.left=(projected.x*.5+.5)*innerWidth+'px';l.el.style.top=(-projected.y*.5+.5)*innerHeight+'px';l.sub.textContent=Math.round(distance)+' m';}
  function nearbyDanger(){return enemies.filter(e=>!e.dead&&e.windup>0).sort((a,b)=>a.windup-b.windup)[0];}
  function hud(dt){hudClock+=dt;if(hudClock<.1)return;hudClock=0;for(const v of entities){if(mounted===v)v.label.el.style.display='none';else projectLabel(v.label,230);}for(const e of enemies)if(!e.dead)projectLabel(e.label,e.type==='boss'?230:60);
    const target=targetEnemy();targetRing.visible=!!target&&!mounted&&combatTimer>0;
    if(targetRing.visible){targetRing.position.set(target.x,height(target.x,target.z)+.22,target.z);targetRing.scale.setScalar(target.type==='boss'?5:1.5);}
    const danger=nearbyDanger();$('threat-indicator').classList.toggle('visible',!!danger);
    if(danger){const angle=Math.atan2(danger.x-state.x,-(danger.z-state.z))+state.yaw;$('threat-indicator').style.transform=`translate(-50%,-50%) rotate(${angle}rad)`;}
    $('stamina-fill').style.width=stamina+'%';$('stamina-fill').parentElement.setAttribute('aria-valuenow',String(Math.round(stamina)));if(stamina>28)$('stamina-fill').parentElement.classList.remove('empty');
    document.body.classList.toggle('low-health',hp<30);document.body.classList.toggle('focused',focusTime>0);
    $('resonance-flash').style.opacity=feedbackTime>0?feedbackTime*.45:0;
    $('attack-button').classList.toggle('charged',chargeTime>=.65||empowered>0);
    $('attack-button').style.setProperty('--charge',(attackHeld?Math.min(1,chargeTime/.65)*100:0)+'%');
    $('dodge-button').style.setProperty('--cooldown',(dodgeCD/.85*100)+'%');
    $('sense-button').classList.toggle('active',senseTime>0);$('sense-button').disabled=senseCD>0;
    $('attack-button').disabled=!mounted&&stamina<8;$('dodge-button').disabled=!!mounted||stamina<25;
    $('interact-button').hidden=!mounted&&!entities.some(v=>Math.hypot(v.g.position.x-state.x,v.g.position.z-state.z)<(v.type==='plane'?8:5));
    $('interact-button').querySelector('use').setAttribute('href',mounted?.type==='plane'?'#i-plane':'#i-car');
    $('interact-button').setAttribute('aria-label',mounted?'降りる E':'乗る E');
    document.querySelectorAll('#potion-pips b').forEach((p,i)=>p.classList.toggle('filled',i<potions));
    document.querySelectorAll('#combo-pips b').forEach((p,i)=>p.classList.toggle('filled',i<combo));
    document.querySelectorAll('#memory-runes i').forEach((p,i)=>p.classList.toggle('filled',discovered.has(sanctuaries[i].id)));
    $('memory-runes').setAttribute('aria-label',`${discovered.size} / 3 の記憶`);
    $('hp-value').textContent=Math.ceil(hp)+' / 100';$('hp-fill').style.width=hp+'%';$('heal-label').textContent='回復 '+potions;$('heal-button').disabled=potions<=0||hp>=100;$('kill-count').textContent='討伐 '+kills;const near=enemies.filter(e=>!e.dead&&Math.hypot(e.x-state.x,e.z-state.z)<55);$('enemy-count').textContent='周辺の脅威 '+near.length;document.body.classList.toggle('in-combat',combatTimer>0);$('attack-button').style.opacity=attackCD>.08?'.65':'1';$('dodge-button').style.opacity=dodgeCD>0?'.4':'1';$('game-mode-label').textContent=dead?'再起を待っています':mounted?(mounted.type==='car'?'車両で探索':'空から探索'):combatTimer>0?'戦闘中':'自由探索 · 戦闘対応';
    $('event-status').textContent=boss&&!boss.dead?'ワールドボス出現中':near.some(e=>e.type==='creatures'&&e.aggro)?'クリーチャーズが襲撃中':near.some(e=>e.aggro)?'ゴブリンに警戒':weather.type==='storm'?'雷雲の下、慎重に進もう':'雷アイコンで乗り物・イベント';
    if(boss&&!boss.dead){$('boss-fill').style.width=(boss.hp/boss.maxHP*100)+'%';$('boss-phase').textContent=boss.phase===2?'PHASE II · 激昂':'PHASE I';}
  }
  let stoneEventFired=false;
  function update(dt,paused){const sim=paused||dead?0:dt;elapsed+=sim;attackCD=Math.max(0,attackCD-sim);dodgeCD=Math.max(0,dodgeCD-sim);healCD=Math.max(0,healCD-sim);invincible=Math.max(0,invincible-sim);combatTimer=Math.max(0,combatTimer-sim);hurtTimer=Math.max(0,hurtTimer-dt);$('damage-overlay').style.opacity=hurtTimer>0?.8:0;
    noticeTimer=Math.max(0,noticeTimer-dt);if(noticeTimer<=0)$('action-notice').classList.remove('visible');
    if(dodgeTime>0&&sim>0){dodgeTime-=sim;const nx=clamp(state.x+dodgeX*27*sim,-1430,1430),nz=clamp(state.z+dodgeZ*27*sim,-1430,1430);if(lakeDistance(nx,nz)>100){state.x=nx;state.z=nz;state.y=height(nx,nz);player.position.set(nx,state.y+state.jump,nz);}player.rotation.z=Math.sin((.26-dodgeTime)/.26*Math.PI)*.5;}else if(!dead)player.rotation.z=0;
    sword.rotation.x=attackCD>.1?-1.4+Math.sin(attackCD*14)*.8:0;sword.rotation.z=attackCD>.1?-.9:-.27;
    if(sim>0){sensoryStep(sim);enemyStep(sim*(focusTime>0?.25:1));projectileStep(sim);weatherStep(sim);if(elapsed>nextRaid){nextRaid=elapsed+170;if(!mounted||mounted.lift<5)spawnGroup('creatures',true);}if(!stoneEventFired&&Math.hypot(state.x+258,state.z+346)<42&&(!mounted||mounted.lift<5)){stoneEventFired=true;startBoss();}}
    for(const prop of propellers)prop.rotation.z+=sim*(mounted===plane?Math.max(12,plane.speed*1.7):.8);
    const p=flag.geometry.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,flagBase[i*3+2]+Math.sin(elapsed*3+flagBase[i*3]*4)*.10*(flagBase[i*3]+.78));p.needsUpdate=true;
    scenery.update(sim);
    hud(dt);
  }
  function drawMap(c,mx,mz,large){
    c.save();
    for(const site of scenery.sites){const x=mx(site.x),z=mz(site.z);c.fillStyle=site.type==='ruins'?'#b3c8c1':'#d8be8c';c.fillRect(x-2,z-2,4,4);if(large){c.font='11px sans-serif';c.textAlign='center';c.fillText(site.name,x,z-8);}}
    c.restore();
    for(const v of entities){c.fillStyle=v.type==='car'?'#e8d8a6':'#b6dbe4';c.font=large?'20px serif':'12px serif';c.textAlign='center';c.fillText(v.type==='car'?'▣':'✦',mx(v.g.position.x),mz(v.g.position.z));}for(const e of enemies){if(e.dead)continue;c.beginPath();c.fillStyle=e.type==='boss'?'#ffbd76':e.type==='creatures'?'#e79576':'#bbcd74';c.arc(mx(e.x),mz(e.z),e.type==='boss'?5:large?3:2,0,Math.PI*2);c.fill();}}
  const api={setPerformanceMode,setSceneryDensity:scenery.setDensity,getSceneryStats:scenery.stats,get mounted(){return mounted;},get dead(){return dead;},get windSpeed(){return weather.type==='storm'?1.85:1;},pauseInputs(){ascendHeld=descendHeld=false;cancelAttack();moveX=moveZ=0;},prepareMove,sense,drive,update,interact,attack,dodge,heal,drawMap,respawn,setWeather,startBoss,spawnGroup,placeVehicle,getState:()=>({stamina,combo,chargeTime,focusTime,empowered,perfectDodges,senseTime,senseCD,pickups:pickups.length,collected,dodgeCD,attackCD,hp,potions,kills,bossWins,dead,mode:mounted?mounted.type:'foot',vehicleSpeed:mounted?mounted.speed:0,altitude:mounted?mounted.lift:0,weather:weather.type,weatherIntensity:weather.intensity,projectiles:projectiles.length,enemies:enemies.filter(e=>!e.dead).map(e=>({type:e.type,hp:e.hp,x:e.x,z:e.z,aggro:e.aggro,windup:e.windup})),boss:boss?{hp:boss.hp,phase:boss.phase,dead:boss.dead}:null,car:{x:car.g.position.x,z:car.g.position.z},plane:{x:plane.g.position.x,z:plane.g.position.z}})};
  // Test-only deterministic hooks exercise the same production simulation functions.
  if(testing)api.test={beginAttack,releaseAttack,cancelAttack,setStamina(v){stamina=clamp(v,0,100);},setWindup(seconds){const e=targetEnemy();if(e){e.windup=seconds;e.strikeX=state.x;e.strikeZ=state.z;}},teleport(x,z){state.x=x;state.z=z;state.y=height(x,z);player.position.set(x,state.y,z);},step(seconds){for(let t=0;t<seconds;t+=.025)update(.025,false);},drive(seconds,input){for(let t=0;t<seconds;t+=.025)drive(.025,input);},holdAscend(v){ascendHeld=v;},holdDescend(v){descendHeld=v;},hurt(amount){invincible=0;return hurtPlayer(amount);},receiveDamage(amount){return hurtPlayer(amount);},hitNearest(amount){const e=enemies.filter(e=>!e.dead).sort((a,b)=>Math.hypot(a.x-state.x,a.z-state.z)-Math.hypot(b.x-state.x,b.z-state.z))[0];if(e)hitEnemy(e,amount);},reset(){respawn();},clearEnemies(){enemies.forEach(e=>{e.dead=true;e.deathAge=11;});enemyStep(.025);boss=null;$('boss-hud').hidden=true;}};
  if(testing)api.test.prepareBoss=function(){
    api.test.clearEnemies();state.x=home.x;state.z=home.z;state.y=height(home.x,home.z);state.yaw=0;state.pitch=.1;player.position.set(state.x,state.y,state.z);
    startBoss();boss.x=home.x;boss.z=home.z-18;boss.g.position.set(boss.x,height(boss.x,boss.z),boss.z);boss.g.rotation.y=Math.PI;boss.hp=720;
    weatherStep(8);weather.flash=0;lightningLight.intensity=0;$('lightning-overlay').style.opacity=0;combatTimer=10;noticeTimer=0;$('action-notice').classList.remove('visible');
    camera.position.set(state.x,state.y+3.5,state.z+10.5);camera.lookAt(state.x,state.y+1.7,state.z);hud(.2);document.body.dataset.review='boss';
  };
  console.info('Wildfront ready: drivable car, flyable plane, goblins, Creatures squad, boss and 4 weather states.');
  return api;
};
