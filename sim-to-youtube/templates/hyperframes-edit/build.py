"""Build ../hf/index.html (HyperFrames) + work/plan.json for Part 2: xAPI + SLS Data Assistant.

Footage = ../hf/assets/screen.mp4 (name-blurred copy of screen_XXXX.mp4, 1900x966), full-frame;
coordinates are SOURCE px / seconds. Beats = (cue, src_in, src_out). Highlight reference frames: work/refs.json.
"""
from __future__ import annotations

import html
import json
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
HF = HERE.parent / "hf"
WORDS = json.loads((HERE / "tts" / "words.json").read_text(encoding="utf-8"))
MARKS = {"fps": 30, "marks": []}
SRC_W, SRC_H = 1900, 966
CARD = dict(L=0, T=0, W=1920, H=1080)
FULL = (0, 0, 1900, 966)
PAGE = (0, 60, 1900, 906)
MODAL = (280, 80, 1340, 754)
GAP, TAIL = 0.3, 0.8
RATE_MIN, RATE_MAX = 0.25, 3.0
GY = lambda T: 0
GOLD, BLUE, ORANGE, RED, GREEN = "#ffd21f", "#1f8fff", "#ff8a1f", "#ff4d6d", "#1fd67a"


def norm(w):
    return re.sub(r"[^a-z0-9'\-]", "", w.lower().replace("’", "'")).strip("-'")


def wt(cue, word, n=1, which="start"):
    k = 0
    for tok in WORDS[cue]["tokens"]:
        if norm(tok["w"]) == norm(word):
            k += 1
            if k == n:
                return tok[which]
    raise KeyError((cue, word, n))


def dur(cue):
    return WORDS[cue]["duration"]


def S(**k):
    for key in ("beats", "cams", "hl", "hlines", "cards", "stamps", "sfx", "banners", "counts"):
        k.setdefault(key, [])
    return k


def w(cue, word, n=1):
    return ("w", cue, word, n)


def G(id_, cues, tail=0.9, **k):
    vo, t = [], 0.35
    for c in cues:
        vo.append((c, t))
        t += dur(c) + 0.35
    return S(id=id_, kind="gfx", vo=vo, dur=t + tail - 0.35, sfx=[(0, "whoosh"), (0.35, "hit")], **k)


SCENES = [
    S(id="hook", kind="foot", chapter="", beats=[("hook_1", 236, 262), ("hook_2", 262, 300)],
      cams=[(0, MODAL, 0)],
      cards=[(w("hook_1", "three"), w("hook_2", "And"), '<span class="y">3</span> MOST COMMON ERRORS · WHOLE CLASS')],
      banners=[(w("hook_2", "This"), "SLS DATA ASSISTANT + xAPI", "yel")],
      stamps=[(w("hook_1", "One"), "1 CLICK", GREEN)],
      sfx=[(w("hook_1", "One"), "hit"), (w("hook_2", "This"), "boom")]),
    G("title", ["title"]),
    G("recap", ["recap"]),
    S(id="cls", kind="foot", chapter="A REAL CLASS", beats=[("cls_1", 0, 40)],
      cams=[(0, PAGE, 0)],
      hl=[(w("cls_1", "Twenty-eight"), w("cls_1", "In"), 436, 322, 180, 40, "28 STUDENTS"),
          (w("cls_1", "Assignments,"), ("end",), 296, 680, 360, 50, "ELECTROMAGNETISM LAB")],
      sfx=[(w("cls_1", "Twenty-eight"), "pop"), (w("cls_1", "Assignments,"), "pop")]),
    S(id="sim", kind="foot", chapter="THE VIRTUAL LAB", beats=[("sim_1", 56, 62), ("sim_2", 62, 66)],
      cams=[(0, FULL, 0), (w("sim_2", "Students"), (440, 90, 1360, 765), 0.7)],
      hl=[(w("sim_2", "switch"), w("sim_2", "live"), 530, 106, 690, 56, "CONTROLS"),
          (w("sim_2", "live"), ("end",), 1240, 106, 480, 56, "LIVE DATA · I · F · MASS")],
      sfx=[(w("sim_2", "switch"), "pop"), (w("sim_2", "live"), "pop")]),
    G("phy", ["phy_1", "phy_2"]),
    S(id="mon", kind="foot", chapter="ONE STUDENT AT A TIME", beats=[("mon_1", 82, 88), ("mon_2", 74, 82)],
      cams=[(0, FULL, 0)],
      hl=[(w("mon_1", "One"), ("w", "mon_2", "That's"), 462, 448, 260, 92, "1 INTERACTION · 73 s · 0/4")],
      stamps=[(w("mon_1", "zero"), "0 / 4", RED)],
      cards=[(w("mon_2", "class"), ("end",), '28 STUDENTS × 1 BY 1 = <span class="r">THE WHOLE LESSON</span>')],
      sfx=[(w("mon_1", "zero"), "buzz")]),
    S(id="all", kind="foot", chapter="VIEW ALL RESPONSES", beats=[("all_1", 88, 108), ("all_2", 108, 124)],
      cams=[(0, FULL, 0)],
      hl=[(w("all_1", "View"), w("all_1", "Every"), 1018, 578, 232, 50, "VIEW ALL RESPONSES"),
          (w("all_2", "data"), w("all_2", "Press"), 70, 580, 300, 30, "NOT REAL-TIME"),
          (w("all_2", "Press"), ("end",), 18, 122, 140, 34, "REFRESH")],
      sfx=[(w("all_1", "View"), "whoosh")]),
    S(id="da", kind="foot", chapter="DATA ASSISTANT",
      beats=[("da_1", 120, 146), ("da_2", 146, 162), ("da_3", 162, 180), ("gen_1", 180, 188), ("da_4", 188, 200)],
      cams=[(0, FULL, 0), (w("da_2", "Pick"), MODAL, 0.6)],
      hl=[(w("da_1", "Data"), ("end",), 1760, 512, 44, 44, "DATA ASSISTANT"),
          (w("da_2", "Identify"), w("da_2", "Identify", 2), 404, 390, 354, 136, "COMMON ERRORS"),
          (w("da_2", "Identify", 2), w("da_2", "Identify", 3), 780, 390, 354, 136, "COMMON THEMES"),
          (w("da_2", "Identify", 3), w("da_2", "Or", 2), 1156, 390, 354, 136, "MISCONCEPTIONS"),
          (w("da_3", "Based"), w("da_3", "Then,"), 342, 602, 1228, 120, "EDIT THE BOLD WORDS"),
          (w("da_3", "generate."), ("end",), 866, 754, 182, 50, "GENERATE")],
      cards=[(w("da_4", "Because"), ("end",), 'xAPI FEEDBACK = <span class="y">WHAT EACH STUDENT DID</span>, not just the answer')],
      sfx=[(w("da_1", "Data"), "hit"), (w("da_3", "generate."), "pop")]),
    S(id="res", kind="foot", chapter="THE 3 MOST COMMON ERRORS",
      beats=[("res_1", 198, 212), ("err_1", 212, 262), ("err_1b", 262, 278), ("err_2", 278, 300), ("err_3", 300, 322),
             ("warn", 322, 330)],
      cams=[(0, MODAL, 0)],
      hl=[(w("err_1", "Error"), w("err_1", "Students"), 352, 500, 600, 40, "ERROR 1"),
          (w("err_2", "Error"), ("w", "err_3", "Error"), 346, 564, 700, 50, "ERROR 2"),
          (w("err_3", "Error"), ("w", "warn", "Notice"), 346, 616, 620, 62, "ERROR 3")],
      cards=[(w("err_1", "So"), ("w", "err_1b", "And"), 'SWITCH OFF → I = 0 → <span class="r">F = 0</span>'),
             (w("err_1b", "F"), w("err_1b", "The", 3), '<span class="y">F = BIL</span> · I = 0 ⇒ F = 0'),
             (w("err_1b", "The", 3), ("w", "err_2", "Error"), 'WHO MADE IT? <span class="y">LISTED BY NAME</span> (blurred here)'),
             (w("err_2", "linear"), ("w", "err_3", "Error"), 'F ∝ I · vary the current <span class="y">over a wide range</span>'),
             (w("err_3", "Error"), ("w", "warn", "Notice"), 'FIELD + CURRENT + DIRECTION → <span class="y">SIZE & DIRECTION OF F</span>'),
             (w("warn", "Notice"), ("end",), '⚠ GENERATIVE AI · <span class="y">REVIEW BEFORE YOU ACT</span>')],
      stamps=[(w("err_1", "zero."), "F = 0 mN", RED)],
      sfx=[(w("err_1", "Error"), "hit"), (w("err_2", "Error"), "hit"), (w("err_3", "Error"), "hit"), (w("err_1", "zero."), "buzz")]),
    S(id="fb", kind="foot", chapter="CLOSE THE LOOP", beats=[("fb_1", 330, 342), ("fb_2", 342, 352)],
      cams=[(0, MODAL, 0)],
      hl=[(w("fb_1", "four"), w("fb_1", "and"), 342, 418, 372, 30, "4 SELECTED STUDENTS"),
          (w("fb_1", "feedback", 2), ("w", "fb_2", "Tick"), 342, 524, 1228, 114, "FEEDBACK TEXT"),
          (w("fb_2", "Tick"), w("fb_2", "press"), 344, 664, 186, 30, "NOTIFY"),
          (w("fb_2", "press"), w("fb_2", "I"), 866, 714, 182, 52, "SEND")],
      cards=[(w("fb_2", "lands"), ("end",), 'STUDENT SEES IT IN THE <span class="y">🔔 NOTIFICATION BELL</span>')],
      sfx=[(w("fb_2", "press"), "pop")]),
    G("teach", ["teach"]),
    G("close", ["close_1"]),
    G("cta", ["cta"], tail=3.0),
]


# --------------------------------------------------------------------------- timing
try:
    VIS = json.loads((HERE / "work" / "hl_vis.json").read_text())
except Exception:
    VIS = {}
HOLD_R = 0.7
FF_MAX = 4.0        # fastest skip through footage before a sync point (else trim the source instead)


def _local_sentence(cue, word, n):
    toks, k = WORDS[cue]["tokens"], 0
    for i, tk in enumerate(toks):
        if norm(tk["w"]) == norm(word):
            k += 1
            if k == n:
                j = i
                while j < len(toks) - 1 and not re.search(r"[.!?]$", toks[j]["w"]):
                    j += 1
                return tk["start"], toks[j]["end"]
    raise KeyError((cue, word, n))


def beat_clips(sc, cue, a, b):
    need = GAP + dur(cue) + TAIL
    nominal = min(RATE_MAX, max(RATE_MIN, (b - a) / need))
    syncs = []                      # (local_t, src_t)
    for k, hl in enumerate(sc["hl"]):
        a0 = hl[0]
        if not (isinstance(a0, tuple) and a0[0] == "w" and a0[1] == cue):
            continue
        v = VIS.get(f"hl-{sc['id']}-{k}")
        if not v:
            continue
        vs, ve = max(v[0], a), min(v[1], b)
        if ve - vs < 0.1:
            continue
        ws, se = _local_sentence(cue, a0[2], a0[3] if len(a0) > 3 else 1)
        w0 = GAP + ws - 0.15
        show = max(1.3, se + HOLD_R - ws)
        if syncs and w0 <= syncs[-1][0] + 0.05:          # previous box runs into this sentence: end it here
            (pl, ps), (el, es) = syncs[-2], syncs[-1]
            nl = max(pl + 0.3, w0 - 0.1)
            if nl >= w0 - 0.02:
                continue
            syncs[-1] = (nl, ps + (es - ps) * (nl - pl) / (el - pl))
        last_l, last_s = syncs[-1] if syncs else (0.0, a)
        s0 = max(vs + 0.05, last_s + 0.05)
        if s0 > ve - 0.05:
            continue
        s1 = min(ve - 0.05, s0 + show * nominal)
        if s1 - s0 < 0.15 * show:                       # target on screen too briefly to hold: rewind into it
            s0 = max(a, s1 - 0.15 * show)
        syncs += [(w0, s0), (w0 + show, max(s1, s0 + 0.02))]
    if not syncs:
        d = (b - a) / nominal
        return [dict(d=d, a=a, b=b, rate=nominal)], d
    need = max(need, syncs[-1][0] + 0.3)
    # skip, don't race: trim source before the first / after the last sync if it would play faster than FF_MAX
    l0, s0 = syncs[0]
    a2 = max(a, s0 - FF_MAX * l0) if (s0 - a) / l0 > FF_MAX else a
    l1, s1 = syncs[-1]
    tail = need - l1
    b2 = min(b, s1 + FF_MAX * tail) if (b - s1) / tail > FF_MAX else b
    b2 = max(b2, s1 + 0.05 * tail)
    pts = [(0.0, a2)] + syncs + [(need, b2)]
    clips = []
    for (la, sa), (lb, sb) in zip(pts, pts[1:]):
        d = lb - la
        if d <= 1e-3:
            continue
        if (sb - sa) / d < 0.15:                     # renderer can't hold near-frozen clips: play in from just before
            sa = max(0.0, sb - 0.15 * d)
        clips.append(dict(d=d, a=sa, b=sb, rate=(sb - sa) / d))
    return clips, need


def resolve():
    t = 0.0
    for sc in SCENES:
        sc["start"] = t
        if sc["kind"] == "foot":
            cur, sc["clips"], sc["vo"] = 0.0, [], []
            for cue, a, b in sc["beats"]:
                sc["vo"].append((cue, cur + GAP))
                clips, need = beat_clips(sc, cue, a, b)
                for c in clips:
                    c["t0"] = cur
                    sc["clips"].append(c)
                    cur += c["d"]
            sc["dur"] = cur
        t += sc["dur"]
    return t


TOTAL = resolve()


def A(sc, a):
    """Resolve an anchor to ABSOLUTE seconds."""
    s = sc["start"]
    if isinstance(a, (int, float)):
        return s + a
    if a[0] == "end":
        return s + sc["dur"] + (a[1] if len(a) > 1 else 0)
    if a[0] == "w":
        cue = a[1]
        st = dict(sc["vo"])[cue]
        return s + st + wt(cue, a[2], a[3] if len(a) > 3 else 1)
    if a[0] == "src":
        for c in sc["clips"]:
            if c["a"] - 1e-6 <= a[1] <= c["b"] + 1e-6:
                return s + c["t0"] + (a[1] - c["a"]) / c["rate"]
        raise ValueError(a)
    raise ValueError(a)


def src_marks(name):
    return [m for m in MARKS["marks"] if m["name"] == name]


def cam_xy(rect):
    x, y, w, h = rect
    s = max(CARD["W"] / w, CARD["H"] / h, 1.0)
    tx = min(0, max(CARD["W"] - SRC_W * s, (CARD["W"] - w * s) / 2 - x * s))
    ty = min(0, max(CARD["H"] - SRC_H * s, (CARD["H"] - h * s) / 2 - y * s))
    return tx, ty, s



HOLD = 0.7            # an overlay stays this long after the sentence it belongs to ends
MIN_SHOW = 1.3        # never flash shorter than this
try:
    SYNC = json.loads((HERE / "work" / "hl_sync.json").read_text())
except Exception:
    SYNC = {}
HL_DUMP = []


def sent_end(sc, a):
    """ABSOLUTE end of the sentence containing a word anchor (None for other anchors)."""
    if not (isinstance(a, tuple) and a[0] == "w"):
        return None
    cue, word, n = a[1], a[2], a[3] if len(a) > 3 else 1
    toks = WORDS[cue]["tokens"]
    k = 0
    for i, tk in enumerate(toks):
        if norm(tk["w"]) == norm(word):
            k += 1
            if k == n:
                j = i
                while j < len(toks) - 1 and not re.search(r"[.!?]$", toks[j]["w"]):
                    j += 1
                return sc["start"] + dict(sc["vo"])[cue] + toks[j]["end"]
    raise KeyError(a)


def tight(sc, a0, a1):
    """overlay window: from its word to the end of that sentence (+HOLD), never past its own end anchor"""
    t0, t1 = A(sc, a0), A(sc, a1)
    se = sent_end(sc, a0)
    if se is not None:
        t1 = min(t1, se + HOLD)
    return t0, max(t1, t0 + MIN_SHOW)


def to_src(sc, t):
    for c in sc["clips"]:
        if sc["start"] + c["t0"] - 1e-6 <= t <= sc["start"] + c["t0"] + c["d"] + 1e-6:
            return c["a"] + (t - sc["start"] - c["t0"]) * c["rate"]
    return None

fmt = lambda x: f"{x:.3f}"
esc = lambda s: html.escape(s, quote=True)


# --------------------------------------------------------------------------- gfx scenes
def wire_svg(prefix):
    """N and S poles, a wire across the gap (dot = current out of page, cross = into page), and force arrows:
    up (F), longer up (2F) and longer down (reversed). B points N -> S (left to right); F = I L x B."""
    def arrow(id_, y1, y2, label, ly):
        head = f"M236 {y2 + 30} L260 {y2} L284 {y2 + 30} Z" if y2 < y1 else f"M236 {y2 - 30} L260 {y2} L284 {y2 - 30} Z"
        return (f'<g id="{prefix}-{id_}" opacity="0"><line x1="260" y1="{y1}" x2="260" y2="{y2 + (24 if y2 < y1 else -24)}" '
                f'stroke="#ffd21f" stroke-width="14" stroke-linecap="round"/><path d="{head}" fill="#ffd21f"/>'
                f'<text x="298" y="{ly}" font-size="46" fill="#ffd21f" font-family="Display">{label}</text></g>')
    return (f'<svg viewBox="0 0 520 560" width="660" height="711">'
            f'<rect x="30" y="170" width="160" height="220" rx="14" fill="#ff4d6d"/><text x="110" y="300" text-anchor="middle" font-size="64" fill="#fff" font-family="Display">N</text>'
            f'<rect x="330" y="170" width="160" height="220" rx="14" fill="#1f8fff"/><text x="410" y="300" text-anchor="middle" font-size="64" fill="#fff" font-family="Display">S</text>'
            f'<g opacity=".55"><line x1="40" y1="140" x2="160" y2="140" stroke="#cfd8f5" stroke-width="5"/><path d="M160 130 L180 140 L160 150 Z" fill="#cfd8f5"/>'
            f'<text x="100" y="125" text-anchor="middle" font-size="30" fill="#cfd8f5" font-family="Display">B</text></g>'
            f'<circle cx="260" cy="280" r="28" fill="#e8eefc" stroke="#111" stroke-width="5"/>'
            f'<g id="{prefix}-dot"><circle cx="260" cy="280" r="9" fill="#111"/></g>'
            f'<g id="{prefix}-x" opacity="0" stroke="#111" stroke-width="6" stroke-linecap="round"><line x1="246" y1="266" x2="274" y2="294"/><line x1="274" y1="266" x2="246" y2="294"/></g>'
            + arrow("f1", 246, 150, "F", 196) + arrow("f2", 246, 40, "2F", 120) + arrow("f3", 314, 520, "2F", 470) + '</svg>')


def gfx_html(sc):
    i = sc["id"]
    if i == "title":
        return '''<div class="gstack">
          <div id="ti-pill" class="pill">PART 2 · SLS · xAPI · DATA ASSISTANT</div>
          <div class="trow"><div id="ti-1" class="mega">ONE STUDENT</div><div id="ti-ar" class="bigarrow">➜</div><div id="ti-2" class="mega grad">WHOLE CLASS</div></div>
          <div id="ti-3" class="tsub">find your class's most common errors in a virtual lab</div></div>'''
    if i == "recap":
        return '''<div class="gstack">
          <div id="rc-h" class="pill big">PREVIOUSLY · PART 1</div>
          <div class="flow"><div id="rc-0" class="fnode">simulation</div><div class="farrow">➜</div><div id="rc-1" class="fnode">ChatGPT plugin adds xAPI</div>
          <div class="farrow">➜</div><div id="rc-2" class="fnode">every experiment → SLS</div></div>
          <div id="rc-3" class="mega grad">NOW: THE WHOLE CLASS</div></div>'''
    if i == "phy":
        return f'''<div class="gstack">
          <div id="ph-h" class="pill big">THE PHYSICS · FORCE ON A CURRENT</div>
          <div class="brow"><div id="ph-svg">{wire_svg("pw")}</div>
            <div class="calc"><div id="ph-0" class="cl"><span class="y">F = B I L</span></div>
              <div id="ph-1" class="cl sm">B field · I current · L length in the field</div>
              <div id="ph-2" class="cl">I = 0 → <span class="r">F = 0</span></div>
              <div id="ph-3" class="cl">2 × I → <span class="y">2 × F</span></div>
              <div id="ph-4" class="cl sm">reverse I or flip B → F reverses (Fleming's left-hand rule)</div></div></div></div>'''
    if i == "teach":
        tips = [("1", "SWITCH ON FIRST", "30-second demo: no current, no force"), ("2", "F AT 5 CURRENTS", "tabulate and plot F against I"),
                ("3", "COMBINE B, I, F", "Fleming's left-hand rule")]
        cards = "".join(f'<div id="te-{k}" class="tip"><div class="snum">{n}</div><div class="tt">{a}</div><div class="ts">{b}</div></div>'
                        for k, (n, a, b) in enumerate(tips))
        return f'<div class="gstack"><div id="te-h" class="pill big">NEXT LESSON, FROM THE DATA</div><div class="tips">{cards}</div></div>'
    if i == "close":
        return '''<div class="gstack">
          <div class="flow"><div id="cl-0" class="fnode">xAPI <span class="y">captures the process</span></div><div class="farrow">➜</div>
          <div id="cl-1" class="fnode">Data Assistant <span class="y">finds the patterns</span></div><div class="farrow">➜</div>
          <div id="cl-2" class="fnode hot">YOU decide what's next</div></div>
          <div id="cl-3" class="mega grad">DATA-INFORMED TEACHING</div></div>'''
    if i == "cta":
        return '''<div class="gstack">
          <div id="c-1" class="mega">WATCH PART 1</div>
          <div id="c-2" class="pill">BUILD YOUR OWN xAPI INTERACTIVE · FREE CHATGPT PLUGIN</div>
          <div id="c-3" class="url">iwant2study.org</div>
          <div id="c-4" class="follow">💬 YOUR CLASS'S MOST COMMON ERROR?</div>
          <div id="c-5" class="credit">Student names blurred · Narration is computer-generated · AI wait time shortened in the edit</div></div>'''
    raise KeyError(i)


def gfx_js(sc):
    i, s = sc["id"], sc["start"]
    T = lambda x: fmt(s + x)
    W = lambda cue, wd, n=1: fmt(A(sc, ("w", cue, wd, n)))
    pop = 'ease:"back.out(2)"'
    js = []
    if i == "title":
        js += [f'tl.fromTo("#ti-pill",{{opacity:0,y:-40}},{{opacity:1,y:0,duration:.35}},{T(0.1)});',
               f'tl.fromTo("#ti-1",{{opacity:0,x:-120}},{{opacity:1,x:0,duration:.4,ease:"power3.out"}},{W("title", "From")});',
               f'tl.fromTo("#ti-ar",{{opacity:0,scale:.3}},{{opacity:1,scale:1,duration:.35,{pop}}},{W("title", "evidence,")});',
               f'tl.fromTo("#ti-2",{{opacity:0,scale:1.8}},{{opacity:1,scale:1,duration:.45,{pop}}},{W("title", "whole")});',
               f'tl.fromTo("#ti-3",{{opacity:0,y:30}},{{opacity:1,y:0,duration:.4}},{W("title", "class.")}+0.2);']
    elif i == "recap":
        js.append(f'tl.fromTo("#rc-h",{{opacity:0,y:-40}},{{opacity:1,y:0,duration:.35}},{T(0.2)});')
        for k, wd in enumerate(["simulation,", "plugin", "comes"]):
            js.append(f'tl.fromTo("#rc-{k}",{{opacity:0,y:40,scale:.7}},{{opacity:1,y:0,scale:1,duration:.35,{pop}}},{W("recap", wd)});')
        js.append(f'tl.fromTo("#rc-3",{{opacity:0,scale:1.6}},{{opacity:1,scale:1,duration:.45,{pop}}},{W("recap", "whole")});')
    elif i == "phy":
        js += [f'tl.fromTo("#ph-h",{{opacity:0,y:-40}},{{opacity:1,y:0,duration:.35}},{T(0.15)});',
               f'tl.fromTo("#ph-svg",{{opacity:0,x:-100}},{{opacity:1,x:0,duration:.45,ease:"power3.out"}},{W("phy_1", "wire")});',
               f'tl.fromTo("#pw-f1",{{opacity:0,y:40}},{{opacity:1,y:0,duration:.4,{pop}}},{W("phy_1", "force.")});',
               f'tl.fromTo("#ph-0",{{opacity:0,scale:1.6}},{{opacity:1,scale:1,duration:.4,{pop}}},{W("phy_1", "F")});',
               f'tl.fromTo("#ph-1",{{opacity:0,x:-60}},{{opacity:1,x:0,duration:.35}},{W("phy_1", "Field", 2)});',
               f'tl.fromTo("#ph-2",{{opacity:0,x:-60}},{{opacity:1,x:0,duration:.35}},{W("phy_2", "So")});',
               f'tl.to(["#pw-f1","#pw-dot"],{{opacity:0,duration:.25}},{W("phy_2", "zero,")});',
               f'tl.fromTo("#ph-3",{{opacity:0,x:-60}},{{opacity:1,x:0,duration:.35}},{W("phy_2", "Double")});',
               f'tl.to("#pw-dot",{{opacity:1,duration:.2}},{W("phy_2", "Double")});',
               f'tl.fromTo("#pw-f2",{{opacity:0,scaleY:.4,transformOrigin:"260px 246px"}},{{opacity:1,scaleY:1,duration:.45,{pop}}},{W("phy_2", "doubles.")});',
               f'tl.fromTo("#ph-4",{{opacity:0,x:-60}},{{opacity:1,x:0,duration:.35}},{W("phy_2", "Reverse")});',
               f'tl.to(["#pw-f2","#pw-dot"],{{opacity:0,duration:.2}},{W("phy_2", "Reverse")});',
               f'tl.to("#pw-x",{{opacity:1,duration:.2}},{W("phy_2", "Reverse")});',
               f'tl.fromTo("#pw-f3",{{opacity:0,scaleY:.4,transformOrigin:"260px 314px"}},{{opacity:1,scaleY:1,duration:.45,{pop}}},{W("phy_2", "current,", 3)});']
        for wd in ("F", "So", "Double", "Reverse"):
            sc["sfx"].append((A(sc, ("w", "phy_1" if wd == "F" else "phy_2", wd)) - s, "pop"))
    elif i == "teach":
        js.append(f'tl.fromTo("#te-h",{{opacity:0,y:-50}},{{opacity:1,y:0,duration:.35}},{T(0.2)});')
        for k, (cue, wd) in enumerate([("teach", "Start"), ("teach", "Then"), ("teach", "Finally,")]):
            js.append(f'tl.fromTo("#te-{k}",{{opacity:0,y:90,scale:.8}},{{opacity:1,y:0,scale:1,duration:.4,{pop}}},{W(cue, wd)});')
            sc["sfx"].append((A(sc, ("w", cue, wd)) - s, "pop"))
    elif i == "close":
        for k, wd in enumerate(["captures", "finds", "you"]):
            js.append(f'tl.fromTo("#cl-{k}",{{opacity:0,y:40,scale:.7}},{{opacity:1,y:0,scale:1,duration:.35,{pop}}},{W("close_1", wd)});')
        js.append(f'tl.fromTo("#cl-3",{{opacity:0,scale:1.6}},{{opacity:1,scale:1,duration:.45,{pop}}},{W("close_1", "data-informed")});')
    elif i == "cta":
        js += [f'tl.fromTo("#c-1",{{opacity:0,y:50}},{{opacity:1,y:0,duration:.4}},{W("cta", "Watch")});',
               f'tl.fromTo("#c-2",{{opacity:0,scale:.6}},{{opacity:1,scale:1,duration:.35,{pop}}},{W("cta", "build")});',
               f'tl.fromTo("#c-3",{{opacity:0,scale:.5}},{{opacity:1,scale:1,duration:.45,{pop}}},{W("cta", "Free")});',
               f'tl.fromTo("#c-4",{{opacity:0,y:40}},{{opacity:1,y:0,duration:.4,{pop}}},{W("cta", "Tell")});',
               f'tl.fromTo("#c-4",{{scale:1}},{{scale:1.05,duration:.45,yoyo:true,repeat:7,ease:"sine.inOut",immediateRender:false}},{W("cta", "Tell")}+0.5);',
               f'tl.fromTo("#c-5",{{opacity:0}},{{opacity:.85,duration:.6}},{W("cta", "Tell")});']
    return js


# --------------------------------------------------------------------------- page
def build():
    js = ['tl.set("#push",{scale:1},0); tl.set("#stagein",{scale:1,opacity:1},0);']
    vids, cam_layer, scr, gfx = [], [], [], []
    n = 0
    for sc in SCENES:
        s, d = sc["start"], sc["dur"]
        if sc["kind"] == "gfx":
            gfx.append(f'<div id="g-{sc["id"]}" class="clip gscene" data-start="{fmt(s)}" data-duration="{fmt(d)}" data-track-index="3">{gfx_html(sc)}</div>')
            js += gfx_js(sc)
            js.append(f'tl.set("#stage",{{opacity:0}},{fmt(s)});')
            continue
        js.append(f'tl.set("#stage",{{opacity:1}},{fmt(s)});')
        js.append(f'tl.fromTo("#stagein",{{scale:1.08,opacity:.2}},{{scale:1,opacity:1,duration:.35,ease:"power3.out",immediateRender:false}},{fmt(s)});')
        js.append(f'tl.fromTo("#push",{{scale:1}},{{scale:1.03,duration:{d - 0.02:.3f},ease:"none",immediateRender:false}},{fmt(s)});')
        for c in sc["clips"]:
            n += 1
            vids.append(f'<video id="v{n}" class="clip vid" src="assets/screen.mp4" data-start="{fmt(s + c["t0"])}" data-duration="{fmt(c["d"])}" '
                        f'data-media-start="{fmt(c["a"])}" data-playback-rate="{c["rate"]:.4f}" data-track-index="1" muted playsinline></video>')
        for a, rect, tw in sc["cams"]:
            x, y, k = cam_xy(rect)
            t = A(sc, a)
            if tw == 0:
                js.append(f'tl.set("#cam",{{x:{x:.1f},y:{y:.1f},scale:{k:.4f}}},{fmt(t)});')
            else:
                js.append(f'tl.to("#cam",{{x:{x:.1f},y:{y:.1f},scale:{k:.4f},duration:{tw},ease:"power2.inOut"}},{fmt(t)});')
        # chapter tag
        if sc.get("chapter"):
            cid = f"ch-{sc['id']}"
            scr.append(f'<div id="{cid}" class="clip chap" data-start="{fmt(s)}" data-duration="{fmt(min(d, 4.5))}" data-track-index="4"><div class="chapin">{esc(sc["chapter"])}</div></div>')
            js.append(f'tl.fromTo("#{cid} .chapin",{{x:-400}},{{x:0,duration:.45,ease:"power3.out"}},{fmt(s + 0.1)});')
        # banners (hook)
        for k, (a, text, cls) in enumerate(sc["banners"]):
            t0 = A(sc, a)
            t1 = A(sc, sc["banners"][k + 1][0]) if k + 1 < len(sc["banners"]) else s + d
            se = sent_end(sc, a)
            if se is not None:
                t1 = min(t1, max(se + HOLD, t0 + MIN_SHOW))
            bid = f"bn-{sc['id']}-{k}"
            scr.append(f'<div id="{bid}" class="clip banner" data-start="{fmt(t0)}" data-duration="{fmt(t1 - t0)}" data-track-index="5"><div class="bin {cls}">{esc(text)}</div></div>')
            js.append(f'tl.fromTo("#{bid} .bin",{{scale:2.2,opacity:0,rotation:-4}},{{scale:1,opacity:1,rotation:0,duration:.3,ease:"back.out(2)"}},{fmt(t0)});')
        # camera-space highlight boxes
        for k, (a0, a1, x, y, w, h, label) in enumerate(sc["hl"]):
            t0, t1 = tight(sc, a0, a1)
            hid = f"hl-{sc['id']}-{k}"
            HL_DUMP.append(dict(id=hid, t0=t0, t1=t1, box=[x, y, w, h], label=label,
                                samples=[(round(t, 2), to_src(sc, t)) for t in [t0 - 2.0 + 0.1 * i for i in range(int((t1 - t0 + 2.0) / 0.1) + 1)]
                                         if to_src(sc, t) is not None]))
            nxt = [tight(sc, h2[0], h2[1])[0] for h2 in sc["hl"][k + 1:] if h2[0][0] == "w"]
            if nxt and t0 < nxt[0] < t1:
                t1 = max(t0 + 0.6, nxt[0] - 0.1)
            if hid in SYNC:
                if SYNC[hid] is None:
                    continue
                t0, t1 = max(t0, SYNC[hid][0]), min(t1, SYNC[hid][1])
            lab = f'<div class="hlab">{esc(label)}</div>' if label else ""
            cam_layer.append(f'<div id="{hid}" class="clip hl" data-start="{fmt(t0)}" data-duration="{fmt(t1 - t0)}" data-track-index="6" style="left:{x}px;top:{y}px;width:{w}px;height:{h}px">{lab}</div>')
            js.append(f'tl.fromTo("#{hid}",{{opacity:0,scale:1.2}},{{opacity:1,scale:1,duration:.25,ease:"back.out(2)"}},{fmt(t0)});')
            pid = f"pt-{sc['id']}-{k}"
            cam_layer.append(f'<div id="{pid}" class="clip ptr" data-start="{fmt(t0 - 0.45)}" data-duration="{fmt(min(1.9, t1 - t0 + 0.45))}" data-track-index="9" '
                             f'style="left:{x + w - 10}px;top:{y + h - 6}px"><svg width="70" height="70" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.8 L10.6 14 L17 14 Z" fill="#ffe14a" stroke="#000" stroke-width="1.4" stroke-linejoin="round"/></svg></div>')
            js.append(f'tl.fromTo("#{pid}",{{x:160,y:140,opacity:0}},{{x:0,y:0,opacity:1,duration:.45,ease:"power3.out"}},{fmt(t0 - 0.45)});')
            js.append(f'tl.fromTo("#{pid}",{{scale:1}},{{scale:.8,duration:.12,yoyo:true,repeat:1,immediateRender:false}},{fmt(t0)});')
        # horizontal temperature lines across the stage-2 graph
        for k, (a0, a1, T, col, label) in enumerate(sc["hlines"]):
            t0, t1 = A(sc, a0), A(sc, a1)
            lid = f"hn-{sc['id']}-{k}"
            cam_layer.append(f'<div id="{lid}" class="clip hn" data-start="{fmt(t0)}" data-duration="{fmt(t1 - t0)}" data-track-index="6" style="top:{GY(T) - 3:.1f}px">'
                             f'<div class="hnbar" style="border-color:{col};box-shadow:0 0 14px {col}"></div><div class="hnlab" style="background:{col}">{esc(label)}</div></div>')
            js.append(f'tl.fromTo("#{lid} .hnbar",{{scaleX:0}},{{scaleX:1,duration:.45,ease:"power2.out"}},{fmt(t0)});')
            js.append(f'tl.fromTo("#{lid} .hnlab",{{opacity:0,y:-20}},{{opacity:1,y:0,duration:.3,ease:"back.out(2)"}},{fmt(t0 + 0.2)});')
        # predict countdown overlay on footage
        for k, (a0, label) in enumerate(sc["counts"]):
            t0 = A(sc, a0)
            cid = f"cn-{sc['id']}-{k}"
            scr.append(f'<div id="{cid}" class="clip cnt" data-start="{fmt(t0)}" data-duration="2.2" data-track-index="5"><div class="cntin">'
                       f'<div class="cntl">{esc(label)}</div><div class="count sm"><span>3</span><span>2</span><span>1</span></div></div></div>')
            js.append(f'tl.fromTo("#{cid} .cntin",{{scale:2,opacity:0}},{{scale:1,opacity:1,duration:.3,ease:"back.out(2)"}},{fmt(t0)});')
            js.append(f'tl.fromTo("#{cid} .count span",{{opacity:.15,scale:.6}},{{opacity:1,scale:1.25,duration:.25,stagger:.5,ease:"back.out(2)"}},{fmt(t0 + 0.3)});')
            for q in range(3):
                sc["sfx"].append((t0 - s + 0.3 + 0.5 * q, "tick"))
        # equation / result cards (screen space, top-right of the card)
        for k, (a0, a1, htm) in enumerate(sc["cards"]):
            t0, t1 = tight(sc, a0, a1)
            cid = f"cd-{sc['id']}-{k}"
            scr.append(f'<div id="{cid}" class="clip eqw" data-start="{fmt(t0)}" data-duration="{fmt(t1 - t0)}" data-track-index="5"><div class="eq">{htm}</div></div>')
            js.append(f'tl.fromTo("#{cid} .eq",{{y:-60,opacity:0,scale:.9}},{{y:0,opacity:1,scale:1,duration:.35,ease:"back.out(1.8)"}},{fmt(t0)});')
        # stamps
        for k, (a, text, col) in enumerate(sc["stamps"]):
            t0 = A(sc, a)
            sid = f"st-{sc['id']}-{k}"
            scr.append(f'<div id="{sid}" class="clip stampw" data-start="{fmt(t0)}" data-duration="{fmt(min(2.0, s + d - t0))}" data-track-index="5"><div class="stamp" style="color:{col};border-color:{col}">{esc(text)}</div></div>')
            js.append(f'tl.fromTo("#{sid} .stamp",{{scale:3,opacity:0,rotation:-16}},{{scale:1,opacity:1,rotation:-6,duration:.22,ease:"power4.in"}},{fmt(t0)});')
            js.append(shake(t0)); js.append(flash(t0, 0.5))
        # click ripples from the recording
        for m in MARKS["marks"]:
            if m["name"] != "click":
                continue
            ts = m["frame"] / MARKS["fps"]
            if not any(c["a"] <= ts <= c["b"] for c in sc["clips"]):
                continue
            t0 = A(sc, ("src", ts))
            rid = f"rp-{sc['id']}-{m['frame']}"
            cam_layer.append(f'<div id="{rid}" class="clip rip" data-start="{fmt(t0)}" data-duration="0.7" data-track-index="7" style="left:{m["x"] * 1.5 - 40:.0f}px;top:{m["y"] * 1.5 - 40:.0f}px"></div>')
            js.append(f'tl.fromTo("#{rid}",{{scale:.2,opacity:1}},{{scale:1.6,opacity:0,duration:.6,ease:"power2.out"}},{fmt(t0)});')
            if m["name"] == "select":
                sid = f"sl-{sc['id']}-{m['frame']}"
                scr.append(f'<div id="{sid}" class="clip selp" data-start="{fmt(t0)}" data-duration="1.6" data-track-index="5"><div class="selin">▾ {esc(m["label"])}</div></div>')
                js.append(f'tl.fromTo("#{sid} .selin",{{y:-30,opacity:0}},{{y:0,opacity:1,duration:.25,ease:"back.out(2)"}},{fmt(t0)});')
                sc["sfx"].append((t0 - s, "click"))
            else:
                sc["sfx"].append((t0 - s, "click"))
    for sc in SCENES[1:]:
        js.append(flash(sc["start"], 0.45, 0.18))

    # captions
    caps = []
    SHOW_CAPS = False
    ck = 0
    for sc in SCENES:
        for cue, st in (sc["vo"] if SHOW_CAPS else []):
            base = sc["start"] + st
            toks = list(WORDS[cue]["tokens"])
            for i in range(len(toks) - 5):     # show the domain the way it is typed
                if [norm(t["w"]) for t in toks[i:i + 6]] == ["i", "want", "to", "study", "dot", "org"]:
                    toks[i:i + 6] = [dict(w="iwant2study.org.", start=toks[i]["start"], end=toks[i + 5]["end"])]
                    break
            chunks, cur = [], []
            for tk in toks:
                cur.append(tk)
                if len(cur) >= 5 or re.search(r"[.,!?]$", tk["w"]):
                    chunks.append(cur); cur = []
            if cur:
                chunks.append(cur)
            for i, ch in enumerate(chunks):
                t0 = base + ch[0]["start"] - 0.05
                t1 = base + (chunks[i + 1][0]["start"] - 0.05 if i + 1 < len(chunks) else ch[-1]["end"] + 0.25)
                words = [(base + w["start"], w["w"]) for w in ch]
                spans = "".join(f'<span id="cw{ck}-{j}" class="cw">{esc(w if "iwant2study" in w else w.upper())}</span>' for j, (_, w) in enumerate(words))
                caps.append(f'<div id="cap{ck}" class="clip cap" data-start="{fmt(t0)}" data-duration="{fmt(max(0.1, t1 - t0))}" data-track-index="8"><div class="capin">{spans}</div></div>')
                js.append(f'tl.fromTo("#cap{ck} .capin",{{scale:.9,opacity:0}},{{scale:1,opacity:1,duration:.1}},{fmt(t0)});')
                for j, (tw_, _) in enumerate(words):
                    nx = words[j + 1][0] if j + 1 < len(words) else t1 - 0.05
                    js.append(f'tl.fromTo("#cw{ck}-{j}",{{color:"#ffffff"}},{{color:"#ffd21f",duration:.06}},{fmt(tw_)});')
                    js.append(f'tl.to("#cw{ck}-{j}",{{color:"#ffffff",duration:.08}},{fmt(max(nx, tw_ + 0.07))});')
                ck += 1

    js.append(f'tl.fromTo("#prog",{{scaleX:0}},{{scaleX:1,duration:{TOTAL:.3f},ease:"none"}},0);')
    js.append(f'tl.fromTo("#blobA",{{x:-150,y:-80}},{{x:150,y:60,duration:{TOTAL / 4:.2f},yoyo:true,repeat:3,ease:"sine.inOut"}},0);')
    js.append(f'tl.fromTo("#blobB",{{x:150,y:80}},{{x:-160,y:-50,duration:{TOTAL / 3:.2f},yoyo:true,repeat:2,ease:"sine.inOut"}},0);')
    page = (TEMPLATE.replace("%TOTAL%", fmt(TOTAL)).replace("%VIDS%", "\n".join(vids)).replace("%CAM%", "\n".join(cam_layer))
            .replace("%SCR%", "\n".join(scr)).replace("%GFX%", "\n".join(gfx)).replace("%CAPS%", "\n".join(caps)).replace("%JS%", "\n".join(js)))
    (HF / "index.html").write_text(page, encoding="utf-8")

    plan = dict(total=TOTAL, vo=[], sfx=[], scenes=[])
    for sc in SCENES:
        for cue, st in sc["vo"]:
            plan["vo"].append((sc["start"] + st, cue, dur(cue)))
        for a, name in sc["sfx"]:
            plan["sfx"].append((A(sc, a) if not isinstance(a, (int, float)) else sc["start"] + a, name))
        plan["scenes"].append(dict(id=sc["id"], kind=sc["kind"], start=sc["start"], dur=sc["dur"], chapter=sc.get("chapter", "")))
    (HERE / "work" / "plan.json").write_text(json.dumps(plan, indent=1))
    (HERE / "work" / "hl_list.json").write_text(json.dumps(HL_DUMP))
    for sc in SCENES:
        rates = ",".join(f'{c["rate"]:.2f}' for c in sc.get("clips", []))
        print(f"{sc['start']:7.2f} +{sc['dur']:6.2f}  {sc['id']:7s} {rates}")
    print(f"TOTAL {TOTAL:.2f}s  videos {n}")


def shake(t):
    return (f'tl.fromTo("#world",{{x:0,y:0}},{{keyframes:[{{x:-10,y:6}},{{x:9,y:-7}},{{x:-5,y:4}},{{x:0,y:0}}],'
            f'duration:.28,immediateRender:false}},{fmt(t)});')


def flash(t, peak=0.6, d=0.22):
    return f'tl.fromTo("#flash",{{opacity:{peak}}},{{opacity:0,duration:{d},immediateRender:false}},{fmt(t)});'


TEMPLATE = r'''<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=1920, height=1080" />
<script src="https://cdn.jsdelivr.net/npm/gsap@3.14.2/dist/gsap.min.js"></script>
<style>
@font-face { font-family: "Display"; src: url("assets/fonts/seguibl.ttf") format("truetype"); font-weight: 900; }
@font-face { font-family: "Body"; src: url("assets/fonts/segoeuib.ttf") format("truetype"); font-weight: 700; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 1920px; height: 1080px; overflow: hidden; background: #081026; }
#root { position: relative; width: 100%; height: 100%; overflow: hidden; font-family: "Display", sans-serif; color: #fff; }
#world { position: absolute; inset: 0; }
.bg { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 40%, #13224d 0%, #081026 70%); }
.grid { position: absolute; inset: 0; opacity: .16; background-image: linear-gradient(rgba(140,170,255,.25) 1px, transparent 1px), linear-gradient(90deg, rgba(140,170,255,.25) 1px, transparent 1px); background-size: 80px 80px; }
.blob { position: absolute; width: 900px; height: 900px; border-radius: 50%; filter: blur(150px); opacity: .4; }
#blobA { left: -250px; top: -250px; background: #1fa3ff; }
#blobB { right: -250px; bottom: -300px; background: #ffb21f; }
#stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; }
#stagein, #push { position: absolute; inset: 0; }
#card { position: absolute; inset: 0; overflow: hidden; background: radial-gradient(ellipse at 50% 50%, #13224d 0%, #081026 75%); }
#cam { position: absolute; left: 0; top: 0; width: 1900px; height: 966px; transform-origin: 0 0; }
.vid { position: absolute; left: 0; top: 0; width: 1900px; height: 966px; }
.hl { position: absolute; border: 6px solid #ffd21f; border-radius: 14px; box-shadow: 0 0 26px rgba(255,210,31,.85); }
.hlab, .colab { position: absolute; left: -6px; top: -58px; background: #ffd21f; color: #111; font-size: 32px; padding: 4px 16px; border-radius: 10px; white-space: nowrap; }
.co { border-color: #ffd21f; }
.vl { position: absolute; width: 6px; }
.vlbar { position: absolute; inset: 0; border-radius: 3px; transform-origin: 50% 100%; }
.vllab { position: absolute; left: -60px; width: 126px; text-align: center; font-size: 26px; white-space: nowrap; text-shadow: 0 2px 0 #000, 0 0 8px #000; }
.sweep { position: absolute; width: 32px; height: 160px; border: 4px solid #ffd21f; border-radius: 10px; background: rgba(255,210,31,.18); }
.rip { position: absolute; width: 80px; height: 80px; border-radius: 50%; border: 6px solid #ff4d6d; }
.chap { position: absolute; left: 0; top: 990px; width: 1100px; height: 80px; overflow: hidden; }
.chapin { display: inline-block; margin: 10px 0 0 24px; font-size: 36px; color: #111; background: #ffd21f; padding: 6px 20px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0,0,0,.35); }
.banner { position: absolute; left: 0; top: 700px; width: 1920px; height: 220px; display: flex; align-items: center; justify-content: center; }
.bin { display: block; font-size: 150px; padding: 6px 48px; border-radius: 28px; background: rgba(8,16,38,.88); letter-spacing: -2px; box-shadow: 0 20px 60px rgba(0,0,0,.5); }
.bin.org { color: #ff9a3c; } .bin.blu { color: #4fb0ff; } .bin.yel { color: #ffd21f; } .bin.wht { color: #fff; }
.eqw { position: absolute; right: 40px; top: 110px; width: 1000px; height: 130px; display: flex; justify-content: flex-end; align-items: flex-start; }
.eq { display: block; font-size: 60px; padding: 12px 34px; border-radius: 20px; background: rgba(8,16,38,.9); border: 4px solid #ffd21f; box-shadow: 0 16px 40px rgba(0,0,0,.5); white-space: nowrap; }
.eq .k { color: #9fb6ff; font-size: 40px; margin-right: 12px; }
.y { color: #ffd21f; } .r { color: #ff5a6e; } .o { color: #ff9a3c; } .b { color: #4fb0ff; }
.stampw { position: absolute; left: 560px; top: 330px; width: 800px; height: 200px; display: flex; align-items: center; justify-content: center; }
.stamp { display: block; font-size: 84px; padding: 6px 34px; border: 10px solid; border-radius: 22px; background: rgba(255,255,255,.95); white-space: nowrap; }
.selp { position: absolute; left: 1360px; top: 110px; width: 400px; height: 80px; }
.selin { display: inline-block; font-size: 34px; color: #111; background: #fff; border: 4px solid #1fa3ff; border-radius: 12px; padding: 6px 18px; box-shadow: 0 10px 30px rgba(0,0,0,.4); }
.gscene { position: absolute; inset: 0; }
.gstack { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 26px; padding-bottom: 120px; }
.mega { display: block; font-size: 110px; line-height: 1; letter-spacing: -3px; text-align: center; }
.grad { background: linear-gradient(90deg, #27e0ff 0%, #ffd21f 55%, #ff9a1f 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.tsub { display: block; font-family: "Body"; font-size: 50px; color: #d8e2ff; }
.pill { display: block; font-size: 36px; color: #111; background: #ffd21f; padding: 8px 26px; border-radius: 40px; }
.pill.big { font-size: 56px; padding: 10px 38px; }
.red-p { background: #ff4d6d; color: #fff; }
.formula { display: block; font-size: 92px; letter-spacing: -2px; padding: 16px 40px; border-radius: 26px; background: rgba(255,255,255,.07); border: 4px solid #ffd21f; }
.zrow { display: flex; gap: 60px; }
.zcard { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 640px; padding: 26px; border-radius: 26px; background: rgba(255,255,255,.08); border: 4px solid #27e0ff; }
.zt { display: block; font-size: 54px; } .zb { display: block; font-family: "Body"; font-size: 50px; color: #ffd21f; } .zs { display: block; font-family: "Body"; font-size: 38px; color: #cfd8f5; }
.tips { display: flex; gap: 28px; }
.tip { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 420px; padding: 30px 18px; border-radius: 28px; background: rgba(255,255,255,.08); border: 4px solid #ffd21f; text-align: center; }
.tip.bad { width: 520px; border-color: #ff4d6d; }
.snum { display: block; width: 100px; height: 100px; border-radius: 50%; background: #ffd21f; color: #111; font-size: 66px; line-height: 100px; text-align: center; }
.snum.x { background: #ff4d6d; color: #fff; }
.tt { display: block; font-size: 46px; line-height: 1.05; } .ts { display: block; font-family: "Body"; font-size: 34px; color: #cfd8f5; }
.small { transform: scale(.8); }
.url { display: block; font-size: 88px; color: #111; background: #fff; padding: 6px 34px; border-radius: 22px; box-shadow: 0 0 60px rgba(255,210,31,.6); }
.follow { display: block; white-space: nowrap; font-size: 46px; background: #ff4d6d; padding: 12px 34px; border-radius: 18px; }
.credit { display: block; font-family: "Body"; font-size: 26px; color: #aab6d8; }
.cap { position: absolute; left: 60px; right: 60px; top: 930px; height: 130px; display: flex; align-items: center; justify-content: center; }
.capin { display: block; text-align: center; font-size: 54px; line-height: 1.1; padding: 10px 30px; border-radius: 20px; background: rgba(5,10,28,.78); }
.cw { display: inline-block; margin: 0 .13em; text-shadow: 0 4px 0 #000; }
#flash { position: absolute; inset: 0; background: #fff; opacity: 0; }
#progw { position: absolute; left: 0; top: 0; width: 1920px; height: 8px; background: rgba(255,255,255,.08); }
#prog { position: absolute; left: 0; top: 0; width: 1920px; height: 8px; transform-origin: 0 50%; background: linear-gradient(90deg,#27e0ff,#ffd21f,#ff9a1f); }
.hn { position: absolute; left: 1041px; width: 838px; height: 6px; }
.hnbar { position: absolute; left: 0; right: 0; top: 0; border-top: 6px dashed; transform-origin: 0 50%; }
.hnlab { position: absolute; left: 10px; top: -50px; color: #111; font-size: 30px; padding: 3px 14px; border-radius: 10px; white-space: nowrap; }
.cnt { position: absolute; left: 0; top: 330px; width: 1920px; height: 300px; display: flex; justify-content: center; }
.cntin { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 18px 50px; border-radius: 28px; background: rgba(8,16,38,.9); border: 6px solid #ffd21f; }
.cntl { display: block; font-size: 80px; color: #ffd21f; }
.count { display: flex; gap: 26px; font-size: 110px; }
.count span { display: block; width: 110px; text-align: center; }
.count.sm { font-size: 80px; }
.trow { display: flex; gap: 40px; }
.brow { display: flex; align-items: center; gap: 40px; }
.bigarrow { display: block; font-size: 130px; color: #ffd21f; }
.vsrow { display: flex; align-items: center; gap: 50px; }
.vs { display: flex; flex-direction: column; align-items: center; gap: 8px; width: 560px; padding: 30px; border-radius: 30px; background: rgba(255,255,255,.08); border: 5px solid #ffd21f; }
.vt { display: block; font-size: 52px; } .vn { display: block; font-size: 110px; }
.vsx { display: block; font-size: 90px; color: #ff4d6d; }
.ptr { position: absolute; width: 70px; height: 70px; filter: drop-shadow(0 4px 6px rgba(0,0,0,.5)); }
.calc { display: flex; flex-direction: column; gap: 18px; padding: 34px 50px; border-radius: 28px; background: rgba(255,255,255,.07); border: 4px solid #ffd21f; }
.cl { display: block; font-size: 64px; } .cl.sm { font-size: 44px; color: #cfd8f5; }
.flow { display: flex; align-items: center; gap: 16px; }
.fnode { display: block; font-size: 44px; padding: 8px 24px; border-radius: 18px; background: rgba(255,255,255,.1); border: 4px solid rgba(255,255,255,.35); }
.fnode.hot { color: #111; background: #ffd21f; border-color: #ffd21f; }
.farrow { display: block; font-size: 48px; color: #ffd21f; }
.brand { position: absolute; left: 22px; bottom: 14px; font-family: "Body"; font-size: 20px; color: rgba(255,255,255,.6); }
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="%TOTAL%" data-width="1920" data-height="1080">
 <div id="world">
  <div class="bg"></div><div class="grid"></div><div id="blobA" class="blob"></div><div id="blobB" class="blob"></div>
  <div id="stage"><div id="stagein"><div id="push"><div id="card"><div id="cam">
%VIDS%
%CAM%
  </div></div></div></div></div>
%SCR%
%GFX%
%CAPS%
  
 </div>
 <div id="progw"><div id="prog"></div></div>
 <div id="flash"></div>
</div>
<script>
const tl = gsap.timeline({ paused: true });
%JS%
window.__timelines["main"] = tl;
</script>
</body>
</html>
'''

if __name__ == "__main__":
    build()
