'use strict';
// Headless regression runner used by the QA agent (and runnable on its own).
//   PLAYWRIGHT_MODULE=/path/to/playwright PLAYWRIGHT_BROWSERS_PATH=... node tools/agents/browser-suite.cjs [tests.html expansion-tests.html]
// Serves the repo on a local port, opens each suite in a phone-landscape viewport and
// waits for #test-results[data-complete]. Suites run one at a time (software WebGL is memory hungry).
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(__dirname, '../..');
const suites = process.argv.slice(2).length ? process.argv.slice(2) : ['tests.html', 'expansion-tests.html'];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const file = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html');
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
});
server.listen(0, '127.0.0.1', async () => {
  const base = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  let failed = 0;
  for (const suite of suites) {
    const page = await browser.newPage({ viewport: { width: 915, height: 412 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { const t = m.text(); if (/^FAIL|FAILURE/.test(t)) console.log('  ' + t.slice(0, 240)); });
    const t0 = Date.now();
    await page.goto(base + suite, { waitUntil: 'domcontentloaded', timeout: 180000 });
    let state = null;
    // The game iframe can stall the main thread on software WebGL; tolerate slow individual polls.
    const poll = () => page.evaluate(() => { const r = document.getElementById('test-results'); return r ? r.dataset.complete || '' : ''; }).catch(() => '');
    while (Date.now() - t0 < 840000) { state = await poll(); if (state) break; await page.waitForTimeout(4000); }
    const text = await page.evaluate(() => document.getElementById('test-results').textContent).catch(() => '');
    const passes = (text.match(/^PASS/gm) || []).length, fails = (text.match(/^FAIL|ERROR/gm) || []).length;
    const ok = state === 'true' && !fails && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} ${suite}: ${passes} checks passed, ${fails} failed, state=${state}, ${Math.round((Date.now() - t0) / 1000)}s${errors.length ? ' pageerrors=' + errors.slice(0, 2).join(' / ') : ''}`);
    await page.close();
  }
  await browser.close(); server.close(); process.exit(failed ? 1 : 0);
});
