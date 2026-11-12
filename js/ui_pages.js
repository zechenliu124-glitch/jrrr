'use strict';
// ============================================================
//  第 12 块 b：主菜单的两个页面（只包装 UI.buildMenu / Meta.renderLayer / Meta.closeLayer，不改 ui.js、meta.js 里的函数）
//  · 骑士介绍的「被动」一行：UI.passiveLine(id)；这一行可以点（不变高），点开「骑士详情」页：被动全文、公式、初始武器、坐骑、属性
//  · 「这次更新改了什么」：从旧版本来的玩家（Meta.p.changes === 1）第一次进菜单时弹一次，怎么关都算看过（存进存档）
//  样式是下面的 Pages.CSS（注入一次），框和行用 kit.css 的 .mlPanel / .kmRow / .kmDone / .statRow / .kmTag
// ============================================================
var Pages = { changesShown: false, knightId: null, back: null };

// 「被动」后面的小箭头（9×9，金色，--ip 2 = 18 像素）：说明这一行能点开
Kit.ICONS.more = Kit.ICONS.more || ['.........', '..kk.....', '..kYk....', '...kYk...', '....kYk..', '...kYk...', '..kYk....', '..kk.....', '.........'];

// 骑士卡上的被动一行由 ui.js 的 UI.passiveLine 写（Passive.cardText 优先），这里只加样式、箭头和点开
Pages.passiveName = function (id) {
  var c = CHARACTERS[id] || {};
  return c.passiveName || String(c.passive || '').split('：')[0] || '被动';
};

// ---------------- 公式（数字是 tables.json knights[].passive.numbers 的一份拷贝；第 5 块有 Passive.K[id].num 时用它的） ----------------
Pages.NUM = {
  falconer: { dmgBase: 30, dmgPerLv: 5 },
  magician: { dmgBase: 14, dmgPerLv: 2 },
  beekeeper: { base: 3, perLevels: 6, max: 7, dmgBase: 6, dmgPerLv: 1 },
  engineer: { dmgBase: 14, dmgPerLv: 2 },
  courier: { goldBase: 20, goldPerLv: 3, xpFrac: 0.4 },
  bellringer: { atkSpeed: 0.4, perEnemy: 0.05, maxExtra: 0.3 },
  lampknight: { radius: 6, killsPer: 25, step: 0.5, max: 3 },
  fisher: { max: 10, perFish: 0.03 },
  painter: { dmgPerCrest: 0.04 }
};
Pages.num = function (id) {
  var k = typeof Passive !== 'undefined' && Passive.K && Passive.K[id], c = Pages.NUM[id], n = {}, x;
  if (!c) return null;
  // 第 5 块的数字优先；它没有的键用拷贝（改了键名也不会显示 undefined）
  for (x in c) n[x] = k && k.num && typeof k.num[x] === 'number' ? k.num[x] : c[x];
  return n;
};
Pages.pct = function (v) { return Math.round(v * 1000) / 10 + '%'; };
// 菜单上算 1 级、基础属性（伤害倍率 / 金币获取 = 基础值 + 骑士自己的加成）
Pages.base = function (id, stat) { var c = CHARACTERS[id]; return STATS[stat].base + ((c && c.stats && c.stats[stat]) || 0); };
Pages.dmgRow = function (label) {
  return { label: label, f: function (n) { return '(' + n.dmgBase + ' + ' + n.dmgPerLv + '×等级)×伤害倍率'; },
    v: function (n, id) { return '1 级时：' + Math.round((n.dmgBase + n.dmgPerLv) * Pages.base(id, 'damage')); } };
};
Pages.FORMULAS = {
  falconer: [Pages.dmgRow('猎隼一击')],
  magician: [Pages.dmgRow('每只兔子')],
  beekeeper: [Pages.dmgRow('每只护卫蜂'),
    { label: '护卫蜂数量', f: function (n) { return n.base + ' 只，每升 ' + n.perLevels + ' 级多 1 只，最多 ' + n.max + ' 只'; } }],
  engineer: [Pages.dmgRow('每支弩箭')],
  courier: [
    { label: '送到的金币', f: function (n) { return '(' + n.goldBase + ' + ' + n.goldPerLv + '×等级)×金币获取'; },
      v: function (n, id) { return '1 级时：' + Math.round((n.goldBase + n.goldPerLv) * Pages.base(id, 'goldGain')) + ' 金币'; } },
    { label: '送到的经验', f: function (n) { return '这一级所需经验的 ' + Pages.pct(n.xpFrac) + '，受经验获取加成'; } }],
  bellringer: [{ label: '钟声攻速', f: function (n) { return '+' + Pages.pct(n.atkSpeed) + '，身边每个敌人再 +' + Pages.pct(n.perEnemy) + '，最多再 +' + Pages.pct(n.maxExtra); } }],
  lampknight: [{ label: '灯光半径', f: function (n) { return n.radius + ' 米，每打倒 ' + n.killsPer + ' 个敌人 +' + n.step + ' 米，最多 +' + n.max + ' 米'; } }],
  fisher: [{ label: '每条鱼', f: function (n) { return '伤害 +' + Pages.pct(n.perFish) + '，最多 ' + n.max + ' 条'; } }],
  painter: [{ label: '每枚纹章', f: function (n) { return '伤害 +' + Pages.pct(n.dmgPerCrest); } }]
};
// [{ label, formula, now }]（没有公式的骑士是空数组）
Pages.formulas = function (id) {
  var n = Pages.num(id), list = Pages.FORMULAS[id] || [];
  if (!n) return [];
  return list.map(function (r) { return { label: r.label, formula: r.f(n), now: r.v ? r.v(n, id) : '' }; });
};

// ---------------- 更新说明的表（migration.json 的 ride：旧骑士 → 新骑士，旧坐骑 → 新坐骑；新坐骑的主人就是这一行的新骑士） ----------------
// 旧名字只给这一版用（D-10）：只有从旧版更新过来、带着 v1 存档的玩家才会看到这一页，这张表帮玩家找到原来的骑士。
// 给别的玩家的版本（商店、发给别人的链接、Steam）在那个版本的分支里去掉旧名字：这里每行只留 [旧 id, 新 id, 新坐骑名]，
// 页面只列「新骑士 · 坐骑」（新头像、新名字、新坐骑、已拥有），没有「旧名 →」，副标题改成「骑士和坐骑都换新了」，
// 下面的 allow 区缩到只剩旧 id（新装的玩家看不到这一页时整页去掉）；migration.json 去掉 ride.*.oldName / oldOwnerName
// （id 的对照留着，pages_c12 的「21 行 = migration.json」跟着改）；然后 banned-words.js --summary 在 README 那一句和只有 id 的区以外是 0
// banned-words: allow-begin 更新说明里的旧名字
Pages.CHANGES = [
  ['oofie', '铁罐爵士', 'squire', '风筝盾雪橇', '旧马鞍'],
  ['fox', '狐狸法骑士', 'bellringer', '幸运大金币', '大铜锣'],
  ['calcium', '骸骨骑士', 'gravekeeper', '棺材板', '棺材雪橇'],
  ['chad', '胸甲猛男', 'cook', '胸甲肚皮滑', '肚皮滑'],
  ['robin', '游侠骑士', 'courier', '巨箭', '加急巨箭'],
  ['monke', '猴子侍从', 'jester', '香蕉皮', '西瓜皮'],
  ['clank', '发条骑士', 'tinsoldier', '发条滚轮', '发条滚轮'],
  ['tony', '闪电骑士', 'astrologer', '雷光板', '星图卷轴'],
  ['birdo', '鹰骑士', 'falconer', '大羽毛', '大羽毛'],
  ['spaceman', '星界骑士', 'nun', '月牙', '月牙'],
  ['amog', '瘟疫医生', 'smith', '炼药研钵', '铁坩埚'],
  ['ogre', '食人魔骑士', 'bear', '拆下来的木门', '拆下来的木门'],
  ['athena', '盾卫女骑士', 'bannerman', '跪滑', '擎旗跪滑'],
  ['bandit', '强盗骑士', 'gardener', '赃物袋', '种子袋'],
  ['bush', '灌木骑士', 'painter', '大橡树叶', '大调色盘'],
  ['dicehead', '骰子骑士', 'magician', '大扑克牌', '大扑克牌'],
  ['vlad', '血骑士', 'beekeeper', '血浪', '蜂蜜浪'],
  ['roberto', '幽灵骑士', 'catknight', '宝箱', '宝箱'],
  ['noelle', '冰霜女骑士', 'fisher', '冰晶雪橇', '冰晶雪橇'],
  ['ninja', '影骑士', 'lampknight', '影遁', '影遁'],
  ['chadwell', '黑骑士', 'engineer', '御剑', '云梯']
];
// banned-words: allow-end

// ---------------- 样式 ----------------
Pages.CSS = [
  // 骑士介绍的「被动」一行：整行是按钮（高度不变）；上下各 10 像素的透明触控区（::before）凑够 44 像素；标签金色 + 小箭头
  '#charDesc .kdOpen { position: relative; cursor: pointer; -webkit-tap-highlight-color: transparent; touch-action: manipulation; }',
  '#charDesc .kdOpen::before { content: ""; position: absolute; left: -6px; right: -6px; top: -10px; bottom: -10px; }',
  // 标签和别的标签一样在内容的第一行（不在几行内容的中间）；箭头在字的中间
  '#charDesc .kdOpen .kmK { display: inline-flex; align-self: start; align-items: center; gap: 3px; color: var(--goldL); }',
  '#charDesc .kdOpen .kmK .kmIco { --ip: 2px; }',
  '#charDesc .kdOpen:active .kmV { transform: translateY(1px); }',
  '#charDesc .kdOpen:focus { outline: none; }',
  '#charDesc .kdOpen:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }',
  '@media (hover: hover) { #charDesc .kdOpen:hover .kmV { color: #fff; } }',
  // 骑士详情：和操作说明一样宽；最上面一个凹槽放头像、被动名、被动全文
  '.mlPanel.kdPanel { width: min(760px, 100%); }',
  // 头像在左，被动名和全文在右；窄的时候（≤ 600 像素）全文换到头像下面占满一行，不挤成一条窄列
  '.kdHero { display: grid; grid-template-columns: 58px minmax(0, 1fr); grid-template-areas: "pic name" "pic text"; align-items: start; gap: 0 12px; padding: 9px 12px 12px 9px; }',
  '.kdHero .charIcon, .kdHero .charIcon.hasIcon { grid-area: pic; width: 58px; height: 58px; font-size: var(--fs-l); }',
  '.kdPName { grid-area: name; font-size: var(--fs-l); line-height: 30px; color: #fff; }',
  '.kdPName b { font-weight: 400; color: var(--goldM); white-space: nowrap; }',
  '.kdPText { grid-area: text; margin-top: 3px; font-size: var(--fs-m); line-height: 27px; color: var(--text2); text-wrap: pretty; }',
  // 数值：一行一个公式（名字左、公式金色右），下面 12 号灰色的「1 级时：35」
  '.kdFormulas { display: flex; flex-direction: column; }',
  // 窄的时候公式换到名字下面一行（还是靠右）
  '.statRow.kdF { flex-wrap: wrap; align-items: baseline; gap: 0 18px; }',
  '.statRow.kdF > span:first-child { flex: none; }',
  '.statRow.kdF > .kdFx { flex: 1 1 auto; min-width: 0; color: var(--goldM); text-align: right; white-space: normal; text-wrap: balance; }',
  // 公式靠右，但每一段里面还是从左排（段末的空格在段里，靠右排会把字往右挤、前面空出一块）
  '.statRow.kdF > .kdFx .kmNb, .statRow.kdF > .kdFx .kmW { text-align: left; }',
  '.statRow.kdF > .kdNow { flex-basis: 100%; text-align: right; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  // 初始武器 / 坐骑：列表行（40 像素图块 + 18 号名字 + 12 号说明）
  '.kdRow { display: flex; align-items: flex-start; gap: 12px; padding: 6px 12px 6px 6px; }',
  '.kdRow .cardIcon, .kdRow .cardIcon.hasIcon { flex: none; width: 40px; height: 40px; margin: 0; font-size: var(--fs-m); }',
  '.kdRowTx { flex: 1; min-width: 0; }',
  '.kdRowN { font-size: var(--fs-m); line-height: 24px; color: #fff; }',
  '.kdRowD { font-size: var(--fs-s); line-height: 18px; color: #c9d3ea; text-wrap: pretty; }',
  '.kdRowD.tw { color: #9fe8ff; }',
  '.kdStats { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 2px 10px; }',
  // 这次更新改了什么：开头一句 18 号；21 行两列（≥ 760 像素宽的面板），一行 52 像素高
  '.chPanel .mlSub { display: block; text-wrap: balance; }',
  '.chIntro { margin: 0 0 9px; font-size: var(--fs-m); line-height: 27px; color: var(--text2); text-wrap: pretty; }',
  '.chList { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(380px, 100%), 1fr)); gap: 6px 9px; }',
  '.chRow { display: flex; align-items: center; gap: 9px; min-height: 52px; padding: 4px 12px 4px 4px; }',
  '.chRow .charIcon, .chRow .charIcon.hasIcon { flex: none; width: 40px; height: 40px; font-size: var(--fs-m); }',
  '.chTx { flex: 1; min-width: 0; }',
  '.chName { font-size: var(--fs-m); line-height: 24px; color: #fff; }',
  '.chName .chOld { color: var(--muted); }',
  '.chName .kmNb { display: inline-block; white-space: nowrap; }',
  '.chRide { font-size: var(--fs-s); line-height: 18px; color: #c9d3ea; }',
  '.chRow .kmTag { flex: none; }',
  // 稀有度：五个小卡片（3 像素稀有度边，史诗 / 传说再一圈硬边），下面是稀有度的字
  '.chRar { display: flex; flex-wrap: wrap; justify-content: center; gap: 12px 24px; padding: 15px 12px 12px; }',
  '.chSw { display: flex; flex-direction: column; align-items: center; gap: 9px; width: 54px; }',
  '.chSw i { display: block; width: 40px; height: 40px; box-sizing: border-box; border: 3px solid var(--rc); background: linear-gradient(180deg, var(--rg), rgba(0, 0, 0, 0) 22px), linear-gradient(180deg, #1c2744, #0e1528); box-shadow: 0 0 0 2px #000, inset 0 0 0 2px rgba(0, 0, 0, 0.55); }',
  '.chSw.r3 i, .chSw.r4 i { box-shadow: 0 0 0 2px #000, 0 0 0 5px var(--rc), 0 0 0 7px #000, inset 0 0 0 2px rgba(0, 0, 0, 0.55); }',
  '.chSw b { font-weight: 400; font-size: var(--fs-m); line-height: 24px; color: var(--rc); }',
  '.chRarNote { flex-basis: 100%; text-align: center; font-size: var(--fs-m); line-height: 24px; color: var(--text2); }',
  // 「你的进度、记录和魔晶都还在」放在最上面（老玩家先看到这一句）
  '.chKeep { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; padding: 9px 12px 9px 15px; font-size: var(--fs-m); line-height: 24px; color: var(--goldM); }',
  '.chKeep .kmIco { --ip: 2px; }',
  '@media (max-width: 600px) {',
  '  .kdHero { grid-template-areas: "pic name" "text text"; align-items: center; }',
  '  .kdHero .kdPText { margin-top: 9px; }',
  // 窄屏的更新说明：标题 24 号（36 号放不下一行，会剩一个「么」）；「已解锁」放到这一行的右上角，坐骑那一行就有整行宽
  '  .chPanel .mlHead h2 { font-size: var(--fs-l); line-height: 30px; }',
  // × 固定在右上角（不然标题和副标题折行以后它自己占一行）
  '  .chPanel .mlHead { position: relative; padding-right: 72px; }',
  '  .chPanel .mlClose { position: absolute; top: 12px; right: 12px; }',
  '  .chRow { position: relative; }',
  '  .chRow .kmTag { position: absolute; top: 9px; right: 9px; }',
  '  .chRow.own .chName { padding-right: 48px; }',
  '}',
  // 320 / 375 宽：「被动 · 猫有九条命」24 号放不下一行（名字会折成「猫有九 / 条命」），换 18 号
  '@media (max-width: 400px) { .kdPName { font-size: var(--fs-m); line-height: 24px; } }',
  // 卡片的金色标题同样：24 号在 320 宽放不下长称号（「第一次出远门的小侍从」会剩一个「从」），换 18 号
  '@media (max-width: 400px) { #charDesc .cdTitle { font-size: var(--fs-m); line-height: 24px; } }',
  '@media (prefers-reduced-motion: reduce) { #charDesc .kdOpen:active .kmV { transform: none; } }',
  'body.kmRM #charDesc .kdOpen:active .kmV { transform: none; }'
].join('\n');
Pages.injectCss = function () {
  if (document.getElementById('pagesCss')) return;
  var st = document.createElement('style');
  st.id = 'pagesCss';
  st.textContent = Pages.CSS;
  (document.head || document.documentElement).appendChild(st);
};

// ---------------- 骑士卡的被动一行 ----------------
Pages.decorateCard = function () {
  var row = document.querySelector('#charDesc .cdPassive'), id = UI.selected;
  if (!row || !CHARACTERS[id]) return;
  Pages.injectCss();
  // 金色标题「名字 · 称号」按短语排（Kit.phrase）：窄窗口在「 · 」后面、称号的「，」后面换行，不折在词中间（ui.js 用的是 textContent）
  var ti = document.querySelector('#charDesc .cdTitle'), tt = CHARACTERS[id].name + ' · ' + CHARACTERS[id].title;
  if (ti && !ti.querySelector('.kmNb')) Kit.phrase(ti, tt);
  var k = row.querySelector('.kmK');
  row.classList.add('kdOpen');
  row.setAttribute('role', 'button');
  row.setAttribute('tabindex', '0');
  row.setAttribute('aria-label', '被动全文');
  if (k && !k.querySelector('.kmIco')) { var ic = Kit.icon('more'); if (ic) k.appendChild(ic); }
};
Pages.openKnight = function (id, kb) {
  if (!CHARACTERS[id] || !Meta.openLayer) return;
  Pages.knightId = id;
  Pages.back = kb ? document.querySelector('#charDesc .kdOpen') : null;
  Meta.openLayer('knight');
  if (kb && Meta.layer) { var x = Meta.layer.querySelector('.mlClose'); if (x) x.focus(); }
};

// ---------------- 弹出页 ----------------
Pages.el = function (tag, cls, text) { return Kit.el(tag, cls, text); };
Pages.h3 = function (body, t) { body.appendChild(Pages.el('h3', '', t)); };
Pages.statRow = function (a, b) {
  var d = Pages.el('div', 'statRow');
  d.appendChild(Pages.el('span', '', a));
  d.appendChild(Pages.el('span', '', b));
  return d;
};
// 列表行：图块 + 名字 + 一两行小字
Pages.listRow = function (tile, name, lines) {
  var r = Pages.el('div', 'kdRow kmRow'), tx = Pages.el('div', 'kdRowTx');
  r.appendChild(tile);
  tx.appendChild(Pages.el('div', 'kdRowN', name));
  lines.forEach(function (l) { if (l && l[0]) tx.appendChild(Kit.phrase(Pages.el('div', 'kdRowD' + (l[1] ? ' ' + l[1] : '')), l[0])); });
  r.appendChild(tx);
  return r;
};

Pages.renderKnight = function (L, body) {
  var id = L.dataset.id || Pages.knightId || UI.selected, c = CHARACTERS[id];
  if (!c) return;
  L.dataset.id = id;
  var panel = L.querySelector('.mlPanel');
  panel.classList.add('kdPanel');
  panel.setAttribute('aria-label', c.name);
  L.querySelector('h2').textContent = c.name;
  L.querySelector('.mlSub').textContent = c.title || '';
  // 头像 + 「被动 · 鹰击」+ 全文
  var hero = Pages.el('div', 'kdHero kmWell'), pic = Pages.el('div', 'charIcon' + (Meta.isUnlocked('knight', id) ? '' : ' kmLockedPic'));
  Meta.tile(pic, 'char', id, c.icon, c.color);
  hero.appendChild(pic);
  var pn = Pages.el('div', 'kdPName');
  pn.appendChild(document.createTextNode('被动 · '));
  pn.appendChild(Pages.el('b', '', Pages.passiveName(id)));
  hero.appendChild(pn);
  hero.appendChild(Kit.phrase(Pages.el('div', 'kdPText'), c.passiveText || UI.passiveLine(id)));
  body.appendChild(hero);
  // 数值（公式只放在这里；卡上写当前值）
  var fs = Pages.formulas(id);
  if (fs.length) {
    Pages.h3(body, '数值');
    var box = Pages.el('div', 'kdFormulas');
    fs.forEach(function (f) {
      var r = Pages.el('div', 'statRow kdF');
      r.appendChild(Pages.el('span', '', f.label));
      r.appendChild(Kit.phrase(Pages.el('span', 'kdFx'), f.formula));
      if (f.now) r.appendChild(Pages.el('span', 'kdNow', f.now));
      box.appendChild(r);
    });
    body.appendChild(box);
  }
  // 初始武器
  var w = WEAPONS[c.weapon];
  if (w) {
    Pages.h3(body, '初始武器');
    var wt = Pages.el('div', 'cardIcon');
    Meta.tile(wt, 'weapon', c.weapon, w.icon, w.color);
    body.appendChild(Pages.listRow(wt, w.name, [[w.desc]]));
  }
  // 坐骑（没有图标：坐骑名最后一个字的符文砖，骑士的颜色）
  var rd = typeof RIDES !== 'undefined' && RIDES[id];
  if (rd && rd.name) {
    Pages.h3(body, '坐骑');
    var rt = Pages.el('div', 'cardIcon');
    Kit.glyphTile(rt, rd.name.charAt(rd.name.length - 1), c.color);
    var tw = rd.twist && typeof MoveUI !== 'undefined' && MoveUI.TWIST_TEXT ? MoveUI.TWIST_TEXT[rd.twist.kind] : '';
    body.appendChild(Pages.listRow(rt, rd.name, [[rd.desc], [tw, 'tw']]));
  }
  // 属性（和卡上同一句话，拆成名字 / 数值；摔落伤害也在这里）
  var rows = [];
  if (c.stats) Object.keys(c.stats).forEach(function (k) {
    if (!STATS[k]) return;
    var t = LevelUp.statText(k, c.stats[k]), nm = STATS[k].name;
    // 被动全文已经写了栏位（信使、画盾骑士）：属性里不再写一遍
    if ((k === 'weaponSlots' || k === 'tomeSlots') && (c.passiveText || '').indexOf(nm) >= 0) return;
    rows.push([nm, t.slice(-nm.length) === nm ? t.slice(0, -nm.length).trim() : t]);
  });
  if (c.fall != null && c.fall !== 1) rows.push(['摔落伤害', c.fall <= 0 ? '不会摔伤' : (c.fall < 1 ? '−' : '+') + Math.round(Math.abs(c.fall - 1) * 100) + '%']);
  if (rows.length) {
    Pages.h3(body, '属性');
    var g = Pages.el('div', 'kdStats');
    rows.forEach(function (r) { g.appendChild(Pages.statRow(r[0], r[1])); });
    body.appendChild(g);
  }
};

// 副标题：两个差不多长的短语，窄屏上在「，」后面折（不会剩一行「骑士、」）
Pages.CH_SUB = '骑士和坐骑都换了，稀有度也换了新颜色';
Pages.renderChanges = function (L, body, foot) {
  var panel = L.querySelector('.mlPanel');
  panel.classList.add('chPanel');
  panel.setAttribute('aria-label', '这次更新改了什么');
  L.querySelector('h2').textContent = '这次更新改了什么';
  Kit.phrase(L.querySelector('.mlSub'), Pages.CH_SUB);
  var keep = Pages.el('div', 'chKeep kmRow kmDone');
  keep.appendChild(Kit.icon('gem'));
  keep.appendChild(Kit.phrase(Pages.el('span'), '你的进度、记录和魔晶都还在'));
  body.appendChild(keep);
  Pages.h3(body, '骑士换了新面孔');
  body.appendChild(Kit.phrase(Pages.el('p', 'chIntro'), '旧骑士的进度都交给了新骑士，坐骑也跟着过去。'));
  var list = Pages.el('div', 'chList');
  Pages.CHANGES.forEach(function (r) {
    var nid = r[2], c = CHARACTERS[nid];
    if (!c) return;
    var own = Meta.owns('knight', nid), row = Pages.el('div', 'chRow kmRow' + (own ? ' own' : ''));
    row.dataset.id = nid;
    var pic = Pages.el('div', 'charIcon' + (own ? '' : ' kmLockedPic'));
    Meta.tile(pic, 'char', nid, c.icon, c.color);
    row.appendChild(pic);
    var tx = Pages.el('div', 'chTx'), nm = Pages.el('div', 'chName');
    nm.appendChild(Pages.el('span', 'kmNb chOld', r[1]));
    nm.appendChild(document.createTextNode(' '));
    nm.appendChild(Pages.el('span', 'kmNb chNew', '→ ' + c.name));
    tx.appendChild(nm);
    tx.appendChild(Kit.phrase(Pages.el('div', 'chRide'), '坐骑：' + r[3] + (r[3] === r[4] ? ' · 名字没变' : ' → ' + r[4])));
    row.appendChild(tx);
    if (own) row.appendChild(Kit.tag('已解锁'));
    list.appendChild(row);
  });
  body.appendChild(list);
  // 稀有度：只用边和字（UI_STYLE §2.4 R1）
  Pages.h3(body, '稀有度换了新颜色');
  var rar = Pages.el('div', 'chRar kmWell');
  RARITY.forEach(function (R, i) {
    var sw = Pages.el('div', 'chSw r' + i);
    sw.style.setProperty('--rc', R.color);
    sw.style.setProperty('--rg', R.glow);
    sw.appendChild(Pages.el('i'));
    sw.appendChild(Pages.el('b', '', R.name));
    rar.appendChild(sw);
  });
  rar.appendChild(Kit.phrase(Pages.el('div', 'chRarNote'), '史诗现在是紫色，传说是橙色'));
  body.appendChild(rar);
  foot.classList.remove('hidden');
  foot.appendChild(Pages.el('span', 'mlNote', '这一页只出现一次'));
  var ok = Kit.button({ label: '知道了', kind: 'main', cls: 'chOk' });
  ok.addEventListener('click', function () { Meta.closeLayer(); });
  foot.appendChild(ok);
};

// 第一次进菜单：从旧版本来的玩家弹一次（这次打开只弹一次）
Pages.maybeChanges = function () {
  if (Pages.changesShown || !Meta.uiReady || !Meta.p || Meta.p.changes !== 1) return;
  if (typeof Game !== 'undefined' && Game.state && Game.state !== 'menu') return;
  if (Meta.layer) return;
  Pages.changesShown = true;
  Meta.openLayer('changes');
};

// ---------------- 包装 ----------------
(function () {
  var bm = UI.buildMenu;
  UI.buildMenu = function () {
    var r = bm.apply(this, arguments);
    try { Pages.decorateCard(); } catch (e) { Meta.err(e); }
    try { Pages.maybeChanges(); } catch (e) { Meta.err(e); }
    return r;
  };
  var rl = Meta.renderLayer;
  Meta.renderLayer = function () {
    var L = Meta.layer, k = L && L.dataset.kind;
    if (k !== 'knight' && k !== 'changes') return rl.apply(this, arguments);
    Pages.injectCss();
    var body = L.querySelector('.mlBody'), foot = L.querySelector('.mlFoot'), scroll = body.scrollTop;
    body.innerHTML = '';
    foot.innerHTML = '';
    foot.classList.add('hidden');
    try { if (k === 'knight') Pages.renderKnight(L, body); else Pages.renderChanges(L, body, foot); } catch (e) { Meta.err(e); }
    body.scrollTop = scroll;
  };
  // 更新说明怎么关的都算看过（知道了、×、点外面、Esc、开了别的页）：清零并存档；骑士详情用键盘打开的，关掉后焦点回到那一行
  var cl = Meta.closeLayer;
  Meta.closeLayer = function () {
    var L = Meta.layer, k = L && L.dataset.kind;
    var r = cl.apply(this, arguments);
    if (k === 'changes' && Meta.p) { Meta.p.changes = 0; Meta.save(); Meta.pumpToast(); }
    if (k === 'knight' && Pages.back) {
      var b = Pages.back; Pages.back = null;
      if (b.isConnected) try { b.focus({ preventScroll: true }); } catch (e) { /* 忽略 */ }
    }
    return r;
  };
  // 更新说明开着（或者马上要弹出来）时，小签（「上一局没有结束就离开了：已结算 +10 魔晶」）先排着，不盖在说明上；关掉以后再弹
  var pt = Meta.pumpToast;
  Meta.pumpToast = function () {
    var L = Meta.layer;
    if (L && L.dataset.kind === 'changes') return;
    // 还没弹出来（菜单马上要建好）：最多等 6 秒
    if (!Pages.changesShown && Meta.p && Meta.p.changes === 1 && typeof Game !== 'undefined' && Game.state === 'menu') {
      var now = Date.now();
      if (!Pages.holdT) Pages.holdT = now + 6000;
      if (now < Pages.holdT) {
        if (!Pages.toastT) Pages.toastT = setTimeout(function () { Pages.toastT = 0; try { Pages.maybeChanges(); } catch (e) { Meta.err(e); } Meta.pumpToast(); }, 400);
        return;
      }
    }
    return pt.apply(this, arguments);
  };
  // 点「被动」一行 / 焦点在它上面按回车、空格：打开骑士详情（Meta.onMenuClick 也在 #menu 上，它不管这一行）
  var menu = document.getElementById('menu');
  if (menu) {
    menu.addEventListener('click', function (e) {
      var t = e.target && e.target.closest && e.target.closest('#charDesc .kdOpen');
      if (t) Pages.openKnight(UI.selected, false);
    });
    menu.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      var t = e.target && e.target.closest && e.target.closest('#charDesc .kdOpen');
      if (!t) return;
      e.preventDefault();
      Pages.openKnight(UI.selected, true);
    });
  }
})();
