#!/usr/bin/env node
// Generator for snail.svg (+ snail.preview.svg) in this folder: art/candidates/snail-A.
// Naturalist garden snail (Cornu aspersum), honey/caramel shell.
// Usage: node snail.gen.js [outDir]   (default: this file's folder)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;

// ---------------------------------------------------------------- helpers
const deg = Math.PI / 180;
const TAU = Math.PI * 2;
const fx = v => { const r = Math.round(v * 10) / 10; return (Object.is(r, -0) ? 0 : r).toString(); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const H = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const hex = c => '#' + c.map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const mul = (a, s) => a.map(v => v * s);
const add = (a, b) => a.map((v, i) => v + b[i]);
const norm = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
// 1-D value noise in [0,1]
function vnoise(x) {
  const h = i => { let n = Math.imul(i | 0, 374761393) ^ 0x5bd1e995; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  const a = h(i) * (1 - u) + h(i + 1) * u;
  const x2 = x * 2.13 + 7.7, i2 = Math.floor(x2), f2 = x2 - i2, u2 = f2 * f2 * (3 - 2 * f2);
  const b = h(i2 + 999) * (1 - u2) + h(i2 + 1000) * u2;
  return a * 0.7 + b * 0.3;
}
const P = pts => 'M' + pts.map(p => fx(p[0]) + ' ' + fx(p[1])).join('L');
const PZ = pts => P(pts) + 'Z';
// cubic bezier sampling
const bez = (p0, p1, p2, p3, t) => { const u = 1 - t; return [0, 1].map(i => u * u * u * p0[i] + 3 * u * u * t * p1[i] + 3 * u * t * t * p2[i] + t * t * t * p3[i]); };
const bezD = (p0, p1, p2, p3, t) => { const u = 1 - t; return [0, 1].map(i => 3 * u * u * (p1[i] - p0[i]) + 6 * u * t * (p2[i] - p1[i]) + 3 * t * t * (p3[i] - p2[i])); };

// palette (ART_BRIEF)
const C = {
  shHi: H('#F1DDBB'), shLight: H('#E2C394'), shMid: H('#C9A06E'), shBand: H('#9F7550'), shDark: H('#7E5B3E'),
  apex: H('#E9D5B0'),
  bLight: H('#DDD2C4'), bMid: H('#BFB1A0'), bDark: H('#9A8C7B'), fringe: H('#EAE2D6'), eye: H('#3E3833'),
};

// ================================================================ SHELL
const SH = { ax: -29, ay: -102.6, R: 104, k: 1.7, te: 80 * deg, turns: 4.55, sq: 0.96, lipW: 0.65 };
const lnk = Math.log(SH.k);
const rBase = t => SH.R * Math.exp(lnk * (t - SH.te) / TAU);
const flare = t => 1 + 0.02 * smooth(SH.te - 0.9, SH.te - 0.3, t);
const lipU = t => (t - (SH.te - SH.lipW)) / SH.lipW;           // 0..1 along the oblique lip
const rO = t => {
  let r = rBase(t) * flare(t);
  if (t > SH.te - SH.lipW) { const ri = rBase(t - TAU), u = lipU(t); r = ri + (r - ri) * Math.sqrt(Math.max(0, 1 - u * u)); }
  return r;
};
const rI = t => rBase(t - TAU);
const spt = (t, rho) => [SH.ax + rho * Math.cos(t), SH.ay + SH.sq * rho * Math.sin(t)];
const tMin = SH.te - TAU * SH.turns;

function shellOutline() {
  const pts = [];
  for (let t = SH.te - TAU; t < SH.te; t += 0.02) pts.push(spt(t, rO(t)));
  pts.push(spt(SH.te, rO(SH.te)));
  pts.push(spt(SH.te, rI(SH.te)));
  return pts;
}

const Ldir = norm([-0.55, -0.72, 0.62]);
const Hdir = norm(add(Ldir, [0, 0, 1]));
const domeC = [SH.ax + 8, SH.ay + 8], domeR = 95;

function shellAlbedo(t, f) {
  const prog = (t - tMin) / (SH.te - tMin);
  let base = mix(C.shLight, C.shMid, 0.25 + 0.4 * vnoise(t * 0.8 + 3.1));
  base = mix(C.apex, base, smooth(0.05, 0.5, prog));
  const bands = [[0.14, 0.04, 0.55], [0.35, 0.085, 0.95], [0.565, 0.08, 0.9], [0.78, 0.05, 0.65]];
  let dk = 0;
  bands.forEach(([c, w, a], i) => {
    const fl = vnoise(t * 3.1 - f * 1.4 + i * 17.3);
    const keep = 0.22 + 0.78 * smooth(0.34, 0.6, fl);
    const b = 1 - smooth(w * 0.5, w * 1.15, Math.abs(f - c));
    dk = Math.max(dk, a * b * keep);
  });
  dk *= smooth(0.15, 0.62, prog);
  let col = mix(base, C.shBand, dk * 0.92);
  col = mix(col, C.shDark, Math.max(0, dk - 0.5) * 0.75);
  const fleck = smooth(0.7, 0.88, vnoise(t * 5.3 - f * 0.9 + 91));
  col = mix(col, C.shHi, fleck * 0.3 * smooth(0.2, 0.7, prog));
  return col;
}

function shellShade(t, f) {
  const last = t > SH.te - TAU;
  const ri = rI(t), ro = rO(t), rho = ri + f * (ro - ri);
  const u = [Math.cos(t), Math.sin(t)];
  const s0 = 0.7, s1 = last ? 0.985 : 0.68;
  const sphi = clamp(-s0 + (s0 + s1) * f, -0.99, 0.99);
  const cphi = Math.sqrt(1 - sphi * sphi);
  const p = spt(t, rho);
  const dd = [(p[0] - domeC[0]) / domeR, (p[1] - domeC[1]) / domeR];
  let n = [sphi * u[0] + 0.42 * dd[0] * cphi, sphi * u[1] + 0.42 * dd[1] * cphi, cphi];
  n = norm(n);
  const diff = Math.max(0, (dot(n, Ldir) + 0.32) / 1.32);
  const ao = 1 - 0.26 * Math.exp(-f / 0.07) - (last ? 0 : 0.2 * Math.exp(-(1 - f) / 0.06));
  const spec = Math.pow(Math.max(0, dot(n, Hdir)), 16) * 0.2 + Math.pow(Math.max(0, dot(n, Hdir)), 60) * 0.16;
  // soft warm bounce light from the ground on the lower right
  const bounce = Math.max(0, dot(n, norm([0.35, 0.9, 0.1]))) * 0.06;
  const alb = shellAlbedo(t, f);
  const Lv = (0.5 + 0.56 * diff) * ao + bounce;
  const warm = mix([1.0, 0.88, 0.76], [1, 1, 1], smooth(0.5, 1.0, Lv));
  let col = alb.map((v, i) => v * Lv * warm[i]);
  col = add(col, mul([255, 247, 232], spec));
  return col;
}

function shellQuads() {
  const ts = [tMin];
  while (ts[ts.length - 1] < SH.te) { const t = ts[ts.length - 1]; ts.push(Math.min(SH.te, t + Math.min(0.14, 5.4 / rBase(t)))); }
  const fOuter = [0, 0.05, 0.13, 0.24, 0.36, 0.48, 0.6, 0.71, 0.81, 0.89, 0.95, 1];
  const fInner = [0, 0.08, 0.2, 0.34, 0.5, 0.66, 0.8, 0.92, 1];
  const buckets = new Map();
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i], t1 = ts[i + 1], tm = (t0 + t1) / 2;
    const fs_ = rO(tm) > 40 ? fOuter : fInner;
    for (let j = 0; j < fs_.length - 1; j++) {
      const f0 = fs_[j], f1 = fs_[j + 1];
      const q = (t, f) => spt(t, rI(t) + f * (rO(t) - rI(t)));
      const pts = [q(t0, f0), q(t1, f0), q(t1, f1), q(t0, f1)];
      const c = shellShade(tm, (f0 + f1) / 2).map(v => Math.round(clamp(v, 0, 255) / 4) * 4);
      const key = hex(c);
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(PZ(pts));
    }
  }
  let out = '';
  for (const [col, ds] of buckets) out += `<path fill="${col}" stroke="${col}" d="${ds.join('')}"/>\n`;
  return out;
}

function growthLines() {
  const R = rng(4242);
  const groups = { dk: [[], [], []], lt: [[], []], halt: [], haltLt: [] };
  let t = tMin + 2.2;
  let nextHalt = t + 0.5;
  while (t < SH.te - 0.02) {
    const ro = rO(t), ri = rI(t), w = ro - ri;
    const prog = (t - tMin) / (SH.te - tMin);
    const line = (tt, a, b) => {
      const pts = [];
      for (let k = 0; k <= 6; k++) {
        const f = a + (b - a) * k / 6;
        const rho = rI(tt) + f * (rO(tt) - rI(tt));
        const lean = -0.42 * Math.pow(f, 1.3) * w / rho + 0.012 * Math.sin(f * 7 + tt * 3);
        pts.push(spt(tt + lean, rho));
      }
      return P(pts);
    };
    const isHalt = t >= nextHalt;
    if (isHalt && prog > 0.35) {
      groups.halt.push(line(t, 0.0, 0.99));
      groups.haltLt.push(line(t + 1.6 / ro, 0.02, 0.97));
      nextHalt = t + 0.45 + R() * 0.6;
    } else if (isHalt) {
      nextHalt = t + 0.4 + R() * 0.5;
    }
    const a = R() < 0.35 ? 0.05 + R() * 0.3 : 0.0, b = 0.62 + R() * 0.37;
    const grp = prog < 0.45 ? 0 : (R() < 0.5 ? 1 : 2);
    groups.dk[grp].push(line(t, a, b));
    if (R() < 0.55 && prog > 0.3) groups.lt[R() < 0.5 ? 0 : 1].push(line(t + 1.3 / ro, R() * 0.2, 0.5 + R() * 0.45));
    t += (2.4 + R() * 1.6) / ro;
  }
  return groups;
}

function sutures() {
  const segs = [[], [], []];
  for (let t = tMin + 1.5; t <= SH.te - TAU + 0.001; t += 0.03) {
    const r = rO(t);
    const s = r > 45 ? 0 : (r > 20 ? 1 : 2);
    segs[s].push(spt(t, r));
  }
  // continuity between segments
  for (let i = 1; i < 3; i++) if (segs[i].length && segs[i - 1].length) segs[i - 1].push(segs[i][0]);
  const lt = [];
  for (let t = tMin + 3.5; t <= SH.te - TAU; t += 0.03) lt.push(spt(t, rO(t) + 1.9));
  return { segs, lt };
}

function shellSVG() {
  const outline = shellOutline();
  const outlineD = PZ(outline);
  const g = growthLines();
  const su = sutures();
  // oblique, slightly reflected lip along the last part of the outline
  const t0 = SH.te - SH.lipW * 1.02;
  const lp = [], li = [], lo = [], lsh = [], lyg = [];
  for (let k = 0; k <= 40; k++) {
    const t = t0 + (SH.te - t0) * k / 40;
    const a = spt(t, rO(t)), b = spt(t + 0.002, rO(t + 0.002));
    const tg = norm([b[0] - a[0], b[1] - a[1]]), nIn = [-tg[1], tg[0]];
    const u = clamp(lipU(t), 0, 1);
    const th = 1.0 + 3.0 * Math.sin(Math.PI * Math.pow(u, 0.75)) * (1 - 0.35 * u);
    lp.push(a);
    lo.push([a[0] - nIn[0] * 0.7, a[1] - nIn[1] * 0.7]);
    li.push([a[0] + nIn[0] * th, a[1] + nIn[1] * th]);
    if (u > 0.12) lsh.push([a[0] - nIn[0] * 3.2, a[1] - nIn[1] * 3.2]);
    if (u < 0.92) lyg.push([a[0] + nIn[0] * (th + 3.2), a[1] + nIn[1] * (th + 3.2)]);
  }
  const lipD = PZ(lo.concat(li.slice().reverse()));
  const lipEdge = P(li.slice(3, 38));
  const lipShadow = P(lsh), lipYoung = P(lyg);
  const Pi = spt(SH.te, rI(SH.te)), Po = lp[0];
  // glossy highlights (painted): along last whorl upper-left and 2nd whorl
  const hl = (t0, t1, f) => { const pts = []; for (let t = t0; t <= t1; t += 0.04) pts.push(spt(t, rI(t) + f * (rO(t) - rI(t)))); return P(pts); };
  const hl1 = hl(-3.0, -1.75, 0.6), hl1c = hl(-2.75, -2.05, 0.62);
  const hl2 = hl(-3.0 - TAU, -1.95 - TAU, 0.6), hl2c = hl(-2.75 - TAU, -2.2 - TAU, 0.62);
  const hl3 = hl(-2.9 - 2 * TAU, -2.0 - 2 * TAU, 0.6);
  return { outlineD, quads: shellQuads(), g, su, lipD, lipEdge, lipShadow, lipYoung, hl1, hl1c, hl2, hl2c, hl3, Pi, Po };
}

// ================================================================ VORONOI (skin reticulation)
function delaunay(pts) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const p of pts) { minx = Math.min(minx, p[0]); miny = Math.min(miny, p[1]); maxx = Math.max(maxx, p[0]); maxy = Math.max(maxy, p[1]); }
  const d = Math.max(maxx - minx, maxy - miny) * 20, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2;
  const V = pts.concat([[cx - d, cy - d], [cx + d, cy - d], [cx, cy + d]]);
  const n = pts.length;
  const circ = (a, b, c) => {
    const [ax, ay] = V[a], [bx, by] = V[b], [cx_, cy_] = V[c];
    const D = 2 * (ax * (by - cy_) + bx * (cy_ - ay) + cx_ * (ay - by));
    const ux = ((ax * ax + ay * ay) * (by - cy_) + (bx * bx + by * by) * (cy_ - ay) + (cx_ * cx_ + cy_ * cy_) * (ay - by)) / D;
    const uy = ((ax * ax + ay * ay) * (cx_ - bx) + (bx * bx + by * by) * (ax - cx_) + (cx_ * cx_ + cy_ * cy_) * (bx - ax)) / D;
    return [ux, uy, (ax - ux) ** 2 + (ay - uy) ** 2];
  };
  let tris = [[n, n + 1, n + 2, circ(n, n + 1, n + 2)]];
  for (let i = 0; i < n; i++) {
    const [px, py] = V[i];
    const bad = [], keep = [];
    for (const tr of tris) { const c = tr[3]; ((px - c[0]) ** 2 + (py - c[1]) ** 2 < c[2]) ? bad.push(tr) : keep.push(tr); }
    const ecount = new Map();
    for (const tr of bad) for (const [a, b] of [[tr[0], tr[1]], [tr[1], tr[2]], [tr[2], tr[0]]]) {
      const k = a < b ? a + ',' + b : b + ',' + a; ecount.set(k, (ecount.get(k) || 0) + 1);
    }
    tris = keep;
    for (const [k, c] of ecount) if (c === 1) { const [a, b] = k.split(',').map(Number); tris.push([a, b, i, circ(a, b, i)]); }
  }
  return { tris, n };
}
function voronoiEdges(pts) {
  const { tris, n } = delaunay(pts);
  const emap = new Map();
  tris.forEach((tr, ti) => {
    for (const [a, b] of [[tr[0], tr[1]], [tr[1], tr[2]], [tr[2], tr[0]]]) {
      const k = a < b ? a + ',' + b : b + ',' + a; if (!emap.has(k)) emap.set(k, []); emap.get(k).push(ti);
    }
  });
  const edges = [];
  for (const [, ts] of emap) if (ts.length === 2) {
    const A = tris[ts[0]], B = tris[ts[1]];
    if (A.slice(0, 3).some(v => v >= n) || B.slice(0, 3).some(v => v >= n)) continue;
    edges.push([[A[3][0], A[3][1]], [B[3][0], B[3][1]]]);
  }
  return edges;
}
// net of cells: jittered grid in an anisotropic frame; returns path d (edges within bbox)
function skinNet({ x0, y0, x1, y1, sp, aspect, ang, seed, maxLen, shrink }) {
  const R = rng(seed);
  const ca = Math.cos(ang * deg), sa = Math.sin(ang * deg);
  // q-space -> p-space:  p = Rot(ang) * diag(aspect,1) * q
  const toP = q => { const a = q[0] * aspect, b = q[1]; return [a * ca - b * sa, a * sa + b * ca]; };
  const toQ = p => { const a = p[0] * ca + p[1] * sa, b = -p[0] * sa + p[1] * ca; return [a / aspect, b]; };
  const corners = [[x0, y0], [x1, y0], [x0, y1], [x1, y1]].map(toQ);
  const qx0 = Math.min(...corners.map(c => c[0])) - sp * 2, qx1 = Math.max(...corners.map(c => c[0])) + sp * 2;
  const qy0 = Math.min(...corners.map(c => c[1])) - sp * 2, qy1 = Math.max(...corners.map(c => c[1])) + sp * 2;
  const pts = [];
  for (let qy = qy0, row = 0; qy <= qy1; qy += sp * 0.87, row++)
    for (let qx = qx0 + (row % 2) * sp * 0.5; qx <= qx1; qx += sp) {
      const q = [qx + (R() - 0.5) * sp * 0.7, qy + (R() - 0.5) * sp * 0.6];
      const p = toP(q);
      if (p[0] < x0 - sp * 3 || p[0] > x1 + sp * 3 || p[1] < y0 - sp * 3 || p[1] > y1 + sp * 3) continue;
      pts.push(q);
    }
  const edges = voronoiEdges(pts);
  let d = '';
  for (const [a, b] of edges) {
    let pa = toP(a), pb = toP(b);
    if (Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) > maxLen) continue;
    if ((pa[0] < x0 && pb[0] < x0) || (pa[0] > x1 && pb[0] > x1) || (pa[1] < y0 && pb[1] < y0) || (pa[1] > y1 && pb[1] > y1)) continue;
    if (shrink) { const m = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2]; pa = mix(pa, m, shrink); pb = mix(pb, m, shrink); }
    d += 'M' + fx(pa[0]) + ' ' + fx(pa[1]) + 'L' + fx(pb[0]) + ' ' + fx(pb[1]);
  }
  return d;
}

// ================================================================ STALKS / TENTACLES
// tapered tube along a cubic centreline; widths w(s) ; returns polygon points
function tube(p0, p1, p2, p3, wfun, n = 36) {
  const L = [], Rr = [];
  for (let i = 0; i <= n; i++) {
    const s = i / n, c = bez(p0, p1, p2, p3, s), d = norm(bezD(p0, p1, p2, p3, s));
    const nn = [-d[1], d[0]], w = wfun(s) / 2;
    L.push([c[0] + nn[0] * w, c[1] + nn[1] * w]); Rr.push([c[0] - nn[0] * w, c[1] - nn[1] * w]);
  }
  return L.concat(Rr.reverse());
}
function centre(p0, p1, p2, p3, a = 0, b = 1, n = 24, off = 0) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const s = a + (b - a) * i / n, c = bez(p0, p1, p2, p3, s), d = norm(bezD(p0, p1, p2, p3, s));
    pts.push([c[0] - d[1] * off, c[1] + d[0] * off]);
  }
  return pts;
}

const STALK = {
  near: { base: [123.6, -76], c: [[123, -61], [126, -114], [139.5, -162], [150.5, -192.5]], w0: 16, w1: 7.2, wb: 11, bulb: [151.1, -193.9], eyeR: 1.75, col: ['#CFC3B4', '#B4A694', '#958775'], id: 'near' },
  far: { base: [112, -73.5], c: [[112, -58.5], [112, -112], [119.5, -156], [127.5, -186]], w0: 14, w1: 6.4, wb: 9.8, bulb: [127.8, -187.4], eyeR: 1.55, col: ['#BFB2A2', '#A49684', '#887a69'], id: 'far' },
};
function stalkSVG(S) {
  const [p0, p1, p2, p3] = S.c;
  const wf = s => S.w1 + (S.w0 - S.w1) * Math.pow(1 - s, 2.2) + (s < 0.17 ? 9 * Math.pow(1 - s / 0.17, 2) : 0);
  const poly = tube(p0, p1, p2, p3, wf);
  const tip = bez(p0, p1, p2, p3, 1), dir = norm(bezD(p0, p1, p2, p3, 1));
  const bulbC = S.bulb;
  const ang = Math.atan2(dir[1], dir[0]) / deg + 90;
  const pre = 'snail-stalk-' + S.id;
  // rings (annulations)
  let rings = '';
  for (let s = 0.2; s < 0.93; s += 0.055) {
    const c = bez(p0, p1, p2, p3, s), d = norm(bezD(p0, p1, p2, p3, s)), nn = [-d[1], d[0]], w = wf(s) / 2 * 0.92;
    const a = [c[0] + nn[0] * w, c[1] + nn[1] * w], b = [c[0] - nn[0] * w, c[1] - nn[1] * w];
    const m = [c[0] + d[0] * 1.3, c[1] + d[1] * 1.3];
    rings += `M${fx(a[0])} ${fx(a[1])}Q${fx(m[0])} ${fx(m[1])} ${fx(b[0])} ${fx(b[1])}`;
  }
  const hlPts = centre(p0, p1, p2, p3, 0.12, 0.97, 24, 0);
  // highlight line on the left (light side) edge
  const leftEdge = []; const rightEdge = []; const core = [];
  for (let i = 0; i <= 30; i++) {
    const s = 0.1 + 0.88 * i / 30, c = bez(p0, p1, p2, p3, s), d = norm(bezD(p0, p1, p2, p3, s)), nn = [-d[1], d[0]], w = wf(s) / 2;
    leftEdge.push([c[0] - nn[0] * w * 0.45, c[1] - nn[1] * w * 0.45]);
    rightEdge.push([c[0] + nn[0] * w * 0.62, c[1] + nn[1] * w * 0.62]);
    core.push([c[0] + nn[0] * w * 0.05, c[1] + nn[1] * w * 0.05]);
  }
  // NB: the tube normal nn points to the right side of the travel direction (travel is upward), i.e. +x side
  const eyeC = [bulbC[0] + dir[0] * S.wb * 0.2 + 1.1, bulbC[1] + dir[1] * S.wb * 0.2 - 0.3];
  const rb = S.wb / 2;
  return `
  <linearGradient id="${pre}-fade" gradientUnits="userSpaceOnUse" x1="0" y1="${fx(S.base[1] + 9)}" x2="0" y2="${fx(S.base[1] - 4)}">
    <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.6" stop-color="#fff" stop-opacity="0.75"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>
  <linearGradient id="${pre}-fill" gradientUnits="userSpaceOnUse" x1="0" y1="${fx(S.base[1] + 6)}" x2="0" y2="${fx(S.base[1] - 14)}">
    <stop offset="0" stop-color="${S.id === 'near' ? '#CEC2B3' : '#C2B5A5'}"/><stop offset="1" stop-color="${S.col[1]}"/></linearGradient>
  <mask id="${pre}-mask" maskUnits="userSpaceOnUse" x="${fx(S.base[0] - 40)}" y="-230" width="100" height="200">
    <rect x="${fx(S.base[0] - 40)}" y="-230" width="100" height="200" fill="url(#${pre}-fade)"/></mask>
  <radialGradient id="${pre}-bulbg" gradientUnits="userSpaceOnUse" cx="${fx(bulbC[0] - 1.6)}" cy="${fx(bulbC[1] - 1.8)}" r="${fx(rb * 1.25)}">
    <stop offset="0" stop-color="${S.col[0]}"/><stop offset="0.45" stop-color="${S.col[1]}"/><stop offset="1" stop-color="${S.col[2]}"/></radialGradient>
  <radialGradient id="${pre}-eyeg" gradientUnits="userSpaceOnUse" cx="${fx(eyeC[0])}" cy="${fx(eyeC[1])}" r="${fx(S.eyeR + 1.2)}">
    <stop offset="0" stop-color="#3E3833"/><stop offset="0.55" stop-color="#3E3833" stop-opacity="0.92"/><stop offset="1" stop-color="#6b6056" stop-opacity="0"/></radialGradient>
  <clipPath id="${pre}-clip"><path d="${PZ(poly)}"/><circle cx="${fx(bulbC[0])}" cy="${fx(bulbC[1])}" r="${fx(rb)}"/></clipPath>
  <g id="${pre}">
    <g filter="url(#wc-paint-soft)"><g mask="url(#${pre}-mask)">
      <path d="${PZ(poly)}" fill="url(#${pre}-fill)"/>
      <circle cx="${fx(bulbC[0])}" cy="${fx(bulbC[1])}" r="${fx(rb)}" fill="${S.col[1]}"/>
      <g clip-path="url(#${pre}-clip)">
        <path d="${P(rightEdge)}" fill="none" stroke="${S.col[2]}" stroke-width="${fx(S.w1 * 0.55)}" stroke-linecap="round" opacity="0.55" filter="url(#snail-blur1)"/>
        <path d="${P(leftEdge)}" fill="none" stroke="${S.col[0]}" stroke-width="${fx(S.w1 * 0.5)}" stroke-linecap="round" opacity="0.9" filter="url(#snail-blur1)"/>
        <path d="${P(core)}" fill="none" stroke="${S.col[2]}" stroke-width="1.1" opacity="0.22"/>
        <path d="${rings}" fill="none" stroke="${S.col[2]}" stroke-width="0.7" opacity="0.32"/>
        <circle cx="${fx(bulbC[0])}" cy="${fx(bulbC[1])}" r="${fx(rb)}" fill="url(#${pre}-bulbg)"/>
      </g>
      <circle cx="${fx(eyeC[0])}" cy="${fx(eyeC[1])}" r="${fx(S.eyeR + 1.2)}" fill="url(#${pre}-eyeg)"/>
      <circle cx="${fx(eyeC[0] - 0.8)}" cy="${fx(eyeC[1] - 0.9)}" r="0.75" fill="#fffaf2" opacity="0.8"/>
    </g></g>
  </g>`;
}

// ================================================================ BODY + HEAD paths (hand designed)
const BODY_D = 'M-151 -1C-146 -7 -132 -16 -114 -24C-96 -31 -76 -40 -58 -48C-50 -55 -35 -60 -15 -60C5 -60 18 -48 22 -36' +
  'C26 -32 29 -30 32 -29C36 -27 40 -24 44 -21.5C48 -19 52 -16.5 58 -15.5C76 -14.5 92 -13.5 104 -11.2' +
  'C114 -9.6 124 -9 134 -9.1C142 -9.2 149 -8.6 152 -5.5C153.8 -3 153 -0.5 150 0L-149.5 0C-151.5 0 -151.5 -0.5 -151 -1Z';
const TAILTOP_D = 'M-150 -2C-145 -7.5 -132 -16.5 -114 -24.5C-96 -31.5 -76 -40.5 -59 -47.5';
const FOOTTOP_D = 'M33 -28.5C36 -27 40 -24 44 -21.5C48 -19 52 -16.5 58 -15.5C76 -14.5 92 -13.5 104 -11.2C114 -9.6 124 -9 134 -9.1';
const FOOTFRONT_D = 'M132 -9.1C142 -9.2 149 -8.6 152 -5.5C153.8 -3 153 -0.5 150 0';
const HEAD_D = 'M12 -40C10 -62 18 -84 36 -88C48 -90 54 -74 60 -64C70 -61 84 -60 96 -63.5C105 -67 111 -75.5 119 -78' +
  'C131 -80 142 -73 149 -62C155 -53 159 -40 160 -30C160.5 -23.5 157.5 -15.5 150 -11C146 -10 141 -9 135 -8.2' +
  'C128 -7.4 118 -6 108 -5.4C100 -5.1 94 -5 90 -5C78 -5.2 66 -7.5 58 -10C48 -13 40 -18 30 -24C20 -29 13 -33 12 -40Z';
const NECKTOP_D = 'M58 -63.5C70 -61 84 -60 96 -63.5C105 -67 111 -75.5 119 -78C131 -80 142 -73 149 -62C155 -53 159 -40 160 -30';
const LT_NEAR = [[154, -30], [159, -27], [164, -24], [168, -21]];
const LT_FAR = [[152, -34], [157, -32.5], [161, -31], [165, -29.5]];
const PIVOT = { neck: [80, -38], near: STALK.near.base, far: STALK.far.base };

function bodySVG() {
  const netBody = skinNet({ x0: -155, y0: -62, x1: 70, y1: 0, sp: 7.2, aspect: 1.75, ang: 118, seed: 11, maxLen: 22 });
  const netTail = skinNet({ x0: -155, y0: -30, x1: -95, y1: 0, sp: 5.6, aspect: 1.6, ang: 150, seed: 12, maxLen: 16 });
  const netFoot = skinNet({ x0: 40, y0: -18, x1: 155, y1: 0, sp: 5.6, aspect: 1.7, ang: 112, seed: 13, maxLen: 16 });
  // fringe striations
  let stri = '';
  const R = rng(77);
  for (let x = -146; x < 150; x += 2.3 + R() * 1.0) {
    const top = x < -128 ? -2.5 - (x + 146) * 0.15 : (x > 140 ? -5.8 + (x - 140) * 0.3 : -6.2);
    stri += `M${fx(x)} ${fx(top + R() * 1.2)}L${fx(x - 1.1)} ${fx(-0.6)}`;
  }
  const fringeD = 'M-150.5 -1.4C-140 -4 -126 -6.2 -110 -6.6C-60 -7 0 -7.2 60 -6.8C100 -6.6 125 -6.3 140 -6C147 -5.8 152 -4.6 152.6 -2.6L150 0L-149.5 0C-151 0 -151 -0.7 -150.5 -1.4Z';
  const grooveD = 'M-149 -2.6C-139 -5 -126 -6.8 -110 -7.2C-60 -7.6 0 -7.8 60 -7.4C100 -7.2 120 -7 132 -6.9';
  // shell bottom contour (for the shadow it casts on the body)
  const sb = [];
  for (let a = 165; a >= 80; a -= 3) { const t = a * deg - TAU; sb.push(spt(t, rO(t))); }
  for (let t = SH.te; t >= SH.te - SH.lipW * 0.75; t -= 0.03) sb.push(spt(t, rO(t)));
  const shadowD = P(sb);
  return `
  <linearGradient id="snail-body-g" gradientUnits="userSpaceOnUse" x1="0" y1="-62" x2="0" y2="0">
    <stop offset="0" stop-color="#9F917F"/><stop offset="0.4" stop-color="#B2A492"/><stop offset="0.72" stop-color="#C3B6A5"/><stop offset="0.9" stop-color="#CFC4B5"/><stop offset="1" stop-color="#D6CCBF"/></linearGradient>
  <linearGradient id="snail-fringe-g" gradientUnits="userSpaceOnUse" x1="0" y1="-7.5" x2="0" y2="0">
    <stop offset="0" stop-color="#DCD2C4"/><stop offset="0.45" stop-color="#EAE2D6"/><stop offset="1" stop-color="#F2ECE3"/></linearGradient>
  <linearGradient id="snail-netfade-g" gradientUnits="userSpaceOnUse" x1="0" y1="-60" x2="0" y2="0">
    <stop offset="0" stop-color="#fff" stop-opacity="0.55"/><stop offset="0.45" stop-color="#fff" stop-opacity="1"/><stop offset="0.84" stop-color="#fff" stop-opacity="0.85"/><stop offset="0.9" stop-color="#fff" stop-opacity="0"/></linearGradient>
  <mask id="snail-body-netmask" maskUnits="userSpaceOnUse" x="-170" y="-80" width="340" height="90"><rect x="-170" y="-80" width="340" height="90" fill="url(#snail-netfade-g)"/></mask>
  <clipPath id="snail-body-clip"><path d="${BODY_D}"/></clipPath>
  <path id="snail-net-body" d="${netBody}"/>
  <path id="snail-net-tail" d="${netTail}"/>
  <path id="snail-net-foot" d="${netFoot}"/>
  <g id="snail-body">
    <g filter="url(#wc-paint)">
      <path d="${BODY_D}" fill="url(#snail-body-g)"/>
      <g clip-path="url(#snail-body-clip)">
        <!-- lit top of the tail -->
        <path d="${TAILTOP_D}" fill="none" stroke="#E6DDD1" stroke-width="12" opacity="0.92" transform="translate(1.5 5)" filter="url(#snail-blur3)"/>
        <path d="${TAILTOP_D}" fill="none" stroke="#F1EBE2" stroke-width="3" opacity="0.6" transform="translate(0.8 2.6)" filter="url(#snail-blur1)"/>
        <path d="M44 -19C52 -14 62 -12.5 80 -12C100 -11 120 -9.5 146 -8" fill="none" stroke="#D9CFC1" stroke-width="4" opacity="0.7" filter="url(#snail-blur2)"/>
        <!-- shade above the fringe -->
        <path d="M-150 -9.5C-100 -10.5 0 -11 150 -10.5" fill="none" stroke="#9F917F" stroke-width="7" opacity="0.45" filter="url(#snail-blur2)"/>
        <!-- shadow cast by the shell -->
        <path d="${shadowD}" fill="none" stroke="#76695A" stroke-width="18" opacity="0.6" transform="translate(3 5)" filter="url(#snail-blur4)"/>
        <!-- warm translucent tone near the tail tip -->
        <ellipse cx="-138" cy="-4" rx="18" ry="5" fill="#E8DDCF" opacity="0.6" filter="url(#snail-blur2)"/>
        <!-- reticulated skin -->
        <g mask="url(#snail-body-netmask)" filter="url(#wc-line)" fill="none">
          <use href="#snail-net-body" stroke="#F0E8DC" stroke-width="1.1" opacity="0.4" transform="translate(0.8 0.9)"/>
          <use href="#snail-net-body" stroke="#7F7261" stroke-width="0.95" opacity="0.42"/>
          <g clip-path="url(#snail-tailzone)">
            <use href="#snail-net-tail" stroke="#F0E8DC" stroke-width="0.9" opacity="0.35" transform="translate(0.6 0.7)"/>
            <use href="#snail-net-tail" stroke="#7F7261" stroke-width="0.8" opacity="0.35"/>
          </g>
          <g clip-path="url(#snail-footzone)">
            <use href="#snail-net-foot" stroke="#F0E8DC" stroke-width="0.9" opacity="0.4" transform="translate(0.6 0.7)"/>
            <use href="#snail-net-foot" stroke="#7F7261" stroke-width="0.8" opacity="0.38"/>
          </g>
        </g>
        <!-- foot fringe -->
        <path d="${fringeD}" fill="url(#snail-fringe-g)" opacity="0.95"/>
        <path d="${stri}" fill="none" stroke="#A99C8B" stroke-width="0.75" opacity="0.38" filter="url(#wc-line)"/>
        <path d="${grooveD}" fill="none" stroke="#8E806E" stroke-width="1.1" opacity="0.4" filter="url(#wc-line)"/>
        <!-- moist sheen -->
        <path d="M-128 -10.5C-116 -15 -104 -20.5 -92 -27" fill="none" stroke="#FBF7F0" stroke-width="1.6" stroke-linecap="round" opacity="0.55" filter="url(#snail-blur1)"/>
        <path d="M66 -13.6C82 -13.3 94 -12.5 104 -10.6" fill="none" stroke="#FBF7F0" stroke-width="1.3" stroke-linecap="round" opacity="0.45" filter="url(#snail-blur1)"/>
      </g>
      <path d="${TAILTOP_D}" fill="none" stroke="#857766" stroke-width="1.3" opacity="0.5" filter="url(#wc-line)"/>
      <path d="M-140 -7.5C-128 -12.5 -114 -18 -100 -24C-88 -29 -76 -35 -66 -41" fill="none" stroke="#8C7E6C" stroke-width="1" opacity="0.32" transform="translate(1 6.5)" filter="url(#wc-line)"/>
      <path d="${FOOTTOP_D}" fill="none" stroke="#857766" stroke-width="1.1" opacity="0.3" filter="url(#wc-line)"/>
      <path d="${FOOTFRONT_D}" fill="none" stroke="#857766" stroke-width="1.2" opacity="0.42" filter="url(#wc-line)"/>
    </g>
  </g>`;
}

function headSVG() {
  const netNeck = skinNet({ x0: 10, y0: -90, x1: 160, y1: -4, sp: 6.4, aspect: 1.9, ang: -24, seed: 21, maxLen: 20 });
  const ltNear = tube(...LT_NEAR, s => 9.5 - 3.4 * s);
  const ltFar = tube(...LT_FAR, s => 8 - 3 * s);
  const ltTipN = LT_NEAR[3], ltTipF = LT_FAR[3];
  return `
  <linearGradient id="snail-head-g" gradientUnits="userSpaceOnUse" x1="92" y1="-84" x2="104" y2="-4">
    <stop offset="0" stop-color="#D9CEC0"/><stop offset="0.3" stop-color="#CBBFB0"/><stop offset="0.65" stop-color="#B7A997"/><stop offset="1" stop-color="#A09281"/></linearGradient>
  <radialGradient id="snail-head-hl" gradientUnits="userSpaceOnUse" cx="130" cy="-60" r="32">
    <stop offset="0" stop-color="#E4DACD" stop-opacity="0.9"/><stop offset="1" stop-color="#E4DACD" stop-opacity="0"/></radialGradient>
  <linearGradient id="snail-neckroot-g" gradientUnits="userSpaceOnUse" x1="50" y1="0" x2="84" y2="0">
    <stop offset="0" stop-color="#857766" stop-opacity="0.85"/><stop offset="1" stop-color="#857766" stop-opacity="0"/></linearGradient>
  <clipPath id="snail-head-clip"><path d="${HEAD_D}"/></clipPath>
  <path id="snail-net-neck" d="${netNeck}"/>
  <g id="snail-head-base">
    <g filter="url(#wc-paint)">
      <path d="${PZ(ltFar)}" fill="#9F917F"/>
      <circle cx="${fx(ltTipF[0])}" cy="${fx(ltTipF[1])}" r="2.5" fill="#A89A88"/>
      <path d="${HEAD_D}" fill="url(#snail-head-g)"/>
      <g clip-path="url(#snail-head-clip)">
        <path d="${HEAD_D}" fill="url(#snail-head-hl)"/>
        <!-- lit top of neck -->
        <path d="${NECKTOP_D}" fill="none" stroke="#E3D9CC" stroke-width="10" opacity="0.75" transform="translate(1.5 5.5)" filter="url(#snail-blur3)"/>
        <!-- shadowed underside -->
        <path d="M30 -14C60 -6 100 -4 136 -7.5C146 -9 152 -12 156 -17" fill="none" stroke="#8E806E" stroke-width="12" opacity="0.42" filter="url(#snail-blur4)"/>
        <!-- root in the shade of the shell -->
        <path d="${HEAD_D}" fill="url(#snail-neckroot-g)"/>
        <!-- longitudinal dorsal furrows of the neck -->
        <path d="M62 -55C80 -56 96 -61 112 -71M64 -47C84 -49 104 -55 124 -66M70 -38C90 -40 112 -46 134 -56" fill="none" stroke="#857766" stroke-width="1.1" opacity="0.35" filter="url(#wc-line)"/>
        <path d="M62 -54C80 -55 96 -60 112 -70M64 -46C84 -48 104 -54 124 -65M70 -37C90 -39 112 -45 134 -55" fill="none" stroke="#F0E8DC" stroke-width="1" opacity="0.35" transform="translate(0.6 1.3)" filter="url(#wc-line)"/>
        <g filter="url(#wc-line)" fill="none">
          <use href="#snail-net-neck" stroke="#F0E8DC" stroke-width="1" opacity="0.38" transform="translate(0.7 0.9)"/>
          <use href="#snail-net-neck" stroke="#7F7261" stroke-width="0.85" opacity="0.38"/>
        </g>
        <!-- moist sheen on the neck -->
        <path d="M70 -58.5C82 -58.5 92 -61 102 -66" fill="none" stroke="#FBF7F0" stroke-width="1.6" stroke-linecap="round" opacity="0.55" filter="url(#snail-blur1)"/>
        <path d="M133 -76C140 -73 145 -67 149 -60" fill="none" stroke="#FBF7F0" stroke-width="1.4" stroke-linecap="round" opacity="0.45" filter="url(#snail-blur1)"/>
      </g>
      <path d="${PZ(ltNear)}" fill="#B9AB99"/>
      <path d="${P(centre(...LT_NEAR, 0.1, 0.9, 10, -1.6))}" fill="none" stroke="#D8CDBF" stroke-width="2" opacity="0.8" stroke-linecap="round"/>
      <circle cx="${fx(ltTipN[0])}" cy="${fx(ltTipN[1])}" r="3.05" fill="#C4B7A7"/>
      <path d="${NECKTOP_D}" fill="none" stroke="#857766" stroke-width="1.25" opacity="0.45" filter="url(#wc-line)"/>
    </g>
  </g>`;
}

// ================================================================ ASSEMBLE LIBRARY
function library() {
  const sh = shellSVG();
  const g = sh.g;
  const join = a => a.join('');
  const shell = `
  <clipPath id="snail-shell-clip"><path d="${sh.outlineD}"/></clipPath>
  <radialGradient id="snail-shell-form" gradientUnits="userSpaceOnUse" cx="${fx(SH.ax - 30)}" cy="${fx(SH.ay - 38)}" r="165">
    <stop offset="0" stop-color="#FFF4E0" stop-opacity="0.16"/><stop offset="0.38" stop-color="#FFF4E0" stop-opacity="0"/>
    <stop offset="0.72" stop-color="#6E4F36" stop-opacity="0.1"/><stop offset="0.9" stop-color="#6E4F36" stop-opacity="0.24"/><stop offset="1" stop-color="#6E4F36" stop-opacity="0.3"/></radialGradient>
  <path id="snail-shell-outline" d="${sh.outlineD}"/>
  <g id="snail-shell">
    <g filter="url(#wc-paint)">
      <use href="#snail-shell-outline" fill="#C9A06E"/>
      <g clip-path="url(#snail-shell-clip)">
        <g filter="url(#snail-soften)" stroke-width="0.8" stroke-linejoin="round">
${sh.quads}        </g>
        <!-- global form: light upper-left, warm core shade lower-right, faint bounce at the rim -->
        <use href="#snail-shell-outline" fill="url(#snail-shell-form)"/>
        <!-- growth lines -->
        <g filter="url(#wc-line)" fill="none" stroke-linecap="round">
          <path d="${join(g.dk[0])}" stroke="#7E5B3E" stroke-width="0.6" opacity="0.16"/>
          <path d="${join(g.dk[1])}" stroke="#7E5B3E" stroke-width="0.8" opacity="0.22"/>
          <path d="${join(g.dk[2])}" stroke="#7E5B3E" stroke-width="0.7" opacity="0.32"/>
          <path d="${join(g.lt[0])}" stroke="#F1DDBB" stroke-width="0.8" opacity="0.22"/>
          <path d="${join(g.lt[1])}" stroke="#F1DDBB" stroke-width="0.6" opacity="0.32"/>
          <path d="${join(g.halt)}" stroke="#6E4F36" stroke-width="1.1" opacity="0.38"/>
          <path d="${join(g.haltLt)}" stroke="#F3E2C2" stroke-width="1.2" opacity="0.3"/>
        </g>
        <!-- sutures -->
        <g filter="url(#wc-line)" fill="none" stroke-linecap="round">
          <path d="${P(sh.su.lt)}" stroke="#F6E8CC" stroke-width="1.3" opacity="0.4"/>
          <path d="${P(sh.su.segs[0])}" stroke="#6F5038" stroke-width="1.5" opacity="0.55"/>
          <path d="${P(sh.su.segs[1])}" stroke="#6F5038" stroke-width="1.1" opacity="0.5"/>
          <path d="${P(sh.su.segs[2])}" stroke="#6F5038" stroke-width="0.75" opacity="0.45"/>
        </g>
        <path d="${sh.lipYoung}" fill="none" stroke="#EBD5AC" stroke-width="6" opacity="0.45" filter="url(#snail-blur2)"/>
        <!-- glossy highlights, upper left -->
        <g fill="none" stroke-linecap="round">
          <path d="${sh.hl1}" stroke="#FFF8EC" stroke-width="15" opacity="0.42" filter="url(#snail-blur4)"/>
          <path d="${sh.hl1c}" stroke="#FFFDF8" stroke-width="4" opacity="0.72" filter="url(#snail-blur2)"/>
          <path d="${sh.hl2}" stroke="#FFF8EC" stroke-width="7" opacity="0.42" filter="url(#snail-blur2)"/>
          <path d="${sh.hl2c}" stroke="#FFFDF8" stroke-width="2.2" opacity="0.55" filter="url(#snail-blur1)"/>
          <path d="${sh.hl3}" stroke="#FFF8EC" stroke-width="3.5" opacity="0.36" filter="url(#snail-blur1)"/>
        </g>
      </g>
      <!-- aperture lip (peristome): soft shade it casts into the aperture/body, then the pale rim -->
      <path d="${sh.lipShadow}" fill="none" stroke="#6A5643" stroke-width="4.5" opacity="0.3" stroke-linecap="round" filter="url(#snail-blur2)"/>
      <path d="${sh.lipD}" fill="#F0E3C9"/>
      <path d="${sh.lipEdge}" fill="none" stroke="#8C6A4C" stroke-width="1.1" opacity="0.45" filter="url(#wc-line)"/>
      <use href="#snail-shell-outline" fill="none" stroke="#7E5B3E" stroke-width="1.4" opacity="0.45" filter="url(#wc-line)"/>
    </g>
  </g>`;

  const header = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<!--
  snail-A : the hero snail (小蜗牛), naturalist picture-book design (garden snail, Cornu aspersum).
  Generated by snail.gen.js (same folder) - edit the generator, not this file, for geometry changes.

  LOCAL COORDINATES (shared by every part; assemble by using all parts with the same transform)
    origin (0,0) = centre of the foot's contact line with the ground; snail faces +x; ground is y = 0,
    the snail is above it (negative y). Sole contact line x -150 .. +150.
    tail tip (-151,-1); snout front (160,-30); lower-tentacle tips ~(171,-21); total length ~ 311.
    shell outline x -100..64, y -181..-20 (164 x 161), spiral apex (${SH.ax},${SH.ay}), aperture lip at the
    front-bottom resting on the body. Eyestalk tips: near ~(152,-199), far ~(129,-192).

  PARTS (all inside <defs>)
    snail-shell       shell only
    snail-body        foot, tail and soft body under/behind the shell
    snail-head        neck + head + both eyestalks + lower tentacles   PIVOT (neck root) = (${PIVOT.neck})
    snail-head-base   snail-head without the eyestalks                  PIVOT = (${PIVOT.neck})
    snail-stalk-near  near eyestalk with eye, assembled position        PIVOT (stalk base) = (${PIVOT.near})
    snail-stalk-far   far eyestalk with eye (darker, thinner)           PIVOT (stalk base) = (${PIVOT.far})
    snail-shadow      soft contact shadow under the foot (not part of snail)
    snail             snail-head, snail-body, snail-shell (z-order bottom -> top)
    snail-headup      as snail, head rotated -22 deg around the neck pivot (${PIVOT.neck})

  The neck root runs ~65 px back under body+shell; head rotations between -25 and +10 deg around the
  neck pivot stay seamless. Stalk roots reach ~15 px into the head and fade out, so they work above or
  below snail-head-base; they may sway +-8 deg around their bases.
-->
<defs>
  <filter id="snail-soften" x="-2%" y="-2%" width="104%" height="104%"><feGaussianBlur stdDeviation="0.9"/></filter>
  <filter id="snail-blur1" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1"/></filter>
  <filter id="snail-blur2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2"/></filter>
  <filter id="snail-blur3" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="3"/></filter>
  <filter id="snail-blur4" x="-20%" y="-30%" width="140%" height="160%"><feGaussianBlur stdDeviation="4"/></filter>
  <filter id="snail-shadow-blur" x="-20%" y="-200%" width="140%" height="500%"><feGaussianBlur stdDeviation="5"/></filter>
  <clipPath id="snail-tailzone"><path d="M-160 -40L-92 -40L-108 2L-160 2Z"/></clipPath>
  <clipPath id="snail-footzone"><path d="M60 -20L160 -20L160 2L60 2Z"/></clipPath>
`;
  const shadow = `
  <g id="snail-shadow">
    <g filter="url(#snail-shadow-blur)" opacity="0.24">
      <ellipse cx="10" cy="1.5" rx="168" ry="9" fill="#4E5638" fill-opacity="0.62"/>
      <ellipse cx="2" cy="0.6" rx="150" ry="4.2" fill="#4E5638"/>
    </g>
  </g>`;
  const P0 = PIVOT.neck;
  const assembled = `
  <g id="snail-head">
    <use href="#snail-stalk-far"/>
    <use href="#snail-head-base"/>
    <use href="#snail-stalk-near"/>
  </g>
  <g id="snail">
    <use href="#snail-head"/>
    <use href="#snail-body"/>
    <use href="#snail-shell"/>
  </g>
  <g id="snail-headup">
    <use href="#snail-head" transform="rotate(-22 ${P0[0]} ${P0[1]})"/>
    <use href="#snail-body"/>
    <use href="#snail-shell"/>
  </g>`;
  return header + stalkSVG(STALK.far) + stalkSVG(STALK.near) + headSVG() + bodySVG() + shell + shadow + assembled + '\n</defs>\n</svg>\n';
}

// ================================================================ PREVIEW SHEET
function preview() {
  const W = 1800, Hh = 1160;
  const N = PIVOT.neck, SN = PIVOT.near, SF = PIVOT.far;
  const label = (x, y, t) => `<text x="${x}" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" fill="#6F5844" opacity="0.85">${t}</text>`;
  const grass = (x, y, w) => `<rect x="${x}" y="${y}" width="${w}" height="44" rx="18" fill="url(#snail-pv-grass)" filter="url(#wc-wash)"/>`;
  const pv = (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="none" stroke="#E0301E" stroke-width="1.6"/><circle cx="${x}" cy="${y}" r="0.9" fill="#E0301E"/>`;
  const snailSwayed = (a) => `<use href="#snail-stalk-far" transform="rotate(${a} ${SF[0]} ${SF[1]})"/><use href="#snail-head-base"/><use href="#snail-stalk-near" transform="rotate(${a} ${SN[0]} ${SN[1]})"/><use href="#snail-body"/><use href="#snail-shell"/>`;
  const headRot = (a) => `<use href="#snail-head" transform="rotate(${a} ${N[0]} ${N[1]})"/><use href="#snail-body"/><use href="#snail-shell"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}">
<defs>
  <linearGradient id="snail-pv-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B9D6E8"/><stop offset="0.5" stop-color="#CFE4EF"/><stop offset="1" stop-color="#EAF3F2"/></linearGradient>
  <linearGradient id="snail-pv-grass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#A9C98B"/><stop offset="1" stop-color="#C5DBA6"/></linearGradient>
  <linearGradient id="snail-pv-bark" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CDB89D"/><stop offset="0.3" stop-color="#B49A7C"/><stop offset="1" stop-color="#7E654E"/></linearGradient>
</defs>
<rect x="-60" y="-60" width="${W + 120}" height="${Hh + 120}" fill="url(#snail-pv-sky)" filter="url(#wc-wash)"/>

<!-- row 1 : ground y = 350 -->
${grass(50, 340, 400)}
<g transform="translate(240 350)"><use href="#snail-shadow"/><use href="#snail"/></g>
${label(50, 408, '(a) snail, scale 1, with snail-shadow')}
${grass(470, 340, 380)}
<g transform="translate(650 350)"><use href="#snail-shadow"/><use href="#snail-headup"/></g>
${label(470, 408, '(d) snail-headup (head -22°)')}
${grass(870, 340, 740)}
<g transform="translate(1050 350)"><use href="#snail-shadow"/>${headRot(-25)}</g>
<g transform="translate(1430 350)"><use href="#snail-shadow"/>${headRot(10)}</g>
${label(870, 408, '(e) head -25° / +10° around the neck pivot, layered below body + shell')}
${grass(1625, 340, 160)}
<g transform="translate(1688 350) scale(0.6)"><use href="#snail-shadow"/><use href="#snail"/></g>
${label(1640, 408, '(h) scale 0.6')}

<!-- row 2 : ground y = 760 -->
${grass(50, 750, 740)}
<g transform="translate(240 760)"><use href="#snail-shadow"/>${snailSwayed(-8)}</g>
<g transform="translate(610 760)"><use href="#snail-shadow"/>${snailSwayed(8)}</g>
${label(50, 818, '(f) eyestalks swayed -8° / +8° around their bases')}
<g transform="translate(1010 655) rotate(-63)">
  <rect x="-185" y="-1" width="380" height="58" rx="26" fill="url(#snail-pv-bark)" filter="url(#wc-paint)"/>
  <use href="#snail-shadow"/><use href="#snail"/>
</g>
${label(1010, 818, '(b) rotated -63° (climbing)')}
<g transform="translate(1470 615) rotate(-90)">
  <rect x="-175" y="-1" width="350" height="76" rx="30" fill="url(#snail-pv-bark)" filter="url(#wc-paint)"/>
  <use href="#snail-shadow"/><use href="#snail"/>
</g>
${label(1340, 818, '(c) rotated -90° on a vertical trunk')}

<!-- row 3 : exploded view, baseline y = 1100 -->
${label(50, 868, '(g) exploded parts, red = pivot:  body · shell · head-base · stalk-far · stalk-near · head · shadow · assembled')}
<g transform="translate(200 1100)"><use href="#snail-body"/>${pv(0, 0)}</g>
<g transform="translate(470 1110)"><use href="#snail-shell"/></g>
<g transform="translate(540 1100)"><use href="#snail-head-base"/>${pv(N[0], N[1])}</g>
<g transform="translate(625 1110)"><use href="#snail-stalk-far"/>${pv(SF[0], SF[1])}</g>
<g transform="translate(665 1110)"><use href="#snail-stalk-near"/>${pv(SN[0], SN[1])}</g>
<g transform="translate(830 1100)"><use href="#snail-head"/>${pv(N[0], N[1])}${pv(SN[0], SN[1])}${pv(SF[0], SF[1])}</g>
<g transform="translate(1180 1100)"><use href="#snail-shadow"/>${pv(0, 0)}</g>
<g transform="translate(1590 1100)"><use href="#snail"/>${pv(0, 0)}${pv(N[0], N[1])}${pv(SN[0], SN[1])}${pv(SF[0], SF[1])}</g>
</svg>
`;
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'snail.svg'), library());
fs.writeFileSync(path.join(OUT, 'snail.preview.svg'), preview());
console.log('wrote', OUT);
