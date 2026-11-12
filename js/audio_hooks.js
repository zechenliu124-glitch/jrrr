'use strict';
// ============================================================
//  把声音接到游戏上：只包装已有的函数（原函数照常调用），不改别的文件
//  · 音乐：按游戏状态选曲（主菜单 / 第几关 / 首领 / 午夜钟声），强度跟着关卡进度和敌潮走，弹窗时压低，暂停时停
//  · 音效：武器、命中、击杀、爆炸、拾取、跳跃落地滑铲、受伤、低血量心跳、地图上的东西、界面按钮
//  Game.* 在 main.js 里定义（最后加载）：在 load 事件里包装（这个监听比 main.js 的先注册，Game.init 之前就包好了）
//  热路径（每次命中、每次击杀）只多一次布尔判断；没解锁声音时什么都不做
// ============================================================
(function () {
  var M = SFX.M;
  var H = SFX.H = {
    won: false, endAt: 0, holdUntil: 0, reroll: false, banishing: false, tickHits: 0,
    xpN: 0, xpT: -9, nextBeat: 0, rideMode: null, loop: null, laser: null, blockT: -9, portalSeen: null,
    hoverEl: null, feel: false, chg: typeof WeakMap !== 'undefined' ? new WeakMap() : null
  };
  SFX.GROUPS.spike = 6;
  // 暂停、阵亡、回主菜单时收掉正在响的音效（SFX.hush），界面的声音（按钮、暂停那一声）留着
  H.KEEP = { ui: true };
  var now = function () { return SFX.ctx ? SFX.ctx.currentTime : 0; };
  var safe = function (fn) { return function () { try { return fn.apply(this, arguments); } catch (e) { SFX.err(e); } }; };
  // 包一层：after(结果, 原参数…) 在原函数之后调用（出错只记下来，不影响游戏）
  var after = function (obj, name, fn) {
    var f = obj && obj[name];
    if (typeof f !== 'function') return;
    obj[name] = function () {
      var r = f.apply(this, arguments);
      if (SFX.ok) { try { fn.call(this, r, arguments); } catch (e) { SFX.err(e); } }
      return r;
    };
  };

  // ---------------- 音乐：想放哪首 ----------------
  H.stageSong = function () {
    var sd = Game.stageDef;
    if (sd && sd.music && SFX.SONGS[sd.music]) return sd.music;
    var list = SFX.STAGE_SONGS;
    return list[((Game.stage || 1) - 1) % list.length];
  };
  M.wantFn = function (t) {
    if (typeof Game === 'undefined') return null;
    var s = Game.state;
    if (s === 'menu') return 'menu';
    if (s === 'end') return H.won && t > H.endAt ? 'menu' : null;   // 通关：号角吹完放主菜单曲；阵亡：安静
    if (t < H.holdUntil) return null;                                // Boss 倒下的号角期间不放
    if (Game.bossAlive) return 'boss';
    if (typeof Director !== 'undefined' && Director.swarm) return 'swarm';
    return H.stageSong();
  };
  // 强度 0~2：关卡前段轻、后段满；敌潮、小 Boss、身边怪多时加一层
  M.levelFn = function (p) {
    if (p.id === 'boss' || p.id === 'swarm') return 2;
    if (p.id === 'menu' || typeof Game === 'undefined' || Game.state === 'menu') return 1;
    var pr = Director.progress ? Director.progress() : 0.5;
    var L = pr < 0.12 ? 0 : pr < 0.55 ? 1 : 2;
    var boost = Director.surgeT > 0 || (Director.near || 0) > 70;
    if (!boost) for (var i = 0; i < Enemies.list.length; i++) { var e = Enemies.list[i]; if (e.mini && e.alive) { boost = true; break; } }
    return Math.min(2, L + (boost ? 1 : 0));
  };
  M.pauseFn = function () { return typeof Game !== 'undefined' && Game.state === 'pause'; };
  // 升级 / 宝箱 / 商店这类弹窗打开时压低（按弹窗的暗底判断：Boss 登场这种不出暗底的过场不压）
  var modalBg = null;
  M.duckFn = function () {
    if (typeof Game === 'undefined' || Game.state !== 'modal') return 1;
    modalBg = modalBg || document.getElementById('modalBg');
    return modalBg && !modalBg.classList.contains('hidden') ? 0.42 : 1;
  };
  // 低血量：音乐变闷
  M.lpFn = function () {
    if (typeof Game === 'undefined' || Game.state !== 'play' || !P.alive || !P.st || !(P.st.maxHp > 0)) return 20000;
    var k = P.hp / (P.st.maxHp * 0.3);
    if (k >= 1) return 20000;
    return Math.round((900 + 3600 * Math.max(0, k)) / 100) * 100;
  };
  // 状态变了马上换曲（不用等下一个 50 毫秒）
  H.sync = function () {
    if (!SFX.ctx || !SFX.running) return;
    try { var t = now(), w = M.wantFn(t); if (w !== M.curId) M.switchTo(w, t); } catch (e) { SFX.err(e); }
  };
  // 插曲；音乐关了就用音效版
  H.sting = function (id, sfxName) {
    if (!SFX.stinger(id) && sfxName) SFX.play(sfxName);
  };

  // ---------------- 每 50 毫秒：心跳、滑铲摩擦声、充能、发现传送门 ----------------
  var PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  var HB = { w: 0.5, delay: 0 }, RO = { kind: 'soft' }, CO = { pitch: 1 }, PF = {};
  SFX.onTick = function (t) {
    if (typeof Game === 'undefined' || typeof P === 'undefined') return;
    var play = Game.state === 'play' && SFX.live;
    // 心跳：生命低于 30%，越低越快越响
    var low = play && P.alive && P.st && P.hp < P.st.maxHp * 0.3;
    if (low) {
      var k = Math.max(0, P.hp / (P.st.maxHp * 0.3));
      if (H.nextBeat < t - 0.5) H.nextBeat = t + 0.05;
      if (t >= H.nextBeat - 0.06) {
        HB.w = 1 - k * 0.6; HB.delay = Math.max(0, H.nextBeat - t);
        SFX.play('heartbeat', HB);
        H.nextBeat += 0.55 + 0.45 * k;
      }
    } else H.nextBeat = 0;
    H.ride(t, play);
    H.laserTick(play);
    if (play) { H.charge(t); H.portal(); }
  };
  // 滑铲摩擦声（贴地）/ 风声（空中高速）：一个循环音，音量和音色跟着速度
  H.ride = function (t, play) {
    var want = null, spd = 0;
    if (play && P.alive) {
      spd = P.speed();
      if (P.sliding && P.onGround && spd > 1.5) want = 'g';
      else if (!P.onGround && spd > 16) want = 'a';
    }
    var kind = want === 'g' ? (SFX.RIDE_SOUND[P.char && P.char.id] || 'soft') : 'air';
    if (want !== H.rideMode || (H.loop && H.loopKind !== kind)) {
      if (H.loop) { SFX.stopVoice(H.loop, 0.12); H.loop = null; }
      H.rideMode = null;
      if (want) {
        RO.kind = kind;
        H.loop = SFX.play('scrape', RO);
        if (H.loop) { H.rideMode = want; H.loopKind = kind; }
      }
    }
    if (H.loop) {
      var pr = SFX.SCRAPE[kind] || SFX.SCRAPE.soft, g, f;
      if (want === 'g') { g = Math.min(1, Math.max(0.18, spd / 28)); f = pr.f * (0.8 + Math.min(spd, 50) / 60); }
      else { g = Math.min(1, (spd - 16) / 30) * 0.6; f = pr.f * (0.7 + Math.min(spd, 60) / 50); }
      SFX.setParam(H.loop, 'g', g, 0.06);
      SFX.setParam(H.loop, 'f', f, 0.08);
      if (pr.amSpd) SFX.setParam(H.loop, 'am', Math.max(3, spd * pr.amSpd), 0.1);
      if (pr.hum) SFX.setParam(H.loop, 'h', pr.hum * (1 + Math.min(spd, 50) / 50), 0.1);
    }
  };
  // 站圈充能（篝火、战旗……有 charge 的东西）：一格一格往上走的音
  H.charge = function (t) {
    if (typeof Interact === 'undefined' || !H.chg || t - (H.chargeT || 0) < 0.2) return;
    var best = -1, list = Interact.list;
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.used || typeof o.charge !== 'number' || !(o.charge > 0.02)) continue;
      var prev = H.chg.get(o);
      H.chg.set(o, o.charge);
      if (prev != null && o.charge > prev + 0.0005 && o.charge > best) best = o.charge;
    }
    if (best >= 0) {
      H.chargeT = t;
      CO.pitch = Math.pow(2, PENTA[Math.min(PENTA.length - 1, Math.floor(best * PENTA.length))] / 12);
      SFX.play('charge_tick', CO);
    }
  };
  // 走近时“发现了烽火台”
  H.portal = function () {
    var p = typeof Interact !== 'undefined' && Interact.portal;
    if (p && p.found && !p.used && H.portalSeen !== p) {
      H.portalSeen = p;
      PF.x = p.x; PF.z = p.z;
      SFX.play('portal_found', PF);
    }
  };

  // ---------------- 命中、击杀（热路径） ----------------
  var HO = { s: 1, x: 0, z: 0 }, KO = { s: 1, x: 0, z: 0 }, BO = { x: 0, z: 0, mini: false };
  H.onDamage = function (e, crit, opts) {
    if (FX.tickDmg) { H.tickHits++; return; }   // 光环、毒云这种跳伤不出声（太密了）
    if (opts && opts.quiet) return;
    HO.x = e.x; HO.z = e.z;
    HO.s = e.boss ? 2 : (e.mini || e.elite) ? 1.5 : Math.max(0.7, Math.min(1.6, (e.r || 0.55) / 0.55));
    SFX.play(crit ? 'crit' : 'hit', HO);   // crit 只有 0 / 1
  };
  H.onKill = function (e) {
    if (e.boss) return;   // Boss 在 Game.onBossKilled 里
    if (e.elite || e.mini) { BO.x = e.x; BO.z = e.z; BO.mini = !!e.mini; SFX.play('kill_big', BO); return; }
    KO.x = e.x; KO.z = e.z;
    KO.s = Math.max(0.6, Math.min(2, (e.r || 0.55) / 0.55));
    SFX.play('kill', KO);
  };
  H.xp = function () {
    var t = now();
    if (t - H.xpT > 0.6) H.xpN = 0;
    H.xpT = t;
    CO.pitch = Math.pow(2, PENTA[Math.min(PENTA.length - 1, H.xpN)] / 12);
    if (SFX.play('xp', CO)) H.xpN++;
  };

  // Boss / 小 Boss 换招式时的声音（新加的招式没登记的用通用的“蓄力”）
  var BS = { x: 0, z: 0, vol: 1, pitch: 1, dur: 0, delay: 0 };
  H.bossState = function (e, from, to) {
    BS.x = e.x; BS.z = e.z; BS.vol = e.boss ? 1 : 0.75; BS.pitch = e.boss ? 1 : 1.2; BS.delay = 0;
    switch (to) {
      case 'slam': BS.dur = 1; SFX.play('slam_warn', BS); break;
      case 'charge': SFX.play('charge', BS); break;
      case 'volley': case 'orbs': BS.dur = 0.6; SFX.play('cast', BS); break;
      case 'spikes': BS.dur = 0.3; SFX.play('cast', BS); break;
      case 'lasers': BS.dur = 0.8; SFX.play('laser_warn', BS); break;   // 嗡嗡声在激光射出来时开（见 bossAI 的包装）
      case 'summon': SFX.play('summon', BS); break;
      case 'chase': case 'intro': break;
      default: if (!H.content) { BS.dur = 0.5; SFX.play('cast', BS); }   // 内容扩展在的话，新招式的声音走它的 special 事件
    }
    if (to === 'chase' && (from === 'volley' || from === 'orbs')) SFX.play('volley', BS);
    if (from === 'lasers') H.stopLaser();
  };
  H.stopLaser = function () { if (H.laser) { SFX.stopVoice(H.laser, 0.15); H.laser = null; } };
  // 激光嗡嗡声（循环音）：有 Boss / 小 Boss 正在射激光、游戏在进行中才响
  var LZ = { x: 0, z: 0, vol: 1, pitch: 1 };
  H.startLaser = function (e) {
    LZ.x = e.x; LZ.z = e.z; LZ.vol = e.boss ? 1 : 0.75; LZ.pitch = e.boss ? 1 : 1.2;
    H.laser = SFX.play('laser', LZ);
  };
  H.laserTick = function (play) {
    if (!H.laser) return;
    if (play && typeof Enemies !== 'undefined') {
      var list = Enemies.list;
      for (var i = 0; i < list.length; i++) { var e = list[i]; if (e.alive && (e.boss || e.mini) && e.state === 'lasers' && e.st <= 0) return; }
    }
    H.stopLaser();   // 停火、暂停、弹窗、阵亡、射激光的小 Boss 被打死……
  };

  // ---------------- 包装：敌人、刷怪导演（这些文件已经加载了） ----------------
  if (typeof Enemies !== 'undefined') {
    var dmg0 = Enemies.damage;
    Enemies.damage = function (e, dmg, crit, kx, kz, opts) {
      var r = dmg0.call(this, e, dmg, crit, kx, kz, opts);
      if (SFX.live && r > 0) H.onDamage(e, crit, opts);
      return r;
    };
    var kill0 = Enemies.kill;
    Enemies.kill = function (e) {
      var r = kill0.apply(this, arguments);
      if (SFX.live) H.onKill(e);
      return r;
    };
    var spawn0 = Enemies.spawn;
    Enemies.spawn = function (id, x, z, opts) {
      var e = spawn0.apply(this, arguments);
      if (SFX.live && opts && opts.elite) { PF.x = x; PF.z = z; SFX.play('elite', PF); }
      return e;
    };
    var ai0 = Enemies.bossAI;
    Enemies.bossAI = function (e) {
      var s0 = e.state;
      var r = ai0.apply(this, arguments);
      if (SFX.live) {
        if (e.state !== s0) { try { H.bossState(e, s0, e.state); } catch (err) { SFX.err(err); } }
        if (e.state === 'lasers' && e.st <= 0 && !H.laser) H.startLaser(e);   // 激光射出来了（暂停 / 弹窗回来也会重新接上）
      }
      return r;
    };
    var EO = { x: 0, z: 0 };
    after(Enemies, 'shoot', function (r, a) { if (SFX.live && a[0]) { EO.x = a[0].x; EO.z = a[0].z; SFX.play('enemy_shot', EO); } });
    var spk = 0, SO = { x: 0, z: 0, delay: 0, key: '' };
    after(Enemies, 'addHazard', function (r, a) {
      if (!SFX.live) return;
      SO.x = a[1]; SO.z = a[2]; SO.delay = Math.max(0, (+a[4] || 0) - 0.02); SO.key = 'spike' + (spk = (spk + 1) % 8);
      SFX.play('spike', SO);
    });
  }
  if (typeof Director !== 'undefined') {
    var rh0 = Director.rhythm;
    if (rh0) Director.rhythm = function (dt) {
      var s0 = Director.surgeT;
      var r = rh0.apply(this, arguments);
      if (SFX.live && Director.surgeT > s0 + 1) SFX.play('surge');
      return r;
    };
    after(Director, 'spawnMini', function () { if (SFX.live) SFX.play('mini'); });
    var sw0 = Director.startSwarm;
    Director.startSwarm = function () {
      var was = Director.swarm;
      var r = sw0.apply(this, arguments);
      if (!was && Director.swarm && SFX.ok) { SFX.play('swarm'); H.sync(); }
      return r;
    };
  }

  // ---------------- 武器 ----------------
  // 武器出手以外的事件（weapons.js 的 Weapons.emit(name, w, x, z, a1)）：事件 → [配方, 参数, 最短间隔秒, 限流键]
  // 参数里没写的照 SFX.weaponOpts（超武 +15 % 音量）；hook 用这把武器自己的出手声音；null = 不出声
  // gap 由这里管（同一个键两次之间至少 gap 秒），配方自己的 gap 不再叠加
  SFX.EMIT = {
    ring: ['w_bell', { soft: 1, vol: 0.6, pitch: 1.06 }, 0.25, 'w:bell2'],   // 铜钟后面几圈（第一圈是出手声）
    hook: [null, null, 0.3, null],                                         // 钓竿甩出去 = SFX.WEAPON[id]
    land: ['w_reel', { land: 1 }, 0.2, 'w:land'],                         // 鱼上岸
    ram: ['w_swing', { len: 0.3, lo: 200, hi: 700, dark: 1 }, 0.35, 'w:ram'],   // 骑枪冲锋
    quake: ['w_mine', { pitch: 0.8 }, 0.2, 'w:quake'],                    // 出师之剑的地震：低的闷响
    stick: ['w_heavy', { vol: 0.75 }, 0.15, 'w:stick'],                   // 标枪扎地（压到 §3.3 的上限以下）
    hop: ['w_throw', { kind: 'clack', wood: 1, vol: 1 }, 0.12, 'w:hop'],     // 棋子落地
    trap: ['w_mine', { snap: 1 }, 0.12, 'w:trap'],                        // 铁夹合上
    clang: ['w_throw', { kind: 'clang' }, 0.28, 'w:pan'],                 // 平底锅打中（悬着连打时一秒最多三四下）
    split: null                                                            // 弹弓分裂：命中声就够了
  };
  // 参数对象每个（事件, 武器, 超武）只建一次
  var EC = {};
  H.emitOpts = function (name, w) {
    var m = SFX.EMIT[name];
    if (!m || !w || !w.id) return null;
    var key = name + ':' + w.id + (w.evo ? '*' : ''), c = EC[key];
    if (c) return c;
    if (!m[0]) { var wc = SFX.weaponOpts(w), wo = {}; for (var q in wc.o) wo[q] = wc.o[q]; c = { name: wc.name, o: wo, gap: m[2] }; }
    else {
      var o = { key: m[3], evo: false, vol: w.evo ? 1.15 : 1 };   // 事件声音不加超武的金色闪光层（太密），只响一点
      for (var k in m[1]) o[k] = m[1][k];
      if (m[1].vol != null) o.vol = m[1].vol * (w.evo ? 1.15 : 1);
      if (name === 'ring' && w.evo) o.evo = true;   // 铜钟每一圈都是钟声，超武照样带闪光层
      c = { name: m[0], o: o, gap: m[2] };
    }
    c.o.x = 0; c.o.z = 0;
    EC[key] = c;
    return c;
  };
  H.onEmit = function (name, w, x, z) {
    if (!SFX.live) return null;
    var c = H.emitOpts(name, w);
    if (!c) return null;
    var o = c.o, ek = 'emit|' + (o.key || c.name), t = now(), last = SFX.last[ek];
    if (last != null && t - last < c.gap) { SFX.stats.limited++; return null; }
    if (x === x && z === z && x != null && z != null) { o.x = x; o.z = z; } else { o.x = P.pos.x; o.z = P.pos.z; }
    SFX.last[o.key || c.name] = null;   // 间隔这里已经管了
    var v = SFX.play(c.name, o);
    if (v) SFX.last[ek] = t;
    return v;
  };
  if (typeof Weapons !== 'undefined') {
    var hasEmit = typeof Weapons.emit === 'function';
    if (hasEmit) after(Weapons, 'emit', function (r, a) { H.onEmit(a[0], a[1], a[2], a[3]); });
    var fire0 = Weapons.fire;
    Weapons.fire = function (w) {
      var ok = fire0.apply(this, arguments);
      if (ok && SFX.live) { var c = SFX.weaponOpts(w); SFX.play(c.name, c.o); }
      return ok;
    };
    // 常驻武器：光环跳伤、提灯光束、环绕武器转一圈、足迹；钓竿在有 Weapons.emit 时走 'hook' 事件（没有时按 w.target 勾上的那一帧）
    var FO = { dur: 1, evo: false, key: '', vol: 1 };
    var per0 = Weapons.updatePersistent;
    Weapons.updatePersistent = function (w, dt) {
      if (!SFX.live) return per0.apply(this, arguments);
      var ty = w.def.type, t0 = w.tick, tg = w.target, fl = w.flaming, ang = w.ang || 0;
      H.tickHits = 0;
      var r = per0.apply(this, arguments);
      var c = null;
      if (ty === 'aura') { if (w.tick > (t0 || 0) + 0.01 && H.tickHits > 0) c = SFX.weaponOpts(w); }
      else if (ty === 'tether') { if (!hasEmit && !tg && w.target) c = SFX.weaponOpts(w); }
      else if (ty === 'flame') {
        if (!fl && w.flaming > 0) { c = SFX.weaponOpts(w); FO.dur = w.flaming; FO.evo = !!w.evo; FO.key = c.o.key; FO.vol = c.o.vol; SFX.play(c.name, FO); c = null; }
      } else if (ty === 'orbit') { if (Math.floor((w.ang || 0) / 6.2832) !== Math.floor(ang / 6.2832)) c = SFX.weaponOpts(w); }
      else if (ty === 'trail') { if (w.tick > (t0 || 0) + 0.01) c = SFX.weaponOpts(w); }
      if (c) SFX.play(c.name, c.o);
      return r;
    };
  }
  // 爆炸（武器、炸药桶、自爆怪、Boss 砸地……）和拾取的数字
  if (typeof FX !== 'undefined') {
    var BM = { x: 0, z: 0, r: 3 };
    after(FX, 'boom', function (r, a) { if (SFX.live) { BM.x = a[0]; BM.z = a[2]; BM.r = a[3] || 3; SFX.play('boom', BM); } });
    var pop0 = FX.popup;
    if (pop0) FX.popup = function (kind) {
      var r = pop0.apply(this, arguments);
      if (SFX.live) { if (kind === 'xp') H.xp(); else if (kind === 'gold') SFX.play('coin'); }
      return r;
    };
  }
  if (typeof Pickups !== 'undefined') {
    var PK = { heal: 'heal', magnet: 'magnet', clock: 'clock', rage: 'rage' }, BB = { r: 9 };
    after(Pickups, 'collect', function (r, a) {
      if (!SFX.live) return;
      var k = a[0];
      if (k === 'bomb') SFX.play('boom', BB);
      else SFX.play(PK[k] || 'powerup');
    });
  }

  // ---------------- 玩家：跳、落地、滑铲、摔伤、受伤 ----------------
  if (typeof P !== 'undefined') {
    var LO = { w: 0.5 };
    var up0 = P.update;
    P.update = function () {
      if (!SFX.live) return up0.apply(this, arguments);
      var sl = P.sliding, ju = P.jumpsUsed;
      var r = up0.apply(this, arguments);
      // 起跳那一帧 jumpBuffer 正好清零（其他帧都在往下减）
      if (P.jumpBuffer === 0 && P.vel.y > 0 && !P.onGround) SFX.play(P.jumpsUsed > ju ? 'jump2' : 'jump');
      if (!sl && P.sliding) SFX.play('slide');
      return r;
    };
    var land0 = P.land;
    P.land = function (impact) {
      H.fell = false;
      var r = land0.apply(this, arguments);
      if (SFX.live && !H.fell) {
        if (impact > 18) SFX.play('land_heavy');
        else if (impact > 7) { LO.w = Math.min(1, (impact - 7) / 11); SFX.play('land', LO); }
      }
      return r;
    };
    after(P, 'fallHurt', function (r) { if (r > 0) { H.fell = true; SFX.play('fall'); } });
    var hurt0 = P.hurt;
    P.hurt = function () {
      if (!SFX.live) return hurt0.apply(this, arguments);
      var hp0 = P.hp, sh0 = P.shield, inv0 = P.invuln;
      var r = hurt0.apply(this, arguments);
      try {
        if (P.hp < hp0 - 0.01) SFX.play('hurt');
        else if (P.shield < sh0 - 0.01) SFX.play('hurt_shield');
        else if (inv0 <= 0 && P.invuln === 0.15) SFX.play('evade');
        else if (inv0 <= 0 && P.invuln === 0.3 && now() - H.blockT > 0.05) SFX.play('block');
      } catch (e) { SFX.err(e); }
      return r;
    };
  }

  // 骑士被动（第 5 块）：Passive.emit(名字, x, z) → [配方, 音量, 音高, 别的参数（可以不写）]，限流键 'p_' + 名字
  if (typeof Passive !== 'undefined' && Passive.update) {
    var pu0 = Passive.update;
    Passive.update = function () { return pu0.apply(this, arguments); };
  }
  SFX.PASSIVE = {
    bell: ['w_bell', 1.2, 0.7], grave: ['heal', 0.8, 0.8], meal: ['powerup', 0.9, 0.9],
    letter: ['ready', 0.8, 1], letter_done: ['wish_good', 0.9, 1], letter_late: ['deny', 0.4, 1],
    laugh: ['p_honk', 0.8, 1], wind_empty: ['click', 0.5, 0.7], wind_full: ['charge_tick', 0.6, 1.2],
    star: ['p_star', 0.8, 1.1], falcon: ['ct_dive', 0.8, 1.2], sing: ['hurt_shield', 0.3, 1.5],
    rabbit: ['w_crackle', 0.8, 1.3], bee: ['w_dagger', 0.5, 1.6, { buzz: 1 }], meow: ['p_meow', 1, 1], fish: ['p_catch', 0.8, 1],
    lamp: ['fire_up', 0.6, 1.2], camp: ['ballista', 0.9, 1.1], flag: ['banner', 0.9, 1], fury: ['p_growl', 1, 1],
    // 第 6 块：宝物（Relic.emit 的名字前面加 r_）
    r_bugle: ['r_bugle', 1, 1], r_drum: ['r_drum', 1.1, 1], r_bark: ['r_bark', 0.7, 1], r_caw: ['r_caw', 0.6, 1],
    r_tinder: ['fire_up', 0.4, 1.4], r_bolt: ['w_zap', 0.7, 0.8], r_talisman: ['wish_good', 1, 1.1], r_duel: ['crit', 0.9, 0.8],
    r_stand: ['block', 0.6, 1.4], r_gust: ['puff', 0.6, 1.3], r_stirrup: ['w_heavy', 0.6, 0.8], r_knee: ['w_heavy', 0.35, 1.3],
    r_honey: ['powerup', 0.6, 1.2], r_grail: ['heal', 0.9, 1.2], r_medal: ['ready', 0.7, 0.9], r_shield: ['hurt_shield', 0.4, 1.3],
    r_caltrop: ['w_dagger', 0.25, 1.6]   // 一声短的金属「叮」；不能用 scrape（循环配方，会占满 loop 组）
  };
  // 有的事件另外限流（秒）：火绒盒点着的「呼」全宝物时一分钟能有四五十下，至少隔 1.5 秒
  SFX.PASSIVE_GAP = { r_tinder: 1.5 };
  if (typeof Passive !== 'undefined' && Passive.emit) {
    var PO = {}, PG = {};   // 每个事件一个参数对象（不在每次出声时新建）；PG：上次出声的时刻
    after(Passive, 'emit', function (r, a) {
      if (!SFX.live) return;
      var name = a[0], m = SFX.PASSIVE[name];
      if (!m) return;
      var o = PO[name];
      if (!o) {
        o = PO[name] = { x: 0, z: 0, vol: m[1], pitch: m[2], key: 'p_' + name };
        if (m[3]) for (var ok in m[3]) o[ok] = m[3][ok];   // 第 4 项：配方自己的参数（比如蜜蜂的 buzz），只合并一次
      }
      var gp = SFX.PASSIVE_GAP[name];
      if (gp && SFX.ctx && SFX.ctx.currentTime - (PG[name] == null ? -1e9 : PG[name]) < gp) return;
      var x = a[1], z = a[2];
      if (x === x && z === z && x != null && z != null) { o.x = x; o.z = z; } else { o.x = P.pos.x; o.z = P.pos.z; }
      if (SFX.play(m[0], o) && gp) PG[name] = SFX.ctx.currentTime;
    });
  }

  // ---------------- 地图上的东西 ----------------
  // 按 E / 互动按钮：用哪个声音（null 不出声：那一步自己有声音，比如召唤 Boss、传送）
  SFX.USE = {
    chest: 'chest',
    bossportal: null, exitportal: null, blacksmith: 'anvil', wishwell: 'wish', ballista: 'ballista', warhorse: 'horse', crypt: 'crypt',
    waystone: null, holyforge: 'forge',
    // 内容扩展（content_map.js）：秘宝箱用开宝箱的声音；火盆、挖宝、宝箱怪醒来有自己的 special 声音，商人有弹窗的声音
    ctChest: 'chest', ctBrazier: null, ctTreasure: null, ctMimic: null, ctMerchant: null
  };
  if (typeof Interact !== 'undefined') {
    var UO = { x: 0, z: 0, n: 1 };
    var use0 = Interact.use;
    Interact.use = function () {
      var o = Interact.near, can = null;
      if (SFX.live && o && !o.used && typeof Game !== 'undefined' && Game.state === 'play') { try { can = !!Interact.canUse(o); } catch (e) { can = null; } }
      var r = use0.apply(this, arguments);
      if (can !== null && SFX.live) {
        if (!can) SFX.play('deny');
        else {
          var name = SFX.USE[o.kind];
          if (name === undefined) name = 'use';
          if (name) { UO.x = o.x; UO.z = o.z; UO.n = 1; SFX.play(name, UO); }
        }
      }
      return r;
    };
    var PO = { x: 0, z: 0 };
    after(Interact, 'breakPot', function (r, a) { if (SFX.live && a[0]) { PO.x = a[0].x; PO.z = a[0].z; SFX.play('pot', PO); } });
    after(Interact, 'openExit', function () { if (SFX.live) SFX.play('portal_open'); });
  }
  if (typeof MX !== 'undefined') {
    var MO = { x: 0, z: 0, dur: 0.7, n: 2 };
    var at = function (o) { MO.x = o ? o.x : 0; MO.z = o ? o.z : 0; return MO; };
    after(MX, 'launch', function (r, a) { if (SFX.live) SFX.play('catapult', at(a[0])); });
    var lk0 = MX.lightKeg;
    if (lk0) MX.lightKeg = function (o, fuse) {
      var lit = o && o.fuse >= 0;
      var r = lk0.apply(this, arguments);
      if (SFX.live && o && !lit && o.fuse >= 0 && !o.used) { at(o); MO.dur = Math.max(0.2, +fuse || 0.7); SFX.play('fuse', MO); }
      return r;
    };
    after(MX, 'teleport', function () { if (SFX.live) SFX.play('teleport'); });
    after(MX, 'dismount', function (r, a) { if (SFX.live && !a[0]) SFX.play('puff'); });
    var BT = { x: 0, z: 0 };
    after(MX, 'fireBolt', function (r, a) { if (SFX.live && a[0]) { BT.x = a[0].x; BT.z = a[0].z; SFX.play('ballista_shot', BT); } });
    after(MX, 'smithPick', function () { if (SFX.live) { MO.n = 2; SFX.play('anvil', MO); } });
    var wr0 = MX.wishResolve;
    if (wr0) MX.wishResolve = function () {
      var n0 = P.mods.length, g0 = P.gold;
      var r = wr0.apply(this, arguments);
      if (SFX.live) {
        var m = P.mods.length > n0 ? P.mods[P.mods.length - 1] : null;
        if (m && m.stat === 'difficulty') SFX.play('wish_bad');
        else SFX.play('wish_good');
      }
      return r;
    };
    after(MX, 'fireDone', function (r, a) { if (SFX.live) SFX.play('fire_up', at(a[0])); });
    after(MX, 'cryptDone', function () { if (SFX.live) SFX.play('complete'); });
    after(MX, 'captureBanner', function (r, a) { if (SFX.live) SFX.play('banner', at(a[0])); });
  }
  // 超武：觉醒插曲；光柱；“可以觉醒了”提示
  if (typeof Evo !== 'undefined') {
    var ev0 = Evo.evolve;
    Evo.evolve = function () {
      var ok = ev0.apply(this, arguments);
      if (ok && SFX.ok) H.sting('evolve', 'pillar');
      return ok;
    };
    after(Evo, 'glory', function () { if (SFX.live) SFX.play('pillar'); });
    var cr0 = Evo.checkReady;
    if (cr0) Evo.checkReady = function () {
      var n0 = 0, n1 = 0, i;
      for (i = 0; i < P.weapons.length; i++) if (P.weapons[i].evoTold) n0++;
      var r = cr0.apply(this, arguments);
      for (i = 0; i < P.weapons.length; i++) if (P.weapons[i].evoTold) n1++;
      if (n1 > n0 && SFX.live) SFX.play('ready');
      return r;
    };
  }

  // ---------------- 界面：弹窗、选卡、按钮 ----------------
  if (typeof UI !== 'undefined') {
    var RV = { rarity: 0 }, SL = { rarity: 0 };
    var sl0 = UI.showLevelUp;
    UI.showLevelUp = function (reroll) {
      H.reroll = !!reroll;
      try { return sl0.apply(this, arguments); } finally { H.reroll = false; }
    };
    after(UI, 'openModal', function (r, a) {
      var id = a[0];
      if (id === 'levelModal') {
        if (UI.mode === 'level') {
          if (H.banishing) return;
          if (H.reroll) SFX.play('reroll');
          else H.sting('levelup', 'levelup');
        }
        else if (UI.mode !== 'evodone' && UI.mode !== 'pick' && UI.mode !== 'oath' && UI.mode !== 'supply' && UI.mode !== 'crucible' && UI.mode !== 'blacksmith' && UI.mode !== 'evoforge') SFX.play('open');
      } else if (id === 'itemModal') {
        var it = typeof ITEMS !== 'undefined' && ITEMS[UI.pendingItem];
        RV.rarity = it ? it.rarity : 0;
        if (H.feel) {
          // FEEL 的开箱动画会在揭晓的那一刻通知（见下面）；FEEL 没接手（没有开箱过场也没有通知）就 1.4 秒后自己响，
          // 那时弹窗已经关了就不响
          H.cancelReveal();
          H.revealWait = setTimeout(function () {
            H.revealWait = 0;
            var im = document.getElementById('itemModal');
            if (SFX.live && im && !im.classList.contains('hidden')) SFX.play('reveal', RV);
          }, 1400);
          return;
        }
        SFX.play('reveal', RV);
      } else if (id === 'shopModal') SFX.play('shop');
    });
    var po0 = UI.pickOption;
    UI.pickOption = function (i) {
      var o = UI.options && UI.options[i], banish = UI.mode === 'level' && UI.banishMode;
      if (banish) H.banishing = true;
      try {
        var r = po0.apply(this, arguments);
        if (o && SFX.live) {
          if (banish) SFX.play('banish');
          else { SL.rarity = o.rarity || 0; SFX.play('select', SL); }
        }
        return r;
      } finally { H.banishing = false; }
    };
    var act0 = UI.action;
    UI.action = function (a) {
      var snd = null;
      if (SFX.live) {
        try {
          switch (a) {
            case 'reroll': if (!(LevelUp.rerolls > 0 && UI.mode === 'level')) snd = 'deny'; break;
            case 'skip': snd = LevelUp.skips > 0 && UI.mode === 'level' ? 'skip' : 'deny'; break;
            case 'banish': snd = LevelUp.banishes > 0 && UI.mode === 'level' ? 'tick' : 'deny'; break;
            case 'takeItem': snd = 'take'; break;
            case 'leaveShop': snd = 'close'; break;
            case 'restart': case 'menu': case 'char': snd = 'click'; break;
            case 'start': snd = 'start'; break;
          }
        } catch (e) { SFX.err(e); }
      }
      var r = act0.apply(this, arguments);
      if (snd) SFX.play(snd);
      return r;
    };
    var buy0 = UI.buy;
    if (buy0) UI.buy = function () {
      var g0 = P.gold;
      var r = buy0.apply(this, arguments);
      if (SFX.live) SFX.play(P.gold < g0 ? 'buy' : 'deny');
      return r;
    };
    // 暂停界面第一次打开时把声音设置加进去（接在其他设置后面）
    var sp0 = UI.showPause;
    UI.showPause = function () { try { SFX.injectPause(); } catch (e) { SFX.err(e); } return sp0.apply(this, arguments); };
  }
  // 其他按钮（菜单里别的文件加的、设置里的……）：轻轻“嗒”一下；卡片和带 data-act 的按钮上面已经处理了
  document.addEventListener('click', function (e) {
    if (!SFX.live || !e.target || !e.target.closest) return;
    var b = e.target.closest('button');
    if (!b || b.disabled || b.closest('[data-act]') || b.closest('#touchBtns') || b.id === 'sfxMenuBtn') return;
    SFX.play('click');
  });
  // 电脑上鼠标移到卡片、骑士头像上：很轻的“嘀”
  document.addEventListener('pointerover', function (e) {
    if (!SFX.live || e.pointerType !== 'mouse' || !e.target || !e.target.closest) return;
    var c = e.target.closest('.card, .charCard');
    if (c && c.disabled) c = null;
    if (c !== H.hoverEl) { H.hoverEl = c; if (c) SFX.play('hover'); }
  });

  // ---------------- Game.*（main.js 最后加载）：在 load 事件里包装 ----------------
  H.installGame = function () {
    if (typeof Game === 'undefined' || H.gameDone) return;
    H.gameDone = true;
    var st0 = Game.start;
    Game.start = function () {
      H.won = false; H.holdUntil = 0; H.portalSeen = null; H.nextBeat = 0;
      H.stopLaser();
      if (SFX.closeMenuPop) SFX.closeMenuPop();
      var r = st0.apply(this, arguments);
      // 阵亡 / 通关的号角不拖进新的一局（也不再压着新曲子）
      try { M.cutStingers(0.3); } catch (e) { SFX.err(e); }
      H.sync();
      return r;
    };
    after(Game, 'nextStage', function () { H.portalSeen = null; H.stopLaser(); if (SFX.live) SFX.play('teleport'); H.sync(); });
    var sb0 = Game.summonBoss;
    Game.summonBoss = function () {
      var was = Game.bossAlive;
      var r = sb0.apply(this, arguments);
      if (!was && Game.bossAlive && SFX.ok) {
        SFX.play('boss_roar');
        SFX.play('war_drums', { n: 5, delay: 0.3 });
        H.holdUntil = 0;
        H.sync();
      }
      return r;
    };
    var bk0 = Game.onBossKilled;
    Game.onBossKilled = function (e) {
      var r = bk0.apply(this, arguments);
      if (SFX.ok) {
        H.stopLaser();
        SFX.play('boss_die', e ? { x: e.x, z: e.z } : null);
        if (!Game.bossAlive) {
          // 号角吹完再回到关卡的曲子
          H.holdUntil = now() + 3.4;
          H.sting('bossdown', 'complete');
          H.sync();
        }
      }
      return r;
    };
    var win0 = Game.win;
    Game.win = function () {
      var r = win0.apply(this, arguments);
      if (SFX.ok) {
        H.won = true;
        H.endAt = now() + 7.5;
        M.cutStingers(0.25);   // 还在放的 Boss 倒下号角让给通关号角
        H.sting('victory', 'complete');
        H.sync();
      }
      return r;
    };
    var dead0 = Game.onDeath;
    Game.onDeath = function () {
      // 还在响的战斗声（Boss 招式的长预警、爆炸……）0.2 秒淡出，让给阵亡的声音。先收再结算：
      // 结算时刚完成的成就（META 的提示音）不算在里面
      if (SFX.ok) SFX.hush(0.2, H.KEEP);
      var r = dead0.apply(this, arguments);
      if (SFX.ok) {
        H.won = false;
        if (H.loop) { SFX.stopVoice(H.loop, 0.1); H.loop = null; H.rideMode = null; }
        H.stopLaser();
        M.cutStingers(0.25);   // 升级 / 超武觉醒的插曲不和阵亡插曲叠在一起
        SFX.play('death');
        H.sting('defeat');
        H.sync();
      }
      return r;
    };
    after(Game, 'toMenu', function () { H.holdUntil = 0; H.won = false; H.stopLaser(); SFX.hush(0.3, H.KEEP); M.cutStingers(0.4); H.sync(); });
    var pz0 = Game.pause;
    Game.pause = function (on) {
      var s0 = Game.state;
      var r = pz0.apply(this, arguments);
      // 暂停：正在响的音效 0.08 秒淡出，不在暂停界面后面接着响完；继续游戏后新的声音照常响（不补放停掉的）
      if (Game.state === 'pause' && s0 !== 'pause') SFX.hush(0.08, H.KEEP);
      if (SFX.live && Game.state !== s0) SFX.play(Game.state === 'pause' ? 'pause' : 'resume');
      if (Game.state !== s0) SFX.tick();   // 马上停 / 继续音乐
      return r;
    };
    var uc0 = Game.updateChallenges;
    if (uc0) Game.updateChallenges = function () {
      var n0 = Game.challenges.length;
      var r = uc0.apply(this, arguments);
      if (SFX.live && Game.challenges.length < n0) SFX.play('complete');
      return r;
    };
    // 内容扩展（新敌人、Boss 新招式、地图秘密、随机事件）在的话：它的 special 事件对应到音效；
    // 随机事件、Boss 第二阶段、发现秘密有自己的回调（插曲、循环音、音乐叠加层）
    try {
      if (window.Content && typeof Content.on === 'function') {
        H.content = true;
        Content.on('special', safe(H.special));
        if (typeof Content.onEvent === 'function') Content.onEvent(safe(H.onEvent));
        if (typeof Content.onBossPhase === 'function') Content.onBossPhase(safe(H.onBossPhase));
        if (typeof Content.onSecretFound === 'function') Content.onSecretFound(safe(H.onSecret));
      }
    } catch (e) { SFX.err(e); }
    // FEEL（打击感）在的话：开箱的“揭晓”跟着它的动画走
    try {
      if (window.Feel && typeof Feel.on === 'function') {
        H.feel = true;
        // 开箱过场开始了：揭晓一定由 chestReveal 通知。过场最长 1.2 秒，帧率低（FEEL 每帧最多走 0.05 秒）或卡一下时更久，
        // 后备计时器不能再等（不然先响一声，揭晓时再响一声）
        Feel.on('chestOpen', safe(function () { H.cancelReveal(); }));
        Feel.on('chestReveal', safe(function (i) {
          H.cancelReveal();
          if (SFX.live) { RV2.rarity = i && i.rarity || 0; SFX.play('reveal', RV2); }
        }));
      }
    } catch (e) { SFX.err(e); }
  };
  var RV2 = { rarity: 0 };
  H.cancelReveal = function () { if (H.revealWait) { clearTimeout(H.revealWait); H.revealWait = 0; } };

  // ---------------- 内容扩展的 special 事件 → 音效（key 精确匹配，再按前缀；null 不出声） ----------------
  // CONTENT 发出的每一个 key 都在这里（content.js / content_map.js 里 Content.sfx(...) 的全部调用）；
  // 配方在 audio_sfx.js 的“内容扩展”（ct_ 开头）。预警类（tele 组）在招式打到人之前响，限流靠每个配方的 gap 和组上限
  SFX.SPECIAL = {
    // 原有的 Boss 招式（砸地、冲锋、弹幕、尖刺、激光、召唤）在上面按状态处理；CONTENT 也不发这些 key（写在这里防止重复）
    boss_slam: null, boss_charge: null, boss_volley: null, boss_orbs: null, boss_spikes: null, boss_lasers: null, boss_summon: null,
    // 关卡 Boss 的新招式：招式开始（还在蓄力）时响，给玩家躲的时间
    boss_rootgrid: ['ct_roots'], boss_seedbomb: ['ct_seed_launch'], boss_leafstorm: ['ct_leafstorm'],
    boss_sunbeam: ['ct_sun_call'], boss_sandwall: ['ct_sandwall'], boss_quicksand: ['ct_quicksand'],
    boss_bonerain: ['ct_bone_call'], boss_necrowave: ['ct_necro_slam'], boss_gravehands: ['ct_gravehands'],
    // 小 Boss 的新招式
    boss_boulder: ['ct_heave'], boss_bellyflop: ['ct_hop_warn'], boss_quakeline: ['ct_quake'], boss_acidrain: ['ct_acid_spit'],
    boss_phasedash: ['ct_phase_out'], boss_phasedash_go: ['ct_phase_dash'], boss_sweepbeam: ['ct_beam_charge'],
    bossLand: null,     // 小 Boss 跳起来砸地（bellyflop）落地：同一帧的 FX.boom（半径 5）已经响了 boom，冲击波还有 wave，再加一声会糊成一团
    bossPhase2: null,   // 第二阶段的怒吼和音乐变化在 Content.onBossPhase 里（H.onBossPhase），这里不重复
    // 共用的招式部件
    wave: ['ct_wave'], sunLock: ['ct_sun_lock'], sunbeam: ['ct_sun_pillar'],
    strike_root: ['ct_root_strike'], strike_sand: ['ct_sand_strike'], strike_bone: ['ct_bone_strike'],
    lob_seed: ['ct_thorns'], lob_rock: ['ct_rock_crash'], lob_acid: ['ct_acid_splash'],
    // 新敌人
    wolfHowl: ['howl'], wolfLunge: ['ct_lunge'], sporeWind: ['ct_spore_wind'], sporePuff: ['ct_spore_puff'],
    drumWind: ['ct_drum_roll'], drumBeat: ['ct_drum_buff'], wormSink: ['ct_burrow'], wormMark: ['ct_rumble_warn'], wormErupt: ['ct_erupt'],
    vultureMark: ['ct_screech'], vultureDive: ['ct_dive'], vultureImpact: ['ct_thud'], shieldBlock: ['ct_block'],
    tombRise: ['ct_tomb_rise'], tombCast: ['ct_tomb_cast'], split: ['ct_split'], lancerAim: ['ct_lance_aim'], lancerCharge: ['ct_lance_charge'],
    mimicHop: ['ct_mimic_hop'], mimicSpit: ['ct_mimic_spit'], mimicWake: ['ct_mimic_wake'],
    // 秘密地点、地形
    wallBreak: ['ct_wall_break'], brazierLit: ['ct_brazier'], brazierFail: ['ct_brazier_fail'], vaultOpen: ['crypt'],
    scroll: ['ct_scroll'], dig: ['ct_dig'], jumppad: ['catapult'],   // 跳台和投石跳台是同一种飞行：用同一个声音
    secretFound: null,  // 发现秘密的插曲在 Content.onSecretFound 里（H.onSecret）
    // 随机事件：开始的插曲、循环音和音乐叠加层都在 Content.onEvent 里（H.onEvent），结束时一定收掉
    event_meteor: null, event_goldgob: null, event_merchant: null, event_mimic: null, event_bloodmoon: null,
    meteorFall: ['ct_meteor_fall'], meteor: ['ct_meteor_hit']   // 流星往下落的哨音（预警）/ 砸地的火星（爆炸声 FX.boom 另外有）
  };
  // 以后新加的招式 / 打击 / 抛射物也有个通用的声音；新事件由 H.onEvent 的通用插曲处理
  SFX.SPECIAL_PREFIX = { boss_: ['cast', { dur: 0.5 }], strike_: ['ct_sand_strike'], lob_: ['ct_rock_crash'], event_: null };
  var SPO = {};
  H.special = function (key, x, y, z) {
    if (!SFX.live || typeof key !== 'string') return;
    var m = SFX.SPECIAL[key];
    if (m === null) return;
    if (!m) for (var pf in SFX.SPECIAL_PREFIX) if (key.indexOf(pf) === 0) { m = SFX.SPECIAL_PREFIX[pf]; break; }
    if (!m) return;
    for (var k in SPO) delete SPO[k];
    var o = m[1];
    if (o) for (k in o) SPO[k] = o[k];
    if (typeof x === 'number' && typeof z === 'number') { SPO.x = x; SPO.z = z; }
    SFX.play(m[0], SPO);
  };

  // ---------------- 内容扩展：随机事件、Boss 第二阶段、发现秘密 ----------------
  // 原则：持续的声音（流星雨的轰鸣、金袋哥布林的钱袋、音乐叠加层）都从游戏状态现算（Content.ev、Boss 的 phase2），
  // 每 50 毫秒对一次；事件回调只负责一次性的插曲，并马上对一次。所以不管事件怎么结束（成功、超时、被首领战 / 午夜钟声打断、
  // 换关、回菜单、阵亡、通关），声音都会收掉；暂停、弹窗、静音、页面隐藏时循环音也停（和 Boss 激光一样）
  H.ev = function () { return typeof Content !== 'undefined' && Content.ev || null; };
  H.inRun = function () { return typeof Game !== 'undefined' && Game.state !== 'menu' && Game.state !== 'end'; };
  // 有没有活着的、已经进入第二阶段的关卡 Boss（CONTENT 自己记着 Boss / 小 Boss 的短名单）
  H.phase2 = function () {
    var L = typeof Content !== 'undefined' && Content.bigs || (typeof Enemies !== 'undefined' ? Enemies.list : []);
    for (var i = 0; i < L.length; i++) { var e = L[i]; if (e.boss && e.alive && e.phase2) return true; }
    return false;
  };
  // 音乐叠加层：血月（关卡曲）、金袋哥布林在跑（关卡曲）、Boss 第二阶段（Boss 曲）
  M.layerFn = function (song, out) {
    if (!H.inRun()) return;
    var ev = H.ev(), stage = song && song !== 'boss' && song !== 'swarm' && song !== 'menu';
    if (ev && stage) {
      if (ev.type === 'bloodmoon') out.bloodmoon = true;
      else if (ev.type === 'goldgob' && ev.e && ev.e.alive) out.goldgob = true;
    }
    if (song === 'boss' && H.phase2()) out.phase2 = true;
  };
  // 血月期间关卡曲的强度再加一级（更紧张）
  var lv0 = M.levelFn;
  M.levelFn = function (p) {
    var L = lv0(p), ev = H.ev();
    if (ev && ev.type === 'bloodmoon' && p.id !== 'boss' && p.id !== 'swarm' && p.id !== 'menu') L = Math.min(2, L + 1);
    return L;
  };
  // 每 50 毫秒（和事件回调时）：流星雨的背景轰鸣、金袋哥布林身上的钱袋叮当
  var JO = { x: 0, z: 0 };
  H.evTick = function (t) {
    var ev = H.ev(), play = SFX.live && typeof Game !== 'undefined' && Game.state === 'play';
    if (H.meteorLoop && H.meteorLoop.dead) H.meteorLoop = null;
    var wantM = play && ev && ev.type === 'meteor';
    if (wantM && !H.meteorLoop) H.meteorLoop = SFX.play('ct_meteor_amb');
    else if (!wantM && H.meteorLoop) { SFX.stopVoice(H.meteorLoop, 0.9); H.meteorLoop = null; }
    if (play && ev && ev.type === 'goldgob' && ev.e && ev.e.alive && t >= (H.gobT || 0)) {
      H.gobT = t + 0.7 + Math.random() * 0.3;
      JO.x = ev.e.x; JO.z = ev.e.z;
      SFX.play('ct_gob_jingle', JO);
    }
  };
  H.evSync = function () {
    if (!SFX.ctx || !SFX.running) return;
    var t = now();
    try { H.evTick(t); M.syncLayers(t); } catch (e) { SFX.err(e); }
  };
  var tick0 = SFX.onTick;
  SFX.onTick = function (t) { tick0(t); H.evTick(t); };
  // 事件开始：一段插曲（在事件的位置上响：商人、哥布林、宝箱在哪听得出来）；结束：按结果收尾
  H.EV_START = { meteor: 'ct_ev_meteor', goldgob: 'ct_ev_gob', merchant: 'ct_ev_merchant', mimic: 'ct_ev_mimic', bloodmoon: 'ct_ev_bloodmoon' };
  H.EV_POS = { goldgob: true, merchant: true, mimic: true };
  H.EV_END = { 'goldgob:success': 'ct_gob_caught', 'goldgob:timeout': 'ct_gob_escape', 'merchant:success': 'buy', 'merchant:timeout': 'ct_merchant_bye', 'bloodmoon:timeout': 'ct_dawn' };
  var EVO = { x: 0, z: 0 };
  H.onEvent = function (i) {
    if (!i || typeof i.type !== 'string') return;
    if (SFX.live) {
      var name = i.phase === 'start' ? (H.EV_START[i.type] || 'portal_found') : H.EV_END[i.type + ':' + i.result];
      if (name) {
        var o = null;
        if (i.phase === 'start' && H.EV_POS[i.type] && typeof i.x === 'number' && typeof i.z === 'number') { EVO.x = i.x; EVO.z = i.z; o = EVO; }
        SFX.play(name, o);
      }
    }
    H.evSync();
  };
  // Boss 进入第二阶段：怒吼 + 镲；音乐（Boss 曲）加一层鼓和合唱、下一小节起快 6%、下一段升半音。Boss 死了 / 这一局结束就回去
  H.onBossPhase = function (e, phase) {
    if (phase !== 2) return;
    if (SFX.live) SFX.play('ct_phase2');   // 和 Boss 登场的吼叫一样不分左右远近：这是整场战斗的转折
    H.evSync();
  };
  // 发现秘密地点：插曲（音乐关掉时用音效版）；接下来 2 秒里的成就提示音往后挪，不叠在一起
  H.quietUntil = 0;
  H.onSecret = function () {
    if (!SFX.ok) return;
    H.sting('secret', 'ct_secret');
    H.quietUntil = now() + 2.2;
  };
  // 成就提示（META 的 toast 真正显示出来时发 knightmeta:toast）：成就音效
  var AO2 = { delay: 0 };
  window.addEventListener('knightmeta:toast', safe(function () {
    if (!SFX.live) return;
    AO2.delay = Math.max(0, Math.min(2.5, H.quietUntil - now()));
    SFX.play('achieve', AO2);
  }));
  window.addEventListener('load', safe(H.installGame));
})();
