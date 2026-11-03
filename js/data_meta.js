'use strict';
// ============================================================
//  局外成长的数据表（逻辑和界面在 meta.js）：
//  初始骑士、骑士价格、开局锁住的内容、难度、强化、成就、魔晶结算
// ============================================================
var META_DATA = {};

// 存档版本（改了存档结构就加 1，并在 Meta.migrate 里写迁移）
META_DATA.VERSION = 1;

// ---------------- 骑士 ----------------
// 开局就能用的 6 位：法师、重甲剑士、速度型、弓手、光环肉搏、回旋镖爬墙
META_DATA.START_KNIGHTS = ['fox', 'oofie', 'calcium', 'robin', 'chad', 'monke'];
// 其余 15 位：完成各自的成就，或者用魔晶直接买
META_DATA.KNIGHT_PRICE = {
  clank: 300, tony: 350, birdo: 350, spaceman: 400, amog: 400, ogre: 450, athena: 450,
  bandit: 500, bush: 500, dicehead: 500, vlad: 550, roberto: 600, noelle: 600, ninja: 700, chadwell: 750
};
// 先买了骑士、后来才完成他的成就：返还这么多比例的价格（成就不白做）
META_DATA.KNIGHT_REFUND = 0.5;

// ---------------- 开局锁住的内容（只影响升级、宝箱、商人、神龛的随机池；直接给的照常能用） ----------------
// 武器只锁「不是任何骑士初始武器」的 9 把，21 位骑士的初始武器一直在池子里；
// 魔典只锁不是这些初始武器超武材料的 3 本；每种稀有度的物品都留了足够多的（商人一次要 3 件不同的）
META_DATA.LOCKED = {
  weapon: ['chunkers', 'herosword', 'shotgun', 'noodle', 'dragon', 'mines', 'lightning', 'flamewalker', 'rocket'],
  tome: ['xp', 'golden', 'chaos'],
  item: ['borgar', 'glasses', 'greencard', 'redcard', 'plug', 'magnet', 'bigbonk', 'lamp', 'dragonfire', 'snek', 'zawarudo'],
  shrine: ['quantity']
};

// ---------------- 难度 ----------------
// hp / dmg：敌人血量、伤害倍率（乘在刷怪导演的倍率上，Boss、小 Boss、挑战精英、虫潮都跟着变）；
// spawn：最少存活数和刷怪速度的倍率；mc：魔晶倍率。难度 I 就是原来的手感
META_DATA.TIERS = [
  null,
  { id: 1, name: 'I', hp: 1, dmg: 1, spawn: 1, mc: 1, desc: '标准难度' },
  { id: 2, name: 'II', hp: 1.6, dmg: 1.35, spawn: 1.2, mc: 1.5, desc: '敌人血量 ×1.6 · 伤害 ×1.35 · 数量 ×1.2 · 魔晶 ×1.5' },
  { id: 3, name: 'III', hp: 2.5, dmg: 1.7, spawn: 1.4, mc: 2.2, desc: '敌人血量 ×2.5 · 伤害 ×1.7 · 数量 ×1.4 · 魔晶 ×2.2' }
];

// ---------------- 强化（永久，开局生效） ----------------
// stat：加到 P.mods 的属性（per 是每级的量）；special：起始金币 / 重抽 / 跳过 / 放逐次数
// icon：[图标种类, id]（用游戏的 3D 图标），没有就用 glyph 汉字；cost：每一级的价格
META_DATA.UPGRADES = [
  { id: 'hp', name: '最大生命', stat: 'maxHp', per: 10, unit: '', cost: [60, 110, 180, 270, 400], icon: ['tome', 'hp'], glyph: '命', color: 0xe85a7a },
  { id: 'regen', name: '生命回复', stat: 'regen', per: 6, unit: '/分钟', cost: [50, 90, 150, 230, 340], icon: ['tome', 'regen'], glyph: '生', color: 0x5bd96a },
  { id: 'dmg', name: '伤害', stat: 'damage', per: 0.04, pct: true, cost: [80, 140, 230, 350, 520], icon: ['tome', 'dmg'], glyph: '伤', color: 0xd9433b },
  { id: 'atk', name: '攻击速度', stat: 'atkSpeed', per: 0.03, pct: true, cost: [80, 140, 230, 350, 520], icon: ['tome', 'cd'], glyph: '速', color: 0x3bb0d9 },
  { id: 'spd', name: '移动速度', stat: 'moveSpeed', per: 0.03, pct: true, cost: [60, 110, 180, 270, 400], icon: ['tome', 'agi'], glyph: '敏', color: 0x5be3c8 },
  { id: 'luck', name: '幸运', stat: 'luck', per: 0.03, pct: true, cost: [70, 120, 200, 300, 450], icon: ['tome', 'luck'], glyph: '运', color: 0x4ac94a },
  { id: 'pickup', name: '拾取范围', stat: 'pickup', per: 0.1, pct: true, cost: [40, 80, 130, 200, 300], icon: ['tome', 'attract'], glyph: '吸', color: 0xd94ab0 },
  { id: 'xp', name: '经验获取', stat: 'xpGain', per: 0.04, pct: true, cost: [70, 120, 200, 300, 450], icon: ['tome', 'xp'], glyph: '经', color: 0x4a8cf0 },
  { id: 'gold', name: '起始金币', special: 'gold', per: 20, unit: ' 金币', cost: [40, 80, 130, 200, 300], icon: ['tome', 'golden'], glyph: '金', color: 0xf0c03a },
  { id: 'reroll', name: '重抽次数', special: 'reroll', per: 1, unit: ' 次', cost: [100, 220, 400], glyph: '抽', color: 0x4ea8ff },
  { id: 'skip', name: '跳过次数', special: 'skip', per: 1, unit: ' 次', cost: [80, 200], glyph: '跳', color: 0x9aa3ad },
  { id: 'banish', name: '放逐次数', special: 'banish', per: 1, unit: ' 次', cost: [100, 240], glyph: '逐', color: 0xff6b6b }
];

// ---------------- 魔晶结算（不按游戏时长算，10 / 15 / 20 分钟一关都公平） ----------------
// base：坚持满 minTime 秒的参与奖；level：每升一级；kills：每 killsPer 个击杀（按 15 分钟一关折算）；
// mini / boss：每只小 Boss / 关卡 Boss；stage：每多到一关；win：通关；不满 zeroTime 秒的局什么都没有（防止开局就退刷魔晶）
META_DATA.PAYOUT = { zeroTime: 30, minTime: 120, base: 10, level: 2, killsPer: 30, mini: 8, boss: 50, stage: 30, win: 120 };

// 老玩家礼包：更新前就玩过的（有设置存档的）第一次打开时送的魔晶
META_DATA.WELCOME_GIFT = 300;

// ---------------- 成就 ----------------
// m：进度来源（meta.js 的 Meta.METRICS）；goal：目标；
// r：奖励 { knight, weapon[], tome[], item[], shrine[], mc 魔晶 }；icon：列表里的图标（不写就用奖励的图标）
META_DATA.ACHIEVEMENTS = [
  // ---- 解锁骑士（每位骑士一个和他有关的挑战） ----
  // 目标按真实受伤的机器人实测调过：第一局一般解锁发条骑士（四把武器）和零到两位别的，其余分散到之后的十来局（见 META_NOTES.md）
  { id: 'k_clank', name: '全副武装', desc: '一局里同时拥有 4 把武器', m: 'weapons', goal: 4, r: { knight: 'clank' } },
  { id: 'k_tony', name: '风驰电掣', desc: '移动速度达到 30（下坡滑铲、空中加速都算）', m: 'speed', goal: 30, r: { knight: 'tony' } },
  { id: 'k_birdo', name: '翱翔天际', desc: '被投石跳台抛上天 5 次', m: 'launches', goal: 5, r: { knight: 'birdo' } },
  { id: 'k_spaceman', name: '星辰大海', desc: '一局里达到 25 级', m: 'level', goal: 25, r: { knight: 'spaceman' } },
  { id: 'k_amog', name: '瘟疫蔓延', desc: '累计击杀 2500 个正在燃烧或中毒的敌人', m: 'dotKills', goal: 2500, r: { knight: 'amog' } },
  { id: 'k_ogre', name: '巨人克星', desc: '累计击败 8 只小 Boss', m: 'minis', goal: 8, r: { knight: 'ogre' } },
  { id: 'k_athena', name: '绝境反击', desc: '生命低于 25% 时累计击杀 400 个敌人', m: 'lowHpKills', goal: 400, r: { knight: 'athena' } },
  { id: 'k_bandit', name: '拦路抢劫', desc: '累计打开 40 个宝箱', m: 'chests', goal: 40, r: { knight: 'bandit' } },
  { id: 'k_bush', name: '百步穿杨', desc: '累计击杀 40 个精英怪', m: 'elites', goal: 40, r: { knight: 'bush' } },
  { id: 'k_dicehead', name: '孤注一掷', desc: '在许愿井累计许愿 12 次', m: 'wishes', goal: 12, r: { knight: 'dicehead' } },
  { id: 'k_vlad', name: '嗜血成性', desc: '累计回复 3000 点生命', m: 'heal', goal: 3000, r: { knight: 'vlad' } },
  { id: 'k_roberto', name: '囤积癖', desc: '一局里拥有 15 件物品', m: 'items', goal: 15, r: { knight: 'roberto' } },
  { id: 'k_noelle', name: '凛冬将至', desc: '累计击杀 800 个被冻住的敌人（冰霜行者、冰块……）', m: 'frozenKills', goal: 800, r: { knight: 'noelle' } },
  // 开局那几分钟很平静：120 秒第一局就自动完成了（真实受伤的机器人第一局最长 150~312 秒），所以要 300 秒
  { id: 'k_ninja', name: '来去无影', desc: '连续 300 秒不受伤（暂停和选卡时不计时）', m: 'noHit', goal: 300, r: { knight: 'ninja' } },
  { id: 'k_chadwell', name: '自讨苦吃', desc: '一局里难度达到 +25%（贪婪神龛、诅咒魔典……）', m: 'difficulty', goal: 0.25, pct: true, r: { knight: 'chadwell' } },

  // ---- 解锁武器、魔典、物品、神龛祝福 ----
  { id: 'c_first', name: '初出茅庐', desc: '完成第一局', m: 'runs', goal: 1, r: { mc: 100 } },
  { id: 'c_kills500', name: '割草新手', desc: '累计击杀 500 个敌人', m: 'kills', goal: 500, r: { weapon: ['chunkers'] } },
  { id: 'c_lv10', name: '步步高升', desc: '一局里达到 10 级', m: 'level', goal: 10, r: { tome: ['xp'] } },
  { id: 'c_pots', name: '碎碎平安', desc: '累计打碎 60 个陶罐', m: 'pots', goal: 60, r: { item: ['borgar'] } },
  { id: 'c_chests', name: '宝箱猎人', desc: '累计打开 10 个宝箱', m: 'chests', goal: 10, r: { item: ['greencard', 'redcard'] } },
  { id: 'c_shrines', name: '神龛信徒', desc: '累计充能 10 座神龛', m: 'shrines', goal: 10, r: { shrine: ['quantity'] }, icon: ['glyph', '神', 0x7ef0ff] },
  { id: 'c_succ', name: '吸力全开', desc: '累计使用 3 座吸取神龛', m: 'succ', goal: 3, r: { item: ['magnet'] } },
  { id: 'c_boss1', name: '斩首行动', desc: '击败 1 只关卡 Boss', m: 'bosses', goal: 1, r: { weapon: ['herosword'], mc: 100 } },
  { id: 'c_evo1', name: '千锤百炼', desc: '第一次觉醒超武', m: 'evos', goal: 1, r: { weapon: ['shotgun'] } },
  { id: 'c_stage2', name: '穿越者', desc: '到达第 2 关', m: 'stage', goal: 2, r: { weapon: ['noodle'], mc: 100 } },
  { id: 'c_tomes', name: '博览群书', desc: '一局里同时拥有 4 本魔典', m: 'tomes', goal: 4, r: { weapon: ['lightning'], tome: ['chaos'] } },
  { id: 'c_kegs', name: '爆破专家', desc: '累计引爆 15 个火药桶', m: 'kegs', goal: 15, r: { weapon: ['mines'], tome: ['golden'] } },
  { id: 'c_ride', name: '烈焰足迹', desc: '累计滑铲 2000 米', m: 'ride', goal: 2000, r: { weapon: ['flamewalker'] } },
  { id: 'c_stage3', name: '深入墓地', desc: '到达第 3 关', m: 'stage', goal: 3, r: { weapon: ['dragon'], mc: 150 } },
  { id: 'c_hurt', name: '皮糙肉厚', desc: '累计承受 3000 点伤害', m: 'hurt', goal: 3000, r: { item: ['plug'] } },
  { id: 'c_runkills', name: '割草机', desc: '一局里击杀 2000 个敌人', m: 'runKills', goal: 2000, r: { item: ['bigbonk'] } },
  { id: 'c_kills5000', name: '千人斩', desc: '累计击杀 5000 个敌人', m: 'kills', goal: 5000, r: { weapon: ['rocket'] } },
  { id: 'c_elites', name: '精英猎手', desc: '累计击杀 80 个精英怪', m: 'elites', goal: 80, r: { item: ['glasses'] } },
  { id: 'c_evo2', name: '双持超武', desc: '一局里同时拥有 2 把超武', m: 'evoNow', goal: 2, r: { item: ['dragonfire'] } },
  { id: 'c_evo5', name: '超武大师', desc: '累计觉醒 5 次超武', m: 'evos', goal: 5, r: { item: ['lamp'] } },
  { id: 'c_swarm', name: '虫潮幸存者', desc: '在最终虫潮里坚持 60 秒', m: 'swarm', goal: 60, r: { item: ['snek'] } },
  { id: 'c_boss5', name: 'Boss 收割者', desc: '累计击败 5 只关卡 Boss', m: 'bosses', goal: 5, r: { item: ['zawarudo'] } },

  // ---- 魔晶奖励 ----
  { id: 'm_goblin', name: '哥布林克星', desc: '累计击杀 1000 个哥布林（小哥布林、壮哥布林、重甲兵）', m: 'goblins', goal: 1000, r: { mc: 150 } },
  { id: 'm_curious', name: '好奇宝宝', desc: '累计使用 30 次地图互动点（神龛、铁匠铺、许愿井、弩车、战马、投石跳台……）', m: 'interacts', goal: 30, r: { mc: 150 } },
  { id: 'm_gold', name: '守财奴', desc: '一局里同时持有 1000 金币', m: 'gold', goal: 1000, r: { mc: 150 } },
  { id: 'm_master', name: '专精', desc: '一局里用同一把武器击杀 1500 个敌人', m: 'weaponKills', goal: 1500, r: { mc: 200 } },
  { id: 'm_win1', name: '骑士魔法', desc: '通关一次（打败第 3 关的 Boss 并进入传送门）', m: 'win1', goal: 1, r: { mc: 300 }, note: '同时解锁难度 II' },
  { id: 'm_win2', name: '难度 II 征服者', desc: '在难度 II 或更高难度通关', m: 'win2', goal: 1, r: { mc: 500 }, note: '同时解锁难度 III' },
  { id: 'm_win3', name: '难度 III 征服者', desc: '在难度 III 通关', m: 'win3', goal: 1, r: { mc: 800 } },
  { id: 'm_party', name: '骑士团', desc: '用 5 位不同的骑士通关', m: 'winKnights', goal: 5, r: { mc: 500 } },
  { id: 'm_all', name: '全员集结', desc: '解锁全部 21 位骑士', m: 'knights', goal: 21, r: { mc: 500 } }
];

// ---- 探索新内容（秘密地点、随机事件、Boss 第二阶段、地形；content.js / content_map.js）：奖励魔晶 ----
// 一共 1,240 魔晶（大约两局通关的收入）。怪物的名字现查（以后改名这里跟着变）；Boss 只按“关卡 Boss”说，不写名字。
// 图标 icon: ['px', 名字] 是界面套件的 9×9 像素小图标（Kit.ICONS），和魔晶一样放在深色图块里（成就页上和别的成就一个样子），
// 能和局内公告用同一个的就用同一个：秘密 = 星星（找齐 = 皇冠）、金袋哥布林 = 钱袋、宝箱怪 = 宝箱、血月 = 月亮、第二阶段 = 火焰、宝库 = 钥匙、跳台 = 跳台
(function () {
  var en = function (id, fb) { return typeof ENEMIES !== 'undefined' && ENEMIES[id] ? ENEMIES[id].name : fb; };
  var nStages = typeof STAGES !== 'undefined' && STAGES.length ? STAGES.length : 3;
  META_DATA.ACHIEVEMENTS.push(
    { id: 'x_secret', name: '秘境初探', desc: '找到 1 处秘密地点（找到之前小地图上不显示）', m: 'secrets', goal: 1, r: { mc: 80 }, icon: ['px', 'star'] },
    { id: 'x_secret3', name: '一个不落', desc: '在同一关里找齐 3 处秘密地点', m: 'stageSecrets', goal: 3, r: { mc: 250 }, icon: ['px', 'crown'] },
    { id: 'x_goldgob', name: '抓住它！', desc: '在随机事件里追上并打倒' + en('goldgob', '金袋哥布林'), m: 'goldgobs', goal: 1, r: { mc: 150 }, icon: ['px', 'bag'] },
    { id: 'x_mimic', name: '开箱有风险', desc: '打倒伪装成金宝箱的' + en('mimic', '宝箱怪'), m: 'mimics', goal: 1, r: { mc: 120 }, icon: ['px', 'chest'] },
    { id: 'x_bloodmoon', name: '血月未眠', desc: '在血月下坚持到它落下（被 Boss 战打断的不算）', m: 'bloodmoons', goal: 1, r: { mc: 150 }, icon: ['px', 'moon'] },
    { id: 'x_phase2', name: '怒火试炼', desc: '每关的关卡 Boss 都在半血暴怒后被你打败过一次（可分几局完成）', m: 'phase2Stages', goal: nStages, r: { mc: 250 }, icon: ['px', 'flame'] },
    { id: 'x_vault', name: '一次点亮', desc: '秘密宝库：一次不错地按光点顺序点燃四个火盆', m: 'vaultClean', goal: 1, r: { mc: 120 }, icon: ['px', 'key'] },
    { id: 'x_pad', name: '坡道飞驰', desc: '踩跳台上长坡顶，15 秒内滑铲下坡，速度达到 20', m: 'padRides', goal: 1, r: { mc: 120 }, icon: ['px', 'ramp'] }
  );
  // 「哥布林克星」数哪些怪（meta.js 的 Meta.GOBLINS 用这张表）：新加的哥布林鼓手、金袋哥布林也算；说明里的名字现查
  META_DATA.GOBLINS = ['goblin', 'goblin2', 'goblintank', 'drummer', 'goldgob'];
  var gob = META_DATA.ACHIEVEMENTS.filter(function (a) { return a.id === 'm_goblin'; })[0];
  var names = META_DATA.GOBLINS.map(function (id) { return en(id, ''); }).filter(Boolean);
  if (gob && names.length) gob.desc = '累计击杀 1000 个哥布林（' + names.join('、') + '）';
})();
