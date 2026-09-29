(async page => page.evaluate(async () => {
  const X = verdantWorld.expansion, A = X.airship, out = {};
  const p0 = A.getState().position; X.setWeather('deluge'); X.test.step(30);
  for (let i = 0; i < 20; i++) A.update(0.1, false);
  const p1 = A.getState().position; out.parkedShipDriftInDeluge_m = Math.round(Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) * 10) / 10; out.contact = A.getState().contact;
  out.rainVisibleFromExteriorCam = (() => { A.board(true); A.test.renderView('exterior'); const cam = __cam.position, pl = verdantWorld.getState().position; return Math.round(Math.hypot(cam.x - pl.x, cam.z - pl.z)); })();
  return out;
}))
