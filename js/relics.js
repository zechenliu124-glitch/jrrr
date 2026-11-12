'use strict';
// ============================================================
//  宝物（第 6 块）：登记、分派、卡片文字、小地图标记 + a 部分的 17 件
//  约定：每件宝物一个 spec（Relic.def(id, spec)，字段都可以不写）：
//    num 数值（= tables.json items[].numbers，代码里不写字面数字）、card(ctx) 卡上 {x} 的值（ctx = { k 件数, lv, dmg }）、
//    reset 开局（只设 Passive 上的数，名字 rel 开头）、clear 开局 / 换关 / 回菜单（藏模型、清列表）、
//    update(dt, n)、stats(st, n)、hitMult(w, e, n)、afterHit(w, e, dealt, crit, n)、atkMult(w, n)、onCrit(w, e, dealt, n)、
//    onLevel(n)、onKill(e, n)、onChest(n)、onUpgrade(w, n)、onFire(w, n)、onAirJump(n)、onPickup(kind, v, n)、
//    healPickupMult(n)、hurtCap(dmg, n)、mxMod(kind, key, v, n)、render(put)
//  n = 这件有几份（钩子只叫拥有的宝物，n ≥ 1）；效果真的发生时 Relic.count(id)（测试数）；声音 Relic.emit(名字)
//  b 部分（命中时的战斗宝物）在 relics_b.js，c 部分（移动和地图上的）在 relics_c.js，只用这里的约定
//  载入：passives_c.js 之后、ui.js 之前（UI、Kit、Settings、Content、SFX、Game 只在函数里用）
// ============================================================
var Relic = { R: {}, L: {}, fired: {}, _ref: null, marks: {} };
Relic.HOOKS = ['update', 'stats', 'hitMult', 'afterHit', 'atkMult', 'onCrit', 'onLevel', 'onKill', 'onChest', 'onUpgrade',
  'onFire', 'onAirJump', 'onPickup', 'healPickupMult', 'hurtCap', 'mxMod', 'render'];
Relic.def = function (id, spec) { spec.id = id; Relic.R[id] = spec; Relic._ref = null; return spec; };
Relic.n = function (id) { return (P.items && P.items[id]) | 0; };
Relic.has = function (id) { return Relic.n(id) > 0; };

// 每个钩子一张表：[spec, 件数, spec, 件数…]（按 P.items 的键顺序）；P.recalc 里重建（宝物有变化一定会 recalc）
Relic.sync = function () {
  var L = {}, i;
  for (i = 0; i < Relic.HOOKS.length; i++) L[Relic.HOOKS[i]] = [];
  for (var id in P.items) {
    var s = Relic.R[id], n = P.items[id] | 0;
    if (!s || n <= 0) continue;
    for (i = 0; i < Relic.HOOKS.length; i++) if (s[Relic.HOOKS[i]]) L[Relic.HOOKS[i]].push(s, n);
  }
  Relic.L = L; Relic._ref = P.items;
  // 已经没有的宝物（炼金坩埚熔掉、测试换掉）：它的小地图标记拿掉
  for (var key in Relic.marks) if (!Relic.has(Relic.marks[key].id)) Relic.unmark(key);
};
Relic.list = function (h) { if (Relic._ref !== P.items) Relic.sync(); return Relic.L[h]; };   // P.items 整个换掉（继续游戏）也认

// ---------------- 分派：每个钩子一个，参数之后是 n ----------------
Relic.update = function (dt) { var l = Relic.list('update'); for (var i = 0; i < l.length; i += 2) l[i].update(dt, l[i + 1]); };
Relic.onLevel = function () { var l = Relic.list('onLevel'); for (var i = 0; i < l.length; i += 2) l[i].onLevel(l[i + 1]); };
Relic.onKill = function (e) { var l = Relic.list('onKill'); for (var i = 0; i < l.length; i += 2) l[i].onKill(e, l[i + 1]); };
Relic.onChest = function () { var l = Relic.list('onChest'); for (var i = 0; i < l.length; i += 2) l[i].onChest(l[i + 1]); };
Relic.onUpgrade = function (w) { var l = Relic.list('onUpgrade'); for (var i = 0; i < l.length; i += 2) l[i].onUpgrade(w, l[i + 1]); };
Relic.onFire = function (w) { var l = Relic.list('onFire'); for (var i = 0; i < l.length; i += 2) l[i].onFire(w, l[i + 1]); };
Relic.onAirJump = function () { var l = Relic.list('onAirJump'); for (var i = 0; i < l.length; i += 2) l[i].onAirJump(l[i + 1]); };
Relic.onPickup = function (kind, v) { var l = Relic.list('onPickup'); for (var i = 0; i < l.length; i += 2) l[i].onPickup(kind, v, l[i + 1]); };
Relic.onCrit = function (w, e, dealt) { var l = Relic.list('onCrit'); for (var i = 0; i < l.length; i += 2) l[i].onCrit(w, e, dealt, l[i + 1]); };
Relic.afterHit = function (w, e, dealt, crit) { var l = Relic.list('afterHit'); for (var i = 0; i < l.length; i += 2) l[i].afterHit(w, e, dealt, crit, l[i + 1]); };
Relic.render = function (put) { var l = Relic.list('render'); for (var i = 0; i < l.length; i += 2) l[i].render(put, l[i + 1]); };
Relic.hitMult = function (w, e) { var l = Relic.list('hitMult'), m = 1; for (var i = 0; i < l.length; i += 2) m *= l[i].hitMult(w, e, l[i + 1]); return m; };
Relic.atkMult = function (w) { var l = Relic.list('atkMult'), m = 1; for (var i = 0; i < l.length; i += 2) m *= l[i].atkMult(w, l[i + 1]); return m; };
Relic.healPickupMult = function () { var l = Relic.list('healPickupMult'), m = 1; for (var i = 0; i < l.length; i += 2) m *= l[i].healPickupMult(l[i + 1]); return m; };
Relic.hurtCap = function (dmg) { var l = Relic.list('hurtCap'); for (var i = 0; i < l.length; i += 2) dmg = l[i].hurtCap(dmg, l[i + 1]); return dmg; };
Relic.stats = function (st) { Relic.sync(); var l = Relic.L.stats; for (var i = 0; i < l.length; i += 2) l[i].stats(st, l[i + 1]); };
// 开局（Passive.reset 的最后）：每件的 clear + reset（拥有与否）；换关 / 回菜单（Passive.clear）：每件的 clear
Relic.reset = function () {
  Relic.fired = {};
  Relic.unmarkAll();
  for (var id in Relic.R) { var s = Relic.R[id]; if (s.clear) s.clear(); if (s.reset) s.reset(); }
};
Relic.clear = function () { Relic.unmarkAll(); for (var id in Relic.R) if (Relic.R[id].clear) Relic.R[id].clear(); };
Relic.count = function (id) { Relic.fired[id] = (Relic.fired[id] || 0) + 1; };
Relic.emit = function (name, x, z) { if (Passive.emit) Passive.emit('r_' + name, x, z); };
// 伤害：(基础 + 每级 × 等级) × 伤害倍率 × 件数（perCopy false 不乘件数）；不暴击、不走 Weapons.hit
Relic.dmg = function (num, n) { return (num.dmgBase + (num.dmgPerLv || 0) * P.level) * P.st.damage * (num.perCopy === false ? 1 : n); };
// 卡上的伤害（按卡片的 ctx：k 件、lv 级、dmg 伤害倍率）
Relic.dmgAt = function (num, ctx) { return (num.dmgBase + (num.dmgPerLv || 0) * ctx.lv) * ctx.dmg * (num.perCopy === false ? 1 : ctx.k); };
// 每 gap 秒最多记一次（「生效期间每秒记一次」的宝物用；o 是 spec 自己的小对象）
Relic.countEvery = function (id, o, gap) { if (!(o.cT > Passive.clock)) { o.cT = Passive.clock + gap; Relic.count(id); } };
// 减弱动态效果（系统设置或游戏里的开关）
Relic.rm = function () { return typeof Settings !== 'undefined' && !!Settings.rm && !!Settings.rm(); };

// ---------------- 卡片文字 ----------------
// 卡上不能从中间折开的词（Kit.WORDS 在 kit.js；kit.js 在这个文件后面载入，第一次排卡片时才加进去）
Relic.WORDS = ['小地图', '经验水晶', '回血道具', '额外跳跃', '纹章栏位', '武器栏位', '升级卡', '亡灵', '铁蒺藜', '拾取范围', '猎犬', '渡鸦'];
Relic.wordsDone = false;
Relic.words = function () {
  if (Relic.wordsDone || typeof Kit === 'undefined' || !Kit.WORDS) return;
  Relic.wordsDone = true;
  for (var i = 0; i < Relic.WORDS.length; i++) if (Kit.WORDS.indexOf(Relic.WORDS[i]) < 0) Kit.WORDS.push(Relic.WORDS[i]);
  Kit.wordsCache = null;   // Kit.wordList 重新收一遍
};
// ITEMS[id].card 里的 {x} 换成现在的值：extra = 1 是要拿的那一件（宝箱、行商、升级卡），0 是已经有的（暂停、坩埚「放进去」）
Relic.cardText = function (id, extra) {
  Relic.words();
  var it = ITEMS[id];
  if (!it) return '';
  if (!it.card) return it.desc || '';
  var s = Relic.R[id], st = P.st || {};
  var ctx = { k: Math.max(1, Relic.n(id) + (extra || 0)), lv: P.level || 1, dmg: st.damage != null ? st.damage : 1 };
  var v = s && s.card ? s.card(ctx) || {} : {};
  return it.card.replace(/\{(\w+)\}/g, function (m, name) {
    var x = v[name];
    if (x == null) return m;
    if (name === 'dmg') return typeof Kit !== 'undefined' && Kit.num ? Kit.num(x) : String(Math.round(x));
    return String(x);
  });
};

// ---------------- 小地图标记（望远镜、行军图）：Content.addMarker，范围外 Content 画边上的箭头 ----------------
// key = '宝物 id:名字'；look = { color, shape, size, arrow }，color / size 可以是函数（getter：小地图每次画都现算，闪动不用每帧更新）
Relic.mark = function (key, o, look) {
  if (typeof Content === 'undefined' || !Content.addMarker || !o) return null;
  var r = Relic.marks[key];
  // 换关时 Content.clearStage 清空了列表，或者目标换了：重新加
  if (r && (r.m.o !== o || Content.mm.indexOf(r.m) < 0)) { Content.removeMarker(r.m); r = null; }
  if (r) return r.m;
  var fc = typeof look.color === 'function', fs = typeof look.size === 'function';
  var m = Content.addMarker(o, fc ? '#ffffff' : look.color, look.shape, fs ? 4 : look.size, look.arrow);
  if (fc) Object.defineProperty(m, 'color', { get: look.color, configurable: true, enumerable: true });
  if (fs) Object.defineProperty(m, 'size', { get: look.size, configurable: true, enumerable: true });
  if (look.arrowColor) m.arrowColor = look.arrowColor;   // 范围外的箭头另用一种颜色（不写就和图标一样）
  Relic.marks[key] = { id: key.split(':')[0], m: m };
  return m;
};
Relic.unmark = function (key) {
  var r = Relic.marks[key];
  if (!r) return;
  delete Relic.marks[key];
  if (typeof Content !== 'undefined' && Content.removeMarker) Content.removeMarker(r.m);
};
Relic.unmarkAll = function () { for (var key in Relic.marks) Relic.unmark(key); };

// ---------------- 给别的文件用的几个问题 ----------------
// 平安符（P.hurt 的死亡分支，猫的命用完以后）：返回 true = 挡下了
Relic.talisman = function (src) {
  var s = Relic.R.talisman;
  return !!(s && Relic.has('talisman') && s.save(src));
};
// 旧箭袋：这次出手多几发（Weapons.fire）
Relic.extraShots = function (w) {
  var s = Relic.R.quiver;
  if (!s || !w || !w.qArm || !Relic.has('quiver') || s.num.types.indexOf(w.def.type) < 0) return 0;
  return 1;
};
// 骑士手册：升级时多几张卡（LevelUp.options）
Relic.extraCards = function () {
  var s = Relic.R.manual;
  if (!s) return 0;
  var k = Math.min(s.num.max, Relic.n('manual')) * s.num.extra;
  if (k > 0) Relic.count('manual');
  return k;
};
// 锻造图纸：武器升级卡最低的稀有度（LevelUp.minWeaponRarity）
Relic.minWeaponRarity = function () {
  var s = Relic.R.forgeplan;
  if (!s || !Relic.has('forgeplan')) return 0;
  Relic.count('forgeplan');
  return s.num.min;
};

// ---------------- 载入时装上（这些文件都在前面载入了） ----------------
// 石中剑：所有武器 Lv6 就能觉醒（EVO_REQ.level 变成 getter，读它的地方都不用改）
if (typeof EVO_REQ !== 'undefined') (function () {
  var lv0 = EVO_REQ.level;
  Object.defineProperty(EVO_REQ, 'level', { configurable: true, enumerable: true,
    get: function () { var s = Relic.R.stoneblade; return lv0 - (s && Relic.has('stoneblade') ? s.num.evoLess : 0); } });
})();
// MX.mod 的监听：载入时登记一次（骑士的那个先登记，铁匠骑士 × 铁匠的徽牌 = 两个都乘）
if (typeof MX !== 'undefined' && MX.onMod) MX.onMod(function (kind, key, v) {
  var l = Relic.list('mxMod'), r;
  for (var i = 0; i < l.length; i += 2) { var x = l[i].mxMod(kind, key, v, l[i + 1]); if (x !== undefined) { v = x; r = x; } }
  return r;
});
// 四张卡（骑士手册、行商）：宽屏、竖屏和 iPad 分屏（590 宽）都是两张一排 2 × 2，不会剩一张单独一行（不改 style.css）；
// 升级的四张卡在更窄的 iPad 50 / 50 分屏（10.2 寸 535 × 810、mini 约 558 × 744）也是 2 × 2（卡宽 225 像素起；升级卡的字短），
// 不然第四张压在重抽 / 放逐 / 跳过那一行下面。行商的宝物卡字多，580 以下照旧一列滚动；520 以下（侧拉、手机竖屏）都一列
if (typeof document !== 'undefined' && document.head && !document.getElementById('relicCss')) (function () {
  var st = document.createElement('style');
  st.id = 'relicCss';
  var four = function (sel) { return sel + ' > .card:first-child:nth-last-child(4), ' + sel + ' > .card:first-child:nth-last-child(4) ~ .card'; };
  st.textContent = '@media (min-width: 520px) { ' + four('#levelCards') + ' { flex: 0 1 auto; ' +
    'width: min(280px, calc((100% - 14px) / 2)); width: min(280px, round(down, calc((100% - 14px) / 2), 1px)); } }\n' +
    '@media (min-width: 580px) { ' + four('.cards') + ' { flex: 0 1 auto; ' +
    'width: min(280px, calc((100% - 14px) / 2)); width: min(280px, round(down, calc((100% - 14px) / 2), 1px)); } }\n' +
    '.card:nth-child(4) { animation-delay: 0.18s; }\n' +
    '@media (min-width: 520px) { #levelCards:has(> .card:nth-child(4)) { max-width: 578px; margin: 0 auto; } }';
  document.head.appendChild(st);
})();

// ============================================================
//  a 部分的 17 件
// ============================================================

// ---------------- 磨刀石：之后武器每升 1 级，这把武器的伤害再 +3%（加法，第 13 块 P9） ----------------
// 原来每次升级乘 1.03^n：3 块磨刀石、20 级的武器约 ×5.4。现在加起来算：这把武器记一个加成 w.whB（每次升级 + 0.03·n），
// 伤害 = 不算磨刀石的伤害 w.whR × (1 + w.whB)。w.whD 是上次设下的伤害：两次升级之间别处加的（升级的成长、超武）都算进 w.whR。
// w.whR / w.whB / w.whD 不存档：读档以后第一次升级从当时的伤害重新起算（之前的加成留在伤害里，不会丢）。
Relic.def('whetstone', {
  num: { per: 0.03 },
  card: function (c) { return { p: Math.round(this.num.per * c.k * 100) }; },
  onUpgrade: function (w, n) {
    if (!w || !w.s) return;
    var d = w.s.damage || 0;
    var raw = w.whD === undefined ? d : w.whR + (d - w.whD);
    w.whB = (w.whD === undefined ? 0 : w.whB) + this.num.per * n;
    w.whR = raw;
    w.s.damage = w.whD = raw * (1 + w.whB);
    Relic.count('whetstone');
  }
});

// ---------------- 旧箭袋：射击、弹跳、回旋（和扇形飞刀）每第 4 次攻击多一发 ----------------
// 每把武器自己数（w.qN、w.qArm，不存档）；Relic.extraShots 在 Weapons.fire 里加上这一发
Relic.def('quiver', {
  num: { every: 4, min: 2, types: ['shot', 'bounce', 'boomerang', 'shotgun'] },
  every: function (n) { return Math.max(this.num.min, this.num.every + 1 - n); },
  card: function (c) { return { n: this.every(c.k) }; },
  onFire: function (w, n) {
    if (!w || this.num.types.indexOf(w.def.type) < 0) return;
    if (w.qArm) { w.qArm = 0; Relic.count('quiver'); return; }
    w.qN = (w.qN | 0) + 1;
    if (w.qN >= this.every(n) - 1) { w.qArm = 1; w.qN = 0; }
  }
});

// ---------------- 硬面包：回血道具多回 50%，再给 6 秒 20 点护盾 ----------------
Relic.def('hardtack', {
  num: { heal: 0.5, shield: 20, t: 6 },
  card: function (c) { return { p: Math.round(this.num.heal * 100 * c.k), n: this.num.shield * c.k }; },
  healPickupMult: function (n) { return 1 + this.num.heal * n; },
  onPickup: function (kind, v, n) {
    if (kind !== 'heal') return;
    var add = this.num.shield * n;
    P.addTemp('shield', add, this.num.t, 'relic:hardtack');
    P.shield = Math.min(P.st.shield + P.shieldX, P.shield + add);
    Relic.count('hardtack');
    Relic.emit('shield');
    FX.flash(P.pos.x, P.pos.y + 1.1, P.pos.z, 2.6, 0xffb040, 0.35, 0);
    for (var i = 0; i < 6; i++) { var a = i / 6 * TAU; FX.part(P.pos.x + Math.cos(a) * 0.6, P.pos.y + 0.6, P.pos.z + Math.sin(a) * 0.6, Math.cos(a) * 0.6, 2.4, Math.sin(a) * 0.6, 0xffc860, 0.16, 0.7, 0); }
  }
});

// ---------------- 渡鸦羽毛：每捡 25 颗经验水晶放一只渡鸦（排队放，一次最多 6 只在天上） ----------------
(function () {
  var gap = 0;
  Relic.def('ravenfeather', {
    num: { every: 25, dmgBase: 30, queue: 8, gap: 0.2, max: 6, homing: 7, life: 3, spd: 12 },
    card: function (c) { return { dmg: Relic.dmgAt(this.num, c) }; },
    reset: function () { Passive.relRavN = 0; Passive.relRavQ = 0; },
    clear: function () { gap = 0; },
    onPickup: function (kind, v, n) {
      if (kind !== 'xp') return;
      Passive.relRavN++;
      if (Passive.relRavN >= this.num.every) { Passive.relRavN -= this.num.every; Passive.relRavQ = Math.min(this.num.queue, Passive.relRavQ + 1); }
    },
    update: function (dt, n) {
      gap -= dt;
      if (Passive.relRavQ <= 0 || gap > 0) return;
      var N = this.num;
      var made = Weapons.spawnSouls(P.pos.x, P.pos.y + 1.6, P.pos.z, 1, { kind: 'crow', spd: N.spd, vy: 4, homing: N.homing, life: N.life, r: 0.55,
        dmg: Relic.dmg(N, n), tag: 'crow', max: N.max, onHit: this.hit });
      if (!made) return;   // 天上已经 6 只：排着队
      Passive.relRavQ--;
      gap = N.gap;
      Relic.emit('caw');
    },
    // 渡鸦扑中：一小团黑紫色的羽毛
    hit: function (p, e) {
      for (var i = 0; i < 6; i++) FX.part(p.x, p.y, p.z, rand(-2.5, 2.5), rand(1, 3.5), rand(-2.5, 2.5), i % 2 ? 0x5a4a7a : 0x2a2630, rand(0.12, 0.2), rand(0.4, 0.7), 6);
      Relic.count('ravenfeather');
    }
  });
})();

// ---------------- 云纹靴：额外跳跃 +1（属性）；空中再跳时脚下炸开一圈风 ----------------
Relic.def('cloudboots', {
  num: { r: 3, dmgBase: 10, kb: 9 },
  card: function (c) { return { n: c.k, dmg: Relic.dmgAt(this.num, c) }; },
  onAirJump: function (n) {
    var N = this.num, x = P.pos.x, y = P.pos.y, z = P.pos.z, d0 = Relic.dmg(N, n);
    Enemies.inRadius(x, z, N.r, function (e) {
      if (e.prop || Math.abs(e.y - y) > 3) return;
      var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      Enemies.damage(e, d0, 0, dx / d * N.kb, dz / d * N.kb);
    });
    FX.ring(x, y - 0.2, z, N.r, 0xeaf4ff, 0.3);
    // 8 颗白色小风团往外旋
    for (var i = 0; i < 8; i++) { var a = i / 8 * TAU; FX.part(x + Math.cos(a) * 0.5, y - 0.1, z + Math.sin(a) * 0.5, Math.cos(a + 0.8) * 6, 0.6, Math.sin(a + 0.8) * 6, 0xeaf4ff, 0.14, 0.4, 0); }
    Relic.emit('gust', x, z);
    Relic.count('cloudboots');
  }
});

// ---------------- 圣剑鞘：生命回复 +40（属性）；一下超过最大生命 20% 的部分减半 ----------------
Relic.def('scabbard', {
  num: { cap: 0.2, keep: 0.5 },
  card: function (c) { return { n: ITEMS.scabbard.stats.regen * c.k }; },
  hurtCap: function (dmg, n) {
    var c = this.num.cap * P.st.maxHp;
    if (dmg <= c) return dmg;
    Relic.count('scabbard');
    return c + (dmg - c) * this.num.keep;
  }
});

// ---------------- 平安符：致命一击时挡下，生命回到一半、1 秒无敌（每件一次） ----------------
Relic.def('talisman', {
  num: { hp: 0.5, invuln: 1 },
  card: function (c) { return { n: Math.max(0, c.k - (Passive.relTalUsed | 0)) }; },
  reset: function () { Passive.relTalUsed = 0; },
  save: function (src) {
    if (Relic.n('talisman') - Passive.relTalUsed <= 0) return false;
    Passive.relTalUsed++;
    P.hp = Math.max(1, this.num.hp * P.st.maxHp);
    P.invuln = this.num.invuln;
    var x = P.pos.x, y = P.pos.y, z = P.pos.z, gold = Kit.color('gold');
    FX.burst(x, y + 1, z, 18, 0xe83a3a, 7, 0.17);   // 红金两色的小火星（不是大块）
    FX.burst(x, y + 1.2, z, 10, 0xffd84a, 5, 0.15);
    FX.flash(x, y + 1.1, z, 2.4, 0xffd84a, 0.3, 0);
    FX.ring(x, y, z, 2.5, 0xffd84a, 0.45);
    FX.text(x, y + 2.6, z, '平安！', gold, 1.3);
    UI.toast('平安符替你挡了一下！', gold);
    Relic.emit('talisman', x, z);
    Relic.count('talisman');
    return true;
  }
});

// ---------------- 骑士手册：升级四选一（Relic.extraCards；数字键 4、2 × 2 的卡片在 ui.js / main.js / 上面的样式） ----------------
Relic.def('manual', { num: { extra: 1, max: 1 } });

// ---------------- 望远镜：拾取范围 +25%（属性）；小地图标出最近的还没打开的宝箱（多远都标，范围外在边上画箭头） ----------------
(function () {
  var t = 0, has = false, cnt = {}, EVERY = 0.5;   // 每 0.5 秒重新找一次最近的宝箱
  var rm = function () { return Relic.rm(); };
  // 范围外的箭头是奶油色 #fff2a8：和行军图圣锻炉的金色箭头（#ffbf2e）、急件的金色信封分得开
  var LOOK = { shape: 'square', arrow: true, arrowColor: '#fff2a8',
    color: function () { return this.o && this.o.free ? '#fff2a8' : '#ffc928'; },   // 和 UI.drawMinimap 的宝箱一样的颜色，大一号
    size: function () { return rm() ? 4.5 : 4.5 + 0.8 * Math.sin(Game.realTime * 6); } };
  Relic.def('spyglass', {
    card: function (c) { return { p: Math.round(ITEMS.spyglass.stats.pickup * 100 * c.k) }; },
    clear: function () { t = 0; has = false; cnt = {}; },
    nearest: function () {
      var best = null, bd = Infinity, L = Interact.list;
      for (var i = 0; i < L.length; i++) {
        var o = L[i];
        if (o.kind !== 'chest' || o.used) continue;
        var d = dist2(o.x, o.z, P.pos.x, P.pos.z);
        if (d < bd) { bd = d; best = o; }
      }
      return best;
    },
    update: function (dt, n) {
      t -= dt;
      if (t <= 0) {
        t = EVERY;
        var o = this.nearest();
        if (o) Relic.mark('spyglass:chest', o, LOOK); else Relic.unmark('spyglass:chest');
        has = !!o;
      }
      if (has) Relic.countEvery('spyglass', cnt, 1);
    }
  });
})();

// ---------------- 行军图：每关一开始标出烽火台（found）和圣锻炉 ----------------
(function () {
  var told = null, t = 0, EVERY = 0.5;   // 圣锻炉每 0.5 秒看一次
  var LOOK = { shape: 'diamond', arrow: true,   // 和圣锻炉自己的小地图图标一模一样（范围外变成边上的箭头）
    color: function () { return Interact.KINDS.holyforge.mapIcon(this.o).color; },
    size: function () { return Interact.KINDS.holyforge.mapIcon(this.o).size; } };
  Relic.def('warmap', {
    clear: function () { t = 0; },
    reset: function () { told = null; },
    update: function (dt, n) {
      var pt = Interact.portal;
      if (pt && !pt.found && !pt.used) pt.found = true;   // 「发现了烽火台！」那句不出（它只在没找到时说）
      if (pt && told !== pt) {
        told = pt;
        UI.toast('行军图：烽火台已标出', Kit.color('goldL'));
        Relic.count('warmap');
      }
      t -= dt;
      if (t > 0) return;
      t = EVERY;
      var f = typeof Evo !== 'undefined' && Evo.liveForge ? Evo.liveForge() : null;
      if (f && Interact.KINDS.holyforge) Relic.mark('warmap:forge', f, LOOK); else Relic.unmark('warmap:forge');
    }
  });
})();

// ---------------- 石中剑：开局武器 ×1.5；所有武器 Lv6 就能觉醒（上面的 EVO_REQ getter） ----------------
(function () {
  var cnt = {};
  Relic.def('stoneblade', {
    num: { mult: 0.5, evoLess: 2 },
    card: function (c) { return { x: (1 + this.num.mult * c.k).toFixed(1) }; },
    clear: function () { cnt = {}; },
    hitMult: function (w, e, n) {
      if (!w || !P.char || w.id !== P.char.weapon) return 1;   // 觉醒以后 id 不变，照样算
      Relic.countEvery('stoneblade', cnt, 1);
      return 1 + this.num.mult * n;
    }
  });
})();

// ---------------- 锻造图纸：武器升级卡至少是稀有（Relic.minWeaponRarity） ----------------
Relic.def('forgeplan', { num: { min: 2 } });

// ---------------- 猎犬哨：猎犬跟着你（每件一只，最多 3 只），每 1.5 秒扑咬附近的敌人 ----------------
// 不是弹丸：每只狗是闭包里的一个对象，画的时候用 hound / hound_b 两个实例网格（Weapons.render 里的 Relic.render）
(function () {
  var dogs = [], lx = null, lz = 0, goT = 0;   // lx / lz：上一帧骑士的位置（按真的位移算骑士跑多快）；goT：上一只狗扑出去的时间
  var barkT = -1e9;   // 上一声「汪」的时间：几只狗共用，最多 3 秒叫一声，别的扑咬不出声
  // 跟随的位置 [往左, 比 follow 再往后]：右边、左边、右边再外面一点，都只比骑士靠后 0.3~1 米（follow 2.2 − 1.9 / 1.6 / 1.2）。
  // 跟拍镜头在骑士身后几米：狗跟在正后方会挡在镜头和骑士之间、在画面下沿变得很大，所以跟在两边、和骑士差不多远
  var SLOT = [[-1.7, -1.9], [1.7, -1.6], [-3.0, -1.2]];
  // 狗没有碰撞：靠墙 / 树走时这一边的位置会在墙里。那就换到空的那一边，一条一条往外排（1.7 / 3.0 / 3.4 米）；
  // 第三条和骑士齐平、稍微靠前（再往后、往外就离镜头太近，在画面角上变得很大）；两边都挡住才退回骑士身后（第 6 块原来的位置，再不行就正后方排成一列）
  var LANE = [[1.7, -1.9, -1.6], [3.0, -1.2, -1.2], [3.4, -2.4, -2.4]];   // [往外, 右边往后, 左边往后]
  var BACK = [[-1.1, 0], [1.1, 0.3]];
  var PAD = 0.4, PAD_BACK = 0.8;   // 狗中心离墙 / 树至少这么远；换回更好的位置时要更空一点（不在两个位置之间来回跳）
  var alt = [], yRef = 0;          // alt[i]：第 i 只狗上一帧用的是第几个候选；yRef：骑士脚下的地面高度
  // side[i]：第 i 只狗要待的那一边（0 = SLOT 里往右、1 = 往左；没记就按 SLOT）。骑士跑着时狗已经在另一边（转身以后、被墙赶过去以后）
  // 就留在那一边，不从骑士身后、镜头前面穿回去；骑士站住 0.6 秒再各回各的（终检 R1：换边）
  var side = [], idleT = 0, IDLE = 0.6;
  // 自己那一边被墙挡住不到 HOLD 秒（墙角、一根柱子、一小段矮墙）：骑士在跑就先不换边，狗贴着墙滑过去
  var holdT = [], HOLD = 0.3, knV = 0;

  // L 里离 (x, z) 不到 pad 的第一个东西（没有就 null）；hard：只看墙 / 台子（盒子），树、石头、罐子（圆）不算
  var hitAt = function (L, x, z, pad, hard) {
    for (var i = 0; i < L.length; i++) {
      var o = L[i], r;
      if (o.kind === 'circle') {
        if (hard || o.top != null && o.top <= yRef + 0.5) continue;         // 矮石头：狗站在上面
        r = (o.r || 0) + pad;                                               // 碰撞圈（o.vis 是模型最远的一点，石头往大多数方向都没那么宽）
        if (dist2(x, z, o.x, o.z) < r * r) return o;
      } else if (o.kind !== 'ramp') {
        if (o.top <= yRef + 0.5 || o.bottom != null && o.bottom >= yRef + 1.5) continue;   // 矮台子能站上去、高处的悬空平台在头顶
        if (x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad) return o;
      }
    }
    return null;
  };
  // 罐子、宝箱、火药桶不在 W.grid 里：每 0.25 秒把骑士 24 米以内还在场上的几个当成圆（对象复用，不每帧新建）
  var props = [], PROP_R = { pot: 0.45, chest: 0.6, powderkeg: 0.45 }, propT = 0;
  var findProps = function (dt) {
    propT -= dt;
    if (propT > 0) return;
    propT = 0.25;
    var L = typeof Interact !== 'undefined' && Interact.list || [], n = 0, i, o, q;
    for (i = 0; i < L.length; i++) {
      o = L[i];
      if (!PROP_R[o.kind] || o.used || !o.mesh || !o.mesh.parent || dist2(o.x, o.z, P.pos.x, P.pos.z) > 576) continue;
      q = props[n] || (props[n] = { kind: 'circle', x: 0, z: 0, r: 0 });
      q.x = o.x; q.z = o.z; q.r = o.kind === 'pot' && o.big ? 0.72 : PROP_R[o.kind]; n++;
    }
    props.length = n;
    // 第 3 关只有外观的占地（W.visExtra.boxes 有好几百个）：只留骑士 32 米以内的（狗离骑士 30 米以上直接回到身边）
    var V = W.visExtra ? W.visExtra.boxes : [];
    for (i = 0, n = 0; i < V.length; i++) { o = V[i]; if (o.x1 > P.pos.x - 32 && o.x0 < P.pos.x + 32 && o.z1 > P.pos.z - 32 && o.z0 < P.pos.z + 32) visNear[n++] = o; }
    visNear.length = n;
  };
  var visNear = [];
  // (x, z) 这里放不下一只狗：墙、树、石头（W.grid 里周围的格子），第 3 关只有外观的城墙脚、钟楼底座（W.visExtra.boxes），罐子 / 宝箱 / 火药桶
  var find = function (x, z, pad, hard) {
    var c = W.gridCell, m = pad + 2, a, b, L, o;
    for (a = Math.floor((x - m) / c); a <= Math.floor((x + m) / c); a++)
      for (b = Math.floor((z - m) / c); b <= Math.floor((z + m) / c); b++) {
        L = W.grid && W.grid.get(W.gridKey(a, b));
        if (L && (o = hitAt(L, x, z, pad, hard))) return o;
      }
    if ((o = hitAt(visNear, x, z, pad * 0.75, hard))) return o;
    return hard ? null : hitAt(props, x, z, pad);
  };
  var blocked = function (x, z, pad, hard) { return !!find(x, z, pad, hard); };
  // 两边的跟随点：墙（盒子）挡住才算挡住（换到另一边）；只碰到树、石头、罐子就往骑士这边或往外挪一点，挪不开也照样用（狗绕着走）——
  // 跑过树林时每棵树都让狗换边，换边时从骑士身后、镜头前面穿过去（终检 R1）
  // 墙挡住时先往骑士这边挪（贴着骑士和墙中间的空当走，不急着换边），挪不开才算挡住（换到另一边）
  var SHIFT = [-0.35, 0.45, 0.9], SHIFT_IN = [-0.3, -0.6, -0.9, -1.2, -1.5];
  var fit = function (q, ux, uz, side, k, pad) {
    if (!blocked(q[0], q[1], pad)) return q;
    var j, o, x, z;
    if (blocked(q[0], q[1], pad, true)) {
      for (j = 0; j < SHIFT_IN.length; j++) {
        o = SHIFT_IN[j] * k;
        if (side + o < 1.15 * k) break;
        x = q[0] + ux * o; z = q[1] + uz * o;
        if (!blocked(x, z, pad, true)) return [x, z];
      }
      return null;
    }
    for (j = 0; j < SHIFT.length; j++) {
      o = SHIFT[j] * k;
      if (side + o < 1.15 * k) continue;                                   // 不挤到骑士身上
      x = q[0] + ux * o; z = q[1] + uz * o;
      if (!blocked(x, z, pad)) return [x, z];
    }
    return q;
  };
  // 从 (x0, z0) 到 (x1, z1) 的直线有没有穿过墙（每 1 米看一次）
  var wallBetween = function (x0, z0, x1, z1) {
    var dx = x1 - x0, dz = z1 - z0, n = Math.ceil(Math.sqrt(dx * dx + dz * dz));
    for (var j = 1; j < n; j++) if (blocked(x0 + dx * j / n, z0 + dz * j / n, 0, true)) return true;
    return false;
  };
  // 骑士的占地：脚下一个半径 KN_R 的圆，坐骑出来时沿朝向拉长成胶囊（坐骑长度的一半，按骑士的身材缩放）；
  // 狗（约 1 米长）的中心离它至少 DOG_R，狗和狗的中心至少 DOG_GAP（都按身材放大）
  var KN_R = 0.45, DOG_R = 0.65, DOG_GAP = 1.1;
  var knSize = function () { var u = P.body && P.body.userData, sc = u && u.B && u.B.scale || 1; return sc > 0.3 && sc < 3 ? sc : 1; };   // 骑士的身材（CHAR_MODELS 的 body.scale）
  var knHalf = function () { var d = typeof RIDES !== 'undefined' && P.char ? RIDES[P.char.id] : null; return P.riding && d ? (d.len || 1) * 0.5 * knSize() : 0; };
  // 把 (d.x, d.z) 推到骑士的胶囊外面（从胶囊上最近的那一点往外推）
  var keepOff = function (d, sf, cf, rr, half) {
    var u = (d.x - P.pos.x) * sf + (d.z - P.pos.z) * cf, t = Math.max(-half, Math.min(half, u));
    var qx = P.pos.x + sf * t, qz = P.pos.z + cf * t, dx = d.x - qx, dz = d.z - qz, dd = Math.sqrt(dx * dx + dz * dz);
    if (dd >= rr) return;
    if (dd < 1e-4) { dx = -cf; dz = sf; dd = 1; }                     // 正好在骑士身上：往右边推
    d.x = qx + dx / dd * rr; d.z = qz + dz / dd * rr;
  };
  // keepOff，但推完会进墙里（原来不在里面）就不推；树、石头、罐子挡着照样推（离骑士远一点比不碰树要紧）
  var offSafe = function (d, sf, cf, rr, half) {
    var ox = d.x, oz = d.z;
    keepOff(d, sf, cf, rr, half);
    if ((d.x !== ox || d.z !== oz) && blocked(d.x, d.z, 0.2, true) && !blocked(ox, oz, 0.2, true)) { d.x = ox; d.z = oz; }
  };
  // 最近的敌人（道具、出场中的 Boss 不算）；别的狗正在扑的目标往后排（有别的就不抢同一个）
  var near = function (x, z, r) {
    var best = null, bd = Infinity;
    Enemies.inRadius(x, z, r, function (e) {
      if (e.prop || !e.alive || ((e.boss || e.mini) && e.state === 'intro')) return;
      var d = dist2(x, z, e.x, e.z);
      for (var j = 0; j < dogs.length; j++) if (dogs[j].tgt === e) d += 1e4;
      if (d < bd) { bd = d; best = e; }
    });
    return best;
  };
  Relic.def('hound', {
    num: { cd: 1.5, range: 10, dmgBase: 10, dmgPerLv: 2, perCopy: false, maxDogs: 3, runSpd: 18, follow: 2.2, kb: 5 },
    // 卡上写「一只猎犬」「2 只猎犬」（一只时不写阿拉伯数字 1）
    card: function (c) { var n = Math.min(this.num.maxDogs, c.k); return { n: n, dogs: n === 1 ? '一只猎犬' : n + ' 只猎犬', dmg: Relic.dmgAt(this.num, c) }; },
    reset: function () { Passive.relHoundT = 0.5; },
    clear: function () { dogs.length = 0; alt.length = 0; side.length = 0; idleT = 0; holdT.length = 0; knV = 0; lx = null; goT = 0; barkT = -1e9; props.length = 0; visNear.length = 0; propT = 0; },
    dogs: function () { return dogs; },
    // 第 i 只狗的跟随点（n 只狗一起排）：身材大一点、骑着长坐骑时往外、往后让开
    slot: function (i, f, n) { return this.layout(f, Math.max(n || dogs.length, i + 1))[i]; },
    // 所有狗的跟随点：先排各自那一边（右 0、左 1、右 2），被墙 / 树挡住就排到另一边的下一条，两边都挡住再退到身后
    layout: function (f, n, dt) {
      var k = knSize(), half = knHalf(), sf = Math.sin(f), cf = Math.cos(f), fw = this.num.follow * k + half;
      var at = function (side, b) { return [P.pos.x - sf * b + cf * side, P.pos.z - cf * b - sf * side]; };
      var next = [0, 0], col = 0, out = [], i, c, q, C;   // next[0]：右边（side < 0）已经排了几条，next[1]：左边；col：正后方那一列排了几只
      yRef = W.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.1);
      var c0pad = function (i, c) { return c < (alt[i] || 0) ? PAD_BACK : PAD; };
      for (i = 0; i < n; i++) {
        var s = SLOT[i % SLOT.length], h = side[i] != null ? side[i] : s[0] < 0 ? 0 : 1, sg = h ? 1 : -1, lA = LANE[next[h]], lB = LANE[next[1 - h]];
        C = [
          next[h] < LANE.length ? at(sg * lA[0] * k, fw + lA[1 + h]) : null,                                                // 自己那一边（空地上就是 SLOT）
          next[1 - h] < LANE.length ? at(-sg * lB[0] * k, fw + lB[2 - h]) : null,                                           // 另一边
          i % 3 < 2 ? at(BACK[i % 3][0] * k, fw + BACK[i % 3][1]) : null,                                                // 第 6 块原来的位置（身后两边）
          at(0, fw + 0.4 * k + col * 1.1 * k)                                                                               // 正后方排成一列（第 6 块的第三只也在这一列上）
        ];
        // 两边的点：只躲墙，树和石头旁边挪一挪（side 往外的方向是 (cf, −sf) × 符号）
        if (C[0]) {
          q = C[0]; C[0] = fit(q, cf * sg, -sf * sg, lA[0] * k, k, c0pad(i, 0));
          if (dt != null) {
            if (C[0] || !dogs[i] || dogs[i].mode !== 'follow') holdT[i] = 0;
            else if ((alt[i] || 0) === 0 && knV >= 1 && (holdT[i] || 0) < HOLD) { holdT[i] = (holdT[i] || 0) + dt; C[0] = q; }   // 先不换边：跟随点在墙里，狗走的时候贴着墙滑
          }
        }
        if (C[1]) C[1] = fit(C[1], -cf * sg, sf * sg, lB[0] * k, k, c0pad(i, 1));
        for (c = 0; c < C.length; c++) if (C[c] && (c < 2 || !blocked(C[c][0], C[c][1], c < (alt[i] || 0) ? PAD_BACK : PAD))) break;
        if (c === C.length) for (c = 0; c < C.length; c++) if (C[c] && !blocked(C[c][0], C[c][1], 0.05)) break;   // 窄的地方：贴着墙也行
        if (c === C.length) {   // 哪儿都挡住（石头和墙中间的窄缝）：狗站着不动（原地不在墙里的话），骑士走开了再排
          q = dogs[i];
          out.push(q && !blocked(q.x, q.z, 0.05) && dist2(q.x, q.z, P.pos.x, P.pos.z) < 36 ? [q.x, q.z] : C[3]);
          if (dt != null) alt[i] = C.length;
          continue;
        }
        if (c === 0) next[h]++; else if (c === 1) next[1 - h]++; else if (c === 3) col++;
        if (dt != null) alt[i] = c;   // 只有每帧的 update 记下用了哪个（slot / make / 测试调 layout 不改它）
        out.push(C[c]);
      }
      return out;
    },
    make: function (i) {
      var f = P.facing || 0, q = this.slot(i, f), x = q[0], z = q[1];
      return { x: x, y: W.groundAt(x, z, P.pos.y + 1), z: z, yaw: f, mode: 'follow', t: Passive.relHoundT + 0.5 * i, tgt: null, run: 0, ph: 0, ft: 0, sq: 0, v: 0 };
    },
    update: function (dt, n) {
      var N = this.num, want = Math.min(N.maxDogs, n), i;
      while (dogs.length < want) dogs.push(this.make(dogs.length));
      if (dogs.length > want) dogs.length = want;
      var kv = lx == null ? 0 : Math.sqrt(dist2(P.pos.x, P.pos.z, lx, lz)) / Math.max(1e-6, dt);
      if (kv > 80) kv = 0;   // 传送、换关
      lx = P.pos.x; lz = P.pos.z;
      var f = P.facing || 0, sf = Math.sin(f), cf = Math.cos(f), fs = Math.max(8, Math.max(P.speed(), kv) + 4);   // 追的时候比骑士快 4 米/秒、至少 8 米/秒（+2 时转身以后要很久才回到两边）
      findProps(dt);
      // 狗待哪一边：骑士在跑、狗跟着、离骑士的中线 0.6 米以上，就记成它现在的那一边；骑士站住 0.6 秒，各回 SLOT 的那一边
      idleT = kv < 1 ? idleT + dt : 0; knV = kv;
      for (i = 0; i < dogs.length; i++) {
        if (idleT >= IDLE) { side[i] = null; continue; }
        var dd = dogs[i], sd = (dd.x - P.pos.x) * cf - (dd.z - P.pos.z) * sf;
        if (kv >= 1 && dd.mode === 'follow' && Math.abs(sd) > 0.6) side[i] = sd < 0 ? 0 : 1;
      }
      var LY = this.layout(f, dogs.length, dt);
      for (i = 0; i < dogs.length; i++) {
        var d = dogs[i], ox = d.x, oz = d.z;
        // 离得太远（传送、换关）：直接到身边
        if (dist2(d.x, d.z, P.pos.x, P.pos.z) > 900) { var nd = this.make(i); d.x = nd.x; d.z = nd.z; d.y = nd.y; d.mode = 'follow'; d.tgt = null; }
        // 跟随中被墙隔开、离骑士 12 米以上（会直接穿过房子）：直接到自己的跟随点
        else if (d.mode === 'follow' && dist2(d.x, d.z, P.pos.x, P.pos.z) > 144 && wallBetween(d.x, d.z, P.pos.x, P.pos.z)) { d.x = LY[i][0]; d.z = LY[i][1]; d.y = W.groundAt(d.x, d.z, P.pos.y + 1); }
        d.t -= dt;
        // 准备好了：有目标就扑（几只狗一起准备好时一只一只错开 0.25 秒出去）
        if (d.mode === 'follow' && d.t <= 0) {
          var e = Passive.clock - goT >= 0.25 || goT > Passive.clock ? near(P.pos.x, P.pos.z, N.range) : null;
          if (e) { d.mode = 'run'; d.tgt = e; d.run = 1; goT = Passive.clock; }
          else d.t = 0;   // 没有目标：随时准备着
        }
        var tx, tz, sp;
        if (d.mode === 'run') {
          var tg = d.tgt;
          d.run -= dt;
          if (!tg || !tg.alive || d.run <= 0) { d.mode = 'follow'; d.tgt = null; d.t = Math.min(d.t, 0.3); }
          else {
            tx = tg.x; tz = tg.z; sp = N.runSpd;
            var gx = tx - d.x, gz = tz - d.z, gd = Math.sqrt(gx * gx + gz * gz) || 1;
            if (gd <= (tg.r || 0.6) + 0.7) {
              // 扑咬：伤害 + 往外推、一小团土、汪
              Enemies.damage(tg, Relic.dmg(N, 1), 0, gx / gd * N.kb, gz / gd * N.kb);
              FX.burst(tg.x, (tg.y || d.y) + 0.3, tg.z, 6, 0x9a7a52, 3, 0.22);
              if (Passive.clock - barkT >= 3 || barkT > Passive.clock) { barkT = Passive.clock; Relic.emit('bark', d.x, d.z); }
              Relic.count('hound');
              d.sq = 0.15; d.mode = 'follow'; d.tgt = null; d.t = N.cd;
              if (i === 0) Passive.relHoundT = N.cd;
              tx = null;
            }
          }
        }
        if (d.mode === 'follow') { var q = LY[i]; tx = q[0]; tz = q[1]; sp = dist2(tx, tz, d.x, d.z) > 6.25 ? fs + 2 : fs; }   // 离跟随点 2.5 米以上：再快 2 米/秒（转身、绕墙以后快点回到身边）
        if (tx != null) {
          var mx = tx - d.x, mz = tz - d.z, md = Math.sqrt(mx * mx + mz * mz);
          if (md > 0.05) {
            // 跟随时离得近就慢下来（缓动），扑过去时全速
            var go = Math.min(md, sp * dt * (d.mode === 'run' ? 1 : Math.min(1, 0.35 + md / 2)));
            var nx = d.x + mx / md * go, nz = d.z + mz / md * go;
            // 跟随时不走进墙、树、石头里：碰到圆就贴着圆的切线绕过去，碰到墙就沿着墙滑（只走 x 或只走 z）；
            // 离跟随点 2.5 米以上（转身以后在追）时树、石头、罐子直接穿过去（绕的话会落到后面、从镜头前跑过），墙照样不穿
            var ob = d.mode === 'follow' && !blocked(d.x, d.z, 0.2) ? find(nx, nz, 0.2, md > 2.5) : null;
            if (ob) {
              var slid = false;
              if (ob.kind === 'circle') {
                var rx = d.x - ob.x, rz = d.z - ob.z, rl = Math.sqrt(rx * rx + rz * rz) || 1, tx2 = -rz / rl, tz2 = rx / rl, rr = (ob.r || 0) + 0.22;
                if (tx2 * mx + tz2 * mz < 0) { tx2 = -tx2; tz2 = -tz2; }
                var cx = d.x + tx2 * go, cz = d.z + tz2 * go, ex = cx - ob.x, ez = cz - ob.z, el = Math.sqrt(ex * ex + ez * ez) || 1;
                if (el < rr) { cx = ob.x + ex / el * rr; cz = ob.z + ez / el * rr; }
                if (!blocked(cx, cz, 0.2)) { nx = cx; nz = cz; slid = true; }
              }
              if (!slid) {   // 沿着墙滑：那一个方向上走满这一步（不按斜着的分量减速）
                var sx = d.x + Math.max(-go, Math.min(go, mx)), sz = d.z + Math.max(-go, Math.min(go, mz));
                if (!blocked(sx, d.z, 0.2)) { nx = sx; nz = d.z; } else if (!blocked(d.x, sz, 0.2)) { nx = d.x; nz = sz; }
                else {   // 卡在墙角：试着往两侧（和要走的方向垂直）挪一步，挑离跟随点近的那个；都不行就站着
                  var px = -mz / md * go, pz = mx / md * go, a1 = !blocked(d.x + px, d.z + pz, 0.2), a2 = !blocked(d.x - px, d.z - pz, 0.2);
                  if (a1 && (!a2 || dist2(d.x + px, d.z + pz, tx, tz) <= dist2(d.x - px, d.z - pz, tx, tz))) { nx = d.x + px; nz = d.z + pz; }
                  else if (a2) { nx = d.x - px; nz = d.z - pz; } else { nx = d.x; nz = d.z; }
                }
              }
            }
            d.x = nx; d.z = nz;
          }
        }
        // 不穿过骑士（绕着走），推进墙里的那一下不推；狗和狗分开放在下面（所有狗都走完以后）
        offSafe(d, sf, cf, (KN_R + DOG_R) * knSize(), knHalf());
        var vx = d.x - ox, vz = d.z - oz;
        d.v = Math.sqrt(vx * vx + vz * vz) / Math.max(1e-6, dt);
        if (d.v > 0.6) d.yaw = Math.atan2(vx, vz);
        else if (d.mode === 'follow') { var ya = f - d.yaw; d.yaw += Math.atan2(Math.sin(ya), Math.cos(ya)) * Math.min(1, dt * 4); }
        d.y = W.groundAt(d.x, d.z, d.y + 1);
        // 跑起来（> 1.5 米/秒）时每 0.12 秒换一帧
        if (d.v > 1.5) { d.ft += dt; if (d.ft >= 0.12) { d.ft -= 0.12; d.ph ^= 1; } } else { d.ph = 0; d.ft = 0; }
        if (d.sq > 0) d.sq -= dt;
        if (i === 0 && d.mode === 'follow') Passive.relHoundT = d.t;
      }
      // 狗和狗不叠在一起：两两推开（各让一半），推完再从骑士身上推开；来回三遍
      if (dogs.length > 1) {
        var gap = DOG_GAP * knSize(), kr = (KN_R + DOG_R) * knSize(), kh = knHalf();
        for (var pass = 0; pass < 3; pass++) {
          for (i = 1; i < dogs.length; i++) for (var j = 0; j < i; j++) {
            var A = dogs[i], B = dogs[j], ax = A.x - B.x, az = A.z - B.z, ad = Math.sqrt(ax * ax + az * az);
            if (ad >= gap) continue;
            if (ad < 1e-4) { ax = cf; az = -sf; ad = 1; }
            var push = (gap - ad) / 2, ux = ax / ad, uz = az / ad;
            // 推进墙里的那只不动，另一只让全部（两只都会进墙就不推）；树、石头、罐子不拦着推
            var aOk = !blocked(A.x + ux * push, A.z + uz * push, 0.2, true) || blocked(A.x, A.z, 0.2, true);
            var bOk = !blocked(B.x - ux * push, B.z - uz * push, 0.2, true) || blocked(B.x, B.z, 0.2, true);
            if (aOk && bOk) { A.x += ux * push; A.z += uz * push; B.x -= ux * push; B.z -= uz * push; }
            else if (aOk && !blocked(A.x + ux * push * 2, A.z + uz * push * 2, 0.2, true)) { A.x += ux * push * 2; A.z += uz * push * 2; }
            else if (bOk && !blocked(B.x - ux * push * 2, B.z - uz * push * 2, 0.2, true)) { B.x -= ux * push * 2; B.z -= uz * push * 2; }
          }
          for (i = 0; i < dogs.length; i++) offSafe(dogs[i], sf, cf, kr, kh);
        }
        for (i = 0; i < dogs.length; i++) dogs[i].y = W.groundAt(dogs[i].x, dogs[i].z, dogs[i].y + 1);
      }
    },
    render: function (put) {
      for (var i = 0; i < dogs.length; i++) {
        var d = dogs[i], hop = d.ph && d.v > 1.5 ? 0.05 : 0;
        put(d.ph ? 'hound_b' : 'hound', d.x, d.y + hop, d.z, 0, d.yaw, 1, d.sq > 0 ? 0.06 : 0);
      }
    }
  });
})();

// ---------------- 只有属性的四件（效果在 ITEMS.stats / player.js）：卡片和测试用的数 ----------------
// 滑雪蜡：player.js 的 P.fricK / P.slopeK（数值必须一样，测试比）
(function () {
  var acc = 0;
  Relic.def('skiwax', {
    num: { fric: 0.75, fricMin: 0.6, slope: 0.15, slopeMax: 0.3 },
    card: function (c) { var N = this.num; return { f: Math.round((1 - Math.max(N.fricMin, Math.pow(N.fric, c.k))) * 100), s: Math.round(Math.min(N.slopeMax, N.slope * c.k) * 100) }; },
    clear: function () { acc = 0; },
    update: function (dt, n) {   // 在地上滑铲每满 1 秒记一次
      if (!P.sliding || !P.onGround) return;
      acc += dt;
      if (acc >= 1) { acc -= 1; Relic.count('skiwax'); }
    }
  });
})();
Relic.def('lockpick', {
  num: { disc: 0.12, cap: 0.5 },
  card: function (c) { return { p: Math.round(Math.min(this.num.cap, this.num.disc * c.k) * 100) }; }
});
Relic.def('crestbrush', {
  num: { slots: 1 },
  card: function (c) { return { n: this.num.slots * c.k }; }
});
Relic.def('twinbelt', {
  num: { slots: 1, damage: -0.05 },   // 第 13 块 P9：−0.08 → −0.05
  card: function (c) { return { n: this.num.slots * c.k, p: Math.round(-this.num.damage * 100 * c.k) }; }
});
