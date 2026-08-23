import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyGeneratedGameTabEvidence,
  exactTeacherMatches,
  validateModuleAction
} from "../src/module-actions.mjs";

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

test("gamification evidence requires saved cards from both mounted tabs", () => {
  const evidence = classifyGeneratedGameTabEvidence({
    gameStories: {
      text: "Game Story Settings The Quest Begins CONDITIONS (1) EDIT PREVIEW",
      kebabs: 3
    },
    collectibles: {
      text: "Collectibles Settings Achievements Numeria's Rising Star CONDITIONS (1) EDIT PREVIEW",
      kebabs: 2
    }
  });

  assert.equal(evidence.gameStoriesPresent, true);
  assert.equal(evidence.collectiblesPresent, true);
  assert.equal(evidence.kebabs, 5);
  assert.equal(evidence.conditions, true);
});

test("gamification tab labels alone are not generated-content evidence", () => {
  const evidence = classifyGeneratedGameTabEvidence({
    gameStories: { text: "Details Experience Points Game Stories Collectibles Leaderboard", kebabs: 0 },
    collectibles: { text: "Details Experience Points Game Stories Collectibles Leaderboard", kebabs: 0 }
  });

  assert.equal(evidence.gameStoriesPresent, false);
  assert.equal(evidence.collectiblesPresent, false);
});
