'use strict';
// ============================================================
//  新敌人（第二批内容）：每关三种，各有自己的行为（行为逻辑在 content.js 的 Enemies.BEHAVIORS）
//  迷雾森林：灰林狼（成群包抄、一起扑）、孢子菇（留下减速孢子云）、哥布林鼓手（擂鼓强化附近的怪，连着一道光）
//  黄沙古道：沙穴蠕虫（钻进沙里，地面裂开后从脚下钻出）、食腐秃鹫（标出落点再俯冲）、蜥人盾卫（盾牌挡正面的飞弹）
//  沉钟古城：诅咒墓碑（不停召唤亡灵，要打碎）、灵质团（死后裂成三团小灵质）、无头骑士（地上画出冲锋线再端枪冲刺）
//  随机事件用：金袋哥布林、宝箱怪
//  文件末尾：第 8 块的新敌人和小 Boss 的模型（第 10 块）：林中野猪、蜥人甩石手，五个小 Boss = 上面的模型换色、加零件再放大
//  建模用 data_enemies.js 的同一套零件、关节和身体模板（ENEMY_KIT），画风、动画和老敌人一致
// ============================================================

// ---------------- 新的像素贴图（16×16 灰度，乘顶点色） ----------------
(function () {
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就退回默认贴图 */ } };
  // 菌盖：深浅不一的斑块和几道放射状的纹
  add('ct_cap', function (x, y, r) {
    var v = 226 + r() * 18;
    if (Math.sin(x * 1.3 + y * 0.4) + Math.sin(y * 0.9 - x * 0.7) > 1.2) v -= 34;
    if ((x + y * 3) % 11 === 0) v -= 22;
    return v;
  });
  // 裂开的石头：大石面 + 两道深色裂缝（墓碑、裂墙）
  add('ct_crack', function (x, y, r) {
    var v = 214 + r() * 26;
    if (r() < 0.06) v -= 46;
    var c1 = Math.abs(x - (4 + y * 0.55 + Math.sin(y * 1.1) * 1.3));
    var c2 = Math.abs(y - (10 + Math.sin(x * 0.8) * 1.6)) + (x < 7 ? 9 : 0);
    if (c1 < 0.7 || c2 < 0.7) v = 40 + r() * 20;
    else if (c1 < 1.4 || c2 < 1.4) v -= 40;
    if (x === 0 || y === 15) v -= 30;
    return v;
  });
  // 灵质：亮的小泡泡，泡泡边缘偏暗
  var bub = [[3, 4, 2.2], [10, 3, 1.6], [7, 10, 2.6], [13, 12, 1.8], [2, 13, 1.4]];
  add('ct_ecto', function (x, y, r) {
    var v = 200 + r() * 16;
    for (var i = 0; i < bub.length; i++) {
      var dx = x + 0.5 - bub[i][0], dy = y + 0.5 - bub[i][1], d = Math.sqrt(dx * dx + dy * dy);
      if (d < bub[i][2] - 0.6) v = 252;
      else if (d < bub[i][2] + 0.4) v = 168;
    }
    return v;
  });
  // 羽毛：斜着的一片片羽片，羽轴深色
  add('ct_feather', function (x, y, r) {
    var k = (x + y * 2) % 6;
    var v = k === 0 ? 120 : k < 3 ? 236 + r() * 14 : 206 + r() * 14;
    if (y % 8 === 7) v = 150;
    return v;
  });
})();

// ---------------- 模型 ----------------
(function () {
  var K = ENEMY_KIT;
  var bx = K.bx, cy = K.cy, sp = K.sp, cn = K.cn, ic = K.ic, oc = K.oc, lit = K.lit, sym = K.sym, sgB = K.sgB, sgC = K.sgC;
  var CH = K.CH, jt = K.jt, on = K.on, fin = K.fin, fz = K.fz, limbs = K.limbs, pair = K.pair;
  var a, P, k, hc, hr;

  // 把一组零件绕 pivot 点的 X 轴转 ang（宝箱怪张开的箱盖）：位置跟着转，零件自己的 X 角加上 ang
  function rotX(parts, pivot, ang) {
    var c = Math.cos(ang), s = Math.sin(ang);
    return parts.map(function (p) {
      var q = p.slice(), dy = p[2][1] - pivot[1], dz = p[2][2] - pivot[2], r = p[4] || [0, 0, 0];
      q[2] = [p[2][0], pivot[1] + dy * c - dz * s, pivot[2] + dy * s + dz * c];
      q[4] = [r[0] + ang, r[1], r[2]];
      return q;
    });
  }

  // ======== 迷雾森林 ========
  // 灰林狼：低矮结实的四足狼，长嘴张着露出獠牙，尖耳朵、胸前一圈浅色鬃毛、背上深色的毛、蓬松的尾巴、黄色发光的眼睛
  (function () {
    var F = 0x5e5650, F2 = 0xa49a8c, FD = 0x37312c, TE = 0xf4ecd8;
    hc = [0, 0.86, 0.66]; hr = [0.22, 0.198, 0.242];
    P = [
      sp(0.3, [0, 0.62, 0.0], F, 'fur', [0.95, 0.88, 1.7], [8, 6]),
      sp(0.26, [0, 0.7, -0.08], FD, 'fur', [0.82, 0.6, 1.5], [7, 4]),
      sp(0.24, [0, 0.62, 0.34], F2, 'fur', [1.1, 1.05, 0.85], [7, 5]),
      sp(0.23, [0, 0.62, -0.36], F, 'fur', [1.05, 0.95, 1.1], [6, 5])
    ];
    var head = jt(CH.head, [0, 0.74, 0.46], 1.5);
    P = P.concat(on(head, [
      sp(0.22, hc, F, 'fur', [1, 0.9, 1.1], [7, 5]),
      bx([0.17, 0.13, 0.3], [0, 0.8, 0.9], F2, 'fur'),
      bx([0.08, 0.06, 0.06], [0, 0.86, 1.06], 0x161210, 'plain'),
      bx([0.15, 0.05, 0.26], [0, 0.71, 0.86], 0x8a2a2a, 'plain', [0.25, 0, 0])
    ])).concat(on(head, sym([
      cn(0.08, 0.24, [0.12, 1.07, 0.58], FD, 'fur', 4, [-0.15, 0, -0.3]),
      cn(0.024, 0.09, [0.06, 0.71, 1.0], TE, 'bone', 3, [Math.PI, 0, 0]),
      cn(0.022, 0.07, [0.055, 0.72, 0.93], TE, 'bone', 3)
    ]))).concat(on(head, lit(2.2, sym([bx([0.075, 0.035, 0.02], [0.095, 0.9, fz(hc, hr, 0.095, 0.9) + 0.005], 0xffd23a, 'plain', [0, 0, -0.3])]))));
    // 前腿跟着肩通道、后腿跟着髋通道：左前和右后一起迈（小跑）
    P = P.concat(limbs(CH.sho, [0.14, 0.6, 0.34],
      [sgC([0.14, 0.62, 0.34], [0.15, 0.32, 0.38], 0.085, 0.07, F, 'fur')],
      CH.elb, [0.15, 0.32, 0.38],
      [sgC([0.15, 0.32, 0.38], [0.15, 0.05, 0.36], 0.065, 0.05, F2, 'fur'), bx([0.12, 0.07, 0.17], [0.15, 0.035, 0.42], FD, 'fur')], 1, 0.8));
    P = P.concat(limbs(CH.hip, [0.14, 0.6, -0.38],
      [sgC([0.14, 0.62, -0.38], [0.15, 0.34, -0.28], 0.1, 0.075, F, 'fur')],
      CH.knee, [0.15, 0.34, -0.28],
      [sgC([0.15, 0.34, -0.28], [0.15, 0.05, -0.4], 0.065, 0.05, F2, 'fur'), bx([0.12, 0.07, 0.17], [0.15, 0.035, -0.35], FD, 'fur')], 1, 0.8));
    P = P.concat(on(jt(CH.tail, [0, 0.7, -0.58], 1.7), [
      sgC([0, 0.7, -0.58], [0, 0.56, -0.95], 0.08, 0.11, F, 'fur'),
      sp(0.13, [0, 0.5, -1.04], F2, 'fur', [0.9, 0.9, 1.5], [6, 4])
    ]));
    ENEMY_MODELS.wolf = fin(P, 1.08, { hip: 0.6, lean: 0.06, bob: 0.03, roll: 0.03, stride: 3.6, flap: 7 });
  })();

  // 孢子菇：紫蓝色的大菌盖上长着发光的青色斑点，奶白色的菌柄身体，气鼓鼓的脸，小短腿，身边飘着孢子
  (function () {
    var CAP = 0x5b4bb4, STEM = 0xe8dcc2, STEM2 = 0xc8b898, GLOW = 0x6dffd0;
    P = [
      cy(0.28, 0.36, 0.86, [0, 0.62, 0], STEM, 'skin', 8),
      cy(0.36, 0.3, 0.08, [0, 0.2, 0], STEM2, 'skin', 8),
      cy(0.33, 0.32, 0.12, [0, 1.0, 0], 0xf2e8d0, 'cloth', 8)
    ].concat(sym([
      bx([0.09, 0.06, 0.03], [0.11, 0.8, 0.31], 0x1a1022, 'plain'),
      bx([0.13, 0.03, 0.03], [0.11, 0.86, 0.315], STEM2, 'skin', [0, 0, -0.35])
    ])).concat([bx([0.14, 0.03, 0.03], [0, 0.66, 0.33], 0x4a2a2a, 'plain')]);
    var head = jt(CH.head, [0, 1.05, 0], 1.3), cc = [0, 1.28, 0], cr = [0.78, 0.42, 0.78];
    var spots = [[0, 0, 0.15], [0.62, 0.4, 0.12], [0.62, 2.5, 0.13], [0.62, 4.5, 0.11], [1.05, 1.4, 0.1], [1.05, 3.4, 0.11], [1.05, 5.5, 0.1], [1.12, 0.4, 0.09]];
    P = P.concat(on(head, [
      sp(0.78, cc, CAP, 'ct_cap', [1, 0.54, 1], [10, 6]),
      cy(0.74, 0.5, 0.14, [0, 1.12, 0], 0xd8c8a8, 'cloth', 10)
    ].concat(lit(1.6, spots.map(function (s) {
      var t = s[0], f = s[1];
      return sp(s[2], [cr[0] * Math.sin(t) * Math.cos(f), cc[1] + cr[1] * Math.cos(t), cr[2] * Math.sin(t) * Math.sin(f)], GLOW, 'plain', [1, 0.5, 1], [6, 3], [Math.sin(f) * t * 0.7, 0, -Math.cos(f) * t * 0.7]);
    })))));
    P = P.concat(limbs(CH.sho, [0.3, 0.78, 0], [sgC([0.3, 0.78, 0], [0.44, 0.56, 0.08], 0.055, 0.045, STEM, 'skin'), ic(0.06, [0.45, 0.53, 0.09], STEM2, 'skin')], 0, null, null, 0.7));
    P = P.concat(limbs(CH.hip, [0.15, 0.24, 0], [cy(0.085, 0.075, 0.16, [0.15, 0.15, 0.02], STEM2, 'skin', 5)], CH.knee, [0.15, 0.08, 0.02],
      [bx([0.15, 0.07, 0.22], [0.15, 0.035, 0.06], 0x9a8a6a, 'skin')], 1, 1));
    P = P.concat(on(jt(CH.tail, [0, 1.4, 0], 1.9), lit(2.0, [oc(0.045, [0.55, 1.55, 0.25], GLOW, 'plain'), oc(0.04, [-0.5, 1.7, -0.3], GLOW, 'plain'), oc(0.035, [0.12, 1.9, 0.45], GLOW, 'plain'), oc(0.03, [-0.2, 1.62, 0.6], GLOW, 'plain')])));
    ENEMY_MODELS.shroom = fin(P, 1.05, { hip: 0.24, lean: 0.03, bob: 0.08, roll: 0.14, flap: 3 });
  })();

  // 哥布林鼓手：胸前横挂着红色战鼓，两手各拿一根骨头鼓槌，背上插着战旗，头上红头带和黄羽毛，脸上画着战纹
  (function () {
    a = K.gob({ skin: 0x4cbf3c, dark: 0x2e8a2a, cloth: 0x7a2a1a, w: 1.05 });
    P = a.p.concat([
      cy(0.27, 0.27, 0.3, [0, 0.58, 0.34], 0xb02a24, 'wood', 10, [Math.PI / 2, 0, 0]),
      cy(0.25, 0.25, 0.02, [0, 0.58, 0.5], 0xe8d8b8, 'plain', 10, [Math.PI / 2, 0, 0]),
      cy(0.285, 0.285, 0.045, [0, 0.58, 0.2], 0xe8b830, 'gold', 10, [Math.PI / 2, 0, 0]),
      cy(0.285, 0.285, 0.045, [0, 0.58, 0.48], 0xe8b830, 'gold', 10, [Math.PI / 2, 0, 0]),
      bx([0.05, 0.55, 0.03], [0.1, 0.74, 0.16], 0x5a3a22, 'cloth', [0.25, 0, 0.55])
    ]);
    // 鼓槌：跟着前臂摆（擂鼓时手臂快速摆动）
    P = P.concat(on(a.arm.L.b, [sgC([0.31, 0.36, 0.16], [0.17, 0.66, 0.5], 0.022, 0.02, 0xe8dcc0, 'bone'), ic(0.05, [0.165, 0.67, 0.51], 0xf4ecd8, 'bone')]))
      .concat(on(a.arm.R.b, [sgC([-0.31, 0.36, 0.16], [-0.17, 0.66, 0.5], 0.022, 0.02, 0xe8dcc0, 'bone'), ic(0.05, [-0.165, 0.67, 0.51], 0xf4ecd8, 'bone')]));
    P = P.concat(on(a.head, [
      cy(0.205, 0.205, 0.05, [0, 1.08, 0.08], 0xc0302a, 'cloth', 8),
      cn(0.045, 0.34, [0.06, 1.3, -0.06], 0xffd23a, 'plain', 3, [-0.35, 0, -0.25]),
      cn(0.04, 0.28, [-0.03, 1.27, -0.09], 0xff8a2a, 'plain', 3, [-0.5, 0, 0.2])
    ])).concat(on(a.head, sym([bx([0.025, 0.08, 0.02], [0.105, 0.94, fz(a.hc, a.hr, 0.105, 0.94) + 0.003], 0xd03a2a, 'plain')])));
    // 背上的战旗（随风摆）
    P = P.concat([cy(0.025, 0.025, 1.35, [0, 1.12, -0.24], 0x6a4a2a, 'wood', 4, [-0.12, 0, 0])])
      .concat(on(jt(CH.sway, [0, 1.55, -0.3], 1.5), [
        bx([0.44, 0.36, 0.02], [0.22, 1.58, -0.31], 0xb02a24, 'cloth'),
        bx([0.13, 0.13, 0.03], [0.22, 1.6, -0.3], 0xf0e2c4, 'bone'),
        cn(0.06, 0.16, [0.12, 1.36, -0.31], 0xb02a24, 'cloth', 3, [Math.PI, 0, 0]),
        cn(0.06, 0.16, [0.34, 1.36, -0.31], 0xb02a24, 'cloth', 3, [Math.PI, 0, 0])
      ]));
    ENEMY_MODELS.drummer = fin(P, 1.15, { hip: 0.41, lean: 0.14, bob: 0.05, roll: 0.07 });
  })();

  // ======== 黄沙古道 ========
  // 沙穴蠕虫：从沙里钻出来的大蠕虫，一节节的甲壳，顶上一张满是尖牙的圆嘴，三只琥珀色的眼，两根钳子一样的颚
  (function () {
    var W1 = 0xc89a5a, W2 = 0x9a6a38, MAW = 0x4a1210;
    P = [ic(0.78, [0, 0.0, 0], 0xc8a060, 'sand', [1.25, 0.3, 1.25])];
    var sway = jt(CH.sway, [0, 0.7, 0], 1.7);
    for (k = 0; k < 5; k++) {
      var y = 0.22 + k * 0.4, z = k * k * 0.025, r = 0.43 - k * 0.035;
      var seg = [cy(r * 0.96, r, 0.42, [0, y, z], k % 2 ? W2 : W1, 'en_chitin', 8, [0.06 * k, 0, 0]),
        bx([r * 1.1, 0.12, 0.22], [0, y + 0.08, z - r * 0.85], W2, 'en_chitin', [0.3, 0, 0])];
      P = P.concat(k >= 2 ? on(sway, seg) : seg);
    }
    var head = jt(CH.head, [0, 2.0, 0.25], 1.5, sway), hy = 2.3, hz = 0.38, MT = Math.PI / 2 - 0.35;
    P = P.concat(on(head, [
      sp(0.36, [0, hy, hz - 0.05], W1, 'en_chitin', [1, 0.85, 1.05], [8, 6]),
      cy(0.26, 0.31, 0.12, [0, hy, hz + 0.26], MAW, 'plain', 10, [MT, 0, 0]),
      cy(0.13, 0.2, 0.06, [0, hy, hz + 0.31], 0x1a0606, 'plain', 8, [MT, 0, 0])
    ]));
    for (k = 0; k < 8; k++) {
      var a8 = k / 8 * TAU, tx = Math.cos(a8) * 0.24, ty = Math.sin(a8) * 0.24;
      P = P.concat(on(head, [cn(0.035, 0.13, [tx, hy + ty * 0.94, hz + 0.33 - ty * 0.33], 0xf2e8d2, 'bone', 3, [MT, 0, 0])]));
    }
    P = P.concat(on(head, lit(2.6, [oc(0.055, [0.17, hy + 0.27, hz + 0.12], 0xffb020, 'plain'), oc(0.055, [-0.17, hy + 0.27, hz + 0.12], 0xffb020, 'plain'), oc(0.045, [0, hy + 0.33, hz + 0.08], 0xffd060, 'plain')])))
      .concat(on(head, sym([cn(0.07, 0.38, [0.3, hy - 0.08, hz + 0.32], W2, 'bone', 4, [1.75, 0, -0.45])])));
    ENEMY_MODELS.worm = fin(P, 1, { hip: 0.01, lean: 0, roll: 0, flap: 4 });
  })();

  // 食腐秃鹫：深褐色的大鸟，光秃秃的粉红色头、白色颈毛、黄色钩嘴、红眼睛；翅膀张开约 2.7 米
  (function () {
    var V1 = 0x4a3428, V2 = 0x2e2018, VT = 0x8a6a4a, SKIN = 0xd07062;
    P = [
      sp(0.3, [0, 0, 0], V1, 'fur', [0.85, 0.72, 1.45], [8, 6]),
      sp(0.18, [0, 0.1, 0.36], 0xd8d0c0, 'fur', [1.0, 0.8, 0.85], [7, 5]),
      bx([0.34, 0.04, 0.32], [0, 0.02, -0.56], V2, 'ct_feather', [-0.15, 0, 0]),
      bx([0.22, 0.03, 0.22], [0, 0.0, -0.74], VT, 'ct_feather', [-0.15, 0, 0])
    ];
    var head = jt(CH.head, [0, 0.14, 0.46], 1.6);
    hc = [0, 0.36, 0.68];
    P = P.concat(on(head, [
      sgC([0, 0.14, 0.46], [0, 0.32, 0.62], 0.075, 0.06, SKIN, 'skin'),
      sp(0.115, hc, SKIN, 'skin', [0.95, 0.95, 1.2], [7, 5]),
      cn(0.055, 0.22, [0, 0.33, 0.87], 0xe8c040, 'bone', 4, [Math.PI / 2 + 0.45, 0, 0])
    ])).concat(on(head, lit(2.6, sym([bx([0.04, 0.03, 0.02], [0.06, 0.39, fz(hc, [0.109, 0.109, 0.138], 0.06, 0.39) + 0.004], 0xff3020, 'plain')]))));
    P = P.concat(limbs(CH.wing, [0.14, 0.1, 0.05], [
      bx([0.62, 0.08, 0.5], [0.46, 0.17, 0.02], V1, 'ct_feather', [0, 0, 0.24]),
      bx([0.5, 0.07, 0.42], [0.94, 0.29, -0.04], V2, 'ct_feather', [0, 0.12, 0.26]),
      bx([0.32, 0.05, 0.14], [1.28, 0.38, 0.12], VT, 'ct_feather', [0, -0.3, 0.26]),
      bx([0.36, 0.05, 0.14], [1.31, 0.39, -0.04], VT, 'ct_feather', [0, -0.05, 0.26]),
      bx([0.32, 0.05, 0.14], [1.26, 0.38, -0.2], VT, 'ct_feather', [0, 0.25, 0.26])
    ], 0, null, null, 1));
    P = P.concat(sym([sgC([0.1, -0.16, -0.08], [0.11, -0.34, -0.02], 0.035, 0.03, 0xe8c040, 'bone'), cn(0.03, 0.12, [0.11, -0.38, 0.04], 0x2a2a2a, 'plain', 3, [Math.PI / 2 + 0.6, 0, 0])]));
    ENEMY_MODELS.vulture = fin(P, 1.05, { hover: 0.22, flap: 5 });
  })();

  // 蜥人盾卫：绿褐色鳞片的蜥蜴人，红色头冠和铜盔，左手一面很大的青铜圆盾挡在身前（盾面上发光的十字），右手短矛，长尾巴
  (function () {
    var L1 = 0x7a9a48, L2 = 0x5a7a32, BEL = 0xd8c890, BR = 0xc08a3a;
    a = K.human({ w: 1.12, legC: L2, legT: 'scale', footC: 0x4a6428, footT: 'scale', hipC: 0x6a4a2a, hipT: 'cloth', bodyC: L1, bodyT: 'scale', armC: L2, armT: 'scale', headC: L1, headT: 'scale', fwd: 0.4, armS: 0.55 });
    hc = [0, 1.74, 0.05]; hr = [0.135, 0.13, 0.17];
    P = a.p.concat([
      bx([0.28, 0.42, 0.05], [0, 1.27, 0.16], BEL, 'scale'),
      cy(0.2, 0.22, 0.09, [0, 1.04, 0], 0x6a4a2a, 'cloth', 8, null, [1, 1, 0.75]),
      bx([0.12, 0.12, 0.04], [0, 1.04, 0.16], BR, 'gold')
    ]).concat(on(a.head, [
      sp(0.15, hc, L1, 'scale', [0.9, 0.87, 1.13], [7, 5]),
      bx([0.17, 0.12, 0.28], [0, 1.69, 0.26], L2, 'scale'),
      bx([0.16, 0.02, 0.26], [0, 1.645, 0.27], 0x2a120a, 'plain'),
      cy(0.155, 0.16, 0.08, [0, 1.86, 0.03], BR, 'metal', 8)
    ])).concat(on(a.head, sym([cn(0.1, 0.3, [0.13, 1.82, -0.08], 0xc8402a, 'cloth', 3, [-0.7, 0, -0.6], [1, 1, 0.4])])))
      .concat(on(a.head, lit(2.6, sym([bx([0.035, 0.04, 0.02], [0.09, 1.77, fz(hc, hr, 0.09, 1.77) + 0.004], 0xffe040, 'plain')]))));
    var tail = jt(CH.tail, [0, 0.98, -0.14], 1.5);
    P = P.concat(on(tail, [sgC([0, 0.98, -0.14], [0, 0.55, -0.7], 0.11, 0.075, L1, 'scale'), sgC([0, 0.55, -0.7], [0, 0.12, -1.1], 0.075, 0.03, L2, 'scale')]));
    P = P.concat(on(a.arm.L.b, [
      cy(0.5, 0.5, 0.07, [0.16, 1.18, 0.46], BR, 'gold', 14, [Math.PI / 2, 0, 0]),
      ['torus', [0.5, 0.04, 4, 18], [0.16, 1.18, 0.5], 0x8a5a24, null, null, 'metal'],
      cy(0.13, 0.15, 0.08, [0.16, 1.18, 0.52], 0xe8c050, 'gold', 8, [Math.PI / 2, 0, 0])
    ])).concat(on(a.arm.L.b, lit(1.9, [bx([0.56, 0.06, 0.02], [0.16, 1.18, 0.505], 0xffd27a, 'plain'), bx([0.06, 0.56, 0.02], [0.16, 1.18, 0.505], 0xffd27a, 'plain')])));
    P = P.concat(on(a.arm.R.b, [
      sgC([-0.33, 0.55, 0.05], [-0.34, 2.15, 0.5], 0.025, 0.025, 0x7a5030, 'wood', 4),
      cn(0.055, 0.26, [-0.343, 2.27, 0.535], 0xd8dde4, 'metal', 4, [0.27, 0, 0])
    ])).concat(pair(a.arm.L.a, a.arm.R.a, [sp(0.13, [0.32, 1.5, 0], BR, 'metal', [1.2, 0.7, 1.1], [6, 4])]));
    ENEMY_MODELS.lizard = fin(P, 1.05, { hip: 0.95, lean: 0.05, roll: 0.06, flap: 4 });
  })();

  // ======== 沉钟古城 ========
  // 诅咒墓碑：比人还高的墓碑，刻着发光的绿色骷髅和符文，缠着铁链，顶上燃着幽绿的鬼火，底下几只骨手往外爬
  (function () {
    var S1 = 0x535968, S2 = 0x3e4350, G = 0x6dff9a, BN = 0xd8ccb0;
    P = [
      bx([1.5, 0.3, 1.0], [0, 0.15, 0], S2, 'en_rock'),
      bx([1.2, 0.12, 0.44], [0, 0.34, 0], S2, 'en_rock'),
      bx([1.06, 1.5, 0.34], [0, 1.02, 0], S1, 'ct_crack'),
      cy(0.53, 0.53, 0.34, [0, 1.77, 0], S1, 'ct_crack', 12, [Math.PI / 2, 0, 0]),
      bx([0.13, 0.55, 0.14], [0, 2.52, 0], S2, 'en_rock'),
      bx([0.4, 0.12, 0.14], [0, 2.62, 0], S2, 'en_rock')
    ].concat(lit(2.3, [bx([0.38, 0.32, 0.03], [0, 1.42, 0.175], G, 'en_skull'), bx([0.6, 0.05, 0.02], [0, 1.02, 0.175], G, 'plain'), bx([0.05, 0.3, 0.02], [0, 0.84, 0.175], G, 'plain')]));
    for (k = 0; k < 5; k++) P.push(['torus', [0.09, 0.025, 3, 6], [-0.45 + k * 0.22, 1.25 - k * 0.12, 0.2], 0x3a3a44, [0, 0, 0.5 + (k % 2) * 1.2], null, 'metal']);
    P = P.concat(on(jt(CH.tail, [0, 2.6, 0], 1.9), lit(1.5, [cn(0.13, 0.42, [0, 2.92, 0], G, 'plain', 5), cn(0.07, 0.26, [0.05, 2.98, 0.03], 0xb8ffd0, 'plain', 4)])));
    P = P.concat(on(jt(CH.sway, [0.5, 1.95, 0], 1.7), lit(1.5, [cn(0.08, 0.26, [0.44, 2.04, 0.0], G, 'plain', 4)])));
    // 从土里伸出来的骨手（左右摇）
    var hand = function (x, z, tilt) {
      var j = jt(CH.sway, [x, 0.1, z], 1.6);
      var tx = x + Math.sin(tilt) * 0.16, top = 0.62;
      return on(j, [
        sgB([x, 0.02, z], [tx, top, z + 0.06], 0.065, BN, 'bone'),
        bx([0.14, 0.1, 0.06], [tx, top + 0.04, z + 0.07], BN, 'bone', [0, 0, tilt]),
        cn(0.022, 0.16, [tx - 0.05, top + 0.16, z + 0.09], BN, 'bone', 3, [0.3, 0, tilt]),
        cn(0.022, 0.18, [tx, top + 0.17, z + 0.09], BN, 'bone', 3, [0.3, 0, tilt]),
        cn(0.022, 0.16, [tx + 0.05, top + 0.16, z + 0.09], BN, 'bone', 3, [0.3, 0, tilt])
      ]);
    };
    P = P.concat(hand(0.72, 0.42, -0.4)).concat(hand(-0.68, 0.5, 0.35)).concat(hand(0.15, 0.62, 0.1));
    ENEMY_MODELS.tomb = fin(P, 1, { hip: 0, lean: 0, roll: 0, flap: 5 });
  })();

  // 灵质团：发光的青绿色灵质，正面嵌着一颗骷髅，身上卡着骨头，下面挂着往下滴的触须；死后裂成三团小灵质
  (function () {
    var EC = 0x3fe8b0, EC2 = 0x2ab890;
    P = lit(1.45, [
      sp(0.66, [0, 0, 0], EC, 'ct_ecto', [1, 0.86, 1], [10, 7]),
      sp(0.34, [0.44, 0.26, -0.12], EC2, 'ct_ecto', null, [7, 5]),
      sp(0.3, [-0.42, 0.18, -0.2], EC2, 'ct_ecto', null, [7, 5]),
      sp(0.26, [0.05, 0.48, -0.3], EC, 'ct_ecto', null, [6, 4])
    ]).concat([sp(0.21, [0, 0.04, 0.56], 0xe8dcc0, 'bone', [1, 1, 0.8], [7, 5]), bx([0.3, 0.24, 0.04], [0, 0.02, 0.72], 0xe8dcc0, 'en_skull')])
      .concat(lit(2.6, sym([bx([0.06, 0.05, 0.02], [0.065, 0.06, 0.745], 0xbaffea, 'plain')])))
      .concat([sgB([0.5, -0.2, 0.3], [0.85, 0.15, 0.45], 0.07, 0xe8dcc0, 'bone'), ic(0.07, [0.87, 0.17, 0.46], 0xe8dcc0, 'bone')])
      .concat(on(jt(CH.sway, [0, -0.4, 0], 1.7), lit(1.4, [0, 1, 2, 3, 4].map(function (i) { var t = i / 5 * TAU + 0.4; return cn(0.13, 0.42, [Math.sin(t) * 0.38, -0.62, Math.cos(t) * 0.38], EC2, 'ct_ecto', 4, [Math.PI, 0, 0]); }))));
    ENEMY_MODELS.ecto = fin(P, 1, { hover: 0.25, flap: 4 });
    P = lit(1.5, [sp(0.42, [0, 0, 0], EC, 'ct_ecto', [1, 0.85, 1], [8, 6])])
      .concat([sp(0.15, [0, 0.03, 0.34], 0xe8dcc0, 'bone', [1, 1, 0.8], [6, 4]), bx([0.2, 0.16, 0.03], [0, 0.02, 0.46], 0xe8dcc0, 'en_skull')])
      .concat(lit(2.6, sym([bx([0.04, 0.035, 0.02], [0.045, 0.04, 0.48], 0xbaffea, 'plain')])))
      .concat(on(jt(CH.sway, [0, -0.25, 0], 1.7), lit(1.4, [0, 1, 2].map(function (i) { var t = i / 3 * TAU; return cn(0.1, 0.3, [Math.sin(t) * 0.22, -0.4, Math.cos(t) * 0.22], EC2, 'ct_ecto', 4, [Math.PI, 0, 0]); }))));
    ENEMY_MODELS.ectoS = fin(P, 1, { hover: 0.2, flap: 6 });
  })();

  // 无头骑士：暗铁色全身甲、破烂的紫色披风；脖子上烧着绿色鬼火，左手捧着自己的头盔（眼缝发绿光），右手平端长枪
  (function () {
    var AR = 0x4a4e5a, AR2 = 0x3a3e48, AR3 = 0x6a6e7a, CAPE = 0x3a1a4a, GG = 0x6dffb0;
    a = K.human({ w: 1.18, legC: AR2, legT: 'metal', footC: 0x2a2c34, footT: 'metal', hipC: 0x2a2632, hipT: 'cloth', bodyC: AR, bodyT: 'metal', armC: AR, armT: 'metal', headC: AR2, headT: 'metal', fwd: 0.55, armS: 0.45, fist: 1.2 });
    P = a.p.concat([
      cy(0.26, 0.33, 0.34, [0, 0.93, 0], AR2, 'metal', 8, null, [1, 1, 0.76]),
      bx([0.07, 0.48, 0.05], [0, 1.3, 0.2], AR3, 'metal'),
      cy(0.2, 0.27, 0.1, [0, 1.56, 0], AR3, 'metal', 8, null, [1, 1, 0.8])
    ]).concat(pair(a.arm.L.a, a.arm.R.a, [sp(0.18, [0.33, 1.52, 0], AR3, 'metal', [1.2, 0.72, 1.1], [6, 4]), cn(0.06, 0.18, [0.38, 1.66, 0], AR2, 'metal', 4, [0, 0, -0.5])]));
    P = P.concat(on(a.head, lit(1.45, [cn(0.15, 0.5, [0, 1.88, 0], GG, 'plain', 6), cn(0.09, 0.32, [0.05, 1.98, 0.03], 0x9affc8, 'plain', 5), cn(0.07, 0.26, [-0.07, 1.86, -0.04], GG, 'plain', 4)])));
    P = P.concat(on(jt(CH.sway, [0, 1.52, -0.2], 0.9), [bx([0.66, 1.3, 0.03], [0, 0.92, -0.25], CAPE, 'cloth', [0.1, 0, 0])]
      .concat([-0.24, -0.08, 0.08, 0.24].map(function (x, i) { return cn(0.09, 0.26, [x, 0.18 - (i % 2) * 0.06, -0.33], CAPE, 'cloth', 3, [Math.PI + 0.1, 0, 0]); }))));
    var hh = [0.36, 1.2, 0.44];
    P = P.concat(on(a.arm.L.b, [
      sp(0.15, hh, AR3, 'metal', [1, 1.12, 1.05], [7, 5]),
      bx([0.06, 0.2, 0.05], [hh[0], hh[1] + 0.06, hh[2] + 0.14], AR2, 'metal'),
      cn(0.045, 0.3, [hh[0], hh[1] + 0.26, hh[2] - 0.04], 0x8a1a2a, 'cloth', 4, [-0.5, 0, 0])
    ])).concat(on(a.arm.L.b, lit(2.6, [bx([0.2, 0.035, 0.02], [hh[0], hh[1] + 0.03, hh[2] + 0.16], GG, 'plain')])));
    P = P.concat(on(a.arm.R.b, [
      sgC([-0.35, 1.12, -0.35], [-0.35, 1.28, 1.6], 0.055, 0.018, 0x9a9eaa, 'metal', 6),
      cn(0.17, 0.32, [-0.35, 1.18, 0.42], AR3, 'metal', 6, [Math.PI / 2, 0, 0]),
      bx([0.02, 0.2, 0.34], [-0.35, 1.36, 1.15], 0x8a1a2a, 'cloth')
    ]));
    ENEMY_MODELS.headless = fin(P, 1.08, { hip: 0.95, lean: 0.1, roll: 0.06, flap: 5 });
  })();

  // ======== 随机事件 ========
  // 金袋哥布林：背着一个鼓鼓的大金币袋，袋口冒着金币，金耳环、紫头巾，跑得飞快
  (function () {
    a = K.gob({ skin: 0x58c84a, dark: 0x34922e, cloth: 0x5a2a7a, w: 0.98 });
    P = a.p.concat([
      sp(0.36, [0, 0.82, -0.38], 0x8a6a3a, 'cloth', [1, 1.15, 0.9], [8, 6]),
      cy(0.1, 0.16, 0.14, [0, 1.25, -0.4], 0x7a5a2e, 'cloth', 6),
      bx([0.05, 0.6, 0.03], [0.14, 0.82, 0.12], 0x5a3a22, 'cloth', [0.3, 0, 0.5])
    ]).concat(lit(1.6, [cy(0.1, 0.1, 0.03, [0.1, 1.32, -0.42], 0xffd23a, 'gold', 8, [0.4, 0, 0.3]), cy(0.1, 0.1, 0.03, [-0.08, 1.3, -0.35], 0xffd23a, 'gold', 8, [-0.3, 0, -0.2]), oc(0.07, [0.02, 1.38, -0.4], 0xfff0a0, 'plain')]))
      .concat(on(a.head, [cy(0.2, 0.21, 0.08, [0, 1.1, 0.06], 0x5a2a7a, 'cloth', 8)]))
      .concat(on(a.head, lit(1.6, sym([['torus', [0.045, 0.014, 3, 6], [0.4, 0.97, 0.02], 0xffd23a, [0, Math.PI / 2, 0], null, 'gold']]))));
    ENEMY_MODELS.goldgob = fin(P, 1.15, { hip: 0.41, lean: 0.3, bob: 0.06, roll: 0.08 });
  })();

  // 宝箱怪：金色的宝箱，箱盖张成一张大嘴，上下两排尖牙、一条红舌头，箱盖前沿一对黄眼睛，底下四条短腿
  (function () {
    var WD = 0xc8922a, TR = 0xfff0a0, MAW = 0x5a0a10;
    P = [
      bx([1.5, 0.66, 1.0], [0, 0.6, 0], WD, 'it_plank'),
      bx([1.54, 0.07, 1.04], [0, 0.94, 0], 0x5a3414, 'wood'),
      bx([1.36, 0.1, 0.86], [0, 0.95, 0], MAW, 'plain')
    ].concat(lit(1.5, [bx([0.12, 0.7, 1.06], [0.5, 0.6, 0], TR, 'gold'), bx([0.12, 0.7, 1.06], [-0.5, 0.6, 0], TR, 'gold')]));
    for (k = 0; k < 6; k++) P.push(cn(0.05, 0.16, [-0.6 + k * 0.24, 1.04, 0.47], 0xf4ecd8, 'bone', 3));
    P = P.concat(on(jt(CH.sway, [0, 0.98, 0.1], 1.5), [bx([0.36, 0.06, 0.6], [0, 1.0, 0.35], 0xd0303a, 'plain', [-0.15, 0, 0])]));
    // 箱盖：以后沿为轴张开（尾巴通道让它一张一合）
    var hinge = [0, 0.95, -0.5], lidParts = [
      bx([1.54, 0.3, 1.04], [0, 1.1, 0], WD, 'it_plank'),
      bx([1.36, 0.04, 0.86], [0, 0.96, 0.0], MAW, 'plain'),
      bx([0.16, 0.12, 0.06], [0, 1.0, 0.53], TR, 'gold')
    ].concat(lit(1.5, [bx([0.12, 0.32, 1.06], [0.5, 1.1, 0], TR, 'gold'), bx([0.12, 0.32, 1.06], [-0.5, 1.1, 0], TR, 'gold')]));
    for (k = 0; k < 5; k++) lidParts.push(cn(0.05, 0.16, [-0.48 + k * 0.24, 0.9, 0.47], 0xf4ecd8, 'bone', 3, [Math.PI, 0, 0]));
    lidParts = lidParts.concat(lit(2.6, sym([oc(0.085, [0.3, 1.14, 0.53], 0xffe040, 'plain', [1, 0.7, 0.5])])))
      .concat(sym([bx([0.05, 0.05, 0.02], [0.3, 1.14, 0.575], 0x1a0a00, 'plain')]));
    P = P.concat(on(jt(CH.tail, hinge, 1.9), rotX(lidParts, hinge, -0.72)));
    P = P.concat(limbs(CH.hip, [0.5, 0.3, -0.3], [cy(0.1, 0.09, 0.3, [0.5, 0.16, -0.3], 0x7a4a24, 'wood', 5), bx([0.18, 0.06, 0.24], [0.5, 0.03, -0.26], 0x3a2614, 'wood')], 0, null, null, 1));
    P = P.concat(limbs(CH.sho, [0.5, 0.3, 0.3], [cy(0.1, 0.09, 0.3, [0.5, 0.16, 0.3], 0x7a4a24, 'wood', 5), bx([0.18, 0.06, 0.24], [0.5, 0.03, 0.34], 0x3a2614, 'wood')], 0, null, null, 1));
    ENEMY_MODELS.mimic = fin(P, 1, { hip: 0.3, lean: 0.06, bob: 0.12, roll: 0.1, flap: 18 });
  })();
})();

// ---------------- 数值 ----------------
// E(名字, 血量, 接触伤害, 速度, 碰撞半径, 经验, 粒子颜色, 模型, 额外)；行为见 content.js（Enemies.BEHAVIORS）
// 额外字段：pack 每次刷出几只（狼群）；limit / alt 同时最多几只，多了换成 alt；split / splitN 死后分裂；
//          shield 正面的飞弹被盾挡住；goldbag 挨打掉金币；noTouch 不造成接触伤害；undead 亡灵（墓碑、灵质、无头骑士都算）
ENEMIES.wolf = E('灰林狼', 9, 14, 8, 0.55, 1, 0x8a8478, ENEMY_MODELS.wolf, { behavior: 'pack', pack: 3 });
ENEMIES.shroom = E('孢子菇', 24, 12, 3.5, 0.65, 2, 0x7a6ae0, ENEMY_MODELS.shroom, { behavior: 'spore' });
ENEMIES.drummer = E('哥布林鼓手', 26, 10, 5.5, 0.6, 4, 0xd9533a, ENEMY_MODELS.drummer, { behavior: 'drum', cap: 60 });
ENEMIES.worm = E('沙穴蠕虫', 30, 26, 6, 0.8, 3, 0xc89a5a, ENEMY_MODELS.worm, { behavior: 'burrow', cap: 40 });
ENEMIES.vulture = E('食腐秃鹫', 14, 24, 8, 0.6, 2, 0x8a6a4a, ENEMY_MODELS.vulture, { behavior: 'dive', flyer: true, cap: 60 });
ENEMIES.lizard = E('蜥人盾卫', 40, 22, 4.5, 0.75, 4, 0x8aaa4a, ENEMY_MODELS.lizard, { behavior: 'shield', shield: true, cap: 80 });
ENEMIES.tomb = E('诅咒墓碑', 90, 10, 0, 0.95, 8, 0x6dff9a, ENEMY_MODELS.tomb, { behavior: 'spawner', cap: 16, limit: 3, alt: 'zombie', noTouch: true, undead: true });
ENEMIES.ecto = E('灵质团', 34, 16, 5.5, 0.75, 2, 0x4affc0, ENEMY_MODELS.ecto, { behavior: 'ooze', flyer: true, split: 'ectosmall', splitN: 3, cap: 80, undead: true });
ENEMIES.ectosmall = E('小灵质', 10, 9, 7.5, 0.45, 1, 0x7affd8, ENEMY_MODELS.ectoS, { flyer: true, cap: 160, undead: true });
ENEMIES.headless = E('无头骑士', 60, 30, 6, 0.9, 5, 0x6dffb0, ENEMY_MODELS.headless, { behavior: 'lancer', cap: 40, undead: true });
// 随机事件的敌人（不在刷怪池里）
ENEMIES.goldgob = E('金袋哥布林', 60, 0, 10.5, 0.6, 0, 0xffc928, ENEMY_MODELS.goldgob, { behavior: 'flee', goldbag: true, noTouch: true, cap: 2 });
ENEMIES.mimic = E('宝箱怪', 250, 32, 6, 1.0, 30, 0xc8922a, ENEMY_MODELS.mimic, { miniboss: true, attacks: ['mimicHop', 'mimicSpit', 'mimicHop'] });

// ---------------- 第 8 块的新敌人和小 Boss 的模型（第 10 块） ----------------
// 林中野猪、蜥人甩石手是自己的模型；五个小 Boss = 上面的 CONTENT 敌人换个颜色、加几样东西、放大（头顶的金冠是自动加的）
(function () {
  var K = ENEMY_KIT;
  var bx = K.bx, cy = K.cy, sp = K.sp, cn = K.cn, ic = K.ic, oc = K.oc, lit = K.lit, sym = K.sym, sgB = K.sgB, sgC = K.sgC;
  var CH = K.CH, jt = K.jt, on = K.on, fz = K.fz, limbs = K.limbs, pair = K.pair;
  var a, P, k, hc, hr;
  // 放大一个模型：零件、关节一起放大（ENEMY_KIT.fin）；步幅按放大倍数缩小，大个子迈大步
  function big(m, k) {
    var an = {};
    for (var key in m.anim) an[key] = m.anim[key];
    if (an.stride) an.stride /= k;
    return ENEMY_KIT.fin(m, k, an);
  }
  // 换颜色：map = { 旧颜色: 新颜色 }，fn(零件) 可以再改一下（返回 null 就去掉这个零件）；关节、动画参数不变
  function recolor(parts, map, fn) {
    var out = [];
    parts.forEach(function (p) {
      var q = p.slice();
      if (map[q[3]] != null) q[3] = map[q[3]];
      if (fn) q = fn(q);
      if (q) out.push(q);
    });
    out.anim = parts.anim;
    return out;
  }
  // 把方向 d（单位向量）变成让零件的 +z 轴朝着它的欧拉角（XYZ 顺序）
  function zTo(d) { return [Math.atan2(-d[1], d[2]), Math.asin(clamp(d[0], -1, 1)), 0]; }

  // ======== 林中野猪 ========
  // 敦实的野猪：桶一样的身子、肩上高高隆起、背脊一排黑色的鬃毛，长鼻子顶着一块粉灰色的鼻盘，
  // 两根往上弯的象牙色獠牙，小耳朵，细尾巴尖上一撮毛，黑蹄子，橙色的小眼睛；腿还是灰林狼的四条腿
  (function () {
    var F = 0x4a3426, FD = 0x2a1e16, FM = 0x5e4634, NOSE = 0x8a5a50, TU = 0xf0e6c8, HF = 0x1a1410;
    P = [
      sp(0.32, [0, 0.6, -0.02], F, 'fur', [0.95, 0.92, 1.55], [6, 5]),
      sp(0.28, [0, 0.76, 0.22], FD, 'fur', [0.95, 0.85, 1.0], [6, 4]),
      sp(0.26, [0, 0.6, -0.36], F, 'fur', [1, 0.95, 1.0], [6, 4])
    ];
    // 背脊的鬃毛：从肩峰往后越来越低
    for (k = 0; k < 7; k++) {
      var z = 0.38 - k * 0.13, y = (z > 0.1 ? 0.99 - Math.abs(z - 0.24) * 0.5 : 0.9 - (0.1 - z) * 0.12);
      P.push(cn(0.055 - k * 0.003, 0.2 - Math.abs(k - 1.5) * 0.012, [0, y, z], FD, 'fur', 3, [-0.4, 0, 0], [0.7, 1, 1]));
    }
    var head = jt(CH.head, [0, 0.66, 0.48], 1.2);
    hc = [0, 0.62, 0.66]; hr = [0.19, 0.21, 0.24];
    P = P.concat(on(head, [
      sp(0.21, hc, F, 'fur', [0.9, 1.0, 1.15], [6, 4]),
      cy(0.1, 0.15, 0.34, [0, 0.55, 0.9], FM, 'fur', 6, [Math.PI / 2 + 0.15, 0, 0]),
      cy(0.105, 0.105, 0.04, [0, 0.525, 1.07], NOSE, 'skin', 6, [Math.PI / 2 + 0.15, 0, 0]),
      bx([0.1, 0.035, 0.012], [0, 0.522, 1.095], 0x2a1414, 'plain', [0.15, 0, 0])
    ])).concat(on(head, sym([
      cn(0.036, 0.14, [0.1, 0.5, 0.96], TU, 'bone', 4, [0.15, 0, -0.55]),
      cn(0.022, 0.11, [0.14, 0.6, 0.97], TU, 'bone', 4, [-0.45, 0, -0.1]),
      cn(0.07, 0.16, [0.13, 0.81, 0.57], FD, 'fur', 4, [-0.45, 0, -0.55], [1, 1, 0.5])
    ]))).concat(on(head, lit(2.2, sym([bx([0.05, 0.03, 0.02], [0.105, 0.7, fz(hc, hr, 0.105, 0.7) + 0.004], 0xff8a2a, 'plain', [0, 0, -0.25])]))));
    // 前腿跟着肩通道、后腿跟着髋通道：左前和右后一起迈
    var leg = function (ch, chb, x, z, dz) {
      return limbs(ch, [x, 0.55, z], [sgC([x, 0.58, z], [x + 0.01, 0.3, z + dz], 0.095, 0.075, F, 'fur')], chb, [x + 0.01, 0.3, z + dz],
        [sgC([x + 0.01, 0.3, z + dz], [x + 0.01, 0.07, z + dz * 0.5], 0.065, 0.05, FD, 'fur', 4), bx([0.1, 0.07, 0.13], [x + 0.01, 0.035, z + dz * 0.5 + 0.03], HF, 'plain')], 1, 0.8);
    };
    P = P.concat(leg(CH.sho, CH.elb, 0.15, 0.32, 0.04)).concat(leg(CH.hip, CH.knee, 0.15, -0.38, 0.08));
    P = P.concat(on(jt(CH.tail, [0, 0.68, -0.6], 1.6), [
      sgC([0, 0.68, -0.6], [0, 0.5, -0.72], 0.028, 0.02, F, 'fur', 4),
      cn(0.05, 0.13, [0, 0.44, -0.75], FD, 'fur', 3, [Math.PI + 0.3, 0, 0])
    ]));
    ENEMY_MODELS.boar = ENEMY_KIT.fin(P, 1.35, { hip: 0.6, lean: 0.06, bob: 0.03, roll: 0.04, stride: 2.7, flap: 7 });
  })();

  // ======== 蜥人甩石手 ========
  // 浅沙色鳞片的蜥人，没有盾：右手举过头顶抡着一根甩石绳（两根绳 + 兜着石子的皮兜），左手按着腰上的石子袋，
  // 头上系一条红布头带（两根带子飘在脑后），背上一排小骨刺，长尾巴
  (function () {
    var L1 = 0x9aa858, L2 = 0x6a7a3a, BEL = 0xbcb47a, BAND = 0xb8402a, CORD = 0xc8b080;
    a = K.human({ w: 1.12, legC: L2, legT: 'scale', footC: 0x4a5a28, footT: 'scale', hipC: 0x6a4a2a, hipT: 'cloth', bodyC: L1, bodyT: 'scale', armC: L2, armT: 'scale', headC: L1, headT: 'scale', fwd: 0.12, armS: 0.5 });
    hc = [0, 1.74, 0.05]; hr = [0.135, 0.13, 0.17];
    P = a.p.filter(function (q) { return q[7] !== a.arm.R.a && q[7] !== a.arm.R.b; }).concat([
      bx([0.22, 0.38, 0.04], [0, 1.27, 0.155], BEL, 'scale'),
      cy(0.2, 0.22, 0.09, [0, 1.04, 0], 0x6a4a2a, 'cloth', 8, null, [1, 1, 0.75]),
      bx([0.1, 0.1, 0.04], [0, 1.04, 0.16], 0xc8a060, 'gold')
    ]).concat(on(a.head, [
      sp(0.15, hc, L1, 'scale', [0.9, 0.87, 1.13], [7, 5]),
      bx([0.17, 0.12, 0.28], [0, 1.69, 0.26], L2, 'scale'),
      bx([0.16, 0.02, 0.26], [0, 1.645, 0.27], 0x2a120a, 'plain'),
      cy(0.142, 0.142, 0.05, [0, 1.8, 0.04], BAND, 'cloth', 8, null, [1, 1, 1.2])
    ].concat([0, 1, 2].map(function (i) { return cn(0.035, 0.11 - i * 0.015, [0, 1.86 - i * 0.07, -0.1 - i * 0.04], L2, 'scale', 3, [-0.9, 0, 0]); }))))
      .concat(on(a.head, lit(2.6, sym([bx([0.035, 0.04, 0.02], [0.09, 1.77, fz(hc, hr, 0.09, 1.77) + 0.004], 0xffe040, 'plain')]))))
      .concat(on(jt(CH.sway, [0, 1.8, -0.14], 1.4), [
        bx([0.04, 0.22, 0.015], [0.04, 1.7, -0.17], BAND, 'cloth', [0.3, 0, 0.12]),
        bx([0.04, 0.18, 0.015], [-0.04, 1.71, -0.17], BAND, 'cloth', [0.45, 0, -0.15])
      ]));
    // 举起来的右臂 + 甩石绳（抡到一半的样子：绳子从手里往后上方甩出去，皮兜里兜着一块石头）
    var sho = [-0.3, 1.49, 0], elb = [-0.44, 1.72, 0.02], wri = [-0.4, 1.98, 0.06], hand = [-0.39, 2.03, 0.07];
    var ja = jt(CH.sho + 1, sho, 0.2), jb = jt(CH.elb + 1, elb, 0.2, ja), pouch = [-0.66, 2.2, -0.34];
    P = P.concat(on(ja, [ic(0.09, [-0.31, 1.47, 0], L2, 'scale', [1.1, 0.9, 1]), sgC(sho, elb, 0.07, 0.06, L2, 'scale', 5)]))
      .concat(on(jb, [
        sgC(elb, wri, 0.06, 0.05, L2, 'scale', 5), ic(0.08, hand, L2, 'scale', [0.9, 1.1, 0.9]),
        sgB(hand, [pouch[0] + 0.05, pouch[1] + 0.03, pouch[2] + 0.04], 0.014, CORD, 'cloth'),
        sgB(hand, [pouch[0] - 0.03, pouch[1] - 0.04, pouch[2] - 0.03], 0.014, CORD, 'cloth'),
        sp(0.075, pouch, 0x7a5a32, 'ch_leather', [1.2, 0.8, 1], [5, 3]),
        oc(0.06, [pouch[0], pouch[1] + 0.045, pouch[2]], 0x9a958a, 'en_rock')
      ]));
    // 腰上的石子袋（左手按着）
    P = P.concat([
      sp(0.1, [0.3, 0.96, 0.08], 0x7a5a32, 'ch_leather', [0.9, 1.1, 0.85], [5, 3]),
      oc(0.045, [0.29, 1.07, 0.1], 0x9a958a, 'en_rock'), oc(0.04, [0.33, 1.06, 0.05], 0x8a857a, 'en_rock')
    ]);
    var tail = jt(CH.tail, [0, 0.98, -0.14], 1.5);
    P = P.concat(on(tail, [sgC([0, 0.98, -0.14], [0, 0.55, -0.7], 0.11, 0.075, L1, 'scale'), sgC([0, 0.55, -0.7], [0, 0.12, -1.1], 0.075, 0.03, L2, 'scale')]));
    ENEMY_MODELS.lizardsling = ENEMY_KIT.fin(P, 1.05, { hip: 0.95, lean: 0.05, roll: 0.06, flap: 4 });
  })();

  // ======== 小 Boss ========
  // 绿衣巨骑：无头骑士染成冬青绿（胸甲边和中缝是金色），肩上一圈冬青叶花环（深绿的叶子 + 发光的红浆果）；左手还捧着头盔、右手还端着长枪
  (function () {
    var m = ENEMY_MODELS.headless, GOLD = 0xe8b83a;
    P = recolor(m, { 0x4a4e5a: 0x2f6a3a, 0x3a3e48: 0x24502c, 0x6a6e7a: 0x3f8a4a, 0x3a1a4a: 0x1e3a22, 0x2a2c34: 0x1a3420, 0x2a2632: 0x1e3a22 }, function (q) {
      // 领口那一圈、胸前的中缝 → 金边
      if (!q[7] && q[0] === 'cyl' && Math.abs(q[2][1] - 1.56 * 1.08) < 0.01) { q[3] = GOLD; q[6] = 'gold'; }
      if (!q[7] && q[0] === 'box' && Math.abs(q[2][1] - 1.3 * 1.08) < 0.01 && q[2][2] > 0.1) { q[3] = GOLD; q[6] = 'gold'; }
      return q;
    });
    var C = [0, 1.72, 0.0], RX = 0.33, RZ = 0.26;
    for (k = 0; k < 8; k++) {
      var an = k / 8 * TAU + 0.2;
      P.push(cn(0.11, 0.3, [Math.sin(an) * RX, C[1] + (k % 2) * 0.03, C[2] + Math.cos(an) * RZ], k % 2 ? 0x1e5a28 : 0x2a6e30, 'leaf', 4, [0.15, an - Math.PI / 2, -Math.PI / 2], [0.5, 1, 1]));
    }
    P = P.concat(lit(1.4, [0, 1, 2, 3, 4, 5].map(function (i) {
      var an = i / 6 * TAU + 0.55;
      return oc(0.065, [Math.sin(an) * (RX + 0.04), C[1] + 0.07, C[2] + Math.cos(an) * (RZ + 0.04)], 0xd8302a, 'plain');
    })));
    P.anim = m.anim;
    ENEMY_MODELS.greenknight = big(P, 1.8);
  })();
  // 毒伞菇王：孢子菇放大，菌盖上的斑点更亮、多四个，菌盖下面一圈褶边（菌褶）
  (function () {
    var m = ENEMY_MODELS.shroom, S = 1.05, GLOW = 0x6dffd0, head = null;
    P = recolor(m, {}, function (q) {
      if (q[3] === GLOW && q[0] === 'sphere' && q[8] === 1.6) { q[8] = 2.2; head = q[7]; }
      return q;
    });
    var cc = [0, 1.28, 0], cr = [0.78, 0.42, 0.78];
    P = P.concat(on(head, lit(2.2, [[0.35, 3.0, 0.11], [0.85, 1.9, 0.1], [0.85, 3.9, 0.1], [0.85, 5.9, 0.1]].map(function (s) {
      var t = s[0], f = s[1];
      return sp(s[2] * S, [cr[0] * Math.sin(t) * Math.cos(f) * S, (cc[1] + cr[1] * Math.cos(t)) * S, cr[2] * Math.sin(t) * Math.sin(f) * S], GLOW, 'plain', [1, 0.5, 1], [6, 3], [Math.sin(f) * t * 0.7, 0, -Math.cos(f) * t * 0.7]);
    }))));
    for (k = 0; k < 12; k++) {
      var an = k / 12 * TAU;
      P.push(on(head, [cn(0.1 * S, 0.24 * S, [Math.sin(an) * 0.58 * S, 1.02 * S, Math.cos(an) * 0.58 * S], k % 2 ? 0xc8b8e8 : 0xe8dcc8, 'cloth', 3, [Math.PI - 0.5 * Math.cos(an), 0, 0.5 * Math.sin(an)])])[0]);
    }
    P.anim = m.anim;
    ENEMY_MODELS.shroomking = big(P, 2.6);
  })();
  // 沙虫女王：沙穴蠕虫的甲壳换成紫色，嘴边一圈金色的冠齿（发光）
  (function () {
    var m = ENEMY_MODELS.worm, head = null, hy = 2.3, hz = 0.38, MT = Math.PI / 2 - 0.35;
    P = recolor(m, { 0xc89a5a: 0x7a4aa8, 0x9a6a38: 0x5a3a88 }, function (q) { if (q[3] === 0x4a1210) head = q[7]; return q; });
    P = P.concat(on(head, lit(1.3, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) {
      var an = i / 10 * TAU + 0.31, tx = Math.cos(an) * 0.35, ty = Math.sin(an) * 0.35;
      return cn(0.055, 0.22, [tx, hy + ty * 0.94, hz + 0.27 - ty * 0.33], 0xe8c050, 'gold', 4, [MT, 0, 0]);
    }))));
    P.anim = m.anim;
    ENEMY_MODELS.wormqueen = big(P, 2.2);
  })();
  // 蜥人督军：头上一把金色的扇形冠羽（换掉红冠），更大的青铜盾（半径 × 1.25）上一个发光的太阳纹（圆盘 + 八道光芒），长矛上挂一撮红缨
  (function () {
    var m = ENEMY_MODELS.lizard, S = 1.05, BR = 0xc08a3a, arm = null, head = null, spear = null, SUN = 0xffd27a;
    P = recolor(m, {}, function (q) {
      var r = q[1][0];
      if (q[0] === 'cyl' && q[3] === BR && Math.abs(r - 0.5 * S) < 0.01) { arm = q[7]; return null; }   // 旧盾面
      if (q[0] === 'torus' && q[3] === 0x8a5a24) return null;                                         // 旧盾沿
      if (q[0] === 'cyl' && q[3] === 0xe8c050 && Math.abs(r - 0.13 * S) < 0.01) return null;          // 旧盾心
      if (q[0] === 'box' && q[3] === 0xffd27a) return null;                                           // 旧十字
      if (q[0] === 'cone' && q[3] === 0xc8402a) { head = q[7]; return null; }                         // 旧红冠
      if (q[0] === 'cone' && q[3] === 0xd8dde4) spear = q;                                            // 矛头
      return q;
    });
    var C = [0.16 * S, 1.18 * S, 0.46 * S], R = 0.5 * S * 1.25;
    P = P.concat(on(arm, [
      cy(R, R, 0.075, C, BR, 'gold', 14, [Math.PI / 2, 0, 0]),
      ['torus', [R, 0.05, 4, 14], [C[0], C[1], C[2] + 0.04], 0x8a5a24, null, null, 'metal']
    ])).concat(on(arm, lit(1.9, [cy(0.17, 0.17, 0.03, [C[0], C[1], C[2] + 0.05], SUN, 'gold', 8, [Math.PI / 2, 0, 0])]
      .concat([0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { var an = i / 8 * TAU; return cn(0.045, 0.17, [C[0] + Math.sin(an) * 0.28, C[1] + Math.cos(an) * 0.28, C[2] + 0.05], SUN, 'plain', 3, [0, 0, -an]); })))));
    // 冠羽：头盔顶上往后展开的五根金羽
    P = P.concat(on(head, lit(1.2, [0, 1, 2, 3, 4].map(function (i) {
      var ph = -0.25 + i * 0.36, h = 0.34 - Math.abs(i - 1.5) * 0.04;
      return cn(0.05, h, [0, 1.98 * S + Math.cos(ph) * h * 0.5, 0.02 + -Math.sin(ph) * h * 0.5], 0xe8c050, 'gold', 4, [-ph, 0, 0], [0.4, 1, 1]);
    }))));
    // 红缨：挂在矛头下面
    var tp = spear[2];
    P.push(on(spear[7], [cn(0.075, 0.2, [tp[0], tp[1] - 0.24, tp[2] - 0.06], 0xc8302a, 'cloth', 4, [Math.PI, 0, 0])])[0]);
    P.anim = m.anim;
    ENEMY_MODELS.lizardlord = big(P, 2.0);
  })();
  // 守墓黑犬：灰林狼染成黑毛，眼睛发绿光，脖子上一圈断了的铁链项圈（八节 + 垂下来三节，最后一节是断开的），耳朵是破的
  (function () {
    var m = ENEMY_MODELS.wolf, S = 1.08, CHN = 0x5a5a62, FD2 = 0x121014;
    P = recolor(m, { 0x5e5650: 0x1e1c22, 0xa49a8c: 0x3a363e, 0x37312c: FD2, 0xffd23a: 0x2ae860 }, function (q) {
      if (q[3] === 0x2ae860) q[8] = 1.35;   // 绿火：R、B 乘完还远不到 1，不会冲成白色
      return q;
    });
    // 破耳朵：每只耳朵旁边再加一小截歪掉的尖
    var ears = P.filter(function (q) { return q[0] === 'cone' && q[3] === FD2 && q[7] && q[7].ch === CH.head && Math.abs(q[1][0] - 0.08 * S) < 0.005; });
    ears.forEach(function (q) {
      var f = q[2][0] > 0 ? 1 : -1;
      P.push(on(q[7], [cn(0.04 * S, 0.12 * S, [q[2][0] + 0.06 * f, q[2][1] - 0.04, q[2][2] - 0.02], FD2, 'fur', 4, [-0.4, 0, -0.75 * f])])[0]);
    });
    // 项圈：绕着脖子（脖子往前上方伸）一圈八节
    var C = [0, 0.84 * S, 0.6 * S], RR = 0.21 * S, ax = [0, 0.5, 0.866], u = [1, 0, 0], v = [0, 0.866, -0.5];
    for (k = 0; k < 8; k++) {
      var an = k / 8 * TAU, ca = Math.cos(an), sa = Math.sin(an);
      var rd = [ca * u[0] + sa * v[0], ca * u[1] + sa * v[1], ca * u[2] + sa * v[2]];
      P.push(['torus', [0.06, 0.018, 3, 4], [C[0] + rd[0] * RR, C[1] + rd[1] * RR, C[2] + rd[2] * RR], CHN, k % 2 ? zTo(rd) : zTo(ax), null, 'ch_chain']);
    }
    // 垂下来的三节（摇摆通道），最后一节断开
    var bot = [C[0] - v[0] * RR, C[1] - v[1] * RR, C[2] - v[2] * RR], sw = jt(CH.sway, bot, 1.5);
    P = P.concat(on(sw, [
      ['torus', [0.06, 0.018, 3, 4], [bot[0], bot[1] - 0.09, bot[2] + 0.02], CHN, [0, Math.PI / 2, 0], null, 'ch_chain'],
      ['torus', [0.06, 0.018, 3, 4], [bot[0], bot[1] - 0.18, bot[2] + 0.03], CHN, [0, 0, 0], null, 'ch_chain'],
      ['fxArc', [0.06, 0.018, 3, 5, Math.PI * 1.35], [bot[0], bot[1] - 0.27, bot[2] + 0.04], CHN, [0, Math.PI / 2, -0.6], null, 'ch_chain']
    ]));
    P.anim = m.anim;
    ENEMY_MODELS.gravehound = big(P, 2.4);
  })();
})();

// 迷雾森林
ENEMIES.boar = E('林中野猪', 26, 20, 6.2, 0.75, 3, 0x6a4a32, ENEMY_MODELS.boar, { role: 'charger', behavior: 'lancer' });
// 黄沙古道
ENEMIES.lizardsling = E('蜥人甩石手', 18, 14, 4.8, 0.6, 3, 0x8aaa4a, ENEMY_MODELS.lizardsling, { role: 'ranged', behavior: 'shoot', shootCd: 2.6, shotSpeed: 14, slowMove: true, shotModel: 'stone' });   // 边慢慢逼近边甩石，不后退；甩出去的是石子（enemies.js）
// 小 Boss（迷雾森林、黄沙古道、沉钟古城各两个；幽魂冠军那一行在 data_enemies.js）
// 第 13 块（D-C13-6）：伤害 34 → 28；28 时普通机器人 3 局里还有 2 局在它出来 60 秒内死，按决定去掉第 1 关这一只的跃马重击（它只在第 1 关出现）
ENEMIES.greenknight = E('绿衣巨骑', 260, 28, 6.2, 1.5, 30, 0x4a8a4a, ENEMY_MODELS.greenknight, { miniboss: true, undead: true, attacks: ['charge', 'slam'] });
ENEMIES.shroomking = E('毒伞菇王', 270, 30, 4.4, 1.6, 30, 0x7a6ae0, ENEMY_MODELS.shroomking, { miniboss: true, attacks: ['volley', 'acidrain', 'summon'], zone: 'spore', summonId: 'shroom', summonN: 3 });
ENEMIES.wormqueen = E('沙虫女王', 300, 34, 6.6, 1.6, 30, 0x9a5ac8, ENEMY_MODELS.wormqueen, { miniboss: true, attacks: ['quakeline', 'charge', 'summon'], summonId: 'worm', summonN: 3 });
ENEMIES.lizardlord = E('蜥人督军', 290, 36, 5.4, 1.5, 30, 0x8aaa4a, ENEMY_MODELS.lizardlord, { miniboss: true, shield: true, attacks: ['charge', 'slam', 'volley'] });
ENEMIES.gravehound = E('守墓黑犬', 340, 38, 7.0, 1.5, 40, 0x3a3a3a, ENEMY_MODELS.gravehound, { miniboss: true, undead: true, attacks: ['charge', 'bellyflop', 'summon'], summonId: 'undead', summonN: 6 });
