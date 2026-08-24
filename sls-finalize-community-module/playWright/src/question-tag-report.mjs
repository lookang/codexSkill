const values = (collection) => collection == null ? [] : [...collection];

const candidateForReport = (candidate) => {
  if (candidate == null) return null;
  if (typeof candidate === "string") return { outcome: candidate };
  return {
    contentMap: candidate.contentMap ?? null,
    outcome: candidate.outcome ?? candidate.label ?? null,
    outcomePath: candidate.outcomePath ?? null,
    score: candidate.score ?? null,
    reason: candidate.reason ?? null
  };
};

// Playwright reports are JSON. Sets inside mathFeatures otherwise serialize as
// empty objects, hiding the exact evidence behind a decision. Keep just the
// stable, reviewable fields and convert every feature set to an array.
export function proposalForReport(proposal = null) {
  if (!proposal) return null;
  return {
    decision: proposal.decision ?? null,
    reason: proposal.reason ?? null,
    contentMap: proposal.contentMap ?? null,
    outcome: proposal.outcome ?? null,
    outcomePath: proposal.outcomePath ?? null,
    score: proposal.score ?? null,
    tiedCount: proposal.tiedCount ?? null,
    basis: proposal.basis ?? null,
    candidates: (proposal.candidates ?? []).map(candidateForReport).filter(Boolean),
    evidence: proposal.evidence ?? null,
    features: proposal.features ? {
      clean: proposal.features.clean ?? "",
      operations: values(proposal.features.operations),
      operands: values(proposal.features.operands),
      topics: values(proposal.features.topics)
    } : null
  };
}

export function summarizeQuestionResults(results = []) {
  const summary = {
    total: results.length,
    newlyTagged: 0,
    alreadyTagged: 0,
    partiallyTagged: 0,
    skipped: 0,
    errors: 0,
    notTargeted: 0,
    notRequested: 0
  };
  for (const result of results) {
    if (result?.status === "tagged") summary.newlyTagged += 1;
    else if (result?.status === "already-tagged") summary.alreadyTagged += 1;
    else if (result?.status === "partially-tagged") summary.partiallyTagged += 1;
    else if (result?.status === "error") summary.errors += 1;
    else if (result?.status === "not-targeted") summary.notTargeted += 1;
    else if (result?.status === "not-requested") summary.notRequested += 1;
    else summary.skipped += 1;
  }
  summary.fullyTagged = summary.newlyTagged + summary.alreadyTagged;
  summary.unresolved = summary.partiallyTagged + summary.skipped + summary.errors;
  return summary;
}

export function isQuestionRunComplete(summary) {
  return Boolean(
    summary?.total > 0 &&
    summary.fullyTagged === summary.total &&
    summary.unresolved === 0 &&
    summary.notTargeted === 0 &&
    summary.notRequested === 0
  );
}

export function summarizeReportSections(sections = []) {
  const results = [];
  for (const section of sections) {
    for (const activity of section?.activities ?? []) {
      results.push(...(activity?.questions ?? []));
    }
  }
  return summarizeQuestionResults(results);
}
