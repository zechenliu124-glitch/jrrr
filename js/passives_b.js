'use strict';
// ============================================================
//  骑士被动 · b 部分（第 5 块）：见习骑士、敲钟骑士、伙夫骑士、占星骑士、发条锡兵、熊骑士、画盾骑士
//  写法按 C5_WORK §1 的约定：每位骑士一个 Passive.def(id, spec)，核心（passives.js）只把钩子分给当前骑士。
//  数值只从 spec.num 拿（和 tables.json 的 passive.numbers 一模一样，测试会比）；
//  要跟着「继续上一局」存下来的状态是 Passive 上的数字（belCd、cookCd、astI、tinW、fury……），其他放在闭包里。
//  临时属性走 P.addTemp（key：meal / star / fury），从不 P.addMod；提示的颜色用 Kit.color 的用途名。
// ============================================================

(function () {
  // ---------------- 小工具 ----------------
  var emit = function (name) { if (Passive.emit) Passive.emit(name, P.pos.x, P.pos.z); };   // 声音事件（a 部分接 audio_hooks）
  var toast = function (text, role) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(text, Kit.color(role)); };
  var pct = function (v) { return Math.round(v * 100); };
  // 周期计时：把这一帧多走的那一点留到下一轮（每轮正好 cd 秒，不会每轮慢一帧）
  var again = function (t, cd) { t += cd; return t > 0 ? t : cd; };
  var secs = function (t) { return (t > 0 ? Math.max(1, Math.ceil(t - 1e-6)) : 0) + ' 秒'; };   // 还在倒数就不显示 0 秒（HUD 的秒写「秒」，D-C13-1）
  // 身边 r 米内的敌人个数（不算道具）
  var nearCount = function (r) {
    var n = 0;
    Enemies.inRadius(P.pos.x, P.pos.z, r, function (e) { if (!e.prop) n++; });
    return n;
  };
  // P.temp 里这个 key 剩下最长的时间（没有 = 0）
  var tempLeft = function (key) {
    var t = 0;
    for (var i = 0; i < P.temp.length; i++) if (P.temp[i].key === key && P.temp[i].t > t) t = P.temp[i].t;
    return t;
  };

  // ============================================================
  //  见习骑士 · 勤学苦练：每升 3 级，等级最低的武器免费升 1 级（普通稀有度）
  // ============================================================
  var squire = {
    num: { every: 3, rarity: 0 },
    onLevel: function () {
      var n = squire.num, w = null;
      if (P.level % n.every !== 0) return;
      for (var i = 0; i < P.weapons.length; i++) {
        var x = P.weapons[i];
        if (x.level < LEVEL_CAP.weapon && (!w || x.level < w.level)) w = x;   // 一样低取前面那把
      }
      if (!w) return;                                                         // 全满级了
      Weapons.applyUpgrade(w, Weapons.rollUpgrade(w, n.rarity));
      toast('勤学苦练：' + w.def.name + ' 升到 Lv' + w.level, 'gold');
      FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '勤学苦练', Kit.color('gold'), 1.1);
    },
    hud: function () { var e = squire.num.every; return '勤学 ' + (P.level % e) + '/' + e; },
    card: function (ctx) { return { every: squire.num.every }; }
  };
  Passive.def('squire', squire);

  // ============================================================
  //  敲钟骑士 · 晨钟暮鼓：每 10 秒敲钟，3 秒内攻速 +40%，身边每个敌人再 +5%（最多再 +30%）
  // ============================================================
  var BELL_SCAN = 0.25;          // 钟声里每隔多久重数一次身边的敌人
  var belK = 1, belScan = 0;     // 当前攻速倍率、下次重数的倒计时（闭包，继续游戏时马上重数）
  var bell = {
    num: { cd: 10, time: 3, atkSpeed: 0.4, perEnemy: 0.05, maxExtra: 0.3, radius: 6 },
    reset: function () { Passive.belCd = bell.num.cd; Passive.belT = 0; belK = 1; belScan = 0; },
    update: function (dt) {
      var n = bell.num;
      if (Passive.belT > 0) Passive.belT = Math.max(0, Passive.belT - dt);
      Passive.belCd -= dt;
      if (Passive.belCd <= 0) {
        Passive.belCd = again(Passive.belCd, n.cd);
        Passive.belT = n.time;
        belScan = 0;
        FX.ring(P.pos.x, P.pos.y, P.pos.z, n.radius, 0xffd84a, 0.5);
        FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '当', Kit.color('gold'), 1.4);
        emit('bell');
      }
      if (Passive.belT > 0) {
        belScan -= dt;
        if (belScan <= 0) { belScan = BELL_SCAN; belK = 1 + n.atkSpeed + Math.min(n.maxExtra, n.perEnemy * nearCount(n.radius)); }
      } else { belK = 1; belScan = 0; }
    },
    atkMult: function () { return Passive.belT > 0 ? belK : 1; },
    hud: function () {
      if (Passive.belT > 0) return '钟声 +' + pct(belK - 1) + '% ' + secs(Passive.belT);
      return '钟声 ' + secs(Passive.belCd);
    },
    card: function (ctx) { return { cd: bell.num.cd, time: bell.num.time }; }
  };
  Passive.def('bellringer', bell);

  // ============================================================
  //  伙夫骑士 · 开饭啦：每 40 秒回 15% 最大生命，之后 15 秒伤害 +15%、移速 +10%
  // ============================================================
  var cook = {
    num: { cd: 40, heal: 0.15, buffTime: 15, damage: 0.15, moveSpeed: 0.1 },
    reset: function () { Passive.cookCd = cook.num.cd; },
    update: function (dt) {
      var n = cook.num;
      Passive.cookCd -= dt;
      if (Passive.cookCd > 0) return;
      Passive.cookCd = again(Passive.cookCd, n.cd);
      P.heal(n.heal * P.st.maxHp);
      P.addTemp('damage', n.damage, n.buffTime, 'meal');
      P.addTemp('moveSpeed', n.moveSpeed, n.buffTime, 'meal');
      FX.smoke(P.pos.x, P.pos.y + 1.6, P.pos.z, 8, 0xffffff);              // 白色热气
      FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '开饭啦！', Kit.color('gold'), 1.3);
      emit('meal');
    },
    hud: function () {
      var t = tempLeft('meal');
      return t > 0 ? '吃饱 ' + secs(t) : '开饭 ' + secs(Passive.cookCd);
    },
    card: function (ctx) { return { cd: cook.num.cd }; }
  };
  Passive.def('cook', cook);

  // ============================================================
  //  占星骑士 · 星象轮转：每 40 秒换星座 狮子 → 天马 → 巨蟹 → 天秤 → 狮子……
  //  巨蟹座的受伤 −15% 走 dmgTakenMult（不写护甲小数），其他属性进 P.temp（key 'star'，一直在，换座时换掉）
  // ============================================================
  var SIGNS = [
    { key: 'lion', name: '狮子座', sub: function (s) { return '伤害 +' + pct(s.damage) + '%'; } },
    { key: 'pegasus', name: '天马座', sub: function (s) { return '移速、跳跃 +' + pct(s.moveSpeed) + '%'; } },
    { key: 'crab', name: '巨蟹座', sub: function (s) { return '受伤 −' + pct(-s.dmgTaken) + '%，回血'; } },
    { key: 'libra', name: '天秤座', sub: function (s) { return '经验、金币 +' + pct(s.xpGain) + '%'; } }
  ];
  var astro = {
    num: { period: 40, lion: { damage: 0.2 }, pegasus: { moveSpeed: 0.2, jump: 0.2 }, crab: { dmgTaken: -0.15, regen: 40 }, libra: { xpGain: 0.2, goldGain: 0.2 } },
    reset: function () { Passive.astI = 0; Passive.astT = astro.num.period; Passive.astOn = 0; },
    sign: function () { return SIGNS[((Passive.astI | 0) % SIGNS.length + SIGNS.length) % SIGNS.length]; },
    stats: function () { return astro.num[astro.sign().key] || {}; },
    // 换上当前星座（可以重复调用：先去掉旧的 'star' 条目）
    apply: function () {
      var s = astro.stats(), added = 0;
      P.clearTemp('star', true);
      for (var k in s) if (k !== 'dmgTaken') { P.addTemp(k, s[k], Infinity, 'star'); added++; }
      if (!added) P.recalc();
    },
    update: function (dt) {
      if (!Passive.astOn) { astro.apply(); Passive.astOn = 1; }             // 开局 / 继续游戏：不弹横幅（关卡卡片正在显示）
      Passive.astT -= dt;
      if (Passive.astT > 0) return;
      Passive.astI = (Passive.astI + 1) % SIGNS.length;
      Passive.astT = again(Passive.astT, astro.num.period);
      astro.apply();
      var g = astro.sign();
      if (typeof Feel !== 'undefined' && Feel.banner) Feel.banner({ top: '星象轮转', title: g.name, sub: g.sub(astro.stats()) });
      emit('star');
    },
    dmgTakenMult: function () {
      if (!Passive.astOn) return 1;
      var s = astro.stats();
      return s.dmgTaken ? 1 + s.dmgTaken : 1;
    },
    hud: function () { return astro.sign().name + ' ' + secs(Passive.astT); },
    card: function (ctx) { return { period: astro.num.period, sign: ctx && ctx.inRun ? astro.sign().name : SIGNS[0].name }; }
  };
  Passive.def('astrologer', astro);

  // ============================================================
  //  发条锡兵 · 上发条：发条从 100% 开始每秒 −5%；有劲时攻速 +30%；滑铲每秒 +35%，站着不动每秒 +10%
  //  （D-C5-6：滑铲 / 站着时不再消耗，直接按回的速度算）背后发条钥匙的转速 = capeSpin × 发条
  // ============================================================
  var tinA = 0, tinLow = false;   // 钥匙转到的角度；发条掉到一半以下过（再上满时响一声）
  var TIN_REARM = 0.5;            // 掉到一半以下才重新准备（滑一下就满，不然响得太勤）
  var tin = {
    num: { drain: 0.05, atkSpeed: 0.3, slideWind: 0.35, idleWind: 0.1 },
    reset: function () { Passive.tinW = 1; tinA = 0; tinLow = false; },
    update: function (dt) {
      var n = tin.num, m = Input.move || { x: 0, y: 0 };
      var riding = !!P.riding;                                                 // 地面滑铲和空中坐骑都算「滑铲」
      var idle = P.onGround && P.speed() < 0.5 && Math.sqrt(m.x * m.x + m.y * m.y) < 0.1;
      var w0 = Passive.tinW, w = clamp(w0 + dt * (riding ? n.slideWind : idle ? n.idleWind : -n.drain), 0, 1);
      Passive.tinW = w;
      if (w0 > 0 && w <= 0) emit('wind_empty');
      if (w < TIN_REARM) tinLow = true;
      else if (w >= 1 && tinLow) { tinLow = false; emit('wind_full'); }
    },
    atkMult: function () { return Passive.tinW > 0 ? 1 + tin.num.atkSpeed : 1; },
    // 盖掉 models_chars.js 里 t × capeSpin 的转法：角度按发条值往前走（不改模型文件）
    pose: function (body, dt) {
      var u = body && body.userData, d = u && u.def, b = u && u.bones;
      if (!d || !d.capeSpin || !b || !b.cape) return;
      tinA = (tinA + (dt || 0) * d.capeSpin * Passive.tinW) % (Math.PI * 2);
      b.cape.rotation.set(0, 0, tinA);
    },
    hud: function () { return '发条 ' + pct(Passive.tinW) + '%'; },
    card: function (ctx) { return { atk: pct(tin.num.atkSpeed), wind: ctx && ctx.inRun ? pct(Passive.tinW) : 100 }; }
  };
  Passive.def('tinsoldier', tin);

  // ============================================================
  //  熊骑士 · 熊脾气：每失去 1% 最大生命 +4 怒气；满 100 暴怒 8 秒：攻速 +40%、范围 +25%、受伤 −20%
  //  暴怒时模型慢慢变大到 1.08 倍，脚下一圈红光闪（FX.glow 实例，不换材质）
  // ============================================================
  var BEAR_GROW = 0.08, bearK = 0, bearRed = null;
  var bear = {
    num: { perPct: 4, full: 100, time: 8, atkSpeed: 0.4, size: 0.25, dmgTaken: -0.2 },
    reset: function () { Passive.fury = 0; Passive.furyT = 0; bearK = 0; },
    onHurt: function (lost) {
      var n = bear.num;
      if (Passive.furyT > 0 || !(lost > 0) || !(P.st.maxHp > 0)) return;     // 暴怒时不攒；护盾挡掉的不算
      Passive.fury += lost / P.st.maxHp * 100 * n.perPct;
      if (Passive.fury < n.full) return;
      Passive.fury = 0;
      Passive.furyT = n.time;
      P.addTemp('size', n.size, n.time, 'fury');
      toast('暴怒 ' + n.time + ' 秒！', 'gold');
      FX.burst(P.pos.x, P.pos.y + 1, P.pos.z, 14, 0xff3a2a, 6, 0.3);
      emit('fury');
    },
    update: function (dt) { if (Passive.furyT > 0) Passive.furyT = Math.max(0, Passive.furyT - dt); },
    atkMult: function () { return Passive.furyT > 0 ? 1 + bear.num.atkSpeed : 1; },
    dmgTakenMult: function () { return Passive.furyT > 0 ? 1 + bear.num.dmgTaken : 1; },
    pose: function (body, dt) {
      var B = body && body.userData && body.userData.B;
      if (!B) return;
      var on = Passive.furyT > 0;
      bearK = P.ease(bearK, on ? 1 : 0, 6, dt || 0);
      if (!on && bearK < 1e-3) bearK = 0;
      body.scale.setScalar(B.scale * (1 + BEAR_GROW * bearK));
      if (on && FX.glow) {
        if (!bearRed) bearRed = new THREE.Color(0xff3a2a);
        FX.glow(P.pos.x, P.pos.y + 1.1, P.pos.z, 2.4, 2.6, bearRed, 0.35 + 0.25 * Math.sin(Game.time * 12), 1);
      }
    },
    hud: function () {
      if (Passive.furyT > 0) return '暴怒 ' + secs(Passive.furyT);
      return '怒气 ' + Math.floor(Passive.fury / bear.num.full * 100) + '%';
    },
    card: function (ctx) { return { time: bear.num.time, fury: ctx && ctx.inRun ? Math.floor(Passive.fury) : 0 }; }
  };
  Passive.def('bear', bear);

  // ============================================================
  //  画盾骑士 · 描金：纹章栏位 +1、武器栏位 −1（在 CHARACTERS 的 stats 里）；每枚纹章伤害 +4%
  // ============================================================
  var painter = {
    num: { tomeSlots: 1, weaponSlots: -1, dmgPerCrest: 0.04 },
    dmgMult: function () { return 1 + painter.num.dmgPerCrest * P.tomes.length; },
    hud: function () { return '纹章 ×' + P.tomes.length; },
    card: function (ctx) { return { n: ctx && ctx.inRun ? P.tomes.length : 0, pct: pct(painter.num.dmgPerCrest) }; }
  };
  Passive.def('painter', painter);
})();
