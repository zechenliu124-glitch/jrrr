# Brief: the orioles (黄鹂鸟)

Paint the oriole character (黄鹂鸟 = black-naped oriole, Oriolus chinensis) as a reusable library. Write
`art/lib/oriole.svg` and `art/lib/oriole.preview.svg`; render with
`ONLY_LIBS=common,oriole node tools/render.js preview art/lib/oriole.preview.svg build/review/oriole.png --scale 1`.

Realistic bird anatomy (not cartoon): golden-yellow body (low saturation, palette), a black band from the base of
the beak through the eye to the nape, black wings with yellow-edged feathers (folded, visible wing on the near
side), black tail with yellow tips, pinkish beak, grey legs and toes gripping a branch. Eye: a small dark bead
with a tiny highlight inside the black band. Gentle, lively, a little mischievous (they giggle at the snail)
through posture only.

Pose: perched, facing LEFT (beak toward −x), body slightly tipped forward so it looks down-left (at the snail
below). Length beak tip to tail tip ≈ 250 px. Local origin (0,0) = where the feet grip the top of the branch (the
branch itself is NOT part of the bird).

Parts (each a `<g id>` inside `<defs>`, all in the same local coordinate system):
- `oriole-body` : body, breast, back, tail, legs and feet — without the head and without the near wing.
- `oriole-head` : head, beak, eye, eye-stripe, part of the neck. Pivot = neck (document it). Overlaps the body
  ≥ 20 px so tilting it ±15° around the pivot is seamless (it is layered ABOVE the body).
- `oriole-wing` : the near-side folded wing. Pivot = shoulder (document it). Layered above body and head. It will
  flap: rotated around the shoulder so the wing lifts by up to 25–30° and returns (state which sign raises it —
  for a left-facing bird with the wing lying back along the body, a NEGATIVE svg rotation usually lifts the tip).
  It must look natural and attached at both extremes; the root is rounded and overlaps the body.
- `oriole` : assembled = oriole-body, oriole-head, oriole-wing.

Preview sheet (about 1800 × 1000, soft sky backdrop): (a) two orioles perched on a painted branch bar (one at
scale 1, one at 0.94 scale with a slightly different head angle); (b) wing at 0 and at the lifted extreme;
(c) head tilted −15° and +15°; (d) an exploded parts view with red pivot circles; (e) a small 0.6 version.
