'use strict';
// ============================================================
//  游戏内容：属性、魔典、武器、物品、角色、敌人、关卡
//  数值参考 Megabonk 社区资料（基础值 + 普通稀有度的升级量）
// ============================================================

// 稀有度：普通(绿) 优秀(蓝) 稀有(紫) 史诗(红) 传说(黄)；升级数值按倍率放大
var RARITY_MULT = [1, 1.2, 1.4, 1.6, 2];

// ---------------- 属性 ----------------
// armor / evasion 为内部值，实际效果 = 护甲 a/(0.75+a)，闪避 e/(1+e)
var STATS = {
  maxHp: { name: '最大生命', base: 100 },
  regen: { name: '生命回复（每分钟）', base: 10 },
  shield: { name: '护盾', base: 0 },
  armor: { name: '护甲', base: 0, pct: true, show: function (v) { return v / (0.75 + v); } },
  evasion: { name: '闪避', base: 0.01, pct: true, show: function (v) { return v / (1 + v); } },
  lifesteal: { name: '吸血几率', base: 0, pct: true },
  thorns: { name: '荆棘', base: 0 },
  damage: { name: '伤害', base: 1, pct: true },
  critChance: { name: '暴击率', base: 0.01, pct: true },
  critDmg: { name: '暴击伤害', base: 2, pct: true },
  atkSpeed: { name: '攻击速度', base: 1, pct: true },
  quantity: { name: '弹丸数量', base: 0 },
  size: { name: '范围', base: 1, pct: true },
  duration: { name: '持续时间', base: 1, pct: true },
  projSpeed: { name: '弹道速度', base: 1, pct: true },
  knockback: { name: '击退', base: 1, pct: true },
  moveSpeed: { name: '移动速度', base: 1, pct: true },
  jump: { name: '跳跃高度', base: 1, pct: true },
  extraJumps: { name: '额外跳跃', base: 0 },
  pickup: { name: '拾取范围', base: 1, pct: true },
  xpGain: { name: '经验获取', base: 1, pct: true },
  goldGain: { name: '金币获取', base: 1, pct: true },
  luck: { name: '幸运', base: 0, pct: true },
  difficulty: { name: '难度', base: 0, pct: true },
  eliteDmg: { name: '对精英/Boss 伤害', base: 0, pct: true },
  eliteSpawn: { name: '精英出现率', base: 1, pct: true },
  powerupChance: { name: '强化道具掉率', base: 1, pct: true },
  weaponSlots: { name: '武器栏位', base: 4 },
  tomeSlots: { name: '魔典栏位', base: 4 }
};

// ---------------- 魔典 ----------------
// vals 为普通稀有度每级的数值；mult: true 表示乘法叠加
var TOMES = {
  dmg: { name: '伤害魔典', stat: 'damage', val: 0.08, mult: true, icon: '伤', color: 0xd9433b, desc: '伤害 ×1.08（乘法叠加）' },
  cd: { name: '冷却魔典', stat: 'atkSpeed', val: 0.075, icon: '速', color: 0x3bb0d9, desc: '所有武器攻击更快' },
  qty: { name: '数量魔典', stat: 'quantity', val: 1, icon: '量', color: 0xe3a53a, desc: '所有武器多发射弹丸' },
  prec: { name: '精准魔典', stat: 'critChance', val: 0.07, icon: '准', color: 0xf0e04a, desc: '暴击率超过 100% 时会超级暴击' },
  size: { name: '体积魔典', stat: 'size', val: 0.1, icon: '大', color: 0x8b5bd9, desc: '攻击和爆炸范围更大' },
  hp: { name: '生命魔典', stat: 'maxHp', val: 25, icon: '命', color: 0xe85a7a, desc: '提高最大生命' },
  regen: { name: '再生魔典', stat: 'regen', val: 40, icon: '生', color: 0x5bd96a, desc: '每分钟回复更多生命' },
  shield: { name: '护盾魔典', stat: 'shield', val: 25, icon: '盾', color: 0x6ad1ff, desc: '一段时间不受伤后护盾会再生' },
  armor: { name: '护甲魔典', stat: 'armor', val: 0.12, icon: '甲', color: 0x9aa3ad, desc: '减少受到的伤害（收益递减）' },
  evade: { name: '闪避魔典', stat: 'evasion', val: 0.1, icon: '闪', color: 0xc0e0ff, desc: '有几率完全躲开伤害（收益递减）' },
  blood: { name: '鲜血魔典', stat: 'lifesteal', val: 0.1, icon: '血', color: 0xa31f2c, desc: '每次命中有几率回复 1 点生命' },
  thorns: { name: '荆棘魔典', stat: 'thorns', val: 15, icon: '刺', color: 0x7a9a3a, desc: '被碰到时把伤害还给敌人' },
  pspd: { name: '弹速魔典', stat: 'projSpeed', val: 0.15, icon: '疾', color: 0x7ad9f0, desc: '弹丸飞得更快' },
  dur: { name: '持续魔典', stat: 'duration', val: 0.15, icon: '久', color: 0xa07ad9, desc: '效果持续更久' },
  kb: { name: '击退魔典', stat: 'knockback', val: 0.2, icon: '退', color: 0xd99a5b, desc: '把敌人打得更远' },
  agi: { name: '敏捷魔典', stat: 'moveSpeed', val: 0.15, icon: '敏', color: 0x5be3c8, desc: '跑得更快' },
  attract: { name: '吸引魔典', stat: 'pickup', val: 0.75, icon: '吸', color: 0xd94ab0, desc: '拾取范围更大' },
  luck: { name: '幸运魔典', stat: 'luck', val: 0.07, icon: '运', color: 0x4ac94a, desc: '更容易出现高稀有度' },
  xp: { name: '经验魔典', stat: 'xpGain', val: 0.07, icon: '经', color: 0x4a8cf0, desc: '获得更多经验' },
  golden: { name: '黄金魔典', stat: 'goldGain', val: 0.12, icon: '金', color: 0xf0c03a, desc: '获得更多金币' },
  cursed: { name: '诅咒魔典', stat: 'difficulty', val: 0.035, icon: '咒', color: 0x5a2d6b, desc: '敌人更多更强（风险换奖励）' },
  chaos: { name: '混沌魔典', stat: 'chaos', val: 1, icon: '混', color: 0xff5ad9, desc: '每级随机提升一项属性' }
};

// 混沌魔典随机提升的属性（普通稀有度数值）
var CHAOS_POOL = [['damage', 0.06], ['atkSpeed', 0.06], ['critChance', 0.05], ['maxHp', 20], ['size', 0.08], ['moveSpeed', 0.08], ['luck', 0.05], ['xpGain', 0.06], ['armor', 0.08], ['regen', 30], ['quantity', 0.5], ['projSpeed', 0.1]];

// ---------------- 武器 ----------------
// base：基础数值；up：每次普通稀有度升级的增加量（乘以稀有度倍率）
// size / pspd / duration 是倍率（1 = 100%），cd 为冷却秒数（受攻击速度影响）
var WEAPONS = {
  sword: { name: '大剑', icon: '剑', color: 0xdfe6ee, type: 'melee', arc: 2.6, range: 4.6, desc: '大范围横扫，一次砍中好几个敌人',
    base: { damage: 11, cd: 0.75, count: 1, size: 1, knockback: 2 }, up: { damage: 2, knockback: 0.5, count: 1, size: 0.2 } },
  firestaff: { name: '火焰法杖', icon: '火', color: 0xff7a2a, type: 'shot', proj: 'fireball', explode: true, blast: 2.6, speed: 15, projR: 0.6, life: 2.5, burn: 0.3, desc: '慢速火球，命中后爆炸并点燃敌人',
    base: { damage: 10, cd: 0.8, count: 1, size: 1, pspd: 1, knockback: 1 }, up: { damage: 2.5, count: 1, pspd: 0.2, size: 0.16 } },
  revolver: { name: '连弩', icon: '弩', color: 0x9a7a4a, type: 'shot', proj: 'bolt', burst: true, speed: 45, projR: 0.35, life: 1.2, desc: '连射 6 支弩箭，弩箭会在敌人之间弹射',
    base: { damage: 5, cd: 1.4, count: 6, size: 1, pspd: 1, bounces: 0, critChance: 0.05, critDmg: 0, knockback: 0.5 }, up: { critChance: 0.1, critDmg: 0.2, damage: 2.5, bounces: 1, count: 1, pspd: 0.2 } },
  bone: { name: '骨头', icon: '骨', color: 0xf3ead0, type: 'bounce', proj: 'bone', spin: 16, speed: 18, projR: 0.6, life: 2.4, desc: '扔出会在敌人之间弹来弹去的骨头',
    base: { damage: 11, cd: 0.6, count: 1, size: 1.2, pspd: 1, bounces: 1, critChance: 0.1, knockback: 1.3 }, up: { damage: 2.5, knockback: 0.3, bounces: 1, count: 1, pspd: 0.2 } },
  aura: { name: '圣光光环', icon: '光', color: 0xffe066, type: 'aura', range: 3.6, desc: '持续伤害身边的所有敌人（攻速提高跳伤频率）',
    base: { damage: 6, cd: 0.6, size: 1, knockback: 0.5 }, up: { damage: 1.4, size: 0.14 } },
  axe: { name: '飞斧', icon: '斧', color: 0xb0b8c0, type: 'axe', proj: 'axe', spin: 14, speed: 16, projR: 1.2, desc: '扔出旋转的飞斧，在敌人中间停留并持续砍杀',
    base: { damage: 6, cd: 1.4, count: 2, size: 1, pspd: 1, duration: 0.8, knockback: 1 }, up: { damage: 1.5, duration: 0.08, count: 1, size: 0.1 } },
  aegis: { name: '神盾', icon: '盾', color: 0xffd84a, type: 'aegis', proj: 'shield', range: 2.2, desc: '挡下敌人的攻击，并放出震荡波反击',
    base: { damage: 10, cd: 1.5, count: 2, size: 1, knockback: 3 }, up: { damage: 2, knockback: 0.8, count: 1, size: 0.15 } },
  bow: { name: '长弓', icon: '弓', color: 0xb9874a, type: 'shot', proj: 'arrow', speed: 34, projR: 0.5, life: 1.6, desc: '射出能穿透所有敌人的箭',
    base: { damage: 9, cd: 0.92, count: 1, size: 1, pspd: 1.5, pierce: 99, critChance: 0, critDmg: 0, knockback: 1 }, up: { critChance: 0.08, critDmg: 0.18, damage: 1.8, count: 1, pspd: 0.4, size: 0.2 } },
  katana: { name: '细剑', icon: '刺', color: 0xff4a6a, type: 'melee', arc: 1.4, range: 3.6, desc: '对最近的敌人快速连斩',
    base: { damage: 11, cd: 0.4, count: 1, size: 1, critChance: 0, critDmg: 0, knockback: 1 }, up: { critChance: 0.08, critDmg: 0.2, damage: 2.2, count: 1, size: 0.2 } },
  tornado: { name: '龙卷风', icon: '风', color: 0xd8f0ff, type: 'tornado', range: 2.5, desc: '放出乱跑的龙卷风，把敌人卷飞',
    base: { damage: 8, cd: 0.9, count: 1, size: 1, pspd: 1, duration: 3, knockback: 3 }, up: { damage: 2, knockback: 0.6, count: 1, pspd: 0.2, size: 0.14 } },
  dagger: { name: '无线匕首', icon: '匕', color: 0x7affd0, type: 'shot', proj: 'dagger', homing: 7, speed: 24, projR: 0.45, desc: '会追踪敌人并在敌人之间弹射的匕首',
    base: { damage: 9, cd: 0.5, count: 1, size: 1, pspd: 0.8, bounces: 1, duration: 1.5, knockback: 0.5 }, up: { damage: 2, duration: 0.25, bounces: 1, count: 1, pspd: 0.1 } },
  sniper: { name: '重弩', icon: '重', color: 0x6a4a2a, type: 'shot', proj: 'heavybolt', aimed: true, speed: 110, projR: 0.5, life: 1.2, desc: '朝准星方向射出穿透一切的重弩箭（需要手动瞄准）',
    base: { damage: 22, cd: 1.0, count: 1, size: 1, pspd: 1, pierce: 99, critChance: 0.1, knockback: 3 }, up: { damage: 4, count: 1, size: 0.13 } },
  blackhole: { name: '黑洞', icon: '洞', color: 0x6a3dff, type: 'blackhole', range: 3, desc: '制造吸住敌人的黑洞，持续造成伤害',
    base: { damage: 4, cd: 2.4, count: 1, size: 1, duration: 2, knockback: 6 }, up: { damage: 1.3, duration: 0.12, count: 1, size: 0.13 } },
  dexe: { name: '处刑大刀', icon: '处', color: 0xc8c8d8, type: 'shot', proj: 'blade', speed: 26, projR: 1.0, life: 1.0, execute: 0.02, desc: '穿透敌人的巨大刀刃，有 2% 几率直接处决',
    base: { damage: 9, cd: 0.8, count: 1, size: 1, pspd: 1, pierce: 99, critChance: 0, knockback: 2 }, up: { critChance: 0.05, damage: 2, count: 1, size: 0.2 } },
  bloodmagic: { name: '血魔法', icon: '血', color: 0xd9233a, type: 'shot', proj: 'bloodorb', homing: 5, speed: 16, projR: 0.55, life: 3, desc: '追踪的血球；击杀有几率永久提升最大生命',
    base: { damage: 9, cd: 1.2, count: 1, size: 1, pspd: 1, knockback: 1 }, up: { damage: 1.5, count: 1, size: 0.15 } },
  frost: { name: '冰霜行者', icon: '冰', color: 0x9fe8ff, type: 'aura', freeze: true, range: 4.2, desc: '冻住身边的敌人并造成伤害',
    base: { damage: 9, cd: 1.0, size: 1, duration: 1.6, knockback: 0.5 }, up: { damage: 2, duration: 0.12, size: 0.1 } },
  poison: { name: '毒瓶', icon: '毒', color: 0x7dff4a, type: 'puddle', range: 2.8, desc: '扔出毒瓶，碎成持续伤害的毒云',
    base: { damage: 3, cd: 0.9, count: 1, size: 1, pspd: 1, duration: 3 }, up: { damage: 0.6, duration: 1, count: 1, pspd: 0.2, size: 0.15 } },
  dice: { name: '骰子', icon: '骰', color: 0xffffff, type: 'shot', proj: 'dice', dice: true, spin: 10, speed: 22, projR: 0.55, life: 1.6, desc: '掷出 1~6 点伤害倍率；掷出 6 点会永久提高暴击率',
    base: { damage: 4, cd: 0.9, count: 1, size: 1, pspd: 0.8, critChance: 0.17, critDmg: 0, knockback: 1 }, up: { critChance: 0.1, critDmg: 0.2, damage: 2, count: 1, pspd: 0.2, size: 0.15 } },
  corrupted: { name: '腐化之剑', icon: '腐', color: 0x8a2ad9, type: 'melee', arc: 2.0, range: 4.2, back: true, lowHp: true, desc: '同时向前后挥砍；生命越低伤害越高',
    base: { damage: 12, cd: 0.8, count: 1, size: 1, knockback: 1.5 }, up: { damage: 2, count: 1, knockback: 0.5, size: 0.2 } },
  banana: { name: '香蕉回旋镖', icon: '蕉', color: 0xffe14a, type: 'boomerang', proj: 'banana', spin: 18, speed: 20, projR: 0.8, out: 14, desc: '飞出去再飞回来，来回都能打中',
    base: { damage: 9, cd: 1.2, count: 1, size: 1, pspd: 1, knockback: 1 }, up: { damage: 2, count: 1, pspd: 0.1, size: 0.14 } },
  lightning: { name: '雷霆权杖', icon: '雷', color: 0x9fd8ff, type: 'chain', desc: '闪电劈中附近的敌人，并在敌人之间连锁',
    base: { damage: 7, cd: 1.1, count: 1, size: 1, bounces: 0, knockback: 1 }, up: { damage: 2, bounces: 1, count: 1, size: 0.2 } },
  flamewalker: { name: '火焰行者', icon: '焰', color: 0xff5a1a, type: 'trail', range: 1.6, desc: '走过的地方留下燃烧的火焰',
    base: { damage: 5, cd: 0.25, count: 1, size: 1, duration: 1.5 }, up: { damage: 2, duration: 0.18, count: 1, size: 0.15 } },
  chunkers: { name: '流星锤', icon: '锤', color: 0x8a8a94, type: 'orbit', proj: 'flail', range: 3.4, desc: '绕着你旋转的带刺铁锤',
    base: { damage: 12, cd: 0.5, count: 3, size: 1, pspd: 1.5, knockback: 2.5 }, up: { damage: 3, knockback: 0.6, count: 1, pspd: 0.4, size: 0.2 } },
  rocket: { name: '追踪魔弹', icon: '弹', color: 0xd05aff, type: 'shot', proj: 'bloodorb', homing: 6, explode: true, blast: 2.2, speed: 18, projR: 0.5, life: 3, desc: '追踪敌人并爆炸的魔法飞弹',
    base: { damage: 11, cd: 0.6, count: 1, size: 1, pspd: 1, critChance: 0.05, knockback: 1 }, up: { critChance: 0.08, damage: 2, count: 1, pspd: 0.2, size: 0.2 } },
  mines: { name: '火药桶', icon: '桶', color: 0xff5a3a, type: 'mine', blast: 3.6, desc: '在身边撒下地雷，敌人靠近就爆炸',
    base: { damage: 10, cd: 1.0, count: 1, size: 1, duration: 4, knockback: 2 }, up: { damage: 3, duration: 0.4, count: 1, size: 0.15 } },
  noodle: { name: '锁链', icon: '链', color: 0xc0c8d0, type: 'tether', range: 14, desc: '甩出锁链勾住一个敌人，伤害锁链上的所有敌人',
    base: { damage: 10, cd: 2.5, size: 1, duration: 4, knockback: 0 }, up: { damage: 2, duration: 0.2, size: 0.2 } },
  herosword: { name: '勇者之剑', icon: '勇', color: 0x7ac8ff, type: 'melee', arc: 2.0, range: 4.0, heroProj: true, speed: 30, desc: '挥砍的同时射出一道穿透剑气',
    base: { damage: 11, cd: 0.75, count: 1, size: 1, pspd: 1, knockback: 1.5 }, up: { damage: 2, count: 1, pspd: 0.13, size: 0.15 } },
  shotgun: { name: '散射弩', icon: '散', color: 0x8a6a4a, type: 'shotgun', proj: 'bolt', aimed: true, speed: 44, projR: 0.35, life: 0.4, desc: '朝准星方向一次射出一排短箭；数量提高伤害',
    base: { damage: 9, cd: 1.0, count: 1, size: 1, pspd: 1, critChance: 0.05, knockback: 2.5 }, up: { critChance: 0.07, damage: 3, knockback: 0.4, count: 1, size: 0.15 } },
  dragon: { name: '龙息', icon: '龙', color: 0xff8a1a, type: 'flame', range: 7, desc: '对附近敌人喷出旋转的火焰',
    base: { damage: 15, cd: 2.0, size: 1, duration: 1.0, knockback: 0.5 }, up: { damage: 3, duration: 0.2, size: 0.15 } },
  scythe: { name: '镰刀', icon: '镰', color: 0x6a6a8a, type: 'melee', arc: 4.7, range: 4.4, desc: '绕身横扫的大镰刀',
    base: { damage: 11, cd: 0.85, count: 1, size: 1, knockback: 1.5 }, up: { damage: 2, count: 1, size: 0.2, knockback: 0.4 } }
};

// ---------------- 物品 ----------------
// 稀有度：0 普通 2 稀有 3 史诗 4 传说（物品没有“优秀”档）
var ITEMS = {
  oats: { name: '燕麦', rarity: 0, icon: '燕', color: 0xd9b46a, desc: '+25 最大生命', stats: { maxHp: 25 } },
  clover: { name: '四叶草', rarity: 0, icon: '草', color: 0x4ac94a, desc: '+7.5% 幸运', stats: { luck: 0.075 } },
  medkit: { name: '医疗包', rarity: 0, icon: '医', color: 0xffffff, desc: '+45 生命回复（每分钟）', stats: { regen: 45 } },
  battery: { name: '电池', rarity: 0, icon: '电', color: 0x3ad97a, desc: '+8% 攻击速度', stats: { atkSpeed: 0.08 } },
  key: { name: '钥匙', rarity: 0, icon: '钥', color: 0xffd84a, desc: '+10% 几率免费打开宝箱' },
  bossbuster: { name: '巨人克星', rarity: 0, icon: '克', color: 0xb03a3a, desc: '+15% 对精英和 Boss 伤害', stats: { eliteDmg: 0.15 } },
  cheese: { name: '发霉奶酪', rarity: 0, icon: '酪', color: 0xc8d94a, desc: '命中时 40% 几率使敌人中毒' },
  gymsauce: { name: '健身酱', rarity: 0, icon: '酱', color: 0xd9533a, desc: '+10% 伤害', stats: { damage: 0.1 } },
  juice: { name: '禁忌果汁', rarity: 0, icon: '汁', color: 0x9a3ad9, desc: '+10% 暴击率', stats: { critChance: 0.1 } },
  glasses: { name: '战术眼镜', rarity: 0, icon: '镜', color: 0x3a3a4a, desc: '对生命高于 90% 的敌人 +25% 伤害' },
  ring: { name: '滑溜戒指', rarity: 0, icon: '戒', color: 0xc0c8d0, desc: '+10% 闪避（收益递减）', stats: { evasion: 0.1 } },
  borgar: { name: '汉堡', rarity: 0, icon: '堡', color: 0xd99a4a, desc: '击杀敌人时 2% 几率掉落回血汉堡' },
  feathers: { name: '羽毛', rarity: 0, icon: '羽', color: 0xf0f0f0, desc: '+15% 跳跃高度，+1 额外跳跃', stats: { jump: 0.15, extraJumps: 1 } },
  backpack: { name: '背包', rarity: 2, icon: '包', color: 0x6a8a3a, desc: '所有武器 +1 弹丸', stats: { quantity: 1 } },
  beer: { name: '啤酒', rarity: 2, icon: '啤', color: 0xe8b83a, desc: '+20% 伤害，−5 最大生命', stats: { damage: 0.2, maxHp: -5 } },
  knuckles: { name: '铜指虎', rarity: 2, icon: '拳', color: 0xc8963a, desc: '对附近（6 米内）的敌人 +20% 伤害' },
  campfire: { name: '营火', rarity: 2, icon: '营', color: 0xff8a3a, desc: '站着不动时快速回复生命' },
  cloak: { name: '懦夫斗篷', rarity: 2, icon: '篷', color: 0x5a3d8a, desc: '+5% 移动速度；受伤后短时间 +15% 移动速度', stats: { moveSpeed: 0.05 } },
  greencard: { name: '绿色信用卡', rarity: 2, icon: '绿', color: 0x3ad95a, desc: '每打开一个宝箱，本局 +2% 幸运' },
  redcard: { name: '红色信用卡', rarity: 2, icon: '红', color: 0xd93a3a, desc: '每打开一个宝箱，本局 +2.5% 伤害' },
  sneakers: { name: '金色运动鞋', rarity: 2, icon: '鞋', color: 0xffd23a, desc: '每移动 10 米获得 1 金币' },
  plug: { name: '电插头', rarity: 2, icon: '插', color: 0x5a5a6a, desc: '受伤时放出电击，伤害附近敌人' },
  echo: { name: '回声碎片', rarity: 2, icon: '碎', color: 0xb05aff, desc: '击杀时 12% 几率额外掉落经验' },
  demonblade: { name: '恶魔之刃', rarity: 2, icon: '魔', color: 0x8a1a2a, desc: '暴击时 25% 几率回复 1 点生命' },
  wrench: { name: '扳手', rarity: 2, icon: '扳', color: 0x8a8a9a, desc: '神龛充能更快，奖励更高' },
  magnet: { name: '吸吸磁铁', rarity: 2, icon: '磁', color: 0xd94a4a, desc: '每 30 秒吸取画面内所有经验' },
  anvil: { name: '铁砧', rarity: 3, icon: '砧', color: 0x5a5a66, desc: '武器升级时额外多一项属性' },
  goldring: { name: '金戒指', rarity: 3, icon: '金', color: 0xffd84a, desc: '好像……什么都没发生？' },
  harvester: { name: '灵魂收割者', rarity: 3, icon: '魂', color: 0xbfe8ff, desc: '每次击杀放出 2 个追踪灵魂' },
  icecube: { name: '冰块', rarity: 4, icon: '冰', color: 0x9fe8ff, desc: '命中时 20% 几率冻住敌人' },
  holybook: { name: '圣典', rarity: 4, icon: '圣', color: 0xfff2b0, desc: '+100 最大生命，+50 生命回复（每分钟）', stats: { maxHp: 100, regen: 50 } },
  chonk: { name: '胖胖板甲', rarity: 4, icon: '甲', color: 0x9aa3ad, desc: '+20% 吸血，+50 最大生命', stats: { lifesteal: 0.2, maxHp: 50 } },
  lamp: { name: '超能台灯', rarity: 4, icon: '灯', color: 0xfff27a, desc: '所有“命中时几率”效果额外再判定一次' },
  fork: { name: '巨型叉子', rarity: 4, icon: '叉', color: 0xd0d0d8, desc: '+15% 暴击率；暴击有 14% 几率变成 4 倍超大暴击', stats: { critChance: 0.15 } },
  dragonfire: { name: '龙火', rarity: 4, icon: '炎', color: 0xff5a1a, desc: '命中时 15% 几率召唤燃烧的火焰' },
  snek: { name: '小蛇', rarity: 4, icon: '蛇', color: 0x4ad95a, desc: '命中时叠加剧毒，5% 几率引爆' },
  speedboi: { name: '速度小子', rarity: 4, icon: '飞', color: 0x5ad9ff, desc: '生命低于 50% 时伤害翻倍' },
  bigbonk: { name: '大棒槌', rarity: 3, icon: '棒', color: 0xc8863a, desc: '命中时 2% 几率 BONK！造成 20 倍伤害并把敌人打飞' },
  zawarudo: { name: '时间停止', rarity: 4, icon: '时', color: 0xffe14a, desc: '受到致命伤害时停止时间并免于死亡（一次）' }
};

// ---------------- 角色 ----------------
// fall：摔落伤害倍率（0 不受摔落伤害，0.5 减半，1.25 重甲多 25%；不写就是 1）
var CHARACTERS = {
  fox: { name: '狐狸法骑士', title: '运气好得离谱的狐狸法师', model: 'fox', weapon: 'firestaff', icon: '狐', color: 0xe8803a,
    passive: '天赐好运：每升一级 +2% 幸运', stats: { luck: 0.15, moveSpeed: 0.04, jump: 0.15 }, perLevel: { luck: 0.02 } },
  oofie: { name: '铁罐爵士', title: '全身重甲的老派骑士', model: 'knight', weapon: 'sword', icon: '骑', color: 0xc8d2e0, fall: 1.25,
    passive: '加固：每升一级 +1% 护甲', stats: { maxHp: 50, armor: 0.13, moveSpeed: -0.02 }, perLevel: { armor: 0.012 } },
  calcium: { name: '骸骨骑士', title: '越跑越快的骷髅骑士', model: 'skeleton', weapon: 'bone', icon: '骨', color: 0xf3ead0,
    passive: '亡者疾驰：一直移动就越来越快，踩着棺材板时加速翻倍；受伤损失 30% 加速；伤害随速度提升', stats: { moveSpeed: 0.15, jump: 0.2 } },
  chad: { name: '胸甲猛男', title: '胸甲比头大', model: 'chad', weapon: 'aura', icon: '猛', color: 0xe8a878,
    passive: '秀肌肉：定期摆姿势，挡住伤害、震晕身边敌人，并永久 +2.5% 伤害', stats: { maxHp: 20, moveSpeed: -0.05, jump: 0.15 } },
  ogre: { name: '食人魔骑士', title: '绿皮大块头', model: 'ogre', weapon: 'axe', icon: '魔', color: 0x6a9a3a, fall: 1.25,
    passive: '战士：每升一级 +1.5% 伤害', stats: { maxHp: 40, armor: 0.06, moveSpeed: -0.06, damage: 0.1, jump: 0.05 }, perLevel: { damage: 0.015 } },
  clank: { name: '发条骑士', title: '上了发条的铜骑士', model: 'robot', weapon: 'revolver', icon: '铜', color: 0xd9a64a,
    passive: '暴击常有：每升一级 +1% 暴击率', stats: { maxHp: -60, shield: 50, moveSpeed: 0.07, jump: 0.3 }, perLevel: { critChance: 0.01 } },
  athena: { name: '盾卫女骑士', title: '金盔红羽', model: 'athena', weapon: 'aegis', icon: '盾', color: 0xd9c05a,
    passive: '绝境：生命越低伤害越高；每升一级 +2 荆棘', stats: { maxHp: 25 }, perLevel: { thorns: 2 } },
  robin: { name: '游侠骑士', title: '爱钱的弓箭手', model: 'archer', weapon: 'bow', icon: '弓', color: 0x3a7a3a,
    passive: '炒股：每升一级 +1% 金币获取；每持有 1000 金币 +10% 伤害', stats: { moveSpeed: 0.075, jump: 0.3 }, perLevel: { goldGain: 0.01 } },
  monke: { name: '猴子侍从', title: '顶着铁锅当头盔的猴子', model: 'monkey', weapon: 'banana', icon: '猴', color: 0x8a5a3a, fall: 0.5,
    passive: '猴爪：可以爬墙；每升一级 +2 最大生命', stats: { maxHp: 35, damage: 0.15 }, perLevel: { maxHp: 2 } },
  tony: { name: '闪电骑士', title: '跑得飞快的蓝甲骑士', model: 'tony', weapon: 'dagger', icon: '电', color: 0x3a6ad9, fall: 0.5,
    passive: '放电：移动会积蓄电能，充满后对周围放电；踩着雷光板时积蓄翻倍', stats: { maxHp: -30, shield: 10, moveSpeed: 0.3, jump: 0.3 } },
  bush: { name: '灌木骑士', title: '伪装成灌木的弩手', model: 'bush', weapon: 'sniper', icon: '灌', color: 0x3a8a2a,
    passive: '靶心：随机标记敌人，被标记的敌人受到双倍伤害；每升一级 +1% 暴击伤害', perLevel: { critDmg: 0.01 } },
  spaceman: { name: '星界骑士', title: '来自星空的骑士', model: 'spaceman', weapon: 'blackhole', icon: '星', color: 0x2a2a6a, fall: 0,
    passive: '量子经验论：每升一级 +1.5% 经验获取', stats: { maxHp: 10, xpGain: 0.05 }, perLevel: { xpGain: 0.015 } },
  bandit: { name: '强盗骑士', title: '蒙面劫匪', model: 'bandit', weapon: 'dexe', icon: '盗', color: 0x5a3a2a,
    passive: '心流：每升一级 +1% 攻击速度', stats: { moveSpeed: 0.05, jump: 0.2 }, perLevel: { atkSpeed: 0.01 } },
  ninja: { name: '影骑士', title: '黑甲刺客', model: 'ninja', weapon: 'katana', icon: '影', color: 0x3a3a48, fall: 0.5,
    passive: '影步：闪避敌人时直接处决它；滑铲时闪避大幅提高；每升一级 +0.5% 闪避', stats: { moveSpeed: 0.15, jump: 0.2 }, perLevel: { evasion: 0.006 } },
  vlad: { name: '血骑士', title: '看起来很坏的好人', model: 'vlad', weapon: 'bloodmagic', icon: '血', color: 0x7a1a2a,
    passive: '吸血鬼：每升一级 +1% 吸血', stats: { lifesteal: 0.05, moveSpeed: 0.04, jump: 0.2 }, perLevel: { lifesteal: 0.01 } },
  noelle: { name: '冰霜女骑士', title: '冰晶王冠', model: 'noelle', weapon: 'frost', icon: '冰', color: 0x9fd8ff,
    passive: '坚韧：每升一级 +1% 范围；每个被冻住的敌人 +1% 伤害', stats: { moveSpeed: 0.075, jump: 0.3 }, perLevel: { size: 0.01 } },
  amog: { name: '瘟疫医生', title: '鸟嘴面具的炼金骑士', model: 'amog', weapon: 'poison', icon: '疫', color: 0x2a2a2a,
    passive: '瘟疫：中毒的敌人死亡时爆炸，让周围敌人中毒', stats: { maxHp: 30, pickup: 1 } },
  dicehead: { name: '骰子骑士', title: '赌徒', model: 'dicehead', weapon: 'dice', icon: '骰', color: 0xffffff,
    passive: '赌一把：每次升级随机提升一项属性', stats: { critChance: 0.05 } },
  chadwell: { name: '黑骑士', title: '被诅咒的黑甲骑士', model: 'darkknight', weapon: 'corrupted', icon: '黑', color: 0x3a2a4a, fall: 1.25,
    passive: '诅咒：每升一级 +1% 难度', stats: { maxHp: 50, armor: 0.2, moveSpeed: -0.03, difficulty: 0.1 }, perLevel: { difficulty: 0.01 } },
  birdo: { name: '鹰骑士', title: '会飘的狮鹫骑士', model: 'bird', weapon: 'tornado', icon: '鹰', color: 0x5ab0ff, fall: 0,
    passive: '漂浮：空中按住跳跃滑翔，按住滑铲俯冲；每升一级 +1% 空中伤害', stats: { moveSpeed: 0.05, jump: 0.2, extraJumps: 1, maxHp: -15 } },
  roberto: { name: '幽灵骑士', title: '囤积癖幽灵', model: 'ghost', weapon: 'scythe', icon: '幽', color: 0xd8e8ff, fall: 0,
    passive: '囤积者：每 60 秒在身边生成一个免费宝箱（等级越高间隔越长）', stats: { moveSpeed: 0.04, jump: 0.2 } }
};

// ---------------- 敌人 ----------------
// 数值来自社区整理：hp / dmg / speed（速度按玩家 10 的跑速换算）
var ENEMY_DMG = 0.55;   // 接触伤害整体系数（没有局外成长，稍微手下留情）
var ENEMIES = {};

// ---------------- 关卡 ----------------
var STAGES = [];
