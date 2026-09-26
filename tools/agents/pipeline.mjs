#!/usr/bin/env node
/*
 * Six-agent automated build pipeline for 風のゆくえ.
 *
 *   node tools/agents/pipeline.mjs [--no-llm] [--browser] [--only=a,b]
 *
 * Six agents run in parallel. Each has a deterministic local analysis (always runs)
 * and an optional LLM review through the OpenAI-compatible proxy configured in
 * ~/.genspark_llm.yaml or OPENAI_API_KEY / OPENAI_BASE_URL.
 *
 *   1. architect   – module graph, script order, cache-busting consistency
 *   2. graphics    – shader / render-pipeline audit (postfx, HDR sky, budgets)
 *   3. mobile      – landscape-only fullscreen, touch targets, safe areas, manifest
 *   4. performance – per-frame allocation scan, instance counts, pixel budgets
 *   5. qa          – syntax of every script, regression suites (headless browser with --browser)
 *   6. release     – git state, README consistency, deploy readiness
 *
 * The first step probes the LLM endpoint. When the proxy answers with a real
 * completion, every agent also receives its files and asks the model for a
 * review; when the account has no usable credit the probe says so explicitly
 * and the pipeline continues with its local analyses only (never silently).
 * Report: .qa/agents-report.json and .qa/agents-report.md
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Set(process.argv.slice(2));
const only = [...args].find(a => a.startsWith('--only='))?.slice(7).split(',');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');
const exists = f => fs.existsSync(path.join(root, f));

// ---------------------------------------------------------------- LLM access
function llmConfig() {
  let key = process.env.OPENAI_API_KEY, base = process.env.OPENAI_BASE_URL;
  const yaml = path.join(os.homedir(), '.genspark_llm.yaml');
  if ((!key || !base) && fs.existsSync(yaml)) {
    const t = fs.readFileSync(yaml, 'utf8');
    key ||= t.match(/api_key:\s*(\S+)/)?.[1]; base ||= t.match(/base_url:\s*(\S+)/)?.[1];
  }
  return key && base ? { key, base: base.replace(/\/$/, '') } : null;
}
const BLOCKED = /free-plan credits|credit_exhausted|purchase credits|insufficient|quota/i;
async function chat(cfg, model, messages, timeoutMs = 120000) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetch(cfg.base + '/chat/completions', { method: 'POST', signal: ctl.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.key },
      body: JSON.stringify({ model, messages }) });
    const j = await r.json().catch(() => ({}));
    const text = j?.choices?.[0]?.message?.content || j?.error?.message || '';
    return { status: r.status, text, blocked: r.status >= 400 || BLOCKED.test(text) };
  } finally { clearTimeout(timer); }
}
async function probeLLM() {
  if (args.has('--no-llm')) return { usable: false, reason: 'disabled by --no-llm' };
  const cfg = llmConfig(); if (!cfg) return { usable: false, reason: 'no OPENAI_API_KEY / ~/.genspark_llm.yaml' };
  const models = ['gpt-5.2', 'gpt-5-mini'];
  for (const model of models) {
    try {
      const t = Date.now(); const r = await chat(cfg, model, [{ role: 'user', content: 'Reply with exactly: READY' }], 30000);
      if (!r.blocked && /READY/i.test(r.text)) return { usable: true, model, latencyMs: Date.now() - t, cfg };
      if (r.blocked) return { usable: false, model, status: r.status, reason: r.text.slice(0, 220) };
    } catch (e) { return { usable: false, model, reason: e.message }; }
  }
  return { usable: false, reason: 'unexpected probe reply' };
}

// ---------------------------------------------------------------- helpers
const scripts = () => [...read('index.html').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]);
const styles = () => [...read('index.html').matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map(m => m[1]);
const local = u => u.split('?')[0];
const finding = (level, msg) => ({ level, msg });

// ---------------------------------------------------------------- agents
const agents = {
  architect: {
    files: ['index.html', 'js/landscape.js', 'js/postfx.js'],
    run() {
      const out = [];
      const list = scripts().filter(s => !s.startsWith('http'));
      for (const s of [...list, ...styles()]) if (!exists(local(s))) out.push(finding('error', `missing asset ${s}`));
      const order = list.map(local);
      const idx = f => order.indexOf(f);
      if (idx('js/postfx.js') < 0 || idx('js/postfx.js') > idx('js/game.js')) out.push(finding('error', 'postfx.js must load before game.js'));
      if (idx('js/landscape.js') < 0 || idx('js/landscape.js') > idx('js/game.js')) out.push(finding('error', 'landscape.js must load before game.js'));
      if (idx('js/expansion.js') > idx('js/game.js')) out.push(finding('error', 'expansion.js must load before game.js'));
      const versions = new Set(list.filter(s => s.includes('?v=')).map(s => s.split('?v=')[1]));
      if (versions.size > 1) out.push(finding('warn', `script cache-bust versions differ: ${[...versions].join(', ')}`));
      out.push(finding('info', `${order.length} local scripts, ${styles().length} stylesheets`));
      return out;
    }
  },
  graphics: {
    files: ['js/postfx.js'],
    run() {
      const out = [], fx = read('js/postfx.js'), game = read('js/game.js');
      if (!/samples:\s*maxSamples/.test(fx)) out.push(finding('error', 'scene target is not multisampled'));
      if (!/HalfFloatType/.test(fx)) out.push(finding('error', 'HDR target must be half-float'));
      if (!/toneMapped:\s*false/.test(fx)) out.push(finding('error', 'post passes must disable renderer tone mapping'));
      if (!/function renderFrame/.test(game) || /\n\s*renderer\.render\(scene,camera\);\n/.test(game)) out.push(finding('error', 'a production path bypasses renderFrame()'));
      if (!/uHdr/.test(game)) out.push(finding('error', 'sky shader is not HDR-aware'));
      const loops = [...fx.matchAll(/for\(int i=0;i<(\d+);/g)].map(m => +m[1]);
      out.push(finding('info', `shader loops: ${loops.join(', ')} taps; bloom levels ${fx.match(/LEVELS = (\d+)/)?.[1]}`));
      if (Math.max(...loops) > 96) out.push(finding('warn', 'very long shader loop for mobile GPUs'));
      return out;
    }
  },
  mobile: {
    files: ['js/landscape.js', 'css/landscape.css', 'manifest.webmanifest'],
    run() {
      const out = [], html = read('index.html'), ls = read('js/landscape.js');
      if (!/viewport-fit=cover/.test(html)) out.push(finding('error', 'viewport must use viewport-fit=cover for notched phones'));
      if (!/user-scalable=no/.test(html)) out.push(finding('warn', 'pinch zoom is not disabled'));
      if (!/orientation\.lock\('landscape'\)/.test(ls)) out.push(finding('error', 'landscape lock is not requested'));
      if (!/requestFullscreen/.test(ls)) out.push(finding('error', 'fullscreen is not requested'));
      try { const m = JSON.parse(read('manifest.webmanifest')); if (m.orientation !== 'landscape' || m.display !== 'fullscreen') out.push(finding('error', 'manifest must be fullscreen + landscape')); }
      catch (e) { out.push(finding('error', 'manifest.webmanifest invalid: ' + e.message)); }
      const css = ['css/style.css', 'css/expansion.css', 'css/airship.css', 'css/landscape.css'].map(read).join('\n');
      const safe = (css.match(/safe-area-inset/g) || []).length;
      out.push(finding(safe ? 'info' : 'warn', `${safe} safe-area-inset usages`));
      const tiny = [...css.matchAll(/font-size:(\d+(?:\.\d+)?)px/g)].filter(m => +m[1] < 7).length;
      if (tiny) out.push(finding('warn', `${tiny} font sizes below 7px (legibility on phones)`));
      return out;
    }
  },
  performance: {
    files: ['js/game.js'],
    run() {
      const out = [];
      for (const f of ['js/game.js', 'js/expansion.js', 'js/airship.js', 'js/postfx.js']) {
        const src = read(f);
        const hot = src.match(/function (animate|update|render)\b[\s\S]{0,4000}/g) || [];
        const allocs = hot.join('').match(/new T\.(Vector3|Vector2|Color|Matrix4|Quaternion)\(/g) || [];
        if (allocs.length) out.push(finding('warn', `${f}: ${allocs.length} math allocations inside hot functions`));
      }
      const g = read('js/game.js');
      out.push(finding('info', `FLAGSHIP pixel budget ${g.match(/preset===5\?(\d+)/)?.[1] || '?'} px, DRS floor ${g.match(/Math\.max\(flagship\?([.\d]+)/)?.[1] || '?'}`));
      return out;
    }
  },
  qa: {
    files: ['js/tests.js'],
    async run() {
      const out = [];
      for (const f of fs.readdirSync(path.join(root, 'js')).filter(f => f.endsWith('.js'))) {
        try { new Function(read('js/' + f)); } catch (e) { out.push(finding('error', `syntax js/${f}: ${e.message}`)); }
      }
      if (!out.length) out.push(finding('info', 'all js/*.js files parse'));
      if (args.has('--browser')) {
        const r = await runNode(path.join(root, 'tools/agents/browser-suite.cjs'), 900000);
        out.push(finding(r.code === 0 ? 'info' : 'error', `browser suites exit ${r.code}: ${r.tail}`));
      } else out.push(finding('info', 'browser suites skipped (pass --browser)'));
      return out;
    }
  },
  release: {
    files: ['README.md'],
    run() {
      const out = [], sh = (...a) => { try { return execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim(); } catch { return ''; } };
      const dirty = sh('status', '--porcelain');
      out.push(finding(dirty ? 'warn' : 'info', dirty ? `uncommitted changes:\n${dirty}` : 'working tree clean'));
      out.push(finding('info', `branch ${sh('rev-parse', '--abbrev-ref', 'HEAD')} @ ${sh('rev-parse', '--short', 'HEAD')}`));
      const readme = read('README.md');
      for (const k of ['FLAGSHIP', 'postfx.js', 'landscape.js', 'tools/agents']) if (!readme.includes(k)) out.push(finding('warn', `README does not mention ${k}`));
      return out;
    }
  }
};

function runNode(file, timeout) {
  return new Promise(resolve => {
    const p = spawn(process.execPath, [file], { cwd: root, env: process.env });
    let buf = ''; p.stdout.on('data', d => buf += d); p.stderr.on('data', d => buf += d);
    const t = setTimeout(() => p.kill('SIGKILL'), timeout);
    p.on('close', code => { clearTimeout(t); resolve({ code, tail: buf.trim().split('\n').slice(-3).join(' | ') }); });
  });
}

async function llmReview(name, agent, probe, localFindings) {
  if (!probe.usable) return null;
  const body = agent.files.map(f => `// FILE ${f}\n${read(f).slice(0, 24000)}`).join('\n\n');
  const r = await chat(probe.cfg, probe.model, [
    { role: 'system', content: `You are the ${name} agent of a six-agent build pipeline for a Three.js mobile game played ONLY in fullscreen landscape on a flagship Android phone. Review the files for concrete defects. Reply in Japanese as at most 6 bullet points, each "[error|warn|info] file: issue -> fix".` },
    { role: 'user', content: `Local analysis:\n${localFindings.map(f => `[${f.level}] ${f.msg}`).join('\n')}\n\n${body}` }]);
  return r.blocked ? { error: r.text.slice(0, 200) } : { text: r.text };
}

(async () => {
  const started = Date.now();
  console.log('▶ probing LLM endpoint…');
  const probe = await probeLLM();
  console.log(probe.usable ? `  LLM usable: ${probe.model} (${probe.latencyMs} ms)` : `  LLM not usable → local analyses only. Reason: ${probe.reason}`);
  const names = Object.keys(agents).filter(n => !only || only.includes(n));
  console.log(`▶ launching ${names.length} agents in parallel: ${names.join(', ')}`);
  const results = await Promise.all(names.map(async name => {
    const t = Date.now(); let findings;
    try { findings = await agents[name].run(); } catch (e) { findings = [finding('error', 'agent crashed: ' + e.message)]; }
    let llm = null; try { llm = await llmReview(name, agents[name], probe, findings); } catch (e) { llm = { error: e.message }; }
    const errors = findings.filter(f => f.level === 'error').length;
    console.log(`  ${errors ? '✖' : '✔'} ${name.padEnd(12)} ${findings.length} findings, ${errors} errors, ${Date.now() - t} ms${llm?.text ? ', LLM review attached' : ''}`);
    return { name, ms: Date.now() - t, findings, llm };
  }));
  const report = { at: new Date().toISOString(), llm: { usable: probe.usable, model: probe.model || null, reason: probe.reason || null }, ms: Date.now() - started, results };
  fs.mkdirSync(path.join(root, '.qa'), { recursive: true });
  fs.writeFileSync(path.join(root, '.qa/agents-report.json'), JSON.stringify(report, null, 2));
  const md = [`# Six-agent pipeline report (${report.at})`, `LLM: ${probe.usable ? probe.model : 'unavailable — ' + probe.reason}`, ''];
  for (const r of results) { md.push(`## ${r.name} (${r.ms} ms)`); r.findings.forEach(f => md.push(`- [${f.level}] ${f.msg}`)); if (r.llm?.text) md.push('', r.llm.text); md.push(''); }
  fs.writeFileSync(path.join(root, '.qa/agents-report.md'), md.join('\n'));
  const failed = results.reduce((n, r) => n + r.findings.filter(f => f.level === 'error').length, 0);
  console.log(`▶ done in ${report.ms} ms — ${failed} errors. Report: .qa/agents-report.md`);
  process.exit(failed ? 1 : 0);
})();
