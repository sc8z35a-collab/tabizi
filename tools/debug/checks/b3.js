(async page => { const r = {}; r.gate = await page.evaluate(() => ({ gate: !!document.getElementById('start-gate'), preset: document.getElementById('quality-select').value, label: document.getElementById('quality-label').textContent, paused: verdantWorld.getState().paused, postfxFrames0: verdantWorld.getState().graphics.postfx }));
  await page.waitForTimeout(3000);
  r.framesWhileGated = await page.evaluate(() => verdantWorld.getState().graphics.postfx);
  const fav = await page.request.get('http://127.0.0.1:8123/favicon.ico'); r.favicon = fav.status();
  r.tiny = await page.evaluate(() => { const o = []; document.querySelectorAll('*').forEach(e => { const cs = getComputedStyle(e); if (e.offsetParent && e.textContent.trim() && e.children.length === 0 && parseFloat(cs.fontSize) < 7) o.push(e.id || e.className || e.tagName); }); return o.slice(0, 15); });
  return r; })
