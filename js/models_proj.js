'use strict';
// ============================================================
//  弹丸与场地效果模型
// ============================================================

// 新月形的轮廓：[半径, 最厚处, 弧度]；朝向 +Y（转到 XZ 平面后朝向 +Z）
function fxCrescentShape(s) {
  var R = s[0], w = s[1], arc = s[2] || 2.2, S = 16, shape = new THREE.Shape(), i, t, a, rr;
  for (i = 0; i <= S; i++) {
    t = i / S; a = (t - 0.5) * arc;
    if (i === 0) shape.moveTo(Math.sin(a) * R, Math.cos(a) * R); else shape.lineTo(Math.sin(a) * R, Math.cos(a) * R);
  }
  for (i = S - 1; i >= 1; i--) {
    t = i / S; a = (t - 0.5) * arc; rr = R - w * Math.pow(Math.sin(t * Math.PI), 0.8);
    shape.lineTo(Math.sin(a) * rr, Math.cos(a) * rr);
  }
  return shape;
}

// 新月形薄片（剑气）：[半径, 最厚处, 弧度]；朝向 +Z，躺在 XZ 平面
MODEL.extraGeo.fxCrescent = function (s) { return new THREE.ShapeGeometry(fxCrescentShape(s)).rotateX(Math.PI / 2); };

// 有厚度的新月（刀刃、月刃）：[半径, 最厚处, 弧度, 厚度]；两面都看得见，受光照
MODEL.extraGeo.fxCrescent3 = function (s) {
  var d = s[3] || 0.06;
  return new THREE.ExtrudeGeometry(fxCrescentShape(s), { depth: d, bevelEnabled: false, curveSegments: 4 }).translate(0, 0, -d / 2).rotateX(Math.PI / 2);
};

// 不带盖的圆柱：[上半径, 下半径, 高, 段数]
MODEL.extraGeo.fxTube = function (s) { return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 8, 1, true); };

// 半球（上半个）：[半径, 横向段数, 竖向段数]；两个半球拼成双色球
MODEL.extraGeo.fxHemi = function (s) { return new THREE.SphereGeometry(s[0], s[1] || 8, s[2] || 3, 0, Math.PI * 2, 0, Math.PI / 2); };

// 一圈锯齿（捕兽夹的铁牙）：[齿数, 半径, 齿高, 齿尖往里收多少（负数往外张）, 半齿宽（弧度）]；每颗齿是一个三棱锥，整圈一个零件
MODEL.extraGeo.fxTeeth = function (s) {
  var n = s[0], R = s[1], h = s[2], lean = s[3] || 0, dw = s[4] || 0.16, pos = [], i;
  for (i = 0; i < n; i++) {
    var a = i / n * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
    var p0 = [Math.cos(a - dw) * R, 0, Math.sin(a - dw) * R], p1 = [Math.cos(a + dw) * R, 0, Math.sin(a + dw) * R];
    var p2 = [c * (R + 0.05), 0, sn * (R + 0.05)], tp = [c * (R - lean), h, sn * (R - lean)];
    pos.push.apply(pos, p0.concat(p1, tp, p1, p2, tp, p2, p0, tp, p0, p2, p1));
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
};

// ---------- 第 10 块：弹丸的正式模型用到的零件类型（都不用随机数；只加新名字，不改上面的旧零件）----------
// 三角面列表 → 几何体：tris 是 [[x,y,z]×3, 想要的朝向[x,y,z]]，朝向反了就翻过来；uv 按 u、v 两个轴的范围铺满一块小贴图
function c10Tris(tris, uAx, vAx) {
  var pos = [], nor = [], uv = [], lo = [1e9, 1e9], hi = [-1e9, -1e9], i, k;
  for (i = 0; i < tris.length; i++) for (k = 0; k < 3; k++) {
    var p = tris[i][k];
    lo[0] = Math.min(lo[0], p[uAx]); hi[0] = Math.max(hi[0], p[uAx]); lo[1] = Math.min(lo[1], p[vAx]); hi[1] = Math.max(hi[1], p[vAx]);
  }
  for (i = 0; i < tris.length; i++) {
    var a = tris[i][0], b = tris[i][1], c = tris[i][2], want = tris[i][3];
    var ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    if (want && nx * want[0] + ny * want[1] + nz * want[2] < 0) { var t = b; b = c; c = t; nx = -nx; ny = -ny; nz = -nz; }
    [a, b, c].forEach(function (q) {
      pos.push(q[0], q[1], q[2]); nor.push(nx / nl, ny / nl, nz / nl);
      uv.push((q[uAx] - lo[0]) / ((hi[0] - lo[0]) || 1), (q[vAx] - lo[1]) / ((hi[1] - lo[1]) || 1));
    });
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

// 平面轮廓拉出厚度（翅膀、风筝片）：pts 是 [[u, v], …]（凹的也行），plane 'xz'（u = x、v = z、厚度沿 y）或 'zy'（u = z、v = y、厚度沿 x）
function c10Prism(pts, th, plane) {
  var V = pts.map(function (p) { return new THREE.Vector2(p[0], p[1]); });
  if (THREE.ShapeUtils.isClockWise(V)) V.reverse();
  var map = plane === 'zy' ? function (u, v, w) { return [w, v, u]; } : function (u, v, w) { return [u, w, v]; };
  var up = map(0, 0, 1), dn = map(0, 0, -1), h = th / 2, tris = [], i;
  var faces = THREE.ShapeUtils.triangulateShape(V, []);
  faces.forEach(function (f) {
    var A = V[f[0]], B = V[f[1]], C = V[f[2]];
    tris.push([map(A.x, A.y, h), map(B.x, B.y, h), map(C.x, C.y, h), up]);
    tris.push([map(A.x, A.y, -h), map(B.x, B.y, -h), map(C.x, C.y, -h), dn]);
  });
  for (i = 0; i < V.length; i++) {
    var P = V[i], Q = V[(i + 1) % V.length], out = map(Q.y - P.y, P.x - Q.x, 0);
    tris.push([map(P.x, P.y, h), map(Q.x, Q.y, h), map(Q.x, Q.y, -h), out]);
    tris.push([map(P.x, P.y, h), map(Q.x, Q.y, -h), map(P.x, P.y, -h), out]);
  }
  return plane === 'zy' ? c10Tris(tris, 2, 1) : c10Tris(tris, 0, 2);
}

// 不受光照的弹丸（星星、冰棱）没有明暗：按每个面朝哪儿分成亮 / 中 / 暗几组，各组是一个零件、各自一种颜色，
// 看起来就是有棱角的宝石面。光从左上后方来（追身镜头多半从弹丸后上方看）
var C10_LIGHT = new THREE.Vector3(-0.45, 0.8, -0.4).normalize();
function c10Bucket(nx, ny, nz, n) {
  var d = nx * C10_LIGHT.x + ny * C10_LIGHT.y + nz * C10_LIGHT.z;
  if (n === 2) return d > 0 ? 0 : 1;
  return d > 0.3 ? 0 : d > -0.3 ? 1 : 2;
}
function c10Pick(g, bucket, n) {
  if (g.index) g = g.toNonIndexed();
  var pa = g.attributes.position.array, ua = g.attributes.uv ? g.attributes.uv.array : null, pos = [], nor = [], uv = [], v, k;
  for (v = 0; v < pa.length; v += 9) {
    var ux = pa[v + 3] - pa[v], uy = pa[v + 4] - pa[v + 1], uz = pa[v + 5] - pa[v + 2], wx = pa[v + 6] - pa[v], wy = pa[v + 7] - pa[v + 1], wz = pa[v + 8] - pa[v + 2];
    var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nl < 1e-9) continue;                       // 圆锥尖上退化的三角形不要
    nx /= nl; ny /= nl; nz /= nl;
    if (c10Bucket(nx, ny, nz, n) !== bucket) continue;
    for (k = 0; k < 3; k++) {
      pos.push(pa[v + k * 3], pa[v + k * 3 + 1], pa[v + k * 3 + 2]); nor.push(nx, ny, nz);
      var vi = (v / 3 + k) * 2; uv.push(ua ? ua[vi] : 0.5, ua ? ua[vi + 1] : 0.5);
    }
  }
  g.dispose();
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

// 按朝向取一组面：[第几组, 分几组, 零件类型, 尺寸, 旋转[x,y,z], 缩放[x,y,z]]（旋转、缩放在分组之前做，位置照常写在零件上）
MODEL.extraGeo.c10Lit = function (s) {
  var g = MODEL.geo(s[2], s[3]);
  if (g.index) g = g.toNonIndexed();
  var r = s[4] || [0, 0, 0], sc = s[5] || [1, 1, 1];
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(), new THREE.Quaternion().setFromEuler(new THREE.Euler(r[0], r[1], r[2])), new THREE.Vector3(sc[0], sc[1], sc[2])));
  return c10Pick(g, s[0], s[1]);
};

// 有厚度的五角星（立在 XY 平面，朝 ±Z）：[外半径, 内半径, 中心厚度的一半, 第几组, 分几组, 绕 z 转多少]
MODEL.extraGeo.c10Star = function (s) {
  var R = s[0], r = s[1], d = s[2], rz = s[5] || 0, rim = [], tris = [], i;
  for (i = 0; i < 10; i++) { var a = i * Math.PI / 5 + rz, rr = i % 2 ? r : R; rim.push([Math.sin(a) * rr, Math.cos(a) * rr, 0]); }
  for (i = 0; i < 10; i++) {
    var p = rim[i], q = rim[(i + 1) % 10], mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    tris.push([[0, 0, d], p, q, [mx, my, d * 2]]);
    tris.push([[0, 0, -d], p, q, [mx, my, -d * 2]]);
  }
  return c10Pick(c10Tris(tris, 0, 1), s[3], s[4]);
};

// 两面都看得见的薄片（翅膀、尾翼）：[宽(x), 长(z)]，躺在 XZ 平面；第三个数是 1 时是三角形（尖朝 +z）
MODEL.extraGeo.c10Card = function (s) {
  var w = s[0] / 2, d = s[1] / 2, A = [-w, 0, -d], B = [w, 0, -d], C = [w, 0, d], D = [-w, 0, d], T = [0, 0, d], up = [0, 1, 0], dn = [0, -1, 0];
  var tris = s[2] ? [[A, B, T, up], [A, B, T, dn]] : [[A, B, C, up], [A, C, D, up], [A, B, C, dn], [A, C, D, dn]];
  return c10Tris(tris, 0, 2);
};

// 鸟的外侧翅膀：根部在 x = 0，往 +x 伸出 len，前缘朝 +z；翅尖三根「手指」羽毛；[长, 宽, 厚, 镜像(-1 往 -x 伸)]
MODEL.extraGeo.c10Wing = function (s) {
  var L = s[0], C = s[1], m = s[3] || 1;
  var pts = [[0, C * 0.5], [L * 0.62, C * 0.42], [L, C * 0.18], [L * 0.8, C * 0.02], [L * 0.93, -C * 0.16], [L * 0.72, -C * 0.22], [L * 0.8, -C * 0.42], [L * 0.5, -C * 0.4], [0, -C * 0.5]];
  return c10Prism(pts.map(function (p) { return [p[0] * m, p[1]]; }), s[2], 'xz');
};

// 三棱柱（鞭炮的小炮仗）：[外接圆半径, 高]，竖着（沿 y），一个尖朝 +z；8 个三角形（'cyl' 三段要 12 个）
MODEL.extraGeo.c10Tri3 = function (s) {
  var r = s[0], pts = [0, 1, 2].map(function (i) { var a = i * Math.PI * 2 / 3; return [Math.sin(a) * r, Math.cos(a) * r]; });
  return c10Prism(pts, s[1], 'xz');
};
// 风筝的一块三角形布（立在 YZ 平面，厚度沿 x）：[y0, z0, y1, z1, y2, z2, 厚]
MODEL.extraGeo.c10Panel = function (s) { return c10Prism([[s[1], s[0]], [s[3], s[2]], [s[5], s[4]]], s[6], 'zy'); };

// 把一个尖朝 +Y 的零件（圆锥）转成尖朝 (x, y, z)：返回零件的旋转 [绕 x, 0, 绕 z]
function c10Aim(x, y, z) {
  var l = Math.sqrt(x * x + y * y + z * z) || 1; x /= l; y /= l; z /= l;
  var cg = Math.sqrt(Math.max(0, 1 - x * x)) || 1e-6;
  return [Math.atan2(z / cg, y / cg), 0, Math.asin(-x)];
}
// 从 (y0, z0) 到 (y1, z1) 的一根方块（风筝上的小龙）：截面 w（x 方向）× t
function c10Seg(y0, z0, y1, z1, w, t, c) {
  var dy = y1 - y0, dz = z1 - z0, l = Math.sqrt(dy * dy + dz * dz);
  return ['box', [w, t, l + t * 0.6], [0, (y0 + y1) / 2, (z0 + z1) / 2], c, [Math.atan2(-dy, dz), 0, 0]];
}
// 冰棱根部斜着往外长的小冰碴：第 i 根（共 3 根，120° 一根）
function c10Shard(i) {
  var a = i * Math.PI * 2 / 3 + 0.5, dx = Math.cos(a) * 0.55, dy = Math.sin(a) * 0.55, dz = 0.83, h = 0.25;
  return ['cone', [0.05, h, 4], [Math.cos(a) * 0.09 + dx * h / 2, Math.sin(a) * 0.09 + dy * h / 2, -0.17 + dz * h / 2], 0x90d0ff, c10Aim(dx, dy, dz)];
}

// ---------------- 弹丸与场地模型 ----------------
var PROJ_MODELS = {
  // 重弩箭：比普通弩箭长一半，金色尾羽
  heavybolt: [['box', [0.16, 0.16, 2.4], [0, 0, 0], 0x6a4a2a, null, null, 'wood'], ['cone', [0.2, 0.55, 4], [0, 0, 1.47], 0xc0c8d0, [Math.PI / 2, 0, 0], null, 'metal'], ['box', [0.4, 0.02, 0.32], [0, 0, -1.05], 0xffd84a], ['box', [0.02, 0.4, 0.32], [0, 0, -1.05], 0xffd84a]],
  axe: [['box', [0.1, 0.1, 1.0], [0, 0, 0], 0x7a4a2a], ['box', [0.08, 0.6, 0.5], [0, 0.2, 0.35], 0xc0c8d0]],
  // 投石车的石弹（第 10 块）：粗凿的灰石 + 两个疙瘩 + 一块崩掉的深色面；1 米左右（PROJ_ANIM.rock.maxS：画出来最大 1.25 倍）
  rock: [
    ['dodec', [0.46], [0, 0, 0], 0x8a8780, null, [1.05, 0.92, 1], 'en_rock'], ['oct', [0.24], [0.28, 0.2, 0.12], 0x96938a, [0.3, 0.5, 0], [1, 0.8, 1], 'en_rock'],
    ['oct', [0.2], [-0.24, -0.17, 0.18], 0x7e7b74, [0.2, 0.9, 0.4], null, 'en_rock'], ['oct', [0.3], [-0.05, 0.03, -0.35], 0x66645e, [0.15, 0.2, 0.4], [1, 1, 0.4], 'en_rock']
  ],
  // 灵魂：白色小光球 + 淡蓝外圈
  soul: [['ball', [0.16, 1], [0, 0, 0], 0xffffff], ['ball', [0.28, 1], [0, 0, -0.06], 0x9fdcff]],

  // ---------- 第 4 块的新武器弹丸；第 10 块换成正式模型（三角形上限见 C10_WORK §4.2，tools/tests/look_c10a.js 检查）----------
  // 都朝 +Z 飞、+Y 朝上
  // 猎隼：俯冲的游隼。棕背、奶白胸、黄喙，脸上两道深色「胡子」；两段翅膀（外段三根手指羽毛）、扇开的尾巴、两根红皮脚绊；
  // 翼展 1.1 米（返程换 falcon_b：翅膀收在身上）
  falcon: [
    ['ball', [0.2, 0], [0, 0, 0], 0x6a4a2a, null, [0.85, 0.72, 1.45], 'fur'], ['box', [0.17, 0.1, 0.27], [0, -0.07, 0.08], 0xe8dcc0, [0.12, 0, 0], null, 'ct_feather'],
    ['ball', [0.12, 0], [0, 0.07, 0.3], 0x8a6a40, null, [1, 0.95, 1.1], 'fur'],
    ['box', [0.03, 0.1, 0.05], [0.1, 0.02, 0.32], 0x2a2018, [0.25, 0, 0]], ['box', [0.03, 0.1, 0.05], [-0.1, 0.02, 0.32], 0x2a2018, [0.25, 0, 0]],
    ['cone', [0.045, 0.12, 4], [0, 0.04, 0.44], 0xe0b040, [Math.PI / 2 + 0.18, 0, 0]],
    ['box', [0.26, 0.04, 0.26], [0.15, 0.04, -0.01], 0x7a5a34, [0, 0, 0.18], null, 'fur'], ['box', [0.26, 0.04, 0.26], [-0.15, 0.04, -0.01], 0x7a5a34, [0, 0, -0.18], null, 'fur'],
    ['c10Wing', [0.3, 0.24, 0.03, 1], [0.27, 0.065, -0.02], 0x4a3420, [0, 0.2, 0.3], null, 'fur'], ['c10Wing', [0.3, 0.24, 0.03, -1], [-0.27, 0.065, -0.02], 0x4a3420, [0, -0.2, -0.3], null, 'fur'],
    ['cone', [0.13, 0.3, 4], [0, 0.02, -0.4], 0x6a4a2a, [-Math.PI / 2, 0, 0], [1, 1, 0.3], 'fur'],
    ['box', [0.02, 0.12, 0.02], [0.04, -0.17, -0.13], 0xc8302a, [0.5, 0, 0]], ['box', [0.02, 0.12, 0.02], [-0.04, -0.17, -0.13], 0xc8302a, [0.5, 0, 0]],
    ['box', [0.1, 0.04, 0.06], [0, -0.13, -0.08], 0xe0b040]
  ],
  falcon_b: [
    ['ball', [0.2, 0], [0, 0, 0], 0x6a4a2a, null, [0.85, 0.72, 1.45], 'fur'], ['box', [0.17, 0.1, 0.27], [0, -0.07, 0.08], 0xe8dcc0, [0.12, 0, 0], null, 'ct_feather'],
    ['ball', [0.12, 0], [0, 0.07, 0.3], 0x8a6a40, null, [1, 0.95, 1.1], 'fur'],
    ['box', [0.03, 0.1, 0.05], [0.1, 0.02, 0.32], 0x2a2018, [0.25, 0, 0]], ['box', [0.03, 0.1, 0.05], [-0.1, 0.02, 0.32], 0x2a2018, [0.25, 0, 0]],
    ['cone', [0.045, 0.12, 4], [0, 0.04, 0.44], 0xe0b040, [Math.PI / 2 + 0.18, 0, 0]],
    ['box', [0.07, 0.11, 0.44], [0.15, 0.04, -0.08], 0x7a5a34, [0.12, 0.12, 0], null, 'fur'], ['box', [0.07, 0.11, 0.44], [-0.15, 0.04, -0.08], 0x7a5a34, [0.12, -0.12, 0], null, 'fur'],
    ['box', [0.06, 0.04, 0.2], [0.075, 0.07, -0.33], 0x4a3420, [0.15, 0.1, 0], null, 'fur'], ['box', [0.06, 0.04, 0.2], [-0.075, 0.07, -0.33], 0x4a3420, [0.15, -0.1, 0], null, 'fur'],
    ['cone', [0.13, 0.3, 4], [0, 0.02, -0.4], 0x6a4a2a, [-Math.PI / 2, 0, 0], [1, 1, 0.3], 'fur'],
    ['box', [0.02, 0.12, 0.02], [0.04, -0.17, -0.13], 0xc8302a, [0.5, 0, 0]], ['box', [0.02, 0.12, 0.02], [-0.04, -0.17, -0.13], 0xc8302a, [0.5, 0, 0]],
    ['box', [0.1, 0.04, 0.06], [0, -0.13, -0.08], 0xe0b040]
  ],
  // 蜜蜂：黑头、毛茸茸的黄胸、椭圆的黄肚子上两道黑色环带（一圈，不是方片）、黑刺、两片淡蓝的薄翅；约 0.5 米
  bee: [
    ['oct', [0.075], [0, 0.01, 0.15], 0x2a2420, null, [1, 1, 1.1]], ['ball', [0.095, 0], [0, 0.02, 0.05], 0xffd040, null, null, 'fur'],
    ['ball', [0.11, 0], [0, -0.01, -0.1], 0xffc828, null, [1, 0.95, 1.3]],
    ['fxTube', [0.105, 0.105, 0.04, 6], [0, -0.01, -0.07], 0x2a2420, [Math.PI / 2, 0, 0]], ['fxTube', [0.092, 0.092, 0.04, 6], [0, -0.01, -0.165], 0x2a2420, [Math.PI / 2, 0, 0]],
    ['cone', [0.03, 0.07, 3], [0, -0.01, -0.275], 0x2a2420, [-Math.PI / 2, 0, 0]],
    ['c10Card', [0.26, 0.15], [0.14, 0.11, -0.02], 0xe8f4ff, [0, 0.35, 0.4], null, 'plain'], ['c10Card', [0.26, 0.15], [-0.14, 0.11, -0.02], 0xe8f4ff, [0, -0.35, -0.4], null, 'plain']
  ],
  // 星星：有厚度的金色五角星（亮 / 中 / 暗三组面，不受光照也看得出棱角）+ 后面错开 36° 的小一号星 + 白金色的芯；尖到尖 0.75 米
  star: [
    ['c10Star', [0.39, 0.17, 0.13, 0, 3], [0, 0, 0], 0xfff0a8], ['c10Star', [0.39, 0.17, 0.13, 1, 3], [0, 0, 0], 0xf0c040], ['c10Star', [0.39, 0.17, 0.13, 2, 3], [0, 0, 0], 0xb8861c],
    ['c10Star', [0.27, 0.12, 0.09, 0, 3, Math.PI / 5], [0, 0, -0.04], 0xf0c050], ['c10Star', [0.27, 0.12, 0.09, 1, 3, Math.PI / 5], [0, 0, -0.04], 0xd09a28],
    ['c10Star', [0.27, 0.12, 0.09, 2, 3, Math.PI / 5], [0, 0, -0.04], 0x8a6014],
    ['oct', [0.1], [0, 0, 0], 0xfff6c8, null, [1, 1, 1.5]]
  ],
  // 魔术飞刀：银刃 + 深色护手 + 红柄
  knife: [
    ['box', [0.08, 0.03, 0.5], [0, 0, 0.12], 0xd0d8e0, null, null, 'metal'], ['cone', [0.045, 0.14, 4], [0, 0, 0.44], 0xd0d8e0, [Math.PI / 2, 0, 0], [1, 0.4, 1], 'metal'],
    ['box', [0.22, 0.06, 0.05], [0, 0, -0.15], 0x3a3a4a], ['box', [0.06, 0.06, 0.22], [0, 0, -0.29], 0xc8302a]
  ],
  // 锡兵：圆绿底座上的玩具兵（脚在 y = -0.78：环绕的高度是脚下 + 0.8，看起来站在地上）。黑裤、红上衣、白色交叉肩带 + 金扣，
  // 黑色高筒军帽带金帽徽和红缨；右手斜举带刺刀的火枪（枪口朝前上方）
  tinman: [
    ['cyl', [0.13, 0.14, 0.04, 5], [0, -0.76, 0], 0x3a7a3a], ['box', [0.14, 0.16, 0.09], [0, -0.66, 0], 0x2a2a3a],
    ['box', [0.19, 0.19, 0.12], [0, -0.485, 0], 0xd83a3a, null, null, 'cloth'],
    ['box', [0.03, 0.25, 0.13], [0, -0.485, 0], 0xf2efe6, [0, 0, 0.62], null, 'plain'], ['box', [0.03, 0.25, 0.13], [0, -0.485, 0], 0xf2efe6, [0, 0, -0.62], null, 'plain'],
    ['box', [0.06, 0.05, 0.135], [0, -0.485, 0], 0xffd040, null, null, 'gold'],
    ['box', [0.11, 0.1, 0.1], [0, -0.34, 0], 0xf0c8a0, null, null, 'skin'], ['cyl', [0.08, 0.07, 0.17, 5], [0, -0.205, 0], 0x1a1a20],
    ['box', [0.06, 0.06, 0.02], [0, -0.22, 0.075], 0xffd040, null, null, 'gold'], ['cone', [0.03, 0.09, 3], [0, -0.075, 0], 0xd83a3a],
    ['box', [0.05, 0.17, 0.06], [0.12, -0.48, 0.02], 0xd83a3a, [-0.4, 0, 0], null, 'cloth'],
    ['box', [0.025, 0.025, 0.36], [0.15, -0.42, 0.08], 0x6a4a2a, [-0.75, 0, 0], null, 'wood'],
    ['cone', [0.02, 0.14, 4], [0.15, -0.297 + 0.68 * 0.07, 0.211 + 0.73 * 0.07], 0xc8d0da, c10Aim(0, 0.68, 0.73), null, 'metal']
  ],
  // 杂耍球：两个半球拼成的双色球 + 一圈白色腰带 + 两极各一颗对面颜色的小星（红黄 / 蓝白 / 绿紫，每次扔出去轮一种，见 PROJ_ANIM.jball.variants）
  jball: [
    ['fxHemi', [0.34, 8, 3], [0, 0, 0], 0xe8443a], ['fxHemi', [0.34, 8, 3], [0, 0, 0], 0xf0c838, [Math.PI, 0, 0]],
    ['fxTube', [0.348, 0.348, 0.07, 10], [0, 0, 0], 0xf4f0e8, null, null, 'plain'],
    ['oct', [0.1], [0, 0.32, 0], 0xf0c838, null, [1, 0.5, 1]], ['oct', [0.1], [0, -0.32, 0], 0xe8443a, null, [1, 0.5, 1]]
  ],
  jball1: [
    ['fxHemi', [0.34, 8, 3], [0, 0, 0], 0x3a7ad8], ['fxHemi', [0.34, 8, 3], [0, 0, 0], 0xe8e4dc, [Math.PI, 0, 0]],
    ['fxTube', [0.348, 0.348, 0.07, 10], [0, 0, 0], 0xf4f0e8, null, null, 'plain'],
    ['oct', [0.1], [0, 0.32, 0], 0xe8e4dc, null, [1, 0.5, 1]], ['oct', [0.1], [0, -0.32, 0], 0x3a7ad8, null, [1, 0.5, 1]]
  ],
  jball2: [
    ['fxHemi', [0.34, 8, 3], [0, 0, 0], 0x4ab04a], ['fxHemi', [0.34, 8, 3], [0, 0, 0], 0x8a5ad0, [Math.PI, 0, 0]],
    ['fxTube', [0.348, 0.348, 0.07, 10], [0, 0, 0], 0xf4f0e8, null, null, 'plain'],
    ['oct', [0.1], [0, 0.32, 0], 0x8a5ad0, null, [1, 0.5, 1]], ['oct', [0.1], [0, -0.32, 0], 0x4ab04a, null, [1, 0.5, 1]]
  ],
  // 风筝：竖在 YZ 平面（朝外的那面看得见），四块蓝白相间的三角布、背面一根竖竹骨 + 一根横竹骨，布面上一条之字形的金色小龙（红眼睛）；高 1.25 米
  kite: [
    ['c10Panel', [0.5, 0, 0.12, 0.42, 0.12, 0, 0.03], [0, 0, 0], 0x3a7ad8, null, null, 'cloth'], ['c10Panel', [0.5, 0, 0.12, -0.42, 0.12, 0, 0.03], [0, 0, 0], 0xe8eef6, null, null, 'cloth'],
    ['c10Panel', [-0.75, 0, 0.12, 0.42, 0.12, 0, 0.03], [0, 0, 0], 0xe8eef6, null, null, 'cloth'], ['c10Panel', [-0.75, 0, 0.12, -0.42, 0.12, 0, 0.03], [0, 0, 0], 0x3a7ad8, null, null, 'cloth'],
    ['tube', [0.012, 0.012, 1.25, 3], [-0.025, -0.125, 0], 0x8a6a3a, null, null, 'wood'], ['tube', [0.012, 0.012, 0.84, 3], [-0.025, 0.12, 0], 0x8a6a3a, [Math.PI / 2, 0, 0], null, 'wood'],
    c10Seg(-0.44, -0.12, -0.3, 0.08, 0.045, 0.05, 0xffc23a), c10Seg(-0.3, 0.08, -0.14, -0.1, 0.045, 0.05, 0xffc23a), c10Seg(-0.14, -0.1, -0.01, 0.08, 0.045, 0.05, 0xffc23a),
    ['box', [0.045, 0.1, 0.13], [0, 0.03, 0.12], 0xffc23a, [-0.3, 0, 0]], ['box', [0.05, 0.03, 0.03], [0, 0.05, 0.15], 0xd8302a]
  ],
  // 投枪：木杆 + 柳叶形铁头和铁箍 + 一截红布（两根飘带）+ 铁尾帽；1.75 米
  javelin: [
    ['box', [0.09, 0.09, 1.1], [0, 0, 0], 0x8a6a3a, null, null, 'wood'], ['box', [0.11, 0.11, 0.06], [0, 0, -0.58], 0x3a3a44, null, null, 'metal'],
    ['cyl', [0.055, 0.07, 0.12, 5], [0, 0, 0.6], 0x8a909a, [Math.PI / 2, 0, 0], null, 'metal'], ['oct', [1], [0, 0, 0.9], 0xc8d0d8, null, [0.085, 0.035, 0.27], 'metal'],
    ['box', [0.115, 0.115, 0.14], [0, 0, 0.44], 0xc8302a, null, null, 'cloth'],
    ['box', [0.02, 0.16, 0.05], [0.045, -0.09, 0.38], 0xc8302a, [0.6, 0, 0.25], null, 'cloth'], ['box', [0.02, 0.13, 0.05], [-0.045, -0.08, 0.4], 0xd8443a, [0.8, 0, -0.25], null, 'cloth']
  ],
  // 象棋「马」：两层倒角的圆底座（中间一道深色木圈）+ 马脖子 + 马头（朝 +Z）+ 两只耳朵 + 深色鬃毛 + 眼睛、鼻孔；
  // 底座底面在 y = -0.15（落地时弹丸在地面上 0.15 米，正好立在地上），立着跳
  chesshorse: [
    ['cyl', [0.38, 0.4, 0.11, 8], [0, -0.095, 0], 0xd8b080, null, null, 'wood'], ['cyl', [0.36, 0.38, 0.04, 8], [0, -0.02, 0], 0xa07a4a, null, null, 'wood'],
    ['cyl', [0.27, 0.33, 0.1, 8], [0, 0.05, 0], 0xc8a070, null, null, 'wood'],
    ['box', [0.22, 0.45, 0.25], [0, 0.32, -0.025], 0xd8b080, [-0.25, 0, 0], null, 'wood'], ['box', [0.2, 0.19, 0.4], [0, 0.575, 0.125], 0xd8b080, [0.2, 0, 0], null, 'wood'],
    ['cone', [0.05, 0.13, 4], [0.065, 0.72, -0.03], 0xc8a070, null, null, 'wood'], ['cone', [0.05, 0.13, 4], [-0.065, 0.72, -0.03], 0xc8a070, null, null, 'wood'],
    ['box', [0.075, 0.45, 0.1], [0, 0.4, -0.175], 0x6a4a2a, [-0.25, 0, 0], null, 'wood'],
    ['box', [0.21, 0.035, 0.035], [0, 0.62, 0.2], 0x2a2018, [0.2, 0, 0]], ['box', [0.08, 0.03, 0.02], [0, 0.53, 0.325], 0x2a2018, [0.2, 0, 0]]
  ],
  // 冰棱：六棱的冰晶（亮 / 中 / 暗三组面，不受光照）+ 短的后尖 + 根部一圈白霜 + 三根斜着长出来的小冰碴；1.1 米
  icicle: [
    ['c10Lit', [0, 3, 'cone', [0.13, 0.85, 6], [Math.PI / 2, 0, 0]], [0, 0, 0.2], 0xa8dcff], ['c10Lit', [1, 3, 'cone', [0.13, 0.85, 6], [Math.PI / 2, 0, 0]], [0, 0, 0.2], 0x6ab4ec],
    ['c10Lit', [2, 3, 'cone', [0.13, 0.85, 6], [Math.PI / 2, 0, 0]], [0, 0, 0.2], 0x3a78c0],
    ['c10Lit', [0, 3, 'cone', [0.13, 0.22, 6], [-Math.PI / 2, 0, 0]], [0, 0, -0.335], 0x98d0f8], ['c10Lit', [1, 3, 'cone', [0.13, 0.22, 6], [-Math.PI / 2, 0, 0]], [0, 0, -0.335], 0x5aa4e0],
    ['c10Lit', [2, 3, 'cone', [0.13, 0.22, 6], [-Math.PI / 2, 0, 0]], [0, 0, -0.335], 0x2e68a8],
    ['fxTube', [0.145, 0.145, 0.05, 8], [0, 0, -0.225], 0xc8e8ff, [Math.PI / 2, 0, 0]],
    c10Shard(0), c10Shard(1), c10Shard(2)
  ],
  // 弹弓石子：灰石头 + 一块浅色的崩口（碎片也用它，缩到 0.6）；0.6 米
  pebble: [['dodec', [0.3], [0, 0, 0], 0x9a958a, null, null, 'rock'], ['oct', [0.13], [0.12, 0.17, 0.1], 0xc8c2b4, [0.4, 0.3, 0], [1, 0.6, 1], 'rock']],
  // 窜天猴：红纸筒 + 金箍 + 两道斜缠的金纸条 + 绿色尖头 + 尾部三片绿纸翼 + 细竹尾
  skyrocket: [
    ['cyl', [0.12, 0.12, 0.6, 6], [0, 0, 0], 0xd83a2a, [Math.PI / 2, 0, 0], null, 'cloth'], ['fxTube', [0.13, 0.13, 0.06, 6], [0, 0, 0.2], 0xffc23a, [Math.PI / 2, 0, 0], null, 'gold'],
    ['fxTube', [0.126, 0.126, 0.035, 6], [0, 0, 0.0], 0xffd040, [Math.PI / 2 + 0.45, 0, 0], null, 'gold'], ['fxTube', [0.126, 0.126, 0.035, 6], [0, 0, -0.16], 0xffd040, [Math.PI / 2 + 0.45, 0, 0], null, 'gold'],
    ['cone', [0.12, 0.22, 6], [0, 0, 0.41], 0x4ab04a, [Math.PI / 2, 0, 0]], ['box', [0.03, 0.03, 0.8], [0.12, 0, -0.55], 0xc8a060, null, null, 'wood'],
    ['c10Card', [0.14, 0.16, 1], [0, 0.19, -0.24], 0x4ab04a, [0, 0, Math.PI / 2]], ['c10Card', [0.14, 0.16, 1], [-0.165, -0.095, -0.24], 0x4ab04a, [0, 0, Math.PI / 2 + 2.094]],
    ['c10Card', [0.14, 0.16, 1], [0.165, -0.095, -0.24], 0x4ab04a, [0, 0, Math.PI / 2 + 4.189]]
  ],
  // 平底锅（飞斧处理的场地模型，PROJ_ANIM.pan.flat：悬停时平着转）：黑铁锅 + 锅沿 + 木柄 + 荷包蛋
  pan: [
    ['cyl', [0.5, 0.46, 0.06, 10], [0, 0, 0], 0x2a2a30, null, null, 'metal'], ['torus', [0.48, 0.04, 4, 10], [0, 0.04, 0], 0x3a3a44, [Math.PI / 2, 0, 0], null, 'metal'],
    ['box', [0.08, 0.06, 0.6], [0, 0.03, -0.8], 0x7a4a2a, null, null, 'wood'], ['cyl', [0.18, 0.18, 0.02, 8], [0.08, 0.04, 0.05], 0xece8dc], ['ball', [0.08, 0], [0.09, 0.075, 0.06], 0xffc030]
  ],
  // 颜料桶（扔出去的样子）：铁桶 + 提手 + 桶口的颜料 + 桶边流下来的红 / 蓝 / 黄三道颜料（和图标一样）
  bucket: [
    ['cyl', [0.25, 0.2, 0.4, 8], [0, 0, 0], 0xb0b4bc, null, null, 'metal'], ['torus', [0.23, 0.018, 3, 6], [0, 0.2, 0], 0x5a5e66, null, [1, 0.85, 1], 'metal'],
    ['cyl', [0.235, 0.235, 0.02, 8], [0, 0.19, 0], 0xd85a8a],
    ['box', [0.05, 0.16, 0.025], [Math.sin(0.4) * 0.245, 0.11, Math.cos(0.4) * 0.245], 0xd8443a, [0, 0.4, 0], null, 'plain'],
    ['box', [0.05, 0.12, 0.025], [Math.sin(2.5) * 0.247, 0.13, Math.cos(2.5) * 0.247], 0x3a8ad8, [0, 2.5, 0], null, 'plain'],
    ['box', [0.05, 0.2, 0.025], [Math.sin(4.3) * 0.243, 0.09, Math.cos(4.3) * 0.243], 0xf0d040, [0, 4.3, 0], null, 'plain']
  ],
  // 一挂鞭炮：八个小红炮仗（三棱柱，每个一道金纸箍）挂在引线上，顶上一个红绳结，最下面引信头亮着
  crackers: [
    ['tube', [0.012, 0.012, 0.8, 3], [0, 0, 0], 0xd8c08a],
    ['c10Tri3', [0.045, 0.15], [0.055, 0.3, 0], 0xc8302a, [0, 0, 0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [0.055, 0.3, 0], 0xffd040, [0, 0, 0.45]],
    ['c10Tri3', [0.045, 0.15], [-0.055, 0.215, 0], 0xc8302a, [0, 0, -0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [-0.055, 0.215, 0], 0xffd040, [0, 0, -0.45]],
    ['c10Tri3', [0.045, 0.15], [0.055, 0.13, 0], 0xc8302a, [0, 0, 0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [0.055, 0.13, 0], 0xffd040, [0, 0, 0.45]],
    ['c10Tri3', [0.045, 0.15], [-0.055, 0.045, 0], 0xc8302a, [0, 0, -0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [-0.055, 0.045, 0], 0xffd040, [0, 0, -0.45]],
    ['c10Tri3', [0.045, 0.15], [0.055, -0.04, 0], 0xc8302a, [0, 0, 0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [0.055, -0.04, 0], 0xffd040, [0, 0, 0.45]],
    ['c10Tri3', [0.045, 0.15], [-0.055, -0.125, 0], 0xc8302a, [0, 0, -0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [-0.055, -0.125, 0], 0xffd040, [0, 0, -0.45]],
    ['c10Tri3', [0.045, 0.15], [0.055, -0.21, 0], 0xc8302a, [0, 0, 0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [0.055, -0.21, 0], 0xffd040, [0, 0, 0.45]],
    ['c10Tri3', [0.045, 0.15], [-0.055, -0.295, 0], 0xc8302a, [0, 0, -0.45]], ['fxTube', [0.046, 0.046, 0.035, 3], [-0.055, -0.295, 0], 0xffd040, [0, 0, -0.45]],
    ['oct', [0.05], [0, 0.41, 0], 0xd8302a, null, [1, 1.3, 1]], ['tet', [0.04], [0, -0.41, 0], 0xffd040]
  ]

};

// 不受光照的弹丸（'add' = 叠加发光）
var PROJ_LOOK = { soul: 'unlit', star: 'unlit', icicle: 'unlit' };

// 建好以后整体转一下的弹丸：[绕 x, 绕 z]（弧度）
var PROJ_ROT = {};

// 弹丸的动作（第 4 块，weapons.js 读，没写的用默认值）：
//   spin 每秒绕 x 轴翻滚多少弧度；roll 每秒绕飞行方向转多少弧度；flap 扇翅膀的幅度（rz = sin(t × 28) × flap）；
//   back 回程换成哪种弹丸；variants 有几种配色（kind、kind1、kind2…，每次扔出去轮一种）；
//   flat 悬停时平着转（平底锅）；orb 圆的弹丸（超武加一圈金色光环）；maxS 画出来最大放大多少倍（第 10 块：投石车的石弹）
var PROJ_ANIM = {
  falcon: { flap: 0.35, back: 'falcon_b' },
  bee: { flap: 0.5 },
  star: { spin: 6, orb: true },
  jball: { variants: 3, orb: true },
  pan: { flat: true },
  // 第 10 块：maxS 画出来最大放大多少倍（只管模型大小，命中半径、爆炸范围照旧）
  rock: { maxS: 1.25 }
};

// 超武自己的弹丸零件（可选，按弹丸种类；没有的照旧把原模型染成金色）
var PROJ_EVO = {};

// 颜料桶的七种颜色（weapons_fx.js 画颜料地，enemies.js 给踩进去的敌人染色）
var PAINT_C = [0xd8443a, 0xf08a2a, 0xf0d040, 0x5fbf4a, 0x3a8ad8, 0x6a4ac8, 0xd85a8a];

function projGeo(kind, parts) {
  var g = MODEL.build(parts || PROJ_MODELS[kind], parts ? false : undefined), r = PROJ_ROT[kind];
  if (r) { if (r[0]) g.rotateX(r[0]); if (r[1]) g.rotateZ(r[1]); }
  return g;
}

// 弹丸核心光晕：[颜色, 大小, 亮度, 用武器颜色]
var PROJ_GLOW = {
  soul: [0x8fd8ff, 1.3, 0.6],
  heavybolt: [0xfff0c8, 1.0, 0.45],
  // 第 4 块（R-W1：每种颜色至少一个通道 < 0xe0）
  // 第 10 块：猎隼、蜜蜂的光晕小一点（看得见身子），冰棱的大一点、颜色深一点（不把冰晶冲成白色），石子加一个
  falcon: [0xfff0c8, 0.6, 0.3],
  falcon_b: [0xfff0c8, 0.6, 0.3],
  bee: [0xffd040, 0.55, 0.3],
  star: [0xffd860, 1.2, 0.55],
  icicle: [0x7ac8f8, 0.9, 0.32],
  skyrocket: [0xff8a3a, 0.9, 0.5],
  pebble: [0xfff0d0, 0.5, 0.25]
};

// 快速弹丸的拖尾（沿真实飞行路线的发光带）：[颜色, 长度（秒 × 速度）, 头部半宽, 只在回程画]
var PROJ_TAIL = {
  heavybolt: [0xfff0c8, 0.05, 0.19],
  soul: [0x9fdcff, 0.12, 0.12],
  // 第 4 块
  falcon: [0xfff0c8, 0.06, 0.15],
  falcon_b: [0xfff0c8, 0.06, 0.15],
  star: [0xffd860, 0.12, 0.28],
  knife: [0xd8dee8, 0.045, 0.12],
  javelin: [0xd8cfb0, 0.05, 0.14],
  icicle: [0xbfe8ff, 0.1, 0.18],
  skyrocket: [0xffa040, 0.13, 0.18],
  // 第 10 块：石子飞得快，也拖一条短尾巴
  pebble: [0xe0d8c8, 0.07, 0.12]
};

// 场地模型的零件（第 4 块：墓烛、捕兽夹张开 / 合上；look_c4 数零件和顶点）
var ZONE_PARTS = {
  // 墓烛：铁烛台 + 粗白蜡烛 + 一圈烛泪 + 烛芯（火苗是 weapons_fx.js 画的发光）
  candle: [
    ['cyl', [0.3, 0.32, 0.06, 8], [0, 0.03, 0], 0x3a3a46, null, null, 'metal'], ['cyl', [0.18, 0.18, 0.5, 8], [0, 0.31, 0], 0xece8dc],
    ['torus', [0.17, 0.045, 3, 10], [0, 0.52, 0], 0xe0dccc, [Math.PI / 2, 0, 0]], ['box', [0.03, 0.09, 0.03], [0, 0.6, 0], 0x2a2420],
    // 第 10 块：三道顺着蜡烛流下来的烛泪
    ['cone', [0.04, 0.14, 3], [Math.sin(0.5) * 0.19, 0.44, Math.cos(0.5) * 0.19], 0xd8d0bc, [Math.PI, 0, 0]],
    ['cone', [0.035, 0.1, 3], [Math.sin(2.6) * 0.19, 0.46, Math.cos(2.6) * 0.19], 0xd8d0bc, [Math.PI, 0, 0]],
    ['cone', [0.04, 0.18, 3], [Math.sin(4.4) * 0.19, 0.42, Math.cos(4.4) * 0.19], 0xd8d0bc, [Math.PI, 0, 0]]
  ],
  // 捕兽夹（张开）：铁圈 + 一圈往外张的铁牙 + 弹簧 + 一截铁链
  trap: [
    ['torus', [0.45, 0.05, 3, 12], [0, 0.04, 0], 0x6a6e76, [Math.PI / 2, 0, 0], null, 'metal'], ['fxTeeth', [10, 0.43, 0.16, -0.14, 0.15], [0, 0.04, 0], 0xa0a4ac, null, null, 'metal'],
    ['box', [0.16, 0.06, 0.1], [0, 0.04, -0.5], 0x4a4e56, null, null, 'metal'],
    ['torus', [0.06, 0.015, 3, 4], [0, 0.04, -0.62], 0x5a5e66, [0, Math.PI / 2, 0]], ['torus', [0.06, 0.015, 3, 4], [0, 0.04, -0.72], 0x5a5e66, [Math.PI / 2, 0, 0]],
    ['torus', [0.06, 0.015, 3, 4], [0, 0.04, -0.82], 0x5a5e66, [0, Math.PI / 2, 0]]
  ],
  // 捕兽夹（合上）：铁牙竖起来往中间合
  trapShut: [
    ['torus', [0.45, 0.05, 3, 12], [0, 0.04, 0], 0x6a6e76, [Math.PI / 2, 0, 0], null, 'metal'], ['fxTeeth', [10, 0.43, 0.3, 0.32, 0.15], [0, 0.04, 0], 0xa0a4ac, null, null, 'metal'],
    ['box', [0.16, 0.06, 0.1], [0, 0.04, -0.5], 0x4a4e56, null, null, 'metal'],
    ['torus', [0.06, 0.015, 3, 4], [0, 0.04, -0.62], 0x5a5e66, [0, Math.PI / 2, 0]], ['torus', [0.06, 0.015, 3, 4], [0, 0.04, -0.72], 0x5a5e66, [Math.PI / 2, 0, 0]],
    ['torus', [0.06, 0.015, 3, 4], [0, 0.04, -0.82], 0x5a5e66, [0, Math.PI / 2, 0]]
  ]
};

var ZONE_MODELS = null;
function buildZoneModels() {
  ZONE_MODELS = {
    // 火药桶：木桶 + 铁箍 + 引信
    mine: MODEL.build([
      ['cyl', [0.34, 0.38, 0.62, 8], [0, 0.31, 0], 0x8a5a2a, null, null, 'wood'],
      ['cyl', [0.395, 0.395, 0.07, 8], [0, 0.12, 0], 0x3a3a46, null, null, 'metal'],
      ['cyl', [0.36, 0.36, 0.07, 8], [0, 0.5, 0], 0x3a3a46, null, null, 'metal'],
      ['cyl', [0.3, 0.3, 0.04, 8], [0, 0.63, 0], 0x6a4a22, null, null, 'wood'],
      ['box', [0.2, 0.2, 0.02], [0, 0.32, 0.37], 0xd93a2a],
      ['cyl', [0.035, 0.035, 0.22, 4], [0.1, 0.74, 0], 0xd8c08a, [0, 0, -0.3]]
    ]),
    disc: FX.getGeo('disc'),
    spike: MODEL.build([['cone', [0.8, 3.5, 5], [0, 1.75, 0], 0x5a3a1a], ['cone', [0.4, 1.5, 5], [0.5, 0.75, 0.2], 0x3a8a2a]])
  };
  for (var k in ZONE_PARTS) ZONE_MODELS[k] = MODEL.build(ZONE_PARTS[k]);
}
