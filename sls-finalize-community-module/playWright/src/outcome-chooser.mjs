// --- Learning-outcome selection -------------------------------------------
// Outcome wording must match the SLS dropdown exactly, so candidates always come
// from a taxonomy harvested out of SLS, never from transcribed syllabus text.
// This module only ranks those harvested candidates against what a section
// actually contains.

const STOPWORDS = new Set([
  "the","a","an","and","or","of","to","in","for","with","on","at","by","from",
  "is","are","was","were","be","been","can","will","would","should","that","this",
  "these","those","it","its","as","if","then","than","i","you","we","my","your",
  "question","questions","activity","section","part","practice","using","use",
  "do","does","did","have","has","had","not","no","yes","am","so","up","out"
]);

// Sections that are pedagogically about disposition or process rather than a
// content skill: confidence checks, reflections, orientation and teacher notes.
const PROCESS_SECTION =
  /reflect|pre-?lesson|digital literacy|notes for teachers|familiaris|success criteria|lesson outcome|confiden|metacognit/i;

export function tokenize(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map((word) => word.replace(/s$/, ""))
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
}

function overlapScore(candidateTokens, evidenceTokens) {
  if (candidateTokens.size === 0) return 0;
  let shared = 0;
  for (const token of candidateTokens) if (evidenceTokens.has(token)) shared += 1;
  return shared / Math.sqrt(candidateTokens.size);
}

// A content outcome is one that sits under a branch path; the three top-level
// entries (acquire / develop / build) are dispositional and apply module-wide.
function isContentOutcome(entry) {
  return Array.isArray(entry.outcomePath) && entry.outcomePath.length > 0;
}

export function chooseOutcome(taxonomy, evidence, options = {}) {
  const threshold = options.threshold ?? 0.5;
  const minMargin = options.minMargin ?? 0.25;
  const { moduleTitle = "", sectionTitle = "", questionText = "" } = evidence;
  const fallback =
    taxonomy.find((entry) => !isContentOutcome(entry) && /problem-solving/i.test(entry.outcome)) ??
    taxonomy.find((entry) => !isContentOutcome(entry)) ??
    null;

  // Matched against the section's own title only. Testing the question text too
  // would let a single "I am confident that..." prompt inside a 22-question
  // practice section reclassify the whole section as reflective.
  if (PROCESS_SECTION.test(sectionTitle)) {
    return fallback
      ? { ...fallback, score: null, reason: "section is reflective or orientation content, not a content skill", alternatives: [] }
      : null;
  }

  const evidenceTokens = tokenize(`${moduleTitle} ${sectionTitle} ${questionText}`);
  const ranked = taxonomy
    .filter(isContentOutcome)
    .map((entry) => ({
      ...entry,
      score: overlapScore(tokenize(`${entry.outcomePath.join(" ")} ${entry.outcome}`), evidenceTokens)
    }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  const runnerUp = ranked[1];
  // A near-tie means nothing in this section actually discriminates between the
  // candidates - typically the module title matched but the questions added no
  // signal. Picking either one would look authoritative while being arbitrary,
  // so hand it back for review instead.
  const margin = runnerUp ? best.score - runnerUp.score : Infinity;
  if (!best || best.score < threshold) {
    return fallback
      ? {
          ...fallback,
          score: best ? best.score : 0,
          reason: "no content outcome matched the section's wording closely enough",
          alternatives: ranked.slice(0, 3)
        }
      : null;
  }
  if (margin < minMargin) {
    return fallback
      ? {
          ...fallback,
          score: best.score,
          reason: `top content outcomes tied (${best.score.toFixed(2)} vs ${runnerUp.score.toFixed(2)}); needs a human decision`,
          alternatives: ranked.slice(0, 3)
        }
      : null;
  }
  return {
    outcome: best.outcome,
    outcomePath: best.outcomePath,
    score: best.score,
    reason: "best keyword match against the section's questions",
    alternatives: ranked.slice(1, 4)
  };
}
