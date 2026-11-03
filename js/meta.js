'use strict';
// ============================================================
//  局外成长（数据表在 data_meta.js）：存档、魔晶、骑士和内容解锁、成就、强化、难度、记录
//  · 存档：localStorage 'knight_magic_profile'（每次读写都 try/catch；坏了、不能用就用内存里的存档）
//  · 只包装别的文件的函数，不改它们：Game.start/win/onDeath/toMenu、P.reset、LevelUp.reset/options/shrineOptions、
//    Items.roll/rollOfRarity、Director.hpMult/dmgMult/curve/update、Enemies.kill、Interact.use/breakPot、
//    UI.buildMenu/showEnd/action/shrineChoice、Evo.evolve、MX.wish/launch/captureBanner/explodeKeg
//  · 直接调用（Game.start 任何骑士、Weapons.give、Items.give……）从不拦：锁只影响随机池和菜单
//  · 难度 I 就是原来的手感；游戏逻辑只在 Game.update 里跑（每帧的统计挂在 Director.update 后面）
// ============================================================
var Meta = {
  KEY: 'knight_magic_profile', SETTINGS_KEY: 'knight_magic_settings',
  p: null,              // 存档
  run: null,            // 当前这一局的统计（结算后 settled = true，结算结果在 run.result）
  activeTier: 1,        // 这一局的难度（开局时定下）
  ver: 1,               // 解锁状态的版本号（变了就重算随机池的缓存）
  storageOk: true,      // 能不能存进 localStorage
  returning: false,     // 更新前就玩过（有设置存档）
  uiReady: false, layer: null, confirmEl: null, sink: null, lateAch: [], toastQ: [], toastBusy: false, restored: null
};

// ---------------- 存取（全部 try/catch：隐私模式、禁用存储、存满了都不报错） ----------------
Meta.read = function (k) { try { return window.localStorage ? window.localStorage.getItem(k) : null; } catch (e) { return null; } };
Meta.write = function (k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } };
Meta.drop = function (k) { try { window.localStorage.removeItem(k); } catch (e) { /* 忽略 */ } };
Meta.err = function (e) { try { console.error('[meta]', e && e.stack ? e.stack : e); } catch (e2) { /* 忽略 */ } };
// 给别的文件（音效、打击感）用的事件：window 上的 'knightmeta:achievement' / 'knightmeta:settle' / 'knightmeta:unlock'，detail 里是数据
Meta.emit = function (name, detail) {
  try { window.dispatchEvent(new CustomEvent('knightmeta:' + name, { detail: detail })); } catch (e) { /* 老浏览器没有 CustomEvent 就算了 */ }
};

// 局内计数（结算时加进生涯总数）和局内最大值（结算时更新生涯最佳）
Meta.SUMS = ['runs', 'kills', 'elites', 'minis', 'bosses', 'chests', 'shrines', 'pots', 'evos', 'wishes', 'kegs', 'launches', 'succ',
  'interacts', 'lowHpKills', 'frozenKills', 'dotKills', 'goblins', 'ride', 'heal', 'hurt', 'playTime',
  // 新内容（content.js / content_map.js 的回调里数）：秘密地点、抓住金袋哥布林、打倒宝箱怪、熬过血月、一次点亮宝库、跳台 + 滑坡
  'secrets', 'goldgobs', 'mimics', 'bloodmoons', 'vaultClean', 'padRides'];
Meta.MAXES = ['level', 'stage', 'time', 'weapons', 'tomes', 'items', 'difficulty', 'speed', 'air', 'noHit', 'gold', 'evoNow', 'swarm',
  'weaponKills', 'runKills', 'stageSecrets'];
// 第 n 关的关卡 Boss 在第二阶段被打败的次数（按关卡记，不按 Boss 的 id：以后 Boss 改名、换人都不影响）
Meta.P2N = typeof STAGES !== 'undefined' && STAGES.length ? STAGES.length : 3;
(function () { for (var i = 1; i <= Meta.P2N; i++) Meta.SUMS.push('p2s' + i); })();
Meta.SUMSET = {}; Meta.SUMS.forEach(function (k) { Meta.SUMSET[k] = true; });
Meta.MAXSET = {}; Meta.MAXES.forEach(function (k) { Meta.MAXSET[k] = true; });
Meta.GOBLINS = {};
(META_DATA.GOBLINS || ['goblin', 'goblin2', 'goblintank']).forEach(function (id) { Meta.GOBLINS[id] = true; });

Meta.blank = function () {
  return {
    v: META_DATA.VERSION, mc: 0, mcTotal: 0, tier: 1, casual: false, notice: 0, gift: 0,
    unlocked: { knight: {}, weapon: {}, tome: {}, item: {}, shrine: {} },
    ach: {}, up: {}, life: {}, best: {}, wins: [0, 0, 0, 0], chars: {}, wk: {}, bought: {}, refund: {}, pending: null
  };
};

Meta.num = function (v, d) { return typeof v === 'number' && isFinite(v) && v >= 0 ? v : d; };
Meta.nums = function (src, only) {
  var out = {};
  if (src && typeof src === 'object' && !Array.isArray(src)) {
    for (var k in src) if ((!only || only[k]) && typeof src[k] === 'number' && isFinite(src[k]) && src[k] >= 0) out[k] = src[k];
  }
  return out;
};
Meta.flags = function (src) {
  var out = {};
  if (src && typeof src === 'object' && !Array.isArray(src)) for (var k in src) if (src[k]) out[k] = 1;
  return out;
};

// 读进来的存档逐项检查，类型不对的用默认值；不认识的字段原样留着（新版本的存档在旧版本里打开也不会丢）
Meta.sanitize = function (o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  var p = Meta.blank(), k;
  for (k in o) if (!(k in p) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype') p[k] = o[k];
  p.v = Meta.num(o.v, 0);
  p.mc = Math.floor(Meta.num(o.mc, 0));
  p.mcTotal = Math.floor(Meta.num(o.mcTotal, 0));
  p.tier = [1, 2, 3].indexOf(o.tier) >= 0 ? o.tier : 1;
  p.casual = o.casual === true;
  p.notice = o.notice ? 1 : 0;
  p.gift = o.gift ? 1 : 0;
  if (o.unlocked && typeof o.unlocked === 'object') for (k in p.unlocked) p.unlocked[k] = Meta.flags(o.unlocked[k]);
  p.ach = Meta.nums(o.ach); p.up = Meta.nums(o.up); p.life = Meta.nums(o.life); p.best = Meta.nums(o.best); p.wk = Meta.nums(o.wk);
  p.bought = Meta.flags(o.bought);
  p.refund = Meta.nums(o.refund);
  if (Array.isArray(o.wins)) for (var i = 0; i < 4; i++) p.wins[i] = Math.floor(Meta.num(o.wins[i], 0));
  if (o.chars && typeof o.chars === 'object') for (k in o.chars) if (typeof CHARACTERS !== 'undefined' && CHARACTERS[k]) p.chars[k] = Meta.nums(o.chars[k]);
  p.pending = Meta.cleanRun(o.pending);
  return Meta.migrate(p);
};

// 存档版本迁移：v1 是第一个版本；以后改了存档结构就在这里一步步升级
Meta.migrate = function (p) {
  if (!(p.v >= 1)) p.v = 1;
  if (p.v < META_DATA.VERSION) p.v = META_DATA.VERSION;
  return p;
};

// 存档里“没结算的那一局”（中途关掉页面）：只留认识的字段
Meta.cleanRun = function (o) {
  if (!o || typeof o !== 'object' || typeof CHARACTERS === 'undefined' || !CHARACTERS[o.char]) return null;
  var r = {
    char: o.char, tier: [1, 2, 3].indexOf(o.tier) >= 0 ? o.tier : 1, minutes: Meta.num(o.minutes, 15) || 15,
    stage: Math.max(1, Math.floor(Meta.num(o.stage, 1))), level: Math.max(1, Math.floor(Meta.num(o.level, 1))), time: Meta.num(o.time, 0),
    c: Meta.nums(o.c, Meta.SUMSET), x: Meta.nums(o.x, Meta.MAXSET), wk: Meta.nums(o.wk), newAch: [], settled: false
  };
  Meta.SUMS.forEach(function (k) { if (!(k in r.c)) r.c[k] = 0; });
  Meta.MAXES.forEach(function (k) { if (!(k in r.x)) r.x[k] = 0; });
  return r;
};

Meta.load = function () {
  var raw = Meta.read(Meta.KEY), p = null;
  if (raw) {
    try { p = Meta.sanitize(JSON.parse(raw)); } catch (e) { p = null; }
    if (!p) Meta.write(Meta.KEY + '_bad', raw);   // 坏掉的存档备份一份，再从头开始
  }
  Meta.p = p || Meta.blank();
  Meta.storageOk = Meta.write(Meta.KEY + '_test', '1');
  Meta.drop(Meta.KEY + '_test');
  Meta.ver++;
};

Meta.save = function () {
  var s;
  try { s = JSON.stringify(Meta.p); } catch (e) { return false; }
  Meta.storageOk = Meta.write(Meta.KEY, s);
  return Meta.storageOk;
};

// ---------------- 解锁 ----------------
Meta.LOCK = {};
(function () {
  for (var k in META_DATA.LOCKED) {
    Meta.LOCK[k] = {};
    for (var i = 0; i < META_DATA.LOCKED[k].length; i++) Meta.LOCK[k][META_DATA.LOCKED[k][i]] = true;
  }
  Meta.START = {};
  META_DATA.START_KNIGHTS.forEach(function (id) { Meta.START[id] = true; });
})();

Meta.casual = function () { return !!(Meta.p && Meta.p.casual); };
// 真的解锁了（不管休闲模式）
Meta.owns = function (kind, id) {
  var u = Meta.p.unlocked;
  if (kind === 'knight') return !!Meta.START[id] || !!u.knight[id];
  if (!Meta.LOCK[kind] || !Meta.LOCK[kind][id]) return true;
  return !!(u[kind] && u[kind][id]);
};
// 现在能用（休闲模式下全部能用）
Meta.isUnlocked = function (kind, id) { return Meta.casual() || Meta.owns(kind, id); };
Meta.unlock = function (kind, id) {
  if (!Meta.p.unlocked[kind] || Meta.owns(kind, id)) return false;
  Meta.p.unlocked[kind][id] = 1;
  Meta.ver++;
  Meta.emit('unlock', { kind: kind, id: id });
  return true;
};
Meta.knightCount = function () {
  var n = 0;
  for (var id in CHARACTERS) if (Meta.owns('knight', id)) n++;
  return n;
};
Meta.knightTotal = function () { return Object.keys(CHARACTERS).length; };

// 现在还锁着的 id（休闲模式下是空的；按解锁版本缓存）
Meta.lockedIds = function (kind) {
  var c = Meta._lk || (Meta._lk = { ver: -1, lists: {} });
  if (c.ver !== Meta.ver) { c.ver = Meta.ver; c.lists = {}; }
  var l = c.lists[kind];
  if (!l) {
    l = c.lists[kind] = [];
    if (!Meta.casual()) (META_DATA.LOCKED[kind] || []).forEach(function (id) { if (!Meta.owns(kind, id)) l.push(id); });
  }
  return l;
};

// 宝箱 / 商人 / 摩艾的物品池：去掉还锁着的；某个稀有度被锁空了就用完整的（池子永远不会空）
Meta.itemPools = function () {
  if (Meta._ipVer === Meta.ver && Meta._ip) return Meta._ip;
  var full = [[], [], [], [], []], f = [[], [], [], [], []];
  for (var id in ITEMS) {
    var r = ITEMS[id].rarity;
    if (!full[r]) continue;
    full[r].push(id);
    if (Meta.isUnlocked('item', id)) f[r].push(id);
  }
  for (var i = 0; i < 5; i++) if (!f[i].length && full[i].length) f[i] = full[i];
  Meta._ip = f; Meta._ipVer = Meta.ver;
  return f;
};

// ---------------- 难度 ----------------
Meta.winsFrom = function (t) { var w = Meta.p.wins, n = 0; for (var i = t; i <= 3; i++) n += w[i] || 0; return n; };
// 难度 II：通关过一次；难度 III：在难度 II（或更高）通关过
Meta.tierMax = function () { return Meta.winsFrom(2) > 0 ? 3 : Meta.winsFrom(1) > 0 ? 2 : 1; };
Meta.tierOk = function (t) { return t >= 1 && t <= 3 && (Meta.casual() || t <= Meta.tierMax()); };
Meta.selectedTier = function () { var t = Meta.p.tier || 1; while (t > 1 && !Meta.tierOk(t)) t--; return t; };
Meta.tierDef = function (t) { return META_DATA.TIERS[t] || META_DATA.TIERS[1]; };
Meta.roman = function (t) { return Meta.tierDef(t).name; };
Meta.minutes = function () { return typeof Pace !== 'undefined' && Pace.minutes ? Pace.minutes : 15; };

// ---------------- 强化 ----------------
Meta.upDef = function (id) { for (var i = 0; i < META_DATA.UPGRADES.length; i++) if (META_DATA.UPGRADES[i].id === id) return META_DATA.UPGRADES[i]; return null; };
Meta.upLevel = function (id) { var u = Meta.upDef(id), lv = Math.floor(Meta.p.up[id] || 0); return u ? Math.max(0, Math.min(u.cost.length, lv)) : 0; };
Meta.upNextCost = function (id) { var u = Meta.upDef(id), lv = Meta.upLevel(id); return u && lv < u.cost.length ? u.cost[lv] : 0; };
Meta.upSpent = function () {
  var n = 0;
  META_DATA.UPGRADES.forEach(function (u) { var lv = Meta.upLevel(u.id); for (var i = 0; i < lv; i++) n += u.cost[i]; });
  return n;
};
Meta.upCanBuyAny = function () {
  for (var i = 0; i < META_DATA.UPGRADES.length; i++) {
    var c = Meta.upNextCost(META_DATA.UPGRADES[i].id);
    if (c > 0 && c <= Meta.p.mc) return true;
  }
  return false;
};
// 某个强化当前的总加成（显示用）
Meta.upText = function (u, lv) {
  var v = u.per * lv;
  if (u.pct) return '+' + Math.round(v * 1000) / 10 + '%';
  return '+' + Math.round(v * 10) / 10 + (u.unit || '');
};
Meta.buyUpgrade = function (id) {
  var u = Meta.upDef(id), cost = Meta.upNextCost(id);
  if (!u || !cost || Meta.p.mc < cost) return false;
  Meta.p.mc -= cost;
  Meta.p.up[id] = Meta.upLevel(id) + 1;
  Meta.save();
  return true;
};
Meta.resetUpgrades = function () {
  var back = Meta.upSpent();
  Meta.p.mc += back;
  Meta.p.up = {};
  Meta.save();
  return back;
};

// 开局：P.reset 之后把强化加到属性上（P.mods 每局重置，所以每局只加一次）
Meta.applyUpgrades = function () {
  var any = false;
  META_DATA.UPGRADES.forEach(function (u) {
    var lv = Meta.upLevel(u.id);
    if (!lv) return;
    if (u.stat) { P.mods.push({ stat: u.stat, value: u.per * lv }); any = true; }
    else if (u.special === 'gold') P.gold += u.per * lv;
  });
  if (any) { P.recalc(); P.hp = P.st.maxHp; P.shield = P.st.shield; }
};

// ---------------- 这一局的统计 ----------------
Meta.newRun = function () {
  var c = {}, x = {};
  Meta.SUMS.forEach(function (k) { c[k] = 0; });
  Meta.MAXES.forEach(function (k) { x[k] = 0; });
  x.level = 1; x.stage = 1;
  return {
    char: Game.charId, tier: Meta.activeTier, minutes: Meta.minutes(), stage: 1, level: 1, time: 0, won: false, how: '', settled: false,
    c: c, x: x, wk: {}, newAch: [],
    // 每帧的跟踪：连续滞空、连续不受伤、上一帧的生命 / 护盾 / 最大生命 / 关卡、检查和保存的计时
    tk: { air: 0, noHit: 0, hp: -1, tot: -1, max: 0, stage: 1, chk: 0, save: 0 }
  };
};

Meta.liveRun = function () { var r = Meta.run; return r && !r.settled ? r : null; };

// 每帧（Director.update 之后，只在游戏进行中）：只做数字运算，不分配内存
Meta.tick = function (dt) {
  var run = Meta.liveRun();
  if (!run || !(dt > 0)) return;
  var c = run.c, x = run.x, tk = run.tk, st = P.st;
  c.playTime += dt;
  var hs = Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z);
  if (hs > x.speed && hs < 200) x.speed = hs;
  if (P.riding) c.ride += hs * dt;
  if (!P.onGround) { tk.air += dt; if (tk.air > x.air) x.air = tk.air; } else tk.air = 0;
  // 受伤（生命 + 护盾变少）和回复（生命变多，最大生命变大带来的不算）；换关回满血那一帧不算
  var hp = P.hp, tot = hp + (P.shield || 0), mx = st.maxHp;
  if (tk.hp >= 0 && tk.stage === Game.stage) {
    var dm = mx - tk.max;
    if (tot < tk.tot - 0.01 && dm >= 0) { c.hurt += tk.tot - tot; tk.noHit = 0; }
    var dh = hp - tk.hp - (dm > 0 ? dm : 0);
    if (dh > 0) c.heal += dh;
  }
  tk.hp = hp; tk.tot = tot; tk.max = mx; tk.stage = Game.stage;
  tk.noHit += dt;
  if (tk.noHit > x.noHit) x.noHit = tk.noHit;
  // 踩了跳台之后的 15 秒里：在长坡上顺着坡往下滑铲冲到 20 就算一次「坡道飞驰」（别处的平地上靠连跳攒速度不算）
  if (tk.pad > 0) {
    tk.pad -= dt;
    if (P.sliding && hs >= Meta.PAD_SPEED && Meta.downSlope()) { c.padRides++; tk.pad = 0; }
  }
  if (P.gold > x.gold) x.gold = P.gold;
  if (P.level > x.level) x.level = P.level;
  if (Game.stage > x.stage) x.stage = Game.stage;
  if (st.difficulty > x.difficulty) x.difficulty = st.difficulty;
  if (Director.swarm && Director.swarmT > x.swarm) x.swarm = Director.swarmT;
  tk.chk += dt;
  if (tk.chk >= 0.5) { tk.chk = 0; Meta.sample(run); Meta.checkAch(); }
  tk.save += dt;
  if (tk.save >= 20) { tk.save = 0; Meta.snapshot(); }
};

// 每半秒：武器、魔典、物品数量这些要数一遍的
Meta.sample = function (run) {
  var x = run.x, ws = P.weapons, ev = 0, wk = 0, n = 0, i, id;
  for (i = 0; i < ws.length; i++) { if (ws[i].evo) ev++; if (ws[i].kills > wk) wk = ws[i].kills; }
  if (ws.length > x.weapons) x.weapons = ws.length;
  if (ev > x.evoNow) x.evoNow = ev;
  if (wk > x.weaponKills) x.weaponKills = wk;
  if (P.tomes.length > x.tomes) x.tomes = P.tomes.length;
  for (id in P.items) if (P.items[id] > 0) n += P.items[id];
  if (n > x.items) x.items = n;
  if (run.c.kills > x.runKills) x.runKills = run.c.kills;
  run.level = P.level; run.stage = Game.stage; run.time = Game.totalTime;
  if (run.time > x.time) x.time = run.time;
};

// 结算前最后读一次游戏状态（还有每把武器的击杀）
Meta.capture = function (run) {
  Meta.sample(run);
  if (P.level > run.x.level) run.x.level = P.level;
  if (Game.stage > run.x.stage) run.x.stage = Game.stage;
  run.wk = {};
  P.weapons.forEach(function (w) { run.wk[w.id] = (run.wk[w.id] || 0) + (w.kills || 0); });
};

// 每 20 秒（和切到后台时）把没结算的这一局存一份：页面被关掉，下次打开也能按退出结算
Meta.snapshot = function () {
  var run = Meta.liveRun();
  if (!run) return;
  if (Game.charId === run.char && Game.state !== 'menu') Meta.capture(run);
  Meta.p.pending = { char: run.char, tier: run.tier, minutes: run.minutes, stage: run.stage, level: run.level, time: run.time, c: run.c, x: run.x, wk: run.wk };
  Meta.save();
};

// ---------------- 事件统计（包装的函数里调用） ----------------
Meta.onKill = function (e) {
  var run = Meta.liveRun();
  if (!run || !e) return;
  var c = run.c;
  c.kills++;
  if (e.elite) c.elites++;
  if (e.mini) c.minis++;
  if (e.boss) c.bosses++;
  if (e.frozen > 0) c.frozenKills++;
  if (e.dot > 0 || e.poisoned > 0) c.dotKills++;
  if (P.alive && P.hp < P.st.maxHp * 0.25) c.lowHpKills++;
  if (e.def && Meta.GOBLINS[e.def.id]) c.goblins++;
  // 关卡 Boss 在第二阶段被打败（content.js 在血量降到一半时设 e.phase2）
  if (e.boss && e.phase2 && c['p2s' + Game.stage] != null) c['p2s' + Game.stage]++;
};
Meta.count = function (k, n) { var run = Meta.liveRun(); if (run) run.c[k] += n || 1; };

// ---------------- 新内容（CONTENT 的回调；没有 content.js 时什么都不做） ----------------
// 秘密地点：总数 + 同一关里找到几个（换关重新数）
Meta.onSecret = function (s) {
  var run = Meta.liveRun();
  if (!run || !s) return;
  run.c.secrets++;
  var tk = run.tk, st = s.stage || Game.stage;
  if (tk.secStage !== st) { tk.secStage = st; tk.secN = 0; }
  tk.secN++;
  if (tk.secN > run.x.stageSecrets) run.x.stageSecrets = tk.secN;
};
// 随机事件结束：抓住金袋哥布林、打倒宝箱怪、熬过血月（时间到自己落下才算；Boss 战、换关、阵亡打断的不算）
Meta.EV_COUNT = { 'goldgob:success': 'goldgobs', 'mimic:success': 'mimics', 'bloodmoon:timeout': 'bloodmoons' };
Meta.onEvent = function (ev) {
  if (!ev || ev.phase !== 'end' || !Meta.liveRun()) return;
  var k = Meta.EV_COUNT[ev.type + ':' + ev.result];
  if (k && (k !== 'bloodmoons' || P.alive)) Meta.count(k);
};
// 秘密宝库：点错过火盆的宝库记下来（换关清空）；打开时没点错过就算“一次点亮”
Meta.vaultFail = [];
Meta.onSpecial = function (key, x, y, z) {
  var run = Meta.liveRun();
  if (!run) return;
  if (key === 'brazierFail') {
    var S = Content.sites || [];
    for (var i = 0; i < S.length; i++) {
      var s = S[i];
      if (s.type === 'vault' && Meta.vaultFail.indexOf(s) < 0 && (x - s.x) * (x - s.x) + (z - s.z) * (z - s.z) < 15 * 15) Meta.vaultFail.push(s);
    }
  } else if (key === 'jumppad') run.tk.pad = 15;   // 15 秒内滑铲冲下坡、速度到 20 就算（Meta.tick 里看）
};
Meta.onSolved = function (site) {
  if (!site || site.type !== 'vault' || !Meta.liveRun()) return;
  if (Meta.vaultFail.indexOf(site) < 0) Meta.count('vaultClean');
};
Meta.PAD_SPEED = 20;
// 玩家在长坡地标上（content_map.js 的 slope），而且是顺着坡往下走（坡的主方向 ca / sa 是下坡方向）
Meta.downSlope = function () {
  if (typeof Content === 'undefined' || typeof Content.inFeat !== 'function') return false;
  var f = Content.inFeat(P.pos.x, P.pos.z, 0);
  return !!f && f.type === 'slope' && P.vel.x * f.ca + P.vel.z * f.sa > 0;
};
Meta.installContent = function () {
  if (Meta.contentWired || typeof Content === 'undefined' || typeof Content.on !== 'function') return;
  Meta.contentWired = true;
  var guard = function (fn) { return function () { try { fn.apply(null, arguments); } catch (e) { Meta.err(e); } }; };
  if (Content.onSecretFound) Content.onSecretFound(guard(Meta.onSecret));
  if (Content.onEvent) Content.onEvent(guard(Meta.onEvent));
  if (Content.onSpecial) Content.onSpecial(guard(Meta.onSpecial));
  Content.on('secretSolved', guard(Meta.onSolved));
  Content.on('clear', function () { Meta.vaultFail.length = 0; });
};

// ---------------- 成就 ----------------
Meta.METRICS = {
  win1: function () { return Meta.winsFrom(1); },
  win2: function () { return Meta.winsFrom(2); },
  win3: function () { return Meta.winsFrom(3); },
  winKnights: function () { var n = 0; for (var id in Meta.p.chars) if (Meta.p.chars[id].wins > 0) n++; return n; },
  knights: function () { return Meta.knightCount(); },
  // 几关的关卡 Boss 在第二阶段被打败过（生涯 + 这一局）
  phase2Stages: function () { var n = 0; for (var i = 1; i <= Meta.P2N; i++) if (Meta.value('p2s' + i) > 0) n++; return n; }
};
Meta.value = function (m) {
  var p = Meta.p, run = Meta.liveRun();
  if (Meta.SUMSET[m]) return (p.life[m] || 0) + (run ? run.c[m] || 0 : 0);
  if (Meta.MAXSET[m]) return Math.max(p.best[m] || 0, run ? run.x[m] || 0 : 0);
  var f = Meta.METRICS[m];
  return f ? f() : 0;
};
Meta.achById = function (id) { var l = META_DATA.ACHIEVEMENTS; for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return null; };
Meta.knightAch = function (cid) { var l = META_DATA.ACHIEVEMENTS; for (var i = 0; i < l.length; i++) if (l[i].r && l[i].r.knight === cid) return l[i]; return null; };
Meta.achDone = function () { var n = 0; for (var id in Meta.p.ach) if (Meta.achById(id)) n++; return n; };

Meta.checkAch = function () {
  var list = META_DATA.ACHIEVEMENTS, done = Meta.p.ach, more = true, guard = 0;
  while (more && guard++ < 4) {
    more = false;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (done[a.id]) continue;
      if (Meta.value(a.m) >= a.goal - 1e-6) { Meta.complete(a); more = true; }
    }
  }
};

Meta.complete = function (a) {
  var p = Meta.p, r = a.r || {}, run = Meta.liveRun();
  p.ach[a.id] = Date.now();
  if (r.mc) { p.mc += r.mc; p.mcTotal += r.mc; }
  if (r.knight) {
    // 骑士已经用魔晶买过了：返还一半价格
    if (Meta.owns('knight', r.knight)) {
      var back = Math.round((META_DATA.KNIGHT_PRICE[r.knight] || 0) * (META_DATA.KNIGHT_REFUND || 0));
      if (back > 0) { p.mc += back; p.mcTotal += back; p.refund[a.id] = back; }
    } else Meta.unlock('knight', r.knight);
  }
  ['weapon', 'tome', 'item', 'shrine'].forEach(function (k) { (r[k] || []).forEach(function (id) { Meta.unlock(k, id); }); });
  Meta.ver++;
  if (Meta.sink) Meta.sink.push(a.id);           // 结算时完成的：写进结算结果
  else if (run) run.newAch.push(a.id);           // 局内完成的：右上角提示，结算时列出来
  else Meta.lateAch.push(a.id);                  // 菜单里完成的（比如买齐了骑士）
  Meta.save();
  if (!Meta.sink) Meta.toast(a);
  Meta.emit('achievement', { id: a.id, name: a.name, inRun: !!run, atSettle: !!Meta.sink });
};

// 奖励的文字：「骑士「食人魔骑士」、武器「流星锤」、100 魔晶」（a 是成就）
Meta.rewardParts = function (a) {
  var out = [], r = a && a.r, back = a && Meta.p.refund[a.id];
  if (!r) return out;
  if (r.knight && CHARACTERS[r.knight]) out.push({ kind: 'char', id: r.knight, text: '骑士「' + CHARACTERS[r.knight].name + '」' + (back ? '（已买过，返还 ' + back + ' 魔晶）' : '') });
  (r.weapon || []).forEach(function (id) { if (WEAPONS[id]) out.push({ kind: 'weapon', id: id, text: '武器「' + WEAPONS[id].name + '」' }); });
  (r.tome || []).forEach(function (id) { if (TOMES[id]) out.push({ kind: 'tome', id: id, text: '魔典「' + TOMES[id].name + '」' }); });
  (r.item || []).forEach(function (id) { if (ITEMS[id]) out.push({ kind: 'item', id: id, text: '物品「' + ITEMS[id].name + '」' }); });
  (r.shrine || []).forEach(function (id) { out.push({ kind: 'glyph', glyph: '神', color: 0x7ef0ff, text: '神龛祝福「' + (STATS[id] ? STATS[id].name : id) + '」' }); });
  if (r.mc) out.push({ kind: 'mc', text: r.mc + ' 魔晶' });
  return out;
};
Meta.rewardText = function (a) {
  var t = Meta.rewardParts(a).map(function (x) { return x.text; }).join('、');
  return t + (a.note ? '（' + a.note + '）' : '');
};

// 进度数字的写法
Meta.fmt = function (n) {
  n = Math.floor(n);
  var s = String(Math.abs(n)), out = '';
  while (s.length > 3) { out = ',' + s.slice(-3) + out; s = s.slice(0, -3); }
  return (n < 0 ? '-' : '') + s + out;
};
Meta.UNITS = { ride: ' 米', noHit: ' 秒', swarm: ' 秒' };
Meta.fmtVal = function (a, v) {
  if (a.pct) return Math.floor(v * 100 + 1e-6) + '%';
  return Meta.fmt(v) + (Meta.UNITS[a.m] || '');
};

// ---------------- 结算 ----------------
Meta.payout = function (run) {
  var D = META_DATA.PAYOUT, t = run.time || 0, parts = [], sum = 0, c = run.c;
  var add = function (label, v) { v = Math.max(0, Math.round(v)); if (v > 0) { parts.push([label, v]); sum += v; } };
  if (t >= D.zeroTime || run.won) {
    if (run.stage > 1) add('到达第 ' + run.stage + ' 关', (run.stage - 1) * D.stage);
    if (run.won) add('通关', D.win);
    if (c.bosses) add('关卡 Boss ×' + c.bosses, c.bosses * D.boss);
    if (c.minis) add('小 Boss ×' + c.minis, c.minis * D.mini);
    add('击杀 ' + Meta.fmt(c.kills), c.kills * (15 / (run.minutes || 15)) / D.killsPer);
    add('等级 ' + run.level, (run.level - 1) * D.level);
    if (t >= D.minTime) add('参与奖', D.base);
  }
  var td = Meta.tierDef(run.tier);
  return { parts: parts, sum: sum, mult: td.mc, total: Math.round(sum * td.mc) };
};

Meta.settle = function (how) {
  var run = Meta.run;
  if (!run) return null;
  if (run.settled) return run.result;
  if (Game.charId === run.char) Meta.capture(run);
  Meta.flushToasts();      // 还没轮到的成就提示不再弹（结算界面会全部列出来）
  return Meta.finish(run, how);
};

// 把一局的统计并进生涯：总数、最佳、每位骑士的记录、通关次数、魔晶；再检查成就
Meta.finish = function (run, how) {
  var p = Meta.p, won = how === 'win', k;
  run.how = how; run.won = won; run.settled = true;
  if (won) run.stage = Math.max(run.stage, 3);
  var pay = Meta.payout(run);
  // 开局不到 30 秒就退出的不算一局（计数照样加）
  var counts = how !== 'quit' || run.time >= META_DATA.PAYOUT.zeroTime;
  if (counts) p.life.runs = (p.life.runs || 0) + 1;
  for (k in run.c) if (k !== 'runs') p.life[k] = (p.life[k] || 0) + run.c[k];
  for (k in run.x) if (run.x[k] > (p.best[k] || 0)) p.best[k] = run.x[k];
  for (k in run.wk) p.wk[k] = (p.wk[k] || 0) + run.wk[k];
  var tierBefore = Meta.tierMax();
  if (won) p.wins[run.tier] = (p.wins[run.tier] || 0) + 1;
  // 每位骑士的最佳记录（第一局不算“新纪录”）
  var news = [];
  if (counts) {
    var rec = p.chars[run.char] || (p.chars[run.char] = {});
    var first = !(rec.runs > 0);
    var better = function (key, v, label) {
      if (v > (rec[key] || 0)) { if (!first && label) news.push(label); rec[key] = v; }
    };
    rec.runs = (rec.runs || 0) + 1;
    if (won) {
      if (!first && !(rec.wins > 0)) news.push('第一次通关');
      rec.wins = (rec.wins || 0) + 1;
      if (run.tier > (rec.tier || 0)) rec.tier = run.tier;
    }
    better('stage', run.stage, won ? '' : '最远关卡');
    better('time', Math.floor(run.time), '最长时间');
    better('level', run.level, '最高等级');
    better('kills', run.c.kills, '最多击杀');
  }
  p.mc += pay.total; p.mcTotal += pay.total;
  p.pending = null;
  Meta.ver++;
  var got = run.newAch;
  Meta.sink = got;
  try { Meta.checkAch(); } finally { Meta.sink = null; }
  Meta.save();
  var tierAfter = Meta.tierMax();
  run.result = { how: how, won: won, tier: run.tier, char: run.char, pay: pay, balance: p.mc, newAch: got.slice(), news: news, tierUp: tierAfter > tierBefore ? tierAfter : 0 };
  Meta.emit('settle', run.result);
  return run.result;
};

// ---------------- 包装：随机池（只在 progression.js 的几个函数外面套一层） ----------------
(function () {
  // 升级三选一：还锁着的武器 / 魔典临时放进放逐名单，选完马上拿掉（玩家自己放逐的不动）
  var opts = LevelUp.options, added = [];
  LevelUp.options = function () {
    var ban = LevelUp.banned, i, w = Meta.lockedIds('weapon'), t = Meta.lockedIds('tome');
    added.length = 0;
    if (ban) {
      for (i = 0; i < w.length; i++) if (!ban[w[i]]) { ban[w[i]] = true; added.push(w[i]); }
      for (i = 0; i < t.length; i++) if (!ban[t[i]]) { ban[t[i]] = true; added.push(t[i]); }
    }
    try { return opts.apply(this, arguments); }
    finally { for (i = 0; i < added.length; i++) delete ban[added[i]]; added.length = 0; }
  };
  // 宝箱 / 摩艾 / 商人：抽的时候临时换成过滤过的物品池
  var depth = 0;
  var pooled = function (fn) {
    return function () {
      if (depth > 0 || !Meta.lockedIds('item').length) return fn.apply(this, arguments);
      var saved = Items.byRarity;
      Items.byRarity = Meta.itemPools();
      depth++;
      try { return fn.apply(this, arguments); }
      finally { depth--; Items.byRarity = saved; }
    };
  };
  Items.roll = pooled(Items.roll);
  Items.rollOfRarity = pooled(Items.rollOfRarity);
  // 神龛：去掉还锁着的祝福（剩下的不到 3 个就不过滤）
  var shrine = LevelUp.shrineOptions;
  LevelUp.shrineOptions = function () {
    var lk = Meta.lockedIds('shrine');
    if (!lk.length || typeof SHRINE_STATS === 'undefined') return shrine.apply(this, arguments);
    var full = SHRINE_STATS, f = full.filter(function (s) { return lk.indexOf(s[0]) < 0; });
    if (f.length < 3) return shrine.apply(this, arguments);
    SHRINE_STATS = f;
    try { return shrine.apply(this, arguments); } finally { SHRINE_STATS = full; }
  };
  // 强化：开局加属性、起始金币；重抽 / 跳过 / 放逐次数
  var reset = P.reset;
  P.reset = function () {
    var r = reset.apply(this, arguments);
    try { Meta.applyUpgrades(); } catch (e) { Meta.err(e); }
    return r;
  };
  var lreset = LevelUp.reset;
  LevelUp.reset = function () {
    var r = lreset.apply(this, arguments);
    try {
      LevelUp.rerolls += Meta.upLevel('reroll');
      LevelUp.skips += Meta.upLevel('skip');
      LevelUp.banishes += Meta.upLevel('banish');
    } catch (e) { Meta.err(e); }
    return r;
  };
})();

// ---------------- 包装：难度倍率（乘在原来的倍率上；难度 I 原样返回） ----------------
(function () {
  var hp = Director.hpMult, dmg = Director.dmgMult, curve = Director.curve, upd = Director.update;
  Director.hpMult = function () {
    var v = hp.apply(this, arguments), t = META_DATA.TIERS[Meta.activeTier];
    return t && t.hp !== 1 ? v * t.hp : v;
  };
  Director.dmgMult = function () {
    var v = dmg.apply(this, arguments), t = META_DATA.TIERS[Meta.activeTier];
    return t && t.dmg !== 1 ? v * t.dmg : v;
  };
  // 刷怪压力：最少存活数和刷怪速度（curve 每次返回新对象，直接改它）
  Director.curve = function () {
    var c = curve.apply(this, arguments), t = META_DATA.TIERS[Meta.activeTier];
    if (c && t && t.spawn !== 1) { c.min *= t.spawn; c.rate *= t.spawn; }
    return c;
  };
  // 每帧统计（只在游戏进行中调用）
  Director.update = function (dt) {
    var r = upd.apply(this, arguments);
    if (Meta.run && !Meta.run.settled) { try { Meta.tick(dt); } catch (e) { Meta.err(e); } }
    return r;
  };
})();

// ---------------- 包装：游戏事件 ----------------
(function () {
  var kill = Enemies.kill;
  Enemies.kill = function (e) {
    var r = kill.apply(this, arguments);
    if (Meta.run && !Meta.run.settled) { try { Meta.onKill(e); } catch (err) { Meta.err(err); } }
    return r;
  };
  // 互动点：用之前看一眼能不能用（能用才算一次）；宝箱打开了算宝箱，其他算“互动”（传送门不算）
  var use = Interact.use;
  Interact.use = function () {
    var o = Interact.near, ok = false;
    try { ok = !!(o && !o.used && Game.state === 'play' && Meta.liveRun() && Interact.canUse(o)); } catch (e) { ok = false; }
    var r = use.apply(this, arguments);
    if (ok) {
      try {
        // 秘密地点里的秘宝箱（content_map.js 的 ctChest）也是宝箱；宝库的火盆只是解谜的一步，不算一次“互动”
        if (o.kind === 'chest' || o.kind === 'ctChest') { if (o.used) Meta.count('chests'); }
        else if (o.kind !== 'bossportal' && o.kind !== 'exitportal' && o.kind !== 'pot' && o.kind !== 'ctBrazier') {
          Meta.count('interacts');
          if (o.kind === 'succ') Meta.count('succ');
        }
      } catch (e) { Meta.err(e); }
    }
    return r;
  };
  var pot = Interact.breakPot;
  Interact.breakPot = function () { var r = pot.apply(this, arguments); Meta.count('pots'); return r; };
  var shrine = UI.shrineChoice;
  UI.shrineChoice = function () { var r = shrine.apply(this, arguments); Meta.count('shrines'); Meta.count('interacts'); return r; };
  if (typeof Evo !== 'undefined' && typeof Evo.evolve === 'function') {
    var evolve = Evo.evolve;
    Evo.evolve = function () { var r = evolve.apply(this, arguments); if (r) Meta.count('evos'); return r; };
  }
  if (typeof MX !== 'undefined') {
    var wrapMX = function (name, after) {
      var f = MX[name];
      if (typeof f !== 'function') return;
      MX[name] = function () { var r = f.apply(this, arguments); try { after.apply(this, arguments); } catch (e) { Meta.err(e); } return r; };
    };
    wrapMX('wish', function () { Meta.count('wishes'); });
    wrapMX('launch', function () { Meta.count('launches'); Meta.count('interacts'); });
    wrapMX('captureBanner', function () { Meta.count('interacts'); });
    wrapMX('explodeKeg', function () { Meta.count('kegs'); });
  }
})();

// Game.* 在 main.js 里定义（最后加载）：在 load 事件里包装（这个监听比 main.js 的先注册，先执行）
Meta.installGame = function () {
  try { Meta.installContent(); } catch (e) { Meta.err(e); }
  if (Meta.gameWrapped || typeof Game === 'undefined' || typeof Game.start !== 'function') return;
  Meta.gameWrapped = true;
  var start = Game.start, win = Game.win, death = Game.onDeath, toMenu = Game.toMenu;
  Game.start = function () {
    var quit = null;
    try {
      Meta.closeAll();
      if (Meta.run && !Meta.run.settled) quit = Meta.settle('quit');
      Meta.activeTier = Meta.selectedTier();
      if (Meta.p.notice !== 1 && Meta.noticeEl) { Meta.p.notice = 1; Meta.save(); }
      Meta.hideNotice();
    } catch (e) { Meta.err(e); }
    var r = start.apply(this, arguments);
    try {
      Meta.run = Meta.newRun();
      Meta.hudTier();
      if (quit && quit.pay.total > 0) Meta.note('上一局结算：+' + Meta.fmt(quit.pay.total) + ' 魔晶');
      if (Meta.activeTier > 1) {
        var td = Meta.tierDef(Meta.activeTier);
        Kit.toast('难度 ' + td.name + '：敌人更强 · 魔晶 ×' + td.mc, 'redL');
      }
    } catch (e) { Meta.err(e); }
    return r;
  };
  Game.win = function () {
    try { Meta.settle('win'); } catch (e) { Meta.err(e); }
    return win.apply(this, arguments);
  };
  Game.onDeath = function () {
    try { Meta.settle('death'); } catch (e) { Meta.err(e); }
    return death.apply(this, arguments);
  };
  // 从暂停回主菜单：按退出结算（结算完再建菜单，余额是新的）
  Game.toMenu = function () {
    var res = null;
    try { if (Meta.run && !Meta.run.settled) res = Meta.settle('quit'); } catch (e) { Meta.err(e); }
    var r = toMenu.apply(this, arguments);
    try { if (res && res.pay.total > 0) Meta.note('本局结算：+' + Meta.fmt(res.pay.total) + ' 魔晶' + (res.newAch.length ? '，完成 ' + res.newAch.length + ' 个成就' : '')); } catch (e) { Meta.err(e); }
    return r;
  };
};
if (document.readyState === 'complete') Meta.installGame();
else window.addEventListener('load', Meta.installGame);

// 难度 II / III：接在倒计时下面的关卡名后面（「第 1 关 · 森林 · 难度 II」，灰色，不单独占一行）。
// 写在 #stageName 的 data-tier 上，style.css 的 #stageName::after 显示它；每局开始时设一次，不是每帧
Meta.hudTier = function () {
  var sn = document.getElementById('stageName');
  if (!sn) return;
  var t = Meta.activeTier;
  if (t > 1) sn.setAttribute('data-tier', ' · 难度 ' + Meta.roman(t));
  else sn.removeAttribute('data-tier');
};

// 切到后台 / 关掉页面：存一份没结算的这一局
(function () {
  var save = function () { try { if (Meta.liveRun()) Meta.snapshot(); } catch (e) { /* 忽略 */ } };
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(); });
  window.addEventListener('pagehide', save);
})();

// ============================================================
//  界面
// ============================================================
// 像素小图标（字符画，. 是透明）
Meta.PX_PAL = {
  k: '#000000', W: '#ffffff', P: '#f3d2ff', M: '#c77dff', d: '#7a2fc0', g: '#b9c2d2', G: '#eef1f7',
  y: '#ffc928', Y: '#fff2a8', o: '#c27a0e', O: '#8a5208'
};
Meta.PX = {
  gem: ['...kkkkk...', '..kWWPPMk..', '.kWPPPMMMk.', 'kMMMMMMMMMk', 'kPPPPMMMddk', '.kPPPMMddk.', '..kPPMddk..', '...kPMdk...', '....kdk....', '.....k.....'],
  // 锁：9×11（难度按钮角上，9×11 像素，1 像素一格）；lockM 是同样的锁画成 12×14（骑士格子、解锁条件，12×14 像素，1 像素一格），
  // 都按整数倍画，像素一样大（不再把 9×11 拉成 12×14 / 10×12，粗细不匀）
  lock: ['..kkkkk..', '.kGGGGGk.', '.kGk.kgk.', '.kGk.kgk.', 'kkkkkkkkk', 'kYyyyyyok', 'kYyykyyok', 'kyyykyyok', 'kyyyyyyok', 'koooooOOk', 'kkkkkkkkk'],
  lockM: ['...kkkkkk...', '..kGGGGGGk..', '..kGkkkkgk..', '..kGk..kgk..', '..kGk..kgk..', 'kkkkkkkkkkkk', 'kYYyyyyyyyok', 'kYyyyyyyyyok',
    'kyyyykkyyyok', 'kyyyykkyyyok', 'kyyyyyyyyyok', 'kyyyyyyyyyok', 'kooooooooOOk', 'kkkkkkkkkkkk'],
  trophy: ['kkkkkkkkkkk', 'kYYyyyyyyok', 'kYyyyyyyyok', '.kYyyyyyok.', '.kYyyyyyok.', '..kyyyyok..', '...kyyok...', '....kyk....', '...kkykk...', '..kyyyyyok.', '..kkkkkkkk.']
};
Meta.pxSvg = function (name) {
  var rows = Meta.PX[name];
  if (!rows) return '';
  var paths = {}, x, y;
  for (y = 0; y < rows.length; y++) for (x = 0; x < rows[y].length; x++) {
    var ch = rows[y][x];
    if (Meta.PX_PAL[ch]) paths[ch] = (paths[ch] || '') + 'M' + x + ' ' + y + 'h1v1h-1z';
  }
  var s = '<svg viewBox="0 0 ' + rows[0].length + ' ' + rows.length + '" shape-rendering="crispEdges" aria-hidden="true">';
  for (var c in paths) s += '<path fill="' + Meta.PX_PAL[c] + '" d="' + paths[c] + '"/>';
  return s + '</svg>';
};
// 魔晶、奖杯用界面套件的图标（js/kit.js 的 Kit.ICONS：魔晶就是上面这颗 11×10 的、奖杯是 9×9 的；整数倍放大，大小由 CSS 的 --ip 定），
// 和价格按钮、成就小签是同一个；锁还是上面的字符画（灰色由 kit.css 的 .kmLock 给）
Meta.KIT_ICO = { gem: 1, trophy: 1 };
Meta.px = function (name, cls) {
  var i;
  if (Meta.KIT_ICO[name]) { i = Kit.icon(name); i.className = (cls || ('m' + name)) + ' ' + i.className; return i; }
  i = document.createElement('i'); i.className = cls || ('m' + name); i.innerHTML = Meta.pxSvg(name); return i;
};
Meta.gemHtml = function (cls) { return Meta.px('gem', cls || 'mgem').outerHTML; };
Meta.el = function (tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

// 样式只管布局和字号、颜色这些「变量」（字号 --fs-*、描边 --ol*、用途色，见 style.css 和 docs/knight-magic/design/UI_STYLE.md）；
// 边框、按钮、凹槽、进度条、小签、成就小签的样子都在 css/kit.css（元素带 .kmTile0 / .kmRow / .kmBar / .kmTag 这些 class，或者 kit.css 直接列了这里的选择器）。
// 这里不写边框、底色渐变、发光、圆角、字体：写了会盖掉 kit.css（这张样式表插在 kit.css 后面）
Meta.CSS = [
  // 旧变量名（魔晶色就是 style.css 的 --gemM / --gemL）
  ':root { --mc: var(--gemM); --mc2: var(--gemL); }',
  // 像素小图标：魔晶、奖杯是 kit 的 .kmIco（奖杯 9 × --ip、魔晶 11×10 × --ip，默认 2 像素一格：魔晶 22×20）；锁 12×14（lockM，1 像素一格）
  '.mgem, .mlock, .mtrophy { display: inline-block; flex: none; vertical-align: -3px; }',
  '.mlock { width: 12px; height: 14px; }',
  '.mlock svg { display: block; width: 100%; height: 100%; }',
  // 菜单标题行：选择骑士 · 已解锁 · 魔晶 · 全部解锁开关（右上角留给音量按钮）
  '#menu .menuHead.metaHead { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 12px; min-height: 44px; padding-right: 52px; }',
  '.metaHead .mhTitle { font-size: var(--fs-l); line-height: 30px; color: #fff; text-shadow: var(--ol1), 0 var(--o2) 0 #000; }',
  '.metaHead .mhCount { font-size: var(--fs-m); color: var(--muted); white-space: nowrap; }',
  // 魔晶余额：小图块边框（.kmTile0）+ 魔晶色像素加粗数字
  '.mhGem { display: inline-flex; align-items: center; gap: 6px; padding: 3px 9px 3px 6px; background-color: rgba(0, 0, 0, 0.45); white-space: nowrap; }',
  '.mhGem b { font-weight: 400; font-size: var(--fs-m); line-height: 18px; letter-spacing: var(--o); color: var(--gemL); text-shadow: var(--olB); }',
  '.mhCasual { margin-left: auto; position: relative; display: inline-flex; align-items: center; gap: 9px; min-height: 44px; padding: 0 6px; cursor: pointer; font-size: var(--fs-m); color: var(--muted); white-space: nowrap; }',
  '.mhCasual input, .mChk input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }',
  // 勾选框和勾上时的像素勾在 kit.css（.mBox）
  '.mBox { flex: none; position: relative; }',
  '.mhCasual input:focus-visible + .mBox { outline: 2px solid #fff; outline-offset: 2px; }',
  // 老玩家第一次进来：「全部解锁」一亮一暗闪 3 下（只动 opacity，3 秒）
  '.mhCasual.pulse { animation: mBlink 1s steps(1, end) 3; }',
  '@keyframes mBlink { 50% { opacity: 0.45; } }',
  // 骑士格子：锁住的头像灰一点（.kmLockedPic）+ 右上角一把小灰锁（.kmLock）；「新」= 左上角里面的小金签（Kit.tag）；选中的名字是金色（锁住的也是）
  '#charGrid .charCard { position: relative; }',
  '#charGrid .charCard.mLocked .charName { color: var(--dim); }',
  '#charGrid .charCard.sel.mLocked .charName { color: var(--goldM); }',
  '#charGrid .charCard .mLockBadge { position: absolute; top: 6px; right: 6px; pointer-events: none; }',
  '#charGrid .charCard .mNewBadge { position: absolute; top: 4px; left: 4px; z-index: 1; pointer-events: none; }',
  // 刚买下的骑士：格子往下落 6 像素（三格）
  '#charGrid .charCard.mJust { animation: mJust 0.3s steps(3, end); }',
  '@keyframes mJust { from { transform: translateY(-6px); } }',
  // 骑士介绍里的解锁条件：一个凹槽，锁 + 成就名（金色）/ 条件（灰色）两行，右边 150 像素的进度条（Kit.bar，数字在条里）
  '.cdLock { display: flex; align-items: center; flex-wrap: wrap; gap: 3px 12px; margin: 3px 0 6px; padding: 6px 9px; background-color: rgba(0, 0, 0, 0.35); }',
  '.cdLockHead { flex: 1 1 240px; min-width: 0; display: flex; align-items: flex-start; gap: 9px; font-size: var(--fs-m); line-height: 24px; }',
  '.cdLockHead .mlock { margin-top: 5px; }',
  '.cdLockTx { min-width: 0; color: var(--muted); }',
  '.cdLockTx b { display: block; font-weight: 400; color: var(--goldM); }',
  // 横屏面板太高时（Meta.fitLock）：成就名和条件放得下一行就并成一行
  '.cdLock.one .cdLockTx b { display: inline; margin-right: 9px; }',
  '.cdLock .kmBar { flex: 0 0 150px; }',
  // 最佳记录：12 号浅金色一行
  '.cdRec { margin-top: 3px; font-size: var(--fs-s); line-height: 18px; color: var(--goldL); }',
  // 关卡时长 + 难度：方块像素按钮（kit.css），放得下就一行，放不下自动换行；下面一行灰色的难度说明
  '#metaSet { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 6px 18px; }',
  '#metaSet #paceSetting .paceHint { display: none; }',
  '#metaSet #paceSetting .paceBtn { min-width: 0; padding: 6px 12px; }',
  '#tierSetting { display: flex; align-items: center; gap: 9px; }',
  '#tierSetting .tierLabel { font-size: var(--fs-m); color: var(--muted); }',
  '#tierSetting .tierOpts { display: flex; gap: 6px; }',
  '.tierBtn { position: relative; min-width: 48px; min-height: 44px; padding: 6px 12px; background-color: var(--panel2); color: #fff; font-size: var(--fs-m); line-height: 24px; cursor: pointer; touch-action: manipulation; }',
  '.tierBtn.locked { color: var(--dim); background-color: #1a2032; }',
  '.tierBtn .mlock { position: absolute; right: -3px; top: -6px; width: 9px; height: 11px; }',
  '#metaSetHint { flex-basis: 100%; font-size: var(--fs-m); line-height: 24px; color: var(--muted); }',
  '#metaSetHint.bad { color: var(--redL); }',
  // 解锁骑士（选中锁住的骑士时代替“开始游戏”，同一个位置同一个大小）：深蓝价格按钮（Kit.button 的 .kmPrice），钱不够时变暗
  '.sbtn.metaBuy { gap: 9px; }',
  '.sbtn.metaBuy:disabled { font-size: var(--fs-m); }',
  // 成就 / 强化 / 记录 / 操作说明（44 像素高的像素按钮）；小标记：成就数是 12 号浅金色数字，能买强化时一个金色小方块（.kmDot）
  '#metaBar { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; }',
  '#metaBar .sbtn { display: inline-flex; align-items: center; gap: 6px; }',
  '#metaBar .mbBadge { font-size: var(--fs-s); letter-spacing: var(--o); color: var(--goldL); text-shadow: var(--olB); }',
  // 弹出页（盖在菜单上）：面板边框在 kit.css；标题 36 号金色，副标题 18 号灰色，右上角 48 像素的关闭按钮
  '#metaLayer, #metaConfirm { position: fixed; inset: 0; z-index: 20; display: flex; align-items: center; justify-content: center; padding: max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)); background: rgba(3, 7, 16, 0.72); }',
  '#metaConfirm { z-index: 22; background: rgba(3, 7, 16, 0.55); }',
  '.mlPanel { position: relative; width: min(920px, 100%); max-height: 100%; display: flex; flex-direction: column; text-align: left; animation: kmPanelIn 0.15s steps(3, jump-start); }',
  '.mlHead { flex: none; display: flex; align-items: center; flex-wrap: wrap; gap: 3px 12px; padding: 12px 12px 12px 18px; border-bottom: 2px solid #000; box-shadow: 0 2px 0 rgba(255, 255, 255, 0.05); }',
  '.mlHead h2 { margin: 0; font-size: var(--fs-xl); line-height: 42px; color: var(--goldM); text-shadow: var(--ol3); }',
  '.mlSub { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-m); color: var(--muted); }',
  '.mlSub b { font-weight: 400; letter-spacing: var(--o); color: var(--goldM); }',
  '.mlSub .mgem + b { color: var(--gemL); }',
  '.mlClose { margin-left: auto; width: 48px; height: 48px; padding: 0; background-color: var(--panel2); color: #fff; font-size: var(--fs-l); line-height: 24px; cursor: pointer; }',
  // 左右内边距 15（3 的倍数）：920 宽的页面里正好 884 像素，记录的三列各 288、成就 / 强化的两列各 437.5，格子都从整像素或半像素开始
  '.mlBody { flex: 1 1 auto; min-height: 0; overflow-x: hidden; overflow-y: auto; -webkit-overflow-scrolling: touch; touch-action: pan-y; overscroll-behavior: contain; padding: 12px 15px 15px; }',
  '.mlFoot { flex: none; display: flex; align-items: center; justify-content: flex-end; flex-wrap: wrap; gap: 9px 12px; padding: 9px 15px 12px; border-top: 2px solid #000; }',
  '.mlFoot .mlNote { margin-right: auto; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '.mlBody h3 { margin: 12px 0 6px; font-size: var(--fs-m); line-height: 24px; color: var(--muted); }',
  '.mlBody h3:first-child { margin-top: 0; }',
  // 成就：每行一个凹槽（.kmRow；完成的 .kmDone = 左边一条金边）；名字 18 号，进度数字在名字那一行右边，底下 8 像素的细金条；完成的不要进度条
  '.maList { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 6px 9px; }',
  '.maRow { display: flex; gap: 12px; align-items: flex-start; padding: 9px 12px 9px 9px; }',
  '.maRow .cardIcon { width: 48px; height: 48px; }',
  '.maRow .cardIcon.hasIcon { width: 40px; height: 40px; margin: 4px; }',
  // 魔晶 / 奖杯的 40 像素图块：平的深色底（不要 3D 图标那种中间亮的底）；成就行里 3 像素一格（魔晶 33×30、奖杯 27×27），
  // 结算的新解锁里魔晶 2 像素一格（22×20）
  '.cardIcon.mcIcon { background-color: #141b30 !important; background-image: none !important; }',
  '.cardIcon.mcIcon .kmIco { --ip: 3px; }',
  '.meItem .cardIcon.mcIcon .kmGem { --ip: 2px; }',
  '.maMain { flex: 1; min-width: 0; }',
  '.maTop { display: flex; align-items: center; gap: 9px; }',
  '.maName { font-size: var(--fs-m); line-height: 24px; }',
  '.maRow.done .maName { color: var(--goldM); }',
  '.maCheck, .maCnt { margin-left: auto; flex: none; }',
  '.maCnt { font-size: var(--fs-s); line-height: 24px; letter-spacing: var(--o); color: var(--muted); }',
  '.maDesc { margin-top: 1px; font-size: var(--fs-s); line-height: 18px; color: #c9d3ea; text-wrap: balance; }',
  '.maRew { margin-top: 2px; font-size: var(--fs-s); line-height: 18px; color: var(--goldL); }',
  '.maRow .kmBar { margin-top: 6px; }',
  // 强化：两列；每行 = 图标 + 名字 + 效果（上）/ 等级格（下，.kmPips），右边一个自然宽度的价格按钮（至少 136 像素）
  '.muGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 6px 9px; }',
  '.muCard { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-areas: "top buy" "pips buy"; align-items: center; gap: 6px 12px; padding: 9px; }',
  '.muTop { grid-area: top; display: flex; gap: 9px; align-items: center; }',
  '.muTop .cardIcon, .muTop .cardIcon.hasIcon { width: 40px; height: 40px; margin: 0; font-size: var(--fs-m); }',
  '.muName { font-size: var(--fs-m); line-height: 24px; }',
  '.muEff { font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '.muEff b { font-weight: 400; color: #8fe07a; }',
  '.muPips { grid-area: pips; padding-left: 49px; }',
  '.muBuy { grid-area: buy; min-width: 136px; }',
  // 记录：生涯 3 列（竖屏 2 列）；每位骑士一行凹槽，最佳记录 18 号；清除存档在一个淡红色的凹槽里
  '.mrGrid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 2px 10px; }',
  '.mrGrid .statRow { padding: 3px 9px; }',
  '.mrTable { display: flex; flex-direction: column; gap: 4px; }',
  '.mrRow { display: flex; align-items: center; gap: 12px; padding: 3px 9px 3px 3px; }',
  '.mrRow .charIcon { flex: none; width: 40px; height: 40px; }',
  '.mrName { flex: none; width: 120px; font-size: var(--fs-m); line-height: 24px; }',
  '.mrRow.locked .mrName { color: var(--dim); }',
  '.mrBest { flex: 1; min-width: 0; font-size: var(--fs-m); line-height: 24px; color: #c9d3ea; }',
  '.mrBest .gold { color: var(--goldM); }',
  '.mrDanger { margin-top: 18px; display: flex; align-items: center; flex-wrap: wrap; gap: 9px 12px; padding: 9px 12px; background-color: rgba(163, 38, 44, 0.16); }',
  '.mrDanger .mlNote { flex: 1; min-width: 200px; font-size: var(--fs-s); line-height: 18px; color: var(--redL); }',
  '.mrWarn { margin-bottom: 9px; padding: 9px 12px; background-color: rgba(184, 134, 15, 0.2); font-size: var(--fs-s); line-height: 18px; color: var(--goldL); }',
  // 操作说明：凹槽里的 18 号段落（行高 27）
  '.mlPanel.helpPanel { width: min(760px, 100%); }',
  '.mhHelp .keys { margin: 0 0 6px; padding: 9px 12px; background-color: rgba(255, 255, 255, 0.04); font-size: var(--fs-m); line-height: 27px; color: var(--text2); text-align: left; text-wrap: pretty; }',
  // 确认框：正文 18 号，小字 12 号
  '.mcPanel { width: min(480px, 100%); }',
  '.mcPanel .mlBody { font-size: var(--fs-m); line-height: 27px; color: #fff; text-wrap: pretty; }',
  '.mcPanel .mcFine { font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '.mcPanel .mcBad { color: var(--redL); }',
  // 老玩家第一次打开的说明卡（面板边框在 kit.css）：横屏在左下角 420 宽，竖屏在最上面盖住标题字、两列（不挡 3D 骑士和选择面板）
  '#metaNotice { position: fixed; z-index: 15; left: max(24px, env(safe-area-inset-left, 0px)); bottom: max(24px, env(safe-area-inset-bottom, 0px)); width: 420px; max-width: calc(100vw - 48px); padding: 12px 15px 15px; text-align: left; animation: kmPanelIn 0.15s steps(3, jump-start); }',
  '#metaNotice .mnTitle { display: flex; align-items: center; gap: 9px; font-size: var(--fs-l); line-height: 30px; color: var(--goldM); text-shadow: var(--ol1), 0 var(--o2) 0 #000; }',
  // 标题前的奖杯 3 像素一格（27 像素，和成就小签的奖杯一样大）
  '#metaNotice .mnTitle .kmIco { --ip: 3px; }',
  '#metaNotice ul { margin: 9px 0 12px; padding-left: 0; list-style: none; font-size: var(--fs-m); line-height: 24px; color: var(--text2); }',
  '#metaNotice li { position: relative; margin: 3px 0; padding-left: 15px; }',
  '#metaNotice li::before { content: ""; position: absolute; left: 0; top: 9px; width: 6px; height: 6px; background: var(--goldM); box-shadow: 0 0 0 2px #000; }',
  '#metaNotice li b { font-weight: 400; color: var(--goldM); }',
  '#metaNotice li b.kmGemN { color: var(--gemL); }',
  '#metaNotice .mnBtns { display: flex; flex-wrap: wrap; gap: 9px; }',
  // 两个按钮各占一半，宽度取整数（字居中时不落在半个设备像素上）
  '#metaNotice .sbtn { flex: 0 0 auto; width: calc(50% - 4.5px); width: round(down, calc(50% - 4.5px), 1px); padding: 9px; }',
  '@media (max-width: 760px), (orientation: portrait) {',
  '  #metaNotice { left: max(16px, env(safe-area-inset-left, 0px)); right: max(16px, env(safe-area-inset-right, 0px)); top: max(12px, env(safe-area-inset-top, 0px)); bottom: auto; width: auto; max-width: 780px; margin: 0 auto; padding: 9px 15px 12px; }',
  '  #metaNotice ul { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 18px; margin: 6px 0 9px; }',
  '  #metaNotice .mnBtns { max-width: 480px; margin: 0 auto; }',
  '}',
  // 结算界面：魔晶一个凹槽；获得的魔晶是 36 号魔晶色像素加粗大字；明细一行 12 号小字；新解锁两列一样宽的小签
  '#metaEnd { margin: 12px auto 3px; max-width: 560px; padding: 9px 15px 12px; background-color: var(--well); text-align: center; }',
  '.meHead { display: flex; align-items: center; justify-content: center; gap: 9px; }',
  '.meLabel { font-size: var(--fs-m); color: #fff; text-shadow: none; }',
  '.meNum { font-size: var(--fs-xl); line-height: 42px; letter-spacing: var(--o); color: var(--gemL); text-shadow: var(--olB3); }',
  '.meNum.pop { animation: pop 0.2s steps(2, end); }',
  '.meParts { display: flex; flex-wrap: wrap; justify-content: center; gap: 0 12px; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '.meBal { display: inline-flex; align-items: center; gap: 6px; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  // 22×20 的魔晶放在 18 像素高的一行里：上下各伸出 1 像素，不把这一行撑高
  '.meBal .mgem { margin: -1px 0; }',
  '.meRec { margin-top: 3px; font-size: var(--fs-m); line-height: 24px; color: var(--goldM); text-shadow: none; }',
  '.meNewTitle { margin: 9px 0 6px; font-size: var(--fs-m); line-height: 24px; color: var(--goldM); text-shadow: none; }',
  '.meNew { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; text-align: left; }',
  '.meItem { display: flex; align-items: center; gap: 9px; padding: 3px 12px 3px 3px; animation: kmSlipIn 0.15s steps(3, jump-start) backwards; }',
  '.meItem .cardIcon { flex: none; width: 40px; height: 40px; }',
  '.meItemT { font-size: var(--fs-s); line-height: 18px; color: var(--goldL); }',
  '.meItemN { font-size: var(--fs-m); line-height: 24px; }',
  // 局内成就小签（Kit.slip，样子在 kit.css）：右上角小地图下面，一次一个；菜单里在左下角 / 竖屏在上面
  '#metaToasts { position: fixed; z-index: 30; right: max(12px, env(safe-area-inset-right, 0px)); top: calc(env(safe-area-inset-top, 0px) + 246px); display: flex; flex-direction: column; align-items: flex-end; gap: 9px; pointer-events: none; transition: opacity 0.2s steps(2, end); }',
  // 升级、宝箱、商人、暂停、结算这些弹窗开着时不显示（不盖住卡片；排队的等弹窗关了再弹，见 Meta.pumpToast）
  '#modalBg:not(.hidden) ~ #metaToasts { opacity: 0; }',
  '#metaToasts.inMenu { right: auto; top: auto; left: max(24px, env(safe-area-inset-left, 0px)); bottom: max(24px, env(safe-area-inset-bottom, 0px)); align-items: flex-start; }',
  '@media (max-width: 760px), (orientation: portrait) { #metaToasts.inMenu { left: 50%; bottom: auto; top: calc(env(safe-area-inset-top, 0px) + 140px); transform: translateX(-50%); align-items: center; } .mrGrid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }',
  // 横屏面板差不多满高（iPad 834、笔记本 800、iPad 10.2 寸 810）：间距收紧一点，介绍长的骑士（锁住的、有记录的）也不用滚动
  '@media (orientation: landscape) and (max-height: 900px) and (min-height: 701px) {',
  // （上边距和 44 像素高的标题行不动：右上角音量按钮按这个高度摆）
  '  #menu .menuInner { gap: 6px; padding-bottom: 11px; }',
  // 介绍最多 264 像素高（iPad Pro 11 横屏面板就不会超过 800 像素）；现在的文案都放得下，以后文案变长了才会在这一格里滚动
  '  #menu #charDesc { padding-top: 6px; padding-bottom: 6px; max-height: 264px; overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; scrollbar-width: none; }',
  '  #menu #charDesc::-webkit-scrollbar { display: none; }',
  '  #menu .menuInner .sbtn.big { padding-top: 6px; padding-bottom: 6px; }',
  '}',
  // 比 iPad Pro 11 矮的横屏（iPad 10.2 寸 810、笔记本 800）：骑士头像用 1 倍的 36 像素图标（和竖屏一样，格子矮 18 像素），
  // 介绍的最大高度跟着屏幕高度走
  '@media (orientation: landscape) and (max-height: 833px) and (min-height: 701px) {',
  '  #charGrid .charIcon.hasIcon { width: 40px; height: 40px; }',
  '  #menu #charDesc { max-height: calc(100vh - 512px); }',
  '}',
  // 面板不到 620 宽的横屏（iPad 10.2 寸 1080 宽）：关卡时长和难度的间距收一点，放得下一行
  '@media (orientation: landscape) and (max-width: 1150px) and (min-width: 761px) {',
  '  #metaSet { column-gap: 12px; }',
  '  #metaSet #paceSetting { gap: 6px; }',
  '}',
  // 矮屏横屏（笔记本窗口）：标题行紧凑一点
  '@media (max-height: 700px) and (orientation: landscape) {',
  '  .menuInner .menuHead.metaHead { display: flex; min-height: 36px; }',
  '  .metaHead .mhTitle { display: none; }',
  '  #metaSetHint { display: none; }',
  '  #metaBar .sbtn { min-height: 40px; padding: 4px 12px; }',
  '  #menu { padding-top: max(6px, env(safe-area-inset-top, 0px)); padding-bottom: max(6px, env(safe-area-inset-bottom, 0px)); }',
  '  #menu .menuInner { gap: 7px; }',
  '  #menu .menuInner .sbtn.big { padding-top: 6px; padding-bottom: 6px; font-size: var(--fs-l); }',
  '}',
  '@media (prefers-reduced-motion: reduce) { .mhCasual.pulse, .mlPanel, #metaNotice, .mToast, .meItem, .meNum.pop, #charGrid .charCard.mJust { animation: none; } }'
].join('\n');

Meta.injectCss = function () {
  if (document.getElementById('metaCss')) return;
  var st = document.createElement('style');
  st.id = 'metaCss';
  st.textContent = Meta.CSS;
  (document.head || document.documentElement).appendChild(st);
};

// ---------------- 主菜单 ----------------
Meta.menuInject = function () {
  if (Meta.uiReady) return true;
  var menu = document.getElementById('menu'), inner = menu && menu.querySelector('.menuInner');
  var start = inner && inner.querySelector('[data-act="start"]');
  if (!inner || !start) return false;
  Meta.injectCss();
  // 标题行
  var head = inner.querySelector('.menuHead');
  if (!head) { head = Meta.el('div', 'menuHead'); inner.insertBefore(head, inner.firstChild); }
  head.classList.add('metaHead');
  head.innerHTML = '<span class="mhTitle">选择骑士</span><span class="mhCount"></span><span class="mhGem kmTile0" title="魔晶">' + Meta.gemHtml() + '<b></b></span>' +
    '<label class="mhCasual"><input type="checkbox" id="metaCasual"><span class="mBox"></span><span>全部解锁</span></label>';
  head.querySelector('#metaCasual').addEventListener('change', function () { Meta.setCasual(this.checked); });
  // 关卡时长（pace.js 加的）+ 难度：放进同一个容器
  var pace = document.getElementById('paceSetting');
  var set = Meta.el('div');
  set.id = 'metaSet';
  inner.insertBefore(set, pace && pace.parentNode === inner ? pace : start);
  if (pace) set.appendChild(pace);
  var tier = Meta.el('div');
  tier.id = 'tierSetting';
  tier.innerHTML = '<span class="tierLabel">难度</span><div class="tierOpts"></div>';
  [1, 2, 3].forEach(function (t) {
    var b = Meta.el('button', 'tierBtn', Meta.roman(t));
    b.type = 'button';
    b.dataset.tier = String(t);
    b.setAttribute('aria-label', '难度 ' + Meta.roman(t));
    tier.querySelector('.tierOpts').appendChild(b);
  });
  set.appendChild(tier);
  var hint = Meta.el('div');
  hint.id = 'metaSetHint';
  set.appendChild(hint);
  // 解锁按钮（选中锁住的骑士时代替“开始游戏”）：价格按钮（Kit.button 的样子，内容在 Meta.renderMenu 里写）
  var buy = Meta.el('button', 'sbtn big metaBuy kmPrice hidden');
  buy.id = 'metaBuy';
  buy.type = 'button';
  start.parentNode.insertBefore(buy, start.nextSibling);
  // 成就 / 强化 / 记录 / 操作说明
  var bar = Meta.el('div');
  bar.id = 'metaBar';
  bar.innerHTML = '<button type="button" class="sbtn kmSmall" data-meta="ach">' + Meta.pxSvgI('trophy') + '成就<span class="mbBadge"></span></button>' +
    '<button type="button" class="sbtn kmSmall" data-meta="up">' + Meta.gemHtml() + '强化<span class="mbDot kmDot hidden"></span></button>' +
    '<button type="button" class="sbtn kmSmall" data-meta="rec">记录</button>' +
    '<button type="button" class="sbtn kmSmall" data-meta="help">操作说明</button>';
  inner.insertBefore(bar, buy.nextSibling);
  // 菜单下面的长操作说明收进「操作说明」（原来的元素留在菜单里，只是藏起来）
  var keys = inner.querySelectorAll('.keys');
  if (keys.length) {
    var src = Meta.el('div', 'hidden');
    src.id = 'metaHelpSrc';
    inner.appendChild(src);
    for (var i = 0; i < keys.length; i++) src.appendChild(keys[i]);
  }
  menu.addEventListener('click', Meta.onMenuClick);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && Game.state === 'menu' && (Meta.layer || Meta.confirmEl)) { Meta.closeTop(); e.preventDefault(); }
  });
  Meta.uiReady = true;
  // 老玩家第一次打开：说明卡 + 礼包
  if (Meta.returning && Meta.p.notice !== 1) Meta.showNotice();
  if (Meta.restored && Meta.restored.pay.total > 0) Meta.note('上一局没有结束就离开了：已结算 +' + Meta.fmt(Meta.restored.pay.total) + ' 魔晶');
  return true;
};
Meta.pxSvgI = function (name) { return Meta.px(name).outerHTML; };

Meta.onMenuClick = function (e) {
  var t = e.target;
  if (!t || !t.closest) return;
  var b;
  if ((b = t.closest('[data-meta]'))) { Meta.openLayer(b.dataset.meta); return; }
  if ((b = t.closest('.tierBtn'))) { Meta.pickTier(+b.dataset.tier); return; }
  if ((b = t.closest('#metaBuy'))) { if (!b.disabled) Meta.askBuy(UI.selected); return; }
  if ((b = t.closest('[data-mn]'))) { Meta.noticeChoice(b.dataset.mn); return; }
  if ((b = t.closest('[data-up]'))) { if (!b.disabled && Meta.buyUpgrade(b.dataset.up)) { Meta.renderLayer(); Meta.renderMenu(); } return; }
  if ((b = t.closest('[data-mact]'))) { Meta.layerAction(b.dataset.mact); return; }
  if (t.closest('.mlClose')) { Meta.closeTop(); return; }
  if (t.id === 'metaLayer' || t.id === 'metaConfirm') { Meta.closeTop(); }
};

Meta.setCasual = function (on) {
  Meta.p.casual = !!on;
  Meta.ver++;
  Meta.save();
  if (Meta.noticeEl) Meta.noticeChoice(on ? 'casual' : 'ok', true);
  UI.buildMenu();
};

// 选中锁住的骑士：介绍里写解锁条件和进度，开始按钮换成购买按钮
Meta.renderMenu = function () {
  if (!Meta.menuInject()) return;
  var p = Meta.p, sel = UI.selected, locked = !Meta.isUnlocked('knight', sel);
  var head = document.querySelector('#menu .metaHead');
  if (head) {
    head.querySelector('.mhCount').textContent = p.casual ? '休闲模式 · 全部可选' : '已解锁 ' + Meta.knightCount() + '/' + Meta.knightTotal();
    head.querySelector('.mhGem b').textContent = Meta.fmt(p.mc);
    var cb = head.querySelector('#metaCasual');
    if (cb) cb.checked = !!p.casual;
  }
  // 骑士格子
  var cards = document.querySelectorAll('#charGrid .charCard');
  for (var i = 0; i < cards.length; i++) {
    var card = cards[i], cid = card.dataset.id, lk = !Meta.isUnlocked('knight', cid);
    card.classList.toggle('mLocked', lk);
    var pic = card.querySelector('.charIcon');
    if (pic) pic.classList.toggle('kmLockedPic', lk);
    var badge = card.querySelector('.mLockBadge');
    if (lk && !badge) { badge = Meta.px('lockM', 'mlock mLockBadge kmLock'); card.appendChild(badge); }
    else if (!lk && badge) badge.remove();
    var isNew = !lk && !Meta.START[cid] && Meta.owns('knight', cid) && !(p.chars[cid] && p.chars[cid].runs > 0);
    var nb = card.querySelector('.mNewBadge');
    if (isNew && !nb) { nb = Kit.tag('新'); nb.classList.add('mNewBadge'); card.appendChild(nb); }
    else if (!isNew && nb) nb.remove();
    card.setAttribute('aria-label', CHARACTERS[cid] ? CHARACTERS[cid].name + (lk ? '（未解锁）' : '') : cid);
  }
  Meta.renderDesc(sel, locked);
  // 开始 / 购买
  var start = document.querySelector('#menu [data-act="start"]'), buy = document.getElementById('metaBuy');
  if (start) start.classList.toggle('hidden', locked);
  if (buy) {
    buy.classList.toggle('hidden', !locked);
    if (locked) {
      // 「解锁骑士 ◆600」；钱不够：「◆600 · 还差 260」（按钮变暗）
      var price = META_DATA.KNIGHT_PRICE[sel] || 500, can = p.mc >= price;
      buy.disabled = !can;
      Meta.priceLabel(buy, can ? '解锁骑士' : '', price, can ? '' : ' · 还差 ' + Meta.fmt(price - p.mc));
    }
  }
  Meta.renderTier();
  // 按钮上的小标记
  var ab = document.querySelector('#metaBar .mbBadge');
  if (ab) ab.textContent = Meta.achDone() + '/' + META_DATA.ACHIEVEMENTS.length;
  var dot = document.querySelector('#metaBar .mbDot');
  if (dot) dot.classList.toggle('hidden', !Meta.upCanBuyAny());
  Meta.fitLock();
};
// 解锁条件默认两行（成就名一行、条件一行）；横屏面板放不下（超过 800 像素或者屏幕高度）时，
// 放得下一行的就并成一行（「成就「风驰电掣」 移动速度达到 30」），省出一行给介绍
Meta.MENU_MAX = 800;
Meta.fitLock = function () {
  var box = document.getElementById('charDesc'), d = box && box.querySelector('.cdLock'), tx = d && d.querySelector('.cdLockTx');
  var menu = document.getElementById('menu'), inner = menu && menu.querySelector('.menuInner');
  if (!tx || !inner) return;
  d.classList.remove('one');
  var cs = getComputedStyle(menu), room = Math.min(Meta.MENU_MAX, menu.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom));
  // 面板太高，或者介绍那一格已经要滚动了（横屏介绍有最大高度）
  if (!inner.offsetHeight || (inner.offsetHeight <= room && box.scrollHeight <= box.clientHeight + 1)) return;
  d.classList.add('one');
  if (tx.offsetHeight > 30) d.classList.remove('one');
};
window.addEventListener('resize', function () { try { Meta.fitLock(); } catch (e) { /* 忽略 */ } });

// 最佳记录一行：「最佳：已通关 · 45:10 · Lv 31 · 击杀 1,650」（局数、最高难度这些放记录页）
Meta.recText = function (rec) {
  if (!rec || !(rec.runs > 0)) return '还没有出战过';
  var parts = [rec.wins > 0 ? '已通关' : '最远第 ' + (rec.stage || 1) + ' 关', fmtTime(rec.time || 0), 'Lv ' + (rec.level || 1), '击杀 ' + Meta.fmt(rec.kills || 0)];
  return '最佳：' + parts.join(' · ');
};
// 价格按钮的内容（和 Kit.button 的价格按钮一样）：文字 + 魔晶图标 + 魔晶色数字 + 后面的字
Meta.priceLabel = function (b, label, price, after) {
  var k = Kit.button({ label: label, price: price, after: after });
  b.textContent = '';
  while (k.firstChild) b.appendChild(k.firstChild);
  b.classList.add('kmPrice');
  return b;
};
// 去掉括号里的举例（「累计击杀 800 个被冻住的敌人（冰霜行者、冰块……）」→「累计击杀 800 个被冻住的敌人」）
Meta.plain = function (s) { return String(s == null ? '' : s).replace(/（[^）]*）/g, ''); };

Meta.renderDesc = function (sel, locked) {
  var box = document.getElementById('charDesc');
  if (!box || !CHARACTERS[sel]) return;
  var old = box.querySelectorAll('.cdLock, .cdRec');
  for (var i = 0; i < old.length; i++) old[i].remove();
  if (!locked) {
    box.appendChild(Meta.el('div', 'cdRec', Meta.recText(Meta.p.chars[sel])));
    return;
  }
  // 一个凹槽：灰色的锁 + 成就名（金色一行）+ 条件（灰色一行，不要括号里的举例）+ 进度条（价格写在下面的解锁按钮上）；
  // 面板窄、条件长时进度条换到下一行
  var a = Meta.knightAch(sel);
  var d = Meta.el('div', 'cdLock');
  var h = Meta.el('div', 'cdLockHead');
  h.appendChild(Meta.px('lockM', 'mlock kmLock'));
  var tx = Meta.el('span', 'cdLockTx');
  tx.appendChild(Meta.el('b', '', a ? '成就「' + a.name + '」' : '未解锁'));
  if (a) tx.appendChild(document.createTextNode(Meta.plain(a.desc)));
  h.appendChild(tx);
  d.appendChild(h);
  if (a) d.appendChild(Meta.bar(a));
  var title = box.querySelector('.cdTitle');
  box.insertBefore(d, title ? title.nextSibling : box.firstChild);
};

// 进度条（Kit.bar）：18 像素高、数字在条里；thin = 列表行底下 8 像素的细条（数字写在名字那一行）
Meta.bar = function (a, doneFlag, thin) {
  var v = Meta.value(a.m), done = doneFlag || !!Meta.p.ach[a.id], goal = a.goal > 0 ? a.goal : 1;
  var b = Kit.bar({ v: done ? goal : clamp(v, 0, goal), max: goal, done: done, thin: !!thin,
    text: done ? '已完成' : Meta.fmtVal(a, Math.min(v, a.goal)) + ' / ' + Meta.fmtVal(a, a.goal) });
  b.classList.add('mBar');
  return b;
};

Meta.renderTier = function (msg) {
  var cur = Meta.selectedTier(), btns = document.querySelectorAll('#tierSetting .tierBtn');
  for (var i = 0; i < btns.length; i++) {
    var b = btns[i], t = +b.dataset.tier, ok = Meta.tierOk(t);
    b.classList.toggle('sel', t === cur);
    b.classList.toggle('locked', !ok);
    var lk = b.querySelector('.mlock');
    if (!ok && !lk) b.appendChild(Meta.px('lock', 'mlock kmLock'));
    else if (ok && lk) lk.remove();
    b.setAttribute('aria-pressed', t === cur ? 'true' : 'false');
  }
  var hint = document.getElementById('metaSetHint');
  if (!hint) return;
  hint.classList.toggle('bad', !!msg);
  if (msg) { hint.textContent = msg; return; }
  // 一行短话，选中哪档写哪档（「难度 II：敌人更强 · 魔晶 ×1.5 · 通关解锁 III」）；具体倍率（META_DATA.TIERS 的 desc）以后放进图鉴
  var td = Meta.tierDef(cur), next = cur < 3 && !Meta.tierOk(cur + 1);
  hint.textContent = '难度 ' + td.name + '：' + (cur === 1 ? '标准' : '敌人更强 · 魔晶 ×' + td.mc) + (next ? ' · 通关解锁 ' + Meta.roman(cur + 1) : '');
};

Meta.pickTier = function (t) {
  if (!Meta.tierOk(t)) {
    Meta.renderTier(t === 2 ? '难度 II 还没解锁：先通关一次' : '难度 III 还没解锁：先在难度 II 通关一次');
    clearTimeout(Meta.tierMsgT);
    Meta.tierMsgT = setTimeout(function () { Meta.renderTier(); }, 2600);
    return;
  }
  Meta.p.tier = t;
  Meta.save();
  Meta.renderTier();
};

// ---------------- 购买骑士 ----------------
Meta.askBuy = function (cid) {
  var c = CHARACTERS[cid], price = META_DATA.KNIGHT_PRICE[cid] || 500, ach = Meta.knightAch(cid);
  if (!c || Meta.isUnlocked('knight', cid)) return;
  if (Meta.p.mc < price) return;
  Meta.confirm({
    title: '购买骑士',
    html: '花 ' + Meta.gemHtml() + '<b class="kmGemN">' + Meta.fmt(price) + '</b> 魔晶解锁「' + Meta.esc(c.name) + '」？<br><span class="mcFine">（余额 ' + Meta.fmt(Meta.p.mc) + '，买完剩 ' + Meta.fmt(Meta.p.mc - price) + '）' +
      (ach ? '<br>以后完成成就「' + Meta.esc(ach.name) + '」时，返还一半魔晶。' : '') + '</span>',
    ok: '购买', okClass: 'main',
    onOk: function () { Meta.buyKnight(cid); }
  });
};
Meta.buyKnight = function (cid) {
  var price = META_DATA.KNIGHT_PRICE[cid] || 500;
  if (Meta.owns('knight', cid) || Meta.p.mc < price) return false;
  Meta.p.mc -= price;
  Meta.unlock('knight', cid);
  Meta.p.bought[cid] = 1;
  // 说明卡还开着就用送的魔晶买了骑士：等于选了「先一个个解锁」，收起说明卡（不然提示会叠在说明卡上）
  if (Meta.noticeEl) Meta.noticeChoice('ok', true);
  Meta.save();
  Meta.checkAch();
  UI.selected = cid;
  try { UI.saveSettings(); } catch (e) { /* 忽略 */ }
  UI.buildMenu();
  var card = document.querySelector('#charGrid .charCard[data-id="' + cid + '"]');
  if (card) { card.classList.remove('mJust'); void card.offsetWidth; card.classList.add('mJust'); }
  Meta.note('解锁了骑士「' + CHARACTERS[cid].name + '」！');
  return true;
};
Meta.esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };

// ---------------- 弹出页：成就 / 强化 / 记录 / 操作说明 ----------------
Meta.openLayer = function (kind) {
  Meta.closeLayer();
  var L = Meta.el('div');
  L.id = 'metaLayer';
  L.dataset.kind = kind;
  L.innerHTML = '<div class="mlPanel" role="dialog" aria-modal="true"><div class="mlHead"><h2></h2><span class="mlSub"></span><button type="button" class="mlClose" aria-label="关闭">✕</button></div><div class="mlBody"></div><div class="mlFoot hidden"></div></div>';
  if (kind === 'help') L.querySelector('.mlPanel').classList.add('helpPanel');
  (document.getElementById('menu') || document.body).appendChild(L);
  Meta.layer = L;
  Meta.renderLayer();
};
Meta.closeLayer = function () { if (Meta.layer) { Meta.layer.remove(); Meta.layer = null; } };
Meta.closeTop = function () { if (Meta.confirmEl) Meta.closeConfirm(); else Meta.closeLayer(); };
Meta.closeAll = function () { Meta.closeConfirm(); Meta.closeLayer(); };

Meta.renderLayer = function () {
  var L = Meta.layer;
  if (!L) return;
  var kind = L.dataset.kind, body = L.querySelector('.mlBody'), foot = L.querySelector('.mlFoot');
  var scroll = body.scrollTop;
  body.innerHTML = '';
  foot.innerHTML = '';
  foot.classList.add('hidden');
  var h2 = L.querySelector('h2'), sub = L.querySelector('.mlSub');
  if (kind === 'ach') {
    h2.textContent = '成就';
    sub.innerHTML = '已完成 <b>' + Meta.achDone() + '</b> / ' + META_DATA.ACHIEVEMENTS.length;
    Meta.renderAch(body);
  } else if (kind === 'up') {
    h2.textContent = '强化';
    sub.innerHTML = Meta.gemHtml() + '<b>' + Meta.fmt(Meta.p.mc) + '</b> 魔晶';
    Meta.renderUp(body, foot);
  } else if (kind === 'rec') {
    h2.textContent = '记录';
    sub.textContent = '';
    Meta.renderRec(body);
  } else {
    h2.textContent = '操作说明';
    sub.textContent = '';
    // 原来菜单下面的几段说明（index.html 里的 .keys）：按内容加小标题，目标在前；触屏设备（iPad）上不显示键盘鼠标那一段
    var box = Meta.el('div', 'mhHelp'), src = document.querySelectorAll('#metaHelpSrc .keys'), secs = [];
    var touch = document.body.classList.contains('touch');
    for (var i = 0; i < src.length; i++) {
      var tx = src[i].textContent, t = '说明', rank = 3;
      if (/每关|Boss/.test(tx)) { t = '目标'; rank = 0; }
      else if (/iPad|触屏/.test(tx)) { t = 'iPad 触屏'; rank = touch ? 1 : 2; }
      else if (/WASD|鼠标/.test(tx)) { if (touch) continue; t = '键盘和鼠标'; rank = 1; }
      secs.push({ t: t, rank: rank, el: src[i] });
    }
    secs.sort(function (a, b) { return a.rank - b.rank; });
    secs.forEach(function (s) {
      box.appendChild(Meta.el('h3', '', s.t));
      var c = s.el.cloneNode(true);
      // 小标题已经是「iPad 触屏」：段落开头的「iPad：」不再说一遍
      if (s.t === 'iPad 触屏' && c.firstChild && c.firstChild.nodeType === 3) c.firstChild.nodeValue = c.firstChild.nodeValue.replace(/^\s*iPad[：:]\s*/, '');
      box.appendChild(c);
    });
    if (!secs.length) box.appendChild(Meta.el('div', 'keys', 'WASD 移动 · 鼠标转视角 · 空格跳跃 · E 互动 · Shift 滑铲'));
    body.appendChild(box);
  }
  body.scrollTop = scroll;
};

// 图块里放 3D 图标：已经画过的直接用；没画过的先显示汉字，之后每帧花几毫秒慢慢画
// （第一次画某种图标要编译着色器，不能卡在游戏帧里，比如结算那一帧）
Meta.iconQ = [];
Meta.tile = function (tile, kind, id, glyph, color) {
  var name = null;
  try { name = kind && typeof ICONS !== 'undefined' && UI.iconsOn() ? ICONS.nameFor(kind, id) : null; } catch (e) { name = null; }
  if (!name || ICONS.urls[name]) { UI.fillTile(tile, kind, id, glyph, color); return; }
  UI.fillTile(tile, null, null, glyph, color);
  Meta.iconQ.push([tile, kind, id, glyph, color]);
  if (!Meta.iconRaf) Meta.iconRaf = (window.requestAnimationFrame || window.setTimeout)(Meta.iconPump);
};
Meta.iconPump = function () {
  Meta.iconRaf = 0;
  var t0 = performance.now();
  while (Meta.iconQ.length && performance.now() - t0 < 6) {
    var q = Meta.iconQ.shift();
    if (q[0].isConnected) UI.fillTile(q[0], q[1], q[2], q[3], q[4]);
  }
  if (Meta.iconQ.length) Meta.iconRaf = (window.requestAnimationFrame || window.setTimeout)(Meta.iconPump);
};

// 奖励图标：骑士头像 / 武器 / 魔典 / 物品（游戏的 3D 图标），魔晶、奖杯用像素图标（和 3D 图标一样的深色图块）；
// 成就自己的像素图标（icon: ['px', 名字]，Kit.ICONS）也是这样的深色图块；只有一个字的（icon: ['glyph', 字, 颜色]）是符文砖（Kit.glyphTile）
Meta.iconTile = function (r, size) {
  var tile = Meta.el('div', 'cardIcon');
  if (!r || r.kind === 'mc' || (r.kind === 'px' && !Kit.ICONS[r.name])) { tile.classList.add('mcIcon', 'hasIcon'); tile.innerHTML = Meta.gemHtml(); return tile; }
  if (r.kind === 'trophy') { tile.classList.add('mcIcon', 'hasIcon'); tile.innerHTML = Meta.pxSvgI('trophy'); return tile; }
  if (r.kind === 'px') { tile.classList.add('mcIcon', 'hasIcon'); tile.appendChild(Kit.icon(r.name)); return tile; }
  if (r.kind === 'glyph') { Kit.glyphTile(tile, r.glyph, r.color); return tile; }
  var glyph = '?', color = 0x888888;
  if (r.kind === 'char') { glyph = CHARACTERS[r.id].icon; color = CHARACTERS[r.id].color; }
  else if (r.kind === 'weapon') { glyph = WEAPONS[r.id].icon; color = WEAPONS[r.id].color; }
  else if (r.kind === 'tome') { glyph = TOMES[r.id].icon; color = TOMES[r.id].color; }
  else if (r.kind === 'item') { glyph = ITEMS[r.id].icon; color = ITEMS[r.id].color; }
  Meta.tile(tile, r.kind, r.id, glyph, color);
  return tile;
};
Meta.achIcon = function (a) {
  if (a.icon && a.icon[0] === 'px') return { kind: 'px', name: a.icon[1] };
  if (a.icon && a.icon[0] === 'glyph') return { kind: 'glyph', glyph: a.icon[1], color: a.icon[2] };
  var parts = Meta.rewardParts(a);
  return parts[0] || { kind: 'mc' };
};

Meta.renderAch = function (body) {
  var p = Meta.p, list = META_DATA.ACHIEVEMENTS.map(function (a, i) {
    var done = !!p.ach[a.id], v = Meta.value(a.m);
    return { a: a, i: i, done: done, k: done ? 2 : clamp(v / a.goal, 0, 1), t: p.ach[a.id] || 0, v: v };
  });
  // 没完成的在前（快完成的排前面），完成的在后（新完成的排前面）
  list.sort(function (x, y) {
    if (x.done !== y.done) return x.done ? 1 : -1;
    if (x.done) return y.t - x.t || x.i - y.i;
    return y.k - x.k || x.i - y.i;
  });
  // 每行一个凹槽：进度数字在名字那一行右边，底下一条细金条；完成的：左边一条金边 +「已完成」小签，没有进度条
  var wrap = Meta.el('div', 'maList');
  list.forEach(function (o) {
    var a = o.a, row = Meta.el('div', 'maRow kmRow' + (o.done ? ' done kmDone' : ''));
    row.appendChild(Meta.iconTile(Meta.achIcon(a)));
    var main = Meta.el('div', 'maMain'), top = Meta.el('div', 'maTop');
    top.appendChild(Meta.el('span', 'maName', a.name));
    if (o.done) { var tag = Kit.tag('已完成'); tag.classList.add('maCheck'); top.appendChild(tag); }
    else top.appendChild(Meta.el('span', 'maCnt', Meta.fmtVal(a, Math.min(o.v, a.goal)) + ' / ' + Meta.fmtVal(a, a.goal)));
    main.appendChild(top);
    main.appendChild(Kit.phrase(Meta.el('div', 'maDesc'), a.desc));   // 按短语排（只在「、」「，」后面换行，不会折成「铁匠 / 铺」）
    main.appendChild(Meta.el('div', 'maRew', '奖励：' + Meta.rewardText(a)));
    if (!o.done) main.appendChild(Meta.bar(a, false, true));
    row.appendChild(main);
    wrap.appendChild(row);
  });
  body.appendChild(wrap);
};

Meta.renderUp = function (body, foot) {
  var p = Meta.p, grid = Meta.el('div', 'muGrid');
  META_DATA.UPGRADES.forEach(function (u) {
    var lv = Meta.upLevel(u.id), max = u.cost.length, cost = Meta.upNextCost(u.id);
    var card = Meta.el('div', 'muCard kmRow' + (lv >= max ? ' max kmDone' : ''));
    var top = Meta.el('div', 'muTop');
    var tile = Meta.el('div', 'cardIcon');
    Meta.tile(tile, u.icon ? u.icon[0] : null, u.icon ? u.icon[1] : null, u.glyph, u.color);
    top.appendChild(tile);
    var tx = Meta.el('div');
    tx.appendChild(Meta.el('div', 'muName', u.name));
    var eff = Meta.el('div', 'muEff');
    eff.innerHTML = '每级 ' + Meta.esc(Meta.upText(u, 1)) + ' · 现在 <b>' + Meta.esc(lv ? Meta.upText(u, lv) : '+0') + '</b>';
    tx.appendChild(eff);
    top.appendChild(tx);
    card.appendChild(top);
    var pips = Meta.el('div', 'muPips kmPips');
    for (var i = 0; i < max; i++) pips.appendChild(Meta.el('i', i < lv ? 'on' : ''));
    card.appendChild(pips);
    // 自然宽度的深蓝价格按钮「升级 ◆180」（钱不够时变暗）
    var b;
    if (lv >= max) b = Kit.button({ label: '已满级', small: true, cls: 'muBuy', disabled: true });
    else {
      b = Kit.button({ label: '升级', price: cost, small: true, cls: 'muBuy' + (p.mc >= cost ? ' can' : ''), disabled: p.mc < cost });
      b.dataset.up = u.id;
    }
    card.appendChild(b);
    grid.appendChild(card);
  });
  body.appendChild(grid);
  var spent = Meta.upSpent();
  foot.classList.remove('hidden');
  foot.appendChild(Meta.el('span', 'mlNote', '强化每局开始时生效，对所有骑士都有用。'));
  var r = Meta.el('button', 'sbtn');
  r.type = 'button';
  r.dataset.mact = 'resetUp';
  r.disabled = spent <= 0;
  r.innerHTML = '重置强化（退还 ' + Meta.gemHtml() + '<b class="kmGemN">' + Meta.fmt(spent) + '</b>）';
  foot.appendChild(r);
};

Meta.renderRec = function (body) {
  var p = Meta.p, L = p.life, B = p.best;
  if (!Meta.storageOk) body.appendChild(Meta.el('div', 'mrWarn', '这个浏览器现在不让游戏保存进度：这次打开期间的成绩和解锁，关掉页面后会丢失。'));
  body.appendChild(Meta.el('h3', '', '生涯'));
  var g = Meta.el('div', 'mrGrid');
  var w = p.wins;
  var rows = [
    ['游戏局数', Meta.fmt(L.runs || 0)],
    ['通关次数', (w[1] + w[2] + w[3]) + '（I ' + w[1] + ' · II ' + w[2] + ' · III ' + w[3] + '）'],
    ['游戏时间', Meta.fmtDur(L.playTime || 0)],
    ['总击杀', Meta.fmt(L.kills || 0)],
    ['精英怪', Meta.fmt(L.elites || 0)],
    ['小 Boss', Meta.fmt(L.minis || 0)],
    ['关卡 Boss', Meta.fmt(L.bosses || 0)],
    ['打开宝箱', Meta.fmt(L.chests || 0)],
    ['充能神龛', Meta.fmt(L.shrines || 0)],
    ['觉醒超武', Meta.fmt(L.evos || 0)],
    ['最高等级', 'Lv ' + (B.level || 1)],
    ['单局最多击杀', Meta.fmt(B.runKills || 0)],
    ['最长不受伤', Math.floor(B.noHit || 0) + ' 秒'],
    ['最高速度', Math.floor(B.speed || 0)],
    ['最长滞空', (Math.floor((B.air || 0) * 10) / 10) + ' 秒'],
    ['累计滑铲', Meta.fmt(L.ride || 0) + ' 米'],
    ['找到的秘密地点', Meta.fmt(L.secrets || 0)],
    ['获得的魔晶', Meta.fmt(p.mcTotal)],
    ['解锁的骑士', Meta.knightCount() + ' / ' + Meta.knightTotal()],
    ['完成的成就', Meta.achDone() + ' / ' + META_DATA.ACHIEVEMENTS.length]
  ];
  rows.forEach(function (r) {
    var d = Meta.el('div', 'statRow');
    d.appendChild(Meta.el('span', '', r[0]));
    d.appendChild(Meta.el('span', '', r[1]));
    g.appendChild(d);
  });
  body.appendChild(g);
  body.appendChild(Meta.el('h3', '', '各位骑士的最佳记录'));
  var tb = Meta.el('div', 'mrTable');
  Object.keys(CHARACTERS).forEach(function (id) {
    var c = CHARACTERS[id], rec = p.chars[id], row = Meta.el('div', 'mrRow kmRow' + (Meta.owns('knight', id) ? '' : ' locked'));
    var ic = Meta.el('div', 'charIcon' + (Meta.owns('knight', id) ? '' : ' kmLockedPic'));
    Meta.tile(ic, 'char', id, c.icon, c.color);
    row.appendChild(ic);
    row.appendChild(Meta.el('span', 'mrName', c.name));
    var best = Meta.el('span', 'mrBest');
    if (rec && rec.runs > 0) {
      var t = Meta.recText(rec).replace('最佳记录：', '');
      if (rec.wins > 0) { best.appendChild(Meta.el('span', 'gold', '★ ')); }
      best.appendChild(document.createTextNode(t));
    } else best.textContent = Meta.owns('knight', id) ? '还没有出战过' : '未解锁';
    row.appendChild(best);
    tb.appendChild(row);
  });
  body.appendChild(tb);
  var dz = Meta.el('div', 'mrDanger');
  dz.appendChild(Meta.el('span', 'mlNote', '清除存档会删掉魔晶、解锁、成就、强化和记录（关卡时长、灵敏度这些设置不受影响）。'));
  var wipe = Kit.button({ label: '清除存档', kind: 'danger' });
  wipe.dataset.mact = 'wipe';
  dz.appendChild(wipe);
  body.appendChild(dz);
};
Meta.fmtDur = function (s) {
  s = Math.floor(s);
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h > 0 ? h + ' 小时 ' + m + ' 分' : m + ' 分 ' + (s % 60) + ' 秒';
};

Meta.layerAction = function (act) {
  if (act === 'resetUp') {
    var back = Meta.upSpent();
    if (back <= 0) return;
    Meta.confirm({
      title: '重置强化',
      html: '把所有强化退回 0 级，全额退还 ' + Meta.gemHtml() + '<b>' + Meta.fmt(back) + '</b> 魔晶？',
      ok: '重置', okClass: '',
      onOk: function () { Meta.resetUpgrades(); Meta.renderLayer(); Meta.renderMenu(); }
    });
  } else if (act === 'wipe') {
    Meta.confirm({
      title: '清除存档',
      html: '真的要清除存档吗？<br>魔晶、解锁、成就、强化和记录都会<b class="mcBad">永久删除</b>，不能恢复。',
      ok: '清除', okClass: 'danger',
      onOk: function () { Meta.wipe(); }
    });
  }
};

Meta.wipe = function () {
  Meta.drop(Meta.KEY);
  var keep = Meta.p;
  Meta.p = Meta.blank();
  Meta.p.notice = 1; Meta.p.gift = keep.gift ? 1 : 0;
  Meta.run = null;
  Meta.ver++;
  Meta.save();
  Meta.closeAll();
  if (!Meta.isUnlocked('knight', UI.selected)) { UI.selected = 'fox'; try { UI.saveSettings(); } catch (e) { /* 忽略 */ } }
  UI.buildMenu();
  Meta.note('存档已清除');
};

// 确认框（不用浏览器的 confirm）
Meta.confirm = function (o) {
  Meta.closeConfirm();
  var C = Meta.el('div');
  C.id = 'metaConfirm';
  C.innerHTML = '<div class="mlPanel mcPanel" role="alertdialog" aria-modal="true"><div class="mlHead"><h2></h2></div><div class="mlBody"></div><div class="mlFoot"></div></div>';
  C.querySelector('h2').textContent = o.title || '确认';
  C.querySelector('.mlBody').innerHTML = o.html || '';
  var foot = C.querySelector('.mlFoot');
  var no = Kit.button({ label: o.no || '取消' });
  no.addEventListener('click', function () { Meta.closeConfirm(); });
  var ok = Kit.button({ label: o.ok || '确定', kind: o.okClass || '' });
  ok.addEventListener('click', function () { Meta.closeConfirm(); try { o.onOk(); } catch (e) { Meta.err(e); } });
  foot.appendChild(no);
  foot.appendChild(ok);
  (document.getElementById('menu') || document.body).appendChild(C);
  Meta.confirmEl = C;
};
Meta.closeConfirm = function () { if (Meta.confirmEl) { Meta.confirmEl.remove(); Meta.confirmEl = null; } };

// ---------------- 第一次打开（老玩家）：说明卡 ----------------
Meta.showNotice = function () {
  if (Meta.noticeEl || !document.getElementById('menu')) return;
  var p = Meta.p;
  if (!p.gift) { p.gift = 1; p.mc += META_DATA.WELCOME_GIFT; p.mcTotal += META_DATA.WELCOME_GIFT; Meta.save(); }
  var n = Meta.el('div');
  n.id = 'metaNotice';
  n.setAttribute('role', 'dialog');
  // 三行短话（约 45 个字）+ 两个按钮；详细的规则在「操作说明」和成就页
  n.innerHTML = '<div class="mnTitle">' + Meta.pxSvgI('trophy') + '更新：解锁和成长</div><ul>' +
    '<li>骑士要靠<b>成就</b>或魔晶解锁</li>' +
    '<li>想全部都能选：点<b>「全部解锁」</b></li>' +
    '<li>送你 ' + Meta.gemHtml() + '<b class="kmGemN">' + Meta.fmt(META_DATA.WELCOME_GIFT) + '</b> 魔晶，谢谢游玩！</li></ul>' +
    '<div class="mnBtns"><button type="button" class="sbtn main" data-mn="casual">全部解锁</button><button type="button" class="sbtn" data-mn="ok">一个个解锁</button></div>';
  document.getElementById('menu').appendChild(n);
  Meta.noticeEl = n;
  var t = document.querySelector('#menu .mhCasual');
  if (t) t.classList.add('pulse');
};
Meta.hideNotice = function () {
  if (Meta.noticeEl) { Meta.noticeEl.remove(); Meta.noticeEl = null; }
  var t = document.querySelector('#menu .mhCasual');
  if (t) t.classList.remove('pulse');
};
// silent：已经在开关那里改过了，这里只关说明卡
Meta.noticeChoice = function (c, silent) {
  Meta.p.notice = 1;
  Meta.hideNotice();
  if (!silent && c === 'casual') { Meta.p.casual = true; Meta.ver++; }
  Meta.save();
  if (silent) return;
  if (c !== 'casual' && !Meta.isUnlocked('knight', UI.selected)) { UI.selected = 'fox'; try { UI.saveSettings(); } catch (e) { /* 忽略 */ } }
  UI.buildMenu();
};

// ---------------- 结算界面：魔晶（数字滚动）+ 新解锁 ----------------
Meta.renderEnd = function (won) {
  var run = Meta.run;
  if (!run) return;
  // 这一局还在打（死亡后 0.9 秒的结算界面来得晚，新的一局已经开始了）：不能把新的一局按死亡结算
  if (!run.settled && Game.state !== 'end') { var stale = document.getElementById('metaEnd'); if (stale) stale.remove(); return; }
  var res = run.settled ? run.result : Meta.settle(won ? 'win' : 'death');
  if (!res) return;
  Meta.injectCss();
  var modal = document.getElementById('endModal'), anchor = document.getElementById('endStats');
  if (!modal || !anchor) return;
  var box = document.getElementById('metaEnd');
  if (!box) { box = Meta.el('div'); box.id = 'metaEnd'; }
  if (box.parentNode !== modal || box.previousElementSibling !== anchor) anchor.parentNode.insertBefore(box, anchor.nextSibling);
  box.innerHTML = '';
  var head = Meta.el('div', 'meHead');
  head.appendChild(Meta.el('span', 'meLabel', '获得魔晶'));
  head.insertAdjacentHTML('beforeend', Meta.gemHtml());
  var num = Meta.el('span', 'meNum', '+0');
  head.appendChild(num);
  box.appendChild(head);
  // 明细：一行 12 号小字（「第 3 关 +60  通关 +120  …」，每项一个 span，项和项之间空 12 像素）
  var parts = res.pay.parts.map(function (x) { return String(x[0]).replace(/^到达(第 \d+ 关)$/, '$1') + ' +' + x[1]; });
  if (res.pay.mult !== 1) parts.push('难度 ' + Meta.roman(res.tier) + ' ×' + res.pay.mult);
  var pe = Meta.el('div', 'meParts', parts.length ? null : '这一局太短了，没有魔晶');
  parts.forEach(function (t) { pe.appendChild(Meta.el('span', '', t)); });
  box.appendChild(pe);
  var bal = Meta.el('div', 'meBal');
  bal.innerHTML = '余额 ' + Meta.gemHtml() + Meta.fmt(res.balance);
  box.appendChild(bal);
  if (res.news.length) box.appendChild(Meta.el('div', 'meRec', '新纪录！' + res.news.join(' · ')));
  // 新解锁：这一局完成的成就（和它们的奖励）、新难度
  var items = [];
  if (res.tierUp) items.push({ icon: { kind: 'trophy' }, t: '新难度', n: '解锁难度 ' + Meta.roman(res.tierUp) });
  res.newAch.forEach(function (id) {
    var a = Meta.achById(id);
    if (!a) return;
    var rp = Meta.rewardParts(a), ns = rp.map(function (x) { return x.text; });
    items.push({ icon: rp[0] || { kind: 'mc' }, t: '成就「' + a.name + '」', n: ns.join('、') || '完成', ns: ns });
  });
  if (items.length) {
    box.appendChild(Meta.el('div', 'meNewTitle', '新解锁（' + items.length + '）'));
    var list = Meta.el('div', 'meNew');
    items.forEach(function (it, i) {
      var d = Meta.el('div', 'meItem kmRow');
      d.style.animationDelay = (0.5 + i * 0.08).toFixed(2) + 's';
      d.appendChild(Meta.iconTile(it.icon));
      var tx = Meta.el('div');
      tx.appendChild(Meta.el('div', 'meItemT', it.t));
      // 几项奖励：每一项不在中间折行，只在「、」后面换行（不会折成「…、魔 / 典「…」」）
      tx.appendChild(it.ns && it.ns.length > 1 ? Kit.parts(Meta.el('div', 'meItemN'), it.ns, '、') : Kit.phrase(Meta.el('div', 'meItemN'), it.n));
      d.appendChild(tx);
      list.appendChild(d);
    });
    box.appendChild(list);
  }
  Meta.countUp(num, res.pay.total);
};

// 数字从 0 滚到 total（弹窗真的显示出来才开始；没有动画的环境直接写结果）
Meta.countUp = function (el, total) {
  var token = (Meta.cuToken = (Meta.cuToken || 0) + 1);
  var raf = window.requestAnimationFrame;
  var reduced = false;
  try { reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* 忽略 */ }
  if (!raf || reduced || total <= 0) { el.textContent = '+' + Meta.fmt(total); return; }
  var t0 = 0, waited = 0, dur = Math.min(1600, 500 + total * 2);
  var step = function (now) {
    if (token !== Meta.cuToken) return;
    var modal = document.getElementById('endModal');
    if (!t0) {
      if (modal && modal.classList.contains('hidden') && waited++ < 400) { raf(step); return; }
      t0 = now;
    }
    var k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = '+' + Meta.fmt(Math.round(total * e));
    if (k < 1) raf(step);
    else { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
  };
  raf(step);
};

// ---------------- 小提示：成就达成（局内右上角 / 菜单左下角），一次一个，排队 ----------------
Meta.toastBox = function () {
  var b = document.getElementById('metaToasts');
  if (!b) { Meta.injectCss(); b = Meta.el('div'); b.id = 'metaToasts'; b.setAttribute('aria-live', 'polite'); document.body.appendChild(b); }
  b.classList.toggle('inMenu', typeof Game !== 'undefined' && Game.state === 'menu');
  return b;
};
Meta.toast = function (a) { Meta.toastQ.push({ a: a }); Meta.pumpToast(); };
Meta.flushToasts = function () {
  Meta.toastQ.length = 0;
  var b = document.getElementById('metaToasts');
  if (!b) return;
  var ts = b.querySelectorAll('.mToast');
  for (var i = 0; i < ts.length; i++) ts[i].classList.add('out');
};
Meta.note = function (text) { Meta.toastQ.push({ text: text }); Meta.pumpToast(); };
Meta.pumpToast = function () {
  if (Meta.toastBusy || !Meta.toastQ.length || !document.body) return;
  // 升级、宝箱、商人、暂停弹窗开着：先排着，关了再弹
  if (typeof Game !== 'undefined' && (Game.state === 'modal' || Game.state === 'pause')) {
    if (!Meta.toastWait) Meta.toastWait = setTimeout(function () { Meta.toastWait = 0; Meta.pumpToast(); }, 400);
    return;
  }
  var q = Meta.toastQ.shift(), box = Meta.toastBox(), d;
  // 一下子完成很多个：剩下的合成一条
  var more = 0;
  if (q.a && Meta.toastQ.length > 2) {
    for (var i = Meta.toastQ.length - 1; i >= 0; i--) if (Meta.toastQ[i].a) { Meta.toastQ.splice(i, 1); more++; }
  }
  // 小签（Kit.slip，根元素也带 .mToast）：成就 = 金色「成就达成」小签 + 奖杯 + 名字 + 奖励；魔晶提示 = 魔晶图标 + 一行字
  if (q.a) {
    // 奖励一项一块（Kit.parts：只在「、」后面换行）；说明（「同时解锁难度 II」）接在最后，局内不用括号
    var rl = Meta.rewardParts(q.a).map(function (x) { return x.text; });
    if (q.a.note) rl.push(q.a.note);
    if (rl.length) rl[0] = '奖励：' + rl[0];
    d = Kit.slip({ kind: 'ach', tab: '成就达成' + (more ? ' +' + more : ''), name: q.a.name, reward: rl });
  } else {
    d = Kit.slip({ kind: 'note', name: q.text });
  }
  box.appendChild(d);
  Meta.toastBusy = true;
  // 成就提示真正出现的这一刻（音效接在这里，弹窗开着时排队的提示也在出现时才响）
  if (q.a) Meta.emit('toast', { id: q.a.id, more: more });
  setTimeout(function () {
    d.classList.add('out');
    setTimeout(function () { d.remove(); Meta.toastBusy = false; Meta.pumpToast(); }, 320);
  }, q.a ? 3000 : 3600);
};

// ---------------- 包装：界面 ----------------
(function () {
  var bm = UI.buildMenu;
  UI.buildMenu = function () {
    var r = bm.apply(this, arguments);
    try { Meta.renderMenu(); } catch (e) { Meta.err(e); }
    return r;
  };
  var se = UI.showEnd;
  UI.showEnd = function (won) {
    var r = se.apply(this, arguments);
    try { Meta.renderEnd(won); } catch (e) { Meta.err(e); }
    return r;
  };
  // 选中锁住的骑士时“开始游戏”变成购买（按钮藏起来了，这里防一下别的入口）
  var act = UI.action;
  UI.action = function (a) {
    if (a === 'start') {
      try {
        if (!Meta.isUnlocked('knight', UI.selected)) { Meta.askBuy(UI.selected); return; }
      } catch (e) { Meta.err(e); }
    }
    return act.apply(this, arguments);
  };
})();

// ---------------- 启动 ----------------
(function () {
  Meta.returning = !!Meta.read(Meta.SETTINGS_KEY);
  Meta.load();
  // 新玩家（更新前没玩过）：更新说明和老玩家礼包都不需要；记下来，下次打开（那时已经有设置存档了）也不会弹
  if (!Meta.returning && Meta.p.notice !== 1) { Meta.p.notice = 1; Meta.p.gift = 1; Meta.save(); }
  // 上次没结算就关掉的那一局：按“退出”结算
  // RESUME 钩子（resume_boot.js）：有能继续的存档点时先不结算，留给主菜单的「继续上一局」「放弃」
  if (Meta.p.pending && !(typeof Resume !== 'undefined' && Resume.holdPending(Meta.p.pending))) {
    try { Meta.restored = Meta.finish(Meta.p.pending, 'quit'); } catch (e) { Meta.err(e); Meta.p.pending = null; Meta.save(); }
  }
})();
