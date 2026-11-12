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
  // 第 10 块：三角片零件 c10Tri（s = 三个顶点 [ax,ay,az, bx,by,bz, cx,cy,cz]），正反两面各一个三角形，贴图铺满整个小格
  MODEL.extraGeo.c10Tri = function (s) {
    var a = new THREE.Vector3(s[0], s[1], s[2]), b = new THREE.Vector3(s[3], s[4], s[5]), c = new THREE.Vector3(s[6], s[7], s[8]);
    var n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z], 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute([n.x, n.y, n.z, n.x, n.y, n.z, n.x, n.y, n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z, -n.x, -n.y, -n.z], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0.5, 1, 0, 0, 0.5, 1, 1, 0], 2));
    return g;
  };
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
  // 左右镜像（三角片 c10Tri 的三个顶点也跟着镜像）
  function mir(p) {
    var q = p.slice(); q[2] = [-p[2][0], p[2][1], p[2][2]]; if (p[4]) q[4] = [p[4][0], -p[4][1], -p[4][2]];
    if (p[0] === 'c10Tri') q[1] = p[1].map(function (v, i) { return i % 3 ? v : -v; });
    return q;
  }
  // 三角片（翅膀的膜、碎布）：tri(a, b, c, 颜色, 贴图)，三个顶点相对 [0,0,0]，正反两面
  function tri(a, b, c, col, t) { return ['c10Tri', a.concat(b, c), [0, 0, 0], col, null, null, t]; }
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
  var PART_DIMS = { box: 3, cyl: 3, cone: 2, ball: 1, sphere: 1, oct: 1, dodec: 1, tet: 1, torus: 2, fxArc: 2, c10Tri: 9 };
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

  // 人形（木乃伊、僵尸、蜥人的身体）：约 1.85 米；fwd = 1 时双臂向前平举
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

  // 精英/小 Boss 头顶的金冠
  CROWN_PARTS = [
    ['cyl', [0.21, 0.19, 0.13, 8], [0, 0, 0], 0xffc928, null, null, 'gold'],
    ['sphere', [0.17, 8, 5], [0, 0.04, 0], 0xb0182e, null, [1, 0.6, 1], 'cloth']
  ].concat([0, 1, 2, 3, 4].map(function (i) { var a = i / 5 * TAU; return ['cone', [0.065, 0.18, 4], [Math.sin(a) * 0.19, 0.15, Math.cos(a) * 0.19], 0xffd84a, null, null, 'gold']; }))
    .concat([0, 1, 2, 3, 4].map(function (i) { var a = i / 5 * TAU; return ['ball', [0.032, 0], [Math.sin(a) * 0.19, 0.25, Math.cos(a) * 0.19], 0xfff2a0, null, null, 'plain']; }))
    .concat([['oct', [0.045], [0, 0.0, 0.205], 0xff2a4a, null, null, 'plain'], ['oct', [0.04], [0.2, 0.0, 0], 0x3aa0ff, null, null, 'plain'], ['oct', [0.04], [-0.2, 0.0, 0], 0x3aa0ff, null, null, 'plain']]);

  (function () {
    var a, b, c, P;
    // ---- 迷雾森林 ----
    // 哥布林小兵
    ENEMY_MODELS.goblin = fin(gob().p, 1, { hip: 0.41, lean: 0.22, bob: 0.04, roll: 0.06 });
    // 哥布林投矛手：更高更壮的哥布林，右手把一根短矛举过肩头（随时要投），背上斜捆着三根备用短矛，右肩一块皮护肩，胸前斜挎皮带
    a = gob({ skin: 0x37b531, dark: 0x258a22, cloth: 0x5a3a22, w: 1.08, headSeg: [6, 5] });
    (function () {
      var SH = 0x8a5a2e, HD = 0xc8d0d8, TF = 0xc8302a, G = 0x37b531, G2 = 0x258a22, T = 'en_gob';
      // 去掉原来垂着的右臂，换成举起来的投掷手臂（摆幅很小，矛不会乱晃）；四肢少几个面，手换成八面体（省下的三角形给矛）
      P = a.p.filter(function (q) { return q[7] !== a.arm.R.a && q[7] !== a.arm.R.b; }).map(function (q) {
        q = q.slice();
        if (q[0] === 'cyl' && q[1][3] === 5) q[1] = [q[1][0], q[1][1], q[1][2], 4];
        else if (q[0] === 'cyl' && q[1][3] === 7) q[1] = [q[1][0], q[1][1], q[1][2], 6];
        else if (q[0] === 'ball' && q[1][0] < 0.09) { q[0] = 'oct'; q[1] = [q[1][0] * 1.1]; }
        return q;
      });
      var sho = [-0.26, 0.77, 0], elb = [-0.4, 0.84, -0.1], hand = [-0.36, 1.06, -0.06];
      var ja = jt(CH.sho + 1, sho, 0.22), jb = jt(CH.elb + 1, elb, 0.18, ja);
      P = P.concat(on(ja, [sgC([-0.26, 0.78, 0], elb, 0.06, 0.05, G, T, 4), oc(0.13, [-0.29, 0.8, 0], 0x6a4428, 'ch_leather', [1.05, 0.6, 0.95])]));
      // 矛：握在手里，矛头朝前上方；叶形铁矛头 + 红缨
      var s0 = [-0.36, 0.98, -0.5], s1 = [-0.36, 1.2, 0.5];
      P = P.concat(on(jb, [
        sgC(elb, hand, 0.05, 0.045, G, T, 4), oc(0.08, hand, G2, T, [1, 1.15, 1]),
        sgB(s0, s1, 0.04, SH, 'wood'),
        oc(0.1, [-0.36, 1.235, 0.66], HD, 'metal', [0.42, 0.3, 1.7], [-0.21, 0, 0]),
        cn(0.06, 0.12, [-0.36, 1.19, 0.44], TF, 'cloth', 3, [Math.PI / 2 + 0.6, 0, 0])
      ]));
      // 背上一捆三根短矛（矛头朝右上，斜挎的皮带把它们捆住）
      [[0.0, 0.0], [0.05, 0.05], [-0.05, 0.04]].forEach(function (o, k) {
        var b0 = [0.2 + o[0], 0.36 + o[1], -0.25], b1 = [-0.16 + o[0], 1.12 + o[1], -0.27 - k * 0.015];
        P.push(sgB(b0, b1, 0.032, k === 1 ? 0x7a4a24 : SH, 'wood'));
        P.push(cn(0.04, 0.13, [b1[0] - 0.03, b1[1] + 0.1, b1[2]], HD, 'metal', 3, [0, 0, 0.44]));
      });
      P.push(bx([0.06, 0.62, 0.035], [0, 0.66, 0.02], 0x5a3a22, 'ch_leather', [0, 0, 0.75], [1, 1, 1]));
    })();
    ENEMY_MODELS.gobspear = fin(P, 1.2, { hip: 0.41, lean: 0.2, bob: 0.04, roll: 0.06 });
    // 史莱姆：亮绿色的果冻，有高光，有一张小脸
    b = [0, 0.4, 0]; c = [0.55, 0.418, 0.55];
    P = [sp(0.55, b, 0x55d34a, 'slime', [1, 0.76, 1], [12, 8])];
    for (var i = 0; i < 4; i++) { var ang = i / 4 * TAU + 0.6; P.push(sp(0.14, [Math.sin(ang) * 0.48, 0.07, Math.cos(ang) * 0.48], 0x49c03e, 'slime', [1, 0.55, 1], [6, 3])); }
    P = P.concat(lit(1.6, [sp(0.14, [-0.2, 0.69, 0.24], 0xffffff, 'plain', [1.3, 0.5, 0.9], [6, 4]), sp(0.05, [-0.36, 0.56, 0.36], 0xffffff, 'plain', null, [5, 3])]));
    P = P.concat(sym([sp(0.07, [0.15, 0.48, fz(b, c, 0.15, 0.48) - 0.01], 0x101418, 'plain', [0.85, 1.25, 0.5], [6, 4])]));
    P = P.concat(lit(1.5, sym([sp(0.024, [0.13, 0.52, fz(b, c, 0.13, 0.52) + 0.02], 0xffffff, 'plain', null, [4, 3])])));
    P.push(sp(0.06, [0, 0.34, fz(b, c, 0, 0.34) - 0.01], 0x1f4a1a, 'plain', [1.3, 0.6, 0.4], [6, 4]));
    ENEMY_MODELS.slime = fin(P, 1, { hip: 0.2, lean: 0, roll: 0 });
    // 林地胡蜂：细腰的胡蜂，橙红色的胸、一根细细的腰、尖尖的长肚子上橙红和黑色相间的条纹、毒针，
    // 黑色的头、两只大黑眼、橙色的脸甲、两根触角，两对窄长的烟琥珀色翅膀（一直扇），六条腿垂着
    (function () {
      var OR = 0xd8532a, OR2 = 0xe8642a, BK = 0x1a1a1a, WG = 0xf0d0a0;
      b = [0, 0.08, 0.31]; c = [0.12, 0.114, 0.108];
      P = [
        sp(0.15, [0, 0.05, 0.08], OR, 'fur', [0.95, 0.9, 1.05], [6, 5]),
        sp(0.07, [0, 0.16, 0.06], 0x8a2a14, 'fur', [1.5, 0.5, 1.4], [5, 3]),
        sgC([0, 0.0, -0.06], [0, -0.05, -0.17], 0.035, 0.03, BK, 'plain', 4),
        sp(0.19, [0, -0.15, -0.43], OR2, 'en_stripe', [0.8, 1.75, 0.8], [7, 6], [1.25, 0, 0]),
        cn(0.04, 0.17, [0, -0.27, -0.8], BK, 'plain', 4, [-1.9, 0, 0]),
        sp(0.12, b, BK, 'fur', [1, 0.95, 0.9], [6, 4]),
        sp(0.055, [0, 0.03, fz(b, c, 0, 0.03) - 0.025], 0xf08a2a, 'plain', [1.1, 0.9, 0.5], [5, 3])
      ].concat(sym([
        sp(0.07, [0.075, 0.1, fz(b, c, 0.075, 0.1) - 0.04], 0x0a0a14, 'plain', [0.7, 1.2, 0.75], [5, 3]),
        sgB([0.04, 0.17, 0.37], [0.12, 0.38, 0.5], 0.018, BK, 'plain'),
        cn(0.02, 0.07, [0.035, -0.02, 0.4], 0x3a1a0a, 'plain', 3, [2.6, 0, 0.3]),
        sgB([0.08, -0.04, 0.14], [0.15, -0.26, 0.2], 0.03, 0x5a2414, 'plain'),
        sgB([0.1, -0.05, 0.06], [0.2, -0.27, 0.0], 0.03, 0x5a2414, 'plain'),
        sgB([0.08, -0.05, -0.02], [0.15, -0.3, -0.14], 0.03, 0x5a2414, 'plain')
      ])).concat(lit(1.8, sym([sp(0.018, [0.09, 0.14, fz(b, c, 0.09, 0.14) + 0.012], 0xffffff, 'plain', null, [4, 3])])))
        .concat(limbs(CH.wing, [0.07, 0.15, 0.1], lit(1.2, [
          sp(0.27, [0.3, 0.21, 0.02], WG, 'plain', [1, 0.05, 0.26], [6, 3], [0, 0.32, 0.28]),
          sp(0.19, [0.22, 0.18, -0.12], 0xe0b888, 'plain', [1, 0.05, 0.26], [6, 3], [0, 0.78, 0.22])
        ]), 0, null, null, 1));
    })();
    ENEMY_MODELS.wasp = fin(P, 1, { hover: 0.15, flap: 46 });
    // 火药桶精：红漆木桶、铁箍、冒火星的引线、发光的怒眼、小短腿小短手
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
    ENEMY_MODELS.kegimp = fin(P, 1, { hip: 0.36, lean: 0.04, bob: 0.06, roll: 0.14 });
    // ---- 沉钟古城的食尸鬼、骷髅兵、钟楼守卫（模型写在这里，顺序不变） ----
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
    // 骷髅兵
    ENEMY_MODELS.skeleton = fin(skel().p, 1, { hip: 0.98, lean: 0.1, roll: 0.05 });
    // 钟楼守卫：戴宽檐铁锅盔、穿铁胸甲的骷髅卫兵，两手握一杆 2.4 米的长戟（斧刃、顶刺、背钩），
    // 胸前一个小铜钟徽（微微发光），身前身后挂着破了边的蓝灰罩袍；没有圆盾、没有剑
    (function () {
      var ST = 0x8a909a, ST2 = 0x6a6f78, ST3 = 0x7a808a, BN = 0xdac7a0, TB = 0x4a5a7a, PO = 0x6a4a2a, BR = 0xc8903a;
      a = skel({ noRibs: true });
      // 头骨藏在盔下面，少几个面；手臂换成双手握戟的姿势（摆幅很小，戟不会和手分开）
      P = a.p.filter(function (q) { return q[7] !== a.arm.L.a && q[7] !== a.arm.L.b && q[7] !== a.arm.R.a && q[7] !== a.arm.R.b; })
        .map(function (q) { if (q[0] === 'sphere' && q[7] === a.head) { q = q.slice(); q[1] = [q[1][0], 6, 5]; } return q; });
      var arm = function (side, sho, elb, hand) {
        var ja = jt(CH.sho + side, sho, 0.08), jb = jt(CH.elb + side, elb, 0.06, ja);
        return on(ja, [sgB(sho, elb, 0.075, BN, 'bone'), sp(0.12, [sho[0] * 1.12, sho[1], sho[2]], ST3, 'metal', [1.15, 0.7, 1.1], [5, 3])])
          .concat(on(jb, [sgB(elb, hand, 0.065, BN, 'bone'), bx([0.09, 0.1, 0.09], hand, BN, 'bone')]));
      };
      // 戟杆：从右脚前面立起来，微微前倾；右手在下、左手在上（左臂横过胸前）
      var p0 = [-0.22, 0.05, 0.3], p1 = [-0.125, 2.3, 0.38], at = function (y) { var t = (y - p0[1]) / (p1[1] - p0[1]); return [lerp(p0[0], p1[0], t), y, lerp(p0[2], p1[2], t)]; };
      var hr = at(1.06), hl = at(1.36);
      P = P.concat(arm(1, [-0.24, 1.6, 0], [-0.3, 1.3, 0.07], [hr[0] - 0.02, hr[1], hr[2] - 0.04]))
        .concat(arm(0, [0.24, 1.6, 0], [0.23, 1.36, 0.2], [hl[0] + 0.05, hl[1], hl[2] - 0.03]));
      P = P.concat([
        // 胸甲、腰甲
        cy(0.22, 0.17, 0.44, [0, 1.41, 0], ST, 'metal', 8, null, [1, 1, 0.75]),
        cy(0.19, 0.22, 0.2, [0, 1.06, 0], ST2, 'metal', 6, null, [1, 1, 0.8]),
        // 长戟
        sgC(p0, p1, 0.028, 0.028, PO, 'wood', 4),
        bx([0.34, 0.36, 0.035], [-0.32, 1.98, 0.375], 0xa8b0ba, 'metal', [0, 0, 0.12]),
        bx([0.09, 0.52, 0.04], [-0.5, 1.98, 0.375], 0xe0e6ec, 'metal', [0, 0, 0.12]),
        cn(0.05, 0.36, [-0.118, 2.38, 0.385], 0xd8dde4, 'metal', 4, [0.04, 0, -0.04]),
        cn(0.05, 0.26, [0.02, 2.04, 0.375], ST2, 'metal', 3, [0, 0, -1.85])
      ]).concat(on(a.head, [
        // 宽檐铁锅盔
        sp(0.16, [0, 1.89, -0.01], ST3, 'metal', [1, 0.72, 1.05], [6, 4]),
        cy(0.27, 0.27, 0.025, [0, 1.85, -0.01], ST2, 'metal', 8)
      ])).concat(lit(1.3, [
        // 胸前的小铜钟徽
        cn(0.065, 0.1, [0, 1.48, 0.175], BR, 'gold', 5),
        oc(0.025, [0, 1.42, 0.185], 0xe8b860, 'gold')
      ])).concat(on(jt(CH.sway, [0, 1.06, 0.18], 0.5), [
        // 罩袍：前后两片，下摆撕破
        bx([0.24, 0.42, 0.02], [0, 0.87, 0.19], TB, 'cloth', [-0.06, 0, 0]),
        cn(0.06, 0.14, [-0.07, 0.6, 0.2], TB, 'cloth', 3, [Math.PI, 0, 0])
      ])).concat(on(jt(CH.sway, [0, 1.2, -0.16], 0.6), [
        bx([0.32, 0.56, 0.02], [0, 0.94, -0.17], 0x3e4c68, 'cloth', [0.08, 0, 0]),
        cn(0.07, 0.16, [0.08, 0.6, -0.2], 0x3e4c68, 'cloth', 3, [Math.PI, 0, 0])
      ]));
    })();
    ENEMY_MODELS.skelguard = fin(P, 1.04, { hip: 0.98, lean: 0.06, roll: 0.06 });

    // ---- 黄沙古道 ----
    // 木乃伊
    var BD = 0xd8cba2, BD2 = 0xb8a880;
    b = [0, 1.73, 0.02]; c = [0.1235, 0.1456, 0.13];
    a = human({ legC: BD, legT: 'en_band', footC: BD2, footT: 'en_band', bodyC: BD, bodyT: 'en_band', armC: BD, armT: 'en_band', headC: BD, headT: 'en_band', fwd: 1 });
    P = a.p.concat(on(a.head, [
      sp(0.13, b, BD, 'en_band', [0.95, 1.12, 1]),
      bx([0.21, 0.035, 0.05], [0, 1.75, fz(b, c, 0, 1.75) - 0.012], 0x2a1e12, 'plain')
    ].concat(lit(2.6, [bx([0.036, 0.024, 0.02], [0.045, 1.75, fz(b, c, 0.045, 1.75) + 0.008], 0xffe040, 'plain')]))))
      .concat(on(a.arm.R.b, [bx([0.05, 0.34, 0.012], [-0.3, 1.22, 0.42], BD2, 'en_band', [0.1, 0, 0.15])]));
    ENEMY_MODELS.mummy = fin(P, 1.02, { hip: 0.95, lean: 0.06, roll: 0.08 });
    // 抬棺木乃伊：又宽又高的木乃伊，驼着背，背上用两根粗绳捆着一块裂了的石棺盖（盖子边上一圈刻出来的框，中间一个太阳纹），
    // 拳头大、皮腰带；走起来左右摇晃
    b = [0, 1.71, 0.08]; c = [0.143, 0.15, 0.15];
    a = human({ w: 1.45, legC: 0xc4b48a, legT: 'en_band', footC: 0xa49468, footT: 'en_band', bodyC: 0xc4b48a, bodyT: 'en_band', armC: 0xc4b48a, armT: 'en_band', headC: 0xc4b48a, headT: 'en_band', fwd: 0.4, armS: 0.8, fist: 1.6 });
    P = a.p.concat([cy(0.27, 0.27, 0.1, [0, 1.06, 0], 0x5a3a22, 'cloth', 5, null, [1, 1, 0.72])])
      .concat(on(a.head, [sp(0.15, b, 0xc4b48a, 'en_band', [0.95, 1, 1], [7, 5]), bx([0.24, 0.04, 0.05], [0, 1.73, fz(b, c, 0, 1.73) - 0.012], 0x2a1e12, 'plain')]
        .concat(lit(2.6, sym([bx([0.04, 0.026, 0.02], [0.05, 1.73, fz(b, c, 0.05, 1.73) + 0.008], 0xffb020, 'plain')])))));
    (function () {
      // 石棺盖：中心 L0，绕 x 轴前倾 TL（顶端压过头顶后面）；lp() 把盖子上的局部坐标换成模型坐标
      var L0 = [0, 1.32, -0.36], TL = 0.25, cs = Math.cos(TL), sn = Math.sin(TL), LD = 0xa8a090;
      var lp = function (x, y, z) { return [L0[0] + x, L0[1] + y * cs - z * sn, L0[2] + y * sn + z * cs]; };
      P = P.concat([
        bx([0.72, 1.52, 0.11], L0, LD, 'ct_crack', [TL, 0, 0]),
        bx([0.54, 1.3, 0.03], lp(0, -0.02, -0.065), 0x857d6c, 'ct_crack', [TL, 0, 0]),
        cy(0.12, 0.12, 0.03, lp(0, 0.28, -0.085), 0xd8c8a0, 'en_rock', 5, [TL - Math.PI / 2, 0, 0])
      ]).concat(lit(1.1, [0, 1, 2, 3, 4].map(function (k) {
        var an = k / 5 * TAU + 0.31;
        return cn(0.04, 0.12, lp(-Math.sin(an) * 0.2, 0.28 + Math.cos(an) * 0.2, -0.085), 0xd8c8a0, 'en_rock', 3, [TL, 0, an]);
      }))).concat(sym([
        // 捆盖子的粗绳：从盖子顶上绕过肩头到胸前
        sgB([0.22, 1.66, -0.27], [0.24, 1.38, 0.25], 0.05, 0x7a5a32, 'cloth', 0.04)
      ]));
    })();
    ENEMY_MODELS.pallbearer = fin(P, 1.25, { hip: 0.95, lean: 0.16, roll: 0.16 });
    // 金甲虫：圆鼓鼓的金绿色甲壳（一圈金边、中间一道发光的金缝），深绿的前胸，头前面一排金色的耙齿，六条短腿（两组交替爬）；没有尾巴
    (function () {
      var GR = 0x5aa83a, GR2 = 0x3a7a2a, GD = 0xd8b040, DK = 0x1e2a14, k, f, side;
      P = [
        sp(0.45, [0, 0.42, -0.06], GR, 'en_chitin', [1, 0.66, 1.18], [7, 5]),
        cy(0.455, 0.455, 0.05, [0, 0.39, -0.06], GD, 'gold', 7, null, [1, 1, 1.18]),
        sp(0.26, [0, 0.35, 0.42], GR2, 'en_chitin', [1.22, 0.62, 0.72], [5, 4]),
        sp(0.16, [0, 0.29, 0.62], 0x2a5a22, 'en_chitin', [1.2, 0.62, 0.8], [4, 3])
      ].concat(lit(1.3, [sp(0.455, [0, 0.42, -0.06], 0xd8c040, 'gold', [0.07, 0.665, 1.185], [3, 5])]))
        .concat([-0.12, -0.06, 0, 0.06, 0.12].map(function (x) { return cn(0.034, 0.16, [x, 0.37 + (0.12 - Math.abs(x)) * 0.7, 0.75], GD, 'gold', 3, [0.75, 0, -x * 1.6]); }))
        .concat(lit(2.2, sym([oc(0.035, [0.11, 0.35, 0.71], 0xffb040, 'plain')])));
      for (k = 0; k < 3; k++) {
        for (side = 0; side < 2; side++) {
          f = side ? -1 : 1;
          var z = 0.3 - k * 0.3, j = jt(CH.leg + ((k + side) % 2), [0.3 * f, 0.27, z], 1);
          var knee = [0.5 * f, 0.3, z + 0.08 - k * 0.1], foot = [0.56 * f, 0.0, z + 0.12 - k * 0.2];
          P.push(on(j, [sgB([0.3 * f, 0.27, z], knee, 0.085, GR2, 'en_chitin')])[0]);
          P.push(on(j, [sgC(knee, foot, 0.055, 0.025, DK, 'plain', 3)])[0]);
        }
      }
    })();
    ENEMY_MODELS.scarab = fin(P, 1, { hip: 0.3, lean: 0, roll: 0.02, flap: 5 });

    // ---- 沉钟古城 ----
    // 游魂
    ENEMY_MODELS.ghost = fin(ghostP({ c: 0xeef2ff, glow: 1.15 }).p, 1, { hover: 0.18, flap: 4 });
    // 夜魇（午夜钟声的精英）：戴兜帽的影子。上窄下宽的黑紫长袍、破破烂烂的兜帽，帽洞里两只橙色的眼睛（没有嘴），
    // 两只带爪的影子手，下摆六条碎布随风摆，再往下散成黑烟（飘起来的烟在 enemies.js 里放）；颜色自己带，出生时不再染色
    (function () {
      var R1 = 0x2a1a3a, R2 = 0x1a1024, R3 = 0x3a2652, EY = 0xc87020, i;   // 第 13 块 W12：眼睛 0xff9a2a × 3.0 在亮度里截成了黄色，换深一点的橙 × 1.25
      P = [
        cy(0.2, 0.42, 0.86, [0, -0.17, 0], R1, 'cloth', 8, null, [1, 1, 0.85]),
        sp(0.26, [0, 0.2, -0.01], R3, 'cloth', [1.25, 0.62, 0.95], [7, 4])
      ];
      var head = jt(CH.head, [0, 0.28, 0.02], 1.2), hc = [0, 0.43, 0.04], hr = [0.2, 0.22, 0.2];
      P = P.concat(on(head, [
        sp(0.2, hc, R1, 'cloth', [1, 1.1, 1], [7, 5]),
        cn(0.2, 0.42, [0, 0.58, -0.1], R1, 'cloth', 5, [-0.6, 0, 0]),
        sp(0.135, [0, 0.41, fz(hc, hr, 0, 0.41) - 0.1], 0x06040a, 'plain', [1, 1.2, 0.5], [6, 4])
      ].concat([cy(0.15, 0.15, 0.035, [0, 0.42, fz(hc, hr, 0, 0.42) - 0.045], 0x3e2858, 'cloth', 8, [Math.PI / 2 - 0.12, 0, 0], [1, 1.25, 1])])
       .concat(lit(1.25, sym([oc(0.058, [0.062, 0.43, fz(hc, hr, 0.062, 0.43) - 0.02], EY, 'plain', [1.5, 0.85, 0.6], [0, 0, -0.2])])))));
      // 两只影子手：袖子 + 三根爪
      P = P.concat(limbs(CH.sho, [0.27, 0.18, 0.02], [cy(0.07, 0.11, 0.36, [0.31, 0.02, 0.08], R1, 'cloth', 5, [0.5, 0, 0.2])], CH.elb, [0.34, -0.12, 0.18],
        [oc(0.065, [0.35, -0.18, 0.24], R2, 'plain'),
         cn(0.02, 0.14, [0.31, -0.26, 0.29], 0x0e0814, 'plain', 3, [2.6, 0, -0.3]), cn(0.02, 0.15, [0.35, -0.27, 0.3], 0x0e0814, 'plain', 3, [2.6, 0, 0]), cn(0.02, 0.14, [0.39, -0.26, 0.29], 0x0e0814, 'plain', 3, [2.6, 0, 0.3])], 0.7, 0.8));
      // 下摆的碎布 + 散开的黑烟（摇摆通道）
      var sway = jt(CH.sway, [0, -0.5, 0], 1.6);
      for (i = 0; i < 6; i++) { var an = i / 6 * TAU + 0.3; P.push(on(sway, [cn(0.14, 0.36, [Math.sin(an) * 0.36, -0.74, Math.cos(an) * 0.32], i % 2 ? R2 : R1, 'cloth', 3, [Math.PI, 0, 0])])[0]); }
      for (i = 0; i < 3; i++) { var a3 = i / 3 * TAU + 0.9; P.push(on(sway, [cn(0.1, 0.3, [Math.sin(a3) * 0.18, -0.85, Math.cos(a3) * 0.16], 0x0e0814, 'plain', 3, [Math.PI, 0, 0])])[0]); }
    })();
    ENEMY_MODELS.nightshade = fin(P, 1, { hover: 0.2, flap: 4 });
    // ---- 黄沙古道的沙洞蝙蝠、沉钟古城的石像鬼 ----
    // 沙洞蝙蝠：棕色的洞穴蝙蝠，毛茸茸的身体和浅色的肚皮，一对很大的尖耳朵、短鼻子、两颗小尖牙、琥珀色的眼睛；
    // 翅膀是一层皮膜，每边三根指骨撑开（指骨之间的膜往里凹），脚缩在肚子下面
    (function () {
      var F = 0x6a4a32, F2 = 0x4a3020, BN = 0x3a2a20, MB = 0x5a3a28;
      b = [0, 0.2, 0.1]; c = [0.15, 0.1425, 0.1425];
      P = [
        sp(0.2, [0, -0.02, -0.02], F, 'fur', [0.95, 1.15, 0.9], [7, 5]),
        sp(0.13, [0, -0.06, 0.1], 0x8a6a4a, 'fur', [1, 1.2, 0.6], [5, 3]),
        sp(0.15, b, F, 'fur', [1, 0.95, 0.95], [6, 5]),
        bx([0.1, 0.07, 0.08], [0, 0.16, fz(b, c, 0, 0.16) + 0.01], 0x3a2418, 'plain')
      ].concat(sym([
        cn(0.08, 0.28, [0.09, 0.4, 0.07], F2, 'fur', 4, [-0.12, 0, -0.32], [1, 1, 0.5]),
        cn(0.05, 0.19, [0.088, 0.385, 0.093], 0x9a6a5a, 'skin', 3, [-0.12, 0, -0.32], [1, 1, 0.3]),
        cn(0.015, 0.06, [0.03, 0.11, fz(b, c, 0.03, 0.11) + 0.02], 0xf0e8d0, 'bone', 3, [Math.PI, 0, 0]),
        bx([0.05, 0.05, 0.06], [0.07, -0.25, 0.0], F2, 'fur')
      ])).concat(lit(2.4, sym([oc(0.034, [0.06, 0.23, fz(b, c, 0.06, 0.23) - 0.005], 0xffb040, 'plain')])));
      // 翅膀（左边写，limbs 镜像出右边）：上臂到腕、腕上三根指骨，指骨之间是往里凹的皮膜
      var sh = [0.12, 0.08, -0.02], wr = [0.42, 0.2, -0.05], f1 = [0.9, 0.17, -0.1], f2 = [0.8, -0.08, -0.2], f3 = [0.54, -0.2, -0.22], bl = [0.1, -0.16, -0.06];
      var mid = function (p, q, k) { return [lerp(p[0], q[0], 0.5) + (wr[0] - lerp(p[0], q[0], 0.5)) * k, lerp(p[1], q[1], 0.5) + (wr[1] - lerp(p[1], q[1], 0.5)) * k, lerp(p[2], q[2], 0.5)]; };
      var m12 = mid(f1, f2, 0.3), m23 = mid(f2, f3, 0.3), m3b = mid(f3, bl, 0.22);
      P = P.concat(limbs(CH.wing, sh, [
        sgB(sh, wr, 0.035, BN, 'plain'),
        sgB(wr, f1, 0.024, BN, 'plain'), sgB(wr, f2, 0.022, BN, 'plain'), sgB(wr, f3, 0.022, BN, 'plain'),
        cn(0.02, 0.07, [wr[0] + 0.02, wr[1] + 0.05, wr[2] + 0.02], 0xd8c8a8, 'bone', 3, [0, 0, -0.4]),
        tri(sh, wr, bl, MB, 'cloth'),
        tri(wr, f1, m12, MB, 'cloth'), tri(wr, m12, f2, 0x4a3020, 'cloth'),
        tri(wr, f2, m23, MB, 'cloth'), tri(wr, m23, f3, 0x4a3020, 'cloth'),
        tri(wr, f3, m3b, MB, 'cloth'), tri(wr, m3b, bl, 0x4a3020, 'cloth')
      ], 0, null, null, 1.2));
    })();
    ENEMY_MODELS.bat = fin(mv(P, 0, -0.09, 0), 1, { hover: 0.2, flap: 14 });
    // 石像鬼：弓着背的石头小恶魔。灰色的石头身体，两只弯弯的小角、尖耳朵、龇牙咧嘴的短嘴、琥珀色的眼睛，
    // 一对棱角分明的石板翅膀（上面三根石肋，慢慢地扇），爪子缩在身下，尾巴尖是一片铲形石头
    (function () {
      var S = 0x8a8a84, S2 = 0x6a6a66, S3 = 0x4a4a48, T = 'en_rock';
      var hc = [0, 0.27, 0.2], hr = [0.158, 0.143, 0.15];
      P = [
        sp(0.24, [0, 0.0, 0], S, T, [1.05, 1.0, 0.85], [6, 5], [0.35, 0, 0]),
        sp(0.17, [0, -0.2, 0.02], S2, T, [1.1, 0.8, 0.9], [5, 3])
      ];
      var head = jt(CH.head, [0, 0.18, 0.12], 1.2);
      P = P.concat(on(head, [
        sp(0.15, hc, S, T, [1.05, 0.95, 1], [6, 4]),
        bx([0.17, 0.09, 0.11], [0, 0.205, 0.33], S2, T),
        bx([0.13, 0.03, 0.04], [0, 0.175, 0.385], 0x1a1410, 'plain')
      ].concat(sym([
        cn(0.045, 0.15, [0.075, 0.42, 0.17], S3, T, 4, [-0.45, 0, -0.42]),
        cn(0.028, 0.13, [0.115, 0.505, 0.1], S3, T, 4, [-1.25, 0, -0.32]),
        cn(0.045, 0.15, [0.16, 0.3, 0.15], S, T, 3, [0, 0, -1.3], [1, 1, 0.5]),
        cn(0.014, 0.06, [0.04, 0.155, 0.39], 0xe8e0d0, 'bone', 3, [Math.PI, 0, 0])
      ])).concat(lit(2.4, sym([bx([0.05, 0.03, 0.02], [0.06, 0.285, fz(hc, hr, 0.06, 0.285) + 0.004], 0xffb040, 'plain', [0, 0, -0.3])])))));
      // 胳膊：一节上臂一节小臂 + 爪
      P = P.concat(limbs(CH.sho, [0.2, 0.08, 0.06], [sgB([0.2, 0.08, 0.06], [0.27, -0.1, 0.16], 0.07, S, T)], CH.elb, [0.27, -0.1, 0.16],
        [sgB([0.27, -0.1, 0.16], [0.22, -0.22, 0.27], 0.06, S2, T), cn(0.03, 0.1, [0.22, -0.28, 0.3], S3, T, 3, [2.6, 0, 0])], 0.6, 0.6));
      // 缩着的腿：大腿 + 带爪的脚
      P = P.concat(sym([
        sgB([0.12, -0.22, 0.0], [0.17, -0.38, 0.16], 0.09, S2, T),
        bx([0.1, 0.06, 0.16], [0.16, -0.44, 0.13], S3, T),
        cn(0.025, 0.08, [0.16, -0.45, 0.24], 0xd8d0c0, 'bone', 3, [Math.PI / 2, 0, 0])
      ]));
      // 石板翅膀（翅膀通道，扇得慢）
      // 翅膀：前缘一根粗石骨到翼尖，两根石肋撑着直边的石板（不是蝙蝠那种往里凹的皮膜）
      var ws = [0.12, 0.14, -0.14], we = [0.44, 0.46, -0.24], wt = [0.86, 0.66, -0.34], r1 = [0.9, 0.16, -0.42], r2 = [0.62, -0.06, -0.4], r3 = [0.28, -0.08, -0.28];
      P = P.concat(limbs(CH.wing, ws, [
        sgB(ws, we, 0.065, S3, T), sgB(we, wt, 0.05, S3, T),
        sgB(we, r1, 0.035, S3, T), sgB(we, r2, 0.035, S3, T),
        tri(ws, we, r3, S2, T), tri(we, r3, r2, S, T), tri(we, r2, r1, S2, T), tri(we, r1, wt, S, T)
      ], 0, null, null, 0.9));
      // 尾巴 + 铲形尾尖
      P = P.concat(on(jt(CH.tail, [0, -0.24, -0.16], 1.4), [
        sgB([0, -0.24, -0.16], [0, -0.4, -0.44], 0.05, S2, T),
        sgB([0, -0.4, -0.44], [0, -0.33, -0.66], 0.04, S2, T),
        oc(0.09, [0, -0.3, -0.75], S3, T, [1, 0.3, 1.5], [0.3, 0, 0])
      ]));
    })();
    ENEMY_MODELS.gargoyle = fin(mv(P, 0, -0.13, 0), 1, { hover: 0.2, flap: 10 });
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

    // ---- 小 Boss ----
    // 幽魂冠军、沙漏王、百年沉钟的正式模型在 models_bosses.js（它把这三行的占位换掉）；另外五个小 Boss 在 data_enemies_more.js
    ENEMY_MODELS.ghostchamp = fin(ghostP({ c: 0xb8d8ff, glow: 1.3 }).p, 1.6, { hover: 0.18, flap: 4 });

    // ---- 关卡 Boss ----
    // 千年橡王：大树人，树干身体、树根腿、树枝手臂、一团团像素树冠、发光黄眼、树干裂缝里透出琥珀色的光
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
      .concat(on(jt(CH.head, [0, 4.0, 0], 1.5), lit(1.8, [sp(0.12, [-0.7, 5.3, 0.9], 0xff5a7a, 'plain', [1, 0.6, 1], [5, 3]), sp(0.11, [0.9, 4.9, 1.0], 0xffd84a, 'plain', [1, 0.6, 1], [5, 3]), sp(0.1, [0.1, 6.35, 0.75], 0xff5a7a, 'plain', [1, 0.6, 1], [5, 3])])))
      // 树冠顶上一圈橡子（不是金冠）：五颗，橡子帽朝上，和树冠一起晃
      .concat(on(jt(CH.head, [0, 4.0, 0], 1.5), [0, 1, 2, 3, 4].reduce(function (acc, k) {
        var an = k / 5 * TAU + 0.4, x = Math.sin(an) * 0.7, z = -0.1 + Math.cos(an) * 0.62, y = 6.3 + Math.cos(an * 2) * 0.08;
        return acc.concat([oc(0.24, [x, y, z], 0xc8902a, 'wood', [1, 1.3, 1], [0, an, 0]), ['tet', [0.29], [x, y + 0.24, z], 0x6a4a2a, [0.62, an, 0.78], [1.1, 0.55, 1.1], 'bark']]);
      }, [])));
    ENEMY_MODELS.oakking = fin(P, 1, { hip: 1.4, lean: 0.04, roll: 0.06 });
    // 沙漏王、百年沉钟：正式模型在 models_bosses.js；这里只放一个不会出错的占位（没有那个文件时也能跑）
    ENEMY_MODELS.hourglass = fin([cy(1.1, 1.1, 4.2, [0, 2.1, 0], 0xb08a3a, 'gold', 8)], 1, { hip: 0.95, lean: 0, roll: 0 });
    ENEMY_MODELS.sunkenbell = fin([cy(1.2, 1.9, 3.6, [0, 1.8, 0], 0x8a6a3a, 'metal', 10)], 1, { hip: 0.98, lean: 0, roll: 0 });
  })();

  // interact.js 也用这些小工具
  ENEMY_KIT = { bx: bx, cy: cy, sp: sp, cn: cn, ic: ic, oc: oc, lit: lit, sym: sym, sgB: sgB, sgC: sgC,
    // data_enemies_more.js 的新敌人也用同一套关节、身体模板和收尾缩放
    CH: CH, jt: jt, on: on, mir: mir, mv: mv, scl: scl, fin: fin, fz: fz, limbs: limbs, pair: pair, tri: tri,
    skel: skel, gob: gob, human: human, golem: golem, scorp: scorp, ghostP: ghostP };
})();

// E(名字, 血量, 接触伤害, 速度, 碰撞半径, 经验, 粒子颜色, 模型, 额外)；速度写的是表上的数，E 里统一 × 0.8
// 额外字段：
//   role 普通敌人的定位（午夜钟声按它挑「普通敌人」）；undead 亡灵（成就、骑士古墓、召唤亡灵用）；overtime 只在午夜钟声里出现（不进刷怪池）
//   boss / miniboss + attacks 招式表（第二阶段的招式表在 content.js 的 Content.PHASE2）；
//   summonId 召唤谁（一个 id、一组 id，或 'undead' = 本关刷怪池里的亡灵普通敌人），summonN 召唤几只（默认 8）；
//   zone 毒液喷射落地留下的地面效果（默认 'poison'，'spore' = 孢子云）；shield 正面的飞弹被盾挡住
//   shotModel 远程敌人飞出去的东西的模型（'spear' 短矛、'stone' 石子，enemies.js 画；不写就是红色光球），只是外观
// 定位（role）和它在表上的倍数（血量 × 伤害 × 速度，只是说明，数值已经按它算好写进每一行）：
//   grunt 杂兵 1.0 × 1.05 × 0.9 · hopper 跳跳 0.9 × 0.75 × 1.0 · runner 快腿 1.25 × 0.9 × 1.4 · flyer 飞行 1.15 × 0.95 × 1.17
//   swarm 成群 0.75 × 0.7 × 1.3 · ranged 远程 1.9 × 1.15 × 0.8 · mid 中坚 2.3 × 1.6 × 0.85 · charger 冲锋 3.2 × 1.65 × 1.03
//   heavy 重甲 4.3 × 1.9 × 0.75 · elite 精锐 6.2 × 2.15 × 0.77 · bomber 自爆 2.0 × 2.2 × 1.05
ENEMIES = {
  // ---- 迷雾森林 ----（林中野猪那一行在 data_enemies_more.js）
  goblin: E('哥布林小兵', 8, 12, 5.6, 0.5, 1, 0x6ab83a, ENEMY_MODELS.goblin, { role: 'grunt' }),
  gobspear: E('哥布林投矛手', 13, 11, 5.2, 0.55, 2, 0x4a9a2a, ENEMY_MODELS.gobspear, { role: 'ranged', behavior: 'shoot', shootCd: 4.2, shotSpeed: 15, stopThrow: 0.4, shotModel: 'spear' }),   // 停下投矛：出手前站定 0.4 秒；飞出去的是一根短矛（enemies.js）；第 13 块：3.2 → 4.2 秒一投、伤害 14 → 11（第 1 关普通机器人的伤一半来自短矛）
  slime: E('史莱姆', 7, 9, 6.0, 0.55, 1, 0x5ad9a0, ENEMY_MODELS.slime, { role: 'hopper', hop: true }),
  wasp: E('林地胡蜂', 7, 11, 7.2, 0.45, 1, 0xf08a2a, ENEMY_MODELS.wasp, { role: 'flyer', flyer: true }),
  kegimp: E('火药桶精', 16, 26, 6.4, 0.6, 2, 0xd94a2a, ENEMY_MODELS.kegimp, { role: 'bomber', behavior: 'explode' }),
  // ---- 黄沙古道 ----（蜥人甩石手那一行在 data_enemies_more.js）
  mummy: E('木乃伊', 11, 12, 5.0, 0.55, 1, 0xe0d6b8, ENEMY_MODELS.mummy, { role: 'grunt', undead: true }),
  pallbearer: E('抬棺木乃伊', 50, 26, 4.6, 0.85, 4, 0xc8bc98, ENEMY_MODELS.pallbearer, { role: 'heavy', undead: true }),
  scarab: E('金甲虫', 6, 8, 7.8, 0.4, 1, 0x9ac040, ENEMY_MODELS.scarab, { role: 'swarm' }),
  bat: E('沙洞蝙蝠', 9, 10, 7.6, 0.45, 1, 0x8a6a4a, ENEMY_MODELS.bat, { role: 'flyer', flyer: true }),
  // ---- 沉钟古城 ----
  zombie: E('僵尸', 14, 16, 5.8, 0.55, 1, 0x7aa07a, ENEMY_MODELS.zombie, { role: 'grunt', undead: true }),
  // 第 13 块 D-C13-10：第 3 关太难，游魂、骷髅兵、钟楼守卫的伤害都 −15 %（原来 11 / 18 / 23）
  skeleton: E('骷髅兵', 18, 15.3, 5.2, 0.55, 2, 0xf3ead0, ENEMY_MODELS.skeleton, { role: 'mid', undead: true }),
  skelguard: E('钟楼守卫', 32, 19.55, 4.4, 0.65, 3, 0x9aa3ad, ENEMY_MODELS.skelguard, { role: 'heavy', undead: true }),
  ghoul: E('食尸鬼', 12, 13, 8.2, 0.5, 1, 0x8a9a7a, ENEMY_MODELS.ghoul, { role: 'runner', undead: true }),
  ghost: E('游魂', 12, 9.35, 6.3, 0.55, 1, 0xd8e8ff, ENEMY_MODELS.ghost, { role: 'flyer', flyer: true, undead: true }),
  // 石像鬼是石头做的，不算亡灵
  gargoyle: E('石像鬼', 26, 18, 6.8, 0.65, 3, 0x8a8a84, ENEMY_MODELS.gargoyle, { role: 'flyer', flyer: true }),
  // ---- 午夜钟声的精英 ----（只在午夜钟声里出现：每 30 秒一只，出生时是精英；模型自己是黑紫色的）
  nightshade: E('夜魇', 90, 28, 9.0, 0.6, 2, 0x6a3a9a, ENEMY_MODELS.nightshade, { role: 'elite', flyer: true, undead: true, overtime: true, cap: 40 }),
  // ---- 小 Boss（关卡进度 0.3 / 0.55 / 0.8 出现） ----（另外五个那几行在 data_enemies_more.js）
  ghostchamp: E('幽魂冠军', 330, 40, 6.4, 1.5, 40, 0xb8d8ff, ENEMY_MODELS.ghostchamp, { miniboss: true, flyer: true, undead: true, attacks: ['volley', 'charge', 'phasedash'] }),
  // ---- 关卡首领 ----
  oakking: E('千年橡王', 9600, 42, 6.6, 2.5, 0, 0x6a4a2a, ENEMY_MODELS.oakking, { boss: true, attacks: ['rootgrid', 'seedbomb', 'slam', 'summon'], summonId: ['wolf', 'goblin'], summonN: 4 }),
  hourglass: E('沙漏王', 8600, 42, 6.8, 2.3, 0, 0xd9b43a, ENEMY_MODELS.hourglass, { boss: true, attacks: ['orbs', 'charge', 'sunbeam', 'sandwall', 'quakeline'] }),
  sunkenbell: E('百年沉钟', 9800, 46, 5.8, 2.4, 0, 0x7a9a6a, ENEMY_MODELS.sunkenbell, { boss: true, undead: true, attacks: ['slam', 'summon', 'orbs', 'bonerain', 'necrowave'], summonId: 'undead' })
};
