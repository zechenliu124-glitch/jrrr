'use strict';
// ============================================================
//  菜单里的 3D 角色预览与镜头
//  宽屏：角色站在左边的空地上（右边是界面）；竖屏：角色站在上面（下面是界面）
// ============================================================

Game.showMenuModel = function (id) {
  if (Game.menuModel) CHAR_MODELS.release(Game.menuModel);
  var m = CHAR_MODELS.build(CHARACTERS[id].model);
  m.position.set(0, W.terrainH(0, 0), 0);
  // 脚下一块圆影子，站得稳
  if (!Game.menuShadow) {
    Game.menuShadow = new THREE.Mesh(new THREE.CircleGeometry(0.55, 16).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }));
    Game.menuShadow.position.y = 0.03;
    Game.menuShadow.renderOrder = 1;
  }
  m.add(Game.menuShadow);
  Game.scene.add(m);
  Game.menuModel = m;
  Game.menuCharId = id;
  Game.menuPose = { t: 0, run: 0, phase: 0, air: 0, vy: 0, slide: 0, flex: 0, land: 0 };
  Game.menuAreaKey = '';
  Game.menuYaw = Game.menuViewYaw();
};

// 选镜头方向：在太阳那一侧（角色正面亮）挑背后地形最低的方向，背景里能多看到天空
Game.menuViewYaw = function () {
  var sun = Game.sun ? Game.sun.position : { x: 0, z: 1 };
  var base = Math.atan2(sun.x, sun.z) + 0.6, y0 = W.terrainH(0, 0) + 1.2, best = base, bestH = Infinity;
  for (var k = -3; k <= 3; k++) {
    var yaw = base + k * 0.3, fx = -Math.sin(yaw), fz = -Math.cos(yaw), h = -Infinity;
    // 角色背后 8~70 米处地形的最大仰角
    for (var d = 8; d <= 70; d += 6) h = Math.max(h, (W.terrainH(fx * d, fz * d) - y0) / d);
    h += Math.abs(k) * 0.02;
    if (h < bestH) { bestH = h; best = yaw; }
  }
  return best;
};

// 量一下界面，找出屏幕上留给角色的空地（CSS 像素）；窗口大小、面板大小变了（比如别的文件往菜单里加了设置）或换了角色才重新量
Game.menuArea = function () {
  var w = window.innerWidth, h = window.innerHeight;
  var panel = document.querySelector('#menu .menuInner') || document.getElementById('charGrid');
  var key = w + 'x' + h + (panel ? ':' + panel.offsetWidth + 'x' + panel.offsetHeight : '');
  if (Game.menuAreaKey === key && Game.menuRect) return Game.menuRect;
  Game.menuAreaKey = key;
  var r = { x0: 0, y0: 0, x1: w, y1: h };
  var pr = panel ? panel.getBoundingClientRect() : null;
  // 竖屏时底部的暗色渐变从面板上沿附近才开始（CSS 里用 --panelTop），不压暗角色
  var menu = document.getElementById('menu');
  if (menu && pr && pr.height > 0) menu.style.setProperty('--panelTop', Math.round(pr.top) + 'px');
  if (pr && pr.width > 0 && pr.height > 0) {
    if (pr.left > w * 0.3) r.x1 = pr.left;            // 界面在右边
    else if (pr.top > h * 0.3) r.y1 = pr.top;         // 界面在下面
  } else if (w > h * 1.1) r.x1 = w * 0.5;
  else r.y1 = h * 0.6;
  // 标题和副标题下面
  ['.logo', '.tag'].forEach(function (sel) {
    var el = document.querySelector('#menu ' + sel);
    if (!el) return;
    var lr = el.getBoundingClientRect();
    if (lr.height > 0 && lr.left < r.x1 && lr.bottom < r.y0 + (r.y1 - r.y0) * 0.4) r.y0 = Math.max(r.y0, lr.bottom);
  });
  Game.menuRect = r;
  return r;
};

// 菜单状态下每帧调用（只是画面，不碰游戏逻辑）：预览模型的待机动作 + 摆好镜头
Game.updateMenuCamera = function (dt) {
  var m = Game.menuModel, cam = Game.camera;
  if (!m) return;
  var y0 = W.terrainH(0, 0), a = Game.menuPose;
  a.t += dt;
  m.position.y = y0;
  // 胸甲猛男时不时秀一下肌肉
  a.flex = 0;
  if (m.userData.id === 'chad') { var c = a.t % 7; if (c > 4.5) a.flex = Math.min(1, (c - 4.5) * 4, (7 - c) * 4); }
  CHAR_MODELS.pose(m, a);
  // 每 6 秒亮一下滑铲坐骑（rides.js；菜单里按 R 一直亮着）
  if (typeof Ride !== 'undefined') Ride.showcase(m, a, dt, Game.menuCharId);

  // 角色朝向镜头、稍微侧一点，慢慢左右转
  var yaw = Game.menuYaw || 0;
  // 亮出坐骑时侧过身来，让坐骑的侧面朝着镜头
  var rs = m.userData.ride;
  m.rotation.y = yaw + 0.3 + Math.sin(a.t * 0.45) * 0.3 + (rs ? rs.menuTurn * rs.w : 0);

  // 按空地大小算镜头距离和平移：模型（含羽饰约 2.15 米）占空地高度的四分之三左右
  var w = window.innerWidth, h = window.innerHeight, r = Game.menuArea();
  var fov = 30, th = Math.tan(fov * Math.PI / 360);
  if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); }
  var modelH = 2.15 * m.scale.y;
  var px = Math.max(80, Math.min((r.y1 - r.y0) * 0.76, (r.x1 - r.x0) * 1.5));
  var D = modelH * h / (2 * th * px);
  // 竖屏时稍微往上放一点（下方界面的渐变暗影不要盖住腿）
  var cyPx = r.y0 + (r.y1 - r.y0) * (r.x1 - r.x0 > w * 0.8 ? 0.45 : 0.5);
  var ndcX = (r.x0 + r.x1) / w - 1, ndcY = 1 - cyPx / h * 2;
  var halfH = D * th, halfW = halfH * cam.aspect;
  // 屏幕上的偏移换算成镜头的左右/上下平移
  var sx = -ndcX * halfW, sy = modelH * 0.5 - ndcY * halfH;
  var fx = Math.sin(yaw), fz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  var px0 = fx * D + rx * sx, pz0 = fz * D + rz * sx;
  var py = y0 + sy + D * 0.05;
  var gy = W.terrainH(px0, pz0) + 0.5;
  cam.position.set(px0, Math.max(py, gy), pz0);
  cam.lookAt(rx * sx, y0 + sy, rz * sx);
};

// 菜单里按 R：一直摆出滑铲坐骑的姿势（检查坐骑和角色合不合身），再按一下恢复
window.addEventListener('keydown', function (e) {
  if (e.code === 'KeyR' && !e.repeat && Game.state === 'menu') Game.menuRideHold = !Game.menuRideHold;
});

// 角色说明里加一行滑铲坐骑（名字 —— 说明）；别的文件已经加过 .cdRide 这一行就不重复加
(function () {
  if (typeof UI === 'undefined' || !UI.buildMenu) return;
  var build = UI.buildMenu;
  UI.buildMenu = function () {
    var r = build.apply(this, arguments);
    var rd = typeof RIDES !== 'undefined' && RIDES[UI.selected], box = document.getElementById('charDesc');
    if (rd && box && !box.querySelector('.cdRide')) {
      var line = document.createElement('div');
      line.className = 'cdRide';
      line.textContent = '滑铲坐骑：' + rd.name + ' —— ' + rd.desc;
      var stats = box.querySelector('.cdStats');
      box.insertBefore(line, stats || null);
    }
    return r;
  };
})();
