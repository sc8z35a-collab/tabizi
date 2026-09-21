'use strict';
/* KAZENAGI NT-01. Metres, seconds; independent fixed-step flight and ship-local
   capsule collision. No external physics service or paid/generated assets. */
window.createAirship = function (ctx) {
  const {T, scene, camera, state, player, height, keys, testing} = ctx;
  const $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ship = new T.Group(); ship.name = 'KAZENAGI NT-01'; ship.scale.set(2,1.2,2); scene.add(ship);
  const boundary=ctx.worldBounds-90;
  const cruiseSpeed=76, boostMultiplier=1.65, upperDeckY=3.3, envelopeLift=7.5;
  let boostHeld=false, boosting=false, boostCharge=1, boostLocked=false;
  const textureSize=Math.min(2048,ctx.renderer.capabilities.maxTextureSize);
  const anisotropy=Math.min(8,ctx.renderer.capabilities.getMaxAnisotropy());
  const envelope = new T.Group(), cabin = new T.Group(), roof = new T.Group();
  ship.add(envelope, cabin, roof);envelope.position.y=envelopeLift;
  const obstacles = [], groundSamples = [], doors = [], propellers = [];
  const local = new T.Vector3(0, 0, -12), velocity = new T.Vector3();
  const temp = new T.Vector3(), world = new T.Vector3(), normal = new T.Vector3();
  const forward = new T.Vector3(), eye = new T.Vector3();
  let mode = 'ground', heading = -.28, yawRate = 0, throttle = 0, climb = 0;
  let accumulator = 0, verticalSpeed = 0, footVelocity = 0, contact = false, footGrounded = true;
  let clearance = 0, impact = 0, totalContacts = 0, exterior = true, cutaway = false;
  let autopilot = false, takeoffY = 0, ascentHeld = false, descentHeld = false;
  let input = {mx:0, mz:0, running:false}, hudTick = 0, clock = 0;
  let entry = null, hatch = null, repairHeld=false, hazardClock=0, explosions=0;
  const previousGroundPosition=new T.Vector3(state.x,state.y,state.z);
  const materials = {};
  function mat(name, color, metalness = 0, roughness = .6, extra = {}) {
    return materials[name] = new T.MeshStandardMaterial({color, metalness, roughness, ...extra});
  }
  const white = mat('fabric', '#f1f1e7', .08, .48);
  const blue = mat('blue', '#13578d', .32, .32);
  const navy = mat('navy', '#172f40', .2, .46);
  const silver = mat('silver', '#adbcc0', .8, .28);
  const brass = mat('brass', '#ba9452', .7, .3);
  const wood = mat('wood', '#9b714d', 0, .67);
  const ivory = mat('ivory', '#e8dec8', .05, .66);
  const leather = mat('leather', '#a24f37', 0, .65);
  const dark = mat('dark', '#202d32', .3, .46);
  const carpet = mat('carpet', '#31595e', 0, 1);
  const bedding = mat('bedding', '#eeeadb', 0, 1);
  const glass = mat('glass', '#9acbd5', .15, .15, {transparent:true, opacity:.16, depthWrite:false, side:T.DoubleSide});
  const warm = mat('lamps', '#ffe9b5', 0, .3, {emissive:'#ffce77', emissiveIntensity:1.5});
  const green = mat('green', '#488575', 0, .8);
  const boxGeo = new T.BoxGeometry(1,1,1);
  const sphereGeo = new T.SphereGeometry(1,20,14);
  const balloonGeo = new T.SphereGeometry(1,96,64);
  const cylinderGeo = new T.CylinderGeometry(1,1,1,12);
  function mesh(parent, geo, material, x, y, z, sx=1, sy=1, sz=1) {
    const m = new T.Mesh(geo, material); m.position.set(x,y,z); m.scale.set(sx,sy,sz);
    m.castShadow = material !== glass && material !== warm; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(parent, material, x,y,z,w,h,d) { return mesh(parent,boxGeo,material,x,y,z,w,h,d); }
  function solid(material,x,y,z,w,h,d,name='structure',parent=cabin) {
    const m = box(parent,material,x,y,z,w,h,d);
    obstacles.push({min:new T.Vector3(x-w/2,y-h/2,z-d/2), max:new T.Vector3(x+w/2,y+h/2,z+d/2), name}); return m;
  }
  function rod(parent, material, a, b, radius=.04) {
    const start = new T.Vector3(...a), end = new T.Vector3(...b);
    const m = mesh(parent,cylinderGeo,material,0,0,0,radius,start.distanceTo(end),radius);
    m.position.copy(start).add(end).multiplyScalar(.5);
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),end.sub(start).normalize()); return m;
  }
  function text(parent, words, x,y,z,w,h,rotation=0, color='#e6d5ac', background=null) {
    const cv = document.createElement('canvas'); cv.width=1024;cv.height=256;
    const c=cv.getContext('2d'); if(background){c.fillStyle=background;c.fillRect(0,0,1024,256);}
    c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.font='500 76px sans-serif';c.fillText(words,512,128,980);
    const map=new T.CanvasTexture(cv);map.colorSpace=T.SRGBColorSpace;map.anisotropy=4;
    const material=new T.MeshStandardMaterial({map,transparent:!background,roughness:.6,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
    const curved=parent===envelope&&Math.abs(rotation)===Math.PI/2;
    const geo=new T.PlaneGeometry(w,h,curved?48:1,curved?8:1);
    const m=mesh(parent,geo,material,x,y,z);m.rotation.y=rotation;m.castShadow=false;
    if(curved){
      const p=geo.attributes.position,side=Math.sign(x);
      for(let i=0;i<p.count;i++){
        const py=y+p.getY(i),pz=z-side*p.getX(i);
        const px=side*(10.65*Math.sqrt(Math.max(.001,1-((py-16)/17.04)**2-(pz/39.04)**2))+.015);
        p.setXYZ(i,px,py,pz);
      }
      m.position.set(0,0,0);m.rotation.set(0,0,0);geo.computeVertexNormals();
    }
    return m;
  }
  // Local 2K material maps: mipmapped, anisotropic and shared by every instance.
  // Fine grain stays sharp near the camera without requiring a 4K screen buffer.
  function texture(kind) {
    const cv=document.createElement('canvas');cv.width=cv.height=textureSize;
    const c=cv.getContext('2d'),n=textureSize;
    c.fillStyle={wood:'#bd946c',fabric:'#c9c7bd',leather:'#b4856f',carpet:'#b0c4ba'}[kind];c.fillRect(0,0,n,n);
    let seed=71;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
    if(kind==='wood'){
      for(let x=0;x<n;x+=2){c.strokeStyle=`rgba(55,28,12,${.06+random()*.22})`;c.lineWidth=.6+random()*1.5;c.beginPath();c.moveTo(x,0);c.bezierCurveTo(x+Math.sin(x*.08)*22,n*.33,x-12,n*.7,x,n);c.stroke();}
      for(let x=0;x<n;x+=n/8){c.fillStyle='#48302566';c.fillRect(x,0,2,n);for(let y=(x%3)*170;y<n;y+=n/2){c.fillRect(x,y,n/8,2);}}
    }else if(kind==='leather'){
      for(let i=0;i<100000;i++){const x=random()*n,y=random()*n;c.fillStyle=i%2?'#422a2138':'#ecd4b930';c.fillRect(x,y,1+random()*3,1+random()*2);}
      c.strokeStyle='#e2c399';c.lineWidth=2;c.setLineDash([8,7]);c.strokeRect(12,12,n-24,n-24);
    }else{
      for(let i=0;i<n;i+=4){c.strokeStyle=i%8?'#34494738':'#ffffff2c';c.beginPath();c.moveTo(i,0);c.lineTo(i,n);c.moveTo(0,i);c.lineTo(n,i);c.stroke();}
    }
    const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.anisotropy=anisotropy;
    t.repeat.set(kind==='wood'?1:kind==='fabric'?24:2,kind==='wood'?4:kind==='fabric'?12:2);return t;
  }
  wood.map=texture('wood');wood.map.colorSpace=T.SRGBColorSpace;
  wood.bumpMap=wood.map;wood.bumpScale=.018;wood.roughness=.43;
  white.bumpMap=texture('fabric');white.bumpScale=.035;
  leather.map=texture('leather');leather.map.colorSpace=T.SRGBColorSpace;leather.bumpMap=leather.map;leather.bumpScale=.012;leather.roughness=.48;
  carpet.bumpMap=texture('carpet');carpet.bumpScale=.025;bedding.bumpMap=carpet.bumpMap;bedding.bumpScale=.009;
  // 78 m envelope, with a swept cobalt equatorial ribbon and longitudinal seams.
  mesh(envelope,balloonGeo,white,0,16,0,10.6,17,39);
  const bandGeo=new T.SphereGeometry(1,96,12,0,Math.PI*2,Math.PI*.47,Math.PI*.075);
  mesh(envelope,bandGeo,blue,0,16,0,10.64,17.04,39.04);
  for(let j=0;j<16;j++){
    const a=j*Math.PI/8, points=[];
    for(let i=1;i<80;i++){const t=-Math.PI/2+Math.PI*i/80;points.push(new T.Vector3(Math.cos(t)*10.61*Math.cos(a),16+Math.cos(t)*17.01*Math.sin(a),Math.sin(t)*39.01));}
    const seam=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#a7b5b7',transparent:true,opacity:.25}));envelope.add(seam);
  }
  for(const side of [-1,1]){
    text(envelope,'K A Z E N A G I',side*10.02,19.2,-5,20,3.2,side*Math.PI/2,'#254f70');
    text(envelope,'NT–01   /   THE VERDANT WILDS',side*10.63,16.25,-4,18,.85,side*Math.PI/2,'#edf4f2');
  }
  text(envelope,'01',0,21.5,35.5,3,2,0,'#28516e');
  // Four tapered fins, modelled as extruded swept shapes rather than flat boxes.
  function fin(angle) {
    const shape=new T.Shape();shape.moveTo(0,22);shape.lineTo(9,31);shape.lineTo(9.4,38);shape.lineTo(0,35);shape.closePath();
    const geo=new T.ExtrudeGeometry(shape,{depth:.26,bevelEnabled:true,bevelSize:.12,bevelThickness:.1,bevelSegments:2,steps:1});
    const m=new T.Mesh(geo,blue);m.rotation.x=Math.PI/2;
    m.quaternion.premultiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),angle));
    m.position.y=16;m.castShadow=true;envelope.add(m);m.updateMatrix();
    const outline=[[0,22],[9,31],[9.4,38],[0,35]];
    for(let i=0;i<outline.length;i++){
      const a=outline[i],b=outline[(i+1)%outline.length],steps=Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.75);
      for(let j=0;j<=steps;j++)for(const depth of [-.12,.38])groundSamples.push(new T.Vector3(a[0]+(b[0]-a[0])*j/steps,a[1]+(b[1]-a[1])*j/steps,depth).applyMatrix4(m.matrix));
    }
  }
  // Geometry's plane is converted so its second coordinate follows the hull's Z axis.
  for(const a of [0,Math.PI/2,Math.PI,Math.PI*1.5])fin(a);
  for(const p of groundSamples)p.y+=envelopeLift;
  // Aluminium gondola, glazing, structural ribs and warm interior.
  solid(blue,0,-.38,0,7,.65,30.8,'hull');
  solid(wood,0,-.06,0,6.65,.12,30,'deck');
  box(cabin,carpet,0,.006,1.3,1.52,.012,26.5);
  for(let x=-3.1;x<3.2;x+=.32)box(cabin,brass,x,.006,0,.012,.012,29.8);
  for(const side of [-1,1]){
    const spans=side<0?[[-15,-2.9],[-1.1,15]]:[[-15,15]];
    for(const [a,b] of spans)solid(ivory,side*3.4,.48,(a+b)/2,.16,.95,b-a,'window sill');
    solid(silver,side*3.4,3,0,.15,.25,30,'upper rail');
    // Glass is solid to the capsule, even when transparent to the renderer.
    for(const [a,b] of spans)solid(glass,side*3.4,1.95,(a+b)/2,.06,2.0,b-a,'window');
    for(let z=-15;z<=15;z+=2.5){if(side<0&&z>-2.9&&z<-1.1)continue;solid(ivory,side*3.39,1.75,z,.14,2.8,.12,'window frame');box(cabin,brass,side*3.3,1.02,z,.05,.05,2.32);}
    text(cabin,'KAZENAGI  /  NT-01',side*3.51,-.27,-3,9,.47,side*Math.PI/2,'#e8e5d4');
    // Engine outriggers with real shaft and continuously rotating three-blade propellers.
    for(const z of [-6,8]){
      rod(cabin,silver,[side*3.5,2,z],[side*7,3,z],.13);
      mesh(cabin,sphereGeo,white,side*7,3,z,.78,.78,1.8);
      const prop=new T.Group();prop.position.set(side*7,3,z-1.9);ship.add(prop);propellers.push(prop);
      mesh(prop,sphereGeo,brass,0,0,0,.22,.22,.3);
      for(let i=0;i<3;i++){const a=i*Math.PI*2/3;const blade=box(prop,dark,Math.sin(a)*.98,Math.cos(a)*.98,0,.16,1.7,.075);blade.rotation.z=-a;}
      for(const dz of [-1.8,0,1.8])groundSamples.push(new T.Vector3(side*7,2.15,z+dz));
      groundSamples.push(new T.Vector3(side*7,1.17,z-1.9));
    }
    for(const z of [-11,9]){
      rod(cabin,silver,[side*2.6,-.5,z],[side*2.8,-1.2,z],.11);
      const wheel=mesh(cabin,cylinderGeo,dark,side*2.8,-1.05,z,.35,.23,.35);wheel.rotation.z=Math.PI/2;
      groundSamples.push(new T.Vector3(side*2.8,-1.4,z));
      rod(cabin,silver,[side*2.8,3.2,z],[side*5.8,7.8,z+1],.09);
    }
  }
  solid(glass,0,1.85,-15.05,6.8,2.5,.08,'windscreen');
  solid(ivory,0,.4,-15.05,6.8,.8,.15,'bow');
  for(const x of [-3.35,-1.15,1.15,3.35])solid(ivory,x,1.85,-15.05,.1,2.6,.12,'windscreen frame');
  solid(ivory,0,1.6,15,6.8,3.2,.15,'stern');
  // Split deck slab leaves a real opening over the aft staircase.
  solid(wood,0,3.2,-4.5,7,.2,21.4,'upper deck');
  for(const side of [-1,1])solid(wood,side*2.16,3.2,9.9,2.68,.2,7.4,'upper deck');
  solid(wood,0,3.2,14.45,7,.2,1.7,'upper landing');
  for(let z=-13.5;z<6;z+=3){box(cabin,brass,0,3.05,z,6.7,.08,.07);box(cabin,warm,0,3.08,z,1.2,.045,.14);}
  for(const z of [-7,7]){const light=new T.PointLight('#ffdea6',5,15,2);light.position.set(0,2.8,z);cabin.add(light);}
  const portLamp=mat('port lamp','#e45647',0,.2,{emissive:'#ef3726',emissiveIntensity:2});
  const starboardLamp=mat('starboard lamp','#60c89e',0,.2,{emissive:'#21ae78',emissiveIntensity:2});
  mesh(cabin,sphereGeo,portLamp,-3.58,2.9,-12,.1,.1,.1);
  mesh(cabin,sphereGeo,starboardLamp,3.58,2.9,-12,.1,.1,.1);
  // Physical bulkheads with full-height openings and sliding doors.
  function door(x,z,side,name,open=true) {
    const g=new T.Group();g.position.set(x,0,z);cabin.add(g);
    const slab=box(g,navy,0,1.4,0,side?.1:1.5,2.8,side?1.5:.1);
    box(g,brass,side?.075:.55,1.3,side?.55:-.075,.065,.32,.065);
    const spec={x,z,side,name,open,t:open?1:0,g,slab,collider:{min:new T.Vector3(),max:new T.Vector3(),name:'sliding door'}};doors.push(spec);updateDoor(spec,0);
    text(cabin,name,side?x-.08:x,2.96,side?z:z+.11,1.5,.22,side?-Math.PI/2:0);
    return spec;
  }
  function bulkhead(z,name) {
    solid(ivory,-2.1,1.5,z,2.5,3,.14,'bulkhead');solid(ivory,2.1,1.5,z,2.5,3,.14,'bulkhead');
    solid(wood,0,2.98,z,1.7,.22,.17,'lintel');door(0,z,false,name);
  }
  bulkhead(-10,'01  FLIGHT DECK');bulkhead(-1,'03  CABIN CORRIDOR');
  for(const side of [-1,1]){
    // Rear corridor widens around the stairs so both service rooms remain reachable.
    for(const [a,b,x] of [[-.9,1.95,.95],[3.55,6,.95],[6,7.95,1.45],[9.55,14.9,1.45]])solid(ivory,side*x,1.5,(a+b)/2,.12,3,b-a,'room partition');
    solid(ivory,side*2.17,1.5,6,2.35,3,.12,'room partition');
    door(side*.95,2.75,true,side<0?'04  SUITE':'05  GALLEY');
    door(side*1.45,8.75,true,side<0?'06  CHART ROOM':'07  ENGINE ROOM');
  }
  function seat(x,z) {
    // Furniture solids intentionally use conservative aligned bounds.
    solid(leather,x,.56,z,.75,.24,.82,'seat');
    solid(leather,x,1.03,z+.34,.75,.8,.13,'seat back');
    for(const s of [-1,1]){solid(wood,x+s*.43,.83,z,.1,.12,.8,'armrest');rod(cabin,silver,[x+s*.28,.05,z+.25],[x+s*.28,.5,z+.25],.045);}
  }
  // Cockpit: dual pilot seats, wraparound instrument panel, live glass instruments.
  solid(navy,0,.73,-14.12,5.5,1.3,.96,'instrument console');
  box(cabin,brass,0,1.41,-14.12,5.55,.08,1.02);
  seat(-1.6,-12.7);seat(1.6,-12.7);
  const instrumentCanvas=document.createElement('canvas');instrumentCanvas.width=2048;instrumentCanvas.height=512;
  const instrumentMap=new T.CanvasTexture(instrumentCanvas);instrumentMap.colorSpace=T.SRGBColorSpace;instrumentMap.anisotropy=anisotropy;
  const instrument=mesh(cabin,new T.PlaneGeometry(4.8,.78),new T.MeshBasicMaterial({map:instrumentMap}),0,1.38,-13.61);instrument.rotation.x=-.28;instrument.rotation.y=0;
  for(const s of [-1,1]){
    rod(cabin,silver,[s*1.5,.9,-13.5],[s*1.5,1.37,-13.0],.045);
    const yoke=mesh(cabin,new T.TorusGeometry(.24,.028,8,24,Math.PI*1.55),dark,s*1.5,1.4,-13);yoke.rotation.z=-.85;
    for(let i=0;i<4;i++){rod(cabin,silver,[s*2.4,.9,-13.4+i*.14],[s*2.4,1.24,-13.3+i*.14],.017);mesh(cabin,sphereGeo,brass,s*2.4,1.24,-13.3+i*.14,.045,.045,.045);}
  }
  // Lounge: two rows of leather seats, central aisle, cafe and observation windows.
  for(const z of [-8.3,-5.8,-3.3])for(const s of [-1,1]){seat(s*2.3,z);box(cabin,wood,s*2.5,.85,z-1,1.1,.08,.48);}
  text(cabin,'THE SKY IS NOT THE LIMIT',0,2.55,-9.88,2.8,.35,0,'#4d665c');
  // Suite: bed, pillow, reading lamp, desk and wardrobe.
  solid(wood,-2.7,.31,2.8,1.15,.6,2.6,'bed');solid(bedding,-2.7,.66,2.8,1.1,.22,2.5,'mattress');
  box(cabin,carpet,-2.7,.81,3.2,1.12,.12,1.7);mesh(cabin,sphereGeo,bedding,-2.7,.86,1.88,.43,.14,.32);
  solid(wood,-2.3,1,5.3,1.65,2,.65,'wardrobe');
  for(const x of [-2.5,-2.1])box(cabin,brass,x,1,4.95,.04,.23,.05);
  // Galley: sink, taps, hob, mugs, storage and shelves.
  solid(wood,2.8,.5,2.4,1.05,1,4.5,'galley counter');box(cabin,ivory,2.8,1.06,2.4,1.13,.1,4.58);
  box(cabin,silver,2.8,1.12,1.7,.75,.04,.65);rod(cabin,silver,[3.1,1.12,1.7],[3.1,1.55,1.7],.035);rod(cabin,silver,[3.1,1.55,1.7],[2.8,1.55,1.7],.035);
  for(const z of [3.1,3.6])mesh(cabin,cylinderGeo,dark,2.8,1.13,z,.22,.035,.22);
  for(let i=0;i<5;i++){mesh(cabin,cylinderGeo,ivory,2.8,1.24,.6+i*.23,.075,.22,.075);box(cabin,wood,3.03,2.15,.8+i*.6,.5,.09,.5);}
  solid(navy,2.8,1.05,5.25,1.05,2.1,.9,'refrigerator');
  // Chart room: navigation table with an actual drawn local chart and bookcases.
  solid(wood,-2.6,.7,9.8,1.3,1.4,2.4,'chart table');
  const chart=document.createElement('canvas');chart.width=2048;chart.height=2048;const cc=chart.getContext('2d');cc.scale(4,4);cc.fillStyle='#d8cba2';cc.fillRect(0,0,512,512);
  cc.strokeStyle='#6f8b77';cc.lineWidth=2;
  for(let i=0;i<12;i++){cc.beginPath();for(let j=0;j<100;j++){const a=j/99*Math.PI*2;cc.lineTo(256+Math.cos(a)*(20+i*20)+Math.sin(a*5)*12,256+Math.sin(a)*(20+i*15));}cc.stroke();}
  cc.fillStyle='#354c54';cc.font='22px serif';cc.fillText('THE VERDANT WILDS',95,40);cc.fillText('N',250,82);cc.strokeRect(15,15,482,482);
  const chartMap=new T.CanvasTexture(chart);chartMap.colorSpace=T.SRGBColorSpace;
  const chartMesh=mesh(cabin,new T.PlaneGeometry(1.2,2.2),new T.MeshStandardMaterial({map:chartMap}),-2.6,1.412,9.8);chartMesh.rotation.x=-Math.PI/2;
  solid(wood,-2.6,1.15,13.8,1.4,2.3,.7,'bookcase');
  for(let j=0;j<3;j++)for(let i=0;i<9;i++)box(cabin,[blue,leather,ivory,green][(i+j)%4],-3.15+i*.13,.45+j*.63,13.39,.1,.45,.19);
  // Engineering: generator, finned cooling banks, pipework, gauges and service aisle.
  solid(dark,2.65,.65,10,1.25,1.3,3.8,'generator');
  for(let i=0;i<12;i++){box(cabin,silver,2.65,1.4,8.45+i*.28,1.3,.2,.06);rod(cabin,brass,[3.1,1.5,8.4+i*.28],[3.1,2.1,8.4+i*.28],.025);}
  solid(navy,2.7,1.2,13.7,1.1,2.4,.6,'electrical cabinet');
  for(let i=0;i<6;i++)box(cabin,i%2?warm:green,2.45+(i%2)*.35,1+Math.floor(i/2)*.35,13.38,.15,.09,.03);
  text(cabin,'ENGINE CONTROL',2.7,2.18,13.36,.92,.22,0);
  // Porthole-shaped lamp fixtures, safety equipment, bolts and pipe runs.
  for(const s of [-1,1])for(let z=-8;z<14;z+=3){box(cabin,brass,s*3.24,2.7,z,.06,.28,.15);box(cabin,warm,s*3.18,2.7,z,.07,.20,.11);}
  for(let z=-14;z<15;z+=.7)for(const s of [-1,1])mesh(cabin,sphereGeo,silver,s*3.52,-.22,z,.025,.025,.025);
  mesh(cabin,cylinderGeo,leather,-.63,.65,14.6,.15,1.05,.15);
  rod(cabin,brass,[3.22,2.8,6.2],[3.22,2.8,14.6],.035);
  text(cabin,'02  OBSERVATION LOUNGE',0,2.65,-1.11,2.3,.27,Math.PI,'#4d665c');
  // Second storey: panoramic saloon, library and a physically traversable stair.
  const upper=new T.Group();upper.name='Upper observation deck';cabin.add(upper);
  for(let i=0;i<20;i++){
    const top=(i+1)*upperDeckY/20,z=6.4+(i+.5)*.36;
    solid(wood,0,top/2,z,1.56,top,.36,'stair');
    box(cabin,brass,0,top+.008,z-.16,1.54,.016,.025);
  }
  for(const side of [-1,1]){
    // Stairwell balustrades leave the upper landing open at z=13.6.
    solid(glass,side*.9,upperDeckY+.5,9.9,.07,1,7.4,'stair rail');
    rod(cabin,brass,[side*.9,4.35,6.2],[side*.9,4.35,13.6],.035);
    for(let z=6.6;z<13.5;z+=1.2)rod(cabin,silver,[side*.9,upperDeckY,z],[side*.9,4.35,z],.025);
    solid(ivory,side*3.4,3.7,0,.16,.8,30,'upper sill');
    solid(glass,side*3.4,5.05,0,.06,1.9,30,'upper window');
    for(let z=-15;z<=15;z+=2.5){solid(ivory,side*3.4,4.9,z,.12,3.2,.12,'upper frame');box(upper,brass,side*3.28,4.15,z,.04,.04,2.35);}
    solid(ivory,side*2.25,6.5,0,2.5,.18,30.6,'upper ceiling',roof);
    for(let z=-8.2;z<5;z+=4.2){
      const x=side*2.35;
      solid(wood,x,3.55,z,1.35,.5,1.8,'upper sofa');
      mesh(upper,sphereGeo,leather,x,3.87,z,.65,.22,.83);
      solid(leather,x+side*.55,4.32,z,.18,.9,1.8,'sofa back');
      for(const dz of [-.85,.85])box(upper,wood,x,4.06,z+dz,1.3,.16,.12);
      for(const dz of [-.45,.45])mesh(upper,sphereGeo,bedding,x+side*.37,4.36,z+dz,.14,.3,.3);
      solid(wood,side*1.15,3.77,z,.55,.12,1.3,'coffee table');
      rod(upper,brass,[side*1.15,3.3,z],[side*1.15,3.7,z],.055);
      for(let j=0;j<3;j++)box(upper,[blue,ivory,leather][j],side*1.15,3.85+j*.032,z,.33,.03,.46);
      mesh(upper,cylinderGeo,ivory,side*1.15,3.96,z+.43,.065,.18,.065);
    }
    solid(wood,side*2.7,4.3,14.6,1.1,2,.4,'upper bookcase');
    for(let row=0;row<4;row++)for(let i=0;i<7;i++){
      const x=side*2.7-.43+i*.14,y=3.52+row*.45;
      box(upper,[navy,leather,ivory,green][(i+row)%4],x,y,14.32,.115,.32,.2);
      box(upper,brass,x,y+.09,14.21,.08,.012,.015);
    }
    for(let z=-13;z<14;z+=3){box(upper,brass,side*3.24,5.85,z,.08,.3,.18);box(upper,warm,side*3.18,5.85,z,.08,.22,.13);}
  }
  solid(glass,0,4.92,-15.05,6.8,3.1,.08,'upper windscreen');
  solid(glass,0,4.92,15.05,6.8,3.1,.08,'upper stern window');
  solid(glass,0,6.5,0,2,.12,30.6,'skylight',roof);
  for(let z=-14.5;z<15;z+=2.5){box(roof,ivory,0,6.37,z,6.8,.14,.1);box(roof,warm,0,6.27,z,1.4,.04,.06);}
  box(upper,carpet,0,3.312,-4.5,1.4,.024,20.8);
  text(upper,'08  /  PANORAMA SALOON',0,5.95,-14.93,3.1,.28,0,'#254f70');
  text(cabin,'2F  ↑  PANORAMA / LIBRARY',0,2.72,6.1,1.7,.22,Math.PI,'#e4c388');
  text(upper,'1F  /  FLIGHT DECK',0,5.3,14.9,2.4,.25,Math.PI,'#254f70');
  const upperLight=new T.PointLight('#ffe4bb',7,25,2);upperLight.position.set(0,5.9,-3);upper.add(upperLight);
  // Small-scale joinery, seat piping, vent slots and recessed instrument bezels.
  for(const side of [-1,1])for(let z=-14;z<15;z+=.45){
    box(cabin,silver,side*3.27,.27,z,.04,.17,.012);
    box(upper,brass,side*3.27,3.44,z,.045,.06,.014);
  }
  for(let i=0;i<24;i++){box(cabin,silver,-2.55+i*.22,1.45,-14.1,.09,.018,.4);}
  for(const side of [-1,1])for(const z of [-8.3,-5.8,-3.3]){
    rod(cabin,brass,[side*2.3-.34,.71,z-.35],[side*2.3+.34,.71,z-.35],.012);
    for(let i=0;i<7;i++)box(cabin,brass,side*2.3-.3+i*.1,1.39,z+.265,.018,.014,.014);
  }
  // Port boarding hatch is an explicit interaction: no unsafe midair exit.
  entry=new T.Vector3(-3.4,0,-2);
  hatch=door(-3.4,-2,true,'搭乗ハッチ',false);
  text(cabin,'BOARDING',-3.52,2.9,-2,1.8,.32,-Math.PI/2,'#254f70');
  // Discrete hull contact grid at <= 1.5 m spacing plus envelope and fins.
  for(let x=-3.5;x<=3.5;x+=1.4)for(let z=-15;z<=15;z+=1.5)groundSamples.push(new T.Vector3(x,-.71,z));
  for(let z=-38;z<=38;z+=2){const r=Math.sqrt(1-z*z/(39*39));for(let j=0;j<12;j++){const a=Math.PI+j*Math.PI/11;groundSamples.push(new T.Vector3(10.6*r*Math.cos(a),16+envelopeLift+17*r*Math.sin(a),z));}}
  // Batch static primitives by geometry/material. Interior detail costs tens of
  // draw calls, not a call per screw or seat. Doors/propellers remain dynamic.
  function batch(group) {
    const sets=new Map();
    for(const m of [...group.children])if(m.isMesh&&[boxGeo,sphereGeo,cylinderGeo].includes(m.geometry)){
      const key=m.geometry.uuid+m.material.uuid;if(!sets.has(key))sets.set(key,[]);sets.get(key).push(m);
    }
    for(const list of sets.values()){
      const first=list[0], inst=new T.InstancedMesh(first.geometry,first.material,list.length);
      list.forEach((m,i)=>{m.updateMatrix();inst.setMatrixAt(i,m.matrix);group.remove(m);});
      inst.castShadow=first.castShadow;inst.receiveShadow=true;inst.computeBoundingSphere();group.add(inst);
    }
  }
  batch(envelope);batch(cabin);batch(upper);batch(roof);
  const damageGroup=new T.Group(), exteriorDamage=new T.Group();ship.add(damageGroup,exteriorDamage);
  const roomSpecs=[['操縦室',0,-12],['ラウンジ',0,-5],['寝室',-2.2,3],['ギャレー',2.2,3],['航海室',-2.2,10],['機関室',2.2,10],['展望サロン',0,-5,upperDeckY],['空中図書室',2.2,10,upperDeckY]];
  const rooms=roomSpecs.map(([name,x,z,y=0])=>{
    const scarMat=mat('scar '+name,'#252321',0,1);
    const scar=box(damageGroup,scarMat,x,y+.028,z,1.65,.025,3.8);scar.visible=false;
    const panel=box(damageGroup,scarMat,x+(x<0?-.6:.6),y+1.25,z+.7,.4,2.2,.12);panel.visible=false;
    const fireMat=new T.MeshBasicMaterial({color:'#ff9c32',transparent:true,opacity:0,depthWrite:false});
    const fire=mesh(damageGroup,sphereGeo,fireMat,x,y+.8,z,.45,.7,.5);fire.visible=false;
    const smokeMat=new T.MeshBasicMaterial({color:'#353b3e',transparent:true,opacity:0,depthWrite:false});
    const smoke=mesh(exteriorDamage,sphereGeo,smokeMat,x,33+envelopeLift,z,.7,2,.7);smoke.visible=false;
    return {name,x,y,z,hp:100,wet:0,fire:0,blast:0,exploded:false,cooldown:0,scar,panel,flame:fire,smoke};
  });
  const blastLight=new T.PointLight('#ffad51',0,18,2);damageGroup.add(blastLight);
  const debrisMat=mat('debris','#493b32',.3,.95),debrisGeo=new T.BoxGeometry(.12,.08,.1);
  const debris=new T.InstancedMesh(debrisGeo,debrisMat,48);damageGroup.add(debris);debris.count=0;debris.frustumCulled=false;
  const fragments=[],fragmentDummy=new T.Object3D();
  function currentRoom(){if(local.y>upperDeckY-.15)return rooms[local.z<6?6:7];return rooms[local.z< -10?0:local.z< -1?1:local.x<0?(local.z<6?2:4):(local.z<6?3:5)];}
  function damageRoom(room,amount,cause){
    if(room.hp<=0)return;
    room.hp=Math.max(0,room.hp-amount);room.blast=.5;
    if(room.hp<=40&&!room.exploded){
      room.exploded=true;room.hp=Math.max(0,room.hp-22);room.fire=1;room.blast=1;explosions++;
      for(let i=0;i<24;i++){
        if(fragments.length>=48)fragments.shift();
        fragments.push({p:new T.Vector3(room.x,room.y+.9,room.z),v:new T.Vector3((Math.random()-.5)*3,1+Math.random()*3,(Math.random()-.5)*4),life:1.8});
      }
      // Closed bulkheads attenuate the pressure wave; damage never deletes the walkable deck.
      const protectedRoom=doors.some(d=>!d.open&&Math.hypot(d.x-room.x,d.z-room.z)<5);
      for(const other of rooms)if(other!==room&&Math.hypot(other.x-room.x,other.y-room.y,other.z-room.z)<8)other.hp=Math.max(1,other.hp-(protectedRoom?4:14));
      ctx.playCue?.('hurt');ctx.notice(room.name+'で爆発！ '+cause+'。部屋で「修理」を長押ししてください',6);
    }else ctx.notice(room.name+'：'+cause+' / 耐久 '+Math.round(room.hp)+'%',4);
  }
  function receiveLightning(index=Math.floor(Math.random()*rooms.length)){
    const r=rooms[index];if(!r)return null;
    damageRoom(r,48+r.wet*.25,'落雷による配電盤の破損');r.wet=Math.min(100,r.wet+18);
    ship.updateWorldMatrix(true,false);return new T.Vector3(r.x,31+envelopeLift,r.z).applyMatrix4(ship.matrixWorld);
  }
  function damageStep(dt){
    const w=ctx.getWeather(),raining=w.type==='rain'||w.type==='storm';hazardClock+=dt;
    for(const r of rooms){
      r.wet=clamp(r.wet+dt*(raining?w.intensity*(.85+(100-r.hp)*.025):-1.5),0,100);
      r.cooldown=Math.max(0,r.cooldown-dt);r.blast=Math.max(0,r.blast-dt*1.7);
      if(r.wet>50&&r.cooldown===0){r.cooldown=18;damageRoom(r,18+r.wet*.13,'雨漏りによる電気短絡');}
      if(r.fire>0){r.hp=Math.max(0,r.hp-dt*.6);r.fire=Math.max(0,r.fire-dt*.005);}
      if(repairHeld&&(contact&&velocity.length()<1||mode==='walk'&&currentRoom()===r)){
        r.hp=Math.min(100,r.hp+dt*14);r.wet=Math.max(0,r.wet-dt*24);r.fire=Math.max(0,r.fire-dt*.7);
        if(r.hp>70)r.exploded=false;
      }
      r.scar.visible=r.panel.visible=r.hp<70;r.scar.scale.x=1.65+(100-r.hp)*.015;
      r.panel.rotation.set((100-r.hp)*.006,0,(100-r.hp)*.004);
      r.flame.visible=r.blast>0||r.fire>0;r.flame.material.opacity=Math.min(.85,r.blast+r.fire*.6);
      r.flame.scale.y=.5+r.fire*.6+Math.sin(hazardClock*13)*.15;
      r.smoke.visible=r.hp<50;r.smoke.material.opacity=(1-r.hp/100)*.55;
      r.smoke.position.y=32+envelopeLift+(Math.sin(hazardClock*.6+r.z)+1)*2;
    }
    const brightest=rooms.reduce((a,b)=>a.blast>b.blast?a:b);blastLight.position.set(brightest.x,brightest.y+1.8,brightest.z);
    blastLight.intensity=$('motion-toggle').checked?0:brightest.blast*14;
    for(let i=fragments.length-1;i>=0;i--){const f=fragments[i];f.life-=dt;f.v.y-=dt*5;f.p.addScaledVector(f.v,dt);if(f.life<=0)fragments.splice(i,1);}
    debris.count=fragments.length;fragments.forEach((f,i)=>{fragmentDummy.position.copy(f.p);fragmentDummy.rotation.set(f.life*4,f.life*3,0);fragmentDummy.updateMatrix();debris.setMatrixAt(i,fragmentDummy.matrix);});if(fragments.length)debris.instanceMatrix.needsUpdate=true;
  }
  // Dynamic contact debug lines use the same collision shapes as simulation.
  const debug=new T.Group();debug.visible=false;ship.add(debug);
  const debugMat=new T.LineBasicMaterial({color:'#5df7c2',transparent:true,opacity:.7});
  const debugVertices=[];
  for(const b of obstacles){const g=new T.EdgesGeometry(boxGeo);const a=g.attributes.position;
    for(let i=0;i<a.count;i++)debugVertices.push((a.getX(i)+.5)*(b.max.x-b.min.x)+b.min.x,(a.getY(i)+.5)*(b.max.y-b.min.y)+b.min.y,(a.getZ(i)+.5)*(b.max.z-b.min.z)+b.min.z);g.dispose();}
  const dg=new T.BufferGeometry();dg.setAttribute('position',new T.Float32BufferAttribute(debugVertices,3));debug.add(new T.LineSegments(dg,debugMat));
  const pointGeo=new T.BufferGeometry().setFromPoints(groundSamples);debug.add(new T.Points(pointGeo,new T.PointsMaterial({color:'#ffbf5d',size:.15})));

  function updateDoor(d,dt) {
    const previous=d.t, target=d.open?1:0;
    d.t+=clamp(target-d.t,-dt*1.8,dt*1.8);
    function position(){
      d.g.position.set(d.x+(d.side?0:d.t*1.55),0,d.z+(d.side?d.t*1.55:0));
      d.collider.min.set(d.g.position.x-(d.side?.07:.75),0,d.g.position.z-(d.side?.75:.07));
      d.collider.max.set(d.g.position.x+(d.side?.07:.75),2.8,d.g.position.z+(d.side?.75:.07));
    }
    position();
    if(dt>0&&mode==='walk'&&intersects(local,d.collider)){
      d.t=previous;d.open=true;position();
    }
  }
  const allObstacles=obstacles.concat(doors.map(d=>d.collider));
  function activeObstacles() {return allObstacles;}
  const radius=.14, personHeight=1.72/1.2;
  function intersects(p,b) {
    if(p.y>=b.max.y-.001||p.y+personHeight<=b.min.y+.001)return false;
    const x=clamp(p.x,b.min.x,b.max.x),z=clamp(p.z,b.min.z,b.max.z);
    return (p.x-x)**2+(p.z-z)**2<radius*radius-1e-7;
  }
  function walkStep(dt, controls) {
    const yaw=state.yaw-heading, speed=controls.running?2.8:1.8;
    const dx=(controls.mx*Math.cos(yaw)+controls.mz*Math.sin(yaw))*speed*dt;
    const dz=(-controls.mx*Math.sin(yaw)+controls.mz*Math.cos(yaw))*speed*dt;
    const all=activeObstacles();
    // Axis-separated sweeps, with <= 4 cm substeps, avoid thin wall tunnelling.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.04));
    for(let i=0;i<steps;i++)for(const axis of ['x','z']){
      const before=local[axis];local[axis]+=(axis==='x'?dx:dz)/steps;
      const hits=all.filter(b=>intersects(local,b));
      if(hits.length){
        const top=Math.max(...hits.map(b=>b.max.y)),oldY=local.y;
        // Capsule step-up only on actual stair treads, never through furniture.
        if(hits.every(b=>b.name==='stair')&&top-oldY<=.19&&footVelocity<=0){
          local.y=top;
          if(all.some(b=>intersects(local,b))){local.y=oldY;local[axis]=before;}
          else {footVelocity=0;footGrounded=true;}
        }else local[axis]=before;
      }
    }
    footGrounded=false;footVelocity-=9.81*dt;let next=local.y+footVelocity*dt;
    for(const b of all){
      const x=clamp(local.x,b.min.x,b.max.x),z=clamp(local.z,b.min.z,b.max.z);
      if((local.x-x)**2+(local.z-z)**2>=radius*radius)continue;
      if(footVelocity<=0&&local.y>=b.max.y-.005&&next<=b.max.y){next=b.max.y;footVelocity=0;footGrounded=true;}
      else if(footVelocity>0&&local.y+personHeight<=b.min.y+.005&&next+personHeight>b.min.y){next=b.min.y-personHeight;footVelocity=0;}
    }
    local.y=Math.max(0,next);if(local.y===0&&footVelocity<=0){footVelocity=0;footGrounded=true;}
    // Backup interior envelope at doorway/window seams, never an invisible outside floor.
    local.x=clamp(local.x,-3.1,3.1);local.z=clamp(local.z,-14.7,14.7);
  }
  function contactStep(dt) {
    clearance=Infinity;let deepest=0;let cx=ship.position.x,cz=ship.position.z;
    ship.updateWorldMatrix(true,false);
    for(const p of groundSamples){world.copy(p).applyMatrix4(ship.matrixWorld);const gap=world.y-height(world.x,world.z);clearance=Math.min(clearance,gap);if(gap<deepest){deepest=gap;cx=world.x;cz=world.z;}}
    contact=clearance<.025;
    if(deepest<0){
      ship.position.y-=deepest;totalContacts++;
      normal.set(height(cx-.25,cz)-height(cx+.25,cz),.5,height(cx,cz-.25)-height(cx,cz+.25)).normalize();
      temp.set(velocity.x,verticalSpeed,velocity.z);const approaching=temp.dot(normal);
      if(approaching<0){impact=Math.max(impact,-approaching);temp.addScaledVector(normal,-approaching);velocity.set(temp.x,0,temp.z);verticalSpeed=Math.max(0,temp.y);}
      velocity.multiplyScalar(Math.exp(-dt*2.5));verticalSpeed=Math.max(0,verticalSpeed);clearance=0;
    }
  }
  function physicsStep(dt,controls) {
    clock+=dt;impact=Math.max(0,impact-dt*2);
    if(mode==='pilot'){
      throttle=clamp(throttle-(keys.has('KeyW')||keys.has('ArrowUp')?-.35:keys.has('KeyS')||keys.has('ArrowDown')?.35:0)*dt,-.25,1);
      yawRate+=( -controls.mx*.19-yawRate)*(1-Math.exp(-dt*1.5));
      climb=(ascentHeld||keys.has('Space')?1:0)-(descentHeld||keys.has('KeyQ')?1:0);
      if(climb)autopilot=false;
    }else {yawRate*=Math.exp(-dt*1.5);climb=0;}
    if(autopilot){climb=ship.position.y<takeoffY?1:0;if(!climb)autopilot=false;}
    const turn=yawRate*dt;heading+=turn;if(mode!=='ground')state.yaw+=turn;
    ship.rotation.y=heading;
    forward.set(-Math.sin(heading),0,-Math.cos(heading));
    const requested=boostHeld||keys.has('ShiftLeft')||keys.has('ShiftRight');
    if(boostLocked&&boostCharge>=.35)boostLocked=false;
    boosting=mode==='pilot'&&requested&&!boostLocked&&boostCharge>0&&throttle>0&&rooms[5].hp>40;
    boostCharge=clamp(boostCharge+dt*(boosting?-1/8:1/16),0,1);
    if(boostCharge===0)boostLocked=true;
    const maxSpeed=cruiseSpeed*(boosting?boostMultiplier:1)*(.2+.8*rooms[5].hp/100);
    velocity.lerp(temp.copy(forward).multiplyScalar(throttle*maxSpeed),1-Math.exp(-dt*(boosting?.65:.24)));
    // Boost release decays naturally back to cruise rather than braking instantly.
    const integrity=rooms.reduce((n,r)=>n+r.hp,0)/(rooms.length*100);
    verticalSpeed+=(climb*5*(.35+.65*integrity)-(integrity<.5?( .5-integrity)*3:0)-verticalSpeed)*(1-Math.exp(-dt*.65));
    if(ship.position.y>height(ship.position.x,ship.position.z)+520)verticalSpeed=Math.min(0,verticalSpeed);
    ship.position.addScaledVector(velocity,dt);ship.position.y+=verticalSpeed*dt;
    if(Math.abs(ship.position.x)>boundary||Math.abs(ship.position.z)>boundary){ship.position.x=clamp(ship.position.x,-boundary,boundary);ship.position.z=clamp(ship.position.z,-boundary,boundary);velocity.multiplyScalar(.5);throttle=0;}
    contactStep(dt);
    damageStep(dt);
    for(const d of doors)updateDoor(d,dt);
    if(mode==='walk')walkStep(dt,controls);
    for(const prop of propellers)prop.rotation.z+=dt*(4+Math.abs(throttle)*(boosting?108:65));
  }
  function attach() {
    ship.updateWorldMatrix(true,false);world.copy(local).applyMatrix4(ship.matrixWorld);
    state.x=world.x;state.y=world.y;state.z=world.z;state.jump=0;state.vy=0;state.onGround=footGrounded;
    player.position.copy(world);player.visible=false;
  }
  function place() {
    if(mode!=='ground'){ctx.notice('船内にいる間は再配置できません');return false;}
    // Prefer contour-aligned ground so the boarding hatch remains reachable.
    let best=null;
    for(let i=0;i<32;i++){
      const angle=i*Math.PI*.7639,distance=90+Math.floor(i/8)*40;
      const x=clamp(state.x+Math.cos(angle)*distance,-boundary,boundary),z=clamp(state.z+Math.sin(angle)*distance,-boundary,boundary);
      if(ctx.lakeDistance(x,z)<155)continue;
      const gx=height(x+2,z)-height(x-2,z),gz=height(x,z+2)-height(x,z-2);
      const h=Math.atan2(gz,-gx),s=Math.sin(h),c=Math.cos(h);
      let high=-Infinity,low=Infinity;
      for(const dx of [-3.5,0,3.5])for(const dz of [-15,-8,0,8,15]){
        const y=height(x+2*(c*dx+s*dz),z+2*(-s*dx+c*dz));high=Math.max(high,y);low=Math.min(low,y);
      }
      const hatchHeight=height(x-11*c-4*s,z+11*s-4*c);
      const score=(high-low)*5+Math.abs(high-hatchHeight)*9+distance*.025;
      if(!best||score<best.score)best={x,z,h,score};
    }
    const selected=best||{x:clamp(state.x+45,-boundary,boundary),z:clamp(state.z-35,-boundary,boundary),h:heading};
    heading=selected.h;ship.position.set(selected.x,100,selected.z);ship.rotation.y=heading;ship.updateWorldMatrix(true,false);
    let y=-Infinity;for(const p of groundSamples){world.copy(p).applyMatrix4(ship.matrixWorld);y=Math.max(y,height(world.x,world.z)-(world.y-ship.position.y));}
    ship.position.y=y+.01;velocity.set(0,0,0);verticalSpeed=0;throttle=0;yawRate=0;autopilot=false;contactStep(0);return true;
  }
  function board(remote=false) {
    if(ctx.getPaused()||ctx.getDead())return false;
    if(ctx.getMounted()){ctx.notice('車・飛行機から降りてから飛行船へ移動してください');return false;}
    if(mode!=='ground')return false;
    if(!remote&&!canBoard()){ctx.notice('左舷の搭乗口へ近づいてください');return false;}
    ctx.resetInputs();ctx.onBoard?.();pauseInputs();mode='pilot';local.set(-1.6,.6,-12.7);footVelocity=0;footGrounded=true;state.yaw=heading;state.pitch=.08;exterior=false;cutaway=false;
    attach();syncUI();ctx.notice('左スティックで旋回・推力バーで速度設定。右の上昇／降下を長押し',6);return true;
  }
  function canBoard() {
    ship.updateWorldMatrix(true,false);world.copy(entry).applyMatrix4(ship.matrixWorld);
    return mode==='ground'&&velocity.length()<.8&&Math.hypot(state.x-world.x,state.z-world.z)<5&&Math.abs(state.y-world.y)<5;
  }
  function nearDoor() {if(local.y>1)return null;let nearest=null,distance=1.55;for(const d of doors){const v=Math.hypot(local.x-d.x,local.z-d.z);if(v<distance){nearest=d;distance=v;}}return nearest;}
  function interact() {
    if(ctx.getPaused()||ctx.getDead())return false;
    if(mode==='ground')return canBoard()?board():false;
    if(mode==='pilot'){
      mode='walk';local.set(0,0,-11.65);footVelocity=0;footGrounded=true;exterior=false;cutaway=false;state.yaw=heading+Math.PI;state.pitch=0;climb=0;
      ctx.resetInputs();pauseInputs();syncUI();ctx.notice('操縦席を離れました。推力は維持され、飛行船は動き続けます',5);return true;
    }
    const d=nearDoor();if(d){d.open=!d.open;ctx.notice(d.name+' / '+(d.open?'開く':'閉じる'));return true;}
    if(local.y<1&&local.z< -10.6&&Math.abs(local.x)<1.1){mode='pilot';local.set(-1.6,.6,-12.7);footVelocity=0;footGrounded=true;state.yaw=heading;state.pitch=.08;ctx.resetInputs();pauseInputs();syncUI();return true;}
    ctx.notice('扉または操縦席へ近づき、画面の操作ボタンをタップしてください');return false;
  }
  function exit() {
    if(mode!=='walk'||local.y>1||Math.hypot(local.x-entry.x,local.z-entry.z)>2.8){ctx.notice('ラウンジ左舷の搭乗口へ移動してください');return false;}
    if(!hatch.open||hatch.t<.95){ctx.notice('搭乗ハッチを開いてから降船してください');return false;}
    ship.updateWorldMatrix(true,false);world.copy(entry).applyMatrix4(ship.matrixWorld);temp.set(-5.5,0,-2).applyMatrix4(ship.matrixWorld);
    if(!contact||ctx.lakeDistance(temp.x,temp.z)<105||velocity.length()>.8||Math.abs(verticalSpeed)>.35||Math.abs(world.y-height(temp.x,temp.z))>5){ctx.notice('飛行中は降船できません。接地して推力を0にしてください');return false;}
    mode='ground';state.x=temp.x;state.z=temp.z;state.y=height(temp.x,temp.z);player.position.set(state.x,state.y,state.z);player.visible=true;
    previousGroundPosition.copy(player.position);cutaway=false;debug.visible=false;pauseInputs();ctx.resetInputs();syncUI();return true;
  }
  function cameraStep() {
    if(mode==='ground'){envelope.visible=cabin.visible=roof.visible=true;damageGroup.visible=false;exteriorDamage.visible=true;return;}
    attach();
    if(exterior){
      const distance=Math.max(175,82/(Math.tan(camera.fov*Math.PI/360)*camera.aspect)), targetY=18;
      eye.set(Math.sin(state.yaw)*distance, targetY+18+Math.sin(state.pitch)*distance,Math.cos(state.yaw)*distance).add(ship.position);
      eye.y=Math.max(eye.y,height(eye.x,eye.z)+2);camera.position.copy(eye);camera.lookAt(ship.position.x,ship.position.y+targetY,ship.position.z);
    }else{
      eye.copy(local);eye.y+=1.62/ship.scale.y;eye.applyMatrix4(ship.matrixWorld);camera.position.copy(eye);
      temp.set(-Math.sin(state.yaw)*Math.cos(state.pitch),-Math.sin(state.pitch),-Math.cos(state.yaw)*Math.cos(state.pitch));camera.lookAt(eye.add(temp));
    }
    envelope.visible=mode==='ground'||exterior;cabin.visible=roof.visible=true;damageGroup.visible=mode!=='ground';exteriorDamage.visible=envelope.visible;
  }
  function setView() {exterior=!exterior;cutaway=false;if(!exterior){state.yaw=heading+(mode==='walk'?Math.PI:0);state.pitch=.08;}syncUI();cameraStep();}
  function launch() {
    if(mode!=='pilot'||ctx.getPaused())return;
    takeoffY=ship.position.y+28;autopilot=true;throttle=Math.max(.35,throttle);ctx.notice('離陸アシスト：28 m 上昇して水平飛行へ。上昇／降下で解除',5);
  }
  function jump() {if(mode==='walk'&&footGrounded&&!ctx.getPaused()){footVelocity=4;footGrounded=false;}}
  function getRoom() {
    if(local.y>upperDeckY-.15)return local.z<6?'2F / 展望サロン':'2F / 空中図書室';
    if(local.z>6.2&&Math.abs(local.x)<.82&&local.y>.1)return '1F ↔ 2F / 階段';
    if(local.z< -10)return '01 / 操縦室';if(local.z< -1)return '02 / 展望ラウンジ';
    if(Math.abs(local.x)<1)return '03 / 中央通路';return local.x<0?(local.z<6?'04 / 寝室':'06 / 航海室'):(local.z<6?'05 / ギャレー':'07 / 機関室');
  }
  function getState() {
    return {decks:2,upperDeckY,textureResolution:textureSize,cruiseSpeed,boostMultiplier,boosting,boostCharge,boostLocked,deckWidth:13.6,deckLength:60,deckAreaRatio:8,explosions,rooms:rooms.map(({name,hp,wet,fire,exploded})=>({name,hp,wet,fire,exploded})),shellVisible:envelope.visible,interiorVisible:cabin.visible,mode,position:ship.position.toArray(),velocity:velocity.toArray(),verticalSpeed,heading,throttle,clearance,contact,impact,totalContacts,autopilot,exterior,cutaway,local:local.toArray(),room:getRoom(),colliders:obstacles.length+doors.length,terrainSamples:groundSamples.length,doors:doors.map(d=>({name:d.name,open:d.open,t:d.t,x:d.x,z:d.z,side:d.side})),passengerWorld:new T.Vector3().copy(local).applyMatrix4(ship.matrixWorld).toArray()};
  }
  // UI is attached below; all controls invoke the same simulation entry points.
  function syncUI() {
    document.body.classList.toggle('aboard-airship',mode!=='ground');
    $('airship-hud').hidden=mode==='ground';$('airship-board').hidden=mode!=='ground';
    $('airship-mode').textContent=mode==='pilot'?'FLIGHT DECK / 操縦中':'ON BOARD / 船内を探索';
    $('airship-seat').disabled=false;
    $('airship-boost').disabled=mode!=='pilot';
    document.body.classList.toggle('airship-pilot',mode==='pilot');
    $('airship-seat').textContent=mode==='pilot'?'船内を歩く':'扉・操縦席';
    $('airship-view').textContent=exterior?'船内視点':'外観を見る';
    $('airship-launch').disabled=mode!=='pilot';$('airship-up').disabled=mode==='ground';$('airship-down').disabled=mode!=='pilot';$('airship-stop').disabled=mode!=='pilot';
    $('airship-up').querySelector('small').textContent=mode==='walk'?'ジャンプ':'上昇';
    $('airship-up').setAttribute('aria-label',mode==='walk'?'船内でジャンプ':'飛行船を上昇');
    $('airship-power').disabled=mode!=='pilot';
    if(mode==='ground')document.querySelector('.movement-control .control-caption').textContent='移動';
    envelope.visible=mode==='ground'||exterior;cabin.visible=roof.visible=true;damageGroup.visible=mode!=='ground';exteriorDamage.visible=envelope.visible;
  }
  function updateInstruments() {
    const c=instrumentCanvas.getContext('2d');c.setTransform(2,0,0,2,0,0);c.fillStyle='#12282d';c.fillRect(0,0,1024,256);
    c.strokeStyle='#658d89';c.lineWidth=2;c.strokeRect(6,6,1012,244);
    const readings=[['SPEED',Math.round(velocity.length()*3.6),'km/h'],['ALTITUDE',Math.round(clearance),'m AGL'],['THRUST',Math.round(throttle*100),'%'],['VERTICAL',verticalSpeed.toFixed(1),'m/s']];
    readings.forEach(([title,value,unit],i)=>{const x=i*256+128;c.textAlign='center';c.fillStyle='#a4c9ba';c.font='22px monospace';c.fillText(title,x,48);c.font='66px monospace';c.fillStyle='#eef4d2';c.fillText(value,x,143);c.font='22px monospace';c.fillStyle='#c7b88b';c.fillText(unit,x,203);});instrumentMap.needsUpdate=true;
  }
  function updateHUD(dt) {
    hudTick+=dt;if(hudTick<.1)return;hudTick=0;
    if(mode==='ground'){$('airship-board').textContent=canBoard()?'飛行船に乗る':'飛行船へ移動';return;}
    $('airship-speed').textContent=Math.round(velocity.length()*3.6);
    $('airship-alt').textContent=Math.max(0,clearance).toFixed(1);
    $('airship-throttle').textContent=Math.round(throttle*100)+'%';
    $('airship-boost').classList.toggle('active',boosting);
    $('airship-boost').setAttribute('aria-pressed',String(boosting));
    $('airship-boost').style.setProperty('--charge',Math.round(boostCharge*100)+'%');
    $('airship-boost-value').textContent=Math.round(boostCharge*100)+'%';
    $('airship-boost').setAttribute('aria-label','ブースト（長押し / Shift） 残量 '+Math.round(boostCharge*100)+'%'+(boostLocked?' 充電中':''));
    $('airship-deck').textContent=local.y>upperDeckY-.15?'2F':'1F';
    $('airship-vs').textContent=(verticalSpeed>=0?'+':'')+verticalSpeed.toFixed(1);
    $('airship-heading').textContent=String((Math.round(heading*180/Math.PI)%360+360)%360).padStart(3,'0')+'°';
    $('airship-status').textContent=impact>1?'GROUND CONTACT / 接触を吸収':contact?'LANDED / 接地':autopilot?'TAKEOFF ASSIST / 離陸中':mode==='walk'?'UNATTENDED / 推力維持':'CRUISING / 飛行中';
    $('airship-room').textContent=getRoom();
    $('airship-help').textContent=mode==='pilot'?'左で旋回 · 推力バーで加減速 · 右で昇降':'左で歩く · 背景ドラッグで見渡す · 扉の近くで開閉';
    document.querySelector('.movement-control .control-caption').textContent=mode==='pilot'?'左右で旋回':'船内を歩く';
    if(document.activeElement!==$('airship-power'))$('airship-power').value=Math.round(throttle*100);
    $('airship-power-value').textContent=Math.round(throttle*100)+'%';
    const worst=rooms.reduce((a,b)=>a.hp<b.hp?a:b),room=currentRoom();
    $('airship-damage').textContent=worst.hp<70?worst.name+' 損傷 '+Math.round(worst.hp)+'% · '+(worst.fire>0?'火災発生':'要修理'):rooms.some(r=>r.wet>35)?'雨漏り警報 · 短絡に注意':'船体正常 · 全8室 / 2階建て';
    $('airship-damage').classList.toggle('danger',worst.hp<70);
    $('airship-repair').textContent=contact&&velocity.length()<1?'長押しで全室整備':'長押しでこの部屋を修理';
    $('airship-repair').disabled=mode==='pilot'&&!contact;
    $('airship-room-health').textContent=room.name+' 耐久 '+Math.round(room.hp)+'% / 浸水 '+Math.round(room.wet)+'%';
    $('airship-biome').textContent=ctx.biomeAt(ship.position.x,ship.position.z).name;
    const atHelm=local.y<1&&local.z< -10.6&&Math.abs(local.x)<1.1;
    $('airship-seat').textContent=mode==='pilot'?'船内を歩く':nearDoor()?(nearDoor().open?'扉を閉じる':'扉を開く'):atHelm?'操縦する':'扉に近づく';
    $('airship-seat').disabled=mode==='walk'&&!atHelm&&!nearDoor();
    $('airship-seat').setAttribute('aria-label',$('airship-seat').textContent);
    $('airship-view').setAttribute('aria-label',$('airship-view').textContent);
    $('airship-exit').disabled=mode!=='walk'||local.y>1||Math.hypot(local.x-entry.x,local.z-entry.z)>2.8||!contact||!hatch.open;
    $('game-mode-label').textContent=mode==='pilot'?'飛行船を操縦中':'飛行船の船内を探索中';
    $('airship-plan-dot').setAttribute('cx',String(60+local.x*11));$('airship-plan-dot').setAttribute('cy',String(12+(local.z+15)*5.5));
    updateInstruments();
  }
  function createUI() {
    const button=document.createElement('button');button.id='airship-board';button.innerHTML='飛行船へ移動';button.title='KAZENAGI NT-01 の操縦席へ移動';document.body.append(button);
    const hud=document.createElement('section');hud.id='airship-hud';hud.hidden=true;hud.setAttribute('aria-label','飛行船の操縦と船内案内');
    hud.innerHTML=`<div class="as-title"><small>KAZENAGI <span>NT–01</span></small><h2>風凪 <i>空に、暮らす。</i></h2><p id="airship-mode"></p><span id="airship-biome"></span></div>
      <div class="as-telemetry"><div><small>対地高度 / AGL</small><strong><b id="airship-alt">0</b><em>m</em></strong></div><div><small>対地速度 / SPEED</small><strong><b id="airship-speed">0</b><em>km/h</em></strong></div><div><small>推力 / THRUST</small><strong id="airship-throttle">0%</strong></div><div><small>昇降 / VERTICAL</small><strong><b id="airship-vs">0</b><em>m/s</em></strong></div></div>
      <div class="as-navigation"><span id="airship-status"></span><span id="airship-heading">000°</span></div>
      <div class="as-plan"><svg viewBox="0 0 120 194" aria-label="船内見取り図。上から操縦室、ラウンジ、中央通路、寝室、ギャレー、航海室、機関室"><path d="M25 178V25Q60 -1 95 25V178Z"/><path d="M25 40h70M25 89h70M49 89v89M71 89v89M25 128h24M71 128h24"/><text x="60" y="30">操縦室</text><text x="60" y="65">ラウンジ</text><text x="37" y="112">寝室</text><text x="83" y="112">厨房</text><text x="37" y="150">航海</text><text x="83" y="150">機関</text><circle id="airship-plan-dot" cx="60" cy="30" r="4"/></svg><span id="airship-room"></span></div>
      <div id="airship-damage" role="status"></div>
      <div class="as-actions"><button id="airship-seat" data-icon="↔"></button><button id="airship-view" data-icon="◉"></button><button id="airship-more" data-icon="⋯" aria-label="船内メニュー" aria-expanded="false" aria-controls="airship-menu">船内メニュー</button></div><span id="airship-deck">1F</span>
      <div class="as-power"><label for="airship-power">推力 <output id="airship-power-value">0%</output></label><input id="airship-power" type="range" min="-25" max="100" step="1" value="0" aria-label="飛行船の推力"><button id="airship-stop" aria-label="推力をゼロにする">停止</button><button id="airship-boost" aria-pressed="false" aria-label="ブースト（長押し / Shift）"><span>BOOST</span><output id="airship-boost-value">100%</output></button></div>
      <div id="airship-menu" hidden><strong id="airship-room-health"></strong><button id="airship-launch">離陸アシスト</button><button id="airship-map">世界地図</button><button id="airship-repair">長押しで修理</button><button id="airship-exit">搭乗口から降船</button><small>1F後方の階段で2Fの展望サロン・図書室へ。ブーストは長押し / Shift（最大8秒、16秒で全回復）。雨漏り・落雷の損傷は修理で回復。</small></div>
      <div class="as-lift"><button id="airship-up" aria-label="飛行船を上昇">↑<small>上昇</small></button><button id="airship-down" aria-label="飛行船を降下">↓<small>降下</small></button></div>
      <div class="as-help"><span id="airship-help"></span></div>`;
    document.body.append(hud);
    button.addEventListener('click',()=>board(true));
    const gated=fn=>()=>{if(!ctx.getPaused()&&!ctx.getDead())fn();};
    $('airship-launch').addEventListener('click',gated(launch));$('airship-seat').addEventListener('click',gated(interact));
    $('airship-view').addEventListener('click',gated(setView));$('airship-exit').addEventListener('click',gated(exit));
    $('airship-stop').addEventListener('click',gated(()=>{if(mode!=='pilot'){ctx.notice('推力を変えるには操縦席に戻ってください');return;}throttle=0;boostHeld=false;boosting=false;autopilot=false;ctx.notice('推力0。慣性で進みながら減速します');}));
    $('airship-more').addEventListener('click',gated(()=>{const menu=$('airship-menu');menu.hidden=!menu.hidden;$('airship-more').setAttribute('aria-expanded',String(!menu.hidden));repairHeld=false;}));
    $('airship-map').addEventListener('click',gated(()=>ctx.openDialog('map-dialog')));
    $('airship-power').addEventListener('input',e=>{if(mode==='pilot'&&!ctx.getPaused()){throttle=clamp(Number(e.target.value)/100,-.25,1);autopilot=false;}});
    function hold(id,set) {const b=$(id);let pointer=null;b.addEventListener('pointerdown',e=>{if(ctx.getPaused()||b.disabled||pointer!==null)return;e.preventDefault();pointer=e.pointerId;if(e.isTrusted)b.setPointerCapture(e.pointerId);set(true);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,e=>{if(e.pointerId===pointer){pointer=null;set(false);}});b.addEventListener('keydown',e=>{if(e.code==='Space'||e.code==='Enter'){e.preventDefault();if(!ctx.getPaused())set(true);}});b.addEventListener('keyup',()=>set(false));b.addEventListener('blur',()=>set(false));}
    hold('airship-repair',v=>repairHeld=v);
    hold('airship-boost',v=>{boostHeld=v;if(!v)boosting=false;});
    hold('airship-up',v=>{if(mode==='walk'){if(v)jump();}else ascentHeld=v;});hold('airship-down',v=>descentHeld=v);
    window.addEventListener('blur',pauseInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseInputs();});
    window.addEventListener('keydown',e=>{if(e.repeat||ctx.getPaused()||ctx.getDead()||mode==='ground'||e.target.matches('input,select'))return;if(e.code==='KeyV'){e.preventDefault();setView();}});
  }
  function pauseInputs(){boostHeld=false;boosting=false;ascentHeld=false;descentHeld=false;repairHeld=false;input={mx:0,mz:0,running:false};}
  createUI();place();syncUI();updateInstruments();
  const api={get aboard(){return mode!=='ground';},get piloting(){return mode==='pilot';},get interiorView(){return mode!=='ground'&&!exterior;},board,canBoard,interact,exit,place,jump,pauseInputs,getState,receiveLightning,
    setInput(value){input=value;},
    update(dt,paused){
      if(!paused){accumulator+=Math.min(dt,.1);while(accumulator>=1/90){physicsStep(1/90,input);accumulator-=1/90;}}
      cameraStep();updateHUD(dt);
    },
    collideGroundPlayer(){
      if(mode!=='ground'||ctx.getMounted())return;
      const target=new T.Vector3(state.x,state.y+state.jump,state.z);
      if(Math.hypot(target.x-ship.position.x,target.z-ship.position.z)>100){previousGroundPosition.copy(target);return;}
      ship.updateWorldMatrix(true,false);
      // Split running movement into short sweeps to catch thin window panes.
      if(previousGroundPosition.distanceTo(target)>5)previousGroundPosition.copy(target);
      const start=previousGroundPosition.clone(),delta=target.clone().sub(start);
      const inverse=ship.matrixWorld.clone().invert(),steps=Math.max(1,Math.ceil(delta.length()/.06));
      for(let i=1;i<=steps;i++){
        const proposed=start.clone().addScaledVector(delta,i/steps);
        const p=proposed.clone().applyMatrix4(inverse);
        for(let iteration=0;iteration<2;iteration++)for(const b of activeObstacles())if(intersects(p,b)){
          const options=[['x',b.min.x-radius],['x',b.max.x+radius],['z',b.min.z-radius],['z',b.max.z+radius]];
          options.sort((a,b)=>Math.abs(a[1]-p[a[0]])-Math.abs(b[1]-p[b[0]]));p[options[0][0]]=options[0][1];
        }
        // Gas envelope has an ellipsoid-shaped collider, not a giant box.
        const cy=clamp(16+envelopeLift,p.y+radius,p.y+personHeight-radius)-(16+envelopeLift);
        const rx=10.6+radius,ry=17+radius,rz=39+radius;
        const section=1-(cy/ry)**2,radial=(p.x/rx)**2+(p.z/rz)**2;
        if(section>0&&radial<section){if(radial<.00001)p.x=rx*Math.sqrt(section);else{const scale=Math.sqrt(section/radial);p.x*=scale;p.z*=scale;}}
        p.applyMatrix4(ship.matrixWorld);
        if(Math.hypot(p.x-proposed.x,p.z-proposed.z)>.001){target.copy(p);break;}
      }
      state.x=target.x;state.z=target.z;state.y=height(state.x,state.z);player.position.set(state.x,state.y+state.jump,state.z);previousGroundPosition.copy(player.position);
    },
    drawMap(c,mx,mz){c.save();c.fillStyle='#bce7ef';c.beginPath();c.ellipse(mx(ship.position.x),mz(ship.position.z),3,8,-heading,0,Math.PI*2);c.fill();c.restore();}
  };
  if(testing)api.test={
    step(seconds,controls={mx:0,mz:0,running:false}){for(let t=0;t<seconds;t+=1/90)physicsStep(1/90,controls);if(mode!=='ground')cameraStep();updateHUD(.2);},
    local(x,y,z){local.set(x,y,z);footVelocity=0;if(mode!=='ground')cameraStep();},
    look(yaw=0,pitch=0){state.yaw=heading+yaw;state.pitch=pitch;cameraStep();},
    pose(x,y,z,h=0){ship.position.set(x,y,z);heading=h;ship.rotation.y=h;ship.updateMatrixWorld(true);},
    velocity(x,y,z){velocity.set(x,0,z);verticalSpeed=y;},
    throttle(v){throttle=clamp(v,-.25,1);},boost(v){boostHeld=v;},launch,setView,
    terrainHeight:height,
    minimumGap(){ship.updateMatrixWorld(true);return Math.min(...groundSamples.map(p=>{const w=p.clone().applyMatrix4(ship.matrixWorld);return w.y-height(w.x,w.z);}));},
    intersects(){return activeObstacles().filter(b=>intersects(local,b)).map(b=>b.name);},
    renderView(kind){exterior=kind!=='interior';cutaway=false;state.yaw=heading+.7;state.pitch=.13;cameraStep();syncUI();},
    door(index,open){doors[index].open=open;},damage(index,amount){damageRoom(rooms[index],amount,'試験損傷');},lightning:receiveLightning,repair(held){repairHeld=held;},jump,
    forceExit(){mode='ground';player.visible=true;syncUI();}
  };
  return api;
};
