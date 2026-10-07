# TEMPLATE - edit SRC/OUT and the hard-coded source times and crops for your footage.
# Measure crops with scripts/frame_ruler.py. Never commit footage, name lists or OCR output.
"""Blur every student name in screen_XXXX.mp4 -> ../hf/assets/screen.mp4

Sources of name boxes:
  1. OCR hits (work/names_*.json, 2 fps): each box padded and extended one text line down (wrapped names),
     shown from 0.6 s before to 0.6 s after the sample.
  2. Data Assistant "Student" column: whenever OCR finds a name in that column, the whole column is blurred.
  3. "You're viewing NAME" banner: template-matched every frame; the name part is blurred.
"""
import glob
import json
import subprocess

import cv2
import numpy as np

SRC = "../screen_XXXX.mp4"
OUT = "../hf/assets/screen.mp4"
W, H, FPS = 1900, 966, 30
UI_WORDS = ("COMPLETION", "STATUS", "ACTIVITY", "INCOMPLETE", "SECTION", "GO TO", "MODULE")

hits = []
for f in glob.glob("work/names_*.json"):
    hits += json.load(open(f))
hits = [h for h in hits if not any(u in h["text"] for u in UI_WORDS)]
boxes = []                                  # (t0, t1, x, y, w, h)
for h in hits:
    lh = max(h["h"], 18)
    boxes.append((h["t"] - 0.6, h["t"] + 0.6, h["x"] - 12, h["y"] - 8, h["w"] + 70, h["h"] + int(1.7 * lh) + 10))
    if 1030 <= h["x"] <= 1160 or 1980 <= h["x"]:            # Data Assistant Student column
        boxes.append((h["t"] - 0.6, h["t"] + 0.6, 1050, 120, 470, 830))
print(len(hits), "name hits ->", len(boxes), "boxes")

# banner template: "You're viewing" label at 85 s
cap = cv2.VideoCapture(SRC)
cap.set(cv2.CAP_PROP_POS_MSEC, 85000)
_, f85 = cap.read()
tpl = cv2.cvtColor(f85[133:162, 86:230], cv2.COLOR_BGR2GRAY)

dec = subprocess.Popen(["ffmpeg", "-v", "error", "-i", SRC, "-f", "rawvideo", "-pix_fmt", "bgr24", "-"], stdout=subprocess.PIPE)
enc = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                        "-c:v", "libx264", "-crf", "18", "-preset", "fast", "-g", "15", "-pix_fmt", "yuv420p", OUT], stdin=subprocess.PIPE)


def _bluish(fr, y):
    bg = fr[y:y + 29, 300:1500].reshape(-1, 3).astype(int)
    bg = bg[bg.sum(1) > 500]                 # light background pixels only
    return len(bg) > 100 and bg[:, 0].mean() > bg[:, 2].mean() + 8   # BGR: blue > red (name banner), not yellow


k = nb = 0
while True:
    b = dec.stdout.read(W * H * 3)
    if len(b) < W * H * 3:
        break
    fr = np.frombuffer(b, np.uint8).reshape(H, W, 3).copy()
    t = k / FPS
    act = [bx for bx in boxes if bx[0] <= t <= bx[1]]
    strip = cv2.cvtColor(fr[90:220, 0:420], cv2.COLOR_BGR2GRAY)
    r = cv2.matchTemplate(strip, tpl, cv2.TM_CCOEFF_NORMED)
    _, mx, _, loc = cv2.minMaxLoc(r)
    if mx > 0.9 and strip.std() > 25 and fr[90 + loc[1]:90 + loc[1] + 29, loc[0]:loc[0] + 144].std() > 25 and _bluish(fr, 90 + loc[1]):
        y = 90 + loc[1]
        act.append((0, 0, loc[0] + 140, y - 8, 900, 46))
        nb += 1
    for _, _, x, y, w, h in act:
        x0, y0, x1, y1 = max(0, x), max(0, y), min(W, x + w), min(H, y + h)
        if x1 > x0 and y1 > y0:
            fr[y0:y1, x0:x1] = cv2.GaussianBlur(fr[y0:y1, x0:x1], (0, 0), 9)
    enc.stdin.write(fr.tobytes())
    k += 1
enc.stdin.close()
enc.wait()
print("frames", k, "banner frames blurred", nb)
