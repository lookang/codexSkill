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
