'use strict';
// ============================================================
//  弹丸与场地效果模型
// ============================================================

// 新月形的轮廓：[半径, 最厚处, 弧度]；朝向 +Y（转到 XZ 平面后朝向 +Z）
function fxCrescentShape(s) {
  var R = s[0], w = s[1], arc = s[2] || 2.2, S = 16, shape = new THREE.Shape(), i, t, a, rr;
  for (i = 0; i <= S; i++) {
    t = i / S; a = (t - 0.5) * arc;
    if (i === 0) shape.moveTo(Math.sin(a) * R, Math.cos(a) * R); else shape.lineTo(Math.sin(a) * R, Math.cos(a) * R);
  }
  for (i = S - 1; i >= 1; i--) {
    t = i / S; a = (t - 0.5) * arc; rr = R - w * Math.pow(Math.sin(t * Math.PI), 0.8);
    shape.lineTo(Math.sin(a) * rr, Math.cos(a) * rr);
  }
  return shape;
}

// 新月形薄片（剑气）：[半径, 最厚处, 弧度]；朝向 +Z，躺在 XZ 平面
MODEL.extraGeo.fxCrescent = function (s) { return new THREE.ShapeGeometry(fxCrescentShape(s)).rotateX(Math.PI / 2); };

// 有厚度的新月（刀刃、月刃）：[半径, 最厚处, 弧度, 厚度]；两面都看得见，受光照
MODEL.extraGeo.fxCrescent3 = function (s) {
  var d = s[3] || 0.06;
  return new THREE.ExtrudeGeometry(fxCrescentShape(s), { depth: d, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -d / 2).rotateX(Math.PI / 2);
};

// 不带盖的圆柱：[上半径, 下半径, 高, 段数]
MODEL.extraGeo.fxTube = function (s) { return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 8, 1, true); };

// ---------------- 弹丸与场地模型 ----------------
var PROJ_MODELS = {
  arrow: [['box', [0.07, 0.07, 1.1], [0, 0, 0], 0x8a5a2a, null, null, 'wood'], ['cone', [0.11, 0.3, 4], [0, 0, 0.65], 0xd8dde4, [Math.PI / 2, 0, 0], null, 'metal'], ['box', [0.24, 0.02, 0.22], [0, 0, -0.48], 0xf4f4f4], ['box', [0.02, 0.24, 0.22], [0, 0, -0.48], 0xf4f4f4]],
  bullet: [['box', [0.18, 0.18, 0.6], [0, 0, 0], 0xffe080]],
  bolt: [['box', [0.09, 0.09, 0.9], [0, 0, 0], 0x6a4a2a, null, null, 'wood'], ['cone', [0.1, 0.25, 4], [0, 0, 0.55], 0xc0c8d0, [Math.PI / 2, 0, 0], null, 'metal'], ['box', [0.2, 0.02, 0.15], [0, 0, -0.4], 0xd93a3a]],
  // 重弩箭：比普通弩箭长一半，金色尾羽
  heavybolt: [['box', [0.16, 0.16, 2.4], [0, 0, 0], 0x6a4a2a, null, null, 'wood'], ['cone', [0.2, 0.55, 4], [0, 0, 1.47], 0xc0c8d0, [Math.PI / 2, 0, 0], null, 'metal'], ['box', [0.4, 0.02, 0.32], [0, 0, -1.05], 0xffd84a], ['box', [0.02, 0.4, 0.32], [0, 0, -1.05], 0xffd84a]],
  // 流星锤：深色铁球 + 六根亮银色尖刺（是带刺的锤头，不是石头）
  flail: [['dodec', [0.42], [0, 0, 0], 0x4a4a52, null, null, 'metal'], ['cone', [0.12, 0.38, 4], [0, 0.52, 0], 0xe0e4ea, null, null, 'metal'], ['cone', [0.12, 0.38, 4], [0, -0.52, 0], 0xe0e4ea, [Math.PI, 0, 0], null, 'metal'], ['cone', [0.12, 0.38, 4], [0.52, 0, 0], 0xe0e4ea, [0, 0, -Math.PI / 2], null, 'metal'], ['cone', [0.12, 0.38, 4], [-0.52, 0, 0], 0xe0e4ea, [0, 0, Math.PI / 2], null, 'metal'], ['cone', [0.12, 0.38, 4], [0, 0, 0.52], 0xe0e4ea, [Math.PI / 2, 0, 0], null, 'metal'], ['cone', [0.12, 0.38, 4], [0, 0, -0.52], 0xe0e4ea, [-Math.PI / 2, 0, 0], null, 'metal']],
  pellet: [['box', [0.15, 0.15, 0.35], [0, 0, 0], 0xffd060]],
  // 火球：亮黄核心 + 橙色外焰 + 往后拖的火舌
  fireball: [['ball', [0.3, 1], [0, 0, 0], 0xfff0a0], ['ball', [0.44, 0], [0, 0, -0.08], 0xff8a1a], ['cone', [0.3, 0.7, 5], [0, 0, -0.5], 0xff5a10, [-Math.PI / 2, 0, 0]], ['cone', [0.16, 0.5, 4], [0.14, 0.1, -0.45], 0xffb030, [-Math.PI / 2, 0, 0]]],
  bone: [['box', [0.15, 0.15, 0.8], [0, 0, 0], 0xf3ead0], ['ball', [0.16, 0], [0.08, 0, 0.4], 0xf3ead0], ['ball', [0.16, 0], [-0.08, 0, 0.4], 0xf3ead0], ['ball', [0.16, 0], [0.08, 0, -0.4], 0xf3ead0], ['ball', [0.16, 0], [-0.08, 0, -0.4], 0xf3ead0]],
  banana: [['box', [0.18, 0.15, 0.6], [0, 0, 0.15], 0xffe14a, [0, 0.5, 0]], ['box', [0.18, 0.15, 0.6], [0, 0, -0.15], 0xffd02a, [0, -0.5, 0]]],
  axe: [['box', [0.1, 0.1, 1.0], [0, 0, 0], 0x7a4a2a], ['box', [0.08, 0.6, 0.5], [0, 0.2, 0.35], 0xc0c8d0]],
  dice: [['box', [0.55, 0.55, 0.55], [0, 0, 0], 0xffffff], ['box', [0.12, 0.12, 0.05], [0, 0, 0.28], 0xd9333a], ['box', [0.05, 0.12, 0.12], [0.28, 0.12, 0.12], 0x111111], ['box', [0.05, 0.12, 0.12], [0.28, -0.12, -0.12], 0x111111]],
  orb: [['ball', [0.22, 1], [0, 0, 0], 0xffffff], ['ball', [0.35, 1], [0, 0, 0], 0xa8e4ff]],
  shield: [['cyl', [0.6, 0.6, 0.15, 8], [0, 0, 0], 0xffd84a, [Math.PI / 2, 0, 0]], ['cyl', [0.35, 0.35, 0.18, 8], [0, 0, 0], 0xd9333a, [Math.PI / 2, 0, 0]]],
  dagger: [['box', [0.08, 0.04, 0.7], [0, 0, 0.1], 0xd0f0ff], ['box', [0.25, 0.08, 0.08], [0, 0, -0.25], 0x3a3a4a], ['box', [0.06, 0.06, 0.25], [0, 0, -0.4], 0x7affd0]],
  // 处刑大刀：钢色的新月刀身 + 亮白的刃线 + 深色的刀背；建好后立起来（PROJ_ROT），从镜头后面看得到整个月牙，
  // 飞的时候绕自己的朝向转（像飞出去的圆锯）
  blade: [
    ['fxCrescent3', [1.05, 0.42, 1.7, 0.08], [0, 0, -0.85], 0xd8dee8, null, null, 'metal'],
    ['fxCrescent3', [1.1, 0.1, 1.62, 0.1], [0, 0, -0.85], 0xffffff, null, null, 'plain'],
    ['box', [0.8, 0.12, 0.1], [0, 0, -0.26], 0x3a3a46, null, null, 'metal']
  ],
  // 血球：亮红核心 + 深红外壳 + 拖尾
  bloodorb: [['ball', [0.24, 1], [0, 0, 0], 0xff8a9a], ['ball', [0.38, 1], [0, 0, 0], 0xd9233a], ['cone', [0.22, 0.5, 5], [0, 0, -0.45], 0x8a0a1a, [-Math.PI / 2, 0, 0]]],
  // 奥术飞弹（追踪魔弹）：紫色光球，前面露出白色亮芯，后面一截短尾焰
  arcane: [['ball', [0.2, 1], [0, 0, 0.13], 0xffffff], ['ball', [0.32, 1], [0, 0, -0.03], 0xb05aff], ['cone', [0.24, 0.6, 5], [0, 0, -0.48], 0x7a2ad0, [-Math.PI / 2, 0, 0]]],
  rocket: [['cyl', [0.14, 0.14, 0.7, 6], [0, 0, 0], 0xe8e8e8, [Math.PI / 2, 0, 0]], ['cone', [0.14, 0.3, 6], [0, 0, 0.5], 0xff3a6a, [Math.PI / 2, 0, 0]], ['box', [0.4, 0.04, 0.15], [0, 0, -0.3], 0xff3a6a]],
  rock: [['dodec', [0.55], [0, 0, 0], 0x8a8a84]],
  // 毒瓶（只是扔出去的样子，碎了才出毒云）：绿色玻璃瓶 + 瓶颈 + 软木塞
  bottle: [['ball', [0.22, 1], [0, 0, 0], 0x5aff4a], ['cyl', [0.07, 0.1, 0.2, 6], [0, 0.24, 0], 0xa8ff8a], ['box', [0.11, 0.09, 0.11], [0, 0.37, 0], 0x8a5a2a]],
  // 剑气：发光的新月
  wave: [['fxCrescent', [1.15, 0.38, 2.3], [0, 0, -0.95], 0xbfe6ff]],
  // 灵魂：白色小光球 + 淡蓝外圈
  soul: [['ball', [0.16, 1], [0, 0, 0], 0xffffff], ['ball', [0.28, 1], [0, 0, -0.06], 0x9fdcff]]
};

// 不受光照的弹丸（'add' = 叠加发光）
var PROJ_LOOK = { fireball: 'unlit', bloodorb: 'unlit', arcane: 'unlit', bottle: 'unlit', orb: 'unlit', soul: 'unlit', wave: 'add' };

// 建好以后整体转一下的弹丸：[绕 x, 绕 z]（弧度）；处刑大刀立起来朝着飞行方向
var PROJ_ROT = { blade: [-Math.PI / 2, 0] };
// 飞行时绕自己的朝向（z 轴）转的弹丸：每秒弧度
var PROJ_ROLLSPIN = { blade: 11 };

// 有些武器用自己的弹丸模型（不改武器数据）：追踪魔弹不再借用血球
var PROJ_BY_WEAPON = { rocket: 'arcane' };

function projGeo(kind, parts) {
  var g = MODEL.build(parts || PROJ_MODELS[kind], parts ? false : undefined), r = PROJ_ROT[kind];
  if (r) { if (r[0]) g.rotateX(r[0]); if (r[1]) g.rotateZ(r[1]); }
  return g;
}

// 弹丸核心光晕：[颜色, 大小, 亮度, 用武器颜色]
var PROJ_GLOW = {
  fireball: [0xff8a2a, 2.0, 0.75],
  bloodorb: [0xff3048, 1.6, 0.65, true],
  arcane: [0xd05aff, 1.05, 0.6],
  orb: [0xbfeaff, 1.4, 0.55],
  soul: [0x8fd8ff, 1.3, 0.6],
  wave: [0x9fd8ff, 2.2, 0.35],
  dagger: [0x7affd0, 1.2, 0.55],
  arrow: [0xfff2d0, 0.75, 0.4],
  bolt: [0xffe0a0, 0.7, 0.4],
  heavybolt: [0xfff0c8, 1.0, 0.45],
  blade: [0xd8e8ff, 1.4, 0.35],
  rocket: [0xff5a8a, 0.9, 0.5]
};

// 快速弹丸的拖尾（沿真实飞行路线的发光带）：[颜色, 长度（秒 × 速度）, 头部半宽, 只在回程画]
var PROJ_TAIL = {
  arrow: [0xfff2d0, 0.05, 0.15],
  bolt: [0xffe0a0, 0.045, 0.14],
  heavybolt: [0xfff0c8, 0.05, 0.19],
  dagger: [0x7affd0, 0.1, 0.15],
  arcane: [0xd05aff, 0.13, 0.2],
  soul: [0x9fdcff, 0.12, 0.12],
  blade: [0xd8e8ff, 0.07, 0.32],
  banana: [0xffe14a, 0.09, 0.15, true]
};

var ZONE_MODELS = null;
function buildZoneModels() {
  ZONE_MODELS = {
    // 龙卷风：几段错开的漏斗叠起来，上宽下窄；下面暗、上面亮（叠加混合时暗 = 透明，看起来像往下淡出的风）
    tornado: MODEL.build([
      ['fxTube', [1.3, 1.0, 0.8, 9], [0, 3.3, 0], 0xcfe6ff],
      ['fxTube', [1.0, 0.75, 0.8, 8], [0.18, 2.55, 0], 0xa4c2de],
      ['fxTube', [0.75, 0.5, 0.8, 7], [-0.1, 1.8, 0.1], 0x7e9ebd],
      ['fxTube', [0.5, 0.28, 0.75, 7], [0.1, 1.05, -0.05], 0x5f80a0],
      ['cone', [0.28, 0.7, 6], [0, 0.35, 0], 0x4a6a8a, [Math.PI, 0, 0]]
    ], false),
    // 火药桶：木桶 + 铁箍 + 引信
    mine: MODEL.build([
      ['cyl', [0.34, 0.38, 0.62, 8], [0, 0.31, 0], 0x8a5a2a, null, null, 'wood'],
      ['cyl', [0.395, 0.395, 0.07, 8], [0, 0.12, 0], 0x3a3a46, null, null, 'metal'],
      ['cyl', [0.36, 0.36, 0.07, 8], [0, 0.5, 0], 0x3a3a46, null, null, 'metal'],
      ['cyl', [0.3, 0.3, 0.04, 8], [0, 0.63, 0], 0x6a4a22, null, null, 'wood'],
      ['box', [0.2, 0.2, 0.02], [0, 0.32, 0.37], 0xd93a2a],
      ['cyl', [0.035, 0.035, 0.22, 4], [0.1, 0.74, 0], 0xd8c08a, [0, 0, -0.3]]
    ]),
    disc: FX.getGeo('disc'),
    blackhole: new THREE.IcosahedronGeometry(1, 1),
    spike: MODEL.build([['cone', [0.8, 3.5, 5], [0, 1.75, 0], 0x5a3a1a], ['cone', [0.4, 1.5, 5], [0.5, 0.75, 0.2], 0x3a8a2a]])
  };
}
