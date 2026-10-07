# TEMPLATE - edit SRC/OUT and the hard-coded source times and crops for your footage.
# Measure crops with scripts/frame_ruler.py. Never commit footage, name lists or OCR output.
"""Backup name finder: template-match known name crops (mixed-case lines, dimmed rows) at 5 fps -> work/names_tpl.json"""
import json
import subprocess

import cv2
import numpy as np

SRC = "../screen_XXXX.mp4"
W, H, FPS = 1900, 966, 5


def grab(t):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", SRC, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "gray", "-"],
                         capture_output=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(H, W)


TPL = []
for t, (x, y, w, h) in [(90, (488, 737, 172, 20)),      # Q2 "NAME submitted on ..."
                        (41.5, (145, 759, 178, 20)),     # dimmed row behind the Data Assistant modal
                        (67.5, (519, 905, 142, 20))]:    # response-table row
    f = grab(t)
    TPL.append((f[y:y + h, x:x + w].copy(), w, h))

p = subprocess.Popen(["ffmpeg", "-v", "error", "-i", SRC, "-vf", f"fps={FPS}", "-f", "rawvideo", "-pix_fmt", "gray", "-"], stdout=subprocess.PIPE)
hits, k = [], 0
while True:
    b = p.stdout.read(W * H)
    if len(b) < W * H:
        break
    fr = np.frombuffer(b, np.uint8).reshape(H, W)
    for tpl, w, h in TPL:
        r = cv2.matchTemplate(fr, tpl, cv2.TM_CCOEFF_NORMED)
        ys, xs = np.where(r >= 0.78)
        for x, y in {(int(x) // 8 * 8, int(y) // 8 * 8) for x, y in zip(xs, ys)}:
            hits.append(dict(t=k / FPS, x=x, y=y, w=w, h=h, text="TPL"))
    k += 1
json.dump(hits, open("work/names_tpl.json", "w"))
print("tpl hits", len(hits), "frames", k)
