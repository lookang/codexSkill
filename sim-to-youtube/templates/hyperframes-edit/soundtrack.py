"""Soundtrack for the Stacking Ring Magnets short: narration + synth bed + synced SFX -> work/mix.wav."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import fftconvolve, resample_poly

import audio as A
from audio import ui_click, SR, place, hpf, lpf, bpf, peq, compress, pluck, bass_note, kick, snap, pad_note, reverb_ir, \
    whoosh, chime, env_follow, midi_hz
from master import integrated, master

HERE = Path(__file__).resolve().parent
WORK = HERE / "work"
PLAN = json.loads((WORK / "plan.json").read_text())
TOTAL = PLAN["total"]
N = int((TOTAL + 0.05) * SR)
rng = np.random.default_rng(7)

BPM = 104.0
BEAT = 60 / BPM
BAR = 4 * BEAT
# E minor drive: Em - C - G - D
CH = [dict(pad=[52, 59, 64, 67], root=40, arp=[64, 67, 71, 76, 71, 67, 64, 59]),
      dict(pad=[48, 55, 60, 64], root=36, arp=[60, 64, 67, 72, 67, 64, 60, 55]),
      dict(pad=[55, 59, 62, 67], root=43, arp=[62, 67, 71, 74, 71, 67, 62, 59]),
      dict(pad=[50, 57, 62, 66], root=38, arp=[62, 66, 69, 74, 69, 66, 62, 57])]


def st(x):
    return np.stack([x, x], 1)


def scene(i):
    return next(s for s in PLAN["scenes"] if s["id"] == i)


def narration():
    v = np.zeros(N)
    for t, cue, _ in PLAN["vo"]:
        x, sr = sf.read(HERE / "tts" / f"{cue}.wav", dtype="float64")
        x = resample_poly(x if x.ndim == 1 else x.mean(1), SR, sr)
        f = int(0.01 * SR)
        x[:f] *= np.linspace(0, 1, f)
        x[-f:] *= np.linspace(1, 0, f)
        place(v, x, t)
    v = hpf(v, 80)
    v = peq(v, 150, 1.5, 0.9)
    v = peq(v, 320, -2, 1.1)
    v = peq(v, 3200, 3, 1.0)
    v = peq(v, 9000, 1.5, .8)
    return compress(v, -22, 3.0, 0.003, 0.12, 3.0)


def music():
    pads, pl, bass, dr = np.zeros((N, 2)), np.zeros((N, 2)), np.zeros(N), np.zeros((N, 2))
    kenv = np.zeros(N)
    drop = scene("title")["start"] + 0.3                         # the beat drops on the title hit
    calm = (scene("teach")["start"], scene("cta")["start"])       # breakdown under the teacher tip
    end_t = TOTAL - 2.4
    for m in CH[0]["pad"]:                                       # intro tension: pad + ticking plucks
        place(pads, pad_note(m, drop + 0.3, 1.0), 0.0, 0.05)
    t = 0.0
    while t < drop - 0.1:
        place(pl, st(pluck(76, 0.2, 0.4)), t, 0.05)
        t += BEAT / 2
    t, b = drop, 0
    while t < end_t:
        c = CH[b % 4]
        quiet = calm[0] - 0.2 <= t < calm[1] - BAR / 2
        for m in c["pad"]:
            place(pads, pad_note(m, BAR, 0.8), t, 0.06 if quiet else 0.05)
        for k, m in enumerate(c["arp"] * 2):
            tt = t + k * BEAT / 4
            p = pluck(m + (12 if k % 4 == 3 else 0), 0.35, 1.0)
            pan = 0.3 + 0.4 * ((k * 5) % 7) / 6
            place(pl, np.stack([p * (1 - pan), p * pan], 1), tt, 0.05 if quiet else 0.06)
        if not quiet:
            for k in range(8):
                place(bass, bass_note(c["root"] + (12 if k % 4 == 3 else 0), BEAT * 0.45), t + k * BEAT / 2, 0.3)
            for q in range(4):
                tb = t + q * BEAT
                place(dr, st(kick()), tb, 0.4)
                place(kenv, np.exp(-np.arange(int(0.25 * SR)) / SR / 0.1), tb, 1)
                if q in (1, 3):
                    place(dr, np.stack([snap(), snap() * 0.9], 1), tb, 0.2)
                place(dr, np.stack([A.hat() * .7, A.hat()], 1), tb + BEAT / 2, 0.08)
                place(dr, np.stack([A.hat(), A.hat() * .7], 1), tb + BEAT * 0.75, 0.04)
        t += BAR
        b += 1
    for m in CH[0]["pad"] + [71, 76]:                           # final chord
        place(pads, pad_note(m, max(0.5, TOTAL - t - 0.3), 2.0), t, 0.06)
    place(dr, st(kick()), t, 0.5)
    place(bass, bass_note(40, 2.5), t, 0.4)
    rl = 2.2                                                     # riser into the drop
    tr = np.arange(int(rl * SR)) / SR
    noise = rng.standard_normal((len(tr), 2))
    rs = np.zeros_like(noise)
    for k in range(40):
        a, z = k * len(tr) // 40, (k + 1) * len(tr) // 40
        fc = 400 * 12 ** (k / 40)
        rs[a:z] = bpf(noise[a:z], fc * .7, min(fc * 1.4, 20000), 1)
    place(dr, rs * ((tr / rl) ** 2.2)[:, None], drop - rl, 0.25)
    pads *= (1 - 0.4 * np.clip(kenv, 0, 1))[:, None]
    ir = reverb_ir(1.8)
    wet_in = lpf(pads * .5 + pl, 7000, 1)
    wet = np.stack([fftconvolve(wet_in[:, c], ir[:, c])[:N] for c in range(2)], 1)
    return hpf(lpf(pads, 3000) + pl + wet * .3 + dr + st(lpf(bass, 800)), 30)


# --------------------------------------------------------------------------- sfx
def boom():
    t = np.arange(int(1.4 * SR)) / SR
    b = np.sin(2 * np.pi * np.cumsum(40 + 90 * np.exp(-t / .06)) / SR) * np.exp(-t / .35)
    n = lpf(rng.standard_normal(len(t)), 3000) * np.exp(-t / .08) * .5
    return st(b + n)


def hit():
    t = np.arange(int(0.9 * SR)) / SR
    b = np.sin(2 * np.pi * np.cumsum(55 + 120 * np.exp(-t / .03)) / SR) * np.exp(-t / .2)
    c = hpf(rng.standard_normal(len(t)), 3000) * np.exp(-t / .15) * .35
    return st(b + c)


def pop():
    t = np.arange(int(0.12 * SR)) / SR
    return st(np.sin(2 * np.pi * np.cumsum(900 - 500 * t / .12) / SR) * np.exp(-t / .03))


def zap():
    t = np.arange(int(0.5 * SR)) / SR
    f = 1800 * np.exp(-t / .15) + 200
    return st(lpf(np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)), 5000) * np.exp(-t / .12) * .4)


def tick():
    t = np.arange(int(0.08 * SR)) / SR
    return st(np.sin(2 * np.pi * 2400 * t) * np.exp(-t / .012))


def boing():
    t = np.arange(int(0.8 * SR)) / SR
    f = 220 + 160 * np.sin(2 * np.pi * 9 * t) * np.exp(-t / .3)
    return st(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .3))


def snapfx():
    t = np.arange(int(0.4 * SR)) / SR
    c = bpf(rng.standard_normal(len(t)), 1500, 6000) * np.exp(-t / .02)
    b = np.sin(2 * np.pi * np.cumsum(90 + 200 * np.exp(-t / .02)) / SR) * np.exp(-t / .12)
    return st(c * 1.2 + b)


def buzz():
    t = np.arange(int(0.45 * SR)) / SR
    v = np.sign(np.sin(2 * np.pi * 110 * t)) * .5 + np.sign(np.sin(2 * np.pi * 116 * t)) * .5
    return st(lpf(v, 1800) * np.clip((0.45 - t) / .05, 0, 1) * .5)


def shimmer():
    t = np.arange(int(1.5 * SR)) / SR
    v = sum(np.sin(2 * np.pi * midi_hz(m) * t) * np.exp(-np.clip(t - d, 0, None) / .4) * (t >= d)
            for m, d in ((88, 0), (91, .06), (95, .12), (100, .18)))
    return st(v * .5)


FX = dict(boom=(boom, .9), hit=(hit, .8), pop=(pop, .45), zap=(zap, .35), tick=(tick, .4), boing=(boing, .5),
          snapfx=(snapfx, .8), buzz=(buzz, .5), shimmer=(shimmer, .3), flip=(lambda: whoosh(0.35) * 1.5, .25),
          ding=(chime, .4), whoosh=(lambda: whoosh(0.6), .35), click=(ui_click, .5))


def sfx():
    out = np.zeros((N, 2))
    for t, name in PLAN["sfx"]:
        f, g = FX[name]
        lead = 0.25 if name == "whoosh" else 0.0
        place(out, f(), max(0, t - lead), g)
    return out


def main():
    v, m, fx = narration(), music(), sfx()
    vI = integrated(st(v))
    m *= 10 ** ((vI - 13 - integrated(m)) / 20)
    env = env_follow(v, 0.04, 0.4)
    rms = np.sqrt((v[np.abs(v) > 1e-3] ** 2).mean())
    talk = np.clip((20 * np.log10(env + 1e-9) - 20 * np.log10(rms) + 26) / 10, 0, 1)
    m *= (10 ** (-7 * talk / 20))[:, None]
    fx *= rms / np.sqrt((fx[np.abs(fx).sum(1) > 1e-4] ** 2).mean()) * 0.6
    tt = np.arange(N) / SR
    mix = st(v) + m + fx
    mix *= (np.clip((TOTAL - tt) / 1.2, 0, 1) ** 1.5 * np.clip(tt / 0.05, 0, 1))[:, None]
    mix /= max(1.0, np.abs(mix).max() / 0.98)
    out, rep = master(mix, -16.0, -1.5)
    sf.write(WORK / "mix.wav", out.astype(np.float32), SR, subtype="FLOAT")
    for r in rep:
        print("master:", r)


if __name__ == "__main__":
    main()
