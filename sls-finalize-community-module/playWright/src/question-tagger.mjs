// Proposes a learning outcome for a single question by reading the mathematics in
// it and matching that against the harvested content maps.
//
// It only proposes when the answer is unambiguous. A tie means several outcomes
// fit the same operation equally well - typically a prose word problem whose
// operand types are never named - and a confident-looking wrong tag on a live
// module is worse than no tag at all. Ties are reported, not guessed.
import fs from "node:fs/promises";
import path from "node:path";
import { featureScore, mathFeatures } from "./math-features.mjs";

let cache = null;

export function levelToContentMap(level) {
  const match = /Primary\s*([1-6])/i.exec(level || "");
  return match ? `Pri ${match[1]} Mathematics (2021)` : null;
}

// Lets a run that has just harvested a new content map pick it up without
// restarting.
export function resetDictionaries() {
  cache = null;
}

export async function loadDictionaries(root) {
  if (cache) return cache;
  const dir = path.join(root, "taxonomy");
  const files = (await fs.readdir(dir).catch(() => [])).filter((name) => name.endsWith(".json"));
  const entries = [];
  for (const file of files) {
    const data = JSON.parse(await fs.readFile(path.join(dir, file), "utf8").catch(() => "null"));
    if (!data?.outcomes) continue;
    const contentMap = data.contentMap || file.replace(/\.json$/, "");
    // A taxonomy filed under a scaffolded placeholder name is not a syllabus, it is
    // the leftovers of a run that harvested before the real content map was known.
    // Left in, it answers for any config still holding that placeholder and hands
    // questions outcomes from an unrelated subject.
    if (contentMap.includes("REVIEW-BEFORE-RUNNING")) continue;
    for (const outcome of data.outcomes) {
      if (!outcome.outcomePath?.length) continue; // dispositional, not content
      entries.push({
        contentMap,
        outcome: outcome.outcome,
        outcomePath: outcome.outcomePath,
        features: mathFeatures(`${outcome.outcomePath.join(" ")} ${outcome.outcome}`)
      });
    }
  }
  cache = entries;
  return entries;
}

export function proposeQuestionTag(questionText, dictionaries, options = {}) {
  const { allowedContentMaps = null, previousChoices = [] } = options;
  const features = mathFeatures(questionText || "");
  // A named topic is evidence on its own. "Solve 8z = 11 - 2z" carries no operation
  // this extractor trusts - "-" is too often a hyphen to count as subtraction - but
  // it is unmistakably a linear equation to solve.
  if (features.operations.size === 0 && features.topics.size === 0) {
    return { decision: "skip", reason: "no mathematical operation or topic detected", features };
  }

  const pool = allowedContentMaps?.length
    ? dictionaries.filter((entry) =>
        allowedContentMaps.some((wanted) => entry.contentMap.toLowerCase() === wanted.toLowerCase())
      )
    : dictionaries;
  if (pool.length === 0) {
    return { decision: "skip", reason: "no harvested content map for this question's levels", features };
  }

  const ranked = pool
    .map((entry) => ({ ...entry, score: featureScore(features, entry.features) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    return { decision: "skip", reason: "no outcome matched the mathematics", features };
  }

  const best = ranked[0];
  const tiedCount = ranked.filter((entry) => entry.score === best.score).length;

  // On a tie, prefer an outcome already chosen for an earlier question in the same
  // activity. Sibling questions in one practice set almost always assess the same
  // skill, so that is better evidence than the ranking order, and it keeps a set
  // of questions tagged consistently rather than scattered across near-identical
  // outcomes.
  let chosen = best;
  let basis = "best feature match";
  if (tiedCount > 1) {
    const tied = ranked.filter((entry) => entry.score === best.score);
    const familiar = tied.find((entry) =>
      previousChoices.some(
        (prior) => prior.outcome === entry.outcome && prior.contentMap === entry.contentMap
      )
    );
    if (familiar) {
      chosen = familiar;
      basis = "matches an earlier question in this activity";
    } else {
      basis = `best of ${tiedCount} equally good matches`;
    }
  }

  return {
    decision: "tag",
    contentMap: chosen.contentMap,
    outcome: chosen.outcome,
    outcomePath: chosen.outcomePath,
    score: chosen.score,
    tiedCount,
    basis,
    features
  };
}
