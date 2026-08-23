import { chooseOutcome, tokenize } from "./outcome-chooser.mjs";
import { PLACEHOLDER_MARKER, levelForContentMap, subjectForContentMap } from "./io.mjs";
import {
  contentMapMatchesClues,
  contentMapSupportsLevel,
  inferCurriculumClues
} from "./curriculum-discovery.mjs";

function normalizedTopic(title) {
  return [...tokenize(
    String(title)
      .replace(/\bAST\b/gi, " ")
      .replace(/\bFA[- ]?Maths?\b/gi, " ")
      .replace(/\bP(?:rimary)?\s*[1-6]\b/gi, " ")
  )].sort().join(" ");
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
  const clues = inferCurriculumClues(config);
  const questionEvidence = String(
    options.questionText ?? config.discoveryEvidence?.questionText ?? ""
  ).trim();
  const levelClue = clues.level;
  // Feed only actual section titles into chooseOutcome's sectionTitle field.
  // Activity names such as "Success Criteria" are process/orientation signals;
  // putting one of them into the combined section title incorrectly marks the
  // entire module as reflective and suppresses otherwise strong mathematics.
  // Activity titles remain available in the per-section questionText evidence.
  const sectionEvidence = (config.sections ?? [])
    .map((section) => section.title)
    .join(" ");
  const moduleTopic = normalizedTopic(config?.module?.title);
  const moduleEvidence = [
    config?.module?.title,
    config?.module?.description,
    config?.discoveryEvidence?.moduleDescription,
    config?.discoveryEvidence?.moduleText,
  ].filter(Boolean).join(" ");

  // A saved module-level Content Map is authoritative syllabus identity. Rank
  // outcomes only inside that map instead of allowing a title match to move the
  // module into another level or stream.
  const savedModuleContentMap = String(
    config?.module?.curriculumEvidence?.contentMap ?? ""
  ).trim();
  const taxonomiesInScope = savedModuleContentMap
    ? taxonomies.filter(
        (taxonomy) =>
          String(taxonomy?.contentMap ?? "").toLocaleLowerCase() ===
          savedModuleContentMap.toLocaleLowerCase(),
      )
    : taxonomies;

  const candidates = taxonomiesInScope
    .filter(isRealTaxonomy)
    .map((taxonomy) => {
      const inferredLevel = levelForContentMap(taxonomy.contentMap);
      if (levelClue && !contentMapSupportsLevel(taxonomy.contentMap, levelClue)) return null;
      const level = levelClue ?? inferredLevel;
      if (clues.subjectId && !contentMapMatchesClues(taxonomy.contentMap, clues)) return null;

      const picked = chooseOutcome(
        taxonomy.outcomes,
        {
          moduleTitle: moduleEvidence,
          sectionTitle: sectionEvidence,
          questionText: questionEvidence
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
            moduleTitle: moduleEvidence,
            sectionTitle: section.title,
            questionText: [
              ...(section.activities ?? []).map((activity) => activity.title),
              questionEvidence
            ].filter(Boolean).join(" ")
          },
          { threshold: 0, minMargin: 0 }
        );
        return sectionPick?.outcomePath?.length && Number.isFinite(sectionPick.score) ? sectionPick.score : 0;
      });
      const sectionAverage = sectionScores.length
        ? sectionScores.reduce((sum, score) => sum + score, 0) / sectionScores.length
        : 0;

      const explicitClueBonus = clues.level && clues.subjectId && clues.streams.length > 0 ? 0.3 : 0;
      const existingContentMapBonus = (clues.existingContentMaps ?? [])
        .some((entry) => String(entry).toLocaleLowerCase() === String(taxonomy.contentMap).toLocaleLowerCase())
        ? 4
        : 0;
      return {
        contentMap: taxonomy.contentMap,
        level,
        subject: taxonomy.subject ?? subjectForContentMap(taxonomy.contentMap, config.defaults?.subject ?? "Mathematics - MATHS"),
        outcome: picked.outcome,
        outcomePath: picked.outcomePath,
        score: picked.score + exactTopicBonus + sectionAverage * 0.25 + explicitClueBonus + existingContentMapBonus,
        evidenceScore: picked.score,
        exactTopicBonus,
        sectionAverage,
        explicitClueBonus,
        existingContentMapBonus,
        questionEvidenceUsed: Boolean(questionEvidence),
        syllabusYear: contentMapYear(taxonomy.contentMap)
      };
    })
    .filter(Boolean);

  const preferredYear = preferredSyllabusYear(config, candidates, options.currentYear);
  const distinctYears = new Set(candidates.map((candidate) => candidate.syllabusYear).filter(Boolean));
  for (const candidate of candidates) {
    candidate.activeSyllabusBonus =
      distinctYears.size > 1 && candidate.syllabusYear === preferredYear ? 0.3 : 0;
    candidate.score += candidate.activeSyllabusBonus;
  }
  candidates
    .sort((a, b) => b.score - a.score);

  const best = candidates[0] ?? null;
  const runnerUp = candidates[1] ?? null;
  const margin = best ? best.score - (runnerUp?.score ?? 0) : 0;
  const streamResolution = resolveExplicitStreams(candidates, clues);
  if (streamResolution) {
    return {
      resolved: true,
      ...streamResolution,
      margin,
      candidates: candidates.slice(0, 5)
    };
  }
  if (!best || best.score < minScore || (runnerUp && margin < minMargin)) {
    return {
      resolved: false,
      reason: !best
        ? savedModuleContentMap
          ? `the saved Module Tag ${savedModuleContentMap} has no harvested outcomes`
          : "no harvested taxonomy produced a content outcome"
        : best.score < minScore
          ? `best score ${best.score.toFixed(2)} is below ${minScore.toFixed(2)}`
          : `top taxonomies are too close (${best.score.toFixed(2)} vs ${runnerUp.score.toFixed(2)})`,
      candidates: candidates.slice(0, 5)
    };
  }

  return {
    resolved: true,
    ...best,
    margin,
    constrainedBySavedModuleContentMap: Boolean(savedModuleContentMap),
    candidates: candidates.slice(0, 5),
  };
}

function contentMapYear(contentMap) {
  const years = [...String(contentMap ?? "").matchAll(/\b(20\d{2})\b/g)];
  return years.length ? Number(years.at(-1)[1]) : null;
}

function preferredSyllabusYear(config, candidates, suppliedCurrentYear) {
  const explicit = /\b(20\d{2})\b/.exec(String(config?.module?.title ?? ""));
  if (explicit) return Number(explicit[1]);
  const currentYear = Number.isInteger(suppliedCurrentYear)
    ? suppliedCurrentYear
    : new Date().getFullYear();
  const active = candidates
    .map((candidate) => candidate.syllabusYear)
    .filter((year) => Number.isInteger(year) && year <= currentYear)
    .sort((a, b) => b - a);
  return active[0] ?? null;
}

export function applyCurriculumResolution(config, resolution) {
  if (!resolution?.resolved) return config;
  const copy = structuredClone(config);
  const unresolved = (value) =>
    typeof value !== "string" || value === "" || value.includes(PLACEHOLDER_MARKER);

  const clues = inferCurriculumClues(copy);
  const genericMathFallback =
    clues.subjectId === "additional-mathematics" &&
    /^Mathematics\s*-\s*MATHS$/i.test(String(copy.defaults.subject ?? "")) &&
    /Additional Mathematics/i.test(String(resolution.subject ?? ""));
  if (unresolved(copy.defaults.subject) || genericMathFallback) copy.defaults.subject = resolution.subject;
  if (unresolved(copy.defaults.level)) copy.defaults.level = resolution.level;
  if (unresolved(copy.defaults.contentMap)) copy.defaults.contentMap = resolution.contentMap;
  if (unresolved(copy.defaults.outcome)) copy.defaults.outcome = resolution.outcome;
  if (!Array.isArray(copy.defaults.outcomePath) || copy.defaults.outcomePath.length === 0) {
    copy.defaults.outcomePath = resolution.outcomePath;
  }
  if (Array.isArray(resolution.contentMaps) && resolution.contentMaps.length > 1) {
    if (!Array.isArray(copy.defaults.contentMaps) || copy.defaults.contentMaps.length === 0) {
      copy.defaults.contentMaps = resolution.contentMaps;
    }
    for (const section of copy.sections ?? []) {
      if (!Array.isArray(section.contentMaps) || section.contentMaps.length === 0) {
        section.contentMaps = resolution.contentMaps;
      }
    }
  }
  return copy;
}

function resolveExplicitStreams(candidates, clues) {
  if ((clues.streams ?? []).length < 2) return null;
  const selected = [];
  for (const stream of clues.streams) {
    const matches = candidates.filter((candidate) =>
      new RegExp(`\\(${stream}\\)|\\b${stream}`, "i").test(candidate.contentMap)
    );
    if (matches.length !== 1) return null;
    selected.push(matches[0]);
  }
  const outcomes = new Set(selected.map((candidate) => candidate.outcome.toLowerCase()));
  if (outcomes.size !== 1) return null;
  const primary = selected[0];
  return {
    ...primary,
    contentMaps: selected.map((candidate) => candidate.contentMap),
    subjects: selected.map((candidate) => candidate.subject),
    selectedByExplicitStreams: true
  };
}

// Turns one reviewed, numbered candidate into a resolution the normal config
// writer can apply. Automatic resolution remains conservative; this function is
// used only after a person explicitly chooses one of the exact harvested SLS
// candidates printed by the launcher.
export function acceptCurriculumCandidate(resolution, oneBasedChoice) {
  const choice = Number(oneBasedChoice);
  if (!Number.isInteger(choice) || choice < 1 || choice > (resolution?.candidates?.length ?? 0)) {
    return null;
  }
  const selected = resolution.candidates[choice - 1];
  const next = resolution.candidates[choice] ?? null;
  return {
    resolved: true,
    ...selected,
    margin: next ? selected.score - next.score : selected.score,
    selectedByReview: true,
    selectedCandidateNumber: choice,
    candidates: resolution.candidates
  };
}
