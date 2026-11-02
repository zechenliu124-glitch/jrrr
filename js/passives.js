'use strict';
// ============================================================
//  角色被动与物品的持续效果
// ============================================================
var Passive = { frozenNear: 0 };

Passive.reset = function () {
  Passive.speedBonus = 0;      // 骸骨骑士：越跑越快
  Passive.flexT = 15;          // 猛男：秀肌肉
  Passive.flexBlock = 0;
  Passive.zap = 0;             // 托尼：放电
  Passive.markT = 2;           // 灌木：靶心
  Passive.chestT = 60;         // 罗伯托：囤积
  Passive.stillT = 0;          // 营火
  Passive.magnetT = 30;        // 吸吸磁铁
  Passive.walked = 0;          // 金色运动鞋
  Passive.cloakT = 0;          // 懦夫斗篷
  Passive.frozenNear = 0;
  Passive.ice = [];            // 冰霜女骑士：滑铲留下的薄冰 {x, y, z, t}
  Passive.iceT = 0;
  Passive.iceStamp = 0;
};

// 坐骑特性（RIDES[角色].twist.kind）：只在滑铲坐骑出来（P.riding）时生效
Passive.twist = function () { return P.twist ? P.twist() : {}; };
Passive.riding = function (kind) { return !!P.riding && Passive.twist().kind === kind; };

// 影骑士：滑铲时闪避大幅提高（加在内部闪避值上，P.evadePct 里用）
Passive.evadeBonus = function () {
  if (!Passive.riding('shadow')) return 0;
  var rd = Passive.twist();
  return rd.evade != null ? rd.evade : 0.3;
};

Passive.id = function () { return P.char ? P.char.id : ''; };

// 伤害倍率（命中时调用）
Passive.dmgMult = function (e) {
  var m = 1, id = Passive.id();
  if (id === 'calcium') m *= 1 + Passive.speedBonus;
  if (id === 'athena') m *= 1 + (1 - P.hp / P.st.maxHp);
  if (id === 'robin') m *= 1 + Math.min(P.gold / 1000, 20) * 0.1;
  if (id === 'birdo' && !P.onGround) m *= 1 + 0.01 * P.level;
  if (id === 'noelle') m *= 1 + 0.01 * Passive.frozenNear;
  return m;
};

// 移动速度额外倍率（不进属性表，实时生效）
Passive.speedMult = function () {
  var m = 1;
  if (Passive.id() === 'calcium') m *= 1 + Passive.speedBonus;
  if (Passive.cloakT > 0) m *= 1 + 0.15 * (P.items.cloak || 0);
  return m;
};

Passive.update = function (dt) {
  var id = Passive.id();
  var moving = P.speed() > 2;
  if (id === 'calcium') {
    // 亡者疾驰：一直移动越来越快；踩着棺材板时翻倍
    if (moving) Passive.speedBonus = Math.min(0.6, Passive.speedBonus + dt * 0.02 * (Passive.riding('board') ? Passive.twist().ramp || 2 : 1));
  }
  if (id === 'chad') {
    Passive.flexT -= dt;
    Passive.flexBlock -= dt;
    if (Passive.flexT <= 0) {
      Passive.flexT = Math.max(5, 15 - 0.2 * P.level);
      Passive.flexBlock = 1.2;
      P.addMod('damage', 0.025);
      FX.text(P.pos.x, P.pos.y + 2.6, P.pos.z, '秀肌肉！', '#ffd84a', 1.3);
      FX.ring(P.pos.x, P.pos.y, P.pos.z, 6, 0xffd84a, 0.4);
      Enemies.inRadius(P.pos.x, P.pos.z, 6, function (e) { if (!e.boss) e.frozen = Math.max(e.frozen, 1.5); });
    }
  }
  if (id === 'tony') {
    // 放电：踩着雷光板时积蓄翻倍
    if (moving) Passive.zap += P.speed() * dt * (Passive.riding('hover') ? Passive.twist().charge || 2 : 1);
    if (Passive.zap >= 25) {
      Passive.zap = 0;
      var dmg = (20 + P.level * 4) * P.st.damage;
      FX.ring(P.pos.x, P.pos.y, P.pos.z, 7, 0x7affff, 0.3);
      Enemies.nearestN(P.pos.x, P.pos.z, 7, 12).forEach(function (e) {
        FX.bolt(P.pos.x, P.pos.y + 1, P.pos.z, e.x, e.y + e.r, e.z);
        Enemies.damage(e, dmg, 0, 0, 0);
      });
    }
  }
  if (id === 'bush') {
    Passive.markT -= dt;
    if (Passive.markT <= 0) {
      Passive.markT = 1.5;
      var es = Enemies.nearestN(P.pos.x, P.pos.z, 30, 20);
      if (es.length) pick(es).marked = 5;
    }
  }
  if (id === 'roberto') {
    Passive.chestT -= dt;
    if (Passive.chestT <= 0) {
      Passive.chestT = Math.min(120, 60 + 2.5 * P.level);
      var a = Math.random() * TAU;
      Interact.spawnChest(P.pos.x + Math.cos(a) * 4, P.pos.z + Math.sin(a) * 4, true);
      UI.toast('罗伯托囤了一个宝箱', '#d8e8ff');
    }
  }
  if (Passive.twist().kind === 'frost') Passive.updateIce(dt, Passive.twist());
  // ---- 物品 ----
  if (P.items.campfire) {
    Passive.stillT = moving ? 0 : Passive.stillT + dt;
    if (Passive.stillT > 1) P.regenAcc += P.st.maxHp * 0.03 * P.items.campfire * dt;
  }
  if (P.items.magnet) {
    Passive.magnetT -= dt;
    if (Passive.magnetT <= 0) { Passive.magnetT = 30 / P.items.magnet; Pickups.magnetNear(40); }
  }
  if (P.items.sneakers && P.onGround) {
    Passive.walked += P.speed() * dt;
    if (Passive.walked >= 10) { var g = Math.floor(Passive.walked / 10); Passive.walked -= g * 10; P.gold += g * P.items.sneakers; }
  }
  Passive.cloakT -= dt;
  if (P.poison > 0) { P.poison -= dt; P.poisonAcc = (P.poisonAcc || 0) + dt * 2 * Game.stageDef.dmgMult; if (P.poisonAcc >= 1) { P.hp -= 1; P.poisonAcc -= 1; if (P.hp <= 0) P.hp = 1; } }
};

// 冰霜女骑士的冰轨：地上滑得够快时每 0.3 秒留下一块薄冰（半径 1.3 米，1.8 秒），
// 踩上去的敌人（Boss 除外）冻住 0.4 秒，每个敌人 1.2 秒最多一次；被冻住的敌人也算进她的被动加伤
// （RIDES.noelle.twist 里写了 every / iceR / life / freeze / cooldown / minSpeed 就用它的）
Passive.ICE = { every: 0.3, r: 1.3, life: 1.8, freeze: 0.4, cd: 1.2, minSpeed: 4 };
Passive.updateIce = function (dt, rd) {
  var C = Passive.ICE, L = Passive.ice || (Passive.ice = []), r = rd.iceR || rd.radius || C.r;
  var life = rd.life || C.life, freeze = rd.freeze || C.freeze, cd = rd.cooldown || C.cd;
  if (Game.time < Passive.iceStamp) L.length = 0;          // 换关了
  Passive.iceStamp = Game.time;
  if (P.sliding && P.onGround && P.speed() > (rd.minSpeed || C.minSpeed)) {
    Passive.iceT -= dt;
    if (Passive.iceT <= 0) {
      Passive.iceT = rd.every || C.every;
      var y = P.pos.y;
      L.push({ x: P.pos.x, y: y, z: P.pos.z, t: life });
      if (L.length > 12) L.shift();
      if (FX.spawn) {
        // 贴着坡面放
        var n = P.slopeAt ? P.slopeAt(P.pos.x, P.pos.z, y) : { x: 0, z: 0 };
        FX.spawn('disc', 0xbff0ff, { x: P.pos.x, y: y + 0.07, z: P.pos.z, rx: Math.atan(n.z), rz: -Math.atan(n.x), s0: r * 0.7, s1: r, life: life, a0: 0.5 });
      }
    }
  } else Passive.iceT = 0;
  var now = Game.time;
  for (var i = L.length - 1; i >= 0; i--) {
    var p = L[i];
    p.t -= dt;
    if (p.t <= 0) { L.splice(i, 1); continue; }
    Enemies.inRadius(p.x, p.z, r, function (e) {
      if (e.boss || Math.abs(e.y - p.y) > 2.5 || e.iceCd > now) return;
      e.iceCd = now + cd;
      e.frozen = Math.max(e.frozen, freeze);
    });
  }
};

// 受伤时（已经扣血之后）
Passive.onHurt = function () {
  // 骸骨骑士：受伤损失 30% 的加速（摔落伤害不算）
  if (Passive.id() === 'calcium') { var hl = Passive.twist().hitLoss; Passive.speedBonus *= 1 - (hl != null ? hl : 0.3); }
  if (P.items.cloak) Passive.cloakT = 3;
  if (P.items.plug) {
    var dmg = (15 + P.level * 3) * P.st.damage * P.items.plug;
    Enemies.nearestN(P.pos.x, P.pos.z, 8, 6).forEach(function (e) { FX.bolt(P.pos.x, P.pos.y + 1, P.pos.z, e.x, e.y + e.r, e.z); Enemies.damage(e, dmg, 0, 0, 0); });
  }
};

// 返回 true 表示伤害被挡下
Passive.blocks = function (src) {
  if (Passive.flexBlock > 0) { FX.text(P.pos.x, P.pos.y + 2.4, P.pos.z, '格挡', '#ffd84a', 1); return true; }
  return Weapons.aegisBlock(src);
};

Passive.onEvade = function (src) {
  // 忍者：闪避时处决攻击者
  if (Passive.id() === 'ninja' && src && src.alive && !src.boss && !src.mini) Enemies.damage(src, src.hp + 1, 2, 0, 0, { text: '影步' });
};

Passive.onLevel = function () {
  if (Passive.id() === 'dicehead') {
    var c = pick(CHAOS_POOL);
    var v = c[1] * RARITY_MULT[Rarity.roll()] * 0.75;
    P.mods.push({ stat: c[0], value: v });
    UI.toast('赌一把：' + LevelUp.statText(c[0], v), '#ffffff');
  }
};

Passive.onKill = function () {};

Passive.onChest = function () {
  if (P.items.greencard) P.addMod('luck', 0.02 * P.items.greencard);
  if (P.items.redcard) P.addMod('damage', 0.025 * P.items.redcard);
};

// 角色界面上显示的被动进度
Passive.hudText = function () {
  var id = Passive.id();
  if (id === 'calcium') return '速度 +' + Math.round(Passive.speedBonus * 100) + '%';
  if (id === 'chad') return '秀肌肉 ' + Math.ceil(Math.max(0, Passive.flexT)) + 's';
  if (id === 'tony') return '电能 ' + Math.floor(Passive.zap / 25 * 100) + '%';
  if (id === 'roberto') return '宝箱 ' + Math.ceil(Math.max(0, Passive.chestT)) + 's';
  if (id === 'robin') return '金币加伤 +' + Math.round(Math.min(P.gold / 1000, 20) * 10) + '%';
  if (id === 'athena') return '绝境 +' + Math.round((1 - P.hp / P.st.maxHp) * 100) + '%';
  return '';
};
