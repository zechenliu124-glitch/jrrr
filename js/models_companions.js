'use strict';
// ============================================================
//  伙伴和小东西的正式模型：猎犬（猎犬哨）、渡鸦（渡鸦羽毛）、铁蒺藜（铁蒺藜袋）、帽子里的兔子（魔术骑士）
//  紧跟 models_proj.js 加载（在 Weapons.init 建实例网格之前）；把同名的替身覆盖掉：
//    PROJ_MODELS.hound / hound_b（Relic.render 画：脚在 y = 0、朝 +Z、缩放 1；跑起来每 0.12 秒两帧轮换，咬的时候压扁 sq 0.06）
//    PROJ_MODELS.crow（灵魂弹丸 kind 'crow'：中心在原点、朝 +Z，俯仰跟着速度；PROJ_ANIM.crow.flap 整只左右摇）
//    PROJ_MODELS.caltrop（Relic.render 画：底在 y = 0，缩放 1.7，撒出去时绕 x 翻滚、yaw 随机）
//    PROJ_MODELS.rabbit（灵魂弹丸 kind 'rabbit'：中心在原点、朝 +Z，蹦着走，俯仰跟着速度）
//  每个 ≤ 20 个零件、≤ 720 个顶点（tools/tests/look_companions.js 查三角形上限）；只用 MODEL.build 的零件
//  四张新的像素小贴图 cm_*：在 TEX.init 画图集之前才登记，排在所有旧贴图后面（旧贴图的顺序和像素不变）；
//  只用自己的整数哈希，不调共用的随机数 r()
// ============================================================

// ---------------- 像素小贴图 ----------------
// 整数哈希 → 0~1（同一个 (x, y, 种子) 永远一样）
function cmHash(x, y, s) {
  var h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
var CM_TILES = {
  // 短毛：一缕缕斜着往下的毛（暗的毛缝 + 上面一个亮点），4×4 一格一缕，可平铺
  cm_fur: (function () {
    var buf = null;
    var make = function () {
      var o = [], i, x, y;
      for (i = 0; i < 256; i++) o.push(196 + Math.floor(cmHash(i & 15, i >> 4, 11) * 22));
      for (var cy = 0; cy < 4; cy++) for (var cx = 0; cx < 4; cx++) {
        x = cx * 4 + Math.floor(cmHash(cx, cy, 12) * 4); y = cy * 4 + Math.floor(cmHash(cx, cy, 13) * 4);
        var lean = cmHash(cx, cy, 14) < 0.5 ? 0 : 1;
        o[(y & 15) * 16 + (x & 15)] = 240;                          // 毛尖的亮点
        for (var k = 1; k <= 3; k++) {
          var px = (x + (k > 1 ? lean : 0) + 16) & 15, py = (y + k) & 15;
          o[py * 16 + px] = k === 3 ? 182 : 168;                    // 毛缝
        }
      }
      return o;
    };
    return function (x, y) { if (!buf) buf = make(); return buf[y * 16 + x]; };
  })(),
  // 渡鸦的羽毛：一排排鳞片一样的羽片（羽片下沿一条亮边 = 光泽，中间暗，羽轴更暗），上下排错开半片
  cm_plume: function (x, y) {
    var row = y >> 2, ly = y & 3, lx = (x + (row & 1) * 2) & 3;
    var v = 92 + Math.floor(cmHash(x, y, 21) * 14);
    if (ly === 3) v = lx === 0 ? 150 : 236;                         // 羽片的下沿
    else if (ly === 2 && (lx === 1 || lx === 2)) v = 150;
    if (lx === 0 && ly < 3) v = 64;                                 // 羽轴 / 羽片之间的缝
    return v;
  },
  // 兔子的绒毛：很亮的底，几团小卷毛（浅灰的弯 + 白亮点），对比很低，看着软
  cm_fluff: function (x, y) {
    var v = 232 + Math.floor(cmHash(x, y, 31) * 14);
    var cx = x & 7, cy = y & 7, ox = Math.floor(cmHash(x >> 3, y >> 3, 32) * 3), oy = Math.floor(cmHash(x >> 3, y >> 3, 33) * 3);
    var dx = cx - 2 - ox, dy = cy - 2 - oy;
    if (dy === 1 && dx >= -1 && dx <= 1) v = 204;                   // 卷毛下面的弯
    else if (dy === 0 && (dx === -2 || dx === 2)) v = 212;
    else if (dy === -1 && dx === 0) v = 255;                        // 卷毛顶的亮点
    return v;
  },
  // 锻铁：2×2 的锤痕块（深浅不一），几个亮的锻打亮点和暗坑
  cm_iron: function (x, y) {
    var v = 150 + Math.floor(cmHash(x >> 1, y >> 1, 41) * 60);
    var n = cmHash(x, y, 42);
    if (n < 0.06) v = 246;
    else if (n > 0.95) v = 88;
    return v;
  }
};
// 在 TEX.init 画图集之前登记（这时其他文件的贴图都已经登记完了，cm_* 排在最后）
(function () {
  var init0 = TEX.init;
  TEX.init = function () {
    for (var k in CM_TILES) { try { TEX.addTile(k, CM_TILES[k]); } catch (e) { /* 图集满了就用默认贴图 */ } }
    TEX.init = init0;
    return init0.apply(this, arguments);
  };
})();

// ---------------- 模型 ----------------
(function () {
  var PI = Math.PI;
  // 尖朝 +Y 的零件转成尖朝 d：[绕 x, 0, 绕 z]
  var aim = function (x, y, z) {
    var l = Math.sqrt(x * x + y * y + z * z) || 1; x /= l; y /= l; z /= l;
    var cg = Math.sqrt(Math.max(0, 1 - x * x)) || 1e-6;
    return [Math.atan2(z / cg, y / cg), 0, Math.asin(-x)];
  };
  // 从 base 沿 d 伸出长 h 的圆锥（底在 base，尖在 base + d·h）
  var spike = function (base, d, r, h, seg, c, tile) {
    var l = Math.sqrt(d[0] * d[0] + d[1] * d[1] + d[2] * d[2]) || 1;
    return ['cone', [r, h, seg], [base[0] + d[0] / l * h / 2, base[1] + d[1] / l * h / 2, base[2] + d[2] / l * h / 2], c, aim(d[0], d[1], d[2]), null, tile];
  };
  // 一条腿（不带盖的锥管）：上端在 (x, yTop, zTop)，绕 x 转 a（负 = 脚往前伸）
  var leg = function (x, yTop, zTop, len, a, rT, rB, c) {
    return ['tube', [rT, rB, len, 5], [x, yTop - Math.cos(a) * len / 2, zTop - Math.sin(a) * len / 2], c, [a, 0, 0], null, 'cm_fluff'];
  };

  // ---------- 猎犬：友好的猎兔犬。黄褐色身子、深巧克力色的背、白胸白嘴白腿、长长的垂耳、红皮项圈和铜牌、竖起来的白尖尾巴 ----------
  // 约 0.95 米长、头顶 0.93 米；和灰狼（尖耳、灰）、守墓黑犬（黑、尖刺、绿眼）一眼分得开
  var TAN = 0xc0803e, SAD = 0x66421f, WHT = 0xf2eadc, LEG = 0xe6dccb, EAR = 0x6e4020, INK = 0x1a1418, RED = 0xc8302a;
  var hound = function (run) {
    var tilt = run ? -0.07 : 0, hy = run ? 0.73 : 0.75, hz = run ? 0.39 : 0.36;
    var fa = run ? -0.6 : 0.05, ba = run ? 0.55 : -0.05;               // 前腿 / 后腿的角度
    var tail = run ? [0, 0.38, -0.92] : [0, 0.8, -0.6];
    var earR = run ? 0.65 : 0;                                       // 跑起来耳朵往后飘
    var tl = Math.hypot(tail[1], tail[2]), TB = [0, 0.55, -0.4];
    return [
      ['sphere', [0.2, 6, 4], [0, 0.45, -0.05], TAN, [tilt, 0, 0], [1.12, 0.92, 1.85], 'cm_fur'],
      ['fxHemi', [0.2, 6, 2], [0, 0.45, -0.12], SAD, [tilt, 0, 0], [1.04, 1.04, 1.42], 'cm_fur'],
      ['ball', [0.15, 0], [0, 0.44, 0.24], WHT, [tilt, 0, 0], [1.0, 1.2, 0.95], 'cm_fluff'],
      ['oct', [0.15], [0.13, 0.39, -0.27], TAN, [ba * 0.6, 0, 0], [0.6, 0.95, 0.8], 'cm_fur'], ['oct', [0.15], [-0.13, 0.39, -0.27], TAN, [(run ? ba - 0.15 : ba) * 0.6, 0, 0], [0.6, 0.95, 0.8], 'cm_fur'],
      ['ball', [0.15, 0], [0, hy, hz], TAN, null, [0.95, 0.92, 1.05], 'cm_fur'],
      ['box', [0.12, 0.1, 0.16], [0, hy - 0.055, hz + 0.16], WHT, [run ? -0.1 : 0, 0, 0], null, 'cm_fluff'],
      ['oct', [0.05], [0, hy - 0.02, hz + 0.245], INK, null, [1.1, 0.75, 0.8], 'plain'],
      ['oct', [0.03], [0.066, hy + 0.05, hz + 0.12], INK, null, null, 'plain'], ['oct', [0.03], [-0.066, hy + 0.05, hz + 0.12], INK, null, null, 'plain'],
      ['oct', [0.11], [0.135, hy - 0.04, hz], EAR, [earR, 0, 0.2], [0.32, 1.45, 0.75], 'cm_fur'],
      ['oct', [0.11], [-0.135, hy - 0.04, hz], EAR, [earR, 0, -0.2], [0.32, 1.45, 0.75], 'cm_fur'],
      ['tube', [0.13, 0.14, 0.06, 5], [0, 0.62, 0.29], RED, [0.57, 0, 0], null, 'ch_leather'],
      ['oct', [0.035], [0, 0.55, 0.41], 0xe8b83a, [0, PI / 4, 0], [1, 1.2, 0.6], 'gold'],
      leg(0.1, 0.38, 0.2, 0.38, fa, 0.072, 0.05, LEG), leg(-0.1, 0.38, 0.2, 0.38, run ? fa + 0.15 : fa, 0.072, 0.05, LEG),
      leg(0.12, 0.38, -0.3, 0.38, ba, 0.072, 0.05, LEG), leg(-0.12, 0.38, -0.3, 0.38, run ? ba - 0.15 : ba, 0.072, 0.05, LEG),
      spike(TB, tail, 0.05, 0.3, 4, TAN, 'cm_fluff'),
      ['oct', [0.042], [0, TB[1] + tail[1] / tl * 0.25, TB[2] + tail[2] / tl * 0.25], WHT, aim(0, tail[1], tail[2]), [1, 1.5, 1], 'cm_fluff']
    ];
  };
  PROJ_MODELS.hound = hound(false);
  PROJ_MODELS.hound_b = hound(true);

  // ---------- 渡鸦：油亮的黑紫色身子（羽毛贴图的亮边是紫色光泽）、金嘴、金眼、张开的两段翅膀（翅尖分叉的飞羽）、扇形尾巴 ----------
  // 翼展约 1 米；PROJ_ANIM.crow.flap 不变
  var CB = 0x382d52, CH = 0x2e2645, CW = 0x4a3d6e, CO = 0x5a4a86;
  PROJ_MODELS.crow = [
    ['ball', [0.15, 0], [0, 0, 0], CB, null, [0.95, 0.85, 1.6], 'cm_plume'],
    ['ball', [0.105, 0], [0, 0.05, 0.25], CH, null, [0.95, 0.95, 1.1], 'cm_plume'],
    ['cone', [0.045, 0.17, 4], [0, 0.035, 0.42], 0xe0b040, [PI / 2, PI / 4, 0], [1, 1, 0.8], 'gold'],
    ['oct', [0.022], [0.07, 0.09, 0.31], 0xffd860, null, null, 'plain'], ['oct', [0.022], [-0.07, 0.09, 0.31], 0xffd860, null, null, 'plain'],
    ['box', [0.25, 0.04, 0.24], [0.18, 0.03, 0], CW, [0, 0, 0.18], null, 'cm_plume'], ['box', [0.25, 0.04, 0.24], [-0.18, 0.03, 0], CW, [0, 0, -0.18], null, 'cm_plume'],
    ['c10Wing', [0.3, 0.26, 0.03, 1], [0.29, 0.055, -0.01], CO, [0, 0.15, 0.3], null, 'cm_plume'],
    ['c10Wing', [0.3, 0.26, 0.03, -1], [-0.29, 0.055, -0.01], CO, [0, -0.15, -0.3], null, 'cm_plume'],
    ['cone', [0.15, 0.3, 5], [0, 0.01, -0.34], CH, [PI / 2, 0, 0], [1.15, 1, 0.22], 'cm_plume']
  ];
  PROJ_ANIM.crow = { flap: 0.4 };
  // 淡紫色的光晕（和图标的紫光一样）：夜里第 3 关的黑鸟也看得见；颜色有一个通道 < 0xe0（R-W1）
  PROJ_GLOW.crow = [0x8a5ae0, 0.85, 0.3];

  // ---------- 帽子里的兔子：毛茸茸的白兔，长耳朵里是粉的，粉鼻子、黑眼睛、白绒球尾巴 ----------
  var RW = 0xf6f4f0, RW2 = 0xffffff, PK = 0xf3a0b8;
  var ear = function (s) {
    return [['ball', [0.1, 0], [s * 0.065, 0.36, 0.17], RW, [-0.25, 0, -s * 0.15], [0.38, 1.75, 0.5], 'cm_fluff'],
      ['oct', [0.1], [s * 0.066, 0.355, 0.205], PK, [-0.25, 0, -s * 0.15], [0.2, 1.4, 0.2], 'plain']];
  };
  PROJ_MODELS.rabbit = [
    ['sphere', [0.17, 8, 5], [0, 0, -0.02], RW, null, [0.95, 0.88, 1.2], 'cm_fluff'],
    ['oct', [0.11], [0, -0.02, 0.14], RW2, null, [1.1, 1.1, 0.8], 'cm_fluff'],
    ['ball', [0.13, 0], [0, 0.13, 0.22], RW, null, [1, 0.95, 1], 'cm_fluff']
  ].concat(ear(1), ear(-1), [
    ['oct', [0.026], [0.075, 0.17, 0.315], INK, null, null, 'plain'], ['oct', [0.026], [-0.075, 0.17, 0.315], INK, null, null, 'plain'],
    ['oct', [0.025], [0, 0.12, 0.345], 0xf08aa8, null, [1.2, 0.8, 0.8], 'plain'],
    ['ball', [0.075, 0], [0, 0.05, -0.24], RW2, null, null, 'cm_fluff'],
    ['oct', [0.1], [0.1, -0.13, -0.03], 0xeeeae2, null, [0.45, 0.4, 1.1], 'cm_fluff'], ['oct', [0.1], [-0.1, -0.13, -0.03], 0xeeeae2, null, [0.45, 0.4, 1.1], 'cm_fluff'],
    ['oct', [0.045], [0.06, -0.13, 0.18], RW, null, [1, 1, 1.3], 'cm_fluff'], ['oct', [0.045], [-0.06, -0.13, 0.18], RW, null, [1, 1, 1.3], 'cm_fluff']
  ]);

  // ---------- 铁蒺藜：四根锻铁刺按四面体张开（一根朝上，三根的尖正好落在地上），刺尖磨亮；深色的芯 ----------
  // 模型约 0.3 米高（Relic.render 放大 1.7 倍）；深铁色在沙地上看得清，亮刺尖在草地、墓地上看得清
  var IR = 0x464a54, TIP = 0xc8ced8, L = 0.19, cy = L / 3, sq = Math.sqrt(8) / 3;
  var dirs = [[0, 1, 0]];
  for (var i = 0; i < 3; i++) { var a = i * PI * 2 / 3 + PI / 6; dirs.push([Math.cos(a) * sq, -1 / 3, Math.sin(a) * sq]); }
  var cal = [['oct', [0.05], [0, cy, 0], 0x33363e, [0, PI / 4, 0], null, 'cm_iron']];
  dirs.forEach(function (d) {
    cal.push(spike([0, cy, 0], d, 0.05, L, 4, IR, 'cm_iron'));
    cal.push(spike([d[0] * (L - 0.08), cy + d[1] * (L - 0.08), d[2] * (L - 0.08)], d, 0.026, 0.085, 4, TIP, 'metal'));
  });
  PROJ_MODELS.caltrop = cal;
})();
