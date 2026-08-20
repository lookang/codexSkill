import test from "node:test";
import assert from "node:assert/strict";
import { exactTeacherMatches, validateModuleAction } from "../src/module-actions.mjs";

const validGamification = {
  recipe: "Fantasy Hero Journey",
  instructions: "Create an age-appropriate mathematics quest.",
  title: "Multiplication Algorithm Quest",
  shortTitle: "Multiplication Quest",
  description: "Practise multiplication algorithms."
};

test("gamification action requires reviewed generation settings", () => {
  assert.doesNotThrow(() => validateModuleAction("gamify", { gamification: validGamification }));
  assert.throws(() => validateModuleAction("gamify", {}), /reviewed gamification block/);
});

test("teacher matching accepts only the exact directory spelling", () => {
  assert.deepEqual(
    exactTeacherMatches(["Wee Loo Kang", "WEE LOO KANG", "Wee Loo Kang (ETD)"]),
    ["Wee Loo Kang"]
  );
});

test("unknown module actions are rejected", () => {
  assert.throws(() => validateModuleAction("publish", {}), /Unknown module action/);
});
