"""Soundtrack: placed narration (EQ + compression), original synthesized music bed with
voice ducking, UI/transition SFX, then two-pass EBU R128 normalisation via ffmpeg loudnorm.

Outputs work/narration.wav, work/music.wav, work/sfx.wav, work/mix_raw.wav, work/mix.wav
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, fftconvolve, lfilter, resample_poly, sosfilt

from master import block_loudness, integrated, master
WORDS = Timeline = None

SR = 48000
MUSIC_GAP_LU = 8.0     # integrated bed level below the voice before ducking
DUCK_DB = 6.0          # extra attenuation while the narrator is talking
HERE = Path(__file__).resolve().parent
WORK = HERE / "work"
TTS = HERE / "tts"
rng = np.random.default_rng(20260913)


# ------------------------------------------------------------------ DSP utils
def biquad_peak(f0, gain_db, q):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    alpha = np.sin(w) / (2 * q)
    b = [1 + alpha * A, -2 * np.cos(w), 1 - alpha * A]
    a = [1 + alpha / A, -2 * np.cos(w), 1 - alpha / A]
    return np.array(b) / a[0], np.array(a) / a[0]


def peq(x, f0, g, q=1.0):
    b, a = biquad_peak(f0, g, q)
    return lfilter(b, a, x, axis=0)


def hpf(x, fc, order=2):
    return sosfilt(butter(order, fc, "highpass", fs=SR, output="sos"), x, axis=0)


def lpf(x, fc, order=2):
    return sosfilt(butter(order, fc, "lowpass", fs=SR, output="sos"), x, axis=0)


def bpf(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, hi], "bandpass", fs=SR, output="sos"), x, axis=0)


def env_follow(x, attack, release, block=240):
    """RMS envelope at block resolution with asymmetric smoothing, upsampled to sample rate."""
    n = len(x) // block
    mono = x[: n * block] if x.ndim == 1 else x[: n * block].mean(axis=1)
    rms = np.sqrt((mono.reshape(n, block) ** 2).mean(axis=1) + 1e-12)
    out = np.empty_like(rms)
    ga = np.exp(-block / (SR * attack))
    gr = np.exp(-block / (SR * release))
    s = 0.0
    for i, v in enumerate(rms):
        g = ga if v > s else gr
        s = g * s + (1 - g) * v
        out[i] = s
    full = np.interp(np.arange(len(x)), np.arange(n) * block + block / 2, out)
    return full


def compress(x, thresh_db=-20.0, ratio=3.0, attack=0.005, release=0.12, makeup_db=3.0):
    env = env_follow(x, attack, release, block=48)
    lvl = 20 * np.log10(env + 1e-9)
    over = np.maximum(0.0, lvl - thresh_db)
    gain_db = -over * (1 - 1 / ratio) + makeup_db
    g = 10 ** (gain_db / 20)
    return x * (g if x.ndim == 1 else g[:, None])


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def place(buf, clip, t, gain=1.0):
    i = int(round(t * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(clip))
    buf[i:j] += clip[: j - i] * gain


# ----------------------------------------------------------------- narration
def build_narration(tl: Timeline, n):
    voice = np.zeros(n, np.float64)
    for start, cue, _dur in tl.narration_events():
        x, sr = sf.read(TTS / f"{cue}.wav", dtype="float64")
        if x.ndim > 1:
            x = x.mean(axis=1)
        x = resample_poly(x, SR, sr)
        fade = int(0.012 * SR)
        x[:fade] *= np.linspace(0, 1, fade)
        x[-fade:] *= np.linspace(1, 0, fade)
        place(voice, x, start)
    voice = hpf(voice, 75, 2)
    voice = peq(voice, 160, 1.2, 0.9)     # a little chest
    voice = peq(voice, 320, -1.5, 1.1)    # clear the boxiness
    voice = peq(voice, 3300, 2.2, 1.0)    # presence / intelligibility
    voice = peq(voice, 9000, 1.0, 0.8)    # air
    voice = compress(voice, -22, 2.6, 0.004, 0.14, 2.5)
    return voice


# --------------------------------------------------------------------- music
BPM = 100.0
BEAT = 60.0 / BPM
BAR = 4 * BEAT
# D major: I - V - vi - IV, voice-led pad chords and roots
CHORDS = [
    dict(pad=[50, 57, 62, 66], root=38, arp=[62, 66, 69, 74, 69, 66, 62, 57]),   # D
    dict(pad=[49, 57, 61, 64], root=45, arp=[61, 64, 69, 73, 69, 64, 61, 57]),   # A/C#
    dict(pad=[47, 54, 59, 62], root=47, arp=[59, 62, 66, 71, 66, 62, 59, 54]),   # Bm
    dict(pad=[43, 55, 59, 62], root=43, arp=[59, 62, 67, 71, 67, 62, 59, 55]),   # G
]


def saw(freq, t, phase=0.0):
    return 2.0 * ((freq * t + phase) % 1.0) - 1.0


def pad_note(m, dur, rel=1.2):
    t = np.arange(int((dur + rel) * SR)) / SR
    f = midi_hz(m)
    sig = np.zeros((len(t), 2))
    for k, (det, pan) in enumerate(((-0.09, 0.2), (0.0, 0.5), (0.1, 0.8))):
        ff = f * 2 ** (det / 12)
        v = 0.55 * saw(ff, t, rng.random()) + 0.45 * np.sin(2 * np.pi * ff * t + rng.random() * 6.28)
        sig[:, 0] += v * (1 - pan)
        sig[:, 1] += v * pan
    atk = np.clip(t / 0.45, 0, 1) ** 1.5
    rel_env = np.clip((dur + rel - t) / rel, 0, 1) ** 2
    return sig * (atk * rel_env)[:, None]


def pluck(m, dur=0.5, bright=1.0):
    t = np.arange(int(dur * SR)) / SR
    f = midi_hz(m)
    e = np.exp(-t / 0.16) * np.clip(t / 0.003, 0, 1)
    v = np.sin(2 * np.pi * f * t) + 0.28 * bright * np.sin(4 * np.pi * f * t) * np.exp(-t / 0.05)
    return v * e


def bass_note(m, dur):
    t = np.arange(int(dur * SR)) / SR
    f = midi_hz(m)
    e = np.clip(t / 0.01, 0, 1) * np.exp(-t / 0.55)
    v = np.tanh(1.6 * (np.sin(2 * np.pi * f * t) + 0.25 * np.sin(4 * np.pi * f * t)))
    return v * e


def kick():
    t = np.arange(int(0.35 * SR)) / SR
    f = 44 + 90 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    return np.sin(ph) * np.exp(-t / 0.13) * np.clip(t / 0.002, 0, 1)


def hat():
    t = np.arange(int(0.08 * SR)) / SR
    v = hpf(rng.standard_normal(len(t)), 7000, 2)
    return v * np.exp(-t / 0.018) * 0.5


def snap():
    t = np.arange(int(0.25 * SR)) / SR
    v = bpf(rng.standard_normal(len(t)), 900, 4200, 2)
    return v * np.exp(-t / 0.07) * 0.6


def reverb_ir(rt60=2.0, length=2.4):
    t = np.arange(int(length * SR)) / SR
    decay = np.exp(-6.91 * t / rt60)
    ir = rng.standard_normal((len(t), 2)) * decay[:, None]
    ir = lpf(ir, 5200, 1)
    ir[: int(0.012 * SR)] = 0
    return ir / np.sqrt((ir ** 2).sum(axis=0))


def build_music(tl: Timeline, n):
    seg = {s["id"]: s for s in tl.segments}
    t_hit = tl.cue_start["title"] - 0.12                 # downbeat lands just before "Meet"
    t_lift = seg["features"]["start"] + seg["features"]["xfade_in"]
    t_final = tl.word_time("close_2", "Bar", 2) - 0.05   # resolving chord under the product name
    t_end = tl.total

    pads = np.zeros((n, 2))
    plucks = np.zeros((n, 2))
    bass = np.zeros(n)
    drums = np.zeros((n, 2))
    kick_env = np.zeros(n)

    # --- intro: sustained, filtered pad on Bm -> G -> A (unresolved, curious)
    intro_chords = [2, 3, 1]
    intro_len = t_hit
    seg_len = intro_len / len(intro_chords)
    for k, ci in enumerate(intro_chords):
        for m in CHORDS[ci]["pad"]:
            place(pads, pad_note(m, seg_len + 0.2, 1.4), k * seg_len, 0.05)
    # soft ticking pulse in the intro: muted plucks on the root every half bar
    t = 0.8
    while t < t_hit - 0.2:
        ci = intro_chords[min(len(intro_chords) - 1, int(t / seg_len))]
        place(plucks, np.stack([pluck(CHORDS[ci]["pad"][2] + 12, 0.35, 0.3)] * 2, 1), t, 0.05)
        t += BAR / 2

    # --- groove from the title hit to the end
    bar_idx = 0
    t = t_hit
    while t < t_end:
        chord = CHORDS[bar_idx % 4]
        final = t >= t_final - 1e-6
        lift = t >= t_lift - BAR / 2
        if final:
            for m in CHORDS[0]["pad"] + [74, 78]:
                place(pads, pad_note(m, max(0.5, t_end - t - 0.4), 2.5), t, 0.06)
            place(bass, bass_note(CHORDS[0]["root"], 3.0), t, 0.5)
            place(drums, np.stack([kick()] * 2, 1), t, 0.55)
            break
        for m in chord["pad"]:
            place(pads, pad_note(m, BAR, 0.9), t, 0.045)
        # arpeggio: 8 eighth-notes per bar, lighter under the demo
        arp_gain = 0.085 if lift else 0.065
        for k, m in enumerate(chord["arp"]):
            tt = t + k * BEAT / 2
            if tt >= t_final:
                break
            p = pluck(m + (12 if lift and k % 2 else 0), 0.6, 1.0)
            pan = 0.35 + 0.3 * ((k * 3) % 4) / 3
            place(plucks, np.stack([p * (1 - pan), p * pan], 1) * 1.4, tt, arp_gain)
        # bass: beat 1 and the "and" of 2
        place(bass, bass_note(chord["root"], BEAT * 1.4), t, 0.36)
        place(bass, bass_note(chord["root"], BEAT * 0.9), t + 1.5 * BEAT, 0.26)
        # drums
        for b in range(4):
            tb = t + b * BEAT
            if b in (0, 2):
                place(drums, np.stack([kick()] * 2, 1), tb, 0.42 if lift else 0.34)
                place(kick_env, np.exp(-np.arange(int(0.3 * SR)) / SR / 0.12), tb, 1.0)
            if lift and b in (1, 3):
                place(drums, np.stack([snap() * 0.9, snap()], 1), tb, 0.16)
            place(drums, np.stack([hat() * 0.7, hat()], 1), tb + BEAT / 2, 0.09 if lift else 0.06)
        t += BAR
        bar_idx += 1

    # riser into the title hit + the hit itself
    r_len = 2.6
    tr = np.arange(int(r_len * SR)) / SR
    noise = rng.standard_normal((len(tr), 2))
    riser = np.zeros_like(noise)
    blocks = 40
    for b in range(blocks):
        a, z = b * len(tr) // blocks, (b + 1) * len(tr) // blocks
        fc = 400 * (12 ** (b / blocks))
        riser[a:z] = bpf(noise[a:z], fc * 0.7, min(fc * 1.4, 20000), 1)
    riser *= ((tr / r_len) ** 2.2)[:, None]
    place(drums, riser, t_hit - r_len, 0.22)
    th = np.arange(int(2.2 * SR)) / SR
    boom = np.sin(2 * np.pi * np.cumsum(38 + 60 * np.exp(-th / 0.08)) / SR) * np.exp(-th / 0.5)
    crash = lpf(rng.standard_normal((len(th), 2)), 6000, 1) * np.exp(-th / 0.7)[:, None]
    place(drums, np.stack([boom] * 2, 1), t_hit, 0.7)
    place(drums, crash, t_hit, 0.07)

    # sidechain pump on pads from the kick
    pump = 1 - 0.35 * np.clip(kick_env, 0, 1)
    pads *= pump[:, None]

    # space
    ir = reverb_ir(2.2)
    wet_in = lpf(pads * 0.6 + plucks, 7000, 1)
    wet = np.stack([fftconvolve(wet_in[:, c], ir[:, c], mode="full")[:n] for c in range(2)], 1)
    # stereo delay on plucks (dotted eighth)
    d = int(0.75 * BEAT * SR)
    echo = np.zeros_like(plucks)
    echo[d:, 0] += plucks[:-d, 1] * 0.28
    echo[d:, 1] += plucks[:-d, 0] * 0.28
    music = lpf(pads, 2600, 2) + plucks + echo + wet * 0.35 + drums + np.stack([lpf(bass, 900, 2)] * 2, 1)
    music = hpf(music, 30, 2)
    return music


# ----------------------------------------------------------------------- SFX
def whoosh(dur=0.7):
    t = np.arange(int(dur * SR)) / SR
    noise = rng.standard_normal((len(t), 2))
    out = np.zeros_like(noise)
    blocks = 28
    for b in range(blocks):
        a, z = b * len(t) // blocks, (b + 1) * len(t) // blocks
        u = b / (blocks - 1)
        fc = 500 + 4500 * np.sin(np.pi * u) ** 1.5
        out[a:z] = bpf(noise[a:z], fc * 0.6, fc * 1.5, 1)
    shape = np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 2
    pan = np.linspace(0.25, 0.75, len(t))
    out[:, 0] *= shape * (1 - pan)
    out[:, 1] *= shape * pan
    return out


def ui_click():
    t = np.arange(int(0.05 * SR)) / SR
    tick = hpf(rng.standard_normal(len(t)), 2500, 2) * np.exp(-t / 0.004)
    body = np.sin(2 * np.pi * 1850 * t) * np.exp(-t / 0.012) * 0.5
    v = tick * 0.6 + body
    return np.stack([v, v], 1)


def blip(m, dur=0.5):
    p = pluck(m, dur, 0.6)
    return np.stack([p, p], 1)


def chime():
    t = np.arange(int(1.6 * SR)) / SR
    v = np.zeros_like(t)
    for m, delay, g in ((81, 0.0, 1.0), (86, 0.09, 0.8), (90, 0.18, 0.7)):
        tt = np.clip(t - delay, 0, None)
        f = midi_hz(m)
        v += g * (np.sin(2 * np.pi * f * tt) + 0.2 * np.sin(2 * np.pi * 2.01 * f * tt)) \
            * np.exp(-tt / 0.45) * (t >= delay)
    return np.stack([v * 0.9, v], 1)


def build_sfx(tl: Timeline, n):
    sfx = np.zeros((n, 2))
    for s in tl.segments[1:]:
        if s.get("whoosh"):
            place(sfx, whoosh(0.75), s["start"] - 0.2, 0.05)
    for s in tl.segments:
        if s["kind"] != "demo":
            continue
        for clip in s["clips"]:
            for tc, _x, _y in clip.get("clicks_abs", []):
                place(sfx, ui_click(), tc, 0.16)
    # proof-complete chime right after the check is spoken
    t_ch = tl.cue_start["s6_post"] + WORDS["s6_post"]["duration"] + 0.08
    place(sfx, chime(), t_ch, 0.07)
    # soft in-key blips as list items land on the cards
    notes = [74, 78, 81, 86]
    item_words = {
        "pos_2": ["reads", "builds", "explains"],
        "features": ["tutor", "working", "mark", "three"],
        "close_1": ["solver", "Bars", "Working", "clear"],
    }
    for cue, words in item_words.items():
        for k, w in enumerate(words):
            place(sfx, blip(notes[k % len(notes)], 0.45), tl.word_time(cue, w) - 0.08, 0.05)
    return sfx


# ---------------------------------------------------------------------- mix
def loudnorm(src: Path, dst: Path, I=-16.0, TP=-1.5, LRA=11.0):
    first = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(src), "-af",
         f"loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True)
    js = json.loads(re.findall(r"\{[^{}]*\}", first.stderr, re.S)[-1])
    af = (f"loudnorm=I={I}:TP={TP}:LRA={LRA}:measured_I={js['input_i']}:measured_TP={js['input_tp']}:"
          f"measured_LRA={js['input_lra']}:measured_thresh={js['input_thresh']}:offset={js['target_offset']}:"
          f"linear=true:print_format=json")
    second = subprocess.run(["ffmpeg", "-y", "-hide_banner", "-nostats", "-i", str(src), "-af", af,
                             "-ar", str(SR), "-c:a", "pcm_s24le", str(dst)], capture_output=True, text=True)
    js2 = json.loads(re.findall(r"\{[^{}]*\}", second.stderr, re.S)[-1])
    return js, js2


def main():
    tl = Timeline()
    n = int((tl.total + 0.05) * SR)
    voice = build_narration(tl, n)
    music = build_music(tl, n)
    sfx = build_sfx(tl, n)

    # levels, set by loudness rather than RMS: bed ~9 LU under the voice in gaps, ~14 LU under speech
    active = np.abs(voice) > 1e-3
    v_rms = np.sqrt((voice[active] ** 2).mean())
    voice_I = integrated(np.stack([voice, voice], 1))
    music *= 10 ** ((voice_I - MUSIC_GAP_LU - integrated(music)) / 20)
    env = env_follow(voice, 0.05, 0.5)
    talk = np.clip((20 * np.log10(env + 1e-9) - 20 * np.log10(v_rms) + 26) / 10, 0, 1)
    duck = 10 ** (-DUCK_DB * talk / 20)
    music *= duck[:, None]
    # tail: bring the bed up after the last line, then fade everything out
    t_last = max(s + d for s, _, d in tl.narration_events())
    tt = np.arange(n) / SR
    fade = np.clip((tl.total - tt) / 2.8, 0, 1) ** 1.5
    fade_in = np.clip(tt / 0.25, 0, 1)

    sfx_gain = v_rms / max(1e-9, np.sqrt((sfx[np.abs(sfx).sum(1) > 1e-4] ** 2).mean()))
    mix = np.stack([voice, voice], 1) + music + sfx * min(1.0, sfx_gain * 0.55)
    mix *= (fade * fade_in)[:, None]
    peak = np.abs(mix).max()
    if peak > 0.98:
        mix *= 0.98 / peak

    sf.write(WORK / "narration.wav", voice.astype(np.float32), SR, subtype="FLOAT")
    sf.write(WORK / "music.wav", music.astype(np.float32), SR, subtype="FLOAT")
    sf.write(WORK / "sfx.wav", sfx.astype(np.float32), SR, subtype="FLOAT")
    sf.write(WORK / "mix_raw.wav", mix.astype(np.float32), SR, subtype="FLOAT")

    # balance report: momentary loudness of the bed relative to the voice
    zv, _ = block_loudness(np.stack([voice, voice], 1))
    zm, _ = block_loudness(music)
    lv = -0.691 + 10 * np.log10(zv + 1e-20)
    lm = -0.691 + 10 * np.log10(zm + 1e-20)
    talking = lv > voice_I - 20
    print(f"voice I {voice_I:.1f} | bed under speech {np.median(lm[talking]) - voice_I:+.1f} LU | "
          f"bed in gaps {np.median(lm[~talking]) - voice_I:+.1f} LU")

    mastered, report = master(mix, -16.0, -1.5)
    sf.write(WORK / "mix.wav", mastered.astype(np.float32), SR, subtype="FLOAT")
    for r in report:
        print("master:", r)
    print(f"last narration ends {t_last:.2f}s, total {tl.total:.2f}s")


if __name__ == "__main__":
    main()
