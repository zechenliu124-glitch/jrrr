# 《勇敢的小蜗牛》 Art brief (for every illustrator agent)

A 9-slide 16:9 PowerPoint for a kindergarten story contest (a child tells the story, an adult clicks).
All art is hand-written SVG, rendered to PNG by `tools/render.js`, then placed into PowerPoint as
separate pictures so that individual elements (snail, birds, wings, heads, leaves, grapes, sun, clouds)
can be animated. **Your art must look like a soft, realistic watercolour picture book.**

## 1. Look and feel (hard requirements)

* 柔和绘本风 · 明亮干净 · 低饱和度 · **写实绘本** (realistic picture-book) · **NOT chibi/Q-version, NOT cartoon**.
  - Natural anatomy and proportions. A snail looks like a real garden snail (eyes at the tips of the long upper
    tentacles, short lower tentacles, textured skin, spiral shell with growth lines). Orioles look like real
    black-naped orioles (黑枕黄鹂). Grapes look like real bunches. Leaves are real grape leaves (5-lobed, toothed).
  - No big cartoon eyes, no smiling mouths, no blush cheeks, no thick black outlines, no sparkles, no hearts.
  - Gentle and friendly: soft light, rounded forms, warm highlights. Children aged 4–6 will watch it on a big screen.
* Clean compositions, no clutter, nothing scary. Every slide shows only what the narration mentions.
* Light comes from the **upper left**. Shading is soft (radial / linear gradients), shadows fall down-right and are
  never harsh. Contact shadows: blurred ellipse, opacity ≤ 0.25, a darker tone of the surface colour (never black).
* Linework (optional): thin (1.2–2.5 px at scale 1), darker tone of the local colour, opacity 0.4–0.7, through
  `filter="url(#wc-line)"`. Never pure black lines.
* Texture: apply the shared watercolour filters from `art/lib/common.svg` (do not redefine them):
  - `wc-paint` on painted objects (apply it to a whole group — a body, a leaf, a cluster — not to hundreds of tiny
    elements one by one), `wc-paint-soft` on small/thin parts, `wc-wash` on big background washes,
    `wc-line` on lines, `wc-blur-far` on far-away scenery, `wc-glow` for soft glows (sun).
  - Full-bleed washes must overhang the canvas by ≥ 60 px on every edge (the wobble filter eats edges).
* Detail level: realistic but painterly — volume, subtle colour variation, a few texture strokes. Not photoreal.

## 2. Palette (low saturation; stay inside these families)

| Use | Colours |
|---|---|
| Sky | top `#B9D6E8`, middle `#CFE4EF`, horizon `#EAF3F2`; high sky (slide 8) top `#A9CBE2` |
| Clouds | `#FFFFFF`, shade `#DCE8EF`, deep shade `#C9DAE5` |
| Far hills | `#B7CFC3`, `#A9C5B3`, mid hills `#A3C28E` |
| Meadow | light `#C5DBA6`, mid `#A9C98B`, deep `#86AD6A`, shadow `#6F9457` |
| Soil | `#B89B7E`, `#9C7F64` |
| Vine wood / bark | highlight `#CDB89D`, light `#B49A7C`, mid `#94785D`, dark `#6F5844` |
| Spring leaves (slides 2–6) | `#D6E7AE`, `#BCD68F`, veins `#8DB36A` |
| Summer leaves (slides 7–9) | `#A7C784`, `#8DB46C`, `#739C58`, shadow `#5F8A4E` |
| Grapes | highlight `#BCAFD3`, light `#9D8BBE`, mid `#8572A8`, deep `#634F86`, darkest `#4C3D6B`; bloom `#E6E0EE` (dusty, low opacity); stems `#8E8A5C` |
| Snail shell | highlight `#F1DDBB`, light `#E2C394`, mid `#C9A06E`, bands `#9F7550`, dark `#7E5B3E` |
| Snail body | light `#DDD2C4`, mid `#BFB1A0`, dark `#9A8C7B`, foot fringe `#EAE2D6`, eye `#3E3833` |
| Oriole | yellow light `#F6E2A0`, mid `#EBCB72`, shade `#CFAE55`; soft black `#3F3C3A`; wing-edge yellow `#E8CF85`; beak `#DE9A8E` / `#C97F72`; legs `#8E8C8E` |
| Sun | core `#FBE7B5`, glow `#F7D98E` |

## 3. Technical contract

* One SVG file per library in `art/lib/<name>.svg`. Root `<svg xmlns="http://www.w3.org/2000/svg">`; put every
  reusable part as `<g id="...">` **inside `<defs>`**. All ids (parts, gradients, clip paths, masks, local filters)
  start with the library prefix (`snail-`, `oriole-`, `vine-`, `grape-`, `env-`) so libraries never collide.
* `tools/render.js` injects every `art/lib/*.svg` (except `*.preview.svg`) into the page, so any file can
  `<use href="#snail"/>`. Use `href` (SVG2), not only `xlink:href`.
* Make a preview sheet `art/lib/<name>.preview.svg` (any size) that shows all your parts, and render it:
  `node tools/render.js preview art/lib/<name>.preview.svg build/review/<name>.png --scale 1`
  (add `--lib <file>` to inject a library that is not in `art/lib/`). Then **look at the PNG with the Read tool**
  and fix what looks wrong. Iterate (at least 3 look-and-fix rounds). Check against section 1 every time.
* No `<image>`, no `<foreignObject>`, no `<script>`, no CSS animation, no external references. Plain SVG 1.1/2
  that Chromium renders. Keep render time reasonable (no filters on hundreds of separate elements).
* Coordinates: slides are **1920 × 1080**. Parts have the local origin documented below.
* **Pivots.** Some parts will be rotated in PowerPoint around a pivot (wing shoulder, neck, petiole, eyestalk base).
  Draw such a part so that rotating it ±20° around its pivot still looks attached: let the root of the part
  overlap the body it attaches to (≥ 20 px), with soft colour continuity, so no gap or seam ever shows.
  Document every pivot's local coordinates in a comment at the top of your file and in your final report.

## 4. Slide layouts (all coordinates in slide pixels, 1920 × 1080)

Captions are added later in the **caption band y ≈ 840–1060** (centred). Keep that band calm (soft grass / sky, no
characters, no high-contrast detail). Slide 1 has its title in the **sky zone x 360–1560, y 130–500** instead.

| Slide | Narration (what must be shown) | Layout |
|---|---|---|
| 1 cover | 草地上一只背着壳的小蜗牛，浅蓝天 | Big calm light-blue sky (title area). A grassy hill rises from the lower-left corner: ground surface polyline (−60,1044) → (760,870) → (1000,836) crest → (1300,845) → (1980,880); meadow below it. Snail rests with foot-centre at (760,870), rotated −12°, length ≈ 340 (it crawls in from off-screen lower-left along the slope). Soft far hills at y≈600–720. |
| 2 | 从前，有一棵葡萄树，嫩嫩的绿芽刚刚冒出来 | Meadow, flat ground surface y≈795, a small soil patch around the vine base (960,800). A **short young grapevine** (矮矮的葡萄藤): woody gnarled trunk from (960,800) up to its top at (972,470), two short arms, 3–4 small young leaves. At the top a **new shoot** grows from (972,470) up to ≈(1005,360) with a curled tip, plus two tiny unfolding leaves (bases ≈(982,425) and ≈(995,395)). |
| 3 | 一只小蜗牛，背着重重的壳，慢慢爬过来啦…我要爬到葡萄树上 | Ground rises gently to the right: y = 842 − 0.11·x for x ≤ 1450, then a low mound with the **grapevine base at (1560,672)**, flattening to the right edge (y≈690). The mature vine (spring: young light leaves, tendrils) rises from (1560,672) to the top, its branches spreading across the top right (x 1150–1920, y 60–320); optional weathered wooden support post. Snail starts at foot (380,800), rotated −6.3°, length ≈ 300, crawls to foot (1180,712). Keep x 200–1300, y 560–820 clear. |
| 4 & 5 (same background) | 两只黄鹂鸟在葡萄枝上，低头看蜗牛，蜗牛在下方 / 蜗牛停下，抬头望黄鹂 | Grass at the bottom (y≈860). **Vine trunk** (≈110 px thick at base, ≈60 px at top) along the centreline (560,920) → (610,760) → (680,600) → (760,460) → (850,340) → (960,285), then a near-horizontal **branch** (≈34 px thick) (960,285) → (1250,270) → (1550,262) → (1760,275) with spring leaves along and above it, a few small ones hanging below, tendrils. The branch's top surface is at y≈254 for x 1100–1420 (the birds perch there: bird 1 feet (1130,256), bird 2 feet (1400,252), both facing left, looking down-left at the snail). Snail (length ≈ 260) sits on the trunk's upper-left surface around centreline point (680,600), rotated −63° (head pointing up-right along the trunk). |
| 6 | 太阳晒得暖暖的…一步一步往上爬…风吹过来…小枝丫挡住它，绕一绕 | Close-up up the trunk. Bright sky; **sun** top-right at (1690,175). A **wide trunk (≈220 px)** runs vertically through the frame, centreline (930,1120) → (915,850) → (930,600) → (950,350) → (960,80) → (965,−40), seen face-on so the snail can crawl up its front face. A **small twig** with one or two leaves sticks out of the trunk face at about (975,455) pointing up-right (the snail detours left around it). A few side shoots with spring leaves left and right of the trunk; three of those leaves sway in the wind (separate parts with pivots). Grass tufts at the bottom left/right also sway. Snail (length ≈ 300) climbs head-up (rotated −90°) from centre (930,760) to (940,230), detouring to x≈850 near y 380–520. |
| 7 | 日子一天天过去…结满了紫莹莹的葡萄…小蜗牛终于爬到了高高的葡萄树上 | Summer. Lush canopy of mature leaves across the top (y 0–260, full width, on a trellis). A **branch** rises from the lower left: centreline (300,860) → (700,660) → (1000,520) → (1300,380) → tip (1430,330), thickness 70 → 28. Six grape bunches hang from the canopy (stem tops ≈ (240,230), (520,270), (800,230), (1560,250), (1780,220), (1660,470)). Snail (length ≈ 260) climbs along the branch top surface from foot ≈(700,625) to foot ≈(1250,350), rotated −25°, and stops near the tip (枝头). |
| 8 | 风吹干它流过的汗，它站在高高的地方，看见了蓝蓝的天 | Wide high sky (deeper blue at top, clean, a lot of space). Bottom-left: the top of the vine canopy (leaves, a branch top) where the snail stands, foot (430,660), facing right, head raised to the sky. A faint far landscape (fields, hills) very low at the bottom right suggests height. Clouds (separate parts) drift slowly left→right in the upper half. |
| 9 end | 我的故事讲完啦，谢谢大家！ | Gentle wide view (温柔远景): soft sky with warm light near the horizon, far hills, meadow; the grapevine with grapes small at mid-right (x 1250–1700); in the foreground left-centre a broad grape leaf / branch on which the snail (length ≈ 380) sits, foot (720,620), facing right, head raised looking at the sky. Its eyestalks wiggle gently (separate parts). |

Snail lengths are shell-back to head-front. Scale your parts so the library default matches the sizes listed in
your section below; scenes will scale by ±20 %.
