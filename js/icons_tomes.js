'use strict';
// 纹章图标：每枚纹章画成一面骑士盾，盾面是家族的颜色，上面一个剪影（狮子、钥匙、新月……）
// 零件格式和游戏里的模型完全一样：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图名, 平面投影]
// ICONS.crestParts(id, opts) 把同一面盾交给别的图标用（家族徽章）
(function () {
  var PI = Math.PI;

  // ---------------- 小工具 ----------------
  // 把一组零件整体旋转（欧拉角）、缩放、平移；零件自己的旋转会正确叠加
  var gq = new THREE.Quaternion(), pq = new THREE.Quaternion(), eu = new THREE.Euler(), v3 = new THREE.Vector3();
  function xf(parts, rot, pos, k) {
    k = k || 1; rot = rot || [0, 0, 0]; pos = pos || [0, 0, 0];
    gq.setFromEuler(eu.set(rot[0], rot[1], rot[2]));
    return parts.map(function (p) {
      var q = p.slice(), r = p[4] || [0, 0, 0];
      v3.set(p[2][0] * k, p[2][1] * k, p[2][2] * k).applyQuaternion(gq);
      q[2] = [v3.x + pos[0], v3.y + pos[1], v3.z + pos[2]];
      pq.setFromEuler(eu.set(r[0], r[1], r[2])).premultiply(gq);
      eu.setFromQuaternion(pq);
      q[4] = [eu.x, eu.y, eu.z];
      if (k !== 1) { var s = p[5] || [1, 1, 1]; q[5] = [s[0] * k, s[1] * k, s[2] * k]; }
      return q;
    });
  }
  // 按位置合并法线：挤出来的形状变得圆鼓鼓的
  function smooth(g) {
    if (g.index) g = g.toNonIndexed();
    var p = g.attributes.position.array, n = new Float32Array(p.length), acc = {}, i, k;
    var key = function (j) { return Math.round(p[j] * 500) + ',' + Math.round(p[j + 1] * 500) + ',' + Math.round(p[j + 2] * 500); };
    for (i = 0; i < p.length; i += 9) {
      var ux = p[i + 3] - p[i], uy = p[i + 4] - p[i + 1], uz = p[i + 5] - p[i + 2];
      var vx = p[i + 6] - p[i], vy = p[i + 7] - p[i + 1], vz = p[i + 8] - p[i + 2];
      var nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (k = 0; k < 3; k++) {
        var a = acc[key(i + k * 3)] || (acc[key(i + k * 3)] = [0, 0, 0]);
        a[0] += nx; a[1] += ny; a[2] += nz;
      }
    }
    for (i = 0; i < p.length; i += 3) {
      var s = acc[key(i)], l = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) || 1;
      n[i] = s[0] / l; n[i + 1] = s[1] / l; n[i + 2] = s[2] / l;
    }
    g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
    return g;
  }
  // 沿曲线的管子
  function tube(fn, segs, r, rs) {
    var c = new THREE.Curve();
    c.getPoint = function (t, out) { return fn(t, out || new THREE.Vector3()); };
    return new THREE.TubeGeometry(c, segs, r, rs || 5, false);
  }

  // ---------------- 额外的零件形状（名字都以 tm_ 开头） ----------------
  // 圆鼓鼓的心形：[大小, 厚度]，正面朝 +z
  MODEL.extraGeo.tm_heart = function (s) {
    var k = s[0] || 1, d = s[1] || 0.2, sh = new THREE.Shape();
    sh.moveTo(0, -0.42 * k);
    sh.bezierCurveTo(-0.06 * k, -0.35 * k, -0.47 * k, -0.08 * k, -0.47 * k, 0.15 * k);
    sh.bezierCurveTo(-0.47 * k, 0.35 * k, -0.32 * k, 0.46 * k, -0.2 * k, 0.46 * k);
    sh.bezierCurveTo(-0.09 * k, 0.46 * k, -0.01 * k, 0.38 * k, 0, 0.27 * k);
    sh.bezierCurveTo(0.01 * k, 0.38 * k, 0.09 * k, 0.46 * k, 0.2 * k, 0.46 * k);
    sh.bezierCurveTo(0.32 * k, 0.46 * k, 0.47 * k, 0.35 * k, 0.47 * k, 0.15 * k);
    sh.bezierCurveTo(0.47 * k, -0.08 * k, 0.06 * k, -0.35 * k, 0, -0.42 * k);
    var g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: 0.14 * k, bevelSize: 0.1 * k, bevelSegments: 3, curveSegments: 6 });
    g.translate(0, 0, -d / 2);
    return smooth(g);
  };
  // 骑士盾（上沿微拱、下面收成尖）：[宽, 高, 厚]，正面朝 +z
  MODEL.extraGeo.tm_shield = function (s) {
    var w = s[0] / 2, h = s[1], d = s[2] || 0.1, sh = new THREE.Shape();
    var top = h * 0.45, mid = h * 0.02, bot = -h * 0.55;
    sh.moveTo(-w, top);
    sh.quadraticCurveTo(0, top + h * 0.1, w, top);
    sh.lineTo(w, mid);
    sh.quadraticCurveTo(w * 0.9, bot * 0.7, 0, bot);
    sh.quadraticCurveTo(-w * 0.9, bot * 0.7, -w, mid);
    sh.lineTo(-w, top);
    var g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: d * 0.5, bevelSize: d * 0.4, bevelSegments: 1, curveSegments: 5 });
    g.translate(0, 0, -d / 2);
    return g;
  };
  // 扁平的圆弧带（马蹄铁）：[外半径, 内半径, 起始角, 弧度, 厚]，正面朝 +z
  MODEL.extraGeo.tm_band = function (s) {
    var R = s[0], r = s[1], a0 = s[2], a1 = s[2] + s[3], d = s[4] || 0.1, sh = new THREE.Shape();
    sh.absarc(0, 0, R, a0, a1, false);
    sh.absarc(0, 0, r, a1, a0, true);
    var g = new THREE.ExtrudeGeometry(sh, { depth: d, bevelEnabled: true, bevelThickness: d * 0.3, bevelSize: d * 0.25, bevelSegments: 1, curveSegments: 14 });
    g.translate(0, 0, -d / 2);
    return g;
  };
  // 弹簧：沿 y 轴盘绕的管子 [盘绕半径, 管粗, 圈数, 长度]
  MODEL.extraGeo.tm_coil = function (s) {
    var R = s[0], turns = s[2] || 4, L = s[3] || 1;
    return tube(function (t, out) {
      var a = t * turns * PI * 2;
      return out.set(Math.cos(a) * R, (t - 0.5) * L, Math.sin(a) * R);
    }, Math.round(turns * 10), s[1], 5);
  };
  // 三叶结的一段（彩虹结）：[起点 0~1, 终点 0~1, 大小, 管粗]
  MODEL.extraGeo.tm_knot = function (s) {
    var t0 = s[0], t1 = s[1], R = s[2] || 0.5;
    return tube(function (t, out) {
      var u = (t0 + (t1 - t0) * t) * PI * 4, qu = 1.5 * u, cs = Math.cos(qu);
      return out.set(R * (2 + cs) * 0.5 * Math.cos(u), R * (2 + cs) * 0.5 * Math.sin(u), R * Math.sin(qu) * 0.5);
    }, 14, s[3] || 0.1, 6);
  };

  // 旋涡的一条臂：[圈数, 外半径, 内半径, 下沉深度, 管粗, 起始角]
  MODEL.extraGeo.tm_spiral = function (s) {
    return tube(function (t, out) {
      var a = s[5] + t * s[0] * PI * 2, r = s[1] + (s[2] - s[1]) * t;
      return out.set(Math.cos(a) * r, -s[3] * t * t, Math.sin(a) * r);
    }, Math.round(s[0] * 18), s[4], 6);
  };


  // ---------------- 纹章：钢边盾 + 家族颜色的盾面 + 一个挤出的剪影 ----------------
  // 剪影后面垫一层深色的同形状（倒角往外胀一圈），在 36px 下就是一道 1 像素的纹章描边：
  // 金配棕、棕配红、绿配绿也分得开（图标的描边只描整体外轮廓，里面的边要靠自己）
  // 剪影的坐标都画在盾面里面：x -0.42~0.42，y -0.48~0.42；正面朝 +z
  var CREST_FAMILY = { beast: 0xd9433b, bird: 0x4a8ad9, plant: 0x4ab04a, object: 0xb08a5a, sky: 0x8a6ad9 };   // = tables.json crestFamilies
  var CREST_CAM = { yaw: 0.28, pitch: 0.12, zoom: 1.0 };
  var INK = 0x14101e, OUT = 0.045;
  function shield(field, rim, rimTex) {
    return [
      ['tm_shield', [1.30, 1.50, 0.12], [0, 0, -0.07], rim || 0xc8d0da, null, null, rimTex || 'metal'],   // 盾边（大一圈，在后面）
      ['tm_shield', [1.10, 1.30, 0.12], [0, 0.01, 0], field, null, null, 'cloth']                         // 盾面（不发光，像涂了漆）
    ];
  }
  // 一个剪影 = 深色描边层 + 上色层；dz 把叠在别的剪影上的那块往前挪一点
  // 描边层往左下挪一点点：相机从右上方斜着看，上色层在前面会显得往左下偏，挪过去两边的描边才一样粗
  function charge(pts, col, tex, dz) {
    dz = dz || 0;
    return [
      ['ii_poly', [0.04, pts, OUT], [-0.02, -0.008, 0.13 + dz], INK, null, null, 'plain'],
      ['ii_poly', [0.08, pts, 0], [0, 0, 0.17 + dz], col, null, null, tex || 'plain']
    ];
  }
  // 小方块（眼睛、窗户）贴在剪影前面
  function dot(x, y, w, h, col, z) { return ['box', [w, h, 0.02], [x, y, z || 0.22], col, null, null, 'plain']; }
  // 左半边（从正上方的中线开始，顺着左边到正下方的中线）→ 左右对称的整圈
  function sym(half) {
    var out = half.slice();
    for (var i = half.length - 4; i >= 2; i -= 2) out.push(-half[i], half[i + 1]);
    return out;
  }
  // 星形：n 个角，外半径 R，内半径 r，第一个角朝上
  function starPts(n, R, r, cx, cy) {
    var out = [];
    for (var i = 0; i < n * 2; i++) {
      var a = PI / 2 + i * PI / n, k = i % 2 ? r : R;
      out.push(cx + Math.cos(a) * k, cy + Math.sin(a) * k);
    }
    return out;
  }
  // 一圈点：半径随角度变化 f(a)（树冠的圆鼓包）
  function loopPts(n, rx, ry, cx, cy, f) {
    var out = [];
    for (var i = 0; i < n; i++) {
      var a = PI / 2 + i * PI * 2 / n, k = f ? f(a) : 1;
      out.push(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k);
    }
    return out;
  }
  // 沿中心线描一笔：宽度从 w0 渐变到 w1（风的笔画）
  function strokePts(path, w0, w1) {
    var L = [], R = [], n = path.length;
    for (var i = 0; i < n; i++) {
      var a = path[Math.max(0, i - 1)], b = path[Math.min(n - 1, i + 1)];
      var dx = b[0] - a[0], dy = b[1] - a[1], l = Math.sqrt(dx * dx + dy * dy) || 1;
      var t = i / (n - 1), w = (w0 + (w1 - w0) * Math.sin(t * PI * 0.5)) / 2;
      L.push(path[i][0] - dy / l * w, path[i][1] + dx / l * w);
      R.unshift(path[i][0] + dy / l * w, path[i][1] - dx / l * w);
    }
    return L.concat(R);
  }
  // 一笔卷起来的风：从 (x0,y) 横着到 (x1,y)，末端绕一个半径 rc 的圈卷 turn 弧度；up=1 往上卷、-1 往下卷
  function curl(x0, x1, y, rc, turn, up) {
    var path = [], dir = x1 > x0 ? 1 : -1, i, n = 5;
    for (i = 0; i < n; i++) path.push([x0 + (x1 - x0) * i / n, y]);
    var cx = x1, cy = y + rc * up, a0 = -PI / 2 * up, m = 12;
    for (i = 0; i <= m; i++) {
      var a = a0 + dir * up * turn * i / m, k = 1 - 0.25 * i / m;
      path.push([cx + Math.cos(a) * rc * k, cy + Math.sin(a) * rc * k]);
    }
    return path;
  }
  // 弯月：大圆 (0,0,R) 减去偏到 (cx,cy) 的小圆 r，两角朝小圆那边
  function crescentPts(R, cx, cy, r, n) {
    var d = Math.sqrt(cx * cx + cy * cy), ph = Math.atan2(cy, cx);
    var al = Math.acos((R * R - r * r + d * d) / (2 * d * R)), out = [], i;
    for (i = 0; i <= n; i++) { var a = ph + al + (PI * 2 - al * 2) * i / n; out.push(Math.cos(a) * R, Math.sin(a) * R); }
    // 小圆上从后一个交点绕回前一个交点（经过靠大圆圆心的那边）
    var p1 = [Math.cos(ph + al) * R - cx, Math.sin(ph + al) * R - cy], p2 = [Math.cos(ph - al) * R - cx, Math.sin(ph - al) * R - cy];
    var b1 = Math.atan2(p1[1], p1[0]), b2 = Math.atan2(p2[1], p2[0]), db = b1 - b2;
    while (db > 0) db -= PI * 2;
    if (Math.abs(Math.cos((b2 + db / 2) - (ph + PI)) - 1) > 1) db += PI * 2;
    for (i = 1; i < n; i++) { var b = b2 + db * i / n; out.push(cx + Math.cos(b) * r, cy + Math.sin(b) * r); }
    return out;
  }
  // 钥匙（沿 +y：上面是匙环，下面是匙齿朝 side 那边）；描边层是同样的零件放大一圈、放在后面
  function key(side, z) {
    var G = 0xf0c03a, s = side, d = z - 0.04;
    var gold = [
      ['tm_band', [0.15, 0.08, 0, PI * 2, 0.06], [0, 0.34, z], G, null, null, 'gold'],
      ['box', [0.075, 0.62, 0.06], [0, -0.12, z], G, null, null, 'gold'],
      ['box', [0.16, 0.05, 0.06], [0, 0.17, z], G, null, null, 'gold'],
      ['box', [0.12, 0.06, 0.06], [s * 0.085, -0.4, z], G, null, null, 'gold'],
      ['box', [0.09, 0.06, 0.06], [s * 0.07, -0.29, z], G, null, null, 'gold']
    ];
    var ink = [
      ['tm_band', [0.19, 0.05, 0, PI * 2, 0.04], [0, 0.34, d], INK, null, null, 'plain'],
      ['box', [0.155, 0.7, 0.04], [0, -0.12, d], INK, null, null, 'plain'],
      ['box', [0.24, 0.13, 0.04], [0, 0.17, d], INK, null, null, 'plain'],
      ['box', [0.2, 0.14, 0.04], [s * 0.085, -0.4, d], INK, null, null, 'plain'],
      ['box', [0.17, 0.14, 0.04], [s * 0.07, -0.29, d], INK, null, null, 'plain']
    ];
    return ink.concat(gold);
  }

  var GOLD_C = 0xf0c03a, SILVER = 0xd8e0f0;
  var CHARGES = {
    // 猛兽：立起来的金狮子（朝左，前爪举起，鬃毛鼓起，一条后腿着地，尾巴 S 形翘起）
    lion: charge([
      -0.32, 0.36, -0.26, 0.42, -0.18, 0.44, -0.16, 0.52, -0.06, 0.46, 0.02, 0.52, 0.06, 0.42, 0.16, 0.44,
      0.12, 0.34, 0.20, 0.30, 0.12, 0.24, 0.16, 0.16, 0.08, 0.14, 0.12, 0.04, 0.20, -0.10, 0.26, -0.20,
      0.26, -0.30, 0.20, -0.40, 0.24, -0.54, 0.02, -0.54, 0.06, -0.48, 0.12, -0.46, 0.12, -0.36, 0.06, -0.30,
      -0.10, -0.38, -0.30, -0.42, -0.26, -0.34, -0.06, -0.26, 0.0, -0.18,
      -0.10, -0.12, -0.28, -0.14, -0.42, -0.10, -0.36, -0.07, -0.40, -0.02, -0.20, -0.04, -0.08, -0.02,
      -0.10, 0.06, -0.30, 0.10, -0.44, 0.16, -0.40, 0.22, -0.26, 0.18, -0.12, 0.16,
      -0.16, 0.22, -0.22, 0.26, -0.32, 0.26, -0.24, 0.30, -0.34, 0.32
    ], GOLD_C, 'gold').concat(
      charge(strokePts([[0.24, -0.24], [0.34, -0.24], [0.42, -0.14], [0.41, -0.02], [0.35, 0.07], [0.35, 0.15], [0.40, 0.21]], 0.07, 0.065), GOLD_C, 'gold', -0.01),
      charge([0.34, 0.20, 0.43, 0.17, 0.47, 0.28, 0.42, 0.38, 0.35, 0.32], GOLD_C, 'gold', -0.01),
      [dot(-0.22, 0.36, 0.045, 0.04, INK)]
    ),
    // 猛兽：仰头嚎叫的银狼头（长嘴朝左上、张开的上下颚、两只尖耳朵，脖子下面三撮大毛尖；眼睛是一道斜缝）
    direwolf: charge([
      -0.45, 0.33, -0.18, 0.39, -0.06, 0.40, 0.04, 0.54, 0.13, 0.38, 0.28, 0.50, 0.29, 0.28, 0.34, 0.10,
      0.39, -0.12, 0.43, -0.42, 0.28, -0.30, 0.17, -0.47, 0.06, -0.31, -0.07, -0.43, -0.09, -0.18, -0.13, -0.03,
      -0.27, 0.0, -0.41, 0.03, -0.38, 0.09, -0.15, 0.18, -0.47, 0.22
    ], 0xd0d8e4, 'metal').concat([
      ['ii_poly', [0.03, [0.03, 0.41, 0.045, 0.49, 0.085, 0.40], 0], [0, 0, 0.215], 0x8a94a4, null, null, 'plain'],
      ['ii_poly', [0.03, [0.30, 0.10, 0.36, -0.12, 0.40, -0.40, 0.28, -0.28, 0.17, -0.44, 0.07, -0.29, 0.16, -0.10], 0], [0, 0, 0.215], 0xa8b0bc, null, null, 'metal'],
      ['box', [0.10, 0.05, 0.02], [-0.08, 0.30, 0.23], INK, [0, 0, 0.3], null, 'plain']
    ]),
    // 猛兽：站起来的棕熊（朝左，前掌往前抬，圆耳朵，浅色的嘴）
    grizzly: charge([
      -0.39, 0.24, -0.37, 0.31, -0.25, 0.35, -0.19, 0.41, -0.12, 0.45, -0.04, 0.41, 0.05, 0.33, 0.19, 0.27,
      0.27, 0.08, 0.31, -0.14, 0.27, -0.30, 0.25, -0.47, 0.03, -0.47, 0.08, -0.37, 0.02, -0.28, -0.04, -0.31,
      -0.06, -0.47, -0.23, -0.47, -0.18, -0.36, -0.15, -0.2, -0.19, -0.04, -0.35, -0.03, -0.41, 0.06, -0.33, 0.12,
      -0.17, 0.10, -0.21, 0.18, -0.31, 0.18
    ], 0x6a4022, 'fur').concat([
      ['ii_poly', [0.04, [-0.39, 0.21, -0.38, 0.30, -0.28, 0.32, -0.25, 0.22], 0], [0, 0, 0.21], 0xc89a6a, null, null, 'plain'],
      dot(-0.41, 0.29, 0.04, 0.04, INK, 0.24),
      dot(-0.22, 0.32, 0.04, 0.04, INK, 0.22)
    ]),
    // 飞禽：展翅俯冲的金隼（两翼往上扬成 V，头朝下，尾羽散开）
    hawk: charge(sym([
      0, 0.35, -0.12, 0.44, -0.07, 0.14, -0.14, 0.23, -0.18, 0.15, -0.24, 0.31, -0.28, 0.22, -0.35, 0.39,
      -0.45, 0.44, -0.42, 0.30, -0.30, 0.09, -0.18, -0.12, -0.09, -0.19, -0.06, -0.25, -0.10, -0.31, -0.09, -0.40,
      -0.04, -0.46, 0, -0.52
    ]), GOLD_C, 'gold'),
    // 飞禽：侧身站着的渡鸦（朝左，粗嘴，两条腿）；翅膀上一块紫色的光泽
    raven: charge([
      -0.43, 0.17, -0.27, 0.31, -0.18, 0.37, -0.06, 0.35, 0.0, 0.25, 0.16, 0.15, 0.30, 0.03, 0.43, -0.14,
      0.41, -0.23, 0.24, -0.15, 0.12, -0.21, -0.10, -0.19, -0.20, -0.05, -0.24, 0.09, -0.27, 0.13
    ], 0x2a2438, 'plain').concat(
      charge([-0.03, -0.17, 0.03, -0.17, 0.03, -0.40, 0.09, -0.47, -0.10, -0.47, -0.03, -0.41], 0x2a2438, 'plain', -0.01),
      charge([0.09, -0.17, 0.15, -0.17, 0.15, -0.40, 0.21, -0.47, 0.02, -0.47, 0.09, -0.41], 0x2a2438, 'plain', -0.01),
      [['ii_poly', [0.03, [-0.06, 0.15, 0.16, 0.09, 0.36, -0.07, 0.12, -0.09, -0.08, 0.01], 0], [0, 0, 0.215], 0x5a4a7a, null, null, 'plain'],
        dot(-0.19, 0.27, 0.05, 0.05, 0xf4f4f4)]
    ),
    // 飞禽：正面的白猫头鹰（梨形身子、两撮耳羽、浅灰的脸盘、黄色圆眼睛、橙色小尖嘴，两边是灰色的翅膀边）
    owl: charge(sym([
      0, 0.27, -0.11, 0.29, -0.25, 0.45, -0.25, 0.24, -0.28, 0.08, -0.34, -0.08, -0.34, -0.22, -0.27, -0.36, -0.15, -0.45, 0, -0.48
    ]), 0xf4f4f8, 'cloth').concat([-1, 1].reduce(function (o, s) {
      return o.concat([
        ['ii_poly', [0.03, [s * 0.27, 0.06, s * 0.335, -0.08, s * 0.335, -0.22, s * 0.265, -0.355, s * 0.15, -0.44, s * 0.20, -0.24, s * 0.22, -0.06].concat(s < 0 ? [] : []), 0], [0, 0, 0.215], 0xc8ccd8, null, null, 'cloth'],
        ['cyl', [0.15, 0.15, 0.02, 14], [s * 0.115, 0.11, 0.215], 0xd8dce4, [PI / 2, 0, 0], null, 'plain'],
        ['cyl', [0.13, 0.13, 0.03, 14], [s * 0.12, 0.11, 0.23], 0xffd040, [PI / 2, 0, 0], null, 'plain'],
        ['cyl', [0.06, 0.06, 0.03, 10], [s * 0.12, 0.11, 0.25], INK, [PI / 2, 0, 0], null, 'plain']
      ]);
    }, []), [
      ['ii_poly', [0.03, [-0.06, 0.0, 0.06, 0.0, 0, -0.13], 0], [0, 0, 0.26], 0xe89a30, null, null, 'plain']
    ]),
    // 花木：三瓣的金百合（中间一瓣高，两边往外卷，中间一道横箍，下面短短的脚）
    lily: charge(sym([
      0, 0.45, -0.06, 0.35, -0.11, 0.23, -0.10, 0.12, -0.05, 0.05, -0.14, 0.16, -0.21, 0.27, -0.30, 0.31,
      -0.38, 0.27, -0.43, 0.17, -0.43, 0.05, -0.37, 0.12, -0.29, 0.12, -0.22, 0.06, -0.21, 0.02, -0.25, 0.02,
      -0.25, -0.09, -0.10, -0.09, -0.18, -0.19, -0.25, -0.33, -0.12, -0.29, -0.05, -0.21, 0, -0.41
    ]), 0xf0d060, 'gold'),
    // 花木：一棵圆冠橡树 + 两颗橡果（树冠比盾面深）
    oak: charge([-0.07, -0.05, 0.07, -0.05, 0.08, -0.37, 0.18, -0.47, -0.18, -0.47, -0.08, -0.37], 0x6a4022, 'bark', -0.01).concat(
      charge(loopPts(30, 0.40, 0.30, 0, 0.13, function (a) { return 0.86 + 0.18 * Math.abs(Math.cos(2.5 * (a - PI / 2))); }), 0x2e6a2a, 'leaf'),
      [-1, 1].reduce(function (o, s) {
        return o.concat([
          ['sphere', [0.105, 8, 6], [s * 0.27, -0.32, 0.2], INK, null, [0.95, 1.2, 0.5], 'plain'],
          ['sphere', [0.085, 8, 6], [s * 0.27, -0.335, 0.22], 0xc08a3a, null, [0.9, 1.15, 0.6], 'plain'],
          ['sphere', [0.09, 8, 4], [s * 0.27, -0.25, 0.23], 0x6a4022, null, [1, 0.55, 0.6], 'bark']
        ]);
      }, [])
    ),
    // 花木：一朵向日葵（金黄的花瓣，深棕的花盘，短茎一片叶子）
    sunflower: charge([-0.03, -0.12, 0.03, -0.12, 0.03, -0.47, -0.03, -0.47], 0x2e6a2a, 'leaf', -0.01).concat(
      charge([0.02, -0.34, 0.12, -0.24, 0.26, -0.22, 0.20, -0.34, 0.06, -0.40], 0x2e6a2a, 'leaf', -0.01),
      charge(starPts(12, 0.36, 0.23, 0, 0.09), 0xffc030, 'plain'),
      [['cyl', [0.17, 0.17, 0.04, 12], [0, 0.09, 0.22], 0x6a4022, [PI / 2, 0, 0], null, 'bark']]
    ),
    // 器物：三个垛口的城塔（浅灰的砖，拱门，一道窄窗）
    tower: charge([
      -0.30, -0.48, 0.30, -0.48, 0.26, -0.40, 0.24, 0.18, 0.32, 0.20, 0.32, 0.42, 0.20, 0.42, 0.20, 0.32,
      0.06, 0.32, 0.06, 0.42, -0.06, 0.42, -0.06, 0.32, -0.20, 0.32, -0.20, 0.42, -0.32, 0.42, -0.32, 0.20,
      -0.24, 0.18, -0.26, -0.40
    ], 0xc8ced6, 'brick').concat([
      ['ii_poly', [0.03, [-0.10, -0.48, 0.10, -0.48, 0.10, -0.24, 0.07, -0.17, 0, -0.14, -0.07, -0.17, -0.10, -0.24], 0], [0, 0, 0.215], 0x2a2a38, null, null, 'plain'],
      dot(0, 0.06, 0.05, 0.15, 0x2a2a38)
    ]),
    // 器物：两把交叉的金钥匙
    goldkey: xf(key(-1, 0.17), [0, 0, 0.75], [0, -0.02, 0]).concat(xf(key(1, 0.22), [0, 0, -0.75], [0, -0.02, 0])),
    // 器物：八根辐条的车轮（铁箍 + 深色木头；盾面本身就是木色）
    wheel: [
      ['tm_band', [0.40, 0.32, 0, PI * 2, 0.06], [0, -0.03, 0.16], 0x3a3e48, null, null, 'metal'],
      ['tm_band', [0.33, 0.26, 0, PI * 2, 0.05], [0, -0.03, 0.15], 0x5a3820, null, null, 'wood']
    ].concat([0, 1, 2, 3].map(function (i) {
      return ['box', [0.055, 0.56, 0.03], [0, -0.03, 0.15], 0x5a3820, [0, 0, i * PI / 4], null, 'wood'];
    }), [
      ['cyl', [0.09, 0.09, 0.06, 10], [0, -0.03, 0.18], 0x8a6a40, [PI / 2, 0, 0], null, 'wood'],
      ['cyl', [0.04, 0.04, 0.04, 8], [0, -0.03, 0.21], 0x3a3e48, [PI / 2, 0, 0], null, 'metal']
    ]),
    // 天象：三笔横着卷起来的风（不是漏斗）
    gale: charge(strokePts(curl(-0.02, 0.18, 0.22, 0.11, PI * 1.45, 1), 0.03, 0.085), 0x7ad9c8, 'plain').concat(
      charge(strokePts(curl(0.40, -0.20, 0.0, 0.11, PI * 1.45, 1), 0.03, 0.085), 0x7ad9c8, 'plain'),
      charge(strokePts(curl(-0.36, 0.14, -0.24, 0.10, PI * 1.45, -1), 0.03, 0.085), 0x7ad9c8, 'plain')
    ),
    // 天象：银色六角星
    starry: charge(starPts(6, 0.42, 0.19, 0, -0.03), SILVER, 'metal').concat([
      ['oct', [0.075], [0, -0.03, 0.22], 0xffffff, null, [1, 1, 0.5], 'plain']
    ]),
    // 天象：一弯银色新月（两角朝右上）
    crescent: charge(crescentPts(0.40, 0.15, 0.11, 0.33, 20).map(function (v, i) { return i % 2 ? v - 0.03 : v; }), SILVER, 'metal')
  };

  // 别的图标（家族徽章）也用这个盾：返回零件数组，盾在原点、正面朝 +z、高 1.5；
  // opts.rim / opts.rimTex 换盾边的颜色和贴图。家族颜色在渲染时才从 TOMES 里读（data.js 在图标文件后面加载）
  ICONS.crestParts = function (id, opts) {
    opts = opts || {};
    var t = typeof TOMES !== 'undefined' ? TOMES[id] : null;
    var field = (t && CREST_FAMILY[t.family]) || 0x8a8e96;
    return shield(field, opts.rim, opts.rimTex).concat(CHARGES[id] || []).map(function (p) { return p.slice(); });
  };
  function crest(id) {
    ICONS.model('cr_' + id, function () { return new THREE.Mesh(MODEL.build(ICONS.crestParts(id), false), MODEL.material()); }, CREST_CAM);
    ICONS.use('tome', id, 'cr_' + id);
  }
  Object.keys(CHARGES).forEach(crest);
})();
