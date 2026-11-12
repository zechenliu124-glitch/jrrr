'use strict';
// ============================================================
//  成长：稀有度、升级三选一、纹章（两行属性 + 家族套装）、宝物、誓言石碑 / 决斗旗的纹章祝福
// ============================================================
// 稀有度颜色：普通白、优秀绿、稀有蓝、史诗紫、传说橙（只用在卡片边框、稀有度那个字和 3D 的宝箱光，见 UI_STYLE.md §2.4）
// world：3D 光和火花的颜色（普通用灰色，不发白光）
var RARITY = [
  { name: '普通', color: '#e8e8e8', glow: 'rgba(232,232,232,0.35)', world: 0xb9c2d2 },
  { name: '优秀', color: '#5fd35f', glow: 'rgba(95,211,95,0.45)', world: 0x5fd35f },
  { name: '稀有', color: '#4aa3ff', glow: 'rgba(74,163,255,0.5)', world: 0x4aa3ff },
  { name: '史诗', color: '#b46bff', glow: 'rgba(180,107,255,0.55)', world: 0xb46bff },
  { name: '传说', color: '#ff9a2a', glow: 'rgba(255,154,42,0.65)', world: 0xff9a2a }
];

var Rarity = {};
// 基础权重 68/20/8/3/1（CARD_WEIGHTS）；幸运按对数递减地把概率推向高稀有度
Rarity.roll = function (minR, weightsIn) {
  var luck = Math.max(0, P.st.luck || 0);
  var bonus = Math.log(1 + luck) * 1.5;
  var w = (weightsIn || CARD_WEIGHTS).slice();
  w[0] /= 1 + bonus * 1.5;
  for (var i = 1; i < 4; i++) w[i] *= 1 + bonus * 0.5;
  var tot = 0;
  for (i = minR || 0; i < 5; i++) tot += w[i];
  var r = Math.random() * tot;
  for (i = minR || 0; i < 5; i++) { r -= w[i]; if (r <= 0) return i; }
  return 4;
};

// ---------------- 升级三选一 ----------------
var LevelUp = { rerolls: 3, skips: 3, banishes: 3, banned: {} };

LevelUp.reset = function () { LevelUp.rerolls = 3; LevelUp.skips = 3; LevelUp.banishes = 3; LevelUp.banned = {}; };

LevelUp.tome = function (id) {
  for (var i = 0; i < P.tomes.length; i++) if (P.tomes[i].id === id) return P.tomes[i];
  return null;
};

LevelUp.options = function () {
  var pool = [];
  P.weapons.forEach(function (w) { if (w.level < LEVEL_CAP.weapon) pool.push({ kind: 'weapon-up', id: w.id, weight: 3 }); });
  if (P.weapons.length < P.st.weaponSlots) {
    Object.keys(WEAPONS).forEach(function (id) { if (!Weapons.find(id) && !LevelUp.banned[id]) pool.push({ kind: 'weapon-new', id: id, weight: 0.35 }); });
  }
  P.tomes.forEach(function (t) { if (t.level < LEVEL_CAP.crest) pool.push({ kind: 'tome-up', id: t.id, weight: 2.4 }); });
  if (P.tomes.length < P.st.tomeSlots) {
    Object.keys(TOMES).forEach(function (id) { if (!LevelUp.tome(id) && !LevelUp.banned[id]) pool.push({ kind: 'tome-new', id: id, weight: 0.3 }); });
  }
  var out = [];
  while (out.length < 3 + Relic.extraCards() && pool.length) {   // 第 6 块：骑士手册四选一
    var tot = 0;
    pool.forEach(function (p) { tot += p.weight; });
    var r = Math.random() * tot, sel = pool.length - 1;
    for (var i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { sel = i; break; } }
    out.push(LevelUp.make(pool.splice(sel, 1)[0]));
  }
  if (!out.length) out.push(LevelUp.ration());   // 全都满级（或者都放逐了）：兜底卡
  return out;
};

// 兜底卡「骑士干粮」
LevelUp.ration = function () {
  return { kind: 'ration', id: 'ration', rarity: 0, title: '骑士干粮', icon: '粮', color: 0xd9a05a, sub: '全部满级', lines: ['回复 25% 生命', '+' + 20 * Game.stage + ' 金币'] };
};

// 套装「匠心」：武器升级卡的最低稀有度（没有就是 0）
LevelUp.minWeaponRarity = function () {
  var m = 0;
  CREST_SETS.forEach(function (cs) { if (cs.minWeaponRarity && P.sets && P.sets[cs.family]) m = Math.max(m, cs.minWeaponRarity); });
  m = Math.max(m, Relic.minWeaponRarity());   // 第 6 块：锻造图纸
  return m;
};

// minR：这张卡最低的稀有度；新武器总是普通，新纹章直接是 minR（升级卡和纹章祝福里都是普通）
LevelUp.make = function (p, minR) {
  var rarity = Math.max(minR || 0, Rarity.roll());
  var o = { kind: p.kind, id: p.id, rarity: rarity, lines: [] };
  var w = null;
  if (p.kind === 'weapon-up') {
    w = Weapons.find(p.id);
    rarity = o.rarity = Math.max(LevelUp.minWeaponRarity(), rarity);
    var r2 = Passive.cardRarity ? Passive.cardRarity(o, w, rarity) : rarity;
    if (r2 !== rarity) { rarity = o.rarity = r2; o.foot = RARITY[r2].name + ' · 趁热打铁'; }   // 卡片角标（铁匠骑士）
    o.title = w.def.name; o.icon = w.def.icon; o.color = w.def.color; o.sub = '等级 ' + w.level + ' → ' + (w.level + 1);
    o.picks = Weapons.rollUpgrade(w, rarity);
    o.lines = Weapons.cardLines(w, o.picks);
  } else if (p.kind === 'weapon-new') {
    var def = WEAPONS[p.id];
    o.rarity = 0;
    o.title = def.name; o.icon = def.icon; o.color = def.color; o.sub = '新武器'; o.lines = [def.desc];
  } else {
    var td = TOMES[p.id], t = LevelUp.tome(p.id), fam = CREST_FAMILIES[td.family];
    if (!t) rarity = o.rarity = minR || 0;     // 新纹章：直接获得 1 级，稀有度就是 minR（普通）
    o.title = td.name; o.icon = td.icon; o.color = td.color;
    o.sub = (t ? '等级 ' + t.level + ' → ' + (t.level + 1) : '新纹章') + (fam ? ' · ' + fam.name : '');
    o.value = td.val * RARITY_MULT[rarity];
    o.value2 = (td.val2 || 0) * RARITY_MULT[rarity];
    o.lines = [LevelUp.crestLine(td.stat, o.value)];
    if (td.stat2) o.lines.push(LevelUp.crestLine(td.stat2, o.value2));
  }
  LevelUp.evoHint(o);
  o.goal = p.kind === 'weapon-up' || p.kind === 'weapon-new' ? LevelUp.weaponGoal(w, o) : LevelUp.crestGoal(o);
  return o;
};

// 武器卡下面的「下一个目标」（一行，空字符串 = 没有）：★ 提示 > 觉醒 > 传说卡的专属词条
// w：已有的武器（新武器卡是 null，按 o.id 算 1 级）
LevelUp.weaponGoal = function (w, o) {
  if (o.evoHint) return '';
  var id = w ? w.id : o.id, def = w ? w.def : WEAPONS[id];
  var ev = typeof EVO !== 'undefined' && !(w && w.evo) && EVO[id];
  if (ev && TOMES[ev.tome]) {
    if (w && typeof Evo !== 'undefined' && Evo.canEvolve(w)) return '已可觉醒：去圣锻炉';
    // 只写还差的那一项：lv1 = 选了这张卡之后的等级，tl = 纹章现在的等级
    var lv1 = w ? w.level + 1 : 1, tt = LevelUp.tome(ev.tome), tl = tt ? tt.level : 0, tn = TOMES[ev.tome].name;
    if (tl >= EVO_REQ.tome) return 'Lv' + EVO_REQ.level + ' 可觉醒（' + tn + '已够）';
    if (lv1 >= EVO_REQ.level) return '觉醒还差：' + tn + ' Lv' + EVO_REQ.tome;
    return 'Lv' + EVO_REQ.level + ' 可觉醒（需要 ' + tn + ' Lv' + EVO_REQ.tome + '）';
  }
  var pk = def && def.perk, left = pk ? pk.max - ((w && w.perkN) || 0) : 0;
  if (w && left > 0 && o.rarity < 4) return '传说卡：' + Weapons.perkText(pk) + '（还能拿 ' + left + ' 次）';
  return '';
};

// 纹章卡：拿了这枚新纹章就凑齐家族三枚时，提示套装名
LevelUp.crestGoal = function (o) {
  if (o.kind !== 'tome-new' || LevelUp.tome(o.id)) return '';
  for (var i = 0; i < CREST_SETS.length; i++) {
    var cs = CREST_SETS[i];
    if (cs.members.indexOf(o.id) < 0) continue;
    var rest = cs.members.filter(function (m) { return m !== o.id; });
    if (rest.every(function (m) { return !!LevelUp.tome(m); })) return '再来一枚：' + cs.name;
  }
  return '';
};

// 超武提示：选了这张卡就满足超武条件时写「可锻造超武！」；纹章卡写它是哪把武器的超武材料
LevelUp.evoHint = function (o) {
  if (typeof EVO === 'undefined') return;
  var hit = null, mat = null;
  var tomeLv = function (id) { var t = LevelUp.tome(id); return t ? t.level : 0; };
  if (o.kind === 'weapon-up') {
    var w = Weapons.find(o.id), ev = w && !w.evo && EVO[w.id];
    if (ev && w.level < EVO_REQ.level && w.level + 1 >= EVO_REQ.level && tomeLv(ev.tome) >= EVO_REQ.tome) hit = w;
  } else if (o.kind === 'tome-up' || o.kind === 'tome-new') {
    var lv = tomeLv(o.id);
    if (lv >= EVO_REQ.tome) return;
    P.weapons.forEach(function (w2) {
      var e2 = !w2.evo && EVO[w2.id];
      if (!e2 || e2.tome !== o.id) return;
      if (lv + 1 >= EVO_REQ.tome && w2.level >= EVO_REQ.level) hit = hit || w2;
      else mat = mat || w2;
    });
  }
  if (hit) { o.lines.push('★ 可锻造超武：' + EVO[hit.id].name); o.evoHint = true; }
  else if (mat) o.lines.push('超武材料：' + mat.def.name + ' → ' + EVO[mat.id].name);
};

LevelUp.statText = function (stat, v) {
  var s = STATS[stat];
  var sign = v >= 0 ? '+' : '';
  if (s.pct) return sign + Math.round(v * 1000) / 10 + '% ' + s.name;
  return sign + (Math.round(v * 10) / 10) + ' ' + s.name;
};

// 护甲、闪避：这张卡让面板上的百分比涨多少（按现在的值算）
LevelUp.panelDelta = function (stat, v) {
  var s = STATS[stat], cur = P.st[stat] || 0;
  return s.show(cur + v) - s.show(cur);
};

// 纹章卡的一行，名字在前：「最大生命 +30」「护甲 +5%」「生命回复 +50/分钟」「宝箱价格 −4%」
LevelUp.crestLine = function (stat, v) {
  var s = STATS[stat];
  if (!s) return '';
  if (s.show) {
    var d = LevelUp.panelDelta(stat, v);
    return s.name + ' +' + (d < 0.01 ? Math.round(d * 1000) / 10 : Math.round(d * 100)) + '%';
  }
  if (stat === 'quantity') return '弹丸数量 +' + Math.round(v * 10) / 10 + '（攒满 1 就多一发）';   // Weapons.count 取整
  if (stat === 'regen') return '生命回复 +' + Math.round(v * 10) / 10 + '/分钟';
  if (stat === 'chestDisc') return '宝箱价格 −' + Math.round(v * 1000) / 10 + '%';
  if (s.pct) return s.name + ' +' + Math.round(v * 1000) / 10 + '%';
  return s.name + ' +' + Math.round(v * 10) / 10;
};

LevelUp.apply = function (o) {
  if (o.kind === 'weapon-up') Weapons.applyUpgrade(Weapons.find(o.id), o.picks);
  else if (o.kind === 'weapon-new') Weapons.give(o.id);
  else if (o.kind === 'ration') { P.heal(P.st.maxHp * 0.25); P.gold += 20 * Game.stage; }
  else if (o.kind === 'gold') P.gold += 50 * Game.stage;
  else if (TOMES[o.id]) {
    // 纹章：tome-new / tome-up，还有只给了 value 的旧调用 { kind: 'tome', id, value }（第二行按这张卡的稀有度补上）
    var td = TOMES[o.id], t = LevelUp.tome(o.id);
    if (!t) { t = { id: o.id, level: 0, value: 0, value2: 0 }; P.tomes.push(t); }
    t.level++;
    t.value = (t.value || 0) + (o.value != null ? o.value : td.val);
    t.value2 = (t.value2 || 0) + (o.value2 != null ? o.value2 : (td.val2 || 0) * RARITY_MULT[o.rarity | 0]);
    var before = {}, k;
    for (k in P.sets) before[k] = P.sets[k];
    P.recalc();
    // 刚凑齐的套装：金色提示（奖励）
    CREST_SETS.forEach(function (cs) {
      if (P.sets[cs.family] && !before[cs.family]) UI.toast('套装「' + cs.name + '」：' + cs.short, '#ffd84a');
    });
  }
};

// ---------------- 宝物 ----------------
var Items = {};
Items.byRarity = null;
// 宝物五档都用（RELIC_WEIGHTS）
Items.roll = function (minR) {
  if (!Items.byRarity) {
    Items.byRarity = [[], [], [], [], []];
    for (var id in ITEMS) Items.byRarity[ITEMS[id].rarity].push(id);
  }
  var r = Rarity.roll(minR || 0, RELIC_WEIGHTS);
  while (!Items.byRarity[r].length) r--;
  return pick(Items.byRarity[r]);
};

Items.rollOfRarity = function (r) {
  Items.roll(0);
  return pick(Items.byRarity[r]);
};

Items.give = function (id) {
  P.items[id] = (P.items[id] || 0) + 1;
  P.recalc();
};

// ---------------- 誓言石碑 / 决斗旗的奖励：纹章祝福 ----------------
// n 张纹章卡：已有的（没满级）+1 级，或者有空栏位时的新纹章；稀有度照常掷，至少 minR（新纹章是 minR）
LevelUp.crestOptions = function (n, minR) {
  var pool = [];
  P.tomes.forEach(function (t) { if (t.level < LEVEL_CAP.crest) pool.push({ kind: 'tome-up', id: t.id }); });
  if (P.tomes.length < P.st.tomeSlots) {
    Object.keys(TOMES).forEach(function (id) { if (!LevelUp.tome(id) && !LevelUp.banned[id]) pool.push({ kind: 'tome-new', id: id }); });
  }
  var out = [];
  while (out.length < n && pool.length) out.push(LevelUp.make(pool.splice(Math.floor(Math.random() * pool.length), 1)[0], minR));
  return out;
};

// 纹章祝福的三张卡（interact_guild.js 的 Guild.bless）；纹章都满级、栏位也满：一张 50×关卡 金币的卡
LevelUp.blessOptions = function () {
  var out = LevelUp.crestOptions(3, 0);
  return out.length ? out : [{ kind: 'gold', id: 'gold', rarity: 0, title: '金币', icon: '金', color: 0xffd84a, sub: '纹章都满了', lines: ['+' + 50 * Game.stage + ' 金币'] }];
};
