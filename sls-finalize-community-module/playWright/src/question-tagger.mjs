// Proposes a learning outcome for a single question by reading the mathematics in
// it and matching that against the harvested content maps.
//
// It only proposes when the answer is unambiguous. A tie means several outcomes
// fit the same operation equally well - typically a prose word problem whose
// operand types are never named - and a confident-looking wrong tag on a live
// module is worse than no tag at all. Ties are reported, not guessed.
import fs from "node:fs/promises";
import path from "node:path";
import { featureScore, looksMathematical, mathFeatures } from "./math-features.mjs";
import { chooseOutcome, tokenize } from "./outcome-chooser.mjs";

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

const REFLECTIVE_QUESTION =
  /\b(?:reflect(?:ion|ive)?|metacognit|confidence|suggested answer|next attempt|thinking strateg|what (?:did|will) i|how (?:did|does|could|will) (?:the )?(?:feedback|hint|strateg))\b/i;

export function isSubstantiveCurriculumQuestion(text, subject = "") {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || REFLECTIVE_QUESTION.test(clean)) return false;
  if (/math/i.test(String(subject ?? ""))) return looksMathematical(clean);
  return tokenize(clean).size >= 2;
}

// Quiz activities keep every question's complete stem in the right-side settings
// card even though the main canvas renders only the currently selected quiz page.
// This fallback deliberately stops before metadata fields so Question Tags and
// Authoring Copilot labels never become curriculum evidence.
export function questionStemFromSettingsCardText(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^Q\d+\s*/i, "")
    .split(/\b(?:Keyword Tags|Question Tags|Authoring Copilot)\b/i, 1)[0]
    .trim();
}

export function proposeQuestionTag(questionText, dictionaries, options = {}) {
  const {
    allowedContentMaps = null,
    contextText = "",
    reviewedOutcomePrefix = null
  } = options;
  const cleanQuestion = String(questionText ?? "").replace(/\s+/g, " ").trim();
  if (!cleanQuestion) {
    return {
      decision: "skip",
      reason: "question body contained no readable curriculum evidence",
      features: mathFeatures("")
    };
  }
  if (REFLECTIVE_QUESTION.test(cleanQuestion)) {
    return {
      decision: "skip",
      reason: "question body is reflective rather than a curriculum assessment",
      features: mathFeatures(cleanQuestion)
    };
  }

  const questionFeatures = mathFeatures(questionText || "");
  const pool = allowedContentMaps?.length
    ? dictionaries.filter((entry) =>
        allowedContentMaps.some((wanted) => entry.contentMap.toLowerCase() === wanted.toLowerCase())
      )
    : dictionaries;
  if (pool.length === 0) {
    return {
      decision: "skip",
      reason: "no harvested content map for this question's levels",
      features: questionFeatures
    };
  }

  // Mathematics benefits from the operation/operand matcher below. Other
  // subjects are often conceptual (for example, a Physics MCQ about Newton's
  // laws), so match the actual question words against outcomes from the already
  // constrained saved Content Map. Do this even when the stem contains a formula:
  // F=ma must not send a Physics question through the Mathematics-only scorer.
  const nonMathematicsMap = pool.every(
    (entry) => !/\bMathematics\b/i.test(String(entry.contentMap ?? ""))
  );
  if (nonMathematicsMap) {
    // A broad examination quiz can legitimately span most of a syllabus. Once a
    // human has reviewed each full stem and its answer choices, the config may
    // record the official syllabus item code (for example "17(f)"). Resolve that
    // code against the harvested live SLS wording instead of copying wording into
    // the config or letting a later lexical near-tie change the reviewed choice.
    if (reviewedOutcomePrefix) {
      const wanted = String(reviewedOutcomePrefix).trim().toLowerCase();
      const reviewed = pool.filter((entry) => {
        const outcome = String(entry.outcome ?? "").trim().toLowerCase();
        return outcome === wanted || outcome.startsWith(`${wanted} `);
      });
      if (reviewed.length !== 1) {
        return {
          decision: "skip",
          reason:
            `reviewed syllabus item "${reviewedOutcomePrefix}" matched ${reviewed.length} ` +
            "harvested outcomes; refusing to guess",
          candidates: reviewed,
          features: questionFeatures
        };
      }
      const matched = reviewed[0];
      return {
        decision: "tag",
        contentMap: matched.contentMap,
        outcome: matched.outcome,
        outcomePath: matched.outcomePath,
        score: null,
        tiedCount: 1,
        basis: "reviewed question-by-question syllabus mapping, validated against the harvested SLS content map",
        features: questionFeatures,
        evidence: {
          question: cleanQuestion,
          operations: [],
          operands: [],
          topics: [...tokenize(cleanQuestion)],
          contextTopics: [...tokenize(contextText)]
        }
      };
    }
    const picked = chooseOutcome(
      pool,
      { moduleTitle: contextText, sectionTitle: "", questionText: cleanQuestion },
      { threshold: 0.5, minMargin: 0.2 }
    );
    if (!picked?.outcomePath?.length) {
      return {
        decision: "skip",
        reason: picked?.reason ?? "no outcome matched the readable question body",
        features: questionFeatures,
        candidates: picked?.alternatives ?? []
      };
    }
    const matched = pool.find((entry) =>
      entry.outcome === picked.outcome &&
      JSON.stringify(entry.outcomePath) === JSON.stringify(picked.outcomePath)
    );
    return {
      decision: "tag",
      contentMap: matched?.contentMap ?? allowedContentMaps?.[0] ?? null,
      outcome: picked.outcome,
      outcomePath: picked.outcomePath,
      score: picked.score,
      tiedCount: 1,
      basis: "best question-body lexical match within the saved content map",
      features: questionFeatures,
      evidence: {
        question: cleanQuestion,
        operations: [],
        operands: [],
        topics: [...tokenize(cleanQuestion)],
        contextTopics: [...tokenize(contextText)]
      }
    };
  }

  // Context can disambiguate a real mathematical stem, but it must never invent
  // mathematics when SLS failed to expose the stem. That exact failure turned the
  // punctuation in "Length – Convert" into a fractions outcome.
  if (questionFeatures.operations.size === 0 && questionFeatures.topics.size === 0) {
    return {
      decision: "skip",
      reason: "question body contained no readable mathematical operation or topic",
      features: questionFeatures
    };
  }

  const contextFeatures = mathFeatures(contextText || "");
  const features = {
    clean: questionFeatures.clean,
    operations: new Set([...questionFeatures.operations, ...contextFeatures.operations]),
    operands: new Set([...questionFeatures.operands, ...contextFeatures.operands]),
    topics: new Set([...questionFeatures.topics, ...contextFeatures.topics])
  };
  // A named topic is evidence on its own. "Solve 8z = 11 - 2z" carries no operation
  // this extractor trusts - "-" is too often a hyphen to count as subtraction - but
  // it is unmistakably a linear equation to solve.
  if (features.operations.size === 0 && features.topics.size === 0) {
    return { decision: "skip", reason: "no mathematical operation or topic detected", features };
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

  let chosen = best;
  let basis = contextText ? "question-body match, disambiguated by activity context" : "best question-body feature match";
  if (tiedCount > 1) {
    const tied = ranked.filter((entry) => entry.score === best.score);
    return {
      decision: "skip",
      reason: `${tiedCount} outcomes tied on the readable question body`,
      tiedCount,
      candidates: tied.map(({ contentMap, outcome, outcomePath, score }) => ({
        contentMap, outcome, outcomePath, score
      })),
      features
    };
  }

  return {
    decision: "tag",
    contentMap: chosen.contentMap,
    outcome: chosen.outcome,
    outcomePath: chosen.outcomePath,
    score: chosen.score,
    tiedCount,
    basis,
    features,
    evidence: {
      question: questionFeatures.clean,
      operations: [...questionFeatures.operations],
      operands: [...questionFeatures.operands],
      topics: [...questionFeatures.topics],
      contextTopics: [...contextFeatures.topics]
    }
  };
}
