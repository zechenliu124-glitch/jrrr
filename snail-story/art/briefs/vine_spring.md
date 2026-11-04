# Brief: the spring grapevine (slides 2, 3, 4/5, 6)

Write `art/lib/vine.svg` (prefix `vine-`) and preview sheets; render them to `build/review/vine-*.png`
(use `ONLY_LIBS=common,vine`). Also read `art/briefs/vine_style.md`.

Reusable parts (inside `<defs>`, local origin = petiole base, leaf pointing up −y): `vine-leaf-young-a`,
`vine-leaf-young-b` (spring, ≈70 px), `vine-tendril-a`, `vine-tendril-b`.

Per-slide layers drawn directly in SLIDE coordinates (1920×1080), following the slide-layout table in
ART_BRIEF section 4 exactly (trunk centrelines, branch line, twig, bases):
- `vine-s2` : the short young vine of slide 2 WITHOUT the new shoot.
- `vine-s2-sprout` : the new shoot only (thin fresh green stem curving up from (972,470) to ≈(1005,360), curled
  tip). Pivot = (972,470). It will 'grow' in PowerPoint by scaling up from its pivot and rotating from −20° to 0,
  so its base must overlap the trunk top.
- `vine-s2-leaf-l`, `vine-s2-leaf-r` : two tiny unfolding young leaves on the shoot (bases ≈(982,425) and
  ≈(995,395)); pivot = leaf base; they unfold by rotating ±35° → 0 and scaling up from the base.
- `vine-s3` : the mature spring vine of slide 3 (base (1560,672), canopy top-right). Must not cover x 200–1300,
  y 560–820.
- `vine-s45` : trunk + branch for slides 4 and 5 (centreline and branch exactly as listed; the branch top surface
  ≈ y 254 between x 1100 and 1420 where the birds perch — keep that stretch free of leaves above the branch so
  the birds sit clearly; leaves elsewhere). The snail sits on the trunk's upper-left surface around (680,600):
  keep that part of the trunk free of leaves.
- `vine-s6` : the wide trunk close-up (≈220 px wide face-on trunk, centreline as listed) with the small twig at
  ≈(975,455) pointing up-right, side shoots with static leaves, but WITHOUT the three swaying leaves.
- `vine-s6-leaf-1`, `vine-s6-leaf-2`, `vine-s6-leaf-3` : three leaves on side shoots of slide 6, each a separate
  group in slide coordinates with its pivot (petiole base) documented; at least one on each side of the trunk;
  they sway ±6°, so their stalks overlap the shoot they attach to. Keep the snail's climbing lane on the trunk face
  (x 780–1060) free of leaves.

Preview: draw each slide layer over a simple placeholder backdrop (pale sky gradient + a flat grass band roughly
matching the brief's ground lines) in its own preview file `art/lib/vine-<slide>.preview.svg` at 1920×1080,
render each at --scale 0.5 and look at all of them; plus `art/lib/vine.preview.svg` showing the parts. These
are separate pictures layered in PowerPoint — the sprout/leaves must look right both when present and absent.
