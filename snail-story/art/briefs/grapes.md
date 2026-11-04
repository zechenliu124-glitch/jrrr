# Brief: the grape bunches (紫莹莹的葡萄)

Write `art/lib/grape.svg` (prefix `grape-`) and `art/lib/grape.preview.svg`; render with
`ONLY_LIBS=common,grape node tools/render.js preview art/lib/grape.preview.svg build/review/grape.png --scale 1`.

Realistic, luminous, ripe purple grapes, low-saturation palette 'Grapes': each berry a slightly oval sphere with a
soft gradient (highlight upper-left, deeper colour lower-right), a dusty pale bloom, a tiny soft specular
highlight on front berries; back berries darker and partly hidden; berries vary slightly in size and hue;
realistic tapered bunch shapes (shoulders, conical, some with a small wing cluster), olive-brown branching
peduncle visible at the top; a couple of bunches have a small curl of tendril or a leaf stub.

Parts (inside `<defs>`), local origin (0,0) = top of the stem where the bunch attaches; the bunch hangs down (+y):
- `grape-cluster-1` … `grape-cluster-6` : six different bunches, heights 150–220 px, widths 90–150 px.
- `grape-cluster-small-1`, `grape-cluster-small-2` : two tiny bunches ≈ 50–70 px tall for a distant vine
  (simpler, softer).
Each bunch is one group with its own filter (they are separate animated pictures).

Preview sheet (≈1800 × 800): all bunches hanging from a painted green leafy bar over a soft sky backdrop, plus
one bunch at 2× scale for detail checking.
