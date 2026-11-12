'use strict';
// ============================================================
//  游戏内容：属性、纹章、武器、宝物、骑士
//  数值为本作自己设计，按平衡机器人调整
// ============================================================

// 稀有度：普通(白) 优秀(绿) 稀有(蓝) 史诗(紫) 传说(橙)；升级数值按倍率放大
var RARITY_MULT = [1, 1.25, 1.5, 1.85, 2.3];
var CARD_WEIGHTS = [68, 20, 8, 3, 1];      // 升级卡的基础权重（幸运再往高档推）
var RELIC_WEIGHTS = [55, 25, 13, 5, 2];    // 宝物（宝箱、商人）的基础权重
var LEVEL_CAP = { weapon: 20, crest: 10 }; // 武器最高 Lv20、纹章最高 Lv10

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
  eliteDmg: { name: '对精英和首领伤害', base: 0, pct: true },
  slide: { name: '滑行', base: 0, pct: true },          // P.slideK 读（最多 +40%）
  heal: { name: '治疗效果', base: 0, pct: true },       // P.heal 和生命回复读
  chestDisc: { name: '宝箱折扣', base: 0, pct: true },  // Interact.chestCost 读（最多 50%）
  weaponSlots: { name: '武器栏位', base: 4 },
  tomeSlots: { name: '纹章栏位', base: 4 }
};

// ---------------- 纹章 ----------------
// 代码里还叫 TOMES / tome。val 为普通稀有度每级的数值（加法叠加）
// 每一级两行属性都加：stat += val × 稀有度倍率，stat2 += val2 × 稀有度倍率；family 见 CREST_FAMILIES
// 第 13 块（D-C13-2）：第二行 val2 都 × 0.75（取到 0.5 % / 整数生命、护盾），纹章预算从发布版的 1.37 倍降到 1.30 倍以内
var TOMES = {
  lion: { name: '雄狮纹章', stat: 'damage', val: 0.1, stat2: 'knockback', val2: 0.075, family: 'beast', icon: '狮', color: 0xd9433b, desc: '伤害 +10%，击退 +7.5%' },
  direwolf: { name: '狼群纹章', stat: 'atkSpeed', val: 0.08, stat2: 'moveSpeed', val2: 0.02, family: 'beast', icon: '狼', color: 0x8a9ab0, desc: '攻击速度 +8%，移动速度 +2%' },
  grizzly: { name: '巨熊纹章', stat: 'maxHp', val: 30, stat2: 'armor', val2: 0.03, family: 'beast', icon: '熊', color: 0x8a5a30, desc: '最大生命 +30，护甲 +4%（面板上的百分比，按你现在的护甲现算）' },
  hawk: { name: '猎隼纹章', stat: 'critChance', val: 0.08, stat2: 'projSpeed', val2: 0.075, family: 'bird', icon: '隼', color: 0xd9a64a, desc: '暴击率 +8%，弹道速度 +7.5%' },
  raven: { name: '渡鸦纹章', stat: 'critDmg', val: 0.2, stat2: 'eliteDmg', val2: 0.045, family: 'bird', icon: '鸦', color: 0x5a4a7a, desc: '暴击伤害 +20%，对精英、小 Boss 和首领的伤害 +4.5%' },
  owl: { name: '夜枭纹章', stat: 'xpGain', val: 0.1, stat2: 'pickup', val2: 0.19, family: 'bird', icon: '枭', color: 0x4a6ab0, desc: '经验获取 +10%，拾取范围 +19%' },
  lily: { name: '百合纹章', stat: 'regen', val: 50, stat2: 'heal', val2: 0.045, family: 'plant', icon: '百', color: 0xf0d060, desc: '生命回复 +50/分钟，治疗效果 +4.5%' },
  oak: { name: '橡树纹章', stat: 'duration', val: 0.2, stat2: 'maxHp', val2: 8, family: 'plant', icon: '橡', color: 0x4a8a3a, desc: '持续时间 +20%，最大生命 +8' },
  sunflower: { name: '向日葵纹章', stat: 'size', val: 0.12, stat2: 'pickup', val2: 0.075, family: 'plant', icon: '葵', color: 0xffc030, desc: '范围 +12%，拾取范围 +7.5%' },
  tower: { name: '城塔纹章', stat: 'armor', val: 0.15, stat2: 'shield', val2: 8, family: 'object', icon: '塔', color: 0x9aa3ad, desc: '护甲 +17%（面板上的百分比，按你现在的护甲现算），护盾 +8' },
  goldkey: { name: '金钥纹章', stat: 'goldGain', val: 0.15, stat2: 'chestDisc', val2: 0.03, family: 'object', icon: '钥', color: 0xf0c03a, desc: '金币获取 +15%，宝箱价格 −3%' },
  wheel: { name: '车轮纹章', stat: 'quantity', val: 0.5, stat2: 'projSpeed', val2: 0.045, family: 'object', icon: '轮', color: 0xb08a5a, desc: '弹丸数量 +0.5（攒满 1 就多一发），弹道速度 +4.5%' },
  gale: { name: '疾风纹章', stat: 'moveSpeed', val: 0.05, stat2: 'slide', val2: 0.06, family: 'sky', icon: '风', color: 0x7ad9c8, desc: '移动速度 +5%，滑行 +6%（滑铲和空中能达到的速度更高）' },
  starry: { name: '星辰纹章', stat: 'luck', val: 0.1, stat2: 'jump', val2: 0.075, family: 'sky', icon: '辰', color: 0xc0c8ff, desc: '幸运 +10%，跳跃高度 +7.5%' },
  crescent: { name: '新月纹章', stat: 'evasion', val: 0.12, stat2: 'shield', val2: 11, family: 'sky', icon: '月', color: 0xa8c8ff, desc: '闪避 +11%（面板上的百分比，按你现在的闪避现算），护盾 +11' }
};

// 纹章家族（同家族三枚凑齐 = 套装）；color 只给图标底色用（第 11 块），界面上不当文字颜色（UI_STYLE 规则 7）
var CREST_FAMILIES = {
  beast: { name: '猛兽', motto: '力量', weapons: '近战武器', color: 0xd9433b },
  bird: { name: '飞禽', motto: '锐利', weapons: '飞出去的武器', color: 0x4a8ad9 },
  plant: { name: '花木', motto: '生长', weapons: '草木和陷阱', color: 0x4ab04a },
  object: { name: '器物', motto: '匠心', weapons: '器械和烟火', color: 0xb08a5a },
  sky: { name: '天象', motto: '天命', weapons: '天上来的东西', color: 0x8a6ad9 }
};
// 套装：members 三枚都在纹章栏里就生效（P.recalc 里加，和纹章一样是加法）；short 是提示用的短句
var CREST_SETS = [
  { family: 'beast', name: '百兽之王', members: ['lion', 'direwolf', 'grizzly'], stats: { damage: 0.1 }, short: '伤害 +10%' },
  { family: 'bird', name: '鹰扬', members: ['hawk', 'raven', 'owl'], stats: { critDmg: 0.25 }, short: '暴击伤害 +25%' },
  { family: 'plant', name: '繁花', members: ['lily', 'oak', 'sunflower'], stats: { regen: 60 }, short: '生命回复 +60/分钟' },
  { family: 'object', name: '匠心', members: ['tower', 'goldkey', 'wheel'], stats: {}, minWeaponRarity: 1, short: '武器卡至少优秀' },
  { family: 'sky', name: '天命', members: ['gale', 'starry', 'crescent'], stats: { luck: 0.15 }, short: '幸运 +15%' }
];

// 许愿井的随机祝福用（普通稀有度数值；许愿井第 7 块再改）
var CHAOS_POOL = [['damage', 0.06], ['atkSpeed', 0.06], ['critChance', 0.05], ['maxHp', 20], ['size', 0.08], ['moveSpeed', 0.08], ['luck', 0.05], ['xpGain', 0.06], ['armor', 0.08], ['regen', 30], ['quantity', 0.5], ['projSpeed', 0.1]];

// ---------------- 武器 ----------------
// base：基础数值；升级 = 锻造路线：grow 每次升级都给；稀有起加 1 条副词条（up 里随机一条）；
// 传说再加专属词条 perk（不乘稀有度，最多 max 次，拿满以后换成另一条副词条）；grow 和 up 乘稀有度倍率
// size / pspd / duration 是倍率（1 = 100%），cd 为冷却秒数（受攻击速度影响）
// arc / range / speed / proj… 是处理器读的参数（计划 §4.1）
var WEAPONS = {
  knightsword: { name: '骑士剑', icon: '剑', color: 0xe8eef6, type: 'melee', arc: 2.3, range: 4.4, desc: '朝面前挥出一道宽宽的弧形斩击',
    base: { damage: 13, cd: 0.85, count: 1, size: 1, knockback: 1.6 }, grow: { damage: 2.2 }, up: { size: 0.12, knockback: 0.35 }, perk: { count: 1, max: 2 } },
  lance: { name: '骑枪', icon: '枪', color: 0xf0e0d0, type: 'melee', arc: 0.65, range: 6.6, thrust: true, ram: { minSpeed: 11, div: 16, arc: 1.1, range: 3, cd: 0.45, maxMult: 3 }, desc: '朝最近的敌人往前猛刺；骑着坐骑滑得够快时，枪尖撞到谁就扎谁，越快越疼',
    base: { damage: 17, cd: 1.05, count: 1, size: 1, knockback: 2.4 }, grow: { damage: 3 }, up: { size: 0.1, knockback: 0.5 }, perk: { count: 1, max: 2 } },
  forgehammer: { name: '锻锤', icon: '锤', color: 0xff9a3a, type: 'melee', arc: 1.5, range: 3.8, stunHit: 0.25, stunT: 0.5, slamFx: true, burn: { t: 1, frac: 0.25 }, desc: '抡起烧红的铁锤往前砸：震飞、点燃敌人，有几率把它们砸晕',
    base: { damage: 21, cd: 1.3, count: 1, size: 1, knockback: 3.2 }, grow: { damage: 3.6 }, up: { knockback: 0.6, size: 0.12 }, perk: { count: 1, max: 2 } },
  falcon: { name: '猎隼', icon: '隼', color: 0x8a6a40, type: 'boomerang', proj: 'falcon', homing: 5, speed: 22, projR: 0.7, out: 16, desc: '放出猎隼扑向敌人，一路追着啄，再飞回你的手臂',
    base: { damage: 10.5, cd: 1.2, count: 1, size: 1, pspd: 1, knockback: 1.1 }, grow: { damage: 1.8 }, up: { pspd: 0.12, size: 0.12 }, perk: { count: 1, max: 3 } },
  paintbucket: { name: '颜料桶', icon: '彩', color: 0xd85a8a, type: 'puddle', range: 2.7, look: 'paint', slow: 0.3, lob: 'bucket', desc: '泼出一桶颜料，落地变成一片彩色颜料地：敌人踩进去会受伤、变慢',
    base: { damage: 3.2, cd: 1.15, count: 1, size: 1, pspd: 1, duration: 3.2 }, grow: { damage: 0.6 }, up: { duration: 0.4, size: 0.12 }, perk: { count: 1, max: 2 } },
  claws: { name: '猫爪', icon: '爪', color: 0xffb0c0, type: 'melee', arc: 1.3, range: 3, look: 'claw', desc: '唰唰两爪，挠得又快又狠，容易暴击',
    base: { damage: 7, cd: 0.48, count: 2, size: 1, critChance: 0.08, knockback: 0.6 }, grow: { damage: 1.2 }, up: { critChance: 0.04, critDmg: 0.15 }, perk: { count: 1, max: 1 } },
  beehive: { name: '蜂箱', icon: '蜂', color: 0xffd040, type: 'shot', proj: 'bee', homing: 8, speed: 17, projR: 0.35, life: 2.2, slow: { k: 0.25, t: 2 }, desc: '放出一群会追人的蜜蜂，蛰中的敌人会变慢',
    base: { damage: 4.5, cd: 0.7, count: 3, size: 1, pspd: 1, knockback: 0.2 }, grow: { damage: 0.8 }, up: { pspd: 0.12, critChance: 0.04 }, perk: { count: 1, max: 3 } },
  astrolabe: { name: '星盘', icon: '盘', color: 0xd9a64a, type: 'shot', proj: 'star', fromSky: true, explode: true, blast: 2.2, speed: 26, projR: 0.45, life: 2, desc: '拨动星盘，星星从天上砸向敌人，落地炸开',
    base: { damage: 11, cd: 1.2, count: 2, size: 1, pspd: 1, knockback: 1.2 }, grow: { damage: 2 }, up: { size: 0.12, critChance: 0.05 }, perk: { count: 1, max: 3 } },
  trickknives: { name: '魔术飞刀', icon: '刀', color: 0xe0e4ec, type: 'shotgun', proj: 'knife', aimed: false, fan: 5, spread: 0.14, speed: 36, projR: 0.35, life: 0.55, desc: '朝最近的敌人扇形甩出一把飞刀（自动瞄准）',
    base: { damage: 7, cd: 0.7, count: 1, size: 1, critChance: 0.06, knockback: 0.8 }, grow: { damage: 1.2 }, up: { critChance: 0.05, critDmg: 0.2 }, perk: { pierce: 1, max: 2 } },
  pigeons: { name: '信鸽', icon: '鸽', color: 0xf4f4f8, type: 'chain', chainLook: 'pigeon', noSplash: true, desc: '信鸽挨家挨户「送信」，从一个敌人飞到下一个',
    base: { damage: 7.5, cd: 1.05, count: 1, size: 1, bounces: 2, knockback: 0.5 }, grow: { damage: 1.4 }, up: { bounces: 1, size: 0.12 }, perk: { count: 1, max: 2 } },
  trebuchet: { name: '投石车', icon: '石', color: 0x9a8a70, type: 'bounce', proj: 'rock', explode: true, blast: 2.8, speed: 14, projR: 0.6, life: 3, desc: '抛出大石头，落地砸出一片冲击',
    base: { damage: 16, cd: 1.4, count: 1, size: 1, pspd: 1, knockback: 2.5 }, grow: { damage: 2.8 }, up: { size: 0.12, knockback: 0.4 }, perk: { count: 1, max: 3 } },
  hymn: { name: '圣咏', icon: '咏', color: 0xffe8a8, type: 'aura', range: 3.4, auraColor: 0xffe8a8, motes: 'notes', desc: '身边一圈歌声，一直伤害靠近的敌人',
    base: { damage: 4.5, cd: 0.5, size: 1, knockback: 0.4 }, grow: { damage: 0.9 }, up: { size: 0.1, knockback: 0.2 }, perk: { size: 0.2, max: 2 } },
  toyguard: { name: '锡兵卫队', icon: '兵', color: 0xd83a3a, type: 'orbit', proj: 'tinman', range: 3.2, desc: '小锡兵端着刺刀，绕着你转圈巡逻',
    base: { damage: 11.5, cd: 0.55, count: 2, size: 1, pspd: 1.2, knockback: 1.6 }, grow: { damage: 2 }, up: { pspd: 0.15, knockback: 0.3 }, perk: { count: 1, max: 3 } },
  roar: { name: '熊吼', icon: '吼', color: 0xc87a3a, type: 'melee', arc: 1.6, range: 6, look: 'roar', stunHit: 0.2, stunT: 0.6, desc: '朝前方大吼一声，把一片敌人震飞，有几率吓得它们发懵',
    base: { damage: 16, cd: 1.6, count: 1, size: 1, knockback: 4 }, grow: { damage: 2.8 }, up: { size: 0.12, knockback: 0.6 }, perk: { count: 1, max: 2 } },
  lanternbeam: { name: '提灯', icon: '灯', color: 0xffd060, type: 'flame', range: 11, beam: true, beamW: 0.15, spin: 1.2, tick: 0.08, burn: { t: 1, frac: 0.2 }, desc: '提灯射出一道细细的强光，慢慢扫过去，照到的敌人被灼伤',
    base: { damage: 6, cd: 1.6, size: 1, duration: 1.6, knockback: 0.3 }, grow: { damage: 1.5 }, up: { duration: 0.2, size: 0.12 }, perk: { duration: 0.4, max: 2 } },
  gravecandle: { name: '墓烛', icon: '烛', color: 0xd8f0d0, type: 'mine', zoneModel: 'candle', blast: 2.6, trigR: 1.6, burn: { t: 1.5, frac: 0.3 }, desc: '在身边立起白蜡烛，敌人一靠近，烛火就炸开并烧着它们',
    base: { damage: 13, cd: 1.1, count: 1, size: 1, duration: 4.5, knockback: 1 }, grow: { damage: 2.3 }, up: { duration: 0.5, size: 0.12 }, perk: { count: 1, max: 3 } },
  thornvine: { name: '荆棘藤', icon: '藤', color: 0x4a7a3a, type: 'trail', range: 1.5, trailLook: 'bramble', slow: [0.3, 1], desc: '走过的地方长出带刺的藤蔓，扎伤并缠住敌人（变慢）',
    base: { damage: 4.2, cd: 0.3, count: 1, size: 1, duration: 1.8 }, grow: { damage: 0.8 }, up: { duration: 0.2, size: 0.1 }, perk: { size: 0.2, max: 2 } },
  fryingpan: { name: '平底锅', icon: '锅', color: 0x2a2a30, type: 'axe', proj: 'pan', speed: 15, projR: 1.1, tick: 0.22, desc: '扔出旋转的平底锅，悬在敌人头上铛铛乱敲',
    base: { damage: 10.5, cd: 1.7, count: 1, size: 1, pspd: 1, duration: 1, knockback: 1.8 }, grow: { damage: 1.9 }, up: { duration: 0.1, knockback: 0.4 }, perk: { count: 1, max: 2 } },
  rod: { name: '钓竿', icon: '竿', color: 0xc8a060, type: 'tether', reel: true, range: 15, pull: 7, landR: 2.2, landK: 3, splashR: 3, desc: '甩出鱼钩钩住一个敌人，把它一路拽到你面前，再狠狠摔上岸',
    base: { damage: 7, cd: 1.6, size: 1, duration: 2.2, knockback: 0 }, grow: { damage: 1.2 }, up: { size: 0.1, duration: 0.2 }, perk: { size: 0.25, max: 2 } },
  bronzebell: { name: '铜钟', icon: '钟', color: 0xc8963a, type: 'ring', range: 5.5, waveTime: 0.45, band: 1, ringGap: 0.3, extraMult: 0.6, desc: '敲响铜钟，一圈钟声往外扩散，扫到的敌人都被震开',
    base: { damage: 14, cd: 1.35, count: 1, size: 1, knockback: 2.2 }, grow: { damage: 2.4 }, up: { size: 0.1, knockback: 0.4 }, perk: { count: 1, max: 2 } },
  juggle: { name: '杂耍球', icon: '球', color: 0xe85a4a, type: 'bounce', proj: 'jball', spin: 12, speed: 19, projR: 0.55, life: 2.6, desc: '抛出彩色杂耍球，在敌人之间弹来弹去',
    base: { damage: 8, cd: 0.75, count: 1, size: 1, pspd: 1, bounces: 3, knockback: 1 }, grow: { damage: 1.4 }, up: { bounces: 1, pspd: 0.12 }, perk: { count: 1, max: 3 } },
  kite: { name: '风筝', icon: '筝', color: 0x6ab0ff, type: 'orbit', proj: 'kite', range: 6.5, hitR: 1.2, desc: '放一只大风筝绕着你飞一大圈，撞到的敌人都会受伤',
    base: { damage: 10.5, cd: 0.6, count: 1, size: 1, pspd: 0.6, knockback: 1.6 }, grow: { damage: 1.9 }, up: { pspd: 0.1, size: 0.12 }, perk: { count: 1, max: 2 } },
  javelin: { name: '投枪', icon: '投', color: 0xb0a080, type: 'shot', proj: 'javelin', speed: 30, projR: 0.5, life: 1, stick: { delay: 0.4, r: 2.2, k: 0.8 }, desc: '扔出标枪，穿透敌人后插在地上，过一会儿震开周围的敌人',
    base: { damage: 15, cd: 1.25, count: 1, size: 1, pspd: 1, pierce: 2, knockback: 1.5 }, grow: { damage: 2.6 }, up: { pierce: 1, size: 0.1 }, perk: { count: 1, max: 3 } },
  chessknight: { name: '马走日', icon: '马', color: 0xd8b080, type: 'bounce', proj: 'chesshorse', hop: true, hopR: 1.4, hopMult: 0.5, speed: 14, projR: 0.6, life: 4, desc: '一枚木头象棋「马」，在敌人之间跳「日」字，落地砸一小片',
    base: { damage: 11.5, cd: 1.1, count: 1, size: 1, pspd: 1, bounces: 3, knockback: 1.4 }, grow: { damage: 2 }, up: { bounces: 1, size: 0.12 }, perk: { count: 1, max: 2 } },
  beartrap: { name: '捕兽夹', icon: '夹', color: 0x8a8e96, type: 'mine', zoneModel: 'trap', blast: 2.4, trigR: 1.4, root: 1.2, desc: '在身边放下捕兽夹，敌人踩上去会被夹住',
    base: { damage: 18, cd: 1.2, count: 1, size: 1, duration: 5, knockback: 0.5 }, grow: { damage: 3.2 }, up: { duration: 0.6, size: 0.1 }, perk: { count: 1, max: 3 } },
  thunderdrum: { name: '雷鼓', icon: '鼓', color: 0xa0d0ff, type: 'chain', chainLook: 'drum', desc: '敲一下鼓，雷声在敌人之间跳',
    base: { damage: 8, cd: 1.2, count: 1, size: 1, bounces: 1, knockback: 0.8 }, grow: { damage: 1.4 }, up: { bounces: 1, size: 0.15 }, perk: { count: 1, max: 2 } },
  firecracker: { name: '鞭炮', icon: '炮', color: 0xe83a3a, type: 'puddle', range: 2.6, look: 'crackle', burn: { t: 1, frac: 0.2 }, lob: 'crackers', desc: '扔出一挂鞭炮，落地噼里啪啦炸一片',
    base: { damage: 3.4, cd: 1.25, count: 1, size: 1, pspd: 1, duration: 2.4 }, grow: { damage: 0.6 }, up: { duration: 0.25, size: 0.12 }, perk: { count: 1, max: 2 } },
  icicle: { name: '冰棱', icon: '棱', color: 0xa8e0ff, type: 'shot', proj: 'icicle', speed: 30, projR: 0.45, life: 1.3, chill: { slow: 0.35, t: 1.5, freeze: 0.8 }, desc: '射出冰棱，穿透敌人并让它变慢；变慢的敌人再中一次就冻住',
    base: { damage: 10, cd: 0.9, count: 1, size: 1, pspd: 1, pierce: 2, knockback: 0.6 }, grow: { damage: 1.6 }, up: { pierce: 1, pspd: 0.12 }, perk: { count: 1, max: 3 } },
  slingshot: { name: '弹弓', icon: '弓', color: 0xa08060, type: 'shot', proj: 'pebble', speed: 34, projR: 0.3, life: 1.2, splitHit: { n: 2, mult: 0.4 }, desc: '弹出一颗石子（自动瞄准），打中后碎成两块继续飞',
    base: { damage: 8, cd: 1, count: 1, size: 1, pspd: 1, knockback: 2.4 }, grow: { damage: 1.4 }, up: { knockback: 0.4, pspd: 0.15 }, perk: { count: 1, max: 3 } },
  skyrocket: { name: '窜天猴', icon: '窜', color: 0xff6040, type: 'shot', proj: 'skyrocket', homing: 5, explode: true, blast: 2.3, speed: 17, projR: 0.45, life: 2.6, wobble: 0.6, desc: '嗖地窜出去、追着敌人炸开的烟花',
    base: { damage: 12, cd: 1, count: 1, size: 1, pspd: 1, critChance: 0.04, knockback: 1 }, grow: { damage: 2 }, up: { size: 0.12, critChance: 0.04 }, perk: { count: 1, max: 3 } }
};

// ---------------- 宝物 ----------------
// 稀有度 0~4 五档都用；stats 直接生效，其余效果在 relics*.js；card 是卡上的一句话（{x} 换成当前值，没有冒号），desc 是完整说明（图鉴）
var ITEMS = {
  whetstone: { name: '磨刀石', rarity: 0, icon: '磨', color: 0x9aa3ad, desc: '拿到之后，武器每升 1 级，这把武器的伤害再多 3%', card: '之后每次武器升级，伤害再 +{p}%' },
  kneepads: { name: '护膝', rarity: 0, icon: '膝', color: 0x8a6a4a, desc: '滑铲时撞到的敌人受到一次伤害并被推开（每个敌人 0.5 秒最多一次）', card: '滑铲撞到敌人造成 {dmg} 伤害并推开' },
  spyglass: { name: '望远镜', rarity: 0, icon: '望', color: 0xd9a64a, desc: '拾取范围 +25%；小地图上标出最近的还没打开的宝箱（再远也在小地图边上指出方向）', card: '拾取范围 +{p}%；小地图标出最近的宝箱', stats: { pickup: 0.25 } },
  tinderbox: { name: '火绒盒', rarity: 0, icon: '绒', color: 0xff8a3a, desc: '每命中 12 次，下一次命中会点燃目标 3 秒', card: '每命中 {n} 次，下一击点燃敌人 3 秒' },
  bugle: { name: '铜号角', rarity: 0, icon: '号', color: 0xd9a64a, desc: '每次升级吹响号角：震伤并击退 8 米内的敌人', card: '每次升级吹号，震退 8 米内敌人，{dmg} 伤害' },
  holymedal: { name: '圣徽', rarity: 0, icon: '徽', color: 0xe8e8f0, desc: '对亡灵（骷髅、木乃伊、僵尸、游魂、灵质……）的伤害 +20%', card: '对亡灵的伤害 +{p}%' },
  lockpick: { name: '开锁钩', rarity: 0, icon: '锁', color: 0xb0a080, desc: '付费宝箱便宜 12%（多件叠加，宝箱折扣最多 50%）', card: '付费宝箱便宜 {p}%，最多便宜一半', stats: { chestDisc: 0.12 } },
  hardtack: { name: '硬面包', rarity: 0, icon: '饼', color: 0xc8a060, desc: '吃到回血道具时多回复 50%，并获得 6 秒 20 点护盾', card: '吃回血道具多回 {p}%，再得 6 秒 {n} 点护盾' },
  pennant: { name: '三角小旗', rarity: 0, icon: '旗', color: 0xe84a4a, desc: '滑铲坐骑出现的时候（地上滑铲、空中按住滑铲），攻击速度 +12%', card: '骑着滑铲坐骑时，攻击速度 +{p}%' },
  skiwax: { name: '滑雪蜡', rarity: 0, icon: '蜡', color: 0x7ad9ff, desc: '滑铲更顺：摩擦小一些，下坡加速快一些', card: '滑铲摩擦 −{f}%，下坡加速 +{s}%' },
  caltrops: { name: '铁蒺藜袋', rarity: 1, icon: '蒺', color: 0x8a8e96, desc: '滑铲时身后撒铁蒺藜（4 秒）：踩到的敌人受伤，2 秒内移动速度 −40%', card: '滑铲时身后撒铁蒺藜，{dmg} 伤害并减速 40%' },
  stirrup: { name: '银马镫', rarity: 1, icon: '镫', color: 0xd0d8e0, desc: '滑铲坐骑出现的一瞬间，冲开 4 米内的敌人（每 3 秒最多一次）', card: '坐骑出现时冲开 4 米内敌人，{dmg} 伤害' },
  bellcollar: { name: '铃铛项圈', rarity: 1, icon: '铃', color: 0xd83a3a, desc: '对被冻住或被击晕的敌人伤害 +25%', card: '对冻住或击晕的敌人伤害 +{p}%' },
  quiver: { name: '旧箭袋', rarity: 1, icon: '袋', color: 0x8a6a3a, desc: '射击、弹跳、回旋类武器每第 4 次攻击多射 1 发', card: '射击、弹跳、回旋武器，每 {n} 次攻击多射 1 发' },
  veteran: { name: '老兵勋章', rarity: 1, icon: '勋', color: 0xd9a64a, desc: '每打倒一个小 Boss：这一局伤害 +5%，最大生命 +12', card: '每打倒一个小 Boss，伤害 +{p}%、最大生命 +{n}' },
  wishcoin: { name: '许愿铜钱', rarity: 1, icon: '钱', color: 0xc8963a, desc: '许愿井不会再出诅咒；许愿便宜 25%', card: '许愿井不再出诅咒，许愿便宜 {p}%' },
  smithpass: { name: '铁匠的徽牌', rarity: 1, icon: '牌', color: 0x8a6a4a, desc: '铁匠铺便宜 40%，每座多锻造 1 次', card: '铁匠铺便宜 {p}%，每座多锻造 {n} 次' },
  honeyjar: { name: '蜂蜜罐', rarity: 1, icon: '蜜', color: 0xf0a020, desc: '每打开一个宝箱：15 秒内移动速度 +20%、攻击速度 +12%', card: '每开一个宝箱，15 秒内移动速度 +{a}%、攻击速度 +{b}%' },
  cloudboots: { name: '云纹靴', rarity: 1, icon: '靴', color: 0xf0f4ff, desc: '+1 额外跳跃；每次在空中再跳，脚下炸开一圈风（击退）', card: '额外跳跃 +{n}；空中再跳炸开一圈风，{dmg} 伤害', stats: { extraJumps: 1 } },
  lightningrod: { name: '避雷针', rarity: 2, icon: '针', color: 0xa0d0ff, desc: '站在比四周高 3 米以上的地方时，每 0.8 秒朝 12 米内最近的敌人落一道雷', card: '站在高处时，每 0.8 秒落雷，{dmg} 伤害' },
  talisman: { name: '平安符', rarity: 2, icon: '符', color: 0xe83a3a, desc: '受到致命伤害时，平安符替你挡下这一下：生命回到 50%，1 秒无敌（每件一次）', card: '受到致命伤害时挡下、回到一半生命，还剩 {n} 次' },
  crestbrush: { name: '纹章画笔', rarity: 2, icon: '笔', color: 0xd85a8a, desc: '纹章栏位 +1', card: '纹章栏位 +{n}', stats: { tomeSlots: 1 } },
  bladeoil: { name: '刀油', rarity: 2, icon: '油', color: 0xf0c040, desc: '武器暴击后，这把武器 3 秒内攻击速度 +15%', card: '武器暴击后，这把武器 3 秒内攻击速度 +{p}%' },
  duelglove: { name: '决斗手套', rarity: 2, icon: '套', color: 0xf4f4f8, desc: '对精英、小 Boss 和首领每命中 15 次，下一次造成 3 倍伤害（飘字「破绽！」）', card: '对精英和首领每打 {n} 下，下一下 3 倍伤害' },
  ravenfeather: { name: '渡鸦羽毛', rarity: 2, icon: '羽', color: 0x5a4a7a, desc: '每捡 25 颗经验水晶，放出一只渡鸦扑向最近的敌人', card: '每捡 25 颗经验水晶放出一只渡鸦，{dmg} 伤害' },
  warmap: { name: '行军图', rarity: 2, icon: '图', color: 0xe8dcb8, desc: '每关开始时，小地图上直接标出圣锻炉和烽火台', card: '每关一开始，小地图上标出圣锻炉和烽火台' },
  manual: { name: '骑士手册', rarity: 2, icon: '册', color: 0xd83a3a, desc: '升级时多一张卡可选（四选一）', card: '升级时多一张卡，四选一' },
  familycrest: { name: '家族徽章', rarity: 3, icon: '家', color: 0xd9433b, desc: '每有一枚 5 级以上的纹章：伤害 +6%，最大生命 +10', card: '每枚 5 级以上的纹章，伤害 +{p}%、最大生命 +{n}' },
  forgeplan: { name: '锻造图纸', rarity: 3, icon: '纸', color: 0x4a8ad9, desc: '武器升级卡的稀有度至少是「稀有」', card: '武器升级卡至少是稀有' },
  hound: { name: '猎犬哨', rarity: 3, icon: '犬', color: 0x8a6a40, desc: '一只猎犬跟着你，每 1.5 秒扑向 10 米内最近的敌人', card: '{dogs}跟着你，每 1.5 秒扑咬敌人，{dmg} 伤害' },
  twinbelt: { name: '双剑腰带', rarity: 3, icon: '带', color: 0x6a4a2a, desc: '武器栏位 +1，但所有伤害 −5%', card: '武器栏位 +{n}，所有伤害 −{p}%', stats: { weaponSlots: 1, damage: -0.05 } },
  ruler: { name: '教官的戒尺', rarity: 3, icon: '尺', color: 0xc8a060, desc: '暴击时 15% 几率让敌人「罚站」：定住 2 秒，这段时间受到的伤害 +25%（首领只定住 0.5 秒）', card: '暴击时 {p}% 几率罚站 2 秒，其间敌人受伤 +25%' },
  holygrail: { name: '圣杯', rarity: 4, icon: '杯', color: 0xfff0c0, desc: '每次升级回复 30% 生命，并在 10 秒内伤害 +25%', card: '每次升级回复 {p}% 生命，10 秒内伤害 +{q}%' },
  stoneblade: { name: '石中剑', rarity: 4, icon: '石', color: 0xc0c8d0, desc: '开局武器的伤害 ×1.5；所有武器 Lv6 就能觉醒超武', card: '开局武器伤害 ×{x}；所有武器 Lv6 就能觉醒' },
  scabbard: { name: '圣剑鞘', rarity: 4, icon: '鞘', color: 0xffd040, desc: '生命回复 +40/分钟；一下受到的伤害超过最大生命 20% 的那部分减半', card: '生命回复 +{n}/分钟；单次受伤超过 20% 生命的部分减半', stats: { regen: 40 } },
  wardrum: { name: '龙吼战鼓', rarity: 4, icon: '鼓', color: 0xd83a3a, desc: '每 45 秒擂响战鼓：全场首领和小 Boss 以外的敌人（精英也算）被震住 1.5 秒，这段时间你的伤害 +30%', card: '每 {n} 秒擂鼓，定住小怪和精英 1.5 秒，其间伤害 +30%' }
};

// ---------------- 骑士 ----------------
// 顺序就是选骑士界面的顺序；model 是角色模型的 id，和骑士 id 一样（14 位在 models_chars.js，新做的 7 位在 models_knights.js）
// fall：摔落伤害倍率（0 不受摔落伤害，0.5 减半，1.3 重甲多 30%）
// passiveName 被动名、summary 卡片上的一句话（{dmg} {n} {r} 换成当前值，passives.js 的 Passive.cardText；一行里只有被动名后面一个冒号）；
// summaryRun 局内用的那一句（没有就用 summary）；
// passive 旧的一句话（没有 summary 时用）、passiveText 完整说明（第 12 块的图鉴）；效果在 passives*.js
var CHARACTERS = {
  squire: { name: '见习骑士', title: '第一次出远门的小侍从', model: 'squire', weapon: 'knightsword', icon: '侍', color: 0xc8a878, fall: 1,
    passiveName: '勤学苦练', summary: '每升 3 级，最低级的武器免费升 1 级',
    passive: '勤学苦练：每升 3 级，最低级的武器免费升 1 级',
    passiveText: '每升 3 级，等级最低的那把武器免费升 1 级（普通稀有度，按它自己的成长路线）。',
    stats: { maxHp: 10, moveSpeed: 0.03 } },
  bellringer: { name: '敲钟骑士', title: '钟声一响，妖魔退散', model: 'bellringer', weapon: 'bronzebell', icon: '钟', color: 0xc8963a, fall: 1.1,
    passiveName: '晨钟暮鼓', summary: '每 10 秒敲一次钟，3 秒内攻速大增',
    passive: '晨钟暮鼓：每 10 秒敲一次钟，3 秒内攻速大增',
    passiveText: '每 10 秒敲一次钟：之后 3 秒内攻击速度 +40%；身边 6 米内每有 1 个敌人再 +5%（最多再 +30%）。',
    stats: { armor: 0.04, size: 0.08, maxHp: 15 } },
  gravekeeper: { name: '守墓骑士', title: '让亡者好好安息', model: 'gravekeeper', weapon: 'gravecandle', icon: '墓', color: 0x6a6a72, fall: 1,
    passiveName: '安魂', summary: '对亡灵伤害更高；打倒越多敌人越能回血',
    passive: '安魂：对亡灵伤害更高；打倒越多敌人越能回血',
    passiveText: '对亡灵的伤害 +30%。每打倒 25 个敌人（亡灵算 2 个），回复 6% 最大生命。',
    stats: { maxHp: 20, armor: 0.03 } },
  cook: { name: '伙夫骑士', title: '饭点到了', model: 'cook', weapon: 'fryingpan', icon: '伙', color: 0xf4f0e8, fall: 1.1,
    passiveName: '开饭啦', summary: '每 40 秒开饭回血，之后一会儿更强更快',
    passive: '开饭啦：每 40 秒开饭回血，之后一会儿更强更快',
    passiveText: '每 40 秒吃一顿：回复 15% 最大生命；之后 15 秒内伤害 +15%，移动速度 +10%。',
    stats: { maxHp: 40, regen: 6, moveSpeed: -0.05 } },
  courier: { name: '信使骑士', title: '风雪无阻，使命必达', model: 'courier', weapon: 'pigeons', icon: '信', color: 0xc8302a, fall: 0.8,
    passiveName: '急件', summary: '武器栏 +1、纹章栏 −1；定期送急件，得金币和经验',
    passive: '急件：武器栏 +1、纹章栏 −1；定期送急件，得金币和经验',
    passiveText: '武器栏位 +1、纹章栏位 −1（大邮包装武器，盾上少画一枚）。每 45 秒，地图上 40~70 米外出现一个收信点（小地图上的金色信封）；30 秒内跑到那里：获得一笔金币和当前这一级 40% 的经验，并在 10 秒内移动速度 +25%。',
    stats: { moveSpeed: 0.06, maxHp: -10, jump: 0.15, weaponSlots: 1, tomeSlots: -1 } },
  jester: { name: '小丑骑士', title: '国王都被我逗笑了', model: 'jester', weapon: 'juggle', icon: '丑', color: 0xe8c030, fall: 0.7,
    passiveName: '滑稽', summary: '开始滑铲时逗笑身边的小怪（晕 1 秒）',
    passive: '滑稽：开始滑铲时逗笑身边的小怪（晕 1 秒）',
    passiveText: '每次开始滑铲，身边 5 米内的普通敌人笑得停下来：眩晕 1 秒（每个敌人 6 秒最多一次）。每逗笑 1 个敌人，下一颗杂耍球多弹 1 次（最多多弹 5 次）。',
    stats: { moveSpeed: 0.06, jump: 0.15, maxHp: -10 } },
  tinsoldier: { name: '发条锡兵', title: '上紧发条，前进！', model: 'tinsoldier', weapon: 'toyguard', icon: '锡', color: 0xd83a3a, fall: 1,
    passiveName: '上发条', summary: '发条有劲时攻速 +30%；滑铲上发条最快',
    passive: '上发条：发条有劲时攻速 +30%；滑铲上发条最快',
    passiveText: '发条从 100% 开始，每秒消耗 5%。发条有劲时攻击速度 +30%。滑铲时每秒回 35% 发条，站着不动时每秒回 10%。发条用完只是没有加成，不会变慢。',
    stats: { armor: 0.05, maxHp: 10, moveSpeed: -0.02 } },
  astrologer: { name: '占星骑士', title: '今晚的星象对我有利', model: 'astrologer', weapon: 'astrolabe', icon: '星', color: 0x2e3a7a, fall: 0.8,
    passiveName: '星象轮转', summary: '每 40 秒换星座，加伤害、速度、防御或收获',
    passive: '星象轮转：每 40 秒换星座，加伤害、速度、防御或收获',
    passiveText: '每 40 秒换一种星象，按顺序轮：狮子座（伤害 +20%）→ 天马座（移动速度 +20%、跳跃 +20%）→ 巨蟹座（受到的伤害 −15%、生命回复 +40/分钟）→ 天秤座（经验 +20%、金币 +20%）→ 狮子座……',
    stats: { maxHp: 5, duration: 0.08, luck: 0.04 } },
  falconer: { name: '驯鹰骑士', title: '手臂上站着一只猎隼', model: 'falconer', weapon: 'falcon', icon: '鹰', color: 0x8a6a40, fall: 0.9,
    passiveName: '鹰击', summary: '猎隼每 7 秒扑向最强的敌人，{dmg} 伤害并击晕',
    passive: '鹰击：猎隼每 7 秒扑向最强的敌人，把它击晕',
    passiveText: '每 7 秒，猎隼从高处扑向 25 米内生命最多的敌人（精英、小 Boss 优先），造成一次重击并击晕 0.8 秒。骑着大羽毛俯冲落地时，猎隼马上再扑一次（每 2 秒最多一次）。',
    stats: { moveSpeed: 0.05, critChance: 0.03, jump: 0.1 } },
  nun: { name: '圣歌修女', title: '唱首歌，伤口就不疼了', model: 'nun', weapon: 'hymn', icon: '歌', color: 0x3a5a8a, fall: 1,
    passiveName: '越唱越响', summary: '身边敌人越多回血越快，满血时变成护盾',
    passive: '越唱越响：身边敌人越多回血越快，满血时变成护盾',
    passiveText: '每 3 秒，身边 6 米内每有 1 个敌人就回复 1 点生命（每次最多 6 点）；生命满的时候改成 +3 护盾（这层护盾最多 +30）。',
    stats: { maxHp: 15, regen: 10 } },
  smith: { name: '铁匠骑士', title: '火星溅一身', model: 'smith', weapon: 'forgehammer', icon: '铁', color: 0x6a4a2a, fall: 1.15,
    passiveName: '趁热打铁', summary: '武器到 4 的倍数级，升级卡升一档；铁匠铺半价',
    passive: '趁热打铁：武器到 4 的倍数级，升级卡升一档；铁匠铺半价',
    passiveText: '同一把武器每升到第 4、8、12……级，这次升级卡的稀有度提高一档（最高传说）；铁匠铺对你半价。',
    stats: { maxHp: 25, damage: 0.05, moveSpeed: -0.04 } },
  bear: { name: '熊骑士', title: '穿上铠甲的大棕熊', model: 'bear', weapon: 'roar', icon: '熊', color: 0x7a5030, fall: 1.3,
    passiveName: '熊脾气', summary: '挨打攒怒气，满了暴怒 8 秒，更快、更大、更硬',
    passive: '熊脾气：挨打攒怒气，满了暴怒 8 秒，更快、更大、更硬',
    passiveText: '挨打会攒怒气：每失去 1% 最大生命 +4 怒气。怒气满 100 时暴怒 8 秒：攻击速度 +40%，范围 +25%，受到的伤害 −20%。',
    stats: { maxHp: 60, armor: 0.05, moveSpeed: -0.06, size: 0.1 } },
  bannerman: { name: '擎旗骑士', title: '扛着团旗冲在最前', model: 'bannerman', weapon: 'lance', icon: '旗', color: 0x3a6ab8, fall: 1.2,
    passiveName: '军旗不倒', summary: '滑铲停下的地方插军旗，旗下攻速快、受伤少',
    passive: '军旗不倒：滑铲停下的地方插军旗，旗下攻速快、受伤少',
    passiveText: '军旗每 20 秒能插一次：冷却好以后，下一次滑铲停下的地方插下军旗（8 秒内没滑铲，就插在身边）。军旗立 12 秒，半径 7 米：站在旗下攻击速度 +20%，受到的伤害 −15%；旗下的敌人移动速度 −20%。',
    stats: { maxHp: 30, armor: 0.06, moveSpeed: -0.02 } },
  gardener: { name: '园丁骑士', title: '修剪花园，也修剪怪物', model: 'gardener', weapon: 'thornvine', icon: '园', color: 0x4a8a4a, fall: 1,
    passiveName: '春天来了', summary: '走过的地方会开花，站在花旁回血、攻速加快',
    passive: '春天来了：走过的地方会开花，站在花旁回血、攻速加快',
    passiveText: '移动时每 1.5 秒在脚下种一朵花（开 20 秒，最多 12 朵）。站在任意一朵花旁 3 米内：生命回复 +40/分钟，攻击速度 +10%。',
    stats: { regen: 8, moveSpeed: 0.02, pickup: 0.1 } },
  painter: { name: '画盾骑士', title: '盾上的纹章都是我画的', model: 'painter', weapon: 'paintbucket', icon: '画', color: 0xd85a8a, fall: 1,
    passiveName: '描金', summary: '多 1 个纹章栏、少 1 个武器栏；纹章越多伤害越高',
    passive: '描金：多 1 个纹章栏、少 1 个武器栏；纹章越多伤害越高',
    passiveText: '纹章栏位 +1、武器栏位 −1；每拥有 1 枚纹章，伤害 +4%。',
    stats: { maxHp: -5, size: 0.08, luck: 0.03, weaponSlots: -1, tomeSlots: 1 } },
  magician: { name: '魔术骑士', title: '看好了，帽子里什么都没有', model: 'magician', weapon: 'trickknives', icon: '术', color: 0x1a1a22, fall: 1,
    passiveName: '帽子戏法', summary: '每 3 次暴击，蹦出两只兔子，各炸 {dmg} 伤害',
    passive: '帽子戏法：每 3 次暴击，帽子里蹦出两只会炸开的兔子',
    passiveText: '每打出第 3 次暴击，帽子里跳出 2 只兔子，蹦到附近的敌人身上炸开彩带（半径 2 米）。',
    stats: { critChance: 0.06, moveSpeed: 0.03 } },
  beekeeper: { name: '养蜂骑士', title: '嗡嗡嗡，别惹我的蜂', model: 'beekeeper', weapon: 'beehive', icon: '蜂', color: 0xe0b030, fall: 1,
    passiveName: '护卫蜂', summary: '{n} 只护卫蜂蛰靠近的敌人，{dmg} 伤害并减速',
    passive: '护卫蜂：护卫蜂会去蛰靠近你的敌人，让它变慢',
    passiveText: '身边有 3 只护卫蜂（每升 6 级 +1 只，最多 7 只）。敌人走进 3 米内时，一只护卫蜂冲上去蛰它，让它 2 秒内移动速度 −25%；4 秒后飞回来。',
    stats: { maxHp: 15, regen: 6 } },
  catknight: { name: '猫骑士', title: '在城堡厨房抓老鼠立了功', model: 'catknight', weapon: 'claws', icon: '猫', color: 0x2a2a2a, fall: 0,
    passiveName: '猫有九条命', summary: '每局 {n} 条命，致命伤害时留 1 点生命；摔不疼', summaryRun: '还剩 {n} 条命，致命伤害时留 1 点生命；摔不疼',
    passive: '猫有九条命：每局 3 条命，致命伤害时留 1 点生命；摔不疼',
    passiveText: '每局 3 次：受到致命伤害时生命留在 1 点，无敌 2 秒，身上炸开一团猫毛，把 5 米内的普通敌人吓得愣住 1 秒。猫从多高掉下来都不会摔伤。',
    stats: { maxHp: -20, moveSpeed: 0.08, jump: 0.25, evasion: 0.03 } },
  fisher: { name: '渔夫骑士', title: '今天一定能钓到大的', model: 'fisher', weapon: 'rod', icon: '渔', color: 0x3e6b4a, fall: 1,
    passiveName: '鱼篓满满', summary: '每钓上一个敌人多一条鱼，每条鱼伤害 +3%',
    passive: '鱼篓满满：每钓上一个敌人多一条鱼，每条鱼伤害 +3%',
    passiveText: '钓竿每钓上一个敌人（拽上岸，或在钓线上打倒），鱼篓里多 1 条鱼（30 秒后吃掉，最多 10 条）；每条鱼伤害 +3%。',
    stats: { maxHp: 20, regen: 4, knockback: 0.1 } },
  lampknight: { name: '提灯骑士', title: '灯在，夜就不黑', model: 'lampknight', weapon: 'lanternbeam', icon: '灯', color: 0x2a3a5a, fall: 1.1,
    passiveName: '长明灯', summary: '身边 {r} 米灯光，灯里的敌人变慢、更怕疼',
    passive: '长明灯：身边一圈灯光，灯里的敌人变慢、更怕疼',
    passiveText: '身边 6 米被灯光照亮：灯光里的敌人移动速度 −15%，受到的伤害 +10%。每打倒 25 个敌人，灯光半径 +0.5 米（这一局最多 +3 米）。',
    stats: { maxHp: 20, size: 0.05, armor: 0.03 } },
  engineer: { name: '攻城骑士', title: '三块石头拆一座城', model: 'engineer', weapon: 'trebuchet', icon: '城', color: 0x8a5a2a, fall: 1,
    passiveName: '就地扎营', summary: '每 30 秒架起小弩车，射 15 秒，每箭 {dmg} 伤害',
    passive: '就地扎营：每 30 秒架起一台小弩车，自动射击 15 秒',
    passiveText: '每 30 秒在身边架起一台小弩车（立 15 秒）：每 0.7 秒朝 30 米内最近的敌人射一支穿透弩箭。',
    stats: { maxHp: 10, duration: 0.1, knockback: 0.1 } }
};

// ---------------- 敌人 ----------------
// 敌人数值在 data_enemies.js（本作自己的角色系数表，第 8 块换新数值）
var ENEMY_DMG = 0.55;   // 接触伤害整体系数（没有局外成长，稍微手下留情）
var ENEMIES = {};

// ---------------- 关卡 ----------------
var STAGES = [];

// ---------------- 第 13 块 M1（反过来混着）：这一页的表是新的，旧的 meta.js 什么都存不进去 ----------------
// 离线缓存（sw.js）在单个文件网络出错、超时的时候给缓存里旧版本的那一份，最大的 meta.js 最容易是旧的。旧的 meta.js 配上新的表，
// 读 v1 存档（knight_magic_profile）时就把旧 id 的骑士记录和没结算的那一局丢了，一存（开一局、切到后台、买东西）就把剩下的写回 v1，
// 下次正常打开再也迁移不回来。所以这一页只要加载了新的 data.js 或 data_meta.js（都在 meta.js 之前加载），就在 localStorage 这一层拦住：
// · v1 和它的 _bad、_test 谁都不让写、不让删（新代码从来不写 v1，没有 v2 时只读一次）；
// · 设置（knight_magic_settings）和存档点（knight_magic_resume）只有新的 meta.js（有 Meta.DATA_VERSION）在这一页上时才让写、让删。
// 写的时候抛错，旧代码写这几个键的地方都包着 try/catch：旧的 Meta.write 返回 false（storageOk = false，「记录」页照常提示存不了），
// 删的时候什么都不做。和冻结的一页（Meta.freeze）一样，下次正常打开要用的都原样留着。音量、手感、画面设置这些键照常。
// data.js 和 data_meta.js 末尾是一模一样的这一段（哪一个是新的都管用）；装过一次（Storage.prototype.kmMixGuard），第二段什么都不做
(function () {
  try {
    var S = typeof Storage !== 'undefined' && Storage.prototype;
    if (!S || S.kmMixGuard || typeof S.setItem !== 'function' || typeof S.removeItem !== 'function') return;
    var set = S.setItem, rm = S.removeItem;
    var locked = function (k) {
      k = String(k);
      if (k === 'knight_magic_profile' || k === 'knight_magic_profile_bad' || k === 'knight_magic_profile_test') return true;
      if (k !== 'knight_magic_settings' && k !== 'knight_magic_resume') return false;
      return typeof Meta === 'undefined' || !Meta || Meta.DATA_VERSION === undefined;
    };
    S.setItem = function (k) { if (locked(k)) throw new Error(String(k) + ' 在这一页不能写'); return set.apply(this, arguments); };
    S.removeItem = function (k) { if (!locked(k)) return rm.apply(this, arguments); };
    Object.defineProperty(S, 'kmMixGuard', { value: true });
  } catch (e) { /* 忽略 */ }
})();
