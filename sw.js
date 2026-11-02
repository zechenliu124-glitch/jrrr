'use strict';
// ============================================================
//  骑士魔法 · 离线缓存（Service Worker，由 js/pwa.js 注册）
//
//  目标：联网时永远运行最新版；一次加载里的文件全部来自同一个版本（不会新旧混在一起）；
//        第一次联网打开以后完全离线可玩
//  - 一整套游戏文件 = index.html 引用的文件（script / link，启动图除外）+ CSS 里 url() 引用的文件
//    + manifest 里的图标。清单每次都从 index.html 现读，以后新加的 js 文件写进 index.html 就行，不用改这里
//  - 每一整套存成一个缓存“knight-magic <目录> snap-<序号>-<内容摘要>”，全部写完最后才写标记（__snapshot__）；
//    有标记的最新一套就是“当前版本”，写到一半断掉的不算数。只留当前和上一套
//  - 打开页面：先走网络（cache: 'no-cache'：浏览器的 HTTP 缓存也要先问服务器），
//    有缓存时最多等 NAV_WAIT 毫秒；超时、断网、服务器出错就用当前那一套
//  - 页面从网络来的：其他文件也走网络（失败才用缓存）；从缓存来的：其他文件都用同一套缓存
//  - 页面报告“游戏正常启动了”（pwa.js 发 booted）：在后台把服务器上的一整套重新下载一遍，
//    内容和当前版本不一样就存成新的一套，回复页面它跑的是哪个版本、最新的是哪个
//  - 安装：同样下载一整套，全部成功才算装好
//
//  平时改游戏文件不用动这里。只有改了这个文件的逻辑才改 VERSION（改任何字节浏览器都会重新安装）
// ============================================================

var VERSION = 2;
var BASE = new URL('./', self.location.href).href;      // 游戏目录，比如 https://xxx.github.io/knight-magic/
// 缓存名带上目录：github.io 上同一个用户的所有仓库是同一个网站、共用缓存，放了几份游戏也互不干扰
var PREFIX = 'knight-magic ' + new URL(BASE).pathname + ' ';
var SNAP = PREFIX + 'snap-';
var INDEX = BASE + 'index.html';
var MARK = BASE + '__snapshot__';                        // 每套缓存最后写的标记
var SKIP = /^(sw\.js|splash\/)/;      // 这个文件自己；启动图只在“添加到主屏幕”时用，不管
var NAV_WAIT = 4000;     // 打开页面：有缓存时最多等网络这么久
var NET_WAIT = 15000;    // 页面从网络来的：其他文件最多等这么久，实在卡住才用缓存
var ANY_WAIT = 4000;     // 不知道页面从哪来时（比如 sw 中途重启过）
var GET_WAIT = 90000;    // 后台下载一整套时，每个文件最多等这么久

// ---------------- 小工具 ----------------
var inScope = function (u) { return u.indexOf(BASE) === 0 && !SKIP.test(u.slice(BASE.length)); };
var isSnap = function (k) { return k.indexOf(SNAP) === 0; };
var snapInfo = function (name) { var p = name.slice(SNAP.length).split('-'); return { name: name, seq: parseInt(p[0], 36) || 0, hash: p[1] || '' }; };
var match = function (url, snap) { return snap ? caches.match(url, { cacheName: snap.name, ignoreVary: true }) : Promise.resolve(undefined); };

// 交给页面 / 存进缓存的响应：去掉和内容长度、压缩有关的头（读出来的内容已经解压过了）；
// 再标成“每次都要重新确认”，免得浏览器的内存缓存下次绕过这里直接用旧文件
function cleanHeaders(h) {
  h = new Headers(h);
  ['content-encoding', 'content-length', 'transfer-encoding', 'expires'].forEach(function (k) { h.delete(k); });
  h.set('Cache-Control', 'no-cache');
  return h;
}
// 能不能直接用另一个响应的数据流做新响应（老 Safari 不行，就先整个读出来）
var streamOk = (function () { try { var r = new Response('x'); return !!(r.body && new Response(r.body)); } catch (e) { return false; } })();
function serve(res) {
  if (!res || res.type === 'opaque' || res.type === 'error') return res;
  var init = { status: res.status, statusText: res.statusText, headers: cleanHeaders(res.headers) };
  if ([101, 204, 205, 304].indexOf(res.status) >= 0) return new Response(null, init);
  if (streamOk && res.body) return new Response(res.body, init);
  return res.blob().then(function (b) { return new Response(b, init); });
}

// 从网络拿最新的，最多等 ms 毫秒（0 = 一直等）：结果是 { res } / { error } / { timeout: true }；超时就取消请求
function race(url, ms) {
  var ctl = ms && typeof AbortController !== 'undefined' ? new AbortController() : null;
  var req = new Request(url, { cache: 'no-cache', credentials: 'same-origin', signal: ctl ? ctl.signal : undefined });
  return new Promise(function (resolve) {
    var done = false, t = 0;
    var fin = function (v) { if (!done) { done = true; clearTimeout(t); resolve(v); } };
    if (ms) t = setTimeout(function () { fin({ timeout: true }); ctl && ctl.abort(); }, ms);
    fetch(req).then(function (res) {
      // 跟随过重定向的响应不能直接交给页面导航，复制一份干净的
      if (!res.redirected) return res;
      return res.blob().then(function (b) { return new Response(b, { status: res.status, statusText: res.statusText, headers: res.headers }); });
    }).then(function (res) { fin({ res: res }); }, function (e) { fin({ error: e }); });
  });
}

// ---------------- 当前版本 ----------------
// 有标记的、序号最大的一套；结果记下来，换版本时更新
var cur = null;
function current() {
  if (!cur) {
    cur = caches.keys().then(function (keys) {
      return keys.filter(isSnap).sort().reverse().reduce(function (q, k) {
        return q.then(function (found) {
          return found || caches.match(MARK, { cacheName: k }).then(function (m) { return m ? snapInfo(k) : null; });
        });
      }, Promise.resolve(null));
    }).catch(function () { return null; });
  }
  return cur;
}

// 只留 keep（新的当前版本）、比它新的（可能正在写）和它之前最近的一套完整版本，其余删掉
function prune(keep) {
  return caches.keys().then(function (keys) {
    var prev = false;
    return keys.filter(isSnap).sort().reverse().reduce(function (q, k) {
      return q.then(function () {
        if (k >= keep) return;
        return caches.match(MARK, { cacheName: k }).then(function (m) {
          if (m && !prev) { prev = true; return; }
          return caches.delete(k);
        });
      });
    }, Promise.resolve());
  });
}

// ---------------- 一整套文件的清单 ----------------
// 标签的属性：{ 名字: 值 }
function attrs(tag) {
  var o = {}, re = /\s([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g, m;
  while ((m = re.exec(tag))) o[m[1].toLowerCase()] = m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] != null ? m[4] : '';
  return o;
}
function refsFromHtml(html, base) {
  var out = [], re = /<(script|link|img|source)\b[^>]*>/gi, m;
  html = html.replace(/<!--[\s\S]*?-->/g, '');
  while ((m = re.exec(html))) {
    var a = attrs(m[0]), u = m[1].toLowerCase() === 'link' ? a.href : a.src;
    if (m[1].toLowerCase() === 'link' && /(^|\s)(apple-touch-startup-image|preconnect|dns-prefetch)(\s|$)/i.test(a.rel || '')) continue;
    if (u) out.push(new URL(u, base).href.split('#')[0]);
  }
  return out;
}
function refsFromCss(css, base) {
  var out = [], re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g, m;
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  while ((m = re.exec(css))) if (!/^(data:|#)/i.test(m[2])) out.push(new URL(m[2], base).href.split('#')[0]);
  return out;
}
function refsFromManifest(json, base) {
  var out = [];
  ['icons', 'screenshots'].forEach(function (k) {
    (json && Array.isArray(json[k]) ? json[k] : []).forEach(function (x) { if (x && x.src) out.push(new URL(x.src, base).href.split('#')[0]); });
  });
  return out;
}

// 内容摘要（两路 FNV-1a，64 位）：文件路径 + 内容，按路径排好序
function digest(list, bufs) {
  var h1 = 0x811c9dc5, h2 = 0x01000193 ^ 0x5bd1e995, enc = new TextEncoder();
  var eat = function (b) {
    for (var i = 0; i < b.length; i++) { h1 = Math.imul(h1 ^ b[i], 16777619); h2 = Math.imul(h2 ^ b[i], 2246822519); }
  };
  list.forEach(function (u, i) { eat(enc.encode(u.slice(BASE.length) + '\n')); eat(new Uint8Array(bufs[i])); eat([10]); });
  var hex = function (n) { return ('0000000' + (n >>> 0).toString(16)).slice(-8); };
  return hex(h1) + hex(h2);
}

// 从网络下载一整套，全部成功才存；和当前版本内容一样就什么都不写
// 结果 { hash, changed, files }；缺一个文件就整个失败，缓存不动
function snapshot() {
  var got = {}, list = [INDEX];
  var get = function (u) {
    if (!got[u]) {
      got[u] = race(u, GET_WAIT).then(function (r) {
        if (!r.res) throw new Error(u + ' → ' + (r.timeout ? 'timeout' : String(r.error)));
        if (!r.res.ok) throw new Error(u + ' → ' + r.res.status);
        return r.res.arrayBuffer().then(function (buf) { return { res: r.res, buf: buf }; });
      });
    }
    return got[u];
  };
  var add = function (u) { if (inScope(u) && list.indexOf(u) < 0) list.push(u); };
  var text = function (x) { return new TextDecoder('utf-8').decode(x.buf); };
  return get(INDEX).then(function (x) {
    refsFromHtml(text(x), INDEX).forEach(add);
    // 第二层：CSS 里的 url()、manifest 里的图标
    return Promise.all(list.slice(1).map(function (u) {
      var path = new URL(u).pathname;
      if (/\.css$/i.test(path)) return get(u).then(function (y) { refsFromCss(text(y), u).forEach(add); });
      if (/(\.webmanifest|manifest\.json)$/i.test(path)) return get(u).then(function (y) { refsFromManifest(JSON.parse(text(y)), u).forEach(add); });
    }));
  }).then(function () {
    list.sort();
    return Promise.all(list.map(get));
  }).then(function (items) {
    var hash = digest(list, items.map(function (x) { return x.buf; }));
    return Promise.all([current(), caches.keys()]).then(function (v) {
      var now = v[0];
      if (now && now.hash === hash) return { hash: hash, changed: false, files: list.length };
      // 序号：比已有的都大（不用时间直接比，免得改过系统时间以后新旧颠倒）
      var seq = v[1].filter(isSnap).reduce(function (m, k) { return Math.max(m, snapInfo(k).seq + 1); }, Date.now());
      var name = SNAP + ('0000000000' + seq.toString(36)).slice(-10) + '-' + hash;
      return caches.open(name).then(function (cache) {
        return Promise.all(list.map(function (u, i) {
          var x = items[i];
          return cache.put(u, new Response(x.buf, { status: 200, statusText: 'OK', headers: cleanHeaders(x.res.headers) }));
        })).then(function () {
          var mark = { hash: hash, sw: VERSION, time: new Date().toISOString(), files: list.map(function (u) { return u.slice(BASE.length); }) };
          return cache.put(MARK, new Response(JSON.stringify(mark), { headers: { 'Content-Type': 'application/json' } }));
        });
      }).then(function () {
        cur = Promise.resolve(snapInfo(name));
        return prune(name);
      }).then(function () { return { hash: hash, changed: true, files: list.length }; });
    });
  });
}
// 同一时间只下载一套
var building = null;
function refresh() {
  if (!building) {
    building = snapshot().then(function (r) { building = null; return r; }, function (e) { building = null; throw e; });
  }
  return building;
}

// ---------------- 安装 / 启用 ----------------
self.addEventListener('install', function (event) {
  event.waitUntil(refresh().then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    // 这个目录以前留下的其他缓存（不是一整套的）都删掉；别的目录的不碰
    return Promise.all(keys.map(function (k) { if (k.indexOf(PREFIX) === 0 && !isSnap(k)) return caches.delete(k); }));
  }).then(function () {
    cur = null;
    return current();
  }).then(function (c) { return c && prune(c.name); }).then(function () { return self.clients.claim(); }));
});

// ---------------- 每个页面是从哪来的 ----------------
// 页面 id → { mode: 'net' 从网络 | 'cache' 从缓存, snap: 用的那一套, time }
var pages = {};
var lastNav = null;     // 浏览器不告诉新页面的 id 时（没有 resultingClientId），先记在这里，交给下一个来要文件的页面
function remember(id, mode, snap) {
  var p = { mode: mode, snap: snap || null, time: Date.now() };
  Object.keys(pages).forEach(function (k) { if (p.time - pages[k].time > 3600000) delete pages[k]; });
  if (id) pages[id] = p; else lastNav = p;
  return p;
}
function pageOf(id) {
  var p = id && pages[id];
  if (!p && lastNav && Date.now() - lastNav.time < 30000) {
    p = lastNav;
    if (id) { pages[id] = p; lastNav = null; }
  }
  return p || null;
}

// ---------------- 请求 ----------------
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = req.url.split('#')[0];
  if (!inScope(url)) return;
  if (req.mode === 'navigate') {
    var path = url.slice(BASE.length).split('?')[0];
    if (path === '' || path === 'index.html') event.respondWith(onNavigate(event).catch(function () { return fetch(req); }));
    return;
  }
  event.respondWith(onAsset(event, url).catch(function () { return fetch(req); }));
});

// 打开页面
function onNavigate(event) {
  var id = event.resultingClientId || '';
  return current().then(function (snap) {
    return match(INDEX, snap).then(function (cached) {
      var offline = cached && self.navigator && self.navigator.onLine === false;
      return (offline ? Promise.resolve({ error: 'offline' }) : race(event.request.url, cached ? NAV_WAIT : 0)).then(function (r) {
        if (r.res && r.res.ok) { remember(id, 'net'); return serve(r.res); }
        if (cached) { remember(id, 'cache', snap); return serve(cached); }
        remember(id, 'net');
        return r.res ? serve(r.res) : offlinePage();
      });
    });
  });
}

// 页面要的其他文件（js / css / 字体 / 图标 / manifest……）
function onAsset(event, url) {
  var p = pageOf(event.clientId), mode = p ? p.mode : '', from = null;
  return (p && p.snap ? Promise.resolve(p.snap) : current()).then(function (snap) {
    return match(url, snap).then(function (hit) {
      if (hit) { from = snap; return hit; }
      // 页面那一套里没有（比如它已经被删了）：再找当前版本
      if (!(p && p.snap)) return undefined;
      return current().then(function (c) {
        if (!c || c.name === snap.name) return undefined;
        return match(url, c).then(function (h) { if (h) from = c; return h; });
      });
    });
  }).then(function (cached) {
    if (mode === 'cache' && cached) return serve(cached);
    return race(url, !cached ? 0 : mode === 'net' ? NET_WAIT : ANY_WAIT).then(function (r) {
      if (r.res && (r.res.ok || !cached)) return serve(r.res);
      if (cached) {
        // 从网络打开的页面，这个文件网络出错只好用缓存里的：记下来，启动后对一下是不是和服务器上的一样
        if (p && mode === 'net' && from) (p.stale || (p.stale = [])).push({ url: url, snap: from.name });
        return serve(cached);
      }
      return Response.error();
    });
  });
}

// 从网络打开的页面里，有文件用了缓存（网络出错）：和刚下载到的最新一套逐个对比，
// 有不一样的就是新旧混在一起了（结果 true）
function sameBytes(a, b) {
  if (a.byteLength !== b.byteLength) return false;
  a = new Uint8Array(a); b = new Uint8Array(b);
  for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function stillMixed(p) {
  var list = p && p.stale;
  if (!list || !list.length) return Promise.resolve(false);
  return current().then(function (c) {
    if (!c) return true;
    return Promise.all(list.map(function (s) {
      if (s.snap === c.name) return false;
      return Promise.all([caches.match(s.url, { cacheName: s.snap, ignoreVary: true }), match(s.url, c)]).then(function (v) {
        if (!v[0] || !v[1]) return true;
        return Promise.all([v[0].arrayBuffer(), v[1].arrayBuffer()]).then(function (b) { return !sameBytes(b[0], b[1]); });
      });
    })).then(function (r) { return r.some(Boolean); });
  }).catch(function () { return true; });
}

// 第一次打开就没网
function offlinePage() {
  var html = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>骑士魔法</title>' +
    '<body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#0b1424;color:#fff;font:700 20px/1.6 -apple-system,\'PingFang SC\',sans-serif;text-align:center">' +
    '<div>第一次打开需要联网下载游戏<br><span style="color:#a9b6d3;font-size:16px">连上网络后再打开一次，以后没网也能玩</span></div>';
  return new Response(html, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}

// ---------------- 页面发来的消息（js/pwa.js） ----------------
// booted：游戏正常启动了 → 后台下载最新的一整套 → { ok, mode, version: 页面跑的版本, latest: 最新版本, updated: 这次从网络打开、缓存刚换成这个新版本 }
//   （从网络打开但有文件只好用了缓存里的旧版：version 是 'mixed'，页面会重新打开）
// check：只检查有没有新版本 → { ok, latest, changed }
// status：当前版本 → { sw, snapshot, hash, stale: 这个页面有没有文件因为网络出错用了缓存 }
self.addEventListener('message', function (event) {
  var d = event.data || {}, port = event.ports && event.ports[0];
  var reply = function (v) { if (port) port.postMessage(v); };
  var job, p, mode;
  if (d.type === 'booted') {
    p = pageOf(event.source && event.source.id); mode = p ? p.mode : '';
    job = current().then(function (before) {
      // 从缓存来的：跑的就是那一套；从网络来的：就是马上下载到的这一套；不知道的：当作当前版本
      var running = mode === 'cache' && p.snap ? p.snap.hash : before ? before.hash : '';
      return refresh().then(function (r) {
        return (mode === 'net' ? stillMixed(p) : Promise.resolve(false)).then(function (mixed) {
          if (mode === 'net') running = mixed ? 'mixed' : r.hash;
          reply({ ok: true, mode: mode, version: running || r.hash, latest: r.hash, updated: mode === 'net' && !mixed && r.changed && !!before });
        });
      }, function (e) {
        reply({ ok: false, mode: mode, version: running, error: String(e && e.message || e) });
      });
    });
  } else if (d.type === 'check') {
    job = refresh().then(function (r) { reply({ ok: true, latest: r.hash, changed: r.changed }); },
      function (e) { reply({ ok: false, error: String(e && e.message || e) }); });
  } else if (d.type === 'status') {
    p = pageOf(event.source && event.source.id);
    job = current().then(function (c) { reply({ sw: VERSION, snapshot: c ? c.name : '', hash: c ? c.hash : '', stale: !!(p && p.stale && p.stale.length) }); });
  } else return;
  event.waitUntil(job.catch(function () { reply({ ok: false }); }));
});
