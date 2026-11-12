'use strict';
// ============================================================
//  武器：自动攻击
//  近战（含骑枪冲锋 ram）、射击（从天而降 / 插地 / 冰冻 / 分裂 / 减速）、扇形飞刀、弹跳（马走日跳跃）、
//  回旋、信使链、光环、钟声波（ring）、环绕、地雷（蜡烛 / 捕兽夹）、颜料地、藤蔓足迹、飞锅、钓竿（reel）、提灯光束（beam）
//  外观：新武器的样子都走 Weapons.L（weapons_fx.js，没有就不画）；弹丸、拖尾、贴地圆盘走 fx.js 的批量绘制；
//  场地模型用对象池（死掉的场地把网格还回来，不反复新建网格和材质）
// ============================================================
var Weapons = { projs: [], zones: [], meshes: {}, lobs: [], zpool: {}, blasts: [], frame: 0 };

var UPG_LABEL = {
  damage: ['伤害', 'flat'], count: ['数量', 'flat'], size: ['范围', 'pct'], pspd: ['弹速', 'pct'], duration: ['持续时间', 'sec'],
  knockback: ['击退', 'flat'], bounces: ['弹跳', 'flat'], critChance: ['暴击率', 'pct'], critDmg: ['暴击伤害', 'pct'],
  pierce: ['穿透', 'flat']
};

// 弹丸种类：没有模型的用灵魂光球
Weapons.projKind = function (k) {
  return Weapons.meshes[k] ? k : 'soul';
};

// 弹丸动画参数（models_proj.js 的 PROJ_ANIM；没有就是空的）
Weapons.NOANIM = {};
Weapons.anim = function (kind) {
  var A = typeof PROJ_ANIM !== 'undefined' ? PROJ_ANIM : null;
  return (A && A[Weapons.baseKind(kind)]) || Weapons.NOANIM;
};

// 场地模型（飞锅等）的几何体：按种类缓存，没有模型的用飞斧
Weapons.zoneGeo = function (kind) {
  var c = Weapons._zg || (Weapons._zg = {}), k = Weapons.baseKind(kind) || 'axe';
  if (!c[k]) c[k] = MODEL.build(PROJ_MODELS[k] || PROJ_MODELS.axe);
  return c[k];
};

// 声音层的事件（audio_hooks.js 包一层）：ring / hook / land / ram / quake / stick / hop / trap / clang / split
Weapons.emit = function (name, w, x, z, a1) {};
// 同一帧同一把武器同一个事件只发一次
Weapons.emitOnce = function (name, w, x, z, a1) {
  var m = w._em || (w._em = {});
  if (m[name] === Weapons.frame) return;
  m[name] = Weapons.frame;
  Weapons.emit(name, w, x, z, a1);
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
  [['mark', 0xff3030]].forEach(function (p) { C[p[0]] = new THREE.Color(p[1]); });
  Weapons.swooshMat = new THREE.MeshBasicMaterial({ color: 0xdfe6ff, vertexColors: true, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  Weapons.swooshGoldMat = new THREE.MeshBasicMaterial({ color: 0xffd060, vertexColors: true, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
};

Weapons.clear = function () {
  Weapons.projs = [];
  Weapons.zones.forEach(Weapons.freeZone);
  Weapons.zones = [];
  Weapons.lobs = [];
  Weapons.dropBlasts();
  for (var k in Weapons.meshes) { Weapons.meshes[k].count = 0; Weapons.meshes[k].visible = false; }
  // 每把武器的临时状态（钩着的敌人、光束、冲锋记录）：上一关的敌人不能还被钩着
  var ws = typeof P !== 'undefined' && P.weapons ? P.weapons : [];
  for (var i = 0; i < ws.length; i++) Weapons.resetState(ws[i]);
};

Weapons.resetState = function (w) {
  if (w.hooks) { for (var j = 0; j < w.hooks.length; j++) Weapons.hookPool.push(w.hooks[j]); w.hooks.length = 0; }
  w.target = null;
  w.flaming = 0;
  if (w.ramHit) w.ramHit.clear();
  w.ramT = 0;
  if (w.ramOn) { w.ramOn = false; var L = Weapons.L; if (L && L.ram) L.ram(w, false); }
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
  if (z.type === 'ring' && z.hit) { z.hit.clear(); Weapons.setPool.push(z.hit); z.hit = null; }
};
Weapons.setPool = [];
Weapons.takeSet = function () { return Weapons.setPool.pop() || new Set(); };

// 武器颜色（缓存成 THREE.Color；超武的颜色单独缓存）
Weapons.colorOf = function (w) {
  var cache = w.def.evo ? (Weapons.wColorEvo || (Weapons.wColorEvo = {})) : Weapons.wColor;
  var c = cache[w.id];
  if (!c) c = cache[w.id] = new THREE.Color(w.def.color || 0xffffff);
  return c;
};

// 超武的弹丸种类叫 'kind@武器id'：按原来的种类做特殊处理（回旋弹丸平转等）
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
  'uniform float uMix;',
  'varying float vKind;',
  'varying float vAng;',
  'varying float vV;',
  'float hash(float n) { return fract(sin(n * 12.9898) * 43758.5453); }',
  'void main() {',
  '  vec4 o;',
  '  if (vKind < 0.5 || vKind > 2.5) {',
  '    vec3 c = vKind > 2.5 ? mix(uCol, vec3(1.0), uMix) : uCol;',
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

// mix：外圈的细线往白色混多少（默认 0.55；本来就很浅的颜色，比如圣咏的暖金，用小一点的值，免得发白）
Weapons.auraMat = function (color, mix) {
  return new THREE.ShaderMaterial({
    uniforms: { uCol: { value: new THREE.Color(color) }, uR: { value: 3.6 }, uHgt: { value: 0.8 }, uTime: { value: 0 }, uPulse: { value: 0 }, uCamAng: { value: 0 }, uMix: { value: mix != null ? mix : 0.55 }, uH: { value: new Float32Array(24) } },
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

// 每帧：跟着玩家，采样地面高度，跳伤时闪一下，冒几颗小光点（有 def.motes 的交给 Weapons.L.aura）
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
  var L = Weapons.L;
  if (w.def.motes && L && L.aura) L.aura(w, r, base, dt);
  else if (Math.random() < dt * 9) {
    var ma = Math.random() * TAU, mr = Math.sqrt(Math.random()) * r;
    FX.mote(P.pos.x + Math.cos(ma) * mr, base + 0.15, P.pos.z + Math.sin(ma) * mr, 0xeef6ff, 0.09, rand(0.9, 1.7), rand(0.6, 1.1));
  }
};

Weapons.give = function (id) {
  var def = WEAPONS[id];
  var s = {};
  for (var k in def.base) s[k] = def.base[k];
  var w = { id: id, def: def, level: 1, s: s, timer: 0.3, kills: 0, dmg: 0, perkN: 0 };   // perkN：拿过几次专属词条
  P.weapons.push(w);
  Weapons.attach(w);
  return w;
};

// 常驻视觉（光环圈；钟声的矮墙、鱼线这些在 Weapons.L.attach 里建）挂到场景上；换关时重新挂
Weapons.attach = function (w) {
  var def = w.def, L = Weapons.L;
  if (def.type === 'aura' && !w.ring) {
    w.ring = new THREE.Mesh(Weapons.auraGeo(), def.auraColor != null ? Weapons.auraMat(def.auraColor, 0.25) : Weapons.auraMat(0x8dbef8));
    w.ring.frustumCulled = false;
    w.ring.renderOrder = 3;
  }
  if (w.ring && !w.ring.parent) Weapons.scene.add(w.ring);
  if (w.ring2 && !w.ring2.parent) Weapons.scene.add(w.ring2);
  if (L && L.attach) L.attach(w);
};

Weapons.detach = function (w) {
  if (w.ring && w.ring.parent) w.ring.parent.remove(w.ring);
  if (w.ring2 && w.ring2.parent) w.ring2.parent.remove(w.ring2);
  var L = Weapons.L;
  if (L && L.detach) L.detach(w);
};

Weapons.find = function (id) {
  for (var i = 0; i < P.weapons.length; i++) if (P.weapons[i].id === id) return P.weapons[i];
  return null;
};

// ---------------- 升级：锻造路线 ----------------
// 每张卡：grow × 稀有度倍率；稀有起再加 up 里随机一条 × 倍率；传说再加专属 perk（不乘倍率，最多 max 次），
// 专属拿满以后换成另一条副词条。picks 的 kind：grow / up / perk
Weapons.rollUpgrade = function (w, rarity) {
  var def = w.def, m = RARITY_MULT[rarity], picks = [], k;
  if (def.grow) for (k in def.grow) picks.push({ stat: k, v: def.grow[k] * m, kind: 'grow' });
  var ups = def.up ? Object.keys(def.up) : [];
  if (rarity >= 2 && ups.length) {
    var u = ups[Math.floor(Math.random() * ups.length)];
    picks.push({ stat: u, v: def.up[u] * m, kind: 'up' });
    if (rarity === 4) {
      var pk = def.perk;
      if (pk && (w.perkN || 0) < pk.max) {
        for (k in pk) if (k !== 'max') picks.push({ stat: k, v: pk[k], kind: 'perk' });
      } else if (ups.length > 1) {
        var o = ups[ups[0] === u ? 1 : 0];
        picks.push({ stat: o, v: def.up[o] * m, kind: 'up' });
      }
    }
  }
  return picks;
};

// 没有 kind 的旧 picks 照样加；有专属词条的卡记一次 perkN
Weapons.applyUpgrade = function (w, picks) {
  w.level++;
  var perk = false;
  picks.forEach(function (p) { w.s[p.stat] = (w.s[p.stat] || 0) + p.v; if (p.kind === 'perk') perk = true; });
  if (perk) w.perkN = (w.perkN || 0) + 1;
  Relic.onUpgrade(w);   // 第 6 块：磨刀石（升级卡、勤学苦练、铁匠铺都走这里）
};

// 卡片上的数字（武器自己的数值 w.s）：precise = 前后印出来一样时多一位小数
Weapons.statNum = function (stat, v, precise) {
  var r1 = function (x) { return String(Math.round(x * 10) / 10); };
  if (precise) {
    if (stat === 'size' || stat === 'pspd') return (Math.round(v * 1000) / 10) + '%';
    if (stat === 'critChance' || stat === 'critDmg') return '+' + (Math.round(v * 1000) / 10) + '%';
    return v.toFixed(1);
  }
  switch (stat) {
    case 'damage': return v >= 10 ? String(Math.round(v)) : r1(v);
    case 'size': case 'pspd': return Math.round(v * 100) + '%';
    case 'count': return String(Math.floor(v + 1e-6));
    case 'bounces': case 'pierce': return String(Math.round(v));
    case 'critChance': case 'critDmg': return '+' + Math.round(v * 100) + '%';
    default: return r1(v);    // knockback、duration：一位小数
  }
};

// 武器卡的每一行：「伤害 15 → 17」「范围 110% → 125%」「专属：数量 2 → 3」「持续时间 4 → 4.7 秒」
// 在 w.s 的副本上依次算（同一属性的副词条和专属接着算）
Weapons.cardLines = function (w, picks) {
  var s = {}, k;
  for (k in w.s) s[k] = w.s[k];
  return picks.map(function (p) {
    var l = UPG_LABEL[p.stat];
    if (!l) return Weapons.upgradeText(p);
    var a = s[p.stat] || 0, b = a + p.v;
    s[p.stat] = b;
    var ta = Weapons.statNum(p.stat, a), tb = Weapons.statNum(p.stat, b);
    if (ta === tb) { ta = Weapons.statNum(p.stat, a, true); tb = Weapons.statNum(p.stat, b, true); }
    return (p.kind === 'perk' ? '专属：' : '') + l[0] + ' ' + ta + ' → ' + tb + (l[1] === 'sec' ? ' 秒' : '');
  });
};

// 专属词条的短句：「数量 +1」「穿透 +1」「范围 +20%」「持续时间 +0.4 秒」
Weapons.perkText = function (pk) {
  for (var k in pk) {
    if (k === 'max') continue;
    var l = UPG_LABEL[k] || [k, 'flat'], v = pk[k];
    if (l[1] === 'pct') return l[0] + ' +' + Math.round(v * 100) + '%';
    if (l[1] === 'sec') return l[0] + ' +' + (Math.round(v * 10) / 10) + ' 秒';
    return l[0] + ' +' + (Math.round(v * 10) / 10);
  }
  return '';
};

// 旧的一行写法（「+12% 范围」），兼容用
Weapons.upgradeText = function (p) {
  var l = UPG_LABEL[p.stat] || [STATS[p.stat] ? STATS[p.stat].name : p.stat, 'flat'];
  var v = p.v;
  if (l[1] === 'pct') return '+' + Math.round(v * 100) + '% ' + l[0];
  if (l[1] === 'sec') return '+' + (Math.round(v * 100) / 100) + ' 秒' + l[0];
  return '+' + (Math.round(v * 10) / 10) + ' ' + l[0];
};

// ---------------- 派生数值 ----------------
// 实际攻击速度：属性 × 被动的攻速倍率
Weapons.atk = function (w) { return P.st.atkSpeed * Passive.atkMult(w); };   // w：哪把武器（刀油按武器算）
Weapons.cd = function (w) { return w.s.cd / Weapons.atk(w); };
Weapons.count = function (w) { return Math.max(1, Math.floor((w.s.count || 1) + P.st.quantity + 1e-6)); };
Weapons.size = function (w) { return (w.s.size || 1) * P.st.size; };
Weapons.dur = function (w) { return (w.s.duration || 1) * P.st.duration; };
Weapons.speed = function (w) { return (w.def.speed || 20) * (w.s.pspd || 1) * P.st.projSpeed; };
Weapons.kb = function (w) { return (w.s.knockback || 0) * P.st.knockback * 3; };

// 命中时几率效果（超武特性用，evolution.js）
function proc(chance) { return Math.random() < chance; }

// ---------------- 命中后的武器参数（计划 §4.1） ----------------
// 减速的三种写法：数字 0.3（踩在里面每次跳伤续 0.5 秒）、数组 [0.3, 1]、对象 { k, t }；结果缓存在 def._slow
Weapons.slowOf = function (v) {
  if (v == null) return null;
  if (typeof v === 'number') return { k: v, t: 0.5 };
  if (v.length === 2) return { k: v[0], t: v[1] };
  return { k: v.k, t: v.t };
};
Weapons.defSlow = function (def) {
  if (def._slow === undefined) def._slow = Weapons.slowOf(def.slow);
  return def._slow;
};

// 燃烧：每秒 frac × 这次命中的伤害，持续 t 秒（和燃烧特性同一种算法；更强的持续伤害覆盖弱的，不叠加）
Weapons.burn = function (w, e, dealt, b) {
  if (!e.alive || e.prop || !b) return;
  Enemies.applyDot(e, dealt * b.frac, b.t);
  e.fireT = Math.max(e.fireT || 0, Game.time + b.t);
};

// 直接推开（不带伤害）：和 Enemies.damage 一样按体型打折
Weapons.push = function (e, dx, dz, v) {
  if (!e.alive || e.prop) return;
  var f = e.boss ? 0.03 : e.mini ? 0.1 : e.elite ? 0.3 : 1;
  e.kx += dx * v * f; e.kz += dz * v * f;
};

// 一次命中造成伤害以后：眩晕、燃烧、减速、冰冻、分裂、颜料标记（src：弹丸 / 场地，可以没有）
// 盾牌挡掉的命中 dealt = 0，不会走到这里
Weapons.after = function (w, e, dealt, src) {
  if (!(dealt > 0) || !e.alive) return;
  var def = w.def, sl, big = e.boss || e.mini;
  if (def.stunHit && !big && !e.prop && window.Evo && Math.random() < def.stunHit) Evo.stun(e, def.stunT || 0.5);
  if (def.burn) Weapons.burn(w, e, dealt, def.burn);
  if (def.slow && (sl = Weapons.defSlow(def))) {
    Enemies.slow(e, 1 - sl.k, sl.t);
    if (def.type === 'shot' && !e.prop) { e.mk = 'honey'; e.mkT = Game.time + sl.t; }
  }
  if (src && src.look === 'paint' && !e.prop) { e.mk = 'paint'; e.mkC = src.ci; e.mkT = Game.time + 1; }
  var ch = def.chill;
  if (ch && !big && !e.prop) {
    // 已经被减速（随便什么减速）的再中一次就冻住；然后总是减速
    if (e.slowT > 0 && e.slowK < 1) e.frozen = Math.max(e.frozen, ch.freeze);
    Enemies.slow(e, 1 - ch.slow, ch.t);
  }
  var sp = def.splitHit;
  if (sp && src && src.isProj && !src.frag && window.Evo && Evo.budget > 0 && Weapons.projs.length < 320) {
    Evo.budget--;
    var s2 = Math.sqrt(src.vx * src.vx + src.vz * src.vz) || 1;
    Evo.split(w, e, src.dmgMult, src.vx / s2, src.vz / s2, sp.n, sp.mult);
    Weapons.emitOnce('split', w, e.x, e.z);
    var L = Weapons.L;
    if (L && L.split) L.split(w, e.x, e.y + e.r, e.z);
  }
};

// 一次命中：计算各种加成、暴击、命中时效果
Weapons.hit = function (w, e, mult, kx, kz, opts) {
  if (!e.alive) return 0;
  var d = (w.s.damage || 0) * (mult || 1) * P.st.damage * Passive.dmgMult(e) * Relic.hitMult(w, e);   // 第 6 块：宝物的倍率（暴击之前）
  if (e.elite || e.boss || e.mini) d *= 1 + (P.st.eliteDmg || 0);
  if (e.marked > 0) d *= 2;
  if (P.rage > 0) d *= 2;
  var cc = P.st.critChance + (w.s.critChance || 0);
  var cm = P.st.critDmg + (w.s.critDmg || 0);
  if (cc > 1) cm += cc - 1;                    // 暴击率超过 100% 的部分：每多 1% 变成 +1% 暴击伤害（不再二次暴击）
  var crit = 0;
  if (Math.random() < cc) { crit = 1; d *= cm; }
  var kb = Weapons.kb(w);
  var dealt = Enemies.damage(e, d, crit, (kx || 0) * kb, (kz || 0) * kb, opts);
  if (crit && dealt > 0) Passive.onCrit(w, e, dealt);       // 暴击命中之后（目标可能已经死了）
  if (dealt > 0) Relic.afterHit(w, e, dealt, crit);         // 第 6 块：命中之后（火绒盒）
  var L = Weapons.L;
  if (dealt > 0 && !(opts && opts.quiet) && !FX.tickDmg && L && L.hit) L.hit(w, e, crit, dealt);
  // 击退带一点向上的力，把小怪打飞
  if (kb > 4 && !e.boss && !e.mini && !e.def.flyer && e.grounded && Math.random() < 0.5) { e.vy = Math.min(8, kb * 0.6); e.grounded = false; }
  if (!e.prop) w.dmg += dealt;                               // 木人（e.prop）挨的打不算进结算页每把武器的伤害
  if (!e.alive) w.kills++;
  if (w.evo && window.Evo) Evo.onHit(w, e, dealt, mult || 1, kx, kz);   // 超武命中特性（evolution.js）
  return dealt;
};
Weapons.QUIET = { quiet: true };

Weapons.origin = function () { return { x: P.pos.x, y: P.pos.y + 1.1, z: P.pos.z }; };

// ---------------- 排队的范围伤害 ----------------
// 跳跃落地、钓竿上岸的溅射：先记下来，Weapons.updateProjs 之后再结算（弹丸更新期间盾牌会挡带方向的命中）
Weapons.bpool = [];
Weapons.blast = function (w, x, y, z, r, mult, skip, push) {
  var b = Weapons.bpool.pop() || {};
  b.w = w; b.x = x; b.y = y; b.z = z; b.r = r; b.mult = mult; b.skip = skip || null; b.push = push || 0;
  Weapons.blasts.push(b);
  return b;
};
Weapons.flushBlasts = function () {
  var bs = Weapons.blasts;
  for (var i = 0; i < bs.length; i++) {
    var b = bs[i], w = b.w;
    Weapons._b = b;
    Enemies.inRadius(b.x, b.z, b.r, Weapons.blastHit);
    b.w = null; b.skip = null;
    Weapons.bpool.push(b);
  }
  bs.length = 0;
  Weapons._b = null;
};
Weapons.blastHit = function (e) {
  var b = Weapons._b;
  if (e === b.skip || Math.abs(e.y - b.y) > b.r + 1.5) return;
  var dx = e.x - b.x, dz = e.z - b.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  var dealt = Weapons.hit(b.w, e, b.mult, dx / d, dz / d);
  if (b.push) Weapons.push(e, dx / d, dz / d, b.push);
  Weapons.after(b.w, e, dealt, null);
};
Weapons.dropBlasts = function () {
  var bs = Weapons.blasts;
  for (var i = 0; i < bs.length; i++) { bs[i].w = null; bs[i].skip = null; Weapons.bpool.push(bs[i]); }
  bs.length = 0;
};

// ---------------- 主循环 ----------------
Weapons.update = function (dt) {
  FX.tickDmg = false;
  Weapons.frame++;
  for (var i = 0; i < P.weapons.length; i++) {
    var w = P.weapons[i];
    var type = w.def.type;
    if (type === 'aura' || type === 'orbit' || type === 'trail' || type === 'tether' || type === 'flame') {
      Weapons.updatePersistent(w, dt);
      continue;
    }
    if (w.def.ram) Weapons.ramUpdate(w, dt);
    w.timer -= dt;
    if (w.timer <= 0) { var ok = Weapons.fire(w); if (ok) Relic.onFire(w); w.timer = ok ? Weapons.cd(w) : 0.15; }   // 第 6 块：真的出手之后（旧箭袋）
  }
  Weapons.updateProjs(dt);
  Weapons.flushBlasts();
  Weapons.updateZones(dt);
  Weapons.render(dt);
};

Weapons.RANGE = 32;
Weapons._sky = { x: 0, y: 0, z: 0 };
Weapons._skyOver = { vx: 0, vz: 0, vy: 0, homing: 0, sky: true };

Weapons.fire = function (w) {
  var def = w.def, o = Weapons.origin(), n = Weapons.count(w), i, L = Weapons.L, xs = Relic.extraShots(w);   // 第 6 块：旧箭袋多的一发
  switch (def.type) {
    case 'melee': {
      var t = Enemies.nearest(o.x, o.z, 9 * Weapons.size(w));
      if (!t) return false;
      var ang = Math.atan2(t.x - o.x, t.z - o.z);
      for (i = 0; i < n; i++) Weapons.swing(w, ang + (i % 2 ? 0.5 : -0.5) * (i > 0 ? 1 : 0), i * 0.12);
      return true;
    }
    case 'shot': case 'bounce': case 'boomerang': {
      n += xs;   // 第 6 块：旧箭袋
      var targets = Enemies.nearestN(o.x, o.z, Weapons.RANGE, n);
      if (!targets.length) return false;
      if (def.fromSky) {
        // 星星从目标头顶 14 米直直落下（不追踪），碰到敌人或地面炸开
        var sk = Weapons._sky, so = Weapons._skyOver;
        so.vy = -Weapons.speed(w);
        for (i = 0; i < n; i++) {
          var st = targets[i % targets.length];
          sk.x = st.x + rand(-0.3, 0.3); sk.y = st.y + st.r + 14; sk.z = st.z + rand(-0.3, 0.3);
          Weapons.launch(w, sk, null, 0, 0, 1, so);
        }
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
      // 自动瞄准最近的敌人，扇形甩出 fan 把
      var tk = Enemies.nearest(o.x, o.z, Weapons.RANGE);
      if (!tk) return false;
      var base = Math.atan2(tk.x - o.x, tk.z - o.z), hd = Math.sqrt(dist2(o.x, o.z, tk.x, tk.z)) || 1;
      var dy = (tk.y + tk.r - o.y) / hd, fan = Math.round(def.fan || 5) + xs, spr = def.spread || 0.14;
      var mult = 1 + (n - 1) * 0.35;
      for (i = 0; i < fan; i++) Weapons.launch(w, o, null, base + (i - (fan - 1) / 2) * spr + rand(-0.03, 0.03), dy, mult);
      if (L && L.fan) L.fan(w, o, dy, base, fan);
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
    case 'mine': case 'puddle': {
      if (def.type !== 'mine' && !Enemies.nearest(o.x, o.z, Weapons.RANGE)) return false;
      for (i = 0; i < n; i++) Weapons.spawnZone(w, i);
      return true;
    }
    case 'ring': {
      // 铜钟：身边 range × 范围之内有敌人才敲；数量 n = 几圈钟声，后面每圈晚 ringGap 秒、伤害 extraMult
      // sizeK（晨昏钟 0.6，第 13 块 D-C13-5）：范围加成超过 1 的部分只按 sizeK 算（扩得太大一圈扫全屏）
      var sz = Weapons.size(w); if (def.sizeK && sz > 1) sz = 1 + (sz - 1) * def.sizeK;
      var R = (def.range || 5.5) * sz;
      if (!Enemies.nearest(P.pos.x, P.pos.z, R)) return false;
      for (i = 0; i < n; i++) {
        Weapons.zones.push({ type: 'ring', w: w, k: i, t: -i * (def.ringGap || 0.3), R: 0, R0: 0, Rmax: R, wt: def.waveTime || 0.45,
          life: (def.waveTime || 0.45) + 0.15, band: def.band || 1, mult: i ? (def.extraMult || 0.6) : 1, hit: Weapons.takeSet(), on: false, x: 0, y: 0, z: 0, tick: 0 });
      }
      return true;
    }
  }
  return false;
};

// ---------------- 近战 ----------------
Weapons.swing = function (w, ang, delay) {
  var def = w.def;
  var go = function () {
    var size = Weapons.size(w);
    var r = (def.range || 4) * size, arc = def.arc || 2;
    var o = Weapons.origin(), a = ang, L = Weapons.L;
    // 往镜头这边砍的刀光淡一点、小一点：不会糊满屏幕下半部分
    FX.slashA = Math.cos(a - P.yaw) < -0.3 ? 0.45 : 1;
    if (L && L.slash) L.slash(w, o.x, P.pos.y, o.z, r, a, arc);
    else FX.slash(o.x, P.pos.y, o.z, r, a, def.color, arc, def.evo, null);
    FX.slashA = 1;
    if (def.slamFx && L && L.slam) L.slam(w, o.x + Math.sin(a) * r * 0.8, P.pos.y, o.z + Math.cos(a) * r * 0.8, r);
    var fx = Math.sin(a), fz = Math.cos(a);
    Enemies.inRadius(o.x, o.z, r, function (e) {
      var ea = Math.atan2(e.x - o.x, e.z - o.z);
      var diff = Math.abs(((ea - a + Math.PI) % TAU + TAU) % TAU - Math.PI);
      if (diff > arc / 2 && dist2(o.x, o.z, e.x, e.z) > 2.2) return;
      if (Math.abs(e.y + e.r - o.y) > r + e.r) return;
      var dealt = Weapons.hit(w, e, 1, fx, fz);
      Weapons.after(w, e, dealt, null);
    });
    // 出师之剑：刀光中段 delay 秒后炸开一道剑痕
    var qk = def.quake;
    if (qk) {
      var qx = o.x + fx * r * 0.55, qz = o.z + fz * r * 0.55, qy = W.groundAt(qx, qz, P.pos.y + 2), qr = (qk.r || 2.2) * size;
      Weapons.zones.push({ type: 'quake', w: w, x: qx, y: qy, z: qz, t: -(qk.delay || 0.3), life: 1, r: qr, mult: qk.mult || 0.7, tick: 0 });
      if (L && L.quake) L.quake(w, qx, qy, qz, qr, 0);
    }
  };
  if (delay > 0) Game.later(delay, go); else go();
};

// ---------------- 骑枪冲锋（只在骑着坐骑、够快的时候） ----------------
// 只读 P.riding / P.speed() / P.vel，不改玩家的任何状态；每 0.15 秒扫一次速度方向的扇面，同一个敌人 cd 秒最多一次
Weapons.RAM_STEP = 0.15;
Weapons.ramUpdate = function (w, dt) {
  var rm = w.def.ram, L = Weapons.L, sp = P.speed();
  if (!(P.riding && sp >= rm.minSpeed)) {
    w.ramT = 0;
    if (w.ramOn) { w.ramOn = false; if (L && L.ram) L.ram(w, false); }
    return;
  }
  var fx = P.vel.x / sp, fz = P.vel.z / sp;
  w.ramOn = true;
  if (L && L.ram) L.ram(w, true, fx, fz, dt);
  w.ramT = (w.ramT || 0) + dt;
  while (w.ramT >= Weapons.RAM_STEP) {
    w.ramT -= Weapons.RAM_STEP;
    Weapons.ramPass(w, sp, fx, fz);
  }
};
Weapons.ramPass = function (w, sp, fx, fz) {
  var rm = w.def.ram, o = Weapons.origin(), r = (rm.range || 3) * Weapons.size(w), half = (rm.arc || 1.1) / 2;
  var a = Math.atan2(fx, fz), now = Game.time, cd = rm.cd || 0.45, L = Weapons.L;
  var mult = clamp(0.5 + sp / (rm.div || 16), 0.5, rm.maxMult || 3), n = 0;
  var hm = w.ramHit || (w.ramHit = new Map());
  if (hm.size > 400) hm.clear();
  Enemies.inRadius(o.x, o.z, r, function (e) {
    var ea = Math.atan2(e.x - o.x, e.z - o.z);
    var diff = Math.abs(((ea - a + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (diff > half) return;
    if (Math.abs(e.y + e.r - o.y) > r + e.r) return;
    var last = hm.get(e.id);
    if (last !== undefined && now - last < cd) return;
    hm.set(e.id, now);
    var dealt = Weapons.hit(w, e, mult, fx, fz);
    Weapons.after(w, e, dealt, null);
    if (L && L.ramHit) L.ramHit(w, e);
    n++;
  });
  if (n && now - (w.ramEmT == null ? -9 : w.ramEmT) >= 0.35) { w.ramEmT = now; Weapons.emitOnce('ram', w, P.pos.x, P.pos.z, sp); }
};

// ---------------- 弹丸 ----------------
Weapons.launch = function (w, o, t, ang, vyDir, dmgMult, over) {
  var def = w.def, sp = Weapons.speed(w), size = Weapons.size(w);
  var dx = Math.sin(ang), dz = Math.cos(ang);
  var vy;
  if (vyDir != null) vy = vyDir * sp;
  else if (t) {
    var hd = Math.sqrt(dist2(o.x, o.z, t.x, t.z)) || 1;
    vy = (t.y + t.r - o.y) / hd * sp;
  }
  else vy = 0;
  // 种类：按逻辑种类（def.proj 去掉超武后缀）取动画参数；有几种花色的轮流用
  var lk = Weapons.baseKind(def.proj), an = Weapons.anim(lk);
  if (an.variants > 1) { var vi = (w.varN = ((w.varN || 0) + 1) % an.variants); if (vi) lk = lk + vi; }
  // 超武（含分裂碎片的替身武器）用金色的那一份网格
  var kind = Weapons.projKind(lk), gold = def.evo && window.Evo;
  if (gold) kind = Evo.kindOf(kind, w.id);
  var p = {
    w: w, kind: kind, x: o.x, y: o.y, z: o.z, vx: dx * sp, vy: vy, vz: dz * sp, isProj: true, an: an,
    r: (def.projR || 0.5) * size, life: (def.life || 1.6) * (w.s.duration && def.type === 'shot' && def.homing ? Weapons.dur(w) : 1),
    pierce: Math.round(w.s.pierce || 0), bounces: Math.round(w.s.bounces || 0),
    hit: new Set(), t: 0, spin: def.spin || 0, grav: 0, scale: size, dmgMult: dmgMult || 1, homing: def.homing || 0, explode: !!def.explode
  };
  if (an.back) { p.kindB = Weapons.projKind(an.back); if (gold) p.kindB = Evo.kindOf(p.kindB, w.id); }
  if (def.type === 'bounce') { p.grav = 16; p.vy = 6; p.life = 3; }
  if (def.hop) {
    // 马走日：抛物线跳过去（0.9 秒落地），空中碰到的敌人各打一次，落地砸一小片再跳向下一个
    p.hop = true; p.grav = 20; p.vy = 9; p.life = def.life || 4; p.spin = 0;
    p.hops = new Set();
    var hs = t ? clamp(Math.sqrt(dist2(o.x, o.z, t.x, t.z)) / 0.9, 4, sp) : sp;
    p.vx = dx * hs; p.vz = dz * hs;
    if (t) p.hops.add(t.id);
  }
  if (def.type === 'boomerang') { p.boom = true; p.out = (def.out || 14) * Math.sqrt(size); p.ox = o.x; p.oz = o.z; p.pierce = 999; p.life = 4; p.bsp = sp; }
  if (over) for (var k in over) p[k] = over[k];
  if (def.type === 'shotgun') p.tk = 1.8;   // 扇形飞刀飞不远：拖尾拉长一点，看得出扇面
  if (Passive.onLaunch) Passive.onLaunch(w, p);   // 被动改弹丸（小丑：攒下的弹跳）
  Weapons.projs.push(p);
  // 开火闪光（分裂碎片和扇形飞刀不算，飞刀有 L.fan；同一帧同一把武器只闪一次，在 Weapons.L.muzzle 里判断）
  var L = Weapons.L;
  if (!w.frag && def.type !== 'shotgun' && L && L.muzzle) L.muzzle(w, p, o, dx, dz, sp ? vy / sp : 0, size);
  return p;
};

// 投枪插在地上：变成一个场地，delay 秒后震开周围的敌人（插着的投枪在 Weapons.render 里画）
Weapons.stickZone = function (p, gy) {
  var w = p.w, sk = w.def.stick, size = Weapons.size(w);
  Weapons.zones.push({ type: 'stick', w: w, x: p.x, y: gy, z: p.z, yaw: Math.atan2(p.vx, p.vz), t: -(sk.delay || 0.4), life: 1,
    r: (sk.r || 2.2) * size, k: sk.k || 0.8, kind: p.kind, scale: p.scale || 1, tick: 0 });
};

// 弹丸结束（寿命到、落地、穿透用完）：投枪插地
Weapons.endProj = function (p, gy) {
  if (p.ended) return;
  p.ended = true;
  if (p.w && p.w.def && p.w.def.stick && !p.frag) Weapons.stickZone(p, gy);
};

Weapons.updateProjs = function (dt) {
  var ps = Weapons.projs, L = Weapons.L;
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
    // 追踪（回旋的猎隼只在飞出去的路上追）
    if (p.homing && !p.back) {
      var ht = Enemies.nearest(p.x, p.z, 16, p.hit);
      if (ht) {
        var hx = ht.x - p.x, hy = ht.y + ht.r - p.y, hz = ht.z - p.z, hd = Math.sqrt(hx * hx + hy * hy + hz * hz) || 1;
        var sp = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        var k = Math.min(1, dt * p.homing);
        p.vx = lerp(p.vx, hx / hd * sp, k); p.vy = lerp(p.vy, hy / hd * sp, k); p.vz = lerp(p.vz, hz / hd * sp, k);
        // 猎隼转弯不减速：插值会把速度越插越短（在人堆里越飞越慢、回不来），按出手时的速度放回去
        if (p.bsp) {
          var ns = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz) || 1, f = p.bsp / ns;
          p.vx *= f; p.vy *= f; p.vz *= f;
        }
      }
    }
    if (p.boom) {
      var od = Math.sqrt(dist2(p.x, p.z, p.ox, p.oz));
      // 飞够远、或者飞出去的时间够飞直线到 out 了（一路追着拐弯），就往回飞
      if (!p.back && (od > p.out || p.t > p.out / p.bsp + 0.4)) { p.back = true; p.hit.clear(); }
      if (p.back) {
        // 往回飞：按出手时的速度掉头。以前是把速度往反方向插值，正对着飞出去的时候速度越插越小，停在半路回不来
        // 转弯快慢：每秒至少 7 弧度，离骑士越近转得越快（转弯半径不超过离骑士距离的 1/1.2），不会绕着骑士转圈落不到手臂上
        var bx = P.pos.x - p.x, bz = P.pos.z - p.z, bd = Math.sqrt(bx * bx + bz * bz) || 1;
        var bs = p.bsp || Math.sqrt(p.vx * p.vx + p.vz * p.vz);
        var ca = Math.atan2(p.vx, p.vz), da = ((Math.atan2(bx, bz) - ca + Math.PI) % TAU + TAU) % TAU - Math.PI;
        ca += Math.min(Math.abs(da), dt * Math.max(7, 1.2 * bs / bd)) * (da < 0 ? -1 : 1);
        p.vx = Math.sin(ca) * bs; p.vz = Math.cos(ca) * bs;
        p.vy = (P.pos.y + 1.1 - p.y) * 4;
        if (bd < 1.4) p.life = 0;
      }
    }
    p.vy -= p.grav * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    var gy = W.groundAt(p.x, p.z, p.y + 1);
    if (p.y < gy + 0.15) {
      if (p.hop) { if (p.vy < 0) Weapons.hopLand(p, gy); else p.y = gy + 0.15; }
      else if (p.explode) { Weapons.explode(p); p.life = 0; }
      else if (p.grav && p.bounces >= 0) {
        p.y = gy + 0.15; p.vy = Math.abs(p.vy) * 0.6 + 4;
        p.sq = 0.06;
        if (Weapons.dustN < 6) { Weapons.dustN++; FX.burst(p.x, gy + 0.1, p.z, 2, 0x8a7a5a, 2, 0.16); }
      }
      else if (!p.boom && !p.homing) {
        p.y = gy + 0.15; p.vy = 0;
        // 投枪：落地以后贴着地面再滑一段（剩下的每层穿透 2 米，起伏的地面上也能扎到身后的敌人），滑够了才插住
        if (p.w && p.w.def.stick && !p.frag) {
          p.slid = (p.slid || 0) + Math.sqrt(p.vx * p.vx + p.vz * p.vz) * dt;
          if (p.slid >= 2 * (p.pierce + 1)) p.life = 0;
        }
        if (!p.dusted && p.w && p.w.def.type === 'shotgun' && Weapons.dustN < 6) { p.dusted = true; Weapons.dustN++; FX.burst(p.x, gy + 0.1, p.z, 3, 0x8a7a5a, 2.5, 0.2); }
      }
      else if (p.homing) p.y = gy + 0.15;
    }
    // 弹射以后目标没了、一路往天上飞的弩箭：飞到离地 10 米以上就收掉（不会在山顶上空留下乱飞的亮点）
    if ((p.bnc || p.frag) && p.vy > 0 && p.y - gy > 10) p.life = 0;
    if (p.life <= 0) {
      if (p.w && p.w.def.type === 'shotgun' && !p.dusted && Weapons.dustN < 6) { Weapons.dustN++; FX.burst(p.x, Math.max(gy, p.y - 0.5) + 0.1, p.z, 3, 0x8a7a5a, 2.5, 0.2); }
      Weapons.endProj(p, gy);
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
      if (p.soul) {
        if (p.blastR) { Weapons.soulBlast(p); p.life = 0; return false; }   // 兔子：碰到就炸开
        var sd = Enemies.damage(e, p.soulDmg, 0, p.vx / s2, p.vz / s2);
        if (p.onHit) p.onHit(p, e, sd);
      }
      else {
        var dealt = Weapons.hit(p.w, e, p.dmgMult, p.vx / s2, p.vz / s2);
        Weapons.after(p.w, e, dealt, p);
      }
      if (p.hop) return;                       // 跳在半空的棋子：碰到谁打谁，不改路线、不结束
      if (p.spin && p.grav) p.sq = 0.06;   // 砸中：压扁一下
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
          return false;
        }
      }
      p.life = 0;
      return false;
    });
    if (p.life <= 0) { Weapons.endProj(p, W.groundAt(p.x, p.z, p.y + 1)); ps.splice(i, 1); }
  }
};

// 马走日落地：砸一小片（排队结算），还有弹跳次数就跳向下一个没跳过的敌人
Weapons.hopLand = function (p, gy) {
  var w = p.w, def = w.def, r = (def.hopR || 1.4) * Weapons.size(w), L = Weapons.L;
  p.y = gy + 0.15;
  Weapons.blast(w, p.x, gy, p.z, r, def.hopMult || 0.5, null, 0);
  if (L && L.hop) L.hop(w, p.x, gy, p.z, r);
  Weapons.emitOnce('hop', w, p.x, p.z);
  p.landN = (p.landN || 0) + 1;
  var nt = p.bounces > 0 ? Enemies.nearest(p.x, p.z, 14, p.hops) : null;
  if (!nt) { p.life = 0; return; }
  p.bounces--;
  p.hops.add(nt.id);
  var nx = nt.x - p.x, nz = nt.z - p.z, nd = Math.sqrt(nx * nx + nz * nz) || 1;
  var hs = clamp(nd / 0.9, 4, Weapons.speed(w));
  p.vx = nx / nd * hs; p.vz = nz / nd * hs; p.vy = 9;
  p.life = Math.max(p.life, 1.5);
};

Weapons.boomOpt = function (w) { var L = Weapons.L; return L && L.boomOpt ? L.boomOpt(w) : null; };

Weapons.explode = function (p) {
  var w = p.w, r = (w.def.blast || 3) * Weapons.size(w);
  FX.boom(p.x, p.y, p.z, r, w.def.color || 0xff7a2a, Weapons.boomOpt(w));
  Enemies.inRadius(p.x, p.z, r, function (e) {
    if (Math.abs(e.y - p.y) > r + 1.5) return;
    var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    var dealt = Weapons.hit(w, e, p.dmgMult, dx / d, dz / d);
    Weapons.after(w, e, dealt, null);
  });
};

// ---------------- 闪电 / 信鸽 ----------------
// chainLook：外观交给 Weapons.L（信鸽、鼓）；noSplash：第一个目标身边不溅射（信鸽）
Weapons.chain = function (w, first, jumps) {
  if (!first.alive) return;
  var def = w.def, cur = first, hit = new Set(), L = Weapons.L, look = def.chainLook && L && L.chain;
  var reach = 9 * Weapons.size(w);
  var gy = first.y + first.r;
  if (look) { if (L.chainStart) L.chainStart(w, first); L.chain(w, 0, first.x, gy + 18, first.z, first.x, gy, first.z); }
  else {
    FX.bolt(first.x, gy + 18, first.z, first.x, gy, first.z);
    // 落点：3 颗白色火花；冲击环（超武的金环在 evolution.js 里画，这里就不画蓝环了）
    FX.burst(first.x, gy, first.z, 3, 0xffffff, 5, 0.15);
    if (!w.def.evo && !def.noSplash) FX.ring(first.x, first.y, first.z, 1.6 * Weapons.size(w), 0xbfe0ff, 0.25);
  }
  if (!def.noSplash) Enemies.inRadius(first.x, first.z, 1.6 * Weapons.size(w), function (e) { if (e !== first) Weapons.hit(w, e, 0.5, 0, 0); });
  var px = first.x, py = gy, pz = first.z;
  for (var j = 0; j <= jumps && cur; j++) {
    if (j > 0) { if (look) L.chain(w, j, px, py, pz, cur.x, cur.y + cur.r, cur.z); else FX.bolt(px, py, pz, cur.x, cur.y + cur.r, cur.z); }
    hit.add(cur.id);
    Weapons.hit(w, cur, 1, 0, 0);
    px = cur.x; py = cur.y + cur.r; pz = cur.z;
    cur = Enemies.nearest(px, pz, reach, hit);
  }
};

// ---------------- 常驻武器 ----------------
// 位置对象重复使用（每帧不新建）
Weapons.orbAt = function (w, i, x, y, z) {
  var o = w.orbs[i] || (w.orbs[i] = { x: 0, y: 0, z: 0, a: 0 });
  o.x = x; o.y = y; o.z = z;
  return o;
};

Weapons.hookPool = [];

Weapons.updatePersistent = function (w, dt) {
  var def = w.def, size = Weapons.size(w), L = Weapons.L;
  w.tick = (w.tick || 0) - dt;
  switch (def.type) {
    case 'aura': {
      var r = (def.range || 3.5) * size;
      if (w.ring) Weapons.auraLook(w, r, dt);
      if (w.tick <= 0) {
        w.tick = Weapons.cd(w);
        w.pulse = 1;
        FX.tickDmg = true;
        Enemies.inRadius(P.pos.x, P.pos.z, r, function (e) {
          if (Math.abs(e.y - P.pos.y) > 3.5) return;
          var dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          Weapons.hit(w, e, 1, dx / d, dz / d);
        });
        FX.tickDmg = false;
      }
      return;
    }
    case 'orbit': {
      var n = Weapons.count(w), rad = (def.range || 3.2) * Math.sqrt(size), hr = (def.hitR || 0.8) * size;
      // 被动的攻速（发条、钟声、军旗……）让它转得更快：每个敌人的再打冷却从来卡不住，只加冷却等于没加
      w.ang = (w.ang || 0) + dt * 2 * (w.s.pspd || 1) * P.st.projSpeed * Passive.atkMult(w);
      w.orbs = w.orbs || [];
      w.cool = w.cool || new Map();
      w.orad = rad;
      for (var i = 0; i < n; i++) {
        var a = w.ang + i / n * TAU;
        var ox = P.pos.x + Math.cos(a) * rad, oz = P.pos.z + Math.sin(a) * rad;
        Weapons.orbAt(w, i, ox, P.pos.y + 0.8, oz).a = a;
        Enemies.inRadius(ox, oz, hr, function (e) {
          var last = w.cool.get(e.id);
          if (last !== undefined && Game.time - last < Weapons.cd(w)) return;
          w.cool.set(e.id, Game.time);
          var dx = e.x - P.pos.x, dz = e.z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
          var dealt = Weapons.hit(w, e, 1, dx / d, dz / d);
          Weapons.after(w, e, dealt, null);
        });
      }
      w.orbs.length = n;
      if (w.cool.size > 800) w.cool.clear();
      return;
    }
    case 'trail': {
      if (w.tick <= 0 && P.speed() > 1.5 && P.onGround) {
        w.tick = Math.max(0, w.tick + Weapons.cd(w));   // 余数留到下一段（帧率不同段数一样），一帧最多一段（第 13 块 P3）
        Weapons.trailZone(w);
      }
      return;
    }
    case 'tether': {
      // 钓竿：钩住最近的 count 个敌人，只打钩住的那个；把它拽过来，拽到 landR 以内摔上岸（3 倍伤害 + 溅射）
      var range = (def.range || 15) * Math.sqrt(size), hs = w.hooks || (w.hooks = []);
      if (!hs.length && w.tick <= 0) {
        var tgs = Enemies.nearestN(P.pos.x, P.pos.z, range, Weapons.count(w));
        if (tgs.length) {
          for (var j = 0; j < tgs.length; j++) {
            var hk = Weapons.hookPool.pop() || {};
            hk.e = tgs[j]; hk.left = Weapons.dur(w); hk.tick = 0;
            hs.push(hk);
          }
          Weapons.emitOnce('hook', w, P.pos.x, P.pos.z);
        } else w.tick = 0.3;
      }
      if (!hs.length) { w.target = null; return; }
      for (var q = hs.length - 1; q >= 0; q--) {
        if (Weapons.reelHook(w, hs[q], range, dt)) {
          Weapons.hookPool.push(hs[q]);
          hs.splice(q, 1);
        }
      }
      if (hs.length) w.target = hs[0].e;
      else { w.target = null; w.tick = Weapons.cd(w); }
      return;
    }
    case 'flame': {
      // 提灯：瞄一次（扫过去的正中间经过最近的敌人），然后不再跟着转；方向一次左一次右
      var bl = (def.range || 11) * size;
      if (w.tick <= 0 && !w.flaming) {
        var ft = Enemies.nearest(P.pos.x, P.pos.z, bl);
        if (ft) {
          w.flaming = Weapons.dur(w);
          w.fdir = -w.fdir || 1;
          w.fsweep = (def.spin || 1.2) * w.flaming;
          w.fang0 = w.fang = Math.atan2(ft.x - P.pos.x, ft.z - P.pos.z) - w.fdir * w.fsweep / 2;
          w.ftick = 0;
        } else w.tick = 0.3;
      }
      if (w.flaming) {
        w.flaming -= dt; w.ftick -= dt;
        w.fang += w.fdir * (def.spin || 1.2) * dt;
        var fx = Math.sin(w.fang), fz = Math.cos(w.fang);
        if (L && L.beam) L.beam(w, fx, fz, bl, dt);
        if (w.ftick <= 0) {
          w.ftick = Math.max(0, w.ftick + (def.tick || 0.08) / Weapons.atk(w));   // 余数留到下一跳（帧率不同跳数一样），一帧最多一跳
          Weapons.beamTick(w, bl, fx, fz);
        }
        if (w.flaming <= 0) { w.flaming = 0; w.tick = Weapons.cd(w); }
      }
      return;
    }
  }
};

// 一根鱼线：返回 true = 放开（目标死了、时间到、跑太远、上岸了）
Weapons.reelHook = function (w, h, range, dt) {
  var def = w.def, e = h.e, L = Weapons.L;
  h.left -= dt;
  if (!e.alive || h.left <= 0) return true;
  var dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > range * 1.5) return true;
  var ux = d > 1e-6 ? dx / d : 0, uz = d > 1e-6 ? dz / d : 0;
  // 只打钩住的这一个
  h.tick -= dt;
  if (h.tick <= 0) {
    h.tick = Math.max(0, h.tick + 0.3 / Weapons.atk(w));   // 余数留到下一跳，一帧最多一跳
    FX.tickDmg = true;
    var dealt = Weapons.hit(w, e, 1, 0, 0);
    FX.tickDmg = false;
    Weapons.after(w, e, dealt, null);
    if (!e.alive) { if (!e.prop) Passive.onReel(w, e); return true; }   // 钓死在线上也算钓上一条
  }
  if (d <= (def.landR || 2.2)) {
    // 上岸：狠狠一摔，周围的敌人被溅到、被推开
    var dl = Weapons.hit(w, e, def.landK || 3, -ux, -uz);
    Weapons.after(w, e, dl, null);
    Weapons.blast(w, e.x, e.y, e.z, (def.splashR || 3) * Math.sqrt(Weapons.size(w)), 1, e, 8);
    Weapons.emitOnce('land', w, e.x, e.z);
    if (L && L.land) L.land(w, e);
    if (!e.prop) Passive.onReel(w, e);                 // 渔夫：鱼篓里多一条鱼
    return true;
  }
  // 拽过来：直接给击退速度（每帧覆盖，不累加）；Boss、小 Boss、道具拽不动，精英 0.3 倍
  // 下一帧 Enemies.update 先把击退乘 exp(−7·dt) 再走：这里先除掉，拽的速度在 30 / 60 / 120 帧都是 pull（第 13 块 P4）
  if (!e.boss && !e.mini && !e.prop) {
    var f = (def.pull || 7) * (e.elite ? 0.3 : 1) * Math.exp(7 * dt);
    e.kx = ux * f; e.kz = uz * f;
  }
  if (L && L.reel) L.reel(w, h, dt);
  return false;
};

// 光束跳伤：beamW 以内（半角）、距离 bl 以内、高度差 3 米以内的敌人
Weapons.beamTick = function (w, bl, fx, fz) {
  var half = w.def.beamW || 0.15, a = w.fang, L = Weapons.L;
  FX.tickDmg = true;
  Enemies.inRadius(P.pos.x, P.pos.z, bl, function (e) {
    if (Math.abs(e.y - P.pos.y) > 3) return;
    var ea = Math.atan2(e.x - P.pos.x, e.z - P.pos.z);
    var diff = Math.abs(((ea - a + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (diff >= half) return;
    var dealt = Weapons.hit(w, e, 1, fx, fz);
    Weapons.after(w, e, dealt, null);
    if (dealt > 0 && L && L.beamHit) L.beamHit(w, e);
  });
  FX.tickDmg = false;
};

// 旧的格挡武器已删；Passive.blocks 还在调（第 5 块的被动不再格挡）
Weapons.aegisBlock = function () { return false; };

// ---------------- 场地类 ----------------
Weapons.MINE_CAP = 40;
Weapons.spawnZone = function (w, idx) {
  var def = w.def, size = Weapons.size(w);
  var t = Enemies.nearestN(P.pos.x, P.pos.z, Weapons.RANGE, idx + 1)[idx] || Enemies.nearest(P.pos.x, P.pos.z, Weapons.RANGE);
  var z = { w: w, type: def.type, t: 0, life: Weapons.dur(w), r: (def.range || 2.5) * size, tick: 0 };
  if (def.type === 'mine') {
    var ma = Math.random() * TAU, mr = rand(2, 7);
    z.x = P.pos.x + Math.cos(ma) * mr; z.z = P.pos.z + Math.sin(ma) * mr; z.armed = 0.5;
    z.life = 10 + Weapons.dur(w) * 2;
    z.model = def.zoneModel || 'mine';
    z.trigR = (def.trigR || 1.6) * size;
    Weapons.mineCap(w);
  } else {
    if (!t) return;
    z.x = t.x + rand(-1, 1) * Math.min(idx, 1); z.z = t.z + rand(-1, 1) * Math.min(idx, 1);
  }
  z.y = W.groundAt(z.x, z.z, P.pos.y + 3);
  if (def.type === 'mine') {
    var zm = ZONE_MODELS, g = zm[z.model] || zm.mine;
    z.mesh = Weapons.takeMesh('mine:' + z.model + (w.evo ? '@' + w.id : ''), function () { return new THREE.Mesh(g, MODEL.material()); });
    z.mesh.geometry = g;      // 捕兽夹合上时换过几何体：每次拿出来都放回原样
    z.gkey = 'mine:' + z.model;
  } else if (def.type === 'puddle') {
    // 先扔一个桶 / 一挂鞭炮过去（0.25 秒），落地才显出来，伤害照旧马上开始
    z.vis0 = 0.25; z.seed = Math.random() * TAU;
    z.look = def.look || null;
    z.ci = (w.lobN = (w.lobN || 0) + 1) - 1;
    z.ci %= 7;
    z.sl = FX.slope(z.x, z.z, z.r, z.y, [0, 0]);
    Weapons.lob(w, z);
  }
  if (z.mesh) z.mesh.position.set(z.x, z.y, z.z);
  Weapons.zones.push(z);
};

// 一把武器活着的地雷超过 40 个：最老的那个原地炸掉（iPad 上的性能保护）
Weapons.mineCap = function (w) {
  var zs = Weapons.zones, n = 0, old = null;
  for (var i = 0; i < zs.length; i++) {
    var z = zs[i];
    if (z.type !== 'mine' || z.w !== w || z.fired) continue;
    n++;
    if (!old && !z.fireNow) old = z;
  }
  if (n >= Weapons.MINE_CAP && old) old.fireNow = true;
};

// 藤蔓足迹：脚下一小片带刺的地（全场最多 60 片）
Weapons.TRAIL_CAP = 60;
Weapons.trailZone = function (w) {
  var zs = Weapons.zones, n = 0;
  for (var i = 0; i < zs.length; i++) if (zs[i].type === 'trail') n++;
  if (n >= Weapons.TRAIL_CAP) return null;
  var def = w.def, x = P.pos.x, z = P.pos.z;
  var zz = { w: w, type: 'trail', t: 0, life: Weapons.dur(w), r: (def.range || 1.5) * Weapons.size(w), tick: 0, x: x, z: z, look: def.trailLook || null, seed: Math.random() * TAU };
  zz.y = W.groundAt(x, z, P.pos.y + 2);
  zz.sl = FX.slope(x, z, zz.r, zz.y, [0, 0]);
  zs.push(zz);
  return zz;
};

Weapons.throwAxe = function (w, t, idx) {
  var size = Weapons.size(w), def = w.def;
  var z = { w: w, type: 'axe', t: 0, x: P.pos.x, y: P.pos.y + 1.2, z: P.pos.z, tx: t.x + rand(-1.5, 1.5) * idx, tz: t.z + rand(-1.5, 1.5) * idx, life: 99, hover: Weapons.dur(w) + 0.4, r: 1.6 * size, tick: 0 };
  var evo = !!w.evo, g = Weapons.zoneGeo(def.proj), kind = Weapons.baseKind(def.proj);
  z.kind = kind;
  z.flat = !!Weapons.anim(kind).flat;
  z.mesh = Weapons.takeMesh('axe:' + kind + (evo ? '@' + w.id : ''), function () { return new THREE.Mesh(g, MODEL.material()); });
  z.mesh.geometry = g;
  z.gkey = 'axe:' + kind;
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

// 扔过去的桶 / 鞭炮：抛物线（只是外观）；kind 是飞着的模型
Weapons.lob = function (w, z) {
  var o = Weapons.origin();
  Weapons.lobs.push({ x0: o.x, y0: o.y + 0.2, z0: o.z, x1: z.x, y1: z.y + 0.3, z1: z.z, t: 0, life: 0.25, evo: !!w.evo, kind: Weapons.projKind(w.def.lob || 'bucket'), look: z.look, w: w, ci: z.ci });
};

Weapons.updateLobs = function (dt) {
  var B = Weapons.lobs, L = Weapons.L;
  for (var i = B.length - 1; i >= 0; i--) {
    var b = B[i];
    b.t += dt;
    if (b.t >= b.life) {
      if (L && L.lobLand) L.lobLand(b);
      B.splice(i, 1);
    }
  }
};

// 地面圆盘叠在一起时变淡：数一数中心离得很近的同类圆盘（一次扔好几片、藤蔓一路连着，叠起来不会变成一整块地毯）
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

// 场地伤害用的临时变量（回调里读，不每帧建闭包）
Weapons._z = null;
Weapons.zoneTickHit = function (e) {
  var z = Weapons._z;
  if (Math.abs(e.y - z.y) > 3) return;
  var dealt = Weapons.hit(z.w, e, 1, 0, 0, Math.random() < 0.5 ? Weapons.QUIET : null);
  Weapons.after(z.w, e, dealt, z);
};
Weapons.zoneBlastHit = function (e) {
  var z = Weapons._z;
  var r = z.br || z.r;
  if (Math.abs(e.y - z.y) > r + 1.5) return;
  var dx = e.x - z.x, dz = e.z - z.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
  var dealt = Weapons.hit(z.w, e, z.mult, dx / d, dz / d);
  Weapons.after(z.w, e, dealt, null);
};

Weapons.updateZones = function (dt) {
  var zs = Weapons.zones, L = Weapons.L;
  Weapons.updateLobs(dt);
  for (var i = zs.length - 1; i >= 0; i--) {
    var z = zs[i], w = z.w;
    z.t += dt;
    z.tick -= dt;
    var dead = z.t >= z.life;
    switch (z.type) {
      case 'mine': {
        z.armed -= dt;
        z.mesh.position.set(z.x, z.y + 0.1, z.z);
        if (z.shut > 0) {
          // 捕兽夹合上以后再留 0.6 秒，不再触发
          z.shut -= dt;
          dead = z.shut <= 0;
          break;
        }
        if (z.armed <= 0 || z.fireNow) {
          if (L && L.mine) L.mine(z, dt);
          var trig = !!z.fireNow;
          if (!trig) Enemies.inRadius(z.x, z.z, z.trigR || 1.6, function () { trig = true; return false; });
          if (trig || dead) { Weapons.mineFire(z); dead = !(z.shut > 0); }
        }
        break;
      }
      case 'puddle': case 'trail': {
        var fade = Math.min(1, (z.life - z.t) * 2);
        if (z.vis0) fade *= clamp((z.t - z.vis0) / 0.15, 0, 1);
        if (z.tick <= 0) {
          z.tick = Math.max(0, z.tick + (z.type === 'trail' ? 0.3 : 0.25));   // 余数留到下一跳，一帧最多一跳（第 13 块 P3）
          FX.tickDmg = true;
          Weapons._z = z;
          Enemies.inRadius(z.x, z.z, z.r, Weapons.zoneTickHit);
          Weapons._z = null;
          FX.tickDmg = false;
        }
        if (L && L.zone) L.zone(z, fade, Weapons.overlap(z, zs), dt);
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
        if (z.tick <= 0) {
          z.tick = Math.max(0, z.tick + (w.def.tick || 0.2));   // 余数留到下一跳，一帧最多一跳（第 13 块 P3）
          var hn = 0;
          Enemies.inRadius(z.x, z.z, z.r, function (e) {
            var dx = e.x - z.x, dz = e.z - z.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
            var dealt = Weapons.hit(w, e, 1, dx / d, dz / d);
            Weapons.after(w, e, dealt, null);
            if (dealt > 0) hn++;
          });
          if (hn) { if (L && L.clang) L.clang(z); Weapons.emitOnce('clang', w, z.x, z.z); }
        }
        break;
      }
      case 'ring': {
        // 钟声：t < 0 还没敲；敲响时定在玩家脚下，半径从 0 线性涨到 Rmax（waveTime 秒）
        if (z.t < 0) { dead = false; break; }
        if (!z.on) {
          z.on = true;
          z.x = P.pos.x; z.z = P.pos.z; z.y = W.groundAt(z.x, z.z, P.pos.y + 1);
          if (z.k > 0) Weapons.emitOnce('ring', w, z.x, z.z, z.k);
        }
        if (z.R < z.Rmax) {
          // 涨到 Rmax 的那一帧还打；之后只剩 0.15 秒的淡出，不再打
          z.R0 = z.R;
          z.R = z.Rmax * Math.min(1, z.t / z.wt);
          Weapons._z = z;
          Enemies.inRadius(z.x, z.z, z.R, Weapons.ringHit);
          Weapons._z = null;
        } else z.R0 = z.R;
        if (L && L.ring) L.ring(z, dt);
        break;
      }
      case 'quake': case 'stick': {
        // 出师之剑的剑痕 / 插地的投枪：t 到 0 时震一下
        if (z.t < 0) { dead = false; break; }
        Weapons._z = z;
        if (z.type === 'quake') {
          Enemies.inRadius(z.x, z.z, z.r, Weapons.zoneBlastHit);
          if (L && L.quake) L.quake(w, z.x, z.y, z.z, z.r, 1);
          Weapons.emitOnce('quake', w, z.x, z.z);
        } else {
          z.mult = z.k;
          Enemies.inRadius(z.x, z.z, z.r, Weapons.zoneBlastHit);
          if (L && L.stick) L.stick(w, z.x, z.y, z.z, z.r);
          Weapons.emitOnce('stick', w, z.x, z.z);
        }
        Weapons._z = null;
        dead = true;
        break;
      }
    }
    if (dead) { Weapons.freeZone(z); zs.splice(i, 1); }
  }
};

// 钟声扫到：前沿这一帧扫过了它，或者它在前沿后面 band 米以内；每圈每个敌人只打一次
Weapons.ringHit = function (e) {
  var z = Weapons._z;
  if (z.hit.has(e.id) || Math.abs(e.y - z.y) >= 3.5) return;
  var dx = e.x - z.x, dz = e.z - z.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d - e.r > z.R || d + e.r < z.R0 - z.band) return;
  z.hit.add(e.id);
  var k = d > 1e-6 ? 1 / d : 0;
  var dealt = Weapons.hit(z.w, e, z.mult, dx * k, dz * k);
  Weapons.after(z.w, e, dealt, null);
};

// 地雷触发：爆炸伤害 + 蜡烛点燃（Weapons.after）；捕兽夹只夹住踩上去的（触发半径以内）
Weapons.mineFire = function (z) {
  var w = z.w, def = w.def, br = (def.blast || 3.6) * Weapons.size(w), L = Weapons.L;
  z.fired = true;
  FX.boom(z.x, z.y + 0.5, z.z, br, def.color, Weapons.boomOpt(w));
  Weapons._z = z; z.mult = 1; z.br = br;
  Enemies.inRadius(z.x, z.z, br, Weapons.zoneBlastHit);
  Weapons._z = null;
  if (def.root && window.Evo) {
    Enemies.inRadius(z.x, z.z, z.trigR || 1.6, function (e) { if (e.alive && !e.boss && !e.mini && !e.prop) Evo.stun(e, def.root); });
  }
  if (L && L.mineFire) L.mineFire(z);
  if (z.model === 'trap') {
    Weapons.emitOnce('trap', w, z.x, z.z);
    var shut = ZONE_MODELS.trapShut;
    if (shut && z.mesh) {
      z.mesh.geometry = shut; z.gkey = 'trapShut';
      if (w.evo && window.Evo && Evo.dressZone) Evo.dressZone(z);
    }
    z.shut = 0.6;
  }
};

// 飞斧 / 平底锅：飞行时翻跟头；停下来绕一根斜 30° 的轴转（平底锅这种 flat 的平着转），脚下一圈淡淡的旋风刀光标出砍到的范围
Weapons.axeLook = function (z, dx, dz, dt) {
  var m = z.mesh;
  m.position.set(z.x, z.y, z.z);
  if (!z.arrived) {
    m.rotation.order = 'YXZ';
    if (dx || dz) m.rotation.y = Math.atan2(dx, dz);
    m.rotation.x += dt * 14;
    m.rotation.z = 0;
  } else {
    if (z.flat) { m.rotation.order = 'YXZ'; m.rotation.x = 0; m.rotation.z = 0; }
    else { m.rotation.order = 'ZYX'; m.rotation.x = 0; m.rotation.z = 0.52; }
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

// 追踪的小弹丸（第 5 / 6 块：猎隼扑击、兔子、护卫蜂、乌鸦）：不走 Weapons.hit（不暴击、不算武器伤害、不触发 onCrit / dmgMult）
// o（可选）：{ kind = 'soul', dmg, vx, vy, vz（不给就是原来的随机散开，水平速度 spd = 10、vy = 3）, homing = 6, life = 3, r = 0.6, grav = 0,
//            scale = 1, blastR（碰到敌人炸开的半径；0 = 单体）, onHit(p, e, dealt), onBlast(p)（炸开的样子）, tag + max（同一个 tag 同时最多几个） }
// 返回发出去的个数
Weapons.spawnSouls = function (x, y, z, n, o) {
  if (o && o.tag && o.max != null) {
    var have = 0;
    for (var j = 0; j < Weapons.projs.length; j++) if (Weapons.projs[j].tag === o.tag) have++;
    n = Math.min(n, o.max - have);
  }
  var made = 0;
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU;
    if (!o) {
      Weapons.projs.push({ w: null, soul: true, soulDmg: (10 + P.level * 2) * P.st.damage, kind: 'soul', x: x, y: y + 1, z: z, vx: Math.cos(a) * 10, vy: 3, vz: Math.sin(a) * 10, r: 0.6, life: 3, pierce: 0, bounces: 0, hit: new Set(), t: 0, spin: 0, grav: 0, scale: 1, dmgMult: 1, homing: 6 });
      made++;
      continue;
    }
    var kind = o.kind || 'soul', sp = o.spd != null ? o.spd : 10;
    var p = { w: null, soul: true, soulDmg: o.dmg != null ? o.dmg : (10 + P.level * 2) * P.st.damage, kind: kind, an: Weapons.anim(kind),
      x: x, y: y + 1, z: z, vx: o.vx != null ? o.vx : Math.cos(a) * sp, vy: o.vy != null ? o.vy : 3, vz: o.vz != null ? o.vz : Math.sin(a) * sp,
      r: o.r || 0.6, life: o.life || 3, pierce: 0, bounces: 0, hit: new Set(), t: 0, spin: 0, grav: o.grav || 0, scale: o.scale || 1, dmgMult: 1,
      homing: o.homing != null ? o.homing : 6, blastR: o.blastR || 0, onHit: o.onHit || null, onBlast: o.onBlast || null, tag: o.tag || null };
    Weapons.projs.push(p);
    made++;
  }
  return made;
};

// 灵魂弹丸炸开（兔子）：半径 blastR 内每个敌人（道具不算）打一下
Weapons.soulBlast = function (p) {
  var r = p.blastR;
  Enemies.inRadius(p.x, p.z, r, function (e) {
    if (e.prop || Math.abs(e.y - p.y) > r + 1.5) return;
    var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    var dealt = Enemies.damage(e, p.soulDmg, 0, dx / d, dz / d);
    if (p.onHit) p.onHit(p, e, dealt);
  });
  if (p.onBlast) p.onBlast(p);
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

var _wm = null, _wq = null, _ws = null, _wp = null, _we = null, _wcount = {};
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
  var put = Weapons.put, L = Weapons.L;
  var ps = Weapons.projs;
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i], bk = Weapons.baseKind(p.kind), an = p.an || Weapons.NOANIM;
    var yaw = Math.atan2(p.vx, p.vz), hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz);
    // 翻滚（spin）、绕飞行方向转（roll）、扇翅膀（flap）、窜天猴左右摇（wobble）
    var rx = p.spin ? p.t * p.spin : an.spin ? p.t * an.spin : -Math.atan2(p.vy, hs || 0.001);
    var rz = an.roll ? p.t * an.roll : an.flap ? Math.sin(p.t * 28) * an.flap : 0;
    if (p.w && p.w.def && p.w.def.wobble) yaw += Math.sin(p.t * 14) * p.w.def.wobble * 0.4;
    if (p.hop) rx = 0;
    // 画出来的大小上限（PROJ_ANIM.maxS，第 10 块：投石车的石弹）；命中半径、爆炸范围不变
    put(p.back && p.kindB ? p.kindB : p.kind, p.x, p.y, p.z, rx, yaw, an.maxS ? Math.min(p.scale || 1, an.maxS) : p.scale || 1, p.sq, rz);
    // 发光的弹丸核心（超武的种类有自己的金色光晕）
    var gl = Weapons.glowC[p.kind] || Weapons.glowC[bk];
    if (gl) Weapons.glowAt(gl, p.x, p.y, p.z, p.scale || 1, p.t, p.w);
    // 拖尾
    if (p.tr) { var tl = Weapons.tailOf(p.kind); if (tl && (!tl.back || p.back)) Weapons.drawTail(p, tl); }
    if (L && L.proj) L.proj(p, bk, dt);
  }
  // 扔出去的桶 / 鞭炮
  for (i = 0; i < Weapons.lobs.length; i++) {
    var b = Weapons.lobs[i], s = Math.min(1, b.t / b.life), lh = 1.2 + Math.sqrt(dist2(b.x0, b.z0, b.x1, b.z1)) * 0.12;
    var bx = lerp(b.x0, b.x1, s), by = lerp(b.y0, b.y1, s) + 4 * lh * s * (1 - s), bz = lerp(b.z0, b.z1, s);
    put(b.kind, bx, by, bz, b.t * 14, b.t * 6, 1.1, 0);
    b.x = bx; b.y = by; b.z = bz;
    if (L && L.lob) L.lob(b);
  }
  // 插在地上的投枪（场地画，不是每支一个网格）：枪头朝下斜插 35°
  var zs = Weapons.zones;
  for (i = 0; i < zs.length; i++) {
    var z = zs[i];
    if (z.type !== 'stick') continue;
    var sc = z.scale || 1;
    put(z.kind, z.x - Math.sin(z.yaw) * 0.4 * sc, z.y + 0.42 * sc, z.z - Math.cos(z.yaw) * 0.4 * sc, 0.61, z.yaw, sc, 0);
  }
  Weapons.renderOrbs(put);
  Relic.render(put);   // 第 6 块：宝物画的东西（猎犬、铁蒺藜）
  for (k in Weapons.meshes) {
    var m = Weapons.meshes[k];
    m.count = _wcount[k];
    m.visible = _wcount[k] > 0;
    if (_wcount[k]) m.instanceMatrix.needsUpdate = true;
  }
  Weapons.renderStatus(dt);
  if (L && L.tick) L.tick(dt);
};

// 环绕的东西：锡兵、风筝（大小有上限，从镜头旁边经过时缩小；脸朝着前进的方向；身后的拖尾在 Weapons.L.orbit）
Weapons.renderOrbs = function (put) {
  var cam = Game.camera ? Game.camera.position : null, L = Weapons.L;
  for (var j = 0; j < P.weapons.length; j++) {
    var w = P.weapons[j];
    if (!w.orbs) continue;
    var kind = Weapons.projKind(w.def.proj), og = Weapons.glowC[kind] || Weapons.glowC[Weapons.baseKind(kind)], size = Weapons.size(w);
    var osc = Math.min(1.4, 0.8 + 0.3 * size);
    var n = w.orbs.length;
    for (var q = 0; q < n; q++) {
      var ob = w.orbs[q], s = osc;
      if (cam) {
        // 从镜头旁边经过时缩小（不会占满画面的下面三分之一）
        var cd = Math.sqrt((cam.x - ob.x) * (cam.x - ob.x) + (cam.y - ob.y) * (cam.y - ob.y) + (cam.z - ob.z) * (cam.z - ob.z));
        if (cd < 9) s *= clamp((cd - 2) / 7, 0.12, 1);
      }
      ob.yaw = Math.atan2(-Math.sin(ob.a), Math.cos(ob.a));
      put(kind, ob.x, ob.y, ob.z, 0, ob.yaw, s, 0);
      if (og) Weapons.glowAt(og, ob.x, ob.y, ob.z, s, Game.time + q, w);
      if (L && L.orbit) L.orbit(w, ob, q, s, ob.a);
    }
  }
};

// 敌人身上的状态：被标记的敌人头顶一个跳动的红色准星；被火烧的敌人冒火星；蜂蜜、颜料这类标记交给 Weapons.L.status
Weapons.renderStatus = function (dt) {
  var EL = Enemies.list, nm = 0, ne = 0, pulse = 0.75 + Math.sin(Game.time * 9) * 0.25, top = window.Evo && Evo.topOf, L = Weapons.L, now = Game.time;
  var st = L && L.status;
  for (var i = 0; i < EL.length; i++) {
    var e = EL[i];
    if (!e.alive) continue;
    if (e.marked > 0 && nm < 60) {
      nm++;
      var hy = top ? Evo.topOf(e) + 0.35 : e.y + e.r * 2.4 + 0.4;
      FX.glow(e.x, hy, e.z, 0.95 * pulse, 0.95 * pulse, Weapons.C.mark, 0.75, 1);
      FX.glow(e.x, hy, e.z, 0.4, 0.4, Weapons.C.mark, 0.8, 3);
    }
    if (e.fireT > now && !e.evoBurnListed && ne < 8 && Math.random() < dt * 6) {
      ne++;
      FX.mote(e.x + rand(-0.3, 0.3), e.y + e.r * rand(0.8, 1.8), e.z + rand(-0.3, 0.3), Math.random() < 0.5 ? 0xffb030 : 0xff6a1a, 0.15, rand(1, 2), 0.5);
    }
    if (st && e.mkT > now) L.status(e, dt);
  }
};

// ============================================================
//  伤害数字：Enemies.damage 结算时告诉 FX 是哪个敌人（同一个敌人的数字合并）；
//  斩杀的字交给 FX.execText 限流（FX.text 认出这一次的字），不显示的伤害加进头顶已有的数字里；
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
