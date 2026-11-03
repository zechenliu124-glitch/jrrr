'use strict';
// ============================================================
//  界面：HUD、小地图、升级/神龛/摩艾/微波炉三选一、宝箱、商人、暂停、结算、角色选择
// ============================================================
var $ = function (id) { return document.getElementById(id); };
var UI = { cache: {}, toasts: [] };
// 其他文件可以注册弹窗选项的处理：UI.modeHandlers[mode] = function (option, index) {}；返回 'keep' 时不关闭弹窗
UI.modeHandlers = {};

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
  $('sensSlider').addEventListener('input', function () { Input.sens = parseFloat(this.value); UI.saveSettings(); });
  $('btnUse').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); Interact.use(); }, { passive: false });
  $('btnPause').addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); Game.pause(true); }, { passive: false });
  UI.mm = $('minimap').getContext('2d');
  UI.watchTopCenter();
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
  if (window.ResizeObserver) new ResizeObserver(fit).observe(tc);
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
};

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

// ---------------- 物品图标（icons.js：用游戏里同一套低多边形模型拍成的像素小图） ----------------
// 图标第一次用到时用游戏的渲染器画一次（ICONS 会缓存成图片地址）；渲染器还没建好就不要它
UI.iconsOn = function () { return typeof ICONS !== 'undefined' && typeof Game !== 'undefined' && !!Game.renderer; };
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
  if (ic) { el.classList.remove('kmGlyph'); el.style.removeProperty('--gc'); el.style.backgroundColor = ''; el.appendChild(ic); }
  else if (typeof Kit !== 'undefined') Kit.glyphTile(el, glyph || '', color != null ? color : 0x888888);
  else { el.textContent = glyph || ''; el.style.backgroundColor = UI.hex(color != null ? color : 0x888888); }
  return !!ic;
};
// 武器栏、魔典栏用哪个图标：觉醒成超武的武器用超武图标
UI.weaponIcon = function (w) { return { kind: w.evo ? 'evo' : 'weapon', id: w.id }; };
// 选项卡片用哪个图标：o.iconKind / o.iconId（别的文件可以直接指定）> 物品卡的 itemId > 升级卡的 kind + id
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
UI.selected = 'fox';
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
  var p = UI.descRow('被动', c.passive, 'cdPassive');
  var parts = [];
  if (c.stats) Object.keys(c.stats).forEach(function (k) { parts.push(LevelUp.statText(k, c.stats[k])); });
  // 没有属性加成时这一行先藏着（movement_ui.js 可能往里加摔落伤害）
  var s = UI.descRow('属性', parts.join('，'), 'cdStats' + (parts.length ? '' : ' hidden'));
  box.appendChild(t); box.appendChild(w); box.appendChild(p); box.appendChild(s);
};
// 骑士介绍的一行：左边固定 4 个字宽的灰色标签（初始武器 / 被动 / 滑铲 / 坐骑特性 / 属性），右边内容（折行挂在内容下面，kit.css 的 .kmL）
UI.descRow = function (label, text, cls) {
  var d = document.createElement('div');
  d.className = 'kmL' + (cls ? ' ' + cls : '');
  var k = document.createElement('span'); k.className = 'kmK'; k.textContent = label;
  var v = document.createElement('span'); v.className = 'kmV'; v.textContent = text == null ? '' : text;
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
  var maxSh = st.shield > 0 ? st.shield : 0, tot = st.maxHp + maxSh;
  var hpPct = clamp(P.hp / tot, 0, 1) * 100;
  UI.setPct('hpFill', hpPct);
  UI.setPct('shieldFill', hpPct, 'left');
  UI.setPct('shieldFill', maxSh > 0 ? clamp(P.shield / tot, 0, 1) * 100 : 0);
  var hpT = Math.ceil(P.hp) + '/' + Math.round(st.maxHp) + (P.shield >= 1 ? ' +' + Math.round(P.shield) : '');
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
  UI.set('stageName', '第 ' + Game.stage + ' 关 · ' + Game.stageDef.name + (Director.swarm ? ' · 最终虫潮' : ''));
  UI.set('runTime', fmtTime(Game.totalTime));
  UI.set('goldText', fmtNum(P.gold));
  UI.set('killText', fmtNum(P.kills));
  var ptxt = Passive.hudText() + (P.rage > 0 ? '  狂暴 ' + Math.ceil(P.rage) + 's' : '');
  UI.set('passiveText', ptxt);
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
    UI.renderSlots('tomeSlots', P.tomes.map(function (t) { return { kind: 'tome', id: t.id, icon: TOMES[t.id].icon, color: TOMES[t.id].color, lv: t.level }; }), st.tomeSlots);
  }
  var ik = UI.iconsOn() ? '+' : '';
  for (var id in P.items) if (P.items[id] > 0) ik += id + P.items[id] + ',';
  if (UI.cache.items !== ik) { UI.cache.items = ik; UI.renderItems(); }
  UI.updateQuest();
  var now = Game.realTime;
  for (var i = UI.toasts.length - 1; i >= 0; i--) {
    if (now - UI.toasts[i].t > 2.8) { UI.toasts[i].el.remove(); UI.toasts.splice(i, 1); }
  }
  UI.drawMinimap();
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

// 下方的被动物品栏：只在物品变化时更新；已经有的物品格子留着（图标不重画、不闪），只改数量
UI.itemEls = {};   // 物品 id -> 物品栏里的格子
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
  // 排好的格子后面剩下的（没有了的物品、换下来的旧格子）都去掉
  while (prev ? prev.nextSibling : bar.firstChild) bar.removeChild(prev ? prev.nextSibling : bar.firstChild);
};

// ---------------- 任务框：找传送门 → 召唤 Boss → 击败 Boss → 进入传送门；虫潮时“活下去！” ----------------
UI.updateQuest = function () {
  var portal = Interact.portal, exit = Interact.exit, key = Director.swarm ? 'S' : '';
  if (exit && !exit.used) key += 'E';
  else if (Game.bossAlive) key += 'B' + Game.bossesLeft;
  else if (portal && portal.found && !portal.used) key += 'F';
  else key += 'P';
  for (var i = 0; i < Game.challenges.length; i++) {
    var list = Game.challenges[i].list, dead = 0;
    for (var j = 0; j < list.length; j++) if (!list[j].alive) dead++;
    key += '|' + dead + '/' + list.length;
  }
  if (UI.cache.quest === key) return;
  UI.cache.quest = key;
  var box = $('quest');
  box.innerHTML = '';
  var add = function (text, cls) {
    var r = document.createElement('div');
    r.className = 'questRow' + (cls ? ' ' + cls : '');
    var cb = document.createElement('span');
    cb.className = 'questBox';
    var t = document.createElement('span');
    t.textContent = text;
    r.appendChild(cb); r.appendChild(t);
    box.appendChild(r);
  };
  if (Director.swarm) add('活下去！', 'red');
  if (exit && !exit.used) add('进入传送门', 'go');
  else if (Game.bossAlive) add('击败 Boss' + (Game.bossesLeft > 1 ? ' ×' + Game.bossesLeft : ''), 'boss');
  else if (portal && portal.found && !portal.used) add('召唤 Boss', 'boss');
  else add('找到 Boss 传送门');
  for (i = 0; i < Game.challenges.length; i++) {
    var l = Game.challenges[i].list, d = 0;
    for (j = 0; j < l.length; j++) if (!l[j].alive) d++;
    add('击败挑战精英 ' + d + '/' + l.length, 'purple');
  }
};

// ---------------- 小地图（北朝上，半径 60 米；深蓝底 + 白色圆环） ----------------
// 图标形状：dot 圆点、square 方块、diamond 菱形、triangle 三角、star 星星、ring 圆环、cross 十字（不认识的画成圆点）
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
      case 'shrine': icon(o, o.golden ? '#ffe14a' : '#7ef0ff', 'dot', 3); break;
      case 'greed': icon(o, '#ffd23a', 'dot', 2.5); break;
      case 'curse': icon(o, '#ff2a2a', 'dot', 3); break;
      case 'merchant': icon(o, RARITY[o.rarity].color, 'diamond', 3.5); break;
      case 'microwave': icon(o, '#ffffff', 'square', 2.5); break;
      case 'moai': icon(o, '#9a9ca4', 'square', 2.5); break;
      case 'challenge': icon(o, '#c46bff', 'diamond', 3); break;
      case 'succ': icon(o, '#3fa9ff', 'dot', 3); break;
      case 'exitportal': icon(o, '#b05aff', 'diamond', 5); break;
      case 'bossportal': if (o.found) icon(o, '#ff2a4a', 'diamond', 5); break;
    }
  });
  c.restore();
  // 屏幕外的传送门：边缘箭头
  [Interact.portal && Interact.portal.found && !Interact.portal.used ? Interact.portal : null, Interact.exit && !Interact.exit.used ? Interact.exit : null].forEach(function (o) {
    if (!o) return;
    var p = toMap(o.x, o.z), dx = p.x - R, dy = p.y - R, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= RI - 3) return;
    var ax = R + dx / d * (RI - 8), ay = R + dy / d * (RI - 8), ang = Math.atan2(dy, dx);
    c.save(); c.translate(ax, ay); c.rotate(ang);
    c.fillStyle = o.kind === 'exitportal' ? '#b05aff' : '#ff2a4a';
    c.strokeStyle = '#000'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(6, 0); c.lineTo(-4, -5); c.lineTo(-4, 5); c.closePath(); c.fill(); c.stroke();
    c.restore();
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

// 提示文字：9 个字以内 24 号，长的 18 号（.kmLong）；返回这条提示的元素。颜色用用途色（Kit.toast 可以直接写 'gold' / 'red'……）
UI.toast = function (text, color) {
  var d = document.createElement('div');
  d.className = String(text).length > 9 ? 'toast kmLong' : 'toast';
  d.textContent = text;
  d.style.color = color || '#fff';
  $('toasts').appendChild(d);
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

UI.setPrompt = function (text, ok) {
  if (UI.cache.prompt === text + ok) return;
  UI.cache.prompt = text + ok;
  UI.show('prompt', !!text);
  UI.show('btnUse', !!text && Input.isTouch);
  if (text) {
    var el = $('prompt');
    el.innerHTML = '';
    // 键盘玩家显示 E 键帽
    if (!Input.isTouch) { var k = document.createElement('span'); k.className = 'key'; k.textContent = 'E'; el.appendChild(k); }
    el.appendChild(document.createTextNode(text));
    el.classList.toggle('bad', !ok);
  }
};

// ---------------- 弹窗 ----------------
var MODALS = ['levelModal', 'itemModal', 'shopModal', 'pauseModal', 'endModal'];
UI.openModal = function (id) {
  MODALS.forEach(function (m) { UI.show(m, m === id); });
  UI.show('modalBg', true);
  // 弹窗后面的 HUD 整体变暗；小地图也马上画一次（和指南针字母一致，不会只剩字母）
  if (Game.state !== 'menu' && UI.mm && P.pos) UI.drawMinimap(true);
  if (document.pointerLockElement) { Input.selfRelease = true; document.exitPointerLock(); }
};

UI.closeModal = function () {
  MODALS.forEach(function (m) { UI.show(m, false); });
  UI.show('modalBg', false);
  UI.banishMode = false;
  if (Game.state === 'modal' || Game.state === 'pause') Input.lock();
};

// 卡片：foot（参数或 o.foot）是右下角的文字，没有就写稀有度；能用数字键选的卡片（act 为 pick 的前三张）显示键位
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
  var lines = b.querySelector('.cardLines');
  (o.lines || []).forEach(function (l) { var d = document.createElement('div'); d.textContent = l; lines.appendChild(d); });
  var fe = b.querySelector('.cardRarity');
  fe.textContent = foot || r.name;
  // 价格（「160 金币」）用金币的金色，不用稀有度的颜色（史诗是红色，看起来像买不起）
  if (foot && /\d 金币/.test(foot)) fe.classList.add('cardPrice');
  if (i < 3 && act === 'pick') {
    var k = document.createElement('span'); k.className = 'cardKey'; k.textContent = String(i + 1);
    b.appendChild(k);
  }
  return b;
};

UI.itemCard = function (id, i, act, foot) {
  var it = ITEMS[id];
  return UI.card({ itemId: id, title: it.name, icon: it.icon, color: it.color, rarity: it.rarity, sub: P.items[id] ? '已拥有 ×' + P.items[id] : RARITY[it.rarity].name + '物品', lines: [it.desc] }, i, act, foot);
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
    // 放逐：这件武器/魔典本局不再出现
    LevelUp.banned[o.id] = true;
    LevelUp.banishes--;
    UI.banishMode = false;
    UI.toast('已放逐：' + o.title, '#ff6b6b');
    UI.showLevelUp(true);
    return;
  }
  if (UI.modeHandlers[UI.mode]) {
    if (UI.modeHandlers[UI.mode](o, i) === 'keep') return;
    UI.closeModal();
    Game.afterModal();
    return;
  }
  if (UI.mode === 'shrine') { P.addMod(o.stat, o.value); UI.toast('神龛祝福：' + o.lines[0], '#7ef0ff'); }
  else if (UI.mode === 'moai') { Items.give(o.itemId); UI.toast('获得 ' + ITEMS[o.itemId].name, RARITY[ITEMS[o.itemId].rarity].color); }
  else if (UI.mode === 'microwave') {
    var mw = UI.shopRef;
    P.gold -= Interact.microwaveCost(mw);
    Items.give(o.itemId);
    mw.uses--;
    UI.toast('叮！复制了 ' + ITEMS[o.itemId].name, '#ffffff');
    if (mw.uses <= 0) { Interact.consume(mw); FX.boom(mw.x, mw.y + 1, mw.z, 3, 0xff7a2a); UI.toast('微波炉爆炸了！', '#ff7a2a'); }
  } else LevelUp.apply(o);
  UI.closeModal();
  Game.afterModal();
};

UI.choiceModal = function (mode, title, options) {
  UI.options = options;
  UI.mode = mode;
  UI.openModal('levelModal');
  $('levelTitle').textContent = title;
  UI.show('levelBtns', false);
  UI.renderCards();
};

UI.shrineChoice = function (golden) {
  Game.openModal(function () { UI.choiceModal('shrine', golden ? '金色神龛 · 全是传说' : '神龛充能完毕 · 选择一项祝福', LevelUp.shrineOptions(golden)); });
};

UI.moai = function () {
  Game.openModal(function () {
    var ids = [], tries = 0;
    while (ids.length < 3 && tries++ < 30) { var id = Items.roll(); if (ids.indexOf(id) < 0) ids.push(id); }
    UI.choiceModal('moai', '摩艾像 · 选一件物品', ids.map(function (id) { return { itemId: id, rarity: ITEMS[id].rarity }; }));
  });
};

UI.microwave = function (o) {
  var owned = Object.keys(P.items).filter(function (id) { return P.items[id] > 0 && ITEMS[id] && ITEMS[id].rarity === o.rarity; });
  if (!owned.length) { UI.toast('你没有' + RARITY[o.rarity].name + '物品可以复制', '#ff6b6b'); return; }
  Game.openModal(function () {
    UI.shopRef = o;
    UI.choiceModal('microwave', '微波炉 · 复制一件物品（' + Interact.microwaveCost(o) + ' 金币，剩 ' + o.uses + ' 次）', owned.slice(0, 6).map(function (id) { return { itemId: id, rarity: ITEMS[id].rarity, foot: '复制' }; }));
  });
};

UI.chestReward = function (id) {
  Game.openModal(function () {
    UI.pendingItem = id;
    UI.openModal('itemModal');
    var box = $('itemCard');
    box.innerHTML = '';
    var it = ITEMS[id];
    $('itemTitle').textContent = RARITY[it.rarity].name + '物品！';
    $('itemTitle').style.color = RARITY[it.rarity].color;
    box.appendChild(UI.itemCard(id, 0, 'takeItem', '收下'));
  });
};

// 可疑商人：三件同稀有度物品，买一件就走
UI.merchant = function (o) {
  Game.openModal(function () {
    if (!o.stock) {
      var ids = [], tries = 0;
      while (ids.length < 3 && tries++ < 40) { var id = Items.rollOfRarity(o.rarity); if (ids.indexOf(id) < 0) ids.push(id); }
      o.stock = ids.map(function (id) { return { id: id, price: Math.round([25, 0, 70, 160, 380][o.rarity] * (1 + (Game.stage - 1) * 0.5)) }; });
    }
    UI.shopRef = o;
    UI.openModal('shopModal');
    UI.renderShop();
  });
};

UI.renderShop = function () {
  var box = $('shopCards');
  box.innerHTML = '';
  UI.shopRef.stock.forEach(function (s, i) {
    // 价格用金币的金色（不用稀有度的颜色：史诗是红色，看起来像买不起）；钱不够时后面写「还差 N」，卡片变暗
    var short = s.price - P.gold;
    var c = UI.itemCard(s.id, i, 'buy', s.price + ' 金币' + (short > 0 ? ' · 还差 ' + short : ''));
    c.disabled = short > 0;
    box.appendChild(c);
  });
  $('shopGold').textContent = '金币 ' + P.gold + ' · 只能买一件';
};

UI.buy = function (i) {
  var o = UI.shopRef, s = o.stock[i];
  if (P.gold < s.price) return;
  P.gold -= s.price;
  Items.give(s.id);
  UI.toast('获得 ' + ITEMS[s.id].name, RARITY[ITEMS[s.id].rarity].color);
  Interact.consume(o);
  UI.closeModal();
  Game.afterModal();
};

UI.STAT_ROWS = ['maxHp', 'regen', 'shield', 'armor', 'evasion', 'lifesteal', 'thorns', 'damage', 'critChance', 'critDmg', 'atkSpeed', 'quantity', 'size', 'duration', 'projSpeed', 'knockback', 'moveSpeed', 'jump', 'extraJumps', 'pickup', 'luck', 'xpGain', 'goldGain', 'difficulty', 'eliteDmg'];

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
    d.title = it.name + '：' + it.desc;
    UI.fillTile(d, 'item', id, it.icon, it.color);
    if (P.items[id] > 1) { var n = document.createElement('span'); n.textContent = '×' + P.items[id]; d.appendChild(n); }
    inv.appendChild(d);
  });
  if (!inv.children.length) inv.textContent = '还没有物品——打开宝箱试试';
};

// 暂停界面右栏最上面：武器和魔典（图标 + 等级，和 HUD 一样），在“物品”标题前面
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
  t.textContent = '武器 · 魔典';
  // 武器一组、魔典一组：一行放不下时魔典整组换到下一行
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
    var b = document.createElement('span'); b.textContent = fmtNum(w.dmg) + ' 伤害 · ' + fmtNum(w.kills) + ' 击杀';
    d.appendChild(a); d.appendChild(b); wl.appendChild(d);
  });
};
