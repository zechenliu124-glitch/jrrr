'use strict';
// ============================================================
//  地图内容（第二批）：
//  - 地形地标：每关两处适合滑铲 / 坐骑的地形（林间长坡、林间深谷、大沙丘、沙坡跳台、陷落墓坑、坟丘长坡），
//    长坡背后有跳台把人弹上坡顶；地标范围里不长树、不放建筑和互动物体
//  - 秘密地点：每关三处（隐秘高台、裂墙密室、火盆宝库、藏宝图），找到之前小地图上看不到；
//    找到时公告「发现秘密地点」+ 地点的名字，小地图上标一颗星
//  - 随机事件：每关 3~4 次，按关卡进度错开（流星雨、金袋哥布林、旅行商人、奇怪的宝箱、血月），
//    Boss 战和午夜钟声时不会出现；开始时公告（和 FEEL 同一个 Kit.announce）+ 小地图标记，30~60 秒
//  只用包装函数接入（W.generate / terrainH / freeSpot / buildRuins、Interact.populate、FX.boom、
//  Director.update、Pickups.xp、Game.summonBoss），不改它们的源码
// ============================================================

// ============================================================
//  地形地标
// ============================================================
// 每关两处（大小单位：米）：
// slope 长坡：坡顶高 H，主坡长 L（越往下越陡、再变缓），顶上平台 T，背坡 Lb，中间宽 2Wc，两边缓坡 Ws，坡底一个跳包 kick
// pipe 林间深谷（U 形）：长 L，宽 Wd，深 D，两边沿各有一道土坎 lip；dunes 大沙丘：半径 R，波长 lam，高 A；bowl 陷落墓坑：半径 R，深 D
Content.FEAT_PLAN = {
  1: [{ type: 'slope', name: '林间长坡', H: 16, L: 62, T: 6, Lb: 22, Wc: 6, Ws: 16, kick: 1.8 }, { type: 'pipe', name: '林间深谷', L: 62, Wd: 20, D: 5.5, lip: 1.3 }],
  2: [{ type: 'dunes', name: '大沙丘', R: 36, A: 5.5, lam: 22 }, { type: 'slope', name: '沙坡跳台', H: 17, L: 66, T: 6, Lb: 22, Wc: 7, Ws: 16, kick: 2.0 }],
  3: [{ type: 'bowl', name: '陷落墓坑', R: 15, D: 6, lip: 1.2 }, { type: 'slope', name: '坟丘长坡', H: 15, L: 58, T: 6, Lb: 20, Wc: 6, Ws: 15, kick: 1.6 }]
};
// 第一次走进地标时的提示（显示成「地标名：这句话」，一行）
Content.FEAT_HINT = {
  slope: '滑铲冲下去越滑越快',
  pipe: '两边来回滑铲会加速',
  dunes: '顺坡滑下，冲上沙脊起飞',
  bowl: '沿着坑壁滑一圈'
};
Content.feats = null;
// 每种地形的高度增量（局部坐标 u 沿主方向，v 横向）
Content.featH = {
  slope: function (f, x, z) {
    var dx = x - f.cx, dz = z - f.cz, u = dx * f.ca + dz * f.sa, v = -dx * f.sa + dz * f.ca;
    var av = Math.abs(v), cross = av < f.Wc ? 1 : 1 - Content.ss(f.Wc, f.Wc + f.Ws, av);
    if (cross <= 0) return 0;
    var h;
    if (u < -f.T) h = f.H * Content.ss(-f.T - f.Lb, -f.T, u);
    else if (u < 0) h = f.H;
    else h = f.H * (1 - Content.ramp(u / f.L, 0.2));
    var kd = (u - (f.L - 5)) / 3.6;
    if (kd > -3 && kd < 3) h += f.kick * Math.exp(-kd * kd);
    return h * cross;
  },
  pipe: function (f, x, z) {
    var dx = x - f.cx, dz = z - f.cz, u = dx * f.ca + dz * f.sa, v = -dx * f.sa + dz * f.ca;
    var hw = f.Wd / 2, av = Math.abs(v), along = 1 - Content.ss(f.L / 2 - 10, f.L / 2, Math.abs(u));
    if (along <= 0) return 0;
    var t = av / hw, h = t < 1 ? -f.D * (1 - t * t) : 0, bd = (av - hw) / 2.2;
    if (bd > -3 && bd < 3) h += f.lip * Math.exp(-bd * bd);
    return h * along;
  },
  dunes: function (f, x, z) {
    var dx = x - f.cx, dz = z - f.cz, d = Math.sqrt(dx * dx + dz * dz), env = 1 - Content.ss(f.R - 16, f.R, d);
    if (env <= 0) return 0;
    var u = dx * f.ca + dz * f.sa, v = -dx * f.sa + dz * f.ca, ph = u / f.lam + 100.5, fr = ph - Math.floor(ph);
    var prof = fr < 0.72 ? Content.ss(0, 0.72, fr) : 1 - Content.ss(0.72, 1, fr);
    return prof * f.A * (0.8 + 0.2 * Math.sin(v * 0.07 + f.seed)) * env;
  },
  bowl: function (f, x, z) {
    var dx = x - f.cx, dz = z - f.cz, r = Math.sqrt(dx * dx + dz * dz);
    var h = r < f.R ? -f.D * (1 - Content.ss(f.R * 0.3, f.R, r)) : 0, bd = (r - f.R) / 2.2;
    if (bd > -3 && bd < 3) h += f.lip * Math.exp(-bd * bd);
    return h;
  },
  // 秘密地点占的地方：地形不变，只是不让树、建筑和互动物体放进来
  reserve: function () { return 0; }
};
// 0~1 的下坡进度：坡度先在前 a 段慢慢变陡，中间一大段一样陡，最后 a 段变缓（积分后归一化）
Content.ramp = function (t, a) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  var s = t < a ? t * t / (2 * a) : t > 1 - a ? (1 - a) - (1 - t) * (1 - t) / (2 * a) : a / 2 + (t - a);
  return s / (1 - a);
};
// 局部 (u, v) → 世界坐标
Content.featPt = function (f, u, v) { return { x: f.cx + u * f.ca - v * f.sa, z: f.cz + u * f.sa + v * f.ca }; };
Content.makeFeat = function (spec, cx, cz, ang) {
  var f = {}, k;
  for (k in spec) f[k] = spec[k];
  f.cx = cx; f.cz = cz; f.ang = ang; f.ca = Math.cos(ang); f.sa = Math.sin(ang); f.seed = (cx * 0.37 + cz * 0.11) % 10;
  f.fn = Content.featH[f.type];
  if (f.type === 'slope') { f.u0 = -(f.T + f.Lb) - 10; f.u1 = f.L + 8; f.v0 = f.Wc + f.Ws; }
  else if (f.type === 'pipe') { f.u0 = -f.L / 2; f.u1 = f.L / 2; f.v0 = f.Wd / 2 + 6; }
  else { f.circle = true; f.rad = f.type === 'dunes' ? f.R : f.type === 'bowl' ? f.R + 6 : f.R; f.u0 = -f.rad; f.u1 = f.rad; f.v0 = f.rad; }
  var x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9, cs = [[f.u0, -f.v0], [f.u0, f.v0], [f.u1, -f.v0], [f.u1, f.v0]];
  if (f.circle) { f.x0 = cx - f.rad; f.x1 = cx + f.rad; f.z0 = cz - f.rad; f.z1 = cz + f.rad; return f; }
  for (k = 0; k < 4; k++) {
    var p = Content.featPt(f, cs[k][0], cs[k][1]);
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  f.x0 = x0; f.x1 = x1; f.z0 = z0; f.z1 = z1;
  return f;
};
// 地图边缘以内、离出生点够远、互不重叠
Content.featOk = function (f, list) {
  var lim = W.S - 24;
  if (f.x0 < -lim || f.x1 > lim || f.z0 < -lim || f.z1 > lim) return false;
  if (f.circle) { if (Math.sqrt(f.cx * f.cx + f.cz * f.cz) - f.rad < 30) return false; }
  else { var nx = clamp(0, f.x0, f.x1), nz = clamp(0, f.z0, f.z1); if (nx * nx + nz * nz < 34 * 34) return false; }
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (f.x0 < o.x1 + 8 && f.x1 > o.x0 - 8 && f.z0 < o.z1 + 8 && f.z1 > o.z0 - 8) return false;
  }
  return true;
};
// 长坡顺着原来的地势往下（试 8 个朝向，挑原地形落差最大的），滑下去更快
Content.planFeats = function (seed, stage) {
  var rng = mulberry32(((seed | 0) ^ 0x2c1b3c6d) >>> 0), out = [], plan = Content.FEAT_PLAN[stage] || [], base = W.terrainBase;
  for (var i = 0; i < plan.length; i++) {
    // 长坡：多看几个能放下的位置（每个位置 8 个朝向），挑原地形顺着坡往下落得最多的
    var slope = plan[i].type === 'slope', pick = null, pickDrop = -1e9, found = 0;
    for (var t = 0; t < 80 && found < (slope ? 6 : 1); t++) {
      var a = rng() * TAU, d = 46 + rng() * 54, cx = Math.cos(a) * d, cz = Math.sin(a) * d, a0 = rng() * TAU, best = null, bestDrop = -1e9;
      for (var k = 0; k < (slope ? 8 : 1); k++) {
        var f = Content.makeFeat(plan[i], cx, cz, a0 + k * TAU / 8);
        if (!Content.featOk(f, out)) continue;
        var drop = 0;
        if (slope) { var p0 = Content.featPt(f, 0, 0), p1 = Content.featPt(f, f.L, 0); drop = base(p0.x, p0.z) - base(p1.x, p1.z); }
        if (drop > bestDrop) { bestDrop = drop; best = f; }
      }
      if (best) { found++; if (bestDrop > pickDrop) { pickDrop = bestDrop; pick = best; } }
    }
    if (pick) {
      // 原地形顺着坡反而往上走时把坡加高，保证坡顶到坡底至少落差 H + 2 米（滑下去够快）
      if (slope && pickDrop < 2) pick.H += Math.min(10, 2 - pickDrop);
      out.push(pick);
    }
  }
  return out;
};
// (x, z) 半径 r 以内有没有地标或秘密地点
Content.inFeat = function (x, z, r) {
  return Content.inList(Content.feats, x, z, r) || Content.inList(Content.reserves, x, z, r);
};
Content.inList = function (F, x, z, r) {
  if (!F) return false;
  for (var i = 0; i < F.length; i++) {
    var f = F[i];
    if (x < f.x0 - r || x > f.x1 + r || z < f.z0 - r || z > f.z1 + r) continue;
    if (f.circle) { if (dist2(x, z, f.cx, f.cz) < (f.rad + r) * (f.rad + r)) return f; continue; }
    var dx = x - f.cx, dz = z - f.cz, u = dx * f.ca + dz * f.sa, v = -dx * f.sa + dz * f.ca;
    if (u > f.u0 - r && u < f.u1 + r && Math.abs(v) < f.v0 + r) return f;
  }
  return false;
};

// ============================================================
//  秘密地点
// ============================================================
Content.SECRET_PLAN = { 1: ['plateau', 'crack', 'treasure'], 2: ['plateau', 'vault', 'treasure'], 3: ['vault', 'crack', 'plateau'] };
Content.SECRET_NAME = {
  plateau: ['林中高台', '风蚀石台', '钟楼残顶'],
  crack: ['裂墙密室', '裂墙密室', '封死的墓室'],
  vault: ['火盆宝库', '火盆宝库', '烛台墓库'],
  treasure: ['埋着的宝藏', '沙下的宝藏', '埋着的宝藏']
};
Content.sites = [];
Content.secretsFound = 0;
// 找一块平地：离出生点 r0~r1 米，半径 rad 内没有建筑 / 地标 / 别的秘密，高低差不超过 flat
Content.findSite = function (rng, r0, r1, rad, flat) {
  var best = null;
  for (var t = 0; t < 140; t++) {
    var a = rng() * TAU, d = r0 + rng() * (r1 - r0), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.abs(x) > W.S - 30 || Math.abs(z) > W.S - 30) continue;
    if (!W.freeSpot(x, z, rad)) continue;
    var lo = 1e9, hi = -1e9;
    for (var k = 0; k < 9; k++) {
      var aa = k / 8 * TAU, rr = k ? rad : 0, h = W.terrainH(x + Math.cos(aa) * rr, z + Math.sin(aa) * rr);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    var s = { x: x, z: z, g: hi, lo: lo, var: hi - lo };
    if (s.var <= flat) return s;
    if (!best || s.var < best.var) best = s;
  }
  return best;
};
Content.reserves = [];
Content.reserve = function (x, z, r) {
  var f = Content.makeFeat({ type: 'reserve' }, x, z, 0);
  f.circle = true; f.rad = r; f.x0 = x - r; f.x1 = x + r; f.z0 = z - r; f.z1 = z + r;
  Content.reserves.push(f);
};
// 小石室：三面墙 + 屋顶，dir（0~3）这一面留门洞，用一块单独的“正面”挡住（裂墙 / 封印石门）
Content.buildChamber = function (s, pal, dir) {
  var g = s.g, H = 3.6, hw = 2.0, ow = 2.8;
  var rot = function (lx, lz) { return dir === 0 ? [lx, lz] : dir === 1 ? [lz, -lx] : dir === 2 ? [-lx, -lz] : [-lz, lx]; };
  var box = function (lx0, lx1, lz0, lz1) {
    var a = rot(lx0, lz0), b = rot(lx1, lz1);
    return [s.x + Math.min(a[0], b[0]), s.x + Math.max(a[0], b[0]), s.z + Math.min(a[1], b[1]), s.z + Math.max(a[1], b[1])];
  };
  [[-ow, ow, hw, ow], [-ow, -hw, -hw, hw], [hw, ow, -hw, hw]].forEach(function (w) {
    var b = box(w[0], w[1], w[2], w[3]);
    W.addBox(b[0], b[1], b[2], b[3], g + H, pal.stone2, { trim: pal.stoneTrim });
  });
  W.addBox(s.x - ow - 0.25, s.x + ow + 0.25, s.z - ow - 0.25, s.z + ow + 0.25, g + H + 0.7, pal.stone, { floating: true, trim: pal.stoneTrim });
  var fb = box(-hw, hw, -ow, -hw);
  var front = { kind: 'box', x0: fb[0], x1: fb[1], z0: fb[2], z1: fb[3], top: g + H, bottom: s.lo - 1, floating: false };
  W.boxes.push(front);
  W.addCollider(front, front.x0, front.x1, front.z0, front.z1);
  var fc = rot(0, -(hw + ow) / 2), n = rot(0, -1);
  s.front = front; s.fx = s.x + fc[0]; s.fz = s.z + fc[1]; s.nx = n[0]; s.nz = n[1];
  s.rotY = Math.atan2(n[0], n[1]);
};
// 隐秘高台：9 米高的石台，没有坡道；旁边四块浮空的垫脚石一块比一块高（跳上去）
Content.buildPlateau = function (s, pal, rng) {
  var g = s.g, hs = 4.5;
  s.top = g + 9.0; s.hs = hs; s.a0 = rng() * TAU;
  W.addBox(s.x - hs, s.x + hs, s.z - hs, s.z + hs, s.top, pal.stone, { cap: pal.grass2 });
  var t0 = W.terrainH(s.x + Math.cos(s.a0) * 7.4, s.z + Math.sin(s.a0) * 7.4) + 1.8, last = s.top - 1.6;
  var n = clamp(Math.ceil((last - t0) / 1.85) + 1, 3, 6);
  for (var i = 0; i < n; i++) {
    var a = s.a0 + i * 0.6, sx = s.x + Math.cos(a) * 7.4, sz = s.z + Math.sin(a) * 7.4;
    W.addBox(sx - 1.3, sx + 1.3, sz - 1.3, sz + 1.3, lerp(t0, last, i / (n - 1)), pal.stone2, { floating: true, trim: pal.grass, cap: pal.grass2 });
  }
};
// 生成地图时（塔楼和断墙之后、树木之前）选好秘密地点并建好石台 / 石室
Content.buildSecrets = function (pal) {
  var stage = typeof Game !== 'undefined' ? Game.stage : 1, plan = Content.SECRET_PLAN[stage] || [], rng = W.rng;
  Content.sites = [];
  for (var i = 0; i < plan.length; i++) {
    var type = plan[i], s = null;
    if (type === 'plateau') s = Content.findSite(rng, 55, 105, 11, 0.6);
    else if (type === 'treasure') s = Content.findSite(rng, 55, 110, 3, 1.0);
    else s = Content.findSite(rng, 50, 105, type === 'vault' ? 12 : 6, 0.8);
    if (!s) continue;
    s.type = type; s.name = Content.SECRET_NAME[type][stage - 1] || Content.SECRET_NAME[type][0]; s.found = false; s.id = type + stage;
    if (type === 'plateau') { Content.buildPlateau(s, pal, rng); Content.reserve(s.x, s.z, 11); }
    else if (type === 'crack' || type === 'vault') { Content.buildChamber(s, pal, Math.floor(rng() * 4)); Content.reserve(s.x, s.z, type === 'vault' ? 12 : 7); }
    else Content.reserve(s.x, s.z, 3.5);
    Content.sites.push(s);
  }
};

// ---------------- 秘密地点的模型（低多边形 + 像素贴图，和 interact_more.js 同一套零件写法） ----------------
Content.geo = function (key, fn) { return MX.geo('ct_' + key, fn); };
Content.chestParts = function () {
  var T = MX.tiles(), body = 0x5a2a8a, trim = 0xffd84a;
  return [
    mxB(1.5, 0.72, 1.0, 0, 0.36, 0, body, T.plank),
    mxC(0.5, 0.5, 1.5, 10, 0, 0.72, 0, body, 'wood', [0, 0, Math.PI / 2]),
    mxB(1.54, 0.07, 1.04, 0, 0.73, 0, 0x2a1440, 'wood'),
    mxB(0.12, 0.76, 1.06, 0.5, 0.37, 0, trim, 'gold'), mxB(0.12, 0.76, 1.06, -0.5, 0.37, 0, trim, 'gold'),
    mxC(0.52, 0.52, 0.12, 10, 0.5, 0.72, 0, trim, 'gold', [0, 0, Math.PI / 2]), mxC(0.52, 0.52, 0.12, 10, -0.5, 0.72, 0, trim, 'gold', [0, 0, Math.PI / 2]),
    mxB(0.26, 0.3, 0.07, 0, 0.7, 0.525, trim, 'gold')
  ];
};
// 箱盖上发光的星星
Content.chestGlowParts = function () {
  return [mxB(0.5, 0.1, 0.06, 0, 1.0, 0.36, 0xfff0a0, 'plain', [0.6, 0, 0]), mxB(0.1, 0.5, 0.06, 0, 1.0, 0.36, 0xfff0a0, 'plain', [0.6, 0, 0]),
    mxB(0.32, 0.32, 0.06, 0, 1.0, 0.36, 0xffd84a, 'plain', [0.6, 0, Math.PI / 4]), mxB(0.1, 0.1, 0.09, 0, 0.7, 0.57, 0xffffff, 'plain')];
};
Content.crackParts = function (stone) { return [mxB(4.0, 1, 0.8, 0, 0.5, 0, stone, 'ct_crack')]; };
Content.rubbleParts = function (stone) {
  var p = [];
  for (var i = 0; i < 6; i++) p.push(['dodec', [0.16 + (i % 3) * 0.05], [-1.6 + i * 0.6, 0.12, 0.62 + (i % 2) * 0.15], stone, null, [1, 0.7, 1], 'rock']);
  return p;
};
// 裂缝里透出来的暖光（雾里也看得到：这面墙后面有东西）
Content.crackGlowParts = function () {
  return [mxB(0.08, 0.42, 0.04, -0.5, 0.5, 0.41, 0xffb04a, 'plain', [0, 0, 0.35]), mxB(0.08, 0.3, 0.04, 0.1, 0.34, 0.41, 0xffb04a, 'plain', [0, 0, -0.5]),
    mxB(0.07, 0.24, 0.04, 0.8, 0.62, 0.41, 0xffb04a, 'plain', [0, 0, 0.7]), mxB(0.06, 0.2, 0.04, -1.2, 0.26, 0.41, 0xffb04a, 'plain', [0, 0, -0.2])];
};
Content.doorParts = function (stone) { var T = MX.tiles(); return [mxB(4.0, 1, 0.6, 0, 0.5, 0, stone, T.block)]; };
Content.doorRingParts = function () { return [['torus', [0.9, 0.08, 4, 16], [0, 0, 0.32], 0x4a4a52, null, null, 'metal'], mxB(4.1, 0.3, 0.7, 0, 1.35, 0, 0x5a5650, 'brick')]; };
// 正面板要多高：从这块地最低处往下埋 0.2 米，一直到屋顶下沿
Content.frontH = function (s) { return s.g + 3.7 - (s.lo - 0.2); };
// 门上的四个灯槽（点亮一个火盆亮一个）
Content.socketParts = function (i) { return [mxB(0.34, 0.34, 0.06, -0.9 + i * 0.6, -1.25, 0.33, 0xffd27a, 'plain')]; };
Content.brazierParts = function (stone) {
  var T = MX.tiles();
  return [
    mxC(0.55, 0.65, 0.3, 8, 0, 0.15, 0, stone, T.block), mxC(0.24, 0.3, 1.0, 6, 0, 0.8, 0, stone, T.block),
    mxC(0.62, 0.3, 0.36, 8, 0, 1.46, 0, 0x3a3634, 'metal'), mxC(0.66, 0.66, 0.06, 8, 0, 1.64, 0, 0x5a5650, 'metal'),
    mxC(0.52, 0.52, 0.05, 8, 0, 1.6, 0, 0x2a1a14, 'plain')
  ];
};
// 柱子四面都刻着 n 个发光的点
Content.pipParts = function (n) {
  var p = [];
  for (var side = 0; side < 4; side++) {
    var a = side * Math.PI / 2, cx = Math.sin(a), cz = Math.cos(a);
    for (var i = 0; i < n; i++) {
      var o = (i - (n - 1) / 2) * 0.17;
      p.push(mxB(0.11, 0.11, 0.05, cx * 0.29 + cz * o, 0.78, cz * 0.29 - cx * o, 0x9fdcff, 'plain', [0, a, 0]));
    }
  }
  return p;
};
Content.scrollParts = function () {
  return [['dodec', [0.5], [0, 0.2, 0], 0x7a7670, null, [1.2, 0.6, 1], 'rock'],
    mxC(0.12, 0.12, 0.7, 8, 0, 0.62, 0, 0xe8d8a8, 'cloth', [0, 0, Math.PI / 2]), mxC(0.14, 0.14, 0.06, 8, 0.36, 0.62, 0, 0x8a5a2a, 'wood', [0, 0, Math.PI / 2]),
    mxC(0.14, 0.14, 0.06, 8, -0.36, 0.62, 0, 0x8a5a2a, 'wood', [0, 0, Math.PI / 2]), mxB(0.06, 0.26, 0.26, 0.05, 0.62, 0, 0xc0302a, 'cloth')];
};
Content.moundParts = function (dirt) {
  return [['dodec', [1.2], [0, -0.1, 0], dirt, null, [1.3, 0.35, 1.3], 'noise'],
    mxB(1.4, 0.12, 0.22, 0, 0.32, 0, 0x8a8478, 'rock', [0, 0.78, 0]), mxB(1.4, 0.12, 0.22, 0, 0.33, 0, 0x8a8478, 'rock', [0, -0.78, 0]),
    mxB(0.08, 1.2, 0.08, 1.1, 0.6, 0.4, 0x6a4a2a, 'wood', [0.2, 0, -0.25]), mxB(0.3, 0.4, 0.05, 1.22, 0.1, 0.43, 0x8a8e96, 'metal', [0.2, 0, -0.25])];
};
Content.padParts = function (stone) {
  var T = MX.tiles();
  return [mxC(1.7, 1.9, 0.4, 10, 0, 0.0, 0, stone, T.block), mxC(1.45, 1.45, 0.08, 10, 0, 0.22, 0, 0x3a4048, 'metal')];
};
// 跳台上发光的箭头（指向弹出去的方向 +Z）
Content.padGlowParts = function () {
  return [mxB(0.36, 0.06, 1.2, 0, 0.29, -0.2, 0x5affe0, 'plain'), mxK(0.6, 0.9, 3, 0, 0.29, 0.75, 0x5affe0, 'plain', [Math.PI / 2, 0, 0], [1, 1, 0.12]),
    ['torus', [1.55, 0.06, 4, 24], [0, 0.27, 0], 0x5affe0, [Math.PI / 2, 0, 0], null, 'plain']];
};
Content.travelerParts = function () {
  var T = MX.tiles(), robe = 0x2a7a6a, robe2 = 0x22665a;
  return [
    mxB(2.0, 0.04, 1.3, 0.2, 0.02, 0.5, 0x6a3a2a, 'cloth'),
    mxK(0.7, 1.8, 8, 0, 0.9, 0, robe, 'cloth'), mxC(0.3, 0.38, 0.5, 8, 0, 1.95, 0, robe2, 'cloth'), mxK(0.34, 0.55, 8, 0, 2.4, -0.06, robe2, 'cloth', [-0.2, 0, 0]),
    mxB(0.36, 0.3, 0.05, 0, 1.95, 0.31, 0x0a0a10, 'plain'), mxK(0.16, 0.4, 6, 0, 1.68, 0.3, 0xe0d8c8, 'fur', [Math.PI, 0, 0]),
    mxB(1.0, 1.3, 0.7, 0, 1.6, -0.62, 0x7a5030, T.plank), mxC(0.22, 0.22, 1.1, 8, 0, 2.38, -0.62, 0xb04a3a, 'cloth', [0, 0, Math.PI / 2]),
    mxC(0.18, 0.15, 0.25, 8, 0.62, 1.3, -0.6, 0x3a3a40, 'metal'), mxC(0.14, 0.12, 0.2, 8, -0.62, 1.42, -0.6, 0xb08040, 'gold'),
    mxB(0.06, 2.6, 0.06, 0.55, 1.3, 0.25, 0x6a4a2a, 'wood'), mxB(0.22, 0.3, 0.22, 0.55, 2.55, 0.32, 0x3a3634, 'metal'),
    mxB(0.4, 0.3, 0.3, -0.7, 0.15, 0.7, 0x7a5030, T.plank), mxB(0.3, 0.25, 0.25, 0.9, 0.12, 0.9, 0x6a4a2a, T.plank)
  ];
};
Content.travelerGlowParts = function () { return [mxB(0.15, 0.2, 0.15, 0.55, 2.55, 0.32, 0xffd27a, 'plain'), mxB(0.06, 0.04, 0.02, 0.08, 1.98, 0.34, 0xffe060, 'plain'), mxB(0.06, 0.04, 0.02, -0.08, 1.98, 0.34, 0xffe060, 'plain')]; };
// 头顶转着的一颗宝石（颜色 = 稀有度）
Content.gemParts = function () { return [['oct', [0.32], [0, 0, 0], 0xffffff, null, [1, 1.4, 1], 'plain']]; };

// 光柱：从地上升起，雾里很远就能看见（秘宝箱、宝藏）；细（半径是 r 的 0.45）、淡（0.24），是个地标，不是一根照亮画面的光柱
Content.beam = function (o, color, h, r) {
  var mat = MX.additive(color, 0.24), m = new THREE.Mesh(MX.beamGeo(), mat), rr = (r || 0.9) * 0.45;
  m.position.set(o.x, o.y, o.z); m.scale.set(rr, h || 14, rr); m.frustumCulled = false; m.renderOrder = 3;
  Game.scene.add(m);
  o.parts.push(m);
  return m;
};

// ---------------- 秘宝箱：免费；能觉醒超武就觉醒，不然从三件稀有以上的宝物里选一件 ----------------
Interact.KINDS.ctChest = {
  radius: 2.6,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(Content.geo('chest', Content.chestParts)));
    o.glow = MX.mesh(Content.geo('chestGlow', Content.chestGlowParts), 'glow');
    g.add(o.glow);
    return g;
  },
  init: function (o) { o.beamM = Content.beam(o, 0xffd84a, 16, 0.8); },
  label: function () { return '打开秘宝箱 · 免费 · 稀有以上'; },
  use: function (o) { Content.openSecretChest(o); },
  update: function (o, dt, d2) {
    if (d2 > 6400) return;
    o.glow.scale.setScalar(1 + Math.sin(Game.time * 4 + o.x) * 0.08);
    if (o.beamM) o.beamM.material.opacity = 0.165 + Math.sin(Game.time * 2.5) * 0.06;
    if (Math.random() < dt * 4) FX.mote(o.x + rand(-0.7, 0.7), o.y + rand(0.6, 1.4), o.z + rand(-0.5, 0.5), 0xffe080, 0.1, 1.2, 1);
  },
  mapIcon: null
};
Content.openSecretChest = function (o) {
  Interact.consume(o);
  FX.burst(o.x, o.y + 1, o.z, 30, 0xffd84a, 8, 0.35);
  FX.ring(o.x, o.y, o.z, 4, 0xc070ff, 0.5);
  MX.pillar(o.x, o.y, o.z, 0xffd84a, 1.4, 10, 0.9);
  for (var i = 0; i < 8; i++) Pickups.gold(o.x + rand(-0.8, 0.8), o.y + 1, o.z + rand(-0.8, 0.8), Math.ceil(4 * Game.stage * P.st.goldGain));
  Passive.onChest();
  Content.emit('secretChest', o);
  if (Interact.onFreeChest && Interact.onFreeChest(o)) return;
  Game.openModal(function () {
    var ids = [], tries = 0;
    while (ids.length < 3 && tries++ < 40) { var id = Items.roll(2); if (ids.indexOf(id) < 0) ids.push(id); }
    UI.choiceModal('pick', '秘宝箱 · 稀有以上三选一', ids.map(function (id) { return { itemId: id, rarity: ITEMS[id].rarity }; }));
  });
};

// ---------------- 隐秘高台：站上台顶就算找到 ----------------
// ---------------- 裂墙密室：被爆炸（火药桶、爆炸武器、火药桶精）炸开 ----------------
Interact.KINDS.ctCrack = {
  noPrompt: true,
  model: function (o) {
    var g = new THREE.Group();
    var st = W.palette && W.palette.stone2 != null ? W.palette.stone2 : 0x7f7d76;
    var h = Content.frontH(o.site), slab = new THREE.Group();
    slab.add(MX.mesh(MX.geo('ct_crack' + st, function () { return Content.crackParts(st); })));
    o.glow = MX.mesh(Content.geo('crackGlow', Content.crackGlowParts), 'glow');
    slab.add(o.glow);
    slab.scale.y = h;
    g.add(slab);
    var rb = MX.mesh(MX.geo('ct_rubble' + st, function () { return Content.rubbleParts(st); }));
    rb.position.y = o.site.g - o.y - 0.1;
    g.add(rb);
    return g;
  },
  label: function () { return '裂开的墙'; },
  use: function () {},
  update: function (o, dt, d2) {
    if (d2 < 7 * 7) Content.hint('crack', '裂墙：用旁边的火药桶炸开', '#ffb04a');
    if (d2 < 3600) o.glow.visible = Math.sin(Game.time * 3 + o.x) > -0.6;
  },
  mapIcon: null
};
Content.breakWall = function (o) {
  if (o.used) return;
  var s = o.site;
  Interact.consume(o);
  s.front.top = -1e9;
  FX.burst(o.x, o.y + 1.8, o.z, 40, W.palette.stone2 || 0x8a8780, 10, 0.45);
  FX.burst(o.x, o.y + 1.2, o.z, 18, 0x5a4a3a, 7, 0.35);
  if (MX.smoke) MX.smoke(o.x, o.y + 1, o.z, 16, 0x6a6660, 1.6, 0.8);
  Game.shake(0.6);
  Content.sfx('wallBreak', o.x, o.y, o.z);
  Content.foundSite(s);
};

// ---------------- 火盆宝库：按光点数从 1 到 4 依次点燃四个火盆，石门沉下去 ----------------
Interact.KINDS.ctBrazier = {
  radius: 2.4,
  model: function (o) {
    var g = new THREE.Group(), st = W.palette && W.palette.stone != null ? W.palette.stone : 0x8e8b84;
    g.add(MX.mesh(MX.geo('ct_brazier' + st, function () { return Content.brazierParts(st); })));
    g.add(MX.mesh(Content.geo('pips' + o.n, function () { return Content.pipParts(o.n); }), 'glow'));
    o.flame = MX.mesh(MX.geo('flame', MX.flameParts), 'glow');
    // 火苗坐在盆里：盆口 1.64，炭面 1.6；火苗底（1.55 + 0.04）藏在盆沿下面，不从柱子周围露出来；
    // 横向放宽一点（盆口半径 0.62），不像一根细蜡烛
    o.flame.position.y = 1.55; o.flame.scale.set(0.95, 0.8, 0.95); o.flame.visible = false;
    g.add(o.flame);
    return g;
  },
  label: function (o) { return o.lit ? '火盆 · 已点燃' : '点燃火盆 · 柱子上有 ' + o.n + ' 个光点'; },
  canUse: function (o) { return !o.lit; },
  denied: function () { return '这个火盆已经点燃了'; },
  use: function (o) { Content.lightBrazier(o); },
  update: function (o, dt, d2) {
    if (!o.lit || d2 > 3600) return;
    var t = Game.time * 11 + o.n;
    o.flame.scale.set(0.95 * (1 + Math.sin(t * 0.7) * 0.06), 0.8 * (1 + Math.sin(t) * 0.14), 0.95);
    if (Math.random() < dt * 5) MX.part(o.x + rand(-0.2, 0.2), o.y + 2.5, o.z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(1.5, 2.5), rand(-0.3, 0.3), rand(0.6, 1.1), 0.08, 0.03, pick([0xffd27a, 0xff9a3a]), 0.3);
  },
  mapIcon: null
};
Content.lightBrazier = function (o) {
  var v = o.vault;
  if (!v || v.used) return;
  if (o.n === v.next) {
    o.lit = true; o.flame.visible = true; v.next++;
    FX.burst(o.x, o.y + 1.8, o.z, 12, 0xffb04a, 5, 0.25);
    if (v.sockets[o.n - 1]) v.sockets[o.n - 1].visible = true;
    Content.sfx('brazierLit', o.x, o.y, o.z);
    if (v.next > 4) Content.openVault(v);
    else UI.toast('火盆点燃了 ' + o.n + '/4', Kit.color('goldL'));
    return;
  }
  // 顺序不对：全部熄灭
  v.braziers.forEach(function (b) { if (b.lit) { b.lit = false; b.flame.visible = false; MX.smoke(b.x, b.y + 1.8, b.z, 6, 0x6a6660, 0.3, 0.3); } });
  v.sockets.forEach(function (m) { m.visible = false; });
  v.next = 1;
  MX.smoke(o.x, o.y + 1.8, o.z, 8, 0x6a6660, 0.3, 0.35);
  UI.toast('顺序不对：按光点从少到多点燃', Kit.color('red'));
  Content.sfx('brazierFail', o.x, o.y, o.z);
};
Interact.KINDS.ctVault = {
  radius: 3.4,
  model: function (o) {
    var g = new THREE.Group(), st = W.palette && W.palette.stone2 != null ? W.palette.stone2 : 0x7f7d76;
    var h = Content.frontH(o.site), mid = o.site.g - o.y + 1.9;
    o.door = new THREE.Group();
    var slab = MX.mesh(MX.geo('ct_door' + st, function () { return Content.doorParts(st); }));
    slab.scale.y = h;
    o.door.add(slab);
    var deco = new THREE.Group();
    deco.position.y = mid;
    deco.add(MX.mesh(Content.geo('doorRing', Content.doorRingParts)));
    o.sockets = [];
    for (var i = 0; i < 4; i++) {
      var sm = MX.mesh(Content.geo('socket' + i, (function (k) { return function () { return Content.socketParts(k); }; })(i)), 'glow');
      sm.visible = false; deco.add(sm); o.sockets.push(sm);
    }
    o.door.add(deco);
    g.add(o.door);
    return g;
  },
  init: function (o) { o.next = 1; o.braziers = []; o.doorY = 0; },
  label: function () { return '封印的宝库：按光点从少到多，依次点燃周围的四个火盆'; },
  canUse: function () { return false; },
  denied: function () { return '石门纹丝不动：按光点从少到多点燃周围的火盆'; },
  use: function () {},
  mapIcon: null
};
Content.openVault = function (v) {
  v.used = true; v.doorH = Content.frontH(v.site) + 0.3;
  v.site.front.top = -1e9;
  // 石门慢慢沉进地里（用掉的互动物体不再更新，借 interact_more.js 的动画列表）
  MX.anims.push({ o: v, fn: function (o, dt) {
    o.doorY = Math.min(o.doorH, o.doorY + dt * 3.2);
    o.door.position.y = -o.doorY;
    if (Math.random() < dt * 20) FX.part(o.x + rand(-2, 2), o.y + 0.2, o.z + rand(-0.4, 0.4), rand(-1, 1), rand(1, 3), rand(-1, 1), 0x8a8478, 0.25, 0.5);
    return o.doorY < o.doorH;
  } });
  Game.shake(0.5);
  Content.announce({ role: 'gold', icon: 'key', title: '宝库打开了', sub: '里面有一个秘宝箱' });
  Content.sfx('vaultOpen', v.x, v.y, v.z);
  Content.emit('secretSolved', v.site);
};

// ---------------- 藏宝图：捡起来就知道宝藏埋在哪；宝藏在小地图上标出来，过去挖开 ----------------
Interact.KINDS.ctScroll = {
  noPrompt: true,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(Content.geo('scroll', Content.scrollParts)));
    return g;
  },
  label: function () { return '一张旧地图'; },
  use: function () {},
  update: function (o, dt, d2, dy) {
    if (d2 < 2500 && Math.random() < dt * 6) FX.glow(o.x, o.y + 0.9, o.z, 0.9, 0.9, Content.C.gold, 0.9, 2);
    if (d2 < 1.9 * 1.9 && Math.abs(dy) < 2.2 && P.alive) Content.takeScroll(o);
  },
  mapIcon: null
};
Content.takeScroll = function (o) {
  Interact.consume(o);
  FX.burst(o.x, o.y + 0.8, o.z, 14, 0xffe0a0, 4, 0.2);
  var s = o.site;
  if (s && !s.found) {
    s.mapped = true;
    Content.foundSite(s, '宝藏标在小地图上了');
    if (s.mk) { Content.removeMarker(s.mk); s.mk = Content.addMarker(s, '#ffd23a', 'cross', 4.5, true); }
  }
  Content.sfx('scroll', o.x, o.y, o.z);
};
Interact.KINDS.ctTreasure = {
  radius: 2.4,
  model: function (o) {
    var g = new THREE.Group(), dirt = W.palette && W.palette.dirt != null ? W.palette.dirt : 0x4a3a1e;
    g.add(MX.mesh(MX.geo('ct_mound' + dirt, function () { return Content.moundParts(dirt); })));
    return g;
  },
  label: function (o) { return o.site && o.site.mapped ? '挖出宝藏' : '这里的土好像被翻过……挖开看看'; },
  use: function (o) { Content.digTreasure(o); },
  update: function (o, dt, d2) { if (o.site && o.site.mapped && d2 < 3600 && Math.random() < dt * 3) FX.mote(o.x + rand(-0.6, 0.6), o.y + 0.4, o.z + rand(-0.6, 0.6), 0xffd23a, 0.1, 1.4, 0.9); },
  mapIcon: null
};
Content.digTreasure = function (o) {
  var s = o.site;
  Interact.consume(o);
  FX.burst(o.x, o.y + 0.5, o.z, 26, W.palette.dirt || 0x4a3a1e, 7, 0.35);
  Game.shake(0.3);
  if (s && !s.found) Content.foundSite(s);
  if (s && s.mk) { Content.removeMarker(s.mk); s.mk = Content.addMarker(s, '#ffd84a', 'star', 4, false); }
  for (var i = 0; i < 14; i++) Pickups.gold(o.x + rand(-1, 1), o.y + 0.8, o.z + rand(-1, 1), Math.ceil(5 * Game.stage * P.st.goldGain));
  Interact.add('ctChest', o.x, o.z, W.groundAt(o.x, o.z, o.y + 2), { rotY: o.rotY });
  Content.sfx('dig', o.x, o.y, o.z);
};

// ---------------- 地形跳台：踩上去被弹到长坡顶上（和投石跳台一样：空中能转向、落地不摔伤） ----------------
Interact.KINDS.ctPad = {
  noPrompt: true,
  model: function (o) {
    var g = new THREE.Group(), st = W.palette && W.palette.stone != null ? W.palette.stone : 0x8e8b84;
    g.add(MX.mesh(MX.geo('ct_pad' + st, function () { return Content.padParts(st); })));
    o.glow = MX.mesh(Content.geo('padGlow', Content.padGlowParts), 'glow');
    g.add(o.glow);
    return g;
  },
  init: function (o) { o.cd = 0; MX.collide(o.x, o.z, 1.8, o.y + 0.25); },
  label: function () { return '跳台：踩上去弹上坡顶'; },
  use: function () {},
  update: function (o, dt, d2, dy) {
    o.cd = Math.max(0, o.cd - dt);
    if (d2 < 4900) o.glow.scale.setScalar(o.cd > 0 ? 0.8 : 1 + Math.sin(Game.time * 5 + o.x) * 0.06);
    if (o.cd <= 0 && P.alive && d2 < 1.5 * 1.5 && dy > -0.6 && dy < 1.2) Content.launchPad(o);
  },
  mapIcon: { color: '#5affe0', shape: 'triangle', size: 2.8 }
};
Content.launchPad = function (o) {
  var dx = o.tx - P.pos.x, dz = o.tz - P.pos.z, dh = Math.sqrt(dx * dx + dz * dz) || 1, dy = o.ty - P.pos.y;
  var T = clamp(dh / 15, 1.3, 2.2), vy = dy / T + 0.5 * P.GRAVITY * T, vh = dh / T;
  P.vel.set(dx / dh * vh, vy, dz / dh * vh);
  P.pos.y += 0.3; P.onGround = false; P.coyote = 0; P.jumpBuffer = 0; P.sliding = false;
  MX.flyT = 0.001;
  o.cd = 1.5;
  FX.burst(o.x, o.y + 0.5, o.z, 16, 0x9affe8, 6, 0.3);
  FX.ring(o.x, o.y + 0.3, o.z, 2.4, 0x5affe0, 0.35);
  Game.shake(0.3);
  Content.sfx('jumppad', o.x, o.y, o.z);
  Content.hint('pad', '坡顶按住滑铲冲下去！', '#5affe0');
};

// 放置：秘密地点的互动物体、地形跳台（Interact.populate 里，其他东西都放好之后）
Content.populate = function () {
  var S = Content.sites;
  for (var i = 0; i < S.length; i++) {
    var s = S[i], o;
    if (s.type === 'plateau') {
      s.chest = Interact.add('ctChest', s.x, s.z, s.top, { rotY: Math.random() * TAU });
    } else if (s.type === 'crack') {
      o = Interact.add('ctCrack', s.fx, s.fz, s.lo - 0.2, { rotY: s.rotY, site: s });
      s.obj = o;
      Interact.add('ctChest', s.x, s.z, W.terrainH(s.x, s.z), { rotY: s.rotY });
      for (var k = 0; k < 2; k++) {
        var kx = s.fx + s.nx * rand(3.4, 4.4) + (k ? 1 : -1) * s.nz * 1.8, kz = s.fz + s.nz * rand(3.4, 4.4) - (k ? 1 : -1) * s.nx * 1.8;
        Interact.add('powderkeg', kx, kz, W.groundAt(kx, kz, s.g + 1) - 0.1, { rotY: Math.random() * TAU, idx: k, mxFp: 1.3 });
      }
    } else if (s.type === 'vault') {
      o = Interact.add('ctVault', s.fx, s.fz, s.lo - 0.2, { rotY: s.rotY, site: s });
      o.site = s; s.obj = o;
      Interact.add('ctChest', s.x, s.z, W.terrainH(s.x, s.z), { rotY: s.rotY });
      var order = [1, 2, 3, 4].sort(function () { return Math.random() - 0.5; });
      for (k = 0; k < 4; k++) {
        var a = Math.PI / 4 + k * Math.PI / 2, bx = s.x + Math.cos(a) * 8.5, bz = s.z + Math.sin(a) * 8.5;
        var b = Interact.add('ctBrazier', bx, bz, W.groundAt(bx, bz, s.g + 2) - 0.05, { rotY: 0, n: order[k], vault: o, lit: false });
        o.braziers.push(b);
      }
    } else if (s.type === 'treasure') {
      o = Interact.add('ctTreasure', s.x, s.z, W.groundAt(s.x, s.z, s.g + 2) - 0.05, { rotY: Math.random() * TAU, site: s });
      s.obj = o;
      // 藏宝图放在离宝藏远一点的地方
      var p = null;
      for (k = 0; k < 30; k++) {
        var q = W.randomSpot(32, 95);
        if (dist2(q.x, q.z, s.x, s.z) > 45 * 45) { p = q; break; }
      }
      if (p) Interact.add('ctScroll', p.x, p.z, p.y, { rotY: Math.random() * TAU, site: s });
    }
  }
  // 长坡背后的跳台：对准坡顶平台
  var F = Content.feats || [];
  for (i = 0; i < F.length; i++) {
    var f = F[i];
    if (f.type !== 'slope') continue;
    var pp = Content.featPt(f, -(f.T + f.Lb) - 6, 0), tp = Content.featPt(f, -f.T * 0.5, 0);
    Interact.add('ctPad', pp.x, pp.z, W.groundAt(pp.x, pp.z, 999) - 0.05, { rotY: Math.atan2(tp.x - pp.x, tp.z - pp.z), tx: tp.x, tz: tp.z, ty: W.terrainH(tp.x, tp.z) });
  }
};
// 找到秘密地点：公告（小标签「发现秘密地点」+ 地点的名字 + 可选的一句话）+ 小地图标记 + 回调
Content.foundSite = function (s, sub) {
  if (!s || s.found) return;
  s.found = true;
  Content.secretsFound++;
  Content.announce({ role: 'gold', icon: 'star', kick: '发现秘密地点', title: s.name || '秘密地点', sub: sub || '' });
  if (!s.mk) s.mk = Content.addMarker(s, '#ffd84a', 'star', 4, false);
  FX.ring(P.pos.x, P.pos.y, P.pos.z, 2.4, 0xffd84a, 0.5);
  FX.flash(P.pos.x, P.pos.y + 1.2, P.pos.z, 2.6, 0xffd84a, 0.35, 2);
  Content.sfx('secretFound', s.x, s.g, s.z);
  Content.emit('secret', { id: s.id, type: s.type, name: s.name, stage: Game.stage, x: s.x, z: s.z });
};
Content.updateSecrets = function () {
  var S = Content.sites;
  for (var i = 0; i < S.length; i++) {
    var s = S[i];
    if (s.found) continue;
    if (s.type === 'plateau') {
      if (Math.abs(P.pos.x - s.x) < s.hs && Math.abs(P.pos.z - s.z) < s.hs && P.pos.y > s.top - 0.4) Content.foundSite(s);
      // 垫脚石只有 2.6 米宽，跑满速跳上去会滑出去：走到石台跟前时提示一次怎么跳
      else if (!Content.hinted.stones && P.onGround && P.pos.y < s.top - 1 && dist2(P.pos.x, P.pos.z, s.x, s.z) < 13 * 13)
        Content.hint('stones', '垫脚石：轻推摇杆慢慢跳', '#ffd84a');
    } else if (s.type === 'vault') {
      if (dist2(P.pos.x, P.pos.z, s.x, s.z) < 15 * 15) Content.foundSite(s, '按光点数依次点燃火盆');
    }
  }
};

// ============================================================
//  随机事件
// ============================================================
Content.EV_POOL = { 1: ['goldgob', 'merchant', 'meteor', 'mimic'], 2: ['meteor', 'mimic', 'goldgob', 'merchant', 'bloodmoon'], 3: ['bloodmoon', 'mimic', 'merchant', 'meteor', 'goldgob'] };
Content.EV_N = { 1: 3, 2: 3, 3: 4 };
Content.ev = null; Content.evQ = []; Content.xpMult = 1; Content.spawnBoost = 0;
// 换关时排好这一关的事件：按关卡进度错开（小 Boss 在 0.3 / 0.55 / 0.8）
Content.planEvents = function (stage) {
  var pool = (Content.EV_POOL[stage] || []).slice(), n = Content.EV_N[stage] || 0, q = [];
  pool.sort(function () { return Math.random() - 0.5; });
  // 血月只在后半关
  var slots = n >= 4 ? [0.2, 0.41, 0.63, 0.86] : [0.22, 0.46, 0.7];
  for (var i = 0; i < n && i < pool.length; i++) q.push({ type: pool[i], p: slots[i] + rand(-0.03, 0.03) });
  q.sort(function (a, b) { return a.p - b.p; });
  // 血月放到最后一个位置之前的后半段
  for (i = 0; i < q.length; i++) if (q[i].type === 'bloodmoon' && q[i].p < 0.4) {
    var j = q.length - 1, t = q[j].type; q[j].type = 'bloodmoon'; q[i].type = t;
  }
  Content.evQ = q;
};
Content.durScale = function () { return typeof Pace !== 'undefined' ? clamp(Pace.minutes / 15, 0.8, 1.15) : 1; };
Content.updateEvents = function (dt) {
  var ev = Content.ev;
  if (ev) {
    ev.t += dt;
    if (Director.swarm || Game.bossAlive) { Content.endEvent('cancel'); return; }
    ev.def.update(ev, dt);
    if (Content.ev === ev && ev.t >= ev.dur) Content.endEvent(ev.def.timeout ? ev.def.timeout(ev) : 'timeout');
    return;
  }
  var q = Content.evQ;
  if (!q.length || !P.alive) return;
  var p = Director.progress();
  if (p < q[0].p) return;
  if (p > 0.95) { q.shift(); return; }
  if (Director.swarm || Game.bossAlive) return;
  Content.startEvent(q.shift().type);
};
Content.startEvent = function (type) {
  var def = Content.EVENTS[type];
  if (!def) return null;
  if (Content.ev) Content.endEvent('cancel');
  var ev = { type: type, def: def, t: 0, dur: def.dur * Content.durScale(), x: P.pos.x, z: P.pos.z, mk: null, stage: Game.stage };
  var rem = Director.remaining() - 6;
  if (rem > 20) ev.dur = Math.min(ev.dur, rem);
  Content.ev = ev;
  if (def.start(ev) === false) { Content.ev = null; return null; }
  // 公告带上这次事件的 key：事件被打断时（Content.endEvent 'cancel'）把还没放完 / 还在排队的公告收掉
  ev.annKey = 'ev' + (Content.evN = (Content.evN || 0) + 1);
  Content.announce({ role: def.role, icon: def.icon, title: def.title, sub: def.sub, key: ev.annKey });
  Content.sfx('event_' + type, ev.x, P.pos.y, ev.z);
  Content.emit('event', { type: type, name: def.name, phase: 'start', stage: Game.stage, x: ev.x, z: ev.z });
  return ev;
};
// result：success 成功 / timeout 时间到 / cancel 被 Boss 战、午夜钟声打断 / fail
Content.endEvent = function (result) {
  var ev = Content.ev;
  if (!ev) return;
  Content.ev = null;
  if (ev.def.end) ev.def.end(ev, result);
  // 被 Boss 战、午夜钟声、下一个事件打断：这次事件的公告不再出来（不会排在午夜钟声、Boss 后面再冒出一条已经没有了的事件）
  if (result === 'cancel' && ev.annKey && typeof Kit !== 'undefined' && Kit.annDrop) Kit.annDrop(ev.annKey);
  if (ev.mk) Content.removeMarker(ev.mk);
  Content.mmRing = null;
  Content.emit('event', { type: ev.type, name: ev.def.name, phase: 'end', result: result, stage: ev.stage, x: ev.x, z: ev.z });
};
// 离玩家 r0~r1 米的空地
Content.spotNearPlayer = function (r0, r1) {
  var best = null;
  for (var t = 0; t < 12; t++) {
    var s = W.randomSpot(r0, r1, P.pos.x, P.pos.z), d = Math.sqrt(dist2(s.x, s.z, P.pos.x, P.pos.z));
    if (d >= r0 * 0.8 && d <= r1 * 1.3) return s;
    if (!best || Math.abs(d - r0) < Math.abs(Math.sqrt(dist2(best.x, best.z, P.pos.x, P.pos.z)) - r0)) best = s;
  }
  return best;
};

Content.EVENTS = {
  // 流星雨：玩家附近不停落下流星（落点先亮），砸到敌人也有伤害；60% 留下一颗星辰碎片（一大块经验）
  meteor: {
    name: '流星雨', title: '流星雨', sub: '躲开落点 · 捡星辰碎片', role: 'org', icon: 'meteor', dur: 40,
    start: function (ev) { ev.nt = 1.2; Content.mmRing = '#ffb04a'; },
    update: function (ev, dt) {
      ev.nt -= dt;
      if (ev.nt > 0) return;
      ev.nt = rand(0.45, 0.7) * (Game.stage >= 3 ? 0.85 : 1);
      var a = Math.random() * TAU, r = Math.random() < 0.25 ? rand(0, 1.5) : rand(2.5, 13);
      var tx = P.pos.x + P.vel.x * 0.35 + Math.cos(a) * r, tz = P.pos.z + P.vel.z * 0.35 + Math.sin(a) * r, b = Math.random() * TAU;
      var l = Content.lob('meteor', tx - Math.cos(b) * 11, P.pos.y + 32, tz - Math.sin(b) * 11, tx, tz, 1.3, { r: 2.6, H: 0, tele: 0xff6a1a, glow: Content.C.orange, trail: 0xff9a3a, s: 1, onHit: Content.meteorHit });
      // 往下落的哨音（音效：落点越近越响，1.3 秒后砸地）
      if (l) Content.sfx('meteorFall', l.x1, l.y1, l.z1);
    },
    end: function (ev, r) { if (r !== 'cancel') UI.toast('流星雨停了', Kit.color('orgL')); }
  },
  // 金袋哥布林：背着一袋金币到处跑，挨打掉金币，抓住有大奖；40 秒后钻地逃走
  goldgob: {
    name: '金袋哥布林', title: '金袋哥布林', sub: '每打一下都掉金币', role: 'gold', icon: 'bag', dur: 40,
    start: function (ev) {
      var s = Content.spotNearPlayer(24, 32);
      ev.e = Enemies.spawn('goldgob', s.x, s.z, { hpMult: Director.hpMult(), solo: true });
      ev.x = s.x; ev.z = s.z;
      ev.mk = Content.addMarker(ev.e, '#ffd23a', 'diamond', 4.5, true);
    },
    update: function (ev) {
      var e = ev.e;
      if (!e.alive) {
        // 被打倒（不是我们自己让它消失的）
        FX.burst(e.x, e.y + 1, e.z, 30, 0xffd23a, 9, 0.35);
        for (var i = 0; i < 16; i++) Pickups.gold(e.x + rand(-1, 1), e.y + 1, e.z + rand(-1, 1), Math.ceil(3 * Game.stage * P.st.goldGain));
        Interact.spawnChest(e.x, e.z, true);
        UI.toast('抓住金袋哥布林了！金币撒了一地', Kit.color('gold'));
        Content.endEvent('success');
      }
    },
    end: function (ev, r) {
      var e = ev.e;
      if (r === 'success' || !e || !e.alive) return;
      e.alive = false;
      FX.burst(e.x, e.y + 0.3, e.z, 18, 0x6a4a2a, 6, 0.35);
      if (r !== 'cancel') UI.toast('金袋哥布林钻进地洞跑掉了……', Kit.color('goldL'));
    }
  },
  // 旅行商人：在附近停 50 秒，只卖一件史诗 / 传说宝物
  merchant: {
    name: '旅行商人', title: '旅行商人', sub: '限时卖一件史诗或传说', role: 'gold', icon: 'coin', dur: 50,
    start: function (ev) {
      var s = Content.spotNearPlayer(20, 34);
      var r = Math.random() < 0.3 ? 4 : 3, id = Items.rollOfRarity(r);
      var price = Math.round((r === 4 ? 300 : 140) * MX.sf() * (typeof Pace !== 'undefined' ? Pace.xpScale() : 1));
      ev.o = Interact.add('ctMerchant', s.x, s.z, s.y, { rotY: Math.atan2(P.pos.x - s.x, P.pos.z - s.z), item: id, price: price, ev: ev });
      ev.x = s.x; ev.z = s.z;
      ev.mk = Content.addMarker(ev.o, RARITY[r].color, 'diamond', 4.5, true);
    },
    update: function (ev) { if (ev.o.used) Content.endEvent(ev.o.sold ? 'success' : 'fail'); },
    end: function (ev, r) {
      var o = ev.o;
      if (o && !o.used) { Interact.consume(o); MX.smoke(o.x, o.y + 1, o.z, 14, 0x9a9488, 0.8, 0.5); }
      if (r === 'timeout') UI.toast('旅行商人收拾好东西走了', Kit.color('goldL'));
    }
  },
  // 奇怪的宝箱：一个“免费金宝箱”……其实是宝箱怪。打倒它掉两个金宝箱
  mimic: {
    name: '奇怪的宝箱', title: '奇怪的宝箱', sub: '它好像动了一下……', role: 'org', icon: 'chest', dur: 45,
    start: function (ev) {
      var s = Content.spotNearPlayer(20, 30);
      ev.o = Interact.add('ctMimic', s.x, s.z, s.y, { rotY: Math.atan2(P.pos.x - s.x, P.pos.z - s.z), ev: ev });
      ev.x = s.x; ev.z = s.z;
      ev.mk = Content.addMarker(ev.o, '#ffc928', 'square', 3.6, true);
    },
    update: function (ev) {
      var m = ev.mimic;
      if (m && !m.alive) {
        Interact.spawnChest(m.x + 2, m.z, true);
        for (var i = 0; i < 12; i++) Pickups.gold(m.x + rand(-1, 1), m.y + 1, m.z + rand(-1, 1), Math.ceil(4 * Game.stage * P.st.goldGain));
        UI.toast('宝箱怪被打倒了！', Kit.color('gold'));
        Content.endEvent('success');
      }
    },
    // 醒了以后多给 60 秒去打
    timeout: function (ev) {
      if (ev.mimic && ev.mimic.alive && !ev.ext) { ev.ext = true; ev.dur += 60; return null; }
      return 'timeout';
    },
    end: function (ev, r) {
      var o = ev.o, m = ev.mimic;
      if (o && !o.used) { Interact.consume(o); MX.smoke(o.x, o.y + 0.6, o.z, 12, 0x9a9488, 0.6, 0.4); if (r === 'timeout') UI.toast('那个宝箱自己跳走了……', Kit.color('goldL')); }
      if (m && m.alive && r !== 'success') { m.alive = false; FX.burst(m.x, m.y + 1, m.z, 20, 0xc8922a, 6, 0.35); }
    }
  },
  // 血月：天色变红 55 秒，敌人多一半，经验翻倍
  bloodmoon: {
    name: '血月', title: '血月升起', sub: '敌人变多 · 经验翻倍', role: 'red', icon: 'moon', dur: 55,
    start: function () {
      Content.xpMult = 2; Content.spawnBoost = 0.6; Content.mmRing = '#ff3a3a';
      Game.applyAtmosphere(Game.stageDef.palette, 0x8a0a1a, 0.42);
    },
    update: function () { Content.mmRing = '#ff3a3a'; },
    end: function (ev, r) {
      Content.xpMult = 1; Content.spawnBoost = 0;
      if (!Director.swarm && Game.state !== 'end') Game.applyAtmosphere(Game.stageDef.palette);
      if (r !== 'cancel') UI.toast('血月落下了', Kit.color('redL'));
    }
  }
};
// 事件结束时给 timeout 的返回 null 表示“延长”，这里统一处理
(function () {
  var end = Content.endEvent;
  Content.endEvent = function (result) { if (result == null) return; return end(result); };
})();
Content.meteorHit = function (l) {
  var x = l.x1, y = l.y1, z = l.z1;
  FX.boom(x, y + 0.5, z, 2.8, 0xff8a2a);
  if (P.alive && dist2(P.pos.x, P.pos.z, x, z) < 2.9 * 2.9 && P.pos.y - y < 2.4) P.hurt(14 * ENEMY_DMG * Director.dmgMult(), null);
  var dmg = 40 * MX.sf() * (1 + 0.05 * P.level) * P.st.damage;
  Enemies.inRadius(x, z, 2.8, function (e) {
    if (e.boss) return;
    var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    Enemies.damage(e, dmg, 0, dx / d * 12, dz / d * 12);
  });
  if (Math.random() < 0.6) { Pickups.xp(x, y + 0.8, z, Math.max(5, Math.round(P.xpNext * 0.04))); FX.flash(x, y + 1, z, 1.8, 0xfff0a0, 0.3, 2); }
  if (dist2(P.pos.x, P.pos.z, x, z) < 144) Game.shake(0.2);
  Content.sfx('meteor', x, y, z);
};

// ---------------- 事件用的互动物体 ----------------
Interact.KINDS.ctMerchant = {
  radius: 2.8,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(Content.geo('traveler', Content.travelerParts)));
    g.add(MX.mesh(Content.geo('travelerGlow', Content.travelerGlowParts), 'glow'));
    o.gem = MX.mesh(Content.geo('gem', Content.gemParts), 'glow');
    o.gem.position.set(0, 3.3, 0.3);
    g.add(o.gem);
    return g;
  },
  init: function (o) {
    var c = new THREE.Color(RARITY[ITEMS[o.item].rarity].color);
    o.gem.material = o.gem.material.clone();
    o.gem.material.color = c;
  },
  label: function (o) { return '旅行商人：' + ITEMS[o.item].name + ' · ' + RARITY[ITEMS[o.item].rarity].name + ' · ' + Kit.num(o.price) + ' 金币'; },
  canUse: function (o) { return P.gold >= o.price; },
  denied: function (o) { return '金币不够：这件要 ' + Kit.num(o.price) + ' 金币'; },
  use: function (o) {
    Game.openModal(function () {
      UI.shopRef = o;
      var it = ITEMS[o.item];
      UI.choiceModal('ctTrade', '旅行商人 · 只此一件', [
        { itemId: o.item, rarity: it.rarity, foot: Kit.num(o.price) + ' 金币', buy: true },
        { title: '不买了', icon: '走', color: 0x5a6a7a, rarity: 0, lines: ['商人还会在这里待一会儿'], foot: '离开' }
      ]);
    });
  },
  update: function (o, dt) { o.gem.rotation.y += dt * 2; o.gem.position.y = 3.3 + Math.sin(Game.time * 2.4) * 0.12; },
  mapIcon: null
};
UI.modeHandlers.ctTrade = function (opt) {
  var o = UI.shopRef;
  if (!opt.buy || !o || o.used) return;
  if (P.gold < o.price) { UI.toast('金币不够', Kit.color('red')); return; }
  P.gold -= o.price;
  Items.give(o.item);
  o.sold = true;
  Interact.consume(o);
  MX.smoke(o.x, o.y + 1, o.z, 12, 0x9a9488, 0.8, 0.5);
  UI.toast('获得 ' + ITEMS[o.item].name, '#ffd84a');   // 提示用金色（奖励），稀有度颜色只在边框上（UI_STYLE §2.4）
};
Interact.KINDS.ctMimic = {
  radius: 2.4,
  model: function (o) {
    var g = new THREE.Group();
    o.body = new THREE.Mesh(Interact.models().chestFree, MODEL.material());
    g.add(o.body);
    return g;
  },
  label: function () { return '打开金宝箱 · 免费'; },
  use: function (o) { Content.wakeMimic(o); },
  update: function (o, dt, d2) {
    // 偶尔抖一下（仔细看能看出来）
    var k = Math.sin(Game.time * 1.7 + o.x);
    o.body.position.y = k > 0.97 ? Math.abs(Math.sin(Game.time * 30)) * 0.12 : 0;
    if (d2 < 1.6 * 1.6) Content.wakeMimic(o);
  },
  mapIcon: null
};
Content.wakeMimic = function (o) {
  if (o.used) return;
  var ev = o.ev;
  Interact.consume(o);
  var e = Enemies.spawn('mimic', o.x, o.z, { hpMult: Director.miniHpMult() * 0.5, dmgMult: Director.dmgMult() });
  e.state = 'intro'; e.st = 0.9;
  FX.burst(o.x, o.y + 1, o.z, 24, 0xffd84a, 7, 0.35);
  Game.shake(0.4);
  Content.announce({ role: 'org', icon: 'chest', title: '是宝箱怪！', sub: '打倒它掉两个金宝箱' });
  Content.sfx('mimicWake', o.x, o.y, o.z, e);
  if (ev && Content.ev === ev) {
    ev.mimic = e;
    if (ev.mk) Content.removeMarker(ev.mk);
    ev.mk = Content.addMarker(e, '#ff6a3a', 'square', 4, true);
    ev.t = Math.min(ev.t, ev.dur - 1);
  }
};

// ============================================================
//  接入
// ============================================================
(function () {
  // 生成地图前定好地标（地形高度要算上它们），塔楼断墙之后建秘密地点
  var gen0 = W.generate;
  W.generate = function (scene, seed) {
    Content.feats = null; Content.reserves = []; Content.sites = []; Content.seed = seed;
    return gen0.apply(this, arguments);
  };
  // 噪声已经按这张图的种子建好、地形网格还没建：这时定地标（要用原地形的高度挑朝向）
  var bt0 = W.buildTerrain;
  W.buildTerrain = function () {
    Content.feats = Content.planFeats(Content.seed || 1, typeof Game !== 'undefined' ? Game.stage : 1);
    return bt0.apply(this, arguments);
  };
  var th0 = W.terrainH;
  W.terrainBase = th0;
  W.terrainH = function (x, z) {
    var h = th0(x, z), F = Content.feats;
    if (F) for (var i = 0; i < F.length; i++) { var f = F[i]; if (x > f.x0 && x < f.x1 && z > f.z0 && z < f.z1) h += f.fn(f, x, z); }
    return h;
  };
  var fs0 = W.freeSpot;
  W.freeSpot = function (x, z, r) { return fs0.apply(this, arguments) && !Content.inFeat(x, z, r || 0); };
  var br0 = W.buildRuins;
  W.buildRuins = function (rng, pal) { var r = br0.apply(this, arguments); Content.buildSecrets(pal); return r; };
  // 互动物体：秘密地点、跳台
  var pop0 = Interact.populate;
  Interact.populate = function () { var r = pop0.apply(this, arguments); Content.populate(); return r; };
  // 爆炸炸开裂墙
  var boom0 = FX.boom;
  FX.boom = function (x, y, z, r) {
    var res = boom0.apply(this, arguments);
    for (var i = 0; i < Content.sites.length; i++) {
      var s = Content.sites[i];
      if (s.type === 'crack' && s.obj && !s.obj.used && dist2(x, z, s.fx, s.fz) < (r + 2.5) * (r + 2.5) && Math.abs(y - s.g) < r + 4) Content.breakWall(s.obj);
    }
    return res;
  };
  // 血月：刷怪多一半（按导演这一帧的刷怪速度额外累积）
  var dir0 = Director.update;
  Director.update = function (dt) {
    var r = dir0.apply(this, arguments);
    if (Content.spawnBoost > 0 && !Director.swarm && !Game.bossAlive) Director.acc += (Director.rateNow || 0) * Content.spawnBoost * dt;
    return r;
  };
  var xp0 = Pickups.xp;
  Pickups.xp = function (x, y, z, v) { return xp0.call(this, x, y, z, v * Content.xpMult); };
})();
Content.on('install', function () {
  // 召唤 Boss 时打断事件（Boss 战不出事件）
  var sb0 = Game.summonBoss;
  Game.summonBoss = function () { if (Content.ev) Content.endEvent('cancel'); return sb0.apply(this, arguments); };
  // 死亡、通关：这一局结束了，进行中的事件也跟着结束
  ['onDeath', 'win'].forEach(function (k) {
    var f0 = Game[k];
    if (!f0) return;
    Game[k] = function () { var r = f0.apply(this, arguments); if (Content.ev) Content.endEvent('cancel'); return r; };
  });
});
Content.on('clear', function () {
  // 换关 / 回菜单 / 新开一局时还在进行的事件：照常结束（发出 end，成就和音效才能收尾）
  if (Content.ev) Content.endEvent('cancel');
  Content.xpMult = 1; Content.spawnBoost = 0;
  Content.planEvents(typeof Game !== 'undefined' ? Game.stage : 1);
  Content.hintFeat = {};
});
Content.on('update', function (dt) {
  Content.updateSecrets();
  Content.updateEvents(dt);
  // 第一次走进地标：提示怎么玩（每局每种一次）
  if (Content.feats && (Content.featT = (Content.featT || 0) - dt) <= 0) {
    Content.featT = 0.5;
    var f = Content.inFeat(P.pos.x, P.pos.z, 0);
    if (f && f.type !== 'reserve' && Content.FEAT_HINT[f.type]) Content.hint('feat_' + f.type, f.name + '：' + Content.FEAT_HINT[f.type], '#9fe8ff');
  }
});
