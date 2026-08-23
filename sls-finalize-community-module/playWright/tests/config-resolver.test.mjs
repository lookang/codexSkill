import assert from "node:assert/strict";
import test from "node:test";
import {
  acceptCurriculumCandidate,
  applyCurriculumResolution,
  resolveCurriculumFromTaxonomies
} from "../src/config-resolver.mjs";

const placeholder = "REVIEW-BEFORE-RUNNING: choose";
const config = {
  module: { title: "Rate (FA-Math)" },
  defaults: {
    subject: "Mathematics - MATHS",
    level: placeholder,
    contentMap: placeholder,
    outcome: placeholder,
    outcomePath: []
  },
  sections: [
    { title: "Find the Rate", activities: [{ title: "Find the rate" }] },
    { title: "Find the total amount", activities: [{ title: "Find the total amount" }] },
    { title: "Find the number of units", activities: [{ title: "Find the number of units" }] }
  ]
};

const primaryFive = {
  contentMap: "Pri 5 Mathematics (2021)",
  outcomes: [
    {
      outcome: "1.1 rate as the amount of a quantity per unit of another quantity",
      outcomePath: ["Number and Algebra", "Rate and speed", "Rate"]
    },
    {
      outcome: "1.2 finding rate, total amount, or number of units given the other two quantities",
      outcomePath: ["Number and Algebra", "Rate and speed", "Rate"]
    }
  ]
};

const secondary = {
  contentMap: "Sec 1 Mathematics (G2) (2028)",
  outcomes: [
    {
      outcome: "Conversion of units (e.g. km/h to m/s)",
      outcomePath: ["NUMBERS AND ALGEBRA", "Rate and Speed"]
    }
  ]
};

const secondaryAdditional = {
  contentMap: "Sec 3 & 4 Additional Mathematics (G3) (2020)",
  subject: "Additional Mathematics - AMATH",
  outcomes: [
    {
      outcome: "Differentiate functions involving algebraic fractions",
      outcomePath: ["CALCULUS", "Differentiation", "Derivatives of functions"]
    }
  ]
};

test("a rate module resolves to the exact Primary 5 rate outcome", () => {
  const resolution = resolveCurriculumFromTaxonomies(config, [secondary, primaryFive]);
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.contentMap, "Pri 5 Mathematics (2021)");
  assert.equal(resolution.level, "Primary 5");
  assert.match(resolution.outcome, /finding rate, total amount, or number of units/);

  const filled = applyCurriculumResolution(config, resolution);
  assert.equal(filled.defaults.contentMap, "Pri 5 Mathematics (2021)");
  assert.equal(filled.defaults.level, "Primary 5");
  assert.deepEqual(filled.defaults.outcomePath, ["Number and Algebra", "Rate and speed", "Rate"]);
});

test("an ambiguous module is handed back instead of guessed", () => {
  const ambiguous = structuredClone(config);
  ambiguous.module.title = "Practice";
  ambiguous.sections = [{ title: "Practice", activities: [{ title: "Practice" }] }];
  const resolution = resolveCurriculumFromTaxonomies(ambiguous, [primaryFive, secondary]);
  assert.equal(resolution.resolved, false);
});

test("a reviewed numbered candidate can be accepted without weakening automatic guards", () => {
  const ambiguous = structuredClone(config);
  ambiguous.module.title = "Practice";
  ambiguous.sections = [{ title: "Practice", activities: [{ title: "Practice" }] }];
  const resolution = resolveCurriculumFromTaxonomies(ambiguous, [primaryFive, secondary]);
  assert.equal(resolution.resolved, false);

  const reviewed = acceptCurriculumCandidate(resolution, 1);
  assert.equal(reviewed.resolved, true);
  assert.equal(reviewed.selectedByReview, true);
  assert.equal(reviewed.selectedCandidateNumber, 1);
  assert.equal(reviewed.contentMap, resolution.candidates[0].contentMap);

  const filled = applyCurriculumResolution(ambiguous, reviewed);
  assert.equal(filled.defaults.contentMap, reviewed.contentMap);
  assert.equal(filled.defaults.outcome, reviewed.outcome);
});

test("invalid or cancelled candidate choices do not produce a resolution", () => {
  const resolution = { candidates: [{ contentMap: "Pri 5 Mathematics (2021)" }] };
  assert.equal(acceptCurriculumCandidate(resolution, ""), null);
  assert.equal(acceptCurriculumCandidate(resolution, 0), null);
  assert.equal(acceptCurriculumCandidate(resolution, 2), null);
  assert.equal(acceptCurriculumCandidate(resolution, "one"), null);
});

test("Sec 4 AMath title excludes Primary fraction maps and replaces the scaffolded generic subject", () => {
  const amath = structuredClone(config);
  amath.module.title = "Sec 4G2G3 AMath: Differentiation of Fractions (CAIT)";
  amath.sections = [
    { title: "Practise Differentiating Fractions", activities: [{ title: "Differentiate the following." }] }
  ];

  const resolution = resolveCurriculumFromTaxonomies(amath, [primaryFive, secondaryAdditional], {
    minScore: 0
  });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.level, "Secondary 4");
  assert.equal(resolution.contentMap, "Sec 3 & 4 Additional Mathematics (G3) (2020)");

  const filled = applyCurriculumResolution(amath, resolution);
  assert.equal(filled.defaults.subject, "Additional Mathematics - AMATH");
});

test("an explicit G2G3 title records both maps when both resolve to the same outcome", () => {
  const amath = structuredClone(config);
  amath.module.title = "Sec 4G2G3 AMath: Differentiation of Fractions (CAIT)";
  amath.sections = [
    { title: "Practise Differentiating Fractions", activities: [{ title: "Differentiate the following." }] }
  ];
  const g2 = {
    ...secondaryAdditional,
    contentMap: "Sec 3 & 4 Additional Mathematics (G2) (2020)",
    subject: "Additional Mathematics - G2AMATHS"
  };
  const g3 = {
    ...secondaryAdditional,
    contentMap: "Sec 3 & 4 Additional Mathematics (G3) (2020)",
    subject: "Additional Mathematics - G3AMATHS"
  };

  const resolution = resolveCurriculumFromTaxonomies(amath, [primaryFive, g2, g3], { minScore: 0 });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.selectedByExplicitStreams, true);
  assert.deepEqual(resolution.contentMaps, [g2.contentMap, g3.contentMap]);

  const filled = applyCurriculumResolution(amath, resolution);
  assert.deepEqual(filled.defaults.contentMaps, [g2.contentMap, g3.contentMap]);
  assert.deepEqual(filled.sections[0].contentMaps, [g2.contentMap, g3.contentMap]);
});

test("an S2G3 algebra module resolves only against the Secondary 2 G3 Mathematics map", () => {
  const algebra = structuredClone(config);
  algebra.module.title = "S2G3 Expansion Using Special Algebraic Identities (a-b)^2 with FAMA";
  algebra.sections = [
    { title: "Untitled", activities: [{ title: "Expansion Using Special Algebraic Identities Part 1" }] }
  ];
  const outcome = {
    outcome: "Expansion and factorisation of algebraic expressions using special algebraic identities",
    outcomePath: ["NUMBER AND ALGEBRA", "Algebraic expressions and formulae"]
  };
  const g2 = {
    contentMap: "Sec 2 Mathematics (G2) (2020)",
    subject: "Mathematics - G2MATHS",
    outcomes: [outcome]
  };
  const g3 = {
    contentMap: "Sec 2 Mathematics (G3) (2020)",
    subject: "Mathematics - G3MATHS",
    outcomes: [outcome]
  };
  const g3Future = {
    ...g3,
    contentMap: "Sec 2 Mathematics (G3) (2028)"
  };

  algebra.discoveryEvidence = {
    questionText: "Expand (a - b)^2 using a special algebraic identity."
  };
  const resolution = resolveCurriculumFromTaxonomies(algebra, [g2, g3, g3Future], {
    minScore: 0,
    currentYear: 2026
  });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.level, "Secondary 2");
  assert.equal(resolution.subject, "Mathematics - G3MATHS");
  assert.equal(resolution.contentMap, g3.contentMap);
  assert.equal(resolution.outcome, outcome.outcome);
  assert.equal(resolution.questionEvidenceUsed, true);
  assert.equal(resolution.activeSyllabusBonus, 0.3);
});

test("saved SLS metadata and module text resolve a title with no level marker", () => {
  const suppliedModule = structuredClone(config);
  suppliedModule.module = {
    title: "Expansion and Factorisation of Quadratic Expressions using Identities Version 2",
    curriculumEvidence: {
      subject: "Mathematics - G3MATHS",
      level: "Secondary 2",
      contentMap: "Sec 2 Mathematics (G3) (2020)",
    },
  };
  suppliedModule.defaults.subject = "Mathematics - G3MATHS";
  suppliedModule.defaults.level = "Secondary 2";
  suppliedModule.defaults.contentMap = "Sec 2 Mathematics (G3) (2020)";
  suppliedModule.discoveryEvidence = {
    moduleText: "Students expand and factorise quadratic expressions using special algebraic identities.",
    questionText: "Expand (x - 3)^2 and factorise x^2 - 6x + 9.",
  };
  suppliedModule.sections = [
    { title: "Expansion of Quadratic Expressions", activities: [{ title: "Assess your Learning" }] },
    { title: "Factorisation of Quadratic Expressions", activities: [{ title: "Identifying Factorisation Errors" }] },
  ];
  const outcome = {
    outcome: "Expansion and factorisation of algebraic expressions using special algebraic identities",
    outcomePath: ["Number and Algebra", "Algebraic Expressions and Formulae"],
  };
  const g2 = {
    contentMap: "Sec 2 Mathematics (G2) (2020)",
    subject: "Mathematics - G2MATHS",
    outcomes: [outcome],
  };
  const g3 = {
    contentMap: "Sec 2 Mathematics (G3) (2020)",
    subject: "Mathematics - G3MATHS",
    outcomes: [outcome],
  };

  const resolution = resolveCurriculumFromTaxonomies(suppliedModule, [g2, g3], { minScore: 0 });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.contentMap, g3.contentMap);
  assert.equal(resolution.level, "Secondary 2");
  assert.equal(resolution.subject, "Mathematics - G3MATHS");
  assert.equal(resolution.existingContentMapBonus, 4);
  assert.equal(resolution.constrainedBySavedModuleContentMap, true);
  assert.match(resolution.outcome, /special algebraic identities/);
});

test("a saved Module Tag excludes a stronger-looking outcome from another content map", () => {
  const saved = structuredClone(config);
  saved.module = {
    title: "Quadratic Expressions",
    curriculumEvidence: {
      subject: "Mathematics - G3MATHS",
      level: "Secondary 2",
      contentMap: "Sec 2 Mathematics (G3) (2020)",
    },
  };
  saved.defaults.subject = "Mathematics - G3MATHS";
  saved.defaults.level = "Secondary 2";
  saved.defaults.contentMap = "Sec 2 Mathematics (G3) (2020)";
  saved.sections = [{ title: "Quadratic Expressions", activities: [] }];

  const savedMap = {
    contentMap: "Sec 2 Mathematics (G3) (2020)",
    subject: "Mathematics - G3MATHS",
    outcomes: [{
      outcome: "Factorisation of quadratic expressions",
      outcomePath: ["Number and Algebra", "Algebraic Expressions and Formulae"],
    }],
  };
  const competingMap = {
    contentMap: "Sec 2 Mathematics (G2) (2020)",
    subject: "Mathematics - G2MATHS",
    outcomes: [{
      outcome: "Quadratic Expressions Quadratic Expressions Quadratic Expressions",
      outcomePath: ["Competing", "Outcome"],
    }],
  };

  const resolution = resolveCurriculumFromTaxonomies(saved, [competingMap, savedMap], {
    minScore: 0,
  });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.contentMap, savedMap.contentMap);
  assert.deepEqual(resolution.candidates.map((candidate) => candidate.contentMap), [savedMap.contentMap]);
});

test("a Success Criteria activity does not make the whole saved-map module reflective", () => {
  const saved = {
    module: {
      title: "Expansion and Factorisation of Quadratic Expressions using Identities",
      curriculumEvidence: {
        subject: "Mathematics - G3MATHS",
        level: "Secondary 2",
        contentMap: "Sec 2 Mathematics (G3) (2020)",
      },
    },
    defaults: {
      subject: "Mathematics - G3MATHS",
      level: "Secondary 2",
      contentMap: "Sec 2 Mathematics (G3) (2020)",
    },
    sections: [{
      title: "Factorisation of Quadratic Expressions using Identities",
      activities: [{ title: "Success Criteria" }, { title: "Assess your Learning" }],
    }],
  };
  const savedMap = {
    contentMap: "Sec 2 Mathematics (G3) (2020)",
    subject: "Mathematics - G3MATHS",
    outcomes: [{
      outcome: "Factorisation of quadratic expressions",
      outcomePath: ["Number and Algebra", "Algebraic Expressions and Formulae"],
    }],
  };

  const resolution = resolveCurriculumFromTaxonomies(saved, [savedMap], { minScore: 0 });
  assert.equal(resolution.resolved, true);
  assert.equal(resolution.outcome, "Factorisation of quadratic expressions");
});
