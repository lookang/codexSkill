"""OCR a screen recording at 2 fps and record boxes of likely person names -> names_<TAG>.json

    python find_names.py VIDEO [T0 T1 TAG]     # run 4-6 ranges in parallel; each uses 4 CPU threads

Detects ALL-CAPS multi-word names the way SLS lists students (response tables, Data Assistant).
It MISSES mixed-case lines such as "NAME submitted on ..." -> always add a template_scan.py backup pass.
Add interface words that get wrongly flagged to UI. Output feeds templates/privacy/blur_regions.py.
"""
import json
import re
import subprocess

import numpy as np
import sys

import easyocr
import torch

torch.set_num_threads(4)

SRC = sys.argv[1]
T0, T1, TAG = (float(sys.argv[2]), float(sys.argv[3]), sys.argv[4]) if len(sys.argv) > 4 else (0.0, 1e9, "all")
W, H = map(int, subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height",
                                "-of", "csv=p=0", SRC], capture_output=True, text=True).stdout.strip().split(","))
FPS = 2
UI = set("""VIEW LEARNING PROGRESS UPLOAD RESPONSE SHEETS STUDENTS TEACHERS MEMBERS SHARE VIA QR CODE ADD ASSIGNMENT ASSIGN TO
STUDENT APPLY TRASH OPEN DOWNLOAD RESPONSES REFRESH SHARING PERMISSIONS MODULE PLAN TOP HELP GENERATE SAVE ANALYSIS
FEEDBACK NOTIFY SELECTED LAST USED SLS PHYSICS S4-F S4F JUNIOR COLLEGE CLASS QUIZ HANDS-ON ACTIVITIES IP4 LAB
EXPAND ALL COLLAPSE MARKS Q1 A B C D E F G SEND SUBMIT VIEW DETAILS SPLIT ON OFF TURN SWITCH REVERSE FLIP RESET
LIVE DATA CONTROLS CURRENT MASS OK CANCEL NEXT BACK ALL""".split())


def is_name(t):
    t = t.strip()
    t = re.sub(r"^\d+\.\s*", "", t)
    letters = re.sub(r"[^A-Za-z]", "", t)
    if len(letters) < 6 or letters != letters.upper():
        return False
    words = [w for w in re.split(r"[\s,]+", t) if w]
    if len(words) < 2:
        return False
    alpha = [w for w in words if re.fullmatch(r"[A-Z][A-Z'\-]*", w)]
    if len(alpha) < 2:
        return False
    return sum(w in UI for w in alpha) <= len(alpha) // 3


reader = easyocr.Reader(["en"], gpu=False, verbose=False)
p = subprocess.Popen(["ffmpeg", "-v", "error", "-ss", str(T0), "-t", str(T1 - T0), "-i", SRC, "-vf", f"fps={FPS}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                     stdout=subprocess.PIPE)
hits, k = [], 0
while True:
    b = p.stdout.read(W * H * 3)
    if len(b) < W * H * 3:
        break
    fr = np.frombuffer(b, np.uint8).reshape(H, W, 3)
    t = T0 + k / FPS
    for box, text, conf in reader.readtext(fr, width_ths=0.9):
        if is_name(text):
            xs = [pt[0] for pt in box]; ys = [pt[1] for pt in box]
            hits.append(dict(t=t, x=int(min(xs)), y=int(min(ys)), w=int(max(xs) - min(xs)), h=int(max(ys) - min(ys)), text=text))
    if k % 20 == 0:
        print(f"{t:6.1f}s  hits {len(hits)}", flush=True)
        json.dump(hits, open(f"names_{TAG}.json", "w"))
    k += 1
json.dump(hits, open(f"names_{TAG}.json", "w"))
print("done", len(hits))
