'use strict';
// ============================================================
//  第 4 块：新武器的外观（Weapons.L，CHUNK4_WORK §2）
//  weapons.js 决定发生什么、哪种弹丸 / 场地模型在哪儿动；这里只管颜色、几何体以外的发光和每一个新的 FX 调用。
//  weapons.js 每次都先检查（var L = Weapons.L; if (L && L.x) L.x(…)）：没有这个文件时武器照样打，只是没有新外观；
//  这个文件放在今天的 weapons.js 上也不出错（没人调用）。
//
//  接口（谁调用见 §2.2）：
//    light(hex, gold)                      发光颜色往白色提 35%，发白时换成钢灰（超武换淡金）
//    attach(w) / detach(w)                 每把武器常驻的网格：铜钟的光墙 3 个、钓竿的鱼线 3 根
//    hit(w, e, crit, dealt)                命中火花（每把武器自己的颜色；猫爪暴击一颗粉色四角星）
//    muzzle(w, p, o, dx, dz, dy, size)     出手的星光（同一帧同一把武器只闪一次）；从天而降的星星在天上闪一团
//    slash(w, x, y, z, r, a, arc)          近战刀光：骑士剑 / 突刺 / 三道爪痕 / 三道声波弧，超武金色
//    slam(w, x, y, z, r)                   锻锤落点：橙色像素环 + 火星 + 震屏 0.06
//    quake(w, x, y, z, r, phase)           出师之剑的剑痕：0 挥砍时的金色痕，1 炸开的金环和碎块
//    fan(w, o, dy, base, n)                魔术飞刀的扇形光
//    boomOpt(w)                            FX.boom 的选项（冲击环颜色、三种碎块颜色 cols、碎石 grit）
//    chainStart(w, first), chain(w, i, ax, ay, az, bx, by, bz)   信鸽光点 / 雷鼓的鼓波和闪电
//    lob(b), lobLand(b)                    扔出去的颜料桶 / 鞭炮的光、落地的水花 / 火星
//    zone(z, fade, ov, dt)                 颜料地、鞭炮地、荆棘地
//    mine(z, dt), mineFire(z)              墓烛火苗 / 捕兽夹的反光；炸开的青烟 / 碎铁
//    clang(z)                              平底锅敲中的小星
//    ring(z, dt)                           铜钟的冲击圈：铜色像素环 + 一圈很矮的光墙
//    reel(w, h, dt), land(w, e)            鱼线 + 浮标；上岸的水花
//    beam(w, fx, fz, len, dt), beamHit(w, e)   提灯的光束（8 段光片 + 灯口的光晕）；照到的敌人冒光点
//    ram(w, on, fx, fz, dt), ramHit(w, e)  骑枪冲锋的金色扇形 + 速度线；扎中的金色火花
//    aura(w, r, base, dt)                  圣咏往上飘的音符
//    orbit(w, ob, q, s, a0)                锡兵身后的淡红光 / 风筝的蝴蝶结尾巴和线
//    stick(w, x, y, z, r), hop(w, x, y, z, r), split(w, x, y, z)   投枪插地 / 象棋马落地 / 石子碎开
//    proj(p, bk, dt)                       飞行中的小火星：星星、窜天猴、蜜蜂
//    status(e, dt)                         被蜂蜜粘住的敌人头上一滴蜂蜜（颜料的染色在 enemies.js）
//    tick(dt)                              每帧最后：飞行中的信鸽光点、收回这一帧没人用的光墙 / 鱼线
//  只读这些字段：武器 w.id w.def.* w.evo w.level w.hooks w.flaming w.fang w.s w.orad；
//    场地 type x y z r R Rmax t life k look ci model armed shut sl seed w；扔出去的 b：x0 y0 z0 x1 y1 z1 t life evo kind look；
//    敌人 x y z r id alive boss mini elite fireT mk mkC mkT
//  规则（§2.1）：R-W1 发光颜色至少一个通道 < 0xe0；R-W2 每次最多一颗 ≤ 0.8 米的星；R-W3 场地内部淡、边亮，冲击环是像素环；
//    R-W4 每把武器最多 3 种固定的环 / 光带颜色（七种颜料色只进实例颜色）；R-W5 不按弹丸 / 场地 / 命中新建网格和材质，
//    每帧不新建对象（颜色按十六进制缓存、FX.spawn 的选项对象重复用），零星的粒子按 q = FX.PART_CAP / 700 变少
// ============================================================
(function () {
  var L = Weapons.L = {};
  var GOLD = 0xffc23a, STEEL = 0xc8d4e4, PALEGOLD = 0xf0d890;

  // ---------------- 小工具 ----------------
  // 颜色缓存（FX.glow 要 THREE.Color）
  var CC = {};
  function col(h) { return CC[h] || (CC[h] = new THREE.Color(h)); }
  L.col = col;

  // 画质系数：高 1、中 0.64、低 0.36
  function q() { return Math.min(1, (FX.PART_CAP || 700) / 700); }
  L.q = q;
  // 零星粒子的个数：攒在对象上（不用随机数，长期正好是 n × q 个）
  function qn(o, n) { var a = (o._fxN || 0) + n * q(), k = Math.floor(a); o._fxN = a - k; return k; }
  // 不随画质变的个数（鞭炮的小闪光）
  function rn(o, n) { var a = (o._fxR || 0) + n, k = Math.floor(a); o._fxR = a - k; return k; }
  var ACC = {};   // 一次性的东西（扔出去的桶、炸开的蜡烛）共用的计数

  function dark(h) { return Math.max((h >> 16) & 255, (h >> 8) & 255, h & 255) < 0x50; }
  function whiteish(h) { return ((h >> 16) & 255) >= 0xe0 && ((h >> 8) & 255) >= 0xe0 && (h & 255) >= 0xe0; }
  // 粒子（不发光的小方块）每个通道最多 0xe8
  function cube(h) { return Math.min((h >> 16) & 255, 0xe8) << 16 | Math.min((h >> 8) & 255, 0xe8) << 8 | Math.min(h & 255, 0xe8); }

  // R-W1：往白色提 35%；三个通道都 ≥ 0xe0 时换成钢灰（gold：超武的颜色换成淡金）
  var LCn = {}, LCg = {};
  L.light = function (hex, gold) {
    var C = gold ? LCg : LCn, v = C[hex];
    if (v !== undefined) return v;
    var r = (hex >> 16) & 255, g = (hex >> 8) & 255, b = hex & 255;
    r = Math.round(r + (255 - r) * 0.35); g = Math.round(g + (255 - g) * 0.35); b = Math.round(b + (255 - b) * 0.35);
    v = r >= 0xe0 && g >= 0xe0 && b >= 0xe0 ? (gold ? PALEGOLD : STEEL) : (r << 16) | (g << 8) | b;
    C[hex] = v;
    return v;
  };

  // FX.spawn 的选项对象重复用（FX.spawn 不留着它）
  var SO = { x: 0, y: 0, z: 0, s0: 0, s1: 1, life: 0.3, a0: 0.8, rx: 0, ry: 0, rz: 0, blend: null, spin: 0, sy: null, follow: null, own: null };
  function spawn(kind, c, x, y, z, s0, s1, life, a0, ry, rz, own) {
    SO.x = x; SO.y = y; SO.z = z; SO.s0 = s0; SO.s1 = s1; SO.life = life; SO.a0 = a0; SO.ry = ry || 0; SO.rz = rz || 0; SO.own = own || null;
    return FX.spawn(kind, c, SO);
  }
  // 刀光几何体的名字（按弧度缓存，不在每次挥砍时拼字符串）
  var KT = {}, KS = {};
  function kindT(arc) { var k = Math.round((arc || 1.4) * 10); return KT[k] || (KT[k] = 'slashT' + (k / 10).toFixed(1)); }
  function kindS(arc) { var k = Math.round((arc || 2.1) * 10); return KS[k] || (KS[k] = 'slash' + (k / 10).toFixed(1)); }
  function sizeOf(w) { return w.s && Weapons.size ? Weapons.size(w) : 1; }
  function baseKind(k) { return Weapons.baseKind ? Weapons.baseKind(k) : k; }
  function ground(x, z, y) { return W.groundAt(x, z, y + 2); }
  var NOFLASH = { flash: false };
  var FR = 0;        // 帧号（L.tick 里加一）：光墙、鱼线、冲击环这一帧有没有人用
  var STN = 0, HITN = 0;

  // 把一个世界方向（水平的 fx, fz）投到屏幕上：发光精灵不能转，只能按屏幕上的走向拉长（_pr 横、_pu 竖，绝对值）
  var _pr = 1, _pu = 0;
  function project(fx, fz) {
    var cam = Game.camera;
    if (!cam) { _pr = 1; _pu = 0; return; }
    var m = cam.matrixWorld.elements, a = fx * m[0] + fz * m[2], b = fx * m[4] + fz * m[6], l = Math.sqrt(a * a + b * b) || 1;
    _pr = Math.abs(a / l); _pu = Math.abs(b / l);
  }
  // 朝镜头的程度（-1 背对、1 正对镜头）
  function camDot(fx, fz) {
    var cam = Game.camera;
    if (!cam) return 0;
    var cx = cam.position.x - P.pos.x, cz = cam.position.z - P.pos.z, l = Math.sqrt(cx * cx + cz * cz) || 1;
    return (fx * cx + fz * cz) / l;
  }

  // ---------------- 命中火花 ----------------
  // [星光大小, 星光颜色, 碎块数, 碎块颜色]；null = 跳伤类不出火花（光环、颜料、鞭炮、荆棘、铜钟）
  var SPARK_OVR = {
    knightsword: [0.6, STEEL, 2, 0xdfe4e8], falcon: [0.6, 0xfff0a0, 2, 0xc8a070], beehive: [0.5, 0xffe070, 1, 0xffd040],
    trickknives: [0.5, STEEL, 2, 0xd0d8e0], icicle: [0.6, 0xa8e0ff, 2, 0xd0f0e8], fryingpan: [0, 0, 2, 0x8a8e96],
    pigeons: [0.5, 0xd8dee8, 2, 0xe4e8e8],
    hymn: null, bronzebell: null, paintbucket: null, firecracker: null, thornvine: null
  };
  var CRIT_STAR = { claws: 0xff9ab8 };
  var SPK = {};
  function sparkOf(w) {
    var id = w.id, s = SPK[id];
    if (s !== undefined) return s;
    if (Object.prototype.hasOwnProperty.call(SPARK_OVR, id)) s = SPARK_OVR[id];
    else {
      var c = w.def.color != null ? w.def.color : 0xc8d4e4;
      s = [0.6, L.light(dark(c) ? 0x8a8e96 : c), 2, cube(dark(c) ? 0x8a8e96 : c)];
    }
    SPK[id] = s;
    return s;
  }
  L.hit = function (w, e, crit, dealt) {
    var sp = sparkOf(w);
    if (!sp || !e) return;
    var evo = !!w.evo, size = sp[0], star = evo ? PALEGOLD : sp[1];
    if (crit && CRIT_STAR[w.id]) { star = CRIT_STAR[w.id]; size = 0.6; }
    else if (evo && size) size = Math.min(0.8, size * 1.15);
    FX.spark(e.x, e.y + e.r, e.z, size, star, sp[2], evo ? 0xffd23a : sp[3], w.def.type === 'orbit' ? 0.26 : 0.2);
  };

  // ---------------- 出手 ----------------
  L.muzzle = function (w, p, o, dx, dz, dy, size) {
    var evo = !!w.evo;
    // 从天上砸下来的星星：天上那一点闪一团金光（不是星）；第 10 块：落点一圈小金环（和炸开的环同色），留到星星落地
    if (p && p.sky) {
      FX.flash(p.x, p.y, p.z, 1.0, evo ? GOLD : 0xffd860, 0.14, 0);
      var gy = W.groundAt(p.x, p.z, p.y - 12), fall = (p.y - gy) / Math.max(4, Math.abs(p.vy || 26));
      FX.ring(p.x, gy, p.z, 0.8, GOLD, clamp(fall, 0.25, 0.6));
    }
    if (w.def.type === 'shotgun' || w._muzT === Game.time) return;
    w._muzT = Game.time;
    var c = evo ? PALEGOLD : L.light(w.def.color != null ? w.def.color : STEEL);
    var s = Math.min(0.8, 0.6 * clamp(size || 1, 1, 1.33));
    if (p && p.sky) FX.flash(o.x, o.y + 0.5, o.z, 0.5, c, 0.08, 2);
    else FX.flash(o.x + dx * 0.7, o.y + (dy || 0) * 0.7, o.z + dz * 0.7, s, c, 0.08, 2);
  };

  // ---------------- 近战 ----------------
  // 骑士剑：浅钢色的新月（不是白色）；别的武器按 FX.slash 的算法，算出来发白就换成 L.light
  var MAIN = { knightsword: { mainHex: 0xd2dcea } }, MAIN0 = {};
  function mainLook(w) {
    var id = w.id;
    if (MAIN[id] !== undefined) return MAIN[id];
    if (MAIN0[id] !== undefined) return MAIN0[id];
    var c = w.def.color != null ? w.def.color : 0xd2dcea, wl = FX.satHex(c) > 0.55 ? 0.3 : 0.6, m = FX.mixHex(c, 0xffffff, wl);
    return (MAIN0[id] = whiteish(m) ? { mainHex: L.light(c) } : null);
  }
  function thrust(w, x, y, z, r, a, k, evo) {
    var yy = y + 1.0;
    spawn('slashT0.7', evo ? PALEGOLD : 0xe0d8c8, x, yy, z, r * 0.35, r, 0.16, 0.9 * k, a, 0);
    if (evo) spawn('slashT0.7', GOLD, x, yy - 0.02, z, r * 0.4, r * 1.12, 0.22, 0.7 * k, a, 0);
    // 枪尖一颗小四角星（只在突刺上，不是每次命中）
    FX.flash(x + Math.sin(a) * r, yy, z + Math.cos(a) * r, 0.6, evo ? PALEGOLD : STEEL, 0.08, 2);
    // 第 10 块：枪身上 3 片暖白光（L.tick 里画 0.16 秒），突刺朝镜头外面指的时候也看得见
    var o = THR[THR_I]; THR_I = (THR_I + 1) % THR.length;
    o.t = 0; o.x = x; o.y = yy; o.z = z; o.fx = Math.sin(a); o.fz = Math.cos(a); o.r = r; o.evo = evo; o.k = k;
  }
  // 突刺光片：固定 6 个槽轮流用（不新建对象）；从 0.35 r 排到 r，按屏幕上的走向拉长（和提灯光束一样），越往枪尖越细
  var THR = [], THR_I = 0, THR_LIFE = 0.16, THR_D = [0.46, 0.68, 0.89], THR_W = [0.35, 0.26, 0.18];
  for (var ti = 0; ti < 6; ti++) THR.push({ t: 9, x: 0, y: 0, z: 0, fx: 0, fz: 1, r: 1, evo: false, k: 1 });
  function thrustGlows(dt) {
    for (var i = 0; i < THR.length; i++) {
      var o = THR[i];
      if (o.t >= THR_LIFE) continue;
      var f = 1 - o.t / THR_LIFE, along = o.r * 0.65 / 3 * 1.35, c = col(o.evo ? PALEGOLD : 0xf0e8d8);
      o.t += dt;
      project(o.fx, o.fz);
      for (var j = 0; j < 3; j++) {
        var d = o.r * THR_D[j], th = THR_W[j];
        FX.glow(o.x + o.fx * d, o.y, o.z + o.fz * d, along * _pr + th * _pu, along * _pu + th * _pr, c, 0.55 * f * o.k, 0);
      }
    }
  }
  // 三道平行的细爪痕（左右各偏 0.25 米）
  function claw(w, x, y, z, r, a, arc, k, evo) {
    var yy = y + 1.0, px = Math.cos(a), pz = -Math.sin(a), kind = kindT(arc);
    for (var i = -1; i <= 1; i++) {
      var o = i * 0.25;
      spawn(kind, evo && i === 0 ? GOLD : 0xffb8c8, x + px * o, yy + i * 0.06, z + pz * o, r * 0.8, r * 1.02, 0.16, 0.9 * k, a, 0.12);
    }
  }
  // 三道往外扩的棕橙色声波弧 + 2 米和 4 米处扬起的土
  var ROAR_F = [0.4, 0.65, 0.9], ROAR_T = [0.2, 0.26, 0.32];
  function roar(w, x, y, z, r, a, arc, k, evo) {
    var kind = kindS(arc), sa = Math.sin(a), ca = Math.cos(a);
    for (var i = 0; i < 3; i++) spawn(kind, evo && i === 2 ? GOLD : 0xd8925a, x, y + 0.9, z, ROAR_F[i] * r, (ROAR_F[i] + 0.3) * r, ROAR_T[i], 0.75 * k, a, 0);
    for (var d = 2; d <= 4; d += 2) {
      var dx = x + sa * d, dz = z + ca * d;
      FX.burst(dx, ground(dx, dz, y) + 0.2, dz, qn(w, 2), 0x8a7a5a, 3, 0.25);
    }
  }
  L.slash = function (w, x, y, z, r, a, arc) {
    var def = w.def, evo = !!w.evo, prev = FX.slashA;
    // 往镜头这边砍的刀光淡一点、小一点（weapons.js 已经设了就用它的）
    var k = prev < 1 ? prev : Math.cos(a - P.yaw) < -0.3 ? 0.45 : 1;
    if (k < 1 && (def.look === 'claw' || def.look === 'roar' || def.thrust)) r *= 0.85;
    arc = arc || def.arc || 2;
    if (def.look === 'claw') claw(w, x, y, z, r, a, arc, k, evo);
    else if (def.look === 'roar') roar(w, x, y, z, r, a, arc, k, evo);
    else if (def.thrust) thrust(w, x, y, z, r, a, k, evo);
    else {
      FX.slashA = k * 0.9;
      FX.slash(x, y, z, r, a, def.color != null ? def.color : 0xd2dcea, arc, evo, evo ? null : mainLook(w));
    }
    FX.slashA = prev;
  };

  // 锻锤：落点一圈橙色像素环 + 一把橙色和淡橙色的火星 + 震屏
  L.slam = function (w, x, y, z, r) {
    var gy = ground(x, z, y), evo = !!w.evo;
    FX.ring(x, gy, z, clamp((r || 3.8) * 0.4, 1.2, 2.4), evo ? GOLD : 0xff9a3a, 0.3);
    FX.burst(x, gy + 0.3, z, qn(w, 5), 0xff9a3a, 5, 0.22);
    FX.burst(x, gy + 0.3, z, qn(w, 3), 0xe8d8a0, 4, 0.18);
    if (Game.shake) Game.shake(0.06);
  };

  // 出师之剑的剑痕：挥砍时地上一小块金色的痕（0.3 秒），炸开时一圈金环 + 金色碎块
  L.quake = function (w, x, y, z, r, phase) {
    var gy = ground(x, z, y);
    if (!phase) FX.scorch(x, gy + 0.08, z, Math.min(1.4, (r || 2.2) * 0.45), GOLD, 0.4, 0.3);
    else {
      FX.ring(x, gy, z, r || 2.2, GOLD, 0.34);
      FX.burst(x, gy + 0.2, z, qn(w, 6), GOLD, 6, 0.24);
    }
  };

  // 魔术飞刀：扇形的钢色光带 + 三团小闪光（超武：淡金光带 + 钢色细线 + 脚下金环）
  L.fan = function (w, o, dy, base, n) {
    var evo = !!w.evo, fx = Math.sin(base), fz = Math.cos(base);
    var cx = o.x + fx * 1.2, cy = o.y + (dy || 0) * 1.2 + 0.15, cz = o.z + fz * 1.2;
    spawn(evo ? 'slash1.3' : 'slash0.9', evo ? PALEGOLD : 0xd8dee8, cx, cy, cz, 1.4, 3.2, 0.13, 0.8, base, 0);
    if (evo) {
      spawn('slashT1.3', 0xd8dee8, cx, cy + 0.01, cz, 1.3, 3.0, 0.11, 0.7, base, 0);
      FX.ring(o.x, P.pos.y, o.z, 1.6, GOLD, 0.18);
    }
    for (var k = -1; k <= 1; k++) {
      var a = base + k * 0.27;
      FX.flash(o.x + Math.sin(a) * 2.6, cy, o.z + Math.cos(a) * 2.6, 0.7, evo ? PALEGOLD : 0xd8dee8, 0.09, 0);
    }
  };

  // ---------------- 爆炸 ----------------
  // ring 冲击环、cols [亮, 中, 暗] 碎块（星光用「亮」）、grit [个数, 颜色] 额外的碎石；evo：超武的火舌和焦痕
  var BOOMS = {
    astrolabe: { ring: GOLD, cols: [0xfff2a8, 0xffd040, 0xc89020] },
    trebuchet: { ring: 0xc8a870, cols: [0xe8d8b0, 0xa08a60, 0x6a5a40], grit: [6, 0x8a8a84] },
    skyrocket: { ring: 0xff6040, cols: [0xff4a3a, 0xffd040, 0x5fd35f] },
    gravecandle: { ring: 0xb8f0a8, cols: [0xd8f8c0, 0xb8f0a8, 0x6a9a6a] },
    beartrap: { ring: 0x8a8e96, cols: [0xc8ccd4, 0x8a8e96, 0x4a4e56] }
  };
  var BOOMS_E = {
    astrolabe: { evo: true, ring: GOLD, cols: [0xfff2a8, 0xffb040, 0xc85a1a] },
    trebuchet: { ring: GOLD, cols: [0xe8d8b0, 0xa08a60, 0x6a5a40], grit: [6, 0x8a8a84] },
    skyrocket: { ring: GOLD, cols: [0xff4a3a, 0xffd040, 0x5fd35f] },
    gravecandle: { ring: GOLD, cols: [0xd8f8c0, 0xb8f0a8, 0x6a9a6a] },
    beartrap: { ring: GOLD, cols: [0xc8ccd4, 0x8a8e96, 0x4a4e56] }
  };
  L.BOOMS = BOOMS; L.BOOMS_E = BOOMS_E;
  L.boomOpt = function (w) { return (w.evo ? BOOMS_E : BOOMS)[w.id] || null; };

  // ---------------- 连锁：信鸽、雷鼓 ----------------
  // 信鸽的光点：飞行中的一团光（最多 32 个同时在飞，记录重复用）
  var DOTS = [];
  for (var di = 0; di < 32; di++) DOTS.push({ on: false, t: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, evo: false });
  function feathers(x, y, z, n, evo) {
    for (var i = 0; i < n; i++) FX.part(x + rand(-0.2, 0.2), y + rand(-0.1, 0.2), z + rand(-0.2, 0.2), rand(-1.2, 1.2), rand(0.5, 2), rand(-1.2, 1.2), evo && i % 2 ? 0xe8d890 : 0xe4e8e8, 0.13, rand(0.5, 0.8), 3);
  }
  L.chainStart = function (w, first) {
    var evo = !!w.evo;
    if (w.def.chainLook === 'pigeon') feathers(P.pos.x, P.pos.y + 1.3, P.pos.z, qn(w, 3), evo);
    else {
      // 雷鼓：脚下先一圈蓝白鼓波，第一个目标身上几颗淡蓝碎屑
      FX.ring(P.pos.x, P.pos.y, P.pos.z, 1.6, evo ? GOLD : 0xa0d0ff, 0.3);
      if (first) FX.burst(first.x, first.y + first.r, first.z, qn(w, 3), 0xa0d0ff, 5, 0.15);
    }
  };
  L.chain = function (w, i, ax, ay, az, bx, by, bz) {
    var evo = !!w.evo;
    if (w.def.chainLook === 'pigeon') {
      // 一团光点沿拱起 1.5 米的弧线飞过去（一个接一个出发），落地撒几片羽毛；第一跳从手里飞出去
      var d = null;
      for (var k = 0; k < DOTS.length; k++) if (!DOTS[k].on) { d = DOTS[k]; break; }
      if (!d) { feathers(bx, by, bz, qn(w, 3), evo); return; }
      d.on = true; d.t = -i * 0.12; d.evo = evo;
      if (i === 0) { d.ax = P.pos.x; d.ay = P.pos.y + 1.3; d.az = P.pos.z; } else { d.ax = ax; d.ay = ay; d.az = az; }
      d.bx = bx; d.by = by; d.bz = bz;
      return;
    }
    // 雷鼓：照旧的闪电，但不要 FX.bolt 自带的白色大星；落点一团淡蓝光（第一下再加一颗小星）
    FX.bolt(ax, ay, az, bx, by, bz, null, NOFLASH);
    FX.flash(bx, by, bz, i === 0 ? 2.4 : 1.6, evo ? 0xffd870 : 0x9fd8ff, 0.2, 0);
    if (i === 0) FX.flash(bx, by + 0.2, bz, 0.6, evo ? PALEGOLD : L.light(0xa0d0ff), 0.12, 2);
  };
  function tickDots(dt) {
    for (var k = 0; k < DOTS.length; k++) {
      var d = DOTS[k];
      if (!d.on) continue;
      d.t += dt;
      if (d.t < 0) continue;
      var f = d.t / 0.15;
      if (f >= 1) { d.on = false; feathers(d.bx, d.by, d.bz, qn(ACC, 3), d.evo); continue; }
      FX.glow(lerp(d.ax, d.bx, f), lerp(d.ay, d.by, f) + 6 * f * (1 - f), lerp(d.az, d.bz, f), 0.7, 0.7, col(d.evo ? PALEGOLD : 0xd8dee8), 0.55, 0);
    }
  }

  // ---------------- 扔出去的颜料桶 / 鞭炮 ----------------
  function lobPos(b) {
    var s = Math.min(1, b.t / b.life), lh = 1.2 + Math.sqrt(dist2(b.x0, b.z0, b.x1, b.z1)) * 0.12;
    LP.x = lerp(b.x0, b.x1, s); LP.y = lerp(b.y0, b.y1, s) + 4 * lh * s * (1 - s); LP.z = lerp(b.z0, b.z1, s);
    return LP;
  }
  var LP = { x: 0, y: 0, z: 0 };
  L.lob = function (b) {
    if (b.look !== 'crackle' && !b.evo) return;   // 颜料桶飞的时候不发光
    var p = lobPos(b);
    if (b.look === 'crackle') FX.glow(p.x, p.y, p.z, 0.6, 0.6, col(b.evo ? 0xffd860 : 0xff8a5a), 0.5, 0);
    else FX.glow(p.x, p.y, p.z, 0.5, 0.5, col(0xffd860), 0.35, 0);
  };
  // 颜料桶落地：这一桶的颜色溅开（颜色在场地上：找同一个落点的颜料地）
  function lobCi(b) {
    if (b.ci != null) return b.ci;
    var zs = Weapons.zones;
    for (var i = zs.length - 1; i >= 0; i--) { var z = zs[i]; if (z.x === b.x1 && z.z === b.z1 && z.ci != null) return z.ci; }
    return 6;
  }
  L.lobLand = function (b) {
    if (b.look === 'paint') {
      var pc = PAINT_C[lobCi(b) % 7];
      FX.burst(b.x1, b.y1, b.z1, qn(ACC, 8), pc, 5, 0.2);
    } else if (b.look === 'crackle') {
      for (var n = qn(ACC, 6), i = 0; i < n; i++) FX.part(b.x1, b.y1, b.z1, rand(-4, 4), rand(2, 5), rand(-4, 4), 0xe8d040, 0.12, rand(0.25, 0.4), 9);
    } else FX.burst(b.x1, b.y1, b.z1, qn(ACC, 4), 0x8a7a5a, 4, 0.18);
  };

  // ---------------- 场地：颜料地、鞭炮地、荆棘地 ----------------
  L.zone = function (z, fade, ov, dt) {
    var sl = z.sl, sx = sl ? sl[0] : 0, sz = sl ? sl[1] : 0, k = fade * (ov == null ? 1 : ov), evo = !!(z.w && z.w.evo), n, i, a, rr;
    dt = dt || 1 / 30;
    if (z.look === 'paint') {
      // 七色轮流的颜料地：中间淡（≤ 0.2）、边亮（0.45）；边上往外甩颜料滴（每秒 ≤ 6 × q）
      var pc = PAINT_C[(z.ci | 0) % 7];
      FX.decal(z.x, z.y + 0.1, z.z, z.r, sx, sz, pc, 0.2 * k, (evo ? 0.55 : 0.45) * k, 0);
      for (n = qn(z, 6 * dt * fade), i = 0; i < n; i++) {
        a = Math.random() * TAU; rr = z.r * 0.92;
        FX.part(z.x + Math.cos(a) * rr, z.y + 0.15, z.z + Math.sin(a) * rr, Math.cos(a) * rand(0.6, 1.6), rand(1.5, 3), Math.sin(a) * rand(0.6, 1.6), pc, 0.14, 0.45);
      }
      if (evo && qn(z, 2 * dt) > 0) FX.mote(z.x + rand(-z.r, z.r) * 0.6, z.y + 0.2, z.z + rand(-z.r, z.r) * 0.6, 0xffd860, 0.12, 1.2, 0.6);
    } else if (z.look === 'crackle') {
      // 红纸屑地：中间 0.16、边 0.4；圈里随机位置的淡黄小闪光（每秒 ≤ 4，不是星）、红纸屑（每秒 ≤ 10 × q）
      FX.decal(z.x, z.y + 0.1, z.z, z.r, sx, sz, 0x6a1a14, 0.16 * k, 0.4 * k, 0);
      for (n = rn(z, 4 * dt * fade), i = 0; i < n; i++) {
        a = Math.random() * TAU; rr = Math.sqrt(Math.random()) * z.r * 0.8;
        FX.flash(z.x + Math.cos(a) * rr, z.y + 0.35, z.z + Math.sin(a) * rr, 0.6, evo ? 0xffd860 : 0xffe9a0, 0.08, 0);
      }
      for (n = qn(z, 10 * dt * fade), i = 0; i < n; i++) {
        a = Math.random() * TAU; rr = Math.sqrt(Math.random()) * z.r * 0.8;
        FX.part(z.x + Math.cos(a) * rr, z.y + 0.3, z.z + Math.sin(a) * rr, rand(-1.2, 1.2), rand(2.5, 4.5), rand(-1.2, 1.2), evo && i % 2 ? GOLD : 0xd83a2a, 0.12, 0.6);
      }
    } else if (z.look === 'bramble' || z.type === 'trail') {
      // 荆棘地：暗绿（0.18 / 0.4）+ 往上冒的绿褐色荆棘刺（每秒 ≤ 3 × q），没有火星；超武结霜
      FX.decal(z.x, z.y + 0.1, z.z, z.r, sx, sz, evo ? 0x2f5a4a : 0x2f5a2a, 0.18 * k, 0.4 * k, 0);
      for (n = qn(z, 3 * dt * fade), i = 0; i < n; i++) {
        a = Math.random() * TAU; rr = Math.sqrt(Math.random()) * z.r * 0.85;
        FX.mote(z.x + Math.cos(a) * rr, z.y + 0.1, z.z + Math.sin(a) * rr, evo ? (i % 2 ? 0xa8d8e8 : 0x4a7a5a) : Math.random() < 0.5 ? 0x6a5a2a : 0x4a7a3a, 0.14, 0.8, 0.5);
      }
    }
  };

  // ---------------- 地雷类：墓烛、捕兽夹 ----------------
  L.mine = function (z, dt) {
    if (z.shut) return;
    var y0 = z.y + 0.1;
    if (z.model === 'candle') {
      // 两团绿白色的火苗，一跳一跳
      var f = 0.8 + 0.2 * Math.sin(z.t * 23 + z.x * 3.1);
      FX.glow(z.x, y0 + 0.66 + 0.1 * f, z.z, 0.3 * f, 0.46 * f, col(0xb8f0a8), 0.75, 0);
      FX.glow(z.x, y0 + 0.66 + 0.05 * f, z.z, 0.16 * f, 0.26 * f, col(0xd8f8c0), 0.85, 0);
    } else if (z.model === 'trap') {
      // 每 1.5 秒铁牙上闪一下钢色的小光（每个夹子的节拍错开）
      var ph = z.t + Math.abs(z.x * 0.37 + z.z * 0.61) % 1.5;
      if (Math.floor(ph / 1.5) !== Math.floor((ph - (dt || 1 / 30)) / 1.5)) FX.flash(z.x + 0.3, y0 + 0.2, z.z, 0.4, STEEL, 0.12, 2);
    }
  };
  L.mineFire = function (z) {
    if (z.model === 'candle') FX.smoke(z.x, z.y + 0.5, z.z, qn(ACC, 3), 0x6a7a78);
    else if (z.model === 'trap') FX.burst(z.x, z.y + 0.2, z.z, qn(ACC, 6), 0x8a8e96, 5, 0.18);
  };

  // 平底锅敲中：一颗钢色小星
  L.clang = function (z) {
    FX.flash(z.x, z.y + 0.3, z.z, 0.5, z.w && z.w.evo ? PALEGOLD : STEEL, 0.08, 2);
  };

  // ---------------- 铜钟：往外扩的冲击圈 ----------------
  // 地面高度（相对圆心）：每帧在当前半径上采 12 个点，中间的取平均；冲击环和光墙共用
  var HS = new Float32Array(24);
  function sampleRing(x, y, z, R) {
    var i;
    for (i = 0; i < 24; i += 2) {
      var a = i / 24 * TAU;
      HS[i] = clamp(W.groundAt(x + Math.cos(a) * R, z + Math.sin(a) * R, y + 3) - y, -1.2, 1.2);
    }
    for (i = 1; i < 24; i += 2) HS[i] = (HS[i - 1] + HS[(i + 1) % 24]) * 0.5;
  }
  // 光墙的几何体：光环几何体里只留竖直光墙那一圈（kind 1）；像素环由 FX 的冲击环画，内圈细环不要
  var WALL_GEO = null;
  function wallGeo() {
    if (WALL_GEO) return WALL_GEO;
    var src = Weapons.auraGeo(true), P0 = src.attributes.position.array, K = src.attributes.aKind.array, A = src.attributes.aAng.array;
    var pos = [], kind = [], ang = [];
    for (var i = 0; i < K.length; i++) {
      if (K[i] !== 1) continue;
      pos.push(P0[i * 3], P0[i * 3 + 1], P0[i * 3 + 2]); kind.push(1); ang.push(A[i]);
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
    WALL_GEO = g;
    return g;
  }
  function wallFor(w, z) {
    var ws = w._walls;
    if (!ws) return null;
    if (z._wl && z._wl._z === z) return z._wl;
    for (var i = 0; i < ws.length; i++) if (!ws[i]._z) { ws[i]._z = z; z._wl = ws[i]; return ws[i]; }
    return null;
  }
  L.ring = function (z, dt) {
    if (!(z.t >= 0)) return;
    var w = z.w, evo = !!(w && w.evo), c = evo ? GOLD : 0xd8a850, R = Math.max(0.05, z.R || 0);
    var left = (z.life || 0.45) + 0.15 - z.t, al = clamp(left / 0.15, 0, 1), i;
    if (left <= 0) return;
    sampleRing(z.x, z.y, z.z, R);
    // 冲击环：一个池子里的像素环，每帧把大小设成当前的半径（正好跟着线性扩散的前沿），最后 0.15 秒变淡
    var e = z._re;
    if (!e || e.own !== z || e.free) e = z._re = spawn((z.Rmax || R) > 7.5 ? 'pringL' : 'pringM', c, z.x, z.y + 0.15, z.z, R, R, left, 0.95 * al, 0, 0, z);
    e.t = 0; e.life = Math.max(1 / 30, left); e.s0 = R; e.s1 = R; e.a0 = 0.95 * al;
    if (e.uni) { var H = e.uni.uH.value; for (i = 0; i < 24; i++) H[i] = HS[i]; }
    // 一圈很矮的光墙（每把武器 3 个，attach 时建好）
    var wl = w ? wallFor(w, z) : null;
    if (wl) {
      var u = wl.material.uniforms;
      wl.visible = true;
      wl.position.set(z.x, z.y, z.z);
      u.uR.value = R; u.uHgt.value = 0.35; u.uTime.value = Game.time;
      u.uPulse.value = clamp(1 - z.t / (z.life || 0.45), 0, 1);
      u.uCamAng.value = Weapons.camAng ? Weapons.camAng() : 0;
      u.uCol.value.setHex(c).multiplyScalar(al);
      var UH = u.uH.value;
      for (i = 0; i < 24; i++) UH[i] = HS[i];
      wl._seen = FR;
    }
  };

  // ---------------- 钓竿：鱼线 + 浮标、上岸的水花 ----------------
  var LINE_GEO = null, LINE_M = null, LINE_ME = null;
  function lineFor(w, h) {
    var ls = w._lines;
    if (!ls) return null;
    if (h._ln && h._ln._h === h) return h._ln;
    for (var i = 0; i < ls.length; i++) if (!ls[i]._h) { ls[i]._h = h; h._ln = ls[i]; return ls[i]; }
    return null;
  }
  L.reel = function (w, h, dt) {
    var e = h && h.e;
    if (!e) return;
    // 鱼钩挂在敌人头顶（浮标不被身体挡住）
    var sx = P.pos.x, sy = P.pos.y + 1.1, sz = P.pos.z, tx = e.x, ty = window.Evo && Evo.topOf && e.def ? Evo.topOf(e) - 0.2 : e.y + e.r * 2, tz = e.z;
    var ln = lineFor(w, h);
    if (ln) {
      var dx = tx - sx, dy = ty - sy, dz = tz - sz, len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.01;
      ln.visible = true;
      ln.material = w.evo ? LINE_ME : LINE_M;
      ln.position.set(sx, sy, sz);
      ln.lookAt(tx, ty, tz);
      ln.scale.set(1, 1, len);
      ln._seen = FR;
    }
    // 浮标：红白两团光一闪一闪（每秒 3 次）
    var ph = Math.floor(Game.time * 6) & 1;
    FX.glow(tx, ty + 0.15, tz, 0.35, 0.35, col(0xe04a3a), ph ? 0.85 : 0.45, 0);
    FX.glow(tx, ty + 0.32, tz, 0.25, 0.25, col(0xe8dcd0), ph ? 0.4 : 0.8, 0);
  };
  L.land = function (w, e) {
    var gy = ground(e.x, e.z, e.y);
    FX.burst(e.x, gy + 0.3, e.z, qn(w, 8), 0x8fd0ff, 5, 0.2);
    FX.ring(e.x, gy, e.z, 3 * Math.sqrt(sizeOf(w)), w.evo ? GOLD : 0x8fd0ff, 0.35);
  };

  // ---------------- 提灯：一束细长的暖黄光 ----------------
  // 8 段光片从 1 米排到光束末端（按光束在屏幕上的走向拉长，接成一条线），灯口一颗暖色光晕；不是 FX.trailSeg（它的芯是白的）
  var BEAM_C = [];
  (function () { var a = new THREE.Color(0xffd060), b = new THREE.Color(0xffb040); for (var i = 0; i < 8; i++) BEAM_C.push(a.clone().lerp(b, i / 7)); })();
  L.beam = function (w, fx, fz, len, dt) {
    var def = w.def, evo = !!w.evo, kw = (def.beamW || 0.15) / 0.15;
    var x0 = P.pos.x, y0 = P.pos.y + 1.1, z0 = P.pos.z;
    len = Math.max(1.5, len || 11);
    project(fx, fz);
    // 朝镜头扫过来时整束淡一些
    var kc = 1 - 0.6 * clamp((camDot(fx, fz) - 0.2) / 0.7, 0, 1);
    var sp = (len - 1) / 7, along = sp * 1.25;
    for (var i = 0; i < 8; i++) {
      var t = i / 7, d = 1 + sp * i, th = lerp(0.5, 1.6, t) * kw * (evo && i % 2 ? 1.15 : 1);
      FX.glow(x0 + fx * d, y0, z0 + fz * d, along * _pr + th * _pu, along * _pu + th * _pr, evo && i % 2 ? col(GOLD) : BEAM_C[i], lerp(0.55, 0.3, t) * kc, 0);
    }
    FX.glow(x0 + fx * 0.5, y0, z0 + fz * 0.5, 1.0, 1.0, col(0xffe2a0), 0.45 * kc, 0);
  };
  L.beamHit = function (w, e) {
    if (HITN >= 6 * q()) return;
    HITN++;
    FX.mote(e.x + rand(-0.3, 0.3), e.y + e.r * 1.2, e.z + rand(-0.3, 0.3), 0xe8d090, 0.12, 1.3, 0.45);
  };

  // ---------------- 骑枪冲锋 ----------------
  var RAM0 = { arc: 1.1, range: 3 };
  L.ram = function (w, on, fx, fz, dt) {
    if (!on) { w._ramF = 0; return; }
    var ram = w.def.ram || RAM0, evo = !!w.evo, a = Math.atan2(fx, fz), r = (ram.range || 3) * sizeOf(w);
    w._ramF = (w._ramF || 0) - (dt || 1 / 30);
    // 枪尖前方一片金色扇形微光（每 0.15 秒重新放一片）
    if (w._ramF <= 0) { w._ramF = 0.15; spawn(kindT(ram.arc || 1.1), evo ? GOLD : 0xffd060, P.pos.x, P.pos.y + 0.9, P.pos.z, r * 0.85, r, 0.18, 0.35, a, 0); }
    // 身后三道速度线（按屏幕上的走向拉长）
    project(fx, fz);
    for (var k = -1; k <= 1; k++) {
      var b = 1.3 + 0.35 * Math.abs(k), lx = P.pos.x - fx * b + fz * k * 0.45, lz = P.pos.z - fz * b - fx * k * 0.45;
      FX.glow(lx, P.pos.y + 0.8 + 0.3 * k, lz, 1.2 * _pr + 0.15 * _pu, 1.2 * _pu + 0.15 * _pr, col(0xffe2a0), 0.3 * (0.6 + 0.4 * Math.sin(Game.time * 40 + k * 2)), 0);
    }
  };
  L.ramHit = function (w, e) { FX.spark(e.x, e.y + e.r, e.z, 0.6, 0xffd040, 2, GOLD, 0.2); };

  // ---------------- 圣咏：往上飘的小音符 ----------------
  L.aura = function (w, r, base, dt) {
    var c = w.evo ? 0xffd860 : 0xffe8a8;
    for (var n = qn(w, 9 * (dt || 1 / 30)), i = 0; i < n; i++) {
      var ma = Math.random() * TAU, mr = Math.sqrt(Math.random()) * r, x = P.pos.x + Math.cos(ma) * mr, z = P.pos.z + Math.sin(ma) * mr;
      var vy = rand(0.9, 1.6), life = rand(0.7, 1.1);
      FX.mote(x, base + 0.15, z, c, 0.12, vy, life);             // 音符头
      FX.mote(x + 0.08, base + 0.31, z, c, 0.07, vy, life);      // 小旗
    }
  };

  // ---------------- 环绕：锡兵、风筝 ----------------
  L.orbit = function (w, ob, qi, s, a0) {
    var bk = baseKind(w.def.proj), evo = !!w.evo, rad = w.orad || Math.sqrt(dist2(ob.x, ob.z, P.pos.x, P.pos.z)), k, a;
    s = s || 1;
    if (bk === 'tinman') {
      // 身后两团淡红光
      for (k = 1; k <= 2; k++) {
        a = a0 - 0.14 * k;
        FX.glow(P.pos.x + Math.cos(a) * rad, ob.y - 0.45, P.pos.z + Math.sin(a) * rad, 0.5 * s, 0.5 * s, col(evo ? GOLD : 0xd85a5a), 0.2, 0);
      }
    } else if (bk === 'kite') {
      // 身后五个蝴蝶结（红黄相间，越往后越低）+ 一根很淡的线连到手上
      for (k = 1; k <= 5; k++) {
        a = a0 - 0.09 * k;
        FX.glow(P.pos.x + Math.cos(a) * rad, ob.y - 0.22 * k, P.pos.z + Math.sin(a) * rad, 0.32 * s, 0.26 * s, col(k % 2 ? (evo ? GOLD : 0xff6a6a) : (evo ? 0xffd060 : 0xffd040)), 0.5, 0);
      }
      var hx = P.pos.x, hy = P.pos.y + 1.2, hz = P.pos.z;
      for (k = 1; k <= 6; k++) {
        var f = k / 7;
        FX.glow(lerp(hx, ob.x, f), lerp(hy, ob.y, f) - 0.6 * f * (1 - f), lerp(hz, ob.z, f), 0.12, 0.12, col(0xc8d0da), 0.12, 0);
      }
    }
  };

  // ---------------- 投枪插地、象棋马落地、石子碎开 ----------------
  L.stick = function (w, x, y, z, r) {
    FX.ring(x, y, z, r || 2.2, w.evo ? GOLD : 0xd8c8a0, 0.3);
    FX.burst(x, y + 0.15, z, qn(w, 5), 0x8a7a5a, 3.5, 0.22);
  };
  L.hop = function (w, x, y, z, r) {
    FX.burst(x, y + 0.1, z, qn(w, 4), 0x8a7a5a, 3, 0.2);
    FX.ring(x, y, z, r || 1.4, w.evo ? GOLD : 0xd8b080, 0.25);
  };
  L.split = function (w, x, y, z) { FX.burst(x, y, z, qn(w, 3), 0x8a8a84, 4, 0.16); };

  // ---------------- 飞行中的弹丸 ----------------
  L.proj = function (p, bk, dt) {
    dt = dt || 1 / 30;
    var n;
    if (bk === 'star') {
      // 身后一串金色闪光：每帧最多 2 颗
      for (n = Math.min(2, qn(p, 22 * dt)); n > 0; n--) FX.part(p.x + rand(-0.15, 0.15), p.y + rand(-0.15, 0.15), p.z + rand(-0.15, 0.15), rand(-0.6, 0.6), rand(-0.3, 0.6), rand(-0.6, 0.6), 0xe8d060, 0.12, 0.35, 0);
    } else if (bk === 'skyrocket') {
      // 尾巴上掉金红色的火星：每帧最多 1 颗
      if (qn(p, 25 * dt) > 0) FX.part(p.x - p.vx * 0.02, p.y, p.z - p.vz * 0.02, rand(-1, 1), rand(0, 1.5), rand(-1, 1), 0xe8c040, 0.1, 0.3, 8);
    } else if (bk === 'bee') {
      if (qn(p, 3 * dt) > 0) FX.mote(p.x, p.y + 0.1, p.z, 0xe8d070, 0.08, 0.6, 0.35);
    } else if (bk === 'icicle') {
      // 第 10 块：冰棱身后掉淡蓝的霜点（大约隔一帧一颗）；全场同时最多 40 颗：到期时间记在固定的 40 个槽里
      if (qn(p, 15 * dt) > 0) {
        var now = Game.time;
        for (var k = 0; k < ICE.length; k++) {
          var s = (ICE_I + k) % ICE.length;
          if (ICE[s] > now && ICE[s] < now + 1) continue;   // 上一局留下的到期时间（Game.time 从 0 重新算）当作空槽
          ICE[s] = now + 0.5; ICE_I = (s + 1) % ICE.length;
          FX.part(p.x - p.vx * 0.02 + rand(-0.08, 0.08), p.y + rand(-0.08, 0.08), p.z - p.vz * 0.02 + rand(-0.08, 0.08), rand(-0.3, 0.3), rand(-0.2, 0.3), rand(-0.3, 0.3), 0xc8e8f8, 0.09, 0.45, 1.5);
          break;
        }
      }
    }
  };
  var ICE = new Float64Array(40), ICE_I = 0;

  // ---------------- 敌人身上的状态 ----------------
  L.status = function (e, dt) {
    if (e.mk === 'honey') {
      // 被蜂蜜粘住：头上一滴上下晃的蜂蜜（全场最多 30 个）
      if (STN >= 30) return;
      STN++;
      var top = window.Evo && Evo.topOf && e.def ? Evo.topOf(e) + 0.1 : e.y + e.r * 2.4 + 0.3;
      FX.glow(e.x, top + Math.sin(Game.time * 4 + (e.id || 0)) * 0.08, e.z, 0.35, 0.42, col(0xffb030), 0.7, 0);
    }
    // 'paint'：染色在 enemies.js 的 Enemies.render 里（读 e.mk / e.mkC / e.mkT）
  };

  // ---------------- 每把武器常驻的网格 ----------------
  var ATT = [];   // 挂着常驻网格的武器（L.tick 按它收回没人用的光墙 / 鱼线）
  L._att = ATT;
  function isRing(def) { return def.type === 'ring' || def.waveTime != null; }
  function isReel(def) { return !!def.reel || def.type === 'tether'; }
  L.attach = function (w) {
    var def = w.def, i, m;
    if (isRing(def) && !w._walls) {
      w._walls = [];
      for (i = 0; i < 3; i++) {
        m = new THREE.Mesh(wallGeo(), Weapons.auraMat(0xd8a850));
        m.frustumCulled = false; m.renderOrder = 3; m.visible = false; m._z = null; m._seen = -1;
        w._walls.push(m);
      }
    }
    if (isReel(def) && !w._lines) {
      if (!LINE_GEO) {
        LINE_GEO = new THREE.CylinderGeometry(0.015, 0.015, 1, 4, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5);
        LINE_M = new THREE.MeshBasicMaterial({ color: 0xc8d0da });
        LINE_ME = new THREE.MeshBasicMaterial({ color: 0xd8b060 });
      }
      w._lines = [];
      for (i = 0; i < 3; i++) {
        m = new THREE.Mesh(LINE_GEO, LINE_M);
        m.frustumCulled = false; m.visible = false; m._h = null; m._seen = -1;
        w._lines.push(m);
      }
    }
    if ((w._walls || w._lines) && ATT.indexOf(w) < 0) ATT.push(w);
    var sc = Weapons.scene;
    if (sc) [w._walls, w._lines].forEach(function (ls) { if (ls) for (var j = 0; j < ls.length; j++) if (!ls[j].parent) sc.add(ls[j]); });
  };
  L.detach = function (w) {
    var ai = ATT.indexOf(w);
    if (ai >= 0) ATT.splice(ai, 1);
    [w._walls, w._lines].forEach(function (ls) {
      if (!ls) return;
      for (var j = 0; j < ls.length; j++) { var m = ls[j]; m.visible = false; m._z = null; m._h = null; if (m.parent) m.parent.remove(m); }
    });
  };

  // 每帧最后：飞行中的信鸽光点；这一帧没人用的光墙、鱼线收回去；每帧的计数清零
  L.tick = function (dt) {
    tickDots(dt || 1 / 30);
    thrustGlows(dt || 0);
    for (var i = 0; i < ATT.length; i++) {
      var w = ATT[i], ls = w._walls, j;
      if (ls) for (j = 0; j < ls.length; j++) if (ls[j]._z && ls[j]._seen !== FR) { ls[j]._z = null; ls[j].visible = false; }
      ls = w._lines;
      if (ls) for (j = 0; j < ls.length; j++) if (ls[j]._h && ls[j]._seen !== FR) { ls[j]._h = null; ls[j].visible = false; }
    }
    STN = 0; HITN = 0;
    FR++;
  };

  // 常用的颜色先建好（战斗里不再新建 THREE.Color）
  [GOLD, STEEL, PALEGOLD, 0xd8dee8, 0xe04a3a, 0xe8dcd0, 0xffe2a0, 0xffd860, 0xff8a5a, 0xb8f0a8, 0xd8f8c0, 0xd85a5a,
    0xff6a6a, 0xffd040, 0xffd060, 0xc8d0da, 0xffb030].forEach(col);
})();
