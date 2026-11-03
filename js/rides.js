'use strict';
// ============================================================
//  滑铲坐骑：按住滑铲时，每位骑士身下都会冒出一个自己的“坐骑”，地上滑、空中也能踩着
//  （骸骨骑士的棺材板是真滑板：可以一直踩着滑，空中还会翻板）
//
//  RIDES[角色 id]（CHARACTERS 的键，比如 calcium）：
//    name / desc 名字和说明；stance 姿势（surf 站 / sit 坐 / straddle 跨坐 / prone 趴 / kneel 跪 / crouch 蹲）
//    seat 座位高度（坐、跨坐）/ deck 踏板高度（站、蹲）；hover 悬空高度、lift 被轮子垫高（整个人一起抬）；len 长度（影子）
//    hide 滑铲时藏起来的随身物品（gearL 左手 / gearR 右手 / pack 背上）；goofy 反过来站
//    parts 模型零件（和 models_chars.js 一样的格式；原点在脚下地面，+Z 车头，+X 骑手的左边，单位米，跟着角色体型缩放）
//    spin 会转的零件 [{ at 转轴位置, r 半径（按速度转）或 rate 固定转速, axis 'x' / 'y', parts（相对转轴） }]
//    attach(B) 挂在身体骨骼上的零件 [{ bone, at, parts, spin }]（缩放中心在 at，弹出来时沿 Y 拉长）
//    trail / trailAir 地面、空中的拖尾粒子种类；trailAt 发射点（坐骑坐标 [x,y,z]，或 { bone, p } 骨骼上的点）
//    twist 玩法参数（player.js 读：kind 'board' / 'hover' / 'dive' / 'shadow' / 'frost' / 'moon'，friction, turn, carve, push, airGain, airBoard, uphill…）
//    pose 姿势覆盖值；poseFn(S, a, C) 动态姿势；anim 外观小动画；fx(rs, g, dt, s) 每帧额外特效
//  Ride.attach(角色模型, 角色 id)：挂上坐骑（先藏着）；Ride.update(dt)：每帧在 P.animate 摆好姿势之后调用
//  Ride.showcase(菜单模型, 姿势, dt, 角色 id)：菜单里每 6 秒亮一下坐骑；Ride.forceOff()：骑上战马时立刻收起
//  读玩家的：P.riding（= P.sliding 地面滑铲 || P.airRide 空中按住滑铲）、P.flipT 翻板进度 0~1、P.diveT 俯冲时间
// ============================================================

// 扑克牌背面：红底、白边、浅色菱形格（彩色贴图，零件用白色顶点色；不用随机数，不打乱其他贴图）
TEX.addTile('ch_cardback', function (x, y) {
  var R = [178, 30, 44], WH = [246, 238, 228], L = [236, 150, 156];
  if (x === 0 || y === 0 || x === 15 || y === 15) return WH;
  if (x === 1 || y === 1 || x === 14 || y === 14) return R;
  if (x === 2 || y === 2 || x === 13 || y === 13) return L;
  return ((x + y) % 4 === 1 || (x - y + 16) % 4 === 1) ? L : R;
});

var RIDES = {};

(function () {
  var P = CHP, PI = Math.PI, H = PI / 2;
  var STEEL = 0xc9d2dd, GOLD_C = 0xe2b23a, METAL = 0x8a8e96;
  var both = function (fn) { return fn(1).concat(fn(-1)); };

  // ---- 1 铁罐爵士：风筝盾雪橇 ----
  RIDES.oofie = {
    name: '风筝盾雪橇', desc: '把风筝盾往地上一扔就坐上去当雪橇，铁皮蹭得火星四溅。',
    stance: 'sit', seat: 0.14, len: 1.15, hide: 'gearL', shift: 0.22,
    parts: [
      P.tbox([0.22, 0.64, 1.15, 0.06, 0.06], [0, 0.07, 0], STEEL, 'ch_plate', [H, 0, 0]),
      P.tbox([0.18, 0.56, 1.04, 0.03, 0.03], [0, 0.105, 0], 0x2a55c8, 'ch_plate', [H, 0, 0]),
      P.box([0.06, 0.02, 0.82], [0, 0.125, -0.02], GOLD_C, 'gold'),
      P.box([0.44, 0.02, 0.06], [0, 0.125, -0.2], GOLD_C, 'gold'),
      P.tbox([0.06, 0.22, 0.22, 0.04, 0.06], [0, 0.13, 0.6], STEEL, 'ch_plate', [H - 0.55, 0, 0])
    ],
    // 两手抓着盾的两边
    pose: { ALX: -0.25, ALZ: 0.55, FLX: -0.35, ARX: -0.25, ARZ: -0.55, FRX: -0.35 },
    trail: ['spark', 'dust'], trailAt: [[0, 0.03, 0.55], [0.28, 0.03, -0.5], [-0.28, 0.03, -0.5]]
  };

  // ---- 2 狐狸法骑士：幸运大金币 ----
  var LUCK = 0x4af07a;
  RIDES.fox = {
    name: '幸运大金币', desc: '踩着比锅盖还大的幸运金币滑行，一路叮当闪光。',
    stance: 'surf', deck: 0.11, len: 0.96,
    spin: [{ at: [0, 0, 0], axis: 'y', rate: 4, parts: [
      P.cyl([0.48, 0.48, 0.08, 16], [0, 0.06, 0], GOLD_C, 'gold'),
      P.cyl([0.4, 0.4, 0.012, 16], [0, 0.103, 0], 0xc9962c, 'gold'),
      P.p('torus', [0.455, 0.028, 4, 24], [0, 0.1, 0], 0xf2cf5a, 'gold', [H, 0, 0]),
      P.cyl([0.075, 0.075, 0.02, 8], [0.07, 0.11, 0.07], LUCK, 'plain'),
      P.cyl([0.075, 0.075, 0.02, 8], [-0.07, 0.11, 0.07], LUCK, 'plain'),
      P.cyl([0.075, 0.075, 0.02, 8], [0.07, 0.11, -0.07], LUCK, 'plain'),
      P.cyl([0.075, 0.075, 0.02, 8], [-0.07, 0.11, -0.07], LUCK, 'plain'),
      P.knob(0.03, [0, 0.12, 0], 0x9affb0, '!plain'),
      P.box([0.025, 0.015, 0.14], [0, 0.11, -0.19], 0x2fb85a, 'plain', [0, 0.3, 0])
    ] }],
    trail: ['glint'], trailAir: ['glint'], trailAt: [[0.42, 0.1, 0], [-0.42, 0.1, 0], [0, 0.1, -0.42], [0, 0.1, 0.42]],
    trailColor: { glint: 0xffe26a }
  };

  // ---- 3 骸骨骑士：棺材板（主角坐骑：骷髅轮子的滑板，空中翻板） ----
  var CWOOD = 0x5a3a26, CWOOD_D = 0x37210f, BONE = 0xeee5c8, RUST = 0x9a5a34, VELVET = 0xa01828;
  var skullWheels = function () {
    var list = [];
    [1, -1].forEach(function (s) {
      var xo = s * 0.16, face = s * 0.1835;
      list.push(P.cyl([0.05, 0.05, 0.045, 10], [xo, 0, 0], BONE, 'bone', [0, 0, H]));
      list.push(P.cyl([0.034, 0.034, 0.05, 8], [xo, 0, 0], 0xd6caa6, 'bone', [0, 0, H]));
      // 骷髅脸：两个黑眼窝 + 鼻孔
      list.push(P.knob(0.013, [face, 0.014, 0.017], 0x15110f, 'plain', [0.5, 1, 1]));
      list.push(P.knob(0.013, [face, 0.014, -0.017], 0x15110f, 'plain', [0.5, 1, 1]));
      list.push(P.knob(0.007, [face, -0.012, 0], 0x15110f, 'plain', [0.5, 1, 1]));
    });
    return list;
  };
  var nail = function (x, z) { return P.knob(0.018, [x, 0.168, z], RUST, 'metal', [1, 0.6, 1]); };
  RIDES.calcium = {
    name: '棺材板', desc: '棺材板压不住了！拆下来装上骨头轮子当滑板，空中也能踩着滑。',
    stance: 'surf', deck: 0.165, len: 1.25, pivot: 0.13,
    parts: [
      // 深色包边（比盖子大一圈、矮一点），从上面看是一圈描边
      P.tbox([0.31, 0.47, 0.44, 0.04, 0.04], [0, 0.133, 0.39], CWOOD_D, 'wood', [H, 0, 0]),
      P.tbox([0.47, 0.31, 0.76, 0.04, 0.04], [0, 0.133, -0.19], CWOOD_D, 'wood', [H, 0, 0]),
      // 棺材盖：前面一块、后面一块，肩膀最宽
      P.tbox([0.28, 0.44, 0.42, 0.05, 0.05], [0, 0.14, 0.39], CWOOD, 'wood', [H, 0, 0]),
      P.tbox([0.44, 0.28, 0.74, 0.05, 0.05], [0, 0.14, -0.19], CWOOD, 'wood', [H, 0, 0]),
      // 翘起来的板尾
      P.box([0.28, 0.05, 0.16], [0, 0.18, -0.62], CWOOD, 'wood', [0.4, 0, 0]),
      P.box([0.3, 0.04, 0.15], [0, 0.172, -0.617], CWOOD_D, 'wood', [0.4, 0, 0]),
      // 底面的红丝绒（翻板时才看得见）
      P.tbox([0.258, 0.405, 0.42, 0.02, 0.02], [0, 0.108, 0.39], VELVET, 'cloth', [H, 0, 0]),
      P.tbox([0.405, 0.258, 0.74, 0.02, 0.02], [0, 0.108, -0.19], VELVET, 'cloth', [H, 0, 0]),
      // 金十字
      P.box([0.05, 0.012, 0.5], [0, 0.171, 0.06], GOLD_C, 'gold'),
      P.box([0.26, 0.012, 0.05], [0, 0.171, 0.2], GOLD_C, 'gold'),
      // 六颗锈钉子
      nail(0.19, 0.18), nail(-0.19, 0.18), nail(0.12, 0.52), nail(-0.12, 0.52), nail(0.12, -0.5), nail(-0.12, -0.5),
      // 轮轴 + 支架
      P.box([0.3, 0.03, 0.06], [0, 0.085, 0.34], METAL, 'metal'),
      P.box([0.3, 0.03, 0.06], [0, 0.085, -0.34], METAL, 'metal'),
      P.box([0.1, 0.03, 0.1], [0, 0.103, 0.34], 0x6a6e76, 'metal'),
      P.box([0.1, 0.03, 0.1], [0, 0.103, -0.34], 0x6a6e76, 'metal')
    ],
    spin: [
      { at: [0, 0.05, 0.34], r: 0.05, parts: skullWheels() },
      { at: [0, 0.05, -0.34], r: 0.05, parts: skullWheels() }
    ],
    // 后脚隔一会儿蹬一下地（rides.js 在推着走时给 a.kick）
    // 后脚（左脚）一圈：先收到板中间，伸直踩到板边的地上往后蹬，再抬起来放回板尾
    poseFn: function (S, a, C) {
      var k = a.kickW || 0;
      if (k <= 0.001) return;
      var ph = (a.kick || 0) * PI * 2, dn = Math.max(0, Math.sin(ph)) * k;
      S[C.LLZ] += -0.32 * Math.cos(ph) * k;
      S[C.SLX] -= 0.9 * dn; S[C.LLX] += 0.2 * dn; S[C.PY] -= 0.15 * dn;
      S[C.SLX] += 0.35 * Math.max(0, -Math.sin(ph)) * k;
      S[C.SRX] += 0.42 * dn; S[C.LRX] -= 0.21 * dn; S[C.CRX] += 0.12 * dn;
    },
    trail: ['dust', 'bonechip'], trailAt: [[0.16, 0.02, -0.34], [-0.16, 0.02, -0.34], [0.16, 0.02, 0.34], [-0.16, 0.02, 0.34]],
    twist: { kind: 'board', friction: 0.35, turn: 2.0, carve: 0.4, push: 6, airGain: 1.25, airBoard: true,
      airPush: 3, airCap: 1.3, landGrace: 0.25, ramp: 2, hitLoss: 0.3, flipMin: 0.3, flipTime: 0.35 },
    fx: function (rs, g, dt, s) {
      // 空中：眼窝里飘出橙色的小火星（每秒 2 个）
      if (s.ground || rs.w < 0.5) return;
      rs.ember = (rs.ember || 0) + dt * 2;
      if (rs.ember < 1) return;
      rs.ember -= 1;
      var head = g.userData.bones.head, v = Ride.v1;
      head.updateWorldMatrix(true, false);
      v.set(Math.random() < 0.5 ? 0.048 : -0.048, 0.228, 0.13);
      head.localToWorld(v);
      FX.mote(v.x, v.y, v.z, 0xffa640, 0.07, 0.9, 0.55);
    }
  };

  // ---- 4 胸甲猛男：胸甲肚皮滑（没有模型：趴着用胸甲当雪橇） ----
  RIDES.chad = {
    name: '胸甲肚皮滑', desc: '往前一扑，拿比头还大的胸甲当雪橇，一路蹭出金色火星。',
    stance: 'prone', len: 1.5,
    trail: ['spark', 'dust', 'spark'], trailAt: [[0, 0.05, 0.35], [0.18, 0.05, 0.25], [-0.18, 0.05, 0.25]],
    trailColor: { spark: 0xffd84a }
  };

  // ---- 5 食人魔骑士：拆下来的木门 ----
  var DOOR = 0x7a5434, IRON = 0x5a6068;
  RIDES.ogre = {
    name: '拆下来的木门', desc: '随手拆了一扇木门，坐上去就往山坡下冲。',
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

  // ---- 6 发条骑士：发条滚轮（靴底弹出来的一排小轮子） ----
  RIDES.clank = {
    name: '发条滚轮', desc: '靴底咔嗒弹出一排小滚轮，背后的发条转得飞快。',
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

  // ---- 7 盾卫女骑士：跪滑（没有模型：单膝跪地，圆盾挡在前面） ----
  RIDES.athena = {
    name: '跪滑', desc: '单膝跪地一路滑过去，圆盾挡在身前，金护膝蹭出一串火星。',
    stance: 'kneel', len: 1.0,
    pose: { LLX: -0.15, SLX: 1.55, LLZ: 0.12, LRX: -1.35, LRZ: -0.1, SRX: 1.3, PRX: -0.05, CRX: 0.05,
      ALX: -1.35, ALZ: 0.15, FLX: -0.2, FLZ: -1.2, ARX: 1.05, ARZ: -0.2, FRX: -0.1, HRX: 0.05 },
    trail: ['spark', 'dust'], trailAt: [{ bone: 'shinL', p: [0, -0.02, 0.06] }, { bone: 'shinL', p: [0, -0.2, 0.0] }], trailColor: { spark: 0xffd84a }
  };

  // ---- 8 游侠骑士：巨箭（跨坐在一支大箭上贴地飞） ----
  RIDES.robin = {
    name: '巨箭', desc: '骑在一支比人还长的巨箭上贴地飞，箭羽呼呼作响。',
    stance: 'straddle', seat: 0.52, len: 1.8,
    parts: [
      P.cyl([0.05, 0.05, 1.8, 8], [0, 0.47, 0.05], 0x8a5a2a, 'wood', [H, 0, 0]),
      P.cone([0.11, 0.32, 4], [0, 0.47, 1.1], STEEL, 'ch_plate', [H, 0, 0]),
      P.cyl([0.06, 0.06, 0.06, 8], [0, 0.47, 0.92], 0x4b3120, 'ch_leather', [H, 0, 0]),
      P.cyl([0.058, 0.058, 0.05, 8], [0, 0.47, -0.45], 0x4b3120, 'ch_leather', [H, 0, 0]),
      P.box([0.02, 0.17, 0.34], [0, 0.56, -0.68], 0xd8323a, 'cloth'),
      P.box([0.02, 0.17, 0.34], [0.074, 0.428, -0.68], 0xf2f0e6, 'cloth', [0, 0, -2.09]),
      P.box([0.02, 0.17, 0.34], [-0.074, 0.428, -0.68], 0xf2f0e6, 'cloth', [0, 0, 2.09]),
      P.box([0.06, 0.06, 0.05], [0, 0.47, -0.86], 0x4b3120, 'ch_leather')
    ],
    pose: { LLX: -1.15, SLX: 2.35, LRX: -1.15, SRX: 2.35, LLZ: 0.4, LRZ: -0.4, CRX: 0.5, ALX: -0.95, FLX: -0.55, ARX: -0.95, FRX: -0.55 },
    anim: { bob: [0.03, 2.3], roll: [0.05, 1.6] },
    trail: ['wind'], trailAir: ['wind'], trailAt: [[0, 0.56, -0.86], [0.08, 0.42, -0.86], [-0.08, 0.42, -0.86]]
  };

  // ---- 9 猴子侍从：香蕉皮 ----
  var BAN = 0xe8b830;
  RIDES.monke = {
    name: '香蕉皮', desc: '一脚踩上自己扔的香蕉皮，一屁股坐上去滑走了——居然还挺快。',
    stance: 'sit', seat: 0.09, len: 0.85,
    parts: [
      P.cyl([0.17, 0.22, 0.08, 8], [0, 0.04, 0], BAN, 'plain'),
      P.cyl([0.14, 0.14, 0.02, 8], [0, 0.085, 0], 0xfff2c0, 'plain')
    ].concat(both(function (sx) {
      return [1, -1].map(function (sz) { return P.box([0.17, 0.03, 0.42], [sx * 0.15, 0.03, sz * 0.2], BAN, 'plain', [0, sx * sz * 0.65, 0.0]); });
    }), both(function (sx) {
      return [1, -1].map(function (sz) { return P.knob(0.03, [sx * (0.15 + Math.sin(0.65) * 0.2), 0.04, sz * (0.2 + Math.cos(0.65) * 0.2)], 0x5a4020, 'plain'); });
    })),
    // 两腿翘起来，两手乱挥
    pose: { LLX: -1.75, SLX: 0.25, LRX: -1.75, SRX: 0.25, PRX: -0.4 },
    poseFn: function (S, a, C) {
      var t = a.t;
      S[C.ALZ] = 1.5 + 0.3 * Math.sin(t * 9); S[C.ARZ] = -(1.5 + 0.3 * Math.sin(t * 9 + PI));
      S[C.ALX] = -0.4 + 0.25 * Math.sin(t * 7); S[C.ARX] = -0.4 - 0.25 * Math.sin(t * 7);
    },
    trail: ['dust'], trailAt: [[0.2, 0.02, -0.35], [-0.2, 0.02, -0.35]], trailColor: { dust: 0xe8d890 }
  };

  // ---- 10 闪电骑士：雷光板（悬空的闪电形滑板） ----
  var ZIG = [[0.34, 0.5, 0.06, 0.34, 0.35], [0.34, 0.46, -0.05, -0.02, -0.35], [0.32, 0.42, 0.05, -0.38, 0.35]];
  RIDES.tony = {
    name: '雷光板', desc: '脚踩一道金色闪电，贴地飞驰。',
    stance: 'surf', deck: 0.08, hover: 0.25, len: 1.3,
    parts: ZIG.map(function (z) { return P.box([z[0], 0.05, z[1]], [z[2], 0.05, z[3]], 0xffd23a, 'gold', [0, z[4], 0]); })
      .concat(ZIG.map(function (z) { return P.box([z[0] * 1.06, 0.02, z[1] * 1.06], [z[2], 0.02, z[3]], 0x8af0ff, '!plain', [0, z[4], 0]); })),
    anim: { bob: [0.02, 3.1] },
    trail: ['zap'], trailAir: ['zap'], trailAt: [[0.2, 0.03, -0.5], [-0.15, 0.03, -0.1], [0.15, 0.03, 0.4]],
    twist: { kind: 'hover', friction: 0.4, uphill: 0.5, charge: 2 },
    fx: function (rs, g, dt, s) {
      if (rs.w < 0.3) return;
      var v = Ride.rootPoint(rs, 0, 0.02, 0);
      FX.glow(v.x, v.y - 0.05, v.z, 1.1, 1.1, Ride.col(0x6ae8ff), 0.3 * rs.w, 0);
      if (!s.ground) return;
      rs.zapT = (rs.zapT || 0) - dt;
      if (rs.zapT > 0) return;
      rs.zapT = 0.3 + Math.random() * 0.25;
      var e = Ride.rootPoint(rs, (Math.random() < 0.5 ? 1 : -1) * 0.18, 0.03, rand(-0.45, 0.45));
      var gy = W.groundAt(e.x, e.z, e.y + 0.2);
      FX.bolt(e.x, e.y, e.z, e.x + rand(-0.25, 0.25), gy + 0.02, e.z + rand(-0.25, 0.25), 0x8af0ff);
    }
  };

  // ---- 11 灌木骑士：大橡树叶 ----
  RIDES.bush = {
    name: '大橡树叶', desc: '坐在一片巨大的橡树叶上溜走，路过的敌人只当是风吹落叶。',
    stance: 'sit', seat: 0.1, len: 1.45, shift: 0.15,
    parts: [
      P.ico(0.5, [0, 0.05, 0], 0x5aa83a, 'leaf', null, [0.9, 0.08, 1.45]),
      P.ico(0.2, [0.3, 0.05, 0.25], 0x4f9a34, 'leaf', null, [1, 0.25, 1]), P.ico(0.2, [-0.3, 0.05, 0.25], 0x4f9a34, 'leaf', null, [1, 0.25, 1]),
      P.ico(0.2, [0.3, 0.05, -0.2], 0x4f9a34, 'leaf', null, [1, 0.25, 1]), P.ico(0.2, [-0.3, 0.05, -0.2], 0x4f9a34, 'leaf', null, [1, 0.25, 1]),
      P.box([0.035, 0.025, 1.1], [0, 0.09, 0], 0x3f7a2a, 'leaf'),
      P.box([0.02, 0.02, 0.32], [0.12, 0.085, 0.1], 0x3f7a2a, 'leaf', [0, 0.7, 0]), P.box([0.02, 0.02, 0.32], [-0.12, 0.085, 0.1], 0x3f7a2a, 'leaf', [0, -0.7, 0]),
      P.box([0.02, 0.02, 0.3], [0.12, 0.085, -0.25], 0x3f7a2a, 'leaf', [0, 0.7, 0]), P.box([0.02, 0.02, 0.3], [-0.12, 0.085, -0.25], 0x3f7a2a, 'leaf', [0, -0.7, 0]),
      P.box([0.035, 0.035, 0.28], [0, 0.16, 0.68], 0x6a4a2a, 'wood', [-0.7, 0, 0])
    ],
    // 两手抓着叶柄
    pose: { ALX: -0.95, ALZ: 0.2, FLX: -0.4, ARX: -0.95, ARZ: -0.2, FRX: -0.4 },
    trail: ['leaf'], trailAt: [[0, 0.1, -0.6], [0.3, 0.1, -0.3], [-0.3, 0.1, -0.3]]
  };

  // ---- 12 星界骑士：月牙（坐在发光的月牙弯里） ----
  RIDES.spaceman = {
    name: '月牙', desc: '坐进一弯发光的月牙里滑行，身后拖着一串星尘。',
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

  // ---- 13 强盗骑士：赃物袋 ----
  var SACK = 0xb8955a;
  RIDES.bandit = {
    name: '赃物袋', desc: '把背上的赃物袋往身下一垫，坐着就溜了，袋里金币叮当乱响。',
    stance: 'sit', seat: 0.4, len: 1.0, hide: 'pack',
    parts: [
      P.ball(0.38, [0, 0.2, 0], SACK, 'cloth', [1.05, 0.55, 1.3], null, [12, 8]),
      P.cyl([0.07, 0.11, 0.14, 6], [0, 0.24, 0.5], SACK, 'cloth', [H - 0.3, 0, 0]),
      P.cyl([0.075, 0.075, 0.03, 8], [0, 0.255, 0.45], 0x2a1c14, 'ch_leather', [H - 0.3, 0, 0]),
      P.box([0.14, 0.012, 0.12], [0.2, 0.37, -0.12], 0x8a6a3a, 'cloth', [0.1, 0.5, -0.45]),
      P.box([0.13, 0.008, 0.012], [0.2, 0.378, -0.12], 0x4a3420, 'plain', [0.1, 0.5, -0.45]),
      P.cyl([0.045, 0.045, 0.014, 8], [0.02, 0.29, 0.58], GOLD_C, 'gold', [1.0, 0, 0.3]),
      P.cyl([0.045, 0.045, 0.014, 8], [-0.03, 0.31, 0.56], GOLD_C, 'gold', [0.6, 0.4, -0.4]),
      P.cyl([0.045, 0.045, 0.014, 8], [0.035, 0.32, 0.53], GOLD_C, 'gold', [0.3, 0, 0.7])
    ],
    pose: { LLX: -1.25, SLX: 1.0, LRX: -1.25, SRX: 1.0, ALX: -0.3, ALZ: 0.55, ARX: -0.5, ARZ: -0.45 },
    trail: ['coin'], trailAt: [[0, 0.3, -0.45], [0.2, 0.2, -0.35], [-0.2, 0.2, -0.35]]
  };

  // ---- 14 影骑士：影遁（化成一滩影子） ----
  var SHADOW = 0x0c0c14;
  RIDES.ninja = {
    name: '影遁', desc: '化成一滩影子贴地滑行。',
    stance: 'crouch', deck: 0.02, len: 1.25,
    parts: [
      P.cyl([0.62, 0.62, 0.012, 16], [0, 0.012, 0], SHADOW, 'plain'),
      P.p('torus', [0.6, 0.018, 4, 32], [0, 0.02, 0], 0xd8303c, '!plain', [H, 0, 0]),
      P.box([0.09, 0.01, 0.6], [0, 0.012, -0.75], SHADOW, 'plain'),
      P.box([0.09, 0.01, 0.6], [0.25, 0.012, -0.6], SHADOW, 'plain', [0, -0.35, 0]),
      P.box([0.09, 0.01, 0.6], [-0.25, 0.012, -0.6], SHADOW, 'plain', [0, 0.35, 0])
    ],
    pose: { PRX: 0.3, LLX: -1.3, SLX: 1.25, LRX: -0.55, SRX: 1.0, LLZ: 0.18, LRZ: -0.12, CRX: 0.55, HRX: -0.75, ALX: 1.1, ALZ: 0.3, ARX: 1.15, ARZ: -0.3, FRX: -0.1 },
    poseFn: function (S, a, C) { S[C.KX] = 1.05 + 0.08 * Math.sin(a.t * 14); },
    anim: { pulse: 0.05 },
    trail: ['shadow'], trailAir: ['shadow'], trailAt: [[0, 0.05, -0.6], [0.3, 0.05, -0.4], [-0.3, 0.05, -0.4]],
    twist: { kind: 'shadow', evade: 0.3 }
  };

  // ---- 15 血骑士：血浪（反着站，脚下翻起一道浪） ----
  var BLOOD = 0x8a1020, BLOOD_L = 0xb01830;
  RIDES.vlad = {
    name: '血浪', desc: '脚下翻起一道血浪，踏浪而行——看起来很坏，其实是好人。',
    stance: 'surf', goofy: true, deck: 0.12, len: 1.15,
    parts: [
      P.tbox([0.38, 0.56, 1.15, 0.09, 0.09], [0, 0.06, 0.05], BLOOD, 'plain', [H, 0, 0]),
      P.box([0.5, 0.12, 0.18], [0, 0.14, -0.48], BLOOD_L, 'plain', [0.5, 0, 0]),
      P.box([0.42, 0.1, 0.16], [0, 0.26, -0.56], BLOOD_L, 'plain', [1.1, 0, 0]),
      P.box([0.3, 0.08, 0.12], [0, 0.36, -0.52], BLOOD_L, 'plain', [1.9, 0, 0]),
      P.knob(0.05, [0.12, 0.41, -0.47], 0xff6070, '!plain'), P.knob(0.05, [-0.1, 0.42, -0.5], 0xff6070, '!plain'),
      P.knob(0.05, [0.02, 0.37, -0.42], 0xff6070, '!plain'), P.knob(0.045, [0.2, 0.21, -0.38], 0xff6070, '!plain'),
      P.knob(0.04, [-0.22, 0.19, -0.4], 0xff6070, '!plain')
    ],
    trail: ['blood'], trailAt: [[0.15, 0.05, -0.55], [-0.15, 0.05, -0.55], [0, 0.4, -0.5]]
  };

  // ---- 16 冰霜女骑士：冰晶雪橇 ----
  var ICE_W = 0xdcefff, ICE = 0xa8f0ff;
  RIDES.noelle = {
    name: '冰晶雪橇', desc: '坐上冰晶雪橇一路滑，身后结出一道薄冰。',
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
    pose: { LLX: -1.35, SLX: 0.9, LRX: -1.35, SRX: 0.9, ALX: -0.15, ALZ: 0.5, FLX: -0.6, ARX: -0.15, ARZ: -0.5, FRX: -0.6 },
    trail: ['frost'], trailAt: [[0.22, 0.02, -0.55], [-0.22, 0.02, -0.55]],
    twist: { kind: 'frost', every: 0.3, radius: 1.3, iceR: 1.3, life: 1.8, freeze: 0.4, cooldown: 1.2, minSpeed: 4 }
  };

  // ---- 17 瘟疫医生：炼药研钵（坐在研钵里，药杵当桨） ----
  RIDES.amog = {
    name: '炼药研钵', desc: '坐进炼药用的大研钵，抄起药杵当船桨，一路划着走。',
    stance: 'sit', seat: 0.16, len: 0.85,
    parts: [
      P.lathe([10, 0.2, 0.0, 0.34, 0.06, 0.4, 0.2, 0.38, 0.3, 0.33, 0.31], [0, 0, 0], 0x8e8b84, 'rock'),
      P.cyl([0.2, 0.2, 0.012, 10], [0, 0.006, 0], 0x76736c, 'rock'),
      P.cyl([0.33, 0.33, 0.02, 10], [0, 0.29, 0], 0x2f8a1c, '!plain'),
      P.p('torus', [0.37, 0.03, 4, 20], [0, 0.31, 0], 0x9a968e, 'rock', [H, 0, 0])
    ],
    attach: function (B) {
      return [{ bone: 'foreL', at: [0, -B.fore - 0.06, 0.012], parts: [
        P.cyl([0.035, 0.06, 0.62, 6], [0, -0.25, 0.02], 0xb8b2a4, 'rock'),
        P.knob(0.07, [0, -0.56, 0.02], 0xb8b2a4, 'rock')
      ] }];
    },
    pose: { LLX: -1.85, SLX: 1.75, LRX: -1.85, SRX: 1.75, LLZ: 0.3, LRZ: -0.3, PRX: -0.15, ARX: -0.55, ARZ: -0.35, FRX: -0.7 },
    // 左手拿药杵划船（跑起来才划）
    poseFn: function (S, a, C) {
      var k = clamp(((a.hs || 0) - 2) / 4, 0, 1);
      S[C.ALX] = -0.6 + 0.5 * Math.sin(a.t * 4) * k; S[C.ALZ] = 0.55; S[C.FLX] = -0.25;
    },
    trail: ['bubble'], trailAt: [[0, 0.32, 0], [0.2, 0.32, 0.1], [-0.2, 0.32, -0.1]]
  };

  // ---- 18 骰子骑士：大扑克牌（每次翻出来的花色都不一样） ----
  var CARD = 0xf2efe6;
  var heart = [
    P.cyl([0.085, 0.085, 0.004, 12], [0.07, 0.021, 0.05], 0xd81830, 'plain'),
    P.cyl([0.085, 0.085, 0.004, 12], [-0.07, 0.021, 0.05], 0xd81830, 'plain'),
    P.box([0.17, 0.004, 0.17], [0, 0.021, -0.035], 0xd81830, 'plain', [0, PI / 4, 0])
  ];
  var spade = [
    P.cyl([0.085, 0.085, 0.004, 12], [0.07, 0.021, -0.04], 0x161616, 'plain'),
    P.cyl([0.085, 0.085, 0.004, 12], [-0.07, 0.021, -0.04], 0x161616, 'plain'),
    P.box([0.17, 0.004, 0.17], [0, 0.021, 0.045], 0x161616, 'plain', [0, PI / 4, 0]),
    P.box([0.04, 0.004, 0.14], [0, 0.021, -0.15], 0x161616, 'plain'),
    P.box([0.12, 0.004, 0.035], [0, 0.021, -0.21], 0x161616, 'plain')
  ];
  RIDES.dicehead = {
    name: '大扑克牌', desc: '踩着一张巨大的扑克牌滑行，每次翻出来的花色都不一样（纯属好看）。',
    stance: 'surf', deck: 0.06, len: 0.96, pivot: 0.04,
    parts: [
      P.box([0.64, 0.03, 0.96], [0, 0.04, 0], CARD, 'plain'),
      P.box([0.56, 0.004, 0.88], [0, 0.057, 0], 0xffffff, 'ch_cardback'),
      P.box([0.6, 0.006, 0.016], [0, 0.058, 0.455], GOLD_C, 'gold'), P.box([0.6, 0.006, 0.016], [0, 0.058, -0.455], GOLD_C, 'gold'),
      P.box([0.016, 0.006, 0.926], [0.296, 0.058, 0], GOLD_C, 'gold'), P.box([0.016, 0.006, 0.926], [-0.296, 0.058, 0], GOLD_C, 'gold')
    ],
    suits: [heart, spade],
    anim: { cardFlip: true },
    trail: ['card'], trailAir: ['card'], trailAt: [[0.3, 0.06, -0.45], [-0.3, 0.06, -0.45]]
  };

  // ---- 19 黑骑士：御剑（腐化大剑往脚下一抛，御剑飞行） ----
  RIDES.chadwell = {
    name: '御剑', desc: '把腐化大剑往脚下一抛，御剑贴地飞行，剑身冒着紫火。',
    stance: 'surf', deck: 0.05, hover: 0.3, len: 1.4, hide: 'gearR',
    parts: [
      P.tbox([0.06, 0.17, 1.3, 0.03, 0.03], [0, 0.04, 0.25], 0x2a2238, 'ch_plate', [H, 0, 0]),
      P.box([0.03, 0.012, 1.15], [0, 0.058, 0.3], 0xb44aff, '!plain'),
      P.box([0.42, 0.06, 0.07], [0, 0.04, -0.42], 0x1a1720, 'ch_plate'),
      P.gem(0.035, [0, 0.075, -0.42], 0xb44aff, '!plain'),
      P.box([0.05, 0.05, 0.22], [0, 0.04, -0.57], 0x4b3120, 'ch_leather'),
      P.knob(0.05, [0, 0.04, -0.7], 0x1a1720, 'ch_plate')
    ],
    // 右手在胸前掐剑诀
    pose: { ARX: -0.5, ARZ: -0.2, FRX: -1.7 },
    anim: { bob: [0.03, 2.1], roll: [0.04, 1.4] },
    trail: ['cursed'], trailAir: ['cursed'], trailAt: [[0, 0.06, 0.8], [0, 0.06, 0.2], [0, 0.06, -0.3]],
    fx: function (rs, g, dt, s) {
      if (rs.w < 0.3) return;
      var v = Ride.rootPoint(rs, 0, 0.0, 0.2);
      FX.glow(v.x, v.y, v.z, 1.2, 0.65, Ride.col(0xb44aff), 0.26 * rs.w, 0);
    }
  };

  // ---- 20 鹰骑士：大羽毛 ----
  RIDES.birdo = {
    name: '大羽毛', desc: '踩着一根比人还长的大羽毛冲浪。',
    stance: 'surf', deck: 0.08, len: 1.4,
    parts: [
      P.tbox([0.12, 0.44, 0.6, 0.025, 0.03], [0, 0.05, 0.3], 0x4e9ee8, 'ch_feather', [H, 0, 0]),
      P.tbox([0.44, 0.2, 0.55, 0.03, 0.025], [0, 0.05, -0.275], 0x4e9ee8, 'ch_feather', [H, 0, 0]),
      P.box([0.1, 0.006, 0.9], [0.11, 0.068, 0], 0xf2f4f8, 'ch_feather'),
      P.box([0.06, 0.006, 0.5], [-0.12, 0.068, -0.1], 0x2f6eb8, 'ch_feather'),
      P.box([0.03, 0.03, 1.4], [0, 0.07, -0.05], 0xf0e6cc, 'bone')
    ],
    anim: { flutter: true },
    trail: ['feather'], trailAir: ['feather'], trailAt: [[0, 0.08, -0.6], [0.2, 0.08, -0.4], [-0.2, 0.08, -0.4]],
    twist: { kind: 'dive', gravity: 2, gain: 0.45, cap: 1.8, minDive: 0.25 }
  };

  // ---- 21 幽灵骑士：宝箱（舍不得放下，干脆坐在上面滑） ----
  var CHEST = 0x7a4e2a;
  RIDES.roberto = {
    name: '宝箱', desc: '舍不得放下宝箱，干脆坐在上面滑。',
    stance: 'sit', seat: 0.42, len: 0.62, hide: 'pack',
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
    pose: { TX: -1.2, ALX: -0.5, ALZ: 0.35, FLX: -0.7, ARX: -0.3, ARZ: -0.3, CRX: 0.2 },
    trail: ['glint', 'ghost'], trailAt: [[0, 0.45, -0.25], [0.2, 0.12, -0.32], [-0.2, 0.12, -0.32]]
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
  var spinsOf = function (list) {
    return (list || []).map(function (s) { return { geo: Ride.geoOf(s.parts), at: s.at || [0, 0, 0], r: s.r || 0.05, axis: s.axis || 'x', rate: s.rate || 0 }; });
  };
  var c = { main: d.parts && d.parts.length ? Ride.geoOf(d.parts) : null, spins: spinsOf(d.spin), att: [], suits: null };
  var att = typeof d.attach === 'function' ? d.attach(B) : (d.attach || []);
  att.forEach(function (q) { c.att.push({ bone: q.bone, at: q.at || [0, 0, 0], geo: Ride.geoOf(q.parts), spins: spinsOf(q.spin) }); });
  if (d.suits) c.suits = d.suits.map(Ride.geoOf);
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
      return { m: m, r: s.r, axis: s.axis, rate: s.rate };
    });
  };
  var spins = mkSpins(c.spins, inner);
  var suits = c.suits ? c.suits.map(function (g) { var m = new THREE.Mesh(g, mat); m.visible = false; inner.add(m); return m; }) : null;
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
    id: id, def: d, tw: d.twist || {}, root: root, pivot: pivot, inner: inner, spins: spins, suits: suits, shadow: shadow, att: att,
    hide: d.hide ? u.bones[d.hide] : null, py: Ride.calib(u.B, d), capeYaw: Ride.capeYaw(d), bodyScale: u.B.scale || 1,
    w: 0, shown: false, t: 0, ground: true, airT: 0, ollie: 0, squash: 0, pitch: 0, roll: 0,
    wheelV: 0, flipP: 0, flipDone: false, cflipT: 0, cairDone: false, dive: 0, kickPh: 0, kickW: 0,
    emit: 0, emitI: 0, groundK: 1, capeAng: null, suit: 0
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
  bonechip: function (x, y, z) { FX.burst(x, y + 0.03, z, 2, 0xeee5c8, 2.4, 0.09); },
  frost: function (x, y, z) { FX.mote(x + rand(-0.06, 0.06), y + 0.05, z, 0xbff0ff, 0.09, 0.55, 0.85); },
  leaf: function (x, y, z) { FX.mote(x + rand(-0.15, 0.15), y + 0.55, z + rand(-0.15, 0.15), Math.random() < 0.5 ? 0x5aa83a : 0x3f8a2e, 0.12, -0.45, 1.1); },
  glint: function (x, y, z, c) { FX.flash(x + rand(-0.12, 0.12), y + rand(0, 0.25), z + rand(-0.12, 0.12), 0.55, c || 0xffd84a, 0.32, 2); },
  coin: function (x, y, z) {
    FX.flash(x + rand(-0.1, 0.1), y + rand(0, 0.2), z, 0.5, 0xffd84a, 0.3, 2);
    if (Math.random() < 0.5) FX.burst(x, y, z, 1, 0xe2b23a, 1.2, 0.07);
  },
  cursed: function (x, y, z) {
    FX.mote(x + rand(-0.06, 0.06), y, z + rand(-0.06, 0.06), Math.random() < 0.7 ? 0xb44aff : 0xe0a0ff, 0.11, 1.3, 0.55);
  },
  zap: function (x, y, z) { FX.mote(x + rand(-0.08, 0.08), y, z + rand(-0.08, 0.08), 0x8af0ff, 0.08, 0.9, 0.5); },
  blood: function (x, y, z) { FX.burst(x, y, z, 1, 0xc8202e, 1.3, 0.08); },
  shadow: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), 0x15121a, 0.16, 0.7, 0.75); },
  star: function (x, y, z) { FX.flash(x + rand(-0.1, 0.1), y + rand(-0.05, 0.15), z, 0.45, 0xffe26a, 0.35, 2); },
  violet: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), 0x8a6aff, 0.09, 0.5, 0.9); },
  feather: function (x, y, z) { FX.mote(x + rand(-0.15, 0.15), y + 0.35, z + rand(-0.15, 0.15), Math.random() < 0.6 ? 0x4e9ee8 : 0xf2f4f8, 0.11, -0.35, 1.2); },
  bubble: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), Math.random() < 0.8 ? 0x7dff4a : 0xc8ffb0, 0.08, 1.0, 0.7); },
  wind: function (x, y, z) { FX.mote(x, y, z, 0xf2f6ff, 0.06, 0.12, 0.4); },
  ghost: function (x, y, z) { FX.mote(x + rand(-0.1, 0.1), y, z + rand(-0.1, 0.1), 0xbfe8ff, 0.1, 0.6, 0.9); },
  card: function (x, y, z) { FX.mote(x, y, z, Math.random() < 0.5 ? 0xd81830 : 0x22222a, 0.07, 0.5, 0.5); }
};

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
    if (rs.suits) rs.suit = Math.random() < 0.5 ? 0 : 1;
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
  var u = g.userData, b = u.bones;
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
  if (rs.hide) rs.hide.scale.setScalar(Math.max(0.001, 1 - w));

  // ---- 坐骑本身 ----
  var root = rs.root, i;
  root.visible = vis;
  var tilt = 0, roll = 0, bob = 0;
  if (vis) {
    var sc = 0.55 + 0.45 * Ride.easeOutBack(w), sq = rs.squash, pulse = an.pulse ? 1 + an.pulse * Math.sin(rs.t * 6) : 1;
    root.scale.set(sc * (1 + 0.08 * sq) * pulse, sc * (1 - 0.2 * sq), sc * (1 + 0.08 * sq) * pulse);
    // 翻转：滑板绕长轴转一整圈；扑克牌翻两面；大羽毛高速时抖
    var rz = 0, rx = 0;
    if (flip > 0) rz = -Math.PI * 2 * Ride.smooth(flip);
    if (rs.cflipT > 0) rz = Math.PI * 2 * Ride.smooth(rs.cflipT / 0.36);
    if (an.flutter) { var fk = clamp((s.hs - 15) / 10, 0, 1); rz += 0.07 * fk * Math.sin(rs.t * 23); rx += 0.04 * fk * Math.sin(rs.t * 17 + 1); }
    rs.pivot.rotation.set(rx, 0, rz);
    if (rs.suits) for (i = 0; i < rs.suits.length; i++) rs.suits[i].visible = i === rs.suit;
    // 轮子（画面上的转速封顶：真实转速每帧转半圈以上，看起来会倒着转）
    for (i = 0; i < rs.spins.length; i++) {
      var sp = rs.spins[i], da = sp.rate ? sp.rate * dt : Math.min(rs.wheelV / sp.r, Ride.SPIN_MAX) * dt;
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
  if (rs.hide) rs.hide.scale.setScalar(1);
  for (var i = 0; i < rs.att.length; i++) { rs.att[i].m.visible = false; rs.att[i].m.scale.set(1, 0.001, 1); }
  g.rotation.x = 0; g.rotation.z = 0; g.position.y = 0;
  var b = g.userData && g.userData.bones;
  if (b && b.cape && !(g.userData.def && g.userData.def.capeSpin)) b.cape.rotation.y = 0;
};

// ---------------- 玩家 ----------------
Ride.state = function () { return P.body && P.body.userData && P.body.userData.ride || null; };

// 骸骨骑士推着方向键、还没到最高速时，后脚隔一会儿蹬一下地
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
