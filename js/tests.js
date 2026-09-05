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
    const frames = async n => {for (let i = 0; i < n; i++) await new Promise(resolve => w.requestAnimationFrame(resolve));};
    const key = (type, code) => w.dispatchEvent(new w.KeyboardEvent(type, {code, bubbles:true}));
    assert(state().grass === 98000 && state().triangles > 100000, 'Real 3D terrain and instanced grass are rendered');
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
    d.getElementById('settings-dialog').close();await wait(200);
    assert(!state().paused, 'Closing settings resumes exploration');
    d.getElementById('map-button').click();
    assert(d.getElementById('map-dialog').open && d.getElementById('map-legend').children.length === 3, 'Map opens with all three actual landmarks');
    d.getElementById('map-dialog').close();await wait(100);
    d.getElementById('guide-button').click();
    assert(d.getElementById('guide-dialog').open, 'Travel guide opens');d.getElementById('guide-dialog').close();
    const previous = localStorage.getItem('verdant-wilds-v1');w.dispatchEvent(new w.Event('pagehide'));
    assert(localStorage.getItem('verdant-wilds-v1') === previous, 'Self-test mode does not overwrite player save data');
    console.info('ALL 14 FUNCTIONAL CHECKS PASSED');
    results.dataset.complete = 'true';
  } catch (e) {
    console.error('FUNCTIONAL TEST FAILURE: ' + e.message);
    results.textContent += '\nERROR: ' + e.message;
    results.dataset.complete = 'failed';
  }
})();
