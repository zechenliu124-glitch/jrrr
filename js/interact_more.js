'use strict';
// ============================================================
//  更多地图互动点（全部通过 Interact.KINDS 注册）：
//  铁匠铺、许愿井、篝火营地、弩车、战马、投石跳台、骑士古墓、战旗据点、火药桶堆、传送石
//  以及它们带来的状态：骑马、「温暖」、友军弩车、弹射飞行，HUD 上的增益栏和进度条
//  只用包装函数接入其他文件（Interact.update / populate、P.hurt / reset / updateCamera / updateHpBar、
//  FX.drawTexts、W.pushOut / nearby（只在弹射飞行时）、Director.update、Passive.speedMult、UI.update、
//  Game.updateChallenges），不改它们的源码
// ============================================================
var MX = {
  mount: null,          // 正在骑的战马
  warmT: 0,             // 「温暖」剩余秒数
  turrets: [],          // 正在开火的友军弩车
  bolts: [],            // 弩车射出的重弩箭
  flyT: 0,              // 投石跳台弹射后的飞行计时（0 = 没在飞）
  spawnBoost: 0,        // 战旗占领中：额外刷怪倍率
  capturing: false,
  progress: null,       // 本帧要显示的进度 { text, pct, color }
  shown: null,          // HUD 正在显示的进度
  fx: [],               // 光柱、焦痕等临时效果
  anims: [],            // 用掉以后还在动的东西（倒下的墓门、熄灭后的烟…）
  plist: [],            // 方块粒子（烟、火星、尘土、闪光）
  nearStone: null,
  smithRef: null,
  camLift: 0,
  trampled: new Map(),  // 敌人 id → 上次被践踏的时间（不往敌人身上加字段）
  mats: {},
  geoCache: {}
};

// 两对传送石的颜色
MX.PAIR = [0x46f2ff, 0xff5ae0];
MX.PAIR_CSS = ['#46f2ff', '#ff5ae0'];
// 每关的数量
MX.COUNTS = { crypt: 2, blacksmith: 2, banner: 2, ballista: 3, warhorse: 2, wishwell: 2, campfire: 3, waystone: 4, catapult: 6, powderkeg: 10 };
MX.ORDER = ['crypt', 'blacksmith', 'banner', 'ballista', 'warhorse', 'wishwell', 'campfire', 'waystone', 'catapult', 'powderkeg'];
// 摆放规则：fp 占地半径，minR 离出生点最近距离，gap 与其他互动物体的间距，flat 占地内允许的高低差，
// sink 往占地范围的最低点沉多少（0 = 中心的高度，1 = 最低点；小摆件沉下去就不会悬空）
MX.SPOT = {
  crypt: { fp: 3.4, minR: 42, gap: 16, flat: 1.2, sink: 0.3 },
  blacksmith: { fp: 3.0, minR: 30, gap: 14, flat: 0.9, sink: 0.4 },
  banner: { fp: 3.0, minR: 34, gap: 18, flat: 1.4, sink: 0.3 },
  ballista: { fp: 1.8, minR: 26, gap: 12, flat: 0.7, sink: 0.4 },
  warhorse: { fp: 2.8, minR: 26, gap: 12, flat: 0.6, sink: 0.6 },
  wishwell: { fp: 1.8, minR: 28, gap: 12, flat: 0.7, sink: 0.3 },
  campfire: { fp: 2.8, minR: 24, gap: 12, flat: 0.6, sink: 0.6 },
  waystone: { fp: 1.6, minR: 30, gap: 14, flat: 0.8, sink: 0.3 },
  catapult: { fp: 2.2, minR: 24, gap: 12, flat: 0.6, sink: 0.4, check: function (x, z, y) { return MX.flightClear(x, z, y); } },
  powderkeg: { fp: 1.3, minR: 22, gap: 8, flat: 0.5, sink: 0.8 }
};

// ---------------- 小工具 ----------------
// 关卡系数（和商店一样的缩放）
MX.sf = function () { return 1 + (Game.stage - 1) * 0.5; };
// 物体局部坐标（前方是 +Z）→ 世界坐标
MX.local = function (o, lx, lz) {
  var c = Math.cos(o.rotY || 0), s = Math.sin(o.rotY || 0);
  return { x: o.x + lx * c + lz * s, z: o.z - lx * s + lz * c };
};
MX.angDiff = function (a, b) { return ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI; };
MX.tile = function (name, fb) { return TEX.TILES.indexOf(name) >= 0 ? name : fb; };
MX.tiles = function () {
  if (!MX._T) MX._T = { plank: MX.tile('mx_plank', 'wood'), block: MX.tile('mx_block', 'brick'), rune: MX.tile('mx_rune', 'plain'), fire: MX.tile('mx_fire', 'plain'), canvas: MX.tile('mx_canvas', 'cloth') };
  return MX._T;
};
// 火焰贴图是彩色的，顶点色用白色；贴图图集满了的时候退回橙色
MX.fireCol = function () { return MX.tiles().fire === 'mx_fire' ? 0xffffff : 0xffa040; };

// 自己的零件类型：贴图坐标收进 [0, 0.999]。MODEL.build 用 u - floor(u) 取小数，
// 正好等于 1 的边会折回 0，整个面只剩一个像素；收一点就能显示完整的 16×16 小贴图
MX.fixUV = function (g) {
  var uv = g.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, clamp(uv.getX(i), 0, 0.999), clamp(uv.getY(i), 0, 0.999));
  return g;
};
MODEL.extraGeo.mxbox = function (s) { return MX.fixUV(new THREE.BoxGeometry(s[0], s[1], s[2])); };
MODEL.extraGeo.mxcyl = function (s) { return MX.fixUV(new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 6)); };
MODEL.extraGeo.mxcone = function (s) { return MX.fixUV(new THREE.ConeGeometry(s[0], s[1], s[2] || 6)); };

// 零件简写：方块 / 圆柱 / 圆锥（顺序与 MODEL.build 的零件格式一致）
function mxB(w, h, d, x, y, z, c, t, r) { return ['mxbox', [w, h, d], [x, y, z], c, r || null, null, t || null]; }
function mxC(rt, rb, h, seg, x, y, z, c, t, r, s) { return ['mxcyl', [rt, rb, h, seg], [x, y, z], c, r || null, s || null, t || null]; }
function mxK(r, h, seg, x, y, z, c, t, rot, s) { return ['mxcone', [r, h, seg], [x, y, z], c, rot || null, s || null, t || null]; }

// ---------------- 像素贴图（脚本加载时注册；图集满了就用内置贴图） ----------------
(function () {
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集已满 */ } };
  // 木板：横向木板、深色板缝、接头和钉子
  add('mx_plank', function (x, y, r) {
    var row = y >> 2, yy = y & 3;
    if (yy === 3) return 112 + r() * 16;
    var v = 196 + Math.sin(x * 0.9 + row * 2.1) * 12 + r() * 22;
    if (yy === 0) v += 14;
    if ((x + row * 6) % 16 === 0) v = 130;
    if (yy === 1 && (x === 2 || x === 13)) v = 92;
    return v;
  });
  // 石块：错缝砌的大石块，上亮下暗，偶尔有裂纹
  add('mx_block', function (x, y, r) {
    var row = Math.floor(y / 5), yy = y % 5, xx = (x + (row % 2 ? 4 : 0)) % 8;
    if (yy === 4 || xx === 7) return 104 + r() * 18;
    var v = 186 + r() * 36;
    if (yy === 0 || xx === 0) v += 24;
    if (yy === 3) v -= 16;
    if (r() < 0.04) v -= 52;
    return v;
  });
  // 符文：暗底上的发光刻纹（剑形符文 + 两侧小点），配发光材质
  add('mx_rune', function (x, y, r) {
    var g = (x >= 7 && x <= 8 && y >= 2 && y <= 13) || (y === 5 && x >= 4 && x <= 11) || (y === 4 && (x === 4 || x === 11)) ||
      (y === 13 && x >= 5 && x <= 10) || (y === 1 && x >= 6 && x <= 9) || ((x === 3 || x === 12) && (y === 9 || y === 10));
    if (g) return 232 + r() * 23;
    if (x === 0 || y === 0 || x === 15 || y === 15) return 140;
    return 34 + r() * 26;
  });
  // 火焰：底部黄白、中间橙、顶部暗红（彩色）
  add('mx_fire', function (x, y, r) {
    var h = 1 - y / 15, edge = Math.abs(x - 7.5) / 7.5;
    var t = clamp(h * 0.8 + edge * 0.45 + (r() - 0.5) * 0.3, 0, 1);
    if (t < 0.3) return [255, 246, 200];
    if (t < 0.55) return [255, 200, 70];
    if (t < 0.8) return [255, 122, 32];
    return [196, 48, 22];
  });
  // 帆布：粗织纹 + 缝线
  add('mx_canvas', function (x, y, r) {
    var v = 210 + ((x + y) % 2 ? 12 : -6) + r() * 14;
    if ((y === 1 || y === 14) && x % 3 === 0) v = 150;
    if (r() < 0.03) v -= 40;
    return v;
  });
})();

// ---------------- 材质与几何体 ----------------
// lit：带光照的图集材质；glow：不受光照的发光图集材质；add：加法混合的光晕
MX.mat = function (k) {
  if (MX.mats[k]) return MX.mats[k];
  var m;
  if (k === 'glow') m = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas });
  else if (k === 'add') m = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
  else m = MODEL.material();
  MX.mats[k] = m;
  return m;
};
MX.geo = function (key, fn) { return MX.geoCache[key] || (MX.geoCache[key] = MODEL.build(fn())); };
MX.mesh = function (geo, k) { return new THREE.Mesh(geo, MX.mat(k)); };
MX.additive = function (color, opacity) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, color: color, transparent: true, opacity: opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide });
};

// 光柱：开口圆柱，底部亮、往上渐隐（加法混合下黑色 = 透明）
MX.beamGeo = function () {
  if (MX._beam) return MX._beam;
  var g = new THREE.CylinderGeometry(1, 1, 1, 12, 4, true).translate(0, 0.5, 0);
  var p = g.attributes.position, col = [];
  for (var i = 0; i < p.count; i++) { var k = Math.pow(1 - p.getY(i), 1.7); col.push(k, k, k); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  MX._beam = g;
  return g;
};

// 像素锯齿的贴地圆环（和光环、冲击环一样由小方格拼成，每格贴着地面高度；世界坐标对齐，不跟着物体旋转）；
// 方格按角度排好，drawRange 只画前一段就是进度圈：MX.ringArc(geo, 0~1)
MX.pixelRingGeo = function (x, y, z, r0, r1, cell) {
  var n = Math.max(8, Math.round(2.4 * r1 / (cell || 0.22)));
  var cs = FX.pixelRingCells(n, r0 / r1, 1);
  cs.forEach(function (c) { c[3] = Math.atan2(c[1], c[0]); });
  cs.sort(function (a, b) { return a[3] - b[3]; });
  var pos = [];
  for (var i = 0; i < cs.length; i++) {
    var c = cs[i], cx = c[0] * r1, cz = c[1] * r1, h = c[2] * r1;
    var py = W.terrainH(x + cx, z + cz) - y + 0.14;
    pos.push(cx - h, py, cz - h, cx + h, py, cz + h, cx + h, py, cz - h, cx - h, py, cz - h, cx - h, py, cz + h, cx + h, py, cz + h);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeBoundingSphere();
  g.userData.cells = cs.length;
  return g;
};
MX.ringArc = function (g, k) { g.setDrawRange(0, 6 * Math.floor((g.userData.cells || 0) * clamp(k, 0, 1))); };
// 贴地的光墙：底部亮、顶部透明（像光环的光幕）
MX.wallGeo = function (x, y, z, r, h, segs) {
  var pos = [], col = [], idx = [];
  for (var i = 0; i <= segs; i++) {
    var a = i / segs * TAU, px = Math.cos(a) * r, pz = Math.sin(a) * r;
    var py = W.terrainH(x + px, z + pz) - y + 0.1;
    pos.push(px, py, pz, px, py + h, pz);
    col.push(1, 1, 1, 0, 0, 0);
  }
  for (i = 0; i < segs; i++) { var k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
};
// 贴地的圆盘：中心颜色 c0，边缘颜色 c1（加法混合的光晕或正片叠底的焦痕）
MX.discGeo = function (x, y, z, r, c0, c1, segs) {
  var pos = [0, W.terrainH(x, z) - y + 0.09, 0], col = [], idx = [];
  var a0 = new THREE.Color(c0), a1 = new THREE.Color(c1);
  col.push(a0.r, a0.g, a0.b);
  for (var i = 0; i <= segs; i++) {
    var a = i / segs * TAU, px = Math.cos(a) * r, pz = Math.sin(a) * r;
    pos.push(px, W.terrainH(x + px, z + pz) - y + 0.09, pz);
    col.push(a1.r, a1.g, a1.b);
    if (i < segs) idx.push(0, i + 2, i + 1);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
};

// ---------------- 方块粒子（烟会往上飘，火星往下掉） ----------------
MX._m = new THREE.Matrix4(); MX._q = new THREE.Quaternion(); MX._e = new THREE.Euler(); MX._v = new THREE.Vector3(); MX._s = new THREE.Vector3(); MX._c = new THREE.Color();
MX.P_CAP = 240;
MX.partsInit = function () {
  if (MX.partMesh || !Game.scene) return;
  var m = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), MX.P_CAP);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  var white = new THREE.Color(1, 1, 1);
  for (var i = 0; i < MX.P_CAP; i++) m.setColorAt(i, white);   // 先填满颜色再把 count 设为 0
  m.count = 0;
  m.frustumCulled = false;
  Game.scene.add(m);
  MX.partMesh = m;
};
// g：重力（负数往下掉，正数往上飘）
MX.part = function (x, y, z, vx, vy, vz, life, s0, s1, color, g) {
  if (MX.plist.length >= MX.P_CAP) MX.plist.shift();
  MX.plist.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, t: 0, s0: s0, s1: s1, c: color, g: g || 0, rot: Math.random() * 3 });
};
MX.smoke = function (x, y, z, n, color, spread, size) {
  for (var i = 0; i < n; i++) MX.part(x + rand(-spread, spread), y + rand(0, spread * 0.5), z + rand(-spread, spread), rand(-0.6, 0.6), rand(0.8, 2.2), rand(-0.6, 0.6), rand(1.2, 2.2), size * rand(0.6, 1), size * rand(1.4, 2.2), color, 0.6);
};
MX.sparks = function (x, y, z, n, colors, speed, size) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, s = rand(0.3, 1) * speed;
    MX.part(x, y, z, Math.cos(a) * s, rand(1, 4) + speed * 0.3, Math.sin(a) * s, rand(0.3, 0.6), size, size * 0.3, pick(colors), -14);
  }
};
MX.updateParts = function (dt) {
  if (!MX.partMesh) return;
  var list = MX.plist, n = 0, w = 0;
  for (var i = 0; i < list.length; i++) {
    var p = list[i];
    p.t += dt;
    if (p.t >= p.life) continue;
    list[w++] = p;
    p.vy += p.g * dt;
    var drag = Math.exp(-dt * 1.5);
    p.vx *= drag; p.vz *= drag;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    var k = p.t / p.life, s = lerp(p.s0, p.s1, k) * (k > 0.75 ? (1 - k) * 4 : 1);
    MX._e.set(p.rot + p.t * 2, p.rot, 0);
    MX._q.setFromEuler(MX._e);
    MX._s.set(s, s, s);
    MX._v.set(p.x, p.y, p.z);
    MX._m.compose(MX._v, MX._q, MX._s);
    MX.partMesh.setMatrixAt(n, MX._m);
    MX.partMesh.setColorAt(n, MX._c.set(p.c));
    n++;
  }
  list.length = w;
  MX.partMesh.count = n;
  MX.partMesh.instanceMatrix.needsUpdate = true;
  if (MX.partMesh.instanceColor) MX.partMesh.instanceColor.needsUpdate = true;
};

// ---------------- 临时效果（光柱、焦痕） ----------------
MX.addFx = function (mesh, life, fn, mat) {
  Game.scene.add(mesh);
  MX.fx.push({ mesh: mesh, t: 0, life: life, fn: fn, mat: mat || null });
};
MX.updateFx = function (dt) {
  for (var i = MX.fx.length - 1; i >= 0; i--) {
    var e = MX.fx[i];
    e.t += dt;
    if (e.t >= e.life) { MX.dropFx(e); MX.fx.splice(i, 1); continue; }
    if (e.fn) e.fn(e, e.t / e.life, dt);
  }
};
MX.dropFx = function (e) {
  if (e.mesh.parent) e.mesh.parent.remove(e.mesh);
  if (e.mat) e.mat.dispose();
  if (e.geo) e.geo.dispose();
};
// 从地面升起的光柱
MX.pillar = function (x, y, z, color, r, h, life) {
  var mat = MX.additive(color, 0.9);
  var m = new THREE.Mesh(MX.beamGeo(), mat);
  m.position.set(x, y, z);
  m.frustumCulled = false;
  MX.addFx(m, life, function (e, k) {
    var s = r * (1 + k * 0.5);
    m.scale.set(s, h * Math.min(1, 0.25 + k * 4), s);
    mat.opacity = 0.9 * (1 - k * k);
  }, mat);
  m.scale.set(r, h * 0.25, r);
};
// 爆炸留下的焦痕（正片叠底，边缘柔和），整关都留着
MX.scorch = function (x, y, z, r) {
  var g = MX.discGeo(x, y, z, r, 0x3a3634, 0xffffff, 20);
  var mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.MultiplyBlending, premultipliedAlpha: true, depthWrite: false });
  var m = new THREE.Mesh(g, mat);
  m.position.set(x, y, z);
  m.renderOrder = 2;
  MX.addFx(m, 9999, null, mat);
  MX.fx[MX.fx.length - 1].geo = g;
};

// ---------------- 摆放 ----------------
// 离已有互动物体（含传送门）最近的距离（减去对方大概的大小）
MX.gapTo = function (x, z) {
  var best = 999, list = Interact.list;
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    var d = Math.sqrt(dist2(x, z, o.x, o.z)) - (o.mxFp || (o.kind === 'pot' ? 0.8 : o.kind === 'bossportal' ? 5 : 2));
    if (d < best) best = d;
  }
  return best;
};
// 占地范围里有没有树或石头
MX.blocked = function (x, z, fp) {
  var off = [[0, 0], [fp, 0], [-fp, 0], [0, fp], [0, -fp]];
  for (var k = 0; k < off.length; k++) {
    var list = W.nearby(x + off[k][0], z + off[k][1]);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.kind === 'circle' && dist2(x, z, o.x, o.z) < (o.r * 1.6 + fp + 0.4) * (o.r * 1.6 + fp + 0.4)) return true;
    }
  }
  return false;
};
// 找一块空地：先要求间距和平整（还有 sp.check 的额外条件），找不到就放宽
MX.findSpot = function (sp) {
  var best = null, bestScore = -1e9;
  for (var pass = 0; pass < 3; pass++) {
    for (var t = 0; t < 60; t++) {
      var p = W.randomSpot(sp.minR, W.S - 26);
      if (p.x * p.x + p.z * p.z < sp.minR * sp.minR || Math.abs(p.x) > W.S - 22 || Math.abs(p.z) > W.S - 22) continue;
      if (pass < 2 && (!W.freeSpot(p.x, p.z, sp.fp + 1) || MX.blocked(p.x, p.z, sp.fp))) continue;
      var h0 = W.terrainH(p.x, p.z), lo = h0, hi = h0;
      for (var k = 0; k < 8; k++) {
        var a = k / 8 * TAU, h = W.terrainH(p.x + Math.cos(a) * sp.fp, p.z + Math.sin(a) * sp.fp);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
      var gap = MX.gapTo(p.x, p.z), y = h0 - (h0 - lo) * (sp.sink || 0);
      if (pass < 2 && sp.check && !sp.check(p.x, p.z, y)) continue;
      if (pass === 0 && gap >= sp.gap && hi - lo <= sp.flat) return { x: p.x, z: p.z, y: y };
      var score = Math.min(gap, sp.gap) - (hi - lo) * 5;
      if (score > bestScore) { bestScore = score; best = { x: p.x, z: p.z, y: y }; }
    }
    if (best && pass >= 1) return best;
  }
  return best || { x: sp.minR + 5, z: 0, y: W.terrainH(sp.minR + 5, 0) };
};
// 正面（+Z）朝向地图中心
MX.faceCenter = function (s) { return Math.atan2(-s.x, -s.z); };
MX.addKind = function (kind, s, idx, extra) {
  var ex = extra || {};
  if (ex.rotY == null) ex.rotY = MX.faceCenter(s);
  ex.idx = idx;
  ex.mxFp = MX.SPOT[kind].fp;
  return Interact.add(kind, s.x, s.z, s.y, ex);
};
// 圆形碰撞体（矮的可以踩上去，高的挡路）；换关时世界网格会整个重建
MX.collide = function (x, z, r, top) {
  var c = { kind: 'circle', x: x, z: z, r: r, top: top };
  W.circles.push(c);
  W.addCollider(c, x - r, x + r, z - r, z + r);
};

MX.populate = function () {
  MX.lateInstall();
  MX.reset();
  MX.ORDER.forEach(function (kind) {
    if (kind === 'waystone') { MX.placeStones(); return; }
    if (kind === 'powderkeg') { MX.placeKegs(); return; }
    for (var i = 0; i < MX.COUNTS[kind]; i++) MX.addKind(kind, MX.findSpot(MX.SPOT[kind]), i);
  });
};
// 火药桶：大部分分散开，最后 3 堆围着第 4 堆摆成一个能连锁爆炸的大陷阱
MX.KEG_CLUSTER = 3;
MX.placeKegs = function () {
  var n = MX.COUNTS.powderkeg, single = n - MX.KEG_CLUSTER, anchor = null;
  for (var i = 0; i < n; i++) {
    var s = null;
    if (i >= single && anchor) s = MX.spotNear(anchor, 5, 7);
    if (!s) s = MX.findSpot(MX.SPOT.powderkeg);
    var o = MX.addKind('powderkeg', s, i);
    if (i === single - 1) anchor = o;
  }
};
// 在 c 附近 r0~r1 米找一块没有树石的空地（找不到返回 null）
MX.spotNear = function (c, r0, r1) {
  for (var t = 0; t < 30; t++) {
    var a = Math.random() * TAU, r = rand(r0, r1), x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
    if (x * x + z * z < 22 * 22 || Math.abs(x) > W.S - 22 || Math.abs(z) > W.S - 22) continue;
    if (!W.freeSpot(x, z, 2) || MX.blocked(x, z, 1.3) || MX.gapTo(x, z) < 3.5) continue;
    var h0 = W.terrainH(x, z);
    return { x: x, z: z, y: h0 - 0.1 };
  }
  return null;
};
// 传送石：两对，同一对的两块尽量离远一点
MX.placeStones = function () {
  for (var pr = 0; pr < MX.COUNTS.waystone / 2; pr++) {
    var a = MX.findSpot(MX.SPOT.waystone);
    var b = null, bd = -1;
    for (var t = 0; t < 14; t++) {
      var c = MX.findSpot(MX.SPOT.waystone);
      var d = dist2(a.x, a.z, c.x, c.z);
      if (d > bd) { bd = d; b = c; }
      if (d > 85 * 85) break;
    }
    var o1 = MX.addKind('waystone', a, pr * 2, { pair: pr });
    var o2 = MX.addKind('waystone', b, pr * 2 + 1, { pair: pr });
    o1.partner = o2; o2.partner = o1;
  }
};

// ============================================================
//  每帧更新（包在 Interact.update 后面，只在游戏进行中调用）
// ============================================================
MX.update = function (dt) {
  MX.partsInit();
  MX.updateMount(dt);
  MX.updateWarm(dt);
  MX.updateTurrets(dt);
  MX.updateBolts(dt);
  MX.updateFlight(dt);
  for (var i = MX.anims.length - 1; i >= 0; i--) {
    var a = MX.anims[i];
    if (a.fn(a.o, dt, a) === false) MX.anims.splice(i, 1);
  }
  MX.updateFx(dt);
  MX.updateParts(dt);
  MX.camLift = lerp(MX.camLift, MX.mount ? 0.85 : 0, Math.min(1, dt * 4));
  if (MX.camLift < 0.002) MX.camLift = 0;
  // 战旗占领中：下一帧刷怪加快
  MX.spawnBoost = MX.capturing ? 0.5 : 0;
  MX.capturing = false;
  MX.shown = MX.progress;
  MX.progress = null;
};

// 清掉所有状态：换关、重开、回主菜单时调用（可以重复调用）
MX.reset = function () {
  if (MX.mount) MX.dismount(true);
  MX.warmT = 0;
  MX.turrets.length = 0;
  MX.bolts.length = 0;
  MX.flyT = 0;
  MX.spawnBoost = 0;
  MX.capturing = false;
  MX.progress = null;
  MX.shown = null;
  MX.nearStone = null;
  MX.smithRef = null;
  MX.anims.length = 0;
  MX.trampled.clear();
  for (var i = 0; i < MX.fx.length; i++) MX.dropFx(MX.fx[i]);
  MX.fx.length = 0;
  MX.plist.length = 0;
  if (MX.partMesh) MX.partMesh.count = 0;
  if (MX.boltMesh) { MX.boltMesh.count = 0; MX.trailMesh.count = 0; }
  MX.camLift = 0;
};

// ---------------- 「温暖」：每秒回复 2% 最大生命 ----------------
MX.updateWarm = function (dt) {
  if (MX.warmT <= 0) return;
  MX.warmT = Math.max(0, MX.warmT - dt);
  if (!P.alive) return;
  P.regenAcc += P.st.maxHp * 0.02 * dt;
  if (Math.random() < dt * 5) {
    var a = Math.random() * TAU;
    MX.part(P.pos.x + Math.cos(a) * 0.6, P.pos.y + rand(0.3, 1.4), P.pos.z + Math.sin(a) * 0.6, 0, rand(0.8, 1.6), 0, 0.9, 0.12, 0.05, pick([0xffb050, 0xffd27a, 0xff8a3a]), 0.5);
  }
};

// ============================================================
//  战马：骑乘、步伐动画、践踏
// ============================================================
MX.HS = 1.0;   // 战马整体缩放
MX.HORSE = { coat: 0xd6cfc2, coat2: 0xeee8de, mane: 0x3a2e26, tail: 0x5e4c3c, hoof: 0x2e2a26, steel: 0xb9c2ce, cloth: 0x2b4fb8, trim: 0xe8b83a, leather: 0x6a4026 };
MX.horseParts = function (name) {
  var H = MX.HORSE, T = MX.tiles(), p = [];
  if (name === 'body') {
    p = [
      // 躯干、胸、臀（毛色露出来，轮廓才像马）
      ['mxcyl', [0.39, 0.41, 1.4, 8], [0, 1.16, -0.02], H.coat, [Math.PI / 2, 0, 0], [1, 1, 1.14], 'fur'],
      ['dodec', [0.45], [0, 1.22, 0.66], H.coat, null, [0.9, 1, 0.95], 'fur'],
      ['dodec', [0.47], [0, 1.24, -0.7], H.coat, null, [0.95, 1, 1], 'fur'],
      mxB(0.5, 0.36, 0.5, 0, 0.92, 0.62, H.coat, 'fur'), mxB(0.56, 0.4, 0.5, 0, 0.98, -0.68, H.coat, 'fur'),
      // 鞍褥：两侧下摆往外张开，金边、白十字
      mxB(0.06, 0.74, 1.25, -0.45, 1.2, -0.06, H.cloth, T.canvas, [0, 0, -0.1]), mxB(0.06, 0.74, 1.25, 0.45, 1.2, -0.06, H.cloth, T.canvas, [0, 0, 0.1]),
      mxB(0.9, 0.06, 1.25, 0, 1.6, -0.06, H.cloth, T.canvas),
      mxB(0.08, 0.08, 1.29, -0.49, 0.84, -0.06, H.trim, 'gold'), mxB(0.08, 0.08, 1.29, 0.49, 0.84, -0.06, H.trim, 'gold'),
      mxB(0.04, 0.46, 0.12, -0.49, 1.22, -0.06, 0xf2efe6, 'plain', [0, 0, -0.1]), mxB(0.04, 0.12, 0.4, -0.5, 1.3, -0.06, 0xf2efe6, 'plain', [0, 0, -0.1]),
      mxB(0.04, 0.46, 0.12, 0.49, 1.22, -0.06, 0xf2efe6, 'plain', [0, 0, 0.1]), mxB(0.04, 0.12, 0.4, 0.5, 1.3, -0.06, 0xf2efe6, 'plain', [0, 0, 0.1]),
      // 后鞧：搭在臀部的蓝布 + 金色流苏
      mxB(0.86, 0.06, 0.5, 0, 1.68, -0.82, H.cloth, T.canvas, [-0.25, 0, 0]), mxB(0.08, 0.38, 0.1, -0.4, 1.45, -0.95, H.trim, 'gold'), mxB(0.08, 0.38, 0.1, 0.4, 1.45, -0.95, H.trim, 'gold'),
      // 胸甲（三块拼成弧面）
      mxB(0.42, 0.52, 0.08, 0, 1.12, 1.1, H.steel, 'metal'), mxB(0.3, 0.52, 0.08, -0.3, 1.12, 1.01, H.steel, 'metal', [0, -0.6, 0]), mxB(0.3, 0.52, 0.08, 0.3, 1.12, 1.01, H.steel, 'metal', [0, 0.6, 0]),
      mxB(0.44, 0.07, 0.1, 0, 1.39, 1.11, H.trim, 'gold'), mxB(0.1, 0.5, 0.1, 0, 1.12, 1.15, H.trim, 'gold'),
      // 马鞍（座位顶部约 1.74）、马镫
      mxB(0.58, 0.12, 0.62, 0, 1.68, -0.04, H.leather, 'noise'), mxB(0.56, 0.26, 0.1, 0, 1.8, -0.34, H.leather, 'noise'),
      mxB(0.3, 0.2, 0.1, 0, 1.77, 0.28, H.leather, 'noise'), mxB(0.58, 0.05, 0.1, 0, 1.94, -0.34, H.trim, 'gold'),
      mxB(0.03, 0.5, 0.05, -0.54, 1.44, 0.04, 0x2a2018, 'plain', [0, 0, 0.12]), mxB(0.03, 0.5, 0.05, 0.54, 1.44, 0.04, 0x2a2018, 'plain', [0, 0, -0.12]),
      mxB(0.16, 0.05, 0.14, -0.57, 1.17, 0.06, H.steel, 'metal'), mxB(0.16, 0.05, 0.14, 0.57, 1.17, 0.06, H.steel, 'metal')
    ];
    // 身体组的支点在离地 1.15 处
    p = p.map(function (q) { q = q.slice(); q[2] = [q[2][0], q[2][1] - 1.15, q[2][2]]; return q; });
  } else if (name === 'neck') {
    p = [
      // 脖子（几乎竖着往前上方伸）+ 鬃毛 + 钢片护颈
      ['mxbox', [0.28, 0.98, 0.46], [0, 0.36, 0.17], H.coat, [0.45, 0, 0], null, 'fur'],
      ['mxbox', [0.1, 1.02, 0.14], [0, 0.46, -0.06], H.mane, [0.45, 0, 0], null, 'fur'],
      ['mxbox', [0.32, 0.3, 0.12], [0, 0.22, -0.02], H.steel, [0.45, 0, 0], null, 'metal'], ['mxbox', [0.32, 0.3, 0.12], [0, 0.52, 0.12], H.steel, [0.45, 0, 0], null, 'metal'],
      ['mxbox', [0.34, 0.05, 0.14], [0, 0.07, -0.08], H.trim, [0.45, 0, 0], null, 'gold'],
      // 头（鼻子朝下）、口鼻、眼睛、耳朵
      ['mxbox', [0.29, 0.33, 0.62], [0, 0.72, 0.6], H.coat, [0.75, 0, 0], null, 'fur'],
      ['mxbox', [0.26, 0.26, 0.26], [0, 0.52, 0.8], H.coat2, [0.75, 0, 0], null, 'fur'],
      mxB(0.05, 0.07, 0.09, -0.155, 0.78, 0.56, 0x111111, 'plain'), mxB(0.05, 0.07, 0.09, 0.155, 0.78, 0.56, 0x111111, 'plain'),
      mxK(0.07, 0.22, 4, -0.09, 1.0, 0.38, H.coat, 'fur', [-0.3, 0, 0]), mxK(0.07, 0.22, 4, 0.09, 1.0, 0.38, H.coat, 'fur', [-0.3, 0, 0]),
      // 面甲 + 红羽
      mxB(0.32, 0.08, 0.5, 0, 0.86, 0.66, H.steel, 'metal', [0.75, 0, 0]), mxB(0.06, 0.06, 0.48, 0, 0.9, 0.67, H.trim, 'gold', [0.75, 0, 0]),
      mxB(0.07, 0.36, 0.2, 0, 1.12, 0.34, 0xd9333a, 'cloth', [-0.25, 0, 0]),
      // 笼头 + 嚼子两边的铁环
      mxB(0.31, 0.05, 0.05, 0, 0.56, 0.76, 0x2a2018, 'plain', [0.75, 0, 0]),
      mxB(0.04, 0.08, 0.08, -0.16, 0.52, 0.8, H.steel, 'metal'), mxB(0.04, 0.08, 0.08, 0.16, 0.52, 0.8, H.steel, 'metal')
    ];
  } else if (name === 'reins') {
    // 拴着时搭在脖子上的缰绳（骑上去以后换成连到骑手手里的两根）
    p = [mxB(0.035, 0.035, 1.0, -0.16, 0.3, 0.35, 0x2a2018, 'plain', [-0.45, 0, 0]), mxB(0.035, 0.035, 1.0, 0.16, 0.3, 0.35, 0x2a2018, 'plain', [-0.45, 0, 0])];
  } else if (name === 'rein') {
    // 一根单位长度的缰绳（沿 +Z 从 0 到 1），每帧拉伸到骑手手里
    p = [mxB(0.04, 0.03, 1.0, 0, 0, 0.5, 0x2a2018, 'plain')];
  } else if (name === 'tail') {
    // 尾巴：短尾根 + 一大把蓬松的长毛（扁一点，像一束马毛）
    p = [mxC(0.065, 0.08, 0.28, 5, 0, -0.1, 0, H.mane, 'fur'),
      mxC(0.08, 0.15, 0.42, 5, 0, -0.43, -0.02, H.tail, 'fur', null, [1, 1, 0.72]), mxC(0.15, 0.1, 0.28, 5, 0, -0.77, -0.03, H.tail, 'fur', null, [1, 1, 0.72]),
      mxK(0.1, 0.2, 5, 0, -1.0, -0.04, H.tail, 'fur', [Math.PI, 0, 0], [1, 1, 0.72])];
  } else if (name === 'legF') {
    p = [mxB(0.19, 0.52, 0.26, 0, -0.2, 0, H.coat, 'fur'), mxB(0.12, 0.42, 0.14, 0, -0.64, 0.01, H.coat2, 'fur'), mxB(0.15, 0.1, 0.17, 0, -0.88, 0.02, H.coat2, 'fur'), mxB(0.16, 0.1, 0.2, 0, -0.96, 0.04, H.hoof, 'plain')];
  } else if (name === 'legH') {
    p = [mxB(0.21, 0.56, 0.34, 0, -0.2, -0.04, H.coat, 'fur'), mxB(0.12, 0.44, 0.14, 0, -0.66, 0.0, H.coat2, 'fur'), mxB(0.15, 0.1, 0.17, 0, -0.9, 0.02, H.coat2, 'fur'), mxB(0.16, 0.1, 0.2, 0, -0.98, 0.04, H.hoof, 'plain')];
  }
  return p;
};
// 一匹可以动的马：身体（起伏、俯仰）+ 脖子头 + 尾巴 + 四条腿（左前、右前、左后、右后）
MX.buildHorse = function () {
  var rig = new THREE.Group();
  rig.rotation.order = 'YXZ';
  rig.scale.setScalar(MX.HS);
  var body = new THREE.Group();
  body.position.y = 1.15;
  rig.add(body);
  var g = function (n) { return MX.geo('horse_' + n, function () { return MX.horseParts(n); }); };
  body.add(MX.mesh(g('body')));
  var neck = new THREE.Group(); neck.position.set(0, 1.5 - 1.15, 0.78); body.add(neck);
  neck.add(MX.mesh(g('neck')));
  var reinIdle = MX.mesh(g('reins'));
  neck.add(reinIdle);
  // 骑乘时的两根缰绳（马嚼子 → 骑手的手），挂在 rig 上，每帧摆放
  var reins = [MX.mesh(g('rein')), MX.mesh(g('rein'))];
  reins.forEach(function (r) { r.visible = false; rig.add(r); });
  var tail = new THREE.Group(); tail.position.set(0, 1.4 - 1.15, -1.12); body.add(tail);
  tail.add(MX.mesh(g('tail')));
  var legs = [];
  [[-0.21, 1.0, 0.64, 'legF'], [0.21, 1.0, 0.64, 'legF'], [-0.21, 1.02, -0.7, 'legH'], [0.21, 1.02, -0.7, 'legH']].forEach(function (d) {
    var piv = new THREE.Group();
    piv.position.set(d[0], d[1] - 1.15, d[2]);
    piv.add(MX.mesh(g(d[3])));
    body.add(piv);
    legs.push(piv);
  });
  return { rig: rig, body: body, neck: neck, tail: tail, legs: legs, reinIdle: reinIdle, reins: reins, ang: [0, 0, 0, 0], ph: 0, bob: 0, pitch: 0, neckX: 0, tailX: 0.4, t: Math.random() * 10 };
};
// 步伐动画：idle 站着（会低头吃草）、小跑、飞奔、空中收腿
MX.animHorse = function (h, dt, spd, air, graze) {
  h.t += dt;
  var tg = [0, 0, 0, 0], bob = 0, pitch = 0, neckX = 0, tailX = 0.22;
  if (air) {
    tg = [-1.0, -0.85, 0.9, 0.75]; pitch = -0.1; neckX = -0.2; tailX = 0.85;
  } else if (spd > 0.8) {
    var gallop = spd > 7;
    h.ph += dt * TAU * (gallop ? 1.5 + spd * 0.065 : 1.1 + spd * 0.2);
    var A = gallop ? 0.78 : 0.5, off = gallop ? [0.42, 0.55, 0, 0.12] : [0, 0.5, 0.5, 0];
    for (var i = 0; i < 4; i++) tg[i] = Math.sin(h.ph + off[i] * TAU) * A;
    bob = gallop ? Math.sin(h.ph - 0.4) * 0.09 : Math.abs(Math.sin(h.ph)) * 0.05;
    pitch = gallop ? Math.sin(h.ph + 1.1) * 0.07 : 0;
    neckX = gallop ? -0.14 - Math.sin(h.ph + 1.9) * 0.12 : -0.05 + Math.sin(h.ph * 2) * 0.04;
    tailX = gallop ? 0.42 + Math.sin(h.ph * 2) * 0.08 : 0.32;
  } else {
    // 站着：轻轻点头，偶尔低头吃草，换一下蹄子
    neckX = Math.sin(h.t * 1.4) * 0.04 + (graze ? Math.pow(Math.max(0, Math.sin(h.t * 0.3)), 3) * 0.55 : 0);
    tg[Math.floor(h.t / 3) % 4] = Math.max(0, Math.sin(h.t * TAU / 3)) * -0.25;
  }
  var k = Math.min(1, dt * 14);
  for (i = 0; i < 4; i++) { h.ang[i] = lerp(h.ang[i], tg[i], k); h.legs[i].rotation.x = h.ang[i]; }
  h.bob = lerp(h.bob, bob, k);
  h.pitch = lerp(h.pitch, pitch, k);
  h.neckX = lerp(h.neckX, neckX, Math.min(1, dt * 6));
  h.tailX = lerp(h.tailX, tailX, Math.min(1, dt * 6));
  h.body.position.y = 1.15 + h.bob;
  h.body.rotation.x = h.pitch;
  h.neck.rotation.x = h.neckX;
  h.tail.rotation.x = h.tailX;
  h.tail.rotation.z = Math.sin(h.t * 2.3) * 0.14;
};

MX.mountHorse = function (o) {
  if (MX.mount || !P.alive) return;
  if (typeof Ride !== 'undefined') Ride.forceOff();   // 滑铲坐骑立刻收起，藏起来的盾、剑、背包拿回来
  o.used = true;
  var h = o.horse;
  if (h.rig.parent) h.rig.parent.remove(h.rig);
  Game.scene.add(h.rig);
  h.rig.position.copy(P.pos);
  h.rig.rotation.set(0, P.facing, 0);
  h.reinIdle.visible = false;
  MX.mount = { h: h, o: o, t: 45, max: 45, slope: 0, lift: 0 };
  FX.burst(P.pos.x, P.pos.y + 0.6, P.pos.z, 16, 0xd8c8a0, 5, 0.3);
  FX.ring(P.pos.x, P.pos.y, P.pos.z, 3, 0xe8b83a, 0.4);
  UI.toast('骑上战马！45 秒内加速冲锋、践踏敌人', Kit.color('gold'));
};

MX.dismount = function (quiet) {
  var m = MX.mount;
  if (!m) return;
  MX.mount = null;
  if (m.h.rig.parent) m.h.rig.parent.remove(m.h.rig);
  m.h.reins.forEach(function (r) { r.visible = false; });
  m.h.reinIdle.visible = true;
  MX.unposeRider();
  if (!quiet) {
    FX.burst(P.pos.x, P.pos.y + 1, P.pos.z, 20, 0xe8e0d0, 5, 0.3);
    MX.smoke(P.pos.x, P.pos.y + 0.5, P.pos.z, 12, 0xcfc7bb, 1.0, 0.45);
    UI.toast('战马跑累了，自己回马厩了', Kit.color('goldL'));
  }
};

// ---------------- 骑姿（角色骨骼：pelvis 骨盆 / chest 上身 / head / armL foreL armR foreR / legL shinL legR shinR / cape / tail） ----------------
// 每帧在 P.animate 之后覆盖这一帧的姿势；下马后 P.animate 照常摆姿势，就恢复了正常动作
// 马身体组坐标（原点离地 1.15）里的几个点：座位、脚踝（踩马镫）、握缰绳的手；左边是 +X
MX.SEAT = new THREE.Vector3(0, 0.59, -0.08);
MX.STIR = [new THREE.Vector3(0.57, 0.1, 0.0), new THREE.Vector3(-0.57, 0.1, 0.0)];
MX.GRIP = [new THREE.Vector3(0.13, 0.79, 0.4), new THREE.Vector3(-0.13, 0.79, 0.4)];
// 马嚼子（脖子组坐标）
MX.BIT = [new THREE.Vector3(0.18, 0.52, 0.8), new THREE.Vector3(-0.18, 0.52, 0.8)];
// 关节往哪边弯：膝盖朝前、朝外；手肘朝外、朝后
MX.POLE_LEG = [new THREE.Vector3(0.7, 0.6, 1), new THREE.Vector3(-0.7, 0.6, 1)];
MX.POLE_ARM = [new THREE.Vector3(1, -0.35, -0.55), new THREE.Vector3(-1, -0.35, -0.55)];
MX._rv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
MX._ik = { u: new THREE.Vector3(), v: new THREE.Vector3(), d1: new THREE.Vector3(), d2: new THREE.Vector3(), x: new THREE.Vector3(), y: new THREE.Vector3(), z: new THREE.Vector3(), m: new THREE.Matrix4() };
MX.ZAXIS = new THREE.Vector3(0, 0, 1);

// 两节骨骼 IK（都在 bone 的父骨骼坐标里）：关节在 bone.position，末端去 tgt，两节长 a、b，pole 是关节鼓出去的方向。
// 写入 bone.quaternion，返回第二节绕 X 轴的转角（sign = 1：腿，小腿往后弯；sign = -1：胳膊，小臂往前弯）
MX.ik2 = function (bone, tgt, a, b, pole, sign) {
  var T = MX._ik, u = T.u.subVectors(tgt, bone.position), d = u.length();
  if (d < 1e-5) u.set(0, -1, 0); else u.divideScalar(d);
  d = clamp(d, Math.abs(a - b) + 0.002, a + b - 0.002);
  var v = T.v.copy(pole).addScaledVector(u, -pole.dot(u));
  if (v.lengthSq() < 1e-8) v.set(0, 0, 1).addScaledVector(u, -u.z);
  v.normalize();
  var ca = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1);
  var d1 = T.d1.copy(u).multiplyScalar(ca).addScaledVector(v, Math.sqrt(1 - ca * ca));
  var d2 = T.d2.copy(u).multiplyScalar(d).addScaledVector(d1, -a).divideScalar(b);
  var cs = clamp(d1.dot(d2), -1, 1), z = T.z;
  // 骨骼自己的坐标轴：-Y 沿着第一节，Z 是弯曲平面里“正面”的方向
  if (sign > 0) z.copy(d1).multiplyScalar(cs).sub(d2); else z.copy(d2).addScaledVector(d1, -cs);
  if (z.lengthSq() < 1e-10) z.copy(v).multiplyScalar(sign);
  z.normalize();
  var y = T.y.copy(d1).negate();
  T.m.makeBasis(T.x.crossVectors(y, z), y, z);
  bone.quaternion.setFromRotationMatrix(T.m);
  return sign * Math.acos(cs);
};

// 骑姿：骨盆坐进马鞍，两腿跨在马身两侧踩着马镫，上身微微前倾，两手往前握着缰绳
MX.poseRider = function (m) {
  var md = P.model, u = P.body && P.body.userData, h = m.h;
  if (!md || !u || !u.bones) return;
  var b = u.bones, B = u.B, d = u.def || {}, sc = P.body.scale.y || 1, V = MX._rv, i;
  h.rig.updateMatrixWorld(true);
  // 1. 外层模型整体抬到马鞍高度（脚下的血条在画面刷新时放回地面），骨盆再挪到座位正上方
  var S = h.body.localToWorld(V[0].copy(MX.SEAT));
  var hip = B.off.pelvis[1], lift = S.y + 0.1 * sc - hip * sc - P.pos.y;
  m.lift = lift;
  md.position.set(P.pos.x, P.pos.y + lift, P.pos.z);
  var c = Math.cos(P.facing), s = Math.sin(P.facing), dx = (S.x - P.pos.x) / sc, dz = (S.z - P.pos.z) / sc;
  b.pelvis.position.set(dx * c - dz * s, hip, dx * s + dz * c);
  // 2. 跟着马俯仰；跑得越快上身越往前压，头抬起来看前方；披风往后飘，尾巴搭在马背上
  var pitch = h.rig.rotation.x + h.pitch, k = clamp(P.speed() / 14, 0, 1);
  var lean = 0.08 + 0.2 * k + (d.hunch || 0) * 0.5;
  b.pelvis.rotation.set(pitch - 0.05, 0, 0);
  b.chest.rotation.set(lean - h.pitch * 0.6 + Math.sin(h.ph * 2) * 0.03 * k, 0, 0);
  b.head.rotation.set(-lean * 0.8 - pitch * 0.4, 0, 0);
  // 披风相对上身再往后掀：站着时搭在马屁股上，飞奔时稍微飘起来
  if (!d.capeSpin) b.cape.rotation.set(0.8 - 0.06 * k + Math.sin(h.t * 9) * 0.06 * k, 0, 0);
  b.tail.rotation.set(d.float ? 0.45 : 1.15, 0, 0);
  md.updateMatrixWorld(true);
  // 3. 腿：脚踝放到马镫上（膝盖朝前、朝外）
  for (i = 0; i < 2; i++) {
    var F = b.pelvis.worldToLocal(h.body.localToWorld(V[1].copy(MX.STIR[i])));
    (i ? b.shinR : b.shinL).rotation.x = MX.ik2(i ? b.legR : b.legL, F, B.thigh, B.shin, MX.POLE_LEG[i], 1);
  }
  // 4. 胳膊：两手往前握住缰绳，跟着马头的起伏前后送一点
  var sway = Math.sin(h.ph + 0.6) * 0.05 * k;
  for (i = 0; i < 2; i++) {
    var G = V[2].copy(MX.GRIP[i]);
    G.z += sway;
    b.chest.worldToLocal(h.body.localToWorld(G));
    var arm = i ? b.armR : b.armL, fore = i ? b.foreR : b.foreL;
    fore.rotation.set(MX.ik2(arm, G, B.upper, B.fore + 0.06, MX.POLE_ARM[i], -1), 0, 0);
    // 5. 缰绳：马嚼子 → 手心
    arm.updateMatrixWorld(true);
    var hand = fore.localToWorld(V[3].set(0, -B.fore - 0.06, 0.01));
    var bit = h.neck.localToWorld(V[1].copy(MX.BIT[i]));
    MX.placeRein(h.reins[i], h.rig.worldToLocal(bit), h.rig.worldToLocal(hand));
  }
};
// 把单位长度的缰绳从 a 拉到 b（rig 坐标）
MX.placeRein = function (r, a, b) {
  var dir = MX._ik.u.subVectors(b, a), L = dir.length();
  r.visible = L > 0.05;
  if (!r.visible) return;
  r.position.copy(a);
  r.quaternion.setFromUnitVectors(MX.ZAXIS, dir.divideScalar(L));
  r.scale.set(1, 1, L);
};
// 下马：外层模型回到脚下、骨盆回原位，马上按正常动作摆一次姿势
MX.unposeRider = function () {
  var md = P.model, u = P.body && P.body.userData;
  if (!md) return;
  md.position.copy(P.pos);
  if (u && u.bones) {
    var o = u.B.off.pelvis;
    u.bones.pelvis.position.set(o[0], o[1], o[2]);
  }
  if (P.anim) P.animate(0);
};
// 骑马时：脚下的血条放回地面、挪到马屁股后面一点（不压在马身上）
MX.riderHpBar = function (cam) {
  var m = MX.mount, bar = P.hpBar;
  if (!m || !bar || !P.model || !bar.visible) return;
  var dx = cam.position.x - P.pos.x, dz = cam.position.z - P.pos.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
  bar.position.set(dx / dl * 1.6, 0.1 - (P.model.position.y - P.pos.y), dz / dl * 1.6);
};

MX.updateMount = function (dt) {
  var m = MX.mount;
  if (!m || !P.alive) return;
  m.t -= dt;
  if (m.t <= 0) { MX.dismount(false); return; }
  var h = m.h, rig = h.rig, spd = P.speed(), air = !P.onGround;
  rig.position.set(P.pos.x, P.pos.y, P.pos.z);
  rig.rotation.y = P.facing;
  // 顺着坡俯仰：比较前后的地面高度
  var fx = Math.sin(P.facing), fz = Math.cos(P.facing), slope = 0;
  if (!air) {
    var hf = W.groundAt(P.pos.x + fx, P.pos.z + fz, P.pos.y + 1), hb = W.groundAt(P.pos.x - fx, P.pos.z - fz, P.pos.y + 1);
    slope = clamp(Math.atan2(hb - hf, 2), -0.35, 0.35);
  }
  m.slope = lerp(m.slope, slope, Math.min(1, dt * 8));
  rig.rotation.x = m.slope;
  MX.animHorse(h, dt, spd, air, false);
  if (!air && spd > 8 && Math.random() < dt * 14) MX.part(P.pos.x - fx * 1.0 + rand(-0.3, 0.3), P.pos.y + 0.1, P.pos.z - fz * 1.0 + rand(-0.3, 0.3), -fx * 2, rand(0.5, 1.5), -fz * 2, 0.6, 0.25, 0.5, 0x9a8a6a, 0.3);
  MX.trample(spd);
  MX.poseRider(m);
};

// 践踏：碰到的敌人受伤并被撞开（每个敌人 0.5 秒最多一次）
MX.trample = function (spd) {
  if (spd < 3) return;
  if (MX.trampled.size > 600) MX.trampled.clear();
  var fx = Math.sin(P.facing), fz = Math.cos(P.facing), now = Game.time;
  var dmg = 15 * MX.sf() * P.st.damage;
  Enemies.inRadius(P.pos.x + fx * 0.6, P.pos.z + fz * 0.6, 1.3, function (e) {
    if (Math.abs(e.y - P.pos.y) > 2.2) return;
    var last = MX.trampled.get(e.id);
    if (last !== undefined && now - last < 0.5 && now >= last) return;
    MX.trampled.set(e.id, now);
    var dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    Enemies.damage(e, dmg, 0, (dx / d * 0.7 + fx * 0.7) * 16, (dz / d * 0.7 + fz * 0.7) * 16);
    if (e.alive && !e.boss && !e.mini && !e.def.flyer && e.grounded) { e.vy = 6.5; e.grounded = false; }
    FX.burst(e.x, e.y + 0.4, e.z, 3, 0xd8c8a0, 4, 0.25);
  });
};

// ============================================================
//  投石跳台：弹射飞行中的空中转向，落地冲击波
// ============================================================
MX.launch = function (o) {
  var yaw = P.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), hs = 26, vy = 26;
  // 估算落点（不算地形高低），别飞出地图
  var T = 2 * vy / P.GRAVITY, lim = W.S - 24, k = 1;
  var tx = P.pos.x + fx * hs * T, tz = P.pos.z + fz * hs * T;
  if (Math.abs(tx) > lim && Math.abs(fx) > 0.01) k = Math.min(k, (lim * Math.sign(tx) - P.pos.x) / (fx * hs * T));
  if (Math.abs(tz) > lim && Math.abs(fz) > 0.01) k = Math.min(k, (lim * Math.sign(tz) - P.pos.z) / (fz * hs * T));
  k = clamp(k, 0.04, 1);
  P.vel.set(fx * hs * k, vy, fz * hs * k);
  P.pos.y += 0.25;
  P.onGround = false; P.coyote = 0; P.jumpBuffer = 0; P.sliding = false;
  MX.flyT = 0.001;
  o.cd = 1.5; o.armed = false; o.swingT = 0;
  o.frame.rotation.y = yaw - o.rotY;
  FX.burst(o.x, o.y + 0.5, o.z, 18, 0xd8c8a0, 6, 0.3);
  FX.ring(o.x, o.y + 0.3, o.z, 3.2, 0xb4f03c, 0.35);
  MX.sparks(o.x, o.y + 0.6, o.z, 10, [0xb4f03c, 0xffffff], 5, 0.16);
  Game.shake(0.3);
};
// 摆放投石跳台：朝地图中心（跳台默认的朝向）飞出去的路线上没有挡路的墙、塔、坡道、山坡和低处的树干
MX.flightClear = function (x, z, y0) {
  var a = Math.atan2(-x, -z), fx = Math.sin(a), fz = Math.cos(a);
  for (var d = 2; d <= 46; d += 2) {
    var px = x + fx * d, pz = z + fz * d, fy = y0 + 0.6 + d - d * d / 52;   // 这一点的飞行高度（脚底）
    var g = W.terrainH(px, pz);
    if (g > fy - 0.5) return false;
    var list = W.nearby(px, pz);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.kind === 'circle') {
        if (o.top <= fy || dist2(px, pz, o.x, o.z) > (o.r + 0.9) * (o.r + 0.9)) continue;
        if (fy - g < MX.CANOPY || !MX.isTall(o)) return false;
      } else {
        if (px < o.x0 - 0.9 || px > o.x1 + 0.9 || pz < o.z0 - 0.9 || pz > o.z1 + 0.9) continue;
        if (o.floating && o.bottom > fy + 2) continue;
        if ((o.kind === 'ramp' ? W.rampHeight(o, clamp(px, o.x0, o.x1), clamp(pz, o.z0, o.z1)) : o.top) > fy - 0.4) return false;
      }
    }
  }
  return true;
};
// 弹射飞行中离地 4 米以上就穿过树冠：树（还有灌木、墓碑）的碰撞柱有 20 米高，飞过去会撞上看不见的柱子
// 墙、塔、坡道照样挡；只影响玩家自己的这一次碰撞检测
MX.CANOPY = 4;
MX.isTall = function (o) {
  if (o.mxTall === undefined) o.mxTall = o.kind === 'circle' && o.top - W.terrainH(o.x, o.z) > 15;
  return o.mxTall;
};
(function () {
  var po = W.pushOut, nb = W.nearby, skip = false, buf = [];
  W.pushOut = function (p, r, feetY) {
    if (p !== P.pos || !(MX.flyT > 0) || feetY - W.terrainH(p.x, p.z) < MX.CANOPY) return po(p, r, feetY);
    skip = true;
    try { return po(p, r, feetY); } finally { skip = false; }
  };
  W.nearby = function (x, z) {
    var list = nb(x, z);
    if (!skip) return list;
    buf.length = 0;
    for (var i = 0; i < list.length; i++) if (!MX.isTall(list[i])) buf.push(list[i]);
    return buf;
  };
})();
MX.updateFlight = function (dt) {
  if (MX.flyT <= 0) return;
  MX.flyT += dt;
  if (!P.onGround) {
    // 空中：按住方向键时，水平速度慢慢转向想去的方向（速度大小不变）
    var mx = Input.move.x, my = Input.move.y, hs = Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z);
    if (mx * mx + my * my > 0.04 && hs > 4) {
      var wx = Math.sin(P.yaw) * my - Math.cos(P.yaw) * mx, wz = Math.cos(P.yaw) * my + Math.sin(P.yaw) * mx;
      var cur = Math.atan2(P.vel.x, P.vel.z), want = Math.atan2(wx, wz);
      var d = MX.angDiff(want, cur);
      if (Math.abs(d) < 2.6) {
        var na = cur + clamp(d, -1.6 * dt, 1.6 * dt);
        P.vel.x = Math.sin(na) * hs; P.vel.z = Math.cos(na) * hs;
      }
    }
    // 风的拖尾
    if (Math.random() < dt * 22) MX.part(P.pos.x + rand(-0.3, 0.3), P.pos.y + rand(0.3, 1.5), P.pos.z + rand(-0.3, 0.3), -P.vel.x * 0.05, 0, -P.vel.z * 0.05, 0.35, 0.16, 0.05, 0xeaf6ff, 0);
    if (MX.flyT > 8) MX.flyT = 0;
    return;
  }
  if (MX.flyT > 0.12) {
    // 安全落地：冲击波把周围的敌人推开
    FX.ring(P.pos.x, P.pos.y, P.pos.z, 5, 0xe8f0d0, 0.4);
    FX.burst(P.pos.x, P.pos.y + 0.2, P.pos.z, 16, 0xcfc2a0, 6, 0.3);
    Enemies.nova(P.pos.x, P.pos.z, 5, 0, 18, 0xe8f0d0);
    Game.shake(0.35);
  }
  MX.flyT = 0;
};

// ============================================================
//  友军弩车：自动瞄准最近的敌人，发射穿透的重弩箭
// ============================================================
MX.BOLT_CAP = 32;
MX.boltInit = function () {
  if (MX.boltMesh || !Game.scene) return;
  var parts = (typeof PROJ_MODELS !== 'undefined' && PROJ_MODELS.heavybolt) || [mxB(0.16, 0.16, 1.6, 0, 0, 0, 0x6a4a2a, 'wood')];
  MX.boltMesh = MODEL.instanced(MODEL.build(parts), MX.BOLT_CAP, Game.scene);
  var tg = new THREE.BoxGeometry(0.12, 0.12, 3.2).translate(0, 0, -1.9);
  MX.trailMesh = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }), MX.BOLT_CAP);
  MX.trailMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  MX.trailMesh.count = 0;
  MX.trailMesh.frustumCulled = false;
  Game.scene.add(MX.trailMesh);
};

MX.activateBallista = function (o) {
  o.used = true;
  var t = { o: o, active: 30, fireT: 0.5, aim: o.rotY + o.top.rotation.y, retarget: 0, target: null, kills: 0, recoil: 0, raise: 0 };
  MX.turrets.push(t);
  o.allyRing.visible = true;
  o.crest.visible = true;
  FX.ring(o.x, o.y + 0.4, o.z, 35, 0x4a9cff, 0.6);
  FX.burst(o.x, o.y + 1.5, o.z, 18, 0xe8b83a, 6, 0.3);
  MX.pillar(o.x, o.y, o.z, 0x4a9cff, 1.6, 7, 0.8);
  UI.toast('友军弩车就位！自动射击 30 秒', Kit.color('gold'));
};

MX.updateTurrets = function (dt) {
  for (var i = MX.turrets.length - 1; i >= 0; i--) {
    var t = MX.turrets[i], o = t.o;
    t.active -= dt;
    t.raise = Math.min(1, t.raise + dt * 2);
    o.flag.scale.set(1, Math.max(0.01, t.raise), 1);
    o.flag.rotation.y = Math.sin(Game.time * 3 + i) * 0.25;
    o.allyRing.material.opacity = 0.35 + Math.sin(Game.time * 5) * 0.15;
    if (t.active <= 0) {
      MX.turrets.splice(i, 1);
      o.allyRing.visible = false;
      o.crest.visible = false;
      o.flag.scale.set(1, 0.01, 1);
      MX.smoke(o.x, o.y + 1.2, o.z, 10, 0xb8b0a4, 0.8, 0.4);
      UI.toast('弩车停火了 · 击倒 ' + t.kills + ' 个敌人', '#7ab8ff');
      continue;
    }
    t.retarget -= dt;
    if (t.retarget <= 0 || (t.target && !t.target.alive)) { t.retarget = 0.15; t.target = Enemies.nearest(o.x, o.z, 35); }
    var want = t.aim;
    if (t.target) want = Math.atan2(t.target.x - o.x, t.target.z - o.z);
    t.aim += clamp(MX.angDiff(want, t.aim), -7 * dt, 7 * dt);
    o.top.rotation.y = t.aim - o.rotY;
    t.fireT -= dt;
    t.recoil = Math.max(0, t.recoil - dt * 5);
    o.loaded.position.z = -t.recoil * 0.35;
    o.loaded.visible = t.fireT < 0.3;
    if (t.target && t.fireT <= 0 && Math.abs(MX.angDiff(want, t.aim)) < 0.3) { MX.fireBolt(t); t.fireT = 0.6; }
  }
};

MX.fireBolt = function (t) {
  var e = t.target, o = t.o, a = t.aim, speed = 70;
  var sx = o.x + Math.sin(a) * 1.5, sz = o.z + Math.cos(a) * 1.5, sy = o.y + 1.3;
  // 简单的提前量
  var lead = Math.sqrt(dist2(sx, sz, e.x, e.z)) / speed;
  var dx = e.x + (e.vx || 0) * lead - sx, dz = e.z + (e.vz || 0) * lead - sz, dy = e.y + e.r - sy;
  var L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  MX.bolts.push({ x: sx, y: sy, z: sz, vx: dx / L * speed, vy: dy / L * speed, vz: dz / L * speed, life: 0.75, hit: [], dmg: 25 * MX.sf() * (1 + 0.05 * P.level), t: t, stuck: 0 });
  if (MX.bolts.length > MX.BOLT_CAP) MX.bolts.shift();
  t.recoil = 1;
  FX.burst(sx, sy, sz, 5, 0xe8d8b0, 4, 0.18);
  MX.sparks(sx, sy, sz, 6, [0xffe27a, 0xffffff], 3, 0.12);
};

MX.updateBolts = function (dt) {
  var bs = MX.bolts;
  for (var i = bs.length - 1; i >= 0; i--) {
    var b = bs[i];
    if (b.stuck > 0) { b.stuck -= dt; if (b.stuck <= 0) bs.splice(i, 1); continue; }
    b.life -= dt;
    var x0 = b.x, y0 = b.y, z0 = b.z;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    MX.boltHits(b, x0, y0, z0);
    var gy = W.groundAt(b.x, b.z, b.y + 0.5);
    if (b.y <= gy) { b.y = gy + 0.15; b.stuck = 0.8; FX.burst(b.x, gy + 0.1, b.z, 5, 0x9a8a6a, 3, 0.2); continue; }
    if (b.life <= 0) bs.splice(i, 1);
  }
  MX.renderBolts();
};
// 沿着这一帧走过的线段检测命中（穿透）
MX.boltHits = function (b, x0, y0, z0) {
  var sx = b.x - x0, sz = b.z - z0, sl = sx * sx + sz * sz || 1;
  var sp = Math.sqrt(b.vx * b.vx + b.vz * b.vz) || 1;
  Enemies.hash.query((x0 + b.x) / 2, (z0 + b.z) / 2, Math.sqrt(sl) / 2 + 3, function (e) {
    if (!e.alive || b.hit.indexOf(e.id) >= 0) return;
    var u = clamp(((e.x - x0) * sx + (e.z - z0) * sz) / sl, 0, 1);
    var rr = e.r + 0.55;
    if (dist2(x0 + sx * u, z0 + sz * u, e.x, e.z) > rr * rr) return;
    if (Math.abs(y0 + (b.y - y0) * u - (e.y + e.r)) > e.r + 1.1) return;
    b.hit.push(e.id);
    Enemies.damage(e, b.dmg, 0, b.vx / sp * 10, b.vz / sp * 10);
    if (!e.alive) b.t.kills++;
    FX.burst(e.x, e.y + e.r, e.z, 4, 0xffe0a0, 5, 0.18);
  });
};
MX.renderBolts = function () {
  if (!MX.boltMesh) { if (!MX.bolts.length) return; MX.boltInit(); if (!MX.boltMesh) return; }
  var bs = MX.bolts, n = 0, nt = 0;
  for (var i = 0; i < bs.length && n < MX.BOLT_CAP; i++) {
    var b = bs[i], hs = Math.sqrt(b.vx * b.vx + b.vz * b.vz);
    MX._e.set(-Math.atan2(b.vy, hs || 0.001), Math.atan2(b.vx, b.vz), 0, 'YXZ');
    MX._q.setFromEuler(MX._e);
    MX._v.set(b.x, b.y, b.z);
    MX._s.set(1.5, 1.5, 1.5);
    MX._m.compose(MX._v, MX._q, MX._s);
    MX.boltMesh.setMatrixAt(n++, MX._m);
    if (!b.stuck) { MX._s.set(1, 1, 1); MX._m.compose(MX._v, MX._q, MX._s); MX.trailMesh.setMatrixAt(nt++, MX._m); }
  }
  MX.boltMesh.count = n;
  MX.trailMesh.count = nt;
  MX.boltMesh.instanceMatrix.needsUpdate = true;
  MX.trailMesh.instanceMatrix.needsUpdate = true;
};

// ============================================================
//  HUD：增益栏（战马 / 温暖 / 弩车倒计时）、站圈进度条、传送闪光（自己注入样式）
// ============================================================
// 和 HUD 一样的像素风（css/kit.css）：增益栏每一格是画面上的小面板（.mxBuff，--fr-plate），图标是符文砖（Kit.glyphTile）；
// 站圈进度是半透明面板（#mxProgress，--fr-panelT）。这里只写布局、字号（--fs-*）和描边（--ol*）
MX.CSS = [
  // 增益栏：在左上任务框下面，一排小面板（太多时换行）
  '#mxBuffs{display:flex;flex-wrap:wrap;gap:6px;max-width:320px;pointer-events:none}',
  '#mxBuffs:empty{display:none}',
  '#mxBuffs.float{position:absolute;left:max(12px,env(safe-area-inset-left,0px));top:calc(env(safe-area-inset-top,0px) + 150px)}',
  // 30 像素高：22 像素的符文砖 + 18 号名字 + 18 号像素加粗的秒数，底下一条 3 像素的效果色进度
  '.mxBuff{position:relative;display:flex;align-items:center;gap:6px;height:30px;padding:0 9px 4px 3px;color:#fff;white-space:nowrap}',
  '.mxBuff .ic{flex:none;width:22px;height:22px;border:2px solid #000;display:flex;align-items:center;justify-content:center;font-size:var(--fs-s);line-height:12px}',
  '.mxBuff .nm{font-size:var(--fs-m);line-height:18px;text-shadow:var(--ol1)}',
  '.mxBuff .tm{min-width:22px;font-size:var(--fs-m);line-height:18px;letter-spacing:var(--o);text-align:right;text-shadow:var(--olB)}',
  // 「秒」：汉字不加粗（数字才像素加粗），和数字之间空 1 个字体像素
  '.mxBuff .tm i{font-style:normal;margin-left:var(--o);letter-spacing:0;text-shadow:var(--ol1)}',
  '.mxBuff .trk{position:absolute;left:2px;right:2px;bottom:1px;height:3px;background:rgba(0,0,0,.75)}',
  '.mxBuff .bar{display:block;height:100%;width:100%;box-shadow:inset 0 1px 0 rgba(255,255,255,.4)}',
  // 站圈进度：正上方倒计时（和 Boss 血条）下面
  '#mxProgress{width:248px;margin-top:6px;padding:6px 9px 9px;pointer-events:none;white-space:nowrap}',
  '#mxProgress.float{position:absolute;left:50%;top:calc(env(safe-area-inset-top,0px) + 96px);transform:translateX(-50%)}',
  '#mxProgress .row{display:flex;align-items:center;justify-content:space-between;gap:9px;margin-bottom:6px}',
  '#mxProgress .tt{font-size:var(--fs-m);line-height:18px;color:#fff;text-shadow:var(--ol1)}',
  '#mxProgress .pc{font-size:var(--fs-m);line-height:18px;text-shadow:var(--ol1)}',
  '#mxProgress .trk{position:relative;height:14px;border:2px solid #000;background:#0b1020;box-shadow:inset 0 0 0 1px rgba(255,255,255,.12)}',
  '#mxProgress .fill{height:100%;width:0;box-shadow:inset 0 3px 0 rgba(255,255,255,.35),inset 0 -3px 0 rgba(0,0,0,.3)}',
  // 每 10% 一道刻度
  '#mxProgress .trk::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 2px),rgba(0,0,0,.5) calc(10% - 2px),rgba(0,0,0,.5) 10%)}',
  // 传送闪光：一圈圈硬边色带，分几格淡出（像素风）
  '#mxFlash{position:fixed;inset:0;pointer-events:none;z-index:4;opacity:0}',
  '#mxFlash.on{animation:mxFlash .5s steps(5,end)}',
  '@keyframes mxFlash{from{opacity:1}to{opacity:0}}',
  '@media (prefers-reduced-motion: reduce){#mxFlash.on{animation-duration:.2s}}'
].join('\n');

MX.hudInit = function () {
  if (MX.hud) return MX.hud;
  var hud = document.getElementById('hud');
  if (!hud) return null;
  var st = document.createElement('style');
  st.textContent = MX.CSS;
  document.head.appendChild(st);
  var bar = document.createElement('div');
  bar.id = 'mxBuffs';
  var host = document.getElementById('topLeft');
  if (host) host.appendChild(bar);
  else { bar.className = 'float'; hud.appendChild(bar); }
  var pr = document.createElement('div');
  pr.id = 'mxProgress';
  pr.style.display = 'none';
  var row = document.createElement('div'); row.className = 'row';
  var txt = document.createElement('span'); txt.className = 'tt';
  var pc = document.createElement('span'); pc.className = 'pc';
  var trk = document.createElement('div'); trk.className = 'trk';
  var fill = document.createElement('div'); fill.className = 'fill';
  row.appendChild(txt); row.appendChild(pc); trk.appendChild(fill); pr.appendChild(row); pr.appendChild(trk);
  var top = document.getElementById('topCenter');
  if (top) top.appendChild(pr);
  else { pr.className = 'float'; hud.appendChild(pr); }
  var fl = document.createElement('div');
  fl.id = 'mxFlash';
  document.body.appendChild(fl);
  MX.hud = { bar: bar, pr: pr, txt: txt, pc: pc, fill: fill, fl: fl, key: null, pkey: null, chips: [] };
  return MX.hud;
};

MX.buffList = function () {
  var out = [];
  if (MX.mount) out.push({ icon: '马', name: '战马', t: MX.mount.t, max: MX.mount.max, color: '#c8874a' });
  if (MX.warmT > 0) out.push({ icon: '暖', name: '温暖', t: MX.warmT, max: 30, color: '#ff9a3a' });
  if (MX.turrets.length) {
    var tl = 0;
    MX.turrets.forEach(function (t) { tl = Math.max(tl, t.active); });
    out.push({ icon: '弩', name: '弩车' + (MX.turrets.length > 1 ? ' ×' + MX.turrets.length : ''), t: tl, max: 30, color: '#4a9cff' });
  }
  return out;
};

// 在 UI.update（画面刷新）里调用：只在内容变化时改 DOM
MX.hudUpdate = function () {
  var h = MX.hudInit();
  if (!h) return;
  var list = MX.buffList(), i;
  var key = list.map(function (b) { return b.icon + b.name + b.color; }).join('|');
  if (key !== h.key) {
    // 增益的种类变了才重建小面板
    h.key = key;
    h.bar.textContent = '';
    h.chips = list.map(function (b) {
      var d = document.createElement('div');
      d.className = 'mxBuff';
      // 图标：符文砖（深色底 + 效果色的字和内框），不是彩色平涂方块
      var ic = document.createElement('span'); ic.className = 'ic'; Kit.glyphTile(ic, b.icon, b.color);
      var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = b.name;
      var tm = document.createElement('span'); tm.className = 'tm';
      var tn = document.createTextNode(''); tm.appendChild(tn); tm.appendChild(document.createElement('i')).textContent = '秒';
      var trk = document.createElement('span'); trk.className = 'trk';
      var bar = document.createElement('span'); bar.className = 'bar'; bar.style.background = b.color;
      trk.appendChild(bar);
      d.appendChild(ic); d.appendChild(nm); d.appendChild(tm); d.appendChild(trk);
      h.bar.appendChild(d);
      return { tm: tn, bar: bar, s: -1, w: -1 };
    });
  }
  for (i = 0; i < list.length && i < h.chips.length; i++) {
    var c = h.chips[i], s = Math.ceil(list[i].t), w = Math.round(clamp(list[i].t / list[i].max, 0, 1) * 200) / 2;
    if (c.s !== s) { c.s = s; c.tm.data = String(s); }
    if (c.w !== w) { c.w = w; c.bar.style.width = w + '%'; }
  }
  var p = MX.shown;
  var pk = p ? p.text + '|' + Math.floor(p.pct * 100) : '';
  if (pk !== h.pkey) {
    h.pkey = pk;
    h.pr.style.display = p ? '' : 'none';
    if (p) {
      h.txt.textContent = p.text;
      h.pc.textContent = Math.floor(p.pct * 100) + '%';
      h.pc.style.color = p.color;
      h.fill.style.width = (p.pct * 100) + '%';
      h.fill.style.background = p.color;
    }
  }
};

// '#46f2ff' → 'rgba(70,242,255,a)'
MX.rgba = function (hex, a) {
  var n = parseInt(hex.slice(1), 16);
  return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
};
// 全屏闪一下：中间透明，往外一圈比一圈浓的硬边色带
MX.flash = function (css) {
  var h = MX.hudInit();
  if (!h) return;
  h.fl.style.background = 'radial-gradient(circle at 50% 55%, rgba(255,255,255,0.18) 0, rgba(255,255,255,0.18) 22%, ' +
    MX.rgba(css, 0.3) + ' 22%, ' + MX.rgba(css, 0.3) + ' 40%, ' + MX.rgba(css, 0.55) + ' 40%, ' + MX.rgba(css, 0.55) + ' 58%, ' +
    MX.rgba(css, 0.8) + ' 58%, ' + MX.rgba(css, 0.8) + ' 76%, ' + css + ' 76%)';
  h.fl.classList.remove('on');
  void h.fl.offsetWidth;
  h.fl.classList.add('on');
};

// ============================================================
//  接入其他文件：只包装，不改源码
// ============================================================
// 这些对象在本文件之前已经定义好了，加载时直接包装
(function () {
  var iu = Interact.update;
  Interact.update = function (dt) { iu.call(this, dt); MX.update(dt); };
  var pop = Interact.populate;
  Interact.populate = function () { pop.apply(this, arguments); MX.populate(); };
  // 骑马时接触伤害减半（src 是撞到你的敌人）
  var hurt = P.hurt;
  P.hurt = function (dmg, src) { if (MX.mount && src) dmg *= 0.5; return hurt.call(this, dmg, src); };
  var reset = P.reset;
  P.reset = function () { MX.reset(); return reset.apply(this, arguments); };
  // 骑马时镜头跟着抬高、拉远一点（只在画面刷新时临时改，算完马上还原）
  var cam = P.updateCamera;
  P.updateCamera = function (c, dt) {
    var lift = MX.camLift;
    if (!lift) return cam.call(this, c, dt);
    var y0 = P.pos.y, d0 = P.camDist;
    P.pos.y = y0 + lift; P.camDist = d0 + lift * 1.2;
    try { return cam.call(this, c, dt); } finally { P.pos.y = y0; P.camDist = d0; }
  };
  // 骑马时脚下的血条留在地面上
  var hb = P.updateHpBar;
  if (hb) P.updateHpBar = function (c) { var r = hb.apply(this, arguments); MX.riderHpBar(c); return r; };
  // 骑马时头顶的拾取提示（+经验、$金币）跟着抬高到骑手头上
  var dtx = FX.drawTexts;
  if (dtx) FX.drawTexts = function () {
    var m = MX.mount;
    if (!m || !m.lift) return dtx.apply(this, arguments);
    var y0 = P.pos.y;
    P.pos.y = y0 + m.lift;
    try { return dtx.apply(this, arguments); } finally { P.pos.y = y0; }
  };
  // 战旗占领中：刷怪速度 ×1.5（按导演的刷怪公式额外累积）
  var dir = Director.update;
  Director.update = function (dt) {
    if (MX.spawnBoost > 0 && !Director.swarm) {
      var m = Game.time / 60;
      Director.acc += (0.9 + m * 0.85 + m * m * 0.14) * (1 + P.st.difficulty * 0.8) * dt * MX.spawnBoost;
    }
    return dir.call(this, dt);
  };
})();

// 这些在后面的文件里定义：页面加载完（或第一次摆放时）再包装
MX.lateInstall = function () {
  if (MX.lateDone || typeof UI === 'undefined' || typeof Passive === 'undefined' || typeof Game === 'undefined' || !Game.updateChallenges) return;
  MX.lateDone = true;
  UI.modeHandlers.blacksmith = function (o) { MX.smithPick(o); };
  // 骑马：移动速度 ×1.6
  var sm = Passive.speedMult;
  Passive.speedMult = function () { return sm.apply(this, arguments) * (MX.mount ? 1.6 : 1); };
  var uu = UI.update;
  UI.update = function () { var r = uu.apply(this, arguments); MX.hudUpdate(); return r; };
  // 古墓：自己判断全灭（金宝箱 + 经验），其余挑战照旧
  var uc = Game.updateChallenges;
  Game.updateChallenges = function () { MX.checkCrypts(); return uc.apply(this, arguments); };
};
window.addEventListener('load', function () { MX.lateInstall(); });

// ============================================================
//  铁匠铺：花金币挑一把武器，强化一级（至少稀有）；每座最多 3 次，越来越贵
// ============================================================
MX.smithPrice = function (o) { return Math.round(45 * MX.sf() * Math.pow(1.4, o.uses)); };
MX.smithWeapons = function () { return P.weapons.filter(function (w) { return w.level < 40; }); };
MX.smithParts = function () {
  var T = MX.tiles(), wood = 0x7a5230, stone = 0x8a8078, iron = 0x3d3f46;
  var p = [
    // 地面石板（往下埋，坡地不悬空）
    mxB(4.6, 0.8, 4.0, 0, -0.32, -0.4, 0x6e6458, T.block),
    // 炉子：石台、炉口、炉罩、烟囱、风箱
    mxB(1.5, 1.05, 1.25, -1.15, 0.52, -1.3, stone, T.block), mxB(1.62, 0.14, 1.37, -1.15, 1.1, -1.3, 0x9e968c, T.block),
    mxB(0.24, 1.3, 0.24, -1.8, 1.78, -0.78, 0x7a7068, T.block), mxB(0.24, 1.3, 0.24, -0.5, 1.78, -0.78, 0x7a7068, T.block),
    mxB(1.6, 1.3, 0.24, -1.15, 1.78, -1.86, 0x7a7068, T.block),
    mxB(1.78, 0.5, 1.45, -1.15, 2.66, -1.3, 0x6e665e, T.block), mxB(0.62, 1.7, 0.62, -1.15, 3.7, -1.5, 0x6e665e, T.block), mxB(0.78, 0.16, 0.78, -1.15, 4.6, -1.5, 0x55504a, T.block),
    mxB(0.55, 0.28, 0.75, -0.05, 0.62, -1.35, 0x6a4026, 'noise'), mxB(0.5, 0.06, 0.7, -0.05, 0.78, -1.35, wood, T.plank),
    mxC(0.05, 0.08, 0.5, 6, -0.38, 0.72, -1.35, iron, 'metal', [0, 0, Math.PI / 2]),
    // 铁砧（树桩上）
    mxC(0.36, 0.42, 0.62, 8, 0.45, 0.38, 0.55, 0x6b4a2c, 'bark'),
    mxB(0.44, 0.14, 0.34, 0.45, 0.76, 0.55, iron, 'metal'), mxB(0.24, 0.2, 0.22, 0.45, 0.92, 0.55, iron, 'metal'), mxB(0.8, 0.2, 0.36, 0.45, 1.11, 0.55, 0x4a4d56, 'metal'),
    mxK(0.13, 0.42, 6, 1.06, 1.12, 0.55, 0x4a4d56, 'metal', [0, 0, -Math.PI / 2]), mxB(0.14, 0.14, 0.22, 0.0, 1.13, 0.55, 0x4a4d56, 'metal'),
    // 武器架：剑、斧、盾
    mxB(0.14, 1.6, 0.14, 0.95, 0.8, -1.55, wood, T.plank), mxB(0.14, 1.6, 0.14, 2.15, 0.8, -1.55, wood, T.plank),
    mxB(1.35, 0.1, 0.12, 1.55, 1.3, -1.55, wood, T.plank), mxB(1.35, 0.1, 0.12, 1.55, 0.35, -1.55, wood, T.plank),
    mxB(0.08, 1.1, 0.03, 1.2, 0.8, -1.42, 0xd6dce4, 'metal', [0.12, 0, 0]), mxB(0.32, 0.06, 0.08, 1.2, 1.36, -1.35, 0xd9b43a, 'gold'), mxB(0.05, 0.22, 0.05, 1.2, 1.5, -1.33, 0x4a2a1a),
    mxB(0.08, 1.0, 0.03, 1.5, 0.75, -1.42, 0xd6dce4, 'metal', [0.12, 0, 0]), mxB(0.3, 0.06, 0.08, 1.5, 1.27, -1.35, 0xb8c0cc, 'metal'), mxB(0.05, 0.22, 0.05, 1.5, 1.41, -1.33, 0x4a2a1a),
    mxB(0.06, 1.25, 0.06, 1.85, 0.75, -1.42, wood, 'wood', [0.1, 0, 0]), mxB(0.04, 0.36, 0.32, 1.85, 1.3, -1.3, 0xb8c0cc, 'metal'),
    mxC(0.36, 0.36, 0.06, 10, 1.55, 0.95, -1.66, 0x2b4fb8, 'cloth', [Math.PI / 2, 0, 0]), mxC(0.1, 0.1, 0.08, 8, 1.55, 0.95, -1.62, 0xe8b83a, 'gold', [Math.PI / 2, 0, 0]),
    // 淬火水桶
    mxC(0.34, 0.36, 0.7, 8, 1.6, 0.35, 0.65, 0x6b4a2c, T.plank), mxC(0.37, 0.37, 0.06, 8, 1.6, 0.2, 0.65, iron, 'metal'), mxC(0.37, 0.37, 0.06, 8, 1.6, 0.55, 0.65, iron, 'metal'),
    mxC(0.31, 0.31, 0.02, 8, 1.6, 0.69, 0.65, 0x3a6a8a, 'plain'),
    // 煤堆
    ['dodec', [0.28], [-0.35, 0.18, -0.3], 0x2a2a30, null, [1, 0.6, 1], 'rock'], ['dodec', [0.22], [-0.05, 0.14, -0.15], 0x34343a, null, [1, 0.6, 1], 'rock'],
    // 棚子：四根柱子 + 斜屋顶
    mxB(0.18, 2.6, 0.18, -2.15, 1.3, 0.55, wood, T.plank), mxB(0.18, 2.6, 0.18, 2.15, 1.3, 0.55, wood, T.plank),
    mxB(0.18, 3.1, 0.18, -2.15, 1.55, -2.1, wood, T.plank), mxB(0.18, 3.1, 0.18, 2.15, 1.55, -2.1, wood, T.plank),
    mxB(4.7, 0.14, 3.2, 0, 2.86, -0.78, 0x8a5a32, T.plank, [0.16, 0, 0]), mxB(4.8, 0.12, 0.14, 0, 2.62, 0.62, 0x6a4026, T.plank),
    // 招牌：挂着的铁砧图案木牌
    mxB(0.08, 0.08, 0.7, 2.15, 2.3, 0.88, iron, 'metal'), mxB(0.06, 0.5, 0.62, 2.15, 1.95, 1.12, 0x8a5a32, T.plank),
    mxB(0.07, 0.12, 0.38, 2.15, 2.02, 1.12, 0x2a2c32, 'plain'), mxB(0.07, 0.1, 0.12, 2.15, 1.9, 1.12, 0x2a2c32, 'plain'), mxB(0.07, 0.06, 0.28, 2.15, 1.82, 1.12, 0x2a2c32, 'plain'),
    // 水力锤的立柱
    mxB(0.16, 1.45, 0.16, 1.22, 0.72, 0.78, wood, T.plank), mxC(0.05, 0.05, 0.34, 6, 1.22, 1.4, 0.66, iron, 'metal', [Math.PI / 2, 0, 0])
  ];
  return p;
};
// 炉火（发光）：炭床 + 几簇火苗 + 铁砧上烧红的剑坯
MX.smithFireParts = function () {
  var T = MX.tiles(), f = MX.fireCol();
  return [
    mxB(1.18, 0.08, 0.95, -1.15, 1.2, -1.3, f, T.fire),
    mxK(0.2, 0.62, 5, -1.4, 1.5, -1.25, f, T.fire), mxK(0.17, 0.5, 5, -0.95, 1.44, -1.15, f, T.fire), mxK(0.15, 0.55, 5, -1.15, 1.47, -1.48, f, T.fire),
    mxB(0.62, 0.04, 0.09, 0.38, 1.235, 0.6, 0xffa040, 'plain')
  ];
};
// 水力锤：绕横轴摆动，锤头落在铁砧上
MX.hammerParts = function () {
  return [mxB(0.95, 0.1, 0.1, -0.45, 0, 0, 0x7a5230, MX.tiles().plank), mxB(0.24, 0.26, 0.26, -0.84, -0.06, 0, 0x34363c, 'metal'), mxB(0.22, 0.14, 0.16, 0.14, 0, 0, 0x55575e, 'metal')];
};
Interact.KINDS.blacksmith = {
  radius: 3.2,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('smith', MX.smithParts)));
    o.fire = MX.mesh(MX.geo('smithFire', MX.smithFireParts), 'glow');
    g.add(o.fire);
    o.hammer = new THREE.Group();
    o.hammer.position.set(1.22, 1.4, 0.55);
    o.hammer.add(MX.mesh(MX.geo('smithHammer', MX.hammerParts)));
    o.hammer.rotation.z = -0.45;
    g.add(o.hammer);
    return g;
  },
  init: function (o) {
    o.uses = 0; o.hamT = Math.random() * 2;
    var f = MX.local(o, -1.15, -1.3);
    MX.collide(f.x, f.z, 0.9, o.y + 1.15);
  },
  label: function (o) { return '铁匠铺：花 ' + MX.smithPrice(o) + ' 金币锻造武器 · 还能锻造 ' + (3 - o.uses) + ' 次'; },
  canUse: function (o) { return P.gold >= MX.smithPrice(o) && MX.smithWeapons().length > 0; },
  denied: function (o) { return MX.smithWeapons().length ? '金币不够 · 需要 ' + MX.smithPrice(o) : '没有还能强化的武器'; },
  use: function (o) { MX.openSmith(o); },
  update: function (o, dt, d2) {
    if (d2 > 3600) return;
    o.fire.scale.y = 1 + Math.sin(Game.time * 13 + o.idx) * 0.12;
    if (Math.random() < dt * 3) MX.part(MX.local(o, -1.15 + rand(-0.4, 0.4), -1.3).x, o.y + 1.4, MX.local(o, -1.15, -1.3 + rand(-0.3, 0.3)).z, rand(-0.3, 0.3), rand(1, 2), rand(-0.3, 0.3), 1.0, 0.08, 0.03, pick([0xffb040, 0xff7020]), 0.4);
    // 水力锤：慢慢抬起，猛地落下，溅出火星
    o.hamT += dt;
    var c = o.hamT % 1.6, a;
    if (c < 1.3) a = 0.08 - (c / 1.3) * 0.53;
    else a = -0.45 + Math.min(1, (c - 1.3) / 0.08) * 0.53;
    if (c >= 1.38 && o.hamC !== Math.floor(o.hamT / 1.6) && d2 < 900) {
      o.hamC = Math.floor(o.hamT / 1.6);
      var p = MX.local(o, 0.4, 0.55);
      MX.sparks(p.x, o.y + 1.25, p.z, 7, [0xffd27a, 0xffa040, 0xffffff], 4, 0.1);
    }
    o.hammer.rotation.z = a;
  },
  mapIcon: { color: '#ff9a3a', shape: 'star', size: 3.2 },          // 炉火的火星
  clear: function () { MX.reset(); }
};
MX.openSmith = function (o) {
  var ws = MX.smithWeapons();
  if (!ws.length) return;
  MX.lateInstall();
  MX.smithRef = o;
  var price = MX.smithPrice(o);
  Game.openModal(function () {
    var opts = ws.map(function (w) {
      var r = Rarity.roll(2), picks = Weapons.rollUpgrade(w, r);
      return { kind: 'weapon-up', id: w.id, rarity: r, title: w.def.name, icon: w.def.icon, color: w.def.color, sub: '等级 ' + w.level + ' → ' + (w.level + 1), picks: picks, lines: picks.map(Weapons.upgradeText) };
    });
    opts.push({ kind: 'leave', rarity: 0, title: '先不锻造', icon: '走', color: 0x5a5470, sub: '不花钱', lines: ['铁匠铺会一直等你回来'], foot: '离开' });
    UI.choiceModal('blacksmith', '铁匠铺 · 选一把武器锻造 · ' + price + ' 金币', opts);
    var foot = document.querySelector('#levelCards .card:last-child .cardRarity');
    if (foot) foot.textContent = '离开';
  });
};
MX.smithPick = function (opt) {
  var o = MX.smithRef;
  MX.smithRef = null;
  if (!o || !opt || opt.kind !== 'weapon-up') return;
  var w = Weapons.find(opt.id), price = MX.smithPrice(o);
  if (!w) return;
  if (P.gold < price) { UI.toast('金币不够', Kit.color('red')); return; }
  P.gold -= price;
  Weapons.applyUpgrade(w, opt.picks);
  o.uses++;
  var a = MX.local(o, 0.45, 0.55);
  FX.burst(a.x, o.y + 1.3, a.z, 24, 0xffb040, 7, 0.22);
  MX.sparks(a.x, o.y + 1.3, a.z, 20, [0xffd27a, 0xffa040, 0xffffff], 6, 0.14);
  FX.ring(a.x, o.y + 1.1, a.z, 2.4, 0xffb040, 0.35);
  Game.shake(0.25);
  UI.toast('锻造成功：' + w.def.name + ' Lv' + w.level + ' · ' + RARITY[opt.rarity].name, RARITY[opt.rarity].color);
  if (o.uses >= 3) {
    // 用完了：炉火熄灭
    o.used = true;
    o.fire.visible = false;
    var f = MX.local(o, -1.15, -1.3);
    MX.smoke(f.x, o.y + 1.4, f.z, 14, 0x5a5654, 0.5, 0.4);
    UI.toast('铁匠铺的炉火熄灭了', Kit.color('goldL'));
  }
};

// ============================================================
//  许愿井：投金币许愿（祝福 / 双倍返还 / 宝物 / 诅咒），每口井 5 次
// ============================================================
MX.wishCost = function () { return Math.round(20 * MX.sf()); };
MX.wellParts = function () {
  var T = MX.tiles(), p = [mxC(1.55, 1.7, 1.0, 10, 0, -0.4, 0, 0x7a746a, T.block), mxC(0.84, 0.84, 0.55, 10, 0, 0.32, 0, 0x14181c, 'plain')];
  for (var i = 0; i < 10; i++) {
    var a = i / 10 * TAU, c = Math.cos(a), s = Math.sin(a);
    p.push(['mxbox', [0.62, 0.8, 0.3], [c * 0.94, 0.48, s * 0.94], i % 2 ? 0x8c8578 : 0x9a9284, [0, -a - Math.PI / 2, 0], null, T.block]);
    p.push(['mxbox', [0.66, 0.12, 0.42], [c * 0.95, 0.94, s * 0.95], 0xb4ac9c, [0, -a - Math.PI / 2, 0], null, T.block]);
  }
  var wood = 0x7a5230;
  p.push(mxB(0.17, 2.1, 0.17, -1.0, 1.05, 0, wood, T.plank), mxB(0.17, 2.1, 0.17, 1.0, 1.05, 0, wood, T.plank));
  p.push(mxB(1.3, 0.09, 1.15, -0.5, 2.3, 0, 0x8a5a32, T.plank, [0, 0, 0.62]), mxB(1.3, 0.09, 1.15, 0.5, 2.3, 0, 0x8a5a32, T.plank, [0, 0, -0.62]));
  p.push(mxB(0.12, 0.12, 1.2, 0, 2.66, 0, 0x6a4026, T.plank));
  p.push(mxC(0.06, 0.06, 2.25, 6, 0, 1.75, 0, 0x6a4026, 'bark', [0, 0, Math.PI / 2]), mxC(0.13, 0.13, 0.5, 8, 0, 1.75, 0, 0xc8a870, 'fur', [0, 0, Math.PI / 2]));
  p.push(mxB(0.06, 0.32, 0.06, 1.17, 1.6, 0, 0x6a4026), mxB(0.22, 0.06, 0.06, 1.25, 1.46, 0, 0x6a4026));
  // 井边的小花和掉落的硬币
  [[1.35, 0.6], [-1.2, 0.85], [0.4, -1.4], [-0.9, -1.15]].forEach(function (q, k) {
    p.push(mxB(0.08, 0.22, 0.08, q[0], 0.18, q[1], 0x3a7a2a, 'leaf'), mxB(0.14, 0.1, 0.14, q[0], 0.32, q[1], [0xffe14a, 0xff7ab8, 0xffffff, 0xb88aff][k], 'plain'));
  });
  return p;
};
// 发光的井水 + 井底的硬币
MX.wellWaterParts = function () {
  return [mxC(0.82, 0.82, 0.04, 12, 0, 0.62, 0, 0x2ad8c0, 'plain'), mxB(0.12, 0.02, 0.12, 0.2, 0.645, 0.1, 0xffd23a, 'plain', [0, 0.5, 0]), mxB(0.12, 0.02, 0.12, -0.3, 0.645, -0.2, 0xffd23a, 'plain', [0, 0.2, 0]), mxB(0.12, 0.02, 0.12, 0.05, 0.645, -0.4, 0xffe68a, 'plain', [0, 0.9, 0])];
};
MX.bucketParts = function () {
  return [mxB(0.03, 1.3, 0.03, 0, -0.25, 0, 0xc8a870), mxC(0.16, 0.13, 0.22, 8, 0, -0.98, 0, 0x7a5230, MX.tiles().plank), mxC(0.17, 0.17, 0.04, 8, 0, -0.9, 0, 0x3d3f46, 'metal')];
};
Interact.KINDS.wishwell = {
  radius: 2.8,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('well', MX.wellParts)));
    o.water = MX.mesh(MX.geo('wellWater', MX.wellWaterParts), 'glow');
    g.add(o.water);
    o.bucket = new THREE.Group();
    o.bucket.position.set(0, 1.75, 0);
    o.bucket.add(MX.mesh(MX.geo('wellBucket', MX.bucketParts)));
    g.add(o.bucket);
    return g;
  },
  init: function (o) { o.uses = 5; o.pending = 0; o.dunk = 9; MX.collide(o.x, o.z, 1.15, o.y + 0.95); },
  label: function (o) { return o.pending > 0 ? '许愿中……' : '许愿井：投 ' + MX.wishCost() + ' 金币许个愿 · 还能许 ' + o.uses + ' 次'; },
  canUse: function (o) { return !(o.pending > 0) && P.gold >= MX.wishCost(); },
  denied: function (o) { return o.pending > 0 ? '硬币还在往下掉……' : '金币不够 · 需要 ' + MX.wishCost(); },
  use: function (o) { MX.wish(o); },
  update: function (o, dt, d2) {
    if (o.pending > 0) {
      o.pending -= dt;
      if (o.pending <= 0) MX.wishResolve(o);
      if (o.used) return;
    }
    // 打水桶：沉下去再拉上来
    o.dunk += dt;
    o.bucket.position.y = 1.75 - (o.dunk < 1.2 ? Math.sin(o.dunk / 1.2 * Math.PI) * 0.32 : 0);
    if (d2 < 900 && Math.random() < dt * 2.5) MX.part(o.x + rand(-0.5, 0.5), o.y + 0.7, o.z + rand(-0.5, 0.5), 0, rand(0.6, 1.2), 0, 1.4, 0.07, 0.03, pick([0x7ff0e0, 0xffffff, 0xffe68a]), 0.3);
  },
  mapIcon: { color: '#3ce0c0', shape: 'ring', size: 3.6 },          // 井口
  clear: function () { MX.reset(); }
};
MX.wish = function (o) {
  var cost = MX.wishCost();
  if (P.gold < cost) return;
  P.gold -= cost;
  o.uses--;
  o.pending = 0.6;
  o.dunk = 0;
  // 硬币划一道弧线掉进井里
  var sy = P.pos.y + 1.4, ty = o.y + 0.65;
  MX.part(P.pos.x, sy, P.pos.z, (o.x - P.pos.x) / 0.6, (ty - sy + 0.5 * 15 * 0.36) / 0.6, (o.z - P.pos.z) / 0.6, 0.6, 0.2, 0.16, 0xffd23a, -15);
};
MX.wishResolve = function (o, force) {
  var r = Math.random();
  var kind = force || (r < 0.4 ? 'bless' : r < 0.65 ? 'double' : r < 0.85 ? 'item' : 'curse');
  var cost = MX.wishCost(), x = o.x, y = o.y, z = o.z;
  FX.burst(x, y + 0.75, z, 14, 0x7ff0ff, 4, 0.18);
  FX.ring(x, y + 0.5, z, 1.6, 0x7ff0ff, 0.35);
  if (kind === 'bless') {
    var c = pick(CHAOS_POOL), v = c[1] * RARITY_MULT[Rarity.roll()] * 0.6;
    P.addMod(c[0], v);
    for (var i = 0; i < 16; i++) MX.part(x + rand(-0.7, 0.7), y + 0.8, z + rand(-0.7, 0.7), rand(-0.4, 0.4), rand(2, 4.5), rand(-0.4, 0.4), 1.2, 0.14, 0.05, pick([0xffe14a, 0xffffff, 0x7dffcf]), 0.5);
    MX.pillar(x, y + 0.6, z, 0x7dffcf, 0.9, 5, 0.9);
    UI.toast('愿望成真：' + LevelUp.statText(c[0], v), Kit.color('gold'));
  } else if (kind === 'double') {
    var back = cost * 2, n = 6;
    for (i = 0; i < n; i++) Pickups.gold(x + rand(-0.4, 0.4), y + 1.2, z + rand(-0.4, 0.4), i < n - 1 ? Math.floor(back / n) : back - Math.floor(back / n) * (n - 1));
    UI.toast('井里涌出 ' + back + ' 金币！', Kit.color('gold'));
  } else if (kind === 'item') {
    FX.burst(x, y + 1.2, z, 18, 0xc46bff, 6, 0.25);
    MX.pillar(x, y + 0.6, z, 0xc46bff, 0.9, 5, 0.9);
    UI.toast('井底浮上来一件宝物！', Kit.color('gold'));
    UI.chestReward(Items.roll());
  } else {
    P.addMod('difficulty', 0.03);
    var e = MX.spawnElite(x, z, 7, 10);
    MX.smoke(x, y + 1, z, 16, 0x3a2a4a, 0.8, 0.5);
    Game.shake(0.4);
    UI.toast('许愿井的诅咒！难度 +3%，' + (e ? e.def.name : '精英') + '扑过来了', Kit.color('org'));
  }
  if (o.uses <= 0) {
    // 井水干了
    o.used = true;
    o.water.visible = false;
    MX.smoke(x, y + 0.8, z, 8, 0x8a8478, 0.4, 0.35);
    UI.toast('许愿井干涸了', Kit.color('goldL'));
  }
};
// 在 (x,z) 附近刷一个精英怪（从天上掉下来）
MX.spawnElite = function (x, z, r0, r1) {
  var pool = Director.currentPool().types;
  if (!pool || !pool.length) return null;
  var a = Math.random() * TAU, d = rand(r0, r1);
  return Enemies.spawn(pick(pool), x + Math.cos(a) * d, z + Math.sin(a) * d, { elite: true, hpMult: Director.hpMult(), dmgMult: Director.dmgMult() * 1.3, drop: true });
};

// ============================================================
//  篝火营地：站在火边 2 秒 → 回复 40% 生命 + 「温暖」30 秒；火随后熄灭
// ============================================================
MX.fireParts = function (burnt) {
  var T = MX.tiles(), log = burnt ? 0x2c2622 : 0x6b4a2c, p = [];
  p.push(mxC(0.55, 0.6, 0.08, 8, 0, 0.03, 0, burnt ? 0x4a4642 : 0x2e2822, 'noise'));
  for (var i = 0; i < 9; i++) { var a = i / 9 * TAU; p.push(['dodec', [0.17], [Math.cos(a) * 0.66, 0.08, Math.sin(a) * 0.66], i % 2 ? 0x7a7670 : 0x8e8a82, null, [1, 0.75, 1], 'rock']); }
  // 搭成锥形的木柴
  p.push(mxC(0.07, 0.09, 1.0, 6, 0.22, 0.38, 0, log, 'bark', [0, 0, 0.55]), mxC(0.07, 0.09, 1.0, 6, -0.22, 0.38, 0, log, 'bark', [0, 0, -0.55]));
  p.push(mxC(0.07, 0.09, 1.0, 6, 0, 0.38, 0.22, log, 'bark', [-0.55, 0, 0]), mxC(0.07, 0.09, 1.0, 6, 0, 0.38, -0.22, log, 'bark', [0.55, 0, 0]));
  // 吊锅支架
  p.push(mxB(0.05, 1.1, 0.05, -0.75, 0.55, 0, 0x5a3a20), mxB(0.05, 1.1, 0.05, 0.75, 0.55, 0, 0x5a3a20), mxC(0.025, 0.025, 1.6, 4, 0, 1.08, 0, 0x5a3a20, null, [0, 0, Math.PI / 2]));
  p.push(mxB(0.02, 0.2, 0.02, 0, 0.98, 0, 0x2a2a2a), mxC(0.17, 0.13, 0.24, 8, 0, 0.78, 0, 0x2a2c30, 'metal'));
  // 两根当长凳的圆木
  p.push(mxC(0.18, 0.18, 1.5, 7, 1.6, 0.18, 0.35, 0x6b4a2c, 'bark', [0, Math.PI / 2, Math.PI / 2]), mxC(0.18, 0.18, 1.4, 7, -0.6, 0.18, 1.55, 0x6b4a2c, 'bark', [0, 0, Math.PI / 2]));
  // 帐篷（三棱柱）+ 门帘 + 木桩
  p.push(['mxcyl', [1.0, 1.0, 2.1, 3], [0, 0.5, -2.35], 0xd8c8a0, [-Math.PI / 2, 0, 0], null, T.canvas], mxB(1.8, 0.5, 2.2, 0, -0.24, -2.35, 0x5a4a32, 'noise'));
  p.push(mxB(0.5, 0.92, 0.04, 0, 0.45, -1.28, 0x2a2018, 'plain'), mxB(0.42, 0.9, 0.04, -0.42, 0.48, -1.22, 0xc8b88e, T.canvas, [0, 0.6, 0]), mxB(0.42, 0.9, 0.04, 0.42, 0.48, -1.22, 0xc8b88e, T.canvas, [0, -0.6, 0]));
  p.push(mxB(0.06, 1.62, 0.06, 0, 0.81, -1.26, 0x5a3a20), mxB(0.06, 1.62, 0.06, 0, 0.81, -3.44, 0x5a3a20), mxB(0.08, 0.08, 0.5, 0, 1.55, -1.1, 0xd9333a, 'cloth'));
  // 一小堆柴火
  p.push(mxC(0.09, 0.09, 0.9, 6, -1.7, 0.1, -1.0, 0x6b4a2c, 'bark', [0, 0.3, Math.PI / 2]), mxC(0.09, 0.09, 0.9, 6, -1.7, 0.1, -0.8, 0x6b4a2c, 'bark', [0, 0.3, Math.PI / 2]), mxC(0.09, 0.09, 0.9, 6, -1.68, 0.26, -0.9, 0x5e4026, 'bark', [0, 0.35, Math.PI / 2]));
  return p;
};
MX.flameParts = function () {
  var T = MX.tiles(), f = MX.fireCol();
  return [mxK(0.36, 1.45, 6, 0, 0.78, 0, f, T.fire), mxK(0.24, 1.0, 5, 0.16, 0.55, 0.1, f, T.fire), mxK(0.22, 0.95, 5, -0.15, 0.52, -0.08, f, T.fire), mxK(0.18, 0.8, 5, 0.02, 0.46, -0.18, f, T.fire), mxK(0.14, 0.62, 5, 0, 0.36, 0, 0xfff0b0, 'plain')];
};
Interact.KINDS.campfire = {
  noPrompt: true,
  label: function () { return '篝火营地：站在火边取暖'; },
  use: function () {},
  model: function (o) {
    var g = new THREE.Group();
    o.base = MX.mesh(MX.geo('fire', function () { return MX.fireParts(false); }));
    g.add(o.base);
    o.flame = MX.mesh(MX.geo('flame', MX.flameParts), 'glow');
    g.add(o.flame);
    return g;
  },
  init: function (o) {
    o.charge = 0;
    // 地上的暖光 + 进度圆环 + 光幕（贴合地形、世界坐标对齐）
    o.glowMat = MX.additive(0xffffff, 0.55);
    o.glow = new THREE.Mesh(MX.discGeo(o.x, o.y, o.z, 2.8, 0xc8501a, 0x000000, 20), o.glowMat);
    // 取暖范围：暗橙色的像素圈；进度：亮黄色的像素圈一格格亮起来
    o.ringMat = new THREE.MeshBasicMaterial({ color: 0xd9822e, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    o.ring = new THREE.Mesh(MX.pixelRingGeo(o.x, o.y, o.z, 3.28, 3.5, 0.18), o.ringMat);
    o.arcMat = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    o.arc = new THREE.Mesh(MX.pixelRingGeo(o.x, o.y, o.z, 3.2, 3.58, 0.18), o.arcMat);
    o.arc.renderOrder = 3;
    o.wallMat = MX.additive(0xff9a3a, 0);
    o.wall = new THREE.Mesh(MX.wallGeo(o.x, o.y, o.z, 3.5, 1.1, 40), o.wallMat);
    [o.glow, o.ring, o.arc, o.wall].forEach(function (m) { m.position.set(o.x, o.y, o.z); Game.scene.add(m); o.parts.push(m); });
    MX.ringArc(o.arc.geometry, 0);
  },
  update: function (o, dt, d2, dy) {
    var near = d2 < 3600;
    o.flame.visible = near;
    if (near) {
      var t = Game.time * 11 + o.idx * 3;
      o.flame.scale.set(1 + Math.sin(t * 0.7) * 0.06, 1 + Math.sin(t) * 0.14 + Math.sin(t * 1.9) * 0.08, 1 + Math.cos(t * 0.8) * 0.06);
      o.flame.rotation.y += dt * 0.9;
      o.glowMat.opacity = 0.5 + Math.sin(t * 1.3) * 0.08;
      if (Math.random() < dt * 6) MX.part(o.x + rand(-0.25, 0.25), o.y + 0.9, o.z + rand(-0.25, 0.25), rand(-0.4, 0.4), rand(1.5, 2.8), rand(-0.4, 0.4), rand(0.8, 1.4), 0.08, 0.03, pick([0xffd27a, 0xff9a3a, 0xff6020]), 0.3);
    }
    var inside = d2 < 3.5 * 3.5 && Math.abs(dy) < 2.5 && P.alive;
    o.charge = inside ? Math.min(1, o.charge + dt / 2) : Math.max(0, o.charge - dt * 0.8);
    o.ring.visible = d2 < 225;
    MX.ringArc(o.arc.geometry, o.charge);
    o.wallMat.opacity = lerp(o.wallMat.opacity, inside ? 0.45 + o.charge * 0.3 : 0, Math.min(1, dt * 8));
    if (inside) MX.progress = { text: '篝火取暖', pct: o.charge, color: '#ffb050' };
    if (o.charge >= 1) MX.fireDone(o);
  },
  mapIcon: { color: '#ffa040', shape: 'dot', size: 3 },
  clear: function () { MX.reset(); }
};
MX.fireDone = function (o) {
  o.used = true;
  P.heal(P.st.maxHp * 0.4);
  MX.warmT = 30;
  o.flame.visible = false;
  o.glow.visible = false; o.ring.visible = false; o.arc.visible = false; o.wall.visible = false;
  o.base.geometry = MX.geo('fireBurnt', function () { return MX.fireParts(true); });
  FX.ring(o.x, o.y + 0.2, o.z, 4, 0xffb050, 0.45);
  MX.sparks(o.x, o.y + 0.6, o.z, 24, [0xffd27a, 0xff9a3a, 0xffffff], 5, 0.14);
  UI.toast('篝火：恢复 40% 生命，获得「温暖」30 秒', Kit.color('gold'));
  // 熄灭后冒一阵烟
  MX.anims.push({ o: o, t: 0, fn: function (q, dt, a) {
    a.t += dt;
    if (Math.random() < dt * 9) MX.part(q.x + rand(-0.2, 0.2), q.y + 0.4, q.z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(1, 1.8), rand(-0.3, 0.3), rand(1.5, 2.4), 0.25, 0.7, pick([0x6a6662, 0x8a8682, 0x55524f]), 0.4);
    return a.t < 7;
  } });
};

// ============================================================
//  弩车：变成 30 秒的友军炮台，每 0.6 秒朝 35 米内最近的敌人射穿透重弩箭
// ============================================================
MX.ballistaParts = function () {
  var T = MX.tiles(), wood = 0x8a5a32, dark = 0x6a4026;
  var p = [mxB(2.7, 0.3, 2.7, 0, 0.12, 0, wood, T.plank), mxB(2.5, 1.2, 2.5, 0, -0.6, 0, 0x5a4030, T.plank)];
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (c) { p.push(mxB(0.18, 0.6, 0.18, c[0] * 1.25, 0.45, c[1] * 1.25, dark, 'bark')); });
  p.push(mxB(2.7, 0.12, 0.14, 0, 0.33, 1.3, dark, T.plank), mxB(2.7, 0.12, 0.14, 0, 0.33, -1.3, dark, T.plank), mxB(0.14, 0.12, 2.7, 1.3, 0.33, 0, dark, T.plank), mxB(0.14, 0.12, 2.7, -1.3, 0.33, 0, dark, T.plank));
  // 一箱备用重弩箭
  p.push(mxB(0.62, 0.45, 0.45, 0.85, 0.5, -0.85, 0x7a5230, T.plank));
  [-0.12, 0, 0.12].forEach(function (dx) { p.push(mxB(0.05, 0.05, 0.5, 0.85 + dx, 0.8, -0.85, 0x6a4a2a), mxK(0.06, 0.14, 4, 0.85 + dx, 0.8, -0.55, 0xc0c8d0, 'metal', [Math.PI / 2, 0, 0])); });
  // 转台底座
  p.push(mxC(0.22, 0.3, 0.6, 8, 0, 0.6, 0, dark, 'bark'), mxC(0.34, 0.34, 0.08, 8, 0, 0.9, 0, 0x3d3f46, 'metal'));
  return p;
};
MX.ballistaTopParts = function () {
  var T = MX.tiles(), wood = 0x8a5a32, iron = 0x4a4d56;
  return [
    mxB(0.28, 0.22, 2.3, 0, 0.18, 0.05, wood, T.plank), mxB(0.08, 0.02, 2.0, 0, 0.3, 0.1, 0x3a2a1a, 'plain'),
    mxB(0.9, 0.62, 0.18, 0, 0.3, 0.95, 0x7a5230, T.plank), mxB(0.94, 0.08, 0.22, 0, 0.63, 0.95, iron, 'metal'), mxB(0.94, 0.08, 0.22, 0, -0.03, 0.95, iron, 'metal'),
    mxC(0.11, 0.11, 0.72, 8, -0.28, 0.3, 0.95, 0x8a6a4a, 'fur'), mxC(0.11, 0.11, 0.72, 8, 0.28, 0.3, 0.95, 0x8a6a4a, 'fur'),
    // 弓臂向后掠
    mxB(1.25, 0.12, 0.13, -0.93, 0.3, 0.7, 0x7a5230, T.plank, [0, -0.42, 0]), mxB(1.25, 0.12, 0.13, 0.93, 0.3, 0.7, 0x7a5230, T.plank, [0, 0.42, 0]),
    mxB(0.14, 0.16, 0.16, -1.5, 0.3, 0.45, iron, 'metal'), mxB(0.14, 0.16, 0.16, 1.5, 0.3, 0.45, iron, 'metal'),
    // 弓弦拉到扳机
    mxB(1.8, 0.03, 0.03, -0.75, 0.31, -0.05, 0x2a2018, 'plain', [0, 0.588, 0]), mxB(1.8, 0.03, 0.03, 0.75, 0.31, -0.05, 0x2a2018, 'plain', [0, -0.588, 0]),
    mxB(0.2, 0.14, 0.2, 0, 0.32, -0.6, iron, 'metal'),
    // 绞盘
    mxC(0.09, 0.09, 0.7, 6, 0, 0.12, -0.95, 0x6a4026, 'bark', [0, 0, Math.PI / 2]), mxB(0.04, 0.42, 0.04, -0.38, 0.12, -0.95, 0x6a4026), mxB(0.04, 0.42, 0.04, 0.38, 0.12, -0.95, 0x6a4026),
    // 前面的大盾：蓝底金十字（友军的标志）
    mxB(1.0, 0.62, 0.08, 0, -0.22, 1.1, 0x2b4fb8, MX.tiles().canvas), mxB(0.1, 0.44, 0.04, 0, -0.22, 1.15, 0xe8b83a, 'gold'), mxB(0.44, 0.1, 0.04, 0, -0.14, 1.15, 0xe8b83a, 'gold'),
    mxB(1.04, 0.06, 0.1, 0, 0.1, 1.12, 0xe8b83a, 'gold'), mxB(1.04, 0.06, 0.1, 0, -0.54, 1.12, 0xe8b83a, 'gold')
  ];
};
MX.loadedBoltParts = function () {
  return [mxB(0.12, 0.12, 1.8, 0, 0.37, 0.25, 0x6a4a2a, 'wood'), mxK(0.16, 0.42, 4, 0, 0.37, 1.35, 0xc0c8d0, 'metal', [Math.PI / 2, 0, 0]), mxB(0.36, 0.02, 0.26, 0, 0.37, -0.52, 0xffd84a, 'plain')];
};
MX.pennantParts = function () {
  return [mxC(0.03, 0.03, 1.7, 5, 0, 0.85, 0, 0x6a4026), mxB(0.04, 0.42, 0.72, 0, 1.45, 0.37, 0x2b4fb8, MX.tiles().canvas), mxB(0.05, 0.1, 0.74, 0, 1.6, 0.37, 0xe8b83a, 'gold'), ['oct', [0.07], [0, 1.74, 0], 0xe8b83a, null, null, 'gold']];
};
Interact.KINDS.ballista = {
  radius: 2.8,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('ballista', MX.ballistaParts)));
    o.top = new THREE.Group();
    o.top.position.y = 0.95;
    o.top.scale.setScalar(1.2);
    o.top.rotation.y = rand(-0.6, 0.6);
    o.top.add(MX.mesh(MX.geo('ballistaTop', MX.ballistaTopParts)));
    o.loaded = MX.mesh(MX.geo('ballistaBolt', MX.loadedBoltParts));
    o.top.add(o.loaded);
    o.flag = new THREE.Group();
    o.flag.position.set(-0.32, 0.25, -0.95);
    o.flag.add(MX.mesh(MX.geo('pennant', MX.pennantParts)));
    o.flag.scale.set(1, 0.01, 1);
    o.top.add(o.flag);
    o.crest = MX.mesh(MX.geo('ballistaCrest', function () { return [mxB(0.12, 0.46, 0.04, 0, -0.22, 1.17, 0xffe27a, 'plain'), mxB(0.46, 0.12, 0.04, 0, -0.14, 1.17, 0xffe27a, 'plain')]; }), 'glow');
    o.crest.visible = false;
    o.top.add(o.crest);
    g.add(o.top);
    return g;
  },
  init: function (o) {
    var mat = new THREE.MeshBasicMaterial({ color: 0x4a9cff, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    var pix = FX.getGeo('pring');
    o.allyRing = new THREE.Mesh(pix || new THREE.RingGeometry(1.9, 2.4, 32).rotateX(-Math.PI / 2), mat);
    if (pix) o.allyRing.scale.setScalar(2.35);
    o.allyRing.renderOrder = 3;
    o.allyRing.position.set(o.x, o.y + 0.36, o.z);
    o.allyRing.visible = false;
    Game.scene.add(o.allyRing);
    o.parts.push(o.allyRing);
  },
  label: function () { return '弩车：召唤 30 秒的友军炮台 · 自动射击'; },
  use: function (o) { MX.activateBallista(o); },
  mapIcon: { color: '#4a9cff', shape: 'square', size: 3 },
  clear: function () { MX.reset(); }
};

// ============================================================
//  战马（拴马桩旁）：骑 45 秒，移动速度 ×1.6、接触伤害减半、践踏敌人
// ============================================================
MX.hitchParts = function () {
  var T = MX.tiles(), wood = 0x6a4026;
  return [
    mxB(0.2, 1.3, 0.2, -1.4, 0.65, -0.55, wood, 'bark'), mxB(0.2, 1.3, 0.2, 1.4, 0.65, -0.55, wood, 'bark'),
    mxC(0.07, 0.07, 3.0, 6, 0, 1.15, -0.55, 0x7a5230, 'bark', [0, 0, Math.PI / 2]),
    mxB(0.035, 0.6, 0.035, 0.85, 0.9, -0.5, 0xc8a870, null, [0.5, 0, 0]),
    // 水槽、干草
    mxB(1.5, 0.9, 0.55, 2.1, 0.05, -0.45, 0x7a5230, T.plank), mxB(1.36, 0.04, 0.42, 2.1, 0.46, -0.45, 0x3a7aa0, 'plain'),
    mxB(0.9, 0.85, 0.6, -2.1, 0.12, 0.35, 0xd9b44a, 'fur'), mxB(0.85, 0.5, 0.55, -2.05, 0.8, 0.35, 0xcfa840, 'fur', [0, 0.3, 0]),
    mxB(0.92, 0.06, 0.08, -2.1, 0.3, 0.66, 0x8a6a2a), mxB(0.92, 0.06, 0.08, -2.1, 0.3, 0.04, 0x8a6a2a),
    // 一面小旗：告诉玩家这是骑士的马
    mxC(0.03, 0.03, 2.2, 5, -1.4, 1.4, -0.55, 0x5a3a20), mxB(0.04, 0.4, 0.6, -1.4, 2.25, -0.25, 0x2b4fb8, T.canvas), mxB(0.05, 0.08, 0.62, -1.4, 2.4, -0.25, 0xe8b83a, 'gold')
  ];
};
Interact.KINDS.warhorse = {
  radius: 3.0,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('hitch', MX.hitchParts)));
    var h = MX.buildHorse();
    h.rig.position.set(0, 0, 0.5);
    h.rig.rotation.y = Math.PI / 2;
    g.add(h.rig);
    o.horse = h;
    return g;
  },
  label: function () { return MX.mount ? '你已经骑着战马了' : '战马：骑上去冲锋 45 秒 · 加速、减伤、践踏敌人'; },
  canUse: function () { return !MX.mount && P.alive; },
  denied: function () { return '你已经骑着战马了'; },
  use: function (o) { MX.mountHorse(o); },
  update: function (o, dt, d2) { if (d2 < 3600) MX.animHorse(o.horse, dt, 0, false, true); },
  mapIcon: { color: '#d0955a', shape: 'diamond', size: 3.4 },
  clear: function () { MX.reset(); }
};

// ============================================================
//  投石跳台：踩上去（不用按键）就被抛向镜头朝向，又高又远；每台冷却 1.5 秒，可以反复用
// ============================================================
MX.catBaseParts = function () {
  var T = MX.tiles();
  var p = [mxC(1.95, 2.05, 0.38, 10, 0, 0.11, 0, 0x8a5a32, T.plank), mxC(1.85, 1.85, 1.2, 10, 0, -0.62, 0, 0x5a4030, T.plank), ['torus', [1.98, 0.07, 4, 20], [0, 0.3, 0], 0x4a4d56, [Math.PI / 2, 0, 0], null, 'metal']];
  for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; p.push(mxB(0.12, 0.06, 0.12, Math.cos(a) * 1.75, 0.32, Math.sin(a) * 1.75, 0x55575e, 'metal')); }
  return p;
};
MX.catFrameParts = function () {
  var T = MX.tiles(), wood = 0x7a5230;
  var p = [];
  [-0.85, 0.85].forEach(function (x) {
    p.push(mxB(0.18, 0.18, 2.75, x, 0.42, 0.62, wood, T.plank));
    p.push(mxB(0.16, 0.96, 0.16, x, 0.835, 1.965, wood, T.plank, [-0.515, 0, 0]), mxB(0.16, 0.96, 0.16, x, 0.835, 1.495, wood, T.plank, [0.515, 0, 0]));
    p.push(mxB(0.22, 0.22, 0.22, x, 1.25, 1.73, 0x4a4d56, 'metal'));
  });
  p.push(mxC(0.09, 0.09, 1.95, 6, 0, 1.25, 1.73, 0x4a4d56, 'metal', [0, 0, Math.PI / 2]));
  p.push(mxB(1.88, 0.14, 0.14, 0, 0.42, 2.2, wood, T.plank), mxB(1.88, 0.14, 0.14, 0, 0.42, -0.75, wood, T.plank));
  return p;
};
// 抛臂：支点在轴上，杯子在 -Z 一端（静止时正好平放在转台中心），配重在 +Z 一端
MX.CAT_REST = -0.442;
MX.catArmParts = function () {
  var T = MX.tiles(), a0 = -MX.CAT_REST, c = Math.cos(a0), s = Math.sin(a0), cy = -0.06, cz = -1.94;
  var at = function (x, y, z) { return [x, cy + y * c - z * s, cz + y * s + z * c]; };   // 绕杯子中心预先转正
  var p = [mxB(0.2, 0.2, 2.5, 0, 0, -0.7, 0x8a5a32, T.plank), mxB(0.25, 0.25, 0.08, 0, 0, -0.25, 0x4a4d56, 'metal'), mxB(0.25, 0.25, 0.08, 0, 0, -1.2, 0x4a4d56, 'metal')];
  p.push(['mxbox', [1.0, 0.08, 0.95], at(0, 0, 0), 0x7a5230, [a0, 0, 0], null, T.plank]);
  [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (q) { p.push(['mxbox', [0.08, 0.24, 0.08], at(q[0] * 0.46, 0.14, q[1] * 0.43), 0x5a3a20, [a0, 0, 0], null, 'bark']); });
  p.push(['mxbox', [1.0, 0.06, 0.06], at(0, 0.24, 0.43), 0x5a3a20, [a0, 0, 0], null, 'bark'], ['mxbox', [1.0, 0.06, 0.06], at(0, 0.24, -0.43), 0x5a3a20, [a0, 0, 0], null, 'bark']);
  p.push(['mxbox', [0.06, 0.06, 0.92], at(0.46, 0.24, 0), 0x5a3a20, [a0, 0, 0], null, 'bark'], ['mxbox', [0.06, 0.06, 0.92], at(-0.46, 0.24, 0), 0x5a3a20, [a0, 0, 0], null, 'bark']);
  p.push(mxB(0.8, 0.7, 0.7, 0, -0.32, 0.55, 0x6e7078, T.block), mxB(0.84, 0.08, 0.74, 0, -0.08, 0.55, 0x4a4d56, 'metal'), mxB(0.84, 0.08, 0.74, 0, -0.5, 0.55, 0x4a4d56, 'metal'));
  return p;
};
MX.catGlowParts = function () { return [['torus', [0.86, 0.07, 4, 20], [0, 0.34, 0], 0xb4f03c, [Math.PI / 2, 0, 0], null, 'plain'], ['torus', [1.55, 0.05, 4, 24], [0, 0.33, 0], 0x8ad02a, [Math.PI / 2, 0, 0], null, 'plain']]; };
MX.arrowParts = function () { return [mxK(0.32, 0.44, 4, 0, 0.22, 0, 0xc8ff5a, 'plain'), mxB(0.14, 0.42, 0.14, 0, -0.2, 0, 0xc8ff5a, 'plain')]; };
Interact.KINDS.catapult = {
  noPrompt: true,
  label: function () { return '投石跳台：踩上去就会被抛飞'; },
  use: function () {},
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('catBase', MX.catBaseParts)));
    o.frame = new THREE.Group();
    o.frame.add(MX.mesh(MX.geo('catFrame', MX.catFrameParts)));
    o.arm = new THREE.Group();
    o.arm.position.set(0, 1.25, 1.73);
    o.arm.rotation.x = MX.CAT_REST;
    o.arm.add(MX.mesh(MX.geo('catArm', MX.catArmParts)));
    o.frame.add(o.arm);
    g.add(o.frame);
    o.glow = MX.mesh(MX.geo('catGlow', MX.catGlowParts), 'glow');
    g.add(o.glow);
    o.arrow = MX.mesh(MX.geo('catArrow', MX.arrowParts), 'glow');
    o.arrow.position.y = 2.3;
    g.add(o.arrow);
    return g;
  },
  init: function (o) {
    o.cd = 0; o.armed = true; o.swingT = 9;
    MX.collide(o.x, o.z, 2.0, o.y + 0.3);
    o.beamMat = MX.additive(0xb4f03c, 0.35);
    o.beam = new THREE.Mesh(MX.beamGeo(), o.beamMat);
    o.beam.position.set(o.x, o.y + 0.35, o.z);
    o.beam.scale.set(0.85, 3.2, 0.85);
    Game.scene.add(o.beam);
    o.parts.push(o.beam);
  },
  update: function (o, dt, d2, dy) {
    o.cd = Math.max(0, o.cd - dt);
    if (!o.armed && d2 > 2.6 * 2.6) o.armed = true;
    // 抛臂：0.14 秒甩起来，停一下，再慢慢放回去
    if (o.swingT < 2) {
      o.swingT += dt;
      var s = o.swingT, a;
      if (s < 0.14) a = MX.CAT_REST + (2.0 - MX.CAT_REST) * Math.sin(s / 0.14 * Math.PI / 2);
      else if (s < 0.45) a = 2.0 + Math.sin((s - 0.14) * 30) * 0.06 * (0.45 - s) * 3;
      else if (s < 1.45) { var k = (s - 0.45) / 1.0; a = 2.0 + (MX.CAT_REST - 2.0) * k * k * (3 - 2 * k); }
      else a = MX.CAT_REST;
      o.arm.rotation.x = a;
    }
    var ready = o.cd <= 0;
    if (d2 < 4900) {
      o.arrow.visible = ready;
      o.arrow.position.y = 2.3 + Math.sin(Game.time * 3 + o.idx) * 0.18;
      o.arrow.rotation.y += dt * 2;
      o.glow.scale.setScalar(ready ? 1 + Math.sin(Game.time * 5) * 0.06 : 0.7);
      o.beamMat.opacity = ready ? 0.3 + Math.sin(Game.time * 4 + o.idx) * 0.08 : 0.05;
    }
    if (ready && o.armed && P.alive && d2 < 1.15 * 1.15 && dy > -0.7 && dy < 1.3) MX.launch(o);
  },
  mapIcon: { color: '#c8ff5a', shape: 'triangle', size: 2.8 },      // 往上弹的箭头
  clear: function () { MX.reset(); }
};

// ============================================================
//  骑士古墓：推开墓门，冲出 4 + 2×关卡数 个亡灵精英；全灭 → 金宝箱 + 一大把经验
// ============================================================
MX.cryptCount = function () { return 4 + 2 * Game.stage; };
MX.undeadTypes = function () {
  var pref = [['skelarmor', 'skeleton', 'skelarmor'], ['dustyarmor', 'dustyskel', 'mummy'], ['skelarmor', 'skeleton', 'zombie', 'ghost2']][Game.stage - 1] || ['skeleton'];
  var ok = pref.filter(function (id) { return ENEMIES[id] && !ENEMIES[id].boss && !ENEMIES[id].miniboss; });
  return ok.length ? ok : Director.currentPool().types;
};
MX.cryptParts = function () {
  var T = MX.tiles(), wall = 0x8c877e, light = 0xa8a298, dark = 0x6e6a64, roof = 0x5e5a66;
  var p = [
    mxB(4.6, 1.6, 5.2, 0, -0.55, -0.1, dark, T.block),
    mxB(2.2, 0.3, 0.5, 0, 0.0, 2.7, 0x7e7a72, T.block), mxB(2.5, 0.2, 0.5, 0, -0.05, 3.15, 0x76726a, T.block),
    // 墙（分块，让石砖贴图更密）
    mxB(0.5, 2.9, 1.95, -1.65, 1.7, 0.53, wall, T.block), mxB(0.5, 2.9, 1.95, -1.65, 1.7, -1.42, wall, T.block),
    mxB(0.5, 2.9, 1.95, 1.65, 1.7, 0.53, wall, T.block), mxB(0.5, 2.9, 1.95, 1.65, 1.7, -1.42, wall, T.block),
    mxB(1.9, 2.9, 0.5, -0.95, 1.7, -2.15, wall, T.block), mxB(1.9, 2.9, 0.5, 0.95, 1.7, -2.15, wall, T.block),
    mxB(1.15, 2.9, 0.5, -1.33, 1.7, 1.25, wall, T.block), mxB(1.15, 2.9, 0.5, 1.33, 1.7, 1.25, wall, T.block), mxB(1.5, 0.75, 0.5, 0, 2.78, 1.25, wall, T.block),
    mxB(2.8, 2.9, 3.3, 0, 1.7, -0.5, 0x101014, 'plain'),
    // 门框、柱子、横梁、山花
    mxB(0.2, 2.2, 0.2, -0.82, 1.35, 1.52, light, T.block), mxB(0.2, 2.2, 0.2, 0.82, 1.35, 1.52, light, T.block), mxB(1.84, 0.24, 0.24, 0, 2.5, 1.52, light, T.block),
    mxC(0.24, 0.27, 2.7, 8, -1.32, 1.6, 1.72, light, T.block), mxC(0.24, 0.27, 2.7, 8, 1.32, 1.6, 1.72, light, T.block),
    mxB(0.64, 0.22, 0.64, -1.32, 0.36, 1.72, light, T.block), mxB(0.64, 0.22, 0.64, 1.32, 0.36, 1.72, light, T.block),
    mxB(0.64, 0.22, 0.64, -1.32, 3.0, 1.72, light, T.block), mxB(0.64, 0.22, 0.64, 1.32, 3.0, 1.72, light, T.block),
    mxB(4.1, 0.36, 0.84, 0, 3.27, 1.45, 0x9a958c, T.block),
    ['mxcyl', [1.0, 1.0, 0.6, 3], [0, 3.72, 1.5], 0x9a958c, [-Math.PI / 2, 0, 0], [2.05, 1, 0.55], T.block],
    // 屋顶两坡 + 屋脊
    mxB(2.45, 0.28, 4.6, -1.05, 3.85, -0.4, roof, T.block, [0, 0, 0.42]), mxB(2.45, 0.28, 4.6, 1.05, 3.85, -0.4, roof, T.block, [0, 0, -0.42]),
    mxB(0.32, 0.26, 4.7, 0, 4.42, -0.4, 0x4e4a56, T.block),
    // 山花上的浮雕：头盔 + 交叉的剑
    mxB(0.07, 0.95, 0.05, 0, 3.72, 1.86, 0xc8c8d0, 'metal', [0, 0, 0.7]), mxB(0.07, 0.95, 0.05, 0, 3.72, 1.86, 0xc8c8d0, 'metal', [0, 0, -0.7]),
    mxB(0.4, 0.42, 0.12, 0, 3.72, 1.9, 0xb8b2a6, T.block), mxB(0.3, 0.05, 0.04, 0, 3.76, 1.97, 0x2a2a2e, 'plain'), mxB(0.06, 0.2, 0.1, 0, 4.0, 1.88, 0xb8b2a6),
    // 苔藓
    mxB(1.0, 0.06, 0.6, -1.75, 3.42, 0.9, 0x3e5a2a, 'leaf', [0, 0, 0.42]), mxB(0.8, 0.06, 0.5, 1.7, 3.48, -1.4, 0x3e5a2a, 'leaf', [0, 0, -0.42]),
    mxB(0.9, 0.35, 0.06, -1.6, 0.42, 1.52, 0x46622e, 'leaf'), mxB(0.06, 0.4, 1.2, 1.92, 0.45, -0.8, 0x46622e, 'leaf'),
    // 门前的蜡烛
    mxC(0.05, 0.05, 0.32, 5, -1.85, 0.4, 2.3, 0xe8e0c8, 'bone'), mxC(0.05, 0.05, 0.26, 5, 1.85, 0.37, 2.3, 0xe8e0c8, 'bone'),
    // 两边的小墓碑和插在地上的断剑
    mxB(0.55, 0.8, 0.16, -3.0, 0.4, 1.4, 0x8c877e, 'rock', [0, 0.2, 0.05]), mxC(0.27, 0.27, 0.16, 8, -3.0, 0.8, 1.4, 0x8c877e, 'rock', [Math.PI / 2, 0.2, 0]),
    mxB(0.5, 0.7, 0.15, 3.0, 0.35, 0.6, 0x7e7a72, 'rock', [0, -0.3, -0.08]), mxB(0.08, 0.9, 0.04, 2.6, 0.42, 2.2, 0xb8c0cc, 'metal', [0.2, 0, 0.15]), mxB(0.3, 0.06, 0.06, 2.62, 0.82, 2.25, 0x6a5a3a, null, [0.2, 0, 0.15])
  ];
  return p;
};
MX.cryptDoorParts = function () {
  var T = MX.tiles();
  return [
    mxB(1.45, 2.12, 0.22, 0, 1.06, -0.11, 0x6a6258, T.block), mxB(1.47, 0.1, 0.25, 0, 0.5, -0.11, 0x3d3f46, 'metal'), mxB(1.47, 0.1, 0.25, 0, 1.62, -0.11, 0x3d3f46, 'metal'),
    mxB(0.13, 1.25, 0.05, 0, 1.05, 0.02, 0x8a8478, T.block), mxB(0.52, 0.11, 0.05, 0, 1.45, 0.02, 0x8a8478, T.block), mxB(0.1, 0.1, 0.06, 0, 1.6, 0.03, 0x8a8478, T.block),
    ['torus', [0.12, 0.025, 4, 10], [0.45, 1.05, 0.03], 0x3d3f46, null, null, 'metal']
  ];
};
// 门缝里漏出来的幽绿光 + 门内的光 + 蜡烛的鬼火（夜里和浓雾里也要看得见，缝和火苗做粗一点）
MX.cryptGlowParts = function (gold) {
  var c = gold ? 0xffd27a : 0x6dffb0;
  return [mxB(1.56, 0.09, 0.06, 0, 2.39, 1.57, c, 'plain'), mxB(0.09, 2.12, 0.06, -0.77, 1.32, 1.57, c, 'plain'), mxB(0.09, 2.12, 0.06, 0.77, 1.32, 1.57, c, 'plain'),
    mxB(1.3, 1.95, 0.05, 0, 1.25, 0.98, gold ? 0x8a6a2a : 0x1f7a4a, 'plain'),
    mxK(0.1, 0.3, 4, -1.85, 0.71, 2.3, c, 'plain'), mxK(0.09, 0.27, 4, 1.85, 0.64, 2.3, c, 'plain'), mxK(0.05, 0.14, 4, -1.85, 0.66, 2.3, 0xffffff, 'plain'), mxK(0.05, 0.13, 4, 1.85, 0.6, 2.3, 0xffffff, 'plain')];
};
Interact.KINDS.crypt = {
  radius: 3.8,
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('crypt', MX.cryptParts)));
    o.door = new THREE.Group();
    o.door.position.set(0, 0.25, 1.55);
    o.door.add(MX.mesh(MX.geo('cryptDoor', MX.cryptDoorParts)));
    g.add(o.door);
    o.glow = MX.mesh(MX.geo('cryptGlow', function () { return MX.cryptGlowParts(false); }), 'glow');
    g.add(o.glow);
    return g;
  },
  init: function (o) {
    var c = MX.local(o, 0, -0.45);
    MX.collide(c.x, c.z, 2.15, o.y + 3.5);
    // 门前地上一片幽绿的光（加法混合，雾里也看得见）；古墓肃清后变成金色
    var f = MX.local(o, 0, 2.5);
    o.floorMat = MX.additive(0x2a9a5a, 0.7);
    o.floor = new THREE.Mesh(MX.discGeo(f.x, o.y, f.z, 2.6, 0xffffff, 0x000000, 20), o.floorMat);
    o.floor.position.set(f.x, o.y, f.z);
    o.floor.renderOrder = 2;
    Game.scene.add(o.floor);
    o.parts.push(o.floor);
  },
  label: function () { return '骑士古墓：放出 ' + MX.cryptCount() + ' 个亡灵精英 · 全灭得金宝箱'; },
  use: function (o) { MX.openCrypt(o); },
  update: function (o, dt, d2) {
    if (d2 > 2500) return;
    o.glow.scale.y = 1 + Math.sin(Game.time * 7 + o.idx) * 0.04;
    if (Math.random() < dt * 2) { var p = MX.local(o, rand(-0.6, 0.6), 1.7); MX.part(p.x, o.y + rand(0.3, 2.2), p.z, 0, rand(0.3, 0.8), 0, 1.5, 0.1, 0.04, 0x6dffb0, 0.2); }
  },
  mapIcon: { color: '#b9b2ff', shape: 'cross', size: 3.4 },         // 墓地十字
  clear: function () { MX.reset(); }
};
MX.openCrypt = function (o) {
  o.used = true;
  var n = MX.cryptCount(), types = MX.undeadTypes(), list = [];
  for (var i = 0; i < n; i++) {
    var a = (i / Math.max(1, n - 1) - 0.5) * 2.4, d = rand(2.4, 4.4);
    var p = MX.local(o, Math.sin(a) * d, 2.4 + Math.cos(a) * d);
    var e = Enemies.spawn(pick(types), p.x, p.z, { elite: true, hpMult: Director.hpMult() * 0.8, dmgMult: Director.dmgMult() * 1.3 });
    // 从墓里冲出来：往外弹
    e.y = W.terrainH(p.x, p.z);
    var ox = p.x - o.x, oz = p.z - o.z, od = Math.sqrt(ox * ox + oz * oz) || 1;
    e.kx = ox / od * 10; e.kz = oz / od * 10; e.vy = 7; e.grounded = false;
    list.push(e);
  }
  var f = MX.local(o, 0, 3.7);
  Game.challenges.push({ x: f.x, z: f.z, list: list, mxCrypt: o });
  var dp = MX.local(o, 0, 1.8);
  FX.burst(dp.x, o.y + 1.2, dp.z, 30, 0x8a847a, 7, 0.4);
  MX.smoke(dp.x, o.y + 0.6, dp.z, 18, 0x6a6660, 1.2, 0.6);
  MX.sparks(dp.x, o.y + 1.4, dp.z, 16, [0x6dffb0, 0xb8ffe0], 6, 0.14);
  Game.shake(0.7);
  UI.toast('墓门被撞开了！击败所有亡灵骑士', Kit.color('org'));
  // 墓门往前倒下，弹两下
  o.doorA = 0; o.doorV = 0;
  MX.anims.push({ o: o, fn: function (q, dt) {
    q.doorV += 10 * dt;
    q.doorA += q.doorV * dt;
    if (q.doorA >= Math.PI / 2 - 0.02) {
      q.doorA = Math.PI / 2 - 0.02;
      if (q.doorV > 1.5) { var lp = MX.local(q, 0, 2.6); FX.burst(lp.x, q.y + 0.3, lp.z, 10, 0x8a847a, 4, 0.3); Game.shake(0.3); }
      q.doorV = q.doorV > 1.5 ? -q.doorV * 0.25 : 0;
    }
    q.door.rotation.x = q.doorA;
    return !(q.doorV === 0 && q.doorA >= Math.PI / 2 - 0.03);
  } });
};
MX.checkCrypts = function () {
  for (var i = Game.challenges.length - 1; i >= 0; i--) {
    var c = Game.challenges[i];
    if (!c.mxCrypt) continue;
    var done = true;
    for (var k = 0; k < c.list.length; k++) if (c.list[k].alive) { done = false; break; }
    if (!done) continue;
    Game.challenges.splice(i, 1);
    MX.cryptDone(c);
  }
};
MX.cryptDone = function (c) {
  var o = c.mxCrypt, y = o.y;
  Interact.spawnChest(c.x, c.z, true);
  for (var i = 0; i < 8; i++) Pickups.xp(c.x + rand(-1.2, 1.2), y + 1.5, c.z + rand(-1.2, 1.2), 60 * Game.stage / 8);
  if (o.glow) o.glow.geometry = MX.geo('cryptGlowGold', function () { return MX.cryptGlowParts(true); });
  if (o.floorMat) o.floorMat.color.set(0xc8962a);
  MX.pillar(c.x, y, c.z, 0xffd27a, 1.4, 9, 1.2);
  FX.burst(c.x, y + 1.5, c.z, 24, 0xffd84a, 7, 0.3);
  UI.toast('古墓肃清！金宝箱和一大把经验', '#ffd84a');
};

// ============================================================
//  战旗据点：在 7 米的圈里站满 12 秒（离开会倒退）；占领中刷怪加快 ×1.5
//  占领后旗子变金：一级的经验、金币、金宝箱
// ============================================================
MX.bannerParts = function () {
  var T = MX.tiles();
  return [
    mxC(1.1, 1.25, 1.2, 8, 0, -0.35, 0, 0x8c877e, T.block), mxC(0.72, 0.8, 0.3, 8, 0, 0.4, 0, 0x9a958c, T.block),
    mxC(0.07, 0.09, 5.8, 6, 0, 3.45, 0, 0x5a4030, 'bark'), mxC(0.11, 0.11, 0.1, 6, 0, 1.0, 0, 0xe8b83a, 'gold'), mxC(0.11, 0.11, 0.1, 6, 0, 6.0, 0, 0xe8b83a, 'gold'),
    mxC(0.05, 0.05, 1.6, 5, 0, 6.1, 0, 0x5a4030, 'bark', [0, 0, Math.PI / 2]), ['oct', [0.08], [-0.82, 6.1, 0], 0xe8b83a, null, null, 'gold'], ['oct', [0.08], [0.82, 6.1, 0], 0xe8b83a, null, null, 'gold'],
    ['oct', [0.17], [0, 6.58, 0], 0xe8b83a, null, [1, 1.6, 1], 'gold'], mxC(0.1, 0.13, 0.14, 6, 0, 6.38, 0, 0xe8b83a, 'gold'),
    // 底座上的盾形浮雕
    mxB(0.4, 0.3, 0.08, 0, 0.42, 0.74, 0xb8b2a6, T.block), mxB(0.4, 0.3, 0.08, 0, 0.42, -0.74, 0xb8b2a6, T.block)
  ];
};
// 旗面：白底（由材质颜色染成红 → 蓝 → 金），深色的剑形纹章
MX.clothParts = function () {
  var T = MX.tiles();
  return [mxB(1.35, 2.3, 0.05, 0, -1.2, 0.04, 0xffffff, T.canvas), mxB(0.62, 0.45, 0.05, -0.36, -2.52, 0.04, 0xffffff, T.canvas, [0, 0, 0.12]), mxB(0.62, 0.45, 0.05, 0.36, -2.52, 0.04, 0xffffff, T.canvas, [0, 0, -0.12]),
    mxB(0.16, 1.3, 0.07, 0, -1.25, 0.05, 0x3a3a3a, 'plain'), mxB(0.7, 0.14, 0.07, 0, -0.9, 0.05, 0x3a3a3a, 'plain'), mxB(0.24, 0.24, 0.07, 0, -0.6, 0.05, 0x3a3a3a, 'plain'),
    mxB(1.4, 0.1, 0.07, 0, -0.08, 0.05, 0x8a8a8a, 'plain')];
};
MX.BANNER_ENEMY = new THREE.Color(0x8a1e2a);
MX.BANNER_KNIGHT = new THREE.Color(0x3a66e0);
Interact.KINDS.banner = {
  noPrompt: true,
  label: function () { return '战旗据点：站进圈里占领'; },
  use: function () {},
  model: function (o) {
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('banner', MX.bannerParts)));
    o.clothMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.atlas, color: MX.BANNER_ENEMY.clone(), side: THREE.DoubleSide });
    o.cloth = new THREE.Group();
    o.cloth.position.set(0, 6.08, 0);
    o.cloth.add(new THREE.Mesh(MX.geo('bannerCloth', MX.clothParts), o.clothMat));
    g.add(o.cloth);
    return g;
  },
  init: function (o) {
    o.charge = 0;
    MX.collide(o.x, o.z, 1.2, o.y + 0.55);
    MX.collide(o.x, o.z, 0.3, o.y + 6.5);
    // 据点范围：敌方的深红像素圈（原来的亮粉色在深色地面上太扎眼）；占领进度：我方的蓝色像素圈
    o.ringMat = new THREE.MeshBasicMaterial({ color: 0xc23a48, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide });
    o.ring = new THREE.Mesh(MX.pixelRingGeo(o.x, o.y, o.z, 6.72, 7, 0.24), o.ringMat);
    o.arcMat = new THREE.MeshBasicMaterial({ color: 0x6aa8ff, transparent: true, opacity: 0.95, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
    o.arc = new THREE.Mesh(MX.pixelRingGeo(o.x, o.y, o.z, 6.6, 7.12, 0.24), o.arcMat);
    o.arc.renderOrder = 3;
    o.wallMat = MX.additive(0x5a8cff, 0);
    o.wall = new THREE.Mesh(MX.wallGeo(o.x, o.y, o.z, 7, 1.4, 64), o.wallMat);
    [o.ring, o.arc, o.wall].forEach(function (m) { m.position.set(o.x, o.y, o.z); Game.scene.add(m); o.parts.push(m); });
    MX.ringArc(o.arc.geometry, 0);
    // 圈边上的几块界石
    var st = [];
    for (var i = 0; i < 8; i++) {
      var a = i / 8 * TAU + 0.2, sx = Math.cos(a) * 7.35, sz = Math.sin(a) * 7.35;
      st.push(['dodec', [0.24], [sx, W.terrainH(o.x + sx, o.z + sz) - o.y + 0.1, sz], 0x8c877e, null, [1, 1.4, 1], 'rock']);
    }
    var stones = new THREE.Mesh(MODEL.build(st), MX.mat('lit'));
    stones.position.set(o.x, o.y, o.z);
    Game.scene.add(stones);
    o.parts.push(stones);
  },
  update: function (o, dt, d2, dy) {
    var vis = d2 < 2500;
    o.ring.visible = vis;
    if (d2 < 6400) MX.waveCloth(o, dt);
    var inside = d2 < 49 && Math.abs(dy) < 4 && P.alive;
    o.charge = inside ? Math.min(1, o.charge + dt / 12) : Math.max(0, o.charge - dt * 0.12);
    o.arc.visible = vis && o.charge > 0;
    MX.ringArc(o.arc.geometry, o.charge);
    o.wallMat.opacity = lerp(o.wallMat.opacity, inside ? 0.35 + Math.sin(Game.time * 6) * 0.08 : 0, Math.min(1, dt * 6));
    o.clothMat.color.copy(MX.BANNER_ENEMY).lerp(MX.BANNER_KNIGHT, o.charge);
    if (inside) {
      MX.capturing = true;
      MX.progress = { text: '占领据点 · 刷怪加快', pct: o.charge, color: '#7ab0ff' };
      if (Math.random() < dt * 10) { var a = Math.random() * TAU; MX.part(o.x + Math.cos(a) * 7, o.y + 0.3, o.z + Math.sin(a) * 7, 0, rand(1, 2.5), 0, 0.8, 0.12, 0.04, 0x9ac0ff, 0); }
    }
    if (o.charge >= 1) MX.captureBanner(o);
  },
  // 三角小旗；占领中红白闪烁
  mapIcon: function (o) { return { color: o.charge > 0 && Math.floor(Game.realTime * 4) % 2 ? '#ffffff' : '#ff4d63', shape: 'triangle', size: 3.4 }; },
  clear: function () { MX.reset(); }
};
MX.waveCloth = function (o, dt) {
  var t = Game.time * 2.2 + o.idx * 1.7;
  o.cloth.rotation.x = 0.08 + Math.sin(t) * 0.07;
  o.cloth.rotation.y = Math.sin(t * 0.6) * 0.25;
  o.cloth.rotation.z = Math.sin(t * 1.3) * 0.03;
};
MX.captureBanner = function (o) {
  o.used = true;
  o.clothMat.color.set(0xffd24a);
  o.arc.visible = false; o.wall.visible = false;
  o.ringMat.color.set(0xffd24a);
  // 经验正好一级、金币、金宝箱（经验和金币直接飞向玩家）
  var g0 = Pickups.gems.length, c0 = Pickups.coins.length;
  var xp = P.xpNext / Math.max(0.1, P.st.xpGain);
  for (var i = 0; i < 6; i++) Pickups.xp(o.x + rand(-1, 1), o.y + 2, o.z + rand(-1, 1), xp / 6);
  var gold = Math.round(40 * MX.sf() * P.st.goldGain);
  for (i = 0; i < 5; i++) Pickups.gold(o.x + rand(-1, 1), o.y + 2, o.z + rand(-1, 1), i < 4 ? Math.floor(gold / 5) : gold - Math.floor(gold / 5) * 4);
  for (i = g0; i < Pickups.gems.length; i++) Pickups.gems[i].pull = true;
  for (i = c0; i < Pickups.coins.length; i++) Pickups.coins[i].pull = true;
  var cp = MX.local(o, 0, 2.6);
  Interact.spawnChest(cp.x, cp.z, true);
  MX.pillar(o.x, o.y, o.z, 0xffd24a, 1.6, 12, 1.4);
  FX.ring(o.x, o.y + 0.3, o.z, 7, 0xffd24a, 0.5);
  FX.burst(o.x, o.y + 5, o.z, 30, 0xffd24a, 7, 0.3);
  Game.shake(0.4);
  UI.toast('占领了战旗据点！经验、金币和金宝箱', Kit.color('gold'));
  // 金色的旗子继续飘，圈慢慢淡出
  o.capT = 0;
  MX.anims.push({ o: o, fn: function (q, dt) {
    q.capT += dt;
    q.ringMat.opacity = Math.max(0, 0.6 * (1 - q.capT / 2.5));
    q.ring.visible = q.ringMat.opacity > 0.01;
    if (dist2(P.pos.x, P.pos.z, q.x, q.z) < 6400) MX.waveCloth(q, dt);
    return true;
  } });
};

// ============================================================
//  火药桶堆：玩家一碰就点燃引信，0.7 秒后爆炸（7 米、伤害敌人、不伤玩家），会连锁引爆
// ============================================================
MX.barrel = function (p, x, z, y, r, h, lying, ry) {
  var T = MX.tiles(), red = 0xb3322a, rot = lying ? [0, ry || 0, Math.PI / 2] : null;
  if (lying) {
    var ax = Math.cos(ry || 0), az = -Math.sin(ry || 0);   // 躺着时桶的轴向（水平）
    p.push(mxC(r, r, h, 10, x, y + r, z, red, T.plank, rot));
    [-0.32, 0.32].forEach(function (k) { p.push(mxC(r * 1.08, r * 1.08, 0.07, 10, x + ax * k * h, y + r, z + az * k * h, 0x3d3f46, 'metal', rot)); });
    p.push(mxC(r * 1.07, r * 1.07, 0.12, 10, x, y + r, z, 0xe8c040, 'plain', rot));
    return;
  }
  p.push(mxC(r, r * 1.08, h + 0.4, 10, x, y + h / 2 - 0.2, z, red, T.plank));
  p.push(mxC(r * 1.1, r * 1.1, 0.07, 10, x, y + h * 0.18, z, 0x3d3f46, 'metal'), mxC(r * 1.1, r * 1.1, 0.07, 10, x, y + h * 0.82, z, 0x3d3f46, 'metal'));
  p.push(mxC(r * 1.09, r * 1.09, 0.12, 10, x, y + h * 0.5, z, 0xe8c040, 'plain'));
  p.push(mxC(r * 0.92, r * 0.92, 0.04, 10, x, y + h + 0.01, z, 0x5a3a20, T.plank));
};
MX.kegParts = function (variant) {
  var T = MX.tiles(), p = [];
  MX.barrel(p, 0, -0.35, 0, 0.42, 1.0);
  MX.barrel(p, 0.62, 0.32, 0, 0.4, 0.95);
  MX.barrel(p, -0.6, 0.3, 0, 0.38, 0.9);
  if (variant) MX.barrel(p, 0.1, 1.15, 0, 0.36, 0.95, true, 0.25);
  else MX.barrel(p, 0, -0.35, 1.03, 0.3, 0.7);
  // 引信（从桶顶垂下来，沿地面拖出去）、警示牌
  p.push(mxB(0.03, 0.03, 0.42, 0.05, 1.0, -0.2, 0x2a2018, 'plain', [-0.5, 0, 0]), mxB(0.03, 0.03, 0.85, 0.07, 0.58, 0.2, 0x2a2018, 'plain', [-1.25, 0, 0]));
  p.push(mxB(0.03, 0.03, 0.55, 0.1, 0.04, 0.85, 0x2a2018, 'plain', [0, 0.25, 0]), mxB(0.03, 0.03, 0.4, 0.2, 0.04, 1.25, 0x2a2018, 'plain', [0, -0.3, 0]));
  p.push(mxB(0.06, 0.85, 0.06, -1.15, 0.42, 0.95, 0x5a3a20), mxB(0.44, 0.34, 0.04, -1.15, 0.9, 0.97, 0xd8c070, T.plank), mxB(0.07, 0.16, 0.05, -1.15, 0.94, 1.0, 0xc03020, 'plain'), mxB(0.07, 0.05, 0.05, -1.15, 0.81, 1.0, 0xc03020, 'plain'));
  return p;
};
Interact.KINDS.powderkeg = {
  noPrompt: true,
  radius: 1.3,
  label: function () { return '火药桶：碰一下就会点燃引信'; },
  use: function () {},
  model: function (o) {
    var v = o.idx % 2;
    var g = new THREE.Group();
    o.body = MX.mesh(MX.geo('keg' + v, function () { return MX.kegParts(v); }));
    g.add(o.body);
    return g;
  },
  init: function (o) { o.fuse = -1; },
  update: function (o, dt, d2, dy) {
    if (o.fuse < 0) {
      if (d2 < 1.95 * 1.95 && Math.abs(dy) < 2 && P.alive) MX.lightKeg(o, 0.7);
      return;
    }
    o.fuse -= dt;
    var k = 1 - clamp(o.fuse / o.fuse0, 0, 1);
    // 火花沿着引信烧向桶
    var sp = MX.local(o, lerp(0.25, 0.05, k), lerp(1.42, -0.2, k)), sy = o.y + lerp(0.06, 1.05, k * k);
    for (var i = 0; i < 2; i++) MX.part(sp.x, sy, sp.z, rand(-1.5, 1.5), rand(1, 3), rand(-1.5, 1.5), rand(0.2, 0.4), 0.1, 0.03, pick([0xffe27a, 0xffa040, 0xffffff]), -10);
    // 桶在抖，越来越亮
    o.body.position.set(rand(-0.04, 0.04) * k, 0, rand(-0.04, 0.04) * k);
    var s = 1 + Math.max(0, Math.sin(Game.time * 40)) * 0.04 * k;
    o.body.scale.set(s, 1 + (s - 1) * 0.5, s);
    if (o.fuse <= 0) MX.explodeKeg(o);
  },
  mapIcon: { color: '#ff3b30', shape: 'star', size: 2.3 },          // 红色小星星（爆炸）；圆点、方块都容易和敌人的红点混
  clear: function () { MX.reset(); }
};
MX.lightKeg = function (o, fuse) {
  if (o.used) return;
  if (o.fuse >= 0) { o.fuse = Math.min(o.fuse, fuse); return; }
  o.fuse = fuse; o.fuse0 = fuse;
  FX.text(o.x, o.y + 2.2, o.z, '嘶——', '#ffb03a', 1.1);
};
MX.explodeKeg = function (o) {
  Interact.consume(o);
  var R = 7, x = o.x, y = o.y, z = o.z, dmg = 60 * MX.sf() * P.st.damage;
  FX.boom(x, y + 1, z, R, 0xff7a2a);
  FX.boom(x, y + 1, z, R * 0.5, 0xfff0a0);
  FX.ring(x, y, z, R, 0xffa040, 0.45);
  FX.burst(x, y + 1, z, 30, 0xff6a1a, 12, 0.4);
  FX.burst(x, y + 1, z, 14, 0x6a4026, 9, 0.3);
  MX.sparks(x, y + 1, z, 24, [0xffe27a, 0xffa040, 0xff5a1a], 10, 0.2);
  MX.smoke(x, y + 1.2, z, 18, 0x3a3634, 2.0, 1.0);
  MX.pillar(x, y, z, 0xff8a3a, 2.4, 6, 0.5);
  MX.scorch(x, y, z, 3.4);
  Game.shake(0.9);
  Enemies.inRadius(x, z, R, function (e) {
    if (Math.abs(e.y - y) > R) return;
    var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    Enemies.damage(e, dmg, 1, dx / d * 22, dz / d * 22);
    if (e.alive && !e.boss && !e.mini && !e.def.flyer) { e.vy = 9; e.grounded = false; }
  });
  // 连锁：附近的火药桶也被点燃
  Interact.list.forEach(function (k) { if (k.kind === 'powderkeg' && !k.used && dist2(k.x, k.z, x, z) < 8.5 * 8.5) MX.lightKeg(k, 0.25); });
};

// ============================================================
//  传送石：两块一对（同色），传送到另一块，3 秒冷却
// ============================================================
MX.stoneParts = function () {
  var T = MX.tiles(), st = 0x7a8090;
  return [
    mxC(1.25, 1.4, 0.9, 8, 0, -0.2, 0, 0x6e7280, T.block), mxC(0.95, 1.05, 0.15, 8, 0, 0.32, 0, 0x7e8290, T.block),
    mxB(1.0, 1.4, 0.62, 0, 1.08, 0, st, 'rock'), mxB(0.86, 1.1, 0.54, 0, 2.3, 0, st, 'rock'), mxK(0.52, 0.5, 4, 0, 3.1, 0, 0x6a7080, 'rock', [0, Math.PI / 4, 0]),
    mxB(1.06, 0.12, 0.68, 0, 1.8, 0, 0x5e6474, 'rock'), mxB(1.06, 0.12, 0.68, 0, 0.42, 0, 0x5e6474, 'rock')
  ];
};
MX.stoneGlowParts = function (c) {
  var T = MX.tiles(), p = [mxB(0.62, 1.0, 0.03, 0, 1.12, 0.32, c, T.rune), mxB(0.62, 1.0, 0.03, 0, 1.12, -0.32, c, T.rune), mxB(0.5, 0.7, 0.03, 0, 2.3, 0.28, c, T.rune), mxB(0.5, 0.7, 0.03, 0, 2.3, -0.28, c, T.rune)];
  for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; p.push(mxB(0.16, 0.06, 0.16, Math.cos(a) * 1.15, 0.42, Math.sin(a) * 1.15, c, 'plain')); }
  return p;
};
Interact.KINDS.waystone = {
  radius: 2.6,
  model: function (o) {
    var c = MX.PAIR[o.pair || 0], g = new THREE.Group();
    g.add(MX.mesh(MX.geo('stone', MX.stoneParts)));
    g.add(MX.mesh(MX.geo('stoneGlow' + (o.pair || 0), function () { return MX.stoneGlowParts(c); }), 'glow'));
    o.crystal = MX.mesh(MX.geo('stoneCrystal' + (o.pair || 0), function () { return [['oct', [0.3], [0, 0, 0], c, null, [1, 1.7, 1], 'plain'], ['oct', [0.18], [0, 0, 0], 0xffffff, null, [1, 1.7, 1], 'plain']]; }), 'glow');
    o.crystal.position.y = 3.75;
    g.add(o.crystal);
    return g;
  },
  init: function (o) {
    o.cd = 0;
    MX.collide(o.x, o.z, 0.62, o.y + 3.0);
    MX.collide(o.x, o.z, 1.4, o.y + 0.4);
    o.beamMat = MX.additive(MX.PAIR[o.pair || 0], 0.32);
    o.beam = new THREE.Mesh(MX.beamGeo(), o.beamMat);
    o.beam.position.set(o.x, o.y + 3.3, o.z);
    o.beam.scale.set(0.42, 18, 0.42);
    Game.scene.add(o.beam);
    o.parts.push(o.beam);
  },
  label: function (o) {
    if (o.cd > 0) return '传送石充能中 · ' + Math.ceil(o.cd) + ' 秒';
    var d = o.partner ? Math.round(Math.sqrt(dist2(o.x, o.z, o.partner.x, o.partner.z))) : 0;
    return '传送石：传送到同色的另一块 · ' + d + ' 米外';
  },
  canUse: function (o) { return o.cd <= 0 && !!o.partner && P.alive; },
  denied: function () { return '传送石还在充能'; },
  use: function (o) { MX.teleport(o); },
  update: function (o, dt, d2) {
    o.cd = Math.max(0, o.cd - dt);
    if (d2 < 64) MX.nearStone = o;
    else if (MX.nearStone === o) MX.nearStone = null;
    if (d2 > 6400) return;
    var t = Game.time + o.idx;
    o.crystal.position.y = 3.75 + Math.sin(t * 2) * 0.15;
    o.crystal.rotation.y += dt * 1.6;
    o.beamMat.opacity = (o.cd > 0 ? 0.12 : 0.3) + Math.sin(t * 3) * 0.05;
    if (d2 < 900 && Math.random() < dt * 4) MX.part(o.x + rand(-0.8, 0.8), o.y + 0.5, o.z + rand(-0.8, 0.8), 0, rand(1, 2.2), 0, 1.0, 0.1, 0.04, MX.PAIR[o.pair || 0], 0.5);
  },
  mapIcon: function (o) {
    var near = MX.nearStone && MX.nearStone.partner === o;
    return { color: MX.PAIR_CSS[o.pair || 0], shape: 'diamond', size: near ? 3.6 + 1.8 * (0.5 + 0.5 * Math.sin(Game.realTime * 8)) : 3.4 };
  },
  clear: function () { MX.reset(); }
};
MX.teleport = function (o) {
  var t = o.partner;
  if (!t) return;
  var c = MX.PAIR[o.pair || 0];
  MX.pillar(o.x, o.y, o.z, c, 1.3, 10, 0.7);
  MX.sparks(P.pos.x, P.pos.y + 1, P.pos.z, 16, [c, 0xffffff], 5, 0.15);
  // 落在另一块石头正前方 7 米处、面朝外：镜头在玩家身后，不会被石头和光柱挡住
  var out = MX.local(t, 0, 7);
  P.pos.set(out.x, W.groundAt(out.x, out.z, t.y + 2), out.z);
  P.vel.set(0, 0, 0);
  P.onGround = true;
  P.yaw = Math.atan2(out.x - t.x, out.z - t.z);
  P.facing = P.yaw;
  MX.flyT = 0;
  o.cd = 3; t.cd = 3;
  MX.pillar(t.x, t.y, t.z, c, 1.3, 10, 0.9);
  FX.ring(P.pos.x, P.pos.y, P.pos.z, 3, c, 0.4);
  MX.sparks(P.pos.x, P.pos.y + 1, P.pos.z, 16, [c, 0xffffff], 5, 0.15);
  MX.flash(MX.PAIR_CSS[o.pair || 0]);
  UI.toast('传送！', Kit.color('gold'));
};
