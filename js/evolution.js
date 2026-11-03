'use strict';
// ============================================================
//  超武：武器进化（数据见 data_evo.js）
//  · 条件：武器 Lv8 + 对应魔典 Lv2 → 在圣锻炉锻造，或打开免费金宝箱自动觉醒
//  · 圣锻炉（Interact.KINDS.holyforge）：每关 1 座，离出生点 40~90 米
//  · 命中特性：Weapons.hit 末尾调用 Evo.onHit（特性打出的伤害不会再触发特性）
//  · 外观：超武的弹丸、斩击、光环、场地都换成更亮的金色；觉醒时金色光柱 + 震屏 + 弹窗 + 提示
//  · 界面：武器栏金框和“超”角标、可锻造时金光脉冲、暂停界面的超武进度
//  ui.js 里的函数都在这里包一层（不改 ui.js），样式用 JS 注入
// ============================================================
var Evo = {
  busy: false,        // 正在结算特性伤害（防止特性再触发特性）
  budget: 16,         // 每帧最多触发几次“贵”的特性（连锁、新星、分裂）
  stunned: [], burning: [], fx: [],
  forgeRef: null, readyT: 0, installed: false
};

Evo.hex = function (c) { return '#' + ('000000' + (c >>> 0).toString(16)).slice(-6); };

Evo.GOLD = 0xffc23a;     // 超武的金色（光晕、像素环）
Evo.BOLT_C = 0xffd04a;   // 金色闪电

// 靠颜色认出来的武器：超武保留本色（弹丸、拖尾、斩击），金色只做描边、光环和火星
// （传说勇者剑的剑气也保留蓝白色，和全金的断罪圣剑分开）
Evo.HUE = { bloodmagic: 0xd9233a, rocket: 0xb05aff, corrupted: 0xb050ff, frost: 0x9ff6ff, poison: 0x7dff4a, herosword: 0x9fd8ff };

// ---------------- 规则 ----------------
Evo.tomeLv = function (id) {
  for (var i = 0; i < P.tomes.length; i++) if (P.tomes[i].id === id) return P.tomes[i].level;
  return 0;
};

// 满足条件且还没进化
Evo.canEvolve = function (w) {
  var ev = w && !w.evo && EVO[w.id];
  return !!ev && w.level >= EVO_REQ.level && Evo.tomeLv(ev.tome) >= EVO_REQ.tome;
};

Evo.ready = function () { return P.weapons.filter(Evo.canEvolve); };

Evo.anyReady = function () {
  for (var i = 0; i < P.weapons.length; i++) if (Evo.canEvolve(P.weapons[i])) return true;
  return false;
};

// 免费金宝箱：多把满足时选等级最高的
Evo.best = function () {
  var best = null;
  for (var i = 0; i < P.weapons.length; i++) {
    var w = P.weapons[i];
    if (Evo.canEvolve(w) && (!best || w.level > best.level)) best = w;
  }
  return best;
};

// “大剑 Lv5/8 · 体积魔典 Lv1/2”
Evo.reqText = function (w) {
  var ev = EVO[w.id];
  return w.def.name + ' Lv' + Math.min(w.level, EVO_REQ.level) + '/' + EVO_REQ.level + ' · ' +
    TOMES[ev.tome].name + ' Lv' + Math.min(Evo.tomeLv(ev.tome), EVO_REQ.tome) + '/' + EVO_REQ.tome;
};

// 卡片 / 弹窗里的说明
Evo.lines = function (id) {
  var ev = EVO[id], out = [ev.text];
  ev.traits.forEach(function (t) { out.push(EVO_TRAITS[t].name + '：' + EVO_TRAITS[t].desc); });
  out.push('伤害 ×' + EVO_BONUS.damage + ' · 攻速 +25% · 范围 +25%' + (WEAPONS[id].base.count != null && WEAPONS[id].type !== 'trail' ? ' · 数量 +1' : ''));
  return out;
};

// ---------------- 进化 ----------------
// 超武 def：基础 def 的拷贝 + 超武覆盖的字段
Evo.makeDef = function (w) {
  var base = WEAPONS[w.id], ev = EVO[w.id], d = {}, k;
  for (k in base) d[k] = base[k];
  if (ev.over) for (k in ev.over) d[k] = ev.over[k];
  d.name = ev.name; d.icon = ev.icon; d.color = ev.color; d.desc = ev.text;
  d.evo = true; d.baseName = base.name;
  d.traits = ev.traits.slice();
  d.tGold = d.traits.indexOf('gold') >= 0;
  if (d.proj) d.proj = Evo.kindOf((typeof PROJ_BY_WEAPON !== 'undefined' && PROJ_BY_WEAPON[w.id]) || d.proj, w.id);
  return d;
};

// how：'forge' 圣锻炉，'chest' 金宝箱（这两种会弹出觉醒弹窗），其他值直接觉醒
Evo.evolve = function (w, how) {
  if (!w || w.evo || !EVO[w.id]) return false;
  var ev = EVO[w.id], s = w.s, k;
  w.def = Evo.makeDef(w);
  w.evo = true;
  w.evoHow = how || '';
  s.damage = (s.damage || 0) * EVO_BONUS.damage;
  if (s.count != null) s.count += EVO_BONUS.count;
  s.size = (s.size || 1) * EVO_BONUS.size;
  if (s.cd) s.cd *= EVO_BONUS.cd;
  if (ev.stats) for (k in ev.stats) s[k] = (s[k] || 0) + ev.stats[k];
  Evo.dress(w);
  if (typeof UI !== 'undefined' && UI.cache) UI.cache.slots = null;   // 让 HUD 重画武器栏
  Evo.celebrate(w, how);
  return true;
};

// 常驻视觉换色：光环换成金色（光环是着色器，颜色在 uCol 里）并多一圈贴地的圣光像素环；锁链换成金色
// 永冬领域保留冰蓝色的光墙（金色只在内圈的光环和星光上），不然和天使圣域分不出来
Evo.dress = function (w) {
  var def = w.def;
  if (def.type === 'aura') {
    // 着色器里的颜色可以超过 1：叠加的光墙更亮、更金（冰霜是更亮的冰蓝）
    var rgb = def.freeze ? [0.72, 1.12, 1.25] : [1.3, 0.9, 0.26];
    [w.ring, w.ring2].forEach(function (m) {
      if (!m || !m.material) return;
      var u = m.material.uniforms;
      if (u && u.uCol) u.uCol.value.setRGB(rgb[0], rgb[1], rgb[2]);
      else if (m.material.color) m.material.color.setRGB(Math.min(1, rgb[0]), Math.min(1, rgb[1]), Math.min(1, rgb[2]));
    });
    if (!w.evoRing) w.evoRing = Evo.haloMesh(w);
    if (!w.evoRing.parent && Weapons.scene && (!w.ring || w.ring.parent)) Weapons.scene.add(w.evoRing);
  }
  if (def.type === 'tether' && w.beam && w.beam.material) w.beam.material.color.set(Evo.tint(w.id));
};

// 光环内圈的圣光环：用光环同一套几何体和地面高度（贴着坡面），只画外圈的像素格子，叠加发光
Evo.HALO_FS = [
  'uniform vec3 uCol;',
  'uniform float uA;',
  'varying float vKind;',
  'varying float vAng;',
  'varying float vV;',
  'void main() {',
  '  if (vKind > 0.5 && vKind < 2.5) discard;',
  '  gl_FragColor = vec4(uCol * uA, 0.0);',
  '}'
].join('\n');

Evo.haloMesh = function (w) {
  var u = w.ring && w.ring.material && w.ring.material.uniforms, m;
  if (u && u.uH && Weapons.auraGeo && Weapons.AURA_VS) {
    m = new THREE.Mesh(Weapons.auraGeo(), new THREE.ShaderMaterial({
      // uH 和光环共用同一个数组：光环每帧采样的地面高度这里直接用
      uniforms: { uCol: { value: new THREE.Color(w.def.freeze ? 0xffd468 : 0xfff0c0) }, uA: { value: 0.6 }, uR: { value: 3 }, uHgt: { value: 0 }, uH: { value: u.uH.value } },
      vertexShader: Weapons.AURA_VS, fragmentShader: Evo.HALO_FS,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
    }));
  } else {
    m = new THREE.Mesh(Evo.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: 0.3, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  }
  m.frustumCulled = false;
  m.renderOrder = 3;
  return m;
};

// ---------------- 觉醒庆祝 ----------------
Evo.celebrate = function (w, how) {
  FX.ring(P.pos.x, P.pos.y, P.pos.z, 5, 0xffe066, 0.5);
  FX.burst(P.pos.x, P.pos.y + 1.2, P.pos.z, 20, 0xffe066, 7, 0.35);
  if (how !== 'forge' && how !== 'chest') { Evo.glory(w); return; }
  // 弹窗关掉之后再放光柱和震屏，玩家才看得到
  Game.openModal(function () {
    var ev = EVO[w.id];
    UI.choiceModal('evodone', '超武觉醒！', [{
      kind: 'evo-done', id: w.id, rarity: 4, title: ev.name, icon: ev.icon, color: ev.color,
      sub: WEAPONS[w.id].name + ' → 超武 · ' + (how === 'chest' ? '金宝箱的圣光唤醒了它' : '圣锻炉锻造完成'),
      lines: Evo.lines(w.id), evoFoot: '太棒了！'
    }]);
    var lm = document.getElementById('levelModal');
    if (lm) lm.classList.add('evoShow');
  });
};

// 金色光柱、光圈、震屏、提示
Evo.glory = function (w) {
  var x = P.pos.x, y = P.pos.y, z = P.pos.z;
  Evo.pillar();
  FX.ring(x, y, z, 8, 0xffd84a, 0.6);
  FX.ring(x, y, z, 4.5, 0xffffff, 0.45);
  FX.burst(x, y + 1, z, 36, 0xffe066, 9, 0.4);
  FX.burst(x, y + 1, z, 12, 0xffffff, 6, 0.3);
  FX.text(x, y + 2.8, z, w.def.name, '#ffe14a', 1.7);
  Game.shake(0.7);
  UI.toast('超武觉醒：' + w.def.name + '！', '#ffe14a');
};

// 竖直方向的透明渐变贴图（下面实、上面虚，最底下一小段淡入），光柱和锻炉的光束共用
Evo.fadeTex = function () {
  if (Evo._fadeTex) return Evo._fadeTex;
  var cv = document.createElement('canvas');
  cv.width = 4; cv.height = 128;
  var c = cv.getContext('2d'), g = c.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.35)');
  g.addColorStop(0.96, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 4, 128);
  Evo._fadeTex = new THREE.CanvasTexture(cv);
  return Evo._fadeTex;
};

// 觉醒光柱：从天上落到玩家身上的一道金光（外层金色半透明，里面白色亮芯）
Evo.pillarGeo = null;
Evo.pillar = function () {
  if (!Evo.pillarGeo) Evo.pillarGeo = new THREE.CylinderGeometry(1, 1, 1, 12, 1, true).translate(0, -0.5, 0);
  var mk = function (c, a, add) {
    var m = new THREE.Mesh(Evo.pillarGeo, new THREE.MeshBasicMaterial({ color: c, map: Evo.fadeTex(), transparent: true, opacity: a, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    m.frustumCulled = false;
    m.renderOrder = 2;
    Game.scene.add(m);
    return m;
  };
  var f = { a: mk(0xffc83a, 0.4, false), b: mk(0xfff2c0, 0.85, true), t: 0, life: 1.7 };
  Evo.fx.push(f);
  Evo.tickPillar(f, 0);
  return f;
};

Evo.tickPillar = function (f, dt) {
  f.t += dt;
  var k = f.t / f.life;
  var drop = Math.min(1, f.t / 0.16), fade = k > 0.5 ? Math.max(0, 1 - (k - 0.5) / 0.5) : 1;
  var x = P.pos.x, z = P.pos.z, top = P.pos.y + 60;
  var ro = 1.3 * (0.6 + 0.4 * fade), ri = 0.42 * (0.4 + 0.6 * fade) * (1 + Math.sin(f.t * 30) * 0.08);
  f.a.position.set(x, top, z); f.b.position.set(x, top, z);
  f.a.scale.set(ro, 60.2 * drop, ro); f.b.scale.set(ri, 60.2 * drop, ri);
  f.a.material.opacity = 0.4 * fade; f.b.material.opacity = 0.85 * fade;
  if (dt > 0 && drop >= 1 && Math.random() < dt * 40) {
    var a = Math.random() * TAU, r = Math.random() * ro;
    FX.burst(x + Math.cos(a) * r, P.pos.y + rand(0, 2.5), z + Math.sin(a) * r, 1, Math.random() < 0.5 ? 0xffffff : 0xffe066, 1.5, 0.2);
  }
  return k < 1;
};

Evo.removeFx = function (f) {
  [f.a, f.b].forEach(function (m) { if (m) { if (m.parent) m.parent.remove(m); m.material.dispose(); } });
};

// ---------------- 命中特性 ----------------
// Weapons.hit 结算完伤害后调用；dealt = 这次命中造成的伤害
Evo.onHit = function (w, e, dealt, mult, kx, kz) {
  if (Evo.busy || !(dealt > 0)) return;
  var def = w.def, tr = def.traits;
  if (!tr) return;
  for (var i = 0; i < tr.length; i++) {
    switch (tr[i]) {
      case 'burn':
        if (e.alive) { Enemies.applyDot(e, dealt * 0.4, 2); Evo.addBurn(e, def.burnColor || 0xff8a1a); }
        break;
      case 'chain':
        if (Evo.budget > 0 && proc(0.25)) { Evo.budget--; Evo.chain(w, e); }
        break;
      case 'nova':
        w.novaN = (w.novaN || 0) + 1;
        if (w.novaN >= 8 && Game.time >= (w.novaT || 0) && Evo.budget > 0) {
          w.novaN = 0; w.novaT = Game.time + 0.6; Evo.budget--;
          Evo.nova(w, e.x, e.y, e.z);
        }
        break;
      case 'freeze':
        if (e.alive && !e.boss && !e.mini && proc(0.12)) Evo.freeze(w, e);
        break;
      case 'execute':
        if (e.alive && !e.boss && !e.mini && e.hp < e.maxHp * 0.12) Evo.execute(w, e);
        break;
      case 'leech':
        // 多段命中的武器也不会回得太快：每把武器 0.4 秒最多一次；角色头上冒一颗红色的心光
        if (Game.time >= (w.leechT || 0) && proc(0.08)) {
          w.leechT = Game.time + 0.4; P.heal(2);
          FX.flash(P.pos.x, P.pos.y + 2.2, P.pos.z, 0.8, 0xff4a6a, 0.3, 0);
          FX.mote(P.pos.x + rand(-0.2, 0.2), P.pos.y + 1.9, P.pos.z + rand(-0.2, 0.2), 0xff4a6a, 0.16, 1.4, 0.6);
        }
        break;
      case 'split':
        if (Evo.budget > 0 && Weapons.projs.length < 320) { Evo.budget--; Evo.split(w, e, mult, kx, kz); }
        break;
      case 'stun':
        if (e.alive && !e.boss && !e.mini && proc(0.1)) Evo.stun(e, 0.6);
        break;
      case 'mark':
        if (e.alive && proc(0.2)) {
          // 刚被标记：脚下一个小小的红色像素圈（头顶的红色准星在 Weapons.renderStatus 里画）
          if (!(e.marked > 0)) FX.ring(e.x, e.y, e.z, 0.8, 0xff3030, 0.3);
          e.marked = Math.max(e.marked, 4);
        }
        break;
    }
  }
  // 点金：这次命中（含特性）打死的敌人多掉金币
  if (def.tGold && !e.alive) Pickups.gold(e.x, e.y + 0.5, e.z, Math.ceil(Game.stage * P.st.goldGain * (e.elite || e.mini ? 4 : 1)));
};

// 特性打出的伤害：照常算暴击和物品效果，但不再触发特性
Evo.traitHit = function (w, e, mult, kx, kz) {
  if (!e.alive) return 0;
  Evo.busy = true;
  try { return Weapons.hit(w, e, mult, kx || 0, kz || 0); } finally { Evo.busy = false; }
};

// 连锁闪电：劈向 8 米内最近的 2 个敌人
Evo.chain = function (w, e) {
  var a = null, b = null, da = 64, db = 64, ex = e.x, ez = e.z;
  Enemies.hash.query(ex, ez, 8, function (o) {
    if (o === e || !o.alive) return;
    var d = dist2(ex, ez, o.x, o.z);
    if (d < da) { b = a; db = da; a = o; da = d; } else if (d < db) { b = o; db = d; }
  });
  var y0 = e.y + e.r;
  if (a) { FX.bolt(ex, y0, ez, a.x, a.y + a.r, a.z, Evo.BOLT_C); Evo.traitHit(w, a, 0.5); }
  if (b) { FX.bolt(ex, y0, ez, b.x, b.y + b.r, b.z, Evo.BOLT_C); Evo.traitHit(w, b, 0.5); }
  if (a) FX.burst(ex, y0, ez, 2, 0xffe9a0, 3, 0.18);
};

// 圣光新星：5 米，120% 伤害
Evo.nova = function (w, x, y, z) {
  FX.ring(x, y, z, 5, 0xfff1a8, 0.4);
  FX.ring(x, y, z, 2.8, 0xffffff, 0.3);
  FX.burst(x, y + 1, z, 10, 0xffe680, 6, 0.3);
  Enemies.inRadius(x, z, 5, function (o) {
    if (Math.abs(o.y - y) > 4) return;
    var dx = o.x - x, dz = o.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    Evo.traitHit(w, o, 1.2, dx / d, dz / d);
  });
};

// 冰封：没冻住就冻 1.2 秒；已经冻住就冻裂（再受一次伤害）
Evo.freeze = function (w, e) {
  if (e.frozen > 0.05) {
    FX.burst(e.x, e.y + e.r, e.z, 6, 0xd8f6ff, 5, 0.22);
    Evo.traitHit(w, e, 1);
  } else {
    e.frozen = Math.max(e.frozen, 1.2);
    FX.burst(e.x, e.y + e.r, e.z, 3, 0xbff4ff, 2.5, 0.2);
    // 缚魂锁链冻住目标：脚下一圈白蓝色的小环
    if (w.def.type === 'tether') FX.ring(e.x, e.y, e.z, 1, 0xd8f6ff, 0.3);
  }
};

// 斩杀：文字全场限流（FX.execText）；影舞飞刃在敌人身上划一道红色刀光
Evo.execute = function (w, e) {
  var hp = e.hp;
  if (w.id === 'dagger') {
    var sa = Math.random() * TAU;
    FX.spawn('slash1.0', 0xff3030, { x: e.x - Math.sin(sa) * 0.9, y: e.y + e.r * 1.2, z: e.z - Math.cos(sa) * 0.9, s0: 0.7, s1: 1.15, life: 0.12, ry: sa, rz: rand(-0.6, 0.6), a0: 1 });
  }
  Enemies.damage(e, hp + 1, 2, 0, 0, { text: '斩杀' });
  w.dmg += hp;
  if (!e.alive) w.kills++;
};

// 眩晕：借用冰冻的停顿（不能走、不能打），头上转金色星星、身体染成金色（Enemies.render 看 e.evoStun）
// 名单满了就只停顿：evoStun 只在名单里倒计时，不能留下永远不消失的金色
Evo.stun = function (e, t) {
  e.frozen = Math.max(e.frozen, t);
  if (!e.evoStunListed) {
    if (Evo.stunned.length >= 40) return;
    e.evoStunListed = true;
    Evo.stunned.push(e);
  }
  e.evoStun = Math.max(e.evoStun || 0, t);
};

Evo.addBurn = function (e, color) {
  e.evoBurn = 2; e.evoBurnC = color;
  if (!e.evoBurnListed && Evo.burning.length < 40) { e.evoBurnListed = true; Evo.burning.push(e); }
};

// 分裂：命中点飞出两枚碎片（碎片用替身武器发射，不会再分裂、不触发特性；伤害和击杀在 Evo.tick 里记回本体）
Evo.fragOf = function (w) {
  var f = w.evoFrag || (w.evoFrag = { id: w.id, level: 1, kills: 0, dmg: 0, charges: 0, timer: 0, frag: true });
  f.def = w.def; f.s = w.s; f.level = w.level;
  return f;
};

// 碎片优先飞向 7 米内最近的两个敌人，瞄准身体中心（坡上坡下都打得到）；
// 附近没有敌人就沿弹丸方向左右散开，顺着前方地面的坡度飞（以前总是水平飞，下坡的敌人会被从头顶飞过去）
Evo.split = function (w, e, mult, kx, kz) {
  var f = Evo.fragOf(w);
  var base = kx || kz ? Math.atan2(kx, kz) : Math.random() * TAU;
  var o = Evo._splitO || (Evo._splitO = { x: 0, y: 0, z: 0 });
  o.x = e.x; o.y = e.y + e.r; o.z = e.z;
  FX.flash(o.x, o.y, o.z, 0.7, Evo.GOLD, 0.12, 2);   // 分裂点一颗小金星
  var a = null, b = null, da = 49, db = 49;
  Enemies.hash.query(o.x, o.z, 7, function (q) {
    if (q === e || !q.alive) return;
    var d = dist2(o.x, o.z, q.x, q.z);
    if (d < da) { b = a; db = da; a = q; da = d; } else if (d < db) { b = q; db = d; }
  });
  for (var k = 0; k < 2; k++) {
    var t = k ? b : a, ang = t ? Math.atan2(t.x - o.x, t.z - o.z) : base + (k ? 0.55 : -0.55);
    var p = Weapons.launch(f, o, null, ang, 0, 0.35 * (mult || 1));
    if (!p) continue;
    p.pierce = 0; p.bounces = 0; p.boom = false; p.grav = 0; p.homing = 0; p.explode = false;
    p.r = Math.max(0.25, p.r * 0.6); p.scale *= 0.6;
    p.vx *= 0.7; p.vz *= 0.7;
    var hs = Math.sqrt(p.vx * p.vx + p.vz * p.vz) || 1, hd, ty;
    if (t) { hd = Math.max(0.5, Math.sqrt(k ? db : da)); ty = t.y + t.r; }
    else { hd = 3; ty = W.groundAt(o.x + Math.sin(ang) * hd, o.z + Math.cos(ang) * hd, o.y + 2) + 0.6; }
    p.vy = clamp((ty - o.y) / hd, -1.5, 1.5) * hs;
    // 寿命够飞到目标（至少 0.42 秒）；有目标的碎片每帧朝目标修正（Evo.steerFrags）
    p.life = t ? Math.max(0.42, hd / hs + 0.12) : 0.42;
    p.evoT = t; p.evoS = hs;
    p.hit.add(e.id);
    p.frag = true;
  }
};

// 有目标的碎片：每次弹丸移动前重新对准目标的身体中心（只算碎片自己，很便宜）。
// 普通弹丸碰到地面会被抬到地面上并把竖直速度清零，碎片经过坡顶或台阶后靠这里重新往下飞
Evo.steerFrags = function () {
  var ps = Weapons.projs;
  for (var i = 0; i < ps.length; i++) {
    var p = ps[i], t = p.evoT;
    if (!t) continue;
    if (!t.alive || p.hit.has(t.id)) { p.evoT = null; continue; }
    var dx = t.x - p.x, dz = t.z - p.z, hd = Math.sqrt(dx * dx + dz * dz) || 0.01;
    p.vx = dx / hd * p.evoS; p.vz = dz / hd * p.evoS;
    p.vy = clamp((t.y + t.r - p.y) / Math.max(hd, 0.3), -2, 2) * p.evoS;
  }
};

// ---------------- 超武外观 ----------------
// 不受光照的发光材质（顶点色 + 像素贴图）：眩晕星星用
Evo.glowMat = function () {
  if (!Evo._glowMat) Evo._glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, map: TEX.atlas || null });
  return Evo._glowMat;
};

// 超武弹丸的材质：亮面金（和拾取物同一种不吃场景光照的高光材质，夜里也亮，雾只吃一部分）
Evo.shinyMat = function () {
  if (Evo._shinyMat) return Evo._shinyMat;
  Evo._shinyMat = FX.toyMat ? FX.toyMat({ fog: 0.45, spec: 0.9, light: 1.08 }) : new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x6a4c16 });
  return Evo._shinyMat;
};

// 原来就不吃光照的魔法弹丸（火球、血球……）：照旧不吃光照，只是颜色换成金色
Evo.unlitMat = function () {
  if (!Evo._unlitMat) Evo._unlitMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  return Evo._unlitMat;
};

// 原来是叠加发光的（剑气）：照旧叠加发光
Evo.addMat = function () {
  if (!Evo._addMat) Evo._addMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
  return Evo._addMat;
};

// 超武的金色：武器自己的超武颜色和金色各一半
Evo.tint = function (wid) {
  var c = new THREE.Color(EVO[wid] ? EVO[wid].color : 0xffd84a);
  return c.lerp(new THREE.Color(Evo.GOLD), 0.45);
};

// 模型用的金色：更深、更饱和（亮面高光材质会再提亮，太浅的颜色看起来发白）
Evo.metalTint = function (wid) {
  var c = new THREE.Color(EVO[wid] ? EVO[wid].color : 0xffd84a);
  return c.lerp(new THREE.Color(0xf0a81c), 0.62);
};

// 共用的 THREE.Color（光晕用，不在每帧里新建）
Evo.col = function (key, hex) {
  var c = Evo._cols || (Evo._cols = {});
  return c[key] || (c[key] = new THREE.Color(hex));
};

// 像素锯齿圆环（和冲击环同一种），老版本没有就用平滑圆环
Evo.ringGeo = function () {
  if (FX.getGeo) return FX.getGeo('pring');
  if (!Evo._ringGeo) Evo._ringGeo = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  return Evo._ringGeo;
};

// 把几何体的顶点色换成超武的金色：保留原来的明暗（木柄暗、刀刃亮），整体更饱和
Evo.goldify = function (geo, tint, amt) {
  var col = geo.attributes.color;
  if (!col) return geo;
  var t = new THREE.Color(tint), a = col.array;
  for (var i = 0; i < a.length; i += 3) {
    var L = a[i] * 0.3 + a[i + 1] * 0.59 + a[i + 2] * 0.11, k = 0.5 + 0.62 * L;
    a[i] = clamp(lerp(a[i], t.r * k + 0.05, amt), 0, 1);
    a[i + 1] = clamp(lerp(a[i + 1], t.g * k + 0.02, amt), 0, 1);
    a[i + 2] = clamp(lerp(a[i + 2], t.b * k, amt), 0, 1);
  }
  col.needsUpdate = true;
  return geo;
};

// 超武专用的弹丸网格（按武器分开，用到时才建）：亮金色、大一点，再配一个金色光晕 + 白色亮芯
// 靠颜色认出来的武器（Evo.HUE）不染金色：保留本色，金色只在光晕的描边上
Evo.kindOf = function (kind, wid) {
  if (!kind || kind.indexOf('@') > 0) return kind;
  var ek = kind + '@' + wid;
  if (Weapons.meshes[ek]) return ek;
  if (!PROJ_MODELS[kind] || !Weapons.scene) return kind;
  var look = typeof PROJ_LOOK !== 'undefined' && PROJ_LOOK ? PROJ_LOOK[kind] : null;
  var build = typeof projGeo === 'function' ? projGeo : function (k, parts) { return MODEL.build(parts || PROJ_MODELS[k], parts ? false : undefined); };
  // 有专门超武模型的用自己的（颜色已经是金色），其余把原模型染成金色
  var own = (Evo.MODELS_W[wid] && Evo.MODELS_W[wid][kind]) || Evo.MODELS[kind];
  var geo = own ? build(kind, own) : Evo.HUE[wid] ? build(kind) : Evo.goldify(build(kind), look ? Evo.tint(wid) : Evo.metalTint(wid), look ? 0.6 : 0.8);
  // 环绕的流星锤本来就跟着范围变大，不再额外放大（盾牌的 0.8 在 Weapons.render 里按原来的种类算）
  var s = kind === 'flail' ? 0.92 : 1.12;
  geo.scale(s, s, s);
  var mat = look === 'add' ? Evo.addMat() : look ? Evo.unlitMat() : Evo.shinyMat();
  var im = MODEL.instanced(geo, 500, Weapons.scene, mat);
  im.visible = false;
  Weapons.meshes[ek] = im;
  Evo.addGlow(ek, kind, wid);
  return ek;
};

// 专门的超武模型：神盾原本就是金边红心，只染色看不出升级，换成白金盾面 + 金十字 + 中间的宝石
Evo.MODELS = {
  shield: [
    ['cyl', [0.66, 0.66, 0.14, 8], [0, 0, 0], 0xe8a828, [Math.PI / 2, 0, 0]],
    ['cyl', [0.5, 0.5, 0.17, 8], [0, 0, 0], 0xfff0c8, [Math.PI / 2, 0, 0]],
    ['box', [0.13, 0.72, 0.21], [0, 0, 0], 0xf0b830],
    ['box', [0.52, 0.13, 0.21], [0, 0.1, 0], 0xf0b830],
    ['oct', [0.11], [0, 0.1, 0.11], 0xffffff],
    ['oct', [0.11], [0, 0.1, -0.11], 0xffffff]
  ],
  // 陨星重锤：金色锤头 + 烧得发白的尖刺
  flail: [['dodec', [0.42], [0, 0, 0], 0xe0a020, null, null, 'metal'], ['cone', [0.12, 0.4, 4], [0, 0.53, 0], 0xfff6d8], ['cone', [0.12, 0.4, 4], [0, -0.53, 0], 0xfff6d8, [Math.PI, 0, 0]], ['cone', [0.12, 0.4, 4], [0.53, 0, 0], 0xfff6d8, [0, 0, -Math.PI / 2]], ['cone', [0.12, 0.4, 4], [-0.53, 0, 0], 0xfff6d8, [0, 0, Math.PI / 2]], ['cone', [0.12, 0.4, 4], [0, 0, 0.53], 0xfff6d8, [Math.PI / 2, 0, 0]], ['cone', [0.12, 0.4, 4], [0, 0, -0.53], 0xfff6d8, [-Math.PI / 2, 0, 0]]],
  // 月刃回旋镖：一弯月牙形的刀刃（淡金色，刃口发白），平着转
  banana: [['fxCrescent3', [0.8, 0.3, 2.6, 0.07], [0, 0, -0.42], 0xfff0b8, null, null, 'plain'], ['fxCrescent3', [0.84, 0.08, 2.5, 0.09], [0, 0, -0.42], 0xffffff, null, null, 'plain']],
  // 断头巨刃：金色的新月刀身 + 白亮的刃口 + 深色刀背（和普通的一样立起来转）
  blade: [
    ['fxCrescent3', [1.05, 0.42, 1.7, 0.08], [0, 0, -0.85], 0xf0b830, null, null, 'metal'],
    ['fxCrescent3', [1.1, 0.1, 1.62, 0.1], [0, 0, -0.85], 0xfffbe8, null, null, 'plain'],
    ['box', [0.8, 0.12, 0.1], [0, 0, -0.26], 0x5a3a14, null, null, 'metal']
  ]
};

// 按武器单独的超武模型：两把剑气不同色（堕落魔剑是紫色剑气 + 金边，传说勇者剑是蓝白剑气 + 金边；断罪圣剑是全金）
Evo.MODELS_W = {
  corrupted: { wave: [['fxCrescent', [1.15, 0.36, 2.3], [0, 0, -0.95], 0xb860ff], ['fxCrescent', [1.24, 0.1, 2.2], [0, 0, -0.95], 0xffc23a]] },
  herosword: { wave: [['fxCrescent', [1.15, 0.36, 2.3], [0, 0, -0.95], 0xcfeaff], ['fxCrescent', [1.24, 0.1, 2.2], [0, 0, -0.95], 0xffc23a]] }
};

// 超武弹丸的光晕（Weapons.glowC）：原来有光晕的换成金色（亮度比原来低一点，靠白色亮芯显亮）；原来没有的也加上；
// 圆球类的弹丸外面再套一圈金色细光环（超武的记号）；保留本色的武器光晕用本色
Evo.addGlow = function (ek, kind, wid) {
  if (!Weapons.glowC) return;
  var b = Weapons.glowC[kind], wave = kind === 'wave', hue = Evo.HUE[wid];   // 剑气本身就是发光的新月，光晕小一点
  var orb = kind === 'fireball' || kind === 'bloodorb' || kind === 'arcane' || kind === 'orb';
  Weapons.glowC[ek] = {
    c: hue ? new THREE.Color(hue) : new THREE.Color(EVO[wid] ? EVO[wid].color : Evo.GOLD).lerp(new THREE.Color(Evo.GOLD), 0.6),
    s: b ? b.s * (wave ? 0.7 : 1) : 0.95, a: b ? Math.min(0.65, b.a * 0.75 + (wave ? 0 : 0.08)) : 0.36, byWeapon: false,
    core: 0.38, cc: Evo.col('core', 0xfff4d0), ca: 0.6,
    ring: orb ? (kind === 'fireball' ? 0.68 : 0.88) : 0, rc: Evo.col('gold', Evo.GOLD), ra: 0.5
  };
};

// 场地类（龙卷风、火药桶、飞斧）用金色的几何体
Evo.goldGeo = function (key, makeSrc, tint, amt) {
  Evo._goldGeos = Evo._goldGeos || {};
  if (!Evo._goldGeos[key]) Evo._goldGeos[key] = Evo.goldify(makeSrc().clone(), tint, amt || 0.7);
  return Evo._goldGeos[key];
};

// 场地模型来自对象池（超武的单独一池），换过一次就一直是金色的；龙卷风保持白蓝色的风（金色只做点缀，见 Evo.tickZones）
Evo.dressZone = function (z) {
  var w = z && z.w;
  if (!w || !w.evo || !z.mesh) return;
  var zm = typeof ZONE_MODELS !== 'undefined' ? ZONE_MODELS : null;
  if (z.type === 'mine' && zm && z.mesh.geometry === zm.mine) {
    z.mesh.geometry = Evo.goldGeo('mine@' + w.id, function () { return zm.mine; }, Evo.metalTint(w.id), 0.7);
    z.mesh.material = Evo.shinyMat();
  } else if (z.type === 'axe') {
    // 普通飞斧的几何体是大家共用的，不能释放
    if (!Evo._axeGeo) Evo._axeGeo = MODEL.build(Evo.AXE_PARTS, false);
    z.mesh.geometry = Evo._axeGeo;
    z.mesh.material = Evo.shinyMat();
  }
};

// 风暴战斧：双刃金斧，深色木柄、金箍、亮白的刃口、顶上一根尖刺（和原来的飞斧一样：柄沿 z，刃朝 +z）
Evo.AXE_PARTS = [
  ['box', [0.1, 0.1, 1.2], [0, 0, -0.06], 0x4a2c16],
  ['box', [0.16, 0.16, 0.1], [0, 0, -0.64], 0xe8a828],
  ['box', [0.15, 0.2, 0.2], [0, 0, 0.38], 0xe8a828],
  ['box', [0.07, 0.44, 0.36], [0, 0.29, 0.42], 0xf0b830, [0.3, 0, 0]],
  ['box', [0.07, 0.44, 0.36], [0, -0.29, 0.42], 0xf0b830, [-0.3, 0, 0]],
  ['box', [0.08, 0.5, 0.07], [0, 0.33, 0.62], 0xfff2c0, [0.3, 0, 0]],
  ['box', [0.08, 0.5, 0.07], [0, -0.33, 0.62], 0xfff2c0, [-0.3, 0, 0]],
  ['cone', [0.07, 0.32, 4], [0, 0, 0.72], 0xfff0b0, [Math.PI / 2, 0, 0]]
];

// 近战超武的金色斩击在 FX.slash / FX.sweep 里画（Weapons.swing 传 def.evo）；绕身一圈的镰刀再加一圈金色像素环
// （0.6 倍半径、最大 4.5 米：大镰刀的整圈会跑到镜头后面，内圈留在画面里）
Evo.slashCore = function (w) {
  var def = w.def;
  if ((def.arc || 2) <= 4) return;
  var r = (def.range || 4) * Weapons.size(w), o = Weapons.origin();
  FX.ring(o.x, P.pos.y + 0.05, o.z, Math.min(r * 0.6, 4.5), Evo.GOLD, 0.28);
};

// 攻城巨弩：同一帧射出的是一轮齐射；弩箭散得更开、飞得更平（不会刚出手就炸在脚下）
Evo.volley = function (w, p) {
  if (w.evoVolT !== Game.time || !w.evoVolHit) { w.evoVolT = Game.time; w.evoVol = (w.evoVol || 0) + 1; w.evoVolI = 0; w.evoVolHit = new Set(); }
  var n = Weapons.count(w), extra = (w.evoVolI - (n - 1) / 2) * 0.06;
  w.evoVolI++;
  if (extra) { var c = Math.cos(extra), s = Math.sin(extra), vx = p.vx, vz = p.vz; p.vx = vx * c + vz * s; p.vz = vz * c - vx * s; }
  if (p.vy < 0) p.vy *= 0.35;
  p.evoVol = w.evoVol;
};

// 暴风散弩：两边各多一支短箭
Evo.extraBolts = function (w) {
  var o = Weapons.origin(), dir = Weapons.aimDir(), base = Math.atan2(dir.x, dir.z);
  var mult = 1 + (Weapons.count(w) - 1) * 0.35;
  for (var i = 0; i < w.def.extraBolts; i++) {
    var side = i % 2 ? 1 : -1, k = 4 + (i >> 1);
    Weapons.launch(w, o, null, base + side * k * 0.09 + rand(-0.03, 0.03), dir.y + rand(-0.05, 0.05), mult);
  }
};

// ---------------- 每帧（跟在 Weapons.update 后面） ----------------
var _evM = null, _evQ = null, _evS = null, _evP = null, _evE = null;
Evo.tick = function (dt) {
  Evo.budget = 16;
  for (var i = 0; i < P.weapons.length; i++) {
    var w = P.weapons[i];
    // 分裂碎片的伤害和击杀记回本体
    if (w.evoFrag) { w.dmg += w.evoFrag.dmg; w.kills += w.evoFrag.kills; w.evoFrag.dmg = 0; w.evoFrag.kills = 0; }
    if (!w.evo) continue;
    if (w.evoRing) Evo.tickHalo(w, dt);
    if (w.def.type === 'flame' && w.flaming > 0) Evo.dragonLook(w, dt);
    if (w.def.type === 'tether' && w.target && w.beam && w.beam.visible) Evo.tetherGlow(w);
  }
  Evo.tickZones(dt);
  Evo.tickStun(dt);
  Evo.tickBurn(dt);
  for (i = Evo.fx.length - 1; i >= 0; i--) {
    if (!Evo.tickPillar(Evo.fx[i], dt)) { Evo.removeFx(Evo.fx[i]); Evo.fx.splice(i, 1); }
  }
  // 武器刚满足超武条件时提示一次
  Evo.readyT -= dt;
  if (Evo.readyT <= 0) { Evo.readyT = 0.5; Evo.checkReady(); }
};

// 真龙吐息：火焰锥中间一道白金色的火芯（前 60% 的距离），火里混着金白色的火星，末端每 0.3 秒一圈金色像素环
Evo.dragonLook = function (w, dt) {
  var fr = (w.def.range || 7) * Weapons.size(w), fx = Math.sin(w.fang), fz = Math.cos(w.fang);
  var x0 = P.pos.x + fx * 0.8, y0 = P.pos.y + 1.05, z0 = P.pos.z + fz * 0.8, l = fr * 0.6, kc = w.flameK != null ? w.flameK : 1;
  FX.trailSeg(x0, y0, z0, P.pos.x + fx * l, y0 + 0.2, P.pos.z + fz * l, 0.32, 0.5, kc, 0.35 * kc, Evo.col('dcore', 0xffe9a0), 0.4);
  if (Math.random() < dt * 24) {
    var d = rand(1, fr);
    FX.burst(P.pos.x + fx * d, P.pos.y + 1, P.pos.z + fz * d, 1, Math.random() < 0.5 ? 0xffffff : 0xffe066, 2, 0.25);
  }
  w.evoRingT = (w.evoRingT || 0) - dt;
  if (w.evoRingT <= 0) {
    w.evoRingT = 0.3;
    var ex = P.pos.x + fx * fr, ez = P.pos.z + fz * fr;
    FX.ring(ex, W.groundAt(ex, ez, P.pos.y + 2), ez, 1.6, Evo.GOLD, 0.3);
  }
};

// 超武光环：金色光墙更高；内圈的圣光像素环一呼一吸（跳伤时亮一下）；六颗金色星光在光环远处的半圈上滑过
Evo.tickHalo = function (w, dt) {
  var ring = w.evoRing, def = w.def;
  if (!ring.parent) return;
  var r = (def.range || 3.5) * Weapons.size(w), t = Game.time;
  var u = ring.material.uniforms, au = w.ring && w.ring.material && w.ring.material.uniforms;
  if (u && au) {
    ring.position.copy(w.ring.position);
    if (ring.geometry !== w.ring.geometry) ring.geometry = w.ring.geometry;
    u.uR.value = r * (0.8 + Math.sin(t * 2.4) * 0.05);
    u.uA.value = 0.7 + Math.sin(t * 3.3) * 0.2 + (au.uPulse ? au.uPulse.value * 0.8 : 0);
    // 光墙更高（Weapons.auraLook 每帧按半径重算高度，这里按同样的算法再放大）
    if (au.uHgt) au.uHgt.value = (0.55 + 0.25 * Math.min(2, r / 3.6)) * 1.45;
    var H = au.uH.value, by = w.ring.position.y, sc = Evo.col('star', 0xffe7a0);
    // 远处的半圈：镜头对面 ±100° 之内（星星不会跑到镜头底下变成大光斑）
    var far = (au.uCamAng ? au.uCamAng.value : Weapons.camAng()) + Math.PI;
    for (var k = 0; k < 6; k++) {
      var f = (t * 0.12 + k / 6) % 1, a = far + (f - 0.5) * 3.5, edge = Math.min(1, Math.min(f, 1 - f) * 8);
      var am = ((a % TAU) + TAU) % TAU, hi = Math.floor(am / TAU * 24) % 24;
      FX.glow(P.pos.x + Math.cos(a) * r, by + H[hi] + 0.3, P.pos.z + Math.sin(a) * r, 0.95, 0.95, sc, 0.75 * edge, 2);
    }
  } else {
    // 老版本的光环（平的圆环）
    ring.position.set(P.pos.x, P.pos.y + 0.18, P.pos.z);
    var s = r * (0.8 + Math.sin(t * 2.4) * 0.06);
    ring.scale.set(s, 1, s);
    ring.material.opacity = 0.26 + Math.sin(t * 3.3) * 0.1;
  }
  if (Math.random() < dt * 14) {
    var ma = Math.random() * TAU;
    FX.burst(P.pos.x + Math.cos(ma) * r, P.pos.y + 0.2, P.pos.z + Math.sin(ma) * r, 1, Math.random() < 0.5 ? 0xffffff : def.color, 1.2, 0.18);
  }
};

// 缚魂锁链：链环本身是金色的（Weapons.renderLinks），锁住的敌人身上一团金光，锁链上两颗白光往敌人那边跑
Evo.tetherGlow = function (w) {
  var tg = w.target, gc = Evo.col('gold', Evo.GOLD), t = Game.time;
  var ty = tg.y + tg.r, sy = P.pos.y + 1.1, pulse = 0.85 + Math.sin(t * 14) * 0.15;
  FX.glow(tg.x, ty, tg.z, 1.6 * pulse, 1.6 * pulse, gc, 0.55, 0);
  for (var k = 1; k <= 2; k++) {
    var f = (k / 3 + t * 1.5) % 1;
    FX.glow(lerp(P.pos.x, tg.x, f), lerp(sy, ty, f), lerp(P.pos.z, tg.z, f), 0.8, 0.8, Evo.col('white', 0xffffff), 0.6, 2);
  }
};

// 超武场地的金色点缀：黑洞的金色视界、龙卷风里往上转的金光和金色碎屑、焦土上的金白火苗、
// 火药桶上的闪光、飞斧的小光晕、毒云里冒的金色和白色气泡
Evo.tickZones = function (dt) {
  var zs = Weapons.zones, gc = Evo.col('gold', Evo.GOLD), wc = Evo.col('core', 0xfff4d0);
  for (var i = 0; i < zs.length; i++) {
    var z = zs[i], w = z.w;
    if (!w || !w.evo) continue;
    switch (z.type) {
      case 'blackhole': {
        var bs = Weapons.holeSize ? Weapons.holeSize(z) : z.r * 0.4;
        FX.glow(z.x, z.y + 1.5, z.z, bs * 3.3, bs * 3.3, gc, 0.6, 1);
        break;
      }
      case 'tornado': {
        var vs = Weapons.windScale ? Weapons.windScale(w) : 1;
        for (var k = 0; k < 2; k++) {
          var h = (z.t * 0.6 + k * 0.5) % 1, a = -z.t * 5 + k * Math.PI, rad = lerp(0.4, 1.2, h) * vs;
          FX.glow(z.x + Math.cos(a) * rad, z.y + 0.4 + h * 4 * vs, z.z + Math.sin(a) * rad, 0.8, 0.8, gc, 0.6 * (1 - h * 0.5), 0);
        }
        if (Math.random() < dt * 10) {
          var da = Math.random() * TAU;
          FX.part(z.x + Math.cos(da) * 0.8, z.y + rand(0.3, 2.5), z.z + Math.sin(da) * 0.8, -Math.sin(da) * 4, rand(1.5, 3), Math.cos(da) * 4, 0xffe066, 0.16, 0.7, -0.5);
        }
        break;
      }
      case 'fire':
        if (Math.random() < dt * 4) FX.burst(z.x + rand(-z.r, z.r) * 0.5, z.y + 0.3, z.z + rand(-z.r, z.r) * 0.5, 1, 0xffd23a, 2, 0.16);
        break;
      case 'axe': FX.glow(z.x, z.y, z.z, z.r * 0.7, z.r * 0.7, gc, 0.3, 0); break;
      case 'mine': if (Math.sin(z.t * 5 + i * 1.7) > 0.55) FX.glow(z.x, z.y + 0.95, z.z, 0.8, 0.8, wc, 0.8, 2); break;
      case 'puddle': if (Math.random() < dt * 6) FX.mote(z.x + rand(-z.r, z.r) * 0.6, z.y + 0.2, z.z + rand(-z.r, z.r) * 0.6, Math.random() < 0.6 ? 0xffe680 : 0xffffff, 0.14, rand(0.8, 1.5), 0.8); break;
    }
  }
};

// 敌人头顶高度（按模型包围盒算一次，缓存在敌人 def 上）
Evo.topOf = function (e) {
  var d = e.def;
  if (d.evoTop == null) {
    var h = 0;
    try {
      if (d.geo && d.geo.attributes && d.geo.attributes.position) { d.geo.computeBoundingBox(); h = d.geo.boundingBox.max.y; }
    } catch (err) { h = 0; }
    d.evoTop = h > 0.3 ? h : e.r / (e.scale || 1) * 2.6;
  }
  return e.y + d.evoTop * (e.scale || 1) + 0.35;
};

Evo.starMesh = function () {
  if (Evo._stars || !Game.scene) return Evo._stars || null;
  var geo = MODEL.build([['oct', [0.26], [0, 0, 0], 0xffd23a, null, [1, 1, 0.35]], ['oct', [0.13], [0, 0, 0.02], 0xffffff, null, [1, 1, 0.6]]], false);
  var im = MODEL.instanced(geo, 120, Game.scene);
  im.material = Evo.glowMat();
  Evo._stars = im;
  return im;
};

Evo.tickStun = function (dt) {
  var list = Evo.stunned, i, e;
  for (i = list.length - 1; i >= 0; i--) {
    e = list[i];
    e.evoStun -= dt;
    if (!e.alive || e.evoStun <= 0) { e.evoStunListed = false; e.evoStun = 0; list[i] = list[list.length - 1]; list.pop(); }
  }
  var mesh = list.length ? Evo.starMesh() : Evo._stars;
  if (!mesh) return;
  if (!_evM) { _evM = new THREE.Matrix4(); _evQ = new THREE.Quaternion(); _evS = new THREE.Vector3(1, 1, 1); _evP = new THREE.Vector3(); _evE = new THREE.Euler(); }
  var n = 0, t = Game.time;
  for (i = 0; i < list.length && n <= 117; i++) {
    e = list[i];
    var top = Evo.topOf(e), rad = 0.4 + e.r * 0.5;
    for (var k = 0; k < 3; k++) {
      var a = t * 6 + k * TAU / 3 + e.id;
      _evE.set(0, a, Math.sin(t * 9 + k) * 0.4);
      _evQ.setFromEuler(_evE);
      _evP.set(e.x + Math.cos(a) * rad, top + Math.sin(t * 9 + k * 2) * 0.07, e.z + Math.sin(a) * rad);
      _evM.compose(_evP, _evQ, _evS);
      mesh.setMatrixAt(n++, _evM);
    }
  }
  mesh.count = n;
  mesh.visible = n > 0;
  mesh.instanceMatrix.needsUpdate = true;
};

Evo.tickBurn = function (dt) {
  var list = Evo.burning;
  for (var i = list.length - 1; i >= 0; i--) {
    var e = list[i];
    e.evoBurn -= dt;
    if (!e.alive || e.evoBurn <= 0) { e.evoBurnListed = false; list[i] = list[list.length - 1]; list.pop(); continue; }
    if (Math.random() < dt * 7) FX.burst(e.x + rand(-0.3, 0.3), e.y + e.r * rand(0.8, 2), e.z + rand(-0.3, 0.3), 1, e.evoBurnC, 1.2, 0.18);
  }
};

Evo.checkReady = function () {
  for (var i = 0; i < P.weapons.length; i++) {
    var w = P.weapons[i];
    if (w.evo || w.evoTold || !Evo.canEvolve(w)) continue;
    w.evoTold = true;
    UI.toast('「' + w.def.name + '」可以觉醒超武了！' + (Evo.liveForge() ? '去圣锻炉或开金宝箱' : '打开金宝箱就能觉醒'), '#ffe14a');
  }
};

Evo.liveForge = function () {
  for (var i = 0; i < Interact.list.length; i++) {
    var o = Interact.list[i];
    if (o.kind === 'holyforge' && !o.used) return o;
  }
  return null;
};

Evo.clearFx = function () {
  Evo.fx.forEach(Evo.removeFx);
  Evo.fx = [];
  Evo.stunned.forEach(function (e) { e.evoStunListed = false; e.evoStun = 0; });
  Evo.burning.forEach(function (e) { e.evoBurnListed = false; });
  Evo.stunned = [];
  Evo.burning = [];
  if (Evo._stars) { Evo._stars.count = 0; Evo._stars.visible = false; }
  Evo.forgeRef = null;
  var lm = document.getElementById('levelModal');
  if (lm) lm.classList.remove('evoShow');
};

// ============================================================
//  圣锻炉：石台 + 铁砧上插着圣剑 + 炉膛里的圣火 + 两根水晶石柱，头顶一道光柱
// ============================================================
try {
  // 刻着金色符文的圣石砖（灰度石头 + 彩色符文）
  TEX.addTile('holystone', function (x, y, r) {
    var row = y >> 2, off = (row % 2) * 4, bx = (x + off) % 8, by = y % 4;
    if (by === 3 || bx === 7) return 150 + r() * 14;
    if (row % 2 === 1 && ((bx === 3 && by <= 2) || (by === 1 && bx >= 2 && bx <= 4))) return [255, 222, 120];
    return 208 + r() * 38;
  });
} catch (err) { /* 图集满了就用默认贴图 */ }

Evo.FORGE_PARTS = [
  // 两层八角石台（底层埋进地里，斜坡上也不悬空）+ 金色腰线
  ['cyl', [2.05, 2.3, 1.0, 8], [0, -0.15, 0], 0xc9c0b0, null, null, 'holystone'],
  ['cyl', [2.1, 2.1, 0.08, 8], [0, 0.3, 0], 0xe0b040, null, null, 'gold'],
  ['cyl', [1.62, 1.78, 0.4, 8], [0, 0.55, 0], 0xd8d0c2, null, null, 'holystone'],
  ['cyl', [1.67, 1.67, 0.08, 8], [0, 0.7, 0], 0xe0b040, null, null, 'gold'],
  // 后面的炉膛：后墙 + 两根石柱 + 横梁 + 石板尖顶 + 烟囱
  ['box', [2.3, 2.5, 0.5], [0, 2.0, -1.2], 0xa59c8e, null, null, 'brick'],
  ['box', [0.55, 2.6, 0.95], [-1.05, 2.05, -0.9], 0xc2b9aa, null, null, 'holystone'],
  ['box', [0.55, 2.6, 0.95], [1.05, 2.05, -0.9], 0xc2b9aa, null, null, 'holystone'],
  ['box', [2.8, 0.5, 1.15], [0, 3.55, -0.9], 0xb0a797, null, null, 'brick'],
  ['cone', [1.9, 1.2, 4], [0, 4.4, -0.95], 0x56607a, [0, Math.PI / 4, 0], null, 'brick'],
  ['box', [0.6, 1.4, 0.6], [0.55, 4.8, -1.0], 0x9a9184, null, null, 'brick'],
  ['box', [0.8, 0.16, 0.8], [0.55, 5.55, -1.0], 0x4a5266, null, null, 'rock'],
  // 横梁上的金色圣徽（十字）
  ['box', [0.8, 0.14, 0.1], [0, 3.57, -0.3], 0xe8bb44, null, null, 'gold'],
  ['box', [0.14, 0.62, 0.1], [0, 3.57, -0.3], 0xe8bb44, null, null, 'gold'],
  // 铁砧
  ['box', [0.95, 0.28, 0.62], [0, 0.89, 0.45], 0x3b3e47, null, null, 'metal'],
  ['box', [0.5, 0.36, 0.42], [0, 1.21, 0.45], 0x34373f, null, null, 'metal'],
  ['box', [1.35, 0.34, 0.6], [0, 1.56, 0.45], 0x545966, null, null, 'metal'],
  ['cone', [0.3, 0.72, 4], [1.03, 1.58, 0.45], 0x545966, [0, Math.PI / 4, -Math.PI / 2], null, 'metal'],
  ['box', [0.28, 0.22, 0.44], [-0.78, 1.62, 0.45], 0x545966, null, null, 'metal'],
  // 插在铁砧上的圣剑
  ['box', [0.16, 1.3, 0.06], [0.12, 2.35, 0.45], 0xeef2fa, null, null, 'metal'],
  ['box', [0.68, 0.12, 0.16], [0.12, 3.03, 0.45], 0xe8bb44, null, null, 'gold'],
  ['box', [0.1, 0.42, 0.1], [0.12, 3.3, 0.45], 0x7a3a1a, null, null, 'cloth'],
  // 前面两根符文石柱 + 金顶
  ['box', [0.42, 1.8, 0.42], [-1.25, 1.55, 0.95], 0xc9c0b0, null, null, 'holystone'],
  ['box', [0.42, 1.8, 0.42], [1.25, 1.55, 0.95], 0xc9c0b0, null, null, 'holystone'],
  ['box', [0.58, 0.16, 0.58], [-1.25, 2.5, 0.95], 0xe0b040, null, null, 'gold'],
  ['box', [0.58, 0.16, 0.58], [1.25, 2.5, 0.95], 0xe0b040, null, null, 'gold']
];
// 自发光部分：炉口、炉心、圣徽中心、剑柄宝石
Evo.FORGE_GLOW = [
  ['box', [1.5, 2.45, 0.08], [0, 2.0, -0.93], 0xffa83a],
  ['box', [1.0, 1.3, 0.06], [0, 1.45, -0.88], 0xffe39a],
  ['oct', [0.17], [0, 3.57, -0.22], 0xfff6c8],
  ['oct', [0.12], [0.12, 3.58, 0.45], 0xfff2a8]
];
// 石柱上漂浮的水晶（单独一个网格，上下浮动）
Evo.FORGE_CRYSTAL = [
  ['oct', [0.28], [-1.25, 3.1, 0.95], 0xffe680, null, [1, 1.7, 1]],
  ['oct', [0.28], [1.25, 3.1, 0.95], 0xffe680, null, [1, 1.7, 1]]
];
// 炉火（叠加发光；底部在原点，方便按高度闪动）
Evo.FORGE_FLAME = [
  ['cone', [0.42, 1.2, 5], [-0.36, 0.6, -0.02], 0xff8a1a],
  ['cone', [0.52, 1.7, 5], [0.04, 0.85, 0], 0xffc040],
  ['cone', [0.36, 1.0, 5], [0.42, 0.5, -0.02], 0xff8a1a],
  ['cone', [0.24, 1.15, 5], [0.0, 0.58, 0.16], 0xfff2c0]
];

// 锻炉头顶的光束：细的金色光芯 + 淡淡的外光（不受雾影响，远处也找得到）
Evo.beamGeo = function () {
  if (!Evo._beamGeo) Evo._beamGeo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true).translate(0, 0.5, 0);
  return Evo._beamGeo;
};

Evo.forgeModel = function (o) {
  var g = new THREE.Group();
  var glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  o.base = new THREE.Mesh(MODEL.build(Evo.FORGE_PARTS), MODEL.material());
  o.glow = new THREE.Mesh(MODEL.build(Evo.FORGE_GLOW, false), glowMat);
  o.crystal = new THREE.Mesh(MODEL.build(Evo.FORGE_CRYSTAL, false), glowMat);
  o.flame = new THREE.Mesh(MODEL.build(Evo.FORGE_FLAME, false), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending, depthWrite: false }));
  o.flame.position.set(0, 0.78, -0.68);
  o.ringM = new THREE.Mesh(Evo.ringGeo(), new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  o.ringM.position.y = 0.14;
  o.ringM.scale.set(3.4, 1, 3.4);
  var beamMat = function (c, a, add) {
    return new THREE.MeshBasicMaterial({ color: c, map: Evo.fadeTex(), transparent: true, opacity: a, blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, side: THREE.DoubleSide, fog: false });
  };
  o.beam = new THREE.Mesh(Evo.beamGeo(), beamMat(0xffc94a, 0.7, false));
  o.beam.position.set(0, 5.4, -0.2);
  o.beam.scale.set(0.24, 75, 0.24);
  o.halo = new THREE.Mesh(Evo.beamGeo(), beamMat(0x6a4a18, 0.3, true));
  o.halo.position.copy(o.beam.position);
  o.halo.scale.set(0.62, 60, 0.62);
  [o.beam, o.halo].forEach(function (m) { m.frustumCulled = false; m.renderOrder = 2; });
  [o.base, o.glow, o.crystal, o.flame, o.ringM, o.beam, o.halo].forEach(function (m) { g.add(m); });
  g.scale.setScalar(Evo.FORGE_SCALE);
  return g;
};

// 局部坐标 → 世界坐标（模型绕 Y 轴随机转过 rotY，整体放大 FORGE_SCALE）
Evo.FORGE_SCALE = 1.15;
Evo.forgeLocal = function (o, lx, lz) {
  var c = Math.cos(o.rotY || 0), s = Math.sin(o.rotY || 0), k = Evo.FORGE_SCALE;
  return { x: o.x + (lx * c + lz * s) * k, z: o.z + (-lx * s + lz * c) * k };
};

Evo.forgeTick = function (o, dt, d2) {
  if (!o.flame) return;
  o.t = (o.t || 0) + dt;
  var t = o.t, ready = Evo.anyReady();
  // 光束：走近时变淡，有武器能觉醒时一闪一闪
  var near = clamp((Math.sqrt(d2) - 6) / 22, 0.12, 1);
  o.beam.material.opacity = (ready ? 0.8 + Math.sin(t * 4) * 0.15 : 0.6) * near;
  o.halo.material.opacity = (ready ? 0.45 + Math.sin(t * 4) * 0.15 : 0.25) * near;
  if (d2 > 80 * 80) return;
  o.flame.scale.set(1 + Math.sin(t * 11) * 0.07, 0.86 + Math.abs(Math.sin(t * 7.3)) * 0.2 + Math.sin(t * 23) * 0.04, 1 + Math.cos(t * 9) * 0.07);
  o.glow.material.color.setScalar(0.84 + Math.sin(t * 2.6) * 0.16);
  o.crystal.position.y = Math.sin(t * 2.2) * 0.09;
  var rs = 3.4 * (ready ? 1 + Math.sin(t * 5) * 0.05 : 1);
  o.ringM.scale.set(rs, 1, rs);
  o.ringM.material.opacity = ready ? 0.6 + Math.sin(t * 5) * 0.25 : 0.38;
  if (Math.random() < dt * (ready ? 10 : 3)) {
    var c = Evo.forgeLocal(o, 0.55 + rand(-0.2, 0.2), -1.0);
    FX.burst(c.x, o.y + 5.7 * Evo.FORGE_SCALE, c.z, 1, Math.random() < 0.5 ? 0xffe066 : 0xff9a2a, 1.4, 0.2);
  }
  if (ready && Math.random() < dt * 8) {
    var a = Math.random() * TAU;
    FX.burst(o.x + Math.cos(a) * 3.8, o.y + 0.3, o.z + Math.sin(a) * 3.8, 1, 0xfff1a8, 1.2, 0.2);
  }
};

Evo.forgeLabel = function () {
  var ready = Evo.ready();
  if (ready.length) return '圣锻炉：锻造超武（' + ready.map(function (w) { return w.def.name; }).join('、') + ' 可以觉醒）';
  var lines = ['圣锻炉：武器 Lv' + EVO_REQ.level + ' + 对应魔典 Lv' + EVO_REQ.tome + ' 才能锻造超武'], reqs = [];
  P.weapons.forEach(function (w) { if (!w.evo && EVO[w.id]) reqs.push(Evo.reqText(w)); });
  // 三把以上时两条并成一行，提示框不会太高
  var pair = reqs.length > 2;
  for (var i = 0; i < reqs.length; i += pair ? 2 : 1) lines.push(pair && reqs[i + 1] ? reqs[i] + '　　' + reqs[i + 1] : reqs[i]);
  if (lines.length === 1) lines.push('你的武器都已经觉醒超武了');
  return lines.join('\n');
};

Evo.forgeOption = function (w) {
  var ev = EVO[w.id];
  return { kind: 'evo', id: w.id, rarity: 4, title: ev.name, icon: ev.icon, color: ev.color, sub: w.def.name + ' Lv' + w.level + ' → 超武', lines: Evo.lines(w.id), evoFoot: '觉醒' };
};

Evo.openForge = function (o) {
  var list = Evo.ready();
  if (!list.length) return;
  FX.ring(o.x, o.y, o.z, 4, 0xffd84a, 0.35);
  Game.openModal(function () {
    Evo.forgeRef = o;
    var opts = list.map(Evo.forgeOption);
    opts.push({ kind: 'evo-cancel', id: 'evo-cancel', rarity: 0, title: '暂不锻造', icon: '离', color: 0x4a4458, sub: '圣锻炉会一直在这里', lines: ['以后再来，换一把武器觉醒'], evoFoot: '离开', evoNo: true });
    UI.choiceModal('evoforge', '圣锻炉 · 选择要觉醒的武器', opts);
  });
};

// 用掉以后：火熄了、光柱和光圈消失、石头变暗，冒一股烟
Evo.spendForge = function (o) {
  o.used = true;
  [o.flame, o.ringM, o.beam, o.halo].forEach(function (m) { if (m && m.parent) m.parent.remove(m); });
  if (o.glow) o.glow.material.color.setRGB(0.32, 0.28, 0.24);
  if (o.crystal) o.crystal.position.y = -0.12;
  var col = o.base && o.base.geometry.attributes.color;
  if (col) { for (var i = 0; i < col.array.length; i++) col.array[i] *= 0.62; col.needsUpdate = true; }
  FX.ring(o.x, o.y, o.z, 6, 0xffd84a, 0.5);
  FX.burst(o.x, o.y + 2, o.z, 30, 0xffe066, 8, 0.35);
  var c = Evo.forgeLocal(o, 0.55, -1.0);
  FX.burst(c.x, o.y + 5.6 * Evo.FORGE_SCALE, c.z, 14, 0x8a847c, 2.5, 0.5);
};

// 放在离出生点 40~90 米的空地上，不和其他互动物体挤在一起；
// 也离 Boss 传送门 32 米以上：传送门 30 米内就会被“发现”，两个目标分开，各自去找
Evo.forgeSpot = function () {
  var best = null, bestS = -1;
  for (var t = 0; t < 36; t++) {
    var p = W.randomSpot(40, 90), d = Math.sqrt(p.x * p.x + p.z * p.z);
    if (d < 40 || d > 90) continue;
    if (W.freeSpot && !W.freeSpot(p.x, p.z, 4)) continue;
    var near = 99, portal = 99;
    for (var i = 0; i < Interact.list.length; i++) {
      var o = Interact.list[i], od = Math.sqrt(dist2(o.x, o.z, p.x, p.z));
      if (!o.used) near = Math.min(near, od);
      if (o.kind === 'bossportal') portal = Math.min(portal, od);
    }
    if (near >= 8 && portal >= 32) return p;
    var score = Math.min(near / 8, portal / 32);
    if (score > bestS) { bestS = score; best = p; }
  }
  if (best) return best;
  var a = Math.random() * TAU, x = Math.cos(a) * 60, z = Math.sin(a) * 60;
  return { x: x, z: z, y: W.groundAt(x, z, 999) };
};

Interact.KINDS.holyforge = {
  radius: 3.6,
  model: function (o) { return Evo.forgeModel(o); },
  label: function () { return Evo.forgeLabel(); },
  canUse: function () { return Evo.anyReady(); },
  denied: function () {
    return P.weapons.some(function (w) { return !w.evo; }) ? '还没有武器满足超武条件（武器 Lv' + EVO_REQ.level + ' + 对应魔典 Lv' + EVO_REQ.tome + '）' : '你的武器都已经觉醒超武了';
  },
  use: function (o) { Evo.openForge(o); },
  update: function (o, dt, d2) { Evo.forgeTick(o, dt, d2); },
  mapIcon: function () {
    var r = Evo.anyReady();
    return { color: r ? '#fff6c0' : '#ffbf2e', shape: 'diamond', size: r ? 5 + Math.sin(Game.realTime * 6) : 4.2 };
  },
  clear: function () { Evo.clearFx(); }
};

// 每关放一座（Interact.populate 里其他东西都放好之后）
(function () {
  var populate = Interact.populate;
  Interact.populate = function () {
    populate.apply(this, arguments);
    var s = Evo.forgeSpot();
    Interact.add('holyforge', s.x, s.z, s.y);
  };
})();

// 免费金宝箱：有武器满足条件就觉醒它（代替物品）；付费宝箱不会触发
(function () {
  var prev = Interact.onFreeChest;
  Interact.onFreeChest = function (o) {
    var w = Evo.best();
    if (w) { FX.ring(o.x, o.y, o.z, 5, 0xffd84a, 0.5); Evo.evolve(w, 'chest'); return true; }
    return prev ? prev(o) : false;
  };
})();

// ============================================================
//  包一层武器函数（只加超武的东西，原逻辑不变）
// ============================================================
(function () {
  var update = Weapons.update;
  Weapons.update = function (dt) { update.apply(this, arguments); Evo.tick(dt); };

  // 弹丸移动之前先给分裂碎片对准目标
  var updateProjs = Weapons.updateProjs;
  Weapons.updateProjs = function () { Evo.steerFrags(); return updateProjs.apply(this, arguments); };

  // 超武的弹丸换成金色网格；勇者剑气更大；攻城巨弩见 Evo.volley
  var launch = Weapons.launch;
  Weapons.launch = function (w) {
    var p = launch.apply(this, arguments);
    if (p && w && w.evo) {
      p.kind = Evo.kindOf(p.kind, w.id);
      if (w.def.waveScale && p.kind && p.kind.indexOf('wave') === 0) { p.r *= w.def.waveScale; p.scale *= w.def.waveScale; p.life *= 1.25; }
      if (w.def.aimed && w.def.explode) Evo.volley(w, p);
    }
    return p;
  };

  // 攻城巨弩的爆炸：同一轮齐射炸到同一个敌人只算一次（多支弩箭负责覆盖更大的范围，而不是叠伤害）
  var explode = Weapons.explode;
  Weapons.explode = function (p) {
    var w = p.w;
    if (!(w && w.evo && p.evoVol)) return explode.apply(this, arguments);
    var r = (w.def.blast || 3) * Weapons.size(w), hit = w.evoVol === p.evoVol ? w.evoVolHit : null;
    FX.boom(p.x, p.y, p.z, r, w.def.color, Weapons.boomOpt ? Weapons.boomOpt(w) : null);
    Enemies.inRadius(p.x, p.z, r, function (e) {
      if (Math.abs(e.y - p.y) > r + 1.5) return;
      if (hit) { if (hit.has(e.id)) return; hit.add(e.id); }
      var dx = e.x - p.x, dz = e.z - p.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      Weapons.hit(w, e, p.dmgMult, dx / d, dz / d);
    });
  };

  var fire = Weapons.fire;
  Weapons.fire = function (w) {
    var ok = fire.apply(this, arguments);
    if (ok && w.evo && w.def.extraBolts && w.def.type === 'shotgun') Evo.extraBolts(w);
    return ok;
  };

  // 连砍好几下（数量 > 1）时金环只画第一下的
  var swing = Weapons.swing;
  Weapons.swing = function (w, ang, delay) {
    var r = swing.apply(this, arguments);
    if (w && w.evo && (w.def.arc || 2) > 4 && !(delay > 0)) Evo.slashCore(w);
    return r;
  };

  // 天罚雷杖：调用期间把闪电的默认颜色换成金色（FX.bolt 不传颜色时用 FX.boltColor），连锁的闪电也分叉；
  // 落点只画一圈金环（普通的蓝环在 Weapons.chain 里已经跳过），不会铺满一地的圈
  var chain = Weapons.chain;
  Weapons.chain = function (w, first) {
    var ok = first && first.alive, evo = !!(w && w.evo), prev = FX.boltColor, pf = FX.boltFork, r;
    if (evo) { FX.boltColor = Evo.BOLT_C; FX.boltFork = true; }
    try { r = chain.apply(this, arguments); } finally { FX.boltColor = prev; FX.boltFork = pf; }
    if (ok && evo) {
      FX.ring(first.x, first.y, first.z, 1.8 * Weapons.size(w), Evo.GOLD, 0.3);
      FX.burst(first.x, first.y + 1, first.z, 5, 0xfff3a0, 5, 0.25);
    }
    return r;
  };

  var wrapZone = function (name) {
    var f = Weapons[name];
    Weapons[name] = function () {
      var n0 = Weapons.zones.length;
      var r = f.apply(this, arguments);
      if (Weapons.zones.length > n0) Evo.dressZone(Weapons.zones[Weapons.zones.length - 1]);
      return r;
    };
  };
  wrapZone('spawnZone'); wrapZone('throwAxe'); wrapZone('fireZone');

  var attach = Weapons.attach;
  Weapons.attach = function (w) {
    var r = attach.apply(this, arguments);
    if (w.evoRing && !w.evoRing.parent && Weapons.scene) Weapons.scene.add(w.evoRing);
    return r;
  };
  var detach = Weapons.detach;
  Weapons.detach = function (w) {
    var r = detach.apply(this, arguments);
    if (w.evoRing && w.evoRing.parent) w.evoRing.parent.remove(w.evoRing);
    return r;
  };

  // 开新局：Game.start 先建关卡（会把上一局的武器重新挂回场景）再调 P.reset 清空武器列表，
  // 所以清空之前先把它们的常驻模型（光环、锁链、超武光圈）拿掉，免得留在地图上
  var reset = P.reset;
  P.reset = function () {
    if (P.weapons) P.weapons.forEach(function (w) { Weapons.detach(w); });
    return reset.apply(this, arguments);
  };
})();

// ============================================================
//  界面（ui.js 在本文件之后加载，所以在 load 时、Game.init 之前包装）
// ============================================================
// HUD 武器栏：超武金框 + “超”角标；满足条件的武器金光脉冲
Evo.decorateHud = function () {
  var box = document.getElementById('weaponSlots');
  if (!box) return;
  var slots = box.getElementsByClassName('slot');
  if (!slots.length) slots = box.children;
  for (var i = 0; i < P.weapons.length && i < slots.length; i++) {
    var w = P.weapons[i], s = slots[i];
    var st = w.evo ? 'evo' : Evo.canEvolve(w) ? 'ready' : '';
    if (s.__evo === st) continue;
    s.__evo = st;
    s.classList.toggle('evoSlot', st === 'evo');
    s.classList.toggle('evoReady', st === 'ready');
    var b = s.querySelector('.evoBadge');
    if (st === 'evo' && !b) {
      if (getComputedStyle(s).position === 'static') s.style.position = 'relative';
      b = document.createElement('span');
      b.className = 'evoBadge';
      b.textContent = '超';
      s.appendChild(b);
    } else if (st !== 'evo' && b) s.removeChild(b);
  }
};

// 暂停界面：每把武器的超武目标和进度
Evo.span = function (text, cls) { var s = document.createElement('span'); s.className = cls; s.textContent = text; return s; };

Evo.pauseRow = function (w) {
  var ev = EVO[w.id], d = document.createElement('div');
  d.className = 'evoPRow' + (w.evo ? ' done' : Evo.canEvolve(w) ? ' ready' : '');
  var ic = Evo.span(w.def.icon, 'evoPIc');
  // 没有图标时是符文砖（深色底 + 武器颜色的字）；有图标时 ui.js 换成武器图标
  if (typeof Kit !== 'undefined') Kit.glyphTile(ic, w.def.icon, w.def.color);
  else ic.style.backgroundColor = Evo.hex(w.def.color);
  // 名字一行、条件一行（暂停界面右栏比较窄）
  var tx = document.createElement('div'), nm = Evo.span('', 'evoPName'), rq = Evo.span('', 'evoPReq');
  tx.className = 'evoPTxt';
  if (!ev) { nm.textContent = w.def.name; rq.textContent = '没有超武'; }
  else if (w.evo) {
    nm.textContent = ev.name + '（已觉醒 Lv' + w.level + '）';
    rq.textContent = ev.traits.map(function (t) { return EVO_TRAITS[t].name; }).join(' · ');
  } else {
    nm.textContent = w.def.name + ' → ' + ev.name;
    var tl = Evo.tomeLv(ev.tome);
    rq.appendChild(Evo.span('Lv' + Math.min(w.level, EVO_REQ.level) + '/' + EVO_REQ.level, w.level >= EVO_REQ.level ? 'ok' : 'no'));
    rq.appendChild(document.createTextNode(' · '));
    rq.appendChild(Evo.span(TOMES[ev.tome].name + ' Lv' + Math.min(tl, EVO_REQ.tome) + '/' + EVO_REQ.tome, tl >= EVO_REQ.tome ? 'ok' : 'no'));
    if (Evo.canEvolve(w)) rq.appendChild(Evo.span(' 可锻造！', 'go'));
  }
  tx.appendChild(nm); tx.appendChild(rq);
  d.appendChild(ic); d.appendChild(tx);
  return d;
};

Evo.renderPause = function () {
  var modal = document.getElementById('pauseModal');
  if (!modal) return;
  var box = document.getElementById('evoPause');
  if (!box) {
    box = document.createElement('div');
    box.id = 'evoPause';
    // 放在右栏“物品”下面（不用往下翻）；找不到就放在按钮上面
    var inv = document.getElementById('itemList'), row = null;
    if (inv && inv.parentNode && modal.contains(inv)) inv.parentNode.insertBefore(box, inv.nextSibling);
    else {
      for (var i = 0; i < modal.children.length; i++) if (modal.children[i].classList.contains('row')) row = modal.children[i];
      if (row) modal.insertBefore(box, row); else modal.appendChild(box);
    }
  }
  box.innerHTML = '';
  var h = document.createElement('h3');
  h.textContent = '超武';
  box.appendChild(h);
  P.weapons.forEach(function (w) { box.appendChild(Evo.pauseRow(w)); });
  var hint = document.createElement('div');
  hint.className = 'evoPHint';
  // 按短语排（Kit.phrase）：竖屏那一栏窄，不会剩下「觉醒」两个字一行
  var ht = '武器 Lv' + EVO_REQ.level + ' + 对应魔典 Lv' + EVO_REQ.tome + '：去圣锻炉锻造，或者打开免费金宝箱自动觉醒';
  if (typeof Kit !== 'undefined' && Kit.phrase) Kit.phrase(hint, ht); else hint.textContent = ht;
  box.appendChild(hint);
};

Evo.install = function () {
  if (Evo.installed || typeof UI === 'undefined') return;
  Evo.installed = true;
  UI.modeHandlers = UI.modeHandlers || {};
  // 圣锻炉选武器
  UI.modeHandlers.evoforge = function (o) {
    var f = Evo.forgeRef;
    Evo.forgeRef = null;
    if (o.kind !== 'evo') return;
    var w = Weapons.find(o.id);
    if (!Evo.canEvolve(w)) return;
    if (f) Evo.spendForge(f);
    Evo.evolve(w, 'forge');
  };
  // 觉醒弹窗关闭：放光柱
  UI.modeHandlers.evodone = function (o) {
    var lm = document.getElementById('levelModal');
    if (lm) lm.classList.remove('evoShow');
    var w = Weapons.find(o.id);
    if (w) Evo.glory(w);
  };
  var wrap = function (name, after) {
    var f = UI[name];
    if (typeof f !== 'function') return;
    UI[name] = function () { var r = f.apply(this, arguments); after.apply(this, arguments); return r; };
  };
  wrap('update', function () { Evo.decorateHud(); });
  wrap('showPause', function () { Evo.renderPause(); });
  // 圣锻炉的提示有好几行
  wrap('setPrompt', function (text) {
    var multi = !!text && text.indexOf('\n') >= 0;
    if (multi === Evo.promptMulti) return;
    Evo.promptMulti = multi;
    var el = document.getElementById('prompt');
    if (el) el.classList.toggle('evoMulti', multi);
  });
  // 超武卡片：金色样式和自定义角标文字
  var card = UI.card;
  if (typeof card === 'function') {
    UI.card = function (o) {
      var b = card.apply(this, arguments);
      if (o && b && b.classList) {
        if (o.kind === 'evo' || o.kind === 'evo-done') b.classList.add('evoCard');
        if (o.evoNo) b.classList.add('evoNo');
        if (o.evoHint) b.classList.add('evoHintCard');
        if (o.evoFoot) { var f = b.querySelector('.cardRarity'); if (f) f.textContent = o.evoFoot; }
        // 说明按短语折行（Kit.phrase）：ui.js 的 UI.card 给每张卡片都排好了，这里不用再排
      }
      return b;
    };
  }
  // 打开别的弹窗时去掉觉醒弹窗的金色样式
  var openModal = UI.openModal;
  if (typeof openModal === 'function') {
    UI.openModal = function () {
      var lm = document.getElementById('levelModal');
      if (lm) lm.classList.remove('evoShow');
      return openModal.apply(this, arguments);
    };
  }
};
if (document.readyState === 'complete') Evo.install();
else window.addEventListener('load', Evo.install);

// ---------------- 注入样式 ----------------
// 跟着像素风 HUD：直角、2 像素黑边、左上亮右下暗的斜面，金色发光
Evo.BEVEL = 'inset 2px 2px 0 rgba(255, 255, 255, 0.4), inset -2px -2px 0 rgba(0, 0, 0, 0.38)';
Evo.CSS = [
  // 字号只用 12/18/24/36/48、描边只用 style.css 的 --ol*（docs/knight-magic/design/UI_STYLE.md）；不发光、不转圈：金色都是硬边
  // HUD 武器栏：超武是金框（外面一圈黑边）+ 左上角的“超”字角标；可觉醒的武器外面一圈金框一闪一闪（只动 opacity）
  // 底色往金色压暗一点：超武的颜色都偏浅，白字要看得清
  '#weaponSlots .slot.evoSlot { border-color: #ffd84a !important; background-image: linear-gradient(rgba(255, 200, 60, 0.3), rgba(150, 80, 0, 0.5)), linear-gradient(rgba(255, 255, 255, 0.16) 50%, rgba(0, 0, 0, 0.13) 50%) !important; box-shadow: ' + Evo.BEVEL + ', 0 0 0 2px #000, 0 3px 0 2px rgba(0, 0, 0, 0.45) !important; }',
  '#weaponSlots .slot.evoSlot::after { content: ""; position: absolute; left: 0; top: 0; width: 9px; height: 9px; background: linear-gradient(135deg, rgba(255, 255, 255, 0.75) 50%, rgba(255, 255, 255, 0) 50%); pointer-events: none; }',
  // 角标只伸进栏位之间的空隙，不压到旁边的栏位和上一排的等级字（12 号深色字、金底、2 像素黑边）
  '#weaponSlots .evoBadge { position: absolute; left: -6px; top: -6px; z-index: 2; width: 16px; height: 16px; border: 2px solid #000; background: var(--goldM); box-shadow: inset 0 -2px 0 var(--goldD); color: #2a1600; font-size: var(--fs-s); line-height: 12px; text-align: center; text-shadow: none; pointer-events: none; }',
  // 可以觉醒：栏位外面一圈 2 像素金框（加黑边），两格一亮一暗地闪（这是除了低血量以外唯一一直在动的东西）
  '#weaponSlots .slot.evoReady::before { content: ""; position: absolute; inset: -4px; border: 2px solid var(--goldM); box-shadow: 0 0 0 2px #000; opacity: 0.2; pointer-events: none; animation: evoPulse 1.1s steps(1, end) infinite; }',
  '@keyframes evoPulse { 50% { opacity: 1; } }',
  // 圣锻炉的多行提示：按行左对齐，放低一点，不挡住脚下的血条
  '#prompt.evoMulti { bottom: calc(env(safe-area-inset-bottom, 0px) + 112px); white-space: pre-line !important; text-align: left; line-height: 24px; }',
  '@media (max-height: 560px) { #prompt.evoMulti { bottom: calc(env(safe-area-inset-bottom, 0px) + 84px); } }',
  // 超武卡片：和别的卡片一样的深蓝底（顶上一点传说的金色，style.css 的 .card），金边，外面再一圈金色硬边（和传说卡片一样，不发光）；
  // 不要整张的暗金 / 芥末色底。说明几行折行时每行差不多长（style.css 的 .cardLines div），而且按短语折行（ui.js 的 UI.card 里的 Kit.phrase）
  '.card.evoCard { --rc: #ffd84a; --rg: rgba(255, 201, 40, 0.7); border-color: #ffd84a !important; box-shadow: 0 0 0 2px #000, 0 0 0 5px #ffd84a, 0 0 0 7px #000, inset 0 0 0 2px rgba(0, 0, 0, 0.55), 0 9px 0 4px #000 !important; }',
  '.card.evoCard .cardTitle, .card.evoCard .cardRarity { color: var(--goldM); }',
  '.card.evoCard .cardSub { color: var(--goldL); }',
  '.card.evoCard .cardIcon { border-color: #000; box-shadow: ' + Evo.BEVEL + ', 0 0 0 2px #ffd84a; }',
  // 「超武」小签：12 号深色字、金底、2 像素黑圈（Kit.tag 的样子）
  '.card.evoCard::before { content: "超武"; position: absolute; left: 9px; top: -12px; z-index: 1; padding: 0 6px; background: var(--goldM); box-shadow: 0 0 0 2px #000, inset 0 -2px 0 var(--goldD); color: #2a1600; font-size: var(--fs-s); line-height: 18px; text-shadow: none; }',
  // 「暂不锻造」：灰色的框和字（不是普通稀有度的绿色：绿色是主按钮的颜色）
  '.card.evoNo { opacity: 0.8; --rc: #6f7893 !important; --rg: rgba(111, 120, 147, 0.3) !important; }',
  '.card.evoNo .cardRarity { color: var(--muted); }',
  '.card.evoHintCard { box-shadow: 0 0 0 2px #000, 0 0 0 5px #ffd84a, 0 0 0 7px #000, inset 0 0 0 2px rgba(0, 0, 0, 0.55), 0 9px 0 4px #000 !important; }',
  '.card.evoHintCard .cardLines div:last-child { color: var(--goldM); }',
  // 觉醒弹窗：48 号金色标题（描边 + 厚度，往下落 6 像素出来）、一张宽卡片（.card 默认最宽 280px，这里放宽到 440px）；不要旋转的光芒
  '#levelModal.evoShow { overflow: visible !important; }',
  '#levelModal.evoShow h2 { color: var(--goldL) !important; font-size: var(--fs-xxl); line-height: 54px; text-shadow: var(--ol3) !important; animation: kmTitleIn 0.2s steps(3, jump-start) both; }',
  '#levelModal.evoShow .cards { padding-top: 12px; }',
  '#levelModal.evoShow .card { flex: 0 1 440px; width: min(440px, 100%); max-width: min(440px, 100%); min-height: 0; padding: 15px 15px 12px; gap: 12px; }',
  '#levelModal.evoShow .cardIcon { width: 62px; height: 62px; font-size: var(--fs-xl); line-height: 36px; }',
  '#levelModal.evoShow .cardTitle { font-size: var(--fs-l); line-height: 30px; }',
  '#levelModal.evoShow .cardSub { font-size: var(--fs-s); line-height: 18px; }',
  '#levelModal.evoShow .cardLines { font-size: var(--fs-m); line-height: 24px; }',
  // 暂停界面的超武进度（右栏，物品下面）：每行一个凹槽（kit.css）；觉醒了的左边一条金边
  '#evoPause { margin: 10px 0 0; text-align: left; }',
  '#evoPause h3 { margin: 6px 0 5px; }',
  '.evoPRow { display: flex; align-items: center; gap: 9px; margin-top: 3px; padding: 3px 9px 3px 3px; background-color: rgba(255, 255, 255, 0.05); }',
  '.evoPRow.done { background-color: rgba(255, 216, 74, 0.06); box-shadow: inset 3px 0 0 var(--goldM); }',
  '.evoPRow.ready { box-shadow: inset 0 0 0 2px #ffd84a; }',
  // 前面的图块：有武器图标就用图标（ui.js），没有就是符文砖（Kit.glyphTile）
  '.evoPIc { flex: none; width: 30px; height: 30px; border: 2px solid #000; background-color: #5a6378; background-image: linear-gradient(rgba(255, 255, 255, 0.16) 50%, rgba(0, 0, 0, 0.13) 50%); display: flex; align-items: center; justify-content: center; font-size: var(--fs-m); line-height: 18px; color: #fff; text-shadow: var(--ol1); box-shadow: ' + Evo.BEVEL + '; }',
  '.evoPRow.done .evoPIc { border-color: #ffd84a; box-shadow: ' + Evo.BEVEL + ', 0 0 0 2px #000; }',
  '.evoPTxt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0; }',
  '.evoPName { font-size: var(--fs-m); line-height: 24px; }',
  '.evoPRow.done .evoPName { color: var(--goldM); }',
  '.evoPReq { font-size: var(--fs-s); line-height: 18px; color: #c9d3ea; }',
  '.evoPReq .ok { color: #8fe07a; } .evoPReq .no { color: var(--redL); } .evoPReq .go { color: var(--goldM); }',
  '.evoPHint { margin-top: 6px; font-size: var(--fs-s); line-height: 18px; color: var(--muted); }',
  '@media (prefers-reduced-motion: reduce) { #weaponSlots .slot.evoReady::before, #levelModal.evoShow h2 { animation: none; } #weaponSlots .slot.evoReady::before { opacity: 1; } }'
].join('\n');

(function () {
  var st = document.createElement('style');
  st.id = 'evoCss';
  st.textContent = Evo.CSS;
  (document.head || document.documentElement).appendChild(st);
})();
