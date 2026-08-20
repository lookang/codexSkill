import test from "node:test";
import assert from "node:assert/strict";
import { questionTagState, questionCarriesMap } from "../src/io.mjs";

// Card text exactly as the scan captured it from real modules.
const UNTAGGED = "Q1 Solve . Keyword Tags - Question Tags - Authoring Copilot";
const TAGGED =
  "Q1 Keyword Tags #FA_Math FAMath FA Math FA Mathematics Question Tags " +
  "Sec 1 Mathematics (G3) (2020) Authoring Copilot";

test("a question showing \"Question Tags -\" counts as untagged", () => {
  const state = questionTagState(UNTAGGED);
  assert.equal(state.alreadyTagged, false);
  assert.equal(state.questionTags, "-");
});

test("a question naming a content map counts as tagged", () => {
  const state = questionTagState(TAGGED);
  assert.equal(state.alreadyTagged, true);
  assert.match(state.questionTags, /Sec 1 Mathematics \(G3\) \(2020\)/);
});

test("keyword tags alone do not make a question tagged", () => {
  // FA-Math questions often carry keywords but no content map. Reading the keyword
  // field by mistake would make every FA question look tagged and skip them all.
  const state = questionTagState(
    "Q2 Keyword Tags #FA_Math FAMath FA Math Question Tags - Authoring Copilot"
  );
  assert.equal(state.alreadyTagged, false);
});

test("missing or empty card text is treated as untagged, not as an error", () => {
  assert.equal(questionTagState(undefined).alreadyTagged, false);
  assert.equal(questionTagState("").alreadyTagged, false);
  assert.equal(questionTagState("Q3 no tag section at all").alreadyTagged, false);
});

// The rule surgical tagging applies, kept here so the intent is pinned down:
// an FA-Math question is always in scope; anything else only when untagged.
const worthTagging = (isFeedbackAssistant, alreadyTagged) => isFeedbackAssistant || !alreadyTagged;

test("an FA-Math question is tagged even when it already carries tags", () => {
  assert.equal(worthTagging(true, true), true);
});

test("a non-FA question that a human already tagged is left alone", () => {
  assert.equal(worthTagging(false, true), false);
});

test("an untagged non-FA question is in scope", () => {
  // Whether it actually receives a tag is then decided by the mathematics in it,
  // so a reflective question still drops out.
  assert.equal(worthTagging(false, false), true);
});

// The section summary carries a trailing year that the question card does not, so
// a literal comparison would never match and every question would be re-tagged.
test("a question card matches the section's content map despite the trailing year", () => {
  assert.equal(
    questionCarriesMap("Sec 1 Mathematics (G2) (2020)", "Sec 1 Mathematics (G2) (2020) - 2020"),
    true
  );
});

test("a different content map on the question is not mistaken for a match", () => {
  assert.equal(
    questionCarriesMap("Sec 1 Mathematics (G1) (2028)", "Sec 1 Mathematics (G2) (2020) - 2020"),
    false
  );
});

test("an untagged question never counts as carrying the map", () => {
  assert.equal(questionCarriesMap("-", "Sec 1 Mathematics (G2) (2020) - 2020"), false);
  assert.equal(questionCarriesMap("", "Pri 1 Mathematics (2021)"), false);
  assert.equal(questionCarriesMap(undefined, "Pri 1 Mathematics (2021)"), false);
});
