"""Cute cast + props as inline SVG for HyperFrames edits (from the "Will AI replace teachers?" explainer).

Copy this file (and cute_sfx.py) into promo_build/ next to build.py.

Pieces
  bot()                      the robot "Bit" (antenna, screen face, waving arms)
  teach(skin, hair, shirt, style="bun"|"short")   a teacher; vary the look per person
  PROPS[name]                q ex heart star spark sweat zzz paper mag bulb eye hand cal map desk cog bell cloud kid rope
  actor_html(kind, id, left, top, width, *look)    one absolutely-positioned actor or prop (screen px)
  doodles()                  faint background doodles for graphics scenes
  expand(src)                macros for hand-written scene HTML:
                               <!--CAST bot ID left top width-->
                               <!--CAST teach ID left top width [skin hair shirt style]-->
                               <!--PROP name ID left top width-->
  cameo(...)                 a corner appearance on top of footage: html + js + sfx in one call (see README)
  CAST_CSS, CAST_JS          paste into the page <style> and right after `const tl = ...`

Every actor is <div id=ID class="actor bot|teach"> > <svg> > <g class="body"> with face parts
.eyes (.e-n normal, .e-h happy, .e-c cross/closed), .mouth (.m-n smile, .m-o "oh", .m-w wobbly), .armL/.armR, .ant (bot).
JS helpers in CAST_JS: idle enter popin hop wave raise mood wobble floaty spin (all take the GSAP timeline `tl` from scope).

Themes: set_theme("navy") (default; dark navy house style, characters get a soft white sticker edge) or
set_theme("paper") (cream paper-and-ink explainer look).
"""
from __future__ import annotations

import html as _html
import re

THEMES = {
    "navy": dict(ink="#1f1c17", cream="#fbf8f1", shadow="rgba(0,0,0,0.35)", doodle="rgba(200,215,255,0.16)",
                 doodle2="rgba(200,215,255,0.10)", font="Display, sans-serif", glow=True,
                 bubble_bg="#ffffff", bubble_ink="#111111"),
    "paper": dict(ink="#1f1c17", cream="#fbf8f1", shadow="rgba(60,45,20,0.18)", doodle="#c9bfab", doodle2="#e4dac6",
                  font="'Playfair Display', serif", glow=False, bubble_bg="#ffffff", bubble_ink="#1f1c17"),
}
T = dict(THEMES["navy"])


def set_theme(name: str, **override):
    T.clear()
    T.update(THEMES[name])
    T.update(override)


# --------------------------------------------------------------------------- actors
def bot(body="#5d7c96", face="#2b3a44", glow="#86f0e0", bulb="#e8a33a", **_):
    I, C = T["ink"], T["cream"]
    return f'''<svg viewBox="0 0 200 270" width="100%" overflow="visible">
 <ellipse class="shadow" cx="100" cy="258" rx="46" ry="8" fill="{T['shadow']}"/>
 <g class="body">
  <g class="ant"><line x1="100" y1="40" x2="100" y2="14" stroke="{I}" stroke-width="5" stroke-linecap="round"/><circle class="bulb" cx="100" cy="11" r="10" fill="{bulb}" stroke="{I}" stroke-width="4"/></g>
  <g class="armL"><path d="M66 168 Q36 178 32 206" stroke="{I}" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="32" cy="210" r="11" fill="{C}" stroke="{I}" stroke-width="4"/></g>
  <g class="armR"><path d="M134 168 Q164 178 168 206" stroke="{I}" stroke-width="8" fill="none" stroke-linecap="round"/><circle cx="168" cy="210" r="11" fill="{C}" stroke="{I}" stroke-width="4"/></g>
  <rect x="62" y="146" width="76" height="76" rx="24" fill="{body}" stroke="{I}" stroke-width="6"/>
  <circle class="heart" cx="100" cy="182" r="10" fill="{C}" stroke="{I}" stroke-width="3"/>
  <ellipse cx="100" cy="236" rx="22" ry="10" fill="{I}"/>
  <rect x="34" y="36" width="132" height="110" rx="38" fill="{C}" stroke="{I}" stroke-width="6"/>
  <rect x="52" y="56" width="96" height="70" rx="24" fill="{face}"/>
  <ellipse cx="45" cy="112" rx="6" ry="5" fill="#f2a7a0"/><ellipse cx="155" cy="112" rx="6" ry="5" fill="#f2a7a0"/>
  <g class="eyes">
   <g class="e-n"><ellipse cx="80" cy="86" rx="9" ry="12" fill="{glow}"/><ellipse cx="120" cy="86" rx="9" ry="12" fill="{glow}"/><circle cx="83" cy="81" r="3" fill="#fff"/><circle cx="123" cy="81" r="3" fill="#fff"/></g>
   <g class="e-h" opacity="0"><path d="M70 90 Q80 76 90 90 M110 90 Q120 76 130 90" stroke="{glow}" stroke-width="6" fill="none" stroke-linecap="round"/></g>
   <g class="e-c" opacity="0"><path d="M70 84 L90 92 M130 84 L110 92" stroke="{glow}" stroke-width="6" fill="none" stroke-linecap="round"/></g>
  </g>
  <g class="mouth">
   <path class="m-n" d="M88 106 Q100 116 112 106" stroke="{glow}" stroke-width="5" fill="none" stroke-linecap="round"/>
   <ellipse class="m-o" opacity="0" cx="100" cy="110" rx="7" ry="8" fill="{glow}"/>
   <path class="m-w" opacity="0" d="M86 112 Q93 104 100 112 Q107 120 114 112" stroke="{glow}" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
 </g>
</svg>'''


def teach(skin="#f3c9a5", hair="#3b2a20", shirt="#c4685a", style="bun", **_):
    I, C = T["ink"], T["cream"]
    bun = f'<circle cx="100" cy="36" r="22" fill="{hair}" stroke="{I}" stroke-width="4"/>' if style == "bun" else ""
    return f'''<svg viewBox="0 0 200 300" width="100%" overflow="visible">
 <ellipse class="shadow" cx="100" cy="290" rx="58" ry="9" fill="{T['shadow']}"/>
 <g class="body">
  <path d="M50 288 Q48 196 100 186 Q152 196 150 288 Z" fill="{shirt}" stroke="{I}" stroke-width="5"/>
  <path d="M84 190 L100 222 L116 190 Z" fill="{C}" stroke="{I}" stroke-width="4" stroke-linejoin="round"/>
  <g class="armL"><path d="M58 214 Q34 240 44 268" stroke="{shirt}" stroke-width="20" fill="none" stroke-linecap="round"/><circle cx="45" cy="272" r="11" fill="{skin}" stroke="{I}" stroke-width="4"/></g>
  <g class="armR"><path d="M142 214 Q166 240 156 268" stroke="{shirt}" stroke-width="20" fill="none" stroke-linecap="round"/><circle cx="155" cy="272" r="11" fill="{skin}" stroke="{I}" stroke-width="4"/></g>
  {bun}
  <circle cx="100" cy="112" r="64" fill="{skin}" stroke="{I}" stroke-width="5"/>
  <path d="M38 104 Q40 50 100 48 Q160 50 162 104 Q140 76 112 80 Q96 64 74 82 Q52 84 38 104 Z" fill="{hair}" stroke="{I}" stroke-width="4" stroke-linejoin="round"/>
  <ellipse cx="62" cy="134" rx="9" ry="6" fill="#ec9b92" opacity="0.8"/><ellipse cx="138" cy="134" rx="9" ry="6" fill="#ec9b92" opacity="0.8"/>
  <g class="eyes">
   <g class="e-n"><ellipse cx="78" cy="116" rx="6" ry="8" fill="{I}"/><ellipse cx="122" cy="116" rx="6" ry="8" fill="{I}"/><circle cx="80" cy="113" r="2.2" fill="#fff"/><circle cx="124" cy="113" r="2.2" fill="#fff"/></g>
   <g class="e-h" opacity="0"><path d="M70 118 Q78 108 86 118 M114 118 Q122 108 130 118" stroke="{I}" stroke-width="5" fill="none" stroke-linecap="round"/></g>
   <g class="e-c" opacity="0"><path d="M70 117 Q78 123 86 117 M114 117 Q122 123 130 117" stroke="{I}" stroke-width="5" fill="none" stroke-linecap="round"/></g>
  </g>
  <g fill="none" stroke="{I}" stroke-width="4"><circle cx="78" cy="116" r="17"/><circle cx="122" cy="116" r="17"/><path d="M95 114 Q100 110 105 114"/></g>
  <g class="mouth">
   <path class="m-n" d="M88 146 Q100 156 112 146" stroke="{I}" stroke-width="5" fill="none" stroke-linecap="round"/>
   <ellipse class="m-o" opacity="0" cx="100" cy="150" rx="7" ry="9" fill="#7a2f2a" stroke="{I}" stroke-width="3"/>
   <path class="m-w" opacity="0" d="M86 152 Q93 145 100 152 Q107 159 114 152" stroke="{I}" stroke-width="5" fill="none" stroke-linecap="round"/>
  </g>
 </g>
</svg>'''


ASPECT = {"bot": 270 / 200, "teach": 300 / 200}   # height / width of each actor's viewBox


def props():
    I, C, F = T["ink"], T["cream"], T["font"]
    return {
        "q": f'<svg viewBox="0 0 100 100" width="100%"><circle cx="50" cy="50" r="44" fill="{C}" stroke="{I}" stroke-width="5"/><text x="50" y="70" text-anchor="middle" font-family="{F}" font-weight="700" font-size="60" fill="#b26a0e">?</text></svg>',
        "ex": f'<svg viewBox="0 0 100 100" width="100%"><circle cx="50" cy="50" r="44" fill="#e8742a" stroke="{I}" stroke-width="5"/><text x="50" y="72" text-anchor="middle" font-family="{F}" font-weight="700" font-size="62" fill="#fff">!</text></svg>',
        "heart": f'<svg viewBox="0 0 100 100" width="100%"><path d="M50 86 C10 58 8 30 28 20 C40 14 48 22 50 30 C52 22 60 14 72 20 C92 30 90 58 50 86 Z" fill="#e2675e" stroke="{I}" stroke-width="5" stroke-linejoin="round"/></svg>',
        "star": f'<svg viewBox="0 0 100 100" width="100%"><path d="M50 6 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38 Z" fill="#f2c14e" stroke="{I}" stroke-width="5" stroke-linejoin="round"/></svg>',
        "spark": f'<svg viewBox="0 0 100 100" width="100%"><path d="M50 4 Q56 44 96 50 Q56 56 50 96 Q44 56 4 50 Q44 44 50 4 Z" fill="#f2c14e" stroke="{I}" stroke-width="4" stroke-linejoin="round"/></svg>',
        "sweat": f'<svg viewBox="0 0 100 100" width="100%"><path d="M50 8 Q80 50 80 66 A30 30 0 0 1 20 66 Q20 50 50 8 Z" fill="#8fd0f0" stroke="{I}" stroke-width="5"/></svg>',
        "zzz": f'<svg viewBox="0 0 100 100" width="100%"><g font-family="{F}" font-weight="700" fill="#8f75e0" stroke="{I}" stroke-width="1.5"><text x="10" y="90" font-size="44">z</text><text x="40" y="60" font-size="34">z</text><text x="66" y="34" font-size="26">z</text></g></svg>',
        "paper": f'<svg viewBox="0 0 100 120" width="100%"><path d="M8 6 H70 L92 28 V114 H8 Z" fill="#fff" stroke="{I}" stroke-width="5" stroke-linejoin="round"/><path d="M70 6 V28 H92" fill="none" stroke="{I}" stroke-width="5"/><path d="M22 48 H78 M22 64 H78 M22 80 H62" stroke="#c9bfab" stroke-width="7" stroke-linecap="round"/></svg>',
        "mag": f'<svg viewBox="0 0 100 100" width="100%"><line x1="64" y1="64" x2="92" y2="92" stroke="{I}" stroke-width="12" stroke-linecap="round"/><circle cx="40" cy="40" r="30" fill="rgba(134,240,224,0.45)" stroke="{I}" stroke-width="8"/><path d="M26 30 Q32 20 44 18" stroke="#fff" stroke-width="6" fill="none" stroke-linecap="round"/></svg>',
        "bulb": f'<svg viewBox="0 0 100 100" width="100%"><path d="M50 8 A30 30 0 0 1 68 62 L66 74 H34 L32 62 A30 30 0 0 1 50 8 Z" fill="#f2c14e" stroke="{I}" stroke-width="5" stroke-linejoin="round"/><rect x="36" y="78" width="28" height="12" rx="4" fill="#9d9584" stroke="{I}" stroke-width="4"/></svg>',
        "eye": f'<svg viewBox="0 0 100 100" width="100%"><path d="M6 50 Q50 6 94 50 Q50 94 6 50 Z" fill="#fff" stroke="{I}" stroke-width="6"/><circle cx="50" cy="50" r="16" fill="#5d7c96" stroke="{I}" stroke-width="5"/><circle cx="55" cy="45" r="5" fill="#fff"/></svg>',
        "hand": f'<svg viewBox="0 0 100 100" width="100%"><circle cx="50" cy="50" r="44" fill="#0f9d72" stroke="{I}" stroke-width="5"/><path d="M30 52 L44 66 L72 36" stroke="#fff" stroke-width="10" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        "cal": f'<svg viewBox="0 0 100 110" width="100%"><rect x="6" y="14" width="88" height="90" rx="10" fill="#fff" stroke="{I}" stroke-width="5"/><path d="M6 24 Q6 14 16 14 H84 Q94 14 94 24 V40 H6 Z" fill="#e2675e" stroke="{I}" stroke-width="5"/><rect x="26" y="4" width="8" height="20" rx="4" fill="{I}"/><rect x="66" y="4" width="8" height="20" rx="4" fill="{I}"/><text x="50" y="84" text-anchor="middle" font-family="sans-serif" font-weight="700" font-size="30" fill="{I}">MON</text></svg>',
        "map": f'<svg viewBox="0 0 140 100" width="100%"><path d="M6 14 L46 4 L94 14 L134 4 V86 L94 96 L46 86 L6 96 Z" fill="#f6ecd2" stroke="{I}" stroke-width="5" stroke-linejoin="round"/><path d="M46 4 V86 M94 14 V96" stroke="#c9bfab" stroke-width="4"/><path d="M20 76 Q40 40 66 58 T112 26" stroke="#b26a0e" stroke-width="5" fill="none" stroke-dasharray="8 7" stroke-linecap="round"/><path d="M104 18 L120 34 M120 18 L104 34" stroke="#e2675e" stroke-width="6" stroke-linecap="round"/></svg>',
        "desk": f'<svg viewBox="0 0 300 120" width="100%"><rect x="6" y="10" width="288" height="26" rx="8" fill="#c79a63" stroke="{I}" stroke-width="5"/><rect x="24" y="36" width="18" height="80" fill="#a77c4a" stroke="{I}" stroke-width="5"/><rect x="258" y="36" width="18" height="80" fill="#a77c4a" stroke="{I}" stroke-width="5"/></svg>',
        "cog": f'<svg viewBox="0 0 100 100" width="100%"><path d="M43 4h14l3 13 9 4 11-7 10 10-7 11 4 9 13 3v14l-13 3-4 9 7 11-10 10-11-7-9 4-3 13H43l-3-13-9-4-11 7-10-10 7-11-4-9-13-3V43l13-3 4-9-7-11 10-10 11 7 9-4z" fill="#5d7c96" stroke="{I}" stroke-width="4" stroke-linejoin="round"/><circle cx="50" cy="50" r="15" fill="{C}" stroke="{I}" stroke-width="4"/></svg>',
        "bell": f'<svg viewBox="0 0 100 100" width="100%"><path d="M50 10 Q76 12 76 44 V64 L86 76 H14 L24 64 V44 Q24 12 50 10 Z" fill="#f2c14e" stroke="{I}" stroke-width="5" stroke-linejoin="round"/><circle cx="50" cy="84" r="9" fill="{I}"/></svg>',
        "cloud": f'<svg viewBox="0 0 120 90" width="100%"><path d="M30 60 A18 18 0 0 1 34 26 A26 26 0 0 1 82 22 A20 20 0 0 1 96 60 Z" fill="#9d9fb0" stroke="{I}" stroke-width="5" stroke-linejoin="round"/><path d="M40 70 L34 84 M62 70 L56 84 M84 70 L78 84" stroke="#5d9fd0" stroke-width="5" stroke-linecap="round"/></svg>',
        "kid": f'<svg viewBox="0 0 100 110" width="100%"><path d="M18 108 Q18 70 50 66 Q82 70 82 108 Z" fill="#6a4bb5" stroke="{I}" stroke-width="4"/><circle cx="50" cy="40" r="28" fill="#f3c9a5" stroke="{I}" stroke-width="4"/><path d="M22 36 Q26 10 50 12 Q76 10 78 36 Q64 24 50 26 Q36 24 22 36 Z" fill="#3b2a20"/><circle cx="41" cy="42" r="3.5" fill="{I}"/><circle cx="59" cy="42" r="3.5" fill="{I}"/><path d="M43 53 Q50 58 57 53" stroke="{I}" stroke-width="3" fill="none" stroke-linecap="round"/></svg>',
        "rope": f'<svg viewBox="0 0 400 40" width="100%"><path d="M0 20 Q100 30 200 20 T400 20" stroke="#a77c4a" stroke-width="10" fill="none" stroke-linecap="round"/><rect x="194" y="6" width="12" height="28" rx="4" fill="#e2675e" stroke="{I}" stroke-width="3"/></svg>',
    }


def doodles():
    a, b = T["doodle"], T["doodle2"]
    return f'''<div class="doodles">
 <svg class="dd" style="left:60px;top:70px;width:46px" viewBox="0 0 100 100"><path d="M50 6 L61 38 L95 38 L67 58 L78 92 L50 71 L22 92 L33 58 L5 38 L39 38 Z" fill="none" stroke="{a}" stroke-width="7" stroke-linejoin="round"/></svg>
 <svg class="dd" style="left:1810px;top:120px;width:40px" viewBox="0 0 100 100"><circle cx="50" cy="50" r="38" fill="none" stroke="{a}" stroke-width="9"/></svg>
 <svg class="dd" style="left:70px;top:960px;width:70px" viewBox="0 0 140 60"><path d="M6 30 Q24 6 42 30 T78 30 T114 30 T134 22" fill="none" stroke="{a}" stroke-width="8" stroke-linecap="round"/></svg>
 <svg class="dd" style="left:1820px;top:930px;width:46px" viewBox="0 0 100 100"><path d="M50 10 V90 M10 50 H90" stroke="{a}" stroke-width="12" stroke-linecap="round"/></svg>
 <svg class="dd" style="left:1840px;top:520px;width:30px" viewBox="0 0 100 100"><path d="M50 4 Q56 44 96 50 Q56 56 50 96 Q44 56 4 50 Q44 44 50 4 Z" fill="{b}"/></svg>
 <svg class="dd" style="left:56px;top:520px;width:30px" viewBox="0 0 100 100"><circle cx="50" cy="50" r="30" fill="{b}"/></svg>
</div>'''


def actor_html(kind, id_, left, top, width, *look, **kw):
    if kind == "bot":
        inner, cls = bot(**kw), "actor bot"
    elif kind == "teach":
        inner, cls = teach(*look, **kw), "actor teach"
    else:
        inner, cls = props()[kind], f"prop {kind}"
    return (f'<div id="{id_}" class="{cls}" style="left:{left}px;top:{top}px;width:{width}px" '
            f'data-layout-allow-overlap data-layout-ignore>{inner}</div>')


def expand(src):
    def one(m):
        a = m.group(2).split()
        return actor_html(a[0], a[1], a[2], a[3], a[4], *a[5:])
    return re.sub(r"<!--(CAST|PROP) ([^>]+?)-->", one, src)


# --------------------------------------------------------------------------- cameo on footage
# What each action does and which SFX it brings (names exist in soundtrack.py FX after merging cute_sfx.CUTE).
ACTIONS = {
    "wave":  ("waves", "blip"),
    "hop":   ("hops", "boing"),
    "point": ("raises an arm toward the action", "blip"),
    "happy": ("happy face + hop + sparkle", "sparkle"),
    "yes":   ("happy face + green tick", "ding"),
    "worry": ("cross eyes, wobbly mouth, sweat drop, wobble", "uhoh"),
    "think": ("'oh' mouth + question mark", "bubble"),
    "idea":  ("happy face + light bulb", "ding"),
    "love":  ("happy face + heart", "bubble"),
    "wow":   ("'oh' mouth + star", "sparkle"),
    "sleep": ("closed eyes + zzz", "snore"),
    "say":   ("speech bubble with short text: ('say', 'Nice!')", "blip"),
}

CORNERS = ("br", "bl", "rm", "lm")


def cameo(id_, t0, t1, beats, who="bot", corner="br", size=200, look=(), fmt=lambda x: f"{x:.3f}", track=10):
    """A character peeking into a footage scene.

    id_    unique id, e.g. "cm-mon-0"
    t0,t1  ABSOLUTE seconds it is on screen (enter at t0, leave at t1)
    beats  [(abs_t, action) or (abs_t, "say", "text")]; action from ACTIONS
    corner br | bl (rise from the bottom edge) or rm | lm (slide in from the right/left edge, mid-height)
    Returns (html, js_lines, sfx [(abs_t, name)], rect (x, y, w, h) in screen px for collision checks).
    """
    h = int(size * ASPECT[who])
    if corner == "br":
        x, y, dx, dy = 1920 - size - 36, 1080 - int(h * 0.94), 0, int(h * 1.1)
    elif corner == "bl":
        x, y, dx, dy = 36, 1080 - int(h * 0.94), 0, int(h * 1.1)
    elif corner == "rm":
        x, y, dx, dy = 1920 - int(size * 0.86), 380, size + 60, 0
    elif corner == "lm":
        x, y, dx, dy = -int(size * 0.14), 380, -(size + 60), 0
    else:
        raise ValueError(corner)
    left_side = corner in ("bl", "lm")
    act = f"{id_}-a"
    prop_w = int(size * 0.42)
    px = x + (size - 10 if left_side else -prop_w + 10)
    py = y - int(prop_w * 0.2)
    parts = [actor_html(who, act, 0, 0, size, *look)]
    js, sfx = [], [(t0, "whoop")]
    js.append(f'tl.fromTo("#{act}",{{x:{dx},y:{dy},rotation:{-8 if left_side else 8}}},{{x:0,y:0,rotation:0,duration:.55,ease:"back.out(1.6)"}},{fmt(t0)});')
    js.append(f'idle("#{act}",{fmt(t0 + 0.6)},{fmt(max(t0 + 0.7, t1 - 0.5))},5);')
    js.append(f'tl.to("#{act}",{{x:{dx},y:{dy},duration:.4,ease:"power2.in"}},{fmt(t1 - 0.4)});')
    arm = ".armL" if not left_side else ".armR"      # the arm toward the middle of the frame
    bubbles = []
    for k, b in enumerate(beats):
        t, a = b[0], b[1]
        if a not in ACTIONS:
            raise KeyError(f"{id_}: unknown cameo action {a!r}; use one of {sorted(ACTIONS)}")
        sfx.append((t, ACTIONS[a][1]))
        pid = f"{id_}-p{k}"
        nxt = beats[k + 1][0] if k + 1 < len(beats) else t1
        hold = max(0.9, min(2.2, nxt - t - 0.1))
        def prop(name):
            parts.append(f'<div id="{pid}" class="prop" style="left:{px - x}px;top:{py - y}px;width:{prop_w}px;opacity:0">{props()[name]}</div>')
            js.append(f'popin("#{pid}",{fmt(t)}); tl.to("#{pid}",{{opacity:0,scale:.6,duration:.25}},{fmt(t + hold)});')
        if a == "wave":
            js.append(f'wave("#{act}",{fmt(t)},"{arm}",2);')
        elif a == "hop":
            js.append(f'hop("#{act}",{fmt(t)},30);')
        elif a == "point":
            js.append(f'raise("#{act}",{fmt(t)},"{arm}",100,{hold:.2f});')
        elif a in ("happy", "yes", "idea", "love", "wow"):
            js.append(f'mood("#{act}",{fmt(t)},"{"n" if a == "wow" else "h"}","{"o" if a == "wow" else "n"}"); mood("#{act}",{fmt(t + hold)},"n","n");')
            js.append(f'hop("#{act}",{fmt(t)},24);')
            prop({"happy": "spark", "yes": "hand", "idea": "bulb", "love": "heart", "wow": "star"}[a])
        elif a == "worry":
            js.append(f'mood("#{act}",{fmt(t)},"c","w"); mood("#{act}",{fmt(t + hold)},"n","n"); wobble("#{act}",{fmt(t)},3);')
            prop("sweat")
        elif a == "think":
            js.append(f'mood("#{act}",{fmt(t)},"n","o"); mood("#{act}",{fmt(t + hold)},"n","n");')
            prop("q")
        elif a == "sleep":
            js.append(f'mood("#{act}",{fmt(t)},"c","n"); mood("#{act}",{fmt(t + hold)},"n","n");')
            prop("zzz")
        elif a == "say":
            text = b[2]
            side = "rt" if not left_side else ""
            edge = "right" if not left_side else "left"          # tail (36 px in from this edge) sits over the head
            bubbles.append(f'<div id="{pid}" class="say {side}" style="{edge}:{size // 2 - 49}px;top:-78px;opacity:0">{_html.escape(text)}</div>')
            js.append(f'popin("#{pid}",{fmt(t)}); tl.to("#{pid}",{{opacity:0,duration:.2}},{fmt(t + hold)});')
            js.append(f'mood("#{act}",{fmt(t)},"h","o"); mood("#{act}",{fmt(t + 0.5)},"h","n"); mood("#{act}",{fmt(t + hold)},"n","n");')
    html = (f'<div id="{id_}" class="clip cameo" data-start="{fmt(t0)}" data-duration="{fmt(t1 - t0)}" data-track-index="{track}" '
            f'style="left:{x}px;top:{y}px;width:{size}px;height:{h}px">' + "".join(parts) + "".join(bubbles) + "</div>")
    vis_h = min(h, 1080 - y)
    return html, js, sfx, (x, y - 80, size, vis_h + 80)


# --------------------------------------------------------------------------- page glue
def cast_css():
    glow = ("filter: drop-shadow(0 0 0 #fff) drop-shadow(0 0 3px rgba(255,255,255,.9)) drop-shadow(0 10px 18px rgba(0,0,0,.45));"
            if T["glow"] else "")
    return f'''
.actor, .prop {{ position: absolute; }}
.actor svg, .prop svg {{ display: block; overflow: visible; }}
.actor {{ {glow} }}
.cameo {{ position: absolute; overflow: visible; }}
.doodles {{ position: absolute; inset: 0; pointer-events: none; }}
.dd {{ position: absolute; overflow: visible; }}
.say {{ position: absolute; background: {T['bubble_bg']}; color: {T['bubble_ink']}; border: 4px solid {T['ink']}; border-radius: 22px; padding: 10px 22px; font-size: 34px; white-space: nowrap; box-shadow: 0 8px 20px rgba(0,0,0,.3); }}
.say::after {{ content: ""; position: absolute; left: 36px; bottom: -18px; width: 26px; height: 26px; background: {T['bubble_bg']}; border-right: 4px solid {T['ink']}; border-bottom: 4px solid {T['ink']}; transform: rotate(45deg); }}
.say.rt::after {{ left: auto; right: 36px; }}
'''


CAST_JS = r'''
// ---- cast helpers (id = "#name"); all add to the shared paused timeline `tl`
const reps = (d, p) => Math.max(1, Math.floor(d / p));
const isTeach = id => !!document.querySelector(id + ".teach");
const armOrigin = (id, arm) => arm === ".armR" ? (isTeach(id) ? "142 214" : "134 168") : (isTeach(id) ? "58 214" : "66 168");
const idle = (id, t0, t1, amp = 7) => {
  const d = t1 - t0, n = reps(d, 0.9);
  tl.fromTo(id + " .body", { y: 0 }, { y: -amp, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: n - 1 + (n % 2), immediateRender: false }, t0);
  for (let t = t0 + 1.1, k = 0; t < t1 - 0.4; t += 2.4 + (k++ % 3) * 0.6)
    tl.fromTo(id + " .eyes", { scaleY: 1 }, { scaleY: 0.1, duration: 0.07, yoyo: true, repeat: 1, transformOrigin: "50% 50%", immediateRender: false }, t);
  if (document.querySelector(id + " .ant"))
    tl.fromTo(id + " .ant", { rotation: -7 }, { rotation: 7, duration: 0.7, ease: "sine.inOut", yoyo: true, repeat: reps(d, 0.7) - 1 + (reps(d, 0.7) % 2), svgOrigin: "100 40", immediateRender: false }, t0);
};
const enter = (id, t, dx = -260) => tl.fromTo(id, { opacity: 0, x: dx }, { opacity: 1, x: 0, duration: 0.75, ease: "back.out(1.5)" }, t);
const popin = (id, t) => tl.fromTo(id, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2.4)", transformOrigin: "50% 100%" }, t);
const hop = (id, t, h = 36) => tl.fromTo(id + " .body", { y: 0 }, { y: -h, duration: 0.2, ease: "power2.out", yoyo: true, repeat: 1, immediateRender: false }, t);
const wave = (id, t, arm = ".armR", n = 3) => {
  const o = armOrigin(id, arm), s = arm === ".armR" ? -1 : 1;
  tl.fromTo(id + " " + arm, { rotation: 0 }, { rotation: s * 110, duration: 0.25, ease: "power2.out", svgOrigin: o, immediateRender: false }, t);
  tl.fromTo(id + " " + arm, { rotation: s * 110 }, { rotation: s * 80, duration: 0.18, yoyo: true, repeat: n * 2 - 1, ease: "sine.inOut", svgOrigin: o, immediateRender: false }, t + 0.25);
  tl.to(id + " " + arm, { rotation: 0, duration: 0.3, svgOrigin: o }, t + 0.25 + n * 0.36);
};
const raise = (id, t, arm = ".armR", deg = 120, hold = 1.5) => {
  const o = armOrigin(id, arm), s = arm === ".armR" ? -1 : 1;
  tl.fromTo(id + " " + arm, { rotation: 0 }, { rotation: s * deg, duration: 0.3, ease: "back.out(2)", svgOrigin: o, immediateRender: false }, t);
  tl.to(id + " " + arm, { rotation: 0, duration: 0.3, svgOrigin: o }, t + hold);
};
const mood = (id, t, e = "n", m = "n") => {
  ["n", "h", "c"].forEach(k => tl.set(id + " .e-" + k, { opacity: k === e ? 1 : 0 }, t));
  ["n", "o", "w"].forEach(k => tl.set(id + " .m-" + k, { opacity: k === m ? 1 : 0 }, t));
};
const wobble = (id, t, n = 4) => tl.fromTo(id + " .body", { rotation: -4 }, { rotation: 4, duration: 0.06, yoyo: true, repeat: n * 2 - 1, ease: "none", immediateRender: false, svgOrigin: "100 250" }, t);
const floaty = (sel, t, d, amp = 10) => tl.fromTo(sel, { y: 0 }, { y: -amp, duration: 1.1, yoyo: true, repeat: reps(d, 1.1) - 1 + (reps(d, 1.1) % 2), ease: "sine.inOut", immediateRender: false }, t);
const spin = (sel, t, d) => tl.fromTo(sel, { rotation: 0 }, { rotation: 360 * d / 3, duration: d, ease: "none", immediateRender: false }, t);
'''
