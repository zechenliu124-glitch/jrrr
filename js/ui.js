'use strict';
// ============================================================
//  界面：HUD、小地图、升级三选一、宝箱、行商驴车、暂停、结算、角色选择（互动点自己的弹窗在 interact_guild.js）
// ============================================================
var $ = function (id) { return document.getElementById(id); };
var UI = { cache: {}, toasts: [] };
// 其他文件可以注册弹窗选项的处理：UI.modeHandlers[mode] = function (option, index) {}；返回 'keep' 时不关闭弹窗
UI.modeHandlers = {};

// 第 13 块（T2）：狂暴那一行是 #rageText（index.html 里在 #passiveText 上面），样子和被动那一行一样，规则在 style.css
UI.set = function (id, v) {
  if (UI.cache[id] === v) return;
  UI.cache[id] = v;
  $(id).textContent = v;
};

UI.show = function (id, on) { $(id).classList.toggle('hidden', !on); };
UI.hex = function (c) { return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6); };

UI.init = function () {
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    UI.action(el.dataset.act, el);
  });
  $('sensSlider').addEventListener('input', function () { Input.sens = parseFloat(this.value); UI.sensVal(); UI.saveSettings(); });
  $('btnUse').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); Interact.use(); }, { passive: false });
  $('btnPause').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); Game.pause(true); }, { passive: false });
  UI.mm = $('minimap').getContext('2d');
  UI.watchTopCenter();
  UI.watchTopLeft();
  UI.loadSettings();
  UI.buildMenu();
};

// 提示文字（toast）总在正上方一列（倒计时、Boss 血条、别的文件加进去的进度条）下面：量出这一列的下沿写进 --tcBottom
UI.watchTopCenter = function () {
  var tc = $('topCenter'), hud = $('hud');
  var fit = function () {
    var r = tc.getBoundingClientRect();
    if (r.height > 0) hud.style.setProperty('--tcBottom', Math.round(r.bottom) + 'px');
  };
  UI.fitTopCenter = fit;   // 窄屏这一列跟着左上列往下挪时（大小没变，ResizeObserver 不报），UI.watchTopLeft 再量一次
  if (window.ResizeObserver) new ResizeObserver(fit).observe(tc);
  window.addEventListener('resize', fit);
};
// 窄屏（≤ 560 px 宽）倒计时那一列挪到两个角下面，还要躲开左上那一列：量出左上列的下沿写进 --tlBottom（变了才写）
UI.watchTopLeft = function () {
  var tl = $('topLeft'), hud = $('hud');
  if (!tl || !hud) return;
  var fit = function () {
    var r = tl.getBoundingClientRect();
    if (!(r.height > 0)) return;
    var v = Math.round(r.bottom) + 'px';
    if (UI.tlBottom !== v) { UI.tlBottom = v; hud.style.setProperty('--tlBottom', v); if (UI.fitTopCenter) UI.fitTopCenter(); }
  };
  if (window.ResizeObserver) new ResizeObserver(fit).observe(tl);
  window.addEventListener('resize', fit);
};

UI.saveSettings = function () {
  try { localStorage.setItem('knight_magic_settings', JSON.stringify({ sens: Input.sens, char: UI.selected })); } catch (e) { /* 忽略 */ }
};
UI.loadSettings = function () {
  try {
    var s = JSON.parse(localStorage.getItem('knight_magic_settings') || '{}');
    if (s.sens) Input.sens = s.sens;
    if (s.char && CHARACTERS[s.char]) UI.selected = s.char;
  } catch (e) { /* 忽略 */ }
  $('sensSlider').value = String(Input.sens);
  UI.sensVal();
};
// 视角灵敏度后面的数值（18 号金色数字，和音乐、音效滑条一样）
UI.sensVal = function () { var v = document.getElementById('sensVal'); if (v) v.textContent = (Math.round(Input.sens * 10) / 10).toFixed(1); };

UI.action = function (a, el) {
  switch (a) {
    case 'pick': UI.pickOption(parseInt(el.dataset.i, 10)); break;
    case 'reroll': if (LevelUp.rerolls > 0 && UI.mode === 'level') { LevelUp.rerolls--; UI.showLevelUp(true); } break;
    case 'skip': if (LevelUp.skips > 0 && UI.mode === 'level') { LevelUp.skips--; UI.closeModal(); Game.afterModal(); } break;
    case 'banish': if (LevelUp.banishes > 0 && UI.mode === 'level') { UI.banishMode = !UI.banishMode; UI.renderCards(); } break;
    case 'takeItem': Items.give(UI.pendingItem); UI.closeModal(); Game.afterModal(); break;
    case 'buy': UI.buy(parseInt(el.dataset.i, 10)); break;
    case 'leaveShop': UI.closeModal(); Game.afterModal(); break;
    case 'pause': Game.pause(true); break;
    case 'resume': Game.pause(false); break;
    case 'restart': UI.closeModal(); Game.start(Game.charId); break;
    case 'menu': UI.closeModal(); Game.toMenu(); break;
    case 'start': UI.saveSettings(); Game.start(UI.selected); Input.lock(); break;
    case 'char': UI.selected = el.dataset.id; UI.buildMenu(); break;
  }
};

// ---------------- 像素小图标（字符画 → SVG，k 是黑描边） ----------------
UI.PX_PAL = { k: '#000000', w: '#ffffff', g: '#b9c2d2', y: '#ffc928', Y: '#fff2a8', o: '#c27a0e', b: '#9a5a26', B: '#5e3412' };
UI.PX_ICONS = {
  clock: ['..kkkkk..', '.kwwwwwk.', 'kwwwkwwgk', 'kwwwkwwgk', 'kwwwkkkgk', 'kwwwwwwgk', 'kgwwwwggk', '.kgggggk.', '..kkkkk..'],
  coin: ['..kkkkk..', '.kyyyyyk.', 'kyYYyyyok', 'kyYyoyyok', 'kyYyoyyok', 'kyyyoyyok', 'kyyyyyook', '.koooook.', '..kkkkk..'],
  skull: ['..kkkkk..', '.kwwwwwk.', 'kwwwwwwgk', 'kwkkwkkgk', 'kwkkwkkgk', 'kwwwkwwgk', '.kwwwwgk.', '.kwkwkwk.', '..kkkkk..'],
  chest: ['.kkkkkkk.', 'kbbbybbbk', 'kbbbybbbk', 'kyyyYyyyk', 'kbbkYkbbk', 'kbbbybbbk', 'kBBBBBBBk', 'kkkkkkkkk']
};
UI.pixelSvg = function (name) {
  var rows = UI.PX_ICONS[name];
  if (!rows) return '';
  var paths = {};
  for (var y = 0; y < rows.length; y++) {
    for (var x = 0; x < rows[y].length; x++) {
      var ch = rows[y][x];
      if (UI.PX_PAL[ch]) paths[ch] = (paths[ch] || '') + 'M' + x + ' ' + y + 'h1v1h-1z';
    }
  }
  var s = '<svg viewBox="0 0 ' + rows[0].length + ' ' + rows.length + '" shape-rendering="crispEdges" aria-hidden="true">';
  for (var c in paths) s += '<path fill="' + UI.PX_PAL[c] + '" d="' + paths[c] + '"/>';
  return s + '</svg>';
};
UI.fillIcons = function (root) {
  var els = (root || document).querySelectorAll('[data-px]');
  for (var i = 0; i < els.length; i++) if (!els[i].firstChild) els[i].innerHTML = UI.pixelSvg(els[i].dataset.px);
};
// 脚本在页面最后加载，这时 HUD 的元素已经在了
UI.fillIcons();
// 提前加载像素字体 KM Pixel 12（画布上的字不会自己去下载网页字体）；菜单等它到了再出现（#menu.kmFontWait，最多等 3 秒）
(function () {
  var menu = document.getElementById('menu');
  var show = function () {
    if (menu) menu.classList.remove('kmFontWait');
    // 竖屏居中的标语：宽度补成偶数个字体像素（UI.evenFp）
    var tg = document.querySelector('#menu .tag');
    try { if (tg && UI.evenFp) UI.evenFp(tg, tg.textContent, parseFloat(getComputedStyle(tg).fontSize) || 18, false); } catch (e) { /* 量不了就不补 */ }
  };
  try {
    if (document.fonts && document.fonts.load) {
      Promise.all([
        document.fonts.load('18px "KM Pixel 12"', '0123456789+$骑士鼓舞格挡'),
        document.fonts.load('12px "KM Pixel 12"', 'Lv0123456789')
      ]).then(show, show);   // 离线、加载失败：用后备字体照样显示
      setTimeout(show, 3000);
    } else show();
  } catch (e) { show(); }
})();

// ---------------- 图标（icons.js：用游戏里同一套低多边形模型拍成的像素小图） ----------------
// 图标第一次用到时用游戏的渲染器画一次（ICONS 会缓存成图片地址）；渲染器还没建好、WebGL 画布丢了就不要它
// （画布恢复后 iconsOn 又是 true，HUD 的格子会因为这个变化重画成图标）
UI.iconsOn = function () { return typeof ICONS !== 'undefined' && typeof Game !== 'undefined' && !!Game.renderer && !(ICONS.lost && ICONS.lost()); };
UI.iconBad = {};
// 返回 <i class="pxicon">；没有图标、还不能画、画失败都返回 null（界面照旧显示汉字）
UI.iconEl = function (kind, id) {
  if (!kind || id == null || !UI.iconsOn()) return null;
  var k = kind + ':' + id;
  if (UI.iconBad[k]) return null;
  try { return ICONS.el(kind, id); } catch (e) {
    // 某个图标的模型坏了：以后不再试，界面用汉字；渲染目标切回画面，免得游戏画面画到离屏目标里
    UI.iconBad[k] = true;
    try { Game.renderer.setRenderTarget(null); } catch (e2) { /* 忽略 */ }
    return null;
  }
};
// 往图块里放图标：有图标就加 .hasIcon（深色底，见 style.css）；没有图标就是一块「符文砖」（深色底 + 彩色的字，Kit.glyphTile）
UI.fillTile = function (el, kind, id, glyph, color) {
  var ic = UI.iconEl(kind, id);
  el.textContent = '';
  el.classList.toggle('hasIcon', !!ic);
  // 画布丢了才显示的汉字砖：记下要的是哪个图标（.kmIcoWait），画布恢复后 UI.iconsRestored 原地换成图标
  var wait = !ic && kind && id != null && !UI.iconsOn() && typeof ICONS !== 'undefined' && !!ICONS.nameFor(kind, id);
  el.__wait = wait ? { kind: kind, id: id } : null;
  el.classList.toggle('kmIcoWait', wait);
  if (ic) { el.classList.remove('kmGlyph'); el.style.removeProperty('--gc'); el.style.backgroundColor = ''; el.appendChild(ic); }
  else if (typeof Kit !== 'undefined') Kit.glyphTile(el, glyph || '', color != null ? color : 0x888888);
  else { el.textContent = glyph || ''; el.style.backgroundColor = UI.hex(color != null ? color : 0x888888); }
  return !!ic;
};
// 画布恢复了（icons.js ICONS.hookContext，恢复后的下一帧、着色器编好以后）：丢的时候打开的升级卡、宝箱、商店、暂停页……
// 里的汉字砖原地换成图标；砖里别的东西（.slotLv、数量、Lv 角标）留着。主菜单的骑士格子整个重排一次（它的缓存键带 iconsOn）
UI.iconsRestored = function () {
  if (!UI.iconsOn()) return 0;
  var els = document.querySelectorAll('.kmIcoWait'), n = 0;
  for (var i = 0; i < els.length; i++) {
    var el = els[i], w = el.__wait;
    if (!el.isConnected || !w) continue;
    var ic = UI.iconEl(w.kind, w.id);
    if (!ic) continue;
    for (var c = el.firstChild; c;) { var nx = c.nextSibling; if (c.nodeType === 3) el.removeChild(c); c = nx; }
    el.classList.remove('kmGlyph', 'kmIcoWait');
    el.style.removeProperty('--gc'); el.style.backgroundColor = '';
    el.classList.add('hasIcon');
    el.insertBefore(ic, el.firstChild);
    el.__wait = null;
    n++;
  }
  if (typeof Game !== 'undefined' && Game.state === 'menu' && UI.buildMenu) UI.buildMenu();
  return n;
};
// 武器栏、纹章栏用哪个图标：觉醒成超武的武器用超武图标
UI.weaponIcon = function (w) { return { kind: w.evo ? 'evo' : 'weapon', id: w.id }; };
// 选项卡片用哪个图标：o.iconKind / o.iconId（别的文件可以直接指定）> 宝物卡的 itemId > 升级卡的 kind + id
UI.optionIcon = function (o) {
  if (!o) return null;
  if (o.iconKind) return { kind: o.iconKind, id: o.iconId != null ? o.iconId : o.id };
  if (o.itemId) return { kind: 'item', id: o.itemId };
  var k = String(o.kind || ''), id = o.id;
  if (id == null) return null;
  if (k === 'weapon-up' || k === 'weapon-new' || k === 'weapon') {
    var w = typeof Weapons !== 'undefined' && Weapons.find ? Weapons.find(id) : null;
    return { kind: w && w.evo ? 'evo' : 'weapon', id: id };
  }
  if (k === 'evo' || k === 'evo-done') return { kind: 'evo', id: id };
  if (k.indexOf('tome') === 0) return { kind: 'tome', id: id };
  return null;
};

// ---------------- 主菜单 ----------------
UI.selected = 'squire';
UI.buildMenu = function () {
  var g = $('charGrid'), ids = Object.keys(CHARACTERS);
  // 头像是用角色模型拍的半身像（ICONS 'char'）：角色表没变就不重建，只换选中的高亮（头像不重画、不闪）
  var key = ids.join() + (UI.iconsOn() ? '+' : '');
  if (g.__key !== key || g.children.length !== ids.length) {
    g.__key = key;
    g.innerHTML = '';
    ids.forEach(function (id) {
      var c = CHARACTERS[id];
      var b = document.createElement('button');
      b.className = 'charCard';
      b.dataset.act = 'char';
      b.dataset.id = id;
      b.innerHTML = '<div class="charIcon"></div><div class="charName"></div><div class="charWeapon"></div>';
      UI.fillTile(b.querySelector('.charIcon'), 'char', id, c.icon, c.color);
      b.querySelector('.charName').textContent = c.name;
      b.querySelector('.charWeapon').textContent = WEAPONS[c.weapon].name;
      g.appendChild(b);
    });
  }
  for (var i = 0; i < g.children.length; i++) g.children[i].classList.toggle('sel', g.children[i].dataset.id === UI.selected);
  if (Game.scene && W.noise) Game.showMenuModel(UI.selected);
  var c = CHARACTERS[UI.selected];
  var box = $('charDesc');
  box.innerHTML = '';
  var t = document.createElement('div'); t.className = 'cdTitle'; t.textContent = c.name + ' · ' + c.title;
  var w = UI.descRow('初始武器', WEAPONS[c.weapon].name + ' · ' + WEAPONS[c.weapon].desc, 'cdWeapon');
  var p = UI.descRow('被动', UI.passiveLine(UI.selected), 'cdPassive');   // 这一行只在这里写（ui_pages.js 只加金色标签、箭头和点开）
  var parts = [];
  if (c.stats) Object.keys(c.stats).forEach(function (k) { parts.push(LevelUp.statText(k, c.stats[k])); });
  // 没有属性加成时这一行先藏着（movement_ui.js 可能往里加摔落伤害）
  var s = UI.descRow('属性', parts.join('，'), 'cdStats' + (parts.length ? '' : ' hidden'));
  box.appendChild(t); box.appendChild(w); box.appendChild(p); box.appendChild(s);
};
// 骑士卡上的被动一行：第 5 块的 Passive.cardText（带当前数值的一句话）；没有就用 summary / passive / 被动名
UI.passiveLine = function (id) {
  var c = CHARACTERS[id];
  if (!c) return '';
  try { if (typeof Passive !== 'undefined' && Passive.cardText) { var t = Passive.cardText(id); if (t) return t; } } catch (e) { /* 用下面的 */ }
  var name = c.passiveName || String(c.passive || '').split('：')[0] || '被动';
  if (c.summary) return name + '：' + c.summary;
  return c.passive || name;
};
// 骑士介绍的一行：左边固定 4 个字宽的灰色标签（初始武器 / 被动 / 滑铲 / 坐骑特性 / 属性），右边内容（折行挂在内容下面，kit.css 的 .kmL）；
// 内容按短语排（UI.descText → Kit.phrase：不会折成「移 / 动速度」「滑 / 铲」），改内容也用 UI.descText
UI.descText = function (v, text) {
  text = text == null ? '' : String(text);
  if (typeof Kit !== 'undefined' && Kit.phrase) Kit.phrase(v, text); else v.textContent = text;
  return v;
};
UI.descRow = function (label, text, cls) {
  var d = document.createElement('div');
  d.className = 'kmL' + (cls ? ' ' + cls : '');
  var k = document.createElement('span'); k.className = 'kmK'; k.textContent = label;
  var v = UI.descText(document.createElement('span'), text); v.className = 'kmV';
  d.appendChild(k); d.appendChild(v);
  return d;
};

// ---------------- HUD ----------------
// 只在数值变化时改宽度/位置（百分比，一位小数），减少每帧的样式重算
UI.setPct = function (id, pct, prop) {
  var p = prop || 'width', key = id + '.' + p, v = Math.round(pct * 10) / 10;
  if (UI.cache[key] === v) return;
  UI.cache[key] = v;
  $(id).style[p] = v + '%';
};
UI.setClass = function (id, cls, on) {
  var key = id + '.' + cls;
  if (UI.cache[key] === on) return;
  UI.cache[key] = on;
  $(id).classList.toggle(cls, on);
};

// 一段字在 KM Pixel 12 里有几个字体像素宽（画布量，不读布局）；ls = 每个字后面还有 1 个字体像素的字距（像素加粗的数字）。
// 18 号字一个字体像素是 1.5 像素：居中的一行字如果是奇数个字体像素宽，会落在半个设备像素上（笔画发虚），要补 1 个（kit.js 的 Kit.fpw 也用它）
UI.fpw = function (t, ls) {
  t = t == null ? '' : String(t);
  if (!t) return 0;
  var c = UI.mctx || (UI.mctx = document.createElement('canvas').getContext('2d'));
  c.font = '12px "KM Pixel 12"';
  return Math.round(c.measureText(t).width) + (ls ? t.length : 0);
};
// 居中的像素字：是奇数个字体像素宽就在右边补 1 个字体像素，让宽度变成偶数个。fs = 字号
UI.evenFp = function (el, t, fs, ls) {
  el.style.paddingRight = UI.fpw(t, ls) % 2 ? fs / 12 + 'px' : '';
};
// 血条里居中的生命数字（数字一变就一会儿清楚一会儿糊）：只在文字变了时算
UI.hpEven = function (t) {
  if (UI.hpEvenT === t) return;
  var el = $('hpText');
  if (!el) return;
  UI.hpEvenT = t;
  if (!UI.hpFs) UI.hpFs = parseFloat(getComputedStyle(el).fontSize) || 18;
  UI.evenFp(el, t, UI.hpFs, true);
};
// 窗口变了（小屏换小一档字号）：重新量
window.addEventListener('resize', function () { UI.hpFs = 0; UI.hpEvenT = null; });

UI.update = function () {
  var st = P.st;
  // 生命条：红色是生命，琥珀色是护盾（接在生命后面）
  var maxSh = (st.shield > 0 ? st.shield : 0) + (P.shieldX || 0), tot = st.maxHp + maxSh;   // 加上被动的护盾层（修女）
  var hpPct = clamp(P.hp / tot, 0, 1) * 100;
  UI.setPct('hpFill', hpPct);
  UI.setPct('shieldFill', hpPct, 'left');
  UI.setPct('shieldFill', maxSh > 0 ? clamp(P.shield / tot, 0, 1) * 100 : 0);
  // 生命和上限用同一种取整：上限四舍五入，生命向上取整但不超过上限（90.4/90.4 以前显示 91/90），活着时至少 1
  var hpMax = Math.max(1, Math.round(st.maxHp)), hpNow = P.hp > 0 ? clamp(Math.ceil(P.hp), 1, hpMax) : 0;
  var hpT = hpNow + '/' + hpMax + (P.shield >= 1 ? ' +' + Math.round(P.shield) : '');
  UI.set('hpText', hpT);
  UI.hpEven(hpT);
  UI.setClass('hpBar', 'low', P.hp < st.maxHp * 0.3);
  UI.setPct('xpFill', clamp(P.xp / P.xpNext, 0, 1) * 100);
  UI.set('lvText', String(P.level));
  UI.set('chestPrice', fmtNum(Interact.chestCost()));
  var rem = Director.remaining();
  if (Director.swarm) UI.set('timer', '+' + fmtTime(Director.swarmT));
  else UI.set('timer', fmtTime(Math.ceil(rem)));
  UI.setClass('timer', 'red', Director.swarm || rem < 60);
  UI.set('stageName', '第 ' + Game.stage + ' 关 · ' + Game.stageDef.name + (Director.swarm ? ' · 午夜钟声' : ''));
  UI.set('runTime', fmtTime(Game.totalTime));
  UI.set('goldText', fmtNum(P.gold));
  UI.set('killText', fmtNum(P.kills));
  UI.set('passiveText', Passive.hudText());
  // 狂暴（拾取的药水）单独一行，在被动那一行上面：接在被动后面时窄屏（Split View）放不下
  UI.set('rageText', P.rage > 0 ? '狂暴 ' + Math.ceil(P.rage) + ' 秒' : '');
  var b = Enemies.boss;
  UI.show('bossBar', !!b);
  if (b) {
    UI.set('bossName', b.def.name + (Game.bossesLeft > 1 ? ' ×' + Game.bossesLeft : ''));
    UI.setPct('bossFill', clamp(b.hp / b.maxHp, 0, 1) * 100);
  }
  // 换了图标（比如超武进化：图标换成超武的）也要重画；图标能画了（渲染器建好）也重画一次
  var key = P.weapons.map(function (w) { return w.id + w.level + (w.evo ? '*' : '') + w.def.icon; }).join() + '|' + P.tomes.map(function (t) { return t.id + t.level; }).join() + '|' + st.weaponSlots + st.tomeSlots + (UI.iconsOn() ? '+' : '');
  if (UI.cache.slots !== key) {
    UI.cache.slots = key;
    UI.renderSlots('weaponSlots', P.weapons.map(function (w) { var k = UI.weaponIcon(w); return { kind: k.kind, id: k.id, icon: w.def.icon, color: w.def.color, lv: w.level }; }), st.weaponSlots);
    UI.renderShield(P.tomes.map(function (t) { return { kind: 'tome', id: t.id, icon: TOMES[t.id].icon, color: TOMES[t.id].color, lv: t.level }; }), st.tomeSlots);
  }
  // 增益栏（interact_more.js 建在 #topLeft 里）、速度读数（movement_ui.js 插在任务框后面）挪到纹章盾右边那一列
  var qs = $('questSide');
  if (qs) ['mxBuffs', 'speedText'].forEach(function (id) { var e = $(id); if (e && e.parentNode !== qs) qs.appendChild(e); });
  var ik = UI.iconsOn() ? '+' : '';
  for (var id in P.items) if (P.items[id] > 0) ik += id + P.items[id] + ',';
  if (UI.cache.items !== ik) { UI.cache.items = ik; UI.renderItems(); }
  UI.updateQuest();
  var now = Game.realTime;
  for (var i = UI.toasts.length - 1; i >= 0; i--) {
    if (now - UI.toasts[i].t > 2.8) { UI.toasts[i].el.remove(); UI.toasts.splice(i, 1); }
  }
  UI.updateBeaconEdge();
  UI.drawMinimap();
};

// ---------------- 屏幕边上的烽火台圈：找到了、还没点燃、又不在屏幕里时，在它那个方向的屏幕边上闪一个关卡颜色的像素圈 ----------------
// 9×9 像素（每格 3 px = 27 px），k 黑描边、c 关卡颜色，中间空着；style.css 的 #beaconEdge 让它 1 秒一闪（steps(2)，减弱动态效果时不闪）
UI.BEACON_RING = ['..kkkkk..', '.kccccck.', 'kcckkkcck', 'kck...kck', 'kck...kck', 'kck...kck', 'kcckkkcck', '.kccccck.', '..kkkkk..'];
UI.beaconEdgeEl = function () {
  if (UI.bEdge) return UI.bEdge;
  var hud = $('hud');
  if (!hud) return null;
  var el = document.createElement('div');
  el.id = 'beaconEdge';
  el.className = 'hidden';
  el.setAttribute('aria-hidden', 'true');
  var d = { k: '', c: '' }, rows = UI.BEACON_RING;
  for (var y = 0; y < rows.length; y++) for (var x = 0; x < rows[y].length; x++) if (d[rows[y][x]] != null) d[rows[y][x]] += 'M' + x + ' ' + y + 'h1v1h-1z';
  el.innerHTML = '<svg viewBox="0 0 9 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="#000" d="' + d.k + '"/><path class="bc" d="' + d.c + '"/></svg>';
  hud.appendChild(el);
  UI.bEdge = el;
  UI.bEdgePath = el.querySelector('.bc');
  UI.bEdgeV = new THREE.Vector3();
  return el;
};
// 底部安全区的高度（env(safe-area-inset-bottom)，换了窗口大小才重新量）
UI.safeBottom = function () {
  var key = window.innerWidth + 'x' + window.innerHeight;
  if (UI.sbKey === key) return UI.sbVal;
  if (!UI.sbProbe) {
    UI.sbProbe = document.createElement('div');
    UI.sbProbe.style.cssText = 'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none';
    document.body.appendChild(UI.sbProbe);
  }
  UI.sbKey = key;
  UI.sbVal = UI.sbProbe.offsetHeight || 0;
  return UI.sbVal;
};
// 屏幕边的圈要躲开的 HUD：lb / rb = 左上 / 右上列底下再留 22 px，lr / rl = 顶边上能放的 x 范围，
// ub = 右边那一列触屏按钮（互动、跳跃）顶上再留 22 px，yT = 顶边那条线（不进屏幕中间 60 % 的框），
// top = 顶边那条线上不能放的 x 段（正上方那一列：倒计时、Boss 血条、誓言 / 比武进度条，还有提示文字、公告；左右各留 22 px）；
// 半秒量一次，提示牌出现 / 消失（互动按钮跟着变）、多了 / 少了提示文字、进度条出现 / 消失时马上重量
UI.hudCols = function () {
  var pr = $('mxProgress'), prOn = pr && pr.style.display !== 'none' ? 1 : 0, ann = $('annLayer');
  // 左下角被动那一行和狂暴那一行有没有字也算进去（有字时它们的上沿是屏幕左边那条侧边的下限，blT）
  var blOn = (($('passiveText') || {}).textContent ? 1 : 0) + (($('rageText') || {}).textContent ? 2 : 0);
  var now = Game.realTime || 0, c = UI.hcVal, key = window.innerWidth + 'x' + window.innerHeight + '|' + UI.cache.prompt + '|' + document.body.className + '|' + UI.toasts.length + '|' + prOn + '|' + (ann ? ann.children.length : 0) + '|' + blOn;
  if (c && UI.hcKey === key && now - UI.hcT < 0.5 && now >= UI.hcT) return c;
  var W2 = window.innerWidth, H2 = window.innerHeight, l = $('topLeft'), r = $('topRight'), lr = l ? l.getBoundingClientRect() : null, rr = r ? r.getBoundingClientRect() : null, ub = Infinity;
  var tb = $('touchBtns'), i, q;
  if (tb) for (i = 0; i < tb.children.length; i++) {
    q = tb.children[i].getBoundingClientRect();
    if (q.width > 0 && q.height > 0 && q.right > W2 - 50) ub = Math.min(ub, q.top - 22);
  }
  var yT = Math.min(150, Math.floor(H2 * 0.2 - 15)), top = [];
  var avoid = function (e) {
    if (!e) return;
    var b = e.getBoundingClientRect();
    // 圈是 27 px，上下各 13.5 px 再留 8 px：和顶边那条线隔得够远的不用躲
    if (b.width > 0 && b.height > 0 && b.top < yT + 22 && b.bottom > yT - 22) top.push([b.left - 22, b.right + 22]);
  };
  avoid($('topCenter'));
  if (prOn) avoid(pr);
  for (i = 0; i < UI.toasts.length; i++) avoid(UI.toasts[i].el);
  if (ann && getComputedStyle(ann).visibility !== 'hidden') for (i = 0; i < ann.children.length; i++) avoid(ann.children[i]);   // 公告（Kit.announce）
  // 左下角被动那一行（第 5 块，触屏时在提示牌上面 196 px）：左边那条侧边最低只到它上面再留 22 px
  var bl = $('bottomLeft'), blr = bl ? bl.getBoundingClientRect() : null, blT = blr && blr.width > 0 && blr.height > 0 && blr.left < 60 ? blr.top - 22 : Infinity;
  c = UI.hcVal = { lb: lr ? lr.bottom + 22 : 150, rb: rr ? rr.bottom + 22 : 150, lr: lr ? lr.right + 22 : 28, rl: rr && rr.width > 0 ? rr.left - 22 : W2 - 28, ub: ub, yT: yT, top: top, blT: blT };
  UI.hcT = now; UI.hcKey = key;
  return c;
};
// 顶边那条线上离 x 最近、能放圈的地方（两列 HUD 中间，躲开 cols.top 的每一段）；哪儿都放不下给 null
UI.topSpot = function (x, cols) {
  var a = cols.lr, b = Math.max(cols.lr, cols.rl), segs = [[a, b]], i, j, out = [];
  if (cols.rl < cols.lr) return null;
  for (i = 0; i < cols.top.length; i++) {
    var t = cols.top[i];
    out = [];
    for (j = 0; j < segs.length; j++) {
      var s = segs[j];
      if (t[1] <= s[0] || t[0] >= s[1]) { out.push(s); continue; }
      if (t[0] > s[0]) out.push([s[0], t[0]]);
      if (t[1] < s[1]) out.push([t[1], s[1]]);
    }
    segs = out;
  }
  var best = null, bd = Infinity;
  for (j = 0; j < segs.length; j++) {
    var v = clamp(x, Math.ceil(segs[j][0]), Math.floor(segs[j][1]));
    if (v < segs[j][0] || v > segs[j][1]) continue;
    if (Math.abs(v - x) < bd) { bd = Math.abs(v - x); best = v; }
  }
  return best;
};
UI.updateBeaconEdge = function () {
  var el = UI.beaconEdgeEl(), o = Interact.portal, cam = Game.camera;
  if (!el) return;
  var show = false, px = 0, py = 0;
  if (Game.state === 'play' && o && o.found && !o.used && cam) {
    var v = UI.bEdgeV.set(o.x, o.y + 4, o.z).applyMatrix4(cam.matrixWorldInverse);
    var pm = cam.projectionMatrix.elements, sx = v.x * pm[0], sy = v.y * pm[5], w = -v.z;
    // 在镜头前面而且在屏幕里（±0.92）就不用提示
    var inView = w > 0.1 && Math.abs(sx / w) <= 0.92 && Math.abs(sy / w) <= 0.92;
    if (!inView) {
      // 方向：屏幕中心指向它（在镜头后面时不除以 w，方向就不会反过来）；正后方正中间时放到下边
      if (Math.abs(sx) < 1e-6 && Math.abs(sy) < 1e-6) sy = -1;
      var behind = w <= 0.1;
      if (!behind) { sx /= w; sy /= w; }
      var W2 = window.innerWidth, H2 = window.innerHeight, cx = W2 / 2, cy = H2 / 2;
      var dx = sx * cx, dy = -sy * cy, t = Infinity, tb = Infinity;
      // 夹在 x 28…W−28、y yT…yB 的框上（yT：顶边那条线，矮的横屏上也在屏幕中间 60 % 的框外面；
      // yB = 提示牌顶上再留 8 px，多行的提示牌也压不到）
      var cols = UI.hudCols(), yT = cols.yT, yB = Math.max(yT, H2 - UI.safeBottom() - (H2 > 560 ? 210 : 170));
      if (dx > 0) t = Math.min(t, (W2 - 28 - cx) / dx); else if (dx < 0) t = Math.min(t, (28 - cx) / dx);
      if (dy > 0) tb = (yB - cy) / dy; else if (dy < 0) t = Math.min(t, (yT - cy) / dy);
      var side = function (left, high) {
        // 离它近的那条侧边：最低处（左边：提示牌上面；右边：触屏按钮上面），high = 最高处（HUD 列的下面）
        px = left ? 28 : W2 - 28;
        if (high) py = Math.min(yB, left ? cols.lb : cols.rb);
        else py = left ? Math.max(cols.lb, Math.min(yB, cols.blT)) : Math.max(cols.rb, Math.min(yB, cols.ub));
      };
      if (behind || tb < t) {
        // 在镜头后面（刚走过去）、碰到底边：不放在上下正中间（进度条、提示牌、屏幕中间），放到侧边
        side(dx < 0);
      } else {
        if (!isFinite(t)) t = 0;
        px = Math.round(clamp(cx + dx * t, 28, W2 - 28));
        py = Math.round(clamp(cy + dy * t, yT, yB));
        // 左上、右上两列 HUD（生命、武器栏、任务；小地图）的地方不放：侧边上挪到列的下面；
        // 顶边上挪到两列中间、正上方那一列（进度条）和提示文字的旁边，放不下就去侧边
        if (px <= 28 && py < cols.lb) py = Math.min(yB, cols.lb);
        else if (px <= 28 && py > cols.blT) py = Math.max(cols.lb, Math.min(yB, cols.blT));
        else if (px >= W2 - 28) py = clamp(py, Math.min(yB, cols.rb), Math.max(cols.rb, Math.min(yB, cols.ub)));
        else if (py <= yT) {
          var tx = UI.topSpot(px, cols);
          if (tx == null) side(px < cx, true); else px = Math.round(tx);
        }
      }
      show = true;
    }
  }
  if (!show) {
    if (UI.bEdgeOn) { UI.bEdgeOn = false; el.classList.add('hidden'); el.classList.remove('on'); }
    return;
  }
  var col = Interact.beaconCss();
  if (UI.bEdgeCol !== col) { UI.bEdgeCol = col; UI.bEdgePath.setAttribute('fill', col); }
  var pos = px + ',' + py;
  if (UI.bEdgePos !== pos) { UI.bEdgePos = pos; el.style.transform = 'translate3d(' + px + 'px,' + py + 'px,0)'; }
  if (!UI.bEdgeOn) { UI.bEdgeOn = true; el.classList.remove('hidden'); el.classList.add('on'); }
};

// #weaponSlots / #tomeSlots 的每个子元素就是一个栏位（按 P.weapons / P.tomes 的顺序）
// 每个栏位记住自己的图标：图标没变只改等级字；换了武器或觉醒超武才换成新栏位（evolution.js 会给新栏位重新加金框和角标）
UI.renderSlots = function (id, items, slots) {
  var el = $(id), on = UI.iconsOn();
  while (el.children.length > slots) el.removeChild(el.lastElementChild);
  for (var i = 0; i < slots; i++) {
    var it = items[i], old = el.children[i] || null;
    var ik = it ? it.kind + ':' + it.id + ':' + it.icon + (on ? '+' : '') : '-';
    if (old && old.__icon === ik) {
      if (it && old.__lvEl && old.__lv !== it.lv) { old.__lv = it.lv; old.__lvEl.textContent = 'Lv ' + it.lv; }
      continue;
    }
    var s = document.createElement('div');
    s.className = 'slot';
    s.__icon = ik;
    if (it) {
      UI.fillTile(s, it.kind, it.id, it.icon, it.color);
      var lv = document.createElement('span');
      lv.className = 'slotLv';
      lv.textContent = 'Lv ' + it.lv;
      s.appendChild(lv);
      s.__lv = it.lv; s.__lvEl = lv;
    } else s.classList.add('empty');
    if (old) el.replaceChild(s, old); else el.appendChild(s);
  }
};

// ---------------- 纹章盾：纹章栏画成一面分四格的小盾（第 5、6 格是盾上沿的两块图块） ----------------
// 形状照 tools/mock12.py 的 halfw()：两边直的，下面一段圆弧收成尖，一行一行按整像素画（crispEdges）。
// q = 每格多大（iPad 36，窄屏 28）；b = 黑边 2 + 斜面（36：2 像素，28：1 像素）；四格之间、往下到尖是 2 像素黑十字。
// 返回 { bg, rim, W, H }：bg 是图标后面的整面盾（黑边、斜面、四格底色、十字），rim 只有黑边和斜面，盖在图标上面
// （图标超出圆弧的那几个像素被边盖住，不用 clip-path）。miss = 缺的那几格（信使骑士少一格：涂成平的暗色、没有点）
UI.shieldSvg = function (q, miss) {
  var key = q + ':' + (miss || ''), c = UI.shCache || (UI.shCache = {});
  if (c[key]) return c[key];
  var b = q >= 36 ? 4 : 3, W = 2 * b + 2 * q + 2, flat = b + q + 2 + Math.floor(q * 0.55), H = b + 2 * q + 2 + Math.floor(q * 0.4);
  var R = ((W / 2) * (W / 2) + (H - flat) * (H - flat)) / (2 * (H - flat)), cy = H - R, m = W / 2, x0q = b + q, QS = [[b, b], [b + q + 2, b], [b, b + q + 2], [b + q + 2, b + q + 2]];
  var hw = function (y) { if (y < flat) return m; var v = R * R - (y - cy) * (y - cy); return v > 0 ? Math.floor(Math.sqrt(v)) : 0; };
  var COL = { k: '#000', h: '#3a4e80', t: '#1c2846', a: '#1c2744', d: '#141b30', x: '#0e1322' };
  var bg = {}, rim = {}, y, x;
  var run = function (o, ch, xa, xb, yy) { if (ch && xb > xa) o[ch] = (o[ch] || '') + 'M' + xa + ' ' + yy + 'h' + (xb - xa) + 'v1h-' + (xb - xa) + 'z'; };
  for (y = 0; y < H; y++) {
    var h0 = hw(y);
    if (h0 <= 0) continue;
    var h2 = y >= 2 ? hw(y - 2) - 2 : -1, h3 = y >= b && y < H - b + 1 ? hw(y - b) - b : -1;
    var cb = null, cr = null, sb = 0, sr = 0;
    for (x = m - h0; x <= m + h0; x++) {
      var ib = null, ir = null;
      if (x < m + h0) {
        var inner = h3 > 0 && x >= m - h3 && x < m + h3, inRim = h2 > 0 && x >= m - h2 && x < m + h2;
        if (!inner) { ib = ir = inRim ? 'h' : 'k'; }
        else if ((x >= x0q && x < x0q + 2) || (y >= x0q && y < x0q + 2)) ib = 'k';
        else {
          ib = 't';
          for (var i = 0; i < 4; i++) {
            if (x >= QS[i][0] && x < QS[i][0] + q && y >= QS[i][1] && y < QS[i][1] + q) ib = miss && miss.indexOf(String(i)) >= 0 ? 'x' : (i === 0 || i === 3 ? 'a' : 'd');
          }
        }
      }
      if (ib !== cb) { run(bg, cb, sb, x, y); cb = ib; sb = x; }
      if (ir !== cr) { run(rim, cr, sr, x, y); cr = ir; sr = x; }
    }
  }
  var svg = function (o, cls) {
    var t = '<svg class="' + cls + '" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" shape-rendering="crispEdges" aria-hidden="true">';
    for (var k in o) t += '<path fill="' + COL[k] + '" d="' + o[k] + '"/>';
    return t + '</svg>';
  };
  c[key] = { bg: svg(bg, 'shBg s' + q), rim: svg(rim, 'shRim s' + q), W: W, H: H };
  return c[key];
};
// #tomeSlots 里的 .slot 还是按 P.tomes 的顺序（前 4 个是四格，第 5、6 个是盾上沿的图块）；每格记住自己的图标（__icon），
// 图标没变只改等级数字。两种大小的盾都放着，style.css 按窗口宽度显示一种（窄屏换小一号不用重画）
UI.renderShield = function (items, slots) {
  var el = $('tomeSlots'), on = UI.iconsOn(), cap = typeof LEVEL_CAP !== 'undefined' ? LEVEL_CAP.crest : 10;
  var nq = Math.min(slots, 4), nc = Math.max(0, slots - 4), miss = '';
  for (var m = nq; m < 4; m++) miss += m;
  var shape = nq + ':' + nc;
  if (el.__shape !== shape) {
    // 栏位数变了：盾重新搭（很少：开局、捡到纹章画笔）
    el.__shape = shape;
    // （栏位最多 6 个：画盾骑士 +1、纹章画笔 +1；盾上沿那一排最多两块）
    el.className = 'kmShield n' + slots + (nc ? ' chief' + Math.min(nc, 2) : '');
    el.innerHTML = UI.shieldSvg(36, miss).bg + UI.shieldSvg(28, miss).bg + UI.shieldSvg(36, miss).rim + UI.shieldSvg(28, miss).rim;
  }
  var cells = el.querySelectorAll('.slot');
  for (var i = 0; i < slots; i++) {
    var it = items[i], old = cells[i] || null, chief = i >= 4;
    var ik = it ? it.kind + ':' + it.id + ':' + it.icon + (on ? '+' : '') : '-';
    if (old && old.__icon === ik) {
      if (it && old.__lv !== it.lv) { old.__lv = it.lv; old.__lvEl.textContent = String(it.lv); old.__lvEl.classList.toggle('max', it.lv >= cap); }
      continue;
    }
    var s = document.createElement('div');
    s.className = 'slot ' + (chief ? 'shC c' + (i - 4) : 'shQ q' + i);
    s.__icon = ik;
    if (it) {
      UI.fillTile(s, it.kind, it.id, it.icon, it.color);
      var lv = document.createElement('b');
      lv.className = 'shLv' + (it.lv >= cap ? ' max' : '');
      lv.textContent = String(it.lv);
      s.appendChild(lv);
      s.__lv = it.lv; s.__lvEl = lv;
    } else s.classList.add('empty');
    if (old) el.replaceChild(s, old); else el.appendChild(s);
  }
  for (i = cells.length - 1; i >= slots; i--) el.removeChild(cells[i]);
};

// 下方的宝物栏：只在宝物变化时更新；已经有的宝物格子留着（图标不重画、不闪），只改数量
UI.itemEls = {};   // 宝物 id -> 宝物栏里的格子
UI.renderItems = function () {
  var bar = $('itemBar'), on = UI.iconsOn(), els = {}, prev = null;
  for (var id in P.items) {
    var n = P.items[id], it = ITEMS[id];
    if (!(n > 0) || !it) continue;
    var d = UI.itemEls[id];
    if (!d || d.__on !== on) {
      d = document.createElement('div');
      d.className = 'itm';
      d.style.setProperty('--rc', RARITY[it.rarity].color);
      UI.fillTile(d, 'item', id, it.icon, it.color);
      d.__on = on;
    }
    els[id] = d;
    if (d.__n !== n) {
      d.__n = n;
      var c = d.querySelector('.itmN');
      if (n > 1) {
        if (!c) { c = document.createElement('span'); c.className = 'itmN'; d.appendChild(c); }
        c.textContent = 'x' + n;
      } else if (c) d.removeChild(c);
    }
    // 按获得的顺序排（P.items 的键顺序）
    var want = prev ? prev.nextSibling : bar.firstChild;
    if (want !== d) bar.insertBefore(d, want);
    prev = d;
  }
  UI.itemEls = els;
  // 排好的格子后面剩下的（没有了的宝物、换下来的旧格子）都去掉
  while (prev ? prev.nextSibling : bar.firstChild) bar.removeChild(prev ? prev.nextSibling : bar.firstChild);
};

// ---------------- 任务框：一行「当前目标」（找到烽火台 → 点燃烽火台 → 击败首领（Boss）→ 进入传送门），完成一步盖一个火漆章 ----------------
// 第几步（0–3）：和以前任务框看的是同一些东西
UI.questStep = function () {
  var portal = Interact.portal, exit = Interact.exit;
  if (exit && !exit.used) return 3;
  if (Game.bossAlive) return 2;
  if (portal && portal.found && !portal.used) return 1;
  return 0;
};
UI.QUEST = [['找到烽火台', ''], ['点燃烽火台', 'boss'], ['击败首领（Boss）', 'boss'], ['进入传送门', 'go']];
UI.updateQuest = function () {
  var step = UI.questStep(), main = step + (step === 2 && Game.bossesLeft > 1 ? 'x' : '');
  // 右边那一列：午夜钟声（钟 + 红字）、护卫冠军、挑战精英
  var side = Director.swarm ? 'S' : '';
  var champ = typeof Guild !== 'undefined' && Guild.champion && Guild.champion.alive;
  if (champ) side += 'C';
  for (var i = 0; i < Game.challenges.length; i++) {
    var list = Game.challenges[i].list, dead = 0;
    for (var j = 0; j < list.length; j++) if (!list[j].alive) dead++;
    side += '|' + dead + '/' + list.length;
  }
  var row = function (cls) { var r = document.createElement('div'); r.className = 'questRow' + (cls ? ' ' + cls : ''); return r; };
  if (UI.cache.quest !== main) {
    UI.cache.quest = main;
    // 新的一步：同一关里步数变多时，新盖的章落下来（0.18 秒，steps(3)）；开局、换关、第一次画、减弱动态效果时不动
    // （减弱动态效果：系统设置或者游戏里的开关，settings.js 给 body 加 .kmRM）
    var rm = document.body.classList.contains('kmRM') || !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var prev = UI.questPrev, stamp = !!prev && prev.stage === Game.stage && step > prev.step && !rm;
    UI.questPrev = { stage: Game.stage, step: step };
    var box = $('quest'), r = row('qMain' + (UI.QUEST[step][1] ? ' ' + UI.QUEST[step][1] : ''));
    var tab = typeof Kit !== 'undefined' ? Kit.tag('当前目标', 'gold') : document.createElement('span');
    tab.classList.add('qTab');
    if (!tab.textContent) tab.textContent = '当前目标';
    var seals = document.createElement('span');
    seals.className = 'qSeals';
    for (i = 0; i <= step; i++) {
      var ic = typeof Kit !== 'undefined' ? Kit.icon(i < step ? 'seal' : 'sealRing') : null;
      if (!ic) continue;
      ic.classList.add(i < step ? 'qSeal' : 'qRing');
      if (stamp && i === step - 1) ic.classList.add('kmStamp');
      seals.appendChild(ic);
    }
    var t = document.createElement('span');
    t.className = 'qText';
    t.textContent = UI.QUEST[step][0] + (main.slice(-1) === 'x' ? '×' + Game.bossesLeft : '');
    r.appendChild(tab); r.appendChild(seals); r.appendChild(t);
    box.innerHTML = '';
    box.appendChild(r);
  }
  if (UI.cache.questSide === side) return;
  UI.cache.questSide = side;
  var qs = $('questSide');
  if (!qs) return;
  qs.querySelectorAll('.questRow').forEach(function (e) { e.remove(); });
  var first = qs.firstChild;
  var add = function (text, cls, icon) {
    var r2 = row(cls);
    var ic2 = icon && typeof Kit !== 'undefined' ? Kit.icon(icon) : null;
    if (ic2) r2.appendChild(ic2);
    var t2 = document.createElement('span');
    t2.textContent = text;
    r2.appendChild(t2);
    qs.insertBefore(r2, first);
  };
  // 加时不换掉主线（出去的路还是烽火台）：右边一行红字 + 钟
  if (Director.swarm) add('撑过午夜钟声', 'red', 'bell');
  if (champ) add('击败护卫冠军', 'purple');
  for (i = 0; i < Game.challenges.length; i++) {
    var l = Game.challenges[i].list, d = 0;
    for (j = 0; j < l.length; j++) if (!l[j].alive) d++;
    add('击败挑战精英 ' + d + '/' + l.length, 'purple');
  }
};

// ---------------- 小地图（北朝上，半径 60 米；深蓝底 + 白色圆环） ----------------
// 图标形状：dot 圆点、square 方块、diamond 菱形、triangle 三角、star 星星、ring 圆环、cross 十字、beacon 火苗、envelope 信封（不认识的画成圆点）
// s 是半径（图标大约占 2s × 2s），都带黑描边
UI.mmIcon = function (c, x, y, color, shape, s) {
  var k, a, r;
  c.fillStyle = color;
  c.strokeStyle = '#000';
  c.lineWidth = 1.5;
  c.beginPath();
  switch (shape) {
    case 'diamond': c.moveTo(x, y - s); c.lineTo(x + s, y); c.lineTo(x, y + s); c.lineTo(x - s, y); c.closePath(); break;
    case 'square': c.rect(x - s, y - s, s * 2, s * 2); break;
    case 'triangle': c.moveTo(x, y - s * 1.2); c.lineTo(x + s * 1.15, y + s * 0.85); c.lineTo(x - s * 1.15, y + s * 0.85); c.closePath(); break;
    case 'star':
      for (k = 0; k < 10; k++) {
        a = -Math.PI / 2 + k * Math.PI / 5; r = k % 2 ? s * 0.72 : s * 1.45;
        c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      c.closePath(); break;
    case 'cross':
      a = s * 0.42; r = s * 1.1;
      c.moveTo(x - a, y - r); c.lineTo(x + a, y - r); c.lineTo(x + a, y - a); c.lineTo(x + r, y - a); c.lineTo(x + r, y + a); c.lineTo(x + a, y + a);
      c.lineTo(x + a, y + r); c.lineTo(x - a, y + r); c.lineTo(x - a, y + a); c.lineTo(x - r, y + a); c.lineTo(x - r, y - a); c.lineTo(x - a, y - a);
      c.closePath(); break;
    case 'beacon':
      // 火苗（烽火台）：尖头朝上的水滴，里面一团淡黄的火芯（半大、偏下，不描边）
      UI.mmFlame(c, x, y, s);
      c.fill(); c.stroke();
      c.fillStyle = '#fff2a8';
      c.beginPath();
      UI.mmFlame(c, x, y + s * 0.3, s * 0.5);
      c.fill();
      return;
    case 'envelope':
      // 信封（信使骑士的急件）：横的长方形 + 封口的 V 线（线用描边色，所以金色 / 白色闪的时候都看得出是信封）
      a = s * 1.25; r = s * 0.85;
      c.rect(x - a, y - r, a * 2, r * 2);
      c.fill(); c.stroke();
      c.lineWidth = 1.2;
      c.beginPath(); c.moveTo(x - a, y - r); c.lineTo(x, y + r * 0.25); c.lineTo(x + a, y - r); c.stroke();
      return;
    case 'ring':
      // 空心圆环（比实心图标稍大一点，中间的洞才看得清）：先画粗黑环当描边，再画彩色环
      r = Math.max(1.5, s * 0.45);
      c.arc(x, y, s * 1.15, 0, TAU);
      c.lineWidth = r + 2.4; c.stroke();
      c.strokeStyle = color; c.lineWidth = r; c.stroke();
      return;
    default: c.arc(x, y, s, 0, TAU);
  }
  c.fill(); c.stroke();
};

// 小地图边上的箭头（范围外的标记，Content.drawMinimap 用）：细长的三角，尖朝外；斜着的时候也看得出朝外
// (x, y) 是箭头中心，ang 是朝外的方向
UI.mmArrow = function (c, x, y, ang, color) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.fillStyle = color; c.strokeStyle = '#000'; c.lineWidth = 1.5; c.lineJoin = 'miter';
  c.beginPath(); c.moveTo(7, 0); c.lineTo(-5, -3.5); c.lineTo(-5, 3.5); c.closePath(); c.fill(); c.stroke();
  c.restore();
};

// 火苗的路径（s 是半宽：尖头在 y − 1.55s，底大约在 y + 0.9s）
UI.mmFlame = function (c, x, y, s) {
  c.moveTo(x, y - 1.55 * s);
  c.quadraticCurveTo(x + 1.15 * s, y - 0.2 * s, x + 0.8 * s, y + 0.55 * s);
  c.quadraticCurveTo(x, y + 1.25 * s, x - 0.8 * s, y + 0.55 * s);
  c.quadraticCurveTo(x - 1.15 * s, y - 0.2 * s, x, y - 1.55 * s);
  c.closePath();
};

UI.resetMinimap = function () { UI.mmT = 0; };
// 每 3 帧画一次（换关后的第一帧马上画）；force：立刻画（打开弹窗时，弹窗后面的小地图不会是空的）
UI.drawMinimap = function (force) {
  UI.mmT = (UI.mmT || 0) + 1;
  if (UI.mmT % 3 !== 1 && force !== true) return;
  var c = UI.mm, cv = c.canvas, S = cv.width, R = S / 2, RI = R - 6, range = 60, k = RI / range;
  c.clearRect(0, 0, S, S);
  c.save();
  c.beginPath(); c.arc(R, R, RI, 0, TAU); c.clip();
  c.fillStyle = 'rgba(8,17,40,0.86)';
  c.fillRect(0, 0, S, S);
  var px = P.pos.x, pz = P.pos.z;
  // 每 20 米一条暗网格线，跟着世界走
  c.fillStyle = 'rgba(120,170,255,0.1)';
  for (var g = Math.ceil((px - range) / 20) * 20; g <= px + range; g += 20) c.fillRect(Math.round(R - (g - px) * k), 0, 1, S);
  for (g = Math.ceil((pz - range) / 20) * 20; g <= pz + range; g += 20) c.fillRect(0, Math.round(R - (g - pz) * k), S, 1);
  var toMap = function (x, z) { return { x: R - (x - px) * k, y: R - (z - pz) * k }; };
  // 敌人
  c.fillStyle = 'rgba(255,74,58,0.85)';
  for (var i = 0; i < Enemies.list.length; i += 2) {
    var e = Enemies.list[i];
    if (Math.abs(e.x - px) > range || Math.abs(e.z - pz) > range) continue;
    var q = toMap(e.x, e.z);
    c.fillRect(q.x - 1, q.y - 1, 2, 2);
  }
  var icon = function (o, color, shape, size) {
    var p = toMap(o.x, o.z);
    var dx = p.x - R, dy = p.y - R, d = Math.sqrt(dx * dx + dy * dy);
    if (d > RI - 3) return false;
    UI.mmIcon(c, p.x, p.y, color, shape, size);
    return true;
  };
  Interact.list.forEach(function (o) {
    if (o.used) return;
    var K = Interact.KINDS[o.kind];
    if (K) {
      var mi = typeof K.mapIcon === 'function' ? K.mapIcon(o) : K.mapIcon;
      if (mi) icon(o, mi.color, mi.shape, mi.size);
      return;
    }
    switch (o.kind) {
      case 'chest': icon(o, o.free ? '#fff2a8' : '#ffc928', 'square', 3); break;
      case 'exitportal': icon(o, '#9fd8ff', 'diamond', 5); break;
      case 'bossportal': if (o.found) icon(o, Interact.beaconCss(), 'beacon', 5); break;
    }
  });
  c.restore();
  // 范围外的烽火台（找到了、还没点燃）和出口传送门：同样的图标小一号，钉在小地图边上（在裁剪外面画，不会被切掉）
  [Interact.portal && Interact.portal.found && !Interact.portal.used ? Interact.portal : null, Interact.exit && !Interact.exit.used ? Interact.exit : null].forEach(function (o) {
    if (!o) return;
    var p = toMap(o.x, o.z), dx = p.x - R, dy = p.y - R, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= RI - 3) return;
    if (o.kind === 'exitportal') UI.mmIcon(c, R + dx / d * (RI - 7), R + dy / d * (RI - 7), '#9fd8ff', 'diamond', 4);
    else UI.mmIcon(c, R + dx / d * (RI - 7), R + dy / d * (RI - 7), Interact.beaconCss(), 'beacon', 4);
  });
  // 玩家箭头（朝向镜头方向）
  c.save(); c.translate(R, R); c.rotate(-P.yaw + Math.PI);
  c.fillStyle = '#ffffff'; c.strokeStyle = '#000'; c.lineWidth = 2;
  c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill(); c.stroke();
  c.restore();
  // 外圈：黑边夹着 3 像素白环
  c.strokeStyle = '#000'; c.lineWidth = 6;
  c.beginPath(); c.arc(R, R, R - 3, 0, TAU); c.stroke();
  c.strokeStyle = '#ffffff'; c.lineWidth = 3;
  c.beginPath(); c.arc(R, R, R - 3.5, 0, TAU); c.stroke();
};

// 提示文字：9 个字以内 24 号，长的 18 号（.kmLong）；返回这条提示的元素。颜色用用途色（Kit.color('gold') / Kit.color('red')……，UI_STYLE §4.3）
UI.toast = function (text, color) {
  var d = document.createElement('div');
  d.className = String(text).length > 9 ? 'toast kmLong' : 'toast';
  // 长的按短语排（窄屏上折成两行时只在「：」「 · 」、汉字和数字之间折，不会剩下「220 / 米」、行末的「·」）
  if (String(text).length > 9 && String(text).indexOf('\n') < 0 && typeof Kit !== 'undefined' && Kit.phrase) Kit.phrase(d, text);
  else d.textContent = text;
  d.style.color = color || '#fff';
  $('toasts').appendChild(d);
  // 18 号居中：奇数个字体像素宽的一行会落在半个设备像素上，补成偶数个（24 号一个字体像素 2 像素，总是整的）。
  // 看算出来的字号，不看 class：窄屏（分屏、侧拉，≤ 700 像素）上短提示也是 18 号
  var fs = parseFloat(getComputedStyle(d).fontSize) || 24;
  if (fs % 12) UI.evenFp(d, text, fs);
  UI.toasts.push({ el: d, t: Game.realTime });
  if (UI.toasts.length > 4) { UI.toasts[0].el.remove(); UI.toasts.shift(); }
  return d;
};

UI.flashHurt = function () {
  var h = $('hurt');
  h.classList.remove('on');
  void h.offsetWidth;
  h.classList.add('on');
};

UI.goldPop = function () {
  var g = $('goldBox');
  g.classList.remove('pop');
  void g.offsetWidth;
  g.classList.add('pop');
};

// 提示底板居中（translateX(-50%)）：最宽的一行是奇数个字体像素时，18 号字会落在半个设备像素上（笔画旁边一列灰、底板边发虚）。
// 一行：文字的 span 补 1 个字体像素（底板照样左右 14 像素内边距）；几行（圣锻炉，pre-line）：看最宽的一行（第一行前面还有 E 键帽），
// 补在底板的右内边距上（CSS 里的 14 像素再加 1 个字体像素）
UI.promptEven = function (el, sp, k, text) {
  var fs = parseFloat(getComputedStyle(el).fontSize) || 18, lines = String(text).split('\n');
  el.style.paddingRight = '';
  sp.style.paddingRight = '';
  if (el.classList.contains('kmLeft')) return;   // 靠左的提示（UI.promptFit）：左边对齐在整像素上，不用补
  if (lines.length < 2) { UI.evenFp(sp, text, fs); return; }
  var kw = k ? k.getBoundingClientRect().width + (parseFloat(getComputedStyle(k).marginRight) || 0) : 0, best = -1, odd = false;
  for (var i = 0; i < lines.length; i++) {
    var t = lines[i].replace(/\s+/g, ' ').trim(), fp = UI.fpw(t), w = fp * fs / 12 + (i === 0 ? kw : 0);
    if (w > best + 0.01) { best = w; odd = fp % 2 === 1; }
  }
  if (odd) el.style.paddingRight = (parseFloat(getComputedStyle(el).paddingRight) || 0) + fs / 12 + 'px';
};

// busy = 正在进行（立了誓的石碑、比武中的木人、在滚的滚石）：提示是进度的金色（.busy），不是拒绝的红色，
// 也没什么可按的（互动按钮藏起来，Interact.use 不报错）
UI.setPrompt = function (text, ok, busy) {
  busy = !!text && !!busy;
  var key = text + ok + (busy ? '|busy' : '');
  if (UI.cache.prompt === key) { if (text) UI.promptFit(); return; }
  UI.cache.prompt = key;
  UI.show('prompt', !!text);
  UI.show('btnUse', !!text && Input.isTouch && !busy);
  if (text) {
    var el = $('prompt');
    el.innerHTML = '';
    // 键盘玩家显示 E 键帽（进行中的没有键可按）
    var k = null;
    if (!Input.isTouch && !busy) { k = document.createElement('span'); k.className = 'key'; k.textContent = 'E'; el.appendChild(k); }
    var sp = document.createElement('span');
    UI.promptBody(sp, text, false);
    el.appendChild(sp);
    el.classList.toggle('bad', !ok && !busy);
    el.classList.toggle('busy', busy);
    UI.promptRef = { el: el, sp: sp, k: k, text: text };
    UI.promptFit(true);
  }
};
// 触屏：居中的提示牌压到右边的圆形互动按钮（Split View 593 / 504 / 375 / 320 宽）时改成靠左（.kmLeft）：左边 16 像素，
// 右边离按钮 9 像素，在短语之间折行。字、窗口大小、提示牌的样式（圣锻炉的几行）变了才重新量
UI.promptFit = function (force) {
  var r = UI.promptRef, el = r && r.el;
  if (!el) return;
  var key = UI.cache.prompt + '|' + window.innerWidth + 'x' + window.innerHeight + '|' + el.className.replace(/\s*kmLeft|\s*kmSmall/g, '') + '|' + Input.isTouch;
  if (!force && UI.pfKey === key) return;
  UI.pfKey = key;
  var b = $('btnUse'), left = false, multi = String(r.text).indexOf('\n') >= 0;
  if (el.classList.contains('kmLeft')) { el.classList.remove('kmLeft', 'kmSmall'); if (multi || r.short) UI.promptBody(r.sp, r.text, false); r.short = null; }
  UI.promptEven(el, r.sp, r.k, r.text);
  if (Input.isTouch && b && !b.classList.contains('hidden')) {
    var pr = el.getBoundingClientRect(), br = b.getBoundingClientRect();
    left = br.width > 0 && pr.width > 0 && pr.right > br.left && pr.left < br.right && pr.bottom > br.top && pr.top < br.bottom;
  }
  if (left) { el.classList.add('kmLeft'); if (multi) UI.promptBody(r.sp, r.text, true); UI.promptCap(el, r); UI.promptEven(el, r.sp, r.k, r.short || r.text); }
};
// 靠左的提示牌在人物脚下的血条和摇杆之间，最多 2 行 18 号（3 行会盖住血条）：长了先换成短的说法
// （「炼金坩埚 · 还能炼 2 次」，按下去以后弹窗的标题还是整句）；还放不下就用 12 号字（UI_STYLE 窄窗口的 HUD 字号，最多 3 行）：
// 整句放得下用整句，放不下用短的
UI.PROMPT_LINES = 2;
UI.PROMPT_LINES_S = 3;
UI.promptLines = function (el) {
  var cs = getComputedStyle(el), lh = parseFloat(cs.lineHeight) || 24;
  return Math.round((el.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)) / lh);
};
UI.promptCap = function (el, r) {
  if (UI.promptLines(el) <= UI.PROMPT_LINES) return;
  var sh = UI.promptShort(r.text);
  if (sh === r.text) sh = null;
  if (sh) { r.short = sh; UI.promptBody(r.sp, sh, true); if (UI.promptLines(el) <= UI.PROMPT_LINES) return; }
  // 还要更短的说法（互动点自己给的 short，第 13 块 O1：320 宽也是 18 号两行，「铁匠铺 · 剩 3 次 / 花 1,400 金币锻造」）
  var tiny = UI.promptTiny(r.text);
  if (tiny && tiny !== r.text && tiny !== sh) { r.short = tiny; UI.promptBody(r.sp, tiny, true); if (UI.promptLines(el) <= UI.PROMPT_LINES) return; }
  el.classList.add('kmSmall');
  r.short = null; UI.promptBody(r.sp, r.text, true);
  if (UI.promptLines(el) <= UI.PROMPT_LINES_S) return;
  // 12 号的短说法还超过 3 行（圣锻炉好几把武器没到条件）：再试更短的（UI.promptAlts），最后一种不管多少行都用
  var alts = (sh ? [sh] : []).concat(UI.promptAlts(r.text) || []);
  for (var i = 0; i < alts.length; i++) {
    r.short = alts[i]; UI.promptBody(r.sp, alts[i], true);
    if (UI.promptLines(el) <= UI.PROMPT_LINES_S) return;
  }
};
// 互动点自己的最短说法（Interact.KINDS[kind].short(o)）：只给正在提示的那一个（Interact.near，提示的字就是它的 label）
UI.promptTiny = function (text) {
  var o = typeof Interact !== 'undefined' ? Interact.near : null, k = o && Interact.KINDS && Interact.KINDS[o.kind];
  if (!k || typeof k.short !== 'function') return null;
  try { return Interact.label(o) === text ? k.short(o) || null : null; } catch (e) { return null; }
};
// 更短的说法，从长到短（只有圣锻炉有：Evo.forgeShort）
UI.promptAlts = function (text) {
  return typeof Evo !== 'undefined' && Evo.forgeShort ? Evo.forgeShort(text) : null;
};
// 短的说法：「名字：说明 · 最后一段」→「名字 · 最后一段」；说明里有价钱（「1,400 金币」）而最后一段没有时把价钱留着。
// 几行的（圣锻炉：第一行是条件的说明，下面每把武器一行）：第一行只留名字
UI.promptShort = function (text) {
  text = String(text);
  var c = text.indexOf('：'), nl = text.indexOf('\n');
  if (nl > c && c > 0) return text.slice(0, c) + text.slice(nl);
  if (nl >= 0 || c < 1) return null;
  var seg = text.slice(c + 1).split(' · ');
  if (seg.length < 2) return null;
  var last = seg[seg.length - 1], price = seg.slice(0, -1).join(' ').match(/[0-9][0-9,]* 金币/);
  return text.slice(0, c) + (price && last.indexOf('金币') < 0 ? ' · ' + price[0] : '') + ' · ' + last;
};
// 提示的字：一行的放不下时只在短语之间折（Kit.phrase：「：」「 · 」后面，行末的「·」藏起来）；几行的（圣锻炉，pre-line）居中时照旧。
// 靠左的窄提示牌里几行的：每行一块，并排的两条（「　　」隔开）各是一段，放不下时第二条换到下一行，每段在短语之间折（不会折成「向 / 日葵纹章」）
UI.promptBody = function (sp, text, left) {
  text = String(text);
  var K = typeof Kit !== 'undefined' && Kit.phrase ? Kit : null;
  if (text.indexOf('\n') < 0) { if (K) K.phrase(sp, text); else sp.textContent = text; return; }
  if (!left || !K) { sp.textContent = text; return; }
  sp.textContent = '';
  text.split('\n').forEach(function (line) {
    var d = document.createElement('div');
    d.className = 'kmPl';
    line.split('　　').forEach(function (part) { var q = document.createElement('span'); q.className = 'kmPq'; K.phrase(q, part.trim()); d.appendChild(q); });
    sp.appendChild(d);
  });
};

// ---------------- 弹窗 ----------------
var MODALS = ['levelModal', 'itemModal', 'shopModal', 'pauseModal', 'endModal'];
UI.openModal = function (id) {
  MODALS.forEach(function (m) { UI.show(m, m === id); });
  UI.show('modalBg', true);
  // 关卡卡片（「迷雾森林 / 雾气缭绕的古老林地」）还在时打开弹窗（开局就点行商驴车）：卡片收起来，不被弹窗切成两半（第 13 块 G6）
  if (typeof Kit !== 'undefined' && Kit.annDrop) Kit.annDrop('stageCard');
  // 弹窗后面的 HUD 整体变暗；小地图也马上画一次（和指南针字母一致，不会只剩字母）
  if (Game.state !== 'menu' && UI.mm && P.pos) UI.drawMinimap(true);
  if (document.pointerLockElement) { Input.selfRelease = true; document.exitPointerLock(); }
  // 钉在底部的按钮行下面还压着内容时，按钮行上面加一条硬边分隔线。内容是打开以后才填的：下一帧、0.35 秒后再量
  // （不在这里马上量，那样要多排一次版）；没有 requestAnimationFrame 的环境只等 0.35 秒
  var el = $(id);
  if (el) {
    if (!el.__moreHook) { el.__moreHook = true; el.addEventListener('scroll', function () { UI.modalMore(el); }, { passive: true }); }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(function () { UI.modalMore(el); });
    setTimeout(function () { UI.modalMore(el); }, 350);
  }
};
// 弹窗里的内容要滚动（放不下）：加 .kmMore（style.css 在钉住的按钮行上面画分隔线）；滚到底也留着（固定的框边，不会一滚就闪），放得下就去掉。
// 滚动时也再量一次（内容是后来填的）
UI.modalMore = function (el) {
  if (!el || el.classList.contains('hidden')) return;
  var more = el.scrollHeight - el.clientHeight > 1;
  if (el.__more !== more) { el.__more = more; el.classList.toggle('kmMore', more); }
};
window.addEventListener('resize', function () { MODALS.forEach(function (m) { UI.modalMore(document.getElementById(m)); }); });

UI.closeModal = function () {
  MODALS.forEach(function (m) { UI.show(m, false); });
  UI.show('modalBg', false);
  UI.banishMode = false;
  if (Game.state === 'modal' || Game.state === 'pause') Input.lock();
};

// 卡片：foot（参数或 o.foot）是右下角的文字，没有就写稀有度；能用数字键选的卡片（act 为 pick 的前四张）显示键位
// 图标见 UI.optionIcon（别的文件可以传 o.iconKind / o.iconId 指定，比如超武卡传 iconKind: 'evo'）；没有图标显示 o.icon 汉字
UI.card = function (o, i, act, foot) {
  var r = RARITY[o.rarity] || RARITY[0];
  act = act || 'pick';
  foot = foot || o.foot;
  var b = document.createElement('button');
  b.className = 'card';
  b.dataset.act = act;
  b.dataset.i = String(i);
  b.style.setProperty('--rc', r.color);
  b.style.setProperty('--rg', r.glow);
  b.innerHTML = '<div class="cardTop"><div class="cardIcon"></div><div><div class="cardTitle"></div><div class="cardSub"></div></div></div><div class="cardLines"></div><div class="cardRarity"></div>';
  var ik = UI.optionIcon(o);
  UI.fillTile(b.querySelector('.cardIcon'), ik && ik.kind, ik && ik.id, o.icon, o.color || 0x888888);
  b.querySelector('.cardTitle').textContent = o.title;
  b.querySelector('.cardSub').textContent = o.sub || '';
  // 每一行说明按短语排（kit.js 的 Kit.phrase：只在标点后面、数字前面换行，太长的一段只在词和词之间折，不会折成「龙卷 / 风」「生 / 命回复」）
  var lines = b.querySelector('.cardLines');
  (o.lines || []).forEach(function (l) { var d = document.createElement('div'); if (typeof Kit !== 'undefined' && Kit.phrase) Kit.phrase(d, l); else d.textContent = l; lines.appendChild(d); });
  // 下一个目标（「Lv8 可觉醒（需要 雄狮纹章 Lv2）」「再来一枚：百兽之王」）：在 .cardLines 外面，同样按短语排
  if (o.goal) {
    var g = document.createElement('div'); g.className = 'cardGoal';
    if (typeof Kit !== 'undefined' && Kit.phrase) Kit.phrase(g, o.goal); else g.textContent = o.goal;
    lines.parentNode.insertBefore(g, lines.nextSibling);
  }
  var fe = b.querySelector('.cardRarity');
  fe.textContent = foot || r.name;
  // 稀有度颜色只给稀有度那个字（UI_STYLE §2.4 R1）：价格（「160 金币」）用金币的金色，别的动作字（「离开」「复制」）用普通的字色
  if (foot && /\d 金币/.test(foot)) fe.classList.add('cardPrice');
  else if (foot && foot !== r.name) fe.classList.add('cardAct');
  if (i < 4 && act === 'pick') {
    var k = document.createElement('span'); k.className = 'cardKey'; k.textContent = String(i + 1);
    b.appendChild(k);
  }
  return b;
};

UI.itemCard = function (id, i, act, foot) {
  var it = ITEMS[id];
  return UI.card({ itemId: id, title: it.name, icon: it.icon, color: it.color, rarity: it.rarity, sub: P.items[id] ? '已拥有 ×' + P.items[id] : RARITY[it.rarity].name + '宝物', lines: [Relic.cardText(id, foot === '放进去' ? 0 : 1)] }, i, act, foot);   // 第 6 块：炼金坩埚第一、二步「放进去」的是已经有的宝物，按现有件数写；别的卡都是要拿的那一件
};

// 升级三选一（重抽时保留模式）
UI.showLevelUp = function (reroll) {
  UI.options = LevelUp.options();
  UI.mode = 'level';
  if (!UI.options.length) { UI.closeModal(); Game.afterModal(); return; }
  UI.openModal('levelModal');
  UI.show('levelBtns', true);
  $('levelTitle').textContent = '升级！  Lv ' + P.level;
  UI.renderCards();
};

UI.renderCards = function () {
  var box = $('levelCards');
  box.innerHTML = '';
  UI.options.forEach(function (o, i) { box.appendChild(o.itemId ? UI.itemCard(o.itemId, i, 'pick', o.foot) : UI.card(o, i, 'pick', o.foot)); });
  box.classList.toggle('banishing', !!UI.banishMode);
  UI.btnText('btnReroll', 'R', '重抽', LevelUp.rerolls);
  UI.btnText('btnSkip', 'X', '跳过', LevelUp.skips);
  if (UI.banishMode) UI.btnText('btnBanish', '', '选择要放逐的卡…');
  else UI.btnText('btnBanish', 'B', '放逐', LevelUp.banishes);
  $('btnReroll').disabled = LevelUp.rerolls <= 0;
  $('btnSkip').disabled = LevelUp.skips <= 0;
  $('btnBanish').disabled = LevelUp.banishes <= 0;
};

// 按钮文字：键帽（键盘提示）+ 文字 + 剩余次数
UI.btnText = function (id, key, text, n) {
  var el = $(id);
  el.innerHTML = '';
  if (key) { var k = document.createElement('span'); k.className = 'key'; k.textContent = key; el.appendChild(k); }
  el.appendChild(document.createTextNode(text));
  if (n != null) { var c = document.createElement('span'); c.className = 'cnt'; c.textContent = String(n); el.appendChild(c); }
};

UI.pickOption = function (i) {
  var o = UI.options && UI.options[i];
  if (!o) return;
  if (UI.mode === 'level' && UI.banishMode) {
    // 放逐：这件武器/纹章本局不再出现
    LevelUp.banned[o.id] = true;
    LevelUp.banishes--;
    UI.banishMode = false;
    UI.toast('已放逐：' + o.title, Kit.color('cya'));
    UI.showLevelUp(true);
    return;
  }
  if (UI.modeHandlers[UI.mode]) {
    if (UI.modeHandlers[UI.mode](o, i) === 'keep') return;
    UI.closeModal();
    Game.afterModal();
    return;
  }
  if (UI.mode === 'pick') {
    // 通用的“选一个”：选项要么是一件宝物（itemId），要么自己带 onPick
    if (o.itemId) { Items.give(o.itemId); UI.toast('获得 ' + ITEMS[o.itemId].name, '#ffd84a'); }   // 奖励 = 金色（不用稀有度颜色）
    else if (typeof o.onPick === 'function') o.onPick(o, i);
  }
  else LevelUp.apply(o);
  UI.closeModal();
  Game.afterModal();
};

// title：字符串（按「 · 」分段）或几段字的数组；居中、只在段和段之间换行，行末不留「·」（Kit.title）
UI.choiceModal = function (mode, title, options) {
  UI.options = options;
  UI.mode = mode;
  UI.openModal('levelModal');
  Kit.title($('levelTitle'), title);
  UI.show('levelBtns', false);
  UI.renderCards();
};

UI.chestReward = function (id) {
  Game.openModal(function () {
    UI.pendingItem = id;
    UI.openModal('itemModal');
    var box = $('itemCard');
    box.innerHTML = '';
    var it = ITEMS[id];
    $('itemTitle').textContent = RARITY[it.rarity].name + '宝物！';
    $('itemTitle').style.color = RARITY[it.rarity].color;
    box.appendChild(UI.itemCard(id, 0, 'takeItem', '收下'));
  });
};

// 行商驴车：四件不同稀有度的宝物，可以一件件买（每买一件，剩下的涨价 30%），买完行商就走；货是 interact_guild.js 进的
UI.pedlar = function (o) {
  Game.openModal(function () {
    if (!o.stock) Guild.pedlarStock(o);
    UI.shopRef = o;
    UI.openModal('shopModal');
    UI.renderShop();
  });
};

UI.renderShop = function () {
  var box = $('shopCards');
  box.innerHTML = '';
  UI.shopRef.stock.forEach(function (s, i) {
    if (s.sold) {
      // 卖掉的：写「已售出」，卡片变暗、点不了
      var sc = UI.itemCard(s.id, i, 'buy', '已售出');
      sc.disabled = true;
      sc.classList.add('sold');
      box.appendChild(sc);
      return;
    }
    // 价格用金币的金色（不用稀有度的颜色：史诗是红色，看起来像买不起）；钱不够时后面写「还差 N」，卡片变暗
    var short = s.price - P.gold;
    var c = UI.itemCard(s.id, i, 'buy', Kit.num(s.price) + ' 金币' + (short > 0 ? ' · 还差 ' + Kit.num(short) : ''));
    c.disabled = short > 0;
    box.appendChild(c);
  });
  // 按短语排（Kit.phrase）：窄屏（320）在「 · 」后面折行，不会把「涨价」拆成「涨 / 价 30%」，行末的「·」也藏起来（Kit.sepFix）
  Kit.phrase($('shopGold'), '金币 ' + Kit.num(P.gold) + ' · 每买一件，剩下的涨价 30%');
};

// 买一件：商店不关，接着买；四件都卖完了行商就走（Guild.pedlarBuy 里 Interact.consume），这时关掉
UI.buy = function (i) {
  var o = UI.shopRef;
  if (!o || !Guild.pedlarBuy(o, i)) return;
  if (o.used) { UI.closeModal(); Game.afterModal(); }
  else UI.renderShop();
};

UI.STAT_ROWS = ['maxHp', 'regen', 'shield', 'armor', 'evasion', 'heal', 'damage', 'critChance', 'critDmg', 'atkSpeed', 'quantity', 'size', 'duration', 'projSpeed', 'knockback', 'moveSpeed', 'slide', 'jump', 'extraJumps', 'pickup', 'luck', 'xpGain', 'goldGain', 'chestDisc', 'difficulty', 'eliteDmg'];

UI.statValue = function (k) {
  var s = STATS[k], v = P.st[k];
  if (s.show) v = s.show(v);
  if (s.pct) return Math.round(v * 1000) / 10 + '%';
  return String(Math.round(v * 10) / 10);
};

UI.showPause = function () {
  UI.openModal('pauseModal');
  var box = $('statList');
  box.innerHTML = '';
  UI.STAT_ROWS.forEach(function (k) {
    var d = document.createElement('div');
    d.className = 'statRow';
    var a = document.createElement('span'); a.textContent = STATS[k].name;
    var b = document.createElement('span'); b.textContent = UI.statValue(k);
    d.appendChild(a); d.appendChild(b);
    box.appendChild(d);
  });
  UI.renderGear();
  var inv = $('itemList');
  inv.innerHTML = '';
  Object.keys(P.items).forEach(function (id) {
    if (!P.items[id] || !ITEMS[id]) return;
    var it = ITEMS[id];
    var d = document.createElement('div');
    d.className = 'invItem';
    d.style.borderColor = RARITY[it.rarity].color;
    d.title = it.name + '：' + Relic.cardText(id, 0);
    UI.fillTile(d, 'item', id, it.icon, it.color);
    if (P.items[id] > 1) { var n = document.createElement('span'); n.textContent = '×' + P.items[id]; d.appendChild(n); }
    inv.appendChild(d);
  });
  if (!inv.children.length) inv.textContent = '还没有宝物——打开宝箱试试';
};

// 暂停界面右栏最上面：武器和纹章（图标 + 等级，和 HUD 一样），在“宝物”标题前面
UI.renderGear = function () {
  var inv = $('itemList');
  if (!inv || !inv.parentNode) return;
  var box = $('invGear');
  if (!box) {
    box = document.createElement('div');
    box.id = 'invGear';
    var h = inv.previousElementSibling;
    inv.parentNode.insertBefore(box, h && h.tagName === 'H3' ? h : inv);
  }
  box.innerHTML = '';
  var t = document.createElement('h3');
  t.textContent = '武器 · 纹章';
  // 武器一组、纹章一组：一行放不下时纹章整组换到下一行
  var row = document.createElement('div');
  row.className = 'gearRow';
  var grp = function () { var g = document.createElement('div'); g.className = 'gearGrp'; return g; };
  var add = function (g, kind, id, glyph, color, lv, cls, title) {
    var d = document.createElement('div');
    d.className = 'invItem gear ' + cls;
    d.title = title;
    UI.fillTile(d, kind, id, glyph, color);
    var n = document.createElement('span');
    n.textContent = 'Lv' + lv;
    d.appendChild(n);
    g.appendChild(d);
  };
  var gw = grp(), gt = grp();
  P.weapons.forEach(function (w) { var k = UI.weaponIcon(w); add(gw, k.kind, k.id, w.def.icon, w.def.color, w.level, w.evo ? 'wpn evo' : 'wpn', w.def.name); });
  P.tomes.forEach(function (tm) { var td = TOMES[tm.id]; add(gt, 'tome', tm.id, td.icon, td.color, tm.level, 'tome', td.name); });
  if (gw.children.length) row.appendChild(gw);
  if (gt.children.length) row.appendChild(gt);
  box.appendChild(t);
  box.appendChild(row);
};

// 暂停界面的超武进度（evolution.js 画的每一行）：前面的汉字图块也换成武器图标（没有图标就保持原样）
(function () {
  if (typeof Evo === 'undefined' || typeof Evo.pauseRow !== 'function') return;
  var row = Evo.pauseRow;
  Evo.pauseRow = function (w) {
    var d = row.apply(this, arguments);
    var ic = d && d.querySelector ? d.querySelector('.evoPIc') : null;
    if (ic && w && w.def && !ic.querySelector('.pxicon')) {
      var k = UI.weaponIcon(w), el = UI.iconEl(k.kind, k.id);
      if (el) { ic.textContent = ''; ic.style.backgroundColor = ''; ic.classList.remove('kmGlyph'); ic.style.removeProperty('--gc'); ic.classList.add('hasIcon'); ic.appendChild(el); d.classList.add('icoRow'); }
    }
    return d;
  };
})();

UI.showEnd = function (won) {
  UI.openModal('endModal');
  $('endTitle').textContent = won ? '通关！' : '你被打倒了';
  $('endTitle').className = won ? 'win' : 'lose';
  var rows = [
    ['角色', P.char.name], ['游戏时间', fmtTime(Game.totalTime)], ['到达关卡', '第 ' + Game.stage + ' 关 · ' + Game.stageDef.name], ['等级', String(P.level)],
    ['击杀', fmtNum(P.kills)], ['总伤害', fmtNum(P.damageDealt)], ['打开的宝箱', String(Interact.chestsOpened)]
  ];
  // 在午夜钟声里倒下：接在「游戏时间」后面写撑了多久（Director.swarmT 到下一局开始才清零）
  if (!won && Director.swarm) rows.splice(2, 0, ['午夜钟声里撑了', fmtTime(Director.swarmT)]);
  var box = $('endStats');
  box.innerHTML = '';
  rows.forEach(function (r) {
    var d = document.createElement('div'); d.className = 'statRow';
    var a = document.createElement('span'); a.textContent = r[0];
    var b = document.createElement('span'); b.textContent = r[1];
    d.appendChild(a); d.appendChild(b); box.appendChild(d);
  });
  var wl = $('endWeapons');
  wl.innerHTML = '';
  var max = Math.max.apply(null, P.weapons.map(function (w) { return w.dmg; }).concat([1]));
  P.weapons.slice().sort(function (a, b) { return b.dmg - a.dmg; }).forEach(function (w) {
    var d = document.createElement('div'); d.className = 'statRow wbar';
    d.style.setProperty('--p', (w.dmg / max * 100) + '%');
    // 武器图标（超武用超武图标）+ 名字和等级
    var a = document.createElement('span'), k = UI.weaponIcon(w), ic = document.createElement('i');
    ic.className = 'wIc' + (w.evo ? ' evo' : '');
    UI.fillTile(ic, k.kind, k.id, w.def.icon, w.def.color);
    a.className = 'wName';
    a.appendChild(ic);
    a.appendChild(document.createTextNode(w.def.name + ' Lv' + w.level));
    // 窄窗口（320 宽）：名字一行不折（以前会折成「信 / 鸽 / Lv1」），右边的数字在「 · 」后面折成两行（第 13 块）
    a.style.whiteSpace = 'nowrap'; a.style.flex = 'none';
    var b = document.createElement('span');
    b.style.minWidth = '0'; b.style.textAlign = 'right'; b.style.whiteSpace = 'normal';
    Kit.phrase(b, fmtNum(w.dmg) + ' 伤害 · ' + fmtNum(w.kills) + ' 击杀');
    d.appendChild(a); d.appendChild(b); wl.appendChild(d);
  });
  UI.endItems();
};
// 结算界面：这一局拿到的宝物（和暂停界面一样的图块 + ×件数，稀有的在前），接在武器下面；没有宝物就不写这一段（第 13 块）
UI.endItems = function () {
  var wl = $('endWeapons');
  if (!wl || !wl.parentNode) return;
  var box = $('endItems');
  if (!box) {
    box = document.createElement('div');
    box.id = 'endItems';
    wl.parentNode.insertBefore(box, wl.nextSibling);
  }
  box.innerHTML = '';
  var ids = Object.keys(P.items || {}).filter(function (id) { return P.items[id] > 0 && ITEMS[id]; });
  if (!ids.length) return;
  ids.sort(function (x, y) { return ITEMS[y].rarity - ITEMS[x].rarity; });
  var n = ids.reduce(function (a, id) { return a + P.items[id]; }, 0);
  var h = document.createElement('h3');
  h.textContent = '宝物 · ' + n + ' 件';
  // 和武器那几行一样宽、居中（.statList：最宽 440 像素）；图块一行排不下就换行，每行居中
  var row = document.createElement('div'), g = document.createElement('div');
  row.className = 'statList'; g.className = 'gearGrp';
  g.style.justifyContent = 'center'; g.style.padding = '6px 6px 8px';
  ids.forEach(function (id) {
    var it = ITEMS[id], d = document.createElement('div');
    d.className = 'invItem';
    d.style.borderColor = RARITY[it.rarity].color;
    d.title = it.name;
    UI.fillTile(d, 'item', id, it.icon, it.color);
    if (P.items[id] > 1) { var c = document.createElement('span'); c.textContent = '×' + P.items[id]; d.appendChild(c); }
    g.appendChild(d);
  });
  row.appendChild(g);
  box.appendChild(h);
  box.appendChild(row);
};
