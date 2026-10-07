"""Transcribe the original voice track (camera_*.mp4 is often audio-only):  python transcribe.py ../camera_XXXX.mp4"""
from faster_whisper import WhisperModel
import json
import sys
m=WhisperModel("small.en",device="cpu",compute_type="int8")
segs,_=m.transcribe(sys.argv[1],word_timestamps=True,vad_filter=True)
out=[]
for s in segs:
    out.append({"start":s.start,"end":s.end,"text":s.text})
    print(f"{s.start:7.1f}-{s.end:7.1f} {s.text}",flush=True)
json.dump(out,open("work/transcript.json","w"),indent=1)
