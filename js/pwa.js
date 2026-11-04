'use strict';
// ============================================================
//  装到主屏幕 / 桌面的 App（PWA）
//  - 注册离线缓存 sw.js：只在 https（或本机 localhost）打开的网页上注册；
//    file:// 直接打开、claude.ai 的 Artifact 页面、被嵌在别的网页里（iframe）时什么都不做
//  - 游戏正常启动后告诉 sw.js（booted）：它在后台把最新的一整套存进缓存，回复这次跑的版本和最新版本
//    · 这次是从网络打开的新版本 → 提示“已更新到新版本”
//    · 这次是从缓存打开的旧版本（没网或网太慢），服务器上已经有新版 →
//      在主菜单、还没碰过屏幕就直接重新打开；否则回到主菜单时显示“点这里更新”
//  - App 在后台放了很久又切回来：检查一次有没有新版本（同上）
//  - 从主屏幕 / 桌面图标打开时，<html> 上加 standalone 类
// ============================================================
var PWA = (function () {
  var P = { on: false, standalone: false, reg: null, version: '', latest: '' };
  try {
    P.standalone = window.navigator.standalone === true ||
      !!(window.matchMedia && window.matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches);
    if (P.standalone) document.documentElement.classList.add('standalone');
  } catch (e) { /* 忽略 */ }

  var state = function () { return window.Game ? window.Game.state : ''; };
  // 位置：主菜单时放在标题下面那行小字的下方（那里是空的 3D 画面，不挡菜单）；其他时候放正上方
  var place = function (el) {
    var tag = state() === 'menu' && document.querySelector('#menu .tag'), r = tag ? tag.getBoundingClientRect() : null;
    if (r && r.width) { el.style.left = Math.round(r.left) + 'px'; el.style.top = Math.round(r.bottom + 14) + 'px'; el.style.transform = 'none'; }
    else { el.style.left = '50%'; el.style.top = 'calc(env(safe-area-inset-top, 0px) + 12px)'; el.style.transform = 'translateX(-50%)'; }
  };
  var pill = function (id, text, tap) {
    var old = document.getElementById(id);
    if (old) old.parentNode.removeChild(old);
    var el = document.createElement(tap ? 'button' : 'div');
    el.id = id;
    el.textContent = text;
    el.style.cssText = 'position:fixed;z-index:60;margin:0;max-width:calc(100vw - 24px);padding:7px 14px 8px;' +
      'background:rgba(8,13,28,0.94);border:3px solid #000;border-radius:0;box-shadow:inset 0 0 0 2px #2f3f66,0 4px 0 rgba(0,0,0,0.45);color:#ffd84a;' +
      'font:800 16px/1.3 "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans SC",sans-serif;' +
      'text-shadow:1px 0 0 #000,-1px 0 0 #000,0 1px 0 #000,0 -1px 0 #000,0 2px 0 #000;' +
      'pointer-events:' + (tap ? 'auto;cursor:pointer;touch-action:manipulation' : 'none') + ';opacity:0;transition:opacity 0.3s';
    if (tap) el.addEventListener('click', tap);
    else el.setAttribute('role', 'status');
    place(el);
    document.body.appendChild(el);
    setTimeout(function () { el.style.opacity = '1'; }, 30);
    return el;
  };
  var drop = function (el) {
    if (!el || !el.parentNode) return;
    el.style.opacity = '0';
    setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 400);
  };
  // 小提示：局中用游戏自己的提示条，其他时候自己画一个（不依赖游戏界面的代码）
  P.toast = function (text, ms) {
    if (!document.body) { document.addEventListener('DOMContentLoaded', function () { P.toast(text, ms); }); return; }
    var G = window.Game, U = window.UI;
    if (G && G.state === 'play' && U && typeof U.toast === 'function') { try { U.toast(text, window.Kit ? Kit.color('cya') : '#6fd0ff'); return; } catch (e) { /* 用自己的 */ } }
    var el = pill('pwaToast', text);
    setTimeout(function () { drop(el); }, ms || 3500);
  };

  var loc = window.location, framed = true;
  try { framed = window.self !== window.top; } catch (e) { /* 跨域 iframe 里拿不到 top */ }
  var local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(loc.hostname);
  var claude = /(^|\.)(claude\.ai|claude\.com|claudeusercontent\.com|anthropic\.com)$/i.test(loc.hostname);
  if (!(loc.protocol === 'https:' || (loc.protocol === 'http:' && local)) || framed || claude) return P;
  var sw;
  try { sw = navigator.serviceWorker; } catch (e) { return P; }
  if (!sw) return P;
  P.on = true;

  // 给 sw.js 发消息，等它回复（超时或没有 sw 时得到 null）
  P.ask = function (msg, ms) {
    return new Promise(function (resolve) {
      var c = sw.controller;
      if (!c || typeof MessageChannel === 'undefined') { resolve(null); return; }
      var ch = new MessageChannel(), t = setTimeout(function () { resolve(null); }, ms || 15000);
      ch.port1.onmessage = function (e) { clearTimeout(t); resolve(e.data || null); };
      try { c.postMessage(msg, [ch.port2]); } catch (e) { clearTimeout(t); resolve(null); }
    });
  };

  // 启动阶段有没有报错（有就不算正常启动，不去动缓存）
  var errors = 0, booted = false;
  window.addEventListener('error', function () { if (!booted) errors++; });
  var bootOk = function () {
    var G = window.Game, el = document.getElementById('bootError');
    return !!(G && G.renderer) && !(el && !el.classList.contains('hidden')) && errors === 0;
  };
  // 最后一次碰屏幕 / 按键的时间：碰过就不自动重新打开，免得打断操作
  var lastInput = 0;
  ['pointerdown', 'touchstart', 'keydown'].forEach(function (t) {
    window.addEventListener(t, function () { lastInput = Date.now(); }, { capture: true, passive: true });
  });
  var store = function (k, v) {
    try { if (v === undefined) return sessionStorage.getItem(k); sessionStorage.setItem(k, v); } catch (e) { /* 忽略 */ }
    return null;
  };

  // 服务器上有比正在跑的更新的版本（已经整套存进缓存了）
  var notice = null, waiting = 0;
  var newVersion = function (since) {
    var st = state();
    // 在主菜单、页面在前台、从 since 起没碰过屏幕：直接重新打开（5 分钟内最多一次，不会来回刷新）
    if (st === 'menu' && !document.hidden && lastInput < since && Date.now() - (+store('km-pwa-auto') || 0) > 300000) {
      store('km-pwa-auto', String(Date.now()));
      loc.reload();
      return;
    }
    // 否则在主菜单 / 结算界面显示“点这里更新”（局中不打断）
    if (waiting) return;
    var tick = function () {
      var show = (state() === 'menu' || state() === 'end') && !document.hidden;
      if (show && !notice) notice = pill('pwaUpdate', '有新版本 · 点这里更新', function () { loc.reload(); });
      else if (!show && notice) { drop(notice); notice = null; }
      else if (notice) place(notice);
    };
    tick();
    waiting = setInterval(tick, 1000);
  };

  // 第一次装好离线缓存（之前没有 sw 管这个页面）
  var hadController = !!sw.controller;
  sw.addEventListener('controllerchange', function () {
    if (hadController) return;
    hadController = true;
    P.toast('已存到本机，没网也能玩');
    P.ask({ type: 'status' }).then(function (r) { if (r && r.hash && !P.version) P.version = r.hash; });
  });

  window.addEventListener('load', function () {
    var since = Date.now();
    sw.register('sw.js', { scope: './', updateViaCache: 'none' }).then(function (reg) { P.reg = reg; }).catch(function () { /* 不支持就算了 */ });
    // 等游戏跑起来一会儿（再多画几帧），确认能正常启动，再让 sw.js 去更新缓存
    var frames = function (n, fn) { if (n > 0) requestAnimationFrame(function () { frames(n - 1, fn); }); else fn(); };
    setTimeout(function () { frames(3, function () {
      if (!bootOk()) {
        // 没能正常启动：这次如果有文件因为网络出错用了缓存里的旧版，新旧混在一起可能就是原因 → 重新打开一次
        if (sw.controller && !store('km-pwa-mixfix')) P.ask({ type: 'status' }).then(function (r) {
          if (r && r.stale) { store('km-pwa-mixfix', '1'); loc.reload(); }
        });
        return;
      }
      booted = true;
      if (!sw.controller) return;      // 第一次打开：sw 还在安装（装好后 controllerchange 里拿版本号）
      P.ask({ type: 'booted' }, 120000).then(function (r) {
        if (!r) return;
        if (r.version) P.version = r.version;
        if (r.latest) P.latest = r.latest;
        if (r.updated) P.toast('已更新到新版本');
        else if (r.ok && r.latest && r.version && r.latest !== r.version) newVersion(since);
      });
    }); }, 2000);
  });

  // App 在后台放了 10 分钟以上又切回来：检查有没有新版本
  var hiddenAt = 0, checking = false;
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    var away = hiddenAt ? Date.now() - hiddenAt : 0;
    hiddenAt = 0;
    if (away < 600000 || checking || !booted || !sw.controller || navigator.onLine === false) return;
    var since = Date.now();
    checking = true;
    if (P.reg) P.reg.update().catch(function () { /* 忽略 */ });
    P.ask({ type: 'check' }, 120000).then(function (r) {
      checking = false;
      if (!r || !r.ok || !r.latest) return;
      P.latest = r.latest;
      if (P.version && r.latest !== P.version) newVersion(since);
    });
  });
  return P;
})();
