'use strict';
// ============================================================
//  音效配方：SFX.DEFS[名字] = { gap 最短间隔秒, grp 组（同时发声上限见 SFX.GROUPS）, vol 音量, wet 混响,
//                              pri 优先级（2 = 发声满了也能响）, jit 随机音高（半音）, loop 循环音, fn(t, k, o) }
//  fn 里用 SFX.S 的积木：t 开始时间，k 音高倍数（随机 × o.pitch），o 是 SFX.play 的参数
//  全部原创：只用振荡器、噪声、滤波、包络和 FM 现场合成
// ============================================================
(function () {
  var S = SFX.S, I = SFX.INST;
  var D = function (name, def, fn) { def.fn = fn; SFX.DEFS[name] = def; };
  var rnd = function (a, b) { return a + Math.random() * (b - a); };

  // ---------------- 界面 ----------------
  D('tick', { gap: 0.03, grp: 'ui', vol: 0.56, pri: 2 }, function (t, k) {
    S.tone(t, 'square', 1500 * k, 0.03, 0.5, { lp: 4200 });
  });
  D('click', { gap: 0.04, grp: 'ui', vol: 0.686, pri: 2 }, function (t, k) {
    S.tone(t, 'square', 780 * k, 0.05, 0.55, { f1: 540 * k, sw: 0.045, lp: 3200 });
    S.click(t, 0.35, 2600);
  });
  D('hover', { gap: 0.05, grp: 'ui', vol: 0.352, pri: 2 }, function (t, k) {
    S.tone(t, 'sine', 1320 * k, 0.035, 0.6);
  });
  D('open', { gap: 0.08, grp: 'ui', vol: 0.377, pri: 2 }, function (t, k) {
    S.nz(t, 0.12, 0.35, { type: 'bp', f: 700, q: 1, f2: 2600, fsw: 0.1 });
    S.tone(t + 0.02, 'triangle', 620 * k, 0.09, 0.6, { f1: 930 * k, sw: 0.07, lp: 4000 });
  });
  D('close', { gap: 0.08, grp: 'ui', vol: 0.5, pri: 2 }, function (t, k) {
    S.nz(t, 0.1, 0.3, { type: 'bp', f: 2200, q: 1, f2: 700, fsw: 0.09 });
    S.tone(t + 0.01, 'triangle', 820 * k, 0.08, 0.5, { f1: 520 * k, sw: 0.07, lp: 3500 });
  });
  // 选卡：越稀有后面跟的闪光音越多
  D('select', { gap: 0.05, grp: 'ui', vol: 0.295, pri: 2, wet: 0.18 }, function (t, k, o) {
    var r = o.rarity || 0;
    S.tone(t, 'triangle', 660 * k, 0.1, 0.7, { lp: 4500 });
    S.tone(t + 0.055, 'triangle', 990 * k, 0.18, 0.7, { lp: 5000 });
    var up = [1, 1.26, 1.5, 2, 2.52];
    for (var i = 0; i < Math.min(r, 4); i++) S.tone(t + 0.1 + i * 0.045, 'sine', 1320 * k * up[i], 0.22, 0.32);
    if (r >= 4) { S.fm(t + 0.13, 1760 * k, 3.5, 1.6, 0.9, 0.22); S.nz(t + 0.1, 0.5, 0.06, { type: 'hp', f: 7000, a: 0.12 }); }
  });
  // 开始游戏：拔剑声 + 一个和弦
  D('start', { gap: 0.5, grp: 'ui', vol: 0.288, pri: 2, wet: 0.3 }, function (t, k) {
    S.nz(t, 0.25, 0.5, { type: 'bp', f: 1500, q: 2, f2: 5000, fsw: 0.2, a: 0.06 });
    S.fm(t + 0.12, 2400, 2.76, 1.4, 0.5, 0.18);
    [392, 494, 587, 784].forEach(function (f, i) { I.brass(t + 0.16 + i * 0.012, f, 0.45, 0.32, {}); });
    I.timp(t + 0.16, 98, 0.5, 0.7);
  });
  D('deny', { gap: 0.25, grp: 'ui', vol: 0.162, pri: 2 }, function (t) {
    S.tone(t, 'square', 185, 0.08, 0.55, { lp: 1200 });
    S.tone(t + 0.1, 'square', 150, 0.13, 0.55, { lp: 1000 });
  });
  D('reroll', { gap: 0.1, grp: 'ui', vol: 0.28, pri: 2 }, function (t, k) {
    for (var i = 0; i < 4; i++) S.nz(t + i * 0.045, 0.04, 0.6, { type: 'bp', f: 2600 + i * 450, q: 2 });
    S.tone(t + 0.18, 'triangle', 700 * k, 0.13, 0.6, { f1: 1100 * k, sw: 0.1, lp: 4500 });
  });
  D('skip', { gap: 0.1, grp: 'ui', vol: 0.227, pri: 2 }, function (t, k) {
    S.tone(t, 'triangle', 880 * k, 0.08, 0.6, { lp: 4000 });
    S.tone(t + 0.07, 'triangle', 587 * k, 0.12, 0.6, { lp: 3000 });
  });
  D('banish', { gap: 0.1, grp: 'ui', vol: 0.716, pri: 2, wet: 0.25 }, function (t) {
    S.nz(t, 0.35, 0.7, { type: 'lp', f: 2400, q: 0.8, f2: 200, fsw: 0.3, kind: 'pink' });
    S.tone(t, 'sawtooth', 220, 0.3, 0.3, { f1: 70, sw: 0.28, lp: 900 });
  });
  D('take', { gap: 0.1, grp: 'ui', vol: 0.298, pri: 2, wet: 0.2 }, function (t, k) {
    [784, 988, 1319].forEach(function (f, i) { S.tone(t + i * 0.05, 'triangle', f * k, 0.18, 0.55, { lp: 6000 }); });
  });
  D('buy', { gap: 0.15, grp: 'ui', vol: 0.309, pri: 2, wet: 0.2 }, function (t, k) {
    for (var i = 0; i < 4; i++) {
      var tt = t + i * 0.055;
      S.tone(tt, 'square', 1976 * rnd(0.97, 1.03), 0.04, 0.35, { lp: 6000 });
      S.tone(tt + 0.03, 'square', 2637 * rnd(0.97, 1.03), 0.08, 0.3, { lp: 7000 });
    }
    S.tone(t + 0.24, 'triangle', 1047 * k, 0.3, 0.5);
  });
  // 商人的门铃
  D('shop', { gap: 0.4, grp: 'ui', vol: 0.232, pri: 2, wet: 0.3 }, function (t) {
    S.fm(t, 1319, 3.5, 1.4, 0.9, 0.5);
    S.fm(t + 0.16, 988, 3.5, 1.4, 1.1, 0.5);
  });
  D('pause', { gap: 0.15, grp: 'ui', vol: 0.412, pri: 2 }, function (t) {
    S.tone(t, 'sine', 720, 0.14, 0.6, { f1: 360, sw: 0.12 });
    S.nz(t, 0.12, 0.2, { type: 'bp', f: 1800, q: 1, f2: 600, fsw: 0.12 });
  });
  D('resume', { gap: 0.15, grp: 'ui', vol: 0.412, pri: 2 }, function (t) {
    S.tone(t, 'sine', 360, 0.14, 0.6, { f1: 720, sw: 0.12 });
    S.nz(t, 0.12, 0.2, { type: 'bp', f: 600, q: 1, f2: 1800, fsw: 0.12 });
  });

  // 升级（音乐关掉时代替升级插曲）
  D('levelup', { gap: 0.6, grp: 'ui', vol: 0.331, pri: 2, wet: 0.3 }, function (t, k) {
    [523, 659, 784, 1047].forEach(function (f, i) { S.tone(t + i * 0.06, 'triangle', f * k, 0.3, 0.55, { lp: 6000 }); });
    S.fm(t + 0.24, 1568 * k, 3.5, 1.4, 1, 0.3);
    S.fm(t + 0.24, 2093 * k, 3.5, 1.2, 1, 0.2);
  });

  // ---------------- 拾取 ----------------
  // 经验：短促的“叮”，音高由 o.pitch 给（连着捡越来越高）
  D('xp', { gap: 0.045, grp: 'pick', vol: 0.45 }, function (t, k) {
    S.tone(t, 'triangle', 988 * k, 0.07, 0.8, { lp: 7000 });
    S.tone(t, 'sine', 1976 * k, 0.045, 0.22);
  });
  D('coin', { gap: 0.06, grp: 'pick', vol: 0.189, jit: 0.4 }, function (t, k) {
    S.tone(t, 'square', 1976 * k, 0.05, 0.5, { lp: 6000 });
    S.tone(t + 0.042, 'square', 2637 * k, 0.12, 0.45, { lp: 7000 });
  });
  D('heal', { gap: 0.25, grp: 'pick', vol: 0.245, pri: 1, wet: 0.3 }, function (t, k) {
    [523, 659, 784, 1047].forEach(function (f, i) { S.tone(t + i * 0.055, 'sine', f * k, 0.4, 0.5, { a: 0.006 }); });
    S.tone(t, 'triangle', 262 * k, 0.45, 0.28, { a: 0.03 });
    S.nz(t + 0.05, 0.45, 0.06, { type: 'hp', f: 6500, a: 0.12 });
  });
  D('magnet', { gap: 0.5, grp: 'pick', vol: 0.25, pri: 1, wet: 0.25 }, function (t) {
    S.nz(t, 0.6, 0.6, { type: 'bp', f: 350, q: 1.6, f2: 3600, fsw: 0.55, a: 0.4 });
    S.tone(t, 'sine', 300, 0.6, 0.35, { f1: 1200, sw: 0.55, a: 0.4 });
  });
  D('clock', { gap: 0.5, grp: 'pick', vol: 0.282, pri: 1, wet: 0.35 }, function (t) {
    S.click(t, 0.8, 3500); S.click(t + 0.24, 0.8, 2600);
    S.fm(t + 0.3, 1568, 3.5, 2, 1.2, 0.4);
    S.nz(t + 0.25, 0.8, 0.12, { type: 'hp', f: 5000, a: 0.6 });
  });
  D('rage', { gap: 0.5, grp: 'pick', vol: 0.226, pri: 1, wet: 0.2 }, function (t) {
    S.tone(t, 'sawtooth', 90, 0.5, 0.5, { f1: 140, sw: 0.4, lp: 900, vib: 9, vd: 60 });
    I.taiko(t, 0, 0, 0.8); I.taiko(t + 0.18, 0, 0, 0.7);
  });
  D('powerup', { gap: 0.3, grp: 'pick', vol: 0.3, pri: 1, wet: 0.25 }, function (t, k) {
    S.tone(t, 'square', 523 * k, 0.08, 0.4, { lp: 3000 });
    S.tone(t + 0.07, 'square', 784 * k, 0.08, 0.4, { lp: 3500 });
    S.tone(t + 0.14, 'square', 1047 * k, 0.2, 0.4, { lp: 4000 });
  });

  // ---------------- 玩家 ----------------
  D('jump', { gap: 0.08, grp: 'ply', vol: 0.562, jit: 1 }, function (t, k) {
    S.nz(t, 0.13, 0.7, { type: 'bp', f: 480 * k, q: 1.3, f2: 1700 * k, fsw: 0.12, a: 0.015 });
    S.tone(t, 'sine', 250 * k, 0.1, 0.35, { f1: 430 * k, sw: 0.08 });
  });
  D('jump2', { gap: 0.08, grp: 'ply', vol: 0.668, jit: 0.5 }, function (t, k) {
    S.nz(t, 0.15, 0.6, { type: 'bp', f: 800 * k, q: 1.5, f2: 2800 * k, fsw: 0.14, a: 0.015 });
    S.tone(t, 'sine', 520 * k, 0.12, 0.3, { f1: 1040 * k, sw: 0.1 });
    S.tone(t + 0.04, 'sine', 1568 * k, 0.15, 0.12);
  });
  // 落地：o.w 0~1 按冲击大小
  D('land', { gap: 0.1, grp: 'ply', vol: 0.412, jit: 1 }, function (t, k, o) {
    var w = o.w == null ? 0.5 : o.w;
    S.nz(t, 0.07 + w * 0.07, 0.8, { type: 'lp', f: 600 + w * 500, q: 0.7 });
    S.tone(t, 'sine', 115 * k, 0.12, 0.5 + w * 0.3, { f1: 52, sw: 0.1 });
  });
  D('land_heavy', { gap: 0.15, grp: 'ply', vol: 0.406, pri: 1, wet: 0.15 }, function (t, k) {
    S.tone(t, 'sine', 95 * k, 0.32, 1, { f1: 36, sw: 0.25 });
    S.nz(t, 0.22, 0.8, { type: 'lp', f: 1200, q: 0.6, f2: 300, fsw: 0.2, kind: 'brown' });
    for (var i = 0; i < 4; i++) S.nz(t + 0.03 + Math.random() * 0.18, 0.025, 0.2, { type: 'bp', f: rnd(1500, 3500), q: 2 });
  });
  D('slide', { gap: 0.15, grp: 'ply', vol: 0.567, jit: 1.5 }, function (t, k) {
    S.nz(t, 0.24, 0.8, { type: 'bp', f: 1900 * k, q: 0.8, f2: 700 * k, fsw: 0.22, a: 0.012 });
  });
  // 摔伤：骨头“咔”+ 闷响
  D('fall', { gap: 0.3, grp: 'ply', vol: 0.493, pri: 1 }, function (t, k) {
    S.tone(t, 'sine', 90 * k, 0.3, 0.9, { f1: 38, sw: 0.22 });
    S.nz(t, 0.12, 0.8, { type: 'bp', f: 900, q: 0.9 });
    S.nz(t + 0.02, 0.03, 0.6, { type: 'hp', f: 2800 });
    S.nz(t + 0.06, 0.025, 0.5, { type: 'hp', f: 3400 });
  });
  D('hurt', { gap: 0.18, grp: 'ply', vol: 0.681, pri: 1, jit: 1 }, function (t, k) {
    S.tone(t, 'sawtooth', 270 * k, 0.16, 0.45, { f1: 115, sw: 0.14, lp: 1300 });
    S.nz(t, 0.1, 0.65, { type: 'lp', f: 950, q: 0.7 });
    S.tone(t, 'sine', 92, 0.2, 0.75, { f1: 48, sw: 0.16 });
  });
  D('hurt_shield', { gap: 0.18, grp: 'ply', vol: 0.591, pri: 1, jit: 1 }, function (t, k) {
    S.fm(t, 620 * k, 1.41, 3, 0.35, 0.5);
    S.nz(t, 0.08, 0.5, { type: 'hp', f: 3000 });
  });
  D('evade', { gap: 0.15, grp: 'ply', vol: 0.6, jit: 1 }, function (t, k) {
    S.nz(t, 0.16, 0.8, { type: 'bp', f: 2600 * k, q: 1.2, f2: 900 * k, fsw: 0.14, a: 0.02 });
    S.tone(t, 'sine', 1200 * k, 0.12, 0.2, { f1: 1800 * k, sw: 0.1 });
  });
  D('block', { gap: 0.2, grp: 'ply', vol: 0.389, pri: 1, wet: 0.2, jit: 0.6 }, function (t, k) {
    S.fm(t, 440 * k, 2.7, 4, 0.6, 0.6);
    S.fm(t, 880 * k, 1.41, 2, 0.4, 0.25);
    S.tone(t, 'sine', 120, 0.2, 0.6, { f1: 55, sw: 0.15 });
  });
  D('death', { gap: 1, grp: 'big', vol: 0.513, pri: 2, wet: 0.45 }, function (t) {
    S.tone(t, 'sine', 80, 1.2, 1, { f1: 30, sw: 0.9 });
    S.nz(t, 0.9, 0.6, { type: 'lp', f: 1500, q: 0.6, f2: 120, fsw: 0.8, kind: 'brown' });
    S.tone(t + 0.05, 'sawtooth', 330, 1.3, 0.25, { f1: 82, sw: 1.2, lp: 1200 });
  });
  // 心跳：咚-咚（o.w 越大越响）
  D('heartbeat', { gap: 0.3, grp: 'ply', vol: 0.327, pri: 1 }, function (t, k, o) {
    var w = o.w == null ? 0.6 : o.w;
    S.tone(t, 'sine', 62, 0.2, 0.8 * w + 0.2, { f1: 42, sw: 0.12, a: 0.01 });
    S.tone(t, 'triangle', 115, 0.14, 0.35 * w + 0.1, { f1: 70, sw: 0.1, a: 0.008, lp: 700 });
    S.tone(t + 0.19, 'sine', 56, 0.22, 0.55 * w + 0.15, { f1: 38, sw: 0.12, a: 0.01 });
    S.tone(t + 0.19, 'triangle', 100, 0.14, 0.25 * w + 0.08, { f1: 62, sw: 0.1, a: 0.008, lp: 600 });
    S.nz(t, 0.05, 0.12 * w, { type: 'lp', f: 400 });
  });

  // ---------------- 武器（每把武器的参数见 SFX.WEAPON） ----------------
  // 超武：每次出手多一层金色的闪光音（g 音量倍数：配方本身音量大的给小一点）
  var evoLayer = function (t, k, g) {
    g = g || 1;
    S.fm(t + 0.02, 1760 * k, 3.5, 1.2, 0.35, 0.13 * g);
    S.tone(t + 0.03, 'sine', 2637 * k, 0.2, 0.07 * g);
  };
  // 挥砍：带通噪声扫过去 + 低频“呼”；o.ring 金属“铮”，o.dark 低沉，o.clang 锻锤的“当”
  D('w_swing', { gap: 0.06, grp: 'wpn', vol: 0.245, jit: 1.2 }, function (t, k, o) {
    var len = o.len || 0.2, lo = o.lo || 500, hi = o.hi || 2600;
    S.nz(t, len, 0.9, { type: 'bp', f: lo * k, q: 1.5, f2: hi * k, fsw: len * 0.45, a: len * 0.3, kind: 'pink' });
    S.tone(t, 'sine', 150 * k, len, 0.3, { f1: 70, sw: len, a: len * 0.3 });
    if (o.ring) S.fm(t + len * 0.25, 2200 * k, 2.76, 1.2, 0.4, 0.11 * o.ring);
    if (o.dark) S.tone(t, 'sawtooth', 82 * k, len * 1.2, 0.18, { lp: 500, a: len * 0.3 });
    if (o.clang) S.fm(t + len * 0.6, 620 * k, 1.41, 2.5, 0.35, 0.22);
    if (o.evo) evoLayer(t, k);
  });
  // 飞刀扇面：o.light 只有两声高的“唰唰”（没有低频）
  D('w_shotgun', { gap: 0.1, grp: 'wpn', vol: 0.556, jit: 0.8 }, function (t, k, o) {
    if (o.light) {
      S.nz(t, 0.06, 0.6, { type: 'hp', f: 3500 * k, q: 0.8, a: 0.006 });
      S.nz(t + 0.05, 0.06, 0.5, { type: 'hp', f: 4200 * k, q: 0.8, a: 0.006 });
    } else {
      [0.94, 1, 1.07, 1.13].forEach(function (m) { S.tone(t, 'triangle', 300 * k * m, 0.09, 0.4, { f1: 210 * k * m, sw: 0.08, lp: 2200 }); });
      S.nz(t, 0.09, 0.7, { type: 'bp', f: 1600, q: 0.8 });
      S.tone(t, 'sine', 120, 0.12, 0.5, { f1: 60, sw: 0.1 });
    }
    if (o.evo) evoLayer(t, k);
  });
  // 沉的“咚”+ 清脆的“啪”+ 一点金属回响（标枪扎地）
  D('w_heavy', { gap: 0.12, grp: 'wpn', vol: 0.367, jit: 0.6, wet: 0.12 }, function (t, k, o) {
    S.tone(t, 'sine', 140 * k, 0.26, 0.9, { f1: 44, sw: 0.2 });
    S.nz(t, 0.08, 0.7, { type: 'hp', f: 2400, q: 0.7 });
    S.fm(t + 0.01, 880 * k, 1.41, 1.6, 0.3, 0.12);
    if (o.evo) { evoLayer(t, k); S.nz(t + 0.03, 0.4, 0.25, { type: 'lp', f: 1200, kind: 'brown' }); }
  });
  // 扔出去的东西：o.kind clack 木头“嗒嗒” / whirr 旋转 / rise 往上扬 / flap 扑翅膀 / boop 球 / sling 皮筋 / whistle 呼啸 / clang 锅“铛”
  // o.heavy 加一声闷的（投石），o.cry 鹰叫，o.wood 木头低一点（棋子）
  // [带通起点, 终点, q, 颤动 Hz, 音量]
  var TH = { whirr: [900, 1100, 1.6, 16, 0.56], rise: [700, 1800, 1.6, 16, 0.65], flap: [1200, 0, 1, 14, 0.72] };
  D('w_throw', { gap: 0.08, grp: 'wpn', vol: 0.7, jit: 1.5 }, function (t, k, o) {
    var kind = o.kind || 'whirr', len;
    if (kind === 'clack') {
      // 木头棋子的「嗒」以前太轻（最响 50 毫秒 0.015），抬到 0.04 上下
      var kw = o.wood ? 0.7 : 1, ka = o.heavy ? 0.85 : o.wood ? 1.9 : 1;
      S.nz(t, 0.03, 0.8 * ka, { type: 'bp', f: 1250 * k * kw, q: 4 });
      S.nz(t + 0.04, 0.03, 0.6 * ka, { type: 'bp', f: 1900 * k * kw, q: 4 });
      S.nz(t, 0.16, 0.3 * ka, { type: 'bp', f: 700 * kw, q: 1, f2: 1800 * kw, fsw: 0.14 });
    } else if (kind === 'boop') {
      S.tone(t, 'sine', 520 * k, 0.08, 0.34, { f1: 300 * k, sw: 0.08 });
    } else if (kind === 'sling') {
      S.tone(t, 'triangle', 180 * k, 0.08, 0.34, { f1: 90 * k, sw: 0.08 });
      S.nz(t, 0.02, 0.26, { type: 'hp', f: 3200, q: 0.7 });
    } else if (kind === 'whistle') {
      S.tone(t, 'sine', 900 * k, 0.5, 0.06, { f1: 2600 * k, sw: 0.5, a: 0.03 });
      S.tone(t, 'sine', 120 * k, 0.08, 0.12, { f1: 60, sw: 0.07 });
    } else if (kind === 'clang') {
      S.fm(t, 880 * k, 2.76, 2, 0.25, 0.35);
    } else {
      var th = TH[kind] || TH.whirr;
      len = o.len || 0.3;
      var s = S.noise(t, t + len + 0.03, kind === 'flap' ? 'pink' : null), fl = S.filt(t, 'bandpass', th[0] * k, th[2], th[1] ? th[1] * k : 0, len);
      var am = S.gain(0.5), lfo = S.osc(t, 'sine', o.rate || th[3], t + len + 0.03), lg = S.gain(0.5);
      lfo.connect(lg); lg.connect(am.gain);
      var g = S.env(t, th[4], len * 0.3, len);
      s.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
    }
    if (o.heavy) S.tone(t, 'sine', 110 * k, 0.18, 0.09, { f1: 60, sw: 0.15 });
    if (o.cry) S.tone(t + 0.2, 'sine', 2200 * k, 0.12, 0.07, { f1: 1600 * k, sw: 0.12, vib: 30, vd: 40 });
    if (o.evo) evoLayer(t, k);
  });
  // 短促的“咻”；o.buzz 蜜蜂的“嗡”（代替高频的嘶声）
  D('w_dagger', { gap: 0.06, grp: 'wpn', vol: 0.706, jit: 1.5 }, function (t, k, o) {
    if (o.buzz) {
      var os = S.osc(t, 'sawtooth', 180 * k, t + 0.21), fl = S.filt(t, 'bandpass', 900, 1.2);
      var am = S.gain(0.5), lfo = S.osc(t, 'sine', 30, t + 0.21), lg = S.gain(0.5);
      lfo.connect(lg); lg.connect(am.gain);
      var g = S.env(t, 0.15, 0.02, 0.18, 0.06);
      os.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
    } else S.nz(t, 0.07, 0.7, { type: 'hp', f: 3000 * k, q: 0.8, a: 0.008 });
    S.tone(t, 'sine', 1500 * k, 0.06, 0.25, { f1: 2600 * k, sw: 0.05 });
    if (o.evo) evoLayer(t, k);
  });
  // 雷霆：嗡的电流 + 噼啪；o.fall 星星从天上掉下来的“咻——”（没有电流声），o.drum 加一声鼓
  D('w_zap', { gap: 0.08, grp: 'wpn', vol: 0.823, jit: 1, wet: 0.1 }, function (t, k, o) {
    if (o.fall) {
      S.tone(t, 'sine', 2400 * k, 0.35, 0.053, { f1: 600 * k, sw: 0.35, a: 0.02, hold: 0.12 });
      S.nz(t, 0.3, 0.05, { type: 'hp', f: 5000, a: 0.05 });
    } else {
      var car = S.osc(t, 'sawtooth', 900 * k, t + 0.22, { f1: 130 * k, sw: 0.18 }), mod = S.osc(t, 'square', 63, t + 0.22), mg = S.gain(500);
      mod.connect(mg); mg.connect(car.frequency);
      var ca = o.drum ? 0.5 : 1, fl = S.filt(t, 'bandpass', 1800, 0.7), g = S.env(t, 0.55 * ca, 0.003, 0.2);
      car.connect(fl); fl.connect(g); g.connect(S.out());
      S.nz(t + Math.random() * 0.06, 0.02, 0.5 * ca, { type: 'hp', f: 4000 });
      S.nz(t + 0.07 + Math.random() * 0.08, 0.02, 0.45 * ca, { type: 'hp', f: 4400 });
    }
    if (o.drum) S.tone(t, 'sine', 90 * k, 0.25, 0.08, { f1: 60, sw: 0.2 });
    if (o.evo) evoLayer(t, k, 0.4);
  });
  // 扔出去 + 0.25 秒后落地：默认玻璃碎掉 + 冒泡；o.splat 颜料桶“啪嗒”+ 几滴
  D('w_bottle', { gap: 0.1, grp: 'wpn', vol: 0.223, jit: 1 }, function (t, k, o) {
    S.nz(t, 0.1, 0.3, { type: 'bp', f: 1200, q: 1, f2: 2400, fsw: 0.1 });
    var b = t + 0.25, i;
    if (o.splat) {
      S.nz(b, 0.12, 0.55, { type: 'lp', f: 600, q: 0.7, kind: 'brown' });
      S.tone(b, 'sine', 160 * k, 0.08, 0.3, { f1: 80, sw: 0.07 });
      for (i = 0; i < 3; i++) S.tone(b + 0.1 + i * 0.07 + Math.random() * 0.02, 'sine', rnd(900, 1400) * k, 0.04, 0.3, { f1: rnd(1500, 2000), sw: 0.03 });
    } else {
      S.nz(b, 0.12, 0.8, { type: 'bp', f: 5200, q: 1.2 });
      for (i = 0; i < 4; i++) S.tone(b + Math.random() * 0.06, 'sine', rnd(2600, 5200), 0.07, 0.25);
      for (i = 0; i < 3; i++) S.tone(b + 0.08 + i * 0.07, 'sine', rnd(400, 700) * k, 0.06, 0.3, { f1: rnd(800, 1100), sw: 0.05 });
    }
    if (o.evo) evoLayer(b, k);
  });
  // 放下去 / 炸开的闷响；o.puff 墓烛的“呼”，o.set 铁夹放下的两声金属，o.snap 铁夹合上的“咔嚓”（这三个代替高频的嘶声）
  D('w_mine', { gap: 0.12, grp: 'wpn', vol: 0.4, jit: 1 }, function (t, k, o) {
    S.tone(t, 'sine', 170 * k, 0.12, o.set || o.snap ? 0.4 : 0.7, { f1: 90, sw: 0.1 });
    S.nz(t, 0.06, 0.5, { type: 'lp', f: 900 });
    if (o.puff) S.nz(t + 0.03, 0.25, 0.35, { type: 'lp', f: 800, q: 0.7, a: 0.04, kind: 'brown' });
    else if (o.set) { S.nz(t + 0.05, 0.015, 0.5, { type: 'bp', f: 3000, q: 6 }); S.nz(t + 0.12, 0.015, 0.45, { type: 'bp', f: 3000, q: 6 }); }
    else if (o.snap) { S.click(t, 0.6, 2800); S.click(t + 0.02, 0.6, 2600); S.fm(t + 0.02, 1100 * k, 1.41, 2, 0.12, 0.3); }
    else S.nz(t + 0.06, 0.28, 0.18, { type: 'hp', f: 5500, a: 0.02 });
    if (o.evo) evoLayer(t, k);
  });
  // 足迹：沙沙一下；o.leaf 荆棘的叶子响（25 Hz 颤动的带通噪声）
  D('w_trail', { gap: 0.7, grp: 'wpn', vol: 0.375, jit: 1 }, function (t, k, o) {
    if (o.leaf) {
      var s = S.noise(t, t + 0.28, 'pink'), fl = S.filt(t, 'bandpass', 2500 * k, 1.2);
      var am = S.gain(0.5), lfo = S.osc(t, 'sine', 25, t + 0.28), lg = S.gain(0.5);
      lfo.connect(lg); lg.connect(am.gain);
      var g = S.env(t, 0.6, 0.04, 0.25, 0.05);
      s.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
      return;
    }
    S.nz(t, 0.2, 0.6, { type: 'bp', f: 1100 * k, q: 0.8, a: 0.03, kind: 'pink' });
    S.nz(t + 0.05, 0.015, 0.4, { type: 'hp', f: 3500 });
  });
  // 光环（圣咏）：每次跳伤轻轻“嗡”一下；o.choir 加一点合唱
  D('w_aura', { gap: 0.5, grp: 'wpn', vol: 0.07, jit: 0.3, wet: 0.2 }, function (t, k, o) {
    S.tone(t, 'sine', 220 * k, 0.4, o.choir ? 0.45 : 0.6, { a: 0.05 });
    S.tone(t, 'sine', 330 * k, 0.35, o.choir ? 0.25 : 0.35, { a: 0.05 });
    if (o.choir) I.choir(t, 523 * k, 0.3, 0.12, { a: 0.1, rel: 0.3 });
    if (o.evo) S.tone(t, 'sine', 880 * k, 0.4, 0.15, { a: 0.05 });
  });
  // 冰：几声高的“叮”；o.short 冰锥只有一声短的
  D('w_frost', { gap: 0.8, grp: 'wpn', vol: 0.16, jit: 0.5, wet: 0.25 }, function (t, k, o) {
    if (o.short) S.fm(t, 3200 * k, 3.5, 1, 0.12, 1.4);
    else {
      for (var i = 0; i < 3; i++) S.fm(t + i * 0.05, rnd(2200, 3600) * k, 3.5, 1, 0.25, 0.3);
      S.nz(t, 0.12, 0.3, { type: 'hp', f: 6000 });
    }
    if (o.evo) evoLayer(t, k);
  });
  // 环绕武器转一圈：“呼”；o.snare 锡兵的小军鼓，o.wind 风筝的风声
  D('w_orbit', { gap: 0.9, grp: 'wpn', vol: 0.48, jit: 1 }, function (t, k, o) {
    S.nz(t, 0.3, o.snare ? 0.4 : o.wind ? 0.42 : 0.8, { type: 'bp', f: 380 * k, q: 1.4, f2: 900 * k, fsw: 0.15, a: 0.1, kind: 'pink' });
    if (o.snare) for (var i = 0; i < 3; i++) I.snare(t + i * 0.07, 0, 0, 0.1);
    if (o.wind) S.nz(t, 0.5, 0.08, { type: 'lp', f: 700, q: 0.7, a: 0.15, kind: 'pink' });
  });

  // ---------------- 第 4 块的新配方 ----------------
  // 铜钟：一声敲击 + FM 钟声 + 低的嗡；后面几圈（emit 'ring'）用 o.soft（轻一点、高一点，见 SFX.EMIT）
  D('w_bell', { gap: 0.25, grp: 'wpn', vol: 0.082, jit: 0.4, wet: 0.3 }, function (t, k, o) {
    S.nz(t, 0.02, 0.5, { type: 'bp', f: 2400 });
    I.bell(t, 392 * k, 0.9, 0.7, { ratio: 2.76, idx: 2.6, dec: 1.2 });
    S.tone(t, 'sine', 196 * k, 1.0, 0.25);
    S.tone(t, 'sine', 588 * k, 0.6, 0.12);
    if (o.evo) evoLayer(t, k, 0.5);
  });
  // 钓竿：甩出去的“嗖”+ 收线的咔咔声；o.land 鱼上岸：“啪”的水声 + 几滴水
  D('w_reel', { gap: 0.3, grp: 'wpn', vol: 1.2, jit: 1 }, function (t, k, o) {
    if (o.land) {
      S.nz(t, 0.18, 0.32, { type: 'lp', f: 1400, kind: 'brown' });
      S.tone(t, 'sine', 180 * k, 0.12, 0.2, { f1: 90, sw: 0.1 });
      for (var j = 0; j < 4; j++) S.tone(t + 0.05 + j * 0.05 + Math.random() * 0.02, 'sine', rnd(900, 1600), 0.05, 0.08, { f1: rnd(1700, 2200), sw: 0.04 });
    } else {
      S.nz(t, 0.16, 2.3, { type: 'bp', f: 900 * k, f2: 2600 * k, fsw: 0.14, kind: 'pink' });
      for (var i = 0; i < 5; i++) S.nz(t + 0.12 + i * 0.045, 0.012, 0.6, { type: 'bp', f: 3200, q: 6 });
    }
    if (o.evo) evoLayer(t, k, 0.15);
  });
  // 熊吼：两条带颤音的锯齿波往下压 + 喘气的噪声
  D('w_roar', { gap: 0.5, grp: 'wpn', vol: 0.31, jit: 0.8, wet: 0.1 }, function (t, k, o) {
    S.tone(t, 'sawtooth', 95 * k, 0.42, 0.6, { f1: 70 * k, sw: 0.38, lp: 700, vib: 22, vd: 9 });
    S.tone(t, 'sawtooth', 142 * k, 0.36, 0.25, { lp: 900, vib: 19, vd: 7 });
    S.nz(t, 0.38, 0.45, { type: 'bp', f: 600, q: 0.9, f2: 350, fsw: 0.34, kind: 'pink' });
    if (o.evo) evoLayer(t, k, 0.6);
  });
  // 提灯光束：暖的嗡声 + 一点气声，o.dur 秒（= 光束亮着的时间，最长 2.5 秒）；长度不固定，不进缓存
  // （嗡声先保持 0.65 × dur 再衰减，听得到的长度 ≈ 光束亮着的时间）
  D('w_beam', { gap: 0.3, grp: 'wpn', vol: 0.073, jit: 0.3, wet: 0.2 }, function (t, k, o) {
    var dur = Math.min(2.5, o.dur || 1.6);
    S.tone(t, 'sine', 330 * k, dur, 0.5, { a: 0.08, hold: dur * 0.65, vib: 5, vd: 6 });
    S.tone(t, 'triangle', 495 * k, dur, 0.18, { a: 0.1, hold: dur * 0.65, lp: 2400 });
    S.nz(t, dur, 0.12, { type: 'bp', f: 2000, q: 0.8, a: 0.1, hold: dur * 0.6, kind: 'pink' });
    if (o.evo) evoLayer(t, k);
  });
  // 鞭炮：扔出去，0.25 秒后噼里啪啦九响
  D('w_crackle', { gap: 0.3, grp: 'wpn', vol: 0.33, jit: 1 }, function (t, k, o) {
    S.nz(t, 0.08, 0.3, { type: 'bp', f: 1200 });
    var tt = t + 0.25;
    for (var i = 0; i < 9; i++) {
      S.nz(tt, 0.018, rnd(0.5, 0.9), { type: 'bp', f: rnd(1800, 3600) * k, q: 1.2 });
      S.tone(tt, 'sine', rnd(150, 240) * k, 0.03, 0.3, { f1: 80, sw: 0.03 });
      tt += rnd(0.03, 0.11);
    }
    if (o.evo) evoLayer(t, k);
  });

  // ---------------- 战斗 ----------------
  // 命中（很轻，限流）：o.s 体型（越大越闷）
  D('hit', { gap: 0.04, grp: 'hit', vol: 0.562, jit: 2 }, function (t, k, o) {
    var s = o.s || 1;
    S.nz(t, 0.05, 0.7, { type: 'lp', f: 1900 * k / s, q: 0.8 });
    S.tone(t, 'sine', 220 * k / s, 0.07, 0.55, { f1: 90 / s, sw: 0.06 });
  });
  D('crit', { gap: 0.07, grp: 'hit', vol: 0.64, jit: 1.5 }, function (t, k) {
    S.nz(t, 0.05, 0.6, { type: 'hp', f: 2600, q: 0.7 });
    S.tone(t, 'square', 1700 * k, 0.07, 0.3, { f1: 1150 * k, sw: 0.06, lp: 5000 });
    S.tone(t, 'sine', 160 * k, 0.09, 0.55, { f1: 70, sw: 0.08 });
  });
  // 打死：o.s 体型 0.6~2（小怪清脆，大怪低沉）
  D('kill', { gap: 0.03, grp: 'kill', vol: 0.715, jit: 2 }, function (t, k, o) {
    var s = o.s || 1, f = 520 / s;
    S.tone(t, 'square', f * k, 0.09, 0.4, { f1: f * 0.4 * k, sw: 0.08, lp: 2400 });
    S.nz(t, 0.08 + 0.05 * s, 0.6, { type: 'bp', f: 1500 / s, q: 0.9 });
  });
  D('kill_big', { gap: 0.15, grp: 'big', vol: 0.438, pri: 1, wet: 0.28, jit: 0.5 }, function (t, k, o) {
    S.tone(t, 'sine', 110 * k, 0.5, 0.9, { f1: 36, sw: 0.4 });
    S.nz(t, 0.45, 0.7, { type: 'lp', f: 2600, q: 0.6, f2: 200, fsw: 0.4, kind: 'brown' });
    S.nz(t, 0.1, 0.5, { type: 'bp', f: 1300, q: 0.8 });
    S.fm(t + 0.08, 1047 * k, 3.5, 1.5, 0.8, o.mini ? 0.35 : 0.22);
    if (o.mini) S.fm(t + 0.16, 1568 * k, 3.5, 1.5, 0.9, 0.25);
  });
  // 爆炸：o.r 半径（越大越低越长）
  D('boom', { gap: 0.06, grp: 'boom', vol: 0.413, wet: 0.2, jit: 1 }, function (t, k, o) {
    var r = Math.max(0.5, Math.min(2.2, (o.r || 3) / 3)), dur = 0.4 + r * 0.32;
    S.tone(t, 'sine', 125 * k / Math.sqrt(r), dur * 0.75, 0.95, { f1: 32, sw: dur * 0.5 });
    S.nz(t, dur, 0.85, { type: 'lp', f: 3200 * k, q: 0.6, f2: 180, fsw: dur * 0.8, kind: 'brown' });
    S.nz(t, 0.12, 0.45, { type: 'bp', f: 1300, q: 0.7 });
    S.nz(t + 0.05 + Math.random() * 0.2 * r, 0.03, 0.22, { type: 'hp', f: 3000 });
  });
  D('zap_hit', { gap: 0.08, grp: 'hit', vol: 0.769, jit: 2 }, function (t, k) {
    S.nz(t, 0.06, 0.7, { type: 'hp', f: 3500 });
    S.tone(t, 'square', 1200 * k, 0.05, 0.25, { f1: 400 * k, sw: 0.05, lp: 4000 });
  });
  D('enemy_shot', { gap: 0.12, grp: 'enemy', vol: 0.412, jit: 2 }, function (t, k) {
    S.tone(t, 'square', 620 * k, 0.12, 0.45, { f1: 300 * k, sw: 0.1, lp: 1800 });
  });
  // 精英出现：低沉的不和谐钟声 + 涌起来的风
  D('elite', { gap: 1.2, grp: 'big', vol: 0.289, pri: 1, wet: 0.35 }, function (t) {
    S.fm(t, 196, 1.41, 3, 1.4, 0.5);
    S.fm(t + 0.02, 233, 1.41, 3, 1.4, 0.35);
    S.nz(t, 0.8, 0.35, { type: 'bp', f: 300, q: 1.2, f2: 1200, fsw: 0.6, a: 0.4, kind: 'pink' });
  });
  // 小 Boss：号角 + 大鼓
  D('mini', { gap: 1.5, grp: 'big', vol: 0.403, pri: 2, wet: 0.35 }, function (t) {
    [110, 165, 220].forEach(function (f) { I.brass(t, f, 0.9, 0.4, { br: 5, a: 0.06, rel: 0.4 }); });
    I.brass(t + 0.95, 98, 0.7, 0.35, { br: 4, a: 0.05, rel: 0.4 });
    I.taiko(t, 0, 0, 0.9); I.taiko(t + 0.95, 0, 0, 0.8);
  });
  // Boss 吼叫：几条走调的锯齿波往下滑 + 粗糙的噪声
  D('boss_roar', { gap: 2, grp: 'big', vol: 0.604, pri: 2, wet: 0.4 }, function (t, k) {
    [[110, 62], [114, 58], [148, 74]].forEach(function (p) {
      var os = S.osc(t, 'sawtooth', p[0] * k, t + 1.7, { f1: p[1] * k, sw: 1.4 });
      S.vib(t, t + 1.7, 7.5, 45, 0.05, [os]);
      var fl = S.filt(t, 'lowpass', 1100, 1.2, 380, 1.3), g = S.env(t, 0.38, 0.1, 1.6, 0.5);
      os.connect(fl); fl.connect(g); g.connect(S.out());
    });
    S.nz(t, 1.5, 0.6, { type: 'lp', f: 700, q: 0.8, a: 0.08, hold: 0.5, kind: 'brown' });
  });
  // 战鼓：o.n 下，越来越快
  D('war_drums', { gap: 1, grp: 'big', vol: 0.38, pri: 2, wet: 0.3 }, function (t, k, o) {
    var at = [0, 0.34, 0.6, 0.78, 0.9, 1.0], n = Math.min(at.length, o.n || 4);
    for (var i = 0; i < n; i++) I.taiko(t + at[i], 0, 0, i === n - 1 ? 1 : 0.65 + i * 0.08);
  });
  D('boss_die', { gap: 2, grp: 'big', vol: 0.693, pri: 2, wet: 0.45 }, function (t, k) {
    S.tone(t, 'sine', 90, 1.6, 1, { f1: 26, sw: 1.2 });
    S.nz(t, 1.6, 0.9, { type: 'lp', f: 3000, q: 0.5, f2: 120, fsw: 1.4, kind: 'brown' });
    S.nz(t, 0.2, 0.6, { type: 'bp', f: 1200, q: 0.7 });
    var os = S.osc(t, 'sawtooth', 160 * k, t + 1.6, { f1: 45, sw: 1.4 }), fl = S.filt(t, 'lowpass', 900, 1, 200, 1.4), g = S.env(t, 0.3, 0.05, 1.5);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    I.toll(t + 0.4, 98, 0, 0.45);
  });
  D('slam_warn', { gap: 0.5, grp: 'enemy', vol: 0.292, pri: 1 }, function (t, k, o) {
    var d = o.dur || 1;
    S.nz(t, d, 0.8, { type: 'lp', f: 200, q: 1.5, f2: 700, fsw: d, a: d * 0.8, kind: 'brown' });
    S.tone(t, 'sawtooth', 55, d, 0.25, { f1: 82, sw: d, lp: 400, a: d * 0.8 });
  });
  D('charge', { gap: 0.6, grp: 'enemy', vol: 0.412, pri: 1, wet: 0.15 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 150 * k, t + 0.6, { f1: 90 * k, sw: 0.5 }), fl = S.filt(t, 'lowpass', 900, 1.5), g = S.env(t, 0.4, 0.05, 0.55);
    S.vib(t, t + 0.6, 8, 40, 0.02, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.nz(t + 0.75, 0.5, 0.8, { type: 'bp', f: 400, q: 1, f2: 1600, fsw: 0.3, a: 0.05, kind: 'pink' });
  });
  D('cast', { gap: 0.5, grp: 'enemy', vol: 0.148, pri: 1, wet: 0.35 }, function (t, k, o) {
    var d = o.dur || 0.6;
    S.tone(t, 'sine', 330 * k, d, 0.6, { f1: 990 * k, sw: d, a: d * 0.7, vib: 12, vd: 40 });
    S.nz(t, d, 0.25, { type: 'hp', f: 4000, a: d * 0.7 });
  });
  D('volley', { gap: 0.3, grp: 'enemy', vol: 0.316, jit: 1 }, function (t, k) {
    for (var i = 0; i < 4; i++) S.tone(t + i * 0.03, 'square', (700 - i * 60) * k, 0.12, 0.35, { f1: 280 * k, sw: 0.1, lp: 2000 });
  });
  D('spike', { gap: 0.05, grp: 'enemy', vol: 0.8, jit: 2 }, function (t, k) {
    S.nz(t, 0.12, 0.8, { type: 'bp', f: 420 * k, q: 0.9 });
    S.click(t, 0.5, 2200);
    S.tone(t, 'sine', 140 * k, 0.1, 0.5, { f1: 70, sw: 0.08 });
  });
  // Boss 旋转激光：嗡嗡的电流声。循环音：激光真正射出来时开，停火 / 暂停 / 弹窗 / 阵亡 / 换关时关（audio_hooks.js 的 H.laserTick）
  // （不按固定秒数排：暂停、弹窗、顿帧都会让激光比 4.5 秒的声音更久）
  D('laser', { gap: 0.2, grp: 'enemy', vol: 0.27, pri: 1, loop: true }, function (t, k) {
    var end = t + 3600;
    var a = S.osc(t, 'sawtooth', 110 * k, end), b = S.osc(t, 'sawtooth', 221 * k, end), fl = S.filt(t, 'bandpass', 900, 1.2);
    var am = S.gain(0.6), lfo = S.osc(t, 'sine', 18, end), lg = S.gain(0.4);
    lfo.connect(lg); lg.connect(am.gain);
    var g = S.gain(0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.5, t + 0.12);
    a.connect(fl); b.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
  });
  D('laser_warn', { gap: 0.5, grp: 'enemy', vol: 0.188, pri: 1 }, function (t, k, o) {
    var d = o.dur || 0.8;
    S.tone(t, 'sawtooth', 300 * k, d, 0.5, { f1: 1200 * k, sw: d, a: d * 0.8, lp: 2500 });
  });
  D('summon', { gap: 0.8, grp: 'enemy', vol: 0.446, pri: 1, wet: 0.4 }, function (t) {
    [98, 104, 147].forEach(function (f) { I.choir(t, f * 2, 0.8, 0.25, { a: 0.15, rel: 0.5 }); });
    S.nz(t + 0.6, 0.6, 0.6, { type: 'lp', f: 900, q: 0.6, f2: 150, fsw: 0.5, kind: 'brown' });
  });
  // 敌潮：战鼓 + 低沉的号角
  D('surge', { gap: 3, grp: 'big', vol: 0.289, pri: 2, wet: 0.3 }, function (t) {
    var at = [0, 0.3, 0.55, 0.72, 0.84];
    for (var i = 0; i < at.length; i++) I.taiko(t + at[i], 0, 0, 0.6 + i * 0.1);
    I.brass(t + 0.84, 98, 1.1, 0.4, { br: 3.5, a: 0.12, rel: 0.5 });
    I.brass(t + 0.84, 147, 1.1, 0.3, { br: 3.5, a: 0.12, rel: 0.5 });
  });
  // 午夜钟声：古城的大钟敲十二下（压进 3 秒，越敲越急），最后一下低八度、余音长，垫一声大鼓
  D('swarm', { gap: 3, grp: 'big', vol: 0.39, pri: 2, wet: 0.45 }, function (t) {
    var at = 0;
    for (var i = 0; i < 12; i++) {
      if (i < 11) {
        S.fm(t + at, 147, 1.41, 2.6, 0.7, 0.42 + i * 0.02, { idx1: 0.3 });
        S.tone(t + at, 'sine', 297, 0.35, 0.08);
        at += 0.27 - i * 0.008;
      } else {
        S.fm(t + at, 147, 1.41, 3.2, 3.2, 0.75, { idx1: 0.3 });
        S.tone(t + at, 'sine', 73.5, 2.4, 0.5, { a: 0.01 });
        I.taiko(t + at, 0, 0, 0.9);
      }
    }
  });
  D('portal_open', { gap: 1, grp: 'big', vol: 0.315, pri: 1, wet: 0.5 }, function (t, k) {
    [392, 494, 587, 784, 988].forEach(function (f, i) { S.fm(t + i * 0.07, f * k, 3.5, 1.2, 1, 0.35); });
    S.nz(t, 1, 0.25, { type: 'bp', f: 600, q: 1.5, f2: 4000, fsw: 0.9, a: 0.5 });
    S.tone(t, 'sine', 196 * k, 1.1, 0.4, { a: 0.3 });
  });
  D('portal_found', { gap: 2, grp: 'big', vol: 0.231, pri: 1, wet: 0.5 }, function (t) {
    S.fm(t, 147, 1.41, 3, 2, 0.6);
    S.fm(t + 0.3, 139, 1.41, 3, 2, 0.45);
    S.nz(t, 1.2, 0.2, { type: 'bp', f: 250, q: 2, a: 0.5, kind: 'pink' });
  });
  D('teleport', { gap: 0.5, grp: 'big', vol: 0.296, pri: 1, wet: 0.4 }, function (t, k) {
    S.nz(t, 0.5, 0.8, { type: 'bp', f: 300, q: 2, f2: 5000, fsw: 0.45, a: 0.3, kind: 'pink' });
    S.tone(t, 'sine', 220 * k, 0.5, 0.4, { f1: 1760 * k, sw: 0.45, a: 0.3 });
    S.fm(t + 0.42, 1568 * k, 3.5, 1.2, 0.7, 0.3);
  });
  D('complete', { gap: 0.6, grp: 'big', vol: 0.402, pri: 1, wet: 0.3 }, function (t, k) {
    [523, 659, 784, 1047, 1319].forEach(function (f, i) { S.tone(t + i * 0.06, 'triangle', f * k, 0.35, 0.45, { lp: 6000 }); });
    S.fm(t + 0.3, 2093 * k, 3.5, 1.2, 0.9, 0.2);
  });

  // ---------------- 地图上的东西 ----------------
  // 宝箱：木头吱呀 + 搭扣“咔哒”
  D('chest', { gap: 0.3, grp: 'use', vol: 0.335, pri: 1 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 130 * k, t + 0.36, { f1: 180 * k, sw: 0.3 }), fl = S.filt(t, 'bandpass', 900, 3), g = S.env(t, 0.35, 0.06, 0.32);
    S.vib(t, t + 0.36, 23, 80, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.click(t + 0.32, 0.8, 1800);
    S.tone(t + 0.34, 'sine', 140, 0.12, 0.6, { f1: 70, sw: 0.1 });
  });
  // 开出物品：越稀有音越多（o.rarity 0~4）
  D('reveal', { gap: 0.3, grp: 'use', vol: 0.41, pri: 2, wet: 0.4 }, function (t, k, o) {
    var r = o.rarity || 0, notes = [523, 659, 784, 1047, 1319, 1568, 2093], n = [2, 3, 3, 4, 7][r] || 3;
    for (var i = 0; i < n; i++) S.tone(t + i * 0.06, 'triangle', notes[i] * k, 0.4, 0.4, { lp: 7000 });
    S.nz(t, 0.5 + r * 0.15, 0.05 + r * 0.03, { type: 'hp', f: 7000, a: 0.1 });
    if (r >= 3) S.fm(t + n * 0.06, 1047 * k, 3.5, 1.6, 1.4, 0.3);
    if (r >= 4) { I.choir(t + 0.1, 523, 1.2, 0.18, { a: 0.2, rel: 0.6 }); I.choir(t + 0.1, 659, 1.2, 0.14, { a: 0.2, rel: 0.6 }); I.choir(t + 0.1, 784, 1.2, 0.14, { a: 0.2, rel: 0.6 }); }
  });
  // 站圈充能：一格一格往上走（o.pitch 给音高）
  D('charge_tick', { gap: 0.12, grp: 'use', vol: 0.271, wet: 0.3 }, function (t, k) {
    S.tone(t, 'sine', 523 * k, 0.16, 0.7, { a: 0.01 });
    S.tone(t, 'triangle', 1047 * k, 0.08, 0.2);
  });
  D('pot', { gap: 0.06, grp: 'use', vol: 0.933, jit: 2 }, function (t, k) {
    S.nz(t, 0.1, 0.8, { type: 'bp', f: 900 * k, q: 1.2 });
    for (var i = 0; i < 3; i++) S.nz(t + 0.02 + Math.random() * 0.09, 0.02, 0.4, { type: 'bp', f: rnd(1800, 3200), q: 3 });
    S.tone(t, 'sine', 160 * k, 0.08, 0.4, { f1: 90, sw: 0.07 });
  });
  // 铁砧：o.n 下“铛”
  D('anvil', { gap: 0.2, grp: 'use', vol: 0.312, pri: 1, wet: 0.25 }, function (t, k, o) {
    var n = o.n || 2;
    for (var i = 0; i < n; i++) {
      var tt = t + i * 0.22;
      S.fm(tt, 830 * k, 2.76, 4, 0.8, 0.6);
      S.fm(tt, 1660 * k, 1.41, 2, 0.5, 0.2);
      S.nz(tt, 0.04, 0.5, { type: 'hp', f: 3000 });
    }
    S.nz(t + n * 0.22 - 0.1, 0.4, 0.06, { type: 'hp', f: 6000 });
  });
  D('wish', { gap: 0.3, grp: 'use', vol: 0.576, pri: 1, wet: 0.35 }, function (t) {
    S.fm(t, 2637, 3.5, 1, 0.3, 0.4);
    S.nz(t + 0.55, 0.3, 0.6, { type: 'lp', f: 1500, q: 1, f2: 400, fsw: 0.3, kind: 'pink' });
    for (var i = 0; i < 4; i++) S.tone(t + 0.6 + i * 0.06, 'sine', rnd(500, 900), 0.06, 0.25, { f1: rnd(900, 1300), sw: 0.05 });
  });
  D('wish_good', { gap: 0.5, grp: 'use', vol: 0.296, pri: 1, wet: 0.45 }, function (t, k) {
    [784, 988, 1175, 1568].forEach(function (f, i) { S.fm(t + i * 0.07, f * k, 3.5, 1.2, 1.1, 0.3); });
  });
  D('wish_bad', { gap: 0.5, grp: 'use', vol: 0.295, pri: 1, wet: 0.4 }, function (t) {
    [92, 98].forEach(function (f) { S.tone(t, 'sawtooth', f, 0.9, 0.3, { lp: 500, a: 0.05, vib: 6, vd: 40 }); });
    I.taiko(t, 0, 0, 0.7);
  });
  D('fire_up', { gap: 0.5, grp: 'use', vol: 0.362, pri: 1, wet: 0.3 }, function (t) {
    S.nz(t, 0.6, 0.7, { type: 'lp', f: 400, q: 0.8, f2: 2200, fsw: 0.4, a: 0.1, kind: 'pink' });
    for (var i = 0; i < 6; i++) S.nz(t + 0.1 + Math.random() * 0.5, 0.015, 0.3, { type: 'hp', f: 3200 });
    [392, 494, 587].forEach(function (f, i) { S.tone(t + 0.15 + i * 0.05, 'sine', f, 0.6, 0.25, { a: 0.02 }); });
  });
  D('ballista', { gap: 0.5, grp: 'use', vol: 0.306, pri: 1 }, function (t) {
    var os = S.osc(t, 'sawtooth', 95, t + 0.45, { f1: 140, sw: 0.4 }), fl = S.filt(t, 'bandpass', 700, 3), g = S.env(t, 0.35, 0.05, 0.42);
    S.vib(t, t + 0.45, 19, 70, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.tone(t + 0.45, 'sine', 160, 0.15, 0.7, { f1: 80, sw: 0.12 });
    S.click(t + 0.45, 0.6, 1600);
  });
  D('ballista_shot', { gap: 0.25, grp: 'wpn', vol: 0.462, jit: 0.8 }, function (t, k, o) {
    S.tone(t, 'triangle', 150 * k, 0.16, 0.8, { f1: 95 * k, sw: 0.14, lp: 1600 });
    S.nz(t, 0.12, 0.5, { type: 'bp', f: 900, q: 1, f2: 2600, fsw: 0.1 });
    S.click(t, 0.5, 1500);
  });
  D('horse', { gap: 1, grp: 'use', vol: 0.344, pri: 1, wet: 0.25 }, function (t) {
    var at = [0, 0.11, 0.2, 0.42, 0.53, 0.62];
    for (var i = 0; i < at.length; i++) { S.nz(t + at[i], 0.04, 0.7, { type: 'bp', f: rnd(500, 800), q: 2.5 }); S.tone(t + at[i], 'sine', 160, 0.05, 0.4, { f1: 100, sw: 0.04 }); }
    I.brass(t + 0.7, 392, 0.18, 0.3, { br: 7 }); I.brass(t + 0.9, 523, 0.45, 0.32, { br: 7 });
  });
  D('puff', { gap: 0.3, grp: 'use', vol: 0.574 }, function (t) {
    S.nz(t, 0.3, 0.8, { type: 'lp', f: 1600, q: 0.6, f2: 300, fsw: 0.28, a: 0.03, kind: 'pink' });
  });
  D('catapult', { gap: 0.4, grp: 'use', vol: 0.735, pri: 1, wet: 0.15 }, function (t) {
    S.tone(t, 'sine', 130, 0.14, 0.8, { f1: 70, sw: 0.12 });
    S.click(t, 0.7, 1400);
    S.nz(t + 0.03, 0.7, 0.9, { type: 'bp', f: 350, q: 1.2, f2: 2600, fsw: 0.5, a: 0.06, kind: 'pink' });
  });
  D('crypt', { gap: 1, grp: 'use', vol: 0.317, pri: 1, wet: 0.45 }, function (t) {
    S.nz(t, 0.6, 0.7, { type: 'bp', f: 220, q: 1.5, f2: 380, fsw: 0.6, a: 0.1, kind: 'brown' });
    S.tone(t + 0.55, 'sine', 70, 0.7, 1, { f1: 30, sw: 0.5 });
    S.nz(t + 0.55, 0.4, 0.6, { type: 'lp', f: 1500, q: 0.6, f2: 200, fsw: 0.35, kind: 'brown' });
    [147, 156, 220].forEach(function (f) { I.choir(t + 0.6, f * 2, 1.2, 0.16, { a: 0.3, rel: 0.6 }); });
  });
  D('banner', { gap: 1, grp: 'use', vol: 0.335, pri: 1, wet: 0.35 }, function (t) {
    var m = [[0, 392, 0.14], [0.16, 392, 0.14], [0.32, 523, 0.5], [0.85, 659, 0.6]];
    m.forEach(function (e) { I.brass(t + e[0], e[1], e[2], 0.4, { br: 6 }); I.brass(t + e[0], e[1] * 0.75, e[2], 0.22, { br: 5 }); });
    I.timp(t + 0.32, 98, 0, 0.7); I.timp(t + 0.85, 131, 0, 0.8);
  });
  D('fuse', { gap: 0.2, grp: 'use', vol: 0.159, jit: 1 }, function (t, k, o) {
    var d = o.dur || 0.7;
    S.nz(t, d, 0.6, { type: 'hp', f: 5200, q: 0.7, a: 0.03, hold: d * 0.7 });
    for (var i = 0; i < 5; i++) S.nz(t + Math.random() * d, 0.012, 0.4, { type: 'hp', f: 3000 });
  });
  D('forge', { gap: 0.5, grp: 'use', vol: 0.352, pri: 1, wet: 0.4 }, function (t) {
    S.fm(t, 830, 2.76, 4, 0.9, 0.6);
    S.fm(t + 0.25, 1245, 2.76, 3, 0.9, 0.45);
    [262, 330, 392, 523].forEach(function (f) { I.choir(t + 0.2, f, 1.1, 0.14, { a: 0.3, rel: 0.6 }); });
  });
  D('use', { gap: 0.2, grp: 'use', vol: 0.33, pri: 1, wet: 0.25 }, function (t, k) {
    S.tone(t, 'triangle', 587 * k, 0.12, 0.5, { lp: 5000 });
    S.tone(t + 0.07, 'triangle', 880 * k, 0.25, 0.5, { lp: 6000 });
    S.nz(t, 0.2, 0.06, { type: 'hp', f: 6000 });
  });
  D('pillar', { gap: 1, grp: 'big', vol: 0.414, pri: 2, wet: 0.5 }, function (t) {
    S.nz(t, 1.2, 0.7, { type: 'bp', f: 300, q: 1.2, f2: 6000, fsw: 1, a: 0.3, kind: 'pink' });
    [523, 659, 784, 1047, 1319, 1568].forEach(function (f, i) { S.fm(t + 0.1 + i * 0.06, f, 3.5, 1.2, 1.1, 0.25); });
  });
  D('ready', { gap: 2, grp: 'use', vol: 0.294, pri: 1, wet: 0.4 }, function (t) {
    [1047, 1319, 1568, 2093].forEach(function (f, i) { S.fm(t + i * 0.05, f, 3.5, 1, 0.7, 0.3); });
  });
  // 狼嚎（内容扩展的新敌人用）：往上滑再往下落的锯齿 + 宽颤音
  D('howl', { gap: 1.5, grp: 'enemy', vol: 0.393, pri: 1, wet: 0.4 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 330 * k, t + 1.3), fl = S.filt(t, 'bandpass', 900, 2.5), g = S.env(t, 0.6, 0.25, 1.25, 0.4);
    os.frequency.setValueAtTime(330 * k, t); os.frequency.exponentialRampToValueAtTime(560 * k, t + 0.35); os.frequency.exponentialRampToValueAtTime(380 * k, t + 1.2);
    S.vib(t, t + 1.3, 5.5, 30, 0.3, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
  });
  // 一下鼓（敌人的战鼓手）
  D('drum_hit', { gap: 0.25, grp: 'enemy', vol: 0.183, jit: 1 }, function (t) { I.taiko(t, 0, 0, 0.8); });

  // 成就（第二批 / META 可以直接用 SFX.play('achieve')）
  D('achieve', { gap: 0.8, grp: 'use', vol: 0.351, pri: 2, wet: 0.35 }, function (t, k) {
    [659, 784, 1047, 1319].forEach(function (f, i) { S.tone(t + i * 0.07, 'triangle', f * k, 0.35, 0.45, { lp: 6000 }); });
    S.fm(t + 0.28, 2093 * k, 3.5, 1.2, 0.9, 0.2);
  });

  // ============================================================
  //  内容扩展（content.js / content_map.js）：新敌人、Boss 新招式、秘密地点、随机事件
  //  怎么对应到 CONTENT 的 special 事件见 audio_hooks.js 的 SFX.SPECIAL；名字都以 ct_ 开头
  //  组：btele Boss / 小 Boss 招式的预警（pri 2，不会被小怪挤掉）、tele 小怪会伤人的预警（蠕虫、秃鹫、无头骑士、流星）、
  //      mob 新敌人的常见动作、strike 招式落地、ev 金袋哥布林的钱袋（事件开始 / 结束的插曲和别的大时刻一样用 big）
  // ============================================================
  SFX.GROUPS.tele = 4; SFX.GROUPS.btele = 3; SFX.GROUPS.mob = 4; SFX.GROUPS.strike = 3; SFX.GROUPS.ev = 3;
  // 一段“磨”的声音：噪声经带通，音量按 rate 赫兹抖动（石头摩擦、沙子流动、骨头碰撞）
  var grind = function (t, dur, amp, f, q, rate, depth, kind, a) {
    var n = S.noise(t, t + dur + 0.05, kind || 'brown'), fl = S.filt(t, 'bandpass', f, q);
    var am = S.gain(1 - depth), lfo = S.osc(t, 'sine', rate, t + dur + 0.05), lg = S.gain(depth);
    lfo.connect(lg); lg.connect(am.gain);
    var g = S.env(t, amp, a || 0.05, dur, dur * 0.4);
    n.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
  };
  // 一下“咔”的木头 / 骨头声：短噪声 + 往下掉的正弦
  var knock = function (t, amp, f, body) {
    S.nz(t, 0.03, amp, { type: 'bp', f: f, q: 2.5 });
    S.tone(t, 'sine', body || 180, 0.08, amp * 0.6, { f1: (body || 180) * 0.5, sw: 0.07 });
  };

  // ---- 新敌人 ----
  // 灰林狼扑击：短促的咆哮 + 扑过去的风声（扑击线已经亮了 0.85 秒，这里是“现在扑过来了”）
  D('ct_lunge', { gap: 0.3, grp: 'mob', vol: 1.0, jit: 1 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 175 * k, t + 0.26, { f1: 110 * k, sw: 0.22 }), fl = S.filt(t, 'bandpass', 950, 2), g = S.env(t, 0.55, 0.012, 0.24);
    S.vib(t, t + 0.26, 31, 70, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.nz(t + 0.03, 0.32, 0.55, { type: 'bp', f: 450, q: 1, f2: 2300, fsw: 0.26, a: 0.06, kind: 'pink' });
  });
  // 孢子菇鼓起菌盖（0.75 秒后放孢子云）：越吸越满的气声
  D('ct_spore_wind', { gap: 0.4, grp: 'mob', vol: 0.28, pri: 1 }, function (t, k) {
    S.nz(t, 0.78, 0.55, { type: 'bp', f: 320, q: 1.6, f2: 1900, fsw: 0.72, a: 0.6, kind: 'pink' });
    S.tone(t, 'sine', 190 * k, 0.78, 0.3, { f1: 430 * k, sw: 0.72, a: 0.6, vib: 9, vd: 55 });
  });
  // 放出孢子云：“噗——”的一口气 + 几个小气泡
  D('ct_spore_puff', { gap: 0.15, grp: 'mob', vol: 0.5, jit: 1.5 }, function (t, k) {
    S.nz(t, 0.42, 0.6, { type: 'bp', f: 2600, q: 0.7, f2: 800, fsw: 0.38, a: 0.012, kind: 'pink' });
    S.tone(t, 'sine', 135 * k, 0.13, 0.55, { f1: 60, sw: 0.11 });
    for (var i = 0; i < 4; i++) S.tone(t + 0.05 + i * 0.055 + Math.random() * 0.03, 'sine', rnd(700, 1100) * k, 0.05, 0.14, { f1: rnd(1150, 1600) * k, sw: 0.045 });
  });
  // 哥布林鼓手开始擂鼓（0.7 秒后附近的怪变快变狠）：越来越快的一串手鼓
  D('ct_drum_roll', { gap: 0.5, grp: 'mob', vol: 0.24, pri: 1 }, function (t, k) {
    for (var i = 0; i < 9; i++) I.frame(t + 0.66 * Math.pow(i / 9, 0.8), 0, 0, 0.32 + i * 0.07);
    S.tone(t, 'triangle', 220 * k, 0.65, 0.12, { f1: 330 * k, sw: 0.6, a: 0.5, lp: 1200 });
  });
  // 擂鼓强化生效：一记大鼓 + 一声短号（战吼）
  D('ct_drum_buff', { gap: 0.4, grp: 'mob', vol: 0.15, pri: 1, wet: 0.25 }, function (t, k) {
    I.taiko(t, 0, 0, 0.9);
    I.brass(t + 0.02, 196 * k, 0.28, 0.42, { br: 6, a: 0.02, rel: 0.15 });
    I.brass(t + 0.02, 294 * k, 0.28, 0.3, { br: 6, a: 0.02, rel: 0.15 });
  });
  // 沙穴蠕虫钻回沙里：沙子往下陷 + 碎粒
  D('ct_burrow', { gap: 0.3, grp: 'mob', vol: 0.5, jit: 1 }, function (t) {
    S.nz(t, 0.45, 0.8, { type: 'lp', f: 1500, q: 0.7, f2: 200, fsw: 0.4, kind: 'brown' });
    for (var i = 0; i < 6; i++) S.nz(t + Math.random() * 0.35, 0.02, 0.35, { type: 'bp', f: rnd(1500, 3500), q: 2 });
  });
  // 地面裂开（0.85 秒后从下面钻出来）：往上涨的地鸣 + 越来越密的裂响。最重要的预警之一：pri 2
  D('ct_rumble_warn', { gap: 0.3, grp: 'tele', vol: 0.38, pri: 2 }, function (t) {
    S.nz(t, 0.88, 0.9, { type: 'lp', f: 150, q: 1.2, f2: 650, fsw: 0.8, a: 0.7, kind: 'brown' });
    S.tone(t, 'sawtooth', 50, 0.88, 0.22, { f1: 74, sw: 0.8, lp: 320, a: 0.7 });
    for (var i = 0; i < 7; i++) S.nz(t + 0.15 + 0.66 * Math.pow(i / 7, 0.7), 0.016, 0.3 + i * 0.05, { type: 'bp', f: rnd(900, 1700), q: 3 });
  });
  // 钻出来：沙子炸开
  D('ct_erupt', { gap: 0.15, grp: 'boom', vol: 0.5, wet: 0.15, jit: 1 }, function (t, k) {
    S.tone(t, 'sine', 115 * k, 0.4, 0.95, { f1: 38, sw: 0.3 });
    S.nz(t, 0.5, 0.85, { type: 'bp', f: 600, q: 0.7, f2: 250, fsw: 0.45, kind: 'brown' });
    S.nz(t + 0.03, 0.35, 0.35, { type: 'hp', f: 2600, a: 0.02 });
  });
  // 食腐秃鹫标出落点（0.95 秒后俯冲）：一声尖叫
  D('ct_screech', { gap: 0.5, grp: 'tele', vol: 0.45, pri: 2, wet: 0.3 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 1900 * k, t + 0.6, { f1: 1150 * k, sw: 0.5 }), fl = S.filt(t, 'bandpass', 2600, 3), g = S.env(t, 0.55, 0.02, 0.55, 0.1);
    S.vib(t, t + 0.6, 23, 90, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.nz(t, 0.45, 0.14, { type: 'hp', f: 4200, a: 0.03 });
  });
  // 俯冲：往下掉的哨音 + 风
  D('ct_dive', { gap: 0.3, grp: 'mob', vol: 0.4, jit: 0.8 }, function (t, k) {
    S.tone(t, 'sine', 1500 * k, 0.42, 0.4, { f1: 480 * k, sw: 0.4, a: 0.05 });
    S.nz(t, 0.42, 0.6, { type: 'bp', f: 1800, q: 1.2, f2: 600, fsw: 0.4, a: 0.1, kind: 'pink' });
  });
  // 扎进地里：闷响 + 土
  D('ct_thud', { gap: 0.2, grp: 'mob', vol: 0.55, jit: 1 }, function (t, k) {
    S.tone(t, 'sine', 150 * k, 0.22, 0.95, { f1: 45, sw: 0.18 });
    S.nz(t, 0.25, 0.7, { type: 'lp', f: 900, q: 0.7, f2: 200, fsw: 0.2, kind: 'brown' });
    S.click(t, 0.4, 1600);
  });
  // 蜥人盾卫格挡飞弹：一声短促的金属“铛”
  D('ct_block', { gap: 0.09, grp: 'hit', vol: 0.36, jit: 1 }, function (t, k) {
    S.fm(t, 640 * k, 2.76, 3, 0.28, 0.6);
    S.nz(t, 0.025, 0.5, { type: 'hp', f: 3200 });
  });
  // 诅咒墓碑从地里升起来：石头摩擦 + 低沉的呻吟
  D('ct_tomb_rise', { gap: 1, grp: 'mob', vol: 0.5, pri: 1, wet: 0.3 }, function (t) {
    grind(t, 1.2, 0.8, 260, 1.4, 13, 0.6, 'brown', 0.15);
    S.tone(t + 0.1, 'sawtooth', 65, 1.0, 0.18, { f1: 55, sw: 1, lp: 260, a: 0.3, vib: 4, vd: 30 });
  });
  // 墓碑召唤（0.9 秒后地上的绿圈里爬出亡灵）：两个走调的钟 + 往上飘的低语
  D('ct_tomb_cast', { gap: 0.5, grp: 'mob', vol: 0.28, pri: 1, wet: 0.45 }, function (t, k) {
    S.fm(t, 415 * k, 3.5, 1.6, 1.1, 0.4, { idx1: 0.1 });
    S.fm(t + 0.04, 587 * k, 3.5, 1.6, 1.1, 0.32, { idx1: 0.1 });
    S.nz(t, 0.9, 0.18, { type: 'bp', f: 900, q: 3, f2: 2600, fsw: 0.85, a: 0.4, kind: 'pink' });
  });
  // 灵质团裂开：湿湿的“噗叽” + 几滴
  D('ct_split', { gap: 0.1, grp: 'kill', vol: 0.5, jit: 1.5 }, function (t, k) {
    S.nz(t, 0.16, 0.8, { type: 'bp', f: 850 * k, q: 2, f2: 300, fsw: 0.14 });
    S.tone(t, 'sine', 420 * k, 0.14, 0.45, { f1: 140, sw: 0.12 });
    for (var i = 0; i < 3; i++) S.tone(t + 0.08 + i * 0.06, 'sine', rnd(900, 1400) * k, 0.04, 0.16, { f1: rnd(500, 700) * k, sw: 0.035 });
  });
  // 无头骑士端平长枪（1 秒后冲锋）：金属往上刮的声音
  D('ct_lance_aim', { gap: 0.5, grp: 'tele', vol: 0.42, pri: 2 }, function (t, k) {
    S.nz(t, 0.95, 0.6, { type: 'bp', f: 1100, q: 6, f2: 3200, fsw: 0.9, a: 0.5 });
    S.tone(t, 'sawtooth', 190 * k, 0.95, 0.16, { f1: 380 * k, sw: 0.9, lp: 1400, a: 0.6 });
    S.fm(t + 0.85, 1500 * k, 2.76, 2, 0.25, 0.25);
  });
  // 冲锋：马蹄 + 冲过来的风
  D('ct_lance_charge', { gap: 0.4, grp: 'mob', vol: 0.33, pri: 1 }, function (t) {
    var at = [0, 0.1, 0.19, 0.32, 0.42, 0.51];
    for (var i = 0; i < at.length; i++) { S.nz(t + at[i], 0.04, 0.6, { type: 'bp', f: rnd(500, 750), q: 2.5 }); S.tone(t + at[i], 'sine', 150, 0.06, 0.45, { f1: 90, sw: 0.05 }); }
    S.nz(t, 0.65, 0.5, { type: 'bp', f: 500, q: 1, f2: 1800, fsw: 0.5, a: 0.15, kind: 'pink' });
  });

  // ---- 关卡 Boss 的新招式（招式开始、还在蓄力时：预警） ----
  // 盘根错节：木头吱呀 + 地底的隆隆声（树根马上从脚下冒出来）
  D('ct_roots', { gap: 0.8, grp: 'btele', vol: 0.45, pri: 2, wet: 0.25 }, function (t) {
    var os = S.osc(t, 'sawtooth', 92, t + 0.9, { f1: 118, sw: 0.85 }), fl = S.filt(t, 'bandpass', 520, 5), g = S.env(t, 0.5, 0.08, 0.85, 0.3);
    S.vib(t, t + 0.9, 17, 70, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.nz(t, 1.2, 0.8, { type: 'lp', f: 170, q: 1, f2: 420, fsw: 1, a: 0.5, kind: 'brown' });
  });
  // 炸裂种荚：枝条吱呀，0.6 秒后“嘭嘭嘭”抛出几颗种荚
  D('ct_seed_launch', { gap: 0.6, grp: 'btele', vol: 0.22, pri: 2 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 120 * k, t + 0.55, { f1: 160 * k, sw: 0.5 }), fl = S.filt(t, 'bandpass', 700, 4), g = S.env(t, 0.4, 0.05, 0.5, 0.2);
    S.vib(t, t + 0.55, 21, 80, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    for (var i = 0; i < 4; i++) { var tt = t + 0.6 + i * 0.12; S.tone(tt, 'sine', 310 * k, 0.12, 0.7, { f1: 120, sw: 0.1 }); S.nz(tt, 0.05, 0.4, { type: 'bp', f: 900, q: 1.2 }); }
  });
  // 落叶旋风（第二阶段）：转起来的风 + 沙沙的叶子，整个招式 3.5 秒
  D('ct_leafstorm', { gap: 2, grp: 'btele', vol: 0.45, pri: 2, wet: 0.3 }, function (t) {
    var end = t + 3.6, n = S.noise(t, end, 'pink'), fl = S.filt(t, 'bandpass', 1100, 2.2);
    var lfo = S.osc(t, 'sine', 1.1, end), lg = S.gain(650);
    lfo.connect(lg); lg.connect(fl.frequency);
    var g = S.adsr(t, 0.8, 0.45, 0.4, 0.8, 3.0, 0.5);
    n.connect(fl); fl.connect(g); g.connect(S.out());
    grind(t + 0.3, 3.0, 0.35, 5200, 0.8, 11, 0.7, 'white', 0.3);
  });
  // 烈日审判：金色的光圈出现（追着人跑，停下变红后落下光柱）：明亮的合唱往上涌
  D('ct_sun_call', { gap: 0.8, grp: 'btele', vol: 0.36, pri: 2, wet: 0.45 }, function (t, k) {
    [392, 494, 587].forEach(function (f, i) { I.choir(t + i * 0.06, f * k, 0.8, 0.28, { a: 0.4, rel: 0.5 }); });
    S.fm(t + 0.5, 1568 * k, 3.5, 1.2, 0.8, 0.22);
    S.nz(t, 0.9, 0.12, { type: 'hp', f: 6000, a: 0.6 });
  });
  // 光圈锁定变红（0.55 秒后光柱落下）：一声往上走的“叮——”，跑出圈的信号
  D('ct_sun_lock', { gap: 0.12, grp: 'btele', vol: 0.45, pri: 2 }, function (t, k) {
    S.tone(t, 'sine', 880 * k, 0.5, 0.5, { f1: 1760 * k, sw: 0.48, a: 0.01 });
    S.tone(t, 'triangle', 1320 * k, 0.12, 0.25, { lp: 6000 });
  });
  // 光柱落下：明亮的“嗡”+ 一下闷响
  D('ct_sun_pillar', { gap: 0.12, grp: 'strike', vol: 0.42, wet: 0.35, jit: 0.6 }, function (t, k) {
    S.fm(t, 1180 * k, 1.5, 4, 0.5, 0.45, { idx1: 0.2 });
    S.nz(t, 0.18, 0.45, { type: 'hp', f: 3000 });
    S.tone(t, 'sine', 95, 0.3, 0.7, { f1: 40, sw: 0.25 });
  });
  // 流沙之墙：沙子哗哗地推过来
  D('ct_sandwall', { gap: 0.8, grp: 'btele', vol: 0.6, pri: 2 }, function (t) {
    grind(t, 1.3, 0.85, 950, 0.8, 7, 0.35, 'pink', 0.5);
    for (var i = 0; i < 10; i++) S.nz(t + 0.2 + Math.random() * 1.0, 0.02, 0.25, { type: 'bp', f: rnd(2000, 4500), q: 2 });
  });
  // 流沙漩涡（第二阶段）：往下吸的漩涡声（0.8 秒后开始往中心拉）
  D('ct_quicksand', { gap: 0.8, grp: 'btele', vol: 0.42, pri: 2, wet: 0.2 }, function (t, k) {
    S.nz(t, 1.3, 0.7, { type: 'bp', f: 2400, q: 1.6, f2: 260, fsw: 1.2, a: 0.3, kind: 'pink' });
    S.tone(t, 'sine', 620 * k, 1.3, 0.3, { f1: 140 * k, sw: 1.2, a: 0.3, vib: 7, vd: 45 });
  });
  // 骨雨：一阵骨头碰撞的哗啦声 + 从天上落下来的哨音
  D('ct_bone_call', { gap: 0.8, grp: 'btele', vol: 0.3, pri: 2, wet: 0.35 }, function (t, k) {
    for (var i = 0; i < 12; i++) knock(t + Math.random() * 0.6, 0.35, rnd(2200, 3600), 260);
    S.tone(t + 0.1, 'sine', 1600 * k, 0.9, 0.3, { f1: 560 * k, sw: 0.85, a: 0.2 });
  });
  // 亡灵冲击：法杖蓄力（暗色的合唱往上涌），然后重重砸地
  D('ct_necro_slam', { gap: 0.8, grp: 'btele', vol: 0.22, pri: 2, wet: 0.35 }, function (t) {
    [110, 116.5].forEach(function (f) { I.choir(t, f * 2, 0.55, 0.3, { a: 0.4, rel: 0.25 }); });
    S.nz(t, 0.6, 0.35, { type: 'bp', f: 300, q: 1.5, f2: 1200, fsw: 0.55, a: 0.5, kind: 'pink' });
    S.tone(t + 0.6, 'sine', 90, 0.5, 0.95, { f1: 32, sw: 0.4 });
    S.nz(t + 0.6, 0.3, 0.6, { type: 'lp', f: 900, q: 0.7, f2: 150, fsw: 0.25, kind: 'brown' });
  });
  // 冲击波（紫色的光墙往外扩，跳起来躲）：扩散的呼啸
  D('ct_wave', { gap: 0.25, grp: 'btele', vol: 0.42, pri: 2 }, function (t, k) {
    S.nz(t, 0.9, 0.7, { type: 'bp', f: 260, q: 1.4, f2: 1300, fsw: 0.8, a: 0.04, kind: 'pink' });
    S.tone(t, 'sine', 82 * k, 0.6, 0.6, { f1: 55, sw: 0.5 });
    S.fm(t, 196 * k, 1.5, 2, 0.7, 0.15);
  });
  // 墓手合围（第二阶段）：地面裂开 + 两声错开半音的呻吟
  D('ct_gravehands', { gap: 1, grp: 'btele', vol: 0.45, pri: 2, wet: 0.4 }, function (t) {
    S.nz(t, 0.6, 0.6, { type: 'lp', f: 300, q: 1, f2: 900, fsw: 0.5, a: 0.2, kind: 'brown' });
    for (var i = 0; i < 6; i++) knock(t + 0.1 + Math.random() * 0.5, 0.3, rnd(1200, 2200), 200);
    [147, 156].forEach(function (f) { I.choir(t + 0.3, f * 2, 1.1, 0.26, { a: 0.35, rel: 0.6 }); });
  });

  // ---- 小 Boss 的新招式 ----
  // 小 Boss 投石（boulder）：抓起石头的摩擦声 + 用力的闷哼，然后三块石头飞出去
  D('ct_heave', { gap: 0.8, grp: 'btele', vol: 0.45, pri: 2 }, function (t, k) {
    grind(t, 0.65, 0.7, 320, 1.2, 15, 0.6, 'brown', 0.1);
    S.tone(t + 0.4, 'sawtooth', 115 * k, 0.3, 0.35, { f1: 78 * k, sw: 0.28, lp: 600 });
    for (var i = 0; i < 3; i++) S.nz(t + 0.7 + i * 0.08, 0.3, 0.4, { type: 'bp', f: 380, q: 1, f2: 1400, fsw: 0.25, a: 0.04, kind: 'pink' });
  });
  // 小 Boss 跳起来砸地（bellyflop）：蹲下蓄力，0.55 秒后“嘣”地跳起来，往下落的哨音（落点在红圈）
  D('ct_hop_warn', { gap: 0.8, grp: 'btele', vol: 0.22, pri: 2 }, function (t, k) {
    S.tone(t, 'sawtooth', 70 * k, 0.5, 0.3, { f1: 55 * k, sw: 0.45, lp: 400, a: 0.2 });
    S.tone(t + 0.55, 'sine', 150 * k, 0.22, 0.8, { f1: 620 * k, sw: 0.2 });
    S.tone(t + 0.75, 'sine', 1300 * k, 0.75, 0.25, { f1: 450 * k, sw: 0.75, a: 0.05 });
  });
  // 小 Boss 裂地冲击（quakeline）：地鸣往上涨，然后裂开
  D('ct_quake', { gap: 0.8, grp: 'btele', vol: 0.36, pri: 2 }, function (t) {
    S.nz(t, 0.65, 0.9, { type: 'lp', f: 120, q: 1.4, f2: 500, fsw: 0.6, a: 0.5, kind: 'brown' });
    S.tone(t, 'sawtooth', 45, 0.6, 0.2, { f1: 62, sw: 0.6, lp: 300, a: 0.5 });
    S.nz(t + 0.6, 0.1, 0.5, { type: 'bp', f: 1400, q: 1.5 });
  });
  // 小 Boss 毒液喷射（acidrain）：咕嘟咕嘟，然后“噗”地吐出来
  D('ct_acid_spit', { gap: 0.8, grp: 'btele', vol: 0.45, pri: 2 }, function (t, k) {
    for (var i = 0; i < 6; i++) S.tone(t + i * 0.08, 'sine', rnd(250, 380) * k, 0.07, 0.4, { f1: rnd(480, 650) * k, sw: 0.06 });
    S.nz(t + 0.52, 0.3, 0.7, { type: 'bp', f: 1500, q: 1.2, f2: 500, fsw: 0.25, a: 0.01, kind: 'pink' });
  });
  // 小 Boss 穿墙突袭（phasedash）：消失时幽幽的一声（0.35 秒后消失，在玩家身后的鬼影里现身）
  D('ct_phase_out', { gap: 0.8, grp: 'btele', vol: 0.4, pri: 2, wet: 0.5 }, function (t, k) {
    S.tone(t, 'sine', 900 * k, 0.6, 0.45, { f1: 300 * k, sw: 0.55, vib: 6, vd: 90, a: 0.05 });
    S.nz(t, 0.55, 0.3, { type: 'hp', f: 2500, f2: 6000, fsw: 0.5, a: 0.3 });
  });
  // 现身冲过来：尖啸 + 冲刺的风
  D('ct_phase_dash', { gap: 0.5, grp: 'btele', vol: 1.0, pri: 2, wet: 0.3 }, function (t, k) {
    var os = S.osc(t, 'sawtooth', 720 * k, t + 0.45, { f1: 1350 * k, sw: 0.3 }), fl = S.filt(t, 'bandpass', 1600, 2.5), g = S.env(t, 0.5, 0.01, 0.42);
    S.vib(t, t + 0.45, 13, 60, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    S.nz(t + 0.05, 0.4, 0.5, { type: 'bp', f: 600, q: 1, f2: 2600, fsw: 0.3, kind: 'pink' });
  });
  // 小 Boss 光束扫射（sweepbeam）：0.75 秒细细的警告音（细红线），然后紫色光束扫 1.5 秒的电流声
  D('ct_beam_charge', { gap: 1, grp: 'btele', vol: 0.24, pri: 2, wet: 0.2 }, function (t, k) {
    S.tone(t, 'sine', 600 * k, 0.75, 0.4, { f1: 1500 * k, sw: 0.72, a: 0.4 });
    var t1 = t + 0.75, end = t1 + 1.55;
    var a = S.osc(t1, 'sawtooth', 110 * k, end), b = S.osc(t1, 'sawtooth', 221 * k, end), fl = S.filt(t1, 'bandpass', 950, 1.2);
    var am = S.gain(0.6), lfo = S.osc(t1, 'sine', 16, end), lg = S.gain(0.4);
    lfo.connect(lg); lg.connect(am.gain);
    var g = S.env(t1, 0.5, 0.05, 1.5, 1.2);
    a.connect(fl); b.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
    S.nz(t1, 1.5, 0.12, { type: 'hp', f: 4500, a: 0.05, hold: 1.1 });
  });

  // ---- 招式落地（延迟打击、抛射物） ----
  // 树根冒出来：木头“咔嚓”（一批树根同时冒出来只响一下）
  D('ct_root_strike', { gap: 0.1, grp: 'strike', vol: 0.7, jit: 1.5 }, function (t, k) {
    knock(t, 0.8, 1300 * k, 170 * k);
    S.nz(t + 0.01, 0.12, 0.35, { type: 'lp', f: 700, kind: 'brown' });
  });
  // 沙刺冒出来：沙子“唰”
  D('ct_sand_strike', { gap: 0.07, grp: 'strike', vol: 1.1, jit: 1.5 }, function (t, k) {
    S.nz(t, 0.13, 0.7, { type: 'bp', f: 1900 * k, q: 1 });
    S.nz(t, 0.1, 0.5, { type: 'lp', f: 500, kind: 'brown' });
  });
  // 骨头砸下来：骨头“咔啦”
  D('ct_bone_strike', { gap: 0.12, grp: 'strike', vol: 0.45, jit: 2 }, function (t, k) {
    knock(t, 0.6, 2600 * k, 210 * k);
    knock(t + 0.035, 0.4, 3300 * k, 260 * k);
  });
  // 种荚落地（爆炸声由 FX.boom 出）：荆棘长出来的噼啪声
  D('ct_thorns', { gap: 0.15, grp: 'strike', vol: 0.4 }, function (t) {
    for (var i = 0; i < 8; i++) S.nz(t + i * 0.035 + Math.random() * 0.02, 0.015, 0.4, { type: 'hp', f: rnd(2500, 4500) });
    S.nz(t, 0.35, 0.25, { type: 'bp', f: 1200, q: 1, f2: 3000, fsw: 0.3, kind: 'pink' });
  });
  // 石头砸地（爆炸声由 FX.boom 出）：碎石
  D('ct_rock_crash', { gap: 0.15, grp: 'strike', vol: 0.7 }, function (t) {
    S.nz(t, 0.3, 0.7, { type: 'lp', f: 1000, q: 0.8, f2: 200, fsw: 0.25, kind: 'brown' });
    for (var i = 0; i < 5; i++) S.nz(t + Math.random() * 0.2, 0.02, 0.35, { type: 'bp', f: rnd(800, 2000), q: 2 });
  });
  // 毒液落地：溅开 + 滋滋
  D('ct_acid_splash', { gap: 0.12, grp: 'strike', vol: 0.4 }, function (t, k) {
    S.nz(t, 0.16, 0.7, { type: 'bp', f: 1400 * k, q: 1.2 });
    grind(t + 0.05, 0.55, 0.3, 5000, 0.8, 23, 0.6, 'white', 0.02);
    for (var i = 0; i < 3; i++) S.tone(t + 0.06 + i * 0.07, 'sine', rnd(500, 800) * k, 0.05, 0.2, { f1: rnd(900, 1200) * k, sw: 0.04 });
  });

  // ---- 秘密地点、地形 ----
  // 裂墙被炸开（炸药桶的爆炸声另外有）：石头塌下来
  D('ct_wall_break', { gap: 1, grp: 'use', vol: 0.5, pri: 1, wet: 0.3 }, function (t) {
    S.nz(t, 1.2, 0.8, { type: 'lp', f: 900, q: 0.7, f2: 150, fsw: 1.1, kind: 'brown' });
    S.tone(t, 'sine', 70, 0.6, 0.8, { f1: 32, sw: 0.5 });
    for (var i = 0; i < 12; i++) knock(t + 0.1 + Math.pow(Math.random(), 1.6) * 1.0, 0.3, rnd(700, 1800), 120);
  });
  // 点燃一个火盆：火“呼”地起来 + 一声钟
  D('ct_brazier', { gap: 0.3, grp: 'use', vol: 0.42, pri: 1, wet: 0.35 }, function (t, k) {
    S.nz(t, 0.5, 0.7, { type: 'lp', f: 400, q: 0.8, f2: 2400, fsw: 0.3, a: 0.05, kind: 'pink' });
    S.fm(t + 0.12, 784 * k, 3.5, 1.4, 1.1, 0.4);
  });
  // 顺序错了：火全灭的“嗤——”+ 两个往下走的音
  D('ct_brazier_fail', { gap: 0.5, grp: 'use', vol: 0.42, pri: 1 }, function (t) {
    S.nz(t, 0.7, 0.6, { type: 'hp', f: 3000, q: 0.7, f2: 1200, fsw: 0.6, a: 0.02 });
    S.tone(t + 0.1, 'triangle', 330, 0.18, 0.4, { lp: 2000 });
    S.tone(t + 0.3, 'triangle', 247, 0.35, 0.4, { lp: 1600 });
  });
  // 捡到藏宝图：纸张沙沙 + 三个音
  D('ct_scroll', { gap: 0.5, grp: 'use', vol: 0.42, pri: 1, wet: 0.3 }, function (t, k) {
    grind(t, 0.35, 0.4, 3200, 1, 19, 0.7, 'white', 0.02);
    [659, 880, 1175].forEach(function (f, i) { S.tone(t + 0.25 + i * 0.07, 'triangle', f * k, 0.3, 0.4, { lp: 6000 }); });
  });
  // 挖出宝藏：两铲土 + 金币哗啦
  D('ct_dig', { gap: 0.5, grp: 'use', vol: 0.45, pri: 1, wet: 0.2 }, function (t) {
    for (var i = 0; i < 2; i++) { var tt = t + i * 0.2; S.nz(tt, 0.12, 0.7, { type: 'bp', f: 700, q: 1.2, kind: 'brown' }); S.click(tt, 0.5, 2400); }
    for (i = 0; i < 7; i++) { var tc = t + 0.42 + i * 0.045 + Math.random() * 0.02; S.tone(tc, 'square', 1976 * rnd(0.96, 1.05), 0.04, 0.3, { lp: 6000 }); S.tone(tc + 0.025, 'square', 2637 * rnd(0.96, 1.05), 0.06, 0.25, { lp: 7000 }); }
  });

  // ---- 随机事件 ----
  // 流星雨开始：两道往下落的哨音 + 远处的雷 + 警钟
  D('ct_ev_meteor', { gap: 2, grp: 'big', vol: 0.4, pri: 2, wet: 0.4 }, function (t, k) {
    S.tone(t, 'sine', 1700 * k, 1.1, 0.35, { f1: 420 * k, sw: 1.05, a: 0.1 });
    S.tone(t + 0.35, 'sine', 1500 * k, 1.0, 0.3, { f1: 380 * k, sw: 0.95, a: 0.1 });
    S.nz(t + 0.9, 1.6, 0.9, { type: 'lp', f: 320, q: 0.7, f2: 90, fsw: 1.4, a: 0.05, kind: 'brown' });
    S.fm(t + 1.0, 988 * k, 1.41, 3, 1.2, 0.35); S.fm(t + 1.3, 988 * k, 1.41, 3, 1.2, 0.3);
  });
  // 流星雨期间的背景：天上滚动的低沉轰鸣 + 远处噼啪的火声（循环音，事件结束 / 暂停 / 回菜单时淡出）
  D('ct_meteor_amb', { grp: 'loop', vol: 0.12, loop: true }, function (t) {
    var end = t + 3600, g = S.gain(0.0001);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1, t + 1.6);
    g.connect(S.out());
    S.param('g', g.gain);
    var n = S.noise(t, end, 'brown'), lp = S.filt(t, 'lowpass', 190, 0.9), sw = S.gain(0.7), l1 = S.osc(t, 'sine', 0.13, end), lg1 = S.gain(0.3);
    l1.connect(lg1); lg1.connect(sw.gain);
    n.connect(lp); lp.connect(sw); sw.connect(g);
    var c = S.noise(t, end, 'white'), bp = S.filt(t, 'bandpass', 3200, 1.5), am = S.gain(0.08), l2 = S.osc(t, 'square', 9, end), lg2 = S.gain(0.06), l3 = S.osc(t, 'sine', 0.31, end), lg3 = S.gain(0.05);
    l2.connect(lg2); lg2.connect(am.gain); l3.connect(lg3); lg3.connect(am.gain);
    c.connect(bp); bp.connect(am); am.connect(g);
  });
  // 一颗流星往下落（1.3 秒后落在发亮的圆盘上）：从高到低的哨音，落点越近越响
  D('ct_meteor_fall', { gap: 0.3, grp: 'tele', vol: 0.25, pri: 2 }, function (t, k) {
    S.tone(t, 'sine', 1900 * k, 1.25, 0.4, { f1: 520 * k, sw: 1.2, a: 0.5 });
    S.nz(t, 1.25, 0.25, { type: 'bp', f: 2600, q: 2, f2: 700, fsw: 1.2, a: 0.6, kind: 'pink' });
  });
  // 流星砸地（爆炸声由 FX.boom 出）：燃烧的噼啪尾音
  D('ct_meteor_hit', { gap: 0.15, grp: 'strike', vol: 0.35, wet: 0.3 }, function (t) {
    grind(t + 0.05, 0.7, 0.4, 2600, 0.8, 21, 0.7, 'white', 0.02);
    for (var i = 0; i < 6; i++) S.nz(t + 0.1 + Math.random() * 0.6, 0.012, 0.35, { type: 'hp', f: 3500 });
  });
  // 金袋哥布林出现：调皮的一小段（拨弦往上跳 + 摇钱袋 + “嘿嘿”）
  D('ct_ev_gob', { gap: 2, grp: 'big', vol: 0.45, pri: 2, wet: 0.25 }, function (t, k) {
    [[0, 523], [0.11, 659], [0.22, 784], [0.36, 1047], [0.5, 988], [0.58, 1047]].forEach(function (n) { I.pizz(t + n[0], n[1] * k, 0.1, 0.8); });
    for (var i = 0; i < 6; i++) S.fm(t + 0.1 + i * 0.07 + Math.random() * 0.02, rnd(2400, 3400) * k, 3.5, 1, 0.2, 0.12);
    S.tone(t + 0.72, 'square', 520 * k, 0.12, 0.25, { f1: 760 * k, sw: 0.1, lp: 2500 });
    S.tone(t + 0.86, 'square', 560 * k, 0.16, 0.25, { f1: 820 * k, sw: 0.14, lp: 2500 });
  });
  // 金袋哥布林身上的钱袋叮当（在它的位置上响：听声音也能找到它）
  D('ct_gob_jingle', { gap: 0.5, grp: 'ev', vol: 0.3 }, function (t, k) {
    for (var i = 0; i < 5; i++) S.fm(t + i * 0.045 + Math.random() * 0.025, rnd(2300, 3600) * k, 3.5, 1, 0.16, 0.2);
    S.nz(t, 0.18, 0.12, { type: 'hp', f: 6500 });
  });
  // 抓住了：金币哗啦啦 + 三个短号
  D('ct_gob_caught', { gap: 2, grp: 'big', vol: 0.42, pri: 2, wet: 0.3 }, function (t, k) {
    for (var i = 0; i < 12; i++) { var tc = t + i * 0.04 + Math.random() * 0.02; S.tone(tc, 'square', 1976 * rnd(0.95, 1.06), 0.04, 0.28, { lp: 6000 }); S.tone(tc + 0.03, 'square', 2637 * rnd(0.95, 1.06), 0.07, 0.22, { lp: 7000 }); }
    [[0.25, 523], [0.4, 659], [0.55, 784]].forEach(function (n, j) { I.brass(t + n[0], n[1] * k, j === 2 ? 0.5 : 0.14, 0.4, { br: 7 }); });
  });
  // 跑掉了：往下滑的哨音 + 钻洞的“噗”
  D('ct_gob_escape', { gap: 2, grp: 'big', vol: 0.4, pri: 1 }, function (t, k) {
    S.tone(t, 'sine', 1400 * k, 0.6, 0.4, { f1: 300 * k, sw: 0.55, vib: 9, vd: 40 });
    S.nz(t + 0.55, 0.3, 0.6, { type: 'lp', f: 1500, q: 0.6, f2: 250, fsw: 0.28, kind: 'pink' });
  });
  // 旅行商人到了：门铃一样的三个钟声 + 鲁特琴轻轻一扫（在商人的位置上响）
  D('ct_ev_merchant', { gap: 2, grp: 'big', vol: 0.42, pri: 2, wet: 0.45 }, function (t, k) {
    [[0, 1175], [0.16, 1480], [0.32, 1760]].forEach(function (n) { S.fm(t + n[0], n[1] * k, 3.5, 1.4, 1.2, 0.4); });
    [587, 740, 880, 1175].forEach(function (f, i) { I.lute(t + 0.55 + i * 0.05, f * k, 0.6, 0.4, {}); });
  });
  // 商人走了：两个往下走的钟声
  D('ct_merchant_bye', { gap: 2, grp: 'big', vol: 0.36, pri: 1, wet: 0.45 }, function (t, k) {
    S.fm(t, 1480 * k, 3.5, 1.4, 1.1, 0.4); S.fm(t + 0.2, 1175 * k, 3.5, 1.4, 1.3, 0.4);
  });
  // 奇怪的宝箱出现了：亮晶晶的宝箱音，但有点走调，最后一声吱呀
  D('ct_ev_mimic', { gap: 2, grp: 'big', vol: 0.4, pri: 2, wet: 0.45 }, function (t, k) {
    [523, 659, 784, 1047].forEach(function (f, i) { S.tone(t + i * 0.07, 'triangle', f * k * (i === 3 ? 0.972 : 1), 0.4, 0.42, { lp: 7000 }); });
    var os = S.osc(t + 0.6, 'sawtooth', 110 * k, t + 0.95, { f1: 150 * k, sw: 0.3 }), fl = S.filt(t + 0.6, 'bandpass', 800, 3), g = S.env(t + 0.6, 0.3, 0.05, 0.32);
    S.vib(t + 0.6, t + 0.95, 24, 90, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
  });
  // 宝箱怪醒了：箱盖“啪”地张开 + 低吼 + 不和谐的铜管重音 + 大鼓
  D('ct_mimic_wake', { gap: 1, grp: 'big', vol: 0.55, pri: 2, wet: 0.35 }, function (t, k) {
    S.click(t, 0.9, 1500);
    S.tone(t, 'sine', 160, 0.12, 0.7, { f1: 70, sw: 0.1 });
    var os = S.osc(t + 0.05, 'sawtooth', 95 * k, t + 1.0, { f1: 70 * k, sw: 0.9 }), fl = S.filt(t + 0.05, 'lowpass', 700, 1.5, 300, 0.9), g = S.env(t + 0.05, 0.5, 0.06, 0.9, 0.3);
    S.vib(t + 0.05, t + 1.0, 9, 50, 0, [os]);
    os.connect(fl); fl.connect(g); g.connect(S.out());
    [[110, 0.4], [117, 0.32], [165, 0.28]].forEach(function (n) { I.brass(t + 0.08, n[0] * k, 0.6, n[1], { br: 5, a: 0.02, rel: 0.3 }); });
    I.taiko(t + 0.08, 0, 0, 1);
  });
  // 宝箱怪跳起来（0.8 秒后落在红圈里）：箱盖哐啷 + 弹簧“嘣”
  D('ct_mimic_hop', { gap: 0.3, grp: 'btele', vol: 0.45, pri: 2 }, function (t, k) {
    knock(t, 0.6, 1100 * k, 150);
    knock(t + 0.06, 0.4, 900 * k, 130);
    S.tone(t + 0.02, 'sine', 190 * k, 0.3, 0.6, { f1: 720 * k, sw: 0.25 });
  });
  // 宝箱怪吐红球：咕咚一口 + 吐出来 + 金币碰撞
  D('ct_mimic_spit', { gap: 0.3, grp: 'mob', vol: 0.45 }, function (t, k) {
    S.tone(t, 'sine', 300 * k, 0.12, 0.6, { f1: 120 * k, sw: 0.1 });
    S.nz(t + 0.1, 0.22, 0.6, { type: 'bp', f: 1300, q: 1, f2: 600, fsw: 0.2, kind: 'pink' });
    for (var i = 0; i < 4; i++) S.tone(t + 0.12 + i * 0.04, 'square', 2200 * rnd(0.95, 1.05), 0.04, 0.2, { lp: 6000 });
  });
  // 血月升起：低沉的锣 + 不和谐的合唱慢慢涌上来 + 两声心跳
  D('ct_ev_bloodmoon', { gap: 2, grp: 'big', vol: 0.5, pri: 2, wet: 0.5 }, function (t, k) {
    S.fm(t, 73 * k, 1.41, 3.5, 3.2, 0.7, { idx1: 0.3 });
    S.tone(t, 'sine', 146 * k, 2.2, 0.25);
    [147, 156, 208].forEach(function (f) { I.choir(t + 0.15, f * 2 * k, 1.8, 0.2, { a: 0.8, rel: 0.8 }); });
    I.heart(t + 0.6, 0, 0, 0.9); I.heart(t + 0.85, 0, 0, 0.6);
    I.frame(t + 0.6, 0, 0, 0.5); I.frame(t + 0.85, 0, 0, 0.35);
  });
  // 血月落下：柔和的大三和弦慢慢亮起来（松一口气）
  D('ct_dawn', { gap: 2, grp: 'big', vol: 0.3, pri: 1, wet: 0.5 }, function (t, k) {
    [262, 330, 392, 523].forEach(function (f) { I.strings(t, f * k, 1.4, 0.09, { a: 0.4, rel: 0.8, lp: 2400 }); });
    S.fm(t + 0.5, 1047 * k, 3.5, 1, 1.2, 0.2);
  });

  // ---- Boss 第二阶段、发现秘密 ----
  // Boss 进入第二阶段：更大的怒吼 + 镲 + 两记大鼓（音乐同时加速、加一层鼓、下一段升半音）
  D('ct_phase2', { gap: 1.5, grp: 'big', vol: 0.5, pri: 2, wet: 0.4 }, function (t, k) {
    [[130, 66], [136, 63], [174, 82], [98, 52]].forEach(function (p) {
      var os = S.osc(t, 'sawtooth', p[0] * k, t + 1.9, { f1: p[1] * k, sw: 1.6 });
      S.vib(t, t + 1.9, 8, 55, 0.05, [os]);
      var fl = S.filt(t, 'lowpass', 1300, 1.2, 420, 1.5), g = S.env(t, 0.26, 0.08, 1.8, 0.6);
      os.connect(fl); fl.connect(g); g.connect(S.out());
    });
    S.nz(t, 1.6, 0.55, { type: 'lp', f: 800, q: 0.8, a: 0.06, hold: 0.6, kind: 'brown' });
    I.crash(t + 0.05, 0, 0, 0.6);
    I.taiko(t, 0, 0, 0.7); I.taiko(t + 0.3, 0, 0, 0.6);
  });
  // 发现秘密地点（音乐关掉时用；平时是插曲 SFX.STINGS.secret）：竖琴往上扫（利底亚音阶，有点神秘）+ 三个钟声
  D('ct_secret', { gap: 1, grp: 'use', vol: 0.4, pri: 2, wet: 0.45 }, function (t, k) {
    [523, 587, 659, 740, 784, 880, 988, 1047, 1175, 1319].forEach(function (f, i) { I.harp(t + i * 0.045, f * k, 0.5, 0.16, {}); });
    [[0.5, 1480], [0.66, 1319], [0.82, 1976]].forEach(function (n) { S.fm(t + n[0], n[1] * k, 3.5, 1.3, 1.3, 0.3); });
    S.nz(t + 0.4, 1.2, 0.08, { type: 'hp', f: 7000, a: 0.3 });
  });

  // ---------------- 循环音：滑铲摩擦 / 空中风声（参数 g 音量、f 频率、am 抖动速度） ----------------
  // 每种坐骑一种摩擦声：金属火花、木头、轮子、冰、悬浮电流、魔法、风、软的（布、叶子、牌、影子）、水、石头、金币
  SFX.SCRAPE = {
    metal: { f: 2600, q: 1.1, am: 31, amd: 0.4, kind: 'white' },
    wood: { f: 700, q: 0.9, am: 13, amd: 0.25, kind: 'pink' },
    wheels: { f: 430, q: 0.8, am: 9, amd: 0.6, kind: 'pink', amSpd: 0.9 },
    ice: { type: 'highpass', f: 4200, q: 0.7, kind: 'white' },
    hover: { f: 950, q: 2, hum: 58, kind: 'pink' },
    magic: { f: 3000, q: 3, hum: 220, humWave: 'sine', am: 7, amd: 0.4, kind: 'white' },
    air: { f: 800, q: 0.6, kind: 'pink' },
    soft: { f: 1300, q: 0.7, kind: 'pink' },
    liquid: { f: 650, q: 1.6, am: 7, amd: 0.5, kind: 'brown' },
    stone: { f: 380, q: 1, am: 21, amd: 0.3, kind: 'brown' },
    coin: { f: 3300, q: 1.5, am: 23, amd: 0.45, kind: 'white' }
  };
  // 骑士 → 坐骑的摩擦声（跟着坐骑的材料：皮马鞍、肚皮软，铜锣、坩埚是金属，棺材、调色盘、云梯是木头）
  SFX.RIDE_SOUND = {
    squire: 'soft', bellringer: 'metal', gravekeeper: 'wood', cook: 'soft', courier: 'air', jester: 'soft', tinsoldier: 'wheels',
    astrologer: 'hover', falconer: 'air', nun: 'magic', smith: 'metal', bear: 'wood', bannerman: 'metal', gardener: 'soft',
    painter: 'wood', magician: 'soft', beekeeper: 'liquid', catknight: 'wood', fisher: 'ice', lampknight: 'soft', engineer: 'wood'
  };
  D('scrape', { grp: 'loop', vol: 0.3, loop: true }, function (t, k, o) {
    var pr = SFX.SCRAPE[o.kind] || SFX.SCRAPE.soft, end = t + 3600;
    var n = S.noise(t, end, pr.kind), fl = S.filt(t, pr.type || 'bandpass', pr.f, pr.q);
    var am = S.gain(1), g = S.gain(0.0001);
    n.connect(fl); fl.connect(am); am.connect(g); g.connect(S.out());
    S.param('g', g.gain); S.param('f', fl.frequency);
    if (pr.am) {
      var lfo = S.osc(t, pr.amSpd ? 'square' : 'sine', pr.am, end), lg = S.gain(pr.amd);
      lfo.connect(lg); lg.connect(am.gain);
      S.param('am', lfo.frequency);
    }
    if (pr.hum) {
      var h = S.osc(t, pr.humWave || 'sawtooth', pr.hum, end), hl = S.filt(t, 'lowpass', pr.humWave ? 2000 : 420, 1), hg = S.gain(pr.humWave ? 0.12 : 0.3);
      h.connect(hl); hl.connect(hg); hg.connect(g);
      S.param('h', h.frequency);
    }
  });

  // ---------------- 缓存：最常响的短音效离线合成成缓冲（每种 2~3 份），以后只放缓冲 ----------------
  // key(o) 把参数分档（每档一份缓存），base(档) 是合成那一档用的参数，rate(o) 播放速度（音高），vol(o) 音量倍数，len 大概多长，n 几份
  var CS = function (name, spec) { if (SFX.DEFS[name]) SFX.DEFS[name].cache = spec; };
  var size3 = function (o) { var sz = o.s || 1; return sz < 0.9 ? 0 : sz < 1.3 ? 1 : 2; };
  var sizeBase = function (l) { return { s: [0.8, 1, 1.6][l] || 1 }; };
  CS('hit', { key: size3, base: sizeBase, len: 0.12 });
  CS('kill', { key: size3, base: sizeBase, len: 0.26 });
  CS('crit', { len: 0.12 });
  CS('xp', { len: 0.08 });
  CS('coin', { len: 0.18 });
  CS('zap_hit', { len: 0.08 });
  CS('boom', { key: function (o) { var r = o.r || 3; return r <= 2.5 ? 0 : r <= 4.5 ? 1 : 2; }, base: function (l) { return { r: [2, 3.5, 6][l] || 3 }; }, len: 1.1, n: 2 });
  CS('enemy_shot', { len: 0.14 });
  CS('spike', { len: 0.14 });
  CS('pot', { len: 0.14 });
  CS('jump', { len: 0.14 });
  CS('jump2', { len: 0.2 });
  CS('land', { key: function (o) { return Math.round(Math.max(0, Math.min(1, o.w == null ? 0.5 : o.w)) * 2); }, base: function (l) { return { w: l / 2 }; }, len: 0.16 });
  CS('slide', { len: 0.26 });
  CS('charge_tick', { len: 0.18 });
  CS('tick', { len: 0.04 });
  CS('click', { len: 0.06 });
  CS('hover', { len: 0.04 });
  // 武器：每把武器（普通 / 超武）一份
  var wkey = function (o) { return (o.key || '') + (o.evo ? '*' : ''); };
  [['w_swing', 0.55], ['w_shotgun', 0.45], ['w_heavy', 0.5], ['w_throw', 0.6], ['w_dagger', 0.45], ['w_zap', 0.45], ['w_bottle', 0.5], ['w_mine', 0.45],
    ['w_trail', 0.3], ['w_aura', 0.45], ['w_frost', 0.45], ['w_orbit', 0.55], ['w_reel', 0.5], ['w_roar', 0.7], ['w_crackle', 1.2]
  ].forEach(function (w) { CS(w[0], { key: wkey, len: w[1] }); });
  CS('w_bell', { key: wkey, len: 1.4, n: 2 });   // w_beam 长度跟着光束走，现场合成
  // 解锁后先合成这些（一进游戏就会用到）
  SFX.PREWARM = [['hit', { s: 1 }], ['hit', { s: 0.8 }], ['kill', { s: 1 }], ['kill', { s: 0.8 }], ['xp'], ['coin'], ['crit'], ['boom', { r: 3 }], ['jump'], ['land', { w: 0.5 }], ['click'], ['tick'], ['enemy_shot'], ['slide']];

  // ---------------- 每把武器用哪个声音 ----------------
  // [配方, 参数]；新武器可以往这里加，没登记的按武器类型（SFX.WEAPON_TYPE）
  // 第 4 块：每把武器按自己的玩法配声音（计划 §4.2）；武器出手以外的事件声音见 audio_hooks.js 的 SFX.EMIT
  SFX.WEAPON = {
    knightsword: ['w_swing', { len: 0.22, lo: 300, hi: 1800, ring: 0.5 }],
    lance: ['w_swing', { len: 0.18, lo: 700, hi: 3000, ring: 0.6 }],
    forgehammer: ['w_swing', { len: 0.3, lo: 200, hi: 1200, clang: 1 }],
    falcon: ['w_throw', { kind: 'rise', len: 0.36, rate: 19, cry: 1 }],
    paintbucket: ['w_bottle', { splat: 1 }],
    claws: ['w_swing', { len: 0.1, lo: 1800, hi: 5600 }],
    beehive: ['w_dagger', { buzz: 1 }],
    astrolabe: ['w_zap', { fall: 1 }],
    trickknives: ['w_shotgun', { light: 1 }],
    pigeons: ['w_throw', { kind: 'flap' }],
    trebuchet: ['w_throw', { kind: 'clack', heavy: 1 }],
    hymn: ['w_aura', { choir: 1 }],
    toyguard: ['w_orbit', { snare: 1 }],
    roar: ['w_roar', {}],
    lanternbeam: ['w_beam', {}],
    gravecandle: ['w_mine', { puff: 1 }],
    thornvine: ['w_trail', { leaf: 1 }],
    fryingpan: ['w_throw', { kind: 'whirr', len: 0.32, rate: 15 }],
    rod: ['w_reel', {}],
    bronzebell: ['w_bell', {}],
    juggle: ['w_throw', { kind: 'boop' }],
    kite: ['w_orbit', { wind: 1 }],
    javelin: ['w_throw', { kind: 'rise', len: 0.2 }],
    chessknight: ['w_throw', { kind: 'clack', wood: 1 }],
    beartrap: ['w_mine', { set: 1 }],
    thunderdrum: ['w_zap', { drum: 1 }],
    firecracker: ['w_crackle', {}],
    icicle: ['w_frost', { short: 1 }],
    slingshot: ['w_throw', { kind: 'sling' }],
    skyrocket: ['w_throw', { kind: 'whistle' }]
  };
  SFX.WEAPON_TYPE = {
    melee: 'knightsword', shot: 'javelin', bounce: 'juggle', boomerang: 'falcon', shotgun: 'trickknives', chain: 'pigeons', axe: 'fryingpan',
    mine: 'gravecandle', puddle: 'paintbucket', aura: 'hymn', orbit: 'toyguard', trail: 'thornvine', tether: 'rod', flame: 'lanternbeam', ring: 'bronzebell'
  };
  // 每把武器的参数对象只建一次（出手时不新建对象）；超武一份、普通一份
  var WC = {};
  SFX.weaponOpts = function (w) {
    var key = w.id + (w.evo ? '*' : '');
    var c = WC[key];
    if (c) return c;
    var m = SFX.WEAPON[w.id] || SFX.WEAPON[SFX.WEAPON_TYPE[w.def && w.def.type] || ''] || SFX.WEAPON.knightsword;
    var o = { key: 'w:' + w.id, evo: !!w.evo, vol: w.evo ? 1.15 : 1 };
    for (var k in m[1]) o[k] = m[1][k];
    c = WC[key] = { name: m[0], o: o };
    return c;
  };

  // ---------------- 第 5 块：骑士被动的两个新声音（audio_hooks.js 的 SFX.PASSIVE） ----------------
  // 猫叫：锯齿波往上滑再往下落，过两个跟着走的共振峰（700 → 1100 → 600 赫兹）
  D('p_meow', { gap: 0.2, grp: 'misc', vol: 0.32, wet: 0.2 }, function (t, k) {
    var end = t + 0.36, os = S.osc(t, 'sawtooth', 520 * k, end), g = S.env(t, 0.9, 0.04, 0.35, 0.08);
    os.frequency.setValueAtTime(520 * k, t); os.frequency.linearRampToValueAtTime(760 * k, t + 0.12); os.frequency.exponentialRampToValueAtTime(430 * k, t + 0.34);
    var f1 = S.filt(t, 'bandpass', 700, 4), f2 = S.filt(t, 'bandpass', 1400, 5), g2 = S.gain(0.5);
    f1.frequency.linearRampToValueAtTime(1100, t + 0.14); f1.frequency.exponentialRampToValueAtTime(600, t + 0.34);
    f2.frequency.linearRampToValueAtTime(2200, t + 0.14); f2.frequency.exponentialRampToValueAtTime(1200, t + 0.34);
    os.connect(f1); os.connect(f2); f1.connect(g); f2.connect(g2); g2.connect(g); g.connect(S.out());
  });
  // 小丑的喇叭：方波 330 赫兹，每秒抖 7 下
  D('p_honk', { gap: 0.2, grp: 'misc', vol: 0.22, wet: 0.15 }, function (t, k) {
    S.tone(t, 'square', 330 * k, 0.25, 0.7, { vib: 7, vd: 80, vdl: 0.01, lp: 1800, a: 0.01 });
    S.tone(t, 'square', 165 * k, 0.22, 0.25, { vib: 7, vd: 80, vdl: 0.01, lp: 900, a: 0.01 });
  });
  CS('p_meow', { len: 0.4 });
  CS('p_honk', { len: 0.3 });
  // 熊骑士发怒（r1 修）：低沉的喉音往上冲（锯齿 70 → 125 赫兹，粗糙的快抖）+ 喘气 + 一声往上走的亮音（变强了）
  // 不用狼嚎（那是敌人的警告声），也不用熊吼（熊骑士自己的武器声）
  D('p_growl', { gap: 0.2, grp: 'misc', vol: 0.3, wet: 0.2 }, function (t, k) {
    S.tone(t, 'sawtooth', 70 * k, 0.5, 0.6, { f1: 125 * k, sw: 0.35, lp: 650, vib: 14, vd: 10, vdl: 0.01, a: 0.04 });
    S.nz(t, 0.42, 0.3, { type: 'bp', f: 380, q: 1.1, f2: 720, fsw: 0.35, kind: 'pink', a: 0.04 });
    S.tone(t + 0.22, 'triangle', 330 * k, 0.3, 0.22, { f1: 660 * k, sw: 0.24, a: 0.02 });
  });
  CS('p_growl', { len: 0.6 });
  // 渔夫钓上一条鱼（收尾）：水里「啵」一声（正弦 900 → 260 赫兹）+ 一小下溅水 + 两下往上走的木质「嗒嗒」（进了鱼篓）
  // 不再借拾取金币的声音
  D('p_catch', { gap: 0.15, grp: 'misc', vol: 0.3, wet: 0.2 }, function (t, k) {
    S.tone(t, 'sine', 900 * k, 0.11, 0.8, { f1: 260 * k, sw: 0.09, a: 0.003 });
    S.nz(t + 0.01, 0.08, 0.3, { type: 'bp', f: 2600, q: 1.3, f2: 1300, fsw: 0.08 });
    S.tone(t + 0.12, 'triangle', 660 * k, 0.06, 0.32, { lp: 3000 });
    S.tone(t + 0.18, 'triangle', 880 * k, 0.08, 0.28, { lp: 3500 });
  });
  CS('p_catch', { len: 0.32 });
  // 占星骑士换星座（收尾）：五个往上走的 FM 铃音 + 一点高频沙沙（和原来借的神龛声一样；神龛声第 7 块删了）
  D('p_star', { gap: 0.5, grp: 'misc', vol: 0.323, wet: 0.45 }, function (t, k) {
    [523, 659, 784, 988, 1175].forEach(function (f, i) { S.fm(t + i * 0.05, f * k, 3.5, 1.2, 1.2, 0.3); });
    S.nz(t, 1, 0.12, { type: 'hp', f: 6000, a: 0.3 });
  });
  // ---------- 第 6 块：宝物的四个新声音（别的宝物借现有的配方，SFX.PASSIVE 的 r_ 行） ----------
  // 铜号角：两个铜管音往上走（锯齿 392 → 523 赫兹，低通 1400，带一点颤音）+ 低八度垫底；不是敌人的号声
  D('r_bugle', { gap: 0.3, grp: 'misc', vol: 0.17, wet: 0.3 }, function (t, k) {
    S.tone(t, 'sawtooth', 392 * k, 0.17, 0.5, { lp: 1400, a: 0.02, vib: 6, vd: 12, vdl: 0.04 });
    S.tone(t + 0.15, 'sawtooth', 523 * k, 0.3, 0.62, { lp: 1400, a: 0.02, hold: 0.1, vib: 6, vd: 16, vdl: 0.06 });
    S.tone(t + 0.15, 'square', 261.6 * k, 0.28, 0.12, { lp: 800, a: 0.02, hold: 0.08 });
  });
  CS('r_bugle', { len: 0.5 });
  // 龙吼战鼓：三下低沉的鼓（70 / 70 / 55 赫兹往下滑）+ 每下一声皮面的噪声拍；混响大一点。不是 Boss 的 war_drums
  D('r_drum', { gap: 0.5, grp: 'misc', vol: 0.2, wet: 0.4 }, function (t, k) {
    [[0, 70, 0.75], [0.17, 70, 0.75], [0.38, 55, 0.95]].forEach(function (h) {
      S.tone(t + h[0], 'sine', h[1] * 1.9 * k, 0.32, h[2], { f1: h[1] * k, sw: 0.08, a: 0.002 });
      S.nz(t + h[0], 0.07, 0.32, { type: 'bp', f: 900, q: 0.8, f2: 300, fsw: 0.06, kind: 'pink' });
    });
  });
  CS('r_drum', { len: 0.8 });
  // 猎犬扑咬：两声短促的「汪汪」（方波 420 → 300 赫兹，带通 900）+ 一点气声；不是狼嚎
  D('r_bark', { gap: 0.25, grp: 'misc', vol: 0.28, wet: 0.15 }, function (t, k) {
    [0, 0.12].forEach(function (d, i) {
      S.tone(t + d, 'square', 420 * k * (i ? 0.94 : 1), 0.08, 0.6, { f1: 300 * k, sw: 0.07, bp: 900, q: 1.4, a: 0.004 });
      S.nz(t + d, 0.05, 0.18, { type: 'bp', f: 1400, q: 1.2 });
    });
  });
  CS('r_bark', { len: 0.25 });
  // 渡鸦出发：两声沙哑的「嘎」（锯齿 620 → 480 赫兹 + 快速的粗糙颤音 + 带通噪声）；不是敌人的尖叫
  D('r_caw', { gap: 0.3, grp: 'misc', vol: 0.24, wet: 0.2 }, function (t, k) {
    [0, 0.17].forEach(function (d) {
      S.tone(t + d, 'sawtooth', 620 * k, 0.14, 0.5, { f1: 480 * k, sw: 0.12, bp: 1300, q: 2, vib: 38, vd: 60, vdl: 0.005, a: 0.008 });
      S.nz(t + d, 0.13, 0.3, { type: 'bp', f: 1800, q: 2.5, f2: 1200, fsw: 0.12 });
    });
  });
  CS('r_caw', { len: 0.38 });
})();
