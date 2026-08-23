import assert from "node:assert/strict";
import test from "node:test";
import {
  applyModuleEvidenceToConfig,
  normalizeModuleCurriculumEvidence,
} from "../src/module-evidence.mjs";

const placeholder = "REVIEW-BEFORE-RUNNING: choose";
const liveEvidence = {
  subjectLevels: [{ subject: "Mathematics - G3MATHS", level: "Secondary 2" }],
  contentMaps: ["Sec 2 Mathematics (G3) (2020)"],
  moduleText: "By the end of the module, students expand and factorise quadratic expressions using identities.",
};

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
