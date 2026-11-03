'use strict';
// ============================================================
//  打击感的 3D 部分（feel.js 调用，不改别的文件）：
//  · 敌人死亡碎块：用敌人自己的颜色，弹几下后缩小消失（两个实例网格，对象池，总数有上限）
//  · 精英、小 Boss、Boss 的大爆炸；Boss / 小 Boss 落地的冲击
//  · 实时特效：按真实时间走，弹窗打开、游戏停住时也会动（升级金光、宝箱光柱、火花、光圈）
//  · 开宝箱用的宝箱模型：箱盖能打开，里面透出稀有度颜色的光
//  碎块按游戏时间走（暂停、弹窗时停住，慢动作时变慢）
// ============================================================
var FeelFX = {
  ready: false,
  CAP: 420, BOX_CAP: 280, GEM_CAP: 160,
  chunks: [], pool: [], ri: 0,
  SPARK_CAP: 180, sparks: [], sparkPool: [],
  rings: [], beams: [],
  pal: {},
  chest: null,
  // 稀有度颜色（和 RARITY 一致）
  RCOL: [0x5ee35e, 0x4ea8ff, 0xc46bff, 0xff4b5a, 0xffc928]
};

// 宝箱盖：半个圆柱（拱顶朝上，转 90° 之后）
MODEL.extraGeo.fxHalfCyl = function (s) { return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 10, 1, false, 0, Math.PI); };

FeelFX.init = function (scene) {
  if (FeelFX.ready || !scene || typeof FX === 'undefined' || !FX.toyMat || !FX.instanced) return;
  var withCol = function (g) {
    if (g.index) g = g.toNonIndexed();
    g.computeVertexNormals();
    var c = new Float32Array(g.attributes.position.count * 3);
    for (var i = 0; i < c.length; i++) c[i] = 1;
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return g;
  };
  // 碎块：方块和不规则的小石块两种形状，同一个材质（和拾取物一样的固定光照，夜里也看得清）
  var mat = FX.toyMat({ fog: 0.8, spec: 0.12, light: 1.05 });
  FeelFX.boxMesh = FX.instanced(withCol(new THREE.BoxGeometry(1, 1, 1)), mat, FeelFX.BOX_CAP, scene);
  FeelFX.gemMesh = FX.instanced(withCol(new THREE.IcosahedronGeometry(0.62, 0)), mat, FeelFX.GEM_CAP, scene);
  // 实时火花：发光的小八面体（颜色乘亮度来淡出）
  FeelFX.sparkMesh = FX.instanced(new THREE.OctahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }), FeelFX.SPARK_CAP, scene);
  FeelFX.sparkMesh.renderOrder = 6;
  FeelFX._m = new THREE.Matrix4(); FeelFX._q = new THREE.Quaternion(); FeelFX._e = new THREE.Euler();
  FeelFX._p = new THREE.Vector3(); FeelFX._s = new THREE.Vector3(); FeelFX._c = new THREE.Color();
  FeelFX.scene = scene;
  FeelFX.ready = true;
};

// ---------------- 敌人配色：按零件体积挑出最主要的几种颜色 ----------------
FeelFX.vol = function (p) {
  var s = p[1] || [], sc = p[5] || [1, 1, 1], k = Math.abs(sc[0] * sc[1] * sc[2]) || 1, r;
  switch (p[0]) {
    case 'box': return s[0] * s[1] * s[2] * k;
    case 'cyl': case 'tube': r = (s[0] + s[1]) / 2; return Math.PI * r * r * s[2] * k;
    case 'cone': return Math.PI * s[0] * s[0] * s[1] / 3 * k;
    case 'ball': case 'sphere': case 'oct': case 'dodec': case 'tet': r = s[0] || 0.1; return 4.19 * r * r * r * k;
  }
  return 0.002;
};

FeelFX.palette = function (def) {
  var id = def && def.id;
  if (id && FeelFX.pal[id]) return FeelFX.pal[id];
  var acc = {}, keys = [], parts = (def && def.parts) || [];
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    if (!p || typeof p[3] !== 'number') continue;
    var v = FeelFX.vol(p);
    if (p[8] && p[8] > 1.3) v *= 0.35;           // 发光的小零件（眼睛、宝石）少一点
    if (!(v > 0)) continue;
    if (acc[p[3]] == null) { acc[p[3]] = 0; keys.push(p[3]); }
    acc[p[3]] += v;
  }
  keys.sort(function (a, b) { return acc[b] - acc[a]; });
  var top = keys.slice(0, 4), tot = 0, cols = [], cum = [];
  for (i = 0; i < top.length; i++) tot += Math.sqrt(acc[top[i]]);
  for (i = 0; i < top.length; i++) {
    var c = new THREE.Color(top[i]);
    cols.push(c.r, c.g, c.b);
    cum.push((cum.length ? cum[cum.length - 1] : 0) + Math.sqrt(acc[top[i]]) / tot);
  }
  if (!cols.length) { var d = new THREE.Color(def && def.color != null ? def.color : 0x9be35a); cols.push(d.r, d.g, d.b); cum.push(1); }
  var pal = { cols: cols, cum: cum };
  if (id) FeelFX.pal[id] = pal;
  return pal;
};

// ---------------- 碎块 ----------------
// 取一个碎块记录：没满就新建；满了只有 force 时才顶掉最老的一批里的一个
FeelFX.take = function (force) {
  var L = FeelFX.chunks;
  if (L.length < FeelFX.CAP) { var c = FeelFX.pool.pop() || {}; L.push(c); return c; }
  if (!force) return null;
  FeelFX.ri = (FeelFX.ri + 1) % L.length;
  return L[FeelFX.ri];
};

// 一块碎块：x y z 起点，v 速度，size 边长，rgb 颜色，life 寿命，gy 落地高度
FeelFX.chunk = function (x, y, z, vx, vy, vz, size, r, g, b, life, gy, force, kind) {
  var c = FeelFX.take(force);
  if (!c) return null;
  c.x = x; c.y = y; c.z = z; c.vx = vx; c.vy = vy; c.vz = vz;
  c.ax = Math.random() * 6; c.ay = Math.random() * 6; c.az = Math.random() * 6;
  c.wx = rand(-14, 14); c.wy = rand(-10, 10); c.wz = rand(-14, 14);
  c.sx = size * rand(0.7, 1.3); c.sy = size * rand(0.55, 1.15); c.sz = size * rand(0.7, 1.3);
  c.h = Math.min(c.sx, c.sy, c.sz) * 0.5;
  c.r = r; c.g = g; c.b = b;
  c.t = 0; c.life = life; c.gy = gy; c.rest = false;
  c.geo = kind != null ? kind : (Math.random() < 0.38 ? 1 : 0);
  c.flut = 0;
  return c;
};

// 预测落点的地面高度（一块一次，平地上和起点一样）
FeelFX.landY = function (x, y, z, vx, vy, vz, gy0) {
  var G = 24, h = Math.max(0, y - gy0), t = (vy + Math.sqrt(vy * vy + 2 * G * h)) / G;
  if (!(t > 0) || !W.noise) return gy0;
  var lx = x + vx * t, lz = z + vz * t;
  var g = W.groundAt(lx, lz, y);
  return Math.abs(g - gy0) > 4 ? gy0 : g;
};

// 敌人炸成碎块：dir 击退方向（碎块往那边多飞一点），n 块数，power 速度倍数，big 大块、活得久
FeelFX.burst = function (e, dirx, dirz, n, power, big, force) {
  if (!FeelFX.ready || !e || !e.def) return;
  var pal = FeelFX.palette(e.def), cols = pal.cols, cum = pal.cum;
  var sc = e.scale || 1, size0 = (big ? 0.3 : 0.2) * Math.pow(sc, 0.75) * clamp((e.r || 0.5) / 0.55, 0.8, 1.6);
  var y0 = e.y + Math.max(0.35, (e.r || 0.5) * 0.9);
  var gy = W.noise ? W.groundAt(e.x, e.z, e.y + 0.5) : e.y;
  if (e.def.flyer) gy = Math.min(gy, e.y);
  var dl = Math.sqrt(dirx * dirx + dirz * dirz) || 1;
  dirx /= dl; dirz /= dl;
  for (var i = 0; i < n; i++) {
    var u = Math.random(), k = 0;
    while (k < cum.length - 1 && u > cum[k]) k++;
    var j = (Math.random() - 0.5) * 0.12, a = Math.random() * TAU, sp = rand(1.2, 4.2) * power, push = rand(1.5, 4.5) * power;
    var vx = Math.cos(a) * sp + dirx * push, vz = Math.sin(a) * sp + dirz * push, vy = rand(3.5, 8) * power;
    var x = e.x + rand(-0.35, 0.35) * sc, y = y0 + rand(-0.2, 0.6) * sc, z = e.z + rand(-0.35, 0.35) * sc;
    FeelFX.chunk(x, y, z, vx, vy, vz, size0 * rand(0.7, 1.35),
      clamp(cols[k * 3] + j, 0, 1), clamp(cols[k * 3 + 1] + j, 0, 1), clamp(cols[k * 3 + 2] + j, 0, 1),
      big ? rand(1.5, 2.3) : rand(0.85, 1.35), FeelFX.landY(x, y, z, vx, vy, vz, gy), force);
  }
};

// 普通的一把碎块（颜色给定）：落地的碎石、彩色纸屑
FeelFX.debris = function (x, y, z, n, hex, speed, size, life, gy, flutter) {
  if (!FeelFX.ready) return;
  var c0 = FeelFX._c.setHex(hex), r = c0.r, g = c0.g, b = c0.b;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, sp = rand(0.4, 1) * speed, j = (Math.random() - 0.5) * 0.14;
    var c = FeelFX.chunk(x, y, z, Math.cos(a) * sp, rand(0.5, 1) * speed * 1.2, Math.sin(a) * sp, size * rand(0.6, 1.3),
      clamp(r + j, 0, 1), clamp(g + j, 0, 1), clamp(b + j, 0, 1), life * rand(0.8, 1.2), gy, true, flutter ? 0 : null);
    if (c && flutter) { c.flut = 1; c.sy *= 0.18; c.h = c.sy * 0.5; }
  }
};

// 碎块的物理和绘制（游戏时间）
FeelFX.update = function (dt) {
  if (!FeelFX.ready) return;
  var L = FeelFX.chunks, nb = 0, ng = 0;
  var bm = FeelFX.boxMesh, gm = FeelFX.gemMesh, ba = bm.instanceMatrix.array, ga = gm.instanceMatrix.array, bc = bm.instanceColor.array, gc = gm.instanceColor.array;
  var m = FeelFX._m, q = FeelFX._q, e = FeelFX._e, p = FeelFX._p, s = FeelFX._s;
  var drag = Math.exp(-dt * 1.2), slide = Math.exp(-dt * 7), fl = Math.exp(-dt * 3.2);
  for (var i = L.length - 1; i >= 0; i--) {
    var c = L[i];
    c.t += dt;
    if (c.t >= c.life) { FeelFX.pool.push(c); L[i] = L[L.length - 1]; L.pop(); continue; }
    if (!c.rest) {
      if (c.flut) {
        // 纸屑：下落慢，左右飘
        c.vy -= 6 * dt; c.vx *= fl; c.vz *= fl; c.vy *= fl;
        c.vx += Math.sin(c.t * 7 + c.ax) * 4 * dt; c.vz += Math.cos(c.t * 6 + c.az) * 4 * dt;
      } else { c.vy -= 24 * dt; c.vx *= drag; c.vz *= drag; }
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.ax += c.wx * dt; c.ay += c.wy * dt; c.az += c.wz * dt;
      if (c.y < c.gy + c.h) {
        c.y = c.gy + c.h;
        if (c.vy < -2.6 && !c.flut) { c.vy *= -0.36; c.vx *= 0.62; c.vz *= 0.62; c.wx *= 0.55; c.wy *= 0.55; c.wz *= 0.55; }
        else { c.vy = 0; c.rest = true; }
      }
      e.set(c.ax, c.ay, c.az);
      q.setFromEuler(e);
      // 落定以后不再转：记下朝向，后面几帧不用再算三角函数
      if (c.rest) { c.qx = q.x; c.qy = q.y; c.qz = q.z; c.qw = q.w; }
    } else {
      c.vx *= slide; c.vz *= slide; c.x += c.vx * dt; c.z += c.vz * dt;
      q.set(c.qx, c.qy, c.qz, c.qw);
    }
    // 最后 30% 的时间缩小消失（一点点沉进地里）
    var k = c.t / c.life, f = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
    f = f * f * (3 - 2 * f);
    s.set(c.sx * f + 1e-4, c.sy * f + 1e-4, c.sz * f + 1e-4);
    p.set(c.x, c.y - (1 - f) * c.h, c.z);
    m.compose(p, q, s);
    if (c.geo === 1 && ng < FeelFX.GEM_CAP) {
      m.toArray(ga, ng * 16); gc[ng * 3] = c.r; gc[ng * 3 + 1] = c.g; gc[ng * 3 + 2] = c.b; ng++;
    } else if (nb < FeelFX.BOX_CAP) {
      m.toArray(ba, nb * 16); bc[nb * 3] = c.r; bc[nb * 3 + 1] = c.g; bc[nb * 3 + 2] = c.b; nb++;
    }
  }
  FX.commit(bm, nb); FX.commit(gm, ng);
};

FeelFX.count = function () { return FeelFX.chunks.length; };

// ---------------- 大爆炸 ----------------
// 精英 / 小 Boss 死亡：更大的碎块 + 冲击环 + 闪光（金币在 feel.js 里拆成一阵金币雨）
FeelFX.blast = function (e, dirx, dirz, mini) {
  if (!FeelFX.ready || !e) return;
  var gy = W.noise ? W.groundAt(e.x, e.z, e.y + 0.5) : e.y, cy = e.y + (e.r || 0.6);
  var col = e.def && e.def.color != null ? e.def.color : 0xffffff;
  FeelFX.burst(e, dirx, dirz, mini ? 26 : 14, mini ? 1.35 : 1.15, true, true);
  FX.boom(e.x, cy, e.z, mini ? 4.2 : 3, col);
  FX.ring(e.x, gy, e.z, mini ? 9 : 6, 0xffffff, mini ? 0.55 : 0.45, 0.9);
  FX.ring(e.x, gy, e.z, mini ? 5.5 : 3.6, 0xffd23a, 0.4, 0.95);
  FX.flash(e.x, cy, e.z, mini ? 5 : 3.4, 0xfff4d0, 0.22, 0);
  FX.flash(e.x, cy, e.z, mini ? 2.6 : 1.8, 0xffffff, 0.16, 2);
  FeelFX.sparkBurst(e.x, cy, e.z, mini ? 22 : 12, 0xffe27a, mini ? 9 : 7, 0.12, 0.7, 10);
};

// Boss 死亡的第一下：最大的爆炸（后面的连环爆炸在 feel.js 的序列里）
FeelFX.bossBlast = function (e, dirx, dirz) {
  if (!FeelFX.ready || !e) return;
  var gy = W.noise ? W.groundAt(e.x, e.z, e.y + 0.5) : e.y, cy = e.y + (e.r || 2) * 1.1;
  var col = e.def && e.def.color != null ? e.def.color : 0xffffff;
  FeelFX.burst(e, dirx, dirz, 56, 1.7, true, true);
  FX.boom(e.x, cy, e.z, 6, col);
  FX.boom(e.x, cy + 1, e.z, 4.5, 0xff8a1a);
  FX.ring(e.x, gy, e.z, 16, 0xffffff, 0.8, 0.95);
  FX.ring(e.x, gy, e.z, 10, 0xffd23a, 0.65, 0.95);
  FX.ring(e.x, gy, e.z, 6, col, 0.5, 0.9);
  FX.flash(e.x, cy, e.z, 9, 0xfff4d0, 0.35, 0);
  FeelFX.sparkBurst(e.x, cy, e.z, 40, 0xffe27a, 12, 0.16, 1.0, 12);
};

// Boss 死后的连环小爆炸（位置随机落在 Boss 身边）
FeelFX.aftershock = function (x, y, z, col, k) {
  if (!FeelFX.ready) return;
  var a = Math.random() * TAU, r = rand(1, 3.2) * k, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, py = y + rand(0.8, 3) * k;
  FX.boom(px, py, pz, rand(2.4, 3.6) * k, Math.random() < 0.5 ? col : 0xff8a1a);
  var gy = W.noise ? W.groundAt(px, pz, py) : y;
  FeelFX.debris(px, py, pz, 6, col, 6, 0.32, 1.6, gy);
  FeelFX.sparkBurst(px, py, pz, 8, 0xfff0b0, 7, 0.12, 0.6, 10);
};

// Boss / 小 Boss 从天上落地：尘土冲击环 + 碎石 + 烟
FeelFX.slam = function (x, y, z, r) {
  if (!FeelFX.ready) return;
  var pal = W.palette || {}, dirt = pal.dirt != null ? pal.dirt : 0x6a5236, rock = pal.cliff != null ? pal.cliff : 0x777777;
  FX.ring(x, y, z, r * 1.6, 0xfff0d0, 0.55, 0.9);
  FX.ring(x, y, z, r, 0xffffff, 0.35, 0.8);
  FX.smoke(x, y + 0.3, z, 6, 0x6a5a4a);
  FeelFX.debris(x, y + 0.4, z, Math.round(10 + r * 2), dirt, 7, 0.34, 1.6, y);
  FeelFX.debris(x, y + 0.4, z, Math.round(4 + r), rock, 6, 0.42, 1.8, y);
};

// 击退扬起的一小撮土
FeelFX.dust = function (x, y, z) {
  if (!FeelFX.ready) return;
  var pal = W.palette || {}, dirt = pal.dirt != null ? pal.dirt : 0x6a5236;
  FeelFX.debris(x, y + 0.2, z, 2, dirt, 2.5, 0.16, 0.5, y);
};

// 通关的纸屑（从玩家头顶落下来）：只用金色系、小一点，像金币碎片，不是七彩的派对纸
FeelFX.confetti = function (x, y, z, n) {
  if (!FeelFX.ready) return;
  var C = [0xffc928, 0xffd84a, 0xfff2a8, 0xd89a1a];
  var gy = W.noise ? W.groundAt(x, z, y + 0.5) : y;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 7;
    var px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r, py = y + rand(5, 10);
    var c = FeelFX.chunk(px, py, pz, rand(-1.5, 1.5), rand(-1, 2), rand(-1.5, 1.5), rand(0.11, 0.19), 1, 1, 1, rand(2.6, 3.6), gy, true, 0);
    if (!c) continue;
    FeelFX._c.setHex(C[i % C.length]);
    c.r = FeelFX._c.r; c.g = FeelFX._c.g; c.b = FeelFX._c.b;
    c.flut = 1; c.sx *= 0.7; c.sz *= 0.7; c.sy *= 0.16; c.h = c.sy * 0.5;
  }
};

// ---------------- 实时特效（真实时间，弹窗打开时也会动） ----------------
// 火花：x y z 起点，n 个，颜色，速度，大小，寿命，g 重力（负数往上飘）
FeelFX.spark = function (x, y, z, vx, vy, vz, hex, size, life, g, drag) {
  if (!FeelFX.ready) return;
  var L = FeelFX.sparks, s;
  if (L.length >= FeelFX.SPARK_CAP) { s = L[(FeelFX.si = ((FeelFX.si || 0) + 1) % L.length)]; }
  else { s = FeelFX.sparkPool.pop() || {}; L.push(s); }
  FeelFX._c.setHex(hex);
  s.x = x; s.y = y; s.z = z; s.vx = vx; s.vy = vy; s.vz = vz;
  s.r = FeelFX._c.r; s.g = FeelFX._c.g; s.b = FeelFX._c.b;
  s.s = size; s.t = 0; s.life = life; s.gr = g == null ? 9 : g; s.dr = drag == null ? 1.5 : drag;
};

// 一阵火花：隔一个画一个、小一半、不发白（随机数照样每个都取、顺序不变，后面刷出来的世界和以前一样）
FeelFX.sparkBurst = function (x, y, z, n, hex, speed, size, life, g) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, u = rand(-0.2, 1), sp = rand(0.35, 1) * speed, h = Math.sqrt(Math.max(0, 1 - u * u));
    Math.random();   // 原来在这里挑三成白色的火花
    var s = size * rand(0.7, 1.3), t = life * rand(0.7, 1.2);
    if (i & 1) continue;
    FeelFX.spark(x, y, z, Math.cos(a) * h * sp, u * sp + speed * 0.3, Math.sin(a) * h * sp, hex, s * 0.55, t, g);
  }
};

// 光圈：从 r0 扩到 r1，life 秒淡出（贴着 y 平放）
FeelFX.ring = function (x, y, z, r0, r1, hex, life, a0) {
  if (!FeelFX.ready) return null;
  var R = null;
  for (var i = 0; i < FeelFX.rings.length; i++) if (!FeelFX.rings[i].on) { R = FeelFX.rings[i]; break; }
  if (!R) {
    if (FeelFX.rings.length >= 6) { R = FeelFX.rings[0]; for (i = 1; i < FeelFX.rings.length; i++) if (FeelFX.rings[i].t / FeelFX.rings[i].life > R.t / R.life) R = FeelFX.rings[i]; }
    else {
      var geo = FX.getGeo ? FX.getGeo('pringM') : new THREE.RingGeometry(0.9, 1, 48).rotateX(-Math.PI / 2);
      var mat = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
      R = { mesh: new THREE.Mesh(geo, mat), on: false };
      R.mesh.frustumCulled = false;
      R.mesh.renderOrder = 5;
      FeelFX.rings.push(R);
    }
  }
  R.on = true; R.t = 0; R.life = life; R.r0 = r0; R.r1 = r1; R.a0 = a0 == null ? 1 : a0;
  R.mesh.material.color.setHex(hex);
  R.mesh.position.set(x, y + 0.14, z);
  R.mesh.scale.setScalar(r0);
  R.mesh.material.opacity = R.a0;
  R.mesh.visible = true;
  if (!R.mesh.parent) FeelFX.scene.add(R.mesh);
  return R;
};

// 光柱的着色器：正对镜头的中间亮、两边透明（柔和的光，不是一根实心的柱子）；下面亮，往上慢慢淡掉
FeelFX.BEAM_VS = [
  'varying float vH;',
  'varying float vF;',
  'void main() {',
  '  vH = uv.y;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  vF = abs(dot(normalize(normalMatrix * normal), normalize(-mv.xyz)));',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');
FeelFX.BEAM_FS = [
  'uniform vec3 uCol;',
  'uniform float uA;',
  'varying float vH;',
  'varying float vF;',
  'void main() {',
  '  float f = (1.0 - vH) * (1.0 - vH) * smoothstep(0.0, 0.03, vH);',
  '  gl_FragColor = vec4(uCol, uA * f * pow(vF, 1.8));',
  '}'
].join('\n');
FeelFX.beamMat = function () {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(0xffffff) }, uA: { value: 1 } },
    vertexShader: FeelFX.BEAM_VS, fragmentShader: FeelFX.BEAM_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
  });
};

// 光柱：底在 (x, y, z)，高 h（最多 4.5 米），外层半径 w；里层和外层同一个颜色（没有白芯）；hold 为真时一直亮着，直到 FeelFX.beamOff
FeelFX.beam = function (x, y, z, hex, h, w, life, hold) {
  if (!FeelFX.ready) return null;
  if (!FeelFX.beamGeo) FeelFX.beamGeo = new THREE.CylinderGeometry(1, 1, 1, 14, 1, true).translate(0, 0.5, 0);
  var B = null;
  for (var i = 0; i < FeelFX.beams.length; i++) if (!FeelFX.beams[i].on) { B = FeelFX.beams[i]; break; }
  if (!B) {
    if (FeelFX.beams.length >= 3) B = FeelFX.beams[0];
    else {
      var mk = function () {
        var m = new THREE.Mesh(FeelFX.beamGeo, FeelFX.beamMat());
        m.frustumCulled = false;
        m.renderOrder = 4;
        return m;
      };
      B = { a: mk(), b: mk(), on: false };
      FeelFX.beams.push(B);
    }
  }
  B.on = true; B.t = 0; B.life = life; B.hold = !!hold; B.h = Math.min(h, 4.5); B.w = w; B.x = x; B.y = y; B.z = z; B.out = -1;
  B.a.material.uniforms.uCol.value.setHex(hex);
  B.b.material.uniforms.uCol.value.setHex(hex);
  [B.a, B.b].forEach(function (m) { m.visible = true; m.position.set(x, y, z); m.scale.set(0.01, 0.01, 0.01); if (!m.parent) FeelFX.scene.add(m); });
  return B;
};

FeelFX.beamOff = function (B) { if (B && B.on && B.out < 0) B.out = 0; };

// 实时特效的推进 + 写入画面（Feel.tick 每帧调用，dt 是真实时间；暂停时不调用）
FeelFX.tickRT = function (dt) {
  if (!FeelFX.ready) return;
  var i, L = FeelFX.sparks, n = 0, sm = FeelFX.sparkMesh, sa = sm.instanceMatrix.array, sc = sm.instanceColor.array;
  for (i = L.length - 1; i >= 0; i--) {
    var s = L[i];
    s.t += dt;
    if (s.t >= s.life) { FeelFX.sparkPool.push(s); L[i] = L[L.length - 1]; L.pop(); continue; }
    var k = Math.exp(-s.dr * dt);
    s.vx *= k; s.vy = s.vy * k - s.gr * dt; s.vz *= k;
    s.x += s.vx * dt; s.y += s.vy * dt; s.z += s.vz * dt;
    var f = 1 - s.t / s.life, z = s.s * (0.35 + 0.65 * f), o = n * 16;
    sa[o] = z; sa[o + 1] = 0; sa[o + 2] = 0; sa[o + 3] = 0;
    sa[o + 4] = 0; sa[o + 5] = z * 1.6; sa[o + 6] = 0; sa[o + 7] = 0;
    sa[o + 8] = 0; sa[o + 9] = 0; sa[o + 10] = z; sa[o + 11] = 0;
    sa[o + 12] = s.x; sa[o + 13] = s.y; sa[o + 14] = s.z; sa[o + 15] = 1;
    var br = Math.min(1, f * 1.6);
    sc[n * 3] = s.r * br; sc[n * 3 + 1] = s.g * br; sc[n * 3 + 2] = s.b * br;
    n++;
  }
  FX.commit(sm, n);
  for (i = 0; i < FeelFX.rings.length; i++) {
    var R = FeelFX.rings[i];
    if (!R.on) continue;
    R.t += dt;
    var kr = R.t / R.life;
    if (kr >= 1) { R.on = false; R.mesh.visible = false; continue; }
    R.mesh.scale.setScalar(R.r0 + (R.r1 - R.r0) * (1 - (1 - kr) * (1 - kr)));
    R.mesh.material.opacity = R.a0 * Math.pow(1 - kr, 1.5);
  }
  for (i = 0; i < FeelFX.beams.length; i++) {
    var B = FeelFX.beams[i];
    if (!B.on) continue;
    B.t += dt;
    var grow = Math.min(1, B.t / 0.2), fade = 1;
    if (B.out >= 0) { B.out += dt; fade = 1 - B.out / 0.45; }
    else if (!B.hold && B.t > B.life - 0.45) fade = (B.life - B.t) / 0.45;
    if (fade <= 0 || (!B.hold && B.t >= B.life)) { B.on = false; B.a.visible = false; B.b.visible = false; continue; }
    var pulse = 1 + Math.sin(B.t * 18) * 0.06, h = B.h * (0.2 + 0.8 * grow) * (0.85 + 0.15 * fade);
    var w = B.w * (0.6 + 0.4 * grow) * pulse;
    B.a.scale.set(w, h, w); B.b.scale.set(w * 0.4, h * 1.02, w * 0.4);
    // 淡一点（外层原来的 0.6 倍、里层 0.45 倍）：是一道光，不是一根发白的柱子
    B.a.material.uniforms.uA.value = 0.51 * fade; B.b.material.uniforms.uA.value = 0.4275 * fade;
  }
  FeelFX.tickChest(dt);
};

// ---------------- 开宝箱：箱盖能打开的宝箱 ----------------
FeelFX.chestGeos = function (free) {
  var K = typeof ENEMY_KIT !== 'undefined' ? ENEMY_KIT : null;
  if (!K) return null;
  var bx = K.bx, lit = K.lit, Q = Math.PI / 2;
  var body = free ? 0xc8922a : 0x8a5a2e, trim = free ? 0xfff0a0 : 0xf2c14e, k = free ? 1.6 : 1.25;
  var B = [
    bx([1.5, 0.72, 1.0], [0, 0.36, 0], body, 'it_plank'),
    bx([1.54, 0.07, 1.04], [0, 0.73, 0], 0x3a2614, 'wood'),
    bx([0.06, 0.1, 0.02], [0, 0.5, 0.565], 0x1a1008, 'plain')
  ].concat(lit(k, [
    bx([0.12, 0.76, 1.06], [0.5, 0.37, 0], trim, 'gold'), bx([0.12, 0.76, 1.06], [-0.5, 0.37, 0], trim, 'gold'),
    bx([0.26, 0.22, 0.07], [0, 0.56, 0.525], trim, 'gold')
  ]));
  [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (c) { B.push(lit(k, [bx([0.16, 0.14, 0.16], [c[0] * 0.7, 0.07, c[1] * 0.46], trim, 'gold')])[0]); });
  // 箱盖：原点是后上沿的铰链，绕 x 轴往后翻
  var Ld = [
    ['fxHalfCyl', [0.5, 0.5, 1.5, 10], [0, 0, 0.5], body, [0, 0, Q], null, 'wood'],
    bx([1.48, 0.04, 0.98], [0, 0.02, 0.5], 0x2a1a0c, 'wood')
  ].concat(lit(k, [
    ['fxHalfCyl', [0.52, 0.52, 0.12, 10], [0.5, 0, 0.5], trim, [0, 0, Q], null, 'gold'],
    ['fxHalfCyl', [0.52, 0.52, 0.12, 10], [-0.5, 0, 0.5], trim, [0, 0, Q], null, 'gold'],
    bx([0.2, 0.14, 0.07], [0, 0.03, 1.03], trim, 'gold')
  ]));
  try { return { body: Enemies.buildGeo(B, true), lid: Enemies.buildGeo(Ld, true) }; } catch (e) { return null; }
};

FeelFX.chestModel = function (free) {
  var C = FeelFX.chest;
  if (!C) {
    var g0 = FeelFX.chestGeos(false), g1 = FeelFX.chestGeos(true);
    if (!g0 || !g1) return null;
    C = FeelFX.chest = { geos: [g0, g1], group: new THREE.Group(), on: false };
    C.body = new THREE.Mesh(g0.body, MODEL.material());
    C.lidPivot = new THREE.Group();
    C.lidPivot.position.set(0, 0.72, -0.5);
    C.lid = new THREE.Mesh(g0.lid, MODEL.material());
    C.lidPivot.add(C.lid);
    // 箱子里透出来的光（稀有度颜色）
    C.glow = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 0.86).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }));
    C.glow.position.y = 0.66;
    C.group.add(C.body); C.group.add(C.lidPivot); C.group.add(C.glow);
    C.group.visible = false;
  }
  var g = C.geos[free ? 1 : 0];
  C.body.geometry = g.body; C.lid.geometry = g.lid;
  return C;
};

// 打开宝箱：o 是被打开的宝箱（位置、朝向），rarity 物品稀有度，wait 开盖前的抖动时间（秒）
FeelFX.openChest = function (o, rarity, wait) {
  if (!FeelFX.ready || !o) return null;
  var C = FeelFX.chestModel(!!o.free);
  if (!C) return null;
  var col = FeelFX.RCOL[clamp(rarity | 0, 0, 4)];
  C.tok = (C.tok || 0) + 1;   // 第几次开箱（延后关箱的定时任务用它认出是不是同一次）
  C.on = true; C.t = 0; C.wait = wait || 0; C.opened = false; C.closing = -1; C.rarity = rarity; C.col = col;
  C.x = o.x; C.y = o.y; C.z = o.z;
  C.group.position.set(o.x, o.y, o.z);
  C.group.rotation.set(0, o.mesh ? o.mesh.rotation.y : 0, 0);
  C.group.scale.setScalar(1);
  C.lidPivot.rotation.x = 0;
  C.glow.material.color.setHex(col);
  C.glow.visible = false;
  C.group.visible = true;
  if (!C.group.parent) FeelFX.scene.add(C.group);
  if (C.beam) { FeelFX.beamOff(C.beam); C.beam = null; }
  return C;
};

// 宝箱开着的时候每帧：先抖一抖，再“嘭”地翻开盖子、冒出光柱和火花
FeelFX.tickChest = function (dt) {
  var C = FeelFX.chest;
  if (!C || !C.on) return;
  C.t += dt;
  var t = C.t, lid = 0;
  if (!C.opened) {
    // 开盖前：越稀有抖得越久、越厉害
    var sh = Math.min(1, t / Math.max(0.05, C.wait)) * (0.025 + C.rarity * 0.01);
    C.group.position.x = C.x + Math.sin(t * 61) * sh;
    C.group.position.z = C.z + Math.cos(t * 47) * sh;
    C.lidPivot.rotation.x = -Math.abs(Math.sin(t * 23)) * 0.06 * Math.min(1, t / 0.1);
    if (t >= C.wait) {
      C.opened = true; C.ot = 0;
      C.group.position.x = C.x; C.group.position.z = C.z;
      C.glow.visible = true;
      var top = C.y + 0.8, R = C.rarity;
      // 光柱只给史诗、传说：4 米高、细一半、0.7 秒自己淡掉（不用记下来关它）；普通到稀有只有地上的光圈、箱子里的光和往上飘的火星
      if (R >= 3) FeelFX.beam(C.x, C.y + 0.62, C.z, C.col, 4, ([0.36, 0.38, 0.42, 0.48, 0.56][R] || 0.4) * 0.5, 0.7, false);
      FeelFX.ring(C.x, C.y, C.z, 0.6, 3 + R * 0.6, C.col, 0.5, 1);
      FeelFX.sparkBurst(C.x, top, C.z, 14 + R * 6, C.col, 6 + R, 0.1, 0.8, 9);
      if (typeof FX !== 'undefined') FX.puff(C.x, C.y + 0.6, C.z, 6, 0xfff0c0);
    }
  } else {
    C.ot += dt;
    // 盖子弹开（稍微过头再回来）
    var k = Math.min(1, C.ot / 0.32), back = 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2);
    lid = -1.95 * back;
    C.lidPivot.rotation.x = lid;
    // 箱子里往上飘的火星：稀有度的颜色（不发白），小一点（随机数照样取、顺序不变）
    if (C.closing < 0 && Math.random() < dt * (14 + C.rarity * 6)) {
      var a = Math.random() * TAU, r = Math.random() * 0.45, vy = rand(2.5, 5);
      Math.random();   // 原来在这里挑四成白色的火星
      FeelFX.spark(C.x + Math.cos(a) * r, C.y + 0.7, C.z + Math.sin(a) * r, 0, vy, 0, C.col, rand(0.06, 0.11) * 0.8, rand(0.9, 1.5), -0.5, 0.2);
    }
  }
  if (C.closing >= 0) {
    // 弹窗关掉以后：光柱熄灭，箱子再停一会儿，然后沉下去消失
    C.closing += dt;
    if (C.closing > 0.9) {
      var q = Math.min(1, (C.closing - 0.9) / 0.35);
      C.group.scale.setScalar(Math.max(0.001, 1 - q * q));
      C.group.position.y = C.y - q * 0.4;
      if (q >= 1) { if (typeof FX !== 'undefined') FX.puff(C.x, C.y + 0.3, C.z, 5, 0xd8c8a8); FeelFX.chestHide(); }
    }
  }
};

// 弹窗关了：光柱淡出，宝箱过一会儿消失
FeelFX.closeChest = function () {
  var C = FeelFX.chest;
  if (!C || !C.on || C.closing >= 0) return;
  C.closing = 0;
  if (!C.opened) { C.opened = true; C.ot = 1; C.glow.visible = true; C.lidPivot.rotation.x = -1.95; C.group.position.x = C.x; C.group.position.z = C.z; }
  FeelFX.beamOff(C.beam);
  C.beam = null;
};

FeelFX.chestHide = function () {
  var C = FeelFX.chest;
  if (!C) return;
  C.on = false;
  C.group.visible = false;
  if (C.beam) { FeelFX.beamOff(C.beam); C.beam = null; }
};

// ---------------- 清场 ----------------
// 换关 / 回菜单 / 新开一局：碎块、火花、光圈、光柱、宝箱全部收起
FeelFX.clear = function () {
  if (!FeelFX.ready) return;
  for (var i = 0; i < FeelFX.chunks.length; i++) FeelFX.pool.push(FeelFX.chunks[i]);
  FeelFX.chunks.length = 0;
  for (i = 0; i < FeelFX.sparks.length; i++) FeelFX.sparkPool.push(FeelFX.sparks[i]);
  FeelFX.sparks.length = 0;
  FX.commit(FeelFX.boxMesh, 0); FX.commit(FeelFX.gemMesh, 0); FX.commit(FeelFX.sparkMesh, 0);
  FeelFX.rings.forEach(function (R) { R.on = false; R.mesh.visible = false; });
  FeelFX.beams.forEach(function (B) { B.on = false; B.a.visible = false; B.b.visible = false; });
  FeelFX.chestHide();
};
