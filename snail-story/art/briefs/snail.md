# Brief: the hero snail (小蜗牛) — competing design

Write `<DIR>/snail.svg` (library) and `<DIR>/snail.preview.svg` (preview sheet); render the preview to
`build/review/<NAME>.png` with `ONLY_LIBS=common node tools/render.js preview <DIR>/snail.preview.svg build/review/<NAME>.png --scale 1 --lib <DIR>/snail.svg`.
(Another illustrator paints a competing design; an art director will pick one.)

Anatomy (realistic garden snail, e.g. Cornu aspersum, but gentle and friendly): spiral shell (helix with 4–5
whorls, visible growth lines, soft darker spiral bands, glossy highlight upper-left, aperture lip at the
front-bottom); soft body with fine reticulated skin texture, a lighter translucent foot fringe along the ground,
tapering tail behind the shell; head with two long upper tentacles (eyestalks) ending in small slightly bulbous
tips with dark eyes (tiny highlight), two short lower tentacles. No mouth line, no cartoon eyes.

Local coordinate system (shared by ALL parts so they assemble by using them with the same transform):
origin (0,0) = centre of the foot's contact line with the ground; the snail faces +x (right); ground is y = 0,
the snail is above it (negative y). Total length tail-tip to head-front ≈ 300 px; shell diameter ≈ 165 px;
eyestalk tips reach ≈ y −200.

Parts (each a `<g id>` inside `<defs>`):
- `snail-shell` : the shell only.
- `snail-body` : foot, tail and the soft body under/behind the shell — everything soft EXCEPT the neck/head.
- `snail-head` : neck + head + both eyestalks + lower tentacles. Pivot = neck root (choose it, document it, e.g.
  near (95,−45)). It will be layered BELOW snail-body and snail-shell, so let its neck root extend ≥ 25 px back
  under them; rotating it between −25° (looking up) and +10° around the pivot must stay seamless.
- `snail-head-base` : snail-head without the two eyestalks.
- `snail-stalk-near`, `snail-stalk-far` : the two eyestalks with eyes, in assembled position; pivot = each
  stalk's base (document both). They will sway ±8° around the base. The far one slightly darker/thinner.
- `snail-shadow` : soft contact shadow under the foot (separate; not part of `snail`).
- `snail` : assembled = snail-head, snail-body, snail-shell (in this z-order).
- `snail-headup` : assembled with the head rotated −22° around the neck pivot (looking up at the sky).

Preview sheet (about 1800 × 1100, a simple soft sky/grass backdrop drawn with gradients + wc-wash):
(a) snail at scale 1 on grass with its shadow; (b) the snail rotated −63° sitting on a diagonal brown trunk bar,
as when climbing; (c) the snail rotated −90° on a vertical trunk; (d) snail-headup; (e) the head rotated −25° and
+10° around the neck pivot, layered below body+shell, proving there is no seam; (f) eyestalks swayed −8°/+8°;
(g) an exploded view of all parts, each with its pivot marked by a small red circle; (h) the snail at scale 0.6.
