'use strict';
// Real WebGL responsive audit. Output is isolated from the shipped gallery.
// PLAYWRIGHT_MODULE=... PLAYWRIGHT_BROWSERS_PATH=... node js/visual-tests.cjs [before|after]
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve(__dirname, '../.qa');
const phase = process.argv[2] || 'after';
const base = process.env.REVIEW_URL || 'http://127.0.0.1:8000/';
const report = { phase, captures: [], checks: [], errors: [] };
const overlap=(a,b)=>a&&b&&Math.min(a.right,b.right)>Math.max(a.left,b.left)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)+1;
function check(id,name,ok,evidence){report.checks.push({id,name,ok:!!ok,evidence});console.log(ok?'PASS':'FAIL',id,name);}
(async () => {
  const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => report.errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error' && !m.text().includes('404')) report.errors.push(m.text()); });
    await page.route('**/js/game.js*',async route=>{
      const response=await route.fetch();await route.fulfill({response,body:`const AR=THREE.WebGLRenderer;
      THREE.WebGLRenderer=class extends AR{constructor(o){super({...o,preserveDrawingBuffer:true});window.auditRenderer=this;const r=this.render;this.render=(s,c)=>{window.auditScene=s;return r.call(this,s,c);};}};\n`+await response.text()});
    });
    // Keep the production renderer, but manually schedule frames to avoid software-GPU contention.
    await page.addInitScript(() => {
      const raf = window.requestAnimationFrame.bind(window);
      window.requestAnimationFrame = cb => {
        if (cb.name === 'animate') { window.reviewFrame = cb; return 1; }
        return raf(cb);
      };
    });
    async function load(query = '') {
      await page.goto(base + 'index.html?selftest=1' + query, { waitUntil: 'domcontentloaded', timeout: 120000 });
      await page.waitForFunction(() => window.verdantWorld, null, { timeout: 120000 });
      await page.waitForTimeout(1600);
      await page.evaluate(()=>{
        const c=document.getElementById('large-map').getContext('2d'),f=c.fillText.bind(c),t=c.translate.bind(c);
        window.auditLabels=[];window.auditPlayer=[];
        c.fillText=(text,x,y,...a)=>{if(text.length>2){const w=c.measureText(text).width,h=parseFloat(c.font);auditLabels.push({left:x-w/2,right:x+w/2,top:y-h/2,bottom:y+h/2});}return f(text,x,y,...a);};
        c.translate=(x,y)=>{window.auditPlayer=[x,y];return t(x,y);};
      });
    }
    async function snap(name) {
      await page.evaluate(() => { reviewFrame(); verdantWorld.test.renderReview(); });
      await page.screenshot({ path: path.join(output, phase + '-' + name + '.png'), timeout: 120000 });
      const layout = await page.evaluate(() => [...document.querySelectorAll('dialog[open],dialog[open] select,dialog[open] .event-grid button,.topbar,.tools,.vitals,#memory-runes,#map-button,#joystick,#joystick-knob,.journey-panel,.world-event,.region-label,#portrait-hint,#boss-hud,#vehicle-dashboard,#action-notice,.photo-controls,.photo-controls>* ,.action-buttons>button,.compass,.brand,#combo-pips,#potion-pips,.joystick-n,.joystick-s,.joystick-w,.joystick-e,#large-map,dialog[open] .dialog-close')]
        .filter(e => e.getBoundingClientRect().width && getComputedStyle(e).visibility!=='hidden').map(e => ({ id: e.id || e.className || e.tagName, rect: e.getBoundingClientRect().toJSON(), scroll: e.scrollWidth, client: e.clientWidth })));
      const r=id=>layout.find(e=>e.id===id)?.rect;
      if(/^(normal|detail|boss)-/.test(name)){
        for(const[id,a,b]of [['B01','memory-runes','compass'],['B02','compass','tools'],['B03','memory-runes','vitals'],['B04','journey-panel','vitals'],['B05','region-label','journey-panel'],['B06','portrait-hint','journey-panel'],['B07','boss-hud','journey-panel'],['B08','boss-hud','world-event']])check(id,name+': '+a+' / '+b,!overlap(r(a),r(b)),[r(a),r(b)]);
        for(const[a,b]of [['combo-pips','attack-button'],['potion-pips','heal-button']]){const x=r(a),y=r(b);if(x&&y)check('B09',name+': '+a+' anchored',x.left>=y.left&&x.right<=y.right&&x.top>=y.top&&x.bottom<=y.bottom,[x,y]);}
        const j=r('joystick');if(j)for(const cls of ['joystick-n','joystick-s','joystick-w','joystick-e']){const a=r(cls),v=cls.endsWith('n')||cls.endsWith('s');if(a)check('B10',name+': '+cls,Math.abs(v?(a.left+a.right-j.left-j.right)/2:(a.top+a.bottom-j.top-j.bottom)/2)<2,[a,j]);}
      }
      const m=r('large-map');if(m)check('B11',name+': map ratio',Math.abs(m.width/m.height-700/550)<.02,m);
      if(name.startsWith('settings-bottom')){const a=r('dialog-close'),b=r('settings-dialog');check('B12',name+': visible close',a&&b&&a.top>=b.top&&a.bottom<=b.bottom,[a,b]);}
      if(name.startsWith('photo-')){const bar=r('photo-controls');check('B23',name+': toolbar bounds',layout.filter(e=>['photo-prev','photo-next','photo-shot','photo-save','A','LABEL'].includes(e.id)).every(e=>e.rect.left>=bar.left&&e.rect.right<=bar.right&&e.rect.bottom<=bar.bottom),layout);}
      report.captures.push({ name, viewport: page.viewportSize(), layout });
      fs.writeFileSync(path.join(output, phase + '-layout.json'), JSON.stringify(report, null, 2));
      console.log('CAPTURE', name);
    }
    const detail = enabled => page.evaluate(d => document.body.classList.toggle('immersive', !d), enabled);
    const sizes = [[1280,800],[844,390],[568,320],[390,844],[320,568],[768,1024]];
    await load();
    const initial=await page.evaluate(()=>({time:document.getElementById('world-time').textContent,weather:document.querySelector('[data-weather].selected')?.dataset.weather}));
    check('B17','Initial weather selection',initial.weather==='clear',initial);check('B18','Initial clock',initial.time==='16:12',initial);
    for (const [width,height] of sizes) {
      await page.setViewportSize({width,height});
      await detail(false); await snap('normal-' + width);
      await detail(true); await snap('detail-' + width);
    }
    await detail(false);
    for (const [width,height] of [[320,568],[568,320],[390,844]]) {
      await page.setViewportSize({width,height});
      for (const id of ['settings','events','guide','map']) {
        await page.evaluate(id => {auditLabels.length=0;document.getElementById(id + '-button').click();}, id);
        await snap(id + '-' + width);
        if(id==='map'){const labels=await page.evaluate(()=>auditLabels.splice(0));check('B22','Map labels '+width,!labels.some((a,i)=>labels.slice(i+1).some(b=>overlap(a,b))),labels);}
        if (id === 'settings') {
          await page.evaluate(() => { const d = document.querySelector('dialog[open]'); d.scrollTop = d.scrollHeight; });
          await snap(id + '-bottom-' + width);
        }
        await page.evaluate(() => document.querySelector('dialog[open]').close());
      }
    }
    await page.evaluate(() => verdantWorld.expansion.test.prepareBoss());
    for (const [width,height] of [[390,844],[568,320],[844,390]]) {
      await page.setViewportSize({width,height});
      for (const d of [false,true]) { await detail(d); await snap('boss-' + (d ? 'detail-' : 'icons-') + width); }
    }
    await page.evaluate(() => { const e = verdantWorld.expansion; e.test.clearEnemies(); e.test.teleport(e.getState().plane.x,e.getState().plane.z); e.interact(); e.test.step(.2); });
    for (const [width,height] of [[390,844],[568,320]]) {
      await page.setViewportSize({width,height});
      for (const d of [false,true]) { await detail(d); await snap('plane-' + (d ? 'detail-' : 'icons-') + width); }
    }
    await page.evaluate(() => { const e=verdantWorld.expansion; e.interact(); e.test.teleport(1300,1300); document.getElementById('map-button').click(); });
    await snap('map-edge');
    const player=await page.evaluate(()=>auditPlayer);check('B20','Map traveller at world edge',player[0]>9&&player[0]<691&&player[1]>9&&player[1]<541,player);
    await page.evaluate(() => document.querySelector('dialog[open]').close());
    await detail(false);
    await page.evaluate(() => verdantWorld.expansion.interact());
    await snap('notice');
    const states=await page.evaluate(()=>{
      const $=id=>document.getElementById(id),x=verdantWorld.expansion,r={};
      r.notice=$('action-notice').getBoundingClientRect().width>20&&getComputedStyle($('action-notice')).clipPath==='none';
      const c=$('minimap').getContext('2d'),draw=c.drawImage.bind(c);c.drawImage=(img,sx,sy,sw,sh,...rest)=>{r.source={sx,sy,sw,sh,width:img.width,height:img.height};return draw(img,sx,sy,sw,sh,...rest);};for(let i=0;i<5;i++)reviewFrame();c.drawImage=draw;
      document.body.classList.remove('immersive');document.body.classList.add('clean-hud');r.hidden=getComputedStyle($('attack-button')).visibility==='hidden';document.body.classList.remove('clean-hud');document.body.classList.add('immersive');
      x.test.setStamina(0);x.update(.2,true);r.disabled=$('attack-button').disabled&&Number(getComputedStyle($('attack-button')).opacity)<.5&&$('dodge-button').disabled&&Number(getComputedStyle($('dodge-button')).opacity)<.5;
      const p=x.getState().plane;x.test.teleport(p.x,p.z);x.update(.2,true);r.plane=$('interact-button').querySelector('use').getAttribute('href');
      x.setWeather('storm');x.test.step(8);const sun=auditScene.children.find(l=>l.isDirectionalLight&&l.castShadow);r.light={before:sun.intensity};$('time-slider').dispatchEvent(new Event('input'));r.light.after=sun.intensity;return r;
    });
    check('B13','Visible action feedback',states.notice,states.notice);check('B14','Detailed HUD toggle',states.hidden,states.hidden);check('B15','Disabled appearance',states.disabled,states.disabled);check('B16','Aircraft boarding icon',states.plane==='#i-plane',states.plane);check('B19','Time slider storm lighting',Math.abs(states.light.before-states.light.after)<.01,states.light);
    const src=states.source;check('B21','Minimap terrain at world edge',src&&src.sx>=0&&src.sy>=0&&src.sx+src.sw<=src.width&&src.sy+src.sh<=src.height,src);
    await page.evaluate(() => verdantWorld.expansion.test.hurt(100));
    await snap('defeat');
    await page.evaluate(()=>auditRenderer.getContext().getExtension('WEBGL_lose_context').loseContext());await page.waitForTimeout(350);
    check('B25','Context loss recovery UI',await page.locator('#error-message').isVisible());await page.screenshot({path:path.join(output,phase+'-context-loss.png')});
    await load('&review=objects');
    for (const [width,height] of [[568,320],[320,568],[844,390],[1280,800]]) {
      await page.setViewportSize({width,height}); await snap('photo-' + width);
    }
    await page.goto(base+'previews/index.html',{waitUntil:'domcontentloaded',timeout:120000});await page.setViewportSize({width:320,height:568});
    const gallery=await page.evaluate(()=>[...document.querySelectorAll('.hero img,.card img')].map(e=>({w:e.clientWidth,h:e.clientHeight,ratio:getComputedStyle(e).aspectRatio.split('/').map(Number).reduce((a,b)=>a/b)})));
    check('B24','Gallery aspect ratios',gallery.every(r=>Math.abs(r.w/r.h-r.ratio)<.03),gallery);await page.screenshot({path:path.join(output,phase+'-gallery.png')});
    if(phase!=='before'&&report.checks.some(c=>!c.ok))throw new Error(report.checks.filter(c=>!c.ok).map(c=>c.id+' '+c.name).join('; '));
    if (report.errors.length) throw new Error(report.errors.join('\n'));
  } finally {
    fs.writeFileSync(path.join(output, phase + '-layout.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
