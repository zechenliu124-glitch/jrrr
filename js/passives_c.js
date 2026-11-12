'use strict';
// ============================================================
//  骑士被动 · c 部分（第 5 块）：守墓骑士、信使骑士、小丑骑士、擎旗骑士、园丁骑士、提灯骑士、攻城骑士
//  写法按 C5_WORK §1 的约定：每位骑士一个 Passive.def(id, spec)，核心（passives.js）只把钩子分给当前骑士。
//  数值只从 spec.num 拿（和 tables.json 的 passive.numbers 一模一样，测试会比）；
//  要跟着「继续上一局」存下来的状态是 Passive 上的数字（graN、couCd、jesN、banCd、lamK、engCd……），
//  世界里的东西（信、军旗、花、灯圈、小弩车）放在闭包里：模型只建一次、反复用，clear() 里藏起来。
//  面积查询都跳过道具（e.prop）；不画新贴图、不碰共用的 TEX.r；不加碰撞（MX.collide）。
// ============================================================

(function () {
  // ---------------- 小工具 ----------------
  var emit = function (name, x, z) { if (Passive.emit) Passive.emit(name, x != null ? x : P.pos.x, z != null ? z : P.pos.z); };   // 声音事件（a 部分接 audio_hooks）
  var toast = function (text, role) { if (typeof UI !== 'undefined' && UI.toast) UI.toast(text, Kit.color(role)); };
  var secs = function (t) { return (t > 0 ? Math.max(1, Math.ceil(t - 1e-6)) : 0) + ' 秒'; };   // 还在倒数就不显示 0 秒（HUD 的秒写「秒」，D-C13-1）
  // 普通敌人：不是 Boss、小 Boss、精英，也不是道具
  var normal = function (e) { return !!e && e.alive && !e.prop && !e.boss && !e.mini && !e.elite; };
  // 把一个模型挂回场景（换关不会清场景，保险起见每次用之前看一下）
  var attach = function (m) { if (m && Game.scene && m.parent !== Game.scene) Game.scene.add(m); };
  var hide = function (m) { if (m) m.visible = false; };

  // ---------------- 互动物体的真实占地（弩车、军旗、急件都要躲开） ----------------
  // 模型（o.mesh、o.parts、o.swirl，连贴地的范围圈一起；不算叠加发光的光柱、光墙）的每个三角形按 0.25 米撒点，按 0.25 米的格子去重，
  // 存成世界坐标的 (x, z) 表，缓存在物体上；物体挪了（滚石）、零件变了（用过、点燃）就重算。会转的木人手臂按 12 个角度都算上
  var FP_CELL = 0.25, FP_FAR = 12;          // 最大的占地（战旗据点圈边的界石）不到 8 米：中心远过 12 米 + 间距的不用算
  var fpA = null, fpB = null, fpC = null, fpM = null;
  var fpSkip = function (m) { var t = m.material; return !t || t.blending === THREE.AdditiveBlending; };
  var fpKey = function (o) { return (o.used ? 1 : 0) + ':' + (o.parts ? o.parts.length : 0) + ':' + (o.mesh && o.mesh.parent ? 1 : 0) + ':' + (o.lit ? 1 : 0); };
  var footprint = function (o) {
    var F = o._p5fp, key = fpKey(o);
    if (F && F.key === key && Math.abs(F.x - o.x) < 0.05 && Math.abs(F.z - o.z) < 0.05 && (!o.mesh || o.mesh.position.distanceToSquared(F.at) < 0.0025)) return F;
    if (!fpA) { fpA = new THREE.Vector3(); fpB = new THREE.Vector3(); fpC = new THREE.Vector3(); fpM = new THREE.Matrix4(); }
    var seen = new Set(), pts = [], R = 0, cx = o.x, cz = o.z;
    var put = function (x, z) {
      var k = Math.round((x - cx) / FP_CELL + 2048) * 4096 + Math.round((z - cz) / FP_CELL + 2048);   // 格子编号（物体中心 ±512 米以内）
      if (seen.has(k)) return;
      seen.add(k); pts.push(x, z);
      var d = (x - cx) * (x - cx) + (z - cz) * (z - cz); if (d > R) R = d;
    };
    var spin = o.arm && o.arm.isObject3D ? o.arm : null;
    var addMesh = function (m, turns) {
      var g = m.geometry, pos = g && g.attributes.position;
      if (!pos || fpSkip(m)) return;
      var idx = g.index, n = idx ? idx.count : pos.count;
      for (var a = 0; a < turns; a++) {
        fpM.copy(m.matrixWorld);
        if (turns > 1) { var c = Math.cos(a / turns * TAU), sn = Math.sin(a / turns * TAU), e = new THREE.Matrix4(); e.set(c, 0, sn, cx - c * cx - sn * cz, 0, 1, 0, 0, -sn, 0, c, cz + sn * cx - c * cz, 0, 0, 0, 1); fpM.premultiply(e); }
        for (var t = 0; t + 2 < n; t += 3) {
          fpA.fromBufferAttribute(pos, idx ? idx.getX(t) : t).applyMatrix4(fpM);
          fpB.fromBufferAttribute(pos, idx ? idx.getX(t + 1) : t + 1).applyMatrix4(fpM);
          fpC.fromBufferAttribute(pos, idx ? idx.getX(t + 2) : t + 2).applyMatrix4(fpM);
          var L = Math.max(Math.hypot(fpB.x - fpA.x, fpB.z - fpA.z), Math.hypot(fpC.x - fpA.x, fpC.z - fpA.z), Math.hypot(fpC.x - fpB.x, fpC.z - fpB.z));
          var k = Math.min(40, Math.max(1, Math.ceil(L / FP_CELL)));
          for (var i = 0; i <= k; i++) for (var j = 0; i + j <= k; j++) {
            var u = i / k, w = j / k;
            put(fpA.x + (fpB.x - fpA.x) * u + (fpC.x - fpA.x) * w, fpA.z + (fpB.z - fpA.z) * u + (fpC.z - fpA.z) * w);
          }
        }
      }
    };
    var inSpin = function (m) { for (var q = m; q; q = q.parent) if (q === spin) return true; return false; };
    [o.mesh, o.swirl].concat(o.parts || []).forEach(function (root) {
      if (!root || !root.parent || !root.isObject3D) return;
      root.updateMatrixWorld(true);
      root.traverse(function (m) { if (m.isMesh && !m.isInstancedMesh) addMesh(m, spin && inSpin(m) ? 12 : 1); });
    });
    F = o._p5fp = { key: key, x: o.x, z: o.z, at: o.mesh ? o.mesh.position.clone() : null, R: Math.sqrt(R), pts: new Float32Array(pts) };
    return F;
  };
  // 互动物体的模型离 (x, z) 最近的那一点有多远（最多算到 cap；只看还在场上的；急件自己不算）
  var interDist = function (x, z, cap) {
    var list = Interact.list, i, j, o, F, dx, dz, d2 = cap * cap, q, P2;
    for (i = 0; i < list.length; i++) {
      o = list[i];
      if (o.kind === 'letter' || !o.mesh && !(o.parts && o.parts.length)) continue;
      if (o.used && !(o.mesh && o.mesh.parent)) continue;                              // 已经收掉模型的（打碎的罐子、开过的箱子）
      dx = x - o.x; dz = z - o.z;
      if (dx * dx + dz * dz > (FP_FAR + cap) * (FP_FAR + cap)) continue;
      F = footprint(o);
      if (dx * dx + dz * dz > (F.R + cap) * (F.R + cap)) continue;
      P2 = F.pts;
      for (j = 0; j < P2.length; j += 2) { dx = x - P2[j]; dz = z - P2[j + 1]; q = dx * dx + dz * dz; if (q < d2) d2 = q; }
    }
    return Math.sqrt(d2);
  };
  // 互动物体离 (x, z) 最近的那一点比 r 远
  var interClear = function (x, z, r) { return interDist(x, z, r) >= r - 1e-9; };
  // 树和石头（圆形碰撞体）：模型的半径（W.visR 量的，石头可以比碰撞圈大 1.5 倍）+ r 以内有没有（站在石头顶上也不行：模型比顶面高）；
  // cr：高的东西（4 米的军旗）还要离树冠（树离地 4 米以内的半径 o.can）cr 米
  var propClear = function (x, z, r, cr) {
    var L = W.circles, i, o, rr;
    for (i = 0; i < L.length; i++) {
      o = L[i];
      rr = Math.max(o.r, o.vis || 0) + r;
      if (cr && o.can) rr = Math.max(rr, o.can + cr);
      if (Math.abs(x - o.x) < rr && Math.abs(z - o.z) < rr && dist2(x, z, o.x, o.z) < rr * rr) return false;
    }
    L = W.visExtra ? W.visExtra.circles : NO_VIS;                    // 第 3 关墙脚的碎石
    for (i = 0; i < L.length; i++) { o = L[i]; rr = o.r + r; if (Math.abs(x - o.x) < rr && Math.abs(z - o.z) < rr && dist2(x, z, o.x, o.z) < rr * rr) return false; }
    return true;
  };
  // 第 10 块第 3 关只有外观的占地（W.visExtra.boxes：城墙连勒脚和垛口、钟楼连壁柱和顶上的残墩、倒在地上的钟亭连屋顶）：
  // 都按盒子躲开、不能站上去（倒下的钟亭下面只垫了一块 2.2 米高的碰撞体，站在那上面是在壳子里）
  var NO_VIS = [];
  var visBoxes = function () { return W.visExtra ? W.visExtra.boxes : NO_VIS; };
  var visHit = function (x, z, m) {
    var L = visBoxes(), i, o;
    for (i = 0; i < L.length; i++) { o = L[i]; if (x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m) return true; }
    return false;
  };

  // ============================================================
  //  守墓骑士 · 安魂：对亡灵伤害 +30%；每打倒 25 个敌人（亡灵算 2 个）回 6% 最大生命
  //  亡灵标记 e.def.undead 是第 8 块加的（之前没有亡灵：×1、每个算 1）
  // ============================================================
  var grave = {
    num: { undeadDmg: 0.3, killsPer: 25, undeadWeight: 2, heal: 0.06 },
    reset: function () { Passive.graN = 0; },
    dmgMult: function (e) { return e && e.def && e.def.undead ? 1 + grave.num.undeadDmg : 1; },
    onKill: function (e) {
      var n = grave.num;
      if (!e || e.prop) return;
      Passive.graN = (Passive.graN || 0) + (e.def && e.def.undead ? n.undeadWeight : 1);
      while (Passive.graN >= n.killsPer) {
        Passive.graN -= n.killsPer;
        P.heal(n.heal * P.st.maxHp);
        FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '安魂', '#c8e8ff', 1.1);
        emit('grave');
      }
    },
    hud: function () { return '安魂 ' + Math.floor(Passive.graN || 0) + '/' + grave.num.killsPer; },
    card: function (ctx) { return { pct: Math.round(grave.num.undeadDmg * 100), every: grave.num.killsPer }; }
  };
  Passive.def('gravekeeper', grave);

  // ============================================================
  //  信使骑士 · 急件：每 45 秒在 40~70 米外放一封急件（金色信封 + 光柱，小地图上金色呼吸的小信封）；
  //  30 秒内跑到 3 米内：(20 + 3×等级)×金币获取 金币、这一级 40% 的经验、10 秒移速 +25%
  //  （武器栏 +1 / 纹章栏 −1 在 CHARACTERS 的 stats 里）
  // ============================================================
  var letter = null;            // 地图上这一封（Interact 物体）
  var letterG = null;           // 信封 + 光柱：整局只建一次，每封信重复用
  var LETTER_RETRY = 1;         // 找不到 40 米外的空地：1 秒后再找
  var LETTER_CLEAR = 1.5;       // 离互动物体的模型、树、石头至少这么远
  // 落点要在场地里、不在盒子 / 坡道上（W.randomSpot 在出生点 20 米内不查盒子，第 1、3 关那里有石台、城墙）
  var spotOk = function (s) {
    var i, o, m = 1.5;
    if (Math.abs(s.x) > W.S - 20 || Math.abs(s.z) > W.S - 20) return false;
    for (i = 0; i < W.boxes.length; i++) { o = W.boxes[i]; if (s.x > o.x0 - m && s.x < o.x1 + m && s.z > o.z0 - m && s.z < o.z1 + m) return false; }
    for (i = 0; i < W.ramps.length; i++) { o = W.ramps[i]; if (s.x > o.x0 - m && s.x < o.x1 + m && s.z > o.z0 - m && s.z < o.z1 + m) return false; }
    if (visHit(s.x, s.z, m)) return false;                            // 第 3 关城墙、钟楼、倒下的钟亭的外观
    // 行会的东西、烽火台这些没有碰撞体：按模型上最近的一点躲开 1.5 米；树和石头按模型的半径
    return interClear(s.x, s.z, LETTER_CLEAR) && propClear(s.x, s.z, LETTER_CLEAR);
  };
  // 小地图上的颜色：金色和浅金色之间慢慢呼吸（不变白：白色是骑士自己的箭头）；减弱动态效果时一直是金色
  var LET_GOLD = [255, 216, 74], LET_PALE = [255, 236, 160], letRM = false, letRMt = -1;
  var letterColor = function () {
    var t = Game.realTime || 0;
    if (!(Math.abs(t - letRMt) < 0.5)) { letRMt = t; letRM = typeof Settings !== 'undefined' && Settings.rm ? !!Settings.rm() : false; }   // 半秒问一次设置
    if (letRM) return '#ffd84a';
    var k = 0.5 - 0.5 * Math.cos(t * 4.2), c = '#';                     // 1.5 秒一呼一吸
    for (var i = 0; i < 3; i++) c += (256 + Math.round(LET_GOLD[i] + (LET_PALE[i] - LET_GOLD[i]) * k)).toString(16).slice(1);
    return c;
  };
  // 小地图标记：Content 的标记在范围外会在边上画箭头（信最远 70 米，小地图只看得到 57 米）
  var addMark = function (o) { if (typeof Content !== 'undefined' && Content.addMarker) o.mk = Content.addMarker(o, letterColor(), 'envelope', 5, true); };
  var dropMark = function (o) { if (o && o.mk) { if (Content.removeMarker) Content.removeMarker(o.mk); o.mk = null; } };
  // 小地图上只留这一封信的标记：别的（用过的、不是这一封的）都去掉，金色箭头不会指着空地
  var dropStale = function () {
    var M = typeof Content !== 'undefined' && Content.mm;
    if (!M) return;
    for (var i = M.length - 1; i >= 0; i--) {
      var m = M[i], o = m.o;
      if (o && o.kind === 'letter' && (o !== letter || o.used)) { M.splice(i, 1); if (o.mk === m) o.mk = null; }
    }
  };
  // 金色信封（一个几何体、一次绘制）：金边底板（斜面）、金奶油色纸面、两面都有 V 形封口和金色折线、下半的两条斜折痕、
  // 红火漆印（一圈压痕、中间一枚小金徽）。纸纹贴图 p5_letter（在文件末尾登记，图集满了就用 plain）
  var letterParts = function () {
    var T = MX.tile('p5_letter', 'plain'), G = 'gold', A = Math.atan2(0.37, 0.48), L = Math.hypot(0.48, 0.37), B = Math.atan2(0.27, 0.47), LB = Math.hypot(0.47, 0.27), PI = Math.PI;
    var out = [mxB(1.04, 0.7, 0.07, 0, 0, 0, 0xd09a34, G),                // 金边底板：四周露出 2 厘米（斜面一样的边）
      mxB(0.96, 0.62, 0.11, 0, 0, 0, 0xffeaa8, T)];                       // 纸面（金奶油色）
    [1, -1].forEach(function (f) {                                       // f = 1 正面（+Z），−1 背面
      var z = 0.056 * f;                                                 // 两面的形状一样（从外面看都是同一个 V），只是 z 反过来
      out.push(
        // V 形封口：三棱柱（三角形朝下），颜色比纸面深一点
        mxC(0.247, 0.247, 0.02, 3, 0, 0.187, z, 0xf4c75e, T, [PI / 2, 0, 0], [2.24, 1, 1]),
        // 封口两条金色折线（从上面两个角到中间）
        mxB(L, 0.035, 0.03, -0.24, 0.125, z * 1.15, 0xc98a2a, G, [0, 0, -A]),
        mxB(L, 0.035, 0.03, 0.24, 0.125, z * 1.15, 0xc98a2a, G, [0, 0, A]),
        // 下半两条斜折痕（从下面两个角往中间，浅一点）
        mxB(LB * 0.62, 0.022, 0.02, -0.33, -0.22, z, 0xe2b65e, G, [0, 0, B]),
        mxB(LB * 0.62, 0.022, 0.02, 0.33, -0.22, z, 0xe2b65e, G, [0, 0, -B]),
        // 火漆印：红色圆饼（压扁的圆边）+ 深红的一圈压痕 + 中间一枚小金徽（菱形，上面一颗小金点）
        mxC(0.118, 0.13, 0.04, 14, 0, -0.05, z * 1.4, 0xc0282c, 'plain', [PI / 2, 0, 0]),
        mxC(0.085, 0.085, 0.012, 14, 0, -0.05, z * 1.4 + 0.022 * f, 0x8e181e, 'plain', [PI / 2, 0, 0]),
        mxB(0.06, 0.06, 0.014, 0, -0.055, z * 1.4 + 0.03 * f, 0xf2c14e, G, [0, 0, PI / 4]),
        mxB(0.024, 0.024, 0.014, 0, 0.012, z * 1.4 + 0.03 * f, 0xf2c14e, G, [0, 0, PI / 4]));
    });
    return out;
  };
  var letterModel = function () {
    if (letterG) return letterG;
    var g = new THREE.Group();
    var env = MX.mesh(MX.geo('p_letter2', letterParts), 'lit');
    env.position.y = 1.2;
    g.add(env);
    if (!MX.mats.p_letterBeam) MX.mats.p_letterBeam = MX.additive(0xffd84a, 0.6);   // 放进 MX.mats：换关时不会被释放
    var beam = new THREE.Mesh(MX.beamGeo(), MX.mats.p_letterBeam);
    beam.scale.set(0.7, 10, 0.7);
    beam.frustumCulled = false;
    g.add(beam);
    g.userData.env = env;
    letterG = g;
    return g;
  };
  Interact.KINDS.letter = {
    noPrompt: true,
    radius: 3,
    model: function (o) { var g = letterModel(); g.visible = true; g.userData.env.rotation.set(0, 0, 0); return g; },
    label: function () { return ''; },
    canUse: function () { return false; },
    use: function () {},
    update: function (o, dt, d2, dy) {
      var env = o.mesh && o.mesh.userData.env;
      if (env) { env.position.y = 1.2 + Math.sin(Game.time * 2.5) * 0.18; env.rotation.y += dt * 1.6; }
      var r = Interact.KINDS.letter.radius;
      if (d2 < r * r && Math.abs(dy) < 3 && P.alive) courier.deliver(o);
    },
    // 小地图：金色呼吸的小信封；有 Content 标记（带边上的箭头）时由它画，这里不再画一遍
    mapIcon: function (o) { return o && o.mk ? null : { color: letterColor(), shape: 'envelope', size: 5 }; },
    clear: function () { dropMark(letter); letter = null; }
  };
  var courier = {
    num: { cd: 45, minR: 40, maxR: 70, time: 30, goldBase: 20, goldPerLv: 3, xpFrac: 0.4, speed: 0.25, speedTime: 10 },
    reset: function () { Passive.couCd = courier.num.cd; Passive.couLeft = 0; letter = null; },
    clear: function () {
      dropMark(letter);
      if (letter && !letter.used) Interact.consume(letter);
      letter = null;
      hide(letterG);
      Passive.couCd = courier.num.cd; Passive.couLeft = 0;
    },
    update: function (dt) {
      var n = courier.num;
      if (Game.state !== 'play') return;
      if (letter && letter.used) { dropMark(letter); letter = null; }   // 别处收走了（换关）
      dropStale();
      if (!letter) {
        if (Passive.couLeft > 0) { Passive.couLeft = 0; Passive.couCd = n.cd; }   // 继续游戏时信没了：当作过期
        Passive.couCd -= dt;
        if (Passive.couCd > 0) return;
        var s = W.randomSpot(n.minR, n.maxR, P.pos.x, P.pos.z);
        for (var k = 0; k < 4 && !spotOk(s); k++) s = W.randomSpot(n.minR, n.maxR, P.pos.x, P.pos.z);
        if (!spotOk(s) || dist2(s.x, s.z, P.pos.x, P.pos.z) < n.minR * n.minR) { Passive.couCd = LETTER_RETRY; return; }   // 只找到原地（备用点）或盒子上
        letter = Interact.addCustom('letter', s.x, s.z, s.y);
        addMark(letter);
        Passive.couLeft = n.time;
        toast('急件！去金色信封那里', 'gold');
        emit('letter', s.x, s.z);
        return;
      }
      if (letter.mk) letter.mk.color = letterColor();
      Passive.couLeft -= dt;
      if (Passive.couLeft <= 0) {
        var o = letter;
        dropMark(o);
        Interact.consume(o);
        letter = null;
        Passive.couLeft = 0;
        Passive.couCd = n.cd;
        toast('急件过期了', 'goldL');
        emit('letter_late', o.x, o.z);
      }
    },
    deliver: function (o) {
      var n = courier.num;
      if (o.used) return;
      var g = Math.round((n.goldBase + n.goldPerLv * P.level) * P.st.goldGain);
      P.gold += g;
      P.gainXp(n.xpFrac * P.xpNext);                                  // D-C5-7：经验获取也算
      P.addTemp('moveSpeed', n.speed, n.speedTime, 'letter');
      dropMark(o);
      Interact.consume(o);
      if (letter === o) letter = null;
      Passive.couLeft = 0;
      Passive.couCd = n.cd;
      toast('急件送到：+' + Kit.num(g) + ' 金币', 'gold');
      MX.pillar(o.x, o.y, o.z, 0xffd84a, 1.2, 8, 0.8);
      FX.burst(o.x, o.y + 1.2, o.z, 12, 0xffd84a, 5, 0.25);
      emit('letter_done', o.x, o.z);
    },
    hud: function () { return Passive.couLeft > 0 ? '急件 ' + secs(Passive.couLeft) : '下一封 ' + secs(Math.max(0, Passive.couCd)); },
    spotOk: function (s) { return spotOk(s); },                         // 测试用
    mapColor: function () { return letterColor(); },
    card: function (ctx) { return { cd: courier.num.cd, time: courier.num.time }; }
  };
  Passive.def('courier', courier);

  // ============================================================
  //  小丑骑士 · 滑稽：开始滑铲时，5 米内的普通敌人笑得晕 1 秒（每个敌人 6 秒最多一次）；
  //  每逗笑一个，下一颗杂耍球多弹 1 次（最多 5 次）
  // ============================================================
  var jesLast = 0, jesShow = 0;      // 上一次滑铲逗笑了几个、HUD 上还显示几秒
  var JES_SHOW = 3;
  var jester = {
    num: { radius: 5, stun: 1, perEnemyCd: 6, bounceMax: 5 },
    reset: function () { Passive.jesN = 0; jesLast = 0; jesShow = 0; },
    clear: function () { jesShow = 0; },
    update: function (dt) { if (jesShow > 0) jesShow = Math.max(0, jesShow - dt); },
    onSlideStart: function () {
      var n = jester.num, hit = [], now = Game.time;
      Enemies.inRadius(P.pos.x, P.pos.z, n.radius, function (e) {
        if (!normal(e) || e.jestT > now) return;
        e.jestT = now + n.perEnemyCd;
        Evo.stun(e, n.stun);
        hit.push(e);
      });
      if (!hit.length) return;
      jesLast = hit.length; jesShow = JES_SHOW;
      Passive.jesN = Math.min(n.bounceMax, (Passive.jesN || 0) + hit.length);
      for (var i = 0; i < hit.length && i < 3; i++) { var e = hit[i]; FX.text(e.x, e.y + e.r * 2 + 0.6, e.z, '哈哈！', '#ffd84a', 1); }
      emit('laugh');
    },
    onLaunch: function (w, p) {
      if (!w || w.id !== 'juggle' || !p || !(Passive.jesN > 0)) return;   // 超武「漫天花球」的 w.id 还是 juggle
      p.bounces = (p.bounces || 0) + Passive.jesN;
      Passive.jesN = 0;
    },
    // 滑铲逗笑到人以后 3 秒：「逗笑 n 个」；平时：「逗笑 待滑铲」
    hud: function () { return jesShow > 0 ? '逗笑 ' + jesLast + ' 个' : '逗笑 待滑铲'; },
    card: function (ctx) { return { r: jester.num.radius, n: ctx && ctx.inRun ? Passive.jesN || 0 : 0 }; }
  };
  Passive.def('jester', jester);

  // ============================================================
  //  擎旗骑士 · 军旗不倒：冷却 20 秒；好了以后下一次滑铲停下的地方插旗（8 秒没滑铲就插在原地）；
  //  旗插在滑过来的方向的左后方 1.2 米左右的空地上（不行就在身边 1.1~2.1 米找别的空地，不插在脚下），旗杆不穿过骑士、旗面不挡住骑士。
  //  军旗立 12 秒、半径 7 米：旗下攻速 +20%、受伤 −15%，旗下的敌人移速 −20%
  //  旗子借战旗据点的 MX 零件（骑士蓝，缩小 0.6），不加碰撞
  // ============================================================
  var flag = null;              // 插着的旗 { x, y, z }（没有 = null）
  var flagG = null, flagCloth = null;
  var inFlag = false, banPulse = 0, banSlow = 0;
  var BAN_PULSE = 1.5, BAN_SLOW = 0.25, BAN_SLOW_T = 0.35, BAN_DY = 4;
  // 插旗的落点（[右, 前]，米）：先试原来的四个——左后方（往回 0.6、往左 1 米，离骑士 1.17 米）、右后方、左 / 右 1.1 米；
  // 再试一圈 12 个方向 × 1.1 / 1.6 / 2.1 米：两边和斜后方（离骑士的前后线 ≥ 0.95 米，旗面不挡骑士）先、近的先，
  // 然后斜前方，再正前方附近（镜头里旗杆像是从骑士肩上长出来），最后才是正后方附近（在跟拍镜头和骑士之间：旗杆挡在骑士前面、旗面盖住头）。
  // 底座半径 0.75 米，规则和弩车一样（只是小一点）；旗高 4 米，还要躲开树冠（FLAG_CANOPY）
  var FLAG_TRY = [[-1, -0.6], [1, -0.6], [-1.1, 0], [1.1, 0]];
  (function () {
    var more = [], R = [1.1, 1.6, 2.1], a, k, j;
    for (a = 0; a < 12; a++) for (k = 0; k < 3; k++) {
      var t = a * Math.PI / 6, r = R[k], x = -Math.sin(t) * r, y = Math.cos(t) * r, side = Math.abs(x);   // t = 0 正前，往左转
      var cost = r + (y > 0.1 ? 1.2 : 0) + (y > 0.1 && side < 0.95 ? 0.8 + (0.95 - side) * 2 : 0) + (y < -0.1 && side < 0.95 ? 3 + (0.95 - side) * 4 : 0) + (x > 0 ? 0.01 : 0);
      more.push({ c: [+x.toFixed(3), +y.toFixed(3)], cost: cost });
    }
    more.sort(function (p, q) { return p.cost - q.cost; });
    for (j = 0; j < more.length; j++) {
      var c = more[j].c;
      if (FLAG_TRY.every(function (o) { return Math.hypot(o[0] - c[0], o[1] - c[1]) > 0.3; })) FLAG_TRY.push(c);
    }
  })();
  var FLAG_BODY = 0.75, FLAG_BOX = 0.8, FLAG_ROCK = 0.9, FLAG_REACH = 1.0, FLAG_STEP = 0.6;
  var FLAG_CANOPY = 0.6;        // 旗面半宽 0.43、横杆半宽 0.54 米：离树冠（离地 4 米以内）至少这么远
  // 骑士和落点之间隔着墙 / 石台（高过脚下 0.6 米）：不插到墙那一边去
  var flagWall = function (x0, z0, y0, x, z) {
    var n = Math.ceil(Math.hypot(x - x0, z - z0) / 0.3), i, k, o, px, pz;
    for (i = 1; i <= n; i++) {
      px = x0 + (x - x0) * i / n; pz = z0 + (z - z0) * i / n;
      for (k = 0; k < W.boxes.length; k++) {
        o = W.boxes[k];
        if (px <= o.x0 || px >= o.x1 || pz <= o.z0 || pz >= o.z1 || o.top < y0 + 0.6 || o.floating && o.bottom > y0 + 2) continue;
        return true;
      }
      if (visHit(px, pz, 0)) return true;
    }
    return false;
  };
  // 落点还剩多少余地（米，负的 = 比规则要求的近了这么多）：盒子 / 坡道、树石（连树冠）、互动物体的模型，取最紧的那个
  var flagRoom = function (x, z, y) {
    var s = 9, i, o, d;
    for (i = 0; i < W.boxes.length; i++) {
      o = W.boxes[i];
      if (o.floating && o.bottom > y + 4) continue;
      d = Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1)); s = Math.min(s, d - FLAG_BOX);
    }
    for (i = 0; i < W.ramps.length; i++) { o = W.ramps[i]; d = Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1)); s = Math.min(s, d - FLAG_BOX); }
    var VB = visBoxes(), VC = W.visExtra ? W.visExtra.circles : NO_VIS;
    for (i = 0; i < VB.length; i++) { o = VB[i]; d = Math.hypot(Math.max(o.x0 - x, 0, x - o.x1), Math.max(o.z0 - z, 0, z - o.z1)); s = Math.min(s, d - FLAG_BOX); }
    for (i = 0; i < VC.length; i++) { o = VC[i]; d = Math.hypot(x - o.x, z - o.z); if (d < 12) s = Math.min(s, d - o.r - FLAG_ROCK); }
    for (i = 0; i < W.circles.length; i++) {
      o = W.circles[i]; d = Math.hypot(x - o.x, z - o.z);
      if (d > 12) continue;
      s = Math.min(s, d - Math.max(o.r, o.vis || 0) - FLAG_ROCK);
      if (o.can) s = Math.min(s, d - o.can - FLAG_CANOPY);
    }
    return Math.min(s, interDist(x, z, FLAG_REACH + 9) - FLAG_REACH);
  };
  var flagModel = function () {
    if (flagG) return flagG;
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('banner', MX.bannerParts)));
    var mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.atlas, color: MX.BANNER_KNIGHT.clone(), side: THREE.DoubleSide });
    flagCloth = new THREE.Group();
    flagCloth.position.set(0, 6.08, 0);
    flagCloth.add(new THREE.Mesh(MX.geo('bannerCloth', MX.clothParts), mat));
    g.add(flagCloth);
    g.scale.setScalar(0.6);
    g.visible = false;
    flagG = g;
    return g;
  };
  var banner = {
    num: { cd: 20, life: 12, radius: 7, atkSpeed: 0.2, dmgTaken: -0.15, enemySlow: 0.2, autoAfter: 8 },
    reset: function () { Passive.banCd = 0; Passive.banWait = 0; Passive.banLife = 0; },
    clear: function () { flag = null; inFlag = false; hide(flagG); Passive.banLife = 0; },
    // 插在哪：滑过来的方向往回、偏到左后方（旗杆不穿过骑士、旗面不挡住骑士），地方不行就按 FLAG_TRY 试别的位置。
    // 都不合规则：插在余地最大的那个落点（都离骑士 ≥ 1.1 米；先挑高低差小、没隔着墙的），不插在脚下。
    // 返回 { x, y, z, slot }（slot：FLAG_TRY 里第几个；loose = 规则不全满足；-1 = 脚下，只有所有落点都出了场地才会）
    spot: function () {
      var vx = P.vel ? P.vel.x : 0, vz = P.vel ? P.vel.z : 0, sp = Math.sqrt(vx * vx + vz * vz), f = P.facing || 0;
      var fx = sp > 1 ? vx / sp : Math.sin(f), fz = sp > 1 ? vz / sp : Math.cos(f), rx = -fz, rz = fx;
      var y0 = W.groundAt(P.pos.x, P.pos.z, P.pos.y + 1), best = null, bt = 9, bs = -1e9;
      for (var i = 0; i < FLAG_TRY.length; i++) {
        var c = FLAG_TRY[i], x = P.pos.x + rx * c[0] + fx * c[1], z = P.pos.z + rz * c[0] + fz * c[1];
        if (Math.abs(x) > W.S - 3 || Math.abs(z) > W.S - 3) continue;
        var y = W.groundAt(x, z, y0 + 1), step = Math.abs(y - y0) < FLAG_STEP, wall = flagWall(P.pos.x, P.pos.z, y0, x, z);
        if (step && !wall && standFree(x, z, y, FLAG_BODY, FLAG_BOX, FLAG_ROCK, FLAG_REACH, FLAG_CANOPY)) return { x: x, y: y, z: z, slot: i };   // 旗不斜：插在中心的地面上（底座下面有 0.57 米埋在土里）
        var tier = (step ? 0 : 1) + (wall ? 1 : 0), room = flagRoom(x, z, y);
        if (tier < bt || tier === bt && room > bs) { bt = tier; bs = room; best = { x: x, y: y, z: z, slot: i, loose: true }; }
      }
      return best || { x: P.pos.x, y: y0, z: P.pos.z, slot: -1 };
    },
    plant: function () {
      var n = banner.num, s = banner.spot(), x = s.x, z = s.z, y = s.y;
      flag = { x: x, y: y, z: z, slot: s.slot, loose: !!s.loose };
      var g = flagModel();
      attach(g);
      g.position.set(x, y, z);
      g.rotation.y = P.facing || 0;
      g.visible = true;
      Passive.banLife = n.life;
      Passive.banCd = n.cd;
      Passive.banWait = 0;
      banPulse = BAN_PULSE; banSlow = 0;
      FX.ring(x, y, z, n.radius, 0x3a66e0, 0.6);
      FX.burst(x, y + 1, z, 10, 0x6aa8ff, 5, 0.25);
      emit('flag', x, z);
    },
    ready: function () { return Passive.banCd <= 0 && !flag; },
    onSlideEnd: function () { if (banner.ready()) banner.plant(); },
    update: function (dt) {
      var n = banner.num;
      if (Passive.banCd > 0) Passive.banCd = Math.max(0, Passive.banCd - dt);
      if (!flag && Passive.banLife > 0) Passive.banLife = 0;          // 继续游戏时旗子没了
      if (banner.ready()) {
        Passive.banWait += dt;
        if (Passive.banWait >= n.autoAfter && !P.sliding) banner.plant();
      }
      if (!flag) { inFlag = false; return; }
      Passive.banLife -= dt;
      if (Passive.banLife <= 0) { Passive.banLife = 0; flag = null; inFlag = false; hide(flagG); MX.smoke(flagG.position.x, flagG.position.y + 1, flagG.position.z, 6, 0xb8b0a4, 0.6, 0.3); return; }
      flagCloth.rotation.y = Math.sin(Game.time * 3) * 0.25;
      banPulse -= dt;
      if (banPulse <= 0) { banPulse += BAN_PULSE; FX.ring(flag.x, flag.y, flag.z, n.radius, 0x6aa8ff, 1.2, 0.5); }
      banSlow -= dt;
      if (banSlow <= 0) {
        banSlow += BAN_SLOW;
        Enemies.inRadius(flag.x, flag.z, n.radius, function (e) { if (!e.prop) Enemies.slow(e, 1 - n.enemySlow, BAN_SLOW_T); });
      }
      inFlag = dist2(P.pos.x, P.pos.z, flag.x, flag.z) <= n.radius * n.radius && Math.abs(P.pos.y - flag.y) < BAN_DY;
    },
    atkMult: function () { return inFlag ? 1 + banner.num.atkSpeed : 1; },
    dmgTakenMult: function () { return inFlag ? 1 + banner.num.dmgTaken : 1; },
    hud: function () {
      if (flag) return '军旗 ' + secs(Passive.banLife);
      if (Passive.banCd > 0) return '军旗 冷却 ' + secs(Passive.banCd);
      return '军旗 待插';
    },
    card: function (ctx) { return { r: banner.num.radius, cd: banner.num.cd }; },
    mesh: function () { return flagG; },                                // 测试 / 截图用
    flag: function () { return flag; },
    tries: function () { return FLAG_TRY.map(function (c) { return c.slice(); }); }
  };
  Passive.def('bannerman', banner);

  // ============================================================
  //  园丁骑士 · 春天来了：移动时每 1.5 秒在脚下开一朵花（开 20 秒，最多 12 朵；画出来是一小丛 2~3 朵）；
  //  站在任意一朵花 3 米内：生命回复 +40/分钟、攻速 +10%
  //  花不进物理：低多边形的小花（五片花瓣、花心、短茎、两片贴地的叶子，受光照、不发光，
  //  和经验水晶 / 金币 / 心分得开）；三种颜色各一个实例网格（各 12 个），不用 FX 的贴花和发光
  // ============================================================
  var flowers = [];             // { x, y, z, t, c, yaw, p: [[dx, dz, dy, 大小, 颜色, 朝向] × 2~3] }
  var garNear = false, garApplied = null;   // garApplied：P.temp 里现在是不是有 garden（null = 不知道，下一帧对一下）
  var garI = 0, GAR_DY = 2;
  var GAR_MAX = 12, GAR_SIZE = 1.5;         // 中间那朵花的缩放（1 = 花冠宽约 0.5 米）
  // 柔和的花色：粉、奶黄、奶白；花心分别是黄、琥珀、金黄；叶子两种绿
  var GAR_PETAL = [0xf2a0c0, 0xf5d76e, 0xf4eee0], GAR_EYE = [0xf6d36b, 0xd9893a, 0xf2c043];
  var garIM = null, garM = null, garQ = null, garV = null, garS = null, garUp = null;
  // 一处开一小丛：主花在中间，旁边 0.45 米左右再开 1~2 朵小一点的（三种颜色各最多一朵，实例网格的 12 个位置够用）。
  // 摆法只看第几丛（不用 Math.random），旁边那朵的地面高低差过 0.6 米（台子边、墙边）就不开
  var GAR_SIDE = [[0.48, 0.85], [0.44, 0.92]];      // [离中心多远, 大小]
  var garCluster = function (x, y, z, life, i) {
    var c0 = i % GAR_PETAL.length, a0 = i * 2.4, p = [[0, 0, 0, 1, c0, a0]], n = i % 2 ? 2 : 3;
    for (var j = 1; j < n; j++) {
      var a = a0 + j * 2.3, d = GAR_SIDE[j - 1][0], dx = Math.cos(a) * d, dz = Math.sin(a) * d;
      var gy = W.groundAt(x + dx, z + dz, y + 0.5);
      if (Math.abs(gy - y) > 0.6) continue;
      p.push([dx, dz, gy - y, GAR_SIDE[j - 1][1], (c0 + j) % GAR_PETAL.length, a0 + j * 1.7]);
    }
    return { x: x, y: y, z: z, t: life, c: c0, yaw: a0, p: p };
  };
  var garGeo = function (c) {
    var L = [
      ['sphere', [0.2, 6, 3], [0.17, 0.04, 0.05], 0x5f9e4a, [0, 0.5, 0.1], [1, 0.16, 0.42], 'plain'],      // 叶子
      ['sphere', [0.18, 6, 3], [-0.16, 0.04, -0.05], 0x6aab52, [0, 2.7, -0.1], [1, 0.16, 0.42], 'plain'],
      ['cyl', [0.022, 0.028, 0.27, 5], [0, 0.135, 0], 0x4f8a3c, null, null, 'plain']                     // 茎
    ];
    for (var i = 0; i < 5; i++) {
      var a = i / 5 * TAU;
      L.push(['sphere', [0.12, 6, 4], [Math.cos(a) * 0.12, 0.29, Math.sin(a) * 0.12], GAR_PETAL[c], [0, -a, 0.3], [1, 0.32, 0.68], 'plain']);
    }
    L.push(['sphere', [0.065, 6, 4], [0, 0.31, 0], GAR_EYE[c], null, [1, 0.6, 1], 'plain']);              // 花心
    return MODEL.build(L, false);                     // 不抖颜色
  };
  var garMeshes = function () {
    if (!garIM) {
      // three.js 给每个新对象的 uuid 用 Math.random：建网格这一下换成自己的数，固定种子的一局（机器人、截图）不会因为第一朵花错开
      var r0 = Math.random, seed = 7;
      Math.random = function () { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
      try {
        garIM = [];
        for (var c = 0; c < GAR_PETAL.length; c++) { garIM.push(MODEL.instanced(garGeo(c), GAR_MAX, null)); garIM[c].userData.garden = true; }
        garM = new THREE.Matrix4(); garQ = new THREE.Quaternion(); garV = new THREE.Vector3(); garS = new THREE.Vector3(); garUp = new THREE.Vector3(0, 1, 0);
      } finally { Math.random = r0; }
    }
    for (var i = 0; i < garIM.length; i++) attach(garIM[i]);
    return garIM;
  };
  var garHide = function () {
    if (!garIM) return;
    for (var i = 0; i < garIM.length; i++) garIM[i].count = 0;
  };
  var garden = {
    num: { every: 1.5, life: 20, max: 12, radius: 3, regen: 40, atkSpeed: 0.1 },
    reset: function () { Passive.garT = 0; flowers.length = 0; garNear = false; garApplied = null; garI = 0; },
    clear: function () { flowers.length = 0; garNear = false; garApplied = null; garHide(); },
    update: function (dt) {
      var n = garden.num, i, f;
      if (P.onGround && P.speed() > 1) {
        Passive.garT += dt;
        if (Passive.garT >= n.every) {
          Passive.garT -= n.every;
          flowers.push(garCluster(P.pos.x, P.pos.y, P.pos.z, n.life, garI));
          garI++;
          if (flowers.length > n.max) flowers.shift();
        }
      }
      var near = false, r2 = n.radius * n.radius;
      var IM = flowers.length || (garIM && garIM[0].count) ? garMeshes() : null, cnt = [0, 0, 0];
      for (i = flowers.length - 1; i >= 0; i--) {
        f = flowers[i];
        f.t -= dt;
        if (f.t <= 0) { flowers.splice(i, 1); continue; }
        if (!near && dist2(P.pos.x, P.pos.z, f.x, f.z) <= r2 && Math.abs(P.pos.y - f.y) < GAR_DY) near = true;
        // 开花 0.3 秒长大，最后 1 秒谢掉
        var k = Math.min(1, (n.life - f.t) / 0.3, f.t) * GAR_SIZE;
        if (!IM) continue;
        var B = f.p || [[0, 0, 0, 1, f.c | 0, f.yaw || 0]];                  // 一丛 2~3 朵（存档里没有 p 的老花按一朵画）
        for (var j = 0; j < B.length; j++) {
          var b = B[j], c = (b[4] | 0) % GAR_PETAL.length, kk = k * b[3];
          if (cnt[c] >= GAR_MAX) continue;
          garQ.setFromAxisAngle(garUp, b[5]);
          garM.compose(garV.set(f.x + b[0], f.y + b[2], f.z + b[1]), garQ, garS.set(kk, kk, kk));
          IM[c].setMatrixAt(cnt[c]++, garM);
        }
      }
      if (IM) for (i = 0; i < IM.length; i++) { IM[i].count = cnt[i]; IM[i].instanceMatrix.needsUpdate = true; }
      garNear = near;
      if (garApplied !== near) {                                        // 只在变化时改属性（recalc）
        if (near) P.addTemp('regen', n.regen, Infinity, 'garden');
        else P.clearTemp('garden');
        garApplied = near;
      }
    },
    atkMult: function () { return garNear ? 1 + garden.num.atkSpeed : 1; },
    hud: function () { return '花 ' + flowers.length + (garNear ? ' ·回血' : ''); },
    card: function (ctx) { return { r: garden.num.radius, max: garden.num.max }; },
    flowers: function () { return flowers; }                            // 测试 / 截图用
  };
  Passive.def('gardener', garden);

  // ============================================================
  //  提灯骑士 · 长明灯：身边 6 米的灯光里，敌人移速 −15%、受到的伤害 +10%；
  //  每打倒 25 个敌人半径 +0.5 米（最多 +3 米）。地上一圈暖黄的像素环（光环的几何体和着色器，只画圈，不要光墙）
  // ============================================================
  var lampRing = null, lampRim = null, lampScan = 0, lampCol = null, lampRimCol = null;
  var LAMP_COL = 0xffc860, LAMP_MIX = 0.25, LAMP_SCAN = 0.25, LAMP_SLOW_T = 0.35, LAMP_DIM = 0.4;
  // 圈底下一圈深褐色的像素描边（里外各宽一格，和光环同一套格子）：第 2 关的黄沙上暖黄的圈也看得出来
  var LAMP_RIM = 0x4a2c10, lampRimGeos = {};
  var lampRimGeo = function (fine) {
    var key = fine ? 'f' : 'c';
    if (lampRimGeos[key]) return lampRimGeos[key];
    var N = fine ? 112 : 64, cs = 2.4 / N, pos = [], kind = [], ang = [];
    FX.pixelRingCells(N, 1 - cs * 1.95, 1 + cs * 1.95).forEach(function (c) {
      var x0 = c[0] - c[2], x1 = c[0] + c[2], z0 = c[1] - c[2], z1 = c[1] + c[2], a = Math.atan2(c[1], c[0]);
      if (a < 0) a += TAU;
      pos.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
      for (var v = 0; v < 6; v++) { kind.push(0); ang.push(a); }
    });
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aKind', new THREE.Float32BufferAttribute(kind, 1));
    g.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
    lampRimGeos[key] = g;
    return g;
  };
  var lamp = {
    num: { radius: 6, slow: 0.15, vuln: 0.1, killsPer: 25, step: 0.5, max: 3 },
    R: function (kills) { var n = lamp.num; return n.radius + Math.min(n.max, Math.floor((kills || 0) / n.killsPer) * n.step); },
    reset: function () { Passive.lamK = 0; lampScan = 0; },
    clear: function () { hide(lampRing); hide(lampRim); },
    onKill: function (e) {
      if (e && e.prop) return;
      var r0 = lamp.R(Passive.lamK);
      Passive.lamK = (Passive.lamK || 0) + 1;
      if (lamp.R(Passive.lamK) > r0) {
        FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '灯光 +' + lamp.num.step + ' 米', '#ffd88a', 1.1);
        emit('lamp');
      }
    },
    dmgMult: function (e) {
      if (!e || e.prop) return 1;
      var R = lamp.R(Passive.lamK);
      return dist2(P.pos.x, P.pos.z, e.x, e.z) <= R * R ? 1 + lamp.num.vuln : 1;
    },
    ring: function () {
      if (lampRing) return lampRing;
      lampRing = new THREE.Mesh(Weapons.auraGeo(), Weapons.auraMat(LAMP_COL, LAMP_MIX));
      lampRing.frustumCulled = false;
      lampRing.renderOrder = 3;
      lampCol = new THREE.Color(LAMP_COL);
      lampRim = new THREE.Mesh(lampRimGeo(false), Weapons.auraMat(LAMP_RIM, 0));
      lampRim.frustumCulled = false;
      lampRim.renderOrder = 2;                                          // 先画描边，再画圈
      lampRimCol = new THREE.Color(LAMP_RIM);
      return lampRing;
    },
    rim: function () { lamp.ring(); return lampRim; },                 // 测试 / 截图用
    // 和 Weapons.auraLook 一样贴着地面跟着人走，但不冒光点、光墙压平（uHgt = 0）
    look: function (R) {
      var m = lamp.ring(), u = m.material.uniforms;
      attach(m);
      m.visible = true;
      var base = Math.max(W.groundAt(P.pos.x, P.pos.z, P.pos.y + 0.5), P.pos.y - 3);
      m.position.set(P.pos.x, base, P.pos.z);
      var g = Weapons.auraGeo(R > 6.5);
      if (m.geometry !== g) m.geometry = g;
      u.uR.value = R;
      u.uHgt.value = 0;
      u.uTime.value = Game.time;
      u.uCamAng.value = Weapons.camAng();
      u.uPulse.value = 0;
      var dim = Passive.riding && Passive.riding('shadow') ? LAMP_DIM : 1;   // 影遁：灯灭了的样子（效果照旧）
      u.uCol.value.copy(lampCol).multiplyScalar(dim);
      u.uMix.value = LAMP_MIX * dim;
      var H = u.uH.value;
      for (var i = 0; i < 24; i++) {
        var a = i / 24 * TAU;
        H[i] = clamp(W.groundAt(P.pos.x + Math.cos(a) * R, P.pos.z + Math.sin(a) * R, base + 1) - base, -1.2, 1.2);
      }
      // 描边跟着圈：同样的半径、地面高度、镜头那一侧变淡；影遁时也一起变暗
      var q = lampRim, v = q.material.uniforms;
      attach(q);
      q.visible = true;
      q.position.copy(m.position);
      var rg = lampRimGeo(R > 6.5);
      if (q.geometry !== rg) q.geometry = rg;
      v.uR.value = R; v.uHgt.value = 0; v.uTime.value = u.uTime.value; v.uCamAng.value = u.uCamAng.value; v.uPulse.value = 0;
      v.uCol.value.copy(lampRimCol).multiplyScalar(dim);
      v.uH.value.set(H);
    },
    update: function (dt) {
      var n = lamp.num, R = lamp.R(Passive.lamK);
      lampScan -= dt;
      if (lampScan <= 0) {
        lampScan += LAMP_SCAN;
        Enemies.inRadius(P.pos.x, P.pos.z, R, function (e) { if (!e.prop) Enemies.slow(e, 1 - n.slow, LAMP_SLOW_T); });
      }
      lamp.look(R);
    },
    hud: function () { return '灯光 ' + lamp.R(Passive.lamK) + '米 ' + ((Passive.lamK || 0) % lamp.num.killsPer) + '/' + lamp.num.killsPer; },
    card: function (ctx) { return { r: lamp.R(ctx && ctx.inRun ? Passive.lamK : 0) }; }
  };
  Passive.def('lampknight', lamp);

  // ============================================================
  //  攻城骑士 · 就地扎营：每 30 秒在身边架一台小弩车（立 15 秒），每 0.7 秒朝 30 米内最近的敌人射穿透弩箭，
  //  每箭 (14 + 2×等级)×伤害。走 MX 的炮台（安静：不弹「弩车停火了」，不进增益栏），模型是缩小 0.6 的弩车，只建一次
  // ============================================================
  var camp = null, campG = null, campTop = null;
  var CAMP_SCALE = 0.6;
  // 落点按顺序试（[右, 前, 米]）：右手边 2 米、左边 2 米、右后 / 左后 2 米、右 / 左 1.6 米、最后才是正后方 2.6 米
  // （正后方在镜头和骑士之间，竖屏会挡住腿和血条；1.6 米：弓臂转起来最远 1.19 米，平地上离骑士中心还有 0.41 米；坡上斜过来的按 CAMP_GAP 再查一遍）
  var CAMP_TRY = [[1, 0, 2], [-1, 0, 2], [0.71, -0.71, 2], [-0.71, -0.71, 2], [1, 0, 1.6], [-1, 0, 1.6], [0, -1, 2.6]];
  var CAMP_ARM = 1.19;         // 转台（弓臂）转一圈扫到的最大半径（离地 0.66~0.84 米那一层）；底座的角 0.81×√2 = 1.15 米
  var CAMP_ARM_H = 0.9;        // 弓臂那一层（离底座 0.66~0.84 米，再留一点）：底座顺着坡斜过来时，弓臂的圆心往下坡那边偏 0.9×sin(坡角)
  var CAMP_GAP = 0.4;          // 弓臂（斜过来以后）转到哪儿都离骑士中心至少这么远（骑士身子半径约 0.38 米）
  var CAMP_BOX = 1.2;          // 离箱子 / 墙 / 坡道的占地至少这么远（底座半边 0.81 米；弓臂对着墙转过去时尖端还会碰到砖墙的外沿：1.1 时压顶石、常春藤在 1.5~3 % 的贴墙落点上擦到弓臂，第 13 块改 1.2）
  var CAMP_REACH = 1.5;        // 离互动物体模型上最近的一点至少这么远（弓臂 1.19 米 + 撒点的间距 0.25 米 = 1.44 米，还剩 0.06 米）
  var CAMP_ROCK = 1.4;         // 离树、石头的模型半径至少这么远
  var CAMP_BODY = 0.85;        // 弩车（缩小 0.6）底座的半边长
  var CAMP_STEP = 1.2;         // 落点地面跟骑士脚下差不到这么多
  var CAMP_SLOPE = 0.55;       // 底座顺着坡斜过来，最陡大约 29°
  var CAMP_BUMP = 0.55;        // 斜过来以后地面还高低不平这么多就不架（底座下面有 0.72 米深的底裙）
  var CAMP_RETRY = 1;          // 都不行：1 秒后再找
  // (x, z) 能不能放一个底座半边 c 的东西：离盒子 / 坡道 box、离树石 rock、离互动物体 reach（canopy：离树冠，可以不给）。
  // 能就返回 { y, sx, sz }（底座中心高度、顺着 x / z 的坡度），不能返回 null
  var standFree = function (x, z, y, c, box, rock, reach, canopy) {
    var i, o, m = box, k, u, w, r;
    if (Math.abs(x) > W.S - 3 || Math.abs(z) > W.S - 3) return null;
    // 脚下 3×3 个点拟合一个斜面
    var H = [], h0 = 0, sx = 0, sz = 0, hi = -1e9, lo = 1e9;
    for (u = -1; u <= 1; u++) for (w = -1; w <= 1; w++) {
      var h = u || w ? W.groundAt(x + u * c, z + w * c, y + 1) : y;
      H.push(h); h0 += h / 9; sx += u * h / (6 * c); sz += w * h / (6 * c);
    }
    if (sx * sx + sz * sz > CAMP_SLOPE * CAMP_SLOPE) return null;
    for (k = 0, u = -1; u <= 1; u++) for (w = -1; w <= 1; w++, k++) { r = H[k] - (h0 + sx * u * c + sz * w * c); hi = Math.max(hi, r); lo = Math.min(lo, r); }
    if (hi - lo > CAMP_BUMP) return null;
    var top = h0 + hi;                                                  // 斜面抬到没有一点地面高过底座
    for (i = 0; i < W.boxes.length; i++) {
      o = W.boxes[i];
      if (x <= o.x0 - m || x >= o.x1 + m || z <= o.z0 - m || z >= o.z1 + m) continue;
      if (o.floating && o.bottom > top + 4) continue;                                  // 头顶很高的漂浮平台
      if (x > o.x0 + m && x < o.x1 - m && z > o.z0 + m && z < o.z1 - m && Math.abs(o.top - top) < 0.3) continue;   // 就站在这块石台上面
      return null;
    }
    for (i = 0; i < W.ramps.length; i++) { o = W.ramps[i]; if (x > o.x0 - m && x < o.x1 + m && z > o.z0 - m && z < o.z1 + m) return null; }
    if (visHit(x, z, m)) return null;                                  // 第 3 关城墙、钟楼、倒下的钟亭的外观（不能站上去）
    if (!propClear(x, z, rock, canopy)) return null;                   // 树和石头：按模型的半径（canopy：还要躲开树冠）
    if (!interClear(x, z, reach)) return null;                         // 互动物体：按模型上最近的一点（圣锻炉、墓穴、烽火台、行会的东西……）
    return { y: top, sx: sx, sz: sz };
  };
  var campFree = function (x, z, y) { return standFree(x, z, y, CAMP_BODY, CAMP_BOX, CAMP_ROCK, CAMP_REACH); };
  // 底座斜过来以后弓臂的圆心（和 g.rotation.set(-atan(sz), 0, atan(sx)) 一样转）离骑士够不够远
  var campGapOk = function (x, z, s) {
    var az = Math.atan(s.sx), ax = -Math.atan(s.sz);
    var cx = x - Math.sin(az) * CAMP_ARM_H, cz = z + Math.cos(az) * Math.sin(ax) * CAMP_ARM_H;
    return Math.hypot(cx - P.pos.x, cz - P.pos.z) >= CAMP_ARM + CAMP_GAP;
  };
  var campOk = function (x, z, y) { var s = campFree(x, z, y); return s && campGapOk(x, z, s) ? s : null; };
  // 找落点：{ x, y, z, sx, sz } 或 null
  var campSpot = function () {
    var f = P.facing || 0, rx = -Math.cos(f), rz = Math.sin(f), fx = Math.sin(f), fz = Math.cos(f);
    var y0 = W.groundAt(P.pos.x, P.pos.z, P.pos.y + 1);             // 骑士脚下（跳起来时也按地面算）
    for (var i = 0; i < CAMP_TRY.length; i++) {
      var c = CAMP_TRY[i], x = P.pos.x + (rx * c[0] + fx * c[1]) * c[2], z = P.pos.z + (rz * c[0] + fz * c[1]) * c[2];
      var y = W.groundAt(x, z, y0 + 1), s = Math.abs(y - y0) < CAMP_STEP ? campOk(x, z, y) : null;
      if (s) { s.x = x; s.z = z; s.slot = i; return s; }
    }
    return null;
  };
  var campModel = function () {
    if (campG) return campG;
    var g = new THREE.Group();
    g.add(MX.mesh(MX.geo('ballista', MX.ballistaParts)));
    campTop = new THREE.Group();
    campTop.position.y = 0.95;
    campTop.scale.setScalar(1.2);
    campTop.add(MX.mesh(MX.geo('ballistaTop', MX.ballistaTopParts)));
    g.add(campTop);
    g.scale.setScalar(CAMP_SCALE);
    g.visible = false;
    campG = g;
    return g;
  };
  var engineer = {
    num: { cd: 30, life: 15, rate: 0.7, range: 30, dmgBase: 14, dmgPerLv: 2 },
    dmg: function () { var n = engineer.num; return (n.dmgBase + n.dmgPerLv * P.level) * P.st.damage; },
    reset: function () { Passive.engCd = engineer.num.cd; camp = null; },
    clear: function () {
      if (camp) { var i = MX.turrets.indexOf(camp); if (i >= 0) MX.turrets.splice(i, 1); }   // 换关时 MX.reset 已经清掉了（不走 onEnd）
      camp = null;
      hide(campG);
    },
    update: function (dt) {
      var n = engineer.num;
      if (camp && MX.turrets.indexOf(camp) < 0) { camp = null; hide(campG); }   // 被别处清掉了
      Passive.engCd -= dt;                                            // 从上一台架起来算，每 30 秒一台
      if (Passive.engCd > 0 || camp) return;
      var s = campSpot();
      if (!s) { Passive.engCd = CAMP_RETRY; return; }                  // 身边没有空地（墙边、互动物体旁边、坡上）：1 秒后再找
      Passive.engCd = Passive.engCd + n.cd > 0 ? Passive.engCd + n.cd : n.cd;
      var f = P.facing || 0, x = s.x, y = s.y, z = s.z;
      var g = campModel();
      attach(g);
      g.position.set(x, y, z);
      g.rotation.set(-Math.atan(s.sz), 0, Math.atan(s.sx));          // 顺着坡斜过来
      campTop.rotation.y = f;
      g.visible = true;
      camp = MX.addTurret({ x: x, y: y, z: z, active: n.life, rate: n.rate, range: n.range, quiet: true, aim: f,
        dmg: function () { return engineer.dmg(); },
        onUpdate: function (t) { if (campTop) campTop.rotation.y = t.aim; },
        onEnd: function (t) { if (camp === t) camp = null; hide(campG); MX.smoke(t.x, t.y + 0.8, t.z, 8, 0xb8b0a4, 0.6, 0.3); } });
      FX.burst(x, y + 0.6, z, 12, 0x8a5a32, 5, 0.22);
      emit('camp', x, z);
    },
    hud: function () { return camp ? '弩车 ' + secs(camp.active) : '扎营 ' + secs(Math.max(0, Passive.engCd)); },
    card: function (ctx) { var n = engineer.num, c = ctx || { lv: 1, dmg: 1 }; return { dmg: Math.round((n.dmgBase + n.dmgPerLv * c.lv) * c.dmg) }; },
    turret: function () { return camp; },                               // 测试 / 截图用
    spot: function () { return campSpot(); },
    slots: function () { return CAMP_TRY.map(function (c) { return c.slice(); }); },
    limits: function () { return { arm: CAMP_ARM, armH: CAMP_ARM_H, gap: CAMP_GAP, box: CAMP_BOX, reach: CAMP_REACH, cell: FP_CELL }; },   // 测试用
    freeAt: function (x, z, y) { return campOk(x, z, y); },
    footprint: function (o) { return footprint(o); },                  // 测试用：互动物体的真实占地
    clearOf: function (x, z, r) { return interClear(x, z, r); },
    mesh: function () { return campG; }
  };
  Passive.def('engineer', engineer);
})();

// ---------------- 急件信封的纸纹贴图 p5_letter ----------------
// 在 TEX.init 画图集之前才登记，排在所有贴图后面（连 models_companions.js 的 cm_* 也在它前面：先按原来的顺序把 cm_* 登记一遍，
// 它们自己的登记再来一遍不会挪位置）；只用自己的整数哈希，不调共用的随机数 r()（旧贴图的顺序和像素不变）
(function () {
  var hash = function (x, y) { var h = (x * 374761393 + y * 668265263 + 977) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  var tile = function (x, y) {
    if (x === 0 || y === 0 || x === 15 || y === 15) return 182;            // 一圈细边线
    if (y === 1 || x === 1) return 248;                                   // 上、左亮边（斜面受光）
    if (y === 14 || x === 14) return 204;                                 // 下、右暗边
    var v = 234 + Math.floor(hash(x, y) * 14);                            // 纸面
    if ((x + 2 * y) % 9 === 0 && hash(y, x) < 0.55) v -= 16;              // 稀疏的纸纤维
    return v;
  };
  var init0 = TEX.init;
  TEX.init = function () {
    if (typeof CM_TILES === 'object') for (var k in CM_TILES) { try { TEX.addTile(k, CM_TILES[k]); } catch (e) { /* 图集满了 */ } }
    try { TEX.addTile('p5_letter', tile); } catch (e) { /* 图集满了就用 plain */ }
    TEX.init = init0;
    return init0.apply(this, arguments);
  };
})();
