'use strict';
// ============================================================
//  局外成长的数据表（逻辑和界面在 meta.js）：
//  初始骑士、骑士价格、开局锁住的内容、难度、强化、成就、魔晶结算
//  id、名字、说明、价格都来自原创计划的 tables.json（docs/knight-magic/design/original/）
// ============================================================
var META_DATA = {};

// 存档版本（改了存档结构就加 1，并在 Meta.migrate 里写迁移）
// v2 = 原创内容的新 id（骑士、武器、纹章、宝物、成就、统计都换了键），迁移在 meta.js 的 Meta.fromV1
META_DATA.VERSION = 2;

// ---------------- 骑士 ----------------
// 开局就能用的 6 位（正好接过 v1 里 6 位开局骑士的存档位，老玩家已解锁的骑士数不变）
META_DATA.START_KNIGHTS = ['squire', 'bellringer', 'gravekeeper', 'cook', 'courier', 'jester'];
// 其余 15 位：完成各自的成就，或者用魔晶直接买
META_DATA.KNIGHT_PRICE = {
  tinsoldier: 300, astrologer: 350, falconer: 350, nun: 400, smith: 400, bear: 450, bannerman: 450,
  gardener: 500, painter: 500, magician: 500, beekeeper: 550, catknight: 600, fisher: 600, lampknight: 700, engineer: 750
};
// 先买了骑士、后来才完成他的成就：返还这么多比例的价格（成就不白做）
META_DATA.KNIGHT_REFUND = 0.5;

// ---------------- 开局锁住的内容（只影响升级、宝箱、商人的随机池；直接给的照常能用） ----------------
// 武器只锁「不是任何骑士初始武器」的 9 把，21 位骑士的初始武器一直在池子里；
// 纹章只锁「只给锁住的武器当超武材料」的 3 枚；每种稀有度至少还剩 2 件开局就有的宝物（商人一次要 3 件不同的）
META_DATA.LOCKED = {
  weapon: ['kite', 'javelin', 'chessknight', 'beartrap', 'thunderdrum', 'firecracker', 'icicle', 'slingshot', 'skyrocket'],
  tome: ['owl', 'goldkey', 'wheel'],
  item: ['lockpick', 'hardtack', 'caltrops', 'honeyjar', 'talisman', 'duelglove', 'ravenfeather', 'forgeplan', 'twinbelt', 'ruler', 'holygrail', 'wardrum']
};

// ---------------- 难度 ----------------
// hp / dmg：敌人血量、伤害倍率（乘在刷怪导演的倍率上，关卡 Boss、小 Boss、精英、加时阶段都跟着变）；
// spawn：最少存活数和刷怪速度的倍率；mc：魔晶倍率。难度 I 就是原来的手感
META_DATA.TIERS = [
  null,
  { id: 1, name: 'I', hp: 1, dmg: 1, spawn: 1, mc: 1, desc: '标准难度' },
  { id: 2, name: 'II', hp: 1.6, dmg: 1.35, spawn: 1.2, mc: 1.5, desc: '敌人血量 ×1.6 · 伤害 ×1.35 · 数量 ×1.2 · 魔晶 ×1.5' },
  { id: 3, name: 'III', hp: 2.5, dmg: 1.7, spawn: 1.4, mc: 2.2, desc: '敌人血量 ×2.5 · 伤害 ×1.7 · 数量 ×1.4 · 魔晶 ×2.2' }
];

// ---------------- 强化（永久，开局生效） ----------------
// stat：加到 P.mods 的属性（per 是每级的量）；special：起始金币 / 重抽 / 跳过 / 放逐次数
// icon：[图标种类, id]（用游戏的 3D 图标，这里是意思最近的纹章），没有图标就用 glyph 汉字；cost：每一级的价格
META_DATA.UPGRADES = [
  { id: 'hp', name: '最大生命', stat: 'maxHp', per: 10, unit: '', cost: [60, 110, 180, 270, 400], icon: ['tome', 'grizzly'], glyph: '命', color: 0xe85a7a },
  { id: 'regen', name: '生命回复', stat: 'regen', per: 6, unit: '/分钟', cost: [50, 90, 150, 230, 340], icon: ['tome', 'lily'], glyph: '生', color: 0x5bd96a },
  { id: 'dmg', name: '伤害', stat: 'damage', per: 0.04, pct: true, cost: [80, 140, 230, 350, 520], icon: ['tome', 'lion'], glyph: '伤', color: 0xd9433b },
  { id: 'atk', name: '攻击速度', stat: 'atkSpeed', per: 0.03, pct: true, cost: [80, 140, 230, 350, 520], icon: ['tome', 'direwolf'], glyph: '速', color: 0x3bb0d9 },
  { id: 'spd', name: '移动速度', stat: 'moveSpeed', per: 0.03, pct: true, cost: [60, 110, 180, 270, 400], icon: ['tome', 'gale'], glyph: '敏', color: 0x5be3c8 },
  { id: 'luck', name: '幸运', stat: 'luck', per: 0.03, pct: true, cost: [70, 120, 200, 300, 450], icon: ['tome', 'starry'], glyph: '运', color: 0x4ac94a },
  { id: 'pickup', name: '拾取范围', stat: 'pickup', per: 0.1, pct: true, cost: [40, 80, 130, 200, 300], icon: ['tome', 'sunflower'], glyph: '吸', color: 0xd94ab0 },
  { id: 'xp', name: '经验获取', stat: 'xpGain', per: 0.04, pct: true, cost: [70, 120, 200, 300, 450], icon: ['tome', 'owl'], glyph: '经', color: 0x4a8cf0 },
  { id: 'gold', name: '起始金币', special: 'gold', per: 20, unit: ' 金币', cost: [40, 80, 130, 200, 300], icon: ['tome', 'goldkey'], glyph: '金', color: 0xf0c03a },
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
// r：奖励 { knight, weapon[], tome[] 纹章, item[] 宝物, mc 魔晶 }；icon：列表里的图标（不写就用奖励的图标）
META_DATA.ACHIEVEMENTS = [
  // ---- 解锁骑士（每位骑士一个和这位骑士有关的挑战） ----
  // 目标按真实受伤的机器人实测调过：第一局一般解锁「全副武装」那位（四把武器）和零到两位别的，其余分散到之后的十来局（见 META_NOTES.md）
  { id: 'k_tinsoldier', name: '全副武装', desc: '一局里同时拥有 4 把武器', m: 'weapons', goal: 4, r: { knight: 'tinsoldier' } },
  { id: 'k_astrologer', name: '流星赶月', desc: '移动速度达到 30（下坡滑铲、空中加速都算）', m: 'speed', goal: 30, r: { knight: 'astrologer' } },
  { id: 'k_falconer', name: '鹰击长空', desc: '被投石跳台抛上天 5 次', m: 'launches', goal: 5, r: { knight: 'falconer' } },
  { id: 'k_nun', name: '月下晚祷', desc: '一局里达到 25 级', m: 'level', goal: 25, r: { knight: 'nun' } },
  { id: 'k_smith', name: '炉火纯青', desc: '累计击杀 1500 个正在燃烧的敌人', m: 'dotKills', goal: 1500, r: { knight: 'smith' } },
  { id: 'k_bear', name: '专挑大块头', desc: '累计击败 8 只小 Boss', m: 'minis', goal: 8, r: { knight: 'bear' } },
  { id: 'k_bannerman', name: '旗在人在', desc: '生命低于 25% 时累计击杀 400 个敌人', m: 'lowHpKills', goal: 400, r: { knight: 'bannerman' } },
  { id: 'k_gardener', name: '开花结果', desc: '累计打开 40 个宝箱', m: 'chests', goal: 40, r: { knight: 'gardener' } },
  { id: 'k_painter', name: '画龙点睛', desc: '累计击杀 40 个精英怪', m: 'elites', goal: 40, r: { knight: 'painter' } },
  { id: 'k_magician', name: '心想事成', desc: '在许愿井累计许愿 12 次', m: 'wishes', goal: 12, r: { knight: 'magician' } },
  { id: 'k_beekeeper', name: '蜂蜜疗伤', desc: '累计回复 3000 点生命', m: 'heal', goal: 3000, r: { knight: 'beekeeper' } },
  { id: 'k_catknight', name: '猫的宝藏', desc: '一局里拥有 15 件宝物', m: 'items', goal: 15, r: { knight: 'catknight' } },
  { id: 'k_fisher', name: '冰钓高手', desc: '累计击杀 500 个被冻住的敌人（冰棱、冰晶雪橇的薄冰……）', m: 'frozenKills', goal: 500, r: { knight: 'fisher' } },
  // 开局那几分钟很平静：120 秒第一局就自动完成了（真实受伤的机器人第一局最长 150~312 秒），所以要 300 秒
  { id: 'k_lampknight', name: '彻夜无事', desc: '连续 300 秒不受伤（暂停和选卡时不计时）', m: 'noHit', goal: 300, r: { knight: 'lampknight' } },
  { id: 'k_engineer', name: '拆迁队', desc: '累计引爆 50 个火药桶', m: 'kegs', goal: 50, r: { knight: 'engineer' } },

  // ---- 解锁武器、纹章、宝物 ----
  { id: 'c_first', name: '初出茅庐', desc: '完成第一局', m: 'runs', goal: 1, r: { mc: 100 } },
  { id: 'c_kills500', name: '割草新手', desc: '累计击杀 500 个敌人', m: 'kills', goal: 500, r: { weapon: ['kite'] } },
  { id: 'c_lv10', name: '步步高升', desc: '一局里达到 10 级', m: 'level', goal: 10, r: { tome: ['owl'] } },
  { id: 'c_pots', name: '碎碎平安', desc: '累计打碎 60 个陶罐', m: 'pots', goal: 60, r: { item: ['hardtack'] } },
  { id: 'c_chests', name: '宝箱猎人', desc: '累计打开 10 个宝箱', m: 'chests', goal: 10, r: { item: ['lockpick', 'honeyjar'] } },
  { id: 'c_oaths', name: '言出必行', desc: '累计完成 10 次誓言', m: 'oaths', goal: 10, r: { item: ['ruler'] } },
  { id: 'c_boulder', name: '愚公移山', desc: '累计推下 5 块滚石', m: 'boulders', goal: 5, r: { item: ['caltrops'] } },
  { id: 'c_boss1', name: '斩首行动', desc: '击败 1 只关卡首领', m: 'bosses', goal: 1, r: { weapon: ['javelin'], mc: 100 } },
  { id: 'c_evo1', name: '千锤百炼', desc: '第一次觉醒超武', m: 'evos', goal: 1, r: { weapon: ['chessknight'] } },
  { id: 'c_stage2', name: '穿越者', desc: '到达第 2 关', m: 'stage', goal: 2, r: { weapon: ['beartrap'], mc: 100 } },
  { id: 'c_crests', name: '纹章收藏家', desc: '一局里同时拥有 4 枚纹章', m: 'tomes', goal: 4, r: { weapon: ['thunderdrum'], tome: ['wheel'] } },
  { id: 'c_kegs', name: '爆破专家', desc: '累计引爆 15 个火药桶', m: 'kegs', goal: 15, r: { weapon: ['firecracker'], tome: ['goldkey'] } },
  { id: 'c_ride', name: '滑行高手', desc: '累计滑铲 2000 米', m: 'ride', goal: 2000, r: { weapon: ['icicle'] } },
  { id: 'c_stage3', name: '钟声深处', desc: '到达第 3 关', m: 'stage', goal: 3, r: { weapon: ['slingshot'], mc: 150 } },
  { id: 'c_hurt', name: '皮糙肉厚', desc: '累计承受 3000 点伤害', m: 'hurt', goal: 3000, r: { item: ['talisman'] } },
  { id: 'c_runkills', name: '割草机', desc: '一局里击杀 2000 个敌人', m: 'runKills', goal: 2000, r: { item: ['wardrum'] } },
  { id: 'c_kills5000', name: '千人斩', desc: '累计击杀 5000 个敌人', m: 'kills', goal: 5000, r: { weapon: ['skyrocket'] } },
  { id: 'c_elites', name: '精英猎手', desc: '累计击杀 80 个精英怪', m: 'elites', goal: 80, r: { item: ['duelglove'] } },
  { id: 'c_evo2', name: '双持超武', desc: '一局里同时拥有 2 把超武', m: 'evoNow', goal: 2, r: { item: ['twinbelt'] } },
  { id: 'c_evo5', name: '超武大师', desc: '累计觉醒 5 次超武', m: 'evos', goal: 5, r: { item: ['forgeplan'] } },
  { id: 'c_midnight', name: '熬过午夜', desc: '在午夜钟声里坚持 60 秒', m: 'swarm', goal: 60, r: { item: ['ravenfeather'] } },
  { id: 'c_boss5', name: '首领收割者', desc: '累计击败 5 只关卡首领', m: 'bosses', goal: 5, r: { item: ['holygrail'] } },

  // ---- 魔晶奖励 ----
  { id: 'm_goblin', name: '哥布林克星', desc: '累计击杀 1000 个哥布林（小兵、投矛手、鼓手、金袋哥布林）', m: 'goblins', goal: 1000, r: { mc: 150 } },
  { id: 'm_curious', name: '好奇宝宝', desc: '累计使用 30 次地图互动点（誓言石碑、铁匠铺、许愿井、弩车、战马、投石跳台……）', m: 'interacts', goal: 30, r: { mc: 150 } },
  { id: 'm_gold', name: '守财奴', desc: '一局里同时持有 1000 金币', m: 'gold', goal: 1000, r: { mc: 150 } },
  { id: 'm_master', name: '专精', desc: '一局里用同一把武器击杀 1500 个敌人', m: 'weaponKills', goal: 1500, r: { mc: 200 } },
  { id: 'm_win1', name: '骑士魔法', desc: '通关一次（打败第 3 关的首领并进入传送门）', m: 'win1', goal: 1, r: { mc: 300 }, note: '同时解锁难度 II' },
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
    { id: 'x_bloodmoon', name: '血月未眠', desc: '在血月下坚持到它落下（被首领战打断的不算）', m: 'bloodmoons', goal: 1, r: { mc: 150 }, icon: ['px', 'moon'] },
    { id: 'x_phase2', name: '怒火试炼', desc: '每关的首领都在半血暴怒后被你打败过一次（可分几局完成）', m: 'phase2Stages', goal: nStages, r: { mc: 250 }, icon: ['px', 'flame'] },
    { id: 'x_vault', name: '一次点亮', desc: '秘密宝库：一次不错地按光点顺序点燃四个火盆', m: 'vaultClean', goal: 1, r: { mc: 120 }, icon: ['px', 'key'] },
    { id: 'x_pad', name: '坡道飞驰', desc: '踩跳台上长坡顶，15 秒内滑铲下坡，速度达到 20', m: 'padRides', goal: 1, r: { mc: 120 }, icon: ['px', 'ramp'] }
  );
  // 「哥布林克星」数哪些怪（meta.js 的 Meta.GOBLINS 用这张表）：哥布林小兵、投矛手、鼓手、金袋哥布林
  META_DATA.GOBLINS = ['goblin', 'gobspear', 'drummer', 'goldgob'];
})();

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
