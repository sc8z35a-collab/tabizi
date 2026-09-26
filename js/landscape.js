'use strict';
/*
 * Landscape-only fullscreen play for phones.
 * - A start gate asks for one tap, then requests fullscreen + landscape lock
 *   (both need a user gesture on Android Chrome).
 * - While the device is held upright, a rotate overlay covers the game and the
 *   simulation is paused through the existing dialog-free pause hook.
 * - Leaving fullscreen shows a small "back to fullscreen" pill instead of the gate.
 * Desktop (fine pointer, no touch) and selftest/review pages are unaffected.
 */
(() => {
  const params = new URLSearchParams(location.search);
  const $ = id => document.getElementById(id);
  const testing = params.get('selftest') === '1';
  const touch = matchMedia('(pointer:coarse)').matches || navigator.maxTouchPoints > 0;
  const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches;
  const enabled = !testing && (touch || params.get('landscape') === '1');
  document.documentElement.classList.toggle('touch-device', touch);
  const api = { enabled, portrait: false, started: !enabled, get fullscreen() { return !!document.fullscreenElement || standalone; } };
  window.verdantLandscape = api;
  if (!enabled) return;
  document.body.classList.add('landscape-only');

  const gate = document.createElement('div');
  gate.id = 'start-gate';
  gate.innerHTML = '<div class="gate-card"><span class="gate-emblem">✧</span><p class="gate-title">風のゆくえ</p><small>THE VERDANT WILDS</small>' +
    '<button id="gate-start" class="gate-button" type="button"><svg><use href="#i-expand"/></svg><span>タップして全画面で始める</span></button>' +
    '<p class="gate-note">横画面・全画面専用。端末を横向きにしてお楽しみください。</p></div>';
  const rotate = document.createElement('div');
  rotate.id = 'rotate-lock';
  rotate.setAttribute('role', 'alert');
  rotate.innerHTML = '<div class="rotate-phone"><i></i></div><p>端末を横向きにしてください</p><small>ROTATE TO LANDSCAPE</small>';
  const resume = document.createElement('button');
  resume.id = 'fullscreen-resume'; resume.type = 'button';
  resume.innerHTML = '<svg><use href="#i-expand"/></svg><span>全画面に戻る</span>';
  document.body.append(gate, rotate, resume);

  async function enterFullscreen() {
    const el = document.documentElement;
    try {
      if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    } catch (_) { /* Some browsers refuse; the game still runs in the page. */ }
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (_) { }
  }
  function isPortrait() {
    if (screen.orientation && typeof screen.orientation.type === 'string' && document.fullscreenElement)
      return screen.orientation.type.startsWith('portrait');
    return innerHeight > innerWidth * 1.05;
  }
  function update() {
    api.portrait = isPortrait();
    document.body.classList.toggle('force-rotate', api.started && api.portrait);
    document.body.classList.toggle('show-resume', api.started && !api.portrait && !api.fullscreen);
    window.dispatchEvent(new CustomEvent('verdant-orientation', { detail: { portrait: api.portrait, started: api.started } }));
  }
  gate.querySelector('#gate-start').addEventListener('click', async () => {
    await enterFullscreen();
    api.started = true; document.body.classList.add('gate-passed');
    setTimeout(() => gate.remove(), 700);
    update();
  });
  resume.addEventListener('click', enterFullscreen);
  addEventListener('resize', update);
  document.addEventListener('fullscreenchange', update);
  if (screen.orientation) screen.orientation.addEventListener('change', update);
  update();
})();
