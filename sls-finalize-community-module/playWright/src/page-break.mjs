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

export function advancePageBreakScan(pages, splitPageIndex) {
  if (!Array.isArray(pages)) throw new Error("pages must be an array.");
  if (!Number.isInteger(splitPageIndex) || splitPageIndex < 0) {
    throw new Error("splitPageIndex must be a non-negative integer.");
  }

  const splitPage = pages.find((entry) => entry.pageIndex === splitPageIndex);
  if (!splitPage) throw new Error(`Page ${splitPageIndex + 1} is missing from the current scan.`);

  return {
    completedPages: [
      ...pages.filter((entry) => entry.pageIndex < splitPageIndex),
      {
        ...splitPage,
        assessment: {
          ...splitPage.assessment,
          blocked: false,
          needsBreak: false,
          candidate: null,
          reason: "page break inserted; preceding page completed by the verified split",
        },
      },
    ],
    nextPageIndex: splitPageIndex + 1,
    shiftedFollowingPages: pages
      .filter((entry) => entry.pageIndex > splitPageIndex)
      .map((entry) => ({ ...entry, pageIndex: entry.pageIndex + 1 })),
  };
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
    .sort((left, right) => left.top - right.top || safeLeft(left) - safeLeft(right));
  const questionRows = groupQuestionRows(visibleQuestions);
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
    questionRowCount: questionRows.length,
    dividerCount: safeDividers.length,
    needsBreak: false,
    candidate: null,
  };

  if (visibleQuestions.length === 0) {
    return { ...base, reason: "no visible question bodies" };
  }

  // Question-row boundaries take priority over visual length. Two questions in
  // separate columns with substantial vertical overlap are one semantic row and
  // stay on the same page. For a multi-row grid, split before the first question
  // of row two; the runner then re-inspects the continuation and repeats.
  if (visibleQuestions.length > 1) {
    if (questionRows.length === 1) {
      return {
        ...base,
        reason: "side-by-side questions in one visual row stay together",
      };
    }

    const previousRow = questionRows[0];
    const nextRow = questionRows[1];
    const question = nextRow.questions[0];
    const questionIndex = visibleQuestions.indexOf(question);
    const candidates = safeDividers.filter(
      (divider) =>
        divider.top >= Math.min(previousRow.bottom, question.top) - 24 &&
        divider.top <= question.top,
    );
    const divider = candidates.at(-1) ?? null;
    if (divider) {
      return {
        ...base,
        needsBreak: true,
        reason: "each visual question row starts on its own page",
        candidate: {
          dividerIndex: divider.index,
          dividerTop: divider.top,
          questionIndex,
          questionId: question.id ?? null,
          questionText: compactText(question.text),
        },
      };
    }
    return {
      ...base,
      blocked: true,
      reason: "multiple question rows have no safe divider before the next row",
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

function groupQuestionRows(questions) {
  const rows = [];
  for (const question of questions) {
    const row = rows.find((entry) =>
      entry.questions.some((existing) => questionsShareVisualRow(existing, question)),
    );
    if (!row) {
      rows.push({
        top: question.top,
        bottom: question.bottom,
        questions: [question],
      });
      continue;
    }
    row.questions.push(question);
    row.questions.sort((left, right) => safeLeft(left) - safeLeft(right));
    row.top = Math.min(row.top, question.top);
    row.bottom = Math.max(row.bottom, question.bottom);
  }
  return rows.sort((left, right) => left.top - right.top);
}

function questionsShareVisualRow(left, right) {
  if (![left.left, left.right, right.left, right.right].every(Number.isFinite)) return false;
  const leftWidth = Math.max(0, left.right - left.left);
  const rightWidth = Math.max(0, right.right - right.left);
  const minimumWidth = Math.min(leftWidth, rightWidth);
  if (minimumWidth <= 0) return false;

  const horizontalOverlap = Math.max(
    0,
    Math.min(left.right, right.right) - Math.max(left.left, right.left),
  );
  const separatedColumns = horizontalOverlap <= minimumWidth * 0.2;
  if (!separatedColumns) return false;

  const overlap = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
  const minimumHeight = Math.min(left.bottom - left.top, right.bottom - right.top);
  const topDifference = Math.abs(left.top - right.top);
  return overlap >= minimumHeight * 0.5 || topDifference <= Math.max(48, minimumHeight * 0.2);
}

function safeLeft(box) {
  return Number.isFinite(box?.left) ? box.left : 0;
}

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, 140);
}
