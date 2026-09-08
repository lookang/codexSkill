import { levelForContentMap, PLACEHOLDER_MARKER, subjectForContentMap } from "./io.mjs";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLocaleLowerCase();
const unresolved = (value) => !clean(value) || clean(value).includes(PLACEHOLDER_MARKER);

export function normalizeModuleCurriculumEvidence(raw = {}, options = {}) {
  const pairs = [];
  for (const entry of raw.subjectLevels ?? []) {
    const subject = clean(entry?.subject);
    const level = clean(entry?.level);
    if (subject && level) pairs.push({ subject, level });
  }
  if (clean(raw.subject) && clean(raw.level)) {
    pairs.push({ subject: clean(raw.subject), level: clean(raw.level) });
  }

  const uniquePairs = [...new Map(pairs.map((entry) => [`${key(entry.subject)}|${key(entry.level)}`, entry])).values()];
  const maps = (raw.contentMaps ?? [])
    .map((entry) => typeof entry === "string" ? entry : entry?.contentMap ?? entry?.label)
    .map(clean)
    .filter(Boolean);
  if (clean(raw.contentMap)) maps.push(clean(raw.contentMap));
  const uniqueMaps = [...new Map(maps.map((entry) => [key(entry), entry])).values()];

  // SLS can render the saved Content Map accordion while its Subject and Level
  // comboboxes are absent from the DOM. A single official map still carries an
  // unambiguous subject and level (for example Sec 2 Mathematics (G3) (2020)).
  // Recover those values from the map instead of discarding the saved Module Tag.
  let derivedSubjectLevelFromContentMap = false;
  if (uniquePairs.length === 0 && uniqueMaps.length === 1) {
    const derivedSubject = subjectForContentMap(uniqueMaps[0]);
    const derivedLevel = levelForContentMap(uniqueMaps[0]);
    if (derivedSubject && derivedLevel) {
      uniquePairs.push({ subject: derivedSubject, level: derivedLevel });
      derivedSubjectLevelFromContentMap = true;
    }
  }

  let selectedPairs = uniquePairs;
  let selectedMaps = uniqueMaps;
  let selectedFromMultiple = false;
  const preferredSubject = clean(options.preferredSubject);
  const preferredContentMap = clean(options.preferredContentMap);
  const preferredText = key(options.preferredText).replace(/[^a-z0-9]+/g, " ");
  if (uniquePairs.length > 1) {
    const subjectMatchesPreference = preferredSubject
      ? uniquePairs.filter((entry) => subjectMatches(entry.subject, preferredSubject))
      : [];
    const textMatches = uniquePairs.filter((entry) => {
      const words = subjectName(entry.subject).split(" ").filter((word) => word.length > 2);
      return words.length > 0 && words.every((word) => preferredText.includes(word));
    });
    const matches = subjectMatchesPreference.length === 1 ? subjectMatchesPreference : textMatches;
    if (matches.length === 1) {
      selectedPairs = matches;
      selectedFromMultiple = true;
    }
  }
  if (uniqueMaps.length > 1) {
    const exactPreferred = uniqueMaps.filter((entry) => key(entry) === key(preferredContentMap));
    const subjectPreferred = selectedPairs.length === 1
      ? uniqueMaps.filter((entry) => contentMapMatchesSubject(entry, selectedPairs[0].subject))
      : [];
    const matches = exactPreferred.length === 1 ? exactPreferred : subjectPreferred;
    if (matches.length === 1) {
      selectedMaps = matches;
      selectedFromMultiple = true;
    }
  }

  if (selectedPairs.length !== 1 || selectedMaps.length !== 1) {
    return {
      usable: false,
      reason: `expected one saved Subject/Level pair and one selected Content Map; found ${uniquePairs.length} and ${uniqueMaps.length}`,
      subjectLevels: uniquePairs,
      contentMaps: uniqueMaps,
    };
  }

  const { subject, level } = selectedPairs[0];
  const contentMap = selectedMaps[0];
  const derivedLevel = levelForContentMap(contentMap);
  const derivedSubject = subjectForContentMap(contentMap);
  if (derivedLevel && key(derivedLevel) !== key(level)) {
    return { usable: false, reason: `${contentMap} contradicts saved level ${level}`, subjectLevels: uniquePairs, contentMaps: uniqueMaps };
  }
  if (derivedSubject && key(derivedSubject) !== key(subject)) {
    return { usable: false, reason: `${contentMap} contradicts saved subject ${subject}`, subjectLevels: uniquePairs, contentMaps: uniqueMaps };
  }

  return {
    usable: true,
    subject,
    level,
    contentMap,
    derivedSubjectLevelFromContentMap,
    ...(selectedFromMultiple ? { selectedFromMultiple: true } : {})
  };
}

function subjectName(value) {
  return key(value).split(/\s+-\s+/)[0].replace(/[^a-z0-9]+/g, " ").trim();
}

function subjectMatches(left, right) {
  const a = subjectName(left);
  const b = subjectName(right);
  return Boolean(a && b && (a === b || a.includes(b) || b.includes(a)));
}

function contentMapMatchesSubject(contentMap, subject) {
  const map = key(contentMap).replace(/[^a-z0-9]+/g, " ");
  const name = subjectName(subject);
  if (!map || !name) return false;
  const words = name.split(" ").filter((word) => word.length > 2);
  return words.length > 0 && words.every((word) => map.includes(word));
}

export function moduleToSectionTagCopyPlan(raw = {}) {
  // Exact section inheritance is deliberately separate from curriculum
  // inference. A module may legitimately save more than one Subject/Level row
  // against one Content Map (for example the generic A Maths subject and its G3
  // subject code). The section must receive every saved row verbatim; choosing
  // just one would not be an exact copy.
  const pairs = [];
  for (const entry of raw.subjectLevels ?? []) {
    const subject = clean(entry?.subject);
    const level = clean(entry?.level);
    if (subject && level) pairs.push({ subject, level });
  }
  if (clean(raw.subject) && clean(raw.level)) {
    pairs.push({ subject: clean(raw.subject), level: clean(raw.level) });
  }
  const subjectLevels = [...new Map(
    pairs.map((entry) => [`${key(entry.subject)}|${key(entry.level)}`, entry])
  ).values()];
  const contentMaps = [...new Map(
    [
      ...(raw.contentMaps ?? []).map((entry) =>
        typeof entry === "string" ? entry : entry?.contentMap ?? entry?.label
      ),
      raw.contentMap
    ]
      .map(clean)
      .filter(Boolean)
      .map((entry) => [key(entry), entry])
  ).values()];
  if (subjectLevels.length === 0 || contentMaps.length === 0) {
    return {
      copyable: false,
      reason:
        `expected at least one saved Subject/Level pair and one or more selected Content Maps; ` +
        `found ${subjectLevels.length} and ${contentMaps.length}`,
      subjectLevels,
      contentMaps,
      outcomes: []
    };
  }
  const outcomes = [...new Map(
    (raw.selectedOutcomes ?? [])
      .map((entry) => ({
        contentMap: clean(entry?.contentMap),
        outcome: clean(entry?.outcome),
        outcomePath: Array.isArray(entry?.outcomePath)
          ? entry.outcomePath.map(clean).filter(Boolean)
          : []
      }))
      .filter((entry) => entry.outcome)
      .map((entry) => [`${key(entry.contentMap)}|${key(entry.outcome)}`, entry])
  ).values()];
  if (outcomes.length === 0) {
    return {
      copyable: false,
      reason: "the saved Module Tags contained no readable selected outcomes",
      outcomes: []
    };
  }
  const mapKeys = new Set(contentMaps.map(key));
  const wrongMap = outcomes.find((entry) => entry.contentMap && !mapKeys.has(key(entry.contentMap)));
  if (wrongMap) {
    return {
      copyable: false,
      reason: `selected outcome ${wrongMap.outcome} belongs to ${wrongMap.contentMap}, not a saved Content Map`,
      outcomes: []
    };
  }

  const maps = contentMaps.map((contentMap) => ({
    contentMap,
    outcomes: outcomes
      .filter((entry) => key(entry.contentMap) === key(contentMap))
      .map((entry) => ({
        contentMap,
        outcome: entry.outcome,
        outcomePath: entry.outcomePath
      }))
  }));
  const mapWithoutOutcomes = maps.find((entry) => entry.outcomes.length === 0);
  if (mapWithoutOutcomes) {
    return {
      copyable: false,
      reason: `the saved Module Tag ${mapWithoutOutcomes.contentMap} contained no exactly readable selected outcomes`,
      subjectLevels,
      contentMaps,
      outcomes: []
    };
  }

  return {
    copyable: true,
    subjectLevels,
    contentMaps,
    maps,
    ...(maps.length === 1
      ? { contentMap: maps[0].contentMap, outcomes: maps[0].outcomes }
      : { outcomes: maps.flatMap((entry) => entry.outcomes) })
  };
}

export function sectionCurriculumStateIsEmpty(state = {}) {
  return ![
    ...(state.subjects ?? []),
    ...(state.levels ?? []),
    ...(state.contentMaps ?? [])
  ].some((value) => clean(value));
}

export function sectionCurriculumStateContainsPlan(state = {}, plan = {}) {
  const subjects = state.subjects ?? [];
  const levels = state.levels ?? [];
  const persistedPairs = subjects.map((subject, index) => ({
    subject: clean(subject),
    level: clean(levels[index] ?? "")
  }));
  const missingPairs = (plan.subjectLevels ?? []).filter((wanted) =>
    !persistedPairs.some((actual) =>
      actual.subject === clean(wanted.subject) && actual.level === clean(wanted.level)
    )
  );
  const wantedMaps = (plan.contentMaps ?? [plan.contentMap]).map(key).filter(Boolean);
  const actualMaps = new Set((state.contentMaps ?? []).map(key).filter(Boolean));
  const hasContentMap = wantedMaps.length > 0 && wantedMaps.every((value) => actualMaps.has(value));
  return { complete: missingPairs.length === 0 && hasContentMap, missingPairs, hasContentMap };
}

export function sectionZeroSelectedTopicRepairPlan(state = {}, plan = {}) {
  const actualPairs = (state.subjects ?? []).map((subject, index) => ({
    subject: clean(subject),
    level: clean((state.levels ?? [])[index] ?? "")
  })).filter((entry) => entry.subject && entry.level);
  const wantedPairs = (plan.subjectLevels ?? []).map((entry) => ({
    subject: clean(entry.subject),
    level: clean(entry.level)
  })).filter((entry) => entry.subject && entry.level);
  const pairKey = (entry) => `${key(entry.subject)}|${key(entry.level)}`;
  const actualPairKeys = new Set(actualPairs.map(pairKey));
  const wantedPairKeys = new Set(wantedPairs.map(pairKey));
  const exactPairs =
    actualPairKeys.size === wantedPairKeys.size &&
    [...wantedPairKeys].every((value) => actualPairKeys.has(value));

  const plannedMaps = (plan.contentMaps ?? [plan.contentMap]).map(key).filter(Boolean);
  const plannedMap = plannedMaps.length === 1 ? plannedMaps[0] : null;
  const contentMaps = [...new Set((state.contentMaps ?? []).map(key).filter(Boolean))];
  const exactMap = Boolean(plannedMap) && contentMaps.length === 1 && contentMaps[0] === plannedMap;
  const mapSelections = state.mapSelections ?? [];
  const selectedCountEntry = mapSelections.find(
    (entry) => key(entry?.contentMap) === plannedMap
  );
  const selectedCount = Number.isInteger(selectedCountEntry?.selectedCount)
    ? selectedCountEntry.selectedCount
    : null;
  const hasModuleOutcomes = (plan.outcomes ?? []).length > 0;
  const repairable = exactPairs && exactMap && selectedCount === 0 && hasModuleOutcomes;

  return {
    repairable,
    exactPairs,
    exactMap,
    selectedCount,
    reason: repairable
      ? null
      : "requires the exact Module Subject/Level rows, the exact sole Content Map, and a saved 0 selected summary"
  };
}

export function applyModuleEvidenceToConfig(config, raw = {}) {
  const copy = structuredClone(config);
  const exact = normalizeModuleCurriculumEvidence(raw, {
    preferredSubject: config?.defaults?.subject,
    preferredContentMap: config?.defaults?.contentMap,
    preferredText: [config?.module?.title, config?.module?.description].filter(Boolean).join(" "),
  });
  copy.module ??= {};
  copy.defaults ??= {};
  copy.discoveryEvidence ??= {};
  copy.module.savedCurriculumEvidence = {
    subjectLevels: structuredClone(raw.subjectLevels ?? []),
    contentMaps: structuredClone(raw.contentMaps ?? []),
    selectedOutcomes: structuredClone(raw.selectedOutcomes ?? []),
    selectedOutcomeErrors: structuredClone(raw.selectedOutcomeErrors ?? [])
  };

  const moduleText = clean(raw.moduleText).slice(0, 8_000);
  const description = clean(raw.description).slice(0, 4_000);
  if (moduleText) copy.discoveryEvidence.moduleText = moduleText;
  if (description) {
    copy.discoveryEvidence.moduleDescription = description;
    if (!clean(copy.module.description)) copy.module.description = description;
  }

  if (!exact.usable) return { config: copy, applied: [], evidence: exact };
  copy.module.curriculumEvidence = {
    source: "existing saved SLS Module Tags",
    subject: exact.subject,
    level: exact.level,
    contentMap: exact.contentMap,
  };

  const applied = [];
  const genericSubject = /^Mathematics\s*-\s*MATHS$/i.test(clean(copy.defaults.subject));
  const moreSpecificMathSubject = /^Mathematics\s*-\s*G[123]MATHS$/i.test(exact.subject);
  if (unresolved(copy.defaults.subject) || (genericSubject && moreSpecificMathSubject)) {
    copy.defaults.subject = exact.subject;
    applied.push("subject");
  }
  if (unresolved(copy.defaults.level)) {
    copy.defaults.level = exact.level;
    applied.push("level");
  }
  const savedMaps = (raw.contentMaps ?? []).map(clean).filter(Boolean);
  const configuredMapIsNotSaved =
    clean(copy.defaults.contentMap) &&
    savedMaps.length > 0 &&
    !savedMaps.some((entry) => key(entry) === key(copy.defaults.contentMap));
  if (unresolved(copy.defaults.contentMap) || configuredMapIsNotSaved) {
    copy.defaults.contentMap = exact.contentMap;
    applied.push("contentMap");
  }
  const selectedForExactMap = (raw.selectedOutcomes ?? []).filter(
    (entry) => key(entry?.contentMap) === key(exact.contentMap) && clean(entry?.outcome)
  );
  if (selectedForExactMap.length === 1) {
    const selected = selectedForExactMap[0];
    if (unresolved(copy.defaults.outcome) || key(copy.defaults.outcome) !== key(selected.outcome)) {
      copy.defaults.outcome = clean(selected.outcome);
      applied.push("outcome");
    }
    const selectedPath = Array.isArray(selected.outcomePath)
      ? selected.outcomePath.map(clean).filter(Boolean)
      : [];
    if (selectedPath.length > 0 && JSON.stringify(copy.defaults.outcomePath ?? []) !== JSON.stringify(selectedPath)) {
      copy.defaults.outcomePath = selectedPath;
      applied.push("outcomePath");
    }
  }
  if (
    /^FA Math$/i.test(clean(copy.defaults.questionKeyword)) &&
    !/Math/i.test(exact.subject)
  ) {
    copy.defaults.questionKeyword = `FA ${subjectName(exact.subject).replace(/\b\w/g, (letter) => letter.toUpperCase())}`;
    applied.push("questionKeyword");
  }
  return { config: copy, applied, evidence: exact };
}
