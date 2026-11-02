'use strict';
// 魔典图标：每本魔典画成它代表的东西（ICONS.model 定义低多边形模型，ICONS.use 对应到游戏 id）
// 零件格式和游戏里的模型完全一样：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图名, 平面投影]

// 敏捷魔典 = 一只带翅膀的皮靴（翅膀是三根往后上方扫的白羽毛，和火焰行者的靴子区分开）
ICONS.model('boot', [
  ['box', [0.5, 0.95, 0.55], [0, 0.78, -0.12], 0x8a5a2e, null, null, 'ch_leather'],
  ['box', [0.56, 0.14, 0.62], [0, 1.25, -0.12], 0x6a4020, null, null, 'ch_leather'],
  ['box', [0.5, 0.38, 1.0], [0, 0.2, 0.12], 0x8a5a2e, null, null, 'ch_leather'],
  ['box', [0.54, 0.1, 1.06], [0, 0.0, 0.12], 0x3a2614, null, null, 'wood'],
  ['box', [0.12, 0.12, 0.06], [0, 0.62, 0.17], 0xffd84a, null, null, 'gold']
].concat([[1.0, 0.72, 1.06, 0xffffff], [0.62, 0.6, 0.93, 0xeef3ff], [0.28, 0.48, 0.8, 0xdde6f6]].map(function (f) {
  // [仰角, 长度, 根部高度, 颜色]：羽毛从靴筒外侧后方长出来
  return ['box', [0.06, 0.15, f[1]], [0.29, f[2] + Math.sin(f[0]) * f[1] / 2, -0.36 - Math.cos(f[0]) * f[1] / 2], f[3], [f[0], 0, 0], null, 'ch_feather'];
})), { yaw: 0.9, pitch: 0.3, zoom: 0.9 });
ICONS.use('tome', 'agi', 'boot');

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
  // 沿 +y 建好的零件组，转到指向 dir
  function aim(parts, dir, pos) {
    var q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dir[0], dir[1], dir[2]).normalize());
    var e = new THREE.Euler().setFromQuaternion(q);
    return xf(parts, [e.x, e.y, e.z], pos);
  }
  // 左右镜像
  function mirror(parts) {
    return parts.map(function (p) {
      var q = p.slice(), r = p[4];
      q[2] = [-p[2][0], p[2][1], p[2][2]];
      if (r) q[4] = [r[0], -r[1], -r[2]];
      return q;
    });
  }
  // 有发光零件的图标：发光部分不受光照（和游戏里的火球、灵魂一样），其余照常打光
  var glowMat = null;
  function glow(parts, glowParts) {
    return function () {
      if (!glowMat) glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas });
      var g = new THREE.Group();
      g.add(new THREE.Mesh(MODEL.build(parts, false), MODEL.material()));
      g.add(new THREE.Mesh(MODEL.build(glowParts, false), glowMat));
      return g;
    };
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
  // 三叶结的一段（混沌魔典的彩虹结）：[起点 0~1, 终点 0~1, 大小, 管粗]
  MODEL.extraGeo.tm_knot = function (s) {
    var t0 = s[0], t1 = s[1], R = s[2] || 0.5;
    return tube(function (t, out) {
      var u = (t0 + (t1 - t0) * t) * PI * 4, qu = 1.5 * u, cs = Math.cos(qu);
      return out.set(R * (2 + cs) * 0.5 * Math.cos(u), R * (2 + cs) * 0.5 * Math.sin(u), R * Math.sin(qu) * 0.5);
    }, 14, s[3] || 0.1, 6);
  };

  // 旋涡的一条臂（吸引魔典）：[圈数, 外半径, 内半径, 下沉深度, 管粗, 起始角]
  MODEL.extraGeo.tm_spiral = function (s) {
    return tube(function (t, out) {
      var a = s[5] + t * s[0] * PI * 2, r = s[1] + (s[2] - s[1]) * t;
      return out.set(Math.cos(a) * r, -s[3] * t * t, Math.sin(a) * r);
    }, Math.round(s[0] * 18), s[4], 6);
  };

  // ---------------- 常用小部件 ----------------
  // 竖直的六棱水晶，上下带尖（和地上的经验水晶一样）
  function crystal(h, r, c, top) {
    return [
      ['cyl', [r, r, h, 6], [0, 0, 0], c, null, null, 'plain', 1],
      ['cone', [r, r * 1.6, 6], [0, h / 2 + r * 0.8, 0], top || c, null, null, 'plain', 1],
      ['cone', [r, r * 1.1, 6], [0, -h / 2 - r * 0.55, 0], c, [PI, 0, 0], null, 'plain', 1]
    ];
  }

  // ---------------- 伤害：两把交叉的剑 ----------------
  (function () {
    // 剑身中点在原点、剑尖朝 +y；剑身中间一道血槽
    var sword = [
      ['box', [0.26, 1.5, 0.08], [0, 0, 0], 0xe8eef6, null, null, 'metal'],
      ['cone', [0.13, 0.34, 4], [0, 0.92, 0], 0xe8eef6, null, [1, 1, 0.3], 'metal'],
      ['box', [0.07, 1.25, 0.09], [0, -0.05, 0], 0xd0283a, null, null, 'plain'],
      ['box', [0.8, 0.15, 0.2], [0, -0.82, 0], 0xffc83a, null, null, 'gold'],
      ['oct', [0.09], [0, -0.82, 0.1], 0xff3a4a, null, null, 'plain'],
      ['cyl', [0.07, 0.07, 0.38, 6], [0, -1.08, 0], 0x7a2a1a, null, null, 'ch_leather'],
      ['sphere', [0.12, 6, 4], [0, -1.33, 0], 0xffc83a, null, null, 'gold']
    ];
    ICONS.model('tome_dmg', xf(sword, [0, 0, 0.74], [0, 0, 0.06]).concat(xf(sword, [0, 0, -0.74], [0, 0, -0.06])), { yaw: 0.25, pitch: 0.12 });
  })();

  // ---------------- 冷却：装着蓝色魔法沙的沙漏 ----------------
  (function () {
    var sand = 0x3ab8ff, glass = 0xe0f6ff, p = [
      ['cyl', [0.58, 0.58, 0.15, 8], [0, 0.88, 0], 0x7a4a24, null, null, 'wood'],
      ['cyl', [0.58, 0.58, 0.15, 8], [0, -0.88, 0], 0x7a4a24, null, null, 'wood'],
      ['cyl', [0.42, 0.42, 0.08, 8], [0, 0.99, 0], 0xffc83a, null, null, 'gold'],
      ['cyl', [0.42, 0.42, 0.08, 8], [0, -0.99, 0], 0xffc83a, null, null, 'gold'],
      // 玻璃（上下两半）和沙子：上面的沙子快漏完了，下面堆起来
      ['ch_lathe', [10, 0.3, 0.22, 0.42, 0.45, 0.39, 0.66, 0.24, 0.8], [0, 0, 0], glass, null, null, 'plain'],
      ['ch_lathe', [10, 0.05, 0.0, 0.16, 0.08, 0.3, 0.22], [0, 0, 0], sand, null, null, 'sand'],
      ['ch_lathe', [10, 0.39, -0.36, 0.3, -0.22, 0.16, -0.08, 0.05, 0.0], [0, 0, 0], glass, null, null, 'plain'],
      ['ch_lathe', [10, 0.24, -0.8, 0.39, -0.66, 0.42, -0.48, 0.39, -0.36], [0, 0, 0], sand, null, null, 'sand']
    ];
    [0.5 + PI / 2, 0.5 - PI / 2, 0.5 + PI].forEach(function (a) {
      p.push(['cyl', [0.065, 0.065, 1.62, 5], [Math.sin(a) * 0.49, 0, Math.cos(a) * 0.49], 0x5a3418, null, null, 'wood']);
    });
    ICONS.model('tome_cd', p, { yaw: 0.5, pitch: 0.22, tilt: -0.3 });
  })();

  // ---------------- 数量：扇形散开的三支箭 ----------------
  (function () {
    var arw = [
      ['box', [0.11, 1.5, 0.11], [0, 0, 0], 0xb07a40, null, null, 'wood'],
      ['cone', [0.22, 0.46, 4], [0, 0.96, 0], 0xe8eef6, null, [1, 1, 0.4], 'metal'],
      ['ch_tbox', [0.08, 0.4, 0.48, 0.04, 0.04], [0, -0.55, 0], 0xff9a2a, null, null, 'ch_feather'],
      ['ch_tbox', [0.04, 0.04, 0.48, 0.08, 0.4], [0, -0.55, 0], 0xff8a1a, null, null, 'ch_feather']
    ];
    var a = xf(arw, null, [0, 1.15, 0]), p = [];
    [0.5, 0, -0.5].forEach(function (r, i) { p = p.concat(xf(a, [0, 0, r], [0, 0, i === 1 ? 0.08 : 0])); });
    ICONS.model('tome_qty', p, { yaw: 0.3, pitch: 0.2 });
  })();

  // ---------------- 精准：靶心 + 正中的箭 ----------------
  (function () {
    var ring = function (r, z, c) { return ['cyl', [r, r, 0.04, 16], [0, 0, z], c, [PI / 2, 0, 0], null, 'plain']; };
    var p = [
      ['cyl', [0.86, 0.86, 0.22, 16], [0, 0, -0.1], 0xb07a40, [PI / 2, 0, 0], null, 'wood'],
      ring(0.8, 0.02, 0xf4f0e6), ring(0.63, 0.04, 0xe0282e), ring(0.46, 0.06, 0xf4f0e6), ring(0.29, 0.08, 0xe0282e), ring(0.13, 0.1, 0xffd23a)
    ];
    var stuck = [
      ['box', [0.09, 0.95, 0.09], [0, 0.47, 0], 0xb07a40, null, null, 'wood'],
      ['ch_tbox', [0.38, 0.08, 0.38, 0.04, 0.04], [0, 0.76, 0], 0x3a8af0, null, null, 'ch_feather'],
      ['ch_tbox', [0.04, 0.04, 0.38, 0.38, 0.08], [0, 0.76, 0], 0x2a6ad0, null, null, 'ch_feather']
    ];
    // 木头三脚架
    p.push(['box', [0.11, 1.0, 0.1], [-0.42, -0.72, -0.12], 0x7a4a24, [0.15, 0, -0.35], null, 'wood']);
    p.push(['box', [0.11, 1.0, 0.1], [0.42, -0.72, -0.12], 0x7a4a24, [0.15, 0, 0.35], null, 'wood']);
    p.push(['box', [0.1, 1.0, 0.1], [0, -0.6, -0.42], 0x6a3a1c, [-0.5, 0, 0], null, 'wood']);
    ICONS.model('tome_prec', p.concat(aim(stuck, [0.55, 0.3, 0.75], [0.02, 0.02, 0.1])), { yaw: 0.35, pitch: 0.2 });
  })();

  // ---------------- 体积：放大镜 ----------------
  (function () {
    var d = function (t) { return [t * 0.707, -t * 0.707, 0]; };
    ICONS.model('tome_size', [
      ['torus', [0.5, 0.09, 6, 16], [0, 0, 0], 0xffc83a, null, null, 'gold'],
      ['cyl', [0.47, 0.47, 0.04, 16], [0, 0, 0], 0xbfe8ff, [PI / 2, 0, 0], null, 'plain'],
      ['box', [0.08, 0.32, 0.02], [-0.2, 0.15, 0.04], 0xffffff, [0, 0, -0.7], null, 'plain'],
      ['cyl', [0.09, 0.09, 0.2, 8], d(0.68), 0xffc83a, [0, 0, PI / 4], null, 'gold'],
      ['cyl', [0.1, 0.08, 0.62, 8], d(1.08), 0x8b5bd9, [0, 0, PI / 4], null, 'wood'],
      ['sphere', [0.1, 6, 4], d(1.42), 0xffc83a, null, null, 'gold']
    ], { yaw: 0.3, pitch: 0.2 });
  })();

  // ---------------- 生命：大红心 ----------------
  ICONS.model('tome_hp', [
    ['tm_heart', [1, 0.22], [0, 0, 0], 0xe8203a, null, null, 'plain'],
    ['sphere', [0.08, 6, 4], [-0.2, 0.2, 0.25], 0xffd0d8, null, [1.3, 1, 0.5], 'plain']
  ], { yaw: 0.35, pitch: 0.15 });

  // ---------------- 再生：绿心 + 白色十字 ----------------
  ICONS.model('tome_regen', [
    ['tm_heart', [1, 0.22], [0, 0, 0], 0x34c45a, null, null, 'plain'],
    ['box', [0.4, 0.12, 0.08], [0, 0.04, 0.26], 0xffffff, null, null, 'plain'],
    ['box', [0.12, 0.4, 0.08], [0, 0.04, 0.26], 0xffffff, null, null, 'plain']
  ], { yaw: 0.35, pitch: 0.15 });

  // ---------------- 护盾：发光的蓝色骑士盾 ----------------
  ICONS.model('tome_shield', [
    ['tm_shield', [1.25, 1.45, 0.1], [0, 0, -0.06], 0xe8f4ff, null, null, 'metal'],
    ['tm_shield', [1.05, 1.25, 0.1], [0, 0, 0.02], 0x4ab8ff, null, null, 'plain'],
    ['oct', [0.2], [0, 0.05, 0.14], 0xe0f8ff, null, [1, 1.3, 0.6], 'plain']
  ], { yaw: 0.35, pitch: 0.15 });

  // ---------------- 护甲：骑士桶盔 ----------------
  ICONS.model('tome_armor', [
    ['cyl', [0.44, 0.46, 0.86, 8], [0, 0, 0], 0xc0c8d2, [0, PI / 8, 0], null, 'ch_plate'],
    ['cyl', [0.3, 0.44, 0.16, 8], [0, 0.51, 0], 0xb0b8c4, [0, PI / 8, 0], null, 'metal'],
    ['cyl', [0.48, 0.48, 0.07, 8], [0, -0.42, 0], 0x8a929e, [0, PI / 8, 0], null, 'metal'],
    ['box', [0.74, 0.08, 0.08], [0, 0.1, 0.41], 0x14141c, null, null, 'plain'],
    ['box', [0.1, 0.62, 0.06], [0, -0.04, 0.44], 0xffc83a, null, null, 'gold'],
    ['box', [0.62, 0.08, 0.06], [0, 0.2, 0.43], 0xffc83a, null, null, 'gold'],
    ['box', [0.05, 0.05, 0.04], [0.2, -0.14, 0.42], 0x14141c],
    ['box', [0.05, 0.05, 0.04], [0.2, -0.26, 0.42], 0x14141c],
    ['box', [0.05, 0.05, 0.04], [-0.2, -0.14, 0.42], 0x14141c],
    ['box', [0.05, 0.05, 0.04], [-0.2, -0.26, 0.42], 0x14141c]
  ], { yaw: 0.5, pitch: 0.18, zoom: 0.88 });

  // ---------------- 闪避：蓝闪蝶 ----------------
  (function () {
    var half = [
      ['sphere', [0.46, 8, 5], [0.42, 0.22, -0.02], 0x1a2a6a, [0, 0, 0.45], [1, 0.74, 0.1], 'plain'],
      ['sphere', [0.42, 8, 5], [0.42, 0.22, 0], 0x3aa8ff, [0, 0, 0.45], [1, 0.72, 0.12], 'plain'],
      ['sphere', [0.34, 8, 5], [0.3, -0.26, -0.02], 0x1a2a6a, [0, 0, -0.5], [0.85, 1.0, 0.1], 'plain'],
      ['sphere', [0.3, 8, 5], [0.3, -0.26, 0], 0x2a88f0, [0, 0, -0.5], [0.85, 1.0, 0.12], 'plain'],
      ['sphere', [0.07, 5, 4], [0.66, 0.42, 0.05], 0xffffff, null, [1, 1, 0.4], 'plain'],
      ['sphere', [0.05, 5, 4], [0.5, 0.5, 0.05], 0xffffff, null, [1, 1, 0.4], 'plain'],
      ['box', [0.025, 0.36, 0.025], [0.08, 0.58, 0.04], 0x2a2a3a, [0, 0, -0.35]],
      ['sphere', [0.04, 4, 3], [0.15, 0.75, 0.04], 0x2a2a3a]
    ];
    ICONS.model('tome_evade', xf(half, [0, -0.35, 0]).concat(xf(mirror(half), [0, 0.35, 0])).concat([
      ['cyl', [0.065, 0.05, 0.72, 6], [0, 0, 0.04], 0x2a2a3a, null, null, 'fur'],
      ['sphere', [0.09, 6, 4], [0, 0.4, 0.04], 0x2a2a3a]
    ]), { yaw: 0.2, pitch: 0.35, zoom: 1.04 });
  })();

  // ---------------- 鲜血：盛满鲜血、往外淌的金杯 ----------------
  ICONS.model('tome_blood', [
    ['cyl', [0.34, 0.4, 0.09, 10], [0, -0.8, 0], 0xd9a53a, null, null, 'gold'],
    ['cyl', [0.07, 0.11, 0.5, 8], [0, -0.52, 0], 0xffc83a, null, null, 'gold'],
    ['sphere', [0.12, 8, 5], [0, -0.44, 0], 0xffd84a, null, [1, 0.8, 1], 'gold'],
    ['ch_lathe', [12, 0.06, -0.3, 0.3, -0.2, 0.44, 0.0, 0.5, 0.28], [0, 0, 0], 0xffc83a, null, null, 'gold'],
    ['torus', [0.49, 0.045, 4, 12], [0, 0.29, 0], 0xffe27a, [PI / 2, 0, 0], null, 'gold'],
    ['cyl', [0.47, 0.47, 0.04, 12], [0, 0.25, 0], 0xc8102a, null, null, 'plain'],
    ['oct', [0.09], [0, -0.05, 0.4], 0xff3a5a, null, [1, 1.3, 0.6], 'plain'],
    ['box', [0.09, 0.3, 0.06], [0.2, 0.14, 0.42], 0xc8102a, [-0.25, 0, 0], null, 'plain'],
    ['sphere', [0.065, 6, 4], [0.2, -0.01, 0.39], 0xc8102a, null, null, 'plain'],
    ['box', [0.08, 0.18, 0.06], [-0.24, 0.2, 0.4], 0xc8102a, [-0.25, 0, 0], null, 'plain'],
    ['sphere', [0.055, 6, 4], [-0.24, 0.1, 0.39], 0xc8102a, null, null, 'plain']
  ], { yaw: 0.35, pitch: 0.38, zoom: 0.88 });

  // ---------------- 荆棘：盆栽仙人掌 ----------------
  (function () {
    var G = 0x4e9a34, sp = function (x, y, z, rz, rx) { return ['cone', [0.04, 0.16, 3], [x, y, z], 0xfff6c8, [rx || 0, 0, rz], null, 'plain']; };
    ICONS.model('tome_thorns', [
      ['cyl', [0.38, 0.3, 0.42, 8], [0, -0.78, 0], 0xc8643a, null, null, 'brick'],
      ['cyl', [0.43, 0.43, 0.12, 8], [0, -0.53, 0], 0xd8744a, null, null, 'brick'],
      ['cyl', [0.25, 0.27, 1.0, 8], [0, -0.02, 0], 0x5aa83a, null, null, 'env_cactus'],
      ['sphere', [0.25, 8, 4], [0, 0.48, 0], 0x5aa83a, null, [1, 0.8, 1], 'env_cactus'],
      ['cyl', [0.12, 0.12, 0.3, 6], [-0.33, -0.08, 0], G, [0, 0, PI / 2], null, 'env_cactus'],
      ['cyl', [0.13, 0.13, 0.45, 6], [-0.45, 0.12, 0], G, null, null, 'env_cactus'],
      ['sphere', [0.13, 6, 4], [-0.45, 0.35, 0], G, null, null, 'env_cactus'],
      ['cyl', [0.11, 0.11, 0.28, 6], [0.32, 0.1, 0], G, [0, 0, PI / 2], null, 'env_cactus'],
      ['cyl', [0.12, 0.12, 0.36, 6], [0.43, 0.26, 0], G, null, null, 'env_cactus'],
      ['sphere', [0.12, 6, 4], [0.43, 0.44, 0], G, null, null, 'env_cactus'],
      sp(0, 0.72, 0, 0), sp(-0.27, 0.3, 0, PI / 2), sp(0.27, -0.2, 0, -PI / 2), sp(-0.27, -0.35, 0, PI / 2),
      sp(-0.6, 0.15, 0, PI / 2), sp(-0.45, 0.52, 0, 0.3), sp(0.57, 0.3, 0, -PI / 2), sp(0.45, 0.6, 0, -0.3),
      sp(0.1, 0.1, 0.27, 0, PI / 2), sp(-0.1, -0.3, 0.27, 0, PI / 2), sp(0.05, 0.38, 0.24, 0, 1.2)
    ], { yaw: 0.35, pitch: 0.2 });
  })();

  // ---------------- 弹速：拖着光尾飞的箭 ----------------
  (function () {
    var a = [
      ['box', [0.11, 1.5, 0.11], [0, 0.1, 0], 0xe0b878, null, null, 'wood'],
      ['cone', [0.25, 0.54, 4], [0, 1.12, 0], 0xe8eef6, null, [1, 1, 0.4], 'metal'],
      ['ch_tbox', [0.08, 0.4, 0.46, 0.04, 0.04], [0, -0.42, 0], 0x5ad0f0, null, null, 'ch_feather'],
      ['ch_tbox', [0.04, 0.04, 0.46, 0.08, 0.4], [0, -0.42, 0], 0x3ab8e8, null, null, 'ch_feather']
    ];
    // 光尾（不受光照）：三道往后拉长的青色尾焰
    var tail = [
      ['cone', [0.3, 1.3, 6], [0, -1.1, -0.05], 0x7ad9f0, [PI, 0, 0], null, 'plain'],
      ['cone', [0.16, 0.9, 5], [0.3, -0.85, -0.05], 0xbfeeff, [PI, 0, -0.12], null, 'plain'],
      ['cone', [0.16, 0.9, 5], [-0.3, -0.85, -0.05], 0xbfeeff, [PI, 0, 0.12], null, 'plain']
    ];
    ICONS.model('tome_pspd', glow(xf(a, [0, 0, -0.8]), xf(tail, [0, 0, -0.8])), { yaw: 0.2, pitch: 0.15 });
  })();

  // ---------------- 持续：长明蜡烛 ----------------
  ICONS.model('tome_dur', glow([
    ['cyl', [0.5, 0.44, 0.1, 10], [0, -0.6, 0], 0xd9a53a, null, null, 'gold'],
    ['cyl', [0.54, 0.54, 0.05, 10], [0, -0.54, 0], 0xffd84a, null, null, 'gold'],
    ['torus', [0.12, 0.04, 4, 8], [0.6, -0.56, 0], 0xffd84a, null, null, 'gold'],
    ['cyl', [0.2, 0.21, 0.92, 8], [0, -0.06, 0], 0xb48ae8, null, null, 'bone'],
    ['cyl', [0.215, 0.2, 0.07, 8], [0, 0.4, 0], 0xd0b4ff, null, null, 'bone'],
    ['box', [0.08, 0.32, 0.08], [0.12, 0.25, 0.16], 0xd0b4ff, null, null, 'bone'],
    ['sphere', [0.05, 5, 4], [0.12, 0.09, 0.16], 0xd0b4ff, null, null, 'bone'],
    ['box', [0.07, 0.2, 0.07], [-0.16, 0.31, 0.12], 0xd0b4ff, null, null, 'bone'],
    ['box', [0.03, 0.12, 0.03], [0, 0.48, 0], 0x2a2a2a, null, null, 'plain']
  ], [
    ['sphere', [0.12, 6, 4], [0, 0.6, 0], 0xff8a1a, null, null, 'plain'],
    ['cone', [0.12, 0.38, 6], [0, 0.82, 0], 0xff8a1a, null, null, 'plain'],
    ['cone', [0.07, 0.25, 5], [0, 0.72, 0.08], 0xffe27a, null, null, 'plain'],
    ['sphere', [0.06, 5, 4], [0, 0.6, 0.09], 0xfff4c0, null, null, 'plain']
  ]), { yaw: 0.5, pitch: 0.25 });

  // ---------------- 击退：装在弹簧上的拳击手套 ----------------
  ICONS.model('tome_kb', [
    ['sphere', [0.44, 10, 7], [0.3, 0, 0], 0xe02a2a, null, [1.05, 0.92, 0.95], 'ch_leather'],
    ['sphere', [0.32, 8, 6], [0.0, -0.03, 0], 0xd02424, null, null, 'ch_leather'],
    ['sphere', [0.13, 6, 4], [0.22, 0.2, 0.34], 0xc81e1e, null, [2.0, 1, 1], 'ch_leather'],
    ['cyl', [0.26, 0.29, 0.34, 8], [-0.29, -0.03, 0], 0xf4f4f4, [0, 0, PI / 2], null, 'cloth'],
    ['cyl', [0.3, 0.3, 0.06, 8], [-0.13, -0.03, 0], 0xb01818, [0, 0, PI / 2], null, 'plain'],
    ['tm_coil', [0.15, 0.05, 2.5, 0.42], [-0.66, -0.03, 0], 0xc8d0d8, [0, 0, PI / 2], null, 'metal'],
    ['box', [0.1, 0.4, 0.4], [-0.9, -0.03, 0], 0x7a4a24, null, null, 'wood']
  ], { yaw: 0.0, pitch: 0.25, tilt: 0.5, zoom: 1.12 });

  // ---------------- 吸引：把经验水晶卷进去的粉色旋涡 ----------------
  (function () {
    var p = [
      ['tm_spiral', [1.05, 0.8, 0.1, 0.3, 0.12, 0], [0, 0, 0], 0xff5ad0, null, null, 'plain'],
      ['tm_spiral', [1.05, 0.8, 0.1, 0.3, 0.12, PI], [0, 0, 0], 0xc02aa0, null, null, 'plain']
    ];
    var gems = xf(crystal(0.34, 0.15, 0x8fd8ff, 0xe0f8ff), [0.5, 0, 1.0], [0.55, 0.2, 0.4])
      .concat(xf(crystal(0.28, 0.13, 0x6cc0ff, 0xe0f8ff), [-0.5, 0, -1.0], [-0.55, 0.16, -0.35]));
    ICONS.model('tome_attract', glow(p.concat(gems), [['sphere', [0.16, 8, 6], [0, -0.3, 0], 0xffd0f4, null, null, 'plain']]), { yaw: 0.4, pitch: 0.75, zoom: 1.12 });
  })();

  // ---------------- 幸运：开口朝上的铁马蹄铁 + 绿色闪光 ----------------
  (function () {
    var c = 0xd0d8e2, a0 = PI - 0.6, a1 = 0.6, p = [['tm_band', [0.66, 0.36, a0, PI + 1.2, 0.14], [0, 0, 0], c, null, null, 'metal']];
    // 两头的防滑钉
    [a0 - 0.12, a1 + 0.12].forEach(function (a) { p.push(['box', [0.3, 0.13, 0.22], [Math.cos(a) * 0.51, Math.sin(a) * 0.51, 0], c, [0, 0, a + PI / 2], null, 'metal']); });
    // 钉孔
    [2.8, 3.4, 4.0, 5.42, 6.02, 6.62].forEach(function (a) {
      p.push(['box', [0.07, 0.07, 0.04], [Math.cos(a) * 0.51, Math.sin(a) * 0.51, 0.12], 0x3a2a10, [0, 0, a]]);
    });
    // 绿色的幸运闪光（四角星）
    [[0.0, 0.5, 0.13], [0.44, 0.84, 0.1]].forEach(function (s) {
      p.push(['oct', [s[2]], [s[0], s[1], 0.05], 0x7aff5a, null, [0.6, 1.8, 0.5], 'plain']);
      p.push(['oct', [s[2]], [s[0], s[1], 0.05], 0x7aff5a, null, [1.8, 0.6, 0.5], 'plain']);
    });
    ICONS.model('tome_luck', p, { yaw: 0.3, pitch: 0.2, tilt: -0.2, zoom: 1.22 });
  })();

  // ---------------- 经验：一簇蓝色水晶 ----------------
  ICONS.model('tome_xp', [
    ['dodec', [0.4], [0, -0.48, 0], 0x5a5a6a, null, [1.3, 0.5, 1.0], 'rock']
  ].concat(
    xf(crystal(0.7, 0.2, 0x8fd8ff, 0xe0f8ff), null, [0, 0.1, 0]),
    xf(crystal(0.42, 0.15, 0x5aa8ff, 0xc0e4ff), [0, 0, 0.55], [-0.3, -0.12, 0.05]),
    xf(crystal(0.36, 0.13, 0xb0e8ff, 0xe8faff), [0.2, 0, -0.6], [0.28, -0.16, 0.1])
  ), { yaw: 0.4, pitch: 0.2 });

  // ---------------- 黄金：一摞摞金币 ----------------
  (function () {
    var p = [], stack = function (x, z, n) {
      for (var i = 0; i < n; i++) p.push(['cyl', [0.3, 0.3, 0.1, 12], [x + (i % 2 ? 0.025 : -0.02), -0.5 + i * 0.105, z], i % 2 ? 0xffd04a : 0xd99a22, null, null, 'gold']);
    };
    stack(-0.34, -0.1, 7); stack(0.3, -0.28, 5); stack(0.02, 0.36, 3);
    ICONS.model('tome_golden', p, { yaw: 0.5, pitch: 0.42, zoom: 0.94 });
  })();

  // ---------------- 诅咒：发着绿光的紫色骷髅头 ----------------
  ICONS.model('tome_cursed', glow([
    ['sphere', [0.45, 10, 7], [0, 0.12, 0], 0xb48ae8, null, [1, 0.95, 1.05], 'bone'],
    ['ch_tbox', [0.6, 0.42, 0.34, 0.62, 0.5], [0, -0.24, 0.04], 0xb48ae8, null, null, 'bone'],
    ['sphere', [0.14, 6, 4], [-0.17, 0.0, 0.38], 0x24103a, null, [1, 1.1, 0.6], 'plain'],
    ['sphere', [0.14, 6, 4], [0.17, 0.0, 0.38], 0x24103a, null, [1, 1.1, 0.6], 'plain'],
    ['cone', [0.06, 0.12, 3], [0, -0.16, 0.37], 0x24103a, [PI, 0, 0], null, 'plain'],
    ['box', [0.42, 0.14, 0.05], [0, -0.32, 0.3], 0x24103a, null, null, 'plain'],
    ['box', [0.08, 0.1, 0.06], [-0.15, -0.31, 0.31], 0xe8dcff, null, null, 'bone'],
    ['box', [0.08, 0.1, 0.06], [-0.05, -0.31, 0.31], 0xe8dcff, null, null, 'bone'],
    ['box', [0.08, 0.1, 0.06], [0.05, -0.31, 0.31], 0xe8dcff, null, null, 'bone'],
    ['box', [0.08, 0.1, 0.06], [0.15, -0.31, 0.31], 0xe8dcff, null, null, 'bone']
  ], [
    ['sphere', [0.065, 5, 4], [-0.17, 0.0, 0.45], 0xb0ff4a, null, null, 'plain'],
    ['sphere', [0.065, 5, 4], [0.17, 0.0, 0.45], 0xb0ff4a, null, null, 'plain']
  ]), { yaw: 0.3, pitch: 0.1, zoom: 0.9 });

  // ---------------- 混沌：彩虹三叶结 ----------------
  (function () {
    var cols = [0xff3a3a, 0xff9a2a, 0xffe03a, 0x4ad95a, 0x3ac8ff, 0x4a6aff, 0xb04aff], p = [];
    cols.forEach(function (c, i) { p.push(['tm_knot', [i / 7, (i + 1) / 7 + 0.004, 0.52, 0.16], [0, 0, 0], c, null, null, 'plain']); });
    ICONS.model('tome_chaos', p, { yaw: 0.3, pitch: 0.45 });
  })();

  // ---------------- 对应到游戏里的魔典 ----------------
  ['dmg', 'cd', 'qty', 'prec', 'size', 'hp', 'regen', 'shield', 'armor', 'evade', 'blood', 'thorns', 'pspd', 'dur', 'kb', 'attract', 'luck', 'xp', 'golden', 'cursed', 'chaos'].forEach(function (id) {
    ICONS.use('tome', id, 'tome_' + id);
  });
})();
