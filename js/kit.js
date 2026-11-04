'use strict';
// ============================================================
//  界面套件：所有界面共用的小部件和局内公告（样式在 css/kit.css；规则见 docs/knight-magic/design/UI_STYLE.md）
//  - Kit.icon(name)：9×9 的像素小图标（字符画 → SVG），大小由 CSS 的 --ip（每个图标像素几像素）定
//  - Kit.callout / Kit.ribbon：文字公告（没有底板的描边像素字）/ 燕尾横幅（只给 Boss 和一局结束的大时刻）
//  - Kit.announce：局内唯一的公告系统。一次一条，排在正上方那一列（倒计时、关卡名、Boss 血条）下面；
//    优先级不低于当前那条的马上顶掉它，低的排队（最多 2 条，等 5 秒还没轮到就扔掉）；计时跟游戏钟走（暂停、弹窗时停住）
//  - Kit.toast / slip / button / tag / bar / glyphTile：提示文字、成就小签、像素按钮、「新」小签、进度条、符文砖图块
//  在 ui.js 后面加载，feel.js、meta.js、content.js 这些都可以用
// ============================================================
var Kit = {};

Kit.el = function (tag, cls, text) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
// 数字加千分位（1,340）
Kit.num = function (n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
// 一段字在 KM Pixel 12 里有几个字体像素宽（ls = 每个字后面还有 1 个字体像素的字距）：ui.js 的 UI.fpw（画布量，不读布局）。
// 18 号字一个字体像素是 1.5 像素：居中的一行字如果是奇数个字体像素宽，会落在半个设备像素上（笔画发虚），要补 1 个
Kit.fpw = function (t, ls) { return UI.fpw(t, ls); };
// 用途色（一种用途一种颜色，见 UI_STYLE.md §2.4）：Kit.toast、Kit.tag 用；不是这些名字的当作颜色原样用
Kit.COL = {
  gold: '#ffd84a', goldL: '#fff2a8', red: '#ff7a64', redL: '#ffb0a0', redM: '#ff5a46',
  org: '#ff9a4a', orgL: '#ffd0a0', cya: '#6fd0ff', cyaL: '#c8f0ff', gem: '#f3d2ff', white: '#ffffff', muted: '#a9b6d3'
};
Kit.ROLES = { gold: 1, red: 1, org: 1, cya: 1 };
Kit.role = function (r) { return Kit.ROLES[r] ? r : 'gold'; };
Kit.color = function (c) { return Kit.COL[c] || c || '#ffffff'; };

// ---------------- 像素小图标：9×9 字符画，k 是黑描边，其他字母是颜色（.kmPx 里的 class，见 kit.css） ----------------
// 新图标照这个格子画，颜色只用 kit.css 里列的那几种
Kit.ICONS = {
  flag: ['.k.......', '.kkkkkk..', '.kYyyyyk.', '.kyyyyyok', '.kyyyyok.', '.kkkkkk..', '.k.......', '.k.......', 'kkk......'],
  star: ['....k....', '...kYk...', '...kyk...', 'kkkkyykkk', 'kYyyyyyok', '.kyyyyok.', '..kyyok..', '.kyokyok.', '.kok.kok.'],
  crown: ['.........', 'k...k...k', 'kk.kYk.kk', 'kYkkyykok', 'kyyyyyyok', 'kyYyyyyok', 'kyyyyyyok', 'kkkkkkkkk', '.........'],
  skull: ['..kkkkk..', '.kwwwwwk.', 'kwwwwwwgk', 'kwkkwkkgk', 'kwkkwkkgk', 'kwwwkwwgk', '.kwwwwgk.', '.kwkwkwk.', '..kkkkk..'],
  moon: ['..kkkkk..', '.kqrrrrk.', 'kqrrRrrRk', 'krrrrrrrk', 'krRrrrRrk', 'krrrrrrRk', 'krrRrrrRk', '.kRrrrRk.', '..kkkkk..'],
  meteor: ['......kk.', '.....kYk.', '..kk.kk..', '.kffkk...', 'kfYffk...', 'kfYYfFk..', 'kffffFk..', '.kFFFk...', '..kkk....'],
  bag: ['..kk.kk..', '...kbk...', '..kkkkk..', '.kyyyyyk.', 'kyyYyyyok', 'kyyYkyyok', 'kyyykyyok', '.kyyyyok.', '..kkkkk..'],
  flame: ['....k....', '...kfk...', '..kfYfk..', '.kfYYffk.', 'kffYwYffk', 'kfYwwwYfk', 'kfYwwwYfk', '.kfffffk.', '..kkkkk..'],
  coin: ['..kkkkk..', '.kyyyyyk.', 'kyYYyyyok', 'kyYyoyyok', 'kyYyoyyok', 'kyyyoyyok', 'kyyyyyook', '.koooook.', '..kkkkk..'],
  chest: ['.........', '.kkkkkkk.', 'kbbbybbbk', 'kbbbybbbk', 'kyyyYyyyk', 'kbbkYkbbk', 'kbbbybbbk', 'kBBBBBBBk', 'kkkkkkkkk'],
  key: ['.kkk.....', 'kYyyk....', 'kykyk....', 'kyyykkkkk', '.kkkyyyyk', '....kykyk', '....kk.kk', '.........', '.........'],
  trophy: ['kkkkkkkkk', 'kYyyyyyok', 'kYyyyyyok', '.kyyyyok.', '..kyyok..', '...kyk...', '..kkykk..', '.kyyyyok.', '.kkkkkkk.'],
  // 跳台（木头斜坡 + 冲过去的风线）：成就「坡道飞驰」
  ramp: ['.........', '.......kk', 'CC...kkbk', '...kkbbbk', 'CCkbbbbbk', '.kbbbbbBk', 'kkkkkkkkk', '.........', '.........'],
  // 魔晶（只给魔晶用）：价格按钮、魔晶小签、菜单和结算里的魔晶。11×10（不是 9×9）：就是 META 原来那颗带白色高光面的魔晶，
  // 框的大小由 .kmGem 给（11 × --ip 宽、10 × --ip 高）
  gem: ['...kkkkk...', '..kwwPPpk..', '.kwPPPpppk.', 'kpppppppppk', 'kPPPPpppvvk', '.kPPPppvvk.', '..kPPpvvk..', '...kPpvk...', '....kvk....', '.....k.....']
};
// 不是 9×9 的图标另加的 class（kit.css 按图的格数给框的大小）
Kit.ICON_CLS = { gem: 'kmGem' };
// 字符画 → SVG（同一种颜色合成一条 path，crispEdges 不糊边）
Kit.svgRows = function (rows, cls) {
  var paths = {}, x, y, w = rows[0].length;
  for (y = 0; y < rows.length; y++) {
    for (x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (ch !== '.') paths[ch] = (paths[ch] || '') + 'M' + x + ' ' + y + 'h1v1h-1z';
    }
  }
  var s = '<svg' + (cls ? ' class="' + cls + '"' : '') + ' viewBox="0 0 ' + w + ' ' + rows.length + '" shape-rendering="crispEdges" aria-hidden="true">';
  for (var c in paths) s += '<path class="' + c + '" d="' + paths[c] + '"/>';
  return s + '</svg>';
};
Kit.svgCache = {};
// → <i class="kmIco kmPx"><svg …></i>；不认识的名字返回 null
Kit.icon = function (name) {
  var rows = Kit.ICONS[name];
  if (!rows) return null;
  if (!Kit.svgCache[name]) Kit.svgCache[name] = Kit.svgRows(rows);
  var i = Kit.el('i', 'kmIco kmPx' + (Kit.ICON_CLS[name] ? ' ' + Kit.ICON_CLS[name] : ''));
  i.innerHTML = Kit.svgCache[name];
  return i;
};

// ---------------- 公告的样子：文字公告、燕尾横幅（只建元素，不管放在哪） ----------------
// 文字公告：o = { role: 'gold'|'red'|'org'|'cya', big, kick, title, sub, icon }
// 小标签（18，浅色）→ 标题（24，大的 36）→ 一行说明（18，白）；图标放在第一行前面
Kit.callout = function (o) {
  o = o || {};
  var a = Kit.el('div', 'kmAnn kmCall r-' + Kit.role(o.role) + (o.big ? ' big' : ''));
  var ic = o.icon ? Kit.icon(o.icon) : null;
  if (o.kick) {
    var k = Kit.el('div', 'kmKick');
    if (ic) { k.appendChild(ic); ic = null; }
    k.appendChild(Kit.el('span', '', o.kick));
    a.appendChild(k);
  }
  var t = Kit.el('div', 'kmCT');
  if (ic) t.appendChild(ic);
  t.appendChild(Kit.el('span', '', o.title || ''));
  a.appendChild(t);
  if (o.sub) a.appendChild(Kit.el('div', 'kmCS', o.sub));
  return a;
};
// 横幅两头的燕尾：字符画，一格 = --u 像素；n = 横幅中间的行数（m 12 行，l / xl 16 行）
Kit.capCache = {};
Kit.capRows = function (n) {
  var R = n + 5, rows = [], x, y, mid = (n + 5) / 2, half = (n - 1) / 2;
  for (y = 0; y < R; y++) rows.push('........'.split(''));
  for (x = 0; x < 8; x++) { rows[2][x] = 'k'; rows[n + 3][x] = 'k'; }
  for (y = 3; y <= n + 2; y++) {
    var c = Math.max(0, Math.min(3, Math.round(3 * (1 - Math.abs(y - mid) / half))));
    rows[y][c] = 'k';
    for (x = c + 1; x < 8; x++) rows[y][x] = y === 3 ? 'm' : 'd';
  }
  rows[n + 2][6] = 'f'; rows[n + 2][7] = 'f';
  // 硬投影：往下错一行，半透明黑
  for (y = R - 1; y >= 1; y--) for (x = 0; x < 8; x++) if (rows[y][x] === '.' && rows[y - 1][x] !== '.' && rows[y - 1][x] !== 's') rows[y][x] = 's';
  return rows.map(function (r) { return r.join(''); });
};
Kit.cap = function (n, side) {
  if (!Kit.capCache[n]) Kit.capCache[n] = Kit.svgRows(Kit.capRows(n), 'kmCap');
  return Kit.capCache[n].replace('class="kmCap"', 'class="kmCap ' + side + '"');
};
Kit.RIB_N = { m: 12, l: 16, xl: 16 };
// 横幅：o = { role, size: 'm'|'l'|'xl', tab, title, sub, icon }（黑边、上一行亮色、两色深蓝、下一行暗色、1 格硬投影、燕尾）
Kit.ribbon = function (o) {
  o = o || {};
  var size = Kit.RIB_N[o.size] ? o.size : 'm', n = Kit.RIB_N[size];
  var a = Kit.el('div', 'kmAnn kmRibA r-' + Kit.role(o.role) + ' s-' + size);
  if (o.tab) a.appendChild(Kit.el('div', 'kmTab', o.tab));
  var w = Kit.el('div', 'kmRibWrap');
  w.insertAdjacentHTML('beforeend', Kit.cap(n, 'l'));
  var rib = Kit.el('div', 'kmRib');
  var ic = o.icon ? Kit.icon(o.icon) : null;
  if (ic) rib.appendChild(ic);
  rib.appendChild(Kit.el('span', 'kmTitle', o.title || ''));
  w.appendChild(rib);
  w.insertAdjacentHTML('beforeend', Kit.cap(n, 'r'));
  a.appendChild(w);
  if (o.sub) a.appendChild(Kit.el('div', 'kmSub', o.sub));
  return a;
};
// 过场的大横幅（Boss 出场、阵亡、通关）：屏幕够大用 xl，小屏用 l
Kit.heroSize = function () { return Math.min(window.innerWidth, window.innerHeight) >= 700 ? 'xl' : 'l'; };

// ---------------- 局内公告：一次一条 ----------------
// cur：正在显示的 { el, prio, key, out, h }；q：排队的 { o, prio, h }；gen：Kit.annClear 一次加 1（之前的定时任务都作废）
Kit.ann = { cur: null, q: [], gen: 0, top: -1 };
Kit.ANN_Q = 2;        // 最多排几条
Kit.ANN_WAIT = 5;     // 排队最多等几秒（游戏时间），过了就扔掉
Kit.feel = function () { return typeof Feel !== 'undefined' && Feel && typeof Feel.later === 'function' ? Feel : null; };
// 定时：有 FEEL 时用它的游戏钟（暂停、升级 / 宝箱弹窗打开时停住）；ui 为真的是收尾（退场动画），什么时候都走。
// 返回 FEEL 的定时任务（Kit.lost 用它看 FEEL 有没有把任务清掉，比如 Feel.reset），没有 FEEL 时返回 null
Kit.after = function (sec, fn, ui) {
  var gen = Kit.ann.gen, run = function () { if (gen === Kit.ann.gen) fn(); };
  var F = Kit.feel();
  if (!F) { setTimeout(run, sec * 1000); return null; }
  var T = F.timers, n = T ? T.length : -1;
  F.later(sec, run, 'kitAnn', !!ui);
  return T && T.length === n + 1 ? T[n] : null;
};
Kit.lost = function (h) { var F = Kit.feel(); return !!(h && F && F.timers && F.timers.indexOf(h) < 0); };
// 公告层：放在 #hud 外面（过场藏 HUD 时公告不跟着动），z-index 7，不挡点击
Kit.layer = function () {
  var L = document.getElementById('annLayer');
  if (!L && document.body) {
    L = Kit.el('div');
    L.id = 'annLayer';
    L.setAttribute('aria-live', 'polite');
    document.body.appendChild(L);
  }
  return L;
};
// o = { look: 'call'|'rib', role, big, size, kick, tab, title, sub, icon, life（秒，默认 2.4）, prio（1 小事，2 关卡，3 Boss / 虫潮 / 关卡完成）, key（同一件事不重复） }
// 返回显示出来的元素；排队了或者重复了返回 null
Kit.announce = function (o) {
  o = o || {};
  if (!Kit.layer()) return null;
  var A = Kit.ann, prio = o.prio || 1, i;
  // 当前那条的计时被清掉了（FEEL 重置了定时任务）：说明换局了，旧的全部收掉
  if (A.cur && !A.cur.out && Kit.lost(A.cur.h)) Kit.annClear();
  var cur = A.cur && !A.cur.out ? A.cur : null;
  if (o.key != null) {
    if (cur && cur.key === o.key) return null;
    for (i = A.q.length - 1; i >= 0; i--) if (A.q[i].o.key === o.key) A.q.splice(i, 1);
  }
  if (cur && prio < cur.prio) { Kit.annQueue(o, prio); return null; }
  if (cur) {
    // 两条差不多同时来（FEEL 的和 CONTENT 的在同一刻，前一条才出来、还没看清）：前一条回到队里，等新的这条放完再出来。
    // 大时刻（3：Boss 第二阶段、关卡完成、最终虫潮）被另一个大时刻顶掉就不回来了：新的已经盖过它（比如 Boss 刚暴怒就被打倒）
    if (cur.prio < 3 && Kit.annAge(cur) < Kit.ANN_JOIN) Kit.annQueue(cur.o, cur.prio, true);
    Kit.annOut(cur, true);
  }
  return Kit.annShow(o, prio);
};
Kit.ANN_JOIN = 0.6;   // 前一条出来不到这么久（秒，游戏时间）就被顶掉，算“同时来的”
// 这条已经显示了多久（游戏时间）
Kit.annAge = function (rec) {
  if (rec.h && typeof rec.h.t === 'number') return rec.life - rec.h.t;
  return (Date.now() - rec.t0) / 1000;
};
// front：放在同样优先级的前面（被顶掉放回来的那条先出来）
Kit.annQueue = function (o, prio, front) {
  var A = Kit.ann, e = { o: o, prio: prio };
  if (A.q.length >= Kit.ANN_Q) {
    // 满了：扔掉最低、最早的那条；新的比排着的都低就不排了
    var lo = 0;
    for (var i = 1; i < A.q.length; i++) if (A.q[i].prio < A.q[lo].prio) lo = i;
    if (A.q[lo].prio > prio) return;
    A.q.splice(lo, 1);
  }
  if (front) A.q.unshift(e); else A.q.push(e);
  e.h = Kit.after(Kit.ANN_WAIT, function () { var k = A.q.indexOf(e); if (k >= 0) A.q.splice(k, 1); });
};
Kit.annShow = function (o, prio) {
  var L = Kit.layer(), a = o.look === 'rib' ? Kit.ribbon(o) : Kit.callout(o);
  var rec = { el: a, o: o, prio: prio, key: o.key != null ? o.key : null, out: false, h: null, life: o.life || 2.4, t0: Date.now() };
  // 画面上一次只有一条：还在退场的那条马上拿掉，不和新的叠在一起
  L.textContent = '';
  L.appendChild(a);
  Kit.ann.cur = rec;
  Kit.annPlace();
  rec.h = Kit.after(rec.life, function () { Kit.annOut(rec); });
  return a;
};
// 一件事已经不成立了（比如随机事件被 Boss 战、虫潮打断）：它的公告从队里拿掉，正在显示的也收起来
Kit.annDrop = function (key) {
  var A = Kit.ann;
  if (key == null) return;
  for (var i = A.q.length - 1; i >= 0; i--) if (A.q[i].o.key === key) A.q.splice(i, 1);
  if (A.cur && !A.cur.out && A.cur.key === key) Kit.annOut(A.cur);
};
// 退场：加 .out（0.15 秒的退场动画），0.16 秒后拿掉；replaced 为真是被新的顶掉（不从队里拿下一条）
Kit.annOut = function (rec, replaced) {
  if (!rec || rec.out) return;
  var A = Kit.ann;
  rec.out = true;
  rec.el.classList.add('out');
  Kit.after(0.16, function () {
    if (rec.el.parentNode) rec.el.parentNode.removeChild(rec.el);
    if (!A.cur) Kit.annPlace();
  }, true);
  if (A.cur !== rec) return;
  A.cur = null;
  if (replaced) return;
  // 队里优先级最高（一样高的取最早）的下一条，等这条退场完再出来
  var best = -1;
  for (var i = 0; i < A.q.length; i++) if (best < 0 || A.q[i].prio > A.q[best].prio) best = i;
  if (best < 0) return;
  var nx = A.q.splice(best, 1)[0];
  Kit.after(0.18, function () { if (A.cur) Kit.announce(nx.o); else Kit.annShow(nx.o, nx.prio); }, true);
};
// 换关、重开、回菜单：马上全部清掉（没有退场动画）
Kit.annClear = function () {
  var A = Kit.ann, F = Kit.feel();
  A.gen++;
  A.q.length = 0;
  A.cur = null;
  if (F && typeof F.cancel === 'function') F.cancel('kitAnn');
  var L = document.getElementById('annLayer');
  if (L) L.textContent = '';
  Kit.annPlace();
};
// 位置：正上方那一列（#topCenter：倒计时 → 关卡名 → Boss 血条 → 占领进度条）的下沿 + 12 像素，至少 84 像素；
// 公告的下沿写进 #hud 的 --kmAnnB，提示文字（#toasts）排在它下面。#topCenter 大小变了（ResizeObserver）、窗口变了都重新放
Kit.annPlace = function () {
  var L = document.getElementById('annLayer'), hud = document.getElementById('hud'), tc = document.getElementById('topCenter');
  if (!L) return;
  var bottom = 0, r = tc ? tc.getBoundingClientRect() : null;
  if (r && r.height > 0) bottom = r.bottom;
  else if (hud) bottom = parseFloat(hud.style.getPropertyValue('--tcBottom')) || 0;   // HUD 没显示（菜单里）：用 ui.js 上次量的
  var top = Math.round(Math.max(bottom + 12, 84));
  if (Kit.ann.top !== top) { Kit.ann.top = top; L.style.top = top + 'px'; }
  if (!hud) return;
  var cur = Kit.ann.cur;
  if (cur && cur.el.isConnected) hud.style.setProperty('--kmAnnB', Math.round(top + cur.el.getBoundingClientRect().height) + 'px');
  else hud.style.removeProperty('--kmAnnB');
};
(function () {
  var tc = document.getElementById('topCenter');
  try { if (tc && window.ResizeObserver) new ResizeObserver(function () { Kit.annPlace(); }).observe(tc); } catch (e) { /* 老浏览器：只在显示公告和窗口变化时放 */ }
  window.addEventListener('resize', function () { Kit.annPlace(); });
})();

// ---------------- 小部件 ----------------
// 提示文字（ui.js 的 UI.toast）：颜色可以写用途名（gold / red / org / cya，还有 goldL / redL / orgL / cyaL / gem）或者颜色值；
// 9 个字以内 24 号，长的 18 号（UI.toast 自己加 .kmLong）。返回提示文字的元素
Kit.toast = function (text, c) { return UI.toast(text, Kit.color(c)); };
// ---------------- 折行：按短语，短语太长时按词（不会折成「移 / 动速度」「生 / 命回复」「龙卷 / 风」） ----------------
// 一段（.kmNb，inline-block）放得下就整段不折；比一行还长时只在词和词之间折：词是 Intl.Segmenter 分的（Safari 14.1+），
// 每个词一个不折行的 .kmW。收尾的标点、%、——、…… 和「的 了 着 过 时 后」粘在前一个词上，开头的括号、+ − × 和单独的副词、介词、
// 单字形容词（Kit.LEAD）粘在后一个词上，括号里不超过 6 个字的整个不折；段里的空格只在「汉字 + 空格 + 数字」「→ / · 后面」能断
// （「+50 生命」「120% 伤害」不分开）。
// 没有 Intl.Segmenter 时照旧（段里随便折）。字不变（textContent 一样）。外面的 text-wrap: balance 只在整段之间匀开几行
// 不能从中间折开的游戏用词（ICU 会把「滑 / 铲」「哥 / 布 / 林」「暴 / 击」拆开）；武器、魔典、物品、属性、骑士、超武、坐骑、敌人的名字
// （2~6 个字）用到时自动加进来（Kit.wordList），改名以后不用改这里
Kit.WORDS = ['滑铲', '魔典', '魔晶', '圣锻炉', '哥布林', '暴击', '龙卷风', '移动速度', '跳跃高度', '铁匠铺', '许愿井', '传送门', '宝箱怪', '超武', '圣光', '挥砍', '弹射', '重弩箭'];
Kit.WORD_TABLES = ['WEAPONS', 'TOMES', 'ITEMS', 'STATS', 'CHARACTERS', 'EVO', 'RIDES', 'ENEMIES'];
Kit.wordsCache = null;
Kit.wordList = function () {
  if (Kit.wordsCache) return Kit.wordsCache;
  var seen = {}, out = [], i, k, T;
  var add = function (w) { w = w == null ? '' : String(w); if (w.length >= 2 && w.length <= 6 && !/\s/.test(w) && !seen[w]) { seen[w] = 1; out.push(w); } };
  Kit.WORDS.forEach(add);
  for (i = 0; i < Kit.WORD_TABLES.length; i++) {
    T = window[Kit.WORD_TABLES[i]];
    if (T && typeof T === 'object') for (k in T) if (T[k] && typeof T[k] === 'object') add(T[k].name);
  }
  // 数据表还没加载完时先不存（下次再收一遍）
  if (typeof WEAPONS !== 'undefined') Kit.wordsCache = out;
  return out;
};
Kit.segm = undefined;
Kit.segmenter = function () {
  if (Kit.segm === undefined) {
    Kit.segm = null;
    try { if (typeof Intl !== 'undefined' && Intl.Segmenter) Kit.segm = new Intl.Segmenter('zh-Hans', { granularity: 'word' }); } catch (e) { /* 没有分词：照旧 */ }
  }
  return Kit.segm;
};
Kit.CLOSE = '，。、；：！？）」』》”’…%·—';
Kit.OPEN = '（「『《“‘+-−×';
// 单独成词时粘在前一个词上（「穿透的」「激怒了」「挥砍时」「受伤后」）/ 粘在后一个词上（副词、介词、单字形容词：「并在敌人」「对附近」「额外多」「大范围」）
Kit.PART = '的了着过时后';
Kit.LEAD = ['并', '在', '对', '把', '被', '向', '往', '从', '给', '和', '与', '让', '再', '又', '也', '都', '还', '更', '很', '就', '才', '会', '每', '额外', '重', '大', '小', '巨'];
Kit.WORD_MIN = 8;     // 短于 8 个字的一段放得下任何一栏（最窄的是竖屏卡片 215 像素 = 11 个 18 号字），不用拆词
// 第 s 个字是空格：它后面能不能折行（汉字 + 空格 + 数字 / 正负号数字，或者跟在 → · 后面）
Kit.spaceBreak = function (t, s) {
  var a = t.charAt(s - 1), b = t.charAt(s + 1);
  return a === '→' || a === '·' || (/[㐀-鿿]/.test(a) && (/[0-9]/.test(b) || ('+-−×'.indexOf(b) >= 0 && /[0-9]/.test(t.charAt(s + 2)))));
};
// 一段字 → 不折行的小块（词 + 粘上去的标点；能断的空格留在前一块的末尾）；没有 Intl.Segmenter 时返回 null
Kit.chunks = function (t) {
  var seg = Kit.segmenter();
  if (!seg) return null;
  var n = t.length, cut = [], i, j, p, w, m, re;
  for (i = 0; i <= n; i++) cut.push(false);
  var segs = Array.from(seg.segment(t));
  for (i = 0; i < segs.length; i++) if (segs[i].index > 0) cut[segs[i].index] = true;
  var keep = function (a, b) { for (var x = a + 1; x < b; x++) cut[x] = false; };
  // 游戏用词、短括号整个不折
  var words = Kit.wordList();
  for (i = 0; i < words.length; i++) { w = words[i]; for (p = t.indexOf(w); p >= 0; p = t.indexOf(w, p + 1)) keep(p, p + w.length); }
  re = /（[^（）]{1,6}）|「[^「」]{1,6}」/g;
  while ((m = re.exec(t))) keep(m.index, m.index + m[0].length);
  var last = 0;
  for (j = 1; j < n; j++) {
    if (!cut[j]) continue;
    var a = t.charAt(j - 1), b = t.charAt(j);
    // 空格跟着前面的词，空格后面按 Kit.spaceBreak；收尾标点、单独的「的 了 着 过 时 后」粘前面，开头括号、正负号粘后面
    if (b === ' ') cut[j] = false;
    else if (a === ' ') cut[j] = Kit.spaceBreak(t, j - 1) && j - 1 - last >= 3;   // 前面不到 3 个字（「每 30 秒」）不断
    else if (Kit.CLOSE.indexOf(b) >= 0 || Kit.OPEN.indexOf(a) >= 0) cut[j] = false;
    else if (Kit.PART.indexOf(b) >= 0 && (j + 1 >= n || cut[j + 1] || t.charAt(j + 1) === ' ')) cut[j] = false;
    if (cut[j]) last = j;
  }
  // 副词、介词单独成词时和后面的词连在一起（「并在敌人」：可以连着好几个）
  for (i = 0; i < segs.length; i++) {
    var sg = segs[i], e2 = sg.index + sg.segment.length;
    if (e2 < n && Kit.LEAD.indexOf(sg.segment) >= 0 && t.charAt(e2) !== ' ') cut[e2] = false;
  }
  var out = [], s = 0;
  for (j = 1; j <= n; j++) if (j === n || cut[j]) { out.push(t.slice(s, j)); s = j; }
  return out;
};
// 一段 / 一个词的宽度写死成它的整数个字体像素（calc(N em / 12)）：Linux 上的 Chrome（FreeType）量 18 号字时每一小段多出 1/64 像素，
// 一行里小段多了字就落在小数像素上（发虚）；写死以后每一段都从整数个字体像素开始。字体还没到时先不写（到了再补，Kit.fontArrived）
Kit.fontReady = false;
Kit.fontWait = null;
Kit.exact = function (e, t) {
  if (!Kit.fontReady) {
    try { Kit.fontReady = !document.fonts || document.fonts.check('12px "KM Pixel 12"'); } catch (x) { Kit.fontReady = true; }
    if (!Kit.fontReady) {
      if (!Kit.fontWait) {
        Kit.fontWait = [];
        try { document.fonts.load('12px "KM Pixel 12"').then(Kit.fontArrived, function () { /* 加载失败：保持自动宽度 */ }); } catch (x) { /* 没有 FontFace API */ }
      }
      Kit.fontWait.push([e, t]);
      return e;
    }
  }
  e.style.width = 'calc(' + Kit.fpw(t) + 'em / 12)';
  return e;
};
Kit.fontArrived = function () {
  var w = Kit.fontWait || [];
  Kit.fontWait = null;
  try { Kit.fontReady = document.fonts.check('12px "KM Pixel 12"'); } catch (x) { Kit.fontReady = true; }
  if (Kit.fontReady) for (var i = 0; i < w.length; i++) Kit.exact(w[i][0], w[i][1]);
};
// 一段（.kmNb）：长的拆成词（.kmW）；u 末尾可以带一个空格（段和段之间的空格放在前一段里，也算进宽度）
Kit.piece = function (u) {
  var sp = Kit.el('span', 'kmNb'), ch = u.length >= Kit.WORD_MIN ? Kit.chunks(u) : null;
  if (!ch || ch.length < 2) sp.textContent = u;
  else for (var i = 0; i < ch.length; i++) sp.appendChild(Kit.exact(Kit.el('span', 'kmW', ch[i]), ch[i]));
  return Kit.exact(sp, u);
};
// 一串并列的东西（奖励「武器「…」、魔典「…」」）：每一项是一段（.kmNb），只在「、」后面换行
// （不会折成「…、魔 / 典「…」」）；一项比一行还长时才在它里面按词折行。sep 接在每一项后面（最后一项不接）
Kit.parts = function (el, list, sep) {
  for (var i = 0; i < list.length; i++) el.appendChild(Kit.piece(list[i] + (i < list.length - 1 ? sep : '')));
  return el;
};
// 一行说明按短语排（窄卡片里不会折成「…剑 / 气」「5 / 米」「攻速 / +25%」「… / · 范围」）：只在「，；：。、！？」、「——」「……」后面、
// 「 · 」后面、汉字和后面的数字之间（前面至少 3 个字：不会剩下「掷出 /」「每 /」）、英文词和后面的汉字之间换行，每一段是一个 .kmNb；
// 一段比一行还长时才在它里面按词折行（Kit.piece）。
// 「 · 」：点和后面的空格是前一段末尾的 .kmSep（算进这一段的宽度，换行的位置和以前一样）；这一段正好在行末时把点藏起来
// （Kit.sepFix，排好版以后量；只改 visibility，不重新排版），一行不会以「·」结尾（「攻速 +25% · / 范围 +25%」）
Kit.phrase = function (el, t) {
  t = t == null ? '' : String(t);
  el.textContent = '';
  var u = '', i, c, n, pv, seps = false;
  var cut = function (sep) {
    if (u) el.appendChild(Kit.piece(u + sep));
    else if (sep) el.appendChild(document.createTextNode(sep));
    u = '';
  };
  for (i = 0; i < t.length; i++) {
    c = t.charAt(i); n = t.charAt(i + 1); pv = t.charAt(i - 1);
    if (c === '·' && pv === ' ' && n === ' ' && u) {
      var sp = Kit.piece(u);
      sp.appendChild(Kit.el('span', 'kmSep', '· '));
      el.appendChild(Kit.exact(sp, u + '· '));
      u = ''; seps = true; i++;
      continue;
    }
    if (c === ' ' && (pv === '·' || (/[㐀-鿿]/.test(pv) && /[0-9]/.test(n) && u.length >= 3) || (/[A-Za-z]/.test(pv) && /[㐀-鿿]/.test(n)))) { cut(' '); continue; }
    u += c;
    if (n && ('，；：。、！？'.indexOf(c) >= 0 || ((c === '—' || c === '…') && n !== c && Kit.CLOSE.indexOf(n) < 0))) cut('');
  }
  cut('');
  if (seps) Kit.sepWatch(el);
  return el;
};
// 行末的「·」藏起来：一段后面那一段在下一行（它的上沿不高于这个点的下沿）就是行末。排版变了（放进页面、字体到了、换横竖屏）时
// ResizeObserver 再量一次；元素从页面上拿掉以后不再观察
Kit.sepRO = null;
Kit.sepFix = function (el) {
  var s = el.querySelectorAll('.kmSep');
  for (var i = 0; i < s.length; i++) {
    var nx = s[i].parentNode.nextElementSibling;
    s[i].classList.toggle('kmEnd', !nx || nx.getBoundingClientRect().top >= s[i].getBoundingClientRect().bottom - 1);
  }
};
Kit.sepWatch = function (el) {
  if (typeof ResizeObserver === 'function') {
    if (!Kit.sepRO) Kit.sepRO = new ResizeObserver(function (es) {
      for (var i = 0; i < es.length; i++) { if (es[i].target.isConnected) Kit.sepFix(es[i].target); else Kit.sepRO.unobserve(es[i].target); }
    });
    Kit.sepRO.observe(el);
  } else if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { Kit.sepFix(el); });
};
// 居中的标题（弹窗标题「微波炉 · 复制一件物品 · …」）：几段用「 · 」连起来，每一段不在中间折行（Kit.piece）；一行放不下时只在「 · 」处换行，
// 而且行末不留点、行首也没有点。先算好在哪儿换行：每一段的宽度是它整数个字体像素（Kit.exact 写死的那个），一段一段往一行里放，
// 这一段（不带末尾的「 · 」）放不下就在前一段后面换行；行末那一段不带「 · 」、后面放一个 <br>，别的段带着「 · 」。
// 点是真的没了（不像 Kit.sepFix 只藏起来、还占着宽度），居中的那一行不往左偏；只按标题的宽度算一次，不量排好的版、不来回改。
// 标题的宽度只跟窗口有关（不跟字走）：窗口宽度变了（转屏、分屏）从头再算一次（Kit.titleRe）。量不到（没显示、字体还没到）时
// 先让浏览器自己折，窗口一变再算。
// parts：几段字的数组（一段里的「 · 」不在那里折行），或者一个字符串（按「 · 」切开）；只有一段时就是 textContent
Kit.titleEls = [];
Kit.title = function (el, parts) {
  if (!Array.isArray(parts)) parts = String(parts == null ? '' : parts).split(' · ');
  el._kmTitle = null;
  if (parts.length < 2) { el.textContent = parts.join(''); return el; }
  el.textContent = '';
  el.classList.add('kmTitle');
  var n = parts.length, W = el.clientWidth, i, x = 0, cut = [];
  try { if (!Kit.fontReady) Kit.fontReady = !document.fonts || document.fonts.check('12px "KM Pixel 12"'); } catch (e) { Kit.fontReady = true; }
  var ok = W > 0 && Kit.fontReady, k = ok ? (parseFloat(getComputedStyle(el).fontSize) || 24) / 12 : 0;
  for (i = 0; i < n; i++) {
    cut.push(false);
    if (!ok) continue;
    if (x > 0 && x + Kit.fpw(parts[i]) * k > W + 0.5) { cut[i - 1] = true; x = 0; }
    x += Kit.fpw(i < n - 1 ? parts[i] + ' · ' : parts[i]) * k;
  }
  for (i = 0; i < n; i++) {
    var sp;
    if (i === n - 1 || cut[i]) sp = Kit.piece(parts[i]);
    else { sp = Kit.piece(parts[i] + ' '); sp.appendChild(Kit.el('span', 'kmSep', '· ')); Kit.exact(sp, parts[i] + ' · '); }
    el.appendChild(sp);
    if (cut[i]) el.appendChild(document.createElement('br'));
  }
  el._kmTitle = parts; el._kmText = el.textContent; el._kmW = ok ? W : -1;
  if (Kit.titleEls.indexOf(el) < 0) {
    Kit.titleEls.push(el);
    if (Kit.titleEls.length === 1) window.addEventListener('resize', Kit.titleRe);
  }
  return el;
};
// 窗口变了：还是 Kit.title 排的那个标题（别处没改过它的字）、宽度也变了，就从头再排
Kit.titleRe = function () {
  for (var i = 0; i < Kit.titleEls.length; i++) {
    var el = Kit.titleEls[i];
    if (el._kmTitle && el.isConnected && el.textContent === el._kmText && el.clientWidth !== el._kmW) Kit.title(el, el._kmTitle);
  }
};
// 局内小签（成就达成 / 魔晶提示，放进 #metaToasts）：o = { kind: 'ach'|'note', tab, name, reward（字，或者几项奖励的数组：用 Kit.parts 排）, icon（图标名或元素） }
// 根元素也带 .mToast：meta.js 的排队、清空照样找得到；进出场：加 .out 是退场
Kit.slip = function (o) {
  o = o || {};
  var note = o.kind === 'note', d = Kit.el('div', 'kmSlip mToast' + (note ? ' note' : ''));
  var ic = o.icon && o.icon.nodeType ? o.icon : Kit.icon(o.icon || (note ? 'gem' : 'trophy'));
  if (ic) d.appendChild(ic);
  var tx = Kit.el('div', 'kmSlipTx'), tab = o.tab != null ? o.tab : (note ? '' : '成就达成');
  if (tab) tx.appendChild(Kit.el('div', 'kmSlipTab', tab));
  if (o.name) tx.appendChild(Kit.el('div', 'kmSlipN', o.name));
  if (o.reward && o.reward.length) tx.appendChild(Array.isArray(o.reward) ? Kit.parts(Kit.el('div', 'kmSlipR'), o.reward, '、') : Kit.el('div', 'kmSlipR', o.reward));
  d.appendChild(tx);
  return d;
};
// 像素按钮：o = { label, kind: ''|'main'|'danger'|'price', gem（价格前面画魔晶，默认画）, price, small（44 像素高的紧凑按钮）, act（data-act）,
//                 disabled, after（价格后面的字，比如「 · 还差 260」）, cls（另加的 class） }
// 价格按钮：「解锁骑士 ◆600」深蓝底、魔晶数字是魔晶色；钱不够时 disabled
Kit.BTN = { main: 'main', danger: 'danger', price: 'kmPrice' };
Kit.button = function (o) {
  o = o || {};
  var cls = 'sbtn' + (Kit.BTN[o.kind] ? ' ' + Kit.BTN[o.kind] : '') + (o.price != null && o.kind !== 'price' ? ' kmPrice' : '') + (o.small ? ' kmSmall' : '') + (o.cls ? ' ' + o.cls : '');
  var b = Kit.el('button', cls);
  b.type = 'button';
  if (o.act) b.dataset.act = o.act;
  if (o.label) b.appendChild(o.price != null ? Kit.el('span', '', o.label) : document.createTextNode(o.label));
  if (o.price != null) {
    if (o.gem !== false) b.appendChild(Kit.icon('gem'));
    b.appendChild(Kit.el('b', 'kmGemN', Kit.num(o.price)));
  }
  if (o.after) b.appendChild(Kit.el('span', '', o.after));
  // 价格按钮的字是居中的：字、数字、后面的字加起来是奇数个字体像素宽时，最后一块右边补 1 个字体像素（.kmOddFp）
  if (o.price != null && (Kit.fpw(o.label) + Kit.fpw(Kit.num(o.price), true) + Kit.fpw(o.after)) % 2) b.lastChild.classList.add('kmOddFp');
  if (o.disabled) b.disabled = true;
  return b;
};
// 小签（「新」「已完成」）：12 号深色字、用途色底、2 像素黑圈
Kit.tag = function (text, role) { return Kit.el('span', 'kmTag r-' + Kit.role(role), text); };
// 进度条：o = { v, max, thin（列表行底下 8 像素的细条，数字写在别处）, done（完成 = 绿；不写就看 v ≥ max）, text（条里的字，默认 v/max） }
Kit.bar = function (o) {
  o = o || {};
  var max = o.max > 0 ? o.max : 1, v = Math.max(0, Math.min(max, +o.v || 0)), done = o.done != null ? !!o.done : v >= max;
  var b = Kit.el('div', 'kmBar' + (o.thin ? ' thin' : '') + (done ? ' done' : ''));
  var f = Kit.el('i');
  f.style.width = Math.round(v / max * 1000) / 10 + '%';
  b.appendChild(f);
  if (!o.thin) b.appendChild(Kit.el('span', '', o.text != null ? o.text : Kit.num(v) + '/' + Kit.num(max)));
  return b;
};
// 颜色往白提亮一点（太暗的颜色在深底上看不清）：0xRRGGBB 或 '#rrggbb' / '#rgb' → 'rgb(…)'
Kit.lift = function (c) {
  if (typeof c === 'string') {
    var m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c.trim());
    if (!m) return c;
    var h = m[1].length === 3 ? m[1].replace(/(.)/g, '$1$1') : m[1];
    c = parseInt(h, 16);
  }
  c = c == null ? 0x888888 : c >>> 0;
  var rr = (c >> 16) & 255, gg = (c >> 8) & 255, bb = c & 255;
  var k = (0.299 * rr + 0.587 * gg + 0.114 * bb) / 255 < 0.45 ? 0.45 : 0;
  return 'rgb(' + Math.round(rr + (255 - rr) * k) + ',' + Math.round(gg + (255 - gg) * k) + ',' + Math.round(bb + (255 - bb) * k) + ')';
};
// 符文砖：没有 3D 图标、只能显示一个字的图块（「神」「抽」「跳」……）：深色底 + 彩色的字 + 同色 2 像素内框（不要亮色平涂方块配白字）
Kit.glyphTile = function (tile, glyph, color) {
  if (!tile) return tile;
  tile.textContent = glyph != null ? String(glyph) : '';
  tile.classList.remove('hasIcon');
  tile.classList.add('kmGlyph');
  tile.style.backgroundColor = '';
  tile.style.setProperty('--gc', Kit.lift(color));
  return tile;
};
