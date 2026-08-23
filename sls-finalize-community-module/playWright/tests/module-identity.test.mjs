import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeModuleIdentityText,
  visiblePageContainsModuleTitle,
} from "../src/module-identity.mjs";

const coreTitle =
  "Expansion and Factorisation of Quadratic Expressions using Identities Version 2";

test("a saved SLS subject and level prefix does not hide the configured core title", () => {
  assert.equal(
    visiblePageContainsModuleTitle(
      coreTitle,
      `COMMUNITY GALLERY Mathematics - G3MATHS Secondary 2 ${coreTitle} FEATURED`,
    ),
    true,
  );
});

test("module title verification tolerates punctuation and whitespace differences", () => {
  assert.equal(
    visiblePageContainsModuleTitle(
      "Fractions & Decimals - FA Math",
      "Fractions and Decimals\n\nFractions & Decimals — FA Math",
    ),
    true,
  );
  assert.equal(normalizeModuleIdentityText("Version 2 — G3"), "version 2 g3");
});

test("a different visible module title is still rejected", () => {
  assert.equal(
    visiblePageContainsModuleTitle(
      coreTitle,
      "Mathematics - G3MATHS Secondary 2 Linear Equations and Inequalities",
    ),
    false,
  );
});
