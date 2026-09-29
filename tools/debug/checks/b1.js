(async page => page.evaluate(async () => {
  const W = verdantWorld, s = __scene, T = THREE, out = {};
  const lakeD = (x, z) => Math.hypot((x - 158) / 1.22, z + 258);
  const inst = []; s.traverse(o => { if (o.isInstancedMesh) inst.push(o); });
  const m4 = new T.Matrix4(), p = new T.Vector3(), q = new T.Quaternion(), sc = new T.Vector3();
  const get = (mesh, i) => { mesh.getMatrixAt(i, m4); m4.decompose(p, q, sc); return { x: p.x, y: p.y, z: p.z, sx: sc.x }; };
  const heads = inst.find(o => o.count === 2400 && o.geometry.type === 'IcosahedronGeometry');
  const stems = inst.find(o => o.count === 2400 && o.geometry.type === 'CylinderGeometry');
  let hidden = 0, stemDrawn = 0;
  for (let i = 0; i < 2400; i++) if (get(heads, i).sx === 0) { hidden++; if (get(stems, i).sx > 0) stemDrawn++; }
  out.flowerHeadsHidden = hidden; out.orphanStems = stemDrawn;
  const rocks = inst.find(o => o.count === 380), trunks = inst.find(o => o.count === 255);
  const sites = [[-23,29],[22,21],[-30,-27],[88,-65],[-61,0],[-93,-105],[-42,5],[35,-32],[78,-88],[-79,-124],[295,-161],[-170,-70],[65,-88],[0,62]];
  let rl = 0; const rs = [], ts = [];
  for (let i = 0; i < 380; i++) { const r = get(rocks, i); if (lakeD(r.x, r.z) < 97) rl++; for (const [x, z] of sites) if (Math.hypot(r.x - x, r.z - z) < 6) rs.push([x, z]); }
  for (let i = 0; i < 255; i++) { const t = get(trunks, i); if (lakeD(t.x, t.z) < 97) ts.push('lake'); for (const [x, z] of sites) if (Math.hypot(t.x - x, t.z - z) < 7) ts.push([x, z]); }
  out.rocksInLake = rl; out.rocksOnSites = rs; out.treesOnSitesOrLake = ts;
  let pl = 0; s.traverse(o => { if (o.isPointLight) pl++; }); out.pointLights = pl;
  let ship; s.traverse(o => { if (o.name === 'KAZENAGI NT-01') ship = o; });
  const prop = ship.children.find(c => c.isGroup && Math.abs(Math.abs(c.position.x) - 7) < .01);
  const lens = []; for (const a of [0, Math.PI / 4, Math.PI / 2]) { prop.rotation.z = a; prop.updateMatrixWorld(true); lens.push(+new T.Vector3(0,0,0).applyMatrix4(prop.matrixWorld).distanceTo(new T.Vector3(0,1,0).applyMatrix4(prop.matrixWorld)).toFixed(3)); }
  out.propUnitLengthAt0_45_90 = lens;
  out.asPlanDisplay = getComputedStyle(document.querySelector('.as-plan')).display;
  out.captionBefore = document.querySelector('.movement-control .control-caption').innerHTML;
  W.expansion.airship.board(true); W.expansion.update(.2, false); W.expansion.airship.test.forceExit();
  out.captionAfter = document.querySelector('.movement-control .control-caption').innerHTML;
  return out;
}))
