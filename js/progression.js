'use strict';
// ============================================================
//  成长：稀有度、升级三选一、魔典、物品、神龛属性
// ============================================================
// 稀有度颜色：普通绿、优秀蓝、稀有紫、史诗红、传说黄
var RARITY = [
  { name: '普通', color: '#5ee35e', glow: 'rgba(94,227,94,0.4)' },
  { name: '优秀', color: '#4ea8ff', glow: 'rgba(78,168,255,0.5)' },
  { name: '稀有', color: '#c46bff', glow: 'rgba(196,107,255,0.55)' },
  { name: '史诗', color: '#ff4b5a', glow: 'rgba(255,75,90,0.6)' },
  { name: '传说', color: '#ffc928', glow: 'rgba(255,201,40,0.7)' }
];

var Rarity = {};
// 基础权重 70/15/6/3/1.5；幸运按对数递减地把概率推向高稀有度
Rarity.roll = function (minR, weightsIn) {
  var luck = Math.max(0, P.st.luck || 0);
  var bonus = Math.log(1 + luck) * 1.5;
  var w = (weightsIn || [70, 15, 6, 3, 1.5]).slice();
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
  P.weapons.forEach(function (w) { if (w.level < 40) pool.push({ kind: 'weapon-up', id: w.id, weight: 3 }); });
  if (P.weapons.length < P.st.weaponSlots) {
    Object.keys(WEAPONS).forEach(function (id) { if (!Weapons.find(id) && !LevelUp.banned[id]) pool.push({ kind: 'weapon-new', id: id, weight: 0.35 }); });
  }
  P.tomes.forEach(function (t) { if (t.level < 99) pool.push({ kind: 'tome-up', id: t.id, weight: 2.4 }); });
  if (P.tomes.length < P.st.tomeSlots) {
    Object.keys(TOMES).forEach(function (id) { if (!LevelUp.tome(id) && !LevelUp.banned[id]) pool.push({ kind: 'tome-new', id: id, weight: 0.3 }); });
  }
  var out = [];
  while (out.length < 3 && pool.length) {
    var tot = 0;
    pool.forEach(function (p) { tot += p.weight; });
    var r = Math.random() * tot, sel = pool.length - 1;
    for (var i = 0; i < pool.length; i++) { r -= pool[i].weight; if (r <= 0) { sel = i; break; } }
    out.push(LevelUp.make(pool.splice(sel, 1)[0]));
  }
  return out;
};

LevelUp.make = function (p) {
  var rarity = Rarity.roll();
  var o = { kind: p.kind, id: p.id, rarity: rarity, lines: [] };
  if (p.kind === 'weapon-up') {
    var w = Weapons.find(p.id);
    o.title = w.def.name; o.icon = w.def.icon; o.color = w.def.color; o.sub = '等级 ' + w.level + ' → ' + (w.level + 1);
    o.picks = Weapons.rollUpgrade(w, rarity);
    o.lines = o.picks.map(Weapons.upgradeText);
  } else if (p.kind === 'weapon-new') {
    var def = WEAPONS[p.id];
    o.rarity = 0;
    o.title = def.name; o.icon = def.icon; o.color = def.color; o.sub = '新武器'; o.lines = [def.desc];
  } else {
    var td = TOMES[p.id], t = LevelUp.tome(p.id);
    if (!t) rarity = o.rarity = 0;     // 新魔典：直接获得 1 级普通
    o.title = td.name; o.icon = td.icon; o.color = td.color;
    o.sub = t ? '等级 ' + t.level + ' → ' + (t.level + 1) : '新魔典';
    o.value = td.val * RARITY_MULT[rarity];
    if (td.stat === 'chaos') o.lines = ['随机提升一项属性 · ×' + RARITY_MULT[rarity]];
    else if (td.mult) o.lines = ['伤害 ×' + (1 + o.value).toFixed(2)];
    else o.lines = [LevelUp.statText(td.stat, o.value)];
    if (!t) o.lines.push(td.desc);
  }
  LevelUp.evoHint(o);
  return o;
};

// 超武提示：选了这张卡就满足超武条件时写「可锻造超武！」；魔典卡写它是哪把武器的超武材料
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

LevelUp.apply = function (o) {
  if (o.kind === 'weapon-up') Weapons.applyUpgrade(Weapons.find(o.id), o.picks);
  else if (o.kind === 'weapon-new') Weapons.give(o.id);
  else {
    var td = TOMES[o.id], t = LevelUp.tome(o.id);
    if (!t) { t = { id: o.id, level: 0, value: 0, mult: 1 }; P.tomes.push(t); }
    t.level++;
    if (td.stat === 'chaos') {
      var c = pick(CHAOS_POOL);
      P.mods.push({ stat: c[0], value: c[1] * o.value });
      UI.toast('混沌：' + LevelUp.statText(c[0], c[1] * o.value), Kit.color('gold'));
    } else if (td.mult) t.mult *= 1 + o.value;
    else t.value += o.value;
    P.recalc();
  }
};

// ---------------- 物品 ----------------
var Items = {};
Items.byRarity = null;
// 物品只有 普通/稀有/史诗/传说 四档
Items.roll = function (minR) {
  if (!Items.byRarity) {
    Items.byRarity = [[], [], [], [], []];
    for (var id in ITEMS) Items.byRarity[ITEMS[id].rarity].push(id);
  }
  var r = Rarity.roll(minR || 0, [70, 0, 15, 6, 1.5]);
  if (r === 1) r = 2;
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

// ---------------- 充能神龛 ----------------
// 普通稀有度的数值；最大生命 15/18/21/24/30 正好是 15 × 稀有度倍率
var SHRINE_STATS = [
  ['damage', 0.12], ['shield', 5], ['regen', 20], ['pickup', 0.2], ['maxHp', 15], ['critChance', 0.05], ['atkSpeed', 0.06],
  ['size', 0.08], ['moveSpeed', 0.06], ['armor', 0.06], ['evasion', 0.05], ['luck', 0.05], ['xpGain', 0.06], ['critDmg', 0.15],
  ['projSpeed', 0.1], ['duration', 0.1], ['goldGain', 0.1], ['eliteDmg', 0.1], ['quantity', 0.5], ['difficulty', 0.08]
];

LevelUp.shrineOptions = function (golden) {
  var keys = SHRINE_STATS.slice(), out = [];
  var bonus = 1 + 0.075 * (P.items.wrench || 0);
  for (var i = 0; i < 3; i++) {
    var s = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    var r = golden ? 4 : Rarity.roll();
    var v = s[1] * RARITY_MULT[r] * bonus;
    out.push({ kind: 'stat', stat: s[0], value: v, rarity: r, title: STATS[s[0]].name, icon: '神', lines: [LevelUp.statText(s[0], v)].concat(s[0] === 'difficulty' ? ['敌人更多更强，奖励更多'] : []), color: 0x7ef0ff });
  }
  return out;
};
