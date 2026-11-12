'use strict';
// ============================================================
//  声音引擎（全局 SFX；浏览器自带的 window.Audio 是别的东西，不要撞名）
//  音效和音乐全部用 Web Audio 现场合成：振荡器、噪声、滤波、包络、简单 FM、程序生成的混响。没有音频文件，不联网
//  · 第一次触摸 / 点击 / 按键时才创建 AudioContext（iPad 只允许在手势里启动声音）；
//    没有 Web Audio、还没解锁、页面隐藏或被系统打断时，所有调用都是空操作：不报错、不排队
//  · 音效限流：每种声音有最短间隔，同一组同时发声有上限，总发声数有上限，音高带一点随机
//  · 音乐：按 AudioContext 时间提前排音符的调度器；曲子之间交叉淡化；弹窗时压低，暂停时停下
//  · 设置：音乐 / 音效音量 0~100 和静音，存在 localStorage 'knight_magic_audio'
//  音效配方在 audio_sfx.js，曲子在 audio_songs.js，接到游戏上的钩子在 audio_hooks.js
// ============================================================
var SFX = {
  KEY: 'knight_magic_audio',
  vol: { music: 60, sfx: 80, muted: false },
  ok: !!(window.AudioContext || window.webkitAudioContext),
  ctx: null, R: null, bus: null,
  unlocked: false, running: false, live: false, musicLive: false, hidden: false,
  // 同时发声上限：普通声音 MAX_VOICES，重要的声音（pri >= 2）最多到 HARD_VOICES
  MAX_VOICES: 24, HARD_VOICES: 32,
  // 每组同时发声上限
  GROUPS: { hit: 4, kill: 4, wpn: 7, boom: 3, pick: 3, ui: 4, ply: 4, enemy: 3, big: 5, misc: 5, loop: 3, use: 3 },
  DEFS: {}, SONGS: {}, STINGS: {}, LAYERS: {},
  last: {}, voices: [], groupN: {}, junk: [], errors: [],
  stats: { req: 0, played: 0, limited: 0, capped: 0, maxVoices: 0, byName: {}, notes: 0, stingers: [], cached: 0, cacheKeys: 0 }
};

// ---------------- 设置存取 ----------------
SFX.load = function () {
  try {
    var s = JSON.parse(localStorage.getItem(SFX.KEY) || '{}');
    if (typeof s.music === 'number') SFX.vol.music = Math.max(0, Math.min(100, Math.round(s.music)));
    if (typeof s.sfx === 'number') SFX.vol.sfx = Math.max(0, Math.min(100, Math.round(s.sfx)));
    if (typeof s.muted === 'boolean') SFX.vol.muted = s.muted;
  } catch (e) { /* 读不到就用默认值 */ }
};
SFX.save = function () {
  try { localStorage.setItem(SFX.KEY, JSON.stringify({ music: SFX.vol.music, sfx: SFX.vol.sfx, muted: SFX.vol.muted })); } catch (e) { /* 存不了就算了 */ }
};
SFX.load();

// 引擎内部出错只记下来（不往控制台报错），测试会检查 SFX.errors 是空的
SFX.err = function (e) {
  if (SFX.errors.length < 20) SFX.errors.push(String(e && e.message || e));
};

// 音量滑条 0~100 → 增益（听感上更均匀）
SFX.gainOf = function (v) { return Math.pow(Math.max(0, Math.min(100, v)) / 100, 1.6); };
// 音乐 / 音效总线的整体系数（滑条拉满时）：音效要压得过音乐
SFX.MUSIC_K = 0.6;
SFX.SFX_K = 1.6;
SFX.mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

(function () {
  // 当前合成用的上下文 / 资源 / 输出节点 / 这次声音创建的节点（结束后统一断开）
  var A = null, R = null, OUT = null, NODES = null, END = 0, NO = {}, LOOPP = null;

  // ---------------- 每个上下文一份的资源：噪声、波形、混响脉冲 ----------------
  function periodic(c, amps) {
    var re = new Float32Array(amps.length), im = new Float32Array(amps.length);
    for (var i = 1; i < amps.length; i++) im[i] = amps[i];
    return c.createPeriodicWave(re, im);
  }
  function makeIR(c, secs) {
    var sr = c.sampleRate, n = Math.floor(sr * secs), pre = Math.floor(sr * 0.012);
    var buf = c.createBuffer(2, n, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), y = 0;
      for (var i = pre; i < n; i++) {
        var t = (i - pre) / sr;
        // 指数衰减的噪声，一阶低通让尾巴暗一点（越往后越暗）
        var x = (Math.random() * 2 - 1) * Math.exp(-6.9 * t / secs);
        var k = 0.55 - 0.4 * Math.min(1, t / secs);
        y += k * (x - y);
        d[i] = y;
      }
      // 早期反射
      for (var r = 0; r < 7; r++) {
        var at = pre + Math.floor(sr * (0.006 + Math.random() * 0.06));
        if (at < n) d[at] += (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.35);
      }
    }
    return buf;
  }
  function makeRes(c) {
    var sr = c.sampleRate, n = Math.floor(sr * 1.5);
    var white = c.createBuffer(1, n, sr), pink = c.createBuffer(1, n, sr), brown = c.createBuffer(1, n, sr);
    var w = white.getChannelData(0), p = pink.getChannelData(0), b = brown.getChannelData(0);
    var b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, br = 0;
    for (var i = 0; i < n; i++) {
      var x = Math.random() * 2 - 1;
      w[i] = x;
      b0 = 0.99886 * b0 + x * 0.0555179; b1 = 0.99332 * b1 + x * 0.0750759; b2 = 0.969 * b2 + x * 0.153852;
      b3 = 0.8665 * b3 + x * 0.3104856; b4 = 0.55 * b4 + x * 0.5329522; b5 = -0.7616 * b5 - x * 0.016898;
      p[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362) * 0.11;
      b6 = x * 0.115926;
      br = (br + 0.02 * x) / 1.02;
      b[i] = br * 3.5;
    }
    // 软削波曲线：|x| < 0.6 原样，往上平滑地压到 0.9 以内
    var cn = 2049, clip = new Float32Array(cn);
    for (i = 0; i < cn; i++) {
      var xx = i / (cn - 1) * 2 - 1, ax = Math.abs(xx);
      clip[i] = ax < 0.6 ? xx : (xx < 0 ? -1 : 1) * (0.6 + 0.3 * Math.tanh((ax - 0.6) / 0.3));
    }
    return {
      white: white, pink: pink, brown: brown, ir: makeIR(c, 1.9), clip: clip, waves: makeWaves(c)
    };
  }
  // 自定义波形（每个上下文要自己建一份）
  function makeWaves(c) {
    return {
      organ: periodic(c, [0, 1, 0.62, 0.34, 0.24, 0.08, 0.13, 0.03, 0.07]),
      nasal: periodic(c, [0, 0.7, 0.95, 0.8, 0.9, 0.62, 0.5, 0.42, 0.3, 0.22, 0.16, 0.1]),
      horn: periodic(c, [0, 1, 0.72, 0.5, 0.36, 0.24, 0.15, 0.09, 0.05]),
      clar: periodic(c, [0, 1, 0, 0.48, 0, 0.26, 0, 0.13, 0, 0.06])
    };
  }

  // ---------------- 总线：音乐（声部 → 交叉淡化 → 压低 → 音量 → 低血量闷声）+ 音效 + 混响 → 主音量 → 限幅 ----------------
  function buildBus(c, res, dest) {
    var g = function (v) { var n = c.createGain(); n.gain.value = v; return n; };
    var b = {};
    b.master = g(1);
    b.lim = c.createDynamicsCompressor();
    b.lim.threshold.value = -10; b.lim.knee.value = 6; b.lim.ratio.value = 16; b.lim.attack.value = 0.002; b.lim.release.value = 0.16;
    // 最后一道软削波：压缩器来不及压的尖峰也不会超过 0.9（不会爆音）
    b.clip = c.createWaveShaper();
    b.clip.curve = res.clip;
    b.master.connect(b.lim); b.lim.connect(b.clip); b.clip.connect(dest);
    b.revIn = g(1);
    b.conv = c.createConvolver();
    b.conv.buffer = res.ir;
    b.revOut = g(0.9);
    b.revIn.connect(b.conv); b.conv.connect(b.revOut); b.revOut.connect(b.master);
    // 音乐
    b.music = g(1);
    b.lp = c.createBiquadFilter(); b.lp.type = 'lowpass'; b.lp.frequency.value = 20000; b.lp.Q.value = 0.5;
    b.music.connect(b.lp); b.lp.connect(b.master);
    b.musRev = g(0.2); b.lp.connect(b.musRev); b.musRev.connect(b.revIn);
    b.duck = g(1); b.duck.connect(b.music);          // 弹窗压低 / 暂停
    b.track = g(1); b.track.connect(b.duck);         // 插曲时压低正在放的曲子
    b.sting = g(1); b.sting.connect(b.music);        // 插曲（升级、超武觉醒、胜利……）不受弹窗压低影响
    // 音效
    b.sfx = g(1); b.sfx.connect(b.master);
    b.sfxWet = g(1); b.sfxWet.connect(b.revIn);
    return b;
  }

  // ---------------- 创建 / 解锁（只在手势里调用） ----------------
  SFX.create = function () {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { SFX.ok = false; return null; }
    // iOS：「环境声音」——和别的 App 的音乐混在一起，静音开关打开时不出声
    try { if (navigator.audioSession && 'type' in navigator.audioSession) navigator.audioSession.type = 'ambient'; } catch (e) { /* 旧系统没有 */ }
    var c;
    try { c = new AC({ latencyHint: 'interactive' }); } catch (e) {
      try { c = new AC(); } catch (e2) { SFX.ok = false; SFX.err(e2); return null; }
    }
    SFX.ctx = c;
    try {
      SFX.R = makeRes(c);
      SFX.bus = buildBus(c, SFX.R, c.destination);
    } catch (e) { SFX.err(e); SFX.ok = false; SFX.ctx = null; try { c.close(); } catch (e3) { /* 忽略 */ } return null; }
    var onState = function () { SFX.refresh(); };
    if (c.addEventListener) c.addEventListener('statechange', onState); else c.onstatechange = onState;
    SFX.applyVol(true);
    if (!SFX.timer) SFX.timer = setInterval(SFX.tick, 50);
    return c;
  };

  SFX.unlock = function () {
    if (!SFX.ok) return;
    try {
      var c = SFX.ctx || SFX.create();
      if (!c) return;
      if (!SFX.unlocked) {
        SFX.unlocked = true;
        setTimeout(function () { try { SFX.prewarm(SFX.PREWARM || []); } catch (e) { SFX.err(e); } }, 300);
        // iOS 老办法：在手势里放一个 1 帧的静音缓冲，彻底打开声音
        var sb = c.createBufferSource();
        sb.buffer = c.createBuffer(1, 1, c.sampleRate);
        sb.connect(c.destination);
        sb.start(0);
      }
      if (c.state !== 'running' && c.state !== 'closed' && !SFX.hidden) {
        SFX.resumeT = Date.now();
        var pr = c.resume();
        if (pr && pr.then) pr.then(SFX.refresh, function () { SFX.resumeT = 0; SFX.refresh(); });
      }
    } catch (e) { SFX.err(e); }
    SFX.refresh();
  };

  // 状态变化时重新算：能不能出声（热路径只看 SFX.live 一个布尔值）
  SFX.refresh = function () {
    var c = SFX.ctx, st = c ? c.state : 'none';
    // 刚在手势里调用 resume、还没真正跑起来的那一小会儿也算能出声（声音会在启动时立刻响）
    var pending = st === 'suspended' && SFX.resumeT && Date.now() - SFX.resumeT < 1000 && !SFX.hidden;
    SFX.running = !!c && !SFX.hidden && (st === 'running' || !!pending);
    SFX.live = SFX.running && !SFX.vol.muted && SFX.vol.sfx > 0;
    SFX.musicLive = SFX.running && !SFX.vol.muted && SFX.vol.music > 0;
  };

  // 音量 → 总线（instant：创建时直接设，不渐变）
  SFX.applyVol = function (instant) {
    var b = SFX.bus, c = SFX.ctx;
    SFX.refresh();
    if (!b || !c) return;
    var v = SFX.vol, now = c.currentTime;
    var set = function (p, x) { if (instant) p.value = x; else { p.cancelScheduledValues(now); p.setTargetAtTime(x, now, 0.03); } };
    set(b.master.gain, v.muted ? 0 : 1);
    set(b.music.gain, SFX.gainOf(v.music) * SFX.MUSIC_K);
    var s = SFX.gainOf(v.sfx) * SFX.SFX_K;
    set(b.sfx.gain, s); set(b.sfxWet.gain, s);
  };

  SFX.setVolume = function (kind, val) {
    if (kind !== 'music' && kind !== 'sfx') return;
    SFX.vol[kind] = Math.max(0, Math.min(100, Math.round(+val || 0)));
    SFX.applyVol(false);
    SFX.syncUI();
  };
  SFX.setMuted = function (on) {
    SFX.vol.muted = !!on;
    SFX.applyVol(false);
    SFX.syncUI();
    SFX.save();
  };

  // 手势：第一次就创建并启动；以后只在声音被挂起（iOS 打断、切回来）时恢复
  SFX.onGesture = function () {
    if (!SFX.ok) return;
    var c = SFX.ctx;
    if (c && c.state === 'running') return;
    SFX.unlock();
  };
  ['pointerup', 'touchend', 'mouseup', 'click', 'keydown'].forEach(function (ev) {
    window.addEventListener(ev, SFX.onGesture, { capture: true, passive: true });
  });

  // 页面隐藏（切到别的 App、锁屏、切标签页）：整个声音挂起；回来时恢复（iOS 恢复不了就等下一次触摸）
  SFX.onVisible = function () {
    var hid = document.visibilityState === 'hidden';
    SFX.hidden = hid;
    var c = SFX.ctx;
    if (c) {
      try {
        if (hid) { if (c.state === 'running') { var p = c.suspend(); if (p && p.catch) p.catch(function () {}); } }
        else if (c.state !== 'running' && c.state !== 'closed') { var q = c.resume(); if (q && q.then) q.then(SFX.refresh, function () { /* 等下一次手势 */ }); }
      } catch (e) { SFX.err(e); }
    }
    SFX.refresh();
  };
  document.addEventListener('visibilitychange', SFX.onVisible);
  window.addEventListener('pagehide', function () { SFX.hidden = true; var c = SFX.ctx; if (c && c.state === 'running') { try { c.suspend(); } catch (e) { /* 忽略 */ } } SFX.refresh(); });
  window.addEventListener('pageshow', function () { if (document.visibilityState !== 'hidden') SFX.onVisible(); });

  // ---------------- 合成积木（都在时刻 t 开始，接到 OUT） ----------------
  var S = SFX.S = {};
  S.ctx = function () { return A; };
  S.out = function () { return OUT; };
  S.reg = function (n) { NODES.push(n); return n; };
  S.until = function (t) { if (t > END) END = t; };
  S.gain = function (v) { var g = A.createGain(); g.gain.value = v; NODES.push(g); return g; };

  // 一次性包络：a 秒升到 peak，保持 hold 秒，然后指数衰减，到 t+len 时基本无声
  S.env = function (t, peak, a, len, hold) {
    var g = A.createGain(), p = g.gain;
    NODES.push(g);
    a = Math.max(0.001, a || 0.003);
    var h = t + a + (hold || 0);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(Math.max(0.0002, peak), t + a);
    if (hold) p.setValueAtTime(Math.max(0.0002, peak), h);
    p.exponentialRampToValueAtTime(0.0001, Math.max(h + 0.01, t + len));
    if (t + len > END) END = t + len;
    return g;
  };
  // 持续音：起音 a，衰减到 sus（d 是时间常数量级），t+dur 开始释放 rel 秒
  S.adsr = function (t, peak, a, d, sus, dur, rel) {
    var g = A.createGain(), p = g.gain;
    NODES.push(g);
    a = Math.max(0.002, a);
    var off = t + Math.max(dur, a + 0.01);
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.setTargetAtTime(peak * sus, t + a, Math.max(0.01, d / 3));
    p.setTargetAtTime(0.0001, off, Math.max(0.01, rel / 4));
    if (off + rel * 1.6 > END) END = off + rel * 1.6;
    return g;
  };
  // 滤波器：f 起点，f2/sw 指数滑到 f2
  S.filt = function (t, type, f, q, f2, sw) {
    var fl = A.createBiquadFilter();
    NODES.push(fl);
    fl.type = type;
    fl.frequency.setValueAtTime(Math.max(20, Math.min(20000, f)), t);
    if (q != null) fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(Math.max(20, Math.min(20000, f2)), t + (sw || 0.1));
    return fl;
  };
  // 振荡器：wave 是 sine/square/sawtooth/triangle 或 R.waves 里的名字；o.f1/o.sw 滑音，o.from/o.gl 从别的音滑进来，o.det 音分
  S.osc = function (t, wave, f, stopT, o) {
    var os = A.createOscillator();
    NODES.push(os);
    if (R.waves[wave]) os.setPeriodicWave(R.waves[wave]); else os.type = wave;
    o = o || NO;
    if (o.from) {
      os.frequency.setValueAtTime(Math.max(5, o.from), t);
      os.frequency.exponentialRampToValueAtTime(Math.max(5, f), t + (o.gl || 0.05));
    } else os.frequency.setValueAtTime(Math.max(5, f), t);
    if (o.f1) os.frequency.exponentialRampToValueAtTime(Math.max(5, o.f1), t + (o.sw || 0.1));
    if (o.det) os.detune.setValueAtTime(o.det, t);
    os.start(t);
    os.stop(stopT);
    if (stopT > END) END = stopT;
    return os;
  };
  // 噪声源（循环，随机起点，每次不一样）
  S.noise = function (t, stopT, kind) {
    var s = A.createBufferSource();
    NODES.push(s);
    s.buffer = kind === 'pink' ? R.pink : kind === 'brown' ? R.brown : R.white;
    s.loop = true;
    s.start(t, Math.random() * 1.2);
    s.stop(stopT);
    if (stopT > END) END = stopT;
    return s;
  };
  // 颤音：LFO 接到振荡器的 detune（音分），delay 秒后才慢慢出来
  S.vib = function (t, stopT, rate, cents, delay, list) {
    var l = A.createOscillator(), g = A.createGain();
    NODES.push(l); NODES.push(g);
    l.frequency.value = rate;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(cents, t + (delay || 0.2) + 0.15);
    l.connect(g);
    for (var i = 0; i < list.length; i++) g.connect(list[i].detune);
    l.start(t); l.stop(stopT);
    return l;
  };

  // 一个音：振荡器 →（滤波）→ 包络 → OUT
  // o: f1/sw 滑音，a 起音，hold，det，lp/hp/bp 滤波频率，q，f2/fsw 滤波滑动，vib/vd 颤音，to 输出节点
  S.tone = function (t, wave, f, dur, amp, o) {
    o = o || NO;
    var os = S.osc(t, wave, f, t + dur + 0.03, o);
    var g = S.env(t, amp, o.a || 0.004, dur, o.hold);
    var head = os;
    if (o.lp || o.hp || o.bp) {
      var fl = S.filt(t, o.lp ? 'lowpass' : o.hp ? 'highpass' : 'bandpass', o.lp || o.hp || o.bp, o.q, o.f2, o.fsw || dur);
      os.connect(fl); head = fl;
    }
    if (o.vib) S.vib(t, t + dur + 0.03, o.vib, o.vd || 20, o.vdl || 0.05, [os]);
    head.connect(g); g.connect(o.to || OUT);
    return os;
  };
  // 一段噪声：o.type lp/hp/bp，f，q，f2/fsw 滤波滑动，a 起音，hold，kind white/pink/brown
  S.nz = function (t, dur, amp, o) {
    o = o || NO;
    var s = S.noise(t, t + dur + 0.03, o.kind);
    var g = S.env(t, amp, o.a || 0.003, dur, o.hold);
    var head = s;
    if (o.f) {
      var fl = S.filt(t, o.type === 'hp' ? 'highpass' : o.type === 'lp' ? 'lowpass' : 'bandpass', o.f, o.q != null ? o.q : 1, o.f2, o.fsw || dur);
      s.connect(fl); head = fl;
    }
    head.connect(g); g.connect(o.to || OUT);
    return s;
  };
  // FM 铃 / 金属声：载波 f，调制 f*ratio，调制指数从 idx 衰减到 idx1
  S.fm = function (t, f, ratio, idx, dur, amp, o) {
    o = o || NO;
    var end = t + dur + 0.03;
    var car = S.osc(t, 'sine', f, end, o.f1 ? { f1: o.f1, sw: o.sw || dur } : null);
    var mod = S.osc(t, o.mw || 'sine', f * ratio, end);
    var mg = A.createGain();
    NODES.push(mg);
    mg.gain.setValueAtTime(f * idx, t);
    mg.gain.exponentialRampToValueAtTime(Math.max(0.01, f * (o.idx1 != null ? o.idx1 : idx * 0.08)), t + dur);
    mod.connect(mg); mg.connect(car.frequency);
    var g = S.env(t, amp, o.a || 0.002, dur);
    car.connect(g); g.connect(o.to || OUT);
    return car;
  };
  // 很短的“嗒”（按钮、齿轮、木头）
  S.click = function (t, amp, f) {
    S.nz(t, 0.012, amp, { type: 'hp', f: f || 3000, q: 0.7 });
  };
  // 和弦（同一种积木叠几个音）
  S.chord = function (fn, t, list, a, b, c, d) {
    for (var i = 0; i < list.length; i++) fn(t, list[i], a, b, c, d);
  };

  // ---------------- 音效：播放、限流、发声上限、清理 ----------------
  function killNodes(ns) {
    for (var j = 0; j < ns.length; j++) { try { ns[j].disconnect(); } catch (e) { /* 已经断开 */ } }
  }
  function sweepVoices(now) {
    var vs = SFX.voices;
    for (var i = vs.length - 1; i >= 0; i--) {
      var v = vs[i];
      if (v.end > now) continue;
      v.dead = true;
      killNodes(v.nodes);
      SFX.groupN[v.grp]--;
      vs[i] = vs[vs.length - 1]; vs.pop();
    }
  }
  function sweepJunk(now) {
    var js = SFX.junk;
    for (var i = js.length - 1; i >= 0; i--) {
      if (js[i].end > now) continue;
      killNodes(js[i].nodes);
      js[i] = js[js.length - 1]; js.pop();
    }
  }
  SFX.sweep = function (now) { sweepVoices(now); sweepJunk(now); };

  // 世界坐标 → 左右声像和距离衰减（相对玩家和镜头朝向）
  SFX.spatial = function (x, z, out) {
    out.pan = 0; out.att = 1;
    if (typeof P === 'undefined' || !P.pos) return out;
    var dx = x - P.pos.x, dz = z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    out.att = d < 12 ? 1 : Math.max(0.18, 1 - (d - 12) / 46);
    if (d > 1) out.pan = Math.max(-1, Math.min(1, (dx * -Math.cos(P.yaw) + dz * Math.sin(P.yaw)) / d)) * Math.min(1, d / 10) * 0.7;
    return out;
  };
  var SP = { pan: 0, att: 1 };

  // 播放一个音效。o：x/z 世界位置，vol 音量倍数，pitch 音高倍数，delay 延后秒数，key 限流用的键，其余是配方自己的参数
  // 游戏代码（命中、击杀、跳跃……）直接调用它：绝不能把异常抛回去（比如坐标是 NaN 时设音量会抛错）
  SFX.play = function (name, o) {
    if (!SFX.live) return null;
    try { return play1(name, o); } catch (e) {
      if (NODES) killNodes(NODES);
      NODES = null; OUT = null; LOOPP = null;
      SFX.err(e);
      return null;
    }
  };
  function play1(name, o) {
    var d = SFX.DEFS[name];
    if (!d) return null;
    var c = SFX.ctx;
    // 被系统打断 / 挂起时不排：恢复时会一下子全响
    if (c.state !== 'running' && !(SFX.resumeT && Date.now() - SFX.resumeT < 1000)) return null;
    o = o || NO;
    var now = c.currentTime, st = SFX.stats, key = o.key || name;
    st.req++;
    if (now - (SFX.last[key] == null ? -1e9 : SFX.last[key]) < (d.gap || 0)) { st.limited++; return null; }
    var g = d.grp || 'misc', cap = SFX.GROUPS[g] || 4, pri = d.pri || 0;
    var lim = pri >= 2 ? SFX.HARD_VOICES : SFX.MAX_VOICES;
    if (SFX.voices.length >= lim || (SFX.groupN[g] || 0) >= cap) {
      sweepVoices(now);
      if (SFX.voices.length >= lim || (SFX.groupN[g] || 0) >= cap) { st.capped++; return null; }
    }
    var vol = (d.vol == null ? 0.5 : d.vol) * (o.vol == null ? 1 : o.vol), pan = 0;
    if (o.x != null && o.z != null) { SFX.spatial(o.x, o.z, SP); vol *= SP.att; pan = SP.pan; }
    if (!(vol >= 0.004)) return null;   // 也挡住 NaN
    if (!(pan >= -1 && pan <= 1)) pan = 0;
    SFX.last[key] = now;
    A = c; R = SFX.R; NODES = []; END = 0;
    var t = now + 0.006 + (o.delay || 0);
    var vg = c.createGain();
    vg.gain.value = vol;
    NODES.push(vg);
    if (pan && c.createStereoPanner) {
      var pn = c.createStereoPanner();
      pn.pan.value = pan;
      NODES.push(pn);
      vg.connect(pn); pn.connect(SFX.bus.sfx);
    } else vg.connect(SFX.bus.sfx);
    var wet = o.wet != null ? o.wet : d.wet;
    if (wet > 0) { var wg = c.createGain(); wg.gain.value = wet; NODES.push(wg); vg.connect(wg); wg.connect(SFX.bus.sfxWet); }
    OUT = vg;
    LOOPP = d.loop ? {} : null;
    var k = (o.pitch || 1) * (d.jit ? Math.pow(2, (Math.random() * 2 - 1) * d.jit / 12) : 1);
    // 常用的短音效：第一次用时在后台离线合成几份存成缓冲，以后只放缓冲（一个节点，比现场合成便宜得多）
    var cc = d.cache, bufs = null;
    if (cc && !SFX.noCache && SFX.cacheOk) {
      var lvl = cc.key ? cc.key(o) : '', ck = name + '|' + lvl;
      bufs = CACHE[ck];
      if (!bufs) queueCache(name, ck, lvl, o);
    }
    if (bufs) {
      var src = c.createBufferSource(), rate = k * (cc.rate ? cc.rate(o) : 1);
      src.buffer = bufs[(Math.random() * bufs.length) | 0];
      src.playbackRate.value = rate;
      if (cc.vol) vg.gain.value = vol * cc.vol(o);
      src.connect(vg);
      src.start(t);
      NODES.push(src);
      END = t + src.buffer.duration / rate;
      SFX.stats.cached++;
    } else {
      try { d.fn(t, k, o); } catch (e) { SFX.err(e); }
    }
    var v = { name: name, grp: g, end: Math.max(END, t + 0.05) + 0.06, nodes: NODES, out: vg, dead: false, p: LOOPP };
    if (d.loop) v.end = Infinity;
    NODES = null; OUT = null; LOOPP = null;
    SFX.voices.push(v);
    SFX.groupN[g] = (SFX.groupN[g] || 0) + 1;
    st.played++;
    st.byName[name] = (st.byName[name] || 0) + 1;
    if (SFX.voices.length > st.maxVoices) st.maxVoices = SFX.voices.length;
    return v;
  }

  // ---------------- 音效缓存：离线合成（在音频线程上，不卡游戏），每种存 2~3 份变化 ----------------
  var CACHE = SFX.CACHE = {}, CQ = [], CPEND = {}, cacheTimer = 0;
  SFX.cacheOk = !!(window.OfflineAudioContext || window.webkitOfflineAudioContext);
  var SKIP = { x: 1, z: 1, vol: 1, pitch: 1, delay: 1, key: 1, wet: 1 };
  var CMAX = 90, cN = 0;   // 最多缓存这么多种（每种 2~3 份），再多就现场合成
  function queueCache(name, ck, lvl, o) {
    if (CPEND[ck] || cN >= CMAX) return;
    CPEND[ck] = 1;
    cN++;
    var po = {}, kk, d = SFX.DEFS[name];
    for (kk in o) if (!SKIP[kk]) po[kk] = o[kk];
    if (d.cache.base) { var b = d.cache.base(lvl); for (kk in b) po[kk] = b[kk]; }
    CQ.push({ name: name, key: ck, o: po });
    if (!cacheTimer) cacheTimer = setTimeout(renderCache, 40);
  }
  SFX.prewarm = function (list) {
    if (!SFX.cacheOk || !SFX.ctx) return;
    for (var i = 0; i < list.length; i++) {
      var it = list[i], d = SFX.DEFS[it[0]];
      if (!d || !d.cache) continue;
      var o = it[1] || {}, lvl = d.cache.key ? d.cache.key(o) : '';
      queueCache(it[0], it[0] + '|' + lvl, lvl, o);
    }
  };
  // 一批：每个声音排在离线上下文里的不同时刻（一个接一个，不重叠），合成完切开存起来
  function renderCache() {
    cacheTimer = 0;
    var c = SFX.ctx;
    if (!c || !CQ.length || !SFX.cacheOk) return;
    var items = CQ.splice(0, 14), sr = c.sampleRate, slots = [];
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    var sA = A, sR = R, sO = OUT, sN = NODES, sE = END, oc, t = 0.02;
    try {
      // 先估一遍长度：每个声音按配方给的 len 留位置（排的时候按真实结束时间往后挪）
      var total = 0.1;
      items.forEach(function (it) { var d = SFX.DEFS[it.name]; total += ((d.cache.len || 0.6) * 1.6 + 0.06) * (d.cache.n || 3); });
      oc = new OAC(1, Math.ceil(sr * total), sr);
      var res = { waves: {}, white: null, pink: null, brown: null };
      ['white', 'pink', 'brown'].forEach(function (nm) {
        var src = R[nm], b = oc.createBuffer(1, src.length, sr);
        b.getChannelData(0).set(src.getChannelData(0));
        res[nm] = b;
      });
      var wv = makeWaves(oc);
      res.waves = wv;
      var out = oc.createGain();
      out.connect(oc.destination);
      A = oc; R = res; OUT = out;
      items.forEach(function (it) {
        var d = SFX.DEFS[it.name], n = d.cache.n || 3;
        for (var v = 0; v < n; v++) {
          NODES = []; END = t;
          try { d.fn(t, 1, it.o); } catch (e) { SFX.err(e); }
          var end = Math.min(END, t + (d.cache.len || 0.6) * 1.6);
          slots.push({ key: it.key, t0: t, t1: end });
          t = end + 0.04;
        }
      });
    } catch (e) {
      SFX.err(e); SFX.cacheOk = false; oc = null;
    } finally { A = sA; R = sR; OUT = sO; NODES = sN; END = sE; }
    if (!oc || t > total + 0.001) { if (oc && t > total) SFX.err('cache overflow'); return; }
    var done = false;
    var finish = function (buf) {
      if (done || !buf || !SFX.ctx) return;
      done = true;
      try {
        var data = buf.getChannelData(0);
        slots.forEach(function (sl) {
          var s0 = Math.floor(sl.t0 * sr), n = Math.max(1, Math.min(data.length - s0, Math.ceil((sl.t1 - sl.t0) * sr)));
          var b = SFX.ctx.createBuffer(1, n, sr);
          b.getChannelData(0).set(data.subarray(s0, s0 + n));
          (CACHE[sl.key] || (CACHE[sl.key] = [])).push(b);
        });
        SFX.stats.cacheKeys = Object.keys(CACHE).length;
      } catch (e) { SFX.err(e); }
      if (CQ.length && !cacheTimer) cacheTimer = setTimeout(renderCache, 40);
    };
    oc.oncomplete = function (ev) { finish(ev.renderedBuffer); };
    try {
      var pr = oc.startRendering();
      if (pr && pr.then) pr.then(finish, function (e) { SFX.err(e); });
    } catch (e) { SFX.err(e); }
  }

  // 提前收掉一个声音（循环音、Boss 激光）：fade 秒淡出（已经在更快地收的不再拖长）
  SFX.stopVoice = function (v, fade) {
    if (!v || v.dead || !SFX.ctx) return;
    var c = SFX.ctx, now = c.currentTime;
    fade = fade || 0.06;
    if (v.stopAt != null && v.stopAt <= now + fade) return;
    v.stopAt = now + fade;
    try {
      var p = v.out.gain;
      p.cancelScheduledValues(now);
      p.setValueAtTime(p.value, now);
      p.linearRampToValueAtTime(0.0001, now + fade);
    } catch (e) { /* 忽略 */ }
    for (var i = 0; i < v.nodes.length; i++) {
      var n = v.nodes[i];
      if (n.stop) { try { n.stop(now + fade + 0.02); } catch (e2) { /* 已经停了 */ } }
    }
    v.end = Math.min(v.end, now + fade + 0.08);
  };
  // 暂停、阵亡、回主菜单：正在响的音效（包括排在后面还没响的，比如 Boss 招式 3.6 秒的预警声）全部 fade 秒淡出停掉；
  // keep 里的组不动（界面的声音：按钮、暂停那一声）。不会接着放：继续以后新的声音照常响，循环音由每 50 毫秒的检查重新开。
  // 音乐和插曲不是音效（在音乐总线上），不受影响。返回收掉了几个
  SFX.hush = function (fade, keep) {
    var vs = SFX.voices, n = 0;
    if (!SFX.ctx || !vs.length) return 0;
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (v.dead || (keep && keep[v.grp])) continue;
      SFX.stopVoice(v, fade);
      n++;
    }
    return n;
  };
  // 循环音的参数（配方把 AudioParam 放进 v.p）：平滑地改到 val
  SFX.setParam = function (v, name, val, tc) {
    if (!v || v.dead || !v.p || !v.p[name] || !SFX.ctx) return;
    try { v.p[name].setTargetAtTime(val, SFX.ctx.currentTime, tc || 0.05); } catch (e) { /* 忽略 */ }
  };
  // 循环音的配方里登记可以调的参数（只在 SFX.play 调用配方期间有效）
  S.param = function (name, ap) { if (LOOPP) LOOPP[name] = ap; };

  // ---------------- 乐器（音乐用；OUT 是声部的音量节点） ----------------
  var I = SFX.INST = {};
  var lpOf = function (f, k, max) { return Math.min(max || 9000, f * k); };

  // 拨弦（鲁特琴、竖琴、乌德琴）：锯齿 / 三角波，低通从亮到暗
  I.pluck = function (t, f, dur, v, o) {
    var dec = Math.min(o.dec || 1.1, dur + (o.tail || 0.4));
    var os = S.osc(t, o.wave || 'sawtooth', f, t + dec + 0.03, o.drop ? { from: f * 1.012, gl: 0.04 } : null);
    var fl = S.filt(t, 'lowpass', lpOf(f, o.br || 9), o.q || 1.2, Math.max(f * 1.4, 240), o.fd || 0.22);
    var g = S.env(t, v, 0.003, dec);
    os.connect(fl); fl.connect(g); g.connect(OUT);
  };
  I.lute = function (t, f, dur, v, o) { I.pluck(t, f, dur, v, { wave: 'triangle', br: 14, dec: o.dec || 1.4, q: 2, fd: 0.3, tail: 0.6 }); };
  I.harp = function (t, f, dur, v, o) { I.pluck(t, f, dur, v, { wave: 'triangle', br: 7, dec: 1.8, q: 0.8, fd: 0.5, tail: 1 }); };
  I.oud = function (t, f, dur, v, o) { I.pluck(t, f, dur, v, { wave: 'sawtooth', br: 8, dec: 0.75, q: 5, fd: 0.18, tail: 0.3, drop: true }); };
  I.harpsi = function (t, f, dur, v, o) {
    var dec = Math.min(1.3, dur + 0.5), end = t + dec + 0.03;
    var a = S.osc(t, 'sawtooth', f, end), b = S.osc(t, 'square', f * 2, end, { det: 4 });
    var bg = S.gain(0.25);
    var hp = S.filt(t, 'highpass', 220, 0.7), lp = S.filt(t, 'lowpass', lpOf(f, 10, 8000), 0.9, lpOf(f, 4, 4000), 0.4);
    var g = S.env(t, v, 0.002, dec);
    a.connect(hp); b.connect(bg); bg.connect(hp); hp.connect(lp); lp.connect(g); g.connect(OUT);
  };
  I.pizz = function (t, f, dur, v, o) {
    var dec = Math.min(0.45, dur + 0.25);
    var os = S.osc(t, 'triangle', f, t + dec + 0.03);
    var fl = S.filt(t, 'lowpass', lpOf(f, 6, 3000), 1, f * 2, 0.15);
    var g = S.env(t, v, 0.004, dec);
    os.connect(fl); fl.connect(g); g.connect(OUT);
  };

  // 贝斯：锯齿 + 正弦打底，低通带一点包络
  I.bass = function (t, f, dur, v, o) {
    var end = t + dur + 0.12;
    var a = S.osc(t, o.wave || 'sawtooth', f, end), b = S.osc(t, 'sine', f, end);
    var fl = S.filt(t, 'lowpass', lpOf(f, o.br || 9, 4200), o.q || 3, f * (o.fend || 2.4), 0.14);
    var bg = S.gain(0.75);
    var g = S.adsr(t, v, 0.004, 0.12, o.sus || 0.62, dur, 0.06);
    a.connect(fl); fl.connect(g); b.connect(bg); bg.connect(g); g.connect(OUT);
  };
  I.softbass = function (t, f, dur, v, o) {
    var end = t + dur + 0.25;
    var a = S.osc(t, 'triangle', f, end), b = S.osc(t, 'sine', f, end);
    var fl = S.filt(t, 'lowpass', lpOf(f, 4, 1800), 0.8);
    var bg = S.gain(0.6);
    var g = S.adsr(t, v, 0.01, 0.3, 0.7, dur, 0.15);
    a.connect(fl); fl.connect(g); b.connect(bg); bg.connect(g); g.connect(OUT);
  };

  // 竖笛 / 长笛：三角波 + 一点二次谐波，颤音慢慢出来，开头带一口气
  I.flute = function (t, f, dur, v, o) {
    var end = t + dur + 0.16, gl = o.pf && o.slide ? { from: o.pf, gl: 0.06 } : null;
    var a = S.osc(t, 'triangle', f, end, gl), b = S.osc(t, 'sine', f * 2, end, gl ? { from: o.pf * 2, gl: 0.06 } : null);
    S.vib(t, end, o.vr || 5.4, o.vd || 9, 0.18, [a, b]);
    var bg = S.gain(0.16);
    var lp = S.filt(t, 'lowpass', lpOf(f, 5, 7500), 0.7);
    var g = S.adsr(t, v, 0.035, 0.18, 0.82, dur, 0.09);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(OUT);
    var br = Math.min(dur, 0.28);
    var n = S.noise(t, t + br + 0.04), nb = S.filt(t, 'bandpass', lpOf(f, 2, 9000), 1.3), ng = S.env(t, v * 0.1, 0.02, br);
    n.connect(nb); nb.connect(ng); ng.connect(OUT);
  };
  // 提琴：锯齿 + 颤音 + 共鸣峰
  I.fiddle = function (t, f, dur, v, o) {
    var end = t + dur + 0.2, gl = o.pf && o.slide ? { from: o.pf, gl: 0.07 } : null;
    var a = S.osc(t, 'sawtooth', f, end, gl);
    S.vib(t, end, 6, 13, 0.12, [a]);
    var bp = S.filt(t, 'peaking', 1400, 1.2), lp = S.filt(t, 'lowpass', lpOf(f, 6, 4200), 0.8);
    bp.gain.value = 5;
    var g = S.adsr(t, v, 0.06, 0.2, 0.8, dur, 0.12);
    a.connect(bp); bp.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 祖尔纳（沙漠的鼻音唢呐）：自定义谐波 + 颤音 + 从下面滑进来
  I.zurna = function (t, f, dur, v, o) {
    var end = t + dur + 0.14;
    var from = o.pf && o.slide ? o.pf : (dur > 0.5 && Math.random() < 0.35 ? f * 0.944 : 0);
    var a = S.osc(t, 'nasal', f, end, from ? { from: from, gl: 0.08 } : null);
    S.vib(t, end, 6.2, 16, 0.2, [a]);
    var bp = S.filt(t, 'bandpass', Math.min(2400, Math.max(900, f * 1.6)), 0.8), lp = S.filt(t, 'lowpass', 5200, 0.7);
    var g = S.adsr(t, v, 0.03, 0.15, 0.85, dur, 0.08);
    a.connect(bp); bp.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 奈伊笛：气声很重的竖吹笛
  I.ney = function (t, f, dur, v, o) {
    var end = t + dur + 0.2;
    var a = S.osc(t, 'sine', f, end), b = S.osc(t, 'triangle', f, end);
    S.vib(t, end, 4.8, 10, 0.25, [a, b]);
    var bg = S.gain(0.35), lp = S.filt(t, 'lowpass', lpOf(f, 4, 3500), 0.7);
    var g = S.adsr(t, v, 0.09, 0.25, 0.8, dur, 0.16);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(OUT);
    var n = S.noise(t, end), nb = S.filt(t, 'bandpass', lpOf(f, 1.5, 6000), 2.5), ng = S.adsr(t, v * 0.22, 0.06, 0.2, 0.45, dur, 0.12);
    n.connect(nb); nb.connect(ng); ng.connect(OUT);
  };
  // 钟 / 音乐盒（FM）
  I.bell = function (t, f, dur, v, o) {
    var dec = o.dec || Math.min(2.6, dur + 1.4);
    S.fm(t, f, o.ratio || 3.5, o.idx || 2.2, dec, v, { idx1: 0.15 });
    S.tone(t, 'sine', f * 2, Math.min(dec, 0.9), v * 0.18);
  };
  I.musicbox = function (t, f, dur, v, o) {
    S.fm(t, f, 4, 1.4, Math.min(1.6, dur + 1), v, { idx1: 0.1 });
    S.tone(t, 'sine', f * 3, 0.25, v * 0.1);
  };
  // 特雷门琴：正弦 + 很宽的颤音，音和音之间滑过去（墓地）
  I.theremin = function (t, f, dur, v, o) {
    var end = t + dur + 0.3;
    var a = S.osc(t, 'sine', f, end, o.pf ? { from: o.pf, gl: 0.12 } : null);
    var b = S.osc(t, 'triangle', f, end, o.pf ? { from: o.pf, gl: 0.12 } : null);
    S.vib(t, end, 6.3, 24, 0.1, [a, b]);
    var bg = S.gain(0.25), lp = S.filt(t, 'lowpass', 2400, 0.6);
    var g = S.adsr(t, v, 0.12, 0.3, 0.85, dur, 0.25);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 管风琴：两个略微走调的自定义波形
  I.organ = function (t, f, dur, v, o) {
    var end = t + dur + 0.5;
    var a = S.osc(t, 'organ', f, end), b = S.osc(t, 'organ', f, end, { det: 7 });
    var lp = S.filt(t, 'lowpass', o.lp || 3800, 0.6);
    var g = S.adsr(t, v, o.a || 0.12, 0.25, 0.85, dur, o.rel || 0.35);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 弦乐铺底：三个走调的锯齿波
  I.strings = function (t, f, dur, v, o) {
    var rel = o.rel || 0.8, end = t + dur + rel * 1.7;
    var a = S.osc(t, 'sawtooth', f, end, { det: -11 }), b = S.osc(t, 'sawtooth', f, end), c = S.osc(t, 'sawtooth', f, end, { det: 9 });
    var lp = S.filt(t, 'lowpass', o.lp || 1500, 0.6);
    var g = S.adsr(t, v, o.a || 0.35, 0.3, 0.85, dur, rel);
    a.connect(lp); b.connect(lp); c.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 合唱“啊”：两个锯齿波过两个共振峰
  I.choir = function (t, f, dur, v, o) {
    var rel = o.rel || 0.7, end = t + dur + rel * 1.7;
    var a = S.osc(t, 'sawtooth', f, end, { det: -7 }), b = S.osc(t, 'sawtooth', f, end, { det: 7 });
    S.vib(t, end, 5, 8, 0.3, [a, b]);
    var f1 = S.filt(t, 'bandpass', 730, 5), f2 = S.filt(t, 'bandpass', 1120, 6), lp = S.filt(t, 'lowpass', lpOf(f, 3, 2400), 0.7);
    var g2 = S.gain(0.6), g3 = S.gain(0.25);
    var g = S.adsr(t, v, o.a || 0.35, 0.3, 0.85, dur, rel);
    a.connect(f1); b.connect(f1); a.connect(f2); b.connect(lp);
    f1.connect(g); f2.connect(g2); g2.connect(g); lp.connect(g3); g3.connect(g);
    g.connect(OUT);
  };
  // 铜管（和弦重音、号角）：滤波器随起音打开
  I.brass = function (t, f, dur, v, o) {
    var end = t + dur + 0.2;
    var a = S.osc(t, 'sawtooth', f, end, { det: -7 }), b = S.osc(t, 'sawtooth', f, end, { det: 7 });
    var lp = A.createBiquadFilter();
    NODES.push(lp);
    lp.type = 'lowpass'; lp.Q.value = 1.3;
    var pk = lpOf(f, o.br || 6, 7000);
    lp.frequency.setValueAtTime(f * 1.2, t);
    lp.frequency.exponentialRampToValueAtTime(pk, t + 0.07);
    lp.frequency.setTargetAtTime(Math.max(f * 2.6, 300), t + 0.08, 0.25);
    var g = S.adsr(t, v, o.a || 0.025, 0.2, 0.75, dur, o.rel || 0.12);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 圆号（主旋律用，柔一点）
  I.horn = function (t, f, dur, v, o) {
    var end = t + dur + 0.25, gl = o.pf && o.slide ? { from: o.pf, gl: 0.06 } : null;
    var a = S.osc(t, 'horn', f, end, gl), b = S.osc(t, 'horn', f, end, { det: 5 });
    S.vib(t, end, 5, 7, 0.35, [a, b]);
    var lp = A.createBiquadFilter();
    NODES.push(lp);
    lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(f * 1.5, t);
    lp.frequency.exponentialRampToValueAtTime(lpOf(f, 4, 4200), t + 0.09);
    var g = S.adsr(t, v, 0.06, 0.25, 0.85, dur, 0.14);
    a.connect(lp); b.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 锯齿主音（午夜钟声的警报旋律）：滑音 + 颤音
  I.lead = function (t, f, dur, v, o) {
    var end = t + dur + 0.15, gl = o.pf ? { from: o.pf, gl: 0.045 } : null;
    var a = S.osc(t, 'sawtooth', f, end, gl), b = S.osc(t, 'square', f, end, gl ? { from: o.pf, gl: 0.045 } : { det: 10 });
    S.vib(t, end, 6, 14, 0.16, [a, b]);
    var bg = S.gain(0.4), lp = S.filt(t, 'lowpass', 3000, 2.2);
    var g = S.adsr(t, v, 0.012, 0.12, 0.8, dur, 0.08);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(OUT);
  };
  // 持续低音（沙漠）：根音 + 五度
  I.drone = function (t, f, dur, v, o) {
    var end = t + dur + 1.6;
    var a = S.osc(t, 'sawtooth', f, end), b = S.osc(t, 'sawtooth', f * 1.5, end, { det: 3 });
    var bg = S.gain(0.5), lp = S.filt(t, 'lowpass', 520, 0.8);
    var g = S.adsr(t, v, 0.7, 0.4, 0.9, dur, 1);
    a.connect(lp); b.connect(bg); bg.connect(lp); lp.connect(g); g.connect(OUT);
  };

  // ---------------- 打击乐（f 不用的就忽略） ----------------
  I.kick = function (t, f, dur, v) {
    S.tone(t, 'sine', 150, 0.42, v, { f1: 44, sw: 0.11 });
    S.nz(t, 0.012, v * 0.3, { type: 'hp', f: 2200 });
  };
  I.snare = function (t, f, dur, v) {
    S.nz(t, 0.17, v * 0.62, { type: 'hp', f: 950, q: 0.6 });
    S.tone(t, 'triangle', 190, 0.1, v * 0.5, { f1: 150, sw: 0.05 });
  };
  I.hat = function (t, f, dur, v) { S.nz(t, 0.035, v * 0.28, { type: 'hp', f: 7600, q: 0.8 }); };
  I.ohat = function (t, f, dur, v) { S.nz(t, 0.24, v * 0.2, { type: 'hp', f: 7000, q: 0.8 }); };
  I.shaker = function (t, f, dur, v) { S.nz(t, 0.07, v * 0.16, { type: 'bp', f: 6200, q: 1.4, a: 0.018 }); };
  I.tom = function (t, f, dur, v) { var p = f || 120; S.tone(t, 'sine', p, 0.36, v * 0.85, { f1: p * 0.62, sw: 0.26 }); S.nz(t, 0.03, v * 0.15, { type: 'lp', f: 1500 }); };
  I.taiko = function (t, f, dur, v) {
    S.tone(t, 'sine', 78, 0.95, v, { f1: 46, sw: 0.3 });
    S.tone(t, 'triangle', 150, 0.3, v * 0.3, { f1: 92, sw: 0.18, lp: 900 });   // 小喇叭（iPad）也听得到的“身体”
    S.nz(t, 0.14, v * 0.55, { type: 'lp', f: 260, q: 0.8, kind: 'brown' });
    S.nz(t, 0.025, v * 0.14, { type: 'bp', f: 1300, q: 1 });
  };
  I.doum = function (t, f, dur, v) { S.tone(t, 'sine', 104, 0.45, v, { f1: 72, sw: 0.14 }); S.nz(t, 0.05, v * 0.3, { type: 'lp', f: 450 }); };
  I.tek = function (t, f, dur, v) { S.nz(t, 0.06, v * 0.45, { type: 'bp', f: 3300, q: 3 }); S.tone(t, 'sine', 650, 0.05, v * 0.16); };
  I.ka = function (t, f, dur, v) { S.nz(t, 0.045, v * 0.25, { type: 'bp', f: 2600, q: 2.5 }); };
  I.tamb = function (t, f, dur, v) {
    S.nz(t, 0.05, v * 0.2, { type: 'hp', f: 7200 });
    S.nz(t + 0.013, 0.06, v * 0.16, { type: 'hp', f: 7800 });
    S.nz(t + 0.028, 0.08, v * 0.12, { type: 'hp', f: 8400 });
  };
  I.zil = function (t, f, dur, v) { S.fm(t, 2350, 1.47, 1.6, 0.7, v * 0.12, { idx1: 0.2 }); };
  I.crash = function (t, f, dur, v) { S.nz(t, 1.7, v * 0.3, { type: 'hp', f: 3600, q: 0.5 }); S.nz(t, 0.9, v * 0.12, { type: 'bp', f: 9000, q: 0.6, f2: 5000, fsw: 0.9 }); };
  I.timp = function (t, f, dur, v) {
    var p = f || 98;
    S.tone(t, 'sine', p * 1.02, 1.4, v, { f1: p, sw: 0.06 });
    S.tone(t, 'sine', p * 1.5, 0.6, v * 0.25);
    S.nz(t, 0.08, v * 0.4, { type: 'lp', f: 320, kind: 'brown' });
  };
  I.heart = function (t, f, dur, v) { S.tone(t, 'sine', 62, 0.36, v, { f1: 40, sw: 0.12, a: 0.008 }); };
  I.frame = function (t, f, dur, v) { S.tone(t, 'sine', 125, 0.32, v * 0.8, { f1: 86, sw: 0.12 }); S.nz(t, 0.06, v * 0.25, { type: 'lp', f: 650 }); };
  I.rim = function (t, f, dur, v) { S.tone(t, 'square', 1900, 0.018, v * 0.2, { lp: 5000 }); };
  I.clap = function (t, f, dur, v) {
    for (var i = 0; i < 3; i++) S.nz(t + i * 0.011, 0.02, v * 0.3, { type: 'bp', f: 1500, q: 1.2 });
    S.nz(t + 0.033, 0.14, v * 0.32, { type: 'bp', f: 1400, q: 1 });
  };
  I.toll = function (t, f, dur, v) { S.fm(t, f || 98, 1.41, 3.2, 3.6, v, { idx1: 0.3 }); S.tone(t, 'sine', (f || 98) * 2.02, 2.2, v * 0.25); };
  I.riser = function (t, f, dur, v) {
    var s = S.noise(t, t + dur + 0.02), fl = S.filt(t, 'bandpass', 380, 1.4, 5200, dur);
    var g = A.createGain();
    NODES.push(g);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, v * 0.28), t + dur);
    g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.02);
    s.connect(fl); fl.connect(g); g.connect(OUT);
  };
  SFX.DRUMS = { kick: 1, snare: 1, hat: 1, ohat: 1, shaker: 1, tom: 1, taiko: 1, doum: 1, tek: 1, ka: 1, tamb: 1, zil: 1, crash: 1, timp: 1, heart: 1, frame: 1, rim: 1, clap: 1, toll: 1, riser: 1 };

  // ---------------- 曲子：编译 ----------------
  var SCALES = SFX.SCALES = {
    major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10],
    mixo: [0, 2, 4, 5, 7, 9, 10], phrygdom: [0, 1, 4, 5, 7, 8, 10], harmonic: [0, 2, 3, 5, 7, 8, 11]
  };
  // 音级（0 起、可以超过 7）→ 半音
  function semi(sc, D) { var o = Math.floor(D / 7), i = D - o * 7; return sc[i] + 12 * o; }
  SFX.semi = semi;

  // 和弦记号：[b|#]级数[M 大 / m 小 / d 减 / s 挂四 / 7 七和弦]；不写性质就是调内三和弦
  function parseChord(tok, sc) {
    var m = /^([b#]?)(\d)([Mmds7]?)$/.exec(String(tok));
    if (!m) return { root: 0, iv: [0, 4, 7], D: 0 };
    var acc = m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0, D = +m[2] - 1, q = m[3];
    var r = semi(sc, D) + acc, iv;
    if (q === 'M') iv = [0, 4, 7];
    else if (q === 'm') iv = [0, 3, 7];
    else if (q === 'd') iv = [0, 3, 6];
    else if (q === 's') iv = [0, 5, 7];
    else {
      iv = [0, semi(sc, D + 2) - semi(sc, D), semi(sc, D + 4) - semi(sc, D)];
      if (q === '7') iv.push(semi(sc, D + 6) - semi(sc, D));
    }
    return { root: ((r % 12) + 12) % 12, iv: iv, D: D };
  }
  // 旋律记号：“级数:长度”，级数前 b/# 升降，后面 ' 高八度、, 低八度；r 休止；~ 从上一个音滑进来；长度省略就沿用上一个
  function parseMel(str) {
    var out = [], at = 0, len = 4;
    str.trim().split(/\s+/).forEach(function (tok) {
      if (tok === '|') return;
      var m = /^(~?)([rb#]?)(\d?)([',]*)(?::(\d+))?$/.exec(tok);
      if (!m) throw new Error('bad melody token ' + tok);
      if (m[5]) len = +m[5];
      if (m[2] === 'r') { at += len; return; }
      var acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0, oc = 0;
      for (var i = 0; i < m[4].length; i++) oc += m[4][i] === "'" ? 1 : -1;
      out.push({ at: at, D: +m[3] - 1 + 7 * oc, acc: acc, len: len, slide: !!m[1] });
      at += len;
    });
    out.total = at;
    return out;
  }
  SFX.compileSong = function (s) {
    var sc = SCALES[s.scale] || SCALES.major;
    s.sc = sc;
    s.div = s.div || 4;
    s.steps = s.steps || 16;
    s.melC = {};
    for (var k in s.mel) {
      var notes = parseMel(s.mel[k]), map = [];
      notes.forEach(function (n) { map[n.at] = n; });
      s.melC[k] = map;
      s.melC[k].total = notes.total;
    }
    for (var id in s.sec) {
      var sec = s.sec[id];
      sec.id = id;
      sec.ch = sec.chords.map(function (c) { return parseChord(c, sc); });
      sec.bars = sec.ch.length;
    }
    return s;
  };

  // ---------------- 曲子：播放器（一首曲子一个；切换时旧的淡出、新的淡入） ----------------
  var LOOK = 0.32;          // 提前排多少秒
  function pickVar(v, n) {
    if (v == null || v === false) return null;
    if (typeof v === 'string' && v.indexOf('|') >= 0) { var a = v.split('|'); return a[n % a.length]; }
    return v;
  }
  function byLvl(v, L) { return Array.isArray(v) ? v[Math.min(L, v.length - 1)] : v; }
  function rnd(seed) { var s = seed >>> 0 || 1; return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

  function Player(song, t0, fadeIn, opts) {
    var c = A;
    this.s = song;
    this.id = song.id;
    this.sd = 60 / song.bpm / song.div;
    this.spb = song.steps;
    this.out = c.createGain();
    var fi = Math.max(0.05, fadeIn == null ? 0.8 : fadeIn);
    this.out.gain.setValueAtTime(0.0001, t0);
    this.out.gain.linearRampToValueAtTime(song.vol || 1, t0 + fi);
    this.out.connect(opts && opts.dest || SFX.bus.track);
    this.pg = {};
    for (var k in song.parts) {
      var pd = song.parts[k], g = c.createGain();
      g.gain.value = pd.vol == null ? 0.5 : pd.vol;
      if (opts && opts.solo && opts.solo.indexOf(k) < 0) g.gain.value = 0;
      if (pd.pan && c.createStereoPanner) { var pn = c.createStereoPanner(); pn.pan.value = pd.pan; g.connect(pn); pn.connect(this.out); this.pg[k + '_pn'] = pn; }
      else g.connect(this.out);
      this.pg[k] = g;
    }
    this.next = t0;
    this.stopAt = Infinity;
    this.dieAt = Infinity;
    this.loop = 0; this.fi = -1; this.form = null; this.bar = 0; this.step = 0;
    this.occ = {}; this.st = {}; this.cur = {};
    this.lvl = opts && opts.lvl != null ? opts.lvl : 1;
    this.fixedLvl = opts && opts.lvl != null;
    this.rng = rnd(song.id.length * 977 + 13);
    // 叠加层（随机事件、Boss 第二阶段，定义在 SFX.LAYERS）：id → { g 总音量, pg 声部, on, until 淡出到什么时候 }
    // ks 移调（半音，只在段落开头换）、tk 速度倍数（每小节开头换）：都来自开着的叠加层
    this.lay = {}; this.ks = 0; this.tk = 1;
    this.nextSection();
  }
  Player.prototype.nextSection = function () {
    var s = this.s;
    // 叠加层要求的移调：在段落开头才换（铺底和弦、持续低音一整段都在同一个调上，不会半路走调）
    var ks = 0;
    for (var lid in this.lay) if (this.lay[lid].on && SFX.LAYERS[lid]) ks += SFX.LAYERS[lid].ks || 0;
    this.ks = ks;
    this.fi++;
    if (!this.form || this.fi >= this.form.length) {
      if (this.form) this.loop++;
      this.form = s.forms[this.loop % s.forms.length];
      this.fi = 0;
      this.occ = {};
    }
    var id = this.form[this.fi];
    if (id.charAt(0) === '!') {
      if (this.loop > 0) { this.nextSection(); return; }
      id = id.slice(1);
    }
    this.sec = s.sec[id];
    this.occN = this.occ[id] || 0;
    this.occ[id] = this.occN + 1;
    this.bar = 0;
    this.key = s.keys ? s.keys[this.loop % s.keys.length] : 0;
    this.secStart = true;
  };
  Player.prototype.fadeOut = function (now, f) {
    var p = this.out.gain;
    try { p.cancelScheduledValues(now); p.setValueAtTime(Math.max(0.0001, p.value), now); p.linearRampToValueAtTime(0.0001, now + f); } catch (e) { /* 忽略 */ }
    this.stopAt = now + f;
    this.dieAt = now + f + 3;
  };
  Player.prototype.dispose = function () {
    try { this.out.disconnect(); } catch (e) { /* 忽略 */ }
    for (var k in this.pg) { try { this.pg[k].disconnect(); } catch (e2) { /* 忽略 */ } }
  };
  // 打开 / 关掉一个叠加层（淡入淡出；节点第一次打开时建，跟着曲子一起释放）
  Player.prototype.layerOn = function (id, now) {
    var LD = SFX.LAYERS[id], c = A;
    if (!LD || !c) return;
    var ly = this.lay[id];
    if (!ly) {
      ly = this.lay[id] = { g: c.createGain(), pg: {}, on: false, until: 0 };
      ly.g.gain.value = 0.0001;
      ly.g.connect(this.out);
      this.pg['@' + id] = ly.g;
      for (var k in LD.parts) {
        var pd = LD.parts[k], g = c.createGain();
        g.gain.value = pd.vol == null ? 0.5 : pd.vol;
        if (pd.pan && c.createStereoPanner) { var pn = c.createStereoPanner(); pn.pan.value = pd.pan; g.connect(pn); pn.connect(ly.g); this.pg['@' + id + ':' + k + '_pn'] = pn; }
        else g.connect(ly.g);
        ly.pg[k] = g;
        this.pg['@' + id + ':' + k] = g;
      }
    }
    ly.on = true; ly.until = Infinity;
    var p = ly.g.gain;
    try { p.cancelScheduledValues(now); p.setValueAtTime(Math.max(0.0001, p.value), now); p.linearRampToValueAtTime(1, now + (LD.fi || 1.5)); } catch (e) { /* 忽略 */ }
  };
  Player.prototype.layerOff = function (id, now) {
    var ly = this.lay[id], LD = SFX.LAYERS[id];
    if (!ly || !ly.on) return;
    var fo = LD && LD.fo || 1.2;
    ly.on = false; ly.until = now + fo;
    var p = ly.g.gain;
    try { p.cancelScheduledValues(now); p.setValueAtTime(Math.max(0.0001, p.value), now); p.linearRampToValueAtTime(0.0001, now + fo); } catch (e) { /* 忽略 */ }
  };
  // 叠加层的一个音（声部在 ly.pg 里）
  Player.prototype.lnote = function (ly, part, inst, t, midi, dur, vel, o) {
    var fn = I[inst], out = ly.pg[part];
    if (!fn || !out) return;
    OUT = out;
    NODES = []; END = t + dur;
    try { fn(t, midi == null ? 0 : SFX.mtof(midi), dur, vel, o || NO); } catch (e) { SFX.err(e); }
    SFX.junk.push({ end: END + 0.1, nodes: NODES });
    NODES = null; OUT = null;
    SFX.stats.notes++;
  };
  // 排音符到 until 为止（主线程卡住落后太多时直接跳过，不补一大堆音）
  Player.prototype.run = function (now, until) {
    if (this.next < now - 0.2) this.next = now + 0.05;
    var lim = Math.min(until, this.stopAt);
    while (this.next < lim) {
      this.doStep(this.next);
      this.next += this.sd;
      if (++this.step >= this.spb) {
        this.step = 0;
        if (++this.bar >= this.sec.bars) this.nextSection();
      }
    }
  };
  // 一个音符：建节点 → 记到垃圾表里（结束后断开）
  Player.prototype.note = function (part, inst, t, midi, dur, vel, o) {
    var fn = I[inst];
    if (!fn) return;
    OUT = this.pg[part];
    if (!OUT) return;
    NODES = []; END = t + dur;
    try { fn(t, midi == null ? 0 : SFX.mtof(midi), dur, vel, o || NO); } catch (e) { SFX.err(e); }
    SFX.junk.push({ end: END + 0.1, nodes: NODES });
    NODES = null; OUT = null;
    SFX.stats.notes++;
  };
  Player.prototype.partOn = function (k) {
    var pd = this.s.parts[k];
    return pd && (pd.lvl || 0) <= this.lvl && (pd.max == null || this.lvl <= pd.max);
  };
  Player.prototype.barStart = function (t) {
    var s = this.s, sec = this.sec, L;
    if (!this.fixedLvl) {
      L = SFX.M.levelFn ? SFX.M.levelFn(this) : 1;
      this.lvl = Math.max(0, Math.min(2, L | 0));
    }
    // 叠加层要求的速度（Boss 第二阶段加快）：每小节开头换，这一小节的每一步都用新的步长
    var tk = 1;
    for (var lid in this.lay) if (this.lay[lid].on && SFX.LAYERS[lid]) tk *= SFX.LAYERS[lid].tk || 1;
    if (tk !== this.tk) { this.tk = tk; this.sd = 60 / (s.bpm * tk) / s.div; }
    L = sec.lvl != null ? Math.min(sec.lvl, this.lvl) : this.lvl;
    this.L = L;
    var ch = sec.ch[this.bar], vn = this.occN + this.loop;
    this.ch = ch;
    this.root = s.root + this.key + this.ks;
    var cur = this.cur;
    for (var pi = 0; pi < PAT_PARTS.length; pi++) {
      var k = PAT_PARTS[pi], name = byLvl(pickVar(sec[k], vn), L), pt = s.pat[k] || (k === 'arp2' ? s.pat.arp : null);
      cur[k] = name && pt && this.partOn(k) && L >= (s.parts[k].lvl || 0) ? pt[name] || null : null;
    }
    // 鼓：段落第一小节可以换一套（带镲），最后一小节加花
    var last = this.bar === sec.bars - 1 && sec.bars > 1;
    var dname = this.bar === 0 && sec.first ? sec.first : last && sec.fill ? sec.fill : sec.drums;
    var dset = dname && s.drums[dname];
    this.drums = null;
    if (dset && this.partOn('drums')) {
      var dr = {};
      for (var lane in dset) { var v = byLvl(dset[lane], L); if (v) dr[lane] = v; }
      this.drums = dr;
    }
    // 段落开头：旋律（变奏按出现次数和循环次数轮换）、持续低音
    if (this.secStart) {
      this.secStart = false;
      this.mel = {};
      var self = this;
      ['lead', 'counter'].forEach(function (k) {
        var ref = pickVar(sec[k], vn);
        if (!ref || !self.partOn(k)) return;
        var bits = ref.split('+'), map = s.melC[bits[0]];
        if (!map) return;
        self.mel[k] = { map: map, mods: bits.slice(1) };
      });
      if (sec.drone !== false && s.parts.drone && this.partOn('drone')) {
        var dl = sec.bars * this.spb * this.sd;
        var dr0 = this.fit(this.root + ch.root, s.parts.drone.lo);
        this.note('drone', s.parts.drone.inst, t, dr0, dl - 0.2, 1);
      }
    }
    // 铺底和弦：和下一小节一样的和弦连起来一起放
    if (byLvl(sec.pad, L) && s.parts.pad && this.partOn('pad') && L >= (s.parts.pad.lvl || 0) && (this.bar === 0 || !sameCh(sec.ch[this.bar - 1], ch))) {
      var n = 1;
      while (this.bar + n < sec.bars && sameCh(sec.ch[this.bar + n], ch)) n++;
      var pdur = n * this.spb * this.sd, pd = s.parts.pad, tones = this.voicing(ch, pd.lo);
      for (var i = 0; i < tones.length; i++) this.note('pad', pd.inst, t, tones[i], pdur - 0.05, 1, pd);
    }
  };
  var PAT_PARTS = ['bass', 'arp', 'arp2', 'stab'];
  function sameCh(a, b) {
    if (!a || !b || a.root !== b.root || a.iv.length !== b.iv.length) return false;
    for (var i = 0; i < a.iv.length; i++) if (a.iv[i] !== b.iv[i]) return false;
    return true;
  }
  // 把音放进 [lo, lo+12)
  Player.prototype.fit = function (m, lo) { return lo + ((((m - lo) % 12) + 12) % 12); };
  // 和弦音排在 [lo, lo+12) 里，从低到高
  Player.prototype.voicing = function (ch, lo) {
    var out = [], r = this.root + ch.root;
    for (var i = 0; i < ch.iv.length; i++) out.push(this.fit(r + ch.iv[i], lo));
    return out.sort(function (a, b) { return a - b; });
  };
  // 音型字符串：从 step 往后数连音符号“-”，得到这个音的长度（步数）
  function holdLen(pat, st) { var n = 1; while (pat.charAt(st + n) === '-') n++; return n; }

  // 一点点时间上的随机（人味儿），鼓不加
  function hum() { return (Math.random() - 0.5) * 0.006; }
  Player.prototype.doStep = function (t) {
    if (this.step === 0) this.barStart(t);
    var s = this.s, st = this.step, cur = this.cur, ch = this.ch, sd = this.sd, c, pd, n, k;
    // 贝斯：R 根音，O 高八度，F 五度，T 三度，S 七度（没有就用八度）
    if ((c = cur.bass && cur.bass.charAt(st)) && c !== '.' && c !== '-') {
      pd = s.parts.bass;
      var br = this.fit(this.root + ch.root, pd.lo), bm = br;
      if (c === 'O') bm = br + 12;
      else if (c === 'F') bm = br + ch.iv[2];
      else if (c === 'T') bm = br + ch.iv[1];
      else if (c === 'S') bm = br + (ch.iv[3] || 12);
      n = holdLen(cur.bass, st);
      this.note('bass', pd.inst, t, bm, n * sd * 0.92, c === 'O' ? 0.85 : 1, pd);
    }
    // 琶音：数字是和弦音的序号（超过和弦音个数就高八度）；scale 模式下是从和弦根音往上数的音阶级数
    for (k = 0; k < 2; k++) {
      var an = k ? 'arp2' : 'arp', pat = cur[an];
      if (!pat || !(c = pat.charAt(st)) || c === '.' || c === '-') continue;
      pd = s.parts[an];
      var idx = +c, m;
      if (pd.mode === 'scale') {
        // 从和弦根音的音级往上数音阶
        m = this.fit(this.root + semi(s.sc, ch.D), pd.lo) + semi(s.sc, ch.D + idx) - semi(s.sc, ch.D);
      } else {
        var tones = this.voicing(ch, pd.lo), nt = tones.length;
        m = tones[idx % nt] + 12 * Math.floor(idx / nt);
      }
      n = holdLen(pat, st);
      this.note(an, pd.inst, t + hum(), m, n * sd, (pd.acc && st % 4 === 0 ? 1 : 0.8) * (0.9 + Math.random() * 0.1), pd);
    }
    // 和弦重音（铜管）：x 整个和弦
    if (cur.stab && (c = cur.stab.charAt(st)) && c !== '.' && c !== '-') {
      pd = s.parts.stab;
      var sv = this.voicing(ch, pd.lo);
      n = holdLen(cur.stab, st);
      for (var i = 0; i < sv.length; i++) this.note('stab', pd.inst, t, sv[i], n * sd * 0.9, c === 'X' ? 1 : 0.8, pd);
    }
    // 旋律
    var secStep = this.bar * this.spb + st;
    for (var mk in this.mel) {
      var ml = this.mel[mk], nt0 = ml.map[secStep];
      if (!nt0) continue;
      pd = s.parts[mk];
      this.melNote(mk, pd, ml.mods, nt0, t + hum());
    }
    // 鼓
    var dr = this.drums;
    if (dr) {
      var dp = s.parts.drums;
      for (var lane in dr) {
        c = dr[lane].charAt(st);
        if (!c || c === '.' || c === '-') continue;
        var vel = c === 'X' ? 1.25 : c === 'o' ? 0.5 : 1;
        var inst = (dp.map && dp.map[lane]) || lane;
        var fq = dp.tune && dp.tune[lane] ? this.fit(this.root, dp.tune[lane]) : null;
        if (inst === 'riser') { this.note('drums', inst, t, null, holdLen(dr[lane], st) * sd, vel); continue; }
        this.note('drums', inst, t, fq, sd, vel);
      }
    }
    // 叠加层（开着的，和正在淡出的）：同一个时钟、同一个和弦
    for (var lid in this.lay) {
      var ly = this.lay[lid];
      if (!ly.on && !(t < ly.until)) continue;
      var LD = SFX.LAYERS[lid];
      if (LD && LD.step) { try { LD.step(this, ly, t, st); } catch (e) { SFX.err(e); } }
    }
  };
  Player.prototype.melNote = function (mk, pd, mods, nt, t) {
    var s = this.s, sd = this.sd;
    var insts = pd.inst, inst = Array.isArray(insts) ? insts[this.loop % insts.length] : insts;
    var base = pd.base + this.key + this.ks;
    var m = base + semi(s.sc, nt.D) + nt.acc, dur = nt.len * sd, vel = 0.92 + Math.random() * 0.08;
    var up = 0, harm = false, echo = false, orn = false;
    for (var i = 0; i < mods.length; i++) {
      if (mods[i] === 'up') up = 12; else if (mods[i] === 'down') up = -12;
      else if (mods[i] === 'harm') harm = true; else if (mods[i] === 'echo') echo = true; else if (mods[i] === 'orn') orn = true;
    }
    m += up;
    var st = this.st[mk] || (this.st[mk] = {});
    var o = { pf: st.pf, slide: nt.slide || pd.legato };
    if (orn && nt.len >= 4 && this.rng() < 0.4) this.note(mk, inst, t - 0.055, m + (semi(s.sc, nt.D + 1) - semi(s.sc, nt.D)), 0.06, vel * 0.7, { });
    this.note(mk, inst, t, m, dur * (pd.gate || 0.94), vel, o);
    st.pf = SFX.mtof(m);
    if (harm) {
      var hm = base + up + semi(s.sc, nt.D - 2);
      this.note(mk, inst, t, hm, dur * (pd.gate || 0.94), vel * 0.55, {});
    }
    if (echo) this.note(mk, inst, t + sd * 3, m, dur * 0.8, vel * 0.32, {});
  };

  // ---------------- 音乐管理：换曲、压低、暂停、插曲 ----------------
  var M = SFX.M = {
    cur: null, curId: null, fading: [], log: [], duck: 1, paused: false, lp: 20000,
    stingUntil: 0, stingDuck: 1, stings: [],
    // 换曲时的淡出 / 淡入秒数（按新曲子）
    FADE: { menu: [1.4, 1.8], forest: [1.2, 1.2], desert: [1.2, 1.2], graveyard: [1.2, 1.4], boss: [0.45, 0.25], swarm: [0.7, 0.5] },
    // 由 audio_hooks.js 提供：想放哪首（null 不放）、强度 0~2、要不要暂停、压低到多少、低血量闷声、
    // 叠加层（layerFn(曲子 id, out)：把想开的层写成 out[id] = true）
    wantFn: null, levelFn: null, pauseFn: null, duckFn: null, lpFn: null, layerFn: null
  };
  M.switchTo = function (id, now) {
    var c = SFX.ctx;
    A = c; R = SFX.R;
    var f = M.FADE[id] || [1, 1];
    if (M.cur) {
      M.cur.fadeOut(now, id ? f[0] : 1.2);
      M.fading.push(M.cur);
    }
    M.cur = null;
    M.curId = id;
    if (id && SFX.SONGS[id]) {
      M.cur = new Player(SFX.SONGS[id], now + 0.06, f[1]);
      try { SFX.bus.musRev.gain.setTargetAtTime(SFX.SONGS[id].wet == null ? 0.2 : SFX.SONGS[id].wet, now, 0.4); } catch (e) { /* 忽略 */ }
    }
    M.log.push({ t: Math.round(now * 100) / 100, id: id });
    if (M.log.length > 60) M.log.shift();
  };
  M.tick = function (now) {
    var b = SFX.bus;
    A = SFX.ctx; R = SFX.R;
    var want = M.wantFn ? M.wantFn(now) : null;
    if (want !== M.curId) M.switchTo(want, now);
    // 暂停：停止排音符并很快静音；弹窗：压低
    var paused = !!(M.pauseFn && M.pauseFn()) || !SFX.musicLive;
    var duck = paused ? 0 : M.duckFn ? M.duckFn() : 1;
    if (duck !== M.duck) {
      M.duck = duck;
      try { b.duck.gain.cancelScheduledValues(now); b.duck.gain.setTargetAtTime(Math.max(0.0001, duck), now, paused ? 0.04 : 0.15); } catch (e) { /* 忽略 */ }
    }
    if (paused !== M.paused) {
      M.paused = paused;
      if (!paused && M.cur) M.cur.next = Math.max(M.cur.next, now + 0.06);
    }
    var lp = M.lpFn ? M.lpFn() : 20000;
    if (lp !== M.lp) { M.lp = lp; try { b.lp.frequency.setTargetAtTime(lp, now, 0.35); } catch (e2) { /* 忽略 */ } }
    // 插曲结束：曲子恢复音量
    if (M.stingDuck !== 1 && now > M.stingUntil) {
      M.stingDuck = 1;
      try { b.track.gain.setTargetAtTime(1, now, 0.35); } catch (e3) { /* 忽略 */ }
    }
    M.syncLayers(now);
    var until = now + LOOK;
    if (M.cur && !paused) M.cur.run(now, until);
    for (var i = M.fading.length - 1; i >= 0; i--) {
      var p = M.fading[i];
      if (now > p.dieAt) { p.dispose(); M.fading.splice(i, 1); continue; }
      if (!paused) p.run(now, until);
    }
  };
  // 叠加层：按 layerFn 的结果打开 / 关掉当前曲子的层（每 50 毫秒，以及事件开始 / 结束时马上调用一次）
  // 状态从游戏里现读（事件在不在、Boss 有没有进第二阶段），所以任何结束方式（打断、换关、回菜单、阵亡、通关）都会收掉
  var LW = {};
  M.syncLayers = function (now) {
    var p = M.cur, id;
    if (!p || !M.layerFn || !SFX.ctx) return;
    A = SFX.ctx; R = SFX.R;
    for (id in SFX.LAYERS) LW[id] = false;
    M.layerFn(M.curId, LW);
    for (id in SFX.LAYERS) {
      var ly = p.lay[id];
      if (LW[id]) { if (!ly || !ly.on) p.layerOn(id, now); }
      else if (ly && ly.on) p.layerOff(id, now);
    }
  };
  // 现在开着的叠加层（测试 / 调试用）
  M.layersOn = function () {
    var out = [], p = M.cur;
    if (p) for (var id in p.lay) if (p.lay[id].on) out.push(id);
    return out;
  };
  // 调号根音（插曲跟着当前曲子的调走，包括叠加层的移调），放到 C4~B4
  M.root = function () {
    var p = M.cur || M.fading[M.fading.length - 1];
    var r = p ? p.s.root + p.key + (p.ks || 0) : 60;
    return 60 + ((r % 12) + 12) % 12;
  };
  // 插曲：一次排完；放的时候把曲子压低
  M.stinger = function (id, opt) {
    var d = SFX.STINGS[id], c = SFX.ctx;
    if (!d || !c || !SFX.musicLive) return false;
    A = c; R = SFX.R;
    var now = c.currentTime, t0 = now + 0.03, beat = 60 / d.bpm, sc = SCALES[d.scale] || SCALES.major;
    var root = opt && opt.root != null ? opt.root : M.root() + (d.oct || 0);
    var g = c.createGain();
    g.gain.value = d.vol || 1;
    g.connect(SFX.bus.sting);
    OUT = g;
    var nodes = [g];
    NODES = nodes; END = t0;
    for (var i = 0; i < d.ev.length; i++) {
      var e = d.ev[i], t = t0 + e[0] * beat, inst = e[1], pitch = e[2], dur = e[3] * beat, vel = e[4] == null ? 1 : e[4], eo = e[5] || NO;
      var list = Array.isArray(pitch) ? pitch : [pitch];
      for (var j = 0; j < list.length; j++) {
        var f = list[j] == null ? (eo.f || 0) : SFX.mtof(root + (eo.oct || 0) + degSemi(sc, list[j]));
        try { I[inst](t, f, dur, vel, eo); } catch (err) { SFX.err(err); }
        SFX.stats.notes++;
      }
    }
    var end = t0 + d.len * beat;
    var junk = { end: Math.max(END, end) + 0.2, nodes: nodes };
    SFX.junk.push(junk);
    NODES = null; OUT = null;
    // 记下正在放的插曲（开新的一局 / 回主菜单时要掐掉）
    for (var k = M.stings.length - 1; k >= 0; k--) if (M.stings[k].j.end <= now) M.stings.splice(k, 1);
    M.stings.push({ g: g, j: junk });
    M.stingUntil = Math.max(M.stingUntil, end - 0.2);
    M.stingDuck = d.duck == null ? 0.3 : d.duck;
    try { SFX.bus.track.gain.setTargetAtTime(Math.max(0.0001, M.stingDuck), now, 0.06); } catch (e4) { /* 忽略 */ }
    SFX.stats.stingers.push(id);
    if (SFX.stats.stingers.length > 40) SFX.stats.stingers.shift();
    return true;
  };
  // 插曲的音级：数字 1~7（可带 ' , b #）或直接给半音（{s: 3}）
  function degSemi(sc, d) {
    if (typeof d === 'number') { var D = d > 0 ? d - 1 : d; return semi(sc, D); }
    var m = /^([b#]?)(\d)([',]*)$/.exec(d);
    if (!m) return 0;
    var oc = 0;
    for (var i = 0; i < m[3].length; i++) oc += m[3][i] === "'" ? 1 : -1;
    return semi(sc, +m[2] - 1 + 7 * oc) + (m[1] === 'b' ? -1 : m[1] === '#' ? 1 : 0);
  }
  SFX.stinger = function (id, opt) { try { return M.stinger(id, opt); } catch (e) { SFX.err(e); return false; } };
  // 掐掉还在放的插曲（阵亡 / 通关号角不能拖进新的一局或主菜单）：fade 秒淡出，曲子马上恢复音量
  M.cutStingers = function (fade) {
    var c = SFX.ctx;
    if (!c || !SFX.bus) return;
    var now = c.currentTime;
    fade = fade || 0.3;
    for (var i = 0; i < M.stings.length; i++) {
      var s = M.stings[i];
      if (s.j.end <= now) continue;
      try { var p = s.g.gain; p.cancelScheduledValues(now); p.setValueAtTime(p.value, now); p.linearRampToValueAtTime(0.0001, now + fade); } catch (e) { /* 忽略 */ }
      s.j.end = Math.min(s.j.end, now + fade + 0.1);   // 淡出后整组断开（还没开始的音也就不会再响）
    }
    M.stings.length = 0;
    M.stingUntil = 0;
    if (M.stingDuck !== 1) {
      M.stingDuck = 1;
      try { SFX.bus.track.gain.cancelScheduledValues(now); SFX.bus.track.gain.setTargetAtTime(1, now, 0.08); } catch (e2) { /* 忽略 */ }
    }
  };

  // ---------------- 定时器：每 50 毫秒（排音乐、收拾结束的声音、游戏状态驱动的循环音） ----------------
  SFX.tick = function () {
    var c = SFX.ctx;
    if (!c) return;
    var now = c.currentTime;
    if (SFX.voices.length) sweepVoices(now);
    if (SFX.junk.length) sweepJunk(now);
    if (!SFX.running) return;
    try { M.tick(now); } catch (e) { SFX.err(e); }
    if (SFX.onTick) { try { SFX.onTick(now); } catch (e2) { SFX.err(e2); } }
  };

  // ---------------- 测试：离线渲染（OfflineAudioContext），返回峰值和均方根 ----------------
  SFX.test = {};
  SFX.test.render = function (secs, schedule, opts) {
    var OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
    var sr = (opts && opts.sr) || 44100, oc = new OAC(2, Math.ceil(sr * secs), sr);
    var save = { ctx: SFX.ctx, R: SFX.R, bus: SFX.bus, voices: SFX.voices, junk: SFX.junk, live: SFX.live, musicLive: SFX.musicLive, running: SFX.running, last: SFX.last, groupN: SFX.groupN, resumeT: SFX.resumeT, stats: SFX.stats, noCache: SFX.noCache };
    var saveM = { stings: M.stings, stingUntil: M.stingUntil, stingDuck: M.stingDuck };
    var res = makeRes(oc), bus = buildBus(oc, res, oc.destination);
    bus.music.gain.value = SFX.MUSIC_K * SFX.gainOf(opts && opts.music != null ? opts.music : 100);
    bus.sfx.gain.value = bus.sfxWet.gain.value = SFX.SFX_K * SFX.gainOf(opts && opts.sfx != null ? opts.sfx : 100);
    try {
      SFX.ctx = oc; SFX.R = res; SFX.bus = bus; SFX.voices = []; SFX.junk = []; SFX.live = true; SFX.last = {}; SFX.groupN = {}; SFX.resumeT = Date.now(); SFX.noCache = true;
      SFX.stats = { req: 0, played: 0, limited: 0, capped: 0, maxVoices: 0, byName: {}, notes: 0, stingers: [], cached: 0, cacheKeys: 0 };
      M.stings = [];
      A = oc; R = res;
      schedule(oc, bus);
    } finally {
      for (var k in save) SFX[k] = save[k];
      for (k in saveM) M[k] = saveM[k];
      A = SFX.ctx; R = SFX.R;
    }
    return oc.startRendering().then(function (buf) {
      var peak = 0, sum = 0, n = 0, nan = 0;
      for (var ch = 0; ch < buf.numberOfChannels; ch++) {
        var d = buf.getChannelData(ch);
        for (var i = 0; i < d.length; i++) { var x = d[i]; if (x !== x) { nan++; continue; } var ax = x < 0 ? -x : x; if (ax > peak) peak = ax; sum += x * x; n++; }
      }
      return { peak: peak, rms: Math.sqrt(sum / Math.max(1, n)), nan: nan, secs: secs, buf: buf };
    });
  };
  // 渲染一个音效
  SFX.test.sfx = function (name, o, secs) {
    return SFX.test.render(secs || 2, function () { SFX.play(name, o || {}); });
  };
  // 渲染一首曲子的前几小节（强度固定）
  SFX.test.music = function (id, bars, lvl, startSec, solo) {
    var s = SFX.SONGS[id];
    var barSec = 60 / s.bpm / s.div * s.steps;
    var secs = bars * barSec + 1.5;
    return SFX.test.render(secs, function (oc, bus) {
      var p = new Player(s, 0.02, 0.05, { dest: bus.track, lvl: lvl == null ? 2 : lvl, solo: solo });
      // 从第几小节开始（按整小节跳，跳过的部分不排音符）
      if (startSec) { var skip = Math.round(startSec / barSec); for (var i = 0; i < skip; i++) { if (++p.bar >= p.sec.bars) p.nextSection(); } }
      p.run(0, bars * barSec);
    });
  };
  // 渲染一首曲子加上叠加层（layers：层 id 的数组；solo 只听叠加层）
  SFX.test.layer = function (id, layers, bars, lvl, soloLayers) {
    var s = SFX.SONGS[id];
    var barSec = 60 / s.bpm / s.div * s.steps;
    var secs = bars * barSec + 2;
    return SFX.test.render(secs, function (oc, bus) {
      var p = new Player(s, 0.02, 0.05, { dest: bus.track, lvl: lvl == null ? 2 : lvl, solo: soloLayers ? [] : null });
      (layers || []).forEach(function (L) { p.layerOn(L, 0); });
      p.nextSection();   // 移调在段落开头生效：从下一段开始渲染
      p.run(0, bars * barSec);
    });
  };
  // 渲染一个插曲
  SFX.test.sting = function (id, root) {
    var d = SFX.STINGS[id];
    return SFX.test.render(d.len * 60 / d.bpm + 2.5, function () {
      SFX.musicLive = true;
      M.stinger(id, { root: root == null ? 60 : root });
    });
  };
  SFX.test.Player = Player;

  // 调试：当前状态（测试用）
  SFX.debug = function () {
    var c = SFX.ctx;
    return {
      ok: SFX.ok, unlocked: SFX.unlocked, state: c ? c.state : 'none', running: SFX.running, live: SFX.live, musicLive: SFX.musicLive,
      track: M.curId, fading: M.fading.length, paused: M.paused, duck: M.duck, lvl: M.cur ? M.cur.lvl : null,
      layers: M.layersOn(), ks: M.cur ? M.cur.ks : 0, tempo: M.cur ? M.cur.tk : 1,
      voices: SFX.voices.length, junk: SFX.junk.length, vol: { music: SFX.vol.music, sfx: SFX.vol.sfx, muted: SFX.vol.muted },
      stats: SFX.stats, log: M.log.slice(), errors: SFX.errors.slice()
    };
  };
})();

// ============================================================
//  设置界面：音乐 / 音效滑条 + 静音（SFX.buildSettings 可以放进任何容器，第二批的统一设置面板会用）
//  主菜单面板右上角一个小喇叭按钮（点开小弹窗）；暂停界面的「设置」里是完整的滑条
// ============================================================
SFX.CSS = [
  // 只写布局、字号和颜色变量（style.css）；喇叭按钮（像素按钮，开着时是「选中」并按下去的样子）、弹窗的面板边框、
  // 勾选框、滑条的样子都在 css/kit.css 和 style.css。实心面板里的字不描边
  '.sfxSet { display: flex; flex-direction: column; gap: 2px; text-align: left; }',
  '.sfxTop { display: flex; align-items: center; justify-content: space-between; gap: 9px; }',
  '.sfxTitle { font-size: var(--fs-m); line-height: 24px; color: var(--goldM); }',
  '.sfxSliders { display: flex; flex-wrap: wrap; gap: 0 18px; }',
  '.sfxSliders .sfxRow { flex: 1 1 200px; min-width: 0; }',
  '.sfxRow { display: flex; align-items: center; gap: 9px; min-height: 40px; font-size: var(--fs-m); line-height: 24px; color: #fff; cursor: pointer; }',
  '.sfxLbl { flex: none; white-space: nowrap; }',
  '.sfxSet input[type=range] { flex: 1 1 auto; width: 120px; min-width: 80px; height: 36px; }',
  // 触屏的大滑块（44 像素高的滑条、30×40 的方块）在 style.css：所有滑条一样（视角灵敏度也是）；喇叭弹窗里两行滑条中间空 6 像素
  '#sfxPop .sfxSliders { row-gap: 6px; }',
  '.sfxVal { flex: none; min-width: 2.2em; text-align: right; font-size: var(--fs-m); letter-spacing: var(--o); color: var(--goldM); }',
  '.sfxMuteRow { min-height: 44px; padding: 0 2px; }',
  '.sfxMuteRow input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }',
  // 勾选框和勾上时的像素勾在 kit.css
  '.sfxBox { flex: none; position: relative; }',
  '.sfxMuteRow input:focus-visible + .sfxBox { outline: 2px solid #fff; outline-offset: 2px; }',
  '.sfxSet.muted .sfxSliders { opacity: 0.5; }',
  '.sfxNote { font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  // 主菜单：面板右上角的小喇叭（不占标题行的高度；META 的标题行右边留了 52 像素，有它时放进那一格）。
  // 打开着是按下去 3 像素的样子：离标题行上沿 12 像素，按下去也不压到下面的骑士格子
  '#menu .menuInner { position: relative; }',
  '#sfxMenuBtn { position: absolute; top: 0; right: 3px; z-index: 3; width: 44px; height: 44px; padding: 0; background-color: var(--panel2); display: flex; align-items: center; justify-content: center; cursor: pointer; }',
  '#menu .menuHead.metaHead ~ #sfxMenuBtn { top: 12px; right: 14px; }',
  '#sfxMenuBtn svg { display: block; width: 26px; height: 22px; }',
  '#sfxPop { position: absolute; top: 52px; right: 6px; z-index: 6; width: min(310px, calc(100% - 12px)); padding: 9px 12px; animation: kmPanelIn 0.15s steps(3, jump-start); }',
  '#menu .menuHead.metaHead ~ #sfxPop { top: 64px; right: 10px; }',
  // 矮屏横屏（笔记本窗口）：标题行照常显示（按钮在它右边，不压住骑士头像），按钮小一点
  '@media (max-height: 700px) and (orientation: landscape) {',
  '  #menu .menuInner .menuHead { display: block; min-height: 34px; }',
  '  #sfxMenuBtn { width: 38px; height: 38px; }',
  '  #sfxMenuBtn svg { width: 22px; height: 19px; }',
  '  #menu .menuHead.metaHead ~ #sfxMenuBtn { top: 12px; width: 36px; height: 36px; }',
  '  #sfxPop { top: 44px; }',
  '}',
  // 暂停界面：放在右栏（武器纹章 / 宝物 / 超武）最下面，那里有空，不会把弹窗撑高
  '.sfxPause { margin-top: 12px; }',
  '@media (prefers-reduced-motion: reduce) { #sfxPop { animation: none; } }'
].join('\n');

SFX.injectCss = function () {
  if (document.getElementById('sfxStyle')) return;
  var st = document.createElement('style');
  st.id = 'sfxStyle';
  st.textContent = SFX.CSS;
  (document.head || document.documentElement).appendChild(st);
};

// 一个设置控件（可以建好几个，改一个其他的跟着变）。opt.title：标题行（标题 + 右边的静音）
SFX.buildSettings = function (container, opt) {
  if (!container) return null;
  SFX.injectCss();
  opt = opt || {};
  var box = document.createElement('div');
  box.className = 'sfxSet';
  var row = function (k, label) {
    return '<label class="sfxRow"><span class="sfxLbl">' + label + '</span><input type="range" min="0" max="100" step="1" data-sfx="' + k + '" aria-label="' + label + '音量"><span class="sfxVal" data-sfxv="' + k + '"></span></label>';
  };
  var mute = '<label class="sfxRow sfxMuteRow"><input type="checkbox" data-sfx="muted"><span class="sfxBox"></span><span>静音</span></label>';
  var sliders = '<div class="sfxSliders">' + row('music', '音乐') + row('sfx', '音效') + '</div>';
  box.innerHTML = (opt.title ? '<div class="sfxTop"><span class="sfxTitle">' + opt.title + '</span>' + mute + '</div>' + sliders : sliders + mute) +
    (SFX.ok ? '' : '<div class="sfxNote">这台设备的浏览器不支持网页声音</div>');
  var lastPrev = 0;
  box.addEventListener('input', function (e) {
    var el = e.target, k = el && el.dataset && el.dataset.sfx;
    if (k === 'music' || k === 'sfx') {
      SFX.setVolume(k, el.value);
      // 拖音效滑条时响一下，听得出多大声
      if (k === 'sfx' && Date.now() - lastPrev > 140) { lastPrev = Date.now(); SFX.play('tick', { vol: 1.6 }); }
    }
  });
  box.addEventListener('change', function (e) {
    var el = e.target, k = el && el.dataset && el.dataset.sfx;
    if (k === 'muted') SFX.setMuted(el.checked);
    else if (k === 'music' || k === 'sfx') { SFX.setVolume(k, el.value); SFX.save(); }
  });
  container.appendChild(box);
  SFX.syncUI();
  return box;
};

// 所有设置控件、菜单喇叭跟着当前音量更新
SFX.syncUI = function () {
  var v = SFX.vol, sets = document.querySelectorAll('.sfxSet');
  for (var i = 0; i < sets.length; i++) {
    var s = sets[i];
    s.classList.toggle('muted', !!v.muted);
    var ins = s.querySelectorAll('[data-sfx]');
    for (var j = 0; j < ins.length; j++) {
      var el = ins[j], k = el.dataset.sfx;
      if (k === 'muted') el.checked = !!v.muted;
      else if (String(el.value) !== String(v[k]) && document.activeElement !== el) el.value = String(v[k]);
    }
    var vs = s.querySelectorAll('[data-sfxv]');
    for (j = 0; j < vs.length; j++) vs[j].textContent = String(v[vs[j].dataset.sfxv]);
  }
  var btn = document.getElementById('sfxMenuBtn');
  if (btn) {
    var off = v.muted || (v.music === 0 && v.sfx === 0);
    if (btn.__off !== off) { btn.__off = off; btn.innerHTML = SFX.speakerSvg(off); }
  }
};

// 像素喇叭（13×11 格；关掉时右边是红叉）
SFX.SPEAKER = [
  '.....kk......',
  '....kwk...w..',
  '...kwwk....w.',
  'kkkwwwk.w...w',
  'kwwwwgk..w..w',
  'kwwwwgk..w..w',
  'kwwwwgk..w..w',
  'kkkwwgk.w...w',
  '...kwgk....w.',
  '....kgk...w..',
  '.....kk......'
];
SFX.SPEAKER_OFF = [
  '.....kk......',
  '....kwk......',
  '...kwwk......',
  'kkkwwwk.r...r',
  'kwwwwgk..r.r.',
  'kwwwwgk...r..',
  'kwwwwgk..r.r.',
  'kkkwwgk.r...r',
  '...kwgk......',
  '....kgk......',
  '.....kk......'
];
SFX.speakerSvg = function (off) {
  var rows = off ? SFX.SPEAKER_OFF : SFX.SPEAKER, pal = { k: '#000000', w: '#ffffff', g: '#b9c2d2', r: '#ff4b3a' }, paths = {};
  for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) {
    var ch = rows[y][x];
    if (pal[ch]) paths[ch] = (paths[ch] || '') + 'M' + x + ' ' + y + 'h1v1h-1z';
  }
  var s = '<svg viewBox="0 0 13 11" shape-rendering="crispEdges" aria-hidden="true">';
  for (var c in paths) s += '<path fill="' + pal[c] + '" d="' + paths[c] + '"/>';
  return s + '</svg>';
};

// 主菜单：面板右上角的喇叭按钮 + 小弹窗
SFX.injectMenu = function () {
  var inner = document.querySelector('#menu .menuInner');
  if (!inner || document.getElementById('sfxMenuBtn')) return;
  SFX.injectCss();
  var btn = document.createElement('button');
  btn.id = 'sfxMenuBtn';
  btn.type = 'button';
  btn.setAttribute('aria-label', '声音设置');
  btn.title = '声音设置';
  inner.appendChild(btn);
  var pop = document.createElement('div');
  pop.id = 'sfxPop';
  pop.className = 'hidden';
  inner.appendChild(pop);
  SFX.buildSettings(pop, { title: '声音' });
  var open = function (on) {
    pop.classList.toggle('hidden', !on);
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  btn.addEventListener('click', function (e) {
    e.stopPropagation();
    var on = pop.classList.contains('hidden');
    open(on);
    SFX.play(on ? 'open' : 'close');
  });
  // 点弹窗外面就关上
  document.addEventListener('pointerdown', function (e) {
    if (pop.classList.contains('hidden')) return;
    if (pop.contains(e.target) || btn.contains(e.target)) return;
    open(false);
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !pop.classList.contains('hidden')) open(false); });
  SFX.closeMenuPop = function () { open(false); };
  SFX.syncUI();
};

// 暂停界面：放在右栏（武器纹章、宝物、超武）最下面；找不到右栏就接在「设置」那一栏后面
SFX.injectPause = function () {
  if (document.querySelector('#pauseModal .sfxSet')) return;
  var host = document.querySelector('#pauseModal .pcInv');
  if (!host) {
    var sens = document.getElementById('sensSlider');
    var lab = sens && sens.closest ? sens.closest('label') : null;
    host = lab ? lab.parentNode : document.querySelector('#pauseModal .pcSet');
  }
  if (!host) return;
  var wrap = document.createElement('div');
  wrap.className = 'sfxPause';
  host.appendChild(wrap);
  SFX.buildSettings(wrap, { title: '声音' });
};

// 脚本在页面最后加载，菜单的元素已经在了（暂停界面的设置在第一次打开暂停时加，接在其他设置后面）
try { SFX.injectMenu(); } catch (e) { SFX.err(e); }
