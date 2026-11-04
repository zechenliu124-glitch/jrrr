#!/usr/bin/env python3
"""Animation simulator: plays a slide's timeline (as written into the PowerPoint) frame by frame.

    python3 tools/simulate.py s6                 -> preview/anim/s6.mp4   (one-click-per-page timing)
    python3 tools/simulate.py all                -> every slide + preview/anim/all.mp4
    python3 tools/simulate.py s4 --frames 0 2500 6000   -> PNG stills at those ms

It reads the same build/ renders and story.py beats that build.py uses and applies the same semantics
(entrances hide an element until they start; fades; paths with accel/decel; grow from the pivot; turn,
sway and flap around the pivot), so it is a faithful check of positions, timing and pacing. It cannot
check PowerPoint's own renderer.
"""
import json
import math
import subprocess
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import story  # noqa: E402
from build import BUILD, ROOT, caption_box, groups_for, path_segments  # noqa: E402

OUT = ROOT / 'preview' / 'anim'
ENTRANCES = ('fade', 'appear', 'grow')


def ease(u, accel=0.0, decel=0.0):
    u = min(1.0, max(0.0, u))
    a, d = accel, decel
    if a + d <= 0:
        return u
    r = 1 / (1 - a / 2 - d / 2)
    if a and u < a:
        return r * u * u / (2 * a)
    if d and u > 1 - d:
        return 1 - r * (1 - u) ** 2 / (2 * d)
    return r * (u - a / 2)


def bezier(p0, p1, p2, p3, t):
    m = 1 - t
    return tuple(m ** 3 * p0[i] + 3 * m * m * t * p1[i] + 3 * m * t * t * p2[i] + t ** 3 * p3[i] for i in (0, 1))


def polyline(segs, n=40):
    pts, cur = [], None
    for s in segs:
        if s[0] == 'M':
            cur = (s[1], s[2])
            pts.append(cur)
        elif s[0] == 'L':
            cur = (s[1], s[2])
            pts.append(cur)
        elif s[0] == 'C':
            p1, p2, p3 = (s[1], s[2]), (s[3], s[4]), (s[5], s[6])
            pts += [bezier(cur, p1, p2, p3, k / n) for k in range(1, n + 1)]
            cur = p3
    return pts


def along(pts, p):
    lens = [math.dist(a, b) for a, b in zip(pts, pts[1:])]
    total = sum(lens) or 1
    want = p * total
    for (a, b), L in zip(zip(pts, pts[1:]), lens):
        if want <= L or L == lens[-1]:
            k = 0 if L == 0 else min(1, want / L)
            return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k
        want -= L
    return pts[-1]


def timeline(slide):
    """[(abs_ms, effect)] for the one-click-per-page version (clicks happen at each beat's `at`)."""
    return [(t, e) for _, fxs in groups_for(slide, 'auto') for t, e in fxs]


def state(slide, el, t, tl):
    """-> (visible, opacity, dx, dy, rot_deg, scale)."""
    mine = [(t0, e) for t0, e in tl if e['el'] == el]
    visible = not any(e['kind'] in ENTRANCES for _, e in mine)
    op, dx, dy, rot, sc = 1.0, 0.0, 0.0, 0.0, 1.0
    for t0, e in mine:
        if t < t0:
            continue
        k, dur = e['kind'], max(1, e['dur'])
        u = (t - t0) / dur
        if k in ('fade', 'appear'):
            visible = True
            if k == 'fade':
                op = min(op, ease(u))
        elif k == 'grow':
            visible = True
            op = min(op, ease(u / 0.6))
            g = ease(u, 0, 0.4)
            s0 = e.get('scale0', 20) / 100
            sc *= s0 + (1 - s0) * g
            rot += e.get('rot0', 0) * (1 - g)
        elif k == 'path':
            pts = polyline(path_segments(e))
            x, y = along(pts, ease(u, e.get('accel', 0) / 100, e.get('decel', 0) / 100))
            dx, dy = x, y
        elif k == 'turn':
            rot += e['deg'] * ease(u, 0.5, 0.5)
        elif k == 'sway':
            a, P = e['amp'], e['period']
            ph = ((t - t0) % P) / P
            if ph < 0.25:
                rot += a / 2 * ease(ph / 0.25, 0, 1)
            elif ph < 0.75:
                rot += a / 2 - a * ease((ph - 0.25) / 0.5, 0.5, 0.5)
            else:
                rot += -a / 2 + a / 2 * ease((ph - 0.75) / 0.25, 1, 0)
        elif k == 'flap':
            d, P = e['deg'], e['period']
            ph = ((t - t0) % P) / P
            rot += d * ease(ph / 0.5, 0.5, 0.5) if ph < 0.5 else d - d * ease((ph - 0.5) / 0.5, 0.5, 0.5)
    # a path that starts off its drawn position applies from its start only; before that the element sits still
    return visible, op, dx, dy, rot, sc


def load_layers(slide, scale):
    sdir = BUILD / 'slides' / slide['key']
    meta = json.loads((sdir / 'boxes.json').read_text())
    layers = []
    for el in meta['order']:
        layers.append((el, Image.open(sdir / f'{el}.png').convert('RGBA'), meta['boxes'][el]))
    for c in slide['captions']:
        layers.append((c['id'], Image.open(BUILD / 'captions' / slide['key'] / f"{c['id']}.png").convert('RGBA'),
                       caption_box(slide, c)))
    bg = Image.open(sdir / 'bg.jpg').convert('RGBA').resize((int(1920 * scale), int(1080 * scale)), Image.LANCZOS)
    pre = []
    for el, im, box in layers:
        w, h = max(1, round(box['w'] * scale)), max(1, round(box['h'] * scale))
        pre.append((el, im.resize((w, h), Image.LANCZOS), box))
    return bg, pre


def frame(slide, t, tl, bg, layers, scale):
    canvas = bg.copy()
    for el, im, box in layers:
        vis, op, dx, dy, rot, sc = state(slide, el, t, tl)
        if not vis or op <= 0.003:
            continue
        cur = im
        if abs(sc - 1) > 1e-3:
            cur = cur.resize((max(1, round(cur.width * sc)), max(1, round(cur.height * sc))), Image.BILINEAR)
        if abs(rot) > 1e-3:
            cur = cur.rotate(-rot, resample=Image.BICUBIC, expand=True)
        if op < 0.999:
            a = cur.getchannel('A').point(lambda v: int(v * op))
            cur = cur.copy()
            cur.putalpha(a)
        cx = (box['x'] + box['w'] / 2 + dx) * scale
        cy = (box['y'] + box['h'] / 2 + dy) * scale
        canvas.alpha_composite(cur, (int(round(cx - cur.width / 2)), int(round(cy - cur.height / 2))))
    return canvas.convert('RGB')


def slide_length(slide, tl):
    end = 0
    for t0, e in tl:
        if e['kind'] not in ('sway', 'flap'):
            end = max(end, t0 + e['dur'])
    # long ambient drifts (clouds) may outlast the page; the preview stops a little after the page's budget
    return min(max(end + 1500, slide['budget'] * 1000), slide['budget'] * 1000 + 3000)


def encode(frames_iter, size, fps, out):
    out.parent.mkdir(parents=True, exist_ok=True)
    p = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                          '-s', f'{size[0]}x{size[1]}', '-r', str(fps), '-i', '-', '-c:v', 'libx264',
                          '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', str(out)],
                         stdin=subprocess.PIPE)
    for f in frames_iter:
        p.stdin.write(f.tobytes())
    p.stdin.close()
    p.wait()


def main():
    args = sys.argv[1:]
    fps, scale = 15, 0.5
    if '--fps' in args:
        fps = int(args[args.index('--fps') + 1])
    if '--scale' in args:
        scale = float(args[args.index('--scale') + 1])
    keys = [s['key'] for s in story.SLIDES] if args[0] == 'all' else [args[0]]
    if '--frames' in args:
        times = [int(v) for v in args[args.index('--frames') + 1:] if v.lstrip('-').isdigit()]
        s = next(x for x in story.SLIDES if x['key'] == keys[0])
        tl = timeline(s)
        bg, layers = load_layers(s, scale)
        for t in times:
            p = OUT / f'{s["key"]}-{t:05d}.png'
            p.parent.mkdir(parents=True, exist_ok=True)
            frame(s, t, tl, bg, layers, scale).save(p)
            print(p.relative_to(ROOT))
        return
    size = (int(1920 * scale), int(1080 * scale))
    for key in keys:
        s = next(x for x in story.SLIDES if x['key'] == key)
        tl = timeline(s)
        bg, layers = load_layers(s, scale)
        n = int(slide_length(s, tl) / 1000 * fps)
        encode((frame(s, i * 1000 / fps, tl, bg, layers, scale) for i in range(n)), size, fps, OUT / f'{key}.mp4')
        print(f'{key}: {n / fps:.1f}s -> preview/anim/{key}.mp4')
    if args[0] == 'all':
        lst = OUT / 'list.txt'
        lst.write_text(''.join(f"file '{k}.mp4'\n" for k in keys))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', str(lst),
                        '-c', 'copy', str(OUT / 'all.mp4')], check=True)
        lst.unlink()
        print('preview/anim/all.mp4')


if __name__ == '__main__':
    main()
