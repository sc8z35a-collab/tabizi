'use strict';
(async () => {
  const iframe = document.getElementById('test-game');
  const results = document.getElementById('test-results');
  const lines = [];
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const assert = (condition, message) => {
    lines.push(`${condition ? 'PASS' : 'FAIL'} ${message}`);
    console[condition ? 'info' : 'error'](lines[lines.length - 1]);
    results.textContent = lines.join('\n');
    if (!condition) throw new Error(message);
  };
  try {
    const start = performance.now();
    while (!iframe.contentWindow.verdantWorld) {
      if (performance.now() - start > 90000) throw new Error('World initialization timeout');
      await wait(150);
    }
    const w = iframe.contentWindow, d = w.document;
    const state = () => w.verdantWorld.getState();
    // dialog.close queues its close event for a rendering task. Await that event,
    // not a wall-clock delay that can expire first on a software WebGL renderer.
    const closeDialog = id => new Promise(resolve => {
      const dialog=d.getElementById(id);
      dialog.addEventListener('close',resolve,{once:true});dialog.close();
    });
    const frames = async n => {for (let i = 0; i < n; i++) await new Promise(resolve => w.requestAnimationFrame(resolve));};
    const key = (type, code) => w.dispatchEvent(new w.KeyboardEvent(type, {code, bubbles:true}));
    assert(state().grass === 98000 && state().triangles > 100000, 'Real 3D terrain and instanced grass are rendered');
    const initial=state().graphics;
    assert(initial.preset===0 && initial.pixelRatio<=1 && initial.width*initial.height<=1600000, 'Lightweight adaptive resolution is the default');
    assert(initial.grassTarget===30000 && initial.activeGrass===30000 && initial.shadowSize<=1024 && !initial.shadowEveryFrame, 'Default grass and shadow workloads are reduced');
    assert(initial.terrainTriangles===115200 && state().scenery.density===.4, 'Terrain indices and scenery start in the lightweight mode');
    const before = state().position;
    key('keydown','KeyW'); await frames(5); key('keyup','KeyW');
    assert(state().position.z < before.z, 'W moves the traveller forward through the world');
    const moved = state().position;
    key('keydown','KeyD'); await frames(4); key('keyup','KeyD');
    assert(state().position.x > moved.x, 'D moves sideways relative to the camera');
    d.getElementById('run-button').click();
    assert(state().running && d.getElementById('run-button').classList.contains('active'), 'Run button changes movement mode and UI');
    d.getElementById('run-button').click();
    key('keydown','Space'); await frames(3); key('keyup','Space');
    assert(!state().onGround && state().jump > 0, 'Jump lifts the traveller off the terrain');
    for (let i = 0; i < 120 && !state().onGround; i++) await frames(1);
    assert(state().onGround, 'Gravity brings the traveller back to the terrain');
    d.getElementById('settings-button').click();
    assert(d.getElementById('settings-dialog').open && state().paused, 'Settings opens and pauses movement');
    const stopped = state().position.z;
    key('keydown','KeyW'); await frames(3); key('keyup','KeyW');
    assert(state().position.z === stopped, 'Movement is disabled while a dialog is open');
    const time = d.getElementById('time-slider');time.value = '0.9';time.dispatchEvent(new w.Event('input'));
    assert(d.getElementById('world-time').textContent === '19:00', 'Time slider updates the world clock and lighting controls');
    const hud = d.getElementById('hud-toggle');hud.checked=false;hud.dispatchEvent(new w.Event('change'));
    assert(d.body.classList.contains('clean-hud'), 'Scenery mode hides optional HUD');hud.checked=true;hud.dispatchEvent(new w.Event('change'));
    await closeDialog('settings-dialog');
    assert(!state().paused, 'Closing settings resumes exploration');
    d.getElementById('map-button').click();
    assert(d.getElementById('map-dialog').open && d.getElementById('map-legend').children.length === 3, 'Map opens with all three actual landmarks');
    await closeDialog('map-dialog');
    d.getElementById('guide-button').click();
    assert(d.getElementById('guide-dialog').open, 'Travel guide opens');await closeDialog('guide-dialog');
    const previous = localStorage.getItem('verdant-wilds-v1');w.dispatchEvent(new w.Event('pagehide'));
    assert(localStorage.getItem('verdant-wilds-v1') === previous, 'Self-test mode does not overwrite player save data');
    w.verdantWorld.expansion.setSceneryDensity(1);
    const full = state().scenery;
    assert(full.instances > 35000, 'More than 35,000 additional scenery instances exist');
    assert(full.counts.conifers === 520 && full.counts.ferns === 2200 && full.counts.wildflowers === 6200, 'Deterministic woodland, fern and flower populations are complete');
    assert(full.counts.cabins + full.counts.camp + full.counts.ruins === 18 && full.counts.windmills === 1, 'Eighteen built places and a windmill populate the map');
    assert(full.batches < full.instances / 10, 'Scenery shares instanced batches rather than one draw call per object');
    d.getElementById('settings-button').click();
    const density = d.getElementById('density-select');
    density.value='0.4';density.dispatchEvent(new w.Event('change'));
    const light=state().scenery;
    assert(light.activeInstances < full.activeInstances && light.range < full.range, 'Light density reduces actual instance counts and draw distance');
    assert(light.counts.cabins === full.counts.cabins, 'Density changes preserve built landmarks');
    density.value='1';density.dispatchEvent(new w.Event('change'));
    assert(state().scenery.activeInstances === full.instances, 'Full density restores the same world without duplication');
    const quality=d.getElementById('quality-select'), canvas=d.getElementById('world');
    const setQuality = value => {quality.value=String(value);quality.dispatchEvent(new w.Event('change'));return state().graphics;};
    const standard=setQuality(1), ultra=setQuality(2), extreme=setQuality(3);
    assert(standard.width <= ultra.width && ultra.width <= extreme.width && (w.devicePixelRatio>1 || standard.width<ultra.width), 'Quality presets respect native density and hardware budgets');
    const uhd=setQuality(4);
    assert(uhd.width*uhd.height <= 8294400 && Math.max(uhd.width,uhd.height) <= 3840, 'UHD stays within its 4K pixel and dimension budgets');
    assert(canvas.width===uhd.width && canvas.height===uhd.height, 'Diagnostics report the actual WebGL drawing buffer');
    assert(d.getElementById('resolution-label').textContent === `${canvas.width} × ${canvas.height}` && d.getElementById('quality-label').textContent === 'UHD', 'HUD reports the selected quality and actual resolution');
    assert(standard.shadowSize <= 2048 && extreme.shadowSize <= 4096, 'Shadow resolution respects the selected quality');
    assert(extreme.grassTarget===98000 && extreme.terrainTriangles===460800, 'High quality restores grass capacity and detailed terrain');
    const flagship=setQuality(5);
    if(flagship.postfx&&flagship.postfx.supported){
      await frames(2);const fx=state().graphics.postfx;
      assert(fx.enabled&&fx.width===canvas.width&&fx.height===canvas.height&&fx.bloomLevels===6&&fx.frames>0,'FLAGSHIP renders through the HDR pipeline at the real drawing-buffer size');
      assert(d.getElementById('quality-label').textContent==='FLAGSHIP'&&flagship.shadowSize===Math.min(4096,flagship.shadowSize)&&flagship.grassTarget===98000,'FLAGSHIP keeps maximum shadows, grass and HUD reporting');
    }
    setQuality(0);w.verdantWorld.test.flushGrass();
    assert(!state().graphics.postfx||!state().graphics.postfx.enabled,'Leaving FLAGSHIP releases the HDR render targets');
    assert(state().graphics.activeGrass===30000 && !state().graphics.grassPending, 'Returning to Performance drains pending grass work safely');
    await closeDialog('settings-dialog');
    const sample=w.verdantWorld.test.sampleFrame;
    w.verdantWorld.test.resetFrameWindow();
    for(let i=0;i<1500;i++)sample(.04);
    const slowed=state().graphics;
    assert(slowed.autoScale===.65 && slowed.pixelRatio<=initial.pixelRatio, 'Sustained slow frames reduce resolution only to the safe lower bound');
    for(let i=0;i<1400;i++)sample(.016);
    assert(state().graphics.autoScale>slowed.autoScale && state().graphics.autoScale<=1, 'Sustained headroom gradually restores resolution');
    d.getElementById('settings-button').click();const held=state().graphics.autoScale;
    for(let i=0;i<300;i++)sample(.04);
    assert(state().graphics.autoScale===held, 'Paused menus do not distort adaptive performance measurements');
    setQuality(1);for(let i=0;i<300;i++)sample(.04);
    assert(state().graphics.autoScale===1, 'Manually selected quality is never auto-degraded');
    setQuality(0);density.value='0.4';density.dispatchEvent(new w.Event('change'));d.getElementById('settings-dialog').close();
    console.info(`ALL ${lines.length} FUNCTIONAL CHECKS PASSED`);
    results.dataset.complete = 'true';
  } catch (e) {
    console.error('FUNCTIONAL TEST FAILURE: ' + e.message);
    results.textContent += '\nERROR: ' + e.message;
    results.dataset.complete = 'failed';
  }
})();
