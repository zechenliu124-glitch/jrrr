'use strict';
// ============================================================
//  玩家：移动物理（加速、跳跃、滑铲、兔子跳、空中加速）、属性、受伤、镜头
// ============================================================
var P = {
  pos: new THREE.Vector3(), vel: new THREE.Vector3(),
  yaw: 0, pitch: 0.3, camDist: 6.0, camLift: 0, camSnap: false,
  onGround: false, sliding: false, coyote: 0, jumpBuffer: 0, jumpsUsed: 0, landTime: 0,
  // 滑铲坐骑：sliding 地上滑，airRide 空中按住滑铲，riding = 两者之一（坐骑模型据此出现）
  airRide: false, riding: false, graceT: 0, kickLock: 0, slideT: 0, airTime: 0, groundY: 0, groundVy: 0,
  diveT: 0, diving: false, moonT: 0, wallHugT: 0, hugTextT: 0, flipT: 0, flipDone: false, camBob: 0, camBobY: 0, latchT: 0, hints: {},
  radius: 0.55, height: 1.8,
  hp: 100, shield: 0, shieldDelay: 0, invuln: 0,
  level: 1, xp: 0, xpNext: 10,
  gold: 0, kills: 0,
  st: {}, mods: [], weapons: [], tomes: [], items: {},
  char: null, model: null, body: null, hpBar: null, hpFill: null, anim: null, facing: 0, walkPhase: 0, alive: true,
  damageDealt: 0, regenAcc: 0, poison: 0
};

P.GRAVITY = 26;
P.BASE_SPEED = 10;
P.BASE_JUMP = 10;

// ---------------- 滑铲与空中手感（米、米/秒、秒） ----------------
// 滑铲：速度到 START 才起滑，低于 END 就停（按住方向键时最慢蹲着滑 CRAWL × 最大速度）；
// 跑着起滑小推一下（+KICK，最多到 KICK_CAP × 最大速度，速度低于 KICK_MIN × 最大速度不推，滑完 KICK_LOCK 秒内再起滑也不推）；
// 摩擦 FRIC + DRAG × 速度（越快越大：平地兔子跳比滑铲快，下坡滑铲更快）；坡度加速 SLOPE × 重力 × 坡度（坡度最多算 TAN_MAX），
// 下坡超过 SOFT 后加速变小，CAP 封顶；转向每秒最多 TURN 弧度，每转 1 弧度掉 DRAIN 的速度；滑满 JUMP_MIN 秒再跳才有加成
P.SL = { START: 3, END: 2, KICK: 2, KICK_CAP: 1.15, KICK_MIN: 0.6, KICK_LOCK: 0.6,
  FRIC: 2.5, DRAG: 0.07, SLOPE: 1.1, TAN_MAX: 1.2, TURN: 1.3, DRAIN: 0.22, SOFT: 45, CAP: 60, CRAWL: 0.35, JUMP_MIN: 0.1 };
// 空中（“漂移加速”）：按住前进、视角比速度方向偏 30~45° 时加速，偏过 60° 减速；
// 速度方向每秒最多转 STEER 弧度；低于 LOW_MAX × 最大速度时按 LOW 米/秒² 往输入方向加速；BRAKE 反向刹车上限；
// SOFT 以上漂移加速变小，CAP 封顶；空中按住滑铲时转向、刹车、低速加速 × CROUCH（漂移加速不变）
P.AIR = { STEER: 1.6, GAIN: 6, BRAKE: 8, LOW: 10, LOW_MAX: 0.6, SOFT: 34, CAP: 60, CROUCH: 0.5 };
P.LAND_GRACE = 0.10;                     // 落地后这么久没有地面摩擦（这时起跳不掉速）
P.STEER_MAX_ANGLE = 2.6;                 // 输入和速度方向几乎相反时不转向（只刹车）
// 摔落伤害：落地速度超过 SAFE（约 9.3 米高）后每多 1 米/秒扣 K × 最大生命，最多 MAX；不会摔死
P.FALL = { SAFE: 22, K: 0.02, MAX: 0.30 };
P.HINTS = {
  fall: '摔伤了！落地前按住滑铲、落在斜坡上就不会摔',
  slopeLand: '滑铲落坡：不摔伤，还加速！'
};
P.NO_TWIST = {};
// 当前骑士的坐骑特性（RIDES 在 rides.js 里；没有就是普通滑铲）
P.twist = function () {
  var id = P.char && P.char.id;
  return (typeof RIDES !== 'undefined' && id && RIDES[id] && RIDES[id].twist) || P.NO_TWIST;
};

// ---------------- 属性 ----------------
P.recalc = function () {
  var st = {}, k;
  for (k in STATS) st[k] = STATS[k].base;
  var ch = P.char;
  if (ch && ch.stats) for (k in ch.stats) st[k] += ch.stats[k];
  if (ch && ch.perLevel) for (k in ch.perLevel) st[k] += ch.perLevel[k] * (P.level - 1);
  st.maxHp += P.level - 1;                       // 每级 +1 最大生命
  var dmgMult = 1;
  for (var i = 0; i < P.tomes.length; i++) {
    var t = P.tomes[i], def = TOMES[t.id];
    if (def.stat === 'chaos') continue;
    if (def.mult) dmgMult *= t.mult;
    else st[def.stat] += t.value;
  }
  for (var id in P.items) {
    var it = ITEMS[id];
    if (it && it.stats) for (k in it.stats) st[k] += it.stats[k] * P.items[id];
  }
  for (i = 0; i < P.mods.length; i++) st[P.mods[i].stat] += P.mods[i].value;
  st.damage *= dmgMult;
  st.maxHp = Math.max(1, st.maxHp);
  st.armor = Math.max(0, st.armor);
  st.evasion = Math.max(0, st.evasion);
  st.atkSpeed = Math.max(0.2, st.atkSpeed);
  st.moveSpeed = Math.max(0.3, st.moveSpeed);
  var oldMax = P.st.maxHp || st.maxHp;
  P.st = st;
  if (st.maxHp > oldMax) P.hp += st.maxHp - oldMax;
  P.hp = Math.min(P.hp, st.maxHp);
};

P.addMod = function (stat, value) { P.mods.push({ stat: stat, value: value }); P.recalc(); };

P.armorPct = function () { return P.st.armor / (0.75 + P.st.armor); };
P.evadePct = function () {
  var e = P.st.evasion + (typeof Passive !== 'undefined' && Passive.evadeBonus ? Passive.evadeBonus() : 0);
  return e / (1 + e);
};
P.pickupRange = function () { return 5 * P.st.pickup; };

// ---------------- 初始化 ----------------
P.reset = function (charId) {
  P.char = CHARACTERS[charId];
  P.level = 1; P.xp = 0; P.xpNext = P.xpFor(1);
  P.gold = 0; P.kills = 0; P.damageDealt = 0; P.poison = 0; P.rage = 0;
  P.mods = []; P.weapons = []; P.tomes = []; P.items = {};
  P.st = {};
  Passive.reset();
  P.recalc();
  P.hp = P.st.maxHp; P.shield = P.st.shield;
  P.alive = true; P.invuln = 0;
  P.vel.set(0, 0, 0);
  P.pos.set(0, W.terrainH(0, 0) + 0.5, 0);
  P.yaw = 0; P.pitch = 0.32;
  P.sliding = false; P.airRide = false; P.riding = false; P.graceT = 0; P.kickLock = 0; P.slideT = 0; P.airTime = 0;
  P.diveT = 0; P.diving = false; P.moonT = 0; P.wallHugT = 0; P.hugTextT = 0; P.flipT = 0; P.flipDone = false; P.camBob = 0; P.camBobY = 0;
  P.latchT = 0; P.hints = {}; P.groundY = P.pos.y; P.groundVy = 0;
  if (Input.setTouchSlide) Input.setTouchSlide(false);
  Weapons.give(P.char.weapon);
  // 模型：外层放在脚下（不转），里面是角色（跟着跑动方向转）和脚下的血条
  if (P.model && P.model.parent) P.model.parent.remove(P.model);
  if (P.body) CHAR_MODELS.release(P.body);
  P.body = CHAR_MODELS.build(P.char.model);
  P.model = new THREE.Group();
  P.model.add(P.body);
  P.model.add(P.makeHpBar());
  P.model.userData = P.body.userData;
  if (typeof Ride !== 'undefined') Ride.attach(P.body, charId);   // 滑铲坐骑（rides.js）
  Game.scene.add(P.model);
  P.anim = { t: 0, run: 0, phase: 0, air: 0, vy: 0, slide: 0, flex: 0, land: 0, airT: 0 };
  P.facing = P.yaw;
  P.camSnap = true;
  P.camLift = 0;
  P.animate(0);
};

// 经验曲线：前期升得快，后期稳定；按关卡时长缩放（15 分钟为基准，开局几级不缩放），时长不同每关的成长进度一样
P.xpFor = function (lv) {
  var k = typeof Pace !== 'undefined' ? 1 + (Pace.xpScale() - 1) * clamp((lv - 3) / 12, 0, 1) : 1;
  var ramp = Math.min(1, 0.35 + lv / 10);
  return Math.max(3, Math.floor((4 + 1.6 * Math.pow(lv, 1.9) / (1 + lv / 120)) * ramp * k));
};

P.gainXp = function (v) {
  P.xp += v * P.st.xpGain;
  while (P.xp >= P.xpNext) {
    P.xp -= P.xpNext;
    P.level++;
    P.xpNext = P.xpFor(P.level);
    Passive.onLevel();
    P.recalc();
    Game.queueLevelUp();
  }
};

P.heal = function (v, quiet) {
  if (!P.alive) return;
  var before = P.hp;
  P.hp = Math.min(P.st.maxHp, P.hp + v);
  if (!quiet && P.hp - before >= 1) FX.text(P.pos.x, P.pos.y + 2.2, P.pos.z, '+' + Math.round(P.hp - before), '#5dff6a', 0.8);
};

P.hurt = function (dmg, src) {
  if (!P.alive || P.invuln > 0 || Game.state !== 'play') return;
  if (Math.random() < P.evadePct()) {
    FX.text(P.pos.x, P.pos.y + 2.2, P.pos.z, '闪避', '#9fe8ff', 0.9);
    P.invuln = 0.15;
    Passive.onEvade(src);
    return;
  }
  if (Passive.blocks(src)) { P.invuln = 0.3; return; }
  dmg = dmg * (1 - P.armorPct());
  if (P.shield > 0) {
    var a = Math.min(P.shield, dmg);
    P.shield -= a; dmg -= a;
  }
  P.shieldDelay = 3;
  P.hp -= dmg;
  P.invuln = 0.4;
  Game.shake(0.25);
  UI.flashHurt();
  if (src && P.st.thorns > 0 && src.alive) Enemies.damage(src, P.st.thorns * P.st.damage, 0, 0, 0);
  Passive.onHurt();
  if (P.hp <= 0) {
    if (P.items.zawarudo > 0) {
      // 时间停止：免于死亡一次，冻住周围所有敌人
      P.items.zawarudo--;
      P.hp = Math.max(1, P.st.maxHp * 0.3);
      P.invuln = 2.5;
      FX.text(P.pos.x, P.pos.y + 2.5, P.pos.z, '时间停止！', '#ffe14a', 1.6);
      Enemies.list.forEach(function (e) { e.frozen = Math.max(e.frozen, 4); });
      return;
    }
    P.hp = 0;
    P.alive = false;
    Game.onDeath();
  }
};

// ---------------- 移动 ----------------
P.forward = function () { return { x: Math.sin(P.yaw), z: Math.cos(P.yaw) }; };

P.accelerate = function (wx, wz, wishSpeed, accel, dt, refSpeed) {
  var cur = P.vel.x * wx + P.vel.z * wz;
  var add = wishSpeed - cur;
  if (add <= 0) return;
  var a = Math.min(accel * dt * (refSpeed || wishSpeed), add);
  P.vel.x += a * wx;
  P.vel.z += a * wz;
};

P.groundNormal = function (x, z, y) {
  var e = 0.6;
  var hx = W.groundAt(x + e, z, y) - W.groundAt(x - e, z, y);
  var hz = W.groundAt(x, z + e, y) - W.groundAt(x, z - e, y);
  return { x: -hx / (2 * e), z: -hz / (2 * e) };   // 下坡方向（未归一化）
};

// 下坡方向，长度（坡度）最多 TAN_MAX：塔楼墙边、坡道侧边的采样会算出夸张的坡度
P.slopeAt = function (x, z, y) {
  var n = P.groundNormal(x, z, y), g = Math.sqrt(n.x * n.x + n.z * n.z);
  if (g > P.SL.TAN_MAX) { n.x *= P.SL.TAN_MAX / g; n.z *= P.SL.TAN_MAX / g; g = P.SL.TAN_MAX; }
  n.g = g;
  return n;
};

// 速度方向和输入方向 (wx, wz) 的夹角：带符号，-π..π（正 = 输入在速度方向左边）
P.angleTo = function (wx, wz) {
  var v = P.vel;
  return Math.atan2(wx * v.z - wz * v.x, wx * v.x + wz * v.z);
};

// 把水平速度转向输入方向（速度大小不变）：偏得少时按比例慢慢转过去，偏 45°/stiff 以上时每秒正好转 rate 弧度；
// 几乎反向时不转。返回这一帧转过的角度。
// 视角匀速转动时，速度方向落后视角 转速/(rate×stiff)×45°：空中和滑板（stiff 1）落后得多，漂移/压弯就靠这个角度加速
P.steer = function (wx, wz, rate, dt, stiff) {
  var v = P.vel, d = P.angleTo(wx, wz), ad = Math.abs(d);
  if (ad < 1e-5 || ad > P.STEER_MAX_ANGLE || rate <= 0 || v.x * v.x + v.z * v.z < 1e-8) return 0;
  var s = d * (1 - Math.exp(-rate * (stiff || 1) / (Math.PI / 4) * dt)), cap = rate * dt;
  if (s > cap) s = cap; else if (s < -cap) s = -cap;
  var c = Math.cos(s), sn = Math.sin(s), x = v.x, z = v.z;
  v.x = x * c + z * sn; v.z = z * c - x * sn;
  return Math.abs(s);
};

// 漂移加速曲线：th 是速度和输入的夹角（0..π）。0~45° 越偏越快，45°~60° 回落到 0，再往后变成减速（反向时 -3）
P.driftF = function (th) {
  var a45 = Math.PI / 4, a60 = Math.PI / 3;
  if (th <= a45) return Math.sin(2 * th);
  if (th <= a60) return (a60 - th) / (a60 - a45);
  return -3 * (th - a60) / (Math.PI - a60);
};

// 按夹角加速或减速（strength：滑板地面压弯只用 0.4 的力度；ck：空中按住滑铲时刹车减半）
P.drift = function (th, wl, rd, strength, ck, dt) {
  var A = P.AIR, v = P.vel, hs = Math.sqrt(v.x * v.x + v.z * v.z);
  if (hs < 0.01) return;
  var f = P.driftF(th) * Math.min(1, wl), nh;
  if (f > 0) {
    if (hs >= A.CAP) return;
    var soft = hs > A.SOFT ? (A.SOFT / hs) * (A.SOFT / hs) : 1;
    nh = Math.min(A.CAP, hs + A.GAIN * (rd.airGain || 1) * f * soft * strength * dt);
  } else {
    nh = Math.max(0, hs - Math.min(A.BRAKE * ck, A.GAIN * -f) * strength * dt);
  }
  v.x *= nh / hs; v.z *= nh / hs;
};

// 开始 / 结束地面滑铲
P.startSlide = function (maxSpeed, kick) {
  P.sliding = true;
  P.slideT = 0;
  var hs = P.speed();
  // 跑着起滑：小推一下（落地接滑铲、刚滑完又起滑、速度太低都不推）
  if (kick && P.kickLock <= 0 && hs >= P.SL.KICK_MIN * maxSpeed && hs > 0.1) {
    var nh = Math.min(hs + P.SL.KICK, Math.max(hs, P.SL.KICK_CAP * maxSpeed));
    P.vel.x *= nh / hs; P.vel.z *= nh / hs;
  }
};
P.endSlide = function () {
  if (!P.sliding) return;
  P.sliding = false;
  P.kickLock = P.SL.KICK_LOCK;
};

// 地面滑铲：坡度加速、随速度变大的摩擦、转弯掉速（滑板改成压弯加速 + 蹬地）
P.slideMove = function (wx, wz, wl, maxSpeed, rd, dt) {
  var SL = P.SL, v = P.vel, board = rd.kind === 'board';
  P.slideT += dt;
  var n = P.slopeAt(P.pos.x, P.pos.z, P.pos.y), hs = Math.sqrt(v.x * v.x + v.z * v.z);
  if (n.g > 0.001) {
    var a = P.GRAVITY * SL.SLOPE * dt, along = v.x * n.x + v.z * n.z;
    if (along > 0 && hs > SL.SOFT) a *= (SL.SOFT / hs) * (SL.SOFT / hs);      // 下坡太快时加速变小（自然的极速）
    else if (along < 0 && rd.uphill != null) a *= rd.uphill;                  // 悬浮板上坡减速更少
    v.x += n.x * a; v.z += n.z * a;
    hs = Math.sqrt(v.x * v.x + v.z * v.z);
  }
  // 摩擦：越快越大；滑板落地后一小会儿没有摩擦
  if (hs > 0 && !(board && P.graceT > 0)) {
    var nh = Math.max(0, hs - (SL.FRIC + SL.DRAG * hs) * (rd.friction != null ? rd.friction : 1) * dt);
    v.x *= nh / hs; v.z *= nh / hs; hs = nh;
  }
  if (wl > 0.1) {
    var wlc = Math.min(1, wl);
    if (hs > 0.5) {
      var th = Math.abs(P.angleTo(wx, wz));
      var step = P.steer(wx, wz, (rd.turn || SL.TURN) * wlc, dt, board ? 1 : 3);
      // 普通滑铲：转得越急掉速越多；滑板：不掉速，压弯（视角带着转）还能加速
      if (board) P.drift(th, wl, rd, rd.carve != null ? rd.carve : 0.4, 1, dt);
      else { var k = 1 - SL.DRAIN * step; v.x *= k; v.z *= k; }
      hs = Math.sqrt(v.x * v.x + v.z * v.z);
    }
    if (board) {
      // 蹬地：低于最大速度时沿板子的方向加速（静止时朝输入方向蹬出去）；往回拉不蹬
      var top = maxSpeed * wlc;
      if (hs < top) {
        var px = wx, pz = wz;
        if (hs >= 1) { px = v.x / hs; pz = v.z / hs; }
        if (px * wx + pz * wz > 0) {
          var add = Math.min((rd.push || 6) * dt, top - hs);
          v.x += px * add; v.z += pz * add;
        }
      }
    } else {
      // 慢下来以后还按着方向键：蹲着慢慢滑（不会一停一走地闪）
      var crawl = SL.CRAWL * maxSpeed * wlc;
      if (hs < crawl) P.accelerate(wx, wz, crawl, 12, dt, 1);
    }
  }
  hs = Math.sqrt(v.x * v.x + v.z * v.z);
  if (hs > SL.CAP) { v.x *= SL.CAP / hs; v.z *= SL.CAP / hs; }
};

// 空中“漂移加速”：没有输入时速度不变（没有空气阻力）；投石跳台飞行中由 MX.updateFlight 转向
P.airMove = function (wx, wz, wl, maxSpeed, rd, dt) {
  if (typeof MX !== 'undefined' && MX.flyT > 0) return;
  var A = P.AIR, v = P.vel, board = rd.kind === 'board';
  var ck = P.airRide && !rd.airBoard ? A.CROUCH : 1;
  var hs = Math.sqrt(v.x * v.x + v.z * v.z);
  if (wl > 0.1) {
    var wlc = Math.min(1, wl), lowMax = A.LOW_MAX * maxSpeed;
    if (hs < lowMax) P.accelerate(wx, wz, lowMax * wlc, A.LOW * ck, dt, 1);
    hs = Math.sqrt(v.x * v.x + v.z * v.z);
    if (hs >= 3) {
      var th = Math.abs(P.angleTo(wx, wz));
      P.steer(wx, wz, A.STEER * ck * wlc, dt);
      P.drift(th, wl, rd, 1, ck, dt);
    }
  }
  // 滑板：空中踩着板子继续加速（每秒 +3 米/秒，到 1.3 倍最大速度）
  if (board && P.airRide) {
    hs = Math.sqrt(v.x * v.x + v.z * v.z);
    var top = (rd.airCap || 1.3) * maxSpeed;
    if (hs > 1 && hs < top) { var nh = Math.min(top, hs + (rd.airPush || 3) * dt); v.x *= nh / hs; v.z *= nh / hs; }
  }
};

// 滑板空翻：一次腾空最多一次，腾空 0.3 秒后、估计还够 0.35 秒转一圈时开始（P.flipT 0..1 给坐骑动画用）
P.FLIP_TIME = 0.35;
P.updateFlip = function (dt, rd, g) {
  var ft = rd.flipTime || P.FLIP_TIME;
  if (P.flipT > 0) {
    // 落地时还没转完：在地上快速转完
    P.flipT += dt / ft * (P.onGround ? 3 : 1);
    if (P.flipT >= 1) { P.flipT = 0; P.flipDone = !P.onGround; }
    return;
  }
  if (P.onGround || P.flipDone || rd.kind !== 'board' || !P.airRide || P.airTime < (rd.flipMin || 0.3)) return;
  var h = Math.max(0, P.pos.y - W.groundAt(P.pos.x, P.pos.z, P.pos.y)), vy = P.vel.y;
  var tLand = (vy + Math.sqrt(vy * vy + 2 * g * h)) / g;
  if (tLand >= ft + 0.03) P.flipT = 1e-4;
};

// 落地：impact 是落地时的下落速度（米/秒）
P.land = function (impact, held, maxSpeed, rd) {
  var v = P.vel, board = rd.kind === 'board', safe = false;
  if (impact > 14) FX.puff(P.pos.x, P.pos.y, P.pos.z, 8, 0xddd3b5);
  // 1. 按住滑铲落在斜坡上：下落速度转成沿坡的速度，不摔伤
  if (held && impact > 6) {
    var gn = P.groundNormal(P.pos.x, P.pos.z, P.pos.y), sl = Math.sqrt(gn.x * gn.x + gn.z * gn.z);
    if (sl > 0.15) {
      var gain = impact * Math.min(0.8, sl);
      v.x += gn.x / sl * gain; v.z += gn.z / sl * gain;
      if (!P.sliding) { P.sliding = true; P.slideT = 0; }
      safe = true;
      P.hint('slopeLand');
    }
  }
  // 2. 俯冲落地：冲击的一部分变成往前冲的速度（最多到 1.8 倍最大速度）
  if (P.diveT >= (rd.minDive || 0.25) && impact > 10) {
    var hs = P.speed(), add = Math.min((rd.gain || 0.45) * impact, (rd.cap || 1.8) * maxSpeed - hs);
    if (add > 0) {
      var dx = hs > 0.5 ? v.x / hs : Math.sin(P.facing), dz = hs > 0.5 ? v.z / hs : Math.cos(P.facing);
      v.x += dx * add; v.z += dz * add;
    }
    FX.text(P.pos.x, P.pos.y + 2.2, P.pos.z, '俯冲！', '#9fe8ff', 1.2);
    FX.burst(P.pos.x, P.pos.y + 0.2, P.pos.z, 10, 0xffffff, 6, 0.25);
  }
  // 3. 按住滑铲落地直接接着滑（不推）；否则 0.1 秒内没有地面摩擦，马上起跳不掉速；滑板落地 0.25 秒没摩擦
  if (held && (board || P.speed() >= P.SL.END)) {
    if (!P.sliding) { P.sliding = true; P.slideT = 0; }
    if (board) P.graceT = rd.landGrace || 0.25;
  } else P.graceT = P.LAND_GRACE;
  // 4. 摔落伤害（投石跳台的飞行、贴墙缓冲、骑马、滑铲落坡都不算）
  var mx = typeof MX !== 'undefined' ? MX : null;
  if (!safe && !(mx && (mx.flyT > 0 || mx.mount)) && P.wallHugT <= 0) P.fallHurt(impact);
  // 5. 镜头往下一沉；摔得重时震一下
  var bob = clamp((impact - 8) * 0.025, 0, 0.45);
  if (P.sliding) bob *= 0.5;
  P.camBob = Math.max(P.camBob, bob);
  if (impact > 18) Game.shake(Math.min(0.35, (impact - 18) * 0.03));
  P.diveT = 0; P.diving = false; P.moonT = 0; P.flipDone = false; P.airTime = 0;
  var hc = P.speed();
  if (hc > P.SL.CAP) { v.x *= P.SL.CAP / hc; v.z *= P.SL.CAP / hc; }
  v.y = 0;
  P.groundY = P.pos.y; P.groundVy = 0;
  P.onGround = true;
  P.airRide = false;
  P.riding = P.sliding;
  P.jumpsUsed = 0;
  P.landTime = 0;
};

// 摔落伤害：不能闪避、无视护甲、先扣护盾、不会摔死，也不触发受伤效果（荆棘、电插头、骸骨骑士掉速）
P.fallHurt = function (impact) {
  if (!P.alive || P.invuln > 0 || Game.state !== 'play') return 0;
  var k = P.char && P.char.fall != null ? P.char.fall : 1;
  var frac = Math.min(P.FALL.MAX, P.FALL.K * (impact - P.FALL.SAFE)) * k;
  if (!(frac > 0)) return 0;
  var dmg = frac * P.st.maxHp, total = dmg;
  if (P.shield > 0) { var a = Math.min(P.shield, dmg); P.shield -= a; dmg -= a; }
  P.shieldDelay = 3;
  if (dmg > 0) P.hp = Math.max(Math.min(P.hp, 1), P.hp - dmg);
  FX.text(P.pos.x, P.pos.y + 2.2, P.pos.z, '摔伤 -' + Math.max(1, Math.round(total)), '#ff6b6b', 1.1);
  FX.burst(P.pos.x, P.pos.y + 0.2, P.pos.z, 12, 0xcfc2a0, 5, 0.3);
  Game.shake(0.35);
  UI.flashHurt();
  P.hint('fall');
  return total;
};

// 每局只提示一次
P.hint = function (key) {
  if (!P.hints || P.hints[key] || !P.HINTS[key]) return;
  P.hints[key] = true;
  if (typeof UI !== 'undefined' && UI.toast) UI.toast(P.HINTS[key], Kit.color('cyaL'));
};

P.update = function (dt) {
  var look = Input.consumeLook();
  var sens = 0.0026 * Input.sens;
  P.yaw -= look.x * sens;
  P.pitch = clamp(P.pitch + look.y * sens, -0.25, 1.15);

  var st = P.st;
  var f = P.forward();
  var rx = -Math.cos(P.yaw), rz = Math.sin(P.yaw);
  var wx = f.x * Input.move.y + rx * Input.move.x;
  var wz = f.z * Input.move.y + rz * Input.move.x;
  var wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 0.001) { wx /= wl; wz /= wl; }
  P.rage = Math.max(0, (P.rage || 0) - dt);
  var maxSpeed = P.BASE_SPEED * st.moveSpeed * Passive.speedMult() * (P.rage > 0 ? 1.25 : 1);
  var wish = maxSpeed * Math.min(1, wl);

  var rd = P.twist(), board = rd.kind === 'board', SL = P.SL;
  if (Input.jumpPressed) P.jumpBuffer = 0.14;
  // 触屏：按住跳跃键，落地自动连跳（兔子跳）
  if (Input.isTouch && Input.jumpHeld && P.onGround) P.jumpBuffer = 0.14;
  Input.jumpPressed = false;
  P.jumpBuffer -= dt;
  P.coyote -= dt;
  P.invuln -= dt;
  P.graceT -= dt;
  P.kickLock -= dt;
  P.wallHugT -= dt;
  P.hugTextT -= dt;
  P.camBob *= Math.exp(-9 * dt);

  var hs = Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z);

  // ---- 蹲/滑：按住滑铲（骑战马时不行）。地上：够快就起滑，松开或太慢就停（滑板一直滑）；空中：坐骑一直在脚下 ----
  var held = Input.slideHeld && !(typeof MX !== 'undefined' && MX.mount);
  if (P.onGround) {
    P.airRide = false;
    if (P.sliding && (!held || (!board && hs < SL.END))) P.endSlide();
    else if (!P.sliding && held && (hs >= SL.START || board)) { P.startSlide(maxSpeed, true); hs = P.speed(); }
  } else {
    P.endSlide();
    P.airRide = held;
  }
  P.riding = P.sliding || P.airRide;
  // 触屏“点一下保持滑铲”：在地上不再滑了（慢到蹲行）0.2 秒就自己松开；骸骨骑士的滑板一直保持，再点一下才收
  if (Input.touchSlideOn && !Input.slidePress && !board && P.onGround && (!P.sliding || hs < SL.CRAWL * maxSpeed + 0.5)) {
    P.latchT += dt;
    if (P.latchT > 0.2 && Input.setTouchSlide) Input.setTouchSlide(false);
  } else P.latchT = 0;

  if (P.onGround) {
    if (P.sliding) P.slideMove(wx, wz, wl, maxSpeed, rd, dt);
    else {
      // 落地后 0.1 秒内没有摩擦：这时起跳（兔子跳）不掉速
      if (P.graceT <= 0) {
        hs = Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z);
        var drop = Math.max(hs, 3) * 9 * dt;
        if (hs > 0) { var nh = Math.max(0, hs - drop); P.vel.x *= nh / hs; P.vel.z *= nh / hs; }
      }
      P.accelerate(wx, wz, wish, 11, dt);
    }
  } else {
    P.airMove(wx, wz, wl, maxSpeed, rd, dt);
    // 鹰骑士：空中按住跳跃可以滑翔（按住滑铲时改成俯冲）
    if (Passive.id() === 'birdo' && Input.jumpHeld && !P.airRide && P.vel.y < -2) P.vel.y = -2;
  }

  // 跳跃
  var canJump = P.onGround || P.coyote > 0 || P.jumpsUsed < st.extraJumps;
  if (P.jumpBuffer > 0 && canJump) {
    if (!P.onGround && P.coyote <= 0) P.jumpsUsed++;
    P.vel.y = P.BASE_JUMP * Math.sqrt(st.jump);
    if (P.sliding) {
      // 滑铲起跳带着速度走：小加成（太快了就不加，免得连跳无限加速）；面朝下坡起跳再多加一点
      var jk = 1;
      if (P.slideT >= SL.JUMP_MIN) {
        var hj = P.speed(), sj = P.slopeAt(P.pos.x, P.pos.z, P.pos.y);
        if (hj < 1.3 * maxSpeed) jk = 1.05;
        if (sj.g > 0.02 && P.vel.x * sj.x + P.vel.z * sj.z > 0.5 * hj * sj.g) jk += 0.3 * Math.min(0.5, sj.g);
      }
      P.vel.x *= jk; P.vel.z *= jk;
      P.endSlide();
    }
    P.onGround = false;
    P.coyote = 0;
    P.jumpBuffer = 0;
    P.airTime = 0;
    FX.puff(P.pos.x, P.pos.y, P.pos.z, 4, 0xffffff);
  }

  // 水平移动 + 碰撞：快的时候分成每步不超过 0.5 米的几小步，每步都推出墙外（60 米/秒也不会穿过树和墙）
  var ox = P.pos.x, oz = P.pos.z, hs0 = P.speed();
  var steps = clamp(Math.ceil(hs0 * dt / 0.5), 1, 6), sx = P.vel.x * dt / steps, sz = P.vel.z * dt / steps, hit = false;
  for (var si = 0; si < steps; si++) {
    P.pos.x += sx; P.pos.z += sz;
    if (W.pushOut(P.pos, P.radius, P.pos.y)) hit = true;
    // 在地上：每一小步都把脚抬到地面上，冲上坡道时下一步不会把坡道当成墙
    if (P.onGround && si < steps - 1) { var gy = W.groundAt(P.pos.x, P.pos.z, P.pos.y); if (gy > P.pos.y) P.pos.y = gy; }
  }
  if (hit) {
    P.vel.x = (P.pos.x - ox) / dt;
    P.vel.z = (P.pos.z - oz) / dt;
    if (Passive.id() === 'monke' && Input.move.y > 0.3) {
      // 蕉猴：贴着墙往前推就能往上爬（跑得越快爬得越快）
      P.vel.y = Math.max(P.vel.y, clamp(hs0 * 0.55, 7, 20)); P.onGround = false;
    } else if (!P.onGround && P.vel.y < -4 && wl > 0.1) {
      // 贴墙缓冲：往墙上推着往下掉，下落变慢，落地不摔伤
      P.vel.y = Math.max(P.vel.y, -12);
      if (P.wallHugT <= 0) FX.puff(P.pos.x, P.pos.y + 0.8, P.pos.z, 4, 0xcfc2a0);
      if (P.hugTextT <= 0) { FX.text(P.pos.x, P.pos.y + 2.2, P.pos.z, '贴墙缓冲', Kit.color('cyaL'), 0.8); P.hugTextT = 1.5; }
      P.wallHugT = 0.3;
    }
  }

  // 垂直
  var ground = W.groundAt(P.pos.x, P.pos.z, P.pos.y);
  var hsNow = P.speed();
  if (P.onGround && P.vel.y <= 0) {
    // 贴着地面走：一直往下的坡按上一帧的下降速度跟着走（再陡再快也不会一蹦一蹦地离地）；
    // 高速冲过坡顶（地面突然比原来的坡更快地落下去）才会飞起来，带着原来沿坡往下的速度
    var snap = hsNow > 18 ? Math.max(0.35, 21 * dt) : 0.9;
    var follow = Math.max(0, -P.groundVy) * dt * 1.1;
    if (P.pos.y - ground < snap + follow && P.pos.y - ground > -W.STEP - 0.05) {
      var gm = hsNow * SL.TAN_MAX;
      if (dt > 0) P.groundVy = clamp((ground - P.groundY) / dt, -gm, gm);
      P.pos.y = ground;
      P.vel.y = 0;
    } else {
      P.onGround = false;
      P.coyote = 0.12;
      P.airTime = 0;
      P.vel.y = Math.min(0, P.groundVy);
    }
    P.groundY = ground;
  }
  var grav = P.GRAVITY;
  P.diving = false;
  if (!P.onGround) {
    P.airTime += dt;
    // 空中按住滑铲：鹰骑士俯冲（重力 ×2；P.diving 这一帧在俯冲，P.diveT 这次腾空俯冲了多久），星界骑士月面（下落时重力减半，每次腾空最多 1.5 秒）
    if (P.airRide) {
      if (rd.kind === 'dive' && P.vel.y < 3) { grav *= rd.gravity || 2; P.diveT += dt; P.diving = true; }
      else if (rd.kind === 'moon' && P.vel.y < 0 && P.moonT < (rd.time || 1.5)) { grav *= rd.gravity || 0.5; P.moonT += dt; }
    }
    P.vel.y -= grav * dt;
    P.pos.y += P.vel.y * dt;
    var ceil = W.ceilingAt(P.pos.x, P.pos.z, P.pos.y + P.height);
    if (P.vel.y > 0 && ceil < Infinity) { P.pos.y = ceil - P.height; P.vel.y = 0; }
    ground = W.groundAt(P.pos.x, P.pos.z, P.pos.y - P.vel.y * dt);
    if (P.pos.y <= ground && P.vel.y <= 0) {
      P.pos.y = ground;
      P.land(-P.vel.y, held, maxSpeed, rd);
    } else if (P.vel.y > 0) {
      // 高速往山坡上跳：山坡升得比人还快时贴着坡面往上走，不会钻进山里（开始往下落时照常落地）
      var th = W.terrainH(P.pos.x, P.pos.z);
      if (P.pos.y < th) P.pos.y = th;
    }
  }
  P.updateFlip(dt, rd, grav);
  if (P.onGround) P.landTime += dt;
  if (P.pos.y < W.terrainH(P.pos.x, P.pos.z) - 2) P.pos.y = W.terrainH(P.pos.x, P.pos.z);

  // 生命回复（每分钟）与护盾
  P.regenAcc += st.regen / 60 * dt;
  if (P.regenAcc >= 1) { var r = Math.floor(P.regenAcc); P.regenAcc -= r; P.hp = Math.min(st.maxHp, P.hp + r); }
  P.shieldDelay -= dt;
  if (P.shieldDelay <= 0 && P.shield < st.shield) P.shield = Math.min(st.shield, P.shield + st.shield * 0.2 * dt);
  if (P.shield > st.shield) P.shield = st.shield;

  Passive.update(dt);
  P.animate(dt);
};

P.speed = function () { return Math.sqrt(P.vel.x * P.vel.x + P.vel.z * P.vel.z); };

// 按时间平滑地靠近目标值（和帧率无关）
P.ease = function (cur, target, rate, dt) { return cur + (target - cur) * (1 - Math.exp(-dt * rate)); };

// 平滑动作：跑步、待机呼吸、空中、滑铲、秀肌肉几种姿势按权重混合（姿势本身在 CHAR_MODELS.pose 里）
P.animate = function (dt) {
  var m = P.model, body = P.body, a = P.anim;
  if (!m || !body || !a) return;
  var hs = P.speed();
  if (hs > 0.5) P.facing = angleLerp(P.facing, Math.atan2(P.vel.x, P.vel.z), Math.min(1, dt * 12));
  m.position.copy(P.pos);
  body.rotation.y = P.facing;
  var ease = P.ease;
  // 步伐：跑得越快迈得越快（太快时封顶）
  P.walkPhase += dt * Math.min(hs, 16) * 1.35;
  a.t += dt;
  a.phase = P.walkPhase;
  a.vy = P.vel.y;
  a.run = ease(a.run, P.onGround && !P.sliding ? Math.min(1, hs / 7) : 0, 10, dt);
  a.air = ease(a.air, P.onGround ? 0 : 1, P.onGround ? 16 : 9, dt);
  a.slide = ease(a.slide, P.riding ? 1 : 0, 14, dt);
  a.flex = ease(a.flex, Passive.flexBlock > 0 ? 1 : 0, 12, dt);
  // 落地下蹲：在空中待得越久，落地蹲得越深
  if (!P.onGround) a.airT += dt;
  else {
    if (a.airT > 0.25 && !P.sliding) a.land = Math.min(1, a.airT * 1.1);
    a.airT = 0;
  }
  a.land = Math.max(0, a.land - dt * 5);
  CHAR_MODELS.pose(body, a);
  if (typeof Ride !== 'undefined') Ride.update(dt);   // 滑铲坐骑：冒出来、跟着坡倾斜、拖尾（rides.js）
  // 受伤无敌时闪烁（血条不闪）
  body.visible = !(P.invuln > 0 && Math.floor(P.invuln * 20) % 2 === 0 && P.alive);
};

// ---------------- 脚下的血条 ----------------
// 黑框 + 暗红底 + 红色血量；一直正对镜头，只缩放血量那一块（不重画贴图）
P.HPBAR_W = 1.24;
P.HPBAR_H = 0.13;
P.makeHpBar = function () {
  if (P.hpBar) return P.hpBar;
  var W2 = P.HPBAR_W, H2 = P.HPBAR_H, e = 0.032;
  var quad = function (pos, col, x0, y0, x1, y1, top, bot) {
    var a = new THREE.Color(top), b = new THREE.Color(bot);
    [[x0, y0, b], [x1, y0, b], [x1, y1, a], [x0, y0, b], [x1, y1, a], [x0, y1, a]].forEach(function (v) {
      pos.push(v[0], v[1], 0);
      col.push(v[2].r, v[2].g, v[2].b);
    });
  };
  var mesh = function (pos, col, order) {
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    var mm = new THREE.Mesh(g, P.hpBarMat);
    mm.renderOrder = order;
    mm.frustumCulled = false;
    return mm;
  };
  // 不做深度测试、最后画：不会被自己的脚或地面挡住
  P.hpBarMat = new THREE.MeshBasicMaterial({ vertexColors: true, depthTest: false, depthWrite: false, transparent: true, fog: false });
  var bp = [], bc = [], fp = [], fc = [];
  quad(bp, bc, -W2 / 2 - e, -H2 / 2 - e, W2 / 2 + e, H2 / 2 + e, 0x000000, 0x000000);
  quad(bp, bc, -W2 / 2, -H2 / 2, W2 / 2, H2 / 2, 0x4a1216, 0x2a080a);
  quad(fp, fc, 0, -H2 / 2, W2, H2 / 2, 0xe0423e, 0xc22626);
  quad(fp, fc, 0, H2 * 0.12, W2, H2 / 2, 0xf06a5e, 0xe0423e);
  var bar = new THREE.Group();
  bar.add(mesh(bp, bc, 40));
  P.hpFill = mesh(fp, fc, 41);
  P.hpFill.position.x = -W2 / 2;
  bar.add(P.hpFill);
  P.hpBar = bar;
  return bar;
};

// 每帧在镜头摆好之后调用：血条放在脚下、略微靠镜头一侧，正对镜头；死亡和结算时隐藏
P.updateHpBar = function (cam) {
  var bar = P.hpBar;
  if (!bar || !P.model) return;
  bar.visible = P.alive && Game.state !== 'end' && Game.state !== 'menu';
  if (!bar.visible) return;
  P.hpFill.scale.x = Math.max(0.0001, clamp(P.hp / P.st.maxHp, 0, 1));
  var dx = cam.position.x - P.pos.x, dz = cam.position.z - P.pos.z, dl = Math.sqrt(dx * dx + dz * dz) || 1;
  bar.position.set(dx / dl * 0.42, 0.1, dz / dl * 0.42);
  bar.quaternion.copy(cam.quaternion);
};

// ---------------- 镜头 ----------------
// 第三人称：在角色背后上方，角色在画面中下方，前方能看到一大片地面
P.CAM_HEIGHT = 1.25;     // 镜头绕着转的点：脚上方 1.25 米
P.CAM_LOOK_UP = 0.9;     // 实际看向再高一点的地方，角色就落在画面偏下
P.CAM_PITCH = 0.02;      // 在操作用的俯仰角上再往下压一点（不影响瞄准）
P.CAM_FOV = 76;
// 滑铲时镜头放低：坐着/趴着/跪着/蹲着 -0.45，站着冲浪 -0.2，悬浮板 -0.05，空中不变（rides.js 有 Ride.camTarget 就用它的）
P.camRideLift = function () {
  if (typeof Ride !== 'undefined' && Ride.camTarget) return Ride.camTarget();
  if (!P.sliding) return 0;
  var r = typeof RIDES !== 'undefined' && P.char && RIDES[P.char.id];
  if (!r) return -0.45;
  if (r.hover) return -0.05;
  return r.stance === 'surf' ? -0.2 : -0.45;
};
P.updateCamera = function (cam, dt) {
  var f = P.forward();
  P.camLift = lerp(P.camLift, P.camRideLift(), Math.min(1, dt * 8));
  // 落地时镜头跟着往下一沉（P.camBob 在 P.update 里衰减）
  P.camBobY = P.ease(P.camBobY || 0, P.camBob || 0, 30, dt);
  var tx = P.pos.x, ty = P.pos.y + P.CAM_HEIGHT + P.camLift - P.camBobY, tz = P.pos.z;
  var d = P.camDist, pitch = P.pitch + P.CAM_PITCH;
  var cp = Math.cos(pitch), sp = Math.sin(pitch);
  var cx = tx - f.x * d * cp, cy = ty + d * sp, cz = tz - f.z * d * cp;
  var gh = W.groundAt(cx, cz, cy) + 0.6;
  if (cy < gh) cy = gh;
  var s = Game.shakeAmt;
  cam.position.set(cx + (Math.random() - 0.5) * s, cy + (Math.random() - 0.5) * s, cz + (Math.random() - 0.5) * s);
  cam.lookAt(tx, ty + P.CAM_LOOK_UP, tz);
  // 跑得比基础速度快时视野变宽
  var fovTarget = P.CAM_FOV + clamp((P.speed() - P.BASE_SPEED * P.st.moveSpeed) * 0.6, 0, 16);
  cam.fov = P.camSnap ? fovTarget : lerp(cam.fov, fovTarget, Math.min(1, dt * 4));
  P.camSnap = false;
  cam.updateProjectionMatrix();
  P.updateHpBar(cam);
};
