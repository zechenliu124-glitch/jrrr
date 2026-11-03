'use strict';
// ============================================================
//  移动手感相关的界面（只包装 UI 的函数，不改 ui.js）：
//  左上那一列里的速度读数（暂停设置里「显示速度」开关）、触屏「滑铲按钮：点按切换 / 按住」设置，和其他设置一起存；
//  主菜单角色介绍里的滑铲坐骑、坐骑特性、摔落伤害；弹窗打开时收起触屏的“保持滑铲”
// ============================================================
var MoveUI = { showSpeed: false, KEY: 'knight_magic_settings', shownV: -1, shownTier: -1 };

// 坐骑特性说明（RIDES[角色].twist.kind）：主菜单介绍里「坐骑特性」那一行的内容。说规则（坐骑本身的样子写在 rides.js 的 desc），
// 一行放得下（约 24 个字）：锁住的骑士介绍里还有解锁条件，横屏面板要在 800 像素以内
MoveUI.TWIST_TEXT = {
  board: '按住滑铲一直滑 · 转视角压弯加速 · 空中继续加速',
  hover: '离地悬空：摩擦更小，上坡减速减半，放电积蓄翻倍',
  dive: '空中按住滑铲俯冲，落地把冲击变成往前冲的速度',
  shadow: '滑铲时闪避大幅提高',
  frost: '高速滑铲时身后结出薄冰，冻住踩上去的敌人',
  moon: '空中按住滑铲，下落变慢'
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

// 样式只写布局、字号和颜色变量（style.css）；像素按钮、勾选框、「选中」的样子在 css/kit.css（.mvOpts button、.mvBox）
MoveUI.CSS = [
  // 速度读数：左上那一列（任务框下面）的一个小面板（kit.css 的 .kmPlate），18 号描边字
  '#speedText { padding: 3px 12px 3px 9px; font-size: var(--fs-m); line-height: 24px; color: #fff; text-shadow: var(--ol1); white-space: nowrap; }',
  '.mvSet { margin-top: 9px; cursor: pointer; }',
  // 触屏：每一行都是 44 像素高的触控区（行和行之间不再空 9 像素，44 像素里本来就有上下的空）
  'body.touch .mvSet { min-height: 44px; margin-top: 0; }',
  '.mvSet input[type=checkbox] { position: absolute; opacity: 0; width: 1px; height: 1px; pointer-events: none; }',
  // 勾选框和勾上时的像素勾在 kit.css
  '.mvBox { flex: none; position: relative; }',
  '.mvSet input:focus-visible + .mvBox { outline: 2px solid #fff; outline-offset: 2px; }',
  '.mvTouch { display: none; flex-wrap: wrap; cursor: default; }',
  'body.touch .mvTouch { display: flex; }',
  // 滑铲按钮方式：两个 44 像素高的方块按钮，选中的是金框金字
  '.mvOpts { display: inline-flex; gap: 6px; }',
  '.mvOpts button { min-height: 44px; padding: 6px 12px; background-color: var(--panel2); color: #fff; font-size: var(--fs-m); line-height: 24px; cursor: pointer; touch-action: manipulation; }',
  // 触屏滑铲键“保持”中：亮蓝色 + 一圈浅蓝硬边，一眼看出滑铲还按着
  '#touchBtns #btnSlide.on { background: #3f95ff; box-shadow: inset 0 5px 0 rgba(255, 255, 255, 0.35), inset 0 -3px 0 rgba(0, 0, 0, 0.3), 0 1px 0 #000, 0 0 0 4px #bff0ff, 0 0 0 6px #000; }',
  // 主菜单介绍：坐骑特性一行是浅青色
  '.cdTwist .kmV { color: #9fe8ff; }'
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
  // 速度读数：左上那一列，任务框下面的小面板（不再一个人飘在左边中间；没有左上那一列时还放在左下角）
  var tl = document.getElementById('topLeft'), q = document.getElementById('quest'), bl = document.getElementById('bottomLeft');
  if (tl || bl) {
    var sp = document.createElement('div');
    sp.id = 'speedText';
    sp.className = 'kmPlate';
    sp.style.display = 'none';
    if (tl) tl.insertBefore(sp, q && q.parentNode === tl ? q.nextSibling : null);
    else bl.insertBefore(sp, bl.firstChild);
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

// 主菜单角色介绍（ui.js 的 UI.descRow：左边灰色标签、右边内容）：被动下面加「滑铲｜坐骑 · 说明」和「坐骑特性」；属性里加摔落伤害
MoveUI.menuText = function () {
  var id = UI.selected, c = CHARACTERS[id], box = document.getElementById('charDesc');
  if (!c || !box) return;
  var stats = box.querySelector('.cdStats');
  var ft = MoveUI.fallText(c.fall);
  var sv = stats && stats.querySelector('.kmV');
  // 内容按短语重排（UI.descText），不只改 textContent
  if (ft && sv) { UI.descText(sv, sv.textContent ? sv.textContent + '，' + ft : ft); stats.classList.remove('hidden'); }
  var ride = typeof RIDES !== 'undefined' && RIDES[id];
  if (!ride || !ride.name) return;
  var d = UI.descRow('滑铲', ride.name + (ride.desc ? ' · ' + ride.desc : ''), 'cdRide');
  box.insertBefore(d, stats || null);
  var tw = ride.twist && MoveUI.TWIST_TEXT[ride.twist.kind];
  if (tw) box.insertBefore(UI.descRow('坐骑特性', tw, 'cdTwist'), stats || null);
};
