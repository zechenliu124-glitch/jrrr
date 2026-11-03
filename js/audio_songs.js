'use strict';
// ============================================================
//  曲子（全部原创）：主菜单、森林、沙漠、墓地、Boss、最终虫潮；插曲：升级、超武觉醒、Boss 倒下、通关、阵亡
//  格式（引擎见 audio.js 的 Player）：
//   bpm / div（每拍几步：4 = 十六分音符，3 = 三连音）/ steps（每小节几步）/ root（MIDI 根音）/ scale / keys（每轮循环移调）
//   parts：声部（乐器、音区、音量、声像、lvl = 强度到几级才出来）
//   pat：贝斯 / 琶音 / 和弦重音的音型（每个字符一步：贝斯 R 根 O 八度 F 五度 T 三度；琶音数字是和弦音序号；- 延长，. 休止）
//   drums：鼓组（每条一个字符串，或者按强度 0/1/2 给三个）
//   sec：段落（chords 每小节一个和弦记号；lead / counter 旋律，“a|b”按出现次数轮换，“+harm 三度和声 +echo 回声 +orn 装饰音”）
//   mel：旋律（“级数:步数”，' 高八度，, 低八度，# b 升降，r 休止，~ 滑音）
//   forms：曲式（每轮循环轮换；! 开头的段落只在第一轮）
// ============================================================
(function () {
  var C = SFX.compileSong;

  // ---------------- 主菜单：平静、英雄气的中世纪小调（3/4 拍，鲁特琴 + 竖笛 + 圆号） ----------------
  SFX.SONGS.menu = C({
    id: 'menu', name: '主菜单', bpm: 84, div: 4, steps: 12, root: 50, scale: 'major', wet: 0.32,
    parts: {
      bass: { inst: 'softbass', lo: 38, vol: 0.1 },
      arp: { inst: 'lute', lo: 57, vol: 0.25, pan: -0.22 },
      arp2: { inst: 'harp', lo: 74, vol: 0.13, pan: 0.28, lvl: 1 },
      pad: { inst: 'strings', lo: 57, vol: 0.03, a: 0.6, rel: 1.2, lp: 1200 },
      lead: { inst: 'flute', base: 74, vol: 0.22, pan: 0.08 },
      counter: { inst: 'horn', base: 62, vol: 0.2, pan: 0.05 },
      drums: { vol: 0.55 }
    },
    pat: {
      bass: { m1: 'R-------F---' },
      arp: { l1: '0-1-2-3-2-1-', l2: '0-2-1-3-2-4-' },
      arp2: { h1: '3...4...5...' }
    },
    drums: {
      m: { frame: ['x...........', 'x.......o...', 'x.......o...'], tamb: [null, '....x...x...', '....x...x...'], shaker: [null, null, '..o...o...o.'] },
      mF: { frame: 'x...o...o.o.', tamb: '....x...xxx.' }
    },
    sec: {
      I: { chords: ['1', '1'], bass: 'm1', arp: 'l1', pad: 1 },
      A: { chords: ['1', '4', '1', '5', '6', '4', '2', '5'], lead: 'mA|mA+harm', bass: 'm1', arp: 'l1', arp2: 'h1', pad: 1, drums: 'm', fill: 'mF' },
      B: { chords: ['4', '5', '3', '6', '4', '1', '2', '5'], counter: 'mB', bass: 'm1', arp: 'l2', arp2: 'h1', pad: 1, drums: 'm', fill: 'mF' },
      C: { chords: ['6', '4', '1', '5'], bass: 'm1', arp: 'l1', arp2: 'h1', pad: 1 }
    },
    mel: {
      mA: "5,:4 1:4 2:2 3:2 | 4:6 3:2 2:4 | 3:8 1:4 | 2:12 | 3:4 6:4 5:2 4:2 | 6:6 5:2 4:4 | 2:4 4:4 3:2 2:2 | 7,:4 2:4 5:4",
      mB: "4:4 6:4 1':4 | 1':6 7:2 6:4 | 7:4 6:2 5:2 3:4 | 6:12 | 5:4 6:2 5:2 4:4 | 3:6 2:2 1:4 | 2:4 3:2 4:2 5:4 | 2:12"
    },
    forms: [['!I', 'A', 'B', 'A', 'C']]
  });

  // ---------------- 第 1 关 森林：轻快的冒险（G 大调，奇数轮移到 A 大调） ----------------
  SFX.SONGS.forest = C({
    id: 'forest', name: '森林', bpm: 136, div: 4, steps: 16, root: 55, scale: 'major', keys: [0, 2], wet: 0.18,
    parts: {
      bass: { inst: 'bass', lo: 40, vol: 0.126 },
      arp: { inst: 'pluck', lo: 62, vol: 0.24, pan: -0.25, br: 7, dec: 0.5 },
      arp2: { inst: 'lute', lo: 74, vol: 0.14, pan: 0.3, lvl: 2 },
      pad: { inst: 'strings', lo: 55, vol: 0.026, lp: 1400 },
      lead: { inst: ['flute', 'fiddle'], base: 67, vol: 0.25, pan: 0.1 },
      counter: { inst: 'horn', base: 55, vol: 0.075, pan: -0.12, lvl: 2 },
      drums: { vol: 0.42, tune: { tom: 45 } }
    },
    pat: {
      bass: { bI: 'R-------R-------', bA: 'R-R-O-R-R-R-O-F-', bB: 'R---R-R-R---F-R-', bC: 'R-------R---F---' },
      arp: { a8: '0-2-1-2-3-2-1-2-', a16: '0123432101234321' },
      arp2: { h: '3...4...5...4...' }
    },
    drums: {
      intro: { kick: 'x.......x.......', hat: '..o...o...o...o.' },
      main: { kick: ['x.......x.......', 'x.......x.x.....', 'x.....x.x.x.....'], snare: [null, '....x.......x...', '....x.......x..o'], hat: ['..o...o...o...o.', 'x.o.x.o.x.o.x.o.', 'x.oxx.oxx.oxx.ox'], shaker: [null, null, '.o.o.o.o.o.o.o.o'] },
      mainC: { kick: ['x.......x.......', 'x.......x.x.....', 'x.....x.x.x.....'], snare: [null, '....x.......x...', '....x.......x..o'], hat: ['..o...o...o...o.', '..o.x.o.x.o.x.o.', '..oxx.oxx.oxx.ox'], crash: [null, 'x...............', 'x...............'] },
      fill: { kick: 'x.......x.......', snare: ['............x.xx', '....x...x.x.xxxx', '....x...x.x.xxxx'], tom: [null, '..........x.x...', '..........x.x...'], hat: 'x.o.x.o.........' },
      half: { kick: ['x...............', 'x.........x.....', 'x.........x.....'], snare: [null, '........x.......', '........x.......'], hat: ['x...x...x...x...', 'x.x.x.x.x.x.x.x.', 'x.x.x.x.x.x.x.x.'] }
    },
    sec: {
      I: { chords: ['1', '5'], bass: 'bI', arp: 'a8', pad: 1, drums: 'intro' },
      A: { chords: ['1', '5', '6', '4', '1', '5', '4', '5'], lead: 'mA|mA+harm|mA+orn', counter: 'cA', bass: 'bA', arp: ['a8', 'a16', 'a16'], arp2: 'h', pad: 1, drums: 'main', first: 'mainC', fill: 'fill' },
      B: { chords: ['6', '4', '1', '5', '6', '4', '2', '5'], lead: 'mB|mB+echo', bass: 'bB', arp: ['a8', 'a8', 'a16'], arp2: 'h', pad: 1, drums: 'main', first: 'mainC', fill: 'fill' },
      C: { chords: ['4', '5', '3', '6', '4', '5', '1', '1'], lead: 'mC', bass: 'bC', arp: 'a8', pad: 1, drums: 'half', fill: 'fill' },
      D: { chords: ['6', '4', '1', '5'], bass: 'bC', arp: 'a16', drums: 'half', fill: 'fill', lvl: 1 }
    },
    mel: {
      mA: "1:2 3:2 5:4 1':4 7:2 6:2 | 5:6 2:2 5:2 6:2 7:4 | 1':4 7:2 6:2 3:4 6:4 | 4:4 6:2 1':2 2':4 1':4 | 3':6 2':2 1':4 5:4 | 7:4 6:2 5:2 2:4 5:4 | 6:2 5:2 4:4 1':4 6:4 | 5:12 r:4",
      mB: "3':8 2':4 1':4 | 6:8 1':4 6:4 | 5:4 1':4 3':4 5':4 | 4':4 3':4 2':8 | 3':4 6':4 5':2 3':2 1':4 | 2':2 1':2 6:4 1':8 | 2':4 4':4 6':4 5':2 4':2 | 3':4 2':4 7:8",
      mC: "1':2 6:2 4:4 r:8 | 2':2 7:2 5:4 r:8 | 3':2 7:2 5:4 7:4 3':4 | 1':8 6:8 | 6:2 1':2 4':4 3':4 1':4 | 2':2 5':2 7:4 2':4 5':4 | 5':4 3':4 1':4 5:4 | 1':12 r:4",
      cA: "3:16 | 2:16 | 3:16 | 4:16 | 5:16 | 7,:16 | 6:16 | 7:16"
    },
    forms: [['!I', 'A', 'A', 'B', 'C', 'A', 'B'], ['A', 'B', 'D', 'C', 'A', 'B']]
  });

  // ---------------- 第 2 关 沙漠：异域风（E 弗里几亚属音阶，马克苏姆节奏，乌德琴 + 祖尔纳 + 奈伊笛） ----------------
  SFX.SONGS.desert = C({
    id: 'desert', name: '沙漠', bpm: 100, div: 4, steps: 16, root: 52, scale: 'phrygdom', keys: [0, 0, -2], wet: 0.26,
    parts: {
      drone: { inst: 'drone', lo: 40, vol: 0.062 },
      bass: { inst: 'bass', lo: 40, vol: 0.13, wave: 'triangle', br: 6, sus: 0.7 },
      arp: { inst: 'oud', lo: 52, vol: 0.35, pan: -0.2, mode: 'scale' },
      pad: { inst: 'strings', lo: 59, vol: 0.021, lvl: 1, lp: 1300 },
      lead: { inst: 'zurna', base: 64, vol: 0.47, pan: 0.12 },
      counter: { inst: 'ney', base: 64, vol: 0.3, pan: 0.08 },
      drums: { vol: 0.6 }
    },
    pat: {
      bass: { bI: 'R-------R-------', bA: 'R-....R.R-...R..' },
      arp: { o1: '0.1.2.1.0...4.3.', o2: '0-2-1-0-4-3-2-1-', o3: '0121012343210121' }
    },
    drums: {
      intro: { doum: 'x.......x.......', tek: '............x...' },
      maq: { doum: ['x.......x.......', 'x.......x.......', 'x.....o.x.......'], tek: ['..x...x.....x...', '..x...x.....x...', '..x...x...o.x.o.'], ka: [null, '.o..o....o..o..o', '.oo.o.oo.o.o.ooo'], tamb: [null, '....x.......x...', '..x...x...x...x.'], zil: [null, null, 'x...............'] },
      fill: { doum: 'x.......x...x.x.', tek: '..x...x...xxxxxx', tamb: [null, '....x.......x...', '..x...x...x...x.'] },
      sparse: { doum: 'x...............', tek: '........x.......', zil: 'x.......x.......' }
    },
    sec: {
      I: { chords: ['1', '1'], bass: 'bI', arp: 'o1', drums: 'intro' },
      A: { chords: ['1', '2', '1', '7', '1', '2', '4', '1'], lead: 'dA|dA+orn', bass: 'bA', arp: ['o1', 'o2', 'o3'], pad: 1, drums: 'maq', fill: 'fill' },
      B: { chords: ['4', 'b3M', '2', '1', '4', 'b3M', '2', '1'], counter: 'dB|dB+echo', bass: 'bA', arp: ['o2', 'o2', 'o3'], pad: 1, drums: 'maq', fill: 'fill' },
      C: { chords: ['1', '1', '2', '1', '1', '1', '7', '1'], lead: 'dC', bass: 'bA', arp: 'o1', pad: 1, drums: 'maq', fill: 'fill' },
      D: { chords: ['1', '1', '2', '1'], counter: 'dD', bass: 'bI', drums: 'sparse', lvl: 1 }
    },
    mel: {
      dA: "1':4 2':2 3':2 4':4 3':2 2':2 | 2':6 1':2 7:4 6:4 | 5:2 6:2 5:2 3:2 1:8 | 7:4 6:2 7:2 2':4 1':4 | ~3':4 4':2 3':2 2':2 1':2 2':4 | 4':4 3':2 2':2 1':4 2':4 | 4':2 6':2 5':4 4':4 3':4 | 1':12 r:4",
      dB: "4:4 6:4 1':4 6:4 | 7:4 5:2 7:2 b3':8 | 6:4 4:4 2:4 4:4 | 3:4 2:4 1:8 | 1':4 6:2 1':2 4':4 3':2 4':2 | b3':4 2':2 7:2 5:8 | 2':4 1':2 7:2 6:4 4:4 | 5:4 3:4 1:8",
      dC: "1':2 2':2 3':4 r:8 | 3':2 4':2 5':4 r:8 | 6':4 5':2 4':2 3':4 2':4 | 1':12 r:4 | 5:2 6:2 7:2 1':2 2':4 1':4 | 3':2 2':2 1':2 7:2 6:4 5:4 | 4:4 6:4 7:4 2':4 | 1':12 r:4",
      dD: "5:6 6:2 5:8 | 3:6 4:2 3:8 | 2:4 4:4 6:8 | 1:16"
    },
    forms: [['!I', 'A', 'B', 'A', 'C'], ['A', 'C', 'B', 'D', 'A', 'B']]
  });

  // ---------------- 第 3 关 墓地：阴森的小调，慢一点（D 小调，12/8 三连音律动，钟、管风琴、特雷门琴） ----------------
  SFX.SONGS.graveyard = C({
    id: 'graveyard', name: '墓地', bpm: 72, div: 3, steps: 12, root: 50, scale: 'minor', wet: 0.42,
    parts: {
      bass: { inst: 'pizz', lo: 38, vol: 0.53 },
      arp: { inst: 'harpsi', lo: 62, vol: 0.17, pan: -0.25, lvl: 1 },
      pad: { inst: 'organ', lo: 57, vol: 0.03, lp: 2600 },
      stab: { inst: 'choir', lo: 62, vol: 0.095, lvl: 2, a: 0.5, rel: 0.9 },
      lead: { inst: ['bell', 'musicbox'], base: 74, vol: 0.33, pan: 0.15 },
      counter: { inst: 'theremin', base: 62, vol: 0.26, pan: 0.1 },
      drums: { vol: 0.45, tune: { tom: 45, toll: 38 } }
    },
    pat: {
      bass: { g1: 'R.....F.....', g2: 'R..R..F..O..' },
      arp: { h1: '012321012321' },
      stab: { c: 'x-----------' }
    },
    drums: {
      gI: { heart: 'x.....x.....', toll: 'x...........' },
      g: { heart: ['x.....x.....', 'x.....x.....', 'x.....x..x..'], tom: [null, '.........o.o', '.........o.o'], shaker: [null, null, 'o.oo.oo.oo.o'], rim: [null, '...x.....x..', '...x.....x..'] },
      gT: { heart: ['x.....x.....', 'x.....x.....', 'x.....x..x..'], toll: 'x...........', shaker: [null, null, 'o.oo.oo.oo.o'] },
      gF: { heart: 'x.....x.....', tom: [null, '......x.x.xx', '......x.x.xx'] },
      gS: { heart: 'x.....x.....' }
    },
    sec: {
      I: { chords: ['1', '1'], bass: 'g1', pad: 1, drums: 'gI' },
      A: { chords: ['1', '6', '4', '5M', '1', '3', '4', '5M'], lead: 'gA|gA+echo', bass: ['g1', 'g2', 'g2'], arp: 'h1', stab: 'c', pad: 1, drums: 'g', first: 'gT', fill: 'gF' },
      B: { chords: ['4', '1', '6', '5M', '4', '1', 'b2M', '5M'], counter: 'gB', bass: 'g2', arp: 'h1', stab: 'c', pad: 1, drums: 'g', first: 'gT', fill: 'gF' },
      C: { chords: ['1', '1', '6', '6', '4', '4', '5M', '5M'], lead: 'gC', bass: 'g1', pad: 1, drums: 'gS', lvl: 1 }
    },
    mel: {
      gA: "5:3 3:2 2:1 1:3 5,:3 | 6,:3 1:2 3:1 6:6 | 4:3 6:2 5:1 4:3 1:3 | 2:3 #7,:3 5,:6 | 1':3 7:2 5:1 3:3 1:3 | 7:3 5:2 3:1 5:6 | 6:3 5:2 4:1 3:3 2:3 | 5,:9 r:3",
      gB: "4:1 5:1 6:1 1':3 6:3 4:3 | 5:1 6:1 5:1 3:3 1:6 | 3:1 4:1 5:1 6:3 3:3 1:3 | 2:3 #7,:3 2:3 5:3 | 4:3 6:3 1':6 | 7:2 6:1 5:3 3:3 1:3 | b2:3 4:3 6:3 4:3 | #7:6 5:6",
      gC: "1':3 5:3 3:3 5:3 | 1':6 r:6 | 6:3 3:3 1:3 3:3 | 6:6 r:6 | 4:3 6:3 1':3 6:3 | 4:6 r:6 | #7:3 5:3 2:3 5:3 | #7:9 r:3"
    },
    forms: [['!I', 'A', 'B', 'A', 'C'], ['A', 'C', 'B', 'A', 'B']]
  });

  // ---------------- Boss：紧张激烈（C 小调，太鼓、铜管重音、合唱、十六分音符的低音） ----------------
  SFX.SONGS.boss = C({
    id: 'boss', name: 'Boss', bpm: 152, div: 4, steps: 16, root: 48, scale: 'minor', keys: [0, 2], wet: 0.16,
    parts: {
      bass: { inst: 'bass', lo: 36, vol: 0.12, br: 10, q: 4 },
      arp: { inst: 'pluck', lo: 60, vol: 0.19, pan: 0.25, lvl: 2, br: 10, dec: 0.3 },
      stab: { inst: 'brass', lo: 55, vol: 0.06, lvl: 1, br: 5 },
      pad: { inst: 'choir', lo: 55, vol: 0.09 },
      lead: { inst: 'lead', base: 72, vol: 0.18, pan: 0.08 },
      counter: { inst: 'horn', base: 60, vol: 0.3, pan: 0.05 },
      drums: { vol: 0.3, tune: { tom: 43 } }
    },
    pat: {
      bass: { bh: 'R-------R-------', bo: 'RRORRORRORRORROR' },
      arp: { b16: '0123012301230123' },
      stab: { s1: 'X..x..x...x.x...', s2: 'X-------x-------' }
    },
    drums: {
      bI: { taiko: 'X.....x...x.....', crash: 'x...............', hat: '..x...x...x...x.' },
      b: { kick: ['x...x...x...x...', 'x...x...x...x...', 'x.x.x...x.x.x...'], taiko: ['x.........x.....', 'X.....x...x.....', 'X.....x...x...x.'], snare: [null, '....x.......x...', '....x.......x.xx'], hat: ['x.x.x.x.x.x.x.x.', 'xoxoxoxoxoxoxoxo', 'xoxxxoxxxoxxxoxx'] },
      bX: { kick: ['x...x...x...x...', 'x...x...x...x...', 'x.x.x...x.x.x...'], taiko: ['X.........x.....', 'X.....x...x.....', 'X.....x...x...x.'], snare: [null, '....x.......x...', '....x.......x.xx'], hat: ['..x.x.x.x.x.x.x.', '..xoxoxoxoxoxoxo', '..xxxoxxxoxxxoxx'], crash: 'x...............' },
      bF: { kick: 'x...x...x...x...', taiko: 'X.....x...x.x.x.', snare: '....x...x.x.xxxx', tom: [null, '..........x.x...', '..........x.x.x.'] }
    },
    sec: {
      I: { chords: ['1', '1'], bass: 'bh', stab: 's2', pad: 1, drums: 'bI' },
      A: { chords: ['1', '1', '6', '7', '1', '1', '6', '5M'], lead: 'xA|xA+harm', bass: 'bo', arp: 'b16', stab: 's1', pad: 1, drums: 'b', first: 'bX', fill: 'bF' },
      B: { chords: ['4', '1', 'b2M', '5M', '4', '1', '6', '5M'], counter: 'xB', bass: 'bo', arp: 'b16', stab: 's2', pad: 1, drums: 'b', first: 'bX', fill: 'bF' },
      C: { chords: ['6', '7', '1', '1'], bass: 'bo', arp: 'b16', stab: 's1', drums: 'b', first: 'bX', fill: 'bF' }
    },
    mel: {
      xA: "1:2 1:2 3:2 1:2 5:4 4:2 3:2 | 2:2 3:2 2:2 #7,:2 1:8 | 3:2 3:2 6:2 3:2 1':4 7:2 6:2 | 5:2 6:2 5:2 4:2 2:8 | 5:4 3:2 5:2 1':4 #7:2 1':2 | 2':4 1':2 7:2 5:8 | 6:2 5:2 4:2 3:2 4:2 5:2 6:2 7:2 | #7:4 2':4 5:8",
      xB: "6:8 5:4 4:4 | 3:8 5:8 | 6:6 4:2 b2':8 | #7:8 2':8 | 1':8 6:4 4:4 | 5:8 3:4 5:4 | 4:4 6:4 1':4 3':4 | 2':12 r:4"
    },
    forms: [['!I', 'A', 'B', 'A', 'C', 'B']]
  });

  // ---------------- 最终虫潮：更快、更紧张（A 小调，每轮升半音） ----------------
  SFX.SONGS.swarm = C({
    id: 'swarm', name: '最终虫潮', bpm: 168, div: 4, steps: 16, root: 45, scale: 'minor', keys: [0, 1, 2], wet: 0.12,
    parts: {
      bass: { inst: 'bass', lo: 40, vol: 0.12, br: 11 },
      arp: { inst: 'pluck', lo: 57, vol: 0.25, pan: -0.3, br: 12, dec: 0.25 },
      arp2: { inst: 'pluck', lo: 69, vol: 0.13, pan: 0.3, lvl: 2, br: 9, dec: 0.3 },
      pad: { inst: 'strings', lo: 57, vol: 0.022, lp: 1800 },
      stab: { inst: 'brass', lo: 57, vol: 0.07, lvl: 1, br: 6 },
      lead: { inst: 'lead', base: 69, vol: 0.18, pan: 0.06 },
      drums: { vol: 0.45 }
    },
    pat: {
      bass: { sI: 'R---------------', sp: 'R-R-O-R-R-R-O-R-' },
      arp: { s16: '0120120120120123' },
      arp2: { u8: '4.3.5.4.3.2.4.3.' },
      stab: { st: 'x..x..x.........' }
    },
    drums: {
      sI: { kick: 'x...x...x...x...', hat: '..x...x...x...x.', riser: 'x---------------' },
      s: { kick: 'x...x...x...x...', snare: ['....x.......x...', '....x.......x...', '....x..o....x..o'], hat: ['x.x.x.x.x.x.x.x.', 'xxxxxxxxxxxxxxxx', 'xxxxxxxxxxxxxxxx'], ohat: [null, '..x...x...x...x.', '..x...x...x...x.'] },
      sX: { kick: 'x...x...x...x...', snare: ['....x.......x...', '....x.......x...', '....x..o....x..o'], hat: ['..x.x.x.x.x.x.x.', '..xxxxxxxxxxxxxx', '..xxxxxxxxxxxxxx'], crash: 'x...............' },
      sF: { kick: 'x...x...x...x...', snare: 'x.x.x.x.xxxxxxxx', riser: [null, 'x---------------', 'x---------------'] }
    },
    sec: {
      I: { chords: ['1', '1'], bass: 'sI', arp: 's16', drums: 'sI' },
      A: { chords: ['1', '6', '7', '5', '1', '6', 'b2M', '5M'], lead: 'zA|zA+harm', bass: 'sp', arp: 's16', arp2: 'u8', pad: 1, stab: 'st', drums: 's', first: 'sX', fill: 'sF' },
      B: { chords: ['4', '1', '4', '5M', '6', '7', 'b2M', '5M'], lead: 'zB|zB+echo', bass: 'sp', arp: 's16', arp2: 'u8', pad: 1, stab: 'st', drums: 's', first: 'sX', fill: 'sF' }
    },
    mel: {
      zA: "1':4 5:2 1':2 3':4 2':2 1':2 | 3':4 1':2 6:2 1':8 | 2':4 7:2 4:2 7:4 2':4 | 5':4 4':2 3':2 2':8 | 1':2 1':2 3':2 5':2 4':4 3':4 | 3':4 6:2 1':2 3':8 | b2':4 4':4 6:4 b2':4 | #7:8 2':8",
      zB: "4:2 6:2 1':2 4':2 1':2 6:2 4:4 | 5:2 1':2 3':2 5':2 3':2 1':2 5:4 | 4:2 6:2 1':2 4':2 3':2 1':2 6:4 | #7:4 2':4 5':8 | 1':4 3':4 6:8 | 2':4 4':4 7:8 | 4':4 b2':4 6:4 4:4 | 5:16"
    },
    forms: [['!I', 'A', 'B', 'A', 'B']]
  });

  // 第几关放哪首（超过 3 关轮回）
  SFX.STAGE_SONGS = ['forest', 'desert', 'graveyard'];

  // ---------------- 叠加层：在正在放的曲子上面再加一层（同一个速度、同一个和弦），淡入淡出 ----------------
  // 什么时候开由 audio_hooks.js 的 M.layerFn 决定（随机事件、Boss 第二阶段）
  // { fi 淡入秒, fo 淡出秒, ks 移调半音（下一段开始）, tk 速度倍数（下一小节开始）, parts 声部, step(播放器, 层, 时刻, 第几步) }
  // step 里：p.root + p.ch 是当前和弦，p.spb 每小节几步，p.s.div 每拍几步，p.sd 每步秒数，p.bar 第几小节
  var CHOIR_SOFT = { a: 0.6, rel: 1.0 };
  // 血月：低音持续 + 每两小节一团小二度的合唱 + 心跳一样的鼓 + 每四小节一声低沉的钟（更暗、更紧）
  SFX.LAYERS.bloodmoon = {
    fi: 2.5, fo: 2.2,
    parts: { drone: { vol: 0.075 }, choir: { vol: 0.06, pan: -0.12 }, pulse: { vol: 0.45 }, bell: { vol: 0.11, pan: 0.18 } },
    step: function (p, ly, t, st) {
      var spb = p.spb, sd = p.sd, r = p.root + p.ch.root, half = spb >> 1, dub = p.s.div > 3 ? 2 : 1;
      if (st === 0) {
        p.lnote(ly, 'drone', 'drone', t, p.fit(r, 31), spb * sd * 1.02, 1);
        if ((p.bar & 1) === 0) {
          var c0 = p.fit(r, 62);
          p.lnote(ly, 'choir', 'choir', t, c0, spb * sd * 2 - 0.1, 0.85, CHOIR_SOFT);
          p.lnote(ly, 'choir', 'choir', t, c0 + 1, spb * sd * 2 - 0.1, 0.6, CHOIR_SOFT);
        }
        if ((p.bar & 3) === 0) p.lnote(ly, 'bell', 'toll', t, p.fit(r, 43), 3, 0.7);
      }
      // 心跳：每半小节“咚—咚”
      if (st === 0 || st === half) { p.lnote(ly, 'pulse', 'taiko', t, null, sd, 0.55); p.lnote(ly, 'pulse', 'heart', t, null, sd, 0.9); }
      else if (st === dub || st === half + dub) p.lnote(ly, 'pulse', 'frame', t, null, sd, 0.5);
    }
  };
  // 金袋哥布林：调皮的跳音拨弦（八分音符，三拍子的曲子用三连音）+ 反拍的铃鼓（钱袋）+ 偶尔一声音乐盒
  var GOB16 = [0, 4, 2, 4, 1, 4, 3, -1], GOB12 = [0, 2, 4, 1, 3, 5, 2, 4, 3, 4, 2, -1];
  SFX.LAYERS.goldgob = {
    fi: 0.5, fo: 0.9,
    parts: { pizz: { vol: 0.34, pan: 0.18 }, tamb: { vol: 0.4, pan: -0.1 }, box: { vol: 0.1, pan: -0.25 } },
    step: function (p, ly, t, st) {
      var tri = p.s.div === 3, sub = tri ? 1 : 2;
      if (st % sub) return;
      var i = st / sub, pat = tri ? GOB12 : GOB16, d = pat[i % pat.length];
      if (d >= 0) {
        var tones = p.voicing(p.ch, 67), nt = tones.length;
        p.lnote(ly, 'pizz', 'pizz', t, tones[d % nt] + 12 * Math.floor(d / nt), sub * p.sd * 0.45, i % 2 ? 0.7 : 1);
      }
      if (i % 2 === 1) p.lnote(ly, 'tamb', 'tamb', t, null, p.sd, 0.8);
      if (st === 0 && (p.bar & 1) === 0) p.lnote(ly, 'box', 'musicbox', t, p.fit(p.root + p.ch.root, 84), 0.5, 0.8);
    }
  };
  // Boss 第二阶段：快 6%，下一段升半音；八分音符的太鼓、每小节一个高八度的合唱和弦、反拍的铜管、每四小节一声镲
  SFX.LAYERS.phase2 = {
    fi: 0.6, fo: 1.0, tk: 1.06, ks: 1,
    parts: { taiko: { vol: 0.42 }, choir: { vol: 0.075 }, brass: { vol: 0.06, pan: 0.12 }, crash: { vol: 0.3 } },
    step: function (p, ly, t, st) {
      var div = p.s.div, sd = p.sd;
      if (st % 2 === 0) p.lnote(ly, 'taiko', 'taiko', t, null, sd, st % div === 0 ? 0.9 : 0.5);
      if (st === 0) {
        if ((p.bar & 3) === 0) p.lnote(ly, 'crash', 'crash', t, null, 1, 0.8);
        var v = p.voicing(p.ch, 67);
        for (var k = 0; k < v.length; k++) p.lnote(ly, 'choir', 'choir', t, v[k], p.spb * sd - 0.05, 0.9, CHOIR_SOFT);
      }
      if (st === div + (div >> 1) || st === div * 3 + (div >> 1)) {
        var b = p.voicing(p.ch, 55);
        for (var j = 0; j < b.length; j++) p.lnote(ly, 'brass', 'brass', t, b[j], sd * 1.6, 0.9, { br: 6, a: 0.015, rel: 0.1 });
      }
    }
  };

  // ---------------- 插曲：[拍, 乐器, 音级（数组 = 和弦）, 拍数, 力度, 参数]；调跟着当前曲子 ----------------
  var roll = function (from, to, step, inst, pitch, v0, v1, o) {
    var out = [], n = Math.round((to - from) / step);
    for (var i = 0; i < n; i++) out.push([from + i * step, inst, pitch, step * 1.5, v0 + (v1 - v0) * i / Math.max(1, n - 1), o]);
    return out;
  };
  var PL = { br: 12, dec: 0.6 };
  // 升级：拨弦往上跑 + 一串铃声 + 轻轻的铜管和弦
  SFX.STINGS.levelup = {
    bpm: 150, scale: 'major', len: 2.6, duck: 0.35, vol: 0.6,
    ev: [
      [0, 'pluck', 1, 0.25, 0.8, PL], [0.25, 'pluck', 3, 0.25, 0.85, PL], [0.5, 'pluck', 5, 0.25, 0.9, PL], [0.75, 'pluck', "1'", 0.25, 1, PL],
      [1, 'bell', ["3'", "5'"], 1.6, 0.32, { dec: 1.6 }],
      [1, 'brass', [1, 3, 5], 1.1, 0.26, { oct: -12, br: 5, a: 0.03, rel: 0.4 }],
      [1, 'tamb', null, 0.2, 0.7]
    ]
  };
  // 超武觉醒：定音鼓滚奏渐强 → I – bVI – bVII – I 的英雄终止，合唱 + 铜管，最后钟声琶音和镲
  SFX.STINGS.evolve = {
    bpm: 96, scale: 'major', len: 8.5, duck: 0.15, vol: 0.75,
    ev: roll(0, 2, 0.125, 'timp', 1, 0.2, 0.75, { oct: -24 }).concat([
      [0, 'riser', null, 2, 0.8],
      [2, 'brass', [1, 3, 5], 0.95, 0.42, { oct: -12, br: 5 }], [2, 'choir', [1, 3, 5], 1, 0.3, {}],
      [3, 'brass', ['b6,', 1, 'b3'], 0.95, 0.42, { oct: -12, br: 5 }], [3, 'choir', ['b6,', 1, 'b3'], 1, 0.3, {}],
      [4, 'brass', ['b7,', 2, 4], 0.95, 0.45, { oct: -12, br: 6 }], [4, 'choir', ['b7,', 2, 4], 1, 0.32, {}],
      [5, 'brass', [1, 3, 5, "1'"], 3, 0.5, { oct: -12, br: 6, rel: 0.6 }], [5, 'choir', [1, 3, 5], 3, 0.36, { rel: 0.9 }],
      [5, 'timp', 1, 1, 1, { oct: -24 }], [5, 'crash', null, 2, 0.8], [5, 'taiko', null, 1, 0.9],
      [5, 'bell', "1'", 1, 0.3], [5.5, 'bell', "3'", 1, 0.3], [6, 'bell', "5'", 1, 0.3], [6.5, 'bell', "1''", 1.5, 0.32]
    ])
  };
  // Boss 倒下 / 过关：短号角（三连音弱起）
  SFX.STINGS.bossdown = {
    bpm: 120, scale: 'major', len: 6.2, duck: 0.1, vol: 0.75,
    ev: [
      [0, 'brass', '5,', 0.3, 0.7, { br: 7 }], [0.333, 'brass', '5,', 0.3, 0.75, { br: 7 }], [0.667, 'brass', '5,', 0.3, 0.8, { br: 7 }],
      [1, 'brass', 1, 1.4, 0.9, { br: 7 }], [1, 'brass', [1, 3, 5], 1.4, 0.45, { oct: -12, br: 5 }], [1, 'timp', 1, 1, 0.9, { oct: -24 }],
      [2.5, 'brass', 3, 0.45, 0.85, { br: 7 }], [2.5, 'brass', ['5,', '7,', 2], 1, 0.42, { oct: -12, br: 5 }], [2.5, 'timp', 5, 1, 0.8, { oct: -24 }],
      [3, 'brass', 5, 0.45, 0.85, { br: 7 }],
      [3.5, 'brass', "1'", 2.2, 1, { br: 8, rel: 0.5 }], [3.5, 'brass', [1, 3, 5], 2.2, 0.5, { oct: -12, br: 5, rel: 0.5 }],
      [3.5, 'timp', 1, 1, 1, { oct: -24 }], [3.5, 'crash', null, 2, 0.8],
      [3.5, 'bell', "3'", 1, 0.25], [3.75, 'bell', "5'", 1, 0.25], [4, 'bell', "1''", 1.5, 0.28]
    ]
  };
  // 通关：用主菜单的开头动机做一段完整的号角
  SFX.STINGS.victory = {
    bpm: 96, scale: 'major', len: 11, duck: 0.05, vol: 0.75,
    ev: [
      [0, 'horn', '5,', 0.5, 0.8], [0.5, 'horn', 1, 0.5, 0.85], [1, 'horn', 2, 0.5, 0.85], [1.5, 'horn', 3, 0.5, 0.9],
      [2, 'horn', 4, 1.5, 0.95], [3.5, 'horn', 3, 0.5, 0.85], [4, 'horn', 2, 1, 0.85], [5, 'horn', 3, 1, 0.9], [6, 'horn', 5, 1, 0.95],
      [7, 'horn', "1'", 3.5, 1],
      [0, 'strings', [1, 3, 5], 2, 0.4, { oct: -12 }], [2, 'strings', [4, 6, "1'"], 2, 0.4, { oct: -12 }],
      [4, 'strings', ['5,', '7,', 2], 1, 0.4, { oct: -12 }], [5, 'strings', [1, 3, 5], 2, 0.42, { oct: -12 }],
      [7, 'strings', [1, 3, 5, "1'"], 3.5, 0.5, { oct: -12, rel: 1.2 }], [7, 'brass', [1, 3, 5], 3.2, 0.42, { oct: -12, br: 5, rel: 0.8 }],
      [0, 'lute', 1, 1, 0.5, { oct: -12 }], [1, 'lute', 5, 1, 0.45, { oct: -12 }], [2, 'lute', 4, 1, 0.5, { oct: -12 }], [3, 'lute', 6, 1, 0.45, { oct: -12 }],
      [4, 'lute', 5, 1, 0.5, { oct: -12 }], [5, 'lute', 3, 1, 0.45, { oct: -12 }], [6, 'lute', 5, 1, 0.5, { oct: -12 }]
    ].concat(roll(6, 7, 0.125, 'timp', 5, 0.25, 0.8, { oct: -24 })).concat([
      [7, 'timp', 1, 1.5, 1, { oct: -24 }], [7, 'crash', null, 3, 0.9],
      [7, 'bell', "1'", 1, 0.3], [7.5, 'bell', "3'", 1, 0.3], [8, 'bell', "5'", 1, 0.3], [8.5, 'bell', "1''", 2, 0.32]
    ])
  };
  // 发现秘密地点：竖琴快速往上扫（利底亚音阶，升四级带一点神秘感），音乐盒回答一句，合唱轻轻托住
  // （和成就的三角波琶音、升级的拨弦 + 铜管都不一样）
  SFX.STINGS.secret = {
    bpm: 108, scale: 'major', len: 4.2, duck: 0.4, vol: 0.6,
    ev: [
      [0, 'harp', 1, 0.5, 0.55], [0.08, 'harp', 2, 0.5, 0.58], [0.16, 'harp', 3, 0.5, 0.6], [0.24, 'harp', '#4', 0.5, 0.62],
      [0.32, 'harp', 5, 0.5, 0.64], [0.4, 'harp', 6, 0.5, 0.66], [0.48, 'harp', 7, 0.5, 0.68], [0.56, 'harp', "1'", 0.6, 0.7],
      [0.64, 'harp', "2'", 0.6, 0.7], [0.72, 'harp', "3'", 1.2, 0.72],
      [1, 'musicbox', "5'", 0.5, 0.42], [1.5, 'musicbox', "#4'", 0.5, 0.4], [2, 'musicbox', "7'", 0.5, 0.4], [2.5, 'musicbox', "5'", 1.5, 0.44],
      [1, 'choir', [1, 3, '#4'], 2.6, 0.2, { oct: -12, a: 0.5, rel: 1 }],
      [1, 'bell', "1''", 1.6, 0.18, { dec: 2 }]
    ]
  };
  // 阵亡：慢的小调和弦往下走，竖笛一个一个音往下落，深沉的钟声
  SFX.STINGS.defeat = {
    bpm: 72, scale: 'minor', len: 8.5, duck: 0.05, vol: 0.55,
    ev: [
      [0, 'toll', 1, 4, 0.55, { oct: -24 }],
      [0, 'strings', [1, 3, 5], 2, 0.42, { oct: -12, a: 0.3 }],
      [2, 'strings', ['6,', 1, 3], 2, 0.4, { oct: -12, a: 0.3 }],
      [4, 'strings', ['4,', '6,', 1], 1.5, 0.38, { oct: -12, a: 0.3 }],
      [5.5, 'strings', ['5,', '#7,', 2], 2.5, 0.36, { oct: -12, a: 0.3, rel: 1.5 }],
      [0.5, 'flute', 5, 1, 0.38], [1.5, 'flute', 4, 1, 0.36], [2.5, 'flute', 3, 1, 0.34], [3.5, 'flute', 2, 1, 0.32], [4.5, 'flute', 1, 3, 0.3],
      [5.5, 'toll', 1, 4, 0.4, { oct: -24 }]
    ]
  };
})();
