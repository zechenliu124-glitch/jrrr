# Brief: environment (skies, far scenery, ground; sun, clouds, grass tufts)

Write `art/lib/env.svg` (prefix `env-`) and preview sheets; render to `build/review/env-*.png`
(use `ONLY_LIBS=common,env`).

Per-slide backgrounds drawn in SLIDE coordinates (1920×1080, washes overhanging the edges by ≥ 60 px), following
the slide-layout table in ART_BRIEF section 4 exactly (ground surface lines must match the numbers, because the
vine and snail are drawn by others on top):
- `env-bg-s1` : big calm light-blue sky — the title goes in x 360–1560, y 130–500, keep it quiet; at most a few
  very faint soft clouds low or at the sides; the grassy hill polyline from the brief; soft far hills.
- `env-bg-s2` : meadow, flat ground y≈795, a small soil patch around (960,800).
- `env-bg-s3` : ground y = 842 − 0.11·x up to x 1450, a low mound to the vine base (1560,672), flattening to
  y≈690 at the right edge.
- `env-bg-s45` : sky behind the vine; grass at the bottom y≈860; bright and clean.
- `env-bg-s6` : bright sky; a soft warm light patch toward the top-right where the sun will be; distant soft
  greenery at the bottom.
- `env-bg-s7` : summer sky behind a canopy, warm light.
- `env-bg-s8` : wide high sky, deeper blue at the top fading lighter downward; a faint far landscape very low at
  the bottom right — fields and hills seen from high above.
- `env-bg-s9` : gentle wide view: soft sky with a warm glow near the horizon, far hills, a meadow, calm (温柔远景).
Keep the caption band (y 840–1060) calm and fairly light in every slide (except s1, which has no captions there).
No vine and no characters (other illustrators paint those). Meadows: soft wash with subtle variation and a few
delicate grass strokes, not busy; far hills faded blue-green with wc-blur-far.

Reusable parts (inside `<defs>`):
- `env-sun` : origin = centre; disc radius ≈ 85, warm and soft, with a broad gentle glow (≈ 230 radius) via
  wc-glow; low saturation, never glaring.
- `env-cloud-a`, `env-cloud-b`, `env-cloud-c` : soft watercolour cumulus clouds, widths ≈ 420 / 340 / 260,
  origin = centre; white with pale blue-grey shading at the bottom, soft edges.
- `env-grass-tuft-a`, `env-grass-tuft-b`, `env-grass-tuft-c` : clumps of grass blades 70–130 px tall, origin =
  base centre; they sway ±5° around the base.
- `env-paper` : a paper-texture overlay rect covering (−60,−60)–(1980,1140), filter wc-paper, style
  mix-blend-mode:multiply — scenes put it on top of the background.

Preview: `art/lib/env.preview.svg` as a 1920×2160 grid of the eight backgrounds at half size (nested
`<svg x y width="960" height="540" viewBox="0 0 1920 1080">`), render at --scale 1; plus
`art/lib/env-parts.preview.svg` with the sun, clouds and tufts. Also render at least s1, s3 and s8 alone at full
size to check detail.
