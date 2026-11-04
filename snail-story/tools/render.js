#!/usr/bin/env node
// SVG -> PNG renderer (Chromium via Playwright).
//
//   node tools/render.js preview <file.svg> <out.png> [--scale 1]
//       Render the whole SVG (scene or library preview sheet).
//   node tools/render.js layers <scene.svg> <outDir> [--scale 2]
//       Split a 1920x1080 scene into layers:
//         - every top-level <g data-layer="bg"> is merged into bg.png (opaque)
//         - every top-level <g data-layer="el" id="..."> becomes <id>.png (transparent, full-slide size)
//       Writes layers.json with the element ids (in z-order) and their optional data-pivot="x y".
//   node tools/render.js text <spec.json> <outDir> [--scale 2]
//       Render caption lines (see tools/build.py) to transparent PNGs.
//
// Every SVG file in art/lib/ (except *.preview.svg) is injected as <defs> into the page, so scenes
// and preview sheets can <use href="#snail"/> etc. Fonts in fonts/ are available to SVG/HTML text.

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIB = path.join(ROOT, 'art', 'lib');
const TMP = path.join(ROOT, 'build', 'tmp');
const FONT = 'file://' + path.join(ROOT, 'fonts', 'MaokenZhuyuanTi-subset.ttf');

function stripSvg(src) {
  src = src.replace(/<\?xml[^>]*>/g, '').replace(/<!DOCTYPE[^>]*>/g, '').replace(/<!--[\s\S]*?-->/g, '');
  const m = src.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/);
  return m ? m[1] : src;
}

const EXTRA_LIBS = [];   // --lib <file.svg> (repeatable): extra library files, e.g. a candidate design

function libDefs() {
  let files = fs.existsSync(LIB)
    ? fs.readdirSync(LIB).filter(f => f.endsWith('.svg') && !f.includes('.preview.')).sort().map(f => path.join(LIB, f))
    : [];
  if (process.env.ONLY_LIBS) {   // e.g. ONLY_LIBS=common,snail  (inject just these library files)
    const keep = process.env.ONLY_LIBS.split(',');
    files = files.filter(f => keep.includes(path.basename(f, '.svg')));
  }
  for (const x of EXTRA_LIBS) if (!files.includes(x)) files.push(x);
  return files
    .map(f => `<!-- lib:${path.relative(ROOT, f)} -->\n<defs>${stripSvg(fs.readFileSync(f, 'utf8'))}</defs>`)
    .join('\n');
}

function page(bodyInner, extraCss = '') {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face { font-family: 'MaokenZhuyuanTi'; src: url('${FONT}'); }
html, body { margin: 0; padding: 0; background: transparent; }
#libs { position: absolute; width: 0; height: 0; overflow: hidden; }
#stage { position: absolute; left: 0; top: 0; display: block; }
${extraCss}
</style></head><body>
<svg id="libs" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="0" height="0">${libDefs()}</svg>
${bodyInner}
</body></html>`;
}

function svgSize(svgSrc) {
  const tag = svgSrc.match(/<svg\b[^>]*>/)[0];
  const vb = tag.match(/viewBox\s*=\s*"([^"]+)"/);
  const w = tag.match(/\bwidth\s*=\s*"([\d.]+)/);
  const h = tag.match(/\bheight\s*=\s*"([\d.]+)/);
  if (w && h) return [parseFloat(w[1]), parseFloat(h[1])];
  if (vb) { const p = vb[1].trim().split(/[\s,]+/).map(Number); return [p[2], p[3]]; }
  return [1920, 1080];
}

function stageSvg(svgSrc) {
  // Give the root <svg> the id "stage" and explicit pixel size.
  const [w, h] = svgSize(svgSrc);
  let s = svgSrc.replace(/<\?xml[^>]*>/g, '').replace(/<!DOCTYPE[^>]*>/g, '');
  s = s.replace(/<svg\b/, `<svg id="stage"`);
  if (!/<svg[^>]*\bwidth=/.test(s)) s = s.replace(/<svg\b/, `<svg width="${w}"`);
  if (!/<svg[^>]*\bheight=/.test(s)) s = s.replace(/<svg\b/, `<svg height="${h}"`);
  return { s, w, h };
}

async function withPage(scale, w, h, html, fn) {
  fs.mkdirSync(TMP, { recursive: true });
  const file = path.join(TMP, `page-${process.pid}-${Math.floor(performance.now() * 1000)}.html`);
  fs.writeFileSync(file, html);
  const browser = await chromium.launch();
  try {
    const p = await browser.newPage({ viewport: { width: Math.ceil(w), height: Math.ceil(h) }, deviceScaleFactor: scale });
    const errors = [];
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push(String(e)));
    await p.goto('file://' + file);
    await p.evaluate(() => document.fonts.ready);
    await p.waitForTimeout(150);
    await fn(p);
    if (errors.length) console.error('page errors:', errors.join('\n'));
  } finally {
    await browser.close();
    fs.rmSync(file, { force: true });
  }
}

async function preview(svgFile, outPng, scale) {
  const { s, w, h } = stageSvg(fs.readFileSync(svgFile, 'utf8'));
  await withPage(scale, w, h, page(s), async p => {
    await p.screenshot({ path: outPng, clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
  });
  console.log(`preview ${path.relative(ROOT, outPng)} (${w}x${h} @${scale}x)`);
}

async function layers(svgFile, outDir, scale) {
  const { s, w, h } = stageSvg(fs.readFileSync(svgFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  await withPage(scale, w, h, page(s), async p => {
    const info = await p.evaluate(() => {
      const kids = [...document.querySelector('#stage').children].filter(n => n.tagName.toLowerCase() === 'g');
      const stage = document.querySelector('#stage').getBoundingClientRect();
      return kids.map(k => {
        // pivot: a marker element with class="pivot" inside the group (measured on screen), or data-pivot="x y"
        let pivot = k.getAttribute('data-pivot');
        const m = k.querySelector('.pivot');
        if (m) { const r = m.getBoundingClientRect(); pivot = `${r.x + r.width / 2 - stage.x} ${r.y + r.height / 2 - stage.y}`; }
        // layer groups are named "layer-<name>" so they never clash with library part ids
        return { id: k.id, name: k.id.replace(/^layer-/, ''), layer: k.getAttribute('data-layer'), pivot };
      });
    });
    const els = info.filter(k => k.layer === 'el');
    let seenEl = false;
    for (const k of info) {
      if (k.layer === 'el') seenEl = true;
      else if (k.layer === 'bg' && seenEl) throw new Error(`bg group "${k.id}" comes after an el group; bg groups must come first`);
      else if (k.layer !== 'bg' && k.layer !== 'el' && k.layer !== 'skip')
        throw new Error(`top-level <g id="${k.id}"> needs data-layer="bg" | "el" | "skip"`);
      if (k.layer === 'el' && !k.id) throw new Error('el layer without id');
    }
    const show = async (pred) => p.evaluate((pred) => {
      const kids = [...document.querySelector('#stage').children].filter(n => n.tagName.toLowerCase() === 'g');
      kids.forEach(k => {
        const layer = k.getAttribute('data-layer');
        const on = pred === '__bg__' ? layer === 'bg' : k.id === pred;
        k.style.display = on ? '' : 'none';
      });
    }, pred);
    await show('__bg__');
    await p.screenshot({ path: path.join(outDir, 'bg.png'), clip: { x: 0, y: 0, width: w, height: h } });
    for (const k of els) {
      await show(k.id);
      await p.screenshot({ path: path.join(outDir, `${k.name}.full.png`), clip: { x: 0, y: 0, width: w, height: h }, omitBackground: true });
    }
    const manifest = {
      scene: path.relative(ROOT, svgFile), width: w, height: h, scale,
      elements: els.map(k => ({ id: k.name, pivot: k.pivot ? k.pivot.trim().split(/[\s,]+/).map(Number) : null })),
    };
    fs.writeFileSync(path.join(outDir, 'layers.json'), JSON.stringify(manifest, null, 2));
    console.log(`layers ${path.relative(ROOT, svgFile)} -> bg + ${els.length} elements`);
  });
}

async function text(specFile, outDir, scale) {
  // spec: { lines: [{ id, text, size, color, glow, weight, letterSpacing }] }
  const spec = JSON.parse(fs.readFileSync(specFile, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = spec.lines.map(l => {
    const glow = l.glow || '#fffdf7';
    const shadow = [`0 0 2px ${glow}`, `0 0 6px ${glow}`, `0 0 12px ${glow}`, `0 0 22px ${glow}`, `0 0 34px ${glow}`].join(',');
    // full-width ！？。， followed by a closing quote leave a wide hole: pull the quote in
    // (！？ are centred in their em box, 。， sit at its left, so they need less)
    const html = esc(l.text).replace(/([！？])”/g, '$1<span class="kq">”</span>').replace(/([。，])”/g, '$1<span class="kq2">”</span>');
    return `<div class="line" id="${l.id}" style="font-size:${l.size}px;color:${l.color};letter-spacing:${l.letterSpacing || 0.04}em;text-shadow:${shadow}">${html}</div>`;
  }).join('\n');
  const css = `.kq { margin-left: -0.45em; }
.kq2 { margin-left: -0.12em; }
.line { display: inline-block; font-family: 'MaokenZhuyuanTi'; padding: 0.55em 0.9em; line-height: 1.15; white-space: nowrap; margin: 4px; }
body { width: 4000px; }`;
  await withPage(scale, 4000, 2400, page(body, css), async p => {
    for (const l of spec.lines) {
      const el = await p.$('#' + l.id);
      await el.screenshot({ path: path.join(outDir, `${l.id}.png`), omitBackground: true });
    }
  });
  console.log(`text ${spec.lines.length} lines -> ${path.relative(ROOT, outDir)}`);
}

(async () => {
  const [mode, a, b, ...rest] = process.argv.slice(2);
  rest.forEach((v, i) => { if (v === '--lib') EXTRA_LIBS.push(path.resolve(rest[i + 1])); });
  const si = rest.indexOf('--scale');
  const scale = si >= 0 ? parseFloat(rest[si + 1]) : (mode === 'preview' ? 1 : 2);
  if (mode === 'preview') await preview(path.resolve(a), path.resolve(b), scale);
  else if (mode === 'layers') await layers(path.resolve(a), path.resolve(b), scale);
  else if (mode === 'text') await text(path.resolve(a), path.resolve(b), scale);
  else { console.error('usage: render.js preview|layers|text ...'); process.exit(2); }
})().catch(e => { console.error(e); process.exit(1); });
