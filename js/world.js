'use strict';
// ============================================================
//  世界：地形高度场、塔楼与坡道、树木岩石、碰撞查询
//  静态物体按材质合并成少数几个网格（iPad 上少画几次）
// ============================================================
var W = {
  S: 130,          // 地图半边长
  STEP: 0.7,       // 可直接走上去的台阶高度
  boxes: [],       // 方块建筑 {x0,x1,z0,z1,top}
  ramps: [],       // 坡道 {x0,x1,z0,z1,axis,dir,h0,h1,base}
  circles: [],     // 圆形障碍 {x,z,r,top}
  grid: null,
  noise: null,
  group: null,
  palette: null,
  mats: null
};

W.terrainH = function (x, z) {
  var n = W.noise;
  var h = n.fbm(x * 0.011, z * 0.011, 4) * 13 + n.noise(x * 0.06, z * 0.06) * 1.2;
  // 出生点附近压平（半径 8 内完全平坦，菜单镜头也站在这里）
  var d = Math.sqrt(x * x + z * z);
  if (d < 22) { var t = clamp((d - 8) / 14, 0, 1); h *= t * t * (3 - 2 * t); }
  // 地图边缘升起成山脊；玩家走不到的外圈只再缓缓抬高一点，免得挡住远山和天空
  var e = Math.max(Math.abs(x), Math.abs(z)) - (W.S - 16);
  if (e > 0) {
    var e1 = Math.min(e, 12);
    h += e1 * e1 * 0.1;
    if (e > 12) h += Math.min(e - 12, 8) * 0.75;
  }
  return h;
};

// ---------------- 碰撞网格 ----------------
W.gridCell = 16;
W.gridKey = function (cx, cz) { return (cx + 64) * 128 + (cz + 64); };
W.addCollider = function (obj, x0, x1, z0, z1) {
  var c = W.gridCell;
  for (var cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++) {
    for (var cz = Math.floor(z0 / c); cz <= Math.floor(z1 / c); cz++) {
      var k = W.gridKey(cx, cz);
      var b = W.grid.get(k);
      if (!b) { b = []; W.grid.set(k, b); }
      b.push(obj);
    }
  }
};
W.nearby = function (x, z) {
  return W.grid.get(W.gridKey(Math.floor(x / W.gridCell), Math.floor(z / W.gridCell))) || W.EMPTY;
};
W.EMPTY = [];

W.rampHeight = function (r, x, z) {
  var t = r.axis === 'x' ? (x - r.x0) / (r.x1 - r.x0) : (z - r.z0) / (r.z1 - r.z0);
  if (r.dir < 0) t = 1 - t;
  return lerp(r.h0, r.h1, clamp(t, 0, 1));
};

// 在 (x,z) 处、脚底高度 feetY 时能站上去的最高表面
W.groundAt = function (x, z, feetY) {
  var h = W.terrainH(x, z);
  var lim = feetY + W.STEP;
  var list = W.nearby(x, z);
  for (var i = 0; i < list.length; i++) {
    var o = list[i], top;
    if (o.kind === 'circle') {
      if (dist2(x, z, o.x, o.z) > o.r * o.r) continue;
      top = o.top;
    } else {
      if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
      top = o.kind === 'ramp' ? W.rampHeight(o, x, z) : o.top;
    }
    if (top <= lim && top > h) h = top;
  }
  return h;
};

// 把半径为 r 的圆从高于脚底的障碍物里推出去；返回是否发生了碰撞
W.pushOut = function (p, r, feetY) {
  var hit = false;
  var lim = feetY + W.STEP;
  var list = W.nearby(p.x, p.z);
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o.kind === 'circle') {
      if (o.top <= lim) continue;
      var dx = p.x - o.x, dz = p.z - o.z, rr = o.r + r;
      var d2 = dx * dx + dz * dz;
      if (d2 < rr * rr) {
        var d = Math.sqrt(d2) || 0.001;
        p.x = o.x + dx / d * rr;
        p.z = o.z + dz / d * rr;
        hit = true;
      }
      continue;
    }
    if (p.x < o.x0 - r || p.x > o.x1 + r || p.z < o.z0 - r || p.z > o.z1 + r) continue;
    if (o.floating && o.bottom > feetY + 1.7) continue;   // 可以从漂浮平台下面走过
    var top = o.kind === 'ramp' ? W.rampHeight(o, clamp(p.x, o.x0, o.x1), clamp(p.z, o.z0, o.z1)) : o.top;
    if (top <= lim) continue;
    // 坡道只挡侧面和高的一端，低的一端可以走上去
    var pl = p.x - (o.x0 - r), pr = (o.x1 + r) - p.x, pd = p.z - (o.z0 - r), pu = (o.z1 + r) - p.z;
    var m = Math.min(pl, pr, pd, pu);
    if (m === pl) p.x = o.x0 - r;
    else if (m === pr) p.x = o.x1 + r;
    else if (m === pd) p.z = o.z0 - r;
    else p.z = o.z1 + r;
    hit = true;
  }
  var lim2 = W.S - 4;
  if (p.x < -lim2) p.x = -lim2; if (p.x > lim2) p.x = lim2;
  if (p.z < -lim2) p.z = -lim2; if (p.z > lim2) p.z = lim2;
  return hit;
};

// 头顶是否被挡（跳起撞到平台底部）
W.ceilingAt = function (x, z, headY) {
  var list = W.nearby(x, z);
  for (var i = 0; i < list.length; i++) {
    var o = list[i];
    if (o.kind !== 'box' || !o.floating) continue;
    if (x < o.x0 || x > o.x1 || z < o.z0 || z > o.z1) continue;
    if (headY > o.bottom && headY < o.top) return o.bottom;
  }
  return Infinity;
};

// ---------------- 材质 ----------------
W.initMats = function () {
  if (W.mats) return W.mats;
  // 地面：贴图三个通道是 草 / 岩石 / 泥土 的图案，按顶点上的 mixw 权重混合；颜色来自顶点色
  // 平地按 xz 贴图，陡坡改用竖直方向的投影，免得图案被拉成长条
  var ground = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.ground });
  ground.onBeforeCompile = function (sh) {
    sh.vertexShader = 'attribute vec3 mixw;\nvarying vec3 vMix;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\n\tvMix = mixw;\n\tvWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;\n\tvWNorm = normalize( mat3( modelMatrix ) * objectNormal );');
    sh.fragmentShader = 'varying vec3 vMix;\nvarying vec3 vWPos;\nvarying vec3 vWNorm;\n' + sh.fragmentShader.replace('#include <map_fragment>', [
      'vec3 an = abs( normalize( vWNorm ) );',
      'vec3 tTop = texture2D( map, vWPos.xz * 0.125 ).rgb;',
      'vec3 tSide = texture2D( map, ( an.x > an.z ? vWPos.zy : vWPos.xy ) * 0.125 ).rgb;',
      'vec3 texelMix = mix( tSide, tTop, smoothstep( 0.55, 0.8, an.y ) );',
      'diffuseColor.rgb *= dot( texelMix, vMix );'
    ].join('\n\t'));
  };
  W.mats = {
    ground: ground,
    brick: new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.brick }),
    wood: new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.planks }),
    ivy: new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.ivy, alphaTest: 0.5, side: THREE.DoubleSide }),
    tuft: new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.tuft, alphaTest: 0.5 })
  };
  return W.mats;
};

// ---------------- 生成 ----------------
W.generate = function (scene, seed, pal) {
  var rng = mulberry32(seed);
  W.rng = rng;
  W.noise = makeNoise(rng);
  W.vrng = mulberry32((seed ^ 0x5bd1e995) >>> 0);   // 只影响外观的随机数，不改变布局和碰撞
  W.palette = pal;
  W.boxes = []; W.ramps = []; W.circles = [];
  W.grid = new Map();
  W.spots = [];
  W.initMats();
  if (W.group) {
    scene.remove(W.group);
    W.group.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.isInstancedMesh) o.dispose(); });
  }
  W.group = new THREE.Group();
  scene.add(W.group);
  W.batch = { brick: [], cap: [], wood: [], ivy: [] };

  W.buildTerrain(pal);
  W.buildTowers(rng, pal);
  W.buildRuins(rng, pal);
  W.buildProps(rng, pal);
  W.flushBatches();
  W.buildTufts(pal);
};

// 地形：平滑着色（索引几何体共享法线），颜色按坡度和噪声斑块混合
W.TSEG = 120;
W.buildTerrain = function (pal) {
  var S = W.S, seg = W.TSEG, size = S * 2 + 40;
  var g = new THREE.PlaneGeometry(size, size, seg, seg);
  g.rotateX(-Math.PI / 2);
  var pa = g.attributes.position.array, n = g.attributes.position.count;
  for (var i = 0; i < n; i++) pa[i * 3 + 1] = W.terrainH(pa[i * 3], pa[i * 3 + 2]);
  g.computeVertexNormals();
  var na = g.attributes.normal.array;
  var cols = new Float32Array(n * 3), mix = new Float32Array(n * 3);
  var grass = new THREE.Color(pal.grass), grass2 = new THREE.Color(pal.grass2), dirt = new THREE.Color(pal.dirt), rock = new THREE.Color(pal.cliff);
  var c = new THREE.Color(), tmp = new THREE.Color(), N = W.noise;
  var ss = function (a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  for (i = 0; i < n; i++) {
    var x = pa[i * 3], y = pa[i * 3 + 1], z = pa[i * 3 + 2];
    var slope = 1 - na[i * 3 + 1];
    var edge = Math.max(Math.abs(x), Math.abs(z)) - (S - 10);
    // 岩石：陡坡和地图边缘的山脊
    var wr = Math.max(ss(0.2, 0.36, slope), ss(0, 14, edge) * 0.85);
    // 泥土：噪声斑块 + 缓坡
    var patch = N.noise(x * 0.045 + 100, z * 0.045) + N.noise(x * 0.13 - 40, z * 0.13 + 7) * 0.35;
    var wd = Math.max(ss(0.32, 0.62, patch), ss(0.1, 0.2, slope) * 0.6) * (1 - wr);
    var wg = Math.max(0, 1 - wr - wd);
    // 草地本身也有深浅两种绿的大斑块
    var gt = clamp(N.noise(x * 0.028, z * 0.028 + 50) * 0.75 + N.noise(x * 0.09 + 20, z * 0.09) * 0.35 + 0.5, 0, 1);
    tmp.copy(grass).lerp(grass2, gt);
    c.r = tmp.r * wg + dirt.r * wd + rock.r * wr;
    c.g = tmp.g * wg + dirt.g * wd + rock.g * wr;
    c.b = tmp.b * wg + dirt.b * wd + rock.b * wr;
    var j = 1 + (N.noise(x * 0.35, z * 0.35) * 0.06);
    cols[i * 3] = c.r * j; cols[i * 3 + 1] = c.g * j; cols[i * 3 + 2] = c.b * j;
    // 沙地没有草叶：底色用泥土（沙粒）图案
    if (pal.sandy) { mix[i * 3] = 0; mix[i * 3 + 1] = wr + wd * 0.35; mix[i * 3 + 2] = wg + wd * 0.65; }
    else { mix[i * 3] = wg; mix[i * 3 + 1] = wr; mix[i * 3 + 2] = wd; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  g.setAttribute('mixw', new THREE.BufferAttribute(mix, 3));
  // 贴图坐标在着色器里按世界坐标算：每 8 米重复一次（每个像素约 12 厘米）
  var mesh = new THREE.Mesh(g, W.mats.ground);
  W.group.add(mesh);
  W.terrainMesh = mesh;
};

// 把地面某处压暗（烘焙在顶点色里）：树荫、石头和墙脚的接触阴影，运行时不花任何开销
W.darkenGround = function (x, z, r, k) {
  var g = W.terrainMesh.geometry, pa = g.attributes.position.array, ca = g.attributes.color.array;
  var seg = W.TSEG, size = W.S * 2 + 40, step = size / seg;
  var i0 = Math.max(0, Math.floor((x - r + size / 2) / step)), i1 = Math.min(seg, Math.ceil((x + r + size / 2) / step));
  var j0 = Math.max(0, Math.floor((z - r + size / 2) / step)), j1 = Math.min(seg, Math.ceil((z + r + size / 2) / step));
  for (var j = j0; j <= j1; j++) for (var i = i0; i <= i1; i++) {
    var v = j * (seg + 1) + i, dx = pa[v * 3] - x, dz = pa[v * 3 + 2] - z, d = Math.sqrt(dx * dx + dz * dz);
    if (d >= r) continue;
    var t = 1 - d / r, f = 1 - k * t * t * (3 - 2 * t);
    ca[v * 3] *= f; ca[v * 3 + 1] *= f; ca[v * 3 + 2] *= f;
  }
  g.attributes.color.needsUpdate = true;
};

W.freeSpot = function (x, z, r) {
  if (Math.abs(x) > W.S - 20 || Math.abs(z) > W.S - 20) return false;
  if (x * x + z * z < 20 * 20) return false;
  for (var i = 0; i < W.boxes.length; i++) {
    var o = W.boxes[i];
    if (x > o.x0 - r && x < o.x1 + r && z > o.z0 - r && z < o.z1 + r) return false;
  }
  for (i = 0; i < W.ramps.length; i++) {
    var q = W.ramps[i];
    if (x > q.x0 - r && x < q.x1 + r && z > q.z0 - r && z < q.z1 + r) return false;
  }
  return true;
};

// ---------------- 合并用的小工具 ----------------
// 按每个面的实际尺寸设置贴图坐标，让砖块/木板大小一致
W.boxUV = function (w, h, d, scale) {
  var g = new THREE.BoxGeometry(w, h, d);
  var uv = g.attributes.uv;
  var dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];   // +x -x +y -y +z -z
  for (var f = 0; f < 6; f++) {
    for (var k = 0; k < 4; k++) {
      var i = f * 4 + k;
      uv.setXY(i, uv.getX(i) * dims[f][0] * scale, uv.getY(i) * dims[f][1] * scale);
    }
  }
  return g;
};

// 把一个几何体放进某个合并批次：变换、转非索引、加顶点色（可以从下到上由暗变亮）
W.pushGeo = function (list, g, matrix, color, dark) {
  if (matrix) g.applyMatrix4(matrix);
  if (g.index) { var gi = g.toNonIndexed(); g.dispose(); g = gi; }
  var p = g.attributes.position.array, cnt = g.attributes.position.count;
  var cols = new Float32Array(cnt * 3), c = new THREE.Color(color), y0 = Infinity, y1 = -Infinity, i;
  for (i = 0; i < cnt; i++) { y0 = Math.min(y0, p[i * 3 + 1]); y1 = Math.max(y1, p[i * 3 + 1]); }
  for (i = 0; i < cnt; i++) {
    var k = dark ? lerp(dark, 1, clamp((p[i * 3 + 1] - y0) / Math.max(1, y1 - y0), 0, 1)) : 1;
    cols[i * 3] = c.r * k; cols[i * 3 + 1] = c.g * k; cols[i * 3 + 2] = c.b * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  list.push(g);
  return g;
};

W.mat4 = function (x, y, z, rx, ry, rz, order) {
  var o = W._o || (W._o = new THREE.Object3D());
  o.position.set(x, y, z);
  o.rotation.set(rx || 0, ry || 0, rz || 0, order || 'XYZ');
  o.scale.set(1, 1, 1);
  o.updateMatrix();
  return o.matrix;
};

// 草皮顶盖：用地面材质（世界坐标贴图），顶面是草、侧面是泥土
W.pushCap = function (cx, cy, cz, w, h, d, color) {
  var g = W.pushGeo(W.batch.cap, new THREE.BoxGeometry(w, h, d), W.mat4(cx, cy, cz), color);
  var nr = g.attributes.normal.array, cnt = g.attributes.position.count;
  var mix = new Float32Array(cnt * 3);
  for (var i = 0; i < cnt; i++) {
    if (Math.abs(nr[i * 3 + 1]) > 0.5) mix[i * 3] = 1;
    else { mix[i * 3] = 0.3; mix[i * 3 + 2] = 0.7; }
  }
  g.setAttribute('mixw', new THREE.BufferAttribute(mix, 3));
};

// 常春藤：贴在墙面外一点点的竖条，从 (x,yTop,z) 垂下 len 米；nx,nz 是墙面朝向
W.pushIvy = function (x, yTop, z, nx, nz, width, len) {
  var pal = W.palette;
  if (!pal.ivy) return;
  var tx = -nz, tz = nx, off = 0.05, hw = width / 2, yb = yTop - len;
  var px = x + nx * off, pz = z + nz * off;
  var pos = [
    px - tx * hw, yb, pz - tz * hw, px + tx * hw, yb, pz + tz * hw, px + tx * hw, yTop, pz + tz * hw,
    px - tx * hw, yb, pz - tz * hw, px + tx * hw, yTop, pz + tz * hw, px - tx * hw, yTop, pz - tz * hw
  ];
  var u0 = W.vrng() * 4, u1 = u0 + width / 2;
  var uvs = [u0, 0, u1, 0, u1, 1, u0, 0, u1, 1, u0, 1];
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz, nx, 0, nz], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  var c = new THREE.Color(pal.ivy).multiplyScalar(0.85 + W.vrng() * 0.3);
  W.pushGeo(W.batch.ivy, g, null, c);
};

// 在一个方块的四面随机挂常春藤
W.ivyOnBox = function (x0, x1, z0, z1, top, bottom, n, maxLen) {
  var vr = W.vrng;
  for (var i = 0; i < n; i++) {
    var side = Math.floor(vr() * 4), w = 1.6 + vr() * 2.2, len = Math.min(top - bottom, maxLen * (0.35 + vr() * 0.65));
    var t = vr();
    if (side === 0) W.pushIvy(x1, top, lerp(z0 + w / 2, z1 - w / 2, t), 1, 0, w, len);
    else if (side === 1) W.pushIvy(x0, top, lerp(z0 + w / 2, z1 - w / 2, t), -1, 0, w, len);
    else if (side === 2) W.pushIvy(lerp(x0 + w / 2, x1 - w / 2, t), top, z1, 0, 1, w, len);
    else W.pushIvy(lerp(x0 + w / 2, x1 - w / 2, t), top, z0, 0, -1, w, len);
  }
};

W.flushBatches = function () {
  var b = W.batch, m = W.mats;
  if (b.brick.length) W.group.add(new THREE.Mesh(MODEL.merge(b.brick), m.brick));
  if (b.cap.length) W.group.add(new THREE.Mesh(MODEL.merge(b.cap), m.ground));
  if (b.wood.length) W.group.add(new THREE.Mesh(MODEL.merge(b.wood), m.wood));
  if (b.ivy.length) W.group.add(new THREE.Mesh(MODEL.merge(b.ivy), m.ivy));
  [b.brick, b.cap, b.wood, b.ivy].forEach(function (l) { l.forEach(function (g) { g.dispose(); }); });
  W.batch = null;
};

// ---------------- 建筑 ----------------
W.addBox = function (x0, x1, z0, z1, top, color, opts) {
  var base = Math.min(W.terrainH(x0, z0), W.terrainH(x1, z0), W.terrainH(x0, z1), W.terrainH(x1, z1), W.terrainH((x0 + x1) / 2, (z0 + z1) / 2)) - 1;
  var o = { kind: 'box', x0: x0, x1: x1, z0: z0, z1: z1, top: top, bottom: opts && opts.floating ? top - 1.2 : base, floating: !!(opts && opts.floating) };
  W.boxes.push(o);
  W.addCollider(o, x0, x1, z0, z1);
  var h = o.top - o.bottom, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  var vr = W.vrng, tint = new THREE.Color(color).multiplyScalar(0.92 + vr() * 0.14);
  // 石砖墙身：底部偏暗
  W.pushGeo(W.batch.brick, W.boxUV(x1 - x0, h, z1 - z0, 0.42), W.mat4(cx, o.bottom + h / 2, cz), tint, o.floating ? 0.8 : 0.62);
  if (opts && opts.cap) {
    // 漂浮平台：顶上一层草皮，下面挂着藤，地上一块影子
    W.pushCap(cx, o.top - 0.2, cz, x1 - x0 + 0.3, 0.4, z1 - z0 + 0.3, opts.cap);
    W.ivyOnBox(x0 - 0.15, x1 + 0.15, z0 - 0.15, z1 + 0.15, o.top - 0.3, o.top - 4, 3 + Math.floor(vr() * 3), 2.6);
    W.darkenGround(cx, cz, Math.max(x1 - x0, z1 - z0) * 0.75, 0.4);
  } else {
    // 墙脚一圈接触阴影
    var per = 2 * ((x1 - x0) + (z1 - z0)), steps = Math.max(4, Math.round(per / 2.5));
    for (var s = 0; s < steps; s++) {
      var t = s / steps * per, px, pz;
      if (t < x1 - x0) { px = x0 + t; pz = z0; }
      else if ((t -= x1 - x0) < z1 - z0) { px = x1; pz = z0 + t; }
      else if ((t -= z1 - z0) < x1 - x0) { px = x1 - t; pz = z1; }
      else { t -= x1 - x0; px = x0; pz = z1 - t; }
      W.darkenGround(px, pz, 2.4, 0.2);
    }
    // 顶上一圈略宽的压顶石
    W.pushGeo(W.batch.brick, W.boxUV(x1 - x0 + 0.3, 0.4, z1 - z0 + 0.3, 0.42), W.mat4(cx, o.top - 0.2, cz), opts && opts.trim || color);
  }
  return o;
};

// 坡道：从 (sx,sz) 沿 axis 方向 dir 延伸 len，宽 w，从地面升到 h1
W.addRamp = function (sx, sz, axis, dir, len, w, h1, color) {
  var h0 = W.terrainH(sx, sz) - 0.3;
  var r = { kind: 'ramp', axis: axis, dir: dir, h0: h0, h1: h1 };
  if (axis === 'x') {
    r.x0 = dir > 0 ? sx : sx - len; r.x1 = dir > 0 ? sx + len : sx;
    r.z0 = sz - w / 2; r.z1 = sz + w / 2;
  } else {
    r.z0 = dir > 0 ? sz : sz - len; r.z1 = dir > 0 ? sz + len : sz;
    r.x0 = sx - w / 2; r.x1 = sx + w / 2;
  }
  W.ramps.push(r);
  W.addCollider(r, r.x0, r.x1, r.z0, r.z1);
  // 外观：一块倾斜的木板 + 下方支撑
  var rise = h1 - h0, run = len;
  var slopeLen = Math.sqrt(rise * rise + run * run);
  var ang = Math.atan2(rise, run);
  var px = (r.x0 + r.x1) / 2, py = (h0 + h1) / 2 - 0.2, pz = (r.z0 + r.z1) / 2;
  var m = axis === 'x' ? W.mat4(px, py, pz, dir > 0 ? -ang : ang, Math.PI / 2, 0, 'YXZ') : W.mat4(px, py, pz, dir > 0 ? -ang : ang, 0, 0);
  W.pushGeo(W.batch.wood, W.boxUV(w, 0.5, slopeLen, 0.5), m, color);
  var supports = Math.floor(len / 4);
  for (var i = 1; i <= supports; i++) {
    var t = i / (supports + 1);
    var qx = axis === 'x' ? sx + dir * len * t : sx, qz = axis === 'z' ? sz + dir * len * t : sz;
    var top = lerp(h0, h1, t), bot = W.terrainH(qx, qz) - 0.5;
    if (top - bot < 0.8) continue;
    W.pushGeo(W.batch.wood, W.boxUV(0.5, top - bot, 0.5, 0.5), W.mat4(qx, (top + bot) / 2 - 0.3, qz), new THREE.Color(W.palette.wood).multiplyScalar(0.8), 0.7);
  }
  return r;
};

W.buildTowers = function (rng, pal) {
  var count = 14, tries = 0;
  while (W.boxes.length < count && tries++ < 400) {
    var x = (rng() * 2 - 1) * (W.S - 35), z = (rng() * 2 - 1) * (W.S - 35);
    var w = 7 + rng() * 7, d = 7 + rng() * 7;
    if (!W.freeSpot(x, z, Math.max(w, d) + 16)) continue;
    var ground = W.terrainH(x, z);
    var height = 6 + rng() * 10;
    var top = ground + height;
    var color = rng() < 0.5 ? pal.stone : pal.stone2;
    var o = W.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, top, color, { trim: pal.stoneTrim });
    W.towerDetail(o);
    // 一条坡道通向塔顶；不要从出生点上方穿过（挡住菜单镜头和开局视野），换一面试试，不多用随机数
    var len = height * 2.2 + 2;
    var side = Math.floor(rng() * 4);
    for (var ts = 0; ts < 4 && W.rampNearSpawn(x, z, w, d, len, (side + ts) % 4); ts++);
    if (ts < 4) side = (side + ts) % 4;
    if (side === 0) W.addRamp(x + w / 2 + len, z, 'x', -1, len, 3.2, top, pal.wood);
    else if (side === 1) W.addRamp(x - w / 2 - len, z, 'x', 1, len, 3.2, top, pal.wood);
    else if (side === 2) W.addRamp(x, z + d / 2 + len, 'z', -1, len, 3.2, top, pal.wood);
    else W.addRamp(x, z - d / 2 - len, 'z', 1, len, 3.2, top, pal.wood);
    W.spots.push({ x: x, z: z, y: top, tower: true });
  }
};

// 某一面的坡道（宽 3.2）离出生点是否不到 14 米
W.rampNearSpawn = function (x, z, w, d, len, side) {
  var x0, x1, z0, z1;
  if (side === 0) { x0 = x + w / 2; x1 = x0 + len; z0 = z - 1.6; z1 = z + 1.6; }
  else if (side === 1) { x1 = x - w / 2; x0 = x1 - len; z0 = z - 1.6; z1 = z + 1.6; }
  else if (side === 2) { z0 = z + d / 2; z1 = z0 + len; x0 = x - 1.6; x1 = x + 1.6; }
  else { z1 = z - d / 2; z0 = z1 - len; x0 = x - 1.6; x1 = x + 1.6; }
  var dx = Math.max(x0, 0, -x1), dz = Math.max(z0, 0, -z1);
  return dx * dx + dz * dz < 14 * 14;
};

// 塔楼装饰：箭窗、常春藤、墙脚阴影（都只是外观）
W.towerDetail = function (o) {
  var vr = W.vrng, h = o.top - o.bottom, slit = 0x1a1c22;
  var faces = [[o.x1, 0, 1, 0], [o.x0, 0, -1, 0], [0, o.z1, 0, 1], [0, o.z0, 0, -1]];
  faces.forEach(function (f) {
    if (h < 8 || vr() < 0.35) return;
    var along = f[2] !== 0 ? lerp(o.z0 + 1.5, o.z1 - 1.5, 0.3 + vr() * 0.4) : lerp(o.x0 + 1.5, o.x1 - 1.5, 0.3 + vr() * 0.4);
    var y = o.top - 2.4 - vr() * Math.max(0, h - 7) * 0.4;
    var x = f[2] !== 0 ? f[0] + f[2] * 0.02 : along, z = f[2] !== 0 ? along : f[1] + f[3] * 0.02;
    var g = f[2] !== 0 ? W.boxUV(0.06, 1.3, 0.38, 0.42) : W.boxUV(0.38, 1.3, 0.06, 0.42);
    W.pushGeo(W.batch.brick, g, W.mat4(x, y, z), slit);
  });
  W.ivyOnBox(o.x0, o.x1, o.z0, o.z1, o.top - 0.25, o.bottom + 1, 4 + Math.floor(vr() * 5), Math.min(h * 0.75, 9));
};

W.buildRuins = function (rng, pal) {
  // 低矮的断墙：可以跳上去
  for (var i = 0; i < 26; i++) {
    var x = (rng() * 2 - 1) * (W.S - 25), z = (rng() * 2 - 1) * (W.S - 25);
    if (!W.freeSpot(x, z, 8)) continue;
    var along = rng() < 0.5;
    var len = 4 + rng() * 8, th = 1.2, h = 1.0 + rng() * 0.6;
    var ground = W.terrainH(x, z), o;
    if (along) o = W.addBox(x - len / 2, x + len / 2, z - th / 2, z + th / 2, ground + h, pal.stone2, { trim: pal.stoneTrim });
    else o = W.addBox(x - th / 2, x + th / 2, z - len / 2, z + len / 2, ground + h, pal.stone2, { trim: pal.stoneTrim });
    W.ivyOnBox(o.x0 - 0.15, o.x1 + 0.15, o.z0 - 0.15, o.z1 + 0.15, o.top - 0.05, o.bottom + 0.8, 1 + Math.floor(W.vrng() * 2), 1.6);
  }
  // 漂浮的平台
  for (i = 0; i < 6; i++) {
    x = (rng() * 2 - 1) * (W.S - 30); z = (rng() * 2 - 1) * (W.S - 30);
    if (!W.freeSpot(x, z, 10)) continue;
    var s = 4 + rng() * 3;
    var y = W.terrainH(x, z) + 2.6;
    W.addBox(x - s / 2, x + s / 2, z - s / 2, z + s / 2, y, pal.stone, { floating: true, trim: pal.grass, cap: pal.grass2 });
    W.spots.push({ x: x, z: z, y: y, tower: true });
  }
};

// ---------------- 树木岩石（实例化，每种一次绘制） ----------------
W.buildProps = function (rng, pal) {
  var vr = W.vrng;
  var treeGeos = pal.trees.map(function (parts) { return MODEL.build(parts); });
  var rockGeos = pal.rocks.map(function (parts) { return MODEL.build(parts, 0.04); });
  var counts = treeGeos.map(function () { return 0; });
  var treeMeshes = treeGeos.map(function (g) { return MODEL.instanced(g, pal.treeCount + 10, W.group); });
  var rockMeshes = rockGeos.map(function (g) { return MODEL.instanced(g, 140, W.group); });
  var rcounts = rockGeos.map(function () { return 0; });
  var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  var tint = new THREE.Color();
  // 影子偏移：和主光方向相反，树冠大约 5 米高
  var sd = pal.sunDir || [0.6, 1, 0.35], shadeOff = { x: -sd[0] / Math.max(0.3, sd[1]) * 1.6, z: -sd[2] / Math.max(0.3, sd[1]) * 1.6 };
  var placed = 0, tries = 0;
  while (placed < pal.treeCount && tries++ < 4000) {
    var x = (rng() * 2 - 1) * (W.S - 14), z = (rng() * 2 - 1) * (W.S - 14);
    if (!W.freeSpot(x, z, 3)) continue;
    // 树木成片分布
    if (W.noise.noise(x * 0.03 + 7, z * 0.03 - 3) < -0.1) continue;
    var y = W.terrainH(x, z);
    var k = Math.floor(rng() * treeGeos.length);
    var sc = 0.8 + rng() * 0.7;
    q.setFromAxisAngle(up, rng() * TAU);
    s.set(sc, sc * (0.9 + rng() * 0.3), sc);
    p.set(x, y - 0.2, z);
    m.compose(p, q, s);
    var idx = counts[k]++;
    treeMeshes[k].setMatrixAt(idx, m);
    // 树荫：往背光方向偏一点的软影子 + 树根处的接触阴影
    var shade = pal.treeShade ? pal.treeShade[k] : 0;
    if (shade) W.darkenGround(x + shadeOff.x * sc, z + shadeOff.z * sc, shade * sc, 0.4);
    W.darkenGround(x, z, 1.1 * sc, 0.22);
    // 每棵树颜色略有不同
    var b = 0.86 + vr() * 0.24;
    treeMeshes[k].setColorAt(idx, tint.setRGB(b * (0.96 + vr() * 0.08), b, b * (0.92 + vr() * 0.1)));
    var c = { kind: 'circle', x: x, z: z, r: 0.6 * sc, top: y + 20 };
    W.circles.push(c);
    W.addCollider(c, x - 1, x + 1, z - 1, z + 1);
    placed++;
  }
  treeMeshes.forEach(function (tm, i) { tm.count = counts[i]; tm.instanceMatrix.needsUpdate = true; tm.instanceColor.needsUpdate = true; });
  for (var i = 0; i < 130; i++) {
    x = (rng() * 2 - 1) * (W.S - 14); z = (rng() * 2 - 1) * (W.S - 14);
    if (!W.freeSpot(x, z, 3)) continue;
    y = W.terrainH(x, z);
    sc = 0.6 + rng() * 1.6;
    q.setFromEuler(new THREE.Euler(rng() * 0.4, rng() * TAU, rng() * 0.4));
    s.set(sc * (1 + rng() * 0.5), sc * (0.6 + rng() * 0.5), sc);
    p.set(x, y - 0.2 * sc, z);
    m.compose(p, q, s);
    k = Math.floor(vr() * rockMeshes.length);
    var ri = rcounts[k]++;
    rockMeshes[k].setMatrixAt(ri, m);
    b = 0.88 + vr() * 0.22;
    rockMeshes[k].setColorAt(ri, tint.setRGB(b, b, b));
    W.darkenGround(x, z, 1.7 * sc, 0.3);
    var top = y + sc * 0.9;
    var cr = { kind: 'circle', x: x, z: z, r: 1.1 * sc, top: top };
    W.circles.push(cr);
    W.addCollider(cr, x - 2 * sc, x + 2 * sc, z - 2 * sc, z + 2 * sc);
  }
  rockMeshes.forEach(function (rm, i) { rm.count = rcounts[i]; rm.instanceMatrix.needsUpdate = true; rm.instanceColor.needsUpdate = true; });
};

// ---------------- 草丛（纯装饰，没有碰撞） ----------------
// 两片交叉的竖片，正反面都朝上打光（和地面一样亮）
W.tuftGeo = function () {
  var pos = [], uv = [], nor = [], col = [], w = 0.6, h = 0.72;
  [[1, 0], [0, 1]].forEach(function (d) {
    var a = [-d[0] * w, 0, -d[1] * w], b = [d[0] * w, 0, d[1] * w], c = [d[0] * w, h, d[1] * w], e = [-d[0] * w, h, -d[1] * w];
    var faces = [[a, b, c, [0, 0], [1, 0], [1, 1]], [a, c, e, [0, 0], [1, 1], [0, 1]], [b, a, e, [1, 0], [0, 0], [0, 1]], [b, e, c, [1, 0], [0, 1], [1, 1]]];
    faces.forEach(function (f) {
      for (var k = 0; k < 3; k++) {
        pos.push(f[k][0], f[k][1], f[k][2]);
        uv.push(f[k + 3][0], f[k + 3][1]);
        nor.push(0, 1, 0);
        var t = f[k][1] > 0 ? 1 : 0.7;
        col.push(t, t, t);
      }
    });
  });
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
};

W.onBuilding = function (x, z) {
  var i, o;
  for (i = 0; i < W.boxes.length; i++) { o = W.boxes[i]; if (x > o.x0 - 0.4 && x < o.x1 + 0.4 && z > o.z0 - 0.4 && z < o.z1 + 0.4) return true; }
  for (i = 0; i < W.ramps.length; i++) { o = W.ramps[i]; if (x > o.x0 && x < o.x1 && z > o.z0 && z < o.z1) return true; }
  return false;
};

// 一簇一簇地撒在平缓的草地上（避开建筑、陡坡和泥土斑块）
W.buildTufts = function (pal) {
  if (!pal.tuft) return;
  var vr = W.vrng, n = pal.tuftCount || 900, N = W.noise;
  var im = MODEL.instanced(W.tuftGeo(), n, W.group, W.mats.tuft);
  var m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  var c = new THREE.Color(), base = new THREE.Color(pal.tuft), placed = 0;
  for (var tries = 0; placed < n && tries < n * 2; tries++) {
    var cx = (vr() * 2 - 1) * (W.S - 8), cz = (vr() * 2 - 1) * (W.S - 8), k = 2 + Math.floor(vr() * 6);
    for (var j = 0; j < k && placed < n; j++) {
      var x = cx + (vr() - 0.5) * 4, z = cz + (vr() - 0.5) * 4;
      if (W.onBuilding(x, z)) continue;
      var patch = N.noise(x * 0.045 + 100, z * 0.045) + N.noise(x * 0.13 - 40, z * 0.13 + 7) * 0.35;
      if (patch > 0.3) continue;
      var y = W.terrainH(x, z);
      if (Math.abs(W.terrainH(x + 1, z) - y) + Math.abs(W.terrainH(x, z + 1) - y) > 0.55) continue;
      var sc = 0.8 + vr() * 0.7;
      q.setFromAxisAngle(up, vr() * TAU);
      s.set(sc, sc * (0.75 + vr() * 0.55), sc);
      p.set(x, y - 0.04, z);
      m.compose(p, q, s);
      im.setMatrixAt(placed, m);
      im.setColorAt(placed, c.copy(base).multiplyScalar(0.8 + vr() * 0.35));
      placed++;
    }
  }
  im.count = placed;
  im.instanceMatrix.needsUpdate = true;
  im.instanceColor.needsUpdate = true;
};

// 随机找一个地面上的空位
W.randomSpot = function (minR, maxR, cx, cz) {
  for (var t = 0; t < 60; t++) {
    var a = Math.random() * TAU, r = rand(minR, maxR);
    var x = (cx || 0) + Math.cos(a) * r, z = (cz || 0) + Math.sin(a) * r;
    if (Math.abs(x) > W.S - 20 || Math.abs(z) > W.S - 20) continue;
    if (!W.freeSpot(x, z, 2) && (x * x + z * z >= 400)) continue;
    var ok = true;
    var list = W.nearby(x, z);
    for (var i = 0; i < list.length; i++) {
      var o = list[i];
      if (o.kind === 'circle' && dist2(x, z, o.x, o.z) < (o.r + 2) * (o.r + 2)) { ok = false; break; }
    }
    if (ok) return { x: x, z: z, y: W.groundAt(x, z, 999) };
  }
  return { x: cx || 0, z: cz || 0, y: W.terrainH(cx || 0, cz || 0) };
};
