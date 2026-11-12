'use strict';
// ============================================================
//  内容扩展（第二批）：
//  - 新敌人的行为（Enemies.BEHAVIORS）：狼群包抄、孢子云、擂鼓强化、钻地、俯冲、盾牌、召唤墓碑、分裂、冲锋
//  - Boss / 小 Boss 的新招式（Enemies.ATTACKS）和关卡 Boss 的第二阶段（血量 50%）
//  - 共用的地面预警 / 延迟打击 / 抛射物 / 冲击波 / 地面区域（孢子云、荆棘、毒水、流沙）
//  - 局内公告（和 FEEL 同一个 Kit.announce）、小地图标记、给成就和音效系统用的回调（Content.on…，见文件末尾说明）
//  地图上的秘密、地形地标和随机事件在 content_map.js
//  所有逻辑都在 Game.update 里按 dt 走（测试快进不画画面也一样），画面只是把状态写进实例网格
// ============================================================
var Content = {
  hooks: {},
  time: 0,
  // 敌人
  packs: [], under: [], pending: [], buffed: [], bigs: [],
  // 攻击和地面效果
  strikes: [], lobs: [], waves: [], zones: [], marks: [], rings: [], beams: [],
  // 玩家身上的减速（孢子云、荆棘、毒水、流沙）
  slowT: 0, slowK: 1, slowName: '',
  hinted: {},
  // 贴地圆盘上限；LINE_RESERVE：虚线（狼群、无头骑士的冲锋线）最多用到 上限 - 这么多，后面画的 Boss 预警圈一定画得出来
  DECAL_CAP: 320, LINE_RESERVE: 80, decalN: 0, linkN: 0
};

// ---------------- 回调（成就、音效、统计以后接在这里） ----------------
Content.on = function (name, fn) { (Content.hooks[name] || (Content.hooks[name] = [])).push(fn); return fn; };
Content.off = function (name, fn) { var l = Content.hooks[name], i = l ? l.indexOf(fn) : -1; if (i >= 0) l.splice(i, 1); };
Content.emit = function (name, a, b, c, d, e) {
  var l = Content.hooks[name];
  if (!l) return;
  for (var i = 0; i < l.length; i++) {
    try { l[i](a, b, c, d, e); } catch (err) { console.error('Content.' + name + ' 回调出错：', err); }
  }
};
// 发现秘密地点：fn({ id, name, stage, x, z })
Content.onSecretFound = function (fn) { return Content.on('secret', fn); };
// 随机事件：fn({ type, name, phase: 'start' | 'end', result, stage, x, z })
Content.onEvent = function (fn) { return Content.on('event', fn); };
// Boss 换阶段：fn(boss, phase)
Content.onBossPhase = function (fn) { return Content.on('bossPhase', fn); };
// 敌人和 Boss 的特殊动作（给音效用）：fn(key, x, y, z, enemy)
Content.onSpecial = function (fn) { return Content.on('special', fn); };
Content.sfx = function (key, x, y, z, e) { if (Content.hooks.special) Content.emit('special', key, x, y, z, e || null); };

// ---------------- 小工具 ----------------
Content.angDiff = function (a, b) { return ((a - b + Math.PI) % TAU + TAU) % TAU - Math.PI; };
Content.ss = function (a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// 朝目标点走（近了慢下来）；返回距离
Content.steer = function (e, tx, tz, s) {
  var dx = tx - e.x, dz = tz - e.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001, k = Math.min(1, d / 2.5);
  e.vx = dx / d * s * k; e.vz = dz / d * s * k;
  return d;
};
// 自己处理移动的敌人用的接触伤害（和 enemies.js 的规则一样）
Content.touch = function (e, d, k) {
  var dy = P.pos.y - e.y;
  if (e.touchCd <= 0 && !(e.frozen > 0) && d < e.r + P.radius + 0.1 && dy > -1.6 && dy < e.r * 2 + 0.5) { P.hurt(e.dmg * (k || 1), e); e.touchCd = 0.8; }
};
// 玩家是否贴着地面（跳起来能躲的招式用）
Content.playerLow = function (h) { return P.pos.y - W.groundAt(P.pos.x, P.pos.z, P.pos.y) < (h || 0.9); };
// 一局只提示一次。颜色按用途（UI_STYLE §2.4）：怎么躲招式 = 系统提示的浅青色；地形、秘密地点（坡道、跳台、垫脚石、裂墙）= 机会的浅金色。
// 调用的地方传的颜色不再用（以前每条提示一种颜色）
Content.HINT_GOLD = { crack: 1, pad: 1, stones: 1 };
Content.hint = function (key, text, color) {
  if (Content.hinted[key]) return;
  Content.hinted[key] = true;
  var gold = Content.HINT_GOLD[key] || String(key).indexOf('feat_') === 0;
  UI.toast(text, typeof Kit !== 'undefined' ? Kit.color(gold ? 'goldL' : 'cyaL') : (color || '#cfe8ff'));
};
Content.near = function (x, z, r) { return dist2(x, z, P.pos.x, P.pos.z) < r * r; };
// 场上活着的某种敌人有几只（不依赖渲染时才更新的 Enemies.counts）
Content.countOf = function (def) {
  var c = 0, L = Enemies.list;
  for (var i = 0; i < L.length; i++) if (L[i].def === def && L[i].alive) c++;
  return c;
};
Content._sl = [0, 0];
Content._m = new THREE.Matrix4(); Content._q = new THREE.Quaternion(); Content._e = new THREE.Euler(); Content._v = new THREE.Vector3(); Content._s = new THREE.Vector3(); Content._v2 = new THREE.Vector3();
Content._z = new THREE.Vector3(0, 0, 1);
Content.C = { green: new THREE.Color(0x6dff9a), orange: new THREE.Color(0xff9a3a), gold: new THREE.Color(0xffd27a), purple: new THREE.Color(0xc070ff), red: new THREE.Color(0xff4a3a), teal: new THREE.Color(0x6dffd0), white: new THREE.Color(0xffffff) };

// ============================================================
//  画面：贴地圆盘（预警、裂缝、区域）、连线、升起的尖刺、抛射物、冲击波光墙、扫射光束
//  都是一直留着的实例网格 / 少量网格（换关只清零，不新建不释放）；每帧在逻辑里写入，FX.updateEffects 前统一提交
// ============================================================
Content.gfxInit = function () {
  if (Content.gfxDone || !Game.scene || !FX.decalMat) return;
  Content.gfxDone = true;
  // 贴地圆盘：和 FX 的毒云 / 焦痕同一个材质，自己一个实例网格（不和武器抢上限）
  Content.decalMesh = FX.instanced(FX.decalGeo(), FX.decalMat, Content.DECAL_CAP, Game.scene);
  Content.decalMesh.renderOrder = 1;
  // 鼓手的连线：细长的发光方条（是敌人身上的增益，不是玩家自己的光环：淡一点）
  var lg = new THREE.BoxGeometry(0.08, 0.08, 1).translate(0, 0, 0.5);
  Content.linkMesh = FX.instanced(lg, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }), 48, Game.scene);
  Content.linkMesh.renderOrder = 5;
  // 升起的尖刺、抛射物：低多边形 + 像素贴图
  var mk = function (parts, cap) { var m = MODEL.instanced(MODEL.build(parts), cap, Game.scene); m.visible = false; return m; };
  Content.inst = {
    root: mk([['cone', [0.55, 2.6, 5], [0, 1.3, 0], 0x6a4a2a, null, null, 'bark'], ['cone', [0.3, 1.4, 4], [0.35, 0.7, 0.1], 0x5a3a1a, [0, 0, -0.3], null, 'bark'],
      ['cone', [0.25, 1.1, 4], [-0.3, 0.55, -0.15], 0x7a5a32, [0.2, 0, 0.35], null, 'bark'], ['dodec', [0.24], [0.2, 1.45, 0.18], 0x4a8a2c, null, [1, 0.6, 1], 'leaf']], 80),
    sand: mk([['cone', [0.5, 2.2, 5], [0, 1.1, 0], 0xd9b46a, null, null, 'sand'], ['cone', [0.3, 1.2, 4], [0.32, 0.6, 0], 0xc29a52, [0, 0, -0.35], null, 'sand'],
      ['cone', [0.28, 1.0, 4], [-0.28, 0.5, 0.1], 0xe0c080, [0.2, 0, 0.35], null, 'sand']], 60),
    // 百年沉钟「骨雨」天上掉的东西：一块弯的碎钟片（带铜绿边）+ 一片陶瓦，一共约 2 米高（零件在 models_bosses.js）
    bone: mk(typeof Bosses !== 'undefined' && Bosses.SHARD ? Bosses.SHARD : [['box', [0.5, 1.45, 0.09], [0, 0.72, 0], 0x8a5a2a, null, null, 'metal'], ['box', [0.46, 0.06, 0.8], [0.08, 1.72, 0.08], 0xa85a3a, [1.05, 0.25, 0.3], null, 'brick']], 40),
    hand: mk([['box', [0.16, 1.0, 0.16], [0, 0.5, 0], 0xd8ccb0, null, null, 'bone'], ['box', [0.34, 0.24, 0.14], [0, 1.1, 0], 0xd8ccb0, null, null, 'bone'],
      ['cone', [0.04, 0.34, 3], [-0.12, 1.36, 0.02], 0xd8ccb0, [0.25, 0, 0.15], null, 'bone'], ['cone', [0.04, 0.38, 3], [-0.04, 1.4, 0.02], 0xd8ccb0, [0.25, 0, 0.05], null, 'bone'],
      ['cone', [0.04, 0.38, 3], [0.04, 1.4, 0.02], 0xd8ccb0, [0.25, 0, -0.05], null, 'bone'], ['cone', [0.04, 0.34, 3], [0.12, 1.36, 0.02], 0xd8ccb0, [0.25, 0, -0.15], null, 'bone'],
      ['box', [0.2, 0.08, 0.2], [0, 0.04, 0], 0x6a4a8a, null, null, 'plain']], 48),
    seed: mk([['dodec', [0.42], [0, 0, 0], 0x6a8a2a, null, [1, 1.3, 1], 'leaf'], ['cone', [0.12, 0.32, 4], [0, 0.62, 0], 0x4a3a1a, null, null, 'bark'],
      ['cone', [0.1, 0.25, 3], [0.25, -0.3, 0], 0x8a6a2a, [0, 0, 2.4], null, 'bark']], 24),
    rock: mk([['dodec', [0.62], [0, 0, 0], 0x8a8780, null, [1.1, 0.9, 1], 'en_rock'], ['dodec', [0.3], [0.35, 0.25, 0.1], 0x4a7a2a, null, [1.2, 0.4, 1], 'leaf']], 16),
    acid: mk([['ball', [0.34, 1], [0, 0, 0], 0x9aff5a, null, null, 'slime'], ['ball', [0.16, 0], [0.18, 0.2, 0.1], 0xd8ffb0, null, null, 'plain']], 24),
    meteor: mk([['dodec', [0.6], [0, 0, 0], 0x4a3226, null, null, 'en_rock'], ['dodec', [0.4], [0.18, 0.14, 0.16], 0xff8a2a, null, null, 'plain'], ['dodec', [0.3], [-0.2, -0.1, 0.12], 0xffc04a, null, null, 'plain']], 24)
  };
  Content.instN = {};
  for (var k in Content.inst) Content.instN[k] = 0;
  // 冲击波光墙：每帧贴着地形重算一圈顶点（先建 4 道，不够用时再加，最多 WAVE_MAX 道）
  Content.wavePool = [];
  for (var i = 0; i < 4; i++) Content.makeWave();
  // 扫射光束（现在没有首领用）：一道长方条，警告时细而暗，开火时粗而亮（先建 2 道，不够用时再加）
  Content.beamPool = [];
  for (i = 0; i < 2; i++) Content.makeBeam();
};
// 池子满了就再建一个（一次来两只关卡首领、首领战里叫来好几只小 Boss 时）；建好的一直留着下一关用
Content.WAVE_MAX = 12; Content.BEAM_MAX = 6;
Content.makeWave = function () {
  if (Content.wavePool.length >= Content.WAVE_MAX) return null;
  var seg = 48, pos = new Float32Array((seg + 1) * 2 * 3), col = [], idx = [];
  for (var j = 0; j <= seg; j++) { col.push(1, 1, 1, 0, 0, 0); if (j < seg) { var q = j * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); } }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 40);
  var m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, color: 0xc070ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  m.visible = false; m.frustumCulled = false; m.renderOrder = 4;
  Game.scene.add(m);
  var p = { mesh: m, used: false, seg: seg };
  Content.wavePool.push(p);
  return p;
};
Content.makeBeam = function () {
  if (Content.beamPool.length >= Content.BEAM_MAX) return null;
  var bg = Content.beamGeo || (Content.beamGeo = new THREE.BoxGeometry(0.5, 0.5, 20).translate(0, 0, 10));
  var bm = new THREE.Mesh(bg, new THREE.MeshBasicMaterial({ color: 0xc070ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  bm.visible = false; bm.frustumCulled = false; bm.renderOrder = 4;
  Game.scene.add(bm);
  var b = { mesh: bm, used: false };
  Content.beamPool.push(b);
  return b;
};

// 贴地圆盘（每帧调用，和 FX.decal 一样的格式）：c 颜色，a 中间透明度，ra 边的亮度，kind 0 冒泡 1 闪烁 2 焦痕；flat 不算坡度（小圆点省事）
// 地面预警（kind 1：落点、俯冲、Boss 的范围招式）是一圈像素环：中间只留很淡的颜色（最多 12%），边至少 0.8 亮，越来越亮 = 快落下了；
// 颜色照每种攻击自己的（抛射物橙、打击红）
Content.decal = function (x, y, z, r, c, a, ra, kind, flat) {
  if (kind === 1) { a = Math.min(a * 0.3, 0.12); if (ra < 0.8) ra = 0.8; }
  Content.decalRaw(x, y, z, r, c, a, ra, kind, flat);
};
// 原样写一个圆盘（透明度不改；冲锋预警的空心小圈用）
Content.decalRaw = function (x, y, z, r, c, a, ra, kind, flat) {
  var m = Content.decalMesh, n = Content.decalN;
  if (!m || n >= Content.DECAL_CAP) return;
  var sx = 0, sz = 0;
  if (!flat && r >= 0.9) { FX.slope(x, z, r, y, Content._sl); sx = Content._sl[0]; sz = Content._sl[1]; }
  var ar = m.instanceMatrix.array, o = n * 16;
  ar[o] = r; ar[o + 1] = r * sx; ar[o + 2] = 0; ar[o + 3] = a;
  ar[o + 4] = 0; ar[o + 5] = 1; ar[o + 6] = 0; ar[o + 7] = ra;
  ar[o + 8] = 0; ar[o + 9] = r * sz; ar[o + 10] = r; ar[o + 11] = kind || 0;
  ar[o + 12] = x; ar[o + 13] = y + 0.09; ar[o + 14] = z; ar[o + 15] = 1;
  var ca = m.instanceColor.array, k = n * 3;
  ca[k] = FX.hr(c); ca[k + 1] = FX.hg(c); ca[k + 2] = FX.hb(c);
  Content.decalN = n + 1;
};
// 冲锋预警线（狼群扑击、无头骑士冲锋）：从 (x,z) 沿 (dx,dz) 画 len 米，每 1.5 米一个空心的小像素圈（0.28 米），末端一个大圈（0.72 米）；
// 中间几乎透明，边从 0.7 亮到 1（a 是蓄力进度 0.3~0.7）：越亮 = 快扑过来了
Content.line = function (x, z, dx, dz, len, y0, color, a) {
  var k = clamp(((a || 0.5) - 0.3) / 0.4, 0, 1), rim = 0.7 + 0.3 * k, step = 1.5;
  for (var s = step; s <= len + 0.01 && Content.decalN < Content.DECAL_CAP - Content.LINE_RESERVE; s += step) {
    var px = x + dx * s, pz = z + dz * s, end = s > len - step;
    Content.decalRaw(px, W.groundAt(px, pz, y0 + 2), pz, end ? 0.72 : 0.28, color, end ? 0.06 : 0.03, rim, 1, true);
  }
};
// 升起的尖刺 / 抛射物：写一个实例（ry 朝向，tilt 倾斜，s 缩放）
Content.put = function (kind, x, y, z, ry, tilt, s, roll) {
  var m = Content.inst && Content.inst[kind], n = Content.instN[kind];
  if (!m || n >= m.instanceMatrix.count) return;
  Content._e.set(tilt || 0, ry || 0, roll || 0, 'YXZ');
  Content._q.setFromEuler(Content._e);
  Content._v.set(x, y, z);
  Content._s.set(s || 1, s || 1, s || 1);
  Content._m.compose(Content._v, Content._q, Content._s);
  m.setMatrixAt(n, Content._m);
  Content.instN[kind] = n + 1;
};
// 鼓手连线：从 A 到 B 一根发光的细条（粗细是 w 的一半）
Content.link = function (ax, ay, az, bx, by, bz, w) {
  var m = Content.linkMesh, n = Content.linkN;
  if (!m || n >= 48) return;
  var v = Content._v2.set(bx - ax, by - ay, bz - az), L = v.length();
  if (L < 0.01) return;
  v.multiplyScalar(1 / L);
  Content._q.setFromUnitVectors(Content._z, v);
  Content._v.set(ax, ay, az);
  Content._s.set(w * 0.5, w * 0.5, L);
  Content._m.compose(Content._v, Content._q, Content._s);
  m.setMatrixAt(n, Content._m);
  Content.linkN = n + 1;
};
// 每帧末尾（FX.updateEffects 之前）提交，然后清零重新写
Content.commit = function () {
  if (!Content.gfxDone) return;
  FX.commit(Content.decalMesh, Content.decalN);
  FX.commit(Content.linkMesh, Content.linkN);
  for (var k in Content.inst) { FX.commit(Content.inst[k], Content.instN[k]); Content.instN[k] = 0; }
  Content.decalN = 0; Content.linkN = 0;
};

// ---------------- 冲击波（地面上往外扩的光墙，跳起来能躲） ----------------
Content.wave = function (x, y, z, speed, maxR, dmg, color, r0) {
  Content.gfxInit();
  var p = null;
  if (Content.wavePool) {
    for (var i = 0; i < Content.wavePool.length; i++) if (!Content.wavePool[i].used) { p = Content.wavePool[i]; break; }
    if (!p) p = Content.makeWave();
    if (!p) return null;   // 同时有太多道冲击波：这一道不放（不能有看不见却会伤人的冲击波）
  }
  var w = { x: x, y: y, z: z, r: r0 || 2.5, speed: speed, maxR: maxR, dmg: dmg, hit: false, p: p };
  if (p) { p.used = true; p.mesh.material.color.setHex(color || 0xc070ff); p.mesh.position.set(x, y, z); p.mesh.visible = true; }
  Content.waves.push(w);
  Content.sfx('wave', x, y, z);
  return w;
};
Content.updateWaves = function (dt) {
  for (var i = Content.waves.length - 1; i >= 0; i--) {
    var w = Content.waves[i];
    w.r += w.speed * dt;
    var fade = 1 - Content.ss(w.maxR * 0.7, w.maxR, w.r);
    if (!w.hit && P.alive) {
      var d = Math.sqrt(dist2(P.pos.x, P.pos.z, w.x, w.z));
      if (Math.abs(d - w.r) < 0.9 && Content.playerLow(0.9) && P.pos.y - w.y < 4) { w.hit = true; P.hurt(w.dmg, null); }
    }
    if (w.p) {
      var g = w.p.mesh.geometry, pa = g.attributes.position.array, seg = w.p.seg;
      for (var j = 0; j <= seg; j++) {
        var a = j / seg * TAU, px = Math.cos(a) * w.r, pz = Math.sin(a) * w.r;
        var gy = W.terrainH(w.x + px, w.z + pz) - w.y, o = j * 6;
        pa[o] = px; pa[o + 1] = gy + 0.05; pa[o + 2] = pz;
        pa[o + 3] = px; pa[o + 4] = gy + 1.25; pa[o + 5] = pz;
      }
      g.attributes.position.needsUpdate = true;
      w.p.mesh.material.opacity = 0.95 * fade;
    }
    if (w.r >= w.maxR) { if (w.p) { w.p.used = false; w.p.mesh.visible = false; } Content.waves.splice(i, 1); }
  }
};

// ---------------- 延迟打击：地上先亮红圈，时间到冒出尖刺 / 落下骨头 ----------------
// kind：root 树根 / sand 沙刺 / bone 天上掉骨头；dy 玩家离地多高就打不到
Content.STRIKE = {
  root: { inst: 'root', h: 2.6, col: 0x6a4a2a, dy: 2.8, hold: 0.8 },
  sand: { inst: 'sand', h: 2.2, col: 0xd9b46a, dy: 2.4, hold: 0.7 },
  bone: { inst: 'bone', h: 2.1, col: 0xe8dcc0, dy: 3.0, hold: 1.2, fall: true }
};
Content.strike = function (kind, x, z, r, delay, dmg, yRef) {
  if (Content.strikes.length >= 140) return null;
  Content.gfxInit();
  var s = { kind: kind, x: x, y: W.groundAt(x, z, (yRef != null ? yRef : P.pos.y) + 1.5), z: z, r: r, t: delay, t0: delay, dmg: dmg, fired: false, life: 0, ry: Math.random() * TAU, tilt: rand(-0.25, 0.25) };
  Content.strikes.push(s);
  return s;
};
Content.updateStrikes = function (dt) {
  for (var i = Content.strikes.length - 1; i >= 0; i--) {
    var s = Content.strikes[i], S = Content.STRIKE[s.kind];
    if (!s.fired) {
      s.t -= dt;
      var k = clamp(1 - s.t / s.t0, 0, 1);
      Content.decal(s.x, s.y, s.z, s.r, 0xff3a2a, 0.1 + 0.42 * k * k, 0.45 + 0.55 * k, 1);
      // 掉下来的骨头：最后 0.45 秒从天上斜着落下
      if (S.fall && s.t < 0.45) Content.put(S.inst, s.x - s.t * 8, s.y + s.t * 30, s.z, s.ry, 0.5 + s.tilt, 1);
      if (s.t <= 0) {
        s.fired = true;
        var d2 = dist2(P.pos.x, P.pos.z, s.x, s.z), rr = s.r + 0.25;
        if (d2 < rr * rr && P.pos.y - s.y < S.dy) P.hurt(s.dmg, null);
        FX.burst(s.x, s.y + 0.4, s.z, 6, S.col, 5, 0.3);
        if (d2 < 100) Game.shake(0.12);
        Content.sfx('strike_' + s.kind, s.x, s.y, s.z);
      }
      continue;
    }
    s.life += dt;
    var hold = S.hold, h;
    if (s.life < 0.12) h = s.life / 0.12;
    else if (s.life < 0.12 + hold) h = 1;
    else h = 1 - (s.life - 0.12 - hold) / 0.35;
    if (h <= 0) { Content.strikes.splice(i, 1); continue; }
    if (S.fall) Content.put(S.inst, s.x, s.y - (1 - h) * 2.2 - 0.3, s.z, s.ry, 0.35 + s.tilt, 1);
    else Content.put(S.inst, s.x, s.y - (1 - h) * S.h - 0.15, s.z, s.ry, s.tilt * 0.6, s.r / 1.4);
  }
};

// ---------------- 抛射物：画弧线飞过去，落点先亮预警圈 ----------------
// o：{ r 爆炸半径, dmg, H 弧高, boom 爆炸颜色, zone 落地后留下的区域 [kind, r, life, opts], onHit(l) 自定义落地效果, enemies 也炸到敌人的伤害 }
Content.lob = function (kind, x0, y0, z0, x1, z1, T, o) {
  if (Content.lobs.length >= 60) return null;
  Content.gfxInit();
  var l = { kind: kind, x0: x0, y0: y0, z0: z0, x1: x1, y1: W.groundAt(x1, z1, (o.yRef != null ? o.yRef : P.pos.y) + 1.5), z1: z1, T: T, t: 0, o: o, rot: Math.random() * TAU, x: x0, y: y0, z: z0 };
  Content.lobs.push(l);
  return l;
};
Content.updateLobs = function (dt) {
  for (var i = Content.lobs.length - 1; i >= 0; i--) {
    var l = Content.lobs[i], o = l.o;
    l.t += dt;
    var k = Math.min(1, l.t / l.T), H = o.H || 5;
    l.x = lerp(l.x0, l.x1, k); l.z = lerp(l.z0, l.z1, k); l.y = lerp(l.y0, l.y1, k) + 4 * H * k * (1 - k);
    Content.decal(l.x1, l.y1, l.z1, o.r, o.tele || 0xff4a2a, 0.12 + 0.38 * k * k, 0.5 + 0.5 * k, 1);
    Content.put(l.kind, l.x, l.y, l.z, l.rot + l.t * 5, l.t * 4, o.s || 1);
    if (o.glow) FX.glow(l.x, l.y, l.z, 1.6, 1.6, o.glow, 0.5, 0);
    if (Math.random() < dt * 18) FX.part(l.x, l.y, l.z, rand(-0.5, 0.5), rand(-0.5, 0.8), rand(-0.5, 0.5), o.trail || 0x8a7a5a, rand(0.14, 0.26), rand(0.3, 0.5), 0);
    if (k < 1) continue;
    Content.lobs.splice(i, 1);
    if (o.onHit) { o.onHit(l); continue; }
    Content.blast(l.x1, l.y1, l.z1, o.r, o.dmg, o.boom || 0xff8a3a, o.enemies);
    if (o.zone) Content.zone(o.zone[0], l.x1, l.z1, o.zone[1], o.zone[2], o.zone[3]);
    Content.sfx('lob_' + l.kind, l.x1, l.y1, l.z1);
  }
};
// 落地爆炸：伤害玩家（站在圈里、不是跳得很高）；enemies > 0 时也炸周围的敌人
Content.blast = function (x, y, z, r, dmg, color, enemies) {
  FX.boom(x, y + 0.4, z, r, color);
  if (P.alive && dist2(P.pos.x, P.pos.z, x, z) < (r + 0.3) * (r + 0.3) && P.pos.y - y < 2.4) P.hurt(dmg, null);
  if (enemies > 0) {
    Enemies.inRadius(x, z, r, function (e) {
      if (e.boss || Math.abs(e.y - y) > r + 1.5) return;
      var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      Enemies.damage(e, enemies, 0, dx / d * 10, dz / d * 10);
    });
  }
  if (dist2(P.pos.x, P.pos.z, x, z) < 225) Game.shake(0.2);
};

// ---------------- 地面区域：孢子云（减速）、荆棘丛、毒水、流沙（往中心拉） ----------------
// 中间淡（a 是原来的 0.45 倍），主要看边上那圈
Content.ZONES = {
  spore: { color: 0x5affc0, kind: 0, a: 0.162, ra: 0.75, slow: 0.6, mote: 0x7affd8, name: '孢子云' },
  thorn: { color: 0x6a8a2a, kind: 0, a: 0.189, ra: 0.6, slow: 0.7, mote: 0x9ad04a, name: '荆棘丛' },
  poison: { color: 0x7dff4a, kind: 0, a: 0.2025, ra: 0.8, slow: 0.8, mote: 0xb8ff7a, name: '毒液' },
  quicksand: { color: 0xc8a060, kind: 0, a: 0.2475, ra: 0.9, slow: 0.75, mote: 0xe0c080, name: '流沙' }
};
Content.zone = function (kind, x, z, r, life, o) {
  o = o || {};
  if (Content.zones.length >= 18) Content.zones.shift();
  Content.gfxInit();
  var zn = { kind: kind, Z: Content.ZONES[kind], x: x, y: W.groundAt(x, z, (o.yRef != null ? o.yRef : P.pos.y) + 1.5), z: z, r: r, t: 0, life: life, delay: o.delay || 0, dps: o.dps || 0, pull: o.pull || 0, core: o.core || 0, tick: 0 };
  Content.zones.push(zn);
  return zn;
};
Content.updateZones = function (dt) {
  var left = 0;
  for (var i = Content.zones.length - 1; i >= 0; i--) {
    var z = Content.zones[i], Z = z.Z;
    z.t += dt;
    if (z.t >= z.life) { Content.zones.splice(i, 1); continue; }
    var fade = Math.min(1, z.t / 0.3) * Math.min(1, (z.life - z.t) / 0.6), live = z.t >= z.delay;
    var near = dist2(z.x, z.z, P.pos.x, P.pos.z) < 3600;
    if (near) {
      Content.decal(z.x, z.y, z.z, z.r, Z.color, Z.a * fade * (live ? 1 : 0.55), Z.ra * fade, Z.kind);
      if (z.core) Content.decal(z.x, z.y + 0.02, z.z, z.core, 0x4a2a12, 0.6 * fade, 0.9 * fade, 2);
      if (Math.random() < dt * (z.pull ? 22 : 6)) {
        var a = Math.random() * TAU, rr = Math.sqrt(Math.random()) * z.r;
        if (z.pull) FX.part(z.x + Math.cos(a) * z.r, z.y + 0.15, z.z + Math.sin(a) * z.r, -Math.cos(a) * 3.5, 0.3, -Math.sin(a) * 3.5, Z.mote, rand(0.12, 0.22), 0.8, 0);
        else FX.mote(z.x + Math.cos(a) * rr, z.y + rand(0.2, 1.2), z.z + Math.sin(a) * rr, Z.mote, rand(0.08, 0.16), rand(0.4, 1.0), rand(0.8, 1.4));
      }
    }
    if (!live || !P.alive) continue;
    var dx = z.x - P.pos.x, dz = z.z - P.pos.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d > z.r || P.pos.y - z.y > 2.2) continue;
    if (Z.slow < 1) { Content.slowT = 0.25; left = Math.max(left, z.life - z.t); if (Z.slow < Content.slowK) { Content.slowK = Z.slow; Content.slowName = Z.name; } }
    if (z.pull && d > 0.4 && Content.playerLow(0.6)) {
      var pk = z.pull * dt * Math.min(1, d / 1.2);
      P.pos.x += dx / d * pk; P.pos.z += dz / d * pk;
    }
    if (z.dps > 0 && (!z.core || d < z.core)) {
      z.tick -= dt;
      if (z.tick <= 0) { z.tick = 0.5; P.hurt(z.dps * 0.5, null); }
    }
  }
  if (left > 0) Content.slowLeft = left;
  if (Content.slowT > 0) Content.slowT -= dt;
  else { Content.slowK = 1; Content.slowName = ''; Content.slowLeft = 0; }
};

// ---------------- 追踪落点（沙漏王的烈日）：先跟着玩家走，锁定变红，然后光柱落下 ----------------
Content.mark = function (x, z, track, lock, r, dmg) {
  Content.gfxInit();
  var m = { x: x, z: z, y: W.groundAt(x, z, P.pos.y + 1.5), t: 0, track: track, lock: lock, r: r, dmg: dmg };
  Content.marks.push(m);
  return m;
};
Content.updateMarks = function (dt) {
  for (var i = Content.marks.length - 1; i >= 0; i--) {
    var m = Content.marks[i];
    m.t += dt;
    if (m.t < m.track) {
      var dx = P.pos.x - m.x, dz = P.pos.z - m.z, d = Math.sqrt(dx * dx + dz * dz) || 1, s = Math.min(d, 7 * dt);
      m.x += dx / d * s; m.z += dz / d * s;
      m.y = W.groundAt(m.x, m.z, P.pos.y + 1.5);
      Content.decal(m.x, m.y, m.z, m.r, 0xffc23a, 0.28, 0.85, 1);
      FX.glow(m.x, m.y + 0.4, m.z, m.r * 1.4, 0.8, Content.C.gold, 0.25, FX.NOPULL);
    } else if (m.t < m.track + m.lock) {
      var k = (m.t - m.track) / m.lock;
      // 停下变红的那一刻（音效：0.55 秒后光柱落下，该跑出圈了）
      if (!m.locked) { m.locked = true; Content.sfx('sunLock', m.x, m.y, m.z); }
      Content.decal(m.x, m.y, m.z, m.r, 0xff3a1a, 0.3 + 0.35 * k, 1, 1);
    } else {
      Content.marks.splice(i, 1);
      Content.sunPillar(m.x, m.y, m.z, m.r);
      FX.flash(m.x, m.y + 1.2, m.z, m.r * 1.6, 0xffe9a0, 0.2, 0);
      FX.ring(m.x, m.y, m.z, m.r + 0.4, 0xffd27a, 0.35);
      FX.burst(m.x, m.y + 0.4, m.z, 10, 0xffd27a, 6, 0.3);
      if (P.alive && dist2(P.pos.x, P.pos.z, m.x, m.z) < (m.r + 0.3) * (m.r + 0.3) && P.pos.y - m.y < 8) P.hurt(m.dmg, null);
      Content.sfx('sunbeam', m.x, m.y, m.z);
    }
  }
};

// 烈日光柱：细一点、不太亮（落在玩家身上时也不会把整个画面染白），0.45 秒淡出
Content.sunPillar = function (x, y, z, r) {
  if (typeof MX === 'undefined' || !MX.beamGeo) return;
  var mat = MX.additive(0xffd27a, 0.5), m = new THREE.Mesh(MX.beamGeo(), mat);
  m.position.set(x, y, z);
  m.frustumCulled = false;
  m.scale.set(r * 0.55, 16, r * 0.55);
  MX.addFx(m, 0.45, function (e, k) {
    var s = r * (0.55 - 0.35 * k);
    m.scale.set(s, 16, s);
    mat.opacity = 0.5 * (1 - k);
  }, mat);
};

// ---------------- 合拢的骨手圈（百年沉钟第二阶段）：一圈骨手从地里伸出来往里收，留一个缺口 ----------------
Content.handRing = function (x, z, r0, r1, n, gap, gapN, delay, dur, dmg) {
  Content.gfxInit();
  var R = { x: x, z: z, y: W.groundAt(x, z, P.pos.y + 1.5), r0: r0, r1: r1, n: n, gap: gap, gapN: gapN, delay: delay, dur: dur, t: 0, dmg: dmg, cd: 0 };
  Content.rings.push(R);
  return R;
};
Content.updateRings = function (dt) {
  for (var i = Content.rings.length - 1; i >= 0; i--) {
    var R = Content.rings[i];
    R.t += dt;
    R.cd -= dt;
    var end = R.delay + R.dur + 0.4;
    if (R.t >= end) { Content.rings.splice(i, 1); continue; }
    var act = R.t - R.delay, k = act > 0 ? Content.ss(0, R.dur, act) : 0;
    var rad = lerp(R.r0, R.r1, k), h = act < 0 ? 0 : act < 0.2 ? act / 0.2 : act > R.dur ? 1 - (act - R.dur) / 0.4 : 1;
    var hit = false;
    for (var j = 0; j < R.n; j++) {
      var g = (j - R.gap + R.n) % R.n;
      if (g < R.gapN) continue;
      var a = j / R.n * TAU, hx = R.x + Math.cos(a) * rad, hz = R.z + Math.sin(a) * rad;
      var hy = W.groundAt(hx, hz, R.y + 2);
      if (act < 0) { Content.decal(hx, hy, hz, 0.55, 0xff3a2a, 0.2 + 0.4 * (1 + act / R.delay), 1, 1, true); continue; }
      Content.put('hand', hx, hy - (1 - h) * 1.5 - 0.1, hz, -a + Math.PI / 2, 0.2, 1);
      if (!hit && h > 0.5 && R.cd <= 0 && dist2(P.pos.x, P.pos.z, hx, hz) < 1.05 * 1.05 && P.pos.y - hy < 1.1) hit = true;
    }
    if (hit) { R.cd = 0.6; P.hurt(R.dmg, null); }
  }
};

// ---------------- 局内公告：发现秘密、随机事件、宝库、宝箱怪、Boss 第二阶段 ----------------
// 和 FEEL 的关卡卡片、强敌出现是同一个公告系统 Kit.announce（kit.js）：一次一条，排在正上方那一列下面，跟游戏钟走；
// CONTENT 自己没有队列、没有元素、没有样式。o = { look, size, role, icon, kick, tab, title, sub, life（默认 2.6 秒）, prio（默认 1）, key }
// 返回显示出来的公告元素（排队了返回 null）
Content.announce = function (o) {
  if (!o || typeof Kit === 'undefined') return null;
  if (o.life == null) o.life = 2.6;
  if (o.prio == null) o.prio = 1;
  return Kit.announce(o);
};
// 旧的写法 Content.banner(标题, 说明, 颜色)：照样能用，颜色换成用途色（文字公告）
Content.banner = function (title, sub, color) {
  return Content.announce({ role: Content.roleOf(color), title: String(title || ''), sub: sub ? String(sub) : '' });
};
// 颜色 → 用途：青、蓝 = 系统；红 = 危险；橙 = 强敌；别的（金、黄、白……）= 好事、进度
Content.roleOf = function (c) {
  var m = /^#?([0-9a-f]{6})$/i.exec(String(c || ''));
  if (!m) return 'gold';
  var n = parseInt(m[1], 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (g > r && b > r) return 'cya';
  if (r > 200 && g < 120) return 'red';
  if (r > 200 && g < 190 && b < 140) return 'org';
  return 'gold';
};
// 换关、重开、回菜单：公告全部收掉（没有退场动画）
Content.clearBanners = function () {
  if (typeof Kit !== 'undefined') Kit.annClear();
};

// ---------------- 小地图标记（事件目标、秘密地点）：在范围内画图标，范围外在边上画箭头 ----------------
Content.mm = [];
Content.addMarker = function (o, color, shape, size, arrow) {
  var m = { o: o, color: color, shape: shape || 'diamond', size: size || 4, arrow: arrow !== false };
  Content.mm.push(m);
  return m;
};
Content.removeMarker = function (m) { var i = Content.mm.indexOf(m); if (i >= 0) Content.mm.splice(i, 1); };
Content.mmRing = null;   // 全图事件（流星雨、血月）：小地图外圈染色
Content.drawMinimap = function () {
  var c = UI.mm;
  if (!c || !P.pos) return;
  var S = c.canvas.width, R = S / 2, RI = R - 6, range = 60, k = RI / range, px = P.pos.x, pz = P.pos.z;
  if (Content.mmRing) {
    // 全图事件（流星雨、血月）：白圈里面一条 2 像素的细圈，不闪
    c.save();
    c.globalAlpha = 0.9;
    c.strokeStyle = Content.mmRing; c.lineWidth = 2;
    c.beginPath(); c.arc(R, R, RI - 3, 0, TAU); c.stroke();
    c.restore();
  }
  for (var i = 0; i < Content.mm.length; i++) {
    var m = Content.mm[i], o = m.o;
    var x = R - (o.x - px) * k, y = R - (o.z - pz) * k, dx = x - R, dy = y - R, d = Math.sqrt(dx * dx + dy * dy);
    if (d <= RI - 4) { UI.mmIcon(c, x, y, m.color, m.shape, m.size); continue; }
    if (!m.arrow) continue;
    // 细长的三角（UI.mmArrow），尖朝外、离白圈 2 像素
    UI.mmArrow(c, R + dx / d * (RI - 10), R + dy / d * (RI - 10), Math.atan2(dy, dx), m.arrowColor || m.color);   // arrowColor：箭头另用一种颜色（望远镜）
  }
};

// ============================================================
//  新敌人的行为（返回 true = 这一帧的移动、碰撞、接触伤害都自己处理了）
// ============================================================
var CB = Enemies.BEHAVIORS;

// ---------------- 灰林狼：绕着玩家转圈，一起停下（地上亮出扑击线），再一起扑过去 ----------------
Content.newPack = function () {
  var pk = { m: [], st: 'stalk', t: rand(3.5, 5.5), ang: Math.random() * TAU, dir: Math.random() < 0.5 ? 1 : -1, tx: 0, tz: 0, ty: 0 };
  Content.packs.push(pk);
  return pk;
};
CB.pack = function (e, dt, nx, nz, d, spd) {
  var pk = e.pk;
  if (!pk) { pk = e.pk = Content.newPack(); pk.m.push(e); }
  switch (pk.st) {
    case 'wind': e.vx = 0; e.vz = 0; break;
    case 'lunge':
      if (e.lt > 0) { e.lt -= dt; e.vx = e.ldx * spd * 3.5; e.vz = e.ldz * spd * 3.5; }
      else { e.vx *= 0.85; e.vz *= 0.85; }
      break;
    case 'rest': e.vx = nx * spd * 0.3; e.vz = nz * spd * 0.3; break;
    default: {
      if (d > 16) { e.vx = nx * spd; e.vz = nz * spd; break; }
      var n = pk.m.length, a = pk.ang + pk.m.indexOf(e) / n * TAU;
      Content.steer(e, P.pos.x + Math.cos(a) * 8.5, P.pos.z + Math.sin(a) * 8.5, spd * 1.15);
    }
  }
  return false;
};
Content.updatePacks = function (dt) {
  for (var i = Content.packs.length - 1; i >= 0; i--) {
    var pk = Content.packs[i], m = pk.m, j;
    for (j = m.length - 1; j >= 0; j--) if (!m[j].alive) m.splice(j, 1);
    if (!m.length) { Content.packs.splice(i, 1); continue; }
    pk.ang += pk.dir * 0.45 * dt;
    pk.t -= dt;
    if (pk.st === 'stalk') {
      if (pk.t > 0) continue;
      var close = false;
      for (j = 0; j < m.length; j++) if (dist2(m[j].x, m[j].z, P.pos.x, P.pos.z) < 18 * 18 && !(m[j].frozen > 0)) close = true;
      if (!close || !P.alive) { pk.t = 0.8; continue; }
      pk.st = 'wind'; pk.t = 0.85; pk.tx = P.pos.x; pk.tz = P.pos.z; pk.ty = P.pos.y;
      for (j = 0; j < m.length; j++) FX.flash(m[j].x, m[j].y + 1.05 * m[j].scale, m[j].z, 1.1, 0xffcf3a, 0.25, 2);
      Content.sfx('wolfHowl', m[0].x, m[0].y, m[0].z, m[0]);
    } else if (pk.st === 'wind') {
      for (j = 0; j < m.length; j++) {
        var e = m[j], dx = pk.tx - e.x, dz = pk.tz - e.z, dd = Math.sqrt(dx * dx + dz * dz) || 1;
        if (dd < 30) Content.line(e.x, e.z, dx / dd, dz / dd, dd + 3, e.y, 0xff3a2a, 0.35 + 0.3 * (1 - pk.t / 0.85));
      }
      if (pk.t > 0) continue;
      pk.st = 'lunge'; pk.t = 0.85;
      for (j = 0; j < m.length; j++) {
        e = m[j]; dx = pk.tx - e.x; dz = pk.tz - e.z; dd = Math.sqrt(dx * dx + dz * dz) || 1;
        e.ldx = dx / dd; e.ldz = dz / dd;
        e.lt = Math.min(0.75, (dd + 3) / Math.max(1, e.speed * 3.5 * Game.enemySpeedMult));
      }
      Content.sfx('wolfLunge', m[0].x, m[0].y, m[0].z, m[0]);
    } else if (pk.st === 'lunge') {
      if (pk.t <= 0) { pk.st = 'rest'; pk.t = 1.1; }
    } else if (pk.t <= 0) { pk.st = 'stalk'; pk.t = rand(3.8, 5.6); }
  }
};
ENEMIES.wolf.look = function (e, L) {
  var st = e.pk ? e.pk.st : '';
  if (st === 'wind') { L.bob -= 0.12 * e.scale; L.pitch = 0.22; L.sy *= 0.94; }
  else if (st === 'lunge' && e.lt > 0) { L.face = Math.atan2(e.ldx, e.ldz); L.pitch = -0.1; L.sx *= 0.94; L.a = 1; }
};

// ---------------- 孢子菇：鼓起菌盖，放出一团减速的孢子云（死的时候也放一团） ----------------
CB.spore = function (e, dt, nx, nz, d, spd, frozen) {
  if (e.k === undefined) { e.k = 'walk'; e.kt = rand(2, 4); }
  e.kt -= dt;
  if (e.k === 'puff') {
    e.vx = 0; e.vz = 0;
    if (e.kt <= 0 && !frozen) { Content.sporeCloud(e.x, e.z, e.scale, e.y); e.k = 'walk'; e.kt = rand(4.5, 6.5); }
    return false;
  }
  e.vx = nx * spd; e.vz = nz * spd;
  if (e.kt <= 0) {
    if (d < 15 && !frozen) { e.k = 'puff'; e.kt = 0.75; Content.sfx('sporeWind', e.x, e.y, e.z, e); }
    else e.kt = 0.8;
  }
  return false;
};
Content.sporeCloud = function (x, z, sc, y) {
  Content.zone('spore', x, z, 3.0 * Math.sqrt(sc || 1), 6, { yRef: y });
  FX.burst(x, (y != null ? y : P.pos.y) + 1.2, z, 12, 0x6dffd0, 4, 0.25);
  Content.sfx('sporePuff', x, y, z);
};
ENEMIES.shroom.look = function (e, L) {
  if (e.k !== 'puff') return;
  var k = 1 - e.kt / 0.75;
  L.sx *= 1 + 0.22 * k; L.sy *= 1 - 0.1 * k;
  L.roll += Math.sin(Game.time * 40) * 0.05 * k;
};

// ---------------- 哥布林鼓手：躲在后面，擂鼓给 10 米内的怪加速加伤害，连着一道橙色的光 ----------------
CB.drum = function (e, dt, nx, nz, d, spd, frozen) {
  if (e.k === undefined) { e.k = 'walk'; e.kt = rand(2, 3.5); e.sd = Math.random() < 0.5 ? 1 : -1; }
  e.kt -= dt;
  if (e.k === 'beat') {
    e.vx = 0; e.vz = 0;
    if (e.kt <= 0) { if (!frozen) Content.drumBeat(e); e.k = 'walk'; e.kt = rand(5, 6.5); }
    return false;
  }
  var want = d > 13 ? 1 : d < 8.5 ? -0.9 : 0;
  e.vx = (nx * want - nz * e.sd * 0.55) * spd; e.vz = (nz * want + nx * e.sd * 0.55) * spd;
  if (Math.random() < dt * 0.3) e.sd = -e.sd;
  if (e.kt <= 0) {
    if (d < 26 && !frozen && Content.alliesNear(e, 10)) { e.k = 'beat'; e.kt = 0.7; Content.sfx('drumWind', e.x, e.y, e.z, e); }
    else e.kt = 1;
  }
  return false;
};
Content.alliesNear = function (e, r) {
  var n = 0;
  Enemies.inRadius(e.x, e.z, r, function (o) { if (o !== e && !o.boss && !o.mini) n++; });
  return n > 0;
};
// 鼓点：一圈淡淡的光圈 + 「鼓舞！」（像素字）+ 连到每只被强化的怪的细闪电（敌人的增益，不抢玩家自己光环的戏）
Content.drumBeat = function (e) {
  var R = 10 * (e.elite ? 1.3 : 1), n = 0;
  FX.ring(e.x, e.y, e.z, R, 0xff9a3a, 0.5, 0.28);
  if (Content.near(e.x, e.z, 34)) FX.text(e.x, e.y + 2.3 * e.scale, e.z, '鼓舞！', '#ffb050', 0.9);
  Enemies.inRadius(e.x, e.z, R, function (o) {
    if (o === e || o.boss || o.mini || n >= 10 || o.def.behavior === 'drum') return;
    n++;
    if (!(o.buffT > 0)) { o.speed *= 1.3; o.dmg *= 1.25; Content.buffed.push(o); }
    o.buffT = 6; o.buffBy = e;
    FX.bolt(e.x, e.y + 0.9 * e.scale, e.z, o.x, o.y + o.r, o.z, 0xffa040, { straight: true, life: 0.25, w: 0.3, flash: false });
  });
  Content.sfx('drumBeat', e.x, e.y, e.z, e);
};
Content.unbuff = function (o) {
  if (!(o.buffT > 0) && !o.buffBy) return;
  o.speed /= 1.3; o.dmg /= 1.25; o.buffT = 0; o.buffBy = null;
};
Content.updateBuffs = function (dt) {
  var L = Content.buffed;
  for (var i = L.length - 1; i >= 0; i--) {
    var o = L[i];
    if (o.alive) o.buffT -= dt;
    var by = o.buffBy;
    if (!o.alive || o.buffT <= 0 || !by || !by.alive) {
      if (o.alive) Content.unbuff(o); else { o.buffT = 0; o.buffBy = null; }
      L[i] = L[L.length - 1]; L.pop();
      continue;
    }
    if (dist2(o.x, o.z, P.pos.x, P.pos.z) > 2500) continue;
    var pulse = 0.85 + 0.25 * Math.sin(Content.time * 10 + i);
    Content.link(by.x, by.y + 0.85 * by.scale, by.z, o.x, o.y + o.r * 1.1, o.z, pulse);
    // 被强化的怪身上的光圈：小一点（原来的 0.6）、淡一半
    FX.glow(o.x, o.y + o.r * 1.1, o.z, o.r * 1.56, o.r * 1.56, Content.C.orange, 0.16, 1);
  }
};
ENEMIES.drummer.look = function (e, L) {
  if (e.k !== 'beat') return;
  L.a = 1; L.p = Game.time * 24; L.pitch = -0.08;
};

// ---------------- 沙穴蠕虫：钻进沙里往玩家脚下游（地上一道沙浪），地面裂开 0.85 秒后从下面钻出来 ----------------
CB.burrow = function (e, dt, nx, nz, d, spd, frozen) {
  if (!e.k) { Content.goUnder(e, rand(3, 6)); return true; }
  e.kt -= dt;
  if (e.k === 'rise') { e.vx = 0; e.vz = 0; if (e.kt <= 0) { e.k = 'up'; e.kt = rand(3, 4.2); } return false; }
  if (e.k === 'sink') { e.vx = 0; e.vz = 0; if (e.kt <= 0) Content.goUnder(e, rand(3.5, 6)); return false; }
  if (e.k !== 'up') return true;
  e.vx = nx * spd * 0.55; e.vz = nz * spd * 0.55;
  if (Math.random() < dt * 4) FX.part(e.x + rand(-0.7, 0.7), e.y + 0.1, e.z + rand(-0.7, 0.7), rand(-1, 1), rand(1, 2.5), rand(-1, 1), 0xc8a060, 0.2, 0.4);
  if (e.kt <= 0 && !frozen) { e.k = 'sink'; e.kt = 0.45; FX.burst(e.x, e.y + 0.3, e.z, 10, 0xc8a060, 4, 0.3); Content.sfx('wormSink', e.x, e.y, e.z, e); }
  return false;
};
Content.goUnder = function (e, t) {
  e.k = 'under'; e.kt = t; e.under = true;
  e.vx = 0; e.vz = 0; e.kx = 0; e.kz = 0;
  Content.pending.push(e);
};
// 敌人更新完以后把要钻地的移出列表（钻在地下时打不到、也不会被瞄准）
Content.processPending = function () {
  var p = Content.pending;
  for (var i = 0; i < p.length; i++) {
    var e = p[i], L = Enemies.list, j = L.indexOf(e);
    if (j < 0 || !e.alive) continue;
    L[j] = L[L.length - 1]; L.pop();
    Content.under.push(e);
  }
  p.length = 0;
};
Content.updateUnder = function (dt) {
  var U = Content.under;
  for (var i = U.length - 1; i >= 0; i--) {
    var w = U[i];
    w.kt -= dt; w.frozen -= dt; w.touchCd -= dt; w.phase += dt;
    var dx = P.pos.x - w.x, dz = P.pos.z - w.z, d = Math.sqrt(dx * dx + dz * dz) || 0.001;
    if (w.k === 'under') {
      if (d > 95) { var sp = Director.spawnPoint(); w.x = sp.x; w.z = sp.z; dx = P.pos.x - w.x; dz = P.pos.z - w.z; d = Math.sqrt(dx * dx + dz * dz) || 0.001; }
      var s = (w.frozen > 0 ? 0 : 8.5) * Game.enemySpeedMult;
      if (d > 1.2) { w.x += dx / d * s * dt; w.z += dz / d * s * dt; }
      w.y = W.terrainH(w.x, w.z);
      if (d < 70) {
        Content.decal(w.x, w.y, w.z, 1.15 * w.scale, 0x6a4a28, 0.5, 0.55, 2, true);
        if (Math.random() < dt * 16) FX.part(w.x + rand(-0.6, 0.6), w.y + 0.1, w.z + rand(-0.6, 0.6), rand(-1.2, 1.2), rand(1.5, 3.5), rand(-1.2, 1.2), 0xc8a060, rand(0.15, 0.3), rand(0.3, 0.5));
      }
      if ((d < 1.8 || w.kt <= 0) && P.alive && d < 40) {
        w.k = 'mark'; w.kt = 0.85; w.tx = P.pos.x; w.tz = P.pos.z; w.ty = W.groundAt(w.tx, w.tz, P.pos.y + 1);
        Content.sfx('wormMark', w.tx, w.ty, w.tz, w);
      } else if (w.kt <= 0) w.kt = 1;
    } else if (w.k === 'mark') {
      var k = 1 - w.kt / 0.85, R = 2.3 * w.scale;
      Content.decal(w.tx, w.ty, w.tz, R, 0xff3a1a, 0.15 + 0.3 * k, 0.6 + 0.4 * k, 1);
      Content.decal(w.tx, w.ty + 0.02, w.tz, R * (0.35 + 0.45 * k), 0x2a1408, 0.65, 1, 2);
      if (Math.random() < dt * 24) FX.part(w.tx + rand(-R, R) * 0.7, w.ty + 0.1, w.tz + rand(-R, R) * 0.7, 0, rand(2, 4.5), 0, pick([0xc8a060, 0x8a6a3a]), rand(0.12, 0.24), rand(0.25, 0.45));
      if (w.kt <= 0) { U.splice(i, 1); Content.erupt(w); }
    }
  }
};
Content.erupt = function (w) {
  w.x = w.tx; w.z = w.tz; w.y = w.ty;
  w.k = 'rise'; w.kt = 0.35; w.under = false; w.grounded = true; w.vx = 0; w.vz = 0; w.vy = 0;
  Enemies.list.push(w);
  var R = 2.3 * w.scale;
  if (P.alive && dist2(P.pos.x, P.pos.z, w.x, w.z) < R * R && P.pos.y - w.y < 1.8) P.hurt(w.dmg * 1.3, null);
  FX.burst(w.x, w.y + 0.6, w.z, 22, 0xc8a060, 8, 0.4);
  FX.ring(w.x, w.y, w.z, R + 0.4, 0xd9b46a, 0.35);
  if (Content.near(w.x, w.z, 12)) Game.shake(0.3);
  Content.sfx('wormErupt', w.x, w.y, w.z, w);
};
ENEMIES.worm.look = function (e, L) {
  if (e.k === 'under' || !e.k) { L.hide = true; return; }
  if (e.k === 'rise') L.bob -= Math.max(0, e.kt / 0.35) * 2.6 * e.scale;
  else if (e.k === 'sink') L.bob -= (1 - Math.max(0, e.kt / 0.45)) * 2.6 * e.scale;
};

// ---------------- 食腐秃鹫：在头顶盘旋，地上标出落点，然后俯冲；扎进地里 1.3 秒（这时最好打） ----------------
CB.dive = function (e, dt, nx, nz, d, spd, frozen) {
  if (!e.k) { e.k = 'circle'; e.kt = rand(2.5, 4.5); e.oa = Math.atan2(e.z - P.pos.z, e.x - P.pos.x); e.od = Math.random() < 0.5 ? 1 : -1; }
  e.kt -= dt;
  var kd = Math.exp(-dt * 7);
  e.kx *= kd; e.kz *= kd;
  if (d > 95) { var sp = Director.spawnPoint(); e.x = sp.x; e.z = sp.z; e.y = sp.y + 8; e.k = 'circle'; e.kt = 3; return true; }
  if (frozen) {
    if (e.k === 'dive') { e.k = 'stuck'; e.kt = 1.3; }
    if (e.k === 'stuck') e.y = W.groundAt(e.x, e.z, e.y + 1);
    e.vx = 0; e.vz = 0;
    return true;
  }
  switch (e.k) {
    case 'circle': {
      if (d > 22) { e.vx = nx * spd * 1.3; e.vz = nz * spd * 1.3; e.oa = Math.atan2(e.z - P.pos.z, e.x - P.pos.x); }
      else {
        e.oa += e.od * spd * 0.9 / 8.5 * dt;
        Content.steer(e, P.pos.x + Math.cos(e.oa) * 8.5, P.pos.z + Math.sin(e.oa) * 8.5, spd * 1.6);
      }
      e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
      var ty = Math.max(W.groundAt(e.x, e.z, 999) + 2.5, P.pos.y + 6.5) + Math.sin(e.phase * 1.7) * 0.4;
      e.y = lerp(e.y, ty, Math.min(1, dt * 2));
      if (e.kt <= 0) {
        if (d < 24 && P.alive) {
          var lx = P.vel.x * 0.25, lz = P.vel.z * 0.25, ll = Math.sqrt(lx * lx + lz * lz);
          if (ll > 3) { lx *= 3 / ll; lz *= 3 / ll; }
          e.k = 'mark'; e.kt = 0.95; e.tx = P.pos.x + lx; e.tz = P.pos.z + lz; e.ty = W.groundAt(e.tx, e.tz, P.pos.y + 1);
          Content.sfx('vultureMark', e.x, e.y, e.z, e);
        } else e.kt = 1;
      }
      break;
    }
    case 'mark': {
      e.vx *= 0.9; e.vz *= 0.9;
      e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
      e.y = lerp(e.y, Math.max(e.ty + 8.5, W.groundAt(e.x, e.z, 999) + 2.5), Math.min(1, dt * 2.5));
      var k = 1 - e.kt / 0.95;
      Content.decal(e.tx, e.ty, e.tz, 2.2 * e.scale, 0xff3a2a, 0.15 + 0.35 * k, 0.7 + 0.3 * k, 1);
      if (e.kt <= 0) {
        var dx = e.tx - e.x, dy = e.ty + 0.4 - e.y, dz = e.tz - e.z, L = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
        e.k = 'dive'; e.ddx = dx / L; e.ddy = dy / L; e.ddz = dz / L; e.dl = L; e.kt = 2;
        Content.sfx('vultureDive', e.x, e.y, e.z, e);
      }
      break;
    }
    case 'dive': {
      var step = 26 * dt * Game.enemySpeedMult;
      e.x += e.ddx * step; e.y += e.ddy * step; e.z += e.ddz * step; e.dl -= step;
      e.vx = e.ddx * 26; e.vz = e.ddz * 26;
      Content.decal(e.tx, e.ty, e.tz, 2.2 * e.scale, 0xff3a2a, 0.5, 1, 1);
      var gy = W.groundAt(e.x, e.z, e.y + 1);
      if (e.dl <= 0 || e.y <= gy || e.kt <= 0) {
        e.y = gy; e.k = 'stuck'; e.kt = 1.3; e.vx = 0; e.vz = 0;
        var R = 2.2 * e.scale;
        FX.burst(e.x, e.y + 0.3, e.z, 14, 0xc8a070, 6, 0.3);
        FX.ring(e.x, e.y, e.z, R, 0xd9b46a, 0.3);
        if (P.alive && dist2(P.pos.x, P.pos.z, e.x, e.z) < R * R && P.pos.y - e.y < 2) P.hurt(e.dmg * 1.2, e);
        if (Content.near(e.x, e.z, 10)) Game.shake(0.18);
        Content.sfx('vultureImpact', e.x, e.y, e.z, e);
      }
      break;
    }
    case 'stuck':
      e.vx = 0; e.vz = 0;
      e.x += e.kx * dt; e.z += e.kz * dt;
      e.y = W.groundAt(e.x, e.z, e.y + 1);
      Content.touch(e, d, 0.6);
      if (e.kt <= 0) { e.k = 'rise'; e.kt = 0.9; }
      break;
    default:
      e.vx = -nx * spd * 0.5; e.vz = -nz * spd * 0.5;
      e.x += (e.vx + e.kx) * dt; e.z += (e.vz + e.kz) * dt;
      e.y = lerp(e.y, P.pos.y + 6.5, Math.min(1, dt * 2.2));
      if (e.kt <= 0) { e.k = 'circle'; e.kt = rand(3, 5); e.oa = Math.atan2(e.z - P.pos.z, e.x - P.pos.x); }
  }
  if (e.k !== 'stuck' && e.k !== 'dive') Content.touch(e, d, 1);
  e.vy = 0;
  return true;
};
ENEMIES.vulture.look = function (e, L) {
  if (e.k === 'dive') { L.face = Math.atan2(e.ddx, e.ddz); L.pitch = 0.95; }
  else if (e.k === 'mark') { L.pitch = -0.35; L.bob += Math.sin(Game.time * 30) * 0.05; }
  else if (e.k === 'stuck') { L.pitch = 0.7; L.bob = -0.2; L.roll = Math.sin(Game.time * 18) * 0.08; }
};

// ---------------- 蜥人盾卫：转身很慢，盾牌挡住正面射来的飞弹（绕到侧面、背面，或者用范围伤害） ----------------
CB.shield = function (e, dt, nx, nz, d, spd, frozen) {
  var want = Math.atan2(nx, nz);
  if (e.faceA === undefined) e.faceA = want;
  var diff = Content.angDiff(want, e.faceA), turn = (frozen ? 0 : 1.25) * dt;
  e.faceA += clamp(diff, -turn, turn);
  var k = 1 - 0.65 * Math.min(1, Math.abs(diff) / 1.6);
  e.vx = Math.sin(e.faceA) * spd * k; e.vz = Math.cos(e.faceA) * spd * k;
  return false;
};
ENEMIES.lizard.look = function (e, L) { if (e.faceA !== undefined) L.face = e.faceA; };
// 蜥人督军（小 Boss）也举着盾：朝向由 Content.updateBigs 维持（bossAI 不走 CB.shield）
ENEMIES.lizardlord.look = ENEMIES.lizard.look;
Content.blockFx = function (e) {
  if (Content.time - (e.blkT || -9) < 0.12) return;
  e.blkT = Content.time;
  var fx = Math.sin(e.faceA), fz = Math.cos(e.faceA), x = e.x + fx * 0.7 * e.scale, y = e.y + 1.2 * e.scale, z = e.z + fz * 0.7 * e.scale;
  FX.flash(x, y, z, 1.3, 0xffd27a, 0.14, 2);
  FX.burst(x, y, z, 3, 0xffd27a, 4, 0.14);
  if (Content.time - (Content.blkTextT || -9) > 0.7 && Content.near(e.x, e.z, 30)) { Content.blkTextT = Content.time; FX.text(x, y + 0.6, z, '格挡', '#ffd27a', 0.9); }
  Content.sfx('shieldBlock', x, y, z, e);
  Content.hint('shield', '盾牌挡住正面：绕到侧面打', '#ffd27a');
};

// ---------------- 诅咒墓碑：从地里升起来，每 6.5 秒在旁边召唤两只亡灵（地上先亮绿圈）；不打碎会一直召唤 ----------------
CB.spawner = function (e, dt, nx, nz, d, spd, frozen) {
  if (!e.k) {
    e.k = 'rise'; e.kt = 1.2; e.mins = []; e.sp = [0, 0, 0, 0];
    e.y = W.groundAt(e.x, e.z, e.y + 2);
    FX.burst(e.x, e.y + 0.3, e.z, 16, 0x5a4a3a, 6, 0.35);
    Content.sfx('tombRise', e.x, e.y, e.z, e);
  }
  e.kt -= dt;
  e.vx = 0; e.vz = 0; e.kx = 0; e.kz = 0;
  if (d > 120) { e.alive = false; return true; }
  if (e.k === 'rise') { if (e.kt <= 0) { e.k = 'idle'; e.kt = 2.5; } }
  else if (e.k === 'idle') {
    if (e.kt <= 0) {
      for (var i = e.mins.length - 1; i >= 0; i--) if (!e.mins[i].alive) e.mins.splice(i, 1);
      if (d < 40 && !frozen && e.mins.length < 5 && Enemies.list.length < Enemies.MAX - 20) {
        e.k = 'cast'; e.kt = 0.9;
        for (i = 0; i < 2; i++) {
          var a = Math.atan2(nz, nx) + (i ? 0.9 : -0.9) + rand(-0.3, 0.3), r = rand(2.6, 4.2) * e.scale;
          e.sp[i * 2] = e.x + Math.cos(a) * r; e.sp[i * 2 + 1] = e.z + Math.sin(a) * r;
        }
        Content.sfx('tombCast', e.x, e.y, e.z, e);
      } else e.kt = 1.5;
    }
  } else if (e.k === 'cast') {
    var k = 1 - e.kt / 0.9;
    for (i = 0; i < 2; i++) {
      var sx = e.sp[i * 2], sz = e.sp[i * 2 + 1], sy = W.groundAt(sx, sz, e.y + 2);
      Content.decal(sx, sy, sz, 1.0, 0x6dff9a, 0.2 + 0.4 * k, 1, 0, true);
      if (Math.random() < dt * 12) FX.mote(sx + rand(-0.5, 0.5), sy + 0.2, sz + rand(-0.5, 0.5), 0x8affb0, 0.12, rand(1.5, 3), 0.7);
    }
    if (e.kt <= 0) {
      for (i = 0; i < 2; i++) {
        if (Enemies.list.length >= Enemies.MAX - 10) break;
        var m = Enemies.spawn(pick(['zombie', 'skeleton']), e.sp[i * 2], e.sp[i * 2 + 1], { hpMult: Director.hpMult() * 0.8, dmgMult: Director.dmgMult(), solo: true });
        e.mins.push(m);
        FX.burst(m.x, m.y + 0.3, m.z, 10, 0x5a4a3a, 5, 0.3);
        FX.burst(m.x, m.y + 0.8, m.z, 6, 0x6dff9a, 3, 0.2);
      }
      e.k = 'idle'; e.kt = 6.5;
    }
  }
  if (d < 70) FX.glow(e.x, e.y + 2.95 * e.scale, e.z, 1.7 * e.scale, 2.2 * e.scale, Content.C.green, 0.3 + 0.12 * Math.sin(e.phase * 4), 0);
  return true;
};
ENEMIES.tomb.look = function (e, L) {
  L.face = e.faceA !== undefined ? e.faceA : (e.faceA = L.face);
  if (e.k === 'rise' || !e.k) L.bob -= Math.max(0, (e.kt || 1.2) / 1.2) * 2.9 * e.scale;
  else if (e.k === 'cast') L.roll = Math.sin(Game.time * 34) * 0.03;
};

// ---------------- 灵质团：左右飘着靠近，死后裂成三团小灵质 ----------------
CB.ooze = function (e, dt, nx, nz, d, spd) {
  var w = Math.sin(e.phase * 2.3) * 0.5;
  e.vx = (nx - nz * w) * spd; e.vz = (nz + nx * w) * spd;
  return false;
};
ENEMIES.ecto.look = ENEMIES.ectosmall.look = function (e, L) {
  var s = Math.sin(e.phase * 5.5) * 0.07;
  L.sx *= 1 + s; L.sy *= 1 - s;
};
Content.split = function (e) {
  var def = e.def, n = def.splitN || 2;
  e.splitDone = true;
  FX.burst(e.x, e.y + 0.3, e.z, 16, def.color, 6, 0.3);
  for (var i = 0; i < n; i++) {
    if (Enemies.list.length >= Enemies.MAX - 4) break;
    var a = i / n * TAU + Math.random(), c = Enemies.spawn(def.split, e.x + Math.cos(a) * 0.6, e.z + Math.sin(a) * 0.6, { hpMult: e.hpm || 1, dmgMult: e.dmm || 1, solo: true });
    c.y = e.y; c.kx = Math.cos(a) * 9; c.kz = Math.sin(a) * 9;
  }
  Content.sfx('split', e.x, e.y, e.z, e);
};

// ---------------- 无头骑士：停下来端平长枪（地上亮出一条冲锋线），再沿着线冲过去；冲完要歇一下 ----------------
CB.lancer = function (e, dt, nx, nz, d, spd, frozen) {
  if (!e.k) { e.k = 'walk'; e.kt = rand(2.5, 4); }
  e.kt -= dt;
  switch (e.k) {
    case 'aim':
      e.vx = 0; e.vz = 0;
      if (e.kt > 0.4) { e.ldx = nx; e.ldz = nz; e.cl = Math.min(d + 7, 26); }
      Content.line(e.x, e.z, e.ldx, e.ldz, e.cl, e.y, 0xff3a2a, 0.3 + 0.35 * (1 - e.kt));
      if (e.kt <= 0) { e.k = 'charge'; e.kt = e.cl / 19; e.cpx = e.x; e.cpz = e.z; Content.sfx('lancerCharge', e.x, e.y, e.z, e); }
      break;
    case 'charge': {
      if (frozen) { e.k = 'recover'; e.kt = 1; break; }
      // 撞墙了（上一帧几乎没动）就停下
      var mv = Math.sqrt(dist2(e.x, e.z, e.cpx, e.cpz));
      e.cpx = e.x; e.cpz = e.z;
      if (e.kt < e.cl / 19 - 0.15 && mv < 19 * dt * 0.3) e.kt = 0;
      e.vx = e.ldx * 19; e.vz = e.ldz * 19;
      Content.touch(e, d, 1.5);
      if (Math.random() < dt * 20) FX.part(e.x - e.ldx, e.y + 0.1, e.z - e.ldz, rand(-1, 1), rand(1, 2.5), rand(-1, 1), 0x6a6a72, 0.22, 0.4);
      if (e.kt <= 0) { e.k = 'recover'; e.kt = 1.1; FX.burst(e.x, e.y + 0.2, e.z, 8, 0x6a6a72, 4, 0.3); }
      break;
    }
    case 'recover':
      e.vx *= 0.85; e.vz *= 0.85;
      if (e.kt <= 0) { e.k = 'walk'; e.kt = rand(3, 4.5); }
      break;
    default:
      e.vx = nx * spd; e.vz = nz * spd;
      if (e.kt <= 0) {
        if (d > 6 && d < 24 && !frozen && P.alive) { e.k = 'aim'; e.kt = 1.0; e.ldx = nx; e.ldz = nz; e.cl = Math.min(d + 7, 26); Content.sfx('lancerAim', e.x, e.y, e.z, e); }
        else e.kt = 1;
      }
  }
  return false;
};
ENEMIES.headless.look = function (e, L) {
  if (e.k === 'aim') { L.face = Math.atan2(e.ldx, e.ldz); L.pitch = -0.14; }
  else if (e.k === 'charge') { L.face = Math.atan2(e.ldx, e.ldz); L.pitch = 0.32; L.a = 1; }
  else if (e.k === 'recover') L.pitch = 0.18;
};

// ---------------- 金袋哥布林（事件）：一直往远处跑，挨打会掉金币；不伤人 ----------------
CB.flee = function (e, dt, nx, nz, d, spd) {
  e.touchCd = 1;
  if (!e.k) { e.k = 'run'; e.wa2 = Math.random() * TAU; e.jt = 1.5; e.cpx = e.x; e.cpz = e.z; e.stuckT = 0; }
  e.wa2 += rand(-1, 1) * dt * 2.5;
  var ax = -nx + Math.cos(e.wa2) * 0.45, az = -nz + Math.sin(e.wa2) * 0.45, lim = W.S - 30;
  if (e.x > lim) ax -= (e.x - lim) * 0.35; if (e.x < -lim) ax += (-lim - e.x) * 0.35;
  if (e.z > lim) az -= (e.z - lim) * 0.35; if (e.z < -lim) az += (-lim - e.z) * 0.35;
  // 卡住了（墙角）：换个方向跑一会儿
  var mv = Math.sqrt(dist2(e.x, e.z, e.cpx, e.cpz));
  e.cpx = e.x; e.cpz = e.z;
  e.stuckT = mv < spd * dt * 0.25 ? e.stuckT + dt : Math.max(0, e.stuckT - dt);
  if (e.stuckT > 0.4) { e.wa2 = Math.atan2(nx, -nz); e.stuckT = 0; }
  var l = Math.sqrt(ax * ax + az * az) || 1, s = spd * (d > 34 ? 0.4 : d < 12 ? 1.08 : 1);
  e.vx = ax / l * s; e.vz = az / l * s;
  e.jt -= dt;
  if (e.jt <= 0 && e.grounded) { e.vy = 7; e.grounded = false; e.jt = rand(1.4, 2.8); }
  if (Math.random() < dt * 1.0) Pickups.gold(e.x, e.y + 0.8, e.z, Math.ceil(Game.stage * P.st.goldGain));
  if (Math.random() < dt * 6) FX.glow(e.x, e.y + 1.4, e.z - 0.2, 0.5, 0.5, Content.C.gold, 0.8, 2);
  return false;
};
ENEMIES.goldgob.look = function (e, L) { L.face = Math.atan2(e.vx || 0.001, e.vz || 0.001); };

// ============================================================
//  Boss 和小 Boss 的新招式：start 选中时调用（可以改 e.st 作为蓄力时间），update 每帧调用；结束时回到追击
// ============================================================
var CA = Enemies.ATTACKS;
Content.done = function (e, a, b) { e.state = 'chase'; e.st = rand(a, b) * (e.phase2 ? 0.75 : 1); e.ak = 0; };
Content.atk = function (e, name) { Content.sfx('boss_' + name, e.x, e.y, e.z, e); };
// 预判一点点：玩家现在的位置 + 速度 × t（最多 lim 米）
Content.lead = function (t, lim, out) {
  var lx = P.vel.x * t, lz = P.vel.z * t, l = Math.sqrt(lx * lx + lz * lz);
  if (l > lim) { lx *= lim / l; lz *= lim / l; }
  out[0] = P.pos.x + lx; out[1] = P.pos.z + lz;
  return out;
};
Content._ld = [0, 0];

// ---- 千年橡王 ----
// 盘根错节：玩家脚下 5×5 的棋盘格，两批树根先后冒出来（先亮的那批先冒）
CA.rootgrid = {
  start: function (e) { e.st = 0.55; e.ak = 0; FX.ring(e.x, e.y, e.z, 5, 0x9a7a3a, 0.5); Content.atk(e, 'rootgrid'); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 2.4;
      var cx = P.pos.x, cz = P.pos.z, sp = 3.4, n = e.phase2 ? 3 : 2;
      for (var i = -n; i <= n; i++) for (var j = -n; j <= n; j++) {
        var x = cx + i * sp + rand(-0.3, 0.3), z = cz + j * sp + rand(-0.3, 0.3);
        Content.strike('root', x, z, 1.55, ((i + j) & 1) ? 2.05 : 1.15, e.dmg * 1.1);
      }
      Content.hint('rootgrid', '树根分两批：先站暗圈里', '#d9c08a');
      return;
    }
    Content.done(e, 2.2, 3.4);
  }
};
// 炸裂种荚：从树冠里抛出几颗种荚，落地炸开并留下一片减速的荆棘丛
CA.seedbomb = {
  start: function (e) { e.st = 0.6; e.ak = 0; Content.atk(e, 'seedbomb'); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 1.5;
      var n = e.phase2 ? 6 : 4, t = Content.lead(0.4, 4, Content._ld);
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, r = i ? rand(3.5, 7.5) : 0, tx = (i ? P.pos.x : t[0]) + Math.cos(a) * r, tz = (i ? P.pos.z : t[1]) + Math.sin(a) * r;
        Content.lob('seed', e.x, e.y + 5.5 * e.scale, e.z, tx, tz, 1.1 + i * 0.12, { r: 2.6, dmg: e.dmg, H: 6, boom: 0x9ac040, trail: 0x6a8a2a, zone: ['thorn', 2.4, 5, { dps: e.dmg * 0.25 }] });
      }
      return;
    }
    Content.done(e, 2.4, 3.6);
  }
};
// 落叶旋风（第二阶段）：原地转圈，三条旋臂往外喷慢速的红球
CA.leafstorm = {
  start: function (e) { e.st = 0.5; e.ak = 0; e.at = 0; e.sa = Math.random() * TAU; e.vt = 0; Content.atk(e, 'leafstorm'); },
  update: function (e, dt) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    e.ak = 1; e.at += dt; e.vt -= dt;
    if (e.vt <= 0) {
      e.vt = 0.14;
      var sy = e.y + 2.6 * e.scale, ty = P.pos.y + 1;
      for (var k = 0; k < 3; k++) {
        var a = e.sa + k * TAU / 3, cx = Math.cos(a), cz = Math.sin(a);
        Content.shot(e.x + cx * 2.4, sy, e.z + cz * 2.4, cx * 8.5, (ty - sy) / 1.3, cz * 8.5, e.dmg * 0.55);
      }
      e.sa += 0.32;
    }
    if (e.at > 3.0) Content.done(e, 2.5, 3.5);
  }
};

// ---- 沙漏王 ----
// 烈日审判：几个金色光圈追着玩家跑，停下变红，0.55 秒后光柱落下
CA.sunbeam = {
  start: function (e) { e.st = 0.4; e.ak = 0; Content.atk(e, 'sunbeam'); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 3.3;
      var n = e.phase2 ? 5 : 3;
      for (var i = 0; i < n; i++) {
        var a = Math.random() * TAU, r = rand(6, 9);
        Content.mark(P.pos.x + Math.cos(a) * r, P.pos.z + Math.sin(a) * r, 1.2 + i * 0.35, 0.55, 2.2, e.dmg * 1.1);
      }
      return;
    }
    Content.done(e, 2.4, 3.6);
  }
};
// 流沙之墙：一排慢速沙球横着推过来，中间留一个缺口（也可以跳过去）；第二阶段再推一排
CA.sandwall = {
  start: function (e) { e.st = 0.65; e.ak = 0; e.at = 0; Content.atk(e, 'sandwall'); },
  update: function (e, dt, nx, nz) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) { if (Math.random() < dt * 20) FX.part(e.x + rand(-2, 2), e.y + 0.3, e.z + rand(-2, 2), rand(-2, 2), rand(1, 3), rand(-2, 2), 0xd9b46a, 0.25, 0.5); return; }
    e.at += dt;
    if (e.ak === 0 || (e.ak === 1 && e.phase2 && e.at > 1.1)) {
      e.ak++;
      var gap = randi(3, 10), ly = Math.max(W.groundAt(e.x, e.z, e.y + 2), W.groundAt(P.pos.x, P.pos.z, P.pos.y + 1)) + 1.0;
      for (var i = 0; i < 15; i++) {
        if (i === gap || i === gap + 1) continue;
        var o = (i - 7) * 2.0, x = e.x + nx * 3 - nz * o, z = e.z + nz * 3 + nx * o;
        Content.shot(x, ly, z, nx * 7.5, 0, nz * 7.5, e.dmg * 0.7);
      }
      Content.hint('sandwall', '沙墙有缺口，也能跳过去', '#e0c080');
    }
    if (e.at > (e.phase2 ? 1.6 : 0.5)) Content.done(e, 2.5, 3.5);
  }
};
// 流沙漩涡（第二阶段）：玩家脚下出现一片流沙，0.8 秒后开始往中心拉，中心有伤害
CA.quicksand = {
  start: function (e) { e.st = 0.4; e.ak = 0; Content.atk(e, 'quicksand'); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 0.8;
      Content.zone('quicksand', P.pos.x, P.pos.z, 5.5, 4.8, { delay: 0.8, pull: 3.4, dps: e.dmg * 0.6, core: 1.8 });
      return;
    }
    Content.done(e, 2.2, 3.2);
  }
};

// ---- 百年沉钟 ----
// 骨雨：一大把骨头从天上落下，每根落点先亮红圈
CA.bonerain = {
  start: function (e) { e.st = 0.5; e.ak = 0; e.at = 0; e.bn = 0; Content.atk(e, 'bonerain'); },
  update: function (e, dt) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    e.at += dt;
    var N = e.phase2 ? 22 : 15;
    while (e.bn < N && e.at > e.bn * 1.5 / N) {
      var x = P.pos.x, z = P.pos.z;
      if (e.bn >= 3) { var a = Math.random() * TAU, r = Math.sqrt(Math.random()) * 9; x += Math.cos(a) * r; z += Math.sin(a) * r; }
      Content.strike('bone', x, z, 1.25, 0.9, e.dmg * 0.9);
      e.bn++;
    }
    if (e.bn >= N && e.at > 2.6) Content.done(e, 2.4, 3.6);
  }
};
// 亡灵冲击：法杖砸地，一圈圈紫色冲击波往外扩（跳起来躲）
CA.necrowave = {
  start: function (e) { e.st = 0.65; e.ak = 0; e.at = 0; FX.ring(e.x, e.y, e.z, 3.5, 0xb05aff, 0.65); Content.atk(e, 'necrowave'); Content.hint('wave', '冲击波贴着地：跳起来躲', '#c8f0ff'); },
  update: function (e, dt) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    e.at += dt;
    var n = e.phase2 ? 4 : 3, gap = e.phase2 ? 0.6 : 0.75;
    while (e.ak < n && e.at >= e.ak * gap) {
      e.ak++;
      Content.wave(e.x, W.groundAt(e.x, e.z, e.y + 1), e.z, 11, 26, e.dmg * 1.1, 0xc070ff, 2.4 * e.scale * 0.8);
      Game.shake(0.25);
    }
    if (e.ak >= n && e.at > n * gap + 0.6) Content.done(e, 2.4, 3.4);
  }
};
// 墓手合围（第二阶段）：玩家周围一圈骨手钻出来往里收，留一个缺口（也能跳过去）
CA.gravehands = {
  start: function (e) { e.st = 0.4; e.ak = 0; Content.atk(e, 'gravehands'); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 3.6;
      Content.handRing(P.pos.x, P.pos.z, 8.5, 2.2, 22, randi(0, 21), 3, 0.9, 2.6, e.dmg);
      return;
    }
    Content.done(e, 2.2, 3.4);
  }
};

// ---- 小 Boss ----
// 投石（现在没有首领用）：抓起三块大石头扔过来
CA.boulder = {
  start: function (e) { e.st = 0.7; e.ak = 0; Content.atk(e, 'boulder'); },
  update: function (e, dt, nx, nz) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 1.4;
      var t = Content.lead(0.35, 4, Content._ld), base = Math.atan2(t[1] - e.z, t[0] - e.x), d = Math.sqrt(dist2(t[0], t[1], e.x, e.z));
      for (var i = -1; i <= 1; i++) {
        var a = base + i * 0.35, r = i ? d * 0.9 : d;
        Content.lob('rock', e.x, e.y + 3.5 * e.scale, e.z, e.x + Math.cos(a) * r, e.z + Math.sin(a) * r, 1.0 + Math.abs(i) * 0.15, { r: 2.8, dmg: e.dmg * 1.2, H: 6, boom: 0x9a968c, trail: 0x6a6660, s: 1.2 });
      }
      return;
    }
    Content.done(e, 2.5, 3.5);
  }
};
// 泰山压顶（绿衣巨骑的跃马重击、守墓黑犬的扑咬）：蹲下，跳起来砸向玩家的位置（落点先亮），落地一圈冲击波
CA.bellyflop = {
  start: function (e) {
    e.st = 0.55; e.ak = 0; var t = Content.lead(0.3, 3, Content._ld); e.tx = t[0]; e.tz = t[1]; e.ty = W.groundAt(e.tx, e.tz, P.pos.y + 1); Content.atk(e, 'bellyflop');
    Content.hint('flop', '跑出红圈，落地时跳起来', '#ffb070');
  },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    Content.decal(e.tx, e.ty, e.tz, 5, 0xff3a2a, e.ak ? 0.45 : 0.22, 1, 1);
    if (e.ak === 0) {
      if (e.st > 0) return;
      var T = 1.0;
      e.vy = 13 + (e.ty - e.y) / T; e.grounded = false;
      e.leapX = (e.tx - e.x) / T; e.leapZ = (e.tz - e.z) / T;
      e.ak = 1; e.st = 2.5;
      return;
    }
    if (e.grounded && e.st < 2.35) {
      FX.boom(e.x, e.y + 0.5, e.z, 5, 0xffb070);
      // 落地 1 倍 + 冲击波 0.5 倍：合起来和老招式「砸地」（1.5 倍）一样重
      if (P.alive && dist2(P.pos.x, P.pos.z, e.x, e.z) < 25 && Content.playerLow(1.2)) P.hurt(e.dmg, null);
      Content.wave(e.x, e.y, e.z, 13, 10, e.dmg * 0.5, 0xffb070, 2);
      Game.shake(0.5);
      Content.sfx('bossLand', e.x, e.y, e.z, e);
      Content.done(e, 2.4, 3.4);
    } else if (e.st <= 0) Content.done(e, 2.4, 3.4);
  }
};
// 裂地冲击（沙漏王、沙虫女王）：三条沙刺扇形冲向玩家
CA.quakeline = {
  start: function (e) { e.st = 0.6; e.ak = 0; Content.atk(e, 'quakeline'); },
  update: function (e, dt, nx, nz) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 1.5;
      var base = Math.atan2(nx, nz);
      for (var l = -1; l <= 1; l++) {
        var a = base + l * 0.42;
        for (var s = 1; s <= 8; s++) { var dd = 1.5 + s * 2.3; Content.strike('sand', e.x + Math.sin(a) * dd, e.z + Math.cos(a) * dd, 1.25, 0.55 + s * 0.08, e.dmg * 1.1, e.y); }
      }
      return;
    }
    Content.done(e, 2.4, 3.4);
  }
};
// 毒液喷射（毒伞菇王：zone 'spore' 落地变孢子云）：五团毒液落地，留下一片片毒水（def.zone 换地面效果，默认毒水）
CA.acidrain = {
  start: function (e) { e.st = 0.55; e.ak = 0; Content.atk(e, 'acidrain'); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    if (e.ak === 0) {
      e.ak = 1; e.st = 1.6;
      var t = Content.lead(0.4, 4, Content._ld), zk = e.def.zone || 'poison', sp = zk === 'spore';
      for (var i = 0; i < 5; i++) {
        var a = Math.random() * TAU, r = i ? rand(2.5, 6.5) : 0;
        Content.lob('acid', e.x, e.y + 2.2 * e.scale, e.z, t[0] + Math.cos(a) * r, t[1] + Math.sin(a) * r, 1.0 + i * 0.08, { r: 2.0, dmg: e.dmg, H: 5,
          boom: sp ? 0x5affc0 : 0x8aff4a, trail: sp ? 0x7affd8 : 0x7dff4a, glow: sp ? Content.C.teal : Content.C.green, tele: 0xff4a2a,
          zone: [zk, 2.4, 4.5, { dps: e.dmg * (sp ? 0.2 : 0.35) }] });
      }
      return;
    }
    Content.done(e, 2.6, 3.6);
  }
};
// 幽魂冠军·穿墙突袭：消失，在玩家身后亮起鬼影，然后现身冲过来
CA.phasedash = {
  start: function (e) { e.st = 0.35; e.ak = 0; Content.atk(e, 'phasedash'); },
  update: function (e, dt) {
    e.vx = 0; e.vz = 0;
    if (e.ak === 0) {
      if (e.st > 0) return;
      var dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.sqrt(dx * dx + dz * dz) || 1;
      e.ax = P.pos.x + dx / d * 6; e.az = P.pos.z + dz / d * 6;
      e.ak = 1; e.st = 0.75;
      FX.burst(e.x, e.y + 1, e.z, 16, 0xb8d8ff, 6, 0.3);
      return;
    }
    if (e.ak === 1) {
      var ay = W.groundAt(e.ax, e.az, P.pos.y + 2);
      Content.decal(e.ax, ay, e.az, 2.4, 0x9ab8ff, 0.25 + 0.3 * (1 - e.st / 0.75), 1, 0);
      if (e.st > 0) return;
      e.x = e.ax; e.z = e.az; e.y = ay + 1.6;
      FX.burst(e.x, e.y, e.z, 18, 0xb8d8ff, 6, 0.3);
      e.ak = 2; e.st = 0.35;
      return;
    }
    if (e.ak === 2) {
      if (e.st > 0) return;
      var nx2 = P.pos.x - e.x, nz2 = P.pos.z - e.z, l = Math.sqrt(nx2 * nx2 + nz2 * nz2) || 1;
      e.dx = nx2 / l; e.dz = nz2 / l; e.ak = 3; e.st = 0.7;
      Content.sfx('boss_phasedash_go', e.x, e.y, e.z, e);
      return;
    }
    e.vx = e.dx * 17; e.vz = e.dz * 17;
    if (e.st <= 0) Content.done(e, 2.4, 3.4);
  }
};
// 瞬移的第一段藏起来；模型自己的 look（披风冒烟，models_bosses.js）接着跑
var ghostLook0 = ENEMIES.ghostchamp.look; ENEMIES.ghostchamp.look = function (e, L, dt) { if (ghostLook0) ghostLook0(e, L, dt); if (e.state === 'phasedash' && e.ak === 1) L.hide = true; };
// 扫射光束（现在没有首领用）：先亮一道细红线，然后紫色光束横扫 120°（跳起来躲）
CA.sweepbeam = {
  start: function (e, nx, nz) {
    e.st = 0.75; e.ak = 0; e.at = 0;
    e.bs = Math.random() < 0.5 ? 1 : -1;
    e.ba = Math.atan2(nx, nz) - e.bs * 1.05;
    Content.atk(e, 'sweepbeam');
  },
  update: function (e, dt) {
    e.vx = 0; e.vz = 0;
    if (!e.beam) e.beam = Content.takeBeam(e);
    // 光束池用完了（同时扫射的太多）：这次不扫，不能有看不见却会伤人的光束
    if (!e.beam && Content.beamPool) { Content.done(e, 1.2, 2); return; }
    var a = e.ba, firing = e.st <= 0;
    if (firing) { e.at += dt; a = e.ba + e.bs * 2.1 * Math.min(1, e.at / 1.5); }
    if (e.beam) {
      var m = e.beam.mesh;
      m.visible = true;
      m.position.set(e.x, e.y + 1.0, e.z);
      m.rotation.set(0, a, 0);
      m.scale.set(firing ? 1.4 : 0.25, firing ? 1.4 : 0.25, 1);
      m.material.opacity = firing ? 0.9 : 0.45;
      m.material.color.setHex(firing ? 0xc070ff : 0xff3a3a);
    }
    if (firing && P.alive && (e.bcd || 0) <= Content.time) {
      var dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.sqrt(dx * dx + dz * dz);
      if (d < 20.5 && P.pos.y - e.y < 1.4) {
        var diff = Math.abs(Content.angDiff(Math.atan2(dx, dz), a));
        if (Math.sin(diff) * d < 0.9 && Math.cos(diff) > 0) { P.hurt(e.dmg, null); e.bcd = Content.time + 0.5; }
      }
    }
    if (firing && e.at >= 1.5) { Content.dropBeam(e); Content.done(e, 2.4, 3.4); }
  }
};
Content.takeBeam = function (e) {
  Content.gfxInit();
  if (!Content.beamPool) return null;
  var b = null;
  for (var i = 0; i < Content.beamPool.length; i++) if (!Content.beamPool[i].used) { b = Content.beamPool[i]; break; }
  if (!b) b = Content.makeBeam();
  if (!b) return null;
  b.used = true; b.owner = e; Content.beams.push(b);
  return b;
};
Content.dropBeam = function (e) {
  var b = e.beam;
  if (!b) return;
  b.used = false; b.owner = null; b.mesh.visible = false;
  var i = Content.beams.indexOf(b);
  if (i >= 0) Content.beams.splice(i, 1);
  e.beam = null;
};

// ---- 宝箱怪（事件）：一跳一跳地扑过来（落点先亮），落地震一下；还会吐出一扇形的红球 ----
CA.mimicHop = {
  start: function (e) { e.st = 0.45; e.ak = 0; var t = Content.lead(0.3, 3, Content._ld); e.tx = t[0]; e.tz = t[1]; e.ty = W.groundAt(e.tx, e.tz, P.pos.y + 1); },
  update: function (e) {
    e.vx = 0; e.vz = 0;
    Content.decal(e.tx, e.ty, e.tz, 3.2, 0xff3a2a, e.ak ? 0.42 : 0.2, 1, 1);
    if (e.ak === 0) {
      if (e.st > 0) return;
      var T = 0.8;
      e.vy = 10.4 + (e.ty - e.y) / T; e.grounded = false;
      e.leapX = (e.tx - e.x) / T; e.leapZ = (e.tz - e.z) / T;
      e.ak = 1; e.st = 2;
      Content.sfx('mimicHop', e.x, e.y, e.z, e);
      return;
    }
    if (e.grounded && e.st < 1.85) {
      FX.boom(e.x, e.y + 0.3, e.z, 3.2, 0xffc94a);
      if (P.alive && dist2(P.pos.x, P.pos.z, e.x, e.z) < 3.4 * 3.4 && Content.playerLow(1.2)) P.hurt(e.dmg, null);
      Game.shake(0.3);
      e.state = 'chase'; e.st = rand(0.5, 1.0); e.ak = 0;
    } else if (e.st <= 0) { e.state = 'chase'; e.st = 1; e.ak = 0; }
  }
};
CA.mimicSpit = {
  start: function (e) { e.st = 0.5; e.ak = 0; },
  update: function (e, dt, nx, nz) {
    e.vx = 0; e.vz = 0;
    if (e.st > 0) return;
    var base = Math.atan2(nx, nz), sy = e.y + 1.1;
    for (var k = -3; k <= 3; k++) {
      var a = base + k * 0.2;
      Content.shot(e.x + Math.sin(a), sy, e.z + Math.cos(a), Math.sin(a) * 10, (P.pos.y + 1 - sy) * 0.6, Math.cos(a) * 10, e.dmg * 0.55);
    }
    Content.sfx('mimicSpit', e.x, e.y, e.z, e);
    e.state = 'chase'; e.st = rand(1.4, 2.2); e.ak = 0;
  }
};

// 敌方子弹（和 Enemies.shoot 同一个列表、同一种红球）：从任意位置、按任意速度发射
Content.shot = function (x, y, z, vx, vy, vz, dmg) {
  var s = Enemies.shots;
  if (s.length > 290) s.shift();
  s.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, dmg: dmg, life: 6 });
};

// 各首领 / 小 Boss 的招式表在 data_enemies*.js 的行里

// ---------------- 关卡 Boss 第二阶段（血量降到一半）：变色、变大一点、冒火星，招式换一套、出招更快 ----------------
// 公告是红色的燕尾横幅：小标签「第二阶段」+ title（「Boss + 状态」）+ sub（第二阶段的变化和新招式）
Content.PHASE2 = {
  oakking: { attacks: ['rootgrid', 'seedbomb', 'leafstorm', 'summon', 'leafstorm', 'slam'], tint: [1.6, 0.66, 0.42], ember: 0xff8a2a, title: '千年橡王发怒了！', sub: '树冠烧成了秋天的颜色 · 新招式：落叶旋风' },
  hourglass: { attacks: ['sunbeam', 'sandwall', 'quicksand', 'quakeline', 'sunbeam', 'orbs'], tint: [1.4, 1.18, 0.6], ember: 0xffd27a, title: '沙漏王倒过来了！', sub: '沙子开始倒着流 · 新招式：流沙漩涡 · 沙墙推两排' },
  sunkenbell: { attacks: ['bonerain', 'necrowave', 'gravehands', 'summon', 'necrowave', 'slam'], tint: [1.1, 0.92, 0.9], ember: 0xc070ff, title: '沉钟自己响了！', sub: '钟声一圈比一圈响 · 新招式：墓手合围' }
};
Content.bossPhase2 = function (e) {
  e.phase2 = true;
  var cfg = Content.PHASE2[e.def.id];
  if (!cfg) return;
  e.attacks = cfg.attacks;
  e.tint = new THREE.Color(cfg.tint[0], cfg.tint[1], cfg.tint[2]);
  e.scale *= 1.1;
  if (e.state === 'chase') e.st = Math.min(e.st, 0.6);
  FX.ring(e.x, e.y, e.z, 9, cfg.ember, 0.6);
  FX.burst(e.x, e.y + 3, e.z, 30, cfg.ember, 10, 0.45);
  Game.shake(0.7);
  Content.announce({ look: 'rib', size: 'm', role: 'red', icon: 'flame', tab: '第二阶段', title: cfg.title, sub: cfg.sub, life: 2.8, prio: 3 });
  Content.sfx('bossPhase2', e.x, e.y, e.z, e);
  Content.emit('bossPhase', e, 2);
};
Content.updateBigs = function (dt) {
  var L = Content.bigs;
  for (var i = L.length - 1; i >= 0; i--) {
    var e = L[i];
    if (!e.alive) { Content.dropBeam(e); L.splice(i, 1); continue; }
    if (e.beam && e.state !== 'sweepbeam') Content.dropBeam(e);
    // 举盾的小 Boss（蜥人督军）：盾牌慢慢转向玩家，冲锋时朝冲锋方向（Weapons.hit 按 faceA 挡正面的飞弹）
    if (e.def.shield) {
      var want = e.state === 'charge' && e.st <= 0 ? Math.atan2(e.dx, e.dz) : Math.atan2(P.pos.x - e.x, P.pos.z - e.z);
      if (e.faceA === undefined) e.faceA = want;
      e.faceA += clamp(Content.angDiff(want, e.faceA), -1.6 * dt, 1.6 * dt);
    }
    if (!e.phase2) continue;
    // 第二阶段：追击时冷却走得快一点，身上一直冒火星
    if (e.state === 'chase') e.st -= dt * 0.3;
    var cfg = Content.PHASE2[e.def.id];
    if (cfg && Math.random() < dt * 14) FX.part(e.x + rand(-1.5, 1.5) * e.scale, e.y + rand(1, 4) * e.scale, e.z + rand(-1.5, 1.5) * e.scale, rand(-0.5, 0.5), rand(1.5, 3), rand(-0.5, 0.5), cfg.ember, rand(0.15, 0.3), rand(0.6, 1.1), -2);
  }
};

// ============================================================
//  接入：只包装，不改原来的函数
// ============================================================
(function () {
  // 刷怪：同时最多几只（墓碑），狼成群出现，记下刷怪倍率（分裂时给小的用），Boss / 小 Boss 记下来（第二阶段、光束）
  var spawn0 = Enemies.spawn;
  Enemies.spawn = function (id, x, z, opts) {
    var def = ENEMIES[id];
    if (def && def.limit && def.alt && Content.countOf(def) >= def.limit) { id = def.alt; def = ENEMIES[id]; }
    var e = spawn0.call(this, id, x, z, opts);
    e.hpm = (opts && opts.hpMult) || 1; e.dmm = (opts && opts.dmgMult) || 1;
    if (def.boss || def.miniboss) Content.bigs.push(e);
    if (def.pack > 1 && !(opts && (opts.elite || opts.drop || opts.solo)) && Content.countOf(def) < 12) {
      var pk = Content.newPack();
      pk.m.push(e); e.pk = pk;
      for (var k = 1; k < def.pack; k++) {
        if (Enemies.list.length >= Enemies.MAX - 5) break;
        var m = Enemies.spawn(id, x + rand(-2.5, 2.5), z + rand(-2.5, 2.5), { hpMult: e.hpm, dmgMult: e.dmm, speedMult: opts && opts.speedMult, solo: true });
        m.pk = pk; pk.m.push(m);
      }
    }
    return e;
  };
  // 死亡：分裂、孢子云、鼓手的连线断开、事件敌人的奖励
  var kill0 = Enemies.kill;
  Enemies.kill = function (e) {
    var r = kill0.apply(this, arguments);
    var def = e.def;
    if (def.split && !e.splitDone) Content.split(e);
    if (def.behavior === 'spore') Content.sporeCloud(e.x, e.z, e.scale * 1.1, e.y);
    if (e.buffT > 0) e.buffT = 0;
    Content.emit('kill', e);
    return r;
  };
  // 受伤：钻在地下打不到；关卡 Boss 掉到一半血进第二阶段；金袋哥布林挨打掉金币
  var dmg0 = Enemies.damage;
  Enemies.damage = function (e, d) {
    if (e.under) return 0;
    var r = dmg0.apply(this, arguments);
    if (r > 0) {
      if (e.boss && !e.phase2 && e.alive && e.hp <= e.maxHp * 0.5) Content.bossPhase2(e);
      if (e.def.goldbag && Game.time - (e.coinT || -9) > 0.25) { e.coinT = Game.time; Pickups.gold(e.x, e.y + 1, e.z, Math.ceil(2 * Game.stage * P.st.goldGain)); }
    }
    return r;
  };
  // 每帧：敌人更新完以后处理钻地、狼群、鼓手连线、各种地面效果、Boss 第二阶段（只在游戏进行中调用）
  var upd0 = Enemies.update;
  Enemies.update = function (dt) {
    var r = upd0.apply(this, arguments);
    Content.update(dt || 0);
    return r;
  };
  // 换关 / 清场
  var clr0 = Enemies.clear;
  Enemies.clear = function () {
    var r = clr0.apply(this, arguments);
    Content.clearEnemies();
    return r;
  };
  // 盾牌：飞弹从正面（盾牌朝向 ±63° 以内）打过来就挡掉；爆炸、光环、闪电这些范围伤害照常
  var proj0 = Weapons.updateProjs;
  Weapons.updateProjs = function () {
    Content.inProj = true;
    try { return proj0.apply(this, arguments); } finally { Content.inProj = false; }
  };
  var ex0 = Weapons.explode;
  Weapons.explode = function () {
    var was = Content.inProj;
    Content.inProj = false;
    try { return ex0.apply(this, arguments); } finally { Content.inProj = was; }
  };
  var hit0 = Weapons.hit;
  Weapons.hit = function (w, e, mult, kx, kz) {
    if (Content.inProj && e.def.shield && e.alive && e.faceA !== undefined && (kx || kz)) {
      if (kx * Math.sin(e.faceA) + kz * Math.cos(e.faceA) < -0.45) { Content.blockFx(e); return 0; }
    }
    return hit0.apply(this, arguments);
  };
  // 减速（孢子云、荆棘、毒水、流沙）
  var sm0 = Passive.speedMult;
  Passive.speedMult = function () { return sm0.apply(this, arguments) * (Content.slowT > 0 ? Content.slowK : 1); };
  // 每帧末尾提交实例网格
  var fe0 = FX.updateEffects;
  FX.updateEffects = function () { Content.commit(); return fe0.apply(this, arguments); };
  // 小地图上的事件和秘密标记
  var dm0 = UI.drawMinimap;
  UI.drawMinimap = function (force) {
    var r = dm0.apply(this, arguments);
    if (UI.mm && (UI.mmT % 3 === 1 || force === true) && Game.state !== 'menu') Content.drawMinimap();
    return r;
  };
})();

// 这些在后面的文件里（main.js 的 Game）：页面加载完再包装（比 Game.init 先执行）
Content.lateInstall = function () {
  if (Content.lateDone || typeof Game === 'undefined' || !Game.buildStage) return;
  Content.lateDone = true;
  var bs0 = Game.buildStage;
  Game.buildStage = function () { Content.clearStage(); return bs0.apply(this, arguments); };
  var st0 = Game.start;
  Game.start = function () { Content.hinted = {}; Content.secretsFound = 0; return st0.apply(this, arguments); };
  var tm0 = Game.toMenu;
  Game.toMenu = function () { Content.clearBanners(); return tm0.apply(this, arguments); };
  // HUD 增益栏（interact_more.js）：被减速时显示一个小面板
  if (typeof MX !== 'undefined' && MX.buffList) {
    var bl0 = MX.buffList;
    MX.buffList = function () {
      var l = bl0.apply(this, arguments);
      if (Content.slowT > 0 && Content.slowName) l.push({ icon: '慢', name: Content.slowName, t: Math.max(0.5, Content.slowLeft || 0), max: 6, color: '#5affc0' });
      return l;
    };
  }
  Content.emit('install');
};
window.addEventListener('load', function () { Content.lateInstall(); });

// ---------------- 每帧 ----------------
Content.update = function (dt) {
  Content.time += dt;
  Content.gfxInit();
  Content.processPending();
  Content.updateUnder(dt);
  Content.updatePacks(dt);
  Content.updateBuffs(dt);
  Content.updateStrikes(dt);
  Content.updateLobs(dt);
  Content.updateWaves(dt);
  Content.updateZones(dt);
  Content.updateMarks(dt);
  Content.updateRings(dt);
  Content.updateBigs(dt);
  if (Content.hooks.update) Content.emit('update', dt);
};

// 敌人清场（Enemies.clear）：地下的蠕虫、狼群、强化、Boss 光束一起清掉
Content.clearEnemies = function () {
  Content.under.length = 0; Content.pending.length = 0; Content.packs.length = 0; Content.buffed.length = 0; Content.bigs.length = 0;
  for (var i = 0; i < Content.beams.length; i++) { Content.beams[i].used = false; Content.beams[i].owner = null; Content.beams[i].mesh.visible = false; }
  Content.beams.length = 0;
};
// 换关 / 重开 / 回主菜单：所有攻击和地面效果清掉，实例网格清零（网格本身留着下一关用）
Content.clearStage = function () {
  Content.clearEnemies();
  Content.strikes.length = 0; Content.lobs.length = 0; Content.zones.length = 0; Content.marks.length = 0; Content.rings.length = 0;
  for (var i = 0; i < Content.waves.length; i++) if (Content.waves[i].p) { Content.waves[i].p.used = false; Content.waves[i].p.mesh.visible = false; }
  Content.waves.length = 0;
  Content.slowT = 0; Content.slowK = 1; Content.slowName = '';
  Content.mm.length = 0; Content.mmRing = null;
  Content.decalN = 0; Content.linkN = 0;
  if (Content.gfxDone) Content.commit();
  Content.clearBanners();
  Content.emit('clear');
};

// ============================================================
//  给其他系统用的接口（成就、音效、统计）
//  Content.onSecretFound(fn)  fn({ id, name, stage, x, z })                发现秘密地点
//  Content.onEvent(fn)        fn({ type, name, phase, result, stage, x, z }) 随机事件开始 / 结束
//  Content.onBossPhase(fn)    fn(boss, 2)                                  关卡 Boss 进入第二阶段
//  Content.onSpecial(fn)      fn(key, x, y, z, enemy)                      敌人 / Boss 的特殊动作（音效）
//  Content.on('kill', fn)     fn(enemy)                                    每次击杀（新敌人 id 见 data_enemies_more.js）
//  Content.on('clear', fn) / Content.on('update', fn)                      换关清场 / 每帧（content_map.js 用）
// ============================================================
