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
  const spokenEquations = String(text)
    .replace(/\bF equals m r omega squared\b/gi, "force equals mass radius omega squared")
    .replace(
      /\bF equals fraction numerator m v squared over denominator r end fraction\b/gi,
      "force equals mass velocity squared over radius"
    )
    .replace(/\ba equals r omega squared\b/gi, "acceleration equals radius omega squared")
    .replace(
      /\ba equals v squared over r(?: space)?\b/gi,
      "acceleration equals velocity squared over radius"
    );
  const stem = (word) => {
    if (word.length > 4 && word.endsWith("ies")) return `${word.slice(0, -3)}y`;
    // The old unconditional trailing-s removal turned physics into "physic" and
    // mass into "mas". Strip only ordinary plurals, not subject names or words
    // ending in a double-s.
    if (
      word.length > 4 &&
      word.endsWith("s") &&
      !word.endsWith("ss") &&
      !word.endsWith("ics") &&
      !word.endsWith("us")
    ) {
      return word.slice(0, -1);
    }
    return word;
  };
  const tokens = new Set(
    spokenEquations
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .map(stem)
      .filter((word) => word.length > 2 && !STOPWORDS.has(word))
  );
  // Teachers often write "differentiating fractions" while the Additional
  // Mathematics syllabus says "derivatives of ... quotients of functions".
  // Expand only stable mathematical equivalents; the exact saved wording still
  // always comes from the taxonomy harvested out of SLS.
  const equivalents = {
    differentiate: ["derivative", "differentiation"],
    differentiating: ["derivative", "differentiation"],
    differentiation: ["derivative", "differentiate"],
    derivative: ["differentiation", "differentiate"],
    fraction: ["quotient"],
    quotient: ["fraction"],
    duration: ["time", "rate"],
    dropped: ["drop", "fall", "falling"],
    drop: ["fall", "falling"],
    projected: ["projectile"],
    explosion: ["interaction", "collision"],
    explodes: ["interaction", "collision"],
    stretched: ["extension", "deformed", "elastic"],
    rotating: ["rotation", "circular", "centripetal"],
    angular: ["omega", "circular"],
    speed: ["velocity"],
    velocity: ["speed"],
    resistor: ["resistance"],
    resistance: ["resistor"],
    electron: ["charge", "charged", "particle", "carrier"],
    nucleus: ["nuclear", "nuclide"],
    nuclear: ["nucleus", "nuclide"],
    beta: ["radioactive", "decay", "radiation"],
    emission: ["radiation", "decay"],
    uncertainty: ["error", "relative", "percentage"],
    errors: ["uncertainty"],
    emf: ["electromotive", "force"],
    microammeter: ["current"]
  };
  for (const token of [...tokens]) {
    for (const equivalent of equivalents[token] ?? []) tokens.add(equivalent);
  }

  // Stable subject concepts expressed differently in a question and syllabus.
  // These are evidence expansions, not hard-coded outcome choices: the selected
  // wording still comes only from the live harvested SLS map.
  const clean = String(text).toLowerCase().replace(/\s+/g, " ");
  const concepts = [
    [/(?:precision.*accuracy|accuracy.*precision|random.*systematic|systematic.*random)/, ["random", "systematic", "error", "precision", "accuracy"]],
    [/percentage uncertainty/, ["fractional", "relative", "uncertainty"]],
    [/(?:projected horizontally|horizontal projection)/, ["projectile", "perpendicular"]],
    [/(?:mean power|power dissipated).*resistor/, ["electrical", "power", "resistive"]],
    [/(?:variable resistor).*lamp|lamp.*brightness/, ["potential", "divider", "circuit"]],
    [/(?:number density|per cubic metre).*drift velocity/, ["carrier", "density", "drift"]],
    [/(?:charged particles?|electron beam).*magnetic field/, ["charged", "particle", "deflection"]],
    [/(?:electric field).*magnetic field|magnetic field.*electric field/, ["velocity", "selection", "deflection"]],
    [/beta[- ]?(?:particle|decay)/, ["radioactive", "decay", "nuclear", "reaction"]],
    [/proton number.*neutron number|neutron number.*proton number/, ["nucleon", "charge", "conservation"]],
    [/binding energy/, ["binding", "energy", "mass", "defect", "nuclear"]],
    [/ionising radiation/, ["radiation", "radioactive", "property"]],
    [/(?:angular velocity|rotating disc).*friction/, ["centripetal", "force", "circular", "mass", "radius", "omega", "squared"]]
  ];
  for (const [pattern, additions] of concepts) {
    if (pattern.test(clean)) additions.forEach((token) => tokens.add(token));
  }
  return tokens;
}

function phraseBonus(candidateText, evidenceText, weight) {
  const words = String(candidateText)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOPWORDS.has(word));
  const evidence = ` ${String(evidenceText).toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ")} `;
  let score = 0;
  const seen = new Set();
  for (const size of [4, 3, 2]) {
    for (let index = 0; index <= words.length - size; index += 1) {
      const phrase = words.slice(index, index + size).join(" ");
      if (seen.has(phrase) || !evidence.includes(` ${phrase} `)) continue;
      seen.add(phrase);
      score += weight * (size - 1);
    }
  }
  return Math.min(score, weight * 6);
}

function outcomeMatchScore(entry, evidenceTokens, evidenceText) {
  const outcomeTokens = tokenize(entry.outcome);
  const pathText = (entry.outcomePath ?? []).join(" ");
  const pathTokens = tokenize(pathText);
  let outcomeShared = 0;
  let pathShared = 0;
  for (const token of outcomeTokens) if (evidenceTokens.has(token)) outcomeShared += 1;
  for (const token of pathTokens) if (evidenceTokens.has(token)) pathShared += 1;
  const size = Math.max(1, outcomeTokens.size * 2 + pathTokens.size);
  const candidateTokens = new Set([...outcomeTokens, ...pathTokens]);
  const conceptAnchors = [
    "force", "mass", "energy", "power", "charge", "resistance", "momentum",
    "uncertainty", "radiation", "binding", "drift", "centripetal", "equilibrium"
  ];
  const missingAnchors = conceptAnchors.filter(
    (token) => evidenceTokens.has(token) && !candidateTokens.has(token)
  ).length;
  return (
    (outcomeShared * 2 + pathShared) / Math.sqrt(size) +
    phraseBonus(entry.outcome, evidenceText, 0.45) +
    phraseBonus(pathText, evidenceText, 0.2) -
    missingAnchors * 0.15
  );
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

  const evidenceText = `${moduleTitle} ${sectionTitle} ${questionText}`;
  const evidenceTokens = tokenize(evidenceText);
  const ranked = taxonomy
    .filter(isContentOutcome)
    .map((entry) => ({
      ...entry,
      // Outcome wording counts twice; a broad branch such as "Mass defect and
      // nuclear binding energy" must not make every child look equally good.
      score: outcomeMatchScore(entry, evidenceTokens, evidenceText)
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
    return {
      ...(fallback ?? {}),
      score: best ? best.score : 0,
      reason: "no content outcome matched the section's wording closely enough",
      alternatives: ranked.slice(0, 3)
    };
  }
  if (margin < minMargin) {
    return {
      ...(fallback ?? {}),
      score: best.score,
      reason: `top content outcomes tied (${best.score.toFixed(2)} vs ${runnerUp.score.toFixed(2)}); needs a human decision`,
      alternatives: ranked.slice(0, 3)
    };
  }
  return {
    outcome: best.outcome,
    outcomePath: best.outcomePath,
    score: best.score,
    reason: "best keyword match against the section's questions",
    alternatives: ranked.slice(1, 4)
  };
}

// A top-level fallback caused by weak evidence is a review signal, not a proposal
// that should overwrite a confidently configured content outcome. Reflective and
// orientation sections are the exception: their top-level outcome is intentional.
export function outcomeProposalIsWritable(picked) {
  if (!picked) return false;
  if (Array.isArray(picked.outcomePath) && picked.outcomePath.length > 0) return true;
  return /section is reflective or orientation content/i.test(picked.reason ?? "");
}
