import { chooseOutcome, tokenize } from "./outcome-chooser.mjs";
import { PLACEHOLDER_MARKER, levelForContentMap, subjectForContentMap } from "./io.mjs";

function normalizedTopic(title) {
  return [...tokenize(
    String(title)
      .replace(/\bAST\b/gi, " ")
      .replace(/\bFA[- ]?Maths?\b/gi, " ")
      .replace(/\bP(?:rimary)?\s*[1-6]\b/gi, " ")
  )].sort().join(" ");
}

function explicitPrimaryLevel(title) {
  const match = /\b(?:P|Primary\s*)([1-6])\b/i.exec(String(title));
  return match ? `Primary ${match[1]}` : null;
}

function isRealTaxonomy(taxonomy) {
  return (
    taxonomy?.contentMap &&
    !String(taxonomy.contentMap).includes(PLACEHOLDER_MARKER) &&
    Array.isArray(taxonomy.outcomes) &&
    taxonomy.outcomes.length > 0
  );
}

export function resolveCurriculumFromTaxonomies(config, taxonomies, options = {}) {
  const minScore = options.minScore ?? 1.2;
  const minMargin = options.minMargin ?? 0.25;
  const levelClue = explicitPrimaryLevel(config?.module?.title);
  const sectionEvidence = (config.sections ?? [])
    .flatMap((section) => [section.title, ...(section.activities ?? []).map((activity) => activity.title)])
    .join(" ");
  const moduleTopic = normalizedTopic(config?.module?.title);

  const candidates = taxonomies
    .filter(isRealTaxonomy)
    .map((taxonomy) => {
      const level = levelForContentMap(taxonomy.contentMap);
      if (levelClue && level !== levelClue) return null;

      const picked = chooseOutcome(
        taxonomy.outcomes,
        {
          moduleTitle: config.module.title,
          sectionTitle: sectionEvidence,
          questionText: ""
        },
        { threshold: 0, minMargin: 0 }
      );
      if (!picked?.outcomePath?.length || !Number.isFinite(picked.score)) return null;

      const leafTopic = normalizedTopic(picked.outcomePath.at(-1));
      const exactTopicBonus = moduleTopic && moduleTopic === leafTopic ? 0.5 : 0;
      const sectionScores = (config.sections ?? []).map((section) => {
        const sectionPick = chooseOutcome(
          taxonomy.outcomes,
          {
            moduleTitle: config.module.title,
            sectionTitle: section.title,
            questionText: (section.activities ?? []).map((activity) => activity.title).join(" ")
          },
          { threshold: 0, minMargin: 0 }
        );
        return sectionPick?.outcomePath?.length && Number.isFinite(sectionPick.score) ? sectionPick.score : 0;
      });
      const sectionAverage = sectionScores.length
        ? sectionScores.reduce((sum, score) => sum + score, 0) / sectionScores.length
        : 0;

      return {
        contentMap: taxonomy.contentMap,
        level,
        subject: subjectForContentMap(taxonomy.contentMap, config.defaults?.subject ?? "Mathematics - MATHS"),
        outcome: picked.outcome,
        outcomePath: picked.outcomePath,
        score: picked.score + exactTopicBonus + sectionAverage * 0.25,
        evidenceScore: picked.score,
        exactTopicBonus,
        sectionAverage
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const margin = best ? best.score - (runnerUp?.score ?? 0) : 0;
  if (!best || best.score < minScore || (runnerUp && margin < minMargin)) {
    return {
      resolved: false,
      reason: !best
        ? "no harvested taxonomy produced a content outcome"
        : best.score < minScore
          ? `best score ${best.score.toFixed(2)} is below ${minScore.toFixed(2)}`
          : `top taxonomies are too close (${best.score.toFixed(2)} vs ${runnerUp.score.toFixed(2)})`,
      candidates: candidates.slice(0, 5)
    };
  }

  return { resolved: true, ...best, margin, candidates: candidates.slice(0, 5) };
}

export function applyCurriculumResolution(config, resolution) {
  if (!resolution?.resolved) return config;
  const copy = structuredClone(config);
  const unresolved = (value) =>
    typeof value !== "string" || value === "" || value.includes(PLACEHOLDER_MARKER);

  if (unresolved(copy.defaults.subject)) copy.defaults.subject = resolution.subject;
  if (unresolved(copy.defaults.level)) copy.defaults.level = resolution.level;
  if (unresolved(copy.defaults.contentMap)) copy.defaults.contentMap = resolution.contentMap;
  if (unresolved(copy.defaults.outcome)) copy.defaults.outcome = resolution.outcome;
  if (!Array.isArray(copy.defaults.outcomePath) || copy.defaults.outcomePath.length === 0) {
    copy.defaults.outcomePath = resolution.outcomePath;
  }
  return copy;
}
