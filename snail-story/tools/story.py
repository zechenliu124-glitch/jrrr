"""《勇敢的小蜗牛》 — story, captions and the animation timeline of every slide.

This file is the single source of truth for build.py:
  * narration  -> speaker notes (what the child says),
  * captions   -> big, short on-screen lines (rendered with the rounded font),
  * beats      -> the animation timeline, one beat per narration moment.

Timing model
------------
Every beat has `at` (ms after the slide appears, used by the one-click-per-page version, where the whole
timeline plays by itself) and `click` (in the click-per-beat version a beat with click=True waits for a click;
beats with click=False run right after the previous group, at their `at` offset).
Every effect has `start` (ms, relative to its beat) and `dur` (ms).

Effect kinds (all slow and soft — no flashing, no bouncing):
  fade      fade in (entrance)
  appear    become visible (used together with a path that starts off-screen)
  path      move along a straight / smooth path; pts are offsets in slide px from the element's drawn position
  grow      fade in while growing from its pivot (scale `scale0` -> 1) and turning (`rot0` deg -> 0)
  turn      rotate by `deg` around the pivot and stay there
  sway      endless gentle swing ±amp/2 deg around the pivot, one swing per `period` ms (until the slide ends)
  flap      endless wing beat: lift by `deg` and back, `period` ms per beat (until the slide ends)
"""

W, H = 1920, 1080

# caption colours (low saturation, high contrast on the light scenes)
BROWN = '#5A4636'   # narration
GREEN = '#4B6A3A'   # the snail speaking / title
GOLD = '#80612A'    # the orioles speaking
PURPLE = '#76638F'  # small accents

CAP_Y2 = (890, 992)          # two-line caption band


def fx(kind, el, start=0, dur=1000, **kw):
    d = dict(kind=kind, el=el, start=start, dur=dur)
    d.update(kw)
    return d


def fade(el, start=0, dur=1000):
    return fx('fade', el, start, dur)


SLIDES = [
    # ------------------------------------------------------------------ 1
    dict(
        key='s1', title='封面',
        narration='（小朋友走到台前，微笑）大家好！我今天讲的故事是——《勇敢的小蜗牛》！',
        budget=8,
        captions=[
            dict(id='cap_title', text='勇敢的小蜗牛', size=150, color=GREEN, y=290),
            dict(id='cap_sub', text='故事表演', size=62, color=PURPLE, y=448, spacing=0.3),
        ],
        beats=[
            dict(at=0, click=False, say='大家好！我今天讲的故事是《勇敢的小蜗牛》', fx=[
                fade('cap_title', 0, 1200),
                fade('cap_sub', 900, 1000),
                fx('appear', 'snail', 1200, 1),
                fx('path', 'snail', 1200, 6800, pts=[(-1100, 234), (0, 0)], decel=35),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 2
    dict(
        key='s2', title='葡萄树发芽',
        narration='从前，有一棵葡萄树，嫩嫩的绿芽刚刚冒出来。',
        budget=10,
        captions=[
            dict(id='cap1', text='从前，有一棵葡萄树', size=80, color=BROWN, y=CAP_Y2[0]),
            dict(id='cap2', text='嫩嫩的绿芽冒出来啦', size=80, color=BROWN, y=CAP_Y2[1]),
        ],
        beats=[
            dict(at=0, click=False, say='从前，有一棵葡萄树，', fx=[
                fade('vine', 0, 1600),
                fade('cap1', 500, 1000),
            ]),
            dict(at=3000, click=True, say='嫩嫩的绿芽刚刚冒出来。', fx=[
                fx('grow', 'sprout', 0, 3200, scale0=20, rot0=-20),
                fx('grow', 'leafL', 1800, 2400, scale0=25, rot0=-35),
                fx('grow', 'leafR', 2600, 2400, scale0=25, rot0=35),
                fade('cap2', 600, 1000),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 3
    dict(
        key='s3', title='小蜗牛爬过来',
        narration='一只小蜗牛，背着重重的壳，慢慢爬过来啦。它心里藏着一个小小的梦想：'
                  '我要爬到葡萄树上，等到葡萄成熟！',
        budget=17,
        captions=[
            dict(id='cap1', text='小蜗牛慢慢爬过来啦', size=80, color=BROWN, y=CAP_Y2[0]),
            dict(id='cap2', text='“我要爬到葡萄树上！”', size=80, color=GREEN, y=CAP_Y2[1]),
        ],
        beats=[
            dict(at=0, click=False, say='一只小蜗牛，背着重重的壳，慢慢爬过来啦。', fx=[
                fade('snail', 0, 1500),
                fade('cap1', 400, 1000),
                fx('path', 'snail', 1600, 12500, pts=[(0, 0), (800, -88)]),
            ]),
            dict(at=7000, click=True, say='它心里藏着一个小小的梦想：我要爬到葡萄树上，等到葡萄成熟！', fx=[
                fade('cap2', 0, 1000),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 4
    dict(
        key='s4', title='黄鹂鸟来了',
        narration='树上飞来两只黄鹂鸟，看见慢慢爬的蜗牛，嘻嘻哈哈地笑起来。'
                  '黄鹂鸟说：“蜗牛蜗牛！葡萄成熟还早得很呢，你现在爬上来干什么？”',
        budget=21,
        captions=[
            dict(id='cap1', text='两只黄鹂鸟，嘻嘻哈哈', size=80, color=BROWN, y=CAP_Y2[0]),
            dict(id='cap2', text='“你现在爬上来干什么？”', size=80, color=GOLD, y=CAP_Y2[1]),
        ],
        beats=[
            dict(at=0, click=False, say='（画面：小蜗牛已经在树干上）', fx=[
                fade('snail', 0, 1000),
            ]),
            dict(at=1200, click=False, say='树上飞来两只黄鹂鸟，看见慢慢爬的蜗牛，嘻嘻哈哈地笑起来。', fx=[
                *[fx('appear', e, 0, 1) for e in ('bird1_body', 'bird1_head', 'bird1_wing')],
                *[fx('path', e, 0, 4800, pts=[(640, -430), (0, 0)], decel=60)
                  for e in ('bird1_body', 'bird1_head', 'bird1_wing')],
                fx('flap', 'bird1_wing', 0, 0, deg=-24, period=900),
                *[fx('appear', e, 600, 1) for e in ('bird2_body', 'bird2_head', 'bird2_wing')],
                *[fx('path', e, 600, 5000, pts=[(560, -470), (0, 0)], decel=60)
                  for e in ('bird2_body', 'bird2_head', 'bird2_wing')],
                fx('flap', 'bird2_wing', 600, 0, deg=-24, period=1000),
                fade('cap1', 1500, 1000),
            ]),
            dict(at=9500, click=True, say='黄鹂鸟说：“蜗牛蜗牛！葡萄成熟还早得很呢，你现在爬上来干什么？”', fx=[
                fade('cap2', 0, 1000),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 5
    dict(
        key='s5', title='小蜗牛的回答',
        narration='小蜗牛听了，心里有一点点难过。可是它没有停下。它对黄鹂鸟说：'
                  '“黄鹂鸟，请你不要笑我。我爬得很慢，但是，等我爬上，它就成熟啦！”',
        budget=22,
        captions=[
            dict(id='cap1', text='“黄鹂鸟，请你不要笑我。”', size=80, color=GREEN, y=CAP_Y2[0]),
            dict(id='cap2', text='“等我爬上，它就成熟啦！”', size=80, color=GREEN, y=CAP_Y2[1]),
        ],
        beats=[
            dict(at=0, click=False, say='小蜗牛听了，心里有一点点难过。可是它没有停下。', fx=[]),
            dict(at=6000, click=True, say='它对黄鹂鸟说：“黄鹂鸟，请你不要笑我。', fx=[
                fx('turn', 'snail_head', 0, 1800, deg=-14),
                fx('turn', 'bird1_head', 1400, 1400, deg=-12),
                fx('turn', 'bird2_head', 2000, 1400, deg=-12),
                fade('cap1', 300, 1000),
            ]),
            dict(at=13500, click=True, say='我爬得很慢，但是，等我爬上，它就成熟啦！”', fx=[
                fade('cap2', 0, 1000),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 6
    dict(
        key='s6', title='一步一步往上爬',
        narration='太阳晒得暖暖的，小蜗牛，一步一步往上爬。风吹过来，小蜗牛，一步一步往上爬。'
                  '路上有小枝丫挡住它，绕一绕，还是继续向前。',
        budget=21,
        captions=[
            dict(id='cap1', text='一步一步往上爬', size=84, color=BROWN, y=CAP_Y2[0]),
            dict(id='cap2', text='绕一绕，继续向前', size=84, color=BROWN, y=CAP_Y2[1]),
        ],
        beats=[
            dict(at=0, click=False, say='太阳晒得暖暖的，小蜗牛，一步一步往上爬。', fx=[
                fade('sun', 0, 2000),
                fx('path', 'snail', 1800, 17500, path='climb'),
                fade('cap1', 2600, 1000),
            ]),
            dict(at=6500, click=True, say='风吹过来，小蜗牛，一步一步往上爬。', fx=[
                fx('sway', 'leaf1', 0, 0, amp=10, period=3000),
                fx('sway', 'leaf2', 300, 0, amp=9, period=3400),
                fx('sway', 'leaf3', 600, 0, amp=10, period=3200),
                fx('sway', 'grass1', 150, 0, amp=8, period=2800),
                fx('sway', 'grass2', 450, 0, amp=8, period=3100),
            ]),
            dict(at=14000, click=True, say='路上有小枝丫挡住它，绕一绕，还是继续向前。', fx=[
                fade('cap2', 0, 1000),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 7
    dict(
        key='s7', title='葡萄成熟啦',
        narration='日子一天天过去，葡萄藤上，结满了紫莹莹的葡萄！这时候，小蜗牛终于爬到了高高的葡萄树上！',
        budget=16,
        captions=[
            dict(id='cap1', text='结满了紫莹莹的葡萄', size=80, color=BROWN, y=CAP_Y2[0]),
            dict(id='cap2', text='小蜗牛爬到了高高的树上！', size=80, color=BROWN, y=CAP_Y2[1]),
        ],
        beats=[
            dict(at=0, click=False, say='日子一天天过去，葡萄藤上，结满了紫莹莹的葡萄！', fx=[
                *[fade(f'grape{i}', 600 + (i - 1) * 850, 1400) for i in range(1, 7)],
                fade('cap1', 2200, 1000),
            ]),
            dict(at=7800, click=True, say='这时候，小蜗牛终于爬到了高高的葡萄树上！', fx=[
                fx('path', 'snail', 0, 7000, path='branch', decel=45),
                fade('cap2', 2500, 1000),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 8
    dict(
        key='s8', title='看见蓝蓝的天',
        narration='风吹干它流过的汗，它站在高高的地方，看见了蓝蓝的天。小蜗牛告诉大家：'
                  '小小的天，也可以有大大的梦想。跑得快不一定厉害，坚持往前走，总有一天，会拥有属于自己的天！',
        budget=27,
        captions=[
            dict(id='cap1', text='小小的天，也可以有大大的梦想', size=72, color=BROWN, y=790),
            dict(id='cap2', text='坚持往前走', size=72, color=BROWN, y=890),
            dict(id='cap3', text='总有一天，会拥有属于自己的天！', size=72, color=GREEN, y=990),
        ],
        beats=[
            dict(at=0, click=False, say='风吹干它流过的汗，它站在高高的地方，看见了蓝蓝的天。', fx=[
                fx('path', 'cloud1', 0, 36000, pts=[(0, 0), (1150, 0)]),
                fx('path', 'cloud2', 0, 44000, pts=[(0, 0), (1250, 0)]),
                fx('path', 'cloud3', 0, 32000, pts=[(0, 0), (820, 0)]),
            ]),
            dict(at=8500, click=True, say='小蜗牛告诉大家：小小的天，也可以有大大的梦想。', fx=[
                fade('cap1', 0, 1200),
            ]),
            dict(at=15500, click=True, say='跑得快不一定厉害，坚持往前走，', fx=[
                fade('cap2', 0, 1200),
            ]),
            dict(at=19500, click=True, say='总有一天，会拥有属于自己的天！', fx=[
                fade('cap3', 0, 1200),
            ]),
        ],
    ),
    # ------------------------------------------------------------------ 9
    dict(
        key='s9', title='结束',
        narration='我的故事讲完啦，谢谢大家！（鞠躬）',
        budget=8,
        captions=[
            dict(id='cap1', text='我的故事讲完啦', size=84, color=BROWN, y=835),
            dict(id='cap2', text='谢谢大家！', size=100, color=GREEN, y=945),
            dict(id='cap3', text='我要一步一步往上爬', size=46, color=PURPLE, y=1036, spacing=0.2),
        ],
        beats=[
            dict(at=0, click=False, say='我的故事讲完啦，谢谢大家！', fx=[
                fade('cap1', 300, 1200),
                fx('sway', 'stalk_far', 900, 0, amp=12, period=2300),
                fx('sway', 'stalk_near', 1100, 0, amp=14, period=2000),
                fade('cap2', 1800, 1200),
                fade('cap3', 3600, 1500),
            ]),
        ],
    ),
]

# Named motion paths (offsets in slide px from the element's drawn position; 'C' = smooth Bezier).
PATHS = {
    # slide 6: straight up the trunk, a smooth detour to the left around the twig, then on up
    's6.climb': [('M', 0, 0), ('L', 0, -180), ('C', 0, -230, -80, -250, -80, -300),
                 ('C', -80, -350, 0, -370, 0, -420), ('L', 10, -530)],
    # slide 7: along the rising branch to its tip
    's7.branch': [('M', 0, 0), ('L', 550, -248)],
}

TOTAL_BUDGET = sum(s['budget'] for s in SLIDES)
