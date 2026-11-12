'use strict';
// ============================================================
//  新做的 7 位骑士（第 9 块）：见习、敲钟、伙夫、小丑、画盾、养蜂、渔夫
//  只往 CHAR_MODELS.defs 里加定义；零件小工具、体型、颜色都用 models_chars.js 里的（只读）
//  拿在手上、背在背上的东西都放在 gearL / gearR / pack 上，坐骑可以单独藏起来
// ============================================================

// ---------------- 新做骑士用的像素小贴图 ----------------
// 只往图集末尾追加；不用共享的随机数 r()（换成本地整数哈希），旧贴图一个像素都不变
(function () {
  var add = function (name, fn) { try { TEX.addTile(name, fn); } catch (e) { /* 图集满了就退回默认贴图 */ } };
  var hash = function (x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; };
  // 彩衣（彩色）：红黄菱格 + 深色细缝
  add('kn_motley', function (x, y) {
    var u = x + y, v = x - y + 16, n = hash(x, y) % 9 - 4;
    if (u % 8 === 0 || v % 8 === 0) return [96, 40, 52];
    return (((u >> 3) + (v >> 3)) & 1) ? [216 + n, 52 + n, 52 + n] : [238 + n, 192 + n, 52 + n];
  });
  // 画师罩衣（彩色）：米色布 + 竖褶 + 零星的红蓝黄小颜料点
  add('kn_paint', function (x, y) {
    var f = Math.round(Math.sin(x * 1.15) * 12), k = hash(x >> 1, y >> 1) % 19;
    if (y >= 14) return [176, 164, 140];
    if (k === 0) return [206, 50, 50];
    if (k === 1) return [54, 98, 214];
    if (k === 2) return [234, 186, 40];
    return [228 + f, 216 + f, 188 + f];
  });
  // 颜料泼溅（彩色）：米色底上几大团红、蓝、黄、绿，下面挂着滴痕
  add('kn_splat', function (x, y) {
    var S = [[4, 4, 3.2, [210, 52, 52]], [11, 5, 2.8, [52, 100, 216]], [5, 11, 2.6, [236, 190, 40]], [12, 12, 2.3, [72, 168, 72]]];
    for (var i = 0; i < S.length; i++) {
      var s = S[i], dx = x - s[0], dy = y - s[1], j = (hash(x, y) % 5) - 2;
      if (dx * dx + dy * dy <= s[2] * s[2] + j) return s[3];
      // 滴痕：团子正下方一条细线
      if (x === s[0] + (i & 1) && y > s[1] && y <= s[1] + s[2] + 3) return s[3];
    }
    return [232, 220, 192];
  });
  // 草编（灰度）：一圈圈横向的草绳 + 错开的捆线
  add('kn_coil', function (x, y) {
    var b = y % 4, off = ((y >> 2) & 1) * 3;
    var v = b === 0 ? 250 : b === 1 ? 234 : b === 2 ? 212 : 140;
    if (b < 3 && (x + off) % 6 === 0) v -= 48;
    return v + (hash(x, y) % 9) - 4;
  });
  // 柳条编（灰度）：一上一下的编织
  add('kn_wicker', function (x, y) {
    var lx = x & 3, ly = y & 3, hor = (((x >> 2) + (y >> 2)) & 1) === 0, t = hor ? ly : lx;
    var v = t === 0 ? 150 : t === 3 ? 188 : t === 1 ? 246 : 230;
    if ((hor ? lx : ly) === 0) v -= 34;
    return v;
  });
  // 渔网（灰度）：斜着的菱形网眼，绳结亮一点
  add('kn_net', function (x, y) {
    var a = (x + y) % 6, b = (x - y + 18) % 6;
    if (a === 0 && b === 0) return 255;
    if (a === 0 || b === 0) return 226;
    return 72;
  });
})();

// 新做骑士：每个定义只是零件表，几何体照旧按角色缓存（CHAR_MODELS.geoCache）
(function () {
  var P = CHP, PI = Math.PI;

  // ---- 见习骑士：马厩里的小伙子第一次出门。头盔大一号、绗缝棉甲、白罩袍上缝着蓝狮子、圆木盾、短剑、绿短斗篷 ----
  CHD.squire = {
    body: { scale: 0.97 },
    make: function (B) {
      var QUILT = 0xb89a6a, TABARD = 0xe6dcc0, HAIR = 0xe0c060, y = -B.fore * 0.45;
      return CHK.join(
        CHK.legs(CHK.leg(B, { thigh: QUILT, thighT: 'ch_fold', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 0.92 })),
        CHK.arms(B, { upper: QUILT, upperT: 'ch_fold', fore: QUILT, foreT: 'ch_fold', cuff: LEATHER, cuffT: 'ch_leather', hand: LEATHER_D, w: 0.9 }),
        {
          pelvis: CHK.hips(B, { hips: QUILT, hipsT: 'ch_fold', belt: LEATHER_D, buckle: 0xa8aeb6, skirt: TABARD, skirtLen: 0.32 }),
          chest: CHK.torso(B, { waist: QUILT, waistT: 'ch_fold', chest: QUILT, chestT: 'ch_fold', flat: true, cw: 0.92 }).concat([
            // 罩袍前后两片 + 胸口的蓝狮子补丁（金色小球是狮子头）
            P.box([0.3, 0.38, 0.02], [0, 0.235, 0.138], TABARD, 'ch_fold', [0.1, 0, 0]),
            P.box([0.3, 0.38, 0.02], [0, 0.235, -0.148], TABARD, 'ch_fold', [-0.1, 0, 0]),
            P.box([0.1, 0.11, 0.012], [0.06, 0.29, 0.156], 0x3a5ac8, 'cloth', [0.1, 0, 0]),
            P.knob(0.022, [0.06, 0.31, 0.166], GOLD, 'gold')
          ]),
          head: CHK.head(SKIN).concat([
            P.box([0.022, 0.02, 0.01], [0.055, 0.19, 0.119], 0xc8805a, 'plain'),
            P.box([0.022, 0.02, 0.01], [-0.055, 0.19, 0.119], 0xc8805a, 'plain'),
            // 帽檐下面露出来的稻草色头发
            P.box([0.035, 0.07, 0.13], [0.105, 0.29, -0.02], HAIR, 'ch_fold'),
            P.box([0.035, 0.07, 0.13], [-0.105, 0.29, -0.02], HAIR, 'ch_fold'),
            P.box([0.23, 0.17, 0.12], [0, 0.21, -0.1], HAIR, 'ch_fold'),
            // 大一号的铁锅盔：宽帽檐 + 圆顶，往后歪
            P.cyl([0.24, 0.24, 0.025, 12], [0, 0.325, 0], STEEL, 'ch_plate', [-0.12, 0, 0]),
            P.lathe([10, 0.15, 0, 0.145, 0.06, 0.11, 0.12, 0, 0.15], [0, 0.33, -0.005], STEEL, 'ch_plate', [-0.12, 0, 0]),
            P.p('torus', [0.15, 0.012, 4, 12], [0, 0.338, -0.004], STEEL_D, 'metal', [PI / 2 - 0.12, 0, 0])
          ]),
          // 左前臂外侧的圆木盾：铁边 + 铁盾心
          gearL: [
            P.cyl([0.19, 0.19, 0.04, 12], [0.1, y, 0.02], 0x8a5a2a, 'wood', [0, 0, PI / 2]),
            P.p('torus', [0.19, 0.015, 4, 14], [0.1, y, 0.02], STEEL_D, 'metal', [0, PI / 2, 0]),
            P.knob(0.055, [0.125, y, 0.02], STEEL, 'ch_plate', [0.6, 1, 1]),
            P.box([0.012, 0.3, 0.03], [0.122, y, 0.02], STEEL_D, 'metal')
          ],
          gearR: CHK.held(B, 0.5, CHK.sword(0xe6ecf2, 0xa8aeb6, LEATHER, 0.7)),
          cape: CHK.cape(0x3f7a34, 0.55, 0.4, 0.46)
        });
    }
  };

  // ---- 敲钟骑士：大教堂的敲钟人，头盔就是一口钟。棕色长袍罩锁子甲、草绳腰带、背上一口大铜钟、手摇铃 ----
  CHD.bellringer = {
    body: { sh: 0.27 },
    make: function (B) {
      var ROBE = 0x6a4a30, MAIL = 0x8a929c, BRONZE = 0xc8963a, BRONZE_D = 0xa8762a, ROPE = 0xc8b080;
      return CHK.join(
        CHK.legs(CHK.leg(B, { thigh: ROBE, thighT: 'ch_fold', shin: MAIL, shinT: 'ch_chain', boot: LEATHER_D, cuff: LEATHER_D, w: 1.02 })),
        CHK.arms(B, { upper: ROBE, upperT: 'ch_fold', fore: MAIL, foreT: 'ch_chain', cuff: ROBE, cuffT: 'ch_fold', hand: LEATHER, w: 1.05 }),
        {
          pelvis: CHK.hips(B, { hips: MAIL, hipsT: 'ch_chain', belt: ROPE, beltT: 'cloth', skirt: ROBE, skirtLen: 0.62, skirtW: 0.3 }).concat([
            P.box([0.025, 0.24, 0.025], [0.075, -0.07, 0.15], ROPE, 'cloth', [-0.08, 0, 0.05]),
            P.box([0.025, 0.2, 0.025], [0.105, -0.05, 0.148], ROPE, 'cloth', [-0.08, 0, -0.08])
          ]),
          chest: CHK.torso(B, { waist: ROBE, waistT: 'ch_fold', chest: ROBE, chestT: 'ch_fold', flat: true, gorget: MAIL, gorgetT: 'ch_chain' }).concat([
            // 后颈上叠着的兜帽 + 背钟的两条皮带
            P.ball(0.13, [0, 0.39, -0.12], 0x5a3e28, 'ch_fold', [1.5, 0.6, 1], null, [6, 4]),
            P.box([0.05, 0.42, 0.03], [0.13, 0.24, 0.14], LEATHER_D, 'ch_leather', [0.1, 0, 0]),
            P.box([0.05, 0.42, 0.03], [-0.13, 0.24, 0.14], LEATHER_D, 'ch_leather', [0.1, 0, 0])
          ]),
          head: [
            P.tube([0.07, 0.08, 0.1, 8], [0, 0.04, 0], MAIL, 'ch_chain'),
            // 钟形头盔：下沿外翻、一道眼缝、下巴前面一个钟锤护颏、顶上挂环
            P.lathe([10, 0.17, 0, 0.16, 0.03, 0.135, 0.09, 0.13, 0.2, 0.11, 0.27, 0.06, 0.31, 0, 0.32], [0, 0.08, 0], BRONZE, 'gold'),
            P.p('torus', [0.168, 0.018, 4, 12], [0, 0.085, 0], BRONZE_D, 'gold', [PI / 2, 0, 0]),
            P.box([0.17, 0.025, 0.03], [0, 0.24, 0.135], 0x161210, 'plain'),
            P.knob(0.05, [0, 0.07, 0.1], BRONZE_D, 'gold'),
            P.knob(0.035, [0, 0.405, 0], BRONZE_D, 'gold'),
            P.p('torus', [0.035, 0.012, 4, 6], [0, 0.445, 0], BRONZE_D, 'gold')
          ],
          // 背上的大铜钟：钟口朝下、钟锤露在下面、顶上一圈草绳
          pack: [
            P.lathe([10, 0.2, 0, 0.19, 0.04, 0.15, 0.12, 0.14, 0.24, 0.1, 0.3, 0, 0.32], [0, 0.04, -0.3], 0xb8862a, 'gold', [0.2, 0, 0]),
            P.p('torus', [0.2, 0.022, 4, 12], [0, 0.045, -0.3], BRONZE_D, 'gold', [PI / 2 + 0.2, 0, 0]),
            P.cyl([0.18, 0.18, 0.01, 8], [0, 0.06, -0.3], 0x2a1a10, 'plain', [0.2, 0, 0]),
            P.knob(0.04, [0, 0.0, -0.31], 0x6a4a2a, 'metal'),
            P.p('torus', [0.05, 0.014, 4, 6], [0, 0.39, -0.23], ROPE, 'cloth', [0.2, PI / 2, 0])
          ],
          // 右手的手摇铃：握住木柄，铃口朝下
          gearR: CHK.held(B, 0, [
            P.tube([0.02, 0.025, 0.14, 6], [0, 0.04, 0], 0x7a5230, 'wood'),
            P.lathe([10, 0.075, 0, 0.07, 0.03, 0.05, 0.09, 0, 0.1], [0, -0.16, 0], 0xd0a040, 'gold'),
            P.knob(0.02, [0, -0.17, 0], 0x6a4a2a, 'metal')
          ])
        });
    }
  };

  // ---- 伙夫骑士：营地的伙夫，平底锅能炒菜也能敲人。圆肚子、白围裙、红领巾、大胡子、铁锅盔上顶着高高的厨师帽 ----
  CHD.cook = {
    body: { sh: 0.28, scale: 1.03 },
    make: function (B) {
      var MAIL = 0x8a929c, APRON = 0xf4f0e8, WHITE = 0xf6f4ee, TROU = 0x4a4a52, FACE = 0xeea888;
      var arms = CHK.arms(B, { upper: MAIL, upperT: 'ch_chain', fore: 0xe9b48c, foreT: 'skin', hand: SKIN, handT: 'skin', w: 1.1 });
      // 袖子卷到手肘
      arms.foreL.push(P.tube([0.08, 0.074, 0.07, 8], [0, -0.03, 0], APRON, 'ch_fold'));
      arms.foreR.push(P.tube([0.08, 0.074, 0.07, 8], [0, -0.03, 0], APRON, 'ch_fold'));
      return CHK.join(
        CHK.legs(CHK.leg(B, { thigh: TROU, thighT: 'cloth', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 1.12 })),
        arms,
        {
          pelvis: CHK.hips(B, { hips: TROU, hipsT: 'cloth', belt: APRON, beltT: 'ch_fold', skirt: APRON, skirtB: TROU, skirtLen: 0.42, skirtW: 0.32, hw: 1.1 }).concat([
            // 背后腰上的围裙大蝴蝶结
            P.knob(0.07, [0.08, 0.06, -0.16], WHITE, 'ch_fold', [1.3, 0.8, 0.5]),
            P.knob(0.07, [-0.08, 0.06, -0.16], WHITE, 'ch_fold', [1.3, 0.8, 0.5]),
            P.knob(0.035, [0, 0.06, -0.165], WHITE, 'ch_fold'),
            P.box([0.05, 0.22, 0.015], [0.035, -0.07, -0.168], WHITE, 'ch_fold', [0, 0, -0.15]),
            P.box([0.05, 0.22, 0.015], [-0.035, -0.07, -0.168], WHITE, 'ch_fold', [0, 0, 0.15]),
            // 左胯挂着汤勺，右胯一串香肠
            P.tube([0.012, 0.012, 0.28, 5], [0.215, -0.08, 0.04], 0xa8aeb6, 'metal'),
            P.knob(0.045, [0.215, -0.23, 0.04], 0xa8aeb6, 'metal', [1, 0.6, 1]),
            P.box([0.012, 0.05, 0.012], [-0.215, 0.02, 0.05], 0xd8c8a0, 'plain'),
            P.knob(0.035, [-0.215, -0.04, 0.05], 0xc8704a, 'skin', [0.75, 1.5, 0.75]),
            P.knob(0.035, [-0.222, -0.135, 0.055], 0xc8704a, 'skin', [0.75, 1.5, 0.75])
          ]),
          chest: CHK.torso(B, { waist: MAIL, waistT: 'ch_chain', chest: MAIL, chestT: 'ch_chain', flat: true, cw: 1.12 }).concat([
            // 圆肚子 + 白围裙（下片包住肚子、上片是胸兜）+ 油渍
            P.ball(0.19, [0, 0.08, 0.1], MAIL, 'ch_chain', [1.3, 1.0, 1.1]),
            P.ball(0.19, [0, 0.08, 0.14], APRON, 'ch_fold', [1.0, 0.95, 0.92]),
            P.tbox([0.26, 0.3, 0.17, 0.03, 0.03], [0, 0.3, 0.185], APRON, 'ch_fold', [0.08, 0, 0]),
            P.box([0.07, 0.05, 0.01], [0.05, 0.11, 0.312], 0xc8b890, 'plain', [0, 0.15, 0]),
            P.box([0.03, 0.1, 0.02], [0.09, 0.42, 0.14], APRON, 'ch_fold', [0.3, 0, -0.2]),
            P.box([0.03, 0.1, 0.02], [-0.09, 0.42, 0.14], APRON, 'ch_fold', [0.3, 0, 0.2]),
            // 红领巾 + 胸前的结
            P.cyl([0.1, 0.13, 0.06, 8], [0, 0.43, 0], 0xc8302a, 'cloth'),
            P.cone([0.045, 0.09, 4], [0, 0.37, 0.12], 0xc8302a, 'cloth', [PI, 0, 0])
          ]),
          head: CHK.head(FACE).concat([
            P.box([0.035, 0.025, 0.01], [0.06, 0.185, 0.119], 0xe87060, 'plain'),
            P.box([0.035, 0.025, 0.01], [-0.06, 0.185, 0.119], 0xe87060, 'plain'),
            P.box([0.21, 0.1, 0.07], [0, 0.12, 0.085], 0x6a4428, 'fur'),
            P.box([0.13, 0.03, 0.03], [0, 0.168, 0.125], 0x5a3820, 'fur'),
            // 后脑的棕发（和胡子一个颜色）
            P.box([0.23, 0.17, 0.12], [0, 0.21, -0.1], 0x6a4428, 'fur'),
            // 小铁锅盔 + 高高的厨师帽
            P.lathe([10, 0.15, 0, 0.145, 0.05, 0.11, 0.09, 0, 0.1], [0, 0.29, -0.005], STEEL, 'ch_plate'),
            P.cyl([0.12, 0.11, 0.16, 8], [0, 0.42, -0.005], WHITE, 'ch_fold'),
            P.ball(0.13, [0, 0.53, -0.005], WHITE, 'cloth', [1.15, 0.75, 1.15])
          ]),
          // 右手的平底锅
          gearR: CHK.held(B, 0.4, [
            P.box([0.035, 0.035, 0.26], [0, 0, 0.13], 0x6a4a2a, 'wood'),
            P.cyl([0.17, 0.15, 0.04, 10], [0, 0, 0.4], 0x2a2a30, 'metal'),
            P.p('torus', [0.17, 0.014, 4, 10], [0, 0.02, 0.4], 0x3a3a40, 'metal', [PI / 2, 0, 0])
          ])
        });
    }
  };

  // ---- 小丑骑士：宫廷小丑，会翻跟头、会抛球、会踩瓜皮滑倒。红黄菱格彩衣、白脸红鼻子、三叉铃铛帽、翘头鞋 ----
  CHD.jester = {
    body: { sh: 0.22, hw: 0.105, scale: 0.96 },
    make: function (B) {
      var RED = 0xd83a3a, YEL = 0xe8c030, BLUE = 0x2a55c8, WHITE = 0xf6f4ee, BELL = 0xffd040;
      // 一条腿：裤腿颜色 c，鞋 boot；翘起来的鞋尖上挂个小铃铛
      var leg = function (c, boot) {
        var l = CHK.leg(B, { thigh: c, thighT: 'cloth', shin: c, shinT: 'cloth', boot: boot, bootT: 'cloth', w: 0.9 }), s = B.shin;
        l[1].push(P.cone([0.045, 0.16, 5], [0, -s - 0.02, 0.2], boot, 'cloth', [PI / 2 - 0.7, 0, 0]));
        l[1].push(P.knob(0.025, [0, -s + 0.03, 0.265], BELL, 'gold'));
        return l;
      };
      var lL = leg(RED, YEL), lR = leg(YEL, RED);
      var aL = CHK.arm(B, { upper: 0xffffff, upperT: 'kn_motley', fore: RED, foreT: 'cloth', hand: WHITE, handT: 'cloth', w: 0.88 }, 1);
      var aR = CHK.arm(B, { upper: 0xffffff, upperT: 'kn_motley', fore: YEL, foreT: 'cloth', hand: WHITE, handT: 'cloth', w: 0.88 }, -1);
      // 帽子的一个叉：(sx, sz) 往哪边伸；先斜着往外往上，再往下耷拉，尖上一个铃铛
      var prong = function (sx, sz, c) {
        var a = 0.9, b = 2.45, d1 = [sx * Math.sin(a), Math.cos(a), sz * Math.sin(a)], d2 = [sx * Math.sin(b), Math.cos(b), sz * Math.sin(b)];
        var s0 = [sx * 0.04, 0.4, sz * 0.04 - 0.01], at = function (p, d, k) { return [p[0] + d[0] * k, p[1] + d[1] * k, p[2] + d[2] * k]; };
        var j = at(s0, d1, 0.19), tip = at(j, d2, 0.12);
        return [
          P.cone([0.07, 0.24, 6], at(s0, d1, 0.12), c, 'cloth', [sz * a, 0, -sx * a]),
          P.cone([0.04, 0.13, 5], at(j, d2, 0.055), c, 'cloth', [sz * b, 0, -sx * b]),
          P.knob(0.035, at(tip, d2, 0.02), BELL, 'gold')
        ];
      };
      return CHK.join(
        { legL: lL[0], shinL: lL[1], legR: lR[0], shinR: lR[1], armL: aL[0], foreL: aL[1], armR: aR[0], foreR: aR[1] },
        {
          pelvis: CHK.hips(B, { hips: 0xffffff, hipsT: 'kn_motley', belt: BLUE, beltT: 'cloth', skirt: 0xffffff, skirtT: 'kn_motley', skirtLen: 0.2 }),
          chest: CHK.torso(B, { waist: 0xffffff, waistT: 'kn_motley', chest: 0xffffff, chestT: 'kn_motley', flat: true, cw: 0.9 }).concat([
            // 两圈白色褶领
            P.p('torus', [0.15, 0.04, 4, 14], [0, 0.43, -0.005], WHITE, 'cloth', [PI / 2, 0, 0]),
            P.p('torus', [0.12, 0.035, 4, 14], [0, 0.465, -0.005], WHITE, 'cloth', [PI / 2, 0, 0])
          ]),
          head: CHK.head(0xf4f0ec, { nose: false }).concat([
            P.knob(0.035, [0, 0.2, 0.125], 0xe02a2a, 'plain'),
            P.box([0.1, 0.015, 0.01], [0, 0.152, 0.118], 0xd02a3a, 'plain'),
            P.box([0.03, 0.013, 0.01], [0.055, 0.162, 0.118], 0xd02a3a, 'plain', [0, 0, 0.6]),
            P.box([0.03, 0.013, 0.01], [-0.055, 0.162, 0.118], 0xd02a3a, 'plain', [0, 0, -0.6]),
            // 后脑勺的红黄两半头巾（和裤腿一样左红右黄），从后面看不再是白脸
            P.box([0.115, 0.27, 0.12], [0.0575, 0.185, -0.1], RED, 'cloth'),
            P.box([0.115, 0.27, 0.12], [-0.0575, 0.185, -0.1], YEL, 'cloth'),
            // 帽箍 + 小帽顶 + 三个叉（红往左、黄往右、蓝往后）
            P.cyl([0.152, 0.152, 0.06, 10], [0, 0.33, -0.005], BLUE, 'cloth'),
            P.lathe([10, 0.15, 0, 0.13, 0.04, 0.07, 0.08, 0, 0.09], [0, 0.355, -0.005], 0xffffff, 'kn_motley')
          ]).concat(prong(1, 0, RED), prong(-1, 0, YEL), prong(0, -1, BLUE)),
          // 右手边抛着的三个球（静止，像是浮在手边）
          gearR: CHK.held(B, 0, [
            P.knob(0.055, [-0.06, 0.1, 0.2], RED, 'plain'),
            P.knob(0.055, [0, 0.24, 0.24], BLUE, 'plain'),
            P.knob(0.055, [0.06, 0.14, 0.3], YEL, 'plain')
          ])
        });
    }
  };

  // ---- 画盾骑士：给公会每一面盾画纹章的画师。溅满颜料的罩衣、歪戴的红贝雷帽、卷翘的小胡子、画了一半的风筝盾、颜料桶 ----
  CHD.painter = {
    body: { sh: 0.24, scale: 0.98 },
    make: function (B) {
      var MAIL = 0x9aa2ac, BELT = 0x5a3a22, y = -B.fore * 0.45;
      return CHK.join(
        CHK.legs(CHK.leg(B, { thigh: 0x4a4a5a, thighT: 'cloth', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 0.92 })),
        CHK.arms(B, { upper: 0xffffff, upperT: 'kn_paint', fore: MAIL, foreT: 'ch_chain', cuff: 0xffffff, cuffT: 'kn_paint', hand: SKIN, handT: 'skin', w: 0.9 }),
        {
          pelvis: CHK.hips(B, { hips: MAIL, hipsT: 'ch_chain', belt: BELT, buckle: 0xa8aeb6, skirt: 0xffffff, skirtT: 'kn_paint', skirtLen: 0.45 }).concat([
            // 宽皮带，前右插着三支笔
            P.box([0.37, 0.1, 0.25], [0, 0.05, 0], BELT, 'ch_leather'),
            P.tube([0.01, 0.01, 0.22, 5], [-0.07, 0.08, 0.14], 0x8a5a2a, 'wood', [0.1, 0, 0.08]),
            P.tube([0.01, 0.01, 0.22, 5], [-0.105, 0.08, 0.14], 0x8a5a2a, 'wood', [0.1, 0, -0.05]),
            P.tube([0.01, 0.01, 0.22, 5], [-0.14, 0.08, 0.135], 0x8a5a2a, 'wood', [0.1, 0, -0.18]),
            P.knob(0.022, [-0.079, 0.19, 0.151], 0xd83a3a, 'plain', [1, 1.5, 1]),
            P.knob(0.022, [-0.099, 0.19, 0.151], 0x3a6ad8, 'plain', [1, 1.5, 1]),
            P.knob(0.022, [-0.12, 0.185, 0.146], 0xe8c030, 'plain', [1, 1.5, 1])
          ]),
          chest: CHK.torso(B, { waist: MAIL, waistT: 'ch_chain', chest: 0xffffff, chestT: 'kn_paint', flat: true, cw: 0.95 }).concat([
            // 罩衣背后一大片颜料
            P.box([0.34, 0.32, 0.012], [0, 0.25, -0.147], 0xffffff, 'kn_splat', [-0.1, 0, 0])
          ]),
          head: CHK.head(SKIN).concat([
            // 黑色卷翘小胡子 + 后脑的黑发
            P.box([0.06, 0.018, 0.015], [0.032, 0.172, 0.124], 0x1a1418, 'plain', [0, 0, 0.35]),
            P.box([0.06, 0.018, 0.015], [-0.032, 0.172, 0.124], 0x1a1418, 'plain', [0, 0, -0.35]),
            P.cone([0.012, 0.04, 4], [0.068, 0.198, 0.124], 0x1a1418, 'plain', [0, 0, -0.3]),
            P.cone([0.012, 0.04, 4], [-0.068, 0.198, 0.124], 0x1a1418, 'plain', [0, 0, 0.3]),
            P.box([0.23, 0.19, 0.12], [0, 0.215, -0.1], 0x1a1418, 'fur'),
            // 歪戴的红贝雷帽
            P.ball(0.15, [0.03, 0.345, -0.01], 0xc8303a, 'cloth', [1.15, 0.35, 1.1], [0, 0, 0.18]),
            P.cyl([0.012, 0.012, 0.03, 5], [0.04, 0.4, -0.01], 0xc8303a, 'cloth', [0, 0, 0.18])
          ]),
          // 左臂：画了一半的风筝盾（前半边红底金狮，后半边还是白的）
          gearL: [
            P.tbox([0.05, 0.05, 0.5, 0.38, 0.16], [0.09, y, 0.02], 0x8a5a2a, 'wood'),
            P.tbox([0.03, 0.03, 0.44, 0.33, 0.12], [0.112, y + 0.005, 0.02], 0xf2eee4, 'ch_plate'),
            P.box([0.012, 0.4, 0.1], [0.128, y + 0.01, 0.085], 0xc8303a, 'cloth', [0.235, 0, 0]),
            P.box([0.014, 0.18, 0.07], [0.135, y - 0.01, 0.09], 0xe2b23a, 'gold', [0.235, 0, 0]),
            P.knob(0.04, [0.135, y + 0.11, 0.11], 0xe2b23a, 'gold', [0.5, 1, 1]),
            P.box([0.012, 0.09, 0.012], [0.13, y - 0.12, 0.04], 0xc8303a, 'plain')
          ],
          // 右手提着的颜料桶
          gearR: CHK.held(B, 0, [
            P.cyl([0.1, 0.085, 0.18, 10], [0, -0.17, 0], 0xb8bec6, 'metal'),
            P.p('ch_arc', [0.09, 0.008, 3, 8, PI], [0, -0.08, 0], 0x5a6068, 'metal'),
            P.cyl([0.092, 0.092, 0.01, 10], [0, -0.085, 0], 0x3a6ad8, 'plain'),
            P.box([0.03, 0.08, 0.02], [0.098, -0.12, 0], 0x3a6ad8, 'plain')
          ])
        });
    }
  };

  // ---- 养蜂骑士：修道院的养蜂人，蜂群把她当成蜂后。宽草帽 + 面前一小片纱、蜂蜜色背心、背上草编蜂箱、手里熏烟壶、身边绕着三只小蜂 ----
  CHD.beekeeper = {
    body: { tail: [0, 0.55, 0] },
    orbit: 1.6,
    make: function (B) {
      var GRN = 0x4a7a3a, HONEY = 0xe0b030, APR = 0x7a5030, STRAW = 0xe0c890;
      // 一只蜂：发光的黄身子 + 黑色腰带 + 一对白翅膀
      var bee = function (a, r, h) {
        var x = Math.cos(a) * r, z = Math.sin(a) * r;
        return [
          P.ball(0.03, [x, h, z], 0xffd040, '!plain', [1, 1, 1.35], null, [4, 3]),
          P.ball(0.032, [x, h, z], 0x1a1a1a, 'plain', [0.95, 0.95, 0.3], null, [4, 3]),
          P.box([0.07, 0.008, 0.035], [x, h + 0.03, z], 0xf0f6ff, 'plain')
        ];
      };
      return CHK.join(
        CHK.legs(CHK.leg(B, { thigh: 0x6a5a3a, thighT: 'cloth', shin: LEATHER, shinT: 'ch_leather', boot: LEATHER_D, cuff: LEATHER, w: 0.95 })),
        CHK.arms(B, { upper: GRN, upperT: 'cloth', fore: SKIN, foreT: 'skin', cuff: HONEY, cuffT: 'ch_leather', hand: HONEY, handT: 'ch_leather', w: 0.92 }),
        {
          pelvis: CHK.hips(B, { hips: GRN, hipsT: 'cloth', belt: LEATHER_D, skirt: APR, skirtB: GRN, skirtT: 'ch_leather', skirtLen: 0.4 }),
          chest: CHK.torso(B, { waist: GRN, waistT: 'cloth', chest: GRN, chestT: 'cloth', flat: true }).concat([
            // 蜂蜜色背心（前面敞开一条）+ 皮围兜 + 蜂箱背带
            P.tbox([0.52, 0.4, 0.34, 0.31, 0.24], [0, 0.235, -0.005], HONEY, 'ch_fold'),
            P.box([0.06, 0.2, 0.01], [0, 0.31, 0.162], GRN, 'cloth', [0.1, 0, 0]),
            P.box([0.22, 0.17, 0.012], [0, 0.14, 0.138], APR, 'ch_leather', [0.1, 0, 0]),
            P.box([0.05, 0.4, 0.03], [0.14, 0.24, 0.15], LEATHER_D, 'ch_leather', [0.1, 0, 0]),
            P.box([0.05, 0.4, 0.03], [-0.14, 0.24, 0.15], LEATHER_D, 'ch_leather', [0.1, 0, 0])
          ]),
          head: CHK.head(SKIN).concat([
            // 宽草帽 + 帽檐前面垂下的一小片纱（脸还露着）
            P.box([0.23, 0.18, 0.12], [0, 0.22, -0.1], 0x6e3e22, 'fur'),
            P.knob(0.06, [0, 0.25, -0.175], 0x6e3e22, 'fur'),
            P.cyl([0.27, 0.27, 0.02, 14], [0, 0.33, -0.005], STRAW, 'kn_coil'),
            P.lathe([10, 0.15, 0, 0.14, 0.1, 0.11, 0.14, 0, 0.15], [0, 0.33, -0.005], STRAW, 'kn_coil'),
            P.p('torus', [0.148, 0.014, 4, 12], [0, 0.345, -0.005], GRN, 'cloth', [PI / 2, 0, 0]),
            P.box([0.28, 0.05, 0.008], [0, 0.305, 0.25], 0xd8d8cc, 'kn_net', [-0.1, 0, 0])
          ]),
          // 左手的熏烟壶：握着皮风箱，前面是铁壶，壶嘴冒一小团烟
          gearL: CHK.held(B, 0, [
            P.box([0.05, 0.1, 0.13], [0, -0.02, 0], LEATHER, 'ch_leather'),
            P.cyl([0.055, 0.055, 0.16, 8], [0, -0.06, 0.1], 0xa8aeb6, 'metal'),
            P.cone([0.04, 0.08, 6], [0, 0.06, 0.1], 0x8a9098, 'metal'),
            P.knob(0.04, [0, 0.14, 0.12], 0xe6e6e6, 'cloth')
          ]),
          // 背上的草编蜂箱（圆顶）+ 下面的小门
          pack: [
            P.lathe([12, 0.17, 0, 0.17, 0.1, 0.15, 0.2, 0.1, 0.28, 0, 0.31], [0, 0.04, -0.3], 0xd8b060, 'kn_coil'),
            P.cyl([0.17, 0.17, 0.02, 10], [0, 0.04, -0.3], 0x9a7a40, 'kn_coil'),
            P.box([0.06, 0.045, 0.02], [0, 0.07, -0.468], 0x2a1a0a, 'plain')
          ],
          // 绕着她飞的三只蜂（尾巴骨骼在头的高度；转圈由 orbit 驱动）
          tail: bee(0.5, 0.38, -0.05).concat(bee(0.5 + 2.1, 0.4, 0.1), bee(0.5 + 4.2, 0.36, 0.2))
        });
    }
  };

  // ---- 渔夫骑士：河镇的渔夫，鱼竿也能钓怪物。绿油布大衣、黑胶靴、肩上搭着渔网、后檐长长的防雨帽、背上柳条鱼篓露出一条蓝鱼尾 ----
  CHD.fisher = {
    make: function (B) {
      var COAT = 0x3e6b4a, COAT_D = 0x2e5238, RUB = 0x22262a, MAIL = 0x8a929c, FACE = 0xe0a888, NET = 0x9a9080;
      var hd = CHK.hand(B), ang = 0.5, L = 1.2, tip = [hd[0], hd[1] + L * Math.cos(ang), hd[2] + L * Math.sin(ang)];
      var dl = [0, -Math.cos(0.66), -Math.sin(0.66)];   // 鱼线：待机时（前臂往前弯）正好竖直往下垂
      return CHK.join(
        CHK.legs(CHK.leg(B, { thigh: 0x4a4a52, thighT: 'cloth', shin: RUB, shinT: 'ch_plate', boot: RUB, bootT: 'ch_plate', cuff: RUB, cuffT: 'ch_plate', w: 1.0 })),
        CHK.arms(B, { upper: COAT, upperT: 'ch_fold', fore: COAT, foreT: 'ch_fold', cuff: COAT_D, cuffT: 'ch_fold', hand: FACE, handT: 'skin' }),
        {
          pelvis: CHK.hips(B, { hips: MAIL, hipsT: 'ch_chain', belt: LEATHER_D, skirt: COAT, skirtLen: 0.55, skirtW: 0.3 }),
          chest: CHK.torso(B, { waist: MAIL, waistT: 'ch_chain', chest: COAT, chestT: 'ch_fold', flat: true }).concat([
            // 三颗牛角扣
            P.knob(0.02, [0, 0.33, 0.15], 0xc8b080, 'bone', [1, 0.6, 0.6]),
            P.knob(0.02, [0, 0.24, 0.14], 0xc8b080, 'bone', [1, 0.6, 0.6]),
            P.knob(0.02, [0, 0.15, 0.13], 0xc8b080, 'bone', [1, 0.6, 0.6]),
            // 搭在左肩上的渔网（肩上一片，前后各垂一片）
            P.box([0.14, 0.03, 0.3], [0.17, 0.415, -0.005], NET, 'kn_net'),
            P.box([0.15, 0.2, 0.025], [0.17, 0.32, 0.15], NET, 'kn_net', [0.12, 0, -0.08]),
            P.box([0.15, 0.24, 0.025], [0.17, 0.3, -0.16], NET, 'kn_net', [-0.12, 0, 0.08]),
            // 鱼篓的斜背带
            P.box([0.05, 0.6, 0.03], [-0.02, 0.22, 0.142], LEATHER, 'ch_leather', [0.1, 0, 0.6])
          ]),
          head: CHK.head(FACE).concat([
            P.box([0.19, 0.06, 0.012], [0, 0.125, 0.12], 0xb0a89a, 'noise'),
            // 防雨帽：圆帽顶 + 前短后长、往后耷拉的帽檐
            P.lathe([10, 0.15, 0, 0.145, 0.08, 0.1, 0.13, 0, 0.14], [0, 0.3, -0.005], COAT, 'ch_fold'),
            P.cyl([0.2, 0.2, 0.02, 12], [0, 0.3, -0.06], COAT, 'ch_fold', [-0.25, 0, 0], [1, 1, 1.35]),
            // 帽子后面垂到后颈的油布护颈（下摆往后翘）
            P.box([0.25, 0.22, 0.12], [0, 0.2, -0.105], COAT_D, 'ch_fold', [0.15, 0, 0])
          ]),
          // 背上的柳条鱼篓，盖子边上露出一条蓝鱼尾
          pack: [
            P.box([0.32, 0.26, 0.18], [0, 0.18, -0.225], 0xb08a50, 'kn_wicker'),
            P.box([0.34, 0.03, 0.2], [0, 0.325, -0.225], 0x9a7440, 'kn_wicker'),
            P.box([0.06, 0.1, 0.035], [0.1, 0.37, -0.24], 0x3a6ab8, 'scale', [0, 0, -0.15]),
            P.cone([0.04, 0.12, 4], [0.085, 0.46, -0.24], 0x4a8ad8, 'scale', [0, 0, 0.5]),
            P.cone([0.04, 0.12, 4], [0.145, 0.45, -0.24], 0x4a8ad8, 'scale', [0, 0, -0.6])
          ],
          // 右手的鱼竿：往前上方挑着，竿梢垂下一根鱼线和钩
          gearR: CHK.held(B, ang, [
            P.tube([0.012, 0.02, L, 6], [0, L / 2 - 0.1, 0], 0xc8a060, 'wood'),
            P.cyl([0.035, 0.035, 0.03, 8], [0, 0.12, 0.045], 0x6a6e76, 'metal', [0, 0, PI / 2]),
            P.box([0.04, 0.012, 0.012], [0.025, 0.12, 0.045], 0x3a3e44, 'metal')
          ]).concat([
            P.box([0.006, 0.45, 0.006], [tip[0], tip[1] - 0.1 * Math.cos(ang) + dl[1] * 0.225, tip[2] - 0.1 * Math.sin(ang) + dl[2] * 0.225], 0xf0f0f0, 'plain', [0.66, 0, 0]),
            P.knob(0.016, [tip[0], tip[1] - 0.1 * Math.cos(ang) + dl[1] * 0.45, tip[2] - 0.1 * Math.sin(ang) + dl[2] * 0.45], 0x6a6e76, 'metal')
          ])
        });
    }
  };
})();
