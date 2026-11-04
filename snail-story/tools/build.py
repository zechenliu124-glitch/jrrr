#!/usr/bin/env python3
"""Build the 《勇敢的小蜗牛》 PowerPoint decks from the SVG scenes and tools/story.py.

    python3 tools/build.py            # render scenes + captions, build both .pptx, write previews
    python3 tools/build.py --no-render   # reuse build/ renders (only rebuild the .pptx + previews)
    python3 tools/build.py --only s3 s4  # re-render just these scenes first

Outputs (in the project root):
    勇敢的小蜗牛.pptx               one click per page: every page's animations play by themselves, in story order
    勇敢的小蜗牛-逐句点击版.pptx     one click per narration beat (the adult clicks as the child reaches each line)
    preview/                        final-state PNG of every slide + contact sheet
"""
import json
import os
import subprocess
import sys
from pathlib import Path

from PIL import Image
from lxml import etree
from pptx import Presentation
from pptx.util import Emu

sys.path.insert(0, str(Path(__file__).parent))
import story  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
BUILD = ROOT / 'build'
SCENES = ROOT / 'art' / 'scenes'
PREVIEW = ROOT / 'preview'
W, H = story.W, story.H
EMU = 6350                      # EMU per slide pixel (12192000 / 1920)
SCALE = 2                       # render scale of layers and captions
BG_SIZE = (2560, 1440)          # background JPEG size

NS = {
    'p': 'http://schemas.openxmlformats.org/presentationml/2006/main',
    'a': 'http://schemas.openxmlformats.org/drawingml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships',
}


def run(*args):
    subprocess.run(list(args), check=True, cwd=ROOT)


# ----------------------------------------------------------------------------- rendering

def render_scene(key):
    out = BUILD / 'slides' / key
    out.mkdir(parents=True, exist_ok=True)
    for f in out.glob('*.png'):
        f.unlink()
    run('node', 'tools/render.js', 'layers', str(SCENES / f'{key}.svg'), str(out), '--scale', str(SCALE))
    man = json.loads((out / 'layers.json').read_text())
    # background -> JPEG
    bg = Image.open(out / 'bg.png').convert('RGB').resize(BG_SIZE, Image.LANCZOS)
    bg.save(out / 'bg.jpg', quality=90, optimize=True)
    boxes = {}
    for el in man['elements']:
        full = Image.open(out / f"{el['id']}.full.png")
        bbox = full.getchannel('A').point(lambda a: 255 if a > 3 else 0).getbbox()
        if not bbox:
            raise SystemExit(f'{key}: element {el["id"]} is empty')
        x0, y0, x1, y1 = bbox[0] - 4, bbox[1] - 4, bbox[2] + 4, bbox[3] + 4
        if el['pivot']:
            px, py = el['pivot'][0] * SCALE, el['pivot'][1] * SCALE
            hw = max(px - x0, x1 - px)
            hh = max(py - y0, y1 - py)
            x0, x1, y0, y1 = px - hw, px + hw, py - hh, py + hh
        x0, y0, x1, y1 = (int(round(v)) for v in (x0, y0, x1, y1))
        full.crop((x0, y0, x1, y1)).save(out / f"{el['id']}.png", optimize=True)
        (out / f"{el['id']}.full.png").unlink()
        boxes[el['id']] = dict(x=x0 / SCALE, y=y0 / SCALE, w=(x1 - x0) / SCALE, h=(y1 - y0) / SCALE,
                               pivot=el['pivot'])
    (out / 'boxes.json').write_text(json.dumps(dict(order=[e['id'] for e in man['elements']], boxes=boxes), indent=1))
    (out / 'bg.png').unlink()


def render_captions(slide):
    out = BUILD / 'captions' / slide['key']
    out.mkdir(parents=True, exist_ok=True)
    spec = dict(lines=[dict(id=c['id'], text=c['text'], size=c['size'], color=c['color'],
                            letterSpacing=c.get('spacing', 0.04)) for c in slide['captions']])
    sf = out / 'spec.json'
    sf.write_text(json.dumps(spec, ensure_ascii=False))
    run('node', 'tools/render.js', 'text', str(sf), str(out), '--scale', str(SCALE))


def caption_box(slide, cap):
    im = Image.open(BUILD / 'captions' / slide['key'] / f"{cap['id']}.png")
    w, h = im.size[0] / SCALE, im.size[1] / SCALE
    cx = cap.get('x', W / 2)
    return dict(x=cx - w / 2, y=cap['y'] - h / 2, w=w, h=h, pivot=None)


# ----------------------------------------------------------------------------- timing XML

class Ids:
    def __init__(self):
        self.n = 2          # 1 = tmRoot, 2 = mainSeq

    def __call__(self):
        self.n += 1
        return self.n


def _tgt(spid):
    return f'<p:tgtEl><p:spTgt spid="{spid}"/></p:tgtEl>'


def _set_vis(ids, spid, val, delay=0):
    return (f'<p:set><p:cBhvr><p:cTn id="{ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="{delay}"/>'
            f'</p:stCondLst></p:cTn>{_tgt(spid)}<p:attrNameLst><p:attrName>style.visibility</p:attrName>'
            f'</p:attrNameLst></p:cBhvr><p:to><p:strVal val="{val}"/></p:to></p:set>')


def _rot(ids, spid, deg, dur, delay=0, accel=0, decel=0):
    ease = (f' accel="{accel}"' if accel else '') + (f' decel="{decel}"' if decel else '')
    st = f'<p:stCondLst><p:cond delay="{delay}"/></p:stCondLst>' if delay else ''
    return (f'<p:animRot by="{int(round(deg * 60000))}"><p:cBhvr><p:cTn id="{ids()}" dur="{int(dur)}"{ease} '
            f'fill="hold">{st}</p:cTn>{_tgt(spid)}<p:attrNameLst><p:attrName>r</p:attrName></p:attrNameLst>'
            f'</p:cBhvr></p:animRot>')


def _anim(ids, spid, attr, dur, v0, v1):
    def val(v):
        return f'<p:strVal val="{v}"/>' if isinstance(v, str) else f'<p:fltVal val="{v}"/>'
    return (f'<p:anim calcmode="lin" valueType="num"><p:cBhvr><p:cTn id="{ids()}" dur="{int(dur)}" fill="hold"/>'
            f'{_tgt(spid)}<p:attrNameLst><p:attrName>{attr}</p:attrName></p:attrNameLst></p:cBhvr><p:tavLst>'
            f'<p:tav tm="0"><p:val>{val(v0)}</p:val></p:tav><p:tav tm="100000"><p:val>{val(v1)}</p:val></p:tav>'
            f'</p:tavLst></p:anim>')


def fmt(v):
    s = f'{v:.5f}'.rstrip('0').rstrip('.')
    return '0' if s in ('-0', '') else s


def path_string(segs):
    """segs: [('M', x, y), ('L', x, y), ('C', x1, y1, x2, y2, x, y), ...] in slide px offsets."""
    out = []
    for s in segs:
        op, nums = s[0], s[1:]
        rel = [fmt(n / (W if i % 2 == 0 else H)) for i, n in enumerate(nums)]
        out.append(op + ' ' + ' '.join(rel))
    return ' '.join(out) + ' E'


def path_segments(e):
    if 'segs' in e:
        return e['segs']
    pts = e['pts']
    return [('M', *pts[0])] + [('L', *p) for p in pts[1:]]


def effect_xml(e, spid, ids, start, node_type):
    kind, dur = e['kind'], int(e['dur'])
    head = lambda pid, cls, extra='': (  # noqa: E731
        f'<p:par><p:cTn id="{ids()}" presetID="{pid}" presetClass="{cls}" presetSubtype="0"{extra} '
        f'fill="hold" nodeType="{node_type}"><p:stCondLst><p:cond delay="{int(start)}"/></p:stCondLst><p:childTnLst>')
    tail = '</p:childTnLst></p:cTn></p:par>'
    if kind == 'fade':
        return (head(10, 'entr') + _set_vis(ids, spid, 'visible') +
                f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{ids()}" dur="{dur}"/>'
                f'{_tgt(spid)}</p:cBhvr></p:animEffect>' + tail)
    if kind == 'appear':
        return head(1, 'entr') + _set_vis(ids, spid, 'visible') + tail
    if kind == 'path':
        ease = (f' accel="{e["accel"] * 1000}"' if e.get('accel') else '') + \
               (f' decel="{e["decel"] * 1000}"' if e.get('decel') else '')
        return (head(0, 'path', ease) +
                f'<p:animMotion origin="layout" path="{path_string(path_segments(e))}" pathEditMode="relative" '
                f'rAng="0"><p:cBhvr><p:cTn id="{ids()}" dur="{dur}" fill="hold"/>{_tgt(spid)}<p:attrNameLst>'
                f'<p:attrName>ppt_x</p:attrName><p:attrName>ppt_y</p:attrName></p:attrNameLst></p:cBhvr>'
                f'</p:animMotion>' + tail)
    if kind == 'grow':
        s0 = e.get('scale0', 20) / 100
        return (head(31, 'entr', ' decel="40000"') + _set_vis(ids, spid, 'visible') +
                _anim(ids, spid, 'ppt_w', dur, f'#ppt_w*{s0:g}', '#ppt_w') +
                _anim(ids, spid, 'ppt_h', dur, f'#ppt_h*{s0:g}', '#ppt_h') +
                _anim(ids, spid, 'style.rotation', dur, float(e.get('rot0', 0)), 0.0) +
                f'<p:animEffect transition="in" filter="fade"><p:cBhvr><p:cTn id="{ids()}" dur="{int(dur * 0.6)}"/>'
                f'{_tgt(spid)}</p:cBhvr></p:animEffect>' + tail)
    if kind == 'turn':
        return head(8, 'emph', ' accel="50000" decel="50000"') + _rot(ids, spid, e['deg'], dur) + tail
    if kind == 'sway':
        a, p = e['amp'], e['period']
        return (head(32, 'emph', ' repeatCount="indefinite"') +
                _rot(ids, spid, a / 2, p / 4, decel=100000) +
                _rot(ids, spid, -a, p / 2, delay=int(p / 4), accel=50000, decel=50000) +
                _rot(ids, spid, a / 2, p / 4, delay=int(3 * p / 4), accel=100000) + tail)
    if kind == 'flap':
        d, p = e['deg'], e['period']
        return (head(8, 'emph', ' repeatCount="indefinite"') +
                _rot(ids, spid, d, p / 2, accel=50000, decel=50000) +
                _rot(ids, spid, -d, p / 2, delay=int(p / 2), accel=50000, decel=50000) + tail)
    raise ValueError(kind)


def groups_for(slide, mode):
    """-> list of (trigger, [(start_ms_in_group, effect)]); trigger is 'begin' (plays when the slide appears)
    or 'click'. auto mode: one 'begin' group with every beat at its `at` time. click mode: a new click group
    at every beat with click=True; other beats join the current group at their `at` offset."""
    groups = []
    for b in slide['beats']:
        if mode == 'auto':
            if not groups:
                groups.append(['begin', 0, []])
        elif not groups:
            groups.append(['click' if b['click'] else 'begin', b['at'], []])
        elif b['click']:
            groups.append(['click', b['at'], []])
        g = groups[-1]
        for e in b['fx']:
            g[2].append((b['at'] - g[1] + e['start'], resolve(slide, e)))
    return [(t, sorted(fxs, key=lambda x: x[0])) for t, _, fxs in groups if fxs]


def resolve(slide, e):
    if e['kind'] == 'path' and 'path' in e:
        e = dict(e, segs=story.PATHS[f"{slide['key']}.{e['path']}"])
    return e


def timing_xml(slide, mode, spids):
    ids = Ids()
    body = []
    for trigger, fxs in groups_for(slide, mode):
        gid = ids()
        cond = '<p:cond delay="indefinite"/>'
        if trigger == 'begin':
            cond += '<p:cond evt="onBegin" delay="0"><p:tn val="2"/></p:cond>'
        inner_id = ids()
        effs = []
        for i, (t, e) in enumerate(fxs):
            nt = 'clickEffect' if (i == 0 and trigger == 'click') else 'withEffect'
            if e['el'] not in spids:
                raise SystemExit(f"{slide['key']}: animation targets unknown element {e['el']!r}")
            effs.append(effect_xml(e, spids[e['el']], ids, t, nt))
        body.append(f'<p:par><p:cTn id="{gid}" fill="hold"><p:stCondLst>{cond}</p:stCondLst><p:childTnLst>'
                    f'<p:par><p:cTn id="{inner_id}" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst>'
                    f'<p:childTnLst>{"".join(effs)}</p:childTnLst></p:cTn></p:par></p:childTnLst></p:cTn></p:par>')
    if not body:
        return None
    return (f'<p:timing xmlns:p="{NS["p"]}"><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" '
            f'nodeType="tmRoot"><p:childTnLst><p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" '
            f'nodeType="mainSeq"><p:childTnLst>{"".join(body)}</p:childTnLst></p:cTn><p:prevCondLst>'
            f'<p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst><p:nextCondLst>'
            f'<p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>'
            f'</p:childTnLst></p:cTn></p:par></p:tnLst></p:timing>')


# ----------------------------------------------------------------------------- notes

EFFECT_WORDS = {
    'fade': '淡入', 'appear': '出现', 'path': '缓慢移动', 'grow': '慢慢生长', 'turn': '轻轻转动',
    'sway': '轻轻摆动（循环）', 'flap': '扇动翅膀（循环）',
}
EL_WORDS = {
    'snail': '小蜗牛', 'vine': '葡萄藤', 'sprout': '嫩芽', 'leafL': '小叶子', 'leafR': '小叶子', 'sun': '太阳',
    'snail_head': '小蜗牛抬头', 'bird1_head': '黄鹂歪头', 'bird2_head': '黄鹂歪头', 'stalk_near': '触角',
    'stalk_far': '触角',
}


def describe(beat, slide):
    caps = {c['id']: c['text'] for c in slide['captions']}
    parts, seen = [], set()
    for e in beat['fx']:
        el = e['el']
        if el in caps:
            w = f'字幕「{caps[el]}」淡入'
        elif el.startswith('bird'):
            w = {'flap': '黄鹂扇动翅膀', 'turn': '黄鹂轻轻歪头'}.get(e['kind'], '两只黄鹂鸟缓缓飞到枝头')
        elif el.startswith('grape'):
            w = '葡萄一串串慢慢显现'
        elif el.startswith('cloud'):
            w = '白云慢慢飘过'
        elif el.startswith(('leaf', 'grass')) and e['kind'] == 'sway':
            w = '叶子、小草随风轻轻摆动'
        else:
            w = EL_WORDS.get(el, el) + ('' if el in ('snail_head',) else EFFECT_WORDS[e['kind']])
        if w not in seen and e['kind'] != 'appear':
            seen.add(w)
            parts.append(w)
    return '，'.join(parts) or '（画面静止，先讲这一句）'


def notes_text(slide, mode, index):
    lines = [f'第{index}页 · {slide["title"]}', '',
             '【台词】' + slide['narration'], '',
             f'【建议用时】约 {slide["budget"]} 秒（全篇 9 页约 {story.TOTAL_BUDGET // 60} 分 {story.TOTAL_BUDGET % 60} 秒）', '']
    if mode == 'auto':
        lines.append('【画面】翻到本页后，动画按故事顺序自己慢慢播放：')
        for b in slide['beats']:
            if b['fx']:
                lines.append(f'  · 约第 {b["at"] / 1000:g} 秒（“{b["say"]}”）：{describe(b, slide)}')
        lines += ['', '【翻页】小朋友讲完本页后，单击一次翻到下一页。']
    else:
        lines.append('【画面与点击】')
        n = 0
        for i, b in enumerate(slide['beats']):
            if i == 0 and not b['click']:
                lines.append(f'  · 翻到本页后自动（“{b["say"]}”）：{describe(b, slide)}')
            elif b['click']:
                n += 1
                lines.append(f'  · 第{n}次单击（讲到“{b["say"]}”时）：{describe(b, slide)}')
            else:
                lines.append(f'  · 紧接着自动（“{b["say"]}”）：{describe(b, slide)}')
        lines += ['', f'【翻页】本页有 {n} 次单击动画；动画都出来、小朋友讲完后，再单击一次翻到下一页。']
    return '\n'.join(lines)


# ----------------------------------------------------------------------------- pptx

def set_background(slide, image_path):
    _, rid = slide.part.get_or_add_image_part(str(image_path))
    csld = slide._element.find('p:cSld', NS)
    bg = etree.fromstring(
        f'<p:bg xmlns:p="{NS["p"]}" xmlns:a="{NS["a"]}" xmlns:r="{NS["r"]}"><p:bgPr>'
        f'<a:blipFill dpi="0" rotWithShape="1"><a:blip r:embed="{rid}"/><a:srcRect/><a:stretch><a:fillRect/>'
        f'</a:stretch></a:blipFill><a:effectLst/></p:bgPr></p:bg>')
    csld.insert(0, bg)


def add_pic(slide, path, box, name, descr):
    pic = slide.shapes.add_picture(str(path), Emu(int(round(box['x'] * EMU))), Emu(int(round(box['y'] * EMU))),
                                   Emu(int(round(box['w'] * EMU))), Emu(int(round(box['h'] * EMU))))
    pic.name = name
    pic._element.nvPicPr.cNvPr.set('descr', descr)
    return pic


DESCR = {
    'snail': '小蜗牛', 'vine': '葡萄藤', 'sprout': '嫩芽', 'leafL': '嫩叶', 'leafR': '嫩叶', 'sun': '太阳',
    'snail_head': '小蜗牛的头', 'snail_body': '小蜗牛', 'stalk_near': '小蜗牛的触角', 'stalk_far': '小蜗牛的触角',
}


def build_deck(mode, out_path):
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(W * EMU), Emu(H * EMU)
    blank = prs.slide_layouts[6]
    for idx, s in enumerate(story.SLIDES, 1):
        slide = prs.slides.add_slide(blank)
        sdir = BUILD / 'slides' / s['key']
        set_background(slide, sdir / 'bg.jpg')
        meta = json.loads((sdir / 'boxes.json').read_text())
        spids = {}
        for el in meta['order']:
            pic = add_pic(slide, sdir / f'{el}.png', meta['boxes'][el], el,
                          DESCR.get(el, '黄鹂鸟' if el.startswith('bird') else '葡萄' if el.startswith('grape')
                                    else '白云' if el.startswith('cloud') else el))
            spids[el] = pic.shape_id
        for cap in s['captions']:
            pic = add_pic(slide, BUILD / 'captions' / s['key'] / f"{cap['id']}.png", caption_box(s, cap),
                          cap['id'], cap['text'])
            spids[cap['id']] = pic.shape_id
        sld = slide._element
        # gentle fade between pages, advance on click only (no automatic page turning)
        sld.append(etree.fromstring(f'<p:transition xmlns:p="{NS["p"]}" spd="slow"><p:fade/></p:transition>'))
        t = timing_xml(s, mode, spids)
        if t:
            sld.append(etree.fromstring(t))
        slide.notes_slide.notes_text_frame.text = notes_text(s, mode, idx)
    prs.core_properties.title = '勇敢的小蜗牛'
    prs.core_properties.subject = '幼儿园故事比赛 · 故事表演'
    prs.core_properties.author = ''
    prs.save(out_path)
    print('wrote', out_path.relative_to(ROOT))


# ----------------------------------------------------------------------------- previews

def end_offset(slide, el):
    """Offset (px) of an element at the end of its slide (after its motion paths)."""
    dx = dy = 0
    for b in slide['beats']:
        for e in b['fx']:
            if e['el'] == el and e['kind'] == 'path':
                seg = path_segments(resolve(slide, e))[-1]
                dx, dy = seg[-2], seg[-1]
    return dx, dy


def end_rotation(slide, el):
    return sum(e['deg'] for b in slide['beats'] for e in b['fx'] if e['el'] == el and e['kind'] == 'turn')


def write_previews():
    PREVIEW.mkdir(exist_ok=True)
    thumbs = []
    for idx, s in enumerate(story.SLIDES, 1):
        sdir = BUILD / 'slides' / s['key']
        canvas = Image.open(sdir / 'bg.jpg').convert('RGBA').resize((W, H), Image.LANCZOS)
        meta = json.loads((sdir / 'boxes.json').read_text())
        layers = [(sdir / f'{el}.png', meta['boxes'][el], el) for el in meta['order']]
        layers += [(BUILD / 'captions' / s['key'] / f"{c['id']}.png", caption_box(s, c), c['id'])
                   for c in s['captions']]
        for path, box, el in layers:
            im = Image.open(path).convert('RGBA')
            im = im.resize((max(1, round(box['w'])), max(1, round(box['h']))), Image.LANCZOS)
            rot = end_rotation(s, el)
            cx, cy = box['x'] + box['w'] / 2, box['y'] + box['h'] / 2
            if rot:
                im = im.rotate(-rot, resample=Image.BICUBIC, expand=True)
            dx, dy = end_offset(s, el)
            canvas.alpha_composite(im, (int(round(cx + dx - im.width / 2)), int(round(cy + dy - im.height / 2))))
        out = PREVIEW / f'{idx:02d}-{s["key"]}.png'
        canvas.convert('RGB').save(out.with_suffix('.jpg'), quality=88)
        thumbs.append(canvas.convert('RGB').resize((640, 360), Image.LANCZOS))
    sheet = Image.new('RGB', (3 * 640 + 4 * 16, 3 * 360 + 4 * 16), (250, 250, 247))
    for i, t in enumerate(thumbs):
        sheet.paste(t, (16 + (i % 3) * 656, 16 + (i // 3) * 376))
    sheet.save(PREVIEW / 'contact-sheet.jpg', quality=88)
    print('wrote preview/ (9 slides + contact sheet)')


def main():
    args = sys.argv[1:]
    only = args[args.index('--only') + 1:] if '--only' in args else None
    if '--no-render' not in args:
        for s in story.SLIDES:
            if only is None or s['key'] in only:
                render_scene(s['key'])
                render_captions(s)
    build_deck('auto', ROOT / '勇敢的小蜗牛.pptx')
    build_deck('click', ROOT / '勇敢的小蜗牛-逐句点击版.pptx')
    write_previews()


if __name__ == '__main__':
    main()
