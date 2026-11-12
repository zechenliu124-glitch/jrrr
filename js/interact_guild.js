'use strict';
// ============================================================
//  行会的互动点（全部通过 Interact.KINDS 注册）：誓言石碑、比武木人、滚石、决斗旗、补给马车、炼金坩埚、行商驴车
//  模型（第 10 块）：每种一个函数，在 Guild.MODELS 里
//  只用包装函数接入其他文件（Interact.populate、Enemies.kill、P.update），弹窗走 UI.modeHandlers（页面加载完再注册）
//  摆放时只用 Math.random（建关卡时是种子随机数），继续游戏时摆出来的东西一样
// ============================================================
var Guild = { oath: null, lastVow: null, joust: null, rolling: null, duelArmed: false, champion: null, jumps: 0 };

// 摆放规则（和 MX.SPOT 一样：fp 占地半径，minR 离出生点最近距离，gap 间距，flat 允许的高低差，sink 往低处沉多少）
Guild.SPOT = {
  pedlar: { fp: 3.0, minR: 30, gap: 14, flat: 0.6, sink: 0.4 },
  supplycart: { fp: 2.4, minR: 30, gap: 12, flat: 0.7, sink: 0.4 },
  crucible: { fp: 1.8, minR: 30, gap: 12, flat: 0.6, sink: 0.4 },
  gauntlet: { fp: 1.2, minR: 40, gap: 14, flat: 1.0, sink: 0.3 },
  oathstone: { fp: 1.4, minR: 22, gap: 10, flat: 0.8, sink: 0.3 },
  quintain: { fp: 1.4, minR: 25, gap: 10, flat: 0.8, sink: 0.3 }
};
// 先放大的（马车、驴车），再放小的；滚石最后放在长坡顶上
Guild.ORDER = ['pedlar', 'supplycart', 'crucible', 'gauntlet', 'oathstone', 'quintain'];

// 每关的数量：k = 关卡分钟数 / 10（默认 15 分钟 → 1.5）
Guild.count = function (kind) {
  var k = typeof Pace !== 'undefined' ? Pace.contentScale() : 1, sq = Math.sqrt(k);
  switch (kind) {
    case 'oathstone': return Math.round(6 * sq);
    case 'quintain': return Math.round(5 * k);
    case 'boulder': return 2;
    case 'gauntlet': return 1;
    case 'supplycart': return Math.round(3 * sq);
    case 'crucible': return Math.round(2 * sq);
    case 'pedlar': return Math.round(2 * sq);
  }
  return 0;
};

Guild.add = function (kind, s, extra) {
  var ex = extra || {};
  if (ex.rotY == null) ex.rotY = MX.faceCenter(s);
  if (ex.mxFp == null && Guild.SPOT[kind]) ex.mxFp = Guild.SPOT[kind].fp;
  return Interact.add(kind, s.x, s.z, s.y, ex);
};

Guild.populate = function () {
  Guild.lateInstall();
  Guild.reset();
  Guild.ORDER.forEach(function (kind) {
    for (var i = 0, n = Guild.count(kind); i < n; i++) Guild.add(kind, MX.findSpot(Guild.SPOT[kind]), { idx: i });
  });
  Guild.placeBoulders();
};

// 换关、重开、回主菜单（Interact.clear 调每种的 clear）：可以重复调用。新的一局（第 1 关）忘掉上一个誓
Guild.reset = function () {
  Guild.oath = null;
  Guild.joust = null;
  Guild.rolling = null;
  Guild.duelArmed = false;
  Guild.champion = null;
  Guild.jumps = 0;
  if (typeof Game === 'undefined' || Game.stage === 1) Guild.lastVow = null;
};

// 小工具：贴图（图集满了退回内置的）、一块发光的染色材质（每个物体自己一份，会变色）
Guild.T = function () {
  if (!Guild._T) { var T = MX.tiles(); Guild._T = { plank: T.plank, block: T.block, canvas: T.canvas, crate: MX.tile('it_plank', 'wood') }; }
  return Guild._T;
};
Guild.tintMat = function (color) {
  return new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas, color: new THREE.Color(color) });
};
// 地形坡度（中心差分，步长 1 米）
Guild.grad = function (x, z) {
  var h = W.terrainH;
  return { x: (h(x + 1, z) - h(x - 1, z)) / 2, z: (h(x, z + 1) - h(x, z - 1)) / 2 };
};
Guild.toastGold = function (text) { UI.toast(text, Kit.color('gold')); };

// ============================================================
//  模型（第 10 块）：每个函数只看 o，返回 THREE.Group；几何体缓存在 MX.geoCache（换关不释放）
//  Guild.geo 用 Enemies.buildGeo（静态，零件第 9 项 lit > 1 的顶点色会发亮），一种东西一个不透明网格 + 会动的小组
//  会动的把手：o.crest / crestMat、o.arm、o.bag、o.ball、o.flag / flag2、o.lids、o.coals、o.liquid / liquidMat、o.bubbles、o.donkey、o.drum
//  模型代码里不用 Math.random（零件的颜色抖动在 Enemies.buildGeo 里，那是「安静」的）
// ============================================================
Guild.MODELS = {};
Guild.geo = function (key, fn) { return MX.geoCache[key] || (MX.geoCache[key] = Enemies.buildGeo(fn(), true)); };
Guild.L = function (k, parts) { for (var i = 0; i < parts.length; i++) parts[i][8] = k; return parts; };
// 两点之间的方块 / 圆柱；让零件的 +y 指向方向 d 的欧拉角（贴在球面上的苔藓、地衣）
Guild.sgB = function (a, b, w, c, t, d) { return ENEMY_KIT.sgB(a, b, w, c, t, d); };
Guild.sgC = function (a, b, r1, r2, c, t, n) { return ENEMY_KIT.sgC(a, b, r1, r2, c, t, n); };
Guild.upTo = function (d) { var l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1; return [Math.atan2(d[2], d[1]), 0, -Math.asin(clamp(d[0] / l, -1, 1))]; };
Guild.tor = function (r, tube, rs, ts, pos, c, t, rot, sc) { return ['torus', [r, tube, rs, ts], pos, c, rot || null, sc || null, t]; };
Guild.hash = function (a, b, c) {
  var n = (a * 374761393 + b * 668265263 + c * 1274126177) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};

// ---- 第 10 块的零件类型（只追加新名字）----
// 滚石：二十面体细分 1 次，每个顶点按位置的整数哈希径向抖 ±6%（共用的顶点抖得一样，不裂缝）；
// 法线 = 面法线和球面法线各一半（圆，但看得出石面）；每个面自己投影一块贴图
MODEL.extraGeo.c10Boulder = function (s) {
  var R = s[0], g = new THREE.IcosahedronGeometry(R, s[1] == null ? 1 : s[1]);
  if (g.index) { var g2 = g.toNonIndexed(); g.dispose(); g = g2; }
  var p = g.attributes.position, n = g.attributes.normal, uv = g.attributes.uv, i, k;
  var v = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), fn = new THREE.Vector3(), t = new THREE.Vector3(), bt = new THREE.Vector3(), m = new THREE.Vector3();
  var sm = [];
  for (i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    sm.push(v.clone().normalize());
    var f = 1 + 0.06 * (2 * Guild.hash(Math.round(v.x * 100), Math.round(v.y * 100), Math.round(v.z * 100)) - 1);
    p.setXYZ(i, v.x * f, v.y * f, v.z * f);
  }
  for (i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    fn.subVectors(b, a).cross(v.subVectors(c, a)).normalize();
    m.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    if (Math.abs(fn.y) > 0.9) t.set(1, 0, 0); else t.set(fn.z, 0, -fn.x).normalize();
    bt.crossVectors(fn, t);
    var ou = (Guild.hash(i, 7, 3) - 0.5) * 0.2, ov = (Guild.hash(i, 11, 5) - 0.5) * 0.2;
    for (k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, i + k).sub(m);
      uv.setXY(i + k, clamp(0.5 + ou + v.dot(t) * 0.8, 0, 0.999), clamp(0.5 + ov + v.dot(bt) * 0.8, 0, 0.999));
      var q = sm[i + k];
      v.set(fn.x + q.x, fn.y + q.y, fn.z + q.z).normalize();
      n.setXYZ(i + k, v.x, v.y, v.z);
    }
  }
  return g;
};
// 半圆的拱（车篷）：沿局部 y 的半根圆柱，转 [π/2, 0, 0] 以后拱背朝上；s = [半径, 长, 段数, 不要两头的盖子]
MODEL.extraGeo.c10Arch = function (s) {
  return MX.fixUV(new THREE.CylinderGeometry(s[0], s[0], s[1], s[2] || 8, 1, !!s[3], Math.PI / 2, Math.PI));
};

// ---------------- 誓言石碑 ----------------
// 两级石台上立着一块盾形尖顶的誓言石碑，正反两面刻着空白盾徽、两条窄边上各一道发光的纹带（侧面看不再是灰柱子），
// 碑前插着一把石剑（誓言是对着剑立的）；青白一种颜色，没有金色
Guild.OATH = { stone: 0x8e939c, dark: 0x7d8088, inset: 0x55585f, lichen: 0x6a7a5a, blade: 0xb4bac4, hilt: 0x6e727a, glow: 0xbfefff, rim: 0x7ef0ff };
// 刻出来的盾形凹槽（两面）：长方块 + 朝下的尖
Guild.shieldInset = function (y, z, w, c) {
  return [mxB(w, w * 0.86, 0.03, 0, y, z, c, 'plain'), mxK(w * 0.52, w * 0.58, 4, 0, y - w * 0.43 - w * 0.29, z, c, 'plain', [Math.PI, 0, 0], [1, 1, 0.1])];
};
// 石剑（剑尖朝下插着）：x、z 是位置，y0 是插进去的地方；broken：只剩插着的一截断刃
Guild.stoneSword = function (x, y0, z, broken) {
  var O = Guild.OATH, p = [];
  if (broken) {
    p.push(mxB(0.12, 0.3, 0.05, x, y0 + 0.15, z, O.blade, 'rock'), mxK(0.07, 0.12, 3, x + 0.015, y0 + 0.34, z, O.blade, 'rock', [0, 0, -0.5], [1, 1, 0.35]));
  } else {
    p.push(mxB(0.12, 0.76, 0.05, x, y0 + 0.38, z, O.blade, 'rock'), mxB(0.03, 0.6, 0.055, x, y0 + 0.42, z, 0x868c96, 'rock'),
      mxB(0.5, 0.08, 0.09, x, y0 + 0.8, z, O.hilt, 'rock'),
      mxB(0.045, 0.2, 0.045, x, y0 + 0.94, z, 0x5a5e66, 'rock'), ['oct', [0.075], [x, y0 + 1.08, z], O.hilt, null, null, 'rock']);
  }
  // 插进石头的地方：两块碎石
  p.push(['oct', [0.07], [x - 0.1, y0 + 0.02, z + 0.02], O.dark, null, [1, 0.5, 1], 'rock'], ['oct', [0.06], [x + 0.09, y0 + 0.02, z - 0.02], O.dark, null, [1, 0.5, 1], 'rock']);
  return p;
};
Guild.MODELS.oathstoneParts = function () {
  var T = Guild.T(), O = Guild.OATH, p = [
    mxB(1.7, 0.3, 1.0, 0, 0.15, 0, O.dark, T.block), mxB(1.3, 0.2, 0.8, 0, 0.4, 0, O.stone, T.block),
    mxB(1.25, 1.8, 0.5, 0, 1.4, 0, O.stone, 'rock'),
    mxB(1.31, 0.1, 0.54, 0, 2.3, 0, O.dark, 'rock'),
    // 尖顶：转 45° 的方块，下半截埋在碑身里，正面看是个尖拱
    mxB(0.884, 0.884, 0.46, 0, 2.3, 0, O.stone, 'rock', [0, 0, Math.PI / 4]),
    // 两条窄边上的凹槽（发光纹带嵌在里面）
    mxB(0.03, 1.5, 0.22, 0.625, 1.45, 0, O.inset, 'plain'), mxB(0.03, 1.5, 0.22, -0.625, 1.45, 0, O.inset, 'plain')
  ];
  [0.25, -0.25].forEach(function (z) {
    p = p.concat(Guild.shieldInset(2.0, z, 0.66, O.inset));
    // 盾徽下面刻的两道线
    p.push(mxB(0.84, 0.05, 0.02, 0, 1.12, z, O.inset, 'plain'));
  });
  p = p.concat(Guild.stoneSword(0, 0.3, 0.47, false));
  // 石台角上的地衣
  [[0.7, 0.31, 0.38, 0.16], [-0.72, 0.31, -0.35, 0.14], [-0.55, 0.51, 0.3, 0.11], [0.5, 0.51, -0.3, 0.1]].forEach(function (q) {
    p.push(['oct', [q[3] * 1.2], [q[0], q[1], q[2]], O.lichen, null, [1.4, 0.25, 1.1], 'leaf']);
  });
  return p;
};
// 发光部分（一份染色材质，立誓时更亮）：两面的盾徽和外圈描边 + 两条窄边的纹带
Guild.MODELS.crestParts = function () {
  var O = Guild.OATH, p = [];
  [0.27, -0.27].forEach(function (z) {
    var s = z > 0 ? 1 : -1;
    p.push(mxB(0.5, 0.44, 0.03, 0, 2.02, z, O.glow, 'plain'), mxK(0.26, 0.3, 4, 0, 1.65, z, O.glow, 'plain', [Math.PI, 0, 0], [1, 1, 0.15]),
      mxB(0.58, 0.52, 0.02, 0, 2.02, z - s * 0.006, O.rim, 'plain'), mxK(0.31, 0.36, 4, 0, 1.62, z - s * 0.006, O.rim, 'plain', [Math.PI, 0, 0], [1, 1, 0.1]));
  });
  p.push(mxB(0.035, 1.4, 0.13, 0.632, 1.45, 0, O.rim, 'plain'), mxB(0.035, 1.4, 0.13, -0.632, 1.45, 0, O.rim, 'plain'));
  return p;
};
Guild.MODELS.oathstone = function (o) {
  var g = new THREE.Group();
  g.add(MX.mesh(Guild.geo('g10_oathstone', Guild.MODELS.oathstoneParts)));
  o.crestMat = Guild.tintMat(0xffffff);       // 平时就亮（别像墓碑），立誓时更亮，还会一秒一闪
  o.crest = new THREE.Mesh(Guild.geo('g10_oath_crest', Guild.MODELS.crestParts), o.crestMat);
  g.add(o.crest);
  return g;
};
// 裂开的石碑：两半往两边歪 ±0.12，中间一道缝，盾徽裂成暗的两块；石剑断了，上半截躺在地上
Guild.MODELS.crackedParts = function () {
  var T = Guild.T(), O = Guild.OATH, p = [mxB(1.7, 0.3, 1.0, 0, 0.15, 0, O.dark, T.block), mxB(1.3, 0.2, 0.8, 0, 0.4, 0, O.stone, T.block)];
  [-1, 1].forEach(function (s) {
    var a = -s * 0.12, px = s * 0.33, py = 0.5;
    // 以半块底边中点为支点转：局部 (lx, ly) → 世界
    var at = function (lx, ly) { return [px + lx * Math.cos(a) - ly * Math.sin(a), py + lx * Math.sin(a) + ly * Math.cos(a)]; };
    var c = at(0, 0.9), b = at(0, 1.8), k = at(-s * 0.06, 2.05), cr = at(-s * 0.16, 1.45), r = [0, 0, a];
    p.push(mxB(0.595, 1.8, 0.5, c[0], c[1], 0, O.stone, 'rock', r), mxB(0.62, 0.1, 0.54, b[0], b[1], 0, O.dark, 'rock', r),
      mxB(0.5, 0.5, 0.5, k[0], k[1] - 0.1, 0, O.stone, 'rock', [0, 0, a + s * Math.PI / 4]),
      mxB(0.25, 0.46, 0.06, cr[0], cr[1], 0.24, 0x3a3c40, 'plain', r), mxB(0.25, 0.46, 0.06, cr[0], cr[1], -0.24, 0x3a3c40, 'plain', r));
  });
  p = p.concat(Guild.stoneSword(0, 0.3, 0.47, true));
  // 断下来的上半截：剑柄、护手和半截剑刃躺在地上
  p.push(mxB(0.5, 0.04, 0.1, 0.62, 0.03, 0.72, O.blade, 'rock', [0, 0.35, 0]), mxB(0.08, 0.07, 0.44, 0.38, 0.04, 0.8, 0x8a909a, 'rock', [0, 0.35, 0]),
    mxB(0.2, 0.045, 0.045, 0.26, 0.04, 0.84, 0x5a5e66, 'rock', [0, 0.35, 0]), ['oct', [0.075], [0.14, 0.06, 0.88], O.hilt, null, null, 'rock']);
  p.push(['oct', [0.18], [0.4, 0.38, 0.62], O.stone, null, [1, 0.6, 1], 'rock'], ['oct', [0.13], [-0.62, 0.36, 0.6], O.dark, null, [1, 0.6, 1], 'rock']);
  return p;
};
Guild.MODELS.oathstoneCracked = function () {
  var g = new THREE.Group();
  g.add(MX.mesh(Guild.geo('g10_oathstone_cracked', Guild.MODELS.crackedParts)));
  return g;
};

// ---------------- 比武木人 ----------------
// 十字底脚加四根斜撑、立柱、铁帽；会转的横杆一头是金边红圆盾，另一头吊着沙袋（o.bag，转起来往外甩）；立柱前面一块草靶
Guild.MODELS.quintainParts = function () {
  var T = Guild.T(), wood = 0x6b4a2c, iron = 0x3d3f46, p = [
    mxB(1.5, 0.14, 0.22, 0, 0.07, 0, wood, T.plank), mxB(1.5, 0.14, 0.22, 0, 0.07, 0, wood, T.plank, [0, Math.PI / 2, 0]),
    mxC(0.13, 0.16, 2.3, 6, 0, 1.15, 0, 0x7a5532, 'bark'),
    mxC(0.16, 0.16, 0.08, 6, 0, 1.88, 0, iron, 'metal'),
    mxC(0.15, 0.18, 0.14, 6, 0, 2.36, 0, 0x4a4038, 'metal'), ['oct', [0.12], [0, 2.52, 0], 0x5a5048, null, [1, 1.3, 1], 'metal'],
    // 草靶：稻草圆盘 + 红圈 + 红心，绑在柱子上的两道绳
    mxC(0.33, 0.33, 0.09, 8, 0, 1.35, 0.2, 0xd8c070, 'kn_wicker', [Math.PI / 2, 0, 0]),
    Guild.tor(0.22, 0.03, 3, 8, [0, 1.35, 0.25], 0xb83a2e, 'cloth'),
    mxC(0.08, 0.08, 0.04, 5, 0, 1.35, 0.25, 0xb83a2e, 'cloth', [Math.PI / 2, 0, 0]),
    mxB(0.36, 0.04, 0.06, 0, 1.62, 0.15, 0x8a7a5a, 'cloth'), mxB(0.36, 0.04, 0.06, 0, 1.08, 0.15, 0x8a7a5a, 'cloth')
  ];
  // 四根斜撑：底脚上 0.55 米处到立柱 0.7 米高
  for (var i = 0; i < 4; i++) {
    var a = i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
    p.push(Guild.sgB([c * 0.58, 0.14, s * 0.58], [c * 0.1, 0.72, s * 0.1], 0.08, 0x5e4026, T.plank, 0.08));
  }
  return p;
};
Guild.MODELS.quintainArmParts = function () {
  var iron = 0x3d3f46, red = 0xb83a2e, gold = 0xe8b83a;
  return [
    mxB(2.4, 0.16, 0.16, 0, 0, 0, 0x8a6038, 'wood'),
    mxB(0.12, 0.19, 0.19, -1.12, 0, 0, iron, 'metal'),
    // 圆盾：红底、金边、金色盾心、一道金斜纹
    mxB(0.12, 0.3, 0.1, 1.12, -0.08, 0.06, iron, 'metal'),
    mxC(0.45, 0.45, 0.07, 10, 1.12, -0.12, 0.13, red, 'metal', [Math.PI / 2, 0, 0]),
    Guild.tor(0.45, 0.045, 3, 10, [1.12, -0.12, 0.13], gold, 'gold'),
    mxC(0.14, 0.17, 0.08, 6, 1.12, -0.12, 0.19, gold, 'gold', [Math.PI / 2, 0, 0]),
    mxB(0.05, 0.62, 0.02, 1.12, -0.12, 0.175, 0xe0c078, 'gold', [0, 0, 0.6])
  ];
};
// 沙袋：绳子挂在钩子上（o.bag 的原点就是挂点），扎口、补丁
Guild.MODELS.quintainBagParts = function () {
  return [
    mxB(0.035, 0.42, 0.035, 0, -0.25, 0, 0x5a4630, 'plain'),
    mxB(0.14, 0.1, 0.14, 0, -0.46, 0, 0x8a7448, 'cloth'),
    ['dodec', [0.32], [0, -0.82, 0], 0xc8b080, null, [0.85, 1.3, 0.85], 'cloth'],
    mxB(0.16, 0.14, 0.03, 0.06, -0.78, 0.27, 0xa08a5a, 'cloth', [0, 0.2, 0.15])
  ];
};
Guild.MODELS.quintain = function (o) {
  var g = new THREE.Group();
  g.add(MX.mesh(Guild.geo('g10_quintain', Guild.MODELS.quintainParts)));
  o.arm = new THREE.Group();
  o.arm.position.y = 2.05;
  o.arm.add(MX.mesh(Guild.geo('g10_quintain_arm', Guild.MODELS.quintainArmParts)));
  o.bag = new THREE.Group();
  o.bag.position.set(-1.12, -0.12, 0);
  o.bag.add(MX.mesh(Guild.geo('g10_quintain_bag', Guild.MODELS.quintainBagParts)));
  o.arm.add(o.bag);
  g.add(o.arm);
  return g;
};

// ---------------- 滚石 ----------------
// 长青苔的圆石（够圆才滚得动）：抖过的二十面体、顶上三块苔藓、四块地衣；o.ball 的原点就是球心
Guild.MODELS.boulderParts = function () {
  var p = [['c10Boulder', [1.4, 1], [0, 0, 0], 0x7a7870, null, null, 'rock']];
  // 苔藓贴着球面，顶部偏一侧（[方向, 大小, 颜色]）
  [[[0.25, 1, 0.15], 0.66, 0x4f7a34], [[-0.55, 0.8, -0.35], 0.54, 0x5a8a3a], [[0.3, 0.6, 0.85], 0.46, 0x4f7a34], [[-0.7, 0.45, 0.6], 0.38, 0x46702e]].forEach(function (q) {
    var d = q[0], l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), r = 1.27;
    p.push(['dodec', [q[1]], [d[0] / l * r, d[1] / l * r, d[2] / l * r], q[2], Guild.upTo(d), [1, 0.3, 1], 'env_moss']);
  });
  [[0.9, -0.1, 0.5], [-0.8, 0.1, 0.7], [-0.4, -0.3, -1], [0.75, 0.35, -0.7]].forEach(function (d, i) {
    var l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]), r = 1.38;
    p.push(['oct', [0.2 + i * 0.03], [d[0] / l * r, d[1] / l * r, d[2] / l * r], 0xa0a070, Guild.upTo(d), [1, 0.18, 1.3], 'leaf']);
  });
  return p;
};
Guild.MODELS.boulder = function (o) {
  var g = new THREE.Group();
  o.ball = new THREE.Group();
  o.ball.position.y = 1.4;
  o.ball.add(MX.mesh(Guild.geo('g10_boulder', Guild.MODELS.boulderParts)));
  g.add(o.ball);
  return g;
};

// ---------------- 决斗旗 ----------------
// 劈开的石堆里插着一支骑枪（钢尖、护手盘），挂着一面大燕尾红旗（金边、白色铁手套纹）和一只铁手套；
// 另一只铁手套被扔在地上（「扔下手套」就是挑战）。旗子分两半：o.flag 绕枪杆摆，o.flag2（外半截和燕尾）摆得更大
Guild.GAUNT = { iron: 0x8a929c, dark: 0x5a6068, red: 0xd9333a, gold: 0xe8b83a, white: 0xf2efe6 };
Guild.MODELS.gauntletParts = function () {
  var G = Guild.GAUNT, rock = 0x7f7d76, wood = 0x6b4a2c, p = [
    ['dodec', [0.36], [0.2, 0.14, 0.06], rock, null, [1, 0.75, 1], 'rock'],
    ['dodec', [0.3], [-0.24, 0.12, 0.12], 0x8a8880, null, [1, 0.7, 1], 'rock'],
    ['oct', [0.3], [0.02, 0.1, -0.28], rock, null, [1, 0.6, 1], 'rock'],
    // 骑枪：杆、握把的皮条、护手盘（锥）、钢尖
    mxC(0.045, 0.06, 2.75, 6, 0, 1.38, 0, wood, 'wood'),
    mxC(0.055, 0.055, 0.3, 6, 0, 0.75, 0, 0x4a3020, 'cloth'),
    mxK(0.2, 0.26, 6, 0, 1.0, 0, G.iron, 'metal'),
    mxK(0.075, 0.36, 5, 0, 3.0, 0, 0xc8d0d8, 'metal'),
    // 挂着的铁手套：皮带、护腕、手背、四根手指、大拇指
    mxB(0.025, 0.22, 0.025, 0, 1.7, 0.08, 0x3a2a1a, 'plain', [0.35, 0, 0]),
    mxC(0.12, 0.14, 0.17, 5, 0, 1.53, 0.16, G.iron, 'metal'),
    mxB(0.22, 0.17, 0.12, 0, 1.37, 0.16, G.iron, 'metal'),
    mxB(0.07, 0.12, 0.07, -0.13, 1.38, 0.17, G.iron, 'metal', [0, 0, 0.5])
  ];
  for (var i = 0; i < 4; i++) p.push(mxB(0.045, 0.15, 0.06, -0.075 + i * 0.05, 1.21, 0.17, 0x7a828c, 'metal', [0.1, 0, 0]));
  // 扔在地上的另一只：手心朝上，手指往 +x，护腕朝 -x
  var gx = 0.25, gz = 0.62;
  p.push(mxC(0.12, 0.14, 0.17, 5, gx - 0.2, 0.12, gz, G.iron, 'metal', [0, 0, Math.PI / 2]),
    mxB(0.17, 0.1, 0.22, gx - 0.04, 0.07, gz, G.iron, 'metal'),
    mxB(0.08, 0.06, 0.07, gx - 0.02, 0.09, gz + 0.14, G.iron, 'metal', [0, 0.5, 0]));
  for (i = 0; i < 2; i++) p.push(mxB(0.15, 0.045, 0.095, gx + 0.12, 0.08, gz - 0.05 + i * 0.1, 0x7a828c, 'metal', [0, 0, 0.35]));
  return p;
};
// 旗子内半截（枪杆到 0.5 米）：红布、上下金边、靠杆一侧的金边、白色铁手套纹
Guild.MODELS.flagParts = function () {
  var G = Guild.GAUNT;
  return [
    mxB(0.46, 0.6, 0.035, 0.28, 2.34, 0, G.red, 'cloth'),
    mxB(0.47, 0.05, 0.045, 0.28, 2.62, 0, G.gold, 'gold'), mxB(0.47, 0.05, 0.045, 0.28, 2.06, 0, G.gold, 'gold'),
    mxB(0.05, 0.6, 0.045, 0.07, 2.34, 0, G.gold, 'gold'),
    // 纹章：举起的铁手套（护腕、手掌、手指、拇指）
    mxB(0.11, 0.09, 0.05, 0.32, 2.2, 0, G.white, 'plain'), mxB(0.16, 0.15, 0.05, 0.32, 2.32, 0, G.white, 'plain'),
    mxB(0.14, 0.12, 0.05, 0.33, 2.45, 0, G.white, 'plain')
  ];
};
// 外半截（原点在内半截的外边 x = 0.5）：红布、金边、两条燕尾
Guild.MODELS.flag2Parts = function () {
  var G = Guild.GAUNT;
  return [
    mxB(0.3, 0.6, 0.035, 0.14, 2.34, 0, G.red, 'cloth'),
    mxB(0.31, 0.05, 0.045, 0.14, 2.62, 0, G.gold, 'gold'), mxB(0.31, 0.05, 0.045, 0.14, 2.06, 0, G.gold, 'gold'),
    mxB(0.3, 0.24, 0.035, 0.42, 2.47, 0, G.red, 'cloth', [0, 0, -0.12]), mxB(0.3, 0.24, 0.035, 0.42, 2.19, 0, G.red, 'cloth', [0, 0, 0.12])
  ];
};
Guild.MODELS.gauntlet = function (o) {
  var g = new THREE.Group();
  g.add(MX.mesh(Guild.geo('g10_gauntlet', Guild.MODELS.gauntletParts)));
  o.flag = new THREE.Group();
  o.flag.add(MX.mesh(Guild.geo('g10_gauntlet_flag', Guild.MODELS.flagParts)));
  o.flag2 = new THREE.Group();
  o.flag2.position.x = 0.5;
  o.flag2.add(MX.mesh(Guild.geo('g10_gauntlet_flag2', Guild.MODELS.flag2Parts)));
  o.flag.add(o.flag2);
  g.add(o.flag);
  return g;
};

// ---------------- 补给马车 ----------------
// 翻倒的行会两轮补给车：车斗往后翻、尾板着地、两根车辕翘在半空（插着一面小红旗），
// 一只大辐条轮还竖在车轴上，另一只掉在地上，那一头的车轴架在木桶上；破篷布、三只捆着绳子的木箱（盖子在 o.lids）、一袋撒了的粮
// 箱子：[x, z, 朝向]；第 3 只倒在地上，盖子掉在旁边
Guild.CRATES = [[0.4, 1.3, 0.2], [-0.8, 1.05, -0.35], [-1.55, -0.15, 0.5]];
Guild.CART = { a: 0.62, oy: 0.74, wood: 0x6b4a2c, bed: 0x7a5530, side: 0x6e4c2a, iron: 0x3d3f46, rope: 0x8a7a5a };
// 车斗坐标（沿车长 u、车斗的上方 v、横向 z）→ 世界
Guild.cartAt = function (u, v, z) {
  var C = Guild.CART, c = Math.cos(C.a), s = Math.sin(C.a);
  return [u * c - v * s, C.oy + u * s + v * c, z];
};
// 辐条轮：轮圈（木）+ 铁箍 + 6 根辐条 + 轮毂；flat：平躺在地上
Guild.wheelParts = function (x, y, z, r, flat) {
  var C = Guild.CART, rot = flat ? [Math.PI / 2, 0, 0] : null, n = flat ? 2 : 3, p = [Guild.tor(r - 0.04, 0.055, flat ? 3 : 4, 10, [x, y, z], C.wood, 'wood', rot)];
  if (!flat) p.push(Guild.tor(r + 0.01, 0.03, 3, 10, [x, y, z], C.iron, 'metal', rot), mxC(0.11, 0.11, 0.2, 6, x, y, z, C.iron, 'metal', [Math.PI / 2, 0, 0]));
  for (var i = 0; i < n; i++) {
    var a = i * Math.PI / n;
    p.push(mxB(0.06, (r - 0.05) * 2, 0.045, x, y, z, 0x7a5a36, 'wood', flat ? [Math.PI / 2, 0, a] : [0, 0, a]));
  }
  return p;
};
Guild.MODELS.supplyParts = function () {
  var T = Guild.T(), C = Guild.CART, A = Guild.cartAt, r = [0, 0, C.a], p = [], i;
  // 车斗：底板、两侧板（上沿压一条深色木条）、尾板（着地）、前板
  var q = A(0, 0, 0);
  p.push(mxB(1.9, 0.1, 1.2, q[0], q[1], 0, C.bed, T.plank, r));
  [0.6, -0.6].forEach(function (z) {
    var a = A(0, 0.2, z);
    p.push(mxB(1.9, 0.34, 0.06, a[0], a[1], z, C.side, T.plank, r));
  });
  q = A(-0.95, 0.12, 0); p.push(mxB(0.06, 0.44, 1.2, q[0], q[1], 0, C.side, T.plank, r));
  q = A(0.95, 0.2, 0); p.push(mxB(0.06, 0.34, 1.2, q[0], q[1], 0, C.side, T.plank, r));
  // 车辕：从车斗前面接着往上翘，前头一根横木，右边那根顶上插着行会小红旗
  [0.38, -0.38].forEach(function (z) {
    var a = A(0.7, -0.08, z), b = A(2.55, -0.08, z);
    p.push(Guild.sgB(a, b, 0.08, C.wood, 'wood'));
  });
  q = A(2.35, -0.08, 0); p.push(mxB(0.07, 0.07, 0.84, q[0], q[1], 0, 0x5e4026, 'wood', r));
  q = A(2.55, -0.08, 0.38);
  p.push(mxB(0.03, 0.5, 0.03, q[0], q[1] + 0.25, 0.38, 0x3a2a1a, 'plain'),
    mxB(0.025, 0.2, 0.34, q[0], q[1] + 0.4, 0.55, 0xc8302a, 'cloth'), mxK(0.1, 0.16, 3, q[0], q[1] + 0.4, 0.8, 0xc8302a, 'cloth', [Math.PI / 2, 0, 0], [0.2, 1, 1]),
    mxB(0.03, 0.08, 0.08, q[0], q[1] + 0.4, 0.52, 0xe8b83a, 'gold'));
  // 车轴、竖着的轮子、架在木桶上的那一头
  p.push(mxC(0.05, 0.05, 1.5, 4, 0, 0.6, 0, C.iron, 'metal', [Math.PI / 2, 0, 0]));
  p = p.concat(Guild.wheelParts(0, 0.6, 0.72, 0.6, false));
  p.push(mxC(0.25, 0.22, 0.56, 6, 0.02, 0.28, -0.72, 0x7a5530, 'wood'), mxC(0.265, 0.265, 0.05, 6, 0.02, 0.42, -0.72, C.iron, 'metal'));
  // 掉在地上的轮子
  p = p.concat(Guild.wheelParts(-1.2, 0.06, -1.35, 0.55, true));
  // 破篷布：搭在车斗上的一大块 + 从侧面垂下来的一角 + 撕开的口子
  q = A(-0.1, 0.45, 0.05); p.push(mxB(1.5, 0.04, 1.32, q[0], q[1], 0.05, 0xc8b88e, T.canvas, [0.1, 0, C.a + 0.05]));
  q = A(-0.35, 0.22, 0.7); p.push(mxB(0.95, 0.55, 0.04, q[0], q[1] - 0.1, 0.72, 0xbcac82, T.canvas, [0.12, 0, C.a - 0.1]));
  // 三只木箱（绳子十字捆着；倒着的那只侧放）
  Guild.CRATES.forEach(function (c, i) {
    var side = i === 2, rot = side ? [0, c[2], Math.PI / 2] : [0, c[2], 0];
    p.push(mxB(0.55, 0.5, 0.55, c[0], 0.25, c[1], 0x9a6a3a, T.crate, rot),
      mxB(0.04, 0.52, 0.57, c[0], 0.25, c[1], C.rope, 'cloth', rot));
  });
  // 撒了的粮袋 + 洒出来的一小堆
  p.push(['dodec', [0.3], [0.85, 0.17, -1.0], 0xb8a070, [0, 0.6, 0.25], [1.25, 0.6, 0.9], 'cloth'],
    mxB(0.12, 0.14, 0.12, 1.18, 0.2, -1.12, 0x8a7448, 'cloth', [0, 0.6, 1.2]),
    ['oct', [0.2], [1.34, 0.03, -1.2], 0xd8c080, null, [1.4, 0.25, 1.2], 'sand']);
  return p;
};
Guild.MODELS.lidParts = function () {
  return [mxB(0.58, 0.07, 0.58, 0, 0.035, 0.29, 0x8a5a2e, Guild.T().crate), mxB(0.08, 0.1, 0.03, 0, 0.0, 0.585, 0x2a2a2e, 'metal')];
};
Guild.MODELS.supplycart = function (o) {
  var g = new THREE.Group();
  g.add(MX.mesh(Guild.geo('g10_supplycart', Guild.MODELS.supplyParts)));
  o.lids = Guild.CRATES.map(function (c, i) {
    // 合页在箱子后边：绕 x 轴转就是打开
    var l = new THREE.Group();
    l.rotation.order = 'YXZ';
    l.add(MX.mesh(Guild.geo('g10_supply_lid', Guild.MODELS.lidParts)));
    // 倒着的那只箱子：盖子早掉在旁边的地上了
    if (i === 2) { l.position.set(c[0] + 0.2, 0.0, c[1] + 0.7); l.rotation.y = c[2] + 0.6; l.userData.off = true; }
    else { l.position.set(c[0] - 0.29 * Math.sin(c[2]), 0.5, c[1] - 0.29 * Math.cos(c[2])); l.rotation.y = c[2]; }
    l.userData.y0 = l.position.y;
    g.add(l);
    return l;
  });
  return g;
};

// ---------------- 炼金坩埚 ----------------
// 三根木杆在 2.2 米高处绑成三脚架，铁链吊着一口黑铁锅，锅下一堆炭火（o.coals，发光）和小火苗，
// 锅里的药水（o.liquid，自己的染色材质）冒着三个泡（o.bubbles，同一份材质），一把大木勺，地上两瓶药
Guild.MODELS.crucibleParts = function () {
  var p = [], i, iron = 0x262628, rim = 0x3a3a3e, apex = [0, 2.2, 0];
  for (i = 0; i < 3; i++) {
    var a = i / 3 * TAU + 0.5, foot = [Math.cos(a) * 1.08, 0, Math.sin(a) * 1.08];
    // 杆子穿过顶点再伸出去一截
    var top = [apex[0] + (apex[0] - foot[0]) * 0.14, apex[1] + (apex[1] - foot[1]) * 0.14, apex[2] + (apex[2] - foot[2]) * 0.14];
    p.push(Guild.sgC(foot, top, 0.055, 0.04, 0x6b4a2c, 'wood', 5));
  }
  p.push(mxC(0.1, 0.1, 0.2, 6, 0, 2.2, 0, 0xc8b080, 'cloth'));
  // 铁链：四节，前后、左右交替
  for (i = 0; i < 4; i++) p.push(Guild.tor(0.055, 0.016, 3, 5, [0, 2.06 - i * 0.1, 0], 0x4a4a52, 'ch_chain', i % 2 ? [0, Math.PI / 2, 0] : null, [1, 1.35, 1]));
  // 提梁：从链子下面的钩子到两只锅耳
  p.push(mxB(0.05, 0.1, 0.05, 0, 1.68, 0, 0x2a2a2e, 'metal'),
    Guild.sgB([0, 1.64, 0], [0.66, 1.26, 0], 0.035, 0x2e2e32, 'metal'), Guild.sgB([0, 1.64, 0], [-0.66, 1.26, 0], 0.035, 0x2e2e32, 'metal'));
  // 锅：直壁 + 收口的锅底 + 厚锅沿 + 两只锅耳
  p.push(mxC(0.62, 0.52, 0.42, 10, 0, 1.1, 0, iron, 'metal'), mxC(0.52, 0.28, 0.22, 10, 0, 0.78, 0, iron, 'metal'),
    mxC(0.67, 0.67, 0.07, 10, 0, 1.31, 0, rim, 'metal'),
    mxB(0.08, 0.14, 0.16, 0.66, 1.22, 0, rim, 'metal'), mxB(0.08, 0.14, 0.16, -0.66, 1.22, 0, rim, 'metal'));
  // 锅底下的火塘：一圈石头
  for (i = 0; i < 7; i++) {
    var b = i / 7 * TAU;
    p.push(['oct', [0.17], [Math.cos(b) * 0.38, 0.07, Math.sin(b) * 0.38], i % 2 ? 0x5a5650 : 0x6a665e, [0, b, 0], [1.2, 0.6, 1], 'rock']);
  }
  // 大木勺：勺头在锅里，勺柄斜着伸出来
  p.push(mxC(0.035, 0.035, 1.3, 5, 0.3, 1.62, 0.12, 0x8a6038, 'wood', [0.15, 0, -0.5]), mxC(0.12, 0.08, 0.08, 5, 0.02, 1.08, 0.04, 0x8a6038, 'wood'));
  // 地上的两瓶药：蓝色长瓶、紫色圆瓶（玻璃微微发亮），软木塞
  Guild.L(1.25, [mxC(0.1, 0.1, 0.24, 5, 0.95, 0.12, 0.62, 0x7ab8d8, 'plain'), mxC(0.04, 0.06, 0.1, 5, 0.95, 0.29, 0.62, 0x7ab8d8, 'plain'),
    ['oct', [0.15], [-0.85, 0.14, 0.72], 0xb86ad8, null, [1, 0.9, 1], 'plain'], mxC(0.035, 0.04, 0.12, 5, -0.85, 0.32, 0.72, 0xb86ad8, 'plain')]).forEach(function (q) { p.push(q); });
  p.push(mxB(0.07, 0.06, 0.07, 0.95, 0.36, 0.62, 0x8a6a3a, 'wood'), mxB(0.06, 0.06, 0.06, -0.85, 0.4, 0.72, 0x8a6a3a, 'wood'));
  return p;
};
Guild.MODELS.coalParts = function () {
  var F = MX.tiles().fire, fc = MX.fireCol();
  return [['oct', [0.15], [0.08, 0.12, 0.05], 0xff6a2a, null, [1, 0.7, 1], 'plain'], ['oct', [0.14], [-0.12, 0.11, 0.08], 0xff8a3a, [0, 0.5, 0], [1, 0.7, 1], 'plain'],
    ['oct', [0.13], [0.02, 0.11, -0.14], 0xff5a20, [0, 0.3, 0], [1, 0.7, 1], 'plain'],
    mxK(0.1, 0.34, 4, 0.02, 0.36, 0.0, fc, F), mxK(0.07, 0.24, 4, -0.12, 0.3, 0.08, fc, F, [0, 0.8, 0.15]), mxK(0.07, 0.22, 4, 0.1, 0.29, -0.08, fc, F, [0, 0.4, -0.15])];
};
Guild.MODELS.liquidParts = function () { return [mxC(0.58, 0.58, 0.04, 10, 0, 1.3, 0, 0xffffff, 'plain')]; };
// 三个泡在一个网格里（少一次绘制）：整体绕锅心慢慢转、一起一伏
Guild.MODELS.bubbleParts = function () {
  return [['oct', [0.09], [0.22, 0.02, 0.1], 0xffffff, null, [1, 0.8, 1], 'plain'], ['oct', [0.07], [-0.18, 0.02, -0.16], 0xffffff, [0, 0.6, 0], [1, 0.8, 1], 'plain'],
    ['oct', [0.06], [0.0, 0.02, -0.3], 0xffffff, [0, 0.3, 0], [1, 0.8, 1], 'plain']];
};
Guild.MODELS.crucible = function (o) {
  var g = new THREE.Group();
  g.add(MX.mesh(Guild.geo('g10_crucible', Guild.MODELS.crucibleParts)));
  o.coals = MX.mesh(MX.geo('g10_crucible_coals', Guild.MODELS.coalParts), 'glow');
  g.add(o.coals);
  o.liquidMat = Guild.tintMat(0x8a4bd6);
  o.liquid = new THREE.Mesh(MX.geo('g10_crucible_liquid', Guild.MODELS.liquidParts), o.liquidMat);
  g.add(o.liquid);
  o.bubbles = new THREE.Mesh(MX.geo('g10_crucible_bubbles', Guild.MODELS.bubbleParts), o.liquidMat);
  o.bubbles.position.y = 1.32;
  g.add(o.bubbles);
  return g;
};

// ---------------- 行商驴车 ----------------
// 红白条纹帆布篷的手推货车（挂着锅、勺、一盏灯笼，车尾三卷布，篷顶一块画着金币的招牌），灰毛驴（紫色鞍褥、流苏）拉车，
// 戴宽草帽的行商右手举着拨浪鼓（o.drum，骑士走近时摇）
Guild.PED = { vx: 1.1, vz: 0.25, wood: 0x6b4a2c, red: 0xc8483a, cream: 0xe8dcc0, iron: 0x2a2c30 };
Guild.MODELS.pedlarParts = function () {
  var T = Guild.T(), D = Guild.PED, wood = D.wood, i, p = [
    mxB(1.1, 0.5, 1.6, 0, 0.8, -0.6, 0x7a5530, T.plank),
    mxB(1.16, 0.06, 1.66, 0, 1.06, -0.6, 0x4a3420, 'wood'),
    mxC(0.06, 0.06, 1.34, 6, 0, 0.38, -0.6, 0x3d3f46, 'metal', [0, 0, Math.PI / 2]),
    mxB(0.06, 0.06, 1.7, -0.36, 0.62, 0.95, wood, 'wood', [-0.06, 0, 0]), mxB(0.06, 0.06, 1.7, 0.36, 0.62, 0.95, wood, 'wood', [-0.06, 0, 0])
  ];
  // 两只辐条轮（轴沿 x）
  [-0.62, 0.62].forEach(function (x) {
    p.push(Guild.tor(0.34, 0.045, 3, 8, [x, 0.38, -0.6], wood, 'wood', [0, Math.PI / 2, 0]));
    for (var k = 0; k < 2; k++) p.push(mxB(0.04, 0.64, 0.05, x, 0.38, -0.6, 0x7a5a36, 'wood', [k * Math.PI / 2, 0, 0]));
  });
  // 条纹篷：6 段红白相间的半圆拱（中间几段不要盖子），两头一圈木箍
  var n = 6, L = 1.6 / n, z0 = -1.4;
  for (i = 0; i < n; i++) {
    p.push(['c10Arch', [0.6, L + 0.002, 6, i > 0 && i < n - 1], [0, 1.08, z0 + L * (i + 0.5)], i % 2 ? D.cream : D.red, [Math.PI / 2, 0, 0], [0.97, 1, 1.75], T.canvas]);
  }
  // 篷顶的招牌：木板 + 金币（微微发亮）
  p.push(mxB(0.05, 0.22, 0.05, 0, 2.14, 0.12, wood, 'wood'), mxB(0.62, 0.32, 0.05, 0, 2.38, 0.12, 0x8a6038, T.plank));
  p = p.concat(Guild.L(1.3, [mxC(0.11, 0.11, 0.03, 8, 0, 2.38, 0.155, 0xe8b83a, 'gold', [Math.PI / 2, 0, 0])]));
  // 侧面挂的锅、勺子
  p.push(mxC(0.14, 0.11, 0.18, 6, 0.64, 0.86, -0.2, D.iron, 'metal'));
  // 灯笼：挂在篷子前角的钩子上，铁框 + 暖光
  p.push(mxB(0.03, 0.18, 0.03, -0.56, 1.62, 0.18, 0x2a2a2a, 'plain'), mxK(0.1, 0.08, 4, -0.56, 1.5, 0.18, D.iron, 'metal'),
    mxB(0.15, 0.03, 0.15, -0.56, 1.25, 0.18, D.iron, 'metal'));
  p = p.concat(Guild.L(1.6, [mxB(0.11, 0.19, 0.11, -0.56, 1.36, 0.18, 0xffc860, 'plain')]));
  p.push(mxB(0.02, 0.22, 0.135, -0.56, 1.36, 0.18, D.iron, 'metal'), mxB(0.135, 0.22, 0.02, -0.56, 1.36, 0.18, D.iron, 'metal'));
  // 车尾架子上的三卷布
  p.push(mxB(1.0, 0.06, 0.34, 0, 0.92, -1.55, wood, T.plank));
  [[0, 1.04, -1.46], [0, 1.04, -1.64], [0, 1.2, -1.55]].forEach(function (q, i) {
    p.push(mxC(0.09, 0.09, 0.5 + i * 0.1, 4, q[0], q[1], q[2], [0xb8483a, 0x3a6ab8, 0xd8b050][i], 'cloth', [0, 0, Math.PI / 2]));
  });
  // 行商：棕色背心、浅色衬衣袖子、宽草帽（没有帽带、没有兜帽）；右手（-x 那边）往前举着拨浪鼓
  var vx = D.vx, vz = D.vz, sk = 0xd8a878, sl = 0xd8c8a8;
  p.push(mxB(0.12, 0.5, 0.12, vx - 0.09, 0.25, vz, 0x4a3a2a, 'cloth'), mxB(0.12, 0.5, 0.12, vx + 0.09, 0.25, vz, 0x4a3a2a, 'cloth'),
    mxC(0.22, 0.27, 0.62, 6, vx, 0.81, vz, 0x7a5a3a, 'cloth'), mxB(0.46, 0.06, 0.32, vx, 0.56, vz, 0x3a2a1a, 'cloth'),
    mxB(0.1, 0.48, 0.1, vx + 0.29, 0.86, vz, sl, 'cloth', [0, 0, 0.12]), mxB(0.1, 0.1, 0.1, vx + 0.32, 0.6, vz, sk, 'skin'),
    Guild.sgB([vx - 0.28, 1.06, vz], [vx - 0.33, 0.84, vz + 0.16], 0.1, sl, 'cloth'), Guild.sgB([vx - 0.33, 0.84, vz + 0.16], [vx - 0.32, 0.98, vz + 0.38], 0.09, sl, 'cloth'),
    mxB(0.1, 0.1, 0.1, vx - 0.32, 1.02, vz + 0.42, sk, 'skin'),
    ['dodec', [0.18], [vx, 1.32, vz], sk, null, null, 'skin'],
    mxB(0.04, 0.04, 0.02, vx - 0.07, 1.34, vz + 0.17, 0x1a1612, 'plain'), mxB(0.04, 0.04, 0.02, vx + 0.07, 1.34, vz + 0.17, 0x1a1612, 'plain'),
    mxC(0.42, 0.42, 0.04, 8, vx, 1.46, vz, 0xd9b860, 'sand'), mxC(0.17, 0.2, 0.16, 6, vx, 1.56, vz, 0xd9b860, 'sand'));
  return p;
};
// 拨浪鼓（原点在手心，绕手柄 y 轴来回拧）：手柄、红鼓身、两面浅色鼓皮、两根线上的小珠子
Guild.MODELS.drumParts = function () {
  return [
    mxC(0.016, 0.016, 0.26, 5, 0, 0.05, 0, 0x8a6038, 'wood'),
    mxC(0.085, 0.085, 0.06, 8, 0, 0.24, 0, 0xc83a2a, 'cloth', [Math.PI / 2, 0, 0]), mxC(0.075, 0.075, 0.068, 8, 0, 0.24, 0, 0xe0d0a8, 'cloth', [Math.PI / 2, 0, 0]),
    mxB(0.08, 0.01, 0.01, 0.12, 0.21, 0, 0x2a2018, 'plain', [0, 0, -0.4]), mxB(0.08, 0.01, 0.01, -0.12, 0.21, 0, 0x2a2018, 'plain', [0, 0, 0.4]),
    ['oct', [0.035], [0.17, 0.18, 0], 0x2a2420, null, null, 'plain'], ['oct', [0.035], [-0.17, 0.18, 0], 0x2a2420, null, null, 'plain']
  ];
};
// 毛驴：照 MX.buildHorse 搭骨架，零件用 MX.horseParts（换成灰色调色板），去掉马铠、金边、羽饰和十字，换上长耳朵；
// 紫色鞍褥，下摆一条土黄边和几束流苏
Guild.DONKEY = { coat: 0x8f8a84, coat2: 0xc9c3ba, mane: 0x3a3430, tail: 0x4a4440, hoof: 0x2e2a26, steel: 0xfe00fe, trim: 0xfe01fe, cloth: 0x6a4a8a, leather: 0x5a4030 };
Guild.DONKEY_DROP = [0xfe00fe, 0xfe01fe, 0xd9333a, 0xf2efe6, 0x2a2018, 0x5a4030];
Guild.donkeyParts = function (name) {
  var H0 = MX.HORSE, p;
  MX.HORSE = Guild.DONKEY;
  try { p = MX.horseParts(name); } finally { MX.HORSE = H0; }
  p = p.filter(function (q) { return Guild.DONKEY_DROP.indexOf(q[3]) < 0 && !(name === 'neck' && q[0] === 'mxcone'); });
  if (name === 'neck') p.push(mxK(0.07, 0.42, 4, -0.09, 1.12, 0.36, Guild.DONKEY.coat, 'fur', [-0.35, 0, 0.12]), mxK(0.07, 0.42, 4, 0.09, 1.12, 0.36, Guild.DONKEY.coat, 'fur', [-0.35, 0, -0.12]));
  if (name === 'body') {
    [-1, 1].forEach(function (s) {
      p.push(mxB(0.07, 0.08, 1.27, s * 0.49, 0.84 - 1.15, -0.06, 0xc8a040, 'cloth', [0, 0, s * 0.1]));
      for (var k = 0; k < 2; k++) p.push(mxB(0.05, 0.14, 0.06, s * 0.5, 0.74 - 1.15, -0.4 + k * 0.6, 0xc8a040, 'cloth'));
    });
  }
  return p;
};
Guild.MODELS.donkey = function () {
  var rig = new THREE.Group();
  rig.rotation.order = 'YXZ';
  rig.scale.setScalar(0.7);
  var body = new THREE.Group();
  body.position.y = 1.15;
  rig.add(body);
  var g = function (n) { return MX.geo('donkey10_' + n, function () { return Guild.donkeyParts(n); }); };
  body.add(MX.mesh(g('body')));
  var neck = new THREE.Group(); neck.position.set(0, 1.5 - 1.15, 0.78); body.add(neck);
  neck.add(MX.mesh(g('neck')));
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
  return { rig: rig, body: body, neck: neck, tail: tail, legs: legs, ang: [0, 0, 0, 0], ph: 0, bob: 0, pitch: 0, neckX: 0, tailX: 0.4, t: 0 };
};
Guild.MODELS.pedlar = function (o) {
  var g = new THREE.Group(), D = Guild.PED;
  g.add(MX.mesh(Guild.geo('g10_pedlar', Guild.MODELS.pedlarParts)));
  o.donkey = Guild.MODELS.donkey();
  o.donkey.rig.position.set(0, 0, 1.5);
  o.donkey.t = (o.idx || 0) * 3.7;
  g.add(o.donkey.rig);
  o.drum = new THREE.Group();
  o.drum.position.set(D.vx - 0.32, 1.02, D.vz + 0.42);
  o.drum.add(MX.mesh(MX.geo('g10_pedlar_drum', Guild.MODELS.drumParts)));
  g.add(o.drum);
  return g;
};

// ============================================================
//  誓言石碑：立一个誓（随机四种之一，不和上一个一样），时限里做到 → 纹章祝福；做不到 → 石碑裂开
// ============================================================
Guild.VOWS = {
  kills: { name: '斩敌之誓', limit: 60, goal: function () { return [50, 75, 100][clamp(Game.stage, 1, 3) - 1]; }, text: function (n) { return '60 秒内击杀 ' + n + ' 个敌人'; },
    bar: function (c, n) { return '击杀 ' + c + '/' + n; } },
  nohit: { name: '无伤之誓', limit: 40, goal: function () { return 40; }, text: function () { return '40 秒内不受伤'; }, bar: function () { return '别受伤'; } },
  slide: { name: '疾风之誓', limit: 60, goal: function () { return 220; }, text: function (n) { return '60 秒内滑铲 ' + n + ' 米'; },
    bar: function (c, n) { return '滑铲 ' + c + '/' + n + ' 米'; } },
  jump: { name: '腾跃之誓', limit: 45, goal: function () { return 20; }, text: function (n) { return '45 秒内跳跃 ' + n + ' 次'; },
    bar: function (c, n) { return '跳跃 ' + c + '/' + n + ' 次'; } }
};
Guild.VOW_IDS = ['kills', 'nohit', 'slide', 'jump'];

// vowId 可选（测试用：指定一种）
Guild.swear = function (o, vowId) {
  var id = vowId && Guild.VOWS[vowId] ? vowId : pick(Guild.VOW_IDS.filter(function (v) { return v !== Guild.lastVow; }));
  var V = Guild.VOWS[id], goal = V.goal();
  Guild.lastVow = id;
  Guild.oath = { o: o, id: id, name: V.name, goal: goal, limit: V.limit, t: 0, cur: 0, k0: P.kills, j0: Guild.jumps,
    tot: P.hp + (P.shield || 0), sh: P.shield || 0, mx: P.st.maxHp };
  o.state = 'sworn';
  o.crestMat.color.setScalar(1.35);
  if (o.ring) { o.ring.visible = true; o.ring.material.opacity = o.ringOp; }
  // 提示文字最多 16 个字（UI_STYLE §8.1）：誓言的名字进度条上有
  Guild.toastGold('立誓：' + V.text(goal));
  FX.text(o.x, o.y + 3.1, o.z, V.text(goal), '#c8f0ff', 1.3);
  FX.ring(o.x, o.y + 0.2, o.z, 3, 0x7ef0ff, 0.5);
  return Guild.oath;
};
// 每帧（立誓的那块石碑的 update 里）：量进度、显示进度条、判定完成 / 失败
Guild.oathTick = function (o, dt) {
  var t = Guild.oath;
  if (!t || t.o !== o) return;
  t.t += dt;
  var broke = false;
  if (t.id === 'kills') t.cur = P.kills - t.k0;
  else if (t.id === 'jump') t.cur = Guild.jumps - t.j0;
  else if (t.id === 'slide') { if (P.riding) t.cur += Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z) * dt; }
  else if (t.id === 'nohit') {
    // 和 Meta.tick 一样：生命 + 护盾比上一帧少了就是受伤（闪避、格挡没少；最大生命变小、
    // 护盾被压回上限（药箱的临时护盾到时间）带来的不算）
    var sh = P.shield || 0, tot = P.hp + sh, mx = P.st.maxHp, pt = t.tot - (t.sh > P.st.shield ? t.sh - P.st.shield : 0);
    if (tot < pt - 0.01 && mx >= t.mx) broke = true;
    t.tot = tot; t.sh = sh; t.mx = mx;
    t.cur = Math.min(t.goal, t.t);
  }
  var cur = Math.floor(t.cur), nohit = t.id === 'nohit';
  MX.progress = { text: t.name + ' · ' + Guild.VOWS[t.id].bar(Math.min(cur, t.goal), t.goal), pct: clamp(nohit ? t.t / t.limit : t.cur / t.goal, 0, 1),
    color: '#ffd84a', side: Math.max(0, Math.ceil(t.limit - t.t)) + '秒', wide: t.name + ' · ' + Guild.VOWS[t.id].bar(t.goal, t.goal) };
  if (broke) { Guild.oathBreak(o); return; }
  if (nohit ? t.t >= t.limit : t.cur >= t.goal) { Guild.oathDone(o); return; }
  if (t.t >= t.limit) Guild.oathBreak(o);
};
// 誓言达成（meta.js 包装它数 oaths：一定要写成 Guild.oathDone(...) 调用）
Guild.oathDone = function (o) {
  o.state = 'done';
  o.used = true;
  if (o.crestMat) o.crestMat.color.setScalar(0.5);   // 誓言达成：盾徽暗下去一半（一眼看出这块用过了）
  if (o.ring) o.ring.visible = false;
  if (Guild.oath && Guild.oath.o === o) Guild.oath = null;
  FX.ring(o.x, o.y + 0.2, o.z, 3.6, 0x7ef0ff, 0.5);
  MX.sparks(o.x, o.y + 2.05, o.z, 22, [0x7ef0ff, 0xc8f0ff], 5, 0.14);
  Guild.bless(['誓言达成', '选一枚纹章祝福']);
};
Guild.oathBreak = function (o) {
  o.state = 'broken';
  o.used = true;
  if (o.ring) o.ring.visible = false;
  if (Guild.oath && Guild.oath.o === o) Guild.oath = null;
  if (o.mesh) {
    // 换成裂开的石碑（盾徽的材质是这块石碑自己的，一起释放）
    while (o.mesh.children.length) o.mesh.remove(o.mesh.children[0]);
    o.mesh.add(Guild.MODELS.oathstoneCracked(o));
    if (o.crestMat) { o.crestMat.dispose(); o.crestMat = null; }
  }
  FX.burst(o.x, o.y + 1.4, o.z, 16, 0x8e939c, 5, 0.3);
  UI.toast('誓言没守住，石碑裂开了', Kit.color('red'));
};
// 纹章祝福（誓言达成、护卫冠军倒下）：三张纹章卡选一张；纹章都满了就是一张金币卡
Guild.bless = function (titleParts) {
  Game.openModal(function () { UI.choiceModal('oath', titleParts, LevelUp.blessOptions()); });
};

Interact.KINDS.oathstone = {
  radius: 2.4,
  model: function (o) { return Guild.MODELS.oathstone(o); },
  init: function (o) {
    o.state = null;
    // 立誓时脚下的像素圈（和以前的光环一样的 pring），按周围的地面坡度倾斜
    var pix = !!FX.getGeo('pring');
    o.ring = new THREE.Mesh(FX.getGeo(pix ? 'pring' : 'ring'), new THREE.MeshBasicMaterial({ color: 0x7ef0ff, transparent: true, opacity: pix ? 0.95 : 0.75, side: THREE.DoubleSide, depthWrite: false, blending: pix ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !pix }));
    o.ring.renderOrder = 3;
    o.ring.position.set(o.x, o.y + 0.2, o.z);
    var e = 3, hx = W.terrainH(o.x + e, o.z) - W.terrainH(o.x - e, o.z), hz = W.terrainH(o.x, o.z + e) - W.terrainH(o.x, o.z - e);
    o.ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(-hx / (2 * e), 1, -hz / (2 * e)).normalize());
    o.ring.scale.set(3.2, 1, 3.2);
    // 平时不画（§8：立誓时才有这一圈；石碑要按互动，不是站着等的圈）
    o.ringOp = o.ring.material.opacity;
    o.ring.visible = false;
    Game.scene.add(o.ring);
  },
  label: function (o) { return o.state === 'sworn' && Guild.oath ? '誓言进行中：' + Guild.oath.name : '誓言石碑：立誓 · 完成得纹章祝福'; },
  canUse: function (o) { return !Guild.oath && !o.state; },
  busy: function (o) { return o.state === 'sworn'; },
  denied: function () { return '一次只能立一个誓'; },
  use: function (o) { Guild.swear(o); },
  update: function (o, dt, d2) {
    if (o.state === 'sworn') Guild.oathTick(o, dt);
    // 立誓期间盾徽一秒一闪（±10%）
    if (o.state === 'sworn' && o.crestMat) o.crestMat.color.setScalar(1.35 * (1 + 0.1 * Math.sin(Game.time * TAU)));
    // 25 米内：盾徽前往上飘青色光点，飘到石碑上面一截（和墓碑分得开）
    if (!o.state && d2 < 625 && Math.random() < dt * 5) MX.part(o.x + rand(-0.6, 0.6), o.y + rand(1.4, 2.4), o.z + rand(-0.6, 0.6), 0, rand(0.55, 0.85), 0, rand(2.2, 3), 0.12, 0.04, pick([0x7ef0ff, 0xc8f0ff]), 0.05);
  },
  mapIcon: { color: '#7ef0ff', shape: 'cross', size: 3 },
  clear: function () { Guild.reset(); }
};

// ============================================================
//  比武木人：按 E 开始 8 秒的比武，木人变成能被武器打到的道具（Enemies.addProp）；时间到按伤害给金币
// ============================================================
Guild.JOUST_T = 8;
Guild.startJoust = function (o) {
  Guild.joust = o;
  o.jt = 0;
  o.prop.active = true;
  o.prop.taken = 0;
  o.prop.hits = 0;
  Guild.toastGold('比武开始：' + Guild.JOUST_T + ' 秒');
};
// 每一下都让横杆明显转一下
Guild.quintainHit = function (o, dmg) {
  o.spin = Math.min(18, (o.spin || 0) + Math.min(6, Math.max(1.5, dmg * 0.02)));
};
// 比武的金币：min(40×关卡, 10×关卡 + 伤害×0.2)×金币获取（保底 10×关卡，一把普通的初始武器大约 35）
Guild.joustGold = function (taken) {
  return Math.round(Math.min(40 * Game.stage, 10 * Game.stage + taken * 0.2) * P.st.goldGain);
};
Guild.endJoust = function (o) {
  var g = Guild.joustGold(o.prop.taken);
  P.gold += g;
  UI.goldPop();
  FX.burst(o.x, o.y + 2, o.z, 16, 0xffd23a, 6, 0.3);
  FX.text(o.x, o.y + 2.6, o.z, '+' + g, '#ffd23a', 1.2);
  Guild.toastGold('比武结束：+' + g + ' 金币');
  Enemies.removeProp(o.prop);
  o.used = true;
  o.spin = 0;
  if (Guild.joust === o) Guild.joust = null;
  return g;
};

Interact.KINDS.quintain = {
  radius: 2.6,
  model: function (o) { return Guild.MODELS.quintain(o); },
  // Enemies.clear 在 Interact.populate 之前，道具建好后整关都在（比武时才 active）
  init: function (o) {
    o.spin = 0;
    o.prop = Enemies.addProp({ x: o.x, z: o.z, y: o.y, r: 0.9, tag: 'quintain', onHit: function (p, dmg) { Guild.quintainHit(o, dmg); } });
  },
  label: function (o) { return Guild.joust === o ? '比武中…' : '比武木人：打它 ' + Guild.JOUST_T + ' 秒换金币'; },
  canUse: function () { return !Guild.joust; },
  busy: function (o) { return Guild.joust === o; },
  denied: function () { return '一次只能比一场'; },
  use: function (o) { Guild.startJoust(o); },
  update: function (o, dt) {
    if (o.spin) {
      o.arm.rotation.y += o.spin * dt;
      o.spin *= Math.exp(-2.5 * dt);
      if (o.spin < 0.02) o.spin = 0;
    }
    // 沙袋跟着转速往外甩，停下来慢慢荡回去
    if (o.bag && (o.spin || o.bagA)) {
      var ba = -Math.min(0.7, (o.spin || 0) * 0.04);
      o.bagA = (o.bagA || 0) + (ba - (o.bagA || 0)) * Math.min(1, dt * 5);
      if (!o.spin && Math.abs(o.bagA) < 0.002) o.bagA = 0;
      o.bag.rotation.z = o.bagA;
    }
    if (Guild.joust !== o) return;
    o.jt += dt;
    MX.progress = { text: '比武 · 伤害 ' + Math.round(o.prop.taken), pct: clamp(o.jt / Guild.JOUST_T, 0, 1), color: '#ffd84a', side: Math.max(0, Math.ceil(Guild.JOUST_T - o.jt)) + '秒', wide: '比武 · 伤害 0000' };
    if (o.jt >= Guild.JOUST_T) Guild.endJoust(o);
  },
  mapIcon: { color: '#ffd23a', shape: 'square', size: 2.5 },
  clear: function () { Guild.reset(); }
};

// ============================================================
//  滚石：放在长坡顶上，推一把顺着坡滚下去，一路碾过敌人（每个敌人只算一次）
// ============================================================
// push：推一把的初速度（米/秒）；minRun：摆放时空跑一遍，滚不到这么远就往坡下挪一点再试
Guild.ROLL = { g: 9.8, fric: 1.5, vmax: 24, r: 1.4, push: 4, slowV: 0.8, slowT: 1, life: 14, minRun: 25 };
Guild.placeBoulders = function () {
  var n = Guild.count('boulder'), F = typeof Content !== 'undefined' && Content.feats ? Content.feats : [], f = null, placed = [];
  for (var i = 0; i < F.length; i++) if (F[i].type === 'slope') { f = F[i]; break; }
  for (i = 0; i < n; i++) {
    var s = f ? Guild.slopeSpot(f, i) : Guild.steepSpot(placed);
    if (s) placed.push(Guild.add('boulder', s, { idx: i, dir: s.dir, rotY: 0, mxFp: Guild.ROLL.r }));
  }
};
// 长坡顶上的平台：坡顶边缘往后 1.6 米，左右各一块（坡往 +u 方向下）。
// 坡顶下面头几米的原地形往上翘时，推一把滚不过坡顶：空跑一遍，滚不到 minRun 米就往坡下挪几米（挪到最后一个就用它）
Guild.SLOPE_U = [-1.6, 2, 5, 8];
Guild.slopeSpot = function (f, i) {
  var v = (i % 2 ? -1 : 1) * 0.4 * f.Wc, dir = { x: f.ca, z: f.sa }, s = null;
  for (var k = 0; k < Guild.SLOPE_U.length; k++) {
    var p = Content.featPt(f, Guild.SLOPE_U[k], v);
    s = { x: p.x, z: p.z, y: W.terrainH(p.x, p.z), dir: dir };
    if (Guild.dryRun(s) >= Guild.ROLL.minRun) break;
  }
  return s;
};
// 不画、不碰敌人和骑士、不用随机数：只算滚多远
Guild.dryRun = function (s) {
  var R = Guild.ROLL, o = { x: s.x, z: s.z, y: s.y, vx: s.dir.x * R.push, vz: s.dir.z * R.push }, slowT = 0;
  for (var t = 0; t < R.life; t += 1 / 60) {
    var sp = Guild.rollMove(o, 1 / 60);
    slowT = sp < R.slowV ? slowT + 1 / 60 : 0;
    if (slowT > R.slowT) break;
  }
  return Math.sqrt((o.x - s.x) * (o.x - s.x) + (o.z - s.z) * (o.z - s.z));
};
// 没有长坡：随便挑一处，在它 30 米内（3 米一格）找最陡的空地；离另一块滚石至少 12 米；平地就不放
Guild.steepSpot = function (others) {
  var c = W.randomSpot(40, W.S - 30), best = null, bm = 0;
  for (var gx = -30; gx <= 30; gx += 3) for (var gz = -30; gz <= 30; gz += 3) {
    if (gx * gx + gz * gz > 900) continue;
    var x = c.x + gx, z = c.z + gz;
    if (Math.abs(x) > W.S - 8 || Math.abs(z) > W.S - 8 || x * x + z * z < 22 * 22 || !W.freeSpot(x, z, 2)) continue;
    if (others.some(function (o) { return dist2(x, z, o.x, o.z) < 144; })) continue;
    var g = Guild.grad(x, z), m = Math.sqrt(g.x * g.x + g.z * g.z);
    if (m > bm) { bm = m; best = { x: x, z: z, g: g }; }
  }
  if (!best || bm < 0.06) return null;
  return { x: best.x, z: best.z, y: W.terrainH(best.x, best.z), dir: { x: -best.g.x / bm, z: -best.g.z / bm } };
};
Guild.push = function (o) {
  var R = Guild.ROLL;
  o.vx = o.dir.x * R.push; o.vz = o.dir.z * R.push;
  o.rollT = 0; o.slowT = 0; o.hit = new Set(); o.state = 'rolling';
  Guild.rolling = o;
  FX.burst(o.x, o.y + 0.3, o.z, 10, 0xb0a890, 4, 0.25);
};
Guild._q = new THREE.Quaternion();
Guild._ax = new THREE.Vector3();
Guild.updateBoulder = function (o, dt) {
  if (o.state !== 'rolling') return;
  var n = Math.max(1, Math.ceil(dt * 60 - 1e-6)), h = dt / n;
  for (var s = 0; s < n && o.state === 'rolling'; s++) Guild.rollStep(o, h);
};
// 一小步（≤ 1/60 秒）：坡度加速、滚动摩擦、撞墙反弹、地图边、碾敌人、推开骑士、转动、碎掉
// 只有物理（摆放时的空跑也用它）：返回新速度
Guild.rollMove = function (o, dt) {
  var R = Guild.ROLL, g = Guild.grad(o.x, o.z);
  o.vx -= R.g * g.x * dt; o.vz -= R.g * g.z * dt;
  var sp = Math.sqrt(o.vx * o.vx + o.vz * o.vz);
  if (sp > 0) {
    // 摩擦只让它慢下来，不会把它往回推（缓坡上静止不动）
    var ns = Math.min(R.vmax, Math.max(0, sp - R.fric * dt));
    o.vx *= ns / sp; o.vz *= ns / sp; sp = ns;
  }
  var p = { x: o.x + o.vx * dt, z: o.z + o.vz * dt };
  var ground = W.terrainH(p.x, p.z);
  var px = p.x, pz = p.z;
  if (W.pushOut(p, R.r, ground)) {
    var nx = p.x - px, nz = p.z - pz, nl = Math.sqrt(nx * nx + nz * nz);
    if (nl > 1e-6) {
      nx /= nl; nz /= nl;
      var vn = o.vx * nx + o.vz * nz;
      if (vn < 0) { o.vx -= 1.3 * vn * nx; o.vz -= 1.3 * vn * nz; }   // 撞进去的那部分去掉，再反弹 30%
    }
  }
  var lim = W.S - 4;
  if (p.x > lim) { p.x = lim; if (o.vx > 0) o.vx = 0; } else if (p.x < -lim) { p.x = -lim; if (o.vx < 0) o.vx = 0; }
  if (p.z > lim) { p.z = lim; if (o.vz > 0) o.vz = 0; } else if (p.z < -lim) { p.z = -lim; if (o.vz < 0) o.vz = 0; }
  o.x = p.x; o.z = p.z; o.y = W.terrainH(o.x, o.z);
  return Math.sqrt(o.vx * o.vx + o.vz * o.vz);
};
Guild.rollStep = function (o, dt) {
  var R = Guild.ROLL, x0 = o.x, z0 = o.z, sp = Guild.rollMove(o, dt);
  if (o.mesh) {
    o.mesh.position.set(o.x, o.y, o.z);
    var moved = Math.sqrt((o.x - x0) * (o.x - x0) + (o.z - z0) * (o.z - z0));
    if (moved > 1e-5) {
      // 绕「上方 × 前进方向」转：滚过的距离 / 半径
      Guild._ax.set((o.z - z0) / moved, 0, -(o.x - x0) / moved);
      o.ball.quaternion.premultiply(Guild._q.setFromAxisAngle(Guild._ax, moved / R.r));
    }
  }
  if (sp > 0.5) Guild.rollHits(o, sp);
  // 骑士不会被压到：挡在前面就被推到一边
  var dx = P.pos.x - o.x, dz = P.pos.z - o.z, d = Math.sqrt(dx * dx + dz * dz), rr = R.r + 0.5;
  if (d < rr && P.pos.y < o.y + R.r * 2 + 0.2 && P.pos.y > o.y - 1) {
    var ux = d > 1e-4 ? dx / d : -o.vz / (sp || 1), uz = d > 1e-4 ? dz / d : o.vx / (sp || 1);
    P.pos.x += ux * (rr - d); P.pos.z += uz * (rr - d);
    if (sp > 0) { P.vel.x += o.vx / sp * 0.3 * sp; P.vel.z += o.vz / sp * 0.3 * sp; }
  }
  if (Math.random() < dt * Math.min(12, sp)) MX.part(o.x + rand(-0.8, 0.8), o.y + 0.1, o.z + rand(-0.8, 0.8), rand(-0.5, 0.5), rand(0.4, 1.2), rand(-0.5, 0.5), rand(0.5, 0.9), 0.2, 0.45, pick([0xb0a890, 0x8a8478]), 0.3);
  o.rollT += dt;
  o.slowT = sp < R.slowV ? o.slowT + dt : 0;
  if (o.slowT > R.slowT || o.rollT >= R.life) Guild.breakBoulder(o);
};
// 碾过的敌人：受伤 + 掀飞（精英照样掀，小 Boss 掀得近一点，首领只受伤）
Guild.rollHits = function (o, sp) {
  var R = Guild.ROLL, ux = o.vx / sp, uz = o.vz / sp, kn = 6 + sp, dmg = (35 + 12 * Game.stage) * (1 + sp / 12), top = o.y + R.r * 2 + 0.6;
  Enemies.inRadius(o.x, o.z, R.r, function (e) {
    if (e.prop || o.hit.has(e.id) || e.y > top) return;
    if ((e.boss || e.mini) && e.state === 'intro') return;   // 出场的 1.5 秒里打不动（Enemies.damage 返回 0）：先不记，出场完了还能再碾一次
    o.hit.add(e.id);
    if (e.boss) { Enemies.damage(e, dmg, 0, 0, 0); return; }
    var k = e.mini ? 0.4 : 1;
    Enemies.damage(e, dmg, 0, ux * kn * k, uz * kn * k);
    if (e.alive && !e.def.flyer) { e.vy = e.mini ? 3 : 7; e.grounded = false; }
  });
};
Guild.breakBoulder = function (o) {
  var y = o.y + Guild.ROLL.r;
  FX.burst(o.x, y, o.z, 30, 0x8a8a84, 8, 0.35);
  MX.sparks(o.x, y, o.z, 14, [0x8a8a84, 0xb0a890, 0x5a5a54], 6, 0.18);
  o.state = 'broken';
  Interact.consume(o);
  if (Guild.rolling === o) Guild.rolling = null;
};

Interact.KINDS.boulder = {
  radius: 2.8,
  model: function (o) { return Guild.MODELS.boulder(o); },
  init: function (o) { o.state = null; if (!o.dir) o.dir = { x: 1, z: 0 }; },
  label: function (o) { return o.state === 'rolling' ? '滚石在滚…' : '滚石：推它一把，顺着坡碾过去'; },
  canUse: function (o) { return !Guild.rolling && !o.state; },
  busy: function (o) { return o.state === 'rolling'; },
  denied: function () { return '另一块滚石还在滚'; },
  use: function (o) { Guild.push(o); },
  update: function (o, dt) { Guild.updateBoulder(o, dt); },
  mapIcon: { color: '#b0a890', shape: 'dot', size: 3 },
  clear: function () { Guild.reset(); }
};

// ============================================================
//  决斗旗：拔起来以后，点燃烽火台时首领身边多一位护卫冠军（本关第一个小 Boss，血量 ×1.2）
// ============================================================
Guild.championId = function () {
  var m = Game.stageDef && Game.stageDef.minis && Game.stageDef.minis[0];
  var id = typeof m === 'string' ? m : m && m.id;
  return id && ENEMIES[id] ? id : null;
};
// Game.summonBoss 调用（首领在烽火台的 +x 8 米，冠军在另一边）
Guild.spawnChampion = function (portal) {
  var id = Guild.championId();
  Guild.duelArmed = false;
  if (!id || !portal) return null;
  var e = Enemies.spawn(id, portal.x - 8, portal.z, { hpMult: Director.miniHpMult() * 1.2, dmgMult: Director.dmgMult(), drop: true });
  e.state = 'intro'; e.st = 1.5;
  e.champion = true;
  Guild.champion = e;
  return e;
};
// 护卫冠军倒下（Enemies.kill 的包装里调用）：小 Boss 自己的金宝箱之外再多一个，外加一次纹章祝福
Guild.championDown = function (e) {
  Interact.spawnChest(e.x + 1.5, e.z, true);
  if (Guild.champion === e) Guild.champion = null;
  Guild.bless(['护卫冠军倒下了', '选一枚纹章祝福']);
};

Interact.KINDS.gauntlet = {
  radius: 2.4,
  model: function (o) { return Guild.MODELS.gauntlet(o); },
  label: function () { return '决斗旗：叫出护卫冠军'; },   // 320 px 的提示牌里 18 px 三行以内（打倒冠军的奖励在用了以后的提示里说）
  canUse: function () { return !(Interact.portal && Interact.portal.used); },
  denied: function () { return '首领已经来了'; },
  use: function (o) {
    Guild.duelArmed = true;
    Interact.consume(o);
    FX.burst(o.x + 0.4, o.y + 2.3, o.z, 14, 0xd9333a, 4, 0.25);
    FX.burst(o.x, o.y + 0.3, o.z, 8, 0x7f7d76, 3, 0.2);
    UI.toast('决斗旗：多一位冠军 · 打倒有重赏', Kit.color('org'));
  },
  update: function (o, dt, d2) {
    if (d2 < 3600) {
      o.flag.rotation.y = Math.sin(Game.time * 2 + (o.idx || 0)) * 0.12;
      // 外半截和燕尾摆得更大、慢半拍
      if (o.flag2) o.flag2.rotation.y = Math.sin(Game.time * 2 + (o.idx || 0) + 0.6) * 0.12 * 1.6;
    }
  },
  mapIcon: { color: '#ff5a3a', shape: 'triangle', size: 3 },
  clear: function () { Guild.reset(); }
};

// ============================================================
//  补给马车：翻一下（不用等），三只补给箱选一只：宝物箱、药箱、军饷箱
// ============================================================
Guild.supplyOptions = function (o) {
  var g = Math.round(40 * Game.stage * P.st.goldGain);
  var done = function () { Guild.supplyDone(o); };
  return [
    { kind: 'supply', id: 'relic', title: '宝物箱', icon: '宝', color: 0xd9a05a, rarity: 0, lines: ['随机一件宝物'], foot: '打开',
      onPick: function () { done(); UI.chestReward(Items.roll()); } },
    { kind: 'supply', id: 'med', title: '药箱', icon: '药', color: 0xe06a5a, rarity: 0, lines: ['生命回满', '护盾 +20 · 20 秒'], foot: '打开',
      onPick: function () {
        done();
        P.heal(P.st.maxHp);
        P.addTemp('shield', 20, 20, 'supplyMed');
        P.shield = Math.min((P.shield || 0) + 20, P.st.shield);
        Guild.toastGold('生命回满，护盾 +20');
      } },
    { kind: 'supply', id: 'pay', title: '军饷箱', icon: '饷', color: 0xffd23a, rarity: 0, lines: ['+' + g + ' 金币'], foot: '打开',
      onPick: function () { done(); P.gold += g; UI.goldPop(); Guild.toastGold('+' + g + ' 金币'); } }
  ];
};
// 选了一只：马车用掉了（模型留着，箱盖打开）
Guild.supplyDone = function (o) {
  if (!o || o.used) return;
  o.used = true;
  (o.lids || []).forEach(function (l) { l.position.y = l.userData.y0; if (!l.userData.off) l.rotation.x = -1.15; });
  FX.burst(o.x, o.y + 0.8, o.z, 12, 0xc8a060, 4, 0.22);
};
Guild.openSupply = function (o) {
  // 箱盖跳几下（0.6 秒）
  MX.anims.push({ o: o, t: 0, fn: function (q, dt, a) {
    a.t += dt;
    var on = a.t < 0.6 && !q.used;
    (q.lids || []).forEach(function (l, i) { if (!q.used) l.position.y = l.userData.y0 + (on ? Math.abs(Math.sin(a.t * 14 + i * 1.3)) * 0.18 : 0); });
    return on;
  } });
  MX.smoke(o.x, o.y + 0.6, o.z, 6, 0xb0a890, 0.8, 0.25);
  Game.openModal(function () { UI.choiceModal('supply', ['补给马车', '选一只补给箱'], Guild.supplyOptions(o)); });
};

Interact.KINDS.supplycart = {
  radius: 2.8,
  model: function (o) { return Guild.MODELS.supplycart(o); },
  label: function () { return '补给马车：翻一只补给箱 · 三选一'; },
  use: function (o) { Guild.openSupply(o); },
  mapIcon: { color: '#c8a060', shape: 'square', size: 3 },
  clear: function () { Guild.reset(); }
};

// ============================================================
//  炼金坩埚：两件同稀有度的宝物丢进去，从两件高一档的里选一件；传说不能炼；不花钱；每口 2 次
// ============================================================
Guild.CRUCIBLE_USES = 2;
// 每档（普通 ~ 史诗）一共有几件
Guild.rarityCounts = function () {
  var n = [0, 0, 0, 0, 0];
  for (var id in P.items) if (P.items[id] > 0 && ITEMS[id]) n[ITEMS[id].rarity] += P.items[id];
  return n;
};
// 能放进去的宝物：普通 ~ 史诗，这一档一共至少两件（同一件两份也行）；按稀有度、名字排，最多 7 张
Guild.cruciblePairs = function () {
  var n = Guild.rarityCounts();
  return Object.keys(P.items).filter(function (id) { var it = ITEMS[id]; return P.items[id] > 0 && it && it.rarity < 4 && n[it.rarity] >= 2; })
    .sort(function (a, b) { return ITEMS[a].rarity - ITEMS[b].rarity || (ITEMS[a].name < ITEMS[b].name ? -1 : ITEMS[a].name > ITEMS[b].name ? 1 : 0); })
    .slice(0, 7);
};
Guild.leaveCard = function () {
  return { title: '离开', icon: '走', color: 0x888888, rarity: 0, sub: '', lines: ['什么都不放'], foot: '离开', leave: true };
};
Guild.openCrucible = function (o) {
  Game.openModal(function () {
    UI.shopRef = o;
    o.step = 1; o.first = null;
    var cards = Guild.cruciblePairs().map(function (id) { return { itemId: id, rarity: ITEMS[id].rarity, foot: '放进去' }; });
    cards.push(Guild.leaveCard());
    UI.choiceModal('crucible', ['炼金坩埚', '先选第一件', '还能炼 ' + (Guild.CRUCIBLE_USES - o.uses) + ' 次'], cards);
  });
};
// 两件丢进去：各去掉一份，坩埚冒彩烟，药水变成高一档的颜色；返回两件（不同的）高一档宝物
Guild.crucibleFuse = function (o, a, b) {
  var r = ITEMS[a].rarity;
  [a, b].forEach(function (id) { P.items[id]--; if (P.items[id] <= 0) delete P.items[id]; });
  P.recalc();
  o.uses++;
  var ids = [];
  for (var t = 0; t < 24 && ids.length < 2; t++) { var id = Items.rollOfRarity(r + 1); if (id && ids.indexOf(id) < 0) ids.push(id); }
  [0xb46bff, 0x5fd35f, 0x4aa3ff].forEach(function (c) { MX.smoke(o.x, o.y + 1.4, o.z, 14, c, 0.5, 0.3); });
  if (o.liquidMat) o.liquidMat.color.set(RARITY[r + 1].world);
  o.result = ids;
  return ids;
};
// 'crucible' 弹窗的三步（返回 'keep' 时弹窗不关）
Guild.cruciblePick = function (opt) {
  var o = UI.shopRef;
  if (!o || !opt || opt.leave) { if (o) o.step = 0; return; }
  if (o.step === 1) {
    var r = ITEMS[opt.itemId].rarity;
    o.first = opt.itemId;
    var ids = Object.keys(P.items).filter(function (id) {
      return ITEMS[id] && ITEMS[id].rarity === r && P.items[id] - (id === o.first ? 1 : 0) >= 1;
    }).sort(function (a, b) { return ITEMS[a].name < ITEMS[b].name ? -1 : ITEMS[a].name > ITEMS[b].name ? 1 : 0; }).slice(0, 7);
    var cards = ids.map(function (id) { return { itemId: id, rarity: r, foot: '放进去' }; });
    cards.push(Guild.leaveCard());
    o.step = 2;
    UI.choiceModal('crucible', ['炼金坩埚', '再选一件' + RARITY[r].name + '宝物'], cards);
    return 'keep';
  }
  if (o.step === 2) {
    var r2 = ITEMS[o.first].rarity, res = Guild.crucibleFuse(o, o.first, opt.itemId);
    o.step = 3;
    UI.choiceModal('crucible', ['炼金坩埚', '选一件' + RARITY[r2 + 1].name + '宝物'], res.map(function (id) { return { itemId: id, rarity: r2 + 1 }; }));
    return 'keep';
  }
  if (o.step === 3) {
    o.step = 0;
    Items.give(opt.itemId);
    Guild.toastGold('炼成了 ' + ITEMS[opt.itemId].name);
    if (o.uses >= Guild.CRUCIBLE_USES) {
      o.used = true;
      if (o.coals) o.coals.visible = false;
      if (o.bubbles) o.bubbles.visible = false;
      MX.smoke(o.x, o.y + 0.3, o.z, 10, 0x5a5654, 0.4, 0.3);
      UI.toast('炼金坩埚的炭火熄了', Kit.color('goldL'));
    }
  }
};

Interact.KINDS.crucible = {
  radius: 2.6,
  model: function (o) { return Guild.MODELS.crucible(o); },
  init: function (o) { o.uses = 0; o.step = 0; },
  label: function (o) { return '炼金坩埚：两件同稀有度宝物，炼成高一档 · 还能炼 ' + (Guild.CRUCIBLE_USES - o.uses) + ' 次'; },
  canUse: function (o) { return o.uses < Guild.CRUCIBLE_USES && Guild.cruciblePairs().length > 0; },
  denied: function () { return '需要两件同稀有度的宝物'; },
  use: function (o) { Guild.openCrucible(o); },
  update: function (o, dt, d2) {
    if (d2 > 625) return;
    // 冒彩色泡泡
    if (Math.random() < dt * 4) MX.part(o.x + rand(-0.35, 0.35), o.y + 1.36, o.z + rand(-0.35, 0.35), 0, rand(0.6, 1.1), 0, rand(0.6, 1.0), 0.09, 0.03, pick([0xb46bff, 0x5fd35f, 0x4aa3ff]), 0.3);
    if (o.coals) o.coals.scale.y = 1 + Math.sin(Game.time * 7 + (o.idx || 0)) * 0.1;
    // 三个泡：绕锅心慢慢转、一起一伏
    if (o.bubbles) {
      var bt = Game.time + (o.idx || 0);
      o.bubbles.rotation.y = bt * 0.7;
      o.bubbles.position.y = 1.32 + Math.sin(bt * 3) * 0.04;
      o.bubbles.scale.set(1, 1 + 0.3 * Math.sin(bt * 3 + 1), 1);
    }
  },
  mapIcon: { color: '#9a7ad8', shape: 'ring', size: 3 },   // 紫色但不是史诗的 #b46bff（稀有度颜色只给稀有度用，UI_STYLE R1）
  clear: function () { Guild.reset(); }
};

// ============================================================
//  行商驴车：普通 / 优秀 / 稀有 / 史诗各一件（10% 那件史诗换成传说）；想买几件买几件，每买一件剩下的涨价 30%；卖完才走
// ============================================================
Guild.PEDLAR_PRICE = [30, 55, 95, 170, 320];
Guild.pedlarStock = function (o) {
  var rs = [0, 1, 2, 3];
  if (Math.random() < 0.1) rs[3] = 4;
  var k = 1 + 0.5 * (Game.stage - 1), ids = [];
  o.stock = rs.map(function (r) {
    var id = null;
    for (var t = 0; t < 20; t++) { id = Items.rollOfRarity(r); if (ids.indexOf(id) < 0) break; }
    ids.push(id);
    return { id: id, rarity: r, price: Math.round(Guild.PEDLAR_PRICE[r] * k), sold: false };
  });
  return o.stock;
};
Guild.pedlarLeft = function (o) { return (o.stock || []).filter(function (s) { return !s.sold; }); };
Guild.pedlarCheapest = function (o) {
  var m = Infinity;
  Guild.pedlarLeft(o).forEach(function (s) { if (s.price < m) m = s.price; });
  return m;
};
Guild.pedlarBuy = function (o, i) {
  var s = o && o.stock && o.stock[i];
  if (!s || s.sold || P.gold < s.price) return false;
  P.gold -= s.price;
  Items.give(s.id);
  s.sold = true;
  o.stock.forEach(function (q) { if (!q.sold) q.price = Math.round(q.price * 1.3); });
  Guild.toastGold('获得 ' + ITEMS[s.id].name);
  if (!Guild.pedlarLeft(o).length) {
    Interact.consume(o);
    MX.smoke(o.x, o.y + 0.4, o.z, 16, 0xb0a890, 1.4, 0.4);
    UI.toast('行商卖完了，赶着毛驴走了', Kit.color('goldL'));
  }
  return true;
};

Interact.KINDS.pedlar = {
  radius: 3.0,
  model: function (o) { return Guild.MODELS.pedlar(o); },
  init: function (o) { Guild.pedlarStock(o); },
  // 卖完的那一帧（还没收走）最便宜是 Infinity：不写价钱
  label: function (o) { var m = Guild.pedlarCheapest(o); return isFinite(m) ? '行商驴车：' + Guild.pedlarLeft(o).length + ' 件宝物 · 最便宜 ' + Kit.num(m) + ' 金币' : '行商驴车：卖完了'; },
  canUse: function (o) { return P.gold >= Guild.pedlarCheapest(o); },
  denied: function (o) { var m = Guild.pedlarCheapest(o); return isFinite(m) ? '金币不够：最便宜的要 ' + Kit.num(m) + ' 金币' : '行商卖完了'; },
  use: function (o) { if (typeof UI.pedlar === 'function') UI.pedlar(o); },
  update: function (o, dt, d2) {
    if (d2 < 1600 && o.donkey) MX.animHorse(o.donkey, dt, 0, false, true);
    // 骑士走到 10 米以内：行商摇拨浪鼓（±0.6，一秒 3 下），走开就停
    if (o.drum) {
      if (d2 < 100) o.drum.rotation.y = Math.sin(Game.time * 3 * TAU) * 0.6;
      else if (o.drum.rotation.y) o.drum.rotation.y *= Math.abs(o.drum.rotation.y) < 0.01 ? 0 : Math.exp(-8 * dt);
    }
  },
  mapIcon: { color: '#ffb060', shape: 'diamond', size: 3.5 },
  clear: function () { Guild.reset(); }
};

// ============================================================
//  接入其他文件：只包装，不改源码
// ============================================================
(function () {
  // 摆放：MX 的互动点之后、Content 的秘密地点之前（content_map.js 后加载，包在外面）
  var pop = Interact.populate;
  Interact.populate = function () { var r = pop.apply(this, arguments); Guild.populate(); return r; };
  // 护卫冠军倒下
  var kill = Enemies.kill;
  Enemies.kill = function (e) {
    var r = kill.apply(this, arguments);
    if (e && e.champion) { e.champion = false; Guild.championDown(e); }
    return r;
  };
  // 跳跃计数（腾跃之誓）：这一帧有跳的请求，起跳那一下 jumpBuffer 正好清零、往上跳（地上、空中跳都算）
  var pu = P.update;
  P.update = function () {
    var jb = P.jumpBuffer > 0 || (typeof Input !== 'undefined' && (Input.jumpPressed || (Input.isTouch && Input.jumpHeld && P.onGround)));
    var r = pu.apply(this, arguments);
    if (jb && P.jumpBuffer === 0 && P.vel.y > 0) Guild.jumps++;
    return r;
  };
})();

// 页面加载完（UI、LevelUp 都有了）再注册弹窗处理
Guild.lateInstall = function () {
  if (Guild.lateDone || typeof UI === 'undefined' || !UI.modeHandlers) return;
  Guild.lateDone = true;
  // 纹章祝福（誓言达成、护卫冠军倒下）
  UI.modeHandlers.oath = function (opt) {
    LevelUp.apply(opt);
    UI.toast(opt.kind === 'gold' ? '获得 ' + opt.lines[0] : '纹章祝福：' + opt.title, Kit.color('gold'));
  };
  UI.modeHandlers.supply = function (opt) { if (opt && typeof opt.onPick === 'function') opt.onPick(opt); };
  UI.modeHandlers.crucible = function (opt) { return Guild.cruciblePick(opt); };
};
window.addEventListener('load', function () { Guild.lateInstall(); });
