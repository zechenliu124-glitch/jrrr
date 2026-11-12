'use strict';
// ============================================================
//  行会互动点的音效（interact_guild.js 的七种 + 点燃烽火台）：配方 + 接线
//  · 配方和 audio_sfx.js 一样只用 SFX.S / SFX.INST 的积木现场合成，全部原创
//  · 接线只包装 Guild 的函数（原函数照常调用）和 SFX.USE / SFX.onTick，不改别的文件
//  · 滚石的滚动声是循环音：推的时候开，碎了 / 换关停；每 50 毫秒按速度调音量和音色（被暂停收掉了就重新开）
// ============================================================
(function () {
  if (typeof SFX === 'undefined' || !SFX.S) return;
  var S = SFX.S, I = SFX.INST;
  var D = function (name, def, fn) { def.fn = fn; SFX.DEFS[name] = def; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  // ---------------- 誓言石碑 ----------------
  // 立誓：三声低沉的 FM 钟 + 一层石头的嗡声
  D('oath', { gap: 0.5, grp: 'use', vol: 0.32, pri: 1, wet: 0.4 }, function (t, k) {
    [392, 494, 587].forEach(function (f, i) { S.fm(t + i * 0.11, f * k, 2.01, 1.6, 1.0, 0.28); });
    S.nz(t, 0.6, 0.5, { type: 'lp', f: 220, q: 1, a: 0.08, kind: 'brown' });
    S.tone(t, 'sine', 98 * k, 0.7, 0.25, { a: 0.05 });
  });
  // 誓言达成：往上走的 FM 琶音 + 高处的沙沙亮光
  D('oath_done', { gap: 0.5, grp: 'use', vol: 0.33, pri: 1, wet: 0.45 }, function (t, k) {
    [523, 659, 784, 988, 1175].forEach(function (f, i) { S.fm(t + i * 0.07, f * k * 0.94, 3.01, 1.1, 1.1, 0.27); });
    S.nz(t + 0.1, 1, 0.1, { type: 'hp', f: 6500, a: 0.25 });
    S.tone(t + 0.35, 'triangle', 1568 * k * 0.94, 0.6, 0.12, { a: 0.02 });
  });
  // 誓言没守住：石头裂开（一声脆响、几下碎石、闷响往下沉）
  D('oath_break', { gap: 0.5, grp: 'use', vol: 0.36, pri: 1, wet: 0.25 }, function (t, k) {
    S.nz(t, 0.08, 0.8, { type: 'bp', f: 900 * k, q: 1.2 });
    for (var i = 0; i < 5; i++) S.nz(t + 0.03 + Math.random() * 0.22, 0.015, 0.45, { type: 'bp', f: rnd(1800, 3200), q: 3 });
    S.tone(t, 'sine', 120 * k, 0.45, 0.6, { f1: 60, sw: 0.4 });
  });

  // ---------------- 比武木人 ----------------
  // 开始：木头敲两下 + 一声大鼓
  D('quintain', { gap: 0.3, grp: 'use', vol: 0.36, pri: 1, wet: 0.2 }, function (t, k) {
    for (var i = 0; i < 2; i++) {
      var tt = t + i * 0.13;
      S.nz(tt, 0.05, 0.6, { type: 'bp', f: 500 * k, q: 2 });
      S.tone(tt, 'sine', 180 * k, 0.08, 0.5, { f1: 90, sw: 0.07 });
    }
    I.taiko(t + 0.3, 0, 0, 0.7);
  });
  // 每一下命中：短促的木头闷响（gap 0.12 秒，打得再密也不会糊成一片）
  D('quintain_hit', { gap: 0.12, grp: 'use', vol: 0.3, jit: 2 }, function (t, k) {
    S.nz(t, 0.04, 0.6, { type: 'bp', f: rnd(360, 480) * k, q: 2 });
    S.tone(t, 'sine', 150 * k, 0.05, 0.45, { f1: 100, sw: 0.04 });
  });
  // 时间到：一声铜锣
  D('quintain_gong', { gap: 1, grp: 'use', vol: 0.3, pri: 1, wet: 0.5 }, function (t, k) {
    S.fm(t, 196 * k, 1.41, 3, 2.2, 0.45, { idx1: 0.3 });
    S.fm(t, 392 * k, 1.41, 1.5, 1.4, 0.18);
    S.nz(t, 0.05, 0.3, { type: 'lp', f: 600, kind: 'brown' });
  });

  // ---------------- 滚石 ----------------
  // 推一把：沉重的摩擦 + 一声闷响
  D('boulder', { gap: 0.5, grp: 'use', vol: 0.4, pri: 1, wet: 0.15 }, function (t, k) {
    S.nz(t, 0.5, 0.7, { type: 'lp', f: 300, q: 1, a: 0.05, kind: 'brown' });
    S.tone(t + 0.04, 'sine', 80 * k, 0.4, 0.7, { f1: 50, sw: 0.35 });
  });
  // 滚动（循环音）：棕噪声低通 + 一个上下起伏的轰隆声；g 音量、f 滤波、am 起伏快慢都可以调
  D('boulder_roll', { grp: 'loop', vol: 0.42, loop: true }, function (t) {
    var end = t + 3600;
    var n = S.noise(t, end, 'brown'), fl = S.filt(t, 'lowpass', 160, 1.2);
    var am = S.gain(0.7), g = S.gain(0.0001);
    n.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
    var lfo = S.osc(t, 'sine', 5, end), lg = S.gain(0.3);
    lfo.connect(lg); lg.connect(am.gain);
    var hum = S.osc(t, 'triangle', 46, end), hl = S.filt(t, 'lowpass', 180, 1), hg = S.gain(0.25);
    hum.connect(hl); hl.connect(hg); hg.connect(g);
    S.param('g', g.gain); S.param('f', fl.frequency); S.param('am', lfo.frequency);
  });
  // 碎了：一声炸开 + 一串碎石 + 闷响
  D('boulder_break', { gap: 0.3, grp: 'use', vol: 0.4, pri: 1, wet: 0.25 }, function (t, k) {
    S.nz(t, 0.25, 0.8, { type: 'bp', f: 700 * k, q: 1 });
    for (var i = 0; i < 8; i++) S.nz(t + Math.random() * 0.2, 0.02, 0.4, { type: 'bp', f: rnd(1200, 2600), q: 3 });
    S.tone(t, 'sine', 90 * k, 0.4, 0.7, { f1: 45, sw: 0.35 });
  });

  // ---------------- 决斗旗 ----------------
  // 拔旗：铁手套砸地的铛一声 + 一声号角
  D('gauntlet', { gap: 0.5, grp: 'use', vol: 0.3, pri: 1, wet: 0.35 }, function (t, k) {
    S.fm(t, 310 * k, 2.76, 4, 0.5, 0.5);
    S.nz(t, 0.04, 0.4, { type: 'hp', f: 2500 });
    I.brass(t + 0.18, 220, 0.9, 0.3, { br: 5, a: 0.05, rel: 0.3 });
    I.brass(t + 0.18, 330, 0.9, 0.22, { br: 5, a: 0.05, rel: 0.3 });
  });

  // ---------------- 补给马车 ----------------
  // 翻箱子：几下木头哗啦 + 两下咔嗒 + 箱盖一声
  D('search', { gap: 0.4, grp: 'use', vol: 0.36, pri: 1, wet: 0.15 }, function (t, k) {
    for (var i = 0; i < 6; i++) S.nz(t + Math.random() * 0.45, 0.03, 0.5, { type: 'bp', f: rnd(600, 1500) * k, q: 3 });
    S.click(t + 0.12, 0.4, 2200);
    S.click(t + 0.31, 0.35, 2600);
    S.nz(t + 0.5, 0.06, 0.6, { type: 'lp', f: 500, kind: 'brown' });
    S.tone(t + 0.5, 'sine', 140 * k, 0.1, 0.4, { f1: 80, sw: 0.08 });
  });

  // ---------------- 炼金坩埚 ----------------
  // 走近按 E：咕嘟咕嘟冒泡
  D('crucible', { gap: 0.5, grp: 'use', vol: 0.3, pri: 1, wet: 0.3 }, function (t, k) {
    for (var i = 0; i < 10; i++) {
      var f = rnd(300, 700) * k;
      S.tone(t + i * 0.08 + Math.random() * 0.03, 'sine', f, 0.04, 0.4, { f1: f * 1.8, sw: 0.04 });
    }
    S.nz(t, 0.8, 0.15, { type: 'lp', f: 400, a: 0.1, kind: 'brown' });
  });
  // 炼成了：一声高的 FM 铃 + 两颗闪光 + 高处的沙沙声
  D('crucible_done', { gap: 0.5, grp: 'use', vol: 0.3, pri: 1, wet: 0.45 }, function (t, k) {
    S.fm(t, 1760 * k, 3.5, 1.6, 0.9, 0.3);
    S.tone(t + 0.12, 'triangle', 1319 * k, 0.3, 0.2);
    S.tone(t + 0.22, 'triangle', 2093 * k, 0.3, 0.16);
    S.nz(t, 0.7, 0.08, { type: 'hp', f: 7000, a: 0.1 });
  });

  // ---------------- 行商驴车 ----------------
  // 拨浪鼓咚咚咚 + 毛驴叫两声
  D('pedlar', { gap: 1, grp: 'use', vol: 0.3, pri: 1, wet: 0.2 }, function (t) {
    for (var i = 0; i < 3; i++) I.taiko(t + i * 0.12, 0, 0, 0.45);
    S.tone(t + 0.45, 'sawtooth', 620, 0.35, 0.3, { f1: 330, sw: 0.33, lp: 1800, vib: 6, vd: 30 });
    S.tone(t + 0.85, 'sawtooth', 520, 0.3, 0.28, { f1: 300, sw: 0.28, lp: 1800, vib: 6, vd: 30 });
  });

  // ---------------- 烽火台 ----------------
  // 点燃：火苗呼地窜上去 + 一声低沉的轰 + 号角（后面跟 audio_hooks.js 的首领吼叫和战鼓）
  D('beacon_light', { gap: 2, grp: 'big', vol: 0.36, pri: 1, wet: 0.4 }, function (t) {
    S.nz(t, 0.6, 0.6, { type: 'bp', f: 400, q: 1.2, f2: 2400, fsw: 0.55, a: 0.12 });
    S.tone(t + 0.1, 'sine', 70, 0.6, 0.8, { f1: 40, sw: 0.55 });
    I.brass(t + 0.35, 147, 1.4, 0.3, { br: 4, a: 0.1, rel: 0.4 });
    I.brass(t + 0.35, 220, 1.4, 0.22, { br: 4, a: 0.1, rel: 0.4 });
  });

  // ---------------- 接线 ----------------
  // 按 E 的声音（bossportal 原来是 null：点燃烽火台自己有声音了）
  Object.assign(SFX.USE, {
    oathstone: 'oath', quintain: 'quintain', boulder: 'boulder', gauntlet: 'gauntlet',
    supplycart: 'search', crucible: 'crucible', pedlar: 'pedlar', bossportal: 'beacon_light'
  });
  if (typeof Guild === 'undefined') return;
  var G = SFX.G = { roll: null };
  // 包一层：原函数之后调用（出错只记下来，不影响游戏）
  var after = function (name, fn) {
    var f = Guild[name];
    if (typeof f !== 'function') return;
    Guild[name] = function () {
      var r = f.apply(this, arguments);
      try { fn.call(this, r, arguments); } catch (e) { SFX.err(e); }
      return r;
    };
  };
  var PO = { x: 0, z: 0 };
  var at = function (name, o) {
    if (!SFX.live) return;
    if (o) { PO.x = o.x; PO.z = o.z; SFX.play(name, PO); } else SFX.play(name);
  };
  G.stopRoll = function () { if (G.roll) { SFX.stopVoice(G.roll, 0.25); G.roll = null; } };
  G.startRoll = function (o) {
    G.stopRoll();
    if (!SFX.live || !o) return;
    PO.x = o.x; PO.z = o.z;
    G.roll = SFX.play('boulder_roll', PO);
  };
  after('oathDone', function (r, a) { at('oath_done', a[0]); });
  after('oathBreak', function (r, a) { at('oath_break', a[0]); });
  after('quintainHit', function (r, a) { at('quintain_hit', a[0]); });
  after('endJoust', function (r, a) { at('quintain_gong', a[0]); });
  after('crucibleFuse', function (r, a) { at('crucible_done', a[0]); });
  after('push', function (r, a) { if (Guild.rolling === a[0]) G.startRoll(a[0]); });
  after('breakBoulder', function (r, a) { G.stopRoll(); at('boulder_break', a[0]); });
  after('reset', function () { G.stopRoll(); });
  // 每 50 毫秒：滚动声跟着速度走（音量还按离玩家多远衰减）；暂停时 SFX.hush 收掉了就重新开
  var SP = { pan: 0, att: 1 };
  G.tick = function () {
    var o = Guild.rolling, play = typeof Game !== 'undefined' && Game.state === 'play' && SFX.live;
    if (!o || !play || o.used) { G.stopRoll(); return; }
    if (!G.roll || G.roll.dead || G.roll.stopAt != null) G.startRoll(o);
    if (!G.roll) return;
    var vx = o.vx || 0, vz = o.vz || 0, sp = Math.sqrt(vx * vx + vz * vz);
    SFX.spatial(o.x, o.z, SP);
    SFX.setParam(G.roll, 'g', Math.min(1, sp / 16) * SP.att, 0.06);
    SFX.setParam(G.roll, 'f', 140 + sp * 12, 0.08);
    SFX.setParam(G.roll, 'am', 4 + Math.min(8, sp * 0.5), 0.1);
  };
  var tick0 = SFX.onTick;
  SFX.onTick = function (t) {
    if (tick0) tick0(t);
    try { G.tick(t); } catch (e) { SFX.err(e); }
  };
})();
