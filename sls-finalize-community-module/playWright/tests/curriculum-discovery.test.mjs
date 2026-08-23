import assert from "node:assert/strict";
import test from "node:test";
import {
  inferCurriculumClues,
  contentMapSupportsStreams,
  contentMapSupportsLevel,
  rankContentMapOptions,
  rankLevelOptions,
  rankSubjectOptions
} from "../src/curriculum-discovery.mjs";

const amath = {
  module: { title: "Sec 4G2G3 AMath: Differentiation of Fractions (CAIT)" },
  sections: [
    { title: "Practise Differentiating Fractions", activities: [{ title: "Differentiate the following." }] }
  ]
};

test("Sec 4G2G3 AMath produces explicit level, subject and stream clues", () => {
  const clues = inferCurriculumClues(amath);
  assert.equal(clues.level, "Secondary 4");
  assert.equal(clues.subjectId, "additional-mathematics");
  assert.deepEqual(clues.streams, ["G2", "G3"]);
  assert.equal(clues.subjectQueries[0], "Additional Mathematics");
});

test("a combined Sec 3 & 4 map supports Secondary 4 without pretending it is only Secondary 3", () => {
  assert.equal(contentMapSupportsLevel("Sec 3 & 4 Additional Mathematics (G2) (2020)", "Secondary 4"), true);
  assert.equal(contentMapSupportsLevel("Sec 3 & 4 Additional Mathematics (G2) (2020)", "Secondary 2"), false);
});

test("exact SLS Additional Mathematics and Secondary 4 choices outrank generic mathematics", () => {
  const clues = inferCurriculumClues(amath);
  const subjects = rankSubjectOptions(
    ["Mathematics - MATHS", "Additional Mathematics - AMATH", "Mathematics - G3MATHS"],
    clues
  );
  assert.equal(subjects[0].label, "Additional Mathematics - AMATH");
  assert.equal(subjects.some((entry) => entry.label === "Mathematics - MATHS"), false);

  const levels = rankLevelOptions(["Secondary 3", "Secondary 4", "Pre-University 1"], clues);
  assert.deepEqual(levels[0], { label: "Secondary 4", score: 15 });
});

test("the live crawler keeps only matching Sec 4 Additional Mathematics maps at the top", () => {
  const clues = inferCurriculumClues(amath);
  const maps = rankContentMapOptions(
    [
      "Pri 4 Mathematics (2021)",
      "Sec 4 Mathematics (G3) (2020)",
      "Sec 4 Additional Mathematics (2020)",
      "Sec 3 Additional Mathematics (2020)"
    ],
    clues
  );
  assert.equal(maps[0].label, "Sec 4 Additional Mathematics (2020)");
  assert.ok(maps[0].score >= 20);
});

test("S2G3 algebra identifies Secondary 2 Mathematics and rejects other streams", () => {
  const config = {
    module: { title: "S2G3 Expansion Using Special Algebraic Identities (a-b)^2 with FAMA" },
    sections: [
      { title: "Untitled", activities: [{ title: "Expansion Using Special Algebraic Identities Part 1" }] }
    ]
  };
  const clues = inferCurriculumClues(config);

  assert.equal(clues.level, "Secondary 2");
  assert.equal(clues.subjectId, "mathematics");
  assert.deepEqual(clues.subjectQueries, ["Mathematics"]);
  assert.deepEqual(clues.streams, ["G3"]);

  const subjects = rankSubjectOptions(
    ["Mathematics - MATHS", "Mathematics - G3MATHS", "Chinese Language (Special Programme) - G3CL(SP)"],
    clues
  );
  assert.equal(subjects[0].label, "Mathematics - G3MATHS");
  assert.equal(subjects.some((entry) => /Chinese Language/.test(entry.label)), false);
  assert.equal(contentMapSupportsStreams("Sec 2 Mathematics (G3) (2020)", clues.streams), true);
  assert.equal(contentMapSupportsStreams("Sec 2 Mathematics (G2) (2020)", clues.streams), false);
  assert.equal(contentMapSupportsStreams("Sec 2 Mathematics (2020)", clues.streams), false);
});

test("saved Module Tags outrank a title that omits the subject and level", () => {
  const clues = inferCurriculumClues({
    module: {
      title: "Expansion and Factorisation of Quadratic Expressions using Identities Version 2",
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
    discoveryEvidence: {
      moduleText: "Students expand and factorise quadratic expressions using identities.",
    },
    sections: [],
  });

  assert.equal(clues.level, "Secondary 2");
  assert.equal(clues.subjectId, "mathematics");
  assert.deepEqual(clues.streams, ["G3"]);
  assert.deepEqual(clues.existingContentMaps, ["Sec 2 Mathematics (G3) (2020)"]);
  assert.equal(clues.evidenceSource, "saved SLS curriculum metadata");
  assert.deepEqual(
    rankContentMapOptions(
      ["Sec 2 Mathematics (G2) (2020)", "Sec 2 Mathematics (G3) (2020)"],
      clues,
    )[0].label,
    "Sec 2 Mathematics (G3) (2020)",
  );
});

test("saved Pre-U Physics Module Tags supply the exact live cascade", () => {
  const clues = inferCurriculumClues({
    module: {
      title: "Physics 8867 Paper 1 Best Practice",
      curriculumEvidence: {
        subject: "Physics - H2PHY",
        level: "Pre-U 1",
        contentMap: "Pre-U Physics (H2) - 2025"
      }
    },
    defaults: {
      subject: "Physics - H2PHY",
      level: "Pre-U 1",
      contentMap: "Pre-U Physics (H2) - 2025"
    },
    sections: []
  });

  assert.equal(clues.level, "Pre-U 1");
  assert.equal(clues.subjectId, "physics");
  assert.deepEqual(clues.existingContentMaps, ["Pre-U Physics (H2) - 2025"]);
  assert.equal(
    rankContentMapOptions(
      ["Pre-U Physics (H2) - 2024", "Pre-U Physics (H2) - 2025"],
      clues
    )[0].label,
    "Pre-U Physics (H2) - 2025"
  );
});
