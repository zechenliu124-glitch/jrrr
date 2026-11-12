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
  // 以下新贴图不用共享的随机数 r()（前面所有贴图的像素保持不变），用自己的整数哈希
  var hash = function (x, y) { return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000 / 1000; };
  // 星图布（彩色）：藏青底 + 金色星座连线和星点（占星骑士的袍子和尖帽）
  var cs = (function () {
    var g = new Uint8Array(256), lines = [[1, 2, 5, 4], [5, 4, 8, 6], [8, 6, 7, 10], [10, 11, 14, 9], [14, 9, 12, 14], [3, 9, 1, 13]];
    lines.forEach(function (l) {
      var n = Math.max(Math.abs(l[2] - l[0]), Math.abs(l[3] - l[1]));
      for (var i = 0; i <= n; i++) g[Math.round(l[1] + (l[3] - l[1]) * i / n) * 16 + Math.round(l[0] + (l[2] - l[0]) * i / n)] = 1;
    });
    [[1, 2], [5, 4], [8, 6], [7, 10], [10, 11], [14, 9], [12, 14], [3, 9], [1, 13]].forEach(function (p) { g[p[1] * 16 + p[0]] = 2; });
    return g;
  })();
  add('ch_constel', function (x, y) {
    var k = cs[y * 16 + x];
    if (k === 2) return [255, 236, 140];
    if (k === 1) return [196, 160, 72];
    var v = 0.9 + hash(x, y) * 0.16;
    return [40 * v, 50 * v, 112 * v];
  });
  // 骑枪的红白螺旋条纹（彩色；圆锥上斜着贴就是螺旋）
  add('ch_spiral', function (x, y) {
    var red = ((x + y) >> 2) & 1, edge = (x + y) % 4 === 3;
    var v = edge ? 0.86 : 1;
    return red ? [214 * v, 48 * v, 56 * v] : [246 * v, 242 * v, 232 * v];
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
  // 标成后加的零件（见 CHAR_MODELS.quietGeo）
  late: function (q) { q = q.slice(); while (q.length < 8) q.push(null); q[8] = 1; return q; },
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
    var g = p[8] === 1 ? CHAR_MODELS.quietGeo(p) : MODEL.geo(p[0], p[1]);
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

// 后加的零件（第 9 项 = 1，CHP.late）：three.js 给每个几何体一个随机 uuid（Math.random），
// 这些零件的几何体用自己的随机数建，不挪动游戏的随机数序列（种子世界不变）
CHAR_MODELS.quietGeo = function (p) {
  var mr = Math.random, h = 54321;
  Math.random = function () { h = (h * 16807) % 2147483647; return h / 2147483647; };
  try { var g = MODEL.geo(p[0], p[1]); return g.index ? g.toNonIndexed() : g; } finally { Math.random = mr; }
};
// 把一个角色的所有零件合成一个带骨骼权重的几何体（每个角色只建一次）
CHAR_MODELS.makeGeo = function (id) {
  var d = CHAR_MODELS.defs[id] || CHAR_MODELS.defs.bannerman;
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
  if (!CHAR_MODELS.defs[id]) id = 'bannerman';
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
// 姿势通道（弧度/米）；地面（待机+跑步）、空中、滑铲三种姿势按权重混合
var CHA = { PY: 0, PRX: 1, PRY: 2, CRX: 3, CRY: 4, CRZ: 5, HRX: 6, HRY: 7, ALX: 8, ALZ: 9, FLX: 10, FLZ: 11, ARX: 12, ARZ: 13, FRX: 14, FRZ: 15,
  LLX: 16, LLZ: 17, SLX: 18, LRX: 19, LRZ: 20, SRX: 21, KX: 22, TX: 23, TY: 24, N: 25 };
CHA.o = new Float32Array(CHA.N);
CHA.a = new Float32Array(CHA.N);
CHA.s = new Float32Array(CHA.N);
CHAR_MODELS.idlePose = { t: 0, run: 0, phase: 0, air: 0, vy: 0, slide: 0, land: 0 };

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

// a: { t 时间, run 跑步权重 0~1, phase 步伐相位, air 空中权重, vy 竖直速度, slide 滑铲权重, land 落地下蹲 0~1 }
// 坐骑（rides.js 写入，都可以不写）：ride 坐骑姿势权重 0~1, rideDef 坐骑定义（stance / goofy / pose / poseFn）, ridePY 骨盆高度,
//   flip 翻板进度 0~1, dive 俯冲权重, hs 水平速度, kick 蹬地相位 0~1, kickW 蹬地权重（坐骑的 poseFn 用）
CHAR_MODELS.pose = function (g, a) {
  var u = g.userData, b = u.bones, d = u.def, C = CHA, o = C.o, A = C.a, S = C.s, i;
  var t = a.t, k = a.run, idle = 1 - k, s = Math.sin(a.phase), c = Math.cos(a.phase);
  var br = Math.sin(t * 2.1), ld = a.land, out = d.armOut || 0, hunch = d.hunch || 0;
  var rw = a.ride > 0.001 && a.rideDef ? a.ride : 0, rd = rw ? a.rideDef : null;
  // 骑士自己的手臂设定：swingL / swingR 跑步摆臂倍数（扛着长杆的那只手少摆），默认 1
  var swL = d.swingL === undefined ? 1 : d.swingL, swR = d.swingR === undefined ? 1 : d.swingR, hk;
  // ---- 地面：待机呼吸 + 跑步 ----
  var sway = Math.sin(t * 0.7) * 0.5 + 0.5;   // 待机时慢慢换重心
  o[C.PY] = idle * (0.006 * br - 0.012) + k * (0.05 * Math.abs(s) - 0.035) - 0.12 * ld;
  o[C.PRX] = 0; o[C.PRY] = -0.07 * k * s + idle * 0.06;
  o[C.CRX] = hunch + idle * (0.018 * br - 0.03) + k * 0.13 + 0.14 * ld;
  o[C.CRY] = 0.1 * k * s - idle * 0.08; o[C.CRZ] = idle * (0.02 + 0.02 * sway);
  o[C.HRX] = -0.6 * (o[C.CRX] - hunch * 0.3); o[C.HRY] = idle * (0.1 + 0.14 * Math.sin(t * 0.55));
  o[C.ALX] = 0.55 * k * s * swL + idle * (0.03 * br - 0.05); o[C.ALZ] = 0.12 + out + 0.05 * k + idle * 0.02 * br;
  o[C.FLX] = -(0.16 + 0.85 * k) - 0.3 * k * Math.max(0, -s) * swL - idle * 0.18; o[C.FLZ] = 0;
  o[C.ARX] = -0.55 * k * s * swR + idle * (0.03 * br - 0.2); o[C.ARZ] = -(0.12 + out + 0.05 * k + idle * 0.02 * br);
  o[C.FRX] = -(0.16 + 0.85 * k) - 0.3 * k * Math.max(0, s) * swR - idle * 0.3; o[C.FRZ] = 0;
  o[C.LLX] = -0.62 * k * s - 0.3 * ld + idle * 0.04; o[C.LLZ] = idle * (0.07 + 0.03 * sway);
  o[C.SLX] = k * (0.12 + 1.05 * Math.max(0, c)) + 0.55 * ld + idle * 0.06;
  o[C.LRX] = 0.62 * k * s - 0.3 * ld - idle * 0.06; o[C.LRZ] = -idle * (0.1 - 0.03 * sway);
  o[C.SRX] = k * (0.12 + 1.05 * Math.max(0, -c)) + 0.55 * ld + idle * 0.1;
  o[C.KX] = 0.08 + 0.55 * k + 0.07 * k * Math.sin(a.phase * 2) + idle * 0.02 * br;
  o[C.TX] = (d.tailLift || 0.2) + 0.35 * k; o[C.TY] = idle * 0.3 * Math.sin(t * 2.4) + 0.25 * k * s;
  // holdL / holdR：地面姿势上再加的固定角度（比如小臂抬起来托着鹰、举着灯杆）；空中、坐骑、滑铲姿势照旧盖过它
  if (d.holdL) for (hk in d.holdL) if (C[hk] !== undefined) o[C[hk]] += d.holdL[hk];
  if (d.holdR) for (hk in d.holdR) if (C[hk] !== undefined) o[C[hk]] += d.holdR[hk];
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
  // orbit：tail 骨骼不当尾巴用，绕竖轴一直转（围着骑士飞的小东西），轻轻上下晃
  if (d.orbit) b.tail.rotation.set(0.06 * Math.sin(t * 2.3), t * d.orbit, 0);
  else b.tail.rotation.set(o[C.TX], o[C.TY], 0);
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

// 骑士团的团旗徽记：一根短旗杆 + 一面燕尾小旗（旗尾的缺口用底色的小方块压出来）
// at 中心，s 大小，c 徽记颜色，bg 底色；side 为 true 时画在朝 +X 的面上（盾面），否则画在朝 +Z 的面上（胸口）
CHK.bannerBadge = function (at, s, c, bg, side) {
  var P = CHP, q = function (x, y, z) { return side ? [at[0] + z, at[1] + y, at[2] - x] : [at[0] + x, at[1] + y, at[2] + z]; };
  var dim = function (w, h, d) { return side ? [d, h, w] : [w, h, d]; };
  var rz = function (a) { return side ? [a, 0, 0] : [0, 0, a]; };
  return [
    P.box(dim(0.024 * s, 0.22 * s, 0.02), q(-0.045 * s, -0.01 * s, 0), c, 'gold'),
    P.box(dim(0.11 * s, 0.075 * s, 0.018), q(0.02 * s, 0.055 * s, 0.002), c, 'gold'),
    P.box(dim(0.045 * s, 0.045 * s, 0.02), q(0.078 * s, 0.055 * s, 0.006), bg, 'ch_plate', rz(Math.PI / 4))
  ];
};

// 盾（左前臂外侧）：pts 是盾面形状 [上宽, 下宽, 高]
// emblem 徽记颜色（不写就是素面盾）；badge：不写 = 十字，'banner' = 团旗徽记，'none' = 素面
CHK.kiteShield = function (B, face, rim, emblem, badge) {
  var P = CHP, y = -B.fore * 0.45;
  var list = [
    P.tbox([0.05, 0.05, 0.5, 0.38, 0.16], [0.09, y, 0.02], rim, 'ch_plate'),
    P.tbox([0.03, 0.03, 0.44, 0.33, 0.12], [0.112, y + 0.005, 0.02], face, 'ch_plate')
  ];
  if (emblem === undefined || emblem === null || badge === 'none') return list;
  if (badge === 'banner') return list.concat(CHK.bannerBadge([0.128, y + 0.03, 0.02], 1.35, emblem, face, true));
  return list.concat([
    P.box([0.02, 0.36, 0.06], [0.128, y + 0.02, 0.02], emblem, 'gold'),
    P.box([0.02, 0.06, 0.26], [0.128, y + 0.08, 0.02], emblem, 'gold')
  ]);
};

// ============================================================
//  21 位骑士（原创设计：按 data.js 里各自的名字和称号来设计）
//  这里是 14 位（13 位换皮 + 擎旗骑士），另外 7 位新做的在 models_knights.js
//  镜头大多在背后，所以每个人背后都有好认的东西：披风、帽子、背篓、旗卷、尾巴……
//  拿在手上、背在背上的东西都放在 gearL / gearR / pack 骨骼上（坐骑可以只藏起其中一样）
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

// ---- 守墓骑士：沉钟墓园的老守墓人。灰兜帽、白胡子、打补丁的旧外套和皮围裙、腰上一串钥匙、背上一篮发光的白蜡烛、手里的铁烛台 ----
CHD.gravekeeper = {
  body: { sh: 0.23 },
  make: function (B) {
    var P = CHP, COAT = 0x6a5e4e, PATCH = 0x5a4e3e, PANTS = 0x4a4238, HOOD = 0x4a4a52, FACE = 0xe0b49c, BEARD = 0xd8d4cc,
      WAX = 0xf4f0e4, FLAME = 0xe0ffd8, IRON = 0x5a6068, SCARF = 0x8a8a90, i;
    var arms = CHK.arms(B, { upper: COAT, upperT: 'ch_fold', fore: COAT, foreT: 'ch_fold', cuff: PATCH, cuffT: 'ch_fold', hand: FACE, handT: 'skin', w: 0.95 });
    arms.armL.push(P.box([0.03, 0.08, 0.07], [0.066, -0.17, 0.0], PATCH, 'ch_fold'));
    // 背上的蜡烛篮：一圈白蜡烛，烛火是青白色的
    var basket = [
      P.cyl([0.15, 0.12, 0.16, 8], [0, 0.17, -0.28], 0x9a7a4a, 'wood'),
      P.p('torus', [0.15, 0.018, 3, 10], [0, 0.25, -0.28], 0x7a5a32, 'wood', [Math.PI / 2, 0, 0]),
      P.box([0.04, 0.3, 0.03], [0.1, 0.3, -0.15], LEATHER_D, 'ch_leather', [-0.25, 0, 0]),
      P.box([0.04, 0.3, 0.03], [-0.1, 0.3, -0.15], LEATHER_D, 'ch_leather', [-0.25, 0, 0])
    ];
    for (i = 0; i < 5; i++) {
      var a = i / 5 * Math.PI * 2 + 0.4, x = Math.cos(a) * 0.075, z = -0.28 + Math.sin(a) * 0.07, h = 0.29 + (i % 2) * 0.035;
      basket.push(P.cyl([0.018, 0.018, 0.12, 6], [x, h, z], WAX, 'plain'));
      basket.push(P.gem(0.022, [x, h + 0.08, z], FLAME, '!plain', null, [1, 1.4, 1]));
    }
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: PANTS, thighT: 'cloth', shin: PANTS, shinT: 'cloth', boot: LEATHER_D, cuff: LEATHER_D, w: 0.92 })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: COAT, hipsT: 'ch_fold', belt: LEATHER_D, buckle: IRON, skirt: 0x5a3a22, skirtT: 'ch_leather', skirtB: COAT, skirtLen: 0.4, skirtW: 0.25 }).concat([
          // 左腰上的一串钥匙
          P.p('torus', [0.045, 0.01, 3, 8], [0.185, -0.0, 0.05], IRON, 'metal', [0, Math.PI / 2, 0]),
          P.box([0.012, 0.09, 0.025], [0.19, -0.07, 0.02], IRON, 'metal', [0.25, 0, 0]),
          P.box([0.012, 0.08, 0.025], [0.19, -0.07, 0.07], IRON, 'metal', [-0.2, 0, 0]),
          P.box([0.012, 0.07, 0.025], [0.192, -0.06, 0.045], 0x8a7a4a, 'metal')
        ]),
        chest: CHK.torso(B, { waist: COAT, waistT: 'ch_fold', chest: COAT, chestT: 'ch_fold', cw: 0.92, flat: true }).concat([
          P.box([0.08, 0.07, 0.02], [0.07, 0.17, 0.125], PATCH, 'ch_fold'),
          P.box([0.07, 0.08, 0.02], [-0.09, 0.3, 0.14], PATCH, 'ch_fold'),
          // 兜帽垂到肩上的那一圈
          P.tbox([0.34, 0.5, 0.1, 0.26, 0.31], [0, 0.42, -0.02], HOOD, 'ch_fold')
        ]),
        head: CHK.head(FACE).concat([
          P.tbox([0.2, 0.12, 0.13, 0.07, 0.05], [0, 0.085, 0.085], BEARD, 'fur'),
          P.box([0.075, 0.03, 0.03], [0.045, 0.262, 0.118], BEARD, 'fur', [0, 0, -0.18]),
          P.box([0.075, 0.03, 0.03], [-0.045, 0.262, 0.118], BEARD, 'fur', [0, 0, 0.18]),
          // 兜帽：往后推一点，脸露出来
          P.lathe([10, 0.19, 0.0, 0.19, 0.12, 0.165, 0.22, 0.1, 0.3, 0.0, 0.33], [0, 0.04, -0.07], HOOD, 'ch_fold'),
          P.cone([0.07, 0.16, 4], [0, 0.2, -0.22], HOOD, 'ch_fold', [-2.4, 0, 0]),
          P.p('torus', [0.125, 0.028, 3, 12], [0, 0.215, 0.085], HOOD, 'ch_fold')
        ]),
        pack: basket,
        gearR: CHK.held(B, 0.45, [
          P.cyl([0.015, 0.02, 0.24, 6], [0, 0.04, 0.075], IRON, 'metal'),
          P.cyl([0.06, 0.05, 0.015, 8], [0, 0.16, 0.075], IRON, 'metal'),
          P.cyl([0.022, 0.022, 0.1, 6], [0, 0.22, 0.075], WAX, 'plain'),
          P.knob(0.024, [0, 0.29, 0.075], FLAME, '!plain')
        ]),
        // 灰围巾：绕脖子一圈，一条短尾巴垂在左肩后面
        cape: [
          P.box([0.34, 0.08, 0.12], [0, 0.04, 0.05], SCARF, 'cloth'),
          P.box([0.08, 0.36, 0.02], [0.16, -0.17, -0.02], SCARF, 'ch_fold', [0, 0, 0.05])
        ]
      });
  }
};

// ---- 信使骑士：骑着加急巨箭送信的人。红罩袍、圆檐邮差帽、毛领旅行斗篷、斜挎的大邮包、左肩上一只白鸽 ----
CHD.courier = {
  make: function (B) {
    var P = CHP, MAIL = 0x9aa2ac, RED = 0xc8302a, BRN = 0x6a4a3a, BOOT = 0x6a4428, BAG = 0x8a5a2a, DOVE = 0xf2f2ee;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: BRN, thighT: 'cloth', shin: BOOT, shinT: 'ch_leather', boot: BOOT, cuff: 0x5a3820, w: 0.95 })),
      CHK.arms(B, { upper: MAIL, upperT: 'ch_chain', fore: RED, foreT: 'ch_fold', cuff: GOLD, cuffT: 'gold', hand: LEATHER, handT: 'ch_leather' }),
      {
        pelvis: CHK.hips(B, { hips: MAIL, belt: LEATHER_D, buckle: GOLD, skirt: RED, skirtLen: 0.34, skirtW: 0.24 }),
        chest: CHK.torso(B, { waist: MAIL, chest: RED, chestT: 'ch_fold' }).concat([
          P.box([0.36, 0.03, 0.26], [0, 0.075, -0.005], GOLD, 'gold'),
          // 胸口的邮号徽章（半圈号管 + 喇叭口）
          P.p('ch_arc', [0.045, 0.013, 3, 8, Math.PI], [0, 0.26, 0.185], GOLD, 'gold'),
          P.cone([0.026, 0.05, 6], [0.066, 0.25, 0.185], GOLD, 'gold', [0, 0, -Math.PI / 2]),
          // 邮包的斜挎带（左肩到右腰，前后各一段）
          P.box([0.05, 0.62, 0.03], [0.0, 0.22, 0.17], LEATHER_D, 'ch_leather', [0.12, 0, -0.62]),
          P.box([0.05, 0.56, 0.03], [-0.02, 0.2, -0.155], LEATHER_D, 'ch_leather', [-0.1, 0, -0.66]),
          // 毛领
          P.cyl([0.15, 0.2, 0.09, 10], [0, 0.42, -0.02], 0xf2ede4, 'fur'),
          // 左肩上的白鸽
          P.ball(0.055, [0.235, 0.52, -0.01], DOVE, 'ch_feather', [0.9, 0.9, 1.3]),
          P.knob(0.036, [0.235, 0.585, 0.045], DOVE, 'ch_feather'),
          P.cone([0.013, 0.035, 4], [0.235, 0.58, 0.09], 0xe8b060, 'plain', [Math.PI / 2, 0, 0]),
          P.box([0.05, 0.016, 0.09], [0.235, 0.53, -0.085], DOVE, 'ch_feather', [0.45, 0, 0]),
          P.box([0.012, 0.012, 0.012], [0.267, 0.595, 0.06], 0x141414, 'plain'), P.box([0.012, 0.012, 0.012], [0.203, 0.595, 0.06], 0x141414, 'plain')
        ]),
        head: CHK.head(SKIN).concat([
          P.box([0.23, 0.2, 0.12], [0, 0.23, -0.1], 0x5a3a22, 'fur'),
          P.cyl([0.17, 0.17, 0.02, 12], [0, 0.33, 0.01], 0x2a2a30, 'ch_leather'),
          P.cyl([0.125, 0.13, 0.1, 10], [0, 0.385, 0.0], RED, 'ch_fold'),
          P.knob(0.026, [0, 0.38, 0.128], GOLD, 'gold', [1, 1, 0.5])
        ]),
        // 右后腰鼓鼓的大皮邮包：翻盖、金扣、露出两封信
        pack: [
          P.ball(0.15, [-0.17, -0.08, -0.2], BAG, 'ch_leather', [0.75, 0.95, 1.1]),
          P.box([0.2, 0.05, 0.2], [-0.17, 0.0, -0.28], 0x7a4a22, 'ch_leather', [-0.5, 0, 0]),
          P.box([0.04, 0.05, 0.02], [-0.17, -0.05, -0.37], GOLD, 'gold'),
          P.box([0.15, 0.08, 0.015], [-0.16, 0.06, -0.15], 0xf4f0e4, 'plain', [0, 0, 0.1]),
          P.box([0.13, 0.07, 0.015], [-0.18, 0.055, -0.12], 0xe8dcc0, 'plain', [0, 0, -0.15])
        ],
        cape: CHK.cape(BRN, 0.78, 0.44, 0.56)
      });
  }
};

// ---- 发条锡兵：上了发条的玩具兵。红上衣白交叉带、金肩章、木头大下巴和画上去的眼睛、黑色高筒军帽、背后一直转的发条钥匙、带刺刀的玩具枪 ----
CHD.tinsoldier = {
  capeSpin: 2.6,
  body: { cape: [0, 0.27, -0.2] },
  make: function (B) {
    var P = CHP, RED = 0xd83a3a, RED_D = 0xa82a2a, WH = 0xf4f0e8, BK = 0x1a1a22, G = GOLD, WOOD = 0xf0c8a8, i;
    var arm = function (side) {
      var up = [
        P.ball(0.12, [side * 0.03, -0.01, 0], RED, 'ch_plate', [1.1, 0.9, 1.1]),
        P.cyl([0.105, 0.115, 0.035, 8], [side * 0.035, 0.085, 0], G, 'gold'),
        P.tube([0.06, 0.056, B.upper, 8], [0, -B.upper / 2, 0], RED, 'ch_plate'),
        P.knob(0.08, [0, -B.upper, 0], BK, 'ch_plate')
      ];
      for (i = -1; i <= 1; i++) up.push(P.box([0.022, 0.07, 0.022], [side * 0.14, 0.045, i * 0.055], G, 'gold'));
      return [up, [
        P.tube([0.072, 0.058, B.fore, 8], [0, -B.fore / 2, 0], RED, 'ch_plate'),
        P.tube([0.08, 0.075, 0.07, 8], [0, -B.fore + 0.03, 0], WH, 'ch_plate'),
        P.box([0.1, 0.11, 0.1], [0, -B.fore - 0.05, 0.01], WH, 'ch_plate')
      ]];
    };
    var al = arm(1), ar = arm(-1);
    var leg = [[
      P.knob(0.085, [0, 0, 0], WH, 'ch_plate'),
      P.tube([0.064, 0.058, B.thigh, 8], [0, -B.thigh / 2, 0], WH, 'ch_plate'),
      P.knob(0.088, [0, -B.thigh, 0], BK, 'ch_plate')
    ], [
      P.tube([0.075, 0.062, B.shin, 8], [0, -B.shin / 2, 0], BK, 'ch_plate'),
      P.cyl([0.12, 0.13, 0.1, 10], [0, -B.shin - 0.03, 0.03], BK, 'ch_plate', null, [1, 1, 1.3])
    ]];
    var chest = [
      P.tube([0.11, 0.11, 0.2, 8], [0, 0.0, 0], RED_D, 'ch_plate'),
      P.cyl([0.28, 0.2, 0.36, 10], [0, 0.24, 0], RED, 'ch_plate', null, [1, 1, 0.75]),
      P.cyl([0.22, 0.24, 0.05, 10], [0, 0.42, 0], RED_D, 'ch_plate', null, [1, 1, 0.75]),
      // 白色交叉带
      P.box([0.055, 0.46, 0.02], [0, 0.24, 0.182], WH, 'ch_plate', [0.2, 0, 0.62]),
      P.box([0.055, 0.46, 0.02], [0, 0.24, 0.186], WH, 'ch_plate', [0.2, 0, -0.62])
    ];
    for (i = 0; i < 4; i++) chest.push(P.knob(0.02, [(i % 2 ? 1 : -1) * 0.075, i < 2 ? 0.14 : 0.33, i < 2 ? 0.168 : 0.198], G, 'gold'));
    return CHK.join(CHK.legs(leg), {
      armL: al[0], foreL: al[1], armR: ar[0], foreR: ar[1],
      gearR: CHK.held(B, 0.15, [
        P.box([0.05, 0.08, 0.26], [0, -0.01, -0.02], 0x8a5a2a, 'wood'),
        P.tube([0.017, 0.017, 0.5, 6], [0, 0.025, 0.36], 0x3a3e44, 'metal', [Math.PI / 2, 0, 0]),
        P.tbox([0.004, 0.012, 0.2, 0.004, 0.032], [0, 0.025, 0.7], STEEL, 'ch_plate', [Math.PI / 2, 0, 0])
      ]),
      pelvis: [
        P.cyl([0.17, 0.15, 0.17, 8], [0, -0.03, 0], WH, 'ch_plate', null, [1, 1, 0.75]),
        P.cyl([0.18, 0.18, 0.045, 8], [0, 0.05, 0], BK, 'ch_leather', null, [1, 1, 0.75]),
        P.box([0.07, 0.05, 0.02], [0, 0.05, 0.135], G, 'gold')
      ],
      chest: chest,
      head: [
        P.tube([0.05, 0.05, 0.1, 6], [0, 0.04, 0], WOOD, 'skin'),
        P.box([0.2, 0.2, 0.2], [0, 0.24, 0], WOOD, 'skin'),
        P.box([0.17, 0.17, 0.012], [0, 0.225, 0.103], WOOD, 'ch_face'),
        // 木头大下巴（胡桃夹子那样一开一合的嘴）
        P.box([0.22, 0.12, 0.2], [0, 0.115, 0.012], WOOD, 'skin'),
        P.box([0.21, 0.16, 0.11], [0, 0.25, -0.05], 0x1a1a22, 'plain'),
        P.box([0.16, 0.014, 0.01], [0, 0.155, 0.115], 0x8a4a3a, 'plain'),
        P.box([0.012, 0.07, 0.01], [0.075, 0.12, 0.115], 0xb87a5a, 'plain'), P.box([0.012, 0.07, 0.01], [-0.075, 0.12, 0.115], 0xb87a5a, 'plain'),
        P.box([0.04, 0.03, 0.01], [0.062, 0.19, 0.11], 0xf08aa0, 'plain'), P.box([0.04, 0.03, 0.01], [-0.062, 0.19, 0.11], 0xf08aa0, 'plain'),
        // 高筒军帽 + 金徽 + 红绒球 + 金色帽带
        P.cyl([0.13, 0.14, 0.26, 10], [0, 0.4, 0], BK, 'ch_plate'),
        P.box([0.07, 0.08, 0.02], [0, 0.43, 0.137], G, 'gold'),
        P.knob(0.042, [0, 0.555, 0.08], RED, 'cloth'),
        P.box([0.016, 0.2, 0.02], [0.108, 0.19, 0.03], G, 'gold'), P.box([0.016, 0.2, 0.02], [-0.108, 0.19, 0.03], G, 'gold')
      ],
      // 发条钥匙（cape 骨骼一直绕 Z 轴转）：银杆、银金色的钥匙环
      cape: [
        P.tube([0.022, 0.022, 0.14, 6], [0, 0, -0.06], 0xc8ccd4, 'metal', [Math.PI / 2, 0, 0]),
        P.knob(0.04, [0, 0, -0.14], 0xc8ccd4, 'metal'),
        P.p('torus', [0.065, 0.022, 3, 8], [0.085, 0, -0.14], 0xd8c890, 'gold'),
        P.p('torus', [0.065, 0.022, 3, 8], [-0.085, 0, -0.14], 0xd8c890, 'gold')
      ]
    });
  }
};

// ---- 占星骑士：看星星认路的老学者。星图花纹的藏青长袍、带金星和小月牙的尖顶高帽、白长胡子、腰上的卷轴筒、手里的铜星盘 ----
CHD.astrologer = {
  make: function (B) {
    var P = CHP, NAVY = 0x2e3a7a, NAVY_D = 0x222c5e, CON = 0xffffff, SK = 0xe8c0a0, WH = 0xf0f0ec, G = 0xd9a64a, STAR = 0xffe26a;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: NAVY_D, thighT: 'cloth', shin: NAVY_D, shinT: 'ch_fold', boot: 0x3a2a20, cuff: NAVY, cuffT: 'ch_fold', w: 0.95 })),
      CHK.arms(B, { upper: NAVY, upperT: 'ch_fold', fore: NAVY, foreT: 'ch_fold', cuff: G, cuffT: 'gold', hand: SK, handT: 'skin' }),
      {
        pelvis: CHK.hips(B, { hips: CON, hipsT: 'ch_constel', belt: 0x6a4a2a, buckle: G, skirt: CON, skirtT: 'ch_constel', skirtLen: 0.56, skirtW: 0.3 }).concat([
          // 腰上两个卷轴筒
          P.cyl([0.03, 0.03, 0.15, 6], [0.15, -0.02, 0.1], 0xe8dcb8, 'plain', [0.2, 0, 0.15]),
          P.cyl([0.034, 0.034, 0.03, 6], [0.142, 0.055, 0.115], 0x8a5a2a, 'wood', [0.2, 0, 0.15]),
          P.cyl([0.03, 0.03, 0.13, 6], [0.19, -0.03, 0.03], 0xe8dcb8, 'plain', [-0.1, 0, 0.2]),
          P.cyl([0.034, 0.034, 0.03, 6], [0.177, 0.04, 0.025], 0x8a5a2a, 'wood', [-0.1, 0, 0.2])
        ]),
        chest: CHK.torso(B, { waist: CON, waistT: 'ch_constel', chest: CON, chestT: 'ch_constel', flat: true }).concat([
          P.tbox([0.6, 0.48, 0.16, 0.37, 0.33], [0, 0.35, -0.005], NAVY, 'ch_fold'),
          P.knob(0.016, [0, 0.24, 0.135], G, 'gold'), P.knob(0.016, [0, 0.16, 0.128], G, 'gold'), P.knob(0.016, [0, 0.08, 0.12], G, 'gold')
        ]),
        head: CHK.head(SK).concat([
          P.cone([0.1, 0.26, 6], [0, 0.03, 0.08], WH, 'fur', [Math.PI, 0, 0]),
          P.box([0.06, 0.025, 0.03], [0.035, 0.165, 0.122], WH, 'fur', [0, 0, 0.3]), P.box([0.06, 0.025, 0.03], [-0.035, 0.165, 0.122], WH, 'fur', [0, 0, -0.3]),
          P.box([0.21, 0.08, 0.05], [0, 0.25, -0.1], WH, 'fur'),
          // 尖顶星帽：帽檐 + 尖帽身 + 三颗金星 + 帽尖的小月牙
          P.cyl([0.2, 0.2, 0.02, 12], [0, 0.3, 0], NAVY, 'ch_fold'),
          P.lathe([10, 0.16, 0.0, 0.15, 0.03, 0.1, 0.16, 0.05, 0.28, 0.0, 0.34], [0, 0.3, 0], CON, 'ch_constel'),
          P.gem(0.024, [0.09, 0.39, 0.1], STAR, '!gold'), P.gem(0.02, [-0.07, 0.47, 0.06], STAR, '!gold'), P.gem(0.02, [0.02, 0.43, -0.13], STAR, '!gold'),
          P.p('ch_arc', [0.04, 0.012, 3, 8, Math.PI * 1.2], [0, 0.66, 0.0], STAR, '!gold', [0, 0, Math.PI * 0.9])
        ]),
        // 铜星盘：两个交叉的圆环 + 指针 + 轴心
        gearR: CHK.held(B, 0, [
          P.p('torus', [0.09, 0.011, 4, 14], [0, -0.04, 0.13], G, 'gold', [0.3, 0, 0]),
          P.p('torus', [0.09, 0.011, 4, 14], [0, -0.04, 0.13], G, 'gold', [0.3, Math.PI / 2, 0]),
          P.box([0.16, 0.012, 0.012], [0, -0.04, 0.13], 0xb8862a, 'gold', [0, 0, 0.5]),
          P.knob(0.022, [0, -0.04, 0.13], 0xb8862a, 'gold')
        ])
      });
  }
};

// ---- 驯鹰骑士：带着猎鹰的猎手。棕色兜帽、绿上衣皮甲、左手厚皮手套上站着一只猎鹰、腰上挂着诱饵羽毛、背后棕色的羽毛短披肩 ----
CHD.falconer = {
  swingL: 0.35, holdL: { FLX: -0.9 },
  make: function (B) {
    var P = CHP, HOOD = 0x6a4a2a, HOOD_D = 0x553a20, TUNIC = 0x2e5a4a, BRN = 0x6e4a2c, FAL = 0x8a6a40, FAL_D = 0x5a4428, CREAM = 0xf0e0c0;
    // 一排羽片：n 片、间距 dx、中心高 y、长 h、前后 z，颜色轮流用 cols；两边的往外斜一点
    var feathers = function (n, dx, y, h, z, cols) {
      var list = [], i, x;
      for (i = 0; i < n; i++) {
        x = (i - (n - 1) / 2) * dx;
        list.push(P.tbox([0.11, 0.015, h, 0.035, 0.015], [x, y + Math.abs(x) * 0.12, z + Math.abs(x) * 0.05], cols[i % cols.length], 'fur', [0, 0, x * 0.6]));
      }
      return list;
    };
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: BRN, thighT: 'cloth', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 0.95 })),
      CHK.arms(B, { upper: TUNIC, upperT: 'ch_fold', fore: TUNIC, foreT: 'ch_fold', cuff: LEATHER, cuffT: 'ch_leather', hand: LEATHER_D }),
      {
        pelvis: CHK.hips(B, { hips: STEEL_D, belt: LEATHER_D, buckle: GOLD, skirt: TUNIC, skirtLen: 0.3 }).concat([
          // 诱饵羽毛
          P.box([0.02, 0.15, 0.04], [-0.17, -0.06, 0.07], 0xd8c8a8, 'ch_feather', [0, 0, 0.15]),
          P.box([0.02, 0.13, 0.04], [-0.18, -0.05, 0.03], FAL, 'ch_feather', [0, 0, -0.1]),
          P.box([0.02, 0.12, 0.035], [-0.175, -0.04, 0.11], 0xd8c8a8, 'ch_feather', [0.2, 0, 0.05])
        ]),
        chest: CHK.torso(B, { waist: STEEL_D, chest: LEATHER, chestT: 'ch_leather', flat: true }).concat([
          P.box([0.06, 0.56, 0.03], [0, 0.2, 0.14], LEATHER_D, 'ch_leather', [0.1, 0, -0.62])
        ]),
        head: CHK.head(SKIN).concat([
          P.ball(0.162, [0, 0.25, -0.05], HOOD, 'ch_fold', [1.0, 1.0, 0.95]),
          P.cone([0.12, 0.3, 6], [0, 0.43, -0.12], HOOD, 'ch_fold', [-0.75, 0, 0]),
          P.cone([0.1, 0.26, 6], [0, 0.2, -0.22], HOOD, 'ch_fold', [-2.1, 0, 0]),
          P.box([0.27, 0.05, 0.08], [0, 0.35, 0.07], HOOD_D, 'ch_fold', [0.3, 0, 0]),
          P.box([0.035, 0.22, 0.11], [0.125, 0.22, 0.045], HOOD_D, 'ch_fold'), P.box([0.035, 0.22, 0.11], [-0.125, 0.22, 0.045], HOOD_D, 'ch_fold')
        ]),
        // 左手：厚皮手套 + 站在拳头上的猎鹰（按小臂平举时摆正）
        gearL: [P.tube([0.078, 0.07, 0.17, 8], [0, -B.fore + 0.02, 0], 0x8a6a3a, 'ch_leather')].concat(CHK.held(B, 1.3, [
          P.ball(0.07, [0, 0.13, -0.01], FAL, 'ch_feather', [0.9, 1.0, 1.3], [-0.35, 0, 0]),
          P.knob(0.05, [0, 0.12, 0.055], CREAM, 'ch_feather', [1, 1.2, 0.6]),
          P.knob(0.045, [0, 0.215, 0.04], FAL_D, 'ch_feather'),
          P.cone([0.016, 0.04, 4], [0, 0.205, 0.088], 0xe8c040, 'plain', [Math.PI / 2 + 0.4, 0, 0]),
          P.box([0.014, 0.014, 0.012], [0.03, 0.225, 0.07], 0x141414, 'plain'), P.box([0.014, 0.014, 0.012], [-0.03, 0.225, 0.07], 0x141414, 'plain'),
          P.tbox([0.03, 0.02, 0.17, 0.11, 0.06], [0.058, 0.12, -0.03], FAL_D, 'ch_feather', [0.4, 0, 0.1]),
          P.tbox([0.03, 0.02, 0.17, 0.11, 0.06], [-0.058, 0.12, -0.03], FAL_D, 'ch_feather', [0.4, 0, -0.1]),
          P.box([0.06, 0.016, 0.12], [0, 0.06, -0.12], FAL_D, 'ch_feather', [-0.6, 0, 0]),
          P.box([0.015, 0.035, 0.03], [0.025, 0.05, 0.01], 0xe8c040, 'plain'), P.box([0.015, 0.035, 0.03], [-0.025, 0.05, 0.01], 0xe8c040, 'plain')
        ])),
        // 羽毛短披肩：上下两排尖尖朝下的羽片（下排深棕和奶白相间），下摆是一排锯齿
        cape: feathers(6, 0.1, -0.1, 0.23, -0.06, [FAL, FAL_D]).concat(feathers(5, 0.1, -0.26, 0.25, -0.03, [0x4a3620, CREAM]), [
          P.box([0.5, 0.07, 0.08], [0, 0.0, 0.01], FAL_D, 'ch_feather')
        ])
      });
  }
};

// ---- 圣歌修女：唱着圣歌上战场的修女。白头巾外罩深蓝头纱、锁子甲外面白罩袍（胸前蓝底金百合的小盾徽）、灰蓝长裙、浅蓝披风、左手圣歌本、右手橄榄枝 ----
CHD.nun = {
  body: { sh: 0.215, hw: 0.105, upper: 0.29, fore: 0.26, thigh: 0.42, shin: 0.39, scale: 0.97 },
  make: function (B) {
    var P = CHP, SK = 0xeec2a0, WH = 0xf4f2ec, VEIL = 0x1a2a4a, MAIL = 0x9aa2ac, SKIRT = 0x7a8aa0, BLUE = 0x2a55c8, HAIR = 0x8a4a2a, LEAF = 0x6a9a4a, GOLD = 0xe8c040;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: SKIRT, thighT: 'cloth', shin: SKIRT, shinT: 'cloth', boot: LEATHER, w: 0.86 })),
      CHK.arms(B, { upper: WH, upperT: 'ch_fold', fore: WH, foreT: 'ch_fold', cuff: SKIRT, cuffT: 'ch_fold', hand: SK, handT: 'skin', w: 0.85 }),
      {
        pelvis: CHK.hips(B, { hips: SKIRT, hipsT: 'ch_fold', belt: LEATHER_D, skirt: SKIRT, skirtLen: 0.6, skirtW: 0.28, hw: 1.04 }),
        chest: CHK.torso(B, { waist: MAIL, waistT: 'ch_chain', chest: MAIL, chestT: 'ch_chain', cw: 0.92, flat: true }).concat([
          // 白罩袍（肩膀露出锁子甲）+ 胸前的小盾徽：深蓝的盾（下面收成尖）、金色百合（中间一瓣、两边各一瓣往外弯、一道箍、一小截茎）
          P.tbox([0.34, 0.32, 0.36, 0.3, 0.235], [0, 0.2, -0.005], WH, 'ch_fold'),
          P.box([0.13, 0.11, 0.018], [0, 0.25, 0.152], BLUE, 'cloth'),
          P.box([0.074, 0.015, 0.012], [0, 0.226, 0.165], GOLD, 'gold'),
          P.late(P.cone([0.092, 0.045, 4], [0, 0.1725, 0.152], BLUE, 'cloth', [Math.PI, Math.PI / 4, 0], [1, 1, 0.14])),
          P.late(P.gem(0.034, [0, 0.262, 0.165], GOLD, 'gold', null, [0.62, 1.55, 0.35])),
          P.late(P.gem(0.026, [0.033, 0.248, 0.164], GOLD, 'gold', [0, 0, -0.62], [0.55, 1.35, 0.35])),
          P.late(P.gem(0.026, [-0.033, 0.248, 0.164], GOLD, 'gold', [0, 0, 0.62], [0.55, 1.35, 0.35])),
          P.late(P.box([0.014, 0.03, 0.01], [0, 0.204, 0.164], GOLD, 'gold'))
        ]),
        head: CHK.head(SK).concat([
          P.box([0.1, 0.34, 0.06], [0, 0.07, -0.13], HAIR, 'ch_fold', [0.18, 0, 0]),
          // 白头巾（往后推，脸露出来）+ 深蓝头纱从头顶垂到肩胛
          P.tube([0.135, 0.14, 0.24, 10], [0, 0.21, -0.04], WH, 'ch_fold'),
          P.box([0.23, 0.05, 0.04], [0, 0.315, 0.1], WH, 'ch_fold'),
          P.box([0.035, 0.22, 0.05], [0.1, 0.205, 0.095], WH, 'ch_fold'), P.box([0.035, 0.22, 0.05], [-0.1, 0.205, 0.095], WH, 'ch_fold'),
          P.box([0.23, 0.05, 0.06], [0, 0.105, 0.085], WH, 'ch_fold'),
          P.ball(0.152, [0, 0.31, -0.05], VEIL, 'ch_fold', [1.0, 0.62, 1.05]),
          P.tbox([0.27, 0.36, 0.5, 0.06, 0.04], [0, 0.12, -0.175], VEIL, 'ch_fold', [0.16, 0, 0])
        ]),
        // 左手红皮圣歌本，右手橄榄枝
        gearL: CHK.held(B, 0.4, [
          P.box([0.05, 0.22, 0.16], [0.01, -0.04, 0.06], 0xa82a2a, 'ch_leather'),
          P.box([0.044, 0.2, 0.012], [0.01, -0.04, 0.142], 0xf4f0e4, 'plain'),
          P.box([0.056, 0.03, 0.03], [0.01, 0.06, 0.125], GOLD, 'gold'), P.box([0.056, 0.03, 0.03], [0.01, -0.14, 0.125], GOLD, 'gold')
        ]),
        gearR: CHK.held(B, 0.4, [
          P.tube([0.008, 0.012, 0.3, 5], [0, 0.1, 0.075], 0x6a5a3a, 'wood'),
          P.cone([0.022, 0.075, 4], [0.03, 0.13, 0.075], LEAF, 'leaf', [0, 0, -0.9]),
          P.cone([0.022, 0.075, 4], [-0.03, 0.18, 0.075], LEAF, 'leaf', [0, 0, 0.9]),
          P.cone([0.022, 0.075, 4], [0.028, 0.22, 0.075], LEAF, 'leaf', [0, 0, -0.7]),
          P.cone([0.022, 0.075, 4], [0, 0.27, 0.075], LEAF, 'leaf')
        ]),
        cape: CHK.cape(0x9ac0e8, 0.75, 0.4, 0.5)
      });
  }
};

// ---- 铁匠骑士：前线的铁匠。灰衬衫卷起袖子、熏黑的小臂、厚皮围裙（背后交叉的背带 X）、后腰别着火钳、红胡子、小铁帽上推着护目镜、烧红的锻锤 ----
CHD.smith = {
  body: { sh: 0.28, sy: 0.41, scale: 1.04 },
  armOut: 0.08,
  make: function (B) {
    var P = CHP, SHIRT = 0x5a5a60, SOOT = 0xb88a68, SK = 0xe3a777, APR = 0x6a4a2a, PANTS = 0x3a3a44, IRON = 0x4a4e56, BEARD = 0xb8442a,
      BURN = 0x2a1a10, STRAP = 0x8a6a3a, BRASS = 0xc89a3a;
    var arms = CHK.arms(B, { upper: SHIRT, upperT: 'cloth', fore: SOOT, foreT: 'skin', hand: SK, handT: 'skin', w: 1.12 });
    arms.armL.push(P.cyl([0.09, 0.088, 0.075, 8], [0, -B.upper + 0.05, 0], SHIRT, 'ch_fold'));
    arms.armR.push(P.cyl([0.09, 0.088, 0.075, 8], [0, -B.upper + 0.05, 0], SHIRT, 'ch_fold'));
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: PANTS, thighT: 'cloth', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 1.12 })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: PANTS, hipsT: 'cloth', belt: LEATHER_D, buckle: 0xa8aeb6, skirt: APR, skirtT: 'ch_leather', skirtB: PANTS, skirtLen: 0.42, skirtW: 0.3, hw: 1.1 }).concat([
          P.box([0.03, 0.03, 0.01], [0.06, -0.12, 0.165], BURN, 'plain'),
          // 后腰别着的火钳
          P.box([0.026, 0.4, 0.026], [-0.02, -0.08, -0.17], 0x6a6e76, 'metal', [0, 0, 0.5]),
          P.box([0.026, 0.4, 0.026], [0.01, -0.08, -0.175], 0x6a6e76, 'metal', [0, 0, 0.72]),
          P.knob(0.03, [0.06, 0.02, -0.18], 0x6a6e76, 'metal')
        ]),
        chest: CHK.torso(B, { waist: SHIRT, waistT: 'cloth', chest: SHIRT, chestT: 'cloth', flat: true }).concat([
          // 皮围裙的胸兜 + 烫出来的小洞
          P.tbox([0.34, 0.3, 0.33, 0.03, 0.03], [0, 0.21, 0.135], APR, 'ch_leather', [0.1, 0, 0]),
          P.box([0.03, 0.025, 0.01], [-0.07, 0.26, 0.158], BURN, 'plain'), P.box([0.025, 0.03, 0.01], [0.09, 0.14, 0.15], BURN, 'plain'),
          P.box([0.045, 0.14, 0.03], [0.13, 0.42, 0.08], STRAP, 'ch_leather', [0.5, 0, 0]),
          P.box([0.045, 0.14, 0.03], [-0.13, 0.42, 0.08], STRAP, 'ch_leather', [0.5, 0, 0]),
          // 背后交叉的背带
          P.box([0.05, 0.5, 0.03], [0, 0.22, -0.16], STRAP, 'ch_leather', [-0.1, 0, 0.5]),
          P.box([0.05, 0.5, 0.03], [0, 0.22, -0.165], STRAP, 'ch_leather', [-0.1, 0, -0.5])
        ]),
        head: CHK.head(SK).concat([
          P.tbox([0.22, 0.16, 0.16, 0.12, 0.08], [0, 0.085, 0.07], BEARD, 'fur'),
          P.box([0.13, 0.03, 0.03], [0, 0.17, 0.122], BEARD, 'fur'),
          // 铁帽下面的红棕短发
          P.box([0.23, 0.16, 0.12], [0, 0.2, -0.1], 0x8a3a22, 'fur'),
          P.lathe([10, 0.138, 0.0, 0.132, 0.05, 0.112, 0.1, 0.06, 0.135, 0.0, 0.145], [0, 0.27, -0.005], IRON, 'metal'),
          P.box([0.235, 0.025, 0.24], [0, 0.3, -0.005], LEATHER_D, 'ch_leather'),
          // 推到帽子上的护目镜
          P.cyl([0.04, 0.04, 0.022, 8], [0.05, 0.335, 0.122], BRASS, 'gold', [Math.PI / 2 - 0.55, 0, 0]),
          P.cyl([0.04, 0.04, 0.022, 8], [-0.05, 0.335, 0.122], BRASS, 'gold', [Math.PI / 2 - 0.55, 0, 0]),
          P.cyl([0.03, 0.03, 0.026, 8], [0.05, 0.337, 0.125], 0x6ad0ff, '!plain', [Math.PI / 2 - 0.55, 0, 0]),
          P.cyl([0.03, 0.03, 0.026, 8], [-0.05, 0.337, 0.125], 0x6ad0ff, '!plain', [Math.PI / 2 - 0.55, 0, 0])
        ]),
        // 锻锤：木柄 + 铁锤头，打铁的那一面烧得通红
        gearR: CHK.held(B, 0.55, [
          P.tube([0.022, 0.026, 0.5, 6], [0, 0, 0.17], 0x7a5232, 'wood', [Math.PI / 2, 0, 0]),
          P.box([0.11, 0.2, 0.11], [0, 0.0, 0.43], IRON, 'metal'),
          P.box([0.114, 0.022, 0.114], [0, -0.1, 0.43], 0xff7a2a, '!plain')
        ])
      });
  }
};

// ---- 熊骑士：穿上铠甲的大棕熊。棕毛、圆耳朵、浅色口鼻、两耳中间扣着一顶小骑士盔、铁胸板和右肩铁护肩、大爪子、背上斜扛一根木头 ----
CHD.bear = {
  body: { sh: 0.29, sy: 0.39, scale: 1.12 },
  hunch: 0.12, armOut: 0.15,
  make: function (B) {
    var P = CHP, FUR = 0x7a5030, FUR_D = 0x6a4428, PALE = 0xc8a070, STOLE = 0x4a3020, IR = 0x5a6068, CLAW = 0xf0e8d8, DK = 0x1a1410, i;
    var paw = function (y, z) { var l = []; for (i = -1; i <= 1; i += 2) l.push(P.cone([0.017, 0.06, 4], [i * 0.035, y, z], CLAW, 'bone', [Math.PI - 0.6, 0, 0])); return l; };
    var arms = CHK.arms(B, { upper: FUR, upperT: 'fur', fore: FUR, foreT: 'fur', cuff: IR, cuffT: 'metal', hand: FUR_D, handT: 'fur', w: 1.3 });
    arms.armR.push(P.ball(0.16, [-0.05, 0.0, 0], IR, 'metal', [1.1, 0.8, 1.1], null, [7, 4]));
    arms.armL.push(P.ball(0.14, [0.04, -0.01, 0], STOLE, 'fur', [1.1, 0.75, 1.1]));
    arms.foreL = arms.foreL.concat(paw(-B.fore - 0.12, 0.05));
    arms.foreR = arms.foreR.concat(paw(-B.fore - 0.12, 0.05));
    var leg = CHK.leg(B, { thigh: LEATHER, thighT: 'ch_leather', knee: IR, kneeT: 'metal', shin: FUR, shinT: 'fur', boot: FUR_D, bootT: 'fur', cuff: STOLE, cuffT: 'fur', w: 1.22 });
    for (i = -1; i <= 1; i++) leg[1].push(P.cone([0.02, 0.07, 4], [i * 0.045, -B.shin - 0.05, 0.21], CLAW, 'bone', [Math.PI / 2, 0, 0]));
    return CHK.join(
      CHK.legs(leg),
      arms,
      {
        pelvis: CHK.hips(B, { hips: LEATHER_D, hipsT: 'ch_leather', belt: LEATHER, buckle: IR, skirt: LEATHER, skirtT: 'ch_leather', skirtLen: 0.3, skirtW: 0.28, hw: 1.15 }),
        chest: [
          P.tbox([0.34, 0.33, 0.18, 0.24, 0.24], [0, 0.0, 0], FUR, 'fur'),
          P.tbox([0.62, 0.42, 0.36, 0.34, 0.3], [0, 0.22, -0.01], FUR, 'fur'),
          P.ball(0.2, [0, 0.05, 0.07], 0x8a6040, 'fur', [1.0, 0.85, 0.85], null, [7, 4]),
          P.ball(0.2, [0, 0.22, -0.08], FUR, 'fur', [1.35, 1.0, 0.7], null, [6, 4]),
          P.tbox([0.5, 0.38, 0.26, 0.04, 0.04], [0, 0.27, 0.17], IR, 'metal', [0.12, 0, 0]),
          P.knob(0.022, [0.17, 0.36, 0.19], 0xb0b6be, 'metal'), P.knob(0.022, [-0.17, 0.36, 0.19], 0xb0b6be, 'metal'),
          P.box([0.07, 0.55, 0.03], [0.06, 0.2, 0.2], LEATHER, 'ch_leather', [0.1, 0, 0.55]),
          P.ball(0.21, [0, 0.41, -0.04], STOLE, 'fur', [1.6, 0.6, 1.15], null, [7, 4])
        ],
        head: [
          P.tube([0.09, 0.1, 0.1, 6], [0, 0.03, 0.02], FUR, 'fur'),
          P.ball(0.15, [0, 0.2, 0.01], FUR, 'fur', [1.05, 1.0, 1.0]),
          P.ball(0.055, [0.11, 0.325, -0.0], FUR, 'fur', [1, 1, 0.65], null, [6, 3]), P.ball(0.055, [-0.11, 0.325, -0.0], FUR, 'fur', [1, 1, 0.65], null, [6, 3]),
          P.box([0.05, 0.05, 0.02], [0.11, 0.325, 0.02], PALE, 'fur'), P.box([0.05, 0.05, 0.02], [-0.11, 0.325, 0.02], PALE, 'fur'),
          P.knob(0.075, [0, 0.16, 0.125], PALE, 'fur', [1.1, 0.8, 1.0]),
          P.box([0.05, 0.035, 0.03], [0, 0.185, 0.19], DK, 'plain'),
          P.box([0.026, 0.026, 0.02], [0.058, 0.245, 0.145], DK, 'plain'), P.box([0.026, 0.026, 0.02], [-0.058, 0.245, 0.145], DK, 'plain'),
          // 两耳中间的小骑士盔
          P.lathe([8, 0.1, 0.0, 0.095, 0.05, 0.07, 0.09, 0.0, 0.1], [0, 0.3, -0.005], STEEL, 'ch_plate')
        ],
        // 背上斜扛的一根木头（树皮 + 两头的截面 + 一撮叶子）
        pack: [
          P.cyl([0.09, 0.1, 1.0, 8], [0, 0.22, -0.31], 0x7a5a3a, 'bark', [0, 0, 0.9]),
          P.cyl([0.084, 0.084, 0.014, 6], [-0.393, 0.531, -0.31], 0xc8a878, 'wood', [0, 0, 0.9]),
          P.cyl([0.094, 0.094, 0.014, 6], [0.393, -0.091, -0.31], 0xc8a878, 'wood', [0, 0, 0.9]),
          P.ico(0.065, [-0.28, 0.5, -0.35], 0x5aa83a, 'leaf')
        ]
      });
  }
};

// ---- 擎旗骑士：骑士团的旗手。全身板甲、桶盔、红色大羽饰、蓝披风；胸口和风筝盾上是团旗徽记，右手竖着红白骑枪，背上斜背着卷起来的团旗 ----
CHD.bannerman = {
  swingR: 0.5,
  make: function (B) {
    var P = CHP, RED = 0xd8323a, BLUE = 0x2a55c8, WOOD = 0x6a4a2a;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: STEEL, knee: STEEL, shin: STEEL, boot: STEEL_D, bootT: 'ch_plate', toe: STEEL })),
      CHK.arms(B, { upper: STEEL, pauldron: STEEL, elbow: STEEL, fore: STEEL, cuff: STEEL, hand: STEEL_D, handT: 'ch_plate' }),
      {
        pelvis: CHK.hips(B, { hips: STEEL_D, faulds: STEEL, buckle: GOLD, skirt: BLUE, skirtLen: 0.34 }),
        chest: CHK.torso(B, { waist: STEEL_D, chest: STEEL, gorget: STEEL }).concat(CHK.bannerBadge([0, 0.27, 0.178], 1, GOLD, STEEL)),
        head: [
          P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], STEEL_D, 'ch_chain'),
          P.cyl([0.152, 0.16, 0.3, 10], [0, 0.23, 0], STEEL, 'ch_plate'),
          P.cyl([0.115, 0.152, 0.05, 10], [0, 0.405, 0], STEEL, 'ch_plate'),
          P.box([0.25, 0.032, 0.04], [0, 0.265, 0.145], 0x101216, 'plain'),
          P.box([0.035, 0.17, 0.035], [0, 0.2, 0.153], STEEL_D, 'ch_plate'),
          P.cyl([0.163, 0.163, 0.035, 10], [0, 0.35, 0], GOLD, 'gold'),
          // 羽饰：从头顶往后弯下来的一大蓬
          P.tube([0.05, 0.065, 0.06, 6], [0, 0.44, 0], GOLD, 'gold'),
          P.ball(0.1, [0, 0.52, -0.02], RED, 'ch_feather', [0.8, 1.0, 1.25], [-0.3, 0, 0]),
          P.ball(0.1, [0, 0.49, -0.16], RED, 'ch_feather', [0.95, 0.9, 1.2], [0.5, 0, 0]),
          P.ball(0.085, [0, 0.39, -0.26], 0xb82830, 'ch_feather', [1.0, 1.25, 0.8], [0.9, 0, 0])
        ],
        gearL: CHK.kiteShield(B, BLUE, STEEL, GOLD, 'banner'),
        // 骑枪：平时竖着拿（枪尾快到地面），握把 + 护手圆盘 + 红白螺旋的长枪身；坐骑冲锋时由坐骑姿势把它放平
        gearR: CHK.held(B, 0.62, [
          P.tube([0.026, 0.03, 0.62, 6], [0, -0.32, 0.02], WOOD, 'wood'),
          P.tube([0.032, 0.032, 0.2, 6], [0, 0.04, 0.02], 0x8a6a4a, 'ch_leather'),
          P.cone([0.11, 0.1, 6], [0, 0.18, 0.02], STEEL, 'ch_plate'),
          P.cone([0.05, 0.98, 8], [0, 0.72, 0.02], 0xffffff, 'ch_spiral')
        ]),
        // 背上卷起来的团旗：旗杆 + 红旗卷 + 金枪头
        pack: [
          P.tube([0.018, 0.018, 1.15, 6], [0, 0.25, -0.25], WOOD, 'wood', [0, 0, -0.35]),
          P.cyl([0.05, 0.05, 0.5, 6], [0.103, 0.534, -0.25], RED, 'ch_fold', [0, 0, -0.35]),
          P.cone([0.025, 0.07, 5], [0.208, 0.82, -0.25], GOLD, 'gold', [0, 0, -0.35])
        ],
        cape: CHK.cape(0x2a4fb8, 0.92)
      });
  }
};

// ---- 园丁骑士：修道院花园里的园丁。宽檐草帽（绿缎带、两朵小花）、栗色长辫、绿裙子皮背心、带口袋的白围裙、绿短披肩、园艺剪、背上一袋种子 ----
CHD.gardener = {
  body: { sh: 0.215, hw: 0.105, upper: 0.29, fore: 0.26, thigh: 0.42, shin: 0.39, scale: 0.97 },
  make: function (B) {
    var P = CHP, DRESS = 0x4a8a4a, BOD = 0x9a6a3a, APR = 0xf4f0e8, HAIR = 0x8a4a2a, STRAW = 0xe8d090, RIB = 0x5aa83a, SK = 0xf1d6c8, SACK = 0xc8b48a;
    var braid = [P.box([0.07, 0.42, 0.07], [0, 0.06, -0.145], HAIR, 'ch_fold', [0.14, 0, 0])];
    [[0.179, -0.128], [0.05, -0.146], [-0.079, -0.165]].forEach(function (q) { braid.push(P.knob(0.045, [0, q[0], q[1]], HAIR, 'ch_fold')); });
    braid.push(P.knob(0.03, [0, -0.138, -0.173], RIB, 'cloth'));
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: DRESS, thighT: 'ch_fold', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER, cuff: LEATHER_D, w: 0.88 })),
      CHK.arms(B, { upper: DRESS, upperT: 'ch_fold', fore: DRESS, foreT: 'ch_fold', cuff: APR, cuffT: 'ch_fold', hand: SK, handT: 'skin', w: 0.85 }),
      {
        pelvis: CHK.hips(B, { hips: DRESS, hipsT: 'ch_fold', belt: BOD, beltT: 'ch_leather', skirt: APR, skirtB: DRESS, skirtLen: 0.42, skirtW: 0.27 }).concat([
          P.box([0.12, 0.09, 0.015], [0, -0.13, 0.148], 0xe2dcc8, 'ch_fold', [-0.08, 0, 0])
        ]),
        chest: CHK.torso(B, { waist: DRESS, waistT: 'ch_fold', chest: DRESS, chestT: 'ch_fold', cw: 0.9, flat: true }).concat([
          P.tbox([0.36, 0.31, 0.2, 0.27, 0.23], [0, 0.13, -0.005], BOD, 'ch_leather')
        ]),
        head: CHK.head(SK).concat([
          // 后脑的栗色头发（辫子从里面垂下来）
          P.box([0.23, 0.2, 0.12], [0, 0.22, -0.1], HAIR, 'ch_fold')
        ], braid, [
          P.box([0.22, 0.075, 0.23], [0, 0.325, -0.01], HAIR, 'ch_fold'),
          P.box([0.035, 0.2, 0.07], [0.112, 0.22, -0.02], HAIR, 'ch_fold'), P.box([0.035, 0.2, 0.07], [-0.112, 0.22, -0.02], HAIR, 'ch_fold'),
          // 宽檐草帽 + 绿缎带 + 粉花、黄花
          P.cyl([0.3, 0.3, 0.02, 14], [0, 0.36, 0], STRAW, 'wood', [-0.06, 0, 0]),
          P.lathe([10, 0.135, 0.0, 0.13, 0.08, 0.105, 0.125, 0.0, 0.135], [0, 0.36, 0], STRAW, 'wood', [-0.06, 0, 0]),
          P.cyl([0.133, 0.133, 0.03, 10], [0, 0.385, 0], RIB, 'cloth', [-0.06, 0, 0]),
          P.ico(0.042, [0.1, 0.4, 0.07], 0xff8ab8, 'plain'), P.knob(0.018, [0.11, 0.405, 0.1], 0xffe070, 'plain'),
          P.ico(0.036, [0.125, 0.395, -0.02], 0xffd84a, 'plain')
        ]),
        // 园艺剪：两片剪刃 + 两根木柄 + 轴钉
        gearR: CHK.held(B, 0.5, [
          P.box([0.03, 0.03, 0.15], [0.022, 0, 0.0], 0x8a5a2a, 'wood', [0, 0.16, 0]),
          P.box([0.03, 0.03, 0.15], [-0.022, 0, 0.0], 0x8a5a2a, 'wood', [0, -0.16, 0]),
          P.knob(0.022, [0, 0, 0.09], 0x5a6068, 'metal'),
          P.tbox([0.006, 0.02, 0.2, 0.012, 0.04], [0.016, 0, 0.19], STEEL, 'ch_plate', [Math.PI / 2, 0, -0.14]),
          P.tbox([0.006, 0.02, 0.2, 0.012, 0.04], [-0.016, 0, 0.19], STEEL, 'ch_plate', [Math.PI / 2, 0, 0.14])
        ]),
        // 背上的种子袋（扎口 + 两根嫩芽）
        pack: [
          P.ball(0.16, [0, 0.22, -0.3], SACK, 'ch_fold', [1, 1.2, 0.8]),
          P.cyl([0.05, 0.07, 0.07, 6], [0, 0.43, -0.3], SACK, 'ch_fold'),
          P.cyl([0.054, 0.054, 0.02, 6], [0, 0.415, -0.3], 0x8a6a3a, 'cloth'),
          P.cone([0.022, 0.09, 4], [0.025, 0.5, -0.3], RIB, 'leaf', [0, 0, -0.35]),
          P.cone([0.022, 0.08, 4], [-0.025, 0.495, -0.3], RIB, 'leaf', [0, 0, 0.4])
        ],
        cape: CHK.cape(0x3f7a34, 0.42, 0.42, 0.5)
      });
  }
};

// ---- 魔术骑士：舞台上的魔术师。黑礼帽红帽带、小胡子、黑燕尾服白衬衫红领结、白手套、外黑里红的大斗篷、魔术棒 ----
CHD.magician = {
  make: function (B) {
    var P = CHP, BLK = 0x1a1a22, PANTS = 0x22222a, WH = 0xf4f2ec, RED = 0xc8202e, HAIR = 0x15121a;
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: PANTS, thighT: 'cloth', shin: PANTS, shinT: 'cloth', boot: 0x15121a, bootT: 'ch_plate' })),
      CHK.arms(B, { upper: BLK, upperT: 'ch_fold', pauldron: BLK, pw: 0.88, fore: BLK, foreT: 'ch_fold', cuff: WH, cuffT: 'cloth', hand: WH, handT: 'cloth' }),
      {
        pelvis: CHK.hips(B, { hips: PANTS, hipsT: 'cloth', belt: BLK, buckle: 0xc0c4cc }).concat([
          // 燕尾服的两条尾巴
          P.box([0.1, 0.45, 0.02], [0.06, -0.19, -0.14], BLK, 'ch_fold', [0.12, 0, -0.04]),
          P.box([0.1, 0.45, 0.02], [-0.06, -0.19, -0.14], BLK, 'ch_fold', [0.12, 0, 0.04])
        ]),
        chest: CHK.torso(B, { waist: BLK, waistT: 'ch_fold', chest: BLK, chestT: 'ch_fold', flat: true }).concat([
          P.tbox([0.12, 0.06, 0.26, 0.02, 0.02], [0, 0.27, 0.135], WH, 'cloth', [0.1, 0, 0]),
          P.cone([0.03, 0.06, 4], [0.035, 0.39, 0.15], RED, 'cloth', [0, 0, Math.PI / 2]),
          P.cone([0.03, 0.06, 4], [-0.035, 0.39, 0.15], RED, 'cloth', [0, 0, -Math.PI / 2]),
          P.knob(0.018, [0, 0.39, 0.155], RED, 'cloth')
        ]),
        head: CHK.head(SKIN).concat([
          P.box([0.22, 0.06, 0.23], [0, 0.33, -0.01], HAIR, 'ch_fold'),
          P.box([0.22, 0.24, 0.06], [0, 0.23, -0.12], HAIR, 'ch_fold'),
          P.box([0.05, 0.014, 0.015], [0.03, 0.172, 0.121], HAIR, 'plain', [0, 0, 0.25]), P.box([0.05, 0.014, 0.015], [-0.03, 0.172, 0.121], HAIR, 'plain', [0, 0, -0.25]),
          // 黑礼帽
          P.cyl([0.19, 0.19, 0.02, 12], [0, 0.35, 0], BLK, 'ch_fold'),
          P.cyl([0.12, 0.12, 0.26, 10], [0, 0.49, 0], BLK, 'ch_fold'),
          P.cyl([0.124, 0.124, 0.045, 10], [0, 0.385, 0], RED, 'cloth')
        ]),
        gearR: CHK.held(B, 0.3, [
          P.tube([0.012, 0.012, 0.3, 6], [0, 0, 0.1], 0x111114, 'plain', [Math.PI / 2, 0, 0]),
          P.cyl([0.014, 0.014, 0.05, 6], [0, 0, 0.23], WH, 'plain', [Math.PI / 2, 0, 0]),
          P.knob(0.02, [0, 0, 0.26], 0xffffff, '!plain')
        ]),
        // 外黑里红的大斗篷（红里子比外面宽一点，边上和摆起来时看得见）
        cape: CHK.cape(BLK, 1.0, 0.5, 0.7).concat([
          P.tbox([0.52, 0.73, 0.97, 0.012, 0.012], [0, -0.475, -0.008], 0xb01828, 'ch_fold')
        ])
      });
  }
};

// ---- 猫骑士：穿蓝白罩袍的黑白花猫。黑毛白胸口白爪子、竖起来的白尖尾巴、尖耳朵从小圆盔的耳洞里钻出来、黄眼睛和胡须 ----
CHD.catknight = {
  body: { sh: 0.23, thigh: 0.36, shin: 0.33, upper: 0.3, fore: 0.28, neck: 0.42 },
  hunch: 0.1, armOut: 0.04, tailLift: 0.45,
  make: function (B) {
    var P = CHP, BLK = 0x2a2a2a, WHT = 0xf2f0ea, TAB = 0x3a5ac8, STR = 0xf4f2ec, PINK = 0xf0a0b0, PAD = 0xf2e6da, EYE = 0xd8e050;
    return CHK.join(
      CHK.arms(B, { upper: BLK, upperT: 'fur', fore: BLK, foreT: 'fur', hand: PAD, handT: 'skin', w: 0.95 }),
      CHK.legs([
        [P.tube([0.095, 0.08, B.thigh + 0.05, 8], [0, -B.thigh / 2 + 0.02, 0], BLK, 'fur'), P.knob(0.09, [0, -B.thigh, 0.01], BLK, 'fur')],
        [P.tube([0.075, 0.06, B.shin, 8], [0, -B.shin / 2, 0], BLK, 'fur'), P.box([0.13, 0.08, 0.24], [0, -B.shin - 0.04, 0.06], WHT, 'fur')]
      ]),
      {
        pelvis: CHK.hips(B, { hips: TAB, hipsT: 'cloth', belt: 0xc8a060, beltT: 'ch_leather', buckle: 0xa8aeb6, skirt: TAB, skirtT: 'cloth', skirtLen: 0.24 }),
        chest: [
          P.tbox([0.31, 0.29, 0.18, 0.2, 0.2], [0, 0.0, 0], TAB, 'cloth'),
          P.tbox([0.48, 0.32, 0.34, 0.27, 0.21], [0, 0.235, -0.005], TAB, 'cloth'),
          P.box([0.1, 0.35, 0.03], [0, 0.22, 0.125], STR, 'cloth', [0.1, 0, 0]),
          P.ball(0.13, [0, 0.39, -0.02], BLK, 'fur', [1.6, 0.5, 1.1]),
          P.box([0.1, 0.09, 0.03], [0, 0.42, 0.11], WHT, 'fur')
        ],
        head: [
          P.tube([0.06, 0.07, 0.1, 6], [0, 0.04, 0], BLK, 'fur'),
          P.box([0.24, 0.2, 0.22], [0, 0.21, 0.0], BLK, 'fur'),
          // 尖耳朵 + 粉色耳朵里
          P.cone([0.06, 0.18, 4], [0.095, 0.4, -0.01], BLK, 'fur', [0, 0, -0.22]), P.cone([0.06, 0.18, 4], [-0.095, 0.4, -0.01], BLK, 'fur', [0, 0, 0.22]),
          P.cone([0.036, 0.11, 4], [0.093, 0.39, 0.014], PINK, 'plain', [0, 0, -0.22]), P.cone([0.036, 0.11, 4], [-0.093, 0.39, 0.014], PINK, 'plain', [0, 0, 0.22]),
          // 白口鼻、粉鼻头、胡须、黄眼睛竖瞳
          P.box([0.12, 0.07, 0.06], [0, 0.16, 0.115], WHT, 'fur'),
          P.knob(0.018, [0, 0.19, 0.147], PINK, 'plain'),
          P.box([0.09, 0.006, 0.006], [0.1, 0.165, 0.13], 0xf0f0f0, 'plain', [0, 0, 0.12]), P.box([0.09, 0.006, 0.006], [0.1, 0.15, 0.13], 0xf0f0f0, 'plain', [0, 0, -0.1]),
          P.box([0.09, 0.006, 0.006], [-0.1, 0.165, 0.13], 0xf0f0f0, 'plain', [0, 0, -0.12]), P.box([0.09, 0.006, 0.006], [-0.1, 0.15, 0.13], 0xf0f0f0, 'plain', [0, 0, 0.1]),
          P.box([0.05, 0.04, 0.02], [0.055, 0.235, 0.108], EYE, 'plain'), P.box([0.05, 0.04, 0.02], [-0.055, 0.235, 0.108], EYE, 'plain'),
          P.box([0.012, 0.036, 0.01], [0.055, 0.235, 0.12], 0x101010, 'plain'), P.box([0.012, 0.036, 0.01], [-0.055, 0.235, 0.12], 0x101010, 'plain'),
          // 留了耳洞的小圆盔
          P.lathe([10, 0.14, 0.0, 0.135, 0.05, 0.1, 0.1, 0.0, 0.115], [0, 0.29, -0.01], STEEL_D, 'ch_plate')
        ],
        // 竖起来的黑尾巴：先往后伸出身体轮廓，再往上翘过肩膀、立在头的左边，尾尖往前勾、一点白（按 tailLift 0.45 摆好）
        tail: [
          P.tube([0.05, 0.045, 0.252, 6], [0.015, -0.048, -0.099], BLK, 'fur', [-2.021, 0, -0.136]),
          P.knob(0.05, [0.03, -0.096, -0.198], BLK, 'fur'),
          P.tube([0.047, 0.05, 0.359, 6], [0.075, 0.018, -0.308], BLK, 'fur', [-0.772, 0, -0.277]),
          P.knob(0.047, [0.12, 0.131, -0.419], BLK, 'fur'),
          P.tube([0.043, 0.047, 0.353, 6], [0.165, 0.275, -0.477], BLK, 'fur', [-0.386, 0, -0.282]),
          P.knob(0.043, [0.21, 0.419, -0.535], BLK, 'fur'),
          // 尾尖往前勾一下，白色尾尖
          P.tube([0.04, 0.043, 0.178, 6], [0.23, 0.488, -0.519], BLK, 'fur', [0.236, 0, -0.274]),
          P.knob(0.06, [0.25, 0.557, -0.502], WHT, 'fur')
        ]
      });
  }
};

// ---- 提灯骑士：守夜的骑士。夜蓝色板甲铜边、圆顶面盔里透出暖黄的光、深蓝披风和金色月牙扣、右肩上挑着一根长杆，杆头挂着发光的提灯 ----
CHD.lampknight = {
  body: { sh: 0.27 },
  swingR: 0.3, holdR: { ARX: -0.25, ARZ: -0.15, FRX: -1.35 },
  make: function (B) {
    var P = CHP, BK = 0x2a3a5a, BK2 = 0x1e2a44, BR = 0xc8a050, GLOW = 0xffd870, IRON = 0x2a2a30;
    var leg = CHK.leg(B, { thigh: BK, knee: BK2, shin: BK, boot: BK2, bootT: 'ch_plate', toe: BK, w: 1.06 });
    var arms = CHK.arms(B, { upper: BK2, pauldron: BK, pw: 1.1, elbow: BK, fore: BK, cuff: BR, cuffT: 'gold', hand: BK2, handT: 'ch_plate', w: 1.05 });
    // 灯杆和提灯：按小臂抬到肩膀前面时（地面姿势 + holdR）摆正，杆子往前上方挑，灯往下垂
    var u = [-0.32, 0.42, 0.85], L = 0.75, tip = [u[0] * L, u[1] * L, u[2] * L];
    var at = function (dy) { return [tip[0], tip[1] + dy, tip[2]]; };
    var lamp = CHK.held(B, 2.26, [
      P.tube([0.02, 0.02, 0.9, 6], [u[0] * 0.3, u[1] * 0.3, u[2] * 0.3], 0x5a4632, 'wood', [1.111, 0, 0.3257]),
      P.knob(0.026, at(0), IRON, 'metal'),
      P.box([0.012, 0.06, 0.012], at(-0.04), IRON, 'metal'),
      P.cone([0.085, 0.06, 4], at(-0.09), IRON, 'metal', [0, Math.PI / 4, 0]),
      P.box([0.14, 0.025, 0.14], at(-0.125), IRON, 'metal'),
      P.box([0.11, 0.13, 0.11], at(-0.2), 0xffd060, '!plain'),
      P.box([0.018, 0.14, 0.018], [tip[0] + 0.06, tip[1] - 0.2, tip[2] + 0.06], IRON, 'metal'),
      P.box([0.018, 0.14, 0.018], [tip[0] - 0.06, tip[1] - 0.2, tip[2] + 0.06], IRON, 'metal'),
      P.box([0.14, 0.025, 0.14], at(-0.275), IRON, 'metal')
    ]);
    return CHK.join(CHK.legs(leg), arms, {
      pelvis: CHK.hips(B, { hips: BK2, faulds: BK, buckle: BR, skirt: BK2, skirtLen: 0.36 }),
      chest: CHK.torso(B, { waist: BK2, chest: BK, gorget: BK2 }).concat([
        P.box([0.3, 0.03, 0.03], [0, 0.07, 0.15], BR, 'gold'),
        P.p('ch_arc', [0.045, 0.014, 3, 8, Math.PI * 1.2], [0, 0.4, 0.15], 0xe2c040, '!gold', [0, 0, Math.PI * 0.4])
      ]),
      head: [
        P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], BK2, 'ch_chain'),
        P.lathe([10, 0.15, 0.0, 0.155, 0.12, 0.14, 0.22, 0.09, 0.3, 0.0, 0.32], [0, 0.08, 0], BK, 'ch_plate'),
        P.cyl([0.158, 0.156, 0.03, 10], [0, 0.135, 0], BR, 'gold'),
        P.box([0.22, 0.03, 0.04], [0, 0.25, 0.142], GLOW, '!plain'),
        P.box([0.03, 0.16, 0.03], [0, 0.32, 0.12], BR, 'gold', [-0.45, 0, 0])
      ],
      gearR: lamp,
      cape: CHK.cape(0x22325a, 0.98, 0.48, 0.64)
    });
  }
};

// ---- 攻城骑士：扛着云梯的工兵。带护耳的皮帽、帽子上的铜框护目镜、脸上一道煤灰、皮夹克、工具带上挂着小锤和扳手、背上的木工具箱、木槌 ----
CHD.engineer = {
  make: function (B) {
    var P = CHP, BR = 0x6a3e26, BR_D = 0x40261a, BOOT = 0x2a1c14, CAP = 0x6a4428, BRASS = 0xc89a3a, IRON = 0x5a6068, WOOD = 0x8a5a2a;
    var arms = CHK.arms(B, { upper: BR, upperT: 'ch_leather', fore: BR, foreT: 'ch_leather', cuff: LEATHER_D, cuffT: 'ch_leather', hand: BOOT });
    arms.armL.push(P.ball(0.11, [0.03, -0.01, 0], BR_D, 'ch_leather', [1.15, 0.75, 1.1]));
    arms.armR.push(P.ball(0.11, [-0.03, -0.01, 0], BR_D, 'ch_leather', [1.15, 0.75, 1.1]));
    return CHK.join(
      CHK.legs(CHK.leg(B, { thigh: 0x6a6a5a, thighT: 'cloth', shin: LEATHER_D, shinT: 'ch_leather', boot: BOOT, cuff: LEATHER })),
      arms,
      {
        pelvis: CHK.hips(B, { hips: BR_D, hipsT: 'ch_leather', belt: BOOT, buckle: BRASS, skirt: BR, skirtT: 'ch_leather', skirtLen: 0.24 }).concat([
          // 工具带上挂的小锤（左）和扳手（右）
          P.box([0.024, 0.17, 0.024], [0.2, -0.08, 0.04], 0x7a5232, 'wood'),
          P.box([0.035, 0.035, 0.08], [0.2, 0.0, 0.05], IRON, 'metal'),
          P.box([0.022, 0.16, 0.012], [-0.2, -0.08, 0.04], 0x8a8e98, 'metal'),
          P.box([0.055, 0.04, 0.014], [-0.2, 0.005, 0.04], 0x8a8e98, 'metal')
        ]),
        chest: CHK.torso(B, { waist: BR_D, waistT: 'ch_leather', chest: BR, chestT: 'ch_leather' }).concat([
          P.box([0.06, 0.6, 0.03], [0, 0.22, 0.16], BOOT, 'ch_leather', [0.1, 0, 0.6])
        ]),
        head: CHK.head(SKIN).concat([
          P.box([0.06, 0.02, 0.01], [-0.065, 0.165, 0.119], 0x5a4a48, 'plain'),
          // 带护耳的皮帽 + 帽子上的护目镜
          P.ball(0.13, [0, 0.3, -0.025], CAP, 'ch_leather', [1.0, 0.8, 1.05]),
          P.box([0.03, 0.13, 0.08], [0.112, 0.21, -0.01], CAP, 'ch_leather'), P.box([0.03, 0.13, 0.08], [-0.112, 0.21, -0.01], CAP, 'ch_leather'),
          // 皮帽后面垂到后颈的护颈
          P.box([0.23, 0.16, 0.12], [0, 0.2, -0.1], CAP, 'ch_leather'),
          P.cyl([0.04, 0.04, 0.026, 8], [0.05, 0.34, 0.105], BRASS, 'gold', [Math.PI / 2 - 0.45, 0, 0]),
          P.cyl([0.04, 0.04, 0.026, 8], [-0.05, 0.34, 0.105], BRASS, 'gold', [Math.PI / 2 - 0.45, 0, 0]),
          P.cyl([0.03, 0.03, 0.03, 8], [0.05, 0.342, 0.108], 0x6ad0ff, '!plain', [Math.PI / 2 - 0.45, 0, 0]),
          P.cyl([0.03, 0.03, 0.03, 8], [-0.05, 0.342, 0.108], 0x6ad0ff, '!plain', [Math.PI / 2 - 0.45, 0, 0])
        ]),
        // 背上的木工具箱：两道铁箍、提手、侧面绑一卷绳子
        pack: [
          P.box([0.36, 0.22, 0.2], [0, 0.2, -0.28], WOOD, 'wood'),
          P.box([0.025, 0.226, 0.206], [0.11, 0.2, -0.28], IRON, 'metal'), P.box([0.025, 0.226, 0.206], [-0.11, 0.2, -0.28], IRON, 'metal'),
          P.box([0.15, 0.025, 0.03], [0, 0.345, -0.28], 0x5a3a20, 'wood'),
          P.box([0.02, 0.04, 0.02], [0.065, 0.325, -0.28], IRON, 'metal'), P.box([0.02, 0.04, 0.02], [-0.065, 0.325, -0.28], IRON, 'metal'),
          P.p('torus', [0.07, 0.022, 4, 10], [0.2, 0.18, -0.28], 0xc8b080, 'cloth', [0, Math.PI / 2, 0])
        ],
        // 木槌：木柄 + 横着的圆木槌头
        gearR: CHK.held(B, 0.5, [
          P.tube([0.018, 0.022, 0.38, 6], [0, 0, 0.12], 0x7a5232, 'wood', [Math.PI / 2, 0, 0]),
          P.cyl([0.07, 0.07, 0.18, 8], [0, 0, 0.33], 0x9a6a3a, 'wood')
        ])
      });
  }
};
