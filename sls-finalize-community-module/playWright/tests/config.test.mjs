import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  activityRowCount,
  buildOutcomePaths,
  applyTargetUrl,
  detectScope,
  loadConfig,
  mergeDefaults,
  normalizeActivityRowTitle,
  normalizeSectionDisplayTitle,
  parseAdminModuleEditUrl,
  validateConfig, unreviewedPlaceholders} from "../src/io.mjs";
import { parseArgs } from "../src/cli.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, "..");

test("current P3 multiplication config is valid", async () => {
  const config = await loadConfig(
    path.join(projectRoot, "configs", "p3-multiplication-algorithms.json")
  );
  const merged = mergeDefaults(config);
  assert.equal(merged.sections.length, 5);
  assert.equal(merged.sections[0].contentMap, "Pri 3 Mathematics (2021)");
  assert.equal(merged.sections[0].activities[0].questionKeyword, "FA Math");
});

test("P4 internal-transfer config is valid and permits direct top-level outcome selection", async () => {
  const config = await loadConfig(
    path.join(projectRoot, "configs", "p4-internal-transfer-total-given.json")
  );
  const merged = mergeDefaults(config);
  assert.equal(merged.sections.length, 3);
  assert.deepEqual(merged.sections[0].outcomePath, []);
  assert.equal(merged.sections[0].activities[0].allowNoQuestions, true);
});

test("apply requires an explicit delete flag before originals are deleted", () => {
  const options = parseArgs(["apply"], projectRoot);
  assert.equal(options.deleteOriginals, false);
  assert.equal(options.authStatePath, path.join(projectRoot, ".auth", "sls-state.json"));
  assert.equal(parseArgs(["apply", "--delete-originals"], projectRoot).deleteOriginals, true);
});

test("a custom authentication state path can be supplied", () => {
  const options = parseArgs(["inspect", "--auth-state", "private/session.json"], projectRoot);
  assert.equal(options.authStatePath, path.join(projectRoot, "private", "session.json"));
});

test("discover is a supported read-only curriculum crawl mode", () => {
  const options = parseArgs(["discover"], projectRoot);
  assert.equal(options.mode, "discover");
  assert.equal(options.deleteOriginals, false);
});

test("inspect accepts an exact admin URL for another module", async () => {
  const config = mergeDefaults(await loadConfig(
    path.join(projectRoot, "configs", "p3-multiplication-algorithms.json")
  ));
  const targetId = "599900ec-8b2f-44ab-a8e5-573c6a00ff4a";
  const selected = applyTargetUrl(config, {
    mode: "inspect",
    targetUrl: `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${targetId}`
  });
  assert.equal(selected.module.id, targetId);
  assert.equal(selected.module.title, null);
});

test("apply refuses a URL that does not match the configuration", async () => {
  const config = mergeDefaults(await loadConfig(
    path.join(projectRoot, "configs", "p3-multiplication-algorithms.json")
  ));
  assert.throws(() => applyTargetUrl(config, {
    mode: "apply",
    targetUrl: "https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/599900ec-8b2f-44ab-a8e5-573c6a00ff4a"
  }), /Refusing to apply/);
});

test("public module and lesson URLs are converted to the admin edit route", () => {
  const moduleId = "475c8d69-c910-4c2c-9e57-fb9ddce1bf5b";
  const module = parseAdminModuleEditUrl(
    `https://vle.learning.moe.edu.sg/community-gallery/module/view/${moduleId}`
  );
  const lesson = parseAdminModuleEditUrl(
    `https://vle.learning.moe.edu.sg/community-gallery/lesson/view/${moduleId}/cover`
  );
  assert.equal(module.url, `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${moduleId}/module-plan`);
  assert.equal(module.adminEditUrl, `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`);
  assert.equal(lesson.url, module.url);
  assert.equal(module.converted, true);
});

test("activity and lesson URLs can be parsed for both scopes", () => {
  const moduleId = "475c8d69-c910-4c2c-9e57-fb9ddce1bf5b";
  const activity = parseAdminModuleEditUrl(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${moduleId}/section/96449075/activity/109256511`,
    { scope: "activity" }
  );
  const lesson = parseAdminModuleEditUrl(
    `https://vle.learning.moe.edu.sg/community-gallery/lesson/view/${moduleId}/cover`
  );
  assert.equal(activity.url, `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${moduleId}/module-plan`);
  assert.equal(activity.adminEditUrl, `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`);
  assert.equal(lesson.url, activity.url);

});

test("section edit URLs with browser query parameters are accepted by every launcher", () => {
  const moduleId = "428156f1-90f1-4b64-865f-66b354b5501f";
  const target = parseAdminModuleEditUrl(
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/section/76768032?pageNo=1`
  );
  assert.equal(target.id, moduleId);
  assert.equal(target.scope, "activity");
  assert.equal(
    target.url,
    `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${moduleId}/module-plan`
  );
});

test("non-SLS URLs are rejected", () => {
  assert.throws(() => parseAdminModuleEditUrl("https://example.com/module/view/abc"), /SLS Community Gallery/);
});

test("config rejects a non-admin or non-SLS URL", () => {
  const invalid = {
    schemaVersion: 1,
    module: {
      id: "abc",
      title: "Example",
      adminEditUrl: "https://example.com/admin/community-gallery/module/edit/abc"
    },
    defaults: {
      subject: "Mathematics",
      level: "Primary 3",
      contentMap: "Map",
      outcomePath: ["Branch"],
      outcome: "Outcome",
      questionKeyword: "FA Math"
    },
    sections: [{ label: "A", title: "Title", activities: [{ title: "Activity" }] }]
  };
  assert.throws(() => validateConfig(invalid), /vle\.learning\.moe\.edu\.sg/);
});

test("detectScope classifies module, lesson, and activity URLs without throwing", () => {
  const moduleId = "aa9e13e8-9a47-4c1c-ae1c-40268ce42935";
  assert.equal(
    detectScope(`https://vle.learning.moe.edu.sg/community-gallery/module/view/${moduleId}`),
    "module"
  );
  assert.equal(
    detectScope(`https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}`),
    "module"
  );
  assert.equal(
    detectScope(`https://vle.learning.moe.edu.sg/community-gallery/lesson/view/${moduleId}/cover`),
    "module"
  );
  assert.equal(
    detectScope(
      `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${moduleId}/section/96449075/activity/109256511`
    ),
    "activity"
  );
});

test("detectScope returns module for unparseable input instead of throwing", () => {
  assert.equal(detectScope("not-a-url"), "module");
  assert.equal(detectScope("   "), "module");
});

test("the one-shot launcher path accepts a public module view URL end to end", () => {
  const supplied = "https://vle.learning.moe.edu.sg/community-gallery/module/view/aa9e13e8-9a47-4c1c-ae1c-40268ce42935";
  const scope = detectScope(supplied);
  const target = parseAdminModuleEditUrl(supplied, { scope });
  assert.equal(scope, "module");
  assert.equal(target.id, "aa9e13e8-9a47-4c1c-ae1c-40268ce42935");
  assert.equal(target.converted, true);
  assert.equal(
    target.url,
    "https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/aa9e13e8-9a47-4c1c-ae1c-40268ce42935/module-plan"
  );
});

test("a section heading sharing its activity title is discounted from row counts", () => {
  const shared = "Familiarisation with FA-Math (Part 2)";
  // heading + original + copy-not-matching-exactly -> one real activity
  assert.equal(activityRowCount(2, shared, shared), 1);
  // after the original is deleted only the heading remains -> zero activities
  assert.equal(activityRowCount(1, shared, shared), 0);
  // never goes negative
  assert.equal(activityRowCount(0, shared, shared), 0);
});

test("row counts are untouched when the activity and section titles differ", () => {
  assert.equal(activityRowCount(1, "Question 2A", "Practice A"), 1);
  assert.equal(activityRowCount(0, "Question 2A", "Practice A"), 0);
  assert.equal(activityRowCount(2, "Question 2A", null), 2);
});

test("numbered SLS sidebar activity labels match clean configured titles", () => {
  assert.equal(
    normalizeActivityRowTitle("1. Express a part of a whole as a percentage"),
    "Express a part of a whole as a percentage"
  );
  assert.equal(
    normalizeActivityRowTitle("5.\tExpressing a percentage as a decimal."),
    "Expressing a percentage as a decimal."
  );
});

test("SLS section headings may carry both letter and author numbering", () => {
  assert.equal(
    normalizeSectionDisplayTitle("E. 5. Expressing a percentage as a decimal."),
    "Expressing a percentage as a decimal."
  );
  assert.equal(normalizeSectionDisplayTitle("A. Percentages"), "Percentages");
});

test("outcome paths are rebuilt from the flat, padding-indented tagging tree", () => {
  // Shape observed in SLS for Pri 5 Mathematics (2021).
  const rows = [
    { text: "Acquire mathematical concepts", depth: 0, isOutcome: true },
    { text: "Number and Algebra", depth: 0, isOutcome: false },
    { text: "Whole Numbers", depth: 1, isOutcome: false },
    { text: "Four Operations", depth: 2, isOutcome: false },
    { text: "2.2 order of operations without calculator", depth: 3, isOutcome: true },
    { text: "Fractions", depth: 1, isOutcome: false },
    { text: "Four operations", depth: 2, isOutcome: false },
    { text: "2.1 adding and subtracting mixed numbers", depth: 3, isOutcome: true }
  ];
  assert.deepEqual(buildOutcomePaths(rows), [
    { outcome: "Acquire mathematical concepts", outcomePath: [] },
    {
      outcome: "2.2 order of operations without calculator",
      outcomePath: ["Number and Algebra", "Whole Numbers", "Four Operations"]
    },
    {
      outcome: "2.1 adding and subtracting mixed numbers",
      outcomePath: ["Number and Algebra", "Fractions", "Four operations"]
    }
  ]);
});

test("unreviewedPlaceholders finds scaffolded values a write pass must not use", () => {
  const config = {
    defaults: { subject: "Mathematics - MATHS", level: "REVIEW-BEFORE-RUNNING: set the level" },
    sections: [
      { label: "A", outcome: "Adding within 100" },
      { label: "B", outcome: "REVIEW-BEFORE-RUNNING: paste the outcome" }
    ]
  };
  assert.deepEqual(unreviewedPlaceholders(config), ["defaults.level", "section B.outcome"]);
});

test("unreviewedPlaceholders passes a fully reviewed config", () => {
  const config = {
    defaults: { level: "Primary 4", contentMap: "Pri 4 Mathematics (2021)" },
    sections: [{ label: "A", outcome: "Adding within 100" }]
  };
  assert.deepEqual(unreviewedPlaceholders(config), []);
});
