"""Cute synthesized SFX for the cast layer (procedural numpy, no third-party audio).

In soundtrack.py:   from cute_sfx import CUTE;   FX.update({k: v for k, v in CUTE.items() if k not in FX})
Each entry is name -> (function returning a stereo float array at SR, gain), the same shape as soundtrack.FX.
Preview them all:   python cute_sfx.py   -> work/cute_sfx_preview.wav
"""
from __future__ import annotations

import numpy as np

SR = 48000
_rng = np.random.default_rng(11)


def _t(d):
    return np.arange(int(SR * d)) / SR


def _env(x, a=0.005, r=None):
    n = len(x)
    e = np.ones(n)
    na = max(1, int(a * SR))
    e[:na] = np.linspace(0, 1, na)
    if r:
        e *= np.exp(-np.arange(n) / SR / r)
    nf = min(n, int(0.01 * SR))
    e[-nf:] *= np.linspace(1, 0, nf)
    return x * e


def _sweep(f0, f1, d):
    tt = _t(d)
    return np.sin(2 * np.pi * np.cumsum(f0 * (f1 / f0) ** (tt / d)) / SR)


def _lp(x, a):
    """one-pole low-pass, vectorised enough for short clips"""
    from scipy.signal import lfilter
    return lfilter([a], [1, a - 1], x)


def _st(x, peak=0.8):
    x = x / (np.abs(x).max() + 1e-9) * peak
    return np.stack([x, x], 1)


def boing2():
    tt = _t(0.55)
    f = (180 + 260 * np.exp(-tt * 9)) * (1 + 0.06 * np.sin(2 * np.pi * 28 * tt))
    return _st(_env(np.sin(2 * np.pi * np.cumsum(f) / SR), r=0.22))


def bell():
    tt = _t(1.2)
    x = sum(a * np.sin(2 * np.pi * 1318 * m * tt) * np.exp(-tt * d) for m, a, d in [(1, 1, 3.5), (2.76, .4, 6), (5.4, .2, 9), (.5, .25, 4)])
    return _st(_env(x), 0.7)


def sparkle():
    x = np.zeros(int(SR * 0.9))
    for i in range(9):
        s = int(SR * (0.02 + i * 0.075 + _rng.uniform(0, 0.02)))
        seg = np.sin(2 * np.pi * _rng.uniform(2200, 4200) * _t(.25)) * np.exp(-_t(.25) * 16) * (1 - i / 12)
        x[s:s + len(seg)] += seg[:len(x) - s]
    return _st(_env(x), 0.6)


def blip():
    return _st(_env(_sweep(700, 1500, 0.09), r=0.06))


def swish():
    n = _rng.normal(size=int(SR * .45))
    n = _lp(n, .35) - _lp(n, .05)
    return _st(n * np.sin(np.pi * _t(.45) / .45) ** 2, 0.6)


def bubble():
    return _st(_env(_sweep(1300, 380, 0.07), r=0.03))


def beepboop():
    a = _env(np.sign(np.sin(2 * np.pi * 880 * _t(.09))) * .5, r=.2)
    b = _env(np.sign(np.sin(2 * np.pi * 587 * _t(.12))) * .5, r=.2)
    return _st(_lp(np.concatenate([a, np.zeros(int(SR * .03)), b]), .3), 0.55)


def thud():
    tt = _t(.25)
    return _st(_env(np.sin(2 * np.pi * np.cumsum(120 * np.exp(-tt * 8) + 50) / SR), r=.07))


def whoop():
    return _st(_env(_sweep(300, 1200, .35) * np.sin(np.pi * _t(.35) / .35)), 0.6)


def uhoh():
    a = _env(np.sin(2 * np.pi * 660 * _t(.16)) + .3 * np.sin(2 * np.pi * 1320 * _t(.16)), r=.2)
    b = _env(_sweep(495, 440, .32) + .3 * _sweep(990, 880, .32), r=.3)
    return _st(np.concatenate([a, np.zeros(int(SR * .05)), b]), 0.6)


def scribble():
    n = _rng.normal(size=int(SR * .6))
    n = n - _lp(n, .4)
    g = (np.sin(2 * np.pi * 11 * _t(.6)) > -.2).astype(float)
    return _st(_lp(g, .01) * n * np.sin(np.pi * _t(.6) / .6), 0.45)


def tada():
    notes = [_env(np.sin(2 * np.pi * f * _t(.11)) + .3 * np.sin(4 * np.pi * f * _t(.11)), r=.15) for f in (523, 659, 784)]
    notes.append(_env(np.sin(2 * np.pi * 1046 * _t(.6)) + .3 * np.sin(2 * np.pi * 2093 * _t(.6)), r=.3))
    return _st(np.concatenate(notes), 0.6)


def snore():
    tt = _t(.8)
    return _st(_env(np.sin(2 * np.pi * np.cumsum(140 + 25 * np.sin(2 * np.pi * 3 * tt)) / SR) * np.sin(np.pi * tt / .8), a=.05), 0.4)


# name -> (generator, gain). Gains sit a little under soundtrack.py's own SFX: cute sounds are seasoning.
CUTE = dict(boing2=(boing2, .4), bell=(bell, .3), sparkle=(sparkle, .3), blip=(blip, .3), swish=(swish, .3),
            bubble=(bubble, .35), beepboop=(beepboop, .3), thud=(thud, .45), whoop=(whoop, .25), uhoh=(uhoh, .35),
            scribble=(scribble, .3), tada=(tada, .35), snore=(snore, .35))

if __name__ == "__main__":
    from pathlib import Path
    import soundfile as sf
    out = []
    for name, (f, g) in CUTE.items():
        out += [f() * g, np.zeros((int(SR * .35), 2))]
        print(name)
    p = Path("work")
    p.mkdir(exist_ok=True)
    sf.write(p / "cute_sfx_preview.wav", np.concatenate(out).astype(np.float32), SR)
    print("wrote", p / "cute_sfx_preview.wav")
