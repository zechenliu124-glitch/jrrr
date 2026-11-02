'use strict';
// ============================================================
//  武器图标：每把武器（和它的超武）都是一个低多边形小模型，
//  零件格式和 MODEL.build 一样，用游戏里同一套像素贴图和光照渲染成小图
//  贴图名前面加 '!' 表示发光零件（不吃光照：火焰、魔法、宝石、闪电）
//  ICONS.model 定义图标，ICONS.use 对应到游戏 id
// ============================================================
(function () {
  var PI = Math.PI;

  // ---------------- 额外的零件形状（名字都以 iw_ 开头） ----------------
  // 剑刃：菱形截面（中间一道脊，两边斜面一亮一暗），沿 +Y 从 0 长到 len
  // [长, 宽, 厚, 剑尖长, 根部宽度倍数]
  MODEL.extraGeo.iw_blade = function (s) {
    var L = s[0], W = s[1] / 2, T = s[2] / 2, tip = s[3] != null ? s[3] : s[1], base = s[4] != null ? s[4] : 1;
    var y1 = L - tip, pos = [], uv = [];
    var ring = function (y, w) { return [[-w, y, 0], [0, y, T], [w, y, 0], [0, y, -T]]; };
    var a = ring(0, W * base), b = ring(y1, W), top = [0, L, 0];
    var tri = function (p, q, r) {
      [p, q, r].forEach(function (v) { pos.push(v[0], v[1], v[2]); uv.push(v[0] / (2 * W) + 0.5, v[1] / L); });
    };
    for (var i = 0; i < 4; i++) {
      var j = (i + 1) % 4;
      tri(a[i], a[j], b[j]); tri(a[i], b[j], b[i]);
      tri(b[i], b[j], top);
    }
    tri(a[0], a[2], a[1]); tri(a[0], a[3], a[2]);
    return iwGeo(pos, uv);
  };

  // 挤出的平面多边形（斧刃、镰刀刃、闪电、火苗……）：[厚, [x0,y0, x1,y1, ...], [洞的点]（可选）]
  // 画在 XY 平面上，沿 Z 挤出并居中；整块小贴图按包围盒铺一次
  MODEL.extraGeo.iw_poly = function (s) {
    var pts = s[1], sh = new THREE.Shape(), i;
    sh.moveTo(pts[0], pts[1]);
    for (i = 2; i + 1 < pts.length; i += 2) sh.lineTo(pts[i], pts[i + 1]);
    if (s[2]) {
      var h = s[2], hole = new THREE.Path();
      hole.moveTo(h[0], h[1]);
      for (i = 2; i + 1 < h.length; i += 2) hole.lineTo(h[i], h[i + 1]);
      sh.holes.push(hole);
    }
    var g = new THREE.ExtrudeGeometry(sh, { depth: s[0], bevelEnabled: false, curveSegments: 1 });
    g.translate(0, 0, -s[0] / 2);
    if (g.index) g = g.toNonIndexed();
    g.computeBoundingBox();
    var bb = g.boundingBox, w = (bb.max.x - bb.min.x) || 1, hh = (bb.max.y - bb.min.y) || 1, d = (bb.max.z - bb.min.z) || 1;
    var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (i = 0; i < p.count; i++) {
      var fx = (p.getX(i) - bb.min.x) / w, fy = (p.getY(i) - bb.min.y) / hh;
      if (Math.abs(n.getZ(i)) > 0.7) u.setXY(i, fx, fy);
      else u.setXY(i, (fx + fy) * 0.5, (p.getZ(i) - bb.min.z) / d);
    }
    return g;
  };

  // 圆弧管（光环、锁环、钩子）：[半径, 管粗, 截面分段, 弧分段, 弧度]，从 +X 开始逆时针
  MODEL.extraGeo.iw_arc = function (s) { return new THREE.TorusGeometry(s[0], s[1], s[2] || 5, s[3] || 10, s[4] || PI * 2); };

  // 粗细会变的弯管（弓臂、香蕉、龙角、牛角）：沿 XY 平面里的圆弧，从 +X 开始逆时针
  // [半径, 粗A, 粗B, 弧分段, 弧度, 截面边数, 模式（0 中间粗两头细，1 从 A 渐变到 B）, 截面 Z 方向压扁倍数]
  MODEL.extraGeo.iw_horn = function (s) {
    var R = s[0], rA = s[1], rB = s[2], N = s[3] || 8, arc = s[4] || PI, M = s[5] || 5, mode = s[6] || 0, fz = s[7] || 1;
    var rings = [], pos = [], uv = [], i, j;
    for (i = 0; i <= N; i++) {
      var t = i / N, a = arc * t, ca = Math.cos(a), sa = Math.sin(a);
      var r = mode ? rA + (rB - rA) * t : rB + (rA - rB) * Math.sin(PI * t);
      var ring = [];
      for (j = 0; j < M; j++) {
        var th = PI * 2 * j / M, k = R + r * Math.cos(th);
        ring.push([k * ca, k * sa, r * Math.sin(th) * fz]);
      }
      ring.c = [R * ca, R * sa, 0];
      rings.push(ring);
    }
    var tri = function (p, q, w, tv) {
      [p, q, w].forEach(function (v, k) { pos.push(v[0], v[1], v[2]); uv.push(k === 1 ? 1 : 0, tv); });
    };
    for (i = 0; i < N; i++) for (j = 0; j < M; j++) {
      var jn = (j + 1) % M, A = rings[i][j], B = rings[i + 1][j], C = rings[i + 1][jn], D = rings[i][jn];
      tri(A, B, C, i / N); tri(A, C, D, i / N);
    }
    for (j = 0; j < M; j++) {
      jn = (j + 1) % M;
      tri(rings[0].c, rings[0][j], rings[0][jn], 0);
      tri(rings[N].c, rings[N][jn], rings[N][j], 1);
    }
    return iwGeo(pos, uv);
  };

  // 旋转体（瓶子、木桶、碗形护手）：[分段, r0, y0, r1, y1, ...]，从下往上写
  MODEL.extraGeo.iw_lathe = function (s) {
    var pts = [];
    for (var i = 1; i + 1 < s.length; i += 2) pts.push(new THREE.Vector2(s[i], s[i + 1]));
    return new THREE.LatheGeometry(pts, s[0]);
  };

  // 梯形块（上下大小不同的方块）：[上宽, 下宽, 高, 上厚, 下厚]
  MODEL.extraGeo.iw_taper = function (s) {
    var g = new THREE.BoxGeometry(1, 1, 1), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) {
      var top = p.getY(i) > 0;
      p.setXYZ(i, p.getX(i) * (top ? s[0] : s[1]), p.getY(i) * s[2], p.getZ(i) * (top ? s[3] : s[4]));
    }
    g.computeVertexNormals();
    return g;
  };

  // 由三角形顶点列表做几何体（每个面单独的法线，棱角分明）
  function iwGeo(pos, uv) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  }

  // ---------------- 零件小工具 ----------------
  // 通用：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图]（和 MODEL.build 的格式一样，只是参数顺序方便写）
  function P(type, s, pos, c, t, rot, sc) { return [type, s, pos, c, rot || null, sc || null, t || null]; }
  function box(s, pos, c, t, rot, sc) { return P('box', s, pos, c, t, rot, sc); }

  // 从点 a 到点 b 的一根杆子（box：s = [宽, 厚]；cyl：s = [b 端半径, a 端半径, 分段]；cone：s = [底半径, 分段]，尖在 b 端）
  var V0 = new THREE.Vector3(), V1 = new THREE.Vector3(), Q = new THREE.Quaternion(), EU = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0);
  function rod(type, a, b, s, c, t) {
    var az = a[2] || 0, bz = b[2] || 0;
    V0.set(b[0] - a[0], b[1] - a[1], bz - az);
    var L = V0.length();
    Q.setFromUnitVectors(UP, V0.normalize());
    EU.setFromQuaternion(Q);
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (az + bz) / 2], rot = [EU.x, EU.y, EU.z];
    if (type === 'box') return P('box', [s[0], L, s[1] || s[0]], mid, c, t, rot);
    if (type === 'cone') return P('cyl', [0, s[0], L, s[1] || 5], mid, c, t, rot);
    return P(type, [s[0], s[1] != null ? s[1] : s[0], L, s[2] || 6], mid, c, t, rot);
  }

  // 把一组零件整体旋转（弧度 [x,y,z]）、平移、等比缩放
  var M0 = new THREE.Matrix4(), M1 = new THREE.Matrix4(), SC = new THREE.Vector3();
  function xf(parts, rot, pos, k) {
    k = k || 1;
    EU.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
    Q.setFromEuler(EU);
    M0.compose(V0.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0), Q, SC.set(k, k, k));
    return parts.map(function (p) {
      p = p.slice();
      var r = p[4] || [0, 0, 0], s = p[5] || [1, 1, 1];
      EU.set(r[0], r[1], r[2]);
      Q.setFromEuler(EU);
      M1.compose(V1.set(p[2][0], p[2][1], p[2][2]), Q, SC.set(s[0], s[1], s[2]));
      M1.premultiply(M0);
      M1.decompose(V1, Q, SC);
      EU.setFromQuaternion(Q);
      p[2] = [V1.x, V1.y, V1.z]; p[4] = [EU.x, EU.y, EU.z]; p[5] = [SC.x, SC.y, SC.z];
      return p;
    });
  }

  // 平面多边形的点：星形（闪光、爆炸）
  function star(n, R, r, rot) {
    var out = [];
    for (var i = 0; i < n * 2; i++) {
      var a = (rot || 0) + PI * i / n + PI / 2, k = i % 2 ? r : R;
      out.push(Math.cos(a) * k, Math.sin(a) * k);
    }
    return out;
  }

  // 发光零件用的材质：顶点色 × 像素贴图，不吃光照（和游戏里的火球、锻炉火光一样）
  var glowMat = null;
  function getGlowMat() {
    if (!glowMat) glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas });
    return glowMat;
  }

  // 零件表 → 图标模型（发光零件单独一个网格）
  function mk(parts) {
    return function () {
      var lit = [], glow = [];
      parts.forEach(function (p) {
        var t = p[6];
        if (typeof t === 'string' && t.charAt(0) === '!') { p = p.slice(); p[6] = t.slice(1) || null; glow.push(p); }
        else lit.push(p);
      });
      var g = new THREE.Group();
      if (lit.length) g.add(new THREE.Mesh(MODEL.build(lit, false), MODEL.material()));
      if (glow.length) g.add(new THREE.Mesh(MODEL.build(glow, false), getGlowMat()));
      return g;
    };
  }

  // 定义一把武器的图标：weapon id → 图标名 'w_<id>'（零件表留着给超武改）
  var WP = {};
  function weapon(id, parts, opts) {
    WP[id] = parts;
    ICONS.model('w_' + id, mk(parts), opts);
    ICONS.use('weapon', id, 'w_' + id);
  }
  // 超武图标：'x_<id>'（不定义的话，界面会用原武器图标的金色版）
  function evolved(id, parts, opts) {
    ICONS.model('x_' + id, mk(parts), opts);
    ICONS.use('evo', id, 'x_' + id);
  }
  // 按颜色换色：map = { 原颜色: 新颜色 }；tiles = { 原颜色: 新贴图 }（可选）
  function recolor(parts, map, tiles) {
    return parts.map(function (p) {
      var c = map[p[3]], t = tiles && tiles[p[3]];
      if (c == null && t == null) return p;
      p = p.slice();
      if (c != null) p[3] = c;
      if (t != null) p[6] = t;
      return p;
    });
  }
  // 四角星闪光（正面朝 +Z，发光）
  function spark(pos, k, c) {
    return P('iw_poly', [0.04, star(4, 0.22 * (k || 1), 0.055 * (k || 1))], pos, c || 0xfffbe8, '!plain');
  }

  // ---------------- 常用颜色 ----------------
  var STEEL = 0xdfe6ee, IRON = 0x5a5f6a, GOLD = 0xe2b23a, GOLD_L = 0xffd84a;
  var WOOD = 0x8a5a30, WOOD_D = 0x5a3820, LEATHER = 0x6a3e22, BONE = 0xf3ead0;
  var FIRE_R = 0xff4a10, FIRE_O = 0xff8a1a, FIRE_Y = 0xffd040, FIRE_W = 0xfff4c0;

  // 卡通火苗（底部中心在原点，朝上，正面朝 +Z）：三层叠起来，外焰橙、内焰黄、焰心白
  var FLAME = [0, 0, 0.18, 0.04, 0.28, 0.16, 0.3, 0.32, 0.24, 0.5, 0.28, 0.7, 0.13, 0.56, 0.08, 0.74, 0.02, 1.0, -0.08, 0.7, -0.14, 0.54, -0.26, 0.64, -0.27, 0.42, -0.3, 0.26, -0.26, 0.12, -0.16, 0.03];
  function flame(pos, k, rot, cols) {
    cols = cols || [FIRE_O, FIRE_Y, FIRE_W];
    return xf([
      P('iw_poly', [0.08, FLAME], [0, 0, 0], cols[0], '!plain'),
      P('iw_poly', [0.08, FLAME], [0, 0.02, 0.06], cols[1], '!plain', null, [0.64, 0.62, 1]),
      P('iw_poly', [0.08, FLAME], [0, 0.03, 0.12], cols[2], '!plain', null, [0.32, 0.3, 1])
    ], rot || null, pos, k || 1);
  }

  // ---------------- 小贴图（骰子点数、旋风条纹） ----------------
  (function () {
    var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就退回默认贴图 */ } };
    // 骰子面：奶白底 + 3×3 的点（彩色贴图，配白色顶点色）；pips 是点的中心
    // gold：金骰子（金底、白点、深金色边，点的右下有一点影子）
    var die = function (pips, red, gold) {
      return function (x, y) {
        for (var i = 0; i < pips.length; i++) {
          var dx = x - pips[i][0], dy = y - pips[i][1], k = red ? 2 : 1;
          if (Math.abs(dx) <= k && Math.abs(dy) <= k) return red ? [214, 28, 44] : gold ? [255, 252, 240] : [36, 30, 46];
          if (gold && dx > k && dx <= k + 1 && dy > -k && dy <= k + 1) return [178, 112, 18];
        }
        if (x === 0 || y === 0 || x === 15 || y === 15) return gold ? [196, 130, 24] : [196, 188, 176];
        return gold ? [252, 204, 62] : [250, 246, 236];
      };
    };
    var P1 = [[7.5, 7.5]], P3 = [[3.5, 3.5], [7.5, 7.5], [11.5, 11.5]], P5 = [[3.5, 3.5], [11.5, 3.5], [7.5, 7.5], [3.5, 11.5], [11.5, 11.5]];
    add('iw_die1', die(P1, true));
    add('iw_die3', die(P3));
    add('iw_die5', die(P5));
    add('iw_gdie1', die(P1, true, true));
    add('iw_gdie3', die(P3, false, true));
    add('iw_gdie5', die(P5, false, true));
    // 旋风：斜着卷上去的条纹（不用共享的随机数，免得改变后面其他贴图的花纹）
    add('iw_swirl', function (x, y) {
      var k = (x + y * 0.6) % 8;
      return (k < 2 ? 168 : k < 3 ? 205 : 248) + ((x * 7 + y * 13) % 5);
    });
  })();

  // ============================================================
  //  30 把武器
  // ============================================================

  // 大剑：宽刃双手剑，金色护手、长握把、红宝石
  weapon('sword', [
    P('iw_blade', [1.55, 0.32, 0.09, 0.28, 1.0], [0, 0.06, 0], STEEL, 'ch_plate'),
    box([0.76, 0.13, 0.16], [0, 0.03, 0], GOLD, 'gold'),
    P('oct', [0.085], [0.4, 0.03, 0], GOLD, 'gold'),
    P('oct', [0.085], [-0.4, 0.03, 0], GOLD, 'gold'),
    P('oct', [0.07], [0, 0.03, 0.08], 0xff3040, '!plain'),
    P('cyl', [0.06, 0.06, 0.44, 6], [0, -0.2, 0], LEATHER, 'ch_leather'),
    P('oct', [0.1], [0, -0.46, 0], GOLD, 'gold')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.45 });

  // 火焰法杖：粗木杖顶上金爪抓着一大团火
  weapon('firestaff', [
    P('cyl', [0.075, 0.09, 1.3, 6], [0, -0.1, 0], WOOD, 'wood'),
    P('cone', [0.1, 0.16, 5], [0, -0.82, 0], IRON, 'metal', [PI, 0, 0]),
    P('cyl', [0.1, 0.1, 0.1, 6], [0, 0.18, 0], GOLD, 'gold'),
    P('cyl', [0.13, 0.09, 0.2, 6], [0, 0.6, 0], GOLD, 'gold'),
    rod('cone', [0.08, 0.66, 0], [0.3, 1.02, 0.04], [0.075, 4], GOLD, 'gold'),
    rod('cone', [-0.08, 0.66, 0], [-0.3, 1.02, 0.04], [0.075, 4], GOLD, 'gold'),
    // 火：外焰橙、内焰黄、焰心白，层层往镜头这边挪
    P('ball', [0.34, 1], [0, 0.98, 0], FIRE_O, '!plain'),
    P('cone', [0.3, 0.72, 6], [0, 1.4, 0], FIRE_O, '!plain'),
    P('cone', [0.14, 0.38, 5], [0.25, 1.24, 0], FIRE_R, '!plain', [0, 0, -0.55]),
    P('cone', [0.14, 0.38, 5], [-0.24, 1.27, 0], FIRE_R, '!plain', [0, 0, 0.55]),
    P('ball', [0.23, 1], [0, 0.95, 0.17], FIRE_Y, '!plain'),
    P('cone', [0.19, 0.48, 6], [0, 1.28, 0.17], FIRE_Y, '!plain'),
    P('ball', [0.12, 1], [0, 0.92, 0.34], FIRE_W, '!plain')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.28 });

  // 骨头：经典的两头圆疙瘩
  weapon('bone', [
    P('cyl', [0.12, 0.12, 1.0, 6], [0, 0, 0], BONE, 'bone'),
    P('ball', [0.2, 1], [0.13, 0.56, 0], BONE, 'bone'),
    P('ball', [0.2, 1], [-0.13, 0.56, 0], BONE, 'bone'),
    P('ball', [0.2, 1], [0.13, -0.56, 0], BONE, 'bone'),
    P('ball', [0.2, 1], [-0.13, -0.56, 0], BONE, 'bone')
  ], { tilt: -PI / 4, yaw: 0.3, pitch: 0.35, zoom: 1.15 });

  // 飞斧：短木柄 + 带胡子的单刃斧头，刃口一道亮边
  weapon('axe', [
    box([0.11, 1.3, 0.11], [0, 0, 0], WOOD, 'wood'),
    box([0.135, 0.34, 0.135], [0, -0.44, 0], LEATHER, 'ch_leather'),
    box([0.15, 0.08, 0.15], [0, -0.67, 0], IRON, 'metal'),
    box([0.2, 0.32, 0.17], [0, 0.48, 0], IRON, 'metal'),
    P('iw_poly', [0.08, [0.06, 0.62, 0.3, 0.7, 0.5, 0.9, 0.6, 0.62, 0.58, 0.34, 0.46, 0.08, 0.32, 0.28, 0.12, 0.36, 0.06, 0.4]], [0, 0, 0], 0xaab3be, 'metal'),
    P('iw_poly', [0.09, [0.45, 0.83, 0.5, 0.9, 0.6, 0.62, 0.58, 0.34, 0.46, 0.08, 0.41, 0.17, 0.5, 0.35, 0.52, 0.62]], [0, 0, 0], 0xf0f6fc, 'plain')
  ], { tilt: -0.55, yaw: 0.35, pitch: 0.3, zoom: 1.38 });

  // 长弓：拉满的弓 + 搭在弦上的箭（红白箭羽）
  weapon('bow', [
    P('iw_horn', [0.9, 0.11, 0.06, 10, 1.85, 5, 0], [0, 0, 0], 0xc08a48, 'wood', [0, 0, -0.925]),
    box([0.17, 0.3, 0.17], [0.9, 0, 0], LEATHER, 'ch_leather'),
    rod('box', [0.54, 0.72, 0], [0.04, 0, 0], [0.065, 0.065], 0xf4efe0, 'plain'),
    rod('box', [0.54, -0.72, 0], [0.04, 0, 0], [0.065, 0.065], 0xf4efe0, 'plain'),
    rod('box', [-0.02, 0, 0.04], [1.25, 0, 0.04], [0.08, 0.08], 0x8a5a2a, 'wood'),
    P('cone', [0.15, 0.34, 4], [1.38, 0, 0.04], STEEL, 'metal', [0, 0, -PI / 2]),
    P('iw_poly', [0.04, [0, 0, 0.32, 0, 0.4, 0.17, 0.1, 0.17]], [-0.04, 0.0, 0.04], 0xe8323a, 'cloth'),
    P('iw_poly', [0.04, [0, 0, 0.32, 0, 0.4, -0.17, 0.1, -0.17]], [-0.04, 0.0, 0.04], 0xf4f4f4, 'cloth')
  ], { tilt: PI / 4, yaw: 0.3, pitch: 0.3, zoom: 1.74 });

  // 神盾：圆形圣盾，凸起的金边、红盾面、金十字、白金盾心、一圈铆钉
  weapon('aegis', [
    P('cyl', [0.8, 0.8, 0.1, 14], [0, 0, -0.02], 0xb07a20, 'gold', [PI / 2, 0, 0]),
    P('cyl', [0.7, 0.7, 0.13, 14], [0, 0, 0], 0xc82838, 'ch_plate', [PI / 2, 0, 0]),
    P('iw_arc', [0.74, 0.08, 4, 16], [0, 0, 0.06], GOLD_L, 'gold'),
    box([0.18, 1.3, 0.05], [0, 0, 0.08], GOLD_L, 'gold'),
    box([1.3, 0.18, 0.05], [0, 0, 0.08], GOLD_L, 'gold'),
    P('ball', [0.22, 1], [0, 0, 0.12], 0xfff0c8, 'gold', null, [1, 1, 0.7])
  ].concat([0, 1, 2, 3].map(function (i) {
    var a = PI / 4 + i * PI / 2;
    return P('oct', [0.07], [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.08], 0xfff2b0, 'gold');
  })), { yaw: 0.5, pitch: 0.3, tilt: 0.12, zoom: 1.17 });

  // 细剑：针一样细长的剑身 + 碗形护手和护指弧，红握把
  weapon('katana', [
    P('iw_blade', [1.7, 0.12, 0.06, 0.24, 1.0], [0, 0.1, 0], 0xeef3f8, 'ch_plate'),
    P('iw_lathe', [10, 0.03, 0, 0.17, 0.03, 0.24, 0.13], [0, -0.02, 0], GOLD, 'gold'),
    box([0.62, 0.06, 0.06], [0, 0.02, 0], GOLD, 'gold'),
    P('oct', [0.06], [0.32, 0.02, 0], GOLD, 'gold'),
    P('oct', [0.06], [-0.32, 0.02, 0], GOLD, 'gold'),
    P('iw_arc', [0.23, 0.035, 4, 8, PI], [0.0, -0.23, 0], GOLD, 'gold', [0, 0, -PI / 2]),
    P('cyl', [0.055, 0.055, 0.36, 6], [0, -0.22, 0], 0xd0283e, 'ch_leather'),
    P('oct', [0.085], [0, -0.47, 0], GOLD, 'gold')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.44 });

  // 龙卷风：几段错开的漏斗叠起来，斜条纹 + 卷起来的碎石和树叶
  weapon('tornado', [
    P('cyl', [0.66, 0.5, 0.3, 10], [0, 1.25, 0], 0xf4faff, 'iw_swirl'),
    P('cyl', [0.52, 0.4, 0.29, 9], [0.1, 0.96, 0], 0xdcefff, 'iw_swirl'),
    P('cyl', [0.41, 0.29, 0.28, 9], [0.03, 0.68, 0], 0xc6e3ff, 'iw_swirl'),
    P('cyl', [0.3, 0.19, 0.27, 8], [-0.07, 0.41, 0], 0xb2d6ff, 'iw_swirl'),
    P('cyl', [0.2, 0.1, 0.25, 7], [0.0, 0.15, 0], 0xa2ccff, 'iw_swirl'),
    P('cone', [0.1, 0.2, 6], [0.05, -0.07, 0], 0x92c2ff, 'plain', [PI, 0, 0]),
    box([0.12, 0.1, 0.1], [0.62, 0.78, 0.2], 0x8a6a4a, 'wood', [0.4, 0.3, 0.6]),
    box([0.1, 0.1, 0.1], [-0.55, 0.55, 0.15], 0x8a8a90, 'rock', [0.2, 0.5, 0.3]),
    box([0.14, 0.04, 0.09], [0.46, 0.3, 0.2], 0x5ab83a, 'leaf', [0.3, 0, 0.7])
  ], { yaw: 0.4, pitch: 0.25, zoom: 1.10 });

  // 无线匕首：发着薄荷绿光的短匕首（发光的刃脊），环形柄头
  weapon('dagger', [
    P('iw_blade', [0.78, 0.3, 0.08, 0.3, 0.85], [0, 0.04, 0], 0xc8fff0, 'ch_plate'),
    P('iw_blade', [0.66, 0.08, 0.11, 0.2, 1.0], [0, 0.06, 0], 0x7affd0, '!plain'),
    box([0.42, 0.09, 0.12], [0, 0.02, 0], 0x3a3a4a, 'metal'),
    box([0.08, 0.26, 0.08], [0, -0.14, 0], 0x2a2a38, 'ch_leather'),
    P('iw_arc', [0.09, 0.035, 4, 8], [0, -0.36, 0], 0x7affd0, '!plain')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.36 });

  // ---- 弩（三种）：沿 +X 朝前，上方 +Y，弩臂往 ±Z 张开 ----
  function crossbow(o) {
    var w = o.wood, wd = o.woodD || WOOD_D, lim = o.limb, k = o.lw || 0.1, lz = o.span || 0.8;
    var parts = [
      box([1.3, 0.16, 0.17], [0, 0, 0], w, 'wood'),
      box([0.42, 0.3, 0.2], [-0.62, -0.07, 0], wd, 'wood'),
      box([0.09, 0.16, 0.06], [-0.22, -0.15, 0], IRON, 'metal'),
      box([0.16, 0.22, 0.24], [0.63, 0.01, 0], IRON, 'metal'),
      rod('box', [0.66, 0.02, 0.1], [0.56, 0.02, lz * 0.55], [k, k], lim, o.limbT || 'metal'),
      rod('box', [0.56, 0.02, lz * 0.55], [0.38, 0.02, lz], [k * 0.8, k * 0.8], lim, o.limbT || 'metal'),
      rod('box', [0.66, 0.02, -0.1], [0.56, 0.02, -lz * 0.55], [k, k], lim, o.limbT || 'metal'),
      rod('box', [0.56, 0.02, -lz * 0.55], [0.38, 0.02, -lz], [k * 0.8, k * 0.8], lim, o.limbT || 'metal'),
      rod('box', [0.38, 0.03, lz], [-0.12, 0.09, 0], [o.str || 0.04, o.str || 0.04], 0xf0ead8, 'plain'),
      rod('box', [0.38, 0.03, -lz], [-0.12, 0.09, 0], [o.str || 0.04, o.str || 0.04], 0xf0ead8, 'plain')
    ];
    return parts.concat(o.extra || []);
  }
  // 一支弩箭（从 a 指向 b）：木杆、铁头、彩色尾羽
  function bolt(a, b, r, fl, head) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = (b[2] || 0) - (a[2] || 0), L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    var ux = dx / L, uy = dy / L, uz = dz / L, hl = r * 4;
    var tip = [b[0] + ux * hl, b[1] + uy * hl, (b[2] || 0) + uz * hl];
    var fe = [a[0] + ux * 0.22, a[1] + uy * 0.22, (a[2] || 0) + uz * 0.22];
    return [
      rod('box', a, b, [r, r], 0x7a5230, 'wood'),
      rod('cone', [b[0] - ux * 0.02, b[1] - uy * 0.02, (b[2] || 0) - uz * 0.02], tip, [r * 1.9, 4], head || STEEL, 'metal'),
      rod('box', a, fe, [r * 3.2, r * 0.5], fl, 'cloth'),
      rod('box', a, fe, [r * 0.5, r * 3.2], fl, 'cloth')
    ];
  }

  // 连弩：浅色木弩，弩身上面一个深色的箭匣（露出一排红箭羽）+ 上弦的拉杆
  weapon('revolver', crossbow({ wood: 0xc09a5a, woodD: 0x8a6a3a, limb: 0x7a5a32, limbT: 'wood', str: 0.055, extra: [
    box([0.72, 0.36, 0.22], [0.1, 0.27, 0], 0x6a3a1e, 'wood'),
    box([0.76, 0.06, 0.25], [0.1, 0.45, 0], 0x4a2812, 'wood'),
    box([0.06, 0.14, 0.05], [-0.1, 0.52, 0], 0xe8323a, 'cloth'),
    box([0.06, 0.14, 0.05], [0.06, 0.52, 0], 0xe8323a, 'cloth'),
    box([0.06, 0.14, 0.05], [0.22, 0.52, 0], 0xe8323a, 'cloth'),
    P('cone', [0.06, 0.16, 4], [0.53, 0.2, 0], STEEL, 'metal', [0, 0, -PI / 2]),
    rod('box', [-0.24, 0.44, 0.14], [-0.68, 0.12, 0.14], [0.06, 0.06], 0x4a2812, 'wood'),
    rod('box', [-0.24, 0.44, -0.14], [-0.68, 0.12, -0.14], [0.06, 0.06], 0x4a2812, 'wood'),
    box([0.07, 0.07, 0.34], [-0.24, 0.44, 0], IRON, 'metal')
  ] }), { yaw: 0.0, pitch: 0.82, spin: PI / 4, zoom: 1.29 });

  // 重弩：黑铁弩臂又粗又大，深色木身、铜瞄准镜，搭着一支巨大的重弩箭（金色尾羽）
  weapon('sniper', crossbow({ wood: 0x4a3020, woodD: 0x2e1e12, limb: 0x5a6270, lw: 0.17, span: 0.86, str: 0.05, extra: [
    box([0.56, 0.08, 0.22], [0.3, 0.1, 0], IRON, 'metal'),
    P('cyl', [0.065, 0.065, 0.5, 6], [-0.08, 0.3, 0], 0xc89a3a, 'gold', [0, 0, PI / 2]),
    P('cyl', [0.085, 0.085, 0.06, 6], [0.18, 0.3, 0], 0x3a3a46, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.085, 0.085, 0.06, 6], [-0.34, 0.3, 0], 0x3a3a46, 'metal', [0, 0, PI / 2]),
    box([0.05, 0.14, 0.05], [-0.08, 0.2, 0], 0x3a3a46, 'metal')
  ].concat(bolt([-0.22, 0.14, 0], [0.92, 0.14, 0], 0.085, 0xffd84a, 0xe8eef4)) }), { yaw: 0.0, pitch: 0.95, spin: PI / 4, zoom: 1.65 });

  // 散射弩：红木弩、钢弩臂，一次搭三支短箭，扇形张得很开（红色尾羽）
  weapon('shotgun', crossbow({ wood: 0x9a4a32, woodD: 0x6a2e1e, limb: 0xb0b8c4, span: 0.9, str: 0.05, extra: []
    .concat(bolt([-0.1, 0.13, 0], [1.05, 0.13, 0], 0.07, 0xe8323a))
    .concat(bolt([-0.08, 0.13, 0.06], [0.9, 0.13, 0.62], 0.07, 0xe8323a))
    .concat(bolt([-0.08, 0.13, -0.06], [0.9, 0.13, -0.62], 0.07, 0xe8323a)) }), { yaw: 0.0, pitch: 1.15, spin: PI / 4, zoom: 1.30 });

  // 黑洞：漆黑的球 + 斜着的紫色吸积盘 + 球边一圈亮光
  weapon('blackhole', [
    P('sphere', [0.42, 12, 8], [0, 0, 0], 0x0c0618, 'plain'),
    P('iw_arc', [0.72, 0.14, 4, 18], [0, 0, 0], 0x7a4aff, '!plain', [1.25, 0, 0.25], [1, 1, 0.5]),
    P('iw_arc', [0.53, 0.06, 4, 18], [0, 0, 0], 0xe8d8ff, '!plain', [1.25, 0, 0.25]),
    P('iw_arc', [0.96, 0.04, 4, 20], [0, 0, 0], 0x4a2ab8, '!plain', [1.25, 0, 0.25]),
    P('iw_arc', [0.45, 0.035, 4, 16], [0, 0, 0], 0xb89aff, '!plain', [-0.3, 0.45, 0]),
    box([0.08, 0.08, 0.08], [0.78, 0.42, 0.1], 0xd8c8ff, '!plain', [0.5, 0.5, 0]),
    box([0.06, 0.06, 0.06], [-0.7, 0.5, 0.0], 0xb89aff, '!plain', [0.5, 0.2, 0.4])
  ], { yaw: 0.45, pitch: 0.3, zoom: 1.10 });

  // 处刑大刀：又宽又方的刀身（刀尖附近一个圆孔）、黑铁护手、长握把
  var hole = [];
  for (var hi = 0; hi < 8; hi++) hole.push(0.02 + Math.cos(hi * PI / 4) * 0.08, 1.12 + Math.sin(hi * PI / 4) * 0.08);
  weapon('dexe', [
    P('iw_poly', [0.08, [-0.22, 0.08, 0.22, 0.08, 0.27, 1.22, 0.14, 1.4, -0.08, 1.44, -0.28, 1.34], hole], [0, 0, 0], 0xc8c8d8, 'ch_plate'),
    P('iw_poly', [0.09, [0.17, 0.12, 0.22, 0.12, 0.27, 1.22, 0.14, 1.4, 0.1, 1.36, 0.21, 1.2]], [0, 0, 0], 0xf4f6fa, 'plain'),
    box([0.06, 0.82, 0.09], [-0.06, 0.55, 0], 0x7a8090, 'metal'),
    box([0.66, 0.12, 0.16], [0, 0.03, 0], 0x4a4e58, 'metal'),
    P('cyl', [0.065, 0.065, 0.55, 6], [0, -0.27, 0], 0x7a1a1a, 'ch_leather'),
    box([0.15, 0.1, 0.15], [0, -0.58, 0], 0x4a4e58, 'metal')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.25 });

  // 血魔法：发光的血球，外面绕着一道血流，往下滴着血珠
  weapon('bloodmagic', [
    P('sphere', [0.42, 12, 8], [0, 0, 0], 0xa00c24, 'plain'),
    P('ball', [0.28, 1], [0, -0.02, 0.2], 0xff3a50, '!plain'),
    P('ball', [0.13, 1], [-0.02, 0.0, 0.34], 0xffa0aa, '!plain'),
    P('oct', [0.07], [-0.18, 0.2, 0.36], 0xffffff, '!plain', null, [1, 1.4, 0.5]),
    P('iw_horn', [0.62, 0.12, 0.02, 14, 4.4, 5, 1], [0, 0, 0.05], 0xe0203a, '!plain', [0.25, 0, -0.9]),
    P('ball', [0.1, 1], [0.32, -0.66, 0.1], 0xd81a34, '!plain'),
    P('cone', [0.08, 0.18, 5], [0.32, -0.54, 0.1], 0xd81a34, '!plain'),
    P('ball', [0.075, 1], [-0.12, -0.78, 0.1], 0xd81a34, '!plain'),
    P('cone', [0.06, 0.14, 5], [-0.12, -0.69, 0.1], 0xd81a34, '!plain')
  ], { yaw: 0.4, pitch: 0.25, zoom: 1.12 });

  // 冰霜行者：六角雪花（冰晶棱柱 + 分叉 + 尖角），中间一颗发光冰核
  var flake = [P('cyl', [0.22, 0.22, 0.14, 6], [0, 0, 0], 0xd8f6ff, 'plain', [PI / 2, 0, 0]), P('oct', [0.13], [0, 0, 0.1], 0xffffff, '!plain')];
  for (var fi = 0; fi < 6; fi++) {
    var fa = fi * PI / 3 + PI / 2, fc = Math.cos(fa), fs = Math.sin(fa);
    flake.push(box([0.14, 0.78, 0.11], [fc * 0.46, fs * 0.46, 0], 0x9fe4ff, 'plain', [0, 0, fa - PI / 2]));
    flake.push(box([0.09, 0.3, 0.09], [fc * 0.58 + Math.cos(fa + 0.8) * 0.13, fs * 0.58 + Math.sin(fa + 0.8) * 0.13, 0], 0xbff0ff, 'plain', [0, 0, fa + 0.8 - PI / 2]));
    flake.push(box([0.09, 0.3, 0.09], [fc * 0.58 + Math.cos(fa - 0.8) * 0.13, fs * 0.58 + Math.sin(fa - 0.8) * 0.13, 0], 0xbff0ff, 'plain', [0, 0, fa - 0.8 - PI / 2]));
    flake.push(P('oct', [0.1], [fc * 0.9, fs * 0.9, 0], 0xe8faff, 'plain', [0, 0, fa], [1.5, 1, 0.8]));
  }
  weapon('frost', flake, { yaw: 0.4, pitch: 0.3, tilt: 0.1, zoom: 1.27 });

  // 毒瓶：圆底烧瓶里发光的绿色毒液、软木塞、冒出来的毒泡泡
  weapon('poison', [
    P('sphere', [0.46, 12, 8], [0, 0, 0], 0x46c42a, 'plain'),
    P('ball', [0.3, 1], [0.02, -0.06, 0.24], 0x9dff5a, '!plain'),
    P('cyl', [0.15, 0.18, 0.32, 8], [0, 0.52, 0], 0xb8dcd0, 'plain'),
    P('cyl', [0.2, 0.2, 0.07, 8], [0, 0.69, 0], 0xd8f0ea, 'plain'),
    P('cyl', [0.14, 0.12, 0.2, 6], [0, 0.8, 0], 0x9a6a3a, 'wood'),
    P('oct', [0.1], [-0.2, 0.2, 0.36], 0xffffff, '!plain', [0, 0, 0.5], [1, 1.6, 0.5]),
    P('ball', [0.09, 1], [0.2, 1.0, 0.05], 0x9dff5a, '!plain'),
    P('ball', [0.065, 1], [0.08, 1.2, 0.05], 0x7dff4a, '!plain'),
    P('ball', [0.05, 1], [0.27, 1.32, 0.05], 0x5adf3a, '!plain'),
    P('box', [0.22, 0.16, 0.05], [0.0, -0.08, 0.45], 0x5a2a7a, 'cloth')
  ], { yaw: 0.35, pitch: 0.25, tilt: -0.18, zoom: 1.20 });

  // 骰子：白色方块，三个看得见的面是 1（红）、5、3
  weapon('dice', [
    box([0.8, 0.8, 0.8], [0, 0, 0], 0xf4efe4, 'plain'),
    box([0.74, 0.74, 0.02], [0, 0, 0.405], 0xffffff, 'iw_die5'),
    box([0.02, 0.74, 0.74], [0.405, 0, 0], 0xffffff, 'iw_die3'),
    box([0.74, 0.02, 0.74], [0, 0.405, 0], 0xffffff, 'iw_die1')
  ], { yaw: 0.6, pitch: 0.5, tilt: 0.12, zoom: 0.76 });

  // 腐化之剑：暗紫色的锯齿剑身、发光的紫色裂纹、羊角护手中间一只发光的眼
  weapon('corrupted', [
    P('iw_blade', [1.45, 0.3, 0.09, 0.3, 0.9], [0, 0.08, 0], 0x5a2a7a, 'ch_plate'),
    P('iw_blade', [1.2, 0.07, 0.12, 0.2, 1.0], [0, 0.12, 0], 0xd060ff, '!plain'),
    P('tet', [0.13], [0.19, 0.5, 0], 0x3a1a4a, 'metal', [0, 0, 0.3]),
    P('tet', [0.13], [-0.19, 0.78, 0], 0x3a1a4a, 'metal', [0, 0, 0.9]),
    P('tet', [0.11], [0.18, 1.02, 0], 0x3a1a4a, 'metal', [0, 0, 0.3]),
    P('iw_horn', [0.22, 0.08, 0.02, 6, 1.9, 5, 1], [0.2, 0.0, 0], 0x2a1a36, 'metal', [0, 0, -PI / 2 - 0.1]),
    P('iw_horn', [0.22, 0.08, 0.02, 6, 1.9, 5, 1], [-0.2, 0.0, 0], 0x2a1a36, 'metal', [0, PI, -PI / 2 - 0.1]),
    box([0.3, 0.14, 0.15], [0, 0.02, 0], 0x3a2448, 'metal'),
    P('oct', [0.08], [0, 0.02, 0.08], 0xff5ad0, '!plain', null, [1.3, 1, 0.6]),
    P('cyl', [0.055, 0.055, 0.4, 6], [0, -0.22, 0], 0x241828, 'ch_leather'),
    P('oct', [0.1], [0, -0.48, 0], 0x5a2a7a, 'metal', null, [1, 1.4, 1])
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.49 });

  // 香蕉回旋镖：弯弯的香蕉（五棱、两头细），一头是蒂
  weapon('banana', [
    P('iw_horn', [0.66, 0.17, 0.05, 8, 1.95, 5, 0], [0, 0, 0], 0xffe14a, 'noise', [0, 0, PI + 0.6]),
    rod('box', [Math.cos(PI + 0.6) * 0.66, Math.sin(PI + 0.6) * 0.66, 0], [Math.cos(PI + 0.6) * 0.66 - 0.1, Math.sin(PI + 0.6) * 0.66 + 0.16, 0], [0.07, 0.07], 0x7a5a2a, 'wood'),
    P('oct', [0.055], [Math.cos(PI + 2.55) * 0.66, Math.sin(PI + 2.55) * 0.66, 0], 0x4a3018, 'plain')
  ], { yaw: 0.3, pitch: 0.45, tilt: 0.3, zoom: 1.28 });

  // 圣光光环：倾斜的金色光环（上面一道亮光）+ 一圈长短交替的光芒
  var halo = [
    P('iw_arc', [0.6, 0.12, 6, 20], [0, 0, 0], GOLD_L, 'gold'),
    P('iw_arc', [0.6, 0.05, 4, 20], [0, 0, 0.1], 0xfffbe0, '!plain')
  ];
  for (var ai = 0; ai < 12; ai++) {
    var aa = ai * PI / 6, rl = ai % 2 ? 0.2 : 0.36;
    halo.push(P('iw_poly', [0.05, [-0.04, 0, 0, -0.065, rl, 0, 0, 0.065]], [Math.cos(aa) * 0.82, Math.sin(aa) * 0.82, 0], 0xfff0a0, '!plain', [0, 0, aa]));
  }
  weapon('aura', xf(halo, [-1.2, 0, 0]), { yaw: 0.3, pitch: 0.35, zoom: 1.06 });

  // 雷霆权杖：蓝握把金杖、金爪托着发光的蓝水晶，顶上窜出一道大闪电
  var BOLT = [-0.05, 1.0, 0.3, 1.0, 0.12, 0.58, 0.32, 0.58, -0.12, -0.05, 0.02, 0.42, -0.18, 0.42];
  weapon('lightning', [
    P('cyl', [0.07, 0.08, 0.9, 6], [0, -0.2, 0], 0x2a4ab0, 'ch_leather'),
    P('cyl', [0.1, 0.1, 0.08, 6], [0, -0.62, 0], GOLD, 'gold'),
    P('oct', [0.12], [0, -0.72, 0], GOLD, 'gold'),
    P('cyl', [0.1, 0.1, 0.08, 6], [0, 0.22, 0], GOLD, 'gold'),
    P('cyl', [0.22, 0.1, 0.2, 6], [0, 0.4, 0], GOLD, 'gold'),
    rod('cone', [0.16, 0.46, 0], [0.26, 0.82, 0], [0.055, 4], GOLD, 'gold'),
    rod('cone', [-0.16, 0.46, 0], [-0.26, 0.82, 0], [0.055, 4], GOLD, 'gold'),
    P('oct', [0.24], [0, 0.72, 0], 0x5aa8ff, '!plain', null, [1, 1.35, 1]),
    P('oct', [0.12], [0, 0.74, 0.14], 0xe8f8ff, '!plain', null, [1, 1.3, 1]),
    P('iw_poly', [0.1, BOLT], [0.02, 0.84, 0.02], 0xffe84a, '!plain', null, [1.05, 1.05, 1]),
    P('iw_poly', [0.11, BOLT], [0.03, 0.9, 0.04], 0xfffbe0, '!plain', null, [0.5, 0.75, 1])
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.12 });

  // 火焰行者：黑铁战靴，接缝里透出岩浆光，脚跟后面腾起一大团火
  weapon('flamewalker', [
    box([0.48, 0.72, 0.52], [0, 0.72, -0.12], 0x5a606c, 'ch_plate'),
    box([0.56, 0.14, 0.6], [0, 1.12, -0.12], 0x7a808c, 'ch_plate'),
    box([0.48, 0.34, 0.95], [0, 0.22, 0.1], 0x5a606c, 'ch_plate'),
    P('iw_taper', [0.36, 0.5, 0.3, 0.12, 0.26], [0, 0.2, 0.66], 0x6a707c, 'ch_plate', [PI / 2, 0, 0]),
    box([0.52, 0.1, 1.08], [0, 0.0, 0.12], 0x241e22, 'plain'),
    box([0.5, 0.05, 0.54], [0, 0.5, -0.12], 0xff7a20, '!plain'),
    box([0.5, 0.05, 0.97], [0, 0.07, 0.1], 0xffa030, '!plain'),
    box([0.08, 0.08, 0.04], [-0.24, 0.82, 0.0], 0xffd040, '!plain')
  ].concat(flame([-0.05, -0.08, -0.82], 1.35, [0, -0.95, 0.18]))
   .concat(flame([-0.3, -0.1, -0.3], 0.62, [0, -0.95, 0.05]))
   .concat(flame([-0.3, -0.1, 0.3], 0.45, [0, -0.95, -0.1])), { yaw: -0.95, pitch: 0.3, zoom: 1.04 });

  // 流星锤：木柄 + 铁链 + 一个大大的带刺铁球
  function link(pos, ang, side, r, c) {
    r = r || 0.1;
    return xf([P('iw_arc', [r, r * 0.33, 4, 8], [0, 0, 0], c || 0x9aa0a8, 'metal', side ? [PI / 2, 0, 0] : null, [1.55, 1, 1])], [0, 0, ang], pos);
  }
  var flail = [
    rod('cyl', [-0.9, -0.9, 0], [-0.45, -0.45, 0], [0.09, 0.1, 6], WOOD, 'wood'),
    rod('cyl', [-0.88, -0.88, 0], [-0.68, -0.68, 0], [0.115, 0.115, 6], LEATHER, 'ch_leather'),
    rod('cyl', [-0.47, -0.47, 0], [-0.39, -0.39, 0], [0.12, 0.12, 6], IRON, 'metal')
  ];
  for (var li = 0; li < 3; li++) flail = flail.concat(link([-0.3 + li * 0.17, -0.3 + li * 0.17, 0], PI / 4, li % 2, 0.085));
  flail.push(P('dodec', [0.36], [0.34, 0.34, 0], 0x4a4e5a, 'metal'));
  [[1, 0, 0], [0.71, 0.71, 0], [0, 1, 0], [-0.71, 0.71, 0.2], [0.71, -0.71, 0.1], [0.45, 0.3, 0.84], [-0.3, 0.45, 0.84], [0.2, -0.4, 0.88], [-0.1, 0.1, -1]].forEach(function (u) {
    flail.push(rod('cone', [0.34 + u[0] * 0.28, 0.34 + u[1] * 0.28, u[2] * 0.28], [0.34 + u[0] * 0.66, 0.34 + u[1] * 0.66, u[2] * 0.66], [0.11, 4], 0xdfe4ec, 'metal'));
  });
  weapon('chunkers', flail, { yaw: 0.35, pitch: 0.3, zoom: 1.11 });

  // 追踪魔弹：发光的紫色魔法弹（白色亮芯、四角星闪光），后面拖着两条弯弯的彗尾（会拐弯追人）
  weapon('rocket', xf([
    P('ball', [0.3, 1], [0.45, 0, 0], 0xa83aff, '!plain'),
    P('ball', [0.2, 1], [0.47, 0.02, 0.15], 0xf0a8ff, '!plain'),
    P('ball', [0.1, 1], [0.5, 0.03, 0.28], 0xffffff, '!plain'),
    P('iw_horn', [0.9, 0.17, 0.01, 10, 1.4, 5, 1], [0.45, -0.9, -0.06], 0x8a2ae0, '!plain', [0, 0, PI / 2]),
    P('iw_horn', [1.25, 0.08, 0.01, 10, 0.95, 5, 1], [0.45, -1.25, 0.04], 0xd070ff, '!plain', [0, 0, PI / 2]),
    P('iw_poly', [0.04, star(4, 0.3, 0.06)], [0.5, 0.03, 0.34], 0xffffff, '!plain'),
    P('iw_poly', [0.04, star(4, 0.13, 0.04)], [-0.25, 0.42, 0.1], 0xffd8ff, '!plain')
  ], [0, 0, 0.6]), { yaw: 0.25, pitch: 0.25, zoom: 1.10 });

  // 火药桶：鼓肚木桶、铁箍、红色警示带，引信头上冒着火星
  weapon('mines', [
    P('iw_lathe', [10, 0.34, -0.45, 0.43, -0.22, 0.46, 0, 0.43, 0.22, 0.34, 0.45], [0, 0, 0], 0x9a6230, 'wood'),
    P('cyl', [0.34, 0.34, 0.04, 10], [0, 0.45, 0], 0x6a4020, 'wood'),
    P('iw_arc', [0.44, 0.035, 4, 16], [0, 0.27, 0], 0x3a3a46, 'metal', [PI / 2, 0, 0]),
    P('iw_arc', [0.44, 0.035, 4, 16], [0, -0.27, 0], 0x3a3a46, 'metal', [PI / 2, 0, 0]),
    P('iw_arc', [0.47, 0.07, 4, 16], [0, 0, 0], 0xd8342a, 'cloth', [PI / 2, 0, 0]),
    rod('cyl', [0.1, 0.44, 0.05], [0.24, 0.74, 0.1], [0.04, 0.04, 5], 0xd8c08a, 'plain'),
    P('ball', [0.09, 1], [0.25, 0.77, 0.1], FIRE_O, '!plain'),
    P('iw_poly', [0.04, star(4, 0.22, 0.06)], [0.25, 0.77, 0.16], 0xfff6c0, '!plain')
  ], { yaw: 0.5, pitch: 0.35, zoom: 0.95 });

  // 锁链：几节粗铁环，末端一个带倒刺的大钩子
  var chain = [];
  for (var ci = 0; ci < 4; ci++) chain = chain.concat(link([-0.62 + ci * 0.21, 0.66 - ci * 0.21, 0], -PI / 4, ci % 2, 0.12, 0xc0c8d0));
  chain = chain.concat([
    P('iw_arc', [0.1, 0.04, 4, 8], [0.22, -0.12, 0], 0xc0c8d0, 'metal'),
    box([0.1, 0.36, 0.1], [0.22, -0.38, 0], 0xb0b8c4, 'metal'),
    P('iw_horn', [0.26, 0.08, 0.035, 10, 3.6, 5, 1], [0.48, -0.56, 0], 0xb0b8c4, 'metal', [0, 0, PI]),
    P('cone', [0.07, 0.18, 4], [0.7, -0.36, 0], 0xd8dee8, 'metal', [0, 0, 0.9])
  ]);
  weapon('noodle', chain, { yaw: 0.35, pitch: 0.3, zoom: 1.05 });

  // 勇者之剑：泛蓝光的剑身、蓝色上翘护手、金色宝石和柄头
  weapon('herosword', [
    P('iw_blade', [1.5, 0.3, 0.09, 0.28, 1.0], [0, 0.08, 0], 0xd8ecff, 'ch_plate'),
    P('iw_blade', [1.3, 0.07, 0.12, 0.2, 1.0], [0, 0.12, 0], 0x6ac0ff, '!plain'),
    P('iw_poly', [0.12, [0, -0.06, 0.4, 0.06, 0.5, 0.3, 0.3, 0.14, 0, 0.08]], [0.04, 0.02, 0], 0x2a5ad8, 'ch_plate'),
    P('iw_poly', [0.12, [0, -0.06, -0.4, 0.06, -0.5, 0.3, -0.3, 0.14, 0, 0.08]], [-0.04, 0.02, 0], 0x2a5ad8, 'ch_plate'),
    box([0.2, 0.16, 0.16], [0, 0.02, 0], 0x2a5ad8, 'ch_plate'),
    P('oct', [0.08], [0, 0.03, 0.09], 0xffe14a, '!plain'),
    P('cyl', [0.055, 0.055, 0.4, 6], [0, -0.22, 0], 0x1a3a9a, 'ch_leather'),
    P('oct', [0.09], [0, -0.46, 0], GOLD, 'gold')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.53 });

  // 龙息：红龙侧脸（挤出的侧面轮廓）：长鼻梁、张开的上下颚、白牙、金黄竖瞳、两只往后弯的角，嘴里喷出一大股火
  var DR = 0xc8361e, DR_D = 0x8a2012, DR_L = 0xf0a058, HORN = 0xf4e8cc;
  weapon('dragon', [
    P('iw_poly', [0.42, [-0.42, -0.02, -0.44, 0.3, -0.22, 0.44, 0.0, 0.5, 0.12, 0.42, 0.66, 0.3, 0.74, 0.35, 0.81, 0.24, 0.74, 0.12, 0.14, 0.06, -0.06, -0.06, -0.26, -0.12]], [0, 0, 0], DR, 'scale'),
    P('iw_poly', [0.34, [-0.16, -0.04, 0.06, 0.0, 0.64, -0.3, 0.66, -0.4, 0.1, -0.27, -0.16, -0.18]], [0, 0, 0], DR_L, 'en_chitin'),
    P('iw_poly', [0.26, [0.06, 0.06, 0.76, 0.14, 0.62, -0.3, 0.02, -0.04]], [0, 0, 0], 0x3a0806, 'plain'),
    P('cone', [0.055, 0.16, 4], [0.68, 0.06, 0.1], 0xffffff, 'plain', [PI, 0, 0]),
    P('cone', [0.045, 0.12, 4], [0.48, 0.06, 0.1], 0xffffff, 'plain', [PI, 0, 0]),
    P('cone', [0.045, 0.12, 4], [0.52, -0.16, 0.09], 0xffffff, 'plain', [0, 0, 0.5]),
    box([0.18, 0.11, 0.04], [0.06, 0.36, 0.21], 0xffd23a, '!plain'),
    box([0.04, 0.11, 0.02], [0.08, 0.36, 0.235], 0x1a0a04, 'plain'),
    box([0.32, 0.07, 0.46], [0.06, 0.45, 0], DR_D, 'scale', [0, 0, -0.22]),
    box([0.07, 0.05, 0.3], [0.76, 0.28, 0], 0x2a0606, 'plain'),
    P('iw_horn', [0.36, 0.085, 0.015, 6, 1.7, 5, 1], [-0.68, 0.4, 0.14], HORN, 'bone'),
    P('iw_horn', [0.3, 0.075, 0.015, 6, 1.6, 5, 1], [-0.44, 0.48, -0.16], 0xd0c0a0, 'bone'),
    P('iw_poly', [0.2, [0, 0, 0.16, 0.04, 0.02, 0.2]], [-0.56, 0.2, 0], DR_D, 'plain', [0, 0, 1.6]),
    P('iw_poly', [0.2, [0, 0, 0.16, 0.04, 0.02, 0.2]], [-0.6, -0.06, 0], DR_D, 'plain', [0, 0, 1.8]),
    P('iw_poly', [0.36, [-0.42, 0.06, -0.12, -0.06, -0.22, -0.5, -0.62, -0.54, -0.62, -0.06]], [0, 0, 0], DR, 'scale'),
    P('iw_poly', [0.38, [-0.14, -0.1, -0.04, -0.14, -0.12, -0.52, -0.24, -0.5]], [0, 0, 0], DR_L, 'en_chitin')
  ].concat(flame([0.76, -0.06, 0.05], 0.8, [0, 0.45, -PI / 2])), { yaw: 0.45, pitch: 0.22, tilt: 0.72, zoom: 1.14 });

  // 镰刀：长木柄、握把，顶上一片弯弯的大铁刃（刃口一道亮边）
  weapon('scythe', [
    rod('cyl', [-0.7, -0.85, 0], [0.42, 0.78, 0], [0.065, 0.07, 6], 0x5a3a22, 'wood'),
    rod('box', [-0.2, -0.12, 0], [0.04, -0.24, 0.0], [0.09, 0.09], 0x7a5230, 'wood'),
    rod('cyl', [0.36, 0.7, 0], [0.45, 0.83, 0], [0.09, 0.09, 6], IRON, 'metal'),
    P('iw_poly', [0.07, [0.06, 0.1, -0.25, 0.17, -0.55, 0.14, -0.82, 0.02, -1.1, -0.26, -0.78, -0.1, -0.52, -0.05, -0.26, -0.06, 0.02, -0.12]], [0.42, 0.8, 0], 0x7a7a9a, 'ch_plate'),
    P('iw_poly', [0.08, [-1.1, -0.26, -0.78, -0.1, -0.52, -0.05, -0.26, -0.06, 0.02, -0.12, 0.02, -0.06, -0.26, 0.0, -0.52, 0.01, -0.8, -0.04]], [0.42, 0.8, 0], 0xe8ecf6, 'plain')
  ], { yaw: 0.35, pitch: 0.3, zoom: 1.18 });

  // ============================================================
  //  30 把超武：原武器的升级版（金色、发光、更大、多出来的东西），一眼看出更强
  // ============================================================
  // 羽翼（右翼，根部在原点往 +X 张开：上沿是拱起的翼骨，下沿是一根根往下垂的羽毛；side = -1 是左翼）
  var WING = [0, 0, 0.18, 0.2, 0.45, 0.36, 0.7, 0.4, 0.88, 0.32, 0.78, 0.16, 0.7, 0.2, 0.62, 0.0, 0.52, 0.08, 0.44, -0.12, 0.34, -0.0, 0.24, -0.14, 0.12, -0.04, 0.02, -0.1];
  function wing(pos, k, side, c, rot, t) {
    var pts = WING.map(function (v, i) { return i % 2 ? v : v * side; });
    return P('iw_poly', [0.07, pts], pos, c || 0xfffaf0, t || 'ch_feather', rot || null, Array.isArray(k) ? [k[0], k[1], 1] : [k, k, 1]);
  }
  var GOLD_D = 0xc8901e;
  // 新月形的剑气（和游戏里的斩击一样）：中间最厚、两头尖，弧的中间朝 +Y
  function crescentPts(R, w, arc, n) {
    n = n || 10;
    var out = [], i, t, a, rr;
    for (i = 0; i <= n; i++) { t = i / n; a = (t - 0.5) * arc; out.push(Math.sin(a) * R, Math.cos(a) * R); }
    for (i = n - 1; i >= 1; i--) { t = i / n; a = (t - 0.5) * arc; rr = R - w * Math.pow(Math.sin(t * PI), 0.8); out.push(Math.sin(a) * rr, Math.cos(a) * rr); }
    return out;
  }

  // 断罪圣剑：亮白的宽剑身、发光的金色剑脊、带金边羽翼的护手、蓝宝石，剑尖一颗闪光
  evolved('sword', [
    P('iw_blade', [1.72, 0.38, 0.1, 0.34, 1.0], [0, 0.08, 0], 0xf4f8ff, 'ch_plate'),
    P('iw_blade', [1.5, 0.12, 0.13, 0.26, 1.0], [0, 0.12, 0], 0xffc83a, '!plain'),
    box([0.34, 0.16, 0.18], [0, 0.04, 0], GOLD_L, 'gold'),
    wing([0.1, -0.02, 0], 1.15, 1, 0xfff2c8),
    wing([-0.1, -0.02, 0], 1.15, -1, 0xfff2c8),
    P('oct', [0.11], [0, 0.05, 0.1], 0x5ad0ff, '!plain'),
    P('cyl', [0.065, 0.065, 0.46, 6], [0, -0.22, 0], 0x9a1a2a, 'ch_leather'),
    P('oct', [0.12], [0, -0.5, 0], GOLD_L, 'gold'),
    spark([0.0, 1.66, 0.12], 1.25)
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.80 });

  // 炼狱法杖：焦黑的铁杖、三只金爪，顶上一团更大更猛的深红烈火和火星
  evolved('firestaff', [
    P('cyl', [0.08, 0.095, 1.3, 6], [0, -0.1, 0], 0x2e2228, 'metal'),
    P('cone', [0.11, 0.18, 5], [0, -0.83, 0], GOLD, 'gold', [PI, 0, 0]),
    P('cyl', [0.11, 0.11, 0.1, 6], [0, -0.3, 0], GOLD, 'gold'),
    P('cyl', [0.11, 0.11, 0.1, 6], [0, 0.18, 0], GOLD, 'gold'),
    P('cyl', [0.15, 0.09, 0.22, 6], [0, 0.6, 0], GOLD_L, 'gold'),
    rod('cone', [0.09, 0.66, 0], [0.38, 1.08, 0.04], [0.09, 4], GOLD_L, 'gold'),
    rod('cone', [-0.09, 0.66, 0], [-0.38, 1.08, 0.04], [0.09, 4], GOLD_L, 'gold'),
    P('ball', [0.44, 1], [0, 1.02, -0.08], 0xd8200a, '!plain'),
    P('cone', [0.4, 1.0, 6], [0, 1.56, -0.08], 0xd8200a, '!plain'),
    P('cone', [0.18, 0.52, 5], [0.36, 1.32, -0.08], 0xd8200a, '!plain', [0, 0, -0.6]),
    P('cone', [0.18, 0.52, 5], [-0.35, 1.35, -0.08], 0xd8200a, '!plain', [0, 0, 0.6]),
    P('ball', [0.33, 1], [0, 0.99, 0.1], FIRE_O, '!plain'),
    P('cone', [0.29, 0.74, 6], [0, 1.42, 0.1], FIRE_O, '!plain'),
    P('ball', [0.22, 1], [0, 0.95, 0.24], FIRE_Y, '!plain'),
    P('cone', [0.18, 0.46, 6], [0, 1.27, 0.24], FIRE_Y, '!plain'),
    P('ball', [0.12, 1], [0, 0.92, 0.38], FIRE_W, '!plain'),
    box([0.08, 0.08, 0.08], [0.5, 1.66, 0.1], FIRE_Y, '!plain', [0.5, 0.5, 0]),
    box([0.07, 0.07, 0.07], [-0.46, 1.8, 0.1], FIRE_O, '!plain', [0.5, 0.2, 0.5])
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.32 });

  // 千矢连弩：金弩臂、金色大箭匣（插满红箭羽），木身也换成深色
  evolved('revolver', crossbow({ wood: 0x6a3a1e, woodD: 0x4a2812, limb: 0xf0b830, limbT: 'gold', lw: 0.12, str: 0.06, extra: [
    box([0.8, 0.42, 0.26], [0.1, 0.3, 0], 0xe0a830, 'gold'),
    box([0.84, 0.07, 0.29], [0.1, 0.52, 0], 0xfff0b0, 'gold'),
    box([0.06, 0.16, 0.05], [-0.2, 0.6, 0.06], 0xe8323a, 'cloth'),
    box([0.06, 0.16, 0.05], [-0.06, 0.6, -0.06], 0xe8323a, 'cloth'),
    box([0.06, 0.16, 0.05], [0.08, 0.6, 0.06], 0xe8323a, 'cloth'),
    box([0.06, 0.16, 0.05], [0.22, 0.6, -0.06], 0xe8323a, 'cloth'),
    box([0.06, 0.16, 0.05], [0.36, 0.6, 0.06], 0xe8323a, 'cloth'),
    P('cone', [0.06, 0.18, 4], [0.58, 0.22, 0.06], STEEL, 'metal', [0, 0, -PI / 2]),
    P('cone', [0.06, 0.18, 4], [0.58, 0.36, -0.06], STEEL, 'metal', [0, 0, -PI / 2]),
    rod('box', [-0.26, 0.5, 0.15], [-0.7, 0.12, 0.15], [0.07, 0.07], GOLD, 'gold'),
    rod('box', [-0.26, 0.5, -0.15], [-0.7, 0.12, -0.15], [0.07, 0.07], GOLD, 'gold'),
    box([0.08, 0.08, 0.38], [-0.26, 0.5, 0], GOLD_L, 'gold'),
    spark([0.75, 0.3, 0.6], 1.3)
  ] }), { yaw: 0.0, pitch: 0.82, spin: PI / 4, zoom: 1.16 });

  // 巨人骸骨：两根交叉的巨骨，两头箍着金环
  var bigBone = [
    P('cyl', [0.14, 0.14, 1.1, 6], [0, 0, 0], 0xfff4dc, 'bone'),
    P('ball', [0.23, 1], [0.15, 0.62, 0], 0xfff4dc, 'bone'),
    P('ball', [0.23, 1], [-0.15, 0.62, 0], 0xfff4dc, 'bone'),
    P('ball', [0.23, 1], [0.15, -0.62, 0], 0xfff4dc, 'bone'),
    P('ball', [0.23, 1], [-0.15, -0.62, 0], 0xfff4dc, 'bone'),
    P('cyl', [0.17, 0.17, 0.09, 6], [0, 0.4, 0], GOLD_L, 'gold'),
    P('cyl', [0.17, 0.17, 0.09, 6], [0, -0.4, 0], GOLD_L, 'gold')
  ];
  evolved('bone', xf(bigBone, [0, 0, -PI / 4], [0, 0, 0.14]).concat(xf(bigBone, [0, 0, PI / 4], [0, 0, -0.14])).concat([
    spark([0.62, 0.66, 0.3], 1.1)
  ]), { yaw: 0.3, pitch: 0.35, zoom: 1.10 });

  // 天使圣域：发光的金色光环，两边斜着往上张开一对长长的白色天使翅膀
  evolved('aura', xf([
    P('iw_arc', [0.42, 0.095, 6, 20], [0, 0, 0], GOLD_L, 'gold'),
    P('iw_arc', [0.42, 0.04, 4, 20], [0, 0, 0.09], 0xfffbe0, '!plain')
  ], [-1.15, 0, 0], [0, 0.0, 0.2]).concat([
    wing([0.2, -0.05, -0.05], [1.5, 1.0], 1, 0xfffaf0, [0, 0, 0.62]),
    wing([-0.2, -0.05, -0.05], [1.5, 1.0], -1, 0xfffaf0, [0, 0, -0.62]),
    spark([0.82, 0.78, 0.2], 0.9)
  ]), { yaw: 0.15, pitch: 0.3, zoom: 1.02 });

  // 风暴战斧：双刃金斧（白亮刃口）、深色木柄配金箍和红握把、顶上尖刺
  var AXB = [0.06, 0.62, 0.3, 0.7, 0.5, 0.9, 0.6, 0.62, 0.58, 0.34, 0.46, 0.08, 0.32, 0.28, 0.12, 0.36, 0.06, 0.4];
  var AXE = [0.45, 0.83, 0.5, 0.9, 0.6, 0.62, 0.58, 0.34, 0.46, 0.08, 0.41, 0.17, 0.5, 0.35, 0.52, 0.62];
  var mx = function (pts) { return pts.map(function (v, i) { return i % 2 ? v : -v; }); };
  evolved('axe', [
    box([0.12, 1.5, 0.12], [0, 0.05, 0], 0x4a2c16, 'wood'),
    box([0.15, 0.34, 0.15], [0, -0.46, 0], 0x9a1a2a, 'ch_leather'),
    box([0.16, 0.07, 0.16], [0, -0.66, 0], GOLD_L, 'gold'),
    box([0.16, 0.07, 0.16], [0, 0.2, 0], GOLD_L, 'gold'),
    box([0.22, 0.38, 0.19], [0, 0.48, 0], GOLD, 'gold'),
    P('iw_poly', [0.09, AXB], [0, 0, 0], 0xf0b830, 'gold'),
    P('iw_poly', [0.1, AXE], [0, 0, 0], 0xfff6d8, 'plain'),
    P('iw_poly', [0.09, mx(AXB)], [0, 0, 0], 0xf0b830, 'gold'),
    P('iw_poly', [0.1, mx(AXE)], [0, 0, 0], 0xfff6d8, 'plain'),
    P('cone', [0.08, 0.32, 4], [0, 0.82, 0], GOLD_L, 'gold'),
    spark([0.7, 0.98, 0.1], 1.1)
  ], { tilt: -0.2, yaw: 0.3, pitch: 0.3, zoom: 1.11 });

  // 不破圣盾：白金盾面、金十字、中间一颗发光的蓝宝石，身后放出一圈圣光
  var aeg = [
    P('cyl', [0.82, 0.82, 0.1, 14], [0, 0, -0.02], GOLD_D, 'gold', [PI / 2, 0, 0]),
    P('cyl', [0.72, 0.72, 0.13, 14], [0, 0, 0], 0xfff2d8, 'ch_plate', [PI / 2, 0, 0]),
    P('iw_arc', [0.76, 0.085, 4, 16], [0, 0, 0.06], GOLD_L, 'gold'),
    box([0.2, 1.32, 0.05], [0, 0, 0.08], 0xf0b030, 'gold'),
    box([1.32, 0.2, 0.05], [0, 0.1, 0.08], 0xf0b030, 'gold'),
    P('oct', [0.2], [0, 0.1, 0.12], 0x4ab8ff, '!plain'),
    P('oct', [0.1], [0, 0.12, 0.22], 0xe8fbff, '!plain'),
    spark([0.62, 0.66, 0.2], 1.0)
  ];
  for (var gi = 0; gi < 8; gi++) {
    var ga = gi * PI / 4 + PI / 8, gl = gi % 2 ? 0.26 : 0.4;
    aeg.push(P('iw_poly', [0.04, [-0.05, 0, 0, -0.08, gl, 0, 0, 0.08]], [Math.cos(ga) * 0.86, Math.sin(ga) * 0.86, -0.08], 0xfff0a0, '!plain', [0, 0, ga]));
  }
  evolved('aegis', aeg, { yaw: 0.45, pitch: 0.3, tilt: 0.08, zoom: 1.16 });

  // 穿云神弓：金弓（两头是小羽翼）、发光的弦和光箭
  evolved('bow', [
    P('iw_horn', [0.92, 0.12, 0.06, 10, 1.85, 5, 0], [0, 0, 0], 0xf0b830, 'gold', [0, 0, -0.925]),
    box([0.18, 0.3, 0.18], [0.92, 0, 0], 0x2a4ab0, 'ch_leather'),
    wing([0.56, 0.7, -0.04], 0.55, 1, null, [0, 0, 0.5]),
    wing([0.56, -0.7, -0.04], 0.55, 1, null, [PI, 0, 0.5]),
    rod('box', [0.55, 0.73, 0], [0.04, 0, 0], [0.065, 0.065], 0xfff6c8, '!plain'),
    rod('box', [0.55, -0.73, 0], [0.04, 0, 0], [0.065, 0.065], 0xfff6c8, '!plain'),
    rod('box', [-0.02, 0, 0.04], [1.25, 0, 0.04], [0.09, 0.09], 0xffe070, '!plain'),
    P('oct', [0.17], [1.42, 0, 0.04], 0xffffff, '!plain', null, [1.8, 1, 0.6]),
    P('iw_poly', [0.04, [0, 0, 0.32, 0, 0.4, 0.18, 0.1, 0.18]], [-0.04, 0.0, 0.04], 0xf0b830, 'gold'),
    P('iw_poly', [0.04, [0, 0, 0.32, 0, 0.4, -0.18, 0.1, -0.18]], [-0.04, 0.0, 0.04], 0xfff0c0, 'gold'),
    spark([1.42, 0, 0.12], 1.3)
  ], { tilt: PI / 4, yaw: 0.3, pitch: 0.3, zoom: 1.52 });

  // 疾风细剑：翡翠色细剑（发光的青绿剑脊、金护手），剑身两边各飞出一道青白色的风刃（前后一起斩）
  var jade = recolor(WP.katana, { 0xeef3f8: 0xe8fff4, 0xd0283e: 0x1a8a5a }).concat([P('iw_blade', [1.45, 0.05, 0.08, 0.2, 1.0], [0, 0.14, 0], 0x3aef90, '!plain')]);
  var windBlade = function (cx, cy, side) {
    return [
      P('iw_poly', [0.05, crescentPts(0.7, 0.24, 2.0)], [cx, cy, -0.1], 0x8affc0, '!plain', [0, 0, side * PI / 2]),
      P('iw_poly', [0.05, crescentPts(0.64, 0.09, 1.7)], [cx, cy, -0.06], 0xeafff4, '!plain', [0, 0, side * PI / 2])
    ];
  };
  evolved('katana', windBlade(0.06, 1.12, 1).concat(windBlade(-0.06, 0.78, -1)).concat(jade).concat([
    spark([0.0, 1.9, 0.12], 1.1)
  ]), { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.6 });

  // 天灾飓风：金色的大旋风，夹着两道闪电和飞石
  evolved('tornado', recolor(WP.tornado, { 0xf4faff: 0xfff6d8, 0xdcefff: 0xffe8a8, 0xc6e3ff: 0xffd880, 0xb2d6ff: 0xf0c060, 0xa2ccff: 0xe0a840, 0x92c2ff: 0xd09030 }).concat([
    P('iw_poly', [0.06, BOLT], [-0.62, 0.95, 0.25], 0xfffbe0, '!plain', [0, 0, 0.3], [0.7, 0.7, 1]),
    P('iw_poly', [0.06, BOLT], [0.5, 0.2, 0.3], 0xfff27a, '!plain', [0, 0, -0.4], [0.55, 0.55, 1]),
    spark([0.55, 1.5, 0.2], 1.0)
  ]), { yaw: 0.4, pitch: 0.25, zoom: 1.15 });

  // 影舞飞刃：一把发光的薄荷绿匕首（金护手），身后扇形分出两把深紫色的影子分身
  var shadowDagger = recolor(WP.dagger, { 0xc8fff0: 0x5a3a8a, 0x7affd0: 0xb06aff, 0x3a3a4a: 0x2a1a3a, 0x2a2a38: 0x1a1024 });
  evolved('dagger', xf(shadowDagger, [0, 0, 0.62], [-0.2, -0.1, -0.2])
    .concat(xf(shadowDagger, [0, 0, -0.62], [0.2, -0.1, -0.2]))
    .concat(xf(recolor(WP.dagger, { 0x3a3a4a: GOLD }), [0, 0, 0], [0, 0.04, 0.1], 1.12))
    .concat([spark([0.5, 0.95, 0.25], 1.0)]), { yaw: 0.3, pitch: 0.3, tilt: -0.5, zoom: 1.40 });

  // 攻城巨弩：金色的超粗弩臂、深色木身配金板，搭着一支头上烧着火的爆炸重弩箭
  evolved('sniper', crossbow({ wood: 0x3a2214, woodD: 0x24160c, limb: 0xe0a830, limbT: 'gold', lw: 0.2, span: 0.95, str: 0.06, extra: [
    box([0.6, 0.08, 0.24], [0.3, 0.1, 0], GOLD, 'gold'),
    box([0.2, 0.26, 0.28], [0.64, 0.02, 0], GOLD_L, 'gold'),
    P('cyl', [0.07, 0.07, 0.5, 6], [-0.08, 0.3, 0], GOLD_L, 'gold', [0, 0, PI / 2]),
    box([0.05, 0.14, 0.05], [-0.08, 0.2, 0], 0x3a3a46, 'metal')
  ].concat(bolt([-0.22, 0.15, 0], [0.9, 0.15, 0], 0.09, 0xffd84a, 0xff7a2a)).concat([
    P('ball', [0.16, 1], [1.12, 0.15, 0], FIRE_O, '!plain'),
    P('ball', [0.1, 1], [1.14, 0.2, 0.04], FIRE_Y, '!plain'),
    spark([1.12, 0.3, 0.1], 1.1)
  ]) }), { yaw: 0.0, pitch: 0.95, spin: PI / 4, zoom: 1.70 });

  // 虚空奇点：更亮的紫色吸积盘，再斜着套一圈金色光环，周围的碎屑和闪光
  evolved('blackhole', recolor(WP.blackhole, { 0x7a4aff: 0xa04aff, 0x4a2ab8: 0x7a2ad8, 0xb89aff: 0xf0d8ff }).concat([
    P('iw_arc', [0.66, 0.06, 4, 20], [0, 0, 0], 0xffc84a, '!plain', [0.55, 0.95, -0.5]),
    box([0.08, 0.08, 0.08], [-0.25, -0.62, 0.2], 0xffd84a, '!plain', [0.5, 0.5, 0]),
    spark([0.62, 0.62, 0.2], 1.0),
    spark([-0.72, -0.35, 0.2], 0.7)
  ]), { yaw: 0.45, pitch: 0.3, zoom: 1.10 });

  // 断头巨刃：更宽的刀身配金色刀背、发着血红光的刃口、金护手上一个骷髅
  evolved('dexe', recolor(WP.dexe, { 0xc8c8d8: 0xd8dce8, 0xf4f6fa: 0xff4a3a, 0x4a4e58: GOLD, 0x7a1a1a: 0x2a1a14 }, { 0xf4f6fa: '!plain' }).concat([
    P('iw_poly', [0.1, [-0.22, 0.12, -0.17, 0.12, -0.22, 1.3, -0.08, 1.44, -0.28, 1.34]], [0, 0, 0], GOLD_L, 'gold'),
    P('oct', [0.11], [0, 0.03, 0.1], 0xf4ecd8, 'bone', null, [1, 0.9, 0.7]),
    box([0.04, 0.035, 0.03], [-0.035, 0.04, 0.17], 0x1a0a0a, 'plain'),
    box([0.04, 0.035, 0.03], [0.035, 0.04, 0.17], 0x1a0a0a, 'plain'),
    spark([0.05, 1.62, 0.1], 1.1)
  ]), { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.23 });

  // 血月秘法：一弯发红光的血月，月牙怀里抱着血球，下面滴着血
  evolved('bloodmagic', [
    P('iw_poly', [0.16, crescentPts(0.78, 0.34, 3.7, 14)], [0, 0, -0.08], 0xd01a30, 'en_rock', [0, 0, PI / 2]),
    P('iw_poly', [0.17, crescentPts(0.78, 0.12, 3.3, 14)], [0, 0, -0.08], 0xff5a6a, '!plain', [0, 0, PI / 2]),
    P('sphere', [0.3, 10, 8], [0.2, 0.02, 0.05], 0xa00c24, 'plain'),
    P('ball', [0.2, 1], [0.2, 0.0, 0.2], 0xff3a50, '!plain'),
    P('ball', [0.09, 1], [0.19, 0.02, 0.32], 0xffb0b8, '!plain'),
    P('ball', [0.09, 1], [0.34, -0.55, 0.1], 0xd81a34, '!plain'),
    P('cone', [0.07, 0.16, 5], [0.34, -0.44, 0.1], 0xd81a34, '!plain'),
    spark([0.62, 0.6, 0.15], 1.0)
  ], { yaw: 0.3, pitch: 0.2, zoom: 1.08 });

  // 永冬领域：更亮的大雪花（发光冰核），外面绕着一圈冰环和几块浮着的冰晶
  evolved('frost', recolor(WP.frost, { 0x9fe4ff: 0xc8f6ff, 0xbff0ff: 0xe8fcff, 0xffffff: 0x5ae0ff }).concat([
    P('iw_arc', [1.02, 0.055, 4, 24], [0, 0, 0], 0xa8f0ff, '!plain', [-1.15, 0, 0.2]),
    P('oct', [0.13], [0.86, 0.82, 0.1], 0xd8faff, 'plain', [0, 0, 0.6], [0.8, 1.6, 0.8]),
    P('oct', [0.11], [-0.9, -0.78, 0.1], 0xd8faff, 'plain', [0, 0, 0.6], [0.8, 1.6, 0.8]),
    spark([-0.82, 0.86, 0.2], 1.0)
  ]), { yaw: 0.4, pitch: 0.3, tilt: 0.1, zoom: 1.10 });

  // 瘟疫之源：冒着绿泡的黑铁大锅（毒液从锅边淌下来，上面飘着毒雾和一个骷髅）
  evolved('poison', [
    P('iw_lathe', [10, 0.0, -0.42, 0.34, -0.38, 0.5, -0.14, 0.5, 0.14, 0.44, 0.3], [0, 0, 0], 0x3a3a46, 'metal'),
    P('iw_arc', [0.45, 0.06, 4, 16], [0, 0.3, 0], 0x5a5a68, 'metal', [PI / 2, 0, 0]),
    P('cyl', [0.42, 0.42, 0.04, 12], [0, 0.31, 0], 0x7aff3a, '!plain'),
    box([0.08, 0.36, 0.08], [0.3, -0.48, 0.22], 0x2a2a34, 'metal', [0.3, 0, 0.3]),
    box([0.08, 0.36, 0.08], [-0.32, -0.48, 0.18], 0x2a2a34, 'metal', [0.3, 0, -0.3]),
    box([0.12, 0.3, 0.1], [0.12, 0.2, 0.45], 0x7aff3a, '!plain', [0.2, 0, 0]),
    P('ball', [0.07, 1], [0.12, 0.04, 0.48], 0x7aff3a, '!plain'),
    P('ball', [0.12, 1], [-0.14, 0.38, 0.1], 0xb8ff6a, '!plain'),
    P('ball', [0.08, 1], [0.18, 0.4, -0.05], 0xb8ff6a, '!plain'),
    P('ball', [0.13, 1], [-0.05, 0.7, 0.0], 0x8aef4a, '!plain'),
    P('ball', [0.1, 1], [0.22, 0.88, 0.0], 0x6acf3a, '!plain'),
    P('ball', [0.08, 1], [-0.12, 1.04, 0.0], 0x9a5ad8, '!plain'),
    P('ball', [0.14, 1], [0.08, 0.38, 0.22], 0xf4ecd8, 'bone'),
    box([0.04, 0.04, 0.02], [0.03, 0.4, 0.35], 0x1a1a1a, 'plain'),
    box([0.04, 0.04, 0.02], [0.13, 0.4, 0.35], 0x1a1a1a, 'plain'),
    spark([0.55, 0.85, 0.1], 0.9)
  ], { yaw: 0.35, pitch: 0.45, zoom: 1.07 });

  // 命运之骰：一颗金骰子（白点、红色的 1）+ 左前方一颗白骰子，闪着光
  evolved('dice', [
    box([0.8, 0.8, 0.8], [0, 0, 0], 0xd89a20, 'gold'),
    box([0.76, 0.76, 0.02], [0, 0, 0.405], 0xffffff, 'iw_gdie5'),
    box([0.02, 0.76, 0.76], [0.405, 0, 0], 0xffffff, 'iw_gdie3'),
    box([0.76, 0.02, 0.76], [0, 0.405, 0], 0xffffff, 'iw_gdie1')
  ].concat(xf([
    box([0.56, 0.56, 0.56], [0, 0, 0], 0xf4efe4, 'plain'),
    box([0.53, 0.53, 0.02], [0, 0, 0.285], 0xffffff, 'iw_die3'),
    box([0.02, 0.53, 0.53], [0.285, 0, 0], 0xffffff, 'iw_die5'),
    box([0.53, 0.02, 0.53], [0, 0.285, 0], 0xffffff, 'iw_die1')
  ], [0.12, 0.3, -0.12], [-0.74, -0.3, 0.38])).concat([
    spark([0.6, 0.72, 0.45], 1.1),
    spark([-0.85, 0.35, 0.5], 0.7)
  ]), { yaw: 0.6, pitch: 0.45, tilt: 0.06, zoom: 1.20 });

  // 堕落魔剑：更暗更大的魔剑，亮紫色发光裂纹，护手上一对蝙蝠翅膀和一只红眼
  evolved('corrupted', recolor(WP.corrupted, { 0x5a2a7a: 0x3e1458, 0xd060ff: 0xff5af0, 0x3a1a4a: 0x24082e, 0x2a1a36: 0x1a0a22, 0xff5ad0: 0xff2a3a }).concat([
    wing([0.12, -0.02, -0.04], [1.0, 0.85], 1, 0x3a1a4a, null, 'plain'),
    wing([-0.12, -0.02, -0.04], [1.0, 0.85], -1, 0x3a1a4a, null, 'plain'),
    spark([0.0, 1.62, 0.12], 1.0, 0xffb0ff)
  ]), { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.62 });

  // 月刃回旋镖：一弯又薄又尖的金色月牙刃（内缘一道白光），背上缠着红色握把
  evolved('banana', [
    P('iw_poly', [0.08, crescentPts(0.8, 0.26, 3.9, 16)], [0, 0, 0], 0xf4c040, 'gold'),
    P('iw_poly', [0.09, crescentPts(0.6, 0.06, 3.2, 14)], [0, 0, 0], 0xfffbe0, '!plain'),
    box([0.22, 0.13, 0.13], [0, 0.74, 0], 0x8a1a2a, 'ch_leather'),
    spark([0.0, -0.05, 0.1], 1.1),
    spark([0.75, 0.75, 0.1], 0.7)
  ], { yaw: 0.25, pitch: 0.35, tilt: 0.6, zoom: 1.20 });

  // 天罚雷杖：金杖紫握把，金爪里一颗更大的炽白水晶（外面一圈光环），四面八方窜出折线电弧
  // 折线电弧：从 a 出发，segs 里每一段是 [dx, dy]，一段段折过去
  var zap = function (a, segs, w, c) {
    var out = [], p0 = a;
    segs.forEach(function (sg) {
      var p1 = [p0[0] + sg[0], p0[1] + sg[1], p0[2]];
      out.push(rod('box', p0, p1, [w, w], c, '!plain'));
      out.push(box([w, w, w], p1, c, '!plain'));
      p0 = p1;
    });
    return out;
  };
  // （原权杖的前 7 个零件是杖身和金爪，水晶和闪电换成新的）
  evolved('lightning', recolor(WP.lightning.slice(0, 7), { 0x2a4ab0: 0x6a2ab8 }).concat([
    P('oct', [0.32], [0, 0.78, 0], 0x8ad8ff, '!plain', null, [1, 1.35, 1]),
    P('oct', [0.17], [0, 0.8, 0.16], 0xffffff, '!plain', null, [1, 1.3, 1]),
    P('iw_arc', [0.5, 0.035, 4, 20], [0, 0.8, 0.05], 0xfff27a, '!plain')
  ]).concat(zap([0.05, 1.2, 0.1], [[0.2, 0.18], [-0.12, 0.16], [0.22, 0.24]], 0.07, 0xfff27a))
    .concat(zap([-0.3, 0.98, 0.1], [[-0.26, 0.06], [0.0, 0.2], [-0.26, 0.1]], 0.065, 0xfffbe0))
    .concat(zap([0.32, 0.92, 0.1], [[0.24, -0.08], [0.02, 0.2], [0.24, -0.02]], 0.065, 0xfffbe0))
    .concat([spark([0.55, 1.6, 0.12], 0.9)]), { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.34 });

  // 焦土行者：黑曜石战靴配金边，接缝里的岩浆更亮，脚下一片烧焦的地面，身后的火更大
  // （原战靴的前 8 个零件是靴子本身，火焰换成更大的）
  evolved('flamewalker', recolor(WP.flamewalker.slice(0, 8), { 0x5a606c: 0x2e2630, 0x7a808c: GOLD_L, 0x6a707c: GOLD, 0x241e22: 0x1a1416 }).concat([
    P('cyl', [0.95, 0.95, 0.04, 10], [0, -0.06, 0.05], 0x2a1a14, 'en_rock'),
    P('iw_arc', [0.7, 0.04, 3, 14, 4.2], [0, -0.03, 0.05], 0xff7a20, '!plain', [PI / 2, 0, 0.6]),
    P('iw_arc', [0.45, 0.035, 3, 12, 3.6], [0, -0.03, 0.05], 0xffb030, '!plain', [PI / 2, 0, 2.4])
  ]).concat(flame([-0.05, -0.08, -0.85], 1.55, [0, -0.95, 0.18], [0xff5a10, FIRE_O, FIRE_Y]))
   .concat(flame([-0.3, -0.1, -0.3], 0.8, [0, -0.95, 0.05], [0xff5a10, FIRE_O, FIRE_Y]))
   .concat(flame([-0.35, -0.1, 0.45], 0.7, [0, -0.95, -0.15]))
   .concat([spark([-0.2, 1.45, 0.5], 1.0)]), { yaw: -0.95, pitch: 0.38, zoom: 0.98 });

  // 陨星重锤：金柄金链，铁球变成烧着的陨石（金刺），后面拖着一道火
  evolved('chunkers', flame([0.3, 0.3, -0.35], 1.25, [0, 0, 0.85], [0xff5a10, FIRE_O, FIRE_Y]).concat(
    recolor(flail, { 0x8a5a30: 0x3a2418, 0x6a3e22: 0x9a1a2a, 0x5a5f6a: GOLD, 0x9aa0a8: GOLD_L, 0x4a4e5a: 0x7a3a1e, 0xdfe4ec: GOLD_L }, { 0x4a4e5a: 'en_rock' })
  ).concat([
    P('ball', [0.2, 1], [0.38, 0.38, 0.2], 0xff7a20, '!plain'),
    spark([0.85, 0.95, 0.3], 1.0)
  ]), { yaw: 0.35, pitch: 0.3, zoom: 1.09 });

  // 奥术飞弹群：三颗魔弹排成一队（紫、粉、金白），各拖着弯弯的尾巴
  var missile = xf(WP.rocket, [0, 0, -0.6]);
  evolved('rocket', xf(missile, [0, 0, 0.6], [0.12, 0.08, 0.1], 0.82)
    .concat(xf(recolor(missile, { 0xa83aff: 0xff4ad0, 0x8a2ae0: 0xd02aa0, 0xd070ff: 0xff8ae0 }), [0, 0, 0.6], [-0.62, 0.42, -0.1], 0.55))
    .concat(xf(recolor(missile, { 0xa83aff: 0xffb02a, 0x8a2ae0: 0xe08a1a, 0xd070ff: 0xffd870, 0xf0a8ff: 0xfff0b0 }), [0, 0, 0.6], [0.5, -0.6, -0.1], 0.55)), { yaw: 0.25, pitch: 0.25, zoom: 1.07 });

  // 黄金火药：金箍金带的火药桶，桶口堆着一堆金粉，引信冒着大火星，脚边撒着金币
  var coin = function (pos, rot) { return [P('cyl', [0.17, 0.17, 0.05, 10], pos, 0xffd23a, 'gold', rot), P('cyl', [0.11, 0.11, 0.06, 10], pos, 0xfff0a0, 'gold', rot)]; };
  evolved('mines', recolor(WP.mines, { 0x3a3a46: 0xf0b830, 0xd8342a: 0xffd23a }, { 0x3a3a46: 'gold', 0xd8342a: 'gold' }).concat([
    P('cone', [0.3, 0.22, 8], [-0.04, 0.56, 0], 0xffd84a, 'gold'),
    P('oct', [0.06], [-0.12, 0.62, 0.2], 0xffffff, '!plain')
  ]).concat(coin([0.48, -0.42, 0.32], [0.3, 0, 0.2])).concat(coin([-0.42, -0.44, 0.38], [-0.2, 0, -0.3])).concat(coin([0.05, -0.47, 0.55], [0.5, 0, 0])).concat([
    P('iw_poly', [0.04, star(4, 0.3, 0.07)], [0.25, 0.77, 0.2], 0xffffff, '!plain'),
    spark([-0.55, 0.62, 0.3], 0.8)
  ]), { yaw: 0.5, pitch: 0.38, zoom: 0.88 });

  // 缚魂锁链：金色锁链和金钩，周围飘着两团带眼睛的蓝色魂火
  var wisp = function (pos, k) {
    return flame(pos, k, null, [0x4ac8ff, 0xa8ecff, 0xffffff]).concat([
      box([0.045, 0.07, 0.02], [pos[0] - 0.05 * k * 1.4, pos[1] + 0.3 * k, pos[2] + 0.2], 0x0a1430, 'plain'),
      box([0.045, 0.07, 0.02], [pos[0] + 0.05 * k * 1.4, pos[1] + 0.3 * k, pos[2] + 0.2], 0x0a1430, 'plain')
    ]);
  };
  evolved('noodle', recolor(WP.noodle, { 0xc0c8d0: GOLD_L, 0xb0b8c4: GOLD, 0xd8dee8: 0xfff0c0 }).concat(wisp([0.55, 0.25, 0.1], 0.62)).concat(wisp([-0.55, -0.25, 0.1], 0.5)).concat([
    spark([0.75, -0.95, 0.2], 0.8)
  ]), { yaw: 0.35, pitch: 0.3, zoom: 0.97 });

  // 传说勇者剑：更亮的蓝光剑身、金色上翘护手、发光的宝石，旁边飞出一道蓝白色的新月剑气
  evolved('herosword', [
    P('iw_poly', [0.05, crescentPts(0.78, 0.28, 2.2)], [0.02, 0.98, -0.1], 0x9ad8ff, '!plain', [0, 0, PI / 2]),
    P('iw_poly', [0.05, crescentPts(0.72, 0.1, 1.9)], [0.02, 0.98, -0.06], 0xe8f8ff, '!plain', [0, 0, PI / 2])
  ].concat(recolor(WP.herosword, { 0xd8ecff: 0xeef8ff, 0x6ac0ff: 0x5ad8ff, 0x2a5ad8: GOLD_L, 0xffe14a: 0x5ad0ff })).concat([
    P('oct', [0.05], [0, 0.03, 0.14], 0xffffff, '!plain'),
    spark([0.0, 1.66, 0.12], 1.15)
  ]), { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.48 });

  // 暴风散弩：金弩臂、深色木身，一次搭五支短箭，扇形张得更开
  evolved('shotgun', crossbow({ wood: 0x6a2a1a, woodD: 0x4a1a10, limb: 0xf0b830, limbT: 'gold', span: 0.95, str: 0.055, extra: []
    .concat(bolt([-0.1, 0.13, 0], [1.08, 0.13, 0], 0.07, 0xffd84a))
    .concat(bolt([-0.08, 0.13, 0.05], [0.98, 0.13, 0.42], 0.065, 0xe8323a))
    .concat(bolt([-0.08, 0.13, -0.05], [0.98, 0.13, -0.42], 0.065, 0xe8323a))
    .concat(bolt([-0.06, 0.13, 0.08], [0.72, 0.13, 0.78], 0.065, 0xe8323a))
    .concat(bolt([-0.06, 0.13, -0.08], [0.72, 0.13, -0.78], 0.065, 0xe8323a))
    .concat([spark([1.2, 0.3, 0.0], 1.1)]) }), { yaw: 0.0, pitch: 1.15, spin: PI / 4, zoom: 1.44 });

  // 真龙吐息：金鳞真龙（白金腹甲、红色龙须），喷出更大的白热火焰
  // （原龙头的前 16 个零件是龙本身，火焰换成更大的白热火焰）
  evolved('dragon', recolor(WP.dragon.slice(0, 16), { 0xc8361e: 0xf0b030, 0x8a2012: 0xb87818, 0xf0a058: 0xfff0c0, 0xffd23a: 0xff3a2a, 0xf4e8cc: 0xffffff, 0xd0c0a0: 0xf0e0c0 }).concat([
    P('iw_horn', [0.42, 0.035, 0.012, 8, 2.0, 4, 1], [0.62, -0.32, 0.18], 0xe8323a, 'plain', [0, 0, 0.4]),
    P('iw_horn', [0.36, 0.03, 0.01, 8, 1.8, 4, 1], [0.5, -0.3, -0.16], 0xc82a2a, 'plain', [0, 0, 0.5])
  ]).concat(flame([0.76, -0.06, 0.05], 1.05, [0, 0.45, -PI / 2], [0xff7a1a, 0xffe060, 0xffffff]))
   .concat([spark([1.3, 0.55, 0.2], 1.0)]), { yaw: 0.45, pitch: 0.22, tilt: 0.72, zoom: 1.20 });

  // 死神镰刀：漆黑的长柄、暗紫色的大镰刃（刃口发紫光），柄头一个骷髅，刃边飘着紫色魂火
  evolved('scythe', recolor(WP.scythe, { 0x5a3a22: 0x1e1624, 0x7a5230: 0x3a2a4a, 0x5a5f6a: 0x6a4a8a, 0x7a7a9a: 0x4a3a6a, 0xe8ecf6: 0xd890ff }, { 0xe8ecf6: '!plain' }).concat([
    P('ball', [0.13, 1], [0.48, 0.72, 0.1], 0xf4ecd8, 'bone'),
    box([0.04, 0.04, 0.02], [0.43, 0.74, 0.22], 0x1a0a1a, 'plain'),
    box([0.04, 0.04, 0.02], [0.53, 0.74, 0.22], 0x1a0a1a, 'plain'),
    P('oct', [0.06], [0.48, 0.64, 0.2], 0x1a0a1a, 'plain')
  ]).concat(flame([-0.3, 0.75, -0.1], 0.55, null, [0x9a4aff, 0xd8a0ff, 0xffffff]))
   .concat([spark([-0.55, -0.4, 0.2], 0.9, 0xf0d8ff)]), { yaw: 0.35, pitch: 0.3, zoom: 1.12 });
})();
