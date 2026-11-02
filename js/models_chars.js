'use strict';
// ============================================================
//  角色模型（玩家可选的骑士）
//  正常成人比例（约 1.9 米高），低多边形零件 + 像素贴图 + 平滑光照；
//  零件按骨骼分组，合并成一个蒙皮网格（一次绘制），髋、膝、肩、肘都能平滑摆动
// ============================================================

// ---------------- 角色用的像素小贴图 ----------------
(function () {
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就退回默认贴图 */ } };
  // 抛光板甲：上亮下暗的渐变、深色边缘和四角铆钉
  add('ch_plate', function (x, y, r) {
    var v = 252 - y * 3.2 + r() * 6;
    if (x === 0 || x === 15 || y === 0 || y === 15) v = 182;
    if ((x === 2 || x === 13) && (y === 2 || y === 13)) v = 125;
    return v;
  });
  // 锁子甲：一排排错开的小铁环
  add('ch_chain', function (x, y) {
    var cx = (x + ((y >> 2) & 1) * 2) & 3, cy = y & 3;
    var ring = ((cy === 0 || cy === 3) && (cx === 1 || cx === 2)) || ((cx === 0 || cx === 3) && (cy === 1 || cy === 2));
    if (ring) return cy === 0 ? 255 : 228;
    return (cx === 1 || cx === 2) ? 105 : 150;
  });
  // 皮革：斑驳底色 + 上下两道缝线
  add('ch_leather', function (x, y, r) {
    var v = 212 + r() * 22 - ((x * 5 + y * 3) % 7 === 0 ? 24 : 0);
    if (y === 1 || y === 14) v = x % 3 === 2 ? 150 : 250;
    return v;
  });
  // 像素脸：粗眉、豆豆眼、鼻影、嘴（乘上肤色）
  add('ch_face', function (x, y) {
    var v = 250;
    if (y === 4 && ((x >= 3 && x <= 6) || (x >= 9 && x <= 12))) v = 95;
    if ((y === 6 || y === 7) && (x === 4 || x === 5 || x === 10 || x === 11)) v = 25;
    if (y === 6 && (x === 4 || x === 10)) v = 200;
    if ((y === 9 || y === 10) && (x === 7 || x === 8)) v = y === 10 ? 175 : 215;
    if (y === 12 && x >= 5 && x <= 10) v = 120;
    if (y === 13 && (x === 5 || x === 10)) v = 200;
    return v;
  });
  // 肋骨：一道道骨条 + 中间胸骨
  add('ch_ribs', function (x, y) {
    if (x === 7 || x === 8) return 245;
    var k = y % 4;
    if (k === 0) return 255;
    if (k === 1) return 222;
    return x === 0 || x === 15 ? 150 : 52;
  });
  // 骰子面：白底红点（彩色贴图，配白色顶点色）
  add('ch_dice', function (x, y) {
    var pip = function (cx, cy) { return Math.abs(x - cx) <= 1.2 && Math.abs(y - cy) <= 1.2; };
    if (pip(3.5, 3.5) || pip(11.5, 3.5) || pip(7.5, 7.5) || pip(3.5, 11.5) || pip(11.5, 11.5)) return [205, 30, 45];
    if (x === 0 || y === 0 || x === 15 || y === 15) return [210, 205, 196];
    return [250, 248, 240];
  });
  // 羽毛：一片片鳞状的羽片
  add('ch_feather', function (x, y, r) {
    var cx = (x + ((y >> 2) & 1) * 2) & 3, cy = y & 3;
    if (cy === 3 || cx === 0) return 150;
    return 246 - cy * 14 + r() * 8;
  });
  // 星空布（彩色）：深蓝底 + 白色、淡蓝色的星星
  add('ch_stars', function (x, y, r) {
    var n = r();
    if (n < 0.09) return [255, 250, 220];
    if (n < 0.16) return [140, 175, 255];
    var v = 0.85 + r() * 0.3;
    return [32 * v, 36 * v, 96 * v];
  });
  // 布料：竖向褶皱 + 下摆
  add('ch_fold', function (x, y, r) {
    var v = 222 + Math.sin(x * 1.15) * 20 + r() * 8;
    if (y === 13) v = 252;
    if (y >= 14) v = 165;
    return v;
  });
})();

// ---------------- 额外的零件形状 ----------------
// 梯形块（上下大小不同的方块）：[上宽, 下宽, 高, 上厚, 下厚]
MODEL.extraGeo.ch_tbox = function (s) {
  var g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
  for (var i = 0; i < p.count; i++) {
    var top = p.getY(i) > 0;
    p.setXYZ(i, p.getX(i) * (top ? s[0] : s[1]), p.getY(i) * s[2], p.getZ(i) * (top ? s[3] : s[4]));
  }
  g.computeVertexNormals();
  return g;
};
// 不带盖的圆柱（四肢：两头有关节球或别的零件挡着，省三角形）：[上半径, 下半径, 高, 分段]
MODEL.extraGeo.ch_tube = function (s) { return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 8, 1, true); };
// 圆弧（新月形盔饰）：[半径, 粗细, 截面分段, 弧分段, 弧度]
MODEL.extraGeo.ch_arc = function (s) { return new THREE.TorusGeometry(s[0], s[1], s[2] || 4, s[3] || 10, s[4] || Math.PI); };
// 旋转体（头盔、锅、帽子）：[分段数, 半径0, 高0, 半径1, 高1, ...]，从下往上写
MODEL.extraGeo.ch_lathe = function (s) {
  var pts = [];
  for (var i = 1; i + 1 < s.length; i += 2) pts.push(new THREE.Vector2(s[i], s[i + 1]));
  return new THREE.LatheGeometry(pts, s[0]);
};

// ---------------- 零件小工具 ----------------
// 贴图名前面加 '!' 表示发光（顶点色调亮，暗处也很显眼）
var CHP = {
  // 通用：[类型, 尺寸, 位置, 颜色, 贴图, 旋转, 缩放]
  p: function (type, s, pos, c, t, rot, sc) { return [type, s, pos, c, rot || null, sc || null, t]; },
  box: function (s, pos, c, t, rot, sc) { return ['box', s, pos, c, rot || null, sc || null, t]; },
  cyl: function (s, pos, c, t, rot, sc) { return ['cyl', s, pos, c, rot || null, sc || null, t]; },
  ball: function (r, pos, c, t, sc, rot, seg) { return ['sphere', [r, seg ? seg[0] : 8, seg ? seg[1] : 5], pos, c, rot || null, sc || null, t]; },
  // 小关节球（6×4 段）
  knob: function (r, pos, c, t, sc) { return ['sphere', [r, 6, 4], pos, c, null, sc || null, t]; },
  tube: function (s, pos, c, t, rot, sc) { return ['ch_tube', s, pos, c, rot || null, sc || null, t]; },
  gem: function (r, pos, c, t, rot, sc) { return ['oct', [r], pos, c, rot || null, sc || null, t]; },
  ico: function (r, pos, c, t, rot, sc) { return ['ball', [r, 0], pos, c, rot || null, sc || null, t]; },
  tbox: function (s, pos, c, t, rot) { return ['ch_tbox', s, pos, c, rot || null, null, t]; },
  cone: function (s, pos, c, t, rot, sc) { return ['cone', s, pos, c, rot || null, sc || null, t]; },
  lathe: function (s, pos, c, t, rot, sc) { return ['ch_lathe', s, pos, c, rot || null, sc || null, t]; },
  // 把零件列表整体平移
  move: function (list, dx, dy, dz) {
    return list.map(function (q) { q = q.slice(); q[2] = [q[2][0] + dx, q[2][1] + dy, q[2][2] + dz]; return q; });
  },
  // 左右镜像（x 取反，绕 y、z 的旋转取反）
  mirror: function (list) {
    return list.map(function (q) {
      q = q.slice();
      q[2] = [-q[2][0], q[2][1], q[2][2]];
      if (q[4]) q[4] = [q[4][0], -q[4][1], -q[4][2]];
      return q;
    });
  }
};

// ---------------- 骨骼 ----------------
// 角色面朝 +Z；左侧（armL、legL）在 +X，右手（armR）拿主武器
// gearL / gearR / pack：拿在手上、背在背上的东西（盾、剑、背包），滑铲时缩小藏起来（rides.js），
// 平时不动；它们的零件照旧按父骨骼（foreL / foreR / chest）的坐标来写，骨骼本身只是缩放的中心点
var CH_BONES = ['pelvis', 'chest', 'head', 'armL', 'foreL', 'armR', 'foreR', 'legL', 'shinL', 'legR', 'shinR', 'cape', 'tail', 'gearL', 'gearR', 'pack'];
var CH_PARENT = { chest: 'pelvis', head: 'chest', armL: 'chest', foreL: 'armL', armR: 'chest', foreR: 'armR', legL: 'pelvis', shinL: 'legL', legR: 'pelvis', shinR: 'legR', cape: 'chest', tail: 'pelvis', gearL: 'foreL', gearR: 'foreR', pack: 'chest' };
var CH_GEAR = { gearL: 1, gearR: 1, pack: 1 };

// 默认体型（米）：髋高 0.95，肩宽 0.5，大腿 0.43，小腿 0.40（加靴底 0.08），上臂 0.30，前臂 0.28（加手约 0.7）
var CH_BODY = { sh: 0.25, sy: 0.40, neck: 0.44, chestY: 0.10, hw: 0.11, thigh: 0.43, shin: 0.40, upper: 0.30, fore: 0.28, scale: 1 };

var CHAR_MODELS = {
  defs: {},
  geoCache: {},
  mat: null
};

// 体型参数 → 每根骨骼相对父骨骼的位置
CHAR_MODELS.body = function (d) {
  var B = {}, k;
  for (k in CH_BODY) B[k] = CH_BODY[k];
  if (d.body) for (k in d.body) B[k] = d.body[k];
  B.hip = 0.04 + B.thigh + B.shin + 0.08;
  B.off = {
    pelvis: [0, B.hip, 0], chest: [0, B.chestY, 0], head: [0, B.neck, 0],
    armL: [B.sh, B.sy, 0], foreL: [0, -B.upper, 0], armR: [-B.sh, B.sy, 0], foreR: [0, -B.upper, 0],
    legL: [B.hw, -0.04, 0], shinL: [0, -B.thigh, 0], legR: [-B.hw, -0.04, 0], shinR: [0, -B.thigh, 0],
    cape: B.cape || [0, B.sy - 0.03, -0.15], tail: B.tail || [0, -0.02, -0.13],
    // 缩放中心：盾缩到小臂外侧，剑缩进手心，背包缩到后背
    gearL: [0.08, -B.fore * 0.45, 0.02], gearR: [0, -B.fore - 0.06, 0.012], pack: [0, 0.25, -0.26]
  };
  // 绑定姿势下每根骨骼的模型坐标（没有旋转，直接累加）
  B.world = {};
  CH_BONES.forEach(function (n) {
    var o = B.off[n], p = CH_PARENT[n] ? B.world[CH_PARENT[n]] : [0, 0, 0];
    B.world[n] = [p[0] + o[0], p[1] + o[1], p[2] + o[2]];
  });
  return B;
};

CHAR_MODELS.material = function () {
  if (!CHAR_MODELS.mat) CHAR_MODELS.mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.atlas, skinning: true });
  return CHAR_MODELS.mat;
};

// 把零件追加到数组里（和 MODEL.build 一样的零件格式；这里自己做是为了：
//  1. 每个顶点带骨骼编号；2. 盒子的 UV 是完整的 0~1（整张小贴图都贴上去）；3. 发光零件顶点色调亮）
CHAR_MODELS.addParts = function (out, parts, bone, at) {
  var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  var pv = new THREE.Vector3(), sv = new THREE.Vector3();
  parts.forEach(function (p) {
    var g = MODEL.geo(p[0], p[1]);
    if (g.index) g = g.toNonIndexed();
    var r = p[4] || [0, 0, 0], tn = p[6] || TEX.guess(p[3]), k = 1;
    if (tn.charAt(0) === '!') { tn = tn.slice(1); k = 2.4; }
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    pv.set(p[2][0] + at[0], p[2][1] + at[1], p[2][2] + at[2]);
    if (p[5]) sv.set(p[5][0], p[5][1], p[5][2]); else sv.set(1, 1, 1);
    m.compose(pv, q, sv);
    g.applyMatrix4(m);
    var pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv ? g.attributes.uv.array : null;
    var tile = TEX.tileUV(tn), T = TEX.TILE;
    c.set(p[3]);
    for (var i = 0, n = pa.length / 3; i < n; i++) {
      out.pos.push(pa[i * 3], pa[i * 3 + 1], pa[i * 3 + 2]);
      out.nor.push(na[i * 3], na[i * 3 + 1], na[i * 3 + 2]);
      out.col.push(c.r * k, c.g * k, c.b * k);
      var uu = ua ? ua[i * 2] : 0.5, vv = ua ? ua[i * 2 + 1] : 0.5;
      if (uu < 0 || uu > 1) uu -= Math.floor(uu);
      if (vv < 0 || vv > 1) vv -= Math.floor(vv);
      out.uv.push(tile.u + T * (0.03 + uu * 0.94), tile.v + T * (0.03 + vv * 0.94));
      out.si.push(bone, 0, 0, 0);
      out.sw.push(1, 0, 0, 0);
    }
    g.dispose();
  });
};

// 把一个角色的所有零件合成一个带骨骼权重的几何体（每个角色只建一次）
CHAR_MODELS.makeGeo = function (id) {
  var d = CHAR_MODELS.defs[id] || CHAR_MODELS.defs.knight;
  var B = CHAR_MODELS.body(d);
  var parts = d.make(B);
  var out = { pos: [], nor: [], col: [], uv: [], si: [], sw: [] };
  CH_BONES.forEach(function (name, bi) {
    if (parts[name] && parts[name].length) CHAR_MODELS.addParts(out, parts[name], bi, B.world[CH_GEAR[name] ? CH_PARENT[name] : name]);
  });
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  geo.setAttribute('skinIndex', new THREE.Float32BufferAttribute(out.si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(out.sw, 4));
  geo.computeBoundingSphere();
  geo.userData.B = B;
  return geo;
};

// 造一个角色：返回 Group；userData 里有骨骼（body = 上身，legL/legR/armL/armR = 大腿和上臂）
CHAR_MODELS.build = function (id) {
  if (!CHAR_MODELS.defs[id]) id = 'knight';
  var geo = CHAR_MODELS.geoCache[id] || (CHAR_MODELS.geoCache[id] = CHAR_MODELS.makeGeo(id));
  var d = CHAR_MODELS.defs[id], B = geo.userData.B;
  var bones = {}, list = [];
  CH_BONES.forEach(function (n) {
    var b = new THREE.Bone();
    b.name = n;
    b.position.fromArray(B.off[n]);
    bones[n] = b;
    list.push(b);
  });
  CH_BONES.forEach(function (n) { if (CH_PARENT[n]) bones[CH_PARENT[n]].add(bones[n]); });
  var g = new THREE.Group();
  var mesh = new THREE.SkinnedMesh(geo, CHAR_MODELS.material());
  mesh.frustumCulled = false;
  g.add(mesh);
  mesh.add(bones.pelvis);
  mesh.bind(new THREE.Skeleton(list));
  g.scale.setScalar(B.scale);
  g.userData = { id: id, mesh: mesh, bones: bones, def: d, B: B, body: bones.chest, legL: bones.legL, legR: bones.legR, armL: bones.armL, armR: bones.armR };
  CHAR_MODELS.pose(g, CHAR_MODELS.idlePose);
  return g;
};

// 不再使用的角色：释放骨骼贴图（几何体按角色缓存，继续复用）
CHAR_MODELS.release = function (g) {
  if (!g || !g.userData || !g.userData.mesh) return;
  if (g.parent) g.parent.remove(g);
  var sk = g.userData.mesh.skeleton;
  if (sk && sk.dispose) sk.dispose();
};

// ---------------- 动作 ----------------
// 姿势通道（弧度/米）；地面（待机+跑步）、空中、滑铲、秀肌肉四种姿势按权重混合
var CHA = { PY: 0, PRX: 1, PRY: 2, CRX: 3, CRY: 4, CRZ: 5, HRX: 6, HRY: 7, ALX: 8, ALZ: 9, FLX: 10, FLZ: 11, ARX: 12, ARZ: 13, FRX: 14, FRZ: 15,
  LLX: 16, LLZ: 17, SLX: 18, LRX: 19, LRZ: 20, SRX: 21, KX: 22, TX: 23, TY: 24, N: 25 };
CHA.o = new Float32Array(CHA.N);
CHA.a = new Float32Array(CHA.N);
CHA.s = new Float32Array(CHA.N);
CHAR_MODELS.idlePose = { t: 0, run: 0, phase: 0, air: 0, vy: 0, slide: 0, flex: 0, land: 0 };

// ---------------- 滑铲坐骑的姿势（坐骑本身在 rides.js） ----------------
// 约定：腿、胳膊绕 X 转正值 = 往后摆；上身 CRX 正值 = 前倾；骨盆 PRY 正值 = 身体转向自己的左边。
// 骨盆高度 PY 不写在这里：rides.js 按座位 / 踏板高度算好，放在 a.ridePY
//  surf 站在板上（侧身、两腿分开压低）；sit 坐着（腿往前伸）；straddle 跨坐（两腿夹住往后收）；
//  prone 趴着（肚皮贴地、两手往前伸）；kneel 单膝跪着；crouch 蹲着往前冲
var CH_STANCE = {
  surf: { PRY: 1.2, CRX: 0.3, CRY: -0.5, HRX: 0.0, HRY: -0.7, ALX: -0.3, ALZ: 0.8, FLX: -0.55, ARX: 0.25, ARZ: -0.75, FRX: -0.6,
    LLX: -0.75, LLZ: 0.3, SLX: 1.15, LRX: -0.75, LRZ: -0.3, SRX: 1.15, KX: 0.45, TX: 0.8 },
  sit: { PRX: -0.25, CRX: 0.3, ALX: -0.6, ALZ: 0.45, FLX: -0.5, ARX: -0.6, ARZ: -0.45, FRX: -0.5,
    LLX: -1.45, LLZ: 0.15, SLX: 0.6, LRX: -1.45, LRZ: -0.15, SRX: 0.6, KX: 0.45, TX: 1.3 },
  straddle: { CRX: 0.45, HRX: -0.35, ALX: -0.9, ALZ: 0.12, FLX: -0.6, ARX: -0.9, ARZ: -0.12, FRX: -0.6,
    LLX: -0.7, LLZ: 0.35, SLX: 1.4, LRX: -0.7, LRZ: -0.35, SRX: 1.4, KX: 1.2, TX: 1.0 },
  prone: { PRX: 1.45, HRX: -1.15, ALX: -2.9, ALZ: 0.25, FLX: -0.1, ARX: -2.9, ARZ: -0.25, FRX: -0.1,
    LLX: 0.05, LLZ: 0.08, SLX: 0.35, LRX: 0.05, LRZ: -0.08, SRX: 0.35, KX: -0.3, TX: 0.2 },
  kneel: { PRX: -0.1, CRX: -0.2, HRX: 0.1, ALX: -1.3, ALZ: 0.25, FLX: -0.6, ARX: -1.5, ARZ: -0.1,
    LLX: -0.1, LLZ: 0.12, SLX: 1.5, LRX: -0.1, LRZ: -0.12, SRX: 1.5, KX: 1.0, TX: 1.0 },
  crouch: { CRX: 0.6, HRX: -0.5, ALX: 0.7, ALZ: 0.15, FLX: -0.15, ARX: 0.7, ARZ: -0.15, FRX: -0.15,
    LLX: -1.0, LLZ: 0.1, SLX: 1.7, LRX: -0.5, LRZ: -0.1, SRX: 1.2, KX: 1.3, TX: 1.0 }
};

// 把一个坐骑的基础姿势（姿势表 + 坐骑自己的覆盖值）写进 S；PY 先写 0
CHAR_MODELS.stanceBase = function (S, rd) {
  var C = CHA, st = CH_STANCE[rd.stance] || CH_STANCE.sit, k;
  for (var i = 0; i < C.N; i++) S[i] = 0;
  for (k in st) S[C[k]] = st[k];
  if (rd.goofy) { S[C.PRY] = -S[C.PRY]; S[C.CRY] = -S[C.CRY]; S[C.HRY] = -S[C.HRY]; }
  if (rd.pose) for (k in rd.pose) if (C[k] !== undefined) S[C[k]] = rd.pose[k];
};

// 正向运动学：这个姿势下（PY = 0）两只脚底、两个膝盖最低点的高度（身体坐标，站立时脚底 = 0）
// rides.js 用它算骨盆该放多高，脚才正好踩在踏板上 / 膝盖正好贴地
CHAR_MODELS.legLow = function (B, S) {
  var C = CHA, T = CHAR_MODELS._fk;
  if (!T) T = CHAR_MODELS._fk = { p: new THREE.Matrix4(), l: new THREE.Matrix4(), s: new THREE.Matrix4(), e: new THREE.Euler(), v: new THREE.Vector3() };
  T.p.makeRotationFromEuler(T.e.set(S[C.PRX], S[C.PRY], 0));
  T.p.setPosition(0, B.hip, 0);
  var res = { sole: Infinity, knee: Infinity, soleL: 0, soleR: 0 };
  for (var side = 0; side < 2; side++) {
    var lx = side ? S[C.LRX] : S[C.LLX], lz = side ? S[C.LRZ] : S[C.LLZ], sx = side ? S[C.SRX] : S[C.SLX];
    T.l.makeRotationFromEuler(T.e.set(lx, 0, lz));
    T.l.setPosition(side ? -B.hw : B.hw, -0.04, 0);
    T.l.premultiply(T.p);
    T.s.makeRotationFromEuler(T.e.set(sx, 0, 0));
    T.s.setPosition(0, -B.thigh, 0);
    T.s.premultiply(T.l);
    T.v.set(0, 0, 0.02).applyMatrix4(T.s);
    res.knee = Math.min(res.knee, T.v.y - 0.09);
    var lo = Infinity;
    for (var z = -0.1; z <= 0.21; z += 0.3) { T.v.set(0, -B.shin - 0.08, z).applyMatrix4(T.s); lo = Math.min(lo, T.v.y); }
    if (side) res.soleR = lo; else res.soleL = lo;
    res.sole = Math.min(res.sole, lo);
  }
  return res;
};

// a: { t 时间, run 跑步权重 0~1, phase 步伐相位, air 空中权重, vy 竖直速度, slide 滑铲权重, flex 秀肌肉权重, land 落地下蹲 0~1 }
// 坐骑（rides.js 写入，都可以不写）：ride 坐骑姿势权重 0~1, rideDef 坐骑定义（stance / goofy / pose / poseFn）, ridePY 骨盆高度,
//   flip 翻板进度 0~1, dive 俯冲权重, hs 水平速度, kick 蹬地相位 0~1, kickW 蹬地权重（坐骑的 poseFn 用）
CHAR_MODELS.pose = function (g, a) {
  var u = g.userData, b = u.bones, d = u.def, C = CHA, o = C.o, A = C.a, S = C.s, i;
  var t = a.t, k = a.run, idle = 1 - k, s = Math.sin(a.phase), c = Math.cos(a.phase);
  var br = Math.sin(t * 2.1), ld = a.land, out = d.armOut || 0, hunch = d.hunch || 0;
  var rw = a.ride > 0.001 && a.rideDef ? a.ride : 0, rd = rw ? a.rideDef : null;
  // ---- 地面：待机呼吸 + 跑步 ----
  var sway = Math.sin(t * 0.7) * 0.5 + 0.5;   // 待机时慢慢换重心
  o[C.PY] = idle * (0.006 * br - 0.012) + k * (0.05 * Math.abs(s) - 0.035) - 0.12 * ld;
  o[C.PRX] = 0; o[C.PRY] = -0.07 * k * s + idle * 0.06;
  o[C.CRX] = hunch + idle * (0.018 * br - 0.03) + k * 0.13 + 0.14 * ld;
  o[C.CRY] = 0.1 * k * s - idle * 0.08; o[C.CRZ] = idle * (0.02 + 0.02 * sway);
  o[C.HRX] = -0.6 * (o[C.CRX] - hunch * 0.3); o[C.HRY] = idle * (0.1 + 0.14 * Math.sin(t * 0.55));
  o[C.ALX] = 0.55 * k * s + idle * (0.03 * br - 0.05); o[C.ALZ] = 0.12 + out + 0.05 * k + idle * 0.02 * br;
  o[C.FLX] = -(0.16 + 0.85 * k) - 0.3 * k * Math.max(0, -s) - idle * 0.18; o[C.FLZ] = 0;
  o[C.ARX] = -0.55 * k * s + idle * (0.03 * br - 0.2); o[C.ARZ] = -(0.12 + out + 0.05 * k + idle * 0.02 * br);
  o[C.FRX] = -(0.16 + 0.85 * k) - 0.3 * k * Math.max(0, s) - idle * 0.3; o[C.FRZ] = 0;
  o[C.LLX] = -0.62 * k * s - 0.3 * ld + idle * 0.04; o[C.LLZ] = idle * (0.07 + 0.03 * sway);
  o[C.SLX] = k * (0.12 + 1.05 * Math.max(0, c)) + 0.55 * ld + idle * 0.06;
  o[C.LRX] = 0.62 * k * s - 0.3 * ld - idle * 0.06; o[C.LRZ] = -idle * (0.1 - 0.03 * sway);
  o[C.SRX] = k * (0.12 + 1.05 * Math.max(0, -c)) + 0.55 * ld + idle * 0.1;
  o[C.KX] = 0.08 + 0.55 * k + 0.07 * k * Math.sin(a.phase * 2) + idle * 0.02 * br;
  o[C.TX] = (d.tailLift || 0.2) + 0.35 * k; o[C.TY] = idle * 0.3 * Math.sin(t * 2.4) + 0.25 * k * s;
  // ---- 空中：上升时收腿张臂，下落时伸腿准备落地（踩着坐骑时由坐骑姿势代替） ----
  var aw = a.air * (1 - rw);
  if (aw > 0.001) {
    var up = clamp(a.vy / 9, -1, 1), f = (up + 1) / 2;
    A[C.PY] = 0; A[C.PRX] = 0; A[C.PRY] = 0;
    A[C.CRX] = hunch + 0.1; A[C.CRY] = 0; A[C.CRZ] = 0; A[C.HRX] = -0.08; A[C.HRY] = 0;
    A[C.ALX] = -0.3 - 0.25 * f; A[C.ALZ] = 0.5 + out + 0.35 * f; A[C.FLX] = -0.55; A[C.FLZ] = 0;
    A[C.ARX] = -0.3 - 0.25 * f; A[C.ARZ] = -(0.5 + out + 0.35 * f); A[C.FRX] = -0.55; A[C.FRZ] = 0;
    A[C.LLX] = -0.35 - 0.6 * f; A[C.LLZ] = 0.06; A[C.SLX] = 0.45 + 0.85 * f;
    A[C.LRX] = 0.05 - 0.1 * f; A[C.LRZ] = -0.06; A[C.SRX] = 0.3 + 0.4 * f;
    A[C.KX] = 0.3 + 0.9 * (1 - f); A[C.TX] = 0.7; A[C.TY] = 0;
    for (i = 0; i < C.N; i++) o[i] += (A[i] - o[i]) * aw;
  }
  // ---- 坐骑姿势：按坐骑的 stance，空中、翻板、俯冲各叠一层 ----
  if (rd) {
    CHAR_MODELS.stanceBase(S, rd);
    var air = a.air || 0, fp = a.flip || 0, dv = a.dive || 0, hs = a.hs || 0;
    S[C.PY] = a.ridePY || 0;
    S[C.CRX] += hunch * 0.5;
    if (rd.stance === 'surf') {
      // 张开手臂保持平衡（像跷跷板一样左右摆），跑快了膝盖跟着一压一压
      var bal = 0.12 * Math.sin(1.7 * t), pump = clamp((hs - 15) / 10, 0, 1) * Math.sin(t * 9);
      S[C.ALZ] += bal; S[C.ARZ] += bal;
      S[C.SLX] += 0.18 * pump; S[C.SRX] += 0.18 * pump; S[C.LLX] -= 0.09 * pump; S[C.LRX] -= 0.09 * pump; S[C.PY] -= 0.03 * pump;
    }
    // 空中：手臂抬高、膝盖收起
    S[C.ALZ] += 0.25 * air; S[C.ARZ] -= 0.25 * air; S[C.SLX] += 0.2 * air; S[C.SRX] += 0.2 * air;
    if (fp > 0) {
      var sf = Math.sin(Math.PI * clamp(fp, 0, 1));
      S[C.SLX] += 0.6 * sf; S[C.SRX] += 0.6 * sf; S[C.LLX] -= 0.3 * sf; S[C.LRX] -= 0.3 * sf; S[C.PY] += 0.15 * sf;
    }
    if (dv > 0) { S[C.PRX] += 0.5 * dv; S[C.ALZ] += 1.3 * dv; S[C.ARZ] -= 1.3 * dv; }
    if (rd.poseFn) rd.poseFn(S, a, C);
    for (i = 0; i < C.N; i++) o[i] += (S[i] - o[i]) * rw;
  }
  // ---- 滑铲（没有坐骑时的老姿势）：上身后仰，前腿伸直，后腿折在身下 ----
  if (a.slide > 0.001 && !a.rideDef) {
    S[C.PY] = -0.56; S[C.PRX] = -0.5; S[C.PRY] = 0;
    S[C.CRX] = -0.22; S[C.CRY] = 0.18; S[C.CRZ] = 0; S[C.HRX] = 0.55; S[C.HRY] = 0;
    S[C.ALX] = 0.75; S[C.ALZ] = 0.55; S[C.FLX] = -0.15; S[C.FLZ] = 0;
    S[C.ARX] = -1.15; S[C.ARZ] = -0.3; S[C.FRX] = -0.7; S[C.FRZ] = 0;
    S[C.LLX] = -0.95; S[C.LLZ] = 0.06; S[C.SLX] = 0.1;
    S[C.LRX] = -0.12; S[C.LRZ] = -0.12; S[C.SRX] = 1.95;
    S[C.KX] = 1.15; S[C.TX] = 1.1; S[C.TY] = 0;
    for (i = 0; i < C.N; i++) o[i] += (S[i] - o[i]) * a.slide;
  }
  // ---- 秀肌肉：双臂抬起、小臂竖直（只改胳膊和上身） ----
  if (a.flex > 0.001) {
    var w = a.flex;
    o[C.ALX] += (0 - o[C.ALX]) * w; o[C.ALZ] += (1.45 - o[C.ALZ]) * w; o[C.FLX] += (0 - o[C.FLX]) * w; o[C.FLZ] += (1.75 - o[C.FLZ]) * w;
    o[C.ARX] += (0 - o[C.ARX]) * w; o[C.ARZ] += (-1.45 - o[C.ARZ]) * w; o[C.FRX] += (0 - o[C.FRX]) * w; o[C.FRZ] += (-1.75 - o[C.FRZ]) * w;
    o[C.CRX] += (-0.1 - o[C.CRX]) * w * 0.8; o[C.HRX] += (-0.12 - o[C.HRX]) * w * 0.8;
  }
  // ---- 写到骨骼上 ----
  var fl = d.float ? (d.float + 0.05 * Math.sin(t * 2.3)) * (1 - rw) : 0;
  b.pelvis.position.y = u.B.off.pelvis[1] + o[C.PY] + fl;
  b.pelvis.rotation.set(o[C.PRX], o[C.PRY], 0);
  b.chest.rotation.set(o[C.CRX], o[C.CRY], o[C.CRZ]);
  b.head.rotation.set(o[C.HRX], o[C.HRY], 0);
  b.armL.rotation.set(o[C.ALX], 0, o[C.ALZ]);
  b.foreL.rotation.set(o[C.FLX], 0, o[C.FLZ]);
  b.armR.rotation.set(o[C.ARX], 0, o[C.ARZ]);
  b.foreR.rotation.set(o[C.FRX], 0, o[C.FRZ]);
  b.legL.rotation.set(o[C.LLX], 0, o[C.LLZ]);
  b.shinL.rotation.x = o[C.SLX];
  b.legR.rotation.set(o[C.LRX], 0, o[C.LRZ]);
  b.shinR.rotation.x = o[C.SRX];
  if (d.capeSpin) b.cape.rotation.set(0, 0, t * d.capeSpin);   // 发条钥匙一直在转
  else b.cape.rotation.x = o[C.KX];
  b.tail.rotation.set(o[C.TX], o[C.TY], 0);
};


// ============================================================
//  身体零件（以骨骼为原点，单位米；粗壮一点，远看轮廓清楚）
// ============================================================
var CHK = {};

// 腿：返回 [大腿零件, 小腿零件]
// o: thigh 大腿、knee 护膝、shin 小腿、boot 靴子、cuff 靴口（颜色，后面加 T 是贴图），w 粗细
CHK.leg = function (B, o) {
  var t = B.thigh, s = B.shin, w = o.w || 1, P = CHP;
  var thigh = [P.tube([0.102 * w, 0.082 * w, t + 0.06, 8], [0, -t / 2 + 0.02, 0], o.thigh, o.thighT || 'ch_plate')];
  // 膝关节：和大腿同色的小球填缝（看不出接缝），护膝是膝盖前面单独一块甲片
  var jt = !o.thighT || o.thighT === 'ch_plate' ? 'skin' : o.thighT;
  thigh.push(P.knob(0.094 * w, [0, -t, 0.0], o.thigh, jt, [1, 0.85, 1.0]));
  if (o.knee) {
    thigh.push(P.tbox([0.13 * w, 0.1 * w, 0.13, 0.05, 0.05], [0, -t + 0.01, 0.075 * w], o.knee, o.kneeT || 'ch_plate', [-0.12, 0, 0]));
    thigh.push(P.knob(0.05 * w, [0, -t + 0.01, 0.1 * w], o.knee, 'skin', [1.2, 0.8, 0.6]));
  }
  var shin = [
    P.tube([0.078 * w, 0.06 * w, s, 8], [0, -s / 2, 0], o.shin, o.shinT || 'ch_plate'),
    P.box([0.15 * w, 0.12, 0.3], [0, -s - 0.02, 0.05], o.boot, o.bootT || 'ch_leather')
  ];
  if (o.cuff) shin.push(P.cyl([0.094 * w, 0.084 * w, 0.08, 8], [0, -s + 0.08, 0], o.cuff, o.cuffT || 'ch_leather'));
  if (o.toe) shin.push(P.box([0.13 * w, 0.06, 0.08], [0, -s - 0.05, 0.19], o.toe, 'ch_plate'));
  return [thigh, shin];
};

// 胳膊：返回 [上臂零件, 前臂零件]；side: +1 左（+X），-1 右（-X）
// o: upper 上臂、pauldron 肩甲（pw 大小）、elbow 护肘、fore 前臂、cuff 护腕、hand 手，w 粗细
CHK.arm = function (B, o, side) {
  var u = B.upper, f = B.fore, w = o.w || 1, P = CHP;
  var upper = [P.tube([0.07 * w, 0.06 * w, u + 0.04, 8], [0, -u / 2, 0], o.upper, o.upperT || 'ch_plate')];
  if (o.pauldron) {
    var pw = o.pw || 1, pt = o.pauldronT || 'ch_plate';
    upper.push(P.ball(0.135 * pw, [side * 0.035, -0.01, 0], o.pauldron, pt, [1.15, 0.8, 1.12]));
    upper.push(P.knob(0.12 * pw, [side * 0.055, -0.09, 0], o.pauldron, pt, [1.0, 0.48, 1.02]));
  } else upper.push(P.knob(0.075 * w, [0, -0.01, 0], o.upper, o.upperT || 'skin'));
  // 肘关节：同色小球填缝；护肘是肘后一个尖
  var jt = !o.upperT || o.upperT === 'ch_plate' ? 'skin' : o.upperT;
  upper.push(P.knob(0.075 * w, [0, -u, -0.01], o.upper, jt));
  if (o.elbow) upper.push(P.cone([0.05 * w, 0.09, 5], [0, -u, -0.065 * w], o.elbow, 'skin', [-Math.PI / 2, 0, 0]));
  var fore = [P.tube([0.062 * w, 0.052 * w, f, 8], [0, -f / 2, 0], o.fore, o.foreT || 'ch_plate')];
  if (o.cuff) fore.push(P.tube([0.082 * w, 0.068 * w, 0.1, 8], [0, -f + 0.04, 0], o.cuff, o.cuffT || 'ch_plate'));
  fore.push(P.box([0.1 * w, 0.12, 0.12], [0, -f - 0.06, 0.008], o.hand, o.handT || 'ch_leather'));
  return [upper, fore];
};

// 躯干（chest 骨骼）：腰 + 上宽下窄的胸 + 圆润的前胸；o.cw 胸宽倍数
CHK.torso = function (B, o) {
  var P = CHP, cw = o.cw || 1, top = (B.sh * 2 + 0.01) * cw;
  var list = [
    P.tbox([0.33 * cw, 0.31 * cw, 0.18, 0.21, 0.21], [0, 0.0, 0], o.waist, o.waistT || 'ch_chain'),
    P.tbox([top, 0.34 * cw, 0.34, 0.29, 0.22], [0, 0.235, -0.005], o.chest, o.chestT || 'ch_plate')
  ];
  if (!o.flat) list.push(P.ball(0.155, [0, 0.25, 0.06], o.chest, o.chestT || 'ch_plate', [1.35 * cw, 1.05, 0.75]));
  if (o.gorget) list.push(P.cyl([0.09, 0.14, 0.09, 8], [0, 0.43, -0.005], o.gorget, o.gorgetT || 'ch_plate'));
  return list;
};

// 骨盆：胯 + 腰带 + 裙甲 + 前后两片布（腿从两边穿过去）
CHK.hips = function (B, o) {
  var P = CHP, hw = o.hw || 1;
  var list = [
    P.tbox([0.33 * hw, 0.36 * hw, 0.18, 0.22, 0.23], [0, -0.03, 0], o.hips, o.hipsT || 'ch_chain'),
    P.box([0.36 * hw, 0.06, 0.245], [0, 0.05, 0], o.belt || LEATHER_D, o.beltT || 'ch_leather')
  ];
  if (o.buckle) list.push(P.box([0.07, 0.06, 0.02], [0, 0.05, 0.125], o.buckle, 'gold'));
  if (o.faulds) list.push(P.tbox([0.36 * hw, 0.41 * hw, 0.11, 0.25, 0.28], [0, -0.04, 0], o.faulds, o.fauldsT || 'ch_plate'));
  if (o.skirt) {
    var L = o.skirtLen || 0.3, sw = o.skirtW || 0.21;
    list.push(P.box([sw, L, 0.02], [0, -L / 2 + 0.02, 0.135], o.skirt, o.skirtT || 'ch_fold', [-0.08, 0, 0]));
    list.push(P.box([sw, L, 0.02], [0, -L / 2 + 0.02, -0.135], o.skirtB || o.skirt, o.skirtT || 'ch_fold', [0.08, 0, 0]));
  }
  return list;
};

// 头：方脸 + 后脑勺 + 像素脸 + 耳朵（head 骨骼，原点在脖子根）
CHK.head = function (skin, o) {
  var P = CHP;
  o = o || {};
  var list = [
    P.tube([0.062, 0.072, 0.13, 6], [0, 0.05, 0], skin, 'skin'),
    P.box([0.2, 0.24, 0.21], [0, 0.22, 0.005], skin, 'skin'),
    P.knob(0.125, [0, 0.235, -0.03], skin, 'skin', [0.86, 0.98, 0.92]),
    P.box([0.17, 0.17, 0.012], [0, 0.215, 0.112], skin, 'ch_face'),
    P.box([0.03, 0.06, 0.05], [0.105, 0.21, 0.0], skin, 'skin'),
    P.box([0.03, 0.06, 0.05], [-0.105, 0.21, 0.0], skin, 'skin')
  ];
  if (o.nose !== false) list.push(P.box([0.04, 0.05, 0.04], [0, 0.205, 0.125], skin, 'skin'));
  return list;
};

// 披风（cape 骨骼，从肩背往下垂）
CHK.cape = function (c, len, wTop, wBot, t) {
  var P = CHP;
  len = len || 0.95; wTop = wTop || 0.46; wBot = wBot || 0.6;
  return [
    P.tbox([wTop, wBot, len, 0.03, 0.03], [0, -len / 2 + 0.02, -0.03], c, t || 'ch_fold'),
    P.box([wTop + 0.06, 0.07, 0.08], [0, 0.0, 0.01], c, t || 'ch_fold')
  ];
};
// 破破烂烂的披风：几条长短不一的布条
CHK.rags = function (c, len, w, n, t) {
  var P = CHP, list = [], i;
  n = n || 4;
  for (i = 0; i < n; i++) {
    var x = (i - (n - 1) / 2) * w / n, L = len * (0.72 + ((i * 37) % 10) / 30);
    list.push(P.box([w / n + 0.012, L, 0.03], [x, -L / 2 + 0.02, -0.03 - (i % 2) * 0.006], c, t || 'ch_fold', [0, 0, (i - (n - 1) / 2) * -0.05]));
  }
  list.push(P.box([w + 0.04, 0.07, 0.07], [0, 0, 0.0], c, t || 'ch_fold'));
  return list;
};

// 握在手里的东西（前臂骨骼坐标）：list 以“握把中心在原点、东西指向 +Z（或竖直沿 +Y）”来写，
// 绕 X 轴转 ang（越大越往下指）后放到手上
CHK.hand = function (B) { return [0, -B.fore - 0.06, 0.012]; };
CHK.held = function (B, ang, list, dx) {
  var h = CHK.hand(B), ca = Math.cos(ang), sa = Math.sin(ang);
  return list.map(function (q) {
    q = q.slice();
    var x = q[2][0], y = q[2][1], z = q[2][2];
    q[2] = [h[0] + x + (dx || 0), h[1] + y * ca - z * sa, h[2] + y * sa + z * ca];
    var r = q[4] || [0, 0, 0];
    q[4] = [r[0] + ang, r[1], r[2]];
    return q;
  });
};

// 剑：剑身沿 +Z（刃朝上下）
CHK.sword = function (blade, guard, grip, len, wide, bladeT) {
  var P = CHP;
  len = len || 0.85; wide = wide || 0.075;
  return [
    P.tbox([0.022, 0.022, len, wide * 0.4, wide], [0, 0, 0.1 + len / 2], blade, bladeT || 'ch_plate', [Math.PI / 2, 0, 0]),
    P.box([0.04, 0.26, 0.045], [0, 0, 0.09], guard, 'gold'),
    P.box([0.038, 0.038, 0.16], [0, 0, 0.0], grip, 'ch_leather'),
    P.knob(0.04, [0, 0, -0.09], guard, 'gold')
  ];
};

// 盾（左前臂外侧）：pts 是盾面形状 [上宽, 下宽, 高]
CHK.kiteShield = function (B, face, rim, emblem) {
  var P = CHP, y = -B.fore * 0.45;
  return [
    P.tbox([0.05, 0.05, 0.5, 0.38, 0.16], [0.09, y, 0.02], rim, 'ch_plate'),
    P.tbox([0.03, 0.03, 0.44, 0.33, 0.12], [0.112, y + 0.005, 0.02], face, 'ch_plate'),
    P.box([0.02, 0.36, 0.06], [0.128, y + 0.02, 0.02], emblem, 'gold'),
    P.box([0.02, 0.06, 0.26], [0.128, y + 0.08, 0.02], emblem, 'gold')
  ];
};

// ============================================================
//  21 位骑士（原创设计：按 data.js 里各自的中文名和称号来设计）
//  镜头大多在背后，所以每个人背后都有好认的东西：披风、羽饰、箭袋、尾巴、翅膀……
// ============================================================
var CHD = CHAR_MODELS.defs;
var STEEL = 0xc9d2dd, STEEL_D = 0x7c8796, GOLD = 0xe2b23a, LEATHER = 0x7a5030, LEATHER_D = 0x4b3120, SKIN = 0xe9b48c;

// 左右对称的两只胳膊（同一套参数）
CHK.arms = function (B, o) { var l = CHK.arm(B, o, 1), r = CHK.arm(B, o, -1); return { armL: l[0], foreL: l[1], armR: r[0], foreR: r[1] }; };
// 把身体各部分拼成骨骼表；extra 里的零件追加到对应骨骼
CHK.rig = function (base, extra) {
  var out = {}, k;
  for (k in base) out[k] = base[k].slice();
  for (k in extra) out[k] = (out[k] || []).concat(extra[k]);
  return out;
};
CHK.legs = function (leg) { return { legL: leg[0], shinL: leg[1], legR: leg[0], shinR: leg[1] }; };
CHK.join = function () {
  var out = {};
  for (var i = 0; i < arguments.length; i++) for (var k in arguments[i]) out[k] = (out[k] || []).concat(arguments[i][k]);
  return out;
};

// ---- 铁罐爵士：全身重甲的老派骑士。桶盔 + 十字窥缝、红色大羽饰、蓝披风、风筝盾和长剑 ----
CHD.knight = {
  make: function (B) {
    var P = CHP, RED = 0xd8323a, BLUE = 0x2a55c8;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: STEEL, knee: STEEL, shin: STEEL, boot: STEEL_D, bootT: 'ch_plate', toe: STEEL })),
      CHK.arms(B, { upper: STEEL, pauldron: STEEL, elbow: STEEL, fore: STEEL, cuff: STEEL, hand: STEEL_D, handT: 'ch_plate' }),
      {
        pelvis: CHK.hips(B, { hips: STEEL_D, faulds: STEEL, buckle: GOLD, skirt: BLUE, skirtLen: 0.34 }),
        chest: CHK.torso(B, { waist: STEEL_D, chest: STEEL, gorget: STEEL }).concat([
          P.box([0.05, 0.14, 0.03], [0, 0.26, 0.182], GOLD, 'gold'), P.box([0.13, 0.04, 0.03], [0, 0.285, 0.18], GOLD, 'gold')
        ]),
        head: [
          P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], STEEL_D, 'ch_chain'),
          P.cyl([0.152, 0.16, 0.3, 10], [0, 0.23, 0], STEEL, 'ch_plate'),
          P.cyl([0.115, 0.152, 0.05, 10], [0, 0.405, 0], STEEL, 'ch_plate'),
          P.box([0.25, 0.032, 0.04], [0, 0.265, 0.145], 0x101216, 'plain'),
          P.box([0.035, 0.17, 0.035], [0, 0.2, 0.153], STEEL_D, 'ch_plate'),
          P.cyl([0.163, 0.163, 0.035, 10], [0, 0.35, 0], GOLD, 'gold'),
          // 羽饰：从头顶往后弯下来的一大蓬
          P.cyl([0.05, 0.065, 0.06, 6], [0, 0.44, 0], GOLD, 'gold'),
          P.ball(0.1, [0, 0.52, -0.02], RED, 'ch_feather', [0.8, 1.0, 1.25], [-0.3, 0, 0]),
          P.ball(0.1, [0, 0.49, -0.16], RED, 'ch_feather', [0.95, 0.9, 1.2], [0.5, 0, 0]),
          P.ball(0.085, [0, 0.39, -0.26], 0xb82830, 'ch_feather', [1.0, 1.25, 0.8], [0.9, 0, 0])
        ],
        gearL: CHK.kiteShield(B, BLUE, STEEL, GOLD),
        foreR: CHK.held(B, 0.5, CHK.sword(0xeef3f8, GOLD, LEATHER, 0.82)),
        cape: CHK.cape(0x2a4fb8, 0.92)
      });
  }
};

// ---- 狐狸法骑士：运气好得离谱的狐狸法师。紫袍罩轻甲、圆眼镜、金头箍、大尾巴、火焰法杖 ----
CHD.fox = {
  tailLift: 0.35,
  make: function (B) {
    var P = CHP, FUR = 0xe8803a, WHITE = 0xf6efe4, ROBE = 0x5b3c9e, ROBE_D = 0x3d2870, LUCK = 0x4af07a;
    var arms = CHK.arms(B, { upper: ROBE, upperT: 'ch_fold', fore: ROBE, foreT: 'ch_fold', cuff: GOLD, cuffT: 'gold', hand: FUR, handT: 'fur', w: 1.05 });
    arms.armL.push(P.knob(0.105, [0.03, -0.01, 0], STEEL, 'ch_plate', [1.15, 0.7, 1.1]));
    arms.armR.push(P.knob(0.105, [-0.03, -0.01, 0], STEEL, 'ch_plate', [1.15, 0.7, 1.1]));
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: ROBE_D, thighT: 'cloth', shin: ROBE_D, shinT: 'cloth', boot: LEATHER, cuff: LEATHER, w: 0.92 })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: ROBE_D, hipsT: 'ch_fold', belt: LEATHER_D, buckle: GOLD, skirt: ROBE, skirtLen: 0.5, skirtW: 0.26 }),
        chest: CHK.torso(B, { waist: ROBE_D, waistT: 'ch_fold', chest: ROBE, chestT: 'ch_fold', flat: true }).concat([
          P.box([0.06, 0.34, 0.03], [0, 0.23, 0.135], GOLD, 'gold', [0.1, 0, 0]),
          P.cyl([0.13, 0.17, 0.09, 8], [0, 0.42, -0.01], WHITE, 'fur'),
          P.gem(0.04, [0, 0.31, 0.16], LUCK, '!plain')
        ]),
        head: [
          P.tube([0.06, 0.07, 0.12, 6], [0, 0.05, 0], WHITE, 'fur'),
          P.ball(0.135, [0, 0.22, 0], FUR, 'fur', [1.0, 0.95, 1.05]),
          P.cone([0.075, 0.17, 6], [0, 0.17, 0.15], WHITE, 'fur', [Math.PI / 2, 0, 0]),
          P.knob(0.03, [0, 0.175, 0.235], 0x161616, 'plain'),
          P.knob(0.06, [0.075, 0.15, 0.07], WHITE, 'fur'), P.knob(0.06, [-0.075, 0.15, 0.07], WHITE, 'fur'),
          P.cone([0.065, 0.19, 4], [0.085, 0.37, -0.01], FUR, 'fur', [0, 0, -0.25]), P.cone([0.065, 0.19, 4], [-0.085, 0.37, -0.01], FUR, 'fur', [0, 0, 0.25]),
          P.cone([0.035, 0.1, 4], [0.083, 0.355, 0.015], 0x2a1a14, 'plain', [0, 0, -0.25]), P.cone([0.035, 0.1, 4], [-0.083, 0.355, 0.015], 0x2a1a14, 'plain', [0, 0, 0.25]),
          P.box([0.035, 0.03, 0.02], [0.055, 0.245, 0.128], 0x141414, 'plain'), P.box([0.035, 0.03, 0.02], [-0.055, 0.245, 0.128], 0x141414, 'plain'),
          P.p('torus', [0.04, 0.01, 3, 8], [0.055, 0.245, 0.14], GOLD, 'gold'), P.p('torus', [0.04, 0.01, 3, 8], [-0.055, 0.245, 0.14], GOLD, 'gold'),
          P.p('torus', [0.118, 0.016, 3, 10], [0, 0.31, -0.005], GOLD, 'gold', [Math.PI / 2, 0, 0]),
          P.gem(0.03, [0, 0.315, 0.12], LUCK, '!plain')
        ],
        foreR: CHK.held(B, 0, [
          P.tube([0.022, 0.022, 1.45, 6], [0, 0.18, 0], LEATHER, 'wood'),
          P.knob(0.03, [0, -0.55, 0], GOLD, 'gold'),
          P.cyl([0.045, 0.03, 0.08, 6], [0, 0.9, 0], GOLD, 'gold'),
          P.gem(0.085, [0, 1.03, 0], 0xff8a2a, '!plain'),
          P.cone([0.02, 0.12, 4], [0.055, 0.99, 0], GOLD, 'gold', [0, 0, -0.5]), P.cone([0.02, 0.12, 4], [-0.055, 0.99, 0], GOLD, 'gold', [0, 0, 0.5])
        ]),
        tail: [
          P.ball(0.11, [0, 0.03, -0.17], FUR, 'fur', [0.85, 0.85, 1.7], [-0.5, 0, 0]),
          P.ball(0.1, [0, 0.14, -0.36], FUR, 'fur', [0.9, 0.9, 1.3], [-0.9, 0, 0]),
          P.ball(0.075, [0, 0.23, -0.46], WHITE, 'fur', [1, 1, 1.2], [-1.1, 0, 0])
        ]
      });
  }
};

// ---- 骸骨骑士：越跑越快的骷髅骑士。细骨头、锈铁帽和锈肩甲、破披风、眼窝里的小火、骨棒 ----
CHD.skeleton = {
  body: { sh: 0.22 },
  make: function (B) {
    var P = CHP, BONE = 0xeee5c8, RUST = 0x9a5a34, RUST_D = 0x6a3e26, RAG = 0x7a2a26;
    var shin = [P.tube([0.036, 0.03, B.shin, 6], [0, -B.shin / 2, 0], BONE, 'bone'), P.box([0.09, 0.06, 0.2], [0, -B.shin - 0.05, 0.04], BONE, 'bone')];
    var upper = [P.tube([0.036, 0.03, B.upper, 6], [0, -B.upper / 2, 0], BONE, 'bone'), P.knob(0.045, [0, -B.upper, 0], BONE, 'bone'), P.knob(0.05, [0, 0, 0], BONE, 'bone')];
    var fore = [P.tube([0.032, 0.026, B.fore, 6], [0, -B.fore / 2, 0], BONE, 'bone'), P.box([0.075, 0.1, 0.07], [0, -B.fore - 0.05, 0.01], BONE, 'bone')];
    return {
      legL: [P.tube([0.04, 0.034, B.thigh, 6], [0, -B.thigh / 2, 0], BONE, 'bone'), P.knob(0.052, [0, -B.thigh, 0.01], BONE, 'bone')],
      legR: [P.tube([0.04, 0.034, B.thigh, 6], [0, -B.thigh / 2, 0], BONE, 'bone'), P.knob(0.052, [0, -B.thigh, 0.01], BONE, 'bone')],
      shinL: shin,
      shinR: shin.concat([P.tube([0.075, 0.062, 0.24, 8], [0, -0.14, 0], RUST, 'metal'), P.knob(0.07, [0, 0, 0.02], RUST_D, 'metal')]),
      armL: upper.concat([P.ball(0.15, [0.04, -0.02, 0], RUST, 'metal', [1.15, 0.8, 1.1]), P.knob(0.13, [0.06, -0.1, 0], RUST_D, 'metal', [1, 0.5, 1])]),
      foreL: fore,
      armR: upper,
      foreR: fore.concat([P.tube([0.07, 0.056, 0.16, 8], [0, -B.fore + 0.09, 0], RUST, 'metal')]).concat(CHK.held(B, 0.55, [
        P.tube([0.035, 0.035, 0.55, 6], [0, 0, 0.22], BONE, 'bone', [Math.PI / 2, 0, 0]),
        P.knob(0.06, [0.03, 0, 0.5], BONE, 'bone'), P.knob(0.06, [-0.03, 0, 0.5], BONE, 'bone')
      ])),
      chest: [
        P.tube([0.03, 0.03, 0.22, 6], [0, -0.01, -0.04], BONE, 'bone'),
        P.tbox([0.36, 0.26, 0.3, 0.24, 0.18], [0, 0.23, 0], BONE, 'ch_ribs'),
        P.box([0.42, 0.05, 0.12], [0, 0.39, -0.02], BONE, 'bone'),
        P.cyl([0.1, 0.13, 0.07, 8], [0, 0.43, 0], RUST, 'metal'),
        P.box([0.05, 0.5, 0.03], [0, 0.24, 0.12], RUST_D, 'ch_leather', [0.1, 0, 0.6])
      ],
      pelvis: [
        P.tbox([0.27, 0.2, 0.13, 0.17, 0.14], [0, -0.03, 0], BONE, 'bone'),
        P.box([0.3, 0.05, 0.2], [0, 0.04, 0], RUST_D, 'ch_leather'),
        P.box([0.16, 0.26, 0.02], [0, -0.1, 0.11], RAG, 'ch_fold', [-0.08, 0, 0])
      ],
      head: [
        P.tube([0.026, 0.026, 0.12, 5], [0, 0.05, 0], BONE, 'bone'),
        P.ball(0.125, [0, 0.235, 0.0], BONE, 'bone', [0.92, 1.0, 1.05]),
        P.box([0.15, 0.06, 0.13], [0, 0.125, 0.03], BONE, 'bone'),
        P.box([0.11, 0.015, 0.02], [0, 0.155, 0.098], 0x2a2420, 'plain'),
        P.box([0.05, 0.05, 0.03], [0.048, 0.23, 0.112], 0x15110f, 'plain'), P.box([0.05, 0.05, 0.03], [-0.048, 0.23, 0.112], 0x15110f, 'plain'),
        P.knob(0.015, [0.048, 0.228, 0.126], 0xffa640, '!plain'), P.knob(0.015, [-0.048, 0.228, 0.126], 0xffa640, '!plain'),
        P.box([0.025, 0.03, 0.02], [0, 0.185, 0.122], 0x2a2420, 'plain'),
        P.lathe([10, 0.0, 0.0, 0.2, 0.0, 0.2, 0.02, 0.14, 0.035, 0.135, 0.09, 0.09, 0.135, 0.0, 0.15], [0, 0.3, 0], RUST, 'metal', [0.12, 0, -0.1])
      ],
      cape: CHK.rags(RAG, 0.85, 0.42, 4)
    };
  }
};

// ---- 胸甲猛男：胸甲比头大。超大号肌肉胸甲（金边）、光着的粗胳膊、小圆盔 + 红鬃、皮条短裙 ----
CHD.chad = {
  body: { sh: 0.31, sy: 0.41, scale: 1.04 },
  armOut: 0.17,
  make: function (B) {
    var P = CHP, SK = 0xe3a777, CUIR = 0xd6dde6, PANTS = 0x2b3550, RED = 0xc2302f;
    var arm = function (side) {
      return [[
        P.ball(0.108, [side * 0.03, -0.02, 0], SK, 'skin', [1.05, 0.95, 1.05]),
        P.tube([0.086, 0.07, B.upper + 0.02, 8], [0, -B.upper / 2, 0], SK, 'skin'),
        P.ball(0.07, [0, -0.13, 0.035], SK, 'skin', [1, 1.35, 1]),
        P.knob(0.09, [0, -B.upper, -0.01], SK, 'skin')
      ], [
        P.tube([0.076, 0.058, B.fore, 8], [0, -B.fore / 2, 0], SK, 'skin'),
        P.tube([0.082, 0.076, 0.11, 8], [0, -B.fore + 0.04, 0], LEATHER, 'ch_leather'),
        P.box([0.118, 0.125, 0.13], [0, -B.fore - 0.06, 0.008], SK, 'skin')
      ]];
    };
    var al = arm(1), ar = arm(-1), strips = [], i;
    for (i = -1; i <= 1; i++) {
      strips.push(P.box([0.075, 0.2, 0.02], [i * 0.085, -0.1, 0.13], LEATHER, 'ch_leather', [-0.1, 0, 0]));
      strips.push(P.box([0.075, 0.2, 0.02], [i * 0.085, -0.1, -0.13], LEATHER, 'ch_leather', [0.1, 0, 0]));
    }
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: PANTS, thighT: 'cloth', knee: STEEL, shin: STEEL, boot: LEATHER, cuff: LEATHER, w: 1.18 })),
      {
        armL: al[0], foreL: al[1], armR: ar[0], foreR: ar[1],
        pelvis: CHK.hips(B, { hips: RED, hipsT: 'cloth', belt: LEATHER_D, buckle: GOLD, hw: 1.1 }).concat(strips),
        chest: [
          P.tbox([0.36, 0.33, 0.18, 0.24, 0.23], [0, 0.0, 0], CUIR, 'ch_plate'),
          P.tbox([0.72, 0.42, 0.38, 0.36, 0.26], [0, 0.24, -0.01], CUIR, 'ch_plate'),
          P.ball(0.13, [0.11, 0.3, 0.12], CUIR, 'ch_plate', [1.15, 0.85, 0.6]), P.ball(0.13, [-0.11, 0.3, 0.12], CUIR, 'ch_plate', [1.15, 0.85, 0.6]),
          P.box([0.08, 0.06, 0.04], [0.045, 0.145, 0.13], CUIR, 'ch_plate'), P.box([0.08, 0.06, 0.04], [-0.045, 0.145, 0.13], CUIR, 'ch_plate'),
          P.box([0.08, 0.06, 0.04], [0.045, 0.075, 0.122], CUIR, 'ch_plate'), P.box([0.08, 0.06, 0.04], [-0.045, 0.075, 0.122], CUIR, 'ch_plate'),
          P.box([0.75, 0.045, 0.375], [0, 0.43, -0.01], GOLD, 'gold'),
          P.box([0.44, 0.04, 0.3], [0, 0.05, -0.0], GOLD, 'gold'),
          P.tube([0.092, 0.1, 0.13, 8], [0, 0.45, 0], SK, 'skin')
        ],
        head: CHK.head(SK).concat([
          P.box([0.21, 0.075, 0.07], [0, 0.11, 0.075], SK, 'skin'),
          P.box([0.12, 0.035, 0.02], [0, 0.093, 0.112], 0x6a4428, 'fur'),
          P.lathe([10, 0.138, 0.0, 0.132, 0.05, 0.112, 0.1, 0.06, 0.135, 0.0, 0.145], [0, 0.27, -0.005], STEEL, 'ch_plate'),
          P.box([0.235, 0.025, 0.24], [0, 0.275, -0.005], GOLD, 'gold'),
          P.box([0.045, 0.13, 0.32], [0, 0.45, -0.02], RED, 'ch_fold'),
          P.box([0.045, 0.1, 0.13], [0, 0.39, -0.21], RED, 'ch_fold', [0.6, 0, 0])
        ])
      });
  }
};

// ---- 食人魔骑士：绿皮大块头。驼背、大下巴和獠牙、铁帽加骨角、毛皮披肩、铁胸板、双刃飞斧 ----
CHD.ogre = {
  body: { sh: 0.29, sy: 0.39, scale: 1.12 },
  hunch: 0.12, armOut: 0.15,
  make: function (B) {
    var P = CHP, GR = 0x7f9f48, GR_D = 0x5f7a34, IR = 0x5a6068, FURC = 0x8a7258;
    var arms = CHK.arms(B, { upper: GR, upperT: 'skin', fore: GR, foreT: 'skin', cuff: IR, cuffT: 'metal', hand: IR, handT: 'metal', w: 1.3 });
    arms.armR = arms.armR.concat([
      P.ball(0.16, [-0.05, 0.0, 0], IR, 'metal', [1.1, 0.8, 1.1]),
      P.cone([0.04, 0.15, 5], [-0.13, 0.08, 0], IR, 'metal', [0, 0, 0.9]), P.cone([0.04, 0.12, 5], [-0.06, 0.13, 0.04], IR, 'metal', [0, 0, 0.4])
    ]);
    arms.armL.push(P.ball(0.14, [0.04, -0.01, 0], FURC, 'fur', [1.1, 0.75, 1.1]));
    var blade = function (dir) { return P.tbox([0.035, 0.035, 0.26, 0.32, 0.1], [0, dir * 0.14, 0.62], IR, 'ch_plate', dir < 0 ? [Math.PI, 0, 0] : null); };
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: LEATHER, thighT: 'ch_leather', knee: IR, kneeT: 'metal', shin: GR, shinT: 'skin', boot: IR, bootT: 'metal', cuff: FURC, cuffT: 'fur', w: 1.22 })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: LEATHER_D, hipsT: 'ch_leather', belt: LEATHER, buckle: IR, skirt: LEATHER, skirtT: 'ch_leather', skirtLen: 0.3, skirtW: 0.28, hw: 1.15 }),
        chest: [
          P.tbox([0.34, 0.33, 0.18, 0.24, 0.24], [0, 0.0, 0], GR, 'skin'),
          P.tbox([0.62, 0.42, 0.36, 0.34, 0.3], [0, 0.22, -0.01], GR, 'skin'),
          P.ball(0.2, [0, 0.05, 0.07], GR, 'skin', [1.0, 0.85, 0.85]),
          P.tbox([0.5, 0.38, 0.26, 0.04, 0.04], [0, 0.27, 0.17], IR, 'metal', [0.12, 0, 0]),
          P.knob(0.022, [0.17, 0.36, 0.19], 0xb0b6be, 'metal'), P.knob(0.022, [-0.17, 0.36, 0.19], 0xb0b6be, 'metal'),
          P.box([0.07, 0.55, 0.03], [0.06, 0.2, 0.2], LEATHER, 'ch_leather', [0.1, 0, 0.55]),
          P.ball(0.21, [0, 0.41, -0.04], FURC, 'fur', [1.6, 0.6, 1.15])
        ],
        head: [
          P.tube([0.09, 0.1, 0.1, 6], [0, 0.03, 0.02], GR, 'skin'),
          P.box([0.26, 0.2, 0.25], [0, 0.2, 0.02], GR, 'skin'),
          P.box([0.28, 0.1, 0.24], [0, 0.09, 0.05], GR, 'skin'),
          P.box([0.27, 0.05, 0.07], [0, 0.255, 0.13], GR_D, 'skin'),
          P.box([0.05, 0.035, 0.02], [0.06, 0.222, 0.155], 0x1a120c, 'plain'), P.box([0.05, 0.035, 0.02], [-0.06, 0.222, 0.155], 0x1a120c, 'plain'),
          P.box([0.018, 0.018, 0.01], [0.055, 0.222, 0.166], 0xffd040, '!plain'), P.box([0.018, 0.018, 0.01], [-0.055, 0.222, 0.166], 0xffd040, '!plain'),
          P.cone([0.03, 0.1, 5], [0.08, 0.17, 0.155], 0xf4eedc, 'bone'), P.cone([0.03, 0.1, 5], [-0.08, 0.17, 0.155], 0xf4eedc, 'bone'),
          P.box([0.07, 0.05, 0.05], [0, 0.19, 0.16], GR_D, 'skin'),
          P.box([0.04, 0.07, 0.06], [0.145, 0.2, 0.0], GR, 'skin'), P.box([0.04, 0.07, 0.06], [-0.145, 0.2, 0.0], GR, 'skin'),
          P.lathe([10, 0.165, 0.0, 0.16, 0.06, 0.125, 0.12, 0.0, 0.15], [0, 0.26, 0.0], IR, 'metal'),
          P.cone([0.05, 0.17, 5], [0.16, 0.37, 0], 0xe8e0c8, 'bone', [0, 0, -0.9]), P.cone([0.05, 0.17, 5], [-0.16, 0.37, 0], 0xe8e0c8, 'bone', [0, 0, 0.9])
        ],
        foreR: CHK.held(B, 0.35, [
          P.tube([0.03, 0.03, 0.95, 6], [0, 0, 0.25], 0x6a4a2a, 'wood', [Math.PI / 2, 0, 0]),
          blade(1), blade(-1),
          P.box([0.06, 0.08, 0.1], [0, 0, 0.62], 0x3a3e44, 'metal')
        ])
      });
  }
};

// ---- 发条骑士：上了发条的铜骑士。铜皮圆桶胸、胸口大齿轮和发光核心、钟形头盔、背后一直转的发条钥匙、连弩 ----
CHD.robot = {
  capeSpin: 2.6,
  body: { cape: [0, 0.27, -0.2] },
  make: function (B) {
    var P = CHP, BR = 0xd09a3c, BR_D = 0x9a6a2a, CU = 0xc8693a, GL = 0x5ff0e0, PIPE = 0x8a8a92, i;
    var gear = [];
    for (i = 0; i < 6; i++) {
      var a = i / 6 * Math.PI * 2;
      gear.push(P.box([0.035, 0.035, 0.03], [Math.cos(a) * 0.115, 0.25 + Math.sin(a) * 0.115, 0.168], CU, 'metal', [0, 0, a]));
    }
    var arm = function (side) {
      return [[
        P.ball(0.12, [side * 0.03, -0.01, 0], BR, 'ch_plate', [1.1, 0.9, 1.1]),
        P.tube([0.05, 0.05, B.upper, 8], [0, -B.upper / 2, 0], PIPE, 'metal'),
        P.knob(0.09, [0, -B.upper, 0], CU, 'metal')
      ], [
        P.tube([0.075, 0.058, B.fore, 8], [0, -B.fore / 2, 0], BR, 'ch_plate'),
        P.box([0.1, 0.1, 0.1], [0, -B.fore - 0.05, 0.01], BR_D, 'ch_plate'),
        P.box([0.03, 0.08, 0.03], [0.035, -B.fore - 0.13, 0.04], PIPE, 'metal'), P.box([0.03, 0.08, 0.03], [-0.035, -B.fore - 0.13, 0.04], PIPE, 'metal')
      ]];
    };
    var al = arm(1), ar = arm(-1);
    var leg = [[
      P.knob(0.085, [0, 0, 0], CU, 'metal'),
      P.tube([0.062, 0.056, B.thigh, 8], [0, -B.thigh / 2, 0], BR, 'ch_plate'),
      P.knob(0.09, [0, -B.thigh, 0], CU, 'metal')
    ], [
      P.tube([0.075, 0.062, B.shin, 8], [0, -B.shin / 2, 0], BR, 'ch_plate'),
      P.tube([0.03, 0.03, B.shin * 0.8, 6], [0, -B.shin / 2, -0.075], PIPE, 'metal'),
      P.cyl([0.12, 0.13, 0.1, 10], [0, -B.shin - 0.03, 0.03], BR_D, 'ch_plate', null, [1, 1, 1.3])
    ]];
    return CHK.join(CHK.legs(leg), {
      armL: al[0], foreL: al[1], armR: ar[0],
      foreR: ar[1].concat(CHK.held(B, 0.15, [
        P.box([0.06, 0.07, 0.5], [0, 0.0, 0.12], 0x7a5230, 'wood'),
        P.box([0.62, 0.045, 0.05], [0, 0.0, 0.34], BR_D, 'ch_plate'),
        P.box([0.6, 0.008, 0.008], [0, 0.0, 0.31], 0xeeeeee, 'plain'),
        P.box([0.07, 0.12, 0.16], [0, 0.085, 0.16], BR, 'ch_plate')
      ])),
      pelvis: [
        P.cyl([0.17, 0.15, 0.17, 10], [0, -0.03, 0], BR_D, 'ch_plate', null, [1, 1, 0.75]),
        P.cyl([0.18, 0.18, 0.04, 10], [0, 0.05, 0], CU, 'metal', null, [1, 1, 0.75])
      ],
      chest: [
        P.tube([0.11, 0.11, 0.2, 8], [0, 0.0, 0], PIPE, 'metal'),
        P.cyl([0.28, 0.2, 0.36, 12], [0, 0.24, 0], BR, 'ch_plate', null, [1, 1, 0.75]),
        P.cyl([0.105, 0.105, 0.04, 10], [0, 0.25, 0.165], CU, 'metal', [Math.PI / 2, 0, 0]),
        P.cyl([0.05, 0.05, 0.03, 8], [0, 0.25, 0.188], GL, '!plain', [Math.PI / 2, 0, 0]),
        P.cyl([0.22, 0.24, 0.05, 12], [0, 0.42, 0], BR_D, 'ch_plate', null, [1, 1, 0.75])
      ].concat(gear),
      head: [
        P.tube([0.05, 0.05, 0.1, 6], [0, 0.04, 0], PIPE, 'metal'),
        P.lathe([10, 0.0, 0.0, 0.14, 0.0, 0.155, 0.04, 0.15, 0.16, 0.125, 0.25, 0.06, 0.29, 0.0, 0.3], [0, 0.08, 0], BR, 'ch_plate'),
        P.box([0.21, 0.036, 0.05], [0, 0.22, 0.135], GL, '!plain'),
        P.box([0.26, 0.02, 0.03], [0, 0.17, 0.148], BR_D, 'ch_plate'),
        P.tube([0.012, 0.012, 0.13, 4], [0, 0.43, 0], PIPE, 'metal'), P.knob(0.032, [0, 0.5, 0], 0xff5a3a, '!plain')
      ],
      // 发条钥匙（cape 骨骼一直绕 Z 轴转）
      cape: [
        P.tube([0.022, 0.022, 0.14, 6], [0, 0, -0.06], PIPE, 'metal', [Math.PI / 2, 0, 0]),
        P.knob(0.04, [0, 0, -0.14], BR_D, 'metal'),
        P.p('torus', [0.065, 0.022, 4, 8], [0.085, 0, -0.14], BR, 'gold'),
        P.p('torus', [0.065, 0.022, 4, 8], [-0.085, 0, -0.14], BR, 'gold')
      ]
    });
  }
};

// ---- 盾卫女骑士：金盔红羽。金色圆盔 + 护颊、前后一道红羽冠、长辫子、金胸甲白短裙、大圆盾和短矛、红短披风 ----
CHD.athena = {
  body: { sh: 0.215, hw: 0.105, upper: 0.29, fore: 0.26, thigh: 0.42, shin: 0.39, scale: 0.97 },
  make: function (B) {
    var P = CHP, SK = 0xeec2a0, G = 0xe6b93e, G_D = 0xb08a2a, RED = 0xc8282e, CREAM = 0xf0e6cc, HAIR = 0x8a4a2a;
    var arms = CHK.arms(B, { upper: SK, upperT: 'skin', fore: SK, foreT: 'skin', cuff: G, cuffT: 'gold', hand: SK, handT: 'skin', w: 0.85 });
    arms.armL.push(P.ball(0.105, [0.03, -0.01, 0], G, 'gold', [1.15, 0.75, 1.1]));
    arms.armR.push(P.ball(0.105, [-0.03, -0.01, 0], G, 'gold', [1.15, 0.75, 1.1]));
    var sy = -B.fore * 0.45;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: SK, thighT: 'skin', knee: G, kneeT: 'gold', shin: G, shinT: 'gold', boot: LEATHER, cuff: G, cuffT: 'gold', w: 0.86 })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: CREAM, hipsT: 'ch_fold', belt: G, beltT: 'gold', skirt: CREAM, skirtLen: 0.36, skirtW: 0.27, hw: 1.04 }),
        chest: [
          P.tbox([0.29, 0.27, 0.17, 0.19, 0.19], [0, 0.0, 0], CREAM, 'ch_fold'),
          P.tbox([0.45, 0.3, 0.33, 0.25, 0.2], [0, 0.235, -0.005], G, 'ch_plate'),
          P.knob(0.08, [0.065, 0.265, 0.085], G, 'ch_plate', [1, 0.9, 0.85]), P.knob(0.08, [-0.065, 0.265, 0.085], G, 'ch_plate', [1, 0.9, 0.85]),
          P.cyl([0.08, 0.12, 0.06, 8], [0, 0.42, 0], G, 'gold')
        ],
        head: CHK.head(SK).concat([
          P.lathe([10, 0.142, 0.0, 0.14, 0.07, 0.12, 0.13, 0.07, 0.17, 0.0, 0.18], [0, 0.255, -0.012], G, 'gold'),
          P.box([0.04, 0.15, 0.1], [0.102, 0.2, 0.06], G, 'gold'), P.box([0.04, 0.15, 0.1], [-0.102, 0.2, 0.06], G, 'gold'),
          P.box([0.22, 0.035, 0.05], [0, 0.275, 0.11], G_D, 'gold'),
          P.box([0.045, 0.13, 0.34], [0, 0.48, -0.03], RED, 'ch_fold'),
          P.box([0.045, 0.13, 0.16], [0, 0.41, -0.23], RED, 'ch_fold', [0.7, 0, 0]),
          P.box([0.03, 0.07, 0.06], [0, 0.43, 0.14], G, 'gold'),
          P.box([0.1, 0.34, 0.06], [0, 0.07, -0.13], HAIR, 'ch_fold', [0.18, 0, 0])
        ]),
        foreL: [
          P.cyl([0.34, 0.34, 0.05, 14], [0.095, sy, 0.02], G, 'gold', [0, 0, Math.PI / 2]),
          P.cyl([0.285, 0.285, 0.03, 14], [0.115, sy, 0.02], RED, 'ch_plate', [0, 0, Math.PI / 2]),
          P.p('torus', [0.17, 0.016, 4, 14], [0.13, sy, 0.02], G, 'gold', [0, Math.PI / 2, 0]),
          P.knob(0.07, [0.13, sy, 0.02], G, 'gold', [0.6, 1, 1])
        ],
        foreR: CHK.held(B, 0, [
          P.tube([0.018, 0.018, 1.7, 6], [0, 0.25, 0], 0x7a5232, 'wood'),
          P.cone([0.045, 0.22, 4], [0, 1.2, 0], G, 'gold'),
          P.knob(0.03, [0, 1.07, 0], G, 'gold')
        ]),
        cape: CHK.cape(RED, 0.75, 0.4, 0.5)
      });
  }
};

// ---- 游侠骑士：爱钱的弓箭手。绿兜帽和披肩、皮甲、斜背箭袋、腰上鼓鼓的钱袋、长弓 ----
CHD.archer = {
  make: function (B) {
    var P = CHP, GRN = 0x3d7a34, GRN_D = 0x2a5626, BRN = 0x6e4a2c;
    var q = [0.04, 0.24, -0.2], qa = 0.4, qx = -Math.sin(qa), qy = Math.cos(qa);
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: BRN, thighT: 'cloth', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 0.95 })),
      CHK.arms(B, { upper: GRN, upperT: 'ch_fold', fore: GRN, foreT: 'ch_fold', cuff: LEATHER, cuffT: 'ch_leather', hand: LEATHER_D }),
      {
        pelvis: CHK.hips(B, { hips: STEEL_D, belt: LEATHER_D, buckle: GOLD, skirt: GRN, skirtLen: 0.3 }).concat([
          P.ball(0.08, [0.16, -0.035, 0.075], 0xb08840, 'ch_leather', [1, 1.1, 0.9]),
          P.cyl([0.035, 0.035, 0.014, 8], [0.16, 0.05, 0.075], GOLD, 'gold'),
          P.cyl([0.035, 0.035, 0.014, 8], [0.13, 0.065, 0.09], GOLD, 'gold', [0.6, 0, 0.3])
        ]),
        chest: CHK.torso(B, { waist: STEEL_D, chest: LEATHER, chestT: 'ch_leather', flat: true }).concat([
          P.tbox([0.57, 0.5, 0.13, 0.35, 0.33], [0, 0.37, -0.005], GRN, 'ch_fold'),
          P.box([0.06, 0.56, 0.03], [0, 0.2, 0.14], LEATHER_D, 'ch_leather', [0.1, 0, -0.62]),
          // 箭袋 + 箭羽
          P.cyl([0.075, 0.07, 0.52, 8], q, LEATHER, 'ch_leather', [0, 0, qa]),
          P.box([0.03, 0.09, 0.05], [q[0] + qx * 0.3, q[1] + qy * 0.3, q[2] - 0.02], 0xf2f0e6, 'cloth', [0, 0, qa]),
          P.box([0.03, 0.09, 0.05], [q[0] + qx * 0.3 + 0.04, q[1] + qy * 0.3 - 0.02, q[2] + 0.02], 0xd8323a, 'cloth', [0, 0, qa]),
          P.box([0.03, 0.08, 0.05], [q[0] + qx * 0.29 - 0.035, q[1] + qy * 0.29, q[2] + 0.01], 0xf2f0e6, 'cloth', [0, 0, qa])
        ]),
        head: CHK.head(SKIN).concat([
          P.ball(0.162, [0, 0.25, -0.05], GRN, 'ch_fold', [1.0, 1.0, 0.95]),
          P.cone([0.12, 0.3, 6], [0, 0.43, -0.12], GRN, 'ch_fold', [-0.75, 0, 0]),
          P.cone([0.1, 0.26, 6], [0, 0.2, -0.22], GRN, 'ch_fold', [-2.1, 0, 0]),
          P.box([0.27, 0.05, 0.08], [0, 0.35, 0.07], GRN_D, 'ch_fold', [0.3, 0, 0]),
          P.box([0.035, 0.22, 0.11], [0.125, 0.22, 0.045], GRN_D, 'ch_fold'), P.box([0.035, 0.22, 0.11], [-0.125, 0.22, 0.045], GRN_D, 'ch_fold')
        ]),
        foreL: CHK.held(B, 0, [
          P.box([0.04, 0.13, 0.045], [0, 0, 0], LEATHER_D, 'ch_leather'),
          P.box([0.032, 0.56, 0.038], [0, 0.32, 0.06], 0x8a5a2a, 'wood', [-0.22, 0, 0]),
          P.box([0.032, 0.56, 0.038], [0, -0.32, 0.06], 0x8a5a2a, 'wood', [0.22, 0, 0]),
          P.box([0.006, 1.12, 0.006], [0, 0, -0.03], 0xf0f0e0, 'plain')
        ])
      });
  }
};

// ---- 猴子侍从：顶着铁锅当头盔的猴子。歪戴的铁锅加长锅柄、红黄侍从短袍、长胳膊、光脚、卷尾巴、香蕉 ----
CHD.monkey = {
  body: { sh: 0.23, thigh: 0.36, shin: 0.33, upper: 0.33, fore: 0.31, neck: 0.42 },
  hunch: 0.16, armOut: 0.04, tailLift: 0.45,
  make: function (B) {
    var P = CHP, FURC = 0x7a4e2e, FACE = 0xe2bb8c, POT = 0x4c5056, RED = 0xb8352c, YEL = 0xe8b830;
    return CHK.join(
      CHK.arms(B, { upper: FURC, upperT: 'fur', fore: FURC, foreT: 'fur', hand: FACE, handT: 'skin', w: 0.95 }),
      CHK.legs([
        [P.tube([0.095, 0.08, B.thigh + 0.05, 8], [0, -B.thigh / 2 + 0.02, 0], FURC, 'fur'), P.knob(0.09, [0, -B.thigh, 0.01], FURC, 'fur')],
        [P.tube([0.075, 0.06, B.shin, 8], [0, -B.shin / 2, 0], FURC, 'fur'), P.box([0.13, 0.07, 0.25], [0, -B.shin - 0.045, 0.06], FACE, 'skin')]
      ]),
      {
        pelvis: CHK.hips(B, { hips: RED, hipsT: 'cloth', belt: 0xc8a060, beltT: 'cloth', skirt: RED, skirtT: 'cloth', skirtLen: 0.22 }),
        chest: [
          P.tbox([0.31, 0.29, 0.18, 0.2, 0.2], [0, 0.0, 0], RED, 'cloth'),
          P.tbox([0.48, 0.32, 0.34, 0.27, 0.21], [0, 0.235, -0.005], RED, 'cloth'),
          P.box([0.12, 0.35, 0.03], [0, 0.22, 0.125], YEL, 'cloth', [0.1, 0, 0]),
          P.box([0.12, 0.35, 0.03], [0, 0.22, -0.125], YEL, 'cloth', [-0.1, 0, 0]),
          P.ball(0.13, [0, 0.39, -0.02], FURC, 'fur', [1.6, 0.5, 1.1])
        ],
        head: [
          P.tube([0.06, 0.07, 0.1, 6], [0, 0.04, 0], FURC, 'fur'),
          P.ball(0.14, [0, 0.21, -0.01], FURC, 'fur', [1.0, 0.95, 0.98]),
          P.ball(0.105, [0, 0.165, 0.08], FACE, 'skin', [1.0, 0.75, 0.78]),
          P.ball(0.085, [0, 0.245, 0.075], FACE, 'skin', [1.25, 0.65, 0.72]),
          P.box([0.035, 0.03, 0.02], [0.045, 0.25, 0.137], 0x161210, 'plain'), P.box([0.035, 0.03, 0.02], [-0.045, 0.25, 0.137], 0x161210, 'plain'),
          P.box([0.2, 0.03, 0.05], [0, 0.285, 0.115], 0x5e3a20, 'fur'),
          P.box([0.015, 0.012, 0.01], [0.016, 0.19, 0.163], 0x3a2418, 'plain'), P.box([0.015, 0.012, 0.01], [-0.016, 0.19, 0.163], 0x3a2418, 'plain'),
          P.box([0.08, 0.012, 0.01], [0, 0.135, 0.158], 0x5a3020, 'plain'),
          P.cyl([0.062, 0.062, 0.03, 8], [0.142, 0.22, 0], FACE, 'skin', [0, 0, Math.PI / 2]), P.cyl([0.062, 0.062, 0.03, 8], [-0.142, 0.22, 0], FACE, 'skin', [0, 0, Math.PI / 2]),
          // 歪戴的铁锅 + 长锅柄
          P.cyl([0.165, 0.152, 0.13, 12], [0.01, 0.37, -0.01], POT, 'metal', [0, 0, 0.14]),
          P.cyl([0.182, 0.182, 0.025, 12], [0.0, 0.305, -0.01], 0x3a3e44, 'metal', [0, 0, 0.14]),
          P.box([0.3, 0.035, 0.045], [-0.3, 0.29, -0.01], 0x2e2a26, 'wood', [0, 0, 0.32]),
          P.knob(0.02, [0.03, 0.44, -0.01], 0x3a3e44, 'metal')
        ],
        foreR: CHK.held(B, 0.3, [
          P.tube([0.03, 0.036, 0.15, 6], [0, 0.02, 0.06], YEL, 'plain', [Math.PI / 2 - 0.45, 0, 0]),
          P.tube([0.036, 0.028, 0.15, 6], [0, 0.07, 0.19], YEL, 'plain', [Math.PI / 2 + 0.35, 0, 0]),
          P.knob(0.02, [0, -0.025, -0.02], 0x5a4020, 'plain')
        ]),
        tail: [
          P.tube([0.032, 0.028, 0.3, 6], [0, 0.0, -0.15], FURC, 'fur', [Math.PI / 2 - 0.3, 0, 0]),
          P.tube([0.028, 0.024, 0.26, 6], [0, 0.17, -0.3], FURC, 'fur', [0.4, 0, 0]),
          P.tube([0.024, 0.02, 0.16, 6], [0, 0.32, -0.25], FURC, 'fur', [-0.9, 0, 0]),
          P.knob(0.03, [0, 0.37, -0.19], FURC, 'fur')
        ]
      });
  }
};

// ---- 闪电骑士：跑得飞快的蓝甲骑士。流线型蓝甲、往后掠的金色翼饰、胸口闪电、飘带围巾、靴子小翅膀、发光匕首 ----
CHD.tony = {
  make: function (B) {
    var P = CHP, BL = 0x2f62d6, BL_D = 0x1f3f8f, Y = 0xffd23a, DK = 0x161a28;
    var leg = CHK.leg(B, { thigh: BL, knee: Y, kneeT: 'gold', shin: BL, boot: BL_D, bootT: 'ch_plate', w: 0.95 });
    leg[1] = leg[1].concat([
      P.box([0.02, 0.06, 0.14], [0.085, -B.shin + 0.04, -0.05], Y, 'gold', [0.55, 0.2, 0]),
      P.box([0.02, 0.06, 0.14], [-0.085, -B.shin + 0.04, -0.05], Y, 'gold', [0.55, -0.2, 0]),
      P.box([0.03, 0.18, 0.02], [0, -0.2, 0.075], Y, 'gold', [0, 0, 0.35])
    ]);
    return CHK.join(
      CHK.legs(leg),
      CHK.arms(B, { upper: BL, pauldron: BL, pw: 0.92, elbow: Y, fore: BL, cuff: Y, cuffT: 'gold', hand: BL_D, handT: 'ch_plate' }),
      {
        pelvis: CHK.hips(B, { hips: BL_D, faulds: BL, buckle: Y }),
        chest: CHK.torso(B, { waist: BL_D, chest: BL, gorget: BL_D }).concat([
          P.box([0.05, 0.13, 0.03], [0.025, 0.31, 0.18], Y, '!gold', [0, 0, -0.5]),
          P.box([0.11, 0.035, 0.03], [0.0, 0.255, 0.182], Y, '!gold'),
          P.box([0.05, 0.13, 0.03], [-0.025, 0.2, 0.172], Y, '!gold', [0, 0, -0.5])
        ]),
        head: [
          P.tube([0.065, 0.075, 0.1, 8], [0, 0.04, 0], BL_D, 'ch_chain'),
          P.ball(0.15, [0, 0.235, 0.0], BL, 'ch_plate', [0.98, 1.05, 1.12]),
          P.box([0.22, 0.065, 0.06], [0, 0.23, 0.135], DK, 'plain'),
          P.box([0.17, 0.02, 0.02], [0, 0.235, 0.168], 0x8af0ff, '!plain'),
          P.box([0.022, 0.08, 0.26], [0.15, 0.3, -0.1], Y, 'gold', [0.35, 0.15, -0.25]),
          P.box([0.022, 0.08, 0.26], [-0.15, 0.3, -0.1], Y, 'gold', [0.35, -0.15, 0.25]),
          P.box([0.022, 0.055, 0.2], [0.152, 0.235, -0.13], Y, 'gold', [0.2, 0.15, -0.2]),
          P.box([0.022, 0.055, 0.2], [-0.152, 0.235, -0.13], Y, 'gold', [0.2, -0.15, 0.2]),
          P.box([0.03, 0.05, 0.32], [0, 0.39, -0.05], Y, 'gold', [0.25, 0, 0])
        ],
        foreR: CHK.held(B, 0.4, CHK.sword(0x7affd0, Y, DK, 0.34, 0.07, '!plain')),
        cape: [
          P.box([0.34, 0.08, 0.12], [0, 0.03, 0.05], Y, 'ch_fold'),
          P.box([0.13, 0.72, 0.02], [0.06, -0.37, -0.02], Y, 'ch_fold', [0, 0, 0.06]),
          P.box([0.11, 0.56, 0.02], [-0.07, -0.29, -0.03], 0xf0b820, 'ch_fold', [0, 0, -0.08])
        ]
      });
  }
};

// ---- 灌木骑士：伪装成灌木的弩手。浑身挂满一团团树叶、圆盔从叶子里露出眼缝、头顶小树枝、重弩 ----
CHD.bush = {
  make: function (B) {
    var P = CHP, L1 = 0x3f8a2e, L2 = 0x5aa83a, L3 = 0x2f6e26, CL = 0x5a5a3a;
    var leg = CHK.leg(B, { thigh: CL, thighT: 'cloth', knee: STEEL_D, shin: CL, shinT: 'cloth', boot: LEATHER_D });
    leg[0] = leg[0].concat([P.ico(0.12, [0.03, -0.12, 0.02], L1, 'leaf')]);
    var arms = CHK.arms(B, { upper: CL, upperT: 'cloth', fore: CL, foreT: 'cloth', cuff: LEATHER, cuffT: 'ch_leather', hand: LEATHER_D });
    arms.armL.push(P.ico(0.16, [0.05, 0.0, 0], L2, 'leaf'));
    arms.armR.push(P.ico(0.16, [-0.05, 0.0, 0], L1, 'leaf'));
    return CHK.join(CHK.legs(leg), arms, {
      pelvis: CHK.hips(B, { hips: CL, hipsT: 'cloth', belt: LEATHER_D }).concat([
        P.ico(0.17, [0.1, -0.06, -0.1], L2, 'leaf'), P.ico(0.16, [-0.1, -0.04, -0.11], L1, 'leaf'), P.ico(0.13, [0.12, -0.05, 0.08], L3, 'leaf')
      ]),
      chest: CHK.torso(B, { waist: CL, waistT: 'cloth', chest: CL, chestT: 'cloth', flat: true }).concat([
        P.ico(0.2, [0.12, 0.3, -0.12], L1, 'leaf'), P.ico(0.2, [-0.12, 0.28, -0.13], L3, 'leaf'), P.ico(0.17, [0.0, 0.12, -0.14], L2, 'leaf'),
        P.ico(0.16, [0.15, 0.32, 0.08], L2, 'leaf'), P.ico(0.15, [-0.14, 0.34, 0.06], L1, 'leaf'), P.ico(0.14, [0.0, 0.1, 0.1], L3, 'leaf')
      ]),
      head: [
        P.tube([0.065, 0.075, 0.1, 8], [0, 0.04, 0], STEEL_D, 'ch_chain'),
        P.lathe([10, 0.15, 0.0, 0.15, 0.1, 0.13, 0.2, 0.07, 0.26, 0.0, 0.27], [0, 0.1, 0], STEEL, 'ch_plate'),
        P.box([0.24, 0.03, 0.05], [0, 0.22, 0.135], 0x111111, 'plain'),
        P.ico(0.17, [0.05, 0.38, -0.02], L2, 'leaf'), P.ico(0.14, [-0.09, 0.36, 0.04], L1, 'leaf'), P.ico(0.12, [0.0, 0.46, -0.05], L3, 'leaf'),
        P.box([0.014, 0.14, 0.014], [0.09, 0.52, 0.0], 0x6a4a2a, 'wood', [0, 0, -0.4]),
        P.ico(0.04, [0.12, 0.58, 0.0], L2, 'leaf')
      ],
      foreR: CHK.held(B, 0.2, [
        P.box([0.07, 0.08, 0.62], [0, 0.0, 0.16], 0x5a3a20, 'wood'),
        P.box([0.72, 0.05, 0.06], [0, 0.02, 0.42], 0x6a4a2a, 'wood'),
        P.box([0.7, 0.008, 0.008], [0, 0.03, 0.38], 0xeeeeee, 'plain'),
        P.box([0.03, 0.03, 0.42], [0, 0.065, 0.3], STEEL, 'ch_plate')
      ])
    });
  }
};

// ---- 星界骑士：来自星空的骑士。深蓝甲、圆顶盔上十字星形的发光窥缝、新月盔饰、胸口的星、星空披风、手上的小黑洞 ----
CHD.spaceman = {
  make: function (B) {
    var P = CHP, NV = 0x262c66, NV_D = 0x181c44, SIL = 0xd6deea, STAR = 0xffe26a, VIO = 0x8a6aff;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: NV, knee: SIL, shin: NV, boot: SIL, bootT: 'ch_plate' })),
      CHK.arms(B, { upper: NV, pauldron: SIL, elbow: SIL, fore: NV, cuff: SIL, hand: NV_D, handT: 'ch_plate' }),
      {
        pelvis: CHK.hips(B, { hips: NV_D, faulds: NV, buckle: STAR }),
        chest: CHK.torso(B, { waist: NV_D, chest: NV, gorget: SIL }).concat([
          P.gem(0.065, [0, 0.27, 0.19], STAR, '!plain', null, [1, 1.5, 0.5]),
          P.gem(0.045, [0, 0.27, 0.19], STAR, '!plain', [0, 0, Math.PI / 4], [1.5, 1, 0.5])
        ]),
        head: [
          P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], NV_D, 'ch_chain'),
          P.lathe([10, 0.152, 0.0, 0.156, 0.12, 0.14, 0.22, 0.09, 0.3, 0.0, 0.33], [0, 0.08, 0], NV, 'ch_plate'),
          P.cyl([0.16, 0.16, 0.03, 10], [0, 0.31, 0], SIL, 'ch_plate'),
          P.box([0.22, 0.032, 0.05], [0, 0.245, 0.135], STAR, '!plain'),
          P.box([0.034, 0.15, 0.05], [0, 0.215, 0.138], STAR, '!plain'),
          P.p('ch_arc', [0.12, 0.032, 4, 10, Math.PI * 1.15], [0, 0.535, -0.01], STAR, '!gold', [0, 0, Math.PI * 0.925]),
          P.gem(0.035, [0, 0.43, -0.01], STAR, '!plain')
        ],
        foreR: CHK.held(B, 0, [
          P.ball(0.085, [0, -0.02, 0.13], 0x14082a, 'plain'),
          P.p('torus', [0.135, 0.012, 4, 14], [0, -0.02, 0.13], VIO, '!plain', [Math.PI / 2 - 0.3, 0, 0])
        ]),
        cape: CHK.cape(0xffffff, 1.0, 0.46, 0.66, 'ch_stars')
      });
  }
};

// ---- 强盗骑士：蒙面劫匪。黑眼罩 + 红面巾、宽檐帽、交叉弹带皮甲、背上鼓鼓的赃物袋、处刑大刀 ----
CHD.bandit = {
  make: function (B) {
    var P = CHP, BR = 0x6a3e26, BR_D = 0x40261a, MASK = 0x1a1a1e, BAN = 0xa3262c, SACK = 0xb8955a, BOOT = 0x2a1c14;
    var arms = CHK.arms(B, { upper: BR, upperT: 'ch_leather', fore: BR, foreT: 'ch_leather', cuff: LEATHER_D, cuffT: 'ch_leather', hand: BOOT });
    arms.armL.push(P.ball(0.11, [0.03, -0.01, 0], BR_D, 'ch_leather', [1.15, 0.75, 1.1]));
    arms.armR.push(P.ball(0.11, [-0.03, -0.01, 0], BR_D, 'ch_leather', [1.15, 0.75, 1.1]));
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: 0x3a3a44, thighT: 'cloth', shin: LEATHER_D, shinT: 'ch_leather', boot: BOOT, cuff: LEATHER })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: BR_D, hipsT: 'ch_leather', belt: BOOT, buckle: GOLD, skirt: BR, skirtT: 'ch_leather', skirtLen: 0.24 }),
        chest: CHK.torso(B, { waist: BR_D, waistT: 'ch_leather', chest: BR, chestT: 'ch_leather' }).concat([
          P.box([0.06, 0.6, 0.03], [0, 0.22, 0.16], BOOT, 'ch_leather', [0.1, 0, 0.6]),
          P.box([0.06, 0.6, 0.03], [0, 0.22, 0.164], BOOT, 'ch_leather', [0.1, 0, -0.6]),
          P.box([0.05, 0.42, 0.03], [0.13, 0.33, -0.05], BOOT, 'ch_leather', [0.4, 0, 0.1])
        ]),
        // 背上的赃物袋（滑铲时变成坐垫，背上的这个先藏起来）
        pack: [
          P.ball(0.21, [0.07, 0.3, -0.25], SACK, 'cloth', [1.0, 1.15, 0.85]),
          P.cyl([0.05, 0.085, 0.1, 6], [0.05, 0.53, -0.21], SACK, 'cloth'),
          P.cyl([0.045, 0.045, 0.014, 8], [0.08, 0.585, -0.2], GOLD, 'gold', [0.5, 0, 0.2])
        ],
        head: CHK.head(SKIN).concat([
          P.box([0.215, 0.06, 0.03], [0, 0.235, 0.11], MASK, 'plain'),
          P.box([0.03, 0.03, 0.06], [0.112, 0.235, 0.06], MASK, 'plain'), P.box([0.03, 0.03, 0.06], [-0.112, 0.235, 0.06], MASK, 'plain'),
          P.box([0.215, 0.1, 0.03], [0, 0.155, 0.112], BAN, 'cloth'),
          P.cone([0.07, 0.14, 4], [0, 0.085, 0.1], BAN, 'cloth', [Math.PI, Math.PI / 4, 0]),
          P.lathe([12, 0.0, 0.0, 0.27, 0.0, 0.27, 0.015, 0.13, 0.03, 0.12, 0.13, 0.0, 0.14], [0, 0.3, 0], 0x2a2420, 'ch_leather', [0.08, 0, 0.1]),
          P.cyl([0.126, 0.126, 0.03, 10], [0.002, 0.345, 0.004], BAN, 'cloth', [0.08, 0, 0.1])
        ]),
        foreR: CHK.held(B, 0.5, [
          P.box([0.04, 0.04, 0.2], [0, 0, 0.0], BOOT, 'ch_leather'),
          P.box([0.03, 0.2, 0.62], [0, 0.05, 0.42], 0xc8ccd8, 'ch_plate'),
          P.box([0.036, 0.05, 0.62], [0, -0.06, 0.42], 0x8a8e98, 'ch_plate'),
          P.box([0.06, 0.1, 0.04], [0, 0.0, 0.1], BR_D, 'ch_leather')
        ])
      });
  }
};

// ---- 影骑士：黑甲刺客。瘦长、黑色漆甲、斗笠形头盔、发光的眼缝、长长的红围巾、背后斜插的刀鞘、细剑 ----
CHD.ninja = {
  body: { sh: 0.23 },
  make: function (B) {
    var P = CHP, DK = 0x3c3c52, DK2 = 0x29293a, RED = 0xd8303c, EYE = 0xbff0ff;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: DK2, thighT: 'cloth', knee: DK, shin: DK, boot: DK2, w: 0.9 })),
      CHK.arms(B, { upper: DK2, upperT: 'cloth', pauldron: DK, pw: 0.85, fore: DK, cuff: DK, hand: DK2, w: 0.9 }),
      {
        pelvis: CHK.hips(B, { hips: DK2, hipsT: 'cloth', belt: RED, beltT: 'cloth', faulds: DK }),
        chest: CHK.torso(B, { waist: DK2, waistT: 'cloth', chest: DK, cw: 0.92 }).concat([
          P.box([0.05, 0.86, 0.04], [0.0, 0.2, -0.175], DK2, 'ch_leather', [0, 0, 0.8]),
          P.box([0.036, 0.2, 0.036], [-0.32, 0.48, -0.175], 0x8a2a2a, 'ch_leather', [0, 0, 0.8]),
          P.box([0.12, 0.025, 0.06], [-0.255, 0.425, -0.175], GOLD, 'gold', [0, 0, 0.8])
        ]),
        head: [
          P.tube([0.06, 0.07, 0.1, 6], [0, 0.04, 0], DK2, 'cloth'),
          P.ball(0.14, [0, 0.235, 0], DK2, 'cloth', [0.92, 1.05, 1.0]),
          P.box([0.2, 0.05, 0.05], [0, 0.245, 0.112], 0x0c0c10, 'plain'),
          P.box([0.045, 0.018, 0.02], [0.045, 0.245, 0.138], EYE, '!plain'), P.box([0.045, 0.018, 0.02], [-0.045, 0.245, 0.138], EYE, '!plain'),
          P.lathe([10, 0.2, 0.0, 0.19, 0.02, 0.13, 0.07, 0.0, 0.12], [0, 0.31, -0.01], DK, 'ch_plate'),
          P.box([0.27, 0.035, 0.24], [0, 0.31, -0.005], RED, 'cloth')
        ],
        foreR: CHK.held(B, 0.45, CHK.sword(0xe8f0ff, DK, RED, 0.72, 0.05)),
        cape: [
          P.box([0.36, 0.08, 0.12], [0, 0.04, 0.05], RED, 'cloth'),
          P.box([0.1, 0.88, 0.02], [0.05, -0.43, -0.02], RED, 'ch_fold', [0, 0, 0.05]),
          P.box([0.085, 0.72, 0.02], [-0.06, -0.35, -0.03], 0xb02030, 'ch_fold', [0, 0, -0.07])
        ]
      });
  }
};

// ---- 血骑士：看起来很坏的好人。暗红黑甲、苍白的脸和背头、尖刺红冠、蝙蝠翼尖肩甲、立起来的高领、长披风、血球 ----
CHD.vlad = {
  make: function (B) {
    var P = CHP, CR = 0x7a1626, CR_D = 0x4a0e18, BK = 0x1e1418, PALE = 0xeadde4, HAIR = 0x15121a, G = 0xd9a83a;
    var arms = CHK.arms(B, { upper: BK, upperT: 'cloth', pauldron: CR, elbow: CR, fore: CR, cuff: CR_D, hand: BK, handT: 'ch_plate' });
    [[arms.armL, 1], [arms.armR, -1]].forEach(function (q) {
      var s = q[1];
      q[0].push(P.cone([0.05, 0.24, 4], [s * 0.11, 0.1, -0.02], CR_D, 'ch_plate', [0, 0, -s * 0.75]));
      q[0].push(P.cone([0.045, 0.19, 4], [s * 0.05, 0.12, -0.07], CR_D, 'ch_plate', [-0.35, 0, -s * 0.3]));
    });
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: BK, thighT: 'cloth', knee: CR, shin: CR, boot: BK, bootT: 'ch_plate', toe: CR })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: BK, hipsT: 'ch_chain', belt: BK, buckle: G, faulds: CR, skirt: CR_D, skirtLen: 0.4 }),
        chest: CHK.torso(B, { waist: BK, waistT: 'ch_chain', chest: CR, gorget: BK }).concat([
          P.gem(0.04, [0, 0.27, 0.19], 0xff2a3a, '!plain', null, [1, 1.3, 0.6]),
          P.box([0.24, 0.34, 0.03], [0.12, 0.6, -0.12], CR_D, 'ch_fold', [-0.3, -0.3, -0.18]),
          P.box([0.24, 0.34, 0.03], [-0.12, 0.6, -0.12], CR_D, 'ch_fold', [-0.3, 0.3, 0.18])
        ]),
        head: CHK.head(PALE).concat([
          P.box([0.22, 0.08, 0.24], [0, 0.32, -0.01], HAIR, 'ch_fold'),
          P.box([0.2, 0.2, 0.06], [0, 0.24, -0.1], HAIR, 'ch_fold'),
          P.cone([0.04, 0.07, 4], [0, 0.3, 0.1], HAIR, 'ch_fold', [1.2, 0, 0]),
          P.cyl([0.126, 0.126, 0.04, 10], [0, 0.355, -0.005], CR, 'ch_plate'),
          P.cone([0.03, 0.13, 4], [0, 0.43, 0.11], CR, 'ch_plate'), P.cone([0.025, 0.1, 4], [0.08, 0.42, 0.08], CR, 'ch_plate'), P.cone([0.025, 0.1, 4], [-0.08, 0.42, 0.08], CR, 'ch_plate'),
          P.cone([0.025, 0.09, 4], [0.11, 0.41, -0.02], CR, 'ch_plate'), P.cone([0.025, 0.09, 4], [-0.11, 0.41, -0.02], CR, 'ch_plate'),
          P.gem(0.026, [0, 0.36, 0.13], 0xff2a3a, '!plain'),
          P.box([0.03, 0.018, 0.02], [0.04, 0.232, 0.121], 0xff3040, '!plain'), P.box([0.03, 0.018, 0.02], [-0.04, 0.232, 0.121], 0xff3040, '!plain')
        ]),
        foreR: CHK.held(B, 0, [
          P.ball(0.075, [0, -0.02, 0.13], 0xff2a3a, '!plain'),
          P.p('torus', [0.105, 0.011, 4, 12], [0, -0.02, 0.13], G, 'gold', [Math.PI / 2, 0, 0])
        ]),
        cape: CHK.cape(CR_D, 1.08, 0.5, 0.72)
      });
  }
};

// ---- 冰霜女骑士：冰晶王冠。淡蓝白甲、长长的白发、头顶一圈发光的冰晶、肩上冰棱、白披风、冰晶权杖 ----
CHD.noelle = {
  body: { sh: 0.215, hw: 0.105, upper: 0.29, fore: 0.26, thigh: 0.42, shin: 0.39, scale: 0.97 },
  make: function (B) {
    var P = CHP, IW = 0xdcefff, IB = 0x8fc6f0, ICE = 0xa8f0ff, HAIR = 0xe6f2ff, SK = 0xf1d6c8;
    var arms = CHK.arms(B, { upper: IB, pauldron: IW, pw: 0.85, fore: IW, cuff: IB, hand: IW, handT: 'ch_plate', w: 0.85 });
    arms.armL.push(P.gem(0.07, [0.08, 0.07, 0], ICE, '!plain', [0, 0, -0.5], [0.6, 1.7, 0.6]));
    arms.armR.push(P.gem(0.07, [-0.08, 0.07, 0], ICE, '!plain', [0, 0, 0.5], [0.6, 1.7, 0.6]));
    var spike = function (r, x, y, z, rz) { return P.gem(r, [x, y, z], ICE, '!plain', [0, 0, rz], [0.6, 1.9, 0.6]); };
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: IB, knee: IW, shin: IW, boot: IB, bootT: 'ch_plate', w: 0.88 })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: IB, hipsT: 'ch_chain', belt: IB, beltT: 'ch_plate', faulds: IW, skirt: 0xb8dcf8, skirtLen: 0.38, skirtW: 0.27 }),
        chest: CHK.torso(B, { waist: IB, waistT: 'ch_chain', chest: IW, cw: 0.9 }).concat([
          P.gem(0.045, [0, 0.27, 0.17], ICE, '!plain', null, [1, 1.3, 0.6])
        ]),
        head: CHK.head(SK).concat([
          P.box([0.22, 0.075, 0.23], [0, 0.325, -0.01], HAIR, 'ch_fold'),
          P.box([0.22, 0.46, 0.07], [0, 0.13, -0.1], HAIR, 'ch_fold', [0.08, 0, 0]),
          P.box([0.035, 0.24, 0.07], [0.112, 0.19, -0.015], HAIR, 'ch_fold'), P.box([0.035, 0.24, 0.07], [-0.112, 0.19, -0.015], HAIR, 'ch_fold'),
          P.cyl([0.126, 0.126, 0.03, 10], [0, 0.345, 0], IB, 'ch_plate'),
          spike(0.055, 0, 0.44, 0.09, 0), spike(0.042, 0.08, 0.42, 0.06, -0.3), spike(0.042, -0.08, 0.42, 0.06, 0.3),
          spike(0.036, 0.115, 0.4, -0.03, -0.5), spike(0.036, -0.115, 0.4, -0.03, 0.5), spike(0.03, 0, 0.41, -0.11, 0)
        ]),
        foreR: CHK.held(B, 0, [
          P.tube([0.016, 0.016, 0.95, 6], [0, 0.12, 0], IB, 'ch_plate'),
          P.gem(0.07, [0, 0.66, 0], ICE, '!plain', null, [0.7, 1.6, 0.7]),
          P.gem(0.035, [0.05, 0.6, 0], ICE, '!plain', [0, 0, -0.6], [0.6, 1.5, 0.6]), P.gem(0.035, [-0.05, 0.6, 0], ICE, '!plain', [0, 0, 0.6], [0.6, 1.5, 0.6]),
          P.gem(0.035, [0, -0.36, 0], ICE, '!plain')
        ]),
        cape: CHK.cape(0xe6f4ff, 1.0, 0.42, 0.62)
      });
  }
};

// ---- 瘟疫医生：鸟嘴面具的炼金骑士。宽檐高帽、白色长鸟嘴面具、绿光护目镜、黑长外套和短披肩、腰上的药瓶、毒瓶 ----
CHD.amog = {
  make: function (B) {
    var P = CHP, BK = 0x26262c, BK2 = 0x34343c, MASK = 0xe6dcc6, LENS = 0x7dff4a, G = 0xb8a070;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: BK2, thighT: 'cloth', shin: BK, shinT: 'ch_leather', boot: 0x1a1a1e, cuff: BK, w: 0.95 })),
      CHK.arms(B, { upper: BK2, upperT: 'ch_fold', fore: BK2, foreT: 'ch_fold', cuff: BK, cuffT: 'ch_leather', hand: 0x1c1c20 }),
      {
        pelvis: CHK.hips(B, { hips: BK2, hipsT: 'ch_fold', belt: 0x4a3020, buckle: G, skirt: BK2, skirtLen: 0.56, skirtW: 0.3 }).concat([
          P.cyl([0.026, 0.026, 0.09, 6], [0.13, 0.0, 0.112], 0xd8e8d0, 'plain'), P.knob(0.028, [0.13, 0.055, 0.112], LENS, '!plain'),
          P.cyl([0.026, 0.026, 0.09, 6], [0.07, 0.0, 0.126], 0xd8e8d0, 'plain'), P.knob(0.028, [0.07, 0.055, 0.126], 0xb04aff, '!plain'),
          P.box([0.12, 0.12, 0.07], [-0.15, -0.03, 0.07], 0x5a3a22, 'ch_leather')
        ]),
        chest: CHK.torso(B, { waist: BK2, waistT: 'ch_fold', chest: BK2, chestT: 'ch_fold', flat: true }).concat([
          P.tbox([0.6, 0.48, 0.16, 0.37, 0.33], [0, 0.35, -0.005], BK, 'ch_leather'),
          P.knob(0.016, [0, 0.24, 0.135], G, 'gold'), P.knob(0.016, [0, 0.16, 0.128], G, 'gold'), P.knob(0.016, [0, 0.08, 0.12], G, 'gold')
        ]),
        head: [
          P.tube([0.065, 0.075, 0.1, 6], [0, 0.04, 0], BK, 'ch_leather'),
          P.ball(0.135, [0, 0.22, -0.01], BK, 'ch_leather', [0.95, 1.0, 1.0]),
          P.ball(0.11, [0, 0.215, 0.06], MASK, 'ch_leather', [0.95, 0.95, 0.8]),
          P.cone([0.07, 0.32, 6], [0, 0.17, 0.26], MASK, 'ch_leather', [Math.PI / 2 + 0.35, 0, 0]),
          P.cyl([0.042, 0.042, 0.03, 8], [0.05, 0.25, 0.145], 0x3a3020, 'metal', [Math.PI / 2, 0, 0]), P.cyl([0.042, 0.042, 0.03, 8], [-0.05, 0.25, 0.145], 0x3a3020, 'metal', [Math.PI / 2, 0, 0]),
          P.cyl([0.03, 0.03, 0.02, 8], [0.05, 0.25, 0.158], LENS, '!plain', [Math.PI / 2, 0, 0]), P.cyl([0.03, 0.03, 0.02, 8], [-0.05, 0.25, 0.158], LENS, '!plain', [Math.PI / 2, 0, 0]),
          P.lathe([12, 0.0, 0.0, 0.29, 0.0, 0.29, 0.02, 0.13, 0.035, 0.12, 0.2, 0.0, 0.205], [0, 0.31, -0.01], 0x1c1c22, 'ch_leather', [-0.06, 0, 0]),
          P.cyl([0.126, 0.126, 0.035, 10], [0, 0.37, -0.005], 0x5a2a6a, 'cloth', [-0.06, 0, 0])
        ],
        foreR: CHK.held(B, 0, [
          P.ball(0.072, [0, -0.02, 0.1], LENS, '!plain'),
          P.tube([0.02, 0.026, 0.08, 6], [0, 0.07, 0.1], 0xd8e8d0, 'plain'),
          P.knob(0.022, [0, 0.115, 0.1], 0x6a4a2a, 'wood')
        ])
      });
  }
};

// ---- 骰子骑士：赌徒。骰子形状的方盔（白底红点、黑窥缝、红黑羽饰）、红黑格子罩袍、金边、白手套、手里捏着一颗骰子 ----
CHD.dicehead = {
  make: function (B) {
    var P = CHP, RD = 0xb3202c, BK = 0x22222a, ST = 0x4a505c;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: BK, thighT: 'cloth', knee: ST, shin: ST, boot: BK, bootT: 'ch_plate' })),
      CHK.arms(B, { upper: BK, upperT: 'cloth', pauldron: ST, elbow: GOLD, fore: ST, cuff: GOLD, cuffT: 'gold', hand: 0xf2efe6, handT: 'cloth' }),
      {
        pelvis: CHK.hips(B, { hips: BK, hipsT: 'cloth', belt: BK, buckle: GOLD, skirt: RD, skirtB: BK, skirtLen: 0.34 }),
        chest: CHK.torso(B, { waist: BK, waistT: 'cloth', chest: RD, chestT: 'ch_fold', gorget: GOLD, flat: true }).concat([
          P.box([0.13, 0.13, 0.03], [0, 0.25, 0.133], BK, 'cloth', [0.1, 0, Math.PI / 4]),
          P.box([0.065, 0.065, 0.03], [0, 0.25, 0.142], GOLD, 'gold', [0.1, 0, Math.PI / 4]),
          P.box([0.09, 0.09, 0.03], [0.17, 0.1, 0.122], BK, 'cloth', [0.1, 0, Math.PI / 4]),
          P.box([0.09, 0.09, 0.03], [-0.17, 0.1, 0.122], BK, 'cloth', [0.1, 0, Math.PI / 4])
        ]),
        head: [
          P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], BK, 'ch_chain'),
          P.box([0.29, 0.29, 0.29], [0, 0.245, 0], 0xffffff, 'ch_dice'),
          P.box([0.24, 0.03, 0.03], [0, 0.205, 0.145], 0x111114, 'plain'),
          P.box([0.3, 0.025, 0.3], [0, 0.1, 0], GOLD, 'gold'),
          P.cyl([0.04, 0.05, 0.05, 6], [0, 0.41, 0], GOLD, 'gold'),
          P.box([0.05, 0.16, 0.12], [0, 0.48, 0.0], RD, 'ch_feather', [-0.3, 0, 0]),
          P.box([0.05, 0.15, 0.12], [0, 0.46, -0.1], BK, 'ch_feather', [0.5, 0, 0])
        ],
        foreR: CHK.held(B, 0, [P.box([0.11, 0.11, 0.11], [0, -0.03, 0.1], 0xffffff, 'ch_dice', [0.4, 0.5, 0.2])]),
        cape: CHK.cape(0x8a1a24, 0.7, 0.42, 0.5)
      });
  }
};

// ---- 黑骑士：被诅咒的黑甲骑士。黑色尖刺甲、大弯角头盔、紫光眼缝和紫色裂纹、破烂紫披风、紫光腐化大剑 ----
CHD.darkknight = {
  body: { sh: 0.27 },
  make: function (B) {
    var P = CHP, BK = 0x2a2633, BK2 = 0x1a1720, PU = 0xb44aff, PU_D = 0x5a2a7a, HORN = 0xd8d0c0;
    var leg = CHK.leg(B, { thigh: BK, knee: BK2, shin: BK, boot: BK2, bootT: 'ch_plate', toe: BK, w: 1.06 });
    leg[1] = leg[1].concat([P.box([0.02, 0.2, 0.02], [0, -0.17, 0.078], PU, '!plain')]);
    var arms = CHK.arms(B, { upper: BK2, pauldron: BK, pw: 1.15, elbow: BK, fore: BK, cuff: BK2, hand: BK2, handT: 'ch_plate', w: 1.05 });
    [[arms.armL, 1], [arms.armR, -1]].forEach(function (q) {
      var s = q[1];
      q[0].push(P.cone([0.045, 0.2, 4], [s * 0.1, 0.1, 0.03], BK2, 'ch_plate', [0, 0, -s * 0.5]));
      q[0].push(P.cone([0.04, 0.17, 4], [s * 0.13, 0.06, -0.06], BK2, 'ch_plate', [-0.3, 0, -s * 0.7]));
    });
    var horn = function (s) {
      return [
        P.tube([0.034, 0.052, 0.2, 6], [s * 0.239, 0.375, 0.02], HORN, 'bone', [0, 0, -s * 1.1]),
        P.cone([0.034, 0.2, 6], [s * 0.34, 0.5, 0.02], HORN, 'bone', [0, 0, -s * 0.25])
      ];
    };
    return CHK.join(CHK.legs(leg), arms, {
      pelvis: CHK.hips(B, { hips: BK2, faulds: BK, buckle: PU_D, skirt: PU_D, skirtLen: 0.36 }),
      chest: CHK.torso(B, { waist: BK2, chest: BK, gorget: BK2 }).concat([
        P.box([0.02, 0.14, 0.02], [0.05, 0.27, 0.183], PU, '!plain', [0, 0, 0.4]),
        P.box([0.02, 0.1, 0.02], [0.02, 0.17, 0.168], PU, '!plain', [0, 0, -0.5]),
        P.box([0.02, 0.09, 0.02], [-0.06, 0.3, 0.178], PU, '!plain', [0, 0, -0.3]),
        P.gem(0.035, [0, 0.27, 0.19], PU, '!plain')
      ]),
      head: [
        P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], BK2, 'ch_chain'),
        P.cyl([0.15, 0.16, 0.3, 10], [0, 0.23, 0], BK, 'ch_plate'),
        P.lathe([10, 0.15, 0.0, 0.11, 0.05, 0.0, 0.07], [0, 0.38, 0], BK, 'ch_plate'),
        P.box([0.24, 0.03, 0.04], [0, 0.26, 0.145], PU, '!plain'),
        P.box([0.03, 0.12, 0.035], [0, 0.18, 0.152], BK2, 'ch_plate')
      ].concat(horn(1), horn(-1)),
      gearR: CHK.held(B, 0.55, CHK.sword(0x2a2238, BK2, LEATHER_D, 1.0, 0.11).concat([
        P.box([0.03, 0.016, 0.85], [0, 0, 0.55], PU, '!plain')
      ])),
      cape: CHK.rags(PU_D, 1.0, 0.52, 5)
    });
  }
};

// ---- 鹰骑士：会飘的狮鹫骑士。鹰头（白羽毛、黄弯喙、怒眉）、蓝色羽冠、银甲、背后收起的大翅膀、鸟爪 ----
CHD.bird = {
  make: function (B) {
    var P = CHP, BL = 0x4e9ee8, BL_D = 0x2f6eb8, WH = 0xf2f4f8, BEAK = 0xffb428, SIL = 0xc9d4e2;
    var leg = CHK.leg(B, { thigh: SIL, knee: GOLD, kneeT: 'gold', shin: BL, w: 0.95 });
    var s = B.shin;
    leg[1] = [
      P.tube([0.08, 0.05, s, 8], [0, -s / 2, 0], BL, 'ch_feather'),
      P.box([0.04, 0.05, 0.2], [0, -s - 0.055, 0.08], BEAK, 'skin'),
      P.box([0.04, 0.05, 0.18], [0.05, -s - 0.055, 0.06], BEAK, 'skin', [0, 0.35, 0]),
      P.box([0.04, 0.05, 0.18], [-0.05, -s - 0.055, 0.06], BEAK, 'skin', [0, -0.35, 0]),
      P.box([0.04, 0.05, 0.1], [0, -s - 0.055, -0.06], BEAK, 'skin'),
      P.cone([0.018, 0.05, 4], [0, -s - 0.06, 0.2], 0x2a2a2a, 'plain', [Math.PI / 2, 0, 0])
    ];
    var wing = function (k) {
      return [
        P.tbox([0.3, 0.1, 0.72, 0.05, 0.03], [k * 0.19, -0.16, -0.05], BL, 'ch_feather', [0.2, 0, k * 0.32]),
        P.tbox([0.24, 0.08, 0.56, 0.04, 0.025], [k * 0.25, -0.3, -0.075], WH, 'ch_feather', [0.25, 0, k * 0.45]),
        P.tbox([0.2, 0.06, 0.46, 0.04, 0.02], [k * 0.29, -0.42, -0.1], BL_D, 'ch_feather', [0.3, 0, k * 0.58])
      ];
    };
    return CHK.join(CHK.legs(leg),
      CHK.arms(B, { upper: BL, upperT: 'ch_feather', pauldron: SIL, elbow: GOLD, fore: SIL, cuff: GOLD, cuffT: 'gold', hand: BEAK, handT: 'skin' }),
      {
        pelvis: CHK.hips(B, { hips: BL_D, faulds: SIL, buckle: GOLD, skirt: BL, skirtT: 'ch_feather', skirtLen: 0.3 }),
        chest: CHK.torso(B, { waist: BL_D, chest: SIL, gorget: GOLD }).concat([
          P.tbox([0.2, 0.04, 0.1, 0.03, 0.03], [0, 0.29, 0.185], GOLD, 'gold'),
          P.knob(0.03, [0, 0.27, 0.19], BL, 'ch_plate')
        ]),
        head: [
          P.tube([0.07, 0.085, 0.12, 8], [0, 0.04, 0], WH, 'ch_feather'),
          P.ball(0.14, [0, 0.23, 0.0], WH, 'ch_feather', [0.95, 1.0, 1.1]),
          P.cone([0.062, 0.17, 6], [0, 0.205, 0.17], BEAK, 'skin', [Math.PI / 2 + 0.25, 0, 0]),
          P.cone([0.032, 0.08, 5], [0, 0.155, 0.238], BEAK, 'skin', [Math.PI + 0.3, 0, 0]),
          P.box([0.03, 0.036, 0.02], [0.065, 0.255, 0.122], 0x111111, 'plain'), P.box([0.03, 0.036, 0.02], [-0.065, 0.255, 0.122], 0x111111, 'plain'),
          P.box([0.065, 0.022, 0.03], [0.065, 0.282, 0.122], BL_D, 'ch_feather', [0, 0, -0.3]), P.box([0.065, 0.022, 0.03], [-0.065, 0.282, 0.122], BL_D, 'ch_feather', [0, 0, 0.3]),
          P.box([0.045, 0.055, 0.24], [0, 0.33, -0.16], BL, 'ch_feather', [0.5, 0, 0]),
          P.box([0.035, 0.045, 0.21], [0.05, 0.28, -0.17], BL_D, 'ch_feather', [0.3, 0.2, 0]),
          P.box([0.035, 0.045, 0.21], [-0.05, 0.28, -0.17], BL_D, 'ch_feather', [0.3, -0.2, 0]),
          P.p('torus', [0.135, 0.014, 4, 12], [0, 0.29, -0.01], GOLD, 'gold', [Math.PI / 2 + 0.2, 0, 0])
        ],
        cape: wing(1).concat(wing(-1))
      });
  }
};

// ---- 幽灵骑士：囤积癖幽灵。没有腿、飘着、下半身是一缕烟尾、黑洞洞面甲里两点青光、背上绑着宝箱、长柄镰刀 ----
CHD.ghost = {
  float: 0.18,
  body: { tail: [0, -0.05, 0] },
  make: function (B) {
    var P = CHP, GH = 0xcfe2ff, GH_D = 0x8faad6, EYE = 0x5affd9, WOOD = 0x7a4e2a;
    return CHK.join(
      CHK.arms(B, { upper: GH_D, upperT: 'ch_fold', pauldron: GH, fore: GH, cuff: GH_D, hand: GH, handT: 'ch_plate' }),
      {
        pelvis: CHK.hips(B, { hips: GH_D, hipsT: 'ch_fold', belt: LEATHER_D, buckle: GOLD }),
        chest: CHK.torso(B, { waist: GH_D, waistT: 'ch_fold', chest: GH, gorget: GH_D }).concat([
          P.box([0.05, 0.42, 0.03], [0.14, 0.27, 0.0], LEATHER, 'ch_leather', [0, 0, 0]),
          P.box([0.05, 0.42, 0.03], [-0.14, 0.27, 0.0], LEATHER, 'ch_leather', [0, 0, 0])
        ]),
        // 背上的宝箱（滑铲时放到身下坐着，背上的先藏起来）
        pack: [
          P.box([0.42, 0.26, 0.24], [0, 0.2, -0.29], WOOD, 'wood'),
          P.cyl([0.12, 0.12, 0.42, 8], [0, 0.33, -0.29], WOOD, 'wood', [0, 0, Math.PI / 2]),
          P.box([0.44, 0.045, 0.26], [0, 0.2, -0.29], GOLD, 'gold'),
          P.box([0.045, 0.3, 0.26], [0.12, 0.25, -0.29], GOLD, 'gold'), P.box([0.045, 0.3, 0.26], [-0.12, 0.25, -0.29], GOLD, 'gold'),
          P.box([0.07, 0.09, 0.03], [0, 0.25, -0.42], GOLD, 'gold'),
          P.cyl([0.05, 0.05, 0.015, 8], [0.06, 0.46, -0.27], GOLD, 'gold', [0.5, 0, 0]),
          P.cyl([0.045, 0.045, 0.015, 8], [-0.08, 0.45, -0.3], GOLD, 'gold', [-0.4, 0, 0.3])
        ],
        head: [
          P.tube([0.06, 0.07, 0.1, 6], [0, 0.04, 0], GH_D, 'ch_chain'),
          P.cyl([0.145, 0.155, 0.28, 10], [0, 0.22, 0], GH, 'ch_plate'),
          P.lathe([10, 0.145, 0.0, 0.11, 0.06, 0.0, 0.08], [0, 0.36, 0], GH, 'ch_plate'),
          P.box([0.2, 0.09, 0.04], [0, 0.24, 0.138], 0x14182a, 'plain'),
          P.knob(0.026, [0.045, 0.245, 0.158], EYE, '!plain'), P.knob(0.026, [-0.045, 0.245, 0.158], EYE, '!plain'),
          P.cone([0.06, 0.22, 5], [0, 0.5, -0.04], GH_D, 'ch_fold', [-0.45, 0, 0])
        ],
        foreR: CHK.held(B, 0, [
          P.tube([0.02, 0.022, 1.55, 6], [0, 0.25, 0], 0x5a4632, 'wood'),
          P.tbox([0.02, 0.02, 0.52, 0.03, 0.15], [0, 0.98, 0.24], 0xd8e2ee, 'ch_plate', [Math.PI / 2 + 0.25, 0, 0]),
          P.box([0.035, 0.07, 0.07], [0, 0.99, 0.0], GOLD, 'gold')
        ]),
        tail: [
          P.tbox([0.34, 0.22, 0.32, 0.24, 0.17], [0, -0.16, 0], GH, 'ch_fold'),
          P.tbox([0.22, 0.09, 0.32, 0.17, 0.08], [0, -0.44, -0.04], GH, 'ch_fold', [0.25, 0, 0]),
          P.cone([0.065, 0.26, 5], [0, -0.69, -0.13], GH_D, 'ch_fold', [Math.PI + 0.5, 0, 0])
        ]
      });
  }
};
