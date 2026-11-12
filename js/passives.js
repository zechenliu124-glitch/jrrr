'use strict';
// ============================================================
//  骑士被动：公共部分（登记、分派、滑铲上升 / 下降沿、卡片文字）+ 7 位骑士（驯鹰、修女、铁匠、魔术、养蜂、猫、渔夫）
//  其余 14 位在 passives_b.js / passives_c.js（只用这里的约定：Passive.def(id, spec)）
//  还有坐骑特性、冰晶雪橇的冰轨、玩家中毒
// ============================================================
var Passive = {};

// ---------------- 登记 ----------------
// 每位骑士一个 spec（字段都可以不写）：num 数值（和 tables.json 一样）、reset 开局（只设数）、clear 换关 / 回菜单 / 开局（藏模型、清列表）、
// update(dt)、hud()、card(ctx)、dmgMult(e)、atkMult(w)、dmgTakenMult(src)、onCrit(w, e, dealt)、onLand(info)、onLevel()、onKill(e)、
// onHurt(lost, src)、onSlideStart()、onSlideEnd()、onLaunch(w, p)、onReel(w, e)、cheatDeath(src)、pose(body, dt)、cardRarity(o, w, r)、mxMod(kind, key, v)
// 要跨「继续游戏」保存的计数放在 Passive 上（数字，骑士名开头）；对象放在 spec 自己的闭包里
Passive.K = {};                                    // 骑士 id → 被动（Passive.def 登记）
Passive.def = function (id, spec) { Passive.K[id] = spec; return spec; };
Passive.cur = function () { return P.char ? Passive.K[P.char.id] || null : null; };
Passive.eachSpec = function (name) { for (var id in Passive.K) if (Passive.K[id][name]) Passive.K[id][name](); };
Passive.slid = false;                              // 上一帧是不是在滑铲（不存档：继续游戏时从没在滑开始）
Passive.clock = 0;                                 // 这一局被动走过的时间（弹窗时不走）

Passive.reset = function () {
  Passive.ice = [];            // 冰晶雪橇（frost）：滑铲留下的薄冰 {x, y, z, t}
  Passive.iceT = 0;
  Passive.iceStamp = 0;
  Passive.slid = false;
  Passive.clock = 0;
  Passive.eachSpec('clear');
  var k = Passive.cur();
  if (k && k.reset) k.reset();
  Relic.reset();   // 第 6 块：每件宝物的 clear + reset
};

// 换关、回菜单（Game.buildStage 里调）：每位骑士的模型都藏起来、列表清空
Passive.clear = function () { Passive.slid = false; Passive.eachSpec('clear'); Relic.clear(); };   // 第 6 块：宝物的狗、标记也清掉

// 坐骑特性（RIDES[角色].twist.kind）：只在滑铲坐骑出来（P.riding）时生效
Passive.twist = function () { return P.twist ? P.twist() : {}; };
Passive.riding = function (kind) { return !!P.riding && Passive.twist().kind === kind; };

// 影遁坐骑（shadow）：滑铲时闪避大幅提高（加在内部闪避值上，P.evadePct 里用）
Passive.evadeBonus = function () {
  if (!Passive.riding('shadow')) return 0;
  var rd = Passive.twist();
  return rd.evade != null ? rd.evade : 0.3;
};

Passive.id = function () { return P.char ? P.char.id : ''; };

// ---------------- 分派：只问当前骑士 ----------------
// 伤害倍率（武器命中时调用；灵魂弹丸不走这里）
Passive.dmgMult = function (e) { var k = Passive.cur(); return k && k.dmgMult ? k.dmgMult(e) : 1; };

// 移动速度额外倍率（不进属性表，实时生效；别的文件会包一层）
Passive.speedMult = function () { return 1; };

// 攻击速度额外倍率（Weapons.atk 里乘；结果 > 0）
Passive.atkMult = function (w) { var k = Passive.cur(); return (k && k.atkMult ? k.atkMult(w) : 1) * Relic.atkMult(w); };   // w：哪把武器（第 6 块：再乘宝物的）

// 受到伤害的倍率（P.hurt 里护甲之后乘）
Passive.dmgTakenMult = function (src) { var k = Passive.cur(); return k && k.dmgTakenMult ? k.dmgTakenMult(src) : 1; };

// 武器暴击命中之后（已经扣血，目标可能已经死了）
Passive.onCrit = function (w, e, dealt) { var k = Passive.cur(); if (k && k.onCrit) k.onCrit(w, e, dealt); Relic.onCrit(w, e, dealt); };   // 第 6 块：骑士之后是宝物

// 落地时：info = { impact, held, dive, diveT, drop, safe, sliding }
Passive.onLand = function (info) { var k = Passive.cur(); if (k && k.onLand) k.onLand(info); };

// 受伤时（已经扣血之后，死亡判断之前）：lost = 这一下真的扣掉的生命（护盾挡掉的不算）
Passive.onHurt = function (lost, src) { var k = Passive.cur(); if (k && k.onHurt) k.onHurt(lost, src); };

Passive.onLevel = function () { var k = Passive.cur(); if (k && k.onLevel) k.onLevel(); Relic.onLevel(); };   // 第 6 块：骑士之后是宝物
Passive.onKill = function (e) { var k = Passive.cur(); if (k && k.onKill) k.onKill(e); Relic.onKill(e); };

// 武器弹丸刚做好（Weapons.launch，放进列表之前）
Passive.onLaunch = function (w, p) { var k = Passive.cur(); if (k && k.onLaunch) k.onLaunch(w, p); };

// 钓竿钓上一个敌人（Weapons.reelHook 上岸，或钓线上打倒；道具不算）
Passive.onReel = function (w, e) { var k = Passive.cur(); if (k && k.onReel) k.onReel(w, e); };

// 摆完姿势、坐骑之后（P.animate）：改模型的骨头 / 大小
Passive.pose = function (body, dt) { var k = Passive.cur(); if (k && k.pose) k.pose(body, dt); };

// 升级卡（武器升级）的稀有度（LevelUp.make，在抽词条之前）
Passive.cardRarity = function (o, w, r) { var k = Passive.cur(); return k && k.cardRarity ? k.cardRarity(o, w, r) : r; };

// 互动点数值（MX.mod 的监听，载入时登记一次；undefined = 不改）
Passive.mxMod = function (kind, key, v) { var k = Passive.cur(); return k && k.mxMod ? k.mxMod(kind, key, v) : undefined; };
if (typeof MX !== 'undefined' && MX.onMod) MX.onMod(function (kind, key, v) { return Passive.mxMod(kind, key, v); });

// 致命一击（P.hurt 的死亡分支）：返回 true = 活下来了（生命 ≥ 1）
Passive.cheatDeath = function (src) { var k = Passive.cur(); return !!(k && k.cheatDeath && k.cheatDeath(src)); };
// 第 6 块：平安符，猫的命之后（relics.js 的 Relic.talisman）
Passive.talisman = function (src) { return Relic.talisman(src); };

// 被动的声音事件（audio_hooks.js 包一层：SFX.PASSIVE）
Passive.emit = function (name, x, z) {};

// 角色界面上显示的被动进度（一行）；回到菜单就不显示上一局骑士的那一行
Passive.hudText = function () { if (typeof Game !== 'undefined' && Game.state === 'menu') return ''; var k = Passive.cur(); return k && k.hud ? k.hud() || '' : ''; };

// 选骑士界面「被动」一行：被动名 + 一句话（{dmg} {n} {r} 换成当前值；菜单上是 1 级、基础伤害）；
// 局内有 summaryRun 就用它（猫：菜单「每局 3 条命」，局内「还剩 n 条命」）
Passive.cardText = function (id) {
  var c = CHARACTERS[id], k = Passive.K[id];
  if (!c) return '';
  if (!c.summary) return c.passive || '';
  var inRun = !!(P.char && P.char.id === id && Game.state !== 'menu');
  var ctx = { inRun: inRun, lv: inRun ? P.level : 1, dmg: inRun ? P.st.damage : STATS.damage.base + ((c.stats && c.stats.damage) || 0) };
  var v = k && k.card ? k.card(ctx) || {} : {};
  var tpl = inRun && c.summaryRun ? c.summaryRun : c.summary;
  return (c.passiveName ? c.passiveName + '：' : '') + tpl.replace(/\{(\w+)\}/g, function (m, n) { return v[n] != null ? String(v[n]) : m; });
};

Passive.update = function (dt) {
  if (Passive.twist().kind === 'frost') Passive.updateIce(dt, Passive.twist());
  if (P.poison > 0) { P.poison -= dt; P.poisonAcc = (P.poisonAcc || 0) + dt * 2 * Game.stageDef.dmgMult; if (P.poisonAcc >= 1) { P.hp -= 1; P.poisonAcc -= 1; if (P.hp <= 0) P.hp = 1; } }
  Passive.clock += dt;
  // 滑铲的上升沿 / 下降沿（P.sliding 是状态，物理之后每帧看一次，短滑铲也不会漏）
  var s = !!P.sliding, k = Passive.cur();
  if (s !== Passive.slid) { Passive.slid = s; if (k) { if (s) { if (k.onSlideStart) k.onSlideStart(); } else if (k.onSlideEnd) k.onSlideEnd(); } }
  if (k && k.update) k.update(dt);
  Relic.update(dt);   // 第 6 块：宝物（骑士之后）
};

// 冰晶雪橇（frost）的冰轨：地上滑得够快时每 0.3 秒留下一块薄冰（半径 1.3 米，1.8 秒），
// 踩上去的敌人（Boss 除外）冻住 0.4 秒，每个敌人 1.2 秒最多一次
// （RIDES.fisher.twist 里写了 every / iceR / life / freeze / cooldown / minSpeed 就用它的）
Passive.ICE = { every: 0.3, r: 1.3, life: 1.8, freeze: 0.4, cd: 1.2, minSpeed: 4 };
Passive.updateIce = function (dt, rd) {
  var C = Passive.ICE, L = Passive.ice || (Passive.ice = []), r = rd.iceR || rd.radius || C.r;
  var life = rd.life || C.life, freeze = rd.freeze || C.freeze, cd = rd.cooldown || C.cd;
  if (Game.time < Passive.iceStamp) L.length = 0;          // 换关了
  Passive.iceStamp = Game.time;
  if (P.sliding && P.onGround && P.speed() > (rd.minSpeed || C.minSpeed)) {
    Passive.iceT -= dt;
    if (Passive.iceT <= 0) {
      Passive.iceT = rd.every || C.every;
      var y = P.pos.y;
      L.push({ x: P.pos.x, y: y, z: P.pos.z, t: life });
      if (L.length > 12) L.shift();
      if (FX.spawn) {
        // 贴着坡面放
        var n = P.slopeAt ? P.slopeAt(P.pos.x, P.pos.z, y) : { x: 0, z: 0 };
        FX.spawn('disc', 0xbff0ff, { x: P.pos.x, y: y + 0.07, z: P.pos.z, rx: Math.atan(n.z), rz: -Math.atan(n.x), s0: r * 0.7, s1: r, life: life, a0: 0.5 });
      }
    }
  } else Passive.iceT = 0;
  var now = Game.time;
  for (var i = L.length - 1; i >= 0; i--) {
    var p = L[i];
    p.t -= dt;
    if (p.t <= 0) { L.splice(i, 1); continue; }
    Enemies.inRadius(p.x, p.z, r, function (e) {
      if (e.boss || Math.abs(e.y - p.y) > 2.5 || e.iceCd > now) return;
      e.iceCd = now + cd;
      e.frozen = Math.max(e.frozen, freeze);
    });
  }
};

// 返回 true 表示伤害被挡下（旧的格挡武器已删，现在总是 false）
Passive.blocks = function (src) { return Weapons.aegisBlock(src); };

Passive.onEvade = function (src) {};

Passive.onChest = function () { Relic.onChest(); };   // 第 6 块：每开一个宝箱（蜂蜜罐）

// ---------------- 小工具（三个文件都能用） ----------------
// 普通敌人：不是 Boss、小 Boss、精英、道具
Passive.normal = function (e) { return !!e && !e.boss && !e.mini && !e.elite && !e.prop; };
// 伤害公式：(基础 + 每级 × 等级) × 伤害倍率
Passive.dmgOf = function (num, lv, dmg) { return (num.dmgBase + num.dmgPerLv * lv) * dmg; };
// 剩下几秒（HUD 用：向上取整，不显示负数）
Passive.sec = function (t) { return Math.max(0, Math.ceil(t)); };

// ============================================================
//  第 5 块 a 部分的 7 位骑士
// ============================================================

// ---------------- 驯鹰骑士 · 鹰击 ----------------
(function () {
  var N = { cd: 7, range: 25, dmgBase: 30, dmgPerLv: 5, stun: 0.8, rearmCd: 2 };
  // 25 米内最强的敌人：精英 / 小 Boss / Boss 优先，然后生命最多；Boss 出场动画时不扑
  var pick = function () {
    var best = null, bt = -1, bh = -1, r2 = N.range * N.range, L = Enemies.list;
    for (var i = 0; i < L.length; i++) {
      var e = L[i];
      if (!e.alive || e.prop || ((e.boss || e.mini) && e.state === 'intro')) continue;
      if (dist2(P.pos.x, P.pos.z, e.x, e.z) > r2) continue;
      var tier = e.boss || e.mini || e.elite ? 1 : 0;
      if (tier > bt || (tier === bt && e.hp > bh)) { best = e; bt = tier; bh = e.hp; }
    }
    return best;
  };
  var onHit = function (p, e) {
    if (!e.boss && !e.mini && !e.prop && window.Evo) Evo.stun(e, N.stun);
    FX.text(e.x, e.y + e.r * 2 + 1, e.z, '鹰击', '#ffd84a', 1.1);
  };
  Passive.def('falconer', {
    num: N,
    reset: function () { Passive.falT = N.cd; Passive.falRe = -9; },
    update: function (dt) {
      Passive.falT -= dt;
      if (Passive.falT > 0) return;
      var t = pick();
      if (!t) { Passive.falT = 0.5; return; }   // 没有目标：0.5 秒后再看
      // 从目标头顶 15 米直直扑下来（spawnSouls 自己再抬 1 米）
      Weapons.spawnSouls(t.x, t.y + t.r + 14, t.z, 1, { kind: 'falcon', vx: 0, vy: -32, vz: 0, homing: 10, life: 1.4, r: 0.8,
        dmg: Passive.dmgOf(N, P.level, P.st.damage), onHit: onHit });
      Passive.falT = N.cd;
      if (Passive.emit) Passive.emit('falcon', t.x, t.z);
    },
    // 骑着大羽毛俯冲落地：猎隼马上再扑一次（每 2 秒最多一次）
    onLand: function (info) {
      if (info && info.dive && Passive.clock - Passive.falRe >= N.rearmCd) { Passive.falT = 0; Passive.falRe = Passive.clock; }
    },
    hud: function () { return '鹰击 ' + Passive.sec(Passive.falT) + ' 秒'; },
    card: function (ctx) { return { dmg: Math.round(Passive.dmgOf(N, ctx.lv, ctx.dmg)) }; }
  });
})();

// ---------------- 圣歌修女 · 越唱越响 ----------------
(function () {
  var N = { tick: 3, radius: 6, perEnemy: 1, max: 6, shield: 3, shieldMax: 30 };
  Passive.def('nun', {
    num: N,
    reset: function () { Passive.nunT = 0; Passive.nunN = 0; },
    update: function (dt) {
      Passive.nunT += dt;
      if (Passive.nunT < N.tick) return;
      Passive.nunT -= N.tick;
      var n = 0;
      Enemies.inRadius(P.pos.x, P.pos.z, N.radius, function (e) { if (!e.prop) n++; });
      Passive.nunN = n;
      if (n <= 0) return;                      // 身边没人：不唱（护盾不会白攒）
      if (P.hp >= P.st.maxHp - 0.01) {
        if (P.addShieldX(N.shield, N.shieldMax) > 0 && Passive.emit) Passive.emit('sing', P.pos.x, P.pos.z);
      } else P.heal(Math.min(N.max, n * N.perEnemy));
      // 头上飘几个音符
      for (var i = 0; i < Math.min(n, 4); i++) FX.mote(P.pos.x + rand(-0.4, 0.4), P.pos.y + 2.1, P.pos.z + rand(-0.4, 0.4), 0xffe8a8, 0.14, 1.2, 0.9);
    },
    hud: function () { return '歌声 ' + (Passive.nunN | 0); }
  });
})();

// ---------------- 铁匠骑士 · 趁热打铁 ----------------
(function () {
  var N = { every: 4, smithPrice: 0.5 };
  Passive.def('smith', {
    num: N,
    reset: function () { Passive.smiN = 0; },
    // 武器升到第 4、8、12……级的那张卡：稀有度 +1（最高传说）
    cardRarity: function (o, w, r) {
      if (!w || (w.level + 1) % N.every !== 0) return r;
      var r2 = Math.min(4, r + 1);
      if (r2 !== r) Passive.smiN++;
      return r2;
    },
    mxMod: function (kind, key, v) { return kind === 'blacksmith' && key === 'price' ? v * N.smithPrice : undefined; },
    // 下一张会升档的卡：哪把武器最快升到 4 的倍数级（同样快取等级低的）；都满级了 = 0
    nextLv: function () {
      var best = 0, br = Infinity, cap = typeof LEVEL_CAP !== 'undefined' ? LEVEL_CAP.weapon : 20;
      (P.weapons || []).forEach(function (w) {
        var r = N.every - (w.level % N.every), lv = w.level + r;
        if (lv > cap) return;
        if (r < br || (r === br && lv < best)) { br = r; best = lv; }
      });
      return best;
    },
    // 还没升过档：「打铁 下次 Lv4」；升过：「打铁 ×n 下次 Lv8」；没有能升档的武器：「打铁 ×n」
    hud: function () {
      var n = Passive.smiN | 0, lv = this.nextLv();
      return '打铁 ' + (n > 0 ? '×' + n + (lv ? ' ' : '') : '') + (lv ? '下次 Lv' + lv : n > 0 ? '' : '满级');
    }
  });
})();

// ---------------- 魔术骑士 · 帽子戏法 ----------------
(function () {
  var N = { every: 3, rabbits: 2, dmgBase: 14, dmgPerLv: 2, radius: 2 };
  var COLS = [0xfff2a8, 0xff9ad5, 0x6fd0ff];
  var BO = { cols: COLS };
  // 兔子炸开：彩带
  var onBlast = function (p) {
    FX.boom(p.x, p.y, p.z, N.radius, 0xff9ad5, BO);
    for (var i = 0; i < 8; i++) FX.part(p.x, p.y + 0.2, p.z, rand(-4, 4), rand(2, 6), rand(-4, 4), COLS[i % 3], 0.14, 0.7, 10);
    if (Passive.emit) Passive.emit('rabbit', p.x, p.z);
  };
  Passive.def('magician', {
    num: N,
    reset: function () { Passive.magN = 0; },
    onCrit: function () {
      Passive.magN++;
      if (Passive.magN < N.every) return;
      Passive.magN = 0;
      // 从帽子里蹦出两只兔子（同时最多 8 只）
      Weapons.spawnSouls(P.pos.x, P.pos.y + 1.2, P.pos.z, N.rabbits, { kind: 'rabbit', homing: 5, grav: 18, vy: 7, spd: 8, life: 3, r: 0.5,
        dmg: Passive.dmgOf(N, P.level, P.st.damage), blastR: N.radius, onBlast: onBlast, tag: 'rabbit', max: 8 });
    },
    hud: function () { return '暴击 ' + (Passive.magN | 0) + '/' + N.every; },
    card: function (ctx) { return { dmg: Math.round(Passive.dmgOf(N, ctx.lv, ctx.dmg)) }; }
  });
})();

// ---------------- 养蜂骑士 · 护卫蜂 ----------------
(function () {
  var N = { base: 3, perLevels: 6, max: 7, trigR: 3, dmgBase: 6, dmgPerLv: 1, slow: 0.25, slowTime: 2, back: 4 };
  var slots = [], tick = 0;                    // slots[i]：第 i 只蜂什么时候回来（Passive.clock；没写 = 在身边）
  var count = function (lv) { return Math.min(N.max, N.base + Math.floor((lv - 1) / N.perLevels)); };
  var onHit = function (p, e) { Enemies.slow(e, 1 - N.slow, N.slowTime); };
  Passive.def('beekeeper', {
    num: N,
    count: count,
    ready: function () { var n = count(P.level), r = 0; for (var i = 0; i < n; i++) if (!(slots[i] > Passive.clock)) r++; return r; },
    clear: function () { slots.length = 0; tick = 0; },
    update: function (dt) {
      tick -= dt;
      if (tick > 0) return;
      tick = 0.15;
      var n = count(P.level), now = Passive.clock, si = -1;
      for (var i = 0; i < n; i++) if (!(slots[i] > now)) { si = i; break; }
      if (si < 0) return;
      // 3 米内最近的、1 秒内没被蛰过的敌人
      var best = null, bd = Infinity;
      Enemies.inRadius(P.pos.x, P.pos.z, N.trigR, function (e) {
        if (e.prop || e.beeT > now) return;
        var d = dist2(P.pos.x, P.pos.z, e.x, e.z);
        if (d < bd) { bd = d; best = e; }
      });
      if (!best) return;
      var a = Math.atan2(best.z - P.pos.z, best.x - P.pos.x), c = Math.cos(a), s = Math.sin(a);
      Weapons.spawnSouls(P.pos.x + c * 1.2, P.pos.y + 0.6, P.pos.z + s * 1.2, 1, { kind: 'bee', vx: c * 10, vy: 0, vz: s * 10, homing: 8, life: 2.5, r: 0.4,
        dmg: Passive.dmgOf(N, P.level, P.st.damage), onHit: onHit });
      slots[si] = now + N.back;
      best.beeT = now + 1;
      if (Passive.emit) Passive.emit('bee', P.pos.x, P.pos.z);
    },
    hud: function () { return '护卫蜂 ' + this.ready() + '/' + count(P.level); },
    card: function (ctx) { return { n: count(ctx.lv), dmg: Math.round(Passive.dmgOf(N, ctx.lv, ctx.dmg)) }; }
  });
})();

// ---------------- 猫骑士 · 猫有九条命 ----------------
(function () {
  var N = { lives: 3, invuln: 2, stunR: 5, stun: 1 };
  Passive.def('catknight', {
    num: N,
    reset: function () { Passive.catLives = N.lives; },
    cheatDeath: function () {
      if (!(Passive.catLives > 0)) return false;
      Passive.catLives--;
      P.hp = 1;
      P.invuln = N.invuln;
      var x = P.pos.x, y = P.pos.y + 1, z = P.pos.z;
      FX.burst(x, y, z, 18, 0x2a2a2a, 6, 0.3);   // 一团猫毛
      FX.burst(x, y, z, 10, 0xf0f0f0, 4, 0.25);
      FX.text(x, y + 1.3, z, '喵！', '#ffd84a', 1.3);
      if (Passive.emit) Passive.emit('meow', x, z);
      // 5 米内的普通敌人吓得愣住
      Enemies.inRadius(x, z, N.stunR, function (e) { if (Passive.normal(e) && window.Evo) Evo.stun(e, N.stun); });
      if (Passive.catLives > 0) UI.toast('猫有九条命：还剩 ' + Passive.catLives + ' 条', Kit.color('gold'));
      else UI.toast('最后一条命用掉了', Kit.color('goldL'));
      return true;
    },
    hud: function () { return '命 ×' + Math.max(0, Passive.catLives | 0); },
    card: function (ctx) { return { n: ctx.inRun ? Math.max(0, Passive.catLives | 0) : N.lives }; }   // 菜单「每局 3 条命」，局内「还剩 n 条命」（data.js 的 summary / summaryRun）
  });
})();

// ---------------- 渔夫骑士 · 鱼篓满满 ----------------
(function () {
  var N = { life: 30, max: 10, perFish: 0.03 };
  var fish = [];                               // 每条鱼什么时候吃掉（Passive.clock）
  var lbl = null, lblN = 0, caught = 0;        // 头上「+n 鱼」那行字（0.8 秒内又钓上就加进去，不叠一行新的）；这一局一共钓上几条
  var MERGE = 0.8;
  Passive.def('fisher', {
    num: N,
    fish: function () { return fish.length; },
    caught: function () { return caught; },
    clear: function () { fish.length = 0; lbl = null; lblN = 0; },
    reset: function () { caught = 0; },
    onReel: function () {
      caught++;
      var full = fish.length >= N.max;
      if (full) fish.shift();
      fish.push(Passive.clock + N.life);
      if (full) return;                        // 鱼篓满了：换一条新鲜的，不出字、不出声
      if (lbl && !lbl.dead && FX.now - lbl.b < MERGE && lbl.t < lbl.life * 0.7) {
        lblN++; lbl.s = '+' + lblN + ' 鱼';
        if (lbl.t > 0.12) lbl.t = 0.12;        // 和合并的伤害数字一样：往回放一点，再弹一下
      } else {
        // 上一行还没淡完（0.8~1 秒后又钓上）：先收掉，头上不会叠成「+1+1 鱼」两行
        if (lbl && !lbl.dead && FX.texts) { var li = FX.texts.indexOf(lbl); if (li >= 0) FX.texts.splice(li, 1); lbl.dead = true; }
        lbl = FX.text(P.pos.x, P.pos.y + 2.4, P.pos.z, '+1 鱼', '#ffd84a', 1);
        lblN = 1;
      }
      if (Passive.emit) Passive.emit('fish', P.pos.x, P.pos.z);
    },
    update: function () { while (fish.length && fish[0] <= Passive.clock) fish.shift(); },
    dmgMult: function () { return 1 + N.perFish * fish.length; },
    hud: function () { return '鱼 ×' + fish.length; }
  });
})();
