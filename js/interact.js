'use strict';
// ============================================================
//  可互动物体：宝箱、陶罐、烽火台（召唤首领）、下一关传送门；新的互动点在 interact_guild.js 和 interact_more.js
// ============================================================
var Interact = { list: [], near: null, chestsOpened: 0 };
// 其他文件注册的新互动物体：Interact.KINDS[kind] = { model, label, canUse, use, update, ... }（见文件末尾说明）
Interact.KINDS = {};

// ---------------- 可互动物体的像素贴图 ----------------
(function () {
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就退回默认贴图 */ } };
  // 横木板（宝箱）
  add('it_plank', function (x, y, r) {
    if (y % 5 === 4) return 112;
    var v = 214 + Math.sin(x * 0.7 + y * 2.1) * 14 + r() * 16;
    if ((x * 3 + y * 11) % 17 === 0) v = 150;
    return v;
  });
  // 刻着符文的石块
  var RUNE = ['................', '.......##.......', '....#..##..#....', '.....#.##.#.....', '......####......', '.......##.......',
    '.......##.......', '......####......', '.....#.##.#.....', '....#..##..#....', '.......##.......', '.......##.......',
    '................', '................', '................', '................'];
  add('it_rune', function (x, y, r) {
    var v = 212 + r() * 28;
    if (r() < 0.06) v = 160;
    if (x === 0 || y === 0 || x === 15 || y === 15) v = 150;
    if (RUNE[(y + 1) % 16][x] === '#') v = 95;
    return v;
  });
  // 陶罐：两道深色环 + 中间一圈浅色点点（对比别太强，免得在深色地面上太跳）
  add('it_clay', function (x, y, r) {
    var v = 200 + r() * 20;
    if (y === 4 || y === 11) v = 128;
    if (y > 5 && y < 10 && (x + (y >> 1)) % 4 === 0) v = 232;
    return v;
  });
})();

Interact.MODELS = null;
Interact.models = function () {
  if (Interact.MODELS) return Interact.MODELS;
  var m = {};
  // 用敌人的建模工具（贴图坐标正确、能发光）
  var B = function (parts) { return Enemies.buildGeo(parts, true); };
  var bx = ENEMY_KIT.bx, cy = ENEMY_KIT.cy, sp = ENEMY_KIT.sp, lit = ENEMY_KIT.lit, sym = ENEMY_KIT.sym;
  var Q = Math.PI / 2;
  // 宝箱：木板箱身、圆拱箱盖、金色包边和锁（微微发光）
  var chest = function (body, trim, k) {
    var parts = [
      bx([1.5, 0.72, 1.0], [0, 0.36, 0], body, 'it_plank'),
      cy(0.5, 0.5, 1.5, [0, 0.72, 0], body, 'wood', 10, [0, 0, Q]),
      bx([1.54, 0.07, 1.04], [0, 0.73, 0], 0x3a2614, 'wood'),
      bx([0.06, 0.1, 0.02], [0, 0.66, 0.565], 0x1a1008, 'plain')
    ].concat(lit(k, [
      bx([0.12, 0.76, 1.06], [0.5, 0.37, 0], trim, 'gold'), bx([0.12, 0.76, 1.06], [-0.5, 0.37, 0], trim, 'gold'),
      cy(0.52, 0.52, 0.12, [0.5, 0.72, 0], trim, 'gold', 10, [0, 0, Q]), cy(0.52, 0.52, 0.12, [-0.5, 0.72, 0], trim, 'gold', 10, [0, 0, Q]),
      bx([0.26, 0.3, 0.07], [0, 0.7, 0.525], trim, 'gold')
    ]));
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) { parts.push(lit(k, [bx([0.16, 0.14, 0.16], [c[0] * 0.7, 0.07, c[1] * 0.46], trim, 'gold')])[0]); });
    return B(parts);
  };
  m.chest = chest(0x8a5a2e, 0xf2c14e, 1.25);
  m.chestFree = chest(0xc8922a, 0xfff0a0, 1.6);
  // 陶罐：压暗、降低饱和度的陶土色（新画风的地面是深橄榄绿，原来的亮橙色太扎眼）
  m.pot = B([sp(0.4, [0, 0.42, 0], 0x946446, 'it_clay', [1, 1.05, 1], [9, 7]), cy(0.2, 0.26, 0.2, [0, 0.86, 0], 0x84583e, 'it_clay', 9), cy(0.26, 0.22, 0.06, [0, 0.97, 0], 0x6c4632, 'it_clay', 9)]);
  m.bigpot = B([
    sp(0.65, [0, 0.72, 0], 0x8c5c42, 'it_clay', [1, 1.1, 1], [10, 8]), cy(0.32, 0.42, 0.3, [0, 1.48, 0], 0x7c5038, 'it_clay', 10), cy(0.42, 0.36, 0.08, [0, 1.65, 0], 0x64402c, 'it_clay', 10)
  ].concat(sym([['torus', [0.16, 0.04, 4, 8], [0.55, 1.1, 0], 0x6c4632, [0, Q, 0], null, 'it_clay']])));
  // 烽火台和出口传送门（模型在下面的 beaconParts / gateParts）
  m.bossportal = Interact.beaconModel();
  m.exitportal = Interact.gateModel();
  m.swirl = new THREE.CircleGeometry(2.1, 24);   // 漩涡在两根柱子之间（柱子内侧 ±2.15）
  m.swirlTex = Interact.swirlTexture();
  // 宝箱下面的柔光（所有宝箱共用一个实例网格）
  Interact.initGlow();
  Interact.MODELS = m;
  return m;
};

// 四棱尖顶（正方形底，边和坐标轴对齐）：s = [半边宽, 高]；誓言石碑的尖顶、盾徽和小旗的尖角也用它
MODEL.extraGeo.c10Pyr = function (s) {
  var g = new THREE.ConeGeometry(s[0] * Math.SQRT2, s[1], 4, 1, false, Math.PI / 4), uv = g.attributes.uv;
  for (var i = 0; i < uv.count; i++) uv.setXY(i, clamp(uv.getX(i), 0, 0.999), clamp(uv.getY(i), 0, 0.999));
  return g;
};

// 烽火台：毛石砌的圆形瞭望台（底座、往上收的塔身、两道石箍、前后两扇箭窗、塔顶一圈 8 个垛口），一架木梯斜靠在一边，
// 塔顶的铁篮火盆（8 根铁肋、厚边、里面暗红的余烬）里交叉堆着两捆柴。石头顶在 3.5 米，火盆和柴不超过 4.1 米
// （光柱从 y + 4.05 起，点燃后的火在 3.9）
Interact.beaconParts = function () {
  var bx = ENEMY_KIT.bx, cy = ENEMY_KIT.cy, sgB = ENEMY_KIT.sgB, lit = ENEMY_KIT.lit, Q = Math.PI / 2;
  var st = 0x8e8678, st2 = 0x7d776c, dk = 0x6e695f, iron = 0x2e2c2a, wood = 0x6b4a2c;
  // 塔身在高度 y 处的半径
  var rAt = function (y) { return 1.72 - (y - 0.425) / 2.85 * 0.3; };
  var parts = [
    cy(1.95, 2.1, 0.45, [0, 0.225, 0], st2, 'brick', 12),
    cy(1.42, 1.72, 2.85, [0, 1.85, 0], st, 'brick', 12),
    cy(1.73, 1.73, 0.14, [0, 1.2, 0], dk, 'brick', 12),
    cy(1.58, 1.58, 0.14, [0, 2.45, 0], dk, 'brick', 12),
    cy(1.62, 1.48, 0.3, [0, 3.35, 0], st2, 'brick', 12)
  ];
  // 箭窗：黑色窄缝 + 上下两块压顶石（前后各一扇）
  [1, -1].forEach(function (s) {
    var r = rAt(1.85);
    parts.push(bx([0.22, 0.62, 0.08], [0, 1.85, s * (r + 0.005)], 0x1a1612, 'plain'), bx([0.42, 0.1, 0.14], [0, 2.21, s * r], dk, 'brick'), bx([0.42, 0.1, 0.14], [0, 1.49, s * r], dk, 'brick'));
  });
  // 塔顶的垛口
  for (var k = 0; k < 8; k++) {
    var a = (k + 0.5) * Math.PI / 4;
    parts.push(bx([0.46, 0.28, 0.34], [Math.sin(a) * 1.45, 3.64, Math.cos(a) * 1.45], k % 2 ? st : 0x948c7e, 'brick', [0, a, 0]));
  }
  // 凸出来的几块毛石（深浅两种）
  [[0.4, 0.8], [1.3, 1.65], [2.6, 2.95], [3.9, 1.0], [4.7, 2.8], [5.5, 1.7]].forEach(function (q, i) {
    var r = rAt(q[1]) + 0.02;
    parts.push(bx([0.38, 0.22, 0.1], [Math.sin(q[0]) * r, q[1], Math.cos(q[0]) * r], i % 2 ? 0x9a9284 : 0x746e64, 'rock', [0, q[0], 0]));
  });
  // 木梯：斜靠 12°，两根梯帮、五根横档
  var phi = -0.9, d = [Math.sin(phi), 0, Math.cos(phi)], t = [Math.cos(phi), 0, -Math.sin(phi)];
  var p0 = [d[0] * 2.32, 0, d[2] * 2.32], p1 = [d[0] * 1.62, 3.42, d[2] * 1.62];
  [-0.24, 0.24].forEach(function (o) {
    parts.push(sgB([p0[0] + t[0] * o, p0[1], p0[2] + t[2] * o], [p1[0] + t[0] * o, p1[1], p1[2] + t[2] * o], 0.07, wood, 'wood', 0.07));
  });
  for (k = 1; k <= 5; k++) {
    var f = k / 6;
    parts.push(bx([0.48, 0.05, 0.06], [p0[0] + (p1[0] - p0[0]) * f, p1[1] * f, p0[2] + (p1[2] - p0[2]) * f], 0x7a5a36, 'wood', [0, phi, 0]));
  }
  // 铁篮火盆：碗、6 根往外张的铁肋、厚边、暗红的余烬（微微发亮）
  parts.push(cy(1.05, 0.7, 0.45, [0, 3.72, 0], iron, 'metal', 10), cy(1.1, 1.1, 0.08, [0, 3.98, 0], 0x3a3a3e, 'metal', 10));
  for (k = 0; k < 6; k++) {
    var b = k * Math.PI / 3 + 0.2, c = Math.cos(b), s = Math.sin(b);
    parts.push(sgB([c * 0.74, 3.5, s * 0.74], [c * 1.14, 3.98, s * 1.14], 0.07, 0x4a4642, 'metal', 0.07));
  }
  parts = parts.concat(lit(1.5, [cy(0.98, 0.98, 0.02, [0, 3.955, 0], 0xb8481e, 'plain', 10)]));
  // 两捆柴，每捆三根并排（中间那根高一点），两捆斜着交叉叠在一起
  [-1, 1].forEach(function (s) {
    var a = s * 0.4, px = Math.sin(a), pz = Math.cos(a);
    [-0.19, 0, 0.19].forEach(function (dd, j) {
      parts.push(cy(0.08, 0.08, 1.5, [dd * px, 3.9 + (s > 0 ? 0.07 : 0) + (j === 1 ? 0.03 : 0), dd * pz], j === 1 ? 0x5e4026 : wood, 'bark', 5, [0, a, Q]));
    });
  });
  return parts;
};
Interact.beaconModel = function () { return Enemies.buildGeo(Interact.beaconParts(), true); };

// 下一关传送门：两根石柱（两级柱础、三道深色石箍、柱头）、一道门楣（压顶线脚 + 中间一块拱心石），
// 拱心石两面挂着行会的盾徽：蓝色鸢形盾、金边、一把真的长剑（剑尖朝上，金护手、握把、圆剑首）——不是十字；
// 门楣下面挂两面蓝色小旗。中间的漩涡半径 2.1（在两根柱子之间）
Interact.gateParts = function () {
  var bx = ENEMY_KIT.bx, lit = ENEMY_KIT.lit, sym = ENEMY_KIT.sym, sgB = ENEMY_KIT.sgB;
  var gold = 0xe8b83a, blue = 0x2b4fb8, st = 0x9aa0aa, dk = 0x8a909a;
  var parts = [
    bx([6.6, 0.85, 1.05], [0, 6.1, 0], st, 'brick'),
    bx([6.8, 0.12, 1.15], [0, 6.585, 0], dk, 'brick'),
    bx([0.95, 1.0, 1.2], [0, 6.05, 0], 0xa8aeb8, 'brick')
  ].concat(sym([
    bx([1.15, 0.36, 1.15], [2.6, 0.18, 0], dk, 'brick'),
    bx([0.9, 5.15, 0.9], [2.6, 2.9, 0], st, 'brick'),
    bx([0.94, 0.16, 0.94], [2.6, 0.62, 0], dk, 'brick'), bx([0.94, 0.16, 0.94], [2.6, 2.3, 0], dk, 'brick'), bx([0.94, 0.16, 0.94], [2.6, 4.0, 0], dk, 'brick'),
    bx([1.1, 0.25, 1.1], [2.6, 5.6, 0], dk, 'brick'),
    // 柱础上的一块苔藓
    ['oct', [0.26], [2.98, 0.36, 0.45], 0x4f7a34, null, [1.3, 0.3, 1], 'env_moss'],
    // 挂小旗的铁杆和小旗（蓝底、金边、下面一个尖）
    bx([0.4, 0.62, 0.03], [1.6, 5.32, 0], blue, 'cloth'),
    ['c10Pyr', [0.2, 0.26], [1.6, 4.88, 0], blue, [Math.PI, 0, 0], [1, 1, 0.075], 'cloth']
  ])).concat(lit(1.3, sym([
    bx([0.44, 0.05, 0.04], [1.6, 5.6, 0], gold, 'gold'),
    bx([0.03, 0.62, 0.04], [1.79, 5.32, 0], gold, 'gold'), bx([0.03, 0.62, 0.04], [1.41, 5.32, 0], gold, 'gold')
  ])));
  // 两面的盾徽
  [1, -1].forEach(function (s) {
    var z = s * 0.64, zr = s * 0.665, zs = s * 0.68, R = s > 0 ? null : [0, Math.PI, 0];
    parts.push(bx([0.8, 0.62, 0.06], [0, 6.17, z], blue, 'cloth'),
      ['c10Pyr', [0.4, 0.34], [0, 5.69, z], blue, [Math.PI, 0, 0], [1, 1, 0.075], 'cloth'],
      bx([0.07, 0.46, 0.03], [0, 6.16, zs], 0xe8ecf2, 'metal'),
      ['c10Pyr', [0.035, 0.1], [0, 6.44, zs], 0xe8ecf2, R, [1, 1, 0.43], 'metal'],
      bx([0.045, 0.13, 0.035], [0, 5.83, zs], 0x6a3a1e, 'cloth'));
    parts = parts.concat(lit(1.3, [
      bx([0.9, 0.06, 0.05], [0, 6.49, zr], gold, 'gold'),
      bx([0.06, 0.66, 0.05], [0.43, 6.16, zr], gold, 'gold'), bx([0.06, 0.66, 0.05], [-0.43, 6.16, zr], gold, 'gold'),
      sgB([0.43, 5.84, zr], [0, 5.47, zr], 0.06, gold, 'gold', 0.05), sgB([-0.43, 5.84, zr], [0, 5.47, zr], 0.06, gold, 'gold', 0.05),
      bx([0.3, 0.05, 0.045], [0, 5.91, zs], gold, 'gold'),
      ['oct', [0.055], [0, 5.74, zs], gold, null, null, 'gold']
    ]));
  });
  return parts;
};
Interact.gateModel = function () { return Enemies.buildGeo(Interact.gateParts(), true); };

// 烽火台光柱的颜色：关卡数据里有 beacon（'#rrggbb' 或 0xrrggbb）就用它，没有就按关卡：森林青绿、沙漠橙、墓地紫
Interact.BEACON_COLORS = ['#7affc0', '#ffb84a', '#b48cff'];
Interact.beaconCss = function () {
  var i = (Game.stage || 1) - 1, sd = typeof STAGES !== 'undefined' && STAGES[i], b = sd && sd.beacon;
  if (typeof b === 'number') return '#' + ('000000' + (b >>> 0).toString(16)).slice(-6);
  if (typeof b === 'string' && /^#[0-9a-f]{6}$/i.test(b)) return b.toLowerCase();
  return Interact.BEACON_COLORS[i] || '#ffd84a';
};
Interact.beaconHex = function () { return parseInt(Interact.beaconCss().slice(1), 16); };
// 烽火台的光柱：开口圆柱，颜色全白（材质染成关卡颜色），透明度底下 1、往上渐隐（顶点颜色带 alpha）
// 用普通混合（不是加法）：加法在天空上会冲成青色 / 白色，看不出关卡颜色
Interact.beaconGeo = function () {
  if (Interact._beaconGeo) return Interact._beaconGeo;
  var g = new THREE.CylinderGeometry(1, 1, 1, 12, 6, true).translate(0, 0.5, 0);
  var p = g.attributes.position, col = [];
  for (var i = 0; i < p.count; i++) col.push(1, 1, 1, Math.pow(1 - p.getY(i), 1.3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  Interact._beaconGeo = g;
  return g;
};
Interact.beaconMat = function () {
  return new THREE.MeshBasicMaterial({ vertexColors: true, color: Interact.beaconHex(), transparent: true, opacity: 0.7, depthWrite: false, fog: false, side: THREE.DoubleSide });
};

// 传送门中间旋转的漩涡（白色螺旋，材质再染色）
Interact.swirlTexture = function () {
  var cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  var ctx = cv.getContext('2d'), img = ctx.createImageData(64, 64);
  for (var y = 0; y < 64; y++) for (var x = 0; x < 64; x++) {
    var dx = x - 31.5, dy = y - 31.5, r = Math.sqrt(dx * dx + dy * dy) / 32, a = Math.atan2(dy, dx);
    var s = 0.5 + 0.5 * Math.sin(a * 3 + r * 11);
    var v = r > 1 ? 0 : (0.35 + 0.65 * s) * (1 - r * 0.35) + (r < 0.25 ? (0.25 - r) * 3 : 0);
    var i = (y * 64 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = Math.min(255, v * 255);
    img.data[i + 3] = r > 1 ? 0 : 255;
  }
  ctx.putImageData(img, 0, 0);
  return TEX.canvasTex(cv, false);
};

Interact.initGlow = function () {
  var cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  var ctx = cv.getContext('2d'), g = ctx.createRadialGradient(32, 32, 1, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  var tex = new THREE.CanvasTexture(cv);
  var mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.55, blending: THREE.AdditiveBlending, fog: false });
  var im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, 64);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  im.renderOrder = 2;
  var c = new THREE.Color(0xffc94a);
  for (var i = 0; i < 64; i++) im.setColorAt(i, c);
  im.count = 0;
  Interact.glow = im;
  Interact.glowM = new THREE.Matrix4();
  Interact.glowS = new THREE.Vector3();
  Interact.glowP = new THREE.Vector3();
  Interact.glowQ = new THREE.Quaternion();
  Game.scene.add(im);
};

// 每帧把没打开的宝箱下面铺上柔光（慢慢呼吸）
Interact.updateGlow = function () {
  var im = Interact.glow;
  if (!im) return;
  var n = 0, t = Game.realTime, gold = Interact.glowGold || (Interact.glowGold = new THREE.Color(0xffc94a)), white = Interact.glowWhite || (Interact.glowWhite = new THREE.Color(0xfff0a0));
  for (var i = 0; i < Interact.list.length && n < 64; i++) {
    var o = Interact.list[i];
    if (o.used || o.kind !== 'chest') continue;
    var s = (o.free ? 4.2 : 3.3) * (1 + Math.sin(t * 2.2 + o.x) * 0.07);
    Interact.glowP.set(o.x, o.y + 0.06, o.z);
    Interact.glowS.set(s, 1, s);
    Interact.glowM.compose(Interact.glowP, Interact.glowQ, Interact.glowS);
    im.setMatrixAt(n, Interact.glowM);
    im.setColorAt(n, o.free ? white : gold);
    n++;
  }
  im.count = n;
  im.visible = n > 0;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
};

Interact.clear = function () {
  var old = Interact.list;
  old.forEach(function (o) { Interact.removeMeshes(o); });
  Interact.list = [];
  Interact.near = null;
  Interact.portal = null;
  Interact.exit = null;
  for (var k in Interact.KINDS) if (Interact.KINDS[k].clear) Interact.KINDS[k].clear();
  if (Interact.glow) { Interact.glow.count = 0; Interact.glow.visible = false; }
  Interact.disposeAll(old);
};

Interact.removeMeshes = function (o) {
  [o.mesh, o.ring, o.swirl].concat(o.parts || []).forEach(function (m) { if (m && m.parent) m.parent.remove(m); });
};

// 换关 / 重开时释放上一关互动物体自己建的几何体和材质：贴着地形新建的圆环、光墙、地面光圈、界石，
// 每个物体单独的（会变色的）材质，圣锻炉的模型……不释放的话渲染器会一直留着它们的显存和顶点数据，每关多十几个。
// 共用的不动：各个缓存里的模型和材质，以及场景里别的东西还在用的
Interact.disposeAll = function (list) {
  if (!list.length) return;
  var geos = new Set(), mats = new Set();
  var collect = function (root) {
    if (!root || !root.traverse) return;
    root.traverse(function (m) {
      if (m.geometry) geos.add(m.geometry);
      if (m.material) [].concat(m.material).forEach(function (x) { mats.add(x); });
    });
  };
  list.forEach(function (o) { [o.mesh, o.ring, o.swirl].concat(o.parts || []).forEach(collect); });
  var keep = Interact.sharedRes();
  geos.forEach(function (g) { if (!keep.has(g)) g.dispose(); });
  mats.forEach(function (m) { if (!keep.has(m)) m.dispose(); });
};

// 不能释放的几何体和材质：场景里还挂着的东西用的 + 各个文件的模型 / 材质缓存（暂时没人用，下一关还要用）
Interact.sharedRes = function () {
  var s = new Set();
  var add = function (v) { if (v && (v.isBufferGeometry || v.isMaterial)) s.add(v); };
  var all = function (o) { if (o) for (var k in o) add(o[k]); };
  Game.scene.traverse(function (m) { add(m.geometry); if (m.material) [].concat(m.material).forEach(add); });
  all(Interact.MODELS);
  all(MODEL.cache); add(MODEL.mat); add(MODEL.flatMat); all(FX.geos);
  if (typeof ZONE_MODELS !== 'undefined') all(ZONE_MODELS);
  if (typeof MX !== 'undefined') { all(MX.geoCache); all(MX.mats); add(MX._beam); }
  add(Interact._beaconGeo);
  if (typeof Evo !== 'undefined') { add(Evo._beamGeo); add(Evo._ringGeo); add(Evo.pillarGeo); add(Evo._axeGeo); all(Evo._goldGeos); }
  return s;
};

Interact.add = function (kind, x, z, y, extra) {
  if (Interact.KINDS[kind]) return Interact.addCustom(kind, x, z, y, extra);
  var m = Interact.models();
  var geo;
  if (kind === 'chest') geo = extra && extra.free ? m.chestFree : m.chest;
  else if (kind === 'pot') geo = extra && extra.big ? m.bigpot : m.pot;
  else geo = m[kind];
  var mesh = new THREE.Mesh(geo, MODEL.material());
  if (y == null) y = W.groundAt(x, z, 999);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.random() * TAU;
  Game.scene.add(mesh);
  mesh.updateMatrixWorld(true);          // 第一帧画出来之前矩阵就是对的（弩车 / 军旗 / 急件算占地、测试量模型都读它）
  var o = { kind: kind, x: x, y: y, z: z, mesh: mesh, used: false, r: 2.4, charge: 0 };
  if (extra) for (var k in extra) o[k] = extra[k];
  if (kind === 'pot') o.r = o.big ? 1.5 : 1.0;
  if (kind === 'exitportal') {
    o.r = 4;
    // 门里旋转的蓝白漩涡
    o.swirl = new THREE.Mesh(m.swirl, new THREE.MeshBasicMaterial({ map: m.swirlTex, color: 0x9fd8ff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }));
    o.swirl.position.set(x, y + 2.8, z);
    o.swirl.rotation.y = mesh.rotation.y;
    Game.scene.add(o.swirl);
  }
  if (kind === 'bossportal') {
    o.r = 4;
    o.parts = [];
    // 没点燃前：塔顶冲天的光柱（关卡颜色，不进雾，整张地图都看得见；1 秒一明一暗，和屏幕边的圆环一个节奏）
    o.pillar = new THREE.Mesh(Interact.beaconGeo(), Interact.beaconMat());
    o.pillar.position.set(x, y + 4.05, z);
    o.pillar.scale.set(1.05, 70, 1.05);
    o.pillar.frustumCulled = false;
    o.pillar.renderOrder = 2;
    Game.scene.add(o.pillar);
    o.parts.push(o.pillar);
    // 点燃后的火（篝火的火苗放大 2.2 倍），先藏着
    o.flame = MX.mesh(MX.geo('flame', MX.flameParts), 'glow');
    o.flame.scale.setScalar(2.2);
    o.flame.position.set(x, y + 3.9, z);
    o.flame.visible = false;
    Game.scene.add(o.flame);
    o.parts.push(o.flame);
  }
  Interact.list.push(o);
  return o;
};

Interact.populate = function () {
  // 塔顶与漂浮平台上放宝箱，奖励爬高
  W.spots.forEach(function (s) { Interact.add('chest', s.x, s.z, s.y); });
  var place = function (kind, n, minR, extraFn) {
    for (var i = 0; i < n; i++) { var p = W.randomSpot(minR, W.S - 25); Interact.add(kind, p.x, p.z, p.y, extraFn ? extraFn(i) : null); }
  };
  // 数量随关卡时长缩放（10 分钟为基准）：常见物品按比例，稀有物品按平方根，不会太挤
  var k = typeof Pace !== 'undefined' ? Pace.contentScale() : 1, sq = Math.sqrt(k);
  place('chest', Math.round(14 * k), 20);
  place('pot', Math.round(60 * k), 10, function () { return { big: Math.random() < 0.2 }; });
  Interact.populateCustom(place);
  var a = W.bellTower ? W.randomSpot(9, 14, W.bellTower.x, W.bellTower.z) : W.randomSpot(55, W.S - 30);   // 沉钟古城：烽火台在倒了一半的钟楼旁边（百年沉钟从这里出来）
  Interact.portal = Interact.add('bossportal', a.x, a.z, a.y, { found: false });
};

Interact.spawnChest = function (x, z, free) {
  Interact.add('chest', x, z, W.groundAt(x, z, P.pos.y + 2), { free: !!free });
};

// 第 n 个付费宝箱：(20 + 15·n^1.3)·(1 + 0.6·(关卡 − 1))·时长系数·(1 − 宝箱折扣，最多 50%)
// 第 1 关 15 分钟：35、57、83、111、142……（n 整局累计；时长系数 15 分钟为 1）
Interact.chestCost = function () {
  var n = Interact.chestsOpened + 1, k = typeof Pace !== 'undefined' ? Pace.xpScale() : 1;
  return Math.round((20 + 15 * Math.pow(n, 1.3)) * (1 + 0.6 * (Game.stage - 1)) * k * (1 - Math.min(0.5, P.st.chestDisc || 0)));
};

Interact.label = function (o) {
  if (Interact.KINDS[o.kind]) return Interact.KINDS[o.kind].label(o);
  switch (o.kind) {
    case 'chest': return o.free ? '打开金宝箱 · 免费' : '打开宝箱 · ' + Kit.num(Interact.chestCost()) + ' 金币';
    case 'bossportal': return Game.bossAlive ? '首领战斗中…' : '点燃烽火台：召唤首领 · 越晚点燃越强';
    case 'exitportal': return '进入传送门 · 下一关';
  }
  return '';
};

Interact.update = function (dt) {
  var best = null, bd = Infinity;
  for (var i = Interact.list.length - 1; i >= 0; i--) {
    var o = Interact.list[i];
    if (o.used) continue;
    var dx = P.pos.x - o.x, dz = P.pos.z - o.z, d2 = dx * dx + dz * dz;
    var dy = P.pos.y - o.y;
    var K = Interact.KINDS[o.kind];
    if (K) {
      if (K.update) K.update(o, dt, d2, dy);
      if (o.used || K.noPrompt) continue;
    }
    if (o.kind === 'pot') { if (d2 < (o.r + 0.4) * (o.r + 0.4) && Math.abs(dy) < 2) Interact.breakPot(o); continue; }
    if (o.kind === 'bossportal') {
      if (!o.found && d2 < 30 * 30) { o.found = true; UI.toast('发现了烽火台！', Kit.color('gold')); }
      if (o.pillar) {
        // 透明度和亮度一起变（只变透明度的话暗的时候天空透过来，颜色会偏）；减弱动态效果（系统设置或游戏里的开关，body.kmRM）时停在最亮
        var pu = document.body.classList.contains('kmRM') ? 1 : Math.sin(Game.time * TAU), pm = o.pillar.material;
        pm.opacity = 0.9 + 0.05 * pu;
        pm.color.setHex(Interact.beaconHex()).multiplyScalar(0.88 + 0.12 * pu);
      }
      // 火盆里冒一股又高又浓的灰烟（点燃以前；圣锻炉的光柱没有烟）
      if (d2 < 120 * 120 && Math.random() < dt * 7) MX.part(o.x + rand(-0.4, 0.4), o.y + 4.2, o.z + rand(-0.4, 0.4), rand(-0.25, 0.25), rand(2.2, 3.0), rand(-0.25, 0.25), rand(3.5, 4.5), 0.3, 1.1, pick([0x5a5652, 0x6a6662, 0x8a8682]), 0.3);
    }
    if (o.kind === 'exitportal') o.swirl.rotation.z += dt * 3;
    if (d2 < o.r * o.r && Math.abs(dy) < 3 && d2 < bd) { bd = d2; best = o; }
  }
  Interact.near = best;
  UI.setPrompt(best ? Interact.label(best) : null, best && Interact.canUse(best), best && Interact.busy(best));
  Interact.updateGlow();
};

Interact.canUse = function (o) {
  var K = Interact.KINDS[o.kind];
  if (K) return K.canUse ? !!K.canUse(o) : true;
  if (o.kind === 'chest' && !o.free) return P.gold >= Interact.chestCost();
  if (o.kind === 'bossportal') return !Game.bossAlive;
  return true;
};

// 正在进行（KINDS[k].busy：立了誓的石碑、比武中的木人、在滚的滚石）：提示是金色的进度，不是红色的拒绝；按了也不报错
Interact.busy = function (o) {
  var K = Interact.KINDS[o.kind];
  return !!(K && K.busy && K.busy(o));
};

// 不能用时的提示
Interact.denied = function (o) {
  var K = Interact.KINDS[o.kind];
  if (K) return K.denied ? K.denied(o) : '现在还不能用';
  switch (o.kind) {
    case 'chest': return '金币不够：打开宝箱要 ' + Kit.num(Interact.chestCost()) + ' 金币';
    case 'bossportal': return '首领还在战斗中';
  }
  return '金币不够';
};

Interact.use = function () {
  var o = Interact.near;
  if (!o || o.used || Game.state !== 'play') return;
  var K = Interact.KINDS[o.kind];
  if (Interact.busy(o)) return;   // 正在进行：没什么可做的，也不是错
  if (!Interact.canUse(o)) { UI.toast(Interact.denied(o), Kit.color('red')); return; }
  if (K) { K.use(o); return; }
  switch (o.kind) {
    case 'chest': {
      if (!o.free) {
        if (P.gold < Interact.chestCost()) { UI.toast('金币不够', Kit.color('red')); return; }
        P.gold -= Interact.chestCost(); Interact.chestsOpened++;
      }
      Interact.consume(o);
      FX.burst(o.x, o.y + 1, o.z, 24, 0xffd84a, 8, 0.35);
      Passive.onChest();
      // 免费金宝箱可以被其他系统接管（比如超武进化）；返回 true 就不再给物品
      if (o.free && Interact.onFreeChest && Interact.onFreeChest(o)) break;
      UI.chestReward(Items.roll());
      break;
    }
    case 'bossportal':
      Game.summonBoss(o);
      break;
    case 'exitportal':
      Game.nextStage();
      break;
  }
};

Interact.consume = function (o) {
  o.used = true;
  Interact.removeMeshes(o);
};

// 点燃烽火台（Game.summonBoss 调用）：石塔留着，光柱收掉，火盆里烧起大火，火光冲天一下，之后一直摇曳到换关
Interact.lightBeacon = function (o) {
  if (!o || o.lit) return;
  o.used = true; o.lit = true;
  if (o.pillar) {
    if (o.pillar.parent) o.pillar.parent.remove(o.pillar);
    o.pillar.material.dispose();
    var pi = o.parts.indexOf(o.pillar);
    if (pi >= 0) o.parts.splice(pi, 1);
    o.pillar = null;
  }
  if (o.flame) o.flame.visible = true;
  var x = o.x, y = o.y, z = o.z;
  FX.burst(x, y + 4.2, z, 30, 0xffa040, 8, 0.4);
  FX.flash(x, y + 4.4, z, 4, 0xffb050, 0.5);
  MX.pillar(x, y + 4, z, Interact.beaconHex(), 1.6, 14, 0.8);
  var glow = new THREE.Color(0xffa040), t0 = Math.random() * 10;
  MX.anims.push({ o: o, fn: function (q, dt) {
    if (Interact.list.indexOf(q) < 0) return false;
    var t = (t0 += dt) * 11;
    if (q.flame) {
      q.flame.scale.set(2.2 * (1 + Math.sin(t * 0.7) * 0.06), 2.2 * (1 + Math.sin(t) * 0.14 + Math.sin(t * 1.9) * 0.08), 2.2 * (1 + Math.cos(t * 0.8) * 0.06));
      q.flame.rotation.y += dt * 0.9;
    }
    FX.glow(x, y + 4.6, z, 3.2, 3.2, glow, 0.8, 0);
    if (Math.random() < dt * 5) MX.part(x + rand(-0.5, 0.5), y + 6.5, z + rand(-0.5, 0.5), rand(-0.3, 0.3), rand(1.5, 2.4), rand(-0.3, 0.3), rand(2.5, 3.5), 0.3, 0.9, pick([0x5a5652, 0x6a6662, 0x7a7672]), 0.4);
    if (Math.random() < dt * 6) MX.part(x + rand(-0.6, 0.6), y + 5, z + rand(-0.6, 0.6), rand(-0.5, 0.5), rand(2, 3.5), rand(-0.5, 0.5), rand(0.6, 1.1), 0.1, 0.03, pick([0xffd27a, 0xff9a3a, 0xff6020]), 0.3);
    return true;
  } });
};

Interact.breakPot = function (o) {
  Interact.consume(o);
  FX.burst(o.x, o.y + 0.5, o.z, o.big ? 16 : 10, 0x9a6a4a, 5, 0.3);
  var k = o.big ? 3 : 1;
  var r = Math.random();
  if (r < 0.7) Pickups.gold(o.x, o.y + 0.5, o.z, Math.ceil(rand(2, 5) * k * Game.stage * P.st.goldGain));
  else if (r < 0.9) Pickups.xp(o.x, o.y + 0.5, o.z, 3 * k * Game.stage);
  else Pickups.drop(Pickups.randomPowerup(), o.x, o.y + 0.5, o.z);
};

Interact.openExit = function (x, z) {
  Interact.exit = Interact.add('exitportal', x, z, W.groundAt(x, z, P.pos.y + 3));
  UI.toast('传送门开启了！随时可以进入下一关', Kit.color('gold'));
};

// ---------------- 注册的新互动物体 ----------------
// Interact.KINDS[kind] = {
//   model(o)           返回 THREE.Object3D（已经摆好朝向的模型，位置由这里设置）
//   label(o)           提示文字；canUse(o) 能否使用；denied(o) 不能用时的提示
//   use(o)             按 E / 互动按钮时调用
//   update(o, dt, d2, dy)  每帧调用（d2 = 与玩家水平距离平方，dy = 高度差）
//   noPrompt           true 时不参与“靠近提示”（比如踩上去就触发的东西）
//   radius             互动半径（默认 2.4）
//   mapIcon            { color, shape: 'dot'|'square'|'diamond'|'triangle'|'star'|'ring'|'cross', size } 或 function (o) 返回它（返回 null 不画）
//   place              { n: 数量或 function (stage), minR: 离出生点最近距离, extra: function (i) 返回额外字段 }
//   clear()            换关、清场时调用（重置全局状态）
// }
Interact.addCustom = function (kind, x, z, y, extra) {
  var K = Interact.KINDS[kind];
  if (y == null) y = W.groundAt(x, z, 999);
  var o = { kind: kind, x: x, y: y, z: z, used: false, r: K.radius || 2.4, charge: 0, parts: [] };
  if (extra) for (var k in extra) o[k] = extra[k];
  var mesh = K.model(o);
  if (mesh) {
    mesh.position.set(x, y, z);
    if (o.rotY == null) o.rotY = Math.random() * TAU;
    mesh.rotation.y = o.rotY;
    Game.scene.add(mesh);
    mesh.updateMatrixWorld(true);        // 同上：组模型的子网格不用等到第一帧
  }
  o.mesh = mesh;
  if (K.init) K.init(o);
  Interact.list.push(o);
  return o;
};

Interact.populateCustom = function (place) {
  for (var kind in Interact.KINDS) {
    var pl = Interact.KINDS[kind].place;
    if (!pl) continue;
    var n = typeof pl.n === 'function' ? pl.n(Game.stage) : pl.n;
    if (n > 0) place(kind, n, pl.minR || 20, pl.extra);
  }
};
