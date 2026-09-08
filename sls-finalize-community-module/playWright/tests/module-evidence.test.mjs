import assert from "node:assert/strict";
import test from "node:test";
import {
  applyModuleEvidenceToConfig,
  moduleToSectionTagCopyPlan,
  normalizeModuleCurriculumEvidence,
  sectionCurriculumStateContainsPlan,
  sectionCurriculumStateIsEmpty,
  sectionZeroSelectedTopicRepairPlan,
} from "../src/module-evidence.mjs";
import { moduleOutcomeReferenceIntegrityError } from "../src/sls-runner.mjs";

const placeholder = "REVIEW-BEFORE-RUNNING: choose";
const liveEvidence = {
  subjectLevels: [{ subject: "Mathematics - G3MATHS", level: "Secondary 2" }],
  contentMaps: ["Sec 2 Mathematics (G3) (2020)"],
  moduleText: "By the end of the module, students expand and factorise quadratic expressions using identities.",
};

test("question tagging stops when a selected-count summary cannot be read exactly", () => {
  const message = moduleOutcomeReferenceIntegrityError({
    selectedOutcomeErrors: [
      "Sec 3 & 4 Additional Mathematics (G3) (2020) says 18 selected but its checked tree exposed 0"
    ]
  });
  assert.match(message, /18 selected/);
  assert.match(message, /stopped rather than considering unselected outcomes/);
  assert.equal(moduleOutcomeReferenceIntegrityError({ selectedOutcomeErrors: [] }), null);
});

test("an unreadable enrichment map does not block a recovered academic map", () => {
  const evidence = {
    selectedOutcomeErrors: [
      "Pre-U Emerging 21st Century Competencies - E21CC says 1 selected but its checked tree exposed 0"
    ]
  };
  assert.equal(
    moduleOutcomeReferenceIntegrityError(evidence, ["Pre-U Physics (H2) - 2016"]),
    null
  );
  assert.match(
    moduleOutcomeReferenceIntegrityError(evidence, ["Pre-U Emerging 21st Century Competencies - E21CC"]),
    /E21CC/
  );
});

test("one consistent saved Module Tags row is authoritative curriculum evidence", () => {
  assert.deepEqual(normalizeModuleCurriculumEvidence(liveEvidence), {
    usable: true,
    subject: "Mathematics - G3MATHS",
    level: "Secondary 2",
    contentMap: "Sec 2 Mathematics (G3) (2020)",
    derivedSubjectLevelFromContentMap: false,
  });
});

test("Pre-U Physics Module Tags remain authoritative without title inference", () => {
  assert.deepEqual(
    normalizeModuleCurriculumEvidence({
      subjectLevels: [{ subject: "Physics - H2PHY", level: "Pre-U 1" }],
      contentMaps: ["Pre-U Physics (H2) - 2025"]
    }),
    {
      usable: true,
      subject: "Physics - H2PHY",
      level: "Pre-U 1",
      contentMap: "Pre-U Physics (H2) - 2025",
      derivedSubjectLevelFromContentMap: false
    }
  );
});

test("a configured Physics subject selects its academic map from Physics plus 21CC Module Tags", () => {
  const raw = {
    subjectLevels: [
      { subject: "Physics - H2PHY", level: "Pre-U 1" },
      { subject: "21st Century Competencies - 21CC", level: "Pre-U 1" }
    ],
    contentMaps: [
      "Pre-U Physics (H2) - 2016",
      "Pre-U Emerging 21st Century Competencies - E21CC"
    ],
    selectedOutcomes: [{
      contentMap: "Pre-U Physics (H2) - 2016",
      outcome: "2(f) describe qualitatively the motion of bodies falling with air resistance.",
      outcomePath: ["Newtonian Mechanics", "Kinematics"]
    }]
  };
  assert.deepEqual(
    normalizeModuleCurriculumEvidence(raw, { preferredSubject: "Physics - H2PHY" }),
    {
      usable: true,
      subject: "Physics - H2PHY",
      level: "Pre-U 1",
      contentMap: "Pre-U Physics (H2) - 2016",
      derivedSubjectLevelFromContentMap: false,
      selectedFromMultiple: true
    }
  );
  assert.equal(
    normalizeModuleCurriculumEvidence(raw, { preferredText: "JC1 Physics of Skydiving" }).contentMap,
    "Pre-U Physics (H2) - 2016"
  );

  const result = applyModuleEvidenceToConfig({
    module: { title: "JC1 Physics of Skydiving" },
    defaults: {
      subject: "Physics - H2PHY",
      level: null,
      contentMap: "Pre-U Physics (H2) - 2025",
      outcome: "5(e) stale outcome",
      outcomePath: ["Mechanics"],
      questionKeyword: "FA Math"
    }
  }, raw);
  assert.equal(result.config.defaults.level, "Pre-U 1");
  assert.equal(result.config.defaults.contentMap, "Pre-U Physics (H2) - 2016");
  assert.equal(result.config.defaults.outcome, raw.selectedOutcomes[0].outcome);
  assert.deepEqual(result.config.defaults.outcomePath, ["Newtonian Mechanics", "Kinematics"]);
  assert.equal(result.config.defaults.questionKeyword, "FA Physics");
  assert.deepEqual(result.applied, [
    "level",
    "contentMap",
    "outcome",
    "outcomePath",
    "questionKeyword"
  ]);
  assert.equal(result.config.module.savedCurriculumEvidence.contentMaps.length, 2);
});

test("one saved Content Map remains usable when SLS hides its Subject and Level controls", () => {
  assert.deepEqual(
    normalizeModuleCurriculumEvidence({ contentMaps: ["Sec 2 Mathematics (G3) (2020)"] }),
    {
      usable: true,
      subject: "Mathematics - G3MATHS",
      level: "Secondary 2",
      contentMap: "Sec 2 Mathematics (G3) (2020)",
      derivedSubjectLevelFromContentMap: true,
    },
  );
});

test("saved Module Tags fill placeholders and refine a generic Mathematics subject", () => {
  const original = {
    module: { title: "Expansion and Factorisation using Identities" },
    defaults: { subject: "Mathematics - MATHS", level: placeholder, contentMap: placeholder },
  };
  const result = applyModuleEvidenceToConfig(original, liveEvidence);
  assert.deepEqual(result.applied, ["subject", "level", "contentMap"]);
  assert.equal(result.config.defaults.subject, "Mathematics - G3MATHS");
  assert.equal(result.config.defaults.level, "Secondary 2");
  assert.equal(result.config.defaults.contentMap, "Sec 2 Mathematics (G3) (2020)");
  assert.match(result.config.discoveryEvidence.moduleText, /factorise quadratic expressions/);
  assert.equal(original.defaults.level, placeholder, "the caller's config is not mutated");
});

test("ambiguous or contradictory saved metadata remains a hint and changes no curriculum fields", () => {
  const ambiguous = applyModuleEvidenceToConfig(
    { module: {}, defaults: { subject: placeholder, level: placeholder, contentMap: placeholder } },
    {
      subjectLevels: [
        { subject: "Mathematics - G2MATHS", level: "Secondary 2" },
        { subject: "Mathematics - G3MATHS", level: "Secondary 2" },
      ],
      contentMaps: ["Sec 2 Mathematics (G3) (2020)"],
    },
  );
  assert.equal(ambiguous.evidence.usable, false);
  assert.deepEqual(ambiguous.applied, []);
  assert.equal(ambiguous.config.defaults.level, placeholder);

  const contradiction = normalizeModuleCurriculumEvidence({
    subjectLevels: [{ subject: "Mathematics - G3MATHS", level: "Secondary 3" }],
    contentMaps: ["Sec 2 Mathematics (G3) (2020)"],
  });
  assert.equal(contradiction.usable, false);
  assert.match(contradiction.reason, /contradicts saved level/);
});

test("an exact saved Module Tag becomes an additive empty-section copy plan", () => {
  const contentMap = "Sec 3 & 4 Additional Mathematics (G3) (2020)";
  const plan = moduleToSectionTagCopyPlan({
    subjectLevels: [{ subject: "Additional Mathematics - G3AMATHS", level: "Secondary 3" }],
    contentMaps: [contentMap],
    selectedOutcomes: [
      { contentMap, outcome: "Condition for two lines to be parallel or perpendicular", outcomePath: ["Geometry and Trigonometry", "Coordinate Geometry in two dimensions"] },
      { contentMap, outcome: "Midpoint of a line segment", outcomePath: ["Geometry and Trigonometry", "Coordinate Geometry in two dimensions"] },
      { contentMap, outcome: "Area of rectilinear figure", outcomePath: ["Geometry and Trigonometry", "Coordinate Geometry in two dimensions"] },
      { contentMap, outcome: "Coordinate geometry of circles", outcomePath: ["Geometry and Trigonometry", "Coordinate Geometry in two dimensions"] },
      { contentMap, outcome: "Transformation of given relationships to linear form", outcomePath: ["Geometry and Trigonometry", "Coordinate Geometry in two dimensions"] }
    ]
  });

  assert.equal(plan.copyable, true);
  assert.deepEqual(plan.subjectLevels, [
    { subject: "Additional Mathematics - G3AMATHS", level: "Secondary 3" }
  ]);
  assert.equal(plan.contentMap, contentMap);
  assert.equal(plan.outcomes.length, 5);
});

test("every exact saved Module Subject/Level row is retained in the section copy plan", () => {
  const contentMap = "Sec 3 & 4 Additional Mathematics (G3) (2020)";
  const plan = moduleToSectionTagCopyPlan({
    subjectLevels: [
      { subject: "ADDITIONAL MATHEMATICS - A MATHS", level: "Secondary 3" },
      { subject: "Additional Mathematics - G3AMATHS", level: "Secondary 3" }
    ],
    contentMaps: [contentMap],
    selectedOutcomes: [
      {
        contentMap,
        outcome: "Coordinate geometry of circles in the form (x-a)^2+(y-b)^2=r^2",
        outcomePath: ["Geometry and Trigonometry", "Coordinate Geometry in two dimensions"]
      }
    ]
  });

  assert.equal(plan.copyable, true);
  assert.deepEqual(plan.subjectLevels, [
    { subject: "ADDITIONAL MATHEMATICS - A MATHS", level: "Secondary 3" },
    { subject: "Additional Mathematics - G3AMATHS", level: "Secondary 3" }
  ]);
  assert.equal(plan.contentMap, contentMap);
});

test("fully readable multi-map Module Tags produce one additive plan per map", () => {
  const physicsMap = "Pre-U Physics (H2) - 2016";
  const competencyMap = "Pre-U Emerging 21st Century Competencies - E21CC";
  const plan = moduleToSectionTagCopyPlan({
    subjectLevels: [
      { subject: "Physics - H2PHY", level: "Pre-U 1" },
      { subject: "21st Century Competencies - 21CC", level: "Pre-U 1" }
    ],
    contentMaps: [physicsMap, competencyMap],
    selectedOutcomes: [
      {
        contentMap: physicsMap,
        outcome: "2(f) describe qualitatively falling with air resistance",
        outcomePath: ["Newtonian Mechanics", "Kinematics"]
      },
      {
        contentMap: competencyMap,
        outcome: "Adaptive Thinking",
        outcomePath: ["Critical, Adaptive and Inventive Thinking"]
      }
    ]
  });
  assert.equal(plan.copyable, true);
  assert.deepEqual(plan.contentMaps, [physicsMap, competencyMap]);
  assert.equal(plan.maps.length, 2);
  assert.equal(plan.maps[0].outcomes.length, 1);
  assert.equal(plan.maps[1].outcomes.length, 1);
});

test("a multi-map copy plan stops when any saved map lacks exact selected outcomes", () => {
  const plan = moduleToSectionTagCopyPlan({
    subjectLevels: [
      { subject: "Physics - H2PHY", level: "Pre-U 1" },
      { subject: "21st Century Competencies - 21CC", level: "Pre-U 1" }
    ],
    contentMaps: [
      "Pre-U Physics (H2) - 2016",
      "Pre-U Emerging 21st Century Competencies - E21CC"
    ],
    selectedOutcomes: [{
      contentMap: "Pre-U Physics (H2) - 2016",
      outcome: "2(f) describe qualitatively falling with air resistance",
      outcomePath: ["Newtonian Mechanics", "Kinematics"]
    }]
  });
  assert.equal(plan.copyable, false);
  assert.match(plan.reason, /E21CC.*no exactly readable selected outcomes/i);
});

test("only a genuinely empty Section Tags state may receive the module copy", () => {
  assert.equal(sectionCurriculumStateIsEmpty({
    subjects: [], levels: [], contentMaps: []
  }), true);
  assert.equal(sectionCurriculumStateIsEmpty({
    subjects: ["Additional Mathematics - G3AMATHS"], levels: [], contentMaps: []
  }), false, "a partially staged section is preserved");
  assert.equal(sectionCurriculumStateIsEmpty({
    subjects: [], levels: [], contentMaps: ["Sec 3 & 4 Additional Mathematics (G3) (2020)"]
  }), false, "an existing map is preserved");
});

test("reopen verification requires every copied Subject/Level pair and the exact map", () => {
  const plan = {
    subjectLevels: [
      { subject: "Additional Mathematics - G3AMATHS", level: "Secondary 4" }
    ],
    contentMap: "Sec 3 & 4 Additional Mathematics (G3) (2020)"
  };
  assert.equal(sectionCurriculumStateContainsPlan({
    subjects: ["Additional Mathematics - G3AMATHS"],
    levels: ["Secondary 4"],
    contentMaps: []
  }, plan).complete, false, "a still-hydrating map is not prematurely accepted");
  assert.deepEqual(sectionCurriculumStateContainsPlan({
    subjects: ["Additional Mathematics - G3AMATHS"],
    levels: ["Secondary 4"],
    contentMaps: ["Sec 3 & 4 Additional Mathematics (G3) (2020)"]
  }, plan), { complete: true, missingPairs: [], hasContentMap: true });
});

test("an exact copied Section map with zero topics may recover the Module outcomes", () => {
  const contentMap = "Sec 3 & 4 Additional Mathematics (G3) (2020)";
  const plan = {
    subjectLevels: [
      { subject: "Additional Mathematics - G3AMATHS", level: "Secondary 4" },
      { subject: "Additional Mathematics - G3AMATHS", level: "Secondary 3" }
    ],
    contentMap,
    outcomes: [
      { contentMap, outcome: "Solving quadratic inequalities" },
      { contentMap, outcome: "Simplifying logarithmic expressions" }
    ]
  };
  assert.deepEqual(sectionZeroSelectedTopicRepairPlan({
    subjects: ["Additional Mathematics - G3AMATHS", "Additional Mathematics - G3AMATHS"],
    levels: ["Secondary 4", "Secondary 3"],
    contentMaps: [contentMap],
    mapSelections: [{ contentMap, selectedCount: 0 }]
  }, plan), {
    repairable: true,
    exactPairs: true,
    exactMap: true,
    selectedCount: 0,
    reason: null
  });
});

test("existing human-selected Section topics are never replaced by Module outcomes", () => {
  const contentMap = "Sec 3 & 4 Additional Mathematics (G3) (2020)";
  const plan = {
    subjectLevels: [{ subject: "Additional Mathematics - G3AMATHS", level: "Secondary 4" }],
    contentMap,
    outcomes: [{ contentMap, outcome: "One module outcome" }]
  };
  assert.equal(sectionZeroSelectedTopicRepairPlan({
    subjects: ["Additional Mathematics - G3AMATHS"],
    levels: ["Secondary 4"],
    contentMaps: [contentMap],
    mapSelections: [{ contentMap, selectedCount: 1 }]
  }, plan).repairable, false);
  assert.equal(sectionZeroSelectedTopicRepairPlan({
    subjects: ["Additional Mathematics - G3AMATHS"],
    levels: ["Secondary 3"],
    contentMaps: [contentMap],
    mapSelections: [{ contentMap, selectedCount: 0 }]
  }, plan).repairable, false, "a different Subject/Level set remains untouched");
});

test("module outcomes from a different content map are never copied", () => {
  const plan = moduleToSectionTagCopyPlan({
    subjectLevels: [{ subject: "Additional Mathematics - G3AMATHS", level: "Secondary 3" }],
    contentMaps: ["Sec 3 & 4 Additional Mathematics (G3) (2020)"],
    selectedOutcomes: [{
      contentMap: "Sec 3 & 4 Mathematics (G3) (2020)",
      outcome: "Coordinate geometry of circles"
    }]
  });
  assert.equal(plan.copyable, false);
  assert.match(plan.reason, /belongs to/i);
});
