const SEC_5_G2_MAP = "Sec 5 Mathematics (G2) (2020)";

const normalize = (value) => String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();

export function supplementalOutcomesForQuestion(activity = {}, questionNumber = null) {
  return (activity.supplementalQuestionOutcomes ?? []).filter((entry) => {
    if (!Array.isArray(entry.questionNumbers) || entry.questionNumbers.length === 0) return true;
    return entry.questionNumbers.includes(Number(questionNumber));
  });
}

export function supplementalSectionTagPlan(activities = []) {
  const targets = [];
  for (const activity of activities ?? []) {
    for (const entry of activity?.supplementalQuestionOutcomes ?? []) {
      const subject = String(entry?.subject ?? "").trim();
      const level = String(entry?.level ?? "").trim();
      const contentMap = String(entry?.contentMap ?? "").trim();
      const outcome = String(entry?.outcome ?? "").trim();
      if (!subject || !level || !contentMap || !outcome) continue;
      targets.push({
        subject,
        level,
        contentMap,
        outcome,
        outcomePath: Array.isArray(entry.outcomePath)
          ? entry.outcomePath.map((value) => String(value).trim()).filter(Boolean)
          : [],
        source: entry.source ?? null
      });
    }
  }

  const uniqueTargets = [...new Map(targets.map((entry) => [
    [entry.subject, entry.level, entry.contentMap, entry.outcome].map(normalize).join("|"),
    entry
  ])).values()];
  const subjectLevels = [...new Map(uniqueTargets.map((entry) => [
    [entry.subject, entry.level].map(normalize).join("|"),
    { subject: entry.subject, level: entry.level }
  ])).values()];
  const maps = [...new Map(uniqueTargets.map((entry) => [
    normalize(entry.contentMap),
    {
      contentMap: entry.contentMap,
      subject: entry.subject,
      level: entry.level,
      outcomes: uniqueTargets
        .filter((candidate) => normalize(candidate.contentMap) === normalize(entry.contentMap))
        .map((candidate) => ({
          contentMap: candidate.contentMap,
          outcome: candidate.outcome,
          outcomePath: candidate.outcomePath,
          source: candidate.source
        }))
    }
  ])).values()];

  return {
    copyable: maps.length > 0,
    subjectLevels,
    contentMaps: maps.map((entry) => entry.contentMap),
    maps,
    outcomes: maps.flatMap((entry) => entry.outcomes)
  };
}

// The 2020 Sec 5 G2 syllabus deliberately carries the Sec 3/4 Mathematics
// outcomes that G2 learners complete in Secondary 5. Add it only when SLS itself
// shows a saved Sec 3 & 4 Mathematics map; Additional Mathematics is excluded.
export function secondaryFiveG2MirrorTarget(moduleEvidence = {}) {
  const sourceContentMaps = (moduleEvidence.contentMaps ?? []).filter((contentMap) =>
    /^Sec 3\s*&\s*4 Mathematics \(G[23]\) \(2020\)$/i.test(String(contentMap).trim())
  );
  if (sourceContentMaps.length === 0) return null;
  return {
    kind: "mirror",
    sourceContentMap: sourceContentMaps[0],
    sourceContentMaps,
    subject: "Mathematics - G2MATHS",
    level: "Secondary 5",
    contentMap: SEC_5_G2_MAP,
    source: "saved Sec 3 & 4 Mathematics module tagging"
  };
}

export function exactSupplementalProposal(target, dictionaries = []) {
  const wantedMap = normalize(target?.contentMap);
  const wantedOutcome = normalize(target?.outcome);
  if (!wantedMap || !wantedOutcome) return null;
  const matches = dictionaries.filter((entry) =>
    normalize(entry.contentMap) === wantedMap && normalize(entry.outcome) === wantedOutcome
  );
  if (matches.length !== 1) return null;
  return reviewedProposal(matches[0], target.source);
}

export function mirroredSupplementalProposal(sourceProposal, target, dictionaries = []) {
  const sourceMaps = target?.sourceContentMaps ?? [target?.sourceContentMap];
  if (!sourceProposal || !sourceMaps.some(
    (contentMap) => normalize(sourceProposal.contentMap) === normalize(contentMap)
  )) {
    return null;
  }
  return exactSupplementalProposal(
    { ...target, outcome: sourceProposal.outcome },
    dictionaries
  );
}

function reviewedProposal(entry, source = null) {
  return {
    decision: "tag",
    contentMap: entry.contentMap,
    outcome: entry.outcome,
    outcomePath: entry.outcomePath,
    score: null,
    tiedCount: 1,
    basis: source ? `reviewed supplemental tagging from ${source}` : "reviewed supplemental tagging",
    candidates: [],
    evidence: {
      topics: [],
      operations: [],
      question: "reviewed supplemental curriculum mapping"
    },
    features: null
  };
}

export { SEC_5_G2_MAP };
