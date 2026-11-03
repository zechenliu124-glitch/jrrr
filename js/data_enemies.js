'use strict';
// ============================================================
//  敌人、小 Boss、关卡 Boss 的数据与模型
//  模型 = 零件列表（低多边形 + 像素贴图，正常人体比例，1 单位 = 1 米）
//  零件：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图, 关节, 发光倍数]
//  关节让四肢在顶点着色器里摆动（走路、扇翅膀、甩尾巴）；发光倍数乘在顶点色上，雾里也看得清
// ============================================================

// ---------------- 敌人 ----------------
function E(name, hp, dmg, spd, radius, xp, color, parts, extra) {
  var o = { name: name, hp: hp, dmg: dmg, speed: spd * 0.8, radius: radius, xp: xp, color: color, parts: parts };
  if (extra) for (var k in extra) o[k] = extra[k];
  return o;
}

// 各个模型（零件列表）、金冠、给 interact.js 用的建模小工具；其余的工具函数都关在下面的闭包里，不占全局名字
var ENEMY_MODELS = {}, CROWN_PARTS = null, ENEMY_KIT = null;
(function () {
  // ---------------- 敌人用的像素贴图（16×16 灰度，乘顶点色） ----------------
  (function () {
    var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就退回默认贴图 */ } };
    // 肋骨：往两边下弯的横骨 + 中间的胸骨（圆柱正面）和脊椎（背面）
    add('en_ribs', function (x, y, r) {
      var cx = Math.abs(((x + 8) % 16) - 7.5);
      if (cx < 1 || cx > 7) return 220 + r() * 22;
      var k = ((Math.floor(y - cx * 0.35) % 4) + 4) % 4;
      if (k === 3) return 38 + r() * 25;
      return (k === 0 ? 252 : 226) + r() * 8;
    });
    // 骷髅脸：大眼眶、倒三角鼻孔、一排牙
    add('en_skull', function (x, y, r) {
      var ex = x < 8 ? x - 4.5 : x - 10.5, ey = y - 6.5;
      if (ex * ex + ey * ey * 0.8 < 6.2) return 16 + r() * 14;
      if (y >= 9 && y <= 11 && Math.abs(x - 7.5) < (y - 8) * 0.75) return 28;
      if (y >= 13) return (x % 2 ? 250 : 196) - (x < 3 || x > 12 ? 70 : 0);
      if (y === 12) return 105;
      return 234 + r() * 18 - (r() < 0.08 ? 40 : 0);
    });
    // 哥布林/僵尸皮肤：淡淡的斑驳
    add('en_gob', function (x, y, r) {
      var v = 238 + r() * 12;
      if (Math.sin(x * 0.9 + y * 0.4) + Math.sin(y * 1.1 - x * 0.3) > 1.25) v -= 26;
      if (r() < 0.05) v -= 30;
      return v;
    });
    // 木乃伊绷带：一圈圈错开的布条
    add('en_band', function (x, y, r) {
      var k = (y + (x >> 2)) % 4;
      var v = k === 0 ? 160 : k === 1 ? 252 : 228 + r() * 16;
      if (r() < 0.04) v = 120;
      if ((x * 3 + y * 7) % 31 === 0) v = 70;
      return v;
    });
    // 幽灵床单：竖着的柔和褶子
    add('en_sheet', function (x, y, r) { return 236 + Math.sin(x * 0.8 + y * 0.15) * 13 + r() * 8; });
    // 石头：带裂缝的大块面
    var rng = mulberry32(4242), pts = [];
    for (var i = 0; i < 6; i++) pts.push([rng() * 16, rng() * 16]);
    add('en_rock', function (x, y, r) {
      var d1 = 99, d2 = 99;
      for (var i = 0; i < pts.length; i++) for (var ox = -16; ox <= 16; ox += 16) for (var oy = -16; oy <= 16; oy += 16) {
        var dx = x + 0.5 - pts[i][0] - ox, dy = y + 0.5 - pts[i][1] - oy, d = dx * dx + dy * dy;
        if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
      }
      var v = 240 - Math.sqrt(d1) * 3 + r() * 14;
      if (Math.sqrt(d2) - Math.sqrt(d1) < 0.9) v = 150;
      return v;
    });
    // 甲壳：一节节的硬壳
    add('en_chitin', function (x, y, r) { var k = y % 5, v = k === 0 ? 252 : k === 4 ? 105 : 212 + r() * 22; if (r() < 0.05) v -= 40; return v; });
    // 条纹（蜜蜂肚子、法老头巾）
    add('en_stripe', function (x, y, r) { return ((y >> 2) % 2 ? 48 : 245) + r() * 10; });
  })();

  // ---------------- 建模小工具 ----------------
  // 关节通道（和 enemies.js 的着色器对应）：左 = 模型 +x 一侧，右侧通道号 = 左 + 1
  var CH = { hip: 1, knee: 3, sho: 5, elb: 7, head: 9, wing: 10, tail: 12, sway: 13, twist: 14, leg: 15 };
  function jt(ch, p, s, parent) { return { ch: ch, p: p, s: s == null ? 1 : s, parent: parent || null }; }
  function on(j, parts) { for (var i = 0; i < parts.length; i++) parts[i][7] = j; return parts; }
  function lit(k, parts) { for (var i = 0; i < parts.length; i++) parts[i][8] = k; return parts; }
  function bx(s, p, c, t, r) { return ['box', s, p, c, r || null, null, t]; }
  function sp(rad, p, c, t, sc, seg, r) { return ['sphere', [rad, seg ? seg[0] : 8, seg ? seg[1] : 6], p, c, r || null, sc || null, t]; }
  function cy(rt, rb, h, p, c, t, n, r, sc) { return ['cyl', [rt, rb, h, n || 6], p, c, r || null, sc || null, t]; }
  function cn(rad, h, p, c, t, n, r, sc) { return ['cone', [rad, h, n || 5], p, c, r || null, sc || null, t]; }
  function ic(rad, p, c, t, sc, r, det) { return ['ball', [rad, det || 0], p, c, r || null, sc || null, t]; }
  function oc(rad, p, c, t, sc, r) { return ['oct', [rad], p, c, r || null, sc || null, t]; }
  // 两点之间的方块/圆柱（骨头、四肢）
  function segRot(a, b) {
    var dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], L = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return { L: L, m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [Math.atan2(dz, dy), 0, -Math.asin(clamp(dx / L, -1, 1))] };
  }
  function sgB(a, b, w, c, t, d) { var g = segRot(a, b); return ['box', [w, g.L, d || w], g.m, c, g.r, null, t]; }
  function sgC(a, b, r1, r2, c, t, n) { var g = segRot(a, b); return ['cyl', [r2, r1, g.L, n || 5], g.m, c, g.r, null, t]; }
  // 椭球正面（+z）在 (x, y) 处的 z，用来贴五官
  function fz(c, r, x, y) { var u = (x - c[0]) / r[0], v = (y - c[1]) / r[1]; return c[2] + r[2] * Math.sqrt(Math.max(0, 1 - u * u - v * v)); }
  // 左右镜像
  function mir(p) { var q = p.slice(); q[2] = [-p[2][0], p[2][1], p[2][2]]; if (p[4]) q[4] = [p[4][0], -p[4][1], -p[4][2]]; return q; }
  function sym(parts) { return parts.concat(parts.map(mir)); }
  // 平移一组零件（关节支点一起平移）
  function mv(parts, dx, dy, dz) {
    var src = [], dst = [];
    var J = function (j) {
      if (!j) return null;
      var i = src.indexOf(j);
      if (i >= 0) return dst[i];
      var c = { ch: j.ch, p: [j.p[0] + dx, j.p[1] + dy, j.p[2] + dz], s: j.s, parent: J(j.parent) };
      src.push(j); dst.push(c);
      return c;
    };
    return parts.map(function (p) { var q = p.slice(); q[2] = [p[2][0] + dx, p[2][1] + dy, p[2][2] + dz]; q[7] = J(p[7]); return q; });
  }
  // 一对两节肢体：按左侧（x>0）写，自动镜像出右侧；upper 绕关节 a 转，lower 先绕关节 b 再跟着 a 转
  function limbs(cha, pa, upper, chb, pb, lower, sa, sb, out) {
    var res = [];
    for (var side = 0; side < 2; side++) {
      var f = side ? -1 : 1;
      var ja = jt(cha + side, [pa[0] * f, pa[1], pa[2]], sa);
      var jb = chb ? jt(chb + side, [pb[0] * f, pb[1], pb[2]], sb, ja) : ja;
      var i, q;
      for (i = 0; i < upper.length; i++) { q = side ? mir(upper[i]) : upper[i].slice(); q[7] = ja; res.push(q); }
      for (i = 0; lower && i < lower.length; i++) { q = side ? mir(lower[i]) : lower[i].slice(); q[7] = jb; res.push(q); }
      if (out) out[side ? 'R' : 'L'] = { a: ja, b: jb };
    }
    return res;
  }
  // 左右各挂一份（左边按 x>0 写）
  function pair(jL, jR, parts) { return on(jL, parts.map(function (p) { return p.slice(); })).concat(on(jR, parts.map(mir))); }
  // 整体缩放（连关节支点一起）
  var PART_DIMS = { box: 3, cyl: 3, cone: 2, ball: 1, sphere: 1, oct: 1, dodec: 1, tet: 1, torus: 2 };
  function scl(parts, k) {
    var src = [], dst = [];
    var J = function (j) {
      if (!j) return null;
      var i = src.indexOf(j);
      if (i >= 0) return dst[i];
      var c = { ch: j.ch, p: [j.p[0] * k, j.p[1] * k, j.p[2] * k], s: j.s, parent: J(j.parent) };
      src.push(j); dst.push(c);
      return c;
    };
    return parts.map(function (p) {
      var q = p.slice(), n = PART_DIMS[p[0]] || 1;
      q[1] = p[1].map(function (v, i) { return i < n ? v * k : v; });
      q[2] = [p[2][0] * k, p[2][1] * k, p[2][2] * k];
      q[7] = J(p[7]);
      return q;
    });
  }
  // 收尾：缩放并挂上动画参数（hip 髋高、lean 前倾、roll 摇晃、bob 颠、hover 浮动、flap 摆动速度、rollR 滚动半径）
  function fin(parts, k, anim) {
    var out = k === 1 ? parts.slice() : scl(parts, k), a = {};
    for (var key in anim) a[key] = anim[key];
    ['hip', 'bob', 'hover', 'rollR'].forEach(function (n) { if (a[n]) a[n] *= k; });
    out.anim = a;
    return out;
  }

  // ---------------- 身体模板（都按 k = 1 写，最后用 fin 缩放） ----------------
  // 骷髅：约 1.95 米，细长的骨头、圆颅骨、画出来的黑眼眶
  function skel(o) {
    o = o || {};
    var B = o.bone || 0xdac7a0, T = 'bone', P = [], arm = {}, leg = {}, w = o.thick || 1;
    P = P.concat(limbs(CH.hip, [0.11, 0.98, 0],
      [sgB([0.11, 0.97, 0], [0.11, 0.55, 0.01], 0.09 * w, B, T), bx([0.11 * w, 0.08, 0.1 * w], [0.11, 0.53, 0.035], B, T)],
      CH.knee, [0.11, 0.53, 0.01],
      [sgB([0.11, 0.52, 0.01], [0.11, 0.08, -0.01], 0.075 * w, B, T), bx([0.11 * w, 0.06, 0.25], [0.11, 0.03, 0.05], B, T)],
      1, 1, leg));
    P.push(bx([0.34, 0.13 * w, 0.17 * w], [0, 0.99, 0], B, T));
    P.push(cy(0.04 * w, 0.045 * w, 0.32, [0, 1.17, -0.03], B, T, 5));
    if (!o.noRibs) P.push(cy(0.2, 0.15, 0.42, [0, 1.42, 0], B, 'en_ribs', 7, null, [1, 1, 0.7]));
    P.push(bx([0.5, 0.055 * w, 0.08 * w], [0, 1.62, 0.01], B, T));
    P.push(cy(0.035 * w, 0.04 * w, 0.12, [0, 1.69, -0.01], B, T, 5));
    var head = jt(CH.head, [0, 1.68, 0]);
    P = P.concat(on(head, [
      sp(0.135, [0, 1.83, -0.01], B, T, [1, 1, 1.12]),
      bx([0.2, 0.16, 0.04], [0, 1.78, 0.128], B, 'en_skull'),
      bx([0.15, 0.055, 0.11], [0, 1.685, 0.06], B, T)
    ]));
    if (o.eye) P = P.concat(on(head, lit(2.4, sym([bx([0.045, 0.035, 0.012], [0.046, 1.792, 0.15], o.eye, 'plain')]))));
    P = P.concat(limbs(CH.sho, [0.24, 1.6, 0],
      [ic(0.055 * w, [0.24, 1.6, 0], B, T), sgB([0.245, 1.6, 0], [0.26, 1.28, -0.01], 0.075 * w, B, T)],
      CH.elb, [0.26, 1.28, -0.01],
      [sgB([0.26, 1.28, -0.01], [0.27, 1.0, 0.06], 0.065 * w, B, T), sgB([0.27, 0.99, 0.065], [0.275, 0.84, 0.1], 0.1 * w, B, T, 0.05 * w)],
      1, 1, arm));
    return { p: P, arm: arm, leg: leg, head: head };
  }

  // 哥布林：约 1.15 米，矮壮、大脑袋、大尖耳朵、长胳膊大手
  function gob(o) {
    o = o || {};
    var G = o.skin || 0x41c43a, G2 = o.dark || 0x2c9a2a, CL = o.cloth || 0x3d2b1d, w = o.w || 1, T = 'en_gob';
    var P = [], arm = {}, leg = {};
    P = P.concat(limbs(CH.hip, [0.1 * w, 0.41, 0],
      [cy(0.075, 0.062, 0.2, [0.1 * w, 0.31, 0.01], G, T, 5)],
      CH.knee, [0.11 * w, 0.21, 0.02],
      [cy(0.062, 0.05, 0.16, [0.11 * w, 0.12, 0.025], G, T, 5), bx([0.14, 0.07, 0.22], [0.11 * w, 0.035, 0.07], G2, T)],
      1, 1, leg));
    if (!o.noHip) P.push(cy(0.2 * w, 0.24 * w, 0.15, [0, 0.43, 0], CL, 'cloth', 7));
    P.push(bx([0.16 * w, 0.2, 0.03], [0, 0.32, 0.2 * w + 0.03], CL, 'cloth', [-0.12, 0, 0]));
    if (!o.noBody) {
      P.push(sp(0.23, [0, 0.6, 0.04], G, T, [w, 1, 0.92], [7, 5]));
      P.push(sp(0.2, [0, 0.74, -0.01], G, T, [1.2 * w, 0.72, 0.85], [7, 5]));
    }
    var head = jt(CH.head, [0, 0.83, 0.04]);
    var hc = [0, 0.99, 0.08], hr = [0.1995, 0.1805, 0.19];
    P = P.concat(on(head, [
      sp(0.19, hc, G, T, [1.05, 0.95, 1], o.headSeg || null),
      cn(0.05, 0.17, [0, 0.95, 0.31], G2, T, 4, [1.75, 0, 0]),
      bx([0.13, 0.025, 0.02], [0, 0.885, fz(hc, hr, 0.06, 0.885) + 0.005], 0x2a0e0a, 'plain')
    ]));
    P = P.concat(on(head, sym([cn(0.075, 0.36, [0.34, 1.065, 0.03], G, T, 4, [0, 0.25, -1.2], [1, 1, 0.45])])));
    if (!o.noFace) {
      P = P.concat(on(head, sym([
        bx([0.075, 0.06, 0.03], [0.075, 1.0, fz(hc, hr, 0.075, 1.0) - 0.003], o.eyeWhite || 0xfff3b0, 'plain'),
        bx([0.035, 0.045, 0.02], [0.068, 0.995, fz(hc, hr, 0.075, 1.0) + 0.014], 0x111111, 'plain'),
        bx([0.1, 0.03, 0.04], [0.078, 1.048, fz(hc, hr, 0.078, 1.048) + 0.001], G2, T, [0, 0, 0.35])
      ])));
    }
    P = P.concat(limbs(CH.sho, [0.24 * w, 0.77, 0],
      [sgC([0.24 * w, 0.78, 0], [0.28 * w, 0.57, 0.04], 0.06, 0.05, G, T)],
      CH.elb, [0.28 * w, 0.57, 0.04],
      [sgC([0.28 * w, 0.57, 0.04], [0.29 * w, 0.4, 0.12], 0.05, 0.045, G, T), ic(0.075, [0.295 * w, 0.35, 0.15], G2, T, [1, 1.15, 1])],
      1, 1, arm));
    return { p: P, arm: arm, leg: leg, head: head, hc: hc, hr: hr };
  }

  // 人形（木乃伊、僵尸、法老的身体）：约 1.85 米；fwd = 1 时双臂向前平举
  function human(o) {
    var w = o.w || 1, P = [], arm = {}, leg = {}, hx = 0.11 * w;
    P = P.concat(limbs(CH.hip, [hx, 0.95, 0],
      [sgC([hx, 0.95, 0], [hx, 0.52, 0.02], 0.09 * w, 0.072 * w, o.legC, o.legT, 6)],
      CH.knee, [hx, 0.51, 0.02],
      [sgC([hx, 0.51, 0.02], [hx, 0.08, -0.01], 0.07 * w, 0.055 * w, o.shinC || o.legC, o.shinT || o.legT, 6), bx([0.13 * w, 0.08, 0.27], [hx, 0.04, 0.05], o.footC, o.footT)],
      o.legS, o.legS, leg));
    P.push(cy(0.17 * w, 0.19 * w, 0.24, [0, 0.98, 0], o.hipC || o.legC, o.hipT || o.legT, 7, null, [1, 1, 0.72]));
    P.push(cy(0.25 * w, 0.18 * w, 0.52, [0, 1.3, 0], o.bodyC, o.bodyT, 7, null, [1, 1, 0.68]));
    var f = o.fwd || 0, sx = 0.27 * w;
    var sho = [sx, 1.49, 0], elb = [sx + 0.02 * w, lerp(1.17, 1.44, f), lerp(-0.02, 0.3, f)], wri = [sx + 0.025 * w, lerp(0.9, 1.4, f), lerp(0.04, 0.6, f)];
    var hand = [wri[0] + 0.005, wri[1] + (wri[1] - elb[1]) * 0.25, wri[2] + (wri[2] - elb[2]) * 0.25];
    var as = o.armS == null ? (f > 0.5 ? 0.3 : 1) : o.armS;
    P = P.concat(limbs(CH.sho, sho,
      [ic(0.08 * w, [sx - 0.01, 1.47, 0], o.armC, o.armT, [1.1, 0.9, 1]), sgC(sho, elb, 0.065 * w, 0.055 * w, o.armC, o.armT, 6)],
      CH.elb, elb,
      [sgC(elb, wri, 0.055 * w, 0.045 * w, o.foreC || o.armC, o.foreT || o.armT, 6), ic(0.075 * w * (o.fist || 1), hand, o.handC || o.foreC || o.armC, o.handT || o.foreT || o.armT, [0.9, 1.2, 0.85])],
      as, as, arm));
    var head = jt(CH.head, [0, 1.56, 0]);
    P = P.concat(on(head, [cy(0.06 * w, 0.07 * w, 0.14, [0, 1.6, 0], o.neckC || o.headC, o.neckT || o.headT, 5)]));
    return { p: P, arm: arm, leg: leg, head: head, hand: hand };
  }

  // 石像：大块石头拼的身体、发光的眼睛、巨大的拳头（blocky = 方块砂岩）
  function golem(o) {
    var C = o.c, C2 = o.c2 || o.c, T = o.blocky ? 'brick' : 'en_rock';
    var ch = function (r, p, c, sc, rt) { return o.blocky ? ['box', [r * 1.5, r * 1.5, r * 1.5], p, c, rt || null, sc || null, T] : ['dodec', [r], p, c, rt || null, sc || null, T]; };
    var P = [], arm = {}, leg = {};
    P = P.concat(limbs(CH.hip, [0.22, 0.6, 0],
      [ch(0.17, [0.23, 0.47, 0], C2)], CH.knee, [0.24, 0.32, 0.02],
      [ch(0.15, [0.24, 0.2, 0.03], C2, [1, 1.1, 1]), bx([0.28, 0.1, 0.36], [0.24, 0.05, 0.06], C2, T)], 1, 1, leg));
    P.push(ch(0.26, [0, 0.66, 0], C2, [1.3, 0.7, 1]));
    P.push(ch(0.48, [0, 1.04, 0], C, [1.15, 0.92, 0.85], o.blocky ? null : [0.2, 0, 0]));
    var head = jt(CH.head, [0, 1.38, 0.1]);
    P = P.concat(on(head, [ch(0.2, [0, 1.5, 0.16], C, [1.1, 0.9, 1])]));
    P = P.concat(on(head, lit(2.6, sym([bx([0.08, 0.05, 0.05], [0.08, 1.52, o.blocky ? 0.33 : 0.34], o.eye, 'plain')]))));
    P = P.concat(limbs(CH.sho, [0.5, 1.25, 0],
      [ch(0.24, [0.55, 1.22, 0], C, [1, 0.9, 1])], CH.elb, [0.62, 0.92, 0.05],
      [ch(0.17, [0.64, 0.74, 0.08], C2), ch(0.26, [0.66, 0.46, 0.14], C, [1, 1.05, 1])], 1, 1, arm));
    return { p: P, arm: arm, leg: leg, head: head };
  }

  // 蝎子：分节的身体、两节摆动的尾巴、发光毒针、钳子、八条腿（两组交替）
  function scorp(o) {
    var C = o.c, C2 = o.c2, T = 'en_chitin', P = [], arm = {}, k;
    P.push(ic(0.3, [0, 0.36, 0.22], C, T, [1.05, 0.55, 1.15]));
    P.push(ic(0.28, [0, 0.37, -0.12], C2, T, [1, 0.5, 0.75]));
    P.push(ic(0.24, [0, 0.39, -0.4], C, T, [0.95, 0.5, 0.7]));
    P.push(ic(0.2, [0, 0.41, -0.62], C2, T, [0.9, 0.5, 0.7]));
    var t1 = jt(CH.tail, [0, 0.42, -0.72], 1), t2 = jt(CH.tail, [0, 1.0, -0.98], 1.3, t1);
    var tp = [[0, 0.42, -0.72], [0, 0.72, -0.95], [0, 1.02, -0.98], [0, 1.28, -0.85], [0, 1.44, -0.62], [0, 1.48, -0.42]];
    var tw = o.tailW || 1;
    for (k = 0; k < 5; k++) P.push(on(k < 2 ? t1 : t2, [sgB(tp[k], tp[k + 1], (0.19 - k * 0.022) * tw, k % 2 ? C2 : C, T, (0.16 - k * 0.018) * tw)])[0]);
    P = P.concat(on(t2, [ic(0.1, [0, 1.44, -0.34], C2, T, [1, 0.9, 1.2])]));
    P = P.concat(on(t2, lit(2.2, [cn(0.05, 0.24, [0, 1.36, -0.22], o.sting || 0x7aff3a, 'plain', 4, [2.3, 0, 0])])));
    P = P.concat(limbs(CH.sho, [0.22, 0.38, 0.4],
      [sgB([0.22, 0.38, 0.4], [0.36, 0.43, 0.7], 0.1, C2, T)], CH.elb, [0.36, 0.43, 0.7],
      [bx([0.18, 0.14, 0.28], [0.4, 0.44, 0.86], C, T), bx([0.07, 0.07, 0.22], [0.35, 0.43, 1.05], C2, T, [0, 0.3, 0]), bx([0.07, 0.07, 0.2], [0.45, 0.43, 1.04], C2, T, [0, -0.3, 0])],
      0.5, 0.6, arm));
    for (k = 0; k < 4; k++) {
      for (var side = 0; side < 2; side++) {
        var f = side ? -1 : 1, z = 0.26 - k * 0.2, j = jt(CH.leg + ((k + side) % 2), [0.22 * f, 0.36, z], 1);
        var knee = [0.5 * f, 0.52, z + 0.06 - k * 0.05], foot = [0.64 * f, 0.0, z + 0.1 - k * 0.12];
        P.push(on(j, [sgB([0.22 * f, 0.36, z], knee, 0.065, C2, T)])[0]);
        P.push(on(j, [sgB(knee, foot, 0.05, C, T)])[0]);
      }
    }
    P = P.concat(lit(2.4, sym([bx([0.045, 0.035, 0.03], [0.07, 0.53, 0.42], o.eye || 0xff3020, 'plain')])));
    return { p: P, arm: arm, t2: t2 };
  }

  // 床单幽灵：圆顶 + 下摆飘动的碎布，黑眼睛黑嘴，小短手
  function ghostP(o) {
    var W = o.c, T = 'en_sheet', P = [], n = o.tatters || 6, i;
    var hc = [0, 0.16, 0], hr = [0.42, 0.454, 0.42];
    P.push(sp(0.42, hc, W, T, [1, 1.08, 1], o.cheap ? [8, 6] : [10, 7]));
    P.push(cy(0.405, 0.56, 0.78, [0, -0.23, 0], W, T, o.cheap ? 8 : 10));
    var sway = jt(CH.sway, [0, -0.5, 0], 1);
    for (i = 0; i < n; i++) { var a = i / n * TAU + 0.3; P.push(on(sway, [cn(0.15, 0.34, [Math.sin(a) * 0.45, -0.74, Math.cos(a) * 0.45], W, T, 4, [Math.PI, 0, 0])])[0]); }
    if (!o.cheap) P = P.concat(limbs(CH.tail, [0.36, 0.02, 0.02], [sp(0.12, [0.47, -0.04, 0.06], W, T, [0.8, 1.2, 0.8], [6, 4])], 0, null, null, 1.5));
    lit(o.glow || 1, P);
    var ez = fz(hc, hr, 0.14, 0.24);
    P = P.concat(sym([sp(0.075, [0.14, 0.24, ez - 0.015], o.eyeC || 0x14141c, 'plain', [0.75, 1.3, 0.45], [6, 4], o.angry ? [0, 0, 0.5] : null)]));
    if (o.eyeC) lit(2.4, P.slice(-2));
    P.push(sp(o.mouthW || 0.07, [0, 0.03, fz(hc, hr, 0, 0.03) - 0.015], 0x14141c, 'plain', [1.1, o.mouthH || 0.8, 0.45], [6, 4]));
    return { p: P };
  }

  // 猪头（猪王、幽灵猪王共用）：中心在原点
  function pigHead(o) {
    var S = o.c, S2 = o.c2, T = o.t || 'skin', P = [], hc = [0, 0, 0], hr = [0.6, 0.53, 0.57];
    P.push(sp(0.6, hc, S, T, [1, 0.88, 0.95]));
    P.push(cy(0.26, 0.29, 0.3, [0, -0.1, 0.62], S2, T, 8, [Math.PI / 2, 0, 0]));
    P = P.concat(sym([
      bx([0.07, 0.1, 0.03], [0.09, -0.1, 0.78], 0x3a1a1e, 'plain'),
      cn(0.18, 0.36, [0.46, 0.42, -0.05], S, T, 4, [0.3, 0, -0.6], [1, 1, 0.4]),
      bx([0.1, 0.1, 0.04], [0.22, 0.14, fz(hc, hr, 0.22, 0.14)], o.eye || 0x111111, 'plain'),
      bx([0.22, 0.05, 0.06], [0.22, 0.25, fz(hc, hr, 0.22, 0.25) + 0.01], S2, T, [0, 0, 0.3]),
      cn(0.05, 0.22, [0.25, -0.3, fz(hc, hr, 0.25, -0.3) - 0.04], 0xfff4e0, 'bone', 4, [0.2, 0, -0.2])
    ]));
    // 王冠
    P.push(cy(0.34, 0.3, 0.2, [0, 0.56, -0.04], 0xffc928, 'gold', 8));
    for (var i = 0; i < 4; i++) { var a = i / 4 * TAU + 0.4; P.push(cn(0.08, 0.2, [Math.sin(a) * 0.3, 0.75, Math.cos(a) * 0.3 - 0.04], 0xffd23a, 'gold', 4)); }
    P = P.concat(lit(1.8, [oc(0.06, [0, 0.56, 0.3], 0xff2a4a, 'plain')]));
    return P;
  }

  // 精英/小 Boss 头顶的金冠
  CROWN_PARTS = [
    ['cyl', [0.21, 0.19, 0.13, 8], [0, 0, 0], 0xffc928, null, null, 'gold'],
    ['sphere', [0.17, 8, 5], [0, 0.04, 0], 0xb0182e, null, [1, 0.6, 1], 'cloth']
  ].concat([0, 1, 2, 3, 4].map(function (i) { var a = i / 5 * TAU; return ['cone', [0.065, 0.18, 4], [Math.sin(a) * 0.19, 0.15, Math.cos(a) * 0.19], 0xffd84a, null, null, 'gold']; }))
    .concat([0, 1, 2, 3, 4].map(function (i) { var a = i / 5 * TAU; return ['ball', [0.032, 0], [Math.sin(a) * 0.19, 0.25, Math.cos(a) * 0.19], 0xfff2a0, null, null, 'plain']; }))
    .concat([['oct', [0.045], [0, 0.0, 0.205], 0xff2a4a, null, null, 'plain'], ['oct', [0.04], [0.2, 0.0, 0], 0x3aa0ff, null, null, 'plain'], ['oct', [0.04], [-0.2, 0.0, 0], 0x3aa0ff, null, null, 'plain']]);

  (function () {
    var a, b, c, P;
    // ---- 森林 ----
    ENEMY_MODELS.goblin = fin(gob().p, 1, { hip: 0.41, lean: 0.22, bob: 0.04, roll: 0.06 });
    // 壮哥布林：更高更壮，右手一根带刺的木棒，斜挎皮带
    a = gob({ skin: 0x37b531, dark: 0x258a22, cloth: 0x5a3a22, w: 1.08 });
    P = a.p.concat(on(a.arm.R.b, [
      sgC([-0.31, 0.33, 0.16], [-0.34, 0.6, 0.5], 0.03, 0.04, 0x8a5a2e, 'wood'),
      ic(0.13, [-0.345, 0.66, 0.58], 0x7a4a24, 'bark', [0.85, 1.4, 0.85], [0.9, 0, 0]),
      cn(0.03, 0.1, [-0.44, 0.68, 0.6], 0xe0d8c8, 'bone', 3, [0, 0, 1.4]),
      cn(0.03, 0.1, [-0.25, 0.7, 0.62], 0xe0d8c8, 'bone', 3, [0, 0, -1.4])
    ])).concat([bx([0.06, 0.5, 0.03], [0, 0.66, 0.2], 0x5a3a22, 'cloth', [0.15, 0, 0.75])]);
    ENEMY_MODELS.goblin2 = fin(P, 1.2, { hip: 0.41, lean: 0.2, bob: 0.04, roll: 0.06 });
    // 哥布林重甲兵：铁桶胸甲、角盔、肩甲、圆盾、红眼
    a = gob({ skin: 0x3c9e34, dark: 0x2a7a24, cloth: 0x4a3426, w: 1.35, noBody: true, noFace: true, noHip: true, headSeg: [7, 5] });
    P = a.p.concat([
      cy(0.31, 0.27, 0.42, [0, 0.66, 0.02], 0x7d8590, 'metal', 8, null, [1, 1, 0.82]),
      cy(0.29, 0.3, 0.06, [0, 0.47, 0.02], 0x5a4030, 'cloth', 8, null, [1, 1, 0.82])
    ]).concat(on(a.head, [
      cy(0.19, 0.215, 0.16, [0, 1.11, 0.07], 0x737a84, 'metal', 7),
      cy(0.235, 0.235, 0.03, [0, 1.04, 0.07], 0x5d636c, 'metal', 7),
      bx([0.045, 0.13, 0.05], [0, 0.98, fz([0, 0.99, 0.08], [0.1995, 0.1805, 0.19], 0, 0.98) + 0.01], 0x5d636c, 'metal')
    ])).concat(on(a.head, sym([cn(0.05, 0.24, [0.25, 1.2, 0.07], 0xe8dcc0, 'bone', 4, [0, 0, -0.85])])))
      .concat(on(a.head, lit(2.4, sym([bx([0.06, 0.03, 0.02], [0.075, 0.99, fz(a.hc, a.hr, 0.075, 0.99) + 0.004], 0xff3a2a, 'plain')]))))
      .concat(pair(a.arm.L.a, a.arm.R.a, [sp(0.15, [0.34, 0.8, 0], 0x6d747e, 'metal', [1.1, 0.75, 1.05], [5, 3])]))
      .concat(on(a.arm.L.b, [cy(0.3, 0.3, 0.05, [0.48, 0.48, 0.14], 0x7a5030, 'wood', 8, [0, 0, Math.PI / 2]), cy(0.08, 0.1, 0.06, [0.52, 0.48, 0.14], 0x8a909a, 'metal', 6, [0, 0, -Math.PI / 2])]));
    ENEMY_MODELS.goblintank = fin(P, 1.4, { hip: 0.41, lean: 0.12, bob: 0.02, roll: 0.09 });
    // 史莱姆：亮绿色的果冻，有高光，有一张小脸
    b = [0, 0.4, 0]; c = [0.55, 0.418, 0.55];
    P = [sp(0.55, b, 0x55d34a, 'slime', [1, 0.76, 1], [12, 8])];
    for (var i = 0; i < 4; i++) { var ang = i / 4 * TAU + 0.6; P.push(sp(0.14, [Math.sin(ang) * 0.48, 0.07, Math.cos(ang) * 0.48], 0x49c03e, 'slime', [1, 0.55, 1], [6, 3])); }
    P = P.concat(lit(1.6, [sp(0.14, [-0.2, 0.69, 0.24], 0xffffff, 'plain', [1.3, 0.5, 0.9], [6, 4]), sp(0.05, [-0.36, 0.56, 0.36], 0xffffff, 'plain', null, [5, 3])]));
    P = P.concat(sym([sp(0.07, [0.15, 0.48, fz(b, c, 0.15, 0.48) - 0.01], 0x101418, 'plain', [0.85, 1.25, 0.5], [6, 4])]));
    P = P.concat(lit(1.5, sym([sp(0.024, [0.13, 0.52, fz(b, c, 0.13, 0.52) + 0.02], 0xffffff, 'plain', null, [4, 3])])));
    P.push(sp(0.06, [0, 0.34, fz(b, c, 0, 0.34) - 0.01], 0x1f4a1a, 'plain', [1.3, 0.6, 0.4], [6, 4]));
    ENEMY_MODELS.slime = fin(P, 1, { hip: 0.2, lean: 0, roll: 0 });
    // 大黄蜂：毛茸茸的黄色胸、黑黄条纹的肚子往后下垂、深色的头和大黑眼睛、透明翅膀（一直扇）
    b = [0, 0.0, 0.3]; c = [0.15, 0.143, 0.14];
    P = [
      sp(0.25, [0, 0.06, 0.04], 0xffc21e, 'fur', null, [8, 6]),
      sp(0.3, [0, -0.1, -0.33], 0xffc21e, 'en_stripe', [0.85, 1.35, 0.85], [8, 6], [1.07, 0, 0]),
      cn(0.07, 0.22, [0, -0.32, -0.7], 0x1a1a1a, 'plain', 4, [-2.07, 0, 0]),
      sp(0.15, b, 0x3a2810, 'fur', [1, 0.95, 0.9], [7, 5]),
      sp(0.07, [0, -0.03, fz(b, c, 0, -0.03) - 0.03], 0xffd84a, 'fur', [1, 0.8, 0.5], [5, 3])
    ].concat(sym([
      sp(0.08, [0.085, 0.03, fz(b, c, 0.085, 0.03) - 0.045], 0x0a0a14, 'plain', [0.75, 1.15, 0.75], [6, 4]),
      sgB([0.05, 0.12, 0.38], [0.12, 0.32, 0.5], 0.022, 0x1a1a1a, 'plain'),
      sgB([0.12, -0.1, 0.16], [0.18, -0.36, 0.14], 0.035, 0x1a1a1a, 'plain'),
      sgB([0.14, -0.1, 0.02], [0.22, -0.36, -0.06], 0.035, 0x1a1a1a, 'plain'),
      sgB([0.12, -0.12, -0.12], [0.18, -0.38, -0.24], 0.035, 0x1a1a1a, 'plain')
    ])).concat(lit(1.8, sym([sp(0.022, [0.1, 0.07, fz(b, c, 0.1, 0.07) + 0.012], 0xffffff, 'plain', null, [4, 3])])))
      .concat(limbs(CH.wing, [0.1, 0.24, 0.04], lit(1.3, [
        sp(0.3, [0.36, 0.36, -0.02], 0xdff0ff, 'plain', [1, 0.06, 0.45], [6, 4], [0, 0.35, 0.35]),
        sp(0.2, [0.3, 0.3, -0.24], 0xcfe4ff, 'plain', [1, 0.06, 0.45], [6, 4], [0, 0.8, 0.3])
      ]), 0, null, null, 1));
    ENEMY_MODELS.bee = fin(P, 1, { hover: 0.15, flap: 46 });
    // 爆炸桶怪：红漆木桶、铁箍、冒火星的引线、发光的怒眼、小短腿小短手
    P = [
      cy(0.37, 0.45, 0.38, [0, 0.93, 0], 0xb8452a, 'wood', 10),
      cy(0.45, 0.37, 0.38, [0, 0.55, 0], 0xb8452a, 'wood', 10),
      cy(0.465, 0.465, 0.06, [0, 0.74, 0], 0x3a3236, 'metal', 8),
      cy(0.39, 0.39, 0.05, [0, 1.08, 0], 0x3a3236, 'metal', 8),
      cy(0.39, 0.39, 0.05, [0, 0.39, 0], 0x3a3236, 'metal', 8),
      cy(0.34, 0.36, 0.04, [0, 1.13, 0], 0x6a4026, 'wood', 8),
      sgC([0, 1.14, 0], [0.06, 1.34, -0.04], 0.025, 0.02, 0x2a2a2a, 'plain', 4),
      bx([0.28, 0.07, 0.04], [0, 0.62, 0.42], 0x1a0805, 'plain')
    ].concat(lit(2.7, [oc(0.06, [0.07, 1.38, -0.05], 0xffe070, 'plain')]))
      .concat(lit(1.9, [oc(0.11, [0.07, 1.41, -0.05], 0xff6a1a, 'plain', [1, 1.4, 1])]))
      .concat(lit(2.2, sym([bx([0.13, 0.05, 0.04], [0.13, 0.86, 0.395], 0xffb020, 'plain', [0, 0, 0.35])])))
      .concat(limbs(CH.hip, [0.17, 0.36, 0], [cy(0.07, 0.06, 0.16, [0.17, 0.28, 0], 0x4a3a2a, 'cloth', 5)], CH.knee, [0.17, 0.2, 0.01],
        [cy(0.06, 0.05, 0.13, [0.17, 0.13, 0.01], 0x4a3a2a, 'cloth', 5), bx([0.15, 0.08, 0.22], [0.17, 0.04, 0.05], 0x2a1e18, 'cloth')]))
      .concat(limbs(CH.sho, [0.44, 0.8, 0], [sgC([0.44, 0.8, 0], [0.56, 0.62, 0.06], 0.045, 0.04, 0x4a3a2a, 'cloth')], CH.elb, [0.56, 0.62, 0.06],
        [ic(0.075, [0.58, 0.56, 0.1], 0xe0b080, 'skin')]));
    ENEMY_MODELS.boomer = fin(P, 1, { hip: 0.36, lean: 0.04, bob: 0.06, roll: 0.14 });
    // 小石像：岩石身体、青色发光眼、大石拳、背上长苔藓
    a = golem({ c: 0x8d8b84, c2: 0x77756f, eye: 0x5affd9 });
    P = a.p.concat([ic(0.22, [0.08, 1.4, -0.12], 0x4a7a2a, 'leaf', [1.5, 0.45, 1.2]), ic(0.14, [-0.5, 1.42, -0.02], 0x4a7a2a, 'leaf', [1.3, 0.4, 1.1])]);
    ENEMY_MODELS.golem = fin(P, 1, { hip: 0.6, lean: 0.06, roll: 0.09 });
    // 食尸鬼：弓着背、肋骨外露、长手臂拖到膝盖、红眼、利爪
    b = [0, 1.17, 0.42]; c = [0.133, 0.14, 0.154];
    a = {};
    P = limbs(CH.hip, [0.12, 0.74, -0.05], [sgC([0.12, 0.74, -0.05], [0.13, 0.42, 0.1], 0.08, 0.065, 0x4a3a2e, 'cloth')], CH.knee, [0.13, 0.42, 0.1],
      [sgC([0.13, 0.42, 0.1], [0.13, 0.07, -0.02], 0.055, 0.045, 0x9aa682, 'en_gob'), bx([0.11, 0.06, 0.24], [0.13, 0.03, 0.06], 0x6c7656, 'en_gob')]).concat([
      bx([0.32, 0.2, 0.22], [0, 0.76, -0.04], 0x4a3a2e, 'cloth'),
      sp(0.21, [0, 0.98, 0.1], 0x9aa682, 'en_ribs', [1.1, 1.25, 0.8], [7, 6], [0.8, 0, 0]),
      ic(0.05, [0, 1.12, -0.04], 0x7a8462, 'en_gob'), ic(0.05, [0, 1.0, -0.12], 0x7a8462, 'en_gob'), ic(0.045, [0, 0.87, -0.15], 0x7a8462, 'en_gob')
    ]).concat(on(jt(CH.head, [0, 1.12, 0.3]), [
      sp(0.14, b, 0x9aa682, 'en_gob', [0.95, 1, 1.1], [7, 5]),
      bx([0.15, 0.05, 0.14], [0, 1.06, 0.46], 0x6c7656, 'en_gob'),
      bx([0.13, 0.025, 0.02], [0, 1.09, 0.535], 0xeee6c8, 'plain')
    ].concat(sym([cn(0.04, 0.16, [0.16, 1.22, 0.38], 0x9aa682, 'en_gob', 4, [0, 0, -1.1])]))
     .concat(lit(2.6, sym([bx([0.05, 0.03, 0.02], [0.052, 1.2, fz(b, c, 0.052, 1.2) + 0.002], 0xff3020, 'plain')])))))
      .concat(limbs(CH.sho, [0.22, 1.1, 0.22], [sgC([0.22, 1.1, 0.22], [0.27, 0.8, 0.38], 0.055, 0.045, 0x9aa682, 'en_gob')], CH.elb, [0.27, 0.8, 0.38],
        [sgC([0.27, 0.8, 0.38], [0.28, 0.5, 0.48], 0.045, 0.04, 0x9aa682, 'en_gob'), bx([0.1, 0.12, 0.06], [0.28, 0.44, 0.5], 0x6c7656, 'en_gob'),
         cn(0.02, 0.1, [0.25, 0.35, 0.53], 0xeee6c8, 'plain', 3, [Math.PI - 0.3, 0, 0]), cn(0.02, 0.1, [0.31, 0.35, 0.53], 0xeee6c8, 'plain', 3, [Math.PI - 0.3, 0, 0])], 1, 1, a));
    ENEMY_MODELS.ghoul = fin(P, 1, { hip: 0.74, lean: 0.12, bob: 0.03, roll: 0.06 });
    // 骷髅
    ENEMY_MODELS.skeleton = fin(skel().p, 1, { hip: 0.98, lean: 0.1, roll: 0.05 });
    // 重甲骷髅：铁胸甲、宽檐铁盔、肩甲、木圆盾、铁剑
    a = skel({ noRibs: true });
    P = a.p.concat([
      cy(0.22, 0.17, 0.44, [0, 1.41, 0], 0x8a909a, 'metal', 8, null, [1, 1, 0.75]),
      cy(0.19, 0.22, 0.2, [0, 1.06, 0], 0x6a6f78, 'metal', 8, null, [1, 1, 0.8])
    ]).concat(on(a.head, [
      cy(0.15, 0.155, 0.14, [0, 1.9, -0.01], 0x7a808a, 'metal', 7),
      cy(0.27, 0.27, 0.025, [0, 1.84, -0.01], 0x666b74, 'metal', 7),
      cn(0.04, 0.1, [0, 2.01, -0.01], 0x666b74, 'metal', 4)
    ])).concat(pair(a.arm.L.a, a.arm.R.a, [sp(0.12, [0.27, 1.6, 0], 0x7a808a, 'metal', [1.15, 0.7, 1.1], [5, 3])]))
      .concat(on(a.arm.L.b, [cy(0.27, 0.27, 0.05, [0.34, 1.1, 0.12], 0x7a5030, 'wood', 8, [0, 0, Math.PI / 2]), cy(0.07, 0.09, 0.05, [0.38, 1.1, 0.12], 0x8a909a, 'metal', 6, [0, 0, -Math.PI / 2])]))
      .concat(on(a.arm.R.b, [
        sgB([-0.28, 0.9, 0.12], [-0.3, 1.04, 0.86], 0.025, 0xd8dde4, 'metal', 0.075),
        bx([0.2, 0.04, 0.05], [-0.28, 0.88, 0.14], 0x8a6a2a, 'gold', [0.2, 0, 0])
      ]));
    ENEMY_MODELS.skelarmor = fin(P, 1.04, { hip: 0.98, lean: 0.06, roll: 0.06 });

    // ---- 沙漠 ----
    var BD = 0xd8cba2, BD2 = 0xb8a880;
    b = [0, 1.73, 0.02]; c = [0.1235, 0.1456, 0.13];
    a = human({ legC: BD, legT: 'en_band', footC: BD2, footT: 'en_band', bodyC: BD, bodyT: 'en_band', armC: BD, armT: 'en_band', headC: BD, headT: 'en_band', fwd: 1 });
    P = a.p.concat(on(a.head, [
      sp(0.13, b, BD, 'en_band', [0.95, 1.12, 1]),
      bx([0.21, 0.035, 0.05], [0, 1.75, fz(b, c, 0, 1.75) - 0.012], 0x2a1e12, 'plain')
    ].concat(lit(2.6, [bx([0.036, 0.024, 0.02], [0.045, 1.75, fz(b, c, 0.045, 1.75) + 0.008], 0xffe040, 'plain')]))))
      .concat(on(a.arm.R.b, [bx([0.05, 0.34, 0.012], [-0.3, 1.22, 0.42], BD2, 'en_band', [0.1, 0, 0.15])]));
    ENEMY_MODELS.mummy = fin(P, 1.02, { hip: 0.95, lean: 0.06, roll: 0.08 });
    // 木乃伊壮汉：又宽又高、驼背、拳头大、皮腰带
    b = [0, 1.71, 0.08]; c = [0.143, 0.15, 0.15];
    a = human({ w: 1.45, legC: 0xc4b48a, legT: 'en_band', footC: 0xa49468, footT: 'en_band', bodyC: 0xc4b48a, bodyT: 'en_band', armC: 0xc4b48a, armT: 'en_band', headC: 0xc4b48a, headT: 'en_band', fwd: 0.4, armS: 0.8, fist: 1.6 });
    P = a.p.concat([cy(0.27, 0.27, 0.1, [0, 1.06, 0], 0x5a3a22, 'cloth', 8, null, [1, 1, 0.72])])
      .concat(on(a.head, [sp(0.15, b, 0xc4b48a, 'en_band', [0.95, 1, 1]), bx([0.24, 0.04, 0.05], [0, 1.73, fz(b, c, 0, 1.73) - 0.012], 0x2a1e12, 'plain')]
        .concat(lit(2.6, sym([bx([0.04, 0.026, 0.02], [0.05, 1.73, fz(b, c, 0.05, 1.73) + 0.008], 0xffb020, 'plain')])))));
    ENEMY_MODELS.mummytank = fin(P, 1.25, { hip: 0.95, lean: 0.12, roll: 0.1 });
    // 远古木乃伊：金面具、蓝金条纹头巾、金项圈、青色发光眼
    b = [0, 1.72, 0.03]; c = [0.13, 0.15, 0.13];
    a = human({ w: 1.2, legC: 0xcfc092, legT: 'en_band', footC: 0xb0a070, footT: 'en_band', bodyC: 0xcfc092, bodyT: 'en_band', armC: 0xcfc092, armT: 'en_band', headC: 0xcfc092, headT: 'en_band', fwd: 1 });
    P = a.p.concat([cy(0.33, 0.33, 0.08, [0, 1.53, 0], 0xe8b830, 'gold', 10, null, [1, 1, 0.75]), cy(0.2, 0.2, 0.1, [0, 1.06, 0], 0xe8b830, 'gold', 8, null, [1, 1, 0.75])])
      .concat(on(a.head, [
        sp(0.13, b, 0xf0c838, 'gold', [1, 1.15, 1]),
        bx([0.36, 0.22, 0.3], [0, 1.82, -0.04], 0x3a5ad9, 'en_stripe'),
        bx([0.1, 0.3, 0.08], [0.15, 1.55, 0.06], 0x3a5ad9, 'en_stripe'), bx([0.1, 0.3, 0.08], [-0.15, 1.55, 0.06], 0x3a5ad9, 'en_stripe'),
        cy(0.035, 0.03, 0.14, [0, 1.6, fz(b, c, 0, 1.62) - 0.02], 0x3a5ad9, 'en_stripe', 5)
      ].concat(lit(2.8, sym([bx([0.04, 0.025, 0.02], [0.045, 1.74, fz(b, c, 0.045, 1.74) + 0.01], 0x5affe0, 'plain')])))));
    ENEMY_MODELS.ancient = fin(P, 1.3, { hip: 0.95, lean: 0.05, roll: 0.07 });
    // 沙尘骷髅：沙色骨头、红头巾和腰带、弯刀
    a = skel({ bone: 0xdcc596 });
    P = a.p.concat([bx([0.37, 0.07, 0.2], [0, 1.07, 0], 0xc8402e, 'cloth')])
      .concat(on(a.head, [cy(0.145, 0.15, 0.09, [0, 1.89, -0.01], 0xc8402e, 'cloth', 8), sgB([0.02, 1.86, -0.14], [-0.06, 1.6, -0.24], 0.07, 0xb03424, 'cloth', 0.015)]))
      .concat(on(a.arm.R.b, [
        sgB([-0.28, 0.9, 0.12], [-0.3, 1.05, 0.5], 0.022, 0xd8dde4, 'metal', 0.08),
        sgB([-0.3, 1.05, 0.5], [-0.31, 1.0, 0.8], 0.022, 0xd8dde4, 'metal', 0.07),
        bx([0.16, 0.035, 0.04], [-0.28, 0.88, 0.13], 0x8a6a2a, 'gold')
      ]));
    ENEMY_MODELS.dustyskel = fin(P, 1, { hip: 0.98, lean: 0.12, roll: 0.05 });
    // 沙尘重甲骷髅：青铜胸甲、尖顶盔、青铜圆盾、长矛
    a = skel({ bone: 0xd4b888, noRibs: true });
    P = a.p.concat([cy(0.22, 0.17, 0.44, [0, 1.41, 0], 0xb07a3a, 'metal', 8, null, [1, 1, 0.75]), cy(0.2, 0.23, 0.22, [0, 1.05, 0], 0x8a5a2a, 'cloth', 8, null, [1, 1, 0.8])])
      .concat(on(a.head, [cn(0.17, 0.3, [0, 2.0, -0.01], 0xb07a3a, 'metal', 6), cy(0.2, 0.2, 0.03, [0, 1.87, -0.01], 0x8a5a2a, 'metal', 8)]))
      .concat(on(a.arm.L.b, [cy(0.26, 0.26, 0.05, [0.34, 1.1, 0.12], 0xc08a3a, 'gold', 10, [0, 0, Math.PI / 2])]))
      .concat(on(a.arm.R.b, [sgC([-0.28, 0.4, -0.2], [-0.29, 2.1, 0.5], 0.025, 0.025, 0x7a5030, 'wood', 4), cn(0.05, 0.22, [-0.295, 2.2, 0.54], 0xd8dde4, 'metal', 4, [0.4, 0, 0])]));
    ENEMY_MODELS.dustyarmor = fin(P, 1.03, { hip: 0.98, lean: 0.06, roll: 0.06 });
    // 毒蝎
    ENEMY_MODELS.scorpion = fin(scorp({ c: 0xc0703a, c2: 0x9a5426 }).p, 1, { hip: 0.42, lean: 0, roll: 0.02, flap: 5 });
    // 仙人掌射手：仙人掌身体、两只举起的手臂、粉色小花、怒脸、两条根腿
    var CT = 0x4aa03a, CT2 = 0x3a8a2e;
    P = limbs(CH.hip, [0.15, 0.34, 0], [sgC([0.15, 0.36, 0], [0.17, 0.08, 0.04], 0.13, 0.1, CT2, 'bark', 6), bx([0.2, 0.08, 0.26], [0.17, 0.04, 0.07], 0x6a4a2a, 'bark')], 0, null, null, 1).concat([
      cy(0.34, 0.38, 1.4, [0, 1.0, 0], CT, 'bark', 8),
      sp(0.34, [0, 1.7, 0], CT, 'bark', [1, 0.7, 1], [8, 4])
    ]).concat(on(jt(CH.sho, [0.3, 1.18, 0], 0.35), [
      sgC([0.3, 1.18, 0], [0.62, 1.22, 0], 0.13, 0.12, CT, 'bark', 6), sgC([0.62, 1.12, 0], [0.62, 1.62, 0], 0.12, 0.11, CT, 'bark', 6), sp(0.11, [0.62, 1.62, 0], CT, 'bark', null, [6, 4])
    ])).concat(on(jt(CH.sho + 1, [-0.3, 0.95, 0], 0.35), [
      sgC([-0.3, 0.95, 0], [-0.6, 0.98, 0], 0.12, 0.11, CT, 'bark', 6), sgC([-0.6, 0.9, 0], [-0.6, 1.3, 0], 0.11, 0.1, CT, 'bark', 6), sp(0.1, [-0.6, 1.3, 0], CT, 'bark', null, [6, 4])
    ])).concat(sym([
      bx([0.09, 0.11, 0.04], [0.12, 1.35, 0.31], 0x101010, 'plain'),
      bx([0.13, 0.04, 0.04], [0.12, 1.44, 0.32], CT2, 'bark', [0, 0, 0.35])
    ])).concat(lit(1.6, sym([bx([0.03, 0.03, 0.02], [0.105, 1.38, 0.335], 0xffffff, 'plain')]))).concat([
      bx([0.18, 0.06, 0.04], [0, 1.16, 0.33], 0x2a0e0e, 'plain'),
      sp(0.06, [0, 1.97, 0], 0xffd23a, 'plain', null, [5, 3])
    ]);
    for (i = 0; i < 5; i++) { ang = i / 5 * TAU; P.push(sp(0.08, [Math.sin(ang) * 0.1, 1.94, Math.cos(ang) * 0.1], 0xff5a8a, 'plain', [1, 0.5, 1], [5, 3])); }
    ENEMY_MODELS.cactus = fin(P, 1, { hip: 0.34, lean: 0.03, bob: 0.05, roll: 0.14 });
    // 火灵：一团火（发光），火苗摇曳，白色眼睛
    b = [0, -0.08, 0]; c = [0.32, 0.29, 0.32];
    P = lit(1.7, [ic(0.32, b, 0xff6a1a, 'plain', [1, 0.9, 1], null, 1)])
      .concat(on(jt(CH.tail, [0, 0.15, 0], 1.6), lit(1.9, [cn(0.24, 0.75, [0, 0.42, -0.04], 0xffa62a, 'plain', 6)])))
      .concat(on(jt(CH.sway, [0.12, 0.1, 0], 1.6), lit(1.6, [cn(0.15, 0.5, [0.21, 0.28, -0.04], 0xff4a1a, 'plain', 5, [0, 0, -0.45])])))
      .concat(on(jt(CH.tail, [-0.12, 0.1, 0], 1.4), lit(1.6, [cn(0.15, 0.46, [-0.21, 0.26, -0.02], 0xff4a1a, 'plain', 5, [0, 0, 0.45])])))
      .concat(lit(2.6, sym([bx([0.07, 0.1, 0.03], [0.1, -0.02, fz(b, c, 0.1, -0.02) - 0.005], 0xfff8e0, 'plain')])))
      .concat(sym([bx([0.035, 0.05, 0.02], [0.095, -0.04, fz(b, c, 0.1, -0.02) + 0.014], 0x2a0a00, 'plain')]))
      .concat(lit(2.2, [oc(0.05, [0.36, 0.3, 0.1], 0xffd040, 'plain'), oc(0.04, [-0.32, 0.46, -0.1], 0xffd040, 'plain'), oc(0.045, [0.06, 0.82, 0.12], 0xffe070, 'plain')]));
    ENEMY_MODELS.wisp = fin(P, 1, { hover: 0.2, flap: 9 });
    // 风滚骨：一团枯草里卡着骨头和骷髅头（整体以中心滚动）
    P = [
      ic(0.5, [0, 0, 0], 0xc09a5c, 'bark', null, null, 1),
      ic(0.62, [0, 0, 0], 0x9a7440, 'bark', null, [0.6, 0.3, 0.2]),
      ic(0.6, [0, 0, 0], 0xb08848, 'bark', null, [-0.5, 0.9, 0.4]),
      sgB([-0.72, -0.2, -0.3], [0.7, 0.25, 0.32], 0.035, 0x6a4a28, 'bark'), sgB([0.3, -0.7, -0.4], [-0.25, 0.72, 0.38], 0.035, 0x6a4a28, 'bark'),
      sgB([-0.35, 0.3, -0.7], [0.32, -0.28, 0.72], 0.035, 0x6a4a28, 'bark'),
      sgB([-0.68, 0.1, 0.2], [0.64, -0.15, -0.12], 0.07, 0xefe4c8, 'bone'),
      sgB([0.12, -0.68, 0.22], [-0.16, 0.66, -0.2], 0.07, 0xefe4c8, 'bone'),
      ic(0.07, [-0.7, 0.11, 0.21], 0xefe4c8, 'bone'), ic(0.07, [0.66, -0.16, -0.12], 0xefe4c8, 'bone'),
      ic(0.07, [0.13, -0.7, 0.23], 0xefe4c8, 'bone'), ic(0.07, [-0.17, 0.68, -0.21], 0xefe4c8, 'bone'),
      sp(0.17, [0, 0.22, 0.46], 0xefe4c8, 'bone', [1, 1, 1.1]),
      bx([0.22, 0.17, 0.04], [0, 0.2, 0.635], 0xefe4c8, 'en_skull')
    ];
    ENEMY_MODELS.tumble = fin(P, 1, { rollR: 0.6 });

    // ---- 墓地 ----
    ENEMY_MODELS.ghost = fin(ghostP({ c: 0xeef2ff, glow: 1.15 }).p, 1, { hover: 0.18, flap: 4 });
    // 大幽灵：更大、偏蓝、张大嘴、手上拖着锁链
    a = ghostP({ c: 0xc4d8ff, glow: 1.2, angry: true, mouthW: 0.12, mouthH: 1.2, tatters: 7 });
    P = a.p.concat(on(jt(CH.tail, [0.36, 0.02, 0.02], 1.5), [
      ['torus', [0.08, 0.025, 3, 6], [0.52, -0.2, 0.08], 0x5a5a66, [0, 0.4, 0], null, 'metal'],
      ['torus', [0.08, 0.025, 3, 6], [0.54, -0.34, 0.08], 0x5a5a66, [0, 1.9, 0], null, 'metal'],
      ['torus', [0.08, 0.025, 3, 6], [0.52, -0.48, 0.08], 0x5a5a66, [0, 0.4, 0], null, 'metal'],
      ic(0.12, [0.52, -0.66, 0.08], 0x3a3a44, 'metal')
    ]));
    ENEMY_MODELS.ghost2 = fin(P, 1.3, { hover: 0.2, flap: 3.5 });
    // 紫魂：紫色怨灵，弯角、黄色发光眼、长爪
    a = ghostP({ c: 0xa45cf0, glow: 1.25, angry: true, eyeC: 0xffe040, tatters: 7 });
    P = a.p.concat(sym([cn(0.08, 0.36, [0.22, 0.66, -0.02], 0x5a2a8a, 'bone', 4, [0, 0, -0.5]), cn(0.05, 0.2, [0.37, 0.88, -0.02], 0x5a2a8a, 'bone', 4, [0, 0, -1.2])]))
      .concat(lit(1.3, sym([cn(0.025, 0.16, [0.52, -0.2, 0.12], 0xe8d8ff, 'plain', 3, [Math.PI - 0.3, 0, 0]), cn(0.025, 0.16, [0.46, -0.21, 0.14], 0xe8d8ff, 'plain', 3, [Math.PI - 0.3, 0, 0])])));
    ENEMY_MODELS.ghost3 = fin(P, 1.4, { hover: 0.22, flap: 5 });
    // 飞头：绿脸僵尸头、缝线、红眼、大嘴、一对蝙蝠翅膀
    b = [0, 0, 0]; c = [0.3, 0.324, 0.3];
    P = [
      sp(0.3, b, 0xa9c48c, 'en_gob', [1, 1.08, 1], [9, 7]),
      sp(0.31, [0, 0.1, -0.05], 0x2a2a1e, 'fur', [1.03, 0.8, 1], [8, 5]),
      bx([0.22, 0.1, 0.04], [0, -0.13, fz(b, c, 0, -0.13) - 0.01], 0x3a0808, 'plain'),
      bx([0.2, 0.025, 0.03], [0, -0.09, fz(b, c, 0, -0.09) + 0.005], 0xf0e8d0, 'plain'),
      bx([0.18, 0.018, 0.02], [-0.02, 0.17, fz(b, c, -0.02, 0.17) + 0.004], 0x2a1414, 'plain', [0, 0, 0.15])
    ].concat(lit(2.5, sym([sp(0.06, [0.11, 0.04, fz(b, c, 0.11, 0.04) - 0.01], 0xff3a20, 'plain', [1, 0.8, 0.6], [6, 4])])))
      .concat(sym([sp(0.06, [0.3, 0.0, 0.0], 0x99b47c, 'en_gob', [0.5, 1, 0.8], [5, 3])]))
      .concat(limbs(CH.wing, [0.2, 0.08, -0.14], [
        sgB([0.2, 0.08, -0.14], [0.66, 0.34, -0.22], 0.04, 0x3a2440, 'plain'),
        bx([0.48, 0.02, 0.3], [0.46, 0.1, -0.3], 0x5a3a6a, 'cloth', [0.1, 0.15, 0.5]),
        bx([0.3, 0.02, 0.22], [0.58, 0.12, -0.44], 0x4a2a5a, 'cloth', [0.1, 0.5, 0.4])
      ], 0, null, null, 1.2));
    ENEMY_MODELS.head = fin(P, 1, { hover: 0.2, flap: 14 });
    // 僵尸：正常人体比例、破蓝衬衫、双臂前伸、发光的黄绿眼睛、露出肋骨
    var SK = 0x8db07a;
    b = [0, 1.73, 0.03]; c = [0.128, 0.146, 0.135];
    a = human({ legC: 0x4e3e2c, legT: 'cloth', footC: 0x2e2620, footT: 'cloth', bodyC: 0x4a6a9a, bodyT: 'cloth', armC: 0x4a6a9a, armT: 'cloth', foreC: SK, foreT: 'en_gob', headC: SK, headT: 'en_gob', fwd: 0.85 });
    P = a.p.concat([bx([0.17, 0.2, 0.03], [0.07, 1.27, 0.19], SK, 'en_ribs')])
      .concat(on(a.head, [
        sp(0.135, b, SK, 'en_gob', [0.95, 1.08, 1]),
        sp(0.14, [0, 1.79, -0.01], 0x2a2418, 'fur', [1, 0.62, 1], [7, 4]),
        bx([0.1, 0.05, 0.03], [0.01, 1.655, fz(b, c, 0.01, 1.655) - 0.005], 0x2a0a0a, 'plain')
      ].concat(lit(2.5, sym([bx([0.04, 0.03, 0.02], [0.045, 1.75, fz(b, c, 0.045, 1.75) + 0.004], 0xd0ff60, 'plain')])))));
    ENEMY_MODELS.zombie = fin(P, 1, { hip: 0.95, lean: 0.08, roll: 0.1 });
    // 红色亡魂（最终虫潮，数量多，要省三角形）
    ENEMY_MODELS.swarmghost = fin(ghostP({ c: 0xe8302a, glow: 1.3, cheap: true, angry: true, eyeC: 0xfff0a0, tatters: 4 }).p, 1, { hover: 0.15, flap: 6 });

    // ---- 小 Boss ----
    // 石头魔像：巨大、苔藓、背上长青色水晶、胸口的核心发光
    a = golem({ c: 0x8d8b84, c2: 0x77756f, eye: 0x5affd9 });
    P = a.p.concat([ic(0.24, [0.05, 1.42, -0.1], 0x4a7a2a, 'leaf', [1.6, 0.45, 1.3]), ic(0.15, [0.52, 1.42, 0], 0x4a7a2a, 'leaf', [1.3, 0.4, 1.1]), ic(0.15, [-0.5, 1.4, -0.04], 0x4a7a2a, 'leaf', [1.3, 0.4, 1.1])])
      .concat(lit(2.2, [oc(0.13, [0, 1.08, 0.38], 0x5affd9, 'plain', [1, 1.3, 0.6]), oc(0.12, [0.18, 1.32, -0.3], 0x5affd9, 'plain', [0.7, 2, 0.7], [-0.4, 0, -0.3]), oc(0.1, [-0.16, 1.28, -0.34], 0x5affd9, 'plain', [0.7, 2, 0.7], [-0.5, 0, 0.4]), oc(0.08, [0.02, 1.46, -0.22], 0x5affd9, 'plain', [0.7, 2, 0.7], [-0.3, 0, 0])]));
    ENEMY_MODELS.golemboss = fin(P, 2.6, { hip: 0.6, lean: 0.05, roll: 0.08 });
    // 猪头大王：大肚子猪王、王冠、獠牙、红披风、大木棒
    P = [
      sp(0.95, [0, 1.45, 0.08], 0xeb9aa2, 'skin', [1.1, 1.05, 1], [8, 6]),
      sp(0.7, [0, 2.15, -0.05], 0xeb9aa2, 'skin', [1.35, 0.75, 0.9], [7, 5]),
      cy(0.98, 1.02, 0.2, [0, 0.98, 0.06], 0x5a3a22, 'cloth', 10),
      bx([0.3, 0.24, 0.08], [0, 0.98, 1.06], 0xffc928, 'gold'),
      bx([1.5, 1.9, 0.06], [0, 1.55, -0.72], 0xb02a3a, 'cloth', [0.12, 0, 0])
    ].concat(limbs(CH.hip, [0.42, 0.8, 0], [sgC([0.42, 0.85, 0], [0.44, 0.42, 0.05], 0.22, 0.2, 0xe08a92, 'skin', 6)], CH.knee, [0.44, 0.42, 0.05],
      [sgC([0.44, 0.42, 0.05], [0.44, 0.1, 0.03], 0.19, 0.17, 0xe08a92, 'skin', 6), bx([0.36, 0.14, 0.42], [0.44, 0.07, 0.08], 0x3a2a24, 'plain')]))
      .concat(limbs(CH.sho, [1.0, 2.25, 0], [sgC([1.0, 2.25, 0], [1.12, 1.62, 0.12], 0.2, 0.18, 0xeb9aa2, 'skin', 6)], CH.elb, [1.12, 1.62, 0.12],
        [sgC([1.12, 1.62, 0.12], [1.15, 1.1, 0.34], 0.18, 0.16, 0xeb9aa2, 'skin', 6), ic(0.24, [1.16, 1.0, 0.42], 0xe08a92, 'skin', [1, 1.1, 1])], 1, 1, a = {}))
      .concat(on(a.R.b, [sgC([-1.16, 0.95, 0.42], [-1.2, 2.1, 1.2], 0.08, 0.1, 0x8a5a2e, 'wood', 5), ic(0.36, [-1.22, 2.35, 1.38], 0x7a4a24, 'bark', [0.8, 1.4, 0.8], [0.6, 0, 0]),
        cn(0.07, 0.28, [-1.5, 2.4, 1.38], 0xe8e0d0, 'bone', 3, [0, 0, 1.5]), cn(0.07, 0.28, [-0.94, 2.4, 1.38], 0xe8e0d0, 'bone', 3, [0, 0, -1.5]), cn(0.07, 0.28, [-1.22, 2.75, 1.5], 0xe8e0d0, 'bone', 3, [0.4, 0, 0])]))
      .concat(on(jt(CH.head, [0, 2.5, 0.1]), mv(pigHead({ c: 0xeb9aa2, c2: 0xd9707a }), 0, 2.88, 0.28)));
    ENEMY_MODELS.chunkham = fin(P, 1.05, { hip: 0.85, lean: 0.06, roll: 0.1 });
    // 沙魔像：方块砂岩、橙色发光眼、腰间一圈蓝金饰带
    a = golem({ c: 0xd9b46a, c2: 0xc29a52, eye: 0xff7a2a, blocky: true });
    P = a.p.concat([bx([1.15, 0.12, 0.85], [0, 0.82, 0], 0x3a5ad9, 'en_stripe'), bx([0.3, 0.3, 0.06], [0, 1.1, 0.5], 0xe8b830, 'gold'),
      bx([0.34, 0.22, 0.3], [0.22, 1.42, -0.12], 0xc29a52, 'brick', [0, 0.3, 0.1]), bx([0.26, 0.2, 0.26], [-0.26, 1.4, -0.1], 0xd9b46a, 'brick', [0, -0.4, 0]),
      bx([0.3, 0.2, 0.25], [0.06, 0.95, -0.38], 0xc29a52, 'brick', [0.2, 0.2, 0])])
      .concat(on(a.head, [bx([0.42, 0.1, 0.36], [0, 1.68, 0.14], 0xe8b830, 'gold'), bx([0.12, 0.16, 0.06], [0, 1.78, 0.3], 0x3a5ad9, 'en_stripe')]))
      .concat(pair(a.arm.L.b, a.arm.R.b, [bx([0.3, 0.1, 0.3], [0.64, 0.66, 0.1], 0x3a5ad9, 'en_stripe')]))
      .concat(lit(2.2, [oc(0.09, [0, 1.1, 0.55], 0xff7a2a, 'plain')]));
    ENEMY_MODELS.sandgolem = fin(P, 2.6, { hip: 0.6, lean: 0.05, roll: 0.08 });
    // 毒蝎女王：暗红大蝎子、金头冠、背上尖刺
    a = scorp({ c: 0x9a3a22, c2: 0x6a2414, sting: 0x9aff3a, eye: 0xffe040, tailW: 1.5 });
    P = a.p.concat([cy(0.16, 0.14, 0.07, [0, 0.57, 0.32], 0xffc928, 'gold', 6)])
      .concat([0, 1, 2].map(function (i) { return cn(0.04, 0.12, [(i - 1) * 0.1, 0.66, 0.34], 0xffd84a, 'gold', 4); }))
      .concat([cn(0.05, 0.16, [0, 0.55, -0.1], 0x3a1a10, 'bone', 4), cn(0.045, 0.14, [0, 0.55, -0.38], 0x3a1a10, 'bone', 4)]);
    ENEMY_MODELS.scorpboss = fin(P, 2.5, { hip: 0.42, lean: 0, roll: 0.02, flap: 4 });
    // 幽灵猪王：半透明的蓝白猪头、王冠、床单一样的身体拖着尾巴
    P = mv(lit(1.3, [
      sp(0.7, [0, -0.35, 0], 0xb8d8ff, 'en_sheet', [1, 0.9, 0.9], [8, 6]),
      cn(0.62, 1.4, [0, -1.2, -0.1], 0xb8d8ff, 'en_sheet', 8, [Math.PI + 0.25, 0, 0])
    ]).concat(on(jt(CH.sway, [0, -0.9, 0], 1.4), lit(1.3, [0, 1, 2, 3, 4].map(function (i) { var t = i / 5 * TAU; return cn(0.16, 0.4, [Math.sin(t) * 0.45, -1.15, Math.cos(t) * 0.38 - 0.1], 0xa8c8ff, 'en_sheet', 4, [Math.PI, 0, 0]); }))))
      .concat(limbs(CH.tail, [0.6, -0.2, 0.1], lit(1.3, [sp(0.2, [0.78, -0.3, 0.2], 0xb8d8ff, 'en_sheet', [0.8, 1.2, 0.8], [6, 4])]), 0, null, null, 1.4))
      .concat(lit(1.25, pigHead({ c: 0xc8e4ff, c2: 0x9ab8e8, t: 'en_sheet', eye: 0x2a3a6a }).map(function (p) { var q = p.slice(); q[2] = [p[2][0], p[2][1] + 0.55, p[2][2] + 0.1]; return q; }))), 0, 0.9, 0);
    ENEMY_MODELS.ghostham = fin(P, 1.6, { hover: 0.25, flap: 3 });
    // 骷髅老爹：骷髅国王、紫色披风、白毛领、金冠、发光的权杖
    a = skel({ eye: 0xc070ff, thick: 1.35, bone: 0xe8dcc0 });
    P = a.p.concat(on(jt(CH.sway, [0, 1.6, -0.2], 0.5), [bx([0.78, 1.4, 0.04], [0, 0.93, -0.24], 0x6a2a8a, 'cloth', [0.12, 0, 0]), bx([0.8, 0.07, 0.05], [0, 0.25, -0.33], 0xffc928, 'gold', [0.12, 0, 0])]))
      .concat(pair(a.arm.L.a, a.arm.R.a, [sp(0.12, [0.28, 1.61, 0], 0xffc928, 'gold', [1.25, 0.7, 1.15], [6, 4])]))
      .concat([0, 1, 2, 3, 4, 5].map(function (i) { var t = (i / 5 - 0.5) * 2.8; return ic(0.09, [Math.sin(t) * 0.24, 1.64, Math.cos(t) * 0.1 - 0.05], 0xf4f0ea, 'fur'); }))
      .concat(on(a.head, [cy(0.15, 0.14, 0.08, [0, 1.95, -0.01], 0xffc928, 'gold', 8)].concat([0, 1, 2, 3, 4].map(function (i) { var t = i / 5 * TAU; return cn(0.04, 0.12, [Math.sin(t) * 0.13, 2.04, Math.cos(t) * 0.13 - 0.01], 0xffd84a, 'gold', 4); }))))
      .concat(on(a.arm.R.b, [sgC([-0.28, 0.6, 0.0], [-0.29, 1.5, 0.35], 0.022, 0.022, 0xffc928, 'gold', 5)].concat(lit(2.2, [oc(0.08, [-0.295, 1.58, 0.38], 0xc070ff, 'plain')]))));
    ENEMY_MODELS.skelking = fin(P, 1.85, { hip: 0.98, lean: 0.05, roll: 0.05 });

    // ---- 关卡 Boss ----
    // 树皮老大：大树人，树干身体、树根腿、树枝手臂、一团团像素树冠、发光黄眼、树干裂缝里透出琥珀色的光
    var BK = 0x8f6a40, BK2 = 0x7a5530, BK3 = 0x664428;
    P = [
      cy(0.85, 1.15, 3.0, [0, 2.6, 0], BK, 'bark', 8),
      bx([0.95, 0.75, 0.12], [0, 3.3, 0.98], 0x24160c, 'plain'),
      bx([0.6, 0.22, 0.1], [0, 2.9, 1.02], 0x1a0e06, 'plain'),
      sp(0.5, [0.62, 3.95, 0.1], 0x4a8a2c, 'leaf', [1.2, 0.45, 1.1], [6, 4]),
      sp(0.42, [-0.55, 3.9, -0.2], 0x3f7a28, 'leaf', [1.2, 0.45, 1.1], [6, 4])
    ].concat(lit(2.4, sym([bx([0.22, 0.15, 0.06], [0.24, 3.45, 1.05], 0xffe040, 'plain')])))
      .concat(lit(2.0, [bx([0.5, 0.08, 0.06], [0, 2.9, 1.04], 0xff9a2a, 'plain'), bx([0.07, 0.6, 0.05], [-0.42, 2.1, 1.0], 0xffb040, 'plain', [0, 0, 0.3]), bx([0.06, 0.45, 0.05], [0.5, 1.7, 0.98], 0xffb040, 'plain', [0, 0, -0.25])]))
      .concat(sym([cn(0.06, 0.18, [0.16, 2.97, 1.06], 0xe8d8b0, 'bone', 3, [Math.PI, 0, 0]), sp(0.16, [0.75, 2.2, 0.55], 0xd9443a, 'plain', [1, 0.55, 1], [6, 3])]))
      .concat(lit(1.6, sym([sp(0.04, [0.78, 2.26, 0.62], 0xffffff, 'plain', null, [4, 3])])))
      .concat(limbs(CH.hip, [0.6, 1.3, 0], [sgC([0.6, 1.4, 0], [0.75, 0.7, 0.1], 0.38, 0.33, BK2, 'bark', 6)], CH.knee, [0.75, 0.7, 0.1],
        [sgC([0.75, 0.7, 0.1], [0.78, 0.15, 0.05], 0.32, 0.3, BK2, 'bark', 6), cn(0.16, 0.7, [0.95, 0.12, 0.45], BK3, 'bark', 4, [1.35, 0, -0.3]), cn(0.16, 0.6, [1.2, 0.12, 0.0], BK3, 'bark', 4, [0, 0, -1.4]), cn(0.14, 0.6, [0.82, 0.12, -0.35], BK3, 'bark', 4, [-1.35, 0, 0])]))
      .concat(limbs(CH.sho, [0.95, 3.6, 0], [sgC([0.9, 3.6, 0], [1.75, 2.75, 0.35], 0.26, 0.2, BK, 'bark', 5), ic(0.42, [1.25, 3.35, 0.0], 0x3a7a2a, 'leaf')], CH.elb, [1.75, 2.75, 0.35],
        [sgC([1.75, 2.75, 0.35], [1.9, 1.9, 0.7], 0.2, 0.14, BK, 'bark', 5), cn(0.07, 0.6, [1.85, 1.6, 0.85], BK2, 'bark', 3, [Math.PI - 0.3, 0, 0]), cn(0.07, 0.55, [2.1, 1.65, 0.75], BK2, 'bark', 3, [Math.PI - 0.2, 0, -0.4]), cn(0.07, 0.5, [1.7, 1.7, 0.6], BK2, 'bark', 3, [Math.PI, 0, 0.4])], 0.7, 0.8))
      .concat(on(jt(CH.head, [0, 4.0, 0], 1.5), [
        ic(1.45, [0, 5.0, -0.25], 0x3a7a2a, 'leaf'), ic(1.0, [1.15, 4.55, 0.25], 0x2f6a22, 'leaf'), ic(1.05, [-1.2, 4.65, 0.05], 0x447f2c, 'leaf'),
        ic(0.9, [0.25, 5.85, 0.35], 0x4c8a30, 'leaf'), ic(0.85, [-0.45, 4.45, 0.95], 0x376f26, 'leaf'), ic(0.7, [0.85, 5.4, -0.6], 0x427c2a, 'leaf')
      ]))
      .concat(on(jt(CH.head, [0, 4.0, 0], 1.5), lit(1.8, [sp(0.12, [-0.7, 5.3, 0.9], 0xff5a7a, 'plain', [1, 0.6, 1], [5, 3]), sp(0.11, [0.9, 4.9, 1.0], 0xffd84a, 'plain', [1, 0.6, 1], [5, 3]), sp(0.1, [0.1, 6.35, 0.75], 0xff5a7a, 'plain', [1, 0.6, 1], [5, 3])])));
    ENEMY_MODELS.ent = fin(P, 1, { hip: 1.4, lean: 0.04, roll: 0.06 });
    // 胡狼法老：黑色胡狼头、长耳朵、蓝金头巾、金项圈、白色短裙、金权杖
    b = [0, 1.74, 0.02]; c = [0.14, 0.15, 0.15];
    a = human({ w: 1.05, legC: 0x2a2a38, legT: 'fur', footC: 0xe8b830, footT: 'gold', hipC: 0xece4cc, hipT: 'cloth', bodyC: 0x2a2a38, bodyT: 'fur', armC: 0x2a2a38, armT: 'fur', headC: 0x2a2a38, headT: 'fur', armS: 0.7 });
    P = a.p.concat([
      cy(0.21, 0.27, 0.34, [0, 0.9, 0], 0xece4cc, 'cloth', 8, null, [1, 1, 0.8]),
      cy(0.2, 0.2, 0.07, [0, 1.06, 0], 0xe8b830, 'gold', 8, null, [1, 1, 0.75]),
      cy(0.36, 0.3, 0.12, [0, 1.52, 0], 0xe8b830, 'en_stripe', 10, null, [1, 1, 0.72])
    ]).concat(pair(a.arm.L.b, a.arm.R.b, [cy(0.07, 0.07, 0.08, [0.3, 1.0, 0.03], 0xe8b830, 'gold', 6)]))
      .concat(on(a.head, [
        sp(0.14, b, 0x2a2a38, 'fur', [1, 1, 1]),
        sgB([0, 1.72, 0.1], [0, 1.66, 0.36], 0.12, 0x2a2a38, 'fur', 0.1),
        bx([0.05, 0.04, 0.04], [0, 1.67, 0.37], 0x111111, 'plain'),
        bx([0.34, 0.24, 0.24], [0, 1.78, -0.08], 0x3a5ad9, 'en_stripe'),
        bx([0.09, 0.3, 0.07], [0.16, 1.55, 0.02], 0x3a5ad9, 'en_stripe'), bx([0.09, 0.3, 0.07], [-0.16, 1.55, 0.02], 0x3a5ad9, 'en_stripe'),
        cy(0.16, 0.15, 0.04, [0, 1.85, 0.0], 0xe8b830, 'gold', 8)
      ].concat(sym([cn(0.06, 0.32, [0.09, 2.0, -0.02], 0x2a2a38, 'fur', 4, [-0.1, 0, -0.15], [1, 1, 0.5])]))
       .concat(lit(2.8, sym([bx([0.045, 0.025, 0.02], [0.06, 1.77, fz(b, c, 0.06, 1.77) + 0.008], 0x5affe0, 'plain')])))))
      .concat(on(a.arm.R.b, [sgC([-0.31, 0.2, 0.15], [-0.32, 2.3, 0.15], 0.03, 0.03, 0xe8b830, 'gold', 5), bx([0.05, 0.16, 0.2], [-0.32, 2.36, 0.22], 0xe8b830, 'gold', [0.6, 0, 0])]));
    ENEMY_MODELS.pharaoh = fin(P, 2.85, { hip: 0.95, lean: 0.04, roll: 0.05 });
    // 大骨头鲍勃：巨型骷髅、紫色巫师帽、紫色发光眼、大骨棒
    a = skel({ bone: 0xe8dcc0, eye: 0xb05aff, thick: 1.4 });
    P = a.p.concat(on(a.head, [cn(0.2, 0.5, [0, 2.15, -0.06], 0x6a2a9a, 'cloth', 6, [-0.25, 0, 0]), cy(0.27, 0.27, 0.03, [0, 1.92, -0.01], 0x5a1a8a, 'cloth', 8), cy(0.165, 0.165, 0.05, [0, 1.96, -0.01], 0xffc928, 'gold', 8)]))
      .concat([bx([0.5, 0.75, 0.03], [0, 1.0, -0.14], 0x5a1a8a, 'cloth', [0.12, 0, 0])])
      .concat(on(a.arm.R.b, [sgC([-0.28, 0.86, 0.1], [-0.3, 1.25, 0.8], 0.045, 0.045, 0xece2c8, 'bone', 5), ic(0.075, [-0.3, 1.27, 0.84], 0xece2c8, 'bone', [1, 0.8, 1.3]), ic(0.07, [-0.28, 0.85, 0.08], 0xece2c8, 'bone')]));
    ENEMY_MODELS.bigbob = fin(P, 3.0, { hip: 0.98, lean: 0.05, roll: 0.05 });
  })();

  // interact.js 也用这些小工具
  ENEMY_KIT = { bx: bx, cy: cy, sp: sp, cn: cn, ic: ic, oc: oc, lit: lit, sym: sym, sgB: sgB, sgC: sgC,
    // data_enemies_more.js 的新敌人也用同一套关节、身体模板和收尾缩放
    CH: CH, jt: jt, on: on, mir: mir, mv: mv, scl: scl, fin: fin, fz: fz, limbs: limbs, pair: pair,
    skel: skel, gob: gob, human: human, golem: golem, scorp: scorp, ghostP: ghostP };
})();

ENEMIES = {
  // ---- 森林 ----
  goblin: E('小哥布林', 7, 15, 5, 0.5, 1, 0x6ab83a, ENEMY_MODELS.goblin),
  goblin2: E('壮哥布林', 15, 25, 5.5, 0.6, 2, 0x4a9a2a, ENEMY_MODELS.goblin2),
  goblintank: E('哥布林重甲兵', 40, 30, 5, 0.9, 4, 0x3a7a2a, ENEMY_MODELS.goblintank, { scale: 1 }),
  slime: E('史莱姆', 6, 8, 6.5, 0.55, 1, 0x5ad9a0, ENEMY_MODELS.slime, { hop: true }),
  bee: E('大黄蜂', 10, 15, 6.5, 0.5, 1, 0xffd23a, ENEMY_MODELS.bee, { flyer: true }),
  boomer: E('爆炸桶怪', 18, 30, 6, 0.6, 2, 0xd94a2a, ENEMY_MODELS.boomer, { behavior: 'explode' }),
  golem: E('小石像', 20, 20, 5, 0.65, 2, 0x8a8a84, ENEMY_MODELS.golem),
  ghoul: E('食尸鬼', 9, 12, 9, 0.5, 1, 0x8a9a7a, ENEMY_MODELS.ghoul),
  skeleton: E('骷髅', 20, 20, 5.5, 0.55, 2, 0xf3ead0, ENEMY_MODELS.skeleton),
  skelarmor: E('重甲骷髅', 30, 25, 4, 0.65, 3, 0x9aa3ad, ENEMY_MODELS.skelarmor),
  // ---- 沙漠 ----
  mummy: E('木乃伊', 8, 13, 5.5, 0.55, 1, 0xe0d6b8, ENEMY_MODELS.mummy),
  mummytank: E('木乃伊壮汉', 45, 30, 5, 0.85, 4, 0xc8bc98, ENEMY_MODELS.mummytank),
  ancient: E('远古木乃伊', 70, 40, 5, 0.95, 6, 0xd9b43a, ENEMY_MODELS.ancient),
  dustyskel: E('沙尘骷髅', 16, 22, 6.5, 0.55, 2, 0xd9c08a, ENEMY_MODELS.dustyskel),
  dustyarmor: E('沙尘重甲骷髅', 25, 16, 4.5, 0.65, 3, 0xb08a5a, ENEMY_MODELS.dustyarmor),
  scorpion: E('毒蝎', 16, 20, 7, 0.65, 2, 0xc0703a, ENEMY_MODELS.scorpion, { poison: true }),
  cactus: E('仙人掌射手', 15, 30, 5, 0.7, 3, 0x4a9a3a, ENEMY_MODELS.cactus, { behavior: 'shoot', shootCd: 2.8, shotSpeed: 13, slowMove: true }),
  wisp: E('火灵', 8, 13, 7.5, 0.5, 1, 0xff4a2a, ENEMY_MODELS.wisp, { flyer: true }),
  tumble: E('风滚骨', 7, 9, 11, 0.6, 1, 0xd9b46a, ENEMY_MODELS.tumble, { behavior: 'roll' }),
  // ---- 墓地 ----
  ghost: E('幽灵', 10, 10, 6, 0.55, 1, 0xd8e8ff, ENEMY_MODELS.ghost, { flyer: true }),
  ghost2: E('大幽灵', 20, 13, 7, 0.7, 2, 0xa8c8ff, ENEMY_MODELS.ghost2, { flyer: true }),
  ghost3: E('紫魂', 40, 20, 8, 0.8, 4, 0xb05aff, ENEMY_MODELS.ghost3, { flyer: true }),
  head: E('飞头', 12, 8, 7, 0.5, 1, 0xe8c09a, ENEMY_MODELS.head, { flyer: true }),
  zombie: E('僵尸', 12, 20, 6.5, 0.55, 1, 0x7aa07a, ENEMY_MODELS.zombie),
  // 最终虫潮的幽灵
  swarmghost: E('红色亡魂', 100, 30, 10, 0.6, 2, 0xff3a3a, ENEMY_MODELS.swarmghost, { flyer: true, cap: 400 }),
  // ---- 小 Boss（7:00 与 2:00 出现） ----
  golemboss: E('石头魔像', 250, 40, 6, 1.6, 30, 0x8a8a84, ENEMY_MODELS.golemboss, { miniboss: true, attacks: ['slam', 'charge'] }),
  chunkham: E('猪头大王', 250, 40, 6, 1.5, 30, 0xe8909a, ENEMY_MODELS.chunkham, { miniboss: true, attacks: ['charge', 'slam'] }),
  sandgolem: E('沙魔像', 250, 40, 6, 1.6, 30, 0xd9b46a, ENEMY_MODELS.sandgolem, { miniboss: true, attacks: ['slam', 'volley'] }),
  scorpboss: E('毒蝎女王', 250, 35, 7, 1.7, 30, 0x9a4a2a, ENEMY_MODELS.scorpboss, { miniboss: true, poison: true, attacks: ['charge', 'volley'] }),
  ghostham: E('幽灵猪王', 320, 45, 6.5, 1.5, 40, 0xb8d8ff, ENEMY_MODELS.ghostham, { miniboss: true, flyer: true, attacks: ['volley', 'charge'] }),
  skelking: E('骷髅老爹', 320, 40, 5.5, 1.5, 40, 0xf3ead0, ENEMY_MODELS.skelking, { miniboss: true, attacks: ['summon', 'slam'] }),
  // ---- 关卡 Boss ----
  ent: E('树皮老大', 9000, 40, 7, 2.4, 0, 0x6a4a2a, ENEMY_MODELS.ent, { boss: true, attacks: ['spikes', 'orbs', 'slam'] }),
  pharaoh: E('胡狼法老', 8000, 40, 7, 2.2, 0, 0xd9b43a, ENEMY_MODELS.pharaoh, { boss: true, attacks: ['lasers', 'orbs', 'charge'] }),
  bigbob: E('大骨头鲍勃', 9000, 45, 6, 2.4, 0, 0xf3ead0, ENEMY_MODELS.bigbob, { boss: true, attacks: ['slam', 'summon', 'orbs', 'lasers'] })
};
