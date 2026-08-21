export const DEFAULT_PAGE_BREAK_POLICY = Object.freeze({
  longPageViewports: 1.75,
  targetChunkViewports: 1.1,
  minimumLongPagePx: 1400,
  minimumChunkPx: 850,
  maximumBreaksPerActivity: 20,
});

export function normalizePageBreakPolicy(overrides = {}) {
  const policy = { ...DEFAULT_PAGE_BREAK_POLICY, ...overrides };
  for (const key of ["longPageViewports", "targetChunkViewports"]) {
    if (!Number.isFinite(policy[key]) || policy[key] < 0.5 || policy[key] > 5) {
      throw new Error(`${key} must be between 0.5 and 5.`);
    }
  }
  for (const key of ["minimumLongPagePx", "minimumChunkPx"]) {
    if (!Number.isFinite(policy[key]) || policy[key] < 200 || policy[key] > 10_000) {
      throw new Error(`${key} must be between 200 and 10000 pixels.`);
    }
  }
  if (
    !Number.isInteger(policy.maximumBreaksPerActivity) ||
    policy.maximumBreaksPerActivity < 1 ||
    policy.maximumBreaksPerActivity > 100
  ) {
    throw new Error("maximumBreaksPerActivity must be an integer between 1 and 100.");
  }
  return policy;
}

export function assessPageForBreak({
  viewportHeight,
  contentTop,
  contentBottom,
  questions = [],
  dividers = [],
}, overrides = {}) {
  const policy = normalizePageBreakPolicy(overrides);
  const safeViewport = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 900;
  const top = Number.isFinite(contentTop) ? contentTop : 0;
  const bottom = Number.isFinite(contentBottom) ? contentBottom : top;
  const pageHeight = Math.max(0, bottom - top);
  const longPageThreshold = Math.max(
    policy.minimumLongPagePx,
    safeViewport * policy.longPageViewports,
  );
  const chunkThreshold = Math.max(
    policy.minimumChunkPx,
    safeViewport * policy.targetChunkViewports,
  );
  const visibleQuestions = questions
    .filter(validBox)
    .sort((left, right) => left.top - right.top);
  const safeDividers = dividers
    .filter((divider) => validBox(divider) && !divider.disabled && !divider.existingBreak)
    .sort((left, right) => left.top - right.top);

  const base = {
    pageHeight,
    longPageThreshold,
    chunkThreshold,
    longPage: pageHeight >= longPageThreshold,
    blocked: false,
    questionCount: visibleQuestions.length,
    dividerCount: safeDividers.length,
    needsBreak: false,
    candidate: null,
  };

  if (visibleQuestions.length === 0) {
    return { ...base, reason: "no visible question bodies" };
  }

  // Question boundaries take priority over visual length. The runner applies
  // one break, re-inspects every resulting page, and repeats; therefore always
  // separating the second question on a page yields one question per page for
  // Q1, Q2, Q3, and so on without relying on their rendered height.
  if (visibleQuestions.length > 1) {
    const question = visibleQuestions[1];
    const previousQuestion = visibleQuestions[0];
    const candidates = safeDividers.filter(
      (divider) =>
        divider.top >= Math.min(previousQuestion.bottom, question.top) - 24 &&
        divider.top < question.top + 8,
    );
    const divider = candidates.at(-1) ?? null;
    if (divider) {
      return {
        ...base,
        needsBreak: true,
        reason: "each question starts on its own page",
        candidate: {
          dividerIndex: divider.index,
          dividerTop: divider.top,
          questionIndex: 1,
          questionId: question.id ?? null,
          questionText: compactText(question.text),
        },
      };
    }
    return {
      ...base,
      blocked: true,
      reason: "multiple questions have no safe divider immediately before the second question",
    };
  }

  // A page containing one question is treated as one semantic chunk and falls
  // back to the existing length-based policy.
  if (pageHeight < longPageThreshold) {
    return { ...base, reason: "page is not long enough to justify pagination" };
  }

  let chunkStart = top;
  let previousBottom = top;
  for (let index = 0; index < visibleQuestions.length; index += 1) {
    const question = visibleQuestions[index];
    const chunkHeightBeforeQuestion = question.top - chunkStart;
    const chunkHeightIncludingQuestion = question.bottom - chunkStart;
    const shouldBreak =
      chunkHeightBeforeQuestion >= chunkThreshold ||
      (index > 0 && chunkHeightIncludingQuestion > chunkThreshold * 1.35);
    if (!shouldBreak) {
      previousBottom = Math.max(previousBottom, question.bottom);
      continue;
    }

    const lowerBound = index === 0 ? top : Math.min(previousBottom, question.top);
    const candidates = safeDividers.filter(
      (divider) => divider.top >= lowerBound - 24 && divider.top < question.top + 8,
    );
    const divider = candidates.at(-1) ?? null;
    if (divider) {
      return {
        ...base,
        needsBreak: true,
        reason: index === 0
          ? "long introductory content before the first question"
          : "the next question starts beyond the target chunk height",
        candidate: {
          dividerIndex: divider.index,
          dividerTop: divider.top,
          questionIndex: index,
          questionId: question.id ?? null,
          questionText: compactText(question.text),
        },
      };
    }

    // The page is long, but SLS exposed no divider at the required semantic
    // boundary. Do not fall back to an arbitrary first/last divider.
    return {
      ...base,
      blocked: true,
      reason: "long page has no safe divider immediately before the next question",
    };
  }

  return {
    ...base,
    reason: "remaining questions already fit meaningful chunks",
  };
}

function validBox(box) {
  return box && Number.isFinite(box.top) && Number.isFinite(box.bottom) && box.bottom >= box.top;
}

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}
