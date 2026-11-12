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
  W.bellTower = null;   // 沉钟古城倒了一半的钟楼（W.buildCity 填）
  W.visExtra = { boxes: [], circles: [] };   // 第 3 关只有外观、没有碰撞体的东西的占地（W.cityDetail 填；弩车、军旗、急件躲开它们）
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
  if (pal.cityWalls || pal.bellTower) W.buildCity(pal, seed);
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

// 圆柱 / 圆锥的贴图坐标按实际尺寸缩放：前 nSide 个顶点是侧面（u × su、v × sv），后面的底面按 sc 缩放
W.scaleUV = function (g, nSide, su, sv, sc) {
  var uv = g.attributes.uv;
  for (var i = 0; i < uv.count; i++) {
    if (i < nSide) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    else uv.setXY(i, uv.getX(i) * sc, uv.getY(i) * sc);
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

// ---------------- 沉钟古城：塌掉的城墙、倒了一半的钟楼 ----------------
// 第 8 块的占位（第 10 块换真模型）：只用石砖批次和 W.addBox，不加新贴图、新网格。
// 用自己的随机数，不动布局流 rng；W.addBox / 常春藤读的外观随机数 W.vrng 也临时换成自己的一条，
// 所以第 1、2 关一模一样，第 3 关原来的东西一个不变，只在最后多出这些
W.buildCity = function (pal, seed) {
  var rng = mulberry32((seed ^ 0x3c6ef372) >>> 0), vr0 = W.vrng;
  W.vrng = mulberry32((seed ^ 0x27d4eb2d) >>> 0);
  W.cityParts = { walls: [], tower: null };
  try {
    if (pal.bellTower) W.buildBellTower(rng, pal);
    if (pal.cityWalls) W.buildCityWalls(rng, pal);
  } finally { W.vrng = vr0; }
  var tw = W.cityParts.tower;
  W.cityDetail(pal, seed);
  if (tw) W.fallenTopTops(tw);
};

// 倒下的塔顶（5×7×5 的壳子 + 远端的攒尖屋顶，斜着躺，画出来 3~5 米高）下面原来只垫了一块 2.2 米的碰撞体，人能站进壳子里。
// 按画出来的轮廓每半米加一块看不见的碰撞体（从塔身 3 米到屋顶尖 12 米；顶比轮廓低 5 厘米，相邻两块差不到 0.2 米，走得上去；
// 宽：壳子 ±2.5 米，屋顶按攒尖往里收）。放在整座城建完以后：不用随机数，前面的布局、外观、常春藤都不变
W.fallenTopTops = function (T) {
  var M = T.fm, v = new THREE.Vector3(), sx = T.sx, sz = T.sz;
  // 倾倒的那个平面里的轮廓（倒的方向上离塔心多远 d、多高 y）：壳子侧面的矩形 + 屋顶的三角
  var pt = function (u, w) {   // u：平面里垂直于壳子长度的那根轴（壳子 ±2.5），w：沿壳子长度（±3.5，屋顶尖 −5.9）
    if (sx) v.set(u, w, 0); else v.set(0, w, u);
    v.applyMatrix4(M);
    return [sx ? (v.x - T.x) * sx : (v.z - T.z) * sz, v.y];
  };
  var polys = [[pt(2.5, 3.5), pt(-2.5, 3.5), pt(-2.5, -3.5), pt(2.5, -3.5)], [pt(2.55, -3.5), pt(0, -5.9), pt(-2.55, -3.5)]];
  var topAt = function (d) {
    var h = -1e9;
    polys.forEach(function (P) {
      for (var i = 0; i < P.length; i++) {
        var a = P[i], b = P[(i + 1) % P.length], lo = Math.min(a[0], b[0]), hi = Math.max(a[0], b[0]);
        if (d < lo || d > hi || hi - lo < 1e-6) continue;
        h = Math.max(h, a[1] + (b[1] - a[1]) * (d - a[0]) / (b[0] - a[0]));
      }
    });
    return h;
  };
  var r0 = polys[1][0][0], r1 = polys[1][1][0];   // 屋顶从哪儿开始收、尖在哪儿
  T.tops = [];
  for (var d = 3; d < r1; d += 0.5) {
    var top = topAt(d + 0.25) - 0.05;
    if (!(top > T.ground + 0.6)) continue;
    var hw = d <= r0 ? 2.5 : 2.55 * Math.max(0.15, (r1 - d) / (r1 - r0));
    var x0, x1, z0, z1;
    if (sx) { x0 = T.x + Math.min(d * sx, (d + 0.5) * sx); x1 = T.x + Math.max(d * sx, (d + 0.5) * sx); z0 = T.z - hw; z1 = T.z + hw; }
    else { z0 = T.z + Math.min(d * sz, (d + 0.5) * sz); z1 = T.z + Math.max(d * sz, (d + 0.5) * sz); x0 = T.x - hw; x1 = T.x + hw; }
    var o = { kind: 'box', x0: x0, x1: x1, z0: z0, z1: z1, top: top, bottom: T.ground - 1, floating: false, hidden: true };
    W.boxes.push(o);
    W.addCollider(o, x0, x1, z0, z1);
    T.tops.push(o);
  }
};

// 一座倒了一半的钟楼（百年沉钟的出场点，Boss 传送门在它旁边，见 interact.js）：离出生点 55~110 米，
// 6×6 的残塔 10 米高 + 倒在一边的塔顶（只是外观，下面垫一块矮的碰撞体）+ 几块碎石
W.buildBellTower = function (rng, pal) {
  for (var t = 0; t < 160; t++) {
    var a = rng() * TAU, d = 55 + rng() * 55, x = Math.cos(a) * d, z = Math.sin(a) * d, dir = Math.floor(rng() * 4);
    if (!W.freeSpot(x, z, t < 100 ? 16 : 11)) continue;
    var ground = W.terrainH(x, z), top = ground + 10;
    var o = W.addBox(x - 3, x + 3, z - 3, z + 3, top, pal.stone, { trim: pal.stoneTrim });
    W.towerDetail(o);
    // 倒下的塔顶：朝 dir（+x −x +z −z）那边倒，塔尖靠着残塔
    var sx = [1, -1, 0, 0][dir], sz = [0, 0, 1, -1][dir], fx = x + sx * 6.5, fz = z + sz * 6.5;
    var m = sx ? W.mat4(fx, ground + 1.6, fz, 0, 0, 1.25 * sx) : W.mat4(fx, ground + 1.6, fz, -1.25 * sz, 0, 0);
    W.pushGeo(W.batch.brick, W.boxUV(5, 7, 5, 0.42), m, pal.stone2, 0.7);
    W.cityParts.tower = { o: o, x: x, z: z, ground: ground, top: top, sx: sx, sz: sz, fm: m.clone() };
    if (sx) W.addBox(Math.min(x + sx * 4, x + sx * 10), Math.max(x + sx * 4, x + sx * 10), z - 2.5, z + 2.5, ground + 2.2, pal.stone2);
    else W.addBox(x - 2.5, x + 2.5, Math.min(z + sz * 4, z + sz * 10), Math.max(z + sz * 4, z + sz * 10), ground + 2.2, pal.stone2);
    // 碎石：落在另外三面，都不到 1 米高，可以踩上去
    for (var k = 0; k < 4; k++) {
      var ra = rng() * TAU, rr = 4.6 + rng() * 2.4, rx = x + Math.cos(ra) * rr, rz = z + Math.sin(ra) * rr, s = 0.5 + rng() * 0.5;
      if ((rx - x) * sx > 3 || (rz - z) * sz > 3) { rx = x - (rx - x); rz = z - (rz - z); }
      W.addBox(rx - s, rx + s, rz - s, rz + s, W.terrainH(rx, rz) + 0.45 + rng() * 0.5, pal.stone2, { trim: pal.stoneTrim });
    }
    W.bellTower = { x: x, z: z, y: top, g: ground, sx: sx, sz: sz };   // g 地面、(sx, sz) 塔顶倒下的方向（首领出场的镜头要躲开）
    return;
  }
};

// 几段塌掉的城墙：6 段，每段 2~4 截、1.6 米厚、3~5 米长、2.2~4.5 米高，截与截之间断开 1.5~3 米；可以跳上去、爬上去
W.buildCityWalls = function (rng, pal) {
  var runs = 0;
  for (var t = 0; t < 120 && runs < 6; t++) {
    var x = (rng() * 2 - 1) * (W.S - 35), z = (rng() * 2 - 1) * (W.S - 35);
    if (!W.freeSpot(x, z, 12)) continue;
    var along = rng() < 0.5, n = 2 + Math.floor(rng() * 3), segs = [], total = 0, i;
    for (i = 0; i < n; i++) {
      var len = 3 + rng() * 2, gap = i < n - 1 ? 1.5 + rng() * 1.5 : 0;
      segs.push({ len: len, gap: gap, h: 2.2 + rng() * 2.3 });
      total += len + gap;
    }
    var u = -total / 2, placed = 0, th = 1.6;
    for (i = 0; i < n; i++) {
      var sg = segs[i], c = u + sg.len / 2, cx = along ? x + c : x, cz = along ? z : z + c;
      u += sg.len + sg.gap;
      if (!W.freeSpot(cx, cz, sg.len / 2 + 1.5)) continue;
      var top = W.terrainH(cx, cz) + sg.h, o;
      if (along) o = W.addBox(cx - sg.len / 2, cx + sg.len / 2, cz - th / 2, cz + th / 2, top, pal.stone2, { trim: pal.stoneTrim });
      else o = W.addBox(cx - th / 2, cx + th / 2, cz - sg.len / 2, cz + sg.len / 2, top, pal.stone2, { trim: pal.stoneTrim });
      W.ivyOnBox(o.x0 - 0.15, o.x1 + 0.15, o.z0 - 0.15, o.z1 + 0.15, o.top - 0.05, o.bottom + 0.8, 1 + Math.floor(W.vrng() * 2), 2.2);
      W.cityParts.walls.push({ o: o, along: along, gap0: i > 0 ? segs[i - 1].gap : 0, gap1: sg.gap });
      placed++;
    }
    if (placed) runs++;
  }
};

// ---------------- 第 10 块：城墙和钟楼的细节（只是外观） ----------------
// 垛口、塌掉的台阶状断头、墙脚的勒脚石、箭窗、碎石；钟楼的壁柱、腰线、檐下的托石、断掉的钟亭拱、断了的钟梁和垂下的断链、
// 倒在地上的钟亭（四角攒尖的屋顶、拱形窗洞、裂缝）和一地碎瓦。全都并进已有的石砖 / 木头批次（不加绘制次数），
// 不加碰撞体；用第三条随机数（不动布局流 rng 和 W.vrng），建的时候 Resume.noise 打开（three.js 的 uuid 不占建关卡的种子随机数，
// 所以宝箱、神龛这些的位置和以前一样）
W.cityDetail = function (pal, seed) {
  var cp = W.cityParts;
  if (!cp || (!cp.tower && !cp.walls.length)) return;
  var Rq = typeof Resume !== 'undefined' ? Resume : null;
  if (Rq) Rq.noise = (Rq.noise || 0) + 1;
  try {
    var v3 = mulberry32((seed ^ 0x165667b1) >>> 0);
    cp.walls.forEach(function (w) { W.wallDetail(w, pal, v3); });
    if (cp.tower) W.towerRuin(cp.tower, pal, v3);
  } finally { if (Rq) Rq.noise--; }
  W.cityParts = null;
};

// 一块石头：中心 (x,y,z)、大小 (w,h,d)、绕 y 转 ry（再绕 x / z 歪一点），颜色抖一点
W.stone = function (x, y, z, w, h, d, color, v3, ry, rx, rz, dark) {
  var c = new THREE.Color(color).multiplyScalar(0.88 + v3() * 0.18);
  W.pushGeo(W.batch.brick, W.boxUV(w, h, d, 0.42), W.mat4(x, y, z, rx || 0, ry || 0, rz || 0, 'YXZ'), c, dark);
};

// 一截城墙：沿 along 方向的长度 L、厚度 th；坐标都换成 (沿墙 u, 横向 t) 来写
W.wallDetail = function (w, pal, v3) {
  var o = w.o, along = w.along;
  var cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, L = along ? o.x1 - o.x0 : o.z1 - o.z0, th = along ? o.z1 - o.z0 : o.x1 - o.x0;
  var base = o.bottom + 1, h = o.top - base, st = pal.stone2, trim = pal.stoneTrim, slit = 0x14161c;
  var put = function (u, y, t, lu, ly, lt, col, ry, rx, rz, dark) {
    if (along) W.stone(cx + u, y, cz + t, lu, ly, lt, col, v3, ry, rx, rz, dark);
    else W.stone(cx + t, y, cz + u, lt, ly, lu, col, v3, ry, rz, rx, dark);
  };
  // 勒脚：墙脚一圈深色的大石
  put(0, base + 0.02, 0, L + 0.24, 0.66, th + 0.24, trim, 0, 0, 0, 0.75);
  // 垛口（高的那几截才有，两边各一排）；矮的那几截顶上是塌下来的乱石
  var intact = h >= 3.0;
  if (intact) {
    var n = Math.max(2, Math.floor((L - 1.0) / 1.1)), pitch = (L - 1.0) / n;
    for (var i = 0; i < n; i++) {
      var u = -L / 2 + 0.5 + pitch * (i + 0.5);
      [-1, 1].forEach(function (sd, k) {
        var mh = 0.55, end = (i === 0 && w.gap0 > 0 && k === 0) || (i === n - 1 && w.gap1 > 0 && k === 1);
        if (end || v3() < 0.12) mh = 0.28 + v3() * 0.12;          // 断了半截的垛
        put(u, o.top + mh / 2, sd * (th / 2 + 0.15 - 0.22), 0.6, mh, 0.44, st, (v3() - 0.5) * 0.06);
      });
    }
  } else {
    for (i = 0; i < 2; i++) put((v3() - 0.5) * L * 0.6, o.top + 0.14, (v3() - 0.5) * th * 0.5, 0.5 + v3() * 0.4, 0.3, 0.45 + v3() * 0.3, st, v3() * 1.2, 0, (v3() - 0.5) * 0.3);
  }
  // 塌掉的断头：两头各两级往下退的台阶（伸进缺口里，越往外越矮）
  [[-1, w.gap0], [1, w.gap1]].forEach(function (e) {
    var sd = e[0], gap = e[1], p1 = gap ? Math.min(0.3, gap * 0.16) : 0.4, p2 = gap ? Math.min(0.55, gap * 0.3) : 0.85;
    var hA = h * (0.55 + v3() * 0.15), hB = h * (0.22 + v3() * 0.1), ue = sd * L / 2;
    put(ue + sd * p1 / 2, base + hA / 2, (v3() - 0.5) * 0.1, p1 + 0.02, hA, th * 0.86, st, 0, 0, 0, 0.66);
    put(ue + sd * p2 / 2, base + hB / 2, (v3() - 0.5) * 0.1, p2 + 0.02, hB, th * 0.72, st, 0, 0, 0, 0.66);
    // 断口顶上歪着的一块
    put(ue + sd * p1 * 0.4, base + hA + 0.12, 0, 0.42, 0.3, th * 0.5, st, v3() * 0.4, 0, sd * 0.35);
    // 墙脚碎石（不到 0.4 米高，靠墙两侧，缺口中间留出路）
    for (var k = 0; k < 2; k++) {
      var ru = ue + sd * (0.25 + v3() * (gap ? gap * 0.35 : 1.4)), rt = (k ? 1 : -1) * (th / 2 + 0.2 + v3() * 0.6), rs = 0.28 + v3() * 0.22;
      put(ru, W.terrainH(along ? cx + ru : cx + rt, along ? cz + rt : cz + ru) + rs * 0.25, rt, rs * 1.3, rs * 0.7, rs, v3() < 0.5 ? st : trim, v3() * 3, (v3() - 0.5) * 0.6, (v3() - 0.5) * 0.6);
      if (W.visExtra) W.visExtra.circles.push({ x: along ? cx + ru : cx + rt, z: along ? cz + rt : cz + ru, r: rs * 0.82 });   // 半对角线
    }
  });
  // 勒脚、压顶、垛口比碰撞盒宽 0.12~0.15 米；两头塌掉的台阶伸出去 p2（缺口里最多 0.55 米，整段的两头 0.85 米）
  if (W.visExtra) {
    var e0 = Math.max(0.15, (w.gap0 ? Math.min(0.55, w.gap0 * 0.3) : 0.85) + 0.02), e1 = Math.max(0.15, (w.gap1 ? Math.min(0.55, w.gap1 * 0.3) : 0.85) + 0.02);
    W.visExtra.boxes.push(along ? { x0: o.x0 - e0, x1: o.x1 + e1, z0: o.z0 - 0.15, z1: o.z1 + 0.15, top: o.top + 0.6, bottom: o.bottom }
      : { x0: o.x0 - 0.15, x1: o.x1 + 0.15, z0: o.z0 - e0, z1: o.z1 + e1, top: o.top + 0.6, bottom: o.bottom });
  }
  // 箭窗：两个长面各 1~2 个
  if (h >= 2.6) [-1, 1].forEach(function (sd) {
    var m = 1 + (v3() < 0.45 ? 1 : 0);
    for (var k = 0; k < m; k++) {
      var u = m === 1 ? (v3() - 0.5) * L * 0.3 : (k ? 1 : -1) * L * 0.22;
      put(u, base + h * 0.58, sd * (th / 2 + 0.02), 0.26, 0.85, 0.06, slit);
      put(u, base + h * 0.58 - 0.5, sd * (th / 2 + 0.04), 0.5, 0.12, 0.1, trim);
    }
  });
};

// 钟楼：残塔上的东西 + 倒在地上的钟亭
W.towerRuin = function (T, pal, v3) {
  var x = T.x, z = T.z, g = T.ground, top = T.top, base = T.o.bottom + 1, st = pal.stone, st2 = pal.stone2, trim = pal.stoneTrim, slit = 0x14161c;
  var iron = 0x2a2a30, wood = pal.wood || 0x6a4a2a, roof = 0x6a4a3a, i, k;
  var S = function (px, py, pz, w, h, d, col, ry, rx, rz, dark) { W.stone(px, py, pz, w, h, d, col, v3, ry, rx, rz, dark); };
  var Wd = function (px, py, pz, w, h, d, col, ry, rx, rz) {
    var c = new THREE.Color(col).multiplyScalar(0.9 + v3() * 0.15);
    W.pushGeo(W.batch.wood, W.boxUV(w, h, d, 0.5), W.mat4(px, py, pz, rx || 0, ry || 0, rz || 0, 'YXZ'), c);
  };
  var H = top - base;
  // 四角的壁柱（一直到顶）和勒脚
  for (i = 0; i < 4; i++) {
    var qx = i & 1 ? 1 : -1, qz = i & 2 ? 1 : -1;
    S(x + qx * 2.95, base + (H + 1.2) / 2 - 0.6, z + qz * 2.95, 0.72, H + 1.2, 0.72, trim, 0, 0, 0, 0.7);
  }
  S(x, base + 0.1, z, 6.5, 0.8, 6.5, trim, 0, 0, 0, 0.8);
  // 两道腰线
  [0.36, 0.7].forEach(function (f) { S(x, base + H * f, z, 6.3, 0.28, 6.3, trim); });
  // 檐下一排托石（每面 5 个）
  for (i = 0; i < 4; i++) {
    var fx = [1, -1, 0, 0][i], fz = [0, 0, 1, -1][i];
    for (k = 0; k < 5; k++) {
      var a = -2.0 + k * 1.0;
      S(x + (fx ? fx * 3.12 : a), top - 0.62, z + (fz ? fz * 3.12 : a), fx ? 0.3 : 0.34, 0.36, fz ? 0.3 : 0.34, trim);
    }
  }
  // 塔身上一道大裂缝（深色折线）
  var cf = T.sx ? -T.sx : 0, cg = T.sz ? -T.sz : 0;   // 背向倒塌方向的那一面
  if (!cf && !cg) cf = 1;
  var cy0 = base + H * 0.45;
  for (i = 0; i < 4; i++) {
    var off = (i % 2 ? 0.25 : -0.25) + (v3() - 0.5) * 0.2, yy = cy0 + i * 1.05;
    if (cf) S(x + cf * 3.02, yy, z + off, 0.05, 1.2, 0.1, slit, 0, (i % 2 ? 0.4 : -0.4));
    else S(x + off, yy, z + cg * 3.02, 0.1, 1.2, 0.05, slit, 0, 0, (i % 2 ? 0.4 : -0.4));
  }
  // 断掉的钟亭：四个角上的残墩（锯齿形的顶）
  var ph = [];
  for (i = 0; i < 4; i++) {
    qx = i & 1 ? 1 : -1; qz = i & 2 ? 1 : -1;
    var hh = 1.5 + v3() * 1.0; ph.push(hh);
    S(x + qx * 2.35, top + hh / 2, z + qz * 2.35, 1.3, hh, 1.3, st, 0, 0, 0, 0.85);
    S(x + qx * (2.35 + (v3() - 0.5) * 0.5), top + hh + 0.22, z + qz * (2.35 + (v3() - 0.5) * 0.5), 0.6, 0.44, 0.6, st, v3(), (v3() - 0.5) * 0.4, (v3() - 0.5) * 0.4);
  }
  // 两面的拱：从残墩上起拱，中间断开（一边三块拱石、一边两块）
  [0, 1].forEach(function (side) {
    var ax = side ? 0 : 1, az = side ? 1 : 0, sgn = side ? -1 : 1;   // 拱在 +x 面或 −z 面上
    var spring = top + 1.25, R = 1.6;
    for (k = 0; k < 5; k++) {
      var left = k < 3, an = left ? (k + 0.5) * 0.3 : Math.PI - (k - 3 + 0.5) * 0.3;
      var u = Math.cos(an) * R * (left ? -1 : -1), yy = spring + Math.sin(an) * R;
      var rot = left ? -(Math.PI / 2 - an) : (an - Math.PI / 2);
      if (ax) S(x + sgn * 2.35, yy, z + u, 0.9, 0.36, 0.55, st, 0, -rot);
      else S(x + u, yy, z + sgn * 2.35, 0.55, 0.36, 0.9, st, 0, 0, rot);
    }
  });
  // 断了的钟梁（木头）：一头搭在残墩上、另一头断了往下垂；断口上几根木刺；断口垂下一段断链
  // （架在 +z 那一面的两个残墩之间：那一面没有拱）
  var bz = z + 2.35, b0 = [x - 2.35, top + ph[2] - 0.25, bz], blen = 3.0, tilt = -0.28;
  var bcx = b0[0] + Math.cos(tilt) * blen / 2, bcy = b0[1] + Math.sin(tilt) * blen / 2;
  Wd(bcx, bcy, bz, blen, 0.42, 0.42, wood, 0, 0, tilt);
  var ex = b0[0] + Math.cos(tilt) * blen, ey = b0[1] + Math.sin(tilt) * blen;
  for (k = 0; k < 3; k++) Wd(ex + 0.12, ey + (k - 1) * 0.12, bz + (k - 1) * 0.1, 0.38, 0.07, 0.07, wood, (k - 1) * 0.4, 0, tilt + (k - 1) * 0.3);
  Wd(x + 2.35 - 0.6, top + ph[3] - 0.25, bz, 1.4, 0.42, 0.42, wood, 0, 0, 0.12);   // 对面剩下的一截
  for (k = 0; k < 6; k++) S(ex - 0.15, ey - 0.3 - k * 0.2, bz, k % 2 ? 0.05 : 0.14, 0.22, k % 2 ? 0.14 : 0.05, iron);
  S(ex - 0.15, ey - 1.55, bz + 0.05, 0.16, 0.16, 0.05, iron, 0.3, 0, 0.8);   // 断开的最后一节
  // 倒在地上的钟亭：原来的那块 5×7×5 的塔顶就是它的四方壳子；壳子的四面开拱形窗洞、两道裂缝，
  // 远的那头是四角攒尖的屋顶（扎进地里一点），周围一地碎瓦
  var M = T.fm, tm = new THREE.Matrix4(), tmp = new THREE.Matrix4();
  // 占地：塔身连壁柱、勒脚（半边 3.31 米）和顶上的残墩；倒下的壳子 8 个角 + 屋顶 4 个角和尖顶按 M 摆好以后的范围（只有靠塔那一截下面有碰撞体）
  if (W.visExtra) {
    W.visExtra.boxes.push({ x0: x - 3.35, x1: x + 3.35, z0: z - 3.35, z1: z + 3.35, top: top + 3.2, bottom: T.o.bottom });
    var fb = { x0: 1e9, x1: -1e9, z0: 1e9, z1: -1e9, top: -1e9, bottom: T.o.bottom }, pv = new THREE.Vector3(), q;
    var corner = function (lx, ly, lz) {
      pv.set(lx, ly, lz).applyMatrix4(M);
      fb.x0 = Math.min(fb.x0, pv.x); fb.x1 = Math.max(fb.x1, pv.x); fb.z0 = Math.min(fb.z0, pv.z); fb.z1 = Math.max(fb.z1, pv.z); fb.top = Math.max(fb.top, pv.y);
    };
    for (q = 0; q < 8; q++) corner(q & 1 ? 2.5 : -2.5, q & 2 ? 3.5 : -3.5, q & 4 ? 2.5 : -2.5);   // 壳子
    for (q = 0; q < 4; q++) corner(q & 1 ? 2.55 : -2.55, -3.5, q & 2 ? 2.55 : -2.55);            // 屋顶底下的四个角
    corner(0, -5.9, 0);                                                                           // 尖顶
    W.visExtra.boxes.push(fb);
  }
  var put = function (list, geo, lx, ly, lz, rx, ry, rz, col, dark) {
    tmp.copy(W.mat4(lx, ly, lz, rx || 0, ry || 0, rz || 0, 'YXZ'));
    tm.multiplyMatrices(M, tmp);
    W.pushGeo(list, geo, tm, new THREE.Color(col).multiplyScalar(0.9 + v3() * 0.14), dark);
  };
  for (i = 0; i < 4; i++) {
    var nx = [1, -1, 0, 0][i], nz = [0, 0, 1, -1][i], ry = nx ? Math.PI / 2 : 0;
    var px = nx * 2.53, pz = nz * 2.53;
    // （钟亭倒下以后它的“上”是壳子的 −y：拱顶朝 −y）
    put(W.batch.brick, W.boxUV(1.5, 1.6, 0.06, 0.42), px, -1.3, pz, 0, ry, 0, slit);
    var arch = W.scaleUV(new THREE.CylinderGeometry(0.75, 0.75, 0.06, 7, 1, false, -Math.PI / 2, Math.PI), 16, 0.99, 0.025, 0.63);
    put(W.batch.brick, arch, px, -2.1, pz, Math.PI / 2, ry, 0, slit);
    put(W.batch.brick, W.boxUV(1.9, 0.22, 0.12, 0.42), px, -0.42, pz, 0, ry, 0, trim);
  }
  for (i = 0; i < 3; i++) put(W.batch.brick, W.boxUV(0.06, 1.3, 0.1, 0.42), 2.54, 0.3 + i * 1.0, -1.2 + (i % 2) * 0.3, 0, 0, (i % 2 ? 0.45 : -0.45), slit);
  put(W.batch.brick, W.boxUV(5.5, 0.4, 5.5, 0.42), 0, -3.3, 0, 0, 0, 0, trim);   // 底下的檐口
  // 四角攒尖顶：每个坡面宽 5.1 米、斜高 3.5 米，按木板批次的 0.5 缩放贴图（不然一块木板拉满整面）
  var rg = W.scaleUV(new THREE.ConeGeometry(3.6, 2.4, 4, 1), 10, 4 * 5.09 * 0.5, 3.5 * 0.5, 3.6);
  put(W.batch.wood, rg, 0, -3.5 - 1.2, 0, Math.PI, Math.PI / 4, 0, roof);
  put(W.batch.wood, new THREE.ConeGeometry(0.12, 0.9, 4), 0, -5.9 - 0.4, 0, Math.PI, 0, 0, iron);   // 尖顶的铁杆
  for (k = 0; k < 14; k++) {
    var ta = v3() * TAU, tr = 2.5 + v3() * 5.5, tx = x + T.sx * 9 + Math.cos(ta) * tr, tz = z + T.sz * 9 + Math.sin(ta) * tr;
    if (Math.abs(tx - x) < 3.4 && Math.abs(tz - z) < 3.4) continue;
    var c = new THREE.Color(roof).multiplyScalar(0.8 + v3() * 0.35);
    W.pushGeo(W.batch.wood, W.boxUV(0.5, 0.06, 0.72, 0.5), W.mat4(tx, W.terrainH(tx, tz) + 0.05, tz, (v3() - 0.5) * 0.3, v3() * TAU, (v3() - 0.5) * 0.3, 'YXZ'), c);
  }
};

// 模型真实占地（不进物理）：几何体（去重的顶点，缓存在 geo.userData）按矩阵 m 摆好以后，离 (cx, cz) 最远的水平距离；
// 只算离底 maxH 米以内的点（树：vis 只看树干和低处的枝叶，can 看到 4.3 米的树冠）。石头的模型可以比碰撞圈大到 1.5 倍，弩车 / 军旗 / 信要躲开的是这个
W.visR = function (geo, m, cx, cz, y0, maxH) {
  var v = geo.userData.vtx;
  if (!v) {
    var pos = geo.attributes.position, seen = {}, L = [];
    for (var i = 0; i < pos.count; i++) {
      var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), k = Math.round(x * 50) + ',' + Math.round(y * 50) + ',' + Math.round(z * 50);
      if (!seen[k]) { seen[k] = 1; L.push(x, y, z); }
    }
    v = geo.userData.vtx = new Float32Array(L);
  }
  var e = m.elements, r2 = 0;
  for (var j = 0; j < v.length; j += 3) {
    var px = e[0] * v[j] + e[4] * v[j + 1] + e[8] * v[j + 2] + e[12];
    var py = e[1] * v[j] + e[5] * v[j + 1] + e[9] * v[j + 2] + e[13];
    var pz = e[2] * v[j] + e[6] * v[j + 1] + e[10] * v[j + 2] + e[14];
    if (py - y0 > maxH) continue;
    var dx = px - cx, dz = pz - cz;
    if (dx * dx + dz * dz > r2) r2 = dx * dx + dz * dz;
  }
  return Math.sqrt(r2);
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
    var c = { kind: 'circle', x: x, z: z, r: 0.6 * sc, top: y + 20, vis: W.visR(treeGeos[k], m, x, z, y, 1.6), can: W.visR(treeGeos[k], m, x, z, y, 4.3) };   // can：离地 4.3 米以内（树冠下沿，4 米高的军旗要躲开）
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
    var cr = { kind: 'circle', x: x, z: z, r: 1.1 * sc, top: top, vis: W.visR(rockGeos[k], m, x, z, y, 99) };
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
