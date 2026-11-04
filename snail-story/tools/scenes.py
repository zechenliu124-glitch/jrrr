#!/usr/bin/env python3
"""Compose the nine slide scenes (art/scenes/s1.svg … s9.svg) from the art library.

Each scene is a 1920x1080 SVG whose top-level groups are layers:
  data-layer="bg"  merged into the slide background picture
  data-layer="el"  a separate picture in PowerPoint (animated); its id is the name used in tools/story.py
A <circle class="pivot"> inside an el group marks the point it rotates/grows around (render.js measures it).

    python3 tools/scenes.py          # write all scenes
"""
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'art' / 'scenes'

# ---- library facts (local coordinates documented in the art files) -----------------------------
SNAIL_LEN = 311                       # tail tip -> head front at scale 1
SNAIL_NECK = (80, -38)                # snail-head pivot
SNAIL_STALK_NEAR = (123.6, -76)         # eyestalk base pivots
SNAIL_STALK_FAR = (112, -73.5)
ORIOLE_NECK = (-64, -72)              # oriole-head pivot
ORIOLE_SHOULDER = (-40, -68)          # oriole-wing pivot (negative rotation lifts the wing)
ORIOLE_FLY_NEAR = (-36, -76)          # oriole-fly-wing-near shoulder (spread wing, flaps ±22°)
ORIOLE_FLY_FAR = (-20, -74)           # oriole-fly-wing-far shoulder (rotates with the near wing)


def tf(x, y, rot=0.0, s=1.0, flip=False):
    sx = -s if flip else s
    return f'translate({x:.1f} {y:.1f}) rotate({rot:.2f}) scale({sx:.4f} {s:.4f})'


def use(ref, extra=''):
    return f'<use href="#{ref}"{extra}/>'


def pivot(x, y):
    return f'<circle class="pivot" cx="{x}" cy="{y}" r="0.5" fill="none"/>'


def layer(id_, kind, inner):
    # DOM id gets a "layer-" prefix so it can never clash with a library part id (e.g. the part "snail")
    return f'<g id="layer-{id_}" data-layer="{kind}">{inner}</g>'


def svg(*layers):
    return ('<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            'width="1920" height="1080" viewBox="0 0 1920 1080">\n' + '\n'.join(layers) + '\n</svg>\n')


def bg(*refs):
    return layer('bg', 'bg', ''.join(use(r) for r in refs) + use('env-paper'))


def surface(cx, cy, rot, offset):
    """Point `offset` px away from a surface line point along the snail's 'up' direction for rotation rot."""
    t = math.radians(rot)
    ux, uy = math.sin(t), -math.cos(t)       # local (0,-1) rotated by rot (svg, clockwise)
    return cx + offset * ux, cy + offset * uy


def snail(x, y, rot=0.0, length=300, shadow=True, part='snail'):
    s = length / SNAIL_LEN
    inner = (use('snail-shadow') if shadow else '') + use(part)
    return f'<g transform="{tf(x, y, rot, s)}">{inner}</g>'


def snail_posed(x, y, rot=0.0, length=300, stalk_rot=0.0, shadow=True):
    """The assembled snail with its eyestalks swung forward by stalk_rot degrees (looking where it goes)."""
    s = length / SNAIL_LEN
    fx_, fy_ = SNAIL_STALK_FAR
    nx_, ny_ = SNAIL_STALK_NEAR
    return (f'<g transform="{tf(x, y, rot, s)}">' + (use('snail-shadow') if shadow else '') +
            f'<g transform="rotate({stalk_rot} {fx_} {fy_})">{use("snail-stalk-far")}</g>{use("snail-head-base")}'
            f'<g transform="rotate({stalk_rot} {nx_} {ny_})">{use("snail-stalk-near")}</g>'
            f'{use("snail-body")}{use("snail-shell")}</g>')


def bird(n, x, y, s=1.0, head_rot=0.0):
    """Three el layers for oriole n (body, head, wing), facing left, feet at (x,y)."""
    t = tf(x, y, 0, s)
    nx, ny = ORIOLE_NECK
    wx, wy = ORIOLE_SHOULDER
    head = f'<g transform="rotate({head_rot} {nx} {ny})">{use("oriole-head")}{pivot(nx, ny)}</g>'
    return [
        layer(f'bird{n}_body', 'el', f'<g transform="{t}">{use("oriole-body")}</g>'),
        layer(f'bird{n}_head', 'el', f'<g transform="{t}">{head}</g>'),
        layer(f'bird{n}_wing', 'el', f'<g transform="{t}">{use("oriole-wing")}{pivot(wx, wy)}</g>'),
    ]


def bird_flying(n, x, y, s=1.0):
    """Three el layers for oriole n in flight (far wing, body, near wing), drawn at its landing spot."""
    t = tf(x, y, 0, s)
    return [
        layer(f'bird{n}_fwfar', 'el', f'<g transform="{t}">{use("oriole-fly-wing-far")}{pivot(*ORIOLE_FLY_FAR)}</g>'),
        layer(f'bird{n}_fbody', 'el', f'<g transform="{t}">{use("oriole-fly-body")}</g>'),
        layer(f'bird{n}_fwnear', 'el', f'<g transform="{t}">{use("oriole-fly-wing-near")}{pivot(*ORIOLE_FLY_NEAR)}</g>'),
    ]


# ---- slide geometry -----------------------------------------------------------------------------
S4_SNAIL = dict(x=654, y=587, rot=-63, length=260)   # on the trunk's upper-left surface near (680,600)
S4_BIRDS = [(1130, 256, 1.0), (1400, 252, 0.94)]
S4_BIRD_HEAD = -15      # both orioles look down at the snail (低头看着蜗牛)
S4_STALKS = 20          # the snail's eyestalks lean forward, up the trunk; on slide 5 they turn up to the birds


def s1():
    return svg(bg('env-bg-s1'),
               layer('snail', 'el', snail(760, 870, -12, 340)))


def s2():
    # the new shoot sits BEHIND the vine so the trunk top hides its base (it grows out of the vine)
    return svg(bg('env-bg-s2'),
               layer('sprout', 'el', use('vine-s2-sprout') + pivot(972, 470)),
               layer('vine', 'el', use('vine-s2')),
               # the arm-tip shoots grow out of bud scales that cover their bases, so they sit above the vine
               layer('shootL', 'el', use('vine-s2-shoot-l') + pivot(868, 541)),
               layer('shootR', 'el', use('vine-s2-shoot-r') + pivot(1052.5, 493)),
               layer('leafL', 'el', use('vine-s2-leaf-l') + pivot(982, 425)),
               layer('leafR', 'el', use('vine-s2-leaf-r') + pivot(995, 395)))


def s3():
    # the crawl is split per narration beat: snail_b is the same snail drawn where the first part ends
    return svg(bg('env-bg-s3', 'vine-s3'),
               layer('snail', 'el', snail(380, 800, -6.3, 300)),
               layer('snail_b', 'el', snail(680, 767, -6.3, 300)))


def s4():
    sn = S4_SNAIL
    return svg(bg('env-bg-s45', 'vine-s45'),
               layer('snail', 'el', snail_posed(sn['x'], sn['y'], sn['rot'], sn['length'], S4_STALKS)),
               # each oriole flies in spread-winged, then soft-fades into its perched pose on landing
               *[l for i, (x, y, s) in enumerate(S4_BIRDS, 1) for l in bird_flying(i, x, y, s)],
               *[l for i, (x, y, s) in enumerate(S4_BIRDS, 1) for l in bird(i, x, y, s, S4_BIRD_HEAD)])


def s5():
    sn = S4_SNAIL
    s = sn['length'] / SNAIL_LEN
    t = tf(sn['x'], sn['y'], sn['rot'], s)
    # 抬头望向枝头的黄鹂: the eyestalks (separate pictures, pivots at their bases) turn up toward the birds
    def stalk(ref, p):
        return f'<g transform="{t}"><g transform="rotate({S4_STALKS} {p[0]} {p[1]})">{use(ref)}{pivot(*p)}</g></g>'
    return svg(bg('env-bg-s45', 'vine-s45'),
               layer('stalk_far', 'el', stalk('snail-stalk-far', SNAIL_STALK_FAR)),
               layer('snail_head', 'el', f'<g transform="{t}">{use("snail-head-base")}</g>'),
               layer('stalk_near', 'el', stalk('snail-stalk-near', SNAIL_STALK_NEAR)),
               layer('snail_body', 'el', f'<g transform="{t}">{use("snail-shadow")}{use("snail-body")}{use("snail-shell")}</g>'),
               *[l for i, (x, y, s) in enumerate(S4_BIRDS, 1) for l in bird(i, x, y, s, S4_BIRD_HEAD)])


S6_LEAF_PIVOTS = {1: (1237.2, 485.0), 2: (601.6, 697.7), 3: (1229.7, 162.5)}


def s6():
    leaves = [layer(f'leaf{i}', 'el', use(f'vine-s6-leaf-{i}') + pivot(*p)) for i, p in S6_LEAF_PIVOTS.items()]
    # grass tufts stand on the meadow edge, clear of the captions (which sit right of the trunk)
    grass = [layer('grass1', 'el', f'<g transform="{tf(250, 1004, 0, 1.0)}">{use("env-grass-tuft-a")}{pivot(0, 0)}</g>'),
             layer('grass2', 'el', f'<g transform="{tf(640, 1012, 0, 0.9, True)}">{use("env-grass-tuft-b")}{pivot(0, 0)}</g>')]
    return svg(bg('env-bg-s6', 'vine-s6'),
               layer('sun', 'el', f'<g transform="{tf(1690, 175)}">{use("env-sun")}</g>'),
               *leaves, *grass,
               # first part of the climb: straight up to just below the twig; snail_b takes over there and
               # side-steps around the twig on the line 路上有小枝丫挡住它
               layer('snail', 'el', snail_posed(990, 900, -90, 300, 40)),
               layer('snail_b', 'el', snail_posed(990, 680, -90, 300, 40)))


S7_GRAPES = [((240, 230), 1, 1.0), ((520, 270), 2, 1.05), ((800, 230), 3, 0.95),
             ((1560, 250), 4, 1.05), ((1780, 220), 6, 0.95), ((1660, 470), 5, 0.9)]


def s7():
    grapes = [layer(f'grape{i}', 'el', f'<g transform="{tf(x, y, 0, s)}">{use(f"grape-cluster-{c}")}</g>')
              for i, ((x, y), c, s) in enumerate(S7_GRAPES, 1)]
    return svg(bg('env-bg-s7', 'vinesum-s7'), *grapes,
               layer('snail', 'el', snail_posed(700, 628, -24, 260, 15)))


def s8():
    # 淡淡的白云: soft, a little transparent; they drift BEHIND the vine top and the snail (layer 'fg')
    clouds = [layer('cloud1', 'el', f'<g transform="{tf(330, 200)}" opacity="0.78">{use("env-cloud-a")}</g>'),
              layer('cloud2', 'el', f'<g transform="{tf(150, 345, 0, 0.85)}" opacity="0.72">{use("env-cloud-b")}</g>'),
              layer('cloud3', 'el', f'<g transform="{tf(820, 120, 0, 0.8)}" opacity="0.65">{use("env-cloud-c")}</g>')]
    snail_fg = f'<g transform="{tf(430, 660, 0, 300 / SNAIL_LEN)}">{use("snail-shadow")}{use("snail-headup")}</g>'
    return svg(bg('env-bg-s8'), *clouds, layer('fg', 'el', use('vinesum-s8') + snail_fg))


S9_SMALL_GRAPES = [(1318, 688, 'grape-cluster-small-1', 1.0), (1410, 698, 'grape-cluster-small-2', 0.85),
                   (1542, 690, 'grape-cluster-small-2', 1.05), (1634, 694, 'grape-cluster-small-1', 0.9)]
S9_HEAD = -24


def s9():
    s = 380 / SNAIL_LEN
    t = tf(720, 620, 0, s)
    nx, ny = SNAIL_NECK
    hr = f'rotate({S9_HEAD} {nx} {ny})'
    # far away: as soft and hazy as the distant vine row
    grapes = ('<g filter="url(#wc-blur-far)" opacity="0.8">' +
              ''.join(f'<g transform="{tf(x, y, 0, sc)}">{use(p)}</g>' for x, y, p, sc in S9_SMALL_GRAPES) + '</g>')
    body = (f'<g transform="{t}">{use("snail-shadow")}<g transform="{hr}">{use("snail-head-base")}</g>'
            f'{use("snail-body")}{use("snail-shell")}</g>')
    stalk = lambda ref, p: f'<g transform="{t}"><g transform="{hr}">{use(ref)}{pivot(*p)}</g></g>'  # noqa: E731
    return svg(layer('bg', 'bg', use('env-bg-s9') + use('vinesum-s9-far') + grapes + use('vinesum-s9-perch') + body
                     + use('env-paper')),
               layer('stalk_far', 'el', stalk('snail-stalk-far', SNAIL_STALK_FAR)),
               layer('stalk_near', 'el', stalk('snail-stalk-near', SNAIL_STALK_NEAR)))


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for f in (s1, s2, s3, s4, s5, s6, s7, s8, s9):
        (OUT / f'{f.__name__}.svg').write_text(f())
    print('wrote art/scenes/s1..s9.svg')


if __name__ == '__main__':
    main()
