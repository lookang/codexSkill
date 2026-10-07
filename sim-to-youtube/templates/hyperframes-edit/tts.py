"""Generate one narration WAV per cue (Kokoro, offline) and word timings (faster-whisper).

Outputs promo/tts/<id>.wav (24 kHz mono) and promo/tts/words.json:
  {cue_id: {"duration": s, "text": ..., "tokens": [{"w": word, "start": s, "end": s}], "asr": "..."}}
Word times are aligned back onto the SCRIPT tokens so later stages can reference script words.
"""
import difflib
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

from narration import CUES, VOICE, SPEED  # noqa: E402

HERE = Path(__file__).resolve().parent
OUT = HERE / "tts"
OUT.mkdir(exist_ok=True)

ONES = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split()
TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()


def num_words(n: int) -> str:
    if n < 20:
        return ONES[n]
    if n < 100:
        return TENS[n // 10] + ("" if n % 10 == 0 else "-" + ONES[n % 10])
    if n < 1000:
        rest = n % 100
        return ONES[n // 100] + " hundred" + ("" if rest == 0 else " " + num_words(rest))
    return str(n)


def norm_tokens(text: str) -> list[str]:
    out = []
    for raw in text.replace("\u2019", "'").split():
        w = re.sub(r"[^a-z0-9'\-]", "", raw.lower()).strip("-'")
        if not w:
            continue
        if w.isdigit():
            out.extend(num_words(int(w)).split())
        else:
            out.append(w)
    return out


def split_hyphen(tokens):
    """Compare on hyphen-split pieces so 'sixty-four' matches 'sixty four'."""
    pieces, owner = [], []
    for i, t in enumerate(tokens):
        for p in t.split("-"):
            if p:
                pieces.append(p)
                owner.append(i)
    return pieces, owner


def synth_all():
    from kokoro_onnx import Kokoro
    import os
    kdir = Path(os.environ.get("KOKORO_DIR", Path.home() / ".cache" / "kokoro-onnx"))   # model + voices-v1.0.bin
    model = next((kdir / n for n in ("kokoro-v1.0.int8.onnx", "kokoro-v1.0.onnx") if (kdir / n).exists()),
                 kdir / "kokoro-v1.0.onnx")
    engine = Kokoro(str(model), str(kdir / "voices-v1.0.bin"))
    manifest_path = OUT / "hashes.json"
    hashes = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    for cue_id, text in CUES:
        key = hashlib.sha1(f"{VOICE}|{SPEED}|{text}".encode()).hexdigest()
        wav = OUT / f"{cue_id}.wav"
        if hashes.get(cue_id) == key and wav.exists():
            continue
        samples, sr = engine.create(text, voice=VOICE, speed=SPEED, lang="en-us")
        samples = np.asarray(samples, dtype=np.float32)
        sf.write(wav, samples, sr, subtype="PCM_16")
        hashes[cue_id] = key
        print(f"synth {cue_id}: {len(samples) / sr:.2f}s", flush=True)
    manifest_path.write_text(json.dumps(hashes, indent=1))


def align_all():
    from faster_whisper import WhisperModel
    model = WhisperModel("small.en", device="cpu", compute_type="int8")
    result = {}
    for cue_id, text in CUES:
        wav = OUT / f"{cue_id}.wav"
        info = sf.info(wav)
        # No initial_prompt: an unbiased transcript doubles as a pronunciation check.
        segments, _ = model.transcribe(str(wav), beam_size=5, word_timestamps=True,
                                       vad_filter=False)
        asr_words = []
        for seg in segments:
            for w in seg.words or []:
                asr_words.append((w.word.strip(), float(w.start), float(w.end)))
        asr_text = " ".join(w for w, _, _ in asr_words)

        # Expand ASR words into normalised pieces, each carrying its word's time span.
        asr_pieces, asr_times = [], []
        for word, s, e in asr_words:
            toks = norm_tokens(word)
            sub = []
            for t in toks:
                sub.extend([p for p in t.split("-") if p])
            for k, p in enumerate(sub):
                span = (e - s) / max(1, len(sub))
                asr_pieces.append(p)
                asr_times.append((s + k * span, s + (k + 1) * span))

        script_tokens = [t for t in text.replace("\u2019", "'").split()]
        script_norm = [re.sub(r"[^a-z0-9'\-]", "", t.lower()).strip("-'") for t in script_tokens]
        pieces, owner = split_hyphen(script_norm)
        sm = difflib.SequenceMatcher(a=pieces, b=asr_pieces, autojunk=False)
        piece_time = [None] * len(pieces)
        for a0, b0, size in sm.get_matching_blocks():
            for k in range(size):
                piece_time[a0 + k] = asr_times[b0 + k]
        matched = sum(1 for p in piece_time if p is not None)

        # Collapse pieces back to script tokens; interpolate gaps.
        tok_time = [None] * len(script_tokens)
        for pi, oi in enumerate(owner):
            if piece_time[pi] is None:
                continue
            s, e = piece_time[pi]
            if tok_time[oi] is None:
                tok_time[oi] = [s, e]
            else:
                tok_time[oi][0] = min(tok_time[oi][0], s)
                tok_time[oi][1] = max(tok_time[oi][1], e)
        dur = info.frames / info.samplerate
        known = [i for i, t in enumerate(tok_time) if t is not None]
        for i in range(len(tok_time)):
            if tok_time[i] is not None:
                continue
            prev = max([k for k in known if k < i], default=None)
            nxt = min([k for k in known if k > i], default=None)
            s = tok_time[prev][1] if prev is not None else 0.0
            e = tok_time[nxt][0] if nxt is not None else dur
            gap_tokens = (nxt if nxt is not None else len(tok_time)) - (prev if prev is not None else -1) - 1
            idx = i - (prev if prev is not None else -1) - 1
            step = (e - s) / max(1, gap_tokens)
            tok_time[i] = [s + idx * step, s + (idx + 1) * step]

        result[cue_id] = {
            "duration": round(dur, 3),
            "text": text,
            "asr": asr_text,
            "match_ratio": round(matched / max(1, len(pieces)), 3),
            "tokens": [{"w": w, "start": round(t[0], 3), "end": round(t[1], 3)}
                       for w, t in zip(script_tokens, tok_time)],
        }
        print(f"align {cue_id}: dur {dur:.2f}s match {matched}/{len(pieces)} | {asr_text}", flush=True)
    (OUT / "words.json").write_text(json.dumps(result, indent=1), encoding="utf-8")


if __name__ == "__main__":
    stages = sys.argv[1:] or ["synth", "align"]
    if "synth" in stages:
        synth_all()
    if "align" in stages:
        align_all()
