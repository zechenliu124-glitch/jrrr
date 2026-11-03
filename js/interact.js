'use strict';
// ============================================================
//  可互动物体：宝箱、充能神龛（含金色）、贪婪神龛、吸取神龛、Boss 诅咒神龛、
//  挑战神龛、摩艾像、微波炉、可疑商人、陶罐、Boss 传送门
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
  var bx = ENEMY_KIT.bx, cy = ENEMY_KIT.cy, sp = ENEMY_KIT.sp, cn = ENEMY_KIT.cn, ic = ENEMY_KIT.ic, oc = ENEMY_KIT.oc, lit = ENEMY_KIT.lit, sym = ENEMY_KIT.sym, sgB = ENEMY_KIT.sgB, sgC = ENEMY_KIT.sgC;
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
  // 充能神龛：阶梯石台、刻符文的石柱、四根爪托着一颗发光的水晶
  var shrine = function (stone, trim, crystal, k) {
    return B([
      cy(1.25, 1.35, 0.28, [0, 0.14, 0], stone, 'brick', 10),
      cy(0.95, 1.05, 0.26, [0, 0.41, 0], stone, 'brick', 10),
      bx([0.62, 1.7, 0.62], [0, 1.39, 0], stone, 'it_rune'),
      bx([0.84, 0.16, 0.84], [0, 2.3, 0], trim, 'metal'),
      bx([0.7, 0.1, 0.7], [0, 0.6, 0], trim, 'metal')
    ].concat([[1, 1], [1, -1], [-1, 1], [-1, -1]].map(function (c) { return cn(0.06, 0.5, [c[0] * 0.3, 2.6, c[1] * 0.3], trim, 'metal', 4, [c[1] * 0.35, 0, -c[0] * 0.35]); }))
      .concat(lit(k, [oc(0.42, [0, 3.1, 0], crystal, 'plain', [1, 1.5, 1]), oc(0.1, [0.62, 2.7, 0.1], crystal, 'plain'), oc(0.08, [-0.55, 3.4, -0.2], crystal, 'plain')])));
  };
  m.shrine = shrine(0x8a8c96, 0x5a5c66, 0x5ae8ff, 2.2);
  m.goldshrine = shrine(0xb8963a, 0xffd84a, 0xffe14a, 2.3);
  // 贪婪神龛：石座上一堆金币，顶上立着一枚大金币
  var coins = [];
  for (var i = 0; i < 7; i++) { var a = i * 2.4; coins.push(cy(0.2, 0.2, 0.06, [Math.sin(a) * 0.35 * (i % 3) / 2, 2.02 + (i % 3) * 0.06, Math.cos(a) * 0.3 * (i % 3) / 2], 0xffd23a, 'gold', 10, [0.2 * (i % 2), 0, 0.15 * (i % 3)])); }
  m.greed = B([
    bx([1.6, 0.4, 1.6], [0, 0.2, 0], 0x4a4038, 'brick'),
    cy(0.5, 0.65, 1.4, [0, 1.1, 0], 0x5a5048, 'it_rune', 8),
    cy(0.75, 0.6, 0.18, [0, 1.88, 0], 0x4a4038, 'brick', 8)
  ].concat(lit(1.35, coins)).concat(lit(1.5, [
    cy(0.6, 0.6, 0.14, [0, 2.78, 0], 0xffd23a, 'gold', 14, [Q, 0, 0]),
    cy(0.42, 0.42, 0.16, [0, 2.78, 0], 0xe8a020, 'gold', 14, [Q, 0, 0]),
    bx([0.1, 0.42, 0.18], [0, 2.78, 0], 0xffe880, 'gold')
  ])));
  // 吸取神龛：紫色漏斗（中间是黑洞一样的漩涡），上面飘着蓝色光球
  m.succ = B([
    cy(1.0, 1.15, 0.4, [0, 0.2, 0], 0x4a3a5a, 'brick', 8),
    cy(0.25, 0.35, 1.4, [0, 1.1, 0], 0x5a4a6a, 'it_rune', 6),
    cn(1.0, 1.3, [0, 2.2, 0], 0x6a4a9a, 'en_stripe', 10, [Math.PI, 0, 0]),
    cy(0.94, 0.94, 0.03, [0, 2.86, 0], 0x14081e, 'plain', 10)
  ].concat(lit(2.3, [ic(0.32, [0, 3.35, 0], 0x3fa9ff, 'plain', null, null, 1)]))
    .concat(lit(1.8, [0, 1, 2].map(function (j) { var t = j / 3 * TAU; return oc(0.09, [Math.sin(t) * 0.6, 3.25, Math.cos(t) * 0.6], 0x9fdcff, 'plain'); }))));
  // Boss 诅咒神龛：黑曜石尖塔、弯角、骷髅、顶上一颗红光球
  m.curse = B([
    bx([1.8, 0.35, 1.8], [0, 0.17, 0], 0x2a1a24, 'brick'),
    bx([1.3, 0.3, 1.3], [0, 0.5, 0], 0x341e2c, 'brick'),
    cn(0.55, 2.7, [0, 2.0, 0], 0x2a1420, 'en_rock', 4),
    sp(0.24, [0, 1.75, 0.28], 0xd8ccb0, 'en_bone', [1, 1, 1.05], [7, 5]),
    bx([0.34, 0.27, 0.05], [0, 1.71, 0.5], 0xd8ccb0, 'en_skull')
  ].concat(sym([cn(0.12, 0.7, [0.42, 2.45, 0], 0x1a0a12, 'bone', 4, [0, 0, -0.8])]))
    .concat(lit(2.5, sym([bx([0.08, 0.06, 0.02], [0.08, 1.735, 0.53], 0xff2a2a, 'plain')])))
    .concat(lit(2.4, [oc(0.3, [0, 3.55, 0], 0xff2a2a, 'plain', [1, 1.3, 1])])));
  // 挑战神龛：石台上两把交叉的剑，顶上紫色火焰水晶
  m.challenge = B([
    bx([2.2, 0.45, 2.2], [0, 0.22, 0], 0x40343a, 'brick'),
    bx([0.9, 1.3, 0.9], [0, 1.1, 0], 0x4a3a42, 'it_rune'),
    bx([1.1, 0.15, 1.1], [0, 1.82, 0], 0x5a2d35, 'brick')
  ].concat(sym([
    sgB([0.75, 1.75, 0.0], [-0.55, 3.25, 0.0], 0.12, 0xd0d6de, 'metal', 0.04),
    sgB([0.95, 1.55, 0.0], [0.75, 1.78, 0.0], 0.06, 0x3a2418, 'wood'),
    bx([0.36, 0.08, 0.1], [0.72, 1.8, 0], 0xd9a520, 'gold', [0, 0, 0.85])
  ])).concat(lit(2.2, [oc(0.34, [0, 3.45, 0], 0xb05aff, 'plain', [1, 1.6, 1])])));
  // 摩艾像：长脸、高鼻梁、深眼窝、厚嘴唇
  m.moai = B([
    bx([1.5, 2.4, 1.2], [0, 1.2, 0], 0x7d7f86, 'en_rock'),
    bx([1.62, 0.55, 1.3], [0, 2.62, -0.04], 0x6c6e75, 'en_rock'),
    bx([1.62, 0.22, 0.4], [0, 2.3, 0.5], 0x6c6e75, 'en_rock'),
    bx([0.42, 1.05, 0.42], [0, 1.6, 0.72], 0x74767d, 'en_rock'),
    bx([0.9, 0.18, 0.2], [0, 0.78, 0.66], 0x55575d, 'en_rock'),
    bx([1.1, 0.3, 0.3], [0, 0.42, 0.55], 0x6c6e75, 'en_rock')
  ].concat(sym([bx([0.42, 0.3, 0.06], [0.4, 2.02, 0.6], 0x24252a, 'plain'), bx([0.22, 1.0, 0.3], [0.82, 1.6, 0.0], 0x6c6e75, 'en_rock')])));
  // 微波炉：放在小木桌上，深色玻璃门、旋钮、绿色小屏幕
  m.microwave = B([
    bx([1.6, 0.1, 1.1], [0, 0.6, 0], 0x7a5030, 'it_plank'),
    bx([1.4, 0.8, 0.95], [0, 1.05, 0], 0xe4e4e0, 'metal'),
    bx([0.86, 0.56, 0.04], [-0.18, 1.05, 0.49], 0x1a2a30, 'plain'),
    bx([0.32, 0.66, 0.04], [0.5, 1.05, 0.49], 0xb8b8b4, 'metal'),
    cy(0.08, 0.08, 0.05, [0.5, 1.24, 0.52], 0x3a3a3a, 'metal', 8, [Q, 0, 0]),
    bx([0.05, 0.42, 0.06], [0.27, 1.05, 0.52], 0x9a9a9a, 'metal')
  ].concat([[1, 1], [1, -1], [-1, 1], [-1, -1]].map(function (c) { return bx([0.1, 0.56, 0.1], [c[0] * 0.7, 0.28, c[1] * 0.45], 0x6a4026, 'wood'); }))
    .concat([0, 1, 2, 3].map(function (j) { return bx([0.07, 0.05, 0.03], [0.45 + (j % 2) * 0.1, 0.84 + (j >> 1) * 0.08, 0.52], 0x5a5a5a, 'plain'); }))
    .concat(lit(1.8, [bx([0.6, 0.05, 0.02], [-0.24, 1.17, 0.515], 0x9fd8ff, 'plain', [0, 0, 0.45]), bx([0.18, 0.07, 0.02], [0.5, 1.02, 0.515], 0x5aff8a, 'plain')])));
  // 可疑商人：深紫色兜帽长袍、看不清的脸上一对发光的眼睛、宽檐帽（帽带颜色 = 稀有度），地毯上摆着药水
  // 每种帽带颜色只建一次
  var merchants = m.merchants = {};
  m.merchant = function (hat) {
    if (!merchants[hat]) merchants[hat] = buildMerchant(hat);
    return merchants[hat];
  };
  var buildMerchant = function (hat) {
    return B([
      bx([2.2, 0.04, 1.4], [0.6, 0.02, 0.4], 0x8a2a3a, 'cloth'),
      cn(0.75, 1.9, [0, 0.95, 0], 0x3b2a52, 'cloth', 8),
      sp(0.38, [0, 2.0, -0.08], 0x2e2042, 'cloth', [1, 1.05, 1.1], [8, 6]),
      cn(0.22, 0.5, [0, 2.38, -0.22], 0x2e2042, 'cloth', 6, [-0.5, 0, 0]),
      sp(0.25, [0, 1.95, 0.2], 0x0a0810, 'plain', [1, 1.1, 0.62], [7, 5]),
      cy(0.75, 0.75, 0.05, [0, 2.36, 0], 0x2a2030, 'cloth', 12),
      cy(0.33, 0.38, 0.45, [0, 2.6, 0], 0x2a2030, 'cloth', 10),
      sgC([0.3, 1.6, 0.05], [0.42, 1.15, 0.35], 0.14, 0.11, 0x3b2a52, 'cloth', 6),
      sgC([-0.3, 1.6, 0.05], [-0.42, 1.15, 0.35], 0.14, 0.11, 0x3b2a52, 'cloth', 6),
      ic(0.1, [0.43, 1.08, 0.4], 0xc8a080, 'skin'), ic(0.1, [-0.43, 1.08, 0.4], 0xc8a080, 'skin'),
      bx([0.45, 0.35, 0.3], [1.3, 0.2, 0.75], 0x7a5530, 'it_plank'),
      sp(0.3, [-0.55, 0.32, -0.35], 0x8a6a40, 'cloth', [1, 1.1, 1], [7, 5])
    ].concat(lit(1.4, [cy(0.39, 0.39, 0.1, [0, 2.44, 0], hat, 'cloth', 10)]))
      .concat(lit(2.6, sym([bx([0.08, 0.045, 0.02], [0.085, 1.99, 0.36], 0xffd23a, 'plain')])))
      .concat(lit(1.35, [
        sp(0.14, [0.75, 0.18, 0.45], 0xff4f6d, 'plain', null, [7, 5]), cy(0.05, 0.05, 0.12, [0.75, 0.36, 0.45], 0xe0e0e0, 'plain', 5),
        sp(0.13, [1.05, 0.17, 0.2], 0x5bd1ff, 'plain', null, [7, 5]), cy(0.05, 0.05, 0.12, [1.05, 0.34, 0.2], 0xe0e0e0, 'plain', 5),
        sp(0.12, [0.45, 0.16, 0.8], 0x7dff4a, 'plain', null, [7, 5]), cy(0.045, 0.045, 0.1, [0.45, 0.32, 0.8], 0xe0e0e0, 'plain', 5)
      ])));
  };
  // 陶罐：压暗、降低饱和度的陶土色（新画风的地面是深橄榄绿，原来的亮橙色太扎眼）
  m.pot = B([sp(0.4, [0, 0.42, 0], 0x946446, 'it_clay', [1, 1.05, 1], [9, 7]), cy(0.2, 0.26, 0.2, [0, 0.86, 0], 0x84583e, 'it_clay', 9), cy(0.26, 0.22, 0.06, [0, 0.97, 0], 0x6c4632, 'it_clay', 9)]);
  m.bigpot = B([
    sp(0.65, [0, 0.72, 0], 0x8c5c42, 'it_clay', [1, 1.1, 1], [10, 8]), cy(0.32, 0.42, 0.3, [0, 1.48, 0], 0x7c5038, 'it_clay', 10), cy(0.42, 0.36, 0.08, [0, 1.65, 0], 0x64402c, 'it_clay', 10)
  ].concat(sym([['torus', [0.16, 0.04, 4, 8], [0.55, 1.1, 0], 0x6c4632, [0, Q, 0], null, 'it_clay']])));
  // Boss 传送门：暗色石拱门、发光的红色符文、骷髅拱顶石、两只弯角
  var portal = function (stone, rune, skull) {
    var parts = [
      cy(3.2, 3.5, 0.5, [0, 0.25, 0], stone, 'brick', 12),
      bx([6.4, 0.8, 1.0], [0, 6.0, 0], stone, 'brick')
    ].concat(sym([
      bx([0.9, 5.4, 0.9], [2.6, 2.95, 0], stone, 'brick'),
      bx([1.15, 0.3, 1.15], [2.6, 0.65, 0], stone, 'brick'),
      cn(0.25, 1.2, [3.15, 6.75, 0], 0x1a1418, 'bone', 5, [0, 0, -0.55])
    ])).concat(lit(2.3, sym([
      bx([0.1, 1.2, 0.05], [2.6, 4.4, 0.46], rune, 'plain'), bx([0.36, 0.1, 0.05], [2.6, 4.75, 0.46], rune, 'plain'),
      bx([0.1, 1.2, 0.05], [2.6, 2.6, 0.46], rune, 'plain'), bx([0.36, 0.1, 0.05], [2.6, 2.25, 0.46], rune, 'plain'),
      bx([0.6, 0.08, 0.05], [1.2, 6.0, 0.51], rune, 'plain')
    ])));
    if (skull) {
      parts = parts.concat([sp(0.55, [0, 6.15, 0.45], 0xd8ccb0, 'en_bone', [1, 1, 1.05], [8, 6]), bx([0.8, 0.62, 0.08], [0, 6.05, 0.95], 0xd8ccb0, 'en_skull')])
        .concat(lit(2.6, sym([bx([0.16, 0.12, 0.02], [0.19, 6.1, 1.0], rune, 'plain')])));
    } else {
      parts = parts.concat(lit(2.3, [oc(0.55, [0, 6.6, 0], rune, 'plain', [1, 1.4, 1])]));
    }
    return B(parts);
  };
  m.bossportal = portal(0x2c2933, 0xff2a3a, true);
  m.exitportal = portal(0x3a3050, 0xc070ff, false);
  m.swirl = new THREE.CircleGeometry(2.3, 24);
  m.swirlTex = Interact.swirlTexture();
  // 宝箱下面的柔光（所有宝箱共用一个实例网格）
  Interact.initGlow();
  Interact.MODELS = m;
  return m;
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
  all(Interact.MODELS); all(Interact.MODELS && Interact.MODELS.merchants);
  all(MODEL.cache); add(MODEL.mat); add(MODEL.flatMat); all(FX.geos);
  if (typeof ZONE_MODELS !== 'undefined') all(ZONE_MODELS);
  if (typeof MX !== 'undefined') { all(MX.geoCache); all(MX.mats); add(MX._beam); }
  if (typeof Evo !== 'undefined') { add(Evo._beamGeo); add(Evo._ringGeo); add(Evo.pillarGeo); add(Evo._axeGeo); all(Evo._goldGeos); }
  return s;
};

Interact.add = function (kind, x, z, y, extra) {
  if (Interact.KINDS[kind]) return Interact.addCustom(kind, x, z, y, extra);
  var m = Interact.models();
  var geo;
  if (kind === 'chest') geo = extra && extra.free ? m.chestFree : m.chest;
  else if (kind === 'shrine') geo = extra && extra.golden ? m.goldshrine : m.shrine;
  else if (kind === 'merchant') geo = m.merchant([0x222222, 0x3a6aff, 0xb05aff, 0xff3a3a, 0xffd23a][extra.rarity]);
  else if (kind === 'pot') geo = extra && extra.big ? m.bigpot : m.pot;
  else geo = m[kind];
  var mesh = new THREE.Mesh(geo, MODEL.material());
  if (y == null) y = W.groundAt(x, z, 999);
  mesh.position.set(x, y, z);
  mesh.rotation.y = Math.random() * TAU;
  Game.scene.add(mesh);
  var o = { kind: kind, x: x, y: y, z: z, mesh: mesh, used: false, r: 2.4, charge: 0 };
  if (extra) for (var k in extra) o[k] = extra[k];
  if (kind === 'shrine') {
    // 充能圈：和光环、冲击环一样的像素锯齿发光圈（FX 的 pring；没有就退回普通圆环）
    var pix = !!FX.getGeo('pring');
    o.ring = new THREE.Mesh(FX.getGeo(pix ? 'pring' : 'ring'), new THREE.MeshBasicMaterial({ color: o.golden ? 0xffe14a : 0x7ef0ff, transparent: true, opacity: pix ? 0.95 : 0.75, side: THREE.DoubleSide, depthWrite: false, blending: pix ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !pix }));
    o.ring.renderOrder = 3;
    o.ring.position.set(x, y + 0.2, z);
    // 圈是平的：按神龛周围 3 米的地面坡度倾斜，坡地上不会埋进土里一半
    var e = 3, hx = W.terrainH(x + e, z) - W.terrainH(x - e, z), hz = W.terrainH(x, z + e) - W.terrainH(x, z - e);
    o.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize());
    Game.scene.add(o.ring);
  }
  if (kind === 'pot') o.r = o.big ? 1.5 : 1.0;
  if (kind === 'bossportal' || kind === 'exitportal') {
    o.r = 4;
    o.swirl = new THREE.Mesh(m.swirl, new THREE.MeshBasicMaterial({ map: m.swirlTex, color: kind === 'exitportal' ? 0xb07aff : 0xff3a4a, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false }));
    o.swirl.position.set(x, y + 2.8, z);
    o.swirl.rotation.y = mesh.rotation.y;
    Game.scene.add(o.swirl);
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
  place('shrine', Math.round(15 * sq), 22, function (i) { return { golden: i === 0 && Math.random() < 0.35 }; });
  place('greed', Math.round(8 * k), 25);
  place('succ', 1, 40);
  place('curse', 1, 40);
  place('challenge', Math.round(2 * sq), 40);
  place('moai', Math.round(3 * sq), 30);
  place('microwave', Math.round(2 * sq), 30, function () { return { rarity: pick([0, 0, 2, 2, 3, 4]), uses: 3 }; });
  place('merchant', Math.round(2 * sq), 30, function () { return { rarity: pick([0, 0, 2, 2, 3, 4]) }; });
  place('pot', Math.round(60 * k), 10, function () { return { big: Math.random() < 0.2 }; });
  Interact.populateCustom(place);
  var a = W.randomSpot(55, W.S - 30);
  Interact.portal = Interact.add('bossportal', a.x, a.z, a.y, { found: false });
};

Interact.spawnChest = function (x, z, free) {
  Interact.add('chest', x, z, W.groundAt(x, z, P.pos.y + 2), { free: !!free });
};

// 第 n 个付费宝箱的价格：30, 49, 69, 93 …（越来越贵）；关卡越长金币越多，价格按时长缩放（15 分钟为基准）
Interact.chestCost = function () {
  var n = Interact.chestsOpened + 1, k = typeof Pace !== 'undefined' ? Pace.xpScale() : 1;
  return Math.round(30 * Math.pow(n, 0.48) * Math.pow(1.18, n - 1) * (1 + (Game.stage - 1) * 0.5) * k);
};

Interact.microwaveCost = function (o) { return Math.round([40, 0, 120, 300, 700][o.rarity] * (1 + (Game.stage - 1) * 0.5)); };
// 可疑商人的物品价格（三件同价，和 UI.merchant 进货时的算法一样）
Interact.merchantCost = function (o) {
  if (o.stock && o.stock.length) return Math.min.apply(null, o.stock.map(function (s) { return s.price; }));
  return Math.round([25, 0, 70, 160, 380][o.rarity] * (1 + (Game.stage - 1) * 0.5));
};

Interact.label = function (o) {
  if (Interact.KINDS[o.kind]) return Interact.KINDS[o.kind].label(o);
  switch (o.kind) {
    case 'chest': return o.free ? '打开金宝箱 · 免费' : '打开宝箱 · ' + Interact.chestCost() + ' 金币';
    case 'moai': return '向摩艾像祈祷 · 三选一物品';
    case 'merchant': return '和可疑商人交易 · ' + RARITY[o.rarity].name + '物品 · ' + Interact.merchantCost(o) + ' 金币';
    case 'microwave': return '微波炉：复制一个' + RARITY[o.rarity].name + '物品 · ' + Interact.microwaveCost(o) + ' 金币';
    case 'challenge': return '挑战神龛：刷出精英，全杀奖励宝箱';
    case 'greed': return '贪婪神龛：拿金币，但难度 +5%';
    case 'succ': return '吸取神龛：吸走地图上所有经验';
    case 'curse': return 'Boss 诅咒：下次 Boss 多一只，多一个宝箱';
    case 'bossportal': return Game.bossAlive ? 'Boss 战斗中…' : '召唤 Boss · 越晚召唤血越多';
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
    if (o.kind === 'shrine') {
      // 站在圈里充能，离开就清空
      var r = 4 * Math.sqrt(P.st.size);
      var inside = d2 < r * r && Math.abs(dy) < 3;
      var speed = 1 / (4 * Math.pow(0.96, P.items.wrench || 0));
      o.charge = inside ? Math.min(1, o.charge + dt * speed) : Math.max(0, o.charge - dt * 0.6);
      o.ring.material.color.setHSL(o.golden ? 0.14 : 0.5 - o.charge * 0.35, 1, 0.6);
      var s = r * (0.25 + o.charge * 0.75);
      o.ring.scale.set(s, 1, s);
      if (inside && Math.random() < dt * 8) FX.burst(o.x + rand(-r, r) * 0.6, o.y + 0.3, o.z + rand(-r, r) * 0.6, 1, o.golden ? 0xffe14a : 0x7ef0ff, 1.5, 0.2);
      if (o.charge >= 1) { o.used = true; Interact.removeMeshes(o); UI.shrineChoice(o.golden); }
      continue;
    }
    if (o.kind === 'bossportal') {
      if (!o.found && d2 < 30 * 30) { o.found = true; UI.toast('发现了 Boss 传送门！', '#ff4b5a'); }
      if (!o.found && Math.random() < dt * 6) FX.burst(o.x + rand(-6, 6), o.y + rand(1, 6), o.z + rand(-6, 6), 1, 0xffffff, 2, 0.25);
      o.swirl.rotation.z += dt * 2;
    }
    if (o.kind === 'exitportal') o.swirl.rotation.z += dt * 3;
    if (d2 < o.r * o.r && Math.abs(dy) < 3 && d2 < bd) { bd = d2; best = o; }
  }
  Interact.near = best;
  UI.setPrompt(best ? Interact.label(best) : null, best && Interact.canUse(best));
  Interact.updateGlow();
};

Interact.canUse = function (o) {
  var K = Interact.KINDS[o.kind];
  if (K) return K.canUse ? !!K.canUse(o) : true;
  if (o.kind === 'chest' && !o.free) return P.gold >= Interact.chestCost() || (P.items.key > 0);
  if (o.kind === 'bossportal') return !Game.bossAlive;
  if (o.kind === 'microwave') return P.gold >= Interact.microwaveCost(o);
  if (o.kind === 'merchant') return P.gold >= Interact.merchantCost(o);
  return true;
};

// 不能用时的提示
Interact.denied = function (o) {
  var K = Interact.KINDS[o.kind];
  if (K) return K.denied ? K.denied(o) : '现在还不能用';
  switch (o.kind) {
    case 'chest': return '金币不够：打开宝箱要 ' + Interact.chestCost() + ' 金币';
    case 'merchant': return '金币不够：商人的' + RARITY[o.rarity].name + '物品要 ' + Interact.merchantCost(o) + ' 金币';
    case 'microwave': return '金币不够：复制一次要 ' + Interact.microwaveCost(o) + ' 金币';
    case 'bossportal': return 'Boss 还在战斗中';
  }
  return '金币不够';
};

Interact.use = function () {
  var o = Interact.near;
  if (!o || o.used || Game.state !== 'play') return;
  var K = Interact.KINDS[o.kind];
  if (!Interact.canUse(o)) { UI.toast(Interact.denied(o), '#ff6b6b'); return; }
  if (K) { K.use(o); return; }
  switch (o.kind) {
    case 'chest': {
      var free = o.free;
      if (!free && P.items.key) {
        // 钥匙：x/(1+x) 的几率免费
        var x = 0.1 * P.items.key;
        if (Math.random() < x / (1 + x)) { free = true; UI.toast('钥匙生效：免费打开！', '#ffd84a'); }
      }
      if (!free) {
        if (P.gold < Interact.chestCost()) { UI.toast('金币不够', '#ff6b6b'); return; }
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
    case 'moai':
      Interact.consume(o);
      UI.moai();
      break;
    case 'merchant':
      UI.merchant(o);
      break;
    case 'microwave':
      UI.microwave(o);
      break;
    case 'challenge':
      Interact.consume(o);
      Game.startChallenge(o);
      break;
    case 'greed':
      Interact.consume(o);
      var g = Math.round(25 * Game.stage * P.st.goldGain);
      P.gold += g;
      P.addMod('difficulty', 0.05);
      FX.burst(o.x, o.y + 2, o.z, 20, 0xffd23a, 6, 0.3);
      UI.toast('+' + g + ' 金币，难度 +5%', '#ffd23a');
      break;
    case 'succ':
      Interact.consume(o);
      Pickups.magnetAll();
      UI.toast('所有经验都飞过来了！', '#3fa9ff');
      break;
    case 'curse':
      Interact.consume(o);
      Game.bossCurses++;
      UI.toast('Boss 诅咒：下次 Boss 多一只', '#ff2a2a');
      break;
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
  UI.toast('传送门开启了！随时可以进入下一关', '#b05aff');
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
