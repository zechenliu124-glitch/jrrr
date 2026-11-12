'use strict';
// ============================================================
//  关卡：迷雾森林、黄沙古道、沉钟古城——配色（天空、雾、灯光、远山）、树木岩石、刷怪池（按关卡进度分阶段）
// ============================================================

// ---------------- 场景零件 ----------------
// 零件格式见 models.js；树冠和石头用平面投影贴图（第 8 项），块面分明
var ENV_PARTS = (function () {
  var B = 'env_bark', L = 'env_leaf', K = 'env_rock';
  // 一团树冠：压扁一点、随便转个角度的十二面体 / 二十面体（tile 不写就用彩色树叶）
  var lump = function (type, r, x, y, z, rot, tint, tile) {
    return [type, type === 'ball' ? [r, 0] : [r], [x, y, z], tint || 0xffffff, rot, [1, 0.82, 1], tile || L, 1];
  };
  var trunk = 0x6e4630, dead = 0x40362f, bleached = 0x8a6c50;
  // 整体缩放一组零件（尺寸和位置一起缩）
  var DIMS = { box: 3, cyl: 3, tube: 3, cone: 2, ball: 1, dodec: 1, oct: 1, tet: 1, sphere: 1, torus: 2 };
  var scaled = function (parts, k) {
    return parts.map(function (p) {
      var q = p.slice(), n = DIMS[p[0]] || 1;
      q[1] = p[1].map(function (v, i) { return i < n ? v * k : v; });
      q[2] = p[2].map(function (v) { return v * k; });
      return q;
    });
  };
  var P = {};
  // ---- 迷雾森林 ----
  // 大橡树：粗树干 + 两根枝 + 五团树冠
  P.oak = scaled([
    ['tube', [0.42, 0.62, 0.6, 7], [0, 0.3, 0], trunk, null, null, B],
    ['tube', [0.27, 0.42, 4.9, 7], [0, 2.75, 0], trunk, null, null, B],
    ['tube', [0.09, 0.16, 2.1, 5], [0.78, 4.0, 0.1], trunk, [0, 0, -0.95], null, B],
    ['tube', [0.08, 0.14, 1.9, 5], [-0.5, 4.5, -0.55], trunk, [-0.75, 0, 0.6], null, B],
    lump('dodec', 1.8, 0.1, 6.5, 0, [0.4, 0.3, 0.2]),
    lump('dodec', 1.45, 1.75, 5.0, 0.3, [0.9, 1.2, 0.1], 0xe6e6e6),
    lump('dodec', 1.35, -0.85, 5.35, -1.45, [0.2, 2.1, 0.7]),
    lump('dodec', 1.2, -1.45, 4.6, 0.85, [1.3, 0.4, 0.3], 0xdedede),
    lump('ball', 1.0, 0.9, 7.35, -0.8, [0.5, 0.8, 0.2])
  ], 0.85);
  // 高树：树冠一团叠一团往上长
  P.tall = scaled([
    ['tube', [0.4, 0.58, 0.6, 7], [0, 0.3, 0], trunk, null, null, B],
    ['tube', [0.22, 0.38, 6.0, 7], [0, 3.3, 0], trunk, null, null, B],
    ['tube', [0.07, 0.12, 1.5, 5], [-0.55, 4.0, 0.3], trunk, [0.4, 0, 0.9], null, B],
    lump('dodec', 1.5, 0.1, 8.0, 0.1, [0.7, 0.2, 0.4]),
    lump('dodec', 1.7, 0.25, 6.3, -0.2, [0.1, 1.0, 0.5], 0xe8e8e8),
    lump('dodec', 1.2, -1.3, 5.2, 0.6, [1.1, 0.3, 0.2]),
    lump('ball', 1.15, 1.35, 5.5, 0.5, [0.3, 0.6, 1.2], 0xdcdcdc),
    lump('dodec', 0.95, -1.2, 4.2, 0.5, [0.6, 2.2, 0.1], 0xd2d2d2)
  ], 0.78);
  // 小树
  P.young = [
    ['tube', [0.17, 0.28, 3.0, 6], [0, 1.5, 0], trunk, null, null, B],
    lump('dodec', 1.25, 0, 3.9, 0, [0.3, 0.9, 0.2]),
    lump('dodec', 0.95, 0.9, 3.2, 0.35, [1.2, 0.2, 0.5], 0xe0e0e0),
    lump('ball', 0.9, -0.65, 3.4, -0.6, [0.4, 1.7, 0.3])
  ];
  // 分叉树：主干 + 斜着长出的副干，各顶一簇树冠
  P.fork = scaled([
    ['tube', [0.38, 0.55, 0.5, 7], [0, 0.25, 0], trunk, null, null, B],
    ['tube', [0.24, 0.38, 4.6, 7], [-0.25, 2.5, 0], trunk, [0, 0, 0.1], null, B],
    ['tube', [0.12, 0.2, 2.6, 6], [0.85, 3.1, 0], trunk, [0, 0, -0.62], null, B],
    lump('dodec', 1.55, -0.6, 5.6, 0, [0.2, 0.5, 0.6]),
    lump('dodec', 1.2, -1.6, 4.7, 0.5, [1.0, 1.4, 0.1], 0xdcdcdc),
    lump('dodec', 1.25, 1.7, 4.6, 0.1, [0.6, 0.2, 0.9]),
    lump('ball', 0.95, 2.2, 3.75, 0.7, [0.3, 0.9, 0.4], 0xe0e0e0),
    lump('ball', 0.85, 1.35, 3.8, -0.65, [1.4, 0.3, 0.2], 0xd0d0d0)
  ], 0.88);
  // 灌木：地上几团叶子
  P.bush = [
    lump('dodec', 1.0, 0, 0.75, 0, [0.5, 0.2, 0.3], 0xd6dcd0),
    lump('dodec', 0.78, 0.95, 0.5, 0.3, [1.2, 0.9, 0.2], 0xc8d0c0),
    lump('ball', 0.8, -0.75, 0.55, -0.45, [0.3, 1.6, 0.8], 0xd0d6c8)
  ];
  // 石头
  P.rockA = [
    ['dodec', [1.1], [0, 0.45, 0], 0x74746e, [0.3, 0.5, 0.2], [1.1, 0.78, 1], K, 1],
    ['dodec', [0.55], [0.9, 0.2, 0.45], 0x696964, [0.6, 0.2, 0.1], null, K, 1]
  ];
  P.rockB = [
    ['ball', [1.0, 0], [0, 0.55, 0], 0x70706a, [0.4, 0.9, 0.3], [0.95, 1.0, 0.85], K, 1],
    ['dodec', [0.45], [-0.75, 0.15, -0.5], 0x666661, [0.2, 0.7, 0.5], null, K, 1]
  ];
  // 倒下的树干：两头是浅色的木头截面，上面长了一团苔藓
  P.log = [
    ['cyl', [0.34, 0.38, 2.6, 8], [0, 0.5, 0], trunk, [0, 0, Math.PI / 2], null, B],
    ['cyl', [0.29, 0.29, 0.04, 8], [1.31, 0.5, 0], 0xb48a5a, [0, 0, Math.PI / 2], null, 'wood'],
    ['cyl', [0.33, 0.33, 0.04, 8], [-1.31, 0.5, 0], 0xb48a5a, [0, 0, Math.PI / 2], null, 'wood'],
    lump('dodec', 0.34, 0.45, 0.82, 0.05, [0.3, 0.2, 0.1], 0xc8d0c0)
  ];
  P.rockC = [
    ['dodec', [1.2], [0, 0.28, 0], 0x777670, [0.1, 0.4, 0.15], [1.25, 0.48, 1.05], K, 1],
    ['ball', [0.5, 0], [0.5, 0.45, -0.3], 0x6c6b65, [0.7, 0.3, 0.2], [1, 0.8, 1], K, 1]
  ];
  // ---- 黄沙古道 ----
  var cac = 0x4f8a3e, C = 'env_cactus', S = 'env_strata';
  // 树形仙人掌：主干 + 两只举起的手臂
  P.saguaro = [
    ['cyl', [0.42, 0.47, 4.1, 8], [0, 2.05, 0], cac, null, null, C],
    ['sphere', [0.42, 8, 4], [0, 4.1, 0], cac, null, [1, 0.75, 1], C],
    ['cyl', [0.23, 0.23, 1.0, 7], [-0.75, 1.9, 0], cac, [0, 0, Math.PI / 2], null, C],
    ['cyl', [0.24, 0.26, 1.5, 7], [-1.2, 2.55, 0], cac, null, null, C],
    ['sphere', [0.24, 7, 4], [-1.2, 3.3, 0], cac, null, [1, 0.75, 1], C],
    ['cyl', [0.22, 0.22, 0.9, 7], [0.7, 2.6, 0], cac, [0, 0, Math.PI / 2], null, C],
    ['cyl', [0.23, 0.24, 1.2, 7], [1.1, 3.1, 0], cac, null, null, C],
    ['sphere', [0.23, 7, 4], [1.1, 3.7, 0], cac, null, [1, 0.75, 1], C]
  ];
  P.cactus = [
    ['cyl', [0.36, 0.4, 2.7, 8], [0, 1.35, 0], 0x5a9442, null, null, C],
    ['sphere', [0.36, 8, 4], [0, 2.7, 0], 0x5a9442, null, [1, 0.75, 1], C],
    ['cyl', [0.2, 0.2, 0.8, 7], [0.6, 1.2, 0], 0x5a9442, [0, 0, Math.PI / 2], null, C],
    ['cyl', [0.21, 0.22, 1.0, 7], [0.95, 1.65, 0], 0x5a9442, null, null, C],
    ['sphere', [0.21, 7, 4], [0.95, 2.15, 0], 0x5a9442, null, [1, 0.75, 1], C]
  ];
  // 枯树：晒白的歪树干和光秃的枝
  P.drytree = [
    ['tube', [0.22, 0.36, 2.4, 6], [0, 1.2, 0], bleached, [0, 0, 0.12], null, B],
    ['cyl', [0.14, 0.22, 2.0, 6], [-0.35, 3.1, 0], bleached, [0, 0, 0.35], null, B],
    ['tube', [0.07, 0.13, 1.8, 5], [0.65, 3.2, 0.1], bleached, [0, 0, -0.95], null, B],
    ['tube', [0.05, 0.09, 1.3, 4], [-0.95, 4.1, 0.3], bleached, [0.4, 0, 0.9], null, B],
    ['tube', [0.05, 0.08, 1.2, 4], [0.1, 4.1, -0.5], bleached, [-0.9, 0, -0.2], null, B]
  ];
  // 沙漠灌木：干黄的小叶团
  P.shrub = [
    lump('dodec', 0.75, 0, 0.5, 0, [0.4, 0.3, 0.2], 0x8a8048, 'env_leafg'),
    lump('ball', 0.6, 0.7, 0.4, 0.3, [1.1, 0.7, 0.3], 0x7c7444, 'env_leafg'),
    lump('dodec', 0.55, -0.55, 0.38, -0.35, [0.3, 1.2, 0.9], 0x86784a, 'env_leafg'),
    ['tube', [0.03, 0.05, 1.1, 4], [0.2, 0.75, 0.1], bleached, [0.3, 0, -0.5], null, B],
    ['tube', [0.03, 0.05, 0.9, 4], [-0.3, 0.7, 0.2], bleached, [-0.2, 0, 0.6], null, B]
  ];
  P.sandA = [
    ['dodec', [1.1], [0, 0.45, 0], 0xc28c58, [0.1, 0.5, 0.1], [1.15, 0.72, 1], S, 1],
    ['dodec', [0.5], [0.95, 0.2, 0.3], 0xb47e4e, [0.6, 0.2, 0.1], null, S, 1]
  ];
  // 风蚀石柱：一层层叠起来
  P.sandB = [
    ['dodec', [0.95], [0, 0.4, 0], 0xb98554, [0, 0.3, 0], [1.1, 0.5, 1.05], S, 1],
    ['dodec', [0.75], [0.1, 1.0, 0.05], 0xc8925e, [0, 1.1, 0], [1.1, 0.55, 1], S, 1],
    ['dodec', [0.62], [0.05, 1.55, -0.05], 0xb07a4c, [0, 0.4, 0], [1.25, 0.5, 1.15], S, 1]
  ];
  P.sandC = [
    ['dodec', [1.25], [0, 0.25, 0], 0xc69460, [0.05, 0.9, 0.1], [1.2, 0.42, 1.1], S, 1]
  ];
  // ---- 沉钟古城 ----
  var G = 'env_grave', stone = 0x6c7282, stoneD = 0x555a68;
  // 扭曲的枯树
  P.deadA = [
    ['tube', [0.2, 0.36, 2.2, 6], [0, 1.1, 0], dead, [0, 0, 0.08], null, B],
    ['tube', [0.13, 0.2, 1.9, 6], [0.3, 2.95, 0], dead, [0, 0, -0.32], null, B],
    ['cyl', [0.07, 0.13, 1.5, 5], [0.25, 4.35, 0.25], dead, [0.35, 0, 0.4], null, B],
    ['tube', [0.05, 0.1, 1.7, 5], [1.0, 3.35, 0], dead, [0, 0, -1.15], null, B],
    ['tube', [0.05, 0.09, 1.5, 5], [-0.7, 2.75, 0.3], dead, [0.35, 0, 1.05], null, B],
    ['tube', [0.04, 0.08, 1.3, 4], [0.15, 3.8, -0.75], dead, [-1.05, 0, 0.1], null, B],
    ['tube', [0.03, 0.05, 0.9, 4], [1.65, 3.95, 0.1], dead, [0.2, 0, -0.35], null, B],
    ['tube', [0.03, 0.05, 0.8, 4], [-1.25, 3.3, 0.45], dead, [0.3, 0, 0.3], null, B]
  ];
  P.deadB = [
    ['tube', [0.22, 0.34, 1.6, 6], [0, 0.8, 0], dead, null, null, B],
    ['cyl', [0.1, 0.18, 2.2, 5], [-0.5, 2.4, 0], dead, [0, 0, 0.45], null, B],
    ['cyl', [0.1, 0.17, 2.4, 5], [0.55, 2.5, 0.1], dead, [0.1, 0, -0.42], null, B],
    ['tube', [0.04, 0.07, 1.1, 4], [-1.25, 3.55, 0], dead, [0, 0, 0.95], null, B],
    ['tube', [0.04, 0.07, 1.0, 4], [1.25, 3.7, 0.2], dead, [0.2, 0, -0.9], null, B],
    ['tube', [0.03, 0.06, 0.9, 4], [0.7, 3.9, -0.3], dead, [-0.6, 0, -0.1], null, B]
  ];
  // 圆顶墓碑
  P.tomb = [
    ['box', [1.1, 0.18, 0.55], [0, 0.09, 0], stoneD, null, null, G],
    ['box', [0.86, 1.0, 0.24], [0, 0.65, 0], stone, null, null, G],
    ['cyl', [0.43, 0.43, 0.24, 10], [0, 1.15, 0], stone, [Math.PI / 2, 0, 0], null, G],
    ['box', [0.5, 0.06, 0.02], [0, 1.0, 0.13], 0x3c404c, null, null, 'plain'],
    ['box', [0.4, 0.06, 0.02], [0, 0.85, 0.13], 0x3c404c, null, null, 'plain']
  ];
  // 十字架
  P.cross = [
    ['box', [0.6, 0.28, 0.45], [0, 0.14, 0], stoneD, null, null, G],
    ['box', [0.2, 1.75, 0.2], [0, 0.95, 0], stone, null, null, G],
    ['box', [0.95, 0.2, 0.2], [0, 1.35, 0], stone, null, null, G]
  ];
  // 歪倒的旧石板
  P.slab = [
    ['box', [0.8, 1.2, 0.22], [0, 0.5, 0], 0x646a78, [0.18, 0, 0.14], null, G],
    ['box', [0.95, 0.15, 1.6], [0, 0.07, 0.75], 0x4a4f5c, [0, 0, 0], null, G]
  ];
  P.graveRockA = [
    ['dodec', [1.05], [0, 0.42, 0], 0x5e6270, [0.3, 0.5, 0.2], [1.1, 0.75, 1], K, 1],
    ['dodec', [0.5], [0.85, 0.18, 0.4], 0x535766, [0.6, 0.2, 0.1], null, K, 1]
  ];
  // 断掉的石柱
  P.graveRockB = [
    ['cyl', [0.48, 0.52, 1.3, 8], [0, 0.6, 0], 0x666b7a, [0.08, 0, 0.1], null, G],
    ['box', [1.2, 0.2, 1.2], [0, 0.1, 0], 0x50545f, null, null, G],
    ['cyl', [0.45, 0.48, 0.7, 8], [1.0, 0.3, 0.5], 0x5e6372, [1.45, 0.3, 0], null, G]
  ];
  return P;
})();

// ---------------- 关卡 ----------------
// palette：
//   skyTop / skyMid / sky（地平线）/ fog、fogNear / fogFar：天空渐变与雾
//   skyLight / groundLight / hemiInt：半球光（天光、地面反光）；sun / sunInt / sunDir：主光
//   hills：远处几圈山影（从远到近）；clouds / cloudAlpha / cloudCount：云；moon、stars：月亮星星
//   grass / grass2 / dirt / cliff：地面颜色；stone / stone2 / stoneTrim / wood / ivy：建筑
//   cityWalls / bellTower：沉钟古城的塌城墙和倒了一半的钟楼（world.js W.buildCity）；beacon：烽火台光柱颜色（第 7 块用）
// boss / minis：关卡首领和小 Boss（ENEMIES 里的 id，数值和招式表在 data_enemies*.js）
STAGES = [
  // 第 1 关 迷雾森林
  { name: '迷雾森林', boss: 'oakking', minis: ['greenknight', 'shroomking'], beacon: 0x7affc0, hpMult: 1, hpGrow: 2.75, bossHp: 0.4, dmgMult: 1,
    palette: {
      skySeed: 11, skyTop: 0x04557f, skyMid: 0x118bbf, sky: 0x0b7cb0, fog: 0x14698c, fogNear: 5, fogFar: 70,
      skyLight: 0xa2cde6, groundLight: 0x6e6e52, hemiInt: 1.08, sun: 0xffe4b0, sunInt: 0.82, sunDir: [-0.5, 0.75, -0.45],
      hills: [
        { r: 345, h: [34, 112], color: 0x0b78aa, style: 'mesa', fade: 0.25 },
        { r: 290, h: [24, 80], color: 0x0a6c9c, style: 'mesa', fade: 0.35 },
        { r: 238, h: [16, 46], color: 0x0f6589, style: 'peak', fade: 0.5 }
      ],
      clouds: 0x4fb6e2, cloudAlpha: 0.3, cloudCount: 6,
      grass: 0x4a3f19, grass2: 0x2c3517, dirt: 0x3a2d1b, cliff: 0x5a4c3a, tuft: 0x66782e, tuftCount: 1100,
      stone: 0x8e8b84, stone2: 0x7f7d76, stoneTrim: 0x5e5c57, wood: 0x7a5434, ivy: 0xffffff,
      treeCount: 230,
      trees: [ENV_PARTS.oak, ENV_PARTS.tall, ENV_PARTS.young, ENV_PARTS.fork, ENV_PARTS.bush],
      treeShade: [2.6, 2.3, 1.8, 2.5, 1.3],
      rocks: [ENV_PARTS.rockA, ENV_PARTS.rockB, ENV_PARTS.rockC, ENV_PARTS.log]
    },
    pool: [
      // p：关卡进度（0~1）；min：玩家附近保持的最少敌人数；rate：每秒稳定刷怪数；w：出现权重
      // （关卡的 hpMult / dmgMult 是起点倍率，关卡内血量按 e^(hpGrow·p) 成长；bossHp：Boss 血量相对小怪曲线的系数）
      { p: 0, min: 4, rate: 0.35, types: ['goblin', 'slime'], w: [3, 2] },
      { p: 0.1, min: 10, rate: 0.7, types: ['goblin', 'slime', 'wasp'], w: [3, 2, 1] },
      { p: 0.2, min: 18, rate: 1.1, types: ['goblin', 'wasp', 'gobspear', 'wolf'], w: [3, 2, 1, 0.4] },
      { p: 0.32, min: 30, rate: 1.7, types: ['goblin', 'wasp', 'gobspear', 'boar', 'wolf', 'shroom'], w: [2, 2, 2, 1, 0.45, 0.7] },
      { p: 0.46, min: 45, rate: 2.4, types: ['goblin', 'gobspear', 'boar', 'kegimp', 'wolf', 'shroom', 'drummer'], w: [1, 2, 2, 1, 0.5, 0.8, 0.5] },
      { p: 0.62, min: 65, rate: 3.3, types: ['gobspear', 'boar', 'kegimp', 'wolf', 'shroom', 'drummer'], w: [2, 3, 1, 0.5, 0.8, 0.7] },
      { p: 0.8, min: 90, rate: 4.4, types: ['gobspear', 'boar', 'kegimp', 'wolf', 'shroom', 'drummer'], w: [3, 3, 1, 0.6, 0.9, 0.9] },
      { p: 1, min: 115, rate: 5.5 }
    ] },
  // 第 2 关 黄沙古道
  { name: '黄沙古道', boss: 'hourglass', minis: ['wormqueen', 'lizardlord'], beacon: 0xffb84a, hpMult: 40, hpGrow: 2.9, bossHp: 0.25, dmgMult: 2.3,
    palette: {
      skySeed: 23, skyTop: 0x2a74c0, skyMid: 0x4f98d4, sky: 0xe4cb98, fog: 0xd9bd8a, fogNear: 18, fogFar: 128,
      skyLight: 0xfff1da, groundLight: 0x9a7a4c, hemiInt: 0.95, sun: 0xfff2d6, sunInt: 0.85, sunDir: [0.55, 0.72, -0.4],
      hills: [
        { r: 345, h: [55, 112], color: 0xc4a582, style: 'mesa', fade: 0.3 },
        { r: 290, h: [34, 82], color: 0xc08c5c, style: 'mesa', fade: 0.35 },
        { r: 238, h: [20, 48], color: 0xcfa46c, style: 'dune', fade: 0.45 }
      ],
      clouds: 0xfff8ec, cloudAlpha: 0.5, cloudCount: 5,
      moon: { az: -0.6, el: 0.42, r: 8, color: 0xfffbea, halo: 0xffe9b8 },
      sandy: true, grass: 0x9f8b55, grass2: 0x93804f, dirt: 0x7c6140, cliff: 0x8c6242, tuft: 0xa08c52, tuftCount: 420,
      stone: 0xd6b07a, stone2: 0xc49e6a, stoneTrim: 0xa07a4a, wood: 0x7a4f2a, ivy: null,
      treeCount: 110,
      trees: [ENV_PARTS.saguaro, ENV_PARTS.cactus, ENV_PARTS.drytree, ENV_PARTS.shrub],
      treeShade: [0, 0, 0, 0.9],
      rocks: [ENV_PARTS.sandA, ENV_PARTS.sandB, ENV_PARTS.sandC]
    },
    pool: [
      { p: 0, min: 48, rate: 2.4, types: ['mummy', 'scarab'], w: [3, 2] },
      { p: 0.1, min: 54, rate: 2.7, types: ['mummy', 'scarab', 'bat'], w: [3, 3, 1] },
      { p: 0.22, min: 60, rate: 3, types: ['mummy', 'scarab', 'bat', 'lizardsling', 'worm'], w: [2, 2, 2, 1, 0.7] },
      { p: 0.36, min: 62, rate: 3.3, types: ['mummy', 'bat', 'lizardsling', 'scarab', 'worm', 'vulture'], w: [2, 2, 2, 2, 0.8, 0.8] },
      { p: 0.5, min: 76, rate: 4, types: ['lizardsling', 'bat', 'pallbearer', 'scarab', 'worm', 'vulture', 'lizard'], w: [2, 2, 1, 2, 0.8, 0.8, 0.7] },
      { p: 0.66, min: 92, rate: 4.8, types: ['pallbearer', 'lizardsling', 'bat', 'scarab', 'worm', 'vulture', 'lizard'], w: [2, 2, 2, 2, 0.8, 0.9, 0.9] },
      { p: 0.82, min: 110, rate: 5.6, types: ['pallbearer', 'lizardsling', 'bat', 'worm', 'vulture', 'lizard'], w: [3, 2, 2, 0.9, 0.9, 1] },
      { p: 1, min: 130, rate: 6.4 }
    ] },
  // 第 3 关 沉钟古城（第 13 块 D-C13-10：dmgMult 5 → 3.5，第 3 关普通机器人撑的时间只有发布版的 0.22 倍）
  { name: '沉钟古城', boss: 'sunkenbell', minis: ['ghostchamp', 'gravehound'], beacon: 0xb48cff, hpMult: 500, hpGrow: 2.6, bossHp: 0.15, dmgMult: 3.5,
    palette: {
      cityWalls: true, bellTower: true,
      skySeed: 37, skyTop: 0x070a1c, skyMid: 0x111840, sky: 0x252f55, fog: 0x161d34, fogNear: 18, fogFar: 92,
      skyLight: 0x92a4c8, groundLight: 0x30364a, hemiInt: 1.05, sun: 0xbccaff, sunInt: 0.72, sunDir: [0.4, 0.62, -0.55],
      hills: [
        { r: 345, h: [40, 100], color: 0x141b36, style: 'peak', fade: 0.2 },
        { r: 290, h: [28, 74], color: 0x0d1329, style: 'peak', fade: 0.25 },
        { r: 238, h: [18, 46], color: 0x090d1d, style: 'mesa', fade: 0.3 }
      ],
      clouds: 0x2a3356, cloudAlpha: 0.55, cloudCount: 6,
      moon: { az: 1.9, el: 0.32, r: 15, color: 0xe4eaff, halo: 0x7d8ed0, spots: 0xc0c9e6 },
      stars: { count: 320, color: 0xdfe6ff },
      grass: 0x37492c, grass2: 0x2c4130, dirt: 0x3a3330, cliff: 0x40444e, tuft: 0x40584a, tuftCount: 800,
      stone: 0x707688, stone2: 0x62687a, stoneTrim: 0x4c5060, wood: 0x4a3a2a, ivy: 0x9aa8a0,
      treeCount: 160,
      trees: [ENV_PARTS.deadA, ENV_PARTS.deadB, ENV_PARTS.tomb, ENV_PARTS.cross, ENV_PARTS.slab],
      rocks: [ENV_PARTS.graveRockA, ENV_PARTS.graveRockB]
    },
    pool: [
      { p: 0, min: 52, rate: 2.6, types: ['skelguard', 'ghost', 'skeleton'], w: [2, 2, 1] },   // 第 13 块 P10：开场不再是白布幽魂 + 僵尸
      { p: 0.1, min: 58, rate: 2.9, types: ['ghost', 'zombie', 'skeleton'], w: [3, 2, 1] },
      { p: 0.22, min: 64, rate: 3.2, types: ['ghost', 'zombie', 'skeleton', 'gargoyle', 'ecto', 'tomb'], w: [2, 2, 2, 1, 0.7, 0.18] },
      { p: 0.36, min: 70, rate: 3.6, types: ['ghost', 'zombie', 'skeleton', 'ghoul', 'gargoyle', 'ecto', 'tomb'], w: [2, 2, 2, 1, 1, 0.8, 0.2] },
      { p: 0.5, min: 85, rate: 4.3, types: ['skeleton', 'skelguard', 'ghoul', 'gargoyle', 'zombie', 'ecto', 'tomb', 'headless'], w: [2, 1, 2, 2, 1, 0.8, 0.2, 0.7] },
      { p: 0.66, min: 102, rate: 5.1, types: ['skelguard', 'ghoul', 'gargoyle', 'zombie', 'ecto', 'tomb', 'headless'], w: [2, 2, 2, 2, 0.9, 0.22, 0.9] },
      { p: 0.82, min: 120, rate: 6, types: ['skelguard', 'gargoyle', 'ghoul', 'zombie', 'ecto', 'tomb', 'headless'], w: [2, 3, 2, 1, 1, 0.25, 1] },
      { p: 1, min: 145, rate: 7 }
    ] }
];
