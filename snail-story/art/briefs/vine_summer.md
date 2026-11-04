# Brief: the summer grapevine (slides 7, 8, 9)

Write `art/lib/vinesum.svg` (prefix `vinesum-`) and preview sheets; render them to `build/review/vinesum-*.png`
(use `ONLY_LIBS=common,vinesum`). Also read `art/briefs/vine_style.md`. (Another illustrator paints the spring
vine in art/lib/vine.svg at the same time; if it already exists you may look at it for consistency of bark and
leaf style, but never edit it.)

Reusable parts (inside `<defs>`, local origin = petiole base, leaf pointing up −y): `vinesum-leaf-a`,
`vinesum-leaf-b`, `vinesum-leaf-c` (mature, ≈150 px, different shapes/angles), `vinesum-tendril`.

Per-slide layers drawn directly in SLIDE coordinates (1920×1080), following ART_BRIEF section 4 exactly:
- `vinesum-s7` : lush canopy of mature leaves across the top on a simple trellis (y 0–260, full width) + the
  branch rising from the lower left (centreline (300,860) → (700,660) → (1000,520) → (1300,380) → tip (1430,330),
  thickness 70 → 28; its top surface is where the snail walks, so keep it clear of leaves along the top surface
  between x 650 and 1330). NO grapes (they are separate pictures hanging at stem tops ≈ (240,230), (520,270),
  (800,230), (1560,250), (1780,220), (1660,470) — draw short peduncle stubs / attachment points there and leave
  room below each for a 150–200 px bunch).
- `vinesum-s8` : bottom-left corner: the top of the vine canopy (leaves, a sturdy branch top) on which the snail
  stands with its foot at (430,660) — the surface under x 300–560 must be at y≈660. Leaves may extend to the
  bottom-left corner but stay soft and light under the caption band (y > 840) and never cover the snail area
  (x 260–620, y 440–660). Sky everywhere else.
- `vinesum-s9-far` : the small distant vine at mid-right (x 1250–1700) on a simple trellis, summer leaves,
  painted softer (wc-blur-far or lighter values); list 3–4 stem-top coordinates where tiny grape bunches will be
  hung.
- `vinesum-s9-perch` : a broad grape leaf / branch in the foreground left-centre on which the snail sits (foot at
  (720,620): surface under x 560–880 at y≈620). Keep the area above it (x 520–1000, y 300–620) free for the snail.

Preview: draw each layer over a simple placeholder backdrop (pale sky gradient, distant grass) in
`art/lib/vinesum-<slide>.preview.svg` at 1920×1080 and render at --scale 0.5; plus `art/lib/vinesum.preview.svg`
with the parts.
