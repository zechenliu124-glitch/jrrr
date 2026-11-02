'use strict';
// ============================================================
//  物品图标：39 件物品各自画成它名字说的那个东西（燕麦粥、四叶草、医疗包……）
//  和游戏里的模型一样用低多边形零件 + 像素贴图 + 光照，由 ICONS 渲染成 36px 小图
//  零件格式和 MODEL.build 一样：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图名, 平面投影]
//  贴图名前面加 '!' 表示发光零件（不吃光照：火焰、宝石、灵魂、闪电）
//  ICONS.model 定义图标（名字 'i_<id>'），ICONS.use 对应到游戏 id
// ============================================================
(function () {
  var PI = Math.PI;

  // ---------------- 小贴图（名字都以 ii_ 开头，脚本加载时注册） ----------------
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就用默认贴图 */ } };
  // 燕麦粥：一片片错开的麦片
  add('ii_oats', function (x, y, r) {
    var cx = (x + ((y >> 2) & 1) * 2) & 3, cy = y & 3;
    return ((cx === 0 || cy === 3) ? 182 : 240 - cy * 8) + r() * 14;
  });
  // 奶酪：浅黄底上几个圆洞（洞上沿暗、下沿亮一点）
  var HOLES = [[4, 4, 2.4], [11.5, 3, 1.7], [9.5, 10.5, 2.8], [2.5, 12.5, 1.6], [14.5, 13.5, 1.3]];
  add('ii_cheese', function (x, y, r) {
    for (var i = 0; i < HOLES.length; i++) {
      var h = HOLES[i], dx = x + 0.5 - h[0], dy = y + 0.5 - h[1];
      if (dx * dx + dy * dy < h[2] * h[2]) return dy < 0 ? 140 : 178;
    }
    return 238 + r() * 14;
  });
  // 表盘：一圈 12 个刻度
  add('ii_clock', function (x, y) {
    var dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx);
    var k = Math.round(a / (PI / 6)), da = Math.abs(a - k * PI / 6) * d;
    if (d > 5.2 && d < 7.4 && da < 0.75) return 46;
    return 250;
  });
  // 书页：一条条细线
  add('ii_pages', function (x, y, r) { return (x % 2 ? 210 : 250) + r() * 6; });
  // 啤酒：往上冒的小气泡
  add('ii_beer', function (x, y, r) {
    var v = 214 + r() * 14;
    if ((x * 5 + y * 3) % 13 === 0 || r() < 0.03) v = 255;
    return v;
  });
  // 冰：亮边 + 两道白色裂纹
  add('ii_ice', function (x, y, r) {
    var v = 220 + r() * 12;
    if (x === 0 || y === 0) v = 255;
    if (x === 15 || y === 15) v = 190;
    if (Math.abs(x - y * 0.6 - 4) < 0.6 && y > 3 && y < 12) v = 255;
    if (Math.abs(x + y - 20) < 0.6 && x > 8) v = 250;
    return v;
  });
  // 墨镜片（彩色）：上深下浅的蓝色渐变 + 一道斜着的白色反光
  add('ii_lens', function (x, y) {
    var t = y / 15;
    if (Math.abs(x + y * 0.7 - 8) < 1.3 || Math.abs(x + y * 0.7 - 12) < 0.6) return [235, 250, 255];
    return [24 + t * 40, 44 + t * 140, 92 + t * 150];
  });
  // 信用卡面：斜着一道浅色光泽 + 细花纹
  add('ii_card', function (x, y, r) {
    var v = 222 + r() * 10, d = x - y;
    if (d > 2 && d < 6) v = 250;
    if ((x + y * 2) % 7 === 0) v -= 14;
    return v;
  });
  // 蛇皮：小鳞片 + 一串深色菱形斑
  add('ii_snake', function (x, y, r) {
    var k = (x + (y >> 1)) & 3, v = k === 0 ? 190 : 236 + r() * 14;
    var dx = Math.abs((x % 8) - 3.5), dy = Math.abs((y % 8) - 3.5);
    if (dx + dy < 2.6) v = 118;
    return v;
  });
  // 羽毛：从羽轴往两边斜着长的羽枝
  add('ii_barb', function (x, y, r) {
    var k = (Math.floor(Math.abs(x - 7.5)) + y) % 3;
    return (k === 0 ? 200 : 246) + r() * 8;
  });

  // ---------------- 额外的零件形状（名字都以 ii_ 开头） ----------------
  // 把贴图坐标按包围盒压回 0~1：正面、背面整块铺一次，侧面沿着边铺
  function fitUV(g) {
    if (g.index) g = g.toNonIndexed();
    g.computeBoundingBox();
    var bb = g.boundingBox, w = (bb.max.x - bb.min.x) || 1, h = (bb.max.y - bb.min.y) || 1, d = (bb.max.z - bb.min.z) || 1;
    var p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (var i = 0; i < p.count; i++) {
      var fx = (p.getX(i) - bb.min.x) / w, fy = (p.getY(i) - bb.min.y) / h, fz = (p.getZ(i) - bb.min.z) / d;
      if (Math.abs(n.getZ(i)) > 0.6) u.setXY(i, fx, fy);
      else u.setXY(i, (fx + fy) * 0.5, fz);
    }
    return g;
  }

  // 旋转体（碗、瓶子、杯子、蛋、王冠）：[分段, r0, y0, r1, y1, ...]，从下往上写
  MODEL.extraGeo.ii_lathe = function (s) {
    var pts = [];
    for (var i = 1; i + 1 < s.length; i += 2) pts.push(new THREE.Vector2(Math.max(0.0001, s[i]), s[i + 1]));
    return new THREE.LatheGeometry(pts, s[0]);
  };

  // 挤出的平面多边形：[厚, [x0,y0, x1,y1, ...], 倒角]，画在 XY 平面上，沿 Z 挤出并居中
  MODEL.extraGeo.ii_poly = function (s) {
    var pts = s[1], sh = new THREE.Shape(), bev = s[2] || 0;
    sh.moveTo(pts[0], pts[1]);
    for (var i = 2; i + 1 < pts.length; i += 2) sh.lineTo(pts[i], pts[i + 1]);
    var g = new THREE.ExtrudeGeometry(sh, { depth: s[0], bevelEnabled: bev > 0, bevelThickness: bev, bevelSize: bev, bevelSegments: bev > 0 ? 2 : 0, curveSegments: 1 });
    g.translate(0, 0, -s[0] / 2);
    return fitUV(g);
  };

  // 粗细可变的弯管（蛇身、电线、吸管、尾巴）：[半径（数字，或从头到尾的数组）, 截面边数, 分段, 贴图重复次数, x0,y0,z0, x1,y1,z1, ...]
  // 两头封口；每段单独算贴图坐标，花纹沿着管子能重复几次
  MODEL.extraGeo.ii_tube = function (s) {
    var pts = [], i, j;
    for (i = 4; i + 2 < s.length; i += 3) pts.push(new THREE.Vector3(s[i], s[i + 1], s[i + 2]));
    var curve = new THREE.CatmullRomCurve3(pts), M = s[1] || 6, N = s[2] || 12, rep = s[3] || 1, rs = s[0];
    var radAt = function (t) {
      if (typeof rs === 'number') return rs;
      var f = t * (rs.length - 1), k = Math.min(rs.length - 2, Math.floor(f));
      return rs[k] + (rs[k + 1] - rs[k]) * (f - k);
    };
    var fr = curve.computeFrenetFrames(N, false), rings = [];
    for (i = 0; i <= N; i++) {
      var t = i / N, c = curve.getPointAt(t), r = radAt(t), nn = fr.normals[i], bb = fr.binormals[i], ring = [];
      for (j = 0; j <= M; j++) {
        var a = j / M * PI * 2, ca = Math.cos(a), sa = Math.sin(a);
        var nx = nn.x * ca + bb.x * sa, ny = nn.y * ca + bb.y * sa, nz = nn.z * ca + bb.z * sa;
        ring.push([c.x + nx * r, c.y + ny * r, c.z + nz * r, nx, ny, nz]);
      }
      ring.c = c;
      rings.push(ring);
    }
    var pos = [], nor = [], uv = [], per = N / rep;
    var put = function (q, uu, vv) { pos.push(q[0], q[1], q[2]); nor.push(q[3], q[4], q[5]); uv.push(uu, vv); };
    for (i = 0; i < N; i++) {
      var u0 = (i % per) / per, u1 = Math.min(1, u0 + 1 / per);
      for (j = 0; j < M; j++) {
        var A = rings[i][j], B = rings[i + 1][j], C = rings[i + 1][j + 1], D = rings[i][j + 1], v0 = j / M, v1 = (j + 1) / M;
        put(A, u0, v0); put(C, u1, v1); put(B, u1, v0);
        put(A, u0, v0); put(D, u0, v1); put(C, u1, v1);
      }
    }
    // 两头的盖子
    [[0, -1], [N, 1]].forEach(function (e) {
      var ring = rings[e[0]], c = ring.c, T = fr.tangents[e[0]], cq = [c.x, c.y, c.z, T.x * e[1], T.y * e[1], T.z * e[1]];
      for (j = 0; j < M; j++) {
        var p0 = ring[j].slice(0, 3).concat(cq.slice(3)), p1 = ring[j + 1].slice(0, 3).concat(cq.slice(3));
        if (e[1] > 0) { put(cq, 0.5, 0.5); put(p0, 0, 0); put(p1, 1, 0); }
        else { put(cq, 0.5, 0.5); put(p1, 1, 0); put(p0, 0, 0); }
      }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  };

  // 圆弧管（戒指、提手、指虎的环）：[半径, 管粗, 截面分段, 弧分段, 弧度]，在 XY 平面里，从 +X 开始逆时针
  MODEL.extraGeo.ii_arc = function (s) { return new THREE.TorusGeometry(s[0], s[1], s[2] || 6, s[3] || 12, s[4] || PI * 2); };

  // 局部球面（汉堡顶、兜帽）：[半径, 横分段, 竖分段, phi 起点, phi 长度, theta 起点, theta 长度]
  MODEL.extraGeo.ii_sph = function (s) {
    return new THREE.SphereGeometry(s[0], s[1] || 10, s[2] || 6, s[3] || 0, s[4] != null ? s[4] : PI * 2, s[5] || 0, s[6] != null ? s[6] : PI);
  };

  // 三角面片（纸飞机）：[x0,y0,z0, x1,y1,z1, x2,y2,z2, ...]，每个三角形正反两面都画
  MODEL.extraGeo.ii_tris = function (s) {
    var pos = [], uv = [];
    for (var i = 0; i + 8 < s.length; i += 9) {
      var a = s.slice(i, i + 3), b = s.slice(i + 3, i + 6), c = s.slice(i + 6, i + 9);
      pos.push.apply(pos, a.concat(b, c, a, c, b));
      uv.push(0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 1, 0);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };

  // 斗篷：前面开口的一圈锥面，越往下褶子越深（有棱角的布褶）
  // [上半径, 下半径, 高, 前面开口的角度, 褶子数, 褶子深, 横分段, 是否画里面（反面）]
  MODEL.extraGeo.ii_cape = function (s) {
    var rT = s[0], rB = s[1], H = s[2], gap = s[3], folds = s[4], amp = s[5], M = s[6] || 24, inner = !!s[7], rows = 4;
    var a0 = gap / 2, a1 = PI * 2 - gap / 2;
    var at = function (i, j) {
      var t = j / rows, a = a0 + (a1 - a0) * i / M;
      var r = (rT + (rB - rT) * t) * (1 + amp * t * Math.sin((a - a0) * folds));
      return [Math.sin(a) * r, H / 2 - t * H, Math.cos(a) * r];
    };
    var pos = [], uv = [];
    var tri = function (p, q, w, pu, qu, wu) {
      if (inner) { var tp = q; q = w; w = tp; var tu = qu; qu = wu; wu = tu; }
      pos.push(p[0], p[1], p[2], q[0], q[1], q[2], w[0], w[1], w[2]);
      uv.push(pu[0], pu[1], qu[0], qu[1], wu[0], wu[1]);
    };
    for (var i = 0; i < M; i++) for (var j = 0; j < rows; j++) {
      var A = at(i, j), B = at(i, j + 1), C = at(i + 1, j + 1), D = at(i + 1, j);
      var ua = [i / M, 1 - j / rows], ub = [i / M, 1 - (j + 1) / rows], uc = [(i + 1) / M, 1 - (j + 1) / rows], ud = [(i + 1) / M, 1 - j / rows];
      tri(A, B, D, ua, ub, ud);
      tri(B, C, D, ub, uc, ud);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.computeVertexNormals();
    return g;
  };

  // ---------------- 零件小工具 ----------------
  // 通用零件（参数顺序方便写：贴图在旋转前面）
  function P(type, s, pos, c, t, rot, sc, planar) { return [type, s, pos, c, rot || null, sc || null, t || null, planar || 0]; }

  // 从点 a 到点 b 的杆子：box 的 s = [宽, 厚]；cyl 的 s = [a 端半径, b 端半径, 分段]
  var V0 = new THREE.Vector3(), V1 = new THREE.Vector3(), Q0 = new THREE.Quaternion(), EU = new THREE.Euler(), UP = new THREE.Vector3(0, 1, 0), SC = new THREE.Vector3();
  function rod(type, a, b, s, c, t) {
    V0.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    var L = V0.length();
    Q0.setFromUnitVectors(UP, V0.normalize());
    EU.setFromQuaternion(Q0);
    var mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], rot = [EU.x, EU.y, EU.z];
    if (type === 'box') return P('box', [s[0], L, s[1] != null ? s[1] : s[0]], mid, c, t, rot);
    return P('cyl', [s[1] != null ? s[1] : s[0], s[0], L, s[2] || 6], mid, c, t, rot);
  }

  // 把一组零件整体旋转（弧度 [x,y,z]）、平移、等比缩放；零件自己的旋转和缩放正确叠加
  var M0 = new THREE.Matrix4(), M1 = new THREE.Matrix4();
  function xf(parts, rot, pos, k) {
    k = k || 1;
    Q0.setFromEuler(EU.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0));
    M0.compose(V0.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0), Q0, SC.set(k, k, k));
    return parts.map(function (p) {
      p = p.slice();
      var r = p[4] || [0, 0, 0], s = p[5] || [1, 1, 1];
      Q0.setFromEuler(EU.set(r[0], r[1], r[2]));
      M1.compose(V1.set(p[2][0], p[2][1], p[2][2]), Q0, SC.set(s[0], s[1], s[2]));
      M1.premultiply(M0);
      M1.decompose(V1, Q0, SC);
      EU.setFromQuaternion(Q0);
      p[2] = [V1.x, V1.y, V1.z]; p[4] = [EU.x, EU.y, EU.z]; p[5] = [SC.x, SC.y, SC.z];
      return p;
    });
  }

  // 平面点列：左右镜像、绕中心缩放
  function mirrorPts(pts) { var o = []; for (var i = 0; i < pts.length; i += 2) o.push(-pts[i], pts[i + 1]); return o; }
  function scalePts(pts, k, cx, cy) { var o = []; for (var i = 0; i < pts.length; i += 2) o.push(cx + (pts[i] - cx) * k, cy + (pts[i + 1] - cy) * k); return o; }
  // 圆角矩形
  function rrect(w, h, r, n) {
    n = n || 3;
    var out = [], hw = w / 2 - r, hh = h / 2 - r;
    [[hw, hh, 0], [-hw, hh, PI / 2], [-hw, -hh, PI], [hw, -hh, PI * 1.5]].forEach(function (c) {
      for (var i = 0; i <= n; i++) { var a = c[2] + PI / 2 * i / n; out.push(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r); }
    });
    return out;
  }
  // 星形（闪光、冲击星）
  function star(n, R, r, rot) {
    var out = [];
    for (var i = 0; i < n * 2; i++) {
      var a = (rot || 0) + PI * i / n + PI / 2, k = i % 2 ? r : R;
      out.push(Math.cos(a) * k, Math.sin(a) * k);
    }
    return out;
  }
  // 心形：尖在原点，往 +y 长，k 是大小（四叶草的叶子）
  function heartPts(n, k) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var t = PI * 2 * i / n, x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
      out.push(x / 32 * k, (y + 17) / 32 * k);
    }
    return out;
  }
  // 闪电（高约 1，中心在原点）
  var BOLT = [-0.02, 0.5, 0.22, 0.5, 0.06, 0.1, 0.24, 0.1, -0.16, -0.5, -0.02, -0.04, -0.2, -0.04];
  // 火苗（底在原点，往 +y 长，高 1）
  var FLAME = [0, 0, 0.26, 0.06, 0.34, 0.24, 0.3, 0.44, 0.2, 0.6, 0.26, 0.8, 0.1, 0.7, 0.03, 1, -0.1, 0.74, -0.2, 0.62, -0.26, 0.72, -0.32, 0.46, -0.33, 0.24, -0.25, 0.07];
  // 三层火苗：外焰橙红、内焰黄、焰心白（发光，正面朝 +Z，ry 让它转向镜头）
  function flame(pos, k, ry, cols) {
    cols = cols || [0xff5a14, 0xffb020, 0xfff2b0];
    return xf([
      P('ii_poly', [0.06, FLAME], [0, 0, 0], cols[0], '!plain'),
      P('ii_poly', [0.06, FLAME], [0, 0.02, 0.05], cols[1], '!plain', null, [0.66, 0.68, 1]),
      P('ii_poly', [0.06, FLAME], [0, 0.03, 0.1], cols[2], '!plain', null, [0.34, 0.36, 1])
    ], [0, ry || 0, 0], pos, k);
  }
  // 四角星闪光（发光）
  function sparkle(pos, k, ry, c) { return P('ii_poly', [0.03, star(4, 0.22 * k, 0.055 * k)], pos, c || 0xffffff, '!plain', [0, ry == null ? 0.65 : ry, 0]); }
  // 竖直的六棱经验水晶（上下带尖，发光）
  function crystal(pos, h, r, rot) {
    return xf([
      P('cyl', [r, r, h, 6], [0, 0, 0], 0x9fdcff, '!plain'),
      P('cone', [r, r * 1.6, 6], [0, h / 2 + r * 0.8, 0], 0xe8f8ff, '!plain'),
      P('cone', [r, r * 1.0, 6], [0, -h / 2 - r * 0.5, 0], 0x7ac4f0, '!plain', [PI, 0, 0])
    ], rot || null, pos);
  }

  // 发光零件的材质：顶点色 × 像素贴图，不吃光照（和游戏里的火球、灵魂一样）
  var glowMat = null;
  // 零件表 → 图标模型（贴图名带 '!' 的零件放进发光网格）
  function mk(parts) {
    return function () {
      var lit = [], glow = [];
      parts.forEach(function (p) {
        var t = p[6];
        if (typeof t === 'string' && t.charAt(0) === '!') { p = p.slice(); p[6] = t.slice(1) || 'plain'; glow.push(p); }
        else lit.push(p);
      });
      var g = new THREE.Group();
      if (lit.length) g.add(new THREE.Mesh(MODEL.build(lit, false), MODEL.material()));
      if (glow.length) {
        if (!glowMat) glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas });
        g.add(new THREE.Mesh(MODEL.build(glow, false), glowMat));
      }
      return g;
    };
  }
  // 定义一件物品的图标
  function item(id, parts, opts) {
    ICONS.model('i_' + id, mk(parts), opts);
    ICONS.use('item', id, 'i_' + id);
  }

  // ---------------- 常用颜色 ----------------
  var GOLD = 0xffc83a, GOLD_D = 0xd99a20, WOOD_L = 0xd8a060, WHITE = 0xf6f4ee;

  // ============================================================
  //  39 件物品
  // ============================================================

  // 燕麦：一大碗冒尖的燕麦粥，插着木勺，上面几颗浆果
  item('oats', [
    P('ii_lathe', [12, 0, 0, 0.34, 0, 0.38, 0.08, 0.6, 0.26, 0.74, 0.52, 0.78, 0.62, 0.72, 0.64, 0.68, 0.58], [0, 0, 0], 0xb0602a, 'wood'),
    P('ii_arc', [0.765, 0.035, 4, 24], [0, 0.5, 0], 0x6e3416, 'wood', [PI / 2, 0, 0]),
    P('sphere', [0.7, 12, 6], [0, 0.58, 0], 0xf4dc98, 'ii_oats', null, [1, 0.22, 1]),
    rod('box', [-0.05, 0.6, 0.0], [0.6, 1.3, -0.32], [0.11, 0.05], WOOD_L, 'wood'),
    P('sphere', [0.13, 8, 6], [-0.26, 0.72, 0.22], 0xe0283a, 'plain'),
    P('sphere', [0.13, 8, 6], [0.0, 0.73, 0.4], 0xe0283a, 'plain'),
    P('sphere', [0.12, 8, 6], [-0.44, 0.7, -0.04], 0x5a4ae0, 'plain'),
    P('sphere', [0.06, 6, 4], [0.22, 0.72, 0.28], 0xfff2c8, 'plain', null, [1.4, 0.6, 1])
  ], { pitch: 0.58, yaw: 0.5 });

  // 四叶草：四片心形叶子（中间浅色的 V 字斑）+ 弯弯的茎
  (function () {
    var leaf = [
      P('ii_poly', [0.07, heartPts(22, 0.95), 0.03], [0, 0, 0], 0x34b838, 'leaf'),
      P('ii_poly', [0.03, heartPts(16, 0.46)], [0, 0.18, 0.08], 0x9cf07c, 'plain')
    ];
    var parts = [];
    for (var i = 0; i < 4; i++) parts = parts.concat(xf(xf(leaf, [-PI / 2 + 0.28, 0, 0]), [0, i * PI / 2 + 0.25, 0]));
    parts.push(P('ii_tube', [0.06, 5, 8, 1, 0, -0.02, 0, 0.1, -0.3, 0.12, 0.3, -0.62, 0.16], [0, 0, 0], 0x2a8c2c, 'leaf'));
    parts.push(P('sphere', [0.08, 6, 4], [0, 0.02, 0], 0x2a8c2c, 'leaf'));
    item('clover', parts, { pitch: 1.0, yaw: 0.35 });
  })();

  // 医疗包：白箱子、红十字、黑提手、两个金属卡扣
  item('medkit', [
    P('ii_poly', [0.55, rrect(1.3, 0.9, 0.14), 0.04], [0, 0, 0], WHITE, 'plain'),
    P('box', [1.36, 0.05, 0.64], [0, 0.2, 0], 0xb8b2aa, 'plain'),
    P('box', [0.54, 0.17, 0.06], [0, -0.1, 0.32], 0xe8282c, 'plain'),
    P('box', [0.17, 0.54, 0.06], [0, -0.1, 0.32], 0xe8282c, 'plain'),
    P('ii_arc', [0.24, 0.055, 6, 10, PI], [0, 0.49, 0], 0x40404c, 'plain'),
    P('box', [0.13, 0.08, 0.16], [-0.24, 0.5, 0], 0x40404c, 'plain'),
    P('box', [0.13, 0.08, 0.16], [0.24, 0.5, 0], 0x40404c, 'plain'),
    P('box', [0.14, 0.14, 0.06], [-0.46, 0.2, 0.32], 0xa8aeb8, 'metal'),
    P('box', [0.14, 0.14, 0.06], [0.46, 0.2, 0.32], 0xa8aeb8, 'metal')
  ], { yaw: 0.45, pitch: 0.32, zoom: 0.9 });

  // 电池：绿色电池身、黑色上截、金属正负极，身上一道发光的闪电
  (function () {
    var face = 0.5;   // 闪电朝向镜头的角度
    item('battery', [
      P('cyl', [0.34, 0.34, 0.82, 14], [0, -0.12, 0], 0x2ed46a, 'plain'),
      P('cyl', [0.345, 0.345, 0.26, 14], [0, 0.41, 0], 0x30343e, 'plain'),
      P('cyl', [0.3, 0.34, 0.06, 14], [0, 0.57, 0], 0xc8ced8, 'metal'),
      P('cyl', [0.12, 0.12, 0.1, 10], [0, 0.65, 0], 0xe8ecf2, 'metal'),
      P('cyl', [0.34, 0.3, 0.06, 14], [0, -0.56, 0], 0xc8ced8, 'metal'),
      P('ii_poly', [0.05, BOLT], [Math.sin(face) * 0.34, -0.12, Math.cos(face) * 0.34], 0xffe23a, '!plain', [0, face, 0], [0.62, 0.66, 1]),
      P('box', [0.05, 0.66, 0.04], [Math.sin(face - 0.75) * 0.33, -0.12, Math.cos(face - 0.75) * 0.33], 0xc8ffd8, 'plain', [0, face - 0.75, 0])
    ], { tilt: -0.35, yaw: face, pitch: 0.3 });
  })();

  // 钥匙：金色匙环、匙杆、两道箍、三个匙齿
  item('key', xf([
    P('ii_arc', [0.27, 0.1, 6, 16], [-0.6, 0, 0], GOLD, 'gold'),
    P('cyl', [0.085, 0.085, 1.0, 8], [0.12, 0, 0], GOLD, 'gold', [0, 0, PI / 2]),
    P('cyl', [0.13, 0.13, 0.1, 8], [-0.28, 0, 0], GOLD_D, 'gold', [0, 0, PI / 2]),
    P('cyl', [0.12, 0.12, 0.08, 8], [0.62, 0, 0], GOLD_D, 'gold', [0, 0, PI / 2]),
    P('box', [0.12, 0.32, 0.09], [0.42, -0.2, 0], GOLD, 'gold'),
    P('box', [0.12, 0.22, 0.09], [0.56, -0.15, 0], GOLD, 'gold'),
    P('box', [0.08, 0.14, 0.09], [0.3, -0.12, 0], GOLD, 'gold')
  ], [0, 0, 0.55]), { yaw: 0.25, pitch: 0.3 });

  // 巨人克星：精英头上的那种金冠（红丝绒、宝石），被一把剑斜着捅穿
  (function () {
    var crown = [
      P('ii_lathe', [10, 0.5, 0, 0.53, 0.04, 0.53, 0.36, 0.47, 0.38, 0.45, 0.06], [0, 0, 0], GOLD, 'gold'),
      P('sphere', [0.46, 10, 6], [0, 0.22, 0], 0xb02a3a, 'cloth', null, [1, 0.6, 1])
    ];
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * PI * 2 + 0.3, b = a + PI / 5;
      crown.push(P('cone', [0.15, 0.42, 4], [Math.sin(a) * 0.5, 0.56, Math.cos(a) * 0.5], GOLD, 'gold', [0, a, 0]));
      crown.push(P('sphere', [0.08, 6, 4], [Math.sin(a) * 0.5, 0.8, Math.cos(a) * 0.5], 0xffe890, 'gold'));
      crown.push(P('oct', [0.08], [Math.sin(b) * 0.54, 0.19, Math.cos(b) * 0.54], i % 2 ? 0x3ab0ff : 0xff2a3a, '!plain'));
    }
    var sword = [
      P('ii_poly', [0.07, [-0.13, 0, 0.13, 0, 0.12, 1.3, 0, 1.6, -0.12, 1.3], 0.02], [0, 0, 0], 0xf0f4fa, 'metal'),
      P('box', [0.05, 1.3, 0.1], [0, 0.66, 0], 0xa8b0c0, 'metal'),
      P('box', [0.62, 0.12, 0.16], [0, -0.02, 0], 0x3a3a46, 'metal'),
      P('cyl', [0.075, 0.075, 0.4, 6], [0, -0.27, 0], 0xc02a2a, 'ch_leather'),
      P('sphere', [0.11, 6, 4], [0, -0.5, 0], GOLD, 'gold')
    ];
    item('bossbuster', crown.concat(xf(sword, [0, 0, 2.5], [0.44, 0.94, 0.12], 0.85)), { yaw: 0.5, pitch: 0.42 });
  })();

  // 发霉奶酪：一角黄奶酪（有洞），长着绿霉斑，冒着两道绿色臭气
  (function () {
    var pts = [0.85, 0];
    for (var i = 0; i <= 6; i++) { var a = PI - 0.42 + 0.84 * i / 6; pts.push(0.85 + 1.5 * Math.cos(a), 1.5 * Math.sin(a)); }
    item('cheese', [
      P('ii_poly', [0.6, pts, 0.03], [0, 0, 0], 0xffcc3a, 'ii_cheese', [-PI / 2, 0, 0], null, 1.1),
      P('dodec', [0.17], [-0.14, 0.31, 0.05], 0x5aa83a, 'leaf', null, [1.2, 0.4, 1]),
      P('dodec', [0.12], [0.3, 0.31, -0.02], 0x7ac84a, 'leaf', null, [1, 0.4, 1.2]),
      P('dodec', [0.12], [-0.4, 0.31, -0.3], 0x4a9a3a, 'leaf', null, [1, 0.4, 1]),
      P('dodec', [0.14], [-0.2, 0.06, 0.34], 0x5aa83a, 'leaf', [0, 0.42, 0], [1.1, 1, 0.4]),
      P('ii_tube', [0.03, 4, 10, 1, -0.1, 0.45, 0, -0.18, 0.62, 0, -0.06, 0.78, 0, -0.14, 0.95, 0], [0, 0, 0], 0x9aff6a, '!plain'),
      P('ii_tube', [0.03, 4, 10, 1, 0.25, 0.42, -0.05, 0.18, 0.56, -0.05, 0.28, 0.7, -0.05, 0.2, 0.84, -0.05], [0, 0, 0], 0x9aff6a, '!plain')
    ], { yaw: 0.42, pitch: 0.5, zoom: 0.92 });
  })();

  // 健身酱：矮胖的红色挤压瓶（白标签、尖嘴）+ 前面横着一只大哑铃
  item('gymsauce', [
    P('ii_lathe', [12, 0, 0, 0.36, 0, 0.4, 0.06, 0.41, 0.6, 0.34, 0.76, 0.18, 0.84, 0.13, 0.85], [0, 0, 0], 0xe8402a, 'plain'),
    P('cyl', [0.415, 0.415, 0.34, 12], [0, 0.4, 0], 0xfff4e0, 'plain'),
    P('cyl', [0.42, 0.42, 0.07, 12], [0, 0.22, 0], 0xffa020, 'plain'),
    P('cyl', [0.17, 0.17, 0.12, 10], [0, 0.9, 0], 0xfff4e0, 'plain'),
    P('cone', [0.1, 0.26, 8], [0, 1.08, 0], 0xfff4e0, 'plain'),
    P('sphere', [0.055, 6, 4], [0, 1.22, 0], 0xe8402a, 'plain')
  ].concat(xf([
    P('cyl', [0.055, 0.055, 0.86, 6], [0, 0, 0], 0xdfe6ee, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.23, 0.23, 0.12, 10], [-0.28, 0, 0], 0x5a6a86, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.23, 0.23, 0.12, 10], [0.28, 0, 0], 0x5a6a86, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.17, 0.17, 0.09, 10], [-0.4, 0, 0], 0x3e4a60, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.17, 0.17, 0.09, 10], [0.4, 0, 0], 0x3e4a60, 'metal', [0, 0, PI / 2])
  ], [0, 0.35, 0], [-0.02, 0.23, 0.62])), { yaw: 0.5, pitch: 0.35 });

  // 禁忌果汁：紫色果汁盒（白标签上一串葡萄）+ 弯头吸管
  (function () {
    var parts = [
      P('box', [0.66, 0.96, 0.42], [0, 0.48, 0], 0x8e3ae0, 'plain'),
      P('box', [0.7, 0.06, 0.46], [0, 0.97, 0], 0x6a24b0, 'plain'),
      P('box', [0.5, 0.52, 0.02], [0, 0.46, 0.215], 0xfff4ff, 'plain'),
      P('box', [0.09, 0.12, 0.03], [0.06, 0.66, 0.235], 0x3ab83a, 'leaf', [0, 0, -0.6]),
      P('ii_tube', [0.04, 6, 10, 1, 0.14, 0.95, 0.06, 0.17, 1.25, 0.08, 0.22, 1.37, 0.08, 0.38, 1.42, 0.08], [0, 0, 0], 0xff5aa8, 'plain')
    ];
    [[-0.1, 0.56], [0, 0.56], [0.1, 0.56], [-0.05, 0.46], [0.05, 0.46], [0, 0.36]].forEach(function (g) {
      parts.push(P('sphere', [0.065, 6, 4], [g[0], g[1], 0.24], 0x6a22c8, 'plain'));
    });
    item('juice', parts, { yaw: 0.45, pitch: 0.25 });
  })();

  // 战术眼镜：黑框墨镜，蓝色镜片带一道反光
  (function () {
    var R = [0.06, 0.18, 0.6, 0.18, 0.58, -0.02, 0.5, -0.15, 0.32, -0.2, 0.14, -0.16, 0.07, -0.03], L = mirrorPts(R);
    item('glasses', [
      P('ii_poly', [0.08, scalePts(R, 1.22, 0.33, 0)], [0, 0, 0], 0x2a2c38, 'plain'),
      P('ii_poly', [0.08, scalePts(L, 1.22, -0.33, 0)], [0, 0, 0], 0x2a2c38, 'plain'),
      P('ii_poly', [0.03, R], [0, 0, 0.045], 0xffffff, '!ii_lens'),
      P('ii_poly', [0.03, L], [0, 0, 0.045], 0xffffff, '!ii_lens'),
      P('box', [1.42, 0.1, 0.1], [0, 0.21, 0], 0x2a2c38, 'plain'),
      P('box', [0.07, 0.08, 0.95], [0.7, 0.17, -0.47], 0x2a2c38, 'plain', [0, 0.08, 0]),
      P('box', [0.07, 0.08, 0.95], [-0.7, 0.17, -0.47], 0x2a2c38, 'plain', [0, -0.08, 0])
    ], { yaw: 0.45, pitch: 0.2, zoom: 0.92 });
  })();

  // 滑溜戒指：银戒指、亮蓝宝石，往下滴着水珠
  (function () {
    var drop = function (x, y, z, k) {
      return [
        P('sphere', [0.1 * k, 8, 6], [x, y, z], 0x6ad0ff, 'plain'),
        P('cone', [0.095 * k, 0.2 * k, 8], [x, y + 0.13 * k, z], 0x6ad0ff, 'plain')
      ];
    };
    item('ring', xf([
      P('ii_arc', [0.42, 0.12, 8, 20], [0, 0, 0], 0xd8e0ea, 'metal'),
      P('cyl', [0.17, 0.11, 0.14, 8], [0, 0.52, 0], 0xd8e0ea, 'metal'),
      P('oct', [0.28], [0, 0.73, 0], 0x2a9cff, 'plain', [0, PI / 4, 0], [1, 0.85, 1])
    ], [0, 1.1, 0]).concat(drop(0.16, -0.68, 0.3, 1.1), drop(-0.26, -0.86, 0.2, 0.8), [sparkle([-0.46, 0.66, 0.2], 0.9)]), { yaw: 0.6, pitch: 0.25, zoom: 1.12 });
  })();

  // 汉堡：面包底、肉饼、芝士片、生菜、番茄、撒芝麻的面包顶
  (function () {
    var parts = [
      P('ii_lathe', [12, 0, 0, 0.55, 0, 0.62, 0.06, 0.64, 0.14, 0.6, 0.2, 0, 0.2], [0, 0, 0], 0xd88a3a, 'noise'),
      P('cyl', [0.67, 0.67, 0.17, 12], [0, 0.29, 0], 0x6a3a1e, 'noise'),
      P('box', [0.98, 0.04, 0.98], [0, 0.39, 0], 0xffc020, 'plain', [0, PI / 4, 0]),
      P('cyl', [0.71, 0.69, 0.06, 9], [0, 0.43, 0], 0x5ad03a, 'leaf'),
      P('cyl', [0.6, 0.6, 0.07, 10], [0, 0.49, 0], 0xe03a2a, 'plain'),
      P('ii_lathe', [12, 0.62, 0, 0.66, 0.08, 0.6, 0.3, 0.42, 0.46, 0.2, 0.53, 0, 0.55], [0, 0.52, 0], 0xe8a040, 'noise')
    ];
    [[0.3, 0.2], [0.46, 1.1], [0.14, 2.4], [0.44, 2.9], [0.32, 4.9], [0.48, 0.1], [0.12, 0.9]].forEach(function (s) {
      var h = 0.52 + 0.55 * Math.sqrt(Math.max(0, 1 - Math.pow(s[0] / 0.66, 2))) * 0.98;
      parts.push(P('sphere', [0.045, 6, 4], [Math.sin(s[1]) * s[0], h, Math.cos(s[1]) * s[0]], 0xfff4d8, 'plain', [0, s[1], 0], [1, 0.6, 1.7]));
    });
    item('borgar', parts, { yaw: 0.5, pitch: 0.32 });
  })();

  // 羽毛：一大一小两根羽毛（白的在前，淡蓝的在后）
  (function () {
    var feather = function (len, wid, bend, c, qc) {
      var R = [], L = [];
      for (var i = 0; i <= 10; i++) {
        var t = i / 10, y = t * len, cx = bend * t * t;
        var w = wid * Math.pow(Math.sin(PI * Math.min(1, t * 1.04)), 0.7) * (1 - 0.25 * t);
        if (i === 4) w *= 0.35;   // 羽片上的一道缺口
        R.push(cx + w, y); L.push(cx - w * 0.82, y);
      }
      var pts = [0, 0];
      for (i = 1; i <= 10; i++) pts.push(R[i * 2], R[i * 2 + 1]);
      for (i = 9; i >= 1; i--) pts.push(L[i * 2], L[i * 2 + 1]);
      return [
        P('ii_poly', [0.03, pts, 0.012], [0, 0, 0], c, 'ii_barb'),
        P('ii_tube', [[0.04, 0.025, 0.008], 5, 10, 1, 0, -0.3, 0.02, bend * 0.25, len * 0.5, 0.03, bend, len * 0.98, 0.02], [0, 0, 0], qc, 'plain')
      ];
    };
    item('feathers', xf(feather(1.3, 0.3, 0.14, 0x7accff, 0xd8f0ff), [0, 0, 0.32], [0.38, 0.0, -0.12]).concat(
      xf(feather(1.55, 0.34, 0.18, 0xffffff, 0xe8e0d0), [0, 0, -0.62], [-0.2, -0.1, 0.05])), { yaw: 0.25, pitch: 0.2, zoom: 1.1 });
  })();

  // 背包：绿帆布包、深色翻盖和前袋、皮带金扣，顶上绑着红色铺盖卷
  item('backpack', [
    P('ii_poly', [0.55, rrect(0.95, 1.05, 0.22), 0.06], [0, 0, 0], 0x6a9a3a, 'mx_canvas'),
    P('ii_poly', [0.12, rrect(0.92, 0.5, 0.16), 0.03], [0, 0.26, 0.29], 0x557d2a, 'mx_canvas'),
    P('ii_poly', [0.2, rrect(0.62, 0.36, 0.12), 0.03], [0, -0.28, 0.33], 0x5a8630, 'mx_canvas'),
    P('box', [0.08, 0.42, 0.05], [-0.22, 0.16, 0.37], 0x6a3e22, 'ch_leather'),
    P('box', [0.08, 0.42, 0.05], [0.22, 0.16, 0.37], 0x6a3e22, 'ch_leather'),
    P('box', [0.13, 0.1, 0.06], [-0.22, 0.0, 0.39], GOLD, 'gold'),
    P('box', [0.13, 0.1, 0.06], [0.22, 0.0, 0.39], GOLD, 'gold'),
    P('cyl', [0.19, 0.19, 1.1, 10], [0, 0.66, -0.02], 0xc83a2a, 'cloth', [0, 0, PI / 2]),
    P('cyl', [0.2, 0.2, 0.06, 10], [-0.3, 0.66, -0.02], 0x6a3e22, 'ch_leather', [0, 0, PI / 2]),
    P('cyl', [0.2, 0.2, 0.06, 10], [0.3, 0.66, -0.02], 0x6a3e22, 'ch_leather', [0, 0, PI / 2])
  ], { yaw: 0.55, pitch: 0.3 });

  // 啤酒：玻璃大杯装的金黄啤酒，满得冒出白泡沫
  (function () {
    var parts = [
      P('cyl', [0.42, 0.4, 0.86, 10], [0, 0.48, 0], 0xf5a818, 'ii_beer'),
      P('cyl', [0.43, 0.43, 0.1, 10], [0, 0.05, 0], 0xffe0a0, 'plain'),
      P('ii_arc', [0.26, 0.075, 6, 10, PI], [0.42, 0.5, 0], 0xffd890, 'plain', [0, 0, -PI / 2]),
      P('cyl', [0.45, 0.45, 0.14, 12], [0, 0.95, 0], 0xfffaf0, 'plain'),
      P('sphere', [0.22, 8, 6], [0, 1.08, 0], 0xfffaf0, 'plain'),
      P('box', [0.06, 0.62, 0.03], [0, 0.46, 0.42], 0xfff0c0, 'plain'),
      P('sphere', [0.08, 6, 4], [Math.sin(0.4) * 0.42, 0.78, Math.cos(0.4) * 0.42], 0xfffaf0, 'plain', null, [1, 1.6, 1])
    ];
    for (var i = 0; i < 7; i++) {
      var a = i / 7 * PI * 2;
      parts.push(P('sphere', [0.16, 8, 6], [Math.sin(a) * 0.36, 1.01, Math.cos(a) * 0.36], 0xfffaf0, 'plain'));
    }
    item('beer', parts, { yaw: 0.35, pitch: 0.3, zoom: 0.88 });
  })();

  // 铜指虎：四个连在一起的铜环、顶上小尖刺、下面的握把
  (function () {
    var C = 0xd8a040, parts = [];
    for (var i = 0; i < 4; i++) {
      var x = -0.54 + i * 0.36;
      parts.push(P('ii_arc', [0.15, 0.085, 6, 12], [x, 0.18, 0], C, 'gold'));
      parts.push(P('cone', [0.08, 0.18, 4], [x, 0.48, 0], 0xf0c060, 'gold'));
    }
    parts.push(P('ii_poly', [0.18, [-0.7, 0, 0.7, 0, 0.62, -0.16, 0.4, -0.26, 0, -0.3, -0.4, -0.26, -0.62, -0.16], 0.03], [0, -0.04, 0], C, 'gold'));
    item('knuckles', xf(parts, [0, 0, 0.42]), { yaw: 0.3, pitch: 0.25 });
  })();

  // 营火：一圈石头、搭成小帐篷的柴火、熊熊的火苗和火星
  (function () {
    var parts = [], i, a;
    for (i = 0; i < 8; i++) {
      a = i / 8 * PI * 2;
      parts.push(P('dodec', [0.15], [Math.sin(a) * 0.62, 0.07, Math.cos(a) * 0.62], i % 2 ? 0x8a8c94 : 0xa0a0a8, 'rock', [a, a * 2, 0], [1.1, 0.7, 1]));
    }
    for (i = 0; i < 4; i++) {
      a = i / 4 * PI * 2 + 0.4;
      parts.push(rod('cyl', [Math.sin(a) * 0.46, 0.03, Math.cos(a) * 0.46], [Math.sin(a) * 0.05, 0.66, Math.cos(a) * 0.05], [0.08, 0.06, 6], 0x7a4a26, 'bark'));
    }
    parts.push(P('cyl', [0.3, 0.34, 0.05, 8], [0, 0.03, 0], 0xff8a20, '!plain'));
    parts = parts.concat(flame([0, 0.08, 0.02], 1.05, 0.65), flame([-0.24, 0.06, -0.12], 0.6, 0.65), flame([0.22, 0.06, -0.1], 0.68, 0.65));
    parts.push(P('box', [0.06, 0.06, 0.06], [0.3, 1.12, 0.05], 0xffd040, '!plain'), P('box', [0.05, 0.05, 0.05], [-0.25, 1.0, 0.1], 0xffa030, '!plain'));
    item('campfire', parts, { pitch: 0.42, zoom: 0.92 });
  })();

  // 懦夫斗篷：紫色兜帽斗篷，帽子里黑乎乎的只露出一双害怕的眼睛
  item('cloak', [
    P('ii_cape', [0.3, 0.8, 1.4, 0.9, 7, 0.1, 28, false], [0, 0, 0], 0x7a48c0, 'cloth'),
    P('ii_cape', [0.3, 0.8, 1.4, 0.9, 7, 0.1, 28, true], [0, 0, 0], 0x2a1a48, 'cloth'),
    P('ii_sph', [0.36, 12, 8, PI / 2 + 0.55, PI * 2 - 1.1, 0, PI * 0.62], [0, 0.86, -0.02], 0x7a48c0, 'cloth'),
    P('sphere', [0.31, 10, 8], [0, 0.84, -0.02], 0x1a1028, 'plain'),
    P('box', [0.07, 0.07, 0.04], [-0.09, 0.86, 0.29], 0xfff27a, '!plain'),
    P('box', [0.07, 0.07, 0.04], [0.09, 0.86, 0.29], 0xfff27a, '!plain'),
    P('oct', [0.08], [0, 0.6, 0.32], GOLD, 'gold')
  ], { yaw: 0.4, pitch: 0.2, tilt: 0.12, zoom: 0.92 });

  // 信用卡：圆角卡片、金色芯片、一行卡号、右上角的小标志
  function card(col, emblem) {
    return [
      P('ii_poly', [0.05, rrect(1.5, 0.95, 0.1), 0.015], [0, 0, 0], col, 'ii_card'),
      P('box', [0.28, 0.22, 0.03], [-0.42, 0.1, 0.035], 0xffd24a, 'gold'),
      P('box', [0.03, 0.22, 0.032], [-0.42, 0.1, 0.036], 0xb88a20, 'plain'),
      P('box', [0.2, 0.06, 0.02], [-0.47, -0.17, 0.035], 0xffffff, 'plain'),
      P('box', [0.2, 0.06, 0.02], [-0.2, -0.17, 0.035], 0xffffff, 'plain'),
      P('box', [0.2, 0.06, 0.02], [0.07, -0.17, 0.035], 0xffffff, 'plain'),
      P('box', [0.2, 0.06, 0.02], [0.34, -0.17, 0.035], 0xffffff, 'plain'),
      P('box', [0.4, 0.05, 0.02], [-0.45, -0.32, 0.035], 0xe8e8e8, 'plain')
    ].concat(emblem);
  }
  item('greencard', xf(card(0x2ac85a, [
    P('sphere', [0.07, 6, 4], [0.5, 0.29, 0.04], 0xb8ffb0, 'plain', null, [1, 1, 0.4]),
    P('sphere', [0.07, 6, 4], [0.62, 0.29, 0.04], 0xb8ffb0, 'plain', null, [1, 1, 0.4]),
    P('sphere', [0.07, 6, 4], [0.5, 0.17, 0.04], 0xb8ffb0, 'plain', null, [1, 1, 0.4]),
    P('sphere', [0.07, 6, 4], [0.62, 0.17, 0.04], 0xb8ffb0, 'plain', null, [1, 1, 0.4])
  ]), [0.1, 0, 0.18]), { yaw: 0.25, pitch: 0.3 });
  item('redcard', xf(card(0xe0333a, [
    P('ii_poly', [0.03, star(5, 0.13, 0.055)], [0.55, 0.24, 0.04], 0xffe070, 'gold')
  ]), [0.1, 0, -0.18]), { yaw: 0.25, pitch: 0.3 });

  // 金色运动鞋：中帮金鞋（深金色包头和后跟、白鞋带、红鞋跟拉环）、厚白鞋底、深色大底，侧面一道白闪电
  (function () {
    var SOLE = [-0.66, 0.04, 0.55, 0.04, 0.7, 0.08, 0.8, 0.2, 0.77, 0.25, 0.62, 0.19, -0.66, 0.19];
    var OUT = [-0.64, -0.04, 0.56, -0.04, 0.72, 0.02, 0.78, 0.1, 0.6, 0.06, -0.64, 0.06];
    var UPPER = [-0.62, 0.16, 0.62, 0.16, 0.74, 0.22, 0.7, 0.34, 0.5, 0.44, 0.18, 0.58, -0.02, 0.76, -0.2, 0.82, -0.44, 0.82, -0.6, 0.76, -0.67, 0.5];
    var HEEL = [-0.64, 0.16, -0.28, 0.16, -0.3, 0.38, -0.46, 0.62, -0.62, 0.66, -0.68, 0.46];
    var TOE = [0.36, 0.16, 0.62, 0.16, 0.74, 0.22, 0.7, 0.34, 0.52, 0.43, 0.4, 0.34];
    var parts = [
      P('ii_poly', [0.46, OUT, 0.02], [0, 0, 0], 0x3a3e4a, 'plain'),
      P('ii_poly', [0.5, SOLE, 0.02], [0, 0, 0], 0xf8f8f4, 'plain'),
      P('ii_poly', [0.38, UPPER, 0.05], [0, 0, 0], 0xffc020, 'ch_leather'),
      P('ii_poly', [0.42, HEEL, 0.05], [0, 0, 0], 0xe8900c, 'ch_leather'),
      P('ii_poly', [0.42, TOE, 0.05], [0, 0, 0], 0xe8900c, 'ch_leather'),
      P('sphere', [0.22, 10, 4], [-0.3, 0.86, 0], 0x241408, 'plain', null, [1.25, 0.16, 0.72]),
      P('box', [0.14, 0.24, 0.24], [-0.04, 0.82, 0], 0xffe070, 'ch_leather', [0, 0, -0.35]),
      P('box', [0.1, 0.22, 0.12], [-0.69, 0.74, 0], 0xe8302a, 'plain', [0, 0, 0.2]),
      P('ii_poly', [0.03, BOLT], [-0.04, 0.4, 0.255], 0xffffff, 'plain', [0, 0, -1.25], [0.62, 0.9, 1])
    ];
    for (var i = 0; i < 4; i++) {
      var t = 0.1 + i * 0.25, x = 0.48 - 0.48 * t, y = 0.45 + 0.29 * t + 0.05;
      parts.push(P('box', [0.09, 0.06, 0.46], [x, y, 0], 0xffffff, 'plain', [0, 0, 0.5]));
    }
    item('sneakers', parts, { yaw: 0.38, pitch: 0.45 });
  })();

  // 电插头：灰色插头、两片铜插脚、绕一圈的黑电线，插脚上冒电火花
  item('plug', [
    P('ii_poly', [0.45, rrect(0.5, 0.42, 0.1), 0.04], [0, 0, 0], 0x6c7280, 'plain', [0, PI / 2, 0]),
    P('cyl', [0.12, 0.07, 0.22, 8], [-0.34, 0, 0], 0x3a3e48, 'plain', [0, 0, PI / 2]),
    P('box', [0.34, 0.13, 0.04], [0.4, 0, 0.11], 0xf0c040, 'metal'),
    P('box', [0.34, 0.13, 0.04], [0.4, 0, -0.11], 0xf0c040, 'metal'),
    P('ii_tube', [0.06, 6, 16, 1, -0.42, 0, 0, -0.72, -0.08, 0.1, -0.82, -0.42, 0.3, -0.5, -0.62, 0.42, 0.1, -0.62, 0.35], [0, 0, 0], 0x30343c, 'plain'),
    P('ii_poly', [0.03, BOLT], [0.74, 0.16, 0.05], 0xfff27a, '!plain', [0, 0.4, -0.5], [0.42, 0.5, 1]),
    P('ii_poly', [0.03, BOLT], [0.74, -0.18, 0.0], 0x9ae8ff, '!plain', [0, 0.4, 0.6], [0.36, 0.42, 1]),
    sparkle([0.62, 0.0, 0.1], 0.9, 0.4, 0xfffbe0)
  ], { yaw: 0.4, pitch: 0.3 });

  // 回声碎片：一块紫色水晶碎片 + 两小块碎屑，右边荡开三道发光的回声波纹
  (function () {
    var parts = [
      P('oct', [0.5], [0, 0, 0], 0xc070ff, 'plain', [0, 0.3, 0.32], [0.6, 1.4, 0.5]),
      P('oct', [0.32], [0.02, 0.0, 0.02], 0xf0d0ff, '!plain', [0, 0.3, 0.32], [0.28, 1.0, 0.75]),
      P('tet', [0.16], [-0.42, 0.42, 0.1], 0xa858f0, 'plain', [0.4, 0.2, 0]),
      P('tet', [0.12], [-0.36, -0.5, 0.2], 0xa858f0, 'plain', [1, 0.5, 0])
    ];
    [[0.55, 0xe8c0ff], [0.78, 0xc890ff], [1.0, 0xa060f0]].forEach(function (w) {
      parts.push(P('ii_arc', [w[0], 0.045, 4, 10, 1.3], [0.05, 0, 0], w[1], '!plain', [0, 0.5, -0.65]));
    });
    parts.push(sparkle([-0.3, 0.75, 0.3], 0.9));
    item('echo', parts, { yaw: 0.5, pitch: 0.2 });
  })();

  // 恶魔之刃：弯弯的血红刀身（刃口发红光、刀背两个倒钩）、长着小角的黑护手、红宝石柄头
  (function () {
    var right = [], left = [], edge = [];
    for (var i = 0; i <= 8; i++) {
      var t = i / 8, cx = 0.3 * t * t, cy = 1.3 * t, w = 0.15 * (1 - Math.pow(t, 2.2)) + 0.01;
      right.push(cx + w, cy);
      var hook = (i === 3 || i === 5) ? 0.09 : 0;
      left.push(cx - w * 0.8 - hook, cy + hook * 0.6);
      edge.push(cx + w, cy, cx + w * 0.55, cy);
    }
    var pts = [], ep = [];
    for (i = 0; i <= 8; i++) pts.push(right[i * 2], right[i * 2 + 1]);
    for (i = 7; i >= 0; i--) pts.push(left[i * 2], left[i * 2 + 1]);
    for (i = 0; i < 8; i++) ep.push(edge[i * 4], edge[i * 4 + 1]);
    for (i = 7; i >= 0; i--) ep.push(edge[i * 4 + 2], edge[i * 4 + 3]);
    item('demonblade', xf([
      P('ii_poly', [0.07, pts, 0.015], [0, 0, 0], 0xb81c34, 'metal'),
      P('ii_poly', [0.03, ep], [0, 0, 0.05], 0xff6a4a, '!plain'),
      P('box', [0.46, 0.1, 0.16], [0.02, -0.02, 0], 0x2a1a24, 'metal'),
      P('ii_tube', [[0.08, 0.05, 0.0], 6, 10, 1, -0.2, 0.0, 0, -0.4, 0.08, 0, -0.44, 0.3, 0, -0.36, 0.44, 0], [0, 0, 0], 0xeae2c8, 'bone'),
      P('ii_tube', [[0.08, 0.05, 0.0], 6, 10, 1, 0.24, 0.0, 0, 0.44, 0.08, 0, 0.48, 0.3, 0, 0.4, 0.44, 0], [0, 0, 0], 0xeae2c8, 'bone'),
      P('cyl', [0.055, 0.055, 0.36, 6], [0.02, -0.25, 0], 0x4a1a1a, 'ch_leather'),
      P('oct', [0.1], [0.02, -0.48, 0], 0xff3040, '!plain')
    ], [0, 0, -0.62]), { yaw: 0.3, pitch: 0.2 });
  })();

  // 扳手：开口头 + 梅花环头的银扳手，中间红色胶套
  (function () {
    var jaw = [];
    for (var i = 0; i <= 12; i++) { var a = 0.55 + (PI * 2 - 1.1) * i / 12; jaw.push(Math.cos(a) * 0.27, Math.sin(a) * 0.27); }
    jaw.push(0.06, -0.1, -0.07, -0.1, -0.07, 0.1, 0.06, 0.1);
    item('wrench', xf([
      P('ii_poly', [0.08, jaw, 0.02], [0.66, 0, 0], 0xc4ccd8, 'metal'),
      P('box', [1.0, 0.16, 0.08], [0.0, 0, 0], 0xc4ccd8, 'metal'),
      P('ii_arc', [0.15, 0.07, 6, 12], [-0.62, 0, 0], 0xc4ccd8, 'metal'),
      P('box', [0.46, 0.21, 0.12], [-0.05, 0, 0], 0xd83838, 'plain')
    ], [0, 0, 0.6]), { yaw: 0.3, pitch: 0.3 });
  })();

  // 吸吸磁铁：红色马蹄形磁铁、银色两极，正把两颗经验水晶吸过来
  (function () {
    var U = [], i, a;
    for (i = 0; i <= 12; i++) { a = PI * i / 12; U.push(Math.cos(a) * 0.55, Math.sin(a) * 0.55); }
    U.push(-0.55, -0.45, -0.25, -0.45);
    for (i = 12; i >= 0; i--) { a = PI * i / 12; U.push(Math.cos(a) * 0.25, Math.sin(a) * 0.25); }
    U.push(0.25, -0.45, 0.55, -0.45);
    var mag = [
      P('ii_poly', [0.32, U, 0.03], [0, 0, 0], 0xe8282a, 'plain'),
      P('ii_arc', [0.44, 0.035, 4, 12, PI * 0.8], [0, 0, 0.19], 0xff9a8a, 'plain', [0, 0, PI * 0.1]),
      P('box', [0.32, 0.24, 0.36], [0.4, -0.58, 0], 0xe8eef6, 'metal'),
      P('box', [0.32, 0.24, 0.36], [-0.4, -0.58, 0], 0xe8eef6, 'metal')
    ];
    item('magnet', xf(mag, [0, 0, -0.5], [0, 0.25, 0]).concat(
      crystal([-0.6, -0.72, 0.1], 0.24, 0.1, [0, 0, 0.5]), crystal([0.05, -1.0, 0.05], 0.2, 0.085, [0, 0, -0.3]),
      [P('box', [0.04, 0.2, 0.04], [-0.42, -0.5, 0.1], 0xd8f4ff, '!plain', [0, 0, 0.9]), P('box', [0.04, 0.18, 0.04], [0.08, -0.72, 0.1], 0xd8f4ff, '!plain', [0, 0, 0.3])]
    ), { yaw: 0.35, pitch: 0.3 });
  })();

  // 铁砧：黑铁砧（尖角、抛光的台面）+ 上面一块烧红的铁锭和火星
  item('anvil', [
    P('ii_poly', [0.55, [-0.48, 0, 0.48, 0, 0.3, 0.24, -0.3, 0.24], 0.02], [0, 0, 0], 0x464c58, 'metal'),
    P('box', [0.42, 0.32, 0.38], [0, 0.4, 0], 0x3e4450, 'metal'),
    P('box', [1.1, 0.26, 0.52], [0.05, 0.68, 0], 0x565c6a, 'metal'),
    P('cone', [0.2, 0.55, 6], [-0.74, 0.7, 0], 0x565c6a, 'metal', [0, 0, PI / 2], [1, 1, 0.75]),
    P('box', [1.06, 0.03, 0.5], [0.05, 0.82, 0], 0xaab2c0, 'metal'),
    P('box', [0.5, 0.12, 0.2], [0.12, 0.89, 0.02], 0xff9a20, '!plain'),
    P('box', [0.46, 0.04, 0.16], [0.12, 0.96, 0.02], 0xffe080, '!plain'),
    P('box', [0.05, 0.05, 0.05], [0.42, 1.12, 0.1], 0xffd040, '!plain'),
    P('box', [0.04, 0.04, 0.04], [-0.12, 1.2, 0.0], 0xffa030, '!plain'),
    P('box', [0.04, 0.04, 0.04], [0.2, 1.28, 0.1], 0xffe080, '!plain')
  ], { yaw: 0.45, pitch: 0.3 });

  // 金戒指：粗金戒圈 + 一颗大红宝石，闪一下光
  item('goldring', xf([
    P('ii_arc', [0.42, 0.13, 8, 20], [0, 0, 0], 0xffc632, 'gold'),
    P('cyl', [0.17, 0.11, 0.14, 8], [0, 0.56, 0], 0xffc632, 'gold'),
    P('oct', [0.24], [0, 0.74, 0], 0xff2a40, 'plain', [0, PI / 4, 0], [1, 0.85, 1])
  ], [0, 1.05, 0]).concat([sparkle([0.42, 0.75, 0.3], 1.0)]), { yaw: 0.6, pitch: 0.25 });

  // 灵魂收割者：两团发着淡蓝光的灵魂，拖着弯弯的尾巴
  (function () {
    var wisp = function (k, flip) {
      var s = flip ? -1 : 1;
      return xf([
        P('sphere', [0.3, 10, 8], [0, 0, 0], 0xe0f6ff, 'plain', null, [1, 1.05, 1]),
        P('ii_tube', [[0.27, 0.17, 0.0], 8, 12, 1, 0, -0.05, 0, 0.05 * s, -0.35, -0.05, 0.25 * s, -0.6, -0.1, 0.45 * s, -0.62, -0.15], [0, 0, 0], 0x9ad8ff, '!plain'),
        P('box', [0.07, 0.13, 0.04], [-0.1, 0.03, 0.285], 0x1a2a4a, 'plain'),
        P('box', [0.07, 0.13, 0.04], [0.1, 0.03, 0.285], 0x1a2a4a, 'plain')
      ], [0, 0, 0], null, k);
    };
    item('harvester', xf(wisp(0.75, true), null, [-0.5, 0.35, -0.4]).concat(wisp(1, false), [sparkle([0.48, 0.42, 0.2], 0.8, null, 0xd8f4ff)]), { yaw: 0.35, pitch: 0.2 });
  })();

  // 冰块：两块圆角冰块（亮边、裂纹），闪着光
  item('icecube', [
    P('ii_poly', [0.62, rrect(0.62, 0.62, 0.1, 2), 0.05], [-0.45, 0.36, -0.42], 0x8ad8ff, 'ii_ice', [0.3, 0.5, 0.25]),
    P('ii_poly', [0.86, rrect(0.86, 0.86, 0.12, 2), 0.06], [0.08, 0, 0.1], 0xaef0ff, 'ii_ice', [0.15, -0.35, 0.08]),
    sparkle([0.5, 0.52, 0.5], 0.9),
    sparkle([-0.5, -0.32, 0.5], 0.6)
  ], { yaw: 0.45, pitch: 0.35, zoom: 0.88 });

  // 圣典：厚厚的白皮圣书，金包角、金十字，红色书签垂下来
  item('holybook', [
    P('box', [0.92, 1.2, 0.07], [0, 0, -0.22], 0xf4ead0, 'ch_leather'),
    P('box', [0.92, 1.2, 0.07], [0, 0, 0.22], 0xf4ead0, 'ch_leather'),
    P('box', [0.86, 1.12, 0.38], [0.04, 0, 0], 0xfff8e0, 'ii_pages'),
    P('cyl', [0.24, 0.24, 1.2, 8], [-0.46, 0, 0], 0xe8d8b0, 'ch_leather', null, [0.5, 1, 1]),
    P('box', [0.13, 0.62, 0.05], [0.02, 0.06, 0.26], 0xffcc40, 'gold'),
    P('box', [0.44, 0.13, 0.05], [0.02, 0.2, 0.26], 0xffcc40, 'gold'),
    P('box', [0.86, 0.06, 0.09], [0.0, 0.565, 0.22], GOLD, 'gold'),
    P('box', [0.86, 0.06, 0.09], [0.0, -0.565, 0.22], GOLD, 'gold'),
    P('box', [0.06, 1.18, 0.09], [0.43, 0, 0.22], GOLD, 'gold'),
    P('box', [0.06, 1.18, 0.09], [-0.36, 0, 0.22], GOLD, 'gold'),
    P('box', [0.19, 0.19, 0.1], [0.4, 0.55, 0.22], 0xffe070, 'gold'),
    P('box', [0.19, 0.19, 0.1], [0.4, -0.55, 0.22], 0xffe070, 'gold'),
    P('box', [0.16, 0.06, 0.52], [-0.47, 0.36, 0], GOLD, 'gold'),
    P('box', [0.16, 0.06, 0.52], [-0.47, -0.36, 0], GOLD, 'gold'),
    P('box', [0.07, 0.34, 0.02], [0.18, -0.7, 0.1], 0xd8283a, 'cloth', [0, 0, 0.15]),
    sparkle([0.5, 0.7, 0.4], 0.9, null, 0xfff6c0)
  ], { yaw: 0.5, pitch: 0.25 });

  // 胖胖板甲：圆滚滚的大肚子胸甲（领口金边、胸前一道脊、铆钉）、叠起来的肩甲、皮腰带金扣、下摆两层甲片
  (function () {
    var Z = 0.85, prof = [0.3, -0.6, 0.5, -0.56, 0.66, -0.32, 0.7, -0.02, 0.62, 0.28, 0.46, 0.46, 0.26, 0.56];
    var parts = [
      P('ii_lathe', [16].concat(prof), [0, 0, 0], 0xc8d0dc, 'ch_plate', null, [1, 1, Z]),
      P('cyl', [0.25, 0.25, 0.04, 14], [0, 0.545, 0], 0x14141c, 'plain', null, [1, 1, Z]),
      P('ii_arc', [0.27, 0.045, 6, 18], [0, 0.56, 0], GOLD, 'gold', [PI / 2, 0, 0], [1, Z, 1]),
      P('ii_tube', [0.035, 5, 10, 1, 0, 0.5, 0.36 * Z + 0.02, 0, 0.28, 0.62 * Z + 0.01, 0, -0.02, 0.7 * Z + 0.01, 0, -0.3, 0.66 * Z + 0.01], [0, 0, 0], 0xf0f4fa, 'metal'),
      P('cyl', [0.635, 0.615, 0.13, 16], [0, -0.4, 0], 0x6a3e22, 'ch_leather', null, [1, 1, Z]),
      P('box', [0.18, 0.16, 0.08], [0, -0.4, 0.62 * Z], GOLD, 'gold'),
      P('cyl', [0.5, 0.56, 0.13, 16], [0, -0.64, 0], 0xaab3c0, 'ch_plate', null, [1, 1, Z]),
      P('cyl', [0.54, 0.6, 0.12, 16], [0, -0.76, 0], 0x97a0ae, 'ch_plate', null, [1, 1, Z])
    ];
    [-1, 1].forEach(function (sd) {
      parts.push(P('sphere', [0.3, 10, 6], [sd * 0.58, 0.36, 0], 0xaab3c0, 'ch_plate', [0, 0, -sd * 0.5], [1, 0.55, 1.05]));
      parts.push(P('sphere', [0.25, 10, 6], [sd * 0.68, 0.22, 0], 0x97a0ae, 'ch_plate', [0, 0, -sd * 0.7], [1, 0.5, 1]));
      parts.push(P('sphere', [0.035, 4, 3], [sd * 0.3, 0.3, 0.5 * Z + 0.07], 0x6a7280, 'metal'));
      parts.push(P('sphere', [0.035, 4, 3], [sd * 0.42, 0.05, 0.62 * Z + 0.06], 0x6a7280, 'metal'));
    });
    item('chonk', parts, { yaw: 0.35, pitch: 0.38 });
  })();

  // 超能台灯：黄色台灯（底座、两节灯臂、灯罩），灯罩口的灯泡发着强光往右下照
  (function () {
    var th = 0.8, ax = -Math.sin(th), ay = Math.cos(th);     // 灯罩尖朝左上，口朝右下
    var tip = [0.36, 1.05], o = [tip[0] - ax * 0.36, tip[1] - ay * 0.36];
    var parts = [
      P('cyl', [0.36, 0.42, 0.12, 12], [0, 0.06, 0], 0xffd23a, 'metal'),
      P('cyl', [0.43, 0.43, 0.03, 12], [0, 0.01, 0], 0xb88a1a, 'metal'),
      rod('cyl', [0, 0.1, 0], [-0.26, 0.74, 0], [0.055, 0.05, 6], 0xffd23a, 'metal'),
      P('sphere', [0.085, 8, 6], [-0.26, 0.76, 0], 0x4a4e5a, 'metal'),
      rod('cyl', [-0.26, 0.76, 0], [tip[0], tip[1], 0], [0.05, 0.045, 6], 0xffd23a, 'metal'),
      P('sphere', [0.07, 8, 6], [tip[0], tip[1], 0], 0x4a4e5a, 'metal')
    ].concat(xf([
      P('ii_lathe', [12, 0.06, 0.36, 0.17, 0.26, 0.34, 0.0, 0.31, 0.0, 0.15, 0.24, 0.05, 0.32], [0, 0, 0], 0xffd23a, 'metal'),
      P('sphere', [0.15, 8, 6], [0, 0.06, 0], 0xfffbe0, '!plain')
    ], [0, 0, th], [o[0], o[1], 0]));
    [-0.42, 0, 0.42].forEach(function (d) {
      var a = Math.atan2(-ay, -ax) + d, s0 = 0.26, s1 = d ? 0.55 : 0.68;
      parts.push(rod('box', [o[0] + Math.cos(a) * s0, o[1] + Math.sin(a) * s0, 0.05], [o[0] + Math.cos(a) * s1, o[1] + Math.sin(a) * s1, 0.05], [0.05, 0.05], 0xfff27a, '!plain'));
    });
    parts.push(sparkle([0.95, 0.95, 0.1], 0.7, 0.45, 0xfffbe0));
    item('lamp', parts, { yaw: 0.45, pitch: 0.25 });
  })();

  // 巨型叉子：亮银叉头四根叉齿 + 木柄，斜着放
  item('fork', xf([
    P('box', [0.46, 0.18, 0.07], [0, 0.66, 0], 0xdfe6ee, 'metal'),
    P('box', [0.075, 0.5, 0.07], [-0.19, 0.98, 0], 0xdfe6ee, 'metal'),
    P('box', [0.075, 0.5, 0.07], [-0.063, 0.98, 0], 0xdfe6ee, 'metal'),
    P('box', [0.075, 0.5, 0.07], [0.063, 0.98, 0], 0xdfe6ee, 'metal'),
    P('box', [0.075, 0.5, 0.07], [0.19, 0.98, 0], 0xdfe6ee, 'metal'),
    P('cyl', [0.12, 0.06, 0.3, 6], [0, 0.44, 0], 0xdfe6ee, 'metal', null, [1, 1, 0.55]),
    P('ii_poly', [0.12, [-0.06, 0.3, 0.06, 0.3, 0.13, -0.5, 0.1, -0.62, -0.1, -0.62, -0.13, -0.5], 0.02], [0, 0, 0], 0x9a4a2a, 'wood'),
    P('cyl', [0.04, 0.04, 0.14, 6], [0, -0.45, 0], GOLD, 'gold', [PI / 2, 0, 0])
  ], [0, 0, -0.65]), { yaw: 0.3, pitch: 0.25 });

  // 龙火：一颗带鳞片的红色龙蛋（发光的裂纹），泡在火里
  item('dragonfire', [
    P('ii_lathe', [12, 0, 0, 0.25, 0.03, 0.38, 0.15, 0.42, 0.35, 0.38, 0.6, 0.27, 0.82, 0.12, 0.95, 0, 0.98], [0, 0.05, 0], 0xd84a20, 'scale'),
    P('ii_poly', [0.03, [0, 0, 0.08, 0.12, 0.0, 0.22, 0.1, 0.36, 0.04, 0.36, -0.05, 0.22, 0.03, 0.12, -0.04, 0.0]], [Math.sin(0.45) * 0.42, 0.42, Math.cos(0.45) * 0.42], 0xffe060, '!plain', [0, 0.45, 0]),
    P('cyl', [0.36, 0.42, 0.05, 10], [0, 0.03, 0], 0xff8a20, '!plain')
  ].concat(flame([-0.36, 0.0, 0.18], 0.7, 0.5), flame([0.38, 0.0, 0.1], 0.62, 0.5), flame([0.0, 0.0, 0.42], 0.5, 0.5), flame([-0.1, 0.0, -0.3], 0.9, 0.5)), { yaw: 0.5, pitch: 0.3 });

  // 小蛇：盘成一圈的绿蛇（菱形花纹），抬着头吐红信子
  (function () {
    var path = [];
    for (var i = 0; i <= 14; i++) {
      var t = i / 14, a = -0.4 + t * PI * 3.4, r = 0.6 - t * 0.18;
      path.push(Math.sin(a) * r, 0.1 + t * 0.32, Math.cos(a) * r);
    }
    path.push(0.05, 0.58, 0.02, 0.0, 0.82, 0.2);
    item('snek', [
      P('ii_tube', [[0.02, 0.1, 0.14, 0.15, 0.15, 0.13], 7, 40, 5].concat(path), [0, 0, 0], 0x4ad95a, 'ii_snake'),
      P('sphere', [0.2, 10, 8], [0, 0.88, 0.32], 0x4ad95a, 'ii_snake', null, [1.05, 0.72, 1.35]),
      P('sphere', [0.06, 6, 4], [-0.11, 0.97, 0.4], 0xffe23a, '!plain'),
      P('sphere', [0.06, 6, 4], [0.11, 0.97, 0.4], 0xffe23a, '!plain'),
      P('box', [0.025, 0.07, 0.03], [-0.11, 0.97, 0.455], 0x101010, 'plain'),
      P('box', [0.025, 0.07, 0.03], [0.11, 0.97, 0.455], 0x101010, 'plain'),
      P('box', [0.035, 0.02, 0.2], [0, 0.84, 0.66], 0xff2a3a, 'plain'),
      P('box', [0.03, 0.02, 0.1], [-0.035, 0.84, 0.8], 0xff2a3a, 'plain', [0, -0.5, 0]),
      P('box', [0.03, 0.02, 0.1], [0.035, 0.84, 0.8], 0xff2a3a, 'plain', [0, 0.5, 0])
    ], { yaw: 0.4, pitch: 0.4 });
  })();

  // 速度小子：天蓝色的纸飞机（中间一道折痕），斜着往右上冲，后面拖着几道速度线
  (function () {
    var N = [1.0, 0.02, 0], T = [-0.62, 0.04, 0], Lw = [-0.74, 0.12, -0.6], Rw = [-0.74, 0.12, 0.6], K = [-0.55, -0.26, 0];
    item('speedboi', xf([
      P('ii_tris', N.concat(T, Lw), [0, 0, 0], 0x2aa8ec, 'plain'),
      P('ii_tris', N.concat(Rw, T), [0, 0, 0], 0x4ac0f4, 'plain'),
      P('ii_tris', N.concat(K, T), [0, 0, 0], 0x1a6ab0, 'plain'),
      rod('box', [0.95, 0.04, 0], [-0.6, 0.06, 0], [0.025, 0.025], 0x1a5a9a, 'plain'),
      P('box', [0.6, 0.05, 0.05], [-1.1, 0.1, 0.32], 0xd8f8ff, '!plain'),
      P('box', [0.45, 0.05, 0.05], [-1.12, -0.12, 0.0], 0x8ae8ff, '!plain'),
      P('box', [0.55, 0.05, 0.05], [-1.05, 0.16, -0.34], 0xd8f8ff, '!plain')
    ], [0.15, 0.55, 0.3]), { yaw: 0.45, pitch: 0.7, zoom: 0.94 });
  })();

  // 大棒槌：大木槌（铁箍、浅色截面）+ 长木柄，敲出一颗黄色冲击星
  item('bigbonk', xf([
    P('cyl', [0.32, 0.32, 0.86, 12], [0, 0.72, 0], 0xc8863a, 'wood', [0, 0, PI / 2]),
    P('cyl', [0.335, 0.335, 0.08, 12], [-0.3, 0.72, 0], 0x4a4e58, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.335, 0.335, 0.08, 12], [0.3, 0.72, 0], 0x4a4e58, 'metal', [0, 0, PI / 2]),
    P('cyl', [0.27, 0.27, 0.02, 12], [-0.435, 0.72, 0], 0xf0c88a, 'wood', [0, 0, PI / 2]),
    P('cyl', [0.07, 0.07, 1.2, 6], [0, 0.0, 0], 0x8a5a2e, 'wood'),
    P('cyl', [0.085, 0.085, 0.36, 6], [0, -0.45, 0], 0x5a3a22, 'ch_leather'),
    P('sphere', [0.1, 6, 4], [0, -0.66, 0], 0x5a3a22, 'ch_leather'),
    P('ii_poly', [0.04, star(6, 0.34, 0.15, 0.2)], [-0.82, 0.8, 0.0], 0xffe040, '!plain', [0, 0.3, 0]),
    P('ii_poly', [0.04, star(6, 0.18, 0.08, 0.2)], [-0.82, 0.8, 0.04], 0xfffbe0, '!plain', [0, 0.3, 0])
  ], [0, 0, -0.55]), { yaw: 0.3, pitch: 0.25 });

  // 时间停止：金怀表（白表盘、黑指针）、表冠、提环和一小段表链
  (function () {
    var parts = [
      P('cyl', [0.55, 0.55, 0.18, 16], [0, 0, 0], 0xffc83a, 'gold', [PI / 2, 0, 0]),
      P('ii_arc', [0.5, 0.055, 6, 20], [0, 0, 0.09], 0xffe070, 'gold'),
      P('cyl', [0.46, 0.46, 0.02, 16], [0, 0, 0.1], 0xfffbf0, 'ii_clock', [PI / 2, 0, 0]),
      P('box', [0.05, 0.24, 0.02], [-0.06, 0.09, 0.12], 0x1a1a24, 'plain', [0, 0, 0.6]),
      P('box', [0.04, 0.36, 0.02], [0.08, 0.15, 0.12], 0x1a1a24, 'plain', [0, 0, -0.45]),
      P('cyl', [0.045, 0.045, 0.04, 8], [0, 0, 0.125], 0xd99a20, 'gold', [PI / 2, 0, 0]),
      P('cyl', [0.07, 0.07, 0.14, 8], [0, 0.6, 0], 0xffc83a, 'gold'),
      P('cyl', [0.1, 0.1, 0.09, 8], [0, 0.7, 0], 0xd99a20, 'gold'),
      P('ii_arc', [0.15, 0.04, 5, 12], [0, 0.86, 0], 0xffc83a, 'gold')
    ];
    for (var i = 0; i < 4; i++) parts.push(P('ii_arc', [0.075, 0.025, 4, 8], [0.2 + i * 0.13, 0.95 - i * 0.05 - i * i * 0.03, 0], 0xffd860, 'gold', [i % 2 ? PI / 2 : 0, 0, 0]));
    item('zawarudo', parts, { yaw: 0.3, pitch: 0.15 });
  })();
})();
