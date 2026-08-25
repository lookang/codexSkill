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
