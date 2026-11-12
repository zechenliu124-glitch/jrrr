'use strict';
// ============================================================
//  掉落物：经验水晶、金币、特殊掉落（回血爱心、磁铁、炸弹、时钟、狂暴）
//  水晶和金币用实例化网格；捡到时在玩家头顶合并显示 +经验 / $金币
// ============================================================
var Pickups = { gems: [], coins: [], drops: [] };

// 经验水晶分级：数值越大越高、颜色越稀有（h 是水晶高度，米）
Pickups.GEM_TIERS = [
  { max: 9, color: 0x9fdcff, h: 0.5 },
  { max: 49, color: 0x6cc0ff, h: 0.7 },
  { max: 199, color: 0xc490ff, h: 0.9 },
  { max: Infinity, color: 0xffd23a, h: 1.2 }
];

// 特殊掉落的光晕颜色
Pickups.DROP_GLOW = { heal: 0xff2a3a, magnet: 0xff5050, bomb: 0xffa040, clock: 0x5ab8ff, rage: 0xff6a1a };

// 半圆环（磁铁用）：[半径, 管粗, 截面段数, 弧段数, 弧度]
MODEL.extraGeo.fxArc = function (s) { return new THREE.TorusGeometry(s[0], s[1], s[2] || 6, s[3] || 10, s[4] || Math.PI); };

// ---------------- 模型 ----------------
// 竖直的六棱柱水晶，上下带尖；外面包一层略大的反向外壳，画出来就是深色描边（同一次绘制）
// 顶点颜色 >1 的地方（尖顶）会亮到发白，负数表示描边外壳
Pickups.crystalGeo = function () {
  var pos = [], nor = [], col = [];
  var tri = function (a, b, c, ca, cb, cc, hull) {
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    var mx = a[0] + b[0] + c[0], my = a[1] + b[1] + c[1], mz = a[2] + b[2] + c[2];
    // 本体朝外，外壳朝里（只剩背面 = 轮廓）
    if ((nx * mx + ny * my + nz * mz > 0) === !!hull) {
      var t = b; b = c; c = t; t = cb; cb = cc; cc = t;
      nx = -nx; ny = -ny; nz = -nz;
    }
    var l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1, vs = [a, b, c], cs = [ca, cb, cc];
    for (var k = 0; k < 3; k++) {
      pos.push(vs[k][0], vs[k][1], vs[k][2]);
      nor.push(nx / l, ny / l, nz / l);
      var cv = hull ? -1 : cs[k];
      col.push(cv, cv, cv);
    }
  };
  var shell = function (R, yT, y1, y0, yB, hull) {
    var ring = [];
    for (var i = 0; i < 6; i++) { var a = (i + 0.5) / 6 * TAU; ring.push([Math.cos(a) * R, Math.sin(a) * R]); }
    for (i = 0; i < 6; i++) {
      var p = ring[i], q = ring[(i + 1) % 6];
      var pt = [p[0], y1, p[1]], qt = [q[0], y1, q[1]], pb = [p[0], y0, p[1]], qb = [q[0], y0, q[1]];
      // 侧面：上亮下暗
      tri(pt, qt, qb, 1.0, 1.0, 0.76, hull);
      tri(pt, qb, pb, 1.0, 0.76, 0.76, hull);
      // 顶尖最亮，底尖稍亮
      tri([0, yT, 0], qt, pt, 1.75, 1.25, 1.25, hull);
      tri([0, yB, 0], pb, qb, 1.15, 0.8, 0.8, hull);
    }
  };
  shell(0.19, 0.5, 0.26, -0.3, -0.5, false);
  var d = 0.04;
  shell(0.19 + d, 0.5 + d * 1.6, 0.26, -0.3, -0.5 - d * 1.4, true);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

// 按位置合并法线：挤出的爱心变得圆鼓鼓、有光泽
Pickups.smoothNormals = function (g) {
  var p = g.attributes.position.array, n = new Float32Array(p.length), acc = {}, i, k, key;
  var keyOf = function (j) { return Math.round(p[j] * 500) + ',' + Math.round(p[j + 1] * 500) + ',' + Math.round(p[j + 2] * 500); };
  for (i = 0; i < p.length; i += 9) {
    var ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
    var vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
    var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (k = 0; k < 3; k++) {
      key = keyOf(i + k * 3);
      var a = acc[key] || (acc[key] = [0, 0, 0]);
      a[0] += nx; a[1] += ny; a[2] += nz;
    }
  }
  for (i = 0; i < p.length; i += 3) {
    var s = acc[keyOf(i)], l = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) || 1;
    n[i] = s[0] / l; n[i + 1] = s[1] / l; n[i + 2] = s[2] / l;
  }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
};

// 回血：圆鼓鼓的大红心（约 0.9 米）
Pickups.heartGeo = function () {
  var k = 0.78, s = new THREE.Shape();
  s.moveTo(0, -0.42 * k);
  s.bezierCurveTo(-0.06 * k, -0.35 * k, -0.47 * k, -0.08 * k, -0.47 * k, 0.15 * k);
  s.bezierCurveTo(-0.47 * k, 0.35 * k, -0.32 * k, 0.46 * k, -0.2 * k, 0.46 * k);
  s.bezierCurveTo(-0.09 * k, 0.46 * k, -0.01 * k, 0.38 * k, 0, 0.27 * k);
  s.bezierCurveTo(0.01 * k, 0.38 * k, 0.09 * k, 0.46 * k, 0.2 * k, 0.46 * k);
  s.bezierCurveTo(0.32 * k, 0.46 * k, 0.47 * k, 0.35 * k, 0.47 * k, 0.15 * k);
  s.bezierCurveTo(0.47 * k, -0.08 * k, 0.06 * k, -0.35 * k, 0, -0.42 * k);
  var g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.1, bevelSegments: 4, curveSegments: 7 });
  if (g.index) g = g.toNonIndexed();
  g.translate(0, 0, -0.05);
  Pickups.smoothNormals(g);
  var n = g.attributes.position.count, col = new Float32Array(n * 3);
  for (var i = 0; i < n; i++) { col[i * 3] = 0.94; col[i * 3 + 1] = 0.1; col[i * 3 + 2] = 0.14; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
};

Pickups.init = function (scene) {
  Pickups.gemMesh = FX.instanced(Pickups.crystalGeo(), FX.toyMat({ fog: 0.45, spec: 0.5, light: 1.08 }), 1600, scene);
  // 金币：竖着的小圆片，边缘暗金、中间一圈亮金（直径约 0.42 米）
  var coinGeo = MODEL.build([
    ['cyl', [0.21, 0.21, 0.06, 12], [0, 0, 0], 0xc98a1c, [Math.PI / 2, 0, 0]],
    ['cyl', [0.15, 0.15, 0.08, 12], [0, 0, 0], 0xffdc6a, [Math.PI / 2, 0, 0]]
  ], false);
  Pickups.coinMesh = FX.instanced(coinGeo, FX.toyMat({ fog: 0.5, spec: 0.85, light: 1.2 }), 500, scene);
  Pickups.dropMat = FX.toyMat({ fog: 0.4, spec: 0.7, light: 1.15 });
  Pickups.dropGeos = {
    heal: Pickups.heartGeo(),
    // 马蹄形磁铁：红色 U 形 + 银色磁极
    magnet: MODEL.build([
      ['fxArc', [0.2, 0.1, 6, 10, Math.PI], [0, 0.08, 0], 0xe8323a],
      ['cyl', [0.1, 0.1, 0.32, 6], [-0.2, -0.08, 0], 0xe8323a],
      ['cyl', [0.1, 0.1, 0.32, 6], [0.2, -0.08, 0], 0xe8323a],
      ['cyl', [0.105, 0.105, 0.14, 6], [-0.2, -0.31, 0], 0xe8eef6],
      ['cyl', [0.105, 0.105, 0.14, 6], [0.2, -0.31, 0], 0xe8eef6]
    ], false),
    // 圆滚滚的黑炸弹 + 引信
    bomb: MODEL.build([
      ['sphere', [0.34, 12, 9], [0, -0.06, 0], 0x2e2e3e],
      ['cyl', [0.12, 0.14, 0.12, 8], [0, 0.3, 0], 0x5a5a70],
      ['cyl', [0.035, 0.035, 0.24, 5], [0.05, 0.45, 0], 0xc8a46a, [0, 0, -0.4]]
    ], false),
    // 蓝色闹钟：白表盘、黑指针、金色铃铛
    clock: MODEL.build([
      ['cyl', [0.32, 0.32, 0.16, 14], [0, 0, 0], 0x3a8af0, [Math.PI / 2, 0, 0]],
      ['cyl', [0.26, 0.26, 0.17, 14], [0, 0, 0], 0xf6f2e6, [Math.PI / 2, 0, 0]],
      ['box', [0.045, 0.18, 0.19], [0, 0.07, 0], 0x1a1a24],
      ['box', [0.14, 0.045, 0.19], [0.055, 0, 0], 0x1a1a24],
      ['sphere', [0.1, 8, 6], [-0.21, 0.29, 0], 0xffd23a],
      ['sphere', [0.1, 8, 6], [0.21, 0.29, 0], 0xffd23a],
      ['box', [0.07, 0.1, 0.07], [-0.19, -0.33, 0], 0x2a5ab0],
      ['box', [0.07, 0.1, 0.07], [0.19, -0.33, 0], 0x2a5ab0]
    ], false),
    // 狂暴：一簇红橙色火焰
    rage: MODEL.build([
      ['sphere', [0.22, 8, 6], [0, -0.26, 0], 0xff4a1a],
      ['cone', [0.22, 0.72, 6], [0, 0.08, 0], 0xff3a1a],
      ['cone', [0.14, 0.46, 6], [-0.2, -0.1, 0], 0xff7a1a, [0, 0, 0.45]],
      ['cone', [0.14, 0.46, 6], [0.2, -0.1, 0], 0xff7a1a, [0, 0, -0.45]],
      ['cone', [0.12, 0.4, 6], [0, -0.08, 0.14], 0xffd23a],
      ['cone', [0.12, 0.4, 6], [0, -0.08, -0.14], 0xffd23a]
    ], false)
  };
  Pickups.GEM_TIERS.forEach(function (t) { t.c = new THREE.Color(t.color); });
  Pickups.dropGlowC = {};
  for (var k in Pickups.DROP_GLOW) Pickups.dropGlowC[k] = new THREE.Color(Pickups.DROP_GLOW[k]);
  Pickups.coinGlow = new THREE.Color(0xffc830);
  Pickups.white = new THREE.Color(0xffffff);
  Pickups.spark = new THREE.Color(0xffb040);
};

Pickups.clear = function () {
  Pickups.gems = []; Pickups.coins = [];
  Pickups.drops.forEach(function (d) { d.mesh.parent && d.mesh.parent.remove(d.mesh); });
  Pickups.drops = [];
  FX.commit(Pickups.gemMesh, 0); FX.commit(Pickups.coinMesh, 0);
};

Pickups.groundY = function (x, z, y) { return W.groundAt(x, z, y + 0.5) + 0.45; };

Pickups.xp = function (x, y, z, v) {
  if (Pickups.gems.length >= 1500) {
    // 宝石太多时，把经验合并到一个旧宝石里
    var g0 = Pickups.gems[Math.floor(Math.random() * Pickups.gems.length)];
    g0.v += v;
    return;
  }
  Pickups.gems.push({ x: x, y: y, z: z, vy: rand(3, 6), vx: rand(-2, 2), vz: rand(-2, 2), v: v, pull: false, t: Math.random() * 10 });
};

Pickups.gold = function (x, y, z, v) {
  if (Pickups.coins.length >= 480) { Pickups.coins[0].v += v; return; }
  Pickups.coins.push({ x: x, y: y, z: z, vy: rand(4, 7), vx: rand(-2.5, 2.5), vz: rand(-2.5, 2.5), v: v, pull: false, t: Math.random() * 10 });
};

// 地上同一种掉落已经有 Pickups.DROP_CAP 个没捡时不再掉新的（午夜钟声里不去捡的话，爱心会无限增加，每个都是一个网格）
Pickups.DROP_CAP = 24;
Pickups.drop = function (kind, x, y, z) {
  for (var i = 0, same = 0; i < Pickups.drops.length; i++) if (Pickups.drops[i].kind === kind && ++same >= Pickups.DROP_CAP) return;
  var mesh = new THREE.Mesh(Pickups.dropGeos[kind], Pickups.dropMat);
  Game.scene.add(mesh);
  Pickups.drops.push({ kind: kind, x: x, y: y, z: z, vy: 5, vx: 0, vz: 0, pull: false, mesh: mesh, t: 0 });
};

Pickups.magnetAll = function () {
  Pickups.gems.forEach(function (g) { g.pull = true; });
  Pickups.coins.forEach(function (g) { g.pull = true; });
};

Pickups.moveOne = function (g, dt, range2) {
  var dx = P.pos.x - g.x, dy = (P.pos.y + 0.9) - g.y, dz = P.pos.z - g.z;
  var d2 = dx * dx + dy * dy + dz * dz;
  if (!g.pull && d2 < range2) g.pull = true;
  if (g.pull) {
    var d = Math.sqrt(d2) || 0.001;
    g.ps = (g.ps || 6) + dt * 40;
    var sp = Math.max(g.ps, P.speed() + 6);
    g.x += dx / d * sp * dt; g.y += dy / d * sp * dt; g.z += dz / d * sp * dt;
    return d < 1.1;
  }
  // 掉落后弹跳落地
  if (g.vy !== 0 || g.vx !== 0) {
    g.vy -= 20 * dt;
    g.x += g.vx * dt; g.z += g.vz * dt; g.y += g.vy * dt;
    var gy = Pickups.groundY(g.x, g.z, g.y);
    if (g.y <= gy) { g.y = gy; g.vy = 0; g.vx = 0; g.vz = 0; }
  }
  return false;
};

// 实例矩阵：绕 Y 轴转 a、等比缩放 s、平移到 (x, y, z)
Pickups.putYaw = function (arr, n, x, y, z, a, s) {
  var o = n * 16, c = Math.cos(a) * s, sn = Math.sin(a) * s;
  arr[o] = c; arr[o + 2] = -sn; arr[o + 5] = s; arr[o + 8] = sn; arr[o + 10] = c;
  arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
};

Pickups.update = function (dt) {
  var r = P.pickupRange(), r2 = r * r, xg = (P.st && P.st.xpGain) || 1;
  var gems = Pickups.gems, n = 0, i, g;
  for (i = gems.length - 1; i >= 0; i--) {
    g = gems[i];
    g.t += dt;
    if (Pickups.moveOne(g, dt, r2)) {
      P.gainXp(g.v);
      Relic.onPickup('xp', g.v);   // 第 6 块：每颗水晶（渡鸦羽毛）
      FX.popup('xp', g.v * xg);
      gems[i] = gems[gems.length - 1]; gems.pop();
    }
  }
  // 水晶：竖直、慢慢自转、轻轻上下浮动；附近的带一圈光晕
  var gm = Pickups.gemMesh, ma = gm.instanceMatrix.array, ca = gm.instanceColor.array, T = Pickups.GEM_TIERS;
  var px = P.pos.x, pz = P.pos.z;
  for (i = 0; i < gems.length && n < 1600; i++) {
    g = gems[i];
    var dx = g.x - px, dz = g.z - pz, d2 = dx * dx + dz * dz;
    if (d2 > 8100) continue;
    var tier = T[0];
    for (var k = 1; k < 4 && g.v > tier.max; k++) tier = T[k];
    var h = tier.h, y = g.y - 0.35 + h * 0.5 + Math.sin(g.t * 2.2) * 0.07;
    Pickups.putYaw(ma, n, g.x, y, g.z, g.t * 1.3, h);
    ca[n * 3] = tier.c.r; ca[n * 3 + 1] = tier.c.g; ca[n * 3 + 2] = tier.c.b;
    n++;
    if (d2 < 2500) FX.glow(g.x, y, g.z, h * 1.15, h * 1.5, tier.c, 0.32, 0);
  }
  FX.commit(gm, n);

  // 金币：快速自转，偶尔闪一下
  var coins = Pickups.coins;
  n = 0;
  for (i = coins.length - 1; i >= 0; i--) {
    var c = coins[i];
    c.t += dt;
    if (Pickups.moveOne(c, dt, r2)) {
      P.gold += c.v;
      UI.goldPop();
      FX.popup('gold', c.v);
      coins[i] = coins[coins.length - 1]; coins.pop();
    }
  }
  var cm = Pickups.coinMesh;
  ma = cm.instanceMatrix.array;
  for (i = 0; i < coins.length && n < 500; i++) {
    c = coins[i];
    var cy = c.y - 0.1 + Math.sin(c.t * 3) * 0.06;
    Pickups.putYaw(ma, n++, c.x, cy, c.z, c.t * 3.4, 1);
    if (Math.abs(c.x - px) + Math.abs(c.z - pz) > 70) continue;
    FX.glow(c.x, cy, c.z, 0.62, 0.62, Pickups.coinGlow, 0.24, 0);
    var tw = Math.sin(c.t * 2.3 + c.v);
    if (tw > 0.95) FX.glow(c.x + 0.14, cy + 0.16, c.z, 0.5, 0.5, Pickups.white, (tw - 0.95) * 20, 2);
  }
  FX.commit(cm, n);

  // 特殊掉落：慢慢转、上下浮动，外面一圈光环提示可以捡
  for (i = Pickups.drops.length - 1; i >= 0; i--) {
    var d = Pickups.drops[i];
    d.t += dt;
    if (Pickups.moveOne(d, dt, 2.2 * 2.2)) {
      Pickups.collect(d.kind);
      Game.scene.remove(d.mesh);
      Pickups.drops.splice(i, 1);
      continue;
    }
    var dy = d.y + 0.18 + Math.sin(d.t * 2.6) * 0.12, rot = d.t * 1.7;
    d.mesh.position.set(d.x, dy, d.z);
    d.mesh.rotation.y = rot;
    // 爱心一跳一跳
    d.mesh.scale.setScalar(d.kind === 'heal' ? 1 + Math.pow(Math.max(0, Math.sin(d.t * 6)), 4) * 0.1 : 1);
    var gc = Pickups.dropGlowC[d.kind] || Pickups.white;
    FX.glow(d.x, dy, d.z, 1.5, 1.5, gc, 0.22, 0);
    FX.glow(d.x, dy, d.z, 1.7, 1.7, gc, 0.32, 1);
    if (d.kind === 'bomb') {
      var fx = Math.cos(rot) * 0.12, fz = -Math.sin(rot) * 0.12, fl = 0.7 + Math.random() * 0.6;
      FX.glow(d.x + fx, dy + 0.6, d.z + fz, 0.45 * fl, 0.45 * fl, Pickups.spark, 1, 2);
    }
  }
};

Pickups.randomPowerup = function () { return pick(['heal', 'heal', 'magnet', 'bomb', 'clock', 'rage']); };

// 把一定范围内的经验和金币吸过来
Pickups.magnetNear = function (r) {
  var r2 = r * r;
  Pickups.gems.forEach(function (g) { if (dist2(g.x, g.z, P.pos.x, P.pos.z) < r2) g.pull = true; });
  Pickups.coins.forEach(function (g) { if (dist2(g.x, g.z, P.pos.x, P.pos.z) < r2) g.pull = true; });
};

Pickups.collect = function (kind) {
  FX.flash(P.pos.x, P.pos.y + 1, P.pos.z, 3, Pickups.DROP_GLOW[kind] || 0xffffff, 0.3, 0);
  if (kind === 'clock') { Enemies.list.forEach(function (e) { if (!e.boss) e.frozen = Math.max(e.frozen, 5); }); UI.toast('时间暂停！', Kit.color('gold')); return; }
  if (kind === 'rage') { P.rage = 8; UI.toast('狂暴！伤害翻倍', Kit.color('gold')); return; }
  if (kind === 'heal') { P.heal(P.st.maxHp * 0.3 * Relic.healPickupMult()); Relic.onPickup('heal', 0); }   // 第 6 块：硬面包
  else if (kind === 'magnet') { Pickups.magnetAll(); UI.toast('磁铁！吸取所有经验', Kit.color('cya')); }
  else if (kind === 'bomb') { Enemies.nova(P.pos.x, P.pos.z, 30, 0, 60); Enemies.inRadius(P.pos.x, P.pos.z, 30, function (e) { if (!e.boss) Enemies.damage(e, e.hp + 1, true, 0, 0); }); Game.shake(0.8); UI.toast('炸弹！', Kit.color('gold')); }
};
