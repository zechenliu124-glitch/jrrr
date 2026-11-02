'use strict';
// ============================================================
//  像素贴图（程序生成：16×16 小图集 + 几张可平铺的大贴图）
//  天空：渐变穹顶 + 远处几圈低多边形山影 + 扁平的云 + 夜里的月亮和星星
//  贴图大多是偏白的灰度图案，用顶点颜色染色
// ============================================================
var TEX = {
  TILES: ['noise', 'metal', 'cloth', 'wood', 'bark', 'leaf', 'brick', 'rock', 'skin', 'fur', 'gold', 'bone', 'slime', 'plain', 'scale', 'sand'],
  GRID: 16,         // 图集是 16×16 个 16×16 的小格（256×256）
  TILE: 1 / 16,     // 一个小格在 UV 里的大小
  custom: {}        // 其他文件用 TEX.addTile 注册的贴图
};

// 其他文件可以注册自己的 16×16 小贴图（要在 TEX.init 之前，也就是脚本加载时调用）
// fn(x, y, r) 返回 0~255 的灰度，或 [r, g, b]（彩色贴图配白色顶点色时显示原色）；r() 是随机数
TEX.addTile = function (name, fn) {
  if (TEX.TILES.indexOf(name) < 0) {
    if (TEX.TILES.length >= TEX.GRID * TEX.GRID) throw new Error('贴图图集已满：' + name);
    TEX.TILES.push(name);
  }
  TEX.custom[name] = fn;
};

TEX.rng = mulberry32(12345);
TEX.r = function () { return TEX.rng(); };

// 先算好整张 16×16 图案再逐点返回（方便做斑块、条纹这类需要邻居信息的图案）
TEX.addPattern = function (name, make) {
  var buf = null;
  TEX.addTile(name, function (x, y, r) {
    if (x === 0 && y === 0) buf = make(r);
    return buf[y * 16 + x];
  });
};

// 可平铺的 16×16 值噪声（斑块用）
TEX.blobField = function (r, cell) {
  var n = 16 / cell, g = [], out = new Float32Array(256);
  for (var i = 0; i < n * n; i++) g.push(r());
  var at = function (x, y) { return g[((y % n + n) % n) * n + ((x % n + n) % n)]; };
  for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
    var fx = x / cell, fy = y / cell, x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0;
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    out[y * 16 + x] = lerp(lerp(at(x0, y0), at(x0 + 1, y0), tx), lerp(at(x0, y0 + 1), at(x0 + 1, y0 + 1), tx), ty);
  }
  return out;
};

// ---------------- 场景用的小贴图 ----------------
// 树叶：深绿底上一团团亮叶、暗缝和黄绿亮点（彩色，顶点色用白色或淡色调）
TEX.addPattern('env_leaf', function (r) {
  var a = TEX.blobField(r, 4), b = TEX.blobField(r, 2), out = [];
  var cols = [[18, 34, 26], [28, 50, 31], [40, 66, 35], [58, 86, 40], [82, 106, 46], [118, 136, 60]];
  for (var i = 0; i < 256; i++) {
    var v = a[i] * 0.7 + b[i] * 0.45 + (r() - 0.5) * 0.2;
    var k = clamp(Math.floor(v * 5.4 - 1.0), 0, 4);
    if (r() < 0.07) k = 0;                      // 叶间暗缝
    if (k >= 3 && r() < 0.3) k = 5;             // 向光的亮叶尖
    out.push(cols[k]);
  }
  return out;
});
// 灰度版的树叶（配顶点色染成枯黄、灰绿等）
TEX.addPattern('env_leafg', function (r) {
  var a = TEX.blobField(r, 4), b = TEX.blobField(r, 2), out = [], lv = [92, 132, 168, 204, 236, 255];
  for (var i = 0; i < 256; i++) {
    var k = clamp(Math.floor((a[i] * 0.7 + b[i] * 0.45 + (r() - 0.5) * 0.2) * 5.4 - 1.0), 0, 4);
    if (r() < 0.07) k = 0;
    if (k >= 3 && r() < 0.3) k = 5;
    out.push(lv[k]);
  }
  return out;
});
// 树皮：竖向纹理
TEX.addPattern('env_bark', function (r) {
  var out = [], col = [];
  for (var x = 0; x < 16; x++) col.push(r());
  for (var y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
    var v = 190 + col[x] * 40 + r() * 16;
    if ((x + (y >> 3)) % 4 === 0 && r() < 0.85) v -= 62;
    else if ((x + (y >> 3)) % 4 === 1) v -= 18;
    if (r() < 0.04) v = 245;
    out.push(v);
  }
  return out;
});
// 岩石：2×2 的块面 + 裂缝
TEX.addPattern('env_rock', function (r) {
  var out = new Array(256), blocks = [];
  for (var i = 0; i < 64; i++) blocks.push(185 + r() * 55);
  for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) out[y * 16 + x] = blocks[(y >> 1) * 8 + (x >> 1)] + (r() - 0.5) * 14;
  for (var c = 0; c < 3; c++) {
    var cx = Math.floor(r() * 16), cy = Math.floor(r() * 16);
    for (var s = 0; s < 7; s++) {
      out[(cy & 15) * 16 + (cx & 15)] = 128;
      cx += r() < 0.5 ? 1 : 0; cy += r() < 0.7 ? 1 : -1;
      cx &= 15; cy &= 15;
    }
  }
  return out;
});
// 仙人掌：竖棱 + 小刺
TEX.addPattern('env_cactus', function (r) {
  var out = [];
  for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
    var m = x % 4, v = m === 0 ? 168 : m === 2 ? 245 : 210;
    v += (r() - 0.5) * 12;
    if (m === 2 && (y + x) % 5 === 0) v = 255;
    out.push(v);
  }
  return out;
});
// 砂岩：横向分层
TEX.addPattern('env_strata', function (r) {
  var out = [], band = [];
  for (var y = 0; y < 16; y++) band.push(y % 5 === 4 ? 172 : 200 + ((y / 5) | 0) % 2 * 26 + r() * 10);
  for (y = 0; y < 16; y++) for (var x = 0; x < 16; x++) out.push(band[y] + (r() - 0.5) * 16 - (r() < 0.05 ? 40 : 0));
  return out;
});
// 墓碑石：细小斑点的花岗岩
TEX.addPattern('env_grave', function (r) {
  var out = [];
  for (var i = 0; i < 256; i++) {
    var v = 212 + (r() - 0.5) * 26;
    if (r() < 0.07) v = 160;
    if (r() < 0.04) v = 250;
    out.push(v);
  }
  return out;
});
// 苔藓 / 草皮：细碎的草叶
TEX.addPattern('env_moss', function (r) {
  var out = [];
  for (var y = 0; y < 16; y++) for (var x = 0; x < 16; x++) {
    var v = 215 + r() * 30;
    if ((x * 5 + y * 3) % 7 === 0) v -= 45;
    if (r() < 0.06) v = 255;
    out.push(v);
  }
  return out;
});

// ---------------- 生成贴图 ----------------
// 在 16×16 的格子里画图案；v 返回 0~255 的灰度
TEX.drawTile = function (ctx, ox, oy, name) {
  var r = TEX.r, x, y, v;
  var put = function (px, py, val) {
    val = clamp(Math.round(val), 0, 255);
    ctx.fillStyle = 'rgb(' + val + ',' + val + ',' + val + ')';
    ctx.fillRect(ox + px, oy + py, 1, 1);
  };
  var fn = TEX.custom[name];
  if (fn) {
    for (y = 0; y < 16; y++) for (x = 0; x < 16; x++) {
      v = fn(x, y, r);
      if (Array.isArray(v)) {
        ctx.fillStyle = 'rgb(' + clamp(Math.round(v[0]), 0, 255) + ',' + clamp(Math.round(v[1]), 0, 255) + ',' + clamp(Math.round(v[2]), 0, 255) + ')';
        ctx.fillRect(ox + x, oy + y, 1, 1);
      } else put(x, y, v);
    }
    return;
  }
  for (y = 0; y < 16; y++) {
    for (x = 0; x < 16; x++) {
      switch (name) {
        case 'noise': v = 205 + r() * 50; break;
        case 'metal': v = 220 + r() * 18 - (y % 4 === 3 ? 22 : 0) + (y < 2 ? 25 : 0); if ((x === 2 || x === 13) && (y === 2 || y === 13)) v = 150; break;
        case 'cloth': v = ((x >> 1) + (y >> 1)) % 2 ? 228 : 205; v += r() * 18 - 9; break;
        case 'wood': v = x % 5 === 4 ? 150 : 215 + Math.sin(y * 0.9 + x * 3) * 18 + r() * 14; break;
        case 'bark': v = 175 + ((x * 7 + (y >> 2) * 3) % 5) * 14 + r() * 20; if (x % 4 === 0) v -= 40; break;
        case 'leaf': v = 200 + r() * 55; if (r() < 0.22) v = 150 + r() * 30; break;
        case 'brick': {
          var row = y >> 2, off = row % 2 ? 4 : 0;
          v = (y % 4 === 3 || (x + off) % 8 === 7) ? 165 : 215 + r() * 30;
          break;
        }
        case 'rock': v = 195 + r() * 50; if (r() < 0.08) v = 140; break;
        case 'skin': v = 238 + r() * 14; break;
        case 'fur': v = 205 + ((x + y * 2) % 3) * 16 + r() * 18; break;
        case 'gold': v = 215 + r() * 25; if (r() < 0.06) v = 255; if ((x + y) % 7 === 0) v -= 30; break;
        case 'bone': v = 240 + r() * 15; if (r() < 0.05) v = 180; break;
        case 'slime': v = 220 + r() * 20; if ((x - 4) * (x - 4) + (y - 4) * (y - 4) < 4) v = 255; break;
        case 'plain': v = 255; break;
        case 'scale': { var sx = (x + (((y >> 2) % 2) * 2)) % 4; v = sx === 0 || y % 4 === 3 ? 170 : 225 + r() * 20; break; }
        case 'sand': v = 225 + r() * 30; if (r() < 0.05) v = 190; break;
      }
      put(x, y, v);
    }
  }
};

// mip = true：近处保持像素颗粒，远处用多级纹理，避免闪烁（尺寸必须是 2 的幂）
TEX.canvasTex = function (cv, repeat, mip) {
  var t = new THREE.CanvasTexture(cv);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = mip ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter;
  t.generateMipmaps = !!mip;
  if (repeat) { t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.RepeatWrapping; }
  return t;
};

// 逐像素画一张 w×h 的贴图；fn 返回灰度、[r,g,b] 或 [r,g,b,a]
TEX.paint = function (w, h, fn) {
  var cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(w, h), d = img.data;
  for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
    var v = fn(x, y), i = (y * w + x) * 4;
    if (Array.isArray(v)) { d[i] = clamp(Math.round(v[0]), 0, 255); d[i + 1] = clamp(Math.round(v[1]), 0, 255); d[i + 2] = clamp(Math.round(v[2]), 0, 255); d[i + 3] = v.length > 3 ? v[3] : 255; }
    else { v = clamp(Math.round(v), 0, 255); d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
};

// 可平铺的灰度大贴图（旧接口）
TEX.makeRepeat = function (size, fn) { return TEX.canvasTex(TEX.paint(size, size, fn), true); };

TEX.init = function () {
  var cv = document.createElement('canvas');
  cv.width = cv.height = 16 * TEX.GRID;
  var ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cv.width, cv.height);
  TEX.TILES.forEach(function (name, i) { TEX.drawTile(ctx, (i % TEX.GRID) * 16, Math.floor(i / TEX.GRID) * 16, name); });
  TEX.atlas = TEX.canvasTex(cv, false);
  TEX.ground = TEX.canvasTex(TEX.groundCanvas(), true, true);
  TEX.brick = TEX.canvasTex(TEX.brickCanvas(), true, true);
  TEX.planks = TEX.canvasTex(TEX.planksCanvas(), true, true);
  TEX.ivy = TEX.canvasTex(TEX.ivyCanvas(), true, true);
  TEX.tuft = TEX.canvasTex(TEX.tuftCanvas(), false, true);
};

// 地面：一张图的三个通道分别是 草地 / 岩石 / 泥土 三种灰度图案，着色器按顶点权重混合
TEX.groundCanvas = function () {
  var r = mulberry32(777), N = 64, i, x, y;
  var grass = new Float32Array(N * N), rock = new Float32Array(N * N), dirt = new Float32Array(N * N);
  for (i = 0; i < N * N; i++) {
    grass[i] = 222 + r() * 22;
    dirt[i] = 212 + r() * 26;
  }
  // 草叶：短竖线（暗）+ 零星亮点
  for (i = 0; i < 170; i++) {
    x = Math.floor(r() * N); y = Math.floor(r() * N);
    var len = 1 + Math.floor(r() * 3), dv = 18 + r() * 22;
    for (var k = 0; k < len; k++) grass[((y + k) % N) * N + x] -= dv;
  }
  for (i = 0; i < 90; i++) grass[Math.floor(r() * N * N)] = 252;
  // 岩石：不规则的块面（最近点分区，可平铺），块与块之间是暗缝，每块上亮下暗
  var pts = [];
  for (i = 0; i < 18; i++) pts.push([r() * N, r() * N, 186 + r() * 54]);
  for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
    var d1 = 1e9, d2 = 1e9, best = null;
    for (k = 0; k < pts.length; k++) {
      var dx = Math.abs(x + 0.5 - pts[k][0]), dy = Math.abs(y + 0.5 - pts[k][1]);
      dx = Math.min(dx, N - dx); dy = Math.min(dy, N - dy);
      var dd = dx * dx * 1.5 + dy * dy;
      if (dd < d1) { d2 = d1; d1 = dd; best = pts[k]; } else if (dd < d2) d2 = dd;
    }
    var v = best[2] + (r() - 0.5) * 22;
    var gap = Math.sqrt(d2) - Math.sqrt(d1);
    if (gap < 0.8 && r() < 0.8) v = 150 + r() * 16;
    else if (gap < 2) v -= 12;
    // 块面靠上的一侧亮一点
    var up = (y + 0.5 - best[1]); if (Math.abs(up) > N / 2) up -= Math.sign(up) * N;
    v -= up * 1.6;
    if (r() < 0.04) v = 250;
    rock[y * N + x] = v;
  }
  // 泥土：小石子（亮点下面带一个暗点当影子）
  for (i = 0; i < 150; i++) {
    x = Math.floor(r() * N); y = Math.floor(r() * (N - 1));
    dirt[y * N + x] = 252; dirt[(y + 1) * N + x] = 165;
  }
  return TEX.paint(N, N, function (x, y) { var j = y * N + x; return [grass[j], rock[j], dirt[j]]; });
};

// 石砖墙：大块条石，砖缝深色，每块砖上亮下暗
TEX.brickCanvas = function () {
  var r = mulberry32(4242), N = 64, tone = {};
  return TEX.paint(N, N, function (x, y) {
    var row = y >> 3, off = row % 2 ? 8 : 0, col = ((x + off) >> 4) & 3, ly = y & 7, lx = (x + off) & 15;
    var key = row * 8 + col;
    if (tone[key] === undefined) tone[key] = 184 + r() * 56;
    if (ly === 7 || lx === 15) return 100 + r() * 14;
    var v = tone[key] + (r() - 0.5) * 16;
    if (ly === 0) v += 22;
    else if (ly === 6) v -= 26;
    if (lx === 0) v += 10;
    else if (lx === 14) v -= 16;
    if (r() < 0.025) v -= 50;
    return v;
  });
};

// 木板：横向的板子，板缝 + 木纹 + 钉子
TEX.planksCanvas = function () {
  var r = mulberry32(99), tone = [];
  for (var i = 0; i < 8; i++) tone.push(196 + r() * 40);
  return TEX.paint(32, 32, function (x, y) {
    var b = y >> 3, ly = y & 7;
    if (ly === 7) return 110;
    var v = tone[b] + Math.sin(x * 0.45 + b * 2.1 + ly * 0.8) * 10 + (r() - 0.5) * 12;
    if (ly === 0) v += 14;
    if ((x === 2 || x === 29) && ly === 3) v = 120;
    return v;
  });
};

// 常春藤：透明底上垂下来的藤蔓和叶子（彩色带透明度），下端参差不齐
TEX.ivyCanvas = function () {
  var r = mulberry32(31337), W = 32, H = 64, px = new Array(W * H);
  var leafCols = [[22, 40, 24], [32, 56, 30], [44, 72, 34], [60, 90, 40], [84, 112, 50]];
  for (var i = 0; i < W * H; i++) px[i] = null;
  var leaf = function (x, y, c) {
    x = ((x % W) + W) % W;
    if (y < 0 || y >= H) return;
    px[y * W + x] = c;
  };
  // 一片叶子：中间亮、边上暗的小菱形
  var blob = function (x, y) {
    var c = 1 + Math.floor(r() * 3);
    leaf(x, y, leafCols[c + 1]); leaf(x - 1, y, leafCols[c]); leaf(x + 1, y, leafCols[c]);
    leaf(x, y - 1, leafCols[c]); leaf(x, y + 1, leafCols[c - 1]);
    if (r() < 0.5) { leaf(x - 1, y + 1, leafCols[0]); leaf(x + 1, y + 1, leafCols[c - 1]); }
  };
  for (var v = 0; v < 9; v++) {
    var x = Math.floor(v * W / 9 + r() * 3), len = Math.floor(H * (0.4 + r() * 0.6));
    for (var y = 0; y < len; y++) {
      if (r() < 0.3) x += r() < 0.5 ? -1 : 1;
      leaf(x, y, [30, 40, 22]);
      // 越往下叶子越稀，下端参差不齐
      var dens = 0.5 - y / len * 0.3;
      if (r() < dens) blob(x + (r() < 0.5 ? -1 : 1) * Math.floor(1 + r() * 2), y);
    }
  }
  // 顶上一条更密的叶带
  for (i = 0; i < 40; i++) blob(Math.floor(r() * W), Math.floor(r() * 7));
  return TEX.paint(W, H, function (x, y) { var c = px[y * W + x]; return c ? [c[0], c[1], c[2], 255] : [30, 50, 28, 0]; });
};

// 草丛：透明底上几根粗草叶，根部暗、叶尖亮（灰度，用顶点色染色）
TEX.tuftCanvas = function () {
  var r = mulberry32(2024), N = 32, px = new Array(N * N);
  for (var i = 0; i < N * N; i++) px[i] = -1;
  for (var b = 0; b < 11; b++) {
    var x = 3 + r() * 26, h = 10 + Math.floor(r() * 20), lean = (r() - 0.5) * 0.7, w = r() < 0.5 ? 2 : 1;
    for (var k = 0; k < h; k++) {
      var y = N - 1 - k, xx = Math.round(x + lean * k);
      var v = 125 + (k / h) * 130;
      for (var j = 0; j < (k > h - 3 ? 1 : w); j++) if (xx + j >= 0 && xx + j < N) px[y * N + xx + j] = v;
    }
  }
  return TEX.paint(N, N, function (x, y) { var v = px[y * N + x]; return v < 0 ? [90, 110, 60, 0] : [v, v, v, 255]; });
};

// 以前的 PS1 顶点抖动已经去掉（Megabonk 的模型不抖），保留接口
TEX.ps1 = function (mat) { return mat; };
TEX.setSnap = function () {};

// 根据颜色猜一种贴图（零件也可以直接指定）
TEX.guess = function (hex) {
  var c = new THREE.Color(hex), hsl = {};
  c.getHSL(hsl);
  var h = hsl.h * 360, s = hsl.s, l = hsl.l;
  if (l < 0.12 || l > 0.92) return 'plain';
  if (s < 0.14) return l > 0.5 ? 'metal' : 'rock';
  if (h > 40 && h < 62 && s > 0.6 && l > 0.45) return 'gold';
  if (h >= 15 && h <= 45 && l < 0.45) return 'wood';
  if (h >= 12 && h <= 40 && l >= 0.55 && s < 0.75) return 'skin';
  if (h > 70 && h < 170 && s > 0.25) return 'leaf';
  if (h >= 40 && h <= 60 && l > 0.75) return 'bone';
  return 'cloth';
};

TEX.tileUV = function (name) {
  var i = TEX.TILES.indexOf(name);
  if (i < 0) i = 0;
  var G = TEX.GRID;
  return { u: (i % G) / G, v: 1 - (Math.floor(i / G) + 1) / G };
};

// ============================================================
//  天空与远景
//  穹顶跟着镜头走；山影、云、月亮也只跟着镜头水平移动，永远在最远处
//  绘制顺序：穹顶 → 星星 → 月亮/太阳 → 云 → 山影 → 地形和其他物体
// ============================================================
TEX.SKY_R = 380;

TEX.makeSky = function (scene) {
  var g = new THREE.SphereGeometry(TEX.SKY_R, 32, 24);
  g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 3), 3));
  TEX.sky = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  TEX.sky.renderOrder = -10;
  TEX.sky.frustumCulled = false;
  scene.add(TEX.sky);
  TEX.far = new THREE.Group();
  scene.add(TEX.far);
  // 远景共用的材质：顶点色带透明度，但仍在不透明队列里按 renderOrder 先画
  TEX.farMat = new THREE.MeshBasicMaterial({
    vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.SrcAlphaFactor, blendDst: THREE.OneMinusSrcAlphaFactor
  });
  TEX.hillMat = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, side: THREE.DoubleSide });
  TEX.starMat = new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, vertexColors: true, fog: false, depthWrite: false });
  TEX.cloudSpin = 0;
};

// 按关卡配色重建天空（tint/amt：最终虫潮时整体染红）
TEX.applySky = function (pal, tint, amt) {
  var tc = tint != null ? new THREE.Color(tint) : null;
  var col = function (hex) { var c = new THREE.Color(hex); if (tc) c.lerp(tc, amt); return c; };
  var top = col(pal.skyTop), mid = col(pal.skyMid != null ? pal.skyMid : pal.sky), hor = col(pal.sky), fog = col(pal.fog);
  // 穹顶渐变：地平线以下是雾色，往上 地平线色 → 中间亮带 → 顶部
  var g = TEX.sky.geometry, p = g.attributes.position, c = g.attributes.color, tmp = new THREE.Color();
  for (var i = 0; i < p.count; i++) {
    var e = Math.asin(clamp(p.getY(i) / TEX.SKY_R, -1, 1));
    if (e < 0) tmp.copy(hor).lerp(fog, clamp(-e / 0.08, 0, 1));
    else if (e < 0.26) tmp.copy(hor).lerp(mid, e / 0.26);
    else tmp.copy(mid).lerp(top, clamp((e - 0.26) / 0.6, 0, 1));
    c.setXYZ(i, tmp.r, tmp.g, tmp.b);
  }
  c.needsUpdate = true;
  TEX.skyCols = { top: top, mid: mid, hor: hor, fog: fog };
  // 远景每关重建（固定种子：染红时形状不变）
  while (TEX.far.children.length) {
    var o = TEX.far.children.pop();
    o.geometry.dispose();
  }
  var seed = pal.skySeed || 1;
  if (pal.stars) TEX.addFar(TEX.buildStars(pal, col, mulberry32(seed + 3)), -9.6, true);
  if (pal.moon) TEX.addFar(TEX.buildMoon(pal.moon, col), -9.5);
  if (pal.clouds) TEX.addFar(TEX.buildClouds(pal, col, mulberry32(seed + 1)), -9);
  if (pal.hills) TEX.addFar(TEX.buildHills(pal, col, mulberry32(seed + 2)), -8, false, TEX.hillMat);
};

TEX.addFar = function (geo, order, points, mat) {
  var m = points ? new THREE.Points(geo, TEX.starMat) : new THREE.Mesh(geo, mat || TEX.farMat);
  m.renderOrder = order;
  m.frustumCulled = false;
  TEX.far.add(m);
  return m;
};

// 远山：一圈圈低多边形山脊，远的颜色接近天色、近的接近雾色；每个面按假光照明暗不同
// pal.hills: [{ r: 半径, h: [最低, 最高], color, style: 'mesa' 平顶断崖 | 'dune' 圆缓沙丘 | 'peak' 尖峰 }]（从远到近）
TEX.buildHills = function (pal, col, rng) {
  var pos = [], cols = [];
  var fog = col(pal.fog), light = new THREE.Vector3(-0.5, 0.55, -0.65).normalize();
  var a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  var tmp = new THREE.Color(), base = new THREE.Color();
  var tri = function (p0, p1, p2, color, baseCol) {
    e1.subVectors(p1, p0); e2.subVectors(p2, p0); n.crossVectors(e1, e2).normalize();
    if (n.x * p0.x + n.z * p0.z > 0) n.negate();          // 法线朝向圆心（镜头）
    var k = 0.9 + 0.18 * Math.max(0, n.dot(light));
    [p0, p1, p2].forEach(function (q) {
      pos.push(q.x, q.y, q.z);
      // 越往山脚越接近雾色
      tmp.copy(color).multiplyScalar(k).lerp(baseCol, clamp((10 - q.y) / 45, 0, 1));
      cols.push(tmp.r, tmp.g, tmp.b);
    });
  };
  pal.hills.forEach(function (ring, ri) {
    var N = ring.style === 'peak' ? 72 : 48, R = ring.r, h0 = ring.h[0], h1 = ring.h[1];
    var color = col(ring.color);
    base.copy(color).lerp(fog, ring.fade != null ? ring.fade : 0.6);
    var ph = [rng() * TAU, rng() * TAU, rng() * TAU, rng() * TAU], hs = [], rs = [];
    for (var i = 0; i < N; i++) {
      var t = i / N * TAU;
      var s = 0.5 + 0.28 * Math.sin(t * 2 + ph[0]) + 0.18 * Math.sin(t * 5 + ph[1]) + 0.1 * Math.sin(t * 11 + ph[2]) + (rng() - 0.5) * 0.12;
      if (ring.style === 'mesa') {
        // 台地：高度分成几级，台面平、台壁陡
        s = Math.round(clamp(s, 0, 1) * 3) / 3 + (rng() - 0.5) * 0.05;
      } else if (ring.style === 'peak') {
        s = Math.pow(clamp(s, 0, 1), 1.3) + (rng() < 0.1 ? 0.1 + rng() * 0.16 : 0);
      } else if (ring.style === 'dune') {
        s = 0.5 + 0.35 * Math.sin(t * 3 + ph[0]) * Math.sin(t * 7 + ph[3]) + 0.15 * Math.sin(t * 2 + ph[1]);
      }
      hs.push(h0 + (h1 - h0) * clamp(s, 0, 1.3));
      rs.push(R + (rng() - 0.5) * R * 0.05);
    }
    // 山脚往里收、中点再随机收一点，山坡就有朝向不同的斜面
    var by = -60, dIn = R * 0.12, b0 = new THREE.Vector3(), b1 = new THREE.Vector3();
    for (i = 0; i < N; i++) {
      var j = (i + 1) % N, t0 = i / N * TAU, t1 = (i + 1) / N * TAU, tm = (t0 + t1) / 2, rm = R - dIn * (0.4 + rng() * 0.8);
      a.set(Math.cos(t0) * rs[i], hs[i], Math.sin(t0) * rs[i]);
      b.set(Math.cos(t1) * rs[j], hs[j], Math.sin(t1) * rs[j]);
      b0.set(Math.cos(t0) * (R - dIn), by, Math.sin(t0) * (R - dIn));
      b1.set(Math.cos(t1) * (R - dIn), by, Math.sin(t1) * (R - dIn));
      cc.set(Math.cos(tm) * rm, (Math.min(hs[i], hs[j]) * 0.45 + by * 0.55), Math.sin(tm) * rm);
      tri(a, b0, cc, color, base);
      tri(a, cc, b, color, base);
      tri(b, cc, b1, color, base);
    }
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
};

// 云：扁平的低多边形云团（平底），中间较实、边缘透明，颜色接近天色
TEX.buildClouds = function (pal, col, rng) {
  var pos = [], cols = [], cl = col(pal.clouds), alpha = pal.cloudAlpha != null ? pal.cloudAlpha : 0.5;
  var count = pal.cloudCount != null ? pal.cloudCount : 8;
  for (var k = 0; k < count; k++) {
    var az = rng() * TAU, D = 250 + rng() * 80, el = 0.12 + rng() * 0.38;
    var cx = Math.cos(az) * D, cz = Math.sin(az) * D, cy = 20 + Math.tan(el) * D;
    var tx = -Math.sin(az), tz = Math.cos(az);                 // 沿圆周方向
    var lumps = 2 + Math.floor(rng() * 4), w = 26 + rng() * 40;
    for (var l = 0; l < lumps; l++) {
      var off = (l / Math.max(1, lumps - 1) - 0.5) * w, rx = 12 + rng() * 14, ry = rx * (0.35 + rng() * 0.25);
      var ox = cx + tx * off, oz = cz + tz * off, oy = cy + rng() * 4;
      var seg = 9, ring = [];
      for (var s = 0; s < seg; s++) {
        var t = s / seg * TAU, rr = 0.8 + rng() * 0.35;
        var u = Math.cos(t) * rx * rr, v = Math.max(-ry * 0.3, Math.sin(t) * ry * rr);   // 底部压平
        ring.push([ox + tx * u, oy + v, oz + tz * u]);
      }
      for (s = 0; s < seg; s++) {
        var p0 = ring[s], p1 = ring[(s + 1) % seg];
        pos.push(ox, oy, oz, p0[0], p0[1], p0[2], p1[0], p1[1], p1[2]);
        cols.push(cl.r, cl.g, cl.b, alpha, cl.r, cl.g, cl.b, alpha * 0.15, cl.r, cl.g, cl.b, alpha * 0.15);
      }
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  return g;
};

// 月亮（或沙漠里刺眼的太阳）：圆盘 + 柔和的光晕
TEX.buildMoon = function (m, col) {
  var pos = [], cols = [], D = 330;
  var dir = new THREE.Vector3(Math.cos(m.az) * Math.cos(m.el), Math.sin(m.el), Math.sin(m.az) * Math.cos(m.el));
  var c0 = dir.clone().multiplyScalar(D);
  var right = new THREE.Vector3(0, 1, 0).cross(dir).normalize(), up = dir.clone().cross(right).normalize();
  var disc = function (r, center, cIn, aIn, cOut, aOut, seg) {
    for (var s = 0; s < seg; s++) {
      var t0 = s / seg * TAU, t1 = (s + 1) / seg * TAU;
      pos.push(center.x, center.y, center.z);
      [t0, t1].forEach(function (t) {
        pos.push(center.x + (right.x * Math.cos(t) + up.x * Math.sin(t)) * r, center.y + (right.y * Math.cos(t) + up.y * Math.sin(t)) * r, center.z + (right.z * Math.cos(t) + up.z * Math.sin(t)) * r);
      });
      cols.push(cIn.r, cIn.g, cIn.b, aIn, cOut.r, cOut.g, cOut.b, aOut, cOut.r, cOut.g, cOut.b, aOut);
    }
  };
  var halo = col(m.halo), body = col(m.color);
  disc(m.r * 3.2, c0, halo, 0.32, halo, 0, 18);
  disc(m.r * 1.5, c0, halo, 0.3, halo, 0, 14);
  disc(m.r, c0, body, 1, body, 1, 12);
  if (m.spots) {
    var spot = col(m.spots);
    [[0.3, 0.25, 0.28], [-0.35, -0.1, 0.22], [0.1, -0.45, 0.16]].forEach(function (s) {
      var cs = c0.clone().addScaledVector(right, s[0] * m.r).addScaledVector(up, s[1] * m.r).addScaledVector(dir, -0.5);
      disc(s[2] * m.r, cs, spot, 1, spot, 1, 7);
    });
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 4));
  return g;
};

// 星星：上半球随机撒点，越靠近地平线越暗
TEX.buildStars = function (pal, col, rng) {
  var pos = [], cols = [], c = col(pal.stars.color), n = pal.stars.count;
  for (var i = 0; i < n; i++) {
    var az = rng() * TAU, el = Math.asin(0.08 + rng() * 0.92), D = 340;
    pos.push(Math.cos(az) * Math.cos(el) * D, Math.sin(el) * D, Math.sin(az) * Math.cos(el) * D);
    var k = (0.35 + rng() * 0.65) * clamp((el - 0.05) * 3, 0, 1);
    cols.push(c.r * k, c.g * k, c.b * k);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return g;
};

TEX.updateSky = function (cam, dt) {
  TEX.sky.position.copy(cam.position);
  TEX.far.position.set(cam.position.x, 0, cam.position.z);
  // 只有云慢慢飘
  TEX.cloudSpin += dt * 0.004;
  for (var i = 0; i < TEX.far.children.length; i++) {
    var o = TEX.far.children[i];
    if (o.renderOrder === -9) o.rotation.y = TEX.cloudSpin;
  }
};
