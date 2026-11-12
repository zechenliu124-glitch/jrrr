'use strict';
// ============================================================
//  打击感和关键时刻（只包装别的文件的函数，不改它们；3D 部分在 feel_fx.js）
//  · 顿帧、慢动作：只在真实时间的主循环里缩放 dt（直接调用 Game.update(dt) 的结果不受影响）
//  · 镜头：顺滑的震动 + 大命中时的镜头冲击；过场时接管镜头（Boss 出场、开宝箱、阵亡拉远、通关环绕）
//  · 敌人死亡碎块；精英、小 Boss 爆炸 + 金币雨 + 冲击环；Boss 死亡慢动作 + 连环爆炸
//  · 升级金光、卡片落下来、选卡时弹一下；开宝箱：抖动、开盖、光圈（史诗以上才有光柱）、揭晓
//  · Boss 出场过场（黑边 + 像素横幅），强敌出现的公告；受伤方向红光、低血量硬边红框
//  · 换关的像素点阵 + 关卡卡片；关卡完成；午夜钟声；阵亡和通关（公告、横幅都用 kit.js 的，样子在 kit.css）
//  过场都会自己播完（测试只调用 Game.update），点一下或按空格/回车/Esc 可以跳过
//  设置：Feel.opts = { shake: 屏幕震动, flash: 闪光 }（0~1），存在 localStorage 'knight_magic_feel'
// ============================================================
var Feel = {
  opts: { shake: 1, flash: 1 },
  KEY: 'knight_magic_feel',
  installed: false,
  // 时间
  inLoop: false, realDt: 0, lastNow: null, scale: 1, rt: 0,
  stopUntil: 0, stopScale: 1, stopNext: 0, stopBudget: 0.12, slows: [],
  // 镜头
  kx: 0, ky: 0, kz: 0, kvx: 0, kvy: 0, kvz: 0, fk: 0, fkv: 0, camT: 0, baseFov: 0, fovMod: false,
  ov: null,
  // 序列
  seq: null, end: null, chestSeq: null, timers: [], drops: [],
  muteRe: null, inSelf: false, selfNext: false, held: false, dustN: 0, bigHitT: 0,
  lowLvl: -1, lvFlashT: -99, errors: []
};

// Boss / 小 Boss 的称号（原创）
Feel.EPI = {
  oakking: '林子里最老的那棵树醒了',
  hourglass: '会走路的大沙漏',
  sunkenbell: '钟里住着最后一任敲钟人',
  greenknight: '脑袋掉了还能接着打',
  shroomking: '伞盖比房顶还大',
  wormqueen: '沙丘下面最大的那张嘴',
  lizardlord: '举着铜盾的蜥人头领',
  ghostchamp: '输了最后一场，不肯下场',
  gravehound: '墓园巡夜，眼里烧着绿火',
  nightshade: '午夜钟声里走出来的影子',
  mimic: '看起来像金宝箱，其实长着牙'
};
// 关卡副标题
Feel.STAGE_SUB = ['雾气缭绕的古老林地', '烈日炙烤的古老商道', '沉钟夜夜作响的古城'];
// 稀有度颜色都从 RARITY（progression.js）来：卡片边框、光圈、闪屏用 color；3D 火花用 world（普通是灰色，不发白光，UI_STYLE §2.4）
Feel.RHEX = RARITY.map(function (r) { return r.color; });
// 3D 颜色（0xRRGGBB）：有 world 用 world，没有就用 color
Feel.worldHex = function (i) {
  var r = RARITY[clamp(i | 0, 0, RARITY.length - 1)];
  return r.world != null ? r.world : parseInt(String(r.color).slice(1), 16);
};
Feel.GREY = 0xb9c2d2;
// 往白色提亮 k（0~1）；提完三个通道都 ≥ 0xe0（发白）就改用调色板灰提亮——火花不发白光
Feel.lift = function (hex, k) {
  var up = function (h) {
    var c = [(h >> 16) & 255, (h >> 8) & 255, h & 255].map(function (v) { return Math.round(v + (255 - v) * k); });
    return { c: c, hex: (c[0] << 16) | (c[1] << 8) | c[2] };
  };
  var o = up(hex);
  if (o.c[0] >= 0xe0 && o.c[1] >= 0xe0 && o.c[2] >= 0xe0) o = up(Feel.GREY);
  return o.hex;
};
// 选卡火花：稀有度 3D 颜色提亮 35%
Feel.sparkHex = function (i) { return Feel.lift(Feel.worldHex(i), 0.35); };

// ---------------- 设置 ----------------
Feel.loadOpts = function () {
  try {
    var s = JSON.parse(localStorage.getItem(Feel.KEY) || 'null');
    if (s && typeof s === 'object') {
      for (var k in Feel.opts) if (typeof s[k] === 'number' && isFinite(s[k])) Feel.opts[k] = clamp(s[k], 0, 1);
    }
  } catch (e) { /* 没有本地存储就用默认值 */ }
};
// 第二批的设置面板用：Feel.setOpt('shake', 0.5)
Feel.setOpt = function (k, v) {
  if (!Object.prototype.hasOwnProperty.call(Feel.opts, k)) return;
  Feel.opts[k] = clamp(+v || 0, 0, 1);
  Feel.lowLvl = -1;
  try { localStorage.setItem(Feel.KEY, JSON.stringify(Feel.opts)); } catch (e) { /* 忽略 */ }
};

// 出错时：记下来、清掉自己的状态，游戏照常（测试会检查 Feel.errors）
Feel.fail = function (e) {
  var msg = (e && e.message) || String(e);
  if (Feel.errors.length < 20) Feel.errors.push(msg + ' @ ' + ((e && e.stack) || '').split('\n').slice(1, 3).join(' | '));
  try { console.warn('[Feel] ' + msg); } catch (e2) { /* 忽略 */ }
  // 结算界面还没出来的话先让它出来（不能卡在阵亡画面上）
  var E = Feel.end;
  if (E && !E.shown && E.run) { E.shown = true; var run = E.run; E.run = []; run.forEach(function (fn) { try { fn(); } catch (e4) { /* 忽略 */ } }); }
  try { Feel.reset(true); } catch (e3) { /* 忽略 */ }
};
Feel.safe = function (fn, a, b, c, d, e2, f) {
  try { return fn(a, b, c, d, e2, f); } catch (e) { Feel.fail(e); }
};
Feel.$ = function (id) { return document.getElementById(id); };

// ---------------- 关键时刻的事件（给音效、结算动画之类的别的文件用） ----------------
// Feel.on('bossLand', function (info) { ... })；名字和参数见 docs/knight-magic/design/FEEL_NOTES.md
Feel.handlers = {};
Feel.on = function (name, fn) { if (typeof fn === 'function') (Feel.handlers[name] || (Feel.handlers[name] = [])).push(fn); };
Feel.emit = function (name, info) {
  var L = Feel.handlers[name];
  if (!L) return;
  for (var i = 0; i < L.length; i++) { try { L[i](info || {}); } catch (e) { /* 别人的处理出错不影响这里 */ } }
};
Feel.ok3d = function () { return typeof FeelFX !== 'undefined' && FeelFX.ready && !!Game.scene; };
Feel.ease = function (k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); };

// 主循环真的在跑吗（玩家在玩）：正在主循环里，或者主循环 1 秒内跑过一帧（点击、按键是在两帧之间；很卡的一帧也算）。
// 测试把 Game.loop 换掉、只用 Game.update 快进时不算：阵亡 / 通关照原来的样子出结算界面（不等过场）
// 测试想看阵亡 / 通关过场（截图）时设 Feel.alwaysSeq = true
Feel.alwaysSeq = false;
Feel.loopWall = null;
Feel.loopAlive = function () {
  if (Feel.alwaysSeq || Feel.inLoop) return true;
  return Feel.loopWall != null && performance.now() - Feel.loopWall < 1000;
};

// ---------------- 定时任务（真实时间） ----------------
// 默认是“游戏”任务：暂停、别人的弹窗（升级、宝箱）打开时停住（横幅、Boss 死后的连环爆炸不会在弹窗后面放完）；
// ui 为真的是界面收尾任务（拿掉选卡动画、防误触），什么时候都走
Feel.later = function (sec, fn, tag, ui) { Feel.timers.push({ t: sec, fn: fn, tag: tag || '', ui: !!ui }); };
Feel.cancel = function (tag) {
  for (var i = Feel.timers.length - 1; i >= 0; i--) if (Feel.timers[i].tag === tag) Feel.timers.splice(i, 1);
};
Feel.tickTimers = function (dt, held) {
  var T = Feel.timers, i;
  for (i = 0; i < T.length; i++) if (T[i].ui || !held) T[i].t -= dt;
  for (i = 0; i < T.length;) {
    if (T[i].t <= 0) { var f = T[i].fn; T.splice(i, 1); f(); } else i++;
  }
};

// ============================================================
//  时间：顿帧（≤60 毫秒）和慢动作
// ============================================================
// ms：时长（最多 60 毫秒）；scale：这段时间的速度
// prio 0：大命中（两次之间至少隔 0.25 秒，还要给击杀留一点预算）
// prio 1：击杀精英 / 小 Boss、普通受伤（只看预算：大命中刚顿过，击杀那一下也照样顿）
// prio 2：Boss 倒下、重伤（不限）
// 预算每秒只回 0.04 秒：一直打精英、Boss 或者一直挨打时，大约一秒一次，不会一直卡顿
Feel.hitStop = function (ms, scale, prio) {
  var now = Feel.rt, d = Math.min(0.06, ms / 1000);
  prio = prio || 0;
  if (prio === 0 && (now < Feel.stopNext || Feel.stopBudget < d + 0.05)) return false;
  if (prio === 1 && Feel.stopBudget < d) return false;
  Feel.stopBudget = Math.max(0, Feel.stopBudget - d);
  Feel.stopScale = now < Feel.stopUntil ? Math.min(Feel.stopScale, scale) : scale;
  Feel.stopUntil = Math.max(Feel.stopUntil, now + d);
  Feel.stopNext = Math.max(Feel.stopNext, now + d + 0.25);
  return true;
};
// 慢动作：先保持 min 速度 hold 秒，再用 rel 秒平滑回到正常
Feel.slow = function (min, hold, rel) { Feel.slows.push({ min: min, hold: hold, rel: rel, t: 0 }); };

// held：暂停、别人的弹窗打开时慢动作停在原处（关掉以后接着放完）
// stopping：这一帧开始时还在顿帧里（按帧开始的时间算，帧率很低时顿帧也至少有一帧）
Feel.timeScale = function (dt, held, stopping) {
  var s = stopping ? Feel.stopScale : 1;
  for (var i = Feel.slows.length - 1; i >= 0; i--) {
    var w = Feel.slows[i], v;
    if (!held) w.t += dt;
    if (w.t < w.hold) v = w.min;
    else if (w.t < w.hold + w.rel) v = w.min + (1 - w.min) * Feel.ease((w.t - w.hold) / w.rel);
    else { Feel.slows.splice(i, 1); continue; }
    if (v < s) s = v;
  }
  // 顿帧预算：每秒回 0.04 秒，最多攒 0.12 秒（一直暴击、一直挨打也不会觉得卡）
  Feel.stopBudget = Math.min(0.12, Feel.stopBudget + dt * 0.04);
  return clamp(s, 0.03, 1);
};

// ============================================================
//  每帧
// ============================================================
// 真实时间（Game.update 一开始调用）：时间缩放、过场、横幅、实时特效、镜头弹簧
Feel.tick = function (dt) {
  var stopping = Feel.rt < Feel.stopUntil;
  Feel.rt += dt;
  var st = Game.state;
  var held = st === 'pause' || (st === 'modal' && !Feel.seq);
  if (held !== Feel.held || document.body.classList.contains('fxHold') !== held) { Feel.held = held; document.body.classList.toggle('fxHold', held); }
  Feel.scale = Feel.timeScale(dt, held, stopping);
  if (Feel.seq) Feel.seqTick(dt);
  if (Feel.end) Feel.endTick(dt);
  if (Feel.chestSeq) Feel.chestTick(dt);
  Feel.tickTimers(dt, held);
  if (st !== 'pause' && typeof FeelFX !== 'undefined') FeelFX.tickRT(dt);
  Feel.camTick(dt);
  if ((Feel.wd = (Feel.wd || 0) + dt) > 0.5) { Feel.wd = 0; Feel.watchdog(); }
};

// 保险：过场已经结束了，黑边、点击层、镜头接管、开箱样式都不能留着（无论中途发生了什么）
Feel.watchdog = function () {
  var b = document.body, chestOn = Feel.chestSeq && !Feel.chestSeq.done, endOn = Feel.end && !Feel.end.shown;
  if (!Feel.seq && (b.classList.contains('fxCine') || b.classList.contains('fxWarping'))) b.classList.remove('fxCine', 'fxWarping');
  if (!chestOn && b.classList.contains('fxChestOpen')) b.classList.remove('fxChestOpen');
  var c = Feel.$('fxCatch');
  if (c && c.className && c.className !== 'eat' && !Feel.seq && !chestOn && !endOn) Feel.catchOff();
  if (Feel.ov && !Feel.seq && !Feel.chestSeq && !Feel.end) Feel.ov = null;
  if (Feel.end && Game.state !== 'end') { Feel.restoreBody(); Feel.end = null; Feel.ov = null; b.classList.remove('fxDead', 'kmEnd'); }
  if (Feel.seq && Game.state !== 'modal') { Feel.seq = null; Feel.cineOut(); }
};

// 游戏时间（Game.update 之后）：碎块、落地扬尘
Feel.after = function (dt) {
  Feel.dustN = 0;
  var st = Game.state;
  if ((st === 'play' || st === 'end') && typeof FeelFX !== 'undefined') FeelFX.update(dt);
  if (st === 'play' && Feel.drops.length) Feel.checkDrops();
};

// 画完之后：低血量红边
Feel.afterRender = function () {
  var st = Game.state, lv = 0;
  if (st === 'play' && P.alive && P.st && P.st.maxHp > 0 && P.hp < P.st.maxHp * 0.3) lv = 1 + Math.min(3, Math.floor((1 - P.hp / (P.st.maxHp * 0.3)) * 4));
  if (lv !== Feel.lowLvl) {
    Feel.lowLvl = lv;
    var el = Feel.$('fxLow');
    if (el) {
      el.className = lv ? 'on l' + lv : '';
      el.style.opacity = lv ? String([0, 0.55, 0.7, 0.85, 1][lv] * Math.max(0.35, Feel.opts.flash)) : '0';
    }
  }
};

// ============================================================
//  镜头：震动（顺滑的噪声）、冲击（弹簧）、过场接管
// ============================================================
Feel.camTick = function (dt) {
  var K = 240, C = 2 * Math.sqrt(K) * 0.72, h = Math.min(dt, 0.05) / 2;
  for (var i = 0; i < 2; i++) {
    Feel.kvx += (-K * Feel.kx - C * Feel.kvx) * h; Feel.kx += Feel.kvx * h;
    Feel.kvy += (-K * Feel.ky - C * Feel.kvy) * h; Feel.ky += Feel.kvy * h;
    Feel.kvz += (-K * Feel.kz - C * Feel.kvz) * h; Feel.kz += Feel.kvz * h;
    Feel.fkv += (-K * Feel.fk - C * Feel.fkv) * h; Feel.fk += Feel.fkv * h;
  }
  Feel.camT += dt;
};

// 镜头冲击：沿 (dx, dz) 推 amt 米（再弹回来）；fov 是视野的瞬间变化（负数 = 往里一缩）
Feel.kick = function (dx, dz, amt, fov) {
  var k = Feel.opts.shake;
  if (!(k > 0)) return;
  var l = Math.sqrt(dx * dx + dz * dz);
  if (l > 1e-4 && amt) { Feel.kvx += dx / l * amt * 25 * k; Feel.kvz += dz / l * amt * 25 * k; }
  if (amt) Feel.kvy -= amt * 8 * k;
  if (fov) Feel.fkv += fov * 25 * k;
};

Feel._v = null;
Feel.camera = function (cam, shakeAmt) {
  if (!Feel._v) Feel._v = { r: new THREE.Vector3(), u: new THREE.Vector3(), l: new THREE.Vector3() };
  var V = Feel._v, moved = false, fov = cam.fov, ov = Feel.ov;
  Feel.baseFov = cam.fov;
  // 过场镜头（w 是混合权重）
  if (ov && ov.w > 0) {
    var w = ov.w, lx, ly, lz;
    var bx = P.pos.x, by = P.pos.y + P.CAM_HEIGHT + P.camLift - (P.camBobY || 0) + P.CAM_LOOK_UP, bz = P.pos.z;
    if (ov.rel) {
      // 在正常镜头的基础上往后、往上拉（阵亡）
      var dx = cam.position.x - bx, dz = cam.position.z - bz, dl = Math.sqrt(dx * dx + dz * dz) || 1;
      cam.position.x += dx / dl * ov.back * w; cam.position.z += dz / dl * ov.back * w; cam.position.y += ov.up * w;
      lx = bx; ly = by - (ov.drop || 0) * w; lz = bz;
    } else {
      cam.position.set(lerp(cam.position.x, ov.x, w), lerp(cam.position.y, ov.y, w), lerp(cam.position.z, ov.z, w));
      lx = lerp(bx, ov.lx, w); ly = lerp(by, ov.ly, w); lz = lerp(bz, ov.lz, w);
    }
    cam.lookAt(lx, ly, lz);
    if (ov.fov) fov = lerp(fov, ov.fov, w);
    if (ov.dfov) fov += ov.dfov * w;
    moved = true;
  }
  // 震动：几条不同频率的正弦叠起来（顺滑，不是每帧乱跳），乘设置里的力度
  var s = shakeAmt * Feel.opts.shake;
  if (s > 0.003) {
    var t = Feel.camT;
    var nx = Math.sin(t * 31 + 1.3) * 0.6 + Math.sin(t * 57 + 0.4) * 0.4;
    var ny = Math.sin(t * 37 + 2.1) * 0.6 + Math.sin(t * 63 + 4.2) * 0.4;
    V.r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    V.u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    cam.position.addScaledVector(V.r, nx * s * 0.42).addScaledVector(V.u, ny * s * 0.42);
    cam.rotateZ(Math.sin(t * 29 + 0.7) * s * 0.03);
    moved = true;
  }
  if (Math.abs(Feel.kx) + Math.abs(Feel.ky) + Math.abs(Feel.kz) > 1e-4) {
    cam.position.x += Feel.kx; cam.position.y += Feel.ky; cam.position.z += Feel.kz;
    moved = true;
  }
  if (Math.abs(Feel.fk) > 0.02) fov += Feel.fk;
  if (moved && W.noise) {
    var gh = W.groundAt(cam.position.x, cam.position.z, cam.position.y) + 0.35;
    if (cam.position.y < gh) cam.position.y = gh;
  }
  Feel.fovMod = Math.abs(fov - cam.fov) > 1e-3;
  if (Feel.fovMod) { cam.fov = clamp(fov, 20, 120); cam.updateProjectionMatrix(); }
  if (moved && P.updateHpBar) P.updateHpBar(cam);
};

// ============================================================
//  命中、击杀、受伤
// ============================================================
Feel.onHit = function (e, dealt, crit, kx, kz, opts, pf) {
  if (kx || kz) { e._fkx = kx; e._fkz = kz; e._fkt = Game.time; }
  var big = e.boss || e.mini || e.elite, now = Game.time;
  // 命中闪白：一次闪 0.1 秒（大目标 0.075 秒），闪完至少隔一会儿才能再闪 → 一直挨打时一闪一闪，不会一直是白的
  if (now < (e._fN || 0)) e.flash = pf;
  else { e.flash = big ? 0.075 : 0.1; e._fN = now + (big ? 0.17 : 0.15); }
  if (FX.tickDmg || (opts && opts.quiet)) return;
  if (big && (crit || dealt >= e.maxHp * (e.boss ? 0.012 : 0.04)) && Feel.rt >= Feel.bigHitT) {
    // 用真实时间限流（Game.time 换关时会归零）
    Feel.bigHitT = Feel.rt + (e.boss ? 0.9 : 0.6);
    if (Feel.hitStop(e.boss ? 32 : 38, 0.16, 0)) Feel.kick(e.x - P.pos.x, e.z - P.pos.z, e.boss ? 0.12 : 0.09, -0.8);
  }
  // 重击把小怪打退时脚下扬一点土
  if (!big && e.alive && e.grounded && (kx * kx + kz * kz) > 49 && Feel.dustN < 4) { Feel.dustN++; FeelFX.dust(e.x, e.y, e.z); }
};

// 击杀：碎块往击退方向飞；精英 / 小 Boss 爆得更大（Boss 在 Feel.onBossDown 里）
// 结果放在共用的数组里（每次击杀不新建数组），调用的地方马上取出来
Feel._d = [0, 0];
Feel.dirOf = function (e) {
  var d = Feel._d;
  if (e._fkt != null && Game.time - e._fkt < 0.3 && (e._fkx || e._fkz)) { d[0] = e._fkx; d[1] = e._fkz; }
  else { d[0] = e.x - P.pos.x; d[1] = e.z - P.pos.z; }
  return d;
};
Feel.onKill = function (e) {
  if (!Feel.ok3d() || e.boss) return;
  var d = Feel.dirOf(e), dx = d[0], dz = d[1];
  if (e.mini || e.elite) {
    Feel.emit('bigKill', { id: e.def.id, mini: !!e.mini });
    FeelFX.blast(e, dx, dz, !!e.mini);
    Feel.hitStop(e.mini ? 60 : 50, 0.08, 1);
    Feel.kick(dx, dz, e.mini ? 0.32 : 0.2, e.mini ? -3 : -1.8);
    Game.shake(e.mini ? 0.55 : 0.3);
    if (e.mini) Feel.slow(0.35, 0.16, 0.35);
    return;
  }
  // 普通小怪：场上碎块越多，每只碎得越少
  var n = FeelFX.chunks.length, c = n < 160 ? 5 : n < 280 ? 4 : n < 360 ? 3 : 2;
  if ((e.r || 0.5) > 0.75) c++;
  FeelFX.burst(e, dx, dz, c, 1, false, false);
};

// 受伤：顿帧、镜头往后一顶、伤害来的方向亮红光
// 重伤一定顿一下；被围着一直挨打时，小伤的顿帧最多一秒一次（红光和镜头照样每次都有）
Feel.hurtNext = 0;
Feel.onHurt = function (src, dhp) {
  var big = dhp >= P.st.maxHp * 0.15;
  if (big) Feel.hitStop(60, 0.1, 2);
  else if (Feel.rt >= Feel.hurtNext && Feel.hitStop(42, 0.1, 1)) Feel.hurtNext = Feel.rt + 1;
  Feel.emit('hurt', { amount: dhp, big: big });
  if (src && typeof src.x === 'number') {
    Feel.kick(P.pos.x - src.x, P.pos.z - src.z, big ? 0.3 : 0.17, big ? 2.4 : 1.4);
    Feel.dirFlash(src.x, src.z, big);
  } else Feel.kick(0, 0, 0, big ? 2.2 : 1.2);
};

// 伤害来的方向：屏幕那一边的硬边红带（样子在 kit.css 的 #fxDir.d0~d7：0 = 正前方 = 上边，顺时针 8 个方向，斜着来的打在角上）。
// 只动 opacity：0.24 秒分三格淡出，普通的最亮 50%、重伤 70%，乘闪光设置；少动画时亮 0.24 秒直接消失（不分格）
Feel.dirFlash = function (sx, sz, big) {
  var el = Feel.$('fxDir'), k = Feel.opts.flash;
  if (!el || !(k > 0) || typeof el.animate !== 'function') return;
  var yaw = P.yaw, fx = Math.sin(yaw), fz = Math.cos(yaw), rx = -fz, rz = fx;
  var dx = sx - P.pos.x, dz = sz - P.pos.z;
  var a = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
  var d = ((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8;
  if (el._fxD !== d) { el.className = 'd' + d; el._fxD = d; }
  if (Feel.rmq === undefined) { try { Feel.rmq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null; } catch (e) { Feel.rmq = null; } }
  el.animate([{ opacity: (big ? 0.7 : 0.5) * k }, { opacity: 0 }], { duration: 240, easing: Feel.rmq && Feel.rmq.matches ? 'steps(1, end)' : 'steps(3, end)' });
};

// 全屏闪光：亮度打六折、最多 30%，最长 0.3 秒，三格淡出（不是一大片白光慢慢消失）
Feel.screenFlash = function (color, a, dur) {
  var el = Feel.$('fxFlash'), k = Feel.opts.flash;
  if (!el || !(k > 0) || typeof el.animate !== 'function') return;
  el.style.background = color;
  el.animate([{ opacity: Math.min(a * 0.6, 0.3) * k }, { opacity: 0 }], { duration: Math.min(dur, 0.3) * 1000, easing: 'steps(3, end)' });
};

// 从天上掉下来的 Boss / 小 Boss：落地时扬尘、震屏
Feel.checkDrops = function () {
  for (var i = Feel.drops.length - 1; i >= 0; i--) {
    var e = Feel.drops[i];
    if (!e || !e.alive || e._fxLanded) { Feel.drops.splice(i, 1); continue; }
    if (e.grounded) {
      e._fxLanded = true;
      Feel.drops.splice(i, 1);
      if (Feel.ok3d()) FeelFX.slam(e.x, e.y, e.z, e.boss ? 7 : 4.5);
      Game.shake(e.boss ? 0.8 : 0.45);
      Feel.kick(0, 0, e.boss ? 0.35 : 0.2, 0);
    }
  }
};

// ============================================================
//  升级、选卡、开宝箱
// ============================================================
Feel.levelUp = function () {
  var lm = Feel.$('levelModal');
  if (!lm) return;
  lm.classList.remove('fxLvOpen');
  void lm.offsetWidth;
  lm.classList.add('fxLvOpen', 'fxGuard');
  Feel.cancel('lvguard');
  Feel.later(0.45, function () { lm.classList.remove('fxGuard'); }, 'lvguard', true);
  // 一局要升 30 次左右：闪光只留 15%（连着升好几级时后面几次更弱）
  var again = Feel.rt - Feel.lvFlashT < 1.5;
  Feel.lvFlashT = Feel.rt;
  Feel.emit('levelUp', { level: P.level, again: again });
  Feel.screenFlash('#fff2a8', again ? 0.11 : 0.25, 0.3);
  if (Feel.ok3d() && P.pos) {
    var x = P.pos.x, y = P.pos.y, z = P.pos.z;
    FeelFX.ring(x, y, z, 0.5, 4.8, 0xffd84a, 0.55, 1);
    FeelFX.ring(x, y, z, 0.3, 2.6, 0xffffff, 0.36, 0.9);
    // 金光柱：矮一点、细一半（大半在升级面板后面）
    FeelFX.beam(x, y, z, 0xffd84a, 4.5, 0.275, 0.6, false);
    FeelFX.sparkBurst(x, y + 1.1, z, again ? 14 : 26, 0xffe27a, 7, 0.1, 0.8, 4);
  }
};

// 卡片：落下来的先后（--fi）；稀有以上记下稀有度（史诗、传说外面多一圈硬边，样子在 kit.css；不发光、不闪、没有小星星）
Feel.decorateCard = function (c, i, r) {
  if (!c || !c.classList) return;
  c.style.setProperty('--fi', String(i));
  c.classList.add('fxCard');
  if (r >= 2) c.classList.add('fxR' + Math.min(4, r));
};
Feel.optRarity = function (o) {
  if (!o) return 0;
  if (o.itemId && typeof ITEMS !== 'undefined' && ITEMS[o.itemId]) return ITEMS[o.itemId].rarity || 0;
  return o.rarity || 0;
};
Feel.decorateCards = function () {
  var box = Feel.$('levelCards');
  if (!box) return;
  var cards = box.querySelectorAll('.card');
  for (var i = 0; i < cards.length; i++) Feel.decorateCard(cards[i], i, Feel.optRarity(UI.options && UI.options[+cards[i].dataset.i]));
};

// 选定一张卡：卡片放大一下、变亮、飞走，稀有度颜色的光圈扩散；骑士身上冒出火花
Feel.popCard = function (card, rect, r) {
  if (!card || !rect || !(rect.width > 0)) return;
  Feel.emit('pick', { rarity: r | 0, mode: UI.mode });
  var old = document.querySelectorAll('.fxPop');
  if (old.length >= 3) for (var i = 0; i < old.length; i++) if (old[i].parentNode) old[i].parentNode.removeChild(old[i]);
  var c = card.cloneNode(true);
  c.classList.remove('fxCard');
  c.classList.add('fxPop');
  c.removeAttribute('data-act');
  c.style.left = rect.left + 'px'; c.style.top = rect.top + 'px';
  c.style.width = rect.width + 'px'; c.style.height = rect.height + 'px';
  document.body.appendChild(c);
  var ring = document.createElement('div'), s = Math.max(rect.width, rect.height) * 0.9;
  ring.className = 'fxPopRing';
  ring.style.left = (rect.left + rect.width / 2 - s / 2) + 'px'; ring.style.top = (rect.top + rect.height / 2 - s / 2) + 'px';
  ring.style.width = s + 'px'; ring.style.height = s + 'px';
  ring.style.setProperty('--rc', Feel.RHEX[clamp(r | 0, 0, 4)]);
  document.body.appendChild(ring);
  Feel.later(0.5, function () { [c, ring].forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); }); }, 'pop', true);
  if (Feel.ok3d() && P.pos) {
    var hex = Feel.sparkHex(r);
    FeelFX.sparkBurst(P.pos.x, P.pos.y + 1.2, P.pos.z, 10 + (r | 0) * 4, hex, 5, 0.09, 0.6, -1);
    FeelFX.ring(P.pos.x, P.pos.y, P.pos.z, 0.4, 2.2, hex, 0.35, 0.8);
  }
};

// 宝箱弹窗打开之后（卡片已经放进去了）：有宝箱就先播开箱，没有就让卡片直接弹出来
Feel.chestReveal = function (id, rar, chest) {
  var im = Feel.$('itemModal');
  if (!im || im.classList.contains('hidden')) return;
  rar = clamp(rar | 0, 0, 4);
  var card = im.querySelector('.card');
  Feel.decorateCard(card, 0, rar);
  Feel.chestClasses(false);
  im.classList.add('fxR' + rar);
  // 没有开箱过场（许愿井浮上来的宝物、3D 还没准备好）：卡片马上弹出来，“揭晓”也马上通知（揭晓音效跟着这个事件走）
  if (!chest || !Feel.ok3d()) { void im.offsetWidth; im.classList.add('fxItemIn'); Feel.emit('chestReveal', { rarity: rar }); return; }
  var wait = [0.08, 0.12, 0.24, 0.34, 0.46][rar], dur = [0.55, 0.62, 0.78, 0.95, 1.2][rar];
  Feel.chestSeq = { t: 0, dur: dur, wait: wait, rar: rar, chest: chest, done: false, closing: -1, w: 0 };
  Feel.emit('chestOpen', { rarity: rar, item: id, wait: wait, reveal: dur });
  im.classList.add('fxChestWait');
  document.body.classList.add('fxChestOpen');
  if (Feel.bgAnim && Feel.bgAnim.cancel) { Feel.bgAnim.cancel(); Feel.bgAnim = null; }
  Feel.catchOn('chest');
  FeelFX.openChest(chest, rar, wait);
  // 镜头凑近宝箱：从骑士的斜侧方看过去（骑士和宝箱并排，骑士不会挡住宝箱）
  var cam = Game.camera, px = P.pos.x - chest.x, pz = P.pos.z - chest.z, pl = Math.sqrt(px * px + pz * pz);
  var a0 = pl > 0.3 ? Math.atan2(px, pz) : Math.atan2(cam.position.x - chest.x, cam.position.z - chest.z);
  var cx0 = cam.position.x - chest.x, cz0 = cam.position.z - chest.z, best = a0, bd = -1e9;
  var eyeY = function (qx, qz) { return W.noise ? Math.max(chest.y + 3.1, W.groundAt(qx, qz, chest.y + 4) + 1.2) : chest.y + 3.1; };
  [-1.15, 1.15, -1.9, 1.9].forEach(function (o) {
    var a = a0 + o, qx = chest.x + Math.sin(a) * 4.4, qz = chest.z + Math.cos(a) * 4.4;
    var d = Math.sin(a) * cx0 + Math.cos(a) * cz0 - Math.abs(o) * 2;
    if (Feel.blocked(qx, eyeY(qx, qz), qz, chest.x, chest.y + 1, chest.z)) d -= 100;
    if (d > bd) { bd = d; best = a; }
  });
  var ex = chest.x + Math.sin(best) * 4.4, ez = chest.z + Math.cos(best) * 4.4;
  var ey = eyeY(ex, ez);
  Feel.ov = { x: ex, y: ey, z: ez, lx: (chest.x * 2 + P.pos.x) / 3, ly: chest.y + 0.9, lz: (chest.z * 2 + P.pos.z) / 3, fov: 60, w: 0, own: 'chest' };
};

Feel.chestClasses = function (keepR) {
  var im = Feel.$('itemModal');
  if (!im) return;
  im.classList.remove('fxChestWait', 'fxItemIn');
  if (!keepR) im.classList.remove('fxR0', 'fxR1', 'fxR2', 'fxR3', 'fxR4');
  document.body.classList.remove('fxChestOpen');
};

Feel.chestTick = function (dt) {
  var s = Feel.chestSeq;
  s.t += dt;
  if (s.closing >= 0) s.closing += dt;
  // 镜头：0.3 秒凑过去，揭晓（或弹窗关掉）后 0.35 秒退回来
  var w = Feel.ease(s.t / 0.3);
  if (s.done) w = Math.min(w, 1 - Feel.ease((s.t - s.doneT) / 0.35));
  if (Feel.ov && Feel.ov.own === 'chest') Feel.ov.w = w;
  if (!s.done && s.t >= s.dur) Feel.chestShow();
  if (s.done && s.t - s.doneT >= 0.36) {
    if (Feel.ov && Feel.ov.own === 'chest') Feel.ov = null;
    if (s.closing >= 0) Feel.chestSeq = null;
  }
};

// 揭晓：面板和卡片弹出来；越稀有越热闹
Feel.chestShow = function () {
  var s = Feel.chestSeq;
  if (!s || s.done) return;
  s.done = true; s.doneT = s.t;
  Feel.emit('chestReveal', { rarity: s.rar });
  Feel.catchOff();
  var im = Feel.$('itemModal');
  if (im && !im.classList.contains('hidden')) {
    im.classList.remove('fxChestWait');
    void im.offsetWidth;
    im.classList.add('fxItemIn');
  }
  document.body.classList.remove('fxChestOpen');
  var C = typeof FeelFX !== 'undefined' && FeelFX.chest;
  if (C && C.on && !C.opened) C.t = Math.max(C.t, C.wait);
  if (s.rar >= 3) Feel.screenFlash(Feel.RHEX[s.rar], s.rar >= 4 ? 0.5 : 0.28, 0.45);
  if (s.rar >= 4) { Game.shake(0.35); if (Feel.ok3d()) FeelFX.sparkBurst(s.chest.x, s.chest.y + 1.2, s.chest.z, 24, Feel.sparkHex(4), 9, 0.12, 0.9, 6); }
};

// 宝箱弹窗关了（收下宝物）
Feel.chestEnd = function () {
  var s = Feel.chestSeq;
  if (!s || s.closing >= 0) return;
  s.closing = 0;
  if (!s.done) { s.done = true; s.doneT = s.t; Feel.catchOff(); }
  Feel.chestClasses(false);
  if (typeof FeelFX !== 'undefined') FeelFX.closeChest();
};

// ============================================================
//  局内公告（关卡卡片、强敌出现、关卡完成、午夜钟声）
// ============================================================
// 和 CONTENT 的事件、秘密地点是同一个公告系统 Kit.announce（kit.js）：一次一条，排在正上方那一列下面，跟游戏钟走。
// 小事是没有底板的描边像素字（文字公告），关卡完成是燕尾横幅；颜色按用途（金 = 好事，橙 = 强敌，红 = 危险）
Feel.BAN = {
  stage: { role: 'gold', big: true, life: 2.4, prio: 2 },
  mini: { role: 'org', icon: 'crown', life: 2.2, prio: 1 },
  clear: { look: 'rib', size: 'l', role: 'gold', icon: 'star', life: 2.8, prio: 3 },
  swarm: { role: 'red', big: true, icon: 'bell', life: 2.8, prio: 3 }
};
// o: { kind: 'stage'|'mini'|'clear'|'swarm', top（小标签）, title, sub, life }；返回显示出来的公告元素（排队了返回 null）
Feel.banner = function (o) {
  if (!o || typeof Kit === 'undefined') return null;
  var d = Feel.BAN[o.kind] || { role: 'gold', prio: 1 }, a = {}, k;
  for (k in d) a[k] = d[k];
  if (o.top) a.kick = o.top;
  a.title = o.title || '';
  if (o.sub) a.sub = o.sub;
  if (o.life) a.life = o.life;
  if (o.key != null) a.key = o.key;
  return Kit.announce(a);
};

// 关卡卡片：只写关卡名和一句话（「第 N 关」HUD 上已经有了）
Feel.stageCard = function () {
  var sd = Game.stageDef;
  if (!sd) return;
  Feel.emit('stage', { stage: Game.stage, name: sd.name });
  Feel.banner({ kind: 'stage', title: sd.name, sub: Feel.STAGE_SUB[Game.stage - 1] || '', key: 'stageCard' });
};

// ============================================================
//  阻塞的过场（Boss 出场、进传送门）：通过 Game.openModal 占着弹窗状态，播完自己调 Game.afterModal
// ============================================================
// 把弹窗状态交还（继续弹窗队列）
Feel.release = function () {
  if (Game.state !== 'modal') return;
  Feel.inSelf = true;
  try { Game.afterModal(); } finally { Feel.inSelf = false; }
};

Feel.cineIn = function () {
  document.body.classList.add('fxCine');
  Feel.catchOn('cine');
};
// 收尾：黑边退出、HUD 回来、镜头交还、点击层关掉；累计的视角拖动清零
Feel.cineOut = function () {
  document.body.classList.remove('fxCine');
  var t = Feel.$('fxCineT');
  if (t && t.classList.contains('on')) { t.classList.remove('on'); t.classList.add('off'); Feel.later(0.4, function () { t.classList.remove('off'); }, 'cine', true); }
  Feel.catchOff();
  if (Feel.ov && Feel.ov.own === 'cine') Feel.ov = null;
  if (typeof Input !== 'undefined' && Input.consumeLook) Input.consumeLook();
};

// 外部把弹窗关了（测试的 settle、换关、回菜单）：只收尾，不再交还弹窗状态
Feel.abortSeq = function () {
  var s = Feel.seq;
  if (!s) return;
  Feel.seq = null;
  if (s.kind === 'portal') { var wp = Feel.$('fxWarp'); if (wp) wp.className = ''; }
  Feel.cineOut();
};

// Boss 出场的名字：大号红色燕尾横幅 + 骷髅，称号写在上面的小标签里；放在上面那条黑边下面、天空的位置（kit.css）。
// sub：横幅下面的一行（「被烽火引来了！」：过场时 main.js 的同一句提示不出，第 13 块 T4 把它挪到这里）
Feel.cineTitle = function (name, epi, sub) {
  var t = Feel.$('fxCineT');
  if (!t) return;
  t.innerHTML = '';
  if (typeof Kit !== 'undefined') t.appendChild(Kit.ribbon({ role: 'red', size: Kit.heroSize(), tab: epi || '', title: name, icon: 'skull', sub: sub || '' }));
  t.classList.remove('off');
  void t.offsetWidth;
  t.classList.add('on');
};

// 镜头 (qx, qy, qz) 看向 (tx, ty, tz) 的视线有没有被地形、建筑挡住（镜头本身在建筑底下也算）
// 每 0.5 米看一次（城墙只有 1.6 米厚，隔太远会漏过去）；烽火台的塔身（没有碰撞盒）当成一根半径 2.9、高 4.4 米的柱子（带木梯）
Feel.blocked = function (qx, qy, qz, tx, ty, tz) {
  if (!W.noise) return false;
  var L = Math.sqrt(dist2(qx, qz, tx, tz)), n = Math.max(8, Math.ceil(L / 0.5));
  var tw = Feel._tw || Feel.towers();
  for (var k = 0; k <= n - 1; k++) {
    var f = k / n, x = qx + (tx - qx) * f, z = qz + (tz - qz) * f, y = qy + (ty - qy) * f;
    if (W.groundAt(x, z, 999) > y - 0.2) return true;
    for (var j = 0; j < tw.length; j++) if (y < tw[j].top && y > (tw[j].bot || -1e9) && dist2(x, z, tw[j].x, tw[j].z) < tw[j].r * tw[j].r) return true;
  }
  return false;
};
// 镜头本身贴着墙、塔（1.2 米以内）也不要：近裁剪面会切进模型里，整个画面一片砖色
Feel.cramped = function (qx, qy, qz) {
  if (!W.noise) return false;
  var tw = Feel._tw || Feel.towers(), j, k;
  for (j = 0; j < tw.length; j++) if (qy < tw[j].top + 1 && qy > (tw[j].bot || -1e9) - 1 && dist2(qx, qz, tw[j].x, tw[j].z) < (tw[j].r + 1.2) * (tw[j].r + 1.2)) return true;
  for (k = 0; k < 8; k++) {
    var a = k * Math.PI / 4;
    if (W.groundAt(qx + Math.cos(a) * 1.2, qz + Math.sin(a) * 1.2, 999) > qy - 0.4) return true;
  }
  return false;
};
// 没有碰撞盒、但挡视线的东西：烽火台（塔身 + 火盆到 4.1 米）
Feel.towers = function () {
  var out = [];
  if (typeof Interact === 'undefined' || !Interact.list) return out;
  for (var i = 0; i < Interact.list.length; i++) {
    var o = Interact.list[i];
    if (o.kind === 'bossportal') out.push({ x: o.x, z: o.z, r: 2.9, top: (o.y || 0) + 4.4 });   // 塔身 2.1 米 + 斜靠的木梯、垛口
  }
  // 钟楼顶上的残墩、断拱、钟梁（W.towerRuin，只是外观）：碰撞盒顶以上还有约 3 米；
  // 倒在地上的塔顶（5×7×5 的壳子 + 攒尖顶，下面只垫了一块 2.2 米高的碰撞体）：靠塔那头高约 5 米、屋顶那头约 4 米，按倒下的方向分两段
  var bt = W.bellTower;
  if (bt) {
    out.push({ x: bt.x, z: bt.z, r: 4.3, bot: bt.y - 1, top: bt.y + 3.2 });
    if (bt.g != null) {
      out.push({ x: bt.x + bt.sx * 5, z: bt.z + bt.sz * 5, r: 2.9, top: bt.g + 5.2 });
      out.push({ x: bt.x + bt.sx * 9, z: bt.z + bt.sz * 9, r: 2.9, top: bt.g + 4.2 });
    }
  }
  // 首领出场时：附近树的树冠（树干有碰撞圈，树冠没有）：碰撞圈 r = 0.6×大小，树冠半径约 2×大小、离地 1.6~6 倍大小
  var nb = Feel._near;
  if (nb && W.circles) for (i = 0; i < W.circles.length; i++) {
    var c = W.circles[i], th = W.terrainH(c.x, c.z);
    if (c.top - th < 15 || dist2(c.x, c.z, nb.x, nb.z) > nb.r * nb.r) continue;
    var sc = c.r / 0.6;
    out.push({ x: c.x, z: c.z, r: 2 * sc, bot: th + 1.6 * sc, top: th + 6 * sc });
  }
  return out;
};

// ---------------- Boss 出场 ----------------
Feel.bossIntro = function () {
  if (!Feel.ok3d()) return;
  Game.openModal(function () {
    var list = [], i;
    for (i = 0; i < Enemies.list.length; i++) if (Enemies.list[i].boss && Enemies.list[i].alive) list.push(Enemies.list[i]);
    if (!list.length || Game.state !== 'modal') { Feel.release(); return; }
    // 对准 Boss 本身（Boss 刷在传送门旁边 8 米，不在传送门中心）；好几只时对准它们的中间
    var cx = 0, cz = 0, H = 0, spread = 0;
    for (i = 0; i < list.length; i++) { cx += list[i].x; cz += list[i].z; H = Math.max(H, (list[i].def.headTop || 4) * (list[i].scale || 1)); }
    cx /= list.length; cz /= list.length;
    for (i = 0; i < list.length; i++) spread = Math.max(spread, Math.sqrt(dist2(cx, cz, list[i].x, list[i].z)));
    var gy = W.groundAt(cx, cz, 999), D = clamp(H * 1.45 + spread * 1.3 + 1, 8, 26);
    Feel._near = { x: cx, z: cz, r: D + 8 }; Feel._tw = null; Feel._tw = Feel.towers();
    var BR = 0; for (i = 0; i < list.length; i++) BR = Math.max(BR, (list[i].r || 1) * (list[i].scale || 1)); BR = BR * 0.8 + spread;
    // 镜头在 Boss 前方偏一侧、略低往上看；挑一个玩家不挡在镜头和 Boss 之间、离玩家也不太近的角度
    var a0 = Math.atan2(P.pos.x - cx, P.pos.z - cz), best = a0, bestUp = 0, bs = -1e9, camY = function (qx, qz) { return Math.max(gy + 1.6 + H * 0.12, W.groundAt(qx, qz, gy + H) + 1.2); };
    // 首领刷在烽火台旁边 8 米：玩家多半就站在烽火台那边，正对玩家的那个角度镜头会落进塔里（第 2、3 关一片砖色）。
    // 烽火台、钟楼、城墙都算挡视线；平视的角度都被挡住时把镜头抬高（+4 / +9 米）往下看
    [0, 4, 9].forEach(function (up) {
      [0.7, -0.7, 1.15, -1.15, 0.35, -0.35, 1.6, -1.6, 0, 2.2, -2.2, Math.PI].forEach(function (o) {
        var a = a0 + o, qx = cx + Math.sin(a) * D, qz = cz + Math.cos(a) * D, qy = camY(qx, qz) + up;
        var sx = cx - qx, sz = cz - qz, L2 = sx * sx + sz * sz || 1;
        var u = clamp(((P.pos.x - qx) * sx + (P.pos.z - qz) * sz) / L2, 0, 1);
        var clear = Math.sqrt(dist2(P.pos.x, P.pos.z, qx + sx * u, qz + sz * u)), dp = Math.sqrt(dist2(P.pos.x, P.pos.z, qx, qz));
        var sc = Math.min(clear, 5) * 2 + Math.min(dp, 7) - Math.abs(o) * 1.2 - up * 1.5;
        // 地形、建筑、烽火台、钟楼挡住视线、镜头贴着墙的角度基本不要：看首领的身子、头和身子两边（半个身宽，首领常常就站在塔边上）。
        // 分级扣分：贴墙、身子、头被挡扣得多，两边被挡扣得少（都被挡一点时，挑一个身子和头看得见的）
        var L1 = Math.sqrt(L2), px1 = -sz / L1 * BR, pz1 = sx / L1 * BR;
        if (Feel.cramped(qx, qy, qz)) sc -= 60;
        if (Feel.blocked(qx, qy, qz, cx, gy + H * 0.55, cz)) sc -= 30;
        if (Feel.blocked(qx, qy, qz, cx, gy + H * 0.95, cz)) sc -= 30;
        if (Feel.blocked(qx, qy, qz, cx + px1, gy + H * 0.5, cz + pz1)) sc -= 8;
        if (Feel.blocked(qx, qy, qz, cx - px1, gy + H * 0.5, cz - pz1)) sc -= 8;
        if (sc > bs) { bs = sc; best = a; bestUp = up; }
      });
    });
    var dx = Math.sin(best), dz = Math.cos(best), px = cx + dx * D, pz = cz + dz * D;
    var py = camY(px, pz) + bestUp;
    // 身子和头还是看不全（或者镜头贴墙）：退到首领上方偏后的高处往下看；先挑一个从那儿看得见首领身子和头的方向
    if (bs < -45) {
      var hi = gy + H + 12, D2 = D * 0.55, fb = null;
      [best, a0, a0 + Math.PI / 2, a0 - Math.PI / 2, a0 + Math.PI].some(function (a) {
        var qx = cx + Math.sin(a) * D2, qz = cz + Math.cos(a) * D2, qy = Math.max(hi, W.groundAt(qx, qz, 999) + 3);
        if (Feel.cramped(qx, qy, qz) || Feel.blocked(qx, qy, qz, cx, gy + H * 0.55, cz) || Feel.blocked(qx, qy, qz, cx, gy + H * 0.95, cz)) return false;
        fb = a; return true;
      });
      if (fb === null) fb = best;
      dx = Math.sin(fb); dz = Math.cos(fb); D = D2; px = cx + dx * D; pz = cz + dz * D; py = Math.max(hi, W.groundAt(px, pz, 999) + 3);
    }
    Feel._near = null; Feel._tw = null;
    Feel.seq = { kind: 'boss', t: 0, len: 1.7, list: list, landed: false, x: cx, y: gy, z: cz, H: H, D: D, dx: dx, dz: dz, py: py };
    Feel.ov = { x: px, y: py, z: pz, lx: cx, ly: gy + H * 0.55, lz: cz, fov: 58, w: 0, own: 'cine' };
    Feel.cineIn();
    Feel.emit('bossIntro', { id: list[0].def.id, count: list.length });
  });
};

Feel.bossLand = function (s) {
  if (s.landed) return;
  s.landed = true;
  s.list.forEach(function (e) {
    if (!e.alive) return;
    if (!e.grounded) { e.y = W.groundAt(e.x, e.z, e.y + 2); e.vy = 0; e.grounded = true; }
    e._fxLanded = true;
  });
  FeelFX.slam(s.x, s.y, s.z, 7.5);
  Game.shake(0.9);
  Feel.kick(0, 0, 0.45, -3);
  Feel.screenFlash('#ffffff', 0.32, 0.35);
  var b = s.list[0], n = s.list.length;
  Feel.emit('bossLand', { id: b.def.id, count: n });
  Feel.cineTitle(b.def.name + (n > 1 ? ' ×' + n : ''), Feel.EPI[b.def.id] || '', '被烽火引来了！');
};

Feel.seqTick = function (dt) {
  var s = Feel.seq, t = (s.t += dt);
  if (s.kind === 'boss') {
    var ov = Feel.ov;
    if (ov && ov.own === 'cine') {
      ov.w = t < 0.45 ? Feel.ease(t / 0.45) : t > s.len - 0.4 ? Feel.ease((s.len - t) / 0.4) : 1;
      // 停住时慢慢推近
      var pk = clamp((t - 0.5) / 1.0, 0, 1) * 0.1;
      ov.x = s.x + s.dx * s.D * (1 - pk); ov.z = s.z + s.dz * s.D * (1 - pk);
    }
    // Boss 从天上砸下来（世界停着，只动 Boss）
    if (!s.landed && t > 0.12) {
      var all = true;
      s.list.forEach(function (e) {
        if (!e.alive || e.grounded) return;
        e.vy = (e.vy || 0) - 70 * dt;
        e.y += e.vy * dt;
        var g = W.groundAt(e.x, e.z, e.y - e.vy * dt + 0.5);
        if (e.y <= g) { e.y = g; e.vy = 0; e.grounded = true; } else all = false;
      });
      if (all || t > 1.0) Feel.bossLand(s);
    }
    Enemies.render(0);
    FX.updateParts(dt);
    FX.updateEffects(dt);
    FeelFX.update(dt);
    if (typeof Shadows !== 'undefined' && Shadows.mesh) Shadows.update();
    if (t >= s.len) { Feel.seq = null; Feel.cineOut(); Feel.release(); }
  } else if (s.kind === 'portal') {
    var o2 = Feel.ov;
    if (o2 && o2.own === 'cine') { var q = clamp(t / s.len, 0, 1); o2.w = q * q; }
    if (t >= s.len) Feel.portalSwitch();
  }
};

// 跳过：Boss 出场直接落地、镜头快速转回；传送门直接换关
Feel.seqSkip = function () {
  var s = Feel.seq;
  if (!s) return;
  if (s.kind === 'boss') {
    if (!s.landed) Feel.bossLand(s);
    if (s.t < s.len - 0.3) s.t = s.len - 0.3;
  } else if (s.kind === 'portal') Feel.portalSwitch();
};

// ---------------- 进传送门：漩涡吸进去 → 换关 → 漩涡散开 + 关卡标题卡 ----------------
Feel.portal = function (o) {
  Game.openModal(function () {
    if (Game.state !== 'modal') return;
    Feel.seq = { kind: 'portal', t: 0, len: 0.55, o: o, switched: false };
    Feel.emit('portal', { stage: Game.stage });
    var wp = Feel.$('fxWarp');
    if (wp) { wp.className = ''; void wp.offsetWidth; wp.className = 'in'; }
    // 镜头往前一冲、视野拉宽（被吸进去的感觉）
    Feel.ov = { rel: true, back: -2.2, up: -0.4, drop: 0, dfov: 26, w: 0, own: 'cine' };
    document.body.classList.add('fxCine', 'fxWarping');
    Feel.catchOn('portal');
  });
};

Feel.portalSwitch = function () {
  var s = Feel.seq;
  if (!s || s.kind !== 'portal' || s.switched) return;
  s.switched = true;
  Feel.seq = null;
  Feel.ov = null;
  Feel.catchOff();
  document.body.classList.remove('fxCine', 'fxWarping');
  Feel.selfNext = true;
  try { Game.nextStage(); } finally { Feel.selfNext = false; }
  var wp = Feel.$('fxWarp');
  if (wp) {
    wp.className = 'out';
    Feel.later(0.75, function () { if (wp.className === 'out') wp.className = ''; }, 'warp', true);
  }
  if (typeof Input !== 'undefined' && Input.consumeLook) Input.consumeLook();
  Feel.release();
};

// ============================================================
//  Boss 倒下、关卡完成、午夜钟声
// ============================================================
Feel.onBossDown = function (e, last) {
  if (!e) return;
  var d = Feel.dirOf(e), dx = d[0], dz = d[1], x = e.x, y = e.y, z = e.z, col = e.def && e.def.color != null ? e.def.color : 0xffffff, k = clamp((e.scale || 1) * 0.9, 0.9, 1.6);
  if (Feel.ok3d()) FeelFX.bossBlast(e, dx, dz);
  Feel.emit('bossDown', { id: e.def && e.def.id, last: !!last });
  Feel.hitStop(60, 0.05, 2);
  Feel.slow(0.22, last ? 0.8 : 0.45, 0.6);
  Feel.screenFlash('#ffffff', 0.55, 0.5);
  Feel.kick(dx, dz, 0.5, -4);
  Game.shake(1);
  // 连环爆炸（慢动作里一个接一个）
  [0.14, 0.32, 0.5, 0.72].forEach(function (t, i) {
    Feel.later(t, function () {
      if (!Feel.ok3d()) return;
      FeelFX.aftershock(x, y, z, col, k);
      Game.shake(0.5 + i * 0.1);
      if (i === 3) Feel.screenFlash('#fff4d0', 0.35, 0.4);
    }, 'stage');
  });
  if (last) Feel.later(0.9, function () {
    Feel.emit('stageClear', { stage: Game.stage });
    Feel.banner({ kind: 'clear', title: '关卡完成', sub: '传送门已开启' });
  }, 'stage');
};

// 午夜钟声：天空往深靛蓝偏、倒计时变红，再加一条公告就够了
Feel.swarmStart = function () {
  Feel.emit('swarm', { stage: Game.stage });
  Feel.banner({ kind: 'swarm', title: '午夜钟声响了！', sub: '越来越多 · 越来越强' });
  Game.shake(0.4);
};

// ============================================================
//  阵亡、通关（Game.state 已经是 'end'；结算界面等过场放完再出来，点一下可以提前）
// ============================================================
// 阵亡 / 通关：同一种大号燕尾横幅（阵亡红色 + 骷髅，通关金色 + 奖杯），一行说明在下面；位置和进出在 kit.css
Feel.bigTitle = function (kind, title, sub) {
  var el = Feel.$('fxBig');
  if (!el) return;
  el.innerHTML = '';
  var win = kind === 'win';
  if (typeof Kit !== 'undefined') el.appendChild(Kit.ribbon({ role: win ? 'gold' : 'red', size: Kit.heroSize(), title: title, sub: sub || '', icon: win ? 'trophy' : 'skull' }));
  el.className = kind;
  void el.offsetWidth;
  el.className = kind + ' on';
};
Feel.bigOut = function () {
  var el = Feel.$('fxBig');
  if (el && el.classList.contains('on')) { el.classList.remove('on'); el.classList.add('off'); Feel.later(0.4, function () { el.className = ''; }, 'big', true); }
};

// 阵亡 / 通关的大字出来前：还没放完的 Boss 连环爆炸、局内公告（“关卡完成”、事件……）都收掉，不和大字叠在一起
// （内容扩展的随机事件、Boss 第二阶段、发现秘密也走 Kit.announce：同一个 Kit.annClear 一起收掉）
Feel.quietStage = function () {
  Feel.cancel('stage');
  if (typeof Kit !== 'undefined') Kit.annClear();
};

Feel.deathSeq = function (run) {
  Feel.emit('death', { stage: Game.stage, time: Game.totalTime });
  Feel.quietStage();
  Feel.end = { kind: 'dead', t: 0, len: 2.3, run: run || [], shown: false, fall: 0 };
  Feel.slows.length = 0;
  Feel.slow(0.25, 0.9, 0.7);
  Feel.screenFlash('#ff5040', 0.45, 0.55);
  // 画面压暗、HUD 收起来（kit.css 的 #kmDim，一层半透明深色；不给 3D 画布加滤镜）
  document.body.classList.add('fxDead');
  Feel.ov = { rel: true, back: 0, up: 0, drop: 0.6, w: 0, own: 'end' };
  Feel.catchOn('end');
  var sub = '第 ' + Game.stage + ' 关 · ' + (Game.stageDef ? Game.stageDef.name : '') + ' · 坚持了 ' + fmtTime(Game.totalTime);
  Feel.later(0.4, function () { if (Feel.end && Feel.end.kind === 'dead') Feel.bigTitle('dead', '阵亡', sub); }, 'end');
  // 往后倒：先转朝向再前后倾（坐骑 rides.js 本来就用 YXZ）；记下原来的顺序，收尾时还原
  if (P.body) { Feel.end.order0 = P.body.rotation.order; P.body.rotation.order = 'YXZ'; Feel.end.body = P.body; }
};

Feel.winSeq = function (run) {
  Feel.emit('win', { time: Game.totalTime, kills: P.kills });
  Feel.quietStage();
  Feel.end = { kind: 'win', t: 0, len: 3.0, run: run || [], shown: false, a0: P.yaw + Math.PI };
  Feel.slows.length = 0;
  Feel.screenFlash('#fff2a8', 0.5, 0.6);
  // HUD 收起来（和阵亡一样），结算界面出来时回来
  document.body.classList.add('kmEnd');
  Feel.ov = { x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, fov: 60, w: 0, own: 'end' };
  Feel.catchOn('end');
  Feel.bigTitle('win', '通关！', '用时 ' + fmtTime(Game.totalTime) + ' · 击杀 ' + fmtNum(P.kills) + ' · Lv ' + P.level);
  if (Feel.ok3d()) {
    FeelFX.confetti(P.pos.x, P.pos.y, P.pos.z, 90);
    FeelFX.sparkBurst(P.pos.x, P.pos.y + 1.2, P.pos.z, 30, 0xffe27a, 8, 0.12, 1.0, 5);
    FeelFX.ring(P.pos.x, P.pos.y, P.pos.z, 0.6, 7, 0xffd84a, 0.8, 1);
  }
  Feel.later(0.9, function () { if (Feel.end && Feel.end.kind === 'win' && Feel.ok3d()) FeelFX.confetti(P.pos.x, P.pos.y, P.pos.z, 60); }, 'end');
};

Feel.endTick = function (dt) {
  var E = Feel.end, t = (E.t += dt), ov = Feel.ov;
  if (E.kind === 'dead') {
    // 骑士往后倒下
    if (E.body && E.body === P.body) {
      var f = clamp(t / 0.55, 0, 1);
      E.body.rotation.x = -1.42 * f * f;
    }
    if (ov && ov.own === 'end') { ov.w = 1; var k = Feel.ease(t / 1.8); ov.back = 5 * k; ov.up = 3.6 * k; }
  } else if (E.kind === 'win') {
    if (ov && ov.own === 'end') {
      // 绕着骑士慢慢转
      var a = E.a0 + t * 0.42, R = 7.2;
      ov.w = Feel.ease(t / 0.8);
      ov.x = P.pos.x + Math.sin(a) * R; ov.z = P.pos.z + Math.cos(a) * R;
      ov.y = Math.max(P.pos.y + 3.2, W.noise ? W.groundAt(ov.x, ov.z, P.pos.y + 5) + 1.2 : 0);
      ov.lx = P.pos.x; ov.ly = P.pos.y + 1.3; ov.lz = P.pos.z;
    }
    // 赢了：骑士慢慢站定
    if (P.body && P.anim && typeof CHAR_MODELS !== 'undefined' && CHAR_MODELS.pose) {
      var a2 = P.anim;
      a2.t += dt; a2.run *= 0.8; a2.slide *= 0.8; a2.air *= 0.8;
      CHAR_MODELS.pose(P.body, a2);
    }
  }
  if (!E.shown && t >= E.len) Feel.endShow();
};

// 出结算界面（原来的代码排好的那一下）
Feel.endShow = function () {
  var E = Feel.end;
  if (!E || E.shown) return;
  E.shown = true;
  document.body.classList.remove('kmEnd');
  Feel.catchOff();
  Feel.bigOut();
  var run = E.run;
  E.run = [];
  for (var i = 0; i < run.length; i++) { try { run[i](); } catch (e) { Feel.fail(e); } }
  Feel.emit('endShow', { won: E.kind === 'win' });
};

// ============================================================
//  点一下跳过
// ============================================================
Feel.catchOn = function (kind) {
  var c = Feel.$('fxCatch');
  if (!c) return;
  c.dataset.k = kind;
  c.className = 'on ' + kind;
};
Feel.catchOff = function () {
  var c = Feel.$('fxCatch');
  if (c) c.className = '';
};
Feel.skip = function () {
  if (Feel.chestSeq && !Feel.chestSeq.done) { Feel.chestShow(); return true; }
  if (Feel.seq) { Feel.seqSkip(); return true; }
  if (Feel.end && !Feel.end.shown && Feel.end.t > 0.35) { Feel.endShow(); return true; }
  return false;
};

// ============================================================
//  全部清掉（新开一局、回菜单、出错）
// ============================================================
// 只还原阵亡过场动过的身体（倒下的角度、原来的旋转顺序）；别的时候不碰骑士
Feel.restoreBody = function () {
  var E = Feel.end, b = E && E.body;
  if (b && b.rotation && E.order0) { b.rotation.x = 0; b.rotation.z = 0; b.rotation.order = E.order0; E.order0 = null; }
};

Feel.reset = function (keepState) {
  Feel.restoreBody();
  if (Feel.seq && keepState && Game.state === 'modal') { Feel.seq = null; Feel.release(); }
  Feel.seq = null; Feel.end = null; Feel.chestSeq = null; Feel.ov = null;
  Feel.timers.length = 0; Feel.slows.length = 0; Feel.drops.length = 0;
  Feel.stopUntil = 0; Feel.scale = 1;
  Feel.kx = Feel.ky = Feel.kz = Feel.kvx = Feel.kvy = Feel.kvz = Feel.fk = Feel.fkv = 0;
  var b = document.body;
  if (b) b.classList.remove('fxCine', 'fxDead', 'fxChestOpen', 'fxHold', 'fxWarping', 'kmEnd');
  Feel.held = false;
  Feel.catchOff();
  Feel.chestClasses(false);
  // 局内公告（定时任务刚才已经清掉了）、Boss 名字、阵亡 / 通关的横幅
  if (typeof Kit !== 'undefined') Kit.annClear();
  ['fxCineT', 'fxBig'].forEach(function (id) { var el = Feel.$(id); if (el) { el.innerHTML = ''; el.className = ''; } });
  var wp = Feel.$('fxWarp'); if (wp) wp.className = '';
  var lm = Feel.$('levelModal'); if (lm) lm.classList.remove('fxLvOpen', 'fxGuard');
  var pops = document.querySelectorAll('.fxPop, .fxPopRing');
  for (var i = 0; i < pops.length; i++) if (pops[i].parentNode) pops[i].parentNode.removeChild(pops[i]);
  Feel.lowLvl = -1;
  if (typeof FeelFX !== 'undefined') FeelFX.clear();
};

// ============================================================
//  界面元素和样式
// ============================================================
// 这里只写位置、层级和显示 / 隐藏；样子（像素横幅、硬边红框、像素点阵、卡片和面板的进场、「点击跳过」）都在 css/kit.css，
// 动画只动 transform / opacity，一格格地跳（规则见 docs/knight-magic/design/UI_STYLE.md）
Feel.CSS = [
  // 低血量：屏幕边上三圈硬边红框（外层亮度按血量和闪光设置，里层的框和一格格的跳动在 kit.css）；少动画时不跳，框照样在
  '#fxLow { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: 0; }',
  '#fxLow i { position: absolute; inset: 0; opacity: 0; }',
  '#fxLow.on i { opacity: 0.8; }',
  // 受伤方向的红带（硬边的样子在 kit.css）、全屏闪光
  '#fxDir { position: fixed; inset: 0; z-index: 4; pointer-events: none; opacity: 0; }',
  '#fxFlash { position: fixed; inset: 0; z-index: 9; pointer-events: none; opacity: 0; }',
  // 过场：黑边（高度在 kit.css）、HUD 淡出、Boss 名字横幅（Kit.ribbon，放在上面那条黑边下面）
  '#hud { transition: opacity 0.3s; }',
  'body.fxCine #hud { opacity: 0; }',
  '#fxBars > div { position: fixed; left: 0; right: 0; background: #000; z-index: 8; pointer-events: none; transform: translateY(-101%); transition: transform 0.34s cubic-bezier(.3,.8,.3,1); }',
  '#fxBars > .t { top: 0; } #fxBars > .b { bottom: 0; transform: translateY(101%); }',
  'body.fxCine:not(.fxWarping) #fxBars > div { transform: none; }',
  '#fxCineT { position: fixed; left: 0; right: 0; z-index: 9; pointer-events: none; opacity: 0; }',
  '#fxCineT.on { opacity: 1; }',
  '#fxCineT.off { opacity: 0; }',
  // 点一下跳过
  '#fxCatch { position: fixed; inset: 0; z-index: 13; display: none; -webkit-tap-highlight-color: transparent; touch-action: none; }',
  '#fxCatch.on, #fxCatch.eat { display: block; }',
  '#fxCatch .hint { position: absolute; left: 50%; transform: translateX(-50%); white-space: nowrap; opacity: 0; }',
  // 传送门：一格格变密的蓝白像素点阵，和出口传送门的漩涡同色（换关时整个画面都盖住；颜色在 kit.css 的 #fxWarp）
  '#fxWarp { position: fixed; inset: 0; z-index: 9; pointer-events: none; overflow: hidden; opacity: 0; visibility: hidden; }',
  '#fxWarp.in, #fxWarp.out { visibility: visible; }',
  '#fxWarp .core { position: absolute; inset: 0; opacity: 0; }',
  '#fxWarp.out .core { opacity: 1; }',
  // 阵亡 / 通关的大号横幅（阵亡时画面压暗用 kit.css 的 #kmDim，不给 3D 画布加滤镜）
  '#fxBig { position: fixed; left: 0; right: 0; z-index: 9; text-align: center; pointer-events: none; display: none; }',
  '#fxBig.on, #fxBig.off { display: block; }',
  '#fxBig.off { opacity: 0; }',
  // 升级：刚打开时先别让卡片被点到（防误触）
  '#levelModal.fxGuard .card { pointer-events: none; }',
  // 选卡：选中的卡片往上一跳消失 + 方形的稀有度框散开
  '.fxPop { position: fixed !important; margin: 0 !important; z-index: 12; pointer-events: none !important; }',
  '.fxPopRing { position: fixed; z-index: 12; pointer-events: none; }',
  // 开宝箱：先看 3D 的开箱（面板藏起来、背景变淡），然后面板和卡片出来
  '#itemModal.fxChestWait { opacity: 0; pointer-events: none; }',
  'body.fxChestOpen #modalBg { opacity: 0.22; transition: opacity 0.2s; }',
  'body.fxChestOpen #prompt, body.fxChestOpen #btnUse { visibility: hidden; }',
  // 设置里关掉闪光时，原来的受伤红屏也跟着变弱（feel.js 用动画控制亮度）
  '#fxDir, #fxFlash, #fxLow { will-change: opacity; }'
].join('\n');

Feel.injectDom = function () {
  if (Feel.$('fxLayer')) return;
  var st = document.createElement('style');
  st.id = 'fxStyle';
  st.textContent = Feel.CSS;
  document.head.appendChild(st);
  var root = document.createElement('div');
  root.id = 'fxLayer';
  // #kmDim：阵亡时压暗画面的那一层（样子在 kit.css）；局内公告的那一层 #annLayer 由 Kit 自己建
  root.innerHTML = '<div id="kmDim"></div><div id="fxLow"><i></i></div><div id="fxDir"></div>' +
    '<div id="fxBars"><div class="t"></div><div class="b"></div></div><div id="fxCineT"></div>' +
    '<div id="fxFlash"></div><div id="fxWarp"><div class="core"></div></div><div id="fxBig"></div>' +
    '<div id="fxCatch"><div class="hint">点击跳过</div></div>';
  document.body.appendChild(root);
  var c = Feel.$('fxCatch');
  // 点一下跳过；跳过以后点击层再留 0.35 秒吃掉这次点击（不然手指抬起时的点击会落到刚出来的卡片、结算界面的按钮上）
  var hit = function (e) {
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    Feel.safe(Feel.skip);
    if (!c.className) { c.className = 'eat'; Feel.later(0.35, function () { if (c.className === 'eat') c.className = ''; }, 'catch', true); }
  };
  if (window.PointerEvent) c.addEventListener('pointerdown', hit);
  else { c.addEventListener('touchstart', hit, { passive: false }); c.addEventListener('mousedown', hit); }
  // 键盘：空格 / 回车 / Esc / E 跳过（吃掉这次按键，不会顺便跳一下或者暂停）
  window.addEventListener('keydown', function (e) {
    if (e.repeat) return;
    if (e.code !== 'Space' && e.code !== 'Enter' && e.code !== 'Escape' && e.code !== 'KeyE' && e.code !== 'NumpadEnter') return;
    var busy = (Feel.chestSeq && !Feel.chestSeq.done && e.code !== 'KeyE') || Feel.seq || (Feel.end && !Feel.end.shown && Feel.end.t > 0.35);
    if (!busy) return;
    if (Feel.safe(Feel.skip)) { e.preventDefault(); e.stopImmediatePropagation(); }
  });
  // 电脑上锁着鼠标转视角时，点击都落在画布上、到不了点击层：过场里按左键也当成“点一下跳过”
  document.addEventListener('mousedown', function (e) {
    if (!document.pointerLockElement || e.button !== 0) return;
    var busy = (Feel.chestSeq && !Feel.chestSeq.done) || Feel.seq || (Feel.end && !Feel.end.shown && Feel.end.t > 0.35);
    if (busy && Feel.safe(Feel.skip)) { e.preventDefault(); e.stopPropagation(); }
  }, true);
};

// ============================================================
//  包装别的文件的函数
// ============================================================
Feel.wrap = function (obj, name, make) {
  if (!obj || typeof obj[name] !== 'function') return false;
  obj[name] = make(obj[name]);
  return true;
};

Feel.hooks = function () {
  var W2 = Feel.wrap;
  // ---- 主循环：真实帧间隔；时间缩放只在这里生效 ----
  W2(Game, 'loop', function (loop) {
    return function (now) {
      var r = Feel.lastNow == null ? 1 / 60 : (now - Feel.lastNow) / 1000;
      Feel.lastNow = now;
      Feel.loopWall = performance.now();
      Feel.realDt = r > 0 ? Math.min(0.05, r) : 0;
      Feel.inLoop = true;
      try { return loop.apply(this, arguments); } finally { Feel.inLoop = false; }
    };
  });
  W2(Game, 'update', function (upd) {
    return function (dt) {
      var real = Feel.inLoop ? Feel.realDt : (dt > 0 ? dt : 0);
      Feel.safe(Feel.tick, real);
      if (Feel.inLoop && Feel.scale !== 1) dt *= Feel.scale;
      var r = upd.call(this, dt);
      Feel.safe(Feel.after, dt);
      return r;
    };
  });
  W2(Game, 'render', function (ren) {
    return function (dt) {
      if (Feel.inLoop && Feel.scale !== 1) dt *= Feel.scale;
      var r = ren.call(this, dt);
      Feel.safe(Feel.afterRender);
      return r;
    };
  });
  W2(Game, 'init', function (init) {
    return function () {
      var r = init.apply(this, arguments);
      Feel.safe(function () { FeelFX.init(Game.scene); });
      return r;
    };
  });
  // ---- 镜头 ----
  W2(P, 'updateCamera', function (uc) {
    return function (cam, dt) {
      if (Feel.fovMod && cam) cam.fov = Feel.baseFov;
      var s = Game.shakeAmt;
      Game.shakeAmt = 0;
      try { uc.apply(this, arguments); } finally { Game.shakeAmt = s; }
      if (cam) Feel.safe(Feel.camera, cam, s);
    };
  });
  // ---- 命中 / 击杀 / 掉落 ----
  W2(Enemies, 'damage', function (dmg) {
    return function (e, d, crit, kx, kz, opts) {
      var pf = e ? e.flash : 0;
      var r = dmg.apply(this, arguments);
      if (r > 0 && e) Feel.safe(Feel.onHit, e, r, crit === true ? 1 : (crit || 0), kx || 0, kz || 0, opts, pf);
      return r;
    };
  });
  W2(Enemies, 'kill', function (kill) {
    return function (e) {
      var on = Feel.ok3d() && e && !e.boss;
      Feel.eat = on ? 1 : 0;
      Feel.coinSplit = e && (e.mini || e.elite) ? (e.mini ? 12 : 7) : 0;
      var r;
      try { r = kill.apply(this, arguments); } finally { Feel.eat = 0; Feel.coinSplit = 0; }
      if (e) Feel.safe(Feel.onKill, e);
      return r;
    };
  });
  // 敌人死亡时原来的一小把方块：换成碎块（只吃掉 Enemies.kill 里的第一次）
  W2(FX, 'burst', function (burst) {
    return function () {
      if (Feel.eat) { Feel.eat = 0; return; }
      return burst.apply(this, arguments);
    };
  });
  // 精英、小 Boss 的金币拆成一阵金币雨（总数不变）
  W2(Pickups, 'gold', function (gold) {
    return function (x, y, z, v) {
      var n = Feel.coinSplit;
      if (!(n > 1) || !(v >= 2)) return gold.apply(this, arguments);
      Feel.coinSplit = 0;
      n = Math.min(n, Math.floor(v));
      var each = Math.floor(v / n), rest = v - each * n;
      for (var i = 0; i < n; i++) {
        gold.call(this, x, y, z, each + (i < rest ? 1 : 0));
        var c = Pickups.coins[Pickups.coins.length - 1];
        if (c && c.x === x && c.z === z) { var a = Math.random() * TAU, s = rand(2, 5); c.vx = Math.cos(a) * s; c.vz = Math.sin(a) * s; c.vy = rand(7, 11); }
      }
    };
  });
  W2(P, 'hurt', function (hurt) {
    return function (dmg, src) {
      var hp0 = P.hp, sh0 = P.shield, alive = P.alive;
      var r = hurt.apply(this, arguments);
      if (alive && P.hp < hp0 - 1e-6) Feel.safe(Feel.onHurt, src, hp0 - P.hp + Math.max(0, sh0 - P.shield));
      return r;
    };
  });
  // 原来的受伤红屏（style.css 的 #hurt：屏幕四边的细红框）：亮度跟着闪光设置，和 CSS 一样 0.24 秒分三格淡出
  W2(UI, 'flashHurt', function (fh) {
    return function () {
      var r = fh.apply(this, arguments);
      var h = Feel.$('hurt'), k = Feel.opts.flash;
      if (h && k < 1 && typeof h.animate === 'function') {
        h.classList.remove('on');
        if (k > 0) h.animate([{ opacity: k }, { opacity: 0 }], { duration: 240, easing: 'steps(3, end)' });
      }
      return r;
    };
  });
  // 被横幅、标题卡代替的提示：照常生成（别的包装照样会跑），马上拿掉
  W2(UI, 'toast', function (toast) {
    return function (text) {
      var r = toast.apply(this, arguments);
      if (Feel.muteRe && typeof text === 'string' && Feel.muteRe.test(text) && UI.toasts.length) {
        var t = UI.toasts[UI.toasts.length - 1];
        if (t && t.el && t.el.textContent === text) { if (t.el.parentNode) t.el.parentNode.removeChild(t.el); UI.toasts.pop(); }
      }
      return r;
    };
  });
  // ---- 升级、卡片、选卡 ----
  W2(UI, 'showLevelUp', function (sl) {
    return function (reroll) {
      var r = sl.apply(this, arguments);
      var lm = Feel.$('levelModal');
      if (!reroll && UI.mode === 'level' && lm && !lm.classList.contains('hidden')) Feel.safe(Feel.levelUp);
      return r;
    };
  });
  W2(UI, 'renderCards', function (rc) {
    return function () {
      var r = rc.apply(this, arguments);
      Feel.safe(Feel.decorateCards);
      return r;
    };
  });
  W2(UI, 'pickOption', function (po) {
    return function (i) {
      var card = null, rect = null, rar = 0, lm = Feel.$('levelModal');
      if (!UI.banishMode && lm && !lm.classList.contains('hidden')) {
        card = lm.querySelector('#levelCards .card[data-i="' + i + '"]');
        if (card) { rect = card.getBoundingClientRect(); rar = Feel.optRarity(UI.options && UI.options[i]); }
      }
      var r = po.apply(this, arguments);
      // 卡片已经不在打开的弹窗里了 = 选定了（放逐、“保留”的选项不算）
      if (card && (!card.isConnected || lm.classList.contains('hidden'))) Feel.safe(Feel.popCard, card, rect, rar);
      return r;
    };
  });
  // ---- 宝箱：弹窗打开、卡片放好之后接上开箱过场 ----
  W2(UI, 'chestReward', function (cr) {
    return function (id) {
      var chest = Feel.useChest, rar = typeof ITEMS !== 'undefined' && ITEMS[id] ? ITEMS[id].rarity : 0, om = Game.openModal;
      Game.openModal = function (fn) {
        Game.openModal = om;
        return om.call(Game, function () { var x = fn.apply(this, arguments); Feel.safe(Feel.chestReveal, id, rar, chest); return x; });
      };
      try { return cr.apply(this, arguments); } finally { Game.openModal = om; }
    };
  });
  W2(UI, 'closeModal', function (cm) {
    return function () {
      var r = cm.apply(this, arguments);
      if (Feel.seq && !Feel.inSelf) Feel.safe(Feel.abortSeq);
      Feel.safe(Feel.chestEnd);
      var lm = Feel.$('levelModal');
      if (lm) lm.classList.remove('fxLvOpen', 'fxGuard');
      return r;
    };
  });
  // 背景变暗淡入（从没有弹窗到有弹窗时）
  W2(UI, 'openModal', function (om) {
    return function () {
      var bg = Feel.$('modalBg'), was = bg && !bg.classList.contains('hidden');
      var r = om.apply(this, arguments);
      if (bg && !was && typeof bg.animate === 'function') Feel.bgAnim = bg.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
      return r;
    };
  });
  // ---- 互动：进传送门的过场；记住正在开的宝箱 ----
  W2(Interact, 'use', function (use) {
    return function () {
      var o = Interact.near;
      if (o && !o.used && o.kind === 'exitportal' && Game.state === 'play' && Feel.ok3d() && Interact.canUse(o)) { Feel.safe(Feel.portal, o); return; }
      var chest = o && o.kind === 'chest' && !o.used ? o : null;
      Feel.useChest = chest;
      var r;
      try { r = use.apply(this, arguments); } finally { Feel.useChest = null; }
      // 免费金宝箱被超武接管（没有宝物弹窗）：宝箱照样弹开、冒金色光柱，在觉醒弹窗后面亮一会儿再收起
      // （记下这一次开箱的编号：期间又开了别的宝箱，就不去关它）
      if (chest && chest.used && !Feel.chestSeq && Feel.ok3d()) Feel.safe(function () {
        var C = FeelFX.openChest(chest, 4, 0.05);
        if (!C) return;
        var tok = C.tok;
        Feel.later(1.6, function () { if (FeelFX.chest && FeelFX.chest.tok === tok) FeelFX.closeChest(); }, 'evochest', true);
      });
      return r;
    };
  });
  // ---- Boss、小 Boss、午夜钟声 ----
  W2(Game, 'summonBoss', function (sb) {
    return function () {
      var was = Game.bossAlive, r;
      // 有出场过场时才拿掉“… 降临！”（3D 特效没准备好就没有过场，提示留着）
      Feel.muteRe = Feel.ok3d() ? /降临！$/ : null;
      try { r = sb.apply(this, arguments); } finally { Feel.muteRe = null; }
      if (!was && Game.bossAlive) Feel.safe(function () {
        Enemies.list.forEach(function (e) { if (e.boss && e.alive && !e.grounded) Feel.drops.push(e); });
        Feel.bossIntro();
      });
      return r;
    };
  });
  W2(Director, 'spawnMini', function (sm) {
    return function (id) {
      var r, n0 = Enemies.list.length;
      Feel.muteRe = /出现了！$/;
      try { r = sm.apply(this, arguments); } finally { Feel.muteRe = null; }
      Feel.safe(function () {
        var e = Enemies.list.length > n0 ? Enemies.list[Enemies.list.length - 1] : null;
        if (e && e.mini && e.alive) Feel.drops.push(e);
        var d = typeof ENEMIES !== 'undefined' && ENEMIES[id];
        if (d) Feel.emit('mini', { id: id });
        if (d) Feel.banner({ kind: 'mini', top: '强敌出现', title: d.name, sub: Feel.EPI[id] || '' });
      });
      return r;
    };
  });
  W2(Director, 'startSwarm', function (ss) {
    return function () {
      var was = Director.swarm, r;
      Feel.muteRe = /午夜钟声响了/;
      try { r = ss.apply(this, arguments); } finally { Feel.muteRe = null; }
      if (!was && Director.swarm) Feel.safe(Feel.swarmStart);
      return r;
    };
  });
  W2(Game, 'onBossKilled', function (bk) {
    return function (e) {
      var r;
      Feel.muteRe = /传送门开启了/;
      try { r = bk.apply(this, arguments); } finally { Feel.muteRe = null; }
      Feel.safe(Feel.onBossDown, e, !Game.bossAlive);
      return r;
    };
  });
  // ---- 开局、换关、回菜单 ----
  W2(Game, 'start', function (start) {
    return function () {
      Feel.safe(Feel.reset);
      var r;
      Feel.muteRe = /^第 1 关/;
      try { r = start.apply(this, arguments); } finally { Feel.muteRe = null; }
      Feel.safe(Feel.stageCard);
      return r;
    };
  });
  W2(Game, 'nextStage', function (ns) {
    return function () {
      if (Feel.seq && !Feel.selfNext) Feel.safe(Feel.abortSeq);
      Feel.slows.length = 0; Feel.stopUntil = 0; Feel.drops.length = 0;
      Feel.cancel('stage');
      var st0 = Game.stage, r;
      Feel.muteRe = /^第 \d+ 关/;
      try { r = ns.apply(this, arguments); } finally { Feel.muteRe = null; }
      if (Game.stage !== st0 && Game.state !== 'end') Feel.safe(Feel.stageCard);
      return r;
    };
  });
  W2(Game, 'toMenu', function (tm) {
    return function () {
      Feel.safe(Feel.reset);
      return tm.apply(this, arguments);
    };
  });
  W2(Game, 'buildStage', function (bs) {
    return function () {
      var r = bs.apply(this, arguments);
      if (typeof FeelFX !== 'undefined') Feel.safe(FeelFX.clear);
      return r;
    };
  });
  // 外部把弹窗关了（不是过场自己交还的）：过场直接收尾
  W2(Game, 'afterModal', function (am) {
    return function () {
      if (Feel.seq && !Feel.inSelf) Feel.safe(Feel.abortSeq);
      return am.apply(this, arguments);
    };
  });
  // ---- 阵亡：原来 0.9 秒后出结算（setTimeout），先接住，等过场放完再出 ----
  W2(Game, 'onDeath', function (od) {
    return function () {
      if (Feel.seq) Feel.safe(Feel.abortSeq);
      Feel.chestSeq = null;
      // 主循环没在跑（测试快进）：和原来一样，0.9 秒后出结算界面
      if (!Feel.loopAlive()) { Feel.safe(Feel.quietStage); return od.apply(this, arguments); }
      var caught = [], st = window.setTimeout, r;
      window.setTimeout = function (fn) {
        if (typeof fn === 'function') { caught.push(fn); return 0; }
        return st.apply(window, arguments);
      };
      try { r = od.apply(this, arguments); } finally { window.setTimeout = st; }
      if (Game.state !== 'end') { caught.forEach(function (fn) { st.call(window, fn, 900); }); return r; }
      var ok = Feel.safe(function () { Feel.deathSeq(caught); return true; });
      if (!ok) caught.forEach(function (fn) { st.call(window, fn, 900); });
      return r;
    };
  });
  // ---- 通关：原来马上出结算（UI.showEnd），先接住，庆祝完再出 ----
  W2(Game, 'win', function (win) {
    return function () {
      if (Feel.seq && !Feel.selfNext) Feel.safe(Feel.abortSeq);
      Feel.chestSeq = null;
      // 主循环没在跑（测试快进）：和原来一样，马上出结算界面
      if (!Feel.loopAlive()) { Feel.safe(Feel.quietStage); return win.apply(this, arguments); }
      var se = UI.showEnd, caught = [], r;
      UI.showEnd = function () { var a = arguments; caught.push(function () { UI.showEnd.apply(UI, a); }); };
      try { r = win.apply(this, arguments); } finally { UI.showEnd = se; }
      if (Game.state !== 'end') { caught.forEach(function (fn) { fn(); }); return r; }
      var ok = Feel.safe(function () { Feel.winSeq(caught); return true; });
      if (!ok) caught.forEach(function (fn) { fn(); });
      return r;
    };
  });
};

Feel.install = function () {
  if (Feel.installed || typeof Game === 'undefined' || typeof UI === 'undefined') return;
  Feel.installed = true;
  Feel.loadOpts();
  Feel.injectDom();
  Feel.hooks();
  // 装得晚（Game.init 已经跑过了，包装不到）：3D 部分马上建好
  if (Game.scene) Feel.safe(function () { FeelFX.init(Game.scene); });
};
if (document.readyState === 'complete') Feel.install();
else window.addEventListener('load', Feel.install);
