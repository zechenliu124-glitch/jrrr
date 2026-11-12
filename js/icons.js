'use strict';
// ============================================================
//  图标：每把武器、每枚纹章、每件宝物、每个骑士都用游戏里同样的
//  低多边形模型 + 像素贴图 + 光照渲染成一张小图，和游戏画面同一种画风
//  （第一次用到时才渲染，结果缓存成图片地址）
// ============================================================
var ICONS = {
  R: 36,          // 渲染分辨率（像素）；界面里放大显示，保留像素颗粒感
  defs: {},       // name -> { make: function 返回 Object3D, opts }
  canvases: {},   // name -> 画好的小画布
  urls: {},       // name -> dataURL
  // 游戏 id 对应到图标名：ICONS.map.tome.agi = 'boot'
  map: { weapon: {}, tome: {}, item: {}, char: {}, evo: {} }
};

// 定义图标：src 是零件数组（和 MODEL.build 一样的格式）或返回 THREE.Object3D 的函数
// opts: yaw / pitch（观察角度，弧度）、zoom（>1 放大）、spin（模型自身先转多少）、outline（描边颜色，默认深色，null 不描边）、
//       evoMark（超武自己的模型：金描边 + 右上角闪光，和金色版同一个记号；模型本身不染金）
ICONS.model = function (name, src, opts) {
  ICONS.defs[name] = { src: src, opts: opts || {} };
  delete ICONS.canvases[name]; delete ICONS.urls[name];
};

// 把游戏里的东西对应到图标：ICONS.use('tome', 'agi', 'boot')
ICONS.use = function (kind, id, name) { ICONS.map[kind][id] = name; };

// 某个游戏物件的图标名；找不到返回 null（界面继续显示汉字）
ICONS.nameFor = function (kind, id) {
  if (kind === 'char') {
    // 骑士头像：没有单独定义的话，直接拿角色模型拍半身像
    if (ICONS.map.char[id]) return ICONS.map.char[id];
    return (typeof CHARACTERS !== 'undefined' && CHARACTERS[id]) ? 'char:' + id : null;
  }
  var n = ICONS.map[kind] && ICONS.map[kind][id];
  if (!n && kind === 'evo') {
    var base = ICONS.map.weapon[id];
    if (base && ICONS.defs[base]) return 'evo:' + base;    // 超武：原武器图标 + 金色光边
  }
  return n && ICONS.defs[n] ? n : null;
};

// ---------------- 渲染 ----------------
// WebGL 画布丢了（GPU 重置、iPad 切到后台被回收）：这时候什么都画不出来，读回来的还是上一个图标的像素
ICONS.lost = function () {
  try { var gl = Game.renderer.getContext(); return !!(gl && gl.isContextLost && gl.isContextLost()); } catch (e) { return false; }
};
ICONS.setup = function () {
  if (ICONS.lost()) return false;   // 画布丢着：不在死掉的画布上建场景、编着色器（恢复后再建）
  if (ICONS.scene) return true;
  if (typeof Game === 'undefined' || !Game.renderer) return false;
  var R = ICONS.R;
  ICONS.rt = new THREE.WebGLRenderTarget(R, R, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  ICONS.scene = new THREE.Scene();
  // 和森林关差不多的光：偏蓝的天光 + 暖色太阳从左上方照过来
  ICONS.scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a4a3a, 0.95));
  var sun = new THREE.DirectionalLight(0xfff2dc, 0.85);
  sun.position.set(-1.2, 2.0, 1.6);
  ICONS.scene.add(sun);
  ICONS.cam = new THREE.PerspectiveCamera(24, 1, 0.01, 200);
  ICONS.buf = new Uint8Array(R * R * 4);
  ICONS.hookContext();
  ICONS.compile();
  return true;
};

// 两种图标材质（带光照的、发光的）的着色器先编译好：放两个小方块编译一次、真的画一次（有的驱动第一次画才真正编好）再拿走，
// 免得第一次升级、开宝箱时现编（一个着色器在 iPad 上要一两百毫秒）。发光材质不释放，编好的着色器留着给图标用。
// 画布丢了再恢复，编好的着色器都没了：恢复后的下一帧再编一次（ICONS.hookContext）
ICONS.compiled = false;
ICONS.compile = function () {
  if (!ICONS.scene || ICONS.lost()) return false;
  var r = Game.renderer, g = new THREE.Group(), geo = [];
  try {
    if (r.compile && typeof MODEL !== 'undefined' && typeof TEX !== 'undefined' && TEX.atlas) {
      geo.push(MODEL.build([['box', [0.1, 0.1, 0.1], [0, 0, 0], 0xffffff]], false), MODEL.build([['box', [0.1, 0.1, 0.1], [0.2, 0, 0], 0xffffff]], false));
      g.add(new THREE.Mesh(geo[0], MODEL.material()));
      g.add(new THREE.Mesh(geo[1], ICONS.glowMat || (ICONS.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas }))));
      ICONS.scene.add(g);
      r.setRenderTarget(ICONS.rt);
      r.compile(ICONS.scene, ICONS.cam);
      ICONS.cam.position.set(0.1, 0.3, 2); ICONS.cam.lookAt(0.1, 0, 0); ICONS.cam.updateProjectionMatrix();
      r.render(ICONS.scene, ICONS.cam);
      r.readRenderTargetPixels(ICONS.rt, 0, 0, 1, 1, ICONS.buf);
      ICONS.compiled = !ICONS.lost();
    }
  } catch (e) { /* 编译不了也没关系：第一次画的时候会编 */ }
  try { r.setRenderTarget(null); } catch (e2) { /* 忽略 */ }
  ICONS.scene.remove(g);
  geo.forEach(function (x) { x.dispose(); });
  return ICONS.compiled;
};

// 画布丢了 / 恢复了（只挂一次）：丢的时候记下着色器没了；恢复后的下一帧先编着色器，再把丢的时候打开的界面里的汉字砖换回图标
// （画好的小画布和图片地址是 2D 画布上的，不受影响）
ICONS.hookContext = function () {
  var cv = Game.renderer && Game.renderer.domElement;
  if (ICONS.ctxHooked || !cv || !cv.addEventListener) return;
  ICONS.ctxHooked = true;
  cv.addEventListener('webglcontextlost', function () { ICONS.compiled = false; });
  cv.addEventListener('webglcontextrestored', function () {
    var go = function () {
      if (ICONS.lost()) return;
      try { ICONS.compile(); } catch (e) { /* 忽略 */ }
      try { if (typeof UI !== 'undefined' && UI.iconsRestored) UI.iconsRestored(); } catch (e2) { /* 忽略 */ }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(go); else setTimeout(go, 16);
  });
};

ICONS.makeObject = function (name) {
  var real = name, evo = false;
  if (name.indexOf('evo:') === 0) { real = name.slice(4); evo = true; }
  if (name.indexOf('char:') === 0) {
    var id = name.slice(5), ch = CHARACTERS[id];
    var m = CHAR_MODELS.build(ch.model);
    return { obj: m, opts: { portrait: true, yaw: 0.35, pitch: 0.12 }, evo: false };
  }
  var d = ICONS.defs[real];
  if (!d) return null;
  var obj = typeof d.src === 'function' ? d.src() : new THREE.Mesh(MODEL.build(d.src, false), MODEL.material());
  return { obj: obj, opts: d.opts, evo: evo, mark: evo || !!d.opts.evoMark };
};

// 渲染一个图标到小画布
ICONS.render = function (name) {
  if (ICONS.canvases[name]) return ICONS.canvases[name];
  if (ICONS.lost() || !ICONS.setup()) return null;   // 画布丢了：不画也不缓存（也不建场景），界面先显示汉字，恢复后再画
  var made = ICONS.makeObject(name);
  if (!made) return null;
  var R = ICONS.R, obj = made.obj, o = made.opts || {};
  var holder = new THREE.Group();
  if (o.spin) obj.rotation.y += o.spin;
  if (o.tilt) obj.rotation.z += o.tilt;
  holder.add(obj);
  ICONS.scene.add(holder);
  holder.updateMatrixWorld(true);
  // 取景：按包围盒把物体放满画面
  var box = new THREE.Box3().setFromObject(holder);
  var size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  if (o.portrait) {
    // 骑士半身像：只看上面 40%
    var h = size.y;
    center.y = box.max.y - h * 0.2;
    size.set(Math.max(size.x, h * 0.42), h * 0.42, size.z);
  }
  var radius = Math.max(size.x, size.y, size.z) * 0.62 / (o.zoom || 1);
  var yaw = o.yaw != null ? o.yaw : 0.65, pitch = o.pitch != null ? o.pitch : 0.42;
  var dist = radius / Math.tan(ICONS.cam.fov * Math.PI / 360);
  ICONS.cam.position.set(center.x + Math.sin(yaw) * Math.cos(pitch) * dist, center.y + Math.sin(pitch) * dist, center.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  ICONS.cam.lookAt(center);
  ICONS.cam.near = Math.max(0.01, dist - radius * 4); ICONS.cam.far = dist + radius * 4;
  ICONS.cam.updateProjectionMatrix();
  // 渲染到离屏目标，读回像素
  var r = Game.renderer;
  var oldColor = new THREE.Color(), oldAlpha = r.getClearAlpha();
  r.getClearColor(oldColor);
  var oldFog = ICONS.scene.fog, ok = false;
  // 模型画坏了（抛错）也要把场景、渲染目标、清屏色还原，不然以后每个图标都会撞上这个坏模型
  try {
    r.setRenderTarget(ICONS.rt);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(ICONS.scene, ICONS.cam);
    ICONS.buf.fill(0);
    r.readRenderTargetPixels(ICONS.rt, 0, 0, R, R, ICONS.buf);
    ok = !ICONS.lost();   // 画到一半画布丢了：读回来的不算数
  } finally {
    try { r.setRenderTarget(null); r.setClearColor(oldColor, oldAlpha); } catch (e) { /* 忽略 */ }
    ICONS.scene.fog = oldFog;
    ICONS.scene.remove(holder);
    if (!ok && name.indexOf('char:') !== 0) obj.traverse(function (m) { if (m.geometry) m.geometry.dispose(); });
  }
  if (!ok) return null;
  // 画到画布：上下翻转，加一圈描边（超武是金色光边）
  var cv = document.createElement('canvas');
  cv.width = cv.height = R;
  var ctx = cv.getContext('2d');
  var img = ctx.createImageData(R, R), px = img.data, src = ICONS.buf;
  var solid = new Uint8Array(R * R);
  for (var y = 0; y < R; y++) for (var x = 0; x < R; x++) {
    var si = ((R - 1 - y) * R + x) * 4, di = (y * R + x) * 4;
    var a = src[si + 3];
    if (a > 40) {
      solid[y * R + x] = 1;
      px[di] = src[si]; px[di + 1] = src[si + 1]; px[di + 2] = src[si + 2]; px[di + 3] = 255;
      if (made.evo) {   // 超武：整体偏金一点
        px[di] = Math.min(255, px[di] * 1.08 + 18); px[di + 1] = Math.min(255, px[di + 1] * 1.02 + 10); px[di + 2] = px[di + 2] * 0.82;
      }
    }
  }
  var outline = o.outline === null ? null : (made.mark ? [255, 214, 74] : [18, 12, 31]);
  if (outline) {
    for (y = 0; y < R; y++) for (x = 0; x < R; x++) {
      if (solid[y * R + x]) continue;
      var near = (x > 0 && solid[y * R + x - 1]) || (x < R - 1 && solid[y * R + x + 1]) || (y > 0 && solid[(y - 1) * R + x]) || (y < R - 1 && solid[(y + 1) * R + x]);
      if (!near) continue;
      di = (y * R + x) * 4;
      px[di] = outline[0]; px[di + 1] = outline[1]; px[di + 2] = outline[2]; px[di + 3] = 255;
    }
  }
  if (made.mark) {   // 右上角几颗闪光（金色版和超武自己的模型都有）
    [[R - 5, 3], [R - 4, 4], [R - 6, 4], [R - 5, 5], [R - 5, 2], [R - 3, 4], [R - 7, 4]].forEach(function (p, i) {
      di = (p[1] * R + p[0]) * 4; px[di] = 255; px[di + 1] = i ? 242 : 255; px[di + 2] = i ? 168 : 255; px[di + 3] = 255;
    });
  }
  ctx.putImageData(img, 0, 0);
  // 释放这次渲染的几何体（角色模型例外：它们有自己的缓存）
  if (name.indexOf('char:') !== 0) obj.traverse(function (m) { if (m.geometry) m.geometry.dispose(); });
  ICONS.canvases[name] = cv;
  return cv;
};

ICONS.url = function (name) {
  if (ICONS.urls[name]) return ICONS.urls[name];
  var cv = ICONS.render(name);
  if (!cv) return null;
  ICONS.urls[name] = cv.toDataURL();
  return ICONS.urls[name];
};

// 给界面用：返回显示图标的元素；没有图标就返回 null
ICONS.el = function (kind, id, cls) {
  var n = ICONS.nameFor(kind, id);
  if (!n) return null;
  var u = ICONS.url(n);
  if (!u) return null;
  var i = document.createElement('i');
  i.className = 'pxicon' + (cls ? ' ' + cls : '');
  i.style.backgroundImage = 'url(' + u + ')';
  return i;
};

// ---------------- 预热：先把开局后最先用到的图标画好 ----------------
// 第一次画一个图标要现建模型、读回像素，第一次还要编译着色器（iPad 上一两百毫秒，慢的机器上好几秒）：
// 开局后的第一次升级、第一个宝箱如果现画就会卡一下。所以在主菜单里一帧画一个，画好的缓存起来。
// 顺序：选中骑士的起始武器 → 所有骑士的起始武器 → 所有纹章（升级卡）→ 普通宝物（宝箱最常开出来的）→ 其余武器
//       → 其余宝物 → 起始武器的超武（金色版）→ 其余超武。
// 主菜单：刚点过、按过、滑过（包括 iPad 松手后的惯性滚动）的 0.7 秒内不画（不和操作抢同一帧）。
// 开局以后接着画没画完的：这一关的第 2 秒起，一帧最多 3 个（触屏 1 个：一帧只读回一次像素）、一帧里画图标的时间不超过 4 毫秒（第一个总会画），
// 公告和演出的时候歇着——只有这一局还一个都没画过时，关卡卡片放着的时候也先画一个；
// 局内的这一步挂在 Game.loop 的开头（在这一帧的 update / 主画面之前读回，不用等主画面画完）；Game.loop 被换掉（测试）时由 requestAnimationFrame 那一步代画。
// 弹窗、暂停、结算的时候不画（弹窗自己画它要用的）；画布丢了不画。列表画完就停（回到主菜单从头查一遍）
ICONS.warmList = function () {
  var out = [], seen = {}, id;
  var add = function (kind, key) {
    var n = ICONS.nameFor(kind, key);
    if (n && !seen[n]) { seen[n] = true; out.push(n); }
  };
  var C = typeof CHARACTERS !== 'undefined' ? CHARACTERS : {};
  var sel = typeof UI !== 'undefined' ? C[UI.selected] : null;
  if (sel) add('weapon', sel.weapon);
  for (id in C) add('weapon', C[id].weapon);
  if (typeof TOMES !== 'undefined') for (id in TOMES) add('tome', id);
  if (typeof ITEMS !== 'undefined') for (id in ITEMS) if (!ITEMS[id].rarity) add('item', id);
  if (typeof WEAPONS !== 'undefined') for (id in WEAPONS) add('weapon', id);
  if (typeof ITEMS !== 'undefined') for (id in ITEMS) if (ITEMS[id].rarity > 0) add('item', id);
  for (id in C) add('evo', C[id].weapon);
  if (typeof WEAPONS !== 'undefined') for (id in WEAPONS) add('evo', id);
  return out;
};
ICONS.lastInput = 0;
// 局内：屏幕上正在放公告（关卡卡片、强敌出现……）或 FEEL 的演出时不画，不和它们的入场动画抢同一帧（慢的机器上一帧画一个图标要几十毫秒）
ICONS.busyScreen = function () {
  var K = typeof Kit !== 'undefined' ? Kit.ann : null;
  return !!((K && (K.cur || (K.q && K.q.length))) || (typeof Feel !== 'undefined' && Feel.seq));
};
ICONS.prewarm = function (delayMs) {
  if (ICONS.warmOn || typeof requestAnimationFrame !== 'function' || typeof performance === 'undefined') return;
  if (!ICONS.inputHooked && typeof window !== 'undefined') {
    ICONS.inputHooked = true;
    var mark = function () { ICONS.lastInput = performance.now(); };
    // scroll 不冒泡，但在 window 上捕获能收到任何元素的滚动（骑士列表、成就页）
    ['pointerdown', 'touchstart', 'touchmove', 'keydown', 'wheel', 'scroll'].forEach(function (ev) { window.addEventListener(ev, mark, { capture: true, passive: true }); });
  }
  ICONS.warmOn = true;
  var list = null, start = performance.now() + (delayMs == null ? 1000 : delayMs);
  // 画一个；画不出来（模型坏了）：预热不再试（界面用到时 UI.iconEl 会显示汉字），渲染目标切回画面
  var one = function (name) {
    try { ICONS.url(name); } catch (e) { try { Game.renderer.setRenderTarget(null); } catch (e2) { /* 忽略 */ } }
  };
  var next = function () {
    if (!list) list = ICONS.warmList();
    while (list.length && ICONS.urls[list[0]]) list.shift();
    return list.length ? list.shift() : null;
  };
  // 局内一帧的那一步；返回 false = 列表画完了
  var play = function (now) {
    var tt = Game.totalTime || 0;
    if (tt < ICONS.runT) ICONS.runN = 0;   // 新的一局
    ICONS.runT = tt;
    if (Game.time < 1) return true;
    if (ICONS.busyScreen() && ICONS.runN > 0) return true;
    var touch = typeof document !== 'undefined' && document.body && document.body.classList.contains('touch');
    for (var k = 0, t0 = now; k < (touch || ICONS.busyScreen() ? 1 : 3) && (k === 0 || performance.now() - t0 < 4); k++) {
      var name = next();
      if (!name) return false;
      one(name); ICONS.runN++;
    }
    return true;
  };
  ICONS.playStep = play;
  var gen = ICONS.warmGen = (ICONS.warmGen || 0) + 1;
  if (!ICONS.loopHooked && typeof Game !== 'undefined' && typeof Game.loop === 'function') {
    ICONS.loopHooked = true;
    var loop0 = Game.loop;
    // now：这一帧的时间戳（同一帧里的 requestAnimationFrame 回调拿到的是同一个数）
    Game.loop = function (now) {
      ICONS.loopStamp = now;
      if (ICONS.warmOn && Game.state === 'play' && Game.renderer && !ICONS.lost() && !ICONS.playStep(performance.now())) ICONS.warmOn = false;
      return loop0.apply(this, arguments);
    };
  }
  var step = function (ts) {
    if (typeof Game === 'undefined' || !Game.renderer) { ICONS.warmOn = false; return; }
    if (!ICONS.warmOn || gen !== ICONS.warmGen) return;   // 局内那一步画完了 / 又开了一轮新的预热
    var now = performance.now(), st = Game.state, name;
    if (ICONS.lost()) { /* 画布丢了：等恢复了再接着画 */ }
    else if (st === 'menu') {
      if (now >= start && now - ICONS.lastInput > 700) {
        name = next();
        if (!name) { ICONS.warmOn = false; return; }
        one(name);
      }
    } else if (st === 'play' && ts !== ICONS.loopStamp && !play(now)) { ICONS.warmOn = false; return; }   // 这一帧 Game.loop 已经画过了就不画
    requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
};
ICONS.runN = 0; ICONS.runT = 0; ICONS.loopStamp = -1;

// 预览：把所有图标画成一张大图（测试脚本截图检查）；没有图标的显示红色汉字
ICONS.sheet = function (kinds) {
  kinds = kinds || ['weapon', 'evo', 'tome', 'item', 'char'];
  var list = [];
  kinds.forEach(function (k) {
    var src = k === 'weapon' || k === 'evo' ? WEAPONS : k === 'tome' ? TOMES : k === 'item' ? ITEMS : k === 'char' ? CHARACTERS : {};
    for (var id in src) {
      var label = k === 'evo' ? ((typeof EVO !== 'undefined' && EVO[id]) ? EVO[id].name : id) : (src[id].name || id);
      list.push({ kind: k, id: id, label: label, icon: ICONS.nameFor(k, id), glyph: src[id].icon || '' });
    }
  });
  var cols = 10, cw = 112, ch = 116, S = 96;
  var cv = document.createElement('canvas');
  cv.width = cols * cw; cv.height = Math.ceil(list.length / cols) * ch;
  var ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = '#0d1430'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.textAlign = 'center';
  list.forEach(function (o, i) {
    var x = (i % cols) * cw, y = Math.floor(i / cols) * ch;
    ctx.fillStyle = o.kind === 'evo' ? '#3a2f10' : '#1d2648'; ctx.fillRect(x + 8, y + 4, S, S);
    var c = o.icon ? ICONS.render(o.icon) : null;
    if (c) ctx.drawImage(c, x + 8, y + 4, S, S);
    else { ctx.fillStyle = '#ff5a5a'; ctx.font = 'bold 40px sans-serif'; ctx.fillText(o.glyph, x + 56, y + 66); }
    ctx.font = '11px sans-serif'; ctx.fillStyle = c ? '#ffffff' : '#ff8a8a';
    ctx.fillText(o.kind + ':' + o.label, x + 56, y + 112);
  });
  return cv.toDataURL();
};
