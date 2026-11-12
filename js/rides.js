'use strict';
// ============================================================
//  滑铲坐骑：按住滑铲时，每位骑士身下都会冒出一个自己的“坐骑”，地上滑、空中也能踩着
//  （守墓骑士的棺材雪橇是真雪橇：可以一直坐着滑，空中整口棺材还会平着转一圈）
//
//  RIDES[角色 id]（CHARACTERS 的键，比如 gravekeeper）：
//    name / desc 名字和说明；stance 姿势（surf 站 / sit 坐 / straddle 跨坐 / prone 趴 / kneel 跪 / crouch 蹲）
//    seat 座位高度（坐、跨坐）/ deck 踏板高度（站、蹲）；hover 悬空高度、lift 被轮子垫高（整个人一起抬）；len 长度（影子）
//    hide 滑铲时藏起来的随身物品（gearL 左手 / gearR 右手 / pack 背上；一个名字或一组名字）；goofy 反过来站
//    parts 模型零件（和 models_chars.js 一样的格式；原点在脚下地面，+Z 车头，+X 骑手的左边，单位米，跟着角色体型缩放）
//    spin 会转的零件 [{ at 转轴位置, r 半径（按速度转）或 rate 固定转速, axis 'x' / 'y', parts（相对转轴） }]
//    swing 会晃的零件 [{ at 挂点, amp 摆幅, rate 快慢, parts（相对挂点） }]（绕 X 前后晃，跑得越快晃得越大）
//    attach(B) 挂在身体骨骼上的零件 [{ bone, at, parts, spin }]（缩放中心在 at，弹出来时沿 Y 拉长）
//    trail / trailAir 地面、空中的拖尾粒子种类；trailAt 发射点（坐骑坐标 [x,y,z]，或 { bone, p } 骨骼上的点）
//    twist 玩法参数（player.js 读：kind 'board' / 'hover' / 'dive' / 'shadow' / 'frost' / 'moon'，friction, turn, carve, push, airGain, airBoard, uphill…）
//    flipAxis 'y'：空中翻板时整个人连坐骑平着转一圈（不写就是坐骑绕长轴滚一圈）
//    pose 姿势覆盖值；poseFn(S, a, C) 动态姿势；anim 外观小动画；fx(rs, g, dt, s) 每帧额外特效
//  Ride.attach(角色模型, 角色 id)：挂上坐骑（先藏着）；Ride.update(dt)：每帧在 P.animate 摆好姿势之后调用
//  Ride.showcase(菜单模型, 姿势, dt, 角色 id)：菜单里每 6 秒亮一下坐骑；Ride.forceOff()：骑上战马时立刻收起
//  读玩家的：P.riding（= P.sliding 地面滑铲 || P.airRide 空中按住滑铲）、P.flipT 翻板进度 0~1、P.diveT 俯冲时间
// ============================================================

// 扑克牌背面：红底、白边、浅色菱形格（彩色贴图，零件用白色顶点色；不用随机数，不打乱其他贴图）
// 现在没有坐骑用它了，但要留着：去掉会让后面注册的贴图换位置
TEX.addTile('ch_cardback', function (x, y) {
  var R = [178, 30, 44], WH = [246, 238, 228], L = [236, 150, 156];
  if (x === 0 || y === 0 || x === 15 || y === 15) return WH;
  if (x === 1 || y === 1 || x === 14 || y === 14) return R;
  if (x === 2 || y === 2 || x === 13 || y === 13) return L;
  return ((x + y) % 4 === 1 || (x - y + 16) % 4 === 1) ? L : R;
});

// 坐骑自己的贴图（rd_ 开头，只往后加；都不用共用的随机数 r，其他贴图一个像素都不变）
var RD_HASH = function (x, y) { return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 17; };
// 西瓜皮：竖着的深浅条纹（灰度，配绿色顶点色），条纹有点歪
TEX.addTile('rd_melon', function (x, y) {
  var s = (x + ((y >> 2) & 1) + (y > 11 ? 1 : 0)) % 5;
  return (s < 2 ? 112 : s === 2 ? 168 : 232) + RD_HASH(x, y) - 8;
});
// 星图：羊皮纸底、深色纸边，金色的星座连线和星点
var RD_CHART = (function () {
  var out = [], i, k;
  var paper = function (x, y) { var n = RD_HASH(x, y) - 8; return [208 + n, 186 + n, 138 + n]; };
  for (i = 0; i < 256; i++) out.push(paper(i % 16, i >> 4));
  var LINE = [150, 98, 30], STAR = [255, 214, 90];
  var put = function (x, y, c) { if (x >= 0 && y >= 0 && x < 16 && y < 16) out[y * 16 + x] = c; };
  // 两组星座：一笔一笔连起来
  var C = [[[2, 3], [5, 2], [8, 4], [11, 2], [13, 5]], [[3, 13], [5, 9], [8, 11], [10, 8], [13, 12]]];
  C.forEach(function (pts) {
    for (k = 0; k + 1 < pts.length; k++) {
      var a = pts[k], b = pts[k + 1], n = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
      for (i = 0; i <= n; i++) put(Math.round(a[0] + (b[0] - a[0]) * i / n), Math.round(a[1] + (b[1] - a[1]) * i / n), LINE);
    }
    pts.forEach(function (p) { put(p[0], p[1], STAR); });
  });
  put(7, 7, STAR); put(6, 7, LINE); put(8, 7, LINE); put(7, 6, LINE); put(7, 8, LINE);   // 中间一颗亮星
  for (i = 0; i < 16; i++) { put(i, 0, [150, 112, 66]); put(i, 15, [150, 112, 66]); }
  return out;
})();
TEX.addTile('rd_chart', function (x, y) { return RD_CHART[y * 16 + x]; });
// 魔术牌背面：红底、金边、金色菱形格，中间一颗金星
TEX.addTile('rd_magic', function (x, y) {
  var R = [168, 24, 40], R2 = [128, 16, 32], G = [232, 184, 64], G2 = [190, 140, 40];
  if (x === 0 || y === 0 || x === 15 || y === 15) return G2;
  if (x === 1 || y === 1 || x === 14 || y === 14) return G;
  var dx = Math.abs(x * 2 - 15), dy = Math.abs(y * 2 - 15);
  if ((dx <= 1 && dy <= 5) || (dy <= 1 && dx <= 5) || (dx <= 3 && dy <= 3)) return G;   // 中间的星
  if ((x + y) % 6 === 3 || (x - y + 18) % 6 === 3) return G2;
  return (x + y) % 2 ? R : R2;
});

var RIDES = {};

(function () {
  var P = CHP, PI = Math.PI, H = PI / 2;
  var STEEL = 0xc9d2dd, GOLD_C = 0xe2b23a, METAL = 0x8a8e96;
  var both = function (fn) { return fn(1).concat(fn(-1)); };

  // ---- 1 见习骑士：旧马鞍（皮鞍座 + 后鞍桥 + 鞍头 + 两只晃荡的马镫 + 一条肚带） ----
  var SADDLE = 0x7a4a2a, SADDLE_D = 0x6a4026;
  RIDES.squire = {
    name: '旧马鞍', desc: '还没分到马的见习骑士，先骑着一副旧马鞍滑。',
    stance: 'straddle', seat: 0.45, len: 0.8,
    parts: [
      // 蓝色鞍垫（比鞍座大一圈，从边上露出来）
      P.box([0.46, 0.025, 0.66], [0, 0.36, -0.03], 0x3a5ac8, 'cloth'),
      P.box([0.48, 0.012, 0.04], [0, 0.352, 0.3], 0xe2c070, 'cloth'),
      // 鞍座：后面宽、前面窄
      P.tbox([0.26, 0.36, 0.56, 0.08, 0.08], [0, 0.41, -0.02], SADDLE, 'ch_leather', [H, 0, 0]),
      // 后鞍桥（往后翘）+ 鞍头（前面一个圆疙瘩）
      P.tbox([0.34, 0.3, 0.13, 0.06, 0.07], [0, 0.48, -0.3], SADDLE, 'ch_leather', [-0.35, 0, 0]),
      P.cyl([0.045, 0.065, 0.11, 8], [0, 0.48, 0.25], SADDLE_D, 'ch_leather', [0.25, 0, 0]),
      P.knob(0.05, [0, 0.54, 0.265], SADDLE, 'ch_leather'),
      // 两片鞍裙垂到小腿高度
      P.box([0.03, 0.3, 0.42], [0.2, 0.25, -0.03], SADDLE_D, 'ch_leather', [0, 0, 0.15]),
      P.box([0.03, 0.3, 0.42], [-0.2, 0.25, -0.03], SADDLE_D, 'ch_leather', [0, 0, -0.15]),
      // 肚带：从一片鞍裙底下兜到另一片
      P.box([0.46, 0.03, 0.06], [0, 0.12, 0.02], 0x4a3020, 'ch_leather'),
      P.box([0.04, 0.05, 0.04], [0.23, 0.12, 0.02], 0xa8aeb6, 'metal'),
      P.box([0.04, 0.05, 0.04], [-0.23, 0.12, 0.02], 0xa8aeb6, 'metal')
    ],
    // 马镫：皮带 + 铁环，跟着速度前后晃
    swing: both(function (s) {
      return [{ at: [s * 0.235, 0.37, 0.04], amp: 0.28, rate: 7 + s, parts: [
        P.box([0.022, 0.22, 0.035], [0, -0.11, 0], 0x4a3020, 'ch_leather'),
        P.p('torus', [0.05, 0.012, 4, 10], [0, -0.26, 0], 0xa8aeb6, 'metal'),
        P.box([0.09, 0.016, 0.04], [0, -0.305, 0], 0x8a929c, 'metal')
      ] }];
    }),
    // 右手举剑往前冲锋，左手按着鞍头
    pose: { ARX: -1.1, ARZ: -0.1, FRX: -0.25, ALX: -0.9, FLX: -0.6 },
    trail: ['dust'], trailAt: [[0.22, 0.03, -0.3], [-0.22, 0.03, -0.3], [0, 0.03, 0.25]]
  };

  // ---- 2 敲钟骑士：大铜锣（青铜色、两圈同心纹、中间一个锣心，一路转着滑） ----
  RIDES.bellringer = {
    name: '大铜锣', desc: '敲钟骑士的另一件响器：一面大铜锣，踩上去一路转着滑。',
    stance: 'surf', deck: 0.11, len: 0.96,
    spin: [{ at: [0, 0, 0], axis: 'y', rate: 4, parts: [
      P.cyl([0.48, 0.48, 0.08, 16], [0, 0.06, 0], 0xc8963a, 'gold'),
      P.cyl([0.4, 0.4, 0.012, 16], [0, 0.103, 0], 0xb8862a, 'gold'),
      P.p('torus', [0.455, 0.028, 4, 20], [0, 0.1, 0], 0xd8a84a, 'gold', [H, 0, 0]),
      P.p('torus', [0.3, 0.012, 3, 14], [0, 0.108, 0], 0xa8762a, 'gold', [H, 0, 0]),
      P.p('torus', [0.18, 0.012, 3, 12], [0, 0.108, 0], 0xa8762a, 'gold', [H, 0, 0]),
      P.knob(0.06, [0, 0.1, 0], 0xd0a040, 'gold', [1, 0.45, 1]),
      // 一道划痕（转起来看得出在转）
      P.box([0.025, 0.012, 0.12], [0, 0.112, -0.24], 0x8a5a1a, 'plain', [0, 0.3, 0])
    ] }],
    trail: ['glint'], trailAir: ['glint'], trailAt: [[0.42, 0.1, 0], [-0.42, 0.1, 0], [0, 0.1, -0.42], [0, 0.1, 0.42]],
    trailColor: { glint: 0xe0a050 }
  };

  // ---- 3 守墓骑士：棺材雪橇（盖好的木棺材 + 两根骨头滑轨，坐着滑） ----
  var CWOOD = 0x5a3a26, CLID = 0x4a2e1c, BONE = 0xeee5c8, IRON_C = 0x5a6068;
  RIDES.gravekeeper = {
    name: '棺材雪橇', desc: '守墓人跨坐在一口棺材上，顺着坟丘一路滑下去。',
    stance: 'sit', seat: 0.39, len: 1.3, flipAxis: 'y',
    parts: [
      // 箱身：前面一块、后面一块，肩膀最宽
      P.tbox([0.28, 0.44, 0.42, 0.24, 0.24], [0, 0.22, 0.39], CWOOD, 'wood', [H, 0, 0]),
      P.tbox([0.44, 0.28, 0.74, 0.24, 0.24], [0, 0.22, -0.19], CWOOD, 'wood', [H, 0, 0]),
      // 箱盖：比箱身大一圈、颜色深一点
      P.tbox([0.31, 0.47, 0.44, 0.05, 0.05], [0, 0.365, 0.39], CLID, 'wood', [H, 0, 0]),
      P.tbox([0.47, 0.31, 0.76, 0.05, 0.05], [0, 0.365, -0.19], CLID, 'wood', [H, 0, 0]),
      // 四个铁包角
      P.box([0.06, 0.29, 0.06], [0.135, 0.235, 0.59], IRON_C, 'metal'), P.box([0.06, 0.29, 0.06], [-0.135, 0.235, 0.59], IRON_C, 'metal'),
      P.box([0.06, 0.29, 0.06], [0.135, 0.235, -0.55], IRON_C, 'metal'), P.box([0.06, 0.29, 0.06], [-0.135, 0.235, -0.55], IRON_C, 'metal'),
      // 黄铜名牌（棺材头那一面）
      P.box([0.16, 0.08, 0.012], [0, 0.24, 0.607], 0xc8a040, 'gold')
    ].concat(both(function (s) {
      var x = s * 0.17;
      return [
        // 骨头滑轨：一根长骨头，前头翘起来，后头也微微翘，两头是骨节
        P.box([0.04, 0.04, 1.3], [x, 0.03, 0], BONE, 'bone'),
        P.box([0.04, 0.04, 0.2], [x, 0.094, 0.726], BONE, 'bone', [-0.7, 0, 0]),
        P.knob(0.035, [x, 0.16, 0.8], BONE, 'bone'),
        P.box([0.04, 0.04, 0.12], [x, 0.05, -0.7], BONE, 'bone', [0.4, 0, 0]),
        // 两根撑子
        P.box([0.03, 0.07, 0.03], [x, 0.075, 0.33], 0xd6caa6, 'bone'),
        P.box([0.03, 0.07, 0.03], [x, 0.075, -0.35], 0xd6caa6, 'bone')
      ];
    })),
    // 推着走时两只手往下、往后撑地（rides.js 在推着走时给 a.kick 相位、a.kickW 权重）
    poseFn: function (S, a, C) {
      var k = a.kickW || 0;
      if (k <= 0.001) return;
      var ph = (a.kick || 0) * PI * 2, sw = 0.5 - 0.5 * Math.cos(ph), dn = Math.max(0, Math.sin(ph)), up = Math.max(0, -Math.sin(ph));
      var ax = -0.55 + 1.15 * sw, fx = -0.12 - 0.75 * up, az = 0.42 + 0.18 * up;
      S[C.ALX] += (ax - S[C.ALX]) * k; S[C.ARX] += (ax - S[C.ARX]) * k;
      S[C.FLX] += (fx - S[C.FLX]) * k; S[C.FRX] += (fx - S[C.FRX]) * k;
      S[C.ALZ] += (az - S[C.ALZ]) * k; S[C.ARZ] += (-az - S[C.ARZ]) * k;
      S[C.CRX] += 0.4 * dn * k; S[C.HRX] -= 0.25 * dn * k;
    },
    trail: ['snow', 'snow', 'candle'], trailAt: [[0.17, 0.03, -0.62], [-0.17, 0.03, -0.62], [0.17, 0.03, 0.4], [-0.17, 0.03, 0.4]],
    twist: { kind: 'board', friction: 0.35, turn: 2.0, carve: 0.4, push: 6, airGain: 1.25, airBoard: true,
      airPush: 3, airCap: 1.3, landGrace: 0.25, flipMin: 0.3, flipTime: 0.35 }
  };

  // ---- 4 伙夫骑士：肚皮滑（没有模型，身后扬起一团团白面粉） ----
  RIDES.cook = {
    name: '肚皮滑', desc: '圆滚滚的伙夫往前一扑，拿肚子当雪橇。',
    stance: 'prone', len: 1.5,
    trail: ['dust'], trailAt: [[0, 0.05, 0.35], [0.18, 0.05, 0.25], [-0.18, 0.05, 0.25]],
    trailColor: { dust: 0xf6f2ea }
  };

  // ---- 5 熊骑士：拆下来的木门 ----
  var DOOR = 0x7a5434, IRON = 0x5a6068;
  RIDES.bear = {
    name: '拆下来的木门', desc: '熊骑士一着急，把城门边的小木门拆下来当雪橇。',
    stance: 'sit', seat: 0.14, len: 1.4,
    parts: [
      P.box([0.78, 0.07, 1.4], [0, 0.06, 0], DOOR, 'wood'),
      P.box([0.015, 0.075, 1.38], [0.13, 0.065, 0], 0x4a3020, 'wood'),
      P.box([0.015, 0.075, 1.38], [-0.13, 0.065, 0], 0x4a3020, 'wood'),
      P.box([0.82, 0.03, 0.09], [0, 0.105, -0.45], IRON, 'metal'),
      P.box([0.82, 0.03, 0.09], [0, 0.105, 0], IRON, 'metal'),
      P.box([0.82, 0.03, 0.09], [0, 0.105, 0.45], IRON, 'metal'),
      P.knob(0.02, [0.3, 0.125, -0.45], 0x9aa0a8, 'metal'), P.knob(0.02, [-0.3, 0.125, -0.45], 0x9aa0a8, 'metal'),
      P.knob(0.02, [0.3, 0.125, 0.45], 0x9aa0a8, 'metal'), P.knob(0.02, [-0.3, 0.125, 0.45], 0x9aa0a8, 'metal'),
      // 门环 + 底座
      P.p('torus', [0.08, 0.018, 4, 12], [0, 0.2, 0.6], IRON, 'metal'),
      P.box([0.05, 0.08, 0.05], [0, 0.13, 0.6], IRON, 'metal'),
      // 合页（门是硬拆下来的）
      P.box([0.06, 0.05, 0.16], [0.4, 0.07, 0.4], 0x3a3e44, 'metal'), P.box([0.06, 0.05, 0.16], [0.4, 0.07, -0.4], 0x3a3e44, 'metal'),
      // 后面拖着的木刺
      P.cone([0.035, 0.18, 4], [-0.25, 0.06, -0.76], 0x8a6440, 'wood', [-H, 0, 0]),
      P.cone([0.035, 0.14, 4], [0.05, 0.06, -0.74], 0x8a6440, 'wood', [-H, 0, 0]),
      P.cone([0.035, 0.2, 4], [0.3, 0.06, -0.77], 0x8a6440, 'wood', [-H, 0, 0])
    ],
    // 右手抓着门环
    pose: { ARX: -1.0, ARZ: -0.15, FRX: -0.3 },
    trail: ['dust', 'chip'], trailAt: [[0.35, 0.03, -0.7], [-0.35, 0.03, -0.7], [0, 0.03, -0.72]], trailColor: { chip: 0x8a6440 }
  };

  // ---- 6 发条锡兵：发条滚轮 ----
  RIDES.tinsoldier = {
    name: '发条滚轮', desc: '靴底咔嗒弹出一排发条小滚轮。',
    stance: 'crouch', deck: 0, lift: 0.1, len: 0.9,
    attach: function (B) {
      var skate = function (bone) {
        return {
          bone: bone, at: [0, -B.shin - 0.08, 0.05],
          parts: [
            P.box([0.075, 0.035, 0.32], [0, -0.022, 0], 0xd09a3c, 'ch_plate'),
            P.box([0.02, 0.06, 0.3], [0.03, -0.05, 0], 0x9a6a2a, 'ch_plate'),
            P.box([0.02, 0.06, 0.3], [-0.03, -0.05, 0], 0x9a6a2a, 'ch_plate')
          ],
          spin: [-0.11, 0, 0.11].map(function (z) {
            return { at: [0, -0.06, z], r: 0.042, parts: [P.cyl([0.042, 0.042, 0.035, 8], [0, 0, 0], 0xc8693a, 'metal', [0, 0, H]), P.cyl([0.018, 0.018, 0.045, 6], [0, 0, 0], 0xffd27a, 'metal', [0, 0, H])] };
          })
        };
      };
      return [skate('shinL'), skate('shinR')];
    },
    pose: { LLX: -1.25, SLX: 1.2, LRX: -0.8, SRX: 0.78, LLZ: 0.14, LRZ: -0.14, CRX: 0.6, HRX: -0.45, ALX: 0.6, ARX: 0.75, ALZ: 0.25, ARZ: -0.25 },
    anim: { capeSpin: 3 },
    trail: ['spark'], trailAt: [{ bone: 'shinL', p: [0, -0.5, -0.06] }, { bone: 'shinR', p: [0, -0.5, -0.06] }], trailColor: { spark: 0xffb060 }
  };

  // ---- 7 擎旗骑士：擎旗跪滑（没有坐骑模型：单膝跪地，左手把卷着的团旗举过头顶，右手骑枪平端向前） ----
  var BANNER = 0xd8323a;
  RIDES.bannerman = {
    name: '擎旗跪滑', desc: '像受封那天一样单膝跪地滑出去，团旗举过头顶。',
    stance: 'kneel', len: 1.0, hide: ['pack', 'gearL'],
    // 背上的团旗“跳”到举起的左手里（旗杆顺着前臂往上长出来）
    attach: function (B) {
      return [{ bone: 'foreL', at: [0, -B.fore - 0.06, 0.012], parts: [
        P.cyl([0.018, 0.018, 1.15, 6], [0, -0.2, 0.05], 0x6a4a2a, 'wood'),
        P.cyl([0.05, 0.05, 0.5, 8], [0, -0.45, 0.05], BANNER, 'ch_fold'),
        P.p('torus', [0.052, 0.012, 3, 10], [0, -0.3, 0.05], GOLD_C, 'gold', [H, 0, 0]),
        P.p('torus', [0.052, 0.012, 3, 10], [0, -0.6, 0.05], GOLD_C, 'gold', [H, 0, 0]),
        P.cone([0.025, 0.07, 6], [0, -0.81, 0.05], GOLD_C, 'gold', [PI, 0, 0])
      ] }];
    },
    pose: { LLX: -0.15, SLX: 1.55, LLZ: 0.12, LRX: -1.35, LRZ: -0.1, SRX: 1.3, PRX: -0.05, CRX: 0.05,
      // 右臂往后放低：骑枪平时是竖着拿的（握把在手里往上前方指），这样枪头才平平地朝前（夹枪冲锋）
      ALX: -2.6, ALZ: 0.3, FLX: -0.3, ARX: 0.75, ARZ: -0.3, FRX: 0, HRX: 0.05 },
    trail: ['spark', 'dust'], trailAt: [{ bone: 'shinL', p: [0, -0.02, 0.06] }, { bone: 'shinL', p: [0, -0.2, 0.0] }], trailColor: { spark: 0xffd84a }
  };

  // ---- 8 信使骑士：加急巨箭（箭杆上绑着一封加急信） ----
  RIDES.courier = {
    name: '加急巨箭', desc: '飞箭传书：加急的信绑在巨箭上射出去，信使干脆骑着它一起飞。',
    stance: 'straddle', seat: 0.52, len: 1.8,
    parts: [
      P.cyl([0.05, 0.05, 1.8, 8], [0, 0.47, 0.05], 0x8a5a2a, 'wood', [H, 0, 0]),
      P.cone([0.11, 0.32, 4], [0, 0.47, 1.1], STEEL, 'ch_plate', [H, 0, 0]),
      P.cyl([0.06, 0.06, 0.06, 8], [0, 0.47, 0.92], 0x4b3120, 'ch_leather', [H, 0, 0]),
      P.cyl([0.058, 0.058, 0.05, 8], [0, 0.47, -0.45], 0x4b3120, 'ch_leather', [H, 0, 0]),
      P.box([0.02, 0.17, 0.34], [0, 0.56, -0.68], 0xd8323a, 'cloth'),
      P.box([0.02, 0.17, 0.34], [0.074, 0.428, -0.68], 0xf2f0e6, 'cloth', [0, 0, -2.09]),
      P.box([0.02, 0.17, 0.34], [-0.074, 0.428, -0.68], 0xf2f0e6, 'cloth', [0, 0, 2.09]),
      P.box([0.06, 0.06, 0.05], [0, 0.47, -0.86], 0x4b3120, 'ch_leather'),
      // 信：信封 + 封口的三角 + 红火漆 + 一道绑绳
      P.box([0.22, 0.016, 0.15], [0, 0.528, 0.76], 0xf4f0e4, 'plain', [0, 0.15, 0]),
      P.box([0.1, 0.018, 0.1], [0, 0.531, 0.785], 0xe2dccc, 'plain', [0, 0.15 + PI / 4, 0]),
      P.knob(0.026, [0, 0.542, 0.77], 0xc8202e, 'plain', [1, 0.5, 1]),
      P.box([0.018, 0.12, 0.018], [0.075, 0.48, 0.75], 0xc8a070, 'cloth', [0, 0.15, 0])
    ],
    pose: { LLX: -1.15, SLX: 2.35, LRX: -1.15, SRX: 2.35, LLZ: 0.4, LRZ: -0.4, CRX: 0.5, ALX: -0.95, FLX: -0.55, ARX: -0.95, FRX: -0.55 },
    anim: { bob: [0.03, 2.3], roll: [0.05, 1.6] },
    trail: ['wind'], trailAir: ['wind'], trailAt: [[0, 0.56, -0.86], [0.08, 0.42, -0.86], [-0.08, 0.42, -0.86]]
  };

  // ---- 9 小丑骑士：西瓜皮（半个西瓜皮扣在地上：绿条纹瓜壳 + 一圈红瓤 + 几颗黑籽） ----
  RIDES.jester = {
    name: '西瓜皮', desc: '脚踩西瓜皮，滑到哪里算哪里。',
    stance: 'sit', seat: 0.09, len: 0.85,
    parts: [
      // 瓜壳（碗口朝上）；红瓤的面朝里（点倒着写，法线朝碗里）
      P.lathe([10, 0.0, 0.0, 0.17, 0.02, 0.27, 0.055, 0.32, 0.1, 0.34, 0.14], [0, 0, 0], 0x3a8a3a, 'rd_melon'),
      P.lathe([10, 0.315, 0.14, 0.3, 0.11, 0.25, 0.075, 0.16, 0.05, 0.0, 0.04], [0, 0, 0], 0xe84a5a, 'plain'),
      P.p('torus', [0.33, 0.02, 4, 16], [0, 0.14, 0], 0xd8f0b0, 'plain', [H, 0, 0])
    ].concat([0.5, 1.4, 2.3, 3.6, 4.5, 5.4].map(function (a, i) {
      var r = i % 2 ? 0.22 : 0.26;
      return P.knob(0.018, [Math.sin(a) * r, i % 2 ? 0.075 : 0.095, Math.cos(a) * r], 0x1a1410, 'plain', [0.7, 0.5, 1.3]);
    })),
    // 两腿翘起来，两手乱挥
    pose: { LLX: -1.75, SLX: 0.25, LRX: -1.75, SRX: 0.25, PRX: -0.4 },
    poseFn: function (S, a, C) {
      var t = a.t;
      S[C.ALZ] = 1.5 + 0.3 * Math.sin(t * 9); S[C.ARZ] = -(1.5 + 0.3 * Math.sin(t * 9 + PI));
      S[C.ALX] = -0.4 + 0.25 * Math.sin(t * 7); S[C.ARX] = -0.4 - 0.25 * Math.sin(t * 7);
    },
    trail: ['dust'], trailAt: [[0.2, 0.02, -0.35], [-0.2, 0.02, -0.35]], trailColor: { dust: 0xb8e090 }
  };

  // ---- 10 占星骑士：星图卷轴（摊开的羊皮纸星图 + 两头的木卷轴，贴地悬空） ----
  RIDES.astrologer = {
    name: '星图卷轴', desc: '占星骑士把星图摊开踩上去，贴着地面悬空滑。',
    stance: 'surf', deck: 0.08, hover: 0.25, len: 1.3,
    parts: [
      P.tbox([0.5, 0.5, 1.2, 0.02, 0.02], [0, 0.05, 0], 0xffffff, 'rd_chart', [H, 0, 0])
    ].concat(both(function (s) {
      var z = s * 0.62;
      return [
        P.cyl([0.035, 0.035, 0.56, 8], [0, 0.06, z], 0x8a5a2a, 'wood', [0, 0, H]),
        P.knob(0.032, [0.29, 0.06, z], GOLD_C, 'gold'), P.knob(0.032, [-0.29, 0.06, z], GOLD_C, 'gold')
      ];
    })),
    anim: { bob: [0.02, 3.1] },
    trail: ['stardust'], trailAir: ['stardust'], trailAt: [[0.2, 0.03, -0.5], [-0.15, 0.03, -0.1], [0.15, 0.03, 0.4]],
    twist: { kind: 'hover', friction: 0.4, uphill: 0.5 },
    fx: function (rs, g, dt, s) {
      if (rs.w < 0.3) return;
      var v = Ride.rootPoint(rs, 0, 0.02, 0);
      FX.glow(v.x, v.y - 0.05, v.z, 1.1, 1.1, Ride.col(0xffe08a), 0.3 * rs.w, 0);
      // 星图上隔一会儿落下一颗金色的星点
      rs.starT = (rs.starT || 0) - dt;
      if (rs.starT > 0) return;
      rs.starT = 0.3 + Math.random() * 0.25;
      var e = Ride.rootPoint(rs, rand(-0.25, 0.25), rand(0.3, 0.6), rand(-0.5, 0.5));
      FX.flash(e.x, e.y, e.z, 0.34, 0xffe26a, 0.4, 2);
      FX.mote(e.x, e.y, e.z, 0xffe26a, 0.07, -0.45, 0.9);
    }
  };

  // ---- 11 画盾骑士：大调色盘（木头腰子形 + 拇指孔 + 六团颜料） ----
  var PAINTS = [0xd83a3a, 0x3a6ad8, 0xe8c030, 0x4aa84a, 0xf4f0e8, 0x8a4ad8];
  RIDES.painter = {
    name: '大调色盘', desc: '画匠的调色盘大得能坐人，滑过去留下一路彩色颜料点。',
    stance: 'sit', seat: 0.1, len: 1.45, shift: 0.15,
    parts: [
      P.cyl([0.5, 0.5, 0.04, 14], [0, 0.05, 0], 0xb08050, 'wood', null, [0.9, 1, 1.45]),
      // 腰子形的凹口：盘子边上一块深色（像缺了一口）+ 拇指孔
      P.cyl([0.16, 0.16, 0.042, 10], [-0.38, 0.05, -0.38], 0x8a6038, 'wood', null, [0.7, 1, 1.2]),
      P.cyl([0.075, 0.075, 0.046, 8], [0.18, 0.05, -0.52], 0x3a2a1a, 'plain')
    ].concat([0.75, 1.35, 2.3, -0.75, -1.4, -2.35].map(function (a, i) {
      return P.knob(0.06, [Math.sin(a) * 0.36, 0.075, Math.cos(a) * 0.58], PAINTS[i], 'plain', [1, 0.35, 1]);
    })),
    // 两手扶着盘子两边
    pose: { ALX: -0.55, ALZ: 0.55, FLX: -0.35, ARX: -0.55, ARZ: -0.55, FRX: -0.35 },
    trail: ['paint'], trailAt: [[0, 0.06, -0.6], [0.3, 0.06, -0.35], [-0.3, 0.06, -0.35]]
  };

  // ---- 12 圣歌修女：月牙 ----
  RIDES.nun = {
    name: '月牙', desc: '修女坐在一弯月牙上，像晚祷的歌声一样轻轻飘着。',
    stance: 'sit', seat: 0.2, len: 1.0, py: 0.02,
    parts: [
      P.p('ch_arc', [0.48, 0.1, 6, 18, PI * 1.15], [0, 0.6, 0], 0xffd84a, 'gold', [0, H, PI * 0.925], [1, 1, 1.7]),
      P.p('ch_arc', [0.4, 0.04, 4, 16, PI], [0, 0.6, 0], 0xfff6c0, '!plain', [0, H, PI], [1, 1, 2.6]),
      P.gem(0.06, [0, 0.715, 0.47], 0xffe26a, '!plain'), P.gem(0.06, [0, 0.715, -0.47], 0xffe26a, '!plain'),
      P.gem(0.035, [0, 0.715, 0.47], 0xffffff, '!plain', [0, 0, PI / 4], [1, 2.2, 1]), P.gem(0.035, [0, 0.715, -0.47], 0xffffff, '!plain', [0, 0, PI / 4], [1, 2.2, 1])
    ],
    pose: { LLX: -1.2, SLX: 0.9, LRX: -1.2, SRX: 0.9, ALX: -0.35, ALZ: 0.5, ARX: -0.35, ARZ: -0.5 },
    anim: { rock: [0.06, 1.9] },
    trail: ['star', 'violet'], trailAir: ['star', 'violet'], trailAt: [[0, 0.7, -0.47], [0, 0.15, -0.35], [0.12, 0.3, -0.4]],
    twist: { kind: 'moon', gravity: 0.5, time: 1.5 },
    fx: function (rs, g, dt, s) {
      if (rs.w < 0.3) return;
      var v = Ride.rootPoint(rs, 0, 0.3, 0);
      FX.glow(v.x, v.y, v.z, 1.0, 1.0, Ride.col(0xffe26a), 0.14 * rs.w, 0);
    }
  };

  // ---- 13 园丁骑士：种子袋（背上的麻布袋垫到身下，袋口冒出两三棵绿芽） ----
  var SACK = 0xc8b48a;
  RIDES.gardener = {
    name: '种子袋', desc: '背上的种子袋往身下一垫，坐着就滑走了，身后飘一路花瓣。',
    stance: 'sit', seat: 0.4, len: 1.0, hide: 'pack',
    parts: [
      P.ball(0.38, [0, 0.2, 0], SACK, 'cloth', [1.05, 0.55, 1.3], null, [12, 8]),
      P.cyl([0.07, 0.11, 0.14, 6], [0, 0.24, 0.5], SACK, 'cloth', [H - 0.3, 0, 0]),
      P.cyl([0.075, 0.075, 0.03, 8], [0, 0.255, 0.45], 0x2a1c14, 'ch_leather', [H - 0.3, 0, 0]),
      P.box([0.14, 0.012, 0.12], [0.2, 0.37, -0.12], 0x8a6a3a, 'cloth', [0.1, 0.5, -0.45]),
      P.box([0.13, 0.008, 0.012], [0.2, 0.378, -0.12], 0x4a3420, 'plain', [0.1, 0.5, -0.45]),
      // 袋口的绿芽 + 撒出来的几粒种子
      P.cone([0.025, 0.1, 4], [0.02, 0.32, 0.6], 0x5aa83a, 'leaf', [0.9, 0, -0.3]),
      P.cone([0.025, 0.1, 4], [-0.03, 0.33, 0.58], 0x5aa83a, 'leaf', [0.5, 0, 0.45]),
      P.cone([0.022, 0.08, 4], [0.045, 0.31, 0.55], 0x6ab84a, 'leaf', [0.3, 0, -0.7]),
      P.knob(0.016, [0.05, 0.21, 0.66], 0x8a6a3a, 'plain', [1, 0.7, 1.3]), P.knob(0.016, [-0.06, 0.19, 0.68], 0x8a6a3a, 'plain', [1, 0.7, 1.3]),
      P.knob(0.016, [0.0, 0.17, 0.72], 0x8a6a3a, 'plain', [1, 0.7, 1.3]), P.knob(0.016, [0.09, 0.15, 0.62], 0x8a6a3a, 'plain', [1, 0.7, 1.3])
    ],
    pose: { LLX: -1.25, SLX: 1.0, LRX: -1.25, SRX: 1.0, ALX: -0.3, ALZ: 0.55, ARX: -0.5, ARZ: -0.45 },
    trail: ['petal'], trailAt: [[0, 0.3, -0.45], [0.2, 0.2, -0.35], [-0.2, 0.2, -0.35]]
  };

  // ---- 14 提灯骑士：影遁（灯一熄：手里的提灯收起来，人化成影子，影子边上一圈暖黄的灯光） ----
  var SHADOW = 0x0c0c14;
  RIDES.lampknight = {
    name: '影遁', desc: '灯一熄，人就化成影子贴地滑。',
    stance: 'crouch', deck: 0.02, len: 1.25, hide: 'gearR',
    parts: [
      P.cyl([0.62, 0.62, 0.012, 16], [0, 0.012, 0], SHADOW, 'plain'),
      P.p('torus', [0.6, 0.018, 4, 32], [0, 0.02, 0], 0x9a5e1c, '!plain', [H, 0, 0]),   // 调亮以后是暖黄的灯光色
      P.box([0.09, 0.01, 0.6], [0, 0.012, -0.75], SHADOW, 'plain'),
      P.box([0.09, 0.01, 0.6], [0.25, 0.012, -0.6], SHADOW, 'plain', [0, -0.35, 0]),
      P.box([0.09, 0.01, 0.6], [-0.25, 0.012, -0.6], SHADOW, 'plain', [0, 0.35, 0])
    ],
    pose: { PRX: 0.3, LLX: -1.3, SLX: 1.25, LRX: -0.55, SRX: 1.0, LLZ: 0.18, LRZ: -0.12, CRX: 0.55, HRX: -0.75, ALX: 1.1, ALZ: 0.3, ARX: 1.15, ARZ: -0.3, FRX: -0.1 },
    // 披风往后平着飘（新的长披风抬到 1.05 会翻到头上，从背后看不见头盔）
    poseFn: function (S, a, C) { S[C.KX] = 0.45 + 0.08 * Math.sin(a.t * 14); },
    anim: { pulse: 0.05 },
    trail: ['shadow'], trailAir: ['shadow'], trailAt: [[0, 0.05, -0.6], [0.3, 0.05, -0.4], [-0.3, 0.05, -0.4]],
    twist: { kind: 'shadow', evade: 0.3 }
  };

  // ---- 15 养蜂骑士：蜂蜜浪（琥珀色的一道浪，浪尖亮晶晶） ----
  var HONEY = 0xd89a20, HONEY_L = 0xf0b030, HONEY_TIP = 0xffe080;
  RIDES.beekeeper = {
    name: '蜂蜜浪', desc: '一道金黄的蜂蜜浪，养蜂骑士踩上去就冲出去了。',
    stance: 'surf', goofy: true, deck: 0.12, len: 1.15,
    parts: [
      P.tbox([0.38, 0.56, 1.15, 0.09, 0.09], [0, 0.06, 0.05], HONEY, 'plain', [H, 0, 0]),
      P.box([0.5, 0.12, 0.18], [0, 0.14, -0.48], HONEY_L, 'plain', [0.5, 0, 0]),
      P.box([0.42, 0.1, 0.16], [0, 0.26, -0.56], HONEY_L, 'plain', [1.1, 0, 0]),
      P.box([0.3, 0.08, 0.12], [0, 0.36, -0.52], HONEY_L, 'plain', [1.9, 0, 0]),
      P.knob(0.05, [0.12, 0.41, -0.47], HONEY_TIP, '!plain'), P.knob(0.05, [-0.1, 0.42, -0.5], HONEY_TIP, '!plain'),
      P.knob(0.05, [0.02, 0.37, -0.42], HONEY_TIP, '!plain'), P.knob(0.045, [0.2, 0.21, -0.38], HONEY_TIP, '!plain'),
      P.knob(0.04, [-0.22, 0.19, -0.4], HONEY_TIP, '!plain')
    ],
    trail: ['honey'], trailAt: [[0.15, 0.05, -0.55], [-0.15, 0.05, -0.55], [0, 0.4, -0.5]]
  };

  // ---- 16 渔夫骑士：冰晶雪橇 ----
  var ICE_W = 0xdcefff, ICE = 0xa8f0ff;
  RIDES.fisher = {
    name: '冰晶雪橇', desc: '冬天去河上冰钓时坐的雪橇。',
    stance: 'sit', seat: 0.26, len: 1.15,
    parts: [
      P.box([0.5, 0.06, 0.85], [0, 0.22, -0.02], ICE_W, 'ch_plate'),
      P.box([0.5, 0.22, 0.05], [0, 0.34, -0.44], ICE_W, 'ch_plate', [-0.25, 0, 0])
    ].concat(both(function (s) {
      return [
        P.box([0.04, 0.04, 1.15], [s * 0.22, 0.03, 0], ICE, '!plain'),
        P.box([0.04, 0.04, 0.22], [s * 0.22, 0.12, 0.62], ICE, '!plain', [-1, 0, 0]),
        P.box([0.03, 0.18, 0.03], [s * 0.22, 0.12, 0.3], ICE, '!plain'),
        P.box([0.03, 0.18, 0.03], [s * 0.22, 0.12, -0.3], ICE, '!plain'),
        P.gem(0.07, [s * 0.22, 0.5, -0.45], ICE, '!plain', null, [0.6, 1.8, 0.6])
      ];
    })),
    // 右手放在身侧稍后，鱼竿越过腿朝前上方挑在雪橇头上
    pose: { LLX: -1.35, SLX: 0.9, LRX: -1.35, SRX: 0.9, ALX: -0.15, ALZ: 0.5, FLX: -0.6, ARX: 0.5, ARZ: -0.3, FRX: 0 },
    trail: ['frost'], trailAt: [[0.22, 0.02, -0.55], [-0.22, 0.02, -0.55]],
    twist: { kind: 'frost', every: 0.3, radius: 1.3, iceR: 1.3, life: 1.8, freeze: 0.4, cooldown: 1.2, minSpeed: 4 }
  };

  // ---- 17 铁匠骑士：铁坩埚（黑铁坩埚里烧得通红，左手拿长火钳当桨） ----
  RIDES.smith = {
    name: '铁坩埚', desc: '铁匠坐进坩埚，拿火钳当桨，火星四溅。',
    stance: 'sit', seat: 0.16, len: 0.85,
    parts: [
      P.lathe([10, 0.2, 0.0, 0.34, 0.06, 0.4, 0.2, 0.38, 0.3, 0.33, 0.31], [0, 0, 0], 0x2a2a30, 'metal'),
      P.cyl([0.2, 0.2, 0.012, 10], [0, 0.006, 0], 0x22222a, 'metal'),
      P.cyl([0.33, 0.33, 0.02, 10], [0, 0.29, 0], 0x8a3010, '!plain'),   // '!' 会把颜色调亮 2.4 倍：这样看起来是通红的橙色
      P.p('torus', [0.37, 0.03, 4, 20], [0, 0.31, 0], 0x4a4e56, 'metal', [H, 0, 0])
    ],
    // 长火钳：两根铁杆在轴那里交叉，头上两片钳口
    attach: function (B) {
      return [{ bone: 'foreL', at: [0, -B.fore - 0.06, 0.012], parts: [
        P.box([0.022, 0.62, 0.022], [0.012, -0.27, 0.02], 0x3a3e44, 'metal', [0, 0, 0.05]),
        P.box([0.022, 0.62, 0.022], [-0.012, -0.27, 0.02], 0x3a3e44, 'metal', [0, 0, -0.05]),
        P.knob(0.022, [0, -0.1, 0.02], 0x6a6e76, 'metal'),
        P.box([0.03, 0.09, 0.04], [0.03, -0.6, 0.02], 0x2a2e34, 'metal', [0, 0, -0.25]),
        P.box([0.03, 0.09, 0.04], [-0.03, -0.6, 0.02], 0x2a2e34, 'metal', [0, 0, 0.25])
      ] }];
    },
    pose: { LLX: -1.85, SLX: 1.75, LRX: -1.85, SRX: 1.75, LLZ: 0.3, LRZ: -0.3, PRX: -0.15, ARX: -0.55, ARZ: -0.35, FRX: -0.7 },
    // 左手拿火钳划船（跑起来才划）
    poseFn: function (S, a, C) {
      var k = clamp(((a.hs || 0) - 2) / 4, 0, 1);
      S[C.ALX] = -0.6 + 0.5 * Math.sin(a.t * 4) * k; S[C.ALZ] = 0.55; S[C.FLX] = -0.25;
    },
    trail: ['spark'], trailAt: [[0, 0.32, 0], [0.2, 0.32, 0.1], [-0.2, 0.32, -0.1]], trailColor: { spark: 0xff9a3a }
  };

  // ---- 18 魔术骑士：大扑克牌（牌背红金魔术花纹，牌面一顶冒出兔耳朵的高礼帽） ----
  var CARD = 0xf2efe6, HAT = 0x1a1a22;
  RIDES.magician = {
    name: '大扑克牌', desc: '魔术师的大扑克牌，一翻就能站上去滑。',
    stance: 'surf', deck: 0.06, len: 0.96, pivot: 0.04,
    parts: [
      P.box([0.64, 0.03, 0.96], [0, 0.04, 0], CARD, 'plain'),
      P.box([0.56, 0.004, 0.88], [0, 0.057, 0], 0xffffff, 'rd_magic'),
      P.box([0.6, 0.006, 0.016], [0, 0.058, 0.455], GOLD_C, 'gold'), P.box([0.6, 0.006, 0.016], [0, 0.058, -0.455], GOLD_C, 'gold'),
      P.box([0.016, 0.006, 0.926], [0.296, 0.058, 0], GOLD_C, 'gold'), P.box([0.016, 0.006, 0.926], [-0.296, 0.058, 0], GOLD_C, 'gold'),
      // 牌面（朝下，翻牌时才看得见）：帽檐、帽筒、红帽带，帽筒里冒出两只兔耳朵
      P.box([0.36, 0.004, 0.05], [0, 0.021, -0.2], HAT, 'plain'),
      P.box([0.22, 0.004, 0.24], [0, 0.021, -0.06], HAT, 'plain'),
      P.box([0.22, 0.0045, 0.045], [0, 0.0205, -0.15], 0xc8202e, 'plain'),
      P.box([0.06, 0.004, 0.22], [0.055, 0.021, 0.16], 0xf4f2ec, 'plain', [0, -0.18, 0]),
      P.box([0.06, 0.004, 0.22], [-0.055, 0.021, 0.16], 0xf4f2ec, 'plain', [0, 0.18, 0]),
      P.box([0.026, 0.0045, 0.15], [0.058, 0.0205, 0.17], 0xf0a0b0, 'plain', [0, -0.18, 0]),
      P.box([0.026, 0.0045, 0.15], [-0.058, 0.0205, 0.17], 0xf0a0b0, 'plain', [0, 0.18, 0])
    ],
    anim: { cardFlip: true },
    trail: ['card'], trailAir: ['card'], trailAt: [[0.3, 0.06, -0.45], [-0.3, 0.06, -0.45]]
  };

  // ---- 19 攻城骑士：云梯（两根侧杆 + 六根横档 + 前头两只铁钩，悬空飞；木槌先收起来） ----
  RIDES.engineer = {
    name: '云梯', desc: '攻城骑士踩着云梯飞——云梯本来就是攻城用的梯子。',
    stance: 'surf', deck: 0.05, hover: 0.3, len: 1.4, hide: 'gearR',
    parts: both(function (s) {
      var x = s * 0.17;
      return [
        P.box([0.05, 0.05, 1.4], [x, 0.04, 0], 0x8a5a2a, 'wood'),
        P.p('ch_arc', [0.06, 0.014, 4, 8, PI], [x, 0.065, 0.7], IRON, 'metal', [0, H, 0]),
        P.cone([0.02, 0.06, 4], [x, 0.045, 0.76], IRON, 'metal', [PI, 0, 0])
      ];
    }).concat([-0.6, -0.36, -0.12, 0.12, 0.36, 0.6].map(function (z) {
      return P.cyl([0.018, 0.018, 0.34, 6], [0, 0.05, z], 0x9a6a3a, 'wood', [0, 0, H]);
    })),
    anim: { bob: [0.03, 2.1], roll: [0.04, 1.4] },
    trail: ['chip', 'dust'], trailAir: ['chip', 'dust'], trailAt: [[0.17, 0.04, -0.7], [-0.17, 0.04, -0.7], [0, 0.04, -0.6]]
  };

  // ---- 20 驯鹰骑士：大羽毛（猎隼的棕色羽毛，带奶白横纹） ----
  var FEATHER = 0x8a6a40, BAR = 0xf0e0c0;
  RIDES.falconer = {
    name: '大羽毛', desc: '踩着一根猎隼掉下的大羽毛冲浪。',
    stance: 'surf', deck: 0.08, len: 1.4,
    parts: [
      P.tbox([0.12, 0.44, 0.6, 0.025, 0.03], [0, 0.05, 0.3], FEATHER, 'ch_feather', [H, 0, 0]),
      P.tbox([0.44, 0.2, 0.55, 0.03, 0.025], [0, 0.05, -0.275], FEATHER, 'ch_feather', [H, 0, 0]),
      P.box([0.18, 0.006, 0.045], [0, 0.067, 0.45], BAR, 'ch_feather'),
      P.box([0.3, 0.006, 0.05], [0, 0.068, 0.2], BAR, 'ch_feather'),
      P.box([0.32, 0.006, 0.05], [0, 0.068, -0.15], BAR, 'ch_feather'),
      P.box([0.23, 0.006, 0.045], [0, 0.067, -0.42], BAR, 'ch_feather'),
      P.box([0.03, 0.03, 1.4], [0, 0.07, -0.05], 0xf0e6cc, 'bone')
    ],
    anim: { flutter: true },
    trail: ['feather'], trailAir: ['feather'], trailAt: [[0, 0.08, -0.6], [0.2, 0.08, -0.4], [-0.2, 0.08, -0.4]],
    twist: { kind: 'dive', gravity: 2, gain: 0.45, cap: 1.8, minDive: 0.25 }
  };

  // ---- 21 猫骑士：宝箱（猫一定要坐箱子） ----
  var CHEST = 0x7a4e2a;
  RIDES.catknight = {
    name: '宝箱', desc: '猫一定要坐箱子，宝箱也不例外。',
    stance: 'sit', seat: 0.42, len: 0.62,
    parts: [
      P.box([0.46, 0.3, 0.62], [0, 0.15, 0], CHEST, 'wood'),
      P.cyl([0.23, 0.23, 0.62, 10], [0, 0.3, 0], CHEST, 'wood', [H, 0, 0], [1, 1, 0.45]),
      P.box([0.48, 0.32, 0.05], [0, 0.16, 0.2], GOLD_C, 'gold'), P.box([0.48, 0.32, 0.05], [0, 0.16, -0.2], GOLD_C, 'gold'),
      P.cyl([0.24, 0.24, 0.05, 10], [0, 0.3, 0.2], GOLD_C, 'gold', [H, 0, 0], [1, 1, 0.47]),
      P.cyl([0.24, 0.24, 0.05, 10], [0, 0.3, -0.2], GOLD_C, 'gold', [H, 0, 0], [1, 1, 0.47]),
      P.box([0.48, 0.03, 0.64], [0, 0.3, 0], 0x5a361c, 'wood'),
      P.box([0.08, 0.1, 0.03], [0, 0.24, 0.32], GOLD_C, 'gold'),
      P.box([0.025, 0.035, 0.01], [0, 0.23, 0.337], 0x2a1c14, 'plain'),
      P.cyl([0.05, 0.05, 0.015, 8], [0.12, 0.312, 0.31], GOLD_C, 'gold', [1.2, 0, 0.2]),
      P.cyl([0.045, 0.045, 0.015, 8], [-0.1, 0.315, 0.315], GOLD_C, 'gold', [1.4, 0.3, -0.3])
    ],
    pose: { TX: -0.85, ALX: -0.5, ALZ: 0.35, FLX: -0.7, ARX: -0.3, ARZ: -0.3, CRX: 0.2 },
    trail: ['glint', 'dust'], trailAt: [[0, 0.45, -0.25], [0.2, 0.12, -0.32], [-0.2, 0.12, -0.32]]
  };
})();

// ============================================================
//  坐骑系统
// ============================================================
var Ride = { geo: {}, colors: {}, SPIN_MAX: 22 };
Ride.v1 = new THREE.Vector3();

Ride.ease = function (cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-dt * rate)); };
Ride.easeOutBack = function (x) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); };
Ride.smooth = function (x) { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
Ride.col = function (hex) { return Ride.colors[hex] || (Ride.colors[hex] = new THREE.Color(hex)); };

// 零件 → 普通几何体（用角色的零件函数：贴图名前面的 '!' 表示发光；骨骼权重不要）
Ride.geoOf = function (parts) {
  var out = { pos: [], nor: [], col: [], uv: [], si: [], sw: [] };
  CHAR_MODELS.addParts(out, parts, 0, [0, 0, 0]);
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(out.pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(out.nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(out.col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(out.uv, 2));
  g.computeBoundingSphere();
  return g;
};

// 每个坐骑的几何体只建一次（挂在身体骨骼上的零件和体型有关，按角色缓存；角色和模型一一对应）
Ride.build = function (id, B) {
  if (Ride.geo[id]) return Ride.geo[id];
  var d = RIDES[id];
  // 会晃的零件（swing）和会转的零件放在同一个列表里：amp 不为 0 的是晃的
  var spinsOf = function (list) {
    return (list || []).map(function (s) { return { geo: Ride.geoOf(s.parts), at: s.at || [0, 0, 0], r: s.r || 0.05, axis: s.axis || 'x', rate: s.rate || 0, amp: s.amp || 0 }; });
  };
  var c = { main: d.parts && d.parts.length ? Ride.geoOf(d.parts) : null, spins: spinsOf(d.spin).concat(spinsOf(d.swing)), att: [] };
  var att = typeof d.attach === 'function' ? d.attach(B) : (d.attach || []);
  att.forEach(function (q) { c.att.push({ bone: q.bone, at: q.at || [0, 0, 0], geo: Ride.geoOf(q.parts), spins: spinsOf(q.spin) }); });
  Ride.geo[id] = c;
  return c;
};

// 坐骑下面的一小块椭圆影子（贴着地面，跟着坡度斜；在空中缩没，空中的高度感交给角色本来的圆影子）
Ride.shadowGeo = function () {
  if (!Ride._sg) Ride._sg = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
  return Ride._sg;
};
Ride.shadowMat = function () {
  if (!Ride._sm) Ride._sm = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
  return Ride._sm;
};

// 骨盆高度：坐着按座位高度；站、蹲按脚底正好踩在踏板上；跪按膝盖贴地；趴按固定高度（都在身体坐标里，站立时脚底 = 0）
Ride.calib = function (B, d) {
  var S = new Float32Array(CHA.N), st = d.stance, adj = d.py || 0, lo;
  CHAR_MODELS.stanceBase(S, d);
  if (st === 'sit') return (d.seat || 0) + 0.06 - B.hip + adj;
  if (st === 'straddle') return (d.seat || 0) + 0.05 - B.hip + adj;
  if (st === 'prone') return 0.2 - B.hip + adj;
  lo = CHAR_MODELS.legLow(B, S);
  if (st === 'kneel') return 0.035 - lo.knee + adj;
  return (d.deck || 0) - lo.sole + adj;
};

// 身体侧着站时（surf）上身转向一边，披风会往侧面支出去：把披风往回转，让它朝坐骑的尾巴飘
Ride.capeYaw = function (d) {
  var S = new Float32Array(CHA.N);
  CHAR_MODELS.stanceBase(S, d);
  return -(S[CHA.PRY] + S[CHA.CRY]);
};

// 挂到角色模型上（P.reset 建好模型以后调用；菜单的预览模型也用）。返回坐骑状态，没有坐骑就返回 null
Ride.attach = function (body, id) {
  var d = RIDES[id], u = body && body.userData;
  if (!d || !u || !u.bones) return null;
  if (u.ride) return u.ride;
  var c = Ride.build(id, u.B), mat = MODEL.material();
  var root = new THREE.Group(), pivot = new THREE.Group(), inner = new THREE.Group();
  var py = d.pivot != null ? d.pivot : (d.deck != null ? Math.max(0.03, d.deck - 0.03) : (d.seat || 0.1) * 0.5);
  root.name = 'ride';
  root.visible = false;
  root.position.z = d.shift || 0;
  pivot.position.y = py;
  inner.position.y = -py;
  root.add(pivot);
  pivot.add(inner);
  if (c.main) inner.add(new THREE.Mesh(c.main, mat));
  var mkSpins = function (list, parent) {
    return list.map(function (s) {
      var m = new THREE.Mesh(s.geo, mat);
      m.position.fromArray(s.at);
      parent.add(m);
      return { m: m, r: s.r, axis: s.axis, rate: s.rate, amp: s.amp };
    });
  };
  var spins = mkSpins(c.spins, inner);
  var shadow = new THREE.Mesh(Ride.shadowGeo(), Ride.shadowMat());
  shadow.renderOrder = 1;
  shadow.scale.set(d.shadowW || 0.45, 1, (d.len || 1) * 0.5 + 0.06);
  root.add(shadow);
  var att = c.att.map(function (q) {
    var bone = u.bones[q.bone];
    if (!bone) return null;
    var m = new THREE.Mesh(q.geo, mat);
    m.position.fromArray(q.at);
    m.scale.set(1, 0.001, 1);
    m.visible = false;
    bone.add(m);
    return { m: m, spins: mkSpins(q.spins, m) };
  }).filter(Boolean);
  body.add(root);
  body.rotation.order = 'YXZ';
  var rs = {
    id: id, def: d, tw: d.twist || {}, root: root, pivot: pivot, inner: inner, spins: spins, shadow: shadow, att: att,
    hide: [].concat(d.hide || []).map(function (n) { return u.bones[n]; }).filter(Boolean), py: Ride.calib(u.B, d), capeYaw: Ride.capeYaw(d), bodyScale: u.B.scale || 1,
    w: 0, shown: false, t: 0, ground: true, airT: 0, ollie: 0, squash: 0, pitch: 0, roll: 0,
    wheelV: 0, flipP: 0, flipDone: false, cflipT: 0, cairDone: false, dive: 0, kickPh: 0, kickW: 0,
    emit: 0, emitI: 0, groundK: 1, capeAng: null
  };
  // 菜单里亮出坐骑时侧过身：站着的转到板子侧面朝镜头（人正好面朝镜头），其他的转成四分之三侧面
  rs.menuTurn = d.stance === 'surf' ? rs.capeYaw * 1.4 : 0.7;
  u.ride = rs;
  return rs;
};

// 坐骑坐标里的一点 → 世界坐标（共用一个向量，马上用掉）
Ride.rootPoint = function (rs, x, y, z) {
  rs.root.updateWorldMatrix(true, false);
  return rs.root.localToWorld(Ride.v1.set(x, y, z));
};

// ---------------- 拖尾粒子 ----------------
Ride.TRAIL = {
  spark: function (x, y, z, c) {
    FX.burst(x, y, z, 2, c || 0xffc040, 3.8, 0.085);
    if (Math.random() < 0.5) FX.flash(x, y + 0.08, z, 0.42, c || 0xffc040, 0.12, 2);
  },
  // 尘土：贴地慢慢升起、慢慢变小的一团（不像方块粒子那样蹦起来）
  dust: function (x, y, z, c) {
    FX.mote(x + rand(-0.12, 0.12), y + 0.08, z + rand(-0.12, 0.12), c || 0xd6cbb0, rand(0.2, 0.3), rand(0.25, 0.55), rand(0.5, 0.75));
    FX.mote(x + rand(-0.2, 0.2), y + 0.05, z + rand(-0.2, 0.2), c || 0xc4b898, rand(0.14, 0.22), rand(0.2, 0.4), rand(0.4, 0.6));
  },
  chip: function (x, y, z, c) { FX.burst(x, y + 0.03, z, 2, c || 0x8a6440, 2.6, 0.1); },
  // 雪尘：白色的小团，飘得慢
  snow: function (x, y, z) { FX.mote(x + rand(-0.12, 0.12), y + 0.04, z + rand(-0.12, 0.12), 0xf0f4ff, rand(0.08, 0.14), rand(0.12, 0.3), rand(0.6, 0.9)); },
  // 白烛的火星：偶尔一点
  candle: function (x, y, z) { if (Math.random() < 0.3) FX.flash(x + rand(-0.1, 0.1), y + rand(0.05, 0.25), z + rand(-0.1, 0.1), 0.22, 0xfff2c0, 0.3, 0); },
  frost: function (x, y, z) { FX.mote(x + rand(-0.06, 0.06), y + 0.05, z, 0xbff0ff, 0.09, 0.55, 0.85); },
  // 花瓣：粉色、白色，慢慢飘下来
  petal: function (x, y, z) { FX.mote(x + rand(-0.15, 0.15), y + 0.5, z + rand(-0.15, 0.15), Math.random() < 0.65 ? 0xffa0c8 : 0xfff4f8, 0.1, -0.4, 1.1); },
  glint: function (x, y, z, c) { FX.flash(x + rand(-0.12, 0.12), y + rand(0, 0.25), z + rand(-0.12, 0.12), 0.55, c || 0xffd84a, 0.32, 2); },
  // 颜料点：红、蓝、黄、绿轮着来，贴地
  paint: function (x, y, z) {
    Ride.paintI = ((Ride.paintI || 0) + 1) % 4;
    FX.mote(x + rand(-0.1, 0.1), y + 0.03, z + rand(-0.1, 0.1), Ride.PAINT_C[Ride.paintI], rand(0.08, 0.12), 0.12, 0.7);
  },
  // 蜂蜜滴：琥珀色，往下掉、落地弹一下
  honey: function (x, y, z) { FX.part(x + rand(-0.08, 0.08), y + 0.05, z + rand(-0.08, 0.08), rand(-0.5, 0.5), rand(0.8, 1.8), rand(-0.5, 0.5), Math.random() < 0.7 ? 0xf0b030 : 0xffd060, 0.08, rand(0.4, 0.7)); },
  // 星尘：金色的小光点
  stardust: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), Math.random() < 0.75 ? 0xffe26a : 0xfff6c0, 0.08, 0.6, 0.6); },
  shadow: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), 0x15121a, 0.16, 0.7, 0.75); },
  star: function (x, y, z) { FX.flash(x + rand(-0.1, 0.1), y + rand(-0.05, 0.15), z, 0.45, 0xffe26a, 0.35, 2); },
  violet: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), 0x8a6aff, 0.09, 0.5, 0.9); },
  feather: function (x, y, z) { FX.mote(x + rand(-0.15, 0.15), y + 0.35, z + rand(-0.15, 0.15), Math.random() < 0.6 ? 0x8a6a40 : 0xf0e0c0, 0.11, -0.35, 1.2); },
  wind: function (x, y, z) { FX.mote(x, y, z, 0xf2f6ff, 0.06, 0.12, 0.4); },
  card: function (x, y, z) { FX.mote(x, y, z, Math.random() < 0.5 ? 0xc8202e : 0xe2b23a, 0.07, 0.5, 0.5); }
};
Ride.PAINT_C = [0xd83a3a, 0x3a6ad8, 0xe8c030, 0x4aa84a];

Ride.emitOne = function (rs, g, air) {
  var d = rs.def, pts = d.trailAt, types = (air ? d.trailAir : d.trail) || d.trail;
  if (!pts || !pts.length || !types || !types.length) return;
  var i = rs.emitI++, p = pts[i % pts.length], type = types[Math.floor(i / pts.length) % types.length];
  var fn = Ride.TRAIL[type], v;
  if (!fn) return;
  if (Array.isArray(p)) v = Ride.rootPoint(rs, p[0], p[1], p[2]);
  else {
    var bone = g.userData.bones[p.bone];
    if (!bone) return;
    bone.updateWorldMatrix(true, false);
    v = bone.localToWorld(Ride.v1.set(p.p[0], p.p[1], p.p[2]));
  }
  fn(v.x, v.y, v.z, d.trailColor && d.trailColor[type]);
};

// ---------------- 每帧 ----------------
// s：本帧的输入 { on 要不要坐骑, force0 立刻收起, hs 水平速度, ground 在地上, vy, dx/dz 下坡向量（长度 = 坡度）,
//    facing 朝向, live 发粒子（菜单里不发）, baseY 模型的基础高度, flip 外部给的翻板进度（null = 自己算）, dive 正在俯冲, push 正在蹬地 }
Ride.step = function (rs, g, a, dt, s) {
  var d = rs.def, tw = rs.tw, an = d.anim || {}, w0 = rs.w;
  rs.t += dt;
  rs.w = s.force0 ? 0 : Ride.ease(rs.w, s.on ? 1 : 0, 16, dt);
  if (!s.on && rs.w < 0.004) rs.w = 0;
  if (s.on && rs.w > 0.997) rs.w = 1;
  var w = rs.w, vis = w > 0.02;
  // 冒出来 / 收起来（带一点回滞：落地那一帧松一下键不会连着冒烟）
  if (!rs.shown && w > 0.4) {
    rs.shown = true;
    if (an.cardFlip) rs.cflipT = 0.0001;
    if (s.live) { var c0 = Ride.rootPoint(rs, 0, 0.1, 0); FX.burst(c0.x, c0.y, c0.z, 6, 0xe8e0d0, 3, 0.2); }
  } else if (rs.shown && w < 0.15) {
    rs.shown = false;
    if (s.live) { var c1 = Ride.rootPoint(rs, 0, 0.1, 0); FX.burst(c1.x, c1.y, c1.z, 4, 0xe8e0d0, 2.5, 0.18); }
  }
  // 离地、落地
  if (!s.ground) {
    if (rs.ground && s.vy > 1) rs.ollie = 1;
    rs.airT += dt;
  } else {
    if (!rs.ground && rs.airT > 0.15 && w > 0.4) rs.squash = 1;
    rs.airT = 0; rs.flipDone = false; rs.flipP = 0; rs.cairDone = false;
  }
  rs.ground = s.ground;
  rs.ollie = Math.max(0, rs.ollie - dt * 3.2);
  rs.squash = Math.max(0, rs.squash - dt * 6);
  // 翻板（滑板）：外面给了进度就用外面的，没有就自己算（每次腾空超过 0.3 秒翻一圈）
  var flip = 0;
  if (tw.kind === 'board') {
    if (s.flip != null) flip = s.flip > 0 && s.flip < 1 ? s.flip : 0;
    else {
      if (!s.ground && w > 0.6 && !rs.flipDone && rs.airT > (tw.flipMin || 0.3)) { rs.flipDone = true; rs.flipP = 0.0001; }
      if (rs.flipP > 0) { rs.flipP += dt / (tw.flipTime || 0.35); if (rs.flipP >= 1) rs.flipP = 0; }
      flip = rs.flipP;
    }
  }
  // 扑克牌：出现时翻一下，空中再翻一下
  if (an.cardFlip) {
    if (!s.ground && w > 0.6 && !rs.cairDone && rs.airT > 0.25) { rs.cairDone = true; rs.cflipT = 0.0001; }
    if (rs.cflipT > 0) { rs.cflipT += dt; if (rs.cflipT > 0.36) rs.cflipT = 0; }
  }
  rs.dive = Ride.ease(rs.dive, s.dive && w > 0.5 ? 1 : 0, 10, dt);
  // 蹬地（滑板推着走）
  rs.kickW = Ride.ease(rs.kickW, s.push && s.ground ? 1 : 0, 10, dt);
  if (rs.kickW > 0.01) rs.kickPh = (rs.kickPh + dt / 0.55) % 1; else rs.kickPh = 0;
  // 轮子：地上跟着速度转，空中慢慢停
  rs.wheelV = s.ground ? s.hs : rs.wheelV * Math.exp(-dt * 0.7);

  // ---- 姿势：按新的权重重新摆一次（P.animate 刚摆的是上一帧的权重） ----
  a.rideDef = d; a.ride = w; a.ridePY = rs.py; a.hs = s.hs; a.flip = flip; a.dive = rs.dive; a.kick = rs.kickPh; a.kickW = rs.kickW;
  var u = g.userData, b = u.bones, i;
  if (w > 0 || w0 > 0) CHAR_MODELS.pose(g, a);
  // 发条钥匙：踩着滚轮时转得快 3 倍（角度累加，不会跳）
  if (an.capeSpin && u.def.capeSpin) {
    if (rs.capeAng === null) rs.capeAng = a.t * u.def.capeSpin;
    rs.capeAng += dt * u.def.capeSpin * (1 + (an.capeSpin - 1) * w);
    b.cape.rotation.set(0, 0, rs.capeAng);
  }
  else if (rs.capeYaw) {
    b.cape.rotation.order = 'YXZ';
    b.cape.rotation.y = rs.capeYaw * w;
  }
  // 手上 / 背上的东西“跳”到身下：骨骼缩小
  for (i = 0; i < rs.hide.length; i++) rs.hide[i].scale.setScalar(Math.max(0.001, 1 - w));

  // ---- 坐骑本身 ----
  var root = rs.root;
  root.visible = vis;
  var tilt = 0, roll = 0, bob = 0;
  if (vis) {
    var sc = 0.55 + 0.45 * Ride.easeOutBack(w), sq = rs.squash, pulse = an.pulse ? 1 + an.pulse * Math.sin(rs.t * 6) : 1;
    root.scale.set(sc * (1 + 0.08 * sq) * pulse, sc * (1 - 0.2 * sq), sc * (1 + 0.08 * sq) * pulse);
    // 翻转：滑板绕长轴转一整圈（flipAxis 'y'：整个人连坐骑平着转一圈，P.animate 每帧会把朝向摆回去）；
    // 扑克牌翻两面；大羽毛高速时抖
    var rz = 0, rx = 0;
    if (flip > 0) {
      if (d.flipAxis === 'y') g.rotation.y += Math.PI * 2 * Ride.smooth(flip);
      else rz = -Math.PI * 2 * Ride.smooth(flip);
    }
    if (rs.cflipT > 0) rz = Math.PI * 2 * Ride.smooth(rs.cflipT / 0.36);
    if (an.flutter) { var fk = clamp((s.hs - 15) / 10, 0, 1); rz += 0.07 * fk * Math.sin(rs.t * 23); rx += 0.04 * fk * Math.sin(rs.t * 17 + 1); }
    rs.pivot.rotation.set(rx, 0, rz);
    // 轮子（画面上的转速封顶：真实转速每帧转半圈以上，看起来会倒着转）；马镫这类晃的零件：跑得越快晃得越大
    var swk = 0.4 + 0.6 * clamp(s.hs / 12, 0, 1);
    for (i = 0; i < rs.spins.length; i++) {
      var sp = rs.spins[i];
      if (sp.amp) { sp.m.rotation.x = sp.amp * Math.sin(sp.rate * rs.t) * swk; continue; }
      var da = sp.rate ? sp.rate * dt : Math.min(rs.wheelV / sp.r, Ride.SPIN_MAX) * dt;
      if (sp.axis === 'y') sp.m.rotation.y += da; else sp.m.rotation.x += da;
    }
    // 贴地的影子：在地上才有，跟着身体抬高往下补回地面
    rs.groundK = Ride.ease(rs.groundK, s.ground ? 1 : 0, 12, dt);
    var lift0 = ((d.hover || 0) + (d.lift || 0)) * w;
    rs.shadow.visible = rs.groundK > 0.05;
    rs.shadow.position.y = (0.02 - lift0) / (rs.bodyScale * Math.max(0.2, root.scale.y));
    var shk = rs.groundK * Math.min(1, w * 1.3);
    rs.shadow.scale.set((d.shadowW || 0.45) * shk, 1, ((d.len || 1) * 0.5 + 0.06) * shk);
    // 外观小动画：上下浮动、左右晃、摇篮一样前后摇
    if (an.bob) bob = an.bob[0] * Math.sin(rs.t * an.bob[1] * 2);
    if (an.roll) roll = an.roll[0] * Math.sin(rs.t * an.roll[1] * 2);
    if (an.rock) tilt = an.rock[0] * Math.sin(rs.t * an.rock[1] * 2);
  }
  // ---- 整个人跟着坐骑：顺着坡俯仰、侧倾，悬空的抬高 ----
  var pt = 0, rt = 0;
  if (s.ground) {
    var fx = Math.sin(s.facing), fz = Math.cos(s.facing), lx = Math.cos(s.facing), lz = -Math.sin(s.facing);
    pt = Math.atan(clamp(s.dx * fx + s.dz * fz, -1.2, 1.2));
    rt = -Math.atan(clamp(s.dx * lx + s.dz * lz, -1.2, 1.2));
  } else {
    pt = clamp(-s.vy / Math.max(s.hs, 1), -0.5, 0.5) * 0.6;
  }
  pt -= 0.35 * rs.ollie;
  rs.pitch = Ride.ease(rs.pitch, clamp(pt, -0.6, 0.6), 10, dt);
  rs.roll = Ride.ease(rs.roll, clamp(rt, -0.5, 0.5), 10, dt);
  g.rotation.x = (rs.pitch + tilt) * w;
  g.rotation.z = (rs.roll + roll) * w;
  g.position.y = (s.baseY || 0) + ((d.hover || 0) + (d.lift || 0) + bob) * w * rs.bodyScale;

  // ---- 挂在骨骼上的零件：从靴底 / 手里弹出来 ----
  for (i = 0; i < rs.att.length; i++) {
    var q = rs.att[i];
    q.m.visible = vis;
    q.m.scale.set(1, Math.max(0.001, w), 1);
    for (var j = 0; j < q.spins.length; j++) q.spins[j].m.rotation.x += Math.min(rs.wheelV / q.spins[j].r, Ride.SPIN_MAX) * dt;
  }

  // ---- 拖尾和特效（只在游戏里） ----
  if (s.live && vis) {
    var air = !s.ground;
    if (w > 0.5 && s.hs > 1.5 && (!air || d.trailAir)) {
      rs.emit += 20 * clamp((s.hs - 3) / 15, 0.2, 1) * dt;
      var guard = 0;
      while (rs.emit >= 1 && guard++ < 6) { rs.emit -= 1; Ride.emitOne(rs, g, air); }
      if (rs.emit > 1) rs.emit = 0;
    }
    if (d.fx) d.fx(rs, g, dt, s);
  }
};

// 骑马、复活之类需要马上收起：不等动画
Ride.applyOff = function (rs, g) {
  rs.w = 0; rs.shown = false; rs.flipP = 0; rs.cflipT = 0; rs.dive = 0; rs.kickW = 0;
  rs.root.visible = false;
  var i;
  for (i = 0; i < rs.hide.length; i++) rs.hide[i].scale.setScalar(1);
  for (i = 0; i < rs.att.length; i++) { rs.att[i].m.visible = false; rs.att[i].m.scale.set(1, 0.001, 1); }
  g.rotation.x = 0; g.rotation.z = 0; g.position.y = 0;
  var b = g.userData && g.userData.bones;
  if (b && b.cape && !(g.userData.def && g.userData.def.capeSpin)) b.cape.rotation.y = 0;
};

// ---------------- 玩家 ----------------
Ride.state = function () { return P.body && P.body.userData && P.body.userData.ride || null; };

// 守墓骑士推着方向键、还没到最高速时，后脚隔一会儿蹬一下地
Ride.pushing = function (rs, hs) {
  if (rs.tw.kind !== 'board' || !P.onGround || !P.sliding) return false;
  var mv = typeof Input !== 'undefined' && Input.move ? Math.min(1, Math.sqrt(Input.move.x * Input.move.x + Input.move.y * Input.move.y)) : 0;
  if (mv < 0.2) return false;
  var max = P.BASE_SPEED * (P.st.moveSpeed || 1) * (typeof Passive !== 'undefined' && Passive.speedMult ? Passive.speedMult() : 1);
  return hs < max * mv * 0.97;
};

Ride.update = function (dt) {
  var rs = Ride.state();
  if (!rs || !P.anim) return;
  Ride.wrapHpBar();
  var mount = typeof MX !== 'undefined' && !!MX.mount;
  var riding = P.riding !== undefined ? P.riding : (P.sliding || P.airRide);
  var hs = P.speed(), n = P.onGround ? P.groundNormal(P.pos.x, P.pos.z, P.pos.y) : null;
  if (mount && rs.w > 0) Ride.applyOff(rs, P.body);
  Ride.step(rs, P.body, P.anim, dt, {
    on: !!riding && P.alive && !mount, force0: mount, hs: hs, ground: P.onGround, vy: P.vel.y,
    dx: n ? n.x : 0, dz: n ? n.z : 0, facing: P.facing, live: true, baseY: 0,
    flip: typeof P.flipT === 'number' ? P.flipT : null, dive: P.diveT > 0 && !P.onGround, push: Ride.pushing(rs, hs)
  });
};

// 脚下的血条：踩着坐骑时往镜头那边挪到坐骑尾巴后面（不压在坐骑上）；P.updateHpBar 算完以后调用
Ride.hpBar = function (cam) {
  var rs = Ride.state(), bar = P.hpBar;
  if (!rs || rs.w < 0.02 || !bar || !bar.visible || (typeof MX !== 'undefined' && MX.mount)) return;
  var dx = cam.position.x - P.pos.x, dz = cam.position.z - P.pos.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
  var k = 0.42 + Math.max(0, (rs.def.len || 1) * 0.5 * rs.bodyScale - 0.25) * rs.w;
  bar.position.x = dx / dl * k; bar.position.z = dz / dl * k;
};
Ride.wrapHpBar = function () {
  if (Ride._hb || typeof P === 'undefined' || !P.updateHpBar) return;
  Ride._hb = true;
  var hb = P.updateHpBar;
  P.updateHpBar = function (cam) { var r = hb.apply(this, arguments); Ride.hpBar(cam); return r; };
};

// 镜头高度：坐、趴、跪、蹲压低 0.45；站在板上 0.2；悬空的几乎不压；空中不压
Ride.camTarget = function () {
  var rs = Ride.state(), classic = P.sliding ? -0.45 : 0;
  if (!rs || rs.w < 0.02) return classic;
  if (!P.onGround) return 0;
  var d = rs.def, t = d.hover ? -0.05 : d.stance === 'surf' ? -0.2 : -0.45;
  return t * rs.w;
};

// 骑上战马：坐骑立刻收起，藏起来的东西拿回手上
Ride.forceOff = function () {
  var rs = Ride.state();
  if (!rs) return;
  Ride.applyOff(rs, P.body);
  if (P.anim) { P.anim.ride = 0; P.anim.flip = 0; P.anim.dive = 0; P.anim.kickW = 0; }
};

// ---------------- 菜单展示 ----------------
// 选中的骑士每 6 秒亮一下坐骑（1.6 秒）；Game.menuRideHold（菜单里按 R）一直亮着，方便看合不合身
Ride.showcase = function (m, a, dt, id) {
  if (!m || !RIDES[id]) return;
  var rs = m.userData.ride || Ride.attach(m, id);
  if (!rs) return;
  rs.showT = (rs.showT || 0) + dt;
  var on = !!(typeof Game !== 'undefined' && Game.menuRideHold) || rs.showT % 6 > 4.4;
  Ride.step(rs, m, a, dt, { on: on, hs: 4, ground: true, vy: 0, dx: 0, dz: 0, facing: 0, live: false, baseY: m.position.y, flip: null, dive: false, push: false });
};
