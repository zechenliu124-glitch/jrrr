'use strict';
// ============================================================
//  低多边形模型：把若干简单几何体合并成一个带顶点颜色的几何体
//  （同一种敌人共用一个几何体，用 InstancedMesh 批量绘制）
// ============================================================
var MODEL = {};

MODEL.mat = null;      // 共用材质：顶点颜色 + 像素图集 + 平滑的兰伯特光照
MODEL.flatMat = null;
MODEL.cache = {};
MODEL.extraGeo = {};

// 平滑着色：圆柱、球是圆润的；细分为 0 的多面体（dodec、ball、oct、tet）和方块本身就是一个个平面
MODEL.material = function () {
  if (!MODEL.mat) MODEL.mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: TEX.atlas });
  return MODEL.mat;
};

// 有棱角的材质：不管几何体法线，每个三角面单独打光（逐像素，稍贵一点）
MODEL.flatMaterial = function () {
  if (!MODEL.flatMat) MODEL.flatMat = new THREE.MeshPhongMaterial({ vertexColors: true, map: TEX.atlas, flatShading: true, specular: 0x000000, shininess: 0 });
  return MODEL.flatMat;
};

// part: [类型, 尺寸数组, 位置[x,y,z], 颜色, 旋转[x,y,z]（可选）, 缩放（可选）, 贴图名（可选，不写就按颜色猜）, 平面投影（可选）]
// 类型: box[w,h,d] cyl[rTop,rBot,h,seg] tube[rTop,rBot,h,seg]（无盖） cone[r,h,seg] ball[r,detail] oct[r] dodec[r] tet[r]
//       sphere[r,wSeg,hSeg]（平滑球） torus[r,tube,radialSeg,tubularSeg]
// 平面投影：数字 s（0~1）。每个三角面沿自己的朝向投影贴图，整块小贴图盖住零件直径的 1/s，
//          面会变成有棱角的平面着色（树冠、石头用：没有球面贴图的拉伸和接缝）
MODEL.geo = function (type, s) {
  switch (type) {
    case 'sphere': return new THREE.SphereGeometry(s[0], s[1] || 8, s[2] || 6);
    case 'torus': return new THREE.TorusGeometry(s[0], s[1], s[2] || 4, s[3] || 10);
    case 'box': return new THREE.BoxGeometry(s[0], s[1], s[2]);
    case 'cyl': return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 6);
    case 'tube': return new THREE.CylinderGeometry(s[0], s[1], s[2], s[3] || 6, 1, true);   // 不带盖的圆柱（树干、树枝）
    case 'cone': return new THREE.ConeGeometry(s[0], s[1], s[2] || 6);
    case 'ball': return new THREE.IcosahedronGeometry(s[0], s[1] || 0);
    case 'oct': return new THREE.OctahedronGeometry(s[0], 0);
    case 'dodec': return new THREE.DodecahedronGeometry(s[0], 0);
    case 'tet': return new THREE.TetrahedronGeometry(s[0], 0);
  }
  // 其他文件可以在 MODEL.extraGeo 里注册新的零件类型：MODEL.extraGeo.xxx = function (s) { return geometry; }
  if (MODEL.extraGeo[type]) return MODEL.extraGeo[type](s);
  throw new Error('unknown part ' + type);
};

MODEL.build = function (parts, jitter) {
  var pos = [], nor = [], col = [], uvs = [];
  var m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(1, 1, 1);
  var c = new THREE.Color();
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i];
    var g = MODEL.geo(p[0], p[1]);
    if (g.index) g = g.toNonIndexed();
    var r = p[4] || [0, 0, 0];
    e.set(r[0], r[1], r[2]);
    q.setFromEuler(e);
    m.compose(new THREE.Vector3(p[2][0], p[2][1], p[2][2]), q, p[5] ? new THREE.Vector3(p[5][0], p[5][1], p[5][2]) : sc);
    g.applyMatrix4(m);
    var pa = g.attributes.position.array, na = g.attributes.normal.array, ua = g.attributes.uv ? g.attributes.uv.array : null;
    var tile = TEX.tileUV(p[6] || TEX.guess(p[3]));
    var planar = p[7] || 0, bc = null, br = 1;
    if (planar) { g.computeBoundingSphere(); bc = g.boundingSphere.center; br = g.boundingSphere.radius || 1; }
    c.set(p[3]);
    for (var v = 0; v < pa.length; v += 9) {
      // 每个三角面颜色轻微抖动，显得更“手工”
      var j = jitter === false ? 0 : (Math.random() - 0.5) * (jitter || 0.06);
      var fn = null, ft = null, fb = null;
      if (planar) {
        // 三角面法线 + 面内的两个方向
        var ux = pa[v + 3] - pa[v], uy = pa[v + 4] - pa[v + 1], uz = pa[v + 5] - pa[v + 2];
        var wx = pa[v + 6] - pa[v], wy = pa[v + 7] - pa[v + 1], wz = pa[v + 8] - pa[v + 2];
        var nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx, nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
        fn = [nx / nl, ny / nl, nz / nl];
        if (Math.abs(fn[1]) > 0.9) ft = [1, 0, 0];
        else { var tl = Math.sqrt(fn[2] * fn[2] + fn[0] * fn[0]) || 1; ft = [fn[2] / tl, 0, -fn[0] / tl]; }
        fb = [fn[1] * ft[2] - fn[2] * ft[1], fn[2] * ft[0] - fn[0] * ft[2], fn[0] * ft[1] - fn[1] * ft[0]];
      }
      for (var k = 0; k < 3; k++) {
        var o = v + k * 3;
        pos.push(pa[o], pa[o + 1], pa[o + 2]);
        if (fn) nor.push(fn[0], fn[1], fn[2]);
        else nor.push(na[o], na[o + 1], na[o + 2]);
        col.push(clamp(c.r + j, 0, 1), clamp(c.g + j, 0, 1), clamp(c.b + j, 0, 1));
        var uu, vv;
        if (fn) {
          var dx = pa[o] - bc.x, dy = pa[o + 1] - bc.y, dz = pa[o + 2] - bc.z;
          uu = clamp(0.5 + (dx * ft[0] + dy * ft[1] + dz * ft[2]) / (2 * br) * planar, 0, 1);
          vv = clamp(0.5 + (dx * fb[0] + dy * fb[1] + dz * fb[2]) / (2 * br) * planar, 0, 1);
        } else {
          var vi = (v / 3 + k) * 2;
          uu = ua ? ua[vi] : 0.5; vv = ua ? ua[vi + 1] : 0.5;
          // 只把超出 0~1 的坐标折回去；正好等于 1 的边不能折成 0（否则整个面只显示一个像素）
          if (uu < 0 || uu > 1) uu -= Math.floor(uu);
          if (vv < 0 || vv > 1) vv -= Math.floor(vv);
        }
        uvs.push(tile.u + TEX.TILE * (0.03 + uu * 0.94), tile.v + TEX.TILE * (0.03 + vv * 0.94));
      }
    }
    g.dispose();
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  out.computeBoundingSphere();
  return out;
};

// 把几个（非索引）几何体拼成一个，属性以第一个为准；静态场景物体合并成一次绘制
MODEL.merge = function (geos) {
  var names = Object.keys(geos[0].attributes), out = new THREE.BufferGeometry();
  names.forEach(function (n) {
    var size = geos[0].attributes[n].itemSize, total = 0;
    geos.forEach(function (g) { total += g.attributes[n].count * size; });
    var arr = new Float32Array(total), off = 0;
    geos.forEach(function (g) { arr.set(g.attributes[n].array, off); off += g.attributes[n].count * size; });
    out.setAttribute(n, new THREE.BufferAttribute(arr, size));
  });
  out.computeBoundingSphere();
  return out;
};

MODEL.get = function (name, parts) {
  if (!MODEL.cache[name]) MODEL.cache[name] = MODEL.build(parts);
  return MODEL.cache[name];
};

MODEL.mesh = function (parts) {
  return new THREE.Mesh(MODEL.build(parts), MODEL.material());
};

// 实例化网格：同一种东西大量绘制
MODEL.instanced = function (geo, cap, scene, mat) {
  var im = new THREE.InstancedMesh(geo, mat || MODEL.material(), cap);
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.frustumCulled = false;
  // 颜色缓冲按当前 count 分配，所以要在把 count 设为 0 之前填好（默认是黑色）
  var white = new THREE.Color(1, 1, 1);
  for (var i = 0; i < cap; i++) im.setColorAt(i, white);
  im.count = 0;
  im.instanceColor.setUsage(THREE.DynamicDrawUsage);
  if (scene) scene.add(im);
  return im;
};
