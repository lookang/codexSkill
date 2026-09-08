import test from "node:test";
import assert from "node:assert/strict";
import {
  isSubstantiveCurriculumQuestion,
  levelToContentMap,
  primaryMathematicsMapsFromModuleEvidence,
  proposeQuestionTag,
  questionContentMapGroups
} from "../src/question-tagger.mjs";
import { mathFeatures } from "../src/math-features.mjs";

const entry = (contentMap, outcomePath, outcome) => ({
  contentMap, outcomePath, outcome,
  features: mathFeatures(`${outcomePath.join(" ")} ${outcome}`)
});

const DICT = [
  entry("Pri 4 Mathematics (2021)", ["Number and Algebra", "Fractions", "Addition and subtraction"],
        "3.1 adding and subtracting fractions with denominators of given fractions"),
  entry("Pri 6 Mathematics (2021)", ["Number and Algebra", "Fractions", "Four operations"],
        "1.1 dividing a proper fraction by a whole number without calculator"),
  entry("Pri 3 Mathematics (2021)", ["Number and Algebra", "Fractions", "Addition and subtraction"],
        "2.1 adding and subtracting two related fractions within one whole")
];
const FA = "Q1 Find FEEDBACK ASSISTANT Feedback Assistant - Mathematics will provide marks and feedback for this question. MARKS [1] ";
const P1_ADDITION = [
  entry(
    "Pri 1 Mathematics (2021)",
    ["Number and Algebra", "Whole Numbers", "Addition and subtraction"],
    "2.1 concepts of addition and subtraction"
  ),
  entry(
    "Pri 1 Mathematics (2021)",
    ["Number and Algebra", "Whole Numbers", "Addition and subtraction"],
    "2.5 adding and Subtracting within 100"
  ),
  entry(
    "Pri 1 Mathematics (2021)",
    ["Number and Algebra", "Whole Numbers", "Addition and subtraction"],
    "2.7 mental calculation involving addition and subtraction within 20 of a 2-digit number and ones without renaming of a 2-digit number and tens"
  )
];

test("levels map to their 2021 content maps", () => {
  assert.equal(levelToContentMap("Primary 4"), "Pri 4 Mathematics (2021)");
  assert.equal(levelToContentMap("Secondary 1"), null);
});

test("saved Primary Mathematics module levels become cumulative eligible maps", () => {
  assert.deepEqual(
    primaryMathematicsMapsFromModuleEvidence({
      subjectLevels: [
        { subject: "Mathematics - MATHS", level: "Primary 4" },
        { subject: "Mathematics - MATHS", level: "Primary 5" },
        { subject: "Mathematics - MATHS", level: "Primary 6" },
        { subject: "Science - SCI", level: "Primary 6" }
      ]
    }),
    [
      "Pri 4 Mathematics (2021)",
      "Pri 5 Mathematics (2021)",
      "Pri 6 Mathematics (2021)"
    ]
  );
});

test("Primary levels compete once while explicit Secondary streams remain additive", () => {
  assert.deepEqual(
    questionContentMapGroups([], [
      "Pri 4 Mathematics (2021)",
      "Pri 5 Mathematics (2021)",
      "Pri 6 Mathematics (2021)"
    ]),
    [[
      "Pri 4 Mathematics (2021)",
      "Pri 5 Mathematics (2021)",
      "Pri 6 Mathematics (2021)"
    ]]
  );
  assert.deepEqual(
    questionContentMapGroups(
      ["Sec 1 Mathematics (G2) (2020)", "Sec 1 Mathematics (G3) (2020)"],
      ["Pri 6 Mathematics (2021)"]
    ),
    [["Sec 1 Mathematics (G2) (2020)"], ["Sec 1 Mathematics (G3) (2020)"]]
  );
});

test("a fraction sum is tagged at the level the question is restricted to", () => {
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Pri 4 Mathematics (2021)", "Pri 6 Mathematics (2021)"]
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pri 4 Mathematics (2021)");
  assert.match(result.outcome, /adding and subtracting fractions/);
});

test("a division question is tagged at P6 even though P4 was also allowed", () => {
  const result = proposeQuestionTag(`${FA} 3/4 ÷ 2`, DICT, {
    allowedContentMaps: ["Pri 4 Mathematics (2021)", "Pri 6 Mathematics (2021)"]
  });
  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pri 6 Mathematics (2021)");
});

test("live expanded decimal notation selects the P4 decimal place-value outcome", () => {
  const cumulative = [
    ...DICT,
    entry(
      "Pri 4 Mathematics (2021)",
      ["Number and Algebra", "Decimals", "Decimals up to 3 decimal places"],
      "1.1 notation, representations and place values (tenths, hundredths, thousandths)"
    ),
    entry(
      "Pri 6 Mathematics (2021)",
      ["Number and Algebra", "Ratio", "Ratio"],
      "1.7 relationship between fraction and ratio"
    )
  ];
  const liveStem =
    "Find the value of 10 + 4 10 + 5 1000 10+ \\frac{4}{10}+ \\frac{5}{1000} 10 + 10 4";
  const result = proposeQuestionTag(liveStem, cumulative, {
    allowedContentMaps: [
      "Pri 4 Mathematics (2021)",
      "Pri 5 Mathematics (2021)",
      "Pri 6 Mathematics (2021)"
    ]
  });

  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pri 4 Mathematics (2021)");
  assert.match(result.outcome, /place values \(tenths, hundredths, thousandths\)/);
});

test("a page-broken pie-chart subquestion selects P4 data interpretation", () => {
  const data = [
    entry(
      "Pri 4 Mathematics (2021)",
      ["Statistics", "Data representation and interpretation", "Tables, Line Graphs and Pie Charts"],
      "1.1 completing a table from given data"
    ),
    entry(
      "Pri 4 Mathematics (2021)",
      ["Statistics", "Data representation and interpretation", "Tables, Line Graphs and Pie Charts"],
      "1.2 reading and interpreting data from tables/line graphs/pie charts"
    )
  ];
  const primaryEvidence =
    "There were 100 students who ate apples. How many students ate papaya? " +
    "[Shared stimulus: The pie chart below shows the type of fruits students ate.] " +
    "[Shared diagram OCR: Apple Banana Orange Papaya]";
  const result = proposeQuestionTag(primaryEvidence, data, {
    allowedContentMaps: ["Pri 4 Mathematics (2021)"],
    supportingText: "100 ÷ 25 × 15 = 60 students"
  });

  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pri 4 Mathematics (2021)");
  assert.match(result.outcome, /^1\.2 reading and interpreting data/);
  assert.match(result.basis, /suggested answer/);
});

test("a suggested answer cannot invent a missing chart topic", () => {
  const data = [
    entry(
      "Pri 4 Mathematics (2021)",
      ["Statistics", "Data representation and interpretation", "Tables, Line Graphs and Pie Charts"],
      "1.2 reading and interpreting data from tables/line graphs/pie charts"
    )
  ];
  const result = proposeQuestionTag("How many students ate papaya?", data, {
    allowedContentMaps: ["Pri 4 Mathematics (2021)"],
    supportingText: "Read the pie chart and calculate 100 ÷ 25 × 15."
  });

  assert.equal(result.decision, "skip");
  assert.match(result.reason, /primary question evidence contained no readable mathematical operation or topic/);
});

test("an unresolved tie is skipped instead of guessed", () => {
  // P3 and P4 both offer an addition-of-fractions outcome.
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Pri 3 Mathematics (2021)", "Pri 4 Mathematics (2021)"]
  });
  assert.equal(result.decision, "skip");
  assert.equal(result.tiedCount, 2);
  assert.match(result.reason, /tied/);
});

test("a Primary 1 joining story uses the within-20 mental-calculation fallback", () => {
  const result = proposeQuestionTag(
    "John has 12 apples. His mother gives him 8 more apples. How many apples does John have now?",
    P1_ADDITION,
    {
      allowedContentMaps: ["Pri 1 Mathematics (2021)"],
      contextText: "Joining (Start + Change = End)"
    }
  );
  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /^2\.7 mental calculation/);
  assert.match(result.basis, /best-fit Primary 1 arithmetic outcome/);
});

test("a Primary 1 part-whole story can use explicit activity structure", () => {
  const stem = "There are 16 boys and 3 girls in the classroom. How many children are there altogether?";
  const result = proposeQuestionTag(stem, P1_ADDITION, {
    allowedContentMaps: ["Pri 1 Mathematics (2021)"],
    contextText: "Part-Part-Whole (Finding the Whole)"
  });
  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /^2\.7 mental calculation/);
  assert.equal(
    isSubstantiveCurriculumQuestion(stem, "Mathematics - MATHS", "Part-Part-Whole (Finding the Whole)"),
    true
  );
});

test("a Primary 1 separating story recognises common subtraction verbs", () => {
  const result = proposeQuestionTag(
    "Sarah has 13 biscuits. She eats 10 biscuits. How many biscuits are left?",
    P1_ADDITION,
    {
      allowedContentMaps: ["Pri 1 Mathematics (2021)"],
      contextText: "Separating (Start − Change = End)"
    }
  );
  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /^2\.7 mental calculation/);
});

test("a Primary 1 number story above 20 falls back to addition and subtraction within 100", () => {
  const result = proposeQuestionTag(
    "A box has 42 red balls and 17 blue balls. How many balls are there altogether?",
    P1_ADDITION,
    {
      allowedContentMaps: ["Pri 1 Mathematics (2021)"],
      contextText: "Part-Part-Whole (Finding the Whole)"
    }
  );
  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /^2\.5 adding and Subtracting within 100/);
});

test("an activity title cannot invent mathematics when the question body is unreadable", () => {
  const result = proposeQuestionTag("", DICT, {
    allowedContentMaps: ["Pri 3 Mathematics (2021)"],
    contextText: "Length – Convert from smaller unit of measurement to larger unit of measurement"
  });
  assert.equal(result.decision, "skip");
  assert.match(result.reason, /question body/);
});

test("parabola axis OCR and activity context select a quadratic graph, not matrices", () => {
  const secondary = [
    entry(
      "Sec 3 & 4 Mathematics (G3) (2020)",
      ["Number and Algebra", "Functions and Graphs"],
      "Sketching the graphs of quadratic functions given in the form y equals left parenthesis x minus p right parenthesis squared plus q"
    ),
    entry(
      "Sec 3 & 4 Mathematics (G3) (2020)",
      ["Number and Algebra", "Matrices"],
      "Problems involving addition, subtraction and multiplication of matrices"
    )
  ];
  const result = proposeQuestionTag("5 10 −5 −10 5 10 15 −5 0 0,0 x y", secondary, {
    allowedContentMaps: ["Sec 3 & 4 Mathematics (G3) (2020)"],
    contextText: "Quadratic and Fractional Equations"
  });

  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /graphs of quadratic functions/i);
  assert.doesNotMatch(result.outcome, /matrices/i);
});

test("generic arithmetic cannot satisfy a matrix outcome", () => {
  const secondary = [
    entry(
      "Sec 3 & 4 Mathematics (G3) (2020)",
      ["Number and Algebra", "Matrices"],
      "Problems involving addition, subtraction and multiplication of matrices"
    )
  ];
  const result = proposeQuestionTag("Calculate the remaining time.", secondary, {
    allowedContentMaps: ["Sec 3 & 4 Mathematics (G3) (2020)"],
    contextText: "Quadratic and Fractional Equations",
    supportingText: "60 × 85 ÷ (90 + 12) = 50 minutes"
  });

  assert.equal(result.decision, "skip");
  assert.match(result.reason, /no outcome matched/i);
});

test("an explicit matrix stem overrides unrelated activity context", () => {
  const secondary = [
    entry(
      "Sec 3 & 4 Mathematics (G3) (2020)",
      ["Number and Algebra", "Functions and Graphs"],
      "Sketching the graphs of quadratic functions"
    ),
    entry(
      "Sec 3 & 4 Mathematics (G3) (2020)",
      ["Number and Algebra", "Matrices"],
      "Problems involving addition, subtraction and multiplication of matrices"
    )
  ];
  const result = proposeQuestionTag("Given matrices A and B, calculate A + 2B.", secondary, {
    allowedContentMaps: ["Sec 3 & 4 Mathematics (G3) (2020)"],
    contextText: "Quadratic and Fractional Equations"
  });

  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /matrices/i);
});

test("set notation uses the selected Module Tag outcomes and does not become an equation", () => {
  const contentMap = "Sec 3 & 4 Mathematics (G3) (2020)";
  const sets = [
    entry(contentMap, ["Number and Algebra", "Set Language and notation"],
      "Use of set language and notation"),
    entry(contentMap, ["Number and Algebra", "Set Language and notation"],
      "Union and intersection of two sets"),
    entry(contentMap, ["Number and Algebra", "Set Language and notation"],
      "Venn diagrams"),
    entry(contentMap, ["Number and Algebra", "Equations and Inequalities"],
      "Solving quadratic equations in one variable")
  ];
  const moduleOutcomeReferences = sets.slice(0, 3).map(({ contentMap, outcome, outcomePath }) => ({
    contentMap, outcome, outcomePath
  }));
  const result = proposeQuestionTag("X ∪ Y =", sets, {
    allowedContentMaps: [contentMap],
    contextText: "Sets",
    moduleOutcomeReferences
  });

  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Union and intersection of two sets");
  assert.ok(result.features.topics.has("set operation"));
  assert.ok(result.features.topics.has("set notation"));
  assert.ok(!result.features.topics.has("equation"));
});

test("one exact selected Module Tag outcome is the authoritative candidate pool", () => {
  const contentMap = "Sec 3 & 4 Mathematics (G3) (2020)";
  const sets = [
    entry(contentMap, ["Number and Algebra", "Set Language and notation"],
      "Finding a union of sets"),
    entry(contentMap, ["Number and Algebra", "Set Language and notation"],
      "Union and intersection of two sets")
  ];
  const result = proposeQuestionTag("A ∪ B =", sets, {
    allowedContentMaps: [contentMap],
    moduleOutcomeReferences: [{
      contentMap,
      outcome: "Union and intersection of two sets",
      outcomePath: ["Number and Algebra", "Set Language and notation"]
    }]
  });

  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Union and intersection of two sets");
  assert.match(result.basis, /restricted to the teacher-selected Module Tag outcomes/);
});

test("clear question evidence outside selected Module Tags is skipped rather than tagged out of scope", () => {
  const contentMap = "Sec 3 & 4 Mathematics (G3) (2020)";
  const outcomes = [
    entry(contentMap, ["Number and Algebra", "Set Language and notation"],
      "Union and intersection of two sets"),
    entry(contentMap, ["Number and Algebra", "Functions and Graphs"],
      "Sketching the graphs of quadratic functions")
  ];
  const result = proposeQuestionTag("Sketch the graph of the quadratic function y = x^2.", outcomes, {
    allowedContentMaps: [contentMap],
    moduleOutcomeReferences: [{
      contentMap,
      outcome: "Union and intersection of two sets",
      outcomePath: ["Number and Algebra", "Set Language and notation"]
    }]
  });

  assert.equal(result.decision, "skip");
  assert.match(result.reason, /no outcome matched/i);
});

test("Further Differentiation Q2 selects the quotient outcome only from the 18 Module Tags", () => {
  const contentMap = "Sec 3 & 4 Additional Mathematics (G3) (2020)";
  const calculusPath = ["Calculus", "Differentiation and integration"];
  const outcomes = [
    entry(contentMap, ["Algebra", "Polynomials and partial fractions"],
      "Multiplication and division of polynomials"),
    entry(contentMap, calculusPath,
      "Derivatives of x^n for any rational n, together with constant multiples, sums and differences"),
    entry(contentMap, calculusPath,
      "Derivatives of products and quotients of functions"),
    entry(contentMap, calculusPath, "Use of chain rule"),
    entry(contentMap, calculusPath, "Integration as the reverse of differentiation")
  ];
  const moduleOutcomeReferences = outcomes.slice(1).map(({ contentMap: map, outcome, outcomePath }) => ({
    contentMap: map,
    outcome,
    outcomePath
  }));
  const result = proposeQuestionTag(
    "Differentiate x / sqrt(2x - 1).",
    outcomes,
    {
      allowedContentMaps: [contentMap],
      contextText: "Further Differentiation",
      supportingText: "Rewrite the square root into a power function. Apply the Quotient Rule.",
      moduleOutcomeReferences
    }
  );

  assert.equal(result.decision, "tag");
  assert.equal(result.outcome, "Derivatives of products and quotients of functions");
  assert.ok(result.features.topics.has("differentiation"));
  assert.ok(result.features.topics.has("quotient rule"));
  assert.match(result.basis, /suggested answer/);
  assert.match(result.basis, /teacher-selected Module Tag outcomes/);
});

test("a stale Module Tag reference never falls back to the whole content map", () => {
  const contentMap = "Sec 3 & 4 Additional Mathematics (G3) (2020)";
  const outcomes = [
    entry(contentMap, ["Algebra", "Polynomials and partial fractions"],
      "Multiplication and division of polynomials")
  ];
  const result = proposeQuestionTag("Differentiate x^2.", outcomes, {
    allowedContentMaps: [contentMap],
    moduleOutcomeReferences: [{
      contentMap,
      outcome: "Derivatives of products and quotients of functions",
      outcomePath: ["Calculus", "Differentiation and integration"]
    }]
  });

  assert.equal(result.decision, "skip");
  assert.match(result.reason, /exact selected Module Tag outcomes did not match/i);
});

test("probability multipart questions funnel through the module's selected probability outcomes", () => {
  const contentMap = "Sec 3 & 4 Mathematics (G3) (2020)";
  const outcomes = [
    entry(contentMap, ["Statistics and Probability", "Probability"],
      "Probability of simple combined events (including using possibility diagrams and tree diagrams, where appropriate)"),
    entry(contentMap, ["Statistics and Probability", "Probability"],
      "Addition and multiplication of probabilities (mutually exclusive events and independent events)"),
    entry(contentMap, ["Number and Algebra", "Indices"],
      "Positive, negative, zero and fractional indices")
  ];
  const moduleOutcomeReferences = outcomes.slice(0, 2).map(({ contentMap: map, outcome }) => ({
    contentMap: map,
    outcome,
    outcomePath: []
  }));
  const cases = [
    "Find the value of n. [Shared stimulus: A bag contains n red marbles, 7 white marbles and 5 blue marbles. The probability of picking a red marble is 7/11.]",
    "Without replacing the first marble, what is the probability of picking 2 red marbles?",
    "Find the probability that the number shown is a multiple of 4."
  ];

  for (const stem of cases) {
    const result = proposeQuestionTag(stem, outcomes, {
      allowedContentMaps: [contentMap],
      contextText: "Probability of Combined Events",
      moduleOutcomeReferences
    });
    assert.equal(result.decision, "tag", stem);
    assert.match(result.outcome, /probabilit/i, stem);
    assert.doesNotMatch(result.outcome, /indices/i, stem);
  }
});

test("explicit independent-event evidence selects the probability operations outcome", () => {
  const contentMap = "Sec 3 & 4 Mathematics (G3) (2020)";
  const outcomes = [
    entry(contentMap, ["Statistics and Probability", "Probability"],
      "Probability of simple combined events (including using possibility diagrams and tree diagrams, where appropriate)"),
    entry(contentMap, ["Statistics and Probability", "Probability"],
      "Addition and multiplication of probabilities (mutually exclusive events and independent events)")
  ];
  const result = proposeQuestionTag(
    "Three devices operate independently. Find the probability that all three devices work.",
    outcomes,
    {
      allowedContentMaps: [contentMap],
      contextText: "Probability of Combined Events",
      supportingText: "0.8 × 0.7 × 0.9",
      moduleOutcomeReferences: outcomes.map(({ contentMap: map, outcome }) => ({
        contentMap: map,
        outcome,
        outcomePath: []
      }))
    }
  );

  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /addition and multiplication of probabilities/i);
});

test("a mass conversion chooses the measurement conversion outcome, not fractions", () => {
  const measurement = [
    entry("Pri 3 Mathematics (2021)", ["Number and Algebra", "Fractions", "Addition and subtraction"],
      "2.1 adding and subtracting two related fractions within one whole"),
    entry("Pri 3 Mathematics (2021)", ["Measurement and Geometry", "Measurement", "Length, mass and volume"],
      "1.2 measuring length/mass/volume (of liquid) in compound units"),
    entry("Pri 3 Mathematics (2021)", ["Measurement and Geometry", "Measurement", "Length, mass and volume"],
      "1.3 converting a measurement in compound units to the smaller unit, and vice versa kilometres and metres kilograms and grams litres and millilitres")
  ];
  const result = proposeQuestionTag("Convert 3 kg 250 g to grams.", measurement, {
    allowedContentMaps: ["Pri 3 Mathematics (2021)"],
    contextText: "Mass – Convert from larger unit of measurement to smaller unit of measurement"
  });
  assert.equal(result.decision, "tag");
  assert.match(result.outcome, /^1\.3 converting/);
  assert.doesNotMatch(result.outcome, /fractions/);
});

test("a reflection prompt is skipped", () => {
  const result = proposeQuestionTag("Q5 Compare your model against the suggested answer.", DICT);
  assert.equal(result.decision, "skip");
});

test("a question whose levels have no harvested map is skipped, not guessed", () => {
  const result = proposeQuestionTag(`${FA} 2/5 + 3/7`, DICT, {
    allowedContentMaps: ["Sec 1 Mathematics (2021)"]
  });
  assert.equal(result.decision, "skip");
  assert.match(result.reason, /no harvested content map/);
});

test("a conceptual Physics question is matched inside its saved content map", () => {
  const physics = [
    entry(
      "Pre-U Physics (H2) - 2025",
      ["Newtonian mechanics", "Dynamics"],
      "show an understanding of Newton's laws of motion"
    ),
    entry(
      "Pre-U Physics (H2) - 2025",
      ["Gravitational field"],
      "define gravitational field strength and gravitational potential"
    )
  ];
  const result = proposeQuestionTag(
    "A trolley obeys F = ma. Which statement correctly describes Newton's second law of motion?",
    physics,
    { allowedContentMaps: ["Pre-U Physics (H2) - 2025"] }
  );

  assert.equal(result.decision, "tag");
  assert.equal(result.contentMap, "Pre-U Physics (H2) - 2025");
  assert.match(result.outcome, /Newton's laws/);
  assert.match(result.basis, /question-body lexical match/);
});

test("conceptual Physics is substantive while reflection is not", () => {
  assert.equal(
    isSubstantiveCurriculumQuestion(
      "Which statement correctly describes Newton's second law of motion?",
      "Physics - H2PHY"
    ),
    true
  );
  assert.equal(
    isSubstantiveCurriculumQuestion("How did the feedback help your thinking?", "Physics - H2PHY"),
    false
  );
});
