'use strict';
// ============================================================
//  武器图标：每把武器都是一个低多边形小模型，
//  零件格式和 MODEL.build 一样，用游戏里同一套像素贴图和光照渲染成小图
//  贴图名前面加 '!' 表示发光零件（不吃光照：火焰、魔法、宝石、闪电）
//  ICONS.model 定义图标，ICONS.use 对应到游戏 id：weapon(id, 零件, 镜头) 定义 'w_<id>'
//  超武：每个都有自己的模型 'x_<id>'（文件最后的第 11b 块，evolved() 定义；金描边 + 右上角闪光，模型不染金）
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

  // 粗细会变的弯管（弓臂、爪尖、龙角、牛角）：沿 XY 平面里的圆弧，从 +X 开始逆时针
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
  // 超武图标：'x_<id>'（evoMark：icons.js 画金描边 + 右上角闪光；不定义的话，界面会用原武器图标的金色版）
  function evolved(id, parts, opts) {
    opts = opts || {}; opts.evoMark = true;
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
  var WOOD = 0x8a5a30, WOOD_D = 0x5a3820, LEATHER = 0x6a3e22;
  var FIRE_O = 0xff8a1a, FIRE_Y = 0xffd040, FIRE_W = 0xfff4c0;

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
    // 第 11 块的新贴图（同样只用坐标算，不碰共享的随机数；排在上面这些后面）
    // 骑枪：斜着绕上去的红白螺旋条纹（彩色，配白色顶点色）
    add('iw_spiral', function (x, y) {
      return (y * 2 + (x >> 1)) % 8 < 4 ? [206, 44, 50] : [244, 240, 232];
    });
    // 草编蜂箱：一圈圈横着的草绳（亮、中、中、暗），草秆上一点点花纹
    add('iw_straw', function (x, y) {
      return [250, 228, 206, 150][y % 4] - ((x * 7 + y * 13) % 5) * 4;
    });
    // 棋盘：4×4 的黑白格（彩色）
    add('iw_check', function (x, y) {
      return ((x >> 2) + (y >> 2)) % 2 ? [44, 38, 50] : [236, 230, 214];
    });
  })();

  // ---------------- 通用零件（弩、弩箭、铁链的一节、羽翼、新月）：以前的图标留下来的小工具 ----------------
  // 弩：沿 +X 朝前，上方 +Y，弩臂往 ±Z 张开
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
  // 铁链的一节（pos 是中心，ang 是在 XY 平面里的朝向，side 为真时竖起来 / 平放）
  function link(pos, ang, side, r, c) {
    r = r || 0.1;
    return xf([P('iw_arc', [r, r * 0.33, 4, 8], [0, 0, 0], c || 0x9aa0a8, 'metal', side ? [PI / 2, 0, 0] : null, [1.55, 1, 1])], [0, 0, ang], pos);
  }
  // 羽翼（右翼，根部在原点往 +X 张开：上沿是拱起的翼骨，下沿是一根根往下垂的羽毛；side = -1 是左翼）
  var WING = [0, 0, 0.18, 0.2, 0.45, 0.36, 0.7, 0.4, 0.88, 0.32, 0.78, 0.16, 0.7, 0.2, 0.62, 0.0, 0.52, 0.08, 0.44, -0.12, 0.34, -0.0, 0.24, -0.14, 0.12, -0.04, 0.02, -0.1];
  function wing(pos, k, side, c, rot, t) {
    var pts = WING.map(function (v, i) { return i % 2 ? v : v * side; });
    return P('iw_poly', [0.07, pts], pos, c || 0xfffaf0, t || 'ch_feather', rot || null, Array.isArray(k) ? [k[0], k[1], 1] : [k, k, 1]);
  }
  // 新月形（和游戏里的斩击一样）：中间最厚、两头尖，弧的中间朝 +Y
  function crescentPts(R, w, arc, n) {
    n = n || 10;
    var out = [], i, t, a, rr;
    for (i = 0; i <= n; i++) { t = i / n; a = (t - 0.5) * arc; out.push(Math.sin(a) * R, Math.cos(a) * R); }
    for (i = n - 1; i >= 1; i--) { t = i / n; a = (t - 0.5) * arc; rr = R - w * Math.pow(Math.sin(t * PI), 0.8); out.push(Math.sin(a) * rr, Math.cos(a) * rr); }
    return out;
  }
  // 两点之间按比例取一点
  function mix(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, (a[2] || 0) + ((b[2] || 0) - (a[2] || 0)) * t]; }
  // 一段圆弧上的发光短弧（声波、动作线）：圆心 c、半径 R、从角度 a0 起弧度 arc
  function wave(c, R, a0, arc, w, col) { return P('iw_arc', [R, w || 0.035, 3, 8, arc], c, col || 0xffe8b0, '!plain', [0, 0, a0]); }

  // ============================================================
  //  30 把武器（第 11 块）：每把一个小模型 'w_<id>'
  //  超武在文件最后另画（第 11b 块 'x_<id>'）；没有自己模型的超武才用这个模型的金色版（'evo:w_<id>'）
  // ============================================================

  // 骑士剑：笔直的骑士剑，钢色十字护手（两头八面体）、血槽、蓝色皮握把、圆柄头
  weapon('knightsword', [
    P('iw_blade', [1.55, 0.26, 0.08, 0.26, 1.0], [0, 0.06, 0], STEEL, 'ch_plate'),
    box([0.045, 1.12, 0.085], [0, 0.66, 0], 0xb8c4d0, 'metal'),
    box([0.72, 0.1, 0.14], [0, 0.03, 0], 0x9aa3ad, 'metal'),
    P('oct', [0.08], [0.38, 0.03, 0], 0x9aa3ad, 'metal'),
    P('oct', [0.08], [-0.38, 0.03, 0], 0x9aa3ad, 'metal'),
    P('cyl', [0.06, 0.06, 0.44, 6], [0, -0.2, 0], 0x3a5ab0, 'ch_leather'),
    P('sphere', [0.1, 8, 6], [0, -0.47, 0], 0x9aa3ad, 'metal')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.45 });

  // 骑枪：长长的锥形枪身绕着红白螺旋条纹，喇叭形的圆护手，木握把缠皮
  weapon('lance', [
    P('cyl', [0, 0.23, 1.7, 8], [0, 0.95, 0], 0xffffff, 'iw_spiral'),
    P('iw_lathe', [12, 0.07, -0.14, 0.36, 0.05, 0.37, 0.1, 0.22, 0.12], [0, 0, 0], 0xc8d0da, 'metal'),
    P('cyl', [0.06, 0.06, 0.44, 6], [0, -0.32, 0], WOOD, 'wood'),
    P('cyl', [0.068, 0.068, 0.18, 6], [0, -0.28, 0], LEATHER, 'ch_leather'),
    P('sphere', [0.09, 8, 6], [0, -0.56, 0], 0x9aa3ad, 'metal')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.45 });

  // 锻锤：方方的黑铁锤头（一头磨得锃亮、下沿烧得通红），木锤柄缠皮，蹦出两颗火星
  weapon('forgehammer', [
    box([0.6, 0.32, 0.32], [0.02, 0.6, 0], 0x50545e, 'metal'),
    box([0.05, 0.3, 0.3], [0.345, 0.6, 0], STEEL, 'metal'),
    box([0.04, 0.28, 0.28], [-0.3, 0.6, 0], 0x7a808c, 'metal'),
    box([0.56, 0.05, 0.33], [0.02, 0.45, 0], 0xff5a1a, '!plain'),
    box([0.12, 1.15, 0.12], [0, -0.05, 0], WOOD, 'wood'),
    box([0.14, 0.34, 0.14], [0, -0.45, 0], LEATHER, 'ch_leather'),
    spark([0.56, 0.9, 0.2], 0.8, 0xffd040),
    spark([0.64, 0.4, 0.2], 0.55, 0xff9a3a),
    P('oct', [0.045], [0.5, 0.66, 0.2], 0xffb040, '!plain'),
    P('oct', [0.035], [0.52, 0.28, 0.18], 0xffb040, '!plain')
  ], { tilt: -0.5, yaw: 0.4, pitch: 0.3, zoom: 1.3 });

  // 猎隼：侧身站在皮手套上（朝右），翅膀半张，奶白胸口、深色头顶、黄喙黄爪
  var FAL_WING = [0, 0, -0.16, 0.2, -0.4, 0.42, -0.62, 0.54, -0.56, 0.38, -0.62, 0.3, -0.48, 0.2, -0.52, 0.1, -0.38, 0.04, -0.36, -0.06, -0.2, -0.08];
  var FAL_TAIL = [0.06, 0.04, -0.08, 0.08, -0.38, -0.28, -0.33, -0.36, -0.22, -0.4, 0.04, -0.06];
  weapon('falcon', [
    P('iw_poly', [0.05, FAL_WING], [0.0, 0.12, -0.2], 0x4a3420, 'ch_feather', null, [1.12, 1.08, 1]),
    P('iw_poly', [0.05, FAL_WING], [0.0, 0.12, -0.15], 0x8a6a40, 'ch_feather'),
    P('iw_poly', [0.05, FAL_TAIL], [-0.12, -0.1, -0.05], 0x5a4228, 'ch_feather'),
    P('sphere', [0.3, 10, 8], [0.02, 0.02, 0], 0x8a6a40, 'ch_feather', [0, 0, 0.95], [1, 0.72, 0.62]),
    P('sphere', [0.2, 10, 8], [0.12, 0.0, 0.07], 0xf0e0c0, 'ch_feather', null, [0.75, 1, 0.7]),
    P('sphere', [0.15, 10, 8], [0.2, 0.3, 0], 0x8a6a40, 'ch_feather'),
    P('sphere', [0.155, 10, 8], [0.17, 0.36, 0], 0x4a3420, 'ch_feather', null, [1, 0.6, 1]),
    P('sphere', [0.09, 8, 6], [0.25, 0.25, 0.07], 0xf0e0c0, 'plain'),
    P('cone', [0.05, 0.13, 4], [0.36, 0.28, 0], 0xf0c040, 'plain', [0, 0, -PI / 2 - 0.35]),
    box([0.05, 0.05, 0.03], [0.27, 0.32, 0.13], 0x1a1410, 'plain'),
    box([0.02, 0.02, 0.02], [0.28, 0.335, 0.145], 0xffffff, 'plain'),
    box([0.06, 0.1, 0.06], [0.02, -0.25, 0.06], 0xf0c040, 'plain'),
    box([0.06, 0.1, 0.06], [0.1, -0.25, -0.04], 0xf0c040, 'plain'),
    box([0.4, 0.2, 0.28], [0.05, -0.39, 0], 0x7a4a2a, 'ch_leather'),
    P('iw_taper', [0.26, 0.38, 0.42, 0.26, 0.34], [-0.3, -0.5, 0], 0x6a3e22, 'ch_leather', [0, 0, -1.25]),
    box([0.42, 0.07, 0.38], [-0.48, -0.56, 0], 0xc8a060, 'ch_leather', [0, 0, -1.25])
  ], { yaw: 0.25, pitch: 0.2, zoom: 1.1 });

  // 颜料桶：歪着的铁皮桶（桶里是红颜料，漂着黄、蓝两团），红、黄、蓝三股颜料从低的桶沿淌下来，地上一摊
  var bucket = xf([
    P('iw_lathe', [12, 0.26, -0.32, 0.36, 0.3, 0.33, 0.3, 0.24, -0.26, 0.0, -0.26], [0, 0, 0], 0x9aa8b8, 'metal'),
    P('iw_arc', [0.355, 0.03, 4, 16], [0, 0.3, 0], 0xd0d8e2, 'metal', [PI / 2, 0, 0]),
    P('iw_arc', [0.3, 0.025, 4, 12], [0, -0.1, 0], 0x7a8898, 'metal', [PI / 2, 0, 0]),
    P('cyl', [0.31, 0.31, 0.02, 12], [0, 0.17, 0], 0xe83a3a, 'plain'),
    P('sphere', [0.1, 8, 6], [-0.1, 0.18, 0.06], 0xf0d030, 'plain', null, [1, 0.25, 1]),
    P('sphere', [0.09, 8, 6], [0.08, 0.18, -0.12], 0x3a7ae8, 'plain', null, [1, 0.25, 1]),
    P('iw_arc', [0.36, 0.018, 3, 10, PI], [0, 0.3, 0], 0x6a707c, 'metal', [-0.5, 0, 0])
  ], [0, 0, -0.5], [-0.12, 0.1, 0]);
  weapon('paintbucket', bucket.concat([
    rod('box', [0.33, 0.12, 0.08], [0.38, -0.42, 0.14], [0.08, 0.05], 0xe83a3a, 'plain'),
    rod('box', [0.36, 0.1, -0.02], [0.47, -0.42, 0.06], [0.08, 0.05], 0xf0d030, 'plain'),
    rod('box', [0.39, 0.08, -0.12], [0.56, -0.42, -0.02], [0.08, 0.05], 0x3a7ae8, 'plain'),
    P('sphere', [0.07, 8, 6], [0.34, 0.12, 0.09], 0xe83a3a, 'plain'),
    P('sphere', [0.07, 8, 6], [0.37, 0.1, -0.02], 0xf0d030, 'plain'),
    P('sphere', [0.07, 8, 6], [0.4, 0.08, -0.12], 0x3a7ae8, 'plain'),
    P('cyl', [0.26, 0.26, 0.03, 10], [0.44, -0.44, 0.16], 0xe83a3a, 'plain', null, [1, 1, 0.7]),
    P('cyl', [0.2, 0.2, 0.03, 10], [0.62, -0.43, 0.0], 0x3a7ae8, 'plain', null, [1, 1, 0.8]),
    P('cyl', [0.16, 0.16, 0.03, 10], [0.5, -0.42, 0.06], 0xf0d030, 'plain')
  ]), { yaw: 0.5, pitch: 0.35, zoom: 0.98 });

  // 猫爪：抬起来挠人的奶白猫爪（下面一截带浅橘色虎斑的前腿），粉色大肉垫 + 四颗小肉垫，三根弯钩爪尖从上沿冒出来
  var clawsP = [
    P('cyl', [0.25, 0.28, 0.62, 10], [0, -0.62, -0.06], 0xf4ece4, 'fur'),
    P('cyl', [0.262, 0.27, 0.07, 10], [0, -0.52, -0.06], 0xe8a868, 'fur'),
    P('cyl', [0.272, 0.28, 0.07, 10], [0, -0.74, -0.06], 0xe8a868, 'fur'),
    P('sphere', [0.42, 12, 10], [0, -0.04, 0], 0xf4ece4, 'fur', null, [0.92, 1.0, 0.55]),
    P('sphere', [0.17, 10, 8], [0, -0.17, 0.2], 0xff9ab8, 'plain', null, [1.15, 1.0, 0.4])
  ];
  [[-0.25, 0.12], [-0.09, 0.25], [0.09, 0.25], [0.25, 0.12]].forEach(function (t) {
    clawsP.push(P('sphere', [0.075, 8, 6], [t[0], t[1], 0.19], 0xff9ab8, 'plain', null, [1, 1.15, 0.4]));
  });
  // 爪尖：弯钩形的平板（根部藏在爪子里，从上沿冒出来，尖往前勾）
  var CLAW = [-0.05, 0, 0.05, 0, 0.09, 0.1, 0.13, 0.15, 0.24, 0.08, 0.18, 0.22, 0.08, 0.29, -0.02, 0.26, -0.06, 0.14];
  [[-0.19, 0.27, 0.3], [0, 0.33, 0.05], [0.19, 0.27, -0.2]].forEach(function (c) {
    clawsP.push(P('iw_poly', [0.07, CLAW], [c[0], c[1], 0.02], 0xb8c4d6, 'plain', [0, 0, c[2]], [0.8, 1.0, 1]));
  });
  weapon('claws', xf(clawsP, [0, 0, -0.5]), { yaw: 0.2, pitch: 0.25, zoom: 1.08 });

  // 蜂箱：草编的圆顶蜂箱（一圈圈草绳）、小门洞、木底板，两只小蜜蜂
  function bee(pos, k, rot) {
    return xf([
      P('sphere', [0.1, 8, 6], [0, 0, 0], 0xffd040, 'plain', null, [1.4, 1, 1]),
      box([0.04, 0.2, 0.2], [0.02, 0, 0], 0x2a1a10, 'plain'),
      box([0.04, 0.17, 0.17], [-0.07, 0, 0], 0x2a1a10, 'plain'),
      box([0.1, 0.02, 0.13], [-0.01, 0.12, 0.05], 0xf4f8ff, 'plain', [0.4, 0, 0.3]),
      box([0.1, 0.02, 0.13], [-0.01, 0.12, -0.05], 0xf4f8ff, 'plain', [-0.4, 0, 0.3])
    ], rot || null, pos, k);
  }
  weapon('beehive', [
    P('iw_lathe', [12, 0.5, -0.38, 0.52, -0.2, 0.49, 0.02, 0.41, 0.2, 0.28, 0.35, 0.12, 0.44, 0, 0.46], [0, 0, 0], 0xd8a848, 'iw_straw'),
    box([0.22, 0.16, 0.08], [0, -0.3, 0.5], 0x2a1a10, 'plain'),
    box([1.2, 0.1, 1.2], [0, -0.43, 0], WOOD, 'wood')
  ].concat(bee([-0.62, 0.36, 0.1], 1.1, [0, 0, 0.2])).concat(bee([0.62, 0.06, 0.2], 1, [0, PI, -0.2])), { yaw: 0.45, pitch: 0.3, zoom: 0.98 });

  // 星盘：两个交叉的黄铜圆环、横着的指针、顶上的挂环，中间一颗发光的小金星
  weapon('astrolabe', [
    P('iw_arc', [0.6, 0.06, 5, 24], [0, 0, 0], 0xd9a64a, 'gold'),
    P('iw_arc', [0.6, 0.055, 5, 24], [0, 0, 0], 0xb8843a, 'gold', [0, PI / 3, 0]),
    box([1.16, 0.06, 0.05], [0, 0, 0.03], 0xb07a2a, 'gold', [0, 0, 0.5]),
    P('sphere', [0.08, 8, 6], [0, 0, 0], 0xb07a2a, 'gold'),
    box([0.07, 0.1, 0.07], [0, 0.65, 0], 0xd9a64a, 'gold'),
    P('iw_arc', [0.1, 0.03, 4, 10], [0, 0.78, 0], 0xd9a64a, 'gold'),
    P('iw_poly', [0.06, star(5, 0.2, 0.08)], [0, 0, 0.07], 0xffe070, '!plain')
  ], { yaw: 0.4, pitch: 0.25, zoom: 1.1 });

  // 魔术飞刀：五把银色飞刀扇形排开，红握把（刀身和护手的比例照着以前的短匕首）
  var knife = [
    P('iw_blade', [0.64, 0.14, 0.05, 0.2, 0.9], [0, 0.72, 0], 0xe0e4ec, 'ch_plate'),
    box([0.24, 0.055, 0.08], [0, 0.71, 0], 0x3a3e48, 'metal'),
    box([0.075, 0.3, 0.07], [0, 0.54, 0], 0xd0283a, 'ch_leather'),
    box([0.09, 0.04, 0.08], [0, 0.38, 0], 0x3a3e48, 'metal')
  ];
  var fan = [];
  for (var ki = 0; ki < 5; ki++) fan = fan.concat(xf(knife, [0, 0, (2 - ki) * 0.27], [0, 0, ki * 0.012]));
  weapon('trickknives', fan, { yaw: 0, pitch: 0.25, zoom: 1.06 });

  // 信鸽：朝左的白鸽，翅膀扬起（灰色翼尖），腿上绑着一卷信（红丝带）
  var PIG_WING = [0, 0, 0.2, 0.45, 0.42, 0.62, 0.42, 0.42, 0.48, 0.32, 0.36, 0.24, 0.4, 0.13, 0.26, 0.07, 0.22, -0.04];
  var PIG_TAIL = [0, 0.06, 0.42, 0.04, 0.46, -0.08, 0.38, -0.13, 0, -0.06];
  weapon('pigeons', [
    P('iw_poly', [0.05, PIG_WING], [0.04, 0.1, -0.14], 0xb0b8c8, 'ch_feather', null, [1.12, 1.1, 1]),
    P('iw_poly', [0.05, PIG_WING], [0.04, 0.12, -0.09], 0xe8ecf4, 'ch_feather'),
    P('iw_poly', [0.05, PIG_TAIL], [0.22, -0.06, 0], 0xc0c6d4, 'ch_feather'),
    P('sphere', [0.3, 10, 8], [0, 0, 0], 0xf4f4f8, 'ch_feather', [0, 0, -0.25], [1.25, 0.85, 0.75]),
    P('sphere', [0.15, 10, 8], [-0.32, 0.26, 0], 0xf4f4f8, 'ch_feather'),
    P('cone', [0.045, 0.14, 5], [-0.5, 0.24, 0], 0xe8a060, 'plain', [0, 0, PI / 2 + 0.25]),
    box([0.045, 0.045, 0.03], [-0.38, 0.3, 0.13], 0xc02828, 'plain'),
    box([0.035, 0.18, 0.035], [-0.04, -0.3, 0.06], 0xd86a5a, 'plain'),
    box([0.035, 0.18, 0.035], [0.06, -0.3, -0.04], 0xd86a5a, 'plain'),
    P('cyl', [0.065, 0.065, 0.3, 8], [-0.02, -0.34, 0.12], 0xf0e6c8, 'ii_pages', [0, 0, PI / 2]),
    box([0.05, 0.15, 0.15], [-0.02, -0.34, 0.12], 0xd83a3a, 'cloth')
  ], { yaw: 0.3, pitch: 0.25, zoom: 1.1 });

  // 投石车：木架子（两个 A 字架）、铁轴、长长的抛臂，一头皮兜里兜着圆石，另一头挂着包铁箍的配重箱
  weapon('trebuchet', [
    box([1.2, 0.1, 0.12], [0, -0.5, 0.24], 0x7a5230, 'wood'),
    box([1.2, 0.1, 0.12], [0, -0.5, -0.24], 0x7a5230, 'wood'),
    box([0.1, 0.08, 0.6], [-0.5, -0.5, 0], 0x7a5230, 'wood'),
    box([0.1, 0.08, 0.6], [0.5, -0.5, 0], 0x7a5230, 'wood'),
    rod('box', [-0.4, -0.46, 0.24], [0, 0.3, 0.24], [0.08, 0.08], 0xa87040, 'wood'),
    rod('box', [0.4, -0.46, 0.24], [0, 0.3, 0.24], [0.08, 0.08], 0xa87040, 'wood'),
    rod('box', [-0.4, -0.46, -0.24], [0, 0.3, -0.24], [0.08, 0.08], 0xa87040, 'wood'),
    rod('box', [0.4, -0.46, -0.24], [0, 0.3, -0.24], [0.08, 0.08], 0xa87040, 'wood'),
    P('cyl', [0.05, 0.05, 0.62, 6], [0, 0.3, 0], IRON, 'metal', [PI / 2, 0, 0]),
    rod('box', [0.38, 0.06, 0], [-0.62, 1.0, 0], [0.09, 0.09], 0xb07a40, 'wood'),
    box([0.3, 0.26, 0.3], [0.4, -0.12, 0], 0x7a5230, 'wood'),
    box([0.32, 0.04, 0.32], [0.4, -0.04, 0], 0x7a808c, 'metal'),
    box([0.32, 0.04, 0.32], [0.4, -0.2, 0], 0x7a808c, 'metal'),
    rod('box', [-0.62, 1.0, 0], [-0.78, 0.74, 0], [0.03, 0.03], LEATHER, 'ch_leather'),
    box([0.2, 0.08, 0.16], [-0.8, 0.68, 0], LEATHER, 'ch_leather'),
    P('ball', [0.13, 1], [-0.8, 0.78, 0], 0xa8a8a8, 'rock')
  ], { yaw: 0.6, pitch: 0.35, zoom: 0.85 });

  // 圣咏：摊开的歌本（红封皮、奶白书页、金色书签带），三个金色音符往左上飘
  var NOTE = [0.07, 0.52, 0.24, 0.4, 0.24, 0.3, 0.12, 0.38, 0.12, 0.04, 0.07, -0.06, -0.03, -0.1, -0.12, -0.07, -0.15, 0.0, -0.1, 0.07, 0.0, 0.1, 0.07, 0.08];
  weapon('hymn', [
    box([0.62, 0.05, 0.84], [-0.32, -0.04, 0], 0x8a2a2a, 'ch_leather', [0, 0, -0.22]),
    box([0.62, 0.05, 0.84], [0.32, -0.04, 0], 0x8a2a2a, 'ch_leather', [0, 0, 0.22]),
    box([0.56, 0.1, 0.76], [-0.3, 0.03, 0], 0xf4ecd8, 'ii_pages', [0, 0, -0.22]),
    box([0.56, 0.1, 0.76], [0.3, 0.03, 0], 0xf4ecd8, 'ii_pages', [0, 0, 0.22]),
    box([0.06, 0.02, 0.42], [0.04, 0.06, 0.5], 0xd8b040, 'cloth'),
    P('iw_poly', [0.05, NOTE], [0.36, 0.4, 0.1], 0xffd84a, '!plain', null, [0.85, 0.85, 1]),
    P('iw_poly', [0.05, NOTE], [0.0, 0.66, 0.1], 0xffd84a, '!plain', null, [1.05, 1.05, 1]),
    P('iw_poly', [0.05, NOTE], [-0.38, 0.92, 0.1], 0xffd84a, '!plain', null, [1.25, 1.25, 1])
  ], { yaw: 0.35, pitch: 0.55, zoom: 1.05 });

  // 锡兵卫队：两个并排走的小锡兵：黑色高帽（金帽徽）、红上衣、白色交叉背带、蓝裤子，端着带刺刀的枪
  function tinman() {
    return [
      P('cyl', [0.11, 0.12, 0.3, 8], [0, 0.82, 0], 0x3a3a4a, 'cloth'),
      box([0.08, 0.08, 0.03], [0, 0.82, 0.12], GOLD_L, 'gold'),
      box([0.17, 0.15, 0.16], [0, 0.6, 0], 0xf0c8a0, 'skin'),
      box([0.03, 0.03, 0.02], [-0.04, 0.62, 0.085], 0x1a1a22, 'plain'),
      box([0.03, 0.03, 0.02], [0.04, 0.62, 0.085], 0x1a1a22, 'plain'),
      box([0.28, 0.32, 0.2], [0, 0.36, 0], 0xd83a3a, 'cloth'),
      box([0.05, 0.38, 0.02], [0, 0.36, 0.105], 0xf4f4f4, 'plain', [0, 0, 0.62]),
      box([0.05, 0.38, 0.02], [0, 0.36, 0.105], 0xf4f4f4, 'plain', [0, 0, -0.62]),
      box([0.26, 0.22, 0.17], [0, 0.09, 0], 0x3a56b0, 'cloth'),
      box([0.28, 0.08, 0.22], [0, -0.06, 0.01], 0x3a3a4a, 'cloth'),
      rod('box', [0.19, 0.08, 0.1], [0.19, 0.86, 0.1], [0.045, 0.045], WOOD, 'wood'),
      rod('cone', [0.19, 0.84, 0.1], [0.19, 1.1, 0.1], [0.025, 4], STEEL, 'metal')
    ];
  }
  weapon('toyguard', xf(tinman(), null, [-0.48, 0, 0.02]).concat(tinman()), { yaw: 0.5, pitch: 0.2, zoom: 1.0 });

  // 熊吼：张大嘴吼叫的熊头（朝右），白牙、黑鼻头，嘴前三道发光的声波
  weapon('roar', [
    P('sphere', [0.42, 12, 10], [0, 0, 0], 0x8a5a30, 'fur', null, [1, 0.92, 0.9]),
    P('sphere', [0.13, 8, 6], [-0.12, 0.36, 0.22], 0x8a5a30, 'fur'),
    P('sphere', [0.13, 8, 6], [-0.12, 0.36, -0.22], 0x8a5a30, 'fur'),
    P('sphere', [0.07, 8, 6], [-0.09, 0.37, 0.3], 0xc89a6a, 'fur'),
    P('sphere', [0.2, 10, 8], [0.34, 0.02, 0], 0xc89a6a, 'fur', null, [1.1, 0.7, 0.85]),
    P('sphere', [0.17, 10, 8], [0.3, -0.27, 0], 0xb08050, 'fur', null, [1.1, 0.6, 0.8]),
    P('sphere', [0.16, 8, 6], [0.32, -0.13, 0], 0x5a1a1a, 'plain', null, [1.0, 0.6, 0.75]),
    P('sphere', [0.07, 8, 6], [0.54, 0.06, 0], 0x1a1410, 'plain'),
    P('cone', [0.03, 0.08, 4], [0.47, -0.08, 0.07], 0xf4f0e0, 'plain', [PI, 0, 0]),
    P('cone', [0.03, 0.08, 4], [0.47, -0.08, -0.07], 0xf4f0e0, 'plain', [PI, 0, 0]),
    P('cone', [0.03, 0.08, 4], [0.43, -0.2, 0.07], 0xf4f0e0, 'plain'),
    P('cone', [0.03, 0.08, 4], [0.43, -0.2, -0.07], 0xf4f0e0, 'plain'),
    box([0.06, 0.07, 0.03], [0.2, 0.16, 0.3], 0x1a1410, 'plain'),
    box([0.1, 0.03, 0.03], [0.2, 0.22, 0.3], 0x4a2a14, 'plain', [0, 0, -0.4]),
    wave([0.56, -0.13, 0], 0.18, -0.8, 1.6, 0.04, 0xffe0b0),
    wave([0.56, -0.13, 0], 0.32, -0.8, 1.6, 0.04, 0xffe0b0),
    wave([0.56, -0.13, 0], 0.46, -0.8, 1.6, 0.04, 0xffe0b0)
  ], { yaw: 0.6, pitch: 0.15, zoom: 1.0 });

  // 提灯：方方的铁框手提灯，四面发光的黄玻璃（铁条十字），尖顶、提环，从一面射出一道光
  var lan = [
    box([0.5, 0.07, 0.5], [0, -0.3, 0], IRON, 'metal'),
    box([0.46, 0.06, 0.46], [0, 0.27, 0], IRON, 'metal'),
    P('cone', [0.36, 0.24, 4], [0, 0.42, 0], 0x50545e, 'metal', [0, PI / 4, 0]),
    P('iw_arc', [0.11, 0.03, 4, 10], [0, 0.62, 0], 0x7a808c, 'metal'),
    box([0.36, 0.48, 0.02], [0, 0, 0.2], 0xffd860, '!plain'),
    box([0.36, 0.48, 0.02], [0, 0, -0.2], 0xffd860, '!plain'),
    box([0.02, 0.48, 0.36], [0.2, 0, 0], 0xffd860, '!plain'),
    box([0.02, 0.48, 0.36], [-0.2, 0, 0], 0xffd860, '!plain'),
    box([0.36, 0.035, 0.035], [0, 0.02, 0.215], 0x3a3e48, 'metal'),
    box([0.035, 0.48, 0.035], [0, 0, 0.215], 0x3a3e48, 'metal'),
    box([0.035, 0.035, 0.36], [0.215, 0.02, 0], 0x3a3e48, 'metal'),
    box([0.035, 0.48, 0.035], [0.215, 0, 0], 0x3a3e48, 'metal')
  ];
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) { lan.push(box([0.07, 0.56, 0.07], [0.21 * s[0], 0, 0.21 * s[1]], 0x3a3e48, 'metal')); });
  lan.push(rod('cone', [1.0, -0.5, 0.12], [0.22, -0.04, 0.06], [0.18, 6], 0xfff4c0, '!plain'));
  weapon('lanternbeam', lan, { yaw: 0.45, pitch: 0.25, zoom: 1.0 });

  // 墓烛：粗粗的白蜡烛（几道蜡泪）插在铁烛台上，烧着青白色的火苗
  var candle = [
    P('cyl', [0.2, 0.22, 0.7, 10], [0, 0.2, 0], 0xf0ece0, 'plain'),
    P('cyl', [0.04, 0.04, 0.2, 5], [0.15, 0.46, 0.12], 0xfaf8f0, 'plain'),
    P('sphere', [0.045, 6, 5], [0.15, 0.36, 0.12], 0xfaf8f0, 'plain'),
    P('cyl', [0.035, 0.035, 0.3, 5], [-0.1, 0.42, 0.17], 0xfaf8f0, 'plain'),
    P('sphere', [0.042, 6, 5], [-0.1, 0.27, 0.17], 0xfaf8f0, 'plain'),
    box([0.025, 0.08, 0.025], [0, 0.59, 0], 0x2a2020, 'plain'),
    P('iw_lathe', [12, 0.08, -0.2, 0.36, -0.16, 0.38, -0.1, 0.3, -0.12, 0, -0.13], [0, 0, 0], 0x5a5f6a, 'metal'),
    P('iw_arc', [0.37, 0.025, 4, 16], [0, -0.1, 0], 0x9aa0ac, 'metal', [PI / 2, 0, 0]),
    P('cyl', [0.06, 0.08, 0.32, 6], [0, -0.34, 0], IRON, 'metal'),
    P('sphere', [0.09, 8, 6], [0, -0.32, 0], 0x6a707c, 'metal')
  ];
  [0.5, 2.6, 4.7].forEach(function (a) { candle.push(rod('box', [0, -0.48, 0], [Math.cos(a) * 0.32, -0.62, Math.sin(a) * 0.32], [0.05, 0.05], IRON, 'metal')); });
  weapon('gravecandle', candle.concat(flame([0, 0.6, 0.02], 0.5, null, [0x6aff9a, 0xc8ffd8, 0xffffff])), { yaw: 0.4, pitch: 0.3, zoom: 1.05 });

  // 荆棘藤：一圈带刺的藤（两股缠在一起），三片叶子，一朵小红花
  var LEAF = [0, 0, 0.1, 0.07, 0.2, 0.06, 0.3, 0, 0.2, -0.06, 0.1, -0.07];
  var vine = [
    P('iw_arc', [0.52, 0.075, 5, 18], [0, 0, 0], 0x4a7a3a, 'bark'),
    P('iw_arc', [0.55, 0.035, 4, 18], [0, 0, 0.05], 0x6a9a48, 'bark', [0, 0, 0.3])
  ];
  for (var ti = 0; ti < 9; ti++) {
    var ta = ti * PI * 2 / 9 + 0.2;
    vine.push(rod('cone', [Math.cos(ta) * 0.56, Math.sin(ta) * 0.56, 0], [Math.cos(ta) * 0.74, Math.sin(ta) * 0.74, 0], [0.05, 4], 0xd8c890, 'bone'));
  }
  [[2.2, 0.5], [3.4, -0.4], [0.9, 2.4]].forEach(function (l) {
    vine.push(P('iw_poly', [0.03, LEAF], [Math.cos(l[0]) * 0.52, Math.sin(l[0]) * 0.52, 0.06], 0x5aa040, 'leaf', [0, 0, l[0] + l[1]]));
  });
  vine.push(P('iw_poly', [0.04, star(5, 0.17, 0.08)], [0.43, -0.29, 0.1], 0xe83a4a, 'plain'));
  vine.push(P('sphere', [0.06, 8, 6], [0.43, -0.29, 0.14], 0xffd040, 'plain'));
  weapon('thornvine', xf(vine, [-0.35, 0, 0]), { yaw: 0.3, pitch: 0.6, zoom: 1.05 });

  // 平底锅：黑铁平底锅（锅沿一圈亮边），木柄头，锅里一个荷包蛋
  weapon('fryingpan', xf([
    P('iw_lathe', [14, 0, -0.07, 0.4, -0.07, 0.5, 0.05, 0.47, 0.06, 0.39, -0.04, 0, -0.04], [0, 0, 0], 0x34343c, 'metal'),
    P('iw_arc', [0.49, 0.03, 4, 20], [0, 0.055, 0], 0x8a8e98, 'metal', [PI / 2, 0, 0]),
    box([0.62, 0.06, 0.11], [0.78, 0.06, 0], 0x34343c, 'metal', [0, 0, 0.12]),
    box([0.3, 0.09, 0.14], [1.0, 0.09, 0], WOOD, 'wood', [0, 0, 0.12]),
    P('sphere', [0.24, 10, 6], [-0.04, -0.02, 0.02], 0xf8f6f0, 'plain', null, [1, 0.18, 0.85]),
    P('sphere', [0.18, 10, 6], [0.1, -0.02, -0.08], 0xf8f6f0, 'plain', null, [1, 0.18, 1]),
    P('sphere', [0.1, 10, 8], [0.0, 0.02, 0.0], 0xffc020, 'plain', null, [1, 0.6, 1])
  ], [0, -0.6, 0]), { yaw: 0.4, pitch: 0.75, zoom: 1.05 });

  // 钓竿：一节节的竹竿、绕线轮，鱼线末端挂着一条跳起来的鱼
  var RA = [-0.85, -0.85, 0], RB = [0.6, 0.78, 0], RM = mix(RA, RB, 0.55);
  var FISH = [0, 0.3, 0.1, 0.2, 0.13, 0, 0.09, -0.16, 0.04, -0.22, 0.15, -0.36, 0, -0.3, -0.12, -0.38, -0.04, -0.22, -0.1, -0.14, -0.12, 0.02, -0.08, 0.2];
  var BELLY = [-0.04, 0.18, -0.1, 0.12, -0.11, 0.0, -0.08, -0.14, -0.02, -0.12, -0.02, 0.1];
  var rodP = [
    rod('cyl', RA, RM, [0.055, 0.07, 6], 0xc8a060, 'wood'),
    rod('cyl', RM, RB, [0.03, 0.055, 6], 0xd0aa68, 'wood'),
    rod('cyl', RA, mix(RA, RB, 0.16), [0.085, 0.085, 6], 0x8a5a30, 'ch_leather')
  ];
  [0.3, 0.45, 0.65, 0.82].forEach(function (t) {
    var r = 0.07 - 0.04 * t;
    rodP.push(rod('cyl', mix(RA, RB, t - 0.012), mix(RA, RB, t + 0.012), [r + 0.014, r + 0.014, 6], 0x8a6a30, 'wood'));
  });
  var RR = mix(RA, RB, 0.22);
  rodP.push(P('cyl', [0.13, 0.13, 0.07, 10], [RR[0] + 0.1, RR[1] - 0.09, 0.06], 0x9aa3ad, 'metal', [PI / 2, 0, 0]));
  rodP.push(box([0.05, 0.05, 0.06], [RR[0] + 0.17, RR[1] - 0.15, 0.12], 0x3a2a20, 'plain'));
  rodP.push(rod('box', RB, [0.76, 0.42, 0], [0.03, 0.03], 0xf4f4f4, 'plain'));
  rodP.push(rod('box', [0.76, 0.42, 0], [0.82, 0.08, 0], [0.03, 0.03], 0xf4f4f4, 'plain'));
  rodP = rodP.concat(xf([
    P('iw_poly', [0.1, FISH], [0, 0, 0], 0x4aa0d8, 'scale'),
    P('iw_poly', [0.02, BELLY], [0, 0, 0.055], 0xf0f4f8, 'plain'),
    box([0.04, 0.04, 0.12], [0.03, 0.18, 0], 0x1a1a22, 'plain')
  ], [0, 0, -0.35], [0.88, -0.2, 0]));
  weapon('rod', rodP, { yaw: 0.3, pitch: 0.25, zoom: 1.08 });

  // 铜钟：青铜大钟（一道亮箍、厚钟口），下面露出钟锤，木横梁、一截钟绳，两边各两道声波
  weapon('bronzebell', [
    P('iw_lathe', [14, 0.52, -0.42, 0.47, -0.36, 0.38, -0.24, 0.33, -0.02, 0.31, 0.18, 0.24, 0.3, 0.1, 0.36, 0, 0.37], [0, 0, 0], 0xc8963a, 'gold'),
    P('iw_arc', [0.5, 0.045, 4, 20], [0, -0.41, 0], 0x8a5a20, 'gold', [PI / 2, 0, 0]),
    P('iw_arc', [0.335, 0.025, 4, 18], [0, -0.04, 0], 0xf0c870, 'gold', [PI / 2, 0, 0]),
    P('sphere', [0.11, 8, 6], [0.05, -0.52, 0.05], 0x5a3a20, 'metal'),
    box([0.62, 0.12, 0.16], [0, 0.44, 0], WOOD, 'wood'),
    box([0.1, 0.1, 0.1], [0, 0.36, 0], WOOD_D, 'wood'),
    rod('box', [-0.28, 0.44, 0.09], [-0.42, 0.12, 0.12], [0.045, 0.045], 0xd8b880, 'cloth'),
    rod('box', [-0.42, 0.12, 0.12], [-0.36, -0.16, 0.14], [0.045, 0.045], 0xd8b880, 'cloth'),
    wave([0, -0.2, 0], 0.66, PI - 0.25, 0.5, 0.035),
    wave([0, -0.2, 0], 0.8, PI - 0.22, 0.44, 0.035),
    wave([0, -0.2, 0], 0.66, -0.25, 0.5, 0.035),
    wave([0, -0.2, 0], 0.8, -0.22, 0.44, 0.035)
  ], { yaw: 0.3, pitch: 0.2, zoom: 1.05 });

  // 杂耍球：红、黄、蓝三个球排成一道弧（各有一道白条），两道动作线
  var jug = [
    P('iw_arc', [0.62, 0.035, 3, 8, 0.62], [0, -0.42, -0.14], 0xffffff, '!plain', [0, 0, 0.74], [0.9, 1.3, 1]),
    P('iw_arc', [0.62, 0.035, 3, 8, 0.62], [0, -0.42, -0.14], 0xffffff, '!plain', [0, 0, 1.78], [0.9, 1.3, 1])
  ];
  [[0.42, 0xe84a3a], [PI / 2, 0xf0d030], [PI - 0.42, 0x3a7ae8]].forEach(function (b) {
    var p = [Math.cos(b[0]) * 0.6, -0.42 + Math.sin(b[0]) * 0.82, 0];
    jug.push(P('sphere', [0.26, 10, 8], p, b[1], 'plain'));
    jug.push(P('iw_arc', [0.262, 0.035, 4, 16], p, 0xf4f4f8, 'plain', [1.1, 0.3, b[0]]));
  });
  weapon('juggle', jug, { yaw: 0.2, pitch: 0.25, zoom: 1.1 });

  // 风筝：蓝白相间的菱形风筝、木十字骨架，尾巴上一串蝴蝶结
  var BOW = [-0.1, 0.07, 0, 0.015, 0.1, 0.07, 0.1, -0.07, 0, -0.015, -0.1, -0.07];
  weapon('kite', [
    P('iw_poly', [0.03, [0, 0.62, -0.42, 0.12, 0, 0.12]], [0, 0, 0], 0x3a7ae8, 'cloth'),
    P('iw_poly', [0.03, [0, 0.62, 0, 0.12, 0.42, 0.12]], [0, 0, 0], 0xf4f4f8, 'cloth'),
    P('iw_poly', [0.03, [-0.42, 0.12, 0, -0.62, 0, 0.12]], [0, 0, 0], 0xf4f4f8, 'cloth'),
    P('iw_poly', [0.03, [0, 0.12, 0, -0.62, 0.42, 0.12]], [0, 0, 0], 0x3a7ae8, 'cloth'),
    box([0.035, 1.24, 0.04], [0, 0, 0.03], WOOD, 'wood'),
    box([0.84, 0.035, 0.04], [0, 0.12, 0.03], WOOD, 'wood'),
    rod('box', [0, -0.62, 0], [0.12, -0.84, 0], [0.025, 0.025], 0xe8e0d0, 'plain'),
    rod('box', [0.12, -0.84, 0], [-0.02, -1.04, 0], [0.025, 0.025], 0xe8e0d0, 'plain'),
    rod('box', [-0.02, -1.04, 0], [0.08, -1.24, 0], [0.025, 0.025], 0xe8e0d0, 'plain'),
    P('iw_poly', [0.03, BOW], [0.12, -0.84, 0.02], 0xe83a3a, 'cloth', null, [1.2, 1.2, 1]),
    P('iw_poly', [0.03, BOW], [-0.02, -1.04, 0.02], 0xf0d030, 'cloth', null, [1.2, 1.2, 1]),
    P('iw_poly', [0.03, BOW], [0.08, -1.24, 0.02], 0xe83a3a, 'cloth', null, [1.2, 1.2, 1])
  ], { yaw: 0.15, pitch: 0.1, tilt: 0.4, zoom: 1.1 });

  // 投枪：细木杆、柳叶形的铁枪头，杆上缠着红布，飘一小截红布条
  weapon('javelin', [
    P('cyl', [0.085, 0.09, 1.45, 6], [0, 0.12, 0], 0xc0a878, 'wood'),
    P('cyl', [0.095, 0.085, 0.16, 6], [0, 0.88, 0], 0x7a808c, 'metal'),
    P('iw_blade', [0.56, 0.32, 0.08, 0.32, 0.3], [0, 0.94, 0], STEEL, 'ch_plate'),
    P('cyl', [0.105, 0.105, 0.13, 6], [0, -0.02, 0], 0xd83a3a, 'cloth'),
    P('cyl', [0.105, 0.105, 0.13, 6], [0, -0.2, 0], 0xd83a3a, 'cloth'),
    P('iw_poly', [0.03, [0, 0.02, 0.34, -0.04, 0.54, -0.24, 0.3, -0.15, 0, -0.12]], [0.05, -0.05, 0], 0xd83a3a, 'cloth'),
    P('cone', [0.09, 0.14, 6], [0, -0.67, 0], 0x7a808c, 'metal', [PI, 0, 0])
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.26 });

  // 马走日：木头的国际象棋马，站在一块黑白棋盘上
  var HEAD = [0.22, 0, 0.26, 0.3, 0.2, 0.4, 0.25, 0.46, 0.18, 0.55, 0.22, 0.6, 0.14, 0.72, 0.12, 0.9, 0.02, 0.78, -0.12, 0.74, -0.3, 0.58, -0.4, 0.44, -0.38, 0.35, -0.26, 0.32, -0.16, 0.4, -0.1, 0.32, -0.16, 0.16, -0.22, 0];
  weapon('chessknight', [
    box([0.84, 0.03, 0.84], [0, -0.5, 0], 0xffffff, 'iw_check'),
    box([0.86, 0.1, 0.86], [0, -0.565, 0], 0x6a4a2a, 'wood'),
    P('iw_lathe', [12, 0.3, -0.485, 0.3, -0.4, 0.25, -0.36, 0.23, -0.3, 0.19, -0.27, 0, -0.27], [0, 0, 0], 0xb87a44, 'wood'),
    P('iw_poly', [0.24, HEAD], [0.02, -0.29, 0], 0xb87a44, 'wood', null, [1.1, 1.1, 1]),
    box([0.055, 0.055, 0.25], [-0.112, 0.392, 0], 0x2a1a10, 'plain'),
    box([0.04, 0.2, 0.25], [0.21, 0.36, 0], 0x7a4a24, 'wood', [0, 0, -0.3])
  ], { yaw: 0.3, pitch: 0.48, zoom: 0.84 });

  // 捕兽夹：半张开的钢夹子（两片半圆夹口从合页往上翘成 V，口沿上一排朝上的大锯齿），
  // 中间深色底板上一块踏板，两头是弹簧片，前面拖着两节铁链
  var trap = [
    box([0.62, 0.04, 0.5], [0, -0.06, 0], 0x3a3e48, 'metal'),
    box([1.0, 0.06, 0.1], [0, -0.03, 0], 0x5a5f6a, 'metal'),
    P('cyl', [0.17, 0.17, 0.05, 10], [0, 0, 0], 0x6a707c, 'metal'),
    box([0.2, 0.06, 0.06], [0, 0.03, 0], 0x3a3e48, 'metal'),
    box([0.2, 0.1, 0.22], [0.58, -0.02, 0], 0x9aa0ac, 'metal'),
    box([0.2, 0.1, 0.22], [-0.58, -0.02, 0], 0x9aa0ac, 'metal')
  ];
  var TRAP_A = PI / 2 - 0.8, TRAP_R = 0.48;
  [1, -1].forEach(function (side) {
    var th = side * TRAP_A, ct = Math.cos(th), st = Math.sin(th);
    trap.push(P('iw_arc', [TRAP_R, 0.065, 4, 12, PI], [0, 0, 0], 0x8a909c, 'metal', [th, 0, 0]));
    [0.42, 0.99, 1.57, 2.15, 2.72].forEach(function (t) {
      var x = Math.cos(t) * TRAP_R, y = Math.sin(t) * TRAP_R * ct, z = Math.sin(t) * TRAP_R * st;
      trap.push(rod('cone', [x, y - 0.02, z], [x, y + 0.27, z], [0.1, 4], 0xd8dee8, 'metal'));
    });
  });
  trap = trap.concat(link([0.7, -0.1, 0.12], 1.3, 1, 0.085, 0xa8aeb8), link([0.76, -0.14, 0.3], 1.3, 0, 0.085, 0xa8aeb8));
  weapon('beartrap', trap, { yaw: 0.1, pitch: 0.42, zoom: 1.02 });

  // 雷鼓：又宽又扁的蓝鼓、金色鼓圈和一圈金钉，白鼓面上画着一道发光的闪电，两根鼓槌交叉在上面
  var BOLT_PTS = [-0.06, 0.42, 0.2, 0.42, 0.04, 0.08, 0.2, 0.08, -0.14, -0.44, -0.02, -0.04, -0.18, -0.04];
  var drum = [
    P('cyl', [0.62, 0.62, 0.34, 14], [0, 0, 0], 0x3a5ab0, 'wood'),
    P('cyl', [0.64, 0.64, 0.05, 14], [0, 0.17, 0], 0xc8a040, 'gold'),
    P('cyl', [0.64, 0.64, 0.05, 14], [0, -0.17, 0], 0xc8a040, 'gold'),
    P('cyl', [0.6, 0.6, 0.02, 14], [0, 0.19, 0], 0xf0f4ff, 'plain'),
    P('iw_poly', [0.03, BOLT_PTS], [0, 0.205, 0], 0xffe040, '!plain', [-PI / 2, 0, 0.3])
  ];
  for (var di = 0; di < 8; di++) { var da = di * PI / 4 + 0.2; drum.push(P('oct', [0.045], [Math.cos(da) * 0.63, 0, Math.sin(da) * 0.63], GOLD_L, 'gold')); }
  drum.push(rod('cyl', [-0.62, 0.32, 0.4], [0.3, 0.52, -0.3], [0.035, 0.035, 6], WOOD, 'wood'));
  drum.push(rod('cyl', [0.62, 0.32, 0.4], [-0.3, 0.52, -0.3], [0.035, 0.035, 6], WOOD, 'wood'));
  drum.push(P('sphere', [0.07, 8, 6], [0.3, 0.52, -0.3], 0xf0f0f0, 'plain'));
  drum.push(P('sphere', [0.07, 8, 6], [-0.3, 0.52, -0.3], 0xf0f0f0, 'plain'));
  weapon('thunderdrum', drum, { yaw: 0.35, pitch: 0.65, zoom: 0.95 });

  // 鞭炮：一串红鞭炮编在引线上（每个一道金箍），顶上引线头冒着火星
  function cracker(a, b) {
    return [rod('cyl', a, b, [0.08, 0.08, 8], 0xe83a3a, 'cloth'), rod('cyl', mix(a, b, 0.42), mix(a, b, 0.58), [0.088, 0.088, 8], GOLD, 'gold')];
  }
  var fc = [rod('cyl', [0, -0.78, 0], [0, 0.62, 0], [0.025, 0.03, 5], 0x8a6a40, 'cloth')];
  for (var fi = 0; fi < 4; fi++) {
    var fy = 0.42 - fi * 0.3;
    fc = fc.concat(cracker([-0.02, fy, 0], [-0.3, fy - 0.2, 0.04])).concat(cracker([0.02, fy - 0.15, 0], [0.3, fy - 0.35, 0.04]));
  }
  fc.push(spark([0, 0.74, 0.1], 0.8, 0xffe070), spark([0.15, 0.6, 0.1], 0.45, 0xff8a3a), P('oct', [0.05], [0, 0.64, 0.05], 0xffb040, '!plain'));
  weapon('firecracker', fc, { tilt: -0.3, yaw: 0.3, pitch: 0.25, zoom: 1.1 });

  // 冰棱：一根又长又尖、不太规整的冰棱（前面一道发光的冰芯），旁边几点霜花
  weapon('icicle', [
    P('cone', [0.2, 1.5, 6], [0, 0, 0], 0xa8e0ff, 'ii_ice'),
    P('cone', [0.13, 0.8, 5], [0.08, -0.25, -0.06], 0x8ccff8, 'ii_ice', [0, 0, 0.12]),
    P('cone', [0.09, 1.2, 5], [-0.03, 0.1, 0.11], 0xe8faff, '!plain'),
    P('iw_poly', [0.02, star(6, 0.1, 0.035)], [0.34, -0.2, 0.15], 0xd8f4ff, '!plain'),
    P('iw_poly', [0.02, star(6, 0.08, 0.03)], [-0.3, 0.25, 0.1], 0xd8f4ff, '!plain'),
    P('iw_poly', [0.02, star(6, 0.07, 0.025)], [0.26, 0.4, 0.1], 0xd8f4ff, '!plain')
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.22 });

  // 弹弓：Y 字形的木弹弓（握把缠皮），两根皮筋拉着皮兜，兜里一颗石子
  weapon('slingshot', [
    rod('cyl', [0, -0.75, 0], [0, -0.05, 0], [0.075, 0.08, 6], 0xb07a42, 'wood'),
    rod('cyl', [0, -0.08, 0], [-0.34, 0.48, 0], [0.06, 0.075, 6], 0xb07a42, 'wood'),
    rod('cyl', [0, -0.08, 0], [0.34, 0.48, 0], [0.06, 0.075, 6], 0xb07a42, 'wood'),
    P('sphere', [0.085, 8, 6], [0, -0.07, 0], 0xb07a42, 'wood'),
    rod('cyl', [0, -0.7, 0], [0, -0.35, 0], [0.09, 0.09, 6], LEATHER, 'ch_leather'),
    rod('box', [-0.33, 0.44, 0.03], [-0.09, 0.08, 0.16], [0.04, 0.04], 0xe0b890, 'plain'),
    rod('box', [0.33, 0.44, 0.03], [0.09, 0.08, 0.16], [0.04, 0.04], 0xe0b890, 'plain'),
    box([0.22, 0.14, 0.08], [0, 0.06, 0.16], 0x8a5a34, 'ch_leather'),
    P('ball', [0.11, 1], [0, 0.12, 0.22], 0xb8b8b8, 'rock')
  ], { yaw: 0.25, pitch: 0.25, tilt: 0.2, zoom: 1.05 });

  // 窜天猴：红纸筒（金箍、绿尖顶）绑在细竹竿上，筒底喷火，后面拖着一串火星
  weapon('skyrocket', [
    P('cyl', [0.12, 0.12, 0.6, 10], [0, 0.35, 0], 0xe83a3a, 'cloth'),
    P('cyl', [0.127, 0.127, 0.08, 10], [0, 0.22, 0], GOLD, 'gold'),
    P('cyl', [0.127, 0.127, 0.05, 10], [0, 0.52, 0], GOLD, 'gold'),
    P('cone', [0.14, 0.24, 10], [0, 0.77, 0], 0x3ab04a, 'cloth'),
    P('cyl', [0.025, 0.025, 1.1, 5], [0.15, -0.4, 0], 0xc8b070, 'wood'),
    box([0.06, 0.04, 0.27], [0.08, 0.3, 0], 0xd8c890, 'plain')
  ].concat(flame([0, 0.06, 0.02], 0.34, [0, 0, PI])).concat([
    spark([-0.1, -0.42, 0.12], 0.6, 0xffd040),
    spark([0.05, -0.68, 0.12], 0.45, 0xff6a3a),
    spark([-0.14, -0.88, 0.12], 0.35, 0xffe8a0)
  ]), { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.2 });

  // ============================================================
  //  第 11b 块：30 个超武各有自己的图标 'x_<id>'（ORIGINAL_PLAN §5：名字、说明、颜色），用 evolved() 定义
  //  一看就是原武器的进化版（同一种东西，更大、更华丽、多了零件和特效），36 像素下轮廓和原武器不一样；
  //  金色只做点缀；金描边 + 右上角闪光由 icons.js 按 opts.evoMark 画，模型本身不染金；
  //  右上角（x 27–35、y 0–7）留给闪光，左上角 8×8 是 HUD「超」角标的位置
  //  零件表只读不改：WP[id] 和各武器的零件数组要复制（slice / concat / xf / recolor）以后再用
  // ============================================================

  // ---------- 11b-a：§5 表第 1–15 行（出师之剑 … 破城投石车）；这一段的小工具以 xa 开头、贴图以 iw_xa_ 开头 ----------

  // 折线 → 有宽度的平面带子（两头收细）：pts = [[x, y], ...]
  function xaStrip(pts, w) {
    var L = [], R = [], n = pts.length;
    for (var i = 0; i < n; i++) {
      var a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1;
      var k = (i === 0 || i === n - 1 ? 0.35 : 1) * w / 2, nx = -dy / d * k, ny = dx / d * k;
      L.push(pts[i][0] + nx, pts[i][1] + ny);
      R.push([pts[i][0] - nx, pts[i][1] - ny]);
    }
    for (i = n - 1; i >= 0; i--) L.push(R[i][0], R[i][1]);
    return L;
  }
  // 之字形闪电：从 a 到 b（XY 平面，z 取 a[2]），外层 col 发光、里面一道白芯
  function xaBolt(a, b, w, kinks, col, core) {
    var pts = [], dx = b[0] - a[0], dy = b[1] - a[1], d = Math.sqrt(dx * dx + dy * dy) || 1, z = a[2] || 0;
    for (var i = 0; i <= kinks; i++) {
      var t = i / kinks, o = (i === 0 || i === kinks) ? 0 : (i % 2 ? 1 : -1) * w * 1.4;
      pts.push([a[0] + dx * t - dy / d * o, a[1] + dy * t + dx / d * o]);
    }
    return [
      P('iw_poly', [0.03, xaStrip(pts, w)], [0, 0, z], col, '!plain'),
      P('iw_poly', [0.03, xaStrip(pts, w * 0.42)], [0, 0, z + 0.025], core || 0xffffff, '!plain')
    ];
  }
  // 小红心（发光，正面朝 +Z）
  function xaHeart(pos, k, col) {
    var pts = [];
    for (var i = 0; i < 12; i++) {
      var t = i / 12 * PI * 2, s = Math.sin(t);
      pts.push(16 * s * s * s / 17 * k, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 17 * k);
    }
    return P('iw_poly', [0.05, pts], pos, col || 0xff5a7a, '!plain');
  }
  // 小王冠：金色的冠（三个尖）+ 后面一层深色衬底（在金描边里也看得清）
  var XA_CROWN = [-0.5, 0, 0.5, 0, 0.56, 0.62, 0.27, 0.3, 0, 0.72, -0.27, 0.3, -0.56, 0.62];
  function xaCrown(pos, k, col, rot) {
    return xf([
      P('iw_poly', [0.06, XA_CROWN], [0, 0, 0], col || GOLD, 'gold'),
      P('iw_poly', [0.04, XA_CROWN], [0, -0.06, -0.03], 0x5a3a10, 'plain', null, [1.22, 1.22, 1])
    ], rot || null, pos, k);
  }
  // 金币：圆饼 + 深一点的边
  function xaCoin(pos, k, rot) {
    return xf([
      P('cyl', [0.11, 0.11, 0.035, 10], [0, 0, 0], GOLD_L, 'gold'),
      P('iw_arc', [0.11, 0.022, 3, 10], [0, 0, 0], 0xb07a2a, 'gold', [PI / 2, 0, 0])
    ], rot || [PI / 2, 0, 0], pos, k);
  }
  // 绕着转的眩晕小星星（正面朝 +Z，排在一个扁椭圆上）
  function xaStars(c, r, n, col, k) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = i / n * PI * 2 + 0.4;
      out.push(P('iw_poly', [0.03, star(5, 0.11 * (k || 1), 0.05 * (k || 1), a)], [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r * 0.4, (c[2] || 0) + Math.sin(a) * r * 0.3], col || 0xffe040, '!plain'));
    }
    return out;
  }
  // 圆环上的一段扇面（剑光）：圆心 c，从角度 a0 转到 a1，内半径 r0→r1（可以渐变），外半径 R
  function xaFan(c, a0, a1, r0, r1, R, n) {
    var out = [], i, t, a;
    for (i = 0; i <= n; i++) { t = i / n; a = a0 + (a1 - a0) * t; out.push(c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R); }
    for (i = n; i >= 0; i--) { t = i / n; a = a0 + (a1 - a0) * t; var rr = r0 + (r1 - r0) * t; out.push(c[0] + Math.cos(a) * rr, c[1] + Math.sin(a) * rr); }
    return out;
  }

  // a1 出师之剑：更长更宽的钢剑（上翘的护手、金箍、蓝穗子）还是主角，斜放的方向和原来一样；
  //    一道窄窄的奶白剑光贴着剑身左边从护手扫上去（停在剑尖下面），剑光末端一小朵金色剑痕
  (function () {
    var K = WP.knightsword, FC = [0, 0.03], A0 = PI / 2 + 0.2, A1 = PI / 2 + 0.78, SC = [Math.cos(A1 - 0.1) * 0.98, FC[1] + Math.sin(A1 - 0.1) * 0.98];
    evolved('knightsword', [
      P('iw_poly', [0.03, xaFan(FC, A0, A1, 0.3, 0.9, 0.98, 8)], [0, 0, -0.08], 0xfff0c0, '!plain'),
      P('iw_poly', [0.03, xaFan(FC, A0 + 0.04, A1 - 0.12, 0.66, 0.88, 0.92, 6)], [0, 0, -0.05], 0xffffff, '!plain'),
      P('iw_blade', [1.8, 0.42, 0.1, 0.38, 1.0], [0, 0.06, 0], 0xf2f5fa, 'ch_plate'),
      box([0.07, 1.28, 0.115], [0, 0.72, 0], 0x8a96a6, 'metal'),
      K[2], K[3], K[4],
      rod('cone', [0.36, 0.04, 0], [0.5, 0.26, 0], [0.07, 4], 0xc8d0da, 'metal'),
      rod('cone', [-0.36, 0.04, 0], [-0.5, 0.26, 0], [0.07, 4], 0xc8d0da, 'metal'),
      P('cyl', [0.085, 0.085, 0.08, 8], [0, -0.03, 0], GOLD, 'gold'),
      K[5], K[6],
      P('iw_poly', [0.03, [0, 0, 0.07, -0.02, 0.24, -0.4, 0.14, -0.44]], [0.02, -0.52, 0.06], 0x3a5ab0, 'cloth'),
      P('iw_poly', [0.03, [0, 0, 0.06, 0, 0.08, -0.34, -0.03, -0.37]], [0.0, -0.52, 0.09], 0x5a7ad0, 'cloth'),
      P('iw_poly', [0.04, star(6, 0.24, 0.09)], [SC[0], SC[1], 0.04], 0xff9a30, '!plain'),
      P('iw_poly', [0.03, star(6, 0.1, 0.045, 0.5)], [SC[0], SC[1], 0.08], 0xffffff, '!plain')
    ], { tilt: -0.46, yaw: 0.3, pitch: 0.28, zoom: 1.26 });
  })();

  // a2 破阵龙枪：加长加粗的红白螺旋骑枪，护手变成钢铸的龙口「吞口」（一圈白牙咬住枪身、两只橙眼），
  //    两只往后弯的长钢角从两边伸出来，后面一撮红鬃（眩晕星在 36 像素下只是几团金点，不画）
  (function () {
    var L = WP.lance, parts = [
      P('cyl', [0, 0.28, 1.95, 8], [0, 1.1, 0], 0xfff6e8, 'iw_spiral'),
      P('iw_lathe', [12, 0.08, -0.22, 0.46, 0.04, 0.48, 0.13, 0.32, 0.15], [0, 0, 0], 0x7a828e, 'metal'),
      P('iw_arc', [0.47, 0.04, 4, 14], [0, 0.12, 0], 0xc8d0da, 'metal', [PI / 2, 0, 0]),
      box([0.14, 0.09, 0.05], [0.16, -0.03, 0.4], 0xff9a20, '!plain', [0, -0.35, 0]),
      box([0.14, 0.09, 0.05], [-0.16, -0.03, 0.4], 0xff9a20, '!plain', [0, 0.35, 0]),
      rod('cyl', [0.36, -0.06, 0], [0.74, -0.2, 0], [0.07, 0.11, 5], 0xd8dee6, 'metal'),
      rod('cone', [0.74, -0.2, 0], [0.92, -0.58, 0], [0.07, 5], 0xd8dee6, 'metal'),
      rod('cyl', [-0.36, -0.06, 0], [-0.74, -0.2, 0], [0.07, 0.11, 5], 0xd8dee6, 'metal'),
      rod('cone', [-0.74, -0.2, 0], [-0.92, -0.58, 0], [0.07, 5], 0xd8dee6, 'metal'),
      rod('cone', [0, -0.15, -0.22], [0, -0.66, -0.42], [0.16, 4], 0xc83a3a, 'cloth'),
      rod('cone', [0.2, -0.14, -0.26], [0.34, -0.56, -0.46], [0.12, 4], 0xc83a3a, 'cloth'),
      rod('cone', [-0.2, -0.14, -0.26], [-0.34, -0.56, -0.46], [0.12, 4], 0xc83a3a, 'cloth'),
      L[2], L[3], L[4]
    ];
    for (var i = 0; i < 8; i++) {
      var a = i * PI / 4 + 0.2;
      parts.push(rod('cone', [Math.cos(a) * 0.4, 0.1, Math.sin(a) * 0.4], [Math.cos(a) * 0.31, 0.32, Math.sin(a) * 0.31], [0.065, 4], 0xf8f4e8, 'plain'));
    }
    evolved('lance', parts, { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.3 });
  })();

  // a3 熔炉巨锤：大一圈的烧黑锤头，锤面发着炉火的光、侧面裂出熔岩缝，顶上冒火，一锤砸在石板上，石板裂出红缝
  (function () {
    var F = WP.forgehammer, C = [0.02, 0.6, 0];
    var head = xf(recolor([F[0], F[1], F[2], F[3]], { 0x50545e: 0x3c3c46, 0x7a808c: 0x5a5a64, 0xdfe6ee: 0xffb060 }, { 0xdfe6ee: '!plain' }), null, [-C[0] * 0.3, -C[1] * 0.3, 0], 1.3);
    var crack = [[-0.3, 0.72], [-0.16, 0.6], [-0.05, 0.68], [0.08, 0.52], [0.2, 0.62], [0.3, 0.5]];
    var hammer = xf(head.concat([
      P('iw_poly', [0.02, xaStrip(crack, 0.08)], [0, 0, 0.215], 0xff8a2a, '!plain'),
      P('iw_poly', [0.02, xaStrip(crack, 0.035)], [0, 0, 0.23], 0xfff0a0, '!plain'),
      box([0.14, 1.25, 0.14], [0, -0.12, 0], 0x9a6a3a, 'wood'),
      box([0.17, 0.05, 0.17], [0, 0.32, 0], IRON, 'metal'),
      box([0.17, 0.05, 0.17], [0, 0.2, 0], IRON, 'metal'),
      F[5]
    ]), [0, 0, -1.05], [0, 0, 0]);
    evolved('forgehammer', hammer.concat(flame([0.42, 0.52, 0.05], 0.48, [0, 0, 0.35], [0xff6a1a, 0xffb060, 0xfff4c0]))
      .concat(flame([0.18, 0.42, 0.12], 0.32, [0, 0, 0.5], [0xff6a1a, 0xffb060, 0xfff4c0])).concat([
        box([1.0, 0.18, 0.62], [0.78, -0.5, 0], 0x5a5048, 'rock'),
        P('iw_poly', [0.02, xaStrip([[0.4, 0.1], [0.62, -0.05], [0.78, 0.08], [1.0, -0.1], [1.2, 0.04]], 0.07)], [0, -0.405, 0], 0xff5a1a, '!plain', [-PI / 2, 0, 0]),
        P('iw_poly', [0.02, xaStrip([[0.78, 0.0], [0.72, 0.18], [0.86, 0.29]], 0.06)], [0, -0.405, 0], 0xff5a1a, '!plain', [-PI / 2, 0, 0]),
        P('iw_poly', [0.02, xaStrip([[1.28, -0.31], [1.28, -0.41], [1.26, -0.5]], 0.05)], [0, 0, 0.315], 0xff8a3a, '!plain'),
        spark([1.15, -0.15, 0.3], 0.6, 0xffd040),
        P('oct', [0.045], [0.45, -0.28, 0.3], 0xffb040, '!plain')
      ]), { yaw: 0.4, pitch: 0.32, zoom: 1.08 });
  })();

  // a4 震山熊吼：熊头长出一圈蓬乱的深色鬃毛、大獠牙，站在积雪的石头山顶上吼，四道声波（最外面一道结了霜）
  (function () {
    var R = WP.roar.slice(0, 14), M = [0.56, -0.13, 0], parts = [];
    for (var i = 0; i < 7; i++) {
      var a = PI * 0.45 + i * 0.27;
      parts.push(rod('cone', [Math.cos(a) * 0.26, Math.sin(a) * 0.24 + 0.02, -0.12], [Math.cos(a) * 0.76, Math.sin(a) * 0.66 + 0.02, -0.18], [0.15, 4], 0x2e1c0e, 'fur'));
    }
    parts = parts.concat(R, [
      rod('cone', [0.44, -0.02, 0.1], [0.43, -0.23, 0.12], [0.055, 4], 0xf8f4e8, 'plain'),
      rod('cone', [0.5, -0.02, -0.04], [0.49, -0.22, -0.02], [0.055, 4], 0xf8f4e8, 'plain'),
      P('cone', [0.45, 0.62, 5], [-0.1, -0.66, -0.05], 0x5e5e6a, 'rock'),
      P('cone', [0.2, 0.26, 5], [-0.1, -0.48, -0.05], 0xf0f4ff, 'plain'),
      P('cone', [0.3, 0.4, 5], [-0.52, -0.76, -0.2], 0x4e4e5a, 'rock'),
      P('cone', [0.14, 0.18, 5], [-0.52, -0.65, -0.2], 0xf0f4ff, 'plain'),
      wave(M, 0.22, -1.15, 1.8, 0.05, 0xffe0b0),
      wave(M, 0.4, -1.15, 1.8, 0.055, 0xe0a060),
      wave(M, 0.58, -1.15, 1.8, 0.055, 0xe0a060),
      wave(M, 0.76, -1.15, 1.8, 0.065, 0xbfe8ff)
    ]);
    [-0.8, -0.1, 0.5].forEach(function (a) {
      parts.push(P('iw_poly', [0.02, star(6, 0.1, 0.035)], [M[0] + Math.cos(a) * 0.76, M[1] + Math.sin(a) * 0.76, 0.06], 0xf4fcff, '!plain'));
    });
    evolved('roar', parts, { yaw: 0.6, pitch: 0.2, zoom: 1.02 });
  })();

  // a5 九命连爪：猫爪的爪尖伸得更长更亮，手腕上一圈粉丝带，旁边一下挠出三道粉色爪痕，飘起一颗小红心
  (function () {
    // 原来的零件表 clawsP：前 9 个是腿、虎斑、掌、肉垫；爪尖换成更长更亮的
    var paw = clawsP.slice(0, 9);
    [[-0.19, 0.27, 0.3], [0, 0.33, 0.05], [0.19, 0.27, -0.2]].forEach(function (c) {
      paw.push(P('iw_poly', [0.08, CLAW], [c[0], c[1], 0.02], 0xe8eef8, 'plain', [0, 0, c[2]], [0.9, 1.55, 1]));
    });
    paw.push(P('cyl', [0.29, 0.3, 0.1, 10], [0, -0.4, -0.06], 0xff8ab0, 'cloth'));
    var parts = xf(paw, [0, 0, -0.5]);
    var th = -1.0, bx = -Math.sin(th), by = Math.cos(th);
    for (var i = 0; i < 3; i++) {
      var cx = 1.0 + bx * (i - 1) * 0.27, cy = -0.32 + by * (i - 1) * 0.27;
      var pos = [cx - bx * 0.9, cy - by * 0.9, 0.2];
      parts.push(P('iw_poly', [0.03, crescentPts(0.9, 0.13, 0.95)], pos, 0xff5a8a, '!plain', [0, 0, th]));
      parts.push(P('iw_poly', [0.03, crescentPts(0.9, 0.055, 0.75)], [pos[0], pos[1], 0.23], 0xffc0d0, '!plain', [0, 0, th]));
    }
    parts.push(xaHeart([-0.55, -0.75, 0.2], 0.2, 0xff4a6a));
    evolved('claws', parts, { yaw: 0.2, pitch: 0.25, zoom: 1.0 });
  })();

  // a6 猎王铁夹：一只合上咬紧的大钢夹（正面看是一道拱，里面一圈交错的锯齿），拱顶一顶小金冠，
  //    左后方再放一只张开的小夹子（V 字），右边一节铁链拴在铁桩上（自己的零件，不用原来的捕兽夹）
  (function () {
    var parts = [
      box([1.24, 0.09, 0.46], [0, -0.05, 0], 0x3a3e48, 'metal'),
      P('cyl', [0.16, 0.16, 0.05, 10], [0, 0.02, 0], 0x6a707c, 'metal'),
      P('iw_arc', [0.55, 0.1, 4, 12, PI], [0, 0, 0.05], 0xc8ccd4, 'metal'),
      P('iw_arc', [0.55, 0.09, 4, 12, PI], [0, 0, -0.07], 0x6a707c, 'metal'),
      box([0.18, 0.16, 0.3], [0.62, 0.04, 0], 0x9aa0ac, 'metal'),
      box([0.18, 0.16, 0.3], [-0.62, 0.04, 0], 0x9aa0ac, 'metal')
    ];
    for (var i = 0; i < 6; i++) {
      var a = 0.36 + i * (PI - 0.72) / 5, b = a + (PI - 0.72) / 10;
      parts.push(rod('cone', [Math.cos(a) * 0.5, Math.sin(a) * 0.5, 0.08], [Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0.08], [0.12, 4], 0xf0f2f6, 'metal'));
      if (i < 5) parts.push(rod('cone', [Math.cos(b) * 0.5, Math.sin(b) * 0.5, -0.06], [Math.cos(b) * 0.28, Math.sin(b) * 0.28, -0.06], [0.11, 4], 0x8a909c, 'metal'));
    }
    parts = parts.concat(xaCrown([0, 0.62, 0.08], 0.46, GOLD));
    // 张开的小夹子（左后方，V 字两片夹爪，尖上是锯齿）
    parts = parts.concat(xf([
      box([0.5, 0.07, 0.3], [0, -0.04, 0], 0x4a4e58, 'metal'),
      rod('box', [0, 0, 0], [-0.3, 0.42, 0], [0.09, 0.09], 0x9aa0ac, 'metal'),
      rod('box', [0, 0, 0], [0.3, 0.42, 0], [0.09, 0.09], 0x9aa0ac, 'metal'),
      rod('cone', [-0.3, 0.42, 0], [-0.12, 0.42, 0], [0.08, 4], 0xd8dee8, 'metal'),
      rod('cone', [0.3, 0.42, 0], [0.12, 0.42, 0], [0.08, 4], 0xd8dee8, 'metal')
    ], null, [-0.82, 0.0, -0.45], 0.72));
    parts = parts.concat(link([0.8, -0.02, 0.18], 0.3, 1, 0.08, 0xa8aeb8), [
      rod('cone', [0.94, 0.08, 0.26], [0.94, -0.34, 0.26], [0.07, 4], 0x5a5f6a, 'metal'),
      box([0.15, 0.06, 0.15], [0.94, 0.08, 0.26], 0x7a808c, 'metal')
    ]);
    evolved('beartrap', parts, { yaw: 0.3, pitch: 0.16, zoom: 1.0 });
  })();

  // a7 苍穹神隼：张开双翅飞在天上的神隼（深棕翼尖、黄褐翅膀、奶白翅根），爪下一个红色标记圈，左下角是它飞离的皮手套
  //    （跟在后面的第二只隼在 36 像素下只是一团，不画）
  (function () {
    var F = WP.falcon, FW = [0, 0, -0.16, 0.2, -0.4, 0.42, -0.62, 0.54, -0.56, 0.38, -0.62, 0.3, -0.48, 0.2, -0.52, 0.1, -0.38, 0.04, -0.36, -0.06, -0.2, -0.08];
    var FT = [0.06, 0.04, -0.08, 0.08, -0.38, -0.28, -0.33, -0.36, -0.22, -0.4, 0.04, -0.06];
    var FWm = FW.map(function (v, i) { return i % 2 ? v : -v; });
    var bird = function (big) {   // big：带爪子
      var out = [
        P('iw_poly', [0.05, FW], [0.0, 0.14, -0.22], 0x7a5a36, 'ch_feather', [0, 0, -0.55], [1.6, 1.5, 1]),
        P('iw_poly', [0.05, FW], [0.0, 0.14, -0.2], 0xc8a068, 'ch_feather', [0, 0, -0.55], [1.3, 1.22, 1]),
        P('iw_poly', [0.05, FW], [0.0, 0.14, -0.18], 0xffe0a0, 'ch_feather', [0, 0, -0.55], [0.8, 0.76, 1]),
        P('iw_poly', [0.05, FWm], [0.02, 0.14, 0.18], 0x8a6a40, 'ch_feather', [0, 0, 0.35], [1.4, 1.3, 1]),
        P('iw_poly', [0.05, FWm], [0.02, 0.14, 0.2], 0xc8a068, 'ch_feather', [0, 0, 0.35], [1.14, 1.06, 1]),
        P('iw_poly', [0.05, FWm], [0.02, 0.14, 0.22], 0xffe0a0, 'ch_feather', [0, 0, 0.35], [0.7, 0.66, 1]),
        P('iw_poly', [0.05, FT], [-0.16, -0.02, -0.05], 0x5a4228, 'ch_feather', [0, 0, -0.35], [1.1, 1.1, 1])
      ].concat(xf(F.slice(3, 10), [0, 0, -0.3], [0.02, 0.02, 0.02], 1.3));
      if (big) out.push(box([0.06, 0.12, 0.06], [0.16, -0.22, 0.06], 0xf0c040, 'plain', [0, 0, 0.6]), box([0.06, 0.12, 0.06], [0.22, -0.2, -0.04], 0xf0c040, 'plain', [0, 0, 0.6]));
      return out;
    };
    var parts = bird(true).concat([
      P('iw_arc', [0.2, 0.045, 4, 14], [0.6, -0.66, 0.1], 0xff4a4a, '!plain', [-1.1, 0, 0]),
      box([0.06, 0.12, 0.05], [0.6, -0.42, 0.1], 0xff4a4a, '!plain'),
      box([0.06, 0.12, 0.05], [0.6, -0.9, 0.1], 0xff4a4a, '!plain'),
      box([0.12, 0.06, 0.05], [0.36, -0.66, 0.1], 0xff4a4a, '!plain'),
      box([0.12, 0.06, 0.05], [0.84, -0.66, 0.1], 0xff4a4a, '!plain')
    ], xf(F.slice(14, 16), null, [-0.45, -0.3, 0], 0.8));
    evolved('falcon', parts, { yaw: 0.2, pitch: 0.15, zoom: 1.0 });
  })();

  // a8 雷霆投枪：整根投枪往右下斜着扎向一小块裂开的岩石（柳叶枪头整个看得见），两道细闪电顺着枪杆两边劈下来，
  //    落点一圈细细的发光冲击环（岩石只占一小块，不做发光的大圆盘）
  (function () {
    var jav = xf(WP.javelin, [0, 0, PI * 1.25], [-0.91, 1.1, 0.05]);
    var parts = jav.concat([
      P('cyl', [0.28, 0.34, 0.18, 8], [0.2, -0.1, 0], 0x6a7080, 'rock'),
      P('iw_arc', [0.34, 0.022, 3, 14], [0.2, -0.005, 0], 0x7ad0ff, '!plain', [PI / 2, 0, 0])
    ]);
    [0.5, 2.2, 3.9].forEach(function (a) {
      var pts = [[0, 0], [Math.cos(a) * 0.1 + 0.03, Math.sin(a) * 0.1 - 0.03], [Math.cos(a + 0.35) * 0.18, Math.sin(a + 0.35) * 0.18], [Math.cos(a) * 0.26, Math.sin(a) * 0.26]];
      parts.push(P('iw_poly', [0.02, xaStrip(pts, 0.05)], [0.2, -0.008, 0], 0x9ae0ff, '!plain', [-PI / 2, 0, 0]));
    });
    parts = parts.concat(xaBolt([-1.0, 1.7, 0.15], [0.02, 0.72, 0.15], 0.07, 5, 0x8ad8ff), xaBolt([-1.3, 0.92, 0.15], [-0.26, -0.08, 0.15], 0.07, 5, 0x8ad8ff), [
      P('oct', [0.08], [0.17, 0.04, 0.1], 0xfff27a, '!plain')
    ]);
    evolved('javelin', parts, { yaw: 0.3, pitch: 0.28, zoom: 1.03 });
  })();

  // a9 千刃戏法：七把加宽的银飞刀张成半个太阳（刀和刀挨着），围着中间一朵红白魔术花结（金边），最外面两把各裂出两片小白碎片
  (function () {
    var kn = recolor(knife, { 0xe0e4ec: 0xf4f6fa }).map(function (p, i) { p = p.slice(); if (i < 3) p[5] = [1.55, 1, 1]; return p; });
    var parts = [], A = 0.3;
    for (var k = 0; k < 7; k++) parts = parts.concat(xf(kn, [0, 0, (3 - k) * A], [0, 0, k * 0.012], 1.05));
    parts.push(
      P('cyl', [0.34, 0.34, 0.08, 12], [0, 0.26, 0.12], 0xd0283a, 'cloth', [PI / 2, 0, 0]),
      P('iw_poly', [0.04, star(8, 0.29, 0.16)], [0, 0.26, 0.17], 0xf4f4f8, 'plain'),
      P('iw_arc', [0.34, 0.035, 3, 14], [0, 0.26, 0.15], GOLD, 'gold'),
      P('sphere', [0.09, 8, 6], [0, 0.26, 0.19], 0xd0283a, 'plain')
    );
    [[-1, 3 * A], [1, -3 * A]].forEach(function (s) {
      var a = s[1], dx = -Math.sin(a), dy = Math.cos(a);
      [[1.62, 0.13], [1.76, -0.12]].forEach(function (q) {
        var x = dx * q[0] - dy * q[1] * s[0], y = dy * q[0] + dx * q[1] * s[0];
        parts.push(P('iw_poly', [0.03, [0, 0.13, -0.07, -0.07, 0.08, -0.06]], [x, y, 0.05], 0xffffff, '!plain', [0, 0, a + q[1] * 4]));
      });
    });
    evolved('trickknives', parts, { yaw: 0, pitch: 0.25, zoom: 1.04 });
  })();

  // a10 漫天花球：五个印着白花的杂耍球绕成一整圈飞，左上那个炸成一朵小花和三个小球
  (function () {
    var parts = [];
    [[-PI / 2, 0xff8a7a], [0.05, 0xf0d030], [1.35, 0x3a7ae8], [3.5, 0xe84a3a]].forEach(function (b) {
      var p = [Math.cos(b[0]) * 0.62, Math.sin(b[0]) * 0.5, 0];
      parts.push(P('sphere', [0.26, 10, 8], p, b[1], 'plain'));
      parts.push(P('iw_arc', [0.262, 0.032, 4, 14], p, 0xf4f4f8, 'plain', [1.1, 0.3, b[0]]));
      parts.push(P('iw_poly', [0.03, star(5, 0.14, 0.065, b[0])], [p[0], p[1], 0.25], 0xfff4f4, 'plain'));
      parts.push(P('sphere', [0.045, 6, 4], [p[0], p[1], 0.27], 0xffd040, 'plain'));
    });
    var bp = [Math.cos(2.3) * 0.62, Math.sin(2.3) * 0.5, 0.05];
    parts.push(
      P('iw_poly', [0.04, star(6, 0.34, 0.14)], bp, 0xff8a9a, '!plain'),
      P('iw_poly', [0.03, star(6, 0.19, 0.08, 0.5)], [bp[0], bp[1], 0.09], 0xffb0a0, '!plain'),
      P('sphere', [0.08, 8, 6], [bp[0], bp[1], 0.12], 0xffe070, 'plain'),
      P('sphere', [0.09, 8, 6], [bp[0] - 0.42, bp[1] + 0.06, 0.1], 0xf0d030, 'plain'),
      P('sphere', [0.09, 8, 6], [bp[0] - 0.24, bp[1] + 0.38, 0.1], 0xff6ab0, 'plain'),
      P('sphere', [0.09, 8, 6], [bp[0] + 0.14, bp[1] + 0.42, 0.1], 0x3a7ae8, 'plain'),
      P('iw_arc', [0.62, 0.03, 3, 8, 1.1], [0, 0, -0.2], 0xffffff, '!plain', [0, 0, -1.0], [1, 0.8, 1])
    );
    evolved('juggle', parts, { yaw: 0.15, pitch: 0.2, zoom: 1.05 });
  })();

  // a11 霜华冰枪：冰棱做成的又粗又长的枪头装在结霜的枪杆上，枪头根部一朵六瓣霜花，杆上几颗小冰晶，枪尖崩下几片碎冰
  (function () {
    var parts = [
      P('cone', [0.36, 1.5, 6], [0, 1.18, 0], 0xa8e0ff, 'ii_ice'),
      P('cone', [0.23, 0.8, 5], [0.14, 0.92, -0.09], 0x8ccff8, 'ii_ice', [0, 0, 0.12]),
      P('cone', [0.13, 1.2, 5], [-0.04, 1.28, 0.16], 0xe8faff, '!plain'),
      P('cyl', [0.11, 0.12, 1.2, 6], [0, -0.2, 0], 0x7ab8e0, 'ii_ice'),
      P('cyl', [0.15, 0.15, 0.1, 8], [0, 0.42, 0], 0xe8faff, '!plain'),
      P('iw_poly', [0.03, star(6, 0.5, 0.18)], [0, 0.42, 0.14], 0xb8ecff, '!plain'),
      P('iw_poly', [0.03, star(6, 0.2, 0.08, 0.5)], [0, 0.42, 0.18], 0xffffff, '!plain'),
      P('cone', [0.11, 0.32, 5], [0.15, 0.0, 0.03], 0xc8eeff, 'ii_ice', [0, 0, -0.8]),
      P('cone', [0.1, 0.28, 5], [-0.15, -0.32, 0.03], 0xc8eeff, 'ii_ice', [0, 0, 0.8]),
      P('cone', [0.09, 0.24, 5], [0.14, -0.6, 0.03], 0xc8eeff, 'ii_ice', [0, 0, -0.8]),
      P('cone', [0.12, 0.26, 5], [0, -0.92, 0], 0x7ab8e0, 'ii_ice', [PI, 0, 0]),
      P('iw_poly', [0.02, [0, 0.14, -0.08, -0.06, 0.07, -0.08]], [0.38, 1.66, 0.06], 0xd8f4ff, '!plain', [0, 0, 0.6]),
      P('iw_poly', [0.02, [0, 0.12, -0.07, -0.06, 0.06, -0.07]], [-0.32, 1.8, 0.06], 0xd8f4ff, '!plain', [0, 0, -0.5])
    ];
    evolved('icicle', parts, { tilt: -0.42, yaw: 0.35, pitch: 0.3, zoom: 1.16 });
  })();

  // a12 连珠弹弓：大一号、叉尖包铁的弹弓，宽皮兜一下打出三颗石子（带速度线），下面蹦出两枚金币
  (function () {
    var WD = 0xb07a42;
    var parts = [
      rod('cyl', [0, -0.75, 0], [0, -0.05, 0], [0.1, 0.11, 6], WD, 'wood'),
      rod('cyl', [0, -0.08, 0], [-0.36, 0.48, 0], [0.085, 0.1, 6], WD, 'wood'),
      rod('cyl', [0, -0.08, 0], [0.36, 0.48, 0], [0.085, 0.1, 6], WD, 'wood'),
      P('sphere', [0.115, 8, 6], [0, -0.07, 0], WD, 'wood'),
      rod('cyl', [0, -0.7, 0], [0, -0.32, 0], [0.12, 0.12, 6], LEATHER, 'ch_leather'),
      rod('box', [-0.35, 0.44, 0.03], [-0.1, 0.08, 0.16], [0.05, 0.05], 0xe0b890, 'plain'),
      rod('box', [0.35, 0.44, 0.03], [0.1, 0.08, 0.16], [0.05, 0.05], 0xe0b890, 'plain')
    ].concat([
      box([0.38, 0.16, 0.09], [0, 0.06, 0.16], 0x5a3a24, 'ch_leather'),
      P('cyl', [0.11, 0.11, 0.15, 6], [-0.36, 0.5, 0], 0x8a909c, 'metal', [0, 0, 0.55]),
      P('cyl', [0.11, 0.11, 0.15, 6], [0.36, 0.5, 0], 0x8a909c, 'metal', [0, 0, -0.55])
    ]);
    [[-0.05, 0.42], [-0.22, 0.78], [-0.39, 1.14]].forEach(function (q, i) {
      parts.push(P('ball', [0.12 - i * 0.008, 1], [q[0], q[1], 0.22], 0xa0a0a8, 'rock'));
      parts.push(rod('box', [q[0] + 0.08, q[1] - 0.17, 0.18], [q[0] + 0.15, q[1] - 0.35, 0.18], [0.04, 0.02], 0xffffff, '!plain'));
    });
    parts = parts.concat(xaCoin([0.42, -0.5, 0.15], 1.25, [1.2, 0, 0.3]), xaCoin([0.62, -0.2, 0.1], 1.05, [1.0, 0.4, -0.4]));
    evolved('slingshot', parts, { yaw: 0.25, pitch: 0.25, tilt: 0.1, zoom: 1.0 });
  })();

  // a13 天使颂歌：摊开的红封皮歌本（看得见两页白纸），书后面伸出一对白翅膀，
  //    三个橙金色的大音符排成一道弧往上飘（和原武器一样的音符；比金描边深一点，分得开），一颗粉红的心（回血）；不画光环
  (function () {
    var parts = WP.hymn.slice(0, 5).concat([
      wing([0.06, 0.08, -0.42], 1.05, 1, 0xffffff, [-0.6, 0, 0.32]),
      wing([-0.06, 0.08, -0.42], 1.05, -1, 0xffffff, [-0.6, 0, -0.32]),
      P('iw_poly', [0.05, NOTE], [-0.5, 1.02, 0.1], 0xffa830, '!plain', null, [1.0, 1.0, 1]),
      P('iw_poly', [0.05, NOTE], [-0.06, 1.34, 0.1], 0xffa830, '!plain', null, [1.2, 1.2, 1]),
      P('iw_poly', [0.05, NOTE], [0.42, 1.06, 0.1], 0xffa830, '!plain', null, [0.95, 0.95, 1]),
      xaHeart([0.3, 0.14, 0.32], 0.22, 0xff5a7a)
    ]);
    evolved('hymn', parts, { yaw: 0.3, pitch: 0.55, zoom: 1.02 });
  })();

  // a14 霜荆花园：一小片雪地上立着一道高高的结霜荆棘拱门（两股藤拧在一起、冰蓝的刺），拱上开着霜花和一朵冰蓝玫瑰
  (function () {
    var SY = 1.45, parts = [
      P('cyl', [0.52, 0.56, 0.07, 10], [0, -0.06, 0], 0xb8cce4, 'plain', null, [1.2, 1, 0.6]),
      P('iw_arc', [0.56, 0.1, 5, 14, PI], [0, 0, 0], 0x3a6a30, 'bark', null, [1, SY, 1]),
      P('iw_arc', [0.58, 0.045, 4, 14, PI], [0, 0, 0.07], 0x6a9a48, 'bark', [0, 0, 0.04], [1, SY * 1.02, 1])
    ];
    var at = function (a, r) { return [Math.cos(a) * r, Math.sin(a) * r * SY]; };
    for (var i = 0; i < 8; i++) {
      var a = 0.2 + i * (PI - 0.4) / 7, p0 = at(a, 0.6), p1 = at(a, 0.8);
      parts.push(rod('cone', [p0[0], p0[1], 0], [p1[0], p1[1], 0], [0.065, 4], 0xb8e4ff, 'bone'));
    }
    [[2.4, 0.5], [0.5, -0.4], [1.2, 2.4]].forEach(function (l) {
      var p = at(l[0], 0.56);
      parts.push(P('iw_poly', [0.03, LEAF], [p[0], p[1], 0.08], 0x5ab080, 'leaf', [0, 0, l[0] + l[1]], [1.3, 1.3, 1]));
    });
    [[2.0, 0xc0f0d0, 0.19], [0.85, 0xc0f0d0, 0.17], [2.85, 0x8ac8ff, 0.2]].forEach(function (r) {
      var p = at(r[0], 0.56);
      parts.push(P('iw_poly', [0.04, star(6, r[2], r[2] * 0.5, r[0])], [p[0], p[1], 0.11], r[1], 'plain'));
      parts.push(P('sphere', [0.06, 6, 5], [p[0], p[1], 0.15], 0xffffff, 'plain'));
    });
    [[-0.26, 0.42], [0.22, 0.56], [0.86, 0.3]].forEach(function (g) {
      parts.push(P('iw_poly', [0.02, star(4, 0.1, 0.03)], [g[0], g[1], 0.2], 0xe0f8ff, '!plain'));
    });
    evolved('thornvine', parts, { yaw: 0.35, pitch: 0.14, zoom: 1.02 });
  })();

  // a15 破城投石车：原来深色木头的投石车加了好几道铁箍，刚刚甩出去（抛臂竖起来、皮兜空了），
  //     一块更大的深灰圆石带着白色的动作线飞过头顶，砸向左边一段红砖墙，墙上两颗眩晕星
  (function () {
    var T = WP.trebuchet.slice(0, 13).filter(function (p, i) { return i !== 9; });
    var parts = T.concat([
      rod('box', [0.32, 0.0, 0], [-0.32, 1.12, 0], [0.12, 0.12], 0xa87040, 'wood'),
      rod('box', [-0.32, 1.12, 0], [-0.4, 0.86, 0], [0.03, 0.03], LEATHER, 'ch_leather'),
      box([0.16, 0.07, 0.14], [-0.4, 0.82, 0], LEATHER, 'ch_leather'),
      box([0.12, 0.06, 0.1], [-0.2, -0.08, 0.25], IRON, 'metal', [0, 0, -1.08]),
      box([0.12, 0.06, 0.1], [0.2, -0.08, 0.25], IRON, 'metal', [0, 0, 1.08]),
      box([0.12, 0.06, 0.1], [-0.2, -0.08, -0.25], IRON, 'metal', [0, 0, -1.08]),
      box([0.12, 0.06, 0.1], [0.2, -0.08, -0.25], IRON, 'metal', [0, 0, 1.08]),
      rod('box', [0.15, 0.32, 0.06], [0.07, 0.47, 0.06], [0.13, 0.13], IRON, 'metal'),
      P('ball', [0.32, 1], [-0.66, 1.34, 0], 0x7a7a84, 'rock'),
      wave([-0.2, 1.0, 0], 0.5, 0.45, 1.0, 0.045, 0xffffff),
      box([0.44, 0.62, 0.3], [-1.1, -0.25, 0.05], 0xa04a3a, 'brick'),
      box([0.16, 0.12, 0.15], [-1.02, 0.12, 0.1], 0xa04a3a, 'brick', [0, 0, 0.5])
    ]).concat(xaStars([-1.1, 0.36, 0.1], 0.22, 2, 0xfff4c0, 0.9));
    evolved('trebuchet', parts, { yaw: 0.6, pitch: 0.32, zoom: 0.88 });
  })();

  // ---------- 11b-b：§5 表第 16–30 行（万盏墓烛 … 钓龙竿）；这一段的小工具以 xb 开头、贴图以 iw_xb_ 开头 ----------
  // 这一段的小工具
  // 闪电：从 a 到 b 的折线条（外层 col 发光，里面一条细的白芯；core === false 不要芯），画在 XY 平面上，z 取 a 的
  function xbBolt(a, b, w, kinks, col, core) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L, z = a[2] || 0;
    var n = (kinks || 2) + 1, c = [], i;
    for (i = 0; i <= n; i++) {
      var t = i / n, off = (i === 0 || i === n) ? 0 : (i % 2 ? 1 : -1) * L * 0.16;
      c.push([a[0] + dx * t + nx * off, a[1] + dy * t + ny * off]);
    }
    var strip = function (ww) {
      var l = [], r = [];
      for (i = 0; i <= n; i++) {
        var k = (i === 0 || i === n) ? 0.3 : 1;   // 两头细
        l.push(c[i][0] + nx * ww * k / 2, c[i][1] + ny * ww * k / 2);
        r.unshift(c[i][0] - nx * ww * k / 2, c[i][1] - ny * ww * k / 2);
      }
      return l.concat(r);
    };
    var out = [P('iw_poly', [0.03, strip(w)], [0, 0, z], col, '!plain')];
    if (core !== false) out.push(P('iw_poly', [0.03, strip(w * 0.4)], [0, 0, z + 0.02], core || 0xffffff, '!plain'));
    return out;
  }
  // 王冠：n 个尖的平板王冠（金色、带光照），后面垫一层深色，在金描边里也看得清；底边中点在 pos
  function xbCrown(pos, k, col, n, rot) {
    var W = 0.5 * k, hb = 0.26 * k, ht = 0.62 * k, pts = [-W, 0, W, 0], i;
    for (i = n - 1; i >= 0; i--) {
      var x = -W + 2 * W * i / (n - 1);
      pts.push(x, ht);
      if (i > 0) pts.push(x - W / (n - 1), hb);
    }
    return xf([
      P('iw_poly', [0.06 * k, pts], [0, 0, 0], col || GOLD, 'gold'),
      P('iw_poly', [0.04 * k, pts], [0, -0.06 * k, -0.04 * k], 0x5a3a10, 'plain', null, [1.22, 1.2, 1])
    ], rot || null, pos);
  }
  // 金币：正面朝 +Z，一圈深色边
  function xbCoin(pos, k, rot) {
    k = k || 1;
    return xf([
      P('cyl', [0.11 * k, 0.11 * k, 0.03 * k, 10], [0, 0, 0], GOLD_L, 'gold', [PI / 2, 0, 0]),
      P('iw_arc', [0.1 * k, 0.022 * k, 3, 12], [0, 0, 0.016 * k], 0xb07a2a, 'gold')
    ], rot || null, pos);
  }
  // 一圈小星星（发光）：圆心 c、半径 R、n 颗，颜色轮流用 cols
  function xbStars(c, R, n, cols, k, a0) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = (a0 || 0) + i * PI * 2 / n;
      out.push(P('iw_poly', [0.03, star(5, 0.08 * (k || 1), 0.035 * (k || 1))], [c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R, c[2] || 0], cols[i % cols.length], '!plain'));
    }
    return out;
  }
  // 换掉零件表里第 i 个零件的颜色（和贴图）：复制一份，不改原来的
  function xbSet(parts, i, c, t) {
    return parts.map(function (q, j) {
      if (j !== i) return q;
      q = q.slice(); q[3] = c; if (t) q[6] = t;
      return q;
    });
  }

  // 夜空贴图（陨星天穹的星空圆盘）：蓝底，几颗 2×2 的白星、黄星；只用坐标，不碰共享的随机数
  try {
    TEX.addTile('iw_xb_night', function (x, y) {
      var S = [[3, 3, 1], [11, 2, 0], [7, 7, 1], [13, 9, 0], [2, 11, 0], [9, 12, 1], [5, 14, 0]];
      for (var i = 0; i < S.length; i++) {
        var dx = x - S[i][0], dy = y - S[i][1];
        if ((dx === 0 || dx === 1) && (dy === 0 || dy === 1)) return S[i][2] ? [255, 236, 140] : [240, 246, 255];
      }
      return (x * 5 + y * 3) % 7 === 0 ? [74, 108, 200] : [58, 90, 184];
    });
  } catch (e) { /* 图集满了就退回默认贴图 */ }

  // b1 万盏墓烛：弯弯的铁烛台上三支蜡烛（中间高、两边矮），青白的火苗更大，左上飘着两朵小鬼火
  (function () {
    var G = [0x6aff9a, 0xc8ffd8, 0xffffff];
    var side = [0, 1, 2, 5].map(function (i) { return WP.gravecandle[i]; });
    var p = WP.gravecandle.slice(0, 13).concat(flame([0, 0.6, 0.02], 0.65, null, G));
    [-1, 1].forEach(function (s) {
      p = p.concat(xf(side, null, [0.55 * s, -0.12, 0], 0.72));
      p.push(P('iw_lathe', [10, 0.05, -0.08, 0.2, -0.04, 0.21, 0.0, 0, 0], [0.55 * s, -0.24, 0], 0x5a5f6a, 'metal'));
      p.push(P('iw_horn', [0.275, 0.045, 0.03, 8, PI, 5, 0], [0.275 * s, -0.27, 0], IRON, 'metal', [0, 0, PI]));
      p = p.concat(flame([0.55 * s, 0.31, 0.02], 0.45, null, G));
    });
    p.push(P('iw_poly', [0.06, FLAME], [-0.8, 0.66, 0.1], 0xc8ffd8, '!plain', [0, 0, 0.3], [0.22, 0.22, 1]));
    p.push(P('iw_poly', [0.06, FLAME], [-0.4, 1.02, 0.1], 0xc8ffd8, '!plain', [0, 0, -0.2], [0.18, 0.18, 1]));
    evolved('gravecandle', p, { yaw: 0.4, pitch: 0.25, zoom: 0.95 });
  })();

  // b2 蜂后之巢：两层的草编蜂箱（下层草绳颜色深一点）坐在深色木板上，门口淌着蜂蜜；
  //    一只很大的蜂后趴在上层的右前方（长肚子上三道黑条纹、大白翅膀、头上戴着镶红宝石的王冠），三只工蜂围着飞
  (function () {
    var hive = [xbSet(WP.beehive, 0, 0xb07a2a)[0], box([0.28, 0.2, 0.08], [0, -0.28, 0.5], 0x2a1a10, 'plain'), xbSet(WP.beehive, 2, WOOD_D)[2]];
    var p = hive.concat([
      P(hive[0][0], hive[0][1], [0, 0.4, 0], 0xd8a848, 'iw_straw', null, [0.72, 0.72, 0.72]),
      P('iw_arc', [0.43, 0.06, 4, 16], [0, 0.2, 0], 0x5a3414, 'wood', [PI / 2, 0, 0]),
      box([0.2, 0.05, 0.05], [0, -0.19, 0.53], 0xffb020, 'plain'),
      rod('cyl', [-0.07, -0.22, 0.55], [-0.07, -0.36, 0.56], [0.025, 0.03, 5], 0xffb020, 'plain'),
      rod('cyl', [0.06, -0.22, 0.55], [0.06, -0.42, 0.56], [0.025, 0.03, 5], 0xffb020, 'plain'),
      P('sphere', [0.045, 6, 5], [0.06, -0.43, 0.56], 0xffb020, 'plain')
    ]);
    // 蜂后（头朝 +X 画，再转过来朝左前方）：长肚子三道黑条纹、毛茸茸的胸、黑脑袋、大白翅膀
    var queen = [
      P('sphere', [0.1, 8, 6], [-0.17, -0.01, 0], 0xffd040, 'plain', null, [1.9, 1.1, 1.1]),
      box([0.05, 0.235, 0.235], [-0.09, -0.01, 0], 0x1a1208, 'plain'),
      box([0.05, 0.225, 0.225], [-0.19, -0.01, 0], 0x1a1208, 'plain'),
      box([0.045, 0.17, 0.17], [-0.29, -0.01, 0], 0x1a1208, 'plain'),
      P('sphere', [0.088, 8, 6], [0.03, 0.0, 0], 0xfff4c0, 'fur'),
      P('sphere', [0.072, 8, 6], [0.14, 0.03, 0], 0x1a1208, 'plain'),
      box([0.03, 0.03, 0.02], [0.18, 0.05, 0.06], 0xffffff, 'plain'),
      box([0.34, 0.02, 0.24], [-0.14, 0.16, 0.11], 0xffffff, 'plain', [0.5, 0, 0.45]),
      box([0.3, 0.02, 0.22], [-0.12, 0.14, -0.11], 0xe8f0ff, 'plain', [-0.5, 0, 0.45])
    ];
    var QK = 2.5, QP = [0.32, 0.64, 0.3], QR = [0, PI + 0.6, 0];
    p = p.concat(xf(queen, QR, QP, QK));
    // 王冠在头上：头的位置 = 转过来以后的 (0.14, 0.03, 0) × QK
    var hx = QP[0] + Math.cos(QR[1]) * 0.14 * QK, hz = QP[2] - Math.sin(QR[1]) * 0.14 * QK, hy = QP[1] + 0.09 * QK;
    p = p.concat(xbCrown([hx, hy, hz], 0.46, GOLD_L, 3));
    [-0.15, 0, 0.15].forEach(function (dx, i) {
      p.push(box([0.06, 0.06, 0.03], [hx + dx, hy + 0.08 + (i === 1 ? 0.03 : 0), hz + 0.04], 0xd83a3a, 'plain'));
    });
    [[-0.66, 0.5, 0.1, 0.2], [-0.62, -0.12, 0.3, -0.1], [0.62, -0.18, 0.35, PI + 0.2]].forEach(function (b) {
      p = p.concat(bee([b[0], b[1], b[2]], 0.8, [0, b[3] > 1 ? PI : 0, b[3] > 1 ? b[3] - PI : b[3]]));
    });
    evolved('beehive', p, { yaw: 0.45, pitch: 0.25, zoom: 0.88 });
  })();

  // b3 七彩泼墨：铁皮桶往上一甩，一道七色的颜料弧泼出去，飞着几团颜料，地上一摊粉色颜料带着白色标记圈
  (function () {
    var p = recolor(xf(bucket, [0, 0, -0.25]), { 0xe83a3a: 0xff9ad0 });
    [0xe83a3a, 0xff8a2a, 0xf0d030, 0x4ab04a, 0x3a7ae8, 0x5a4ac8, 0xb45ad8].forEach(function (c, i) {
      p.push(P('iw_arc', [0.85 - i * 0.05, 0.028, 3, 14, 1.9], [0.7, -0.15, 0], c, 'plain', [0, 0, 0.35]));
    });
    p.push(
      P('sphere', [0.08, 8, 6], [0.5, 0.86, 0.1], 0xff9ad0, 'plain', null, [1, 0.6, 0.6]),
      P('sphere', [0.07, 8, 6], [1.2, 0.62, 0.1], 0xf0d030, 'plain', null, [1, 0.6, 0.6]),
      P('sphere', [0.07, 8, 6], [1.62, 0.1, 0.1], 0x3a7ae8, 'plain', null, [0.6, 1, 0.6]),
      P('sphere', [0.06, 8, 6], [1.05, -0.12, 0.1], 0xff9ad0, 'plain'),
      P('iw_poly', [0.03, star(8, 0.36, 0.22)], [1.3, -0.5, 0.1], 0xff9ad0, 'plain', [-PI / 2, 0, 0]),
      P('iw_arc', [0.2, 0.03, 3, 16], [1.3, -0.47, 0.1], 0xffffff, '!plain', [PI / 2, 0, 0]),
      P('cyl', [0.05, 0.05, 0.02, 8], [1.3, -0.47, 0.1], 0xffffff, '!plain')
    );
    evolved('paintbucket', p, { yaw: 0.45, pitch: 0.35, zoom: 0.95 });
  })();

  // b4 御林锡兵团：三个锡兵排成三角阵：前面的军官戴红色高翎、金肩章，后面两个卫兵；左上一面红金小旗；刺刀尖上蹦电火花
  (function () {
    var coat = { 0xd83a3a: 0xe8584a };
    var off = recolor(tinman(), coat), gd = recolor(tinman().filter(function (q, i) { return i !== 3 && i !== 4; }), coat);
    var p = xf(gd, null, [-0.44, 0.06, -0.3], 0.85).concat(xf(gd, null, [0.44, 0.06, -0.3], 0.85)).concat(xf(off, null, [0, 0, 0.25], 1.05));
    p.push(
      P('iw_poly', [0.08, FLAME], [0, 0.98, 0.25], 0xe83a3a, 'cloth', null, [0.32, 0.42, 1]),
      box([0.36, 0.05, 0.16], [0, 0.53, 0.25], GOLD_L, 'gold'),
      rod('cyl', [-0.78, -0.05, -0.1], [-0.78, 1.4, -0.1], [0.025, 0.025, 5], WOOD, 'wood'),
      P('iw_poly', [0.03, [0, 0, 0.36, 0, 0.26, -0.12, 0.36, -0.24, 0, -0.24]], [-0.76, 1.38, -0.1], 0xe83a3a, 'cloth'),
      box([0.36, 0.05, 0.04], [-0.58, 1.38, -0.1], GOLD, 'gold')
    );
    [[0.2, 1.155, 0.36], [-0.28, 0.995, -0.21], [0.6, 0.995, -0.21]].forEach(function (t) {
      p = p.concat(xbBolt([t[0] - 0.07, t[1] - 0.02, t[2] + 0.06], [t[0] + 0.08, t[1] + 0.2, t[2] + 0.06], 0.07, 2, 0xd0f0ff, false));
    });
    evolved('toyguard', p, { yaw: 0.25, pitch: 0.2, zoom: 0.95 });
  })();

  // b5 黄金大锅：前面一口大的深金锅（3/4 俯视，看得见金锅沿、黑铁锅壁和锅底、荷包蛋，锅柄朝右下，和原来一样），
  //    右上方后面叠着一口小一点的金锅（被前面的挡住一角，锅里两枚金币，锅柄从上面伸向左边），左上方再蹦出两枚金币
  (function () {
    var F = xf(WP.fryingpan, [0, 0.6, 0]);   // 转回原来的方向：锅柄朝 +X
    // 一口锅：外面金、里面黑铁（比原来深），锅底一圈深色边，黑铁锅柄 + 木柄头
    var pan = function (k) {
      return xf([
        P('iw_lathe', [14, 0, -0.2, 0.38, -0.2, 0.52, 0.07, 0.5, 0.08, 0.38, -0.17, 0, -0.17], [0, 0, 0], 0xd9a032, 'gold'),
        P('iw_lathe', [14, 0.485, 0.075, 0.37, -0.16, 0, -0.16], [0, 0, 0], 0x4a4e5a, 'metal'),
        P('iw_arc', [0.51, 0.03, 4, 20], [0, 0.08, 0], 0xffe070, 'gold', [PI / 2, 0, 0]),
        P('iw_arc', [0.39, 0.03, 4, 20], [0, -0.195, 0], 0x5a2a08, 'metal', [PI / 2, 0, 0]),
        box([0.56, 0.07, 0.12], [0.76, 0.04, 0], 0x34343c, 'metal', [0, 0, 0.12]),
        box([0.32, 0.1, 0.15], [1.15, 0.09, 0], WOOD, 'wood', [0, 0, 0.12])
      ], null, null, k);
    };
    var egg = xf([F[4], F[5], F[6]], null, [0, -0.1, 0], 1.1);
    var A = xf(pan(1).concat(egg), [0.05, -0.6, 0], [0.1, -0.1, 0.25]);
    var B = xf(pan(0.82).concat(xbCoin([0.08, -0.1, 0.05], 1.3, [-PI / 2, 0, 0]), xbCoin([-0.14, -0.08, -0.1], 1.1, [-PI / 2 + 0.3, 0, 0])), [0.1, PI + 0.5, 0], [0.45, 0.2, -0.7]);
    var p = B.concat(A);
    p = p.concat(xbCoin([-0.4, 0.55, 0.1], 1.2, [0, 0.3, 0.3]), xbCoin([-0.05, 0.8, -0.2], 0.95, [0, -0.4, -0.3]));
    evolved('fryingpan', p, { yaw: 0.4, pitch: 0.58, zoom: 1.0 });
  })();

  // b6 万响长鞭：一长串鞭炮甩成 S 形（右下到左上），几处炸开橙色的火花星，红纸屑和火星乱飞
  (function () {
    var A0 = [0.62, -0.72], D = [-1.25, 1.4], Ln = Math.sqrt(D[0] * D[0] + D[1] * D[1]), nn = [D[1] / Ln, -D[0] / Ln];
    var at = function (t) { var w = 0.24 * Math.sin(t * PI * 2); return [A0[0] + D[0] * t + nn[0] * w, A0[1] + D[1] * t + nn[1] * w, 0]; };
    var p = [], i;
    for (i = 0; i < 5; i++) p.push(rod('cyl', at(i / 5), at((i + 1) / 5), [0.025, 0.025, 5], 0x8a6a40, 'cloth'));
    for (i = 0; i < 10; i++) {
      var t = 0.04 + i * 0.096, a = at(t), a2 = at(t + 0.01), s = i % 2 ? 1 : -1;
      var tx = a2[0] - a[0], ty = a2[1] - a[1], tl = Math.sqrt(tx * tx + ty * ty); tx /= tl; ty /= tl;
      p = p.concat(cracker(a, [a[0] + ty * s * 0.3 - tx * 0.06, a[1] - tx * s * 0.3 - ty * 0.06, 0.04]));
    }
    [[at(0.3), 0.26], [at(0.68), 0.22]].forEach(function (b) {
      var c = [b[0][0] + 0.12, b[0][1] + 0.1, 0.2];
      p.push(P('iw_poly', [0.03, star(8, b[1], b[1] * 0.42)], c, 0xff6a4a, '!plain'),
        P('iw_poly', [0.03, star(8, b[1] * 0.6, b[1] * 0.26, 0.2)], [c[0], c[1], c[2] + 0.02], 0xffd040, '!plain'),
        P('oct', [b[1] * 0.2], [c[0], c[1], c[2] + 0.05], 0xfff4c0, '!plain'));
    });
    var h = at(1);
    p = p.concat(flame([h[0], h[1], 0.04], 0.24, [0, 0, 0.5]));
    p.push(box([0.06, 0.04, 0.02], [0.2, 0.5, 0.1], 0xe83a3a, 'cloth', [0, 0, 0.6]), box([0.05, 0.04, 0.02], [-0.55, -0.1, 0.1], 0xe83a3a, 'cloth', [0, 0, -0.4]),
      box([0.05, 0.035, 0.02], [0.7, -0.2, 0.1], 0xe83a3a, 'cloth', [0, 0, 1.1]));
    p.push(spark([0.05, 0.05, 0.2], 0.4, 0xffe070), spark([-0.35, 0.95, 0.2], 0.35, 0xff8a3a));
    evolved('firecracker', p, { yaw: 0.3, pitch: 0.25, zoom: 1.0 });
  })();

  // b7 满天星：三支长长的窜天猴（红、蓝、紫，纸筒和竹竿都和原来一样长）的竹竿在下面绑在一起，往上扇形张开，
  //    左边那支的头上炸开一小圈彩色的星星
  (function () {
    var R = WP.skyrocket, K = 0.84;
    // 一支：纸筒、两道箍、绿尖顶（原来的零件），竹竿加粗一点，绑扎点（竹竿下段）放到原点
    var rk = xf(R.slice(0, 4).concat([
      P('cyl', [0.034, 0.034, 1.1, 5], [0.15, -0.4, 0], 0xb89850, 'wood'),
      R[5]
    ]), null, [-0.15, 0.62, 0]);
    var cols = [[0xe83a3a, GOLD], [0x3a7ae8, GOLD], [0x9a5ad8, GOLD]], p = [];
    [0.58, 0, -0.58].forEach(function (a, i) {
      var m = {}; m[0xe83a3a] = cols[i][0]; m[GOLD] = cols[i][1];
      p = p.concat(xf(recolor(rk, m), [0, 0, a], [0, 0, (1 - Math.abs(i - 1)) * 0.06], K));
    });
    p.push(box([0.17, 0.08, 0.14], [0, 0, 0.08], 0xd8c890, 'plain'));
    p = p.concat(flame([0, 0.42 * K, 0.1], 0.26, [0, 0, PI]));
    var L = 1.53 * K, tip = [-Math.sin(0.58) * L - 0.08, Math.cos(0.58) * L + 0.1, 0.14];
    p.push(P('iw_poly', [0.03, star(8, 0.12, 0.05)], tip, 0xfff4c0, '!plain'));
    p = p.concat(xbStars(tip, 0.2, 5, [0xffd27a, 0xff6a6a, 0x8ad8ff, 0xb48aff, 0x8aff9a], 0.9, PI / 5));
    evolved('skyrocket', p, { tilt: 0.05, yaw: 0.25, pitch: 0.2, zoom: 1.08 });
  })();

  // b8 将军！：比原来大、浅一点的中棕色木头棋马（侧面马头轮廓朝左，和原来一样），耳朵上戴着一顶往后斜的小金王冠
  //    （深色衬底、冠圈里一颗深红宝石），站在更大的棋盘上，一串白色的小光点跳到目标格，前面倒着一个黑色的王（圆顶，没有十字）
  (function () {
    var kn = recolor(WP.chessknight.slice(2, 6), { 0xb87a44: 0xc08850, 0x7a4a24: 0x6a3a1a });
    var K = [-0.5625, -0.5625], T = [0.5625, -0.1875], KS = 1.28, KY = 0.3;
    var p = [
      box([1.5, 0.03, 1.5], [0, -0.5, 0], 0xffffff, 'iw_check'),
      box([1.52, 0.1, 1.52], [0, -0.565, 0], 0x6a4a2a, 'wood')
    ].concat(xf(kn, [0, KY, 0], [K[0] + 0.06, 0.485 * (KS - 1), K[1] + 0.06], KS));
    // 小王冠戴在耳朵上、往后（鬃毛那边）斜一点，额头和鼻子的轮廓空出来；一颗深红宝石嵌在冠圈里
    var crown = xbCrown([0, 0, 0], 0.6, GOLD, 5).concat([box([0.08, 0.08, 0.03], [0, 0.075, 0.04], 0xa01818, 'plain')]);
    var CP = xf([box([0, 0, 0], [0.17 * KS, 0.68 * KS, 0.1 * KS])], [0, KY, 0], [K[0] + 0.06, 0.485 * (KS - 1), K[1] + 0.06])[0][2];
    p = p.concat(xf(crown, [0, 0, -0.3], CP));
    // 跳步：从马脚下跳到目标格的一道弧（几个白色小光点）
    [0.5, 0.66, 0.82].forEach(function (t) {
      p.push(P('oct', [0.06], [K[0] + (T[0] - K[0]) * t + 0.15, -0.36 + 0.5 * Math.sin(PI * t), K[1] + (T[1] - K[1]) * t + 0.15], 0xffffff, '!plain'));
    });
    p.push(P('iw_arc', [0.14, 0.025, 3, 14], [T[0], -0.475, T[1]], 0xffffff, '!plain', [PI / 2, 0, 0]));
    p.push(P('iw_lathe', [10, 0.13, 0, 0.13, 0.05, 0.08, 0.1, 0.06, 0.28, 0.1, 0.32, 0.06, 0.36, 0, 0.38], [0.55, -0.33, 0.5], 0x4a4a5a, 'ch_plate', [0, 0.25, PI / 2], [1.4, 1.4, 1.4]));
    p.push(P('sphere', [0.1, 8, 6], [0, -0.33, 0.64], 0x4a4a5a, 'ch_plate'));
    evolved('chessknight', p, { yaw: 0.35, pitch: 0.4, zoom: 0.8 });
  })();

  // b9 雷公鼓：放大的蓝色大鼓（金鼓圈、白鼓面上的黄闪电）后面紧挨着立着一道红木弧架，
  //    架上三面小鼓（和大鼓一个样：蓝鼓身、金鼓圈、白鼓面），亮白的闪电从小鼓之间劈到大鼓上
  (function () {
    var D = WP.thunderdrum, p = D.slice(0, 13), sm = D.slice(0, 4);
    var A = [[-0.6, 0.52, -0.62], [0, 0.82, -0.68], [0.6, 0.52, -0.62]];
    p.push(P('iw_arc', [0.66, 0.07, 4, 12, PI], [0, 0.26, -0.74], 0xa83a2a, 'wood'));
    A.forEach(function (c, i) { p = p.concat(xf(sm, [0.25, 0, (1 - i) * 0.3], c, 0.5)); });
    p = p.concat(xbBolt([-0.32, 0.86, 0.3], [-0.2, 0.24, 0.3], 0.15, 2, 0xd0f0ff, 0xffffff));
    p = p.concat(xbBolt([0.34, 0.86, 0.3], [0.24, 0.26, 0.3], 0.15, 2, 0xd0f0ff, 0xffffff));
    evolved('thunderdrum', p, { yaw: 0.35, pitch: 0.3, zoom: 1.0 });
  })();

  // b10 金龙风筝：圆圆的龙头风筝（红脸、金边、大眼睛、金角、金须）架在十字竹骨上，后面一长串金红相间的圆片龙身甩成 S，蓝色的鳍，风筝线往下，龙头旁边一道小闪电
  (function () {
    var H = [-0.25, 0.35];
    var p = [
      box([0.035, 1.0, 0.04], [H[0], H[1], -0.03], WOOD, 'wood', [0, 0, 0.25]),
      box([0.95, 0.035, 0.04], [H[0], H[1] + 0.05, -0.03], WOOD, 'wood', [0, 0, 0.25]),
      P('cyl', [0.32, 0.32, 0.06, 14], [H[0], H[1], 0.02], 0xe83a3a, 'cloth', [PI / 2, 0, 0]),
      P('iw_arc', [0.32, 0.035, 4, 16], [H[0], H[1], 0.06], 0xffd070, 'gold'),
      P('sphere', [0.075, 8, 6], [H[0] - 0.12, H[1] + 0.07, 0.07], 0xffffff, 'plain'),
      P('sphere', [0.075, 8, 6], [H[0] + 0.12, H[1] + 0.07, 0.07], 0xffffff, 'plain'),
      P('sphere', [0.04, 6, 5], [H[0] - 0.12, H[1] + 0.06, 0.13], 0x1a1410, 'plain'),
      P('sphere', [0.04, 6, 5], [H[0] + 0.12, H[1] + 0.06, 0.13], 0x1a1410, 'plain'),
      P('iw_horn', [0.16, 0.04, 0.015, 6, PI / 2, 5, 1], [H[0] - 0.12 - 0.16, H[1] + 0.26, 0.04], 0xffd070, 'gold'),
      P('iw_horn', [0.16, 0.015, 0.04, 6, PI / 2, 5, 1], [H[0] + 0.12 + 0.16, H[1] + 0.26, 0.04], 0xffd070, 'gold', [0, 0, PI / 2]),
      rod('box', [H[0] - 0.2, H[1] - 0.1, 0.08], [H[0] - 0.46, H[1] - 0.26, 0.08], [0.03, 0.02], 0xffd070, 'gold'),
      rod('box', [H[0] + 0.2, H[1] - 0.1, 0.08], [H[0] + 0.46, H[1] - 0.26, 0.08], [0.03, 0.02], 0xffd070, 'gold'),
      box([0.22, 0.06, 0.03], [H[0], H[1] - 0.13, 0.07], 0x8a1a1a, 'plain')
    ];
    var Dn = [0.62, -0.78], Nn = [0.78, 0.62];
    for (var i = 1; i <= 7; i++) {
      var t = i / 7, w = 0.3 * Math.sin(t * PI * 2), r = 0.17 - 0.012 * i;
      var c = [H[0] + Dn[0] * 1.5 * t + Nn[0] * w, H[1] + Dn[1] * 1.5 * t + Nn[1] * w, -0.02 * i];
      p.push(P('cyl', [r, r, 0.05, 10], c, i % 2 ? 0xffd070 : 0xe83a3a, i % 2 ? 'gold' : 'cloth', [PI / 2, 0, 0]));
      if (i % 2 === 0) p.push(P('iw_poly', [0.03, BOW], [c[0], c[1], c[2] + 0.04], 0x3a7ae8, 'cloth', [0, 0, 0.6], [1.2, 1.2, 1]));
    }
    p = p.concat(xf(WP.kite.slice(6, 9), null, [H[0], H[1] + 0.3, 0]));
    p = p.concat(xbBolt([H[0] - 0.62, H[1] + 0.5, 0.1], [H[0] - 0.46, H[1] + 0.02, 0.1], 0.08, 2, 0xfff27a));
    evolved('kite', p, { yaw: 0.15, pitch: 0.1, tilt: 0.0, zoom: 1.0 });
  })();

  // b11 白鸽圣使：白鸽正面朝着你飞来，两只翅膀举成 V 字，嘴里叼着一封封了红蜡的信，身后放出八道圣光（没有光环，也没有横竖的光，不成十字）
  (function () {
    var WL = PIG_WING.map(function (v, i) { return i % 2 ? v : -v; }), p = [];
    for (var i = 0; i < 8; i++) {
      var a = PI / 8 + i * PI / 4, L = (i === 0 || i === 1) ? 0.55 : (i % 2 ? 0.95 : 0.7);
      p.push(rod('box', [Math.cos(a) * 0.3, Math.sin(a) * 0.3 + 0.05, -0.3], [Math.cos(a) * L, Math.sin(a) * L + 0.05, -0.3], [0.08, 0.02], 0xfff8e0, '!plain'));
    }
    p.push(
      P('cyl', [0.36, 0.36, 0.02, 14], [0, 0.05, -0.28], 0xfff4c0, '!plain', [PI / 2, 0, 0]),
      P('iw_poly', [0.05, PIG_WING], [0.12, 0.08, -0.12], 0xb0b8c8, 'ch_feather', [0, 0, -0.32], [1.38, 1.36, 1]),
      P('iw_poly', [0.05, PIG_WING], [0.12, 0.1, -0.06], 0xe8ecf4, 'ch_feather', [0, 0, -0.32], [1.25, 1.25, 1]),
      P('iw_poly', [0.05, WL], [-0.12, 0.08, -0.12], 0xb0b8c8, 'ch_feather', [0, 0, 0.32], [1.38, 1.36, 1]),
      P('iw_poly', [0.05, WL], [-0.12, 0.1, -0.06], 0xe8ecf4, 'ch_feather', [0, 0, 0.32], [1.25, 1.25, 1]),
      P('iw_poly', [0.05, PIG_TAIL], [0, -0.28, -0.08], 0xc0c6d4, 'ch_feather', [0, 0, -PI / 2]),
      P('sphere', [0.3, 10, 8], [0, -0.05, 0], 0xf4f4f8, 'ch_feather', null, [0.78, 1.0, 0.75]),
      P('sphere', [0.15, 10, 8], [0, 0.3, 0.1], 0xf4f4f8, 'ch_feather'),
      P('cone', [0.045, 0.14, 5], [0, 0.27, 0.3], 0xe8a060, 'plain', [PI / 2, 0, 0]),
      box([0.04, 0.04, 0.03], [-0.07, 0.34, 0.23], 0xc02828, 'plain'),
      box([0.04, 0.04, 0.03], [0.07, 0.34, 0.23], 0xc02828, 'plain'),
      P('cyl', [0.065, 0.065, 0.34, 8], [0, 0.18, 0.33], 0xf0e6c8, 'ii_pages', [0, 0, PI / 2]),
      box([0.05, 0.15, 0.15], [-0.08, 0.18, 0.33], 0xd83a3a, 'cloth'),
      P('cyl', [0.055, 0.055, 0.03, 8], [0.05, 0.18, 0.4], 0xc02828, 'plain', [PI / 2, 0, 0])
    );
    evolved('pigeons', p, { tilt: -0.15, yaw: 0.1, pitch: 0.15, zoom: 1.0 });
  })();

  // b12 陨星天穹：黄铜星盘多了第三道环，成了一个天球，中间一块蓝色的星空圆盘；一颗拖着火尾的陨石从右下冲出来
  (function () {
    var p = WP.astrolabe.slice(0, 7).concat([
      P('iw_arc', [0.6, 0.05, 5, 18], [0, 0, 0], 0xd9a64a, 'gold', [PI / 2, 0, 0]),
      P('cyl', [0.52, 0.52, 0.04, 16], [0, 0, -0.03], 0xffffff, 'iw_xb_night', [PI / 2, 0, 0]),
      P('sphere', [0.17, 10, 8], [0.56, -0.52, 0.3], 0xff8a3a, '!plain'),
      P('sphere', [0.1, 8, 6], [0.53, -0.49, 0.42], 0xfff0a0, '!plain')
    ]);
    p = p.concat(flame([0.5, -0.46, 0.22], 0.62, [0, 0, 0.8], [0xff6a1a, 0xff9a3a, 0xfff0a0]));
    p.push(P('oct', [0.05], [0.82, -0.32, 0.3], 0xffb040, '!plain'), P('oct', [0.04], [0.36, -0.78, 0.3], 0xffb040, '!plain'));
    evolved('astrolabe', p, { yaw: 0.4, pitch: 0.25, zoom: 1.0 });
  })();

  // b13 破晓之光：铁框提灯亮得发白，射出一道又长又宽的晨光（外层粉橙、中间淡黄、中心白），尽头炸开一团圣光，灯顶一颗小太阳
  (function () {
    var p = recolor(lan.slice(0, 16), { 0xffd860: 0xfff4c8 });
    var A = [0.22, -0.02], dr = [0.955, -0.296], nr = [0.296, 0.955], L = 1.15, E = [A[0] + dr[0] * L, A[1] + dr[1] * L];
    var beam = function (r0, r1, col, z) {
      return P('iw_poly', [0.02, [A[0] + nr[0] * r0, A[1] + nr[1] * r0, E[0] + nr[0] * r1, E[1] + nr[1] * r1, E[0] - nr[0] * r1, E[1] - nr[1] * r1, A[0] - nr[0] * r0, A[1] - nr[1] * r0]], [0, 0, z], col, '!plain');
    };
    p.push(beam(0.15, 0.42, 0xffb090, 0.24), beam(0.1, 0.28, 0xfff0a0, 0.27), beam(0.04, 0.12, 0xffffff, 0.3));
    p.push(P('iw_poly', [0.03, star(8, 0.4, 0.16)], [E[0], E[1], 0.33], 0xfff0a0, '!plain'),
      P('iw_poly', [0.03, star(8, 0.2, 0.08, 0.2)], [E[0], E[1], 0.36], 0xffffff, '!plain'),
      P('iw_poly', [0.03, star(8, 0.13, 0.055)], [0, 0.86, 0], 0xffd84a, '!plain'));
    evolved('lanternbeam', p, { yaw: 0.45, pitch: 0.25, zoom: 0.92 });
  })();

  // b14 晨昏钟：深一点的铜钟挂在弯弯的木轭上，轭的左头一个大太阳（深色衬底上的橙色光芒）、
  //     右头一弯大银月（深蓝的夜空小圆盘上，旁边两颗小星），钟口下面两圈完整的声波
  (function () {
    var B = xbSet(WP.bronzebell, 0, 0xc08a30);
    var SU = [-0.8, 0.12, 0.06], MO = [0.78, 0.1, 0.06];
    var p = B.slice(0, 4).concat(B.slice(6, 8)).concat([
      P('iw_horn', [0.74, 0.075, 0.05, 10, PI * 0.8, 5, 0], [0, -0.16, 0], WOOD_D, 'wood', [0, 0, PI * 0.1]),
      box([0.1, 0.24, 0.1], [0, 0.46, 0], WOOD_D, 'wood'),
      P('cyl', [0.31, 0.31, 0.03, 14], [SU[0], SU[1], SU[2] - 0.06], 0x7a3010, 'plain', [PI / 2, 0, 0]),
      P('iw_poly', [0.03, star(10, 0.4, 0.26)], [SU[0], SU[1], SU[2] - 0.02], 0xff8a30, '!plain'),
      P('cyl', [0.22, 0.22, 0.04, 12], [SU[0], SU[1], SU[2] + 0.03], 0xffc040, '!plain', [PI / 2, 0, 0]),
      P('cyl', [0.12, 0.12, 0.03, 10], [SU[0] - 0.04, SU[1] + 0.04, SU[2] + 0.06], 0xfff0b0, '!plain', [PI / 2, 0, 0]),
      P('cyl', [0.32, 0.32, 0.04, 14], [MO[0], MO[1], MO[2] - 0.05], 0x1a2a5a, 'plain', [PI / 2, 0, 0]),
      P('iw_poly', [0.05, crescentPts(0.26, 0.15, 3.4)], [MO[0] + 0.03, MO[1] - 0.01, MO[2] + 0.02], 0xb8c8ff, '!plain', [0, 0, PI / 2 + 0.35]),
      P('iw_poly', [0.02, star(4, 0.07, 0.025)], [MO[0] + 0.12, MO[1] + 0.13, MO[2] + 0.02], 0xffffff, '!plain'),
      P('iw_poly', [0.02, star(4, 0.05, 0.02)], [MO[0] + 0.18, MO[1] - 0.1, MO[2] + 0.02], 0xffffff, '!plain'),
      P('iw_arc', [0.62, 0.03, 3, 18], [0, -0.45, 0], 0xffe8b0, '!plain', [1.35, 0, 0]),
      P('iw_arc', [0.78, 0.03, 3, 18], [0, -0.48, 0], 0xffe8b0, '!plain', [1.35, 0, 0])
    ]);
    evolved('bronzebell', p, { yaw: 0.3, pitch: 0.22, zoom: 1.05 });
  })();

  // b15 钓龙竿：两根竹钓竿交叉（一次甩两竿），主竿的线上钓着一条跃起的碧玉色鲤鱼龙（鱼尾鱼身，龙头带金角金须），下面掉两枚金币
  (function () {
    var p = xf(WP.rod.slice(0, 9), [0, 0, 0.35]).concat(xf(WP.rod.slice(0, 7), [0, 0, 1.35], [0, 0, -0.15], 0.85));
    var tip = [0.6 * Math.cos(0.35) - 0.78 * Math.sin(0.35), 0.6 * Math.sin(0.35) + 0.78 * Math.cos(0.35), 0];
    var mouth = [0.6, 0.32, 0.05];
    p.push(rod('box', tip, [0.56, 0.6, 0.02], [0.03, 0.03], 0xf4f4f4, 'plain'), rod('box', [0.56, 0.6, 0.02], mouth, [0.03, 0.03], 0xf4f4f4, 'plain'));
    var dragon = [
      P('iw_poly', [0.1, FISH], [0, 0, 0], 0x6ac890, 'scale'),
      P('iw_poly', [0.02, BELLY], [0, 0, 0.055], 0xf0fff4, 'plain'),
      P('iw_poly', [0.12, [-0.1, 0.22, 0.12, 0.22, 0.16, 0.34, 0.1, 0.44, 0.0, 0.48, -0.1, 0.45, -0.15, 0.35]], [0, 0, 0], 0x6ac890, 'scale'),
      rod('cone', [-0.05, 0.44, 0], [-0.16, 0.64, -0.02], [0.035, 4], GOLD_L, 'gold'),
      rod('cone', [0.05, 0.44, 0], [0.04, 0.66, -0.02], [0.035, 4], GOLD_L, 'gold'),
      rod('box', [0.13, 0.34, 0.06], [0.32, 0.24, 0.06], [0.02, 0.02], GOLD_L, 'gold'),
      rod('box', [-0.13, 0.32, 0.06], [-0.3, 0.2, 0.06], [0.02, 0.02], GOLD_L, 'gold'),
      P('iw_poly', [0.04, [-0.1, 0.16, -0.24, 0.1, -0.14, 0.02, -0.25, -0.06, -0.11, -0.12]], [0, 0, -0.02], 0x3aa070, 'scale'),
      box([0.06, 0.06, 0.02], [0.04, 0.38, 0.07], 0xffffff, 'plain'),
      box([0.03, 0.03, 0.02], [0.05, 0.38, 0.085], 0x1a1a22, 'plain')
    ];
    p = p.concat(xf(dragon, [0, 0, 0.45], [0.82, -0.28, 0.05], 1.6));
    p = p.concat(xbCoin([0.42, -0.9, 0.2], 1, [0, 0.4, 0.3]), xbCoin([0.98, -1.0, 0.2], 0.9, [0, -0.5, -0.2]));
    evolved('rod', p, { yaw: 0.3, pitch: 0.25, zoom: 1.0 });
  })();

})();
