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


# ---- slide geometry -----------------------------------------------------------------------------
S4_SNAIL = dict(x=643, y=581, rot=-63, length=260)   # on the trunk's upper-left surface near (680,600)
S4_BIRDS = [(1130, 256, 1.0), (1400, 252, 0.94)]


def s1():
    return svg(bg('env-bg-s1'),
               layer('snail', 'el', snail(760, 870, -12, 340)))


def s2():
    return svg(bg('env-bg-s2'),
               layer('vine', 'el', use('vine-s2')),
               layer('sprout', 'el', use('vine-s2-sprout') + pivot(972, 470)),
               layer('leafL', 'el', use('vine-s2-leaf-l') + pivot(982, 425)),
               layer('leafR', 'el', use('vine-s2-leaf-r') + pivot(995, 395)))


def s3():
    return svg(bg('env-bg-s3', 'vine-s3'),
               layer('snail', 'el', snail(380, 800, -6.3, 300)))


def s4():
    sn = S4_SNAIL
    return svg(bg('env-bg-s45', 'vine-s45'),
               layer('snail', 'el', snail(sn['x'], sn['y'], sn['rot'], sn['length'], shadow=False)),
               *[l for i, (x, y, s) in enumerate(S4_BIRDS, 1) for l in bird(i, x, y, s)])


def s5():
    sn = S4_SNAIL
    s = sn['length'] / SNAIL_LEN
    t = tf(sn['x'], sn['y'], sn['rot'], s)
    head = layer('snail_head', 'el', f'<g transform="{t}">{use("snail-head")}{pivot(*SNAIL_NECK)}</g>')
    body = layer('snail_body', 'el', f'<g transform="{t}">{use("snail-body")}{use("snail-shell")}</g>')
    return svg(bg('env-bg-s45', 'vine-s45'), head, body,
               *[l for i, (x, y, s) in enumerate(S4_BIRDS, 1) for l in bird(i, x, y, s)])


S6_LEAF_PIVOTS = {1: (1100, 640), 2: (760, 420), 3: (1080, 250)}


def s6():
    leaves = [layer(f'leaf{i}', 'el', use(f'vine-s6-leaf-{i}') + pivot(*p)) for i, p in S6_LEAF_PIVOTS.items()]
    grass = [layer('grass1', 'el', f'<g transform="{tf(250, 905, 0, 1.0)}">{use("env-grass-tuft-a")}{pivot(0, 0)}</g>'),
             layer('grass2', 'el', f'<g transform="{tf(1660, 915, 0, 0.9, True)}">{use("env-grass-tuft-b")}{pivot(0, 0)}</g>')]
    return svg(bg('env-bg-s6', 'vine-s6'),
               layer('sun', 'el', f'<g transform="{tf(1690, 175)}">{use("env-sun")}</g>'),
               *leaves, *grass,
               layer('snail', 'el', snail(965, 760, -90, 300, shadow=False)))


S7_GRAPES = [((240, 230), 1, 1.0), ((520, 270), 2, 1.05), ((800, 230), 3, 0.95),
             ((1560, 250), 4, 1.05), ((1780, 220), 6, 0.95), ((1660, 470), 5, 0.9)]


def s7():
    grapes = [layer(f'grape{i}', 'el', f'<g transform="{tf(x, y, 0, s)}">{use(f"grape-cluster-{c}")}</g>')
              for i, ((x, y), c, s) in enumerate(S7_GRAPES, 1)]
    return svg(bg('env-bg-s7', 'vinesum-s7'), *grapes,
               layer('snail', 'el', snail(700, 628, -24, 260, shadow=False)))


def s8():
    clouds = [layer('cloud1', 'el', f'<g transform="{tf(330, 210)}">{use("env-cloud-a")}</g>'),
              layer('cloud2', 'el', f'<g transform="{tf(150, 440, 0, 0.9)}">{use("env-cloud-b")}</g>'),
              layer('cloud3', 'el', f'<g transform="{tf(820, 130, 0, 0.8)}" opacity="0.85">{use("env-cloud-c")}</g>')]
    snail_bg = f'<g transform="{tf(430, 660, 0, 300 / SNAIL_LEN)}">{use("snail-shadow")}{use("snail-headup")}</g>'
    return svg(layer('bg', 'bg', use('env-bg-s8') + use('vinesum-s8') + snail_bg + use('env-paper')), *clouds)


S9_SMALL_GRAPES = [(1318, 688, 'grape-cluster-small-1'), (1410, 696, 'grape-cluster-small-2'),
                   (1542, 692, 'grape-cluster-small-2'), (1634, 684, 'grape-cluster-small-1')]
S9_HEAD = -24


def s9():
    s = 380 / SNAIL_LEN
    t = tf(720, 620, 0, s)
    nx, ny = SNAIL_NECK
    hr = f'rotate({S9_HEAD} {nx} {ny})'
    grapes = ''.join(f'<g transform="{tf(x, y)}">{use(p)}</g>' for x, y, p in S9_SMALL_GRAPES)
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
