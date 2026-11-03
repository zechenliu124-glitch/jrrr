'use strict';
// ============================================================
//  节奏设置：关卡时长 10 / 15 / 20 分钟（默认 15），和其他设置一起存；
//  主菜单里注入「关卡时长」选择按钮。刷怪导演（进度、敌人强度）、经验曲线、宝箱价格、地图物品数量都按时长缩放
// ============================================================
var Pace = { OPTIONS: [10, 15, 20], minutes: 15, KEY: 'knight_magic_settings' };

Pace.stageTime = function () { return Pace.minutes * 60; };
// 经验曲线、宝箱价格按时长缩放（15 分钟为基准）：开局 90 秒固定，按开局之后的时长算，每关的成长进度一样
Pace.xpScale = function () { return (Pace.stageTime() - 90) / 810; };
// 地图物品数量（10 分钟为基准）
Pace.contentScale = function () { return Pace.minutes / 10; };

Pace.setMinutes = function (m) {
  m = +m;
  if (Pace.OPTIONS.indexOf(m) < 0) return;
  Pace.minutes = m;
  Pace.refresh();
};

// ---------------- 设置存取：包装 UI.saveSettings / UI.loadSettings ----------------
(function () {
  var save = UI.saveSettings, load = UI.loadSettings;
  UI.saveSettings = function () {
    save.apply(this, arguments);
    try {
      var s = JSON.parse(localStorage.getItem(Pace.KEY) || '{}');
      s.stageMin = Pace.minutes;
      localStorage.setItem(Pace.KEY, JSON.stringify(s));
    } catch (e) { /* 忽略 */ }
  };
  UI.loadSettings = function () {
    try {
      var s = JSON.parse(localStorage.getItem(Pace.KEY) || '{}');
      if (Pace.OPTIONS.indexOf(s.stageMin) >= 0) Pace.minutes = s.stageMin;
    } catch (e) { /* 忽略 */ }
    load.apply(this, arguments);
    Pace.inject();
  };
})();

// ---------------- 主菜单：关卡时长选择 ----------------
// 只写布局、字号和颜色变量；方块像素按钮（缺角黑边、斜面、按下去、选中 = 金框金字）的样子在 css/kit.css
Pace.CSS = [
  '#paceSetting { display: flex; align-items: center; justify-content: center; gap: 9px; flex-wrap: wrap; }',
  '#paceSetting .paceLabel { font-size: var(--fs-m); color: var(--muted); }',
  '#paceSetting .paceOpts { display: flex; gap: 6px; }',
  '#paceSetting .paceBtn { min-height: 44px; min-width: 86px; padding: 6px 12px; background-color: var(--panel2); color: #fff; font-size: var(--fs-m); line-height: 24px; cursor: pointer; touch-action: manipulation; }',
  '#paceSetting .paceHint { flex-basis: 100%; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '@media (max-height: 700px) and (orientation: landscape) { #paceSetting .paceHint { display: none; } #paceSetting .paceBtn { min-height: 40px; } }'
].join('\n');

Pace.HINTS = { 10: '快节奏：一关 10 分钟', 15: '标准：一关 15 分钟', 20: '慢节奏：一关 20 分钟，敌人和成长都拉长' };

Pace.inject = function () {
  if (document.getElementById('paceSetting')) { Pace.refresh(); return; }
  var menu = document.getElementById('menu');
  if (!menu) return;
  var st = document.createElement('style');
  st.textContent = Pace.CSS;
  document.head.appendChild(st);
  var box = document.createElement('div');
  box.id = 'paceSetting';
  var label = document.createElement('span');
  label.className = 'paceLabel';
  label.textContent = '关卡时长';
  var opts = document.createElement('div');
  opts.className = 'paceOpts';
  Pace.OPTIONS.forEach(function (m) {
    var b = document.createElement('button');
    b.className = 'paceBtn';
    b.type = 'button';
    b.dataset.min = String(m);
    b.textContent = m + ' 分钟';
    opts.appendChild(b);
  });
  var hint = document.createElement('div');
  hint.className = 'paceHint';
  box.appendChild(label); box.appendChild(opts); box.appendChild(hint);
  box.addEventListener('click', function (e) {
    var b = e.target.closest('.paceBtn');
    if (!b) return;
    Pace.setMinutes(b.dataset.min);
    UI.saveSettings();
  });
  // 放在“开始游戏”按钮前面；找不到就放到菜单最后
  var start = menu.querySelector('[data-act="start"]');
  if (start && start.parentNode) start.parentNode.insertBefore(box, start);
  else (menu.querySelector('.menuInner') || menu).appendChild(box);
  Pace.refresh();
};

Pace.refresh = function () {
  var box = document.getElementById('paceSetting');
  if (box) {
    Array.prototype.forEach.call(box.querySelectorAll('.paceBtn'), function (b) { b.classList.toggle('sel', +b.dataset.min === Pace.minutes); });
    box.querySelector('.paceHint').textContent = Pace.HINTS[Pace.minutes] || '';
  }
  // 菜单说明里的“每关 N 分钟”
  var menu = document.getElementById('menu');
  if (!menu) return;
  Array.prototype.forEach.call(menu.querySelectorAll('.keys'), function (el) {
    if (/每关 \d+ 分钟/.test(el.textContent)) el.textContent = el.textContent.replace(/每关 \d+ 分钟/, '每关 ' + Pace.minutes + ' 分钟');
  });
};
