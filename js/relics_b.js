'use strict';
// ============================================================
//  宝物 · b 部分（第 6 块）：命中时的战斗宝物
//  火绒盒、圣徽、铃铛项圈、决斗手套、教官的戒尺、刀油、三角小旗、老兵勋章、家族徽章、圣杯
//  约定（C6_WORK §1.1）：每件宝物一个 Relic.def(id, spec)；核心在 relics.js（a 部分），只把钩子分给拥有的宝物，
//  每个钩子最后一个参数 n = 拥有几件。c 部分（移动和地图）在 relics_c.js。
//  数值只从 spec.num 拿（和 tables.json items[].numbers 一样，测试会比）；card(ctx) 给卡上 {x} 的值（ctx.k = 卡上说的件数）。
//  要跟着「继续上一局」存下来的数放在 Passive 上（rel 开头，在 spec.reset 里设）；每个敌人 / 每把武器的记号
//  （e.duelN、e.standT、w.oilT）挂在对象上，不存档。伤害走 Relic.dmg / Enemies.damage，眩晕走 Evo.stun，
//  声音走 Relic.emit，效果真的发生了就 Relic.count(id)。
// ============================================================

(function () {
  // ---------------- 小工具 ----------------
  var col = function (role) { return typeof Kit !== 'undefined' && Kit.color ? Kit.color(role) : '#ffd84a'; };   // kit.js 在后面载入：只在运行时调用
  var pct = function (v) { return Math.round(v * 100); };
  var top = function (e) { return e.y + ((e.def && e.def.headTop) || e.r * 2) * (e.scale || 1) + 0.5; };          // 敌人头顶上方一点（飘字）
  // 每秒最多记一次（加成一直在生效的宝物）：id → 上次记的时间（Passive.clock）；开局在 reset 里清掉
  var last = {};
  var perSec = function (id) { var c = Passive.clock, t = last[id]; if (t === undefined || c < t || c - t >= 1) { last[id] = c; Relic.count(id); } };

  // ============================================================
  //  火绒盒：每命中 12 次，下一击点燃敌人 3 秒（每秒 25% 那一下的伤害；更强的持续伤害覆盖弱的）
  //  件数越多越快：12 / 6 / 4 次
  // ============================================================
  var tinderbox = Relic.def('tinderbox', {
    num: { every: 12, min: 4, t: 3, frac: 0.25 },
    every: function (n) { var m = tinderbox.num; return Math.max(m.min, Math.round(m.every / n)); },
    card: function (ctx) { return { n: tinderbox.every(ctx.k) }; },
    reset: function () { Passive.relTin = 0; },
    afterHit: function (w, e, dealt, crit, n) {
      if (e.prop) return;
      var m = tinderbox.num, ev = tinderbox.every(n);
      Passive.relTin = Math.min(ev + 1, (Passive.relTin || 0) + 1);
      if (Passive.relTin <= ev || !e.alive) return;            // 这一下打死了：留到下一击
      Passive.relTin = 0;
      Weapons.burn(w, e, dealt, m);                             // m 里有 frac / t
      var y = e.y + e.r;
      FX.burst(e.x, y, e.z, 7, 0xff8a3a, 4, 0.22);
      FX.burst(e.x, y, e.z, 4, 0xffd27a, 3, 0.16);
      FX.flash(e.x, y, e.z, 0.9, 0xff9a3a, 0.18, 0);
      Relic.emit('tinder', e.x, e.z);
      Relic.count('tinderbox');
    }
  });

  // ============================================================
  //  圣徽：对亡灵的伤害 +20%（e.def.undead，第 8 块标了 16 种）
  // ============================================================
  var holymedal = Relic.def('holymedal', {
    num: { bonus: 0.2 },
    card: function (ctx) { return { p: pct(holymedal.num.bonus * ctx.k) }; },
    reset: function () { delete last.holymedal; },
    hitMult: function (w, e, n) {
      if (!e.def || !e.def.undead) return 1;
      perSec('holymedal');
      return 1 + holymedal.num.bonus * n;
    }
  });

  // ============================================================
  //  铃铛项圈：对冻住或击晕的敌人伤害 +25%（e.frozen：冰冻和 Evo.stun 都写它）
  // ============================================================
  var bellcollar = Relic.def('bellcollar', {
    num: { bonus: 0.25 },
    card: function (ctx) { return { p: pct(bellcollar.num.bonus * ctx.k) }; },
    reset: function () { delete last.bellcollar; },
    hitMult: function (w, e, n) {
      if (!(e.frozen > 0) || e.prop) return 1;
      perSec('bellcollar');
      return 1 + bellcollar.num.bonus * n;
    }
  });

  // ============================================================
  //  决斗手套：对精英、小 Boss 和首领每打 15 下，下一下 3 倍伤害（飘字「破绽！」）；每个敌人自己数
  //  件数越多越快：15 / 10 / 5 下
  // ============================================================
  var duelglove = Relic.def('duelglove', {
    num: { every: 15, step: 5, min: 5, mult: 3 },
    every: function (n) { var m = duelglove.num; return Math.max(m.min, m.every - m.step * (n - 1)); },
    card: function (ctx) { return { n: duelglove.every(ctx.k) }; },
    hitMult: function (w, e, n) {
      if (e.prop || !(e.elite || e.mini || e.boss)) return 1;
      e.duelN = (e.duelN | 0) + 1;
      if (e.duelN <= duelglove.every(n)) return 1;
      e.duelN = 0;
      var y = top(e);
      FX.text(e.x, y, e.z, '破绽！', col('gold'), 1.3);
      FX.flash(e.x, e.y + e.r * 1.4 + 0.3, e.z, 1.6, 0xffd84a, 0.2, 2);
      Relic.emit('duel', e.x, e.z);
      Relic.count('duelglove');
      return duelglove.num.mult;
    }
  });

  // ============================================================
  //  教官的戒尺：暴击时 15% 几率让敌人罚站 2 秒（Boss、小 Boss 0.5 秒：引擎只让它们慢下来），这段时间受到的伤害 +25%
  //  几率按件数加，最多 45%；+25% 不叠加
  // ============================================================
  var ruler = Relic.def('ruler', {
    num: { chance: 0.15, chanceMax: 0.45, t: 2, bossT: 0.5, bonus: 0.25 },
    chance: function (n) { var m = ruler.num; return Math.min(m.chanceMax, m.chance * n); },
    card: function (ctx) { return { p: pct(ruler.chance(ctx.k)) }; },
    onCrit: function (w, e, dealt, n) {
      if (!e.alive || e.prop) return;
      if (Math.random() >= ruler.chance(n)) return;
      var m = ruler.num, t = e.boss || e.mini ? m.bossT : m.t, fresh = !(e.standT > Passive.clock);
      if (window.Evo && Evo.stun) Evo.stun(e, t);
      e.standT = Math.max(e.standT || 0, Passive.clock + t);
      if (fresh) {                                              // 还在罚站时再中：只延长，不再飘字出声
        FX.text(e.x, top(e) + 0.6, e.z, '罚站', col('gold'), 1.1);   // 比眩晕的金星高一点，不压在一起
        Relic.emit('stand', e.x, e.z);
      }
      Relic.count('ruler');
    },
    hitMult: function (w, e, n) { return e.standT > Passive.clock ? 1 + ruler.num.bonus : 1; }
  });

  // ============================================================
  //  刀油：武器暴击后，这把武器 3 秒内攻击速度 +15%（按件数加）；灵魂 / 兔子的伤害不会暴击，不会自己循环
  // ============================================================
  var oilFx = -9;              // 手上金光的时间（0.5 秒最多一次）
  var bladeoil = Relic.def('bladeoil', {
    num: { t: 3, atk: 0.15 },
    card: function (ctx) { return { p: pct(bladeoil.num.atk * ctx.k) }; },
    reset: function () { oilFx = -9; },
    onCrit: function (w, e, dealt, n) {
      if (!w) return;
      w.oilT = Passive.clock + bladeoil.num.t;
      if (Passive.clock - oilFx >= 0.5 || Passive.clock < oilFx) {
        oilFx = Passive.clock;
        for (var i = 0; i < 2; i++) FX.mote(P.pos.x + rand(-0.35, 0.35), P.pos.y + 1.1 + rand(0, 0.3), P.pos.z + rand(-0.35, 0.35), 0xf0c040, 0.14, 1.4, 0.6);
      }
      Relic.count('bladeoil');
    },
    atkMult: function (w, n) { return w && w.oilT > Passive.clock ? 1 + bladeoil.num.atk * n : 1; }
  });

  // ============================================================
  //  三角小旗：滑铲坐骑出现时（地上滑铲、空中按住滑铲：P.riding），攻击速度 +12%
  // ============================================================
  var penT = 1;                // 骑着的时间（每满 1 秒记一次）
  var pennant = Relic.def('pennant', {
    num: { atk: 0.12 },
    card: function (ctx) { return { p: pct(pennant.num.atk * ctx.k) }; },
    reset: function () { penT = 1; },
    update: function (dt, n) {
      if (!P.riding) { penT = 1; return; }
      if (penT >= 1) { penT -= 1; Relic.count('pennant'); }
      penT += dt;
    },
    atkMult: function (w, n) { return P.riding ? 1 + pennant.num.atk * n : 1; }
  });

  // ============================================================
  //  老兵勋章：每打倒一个小 Boss，这一局伤害 +5%、最大生命 +12（P.addMod：存档会带上，D-C6-5）
  // ============================================================
  var veteran = Relic.def('veteran', {
    num: { damage: 0.05, maxHp: 12 },
    card: function (ctx) { var m = veteran.num; return { p: pct(m.damage * ctx.k), n: m.maxHp * ctx.k }; },
    onKill: function (e, n) {
      if (!e.mini) return;
      var m = veteran.num;
      P.addMod('damage', m.damage * n);
      P.addMod('maxHp', m.maxHp * n);
      FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '勋章 +1', col('gold'), 1.3);
      FX.flash(P.pos.x, P.pos.y + 1.4, P.pos.z, 1.4, 0xd9a64a, 0.25, 2);
      Relic.emit('medal', P.pos.x, P.pos.z);
      Relic.count('veteran');
    }
  });

  // ============================================================
  //  家族徽章：每有一枚 5 级以上的纹章，伤害 +6%、最大生命 +10（从 P.tomes 算，继续游戏也对）
  // ============================================================
  var familycrest = Relic.def('familycrest', {
    num: { lv: 5, damage: 0.06, maxHp: 10 },
    card: function (ctx) { var m = familycrest.num; return { p: pct(m.damage * ctx.k), n: m.maxHp * ctx.k }; },
    reset: function () { delete last.familycrest; },
    crests: function () { var c = 0; for (var i = 0; i < P.tomes.length; i++) if (P.tomes[i].level >= familycrest.num.lv) c++; return c; },
    stats: function (st, n) {
      var m = familycrest.num, c = familycrest.crests();
      if (c <= 0) return;
      st.damage += m.damage * c * n;
      st.maxHp += m.maxHp * c * n;
      perSec('familycrest');
    }
  });

  // ============================================================
  //  圣杯：每次升级回复 30% 生命（按件数加，最多 100%），10 秒内伤害 +25%（P.temp key relic:holygrail，再升级是刷新）
  // ============================================================
  var holygrail = Relic.def('holygrail', {
    num: { heal: 0.3, t: 10, damage: 0.25 },
    card: function (ctx) { var m = holygrail.num; return { p: pct(Math.min(1, m.heal * ctx.k)), q: pct(m.damage * ctx.k) }; },
    onLevel: function (n) {
      if (!P.alive) return;
      var m = holygrail.num;
      P.heal(Math.min(1, m.heal * n) * P.st.maxHp);
      P.addTemp('damage', m.damage * n, m.t, 'relic:holygrail');
      FX.flash(P.pos.x, P.pos.y + 1.3, P.pos.z, 2.2, 0xffe27a, 0.3, 2);
      for (var i = 0; i < 6; i++) FX.mote(P.pos.x + rand(-0.5, 0.5), P.pos.y + 0.6 + rand(0, 0.8), P.pos.z + rand(-0.5, 0.5), 0xffd84a, 0.13, 1.6 + rand(0, 0.6), 1.0);
      Relic.emit('grail', P.pos.x, P.pos.z);
      Relic.count('holygrail');
    }
  });
})();
