'use strict';
/* KAZENAGI NT-01. Metres, seconds; independent fixed-step flight and ship-local
   capsule collision. No external physics service or paid/generated assets. */
window.createAirship = function (ctx) {
  const {T, scene, camera, state, player, height, keys, testing} = ctx;
  const $ = id => document.getElementById(id);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const ship = new T.Group(); ship.name = 'KAZENAGI NT-01'; scene.add(ship);
  const envelope = new T.Group(), cabin = new T.Group(), roof = new T.Group();
  ship.add(envelope, cabin, roof);
  const obstacles = [], groundSamples = [], doors = [], propellers = [];
  const local = new T.Vector3(0, 0, -12), velocity = new T.Vector3();
  const temp = new T.Vector3(), world = new T.Vector3(), normal = new T.Vector3();
  const forward = new T.Vector3(), eye = new T.Vector3();
  let mode = 'ground', heading = -.28, yawRate = 0, throttle = 0, climb = 0;
  let accumulator = 0, verticalSpeed = 0, footVelocity = 0, contact = false, footGrounded = true;
  let clearance = 0, impact = 0, totalContacts = 0, exterior = true, cutaway = false;
  let autopilot = false, takeoffY = 0, ascentHeld = false, descentHeld = false;
  let input = {mx:0, mz:0, running:false}, hudTick = 0, clock = 0;
  let entry = null;
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
        const px=side*(10.65*Math.sqrt(Math.max(.001,1-((py-16)/10.24)**2-(pz/39.04)**2))+.015);
        p.setXYZ(i,px,py,pz);
      }
      m.position.set(0,0,0);m.rotation.set(0,0,0);geo.computeVertexNormals();
    }
    return m;
  }
  // Canvas wood grain and woven gas-cell surface; deterministic and entirely local.
  function texture(kind) {
    const cv=document.createElement('canvas');cv.width=cv.height=256;const c=cv.getContext('2d');
    c.fillStyle=kind==='wood'?'#b18b65':'#cccccc';c.fillRect(0,0,256,256);
    for(let i=0;i<256;i++){const n=(Math.sin(i*91.31)*43758.5453)%1;c.strokeStyle=kind==='wood'?`rgba(55,30,14,${.04+Math.abs(n)*.13})`:`rgba(50,50,50,${.02+Math.abs(n)*.08})`;c.beginPath();c.moveTo(i,0);c.bezierCurveTo(i+Math.sin(i)*4,85,i-2,170,i,256);c.stroke();}
    const t=new T.CanvasTexture(cv);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(kind==='wood'?2:36,kind==='wood'?8:16);return t;
  }
  wood.map=texture('wood');wood.map.colorSpace=T.SRGBColorSpace;
  white.bumpMap=texture('fabric');white.bumpScale=.035;
  // 78 m envelope, with a swept cobalt equatorial ribbon and longitudinal seams.
  mesh(envelope,balloonGeo,white,0,16,0,10.6,10.2,39);
  const bandGeo=new T.SphereGeometry(1,96,12,0,Math.PI*2,Math.PI*.47,Math.PI*.075);
  mesh(envelope,bandGeo,blue,0,16,0,10.64,10.24,39.04);
  for(let j=0;j<16;j++){
    const a=j*Math.PI/8, points=[];
    for(let i=1;i<80;i++){const t=-Math.PI/2+Math.PI*i/80;points.push(new T.Vector3(Math.cos(t)*10.61*Math.cos(a),16+Math.cos(t)*10.21*Math.sin(a),Math.sin(t)*39.01));}
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
  // Aluminium gondola, glazing, structural ribs and warm interior.
  solid(blue,0,-.38,0,7,.65,30.8,'hull');
  solid(wood,0,-.06,0,6.65,.12,30,'deck');
  box(cabin,carpet,0,.006,1.3,1.52,.012,26.5);
  for(let x=-3.1;x<3.2;x+=.32)box(cabin,brass,x,.006,0,.012,.012,29.8);
  for(const side of [-1,1]){
    solid(ivory,side*3.4,.48,0,.16,.95,30,'window sill');
    solid(silver,side*3.4,3,0,.15,.25,30,'upper rail');
    // Glass is solid to the capsule, even when transparent to the renderer.
    solid(glass,side*3.4,1.95,0,.06,2.0,30,'window');
    for(let z=-15;z<=15;z+=2.5){solid(ivory,side*3.39,1.75,z,.14,2.8,.12,'window frame');box(cabin,brass,side*3.3,1.02,z,.05,.05,2.32);}
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
  solid(ivory,0,3.2,0,7,.18,30.7,'ceiling',roof);
  for(let z=-13.5;z<15;z+=3){box(roof,brass,0,3.05,z,6.7,.08,.07);box(roof,warm,0,3.08,z,1.2,.045,.14);}
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
  }
  function bulkhead(z,name) {
    solid(ivory,-2.1,1.5,z,2.5,3,.14,'bulkhead');solid(ivory,2.1,1.5,z,2.5,3,.14,'bulkhead');
    solid(wood,0,2.98,z,1.7,.22,.17,'lintel');door(0,z,false,name);
  }
  bulkhead(-10,'01  FLIGHT DECK');bulkhead(-1,'03  CABIN CORRIDOR');
  for(const side of [-1,1]){
    for(const span of [[-.9,1.95],[3.55,7.95],[9.55,14.9]])solid(ivory,side*.95,1.5,(span[0]+span[1])/2,.12,3,span[1]-span[0],'room partition');
    solid(ivory,side*2.17,1.5,6,2.35,3,.12,'room partition');
    door(side*.95,2.75,true,side<0?'04  SUITE':'05  GALLEY');
    door(side*.95,8.75,true,side<0?'06  CHART ROOM':'07  ENGINE ROOM');
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
  const instrumentCanvas=document.createElement('canvas');instrumentCanvas.width=1024;instrumentCanvas.height=256;
  const instrumentMap=new T.CanvasTexture(instrumentCanvas);instrumentMap.colorSpace=T.SRGBColorSpace;
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
  const chart=document.createElement('canvas');chart.width=512;chart.height=512;const cc=chart.getContext('2d');cc.fillStyle='#d8cba2';cc.fillRect(0,0,512,512);
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
  // Port boarding hatch is an explicit interaction: no unsafe midair exit.
  entry=new T.Vector3(-3.4,0,-2);
  box(cabin,blue,-3.49,1.12,-2,.1,2.23,1.28);
  box(cabin,glass,-3.55,1.61,-2,.015,.72,.83);
  for(const z of [-2.7,-1.3])box(cabin,brass,-3.55,1.12,z,.055,2.25,.04);
  for(const y of [.02,2.25])box(cabin,brass,-3.55,y,-2,.055,.04,1.44);
  box(cabin,brass,-3.59,.96,-1.58,.055,.08,.2);
  text(cabin,'BOARDING  /  E',-3.52,1.3,-2,1.8,.32,-Math.PI/2,'#254f70');
  // Discrete hull contact grid at <= 1.5 m spacing plus envelope and fins.
  for(let x=-3.5;x<=3.5;x+=1.4)for(let z=-15;z<=15;z+=1.5)groundSamples.push(new T.Vector3(x,-.71,z));
  for(let z=-38;z<=38;z+=2){const r=Math.sqrt(1-z*z/(39*39));for(let j=0;j<12;j++){const a=Math.PI+j*Math.PI/11;groundSamples.push(new T.Vector3(10.6*r*Math.cos(a),16+10.2*r*Math.sin(a),z));}}
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
  batch(envelope);batch(cabin);batch(roof);
  // Dynamic contact debug lines use the same collision shapes as simulation.
  const debug=new T.Group();debug.visible=false;ship.add(debug);
  const debugMat=new T.LineBasicMaterial({color:'#5df7c2',transparent:true,opacity:.7});
  const debugVertices=[];
  for(const b of obstacles){const g=new T.EdgesGeometry(boxGeo);const a=g.attributes.position;
    for(let i=0;i<a.count;i++)debugVertices.push((a.getX(i)+.5)*(b.max.x-b.min.x)+b.min.x,(a.getY(i)+.5)*(b.max.y-b.min.y)+b.min.y,(a.getZ(i)+.5)*(b.max.z-b.min.z)+b.min.z);g.dispose();}
  const dg=new T.BufferGeometry();dg.setAttribute('position',new T.Float32BufferAttribute(debugVertices,3));debug.add(new T.LineSegments(dg,debugMat));
  const pointGeo=new T.BufferGeometry().setFromPoints(groundSamples);debug.add(new T.Points(pointGeo,new T.PointsMaterial({color:'#ffbf5d',size:.15})));

  function updateDoor(d,dt) {
    // Closing through the occupant is disallowed, including during interpolation.
    if(!d.open&&mode==='walk'&&Math.abs(local.x-d.x)<(d.side?.6:1.2)&&Math.abs(local.z-d.z)<(d.side?1.2:.6))d.open=true;
    d.t += clamp((d.open?1:0)-d.t,-dt*1.8,dt*1.8);
    d.g.position.set(d.x+(d.side?0:d.t*1.55),0,d.z+(d.side?d.t*1.55:0));
    d.collider.min.set(d.g.position.x-(d.side?.07:.75),0,d.g.position.z-(d.side?.75:.07));
    d.collider.max.set(d.g.position.x+(d.side?.07:.75),2.8,d.g.position.z+(d.side?.75:.07));
  }
  const allObstacles=obstacles.concat(doors.map(d=>d.collider));
  function activeObstacles() {return allObstacles;}
  const radius=.28, personHeight=1.72;
  function intersects(p,b) {
    if(p.y>=b.max.y-.001||p.y+personHeight<=b.min.y+.001)return false;
    const x=clamp(p.x,b.min.x,b.max.x),z=clamp(p.z,b.min.z,b.max.z);
    return (p.x-x)**2+(p.z-z)**2<radius*radius-1e-7;
  }
  function walkStep(dt, controls) {
    const yaw=state.yaw-heading, speed=controls.running?3.8:2.4;
    const dx=(controls.mx*Math.cos(yaw)+controls.mz*Math.sin(yaw))*speed*dt;
    const dz=(-controls.mx*Math.sin(yaw)+controls.mz*Math.cos(yaw))*speed*dt;
    const all=activeObstacles();
    // Axis-separated sweeps, with <= 4 cm substeps, avoid thin wall tunnelling.
    const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.04));
    for(let i=0;i<steps;i++)for(const axis of ['x','z']){
      const before=local[axis];local[axis]+=(axis==='x'?dx:dz)/steps;
      if(all.some(b=>intersects(local,b)))local[axis]=before;
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
      throttle=clamp(throttle-controls.mz*.22*dt,-.25,1);
      yawRate+=( -controls.mx*.19-yawRate)*(1-Math.exp(-dt*1.5));
      climb=(ascentHeld||keys.has('Space')?1:0)-(descentHeld||keys.has('KeyQ')?1:0);
      if(climb)autopilot=false;
    }else {yawRate*=Math.exp(-dt*1.5);climb=0;}
    if(autopilot){climb=ship.position.y<takeoffY?1:0;if(!climb)autopilot=false;}
    const turn=yawRate*dt;heading+=turn;if(mode!=='ground')state.yaw+=turn;
    ship.rotation.y=heading;
    forward.set(-Math.sin(heading),0,-Math.cos(heading));
    velocity.lerp(temp.copy(forward).multiplyScalar(throttle*22),1-Math.exp(-dt*.24));
    verticalSpeed+=(climb*3.8-verticalSpeed)*(1-Math.exp(-dt*.65));
    if(ship.position.y>420)verticalSpeed=Math.min(0,verticalSpeed);
    ship.position.addScaledVector(velocity,dt);ship.position.y+=verticalSpeed*dt;
    if(Math.abs(ship.position.x)>1370||Math.abs(ship.position.z)>1370){ship.position.x=clamp(ship.position.x,-1370,1370);ship.position.z=clamp(ship.position.z,-1370,1370);velocity.multiplyScalar(.5);throttle=0;}
    contactStep(dt);
    for(const d of doors)updateDoor(d,dt);
    if(mode==='walk')walkStep(dt,controls);
    for(const prop of propellers)prop.rotation.z+=dt*(4+Math.abs(throttle)*65);
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
      const angle=i*Math.PI*.7639,distance=45+Math.floor(i/8)*28;
      const x=clamp(state.x+Math.cos(angle)*distance,-1280,1280),z=clamp(state.z+Math.sin(angle)*distance,-1280,1280);
      if(ctx.lakeDistance(x,z)<155)continue;
      const gx=height(x+2,z)-height(x-2,z),gz=height(x,z+2)-height(x,z-2);
      const h=Math.atan2(gz,-gx),s=Math.sin(h),c=Math.cos(h);
      let high=-Infinity,low=Infinity;
      for(const dx of [-3.5,0,3.5])for(const dz of [-15,-8,0,8,15]){
        const y=height(x+c*dx+s*dz,z-s*dx+c*dz);high=Math.max(high,y);low=Math.min(low,y);
      }
      const hatchHeight=height(x-5.5*c-2*s,z+5.5*s-2*c);
      const score=(high-low)*5+Math.abs(high-hatchHeight)*9+distance*.025;
      if(!best||score<best.score)best={x,z,h,score};
    }
    const selected=best||{x:clamp(state.x+45,-1280,1280),z:clamp(state.z-35,-1280,1280),h:heading};
    heading=selected.h;ship.position.set(selected.x,100,selected.z);ship.rotation.y=heading;ship.updateWorldMatrix(true,false);
    let y=-Infinity;for(const p of groundSamples){world.copy(p).applyMatrix4(ship.matrixWorld);y=Math.max(y,height(world.x,world.z)-p.y);}
    ship.position.y=y+.01;velocity.set(0,0,0);verticalSpeed=0;throttle=0;yawRate=0;autopilot=false;contactStep(0);return true;
  }
  function board(remote=false) {
    if(ctx.getPaused()||ctx.getDead())return false;
    if(ctx.getMounted()){ctx.notice('車・飛行機から降りてから飛行船へ移動してください');return false;}
    if(mode!=='ground')return false;
    if(!remote&&!canBoard()){ctx.notice('左舷の搭乗口へ近づいてください');return false;}
    ctx.resetInputs();ctx.onBoard?.();pauseInputs();mode='pilot';local.set(-1.6,0,-12.7);footVelocity=0;footGrounded=true;state.yaw=heading+2.25;state.pitch=.17;exterior=true;cutaway=false;
    attach();syncUI();ctx.notice('W/S 推力・A/D 旋回・Space 上昇・Q 降下。Eで操縦席を離れます',6);return true;
  }
  function canBoard() {
    ship.updateWorldMatrix(true,false);world.copy(entry).applyMatrix4(ship.matrixWorld);
    return mode==='ground'&&velocity.length()<.8&&Math.hypot(state.x-world.x,state.z-world.z)<5&&Math.abs(state.y-world.y)<3;
  }
  function nearDoor() {let nearest=null,distance=1.55;for(const d of doors){const v=Math.hypot(local.x-d.x,local.z-d.z);if(v<distance){nearest=d;distance=v;}}return nearest;}
  function interact() {
    if(ctx.getPaused()||ctx.getDead())return false;
    if(mode==='ground')return canBoard()?board():false;
    if(mode==='pilot'){
      mode='walk';local.set(0,0,-11.65);footVelocity=0;footGrounded=true;exterior=false;cutaway=false;state.yaw=heading+Math.PI;state.pitch=0;climb=0;
      ctx.resetInputs();syncUI();ctx.notice('操縦席を離れました。推力は維持され、飛行船は動き続けます',5);return true;
    }
    if(local.z< -10.6&&Math.abs(local.x)<1.1){mode='pilot';local.set(-1.6,0,-12.7);footVelocity=0;footGrounded=true;state.yaw=heading;state.pitch=.08;ctx.resetInputs();pauseInputs();syncUI();return true;}
    const d=nearDoor();if(d){d.open=!d.open;ctx.notice(d.name+' / '+(d.open?'開く':'閉じる'));return true;}
    ctx.notice('操縦席または扉の近くで E。降船は左舷の搭乗口から');return false;
  }
  function exit() {
    if(mode!=='walk'||Math.hypot(local.x-entry.x,local.z-entry.z)>2.8){ctx.notice('ラウンジ左舷の搭乗口へ移動してください');return false;}
    ship.updateWorldMatrix(true,false);world.copy(entry).applyMatrix4(ship.matrixWorld);temp.set(-5.5,0,-2).applyMatrix4(ship.matrixWorld);
    if(!contact||ctx.lakeDistance(temp.x,temp.z)<105||velocity.length()>.8||Math.abs(verticalSpeed)>.35||Math.abs(world.y-height(temp.x,temp.z))>3){ctx.notice('飛行中は降船できません。接地して推力を0にしてください');return false;}
    mode='ground';state.x=temp.x;state.z=temp.z;state.y=height(temp.x,temp.z);player.position.set(state.x,state.y,state.z);player.visible=true;
    previousGroundPosition.copy(player.position);cutaway=false;debug.visible=false;pauseInputs();ctx.resetInputs();syncUI();return true;
  }
  function cameraStep() {
    if(mode==='ground')return;
    attach();
    if(exterior){
      const distance=Math.max(cutaway?39:99,(cutaway?19:45)/(Math.tan(camera.fov*Math.PI/360)*camera.aspect)), targetY=cutaway?1:12;
      eye.set(Math.sin(state.yaw)*distance, targetY+18+Math.sin(state.pitch)*distance,Math.cos(state.yaw)*distance).add(ship.position);
      eye.y=Math.max(eye.y,height(eye.x,eye.z)+2);camera.position.copy(eye);camera.lookAt(ship.position.x,ship.position.y+targetY,ship.position.z);
    }else{
      eye.copy(local);eye.y+=1.62;eye.applyMatrix4(ship.matrixWorld);camera.position.copy(eye);
      temp.set(-Math.sin(state.yaw)*Math.cos(state.pitch),-Math.sin(state.pitch),-Math.cos(state.yaw)*Math.cos(state.pitch));camera.lookAt(eye.add(temp));
    }
    envelope.visible=!cutaway;roof.visible=!cutaway;
  }
  function setView() {exterior=!exterior;cutaway=false;if(!exterior){state.yaw=heading+(mode==='walk'?Math.PI:0);state.pitch=.08;}syncUI();cameraStep();}
  function launch() {
    if(mode!=='pilot'||ctx.getPaused())return;
    takeoffY=ship.position.y+28;autopilot=true;throttle=Math.max(.35,throttle);ctx.notice('離陸アシスト：28 m 上昇して水平飛行へ。Space / Qで解除',5);
  }
  function jump() {if(mode==='walk'&&footGrounded&&!ctx.getPaused()){footVelocity=4;footGrounded=false;}}
  function getRoom() {
    if(local.z< -10)return '01 / 操縦室';if(local.z< -1)return '02 / 展望ラウンジ';
    if(Math.abs(local.x)<1)return '03 / 中央通路';return local.x<0?(local.z<6?'04 / 寝室':'06 / 航海室'):(local.z<6?'05 / ギャレー':'07 / 機関室');
  }
  function getState() {
    return {mode,position:ship.position.toArray(),velocity:velocity.toArray(),verticalSpeed,heading,throttle,clearance,contact,impact,totalContacts,autopilot,exterior,cutaway,local:local.toArray(),room:getRoom(),colliders:obstacles.length+doors.length,terrainSamples:groundSamples.length,doors:doors.map(d=>({name:d.name,open:d.open,t:d.t})),passengerWorld:new T.Vector3().copy(local).applyMatrix4(ship.matrixWorld).toArray()};
  }
  // UI is attached below; all controls invoke the same simulation entry points.
  function syncUI() {
    document.body.classList.toggle('aboard-airship',mode!=='ground');
    $('airship-hud').hidden=mode==='ground';$('airship-board').hidden=mode!=='ground';
    $('airship-mode').textContent=mode==='pilot'?'FLIGHT DECK / 操縦中':'ON BOARD / 船内を探索';
    $('airship-seat').disabled=false;
    $('airship-debug').setAttribute('aria-pressed',String(debug.visible));
    $('airship-seat').textContent=mode==='pilot'?'操縦席を離れる  E':'操縦・扉を操作  E';
    $('airship-view').textContent=exterior?'船内視点  V':'外観を見る  V';
    $('airship-launch').disabled=mode!=='pilot';$('airship-up').disabled=mode==='ground';$('airship-down').disabled=mode!=='pilot';$('airship-stop').disabled=mode!=='pilot';
    $('airship-up').querySelector('small').textContent=mode==='walk'?'ジャンプ':'上昇';
    $('airship-up').setAttribute('aria-label',mode==='walk'?'船内でジャンプ':'飛行船を上昇');
    $('airship-cutaway').setAttribute('aria-pressed',String(cutaway));
    envelope.visible=!cutaway;roof.visible=!cutaway;
  }
  function updateInstruments() {
    const c=instrumentCanvas.getContext('2d');c.fillStyle='#12282d';c.fillRect(0,0,1024,256);
    c.strokeStyle='#658d89';c.lineWidth=2;c.strokeRect(6,6,1012,244);
    const readings=[['SPEED',Math.round(velocity.length()*3.6),'km/h'],['ALTITUDE',Math.round(clearance),'m AGL'],['THRUST',Math.round(throttle*100),'%'],['VERTICAL',verticalSpeed.toFixed(1),'m/s']];
    readings.forEach(([title,value,unit],i)=>{const x=i*256+128;c.textAlign='center';c.fillStyle='#a4c9ba';c.font='22px monospace';c.fillText(title,x,48);c.font='66px monospace';c.fillStyle='#eef4d2';c.fillText(value,x,143);c.font='22px monospace';c.fillStyle='#c7b88b';c.fillText(unit,x,203);});instrumentMap.needsUpdate=true;
  }
  function updateHUD(dt) {
    hudTick+=dt;if(hudTick<.1)return;hudTick=0;
    if(mode==='ground'){$('airship-board').textContent=canBoard()?'飛行船に乗る  E':'飛行船へ移動';return;}
    $('airship-speed').textContent=Math.round(velocity.length()*3.6);
    $('airship-alt').textContent=Math.max(0,clearance).toFixed(1);
    $('airship-throttle').textContent=Math.round(throttle*100)+'%';
    $('airship-vs').textContent=(verticalSpeed>=0?'+':'')+verticalSpeed.toFixed(1);
    $('airship-heading').textContent=String((Math.round(heading*180/Math.PI)%360+360)%360).padStart(3,'0')+'°';
    $('airship-status').textContent=impact>1?'GROUND CONTACT / 接触を吸収':contact?'LANDED / 接地':autopilot?'TAKEOFF ASSIST / 離陸中':mode==='walk'?'UNATTENDED / 推力維持':'CRUISING / 飛行中';
    $('airship-room').textContent=getRoom();
    $('airship-help').textContent=mode==='pilot'?'W/S 推力 · A/D 旋回 · Space 上昇 · Q 降下':'WASD 歩く · 背景ドラッグで見渡す · Space ジャンプ';
    const atHelm=local.z< -10.6&&Math.abs(local.x)<1.1;
    $('airship-seat').textContent=mode==='pilot'?'操縦席を離れる  E':atHelm?'操縦席に座る  E':nearDoor()?'扉を開閉する  E':'操縦席 / 扉へ移動';
    $('airship-seat').disabled=mode==='walk'&&!atHelm&&!nearDoor();
    $('airship-exit').disabled=mode!=='walk'||Math.hypot(local.x-entry.x,local.z-entry.z)>2.8;
    $('game-mode-label').textContent=mode==='pilot'?'飛行船を操縦中':'飛行船の船内を探索中';
    $('airship-plan-dot').setAttribute('cx',String(60+local.x*11));$('airship-plan-dot').setAttribute('cy',String(12+(local.z+15)*5.5));
    updateInstruments();
  }
  function createUI() {
    const button=document.createElement('button');button.id='airship-board';button.innerHTML='飛行船へ移動';button.title='KAZENAGI NT-01 の操縦席へ移動';document.body.append(button);
    const hud=document.createElement('section');hud.id='airship-hud';hud.hidden=true;hud.setAttribute('aria-label','飛行船の操縦と船内案内');
    hud.innerHTML=`<div class="as-title"><small>KAZENAGI <span>NT–01</span></small><h2>風凪 <i>空に、暮らす。</i></h2><p id="airship-mode"></p></div>
      <div class="as-telemetry"><div><small>対地高度 / AGL</small><strong><b id="airship-alt">0</b><em>m</em></strong></div><div><small>対地速度 / SPEED</small><strong><b id="airship-speed">0</b><em>km/h</em></strong></div><div><small>推力 / THRUST</small><strong id="airship-throttle">0%</strong></div><div><small>昇降 / VERTICAL</small><strong><b id="airship-vs">0</b><em>m/s</em></strong></div></div>
      <div class="as-navigation"><span id="airship-status"></span><span id="airship-heading">000°</span></div>
      <div class="as-plan"><svg viewBox="0 0 120 194" aria-label="船内見取り図。上から操縦室、ラウンジ、中央通路、寝室、ギャレー、航海室、機関室"><path d="M25 178V25Q60 -1 95 25V178Z"/><path d="M25 40h70M25 89h70M49 89v89M71 89v89M25 128h24M71 128h24"/><text x="60" y="30">操縦室</text><text x="60" y="65">ラウンジ</text><text x="37" y="112">寝室</text><text x="83" y="112">厨房</text><text x="37" y="150">航海</text><text x="83" y="150">機関</text><circle id="airship-plan-dot" cx="60" cy="30" r="4"/></svg><span id="airship-room"></span></div>
      <div class="as-actions"><button id="airship-launch">離陸アシスト</button><button id="airship-seat"></button><button id="airship-view"></button><button id="airship-cutaway" aria-pressed="false">船内透視</button><button id="airship-stop">推力 0</button><button id="airship-exit">搭乗口から降船</button></div>
      <div class="as-lift"><button id="airship-up" aria-label="飛行船を上昇">↑<small>上昇</small></button><button id="airship-down" aria-label="飛行船を降下">↓<small>降下</small></button></div>
      <div class="as-help"><span id="airship-help"></span><button id="airship-debug" aria-pressed="false">当たり判定を表示</button></div>`;
    document.body.append(hud);
    button.addEventListener('click',()=>board(true));
    const gated=fn=>()=>{if(!ctx.getPaused()&&!ctx.getDead())fn();};
    $('airship-launch').addEventListener('click',gated(launch));$('airship-seat').addEventListener('click',gated(interact));
    $('airship-view').addEventListener('click',gated(setView));$('airship-exit').addEventListener('click',gated(exit));
    $('airship-stop').addEventListener('click',gated(()=>{if(mode!=='pilot'){ctx.notice('推力を変えるには操縦席に戻ってください');return;}throttle=0;autopilot=false;ctx.notice('推力0。慣性で進みながら減速します');}));
    $('airship-cutaway').addEventListener('click',gated(()=>{cutaway=!cutaway;exterior=true;syncUI();}));
    $('airship-debug').addEventListener('click',gated(()=>{debug.visible=!debug.visible;$('airship-debug').setAttribute('aria-pressed',String(debug.visible));}));
    function hold(id,set) {const b=$(id);b.addEventListener('pointerdown',e=>{if(ctx.getPaused())return;e.preventDefault();b.setPointerCapture(e.pointerId);set(true);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(ev,()=>set(false));}
    hold('airship-up',v=>{if(mode==='walk'){if(v)jump();}else ascentHeld=v;});hold('airship-down',v=>descentHeld=v);
    window.addEventListener('blur',pauseInputs);document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseInputs();});
    window.addEventListener('keydown',e=>{if(e.repeat||ctx.getPaused()||ctx.getDead()||mode==='ground'||e.target.matches('input,select'))return;if(e.code==='KeyV'){e.preventDefault();setView();}});
  }
  function pauseInputs(){ascentHeld=false;descentHeld=false;input={mx:0,mz:0,running:false};}
  createUI();place();syncUI();updateInstruments();
  const api={get aboard(){return mode!=='ground';},get piloting(){return mode==='pilot';},board,canBoard,interact,exit,place,jump,pauseInputs,getState,
    setInput(value){input=value;},
    update(dt,paused){
      if(!paused){accumulator+=Math.min(dt,.1);while(accumulator>=1/90){physicsStep(1/90,input);accumulator-=1/90;}}
      if(mode!=='ground'){cameraStep();updateHUD(dt);}else updateHUD(dt);
    },
    collideGroundPlayer(){
      if(mode!=='ground'||ctx.getMounted())return;
      const target=new T.Vector3(state.x,state.y+state.jump,state.z);
      if(Math.hypot(target.x-ship.position.x,target.z-ship.position.z)>48){previousGroundPosition.copy(target);return;}
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
        const cy=clamp(16,p.y+radius,p.y+personHeight-radius)-16;
        const rx=10.6+radius,ry=10.2+radius,rz=39+radius;
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
    pose(x,y,z,h=0){ship.position.set(x,y,z);heading=h;ship.rotation.y=h;ship.updateMatrixWorld(true);},
    velocity(x,y,z){velocity.set(x,0,z);verticalSpeed=y;},
    throttle(v){throttle=clamp(v,-.25,1);},launch,setView,
    terrainHeight:height,
    minimumGap(){ship.updateMatrixWorld(true);return Math.min(...groundSamples.map(p=>{const w=p.clone().applyMatrix4(ship.matrixWorld);return w.y-height(w.x,w.z);}));},
    intersects(){return activeObstacles().filter(b=>intersects(local,b)).map(b=>b.name);},
    renderView(kind){exterior=kind!=='interior';cutaway=kind==='cutaway';state.yaw=heading+.7;state.pitch=.13;cameraStep();syncUI();},
    door(index,open){doors[index].open=open;},jump,
    forceExit(){mode='ground';player.visible=true;syncUI();}
  };
  return api;
};
