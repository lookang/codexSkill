"""Check every highlight box against the footage and write work/hl_sync.json.

For each box (work/hl_list.json from build.py), take the box region from a REFERENCE source frame
(the frame its coordinates were measured on), then decode the source span the box is shown over.
The box is kept only while the region still matches the reference (edge-map correlation), so it
appears when its target is really there and disappears when the page scrolls or the dialog closes.
"""
import json
import subprocess
import sys

import cv2
import numpy as np

SRC = json.load(open("work/source.json"))["screen"]   # {"screen": "../screen_XXXX.mp4"}
REF = json.load(open("work/refs.json"))
TH = 0.55          # edge correlation needed to call the target "present"
EARLY = 1.5        # a box may start this much later than its word if the target appears late
PAD = 6

cap = cv2.VideoCapture(SRC)


def ref_crop(t, box):
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, f = cap.read()
    x, y, w, h = box
    return cv2.cvtColor(f[y - PAD:y + h + PAD, x - PAD:x + w + PAD], cv2.COLOR_BGR2GRAY)


def edges(g):
    g = cv2.GaussianBlur(g, (3, 3), 0)
    m = cv2.magnitude(cv2.Sobel(g, cv2.CV_32F, 1, 0), cv2.Sobel(g, cv2.CV_32F, 0, 1))
    return m - m.mean()


def ncc(a, b):
    a, b = edges(a), edges(b)
    d = np.sqrt((a * a).sum() * (b * b).sum())
    return float((a * b).sum() / d) if d > 0 else 0.0


def decode(a, b, box):
    x, y, w, h = box
    W, H = w + 2 * PAD, h + 2 * PAD
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a:.3f}", "-t", f"{b - a + 0.1:.3f}", "-i", SRC,
                          "-vf", f"crop={W}:{H}:{x - PAD}:{y - PAD},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    n = len(raw) // (W * H)
    return np.frombuffer(raw[:n * W * H], np.uint8).reshape(n, H, W), a


if __name__ != "__main__":
    pass

def main():
    out, report = {}, []
    for hl in json.load(open("work/hl_list.json")):
        key = hl["id"][3:]
        samples = [(t, s) for t, s in hl["samples"]]
        if not samples:
            continue
        srcs = [s for _, s in samples]
        frames, a0 = decode(min(srcs), max(srcs), hl["box"])
        if REF.get(key) is not None:
            ref = ref_crop(REF[key], hl["box"])
        else:                                     # trust what is on screen at the box's start
            i0 = min(range(len(samples)), key=lambda i: abs(samples[i][0] - hl["t0"]))
            ref = frames[min(len(frames) - 1, int((samples[i0][1] - a0) * 30))]
        vis = []
        for t, s in samples:
            k = min(len(frames) - 1, max(0, int(round((s - a0) * 30))))
            vis.append((t, ncc(ref, frames[k])))
        t0, t1 = hl["t0"], hl["t1"]
        cand = [t for t, v in vis if t0 - 1e-6 <= t <= t0 + EARLY and v >= TH]
        if not cand:
            out[hl["id"]] = None
            report.append(f'{hl["id"]:12s} DROP  (target not on screen; best {max(v for t, v in vis if t >= t0 - 1e-6):.2f}) {hl["label"]}')
            continue
        n0 = cand[0]
        n1 = n0
        miss = 0
        for t, v in vis:
            if t < n0:
                continue
            if t > t1:
                break
            if v >= TH:
                n1, miss = t, 0
            else:
                miss += 1
                if miss >= 3:                    # 0.3 s of mismatch = the target has gone
                    break
        n1 = min(t1, n1 + 0.1)
        if n1 - n0 < 0.8:
            out[hl["id"]] = None
            report.append(f'{hl["id"]:12s} DROP  (visible only {n1 - n0:.1f}s) {hl["label"]}')
            continue
        out[hl["id"]] = [round(n0, 3), round(n1, 3)]
        tag = "ok   " if abs(n0 - t0) < 0.05 and abs(n1 - t1) < 0.05 else "TRIM "
        report.append(f'{hl["id"]:12s} {tag} {t0:7.2f}-{t1:7.2f} -> {n0:7.2f}-{n1:7.2f}  {hl["label"]}')
    json.dump(out, open("work/hl_sync.json", "w"), indent=1)
    print("\n".join(report))


if __name__ == "__main__":
    main()
