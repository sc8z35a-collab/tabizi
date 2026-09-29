'use strict';
// Debug probe: node tools/debug/probe.cjs <url> <script.js|-> <w> <h> <shot.png|-> [touch=0|1]
// script.js evaluates to `async page => result`. Exposes window.__scene / window.__cam.
const { chromium } = require(process.env.PW || '/tmp/pw/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [url, script, w, h, shot, touch] = process.argv.slice(2);
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: touch === '1', isMobile: touch === '1' });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 300)); });
  page.on('pageerror', e => console.log('[pageerror]', e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });
  try { await page.waitForFunction(() => document.body.dataset.ready === 'true' || document.getElementById('start-gate'), { timeout: 150000 }); } catch (e) { console.log('not ready'); }
  await page.waitForTimeout(1500);
  if (script && script !== '-') { const r = await eval(fs.readFileSync(script, 'utf8'))(page); console.log(JSON.stringify(r, null, 1)); }
  if (shot && shot !== '-') await page.screenshot({ path: shot, timeout: 240000 });
  await browser.close();
})();
