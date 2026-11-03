'use strict';
// ============================================================
//  新敌人（第二批内容）：每关三种，各有自己的行为（行为逻辑在 content.js 的 Enemies.BEHAVIORS）
//  森林：灰林狼（成群包抄、一起扑）、孢子菇（留下减速孢子云）、哥布林鼓手（擂鼓强化附近的怪，连着一道光）
//  沙漠：沙穴蠕虫（钻进沙里，地面裂开后从脚下钻出）、食腐秃鹫（标出落点再俯冲）、蜥人盾卫（盾牌挡正面的飞弹）
//  墓地：诅咒墓碑（不停召唤亡灵，要打碎）、灵质团（死后裂成三团小灵质）、无头骑士（地上画出冲锋线再端枪冲刺）
//  随机事件用：金袋哥布林、宝箱怪
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

  // ======== 森林 ========
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

  // ======== 沙漠 ========
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

  // ======== 墓地 ========
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
//          shield 正面的飞弹被盾挡住；goldbag 挨打掉金币；noTouch 不造成接触伤害
ENEMIES.wolf = E('灰林狼', 9, 14, 8, 0.55, 1, 0x8a8478, ENEMY_MODELS.wolf, { behavior: 'pack', pack: 3 });
ENEMIES.shroom = E('孢子菇', 24, 12, 3.5, 0.65, 2, 0x7a6ae0, ENEMY_MODELS.shroom, { behavior: 'spore' });
ENEMIES.drummer = E('哥布林鼓手', 26, 10, 5.5, 0.6, 4, 0xd9533a, ENEMY_MODELS.drummer, { behavior: 'drum', cap: 60 });
ENEMIES.worm = E('沙穴蠕虫', 30, 26, 6, 0.8, 3, 0xc89a5a, ENEMY_MODELS.worm, { behavior: 'burrow', cap: 40 });
ENEMIES.vulture = E('食腐秃鹫', 14, 24, 8, 0.6, 2, 0x8a6a4a, ENEMY_MODELS.vulture, { behavior: 'dive', flyer: true, cap: 60 });
ENEMIES.lizard = E('蜥人盾卫', 40, 22, 4.5, 0.75, 4, 0x8aaa4a, ENEMY_MODELS.lizard, { behavior: 'shield', shield: true, cap: 80 });
ENEMIES.tomb = E('诅咒墓碑', 90, 10, 0, 0.95, 8, 0x6dff9a, ENEMY_MODELS.tomb, { behavior: 'spawner', cap: 16, limit: 3, alt: 'zombie', noTouch: true });
ENEMIES.ecto = E('灵质团', 34, 16, 5.5, 0.75, 2, 0x4affc0, ENEMY_MODELS.ecto, { behavior: 'ooze', flyer: true, split: 'ectosmall', splitN: 3, cap: 80 });
ENEMIES.ectosmall = E('小灵质', 10, 9, 7.5, 0.45, 1, 0x7affd8, ENEMY_MODELS.ectoS, { flyer: true, cap: 160 });
ENEMIES.headless = E('无头骑士', 60, 30, 6, 0.9, 5, 0x6dffb0, ENEMY_MODELS.headless, { behavior: 'lancer', cap: 40 });
// 随机事件的敌人（不在刷怪池里）
ENEMIES.goldgob = E('金袋哥布林', 60, 0, 10.5, 0.6, 0, 0xffc928, ENEMY_MODELS.goldgob, { behavior: 'flee', goldbag: true, noTouch: true, cap: 2 });
ENEMIES.mimic = E('宝箱怪', 250, 32, 6, 1.0, 30, 0xc8922a, ENEMY_MODELS.mimic, { miniboss: true, attacks: ['mimicHop', 'mimicSpit', 'mimicHop'] });
