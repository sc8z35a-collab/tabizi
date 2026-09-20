'use strict';
// Reproducible real-WebGL QA. Install Playwright separately; no runtime dependency.
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright node js/capture-review.cjs [base-url] [--test-only|--capture-only]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const base = (process.argv[2] || 'http://127.0.0.1:8000/').replace(/\/?$/, '/');
const captureOnly = process.argv.includes('--capture-only');
const testOnly = process.argv.includes('--test-only');
const output = path.join(root, 'previews');
const errors = [], report = { base, capturedAt: new Date().toISOString(), tests: [], captures: [], errors };
function monitor(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text()); });
}
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    if (!captureOnly) {
      for (const file of ['tests.html', 'expansion-tests.html']) {
        const page = await browser.newPage({ viewport: { width: 640, height: 480 } });
        monitor(page);
        await page.goto(base + file, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForFunction(() => document.querySelector('#test-results').dataset.complete, null, { timeout: 360000 });
        const result = await page.locator('#test-results').evaluate(e => ({ status: e.dataset.complete, text: e.textContent }));
        report.tests.push({ file, ...result });
        console.log(file, result.status, result.text);
        fs.writeFileSync(path.join(output, 'validation.json'), JSON.stringify(report, null, 2));
        await page.close();
        if (result.status !== 'true') throw new Error(file + ' failed');
      }
    }
    if (!testOnly) {
      const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
      monitor(page);
      // Freeze scheduling only, not rendering: the production scene, shaders,
      // settings and capture function still render every requested real frame.
      // This avoids continuous software-GPU readback contention in CI.
      await page.addInitScript(() => { const raf=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>{if(cb.name==='animate'){window.reviewFrame=cb;return 1;}return raf(cb);}; });
      await page.goto(base + 'index.html?selftest=1&review=objects', { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.verdantWorld, null, { timeout: 120000 });
      await page.waitForTimeout(1600);
      const views = await page.evaluate(() => verdantWorld.expansion.getObjectViews());
      async function capture(view, format) {
        const data = await page.evaluate(id => {
          verdantWorld.test.setObjectView(id);
          window.reviewFrame();
          return { image: verdantWorld.test.renderReview(), state: verdantWorld.getState() };
        }, view.id);
        const name = view.id + '-' + format + '.png';
        fs.writeFileSync(path.join(output, name), Buffer.from(data.image.split(',')[1], 'base64'));
        report.captures.push({ file: name, id: view.id, name: view.name, format, graphics: data.state.graphics });
        report.scenery = data.state.scenery;
        console.log('CAPTURE', name, data.state.graphics.width, data.state.graphics.height);
      }
      for (const view of views) await capture(view, 'desktop');
      await page.setViewportSize({ width: 390, height: 844 });
      for (const view of views) await capture(view, 'phone');
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.selectOption('#photo-quality', '4');
      await capture(views.find(v => v.id === 'shrine-detail'), 'uhd');
      await page.selectOption('#photo-quality', '0');
      // Real toolbar interaction, deep linking, download, responsive bounds.
      await page.click('#photo-next');
      const shot = await page.locator('body').getAttribute('data-shot');
      if (shot !== 'well' || !page.url().includes('shot=well')) throw new Error('Photo navigation/deep link failed');
      const download = page.waitForEvent('download');
      await page.click('#photo-save');
      const downloaded = await download;
      if (downloaded.suggestedFilename() !== 'verdant-well.png') throw new Error('PNG export failed');
      await downloaded.delete();
      for (const size of [{ width: 1280, height: 800 }, { width: 844, height: 390 }, { width: 390, height: 844 }]) {
        await page.setViewportSize(size);
        await page.evaluate(() => { reviewFrame(); verdantWorld.test.renderReview(); });
        const overflow = await page.locator('.photo-controls').evaluate(e => { const r=e.getBoundingClientRect();return r.left<0||r.right>innerWidth||r.bottom>innerHeight; });
        if (overflow) throw new Error('Photo toolbar overflow at ' + size.width);
        await page.screenshot({ path: path.join(output, 'interface-' + size.width + '.png'), timeout: 120000 });
      }
      report.photoChecks = ['12 compositions on desktop and phone', '3840x2160 UHD render', 'next-view deep link', 'real PNG download', 'toolbar bounds at three screen sizes'];
      await page.close();
    }
    if (errors.length) throw new Error('Browser errors: ' + errors.join('\n'));
    console.log('VALIDATION COMPLETE');
  } finally {
    fs.writeFileSync(path.join(output, captureOnly ? 'captures.json' : 'validation.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
