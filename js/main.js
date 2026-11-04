'use strict';
// ============================================================
//  游戏主循环与状态机
//  每关倒计时（默认 15:00，可在菜单里选 10 / 15 / 20 分钟）→ 找到 Boss 传送门并召唤 Boss
//  → 打死后出现传送门进入下一关；倒计时归零进入最终虫潮
// ============================================================
var Game = {
  state: 'menu', time: 0, totalTime: 0, realTime: 0, stage: 1, stageDef: null, charId: 'fox',
  levelQueue: 0, modalQueue: [], timers: [], shakeAmt: 0, bossAlive: false, enemySpeedMult: 1, challenges: [], bossCurses: 0
};

Game.init = function () {
  for (var k in WEAPONS) WEAPONS[k].id = k;
  for (k in CHARACTERS) CHARACTERS[k].id = k;
  TEX.init();
  var canvas = $('gl');
  Game.touch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
  var r = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, powerPreference: 'high-performance' });
  Game.renderer = r;
  Game.scene = new THREE.Scene();
  Game.camera = new THREE.PerspectiveCamera(90, 1, 0.1, 420);
  // 灯光：半球光（天空色 + 地面反光）+ 一盏主光，颜色和强度由关卡配色决定
  Game.hemi = new THREE.HemisphereLight(0xffffff, 0x445533, 1);
  Game.sun = new THREE.DirectionalLight(0xffffff, 0.8);
  Game.sun.position.set(0.6, 1, 0.35);
  Game.scene.add(Game.hemi);
  Game.scene.add(Game.sun);
  Game.scene.fog = new THREE.Fog(0x14698c, 10, 82);
  TEX.makeSky(Game.scene);

  FX.init(Game.scene, $('fxCanvas'));
  Enemies.init(Game.scene);
  Weapons.init(Game.scene);
  Pickups.init(Game.scene);
  Shadows.init(Game.scene);
  Input.init(canvas);
  UI.init();
  window.addEventListener('resize', Game.resize);
  Game.resize();

  Game.stage = 1;
  Game.stageDef = STAGES[0];
  Game.buildStage(true);
  Game.showMenuModel(UI.selected);
  Game.last = performance.now();
  requestAnimationFrame(Game.loop);
  // 主菜单闲着时先画好开局后最先用到的图标（第一次升级不卡），开局就停
  if (ICONS.prewarm) ICONS.prewarm(1500);
};

// 内部分辨率约 720 行（触屏 600 行）再像素化放大：画面带一点颗粒感，iPad 也跑得动
Game.resize = function () {
  var w = window.innerWidth, h = window.innerHeight;
  var target = Game.touch ? 600 : 720;
  var ratio = clamp(target / h, 0.35, Math.min(window.devicePixelRatio || 1, 2));
  Game.renderer.setPixelRatio(ratio);
  Game.renderer.setSize(w, h, false);
  Game.camera.aspect = w / h;
  Game.camera.updateProjectionMatrix();
};

// 按关卡配色设置天空、雾和灯光；tint/amt：最终虫潮时整体往红色偏
Game.applyAtmosphere = function (pal, tint, amt) {
  var tc = tint != null ? new THREE.Color(tint) : null;
  var col = function (hex, k) { var c = new THREE.Color(hex); if (tc) c.lerp(tc, amt * (k == null ? 1 : k)); return c; };
  Game.renderer.setClearColor(col(pal.fog));
  TEX.applySky(pal, tint, amt);
  Game.scene.fog.color.copy(col(pal.fog));
  Game.scene.fog.near = pal.fogNear; Game.scene.fog.far = pal.fogFar;
  // 灯光只染一半，角色和怪物仍然看得清
  Game.hemi.color.copy(col(pal.skyLight, 0.5));
  Game.hemi.groundColor.copy(col(pal.groundLight, 0.5));
  Game.hemi.intensity = pal.hemiInt != null ? pal.hemiInt : 1;
  Game.sun.color.copy(col(pal.sun != null ? pal.sun : 0xffffff, 0.5));
  Game.sun.intensity = pal.sunInt != null ? pal.sunInt : 0.8;
  var d = pal.sunDir || [0.6, 1, 0.35];
  Game.sun.position.set(d[0], d[1], d[2]);
};

Game.playing = function () { return Game.state === 'play'; };

// ---------------- 开局 / 关卡 ----------------
Game.start = function (charId) {
  P.weapons.forEach(Weapons.detach);
  Game.runId = (Game.runId || 0) + 1;
  Game.charId = charId;
  Game.stage = 1;
  Game.totalTime = 0;
  Game.levelQueue = 0;
  Game.modalQueue = [];
  Interact.chestsOpened = 0;
  Enemies.firstElite = true;
  LevelUp.reset();
  Game.buildStage(false);
  P.reset(charId);
  if (Game.menuModel) Game.menuModel.visible = false;
  UI.show('menu', false);
  UI.show('hud', true);
  UI.closeModal();
  Game.state = 'play';
  UI.toast('第 1 关 · ' + Game.stageDef.name + '：找到 Boss 传送门！', Kit.color('gold'));
};

Game.buildStage = function (menuOnly) {
  var sd = STAGES[Game.stage - 1];
  Game.stageDef = sd;
  Enemies.clear();
  Weapons.clear();
  Pickups.clear();
  Interact.clear();
  FX.clear();
  Shadows.clear();
  Game.timers = [];
  Game.challenges = [];
  Game.time = 0;
  Game.bossAlive = false;
  Game.bossCurses = 0;
  Game.enemySpeedMult = 1;
  Director.reset();
  var pal = sd.palette;
  Game.applyAtmosphere(pal);
  W.generate(Game.scene, 1000 + Game.stage * 77 + Math.floor(Math.random() * 1e6), pal);
  if (!menuOnly) {
    Interact.populate();
    P.weapons.forEach(Weapons.attach);
    P.pos.set(0, W.terrainH(0, 0), 0);
    P.vel.set(0, 0, 0);
    UI.resetMinimap();
  }
};

Game.nextStage = function () {
  if (Game.stage >= STAGES.length) { Game.win(); return; }
  Game.stage++;
  P.weapons.forEach(Weapons.detach);
  Game.buildStage(false);
  P.hp = P.st.maxHp;
  UI.toast('第 ' + Game.stage + ' 关 · ' + Game.stageDef.name, '#ffd84a');
};

Game.win = function () {
  Game.state = 'end';
  UI.showEnd(true);
};

Game.onDeath = function () {
  Game.state = 'end';
  FX.burst(P.pos.x, P.pos.y + 1, P.pos.z, 30, 0xff3333, 8, 0.4);
  // 0.9 秒内已经重开 / 回了主菜单：不再弹出这一局的结算界面（不然它会盖在新的一局或菜单上）
  var run = Game.runId;
  setTimeout(function () { if (Game.state === 'end' && Game.runId === run) UI.showEnd(false); }, 900);
};

Game.toMenu = function () {
  Game.state = 'menu';
  // 直接回菜单（不是从按钮来的，比如通关的结算界面已经弹出来了）：弹窗也一起关掉，不留在菜单上面
  UI.closeModal();
  if (Game.menuModel) Game.menuModel.visible = true;
  Game.stage = 1;
  if (P.model && P.model.parent) P.model.parent.remove(P.model);
  P.model = null;
  P.weapons.forEach(Weapons.detach);
  P.weapons = [];
  Game.buildStage(true);
  UI.show('hud', false);
  UI.show('menu', true);
  UI.buildMenu();
  if (ICONS.prewarm) ICONS.prewarm(800);
};

// ---------------- Boss / 挑战 ----------------
// 越晚召唤，Boss 血量越高（跟着关卡进度的敌人血量曲线走，曲线已含关卡时长缩放）
Game.bossHpMult = function () { return (Game.stageDef.bossHp || 0.4) * Director.hpMult(); };

Game.summonBoss = function (portal) {
  if (Game.bossAlive) return;
  Game.bossAlive = true;
  var sd = Game.stageDef;
  var a = portal || Interact.portal;
  var n = 1 + Game.bossCurses;
  Game.bossesLeft = n;
  for (var i = 0; i < n; i++) {
    var ang = i / n * TAU;
    var b = Enemies.spawn(sd.boss, a.x + Math.cos(ang) * 8, a.z + Math.sin(ang) * 8, { hpMult: Game.bossHpMult(), dmgMult: Director.dmgMult(), drop: true });
    b.state = 'intro'; b.st = 1.5;
  }
  Game.bossX = a.x; Game.bossZ = a.z;
  UI.toast(ENEMIES[sd.boss].name + ' 降临！', Kit.color('red'));
  Game.shake(0.8);
  Interact.consume(a);
  // Boss 战期间定时刷小魔像
  Game.bossAdds = 45;
};

Game.onBossKilled = function (e) {
  Game.bossesLeft--;
  for (var i = 0; i < 12; i++) Pickups.gold(e.x + rand(-2, 2), e.y + 1, e.z + rand(-2, 2), Math.ceil(5 * Game.stage * P.st.goldGain));
  Pickups.xp(e.x, e.y + 1, e.z, 80 * Game.stage);
  Interact.spawnChest(e.x, e.z, true);
  Game.shake(1);
  if (Game.bossesLeft > 0) { Enemies.boss = Enemies.list.find(function (o) { return o.boss && o.alive; }) || null; return; }
  Game.bossAlive = false;
  Enemies.boss = null;
  Interact.openExit(Game.bossX, Game.bossZ);
};

Game.startChallenge = function (o) {
  var n = 3 + Game.stage, list = [];
  for (var i = 0; i < n; i++) {
    var a = i / n * TAU;
    list.push(Enemies.spawn(pick(Director.currentPool().types), o.x + Math.cos(a) * 9, o.z + Math.sin(a) * 9, { elite: true, hpMult: Director.hpMult() * 0.8, dmgMult: Director.dmgMult() * 1.3, drop: true }));
  }
  Game.challenges.push({ x: o.x, z: o.z, list: list });
  UI.toast('挑战开始！击败所有精英', Kit.color('org'));
};

// ---------------- 弹窗队列 ----------------
Game.queueLevelUp = function () { Game.levelQueue++; };

Game.openModal = function (fn) {
  if (Game.state === 'play') { Game.state = 'modal'; fn(); }
  else Game.modalQueue.push(fn);
};

Game.afterModal = function () {
  if (Game.state === 'end' || Game.state === 'menu') return;
  Game.state = 'play';
  if (Game.modalQueue.length) { Game.openModal(Game.modalQueue.shift()); return; }
  if (Game.levelQueue > 0) { Game.levelQueue--; Game.openModal(UI.showLevelUp); }
};

Game.pause = function (on) {
  if (on && Game.state === 'play') { Game.state = 'pause'; UI.showPause(); }
  else if (!on && Game.state === 'pause') { UI.closeModal(); Game.state = 'play'; Input.lock(); }
};

Game.onKey = function (e) {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (Game.state === 'play') Game.pause(true);
    else if (Game.state === 'pause') Game.pause(false);
    return;
  }
  if (Game.state === 'play' && e.code === 'KeyE') Interact.use();
  if (Game.state === 'modal' && !$('levelModal').classList.contains('hidden')) {
    if (e.code === 'Digit1' || e.code === 'Digit2' || e.code === 'Digit3') UI.pickOption(parseInt(e.code.slice(5), 10) - 1);
    if (UI.mode === 'level') {
      if (e.code === 'KeyR') UI.action('reroll');
      if (e.code === 'KeyX') UI.action('skip');
      if (e.code === 'KeyB') UI.action('banish');
    }
  }
};

Game.later = function (delay, fn) { Game.timers.push({ t: Game.time + delay, fn: fn }); };
Game.shake = function (a) { Game.shakeAmt = Math.max(Game.shakeAmt, a); };

// ---------------- 主循环 ----------------
Game.loop = function (now) {
  requestAnimationFrame(Game.loop);
  var dt = Math.min(0.05, (now - Game.last) / 1000);
  Game.last = now;
  Game.update(dt);
  Game.render(dt);
};

Game.update = function (dt) {
  Game.realTime += dt;
  if (Game.state === 'play') {
    Input.poll();
    Game.time += dt;
    Game.totalTime += dt;
    P.update(dt);
    Game.stageEvents(dt);
    Director.update(dt);
    Enemies.update(dt);
    Weapons.update(dt);
    Pickups.update(dt);
    Interact.update(dt);
    for (var i = Game.timers.length - 1; i >= 0; i--) {
      if (Game.timers[i].t <= Game.time) { var t = Game.timers[i]; Game.timers.splice(i, 1); t.fn(); }
    }
    Game.updateChallenges();
    FX.updateParts(dt);
    FX.updateEffects(dt);
    Shadows.update();
    if (Game.levelQueue > 0 && Game.state === 'play') { Game.levelQueue--; Game.openModal(UI.showLevelUp); }
  } else if (Game.state === 'end') {
    FX.updateParts(dt);
    FX.updateEffects(dt);
  }
  Input.reset();
  Game.shakeAmt = Math.max(0, Game.shakeAmt - dt * 2.5);
};

// 角色选择界面：在左侧展示选中的骑士模型
Game.render = function (dt) {
  if (Game.state === 'menu') {
    Game.updateMenuCamera(dt);
  } else {
    P.updateCamera(Game.camera, dt);
  }
  TEX.updateSky(Game.camera, dt);
  Game.renderer.render(Game.scene, Game.camera);
  if (Game.state !== 'menu') {
    FX.drawTexts(Game.camera, Game.state === 'play' || Game.state === 'end' ? dt : 0);
    UI.update();
  }
};

Game.stageEvents = function (dt) {
  if (!Director.swarm && Director.remaining() <= 0) {
    Director.startSwarm();
    // 天空、远山、雾都变红
    Game.applyAtmosphere(Game.stageDef.palette, 0x5a0a0a, 0.35);
  }
  if (Game.bossAlive) {
    Game.bossAdds -= dt;
    if (Game.bossAdds <= 0) {
      Game.bossAdds = 45;
      Director.spawnMini(pick(Game.stageDef.minis));
    }
  }
};

Game.updateChallenges = function () {
  for (var i = Game.challenges.length - 1; i >= 0; i--) {
    var c = Game.challenges[i];
    if (c.list.every(function (e) { return !e.alive; })) {
      Game.challenges.splice(i, 1);
      Interact.spawnChest(c.x, c.z, true);
      UI.toast('挑战完成！获得金宝箱', '#ffd84a');
    }
  }
};

window.addEventListener('load', function () {
  try {
    if (typeof THREE === 'undefined') throw new Error('3D 引擎没有加载成功，请检查网络后刷新');
    Game.init();
  } catch (e) {
    var el = document.getElementById('bootError');
    el.classList.remove('hidden');
    el.textContent = '游戏启动失败：' + e.message;
    throw e;
  }
});
