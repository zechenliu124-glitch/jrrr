'use strict';
// ============================================================
//  继续上一局（核心，在 data_meta.js 之后、meta.js 之前加载）
//  · 存档点：localStorage 'knight_magic_resume'，每关开始时写一份（写的代码在 resume.js）
//  · meta.js 启动时问 Resume.holdPending：有能继续的存档点就先不结算，留给主菜单的「继续上一局」「放弃」
//  · 每次结算（knightmeta:settle）都清掉存档点；resume.js 没加载成功时，页面加载完把留着的那一局按退出结算
//  · 数据表变了（id 改名、存档版本升级）：指纹对不上，存档点直接丢掉，照原来的样子结算
// ============================================================
var Resume = {
  KEY: 'knight_magic_resume',
  VER: 1,              // 存档点格式的版本（字段结构变了就加一）
  held: null,          // 启动时留下来的一局 { cp, pending }
  ready: false,        // resume.js 加载完了
  MAX_W: 12            // 最多几把武器
};

// ---------------- 存取（全部 try/catch：隐私模式、禁用存储都不报错） ----------------
Resume.read = function () { try { return window.localStorage ? window.localStorage.getItem(Resume.KEY) : null; } catch (e) { return null; } };
Resume.write = function (s) { try { window.localStorage.setItem(Resume.KEY, s); return true; } catch (e) { return false; } };
Resume.drop = function () { try { window.localStorage.removeItem(Resume.KEY); } catch (e) { /* 忽略 */ } };
Resume.err = function (e) { try { console.error('[resume]', e && e.stack ? e.stack : e); } catch (e2) { /* 忽略 */ } };

// ---------------- 数据指纹：骑士、武器（和它们的基础属性名）、纹章、物品、属性、超武、关卡数、局外存档版本 ----------------
Resume.keys = function (o) { return o && typeof o === 'object' ? Object.keys(o).sort() : []; };
Resume.fnv = function (s) {
  var h = 0x811c9dc5;
  for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return ('0000000' + h.toString(16)).slice(-8);
};
Resume.fingerprint = function () {
  var W = typeof WEAPONS !== 'undefined' ? WEAPONS : {}, parts = [];
  parts.push('C:' + Resume.keys(typeof CHARACTERS !== 'undefined' ? CHARACTERS : null).join(','));
  parts.push('W:' + Resume.keys(W).map(function (k) { return k + '(' + Resume.keys(W[k] && W[k].base).join('+') + ')'; }).join(','));
  parts.push('T:' + Resume.keys(typeof TOMES !== 'undefined' ? TOMES : null).join(','));
  parts.push('I:' + Resume.keys(typeof ITEMS !== 'undefined' ? ITEMS : null).join(','));
  parts.push('S:' + Resume.keys(typeof STATS !== 'undefined' ? STATS : null).join(','));
  parts.push('E:' + Resume.keys(typeof EVO !== 'undefined' ? EVO : null).join(','));
  parts.push('G:' + (typeof STAGES !== 'undefined' ? STAGES.length : 0));
  parts.push('M:' + (typeof META_DATA !== 'undefined' ? META_DATA.VERSION : 0));
  parts.push('R:' + Resume.VER);
  return Resume.fnv(parts.join('|'));
};

// ---------------- 检查：任何一项不对，整份存档点都不要 ----------------
Resume.fin = function (v) { return typeof v === 'number' && isFinite(v); };
Resume.pos = function (v) { return Resume.fin(v) && v >= 0; };
Resume.int = function (v, lo, hi) { return Resume.fin(v) && Math.floor(v) === v && v >= lo && v <= hi; };
Resume.obj = function (o) { return !!o && typeof o === 'object' && !Array.isArray(o); };
Resume.valid = function (cp) {
  try { return Resume.check(cp) === ''; } catch (e) { return false; }
};
// 返回不对的那一项（空字符串 = 都对）；测试和说明里用得到
Resume.check = function (cp) {
  var R = Resume, k, i;
  if (!R.obj(cp)) return 'type';
  if (cp.v !== R.VER) return 'v';
  if (cp.dv !== R.fingerprint()) return 'dv';
  if (typeof META_DATA === 'undefined' || cp.mv !== META_DATA.VERSION) return 'mv';
  if (!R.fin(cp.at) || !R.fin(cp.started)) return 'at';
  if (!R.int(cp.cont, 0, 1e6)) return 'cont';
  if (typeof cp.char !== 'string' || !CHARACTERS[cp.char]) return 'char';
  if (!R.int(cp.stage, 1, STAGES.length)) return 'stage';
  if ([1, 2, 3].indexOf(cp.tier) < 0) return 'tier';
  if (typeof Pace !== 'undefined' && Pace.OPTIONS && Pace.OPTIONS.indexOf(cp.minutes) < 0) return 'minutes';
  if (!R.int(cp.seed, 0, 4294967295)) return 'seed';
  var g = cp.game;
  if (!R.obj(g) || !R.pos(g.totalTime) || !R.int(g.levelQueue, 0, 50) || !R.int(g.chestsOpened, 0, 1e6) || typeof g.firstElite !== 'boolean') return 'game';
  var p = cp.p;
  if (!R.obj(p) || !R.int(p.level, 1, 999) || !R.pos(p.xp) || !R.pos(p.xpNext)) return 'p.level';
  if (!R.pos(p.gold) || !R.pos(p.kills) || !R.pos(p.damageDealt) || !R.pos(p.poison)) return 'p.num';
  if (!R.fin(p.hp) || !(p.hp > 0) || !R.fin(p.yaw) || !R.fin(p.pitch)) return 'p.hp';
  if (!Array.isArray(p.mods) || p.mods.length > 1000) return 'p.mods';
  for (i = 0; i < p.mods.length; i++) {
    var m = p.mods[i];
    if (!Array.isArray(m) || typeof m[0] !== 'string' || !STATS[m[0]] || !R.fin(m[1])) return 'p.mods';
  }
  if (!R.obj(p.items)) return 'p.items';
  for (k in p.items) if (!ITEMS[k] || !R.int(p.items[k], 1, 99)) return 'p.items';
  if (!Array.isArray(p.tomes)) return 'p.tomes';
  var seen = {};
  for (i = 0; i < p.tomes.length; i++) {
    var t = p.tomes[i];
    if (!R.obj(t) || typeof t.id !== 'string' || !TOMES[t.id] || seen[t.id] || !R.int(t.level, 1, 99) || !R.fin(t.value) || !R.fin(t.mult)) return 'p.tomes';
    seen[t.id] = 1;
  }
  if (!Array.isArray(p.weapons) || p.weapons.length < 1 || p.weapons.length > R.MAX_W) return 'p.weapons';
  seen = {};
  for (i = 0; i < p.weapons.length; i++) {
    var w = p.weapons[i];
    if (!R.obj(w) || typeof w.id !== 'string' || !WEAPONS[w.id] || seen[w.id] || !R.int(w.level, 1, 99)) return 'p.weapons';
    if (!R.pos(w.kills) || !R.pos(w.dmg) || !R.fin(w.charges) || !R.obj(w.s)) return 'p.weapons';
    for (k in w.s) if (!R.fin(w.s[k])) return 'p.weapons';
    if (typeof w.evo !== 'boolean' || (w.evo && (typeof EVO === 'undefined' || !EVO[w.id]))) return 'p.weapons';
    if (w.evoHow != null && typeof w.evoHow !== 'string') return 'p.weapons';
    seen[w.id] = 1;
  }
  if (!R.obj(cp.passive)) return 'passive';
  for (k in cp.passive) if (!R.fin(cp.passive[k])) return 'passive';
  var l = cp.lvl;
  if (!R.obj(l) || !R.int(l.rerolls, 0, 99) || !R.int(l.skips, 0, 99) || !R.int(l.banishes, 0, 99) || !Array.isArray(l.banned)) return 'lvl';
  for (i = 0; i < l.banned.length; i++) if (typeof l.banned[i] !== 'string' || !(WEAPONS[l.banned[i]] || TOMES[l.banned[i]])) return 'lvl';
  var c = cp.content;
  if (!R.obj(c) || !R.int(c.secretsFound, 0, 1e6) || !Array.isArray(c.hinted)) return 'content';
  for (i = 0; i < c.hinted.length; i++) if (typeof c.hinted[i] !== 'string') return 'content';
  var mt = cp.meta;
  if (!R.obj(mt) || !R.obj(mt.c) || !R.obj(mt.x) || !R.obj(mt.wk) || !Array.isArray(mt.newAch)) return 'meta';
  if (!R.pos(mt.c.kills) || !R.int(mt.level, 1, 999) || !R.int(mt.stage, 1, 99) || !R.pos(mt.time)) return 'meta';
  for (i = 0; i < mt.newAch.length; i++) if (typeof mt.newAch[i] !== 'string' || (typeof Meta !== 'undefined' && Meta.achById && !Meta.achById(mt.newAch[i]))) return 'meta';
  return '';
};

// 存档点和 META 留下的“没结算的那一局”是不是同一局（同一位骑士、难度、关卡时长、同一关，而且是存档点之后接着打的）
// 关卡必须相同：每关开始都先存一局再写存档点，没结算的那一局在更后面的关 = 新的存档点没写进去
Resume.match = function (cp, pending) {
  if (!cp || !pending || !pending.c || !cp.game || !cp.meta || !cp.meta.c) return false;
  return pending.char === cp.char && pending.tier === cp.tier && pending.minutes === cp.minutes && pending.stage === cp.stage &&
    pending.time >= cp.game.totalTime - 1 && (pending.c.kills || 0) >= (cp.meta.c.kills || 0);
};

Resume.load = function () {
  var raw = Resume.read();
  if (!raw) return null;
  try { var o = JSON.parse(raw); return Resume.obj(o) ? o : null; } catch (e) { return null; }
};

// meta.js 启动时调用：true = 这一局先留着不结算（主菜单上「继续上一局」）；false = 存档点丢掉，照原来的样子结算。从不抛错
Resume.holdPending = function (pending) {
  try {
    Resume.held = null;
    var cp = Resume.load();
    if (cp && pending && Resume.valid(cp) && Resume.match(cp, pending)) { Resume.held = { cp: cp, pending: pending }; return true; }
  } catch (e) { Resume.err(e); }
  Resume.held = null;
  Resume.drop();
  return false;
};

Resume.clear = function () { Resume.held = null; Resume.drop(); };

// 留着的那一局按退出结算（resume.js 没加载成功时的保险）
Resume.release = function () {
  var h = Resume.held;
  Resume.held = null;
  try {
    if (h && typeof Meta !== 'undefined' && Meta.p && Meta.p.pending) Meta.restored = Meta.finish(Meta.p.pending, 'quit');
  } catch (e) { Resume.err(e); try { Meta.p.pending = null; Meta.save(); } catch (e2) { /* 忽略 */ } }
  Resume.clear();
};

// 每次结算（阵亡、通关、退出、新开一局、启动时结算、放弃）：存档点作废
window.addEventListener('knightmeta:settle', function () { Resume.clear(); });
// 保险：resume.js 没加载（或出错没跑完），留着的一局不能一直挂着（下一次开局会把它盖掉，魔晶就没了）
// 没留下来的存档点（启动时没有没结算的一局，不会去问 holdPending）这时都已经作废：删掉
window.addEventListener('load', function () {
  if (Resume.held && !Resume.ready) Resume.release();
  else if (!Resume.held) Resume.drop();
});
