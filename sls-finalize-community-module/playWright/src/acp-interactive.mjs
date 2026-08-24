const GRADES = new Set([
  "Preschool",
  "Primary 1-2",
  "Primary 3-4",
  "Primary 5-6",
  "Secondary 1-2",
  "Secondary 3-4",
  "Junior College",
  "Polytechnic",
  "University",
]);

export function normalizeAcpOptions(overrides = {}) {
  const grade = String(overrides.grade ?? "Primary 5-6").trim();
  const subject = String(overrides.subject ?? "Mathematics").trim();
  const generationTimeoutMs = Number(overrides.generationTimeoutMs ?? 10 * 60_000);
  const maximumInteractives = overrides.maximumInteractives == null
    ? null
    : Number(overrides.maximumInteractives);
  if (!GRADES.has(grade)) throw new Error(`Unsupported prompt-library grade: ${grade}`);
  if (!subject) throw new Error("Prompt-library subject is required.");
  if (!Number.isInteger(generationTimeoutMs) || generationTimeoutMs < 60_000) {
    throw new Error("generationTimeoutMs must be an integer of at least 60000.");
  }
  if (maximumInteractives !== null && (!Number.isInteger(maximumInteractives) || maximumInteractives < 1)) {
    throw new Error("maximumInteractives must be a positive integer.");
  }
  return { grade, subject, generationTimeoutMs, maximumInteractives };
}

export function moduleWideAcpTarget(target) {
  return {
    ...target,
    scope: "module",
    sectionId: null,
    activityId: null,
  };
}

export function assessAcpPage({ faQuestions = [], completedInteractives = 0 } = {}) {
  if (faQuestions.length === 0) {
    return { status: "skip", reason: "no FA Math question on this page" };
  }
  if (completedInteractives >= faQuestions.length) {
    return { status: "complete", reason: "an ACP interactive is already present for each FA Math question" };
  }
  if (faQuestions.length !== 1) {
    return {
      status: "blocked",
      reason: `${faQuestions.length} FA Math questions share this page; run meaningful page breaks first`,
    };
  }
  if (completedInteractives !== 0) {
    return { status: "blocked", reason: "the question-to-interactive pairing is ambiguous" };
  }
  const question = faQuestions[0];
  if (!normalizeQuestionText(question.text)) {
    return { status: "blocked", reason: "the FA Math question text could not be read safely" };
  }
  return { status: "candidate", reason: "one FA Math question needs one ACP interactive", question };
}

export function normalizeQuestionText(value) {
  return String(value ?? "")
    .replace(/\bFEEDBACK ASSISTANT\b[\s\S]*$/i, "")
    .replace(/^Q\d+\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}
