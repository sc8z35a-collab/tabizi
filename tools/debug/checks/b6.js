(async page => page.evaluate(async () => {
  const W = verdantWorld, R = __renderer, cam = __cam, out = {};
  const sel = document.getElementById('quality-select'); sel.value = '5'; sel.dispatchEvent(new Event('change'));
  // look toward the sun
  const st = W.getState(); const sun = new THREE.Vector3(-.46, .8 - .62 * .65, -.75).normalize();
  const snap = async ov => { window.verdantPostFXOverrides = ov; for (let i = 0; i < 4; i++) await new Promise(r => requestAnimationFrame(r)); cam.lookAt(cam.position.clone().add(sun)); cam.updateMatrixWorld(); const gl = R.getContext(); const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight; const px = new Uint8Array(w * h * 4); R.getContext().readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px); let s = 0; for (let i = 0; i < px.length; i += 4) s += px[i] + px[i + 1] + px[i + 2]; return s / (w * h); };
  W.verdantWorld; out.info = W.getState().graphics.postfx;
  out.lumShafts = await snap({ shafts: 3, bloom: 0, haze: 0 });
  out.lumNoShafts = await snap({ shafts: 0, bloom: 0, haze: 0 });
  out.lumHaze = await snap({ shafts: 0, bloom: 0, haze: 30 });
  out.sunVisible = W.getState().graphics.postfx.sunVisible;
  return out;
}))
