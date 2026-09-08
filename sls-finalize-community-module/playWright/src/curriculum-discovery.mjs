const SUBJECT_RULES = [
  {
    id: "additional-mathematics",
    pattern: /\b(?:additional\s+math(?:ematic)?s?|a[\s-]*maths?|amath)\b/i,
    queries: ["Additional Mathematics", "A Mathematics"]
  },
  { id: "physics", pattern: /\bphysics\b/i, queries: ["Physics"] },
  { id: "chemistry", pattern: /\bchemistry\b/i, queries: ["Chemistry"] },
  { id: "biology", pattern: /\bbiology\b/i, queries: ["Biology"] },
  { id: "geography", pattern: /\bgeography\b/i, queries: ["Geography"] },
  { id: "history", pattern: /\bhistory\b/i, queries: ["History"] },
  { id: "social-studies", pattern: /\bsocial\s+studies\b/i, queries: ["Social Studies"] },
  { id: "computing", pattern: /\bcomput(?:ing|er science)\b/i, queries: ["Computing"] },
  { id: "science", pattern: /\bscience\b/i, queries: ["Science"] },
  {
    id: "english-language",
    pattern: /\benglish(?:\s+language)?\b/i,
    queries: ["English Language", "English"]
  },
  {
    id: "chinese-language",
    pattern: /\bchinese(?:\s+language)?\b/i,
    queries: ["Chinese Language", "Chinese"]
  },
  {
    id: "malay-language",
    pattern: /\bmalay(?:\s+language)?\b/i,
    queries: ["Malay Language", "Malay"]
  },
  {
    id: "tamil-language",
    pattern: /\btamil(?:\s+language)?\b/i,
    queries: ["Tamil Language", "Tamil"]
  },
  {
    id: "mathematics",
    pattern: /\b(?:elementary\s+math(?:ematic)?s?|e[\s-]*maths?|math(?:ematic)?s?|algebra(?:ic)?|expansion|factorisation|factorization|equation|decimal|fraction|geometry|trigonometry)\b/i,
    queries: ["Mathematics"]
  }
];

function evidenceText(config) {
  const savedModuleEvidence = config?.module?.savedCurriculumEvidence ?? {};
  return [
    config?.defaults?.subject,
    config?.defaults?.level,
    config?.defaults?.contentMap,
    config?.module?.curriculumEvidence?.subject,
    config?.module?.curriculumEvidence?.level,
    config?.module?.curriculumEvidence?.contentMap,
    ...(savedModuleEvidence.subjectLevels ?? []).flatMap((entry) => [entry?.subject, entry?.level]),
    ...(savedModuleEvidence.contentMaps ?? []),
    config?.module?.description,
    config?.discoveryEvidence?.moduleDescription,
    config?.discoveryEvidence?.moduleText,
    config?.discoveryEvidence?.questionText,
    config?.module?.title,
    ...(config?.sections ?? []).flatMap((section) => [
      section.title,
      ...(section.activities ?? []).map((activity) => activity.title)
    ])
  ]
    .filter(Boolean)
    .join(" ");
}

export function inferCurriculumClues(config) {
  const savedModuleEvidence = config?.module?.savedCurriculumEvidence ?? {};
  const text = evidenceText(config);
  const authoritativeText = [
    config?.module?.curriculumEvidence?.subject,
    config?.module?.curriculumEvidence?.level,
    config?.module?.curriculumEvidence?.contentMap,
    ...(savedModuleEvidence.subjectLevels ?? []).flatMap((entry) => [entry?.subject, entry?.level]),
    ...(savedModuleEvidence.contentMaps ?? []),
  ].filter(Boolean).join(" ");
  const configuredText = [
    config?.defaults?.subject,
    config?.defaults?.level,
    config?.defaults?.contentMap,
  ].filter((value) => value && !String(value).includes("REVIEW-BEFORE-RUNNING")).join(" ");
  const topicText = [
    config?.module?.description,
    config?.discoveryEvidence?.moduleDescription,
    config?.discoveryEvidence?.moduleText,
    config?.discoveryEvidence?.questionText,
    config?.module?.title,
    ...(config?.sections ?? []).flatMap((section) => [
      section.title,
      ...(section.activities ?? []).map((activity) => activity.title),
    ]),
  ].filter(Boolean).join(" ");
  const savedText = [authoritativeText, configuredText].filter(Boolean).join(" ");
  const savedLevel = String(
    config?.module?.curriculumEvidence?.level ??
      (config?.defaults?.level && !String(config.defaults.level).includes("REVIEW-BEFORE-RUNNING")
        ? config.defaults.level
        : commonSavedLevel(savedModuleEvidence.subjectLevels))
  ).trim();
  const primary = /\b(?:P|Pri(?:mary)?)\s*([1-6])(?=G\d|\b)/i.exec(savedText) ??
    /\b(?:P|Pri(?:mary)?)\s*([1-6])(?=G\d|\b)/i.exec(text);
  const secondary = /\b(?:S|Sec(?:ondary)?)\s*([1-5])(?=G\d|\b)/i.exec(savedText) ??
    /\b(?:S|Sec(?:ondary)?)\s*([1-5])(?=G\d|\b)/i.exec(text);
  const subject = SUBJECT_RULES.find((rule) => rule.pattern.test(authoritativeText)) ??
    SUBJECT_RULES.find((rule) => rule.pattern.test(topicText)) ??
    SUBJECT_RULES.find((rule) => rule.pattern.test(configuredText)) ?? null;
  const streamText = [...savedText.matchAll(/G([123])/gi)].length > 0 ? savedText : text;
  const streams = [...new Set([...streamText.matchAll(/G([123])/gi)].map((match) => `G${match[1]}`))];
  const authoritativeSubject = String(config?.module?.curriculumEvidence?.subject ?? "").trim();
  const configuredSubject = String(config?.defaults?.subject ?? "").trim();
  const savedSubject = authoritativeSubject ||
    (subject?.pattern.test(configuredSubject) ? configuredSubject : "");
  const existingContentMaps = [...new Set([
    config?.module?.curriculumEvidence?.contentMap,
    config?.defaults?.contentMap,
    ...(savedModuleEvidence.contentMaps ?? []),
  ].filter((value) => value && !String(value).includes("REVIEW-BEFORE-RUNNING")))];
  return {
    text,
    level: savedLevel || (primary ? `Primary ${primary[1]}` : secondary ? `Secondary ${secondary[1]}` : null),
    subjectId: subject?.id ?? null,
    subjectQueries: savedSubject
      ? [...new Set([savedSubject, ...(subject?.queries ?? [])])]
      : subject?.queries ?? titleQueries(text),
    streams,
    existingContentMaps,
    evidenceSource: existingContentMaps.length > 0 ? "saved SLS curriculum metadata" : "module and activity text",
  };
}

function commonSavedLevel(subjectLevels = []) {
  const levels = [...new Set(
    subjectLevels.map((entry) => String(entry?.level ?? "").trim()).filter(Boolean)
  )];
  return levels.length === 1 ? levels[0] : "";
}

export function rankSubjectOptions(labels, clues) {
  return rankUnique(labels, (label) => {
    const lower = normalize(label);
    let score = 0;
    for (const query of clues.subjectQueries ?? []) {
      const wanted = normalize(query);
      if (lower === wanted) score = Math.max(score, 12);
      else if (lower.startsWith(`${wanted} -`)) score = Math.max(score, 11);
      else if (lower.includes(wanted)) score = Math.max(score, 8);
    }
    if (clues.subjectId === "additional-mathematics" && /additional mathematics|\bamath\b/.test(lower)) {
      score += 6;
    }
    if (clues.subjectId === "additional-mathematics" && /^mathematics\s*-/.test(lower)) score -= 6;
    return score;
  });
}

export function rankLevelOptions(labels, clues) {
  return rankUnique(labels, (label) => {
    const lower = normalize(label);
    const wanted = normalize(clues.level);
    if (!wanted) return 0;
    if (lower === wanted) return 15;
    if (lower.includes(wanted)) return 10;
    return 0;
  });
}

export function rankContentMapOptions(labels, clues) {
  const levelNumber = /([1-6])/.exec(clues.level ?? "")?.[1] ?? null;
  const levelPattern = clues.level?.startsWith("Primary")
    ? new RegExp(`\\bPri\\s*${levelNumber}\\b`, "i")
    : clues.level?.startsWith("Secondary")
      ? new RegExp(`\\bSec\\s*${levelNumber}\\b`, "i")
      : null;
  return rankUnique(labels, (label) => {
    const lower = normalize(label);
    let score = levelPattern?.test(label) ? 12 : 0;
    if ((clues.existingContentMaps ?? []).some((entry) => normalize(entry) === lower)) score += 30;
    for (const query of clues.subjectQueries ?? []) {
      const wanted = normalize(query);
      if (wanted && lower.includes(wanted)) score += 8;
    }
    if (clues.subjectId === "additional-mathematics" && /additional mathematics|\bamath\b/.test(lower)) {
      score += 8;
    }
    for (const stream of clues.streams ?? []) {
      if (new RegExp(`\\(${stream}\\)|\\b${stream}\\b`, "i").test(label)) score += 2;
    }
    return score;
  });
}

export function contentMapMatchesClues(contentMap, clues) {
  if (!contentMapSupportsStreams(contentMap, clues.streams)) return false;
  const ranked = rankContentMapOptions([contentMap], clues);
  const minimum = clues.level ? 12 : 8;
  return ranked.length > 0 && ranked[0].score >= minimum;
}

export function contentMapSupportsStreams(contentMap, streams = []) {
  const wanted = [...new Set(streams.map((stream) => String(stream).toUpperCase()))];
  if (wanted.length === 0) return true;
  const offered = [...String(contentMap ?? "").matchAll(/\bG([123])\b/gi)]
    .map((match) => `G${match[1]}`);
  return offered.some((stream) => wanted.includes(stream));
}

export function contentMapSupportsLevel(contentMap, level) {
  if (!level) return true;
  const wanted = /([1-6])/.exec(level)?.[1];
  if (!wanted) return true;
  const text = String(contentMap ?? "");
  if (/^Primary/i.test(level)) {
    return new RegExp(`\\bPri\\s*${wanted}\\b`, "i").test(text);
  }
  if (/^Secondary/i.test(level)) {
    const range = /\bSec\s*([1-5])(?:\s*&\s*([1-5]))?/i.exec(text);
    return Boolean(range && [range[1], range[2]].filter(Boolean).includes(wanted));
  }
  return true;
}

function rankUnique(labels, scorer) {
  const unique = [...new Set((labels ?? []).map((label) => String(label).replace(/\s+/g, " ").trim()).filter(Boolean))];
  return unique
    .map((label) => ({ label, score: scorer(label) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}

function titleQueries(text) {
  return [...new Set(
    String(text)
      .replace(/\([^)]*\)/g, " ")
      .split(/[^A-Za-z]+/)
      .filter((word) => word.length >= 5)
      .slice(0, 4)
  )];
}

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}
