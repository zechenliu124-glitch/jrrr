'use strict';
// ============================================================
//  离开 App 自动暂停 + 继续上一局（核心在 resume_boot.js；在 content_map.js 之后、main.js 之前加载，
//  load 时装的包装在最外层）
//  · 离开（切到别的 App、回主屏幕、锁屏、来电、控制中心、分屏失去焦点）：正在玩就暂停（和手动暂停一样，
//    只是不响暂停音效）；升级、宝箱、商店这些弹窗原样留着；离开期间主循环不更新也不画，过场不会自己放完；
//    Boss 出场、进传送门的过场被打断时，过场放完马上暂停
//  · 存档点：每关开始（Game.start / Game.nextStage 之后）写一份；主菜单「继续上一局 · 第 N 关」从那一关开头接着打
//  · 结算规则（一局只结算一次）见 docs/knight-magic/design/RESUME_NOTES.md
//  · 只包装别的文件的函数：Game.start/nextStage/buildStage/loop/afterModal/pause/toMenu、UI.buildMenu/action/saveSettings、Meta.wipe
// ============================================================
(function () {
  if (typeof Resume === 'undefined') return;
  var R = Resume;
  R.AUTO = true;            // 测试用：false = 不自动暂停、不冻结
  R.away = false;           // 离开了（页面隐藏或失去焦点）
  R.autoPaused = false;     // 这次暂停是自动的
  R.armed = false;          // 过场放完就暂停
  R.why = '';               // 最近一次离开的原因
  R.cont = 0;               // 这一局继续过几次
  R.started = 0;            // 这一局开始的时间
  R.seed = 0;               // 这一关的地图种子
  R.restoring = null;       // 正在从这份存档点继续
  R.prevMin = null;         // 继续的那一局用存档点的关卡时长；回主菜单换回玩家自己的
  var hid = false, blurred = false;
  var ctxSt = '';            // 上一次轮询看到的 AudioContext 状态

  // ============================================================
  //  离开 / 回来
  // ============================================================
  var sync = function () { R.away = hid || blurred; };
  var playing = function () { return typeof Game !== 'undefined' && Game.state === 'play'; };

  // 离开时还按着的触摸、按键不会再收到松开：全部清掉，回来不会自己跑
  R.clearInput = function () {
    if (typeof Input === 'undefined') return;
    Input.joy = null; if (Input.showJoy) Input.showJoy(false);
    Input.look = null; Input.keys = {};
    Input.jumpHeld = false; Input.jumpPressed = false;
    Input.mouseSlide = false; Input.mouseDrag = false; Input.touchSlide = false;
    if (Input.setTouchSlide) Input.setTouchSlide(false);
    Input.lookDX = Input.lookDY = 0;
    ['btnJump', 'btnSlide'].forEach(function (id) { var el = document.getElementById(id); if (el) el.classList.remove('down'); });
  };

  // 自动暂停：就是手动暂停（暂停弹窗、声音压低、音乐停），只是不响 'pause' 那一声
  // （页面要隐藏了，声音会排进马上挂起的 AudioContext，回来时才响）
  R.autoPause = function (why) {
    if (!playing()) return false;
    var S = typeof SFX !== 'undefined' ? SFX : null, play0 = S && S.play;
    if (play0) S.play = function (name) { if (name === 'pause') return null; return play0.apply(this, arguments); };
    try { Game.pause(true); } finally { if (play0) S.play = play0; }
    if (Game.state === 'pause') { R.autoPaused = true; R.why = why || R.why; return true; }
    return false;
  };

  R.leave = function (why) {
    sync();
    if (!R.AUTO || typeof Game === 'undefined') return;
    R.why = why;
    try {
      R.clearInput();
      var st = Game.state;
      if (st === 'play') R.autoPause(why);
      else if (st === 'modal' && typeof Feel !== 'undefined' && Feel.seq) R.armed = true;
    } catch (e) { R.err(e); }
  };
  // 回来：记下现在的声音状态。回来时还在通话（'interrupted'），点了继续以后下一次轮询不能再当成刚被打断
  R.back = function () {
    sync();
    try { var S = typeof SFX !== 'undefined' ? SFX : null; if (S && S.ctx) ctxSt = S.ctx.state; } catch (e) { R.err(e); }
  };

  // 隐藏：用 window 的捕获阶段，比 audio.js / meta.js 挂在 document 上的先跑（META 存档时已经是暂停状态）
  window.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') { hid = true; R.leave('hidden'); }
    else { hid = false; R.back(); }
  }, true);
  window.addEventListener('pagehide', function () { hid = true; R.leave('pagehide'); }, true);
  window.addEventListener('pageshow', function () { if (document.visibilityState !== 'hidden') { hid = false; R.back(); } }, true);
  // 失去焦点（页面还看得见：控制中心、分屏、Siri）：只认 window 自己的，元素失去焦点（滑块）不算
  window.addEventListener('blur', function (e) { if (e.target === window) { blurred = true; R.leave('blur'); } }, true);
  window.addEventListener('focus', function (e) { if (e.target === window) { blurred = false; R.back(); } }, true);
  // Chromium 的页面冻结（WebKit 没有）
  document.addEventListener('freeze', function () { hid = true; R.leave('freeze'); });
  document.addEventListener('resume', function () { hid = false; R.back(); });
  // 玩家碰了屏幕 / 按了键：肯定回来了（WebKit 回来时不一定发 focus；第一下点击不能被吞掉，也不能一直冻着）
  // keyup 也算：设置面板开着时 settings.js 在捕获阶段先拿走 Esc / P 的 keydown
  ['pointerdown', 'touchstart', 'keydown', 'keyup'].forEach(function (ev) {
    window.addEventListener(ev, function () { hid = false; blurred = false; R.armed = false; sync(); }, { capture: true, passive: true });
  });
  // 每秒查一次：来电、闹钟让声音被打断（AudioContext 'interrupted'）；漏掉了隐藏事件；隐藏标记还挂着但页面已经看得见了
  // 打断只在刚变成 'interrupted' 时暂停一次：通话期间一直是这个状态，点了继续就要能接着玩
  setInterval(function () {
    try {
      if (typeof Game === 'undefined') return;
      var vis = document.visibilityState;
      if (R.AUTO && vis === 'hidden' && Game.state === 'play') { hid = true; R.leave('poll'); }
      else if (hid && vis === 'visible') { hid = false; R.back(); }
      var S = typeof SFX !== 'undefined' ? SFX : null;
      var cs = S && S.ctx ? S.ctx.state : '';
      if (R.AUTO && cs === 'interrupted' && ctxSt !== 'interrupted') {
        if (Game.state === 'play') R.autoPause('interrupted');
        // 过场（Boss 出场、传送门）里被打断：和离开时一样，过场放完马上暂停（点一下屏幕就取消）
        else if (Game.state === 'modal' && typeof Feel !== 'undefined' && Feel.seq) { R.armed = true; R.why = 'interrupted'; }
      }
      // 打断在过场里就结束了（Siri 说完、闹钟关了）：人已经回来，不再暂停（离开时记下的不动：那时 why 是离开的原因）
      else if (R.armed && R.why === 'interrupted' && cs !== 'interrupted' && !R.away) R.armed = false;
      ctxSt = cs;
    } catch (e) { R.err(e); }
  }, 1000);

  // ============================================================
  //  存档点：读出、写进（字段见 RESUME_NOTES.md）
  // ============================================================
  var copy = function (o) { return JSON.parse(JSON.stringify(o)); };
  R.SKIP_PASSIVE = { ice: 1, iceT: 1, iceStamp: 1, frozenNear: 1 };

  R.capture = function () {
    var run = typeof Meta !== 'undefined' ? Meta.liveRun() : null, k;
    var items = {};
    for (k in P.items) if (P.items[k] > 0) items[k] = P.items[k];
    var passive = {};
    if (typeof Passive !== 'undefined') for (k in Passive) {
      if (Object.prototype.hasOwnProperty.call(Passive, k) && !R.SKIP_PASSIVE[k] && typeof Passive[k] === 'number' && isFinite(Passive[k])) passive[k] = Passive[k];
    }
    var banned = [];
    for (k in LevelUp.banned) if (LevelUp.banned[k]) banned.push(k);
    var C = typeof Content !== 'undefined' ? Content : null;
    return {
      v: R.VER, dv: R.fingerprint(), mv: META_DATA.VERSION, at: Date.now(), started: R.started || Date.now(), cont: R.cont | 0,
      char: Game.charId, stage: Game.stage, tier: Meta.activeTier, minutes: Pace.minutes, seed: R.seed >>> 0,
      game: { totalTime: Game.totalTime, levelQueue: Math.min(50, Game.levelQueue | 0), chestsOpened: Interact.chestsOpened | 0, firstElite: !!Enemies.firstElite },
      p: {
        level: P.level, xp: P.xp, xpNext: P.xpNext, gold: P.gold, kills: P.kills, damageDealt: P.damageDealt || 0, poison: P.poison || 0,
        hp: P.hp, yaw: P.yaw, pitch: P.pitch,
        mods: P.mods.map(function (m) { return [m.stat, m.value]; }),
        // 临时属性（开饭啦、星象、暴怒、蜂蜜罐……）：剩下几秒照存（一直在的存 -1，JSON 没有 Infinity）
        temp: P.temp.slice(0, R.MAX_TEMP).map(function (e) { return [e.stat, e.value, isFinite(e.t) ? e.t : -1, e.key == null ? null : String(e.key)]; }),
        items: items,
        tomes: P.tomes.map(function (t) { return { id: t.id, level: t.level, value: t.value || 0, value2: t.value2 || 0 }; }),
        weapons: P.weapons.map(function (w) {
          return { id: w.id, level: w.level, s: copy(w.s), kills: w.kills || 0, dmg: w.dmg || 0, charges: w.charges || 0, perkN: w.perkN || 0, evo: !!w.evo, evoHow: w.evo ? String(w.evoHow || '') : '' };
        })
      },
      passive: passive,
      lvl: { rerolls: LevelUp.rerolls, skips: LevelUp.skips, banishes: LevelUp.banishes, banned: banned },
      content: { secretsFound: C ? C.secretsFound | 0 : 0, hinted: C && C.hinted ? Object.keys(C.hinted) : [] },
      meta: run ? { c: copy(run.c), x: copy(run.x), wk: copy(run.wk || {}), newAch: (run.newAch || []).slice(), level: run.level, stage: run.stage, time: run.time } : null
    };
  };

  // 每关开始：先让 META 存一份没结算的这一局（有存档点就一定有 p.pending），再写存档点
  R.checkpoint = function () {
    try {
      if (typeof Meta === 'undefined' || !Meta.liveRun() || Game.state === 'end' || Game.state === 'menu') return false;
      Meta.snapshot();
      var cp = R.capture();
      // 没写进去（存满了 / 存储出错）：旧的那一关的存档点也不能留，不然下次会回到更早的一关
      if (!R.write(JSON.stringify(cp))) { R.drop(); return false; }
      return true;
    } catch (e) { R.err(e); R.drop(); return false; }
  };

  // 继续：Game.start 跑完（第 N 关已经按存档点的种子建好，P.reset 做完，Meta.run 是新的）以后，把这一局的状态放回去
  R.apply = function (cp) {
    var p = cp.p, k;
    // 起始武器拿掉，按存档点重新拿（超武直接换成超武的样子，不再乘一遍加成、不算一次觉醒、不庆祝）
    P.weapons.forEach(Weapons.detach);
    P.weapons = [];
    p.weapons.forEach(function (sw) {
      var w = Weapons.give(sw.id);
      w.level = sw.level; w.s = copy(sw.s); w.kills = sw.kills; w.dmg = sw.dmg; w.charges = sw.charges; w.perkN = sw.perkN;
      if (sw.evo && typeof Evo !== 'undefined') { w.def = Evo.makeDef(w); w.evo = true; w.evoHow = sw.evoHow || ''; Evo.dress(w); }
    });
    P.tomes = p.tomes.map(function (t) { return { id: t.id, level: t.level, value: t.value, value2: t.value2 }; });   // 套装（P.sets）由 P.recalc 算
    P.items = {};
    for (k in p.items) P.items[k] = p.items[k];
    // 强化、卡片、神龛、混沌……的加成都在存档点的 mods 里：P.reset 刚加的强化整个换掉
    P.mods = p.mods.map(function (m) { return { stat: m[0], value: m[1] }; });
    // 临时属性放回去（P.reset 刚清空）：剩下的秒数接着走；先放回再 recalc（护盾上限、最大生命都算进去）
    P.temp = p.temp.map(function (e) { return { stat: e[0], value: e[1], t: e[2] === -1 ? Infinity : e[2], key: e[3] }; });
    P.level = p.level; P.xp = p.xp;
    var need = P.xpFor(p.level);
    P.xpNext = p.xpNext === need ? p.xpNext : need;
    P.gold = p.gold; P.kills = p.kills; P.damageDealt = p.damageDealt; P.poison = p.poison;
    P.recalc();
    P.hp = Math.min(p.hp, P.st.maxHp); P.shield = P.st.shield;
    P.yaw = p.yaw; P.pitch = p.pitch; P.facing = p.yaw; P.camSnap = true;
    if (typeof Passive !== 'undefined') for (k in cp.passive) if (!R.SKIP_PASSIVE[k] && typeof Passive[k] === 'number') Passive[k] = cp.passive[k];
    LevelUp.rerolls = cp.lvl.rerolls; LevelUp.skips = cp.lvl.skips; LevelUp.banishes = cp.lvl.banishes;
    LevelUp.banned = {};
    cp.lvl.banned.forEach(function (id) { LevelUp.banned[id] = true; });
    Game.totalTime = cp.game.totalTime; Game.levelQueue = cp.game.levelQueue;
    Interact.chestsOpened = cp.game.chestsOpened; Enemies.firstElite = cp.game.firstElite;
    if (typeof Content !== 'undefined') {
      Content.secretsFound = cp.content.secretsFound;
      Content.hinted = {};
      cp.content.hinted.forEach(function (h) { Content.hinted[h] = true; });
    }
    // 这一局的统计退回到存档点（存档点之后打的那一段不算，要重新打）
    var run = Meta.liveRun(), mt = cp.meta;
    if (run && mt) {
      var c = Meta.nums(mt.c, Meta.SUMSET), x = Meta.nums(mt.x, Meta.MAXSET);
      for (k in c) run.c[k] = c[k];
      for (k in x) run.x[k] = x[k];
      run.wk = Meta.nums(mt.wk);
      run.newAch = mt.newAch.filter(function (id) { return !!Meta.achById(id); });
      run.level = mt.level; run.stage = mt.stage; run.time = mt.time;
      if (run.tk) { run.tk.stage = cp.stage; run.tk.hp = -1; }
    }
    if (UI.cache) UI.cache = {};
    R.cont = cp.cont + 1;
    R.started = cp.started;
  };

  // 种子随机数（mulberry32）：建关卡时代替 Math.random
  R.rng = function (seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  // 只管外观、而且有缓存的函数（模型、敌人几何体、天空贴图）：第一次建才用随机数（颜色抖动、three.js 的 uuid），
  // 建过一次以后就不用了。它们用原来的 Math.random，不占种子随机数：缓存里有没有，地图都一样
  R.noise = 0;
  R.quiet = function (obj, name) {
    if (!obj || typeof obj[name] !== 'function') return;
    var f = obj[name];
    obj[name] = function () { R.noise++; try { return f.apply(this, arguments); } finally { R.noise--; } };
  };
  if (typeof MODEL !== 'undefined') ['build', 'merge', 'instanced', 'get', 'mesh'].forEach(function (n) { R.quiet(MODEL, n); });
  if (typeof Enemies !== 'undefined') R.quiet(Enemies, 'buildGeo');
  if (typeof TEX !== 'undefined') ['applySky', 'canvasTex'].forEach(function (n) { R.quiet(TEX, n); });
  if (typeof CHAR_MODELS !== 'undefined') R.quiet(CHAR_MODELS, 'build');
  if (typeof Interact !== 'undefined') ['models', 'initGlow', 'swirlTexture'].forEach(function (n) { R.quiet(Interact, n); });
  if (typeof FX !== 'undefined') ['getGeo', 'cellsGeo'].forEach(function (n) { R.quiet(FX, n); });
  if (typeof MX !== 'undefined') ['mat', 'beamGeo'].forEach(function (n) { R.quiet(MX, n); });
  if (typeof Evo !== 'undefined') ['beamGeo', 'fadeTex'].forEach(function (n) { R.quiet(Evo, n); });
  // 行会互动点的模型（第 10 块）：模型细节再改，关卡布局也不跟着变
  if (typeof Guild !== 'undefined' && Guild.MODELS) Object.keys(Guild.MODELS).forEach(function (n) { R.quiet(Guild.MODELS, n); });

  // ============================================================
  //  继续 / 放弃
  // ============================================================
  R.continueRun = function () {
    var h = R.held;
    if (!h || typeof Game === 'undefined' || Game.state !== 'menu') return false;
    var cp = h.cp, ok = false;
    R.held = null;
    if (R.prevMin == null) R.prevMin = Pace.minutes;
    Pace.setMinutes(cp.minutes);
    R.restoring = cp;
    var sel0 = Meta.selectedTier;
    Meta.selectedTier = function () { return cp.tier; };
    try { Game.start(cp.char); ok = true; } catch (e) { R.err(e); } finally { Meta.selectedTier = sel0; R.restoring = null; }
    if (!ok) {
      // 开不了局、放不回去（不应该发生）：刚开的这一局作废，不结算（它的统计已经退回到存档点，再结算一次就把
      // 前面几关又算了一遍）；留着的那一局按退出结算一次，回到主菜单，提示一句
      var res = null;
      try { if (Meta.liveRun()) Meta.run = null; } catch (e) { R.err(e); }
      try { if (Meta.p.pending) res = Meta.finish(Meta.p.pending, 'quit'); } catch (e) { R.err(e); }
      R.clear();
      try { if (Game.state !== 'menu') Game.toMenu(); else UI.buildMenu(); } catch (e) { R.err(e); }
      if (R.prevMin != null) { var m0 = R.prevMin; R.prevMin = null; try { Pace.setMinutes(m0); } catch (e) { R.err(e); } }
      try {
        var mc = res && res.pay && res.pay.total > 0 ? '：+' + Meta.fmt(res.pay.total) + ' 魔晶' : '';
        Meta.note('上一局没能接着打，已按退出结算' + mc);
      } catch (e) { R.err(e); }
      return false;
    }
    try {
      if (typeof Input !== 'undefined' && Input.lock) Input.lock();
      if (typeof SFX !== 'undefined' && SFX.live) SFX.play('start');
      if (typeof Kit !== 'undefined') Kit.toast('回到第 ' + cp.stage + ' 关开始时', 'cya');
    } catch (e) { R.err(e); }
    return true;
  };

  // 放弃：留着的那一局按退出结算（和原来启动时结算的一样多）；quiet = 马上要开新的一局，不用重建菜单
  R.abandon = function (quiet) {
    var res = null;
    R.held = null;
    try { if (Meta.p.pending) res = Meta.finish(Meta.p.pending, 'quit'); } catch (e) { R.err(e); }
    R.clear();
    try {
      if (res && res.pay && res.pay.total > 0) Meta.note('上一局结算：+' + Meta.fmt(res.pay.total) + ' 魔晶');
      if (!quiet) UI.buildMenu();
    } catch (e) { R.err(e); }
    return res;
  };

  R.askAbandon = function () {
    if (!R.held) return;
    Meta.confirm({
      title: '放弃上一局', html: '第 ' + R.held.cp.stage + ' 关的进度不能再继续了。<br>魔晶按退出结算。', ok: '放弃', okClass: 'danger',
      onOk: function () { R.abandon(false); }
    });
  };

  // ============================================================
  //  主菜单：「继续上一局 · 第 N 关」+「放弃」，放在「开始游戏」上面
  // ============================================================
  R.CSS = [
    '#resumeRow { display: flex; gap: 6px; align-items: stretch; }',
    '#resumeRow .rsGo { flex: 1 1 auto; min-width: 0; min-height: 54px; padding: 6px 12px; display: flex; flex-direction: column; align-items: center; justify-content: center; }',
    '#resumeRow .rsT { display: block; font-size: var(--fs-m); line-height: 24px; }',
    '#resumeRow .rsS { display: block; font-size: var(--fs-s); line-height: 18px; color: var(--muted); text-shadow: var(--ol1); }',
    '#resumeRow .rsNo { flex: 0 0 auto; min-height: 44px; }',
    '@media (max-height: 700px) and (orientation: landscape) { #resumeRow .rsS { display: none; } #resumeRow .rsGo { min-height: 48px; } }'
  ].join('\n');
  R.injectCss = function () {
    if (document.getElementById('resumeCss')) return;
    var st = document.createElement('style');
    st.id = 'resumeCss';
    st.textContent = R.CSS;
    (document.head || document.documentElement).appendChild(st);
  };
  var even = function (el, t, fs) { try { if (typeof UI !== 'undefined' && UI.evenFp) UI.evenFp(el, t, fs); } catch (e) { /* 忽略 */ } };

  R.renderRow = function () {
    var inner = document.querySelector('#menu .menuInner'), start = inner && inner.querySelector('[data-act="start"]');
    var row = document.getElementById('resumeRow');
    if (!R.held || !start) { if (row) row.remove(); return; }
    R.injectCss();
    if (!row) {
      row = document.createElement('div');
      row.id = 'resumeRow';
      row.innerHTML = '<button type="button" class="sbtn rsGo" data-rs="go"><span class="rsT"></span><span class="rsS"></span></button>' +
        '<button type="button" class="sbtn kmSmall rsNo" data-rs="no">放弃</button>';
      row.addEventListener('click', function (e) {
        var b = e.target && e.target.closest ? e.target.closest('[data-rs]') : null;
        if (!b) return;
        if (b.dataset.rs === 'go') R.continueRun(); else R.askAbandon();
      });
    }
    if (row.parentNode !== start.parentNode || row.nextElementSibling !== start) start.parentNode.insertBefore(row, start);
    var cp = R.held.cp, ch = CHARACTERS[cp.char];
    var t = '继续上一局 · 第 ' + cp.stage + ' 关';
    var s = (ch ? ch.name : '') + ' · Lv ' + cp.p.level + (cp.tier > 1 ? ' · 难度 ' + Meta.roman(cp.tier) : '');
    var te = row.querySelector('.rsT'), se = row.querySelector('.rsS');
    if (te.textContent !== t) { te.textContent = t; even(te, t, 18); }
    if (se.textContent !== s) { se.textContent = s; even(se, s, 12); }
    row.querySelector('.rsGo').setAttribute('aria-label', t + ' · ' + s);
  };

  // ============================================================
  //  包装（马上能包的：UI、Meta）
  // ============================================================
  var bm0 = UI.buildMenu;
  UI.buildMenu = function () {
    var r = bm0.apply(this, arguments);
    try { R.renderRow(); } catch (e) { R.err(e); }
    return r;
  };
  // 留着上一局时点「开始游戏」：先确认（选中的骑士还锁着时先走 META 的购买）
  var act0 = UI.action;
  UI.action = function (a) {
    if (a === 'start' && R.held) {
      var open = true;
      try { open = Meta.isUnlocked('knight', UI.selected); } catch (e) { open = true; }
      if (open) {
        var n = R.held.cp.stage;
        Meta.confirm({
          title: '开始新的一局', html: '第 ' + n + ' 关的上一局会按退出结算，<br>不能再继续。', ok: '开始新的一局', okClass: 'main',
          onOk: function () { act0.call(UI, 'start'); }
        });
        return;
      }
    }
    return act0.apply(this, arguments);
  };
  // 继续的那一局用的是存档点的关卡时长：这期间存设置时存玩家自己选的
  var ss0 = UI.saveSettings;
  UI.saveSettings = function () {
    if (R.prevMin == null || typeof Pace === 'undefined' || Pace.minutes === R.prevMin) return ss0.apply(this, arguments);
    var m = Pace.minutes;
    Pace.minutes = R.prevMin;
    try { return ss0.apply(this, arguments); } finally { Pace.minutes = m; }
  };
  // 清除存档：存档点一起清掉（清除存档不发结算事件）
  if (typeof Meta !== 'undefined' && typeof Meta.wipe === 'function') {
    var wipe0 = Meta.wipe;
    Meta.wipe = function () {
      R.clear();
      try { return wipe0.apply(this, arguments); } finally { R.clear(); try { R.renderRow(); } catch (e) { /* 忽略 */ } }
    };
  }

  // ============================================================
  //  包装 Game.*（main.js 最后加载：load 时包，这个监听在 FEEL / META / 声音 / 内容之后注册，所以在最外层）
  // ============================================================
  R.install = function () {
    if (R.installed || typeof Game === 'undefined' || typeof Game.start !== 'function') return;
    R.installed = true;
    var start0 = Game.start, next0 = Game.nextStage, build0 = Game.buildStage, loop0 = Game.loop;
    var after0 = Game.afterModal, pause0 = Game.pause, menu0 = Game.toMenu;

    Game.start = function () {
      var cp = R.restoring;
      // 直接开新局（测试、别的入口）时还留着上一局：先按退出结算
      if (!cp && R.held) R.abandon(true);
      R.armed = false; R.autoPaused = false;
      var r = start0.apply(this, arguments);
      // 继续：放不回去（不应该发生）就往外抛，不写存档点；R.continueRun 结算一次、回主菜单
      if (cp) R.apply(cp);
      else { R.cont = 0; R.started = Date.now(); }
      R.checkpoint();
      return r;
    };

    Game.nextStage = function () {
      var s0 = Game.stage;
      var r = next0.apply(this, arguments);
      if (Game.stage > s0 && Game.state !== 'end') R.checkpoint();
      return r;
    };

    // 建关卡（不是菜单的）：用种子随机数，继续时用存档点的种子 → 同一张地图、同样的宝箱、神龛、秘密和事件
    Game.buildStage = function (menuOnly) {
      if (menuOnly) return build0.apply(this, arguments);
      var cp = R.restoring;
      if (cp) Game.stage = cp.stage;
      var seed = cp ? cp.seed >>> 0 : (Math.random() * 4294967296) >>> 0;
      R.seed = seed;
      var rnd = Math.random, sr = R.rng(seed);
      Math.random = function () { return R.noise > 0 ? rnd() : sr(); };
      try { return build0.apply(this, arguments); } finally { Math.random = rnd; }
    };

    // 离开期间（菜单除外）：不更新也不画，画面停在离开的那一帧
    Game.loop = function (now) {
      if (R.AUTO && R.away && Game.state !== 'menu') { Game.last = now; requestAnimationFrame(Game.loop); return; }
      return loop0.apply(this, arguments);
    };

    // 过场（Boss 出场、传送门）在离开时被打断：交还控制的那一下马上暂停
    Game.afterModal = function () {
      var r = after0.apply(this, arguments);
      if (R.armed && Game.state === 'play') { R.armed = false; try { R.autoPause('armed'); } catch (e) { R.err(e); } }
      return r;
    };

    Game.pause = function (on) {
      var r = pause0.apply(this, arguments);
      if (Game.state !== 'pause') R.autoPaused = false;
      else if (on) R.autoPaused = false;   // 手动暂停；自动暂停在 R.autoPause 里再标上
      return r;
    };

    Game.toMenu = function () {
      R.armed = false; R.autoPaused = false;
      var r = menu0.apply(this, arguments);
      if (R.prevMin != null) {
        var m = R.prevMin;
        R.prevMin = null;
        try { Pace.setMinutes(m); } catch (e) { R.err(e); }
      }
      return r;
    };
  };
  if (document.readyState === 'complete') R.install();
  else window.addEventListener('load', R.install);

  R.ready = true;
})();
