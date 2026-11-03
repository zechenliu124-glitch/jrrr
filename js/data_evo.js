'use strict';
// ============================================================
//  超武（武器进化）数据：30 把武器各有一种超武形态
//  条件：武器 Lv8 + 对应魔典 Lv2（且还没进化）
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
  execute: { name: '斩杀', desc: '生命低于 12% 的非 Boss 敌人直接毙命' },
  leech: { name: '吸血', desc: '8% 几率回复 2 点生命' },
  gold: { name: '点金', desc: '击杀的敌人额外掉落金币' },
  split: { name: '分裂', desc: '弹丸命中时分裂出 2 枚碎片 · 35% 伤害' },
  stun: { name: '眩晕', desc: '10% 几率击晕敌人 0.6 秒' },
  mark: { name: '标记', desc: '20% 几率标记敌人 4 秒，被标记的敌人受到双倍伤害' }
};

// tome：需要的魔典；name / icon / color：超武的名字、图标、颜色（更亮更暖）
// over：覆盖到超武 def 上的字段；stats：加到 w.s 上的数值；traits：命中特性；text：形态变化说明
// 爆炸半径 = blast × 范围，进化时范围已经 ×1.25，所以 blast 只比原来大一点
var EVO = {
  sword: { tome: 'size', name: '断罪圣剑', icon: '圣', color: 0xfff0b8, over: { heroProj: true, speed: 30 }, traits: ['nova'], text: '挥砍时放出穿透的圣光剑气' },
  firestaff: { tome: 'dur', name: '炼狱法杖', icon: '狱', color: 0xffb43a, over: { blast: 3.0, burn: 0.5 }, traits: ['burn'], text: '爆炸范围更大，火焰烧得更猛' },
  revolver: { tome: 'qty', name: '千矢连弩', icon: '千', color: 0xf0c870, stats: { bounces: 2 }, traits: ['split'], text: '弩箭弹射 +2 次' },
  bone: { tome: 'kb', name: '巨人骸骨', icon: '巨', color: 0xfff4c8, stats: { bounces: 2, size: 0.3 }, traits: ['stun'], text: '骨头更大，弹射 +2 次' },
  aura: { tome: 'regen', name: '天使圣域', icon: '天', color: 0xfff3a8, over: { range: 4.7 }, traits: ['leech', 'nova'], text: '光环范围 +30%' },
  axe: { tome: 'dur', name: '风暴战斧', icon: '暴', color: 0xffe7a0, stats: { count: 1 }, traits: ['chain'], text: '飞斧再 +1' },
  aegis: { tome: 'armor', name: '不破圣盾', icon: '坚', color: 0xfff09a, stats: { size: 0.25 }, traits: ['stun'], text: '格挡震荡波范围更大' },
  bow: { tome: 'prec', name: '穿云神弓', icon: '云', color: 0xffd27a, over: { homing: 4 }, traits: ['mark'], text: '箭矢会追踪敌人' },
  katana: { tome: 'agi', name: '疾风细剑', icon: '疾', color: 0xffb0a0, over: { back: true }, traits: ['leech'], text: '同时向前后两边斩击' },
  tornado: { tome: 'pspd', name: '天灾飓风', icon: '灾', color: 0xfff6d8, stats: { count: 1 }, traits: ['chain'], text: '龙卷风再 +1' },
  dagger: { tome: 'cd', name: '影舞飞刃', icon: '影', color: 0xe0ffc0, stats: { bounces: 2 }, traits: ['execute'], text: '匕首弹射 +2 次' },
  sniper: { tome: 'dmg', name: '攻城巨弩', icon: '攻', color: 0xe8b060, over: { explode: true, blast: 2.6 }, traits: ['mark'], text: '重弩箭命中后爆炸，范围约 3.3 米' },
  blackhole: { tome: 'size', name: '虚空奇点', icon: '虚', color: 0xc59aff, over: { range: 4.2 }, traits: ['execute'], text: '黑洞范围 +40%' },
  dexe: { tome: 'cursed', name: '断头巨刃', icon: '断', color: 0xffe6b0, over: { execute: 0.06 }, traits: ['gold'], text: '处决几率 ×3，达到 6%' },
  bloodmagic: { tome: 'blood', name: '血月秘法', icon: '月', color: 0xff5a6a, stats: { count: 1 }, traits: ['leech'], text: '血球再 +1' },
  frost: { tome: 'shield', name: '永冬领域', icon: '冬', color: 0xe0f8ff, over: { range: 5.5 }, traits: ['freeze'], text: '冰霜范围 +30%' },
  poison: { tome: 'evade', name: '瘟疫之源', icon: '瘟', color: 0xc8ff6a, over: { range: 3.7, burnColor: 0x9dff4a }, traits: ['burn'], text: '毒云更大，中毒的敌人持续溃烂' },
  dice: { tome: 'luck', name: '命运之骰', icon: '命', color: 0xfff2b0, stats: { count: 1 }, traits: ['gold'], text: '骰子再 +1' },
  corrupted: { tome: 'thorns', name: '堕落魔剑', icon: '堕', color: 0xc05aff, over: { heroProj: true, speed: 28 }, traits: ['leech'], text: '挥砍时放出堕落剑气' },
  banana: { tome: 'attract', name: '月刃回旋镖', icon: '刃', color: 0xfff2a0, stats: { count: 1 }, traits: ['split'], text: '回旋镖再 +1' },
  lightning: { tome: 'chaos', name: '天罚雷杖', icon: '罚', color: 0xfff3a0, stats: { bounces: 3 }, traits: ['stun'], text: '闪电连锁 +3 次' },
  flamewalker: { tome: 'agi', name: '焦土行者', icon: '焦', color: 0xffa040, over: { range: 2.3 }, traits: ['burn'], text: '火焰足迹更宽' },
  chunkers: { tome: 'hp', name: '陨星重锤', icon: '陨', color: 0xffc070, stats: { count: 1 }, traits: ['stun'], text: '流星锤再 +1' },
  rocket: { tome: 'qty', name: '奥术飞弹群', icon: '奥', color: 0xff9aff, stats: { count: 2 }, traits: ['chain'], text: '魔弹再 +2' },
  mines: { tome: 'golden', name: '黄金火药', icon: '金', color: 0xffd040, over: { blast: 4.2 }, traits: ['gold'], text: '爆炸范围更大' },
  noodle: { tome: 'dur', name: '缚魂锁链', icon: '缚', color: 0xffe8c0, over: { range: 19.5 }, traits: ['freeze'], text: '锁链距离 +40%' },
  herosword: { tome: 'dmg', name: '传说勇者剑', icon: '传', color: 0xfff0c0, over: { waveScale: 1.45 }, traits: ['nova'], text: '剑气更大、飞得更远' },
  shotgun: { tome: 'kb', name: '暴风散弩', icon: '风', color: 0xf0c080, over: { extraBolts: 2 }, traits: ['stun'], text: '每次多射 2 支短箭' },
  dragon: { tome: 'size', name: '真龙吐息', icon: '真', color: 0xffc040, over: { range: 9.8 }, traits: ['burn'], text: '喷火距离 +40%' },
  scythe: { tome: 'blood', name: '死神镰刀', icon: '死', color: 0xe8d0ff, over: { range: 6.2 }, traits: ['execute'], text: '镰刀范围 +40%' }
};
