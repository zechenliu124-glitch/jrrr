'use strict';
// ============================================================
//  设置面板「设置」（只包装别的文件的函数、搬动已有的控件，不改它们的源码）
//  · 入口：主菜单 #metaBar 最后一个「设置」按钮；暂停界面按钮行「继续」后面的「设置」
//  · 画面：画质 高 / 中 / 低（渲染分辨率、圆形影子、特效上限）、屏幕震动、闪光、伤害数字、减弱动态效果、显示速度
//  · 操作：视角灵敏度、滑铲按钮方式（原来暂停界面里的控件搬过来，id 不变，存的值照旧）
//  · 声音：SFX.buildSettings（和主菜单喇叭弹窗是同一套逻辑，改一个另一个跟着变）
//  · 存档：说明进度存在哪里
//  新的设置存在 localStorage 'knight_magic_prefs'；屏幕震动、闪光用 FEEL 自己的 Feel.setOpt（'knight_magic_feel'）
//  默认值 = 以前的样子。规则见 docs/knight-magic/design/SETTINGS_NOTES.md
// ============================================================
var Settings = {
  KEY: 'knight_magic_prefs', VER: 1,
  v: { quality: 'high', dmgNums: true, motion: 'system' },
  base: {}, open: false, from: null, ready: false, el: null, mq: null,
  // 画质：渲染比例、圆形影子 [最多几个, 多远以内, 只给 Boss / 小 Boss / 精英]、特效上限（高 = 今天的值）
  Q: {
    high: { scale: 1, shadow: null, part: 700, glow: 1500, effect: 48, texts: 60, chunk: 420, box: 280, gem: 160, spark: 180 },
    mid: { scale: 0.85, shadow: [160, 30, false], part: 450, glow: 1000, effect: 40, texts: 45, chunk: 252, box: 168, gem: 96, spark: 120 },
    low: { scale: 0.7, shadow: [24, 45, true], part: 250, glow: 600, effect: 32, texts: 30, chunk: 126, box: 84, gem: 48, spark: 60 }
  },
  QUALITY: [['high', '高'], ['mid', '中'], ['low', '低']],
  QDESC: { high: '最清晰', mid: '画面稍糊 · 更省电', low: '最省电 · 特效变少' },
  MOTION: [['system', '跟随系统'], ['on', '开'], ['off', '关']],
  MDESC: { on: '弹窗和卡片直接出现', off: '保留进场动画' }
};

// 上限：[对象名, 属性, Q 里的键]。初始化时按今天的值建好缓冲，之后只往下调
Settings.CAPS = [
  ['FX', 'PART_CAP', 'part'], ['FX', 'GLOW_CAP', 'glow'], ['FX', 'EFFECT_CAP', 'effect'], ['FX', 'MAX_TEXTS', 'texts'],
  ['FeelFX', 'CAP', 'chunk'], ['FeelFX', 'BOX_CAP', 'box'], ['FeelFX', 'GEM_CAP', 'gem'], ['FeelFX', 'SPARK_CAP', 'spark']
];
Settings.obj = function (name) { return name === 'FX' ? (typeof FX !== 'undefined' ? FX : null) : (typeof FeelFX !== 'undefined' ? FeelFX : null); };

// ---------------- 存取 ----------------
Settings.load = function () {
  try {
    var s = JSON.parse(localStorage.getItem(Settings.KEY) || 'null');
    if (!s || typeof s !== 'object') return;
    if (Settings.Q[s.quality] && Object.prototype.hasOwnProperty.call(Settings.Q, s.quality)) Settings.v.quality = s.quality;
    if (typeof s.dmgNums === 'boolean') Settings.v.dmgNums = s.dmgNums;
    if (s.motion === 'system' || s.motion === 'on' || s.motion === 'off') Settings.v.motion = s.motion;
  } catch (e) { /* 没有本地存储就用默认值 */ }
};
Settings.save = function () {
  try { localStorage.setItem(Settings.KEY, JSON.stringify({ v: Settings.VER, quality: Settings.v.quality, dmgNums: Settings.v.dmgNums, motion: Settings.v.motion })); } catch (e) { /* 忽略 */ }
};

Settings.feelOn = function (k) { return typeof Feel !== 'undefined' && Feel.opts ? Feel.opts[k] > 0 : true; };

// 改一项：存下来、马上生效、面板跟着变
Settings.set = function (k, val) {
  var v = Settings.v;
  if (k === 'quality') { if (!Object.prototype.hasOwnProperty.call(Settings.Q, val)) return false; v.quality = val; Settings.save(); Settings.applyQuality(); }
  else if (k === 'motion') { if (val !== 'system' && val !== 'on' && val !== 'off') return false; v.motion = val; Settings.save(); Settings.applyMotion(); }
  else if (k === 'dmgNums') { v.dmgNums = !!val; Settings.save(); }
  else if (k === 'shake' || k === 'flash') {
    if (typeof Feel === 'undefined' || !Feel.setOpt) return false;
    Feel.setOpt(k, val ? 1 : 0);
    Settings.applyFlash();
  } else return false;
  Settings.render();
  return true;
};

// ---------------- 减弱动态效果 ----------------
Settings.RMQ = '(prefers-reduced-motion: reduce)';
Settings.sysRM = function () {
  try {
    if (!window.matchMedia) return false;
    if (!Settings.mq) Settings.mq = window.matchMedia(Settings.RMQ);
    // 每次重新问一次（留着的那个要等下一次画面更新才变）
    return !!window.matchMedia(Settings.RMQ).matches;
  } catch (e) { return false; }
};
Settings.rm = function () { var m = Settings.v.motion; return m === 'on' || (m === 'system' && Settings.sysRM()); };
Settings.applyMotion = function () { if (document.body) document.body.classList.toggle('kmRM', Settings.rm()); };
// 闪光关掉：低血量的红框不跳（还在，亮度是 FEEL 的下限）、地图上的全屏闪一下不出
Settings.applyFlash = function () { if (document.body) document.body.classList.toggle('kmNoFlash', !Settings.feelOn('flash')); };

// ---------------- 画质 ----------------
Settings.q = function () { return Settings.Q[Settings.v.quality] || Settings.Q.high; };
Settings.recordBase = function () {
  Settings.CAPS.forEach(function (c) {
    var o = Settings.obj(c[0]);
    if (o && typeof o[c[1]] === 'number') Settings.base[c[0] + '.' + c[1]] = o[c[1]];
  });
};
// 只在 Game.init 之后调（缓冲已经按默认值建好）；只会比默认值小，回到「高」就是原来的值
Settings.applyCaps = function () {
  if (!Settings.ready) return;
  var q = Settings.q();
  Settings.CAPS.forEach(function (c) {
    var o = Settings.obj(c[0]), b = Settings.base[c[0] + '.' + c[1]];
    if (!o || typeof b !== 'number') return;
    o[c[1]] = Settings.v.quality === 'high' ? b : Math.min(b, q[c[2]]);
  });
};
Settings.applyQuality = function () {
  Settings.applyCaps();
  try { if (typeof Game !== 'undefined' && Game.renderer && Game.camera) Game.resize(); } catch (e) { /* 忽略 */ }
};
// 中 / 低的圆形影子：和 fx.js 的 Shadows.update 一样的循环，个数和距离换成参数
Settings.shadows = function (cap, range, bigOnly) {
  var n = 0;
  Shadows.put(n++, P.pos.x, P.pos.z, P.pos.y, 0.7);
  var list = Enemies.list;
  for (var i = 0; i < list.length && n < cap; i++) {
    var e = list[i];
    if (!e.alive) continue;
    if (bigOnly && !(e.boss || e.mini || e.elite)) continue;
    if (Math.abs(e.x - P.pos.x) > range || Math.abs(e.z - P.pos.z) > range) continue;
    Shadows.put(n++, e.x, e.z, e.y, e.r * 1.1);
  }
  Shadows.mesh.count = n;
  Shadows.mesh.instanceMatrix.needsUpdate = true;
};

// ---------------- 面板 ----------------
// 只写布局、字号和颜色变量；面板、凹槽、按钮、选中、勾选框、滑条的样子都在 css/kit.css 和 style.css
Settings.CSS = [
  '#setLayer { position: fixed; inset: 0; z-index: 21; display: flex; align-items: center; justify-content: center; padding: max(12px, env(safe-area-inset-top, 0px)) max(12px, env(safe-area-inset-right, 0px)) max(12px, env(safe-area-inset-bottom, 0px)) max(12px, env(safe-area-inset-left, 0px)); background: rgba(3, 7, 16, 0.72); }',
  '#setLayer .setPanel { width: min(920px, 100%); }',
  '.setCols { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 12px; align-items: start; }',
  '.setColB { display: flex; flex-direction: column; gap: 12px; min-width: 0; }',
  '.setSave { grid-column: 1 / -1; }',
  '.setWell { min-width: 0; padding: 9px 12px 9px; }',
  '#setLayer .setWell h3 { margin: 0 0 3px; }',
  // 一行一个设置：左边 18 号的名字，右边控件，至少 48 像素高
  '.setRow { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; font-size: var(--fs-m); line-height: 24px; color: #fff; text-shadow: none; }',
  '.setLbl { flex: none; white-space: nowrap; }',
  '.setOpts { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }',
  '.setOpts .sbtn { min-width: 48px; }',
  // 分段选项下面一行 18 号灰字：说明选中的那一项
  '.setDesc { margin: 0 0 6px; font-size: var(--fs-m); line-height: 24px; color: var(--muted); }',
  'label.setChk { cursor: pointer; }',
  '.setChk input { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }',
  '.setChk .kmCheck { flex: none; }',
  '.setChk input:focus-visible + .kmCheck { outline: 2px solid #fff; outline-offset: 2px; }',
  // 滑条的数值：18 号金色像素数字
  '.setVal { flex: none; min-width: 2.2em; text-align: right; font-size: var(--fs-m); line-height: 24px; letter-spacing: var(--o); color: var(--goldM); }',
  // 搬过来的控件（视角灵敏度、显示速度、滑铲按钮、声音）：只对齐，样子不变
  '#setLayer .setting { min-height: 48px; margin-top: 0; gap: 12px; justify-content: space-between; line-height: 24px; color: #fff; }',
  '#setLayer .mvSet { flex-direction: row-reverse; justify-content: space-between; }',
  '#setLayer .mvSet.mvTouch { flex-direction: row; flex-wrap: nowrap; }',
  '#setLayer input[type=range] { flex: 1 1 auto; width: auto; min-width: 80px; max-width: 260px; margin-left: auto; }',
  '#setLayer .sfxSliders { gap: 0; }',
  '#setLayer .sfxSliders .sfxRow { flex-basis: 100%; }',
  '#setLayer .sfxRow { min-height: 48px; gap: 12px; }',
  '#setLayer .sfxMuteRow { flex-direction: row-reverse; justify-content: space-between; padding: 0; }',
  '.setSaveT { font-size: var(--fs-m); line-height: 24px; color: var(--text2); }',
  '.setSaveS { margin-top: 3px; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '@media (orientation: portrait), (max-width: 760px) { .setCols { grid-template-columns: minmax(0, 1fr); } }',
  // 暂停界面：「设置」那一栏只剩标题，藏起来；操作说明一栏占满；矮屏横屏连操作说明也藏了，整栏不要
  '#pauseModal .pcSet.setEmpty { grid-template-columns: minmax(0, 1fr); }',
  '@media (max-height: 700px) and (orientation: landscape) { #pauseModal .pcSet.setEmpty { display: none; } }',
  // 闪光关掉：低血量红框不跳、地图上的全屏闪和受伤红框不出
  'body.kmNoFlash #fxLow.on i, body.kmNoFlash #hurt.on, body.kmNoFlash #mxFlash.on { animation: none !important; }',
  // 减弱动态效果：进场动画都去掉（!important：盖过升级卡片、宝箱这些更具体的规则）
  'body.kmRM .modal, body.kmRM .modal *, body.kmRM .card, body.kmRM .toast, body.kmRM .mlPanel, body.kmRM #metaNotice,' +
  ' body.kmRM .mToast, body.kmRM .kmSlip, body.kmRM .meItem, body.kmRM .meNum.pop, body.kmRM #charGrid .charCard.mJust,' +
  ' body.kmRM .mhCasual.pulse, body.kmRM #sfxPop, body.kmRM #annLayer *, body.kmRM #fxCineT *, body.kmRM #fxBig *,' +
  ' body.kmRM #fxWarp, body.kmRM #fxWarp *, body.kmRM #hpBar.low #hpFill::after, body.kmRM #goldBox.pop, body.kmRM #fxLow.on i,' +
  ' body.kmRM #weaponSlots .slot.evoReady::before { animation: none !important; }',
  'body.kmRM #weaponSlots .slot.evoReady::before { opacity: 1; }',
  'body.kmRM .fxPop, body.kmRM .fxPopRing { display: none !important; }'
].join('\n');

Settings.injectCss = function () {
  if (document.getElementById('setStyle')) return;
  var st = document.createElement('style');
  st.id = 'setStyle';
  st.textContent = Settings.CSS;
  (document.head || document.documentElement).appendChild(st);
};

Settings.segHtml = function (k, label, opts) {
  return '<div class="setRow"><span class="setLbl">' + label + '</span><span class="setOpts" data-sk="' + k + '">' +
    opts.map(function (o) { return '<button type="button" class="sbtn kmSmall" data-v="' + o[0] + '">' + o[1] + '</button>'; }).join('') +
    '</span></div><div class="setDesc" data-sd="' + k + '"></div>';
};
Settings.chkHtml = function (k, label) {
  return '<label class="setRow setChk"><span class="setLbl">' + label + '</span><input type="checkbox" data-sk="' + k + '"><span class="kmCheck"></span></label>';
};

// 建面板（UI.loadSettings 时：Pace、MoveUI 已经把它们的控件放好了），把原来暂停界面里的控件搬进来
Settings.build = function () {
  if (Settings.el || !document.body) return Settings.el;
  Settings.injectCss();
  if (typeof Meta !== 'undefined' && Meta.injectCss) { try { Meta.injectCss(); } catch (e) { /* 忽略 */ } }
  var L = document.createElement('div');
  L.id = 'setLayer';
  L.className = 'hidden';
  L.innerHTML = '<div class="mlPanel setPanel" role="dialog" aria-modal="true" aria-label="设置">' +
    '<div class="mlHead"><h2>设置</h2><button type="button" class="mlClose" aria-label="关闭">✕</button></div>' +
    '<div class="mlBody"><div class="setCols">' +
    '<div class="kmWell setWell setView"><h3>画面</h3>' + Settings.segHtml('quality', '画质', Settings.QUALITY) +
    Settings.chkHtml('shake', '屏幕震动') + Settings.chkHtml('flash', '闪光') + Settings.chkHtml('dmgNums', '伤害数字') +
    Settings.segHtml('motion', '减弱动态效果', Settings.MOTION) + '</div>' +
    '<div class="setColB"><div class="kmWell setWell setCtrl"><h3>操作</h3></div><div class="kmWell setWell setSound"><h3>声音</h3></div></div>' +
    '<div class="kmWell setWell setSave"><h3>存档</h3><div class="setSaveT"></div><div class="setSaveS"></div></div>' +
    '</div></div></div>';
  document.body.appendChild(L);
  Settings.el = L;
  var view = L.querySelector('.setView'), ctrl = L.querySelector('.setCtrl'), sound = L.querySelector('.setSound');
  // 搬：视角灵敏度（加一个金色数值）、滑铲按钮方式 → 操作；显示速度 → 画面
  var sens = document.getElementById('sensSlider');
  var lab = sens && sens.closest ? sens.closest('label') : null;
  if (lab) {
    if (!lab.querySelector('.setVal')) { var val = document.createElement('span'); val.className = 'setVal'; lab.appendChild(val); }
    ctrl.appendChild(lab);
    sens.addEventListener('input', Settings.renderSens);
  }
  var touch = document.querySelector('.mvTouch');
  if (touch) ctrl.appendChild(touch);
  var sp = document.getElementById('optSpeed');
  var spl = sp && sp.closest ? sp.closest('label') : null;
  if (spl) view.appendChild(spl);
  // 声音：AUDIO 自己的控件（音乐、音效、静音）
  if (typeof SFX !== 'undefined' && SFX.buildSettings) { try { SFX.buildSettings(sound); } catch (e) { /* 忽略 */ } }
  // 暂停界面：原来的「设置」一栏只剩标题，藏起来；按钮行「继续」后面加「设置」
  var ps = document.querySelector('#pauseModal .pcSet');
  if (ps && ps.firstElementChild) { ps.firstElementChild.classList.add('hidden'); ps.classList.add('setEmpty'); }
  var row = document.querySelector('#pauseModal > .row');
  if (row && !row.querySelector('[data-set]')) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'sbtn';
    b.dataset.set = 'open';
    b.textContent = '设置';
    var res = row.querySelector('[data-act="resume"]');
    row.insertBefore(b, res ? res.nextSibling : row.firstChild);
  }
  L.addEventListener('click', function (e) {
    var t = e.target;
    if (t === L || (t.closest && t.closest('.mlClose'))) { Settings.closePanel(); return; }
    var bt = t.closest && t.closest('.setOpts button[data-v]');
    if (bt) Settings.set(bt.parentNode.dataset.sk, bt.dataset.v);
  });
  L.addEventListener('change', function (e) {
    var t = e.target;
    if (t && t.type === 'checkbox' && t.dataset && t.dataset.sk) Settings.set(t.dataset.sk, t.checked);
  });
  Settings.render();
  return L;
};

Settings.renderSens = function () {
  var s = document.getElementById('sensSlider'), v = Settings.el && Settings.el.querySelector('.setVal');
  if (s && v) v.textContent = (Math.round(parseFloat(s.value) * 10) / 10).toFixed(1);
};

// 面板上的选中、勾、说明跟着当前的值
Settings.render = function () {
  var L = Settings.el;
  if (!L) return;
  var v = Settings.v, cur = { quality: v.quality, motion: v.motion };
  Array.prototype.forEach.call(L.querySelectorAll('.setOpts[data-sk]'), function (g) {
    Array.prototype.forEach.call(g.querySelectorAll('button[data-v]'), function (b) {
      var on = b.dataset.v === cur[g.dataset.sk];
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  });
  var chk = { shake: Settings.feelOn('shake'), flash: Settings.feelOn('flash'), dmgNums: !!v.dmgNums };
  Array.prototype.forEach.call(L.querySelectorAll('input[type=checkbox][data-sk]'), function (c) { c.checked = !!chk[c.dataset.sk]; });
  var dq = L.querySelector('[data-sd="quality"]'), dm = L.querySelector('[data-sd="motion"]');
  if (dq) dq.textContent = Settings.QDESC[v.quality] || '';
  if (dm) dm.textContent = v.motion === 'system' ? '跟随系统设置 · 现在是' + (Settings.sysRM() ? '开' : '关') : Settings.MDESC[v.motion];
  // 存档：继续上一局（RESUME）在的时候说每关开始时存一次
  var hasResume = typeof Resume !== 'undefined' && Resume && Resume.KEY;
  L.querySelector('.setSaveT').textContent = '进度自动保存在这台设备上';
  L.querySelector('.setSaveS').textContent = hasResume ? '每关开始时存一次 · 关掉 App 下次可以继续' : '魔晶、成就、记录和设置随时保存';
  Settings.renderSens();
};

Settings.isOpen = function () { return !!Settings.open; };
Settings.openPanel = function (from) {
  var L = Settings.build();
  if (!L) return false;
  from = from || (typeof Game !== 'undefined' && Game.state === 'menu' ? 'menu' : 'pause');
  if (from === 'menu') {
    try { if (typeof Meta !== 'undefined' && Meta.closeAll) Meta.closeAll(); } catch (e) { /* 忽略 */ }
    try { if (typeof SFX !== 'undefined' && SFX.closeMenuPop) SFX.closeMenuPop(); } catch (e) { /* 忽略 */ }
  }
  Settings.from = from;
  try { if (typeof MoveUI !== 'undefined' && MoveUI.refresh) MoveUI.refresh(); } catch (e) { /* 忽略 */ }
  try { if (typeof SFX !== 'undefined' && SFX.syncUI) SFX.syncUI(); } catch (e) { /* 忽略 */ }
  Settings.render();
  var body = L.querySelector('.mlBody');
  if (body) body.scrollTop = 0;
  L.classList.remove('hidden');
  Settings.open = true;
  return true;
};
Settings.closePanel = function () {
  if (Settings.el) Settings.el.classList.add('hidden');
  Settings.open = false;
  Settings.from = null;
};

// ---------------- 包装（脚本加载时） ----------------
(function () {
  Settings.load();
  Settings.recordBase();
  if (typeof Shadows !== 'undefined') Settings.base.shadow = [520, 45];
  Settings.applyMotion();

  // 伤害数字关掉：不出数字（暴击的那颗金色 / 红色星光照样有）；闪避、格挡、回血、处决、拾取的字不受影响
  if (typeof FX !== 'undefined' && FX.damage) {
    var dmg0 = FX.damage;
    FX.damage = function (x, y, z, dmg, crit) {
      if (Settings.v.dmgNums) return dmg0.apply(this, arguments);
      if (crit) FX.flash(x, y - 0.3, z, (crit === 2 ? 1.6 : 1.1) * 1.3, crit === 2 ? 0xff5030 : 0xffd23a, 0.18, 2);
    };
  }
  // 中 / 低画质的圆形影子
  if (typeof Shadows !== 'undefined' && Shadows.update) {
    var sh0 = Shadows.update;
    Shadows.update = function () {
      var s = Settings.q().shadow;
      if (!s || !Settings.ready || !Shadows.mesh) return sh0.apply(this, arguments);
      Settings.shadows(s[0], s[1], s[2]);
    };
  }
  // 闪光关掉：地图上的全屏闪一下不出（风之碑这些）
  if (typeof MX !== 'undefined' && MX.flash) {
    var mf0 = MX.flash;
    MX.flash = function () { if (!Settings.feelOn('flash')) return; return mf0.apply(this, arguments); };
  }
  // 减弱动态效果：结算的魔晶数字直接写最后的数
  if (typeof Meta !== 'undefined' && Meta.countUp) {
    var cu0 = Meta.countUp;
    Meta.countUp = function (el, total) {
      if (el && Settings.rm()) { Meta.cuToken = (Meta.cuToken || 0) + 1; el.textContent = '+' + Meta.fmt(total); return; }
      return cu0.apply(this, arguments);
    };
  }
  // 受伤方向红带：少动画时不分格（feel.js 读 Feel.rmq.matches）
  if (typeof Feel !== 'undefined') Feel.rmq = { get matches() { return Settings.rm(); } };
  // 暂停界面不再放声音设置（在面板里）
  if (typeof SFX !== 'undefined') SFX.injectPause = function () {};

  if (typeof UI !== 'undefined') {
    // 主菜单：#metaBar 最后加「设置」（没有 #metaBar 时放在开始游戏后面）
    var bm = UI.buildMenu;
    UI.buildMenu = function () {
      var r = bm.apply(this, arguments);
      try { Settings.menuButton(); } catch (e) { /* 忽略 */ }
      return r;
    };
    var ls = UI.loadSettings;
    UI.loadSettings = function () {
      var r = ls.apply(this, arguments);
      try { Settings.build(); } catch (e) { try { console.warn('[Settings] ' + e.message); } catch (e2) { /* 忽略 */ } }
      return r;
    };
  }

  // 系统的「减弱动态效果」改了：跟随系统时马上跟着变
  try {
    Settings.sysRM();
    if (Settings.mq) {
      var onMq = function () { Settings.applyMotion(); Settings.render(); };
      if (Settings.mq.addEventListener) Settings.mq.addEventListener('change', onMq);
      else if (Settings.mq.addListener) Settings.mq.addListener(onMq);
    }
  } catch (e) { /* 忽略 */ }

  // Esc 关面板（捕获阶段先拿到，暂停中的游戏不会跟着继续）；面板开着时 P 也不让它继续
  window.addEventListener('keydown', function (e) {
    if (!Settings.open) return;
    var esc = e.key === 'Escape' || e.code === 'Escape';
    if (esc || e.code === 'KeyP') {
      e.stopImmediatePropagation();
      e.preventDefault();
      if (esc) Settings.closePanel();
    }
  }, true);
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-set="open"]');
    if (b && !b.disabled) Settings.openPanel();
  });

  // Game.* 在 main.js（最后加载）：在 load 里包装（这个监听比 main.js 的先注册，先执行）
  window.addEventListener('load', function () {
    Settings.applyFlash();
    if (typeof Game === 'undefined') return;
    // 渲染比例：Game.resize 算好像素比以后再乘 1 / 0.85 / 0.7（Game.init 按属性注册 resize，所以要在 init 之前包）
    var rs = Game.resize;
    if (rs) Game.resize = function () {
      var r = rs.apply(this, arguments);
      var k = Settings.q().scale, R = Game.renderer;
      if (k < 1 && R) { R.setPixelRatio(Math.max(0.25, R.getPixelRatio() * k)); R.setSize(window.innerWidth, window.innerHeight, false); }
      return r;
    };
    // 特效上限：初始化（按默认值建好缓冲）以后才调
    var init = Game.init;
    if (init) Game.init = function () {
      var r = init.apply(this, arguments);
      Settings.ready = true;
      Settings.applyCaps();
      return r;
    };
    ['start', 'toMenu'].forEach(function (k) {
      var f = Game[k];
      if (f) Game[k] = function () { Settings.closePanel(); return f.apply(this, arguments); };
    });
    // 减弱动态效果：弹窗背景不淡入（FEEL 的包装在这之前装好，Feel.bgAnim 已经开始了就取消）
    if (typeof UI !== 'undefined' && UI.openModal) {
      var om = UI.openModal;
      UI.openModal = function () {
        var r = om.apply(this, arguments);
        if (Settings.rm() && typeof Feel !== 'undefined' && Feel.bgAnim && Feel.bgAnim.cancel) { Feel.bgAnim.cancel(); Feel.bgAnim = null; }
        return r;
      };
    }
  });
})();

Settings.menuButton = function () {
  if (document.querySelector('#menu [data-set="open"]')) return;
  var b = document.createElement('button');
  b.type = 'button';
  b.className = 'sbtn kmSmall';
  b.dataset.set = 'open';
  b.textContent = '设置';
  var bar = document.getElementById('metaBar');
  if (bar) { bar.appendChild(b); return; }
  var start = document.querySelector('#menu [data-act="start"]');
  if (start && start.parentNode) start.parentNode.insertBefore(b, start.nextSibling);
};
