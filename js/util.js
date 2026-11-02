'use strict';
// ============================================================
//  工具函数
// ============================================================
var TAU = Math.PI * 2;

function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function dist2(ax, az, bx, bz) { var dx = ax - bx, dz = az - bz; return dx * dx + dz * dz; }
function angleLerp(a, b, t) {
  var d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

// 可复现的随机数（地图生成用）
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 二维值噪声 + 分形叠加
function makeNoise(rng) {
  var perm = new Uint8Array(512), vals = new Float32Array(256);
  for (var i = 0; i < 256; i++) { perm[i] = i; vals[i] = rng() * 2 - 1; }
  for (i = 255; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (i = 0; i < 256; i++) perm[i + 256] = perm[i];
  function v(x, z) { return vals[perm[(x & 255) + perm[z & 255]]]; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function noise(x, z) {
    var xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
    var a = v(xi, zi), b = v(xi + 1, zi), c = v(xi, zi + 1), d = v(xi + 1, zi + 1);
    var u = smooth(xf), w = smooth(zf);
    return lerp(lerp(a, b, u), lerp(c, d, u), w);
  }
  return {
    noise: noise,
    fbm: function (x, z, oct) {
      var s = 0, amp = 1, f = 1, norm = 0;
      for (var o = 0; o < (oct || 4); o++) { s += noise(x * f, z * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
      return s / norm;
    }
  };
}

// 伤害数字等：K / M / B 缩写
function fmtNum(n) {
  n = Math.round(n);
  if (n < 10000) return String(n);
  if (n < 1e6) return (n / 1e3).toFixed(n < 1e5 ? 1 : 0) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(n < 1e8 ? 1 : 0) + 'M';
  if (n < 1e12) return (n / 1e9).toFixed(1) + 'B';
  return (n / 1e12).toFixed(1) + 'T';
}

function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  var m = Math.floor(s / 60), r = s % 60;
  return m + ':' + (r < 10 ? '0' : '') + r;
}

function pct(v) { return Math.round(v * 100) + '%'; }

// 空间哈希：敌人邻居查询、命中检测
function SpatialHash(cell) {
  this.cell = cell;
  this.map = new Map();
}
SpatialHash.prototype.key = function (cx, cz) { return (cx + 4096) * 8192 + (cz + 4096); };
SpatialHash.prototype.clear = function () { this.map.clear(); };
SpatialHash.prototype.insert = function (obj, x, z) {
  var k = this.key(Math.floor(x / this.cell), Math.floor(z / this.cell));
  var b = this.map.get(k);
  if (!b) { b = []; this.map.set(k, b); }
  b.push(obj);
};
// 对半径 r 内（按格子粗筛）的每个对象调用 fn
SpatialHash.prototype.query = function (x, z, r, fn) {
  var c = this.cell;
  var x0 = Math.floor((x - r) / c), x1 = Math.floor((x + r) / c);
  var z0 = Math.floor((z - r) / c), z1 = Math.floor((z + r) / c);
  for (var cx = x0; cx <= x1; cx++) {
    for (var cz = z0; cz <= z1; cz++) {
      var b = this.map.get(this.key(cx, cz));
      if (!b) continue;
      for (var i = 0; i < b.length; i++) if (fn(b[i]) === false) return;
    }
  }
};
