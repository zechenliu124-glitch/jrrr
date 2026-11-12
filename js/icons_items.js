'use strict';
// ============================================================
//  宝物图标：36 件宝物各自画成它说明里的那个东西（磨刀石、护膝、望远镜……）
//  和游戏里的模型一样用低多边形零件 + 像素贴图 + 光照，由 ICONS 渲染成 36px 小图
//  零件格式和 MODEL.build 一样：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图名, 平面投影]
//  贴图名前面加 '!' 表示发光零件（不吃光照：火苗、发光的玻璃、闪电、圣杯的光）
//  ICONS.model 定义图标（名字 'i_<id>'），ICONS.use 对应到游戏 id；稀有度不进图标（只在卡片边框上）
// ============================================================
(function () {
  var PI = Math.PI;

  // ---------------- 小贴图（名字都以 ii_ 开头，脚本加载时注册） ----------------
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就用默认贴图 */ } };
  // 错开的小片（第 11 块以前的贴图都留着、顺序不动：贴图按注册顺序取共用的随机数）
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
  // 卡面：斜着一道浅色光泽 + 细花纹
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

  // ---------------- 第 11 块新加的贴图：不调用 r()，用自己的整数哈希（共用的随机数顺序不变，后面注册的贴图照旧） ----------------
  var hash = function (x, y, k) {
    var h = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263) + Math.imul(k + 1, 1274126177)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  // 硬面包皮：烤得深一点的边 + 3×3 个小孔
  add('ii_crust', function (x, y) {
    var v = 224 + hash(x, y, 1) * 18, dot = function (q) { return q === 3 || q === 8 || q === 12; };
    if (x === 0 || y === 0 || x === 15 || y === 15) v -= 24;
    if (dot(x) && dot(y)) v = 150;
    return v;
  });
  // 平安符上的布片（彩色）：红底、金边、金色的「安」字
  var AN = [
    '################',
    '#......##......#',
    '#.############.#',
    '#.##........##.#',
    '#.##...##...##.#',
    '#.....##.......#',
    '#....##.....#..#',
    '#.############.#',
    '#...##.....##..#',
    '#..##.....##...#',
    '#..####..##....#',
    '#.....####.....#',
    '#.....#####....#',
    '#...###...###..#',
    '#.###.......##.#',
    '################'
  ];
  add('ii_an', function (x, y) { return AN[y].charAt(x) === '#' ? [255, 204, 72] : [208, 44, 48]; });
  // 羊皮纸：浅底 + 几圈淡淡的等高线
  add('ii_parch', function (x, y) {
    var v = 236 + hash(x, y, 2) * 12;
    var d1 = Math.sqrt((x - 4.5) * (x - 4.5) + (y - 5) * (y - 5)), d2 = Math.sqrt((x - 12) * (x - 12) + (y - 11.5) * (y - 11.5));
    if (Math.abs(d1 - 2.4) < 0.5 || Math.abs(d1 - 4.8) < 0.5 || Math.abs(d2 - 2.3) < 0.5) v = 196;
    return v;
  });
  // 蓝图（彩色）：蓝底、浅蓝格子、白线画的一把剑（斜着，剑尖朝右上）
  add('ii_blue', function (x, y) {
    var s = x + y, d = x - y;
    if ((x >= 6 && x <= 13 && (s === 14 || s === 16)) || (s === 15 && (x === 14 || (x >= 2 && x <= 4))) || (d === -5 && Math.abs(s - 15) <= 3)) return [236, 244, 255];
    if (x === 0 || y === 0 || x === 8 || y === 8) return [92, 142, 220];
    return [50, 96, 184];
  });
  // 戒尺（彩色）：木头底 + 上沿一排红色刻度（长、中、短三种）
  add('ii_ruler', function (x, y) {
    var tick = x % 8 === 1 ? 12 : x % 4 === 1 ? 8 : x % 2 === 1 ? 5 : 0;
    if (y < tick) return [196, 40, 40];
    var g = 196 + ((x * 3 + (y >> 2)) % 5) * 4 + hash(x, y, 3) * 8;
    return [g, g * 0.79, g * 0.5];
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

  // 局部球面（半球顶、兜帽）：[半径, 横分段, 竖分段, phi 起点, phi 长度, theta 起点, theta 长度]
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
  // 心形：尖在原点，往 +y 长，k 是大小
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
  // parts 也可以是函数（渲染时才拿零件表：家族徽章要等纹章的盾）
  function item(id, parts, opts) {
    ICONS.model('i_' + id, typeof parts === 'function' ? function () { return mk(parts())(); } : mk(parts), opts);
    ICONS.use('item', id, 'i_' + id);
  }

  // ---------------- 常用颜色 ----------------
  var GOLD = 0xffc83a, GOLD_D = 0xd99a20, WOOD_L = 0xd8a060, WHITE = 0xf6f4ee;

  // ---------------- 宝物图标用的小工具 ----------------
  var QA = new THREE.Quaternion(), VA = new THREE.Vector3(), EA = new THREE.Euler();
  // 零件的 +y 转到指向 dir（锥子、钉子、杆子）
  function toward(type, s, pos, dir, c, t, sc) {
    VA.set(dir[0], dir[1], dir[2]).normalize();
    QA.setFromUnitVectors(UP, VA); EA.setFromQuaternion(QA);
    return P(type, s, pos, c, t, [EA.x, EA.y, EA.z], sc);
  }
  // 圆（逆时针点列）
  function circle(n, r, cx, cy) {
    var o = [];
    for (var i = 0; i < n; i++) { var a = PI * 2 * i / n; o.push((cx || 0) + Math.cos(a) * r, (cy || 0) + Math.sin(a) * r); }
    return o;
  }
  // 从 a 到 b、半宽 hw 的一条带子（绶带、条纹）
  function strip(a, b, hw) {
    var dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L * hw, ny = dx / L * hw;
    return [a[0] + nx, a[1] + ny, a[0] - nx, a[1] - ny, b[0] - nx, b[1] - ny, b[0] + nx, b[1] + ny];
  }
  // 云朵：平底 + 几个圆鼓包 [[cx, cy, r], ...]
  function cloudPts(bumps, n) {
    var x0 = 1e9, x1 = -1e9, out = [], i;
    bumps.forEach(function (b) { x0 = Math.min(x0, b[0] - b[2]); x1 = Math.max(x1, b[0] + b[2]); });
    out.push(x0, 0, x1, 0);
    for (i = 1; i < n; i++) {
      var x = x1 + (x0 - x1) * i / n, top = 0;
      bumps.forEach(function (b) { var d = x - b[0]; if (Math.abs(d) < b[2]) top = Math.max(top, b[1] + Math.sqrt(b[2] * b[2] - d * d)); });
      out.push(x, top);
    }
    return out;
  }
  // 圆角竖立的小水滴（旋转体，尖朝上）
  function drop(k) { return [8, 0, 0, 0.08 * k, 0.025 * k, 0.1 * k, 0.08 * k, 0.075 * k, 0.16 * k, 0.035 * k, 0.23 * k, 0, 0.27 * k]; }

  // 常用颜色（宝物）
  var IRON = 0x6a707c, STEEL = 0xdfe6ee, BRASS = 0xd9a64a, BRASS_D = 0xb07a2a, LEATHER = 0x6a3e22, WOOD = 0x8a5a30;
  var RED = 0xd83a3a, CREAM = 0xf4ecd8, INK = 0x2a1a10;

  // ============================================================
  //  36 件宝物（普通 → 传说）。稀有度只画在卡片边框和格子上，图标里不用稀有度的颜色
  // ============================================================

  // 磨刀石：两层灰色长条石头斜放（上层浅），顶上一道亮光和一滴水
  item('whetstone', [
    P('box', [1.3, 0.16, 0.42], [0, 0, 0], 0x3a424c, 'rock'),
    P('box', [1.3, 0.15, 0.42], [0, 0.155, 0], 0x66707a, 'rock'),
    P('box', [1.06, 0.02, 0.1], [-0.04, 0.235, 0.08], 0xc0c8d2, 'plain'),
    sparkle([0.36, 0.3, 0.12], 0.8, 0.5),
    P('ii_lathe', drop(1.3), [-0.3, 0.23, 0.08], 0x4ab0ff, 'plain', [0, 0, -0.42]),
    P('sphere', [0.035, 6, 4], [-0.31, 0.36, 0.17], 0xffffff, 'plain')
  ], { yaw: 0.5, pitch: 0.55, tilt: 0.3, zoom: 1.05 });

  // 护膝：两块鼓起来的皮护膝（中间一块浅色皮、四颗铁钉、上下两根绑带）
  (function () {
    var pad = function (ry, pos) {
      var parts = [
        P('sphere', [0.4, 10, 8], [0, 0, 0], 0xa07a52, 'ch_leather', null, [0.85, 1.2, 0.45]),
        P('sphere', [0.25, 8, 6], [0, 0.02, 0.1], 0x6a4a2e, 'ch_leather', null, [0.95, 1.0, 0.45]),
        P('box', [1.0, 0.13, 0.08], [0, 0.3, -0.04], 0x3a2414, 'ch_leather'),
        P('box', [1.0, 0.13, 0.08], [0, -0.3, -0.04], 0x3a2414, 'ch_leather'),
        P('box', [0.08, 0.17, 0.11], [0.46, 0.3, -0.02], 0xb8bec8, 'metal'),
        P('box', [0.08, 0.17, 0.11], [0.46, -0.3, -0.02], 0xb8bec8, 'metal')
      ];
      [[-0.19, 0.17], [0.19, 0.17], [-0.19, -0.15], [0.19, -0.15]].forEach(function (n) {
        parts.push(P('oct', [0.055], [n[0], n[1], 0.15], 0xe0e4ea, 'metal'));
      });
      return xf(parts, [0, ry, 0], pos);
    };
    item('kneepads', pad(0.35, [-0.36, 0.1, -0.16]).concat(pad(-0.1, [0.34, -0.08, 0.12])), { yaw: 0.3, pitch: 0.2, zoom: 1.0 });
  })();

  // 望远镜：三节黄铜筒（最粗那节包皮），粗头的镜片一点蓝光
  item('spyglass', [
    P('cyl', [0.1, 0.1, 0.46, 10], [0, -0.52, 0], BRASS, 'gold'),
    P('cyl', [0.125, 0.125, 0.07, 10], [0, -0.76, 0], BRASS_D, 'gold'),
    P('cyl', [0.08, 0.09, 0.08, 8], [0, -0.83, 0], 0x4a2c14, 'plain'),
    P('cyl', [0.145, 0.145, 0.5, 10], [0, -0.06, 0], BRASS, 'gold'),
    P('cyl', [0.165, 0.165, 0.06, 10], [0, -0.3, 0], BRASS_D, 'gold'),
    P('cyl', [0.2, 0.2, 0.62, 12], [0, 0.5, 0], BRASS, 'gold'),
    P('cyl', [0.207, 0.207, 0.3, 12], [0, 0.46, 0], 0x5a3418, 'ch_leather'),
    P('cyl', [0.215, 0.215, 0.07, 12], [0, 0.2, 0], BRASS_D, 'gold'),
    P('cyl', [0.225, 0.225, 0.09, 12], [0, 0.82, 0], BRASS_D, 'gold'),
    P('cyl', [0.17, 0.17, 0.02, 12], [0, 0.87, 0], 0x6ac8ff, '!plain'),
    P('sphere', [0.045, 6, 4], [-0.05, 0.885, 0.06], 0xffffff, '!plain', null, [1, 0.4, 1])
  ], { tilt: -0.85, yaw: 0.5, pitch: 0.3, zoom: 1.1 });

  // 火绒盒：打开的小铁盒（盖子往后翻开），里面一团火绒冒着小火苗，旁边一块火石
  item('tinderbox', [
    P('box', [0.8, 0.28, 0.55], [0, 0.14, 0], IRON, 'metal'),
    P('box', [0.84, 0.04, 0.59], [0, 0.29, 0], 0x9aa0aa, 'metal'),
    P('box', [0.72, 0.02, 0.47], [0, 0.305, 0], 0x2a2420, 'plain'),
    P('box', [0.84, 0.04, 0.59], [0, 0.567, -0.375], IRON, 'metal', [-1.92, 0, 0]),
    P('box', [0.7, 0.02, 0.45], [0, 0.56, -0.35], 0x9aa0aa, 'metal', [-1.92, 0, 0]),
    P('sphere', [0.15, 8, 6], [-0.16, 0.33, 0.02], 0xc8a060, 'fur', null, [1, 0.6, 1]),
    P('sphere', [0.14, 8, 6], [0.06, 0.34, 0.07], 0xd8b070, 'fur', null, [1, 0.6, 1]),
    P('sphere', [0.13, 8, 6], [0.2, 0.33, -0.08], 0xc8a060, 'fur', null, [1, 0.6, 1]),
    P('dodec', [0.15], [0.56, 0.1, 0.28], 0x8a8e96, 'rock', [0.4, 0.7, 0], [1.25, 0.75, 1])
  ].concat(flame([0.0, 0.38, 0.04], 0.5, 0.5)), { yaw: 0.5, pitch: 0.45, zoom: 0.88 });

  // 铜号角：绕一圈的黄铜管（右上是号嘴，右下是喇叭口），挂一根红绳和红流苏
  item('bugle', [
    P('ii_tube', [[0.04, 0.045, 0.055, 0.065, 0.07], 6, 24, 1, 0.56, 0.3, 0, -0.25, 0.3, 0, -0.56, 0.1, 0, -0.3, -0.1, 0, 0.42, -0.1, 0], [0, 0, 0], BRASS, 'gold'),
    P('ii_lathe', [12, 0.07, 0, 0.08, 0.1, 0.11, 0.2, 0.17, 0.28, 0.28, 0.34], [0.4, -0.1, 0], BRASS, 'gold', [0, 0, -PI / 2]),
    P('ii_lathe', [12, 0.26, 0.34, 0.16, 0.29, 0.1, 0.21, 0.07, 0.1], [0.4, -0.1, 0], 0x8a5a20, 'gold', [0, 0, -PI / 2]),
    P('cyl', [0.065, 0.035, 0.14, 8], [0.62, 0.3, 0], 0xe8c070, 'gold', [0, 0, -PI / 2]),
    P('ii_tube', [0.03, 5, 12, 1, -0.32, 0.3, 0.06, -0.4, -0.2, 0.12, -0.22, -0.38, 0.12, 0.16, -0.12, 0.07], [0, 0, 0], RED, 'cloth'),
    P('sphere', [0.055, 6, 4], [-0.24, -0.39, 0.12], 0xb02020, 'cloth'),
    P('cone', [0.09, 0.24, 6], [-0.24, -0.55, 0.12], RED, 'cloth')
  ], { yaw: 0.3, pitch: 0.3, zoom: 1.0 });

  // 圣徽：银色圆徽章（内圈细线、金十字）挂在交叉的蓝白绶带上
  (function () {
    var parts = [
      P('cyl', [0.42, 0.42, 0.08, 18], [0, 0, 0], 0xe8e8f0, 'metal', [PI / 2, 0, 0]),
      P('ii_arc', [0.42, 0.045, 5, 24], [0, 0, 0], 0xa8b0bc, 'metal'),
      P('ii_arc', [0.3, 0.018, 4, 20], [0, 0, 0.045], 0xb8c0cc, 'metal'),
      P('box', [0.11, 0.44, 0.06], [0, -0.02, 0.06], GOLD, 'gold'),
      P('box', [0.32, 0.11, 0.06], [0, 0.07, 0.06], GOLD, 'gold'),
      P('ii_arc', [0.07, 0.025, 4, 10], [0, 0.48, 0], 0xc8d0da, 'metal')
    ];
    [[-1, -0.03], [1, -0.06]].forEach(function (s) {
      var a = [0.03 * s[0], 0.5], b = [0.42 * s[0], 1.1];
      parts.push(P('ii_poly', [0.03, strip(a, b, 0.1)], [0, 0, s[1]], 0x3a6ad8, 'cloth'));
      parts.push(P('ii_poly', [0.03, strip(a, b, 0.032)], [0, 0, s[1] + 0.02], 0xf4f4f8, 'plain'));
    });
    item('holymedal', parts, { yaw: 0.25, pitch: 0.15, zoom: 1.0 });
  })();

  // 开锁钩：一把小铜挂锁，锁眼里插着两根铁钩（钩杆和箍沿用旧钥匙图标的匙杆、箍，换成铁色，不要金匙环和匙齿）
  (function () {
    var pick = function (len, curl) {   // 沿 +x 长，外头是弯起来的把手
      var hook = curl ? [len, 0, 0, len + 0.12, 0.03, 0, len + 0.16, 0.14, 0, len + 0.06, 0.2, 0, len - 0.02, 0.12, 0]
        : [len, 0, 0, len + 0.08, 0.02, 0, len + 0.1, -0.12, 0, len + 0.1, -0.22, 0];
      return [
        P('cyl', [0.035, 0.035, len, 6], [len / 2, 0, 0], IRON, 'metal', [0, 0, PI / 2]),
        P('cyl', [0.065, 0.065, 0.08, 8], [len * 0.7, 0, 0], 0x9aa0aa, 'metal', [0, 0, PI / 2]),
        P('ii_tube', [0.035, 5, 10, 1].concat(hook), [0, 0, 0], IRON, 'metal')
      ];
    };
    item('lockpick', [
      P('ii_poly', [0.28, rrect(0.72, 0.62, 0.12), 0.03], [0, 0, 0], 0xc8963a, 'gold'),
      P('ii_arc', [0.22, 0.055, 6, 14, PI], [0, 0.3, 0], 0xc8d0da, 'metal'),
      P('cyl', [0.055, 0.055, 0.1, 6], [-0.22, 0.3, 0], 0xc8d0da, 'metal'),
      P('cyl', [0.055, 0.055, 0.1, 6], [0.22, 0.3, 0], 0xc8d0da, 'metal'),
      P('cyl', [0.065, 0.065, 0.02, 10], [0, 0.04, 0.175], INK, 'plain', [PI / 2, 0, 0]),
      P('box', [0.05, 0.14, 0.02], [0, -0.06, 0.175], INK, 'plain')
    ].concat(xf(pick(0.62, true), [0, -0.5, -0.55], [0, 0.02, 0.18]), xf(pick(0.56, false), [0, -0.7, -0.95], [0, -0.04, 0.18])),
    { yaw: 0.35, pitch: 0.25, zoom: 1.05 });
  })();

  // 硬面包：方方正正的一块硬面包（烤深的底、顶上一格格小孔），右后角被咬掉三口
  (function () {
    var s = 0.5, c = 0.07, pts = [-s + c, -s, s - c, -s, s, -s + c, s, -0.06], A = [s, -0.06], B = [-0.06, s], i;
    for (i = 1; i < 15; i++) {
      var t = i / 15, k = 0.2 * Math.sin(PI * t) + 0.07 * Math.sin(PI * ((t * 3) % 1));
      pts.push(A[0] + (B[0] - A[0]) * t - k * 0.707, A[1] + (B[1] - A[1]) * t - k * 0.707);
    }
    pts.push(B[0], B[1], -s + c, s, -s, s - c, -s, -s + c);
    item('hardtack', [
      P('ii_poly', [0.1, pts, 0.03], [0, -0.13, 0], 0x7a4a24, 'ii_crust', [-PI / 2, 0, 0]),
      P('ii_poly', [0.22, pts, 0.04], [0, 0.04, 0], 0xc08a50, 'ii_crust', [-PI / 2, 0, 0])
    ], { yaw: 0.45, pitch: 0.6, zoom: 0.82 });
  })();

  // 三角小旗：木杆（金色杆头）上一面红白两色的三角旗，旗尾往后飘
  (function () {
    var near = [P('ii_poly', [0.03, [0, 0.8, 0, 0.5, 0.5, 0.5, 0.5, 0.65]], [0, 0, 0], 0xe84a4a, 'cloth'),
      P('ii_poly', [0.03, [0, 0.5, 0, 0.2, 0.5, 0.35, 0.5, 0.5]], [0, 0, 0], 0xf4f4f8, 'cloth')];
    var far = [P('ii_poly', [0.03, [0, 0.65, 0, 0.5, 0.52, 0.5]], [0, 0, 0], 0xe84a4a, 'cloth'),
      P('ii_poly', [0.03, [0, 0.5, 0, 0.35, 0.52, 0.5]], [0, 0, 0], 0xf4f4f8, 'cloth')];
    item('pennant', [
      P('cyl', [0.035, 0.04, 1.5, 6], [-0.02, 0.05, 0], WOOD, 'wood'),
      P('sphere', [0.075, 8, 6], [-0.02, 0.84, 0], GOLD, 'gold')
    ].concat(xf(near, [0, -0.15, 0], [0.01, 0, 0]), xf(far, [0, 0.4, 0], [0.49, 0, -0.08])), { yaw: 0.25, pitch: 0.15, tilt: 0.2, zoom: 1.1 });
  })();

  // 滑雪蜡：一小圆罐蜡（白色细标签，罐里是黄白色的蜡，盖子立在后面）+ 一块叠起来的擦布
  item('skiwax', [
    P('cyl', [0.38, 0.38, 0.28, 16], [0, 0.14, 0], 0x2a7ad0, 'metal'),
    P('cyl', [0.385, 0.385, 0.06, 16], [0, 0.14, 0], 0xf4f4f8, 'plain'),
    P('cyl', [0.34, 0.34, 0.02, 16], [0, 0.285, 0], 0x1a3a6a, 'plain'),
    P('cyl', [0.29, 0.29, 0.04, 16], [0, 0.29, 0], 0xe8d890, 'plain'),
    P('cyl', [0.34, 0.34, 0.07, 16], [0.2, 0.36, -0.4], 0x2a7ad0, 'metal', [1.1, 0, -0.2]),
    P('cyl', [0.17, 0.17, 0.02, 14], [0.205, 0.39, -0.365], 0xf4f4f8, 'plain', [1.1, 0, -0.2]),
    P('box', [0.56, 0.06, 0.44], [-0.46, 0.03, 0.34], 0xe8783a, 'cloth', [0, 0.4, 0]),
    P('box', [0.46, 0.05, 0.36], [-0.44, 0.085, 0.32], 0xf09a5a, 'cloth', [0, 0.25, 0.06])
  ], { yaw: 0.45, pitch: 0.42, zoom: 0.94 });

  // 铁蒺藜袋：倒下的小布袋（袋口扎绳），口里撒出三颗四个尖的铁蒺藜
  (function () {
    var sack = [
      P('ii_lathe', [8, 0, 0, 0.32, 0.03, 0.44, 0.16, 0.46, 0.36, 0.36, 0.54, 0.14, 0.68, 0.13, 0.74, 0, 0.74], [0, 0, 0], 0xc8a870, 'cloth', null, [1, 1, 0.7]),
      P('ii_arc', [0.13, 0.05, 4, 12], [0, 0.72, 0], 0xc83a2a, 'plain', [PI / 2, 0, 0], [1, 0.7, 1])
    ];
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * PI * 2 + 0.3;
      sack.push(toward('cone', [0.09, 0.3, 4], [Math.cos(a) * 0.1, 0.86, Math.sin(a) * 0.07], [Math.cos(a) * 0.7, 1, Math.sin(a) * 0.5], k % 2 ? 0xb8985e : 0xd0b07a, 'cloth'));
    }
    var parts = xf(sack, [0.1, 0.35, -1.3], [-0.72, 0.45, -0.1], 1.35);
    [[0.4, 0.13, 0.28, 0.3], [0.66, 0.13, -0.12, 1.2], [0.76, 0.13, 0.4, 2.1]].forEach(function (c) {
      var dirs = [[0, 1, 0]];
      for (var k = 0; k < 3; k++) { var a = c[3] + k * PI * 2 / 3; dirs.push([Math.cos(a) * 0.943, -0.333, Math.sin(a) * 0.943]); }
      dirs.forEach(function (d, k) {
        parts.push(toward('cone', [0.07, 0.3, 4], [c[0] + d[0] * 0.15, c[1] + d[1] * 0.15, c[2] + d[2] * 0.15], d, k ? 0x8a8e96 : 0xb0b6c0, 'metal'));
      });
    });
    item('caltrops', parts, { yaw: 0.4, pitch: 0.4, zoom: 1.0 });
  })();

  // 银马镫：银色拱形马镫（踏板上三道防滑棱），顶上的皮带穿过扣眼，带一个金扣
  item('stirrup', [
    P('ii_arc', [0.38, 0.06, 5, 14, PI], [0, 0.1, 0], 0xd0d8e0, 'metal'),
    rod('cyl', [-0.38, 0.1, 0], [-0.44, -0.42, 0], [0.06, 0.06, 6], 0xd0d8e0, 'metal'),
    rod('cyl', [0.38, 0.1, 0], [0.44, -0.42, 0], [0.06, 0.06, 6], 0xd0d8e0, 'metal'),
    P('box', [1.02, 0.08, 0.38], [0, -0.46, 0], 0xb8c0cc, 'metal'),
    P('box', [0.86, 0.03, 0.04], [0, -0.41, -0.11], 0x8a929e, 'metal'),
    P('box', [0.86, 0.03, 0.04], [0, -0.41, 0], 0x8a929e, 'metal'),
    P('box', [0.86, 0.03, 0.04], [0, -0.41, 0.11], 0x8a929e, 'metal'),
    P('box', [0.32, 0.16, 0.1], [0, 0.55, 0], 0xd0d8e0, 'metal'),
    P('box', [0.2, 0.05, 0.11], [0, 0.55, 0], 0x2a2a34, 'plain'),
    P('box', [0.18, 0.5, 0.04], [0, 0.82, 0.02], LEATHER, 'ch_leather'),
    P('iw_poly', [0.05, rrect(0.28, 0.2, 0.04), rrect(0.18, 0.1, 0.02)], [0, 0.88, 0.05], GOLD, 'gold')
  ], { yaw: 0.3, pitch: 0.2, zoom: 1.0 });

  // 铃铛项圈：平放的一圈红皮项圈（金扣），前面挂一个金色小铃铛
  item('bellcollar', [
    P('ii_lathe', [24, 0.5, -0.09, 0.57, -0.09, 0.57, 0.09, 0.5, 0.09, 0.5, -0.09], [0, 0, 0], RED, 'ch_leather'),
    P('box', [0.08, 0.24, 0.22], [-0.58, 0, 0.04], GOLD, 'gold', [0, -0.1, 0]),
    P('box', [0.06, 0.1, 0.2], [-0.62, 0, 0.04], 0xb02a2a, 'ch_leather', [0, -0.1, 0]),
    P('ii_arc', [0.06, 0.022, 4, 10], [0, -0.06, 0.6], GOLD_D, 'gold'),
    P('sphere', [0.19, 10, 8], [0, -0.24, 0.64], 0xffc83a, 'gold'),
    P('box', [0.26, 0.03, 0.06], [0, -0.3, 0.8], 0x6a4010, 'plain'),
    P('sphere', [0.035, 6, 4], [0, -0.36, 0.79], 0x6a4010, 'plain')
  ], { yaw: 0.3, pitch: 0.5, zoom: 1.05 });

  // 旧箭袋：斜挂的皮箭袋（两道深色箍、背带），口上露出三支箭的羽毛（红、白、灰）
  (function () {
    var VANE = [0, 0, 0.13, 0.06, 0.15, 0.36, 0, 0.42, -0.15, 0.36, -0.13, 0.06];
    var parts = [
      P('cyl', [0.21, 0.16, 1.1, 10], [0, 0, 0], 0xa87e48, 'ch_leather'),
      P('cyl', [0.225, 0.225, 0.1, 10], [0, 0.5, 0], 0x5a4020, 'ch_leather'),
      P('cyl', [0.2, 0.2, 0.08, 10], [0, -0.2, 0], 0x5a4020, 'ch_leather'),
      P('cyl', [0.17, 0.17, 0.06, 10], [0, -0.57, 0], 0x5a4020, 'ch_leather'),
      P('cyl', [0.19, 0.19, 0.02, 10], [0, 0.555, 0], INK, 'plain'),
      rod('box', [-0.21, 0.42, 0.02], [-0.17, -0.48, 0.02], [0.07, 0.04], 0x4a2e1a, 'ch_leather')
    ];
    [[-0.08, 0.0, 1.06, 0xe84a4a, -0.18], [0.04, 0.06, 1.16, 0xf4f4f8, 0.02], [0.1, -0.06, 0.98, 0xa8b0bc, 0.2]].forEach(function (a) {
      parts.push(rod('box', [a[0], 0.4, a[1]], [a[0] + a[4] * 0.5, a[2], a[1]], [0.035, 0.035], 0xc8a060, 'wood'));
      var top = [a[0] + a[4] * 0.5, a[2] - 0.42, a[1]];
      parts.push(P('ii_poly', [0.015, VANE], top, a[3], 'cloth', [0, 0.6, -a[4]]));
      parts.push(P('ii_poly', [0.015, VANE], top, a[3], 'cloth', [0, 0.6 + PI / 2, -a[4]]));
    });
    item('quiver', parts, { tilt: -0.5, yaw: 0.4, pitch: 0.3, zoom: 1.15 });
  })();

  // 老兵勋章：铜色五角星（中间一个圆片）挂在红白红竖条的绶带下面，绶带顶上一根金别针
  item('veteran', [
    P('ii_poly', [0.08, star(5, 0.42, 0.19), 0.03], [0, 0, 0], 0xc8863a, 'gold'),
    P('cyl', [0.14, 0.14, 0.06, 12], [0, 0, 0.07], 0xe8a85a, 'gold', [PI / 2, 0, 0]),
    P('ii_arc', [0.06, 0.022, 4, 10], [0, 0.48, 0], 0xc8863a, 'gold'),
    P('ii_poly', [0.03, [-0.26, 1.08, -0.26, 0.68, 0, 0.53, 0.26, 0.68, 0.26, 1.08]], [0, 0, -0.01], RED, 'cloth'),
    P('ii_poly', [0.03, [-0.075, 1.08, -0.075, 0.58, 0, 0.545, 0.075, 0.58, 0.075, 1.08]], [0, 0, 0.01], 0xf4f4f8, 'plain'),
    P('box', [0.56, 0.06, 0.06], [0, 1.1, 0.02], GOLD, 'gold')
  ], { yaw: 0.25, pitch: 0.15, zoom: 1.0 });

  // 许愿铜钱：外圆内方的铜钱（四个字的笔画），红绳穿过方孔，上面打结、下面一束红流苏
  item('wishcoin', [
    P('iw_poly', [0.08, circle(20, 0.5), [-0.13, -0.13, 0.13, -0.13, 0.13, 0.13, -0.13, 0.13]], [0, 0, 0], 0xc8963a, 'gold'),
    P('ii_arc', [0.48, 0.035, 4, 24], [0, 0, 0.02], 0xe0b050, 'gold'),
    P('box', [0.34, 0.04, 0.03], [0, 0.155, 0.045], 0xe0b050, 'gold'),
    P('box', [0.34, 0.04, 0.03], [0, -0.155, 0.045], 0xe0b050, 'gold'),
    P('box', [0.04, 0.34, 0.03], [0.155, 0, 0.045], 0xe0b050, 'gold'),
    P('box', [0.04, 0.34, 0.03], [-0.155, 0, 0.045], 0xe0b050, 'gold'),
    P('box', [0.13, 0.09, 0.03], [0, 0.31, 0.045], 0x7a4a14, 'plain'),
    P('box', [0.13, 0.09, 0.03], [0, -0.31, 0.045], 0x7a4a14, 'plain'),
    P('box', [0.09, 0.13, 0.03], [0.31, 0, 0.045], 0x7a4a14, 'plain'),
    P('box', [0.09, 0.13, 0.03], [-0.31, 0, 0.045], 0x7a4a14, 'plain'),
    P('ii_tube', [0.035, 5, 14, 1, 0.0, -0.66, -0.06, 0.03, -0.3, -0.08, 0.0, 0.0, 0.0, -0.04, 0.3, 0.09, 0, 0.66, 0.04, 0.06, 0.32, -0.09, 0.02, 0.06, -0.06], [0, 0, 0], RED, 'cloth'),
    P('oct', [0.08], [0, 0.66, 0.02], 0xb02020, 'cloth'),
    P('oct', [0.06], [0, -0.66, -0.06], 0xb02020, 'cloth'),
    P('cone', [0.1, 0.3, 6], [0, -0.84, -0.06], RED, 'cloth')
  ], { yaw: 0.25, pitch: 0.3, zoom: 1.0 });

  // 铁匠的徽牌：锤子形状的木牌（深色木边），钉着两颗铁钉，正中烙着一个火苗印
  (function () {
    var HAM = [-0.12, -0.68, -0.06, -0.75, 0.06, -0.75, 0.12, -0.68, 0.12, 0.3, 0.5, 0.3, 0.56, 0.36, 0.56, 0.58, 0.5, 0.64,
      -0.5, 0.64, -0.56, 0.58, -0.56, 0.36, -0.5, 0.3, -0.12, 0.3];
    item('smithpass', [
      P('ii_poly', [0.08, HAM, 0.05], [0, 0, -0.05], 0x5a3a20, 'wood'),
      P('ii_poly', [0.12, HAM, 0.02], [0, 0, 0], 0xb08050, 'wood'),
      P('oct', [0.055], [-0.42, 0.47, 0.09], 0x9aa0aa, 'metal'),
      P('oct', [0.055], [0.42, 0.47, 0.09], 0x9aa0aa, 'metal'),
      P('ii_poly', [0.01, FLAME], [0, 0.34, 0.085], 0x5a3a20, 'plain', null, [0.26, 0.26, 1]),
      P('cyl', [0.045, 0.045, 0.02, 8], [0, -0.6, 0.085], 0x3a2414, 'plain', [PI / 2, 0, 0])
    ], { yaw: 0.3, pitch: 0.2, tilt: -0.3, zoom: 1.05 });
  })();

  // 蜂蜜罐：圆肚陶罐、木塞，蜂蜜从罐口淌下来两道
  (function () {
    var at = function (a, y, r) { return [Math.sin(a) * r, y, Math.cos(a) * r]; };
    var d1 = [].concat(at(0.2, 0.8, 0.3), at(0.25, 0.66, 0.36), at(0.28, 0.5, 0.47), at(0.3, 0.36, 0.5));
    var d2 = [].concat(at(0.8, 0.8, 0.3), at(0.84, 0.66, 0.36), at(0.86, 0.56, 0.44));
    var e1 = at(0.3, 0.33, 0.5), e2 = at(0.86, 0.53, 0.45);
    item('honeyjar', [
      P('ii_lathe', [12, 0, 0, 0.3, 0, 0.4, 0.08, 0.47, 0.28, 0.45, 0.48, 0.36, 0.62, 0.24, 0.7, 0.22, 0.74, 0.27, 0.78, 0.27, 0.84, 0.22, 0.86], [0, 0, 0], 0x9a4a2a, 'it_clay'),
      P('cyl', [0.19, 0.21, 0.18, 10], [0, 0.92, 0], 0xd8b080, 'wood'),
      P('ii_arc', [0.27, 0.055, 5, 14], [0, 0.8, 0], 0xf8a81c, 'plain', [PI / 2, 0, 0]),
      P('ii_tube', [[0.09, 0.075, 0.06, 0.055], 5, 10, 1].concat(d1), [0, 0, 0], 0xf8a81c, 'plain'),
      P('sphere', [0.095, 6, 5], e1, 0xf8a81c, 'plain', null, [1, 1.2, 1]),
      P('ii_tube', [[0.085, 0.07, 0.055], 5, 8, 1].concat(d2), [0, 0, 0], 0xf8a81c, 'plain'),
      P('sphere', [0.085, 6, 5], e2, 0xf8a81c, 'plain', null, [1, 1.2, 1]),
      P('sphere', [0.03, 5, 4], at(0.15, 0.84, 0.33), 0xfff4d0, 'plain')
    ], { yaw: 0.35, pitch: 0.3, zoom: 0.95 });
  })();

  // 云纹靴：白色长筒靴（往下翻的靴口），侧面两朵蓝色云纹，靴底下踩着一小团白云
  // 沿用旧运动鞋的做法：一层层挤出的侧面轮廓（大底、鞋底两块轮廓照旧），鞋面换成长靴
  (function () {
    var SOLE = [-0.66, 0.04, 0.55, 0.04, 0.7, 0.08, 0.8, 0.2, 0.77, 0.25, 0.62, 0.19, -0.66, 0.19];
    var OUT = [-0.64, -0.04, 0.56, -0.04, 0.72, 0.02, 0.78, 0.1, 0.6, 0.06, -0.64, 0.06];
    var UPPER = [-0.62, 0.16, 0.62, 0.16, 0.74, 0.22, 0.7, 0.34, 0.5, 0.42, 0.22, 0.48, 0.02, 0.56, -0.04, 0.92, -0.62, 0.92, -0.68, 0.5];
    var CUFF = [-0.72, 0.84, 0.0, 0.84, 0.05, 1.12, -0.7, 1.12];
    var HEEL = [-0.64, 0.16, -0.28, 0.16, -0.3, 0.38, -0.46, 0.62, -0.62, 0.66, -0.68, 0.46];
    var TOE = [0.36, 0.16, 0.62, 0.16, 0.74, 0.22, 0.7, 0.34, 0.52, 0.43, 0.4, 0.34];
    var Z = 0.26, parts = [
      P('ii_poly', [0.46, OUT, 0.02], [0, 0, 0], 0x5a6a8a, 'plain'),
      P('ii_poly', [0.5, SOLE, 0.02], [0, 0, 0], 0xc8ccd8, 'plain'),
      P('ii_poly', [0.38, UPPER, 0.05], [0, 0, 0], 0xf0f4ff, 'ch_leather'),
      P('ii_poly', [0.42, HEEL, 0.05], [0, 0, 0], 0xd8e0ee, 'ch_leather'),
      P('ii_poly', [0.42, TOE, 0.05], [0, 0, 0], 0xd8e0ee, 'ch_leather'),
      P('ii_poly', [0.44, CUFF, 0.05], [0, 0, 0], 0xe4ecfa, 'ch_leather'),
      P('ii_poly', [0.03, cloudPts([[-0.12, 0.02, 0.1], [0.0, 0.05, 0.13], [0.13, 0.0, 0.09]], 14)], [-0.32, 0.5, Z], 0x5a9ae8, 'plain'),
      P('ii_poly', [0.03, cloudPts([[-0.09, 0.0, 0.07], [0.02, 0.03, 0.1], [0.12, 0.0, 0.07]], 12)], [0.34, 0.24, Z - 0.01], 0x5a9ae8, 'plain'),
      P('ii_poly', [0.03, cloudPts([[-0.07, 0.0, 0.06], [0.03, 0.02, 0.08]], 10)], [-0.4, 0.98, Z + 0.02], 0x5a9ae8, 'plain')
    ];
    [[-0.45, 0.15], [-0.15, 0.19], [0.18, 0.17], [0.46, 0.13]].forEach(function (c, i) {
      parts.push(P('sphere', [c[1], 8, 6], [c[0], -0.12, 0.08 - i * 0.03], 0xf4f8ff, 'plain', null, [1.1, 0.7, 1]));
    });
    item('cloudboots', parts, { yaw: 0.38, pitch: 0.35, zoom: 1.0 });
  })();

  // 避雷针：铁尖杆立在小底座上，杆上绕着铜线圈，一道发光的大闪电（三道折）从右上方正好劈在杆尖上
  // 闪电的点：尖端在 (-0.45,-0.5)，往右上方折上去；内芯是同一条中心线、窄一些
  var ROD_BOLT = [-0.474, -0.474, -0.289, -0.245, -0.56, -0.145, -0.157, 0.208, -0.443, 0.31, 0.19, 0.79, 0.35, 0.57, 0.043, 0.37, 0.257, 0.272, -0.22, -0.095, -0.011, -0.195, -0.426, -0.526];
  var ROD_CORE = [-0.461, -0.488, -0.215, -0.232, -0.469, -0.132, -0.046, 0.225, -0.313, 0.326, 0.233, 0.731, 0.307, 0.629, -0.087, 0.354, 0.146, 0.255, -0.311, -0.108, -0.085, -0.208, -0.439, -0.512];
  item('lightningrod', [
    P('cyl', [0.4, 0.46, 0.14, 10], [0, -0.5, 0], 0x6a707c, 'metal'),
    P('cyl', [0.14, 0.19, 0.16, 8], [0, -0.36, 0], 0x8a909c, 'metal'),
    P('cyl', [0.075, 0.085, 0.8, 6], [0, 0.02, 0], 0x9aa0aa, 'metal'),
    P('cone', [0.11, 0.3, 6], [0, 0.57, 0], 0xc0c6d0, 'metal'),
    P('tm_coil', [0.2, 0.055, 4, 0.36], [0, -0.05, 0], 0xd8843a, 'gold'),
    P('ii_poly', [0.06, ROD_BOLT], [0.81, 1.05, 0.06], 0x9ad0ff, '!plain', [0, 0, -0.45], [1.3, 1.3, 1]),
    P('ii_poly', [0.06, ROD_CORE], [0.81, 1.05, 0.1], 0xfff6b0, '!plain', [0, 0, -0.45], [1.3, 1.3, 1]),
    P('oct', [0.12], [0.02, 0.75, 0.1], 0xfffbe0, '!plain', null, [1, 1, 0.5])
  ], { yaw: 0.3, pitch: 0.2, zoom: 1.05 });

  // 平安符：扁扁的红布锦囊（金绳扎口、上面一个金绳圈），正面一块绣着金色「安」字的布片
  item('talisman', [
    P('ii_lathe', [10, 0, 0, 0.32, 0.02, 0.44, 0.14, 0.46, 0.38, 0.4, 0.56, 0.26, 0.68, 0.16, 0.72, 0.15, 0.75, 0.22, 0.8, 0.26, 0.88, 0.2, 0.92, 0, 0.9], [0, 0, 0], 0xe83a3a, 'cloth', null, [1, 1, 0.6]),
    P('ii_arc', [0.165, 0.035, 4, 12], [0, 0.735, 0], GOLD, 'gold', [PI / 2, 0, 0], [1, 0.6, 1]),
    P('ii_arc', [0.14, 0.03, 4, 12], [0, 1.06, 0], GOLD, 'gold'),
    P('box', [0.5, 0.46, 0.02], [0, 0.35, 0.285], 0xffffff, 'ii_an')
  ], { yaw: 0.15, pitch: 0.12, zoom: 1.0 });

  // 纹章画笔：一支画笔斜着，笔尖正在一面小白盾上涂色（左半边已经涂成粉红）
  (function () {
    var HALF = [-0.4, 0.43, -0.2, 0.49, -0.02, 0.51, -0.02, -0.5, -0.16, -0.38, -0.3, -0.2, -0.38, 0.0];
    var tip = [-0.16, 0.06, 0.2], end = [0.68, -0.72, 0.26];
    var d = [tip[0] - end[0], tip[1] - end[1], tip[2] - end[2]];
    var at = function (t) { return [end[0] + d[0] * t, end[1] + d[1] * t, end[2] + d[2] * t]; };
    item('crestbrush', [
      P('tm_shield', [1.0, 1.15, 0.1], [-0.2, 0.08, -0.14], 0x8a929e, 'metal'),
      P('tm_shield', [0.86, 1.0, 0.1], [-0.2, 0.09, -0.08], 0xe8e0d0, 'cloth'),
      P('ii_poly', [0.02, HALF], [-0.2, 0.09, 0.03], 0xd85a8a, 'plain'),
      rod('cyl', end, at(0.62), [0.055, 0.045, 6], 0xc8783a, 'wood'),
      rod('cyl', at(0.6), at(0.72), [0.06, 0.06, 6], 0xc8d0da, 'metal'),
      toward('cone', [0.065, 0.26, 6], at(0.84), d, 0xe8d0a0, 'plain'),
      toward('cone', [0.04, 0.12, 6], at(0.94), d, 0xd85a8a, 'plain')
    ], { yaw: 0.3, pitch: 0.2, zoom: 0.94 });
  })();

  // 刀油：细长的小玻璃瓶（下半截是琥珀色的油，瓶身一道反光，木塞），旁边一滴发光的金色油
  item('bladeoil', [
    P('ii_lathe', [10, 0, 0, 0.15, 0, 0.18, 0.05, 0.18, 0.55, 0, 0.55], [0, 0, 0], 0xf0c040, 'plain'),
    P('ii_lathe', [10, 0.182, 0.55, 0.182, 0.82, 0.12, 0.9, 0.08, 0.95, 0.08, 1.04, 0.1, 1.06, 0.1, 1.1, 0, 1.1], [0, 0, 0], 0xb8d4e4, 'plain'),
    P('ii_arc', [0.183, 0.012, 4, 14], [0, 0.55, 0], 0xffe890, 'plain', [PI / 2, 0, 0]),
    P('box', [0.035, 0.62, 0.02], [-0.07, 0.48, 0.165], 0xffffff, 'plain'),
    P('cyl', [0.075, 0.068, 0.16, 8], [0, 1.16, 0], 0xb08050, 'wood'),
    P('ii_lathe', drop(1.1), [0.36, 0.08, 0.1], 0xffd84a, '!plain'),
    P('sphere', [0.035, 6, 4], [0.36, 0.02, 0.1], 0xffd84a, '!plain', null, [1.6, 0.4, 1.6])
  ], { yaw: 0.3, pitch: 0.2, zoom: 1.05 });

  // 决斗手套：一只白皮手套（四指、拇指，手背三道缝线），往下张开的护腕，腕上一根皮带和金扣
  (function () {
    var W = 0xf4f4f8, parts = [
      P('box', [0.6, 0.6, 0.22], [0, 0, 0], W, 'ch_leather'),
      P('ii_lathe', [10, 0.46, -0.86, 0.42, -0.62, 0.34, -0.38, 0.32, -0.26], [0, 0, 0], 0xe8eaf2, 'ch_leather', null, [1, 1, 0.55]),
      P('ii_arc', [0.46, 0.03, 4, 16], [0, -0.86, 0], 0xc8ccd8, 'plain', [PI / 2, 0, 0], [1, 0.55, 1]),
      P('box', [0.64, 0.1, 0.26], [0, -0.33, 0], 0xd8dce6, 'ch_leather'),
      P('box', [0.14, 0.14, 0.06], [0.16, -0.33, 0.13], GOLD, 'gold'),
      rod('cyl', [-0.26, -0.06, 0.03], [-0.5, 0.24, 0.08], [0.075, 0.07, 6], W, 'ch_leather'),
      P('sphere', [0.07, 6, 4], [-0.5, 0.24, 0.08], W, 'ch_leather')
    ];
    [[-0.21, 0.38, 0.06], [-0.07, 0.44, 0.02], [0.07, 0.42, -0.02], [0.21, 0.34, -0.07]].forEach(function (f) {
      parts.push(P('cyl', [0.065, 0.07, f[1], 6], [f[0], 0.3 + f[1] / 2, 0], W, 'ch_leather', [0, 0, f[2]]));
      parts.push(P('sphere', [0.065, 6, 4], [f[0] - Math.sin(f[2]) * f[1], 0.3 + f[1], 0], W, 'ch_leather'));
    });
    [-0.12, 0, 0.12].forEach(function (x) { parts.push(P('box', [0.022, 0.34, 0.01], [x, 0.04, 0.115], 0xa8acb8, 'plain')); });
    item('duelglove', parts, { yaw: 0.3, pitch: 0.25, zoom: 1.05 });
  })();

  // 渡鸦羽毛：一根黑羽毛（后面垫一层紫色，边上透出紫色光泽），灰色羽轴，旁边闪一下紫光
  // 羽毛的形状照旧图标的羽毛做法：羽片两边一宽一窄、中间一道缺口，羽轴是一根变细的弯管
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
    var back = feather(1.6, 0.38, 0.18, 0x8a64d8, 0x8a8e96)[0];
    back[2] = [0.035, -0.02, -0.04];
    item('ravenfeather', xf([back].concat(feather(1.55, 0.33, 0.18, 0x4e4470, 0xa8aeb8)), [0, 0, -0.5], [0, -0.1, 0]).concat([
      sparkle([0.62, 0.9, 0.1], 1.0, 0.3, 0xd0b0ff)
    ]), { yaw: 0.25, pitch: 0.2, zoom: 1.1 });
  })();

  // 行军图：摊开一半的羊皮地图（另一半还卷着），图上一条虚线通到一个红叉
  (function () {
    var parts = [
      P('box', [1.2, 0.03, 0.9], [-0.05, 0, 0], 0xdcc898, 'ii_parch'),
      P('cyl', [0.13, 0.13, 0.94, 10], [0.62, 0.12, 0], 0xcab488, 'ii_parch', [PI / 2, 0, 0]),
      P('cyl', [0.1, 0.1, 0.02, 10], [0.62, 0.12, 0.47], 0xa89870, 'plain', [PI / 2, 0, 0]),
      P('box', [0.36, 0.03, 0.09], [-0.34, 0.03, 0.16], 0xe02a2a, 'plain', [0, PI / 4, 0]),
      P('box', [0.36, 0.03, 0.09], [-0.34, 0.03, 0.16], 0xe02a2a, 'plain', [0, -PI / 4, 0])
    ];
    [[0.36, -0.3], [0.22, -0.2], [0.08, -0.14], [-0.06, -0.06], [-0.18, 0.06]].forEach(function (p) {
      parts.push(P('box', [0.08, 0.025, 0.08], [p[0], 0.026, p[1]], 0x4a2a14, 'plain'));
    });
    item('warmap', xf(parts, [0, 0.25, 0]), { yaw: 0.3, pitch: 0.62, zoom: 1.06 });
  })();

  // 骑士手册：合着的红皮小书（金包角），封面上一顶带羽饰的金色圆顶头盔
  (function () {
    var SALLET = [0.24, -0.06, 0.28, 0.1, 0.22, 0.22, 0.08, 0.3, -0.08, 0.3, -0.2, 0.22, -0.27, 0.06, -0.3, -0.06, -0.46, -0.17, -0.3, -0.18, -0.16, -0.1, 0.0, -0.1, 0.12, -0.06];
    var PLUME = [-0.02, 0.29, 0.02, 0.4, -0.04, 0.5, -0.16, 0.54, -0.3, 0.5, -0.4, 0.4, -0.44, 0.28, -0.32, 0.36, -0.2, 0.4, -0.1, 0.36, -0.08, 0.29];
    var C = [0.41, 0.53, 0.41, 0.36, 0.24, 0.53];
    var parts = [
      P('box', [0.82, 1.06, 0.05], [0, 0, 0.13], RED, 'ch_leather'),
      P('box', [0.82, 1.06, 0.05], [0, 0, -0.13], 0xb02a2a, 'ch_leather'),
      P('box', [0.08, 1.06, 0.31], [-0.41, 0, 0], 0xb02a2a, 'ch_leather'),
      P('box', [0.76, 1.0, 0.22], [0.02, 0, 0], CREAM, 'ii_pages'),
      P('ii_poly', [0.02, SALLET, 0.03], [0.04, -0.08, 0.155], 0x5a0c10, 'plain', null, [1.05, 1.05, 1]),
      P('ii_poly', [0.04, SALLET, 0.012], [0.04, -0.08, 0.17], GOLD, 'gold', null, [1.05, 1.05, 1]),
      P('ii_poly', [0.03, PLUME, 0.012], [0.04, -0.08, 0.165], 0xfff0b0, 'gold', null, [1.05, 1.05, 1]),
      P('box', [0.24, 0.05, 0.02], [0.18, 0.02, 0.2], 0x3a1a08, 'plain'),
      P('box', [0.02, 0.32, 0.02], [0.0, 0.04, 0.2], 0xd99a20, 'gold')
    ];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (s) {
      var pts = [];
      for (var i = 0; i < C.length; i += 2) pts.push(C[i] * s[0], C[i + 1] * s[1]);
      if (s[0] * s[1] < 0) pts = [pts[0], pts[1], pts[4], pts[5], pts[2], pts[3]];
      parts.push(P('ii_poly', [0.03, pts], [0, 0, 0.16], GOLD, 'gold'));
    });
    item('manual', parts, { yaw: 0.4, pitch: 0.3, zoom: 0.95 });
  })();

  // 家族徽章：纹章底板（金边、红底金狮，用纹章图标的盾）+ 顶上一顶小金冠 + 下面一条白色卷轴绶带（蓝色两头）
  // 纹章那边没有导出盾的时候，用一面金边红底的空盾代替
  (function () {
    var crown = [
      P('cyl', [0.3, 0.32, 0.13, 12], [0, 0.8, 0], GOLD, 'gold'),
      P('cyl', [0.27, 0.27, 0.02, 12], [0, 0.87, 0], 0xb02a3a, 'cloth')
    ];
    [-0.75, 0, 0.75].forEach(function (a) {
      crown.push(P('cone', [0.08, 0.22, 4], [Math.sin(a) * 0.29, 0.97, Math.cos(a) * 0.29], GOLD, 'gold', [0, a, 0]));
      crown.push(P('sphere', [0.045, 6, 4], [Math.sin(a) * 0.29, 1.09, Math.cos(a) * 0.29], 0xffe890, 'gold'));
    });
    [-0.5, 0.5].forEach(function (a) { crown.push(P('oct', [0.05], [Math.sin(a) * 0.32, 0.8, Math.cos(a) * 0.32], 0xe02a3a, 'plain')); });
    crown.push(P('oct', [0.06], [0, 0.8, 0.33], 0x3a7aff, 'plain'));
    var mid = [], i, x;
    for (i = 0; i <= 8; i++) { x = -0.6 + 1.2 * i / 8; mid.push(x, -0.56 - 0.1 * (1 - (x / 0.6) * (x / 0.6))); }
    for (i = 8; i >= 0; i--) { x = -0.6 + 1.2 * i / 8; mid.push(x, -0.74 - 0.1 * (1 - (x / 0.6) * (x / 0.6))); }
    var TAIL = [-0.58, -0.58, -0.86, -0.6, -0.76, -0.7, -0.86, -0.82, -0.58, -0.76];
    var ribbon = [
      P('ii_poly', [0.04, TAIL], [0, 0, 0.2], 0x3a6ad8, 'cloth'),
      P('ii_poly', [0.04, mirrorPts(TAIL)], [0, 0, 0.2], 0x3a6ad8, 'cloth'),
      P('ii_poly', [0.04, mid, 0.01], [0, 0, 0.25], 0xf4f4f8, 'cloth')
    ];
    item('familycrest', function () {
      var shield = ICONS.crestParts ? ICONS.crestParts('lion', { rim: 0xffc83a, rimTex: 'gold' }) : [
        ['tm_shield', [1.30, 1.50, 0.12], [0, 0, -0.07], 0xffc83a, null, null, 'gold'],
        ['tm_shield', [1.10, 1.30, 0.12], [0, 0.01, 0], 0xd9433b, null, null, 'cloth']
      ];
      return shield.concat(crown, ribbon);
    }, { yaw: 0.28, pitch: 0.12, zoom: 0.95 });
  })();

  // 锻造图纸：摊开的蓝图（白格子、画着一把剑），后边还卷着一截，上面立着一把金色圆规
  (function () {
    var hinge = [0.12, 0.66, 0.12];
    item('forgeplan', [
      P('box', [1.0, 0.025, 0.72], [0, 0, 0.05], 0xffffff, 'ii_blue'),
      P('cyl', [0.13, 0.13, 1.04, 12], [0, 0.12, -0.36], 0x4a8ad9, 'cloth', [0, 0, PI / 2]),
      P('cyl', [0.1, 0.1, 0.02, 12], [0.525, 0.12, -0.36], 0x9ac4f4, 'plain', [0, 0, PI / 2]),
      rod('cyl', hinge, [-0.16, 0.02, 0.3], [0.045, 0.02, 6], GOLD, 'gold'),
      rod('cyl', hinge, [0.4, 0.02, 0.06], [0.045, 0.02, 6], GOLD, 'gold'),
      P('cyl', [0.065, 0.065, 0.06, 8], hinge, GOLD_D, 'gold', [PI / 2, 0, 0]),
      P('cyl', [0.025, 0.025, 0.14, 6], [hinge[0], hinge[1] + 0.1, hinge[2]], GOLD_D, 'gold'),
      P('ii_arc', [0.05, 0.018, 4, 10], [hinge[0], hinge[1] + 0.2, hinge[2]], GOLD, 'gold')
    ], { yaw: 0.35, pitch: 0.5, zoom: 0.8 });
  })();

  // 猎犬哨：一只大大的猎犬头（四分之三侧脸、耷拉的耳朵），下面挂着一个骨头形的小口哨（吹口、铜环、红绳）
  (function () {
    var B = 0xb07a44, D = 0x4a2a14, Wt = 0xf0e6d4;
    item('hound', [
      P('sphere', [0.38, 12, 10], [0, 0.22, 0], B, 'fur', null, [1, 1.08, 0.95]),
      P('sphere', [0.3, 10, 8], [-0.02, 0.44, -0.06], 0x6a4020, 'fur', null, [1.05, 0.6, 0.95]),
      P('sphere', [0.2, 10, 8], [0.08, 0.04, 0.34], Wt, 'fur', [0, 0.2, 0], [1.05, 0.8, 1.3]),
      P('box', [0.1, 0.36, 0.1], [0.02, 0.3, 0.33], Wt, 'fur', [-0.35, 0.2, 0]),
      P('sphere', [0.09, 8, 6], [0.15, 0.1, 0.6], 0x1a1418, 'plain', null, [1.3, 0.9, 1]),
      P('sphere', [0.024, 4, 3], [0.12, 0.14, 0.67], 0xffffff, 'plain'),
      P('sphere', [0.055, 6, 4], [-0.13, 0.33, 0.31], 0x1a1418, 'plain'),
      P('sphere', [0.055, 6, 4], [0.2, 0.33, 0.27], 0x1a1418, 'plain'),
      P('sphere', [0.018, 4, 3], [-0.11, 0.35, 0.36], 0xffffff, 'plain'),
      P('sphere', [0.018, 4, 3], [0.22, 0.35, 0.32], 0xffffff, 'plain'),
      P('sphere', [0.22, 8, 6], [-0.38, 0.02, 0.04], D, 'fur', [0.05, 0, 0.18], [0.5, 1.85, 0.45]),
      P('sphere', [0.22, 8, 6], [0.38, 0.0, -0.04], D, 'fur', [0.05, 0, -0.18], [0.5, 1.85, 0.45]),
      P('box', [0.1, 0.07, 0.08], [0.12, -0.12, 0.5], 0xe86a7a, 'plain', [0.4, 0.2, 0]),
      P('ii_arc', [0.3, 0.05, 4, 14], [0, -0.14, -0.02], RED, 'ch_leather', [PI / 2 - 0.2, 0, 0]),
      P('ii_tube', [0.022, 4, 8, 1, -0.08, -0.2, 0.28, -0.24, -0.36, 0.4, -0.32, -0.48, 0.44], [0, 0, 0], 0xc8963a, 'gold'),
      P('cyl', [0.055, 0.055, 0.34, 8], [-0.46, -0.6, 0.46], 0xf0e6d0, 'bone', [0, 0, 0.25 + PI / 2]),
      P('sphere', [0.068, 6, 5], [-0.63, -0.6, 0.44], 0xf0e6d0, 'bone'),
      P('sphere', [0.068, 6, 5], [-0.61, -0.7, 0.48], 0xf0e6d0, 'bone'),
      P('box', [0.07, 0.03, 0.06], [-0.37, -0.54, 0.5], INK, 'plain', [0, 0, 0.25]),
      P('ii_arc', [0.05, 0.018, 4, 10], [-0.3, -0.52, 0.46], GOLD, 'gold', [0, PI / 2, 0])
    ], { yaw: 0.45, pitch: 0.18, zoom: 1.0 });
  })();

  // 双剑腰带：一段弯弯的宽皮腰带（金扣），左右各挂一把短剑，剑尖朝外下方
  (function () {
    var sword = [
      P('iw_blade', [0.82, 0.15, 0.05, 0.17, 1], [0, 0, 0], STEEL, 'ch_plate'),
      P('box', [0.34, 0.06, 0.09], [0, 0, 0], 0x9aa3ad, 'metal'),
      P('cyl', [0.04, 0.04, 0.22, 6], [0, -0.13, 0], LEATHER, 'ch_leather'),
      P('sphere', [0.06, 6, 4], [0, -0.27, 0], 0x9aa3ad, 'metal')
    ];
    var parts = [
      P('ii_arc', [0.6, 0.06, 4, 16, PI], [0, 0, 0], 0x6a4a2a, 'ch_leather', [PI / 2, 0, 0], [1, 1, 2.2]),
      P('iw_poly', [0.05, rrect(0.3, 0.32, 0.05), rrect(0.18, 0.18, 0.03)], [0, 0, 0.66], GOLD, 'gold'),
      P('box', [0.04, 0.2, 0.03], [0.02, 0, 0.68], GOLD_D, 'gold')
    ];
    [-1, 1].forEach(function (s) {
      var t = PI / 2 + s * 0.85, fx = Math.cos(t) * 0.62, fz = Math.sin(t) * 0.62;
      parts.push(P('box', [0.09, 0.22, 0.05], [fx, -0.16, fz + 0.04], 0x4a2e1a, 'ch_leather', [0, -s * 0.85, 0]));
      parts = parts.concat(xf(sword, [0, 0, PI + s * 0.5], [fx + s * 0.04, -0.34, fz + 0.06]));
    });
    item('twinbelt', parts, { yaw: 0.2, pitch: 0.25, zoom: 1.0 });
  })();

  // 教官的戒尺：长长的木戒尺，上沿一排红色刻度，一头有个挂孔
  item('ruler', [
    P('box', [0.75, 0.24, 0.06], [-0.375, 0, 0], 0xffffff, 'ii_ruler'),
    P('box', [0.75, 0.24, 0.06], [0.375, 0, 0], 0xffffff, 'ii_ruler'),
    P('box', [1.5, 0.03, 0.066], [0, -0.12, 0], 0x9a7040, 'wood'),
    P('cyl', [0.045, 0.045, 0.07, 8], [-0.66, -0.03, 0], 0x3a2a1a, 'plain', [PI / 2, 0, 0])
  ], { tilt: -PI / 5, yaw: 0.3, pitch: 0.35, zoom: 1.12 });

  // 圣杯：发白光的金杯（杯形照旧金杯图标：底座、杯柄、柄上的结、杯身、杯沿），杯身三颗蓝宝石，
  // 杯里是光，头顶一圈光环和三道细光
  item('holygrail', [
    P('cyl', [0.34, 0.4, 0.09, 10], [0, -0.8, 0], 0xf0dca0, 'gold'),
    P('cyl', [0.07, 0.11, 0.5, 8], [0, -0.52, 0], 0xfff0c0, 'gold'),
    P('sphere', [0.12, 8, 5], [0, -0.44, 0], 0xfff4d0, 'gold', null, [1, 0.8, 1]),
    P('ch_lathe', [12, 0.06, -0.3, 0.3, -0.2, 0.44, 0.0, 0.5, 0.28], [0, 0, 0], 0xfff0c0, 'gold'),
    P('torus', [0.49, 0.045, 4, 12], [0, 0.29, 0], 0xfffae0, 'gold', [PI / 2, 0, 0]),
    P('cyl', [0.47, 0.47, 0.04, 12], [0, 0.25, 0], 0xfff8e0, '!plain'),
    P('oct', [0.08], [0, -0.04, 0.42], 0x4a90ff, 'plain', null, [1, 1.3, 0.6]),
    P('oct', [0.06], [Math.sin(-0.85) * 0.4, -0.02, Math.cos(-0.85) * 0.4], 0x4a90ff, 'plain', [0, -0.85, 0], [1, 1.3, 0.6]),
    P('oct', [0.06], [Math.sin(0.85) * 0.4, -0.02, Math.cos(0.85) * 0.4], 0x4a90ff, 'plain', [0, 0.85, 0], [1, 1.3, 0.6]),
    P('ii_arc', [0.3, 0.045, 4, 20], [0, 0.86, 0], 0xfff6c0, '!plain', [PI / 2 - 0.55, 0, 0]),
    P('box', [0.045, 0.26, 0.02], [-0.56, 0.5, 0.05], 0xfff4c8, '!plain', [0, 0, 0.8]),
    P('box', [0.045, 0.22, 0.02], [0, 0.5, 0.2], 0xfff4c8, '!plain'),
    P('box', [0.045, 0.26, 0.02], [0.56, 0.5, 0.05], 0xfff4c8, '!plain', [0, 0, -0.8])
  ], { yaw: 0.3, pitch: 0.25, zoom: 1.0 });

  // 石中剑：一把剑竖着插进长苔藓的石头里（剑身、金护手、皮握把、金柄头照旧剑图标的零件，去掉宝石）
  (function () {
    var G = 0xe2b23a;
    var sword = [
      P('iw_blade', [1.55, 0.32, 0.09, 0.28, 1.0], [0, 0.06, 0], STEEL, 'ch_plate'),
      P('box', [0.76, 0.13, 0.16], [0, 0.03, 0], G, 'gold'),
      P('oct', [0.085], [0.4, 0.03, 0], G, 'gold'),
      P('oct', [0.085], [-0.4, 0.03, 0], G, 'gold'),
      P('cyl', [0.06, 0.06, 0.44, 6], [0, -0.2, 0], LEATHER, 'ch_leather'),
      P('oct', [0.1], [0, -0.46, 0], G, 'gold')
    ];
    item('stoneblade', xf(sword, [0, 0, PI], [0, 0.95, 0]).concat([
      P('dodec', [0.6], [0, -0.25, 0], 0x8a8e96, 'rock', [0.3, 0.5, 0.1], [1.35, 0.8, 1.05], 0.9),
      P('dodec', [0.32], [0.62, -0.46, 0.22], 0x9a9ea6, 'rock', [0.7, 0.2, 0.4], [1.1, 0.8, 1], 0.9),
      P('dodec', [0.26], [-0.66, -0.5, 0.18], 0x7a7e86, 'rock', [0.2, 0.9, 0.3], [1.1, 0.8, 1], 0.9),
      P('sphere', [0.24, 8, 5], [-0.32, 0.14, 0.22], 0x4a8a3a, 'env_moss', null, [1.3, 0.35, 1]),
      P('sphere', [0.2, 8, 5], [0.3, 0.12, 0.3], 0x5a9a42, 'env_moss', null, [1.3, 0.35, 1]),
      P('sphere', [0.18, 8, 5], [0.1, 0.18, -0.28], 0x4a8a3a, 'env_moss', null, [1.3, 0.35, 1])
    ]), { yaw: 0.4, pitch: 0.3, zoom: 1.0 });
  })();

  // 圣剑鞘：金色剑鞘（鞘口、中间一道箍、尖头的鞘尾），鞘面三颗宝石，侧边一个挂环
  item('scabbard', [
    P('iw_taper', [0.26, 0.15, 1.3, 0.13, 0.09], [0, 0, 0], 0xffd040, 'gold'),
    P('cone', [0.08, 0.2, 6], [0, -0.75, 0], 0xd99a20, 'gold', [PI, 0, 0]),
    P('box', [0.18, 0.12, 0.11], [0, -0.6, 0], 0xd99a20, 'gold'),
    P('box', [0.32, 0.14, 0.17], [0, 0.6, 0], 0xd99a20, 'gold'),
    P('box', [0.2, 0.04, 0.1], [0, 0.68, 0], 0x3a2a1a, 'plain'),
    P('box', [0.27, 0.06, 0.15], [0, 0.22, 0], 0xd99a20, 'gold'),
    P('oct', [0.065], [0, 0.4, 0.075], 0xff3a4a, '!plain', null, [1, 1.3, 0.6]),
    P('oct', [0.06], [0, 0.02, 0.068], 0x3a8aff, '!plain', null, [1, 1.3, 0.6]),
    P('oct', [0.055], [0, -0.32, 0.058], 0xff3a4a, '!plain', null, [1, 1.3, 0.6]),
    P('ii_arc', [0.08, 0.025, 4, 10], [0.18, 0.46, 0], 0xd99a20, 'gold', [0, PI / 2, 0])
  ], { tilt: -PI / 4, yaw: 0.35, pitch: 0.3, zoom: 1.15 });

  // 龙吼战鼓：高高的红色木桶鼓（上下鼓圈、金绳拉成锯齿），朝镜头的这一面画着一条竖着的 S 形金龙
  // （龙头朝右、一只角、三片背鳍、细尾巴，后面垫一层深色描边），旁边两根鼓槌叉开成 V（两个红色槌头都看得见）
  (function () {
    var H = 1.1, YAW = 0.4, L = [], R = [], fins = [], i, N = 14;
    for (i = 0; i <= N; i++) {
      var t = i / N, cx = 0.13 * Math.sin(t * PI * 2), cy = -0.3 + 0.5 * t;
      var dx = 0.13 * PI * 2 * Math.cos(t * PI * 2), dy = 0.5, l = Math.sqrt(dx * dx + dy * dy), nx = -dy / l, ny = dx / l;
      var w = 0.016 + 0.05 * Math.min(1, t * 2.2);
      L.push(cx + nx * w, cy + ny * w); R.push(cx - nx * w, cy - ny * w);
      if (i === 5 || i === 8 || i === 11) fins.push([cx + nx * w, cy + ny * w, nx, ny, dx / l, dy / l]);
    }
    var body = L.slice();
    for (i = N; i >= 0; i--) body.push(R[i * 2], R[i * 2 + 1]);
    var shapes = [body, circle(8, 0.09, 0.03, 0.27), [0.1, 0.32, 0.22, 0.27, 0.1, 0.22], [-0.03, 0.33, -0.1, 0.45, 0.05, 0.35]].concat(fins.map(function (f) {
      return [f[0] - f[4] * 0.045, f[1] - f[5] * 0.045, f[0] + f[2] * 0.08 - f[4] * 0.02, f[1] + f[3] * 0.08 - f[5] * 0.02, f[0] + f[4] * 0.045, f[1] + f[5] * 0.045];
    }));
    var parts = [
      P('ii_lathe', [14, 0.36, 0, 0.42, 0.22 * H, 0.45, 0.5 * H, 0.42, 0.78 * H, 0.36, H], [0, 0, 0], RED, 'wood'),
      P('ii_arc', [0.37, 0.045, 5, 20], [0, H, 0], 0x4a2418, 'wood', [PI / 2, 0, 0]),
      P('ii_arc', [0.37, 0.045, 5, 20], [0, 0, 0], 0x4a2418, 'wood', [PI / 2, 0, 0]),
      P('cyl', [0.35, 0.35, 0.03, 16], [0, H + 0.005, 0], 0xf0e0c0, 'plain')
    ];
    // 金龙贴在朝镜头的鼓身上：先垫深色（倒角往外胀一圈），再盖金色
    var sx = Math.sin(YAW), sz = Math.cos(YAW);
    shapes.forEach(function (sh) {
      parts.push(P('ii_poly', [0.02, sh, 0.025], [sx * 0.455, 0.56, sz * 0.455], 0x4a1210, 'plain', [0, YAW, 0]));
      parts.push(P('ii_poly', [0.02, sh], [sx * 0.49, 0.56, sz * 0.49], 0xf0c03a, 'gold', [0, YAW, 0]));
    });
    parts.push(P('box', [0.035, 0.035, 0.02], [sx * 0.51 + sz * 0.05, 0.84, sz * 0.51 - sx * 0.05], 0x2a1008, 'plain', [0, YAW, 0]));
    // 金绳锯齿只拉在两侧和背面，正面留给金龙
    for (i = 0; i < 12; i++) {
      var b = i / 12 * PI * 2, da = Math.abs(((b - YAW) % (PI * 2) + PI * 3) % (PI * 2) - PI);
      if (da < 0.75) continue;
      parts.push(P('box', [0.03, 0.5 * H, 0.03], [Math.sin(b) * 0.465, 0.5 * H, Math.cos(b) * 0.465], GOLD, 'gold', [0, b, i % 2 ? 0.45 : -0.45]));
    }
    parts.push(rod('cyl', [0.7, -0.02, 0.24], [0.6, 1.24, 0.26], [0.03, 0.03, 6], 0xd8b080, 'wood'));
    parts.push(P('sphere', [0.08, 6, 5], [0.6, 1.24, 0.26], 0xc02020, 'plain'));
    parts.push(rod('cyl', [0.74, -0.02, 0.2], [0.9, 1.16, -0.06], [0.03, 0.03, 6], 0xd8b080, 'wood'));
    parts.push(P('sphere', [0.08, 6, 5], [0.9, 1.16, -0.06], 0xc02020, 'plain'));
    item('wardrum', parts, { yaw: YAW, pitch: 0.4, zoom: 0.95 });
  })();
})();
