'use strict';
// ============================================================
//  特效：伤害数字与拾取提示（2D 画布叠加层）、方块粒子、发光精灵、
//  像素冲击环 / 爆炸 / 新月斩击 / 闪电 / 弹丸拖尾 / 贴地的像素圆盘（毒云、火焰、焦痕）
//  FX.now 是逻辑时钟（只在游戏进行时走）：拾取提示、闪光按它计时；伤害数字按绘制时间飘动
//  每帧的预算（爆炸、命中火花）在 FX.updateEffects 末尾清零
// ============================================================
var FX = {
  texts: [], pops: [], parts: [], effects: [], bolts: [], flashes: [], scorches: [], now: 0, glowN: 0,
  trailN: 0, decalN: 0, boomN: 0, sparkN: 0, boomI: 0, execT: -9
};

FX.MAX_TEXTS = 60;
FX.GLOW_CAP = 1500;
FX.BOLT_SEGS = 512;        // 闪电和拖尾共用的发光带：最多 BOLT_SEGS × 2 个四边形
FX.TRAIL_CAP = 480;        // 其中留给弹丸拖尾的四边形
FX.EFFECT_CAP = 48;        // 同时存在的形状特效（每个一次绘制）
FX.DECAL_CAP = 128;
FX.SPARK_CAP = 10;         // 每帧最多几个命中火花
FX.NOPULL = 10;            // 发光精灵的形状 + 10：贴地的光，不往镜头挪
FX.POP_PX = 24;
// 画布上的字和界面一样只用像素字体 KM Pixel 12（中文、数字都是它；后面是缺字时的备用）
FX.PIX_FONT = '"KM Pixel 12", "PingFang SC", "Hiragino Sans GB", sans-serif';
FX.CJK_FONT = FX.PIX_FONT;
FX.boomT = [-9, -9, -9, -9, -9, -9];   // 最近 6 次爆炸的时间

// 实例化网格：颜色缓冲按当前 count 分配，所以先把所有槽位填好颜色，再把 count 设为 0
FX.instanced = function (geo, mat, cap, scene) {
  var im = new THREE.InstancedMesh(geo, mat, cap);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  var white = new THREE.Color(1, 1, 1);
  for (var i = 0; i < cap; i++) im.setColorAt(i, white);
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  im.count = 0;
  im.visible = false;
  if (scene) scene.add(im);
  return im;
};

// 本帧用了 n 个实例：只上传用到的那一段
FX.commit = function (im, n) {
  im.count = n;
  im.visible = n > 0;
  if (n <= 0) return;
  im.instanceMatrix.updateRange.count = n * 16;
  im.instanceMatrix.needsUpdate = true;
  if (im.instanceColor) { im.instanceColor.updateRange.count = n * 3; im.instanceColor.needsUpdate = true; }
};

// 十六进制颜色 → 0~1 的分量
FX.hr = function (h) { return ((h >> 16) & 255) / 255; };
FX.hg = function (h) { return ((h >> 8) & 255) / 255; };
FX.hb = function (h) { return (h & 255) / 255; };
// 两个十六进制颜色按 t 混合（不新建对象）
FX.mixHex = function (a, b, t) {
  var r = Math.round(lerp((a >> 16) & 255, (b >> 16) & 255, t)), g = Math.round(lerp((a >> 8) & 255, (b >> 8) & 255, t)), bl = Math.round(lerp(a & 255, b & 255, t));
  return (r << 16) | (g << 8) | bl;
};
FX.scaleHex = function (a, k) {
  return (Math.min(255, Math.round(((a >> 16) & 255) * k)) << 16) | (Math.min(255, Math.round(((a >> 8) & 255) * k)) << 8) | Math.min(255, Math.round((a & 255) * k));
};
// 饱和度（0~1）：颜色很“艳”的武器（紫剑、红刺剑）斩击不能太往白色靠
FX.satHex = function (a) {
  var r = ((a >> 16) & 255) / 255, g = ((a >> 8) & 255) / 255, b = (a & 255) / 255;
  var mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx <= 0 ? 0 : (mx - mn) / mx;
};

// ---------------- 拾取物材质 ----------------
// 不吃场景光照（夜里也亮）：镜头空间里固定一盏左上方的灯，算出亮面、暗面和高光；
// 暗面用“颜色的平方”，颜色更饱和；雾只吃一部分，远处也能看见发光的东西
// 顶点颜色为负数的三角形是描边外壳：画成同色系的深色
FX.TOY_VS = [
  '#include <fog_pars_vertex>',
  'varying vec3 vCol;',
  'varying vec3 vN;',
  'varying vec3 vV;',
  'varying float vHull;',
  'void main() {',
  '  vHull = color.r < 0.0 ? 1.0 : 0.0;',
  '  vCol = abs(color);',
  '  #ifdef USE_INSTANCING_COLOR',
  '    vCol *= instanceColor;',
  '  #endif',
  '  vec4 p = vec4(position, 1.0);',
  '  vec3 n = normal;',
  '  #ifdef USE_INSTANCING',
  '    p = instanceMatrix * p;',
  '    n = mat3(instanceMatrix) * n;',
  '  #endif',
  '  vec4 mvPosition = modelViewMatrix * p;',
  '  vN = normalize(normalMatrix * n);',
  '  vV = -mvPosition.xyz;',
  '  gl_Position = projectionMatrix * mvPosition;',
  '  #include <fog_vertex>',
  '}'
].join('\n');

FX.TOY_FS = [
  'uniform vec3 uColor;',
  'uniform float uFog;',
  'uniform float uSpec;',
  'uniform float uLight;',
  '#include <fog_pars_fragment>',
  'varying vec3 vCol;',
  'varying vec3 vN;',
  'varying vec3 vV;',
  'varying float vHull;',
  'void main() {',
  '  vec3 base = vCol * uColor;',
  '  vec3 col;',
  '  if (vHull > 0.5) {',
  '    col = base * base * 0.38;',
  '  } else {',
  '    vec3 n = normalize(vN);',
  '    vec3 v = normalize(vV);',
  '    vec3 L = normalize(vec3(-0.45, 0.7, 0.55));',
  '    float s = clamp(0.16 + 0.62 * max(dot(n, L), 0.0) + 0.34 * max(dot(n, v), 0.0), 0.0, 1.2);',
  '    col = mix(base * base * 0.8, base * uLight, s);',
  '    vec3 h = normalize(L + v);',
  '    col += vec3(pow(max(dot(n, h), 0.0), 26.0) * uSpec);',
  '  }',
  '  gl_FragColor = vec4(col, 1.0);',
  '  #ifdef USE_FOG',
  '    #ifdef FOG_EXP2',
  '      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);',
  '    #else',
  '      float fogFactor = smoothstep(fogNear, fogFar, fogDepth);',
  '    #endif',
  '    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * uFog);',
  '  #endif',
  '}'
].join('\n');

FX.toyMat = function (o) {
  o = o || {};
  return new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uColor: { value: new THREE.Color(o.color != null ? o.color : 0xffffff) },
      uFog: { value: o.fog != null ? o.fog : 0.5 },
      uSpec: { value: o.spec != null ? o.spec : 0.5 },
      uLight: { value: o.light != null ? o.light : 1.15 }
    }]),
    vertexShader: FX.TOY_VS,
    fragmentShader: FX.TOY_FS,
    vertexColors: true,
    fog: true
  });
};

// ---------------- 发光精灵（一次绘制） ----------------
// 实例矩阵只存缩放和位置：x/y 缩放 = 宽/高，z 缩放 = 形状（1 光团 2 圆环 3 四角星 4 斜十字星；负数 = 贴地的光），
// 顶点着色器里让它朝向镜头
FX.GLOW_VS = [
  'varying vec2 vUv;',
  'varying vec3 vCol;',
  'varying float vShape;',
  'void main() {',
  '  vUv = uv;',
  '  vCol = instanceColor;',
  '  float sz = instanceMatrix[2][2];',
  '  vShape = abs(sz);',
  '  vec2 sc = vec2(instanceMatrix[0][0], instanceMatrix[1][1]);',
  '  vec4 mv = modelViewMatrix * vec4(instanceMatrix[3].xyz, 1.0);',
  // 朝镜头挪一点，免得被自己的模型和地面挡住；贴地的光不挪；2 米以上的大光团只挪 0.25 米（不然会盖到角色身上把人染色）
  '  float pull = sz < 0.0 ? 0.0 : mix(min(sc.x * 0.45, 1.2), 0.25, smoothstep(1.6, 2.6, sc.x));',
  '  mv.xyz += normalize(-mv.xyz) * pull;',
  '  mv.xy += position.xy * sc;',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');

FX.GLOW_FS = [
  'varying vec2 vUv;',
  'varying vec3 vCol;',
  'varying float vShape;',
  'void main() {',
  '  vec2 d = vUv * 2.0 - 1.0;',
  '  float r = length(d);',
  '  float a;',
  '  if (vShape < 1.5) {',
  '    a = 1.0 - r; a *= a;',
  '  } else if (vShape < 2.5) {',
  '    a = 1.0 - abs(r - 0.8) * 7.0;',
  '  } else {',
  '    vec2 q = vShape < 3.5 ? abs(d) : abs(vec2(d.x + d.y, d.x - d.y) * 0.7071);',
  '    a = max(1.0 - q.x * 6.0 - q.y, 1.0 - q.y * 6.0 - q.x);',
  '    a = max(a, 1.0 - r * 3.2);',
  '  }',
  // 分级：复古的阶梯状光晕
  '  a = floor(clamp(a, 0.0, 1.0) * 5.0 + 0.5) / 5.0;',
  '  gl_FragColor = vec4(vCol * a, 1.0);',
  '}'
].join('\n');

// x,y,z 中心；w,h 宽高（米）；c 颜色（THREE.Color）；a 亮度；shape 0 光团 1 圆环 2 四角星 3 斜十字星（+FX.NOPULL：贴地，不往镜头挪）
FX.glow = function (x, y, z, w, h, c, a, shape) {
  var n = FX.glowN;
  if (n >= FX.GLOW_CAP || !FX.glowMesh) return;
  var m = FX.glowMesh.instanceMatrix.array, o = n * 16;
  shape = shape || 0;
  var flat = shape >= FX.NOPULL;
  m[o] = w; m[o + 5] = h; m[o + 10] = flat ? -(shape - FX.NOPULL + 1) : shape + 1;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  var ca = FX.glowMesh.instanceColor.array, k = n * 3;
  ca[k] = c.r * a; ca[k + 1] = c.g * a; ca[k + 2] = c.b * a;
  FX.glowN = n + 1;
};

// 持续一小段时间、逐渐变暗的闪光（爆炸、雷击、暴击火花）
FX.flash = function (x, y, z, size, color, life, shape) {
  // 通关的大横幅（body.kmEnd）时不再加四角星的闪光（不用随机数，种子世界不变）；已经在屏幕上的由 FX.dropStars 拿掉
  if (shape === 2 && document.body && document.body.classList.contains('kmEnd')) return;
  if (FX.flashes.length >= 140) FX.flashes.shift();
  FX.flashes.push({ x: x, y: y, z: z, s: size, c: color, t: 0, life: life || 0.25, shape: shape || 0 });
};

// 通关 / 阵亡（Game.state 'end'）：闪光不再变老、发光网格不再重新提交，最后一帧战斗里的命中星星会一直定在骑士周围
// （UI_STYLE §2.4、§4.2：英雄镜头里只有金色彩带，没有白色的星）。拿掉已经在屏幕上的四角星和斜十字星
// （FX.glow 往矩阵第 10 个数写 shape + 1：3 = 四角星，4 = 斜十字星；拾取物的闪烁星也算），其余发光照旧定格。
// 只在 'end' 里跑，不用随机数：战斗里的随机数顺序不变
FX.dropStars = function () {
  var i, n = 0;
  for (i = 0; i < FX.flashes.length; i++) if (FX.flashes[i].shape === 2 || FX.flashes[i].shape === 3) n++;
  if (n) FX.flashes = FX.flashes.filter(function (f) { return f.shape !== 2 && f.shape !== 3; });
  var im = FX.glowMesh;
  if (!im || !im.count) return;
  var m = im.instanceMatrix.array, c = im.instanceColor && im.instanceColor.array, sh;
  n = 0;
  for (i = 0; i < im.count; i++) {
    sh = m[i * 16 + 10];
    if (sh === 3 || sh === 4) continue;
    if (n !== i) { m.copyWithin(n * 16, i * 16, i * 16 + 16); if (c) c.copyWithin(n * 3, i * 3, i * 3 + 3); }
    n++;
  }
  if (n !== im.count) FX.commit(im, n);
};

// ---------------- 初始化 ----------------
FX.init = function (scene, overlay) {
  FX.scene = scene;
  FX.canvas = overlay;
  FX.ctx = overlay.getContext('2d');
  // 画布文字不会自己去下载网页字体：先请求一次像素字体（没声明这个字体时什么也不做）
  try {
    if (document.fonts && document.fonts.load) {
      document.fonts.load('18px "KM Pixel 12"', '0123456789+$骑士鼓舞格挡').catch(function () {});
      document.fonts.load('12px "KM Pixel 12"', 'Lv0123456789').then(function () { FX.glyphInit(); }).catch(function () {});
    }
  } catch (e) { /* 忽略 */ }
  // 粒子：实例化小方块；顶点颜色让顶面亮、侧面暗，不用光照也有立体感
  var bg = new THREE.BoxGeometry(1, 1, 1);
  var nor = bg.attributes.normal.array, col = new Float32Array(nor.length);
  for (var i = 0; i < nor.length; i += 3) {
    var v = nor[i + 1] > 0.5 ? 1 : nor[i + 1] < -0.5 ? 0.45 : Math.abs(nor[i]) > 0.5 ? 0.8 : 0.64;
    col[i] = col[i + 1] = col[i + 2] = v;
  }
  bg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  FX.partMesh = FX.instanced(bg, new THREE.MeshBasicMaterial({ vertexColors: true }), 700, scene);
  // 发光精灵
  var gm = new THREE.ShaderMaterial({
    vertexShader: FX.GLOW_VS, fragmentShader: FX.GLOW_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  FX.glowMesh = FX.instanced(new THREE.PlaneGeometry(1, 1), gm, FX.GLOW_CAP, scene);
  FX.glowMesh.renderOrder = 5;
  // 闪电和弹丸拖尾：朝向镜头的发光带（外层光晕 + 白色细芯）；颜色按每段存在顶点上，仍然一次绘制
  // aCol.a = 光晕盖住背景的程度：默认的淡蓝闪电是 0（纯叠加）；别的颜色盖住一点背景，不然叠加在蓝天上会变成青白色
  // aFade = 这一端的亮度（拖尾从头到尾渐暗）
  var nv = FX.BOLT_SEGS * 12;
  FX.boltGeo = new THREE.BufferGeometry();
  FX.boltPos = new Float32Array(nv * 3);
  FX.boltOther = new Float32Array(nv * 3);
  FX.boltInfo = new Float32Array(nv * 4);
  FX.boltCol = new Float32Array(nv * 4);
  FX.boltFade = new Float32Array(nv);
  FX.boltGeo.setAttribute('position', new THREE.BufferAttribute(FX.boltPos, 3).setUsage(THREE.DynamicDrawUsage));
  FX.boltGeo.setAttribute('aOther', new THREE.BufferAttribute(FX.boltOther, 3).setUsage(THREE.DynamicDrawUsage));
  FX.boltGeo.setAttribute('aInfo', new THREE.BufferAttribute(FX.boltInfo, 4).setUsage(THREE.DynamicDrawUsage));
  FX.boltGeo.setAttribute('aCol', new THREE.BufferAttribute(FX.boltCol, 4).setUsage(THREE.DynamicDrawUsage));
  FX.boltGeo.setAttribute('aFade', new THREE.BufferAttribute(FX.boltFade, 1).setUsage(THREE.DynamicDrawUsage));
  FX.boltGeo.setDrawRange(0, 0);
  FX.boltMesh = new THREE.Mesh(FX.boltGeo, new THREE.ShaderMaterial({
    vertexShader: [
      'attribute vec3 aOther;',
      'attribute vec4 aInfo;',
      'attribute vec4 aCol;',
      'attribute float aFade;',
      'varying float vEdge;',
      'varying float vCore;',
      'varying float vFade;',
      'varying vec4 vCol;',
      'void main() {',
      '  vec4 p = modelViewMatrix * vec4(position, 1.0);',
      '  vec4 o = modelViewMatrix * vec4(aOther, 1.0);',
      '  vec3 s = cross(o.xyz - p.xyz, p.xyz);',
      '  float l = length(s);',
      '  if (l > 1e-6) p.xyz += s / l * aInfo.x * aInfo.z;',
      '  vEdge = aInfo.y;',
      '  vCore = aInfo.w;',
      '  vFade = aFade;',
      '  vCol = aCol;',
      '  gl_Position = projectionMatrix * p;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'varying float vEdge;',
      'varying float vCore;',
      'varying float vFade;',
      'varying vec4 vCol;',
      'void main() {',
      '  float e = 1.0 - abs(vEdge);',
      '  vec3 c = vCore > 0.5 ? mix(vCol.rgb, vec3(1.0), 0.55 + 0.45 * e) : vCol.rgb * (0.12 + 0.45 * e * e);',
      '  float a = vCore > 0.5 ? 0.0 : vCol.a * e * e;',
      // 预乘透明度混合：a 为 0 时就是纯叠加
      '  gl_FragColor = vec4(c, a) * vFade;',
      '}'
    ].join('\n'),
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
  }));
  FX.boltMesh.frustumCulled = false;
  FX.boltMesh.renderOrder = 6;
  scene.add(FX.boltMesh);
  // 贴地的像素圆盘（毒云、火焰地面、焦痕）：一次绘制
  FX.decalMat = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]),
    vertexShader: FX.DECAL_VS, fragmentShader: FX.DECAL_FS,
    transparent: true, depthWrite: false, fog: true,
    blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor
  });
  FX.decalMesh = FX.instanced(FX.decalGeo(), FX.decalMat, FX.DECAL_CAP, scene);
  FX.decalMesh.renderOrder = 1;
  FX.pool = {};
  FX.tc = new THREE.Color();
};

FX.clear = function () {
  FX.texts = []; FX.pops = []; FX.parts = []; FX.bolts = []; FX.flashes = []; FX.scorches = [];
  FX.effects.forEach(function (e) { e.mesh.visible = false; e.free = true; });
  FX.effects = [];
  // 换关：特效池每种只留几个（着色器保持编译好），多出来的网格拿出场景、释放材质（几何体是共用的）
  for (var k in FX.pool) {
    var list = FX.pool[k];
    for (var i = FX.POOL_KEEP; i < list.length; i++) { if (list[i].mesh.parent) list[i].mesh.parent.remove(list[i].mesh); list[i].mesh.material.dispose(); }
    if (list.length > FX.POOL_KEEP) list.length = FX.POOL_KEEP;
  }
  FX.glowN = 0; FX.trailN = 0; FX.decalN = 0;
  if (FX.glowMesh) { FX.commit(FX.glowMesh, 0); FX.commit(FX.partMesh, 0); FX.commit(FX.decalMesh, 0); FX.boltGeo.setDrawRange(0, 0); }
  FX.wipeCanvas();
};
// 马上擦掉画布上的字（伤害数字、拾取提示）：平时只有 FX.drawTexts 每帧擦，主菜单不画字也就不擦，
// 不在这里擦的话，回主菜单时上一局最后的数字会一直留在菜单上
FX.wipeCanvas = function () {
  var cv = FX.canvas, ctx = FX.ctx;
  if (!cv || !ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
};

// ---------------- 伤害数字 ----------------
// px：字号（CSS 像素）；中文用粗黑体，数字和英文用像素字体
// 动画按绘制时间走（暂停时停住）；另外按逻辑时间丢掉 3 秒前的，不画画面时也不会越攒越多
// 满了先挤掉最老的普通数字（暴击和文字留着）
FX.execE = null;
FX.execS = '';
FX.text = function (x, y, z, str, color, scale) {
  // 处决 / 斩杀的字（Enemies.damage 正在结算这一次）：交给 FX.execText 限流
  if (FX.execE && str === FX.execS) { var ee = FX.execE; FX.execE = null; FX.execText(ee, str); return null; }
  var T = FX.texts;
  while (T.length && FX.now - T[0].b > 3) T.shift().dead = true;
  if (T.length >= FX.MAX_TEXTS) {
    var k = 0;
    for (var i = 0; i < T.length; i++) if (!T[i].keep) { k = i; break; }
    T.splice(k, 1)[0].dead = true;
  }
  str = String(str);
  var cjk = /[^\x00-\x7f]/.test(str);
  var L = {
    x: x + rand(-0.3, 0.3), y: y, z: z + rand(-0.3, 0.3), s: str, c: color || '#fff',
    px: Math.round((cjk ? 17 : 16) * (scale || 1)), b: FX.now, t: 0, pt: 0, life: cjk ? 1.0 : 0.75, cjk: cjk, dx: rand(-10, 10),
    keep: cjk || (scale || 1) > 1.05, v: 0, crit: 0, m: FX.now, dead: false
  };
  T.push(L);
  return L;
};

// crit: 0 普通白色，1 暴击黄色，2 超大暴击红色
// 同一个敌人短时间内挨的几下合并成一个数字（数字变大、再弹一下），不会一排排地重复
// FX.dmgE：正在结算伤害的敌人（weapons.js 包了一层 Enemies.damage）；FX.tickDmg：光环/毒云这类跳伤
FX.dmgE = null;
FX.tickDmg = false;
FX.DMG_COL = ['#ffffff', '#ffd23a', '#ff3b30'];
FX.DMG_PX = [13, 18, 22];
FX.damage = function (x, y, z, dmg, crit) {
  crit = crit || 0;
  var e = FX.dmgE, L = e ? e._lbl : null, tick = FX.tickDmg && !crit;
  if (L && !L.dead && L.t < L.life * 0.7 && FX.now - L.b < 1.2 && FX.now - L.m < (FX.tickDmg ? 0.7 : 0.25)) {
    L.v += dmg; L.s = fmtNum(L.v); L.m = FX.now;
    if (crit > L.crit) { L.crit = crit; L.c = FX.DMG_COL[crit]; L.px = FX.DMG_PX[crit]; L.keep = true; L.life = 0.75; }
    if (L.t > 0.12) L.t = 0.12;
    if (!tick) L.pt = 0;
  } else {
    // 跳伤：同一个敌人 0.9 秒内只出一个新数字（其余的加进旧数字里或者不显示）
    if (tick && e && FX.now - (e._lblT || -9) < 0.9) return;
    L = FX.text(x, y, z, fmtNum(dmg), FX.DMG_COL[crit], FX.DMG_PX[crit] / 16);
    L.v = dmg; L.crit = crit; L.keep = crit > 0; L.life = crit ? 0.75 : 0.6;
    if (e) { e._lbl = L; e._lblT = FX.now; }
  }
  if (crit) FX.flash(x, y - 0.3, z, (crit === 2 ? 1.6 : 1.1) * 1.3, crit === 2 ? 0xff5030 : 0xffd23a, 0.18, 2);
};

// 不显示数字的伤害（quiet）：如果这个敌人头上正好有数字，就悄悄加进去
FX.quietDmg = function (e, dmg) {
  var L = e && e._lbl;
  if (L && !L.dead && L.t < L.life * 0.7 && FX.now - L.b < 1.2 && FX.now - L.m < 0.7) { L.v += dmg; L.s = fmtNum(L.v); }
};

// 处决 / 斩杀：每次都有一颗红色星光；字全场 0.4 秒最多一个（不会满屏的红字）
FX.execText = function (e, text) {
  FX.flash(e.x, e.y + e.r * 1.4 + 0.3, e.z, 1.2, 0xff3030, 0.15, 2);
  if (FX.now - FX.execT >= 0.4) {
    FX.execT = FX.now;
    FX.text(e.x, e.y + e.r * 2 + 0.6, e.z, text, '#ff3b3b', 1);
  }
};

// 拾取提示：捡到的经验 / 金币合并成一个数字，显示在玩家头顶的右边：两条固定的行，经验在上、金币在下，每种一次只有一个。
// 还在屏幕上（没淡完）时又捡到：加进去，原地「复活」——不透明度回到 1、重新停 0.6 秒；它正在淡出才再弹一下（大一档 90 毫秒）。
// 最后一次捡到以后停 0.6 秒（全不透明，另一种怎么捡都不影响），再花 0.4 秒淡出、往上飘 9 像素，淡完才去掉。
// 位置只平滑地变（每秒最多 30 像素，30 帧时一帧 1 像素）：复活时从飘到的地方慢慢回到原行，不往回跳。
// 两行不压在一起：经验按底边对齐、弹大时往上长，金币按顶边对齐、弹大时往下长（见 FX.drawTexts）；
// 经验在屏幕上时金币最多飘到和经验一样高（经验没往上飘，金币就原地变淡）；金币飘起来以后才来经验：经验从金币上面出来，等金币淡完再落回原行
FX.POP_HOLD = 0.6;
FX.POP_FADE = 0.4;
FX.POP_UP = 9;
FX.POP_SPEED = 30;
// 「已经在淡出」：上一帧的不透明度低于 0.99。刚停满 0.6 秒那一帧有浮点误差（fp 约 1e-16，画出来是 0.9999999），看起来还是全不透明，不算
FX.POP_FADED = 0.01;
FX.popup = function (kind, v) {
  var L = FX.pops, p = null, i;
  for (i = L.length - 1; i >= 0; i--) if (L[i].k === kind) { p = L[i]; break; }
  if (p && FX.now - p.b < 0) { L.splice(i, 1); p = null; }
  if (!p) {
    // 位置、淡出的数（off / fp / up）先放小数再归零：V8 一开始就把它们存成小数，FX.drawTexts 每帧写进去的小数不用再装箱（不产生垃圾）
    p = { k: kind, v: 0, b: FX.now, pt: FX.now, off: 0.5, fp: 0.5, up: 0.5, _tv: -1, _t: '', _ls: '', _lf: 0 };
    p.off = 0; p.fp = 0; p.up = 0;
    L.push(p);
  } else if (p.fp > FX.POP_FADED) p.pt = FX.now;   // 上一帧画的时候已经看得出在淡出才再弹一下：刚好停满 0.6 秒、看起来还全不透明的不弹
  p.b = FX.now;
  p.v += v;
};

var _v3 = null, _font = '';
// 拾取提示的位置往目标挪，一次最多挪 d
function popToward(a, b, d) { return a < b ? Math.min(b, a + d) : Math.max(b, a - d); }
FX.popT = 0;
FX.setFont = function (ctx, f) { if (_font !== f) { ctx.font = f; _font = f; } };

// ---------------- 画布上的字（伤害数字、拾取提示、「鼓舞！」「格挡」「处决」） ----------------
// 和界面一样的像素字：字号只用 12 / 18 / 24 / 36（中文至少 18）；描边 = 8 个方向各 1 个字体像素 + 底下一行厚度（深紫黑 #120c1c）；
// 数字和字母「像素加粗」（同色往右多画 1 个字体像素、字距 1 个字体像素），汉字不加粗。
// 数字和字母（伤害、+经验、$、BONK!：打斗时每帧几十个）从一张静态的像素字形图集里贴（FX.glyph）：KM Pixel 12 在 12 号时 1 个字体像素
// 正好是 1 像素，每个字形画一次描边、每种颜色画一次字（字体到了就建，以后不再往这张图上写）；贴的时候按整数倍放大
// （12 / 18 / 24 / 36 号在 2 倍屏上是 2 / 3 / 4 / 6 倍）、不平滑，和直接画出来的像素字一样。先贴整行字的描边，再贴字（描边不盖住旁边的字）。
// 全从一张图里贴：Chrome 一帧几十个数字合成一两次绘制，打斗时不新建画布、不往别的画布上写字（那样每个新数字都会卡一下）；Safari 也只是贴图。
// 有汉字的（鼓舞！、格挡、处决、摔伤 -12……）不多，直接画（12~16 次 fillText）。FX.lbl.BUDGET = 0：数字也直接画（对比用）
// frame：FX.drawTexts 每帧加 1；pass：正在 FX.drawTexts 里（平滑缩放在那里关一次，不用每个字开关一次）；hits / miss：贴图 / 直接画的次数
FX.lbl = { cache: new Map(), BUDGET: 24, hits: 0, miss: 0, ok: {}, frame: 0, pass: false };
FX.snapPx = function (px, cjk) { var s = px < 15 ? 12 : px < 21 ? 18 : px < 30 ? 24 : 36; return cjk && s < 18 ? 18 : s; };
// 字体到了没有（还没到时画出来的是备用字体，不能放进图集）
FX.fontOk = function (size) {
  var L = FX.lbl;
  if (L.ok[size]) return true;
  try { if (document.fonts && !document.fonts.check(size + 'px "KM Pixel 12"')) return false; } catch (e) { /* 没有 FontFace API：当作到了 */ }
  L.ok[size] = true;
  return true;
};
// 在 ctx 上画一行带描边的字（左对齐、字母基线在 y）；bold：像素加粗（true）/ 不加粗（false）/ 'mix'（汉字和数字混在一行，
// 「摔伤 -12」：汉字那段不加粗、数字那段加粗；先画所有段的描边，再画所有段的字）。不支持 ctx.letterSpacing 的浏览器一个字一个字地画
FX.MIX = /[\x00-\x7f]+|[^\x00-\x7f]+/g;
FX.DIGIT = /[0-9]/;
FX.paintLabel = function (ctx, s, x, y, size, color, bold) {
  if (bold !== 'mix') { FX.paintRun(ctx, s, x, y, size, '#120c1c', bold, true); FX.paintRun(ctx, s, x, y, size, color, bold, false); return; }
  var parts = String(s).match(FX.MIX) || [String(s)], xs = [], cx = x, i, b;
  for (i = 0; i < parts.length; i++) { b = parts[i].charCodeAt(0) < 128; xs.push(cx); cx += FX.labelWidth(ctx, parts[i], size, b) - (b ? size / 12 : 0); }
  for (i = 0; i < parts.length; i++) FX.paintRun(ctx, parts[i], xs[i], y, size, '#120c1c', parts[i].charCodeAt(0) < 128, true);
  for (i = 0; i < parts.length; i++) FX.paintRun(ctx, parts[i], xs[i], y, size, color, parts[i].charCodeAt(0) < 128, false);
};
// 一段字：outline 为真画 8 个方向 + 底下一行厚度的描边（加粗的描边往右宽 1 格），否则画字本身（加粗的往右再画一次）。
// 字体、字距的字符串按字号存着（每帧不拼新字符串、不建闭包：直接画的字也不产生垃圾）
FX.FONT_S = {};
FX.LS_S = {};
FX.fontStr = function (size) { return FX.FONT_S[size] || (FX.FONT_S[size] = size + 'px ' + FX.PIX_FONT); };
FX.paintRun = function (ctx, s, x, y, size, color, bold, outline) {
  var p = size / 12, dx, dy, per = bold && !('letterSpacing' in ctx);
  if (bold && !per) ctx.letterSpacing = FX.LS_S[size] || (FX.LS_S[size] = p + 'px');
  ctx.fillStyle = color;
  if (outline) {
    for (dx = -1; dx <= (bold ? 2 : 1); dx++) {
      for (dy = -1; dy <= 2; dy++) if (!(dy === 0 && (dx === 0 || (bold && dx === 1)))) FX.fillRun(ctx, s, x + dx * p, y + dy * p, p, per);
    }
  } else {
    FX.fillRun(ctx, s, x, y, p, per);
    if (bold) FX.fillRun(ctx, s, x + p, y, p, per);
  }
  if (bold && !per) ctx.letterSpacing = '0px';
};
// 画一遍字：per 为真时（不支持 ctx.letterSpacing）一个字一个字地画，字后面空 p
FX.fillRun = function (ctx, s, X, Y, p, per) {
  if (!per) { ctx.fillText(s, X, Y); return; }
  for (var i = 0, cx = X; i < s.length; i++) { ctx.fillText(s[i], cx, Y); cx += ctx.measureText(s[i]).width + p; }
};
// 整行字的宽度（加粗的：每个字后面多 1 个字体像素的字距，最后再多 1 个字体像素的加粗；'mix' 一段段加起来）；ctx 的字体要先设好
FX.labelWidth = function (ctx, s, size, bold) {
  var p = size / 12;
  if (bold === 'mix') {
    var parts = String(s).match(FX.MIX) || [String(s)], w = 0, b = false;
    for (var i = 0; i < parts.length; i++) { b = parts[i].charCodeAt(0) < 128; w += FX.labelWidth(ctx, parts[i], size, b) - (b ? p : 0); }
    return w + (b ? p : 0);
  }
  var m = ctx.measureText(s).width;
  return bold ? m + s.length * p + p : m;
};
// ---- 像素字形图集：第 0 行是描边，后面每种颜色一行；每个字形一格（左右各留 3 像素给描边和加粗），一行 23 像素高、字母基线在 15
// cell[字符编码] = { x, w（格宽）, a（字宽，字体像素）}；rows[颜色] = 第几行（-1：放不下了，直接画）
// 建图集时就画好的颜色：伤害三档、经验 / 金币提示、回血、BONK!、骰子的「6!」（不在表里的颜色第一次用到时再补一行）
FX.GLYPHS = ' !"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~';
FX.GLYPH_COLORS = ['#ffffff', '#fff', '#ffd23a', '#ff3b30', '#5fc8ff', '#5dff6a', '#ff3030', '#ffd84a'];
FX.glyph = { cv: null, cx: null, cell: [], rows: {}, n: 0, ROWS: 16, ROW: 23, BASE: 15, PAD: 3, fail: false };
FX.glyphInit = function () {
  var G = FX.glyph;
  if (G.cv) return true;
  if (G.fail || !FX.fontOk(12)) return false;
  try {
    var cv = document.createElement('canvas'), cx = cv.getContext('2d'), x = 0, i, c, a;
    cx.font = '12px ' + FX.PIX_FONT;
    for (i = 0; i < FX.GLYPHS.length; i++) {
      c = FX.GLYPHS.charCodeAt(i); a = Math.round(cx.measureText(FX.GLYPHS[i]).width);
      G.cell[c] = { x: x, w: a + G.PAD * 2, a: a };
      x += a + G.PAD * 2 + 1;
    }
    cv.width = x; cv.height = G.ROW * G.ROWS;
    cx = cv.getContext('2d');
    cx.font = '12px ' + FX.PIX_FONT; cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    G.cv = cv; G.cx = cx; G.n = 1;
    // 图集的画布丢了（GPU 重置、切到后台被回收：Chrome 和新的 Safari 会发 contextlost / contextrestored）：作废，下次用到时重画一张
    cv.addEventListener('contextlost', FX.glyphLost); cv.addEventListener('contextrestored', FX.glyphLost);
    // 描边（和 FX.paintRun 的加粗描边一样：左右 −1~+2、上下 −1~+2 个字体像素，空出字本身和加粗那一格）
    cx.fillStyle = '#120c1c';
    for (i = 0; i < FX.GLYPHS.length; i++) {
      var g = G.cell[FX.GLYPHS.charCodeAt(i)];
      for (var dx = -1; dx <= 2; dx++) for (var dy = -1; dy <= 2; dy++) if (!(dy === 0 && (dx === 0 || dx === 1))) cx.fillText(FX.GLYPHS[i], g.x + G.PAD + dx, G.BASE + dy);
    }
    FX.GLYPH_COLORS.forEach(FX.glyphRow);
    return true;
  } catch (e) { G.fail = true; G.cv = null; return false; }
};
FX.glyphLost = function (e) {
  var G = FX.glyph;
  if (e && e.target && e.target !== G.cv) return;   // 早就换掉的旧画布
  G.cv = null; G.cx = null; G.rows = {}; G.n = 0;
};
// 某种颜色的那一行（第一次用到时画：每个字形两次 fillText）；满了返回 -1
FX.glyphRow = function (color) {
  var G = FX.glyph, r = G.rows[color];
  if (r !== undefined) return r;
  if (G.n >= G.ROWS) { G.rows[color] = -1; return -1; }
  r = G.rows[color] = G.n++;
  var cx = G.cx, y = r * G.ROW + G.BASE;
  cx.fillStyle = color;
  for (var i = 0; i < FX.GLYPHS.length; i++) {
    var g = G.cell[FX.GLYPHS.charCodeAt(i)];
    cx.fillText(FX.GLYPHS[i], g.x + G.PAD, y); cx.fillText(FX.GLYPHS[i], g.x + G.PAD + 1, y);
  }
  return r;
};
// 一行字能不能贴（都是图集里有的字）→ 字宽（字体像素：每个字 + 1 个字距，最后 + 1 个加粗）；不能贴返回 -1
FX.glyphFp = function (s) {
  var G = FX.glyph, w = 0;
  for (var i = 0; i < s.length; i++) { var g = G.cell[s.charCodeAt(i)]; if (!g) return -1; w += g.a + 1; }
  return w + 1;
};
// 描边文字：(x, y) 按 ctx 当前的 textAlign（center / left / right）和 textBaseline（middle / alphabetic）对齐；画完 ctx 的对齐方式不变。
// rec（可选）：这个字自己的记录（FX.texts 里的一条、一条拾取提示）：字、字号没变时记着上次量的宽度，不用每帧再量
FX.drawLabel = function (ctx, s, x, y, px, color, cjk, rec) {
  var size = FX.snapPx(px, cjk), L = FX.lbl, G = FX.glyph, f = size / 12, fp = -1, lw, i, g;
  s = typeof s === 'string' ? s : String(s);
  if (!cjk && L.BUDGET > 0 && (G.cv || FX.glyphInit())) {
    if (rec && rec._ls === s) fp = rec._lf;
    else { fp = FX.glyphFp(s); if (rec) { rec._ls = s; rec._lf = fp; } }
  }
  var row = fp > 0 ? FX.glyphRow(color) : -1;
  var al = ctx.textAlign, bl = ctx.textBaseline;
  if (row > 0) {
    lw = fp * f;
    var x0 = Math.round(al === 'center' ? x - lw / 2 : al === 'right' || al === 'end' ? x - lw : x);
    var y0 = Math.round(bl === 'middle' ? y + size * 0.4 : y), top = y0 - G.BASE * f, h = G.ROW * f, gx, sm = ctx.imageSmoothingEnabled;
    if (!L.pass) ctx.imageSmoothingEnabled = false;
    // 先贴整行的描边（第 0 行），再贴字（这种颜色的那一行）
    for (gx = x0, i = 0; i < s.length; i++) { g = G.cell[s.charCodeAt(i)]; ctx.drawImage(G.cv, g.x, 0, g.w, G.ROW, gx - G.PAD * f, top, g.w * f, h); gx += (g.a + 1) * f; }
    for (gx = x0, i = 0; i < s.length; i++) { g = G.cell[s.charCodeAt(i)]; ctx.drawImage(G.cv, g.x, row * G.ROW, g.w, G.ROW, gx - G.PAD * f, top, g.w * f, h); gx += (g.a + 1) * f; }
    if (!L.pass) ctx.imageSmoothingEnabled = sm;
    L.hits++;
    return;
  }
  // 直接画：汉字（不加粗；里面有数字时数字那段加粗）、图集里没有的字、字体还没到、BUDGET = 0。
  // 宽度也记在这个字的记录上（字、字号没变，字体也到了：不再每帧量）
  var bold = !cjk || (FX.DIGIT.test(s) ? 'mix' : false);
  FX.setFont(ctx, FX.fontStr(size));
  if (rec && rec._ds === s && rec._dz === size) lw = rec._dw;
  else {
    lw = FX.labelWidth(ctx, s, size, bold);
    if (rec && FX.fontOk(size)) { rec._ds = s; rec._dz = size; rec._dw = lw; }
  }
  var x1 = Math.round(al === 'center' ? x - lw / 2 : al === 'right' || al === 'end' ? x - lw : x);
  var y1 = Math.round(bl === 'middle' ? y + size * 0.4 : y);
  L.miss++;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  FX.paintLabel(ctx, s, x1, y1, size, color, bold);
  ctx.textAlign = al; ctx.textBaseline = bl;
};

FX.drawTexts = function (cam, dt) {
  var ctx = FX.ctx, cv = FX.canvas, LB = FX.lbl;
  LB.frame++;
  var w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); _font = ''; }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  // 字形图集按像素贴（不平滑）：这一遍里关一次，画完还原
  var sm0 = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  LB.pass = true;
  if (!_v3) _v3 = new THREE.Vector3();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  var now = FX.now, T = FX.texts, i;
  for (i = T.length - 1; i >= 0; i--) {
    T[i].t += dt || 0; T[i].pt += dt || 0;
    if (T[i].t >= T[i].life) { T[i].dead = true; T.splice(i, 1); }
  }
  for (i = 0; i < T.length; i++) {
    var t = T[i], a = t.t, k = a / t.life;
    // 先快后慢地往上飘一点
    _v3.set(t.x, t.y + 1.3 * a - 0.9 * a * a, t.z).project(cam);
    if (_v3.z > 1 || _v3.x < -1.1 || _v3.x > 1.1 || _v3.y < -1.1 || _v3.y > 1.1) continue;
    var sx = Math.round((_v3.x * 0.5 + 0.5) * w + t.dx * k), sy = Math.round((-_v3.y * 0.5 + 0.5) * h);
    var pop = t.pt < 0.09 ? 1 + (0.09 - t.pt) * 4 : 1;
    ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
    FX.drawLabel(ctx, t.s, sx, sy, Math.round(t.px * pop), t.c, t.cjk, t);
  }
  // 拾取提示：在头的右边，经验在上（浅蓝），金币在下（金色），左对齐。
  // 经验那一行按字的底边（基线）对齐，金币那一行按「$」的顶边（描边在内，基线上面 11 个字体像素）对齐，
  // 金币的顶边比经验最大的底边（36 号时基线下面 6 像素）再低 2 像素：两行怎么弹大都碰不到
  var L = FX.pops;
  var pdt = Math.min(0.1, Math.max(0, now - FX.popT));
  FX.popT = now;
  if (L.length) {
    var xp = null, gd = null;
    for (i = L.length - 1; i >= 0; i--) {
      var p = L[i], age = now - p.b;
      // 淡完了才去掉（FX.now 往回走：换了一局）
      if (age >= FX.POP_HOLD + FX.POP_FADE || age < 0) { L.splice(i, 1); continue; }
      p.fp = Math.max(0, age - FX.POP_HOLD) / FX.POP_FADE;
      p.up = FX.POP_UP * p.fp;
      if (p.k === 'xp') xp = p; else gd = p;
    }
    var step = FX.POP_SPEED * pdt;
    // 金币：经验在屏幕上时，最多飘到经验自己要飘的高度（或者停在已经飘到的地方，不往下掉）
    if (gd) gd.off = popToward(gd.off, xp ? Math.min(gd.up, Math.max(xp.up, gd.off)) : gd.up, step);
    // 经验：至少和金币飘得一样高（金币飘起来以后才来的经验从上面出来）
    if (xp) xp.off = Math.max(popToward(xp.off, xp.up, step), gd ? gd.off : 0);
  }
  if (L.length && P.model) {
    _v3.set(P.pos.x, P.pos.y + 1.95, P.pos.z).project(cam);
    var hx = Math.round((_v3.x * 0.5 + 0.5) * w + h * 0.035), hy = Math.round((-_v3.y * 0.5 + 0.5) * h);
    if (_v3.z < 1) {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      for (i = L.length - 1; i >= 0; i--) {
        var q = L[i];
        // 刚出来 / 复活的 0.09 秒大一档（36，和伤害数字一样一格跳，不平滑放大），之后 24
        var px = now - q.pt < 0.09 ? 36 : FX.POP_PX, f = px / 12;
        var y = q.k === 'xp' ? hy + 10 - Math.round(q.off) : hy + 18 - Math.round(q.off) + 11 * f;
        ctx.globalAlpha = 1 - q.fp;
        // 数值没变就用上次拼好的字（不每帧新拼字符串）
        if (q._tv !== q.v) { q._tv = q.v; q._t = (q.k === 'xp' ? '+' : '$') + fmtNum(q.v); }
        FX.drawLabel(ctx, q._t, hx, y, px, q.k === 'xp' ? '#5fc8ff' : '#ffd23a', false, q);
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }
  }
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = sm0;
  LB.pass = false;
};

// ---------------- 粒子 ----------------
// 粒子对象重复使用（死掉的放回 FX.partPool）；满了就轮流顶掉旧的（不再每颗都整体挪动数组）
FX.PART_CAP = 700;
FX.partPool = [];
FX.partI = 0;
FX.part = function (x, y, z, vx, vy, vz, color, size, life, g) {
  var p = FX.partPool.pop() || {};
  p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.t = 0; p.s = size; p.c = color; p.rot = Math.random() * 3; p.g = g;
  var L = FX.parts;
  if (L.length < FX.PART_CAP) L.push(p);
  else { FX.partI = (FX.partI + 1) % L.length; FX.partPool.push(L[FX.partI]); L[FX.partI] = p; }
  return p;
};

FX.burst = function (x, y, z, n, color, speed, size) {
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, s = rand(0.3, 1) * (speed || 6);
    FX.part(x, y, z, Math.cos(a) * s, rand(2, 7), Math.sin(a) * s, color, (size || 0.25) * rand(0.6, 1.3), rand(0.35, 0.8));
  }
};

FX.puff = function (x, y, z, n, color) { FX.burst(x, y + 0.1, z, n, color || 0xffffff, 3, 0.3); };

// 往上飘的小光点（g 是重力，负数就往上飘）
FX.mote = function (x, y, z, color, size, vy, life) {
  FX.part(x, y, z, 0, vy || 1.2, 0, color, size || 0.1, life || 0.9, 0);
};

// 慢慢往上飘的深色烟块
FX.smoke = function (x, y, z, n, color) {
  for (var i = 0; i < n; i++) FX.part(x + rand(-0.4, 0.4), y + rand(0, 0.4), z + rand(-0.4, 0.4), rand(-0.8, 0.8), rand(0.6, 1.6), rand(-0.8, 0.8), color || 0x3a2e2a, rand(0.45, 0.7), rand(0.6, 0.9), -1.5);
};

// 命中火花：一颗白色四角星 + 几块碎屑（每帧最多 FX.SPARK_CAP 个，大群敌人时不会刷屏）
// 碎屑飞得短（0.25~0.45 秒），也不做落地检测（g 写明了），很便宜
FX.spark = function (x, y, z, size, star, n, cube, cubeSize) {
  if (FX.sparkN >= FX.SPARK_CAP) return false;
  FX.sparkN++;
  if (size > 0) FX.flash(x, y, z, size, star, 0.08, 2);
  for (var i = 0; i < n; i++) {
    var a = Math.random() * TAU, s = rand(1.5, 4.5);
    FX.part(x, y, z, Math.cos(a) * s, rand(2, 5), Math.sin(a) * s, cube, (cubeSize || 0.2) * rand(0.7, 1.2), rand(0.25, 0.45), 18);
  }
  return true;
};

var _m4 = null, _q = null, _s = null, _p = null, _c = null, _e = null;
FX.updateParts = function (dt) {
  if (!_m4) { _m4 = new THREE.Matrix4(); _q = new THREE.Quaternion(); _s = new THREE.Vector3(); _p = new THREE.Vector3(); _c = new THREE.Color(); _e = new THREE.Euler(); }
  var n = 0, ca = FX.partMesh.instanceColor.array, L = FX.parts;
  for (var i = L.length - 1; i >= 0; i--) {
    var p = L[i];
    p.t += dt;
    // 死掉的用最后一颗补位（顺序无所谓），对象放回池里
    if (p.t >= p.life) { FX.partPool.push(p); L[i] = L[L.length - 1]; L.pop(); continue; }
    p.vy -= (p.g == null ? 18 : p.g) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    if (p.g == null) {
      var gh = W.terrainH(p.x, p.z);
      if (p.y < gh) { p.y = gh; p.vy *= -0.4; p.vx *= 0.6; p.vz *= 0.6; }
    }
    var k = 1 - p.t / p.life;
    _e.set(p.rot + p.t * 6, p.rot, 0);
    _q.setFromEuler(_e);
    _s.set(p.s * k, p.s * k, p.s * k);
    _p.set(p.x, p.y, p.z);
    _m4.compose(_p, _q, _s);
    FX.partMesh.setMatrixAt(n, _m4);
    _c.setHex(p.c);
    ca[n * 3] = _c.r; ca[n * 3 + 1] = _c.g; ca[n * 3 + 2] = _c.b;
    n++;
  }
  FX.commit(FX.partMesh, n);
};

// ---------------- 形状 ----------------
// 像素圆环：把单位圆上半径 rIn..rOut 之间的网格小方块挑出来（XZ 平面）；返回 [cx, cz, 半边长]
FX.pixelRingCells = function (n, rIn, rOut) {
  var cells = [], cs = 2.4 / n, h = cs / 2;
  for (var i = 0; i < n; i++) for (var j = 0; j < n; j++) {
    var cx = -1.2 + (i + 0.5) * cs, cz = -1.2 + (j + 0.5) * cs, d = Math.sqrt(cx * cx + cz * cz);
    if (d >= rIn && d <= rOut) cells.push([cx, cz, h]);
  }
  return cells;
};

FX.cellsGeo = function (cells) {
  var pos = [];
  for (var i = 0; i < cells.length; i++) {
    var c = cells[i], x0 = c[0] - c[2], x1 = c[0] + c[2], z0 = c[1] - c[2], z1 = c[1] + c[2];
    pos.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
};

// 像素圆盘的轮廓点：边缘是台阶状的多边形
FX.pixelDiscPts = function (n, R) {
  var cs = 2 / n, pts = [], lx = null, lz = null;
  for (var k = 0; k <= 360; k++) {
    var a = k / 360 * TAU;
    var x = Math.round(Math.cos(a) * R / cs) * cs, z = Math.round(Math.sin(a) * R / cs) * cs;
    if (lx !== null && x === lx && z === lz) continue;
    if (lx !== null && x !== lx && z !== lz) {
      // 斜着走的一步补成直角：取离圆心更远的拐点
      if (x * x + lz * lz > lx * lx + z * z) pts.push([x, lz]); else pts.push([lx, z]);
    }
    pts.push([x, z]); lx = x; lz = z;
  }
  return pts;
};

// 像素圆盘：从圆心扇形三角化（三角形很少）
FX.pixelDiscGeo = function (n) {
  var pts = FX.pixelDiscPts(n, 1);
  var pos = [], nor = [], uv = [];
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i], p1 = pts[i + 1];
    pos.push(0, 0, 0, p1[0], 0, p1[1], p0[0], 0, p0[1]);
    nor.push(0, 1, 0, 0, 1, 0, 0, 1, 0);
    uv.push(0.5, 0.5, 0.5 + p1[0] / 2, 0.5 + p1[1] / 2, 0.5 + p0[0] / 2, 0.5 + p0[1] / 2);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
};

// 新月形斩击：中间厚、两头尖，外缘白亮、往里渐暗（配合叠加混合）；朝向 +Z
// wMax：最厚处（相对半径），细剑用更细的
FX.crescentGeo = function (arc, wMax) {
  wMax = wMax || 0.26;
  return FX.bandGeo(arc, 24, function (t) {
    var sn = Math.sin(t * Math.PI);
    return { w: wMax * Math.pow(sn, 0.7), f: Math.pow(sn, 0.4) };
  });
};

// 绕身横扫的刀光（镰刀）：尾巴细而暗，刀头最宽最亮、刀尖收尖；朝向 +Z，刀头在 +arc/2 那一端
FX.sweepGeo = function (arc) {
  return FX.bandGeo(arc, 48, function (t) {
    var w = 0.2 * Math.pow(t, 1.1) * (t > 0.92 ? (1 - t) / 0.08 : 1);
    return { w: Math.max(0.006, w), f: Math.pow(t, 1.3) };
  });
};

// 沿圆弧的带子：prof(t) 返回这一截的宽度 w（从半径 1 往里）和亮度 f
FX.bandGeo = function (arc, S, prof) {
  var pos = [], col = [];
  var pt = function (t) {
    var a = (t - 0.5) * arc, p = prof(t);
    return { x: Math.sin(a), z: Math.cos(a), w: p.w, f: p.f };
  };
  var ring = function (A, B, r0, r1, c0, c1) {
    var a0 = 1 - A.w * r0, a1 = 1 - A.w * r1, b0 = 1 - B.w * r0, b1 = 1 - B.w * r1;
    pos.push(A.x * a0, 0, A.z * a0, B.x * b0, 0, B.z * b0, B.x * b1, 0, B.z * b1, A.x * a0, 0, A.z * a0, B.x * b1, 0, B.z * b1, A.x * a1, 0, A.z * a1);
    var co = [A.f * c0, B.f * c0, B.f * c1, A.f * c0, B.f * c1, A.f * c1];
    for (var k = 0; k < 6; k++) col.push(co[k], co[k], co[k]);
  };
  for (var i = 0; i < S; i++) {
    var A = pt(i / S), B = pt((i + 1) / S);
    ring(A, B, 0, 0.35, 1.0, 0.85);
    ring(A, B, 0.35, 1, 0.85, 0);
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

// 贴地圆盘：中间的像素圆盘（aRim 0）+ 一圈更亮的像素边（aRim 1）
FX.decalGeo = function () {
  var pos = [], rim = [];
  var pts = FX.pixelDiscPts(14, 0.93);
  for (var i = 0; i < pts.length - 1; i++) {
    var p0 = pts[i], p1 = pts[i + 1];
    pos.push(0, 0, 0, p1[0], 0, p1[1], p0[0], 0, p0[1]);
    rim.push(0, 0, 0);
  }
  FX.pixelRingCells(28, 0.9, 1.03).forEach(function (c) {
    var x0 = c[0] - c[2], x1 = c[0] + c[2], z0 = c[1] - c[2], z1 = c[1] + c[2];
    pos.push(x0, 0, z0, x1, 0, z1, x1, 0, z0, x0, 0, z0, x0, 0, z1, x1, 0, z1);
    for (var k = 0; k < 6; k++) rim.push(1);
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aRim', new THREE.Float32BufferAttribute(rim, 1));
  return g;
};

// 贴地圆盘的着色器：实例矩阵第 4 行借来存 中间透明度 / 边的亮度 / 种类（0 毒 1 火 2 焦痕），用之前清零
FX.DECAL_VS = [
  '#include <fog_pars_vertex>',
  'attribute float aRim;',
  'varying vec3 vCol;',
  'varying vec2 vW;',
  'varying float vRim;',
  'varying vec3 vInfo;',
  'void main() {',
  '  mat4 im = instanceMatrix;',
  '  vInfo = vec3(im[0][3], im[1][3], im[2][3]);',
  '  im[0][3] = 0.0; im[1][3] = 0.0; im[2][3] = 0.0;',
  '  vCol = instanceColor;',
  '  vRim = aRim;',
  '  vec4 wp = modelMatrix * im * vec4(position, 1.0);',
  '  vW = wp.xz;',
  '  vec4 mvPosition = viewMatrix * wp;',
  '  gl_Position = projectionMatrix * mvPosition;',
  '  #include <fog_vertex>',
  '}'
].join('\n');

FX.DECAL_FS = [
  'uniform float uTime;',
  '#include <fog_pars_fragment>',
  'varying vec3 vCol;',
  'varying vec2 vW;',
  'varying float vRim;',
  'varying vec3 vInfo;',
  'float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
  'void main() {',
  // 0.33 米一格的像素明暗：毒云慢慢冒泡，火焰一闪一闪，焦痕不动
  '  float spd = vInfo.z < 0.5 ? 2.5 : vInfo.z < 1.5 ? 9.0 : 0.0;',
  '  vec2 cell = floor(vW * 3.0);',
  '  float n = hash(cell + vec2(floor(uTime * spd + hash(cell) * 3.0) * 0.37, 0.0));',
  '  vec3 c;',
  '  float a;',
  '  if (vRim > 0.5) {',
  // 焦痕：中间是烧黑的地，边是一圈发光的橙红
  '    vec3 rc = vInfo.z > 1.5 ? vec3(1.0, 0.42, 0.1) : mix(vCol, vec3(1.0), 0.3);',
  '    c = rc * (0.8 + 0.4 * n);',
  '    a = vInfo.y;',
  '  } else {',
  '    float hot = vInfo.z > 0.5 && vInfo.z < 1.5 ? step(0.93, n) * 0.7 : 0.0;',
  '    c = vCol * (0.75 + 0.45 * n) + vec3(1.0, 0.6, 0.2) * hot;',
  '    a = vInfo.x * (1.0 + hot);',
  '  }',
  '  #ifdef USE_FOG',
  '    #ifdef FOG_EXP2',
  '      float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);',
  '    #else',
  '      float fogFactor = smoothstep(fogNear, fogFar, fogDepth);',
  '    #endif',
  '    c = mix(c, fogColor, fogFactor);',
  '    a *= 1.0 - 0.7 * fogFactor;',
  '  #endif',
  // 预乘透明度：中间正常混合，边一大半是叠加发光
  '  gl_FragColor = vec4(c * a, a * (vRim > 0.5 ? 0.3 : 1.0));',
  '}'
].join('\n');

// 贴地圆盘（每帧调用）：sx/sz 是地面坡度（高度对 x / z 的变化率），圆盘跟着坡面倾斜；
// c 颜色（十六进制），a 中间透明度，ra 边的亮度，kind 0 毒 1 火 2 焦痕
FX.decal = function (x, y, z, r, sx, sz, c, a, ra, kind) {
  var n = FX.decalN;
  if (n >= FX.DECAL_CAP || !FX.decalMesh) return;
  var m = FX.decalMesh.instanceMatrix.array, o = n * 16;
  m[o] = r; m[o + 1] = r * sx; m[o + 2] = 0; m[o + 3] = a;
  m[o + 4] = 0; m[o + 5] = 1; m[o + 6] = 0; m[o + 7] = ra;
  m[o + 8] = 0; m[o + 9] = r * sz; m[o + 10] = r; m[o + 11] = kind || 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  var ca = FX.decalMesh.instanceColor.array, k = n * 3;
  ca[k] = FX.hr(c); ca[k + 1] = FX.hg(c); ca[k + 2] = FX.hb(c);
  FX.decalN = n + 1;
};

// 地面坡度：返回 [sx, sz]（写进 out，不新建数组）
FX.slope = function (x, z, r, y, out) {
  var e = Math.max(0.5, r * 0.8), fy = y + 2;
  out[0] = clamp((W.groundAt(x + e, z, fy) - W.groundAt(x - e, z, fy)) / (2 * e), -0.8, 0.8);
  out[1] = clamp((W.groundAt(x, z + e, fy) - W.groundAt(x, z - e, fy)) / (2 * e), -0.8, 0.8);
  return out;
};

// 焦痕：一段时间慢慢变淡的贴地圆盘（烧黑的地 + 发光的橙红边）；
// 附近已经有焦痕就让它重新开始，不叠成一大片
FX.scorch = function (x, y, z, r, color, a, life) {
  var S = FX.scorches;
  for (var i = 0; i < S.length; i++) {
    var o = S[i], dx = o.x - x, dz = o.z - z, rr = Math.max(1.5, Math.min(o.r, r) * 0.7);
    if (dx * dx + dz * dz < rr * rr) { o.t = Math.min(o.t, 0.2); return; }
  }
  if (S.length >= 8) S.shift();
  var s = FX.slope(x, z, r, y, [0, 0]);
  S.push({ x: x, y: y, z: z, r: r, c: color, a: a, t: 0, life: life || 1.2, sx: s[0], sz: s[1] });
};

FX.geos = {};
FX.getGeo = function (kind) {
  if (FX.geos[kind]) return FX.geos[kind];
  var g;
  if (kind === 'ring') g = new THREE.RingGeometry(0.85, 1, 32).rotateX(-Math.PI / 2);
  else if (kind === 'pring') g = FX.cellsGeo(FX.pixelRingCells(44, 0.95, 1.04));
  // 大圆环用更细的格子：世界里的粗细保持 0.3~0.5 米，不会变成一条粗带子
  else if (kind === 'pringM') g = FX.cellsGeo(FX.pixelRingCells(72, 0.965, 1.03));
  else if (kind === 'pringL') g = FX.cellsGeo(FX.pixelRingCells(128, 0.982, 1.016));
  else if (kind === 'disc') g = FX.pixelDiscGeo(14);
  else if (kind === 'ball') g = new THREE.IcosahedronGeometry(1, 1);
  else if (kind === 'ball0') g = new THREE.IcosahedronGeometry(1, 0);
  else if (kind.indexOf('sweep') === 0) g = FX.sweepGeo(parseFloat(kind.slice(5)) || 6);
  else if (kind.indexOf('slashT') === 0) g = FX.crescentGeo(parseFloat(kind.slice(6)) || 1.4, 0.15);
  else if (kind.indexOf('slash') === 0) g = FX.crescentGeo(parseFloat(kind.slice(5)) || 2.1);
  else if (kind === 'beam') g = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
  FX.geos[kind] = g;
  return g;
};

// 大圆环贴着地面：圆周上 24 个点的地面高度（相对圆心），按圆环扩散的进度 uK 慢慢贴上去
FX.RING_VS = [
  'uniform float uH[24];',
  'uniform float uK;',
  'void main() {',
  '  vec4 wp = modelMatrix * vec4(position, 1.0);',
  '  float a = atan(position.z, position.x);',
  '  if (a < 0.0) a += 6.2831853;',
  '  float f = a / 6.2831853 * 24.0;',
  '  float i0 = floor(f);',
  '  float k0 = mod(i0, 24.0), k1 = mod(i0 + 1.0, 24.0);',
  '  float h0 = 0.0, h1 = 0.0;',
  '  for (int i = 0; i < 24; i++) {',
  '    float fi = float(i);',
  '    if (abs(fi - k0) < 0.5) h0 = uH[i];',
  '    if (abs(fi - k1) < 0.5) h1 = uH[i];',
  '  }',
  '  wp.y += mix(h0, h1, f - i0) * uK;',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}'
].join('\n');
FX.RING_FS = 'uniform vec3 uCol;\nuniform float uA;\nvoid main() { gl_FragColor = vec4(uCol, uA); }';

// ---------------- 形状特效（对象池） ----------------
// opts：x y z 位置，s0→s1 缩放，life，a0 起始透明度，rx ry rz 朝向，sy 竖直缩放，
//       blend 'normal'（深色底，不发光），spin（每秒绕 Y 轴转多少弧度）
// 每种（形状 + 颜色）最多 FX.POOL_CAP 个同时播放，再多就重用播放得最久的那个；同时存在的特效总数超过
// FX.EFFECT_CAP 时先回收最老的短命特效。Boss 战、虫潮里特效再多，池子和场景里的物体数也不会越涨越多；
// 换关时每种只留 FX.POOL_KEEP 个
FX.POOL_CAP = 48;
FX.POOL_KEEP = 6;
FX.spawn = function (kind, color, opts) {
  var normal = opts.blend === 'normal';
  var key = kind + '|' + color + (normal ? 'n' : '');
  var list = FX.pool[key] || (FX.pool[key] = []);
  var e = null, playing = false;
  for (var i = 0; i < list.length; i++) if (list[i].free) { e = list[i]; break; }
  // 太多了：先回收最老的一个短命特效（预警圈这种停留很久的不动）
  if (FX.effects.length >= FX.EFFECT_CAP) {
    for (i = 0; i < FX.effects.length; i++) {
      var old = FX.effects[i];
      if (old.life < 0.6) { old.mesh.visible = false; old.free = true; FX.effects.splice(i, 1); break; }
    }
    if (!e && list.length) for (i = 0; i < list.length; i++) if (list[i].free) { e = list[i]; break; }
  }
  // 这一种已经有很多在播：重用播放得最久的那个（不再新建网格）
  if (!e && list.length >= FX.POOL_CAP) {
    e = list[0];
    for (i = 1; i < list.length; i++) if (list[i].t / list[i].life > e.t / e.life) e = list[i];
    playing = true;
  }
  if (!e) {
    var band = kind.indexOf('slash') === 0 || kind.indexOf('sweep') === 0;
    var add = !normal && (band || kind.indexOf('pring') === 0 || kind.indexOf('ball') === 0);
    var mat;
    if (kind === 'pringM' || kind === 'pringL') {
      mat = new THREE.ShaderMaterial({
        uniforms: { uCol: { value: new THREE.Color(color) }, uA: { value: 1 }, uH: { value: new Float32Array(24) }, uK: { value: 0 } },
        vertexShader: FX.RING_VS, fragmentShader: FX.RING_FS,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
      });
    } else {
      mat = new THREE.MeshBasicMaterial({
        color: color, transparent: true, depthWrite: false, side: kind.indexOf('ball') === 0 ? THREE.FrontSide : THREE.DoubleSide, vertexColors: band && !normal,
        blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, fog: !add
      });
    }
    e = { mesh: new THREE.Mesh(FX.getGeo(kind), mat), free: true, uni: mat.uniforms || null };
    e.mesh.frustumCulled = false;
    e.mesh.rotation.order = 'YXZ';
    e.mesh.renderOrder = add ? 4 : normal ? 3 : 0;
    FX.scene.add(e.mesh);
    list.push(e);
  }
  e.free = false;
  e.t = 0;
  e.life = opts.life || 0.3;
  e.s0 = opts.s0 != null ? opts.s0 : 0.2;
  e.s1 = opts.s1 != null ? opts.s1 : 1;
  e.a0 = opts.a0 != null ? opts.a0 : 0.8;
  e.follow = opts.follow || null;
  e.spin = opts.spin || 0;
  e.ry0 = opts.ry || 0;
  e.mesh.visible = true;
  e.mesh.position.set(opts.x, opts.y, opts.z);
  e.mesh.rotation.set(opts.rx || 0, opts.ry || 0, opts.rz || 0);
  e.sy = opts.sy || null;
  if (e.uni) { e.uni.uA.value = e.a0; e.uni.uK.value = 0; } else e.mesh.material.opacity = e.a0;
  e.mesh.scale.setScalar(e.s0);
  if (!playing) FX.effects.push(e);
  return e;
};

// 冲击环：像素锯齿的发光圆环；大圆环用细格子并贴着地面
FX.ring = function (x, y, z, r, color, life, a0) {
  var kind = r <= 3 ? 'pring' : r <= 7.5 ? 'pringM' : 'pringL';
  var e = FX.spawn(kind, color, { x: x, y: y + 0.15, z: z, s0: r * 0.3, s1: r, life: life || 0.35, a0: a0 != null ? a0 : 0.95 });
  if (e.uni) {
    // 采 12 个点，中间的取平均（地面高度很贵，同一帧可能有好几个大圆环）
    var H = e.uni.uH.value, i;
    for (i = 0; i < 24; i += 2) {
      var a = i / 24 * TAU;
      H[i] = clamp(W.groundAt(x + Math.cos(a) * r, z + Math.sin(a) * r, y + 3) - y, -3, 3);
    }
    for (i = 1; i < 24; i += 2) H[i] = (H[i - 1] + H[(i + 1) % 24]) * 0.5;
  }
  return e;
};

// 爆炸：一小团火光 + 白色星光 + 像素冲击环 + 碎块和往上飘的烟
// 同一帧第 3 个起、或者 0.15 秒内已经炸了 6 次：只留冲击环和碎块（一轮齐射不会把画面炸白）
// o（可选）：{ evo: 超武（深橙色核心、金环 + 白环、往上窜的火舌、地上的焦痕），ring: 冲击环颜色 }
FX.FIRE_PAL = [0xfff0a0, 0xff8a1a, 0xc8360a];
var _hsl = { h: 0, s: 0, l: 0 };
FX.boom = function (x, y, z, r, color, o) {
  if (!FX.tc) FX.tc = new THREE.Color();
  FX.boomN++;
  var bt = FX.boomT, recent = 0;
  for (var i = 0; i < 6; i++) if (FX.now - bt[i] < 0.15) recent++;
  bt[FX.boomI] = FX.now; FX.boomI = (FX.boomI + 1) % 6;
  var full = FX.boomN <= 2 && recent < 6, evo = !!(o && o.evo);
  // 火系颜色用固定的火焰三色，其他颜色（紫色魔弹、绿色毒爆）按自己的颜色配
  FX.tc.setHex(color).getHSL(_hsl);
  var fire = (_hsl.h < 0.14 || _hsl.h > 0.96) && _hsl.s > 0.5;
  var c0 = fire ? FX.FIRE_PAL[0] : FX.mixHex(color, 0xffffff, 0.55), c1 = fire ? FX.FIRE_PAL[1] : color, c2 = fire ? FX.FIRE_PAL[2] : FX.scaleHex(color, 0.6);
  if (full) {
    // 火光球只给火系爆炸（别的颜色的半透明多面球看起来像防护罩）
    // 大小有上限：大范围的爆炸（黄金火药）不会冒出一个罩住半个画面的半透明大球
    if (fire) FX.spawn('ball0', evo ? 0xff6a1a : FX.mixHex(color, 0xffffff, 0.2), { x: x, y: y, z: z, s0: Math.min(r * 0.2, 1), s1: Math.min(r * 0.6, 2.6), life: 0.2, a0: 0.32 });
    FX.flash(x, y, z, Math.min(r * 1.2, 4.5), evo ? 0xff6a1a : color, 0.2, 0);
    FX.flash(x, y, z, Math.min(r * 0.6, 2.2), 0xffffff, 0.1, 2);
  }
  var gy = W.groundAt(x, z, y + 0.5);
  if (y - gy < r + 1) {
    // 超出预算的爆炸：冲击环淡一些
    if (evo) {
      FX.ring(x, gy, z, r * 1.1, (o && o.ring) || 0xffc23a, 0.34, full ? 0.8 : 0.5);
      if (full) FX.ring(x, gy, z, r * 0.5, 0xffffff, 0.24);
      if (full) FX.scorch(x, gy + 0.1, z, Math.min(r * 0.6, 3.5), 0x2a0e06, 0.4, 1.2);
    } else FX.ring(x, gy, z, r * 1.15, (o && o.ring) || color, 0.32, full ? 0.95 : 0.6);
  }
  var n = full ? 10 : 6;
  for (i = 0; i < n; i++) {
    var a = Math.random() * TAU, s = rand(0.3, 1) * 8, k = Math.random();
    FX.part(x, y, z, Math.cos(a) * s, rand(2, 7), Math.sin(a) * s, k < 0.35 ? c0 : k < 0.75 ? c1 : c2, rand(0.35, 0.55), rand(0.35, 0.8));
  }
  FX.smoke(x, y, z, full ? 4 : 2, fire ? 0x3a2e2a : FX.scaleHex(color, 0.25));
  if (evo) for (i = 0; i < 6; i++) FX.part(x + rand(-r, r) * 0.35, y, z + rand(-r, r) * 0.35, rand(-1, 1), rand(5, 8), rand(-1, 1), i % 2 ? 0xffd23a : 0xff4a1a, 0.4, rand(0.4, 0.6), 6);
};

// 新月斩击：白色为主，带一点武器颜色；斜一点点（大刀光的两头不会一头插进地里、一头指着天）
// gold（超武）：主斩击偏金白，外面再套一道更大、停留更久的金色光弧（同一个倾角）
// look（可选）：{ white: 往白色靠的比例, under: 深色底（正常混合）, core: 白色细芯, thin: 细刀光, goldOuter: 外弧颜色, mainHex: 主斩击颜色 }
// FX.slashA：调用方临时设置的亮度倍数（往镜头这边砍的后半刀用 0.45：更淡、更小）
var _sc = null, _gc = null, _wc = null;
FX.slashA = 1;
FX.slash = function (x, y, z, r, ry, color, arc, gold, look) {
  if (!_sc) { _sc = new THREE.Color(); _gc = new THREE.Color(0xffb428); _wc = new THREE.Color(0xffffff); }
  arc = arc || 2.1;
  var kind = (look && look.thin ? 'slashT' : 'slash') + arc.toFixed(1), k = FX.slashA;
  var tilt = rand(0.1, 0.3) * (Math.random() < 0.5 ? -1 : 1) * Math.min(1, 3 / Math.max(1, r));
  var yy = y + 1.0;
  if (k < 1) r *= 0.85;
  // 颜色很艳的武器只往白色靠 30%，不然紫剑、红剑都会变成淡粉色
  var wl = look && look.white != null ? look.white : FX.satHex(color) > 0.55 ? 0.3 : 0.6;
  if (look && look.under) FX.spawn(kind, look.under, { x: x, y: yy - 0.02, z: z, s0: r * 0.84, s1: r * 1.07, life: 0.22, ry: ry, rz: tilt, a0: (look.underA || 0.45) * k, blend: 'normal' });
  if (gold) {
    var outer = look && look.goldOuter != null ? look.goldOuter : _sc.setHex(color).lerp(_gc, 0.8).getHex();
    FX.spawn(kind, outer, { x: x, y: yy, z: z, s0: r * 0.9, s1: r * 1.22, life: 0.3, ry: ry, rz: tilt, a0: k });
    if (look && look.mainHex != null) _sc.setHex(look.mainHex);
    else _sc.setHex(color).lerp(_gc, 0.5).lerp(_wc, 0.35);
  } else if (look && look.mainHex != null) _sc.setHex(look.mainHex);
  else _sc.setHex(color).lerp(_wc, wl);
  var e = FX.spawn(kind, _sc.getHex(), { x: x, y: yy, z: z, s0: r * 0.8, s1: r * 1.02, life: 0.2, ry: ry, rz: tilt, a0: k });
  if (look && look.core) FX.spawn('slashT' + arc.toFixed(1), 0xffffff, { x: x, y: yy + 0.01, z: z, s0: r * 0.78, s1: r * 0.99, life: 0.16, ry: ry, rz: tilt, a0: 0.75 * k });
  return e;
};

// 绕身横扫（镰刀）：刀头最亮的刀光转一整圈 + 深紫色的底 + 淡淡的淡紫色像素环
// gold（超武）：金边白刀光，金环在 Evo.slashCore 里画（0.6 倍半径，不会跑到镜头后面），这里不再画环
// ring：false 时不画环（同一把镰刀连砍几下只画一次）
FX.sweep = function (x, y, z, r, ang, color, gold, ring) {
  var life = 0.24, ry = ang - Math.PI, spin = TAU / life;
  FX.spawn('sweep6.0', gold ? 0x3a1a4a : 0x2a2040, { x: x, y: y + 0.85, z: z, s0: r * 0.88, s1: r * 1.04, life: life, ry: ry, spin: spin, a0: 0.4, blend: 'normal' });
  if (gold) FX.spawn('sweep6.0', 0xffc23a, { x: x, y: y + 0.88, z: z, s0: r * 0.93, s1: r * 1.1, life: life, ry: ry, spin: spin, a0: 1 });
  FX.spawn('sweep6.0', gold ? 0xfff6e0 : 0xdfe6ff, { x: x, y: y + 0.9, z: z, s0: r * 0.9, s1: r * 1.04, life: life, ry: ry, spin: spin, a0: 1 });
  if (!gold && ring !== false) FX.ring(x, y, z, r, 0xb8b0e8, 0.24, 0.42);
};

// color：可选，这一道闪电的颜色；不写就用 FX.boltColor（调用方可以临时设置，比如超武的金色闪电），再没有就是默认的淡蓝
// o（可选）：{ straight: 一条直线（弩箭的弹道），life, w: 粗细倍数, ca: 光晕盖住背景的程度, flash: false 不要命中闪光, fork: 分叉 }
// 竖直的长落雷自动分得更细、抖得更小，半腰分出一个小叉；FX.boltFork 为真时（超武雷杖）连锁闪电也分叉
FX.BOLT_C = 0x8fd0ff;
FX.boltColor = null;
FX.boltFork = false;
var _btc = null;
FX.bolt = function (x0, y0, z0, x1, y1, z1, color, o) {
  var c = color != null ? color : FX.boltColor != null ? FX.boltColor : FX.BOLT_C;
  if (!_btc) _btc = new THREE.Color();
  _btc.setHex(c);
  var b = { pts: [x0, y0, z0, x1, y1, z1], t: 0, life: (o && o.life) || 0.18, cr: _btc.r, cg: _btc.g, cb: _btc.b, ca: o && o.ca != null ? o.ca : c === FX.BOLT_C ? 0 : 0.5,
    segs: 6, jit: 1, wm: (o && o.w) || 1, fk: -1, straight: false };
  var dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, hl = Math.sqrt(dx * dx + dz * dz);
  if (o && o.straight) { b.segs = 1; b.jit = 0; b.straight = true; }
  else if (Math.abs(dy) > 8 && hl < 2) {
    b.segs = 11; b.jit = 0.6; b.fk = randi(4, 6);
    var fa = Math.random() * TAU, fl = rand(2.2, 3.6);
    b.fx = Math.cos(fa) * fl; b.fy = -fl * 0.9; b.fz = Math.sin(fa) * fl;
  } else if ((o && o.fork) || FX.boltFork) {
    b.fk = randi(2, 4);
    var len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1, fl2 = Math.min(3, len * 0.35), side = Math.random() < 0.5 ? -1 : 1;
    b.fx = (dx / len * 0.6 - dz / len * side * 0.8) * fl2; b.fy = rand(-0.4, 0.4) * fl2; b.fz = (dz / len * 0.6 + dx / len * side * 0.8) * fl2;
  }
  FX.bolts.push(b);
  if (!(o && o.flash === false)) {
    FX.flash(x1, y1, z1, 2.4, c === FX.BOLT_C ? 0x9fd8ff : c, 0.2, 0);
    FX.flash(x1, y1 + 0.2, z1, 1.4, 0xffffff, 0.14, 2);
  }
  return b;
};

// 写入一段发光带：A→B 两端各自的半宽 hwA/hwB、亮度 fA/fB；core 1 = 白色细芯；颜色 r g b，ca 覆盖度
// 顶点：A+ A- B+ / B+ A- B-（B 端的偏移方向要取反，因为它的“另一端”是 A）；展开写，这里每帧调用很多次
FX.boltVert = function (j, atB, side, ax, ay, az, bx, by, bz, hw, core, r, g, b, ca, f) {
  var P = FX.boltPos, O = FX.boltOther, I = FX.boltInfo, C = FX.boltCol, k = j * 3, m = j * 4;
  if (atB) { P[k] = bx; P[k + 1] = by; P[k + 2] = bz; O[k] = ax; O[k + 1] = ay; O[k + 2] = az; I[m] = -side; }
  else { P[k] = ax; P[k + 1] = ay; P[k + 2] = az; O[k] = bx; O[k + 1] = by; O[k + 2] = bz; I[m] = side; }
  I[m + 1] = side; I[m + 2] = hw; I[m + 3] = core;
  C[m] = r; C[m + 1] = g; C[m + 2] = b; C[m + 3] = ca;
  FX.boltFade[j] = f;
};
FX.boltQuad = function (n, ax, ay, az, bx, by, bz, hwA, hwB, core, r, g, b, ca, fA, fB) {
  var o = n * 6, V = FX.boltVert;
  V(o, false, 1, ax, ay, az, bx, by, bz, hwA, core, r, g, b, ca, fA);
  V(o + 1, false, -1, ax, ay, az, bx, by, bz, hwA, core, r, g, b, ca, fA);
  V(o + 2, true, 1, ax, ay, az, bx, by, bz, hwB, core, r, g, b, ca, fB);
  V(o + 3, true, 1, ax, ay, az, bx, by, bz, hwB, core, r, g, b, ca, fB);
  V(o + 4, false, -1, ax, ay, az, bx, by, bz, hwA, core, r, g, b, ca, fA);
  V(o + 5, true, -1, ax, ay, az, bx, by, bz, hwB, core, r, g, b, ca, fB);
};

// 弹丸拖尾 / 直线光带（每帧调用）：A 端是头（亮、宽），B 端是尾；c 是 THREE.Color
// 在 FX.updateEffects 之前写进发光带的前面一段，闪电接在后面
FX.trailSeg = function (ax, ay, az, bx, by, bz, wa, wb, fa, fb, c, ca) {
  var n = FX.trailN;
  if (n + 2 > FX.TRAIL_CAP || !FX.boltPos) return false;
  FX.boltQuad(n, ax, ay, az, bx, by, bz, wa, wb, 0, c.r, c.g, c.b, ca, fa, fb);
  FX.boltQuad(n + 1, ax, ay, az, bx, by, bz, wa * 0.3, wb * 0.25, 1, c.r, c.g, c.b, ca, fa, fb);
  FX.trailN = n + 2;
  return true;
};

FX.updateEffects = function (dt) {
  FX.now += dt;
  for (var i = FX.effects.length - 1; i >= 0; i--) {
    var e = FX.effects[i];
    e.t += dt;
    var k = e.t / e.life;
    if (k >= 1) { e.mesh.visible = false; e.free = true; FX.effects.splice(i, 1); continue; }
    var s = lerp(e.s0, e.s1, 1 - Math.pow(1 - Math.min(1, k * 1.6), 2));
    e.mesh.scale.set(s, e.sy || s, s);
    if (e.spin) e.mesh.rotation.y = e.ry0 + e.spin * e.t;
    var op = e.a0 * (1 - k * k);
    if (e.uni) { e.uni.uA.value = op; e.uni.uK.value = clamp((s / (e.s1 || 1) - 0.3) / 0.7, 0, 1); } else e.mesh.material.opacity = op;
  }
  // 闪电折线（每帧重新抖动，看起来在闪）；接在本帧的弹丸拖尾后面
  var n = FX.trailN, max = FX.BOLT_SEGS * 2;
  for (i = FX.bolts.length - 1; i >= 0; i--) {
    var b = FX.bolts[i];
    b.t += dt;
    if (b.t > b.life) { FX.bolts.splice(i, 1); continue; }
    var p = b.pts, segs = b.segs;
    var len = Math.sqrt((p[3] - p[0]) * (p[3] - p[0]) + (p[4] - p[1]) * (p[4] - p[1]) + (p[5] - p[2]) * (p[5] - p[2]));
    var jit = Math.min(1.3, 0.1 + len * 0.07) * b.jit, fade = 1 - b.t / b.life;
    var hw = (0.34 * fade + 0.1) * b.wm, cw = (0.055 + 0.03 * fade) * b.wm, lf = b.straight ? fade : 1;
    var px = p[0], py = p[1], pz = p[2], fkx = 0, fky = 0, fkz = 0;
    for (var sgi = 1; sgi <= segs && n < max - 1; sgi++) {
      var t = sgi / segs, j = sgi === segs ? 0 : jit;
      var qx = lerp(p[0], p[3], t) + rand(-j, j), qy = lerp(p[1], p[4], t) + rand(-j, j) * 0.5, qz = lerp(p[2], p[5], t) + rand(-j, j);
      FX.boltQuad(n++, px, py, pz, qx, qy, qz, hw, hw, 0, b.cr, b.cg, b.cb, b.ca, lf, lf);
      FX.boltQuad(n++, px, py, pz, qx, qy, qz, cw, cw, 1, b.cr, b.cg, b.cb, b.ca, lf, lf);
      if (sgi === b.fk) { fkx = qx; fky = qy; fkz = qz; }
      px = qx; py = qy; pz = qz;
    }
    // 分叉：从主干上的一个折点斜着劈出去两三段，细一点
    if (b.fk > 0) {
      var fs = 3, fj = 0.25;
      px = fkx; py = fky; pz = fkz;
      for (var f = 1; f <= fs && n < max - 1; f++) {
        var ft = f / fs;
        qx = fkx + b.fx * ft + rand(-fj, fj); qy = fky + b.fy * ft + rand(-fj, fj) * 0.5; qz = fkz + b.fz * ft + rand(-fj, fj);
        FX.boltQuad(n++, px, py, pz, qx, qy, qz, hw * 0.55 * (1.2 - ft * 0.5), hw * 0.55 * (1.2 - ft * 0.7), 0, b.cr, b.cg, b.cb, b.ca, 1, 0.6);
        FX.boltQuad(n++, px, py, pz, qx, qy, qz, cw * 0.7, cw * 0.5, 1, b.cr, b.cg, b.cb, b.ca, 1, 0.6);
        px = qx; py = qy; pz = qz;
      }
    }
  }
  FX.boltGeo.setDrawRange(0, n * 6);
  if (n > 0) {
    var at = FX.boltGeo.attributes;
    at.position.updateRange.count = n * 18; at.position.needsUpdate = true;
    at.aOther.updateRange.count = n * 18; at.aOther.needsUpdate = true;
    at.aInfo.updateRange.count = n * 24; at.aInfo.needsUpdate = true;
    at.aCol.updateRange.count = n * 24; at.aCol.needsUpdate = true;
    at.aFade.updateRange.count = n * 6; at.aFade.needsUpdate = true;
  }
  FX.trailN = 0;
  // 发光精灵和贴地圆盘：拾取物、弹丸、场地在各自的更新里写入，这里补上闪光和焦痕，然后统一提交
  if (Game.state === 'play') {
    for (i = FX.flashes.length - 1; i >= 0; i--) {
      var fl = FX.flashes[i];
      fl.t += dt;
      if (fl.t >= fl.life) { FX.flashes.splice(i, 1); continue; }
      var fk = fl.t / fl.life, fsz = fl.s * (0.7 + 0.3 * fk);
      FX.glow(fl.x, fl.y, fl.z, fsz, fsz, FX.tc.setHex(fl.c), 1 - fk * fk, fl.shape);
    }
    FX.commit(FX.glowMesh, FX.glowN);
    for (i = FX.scorches.length - 1; i >= 0; i--) {
      var sc = FX.scorches[i];
      sc.t += dt;
      if (sc.t >= sc.life) { FX.scorches.splice(i, 1); continue; }
      var sk = 1 - sc.t / sc.life;
      FX.decal(sc.x, sc.y, sc.z, sc.r, sc.sx, sc.sz, sc.c, sc.a * sk, 0.45 * sk * sk, 2);
    }
    FX.decalMat.uniforms.uTime.value = FX.now;
    FX.commit(FX.decalMesh, FX.decalN);
  } else if (Game.state === 'end') FX.dropStars();   // 通关、阵亡的镜头里没有定格的白星
  FX.glowN = 0;
  FX.decalN = 0;
  FX.boomN = 0;
  FX.sparkN = 0;
};

// ============================================================
//  圆形阴影：让人看得清跳了多高
// ============================================================
var Shadows = {};
Shadows.init = function (scene) {
  var g = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
  Shadows.mesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), 520);
  Shadows.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Shadows.mesh.frustumCulled = false;
  Shadows.mesh.count = 0;
  Shadows.mesh.renderOrder = 1;
  scene.add(Shadows.mesh);
  Shadows.m = new THREE.Matrix4();
  Shadows.q = new THREE.Quaternion();
  Shadows.p = new THREE.Vector3();
  Shadows.s = new THREE.Vector3();
};
Shadows.put = function (n, x, z, y, r) {
  var gy = W.groundAt(x, z, y + 0.2);
  var h = Math.max(0, y - gy);
  var k = r * clamp(1 - h * 0.06, 0.4, 1);
  Shadows.p.set(x, gy + 0.06, z);
  Shadows.s.set(k, 1, k);
  Shadows.m.compose(Shadows.p, Shadows.q, Shadows.s);
  Shadows.mesh.setMatrixAt(n, Shadows.m);
};
Shadows.update = function () {
  var n = 0;
  Shadows.put(n++, P.pos.x, P.pos.z, P.pos.y, 0.7);
  var list = Enemies.list;
  for (var i = 0; i < list.length && n < 520; i++) {
    var e = list[i];
    if (!e.alive) continue;
    if (Math.abs(e.x - P.pos.x) > 45 || Math.abs(e.z - P.pos.z) > 45) continue;
    Shadows.put(n++, e.x, e.z, e.y, e.r * 1.1);
  }
  Shadows.mesh.count = n;
  Shadows.mesh.instanceMatrix.needsUpdate = true;
};
// 换关、回主菜单：上一局的影子全部拿掉（Shadows.update 只在游戏进行时和 Boss 出场时跑，主菜单里不会自己清）
Shadows.clear = function () {
  if (Shadows.mesh) Shadows.mesh.count = 0;
};
