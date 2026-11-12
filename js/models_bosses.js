'use strict';
// ============================================================
//  第 10 块：两位关卡首领和幽魂冠军的正式模型
//  · 沙漏王：两个发条髋轴夹着一只黄铜玻璃沙漏（像镜框里的镜子），四条弯的黄铜蜘蛛腿、两只钳子手；
//    沙子跟着血量从上往下漏，第二阶段沙漏绕轴翻转 180°，沙子倒着流；冲锋时整只沙漏翻滚
//  · 百年沉钟：4 米高、裂了缝的青铜钟，裂缝里透出暖光、铜绿往下淌，肩上挂着断链；
//    钟口下面挂着最后一任敲钟人的鬼魂（两只灯笼眼、双手拉着钟锤的绳子）；走路是一跳一跳的，每次落地“当”一声
//  · 幽魂冠军：半透明的骑士上半身（羽饰大头盔、胸甲、破罩袍），披风下摆化成蓝白的烟，手里一截断骑枪
//  · Bosses：首领身上半透明 / 会单独转的部分（玻璃、沙子、框架、鬼魂）用池子里的几个网格叠在实例上，
//    每帧在 look 里跟着实例摆好；这一帧没画到的就藏起来放回池子（死了、清场、换关、回菜单都算）
//  加载顺序：evolution.js 之后（新贴图排在已有的 92 张后面）、passives.js 之前；
//  data_enemies.js 里这三种的占位模型在这里换掉（ENEMY_MODELS 和 ENEMIES 的 parts 都换）
//  规矩：贴图函数不用随机数（纯整数哈希）；look 里不用 Math.random、不新建对象；网格和材质只在 Enemies.init 时建一次
// ============================================================
var Bosses = { frame: 0, pool: {}, all: {}, POOL: 6, ready: false };

(function () {
  // ---------------- 新贴图（16×16 灰度，乘顶点色；排在 holystone 后面） ----------------
  function h(x, y, s) {
    var n = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  }
  Bosses.hash = h;
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就用默认贴图 */ } };
  // 黄铜：上下两条刻线夹着一排铆钉，中间是拉丝的铜面
  add('c10_brass', function (x, y) {
    if ((y === 3 || y === 12) && x % 4 === 1) return 250;
    if (y === 2 || y === 4 || y === 11 || y === 13) return 140;
    if (y === 3 || y === 12) return 176;
    var v = 200 + (h(x, y, 11) - 0.5) * 24;
    if ((x + (y >> 1)) % 7 === 0) v -= 10;   // 拉丝
    return v;
  });
  // 青铜：竖着往下淌的锈迹（颜色在零件上）、几个小坑
  add('c10_patina', function (x, y) {
    var v = 214 + (h(x, y, 23) - 0.5) * 16;
    var len = 3 + Math.floor(h(x, 0, 29) * 12);
    if (h(x, 1, 31) < 0.3 && y < len) v = y === len - 1 ? 172 : 190 - y;
    if (h(x, y, 37) < 0.04) v = 162;
    return v;
  });
  // 玻璃：几乎是白的，两道斜着的高光
  add('c10_glass', function (x, y) {
    var d = (x + y) % 16;
    if (d === 3 || d === 4) return 255;
    if (d === 10) return 248;
    return 226 + (h(x, y, 41) - 0.5) * 8 - (x === 0 || x === 15 ? 14 : 0);
  });

  // ---------------- 旋转体（自己生成三角面：贴图每圈重复 rep 次、不跨接缝） ----------------
  // prof：[[半径, 高], ...]，外表面要从下往上写（法线朝外）；rep 一圈贴几次图
  function lathe(prof, seg, rep, vrep) {
    var pos = [], nor = [], uv = [], i, j;
    rep = rep || 1; vrep = vrep || 1;
    for (i = 0; i + 1 < prof.length; i++) {
      var r0 = prof[i][0], y0 = prof[i][1], r1 = prof[i + 1][0], y1 = prof[i + 1][1];
      var dr = r1 - r0, dy = y1 - y0, L = Math.sqrt(dr * dr + dy * dy) || 1, nr = dy / L, ny = -dr / L;
      var v0 = (i % vrep) / vrep, v1 = v0 + 1 / vrep;
      for (j = 0; j < seg; j++) {
        var a0 = j / seg * TAU, a1 = (j + 1) / seg * TAU, s0 = Math.sin(a0), c0 = Math.cos(a0), s1 = Math.sin(a1), c1 = Math.cos(a1);
        var u0 = (j % rep) / rep, u1 = u0 + 1 / rep;
        var A = [s0 * r0, y0, c0 * r0], B = [s1 * r0, y0, c1 * r0], C = [s1 * r1, y1, c1 * r1], D = [s0 * r1, y1, c0 * r1];
        var NA = [s0 * nr, ny, c0 * nr], NB = [s1 * nr, ny, c1 * nr];
        pos.push.apply(pos, A.concat(B, D, B, C, D));
        nor.push.apply(nor, NA.concat(NB, NA, NB, NB, NA));
        uv.push(u0, v0, u1, v0, u0, v1, u1, v0, u1, v1, u0, v1);
      }
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return g;
  }
  Bosses.lathe = lathe;

  // 钟的轮廓（半径, 高），从钟顶往下（计划 §6.1）；BELL_IN 是钟里面（从里面的顶往下到钟口内沿）
  var BELL = [[0.12, 3.25], [0.9, 3.1], [1.15, 2.6], [1.2, 1.6], [1.45, 0.75], [1.85, 0.25], [1.95, 0.0], [1.7, 0.08]];
  var BELL_IN = [[0, 2.55], [1.25, 1.0]];
  // 外轮廓在高 y 处的半径（插值）
  function bellR(y) {
    for (var i = 0; i + 1 < 7; i++) {
      var a = BELL[i], b = BELL[i + 1];
      if (y <= a[1] && y >= b[1]) return lerp(a[0], b[0], (a[1] - y) / ((a[1] - b[1]) || 1));
    }
    return y > 3.25 ? 0.12 : 1.95;
  }
  Bosses.bellR = bellR;
  // 青铜钟：[缩放, 段数, 方式, y1, y2, 外扩]；方式 0 = 钟身（里外两层），1 = 贴着钟身的一圈箍（y1~y2，往外扩 push）
  MODEL.extraGeo.c10Bell = function (s) {
    var k = s[0] || 1, seg = s[1] || 16, mode = s[2] || 0, prof, i;
    if (mode === 1) {
      var y1 = s[3], y2 = s[4], pu = 1 + (s[5] || 0.03);
      prof = [[bellR(y1) * pu, y1], [bellR(y2) * pu, y2]];
      if (!s[6]) prof.push([bellR(y2) * 0.99, y2 + 0.01]);
    } else {
      prof = BELL_IN.slice();
      for (i = BELL.length - 1; i >= 1; i--) prof.push(BELL[i]);
      prof.push([0, 3.26]);
    }
    prof = prof.map(function (p) { return [p[0] * k, p[1] * k]; });
    return lathe(prof, seg, mode === 1 ? 8 : 4, mode === 1 ? 1 : 2);
  };
  // 沙漏的玻璃泡：从瓶颈往外写（[段数, 外扩]）；也给沙子的模板用
  var BULB = [[0.13, 0.05], [0.75, 0.55], [0.93, 1.15], [0.7, 1.76]];
  MODEL.extraGeo.c10Bulb = function (s) { var k = 1 + (s[1] || 0); return lathe(BULB.map(function (p) { return [p[0] * k, p[1]]; }), s[0] || 8, 2, 1); };

  // ============================================================
  //  零件列表（ENEMY_KIT：[类型, 尺寸, 位置, 颜色, 旋转, 缩放, 贴图, 关节, 发光]）
  // ============================================================
  var K = ENEMY_KIT, bx = K.bx, cy = K.cy, sp = K.sp, cn = K.cn, ic = K.ic, oc = K.oc, lit = K.lit, sym = K.sym, sgB = K.sgB, sgC = K.sgC;
  var CH = K.CH, jt = K.jt, on = K.on, fin = K.fin, limbs = K.limbs;
  // 不带盖的管子（两头有关节挡着）：sgC 一样的写法
  function tube(a, b, r1, r2, c, t, n) { var q = sgC(a, b, r1, r2, c, t, n); q[0] = 'ch_tube'; return q; }
  var BR = 0xd8b050, BM = 0xb08a3a, BD = 0x7a5a24;   // 黄铜 亮 / 中 / 暗

  // ---------------- 沙漏王（实例部分：髋轴、腿、钳子手；沙漏本身是叠加的） ----------------
  var HY = 2.3, HX = 1.35;
  Bosses.HG = { pivotY: HY, hubX: HX, neck: 0.05, bulb: 1.76, heap: 0.62 };
  var P = [];
  // 两个髋轴：鼓形轴座 + 外侧一个齿轮 + 一盏琥珀色的小表灯
  P = P.concat(sym([
    cy(0.42, 0.42, 0.36, [HX, HY, 0], BM, 'c10_brass', 10, [0, 0, Math.PI / 2]),
    cy(0.3, 0.3, 0.1, [HX + 0.22, HY, 0], BD, 'metal', 8, [0, 0, Math.PI / 2]),
    ['fxTeeth', [10, 0.3, 0.05, -0.13, 0.2], [HX + 0.22, HY, 0], BR, [0, 0, -Math.PI / 2], null, 'gold'],
    cy(0.1, 0.1, 0.08, [HX + 0.3, HY, 0], BR, 'gold', 6, [0, 0, Math.PI / 2])
  ]));
  P = P.concat(lit(2.4, sym([oc(0.075, [HX, HY + 0.3, 0.34], 0xffc860, 'plain')])));
  // 四条蜘蛛腿：髋轴 → 高高的膝盖 → 脚垫；左前和右后一组、右前和左后一组（腿通道 15 / 16 左右扫）
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (q) {
    var sx = q[0], sz = q[1], j = jt(CH.leg + ((sx * sz) > 0 ? 0 : 1), [sx * HX, HY, 0], 0.55);
    var hip = [sx * (HX + 0.12), HY + 0.12, sz * 0.22], knee = [sx * 2.2, 3.0, sz * 1.0], foot = [sx * 2.5, 0.1, sz * 1.42];
    P = P.concat(on(j, [
      tube(hip, knee, 0.11, 0.09, BM, 'c10_brass', 5),
      oc(0.15, knee, BD, 'metal'),
      cn(0.07, 0.3, [knee[0] + sx * 0.04, knee[1] + 0.2, knee[2]], BR, 'gold', 4, [0, 0, -sx * 0.25]),
      tube(knee, [foot[0], foot[1] + 0.12, foot[2]], 0.085, 0.06, BM, 'c10_brass', 5),
      cy(0.16, 0.22, 0.14, foot, BD, 'metal', 6)
    ]));
  });
  // 两只钳子手（肩、肘通道小幅摆动）
  var arm = {};
  P = P.concat(limbs(CH.sho, [HX - 0.05, HY - 0.25, 0.25],
    [tube([HX - 0.05, HY - 0.25, 0.25], [1.9, 1.8, 0.4], 0.08, 0.07, BM, 'c10_brass', 5)],
    CH.elb, [1.9, 1.8, 0.4],
    [oc(0.11, [1.9, 1.8, 0.4], BD, 'metal'), tube([1.9, 1.8, 0.4], [1.62, 1.55, 1.05], 0.07, 0.06, BM, 'c10_brass', 5),
     bx([0.2, 0.1, 0.12], [1.6, 1.53, 1.1], BD, 'metal'),
     bx([0.045, 0.06, 0.42], [1.67, 1.5, 1.34], BR, 'gold', [0.15, 0.32, 0]), bx([0.045, 0.06, 0.42], [1.53, 1.5, 1.34], BR, 'gold', [0.15, -0.32, 0])],
    0.35, 0.4, arm));
  P = fin(P, 1, { hip: 0.3, lean: 0, roll: 0.03, bob: 0.05, stride: 1.6 });
  ENEMY_MODELS.hourglass = P;
  if (ENEMIES.hourglass) ENEMIES.hourglass.parts = P;

  // 沙漏王的叠加框架（不透明，绕髋轴转；本地坐标原点是轴心）
  var FRAME = [];
  [1, -1].forEach(function (s) {
    FRAME.push(cy(1.06, 1.12, 0.16, [0, s * 1.84, 0], BM, 'c10_brass', 16));
    FRAME.push(cy(s > 0 ? 0.72 : 0.86, s > 0 ? 0.86 : 0.72, 0.1, [0, s * 1.97, 0], BR, 'c10_brass', 8));
    FRAME.push(ic(s > 0 ? 0.17 : 0.14, [0, s * 2.1, 0], BR, 'gold'));
  });
  FRAME.push(['fxTeeth', [16, 1.1, 0.06, -0.18, 0.12], [0, 1.82, 0], BR, null, null, 'gold']);
  FRAME.push(cn(0.06, 0.28, [0, 2.33, 0], BR, 'gold', 4));
  for (var i = 0; i < 4; i++) {
    var a = (i + 0.5) / 4 * TAU, px = Math.sin(a) * 1.0, pz = Math.cos(a) * 1.0;
    FRAME.push(['ch_tube', [0.055, 0.055, 3.52, 5], [px, 0, pz], BD, null, null, 'metal']);
    FRAME.push(oc(0.11, [px, 0.62, pz], BR, 'gold', [1, 1.6, 1]));
    FRAME.push(oc(0.11, [px, -0.62, pz], BR, 'gold', [1, 1.6, 1]));
  }
  FRAME.push(['torus', [0.17, 0.06, 3, 6], [0, 0, 0], BR, [Math.PI / 2, 0, 0], null, 'gold']);
  FRAME = FRAME.concat(sym([
    ['ch_tube', [0.07, 0.07, 1.0, 6], [0.66, 0, 0], BD, [0, 0, Math.PI / 2], null, 'metal'],
    cy(0.13, 0.13, 0.1, [1.12, 0, 0], BR, 'gold', 6, [0, 0, Math.PI / 2])
  ]));
  Bosses.FRAME = FRAME;
  Bosses.GLASS = [['c10Bulb', [8, 0], [0, 0, 0], 0xffffff, null, null, 'c10_glass'], ['c10Bulb', [8, 0], [0, 0, 0], 0xffffff, [Math.PI, 0, 0], null, 'c10_glass']];

  // ---------------- 百年沉钟（实例部分） ----------------
  var BK = 0.8, B0 = 1.3;              // 钟的缩放、钟口离地高度（钟口抬高，底下的敲钟人整个看得见）
  var surf = function (a, y, off) { var r = bellR((y - B0) / BK) * BK + (off || 0.02); return [Math.sin(a) * r, y, Math.cos(a) * r]; };
  // 发光件：颜色 × lit 每个通道都不到 1（乘上第二阶段的染色也不会冲成白色，裂缝和眼睛一直是暖的）
  var BZ = 0x74502a, BZL = 0xa8763a, BZD = 0x5a3a1e, VG = 0x4e9a68, VGD = 0x3a7a5a, GLOW = 0xc8862e, EYE = 0xff9a2a;
  P = [
    ['c10Bell', [BK, 14, 0], [0, B0, 0], BZ, null, null, 'c10_patina'],
    ['c10Bell', [BK, 14, 1, 2.45, 2.6, 0.035, 1], [0, B0, 0], BZL, null, null, 'metal'],
    ['c10Bell', [BK, 14, 1, 0.14, 0.36, 0.03], [0, B0, 0], BZL, null, null, 'metal'],
    ['c10Bell', [BK, 14, 1, 1.05, 1.5, 0.025], [0, B0, 0], VG, null, null, 'c10_patina']
  ];
  // 铜绿往下淌：腰上的绿箍往钟口方向 6 道
  [0.55, 1.3, 2.2, 3.4, 4.3, 5.4].forEach(function (a, k) {
    var y1 = B0 + 1.05 * BK, y2 = B0 + (0.62 - (k % 3) * 0.14) * BK;
    P.push(sgB(surf(a, y1, 0.035), surf(a, y2, 0.03), 0.07 + (k % 2) * 0.03, VGD, 'c10_patina', 0.03));
  });
  // 发光的裂缝：正面从钟口锯齿着往上到肩膀，再分两个小岔
  // （高度按钟身比例写：0 = 钟口，3.26 = 钟顶）
  var by = function (t) { return B0 + t * BK; };
  var cr = [[0.06, 0.07], [-0.13, 0.63], [0.1, 1.19], [-0.07, 1.76], [0.09, 2.33], [0.0, 2.78]].map(function (q) { return surf(q[0], by(q[1]), 0.025); });
  var crack = [];
  for (i = 0; i + 1 < cr.length; i++) crack.push(sgB(cr[i], cr[i + 1], 0.085 - i * 0.008, GLOW, 'plain', 0.04));
  crack.push(sgB(cr[2], surf(0.32, by(1.42), 0.025), 0.05, GLOW, 'plain', 0.035));
  P = P.concat(lit(1.25, crack));
  // 第二阶段的裂缝：叠在原来那道上面的一层（略往外、略宽），颜色由 Bosses.bellLook 每帧给（琥珀色脉动）；
  // CRACK_PTS 是冒紫色余烬的几个点（模型坐标）
  var cr2 = [[0.06, 0.07], [-0.13, 0.63], [0.1, 1.19], [-0.07, 1.76], [0.09, 2.33], [0.0, 2.78]].map(function (q) { return surf(q[0], by(q[1]), 0.05); });
  var CRACK = [];
  for (i = 0; i + 1 < cr2.length; i++) CRACK.push(sgB(cr2[i], cr2[i + 1], 0.095 - i * 0.008, 0xffffff, 'plain', 0.045));
  CRACK.push(sgB(cr2[2], surf(0.32, by(1.42), 0.05), 0.06, 0xffffff, 'plain', 0.04));
  Bosses.CRACK = CRACK;
  Bosses.CRACK_PTS = [cr2[0], cr2[1], cr2[2], cr2[3], cr2[4]].map(function (q) { return [q[0], q[1], q[2] + 0.12]; });
  // 钟顶的吊环 + 一截断了的链子
  var TOP = B0 + 3.26 * BK;
  P.push(['torus', [0.22, 0.075, 3, 8], [0, TOP + 0.17, 0], BZD, [0, 0, 0], null, 'metal']);
  P.push(bx([0.05, 0.24, 0.13], [0.03, TOP + 0.43, 0], 0x4a4a52, 'ch_chain', [0, 0, 0.3]));
  // 肩上的断链：两边各两根（3 节、2 节），最后一节是断开的，跟着 sway 晃
  [[0.95, 3], [2.25, 2], [-0.95, 3], [-2.25, 2]].forEach(function (q) {
    var a = q[0], n = q[1], y0 = B0 + 2.5 * BK, r0 = bellR(2.5) * BK + 0.16;
    var x0 = Math.sin(a) * r0, z0 = Math.cos(a) * r0, j = jt(CH.sway, [x0, y0 + 0.1, z0], 1.2);
    var ring = [];
    for (var k = 0; k < n; k++) {
      var y = y0 - 0.05 - k * 0.24, last = k === n - 1;
      if (last) ring.push(['fxArc', [0.11, 0.032, 3, 4, 4.4], [x0, y, z0], 0x4a4a52, [0, a + (k % 2 ? Math.PI / 2 : 0), 2.2], null, 'ch_chain']);
      else if (k % 2 === 0) ring.push(['torus', [0.11, 0.032, 3, 5], [x0, y, z0], 0x4a4a52, [0, a, 0], null, 'ch_chain']);
      else ring.push(bx([0.05, 0.28, 0.12], [x0, y, z0], 0x55555e, 'ch_chain', [0, a, 0]));
    }
    P = P.concat(on(j, ring));
  });
  // 钟锤：从钟里吊下来的铁杆 + 铁球，拉绳一直垂到敲钟人手里（sway）
  var cj = jt(CH.sway, [0, B0 + 2.7 * BK, 0], 0.6);
  // 敲钟人在钟口底下、靠前一点（RZ；钟口外沿半径 1.56，以前 1.38 挂在钟口前沿上），双手举过兜帽攥着绳子；绳子从钟锤拉到手里，再从右手垂到腰边
  var RZ = 1.05, HEMP = 0xd8c08a;
  P = P.concat(on(cj, [
    ['ch_tube', [0.05, 0.05, 1.9, 5], [0, B0 + 1.4, 0], 0x3a3a40, null, null, 'metal'],
    oc(0.27, [0, B0 + 0.12, 0.0], 0x3a3a40, 'metal', [1, 1.15, 1]),
    sgB([0, B0 - 0.1, 0.16], [0, 1.22, RZ + 0.06], 0.07, HEMP, 'cloth', 0.07)
  ]));
  P.push(sgB([0.12, 1.19, RZ + 0.12], [0.45, 0.5, RZ + 0.42], 0.065, HEMP, 'cloth', 0.065));
  // 敲钟人的灯笼眼（不透明，远远就看得见）
  P = P.concat(lit(1.0, sym([oc(0.09, [0.09, 0.85, RZ + 0.33], EYE, 'plain', [1, 1.3, 0.55])])));
  P = fin(P, 1, { hip: 0.98, lean: 0, roll: 0, flap: 6 });
  ENEMY_MODELS.sunkenbell = P;
  if (ENEMIES.sunkenbell) ENEMIES.sunkenbell.parts = P;
  Bosses.BELL_K = { k: BK, rim: B0 };

  // 敲钟人的鬼魂（叠加，半透明，约 1.3 米）：尖兜帽（浅色）、脸上一块暗的、宽肩、两只举过头顶攥着绳子的长袖，
  // 身子往下收成一个尖、化成三缕烟；兜帽尖在钟口下面一点
  var GH = 0xdff2ff, GM = 0xa8dcff, GS = 0x6a8ab8;
  var RINGER = [
    sp(0.3, [0, 0.87, RZ - 0.03], GH, 'cloth', [1, 1.05, 1], [7, 4]),
    cn(0.28, 0.38, [0, 1.03, RZ - 0.1], GH, 'cloth', 5, [-0.3, 0, 0]),
    sp(0.21, [0, 0.84, RZ + 0.2], 0x1c3462, 'plain', [1, 1.15, 0.45], [5, 3]),
    ic(0.38, [0, 0.59, RZ], GM, 'cloth', [1.35, 0.5, 0.85]),
    cn(0.4, 0.62, [0, 0.34, RZ], GM, 'ct_ecto', 6, [Math.PI, 0, 0])
  ].concat(sym([
    tube([0.46, 0.63, RZ], [0.44, 1.1, RZ + 0.05], 0.125, 0.1, GM, 'cloth', 5),
    tube([0.44, 1.1, RZ + 0.05], [0.12, 1.2, RZ + 0.09], 0.1, 0.08, GM, 'cloth', 4),
    oc(0.095, [0.085, 1.2, RZ + 0.09], GH, 'ct_ecto')
  ])).concat([
    cn(0.14, 0.4, [0.24, 0.1, RZ - 0.06], GS, 'ct_ecto', 4, [Math.PI - 0.5, 0, 0.45]),
    cn(0.13, 0.36, [-0.25, 0.11, RZ - 0.04], GS, 'ct_ecto', 4, [Math.PI - 0.45, 0, -0.5]),
    cn(0.12, 0.36, [0, 0.02, RZ - 0.12], GS, 'ct_ecto', 4, [Math.PI - 0.6, 0, 0])
  ]);
  Bosses.RINGER = RINGER;
  Bosses.RING_PIVOT = [0, 0.86, RZ];

  // ---------------- 幽魂冠军（实例：半透明的骑士上半身） ----------------
  var HM = 0xb8d0e8, HM2 = 0xa8c0d8, HM3 = 0x8aa4c4, TB = 0x6a8ab8, CP = 0x5a78a8, SM = 0x9fd8ff;
  var hd = jt(CH.head, [0, 1.3, 0]);
  P = [
    // 腰甲、破罩袍（前后两片，下摆撕成两个尖）
    cy(0.3, 0.25, 0.26, [0, 0.3, 0], HM3, 'ch_plate', 7, null, [1, 1, 0.75]),
    bx([0.4, 0.78, 0.05], [0, 0.5, 0.23], TB, 'cloth', [0.05, 0, 0]),
    bx([0.4, 0.7, 0.05], [0, 0.55, -0.22], TB, 'cloth', [-0.05, 0, 0]),
    cn(0.1, 0.26, [0.1, 0.0, 0.25], TB, 'cloth', 4, [Math.PI, 0, 0]),
    cn(0.1, 0.2, [-0.11, 0.04, 0.25], TB, 'cloth', 4, [Math.PI, 0, 0]),
    bx([0.44, 0.07, 0.07], [0, 0.42, 0.27], 0x4a5a78, 'ch_leather'),
    // 胸甲 + 中间的脊线 + 护喉
    cy(0.33, 0.26, 0.6, [0, 0.95, 0], HM2, 'ch_plate', 8, null, [1, 1, 0.72]),
    bx([0.06, 0.52, 0.06], [0, 0.95, 0.22], 0xd8e8f8, 'metal', [-0.08, 0, 0]),
    cy(0.17, 0.23, 0.13, [0, 1.3, 0], HM3, 'metal', 5)
  ];
  // 肩甲（两层）
  P = P.concat(sym([ic(0.21, [0.4, 1.22, 0], HM, 'ch_plate', [1.1, 0.72, 1.1]), ic(0.18, [0.42, 1.11, 0], HM3, 'ch_plate', [1.05, 0.6, 1.05])]));
  // 大头盔（平顶）+ 发光的眼缝 + 往后弯的红羽饰
  P = P.concat(on(hd, [
    cy(0.19, 0.205, 0.36, [0, 1.55, 0.01], HM, 'metal', 8),
    cy(0.16, 0.19, 0.06, [0, 1.76, 0.01], HM2, 'metal', 7),
    bx([0.05, 0.3, 0.04], [0, 1.53, 0.2], HM2, 'metal'),
    cy(0.04, 0.05, 0.1, [0, 1.82, -0.02], HM3, 'metal', 5)
  ])).concat(on(hd, lit(2.6, [bx([0.3, 0.035, 0.03], [0, 1.6, 0.205], 0xdff2ff, 'plain')])))
    .concat(on(hd, lit(1.2, [
      cn(0.1, 0.42, [0, 2.02, -0.06], 0xc85a6a, 'ct_feather', 5, [-0.45, 0, 0]),
      cn(0.085, 0.4, [0, 1.95, -0.26], 0xb84a5a, 'ct_feather', 5, [-1.1, 0, 0]),
      cn(0.07, 0.34, [0, 1.8, -0.4], 0xa83e50, 'ct_feather', 5, [-1.75, 0, 0])
    ])));
  // 两条手臂；右手握着一截断骑枪（护手盘 + 断口三根木刺）
  arm = {};
  P = P.concat(limbs(CH.sho, [0.38, 1.18, 0],
    [tube([0.38, 1.18, 0], [0.43, 0.86, 0.08], 0.075, 0.065, HM2, 'ch_plate', 6)],
    CH.elb, [0.43, 0.86, 0.08],
    [tube([0.43, 0.86, 0.08], [0.41, 0.74, 0.4], 0.065, 0.055, HM2, 'ch_plate', 6), ic(0.085, [0.41, 0.74, 0.46], HM, 'metal', [1, 1, 1.2])],
    0.6, 0.6, arm));
  P = P.concat(on(arm.R.b, [
    sgC([-0.41, 0.72, 0.0], [-0.42, 0.86, 1.25], 0.05, 0.06, 0xc8d0d8, 'wood', 6),
    cn(0.24, 0.3, [-0.415, 0.76, 0.62], 0x8aa4c4, 'metal', 8, [Math.PI / 2, 0, 0]),
    cn(0.025, 0.2, [-0.38, 0.88, 1.33], 0xe0e8f0, 'wood', 3, [1.3, 0, -0.4]),
    cn(0.025, 0.24, [-0.44, 0.84, 1.35], 0xe0e8f0, 'wood', 3, [1.7, 0, 0.3]),
    cn(0.02, 0.18, [-0.42, 0.9, 1.32], 0xe0e8f0, 'wood', 3, [1.0, 0.3, 0])
  ]));
  // 披风（sway），下摆化成四缕蓝白的烟；身子底下的烟尾巴
  var cape = jt(CH.sway, [0, 1.2, -0.26], 1.2);
  P = P.concat(on(cape, [bx([0.68, 0.9, 0.05], [0, 0.76, -0.33], CP, 'cloth', [0.14, 0, 0])]))
    .concat(on(cape, lit(1.4, [-0.25, -0.08, 0.09, 0.25].map(function (x, k) { return cn(0.11, 0.34 + (k % 2) * 0.1, [x, 0.17 - (k % 2) * 0.04, -0.41], SM, 'ct_ecto', 4, [Math.PI + 0.15, 0, 0]); }))));
  var tail = jt(CH.sway, [0, 0.2, 0], 1);
  P = P.concat(on(tail, lit(1.4, [
    cn(0.26, 0.6, [0, -0.15, -0.02], SM, 'ct_ecto', 7, [Math.PI + 0.1, 0, 0]),
    cn(0.13, 0.45, [0.13, -0.3, -0.12], SM, 'ct_ecto', 4, [Math.PI + 0.3, 0, 0.3]),
    cn(0.12, 0.42, [-0.13, -0.28, -0.1], GS, 'ct_ecto', 4, [Math.PI + 0.3, 0, -0.3])
  ])));
  // 发光：除了眼缝、羽饰、烟（已经单独调过）都 × 1.3
  P.forEach(function (p) { if (!p[8]) p[8] = 1.3; });
  P = fin(P, 1.3, { hover: 0.18, flap: 4 });
  ENEMY_MODELS.ghostchamp = P;
  if (ENEMIES.ghostchamp) ENEMIES.ghostchamp.parts = P;

  // ---------------- 碎钟片 + 瓦片（百年沉钟「骨雨」那一招天上掉的东西；content.js 的 Content.inst.bone） ----------------
  Bosses.SHARD = [
    ['box', [0.5, 1.45, 0.09], [-0.21, 0.72, 0.04], 0x8a5a2a, [0, 0.2, 0.04], null, 'c10_patina'],
    ['box', [0.46, 1.25, 0.09], [0.22, 0.64, -0.03], 0x7a4e24, [0, -0.2, -0.05], null, 'c10_patina'],
    ['box', [0.95, 0.12, 0.13], [0, 0.04, 0.0], 0xb07a3a, null, null, 'metal'],
    ['box', [0.5, 0.1, 0.11], [-0.21, 1.42, 0.05], 0x6ab89a, [0, 0.2, 0.2], null, 'c10_patina'],
    ['box', [0.46, 0.06, 0.8], [0.08, 1.72, 0.08], 0xa85a3a, [1.05, 0.25, 0.3], null, 'brick'],
    ['box', [0.12, 0.08, 0.82], [0.27, 1.75, 0.08], 0x8a4a30, [1.05, 0.25, 0.3], null, 'brick']
  ];
})();

// ============================================================
//  叠加网格（池子）：Enemies.init 时每种首领建 POOL 套，之后只摆位置、开关
// ============================================================
// 和 Enemies.render 里实例颜色的分支一样（闪白、超武眩晕、冻住、标记、精英、燃烧、颜料、中毒、底色），再乘第二阶段的染色
Bosses.tintOf = function (e, c) {
  if (e.flash > 0) c.setRGB(3, 3, 3);
  else if (e.frozen > 0 && e.evoStun > 0) c.setRGB(2.2, 1.5, 0.35);
  else if (e.frozen > 0) c.setRGB(0.6, 1.0, 1.8);
  else if (e.marked > 0) c.setRGB(1.8, 0.5, 0.5);
  else if (e.elite) { c.setRGB(1.06, 1.0, 1.1); if (e.col) c.multiply(e.col); }
  else if (e.fireT > Game.time) c.setRGB(1.6, 0.95, 0.5);
  else if (e.mk === 'paint' && e.mkT > Game.time) Enemies.paintCol(e.mkC, c);
  else if (e.dot > 0) c.setRGB(0.8, 1.4, 0.6);
  else if (e.col) c.copy(e.col);
  else c.setRGB(1, 1, 1);
  if (e.tint && !(e.flash > 0)) c.multiply(e.tint);
  return c;
};

// 沙子：一个动态几何体（两只玻璃泡里的沙子 + 中间一道细沙流），每帧改顶点，不新建
Bosses.SAND_SLOT = 0;
Bosses.RING_COL = 0xe2f2ff; Bosses.RING_COL2 = 0xe0c4ff;
Bosses.sandTemplates = function () {
  var HG = Bosses.HG, T = TEX.TILE, tl = TEX.tileUV('sand');
  var mk = function (prof, seg) {
    var g = Bosses.lathe(prof, seg, 2, 1), p = g.attributes.position.array, u = g.attributes.uv.array, col = [], uv = [];
    for (var i = 0; i < p.length / 3; i++) {
      var y = p[i * 3 + 1], top = y >= prof[prof.length - 1][1] - 0.001 && prof[prof.length - 1][0] === 0;
      var k = top ? 1.25 : 0.85 + 0.3 * y / (prof[prof.length - 1][1] || 1);
      col.push(k, k, k);
      uv.push(tl.u + T * (0.03 + u[i * 2] * 0.94), tl.v + T * (0.03 + u[i * 2 + 1] * 0.94));
    }
    var out = { pos: Array.prototype.slice.call(p), col: col, uv: uv };
    g.dispose();
    return out;
  };
  // 上面泡里的沙：尖朝瓶颈，平平的沙面（按 f^(1/3) 绕瓶颈缩放）
  var fill = mk([[0.02, 0], [0.6, 0.5], [0.8, 1.4], [0, 1.41]], 8);
  // 下面泡里的沙堆：底贴着圆盘，尖朝上（按 f^(1/3) 绕底面缩放）
  var heap = mk([[0.66, 0], [0.48, 0.28], [0, HG.heap]], 8);
  var stream = mk([[1, 0], [1, 1]], 4);
  return { fill: fill, heap: heap, stream: stream, slot: Math.max(fill.pos.length, heap.pos.length) / 3 };
};

Bosses.makeRig = function (id) {
  var g = new THREE.Group(), r = { id: id, g: g, e: null, seen: -1 };
  g.visible = false;
  g.matrixAutoUpdate = true;
  if (id === 'hourglass') {
    var body = new THREE.Group();
    body.position.y = Bosses.HG.pivotY;
    g.add(body);
    var fm = MODEL.material().clone();
    fm.onBeforeCompile = MODEL.material().onBeforeCompile;
    r.frameMat = fm;
    r.frame = new THREE.Mesh(Bosses.geo.frame, fm);
    var gm = new THREE.MeshBasicMaterial({ map: TEX.atlas, vertexColors: true, color: 0xbfe0ff, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });
    r.glass = new THREE.Mesh(Bosses.geo.glass, gm);
    r.glass.renderOrder = 3;
    var T = Bosses.geo.sandT, n = T.slot * 2 + T.stream.pos.length / 3;
    var sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    sg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2).setUsage(THREE.DynamicDrawUsage));
    sg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 3);
    var sm = new THREE.MeshBasicMaterial({ map: TEX.atlas, vertexColors: true, color: 0xffa030, side: THREE.DoubleSide });
    r.sandMat = sm;
    r.sand = new THREE.Mesh(sg, sm);
    // 跟着镜头裁掉（背对首领时不画）：框架、玻璃用自己算的包围球，沙子的包围球是固定的 3 米（两只泡 + 沙流都在里面）
    [r.frame, r.glass, r.sand].forEach(function (m) { m.frustumCulled = true; body.add(m); });
    Bosses.streamStatic(r);
    r.body = body;
    r.kA = -1; r.kB = -1;
  } else if (id === 'sunkenbell') {
    var piv = new THREE.Group(), RP = Bosses.RING_PIVOT;
    piv.position.set(RP[0], RP[1], RP[2]);
    g.add(piv);
    var rm = new THREE.MeshBasicMaterial({ map: TEX.atlas, vertexColors: true, color: Bosses.RING_COL, transparent: true, opacity: 0.7, depthWrite: false });
    r.ringMat = rm;
    r.ringer = new THREE.Mesh(Bosses.geo.ringer, rm);
    r.ringer.position.set(-RP[0], -RP[1], -RP[2]);
    r.ringer.renderOrder = 3;
    r.ringer.frustumCulled = true;
    piv.add(r.ringer);
    r.piv = piv;
    // 第二阶段的裂缝叠层（平时不画）
    Bosses.quiet(function () {
      var km = new THREE.MeshBasicMaterial({ map: TEX.atlas, vertexColors: true, color: Bosses.CRACK_COL });
      r.crackMat = km;
      r.crack = new THREE.Mesh(Bosses.geo.crack, km);
    });
    r.crack.visible = false;
    r.crack.frustumCulled = true;
    g.add(r.crack);
  }
  Enemies.scene.add(g);
  return r;
};

// buildGeo 给顶点加一点随机抖动、three.js 给每个网格 / 材质一个随机 uuid（都用 Math.random）：
// 后加的东西用自己的随机数建，不动游戏的随机数序列（种子世界、MPHYS 不变）
Bosses.quiet = function (fn) {
  var mr = Math.random, h = 12345;
  Math.random = function () { h = (h * 16807) % 2147483647; return h / 2147483647; };
  try { return fn(); } finally { Math.random = mr; }
};
Bosses.quietGeo = function (parts) { return Bosses.quiet(function () { return Enemies.buildGeo(parts, true); }); };
Bosses.init = function () {
  if (!Enemies.scene) return;
  if (!Bosses.geo) {
    Bosses.geo = {
      frame: Enemies.buildGeo(Bosses.FRAME, true),
      glass: Enemies.buildGeo(Bosses.GLASS, true),
      ringer: Enemies.buildGeo(Bosses.RINGER, true),
      crack: Bosses.quietGeo(Bosses.CRACK),
      sandT: Bosses.sandTemplates()
    };
    // 鬼魂：上亮下暗（不受光的材质，自己做一点明暗）
    var gp = Bosses.geo.ringer.attributes.position.array, gc = Bosses.geo.ringer.attributes.color.array;
    for (var i = 0; i < gp.length / 3; i++) { var k = clamp(0.62 + gp[i * 3 + 1] * 0.55, 0.45, 1.1); gc[i * 3] *= k; gc[i * 3 + 1] *= k; gc[i * 3 + 2] *= k; }
    var lp = Bosses.geo.glass.attributes.position.array, lc = Bosses.geo.glass.attributes.color.array;
    for (i = 0; i < lp.length / 3; i++) { var r2 = Math.sqrt(lp[i * 3] * lp[i * 3] + lp[i * 3 + 2] * lp[i * 3 + 2]); var q = 0.8 + 0.25 * r2; lc[i * 3] *= q; lc[i * 3 + 1] *= q; lc[i * 3 + 2] *= q; }
  }
  ['hourglass', 'sunkenbell'].forEach(function (id) {
    if (Bosses.all[id] || !ENEMIES[id]) return;
    Bosses.all[id] = []; Bosses.pool[id] = [];
    for (var k = 0; k < Bosses.POOL; k++) { var r = Bosses.makeRig(id); Bosses.all[id].push(r); Bosses.pool[id].push(r); }
  });
  Bosses._c = new THREE.Color();
  Bosses._v = new THREE.Vector3();
  Bosses.ready = true;
};

// 取一套（这一帧第一次画这只首领时）
Bosses.rig = function (e) {
  if (e.rig && e.rig.e === e) return e.rig;
  var free = Bosses.pool[e.def.id];
  if (!free || !free.length) return null;
  var r = free.pop();
  r.e = e; r.kA = -1; r.kB = -1;
  e.rig = r;
  return r;
};

// 这一帧没画到的都藏起来放回池子
Bosses.sweep = function () {
  for (var id in Bosses.all) {
    var A = Bosses.all[id];
    for (var i = 0; i < A.length; i++) {
      var r = A[i];
      if (r.e && r.seen !== Bosses.frame) {
        if (r.e.rig === r) r.e.rig = null;
        r.e = null; r.g.visible = false;
        Bosses.pool[id].push(r);
      }
    }
  }
};
Bosses.hideAll = function () { Bosses.frame++; Bosses.sweep(); };

// 跟着实例摆好（L 已经是最后的样子；受击时和实例一样压扁一点）
Bosses.place = function (r, e, L) {
  var fx = e.flash > 0 ? 1.12 : 1, g = r.g;
  g.position.set(e.x, e.y + L.bob, e.z);
  g.rotation.set(L.pitch, L.face, L.roll, 'YXZ');
  g.scale.set(e.scale * L.sx * fx, e.scale * L.sy / fx, e.scale * L.sx * fx);
  g.visible = true;
  r.seen = Bosses.frame;
};

// ---------------- 沙漏王 ----------------
function smooth01(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
// 一只玻璃泡里的沙：side 是本地 +1（A 泡）/ -1（B 泡），top 在上面（沙往瓶颈漏）还是下面（沙堆），k 缩放
Bosses.writeSand = function (r, slot, side, top, k) {
  var T = Bosses.geo.sandT, src = top ? T.fill : T.heap, HG = Bosses.HG;
  var g = r.sand.geometry, P = g.attributes.position.array, C = g.attributes.color.array, U = g.attributes.uv.array;
  var o = slot * T.slot, n = src.pos.length / 3, i;
  for (i = 0; i < T.slot; i++) {
    var j = i < n ? i : n - 1, q = (o + i) * 3, x = src.pos[j * 3], y = src.pos[j * 3 + 1], z = src.pos[j * 3 + 2];
    P[q] = x * k; P[q + 2] = z * k;
    P[q + 1] = top ? side * (HG.neck + y * k) : side * (HG.bulb - y * k);
    C[q] = src.col[j * 3]; C[q + 1] = src.col[j * 3 + 1]; C[q + 2] = src.col[j * 3 + 2];
    U[(o + i) * 2] = src.uv[j * 2]; U[(o + i) * 2 + 1] = src.uv[j * 2 + 1];
  }
  r.sandDirty = true;   // 沙面变了：这一帧把位置、颜色、uv 整个传上去
};
// 沙流只改位置（每帧抖一下）；它的颜色和 uv 不变，建套的时候写一次（Bosses.streamStatic）
Bosses.writeStream = function (r, y0, y1, w) {
  var T = Bosses.geo.sandT, src = T.stream, P = r.sand.geometry.attributes.position.array;
  var o = T.slot * 2, n = src.pos.length / 3;
  for (var i = 0; i < n; i++) {
    var q = (o + i) * 3;
    P[q] = src.pos[i * 3] * w; P[q + 2] = src.pos[i * 3 + 2] * w;
    P[q + 1] = lerp(y0, y1, src.pos[i * 3 + 1]);
  }
};
Bosses.streamStatic = function (r) {
  var T = Bosses.geo.sandT, src = T.stream, g = r.sand.geometry, C = g.attributes.color.array, U = g.attributes.uv.array;
  var o = T.slot * 2, n = src.pos.length / 3;
  for (var i = 0; i < n; i++) {
    var q = (o + i) * 3;
    C[q] = 1.1; C[q + 1] = 1.02; C[q + 2] = 0.85;
    U[(o + i) * 2] = src.uv[i * 2]; U[(o + i) * 2 + 1] = src.uv[i * 2 + 1];
  }
  r.sandDirty = true;
};

Bosses._c = null;
Bosses.hourglassLook = function (e, L, dt) {
  dt = dt || 0;
  var charging = e.state === 'charge' && e.st <= 0;
  // 冲锋：腿飞快地倒腾，身子抖（沙漏本身在叠加层里翻滚）
  if (charging) {
    L.a = 1;
    L.p += (e.phase || 0) * 6;
    L.face += 0.08 * Math.sin((e.phase || 0) * 11);
    L.pitch = 0.06 * Math.sin((e.phase || 0) * 14);
  }
  if (!e.def || !Bosses.ready || L.hide) return;
  // 翻转：第二阶段开始后 0.6 秒转过 180°（按游戏时间累计，暂停和过场里不动）
  if (e.phase2 && e.flipK == null) e.flipK = 0;
  if (e.flipK != null && e.flipK < 1) {
    e.flipK = Math.min(1, e.flipK + dt / 0.6);
    if (e.flipK >= 1 && typeof FX !== 'undefined' && FX.burst) FX.burst(e.x, e.y + Bosses.HG.pivotY * e.scale, e.z, 16, 0xffd27a, 7, 0.32);
  }
  var flipped = e.flipK != null && e.flipK >= 1, flipping = e.flipK != null && e.flipK < 1;
  // 翻滚：冲锋时 9 弧度/秒；停下后转到下一个整圈再停
  var tu = e.tumA || 0;
  if (charging) tu += 9 * dt;
  else if (tu > 0) { var to = Math.ceil(tu / TAU - 1e-6) * TAU; tu = Math.min(to, tu + 9 * dt); if (tu >= to) tu = 0; }
  e.tumA = tu;
  var ang = Math.PI * smooth01(e.flipK || 0) + tu;
  e.hgAng = ang;
  var r = Bosses.rig(e);
  if (!r) return;
  Bosses.place(r, e, L);
  r.body.rotation.x = ang;
  // 沙子：h = 血量比例；没翻之前 A 在上，翻过来以后 B 在上；上面那只装 h，下面那只装 1 − h
  var hf = clamp(e.maxHp > 0 ? e.hp / e.maxHp : 1, 0, 1);
  var topA = !flipped, fA = topA ? hf : 1 - hf, fB = 1 - fA;
  var kA = Math.cbrt(fA), kB = Math.cbrt(fB);
  if (kA !== r.kA || topA !== r.topA) { Bosses.writeSand(r, 0, 1, topA, kA); r.kA = kA; }
  if (kB !== r.kB || topA !== r.topA) { Bosses.writeSand(r, 1, -1, !topA, kB); r.kB = kB; }
  r.topA = topA;
  r.fTop = topA ? fA : fB; r.kTop = topA ? kA : kB; r.kBot = topA ? kB : kA;
  // 细沙流：上面还有沙、没在翻也没在翻滚时，从瓶颈一直流到沙堆顶上
  var HG = Bosses.HG, sTop = topA ? 1 : -1, show = r.fTop > 0.02 && !flipping && tu === 0;
  r.stream = show;
  if (show) {
    var w = 0.035 * (1 + 0.25 * Math.sin((e.phase || 0) * 30));
    Bosses.writeStream(r, sTop * HG.neck, -sTop * (HG.bulb - r.kBot * HG.heap), w);
  } else Bosses.writeStream(r, 0, 0, 0);
  // 上传：沙面变了（血量变了、翻转了、刚换了一只首领）才传整份位置 + 颜色 + uv；平时只传沙流那一段位置
  var at = r.sand.geometry.attributes, T2 = Bosses.geo.sandT;
  if (r.sandDirty) {
    at.position.updateRange.offset = 0; at.position.updateRange.count = -1;
    at.color.needsUpdate = true; at.uv.needsUpdate = true;
    r.sandDirty = false;
  } else {
    at.position.updateRange.offset = T2.slot * 2 * 3; at.position.updateRange.count = T2.stream.pos.length;
  }
  at.position.needsUpdate = true;
  // 颜色：框架跟实例一样闪白、冻青、染第二阶段的色；沙子只染第二阶段的色
  var c = Bosses._c;
  r.frameMat.color.copy(Bosses.tintOf(e, c));
  r.sandMat.color.setHex(0xffa030);
  if (e.tint) r.sandMat.color.multiply(e.tint);
};

// ---------------- 百年沉钟 ----------------
Bosses.bellLook = function (e, L, dt) {
  dt = dt || 0;
  if (!e.def) return;
  var sc = e.scale || 1;
  // 一跳一跳：走动时按水平速度推进跳的相位（每个 π 落地一次）；停下时跳完这一下再原地轻轻起伏
  var spd = Math.sqrt((e.vx || 0) * (e.vx || 0) + (e.vz || 0) * (e.vz || 0));
  var ph = e.hopPh || 0, inAir = ph % Math.PI > 1e-4;
  if (spd > 0.4 || inAir) {
    var n0 = Math.floor(ph / Math.PI + 1e-9);
    ph += dt * Math.max(spd, 3) / 2.4 * Math.PI;
    if (spd <= 0.4 && Math.floor(ph / Math.PI) > n0) ph = (n0 + 1) * Math.PI;   // 停下：落地就停
    if (Math.floor(ph / Math.PI + 1e-9) > n0) Bosses.bellLand(e);
  }
  e.hopPh = ph;
  var air = Math.sin(ph % Math.PI);
  var idle = spd > 0.4 ? 0 : 0.05 + 0.05 * Math.sin((e.phase || 0) * 2.2);
  e.hopBob = air * 1.0 * sc + idle * sc;
  L.bob += e.hopBob;
  L.pitch += 0.08 * air;
  if (e.landT > 0) { e.landT -= dt; L.sy *= 0.88; L.sx *= 1.06; }
  if (!Bosses.ready || L.hide) return;
  var r = Bosses.rig(e);
  if (!r) return;
  Bosses.place(r, e, L);
  // 敲钟人：落地时往下一拽（身子拉长，脑袋不动），平时轻轻晃 ±4°
  var y = e.yank || 0;
  if (y > 0) e.yank = Math.max(0, y - dt * 4);
  r.piv.rotation.z = 0.07 * Math.sin((e.phase || 0) * 1.7);
  r.piv.rotation.x = 0.04 * Math.sin((e.phase || 0) * 1.3 + 0.6);
  r.piv.scale.set(1, 1 + 0.35 * y, 1);
  // 第二阶段：鬼魂更实一点、泛紫（钟身只轻轻染色，紫色交给鬼魂和余烬）
  r.ringMat.opacity = e.phase2 ? 0.78 : 0.7;
  if (e.flash > 0) r.ringMat.color.setRGB(1.5, 1.5, 1.5);
  else r.ringMat.color.setHex(e.phase2 ? Bosses.RING_COL2 : Bosses.RING_COL);
  Bosses.bellCrack(r, e, dt);
};
// 第二阶段的裂缝：琥珀色 1.5 Hz 一明一暗（减弱动态效果时停在亮的那头），几粒紫色余烬从裂缝里往上飘。
// 全按游戏时间算（不用随机数、不存状态，种子世界不变）；dt = 0（过场里只画一帧）时不加光点
Bosses.CRACK_COL = 0xffa040;
Bosses.EMBER_COL = 0xb080ff;
Bosses._v = null;
Bosses.bellCrack = function (r, e, dt) {
  var on = !!e.phase2;
  r.crack.visible = on;
  if (!on) return;
  var t = typeof Game !== 'undefined' ? Game.time || 0 : 0;
  var rm = typeof Settings !== 'undefined' && Settings.rm ? !!Settings.rm() : false;
  var k = rm ? 1.25 : 0.95 + 0.4 * (0.5 + 0.5 * Math.sin(t * 1.5 * TAU));
  if (e.flash > 0) r.crackMat.color.setRGB(1.5, 1.5, 1.5);
  else { r.crackMat.color.setHex(Bosses.CRACK_COL); r.crackMat.color.multiplyScalar(k); }
  if (!(dt > 0) || typeof FX === 'undefined' || !FX.glow || rm) return;
  // 4 粒余烬，各自 1.4 秒一轮：从裂缝上的一个点出来，往上飘 1.2 米、往外 0.4 米，越飘越暗
  var v = Bosses._v, c = Bosses._c, pts = Bosses.CRACK_PTS;
  r.g.updateMatrixWorld();
  c.setHex(Bosses.EMBER_COL);
  for (var i = 0; i < 4; i++) {
    var u = t / 1.4 + i * 0.25, n = Math.floor(u), f = u - n;
    var q = pts[(n * 3 + i) % pts.length];
    v.set(q[0] + Math.sin(n * 2.1 + i) * 0.15, q[1] + f * 1.2, q[2] + f * 0.4).applyMatrix4(r.g.matrixWorld);
    var a = (1 - f) * (f < 0.12 ? f / 0.12 : 1);
    FX.glow(v.x, v.y, v.z, 0.5, 0.5, c, a, 0);
  }
};
// 落地：“当”一声（限流约 0.5 秒：0.48 秒，按自己的速度跳一下 0.52 秒，每次落地都响）、一圈冲击环、一团灰、离得近时震一下
Bosses.bellLand = function (e) {
  e.landT = 0.12; e.yank = 0.35; e.lands = (e.lands || 0) + 1;
  var gy = e.y;
  if (typeof FX !== 'undefined') {
    if (FX.ring) FX.ring(e.x, gy, e.z, 3.2, 0xc8a060, 0.35);
    if (FX.burst) FX.burst(e.x, gy + 0.2, e.z, 8, 0x8a8478, 5, 0.35);
  }
  if (typeof P !== 'undefined' && P.pos && dist2(e.x, e.z, P.pos.x, P.pos.z) < 14 * 14 && typeof Game !== 'undefined' && Game.shake) Game.shake(0.12);
  var t = typeof Game !== 'undefined' ? Game.time || 0 : 0;
  if (e.clangT == null || t - e.clangT >= 0.48 || t < e.clangT) {
    e.clangT = t;
    if (window.SFX && SFX.play) SFX.play('w_bell', { x: e.x, z: e.z, pitch: 0.42, vol: 1.4, key: 'bossbell' });
  }
};

// ---------------- 幽魂冠军：披风下摆冒烟（每秒最多 6 缕） ----------------
Bosses.champLook = function (e, L, dt) {
  if (!e.def || L.hide || !(dt > 0) || (e.state === 'phasedash' && e.ak === 1)) return;
  e.smT = (e.smT || 0) + dt;
  if (e.smT < 1 / 6) return;
  e.smT -= 1 / 6;
  if (e.smT > 1 / 6) e.smT = 0;
  e.smN = (e.smN || 0) + 1;
  var sc = e.scale || 1, f = L.face, bk = -0.55 * sc, sd = (Bosses.hash(e.smN, e.id || 0, 5) - 0.5) * 0.8 * sc;
  var x = e.x + Math.sin(f) * bk + Math.cos(f) * sd, z = e.z + Math.cos(f) * bk - Math.sin(f) * sd;
  if (typeof FX !== 'undefined' && FX.part) FX.part(x, e.y + L.bob + 0.25 * sc, z, Math.sin(f) * -0.4, 0.9, Math.cos(f) * -0.4, 0x9fd8ff, 0.32 * sc, 0.8, -1.2);
};
Bosses.champMat = function () {
  var base = Enemies.material(), m = base.clone();
  m.onBeforeCompile = base.onBeforeCompile;
  if (base.customProgramCacheKey) m.customProgramCacheKey = base.customProgramCacheKey;
  m.transparent = true; m.opacity = 0.7; m.depthWrite = true;
  return m;
};

ENEMIES.hourglass.look = Bosses.hourglassLook;
ENEMIES.sunkenbell.look = Bosses.bellLook;
ENEMIES.ghostchamp.look = Bosses.champLook;

// ---------------- 接入：包 Enemies.init / render / clear ----------------
(function () {
  var init0 = Enemies.init, render0 = Enemies.render, clear0 = Enemies.clear;
  Enemies.init = function (scene) {
    var r = init0.apply(this, arguments);
    // 沙漏的玻璃身子是叠加的，实例几何体只到膝盖：Boss 出场镜头和头顶高度按 4.5 米算
    if (ENEMIES.hourglass) ENEMIES.hourglass.headTop = 4.5;
    var m = Enemies.meshes.ghostchamp;
    if (m) { m.material = Bosses.champMat(); m.renderOrder = 2; }
    Bosses.init();
    return r;
  };
  Enemies.render = function (dt) {
    Bosses.frame++;
    var r = render0.apply(this, arguments);
    Bosses.sweep();
    return r;
  };
  Enemies.clear = function () {
    var r = clear0.apply(this, arguments);
    Bosses.hideAll();
    return r;
  };
})();
