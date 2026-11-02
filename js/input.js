'use strict';
// ============================================================
//  输入：键盘鼠标（指针锁定）与触屏（左摇杆 + 右侧拖动视角 + 跳跃/滑铲按钮）
// ============================================================
var Input = {
  keys: {},
  move: { x: 0, y: 0 },
  lookDX: 0, lookDY: 0,
  jumpPressed: false, jumpHeld: false,
  slideHeld: false,
  // 触屏滑铲键：slideMode 'toggle' = 点一下保持滑铲（再点一下取消，按住超过 0.35 秒就当成按住，松手就停）；'hold' = 只在按住时滑
  slideMode: 'toggle', touchSlideOn: false, slidePress: 0,
  isTouch: false,
  joy: null, look: null,
  sens: 1
};

Input.init = function (canvas) {
  Input.canvas = canvas;
  window.addEventListener('keydown', function (e) {
    if (e.repeat) { Input.keys[e.code] = true; return; }
    Input.keys[e.code] = true;
    if (e.code === 'Space') { Input.jumpPressed = true; Input.jumpHeld = true; e.preventDefault(); }
    if (typeof Game !== 'undefined') Game.onKey(e);
  });
  window.addEventListener('keyup', function (e) {
    Input.keys[e.code] = false;
    if (e.code === 'Space') Input.jumpHeld = false;
  });
  window.addEventListener('blur', function () { Input.keys = {}; Input.jumpHeld = false; Input.mouseSlide = false; });

  canvas.addEventListener('click', function () { if (Game.playing()) Input.lock(); });
  // 右键滑铲（不用 Ctrl：Ctrl+W 会关掉浏览器标签页）
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('mousedown', function (e) { if (e.button === 2) Input.mouseSlide = true; });
  window.addEventListener('mouseup', function (e) { if (e.button === 2) Input.mouseSlide = false; });
  // Safari 的双指缩放手势
  document.addEventListener('gesturestart', function (e) { e.preventDefault(); });
  document.addEventListener('gesturechange', function (e) { e.preventDefault(); });
  document.addEventListener('mousemove', function (e) {
    if (document.pointerLockElement === canvas) {
      Input.lookDX += e.movementX;
      Input.lookDY += e.movementY;
    } else if (Input.mouseDrag) {
      Input.lookDX += e.movementX;
      Input.lookDY += e.movementY;
    }
  });
  // 不能锁定指针时，按住鼠标拖动也能转视角
  canvas.addEventListener('mousedown', function (e) { if (!Input.isTouch && e.button === 0 && document.pointerLockElement !== canvas) Input.mouseDrag = true; });
  window.addEventListener('mouseup', function () { Input.mouseDrag = false; });
  // 玩家按 Esc 退出鼠标锁定时暂停；我们自己为弹窗释放锁定时不暂停
  document.addEventListener('pointerlockchange', function () {
    if (document.pointerLockElement) return;
    if (Input.selfRelease) { Input.selfRelease = false; return; }
    if (Game.playing() && !Input.isTouch) Game.pause(true);
  });

  // ---------- 触屏 ----------
  var zone = document.getElementById('touchZone');
  zone.addEventListener('touchstart', Input.onTouchStart, { passive: false });
  zone.addEventListener('touchmove', Input.onTouchMove, { passive: false });
  zone.addEventListener('touchend', Input.onTouchEnd, { passive: false });
  zone.addEventListener('touchcancel', Input.onTouchEnd, { passive: false });
  Input.bindHold('btnJump', function (down) {
    if (down) Input.jumpPressed = true;
    Input.jumpHeld = down;
  });
  Input.bindHold('btnSlide', Input.onSlideButton);
  window.addEventListener('touchstart', function () {
    if (!Input.isTouch) { Input.isTouch = true; document.body.classList.add('touch'); }
  }, { passive: true, capture: true });
};

// 触屏滑铲键（空中按住/点一下都能用：坐骑一直在脚下，落地直接接着滑）
Input.onSlideButton = function (down) {
  if (Input.slideMode === 'hold') { Input.touchSlide = down; return; }
  Input.touchSlide = false;
  var now = performance.now();
  if (down) {
    if (Input.touchSlideOn) { Input.setTouchSlide(false); Input.slidePress = 0; }   // 再点一下：收起
    else { Input.setTouchSlide(true); Input.slidePress = now; }
  } else {
    if (Input.slidePress && now - Input.slidePress > 350) Input.setTouchSlide(false);   // 是按住的：松手就停
    Input.slidePress = 0;
    Input.setTouchSlide(Input.touchSlideOn);
  }
};
// 保持滑铲的开关；开着时按钮一直是按下的样子。P.update 在落地慢下来后、Game 弹窗打开时、新开一局时会关掉它
Input.setTouchSlide = function (on) {
  Input.touchSlideOn = !!on;
  if (!on) Input.slidePress = 0;
  var el = document.getElementById('btnSlide');
  if (!el) return;
  el.classList.toggle('down', Input.touchSlideOn || (Input.slideMode === 'hold' && !!Input.touchSlide));
  el.classList.toggle('on', Input.touchSlideOn);   // 保持中：按钮发光（样式在 movement_ui.js）
};

Input.bindHold = function (id, fn) {
  var el = document.getElementById(id);
  el.addEventListener('touchstart', function (e) { e.preventDefault(); e.stopPropagation(); el.classList.add('down'); fn(true); }, { passive: false });
  el.addEventListener('touchend', function (e) { e.preventDefault(); el.classList.remove('down'); fn(false); }, { passive: false });
  el.addEventListener('touchcancel', function () { el.classList.remove('down'); fn(false); });
  el.addEventListener('mousedown', function (e) { e.preventDefault(); fn(true); });
  el.addEventListener('mouseup', function () { fn(false); });
};

Input.onTouchStart = function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (t.clientX < window.innerWidth * 0.45 && !Input.joy) {
      Input.joy = { id: t.identifier, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY };
      Input.showJoy(true);
    } else if (!Input.look) {
      Input.look = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  }
};

Input.onTouchMove = function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (Input.joy && t.identifier === Input.joy.id) {
      Input.joy.x = t.clientX; Input.joy.y = t.clientY;
      Input.showJoy(true);
    } else if (Input.look && t.identifier === Input.look.id) {
      Input.lookDX += (t.clientX - Input.look.x) * 1.6;
      Input.lookDY += (t.clientY - Input.look.y) * 1.6;
      Input.look.x = t.clientX; Input.look.y = t.clientY;
    }
  }
};

Input.onTouchEnd = function (e) {
  e.preventDefault();
  for (var i = 0; i < e.changedTouches.length; i++) {
    var t = e.changedTouches[i];
    if (Input.joy && t.identifier === Input.joy.id) { Input.joy = null; Input.showJoy(false); }
    if (Input.look && t.identifier === Input.look.id) Input.look = null;
  }
};

Input.JOY_R = 60;
Input.showJoy = function (on) {
  var base = document.getElementById('joyBase'), knob = document.getElementById('joyKnob');
  if (!on) { base.classList.add('hidden'); knob.classList.add('hidden'); return; }
  var j = Input.joy;
  var dx = j.x - j.x0, dy = j.y - j.y0, d = Math.sqrt(dx * dx + dy * dy), R = Input.JOY_R;
  if (d > R) { dx *= R / d; dy *= R / d; }
  base.classList.remove('hidden'); knob.classList.remove('hidden');
  base.style.transform = 'translate(' + (j.x0 - R) + 'px,' + (j.y0 - R) + 'px)';
  knob.style.transform = 'translate(' + (j.x0 + dx - 26) + 'px,' + (j.y0 + dy - 26) + 'px)';
};

// 每帧读取
Input.poll = function () {
  var k = Input.keys, x = 0, y = 0;
  if (k.KeyW || k.ArrowUp) y += 1;
  if (k.KeyS || k.ArrowDown) y -= 1;
  if (k.KeyA || k.ArrowLeft) x -= 1;
  if (k.KeyD || k.ArrowRight) x += 1;
  if (Input.joy) {
    var R = Input.JOY_R;
    x = clamp((Input.joy.x - Input.joy.x0) / R, -1, 1);
    y = clamp(-(Input.joy.y - Input.joy.y0) / R, -1, 1);
    var m = Math.sqrt(x * x + y * y);
    if (m < 0.15) { x = 0; y = 0; }
  }
  var len = Math.sqrt(x * x + y * y);
  if (len > 1) { x /= len; y /= len; }
  Input.move.x = x; Input.move.y = y;
  Input.slideHeld = !!(k.ShiftLeft || k.ShiftRight || k.KeyC || Input.mouseSlide || Input.touchSlide || Input.touchSlideOn);
};

Input.lock = function () {
  var c = Input.canvas;
  if (Input.isTouch || !c.requestPointerLock || document.pointerLockElement === c) return;
  try { var r = c.requestPointerLock(); if (r && r.catch) r.catch(function () { /* 刚退出锁定时浏览器会拒绝，下次点击再试 */ }); } catch (e) { /* 不支持就用拖动 */ }
};

Input.consumeLook = function () {
  var d = { x: Input.lookDX, y: Input.lookDY };
  Input.lookDX = 0; Input.lookDY = 0;
  return d;
};

Input.reset = function () {
  Input.jumpPressed = false;
};
