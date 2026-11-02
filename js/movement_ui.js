'use strict';
// ============================================================
//  移动手感相关的界面（只包装 UI 的函数，不改 ui.js）：
//  左下角的速度读数（暂停设置里「显示速度」开关）、触屏「滑铲按钮：点按切换 / 按住」设置，和其他设置一起存；
//  主菜单角色介绍里的滑铲坐骑、坐骑特性、摔落伤害；弹窗打开时收起触屏的“保持滑铲”
// ============================================================
var MoveUI = { showSpeed: false, KEY: 'knight_magic_settings', shownV: -1, shownTier: -1 };

// 坐骑特性说明（RIDES[角色].twist.kind）
MoveUI.TWIST_TEXT = {
  board: '坐骑特性：一直按住滑铲就能一直滑；转动视角压弯会加速；空中踩着滑板继续加速',
  hover: '坐骑特性：离地悬空滑行，摩擦更小、上坡减速减半；滑铲时放电积蓄翻倍',
  dive: '坐骑特性：空中按住滑铲俯冲，落地把冲击变成往前冲的速度',
  shadow: '坐骑特性：滑铲时闪避大幅提高',
  frost: '坐骑特性：高速滑铲时身后结出薄冰，冻住踩上去的敌人',
  moon: '坐骑特性：空中按住滑铲，下落变慢'
};

// 摔落伤害倍率 → 角色属性里的一句话
MoveUI.fallText = function (k) {
  if (k == null || k === 1) return '';
  if (k <= 0) return '不受摔落伤害';
  return '摔落伤害 ' + (k < 1 ? '−' : '+') + Math.round(Math.abs(k - 1) * 100) + '%';
};

// 速度读数的颜色：15 以下白色，15~30 青色，30 以上金色
MoveUI.tier = function (v) { return v < 15 ? 0 : v <= 30 ? 1 : 2; };
MoveUI.TIER_COLORS = ['#ffffff', '#7ef0ff', '#ffc928'];

MoveUI.CSS = [
  '#speedText { font-family: var(--font-mix); font-weight: 800; font-size: 18px; line-height: 1.2; color: #fff; text-shadow: var(--ol1), 0 2px 0 #000; white-space: nowrap; }',
  '.mvSet { margin-top: 8px; cursor: pointer; }',
  '.mvSet input[type=checkbox] { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }',
  '.mvBox { flex: none; width: 22px; height: 22px; border: 2px solid #000; background: #0b1020; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.14); position: relative; }',
  '.mvSet input:checked + .mvBox { background: var(--accent, #ffd84a); box-shadow: inset 0 -4px 0 #b88f12; }',
  '.mvSet input:checked + .mvBox::after { content: ""; position: absolute; left: 6px; top: 1px; width: 5px; height: 11px; border: solid #000; border-width: 0 3px 3px 0; transform: rotate(45deg); }',
  '.mvSet input:focus-visible + .mvBox { outline: 2px solid #fff; outline-offset: 2px; }',
  '.mvTouch { display: none; flex-wrap: wrap; cursor: default; }',
  'body.touch .mvTouch { display: flex; }',
  '.mvOpts { display: inline-flex; gap: 6px; }',
  '.mvOpts button { min-height: 40px; padding: 4px 12px; border: 3px solid #000; border-radius: 0; background: var(--panel2, #1a2542); color: #fff; font-weight: 800; font-size: 15px; text-shadow: var(--ol1); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.16), inset 0 -3px 0 rgba(0, 0, 0, 0.35), 0 3px 0 #000; cursor: pointer; touch-action: manipulation; }',
  '.mvOpts button.sel { background: #b8860f; }',
  '.mvOpts button:active { transform: translateY(2px); box-shadow: inset 0 2px 0 rgba(255, 255, 255, 0.16), 0 1px 0 #000; }',
  // 触屏滑铲键“保持”中：亮蓝色 + 外圈发光，一眼看出滑铲还按着
  '#touchBtns #btnSlide.on { background: #3f95ff; box-shadow: inset 0 5px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 rgba(0, 0, 0, 0.3), 0 1px 0 #000, 0 0 0 4px #bff0ff, 0 0 20px 6px rgba(127, 220, 255, 0.8); }',
  '.cdRide { color: #cfe8ff; }',
  '.cdRide .cdRideDesc { color: var(--muted, #a9b6d3); font-size: 13px; }',
  '.cdTwist { font-size: 13px; color: #9fe8ff; }'
].join('\n');

// ---------------- 设置存取：包装 UI.saveSettings / UI.loadSettings（和 pace.js 一样） ----------------
(function () {
  var save = UI.saveSettings, load = UI.loadSettings;
  UI.saveSettings = function () {
    save.apply(this, arguments);
    try {
      var s = JSON.parse(localStorage.getItem(MoveUI.KEY) || '{}');
      s.showSpeed = MoveUI.showSpeed;
      s.slideMode = Input.slideMode;
      localStorage.setItem(MoveUI.KEY, JSON.stringify(s));
    } catch (e) { /* 忽略 */ }
  };
  UI.loadSettings = function () {
    try {
      var s = JSON.parse(localStorage.getItem(MoveUI.KEY) || '{}');
      if (typeof s.showSpeed === 'boolean') MoveUI.showSpeed = s.showSpeed;
      if (s.slideMode === 'hold' || s.slideMode === 'toggle') Input.slideMode = s.slideMode;
    } catch (e) { /* 忽略 */ }
    load.apply(this, arguments);
    MoveUI.inject();
  };
  // HUD 每帧刷新后更新速度读数
  var uu = UI.update;
  UI.update = function () { var r = uu.apply(this, arguments); MoveUI.update(); return r; };
  // 角色介绍：加上滑铲坐骑、坐骑特性、摔落伤害
  var bm = UI.buildMenu;
  UI.buildMenu = function () { var r = bm.apply(this, arguments); MoveUI.menuText(); return r; };
  // 升级、宝箱、商店、暂停、结算弹窗打开时：收起触屏的“保持滑铲”
  var om = UI.openModal;
  UI.openModal = function () { if (Input.setTouchSlide) Input.setTouchSlide(false); return om.apply(this, arguments); };
})();

MoveUI.inject = function () {
  if (document.getElementById('speedText')) { MoveUI.refresh(); return; }
  var st = document.createElement('style');
  st.textContent = MoveUI.CSS;
  document.head.appendChild(st);
  // 左下角：速度读数（在被动进度上面）
  var bl = document.getElementById('bottomLeft');
  if (bl) {
    var sp = document.createElement('div');
    sp.id = 'speedText';
    sp.style.display = 'none';
    bl.insertBefore(sp, bl.firstChild);
  }
  // 暂停设置：接在视角灵敏度后面
  var sens = document.getElementById('sensSlider');
  var host = sens && sens.closest('label') ? sens.closest('label').parentNode : null;
  if (host) {
    var lab = document.createElement('label');
    lab.className = 'setting mvSet';
    lab.innerHTML = '<input type="checkbox" id="optSpeed"><span class="mvBox"></span><span>显示速度</span>';
    host.appendChild(lab);
    lab.querySelector('input').addEventListener('change', function () {
      MoveUI.showSpeed = this.checked;
      MoveUI.shownV = -1;
      UI.saveSettings();
      MoveUI.update();
    });
    var row = document.createElement('div');
    row.className = 'setting mvSet mvTouch';
    row.innerHTML = '<span>滑铲按钮</span><span class="mvOpts"><button type="button" data-mode="toggle">点按切换</button><button type="button" data-mode="hold">按住</button></span>';
    host.appendChild(row);
    row.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (!b) return;
      Input.slideMode = b.dataset.mode;
      Input.touchSlide = false;
      Input.setTouchSlide(false);
      UI.saveSettings();
      MoveUI.refresh();
    });
  }
  MoveUI.refresh();
};

MoveUI.refresh = function () {
  var cb = document.getElementById('optSpeed');
  if (cb) cb.checked = !!MoveUI.showSpeed;
  var btns = document.querySelectorAll('.mvOpts button[data-mode]');
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle('sel', btns[i].dataset.mode === Input.slideMode);
  MoveUI.shownV = -1;
};

// 「速度 23」：只算水平速度
MoveUI.update = function () {
  var el = document.getElementById('speedText');
  if (!el) return;
  var on = MoveUI.showSpeed && Game.state !== 'menu';
  if ((el.style.display !== 'none') !== on) el.style.display = on ? '' : 'none';
  if (!on) return;
  var v = Math.round(P.speed());
  if (v === MoveUI.shownV) return;
  MoveUI.shownV = v;
  el.textContent = '速度 ' + v;
  var t = MoveUI.tier(v);
  if (t !== MoveUI.shownTier) { MoveUI.shownTier = t; el.style.color = MoveUI.TIER_COLORS[t]; }
};

// 主菜单角色介绍：被动下面加「滑铲：坐骑 —— 说明」和坐骑特性；属性里加摔落伤害
MoveUI.menuText = function () {
  var id = UI.selected, c = CHARACTERS[id], box = document.getElementById('charDesc');
  if (!c || !box) return;
  var stats = box.querySelector('.cdStats');
  var ft = MoveUI.fallText(c.fall);
  if (ft && stats) stats.textContent = stats.textContent ? stats.textContent + '，' + ft : '属性：' + ft;
  var ride = typeof RIDES !== 'undefined' && RIDES[id];
  if (!ride || !ride.name) return;
  var d = document.createElement('div');
  d.className = 'cdRide';
  d.textContent = '滑铲：' + ride.name;
  if (ride.desc) {
    var ds = document.createElement('span');
    ds.className = 'cdRideDesc';
    ds.textContent = ' —— ' + ride.desc;
    d.appendChild(ds);
  }
  box.insertBefore(d, stats || null);
  var tw = ride.twist && MoveUI.TWIST_TEXT[ride.twist.kind];
  if (tw) {
    var t = document.createElement('div');
    t.className = 'cdTwist';
    t.textContent = tw;
    box.insertBefore(t, stats || null);
  }
};
