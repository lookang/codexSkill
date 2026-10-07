"""Part 2: SRT subtitles, YouTube kit (title, description, chapters, Problems, Quizzes) and thumbnail."""
import json
import re
from pathlib import Path

import cv2
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent
NAME = "xAPI_Data_Assistant_SLS_Part2"
PLAN = json.loads((HERE / "work" / "plan.json").read_text())
WORDS = json.loads((HERE / "tts" / "words.json").read_text(encoding="utf-8"))
FONTS = HERE.parent / "hf" / "assets" / "fonts"
GITHUB = "https://github.com/lookang/codexSkill/tree/main/plugins/interactive-xapi-designer"

DISPLAY = [("x API", "xAPI"), ("Twenty-eight", "28"), ("twenty-eight", "28"), ("Seventy-three seconds", "73 seconds"),
           ("zero out of four", "0 out of 4"), ("thirty seconds", "30 seconds"), ("thirty-second", "30-second"),
           ("five currents", "5 currents"), ("Part two", "Part 2"), ("part two", "part 2"), ("part one", "part 1"),
           ("F equals B, I, L", "F = BIL"), ("F equals B I L", "F = BIL"), ("i want to study dot org", "iwant2study.org")]


def ts(t):
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


def readable(t):
    for a, b in DISPLAY:
        t = t.replace(a, b)
    return t


def wrap(t, n=42):
    if len(t) <= n:
        return t
    words, best = t.split(), None
    for k in range(1, len(words)):
        l1, l2 = " ".join(words[:k]), " ".join(words[k:])
        if best is None or max(len(l1), len(l2)) < best[0]:
            best = (max(len(l1), len(l2)), l1 + "\n" + l2)
    return best[1]


def srt():
    cues = []
    for start, cue, _ in PLAN["vo"]:
        toks, sent = WORDS[cue]["tokens"], []
        for i, tk in enumerate(toks):
            sent.append(tk)
            long_ = len(" ".join(t["w"] for t in sent)) > 70 and re.search(r",$", tk["w"])
            if re.search(r"[.!?]$", tk["w"]) or long_ or i == len(toks) - 1:
                cues.append([start + sent[0]["start"], start + sent[-1]["end"] + 0.3, readable(" ".join(t["w"] for t in sent))])
                sent = []
    merged = []
    for c in cues:
        if merged and len(merged[-1][2]) < 18 and len(merged[-1][2]) + len(c[2]) < 80 and c[0] - merged[-1][1] < 0.6:
            merged[-1][1], merged[-1][2] = c[1], merged[-1][2] + " " + c[2]
        else:
            merged.append(c)
    out = []
    for k, (a, b, text) in enumerate(merged, 1):
        b = min(b, merged[k][0] - 0.05) if k < len(merged) else b
        out.append(f"{k}\n{ts(a)} --> {ts(b)}\n{wrap(text)}\n")
    (OUT / f"{NAME}.srt").write_text("\n".join(out), encoding="utf-8")


def T(scene=None, cue=None, hms=False):
    t = next(s["start"] for s in PLAN["scenes"] if s["id"] == scene) if scene else next(v[0] for v in PLAN["vo"] if v[1] == cue)
    t = int(t)
    return f"{t // 3600}:{t // 60 % 60:02d}:{t % 60:02d}" if hms else f"{t // 60}:{t % 60:02d}"


def chapters():
    names = [("hook", "One click: the 3 most common errors"), ("recap", "Previously in Part 1"), ("cls", "A real class and its virtual lab"),
             ("phy", "The physics: F = BIL"), ("mon", "One student at a time"), ("all", "View All Responses"),
             ("da", "The Data Assistant"), ("res", "The 3 most common errors"), ("fb", "Close the loop: feedback to students"),
             ("teach", "Next lesson, from the data")]
    return "\n".join(f"{T(i)} {n}" for i, n in names)


QUIZ = [
    ("phy", None, "A wire carries no current in a magnetic field. What is the magnetic force on it?",
     "Zero", ["Maximum", "Half of its usual value", "It depends only on the magnet"],
     "F = BIL. With I = 0, F = 0. This is why students who never switched on the circuit saw zero force readings."),
    (None, "phy_2", "The current through the wire is doubled. What happens to the force?",
     "It doubles", ["It halves", "It stays the same", "It reverses direction"],
     "F = BIL is proportional to I, so doubling the current doubles the force. Reversing the current reverses the direction."),
    (None, "da_4", "What does the SLS Data Assistant analyse when the interactive sends xAPI feedback?",
     "A record of what each student actually did in the virtual lab", ["Only the final answer", "Only the marks", "The teacher's notes"],
     "Because of xAPI, each student's interactive feedback (actions, explorations, scores) is sent to SLS, and the Data Assistant reads it."),
    (None, "fb_1", "After the Data Assistant lists the students who made an error, what can the teacher do directly?",
     "Add feedback to those students and notify them", ["Nothing — copy names by hand", "Delete their responses", "Change their marks automatically"],
     "From each error you can add feedback to exactly the students listed; with Notify ticked it appears in their SLS notification bell."),
]


def kit():
    quizzes = []
    for k, (scene, cue, q, ok, bad, ex) in enumerate(QUIZ, 1):
        tm = T(scene=scene, hms=True) if scene else T(cue=cue, hms=True)
        quizzes.append(f"Quiz {k} · {tm}\nQuestion: {q}\n✅ Correct: {ok}\n" + "".join(f"✗ Incorrect: {b}\n" for b in bad) + f"Explanation: {ex}\n")
    problems = "\n".join([f"{T('phy')} What is the force on a current-carrying wire in a magnetic field (F = BIL)?",
                          f"{T(cue='err_1b')} Why does a student who never switches on the circuit see zero force?",
                          f"{T('da')} How can a teacher find the most common errors across a class in SLS?",
                          f"{T(cue='err_2')} How should students vary the current to see that F is proportional to I?"])
    txt = f"""# YouTube upload kit — Part 2: xAPI + SLS Data Assistant

**Title (pick one)**
- ONE Click Found My Class's 3 Biggest Mistakes 🤯 | SLS Data Assistant + xAPI (Part 2)
- From One Student to the Whole Class: SLS Data Assistant Reads Virtual Lab Evidence
- Data-Informed Teaching in SLS: xAPI + Data Assistant on a Magnetic Force Lab

**Description**
One click. The three most common errors a whole class made in a virtual lab — and which students made each one.

Part 2 of the series. In Part 1 a ChatGPT plugin added xAPI to a simulation, so every experiment a student runs comes back to SLS as feedback. Here's the payoff across a real class of 28 physics students, using a simulated Experiment to Measure Magnetic Force.

🧲 The physics: F = BIL. No current, no force; double the current, double the force; reverse the current or flip the magnet and the force reverses (Fleming's left-hand rule).
👤 Monitor: one student's feedback — 1 interaction, 73 s, score 0/4 — useful, but one at a time.
📋 View All Responses: every student on one page (not real-time; press Refresh).
🤖 Data Assistant: recipes for common errors, common themes or misconceptions. "Based on [Feedback], identify the [three most common errors] students have."
🔎 The three errors it found: (1) not switching on the circuit before changing variables, so every force reading was zero; (2) not varying the current systematically, so the linear F–I relationship was missed; (3) not combining field, current and direction to explain the size and direction of the force.
📨 Close the loop: add feedback to exactly the students who made each error and notify them in SLS.
🧑‍🏫 Next lesson from the data: switch-on-first demo, record F at five currents and plot, then Fleming's left-hand rule.

The Data Assistant uses generative AI — review its analysis before you act on it.

▶ Part 1 — build your own xAPI interactive: (add Part 1 link)
Interactive xAPI Designer (free ChatGPT plugin): {GITHUB}
More free simulations: https://iwant2study.org

Chapters
{chapters()}

Student names are blurred to protect their privacy. Narration is computer-generated. The Data Assistant's waiting time is shortened in the edit.

#SLS #xAPI #DataAssistant #Physics #MagneticForce #AIinEducation #EdTech #ScienceTeacher

**Tags**
SLS, Student Learning Space, Data Assistant, View All Responses, xAPI, learning analytics, virtual lab, magnetic force, F = BIL, Fleming's left-hand rule, electromagnetism, physics simulation, common misconceptions, formative assessment, AI for teachers, edtech

**Files**
- Video: {NAME}.mp4 (1920x1080, 30 fps, -16 LUFS)
- Captions: {NAME}.srt
- Thumbnail: {NAME}_thumbnail.png

**Problems (YouTube Studio → Details → Problems; paste as-is)**
```
{problems}
```

**Quizzes (YouTube Studio → Editor → Quizzes → Add quiz)**
✅ Correct = tick it in Studio; ✗ Incorrect = leave unticked.

""" + "\n".join(quizzes)
    (OUT / f"{NAME}_youtube_kit.md").write_text(txt, encoding="utf-8")


def thumbnail():
    W, H = 1280, 720
    bl = lambda s: ImageFont.truetype(str(FONTS / "seguibl.ttf"), s)
    im = Image.new("RGB", (W, H), "#081026")
    glow = Image.new("RGB", (W, H), "#081026")
    g = ImageDraw.Draw(glow)
    g.ellipse((-300, -300, 500, 400), fill="#c45a00")
    g.ellipse((900, 350, 1600, 1000), fill="#1f6fff")
    im = Image.blend(im, glow.filter(ImageFilter.GaussianBlur(160)), 0.55)
    cap = cv2.VideoCapture(str(OUT / "hf" / "assets" / "screen.mp4"))
    cap.set(cv2.CAP_PROP_POS_MSEC, 238000)
    ok, f = cap.read()
    shot = Image.fromarray(cv2.cvtColor(f, cv2.COLOR_BGR2RGB)).crop((330, 380, 1470, 820))
    shot = shot.resize((640, int(shot.height * 640 / shot.width)), Image.LANCZOS)
    card = Image.new("RGB", (shot.width + 16, shot.height + 16), "#ffffff")
    card.paste(shot, (8, 8))
    card = card.rotate(-3, expand=True, fillcolor="#081026", resample=Image.BICUBIC)
    im.paste(card, (610, 330))
    d = ImageDraw.Draw(im)
    d.text((40, 24), "ONE CLICK", font=bl(120), fill="#ffffff", stroke_width=6, stroke_fill="#000")
    d.text((44, 170), "3 BIGGEST", font=bl(100), fill="#ffd21f", stroke_width=5, stroke_fill="#000")
    d.text((44, 290), "MISTAKES", font=bl(100), fill="#ffd21f", stroke_width=5, stroke_fill="#000")
    d.rounded_rectangle((40, 430, 560, 520), radius=24, fill="#ff2d48")
    d.text((300, 475), "WHOLE CLASS", font=bl(62), fill="#ffffff", anchor="mm")
    d.text((44, 600), "SLS DATA ASSISTANT · PART 2", font=bl(44), fill="#2ee6d6", stroke_width=3, stroke_fill="#000")
    im.save(OUT / f"{NAME}_thumbnail.png")


if __name__ == "__main__":
    srt()
    kit()
    thumbnail()
    print(chapters())
