"""Contact sheet of a video for footage mapping.

    python contact_sheet.py VIDEO T0 T1 STEP OUT.png [--cols 5] [--width 380]

Each tile is labelled with its source second. Map the whole recording with a coarse sheet (STEP 60),
then make fine sheets (STEP 1-2) around every moment you will narrate. cv2 seeking can be ~1 s off on
some screen recordings: confirm exact times and coordinates with frame_ruler.py (ffmpeg-accurate).
"""
import argparse

import cv2
from PIL import Image, ImageDraw

ap = argparse.ArgumentParser()
ap.add_argument("video")
ap.add_argument("t0", type=float)
ap.add_argument("t1", type=float)
ap.add_argument("step", type=float)
ap.add_argument("out")
ap.add_argument("--cols", type=int, default=5)
ap.add_argument("--width", type=int, default=380)
a = ap.parse_args()
cap = cv2.VideoCapture(a.video)
sw, sh = cap.get(cv2.CAP_PROP_FRAME_WIDTH), cap.get(cv2.CAP_PROP_FRAME_HEIGHT)
W = a.width
H = int(W * sh / sw)
tiles, t = [], a.t0
while t <= a.t1:
    cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
    ok, f = cap.read()
    if not ok:
        break
    tiles.append((t, Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)).resize((W, H))))
    t += a.step
rows = (len(tiles) + a.cols - 1) // a.cols
S = Image.new("RGB", (a.cols * W, rows * (H + 16)), "white")
d = ImageDraw.Draw(S)
for i, (t, im) in enumerate(tiles):
    x, y = (i % a.cols) * W, (i // a.cols) * (H + 16)
    S.paste(im, (x, y + 16))
    d.text((x + 3, y + 2), f"{t:.1f}s", fill="red")
S.save(a.out)
print(a.out, len(tiles), "tiles")
