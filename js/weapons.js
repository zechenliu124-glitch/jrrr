'use strict';
// ============================================================
//  武器：自动攻击
//  近战挥砍、射击（连发/瞄准/追踪/爆炸/处决）、弹跳、回旋、闪电链、
//  光环/冰霜、环绕、神盾、龙卷风、地雷、毒云、黑洞、火焰足迹、飞斧、
//  太空面条（连线）、龙息（喷火）
//  外观：命中火花、开火闪光、弹丸拖尾、贴地圆盘都走 fx.js 的批量绘制；
//  场地模型用对象池（死掉的场地把网格还回来，不反复新建网格和材质）
// ============================================================
var Weapons = { projs: [], zones: [], meshes: {}, lobs: [], zpool: {} };

var UPG_LABEL = {
  damage: ['伤害', 'flat'], count: ['弹丸', 'flat'], size: ['范围', 'pct'], pspd: ['弹速', 'pct'], duration: ['持续时间', 'sec'],
  knockback: ['击退', 'flat'], bounces: ['弹射', 'flat'], critChance: ['暴击率', 'pct'], critDmg: ['暴击伤害', 'pct']
};

Weapons.init = function (scene) {
  Weapons.scene = scene;
  buildZoneModels();
  // 魔法弹丸不受光照、颜色更亮；剑气用叠加混合发光
  var unlit = new THREE.MeshBasicMaterial({ vertexColors: true });
  var add = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  for (var k in PROJ_MODELS) {
    var geo = projGeo(k), look = PROJ_LOOK[k];
    Weapons.meshes[k] = look ? FX.instanced(geo, look === 'add' ? add : unlit, 500, scene) : MODEL.instanced(geo, 500, scene);
  }
  // 弹丸核心的光晕
  Weapons.glowC = {};
  for (k in PROJ_GLOW) Weapons.glowC[k] = { c: new THREE.Color(PROJ_GLOW[k][0]), s: PROJ_GLOW[k][1], a: PROJ_GLOW[k][2], byWeapon: !!PROJ_GLOW[k][3] };
  Weapons.tailC = {};
  Weapons.wColor = {};
  // 常用颜色（不在每帧里新建）
  var C = Weapons.C = {};
  [['white', 0xffffff], ['fuse', 0xff3a1a], ['mark', 0xff3030], ['fire', 0xff6a1a], ['mist', 0x5aff4a], ['hook', 0xc0c8d0],
    ['flail', 0xcfd6e0], ['ice', 0xdffaff], ['streak', 0xeaf4ff], ['gold', 0xffc23a], ['core', 0xffe9a0], ['ember', 0xffb030]].forEach(function (p) { C[p[0]] = new THREE.Color(p[1]); });
  // 龙息的火焰锥：嘴边白黄 → 中段橙 → 末端暗红
  Weapons.flameC = [];
  for (var i = 0; i < 7; i++) {
    var t = i / 6, c = new THREE.Color(0xfff0a0);
    if (t < 0.5) c.lerp(new THREE.Color(0xff8a1a), t * 2); else c.set(0xff8a1a).lerp(new THREE.Color(0xd8401a), (t - 0.5) * 2);
    Weapons.flameC.push(c);
  }
  // 超武流星锤的拖尾：金黄 → 橙红
  Weapons.meteorC = [0xffd23a, 0xffaa2a, 0xff8a22, 0xff6a1a].map(function (h) { return new THREE.Color(h); });
  // 飞斧：所有飞斧共用一个几何体（以前每扔一把就新建一个，从不释放）
  Weapons._axeGeo = MODEL.build(PROJ_MODELS.axe);
  Weapons.swooshMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ff, vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  Weapons.swooshGoldMat = new THREE.MeshBasicMaterial({ color: 0xffd060, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  // 黑洞的漆黑核心（紫色光环用发光精灵画）
  Weapons.holeMat = new THREE.MeshBasicMaterial({ color: 0x12061f });
  // 锁链的链环：拉长的圆环，长轴沿 z
  Weapons.linkMesh = MODEL.instanced(MODEL.build([['torus', [0.12, 0.036, 4, 8], [0, 0, 0], 0xd0d6de, [0, Math.PI / 2, 0], [1.5, 1, 1], 'metal']]), 64, scene);
  Weapons.linkMesh.visible = false;
  Weapons._lm = new THREE.Matrix4(); Weapons._lq = new THREE.Quaternion(); Weapons._lq2 = new THREE.Quaternion(); Weapons._lr = new THREE.Quaternion();
  Weapons._la = new THREE.Vector3(); Weapons._lb = new THREE.Vector3(); Weapons._lup = new THREE.Vector3(0, 1, 0); Weapons._ls = new THREE.Vector3(1, 1, 1);
  Weapons._lr.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
  Weapons._lc = new THREE.Color();
};

Weapons.clear = function () {
  Weapons.projs = [];
  Weapons.zones.forEach(Weapons.freeZone);
  Weapons.zones = [];
  Weapons.lobs = [];
  for (var k in Weapons.meshes) { Weapons.meshes[k].count = 0; Weapons.meshes[k].visible = false; }
  if (Weapons.linkMesh) { Weapons.linkMesh.count = 0; Weapons.linkMesh.visible = false; }
};

// 场地模型的对象池：key 区分种类（超武的单独一池，它们换过金色几何体）
Weapons.takeMesh = function (key, make) {
  var L = Weapons.zpool[key] || (Weapons.zpool[key] = []), m = L.pop();
  if (!m) { m = make(); m.userData.pk = key; m.frustumCulled = false; Weapons.scene.add(m); }
  m.visible = true;
  return m;
};
Weapons.dropMesh = function (m) {
  if (!m) return;
  m.visible = false;
  var L = Weapons.zpool[m.userData.pk] || (Weapons.zpool[m.userData.pk] = []);
  if (L.indexOf(m) < 0) L.push(m);
};
Weapons.freeZone = function (z) {
  Weapons.dropMesh(z.mesh); Weapons.dropMesh(z.swoosh);
  z.mesh = null; z.swoosh = null;
};

// 武器颜色（缓存成 THREE.Color；超武的颜色单独缓存）
Weapons.colorOf = function (w) {
  var cache = w.def.evo ? (Weapons.wColorEvo || (Weapons.wColorEvo = {})) : Weapons.wColor;
  var c = cache[w.id];
  if (!c) c = cache[w.id] = new THREE.Color(w.def.color || 0xffffff);
  return c;
};

// 开火闪光的颜色：武器颜色往白色靠一半
Weapons.muzzleHex = function (w) {
  var cache = Weapons._muz || (Weapons._muz = {}), key = w.id + (w.def.evo ? '@' : ''), h = cache[key];
  if (h === undefined) h = cache[key] = w.def.evo ? 0xfff0b0 : FX.mixHex(w.def.color || 0xffffff, 0xffffff, 0.5);
  return h;
};

// 超武的弹丸种类叫 'kind@武器id'：按原来的种类做特殊处理（香蕉平转、盾牌缩小等）
Weapons.baseKind = function (kind) {
  var c = Weapons._bk || (Weapons._bk = {}), b = c[kind];
  if (b === undefined) { var at = typeof kind === 'string' ? kind.indexOf('@') : -1; b = c[kind] = at > 0 ? kind.slice(0, at) : kind; }
  return b;
};

// 拖尾参数（按弹丸种类缓存）：超武的拖尾更长、金色（保留本色的超武用本色）
Weapons.tailOf = function (kind) {
  var T = Weapons.tailC, t = T[kind];
  if (t !== undefined) return t;
  var bk = Weapons.baseKind(kind), d = PROJ_TAIL[bk];
  if (!d) { T[kind] = null; return null; }
  if (bk === kind) t = { c: new THREE.Color(d[0]), T: d[1], w: d[2], back: !!d[3], ca: 0.3 };
  else {
    var wid = kind.slice(kind.indexOf('@') + 1), keep = window.Evo && Evo.HUE && Evo.HUE[wid];
    t = { c: new THREE.Color(keep ? d[0] : (window.Evo ? Evo.GOLD : 0xffc23a)), T: d[1] * 1.6, w: d[2] * 1.15, back: false, ca: 0.45 };
  }
  return (T[kind] = t);
};

// ---------------- 光环外观 ----------------
// 单位半径的几何体：外圈像素锯齿环（kind 0 外半圈 / 3 内半圈）、竖直光墙（kind 1）、内圈细环（kind 2）
// fine：大光环用更细的格子（外圈在世界里不会变成一条粗带子）
Weapons.auraGeo = function (fine) {
  var key = fine ? '_auraGeoF' : '_auraGeo';
  if (Weapons[key]) return Weapons[key];
  var pos = [], kind = [], ang = [], N = fine ? 112 : 64, cs = 2.4 / N, v;
  var addCells = function (rad, half, inner) {
    FX.pixelRingCells(N, rad - half, rad + half).forEach(function (c) {
      var x0 = c[0] - c[2], x1 = c[0] + c[2], z0 = c[1] - c[2], z1 = c[1] + c[2];
      var a = Math.atan2(c[1], c[0]);
      if (a < 0) a += TAU;
      var k = inner ? 2 : (Math.sqrt(c[0] * c[0] + c[1] * c[1]) < rad ? 3 : 0);
      pos.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
      for (v = 0; v < 6; v++) { kind.push(k); ang.push(a); }
    });
  };
  addCells(1, cs * 0.95, false);
  addCells(0.6, cs * 0.5, true);
  var S = 96, r = 1 + cs * 0.5;
  for (var i = 0; i < S; i++) {
    var a0 = i / S * TAU, a1 = (i + 1) / S * TAU;
    var c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
    pos.push(c0, 0, s0, c1, 0, s1, c1, 1, s1, c0, 0, s0, c1, 1, s1, c0, 1, s0);
    ang.push(a0, a1, a1, a0, a1, a0);
    for (v = 0; v < 6; v++) kind.push(1);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
  g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
  Weapons[key] = g;
  return g;
};

// 顶点着色器：按半径缩放；圆周上 24 个点的地面高度插值，让光环贴着坡面
Weapons.AURA_VS = [
  'uniform float uR;',
  'uniform float uHgt;',
  'uniform float uH[24];',
  'attribute float aKind;',
  'attribute float aAng;',
  'varying float vKind;',
  'varying float vAng;',
  'varying float vV;',
  'float groundH(float a) {',
  '  float f = a / 6.2831853 * 24.0;',
  '  float i0 = floor(f);',
  '  float k0 = mod(i0, 24.0), k1 = mod(i0 + 1.0, 24.0);',
  '  float h0 = 0.0, h1 = 0.0;',
  '  for (int i = 0; i < 24; i++) {',
  '    float fi = float(i);',
  '    if (abs(fi - k0) < 0.5) h0 = uH[i];',
  '    if (abs(fi - k1) < 0.5) h1 = uH[i];',
  '  }',
  '  return mix(h0, h1, f - i0);',
  '}',
  'void main() {',
  '  vKind = aKind; vAng = aAng; vV = position.y;',
  '  float rf = length(position.xz);',
  '  vec3 p = vec3(position.x * uR, groundH(aAng) * rf, position.z * uR);',
  '  if (aKind > 0.5 && aKind < 1.5) p.y += position.y * uHgt - 0.15;',
  '  else p.y += 0.06;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);',
  '}'
].join('\n');

// 片元着色器输出预乘透明度：圆环几乎不透明，光墙 alpha 为 0 等于纯叠加发光；内圈是一条安静的细线
// 靠镜头这一侧的圆弧和光墙变淡（大光环跑到镜头下面时不会变成屏幕底部的一条粗带子）
Weapons.AURA_FS = [
  'uniform vec3 uCol;',
  'uniform float uTime;',
  'uniform float uPulse;',
  'uniform float uCamAng;',
  'varying float vKind;',
  'varying float vAng;',
  'varying float vV;',
  'float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }',
  'void main() {',
  '  vec4 o;',
  '  if (vKind < 0.5 || vKind > 2.5) {',
  '    vec3 c = vKind > 2.5 ? mix(uCol, vec3(1.0), 0.55) : uCol;',
  '    c = mix(c, vec3(1.0), uPulse * 0.5);',
  '    o = vec4(c * 0.95, 0.95);',
  '  } else if (vKind < 1.5) {',
  '    float col = floor(vAng / 6.2831853 * 96.0 + uTime * 5.0);',
  '    float s = 0.4 + 0.6 * hash(col);',
  '    float v = floor((1.0 - vV) * 6.0 + 0.5) / 6.0;',
  '    o = vec4(uCol * (0.95 * v * s * (1.0 + uPulse)), 0.0);',
  '  } else {',
  '    o = vec4(mix(uCol, vec3(1.0), 0.3) * 0.35, 0.35);',
  '  }',
  '  o *= 1.0 - 0.6 * smoothstep(0.3, 0.95, cos(vAng - uCamAng));',
  '  gl_FragColor = o;',
  '}'
].join('\n');

Weapons.auraMat = function (color) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uR: { value: 3.6 }, uHgt: { value: 0.8 }, uTime: { value: 0 }, uPulse: { value: 0 }, uCamAng: { value: 0 }, uH: { value: new Float32Array(24) } },
    vertexShader: Weapons.AURA_VS, fragmentShader: Weapons.AURA_FS,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
  });
};

// 镜头在玩家的哪个方向（光环着色器里 atan2(z, x) 的角度）
Weapons.camAng = function () {
  var c = Game.camera ? Game.camera.position : null;
  return c ? Math.atan2(c.z - P.pos.z, c.x - P.pos.x) : -Math.PI / 2;
};

// 每帧：跟着玩家，采样地面高度，跳伤时闪一下，冒几颗小光点
Weapons.auraLook = function (w, r, dt) {
  var m = w.ring, u = m.material.uniforms;
  var base = Math.max(W.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.5), P.pos.y - 3);
  m.position.set(P.pos.x, base, P.pos.z);
  var g = Weapons.auraGeo(r > 6.5);
  if (m.geometry !== g) m.geometry = g;
  u.uR.value = r;
  u.uHgt.value = 0.55 + 0.25 * Math.min(2, r / 3.6);
  u.uTime.value = Game.time;
  u.uCamAng.value = Weapons.camAng();
  w.pulse = Math.max(0, (w.pulse || 0) - dt * 4);
  u.uPulse.value = w.pulse;
  var H = u.uH.value;
  for (var i = 0; i < 24; i++) {
    var a = i / 24 * TAU;
    H[i] = clamp(W.groundAt(P.pos.x + Math.cos(a) * r, P.pos.z + Math.sin(a) * r, base + 1) - base, -1.2, 1.2);
  }
  if (Math.random() < dt * 9) {
    var ma = Math.random() * TAU, mr = Math.sqrt(Math.random()) * r;
    FX.mote(P.pos.x + Math.cos(ma) * mr, base + 0.15, P.pos.z + Math.sin(ma) * mr, w.def.freeze ? 0xdcfaff : 0xeef6ff, 0.09, rand(0.9, 1.7), rand(0.6, 1.1));
  }
};

Weapons.give = function (id) {
  var def = WEAPONS[id];
  var s = {};
  for (var k in def.base) s[k] = def.base[k];
  var w = { id: id, def: def, level: 1, s: s, timer: 0.3, kills: 0, dmg: 0, charges: 0 };
  P.weapons.push(w);
  Weapons.attach(w);
  return w;
};

// 常驻视觉（光环圈、锁链芯线）挂到场景上；换关时重新挂
Weapons.attach = function (w) {
  var def = w.def;
  if (def.type === 'aura' && !w.ring) {
    // 圣光：浅蓝；冰霜：更冷的青色
    w.ring = new THREE.Mesh(Weapons.auraGeo(), Weapons.auraMat(def.freeze ? 0x9ff6ff : 0x8dbef8));
    w.ring.frustumCulled = false;
    w.ring.renderOrder = 3;
  }
  if (def.type === 'tether' && !w.beam) {
    // 锁链中间一根细细的深色芯线，链环用实例化网格画；芯线几何体共用（重开一局不会再多一个）
    var bg = Weapons.tetherGeo || (Weapons.tetherGeo = new THREE.CylinderGeometry(0.035, 0.035, 1, 5, 1, true).rotateX(Math.PI / 2).translate(0, 0, 0.5));
    w.beam = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0x4a4e58 }));
    w.beam.visible = false;
  }
  [w.ring, w.ring2, w.beam].forEach(function (m) { if (m && !m.parent) Weapons.scene.add(m); });
};

Weapons.detach = function (w) {
  [w.ring, w.ring2, w.beam].forEach(function (m) { if (m && m.parent) m.parent.remove(m); });
};

Weapons.find = function (id) {
  for (var i = 0; i < P.weapons.length; i++) if (P.weapons[i].id === id) return P.weapons[i];
  return null;
};

// ---------------- 升级 ----------------
// 普通稀有度随机 1~2 项，更高稀有度 2 项；铁砧有几率多 1 项
Weapons.rollUpgrade = function (w, rarity) {
  var keys = Object.keys(w.def.up);
  var n = rarity === 0 ? (Math.random() < 0.5 ? 1 : 2) : 2;
  var anvils = P.items.anvil || 0;
  if (anvils && Math.random() < 1 - Math.pow(0.5, anvils)) n++;
  var picks = [];
  while (picks.length < n && keys.length) {
    var k = keys.splice(Math.floor(Math.random() * keys.length), 1)[0];
    picks.push({ stat: k, v: w.def.up[k] * RARITY_MULT[rarity] });
  }
  return picks;
};

Weapons.applyUpgrade = function (w, picks) {
  w.level++;
  picks.forEach(function (p) { w.s[p.stat] = (w.s[p.stat] || 0) + p.v; });
};

Weapons.upgradeText = function (p) {
  var l = UPG_LABEL[p.stat];
  var v = p.v;
  if (l[1] === 'pct') return '+' + Math.round(v * 100) + '% ' + l[0];
  if (l[1] === 'sec') return '+' + (Math.round(v * 100) / 100) + ' 秒' + l[0];
  return '+' + (Math.round(v * 10) / 10) + ' ' + l[0];
};

// ---------------- 派生数值 ----------------
Weapons.cd = function (w) { return w.s.cd / P.st.atkSpeed; };
Weapons.count = function (w) { return Math.max(1, Math.floor((w.s.count || 1) + P.st.quantity + 1e-6)); };
Weapons.size = function (w) { return (w.s.size || 1) * P.st.size; };
Weapons.dur = function (w) { return (w.s.duration || 1) * P.st.duration; };
Weapons.speed = function (w) { return (w.def.speed || 20) * (w.s.pspd || 1) * P.st.projSpeed; };
Weapons.kb = function (w) { return (w.s.knockback || 0) * P.st.knockback * 3; };

// 命中时几率效果：超能台灯给每个效果额外再判定一次
function proc(chance) {
  if (Math.random() < chance) return true;
  return (P.items.lamp || 0) > 0 && Math.random() < chance;
}

// 命中火花：[星光大小, 星光颜色, 碎屑数, 碎屑颜色]（光环、毒云这类跳伤和爆炸没有；每帧最多 FX.SPARK_CAP 个）
Weapons.SPARK = {
  sword: [0.7, 0xffffff, 2, 0xdfe6ee], katana: [0.6, 0xffffff, 1, 0xff4a6a], corrupted: [0.7, 0xe8c8ff, 3, 0xb04aff],
  herosword: [0.7, 0xffffff, 2, 0x9fd8ff], scythe: [0.7, 0xffffff, 2, 0xa6a6c8],
  revolver: [0.5, 0xffffff, 1, 0xffe0a0], bone: [0.8, 0xffffff, 2, 0xf3ead0], bow: [0.6, 0xffffff, 2, 0xf4f0e0],
  dagger: [0.6, 0xaaffe6, 2, 0x7affd0], sniper: [0.9, 0xffffff, 3, 0x8a5a2a], dexe: [0.8, 0xffffff, 2, 0xc8c8d8],
  bloodmagic: [0.7, 0xff6a78, 4, 0x8a0a1a], dice: [0.7, 0xffffff, 2, 0xffffff], banana: [0.7, 0xfff0a0, 2, 0xffe14a],
  chunkers: [0.9, 0xffffff, 3, 0x8a8a94], axe: [0.7, 0xd8e0e8, 1, 0xb0b8c0], shotgun: [0.6, 0xfff0d0, 2, 0xc8a070]
};

Weapons.hitFx = function (w, e) {
  var sp = Weapons.SPARK[w.id];
  if (!sp) return;
  var evo = w.def.evo;
  var ok = FX.spark(e.x, e.y + e.r, e.z, sp[0] * (evo ? 1.25 : 1), evo ? 0xffd870 : sp[1], sp[2], evo && w.id !== 'bloodmagic' ? 0xffd23a : sp[3], w.id === 'chunkers' ? 0.26 : 0.2);
  if (ok && w.id === 'bloodmagic') FX.ring(e.x, e.y, e.z, 0.8, 0xd9233a, 0.25);
};

// 一次命中：计算各种加成、暴击（含超级暴击）、命中时效果
Weapons.hit = function (w, e, mult, kx, kz, opts) {
  if (!e.alive) return 0;
  var d = (w.s.damage || 0) * (mult || 1) * P.st.damage * Passive.dmgMult(e);
  if (P.items.glasses && e.hp > e.maxHp * 0.9) d *= 1 + 0.25 * P.items.glasses;
  if (P.items.knuckles && dist2(e.x, e.z, P.pos.x, P.pos.z) < 36) d *= 1 + 0.2 * P.items.knuckles;
  if (P.items.speedboi && P.hp < P.st.maxHp * 0.5) d *= 2;
  if (e.elite || e.boss || e.mini) d *= 1 + (P.st.eliteDmg || 0);
  if (e.marked > 0) d *= 2;
  if (P.rage > 0) d *= 2;
  var cc = P.st.critChance + (w.s.critChance || 0);
  var cm = P.st.critDmg + (w.s.critDmg || 0);
  var crit = 0;
  if (Math.random() < cc) {
    crit = 1;
    d *= cm;
    if (cc > 1 && Math.random() < cc - 1) d *= cm;           // 暴击率超过 100%：再暴击一次
    if (P.items.fork && Math.random() < 1 - Math.pow(0.86, P.items.fork)) { crit = 2; d *= 2; }   // 超大暴击
  }
  var kb = Weapons.kb(w);
  // 大棒槌：几率造成 20 倍的 BONK
  if (P.items.bigbonk && proc(0.02 * P.items.bigbonk)) {
    d *= 20; kb *= 6; crit = 2;
    FX.text(e.x, e.y + e.r * 2 + 1.2, e.z, 'BONK!', '#ff3030', 1.8);
    Game.shake(0.2);
  }
  var dealt = Enemies.damage(e, d, crit, (kx || 0) * kb, (kz || 0) * kb, opts);
  if (dealt > 0 && !(opts && opts.quiet) && !FX.tickDmg) Weapons.hitFx(w, e);
  // 击退带一点向上的力，把小怪打飞
  if (kb > 4 && !e.boss && !e.mini && !e.def.flyer && e.grounded && Math.random() < 0.5) { e.vy = Math.min(8, kb * 0.6); e.grounded = false; }
  w.dmg += dealt;
  // 命中时效果
  if (e.alive) {
    if (w.def.execute && !e.boss && !e.mini && proc(w.def.execute)) {
      // 断头巨刃处决：金色 + 红色的叉形闪光
      if (w.def.evo) { FX.flash(e.x, e.y + e.r * 1.2, e.z, 1.8, 0xffc23a, 0.18, 3); FX.flash(e.x, e.y + e.r * 1.2, e.z, 1.2, 0xff3030, 0.18, 2); }
      Enemies.damage(e, e.hp + 1, 2, 0, 0, { text: '处决' });
    }
    if (P.items.cheese && proc(0.4)) Enemies.applyDot(e, Math.max(2, d * 0.15), 3);
    if (P.items.icecube && proc(0.2)) e.frozen = Math.max(e.frozen, 1.5);
    if (P.items.snek) { e.poisonStacks = (e.poisonStacks || 0) + 4 * P.items.snek; Enemies.applyDot(e, Math.max(2, d * 0.05) * e.poisonStacks, 3); if (proc(0.05)) { Enemies.damage(e, d * 0.2 * e.poisonStacks, 1, 0, 0); e.poisonStacks = 0; } }
    if (P.items.dragonfire && proc(0.15)) Weapons.fireZone(e.x, e.z, d * 0.3);
  }
  if (crit && P.items.demonblade && proc(0.25)) P.heal(1);
  if (!e.alive) {
    w.kills++;
    if (w.id === 'bloodmagic' && Math.random() < 0.05) P.addMod('maxHp', 1);
  }
  if (w.evo && window.Evo) Evo.onHit(w, e, dealt, mult || 1, kx, kz);   // 超武命中特性（evolution.js）
  return dealt;
};

Weapons.origin = function () { return { x: P.pos.x, y: P.pos.y + 1.1, z: P.pos.z }; };

// 准星方向（镜头朝向）
Weapons.aimDir = function () {
  var cp = Math.cos(P.pitch * 0.6);
  return { x: Math.sin(P.yaw) * cp, y: -Math.sin(P.pitch * 0.6) + 0.12, z: Math.cos(P.yaw) * cp };
};

// ---------------- 主循环 ----------------
Weapons.update = function (dt) {
  FX.tickDmg = false;
  for (var i = 0; i < P.weapons.length; i++) {
    var w = P.weapons[i];
    var type = w.def.type;
    if (type === 'aura' || type === 'orbit' || type === 'aegis' || type === 'trail' || type === 'tether' || type === 'flame') {
      Weapons.updatePersistent(w, dt);
      continue;
    }
    w.timer -= dt;
    if (w.timer <= 0) w.timer = Weapons.fire(w) ? Weapons.cd(w) : 0.15;
  }
  Weapons.updateProjs(dt);
  Weapons.updateZones(dt);
  Weapons.render(dt);
};

Weapons.RANGE = 32;

Weapons.fire = function (w) {
  var def = w.def, o = Weapons.origin(), n = Weapons.count(w), i;
  switch (def.type) {
    case 'melee': {
      var t = Enemies.nearest(o.x, o.z, 9 * Weapons.size(w));
      if (!t && def.id !== 'scythe') return false;
      var ang = t ? Math.atan2(t.x - o.x, t.z - o.z) : P.facing;
      for (i = 0; i < n; i++) Weapons.swing(w, ang + (i % 2 ? 0.5 : -0.5) * (i > 0 ? 1 : 0), i * 0.12);
      return true;
    }
    case 'shot': case 'bounce': case 'boomerang': {
      if (def.aimed) {
        var ad = Weapons.aimDir();
        for (i = 0; i < n; i++) {
          var sp = (i - (n - 1) / 2) * 0.06;
          Weapons.launch(w, o, null, Math.atan2(ad.x, ad.z) + sp, ad.y);
        }
        return true;
      }
      var targets = Enemies.nearestN(o.x, o.z, Weapons.RANGE, def.burst ? 1 : n);
      if (!targets.length) return false;
      if (def.burst) {
        // 左轮：连发
        for (i = 0; i < n; i++) Game.later(i * 0.07, function () {
          var oo = Weapons.origin(), tt = Enemies.nearest(oo.x, oo.z, Weapons.RANGE);
          if (tt) Weapons.launch(w, oo, tt, Math.atan2(tt.x - oo.x, tt.z - oo.z) + rand(-0.05, 0.05));
        });
        return true;
      }
      for (i = 0; i < n; i++) {
        var tg = targets[i % targets.length];
        var a = Math.atan2(tg.x - o.x, tg.z - o.z) + (i >= targets.length ? rand(-0.4, 0.4) : 0);
        Weapons.launch(w, o, tg, a);
      }
      return true;
    }
    case 'shotgun': {
      var dir = Weapons.aimDir(), base = Math.atan2(dir.x, dir.z);
      var mult = 1 + (n - 1) * 0.35;
      for (i = 0; i < 7; i++) Weapons.launch(w, o, null, base + (i - 3) * 0.09 + rand(-0.03, 0.03), dir.y + rand(-0.05, 0.05), mult);
      Weapons.shotgunFan(w, o, dir, base);
      return true;
    }
    case 'chain': {
      var ts = Enemies.nearestN(o.x, o.z, Weapons.RANGE, n);
      if (!ts.length) return false;
      ts.forEach(function (tt2, k) { Game.later(k * 0.06, function () { Weapons.chain(w, tt2, Math.round(w.s.bounces || 0)); }); });
      return true;
    }
    case 'axe': {
      var ta = Enemies.nearestN(o.x, o.z, Weapons.RANGE, n);
      if (!ta.length) return false;
      for (i = 0; i < n; i++) Weapons.throwAxe(w, ta[i % ta.length], i);
      return true;
    }
    case 'tornado': case 'mine': case 'puddle': case 'blackhole': {
      if (def.type !== 'mine' && def.type !== 'tornado' && !Enemies.nearest(o.x, o.z, Weapons.RANGE)) return false;
      for (i = 0; i < n; i++) Weapons.spawnZone(w, i);
      return true;
    }
  }
  return false;
};

// 散射弩：枪口一道扇形的光（看得出这一排箭覆盖多宽）+ 三团小闪光
Weapons.shotgunFan = function (w, o, dir, base) {
  var evo = w.def.evo, fx = Math.sin(base), fz = Math.cos(base);
  var cx = o.x + fx * 1.2, cy = o.y + dir.y * 1.2 + 0.15, cz = o.z + fz * 1.2;
  var kind = evo ? 'slash1.3' : 'slash0.9';
  FX.spawn(kind, evo ? 0xffd84a : 0xffe2a0, { x: cx, y: cy, z: cz, s0: 1.4, s1: 3.2, life: 0.13, a0: 0.95, ry: base });
  if (evo) {
    FX.spawn('slashT1.3', 0xffffff, { x: cx, y: cy + 0.01, z: cz, s0: 1.3, s1: 3.0, life: 0.11, a0: 0.85, ry: base });
    FX.ring(o.x, P.pos.y, o.z, 1.6, 0xffc23a, 0.18);
  }
  for (var k = -1; k <= 1; k++) {
    var a = base + k * 0.27, d = 2.6;
    FX.flash(o.x + Math.sin(a) * d, cy, o.z + Math.cos(a) * d, 0.9, evo ? 0xffe28a : 0xffd890, 0.09, 0);
  }
};

// ---------------- 近战 ----------------
// 斩击外观：细剑是细而亮的刀光加白芯，腐化之剑底下压一层深紫色
Weapons.SLASH_LOOK = {
  katana: { thin: true, core: true },
  corrupted: { under: 0x2a0a3a, underA: 0.45 }
};
// 超武：腐化之剑保留紫色刀光（金色只做外弧）
Weapons.SLASH_LOOK_EVO = {
  katana: { thin: true, core: true },
  corrupted: { under: 0x2a0a3a, underA: 0.5, mainHex: 0xc870ff, goldOuter: 0xffc23a }
};

Weapons.swing = function (w, ang, delay) {
  var def = w.def;
  var go = function () {
    var size = Weapons.size(w);
    var r = (def.range || 4) * size, arc = def.arc || 2;
    var o = Weapons.origin();
    var dirs = def.back ? [ang, ang + Math.PI] : [ang];
    var mult = 1;
    if (def.lowHp) { var f = 1 - P.hp / P.st.maxHp; mult = 1 + f * 1.5; if (P.hp < P.st.maxHp * 0.3) mult *= 2; }
    var look = (def.evo ? Weapons.SLASH_LOOK_EVO : Weapons.SLASH_LOOK)[w.id] || null;
    // 连砍好几下时地上的环只画第一下的
    var ringOk = !(Game.time - (w.ringT || -9) < 0.3);
    if (arc > 4 && ringOk) w.ringT = Game.time;
    dirs.forEach(function (a) {
      if (arc > 4) FX.sweep(o.x, P.pos.y, o.z, r, a, def.color, def.evo, ringOk);
      else {
        // 往镜头这边砍的刀光（双向斩的后半刀）淡一点、小一点：不会糊满屏幕下半部分
        FX.slashA = Math.cos(a - P.yaw) < -0.3 ? 0.45 : 1;
        FX.slash(o.x, P.pos.y, o.z, r, a, def.color, arc, def.evo, look);
        FX.slashA = 1;
      }
      var first = null, fd = 1e9;
      Enemies.inRadius(o.x, o.z, r, function (e) {
        var ea = Math.atan2(e.x - o.x, e.z - o.z);
        var diff = Math.abs(((ea - a + Math.PI) % TAU + TAU) % TAU - Math.PI);
        if (diff > arc / 2 && dist2(o.x, o.z, e.x, e.z) > 2.2) return;
        if (Math.abs(e.y + e.r - o.y) > r + e.r) return;
        var d2 = dist2(o.x, o.z, e.x, e.z);
        if (d2 < fd) { fd = d2; first = e; }
        Weapons.hit(w, e, mult, Math.sin(a), Math.cos(a));
      });
      // 细剑：最近的那个敌人身上一个白色的叉形闪光
      if (first && w.id === 'katana') {
        FX.flash(first.x, first.y + first.r, first.z, 0.9, 0xffffff, 0.1, 3);
        FX.flash(first.x, first.y + first.r, first.z, 0.7, def.evo ? 0xffd23a : 0xff6a88, 0.1, 2);
      }
      // 断罪圣剑：刀光正中一颗大大的圣光十字星
      if (def.evo && w.id === 'sword') FX.flash(o.x + Math.sin(a) * r * 0.92, P.pos.y + 1.05, o.z + Math.cos(a) * r * 0.92, 3, 0xfff0b8, 0.15, 2);
    });
    if (def.heroProj) {
      var t = Enemies.nearest(o.x, o.z, Weapons.RANGE);
      Weapons.launch(w, o, t, ang, 0, 1, { kind: 'wave', pierce: 99, life: 0.9, r: 1.2 * size });
    }
  };
  if (delay > 0) Game.later(delay, go); else go();
};

// ---------------- 弹丸 ----------------
Weapons.launch = function (w, o, t, ang, vyDir, dmgMult, over) {
  var def = w.def, sp = Weapons.speed(w), size = Weapons.size(w);
  var dx = Math.sin(ang), dz = Math.cos(ang);
  var vy;
  if (vyDir != null) vy = vyDir * sp;
  else if (t) { var hd = Math.sqrt(dist2(o.x, o.z, t.x, t.z)) || 1; vy = (t.y + t.r - o.y) / hd * sp; }
  else vy = 0;
  var p = {
    w: w, kind: (!def.evo && PROJ_BY_WEAPON[w.id]) || def.proj, x: o.x, y: o.y, z: o.z, vx: dx * sp, vy: vy, vz: dz * sp,
    r: (def.projR || 0.5) * size, life: (def.life || 1.6) * (w.s.duration && def.type === 'shot' && def.homing ? Weapons.dur(w) : 1),
    pierce: Math.round(w.s.pierce || 0), bounces: Math.round(w.s.bounces || 0),
    hit: new Set(), t: 0, spin: def.spin || 0, grav: 0, scale: size, dmgMult: dmgMult || 1, homing: def.homing || 0, explode: !!def.explode
  };
  if (def.type === 'bounce') { p.grav = 16; p.vy = 6; p.life = 3; }
  if (def.type === 'boomerang') { p.boom = true; p.out = (def.out || 14) * Math.sqrt(size); p.ox = o.x; p.oz = o.z; p.pierce = 999; p.life = 4; }
  if (def.dice) { p.face = randi(1, 6); p.dmgMult *= p.face; }
  if (over) for (var k in over) p[k] = over[k];
  if (def.type === 'shotgun') p.tk = 1.8;   // 散射弩的短箭飞不远：拖尾拉长一点，看得出扇面
  Weapons.projs.push(p);
  // 开火闪光（分裂碎片和剑气不算）
  if (!w.frag && !(over && over.kind === 'wave')) Weapons.muzzle(w, p, o, dx, dz, sp ? vy / sp : 0, size);
  return p;
};

// 开火：枪口一颗四角星；重弩更大还震一下屏，并且画一道弹道（在第一次绘制时按最终的速度方向画）
Weapons.muzzle = function (w, p, o, dx, dz, dy, size) {
  var def = w.def;
  if (w.id === 'sniper') { p.trc = true; p.ox0 = o.x + dx * 0.8; p.oy0 = o.y + dy * 0.8; p.oz0 = o.z + dz * 0.8; }
  if (w.id === 'shotgun' || (w._muzT === Game.time && !def.burst)) return;
  w._muzT = Game.time;
  if (w.id === 'sniper') {
    FX.flash(o.x + dx * 0.8, o.y + dy * 0.8, o.z + dz * 0.8, 1.2, def.evo ? 0xffe9a0 : 0xfff0c8, 0.08, 2);
    if (def.evo) FX.ring(o.x, P.pos.y, o.z, 1.2, window.Evo ? Evo.GOLD : 0xffc23a, 0.15);
    Game.shake(0.05);
  } else if (def.burst) FX.flash(o.x + dx * 0.7, o.y + dy * 0.7, o.z + dz * 0.7, 0.6, Weapons.muzzleHex(w), 0.06, 2);
  else FX.flash(o.x + dx * 0.7, o.y + dy * 0.7, o.z + dz * 0.7, 0.8 * Math.min(2, size), Weapons.muzzleHex(w), 0.08, 2);
};

// 弹道光带的终点：沿方向每 3 米看一次地面，最远 39 米
Weapons.tracerEnd = function (x, y, z, vx, vy, vz, out) {
  var s = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1, ux = vx / s, uy = vy / s, uz = vz / s, d = 3;
  for (; d <= 39; d += 3) if (y + uy * d < W.groundAt(x + ux * d, z + uz * d, y + uy * d + 1)) break;
  d = Math.min(d, 39);
  out.x = x + ux * d; out.y = y + uy * d; out.z = z + uz * d;
  return out;
};

Weapons.updateProjs = function (dt) {
  var ps = Weapons.projs;
  Weapons.dustN = 0;
  for (var i = ps.length - 1; i >= 0; i--) {
    var p = ps[i];
    p.t += dt;
    p.life -= dt;
    if (p.sq > 0) p.sq -= dt;
    // 拖尾：记下最近 3 帧的位置（真实的飞行路线：追踪的弯、弹射的折线都看得出来）
    if (p.tr === undefined) p.tr = Weapons.tailOf(p.kind) ? new Float32Array(9) : null;
    if (p.tr) {
      var h = p.tr;
      h[6] = h[3]; h[7] = h[4]; h[8] = h[5]; h[3] = h[0]; h[4] = h[1]; h[5] = h[2]; h[0] = p.x; h[1] = p.y; h[2] = p.z;
      p.tn = Math.min(3, (p.tn || 0) + 1);
    }
    if (p.homing) {
      var ht = Enemies.nearest(p.x, p.z, 16, p.hit);
      if (ht) {
        var hx = ht.x - p.x, hy = ht.y + ht.r - p.y, hz = ht.z - p.z, hd = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        var k = Math.min(1, dt * p.homing);
        p.vx = lerp(p.vx, hx / hd * sp, k); p.vy = lerp(p.vy, hy / hd * sp, k); p.vz = lerp(p.vz, hz / hd * sp, k);
      }
    }
    if (p.boom) {
      var od = Math.sqrt(dist2(p.x, p.z, p.ox, p.oz));
      if (!p.back && od > p.out) { p.back = true; p.hit.clear(); }
      if (p.back) {
        var bx = P.pos.x - p.x, bz = P.pos.z - p.z, bd = Math.sqrt(bx * bx + bz * bz) || 1;
        var bs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
        p.vx = lerp(p.vx, bx / bd * bs, Math.min(1, dt * 6)); p.vz = lerp(p.vz, bz / bd * bs, Math.min(1, dt * 6));
        p.vy = (P.pos.y + 1.1 - p.y) * 4;
        if (bd < 1.4) p.life = 0;
      }
    }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    var gy = W.groundAt(p.x, p.z, p.y + 1);
    if (p.y < gy + 0.15) {
      if (p.explode) { Weapons.explode(p); p.life = 0; }
      else if (p.grav && p.bounces >= 0) {
        p.y = gy + 0.15; p.vy = Math.abs(p.vy) * 0.6 + 4;
        p.sq = 0.06;
        if (Weapons.dustN < 6) { Weapons.dustN++; FX.burst(p.x, gy + 0.1, p.z, 2, 0x8a7a5a, 2, 0.16); }
      }
      else if (!p.boom && !p.homing) {
        p.y = gy + 0.15; p.vy = 0;
        if (!p.dusted && p.w && p.w.id === 'shotgun' && Weapons.dustN < 6) { p.dusted = true; Weapons.dustN++; FX.burst(p.x, gy + 0.1, p.z, 3, 0x8a7a5a, 2.5, 0.2); }
      }
      else if (p.homing) p.y = gy + 0.15;
    }
    // 弹射以后目标没了、一路往天上飞的弩箭：飞到离地 10 米以上就收掉（不会在山顶上空留下乱飞的亮点）
    if ((p.bnc || p.frag) && p.vy > 0 && p.y - gy > 10) p.life = 0;
    if (p.life <= 0) {
      if (p.w && p.w.id === 'shotgun' && !p.dusted && Weapons.dustN < 6) { Weapons.dustN++; FX.burst(p.x, Math.max(gy, p.y - 0.5) + 0.1, p.z, 3, 0x8a7a5a, 2.5, 0.2); }
      ps.splice(i, 1);
      continue;
    }
    Enemies.hash.query(p.x, p.z, p.r + 3, function (e) {
      if (!e.alive || p.hit.has(e.id)) return;
      var dx = e.x - p.x, dz = e.z - p.z, rr = p.r + e.r;
      if (dx * dx + dz * dz > rr * rr) return;
      if (Math.abs(p.y - (e.y + e.r)) > e.r + p.r + 0.7) return;
      p.hit.add(e.id);
      if (p.explode) { Weapons.explode(p); p.life = 0; return false; }
      var s2 = Math.sqrt(p.vx * p.vx + p.vz * p.vz) || 1;
      if (p.soul) Enemies.damage(e, p.soulDmg, 0, p.vx / s2, p.vz / s2);
      else Weapons.hit(p.w, e, p.dmgMult, p.vx / s2, p.vz / s2);
      if (p.spin && p.grav) p.sq = 0.06;   // 骨头砸中：压扁一下
      if (p.face === 6 && !p.sixed) {
        p.sixed = true; p.w.s.critChance = (p.w.s.critChance || 0) + 0.005;
        FX.text(e.x, e.y + 2.5, e.z, '6!', '#ffd84a', 1.2);
        FX.flash(e.x, e.y + 2, e.z, 1.2, 0xffd84a, 0.22, 2);
        FX.burst(e.x, e.y + 1.6, e.z, 4, 0xffd23a, 4, 0.22);
      }
      if (p.pierce > 0) { p.pierce--; return; }
      if (p.bounces > 0) {
        p.bounces--;
        var nt = Enemies.nearest(p.x, p.z, 14, p.hit);
        if (nt) {
          var nx = nt.x - p.x, nz = nt.z - p.z, nd = Math.sqrt(nx * nx + nz * nz) || 1;
          var s = Math.max(14, Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz));
          p.vx = nx / nd * s; p.vz = nz / nd * s; p.vy = (nt.y + nt.r - p.y) / nd * s + (p.grav ? 3 : 0);
          p.life = Math.max(p.life, 1);
          p.bnc = true;
          // 弹射点一颗小星光
          var bk = Weapons.baseKind(p.kind);
          if (bk === 'dagger') FX.flash(p.x, p.y, p.z, 0.7, p.w && p.w.def.evo ? 0xffe9a0 : 0x9affe0, 0.1, 2);
          else if (bk === 'bolt') FX.flash(p.x, p.y, p.z, 0.45, 0xffffff, 0.08, 2);
          return false;
        }
      }
      p.life = 0;
      return false;
    });
    if (p.life <= 0) ps.splice(i, 1);
  }
};

// 爆炸外观：魔弹的冲击环是紫色，超武是金色；炼狱法杖的超武爆炸有自己的样子（金环、火舌、焦痕）
Weapons.BOOM_OPT = {
  rocket: { ring: 0xc070ff }, rocket_evo: { ring: 0xffc23a },
  firestaff_evo: { evo: true }, sniper_evo: { ring: 0xffc23a }, mines_evo: { ring: 0xffc23a }
};
Weapons.boomOpt = function (w) { return Weapons.BOOM_OPT[w.def.evo ? w.id + '_evo' : w.id] || null; };

Weapons.explode = function (p) {
  var w = p.w, r = (w.def.blast || 3) * Weapons.size(w);
  FX.boom(p.x, p.y, p.z, r, w.def.color || 0xff7a2a, Weapons.boomOpt(w));
  Enemies.inRadius(p.x, p.z, r, function (e) {
    if (Math.abs(e.y - p.y) > r + 1.5) return;
    var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    Weapons.hit(w, e, p.dmgMult, dx / d, dz / d);
    if (w.def.burn && e.alive) { Enemies.applyDot(e, w.s.damage * P.st.damage * w.def.burn, 2); e.fireT = Game.time + 2; }
  });
};

// ---------------- 闪电 ----------------
Weapons.chain = function (w, first, jumps) {
  if (!first.alive) return;
  var cur = first, hit = new Set();
  var reach = 9 * Weapons.size(w);
  var gy = first.y + first.r;
  FX.bolt(first.x, gy + 18, first.z, first.x, gy, first.z);
  // 落点：3 颗白色火花；冲击环（超武的金环在 evolution.js 里画，这里就不画蓝环了）
  FX.burst(first.x, gy, first.z, 3, 0xffffff, 5, 0.15);
  if (!w.def.evo) FX.ring(first.x, first.y, first.z, 1.6 * Weapons.size(w), 0xbfe0ff, 0.25);
  Enemies.inRadius(first.x, first.z, 1.6 * Weapons.size(w), function (e) { if (e !== first) Weapons.hit(w, e, 0.5, 0, 0); });
  var px = first.x, py = gy, pz = first.z;
  for (var j = 0; j <= jumps && cur; j++) {
    if (j > 0) FX.bolt(px, py, pz, cur.x, cur.y + cur.r, cur.z);
    hit.add(cur.id);
    Weapons.hit(w, cur, 1, 0, 0);
    px = cur.x; py = cur.y + cur.r; pz = cur.z;
    cur = Enemies.nearest(px, pz, reach, hit);
  }
};

// ---------------- 常驻武器 ----------------
// 位置对象重复使用（每帧不新建）
Weapons.orbAt = function (w, i, x, y, z) {
  var o = w.orbs[i] || (w.orbs[i] = { x: 0, y: 0, z: 0 });
  o.x = x; o.y = y; o.z = z;
  return o;
};

Weapons.updatePersistent = function (w, dt) {
  var def = w.def, size = Weapons.size(w);
  w.tick = (w.tick || 0) - dt;
  switch (def.type) {
    case 'aura': {
      var r = (def.range || 3.5) * size;
      if (w.ring) Weapons.auraLook(w, r, dt);
      if (w.tick <= 0) {
        w.tick = Weapons.cd(w);
        w.pulse = 1;
        var glints = 0;
        FX.tickDmg = true;
        Enemies.inRadius(P.pos.x, P.pos.z, r, function (e) {
          if (Math.abs(e.y - P.pos.y) > 3.5) return;
          if (def.freeze) {
            // 刚被冻住的敌人身上闪一颗白色星光
            if (!(e.frozen > 0) && glints < 8) { glints++; FX.flash(e.x, e.y + e.r * 1.6, e.z, 0.8, 0xdffaff, 0.22, 2); }
            e.frozen = Math.max(e.frozen, Weapons.dur(w));
          }
          var dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          Weapons.hit(w, e, 1, dx / d, dz / d);
        });
        FX.tickDmg = false;
        // 冰霜：圈里蹦出几块冰碴
        if (def.freeze) {
          var nb = randi(4, 6), by = w.ring ? w.ring.position.y : P.pos.y;
          for (var b = 0; b < nb; b++) {
            var ba = Math.random() * TAU, br = Math.sqrt(Math.random()) * r * 0.95;
            FX.part(P.pos.x + Math.cos(ba) * br, by + 0.2, P.pos.z + Math.sin(ba) * br, rand(-1, 1), rand(2.6, 3.6), rand(-1, 1), def.evo && b === 0 ? 0xffe066 : b % 2 ? 0x9ff6ff : 0xe8fbff, rand(0.15, 0.25), rand(0.5, 0.75));
          }
        }
      }
      return;
    }
    case 'orbit': {
      var n = Weapons.count(w), rad = (def.range || 3.2) * Math.sqrt(size);
      w.ang = (w.ang || 0) + dt * 2 * (w.s.pspd || 1) * P.st.projSpeed;
      w.orbs = w.orbs || [];
      w.cool = w.cool || new Map();
      w.orad = rad;
      for (var i = 0; i < n; i++) {
        var a = w.ang + i / n * TAU;
        var ox = P.pos.x + Math.cos(a) * rad, oz = P.pos.z + Math.sin(a) * rad;
        Weapons.orbAt(w, i, ox, P.pos.y + 0.8, oz);
        Enemies.inRadius(ox, oz, 0.8 * size, function (e) {
          var last = w.cool.get(e.id);
          if (last !== undefined && Game.time - last < Weapons.cd(w)) return;
          w.cool.set(e.id, Game.time);
          var dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          Weapons.hit(w, e, 1, dx / d, dz / d);
        });
      }
      w.orbs.length = n;
      if (w.cool.size > 800) w.cool.clear();
      return;
    }
    case 'aegis': {
      // 盾牌数量 = 可格挡次数，按冷却回复
      var maxC = Weapons.count(w);
      if (w.charges < maxC && w.tick <= 0) { w.charges++; w.tick = Weapons.cd(w) * 2; }
      if (w.charges >= maxC) w.tick = Weapons.cd(w) * 2;
      w.ang = (w.ang || 0) + dt * 2.5;
      w.orbs = w.orbs || [];
      // 盾牌绕得远一点（2 米），不会一直挡在角色身上
      for (var c = 0; c < w.charges; c++) {
        var aa = w.ang + c / Math.max(1, w.charges) * TAU;
        Weapons.orbAt(w, c, P.pos.x + Math.cos(aa) * 2.0, P.pos.y + 1, P.pos.z + Math.sin(aa) * 2.0);
      }
      w.orbs.length = w.charges;
      return;
    }
    case 'trail': {
      if (w.tick <= 0 && P.speed() > 1.5 && P.onGround) {
        w.tick = Weapons.cd(w);
        Weapons.fireZone(P.pos.x, P.pos.z, 0, w);
      }
      return;
    }
    case 'tether': {
      var range = (def.range || 14) * Math.sqrt(size);
      if (w.tick <= 0 && !w.target) {
        var t = Enemies.nearest(P.pos.x, P.pos.z, range);
        if (t) { w.target = t; w.left = Weapons.dur(w); w.ttick = 0; } else w.tick = 0.3;
      }
      if (w.target) {
        w.left -= dt; w.ttick -= dt;
        if (!w.target.alive) w.target = Enemies.nearest(P.pos.x, P.pos.z, range);
        if (!w.target || w.left <= 0 || dist2(P.pos.x, P.pos.z, w.target.x, w.target.z) > range * range * 1.5) {
          w.target = null; w.beam.visible = false; w.tick = Weapons.cd(w);
          return;
        }
        var tx = w.target.x, ty = w.target.y + w.target.r, tz = w.target.z;
        var sx = P.pos.x, sy = P.pos.y + 1.1, sz = P.pos.z;
        var L = Math.sqrt((tx - sx) * (tx - sx) + (ty - sy) * (ty - sy) + (tz - sz) * (tz - sz)) || 1;
        w.beam.visible = true;
        w.beam.position.set(sx, sy, sz);
        w.beam.lookAt(tx, ty, tz);
        w.beam.scale.set(size, size, L);
        if (w.ttick <= 0) {
          w.ttick = 0.25 / P.st.atkSpeed;
          w.pulseT = 0;   // 每次跳伤：一团白光顺着锁链跑过去
          var wid = 1.0 * size, lx = tx - sx, lz = tz - sz, ll = lx * lx + lz * lz || 1;
          FX.tickDmg = true;
          Enemies.inRadius((sx + tx) / 2, (sz + tz) / 2, Math.sqrt(ll) / 2 + wid, function (e) {
            var t2 = clamp(((e.x - sx) * lx + (e.z - sz) * lz) / ll, 0, 1);
            var cx = sx + lx * t2, cz = sz + lz * t2;
            if (dist2(e.x, e.z, cx, cz) < (wid + e.r) * (wid + e.r)) Weapons.hit(w, e, 1, 0, 0);
          });
          FX.tickDmg = false;
        }
        w.pulseT = (w.pulseT == null ? 1 : w.pulseT) + dt;
      }
      return;
    }
    case 'flame': {
      var fr = (def.range || 7) * size;
      if (w.tick <= 0 && !w.flaming) {
        var ft = Enemies.nearest(P.pos.x, P.pos.z, fr);
        if (ft) { w.flaming = Weapons.dur(w); w.fang = Math.atan2(ft.x - P.pos.x, ft.z - P.pos.z) - 0.6; w.ftick = 0; } else w.tick = 0.3;
      }
      if (w.flaming) {
        w.flaming -= dt; w.ftick -= dt;
        w.fang += dt * 1.6;
        var fx = Math.sin(w.fang), fz = Math.cos(w.fang);
        Weapons.flameLook(w, fr, fx, fz, dt);
        if (w.ftick <= 0) {
          w.ftick = 0.15 / P.st.atkSpeed;
          FX.tickDmg = true;
          Enemies.inRadius(P.pos.x, P.pos.z, fr, function (e) {
            var ea = Math.atan2(e.x - P.pos.x, e.z - P.pos.z);
            var diff = Math.abs(((ea - w.fang + Math.PI) % TAU + TAU) % TAU - Math.PI);
            if (diff < 0.4) Weapons.hit(w, e, 1, fx, fz);
          });
          FX.tickDmg = false;
        }
        if (w.flaming <= 0) { w.flaming = 0; w.tick = Weapons.cd(w); }
      }
      return;
    }
  }
};

// 龙息：一条从嘴边的白黄到末端暗红的火焰锥（每帧抖一点），里面翻滚的亮色火块，末端偶尔冒一缕烟
Weapons.FLAME_PAL = [0xfff0a0, 0xffd23a, 0xffa22a, 0xff7a1a, 0xff5a1a];
// 喷向镜头的时候（火焰扫到身后）整体淡一些、火块少一些，不会糊满屏幕
Weapons.camFacing = function (fx, fz) {
  var c = Game.camera ? Game.camera.position : null;
  if (!c) return 0;
  var cx = c.x - P.pos.x, cz = c.z - P.pos.z, l = Math.sqrt(cx * cx + cz * cz) || 1;
  return (fx * cx + fz * cz) / l;
};
Weapons.flameLook = function (w, fr, fx, fz, dt) {
  var x0 = P.pos.x, y0 = P.pos.y + 1.05, z0 = P.pos.z, ks = clamp(fr / 9, 0.8, 1.5);
  var cf = Weapons.camFacing(fx, fz), kc = 1 - 0.7 * clamp((cf - 0.2) / 0.7, 0, 1);
  w.flameK = kc;
  FX.glow(x0 + fx * 0.9, y0, z0 + fz * 0.9, 1.1, 1.1, Weapons.C.white, 0.5 * kc, 0);
  for (var q = 0; q < 7; q++) {
    var t = q / 6, fd = lerp(1, fr, t) + rand(-0.2, 0.2), fs = lerp(0.9, 3.0, t) * ks * rand(0.9, 1.1);
    FX.glow(x0 + fx * fd + rand(-0.2, 0.2), y0 + t * 0.35 + rand(-0.15, 0.15), z0 + fz * fd + rand(-0.2, 0.2), fs, fs * 0.8, Weapons.flameC[q], lerp(0.75, 0.35, t) * kc, 0);
  }
  var n = Math.floor(dt * 120 * kc + Math.random());
  for (var k = 0; k < n; k++) {
    var dd = rand(1, fr), sp = rand(4, 7), ft = dd / fr;
    FX.part(x0 + fx * dd + rand(-0.4, 0.4), y0 - 0.1 + rand(-0.2, 0.4), z0 + fz * dd + rand(-0.4, 0.4), fx * sp + rand(-1, 1), rand(1, 3), fz * sp + rand(-1, 1), Weapons.FLAME_PAL[Math.min(4, Math.floor(ft * 4 + Math.random() * 1.5))], rand(0.3, 0.55) * Math.min(1.3, ks) * (0.5 + 0.5 * kc), 0.35);
  }
  if (Math.random() < dt * 14 * kc) FX.smoke(x0 + fx * fr, y0 + 0.4, z0 + fz * fr, 1, 0x5a4a42);
};

// 神盾格挡：P.hurt 时调用，返回是否挡下
Weapons.aegisBlock = function (src) {
  var w = Weapons.find('aegis');
  if (!w || w.charges <= 0) return false;
  w.charges--;
  w.tick = Weapons.cd(w) * 2;
  var r = 3.5 * Weapons.size(w), x = P.pos.x, y = P.pos.y, z = P.pos.z, evo = w.def.evo;
  // 被用掉的那面盾白光一闪
  var used = w.orbs && w.orbs[w.charges];
  if (used) FX.flash(used.x, used.y, used.z, 1.8, 0xffffff, 0.15, 0);
  FX.flash(x, y + 1.1, z, 2.5, 0xfff2c0, 0.15, 2);
  FX.ring(x, y, z, r, 0xffd84a, 0.35);
  FX.ring(x, y, z, r * 0.6, 0xffffff, 0.28);
  FX.burst(x, y + 1, z, 10, 0xffd84a, 6, 0.25);
  if (evo) {
    // 不破圣盾：金色光罩 + 六道放射的光
    FX.flash(x, y + 1, z, 3, 0xffc23a, 0.3, 0);
    for (var k = 0; k < 6; k++) {
      var a = k / 6 * TAU + (w.ang || 0);
      FX.flash(x + Math.cos(a) * r * 0.8, y + 0.8, z + Math.sin(a) * r * 0.8, 1.5, 0xfff0b0, 0.25, 2);
    }
  }
  Game.shake(0.12);
  // 格挡通常发生在敌人更新里（那里的伤害按跳伤显示）：震荡波是正经的反击，照常显示数字和火花
  var tk = FX.tickDmg;
  FX.tickDmg = false;
  Enemies.inRadius(x, z, r, function (e) {
    var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    Weapons.hit(w, e, 1, dx / d, dz / d);
  });
  FX.tickDmg = tk;
  FX.text(x, y + 2.4, z, '格挡', '#ffd84a', 1);
  return true;
};

// ---------------- 场地类 ----------------
Weapons.spawnZone = function (w, idx) {
  var def = w.def, size = Weapons.size(w);
  var t = Enemies.nearestN(P.pos.x, P.pos.z, Weapons.RANGE, idx + 1)[idx] || Enemies.nearest(P.pos.x, P.pos.z, Weapons.RANGE);
  var z = { w: w, type: def.type, t: 0, life: Weapons.dur(w), r: (def.range || 2.5) * size, tick: 0 };
  if (def.type === 'tornado') {
    z.x = P.pos.x; z.z = P.pos.z;
    var a = Math.random() * TAU, sp = 7 * (w.s.pspd || 1) * P.st.projSpeed;
    z.vx = Math.cos(a) * sp; z.vz = Math.sin(a) * sp; z.sp = sp;
  } else if (def.type === 'mine') {
    var ma = Math.random() * TAU, mr = rand(2, 7);
    z.x = P.pos.x + Math.cos(ma) * mr; z.z = P.pos.z + Math.sin(ma) * mr; z.armed = 0.5;
    z.life = 10 + Weapons.dur(w) * 2;
  } else {
    if (!t) return;
    z.x = t.x + rand(-1, 1) * Math.min(idx, 1); z.z = t.z + rand(-1, 1) * Math.min(idx, 1);
  }
  z.y = W.groundAt(z.x, z.z, P.pos.y + 3);
  var key = def.type + (w.evo ? '@' + w.id : '');
  if (def.type === 'tornado') {
    // 叠加发光的漏斗（每个龙卷风自己的材质：离镜头近时单独变淡）
    z.mesh = Weapons.takeMesh(key, function () {
      var m = new THREE.Mesh(ZONE_MODELS.tornado, Weapons.windMat());
      m.renderOrder = 4;
      return m;
    });
    z.dustT = 0; z.seed = Math.random() * TAU;
  } else if (def.type === 'mine') {
    z.mesh = Weapons.takeMesh(key, function () { return new THREE.Mesh(ZONE_MODELS.mine, MODEL.material()); });
  } else if (def.type === 'blackhole') {
    z.mesh = Weapons.takeMesh(key, function () { return new THREE.Mesh(ZONE_MODELS.blackhole, Weapons.holeMat); });
  } else if (def.type === 'puddle') {
    // 毒云画成贴地的像素圆盘；先扔一个瓶子过去（0.25 秒），落地碎了圆盘才显出来，伤害照旧马上开始
    z.vis0 = 0.25; z.seed = Math.random() * TAU;
    z.sl = FX.slope(z.x, z.z, z.r, z.y, [0, 0]);
    Weapons.lob(w, z);
  }
  if (z.mesh) z.mesh.position.set(z.x, z.y, z.z);
  Weapons.zones.push(z);
};

// 火焰地面（火焰行者、龙火物品）
Weapons.fireZone = function (x, z, dmg, w) {
  var fireCount = 0;
  for (var i = 0; i < Weapons.zones.length; i++) if (Weapons.zones[i].type === 'fire') fireCount++;
  if (fireCount > 60) return;
  var size = w ? Weapons.size(w) : 1;
  var zz = { w: w || null, type: 'fire', t: 0, life: w ? Weapons.dur(w) : 2, r: (w ? w.def.range : 1.8) * size, tick: 0, x: x, z: z, dmg: dmg };
  zz.y = W.groundAt(x, z, P.pos.y + 2);
  zz.sl = FX.slope(x, z, zz.r, zz.y, [0, 0]);
  Weapons.zones.push(zz);
};

Weapons.throwAxe = function (w, t, idx) {
  var size = Weapons.size(w);
  var z = { w: w, type: 'axe', t: 0, x: P.pos.x, y: P.pos.y + 1.2, z: P.pos.z, tx: t.x + rand(-1.5, 1.5) * idx, tz: t.z + rand(-1.5, 1.5) * idx, life: 99, hover: Weapons.dur(w) + 0.4, r: 1.6 * size, tick: 0 };
  var evo = !!w.evo;
  z.mesh = Weapons.takeMesh('axe' + (evo ? '@' + w.id : ''), function () { return new THREE.Mesh(Weapons._axeGeo, MODEL.material()); });
  // 看起来的大小有上限（砍到的范围不变）
  z.vs = Math.min(1.8, 0.9 + 0.45 * size);
  z.mesh.scale.setScalar(z.vs);
  z.mesh.rotation.order = 'YXZ';
  z.mesh.rotation.set(0, Math.atan2(z.tx - z.x, z.tz - z.z), 0);
  z.swoosh = Weapons.takeMesh('swoosh' + (evo ? '@' : ''), function () {
    var m = new THREE.Mesh(FX.getGeo('sweep6.0'), evo ? Weapons.swooshGoldMat : Weapons.swooshMat);
    m.renderOrder = 4;
    return m;
  });
  z.swoosh.visible = false;
  Weapons.zones.push(z);
};

// 毒瓶：扔过去的抛物线（只是外观）
Weapons.lob = function (w, z) {
  var o = Weapons.origin();
  Weapons.lobs.push({ x0: o.x, y0: o.y + 0.2, z0: o.z, x1: z.x, y1: z.y + 0.3, z1: z.z, t: 0, life: 0.25, evo: !!w.evo });
};

Weapons.updateLobs = function (dt) {
  var L = Weapons.lobs;
  for (var i = L.length - 1; i >= 0; i--) {
    var b = L[i];
    b.t += dt;
    if (b.t >= b.life) {
      // 玻璃碎了：白色和绿色的碎块 + 一圈小光
      FX.burst(b.x1, b.y1, b.z1, 3, 0xeaffea, 5, 0.17);
      FX.burst(b.x1, b.y1, b.z1, 3, b.evo ? 0xffe066 : 0x5aff4a, 5, 0.2);
      FX.flash(b.x1, b.y1 + 0.2, b.z1, 1.4, 0x9dff6a, 0.15, 2);
      L.splice(i, 1);
    }
  }
};

// 地面圆盘叠在一起时变淡：数一数中心离得很近的同类圆盘（毒云一次扔好几个、火焰足迹一路连着，叠起来不会变成一整块地毯）
Weapons.overlap = function (z, zs) {
  var k = 0, rr = z.r * z.r * 0.64;
  for (var j = 0; j < zs.length; j++) {
    var o = zs[j];
    if (o === z || o.type !== z.type) continue;
    var dx = o.x - z.x, dz = o.z - z.z;
    if (dx * dx + dz * dz < rr) k++;
  }
  return 1 / (1 + 0.7 * k);
};

Weapons.updateZones = function (dt) {
  var zs = Weapons.zones, cam = Game.camera ? Game.camera.position : null;
  Weapons.lickN = 0;
  Weapons.windN = 0;
  for (var j = 0; j < zs.length; j++) if (zs[j].type === 'tornado') Weapons.windN++;
  Weapons.updateLobs(dt);
  for (var i = zs.length - 1; i >= 0; i--) {
    var z = zs[i], w = z.w;
    z.t += dt;
    z.tick -= dt;
    var dead = z.t >= z.life;
    switch (z.type) {
      case 'tornado': {
        var tgt = Enemies.nearest(z.x, z.z, 10);
        if (tgt && Math.random() < 0.7) { z.vx = lerp(z.vx, (tgt.x - z.x) * 2, dt * 1.5); z.vz = lerp(z.vz, (tgt.z - z.z) * 2, dt * 1.5); }
        else { z.vx += rand(-20, 20) * dt; z.vz += rand(-20, 20) * dt; }
        var sp = Math.sqrt(z.vx * z.vx + z.vz * z.vz) || 1;
        if (sp > z.sp * 1.3) { z.vx *= z.sp * 1.3 / sp; z.vz *= z.sp * 1.3 / sp; }
        z.x += z.vx * dt; z.z += z.vz * dt;
        z.y = W.groundAt(z.x, z.z, z.y + 2);
        if (z.tick <= 0) {
          z.tick = 0.3;
          var nh = 0;
          FX.tickDmg = true;
          Enemies.inRadius(z.x, z.z, z.r, function (e) { nh++; var a = Math.random() * TAU; Weapons.hit(w, e, 1, Math.cos(a), Math.sin(a)); if (!e.boss) e.vy = 6; });
          FX.tickDmg = false;
          // 卷到人的时候（隔一次）：地上闪一圈淡淡的像素环，标出卷到的范围
          if (nh) z.ringK = (z.ringK || 0) + 1;
          if (nh && z.ringK % 2 === 1) {
            var rg = FX.ring(z.x, z.y, z.z, z.r, w.evo ? 0xffc23a : 0xcfe6ff, 0.32, w.evo ? 0.26 : 0.22);
            rg.s0 = z.r * 0.9;
          }
        }
        Weapons.tornadoLook(z, dt, cam);
        break;
      }
      case 'mine': {
        z.armed -= dt;
        z.mesh.position.set(z.x, z.y + 0.1, z.z);
        if (z.armed <= 0) {
          // 上了膛：引信头一闪一闪的红光
          if (Math.sin(z.t * 10 + i) > 0.25) FX.glow(z.x + 0.133, z.y + 0.95, z.z, 0.4, 0.4, Weapons.C.fuse, 0.9, 0);
          var trig = false;
          Enemies.inRadius(z.x, z.z, 1.6, function () { trig = true; return false; });
          if (trig || dead) {
            var br = (w.def.blast || 3.6) * Weapons.size(w);
            FX.boom(z.x, z.y + 0.5, z.z, br, w.def.color, Weapons.boomOpt(w));
            Enemies.inRadius(z.x, z.z, br, function (e) { var dx = e.x - z.x, dz = e.z - z.z, d = Math.sqrt(dx * dx + dz * dz) || 1; Weapons.hit(w, e, 1, dx / d, dz / d); });
            dead = true;
          }
        }
        break;
      }
      case 'puddle': case 'fire': {
        var fade = Math.min(1, (z.life - z.t) * 2);
        if (z.vis0) fade *= clamp((z.t - z.vis0) / 0.15, 0, 1);
        if (z.tick <= 0) {
          z.tick = z.type === 'fire' ? 0.3 : 0.25;
          FX.tickDmg = true;
          Enemies.inRadius(z.x, z.z, z.r, function (e) {
            if (Math.abs(e.y - z.y) > 3) return;
            if (z.type === 'puddle') { Weapons.hit(w, e, 1, 0, 0, { quiet: Math.random() < 0.5 }); e.poisoned = 2; }
            else if (w) Weapons.hit(w, e, 1, 0, 0, { quiet: Math.random() < 0.5 });
            else Enemies.damage(e, z.dmg, 0, 0, 0, { quiet: true });
          });
          FX.tickDmg = false;
        }
        var ov = Weapons.overlap(z, zs);
        if (z.type === 'puddle') Weapons.puddleLook(z, fade, ov);
        else Weapons.fireLook(z, fade, dt, ov);
        break;
      }
      case 'blackhole': {
        z.mesh.position.set(z.x, z.y + 1.5, z.z);
        var bs = Weapons.holeSize(z);
        z.mesh.scale.setScalar(bs);
        z.mesh.rotation.y += dt * 5;
        FX.glow(z.x, z.y + 1.5, z.z, bs * 2.9, bs * 2.9, Weapons.colorOf(w), 0.7, 1);
        FX.glow(z.x, z.y + 1.5, z.z, bs * 3.6, bs * 3.6, Weapons.colorOf(w), 0.4, 0);
        Weapons.holeLook(z, bs, dt);
        var pull = (w.s.knockback || 6) * P.st.knockback;
        Enemies.inRadius(z.x, z.z, z.r * 2.4, function (e) {
          if (e.boss) return;
          var dx = z.x - e.x, dz = z.z - e.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          e.kx += dx / d * pull * 4 * dt; e.kz += dz / d * pull * 4 * dt;
        });
        if (z.tick <= 0) { z.tick = 0.25; FX.tickDmg = true; Enemies.inRadius(z.x, z.z, z.r, function (e) { Weapons.hit(w, e, 1, 0, 0, { quiet: Math.random() < 0.6 }); }); FX.tickDmg = false; }
        break;
      }
      case 'axe': {
        // 先飞向目标，再原地旋转停留
        var dx2 = z.tx - z.x, dz2 = z.tz - z.z, d2 = Math.sqrt(dx2 * dx2 + dz2 * dz2);
        if (!z.arrived) {
          var spd = Weapons.speed(w);
          if (d2 < spd * dt + 0.2) { z.arrived = true; z.life = z.t + z.hover; }
          else { z.x += dx2 / d2 * spd * dt; z.z += dz2 / d2 * spd * dt; }
          z.y = lerp(z.y, W.groundAt(z.x, z.z, z.y + 2) + 1.2, Math.min(1, dt * 5));
        }
        Weapons.axeLook(z, dx2, dz2, dt);
        if (z.tick <= 0) { z.tick = 0.2; Enemies.inRadius(z.x, z.z, z.r, function (e) { var dx = e.x - z.x, dz = e.z - z.z, d = Math.sqrt(dx * dx + dz * dz) || 1; Weapons.hit(w, e, 1, dx / d, dz / d); }); }
        break;
      }
    }
    if (dead) { Weapons.freeZone(z); zs.splice(i, 1); }
  }
};

// 龙卷风的风：叠加发光，几乎透明，只有斜着往上卷的几道风痕是亮的（底部和顶部淡出）
Weapons.WIND_VS = [
  'varying vec3 vP;',
  'varying vec3 vCol;',
  'void main() {',
  '  vP = position; vCol = color;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}'
].join('\n');
Weapons.WIND_FS = [
  'uniform float uTime;',
  'uniform float uA;',
  'varying vec3 vP;',
  'varying vec3 vCol;',
  'void main() {',
  '  float h = clamp(vP.y / 3.8, 0.0, 1.0);',
  '  float a = atan(vP.z, vP.x) / 6.2831853;',
  '  float s = fract(a * 3.0 + h * 1.6 - uTime * 2.2);',
  '  float band = smoothstep(0.0, 0.08, s) * (1.0 - smoothstep(0.2, 0.4, s));',
  '  band = floor(band * 4.0 + 0.5) / 4.0;',
  '  float body = 0.16 + 0.84 * band;',
  '  float fade = smoothstep(0.0, 0.3, h) * (1.0 - 0.55 * smoothstep(0.65, 1.0, h));',
  '  gl_FragColor = vec4(vCol * body * fade * uA, 1.0);',
  '}'
].join('\n');
Weapons.windTime = { value: 0 };
// 龙卷风看起来的大小有上限（卷人的范围不变，地上的像素环标出范围）
Weapons.windScale = function (w) { return Math.min(1.2, 0.7 + 0.28 * Weapons.size(w)); };
Weapons.windMat = function () {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: Weapons.windTime, uA: { value: 0.6 } },
    vertexShader: Weapons.WIND_VS, fragmentShader: Weapons.WIND_FS, vertexColors: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
};

// 龙卷风：发光的漏斗（大小有上限，离镜头近了变淡）+ 绕着往上转的白色风痕 + 脚下卷起的尘土
Weapons.tornadoLook = function (z, dt, cam) {
  var vs = Weapons.windScale(z.w), m = z.mesh;
  m.position.set(z.x, z.y, z.z);
  m.rotation.y += dt * 6;
  m.scale.setScalar(vs);
  Weapons.windTime.value = Game.time;
  var fade = cam ? clamp((Math.sqrt((cam.x - z.x) * (cam.x - z.x) + (cam.z - z.z) * (cam.z - z.z)) - 2) / 5, 0.25, 1) : 1;
  var lf = Math.min(1, z.t * 4, (z.life - z.t) * 3);
  // 同时有很多个龙卷风时每个都淡一点
  m.material.uniforms.uA.value = 0.55 * fade * lf / Math.sqrt(Math.max(1, Weapons.windN / 4));
  var H = 4.2 * vs;
  for (var k = 0; k < 3; k++) {
    var h = (z.t * 0.8 + k / 3) % 1, a = z.t * 7 + k * 2.1 + z.seed, rad = lerp(0.35, 1.15, h) * vs;
    FX.glow(z.x + Math.cos(a) * rad, z.y + 0.3 + h * H, z.z + Math.sin(a) * rad, 0.8 * vs, 0.32 * vs, Weapons.C.streak, 0.5 * fade * lf * (1 - h * 0.5), 0);
  }
  z.dustT -= dt;
  if (z.dustT <= 0) {
    z.dustT = 0.1;
    var da = Math.random() * TAU;
    FX.part(z.x + Math.cos(da) * 0.7 * vs, z.y + 0.1, z.z + Math.sin(da) * 0.7 * vs, -Math.sin(da) * 3, rand(2, 3.5), Math.cos(da) * 3, Math.random() < 0.6 ? 0xdfe8f0 : 0x8a7a5a, rand(0.14, 0.22), 0.7, -1);
  }
};

// 毒云：暗绿的像素圆盘 + 亮绿色的像素边 + 两三团慢慢飘的毒雾（不再是一大块荧光绿的地毯）
Weapons.puddleLook = function (z, fade, ov) {
  var evo = z.w && z.w.evo;
  FX.decal(z.x, z.y + 0.1, z.z, z.r, z.sl[0], z.sl[1], evo ? 0x5a8a1a : 0x3fbf3a, (evo ? 0.22 : 0.18) * fade * ov, 0.38 * fade * ov, 0);
  var ks = clamp(z.r / 3, 1, 1.5);
  for (var k = 0; k < 2; k++) {
    var a = z.seed + k * 2.6 + z.t * 0.35, rr = z.r * (0.22 + 0.25 * k), gs = (1.5 + 0.4 * k) * ks;
    FX.glow(z.x + Math.cos(a) * rr, z.y + 0.6 + 0.3 * (1 + Math.sin(z.t * 0.8 + k * 1.7)), z.z + Math.sin(a) * rr, gs, gs * 0.75, Weapons.C.mist, 0.09 * fade * ov, FX.NOPULL);
  }
};

// 火焰地面：烧焦的暗红像素圆盘（零星的火星格子一闪一闪）+ 亮橙色的边 + 两三簇跳动的火苗光 + 往上窜的火星
// （火苗光的位置每 0.15 秒换一次，看起来在烧；全场火星每帧最多 8 颗）
Weapons.fireLook = function (z, fade, dt, ov) {
  var evo = z.w && z.w.evo, k = fade * ov;
  FX.decal(z.x, z.y + 0.1, z.z, z.r, z.sl[0], z.sl[1], 0x7a2208, 0.3 * k, 0.5 * k, 1);
  FX.glow(z.x, z.y + 0.35, z.z, z.r * 1.5, z.r * 0.8, Weapons.C.fire, 0.12 * k, FX.NOPULL);
  var seed = z.seed || (z.seed = Math.random() * 100);
  for (var q = 0; q < 2; q++) {
    var ph = Math.floor(z.t * 6.5 + q * 0.5 + seed);
    var hx = Math.sin(ph * 12.9898 + q * 78.233) * 43758.5453, hz = Math.sin(ph * 39.346 + q * 11.135) * 24634.6345;
    hx -= Math.floor(hx); hz -= Math.floor(hz);
    var fl = 0.75 + 0.25 * Math.sin(z.t * 23 + q * 2.1 + seed), fs = Math.min(1.4, 0.5 + z.r * 0.18);
    FX.glow(z.x + (hx - 0.5) * z.r * 1.1, z.y + 0.5 * fl * fs, z.z + (hz - 0.5) * z.r * 1.1, 0.7 * fl * fs, 1.3 * fl * fs, evo ? Weapons.C.core : Weapons.C.ember, 0.6 * k, FX.NOPULL);
  }
  if (Weapons.lickN < 8 && Math.random() < dt * 30 * fade) {
    Weapons.lickN++;
    FX.mote(z.x + rand(-z.r, z.r) * 0.6, z.y + 0.15, z.z + rand(-z.r, z.r) * 0.6, evo ? pick([0xffffff, 0xffe066, 0xffd23a]) : pick([0xffd23a, 0xff8a1a, 0xff4a1a]), rand(0.2, 0.32), rand(2, 3), 0.35);
  }
};

// 黑洞核心看起来的大小有上限（大范围的超武黑洞不会变成挡住半个画面的黑球；吸人和伤害的范围不变）
Weapons.holeSize = function (z) { return Math.min(z.r * 0.4, 1.0 + z.r * 0.06) * (1 + Math.sin(z.t * 8) * 0.08); };

// 黑洞：两颗亮点沿着光环转，四周的小光点被吸进去
Weapons.holeLook = function (z, bs, dt) {
  var cy = z.y + 1.5, evo = z.w && z.w.evo, cm = Game.camera ? Game.camera.matrixWorld.elements : null;
  if (cm) {
    for (var k = 0; k < 2; k++) {
      var a = z.t * 4 + k * Math.PI, rr = bs * 1.16;
      var ox = (cm[0] * Math.cos(a) + cm[4] * Math.sin(a)) * rr, oy = (cm[1] * Math.cos(a) + cm[5] * Math.sin(a)) * rr, oz = (cm[2] * Math.cos(a) + cm[6] * Math.sin(a)) * rr;
      FX.glow(z.x + ox, cy + oy, z.z + oz, 0.7, 0.7, Weapons.C.white, 0.6, 2);
    }
  }
  var n = Math.floor(dt * 45 + Math.random());
  for (var i = 0; i < n; i++) {
    var ma = Math.random() * TAU, R = z.r * 2, sy = rand(-0.6, 1.2);
    FX.part(z.x + Math.cos(ma) * R, cy + sy, z.z + Math.sin(ma) * R, -Math.cos(ma) * R / 0.5, -sy / 0.5, -Math.sin(ma) * R / 0.5, evo ? (Math.random() < 0.5 ? 0xffe066 : 0xfff6d0) : (Math.random() < 0.6 ? 0xb08aff : 0xffffff), 0.13, 0.5, 0);
  }
};

// 飞斧：飞行时翻跟头；停下来绕一根斜 30° 的轴转，脚下一圈淡淡的旋风刀光标出砍到的范围
Weapons.axeLook = function (z, dx, dz, dt) {
  var m = z.mesh;
  m.position.set(z.x, z.y, z.z);
  if (!z.arrived) {
    m.rotation.order = 'YXZ';
    if (dx || dz) m.rotation.y = Math.atan2(dx, dz);
    m.rotation.x += dt * 14;
    m.rotation.z = 0;
  } else {
    m.rotation.order = 'ZYX';
    m.rotation.x = 0;
    m.rotation.z = 0.52;
    m.rotation.y += dt * 16;
    var sw = z.swoosh;
    if (sw) {
      sw.visible = true;
      sw.position.set(z.x, z.y - 0.25, z.z);
      sw.rotation.set(0, m.rotation.y, 0);
      sw.scale.setScalar(z.r);
    }
  }
};

// 灵魂收割者：追踪灵魂
Weapons.spawnSouls = function (x, y, z, n) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU;
    Weapons.projs.push({ w: null, soul: true, soulDmg: (10 + P.level * 2) * P.st.damage, kind: 'soul', x: x, y: y + 1, z: z, vx: Math.cos(a) * 10, vy: 3, vz: Math.sin(a) * 10, r: 0.6, life: 3, pierce: 0, bounces: 0, hit: new Set(), t: 0, spin: 0, grav: 0, scale: 1, dmgMult: 1, homing: 6 });
  }
};

// ---------------- 绘制 ----------------
// 弹丸光晕：gl 是 Weapons.glowC 的一项（c 颜色、s 大小、a 亮度；core/cc/ca 是可选的亮芯；ring/rc/ra 是可选的金边光环）
Weapons.glowAt = function (gl, x, y, z, scale, t, w) {
  var gs = gl.s * Math.min(2.5, scale) * (0.9 + 0.1 * Math.sin(t * 30));
  FX.glow(x, y, z, gs, gs, gl.byWeapon && w ? Weapons.colorOf(w) : gl.c, gl.a, 0);
  if (gl.core) FX.glow(x, y, z, gs * gl.core, gs * gl.core, gl.cc, gl.ca, 0);
  if (gl.ring) FX.glow(x, y, z, gs * gl.ring, gs * gl.ring, gl.rc, gl.ra, 1);
};

// 拖尾：从弹丸当前位置沿记下的路线往回画，总长 = 速度 × 时长（最长 7 米）；越往后越细越暗
Weapons.drawTail = function (p, tl) {
  var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
  if (sp < 14 || !p.tn) return;
  var L = Math.min(7, Math.max(0.6, sp * tl.T * (p.tk || 1))), done = 0, h = p.tr, sc = Math.min(2, Math.max(0.8, p.scale || 1));
  var ax = p.x, ay = p.y, az = p.z, w0 = tl.w * sc;
  for (var k = 0; k < p.tn && done < L; k++) {
    var bx = h[k * 3], by = h[k * 3 + 1], bz = h[k * 3 + 2];
    var dx = bx - ax, dy = by - ay, dz = bz - az, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (d < 0.01) continue;
    var take = Math.min(d, L - done), f = take / d;
    bx = ax + dx * f; by = ay + dy * f; bz = az + dz * f;
    var t0 = done / L, t1 = (done + take) / L;
    if (!FX.trailSeg(ax, ay, az, bx, by, bz, w0 * (1 - 0.7 * t0), w0 * (1 - 0.7 * t1), 1 - t0, 1 - t1, tl.c, tl.ca)) return;
    done += take; ax = bx; ay = by; az = bz;
  }
};

var _wm = null, _wq = null, _ws = null, _wp = null, _we = null, _wcount = {}, _wtr = { x: 0, y: 0, z: 0 };
Weapons.put = function (kind, x, y, z, rx, ry, s, sq, rz) {
  var m = Weapons.meshes[kind];
  if (!m || _wcount[kind] >= 500) return;
  _we.set(rx, ry, rz || 0, 'YXZ');
  _wq.setFromEuler(_we);
  if (sq > 0) { var k = sq * 4; _ws.set(s * (1 + k), s * (1 - k), s * (1 + k)); } else _ws.setScalar(s);
  _wp.set(x, y, z);
  _wm.compose(_wp, _wq, _ws);
  m.setMatrixAt(_wcount[kind]++, _wm);
};

Weapons.render = function (dt) {
  if (!_wm) { _wm = new THREE.Matrix4(); _wq = new THREE.Quaternion(); _ws = new THREE.Vector3(); _wp = new THREE.Vector3(); _we = new THREE.Euler(); }
  dt = dt || 1 / 30;
  for (var k in Weapons.meshes) _wcount[k] = 0;
  var put = Weapons.put;
  var ps = Weapons.projs;
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i], bk = Weapons.baseKind(p.kind);
    var yaw = Math.atan2(p.vx, p.vz), hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    // 月刃（超武香蕉）平着转；普通香蕉翻滚
    var flat = bk === 'banana' && p.kind !== bk, rs = PROJ_ROLLSPIN[bk];
    put(p.kind, p.x, p.y, p.z, flat ? 0.25 : p.spin ? p.t * p.spin : -Math.atan2(p.vy, hs || 0.001), p.spin && bk === 'banana' ? p.t * p.spin : yaw, p.scale || 1, p.sq, rs ? p.t * rs : 0);
    // 发光的弹丸核心（超武的种类有自己的金色光晕）
    var gl = Weapons.glowC[p.kind] || Weapons.glowC[bk];
    if (gl) Weapons.glowAt(gl, p.x, p.y, p.z, p.scale || 1, p.t, p.w);
    // 拖尾
    if (p.tr) { var tl = Weapons.tailOf(p.kind); if (tl && (!tl.back || p.back)) Weapons.drawTail(p, tl); }
    // 火球一路掉火星
    if (bk === 'fireball' && Math.random() < dt * 30) FX.mote(p.x + rand(-0.2, 0.2), p.y, p.z + rand(-0.2, 0.2), Math.random() < 0.5 ? 0xffb030 : 0xff6a1a, rand(0.1, 0.16), rand(0.6, 1.4), 0.45);
    // 重弩：出手时一道直直的弹道光（按这一帧的最终方向）
    if (p.trc) {
      p.trc = false;
      var ev = p.w && p.w.def.evo, e2 = Weapons.tracerEnd(p.ox0, p.oy0, p.oz0, p.vx, p.vy, p.vz, _wtr);
      FX.bolt(p.ox0, p.oy0, p.oz0, e2.x, e2.y, e2.z, ev ? (window.Evo ? Evo.BOLT_C : 0xffd04a) : 0xfff0c8, { straight: true, life: 0.12, w: ev ? 0.62 : 0.42, ca: 0.35, flash: false });
    }
  }
  // 毒瓶（飞行中带一团绿光）
  for (i = 0; i < Weapons.lobs.length; i++) {
    var b = Weapons.lobs[i], s = Math.min(1, b.t / b.life), lh = 1.2 + Math.sqrt(dist2(b.x0, b.z0, b.x1, b.z1)) * 0.12;
    var bx = lerp(b.x0, b.x1, s), by = lerp(b.y0, b.y1, s) + 4 * lh * s * (1 - s), bz = lerp(b.z0, b.z1, s);
    put('bottle', bx, by, bz, b.t * 14, b.t * 6, 1.1, 0);
    FX.glow(bx, by, bz, 0.9, 0.9, Weapons.C.mist, 0.45, 0);
  }
  Weapons.renderOrbs(put);
  for (k in Weapons.meshes) {
    var m = Weapons.meshes[k];
    m.count = _wcount[k];
    m.visible = _wcount[k] > 0;
    if (_wcount[k]) m.instanceMatrix.needsUpdate = true;
  }
  Weapons.renderLinks();
  Weapons.renderStatus(dt);
};

// 环绕的东西：流星锤（大小有上限，从镜头旁边经过时缩小；身后拖一串光）、神盾的盾牌
Weapons.renderOrbs = function (put) {
  var cam = Game.camera ? Game.camera.position : null;
  for (var j = 0; j < P.weapons.length; j++) {
    var w = P.weapons[j];
    if (!w.orbs) continue;
    var kind = w.def.proj, bk = Weapons.baseKind(kind), og = Weapons.glowC[kind], size = Weapons.size(w), evo = w.def.evo;
    var flail = bk === 'flail', osc = flail ? Math.min(1.4, 0.8 + 0.3 * size) : bk === 'shield' ? Math.min(1.1, 0.8 * size) : size;
    var n = w.orbs.length;
    for (var q = 0; q < n; q++) {
      var ob = w.orbs[q], s = osc;
      if (flail && cam) {
        // 从镜头旁边经过时缩小（不会占满画面的下面三分之一）
        var cd = Math.sqrt((cam.x - ob.x) * (cam.x - ob.x) + (cam.y - ob.y) * (cam.y - ob.y) + (cam.z - ob.z) * (cam.z - ob.z));
        if (cd < 9) s *= clamp((cd - 2) / 7, 0.12, 1);
      }
      put(kind, ob.x, ob.y, ob.z, 0, Game.time * 4 + q, s, 0);
      if (og) Weapons.glowAt(og, ob.x, ob.y, ob.z, s, Game.time + q, w);
      if (flail && w.orad) {
        // 沿轨道往后拖的光（普通：铁灰色；超武：金黄到橙红的流星尾，偶尔掉火星）
        var a0 = w.ang + q / n * TAU, nt = evo ? 4 : 3;
        for (var k = 1; k <= nt; k++) {
          var a = a0 - 0.12 * k;
          FX.glow(P.pos.x + Math.cos(a) * w.orad, ob.y, P.pos.z + Math.sin(a) * w.orad, 0.9 * s, 0.9 * s, evo ? Weapons.meteorC[k - 1] : Weapons.C.flail, evo ? lerp(0.5, 0.1, (k - 1) / 3) : [0.4, 0.25, 0.12][k - 1], 0);
        }
        if (evo && Math.random() < 0.25) FX.part(ob.x, ob.y, ob.z, rand(-1, 1), rand(1, 3), rand(-1, 1), Math.random() < 0.5 ? 0xffd23a : 0xff6a1a, 0.16, 0.4);
      }
    }
  }
};

// 锁链：一节节交错 90° 的链环 + 目标身上的钩子光 + 每次跳伤顺着锁链跑过去的白光
Weapons.renderLinks = function () {
  var lm = Weapons.linkMesh, n = 0;
  for (var j = 0; j < P.weapons.length; j++) {
    var w = P.weapons[j];
    if (w.def.type !== 'tether' || !w.target || !w.beam || !w.beam.visible) continue;
    var tg = w.target, size = Weapons.size(w), evo = w.def.evo;
    var sx = P.pos.x, sy = P.pos.y + 1.1, sz = P.pos.z, tx = tg.x, ty = tg.y + tg.r, tz = tg.z;
    var dx = tx - sx, dy = ty - sy, dz = tz - sz, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    var step = 0.34 * Math.min(1.6, size), cnt = Math.min(64 - n, Math.max(2, Math.floor(L / step)));
    Weapons._la.set(sx, sy, sz); Weapons._lb.set(tx, ty, tz);
    Weapons._lm.lookAt(Weapons._lb, Weapons._la, Weapons._lup);
    Weapons._lq.setFromRotationMatrix(Weapons._lm);
    Weapons._lq2.copy(Weapons._lq).multiply(Weapons._lr);
    var ls = Math.min(1.6, size), lc = Weapons._lc.set(evo ? 0xffd060 : 0xffffff);
    Weapons._ls.set(ls, ls, ls);
    for (var i = 0; i < cnt; i++) {
      var f = (i + 0.5) / cnt;
      Weapons._la.set(sx + dx * f, sy + dy * f, sz + dz * f);
      Weapons._lm.compose(Weapons._la, i % 2 ? Weapons._lq2 : Weapons._lq, Weapons._ls);
      lm.setMatrixAt(n, Weapons._lm);
      lm.setColorAt(n, lc);
      n++;
    }
    FX.glow(tx, ty, tz, 1, 1, evo ? Weapons.C.gold : Weapons.C.hook, 0.5, 0);
    if (w.pulseT != null && w.pulseT < 0.18) {
      var pf = w.pulseT / 0.18;
      FX.glow(lerp(sx, tx, pf), lerp(sy, ty, pf), lerp(sz, tz, pf), 1.1, 1.1, Weapons.C.white, 0.8 * (1 - pf * 0.4), 0);
    }
  }
  lm.count = n;
  lm.visible = n > 0;
  if (n) { lm.instanceMatrix.needsUpdate = true; lm.instanceColor.needsUpdate = true; }
};

// 敌人身上的状态：被标记的敌人头顶一个跳动的红色准星；被火烧的敌人冒火星（中毒的绿色在 enemies.js 里）
Weapons.renderStatus = function (dt) {
  var L = Enemies.list, nm = 0, ne = 0, pulse = 0.75 + Math.sin(Game.time * 9) * 0.25, top = window.Evo && Evo.topOf;
  for (var i = 0; i < L.length; i++) {
    var e = L[i];
    if (!e.alive) continue;
    if (e.marked > 0 && nm < 60) {
      nm++;
      var hy = top ? Evo.topOf(e) + 0.35 : e.y + e.r * 2.4 + 0.4;
      FX.glow(e.x, hy, e.z, 0.95 * pulse, 0.95 * pulse, Weapons.C.mark, 0.75, 1);
      FX.glow(e.x, hy, e.z, 0.4, 0.4, Weapons.C.mark, 0.8, 3);
    }
    if (e.fireT > Game.time && !e.evoBurnListed && ne < 8 && Math.random() < dt * 6) {
      ne++;
      FX.mote(e.x + rand(-0.3, 0.3), e.y + e.r * rand(0.8, 1.8), e.z + rand(-0.3, 0.3), Math.random() < 0.5 ? 0xffb030 : 0xff6a1a, 0.15, rand(1, 2), 0.5);
    }
  }
};

// ============================================================
//  伤害数字：Enemies.damage 结算时告诉 FX 是哪个敌人（同一个敌人的数字合并）；
//  处决 / 斩杀的字交给 FX.execText 限流（FX.text 认出这一次的字），不显示的伤害加进头顶已有的数字里；
//  敌人自己的更新里结算的伤害（中毒、燃烧的持续伤害）算跳伤：同一个敌人 0.9 秒只出一个数字
//  （只改显示，伤害照旧）
// ============================================================
(function () {
  var dmg = Enemies.damage;
  Enemies.damage = function (e, d, crit, kx, kz, opts) {
    var prev = FX.dmgE, text = opts && opts.text;
    FX.dmgE = e;
    if (text) { FX.execE = e; FX.execS = text; }
    var r = dmg.apply(this, arguments);
    FX.execE = null;
    FX.dmgE = prev;
    if (!text && opts && opts.quiet && r > 0) FX.quietDmg(e, r);
    return r;
  };
  var upd = Enemies.update;
  Enemies.update = function () {
    FX.tickDmg = true;
    try { return upd.apply(this, arguments); } finally { FX.tickDmg = false; }
  };
})();
