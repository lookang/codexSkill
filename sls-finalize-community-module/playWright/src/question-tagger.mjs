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

// A Primary examination module can deliberately carry several saved
// Subject/Level rows because its questions assess learning from earlier years.
// Those saved rows are authoritative eligibility evidence; the section's single
// default Content Map is not. Keep this Primary/Mathematics-specific so ambiguous
// Secondary streams are still governed by explicitly configured content maps.
export function primaryMathematicsMapsFromModuleEvidence(moduleEvidence = {}) {
  const maps = [];
  for (const entry of moduleEvidence.subjectLevels ?? []) {
    if (!/mathematics/i.test(String(entry?.subject ?? ""))) continue;
    const contentMap = levelToContentMap(entry?.level);
    if (contentMap) maps.push(contentMap);
  }
  return [...new Set(maps)];
}

export function questionContentMapGroups(configuredMaps = [], eligiblePrimaryMaps = []) {
  const explicit = [...new Set(configuredMaps.filter(Boolean))];
  if (explicit.length > 0) return explicit.map((contentMap) => [contentMap]);
  const primary = [...new Set(eligiblePrimaryMaps.filter(Boolean))];
  return primary.length > 0 ? [primary] : [];
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
        features: mathFeatures(`${outcome.outcomePath.join(" ")} ${outcome.outcome}`),
        leafFeatures: mathFeatures(outcome.outcome)
      });
    }
  }
  cache = entries;
  return entries;
}

const REFLECTIVE_QUESTION =
  /\b(?:reflect(?:ion|ive)?|metacognit|confidence|suggested answer|next attempt|thinking strateg|what (?:did|will) i|how (?:did|does|could|will) (?:the )?(?:feedback|hint|strateg))\b/i;

function primaryActivityOperations(text = "") {
  const clean = String(text);
  const operations = new Set();
  if (/\bjoining\b|\bfinding (?:the )?whole\b|\bstart\s*\+\s*change\b/i.test(clean)) {
    operations.add("add");
  }
  if (
    /\bseparating\b|\bfinding (?:the )?part\b|\bcomparison\b|\bend\s*[-−]\s*(?:start|change)\b/i.test(clean)
  ) {
    operations.add("subtract");
  }
  return operations;
}

function readableNumberStory(text = "") {
  const values = [...String(text).matchAll(/\b\d+(?:\.\d+)?\b/g)].map((match) => Number(match[0]));
  return new Set(values.filter(Number.isFinite)).size >= 2;
}

export function isSubstantiveCurriculumQuestion(text, subject = "", contextText = "") {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean || REFLECTIVE_QUESTION.test(clean)) return false;
  if (/math/i.test(String(subject ?? ""))) {
    return looksMathematical(clean) || (
      readableNumberStory(clean) && primaryActivityOperations(contextText).size > 0
    );
  }
  return tokenize(clean).size >= 2;
}

function primaryOneArithmeticFallback(pool, features, questionFeatures, contextText) {
  const maps = [...new Set(pool.map((entry) => entry.contentMap))];
  if (maps.length !== 1 || !/^Pri 1 Mathematics \(2021\)$/i.test(maps[0])) return null;

  const operations = new Set([
    ...features.operations,
    ...primaryActivityOperations(contextText)
  ]);
  if (![...operations].some((operation) => operation === "add" || operation === "subtract")) {
    return null;
  }
  if (!readableNumberStory(questionFeatures.clean)) return null;

  const additionSubtraction = pool.filter((entry) =>
    entry.outcomePath?.some((part) => /^Addition and subtraction$/i.test(String(part)))
  );
  if (additionSubtraction.length === 0) return null;

  const numbers = [...new Set(
    [...questionFeatures.clean.matchAll(/\b\d+(?:\.\d+)?\b/g)]
      .map((match) => Number(match[0]))
      .filter(Number.isFinite)
  )];
  const allWithin20 = numbers.length >= 2 && numbers.every((value) => value >= 0 && value <= 20);
  const moreThanTwoOneDigit =
    operations.size === 1 && operations.has("add") && numbers.length > 2 && numbers.every((value) => value < 10);

  let pattern = null;
  if (/\balgorithms?\b/i.test(contextText)) pattern = /^2\.6\b/i;
  else if (moreThanTwoOneDigit) pattern = /^2\.4\b/i;
  else if (allWithin20) pattern = /^2\.7\b/i;
  else if (numbers.every((value) => value >= 0 && value <= 100)) pattern = /^2\.5\b/i;
  if (!pattern) return null;

  const matches = additionSubtraction.filter((entry) => pattern.test(String(entry.outcome)));
  return matches.length === 1 ? matches[0] : null;
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
    moduleOutcomeReferences = [],
    reviewedOutcomePrefix = null,
    supportingText = ""
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
  let pool = allowedContentMaps?.length
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

  // Saved Module Tags are the teacher-authored curriculum boundary for this
  // module. When exact selected outcomes are available, a question may choose
  // only among those outcomes; the activity/question evidence still decides
  // which one. Previously these references were only a tie-breaker, which let a
  // locally strong but out-of-scope Algebra outcome beat the module's selected
  // Calculus outcomes.
  let moduleReferenceRestricted = false;
  if (moduleOutcomeReferences.length > 0) {
    const normal = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
    const restricted = pool.filter((entry) => moduleOutcomeReferences.some((reference) => {
      if (normal(reference?.contentMap) !== normal(entry.contentMap)) return false;
      if (normal(reference?.outcome) !== normal(entry.outcome)) return false;
      if (!Array.isArray(reference?.outcomePath) || reference.outcomePath.length === 0) return true;
      return JSON.stringify(reference.outcomePath.map(normal)) ===
        JSON.stringify((entry.outcomePath ?? []).map(normal));
    }));
    if (restricted.length === 0) {
      return {
        decision: "skip",
        reason:
          "the exact selected Module Tag outcomes did not match the harvested outcomes for this question's content map",
        features: questionFeatures
      };
    }
    pool = restricted;
    moduleReferenceRestricted = true;
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
        basis:
          "reviewed question-by-question syllabus mapping, validated against the harvested SLS content map" +
          (moduleReferenceRestricted ? " and the teacher-selected Module Tag outcomes" : ""),
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
      basis:
        "best question-body lexical match within the saved content map" +
        (moduleReferenceRestricted ? " and the teacher-selected Module Tag outcomes" : ""),
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

  const contextFeatures = mathFeatures(contextText || "");
  for (const operation of primaryActivityOperations(contextText)) {
    contextFeatures.operations.add(operation);
  }
  // Context can disambiguate a readable Primary number story, but it must never
  // invent mathematics when SLS failed to expose the stem. That exact failure
  // turned the punctuation in "Length – Convert" into a fractions outcome.
  const contextBackedPrimaryStory =
    readableNumberStory(questionFeatures.clean) && contextFeatures.operations.size > 0;
  if (
    questionFeatures.operations.size === 0 &&
    questionFeatures.topics.size === 0 &&
    !contextBackedPrimaryStory
  ) {
    return {
      decision: "skip",
      reason: "primary question evidence contained no readable mathematical operation or topic",
      features: questionFeatures
    };
  }

  const supportingFeatures = mathFeatures(supportingText || "");
  // A suggested answer may confirm the operation or representation used, but it
  // cannot create a topic that the stem/shared stimulus/activity context never
  // mentions. This keeps a bare numerical answer from turning an unreadable stem
  // into a confident curriculum tag.
  const primaryTopics = new Set([...questionFeatures.topics, ...contextFeatures.topics]);
  const sameDomainSupportingTopics = new Set();
  if (primaryTopics.has("differentiation")) {
    for (const topic of ["product rule", "quotient rule", "chain rule", "second derivative"]) {
      if (supportingFeatures.topics.has(topic)) sameDomainSupportingTopics.add(topic);
    }
  }
  if (primaryTopics.has("integration")) {
    for (const topic of ["definite integral", "area under curve"]) {
      if (supportingFeatures.topics.has(topic)) sameDomainSupportingTopics.add(topic);
    }
  }
  const corroboratedSupportingTopics = [...supportingFeatures.topics]
    .filter((topic) => primaryTopics.has(topic) || sameDomainSupportingTopics.has(topic));
  const features = {
    clean: questionFeatures.clean,
    operations: new Set([
      ...questionFeatures.operations,
      ...contextFeatures.operations,
      ...supportingFeatures.operations
    ]),
    operands: new Set([
      ...questionFeatures.operands,
      ...contextFeatures.operands,
      ...supportingFeatures.operands
    ]),
    topics: new Set([...primaryTopics, ...corroboratedSupportingTopics])
  };
  // A named topic is evidence on its own. "Solve 8z = 11 - 2z" carries no operation
  // this extractor trusts - "-" is too often a hyphen to count as subtraction - but
  // it is unmistakably a linear equation to solve.
  if (features.operations.size === 0 && features.topics.size === 0) {
    return { decision: "skip", reason: "no mathematical operation or topic detected", features };
  }

  // When the question itself exposes a specialised representation, it outranks
  // the activity-title prior.  Thus axis OCR from a parabola can funnel into the
  // quadratic-graph branch, while a genuine stem that explicitly says "matrix"
  // still overrides a broad or mixed activity title.
  const primarySpecialisedTopics = ["matrix", "function graph"]
    .filter((topic) => questionFeatures.topics.has(topic));
  const calculusIntent = (questionFeatures.topics.has("differentiation") ||
      questionFeatures.topics.has("integration"))
    ? questionFeatures.topics
    : contextFeatures.topics;
  const ranked = pool
    .filter((entry) =>
      primarySpecialisedTopics.every((topic) => entry.features.topics.has(topic))
    )
    .filter((entry) => {
      // The shared SLS parent branch is literally "Differentiation and
      // integration", so path-derived features put both words on every leaf.
      // Compare the question's primary Calculus intent with the leaf wording to
      // keep differentiation questions out of Integration outcomes and vice
      // versa.
      const leafTopics = entry.leafFeatures?.topics ?? mathFeatures(entry.outcome).topics;
      if (calculusIntent.has("differentiation") && !calculusIntent.has("integration")) {
        return !leafTopics.has("integration");
      }
      if (calculusIntent.has("integration") && !calculusIntent.has("differentiation")) {
        return leafTopics.has("integration") || !leafTopics.has("differentiation");
      }
      return true;
    })
    .map((entry) => ({ ...entry, score: featureScore(features, entry.features) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) {
    const fallback = primaryOneArithmeticFallback(pool, features, questionFeatures, contextText);
    if (fallback) {
      return {
        decision: "tag",
        contentMap: fallback.contentMap,
        outcome: fallback.outcome,
        outcomePath: fallback.outcomePath,
        score: null,
        tiedCount: 1,
        basis: "best-fit Primary 1 arithmetic outcome from a readable number story and explicit activity structure",
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
    return { decision: "skip", reason: "no outcome matched the mathematics", features };
  }

  const best = ranked[0];
  const topTied = ranked.filter((entry) => entry.score === best.score);
  let tiedCount = topTied.length;

  const chosen = best;
  const supportingUsed = Boolean(
    supportingText &&
    (supportingFeatures.operations.size > 0 ||
      supportingFeatures.operands.size > 0 ||
      corroboratedSupportingTopics.length > 0)
  );
  let basis = contextText
    ? "primary question evidence, disambiguated by activity context"
    : "best primary-question feature match";
  if (supportingUsed) basis += ", corroborated by the suggested answer";
  if (moduleReferenceRestricted) basis += ", restricted to the teacher-selected Module Tag outcomes";
  if (tiedCount > 1) {
    const tied = topTied;
    const fallback = primaryOneArithmeticFallback(pool, features, questionFeatures, contextText);
    if (fallback) {
      return {
        decision: "tag",
        contentMap: fallback.contentMap,
        outcome: fallback.outcome,
        outcomePath: fallback.outcomePath,
        score: null,
        tiedCount: 1,
        basis: "best-fit Primary 1 arithmetic outcome from a readable number story and explicit activity structure",
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
    return {
      decision: "skip",
      reason: `${tiedCount} outcomes tied on the readable primary question evidence`,
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
      contextTopics: [...contextFeatures.topics],
      supportingAnswer: supportingFeatures.clean,
      supportingOperations: [...supportingFeatures.operations],
      supportingOperands: [...supportingFeatures.operands],
      supportingTopics: corroboratedSupportingTopics
    }
  };
}
