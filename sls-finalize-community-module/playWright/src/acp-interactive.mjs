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
    .replace(/\b(-?\d+(?:\.\d+)?)\s+\1(?:\s+\1)*\b/g, "$1")
    .trim();
}

function compactMathText(value) {
  return String(value ?? "")
    .replace(/[−–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRandomizationParameters(rows = []) {
  return rows.flatMap((row) => {
    const cells = Array.isArray(row) ? row : row?.cells;
    const populated = (cells ?? []).map(compactMathText).filter(Boolean);
    if (populated.length < 3 || /^name$/i.test(populated[0])) return [];

    const name = populated[0].match(/[A-Za-z][A-Za-z0-9_]*\s*$/)?.[0]?.replace(/\s+/g, "") ?? "";
    const type = populated[1];
    const descriptions = populated.slice(2).join(" ").match(/\[[^\]]+\]/g);
    const description = compactMathText(descriptions?.at(-1) ?? populated.slice(2).join(" "))
      .replace(/\s*([,\[\]])\s*/g, "$1")
      .replace(/\s*([+*/-])\s*/g, "$1");
    if (!name || !type || !description) return [];
    return [{ name, type, description }];
  });
}

export function inferRandomizationSourceValues(instructionTemplate, renderedQuestion, parameters = []) {
  const template = normalizeQuestionText(instructionTemplate);
  const rendered = normalizeQuestionText(renderedQuestion);
  const names = parameters.map((entry) => entry.name).filter(Boolean);
  if (!template || !rendered || names.length === 0) return {};

  const occurrences = [];
  const token = new RegExp(`\\b(${names.map(escapeRegExp).sort((a, b) => b.length - a.length).join("|")})\\b`, "gi");
  let pattern = "^";
  let cursor = 0;
  for (const match of template.matchAll(token)) {
    pattern += flexibleLiteral(template.slice(cursor, match.index));
    pattern += "(-?\\d+(?:\\.\\d+)?)";
    occurrences.push(match[0]);
    cursor = match.index + match[0].length;
  }
  if (occurrences.length === 0) return {};
  pattern += flexibleLiteral(template.slice(cursor)) + "$";
  const values = new RegExp(pattern, "i").exec(rendered);
  if (!values) return {};

  const result = {};
  occurrences.forEach((name, index) => {
    result[name] ??= Number(values[index + 1]);
  });
  return result;
}

export function buildAcpSpecificRequirements({ questionText, randomization } = {}) {
  const parameters = randomization?.parameters ?? [];
  if (parameters.length === 0) return "";
  const instruction = normalizeQuestionText(randomization.instructionTemplate);
  const rendered = normalizeQuestionText(questionText);
  const answerExpression = compactMathText(randomization.answerExpression);
  const sourceValues = {
    ...inferRandomizationSourceValues(instruction, rendered, parameters),
    ...(randomization.sourceValues ?? {}),
  };
  const parameterLines = parameters.map((parameter) => {
    const source = Number.isFinite(Number(sourceValues[parameter.name]))
      ? `; source value ${Number(sourceValues[parameter.name])}`
      : "";
    return `- ${parameter.name} (${parameter.type}): ${parameter.description}${source}`;
  });

  return [
    "Replicate the source FA Math randomized question as a manipulable practice experience.",
    rendered ? `Rendered source instance: ${rendered}` : "",
    instruction ? `Source instruction template: ${instruction}` : "",
    answerExpression ? `Correct answer expression: ${answerExpression}` : "",
    "Source randomization parameters:",
    ...parameterLines,
    "Specific interaction requirements:",
    "- Provide one clearly labelled slider for every Number parameter above, using step 1 for integer ranges.",
    "- Initialise every slider to its source value when listed so the first view exactly reproduces the rendered source instance.",
    "- Add a clearly labelled Match source question or Reset to source values control that restores those exact values.",
    "- Preserve every stated range and dependency dynamically. For example, a bound such as [2,c1-1] must update when c1 changes and must never permit an invalid combination.",
    "- Update the story values, mathematical model or equation, student answer control, computed correct answer, hints, and feedback immediately whenever a slider changes.",
    "- Keep the mathematical structure, operation, context, accessibility, mobile usability, and age-appropriate wording faithful to the source. Do not invent wider ranges or unrelated variables.",
  ].filter(Boolean).join("\n");
}

export function assessAcpPreAddState({
  completedBefore = 0,
  textComponentIdsBefore = [],
  ownTextComponentId = null,
} = {}, current = {}) {
  const allowed = new Set([...textComponentIdsBefore, ownTextComponentId].filter(Boolean));
  const unexpectedTextComponentIds = (current.textComponentIds ?? []).filter((id) => id && !allowed.has(id));
  const unexpectedPendingIds = (current.pendingTextComponentIds ?? []).filter(
    (id) => id && id !== ownTextComponentId,
  );
  if (current.completedInteractives !== completedBefore) {
    return {
      safe: false,
      reason: `completed ACP ZIP count changed from ${completedBefore} to ${current.completedInteractives}`,
      unexpectedTextComponentIds,
    };
  }
  if (unexpectedTextComponentIds.length > 0 || unexpectedPendingIds.length > 0) {
    return {
      safe: false,
      reason: "another Text component appeared while ACP was generating",
      unexpectedTextComponentIds,
    };
  }
  return { safe: true, reason: "only the runner's own Text component is new", unexpectedTextComponentIds: [] };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function flexibleLiteral(value) {
  return escapeRegExp(value).replace(/\s+/g, "\\s+");
}
