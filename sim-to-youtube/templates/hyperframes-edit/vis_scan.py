"""Find, in SOURCE seconds, when each highlight target is on screen -> work/hl_vis.json {id: [start, end]}.

Scans ±40 s around each box's reference frame (sync_check.REF) at 10 fps and keeps the contiguous run of
frames whose box region matches the reference (edge correlation >= TH, gaps of <= 0.2 s bridged)."""
import json
import subprocess

import numpy as np

from sync_check import REF, TH, PAD, SRC, ref_crop, ncc

FPS = 10
out = {}
for hl in json.load(open("work/hl_list.json")):
    key = hl["id"][3:]
    r = REF.get(key)
    if r is None:
        continue
    x, y, w, h = hl["box"]
    W, H = w + 2 * PAD, h + 2 * PAD
    a = max(0, r - 40)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{a}", "-t", "80", "-i", SRC, "-vf",
                          f"fps={FPS},crop={W}:{H}:{x - PAD}:{y - PAD},format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    n = len(raw) // (W * H)
    fr = np.frombuffer(raw[:n * W * H], np.uint8).reshape(n, H, W)
    ref = ref_crop(r, hl["box"])
    v = np.array([ncc(ref, f) for f in fr]) >= TH
    i = int(round((r - a) * FPS))
    if not v[max(0, i - 15):i + 16].any():
        out[hl["id"]] = None
        print(f'{hl["id"]:12s} no match near ref {r}')
        continue
    i = max(range(max(0, i - 15), min(n, i + 16)), key=lambda k: (v[k], -abs(k - i)))
    s = e = i
    while s > 0 and (v[s - 1] or (s > 2 and v[s - 2]) or (s > 3 and v[s - 3])):
        s -= 1
    while e < n - 1 and (v[e + 1] or (e < n - 2 and v[e + 2]) or (e < n - 3 and v[e + 3])):
        e += 1
    out[hl["id"]] = [round(a + s / FPS, 2), round(a + e / FPS, 2)]
    print(f'{hl["id"]:12s} ref {r:7.1f}  visible {a + s / FPS:7.1f} - {a + e / FPS:7.1f}  ({(e - s) / FPS:.1f}s) {hl["label"]}')
json.dump(out, open("work/hl_vis.json", "w"), indent=1)
