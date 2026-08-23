import { levelForContentMap, PLACEHOLDER_MARKER, subjectForContentMap } from "./io.mjs";

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const key = (value) => clean(value).toLocaleLowerCase();
const unresolved = (value) => !clean(value) || clean(value).includes(PLACEHOLDER_MARKER);

export function normalizeModuleCurriculumEvidence(raw = {}) {
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

  if (uniquePairs.length !== 1 || uniqueMaps.length !== 1) {
    return {
      usable: false,
      reason: `expected one saved Subject/Level pair and one selected Content Map; found ${uniquePairs.length} and ${uniqueMaps.length}`,
      subjectLevels: uniquePairs,
      contentMaps: uniqueMaps,
    };
  }

  const { subject, level } = uniquePairs[0];
  const contentMap = uniqueMaps[0];
  const derivedLevel = levelForContentMap(contentMap);
  const derivedSubject = subjectForContentMap(contentMap);
  if (derivedLevel && key(derivedLevel) !== key(level)) {
    return { usable: false, reason: `${contentMap} contradicts saved level ${level}`, subjectLevels: uniquePairs, contentMaps: uniqueMaps };
  }
  if (derivedSubject && key(derivedSubject) !== key(subject)) {
    return { usable: false, reason: `${contentMap} contradicts saved subject ${subject}`, subjectLevels: uniquePairs, contentMaps: uniqueMaps };
  }

  return { usable: true, subject, level, contentMap, derivedSubjectLevelFromContentMap };
}

export function applyModuleEvidenceToConfig(config, raw = {}) {
  const copy = structuredClone(config);
  const exact = normalizeModuleCurriculumEvidence(raw);
  copy.module ??= {};
  copy.defaults ??= {};
  copy.discoveryEvidence ??= {};

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
  if (unresolved(copy.defaults.contentMap)) {
    copy.defaults.contentMap = exact.contentMap;
    applied.push("contentMap");
  }
  return { config: copy, applied, evidence: exact };
}
