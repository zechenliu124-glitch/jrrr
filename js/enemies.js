'use strict';
// ============================================================
//  敌人：实例化绘制、追踪玩家、分离、接触伤害、远程/冲锋/滚动/自爆、
//  小 Boss 与关卡 Boss 的攻击（尖刺、红球、激光、砸地、冲锋、召唤）、刷怪导演
// ============================================================
var Enemies = {
  list: [], hash: new SpatialHash(3.5), meshes: {}, shots: [], hazards: [], nextId: 1,
  boss: null, MAX: 330, firstElite: true,
  // 其他文件注册的新行为和新招式（content.js）：BEHAVIORS[def.behavior](e, dt, nx, nz, d, spd, frozen) 返回 true 表示移动和碰撞自己处理；
  // ATTACKS[招式名] = { start(e, nx, nz, d), update(e, dt, nx, nz, d) }；def.look(e, L, dt) 改这一帧的姿态（L 见 render）
  BEHAVIORS: {}, ATTACKS: {}, LOOK: {}
};

Enemies.init = function (scene) {
  Enemies.scene = scene;
  var mat = Enemies.material();
  Enemies.ids = [];
  Enemies.counts = {};
  for (var id in ENEMIES) {
    var def = ENEMIES[id];
    def.id = id;
    def.geo = Enemies.buildGeo(def.parts);
    def.anim = Enemies.animDef(def);
    def.geo.computeBoundingBox();
    def.headTop = def.geo.boundingBox.max.y;
    Enemies.meshes[id] = Enemies.instanced(def.geo, def.boss ? 6 : def.miniboss ? 6 : (def.cap || Enemies.MAX), mat, scene);
    Enemies.ids.push(id);
    Enemies.counts[id] = 0;
  }
  // 精英怪和小 Boss 头顶的金冠（一个实例网格）
  var cm = MODEL.material().clone();
  cm.onBeforeCompile = MODEL.material().onBeforeCompile;
  if (cm.emissive) cm.emissive.setHex(0x7a5200);
  Enemies.crownMesh = MODEL.instanced(Enemies.buildGeo(CROWN_PARTS, true), 64, null);
  Enemies.crownMesh.material = cm;
  scene.add(Enemies.crownMesh);
  // 敌方子弹：亮芯 + 半透明红色光晕（共用同一组矩阵）
  Enemies.shotMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.26, 0), new THREE.MeshBasicMaterial({ color: 0xffd6e0 }), 300);
  Enemies.shotGlow = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1), new THREE.MeshBasicMaterial({ color: 0xff2a55, transparent: true, opacity: 0.55, depthWrite: false }), 300);
  [Enemies.shotMesh, Enemies.shotGlow].forEach(function (m) {
    m.instanceMatrix = Enemies.shotMesh.instanceMatrix;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.count = 0;
    m.frustumCulled = false;
    scene.add(m);
  });
};

// ---------------- 模型：按零件合并，顶点里记下关节支点与动画通道 ----------------
// 零件第 8 项是关节 {ch 通道, p 支点, s 幅度, parent 外层关节}，第 9 项是发光倍数（顶点色乘上去，雾里也亮）
// 贴图坐标自己算：原始 UV 里的 1.0 留在小格的右/上边缘（折回 0 的话方块整面只取到一个像素）
Enemies.buildGeo = function (parts, noJoints) {
  var _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bs = new THREE.Vector3(), _bp = new THREE.Vector3(), _bc = new THREE.Color();
  var pos = [], nor = [], col = [], uvs = [], ja = [], jb = [], T = TEX.TILE;
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var g = MODEL.geo(p[0], p[1]);
    if (g.index) { var g2 = g.toNonIndexed(); g.dispose(); g = g2; }
    var r = p[4] || [0, 0, 0], sc = p[5] || [1, 1, 1];
    _be.set(r[0], r[1], r[2]);
    _bq.setFromEuler(_be);
    _bm.compose(_bp.set(p[2][0], p[2][1], p[2][2]), _bq, _bs.set(sc[0], sc[1], sc[2]));
    g.applyMatrix4(_bm);
    var pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv ? g.attributes.uv.array : null;
    var tl = TEX.tileUV(p[6] || TEX.guess(p[3])), k = p[8] || 1;
    _bc.set(p[3]);
    var n = pa.length / 3;
    for (var v = 0; v < n; v++) {
      // 每个三角面颜色轻微抖动，显得更“手工”
      if (v % 3 === 0) var jit = (Math.random() - 0.5) * 0.05;
      pos.push(pa[v * 3], pa[v * 3 + 1], pa[v * 3 + 2]);
      nor.push(na[v * 3], na[v * 3 + 1], na[v * 3 + 2]);
      col.push(clamp(_bc.r + jit, 0, 1) * k, clamp(_bc.g + jit, 0, 1) * k, clamp(_bc.b + jit, 0, 1) * k);
      var uu = ua ? ua[v * 2] : 0.5, vv = ua ? ua[v * 2 + 1] : 0.5;
      if (uu > 1.001) uu -= Math.floor(uu);
      uvs.push(tl.u + T * (0.03 + clamp(uu, 0, 1) * 0.94), tl.v + T * (0.03 + clamp(vv, 0, 1) * 0.94));
    }
    if (!noJoints) {
      var j = p[7] || null, inner = j && j.parent ? j : null, outer = j ? (j.parent || j) : null;
      for (v = 0; v < n; v++) {
        if (outer) ja.push(outer.p[0], outer.p[1], outer.p[2], outer.ch + Math.min(1.98, outer.s) / 2); else ja.push(0, 0, 0, 0);
        if (inner) jb.push(inner.p[0], inner.p[1], inner.p[2], inner.ch + Math.min(1.98, inner.s) / 2); else jb.push(0, 0, 0, 0);
      }
    }
    g.dispose();
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  if (!noJoints) {
    out.setAttribute('aJa', new THREE.Float32BufferAttribute(ja, 4));
    out.setAttribute('aJb', new THREE.Float32BufferAttribute(jb, 4));
  }
  out.computeBoundingSphere();
  return out;
};

// 动画参数（零件列表上的 anim 属性），没写的按默认
Enemies.animDef = function (def) {
  var a = def.parts.anim || {};
  var hip = a.hip || 0.8;
  return {
    hip: hip,                                   // 髋高：迈步时身体下沉
    stride: a.stride || TAU / (hip * 1.8),      // 每走 1 米步态相位前进多少
    lean: a.lean == null ? 0.1 : a.lean,        // 跑动时前倾
    roll: a.roll == null ? 0.05 : a.roll,       // 左右摇晃
    bob: a.bob || 0,                            // 额外的上下颠
    hover: a.hover == null ? 0.15 : a.hover,    // 飞行怪上下浮动
    flap: a.flap || 6,                          // 翅膀/摆动的速度（弧度/秒）
    spin: a.spin || 0,                          // 自转
    rollR: a.rollR || 0.6                       // 滚动半径
  };
};

// 敌人共用材质：在共享材质的基础上，顶点着色器里按关节摆动四肢（每个实例一个相位）
Enemies.ANIM_GLSL = [
  'attribute vec4 aJa;',
  'attribute vec4 aJb;',
  'attribute vec3 aAnim;',
  // 通道：1/2 髋 3/4 膝 5/6 肩 7/8 肘 9 头 10/11 翅膀 12 尾巴 13 摇摆 14 扭腰 15/16 节肢
  'mat3 eRot(float code) {',
  '  float ch = floor(code), s = fract(code) * 2.0;',
  '  float p = aAnim.x, a = aAnim.y * s, t = aAnim.z, g = 0.0, ax = 0.0;',
  '  if (ch < 1.5) g = -sin(p) * 0.6 * a;',
  '  else if (ch < 2.5) g = sin(p) * 0.6 * a;',
  '  else if (ch < 3.5) g = max(0.0, cos(p)) * 1.1 * a;',
  '  else if (ch < 4.5) g = max(0.0, -cos(p)) * 1.1 * a;',
  '  else if (ch < 5.5) g = sin(p) * 0.55 * a;',
  '  else if (ch < 6.5) g = -sin(p) * 0.55 * a;',
  '  else if (ch < 7.5) g = -max(0.0, -sin(p)) * 0.7 * a;',
  '  else if (ch < 8.5) g = -max(0.0, sin(p)) * 0.7 * a;',
  '  else if (ch < 9.5) g = sin(p * 2.0) * 0.07 * a + sin(t * 0.37) * 0.05 * s;',
  '  else if (ch < 10.5) { g = sin(t) * 0.75 * s; ax = 1.0; }',
  '  else if (ch < 11.5) { g = -sin(t) * 0.75 * s; ax = 1.0; }',
  '  else if (ch < 12.5) g = sin(t * 0.5) * 0.2 * s;',
  '  else if (ch < 13.5) { g = sin(t * 0.5 + 1.3) * 0.14 * s; ax = 1.0; }',
  '  else if (ch < 14.5) { g = sin(p) * 0.22 * a; ax = 2.0; }',
  '  else if (ch < 15.5) { g = sin(p) * 0.45 * a; ax = 2.0; }',
  '  else { g = -sin(p) * 0.45 * a; ax = 2.0; }',
  '  float c = cos(g), n = sin(g);',
  '  if (ax < 0.5) return mat3(1.0, 0.0, 0.0, 0.0, c, n, 0.0, -n, c);',
  '  if (ax < 1.5) return mat3(c, n, 0.0, -n, c, 0.0, 0.0, 0.0, 1.0);',
  '  return mat3(c, 0.0, -n, 0.0, 1.0, 0.0, n, 0.0, c);',
  '}'
].join('\n');

Enemies.material = function () {
  if (Enemies.mat) return Enemies.mat;
  var base = MODEL.material();
  var m = base.clone();
  var prev = base.onBeforeCompile;
  m.onBeforeCompile = function (shader, renderer) {
    // 先做敌人自己的替换（保留原来的 include），再交给共享材质原有的处理
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', Enemies.ANIM_GLSL + '\nvoid main() {\n  mat3 eRb = aJb.w > 0.5 ? eRot(aJb.w) : mat3(1.0);\n  mat3 eRa = aJa.w > 0.5 ? eRot(aJa.w) : mat3(1.0);')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n  objectNormal = eRa * (eRb * objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  transformed = eRa * (eRb * (transformed - aJb.xyz) + aJb.xyz - aJa.xyz) + aJa.xyz;');
    if (prev) prev.call(this, shader, renderer);
  };
  Enemies.mat = m;
  return m;
};

// 实例网格：矩阵、颜色、动画相位都按实例存
Enemies.instanced = function (geo, cap, mat, scene) {
  var anim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  anim.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aAnim', anim);
  var im = new THREE.InstancedMesh(geo, mat, cap);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  // 颜色缓冲按当前 count 分配，所以要在把 count 设为 0 之前填好
  var white = new THREE.Color(1, 1, 1);
  for (var i = 0; i < cap; i++) im.setColorAt(i, white);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.count = 0;
  im.visible = false;
  scene.add(im);
  return im;
};

Enemies.clear = function () {
  Enemies.list.forEach(Enemies.dropLasers);
  Enemies.list = [];
  Enemies.shots = [];
  Enemies.hazards.forEach(function (h) { if (h.mesh) Enemies.scene.remove(h.mesh); });
  Enemies.hazards = [];
  Enemies.boss = null;
  for (var id in Enemies.meshes) { Enemies.meshes[id].count = 0; Enemies.meshes[id].visible = false; }
  Enemies.shotMesh.count = 0;
  Enemies.shotGlow.count = 0;
  if (Enemies.crownMesh) Enemies.crownMesh.count = 0;
};

Enemies.spawn = function (id, x, z, opts) {
  opts = opts || {};
  var def = ENEMIES[id];
  var scale = (def.scale || 1) * (opts.elite ? 1.5 : 1);
  var hpMult = (opts.hpMult || 1) * (opts.elite ? 8 : 1);
  var y = def.flyer ? W.groundAt(x, z, 999) + 2.5 : W.groundAt(x, z, 999);
  var e = {
    id: Enemies.nextId++, def: def, x: x, y: y + (opts.drop ? 10 : 0), z: z, vx: 0, vz: 0, vy: 0, kx: 0, kz: 0,
    hp: def.hp * hpMult, maxHp: def.hp * hpMult,
    speed: def.speed * (opts.speedMult || 1) * rand(0.92, 1.08),
    dmg: def.dmg * ENEMY_DMG * (opts.dmgMult || 1),
    r: def.radius * scale, scale: scale, elite: !!opts.elite, boss: !!def.boss, mini: !!def.miniboss,
    flash: 0, frozen: 0, dot: 0, dotT: 0, dotLeft: 0, touchCd: 0, phase: Math.random() * TAU, atk: rand(1, 3), state: 'chase', st: 0,
    alive: true, grounded: !opts.drop, marked: 0, poisoned: 0, poisonStacks: 0,
    wp: 0, wa: 0, rl: 0           // 只给动画用：步态相位、步幅、滚动角
  };
  e.wp = e.phase;
  if (def.behavior === 'roll') { var a = Math.atan2(P.pos.x - x, P.pos.z - z); e.dx = Math.sin(a); e.dz = Math.cos(a); }
  Enemies.list.push(e);
  if (e.boss) Enemies.boss = e;
  return e;
};

// ---------------- 伤害 ----------------
// crit: 0 普通 1 暴击 2 超大暴击
Enemies.damage = function (e, dmg, crit, kx, kz, opts) {
  if (!e.alive) return 0;
  if ((e.boss || e.mini) && e.state === 'intro') return 0;
  e.hp -= dmg;
  e.flash = 0.1;
  var kb = (e.boss ? 0.03 : e.mini ? 0.1 : e.elite ? 0.3 : 1);
  e.kx += (kx || 0) * kb; e.kz += (kz || 0) * kb;
  P.damageDealt += dmg;
  if (!(opts && opts.quiet)) {
    if (opts && opts.text) FX.text(e.x, e.y + e.r * 2 + 0.6, e.z, opts.text, '#ff3b3b', 1.4);
    else FX.damage(e.x, e.y + e.r * 1.6 + 0.6, e.z, dmg, crit || 0);
  }
  if (P.st.lifesteal > 0 && Math.random() < P.st.lifesteal) P.heal(1, true);
  if (e.hp <= 0) Enemies.kill(e);
  return dmg;
};

// 持续伤害（燃烧/中毒）
Enemies.applyDot = function (e, dps, dur) {
  e.dot = Math.max(e.dot, dps);
  e.dotLeft = Math.max(e.dotLeft || 0, dur);
  e.poisoned = Math.max(e.poisoned, dur);
  if (e.dotT <= 0) e.dotT = 0.5;
};

Enemies.kill = function (e) {
  e.alive = false;
  P.kills++;
  var def = e.def;
  Enemies.dropLasers(e);
  FX.burst(e.x, e.y + e.r, e.z, e.boss ? 40 : (e.elite || e.mini) ? 18 : 6, def.color || 0x9be35a, e.boss ? 12 : 6, e.boss ? 0.6 : 0.3);
  var xp = def.xp * (e.elite ? 10 : 1);
  if (xp > 0) Pickups.xp(e.x, e.y + 0.5, e.z, xp);
  if (P.items.echo && Math.random() < 1 - Math.pow(0.88, P.items.echo)) Pickups.xp(e.x + 0.5, e.y + 0.5, e.z, Math.max(1, xp));
  if (Math.random() < 0.3 || e.elite || e.mini) Pickups.gold(e.x, e.y + 0.5, e.z, Math.ceil(Game.stage * (e.elite ? 8 : e.mini ? 20 : 1) * P.st.goldGain));
  // 精英：第一个必掉宝箱，之后 25%
  if (e.elite && (Enemies.firstElite || Math.random() < 0.25)) { Enemies.firstElite = false; Interact.spawnChest(e.x, e.z, true); }
  if (e.mini) { Interact.spawnChest(e.x, e.z, true); Pickups.xp(e.x, e.y + 1, e.z, 40 * Game.stage); }
  if (!e.boss && !e.mini && Math.random() < 0.004 * P.st.powerupChance) Pickups.drop(Pickups.randomPowerup(), e.x, e.y + 0.5, e.z);
  if (P.items.borgar && Math.random() < 1 - Math.pow(0.98, P.items.borgar)) Pickups.drop('heal', e.x, e.y + 0.5, e.z);
  if (P.items.harvester) Weapons.spawnSouls(e.x, e.y, e.z, 2 * P.items.harvester);
  // 瘟疫（阿莫格）：中毒的敌人死亡时爆炸
  if (P.char && P.char.id === 'amog' && e.poisoned > 0) {
    FX.boom(e.x, e.y + 0.8, e.z, 2.5, 0x7dff4a);
    var pw = Weapons.find('poison');
    Enemies.inRadius(e.x, e.z, 3, function (o) { Enemies.applyDot(o, Math.max(3, (pw ? pw.s.damage : 3) * P.st.damage * 2), 3); });
  }
  Passive.onKill(e);
  if (e.boss) Game.onBossKilled(e);
};

Enemies.nearest = function (x, z, maxR, skip) {
  var best = null, bd = maxR * maxR;
  for (var i = 0; i < Enemies.list.length; i++) {
    var e = Enemies.list[i];
    if (!e.alive || (skip && skip.has(e.id))) continue;
    var d = dist2(x, z, e.x, e.z);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
};

Enemies.nearestN = function (x, z, maxR, n) {
  var arr = [], r2 = maxR * maxR;
  for (var i = 0; i < Enemies.list.length; i++) {
    var e = Enemies.list[i];
    if (!e.alive) continue;
    var d = dist2(x, z, e.x, e.z);
    if (d < r2) arr.push({ e: e, d: d });
  }
  arr.sort(function (a, b) { return a.d - b.d; });
  return arr.slice(0, n).map(function (a) { return a.e; });
};

Enemies.inRadius = function (x, z, r, fn) {
  Enemies.hash.query(x, z, r + 3, function (e) {
    if (!e.alive) return;
    if (dist2(x, z, e.x, e.z) <= (r + e.r) * (r + e.r)) return fn(e);
  });
};

Enemies.nova = function (x, z, r, dmg, knock, color) {
  FX.ring(x, P.pos.y, z, r, color || 0xfff1a8, 0.4);
  Enemies.inRadius(x, z, r, function (e) {
    var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
    if (dmg > 0) Enemies.damage(e, dmg, 0, dx / d * knock, dz / d * knock);
    else { e.kx += dx / d * knock; e.kz += dz / d * knock; }
  });
};

// ---------------- 更新 ----------------
Enemies.update = function (dt) {
  var list = Enemies.list, h = Enemies.hash;
  h.clear();
  for (var i = 0; i < list.length; i++) if (list[i].alive) h.insert(list[i], list[i].x, list[i].z);

  var px = P.pos.x, py = P.pos.y, pz = P.pos.z;
  var frozenNear = 0;
  for (i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e.alive) continue;
    var def = e.def;
    e.flash -= dt; e.touchCd -= dt; e.frozen -= dt; e.phase += dt; e.marked -= dt; e.poisoned -= dt;
    if (e.dot > 0) {
      e.dotT -= dt;
      if (e.dotT <= 0) {
        e.dotT = 0.5;
        Enemies.damage(e, e.dot * 0.5, 0, 0, 0, { quiet: Math.random() < 0.5 });
        e.dotLeft -= 0.5;
        if (e.dotLeft <= 0) e.dot = 0;
        if (!e.alive) continue;
      }
    }
    var dx = px - e.x, dz = pz - e.z;
    var d = Math.sqrt(dx * dx + dz * dz) || 0.001;
    var nx = dx / d, nz = dz / d;
    var frozen = e.frozen > 0 && !e.boss && !e.mini;
    if (frozen && d < 12) frozenNear++;
    var spd = frozen ? 0 : e.speed * Game.enemySpeedMult * (e.frozen > 0 ? 0.5 : 1);

    if (e.boss || e.mini) Enemies.bossAI(e, dt, nx, nz, d);
    else if (def.behavior && Enemies.BEHAVIORS[def.behavior]) { if (Enemies.BEHAVIORS[def.behavior](e, dt, nx, nz, d, spd, frozen)) continue; }
    else if (def.behavior === 'roll') {
      // 风滚骨：沿直线滚动，偶尔转向玩家
      e.st -= dt;
      if (e.st <= 0) { e.st = rand(1.5, 3); var a = Math.atan2(dx, dz) + rand(-0.6, 0.6); e.dx = Math.sin(a); e.dz = Math.cos(a); }
      e.vx = e.dx * spd; e.vz = e.dz * spd;
    } else if (def.behavior === 'shoot' && d < 28) {
      var want = def.slowMove ? 0.15 : (d < 12 ? -0.6 : d > 18 ? 1 : 0.15);
      e.vx = nx * spd * want; e.vz = nz * spd * want;
      e.atk -= dt;
      if (e.atk <= 0 && !frozen) { e.atk = def.shootCd || 2.5; Enemies.shoot(e, px, py + 1, pz, def.shotSpeed || 12, e.dmg * 0.8); }
    } else {
      e.vx = nx * spd; e.vz = nz * spd;
    }

    if (def.behavior === 'explode' && d < 2.2 && Math.abs(py - e.y) < 2.5 && !frozen) {
      FX.boom(e.x, e.y + 1, e.z, 3.5, 0xff7a2a);
      if (d < 3.5) P.hurt(e.dmg, null);
      e.alive = false;
      continue;
    }

    // 分离
    var sx = 0, sz = 0;
    if (!e.boss) {
      h.query(e.x, e.z, e.r * 2, function (o) {
        if (o === e || !o.alive) return;
        var ox = e.x - o.x, oz = e.z - o.z, od2 = ox * ox + oz * oz, rr = e.r + o.r;
        if (od2 < rr * rr && od2 > 0.0001) { var od = Math.sqrt(od2), push = (rr - od) / rr; sx += ox / od * push; sz += oz / od * push; }
      });
    }
    var kdec = Math.exp(-dt * 7);
    e.kx *= kdec; e.kz *= kdec;
    e.x += (e.vx + sx * 4 + e.kx) * dt;
    e.z += (e.vz + sz * 4 + e.kz) * dt;

    if (def.flyer) {
      var targetY = Math.max(W.groundAt(e.x, e.z, 999) + 1.2, py + 1 + Math.sin(e.phase * 2) * 0.5);
      if (!frozen) e.y = lerp(e.y, targetY, Math.min(1, dt * 2));
    } else {
      W.pushOut(e, e.r * 0.8, e.y);
      var g = W.groundAt(e.x, e.z, e.y);
      if (e.grounded) {
        if (e.y - g > 0.9) e.grounded = false;
        else e.y = g;
        if (def.hop && !frozen && Math.random() < dt * 1.5) { e.vy = 6; e.grounded = false; }
        // 玩家在高处时，靠近的敌人会跳上去
        if (py - e.y > 2 && d < 7 && Math.random() < dt * 0.8 && !e.boss && !frozen) {
          e.vy = Math.min(16, Math.sqrt(2 * 26 * (py - e.y + 1.5)));
          e.grounded = false;
          e.leapX = nx * 4; e.leapZ = nz * 4;
        }
      }
      if (!e.grounded) {
        e.vy -= 26 * dt;
        e.y += e.vy * dt;
        if (e.leapX) { e.x += e.leapX * dt; e.z += e.leapZ * dt; }
        g = W.groundAt(e.x, e.z, e.y - e.vy * dt);
        if (e.y <= g) { e.y = g; e.vy = 0; e.grounded = true; e.leapX = 0; e.leapZ = 0; }
      }
    }

    // 接触伤害
    var dy = py - e.y;
    if (e.touchCd <= 0 && !frozen && d < e.r + P.radius + 0.1 && dy > -1.6 && dy < e.r * 2 + 0.5) {
      P.hurt(e.dmg, e);
      if (def.poison) P.poison = Math.max(P.poison || 0, 3);
      e.touchCd = 0.8;
    }
    if (d > 95 && !e.boss && !e.mini) {
      var sp = Director.spawnPoint();
      e.x = sp.x; e.z = sp.z; e.y = sp.y;
    }
  }
  Passive.frozenNear = frozenNear;
  for (i = list.length - 1; i >= 0; i--) if (!list[i].alive) { list[i] = list[list.length - 1]; list.pop(); }

  Enemies.updateShots(dt);
  Enemies.updateHazards(dt);
  Enemies.render(dt);
};

// ---------------- Boss / 小 Boss ----------------
Enemies.bossAI = function (e, dt, nx, nz, d) {
  var def = e.def;
  e.st -= dt;
  var spd = e.speed * (e.frozen > 0 ? 0.6 : 1);
  switch (e.state) {
    case 'intro':
      e.vx = 0; e.vz = 0;
      if (e.st <= 0) { e.state = 'chase'; e.st = 1.5; }
      return;
    case 'chase':
      e.vx = nx * spd; e.vz = nz * spd;
      if (e.st <= 0) {
        var a = pick(e.attacks || def.attacks);
        e.state = a;
        e.st = { slam: 1.0, charge: 0.8, volley: 0.6, summon: 0.6, spikes: 0.3, orbs: 0.5, lasers: 0.8 }[a] || 0.6;
        if (a === 'slam') FX.ring(e.x, e.y, e.z, 9 * (e.boss ? 1 : 0.8), 0xff4040, 1.0);
        if (a === 'charge') { e.dx = nx; e.dz = nz; }
        if (a === 'lasers') { e.laserT = 0; e.laserA = Math.random() * TAU; }
        if (Enemies.ATTACKS[a]) Enemies.ATTACKS[a].start(e, nx, nz, d);
      }
      return;
    case 'slam':
      e.vx = 0; e.vz = 0;
      if (e.st <= 0) {
        var r = 9 * (e.boss ? 1 : 0.8);
        FX.boom(e.x, e.y + 1, e.z, r, 0xffa640);
        Game.shake(0.6);
        if (d < r && P.pos.y - e.y < 2.5) P.hurt(e.dmg * 1.5, null);
        e.state = 'chase'; e.st = rand(2.5, 4);
      }
      return;
    case 'charge':
      if (e.st > 0) { e.vx = 0; e.vz = 0; return; }
      e.vx = e.dx * spd * 4.5; e.vz = e.dz * spd * 4.5;
      if (e.st < -1.1) { e.state = 'chase'; e.st = rand(2, 3.5); }
      return;
    case 'volley':
      e.vx = 0; e.vz = 0;
      if (e.st <= 0) {
        for (var i = 0; i < 16; i++) { var a2 = i / 16 * TAU; Enemies.shoot(e, e.x + Math.cos(a2) * 10, e.y + 1.2, e.z + Math.sin(a2) * 10, 10, e.dmg * 0.6); }
        e.state = 'chase'; e.st = rand(2.5, 4);
      }
      return;
    case 'orbs':
      // 扇形发射一排慢速红球
      e.vx = 0; e.vz = 0;
      if (e.st <= 0) {
        var base = Math.atan2(nx, nz);
        for (var k = -4; k <= 4; k++) {
          var aa = base + k * 0.18;
          Enemies.shoot(e, e.x + Math.sin(aa) * 10, P.pos.y + 1, e.z + Math.cos(aa) * 10, 9, e.dmg * 0.6);
        }
        e.state = 'chase'; e.st = rand(2, 3.5);
      }
      return;
    case 'spikes':
      // 在通往玩家的一条线上标出红圈，稍后冒出尖刺
      e.vx = 0; e.vz = 0;
      if (e.st <= 0) {
        var bx = Math.atan2(nx, nz);
        for (var s = 1; s <= 8; s++) {
          var dd = s * 2.8;
          Enemies.addHazard('spike', e.x + Math.sin(bx) * dd, e.z + Math.cos(bx) * dd, 1.7, 0.9 + s * 0.06, e.dmg * 1.2);
        }
        e.state = 'chase'; e.st = rand(2.5, 3.5);
      }
      return;
    case 'lasers':
      // 旋转激光：跳起来可以躲过
      e.vx = 0; e.vz = 0;
      e.laserT += dt;
      if (e.st <= 0) {
        e.laserA += dt * 0.9;
        Enemies.drawLasers(e, true);
        if (e.laserT > 4.5) { Enemies.drawLasers(e, false); e.state = 'chase'; e.st = rand(2.5, 4); }
        else Enemies.laserHit(e);
      } else Enemies.drawLasers(e, true, true);
      return;
    case 'summon':
      e.vx = 0; e.vz = 0;
      if (e.st <= 0) {
        var types = Director.currentPool().types;
        for (var m = 0; m < 8; m++) Enemies.spawn(pick(types), e.x + rand(-6, 6), e.z + rand(-6, 6), { hpMult: Director.hpMult(), dmgMult: Director.dmgMult(), drop: true });
        e.state = 'chase'; e.st = rand(3, 4);
      }
      return;
    default:
      // 注册的新招式（content.js）；不认识的状态回到追击
      if (Enemies.ATTACKS[e.state]) Enemies.ATTACKS[e.state].update(e, dt, nx, nz, d);
      else { e.state = 'chase'; e.st = 1; }
      return;
  }
};

Enemies.drawLasers = function (e, on, warn) {
  if (!e.lasers) {
    e.lasers = [];
    // 四道激光共用一个几何体（所有 Boss 共用）和一个材质（这只 Boss 自己的，颜色和透明度跟着它的状态变；Boss 没了就释放）
    var geo = Enemies.laserGeo || (Enemies.laserGeo = new THREE.BoxGeometry(0.5, 0.5, 26).translate(0, 0, 13));
    var mat = new THREE.MeshBasicMaterial({ color: 0x5ad9ff, transparent: true, opacity: 0.85 });
    for (var i = 0; i < 4; i++) {
      var m = new THREE.Mesh(geo, mat);
      Enemies.scene.add(m);
      e.lasers.push(m);
    }
  }
  for (var j = 0; j < 4; j++) {
    var l = e.lasers[j];
    l.visible = on;
    if (!on) continue;
    l.position.set(e.x, e.y + 1.0, e.z);
    l.rotation.y = e.laserA + j * Math.PI / 2;
    l.material.opacity = warn ? 0.3 : 0.85;
    l.material.color.set(warn ? 0xff4040 : 0x5ad9ff);
    l.scale.set(warn ? 0.4 : 1, warn ? 0.4 : 1, 1);
  }
};

// Boss 死了或换关：拿掉激光，释放它自己的材质（几何体是共用的）
Enemies.dropLasers = function (e) {
  if (!e.lasers) return;
  e.lasers.forEach(function (l) { if (l.parent) l.parent.remove(l); });
  e.lasers[0].material.dispose();
  e.lasers = null;
};

Enemies.laserHit = function (e) {
  var dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.sqrt(dx * dx + dz * dz);
  if (d > 26 || P.pos.y - e.y > 1.3) return;
  var pa = Math.atan2(dx, dz);
  for (var j = 0; j < 4; j++) {
    var la = e.laserA + j * Math.PI / 2;
    var diff = Math.abs(((pa - la + Math.PI) % TAU + TAU) % TAU - Math.PI);
    if (Math.sin(diff) * d < 0.8 && Math.cos(diff) > 0) { P.hurt(e.dmg, null); return; }
  }
};

// 地面陷阱：红圈预警后生效
Enemies.addHazard = function (kind, x, z, r, delay, dmg) {
  var y = W.groundAt(x, z, P.pos.y + 5);
  var ring = FX.ring(x, y, z, r, 0xff3030, delay + 0.1);
  ring.s0 = r; ring.s1 = r;
  Enemies.hazards.push({ kind: kind, x: x, y: y, z: z, r: r, t: delay, dmg: dmg, life: 1.2 });
};

Enemies.updateHazards = function (dt) {
  var hz = Enemies.hazards;
  for (var i = hz.length - 1; i >= 0; i--) {
    var h = hz[i];
    h.t -= dt;
    if (h.t <= 0 && !h.fired) {
      h.fired = true;
      h.mesh = new THREE.Mesh(ZONE_MODELS.spike, MODEL.material());
      h.mesh.position.set(h.x, h.y - 0.5, h.z);
      h.mesh.rotation.y = Math.random() * TAU;
      Enemies.scene.add(h.mesh);
      FX.burst(h.x, h.y + 0.5, h.z, 6, 0x6a4a2a, 5, 0.3);
      if (dist2(P.pos.x, P.pos.z, h.x, h.z) < h.r * h.r && P.pos.y - h.y < 3) P.hurt(h.dmg, null);
    }
    if (h.fired) {
      h.life -= dt;
      if (h.mesh) h.mesh.position.y = h.y - 0.5 + Math.min(0.5, (1.2 - h.life) * 4) - Math.max(0, 0.3 - h.life) * 8;
      if (h.life <= 0) { if (h.mesh) Enemies.scene.remove(h.mesh); hz.splice(i, 1); }
    }
  }
};

// ---------------- 敌方子弹 ----------------
Enemies.shoot = function (e, tx, ty, tz, speed, dmg) {
  var sy = e.y + e.r * 1.4;
  var dx = tx - e.x, dy = ty - sy, dz = tz - e.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
  if (Enemies.shots.length > 290) Enemies.shots.shift();
  Enemies.shots.push({ x: e.x, y: sy, z: e.z, vx: dx / d * speed, vy: dy / d * speed, vz: dz / d * speed, dmg: dmg, life: 6 });
};

Enemies.updateShots = function (dt) {
  var s = Enemies.shots;
  for (var i = s.length - 1; i >= 0; i--) {
    var b = s[i];
    b.life -= dt;
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
    if (b.life <= 0 || b.y < W.terrainH(b.x, b.z) - 0.5) { s.splice(i, 1); continue; }
    var dx = b.x - P.pos.x, dy = b.y - (P.pos.y + 0.9), dz = b.z - P.pos.z;
    if (dx * dx + dy * dy + dz * dz < 1.1) { P.hurt(b.dmg, null); s.splice(i, 1); }
  }
};

// ---------------- 绘制 ----------------
// 平滑动画：四肢的摆动交给着色器（每个实例只传相位和幅度），这里只算整体的朝向、起伏和挤压
var _em = null, _eq = null, _es = null, _ep = null, _ec = null, _ee = null;
Enemies.render = function (dt) {
  if (!_em) { _em = new THREE.Matrix4(); _eq = new THREE.Quaternion(); _es = new THREE.Vector3(); _ep = new THREE.Vector3(); _ec = new THREE.Color(); _ee = new THREE.Euler(); }
  dt = dt || 0;
  var counts = Enemies.counts, ids = Enemies.ids, meshes = Enemies.meshes;
  for (var k = 0; k < ids.length; k++) counts[ids[k]] = 0;
  var crown = Enemies.crownMesh, nc = 0, ccap = crown.instanceMatrix.count;
  var list = Enemies.list, px = P.pos.x, pz = P.pos.z;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (!e.alive) continue;
    var def = e.def, an = def.anim;
    var mesh = meshes[def.id];
    var n = counts[def.id];
    if (n >= mesh.instanceMatrix.count) continue;
    // 步态：相位跟着实际移动的距离走，停下时幅度慢慢归零；冻住时定格
    var spd = Math.sqrt(e.vx * e.vx + e.vz * e.vz);
    if (!(e.frozen > 0)) {
      e.wa += ((spd > 0.4 ? 1 : 0) - e.wa) * Math.min(1, dt * 7);
      e.wp += spd * an.stride / e.scale * dt;
    }
    var a = e.wa, p = e.wp, sw = Math.sin(p);
    var face = Math.atan2(px - e.x, pz - e.z);
    var bob = 0, pitch = 0, roll = 0, sx = 1, sy = 1;
    if (def.flyer) {
      bob = Math.sin(e.phase * 2.2) * an.hover;
      pitch = 0.14 * a;
      roll = Math.sin(e.phase * 1.3) * 0.07;
    } else {
      // 迈步时腿张开，身体跟着下沉一点；再加一点颠簸
      bob = (-an.hip * (1 - Math.cos(0.55 * a * sw)) + Math.abs(Math.cos(p)) * an.bob * a) * e.scale;
      pitch = an.lean * a;
      roll = sw * an.roll * a;
    }
    if (an.spin) face += e.phase * an.spin;
    if (def.behavior === 'roll') {
      face = Math.atan2(e.dx || 0, e.dz || 1);
      if (!(e.frozen > 0)) e.rl += spd * dt / (an.rollR * e.scale);
      pitch = e.rl; roll = 0; bob = an.rollR * e.scale;   // 模型以球心为原点
    }
    if (def.hop) {
      // 史莱姆：起跳拉长、落地压扁、平时果冻一样抖
      sy = e.grounded ? 1 + Math.sin(e.phase * 9) * 0.06 : 1 + clamp(e.vy * 0.035, -0.18, 0.22);
      sx = 1 / Math.sqrt(sy);
    }
    if (def.look) {
      // 新敌人的特殊姿态（钻地、俯冲、擂鼓…）：def.look 改 L 里的朝向 / 起伏 / 俯仰 / 翻滚 / 缩放 / 步态，hide 为真时这一帧不画
      var L = Enemies.LOOK;
      L.face = face; L.bob = bob; L.pitch = pitch; L.roll = roll; L.sx = sx; L.sy = sy; L.p = p; L.a = a; L.hide = false;
      def.look(e, L, dt);
      if (L.hide) continue;
      face = L.face; bob = L.bob; pitch = L.pitch; roll = L.roll; sx = L.sx; sy = L.sy; p = L.p; a = L.a;
    }
    if (e.flash > 0) { sx *= 1.12; sy /= 1.12; }
    _ee.set(pitch, face, roll, 'YXZ');
    _eq.setFromEuler(_ee);
    _es.set(e.scale * sx, e.scale * sy, e.scale * sx);
    _ep.set(e.x, e.y + bob, e.z);
    _em.compose(_ep, _eq, _es);
    mesh.setMatrixAt(n, _em);
    var aa = mesh.geometry.attributes.aAnim.array;
    aa[n * 3] = p; aa[n * 3 + 1] = a; aa[n * 3 + 2] = e.phase * an.flap;
    if (e.flash > 0) _ec.setRGB(3, 3, 3);
    else if (e.frozen > 0 && e.evoStun > 0) _ec.setRGB(2.2, 1.5, 0.35);   // 超武眩晕：暖金色（冰冻是青色）
    else if (e.frozen > 0) _ec.setRGB(0.6, 1.0, 1.8);
    else if (e.marked > 0) _ec.setRGB(1.8, 0.5, 0.5);
    else if (e.elite) _ec.setRGB(1.06, 1.0, 1.1);
    else if (e.dot > 0) _ec.setRGB(0.8, 1.4, 0.6);
    else _ec.setRGB(1, 1, 1);
    if (e.tint && !(e.flash > 0)) _ec.multiply(e.tint);   // Boss 第二阶段等整体染色（content.js）
    mesh.setColorAt(n, _ec);
    counts[def.id] = n + 1;
    // 金冠：飘在头顶，慢慢转、上下浮
    if ((e.elite || e.mini) && nc < ccap) {
      var cs = Math.max(1.25, e.r * 0.9);
      _ee.set(0, e.phase * 1.4, 0.12 * Math.sin(e.phase * 2.1), 'YXZ');
      _eq.setFromEuler(_ee);
      _es.set(cs, cs, cs);
      _ep.set(e.x, e.y + bob + def.headTop * e.scale * sy + 0.4 + Math.sin(e.phase * 3) * 0.07, e.z);
      _em.compose(_ep, _eq, _es);
      crown.setMatrixAt(nc++, _em);
    }
  }
  for (k = 0; k < ids.length; k++) {
    var m = meshes[ids[k]], c = counts[ids[k]];
    m.count = c;
    m.visible = c > 0;
    if (c === 0) continue;
    // 只上传用到的部分
    m.instanceMatrix.updateRange.count = c * 16; m.instanceMatrix.needsUpdate = true;
    m.instanceColor.updateRange.count = c * 3; m.instanceColor.needsUpdate = true;
    var at = m.geometry.attributes.aAnim; at.updateRange.count = c * 3; at.needsUpdate = true;
  }
  crown.count = nc;
  crown.visible = nc > 0;
  if (nc) { crown.instanceMatrix.updateRange.count = nc * 16; crown.instanceMatrix.needsUpdate = true; }
  var s = Enemies.shots, pulse = 1 + Math.sin(Game.realTime * 14) * 0.12;
  for (i = 0; i < s.length; i++) {
    _ep.set(s[i].x, s[i].y, s[i].z);
    _es.set(pulse, pulse, pulse);
    _eq.identity();
    _em.compose(_ep, _eq, _es);
    Enemies.shotMesh.setMatrixAt(i, _em);
  }
  Enemies.shotMesh.count = Enemies.shotGlow.count = s.length;
  if (s.length) { Enemies.shotMesh.instanceMatrix.updateRange.count = s.length * 16; Enemies.shotMesh.instanceMatrix.needsUpdate = true; }
};

// ============================================================
//  刷怪导演：按关卡进度 p（0~1，关卡时长见 pace.js，默认 15 分钟）驱动
//  最少存活 + 稳定细流；每 80~100 秒一波敌潮（×1.8）接 10 秒喘息（×0.6）；
//  玩家清场太快时细流慢慢加快（最多 ×1.5），残血时悄悄少刷一会儿；
//  p≈0.3 / 0.55 / 0.8 刷小 Boss；时间到进入最终虫潮
// ============================================================
var Director = { acc: 0, eliteT: 0, STAGE_TIME: 900, NEAR: 60, lenK: 1 };

Director.reset = function () {
  var T = Director.STAGE_TIME = typeof Pace !== 'undefined' ? Pace.stageTime() : 900;
  // 关卡越短，捡宝箱、充神龛的时间越少，同样进度时玩家更弱：敌人强度按开局之后的时长缩放（15 分钟 = 1）
  Director.lenK = (T - Director.OPEN) / (900 - Director.OPEN);
  Director.acc = 0; Director.swarm = false; Director.swarmT = 0; Director.minisDone = 0;
  Director.eliteT = clamp(T / 12, 60, 90);
  // 节奏：开局之后第一波敌潮
  Director.surgeAt = Director.OPEN + 10 + rand(0, 15);
  Director.surgeT = 0; Director.surgeLen = 0; Director.lullT = 0;
  // 自适应
  Director.adapt = 1; Director.clearT = 0; Director.lowT = 0; Director.breathT = 0; Director.breathCd = 0;
  Director.near = 0; Director.minNow = 0; Director.rateNow = 0;
};

Director.remaining = function () { return Director.STAGE_TIME - Game.time; };
// 关卡进度 p：开局 90 秒固定占前 10%（任何时长都一样温和），之后按剩余时间匀速推进
Director.OPEN = 90;
Director.progress = function () {
  var T = Director.STAGE_TIME, t = Game.time, o = Math.min(Director.OPEN, T * 0.15);
  return clamp(t < o ? 0.1 * t / o : 0.1 + 0.9 * (t - o) / (T - o), 0, 1);
};

// 关卡内连续成长：血量按 e^(hpGrow·p)；关卡倍率与成长速度见 data_stages.js
Director.hpGrow = function (p) { return Math.exp((Game.stageDef.hpGrow || 2) * p); };
Director.hpMult = function (p) {
  if (p == null) p = Director.progress();
  return Director.hpGrow(p) * Game.stageDef.hpMult * Director.lenK * (1 + P.st.difficulty);
};
Director.dmgMult = function (p) {
  if (p == null) p = Director.progress();
  return (1 + 0.5 * p) * Game.stageDef.dmgMult * Math.sqrt(Director.lenK) * (1 + P.st.difficulty * 0.5);
};

Director.spawnPoint = function () {
  for (var k = 0; k < 20; k++) {
    var a = Math.random() * TAU, r = rand(26, 42);
    var x = P.pos.x + Math.cos(a) * r, z = P.pos.z + Math.sin(a) * r;
    if (Math.abs(x) > W.S - 10 || Math.abs(z) > W.S - 10) continue;
    return { x: x, z: z, y: W.groundAt(x, z, 999) };
  }
  return { x: P.pos.x + 30, z: P.pos.z, y: W.terrainH(P.pos.x + 30, P.pos.z) };
};

// 当前阶段（带 types 的最后一个 p <= 进度的阶段）
Director.currentPool = function () {
  var pool = Game.stageDef.pool, p = Director.progress(), cur = pool[0];
  for (var i = 0; i < pool.length; i++) if (pool[i].types && p >= pool[i].p) cur = pool[i];
  return cur;
};

// 按权重挑一种怪
Director.pickType = function (ph) {
  ph = ph || Director.currentPool();
  var w = ph.w, tot = 0, i;
  if (!w) return pick(ph.types);
  for (i = 0; i < w.length; i++) tot += w[i];
  var r = Math.random() * tot;
  for (i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return ph.types[i]; }
  return ph.types[ph.types.length - 1];
};

// 阶段之间线性插值的最少存活数与细流速度
Director.curve = function (p) {
  var pool = Game.stageDef.pool, a = pool[0], b = null;
  for (var i = 0; i < pool.length; i++) {
    if (pool[i].p <= p) a = pool[i];
    else { b = pool[i]; break; }
  }
  if (!b) return { min: a.min, rate: a.rate };
  var t = (p - a.p) / Math.max(0.0001, b.p - a.p);
  return { min: lerp(a.min, b.min, t), rate: lerp(a.rate, b.rate, t) };
};

// 敌潮 / 喘息：返回刷怪倍率
Director.rhythm = function (dt) {
  var t = Game.time;
  if (Director.surgeT > 0) {
    Director.surgeT -= dt;
    if (Director.surgeT <= 0) Director.lullT = 10;
    var e = Director.surgeLen - Director.surgeT;
    return 1 + 0.8 * clamp(Math.min(e, Director.surgeT) / 3, 0, 1);
  }
  if (Director.lullT > 0) { Director.lullT -= dt; return 0.6; }
  if (t >= Director.surgeAt && !Game.bossAlive) {
    Director.surgeLen = Director.surgeT = rand(15, 20);
    Director.surgeAt = t + rand(80, 100);
    UI.toast('敌潮涌来！', Kit.color('org'));
  }
  return 1;
};

Director.update = function (dt) {
  var p = Director.progress(), T = Director.STAGE_TIME;
  var diff = P.st.difficulty;
  var minis = Game.stageDef.minis;
  // 小 Boss：p ≈ 0.3 / 0.55 / 0.8（第三只轮回第一只）
  var at = [0.3, 0.55, 0.8];
  if (Director.minisDone < 3 && p >= at[Director.minisDone]) {
    Director.spawnMini(minis[Director.minisDone % minis.length]);
    Director.minisDone++;
  }

  if (Director.swarm) {
    // 最终虫潮：无尽的幽灵，越来越强（血量以关卡末尾的强度为基准）
    Director.swarmT += dt;
    Director.acc += 8 * dt;
    var hpm = Director.hpMult(1) / 3 * Math.pow(1.8, Director.swarmT / 60);
    while (Director.acc >= 1) {
      Director.acc -= 1;
      if (Enemies.list.length >= 400) { Director.acc = 0; break; }
      var sp0 = Director.spawnPoint();
      Enemies.spawn('swarmghost', sp0.x, sp0.z, { hpMult: hpm, dmgMult: Game.stageDef.dmgMult * Math.pow(1.25, Director.swarmT / 60), speedMult: Director.swarmT > 1200 ? 1.5 : 1 });
    }
    return;
  }

  // 玩家附近的敌人数
  var near = 0, list = Enemies.list, R2 = Director.NEAR * Director.NEAR, px = P.pos.x, pz = P.pos.z;
  for (var i = 0; i < list.length; i++) {
    var e = list[i];
    if (e.alive && !e.boss && !e.mini) { var dx = e.x - px, dz = e.z - pz; if (dx * dx + dz * dz < R2) near++; }
  }
  Director.near = near;

  var c = Director.curve(p);
  var rhythm = Director.rhythm(dt);
  // 残血：低于 30% 超过 5 秒 → 8 秒内少刷（每 60 秒最多一次）
  Director.breathCd -= dt;
  if (P.hp < P.st.maxHp * 0.3) Director.lowT += dt; else Director.lowT = 0;
  if (Director.lowT > 5 && Director.breathCd <= 0) { Director.breathT = 8; Director.breathCd = 60; }
  var breath = 1;
  if (Director.breathT > 0) { Director.breathT -= dt; breath = 0.75; }
  var dm = 1 + diff * 0.6;
  // Boss 战期间小怪少一些，让玩家专心打 Boss（Boss 自己会叫小 Boss 帮忙）
  if (Game.bossAlive) dm *= 0.6;
  var minT = c.min * rhythm * breath * dm;
  // 场面一直清空：细流慢慢加快（最多 ×1.5），场面满了再慢慢降回来
  if (near < minT * 0.7) Director.clearT = Math.min(60, Director.clearT + dt);
  else Director.clearT = Math.max(0, Director.clearT - dt * 2);
  var adaptT = 1 + 0.5 * clamp((Director.clearT - 8) / 30, 0, 1);
  Director.adapt += (adaptT - Director.adapt) * Math.min(1, dt * 0.3);
  var rate = c.rate * rhythm * breath * Director.adapt * dm;
  // 低于最少值：快速补足（每秒最多补 1.5 + 4% 的最少值）
  var deficit = minT - near;
  if (deficit > 0) rate += Math.min(deficit * 0.6, 1.5 + minT * 0.04);
  Director.minNow = minT; Director.rateNow = rate;
  var cap = Math.min(Enemies.MAX, Math.round(minT * 2 + 30));
  Director.acc += rate * dt;
  var ph = Director.currentPool();
  var hpm = Director.hpMult(p), dmm = Director.dmgMult(p);
  while (Director.acc >= 1) {
    if (list.length >= cap) { Director.acc = 0; break; }
    var sp = Director.spawnPoint();
    var id = Director.pickType(ph);
    var group = Math.random() < 0.15 ? Math.min(randi(3, 5), Math.floor(Director.acc)) : 1;
    for (var g = 0; g < group; g++) Enemies.spawn(id, sp.x + rand(-2, 2), sp.z + rand(-2, 2), { hpMult: hpm, dmgMult: dmm });
    Director.acc -= group;
  }
  // 精英：约每 T/16 一只，后期缩短到 T/40（最短 20 秒，10 分钟的关卡不会太密）
  Director.eliteT -= dt * P.st.eliteSpawn;
  if (Director.eliteT <= 0) {
    Director.eliteT = Math.max(20, lerp(T / 16, T / 40, p));
    var ep = Director.spawnPoint();
    Enemies.spawn(Director.pickType(ph), ep.x, ep.z, { elite: true, hpMult: hpm, dmgMult: dmm * 1.3 });
    UI.toast('精英怪出现了！', Kit.color('org'));
  }
};

// 小 Boss 血量：和关卡 Boss 一样按关卡系数缩放（后期范围伤害很高，单体目标不能跟着小怪一起涨）
Director.miniHpMult = function () { return Director.hpMult() * 3.3 * (Game.stageDef.bossHp || 0.45); };

Director.spawnMini = function (id) {
  var sp = Director.spawnPoint();
  var e = Enemies.spawn(id, sp.x, sp.z, { hpMult: Director.miniHpMult(), dmgMult: Director.dmgMult(), drop: true });
  e.state = 'intro'; e.st = 1;
  UI.toast(ENEMIES[id].name + ' 出现了！', Kit.color('org'));
};

Director.startSwarm = function () {
  if (Director.swarm) return;
  Director.swarm = true;
  Director.swarmT = 0;
  UI.toast('最终虫潮来袭！', Kit.color('red'));
};
