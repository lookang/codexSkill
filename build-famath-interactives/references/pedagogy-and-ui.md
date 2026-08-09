# FAMath pedagogy and UI rules

## Core teaching sequence

Use Concrete -> Pictorial -> Abstract:

1. Show or let the learner manipulate the mathematical objects.
2. Make the relationship visible through position, grouping, length, area, pairing, motion, or transformation.
3. Connect the visual to concise mathematical notation.
4. Ask the learner to retry independently.

After an incorrect answer, begin the tutorial with the learner's actual arrangement or selection. Address why that representation fails before showing the correct method.

## Interaction quality

- Make directions executable. If the text says "touch each counter", counters must respond, number off, and prevent double-counting.
- Offer tap/click as an alternative to dragging. Use drag when spatial placement teaches the concept, not as a motor-skill barrier.
- Reduce repetition. Require at most two full one-by-one counts before shifting to groups of ten or another efficient structure.
- Use animation for time-evolving meaning, not decoration. Animate exchanges, regrouping, reordering, removal, jumps, folding, and measured traversal.
- Respect reduced-motion preferences and keep a readable end state.
- Keep arrows tangent to curved paths; use SVG markers or correctly rotated arrowheads.
- Pair speech with a visible target. Number words and important vocabulary must be tappable and spoken in context.
- Keep Primary 1 text brief and visual; increase notation and abstraction progressively for older learners.

## Proven mathematical moves

- Counting: number each touched object once; show progress; move from ones to ten-groups plus extras.
- Set comparison: pair objects one-to-one; the unmatched leftovers identify more, while the exhausted set identifies fewer.
- Ordering: align bars on one baseline; animate the shortest/tallest into the requested position; compare only remaining values.
- Number sequences: use curved jumps labelled with the change; connect both neighbouring equations to the missing term.
- Addition/subtraction: act out joining or taking away. Let learners select removed objects, then cross out, fade, or move them.
- Place value and algorithms: use H/T/O or larger place-value columns. Animate ten ones becoming one ten and one hundred becoming ten tens; preserve equal value through every exchange.
- Mental calculation: make number-bond parts clickable and name each part before using the bond.
- Number words: segment meaningful word parts, connect them to place value, and provide tap-to-hear pronunciation.
- Fractions: use equal-sized regions or sets before symbols; keep wholes visible when converting mixed and improper forms.
- Fraction division: distinguish the two meanings before using a reciprocal. For a fraction divided by a whole number, split and deal the dividend fairly among equal recipients, then recombine all shares to check. For a whole number or fraction divided by a proper fraction, ask how many divisor-sized groups fit, partition the dividend into matching pieces, animate the group count, and confirm it with equal number-line jumps. Introduce multiplication by the reciprocal only after the concrete and pictorial models have established the quotient.
- Formative answer concealment: before the learner checks an answer, models may expose the givens, partitions, units, and relationships, but must not print the computed answer, label the correct choice, or number every group in a way that states the result. Reveal and explain the result only after an incorrect check or inside the learner-invoked tutorial.
- Output-slot rule: when a balance, function machine, substitution machine, equation strip, graph label, clock readout, measurement readout, total, or endpoint contains the assessed result, render `?` before checking. The concrete or pictorial model must remain usable so the learner can derive the result; the completed output belongs only in feedback or the worked tutorial.
- Unknown letters: when the learning objective is using a letter to represent an unknown, vary the valid letter instead of always using `x`. Assess translation, symbol roles, and interpretation with tasks such as `? + 9 = 15` becoming `n + 9 = 15`. Preserve the operation, known quantities, and equality; do not calculate or display `n = 6` unless solving the equation is itself the stated learning objective.
- Decimals: align decimal points and show tenths, hundredths, and thousandths as places or partitions.
- Ratio: keep the named order visible from left to right and use equal-sized units. In the unanswered formative model, conceal printed counts when counting is the assessed action. In the tutorial, animate each labelled row counting itself, then animate the same scale operation across every term before assembling the colon notation. Provide replay and tappable spoken label cues. Within one multiple-choice question, make every option use the same response notation (for example, all `share and share`, all `a:b`, or all fractions) so formatting never identifies the answer. Keep the tutorial shell within its viewport; when a ratio has many units, preserve a shared responsive unit size and wrap the model into balanced rows of at most nine units rather than widening the dialog or clipping the bars.
- Money: show recognisable denominations, support tap/drag to a wallet, and visualize the largest usable denomination before composing the remainder.
- Length: point to the zero line, align the left endpoint, then traverse equal intervals to the right endpoint. Count intervals, not tick marks.
- Angles: align the centre and 0-degree ray before reading or marking the scale.
- Circles: mark the exact centre explicitly. Every displayed radius must begin at that centre and end on the circumference; adapt the centre and endpoint geometry for whole circles, semicircles and quarter circles instead of reusing one fixed line. In remediation, bridge the picture to notation gradually: select the formula, substitute π and the labelled radius, simplify the power and factors, then reveal the answer with the correct linear or square unit. For semicircle and quarter-circle perimeter, colour-link the curved-circumference term and straight-edge term to the matching drawing parts; make either term clickable so both representations flash together and record that inspection as evidence.
- Symmetry: compare corresponding points at equal perpendicular distances; include genuinely asymmetric counterexamples.
- Nets: use the correct number and shapes of faces; animate or mentally rehearse folding without overlapping faces.
- Data: make title, labels, units, key, and scale visible before interpretation. Never ask for a missing table value without stating a determining relationship.

## Adaptive difficulty and challenge levels

- Separate the question slot from the difficulty step. Move the step on evidence: up on a clean first-try correct, hold when support was used or the second try succeeded, down after three or more tries. A confident learner then meets the original fixed ladder unchanged.
- Treat a hint or an opened walkthrough as support. Getting there with help is not the same as getting there alone, and the ladder should say so.
- Let the scaffolding phase follow the served step, not the slot, so a learner held low keeps the guided wording for as long as they need it.
- Show the learner where they are. A six-dot difficulty meter and a plain sentence ("Starting simple. Get it right first try and the next one steps up.") make the adaptation legible rather than mysterious.
- Record the path, not just the score. `4/6` means different things along `1→2→3→4→5→6` and `1→1→1→2→1→1`; teacher analytics and the xAPI payload need the sequence.
- Level 1 applies the objective, Level 2 adds a reasoning step, Level 3 works backwards, combines, or judges reasoning. Offer only the levels an objective can actually produce, and never let a level quietly serve a lower-level item.
- A generic Level 3 can be built from per-option misconception data: describe the faulty METHOD in third person and ask which answer it produced, keeping the correct answer among the choices. Objectives whose wrong answers are merely other names — naming a shape, choosing a unit — have no method to describe and need authored property-and-claim items instead.

## Animate the search, not just the result

Some objectives are a *procedure with a decision at every step*, not a single transformation. Prime factorisation is the clearest case: test 2, divide while it works, fail, move to 3, fail, move to 5, and so on. For those:

- **Perform the method on the learner's own number.** A generic flow of verbs ("split into factors", "check every leaf is prime") describes the method in the abstract and helps nobody stuck on 84.
- **Keep the failed attempts visible.** The rejected primes are the lesson. A learner shown only the successful divisions never finds out why 5 was tried, and the choice of the next prime looks arbitrary.
- **Let the answer assemble at the end of the reasoning**, never before it. Stage the reveal: watch the search, collect what came out, then write the compact notation.
- **Stagger only what is new.** Re-running the whole animation on each later step makes the learner wait several seconds to reach the one line that changed.
- **Distinguish the two meanings of "factorise".** Trial division belongs to prime factorisation, HCF, LCM and roots. Algebraic factorisation of a quadratic is a different objective and must not inherit it.
- Give a replay control and record its use as evidence. Under `prefers-reduced-motion`, show every stage at once rather than leaving a reader with a blank panel.

## Show the transformation, not only its endpoints

A net beside a finished solid shows a learner the before and the after but never the becoming, which is the part the objective is actually about. Where a concept IS a transformation — folding a net, regrouping, partitioning — build the intermediate states and let the learner drive them.

- Model the structure honestly. A net is a **hinge tree**: every face hangs from one edge of its parent and rotates about that edge, so folding a face carries everything attached beyond it, exactly as paper does. Author each face in one canonical frame (hinge on the local X axis, face extending toward +Z) so folding is the same operation everywhere instead of a pile of per-face special cases.
- Let the learner fold in any order. Choosing which face to lift next is where the prediction happens — "which face will meet this one?" — and a fixed sequence takes that away.
- **Verify transformation geometry numerically, not by eye.** Fold every net headlessly and assert the face centres land where the solid requires: a cube of side s must put its opposite face at exactly y = s. A face carried through two hinges is the one that exposes a wrong axis or sign, and a screenshot will not tell you it is 2° out.
- Keep the transformation behind the check. It reveals the answer, so it belongs in the tutorial, and the question surface should say so.
- Pointer-free from the start: one button per movable part, plus a "next" and a "reset". Tapping a 3D surface cannot be the only way in.

## A model carries only the labels its own objective assesses

- **Declare labels per objective; never let a shared model default them on.** A reusable 3D or 2D model accumulates labels from every objective that has ever used it. On a net, inherited "vertex / edge / face" tags named a task nobody had been asked to do, and their positions — hardcoded for a compact solid — left them floating in mid-air pointing at nothing. Make the generator state which labels belong; a catch-all `else` in the renderer is how the wrong ones arrive.
- Ask what the question is assessing. "Which solid does this net form?" is not "name the parts of a solid". Labels for the second make the first harder to read, not richer.
- **Every label must identify which thing it names.** Four buttons all reading "fold triangular face", or two reading "fold sloping rectangle", leave a learner guessing which is which. Distinguish by position — front, back, left, right — so the name picks out one object.
- A label with nothing to attach to should not exist. If a part is not identifiable in the drawing, naming it teaches nothing.

## Label placement in figures

- **Anchor a label to the feature it names.** A property label belongs beside the thing it describes: "one corner = 90°" goes next to that corner, under the right-angle mark, not centred across the top of the shape. A learner reads the label and the feature as one idea, so make them one visual unit.
- **Derive the position from the feature's coordinates**, not from the figure's bounding box. Centring on the shape puts the label wherever the shape happens to be, which is how a caption ends up furthest from the corner it explains.
- **Never let text cross an outline.** Text over a stroke is unreadable at any size, and the fact being taught becomes the hardest thing on the diagram to read. Push the label clear of the edge, into the margin the viewBox already provides.
- A label naming a whole region may sit on that region — "whole 9 × 7" written across the rectangle it measures is correct. The test is whether the label names what it sits on.
- Keep labels out of the arcs, rays, and marks around a vertex. The space on the far side of the vertex is usually empty; use it.

## Layout economy

- Keep the model, the question, the coach line, and the answer choices visible together. A learner who must scroll between the model and the question is holding two halves of one idea in memory.
- Pack rows of repeated objects that are read as a sequence onto one line by shrinking each object to its share of the width, down to a legibility floor, then scrolling. Let bulk collections wrap into a block instead; shrinking ninety counters to fit one line destroys the countability the task depends on.
- Give alternative representations comparable heights so a representation toggle changes the picture, not the page position.
- Never show a value a pupil would not write. Tidy floating-point noise and non-terminating results, but protect deliberate decimals: thousandths for ordering, the digits a rounding question strips, significant figures, standard form, trigonometric ratios.

## Feedback ladder

Use a short progressive ladder:

1. Neutral prompt to inspect the learner's current model.
2. One visual clue without giving the answer.
3. Animated or manipulable worked representation.
4. Symbolic bridge to the equation or statement.
5. Model-based answer check and independent retry.

Avoid repeating identical still images across tutorial steps. Each step must change the learner's understanding or action.

## UI and accessibility

- Use large touch targets, strong contrast, visible focus, semantic buttons, and keyboard activation.
- Provide Read, Help, Restart, Clear, Hint, Check, progress, and concise status feedback when applicable.
- Prevent horizontal overflow at 390 px and inside an iframe.
- Keep essential controls reachable without hover.
- Preserve learner state while opening and closing help.
- Use local assets and self-contained CSS/JavaScript; do not depend on a CDN.
- Keep visual labels, units, symbols, and narration mathematically consistent.
- Never leave a control on screen that does nothing. Hide a picker, toggle, or panel wherever the objective cannot use it, and verify the hiding actually takes effect.
- An author `display` rule beats the browser's `[hidden] { display:none }`. Any element toggled through the `hidden` property needs an explicit `[hidden] { display:none }` guard, or it stays visible and dead while the code believes it is hidden.
- Do not put `container-type` on a row that shrinks to fit its contents. Inline-size containment collapses it to zero width and every child drops onto its own line.
- **Never centre content in a container that can clip or scroll it.** With `align-items:center`, `justify-content:center` or `place-items:center`, content taller or wider than the container overflows in *both* directions, and the part above the top edge cannot be reached because `scrollTop` will not go negative — the same applies to the left edge on a horizontal scroller. Use `safe center`, which centres while the content fits and falls back to `start` the moment it does not. Audit for this by pairing each container's computed alignment with its computed overflow; a regex over the stylesheet misses declarations split across rules and inside media queries.
