(async page => page.evaluate(async () => {
  const W = verdantWorld, X = W.expansion, A = X.airship, out = {}, $ = id => document.getElementById(id);
  // AP heading 360 / -10
  A.board(true); A.engageAutopilot();
  const hd = $('airship-ap-heading'); hd.value = '360'; hd.dispatchEvent(new Event('change')); out.apHeading360 = hd.value;
  hd.value = '-10'; hd.dispatchEvent(new Event('change')); out.apHeadingMinus10 = hd.value;
  A.engageAutopilot(); A.test.forceExit();
  // interact priority: car near airship hatch
  const st = A.getState(); const ship = st.position;
  // stand at hatch world position
  const pw = st.passengerWorld;
  // teleport near entry: compute entry world by boarding-check helper
  let found = null;
  for (let dx = -12; dx <= 12 && !found; dx += 1) for (let dz = -12; dz <= 12 && !found; dz += 1) { X.test.teleport(ship[0] + dx, ship[2] + dz); if (A.canBoard()) found = [dx, dz]; }
  out.hatchFound = !!found;
  if (found) { X.placeVehicle(X.getState && null); }
  // place car at player's feet
  const car = (() => { let c; __scene.traverse(o => { if (o.name === 'Wayfarer GT') c = o; }); return c; })();
  const p = W.getState().position; car.position.set(p.x + 2, p.y, p.z);
  const ok = X.interact(); out.interactNearCarAndHatch_mode = X.mounted ? X.mounted.type : (A.aboard ? 'airship' : 'none'); out.interactReturned = ok;
  if (A.aboard) A.test.forceExit();
  // weather cycle includes deluge
  X.setWeather('storm'); X.test.step(111); out.afterStormAuto = X.getState().weather;
  X.test.step(2); out.bossBlockedWeather = (X.startBoss(), X.getState().weather);
  out.fogDensity = +__scene.fog.density.toFixed(4);
  return out;
}))
