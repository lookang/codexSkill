# Cast and cute B-roll (characters, cutaways, cute SFX)

Owner feedback on the "Will AI replace teachers?" explainer: "make it more animated and cute, with more interesting
B-rolls and sound effects", and then, after v2, "it is great". This layer adds that charm to any edit, including
screen-recording tutorials, without touching the truth rules: the footage still proves every claim, and the characters
only react to it.

Code: `templates/cast/cast.py` (characters, props, cameo builder, JS helpers, CSS) and `templates/cast/cute_sfx.py`
(13 synthesized sounds). `templates/hyperframes-edit/build.py` and `soundtrack.py` already use both when the files
sit next to them, and run unchanged without them.

## The cast

| Piece | What it is |
|---|---|
| `bot` | **Bit**, a small robot: antenna that sways, screen face, two arms. Stands for the AI / the app / the tool. |
| `teach` | A teacher. `look=(skin, hair, shirt, "bun" or "short")`, so each real person in a story gets their own colours. |
| Props | `q ex heart star spark sweat zzz paper mag bulb eye hand cal map desk cog bell cloud kid rope` |
| Faces | eyes `n` normal / `h` happy / `c` closed or cross; mouths `n` smile / `o` "oh" / `w` wobbly. `mood(id, t, e, m)` switches them. |
| Motion | `idle` (bob + blink + antenna), `enter`, `popin`, `hop`, `wave`, `raise`, `wobble`, `floaty`, `spin` (JS, in `CAST_JS`) |

Themes: `CAST.set_theme("navy")` (default: the skill's dark navy look; characters get a white sticker edge so they
read on footage) or `set_theme("paper")` (the cream paper-and-ink explainer look).

## Two ways to use it

### 1. Cameos on footage (Route B/C)

A character peeks in from a corner of a footage scene and reacts on narration words. In a `foot` scene of `build.py`:

```python
cameos=[(w("mon_1", "zero"), w("mon_2", "class"), [(w("mon_1", "zero"), "worry")])],
cameos=[(w("fb_2", "lands"), ("end", -0.2),
         [(w("fb_2", "bell"), "love"), (w("fb_2", "loop."), "say", "That's the loop!")],
         dict(corner="br", who="teach", look=("#f3c9a5", "#3b2a20", "#1f8fff", "short")))],
```

`(enter_anchor, leave_anchor, beats, options)`; it slides in 0.35 s before its first word. `("+", anchor, 0.8)` shifts any
anchor. Options: `who` (`bot`/`teach`), `corner` (`br`, `bl` rise from the bottom; `rm`, `lm` slide in from a side),
`size` (default 200 px wide), `look`.

| Action | What happens | SFX |
|---|---|---|
| `worry` | cross eyes, wobbly mouth, sweat drop, wobble | `uhoh` |
| `think` | "oh" mouth + question mark | `bubble` |
| `happy` / `wow` | happy face + hop + sparkle / "oh" + star | `sparkle` |
| `yes` / `idea` / `love` | happy + green tick / light bulb / heart | `ding` / `ding` / `bubble` |
| `wave`, `hop`, `point` | arm wave, hop, arm raised toward the action | `blip`, `boing`, `blip` |
| `sleep` | closed eyes + zzz | `snore` |
| `say` | speech bubble, `(t, "say", "Short text!")` | `blip` |

Every cameo adds a `whoop` as it enters. `build.py` prints `cameos N, overlaps M` and a `CAMEO OVERLAP` line for every
highlight box, card, stamp, banner or chapter tag it would cover; fix each one (other corner, smaller, later) before rendering.

### 2. Cutaways (graphics scenes)

When the narration explains an idea the footage cannot show (why it matters, what goes wrong in class, what the
tool does for 30 students), cut to a `G(...)` graphics scene and stage the cast there. Place actors with
`CAST.actor_html(kind, id, left, top, width, *look)` in `gfx_html`, animate them in `gfx_js` with the JS helpers
on narration words. The `teach` scene in the template is the worked example: the teacher raises an arm as each
tip appears and Bit hops, then waves on "combine". `build.py` also puts faint drifting doodles behind every graphics scene.

Good cutaway ideas from the explainer: Bit rolls up to a nervous teacher; papers fly off a desk ("which tasks leave
your desk?"); tug-of-war that turns into a heart (a paradox); Bit handing tailored worksheets to eight kids;
rain cloud over a struggling student; the teacher dozing while Bit works ("blind trust"); both waving goodbye.

## Rules

- **Footage first.** Cameos never sit over the thing being taught: no cameo while a highlight box, card or stamp
  shares its corner (`build.py` checks this), and no cutaway in the middle of a step the viewer must watch. Cut away
  where the narration explains, not where it demonstrates.
- **Truth applies to characters too.** A speech bubble or reaction must match what the footage and narration say.
  Example caught while building the template: a "Feedback sent!" bubble on a demo where the narration says "I won't
  send it in this demo" -> changed to "That's the loop!".
- **Seasoning, not the meal.** About one cameo per footage scene at most, 4-8 s each, reacting to the scene's key
  beat (a wrong result -> `worry`, a payoff -> `happy`, a warning -> `think`). Skip the first 5 s hook.
- **Consistent cast.** Same Bit and the same teacher colours all video; a new teacher look means a new person.
- **Mood resets.** Every reaction returns the face to normal after its hold (`cameo()` does this); in cutaways, call
  `mood(id, t, "n", "n")` yourself.
- **Narrate nothing about the cast.** They are decoration; the script stays about the content.

## Sound

`cute_sfx.CUTE`: `boing2 bell sparkle blip swish bubble beepboop thud whoop uhoh scribble tada snore`, merged into
`soundtrack.FX` (names already in FX keep the original). Gains sit under the main SFX. `python cute_sfx.py` writes
`work/cute_sfx_preview.wav` to audition them. All SFX are mixed into one `work/mix.wav`, so even 100+ cues never become
separate `<audio>` clips. Hand-written HyperFrames projects should do the same: on Windows, ~140 separate audio
clips crashed the renderer's audio stage; one pre-mixed SFX bed fixed it.

## Gotchas

- Actors inside a positioned container (a `.card`) use that container's coordinates, not the page's.
- A prop placed earlier in the DOM than a later card is hidden behind it; put props after the cards they sit on.
- `idle` and `hop` both move `.body` (y); `cameo()` animates the outer element for entry/exit so they never fight.
- `wave`/`raise` use `svgOrigin` shoulder points; they work for `bot` and `teach` only.
- HyperFrames `check` flags each cameo as `nested_structure_needs_subcomposition` (warning), like every other
  overlay in the template. It is safe to ignore.
- Check the moment each reaction happens in snapshots (`snapshot --at`), not just the scene start: props pop on the word.
