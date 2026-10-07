"""Exact full-resolution frame with pixel rulers (ffmpeg seek, frame-accurate).

    python frame_ruler.py VIDEO T OUT.png [X Y W H]

Use it to read source-pixel coordinates for highlight boxes, camera rects and blur regions.
"""
import subprocess
import sys

from PIL import Image, ImageDraw

video, t, out = sys.argv[1], float(sys.argv[2]), sys.argv[3]
w, h = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                "-of", "csv=p=0", video], capture_output=True, text=True).stdout.strip().split(","))
raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(t), "-i", video, "-frames:v", "1", "-f", "rawvideo",
                      "-pix_fmt", "rgb24", "-"], capture_output=True).stdout
im = Image.frombytes("RGB", (w, h), raw)
d = ImageDraw.Draw(im)
for x in range(0, w, 100):
    d.line([(x, 0), (x, 8)], fill="red", width=2)
    d.text((x + 2, 10), str(x), fill="red")
for y in range(0, h, 100):
    d.line([(0, y), (8, y)], fill="red", width=2)
    d.text((10, y + 2), str(y), fill="red")
if len(sys.argv) > 7:
    x, y, cw, ch = map(int, sys.argv[4:8])
    im = im.crop((x, y, x + cw, y + ch))
im.save(out)
print(out)
