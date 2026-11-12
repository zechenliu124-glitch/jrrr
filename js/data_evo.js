'use strict';
// ============================================================
//  超武（武器进化）数据：30 把武器各有一种超武形态
//  条件：武器 Lv8 + 对应纹章 Lv2（且还没进化）
//  觉醒：在圣锻炉锻造，或打开免费金宝箱时自动觉醒（多把满足时选等级最高的）
// ============================================================
var EVO_REQ = { level: 8, tome: 2 };

// 所有超武的通用加成：伤害 ×1.6、数量 +1（用数量的武器）、范围 ×1.25、冷却 ×0.8
var EVO_BONUS = { damage: 1.6, count: 1, size: 1.25, cd: 0.8 };

// 命中特性（只对超武生效；特性打出的伤害不会再触发特性）
// desc 显示在觉醒卡片上（局内）：不用括号，数字用「 · 」接在后面（docs/knight-magic/design/UI_STYLE.md §8.2）
var EVO_TRAITS = {
  burn: { name: '燃烧', desc: '命中时点燃敌人，每秒 40% 伤害，持续 2 秒' },
  chain: { name: '连锁闪电', desc: '25% 几率放出闪电，劈中附近 2 个敌人 · 50% 伤害' },
  nova: { name: '圣光新星', desc: '每命中 8 次爆发 5 米圣光 · 120% 伤害' },
  freeze: { name: '冰封', desc: '12% 几率冻住敌人 1.2 秒；已冻住的敌人会被冻裂，再受一次伤害' },
  execute: { name: '斩杀', desc: '首领和小 Boss 以外、生命低于 12% 的敌人直接毙命' },
  leech: { name: '吸血', desc: '8% 几率回复 2 点生命' },
  gold: { name: '点金', desc: '击杀的敌人额外掉落金币' },
  split: { name: '分裂', desc: '弹丸命中时分裂出 2 枚碎片 · 35% 伤害' },
  stun: { name: '眩晕', desc: '10% 几率击晕敌人 0.6 秒' },
  mark: { name: '标记', desc: '20% 几率标记敌人 4 秒，被标记的敌人受到双倍伤害' }
};

// tome：需要的纹章；name / icon / color：超武的名字、图标、颜色（更亮更暖）
// over：覆盖到超武 def 上的字段（对象按一层合并，比如 ram 只改 minSpeed / arc）
// stats：加到 w.s 上的数值；traits：命中特性；text：形态变化说明
// 爆炸半径 = blast × 范围，进化时范围已经 ×1.25，所以 blast 只比原来大一点
var EVO = {
  knightsword: { tome: 'lion', name: '出师之剑', icon: '出', color: 0xfff0c0, over: { arc: 2.8, quake: { delay: 0.3, r: 2.2, mult: 0.7 } },
    stats: {}, traits: ['nova'], text: '刀光更宽；砍过的地方 0.3 秒后炸开一道金色剑痕' },
  lance: { tome: 'lion', name: '破阵龙枪', icon: '破', color: 0xfff0b0, over: { range: 8.4, ram: { minSpeed: 9, arc: 1.5 } },
    stats: {}, traits: ['stun'], text: '枪更长，冲锋的门槛更低、扇面更宽，刺穿的敌人被击晕' },
  forgehammer: { tome: 'grizzly', name: '熔炉巨锤', icon: '熔', color: 0xffb060, over: {},
    stats: { size: 0.2 }, traits: ['burn'], text: '每一锤都带着炉火，砸出发红的裂缝' },
  roar: { tome: 'grizzly', name: '震山熊吼', icon: '震', color: 0xe0a060, over: { range: 8 },
    stats: {}, traits: ['freeze'], text: '吼声传得更远，太近的敌人会被吓得一动不动' },
  claws: { tome: 'direwolf', name: '九命连爪', icon: '九', color: 0xffc0d0, over: { arc: 1.9 },
    stats: { count: 1 }, traits: ['leech'], text: '一次挠出三道爪痕，挠中的时候偶尔回一口血' },
  beartrap: { tome: 'direwolf', name: '猎王铁夹', icon: '猎', color: 0xc0c4cc, over: { root: 2 },
    stats: { count: 1 }, traits: ['execute'], text: '多放一个、夹得更久，残血的猎物直接拿下' },
  falcon: { tome: 'hawk', name: '苍穹神隼', icon: '穹', color: 0xffe0a0, over: { homing: 8 },
    stats: { count: 1 }, traits: ['mark'], text: '再来一只神隼，追得更紧，啄中的敌人被标记（受到双倍伤害）' },
  javelin: { tome: 'hawk', name: '雷霆投枪', icon: '霆', color: 0xd0f0ff, over: { stick: { delay: 0.3, r: 3.2, k: 1 } },
    stats: { pierce: 3 }, traits: ['chain'], text: '穿得更多，插地的冲击更大，还带闪电' },
  trickknives: { tome: 'raven', name: '千刃戏法', icon: '千', color: 0xffffff, over: { fan: 7 },
    stats: {}, traits: ['split'], text: '一次甩出 7 把，飞刀命中后再分裂' },
  juggle: { tome: 'raven', name: '漫天花球', icon: '漫', color: 0xffb0a0, over: {},
    stats: { bounces: 2, count: 1 }, traits: ['split'], text: '球更多、跳更多，砸中时炸成小花球' },
  icicle: { tome: 'owl', name: '霜华冰枪', icon: '霜', color: 0xe0f8ff, over: {},
    stats: { pierce: 3 }, traits: ['freeze'], text: '冰棱穿得更远，冻住的敌人会被冻裂' },
  slingshot: { tome: 'owl', name: '连珠弹弓', icon: '珠', color: 0xe0c8a0, over: {},
    stats: { count: 2 }, traits: ['gold'], text: '一次打出三颗石子，打倒的敌人多掉金币' },
  hymn: { tome: 'lily', name: '天使颂歌', icon: '颂', color: 0xfff4c8, over: { range: 4.6 },
    stats: {}, traits: ['leech'], text: '歌声传得更远，唱着唱着就能回血' },
  thornvine: { tome: 'lily', name: '霜荆花园', icon: '荆', color: 0xc0f0d0, over: { range: 2.1, slow: [0.5, 1.2] },
    stats: {}, traits: ['freeze'], text: '荆棘更宽、结着霜，碰到的敌人会被冻住' },
  trebuchet: { tome: 'oak', name: '破城投石车', icon: '城', color: 0xd8c8a0, over: { blast: 3.6 },
    stats: {}, traits: ['stun'], text: '石头更大，砸晕一大片' },
  gravecandle: { tome: 'oak', name: '万盏墓烛', icon: '盏', color: 0xe8fff0, over: { blast: 3.4 },
    stats: { count: 1 }, traits: ['execute'], text: '一次立起更多蜡烛，烛火更大，残血的敌人直接送走' },
  beehive: { tome: 'sunflower', name: '蜂后之巢', icon: '后', color: 0xffe070, over: {},
    stats: { count: 2 }, traits: ['split'], text: '蜂群更大，蛰中敌人时飞出小蜂' },
  paintbucket: { tome: 'sunflower', name: '七彩泼墨', icon: '墨', color: 0xff9ad0, over: { range: 3.6 },
    stats: {}, traits: ['mark'], text: '颜料泼得更大，染上颜色的敌人被标记（受到双倍伤害）' },
  toyguard: { tome: 'tower', name: '御林锡兵团', icon: '御', color: 0xff7a6a, over: {},
    stats: { count: 2 }, traits: ['chain'], text: '再来两个锡兵，刺刀上带着电火花' },
  fryingpan: { tome: 'tower', name: '黄金大锅', icon: '金', color: 0xffd040, over: {},
    stats: { count: 1, size: 0.2 }, traits: ['gold'], text: '两口金锅，敲倒的敌人会掉金币' },
  firecracker: { tome: 'goldkey', name: '万响长鞭', icon: '响', color: 0xff6a4a, over: { range: 3.4 },
    stats: { duration: 0.8 }, traits: ['burn'], text: '噼里啪啦停不下来：范围更大、炸得更久，火星点着一片' },
  skyrocket: { tome: 'goldkey', name: '满天星', icon: '满', color: 0xffd27a, over: {},
    stats: { count: 2 }, traits: ['split'], text: '一次多放两支，炸开时撒出一圈星星碎片' },
  chessknight: { tome: 'wheel', name: '将军！', icon: '将', color: 0xffe0b0, over: { hopR: 2.2 },
    stats: { bounces: 3 }, traits: ['execute'], text: '多跳三步、每一步砸得更大，残血的敌人直接被「将死」' },
  thunderdrum: { tome: 'wheel', name: '雷公鼓', icon: '雷', color: 0xd0f0ff, over: {},
    stats: { bounces: 3 }, traits: ['chain'], text: '雷声多跳 3 次，还会引出更多闪电' },
  kite: { tome: 'gale', name: '金龙风筝', icon: '龙', color: 0xffd070, over: { range: 8, hitR: 1.8 },
    stats: { count: 1 }, traits: ['chain'], text: '风筝变成一条长长的金龙，绕得更远，还会引来闪电' },
  pigeons: { tome: 'gale', name: '白鸽圣使', icon: '使', color: 0xffffff, over: {},
    stats: { bounces: 3 }, traits: ['nova'], text: '信鸽多送 3 家，每送 8 次降下一次圣光' },
  astrolabe: { tome: 'starry', name: '陨星天穹', icon: '陨', color: 0xffe8a0, over: { blast: 3 },
    stats: { count: 1 }, traits: ['burn'], text: '星星变成陨石，砸下来还会燃烧' },
  lanternbeam: { tome: 'starry', name: '破晓之光', icon: '晓', color: 0xfff0a0, over: { range: 14, beamW: 0.2 },
    stats: {}, traits: ['nova'], text: '光束更长更粗，每照到 8 次放一次圣光' },
  bronzebell: { tome: 'crescent', name: '晨昏钟', icon: '晨', color: 0xffe8b0, over: { range: 7.5, extraMult: 0.35, sizeK: 0.6 },   // 第 13 块 D-C13-5：后面几圈 0.6 → 0.45 时无敌局里还占 88 % 的伤害，再到 0.35、范围加成超过 1 的部分 × 0.6（铜钟本身不变）
    stats: {}, traits: ['stun'], text: '钟声传得更远，扫到的敌人会被震晕' },
  rod: { tome: 'crescent', name: '钓龙竿', icon: '钓', color: 0xc0f0c8, over: { range: 20 },
    stats: { count: 1 }, traits: ['gold'], text: '甩得更远、一次甩两竿，钓上岸的敌人会掉金币' }
};
