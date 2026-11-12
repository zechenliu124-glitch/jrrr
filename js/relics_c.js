'use strict';
// ============================================================
//  宝物 · c 部分（第 6 块）：移动和地图上的宝物
//  护膝、铁蒺藜袋、银马镫、避雷针、龙吼战鼓、铜号角、蜂蜜罐、许愿铜钱、铁匠的徽牌
//  约定（C6_WORK §1.1）：每件宝物一个 Relic.def(id, spec)；核心在 relics.js（a 部分），只把钩子分给拥有的宝物，
//  每个钩子最后一个参数 n = 拥有几件。b 部分（命中时的战斗宝物）在 relics_b.js。
//  数值只从 spec.num 拿（和 tables.json items[].numbers 一样，测试会比）；card(ctx) 给卡上 {x} 的值（ctx.k = 卡上说的件数）。
//  要跟着「继续上一局」存下来的数放在 Passive 上（rel 开头，在 spec.reset 里设：relStirT、relRodT、relDrumT）；
//  铁蒺藜、马镫的上升沿这些对象放在闭包里，不存档。铁蒺藜只是闭包里的普通对象，用 a 部分的 caltrop 实例网格在 render 里画
//  （不建网格、不往场景里加东西）。伤害走 Relic.dmg / Enemies.damage，减速走 Enemies.slow，定住走 Evo.stun，
//  范围效果不打道具（e.prop）；声音走 Relic.emit，效果真的发生了就 Relic.count(id)。
// ============================================================

(function () {
  // ---------------- 小工具 ----------------
  var rm = function () { return typeof Settings !== 'undefined' && Settings.rm && Settings.rm(); };   // 减少动态效果（settings.js 在后面载入）
  var pct = function (v) { return Math.round(v * 100); };
  // 卡上的伤害：和 Relic.dmg 同一个式子，只是件数 / 等级 / 伤害取卡上的（ctx）
  var cardDmg = function (num, ctx) { return Math.round((num.dmgBase + (num.dmgPerLv || 0) * ctx.lv) * ctx.dmg * (num.perCopy === false ? 1 : ctx.k)); };
  // 从 (x, z) 往外的方向；贴在一起时用骑士的朝向
  var dir = { x: 0, z: 1 };
  var away = function (e, x, z) {
    var dx = e.x - x, dz = e.z - z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 1e-3) { dx = Math.sin(P.facing || 0); dz = Math.cos(P.facing || 0); d = 1; }
    dir.x = dx / d; dir.z = dz / d; return dir;
  };
  // 冲击：r 米内、高度差不超过 dy 的敌人（道具不算）受 dmg 伤害并往外推 kb；返回真打中了几个
  var blast = function (x, y, z, r, dy, dmg, kb) {
    var hit = 0;
    Enemies.inRadius(x, z, r, function (e) {
      if (e.prop || Math.abs(e.y - y) > dy) return;
      var d = away(e, x, z);
      if (Enemies.damage(e, dmg, 0, d.x * kb, d.z * kb) > 0) hit++;
    });
    return hit;
  };
  // r 米内最近的活着的敌人（不算道具；还在登场动画里的 Boss / 小 Boss 打不动，也不算）
  var nearest = function (x, z, r) {
    var L = Enemies.list, best = null, bd = r * r;
    for (var i = 0; i < L.length; i++) {
      var e = L[i];
      if (!e.alive || e.prop || ((e.boss || e.mini) && e.state === 'intro')) continue;
      var d = dist2(x, z, e.x, e.z);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  };

  // ============================================================
  //  护膝：滑铲时撞到的敌人受一次伤害并被推开（每个敌人 0.5 秒最多一次，e.kneeT）
  // ============================================================
  var kneeSnd = -9;                                       // 上次出声（Passive.clock）：一排敌人只响一下
  var kneepads = Relic.def('kneepads', {
    num: { r: 1.2, cd: 0.5, dmgBase: 6, dmgPerLv: 1.5, kb: 8 },
    card: function (ctx) { return { dmg: cardDmg(kneepads.num, ctx) }; },
    clear: function () { kneeSnd = -9; },
    update: function (dt, n) {
      if (!P.sliding) return;
      var m = kneepads.num, c = Passive.clock, px = P.pos.x, py = P.pos.y, pz = P.pos.z, dmg = Relic.dmg(m, n), hit = 0;
      Enemies.inRadius(px, pz, m.r, function (e) {
        if (e.prop || Math.abs(e.y - py) > 2 || e.kneeT > c) return;
        e.kneeT = c + m.cd;
        var d = away(e, px, pz);
        if (!(Enemies.damage(e, dmg, 0, d.x * m.kb, d.z * m.kb) > 0)) return;
        // 撞上的那一点：一小团土和两颗白色碎屑
        var cx = (px + e.x) * 0.5, cz = (pz + e.z) * 0.5;
        FX.burst(cx, py + 0.3, cz, 6, 0xc8b490, 4, 0.24);
        FX.spark(cx, py + 0.6, cz, 0.7, 0xffffff, 2, 0xe8e0d0, 0.16);
        Relic.count('kneepads');
        hit++;
      });
      if (hit && c - kneeSnd > 0.12) { kneeSnd = c; Relic.emit('knee', px, pz); }
    }
  });

  // ============================================================
  //  铁蒺藜袋：地上滑铲时每 0.5 秒在脚下撒一把（4 秒，最多 10 把，旧的先没）；
  //  踩到的地面敌人（飞的不算）受伤并减速 40%（2 秒），每个敌人 0.5 秒最多一次（e.calT）
  //  每把是闭包里的普通对象，画三颗 caltrop 实例（a 部分的实例网格，Weapons.render 里的 Relic.render）
  // ============================================================
  var pats = [], calT = 0;
  var TOSS = 0.15, SINK = 0.4, SINK_Y = 0.15;            // 撒出去落地用 0.15 秒；最后 0.4 秒往地里沉 0.15 米
  var CAL_S = 1.7;                                        // 画的大小：模型 0.28 米，草地上要放大才看得清
  var caltrops = Relic.def('caltrops', {
    num: { every: 0.5, life: 4, r: 1, max: 10, dmgBase: 6, slow: 0.4, slowT: 2, cd: 0.5 },
    card: function (ctx) { return { dmg: cardDmg(caltrops.num, ctx) }; },
    clear: function () { pats.length = 0; calT = 0; },
    patches: function () { return pats; },                // 测试用
    drop: function () {
      var m = caltrops.num, x = P.pos.x, z = P.pos.z, y = W.groundAt(x, z, P.pos.y + 0.5);
      var p = { x: x, y: y, z: z, t: m.life, yaws: [], ox: [], oz: [], ys: [] }, a0 = Math.random() * TAU;
      for (var i = 0; i < 3; i++) {
        var a = a0 + i * TAU / 3 + rand(-0.4, 0.4), d = rand(0.25, 0.4);
        p.ox.push(Math.cos(a) * d); p.oz.push(Math.sin(a) * d);
        p.ys.push(W.groundAt(x + p.ox[i], z + p.oz[i], P.pos.y + 0.5));
        p.yaws.push(Math.random() * TAU);
      }
      pats.push(p);
      if (pats.length > m.max) pats.shift();
      Relic.emit('caltrop', x, z);
      return p;
    },
    update: function (dt, n) {
      var m = caltrops.num, c = Passive.clock, i;
      if (P.sliding && P.onGround) { calT -= dt; if (calT <= 1e-6) { calT = m.every; caltrops.drop(); } }
      else calT = 0;                                       // 下一次起滑马上撒第一把
      if (!pats.length) return;
      var dmg = Relic.dmg(m, n);
      for (i = pats.length - 1; i >= 0; i--) {
        var p = pats[i];
        p.t -= dt;
        if (p.t <= 0) { pats.splice(i, 1); continue; }
        Enemies.inRadius(p.x, p.z, m.r, function (e) {
          if (e.prop || (e.def && e.def.flyer) || Math.abs(e.y - p.y) > 1.5 || e.calT > c) return;
          e.calT = c + m.cd;
          if (!(Enemies.damage(e, dmg, 0, 0, 0) > 0)) return;
          Enemies.slow(e, 1 - m.slow, m.slowT);
          FX.spark(e.x, p.y + 0.25, e.z, 0.5, 0xdfe6f0, 2, 0x9aa0aa, 0.14);
          Relic.count('caltrops');
        });
      }
    },
    render: function (put) {
      var life = caltrops.num.life;
      for (var i = 0; i < pats.length; i++) {
        var p = pats[i], age = life - p.t, sink = p.t < SINK ? (SINK - p.t) / SINK * SINK_Y : 0;
        var toss = age < TOSS ? 1 - age / TOSS : 0;       // 刚撒出去：从小腿高落下来，边落边转
        for (var j = 0; j < 3; j++) {
          put('caltrop', p.x + p.ox[j] * (1 - 0.5 * toss), p.ys[j] - sink + toss * toss * 0.45, p.z + p.oz[j] * (1 - 0.5 * toss),
            toss * 2.4, p.yaws[j] + toss * 3, CAL_S, 0);
        }
      }
    }
  });

  // ============================================================
  //  银马镫：滑铲坐骑冒出来的那一下（P.riding 的上升沿，地上滑铲和空中坐骑都算），冲开 4 米内的敌人；每 3 秒最多一次
  // ============================================================
  var was = false;                                        // 上一帧坐骑在不在
  var stirrup = Relic.def('stirrup', {
    // 第 13 块 D-C13-7：10 分钟时冲击的伤害只占 1.0~5.1 %（中位 1.7 %，SETUP 跑法），按决定加上每级 +2（和猎犬哨一样）
    num: { r: 4, cd: 3, dmgBase: 12, dmgPerLv: 2, kb: 12 },
    card: function (ctx) { return { dmg: cardDmg(stirrup.num, ctx) }; },
    reset: function () { Passive.relStirT = 0; },
    clear: function () { was = false; },
    update: function (dt, n) {
      var r = !!P.riding, m = stirrup.num;
      if (r && !was && Passive.clock >= (Passive.relStirT || 0)) {
        Passive.relStirT = Passive.clock + m.cd;
        var x = P.pos.x, y = P.pos.y, z = P.pos.z;
        blast(x, y, z, m.r, 3, Relic.dmg(m, n), m.kb);
        // 银色冲击环 + 一圈白色火花，贴着地面往外
        FX.ring(x, y, z, m.r, 0xdfe8f2, 0.34);
        FX.ring(x, y, z, m.r * 0.5, 0xffffff, 0.22, 0.6);
        for (var i = 0; i < 10; i++) {
          var a = i / 10 * TAU + rand(-0.2, 0.2), s = rand(7, 10);
          FX.part(x + Math.cos(a) * 0.6, y + 0.35, z + Math.sin(a) * 0.6, Math.cos(a) * s, rand(1.5, 3), Math.sin(a) * s, i % 2 ? 0xffffff : 0xc8d4e0, 0.2, rand(0.25, 0.4), 10);
        }
        Relic.emit('stirrup', x, z);
        Relic.count('stirrup');
      }
      was = r;
    }
  });

  // ============================================================
  //  避雷针：站在比四周地形高 3 米以上的地方（箱子顶、墙头、山包上的石头都算），每 0.8 秒朝 12 米内最近的敌人落一道雷
  //  high() 放在 spec 上（测试 / 冒烟可以换掉）：只比地形（W.terrainH），四个方向各 6 米取平均；每 0.2 秒看一次
  // ============================================================
  var hiT = 0, hi = false, CHECK = 0.2;
  var lightningrod = Relic.def('lightningrod', {
    num: { h: 3, probe: 6, every: 0.8, range: 12, dmgBase: 30 },
    card: function (ctx) { return { dmg: cardDmg(lightningrod.num, ctx) }; },
    reset: function () { Passive.relRodT = 0; },
    clear: function () { hiT = 0; hi = false; },
    high: function () {
      if (!P.onGround) return false;
      var m = lightningrod.num, x = P.pos.x, z = P.pos.z, d = m.probe;
      var g = (W.terrainH(x + d, z) + W.terrainH(x - d, z) + W.terrainH(x, z + d) + W.terrainH(x, z - d)) / 4;
      return P.pos.y - g >= m.h;
    },
    isHigh: function () { return hi; },                   // 测试用：上一次看的结果
    update: function (dt, n) {
      var m = lightningrod.num;
      hiT -= dt;
      if (hiT <= 0) { hiT = CHECK; hi = !!lightningrod.high(); }
      Passive.relRodT = Math.max(0, (Passive.relRodT || 0) - dt);   // 不在高处也走：一站上去马上落第一道
      if (!hi || Passive.relRodT > 0) return;
      Passive.relRodT = m.every;
      var x = P.pos.x, y = P.pos.y, z = P.pos.z, e = nearest(x, z, m.range);
      // 头顶的小电花：站对了地方（没有目标时也闪，玩家知道这里能落雷）
      FX.flash(x, y + 2.3, z, 0.55, 0xbfe4ff, 0.16, 2);
      FX.mote(x + rand(-0.15, 0.15), y + 2.1, z + rand(-0.15, 0.15), 0x9fd8ff, 0.12, 1.6, 0.45);
      if (!e) return;
      var ty = e.y;
      FX.bolt(e.x, ty + 14, e.z, e.x, ty + e.r, e.z, 0xbfe4ff);
      FX.flash(e.x, ty + 0.2, e.z, 2.2, 0x9fd8ff, 0.22, 0);
      FX.ring(e.x, W.groundAt(e.x, e.z, ty + 1), e.z, 1.4, 0xbfe4ff, 0.25, 0.8);
      Enemies.damage(e, Relic.dmg(m, n), 0, 0, 0);
      Relic.emit('bolt', e.x, e.z);
      Relic.count('lightningrod');
    }
  });

  // ============================================================
  //  龙吼战鼓：每 45 秒擂一次鼓（35 / 25 秒，件数越多越快）：Boss、小 Boss 以外的敌人（精英也算）定住 1.5 秒，
  //  这 1.5 秒你的伤害 +30%。用 Evo.stun（金色眩晕，META 的冻住击杀不算它）
  // ============================================================
  var wardrum = Relic.def('wardrum', {
    num: { cd: 45, step: 10, cdMin: 25, stun: 1.5, damage: 0.3 },
    cd: function (n) { var m = wardrum.num; return Math.max(m.cdMin, m.cd - m.step * (n - 1)); },
    card: function (ctx) { return { n: wardrum.cd(ctx.k) }; },
    reset: function () { Passive.relDrumT = wardrum.num.cd; },
    update: function (dt, n) {
      var cd = wardrum.cd(n), t = Passive.relDrumT;
      if (!(t <= cd)) t = cd;                              // 又拿到一件：这一轮也跟着缩短（没设过也从 cd 开始）
      Passive.relDrumT = t - dt;
      if (!(Passive.relDrumT <= 0)) return;
      Passive.relDrumT = cd;
      wardrum.beat();
    },
    beat: function () {
      var m = wardrum.num, L = Enemies.list, i;
      for (i = 0; i < L.length; i++) { var e = L[i]; if (e.alive && !e.boss && !e.mini && !e.prop) Evo.stun(e, m.stun); }
      P.addTemp('damage', m.damage, m.stun, 'relic:wardrum');
      // 三道红金色的圈从骑士往外推（8 / 16 / 28 米，隔 0.1 秒），震一下镜头
      var x = P.pos.x, y = P.pos.y, z = P.pos.z, R = [8, 16, 28], C = [0xff5a2a, 0xff9a2a, 0xffd04a];
      FX.ring(x, y, z, R[0], C[0], 0.45);
      for (i = 1; i < 3; i++) (function (r, c, t) { Game.later(t, function () { if (Game.state === 'play' || Game.state === 'modal') FX.ring(x, y, z, r, c, 0.5, 0.8); }); })(R[i], C[i], i * 0.1);
      FX.flash(x, y + 1, z, 3, 0xff8a3a, 0.25, 0);
      if (!rm()) Game.shake(0.35);
      FX.text(x, y + 2.6, z, '战鼓！', '#ff8a3a', 1.4);
      Relic.emit('drum', x, z);
      Relic.count('wardrum');
    }
  });

  // ============================================================
  //  铜号角：每次升级吹号，8 米内的敌人（道具不算）受伤并被击退；同一帧升好几级就吹好几下
  // ============================================================
  var bugle = Relic.def('bugle', {
    num: { r: 8, dmgBase: 15, dmgPerLv: 3, kb: 10 },
    card: function (ctx) { return { dmg: cardDmg(bugle.num, ctx) }; },
    onLevel: function (n) {
      var m = bugle.num, x = P.pos.x, y = P.pos.y, z = P.pos.z;
      blast(x, y, z, m.r, Infinity, Relic.dmg(m, n), m.kb);
      // 金色的大圈 + 骑士身边一团淡金色的光和往上飘的金点（号声，不是爆炸：没有烟）
      FX.ring(x, y, z, m.r, 0xffd84a, 0.42);
      FX.ring(x, y, z, m.r * 0.45, 0xfff2a8, 0.3, 0.7);
      FX.flash(x, y + 1.3, z, 2.4, 0xffd84a, 0.24, 0);
      FX.flash(x, y + 1.5, z, 0.9, 0xfff6d0, 0.14, 2);
      for (var i = 0; i < 8; i++) {
        var a = i / 8 * TAU;
        FX.part(x + Math.cos(a) * 0.5, y + 1.2, z + Math.sin(a) * 0.5, Math.cos(a) * 2.5, rand(2, 3.5), Math.sin(a) * 2.5, i % 2 ? 0xffd84a : 0xfff2a8, 0.16, rand(0.5, 0.7), -1);
      }
      Relic.emit('bugle', x, z);
      Relic.count('bugle');
    }
  });

  // ============================================================
  //  蜂蜜罐：每开一个宝箱（付费、免费、秘宝箱：走 Passive.onChest 的都算），15 秒内移动速度 +20%、攻击速度 +12%
  //  P.addTemp 的 key 'relic:honeyjar'：再开一个是刷新，不叠加；这 15 秒里骑士身上一直往下滴蜂蜜
  // ============================================================
  var dripT = 0, HONEY = 0xf0a020;
  var honeyjar = Relic.def('honeyjar', {
    num: { t: 15, moveSpeed: 0.2, atkSpeed: 0.12 },
    card: function (ctx) { var m = honeyjar.num; return { a: pct(m.moveSpeed * ctx.k), b: pct(m.atkSpeed * ctx.k) }; },
    clear: function () { dripT = 0; },
    onChest: function (n) {
      var m = honeyjar.num, x = P.pos.x, y = P.pos.y, z = P.pos.z;
      P.addTemp('moveSpeed', m.moveSpeed * n, m.t, 'relic:honeyjar');
      P.addTemp('atkSpeed', m.atkSpeed * n, m.t, 'relic:honeyjar');
      FX.flash(x, y + 1.1, z, 1.8, 0xffc040, 0.25, 0);
      for (var i = 0; i < 10; i++) FX.part(x + rand(-0.4, 0.4), y + rand(1.4, 2), z + rand(-0.4, 0.4), rand(-1.2, 1.2), rand(1, 3), rand(-1.2, 1.2), i % 3 ? HONEY : 0xffd27a, rand(0.12, 0.2), rand(0.6, 0.9), 8);
      Relic.emit('honey', x, z);
      Relic.count('honeyjar');
    },
    update: function (dt) {
      var on = false;
      for (var i = 0; i < P.temp.length; i++) if (P.temp[i].key === 'relic:honeyjar') { on = true; break; }
      if (!on) return;
      dripT -= dt;
      if (dripT > 0) return;
      dripT = 0.3;                                         // 一秒三滴，够看出来还在生效
      FX.part(P.pos.x + rand(-0.3, 0.3), P.pos.y + rand(0.9, 1.3), P.pos.z + rand(-0.3, 0.3), 0, -0.3, 0, HONEY, 0.12, 0.5, 9);
    }
  });

  // ============================================================
  //  许愿铜钱：许愿井不再出诅咒，许愿便宜 25%（两件 50%，最多便宜一半）。MX.mod 的监听（核心在骑士的之后套）
  // ============================================================
  var wishcoin = Relic.def('wishcoin', {
    num: { price: 0.25, priceMin: 0.5 },
    k: function (n) { var m = wishcoin.num; return Math.max(m.priceMin, 1 - m.price * n); },
    card: function (ctx) { return { p: Math.round((1 - wishcoin.k(ctx.k)) * 100) }; },
    mxMod: function (kind, key, v, n) {
      if (kind !== 'wishwell') return undefined;
      if (key === 'curse') { if (v > 0) Relic.count('wishcoin'); return 0; }
      if (key === 'price') return v * wishcoin.k(n);
      return undefined;
    }
  });

  // ============================================================
  //  铁匠的徽牌：铁匠铺便宜 40%（0.6 的 n 次方，最多便宜 70%），每座多锻造 1 次（每件 +1）
  //  铁匠骑士自己 ×0.5 先算（它的监听先登记），两个都乘：×0.3
  // ============================================================
  var smithpass = Relic.def('smithpass', {
    num: { price: 0.6, priceMin: 0.3, uses: 1 },
    k: function (n) { var m = smithpass.num; return Math.max(m.priceMin, Math.pow(m.price, n)); },
    card: function (ctx) { return { p: Math.round((1 - smithpass.k(ctx.k)) * 100), n: smithpass.num.uses * ctx.k }; },
    mxMod: function (kind, key, v, n) {
      if (kind !== 'blacksmith') return undefined;
      if (key === 'price') { Relic.count('smithpass'); return v * smithpass.k(n); }
      if (key === 'uses') return v + smithpass.num.uses * n;
      return undefined;
    }
  });
})();
