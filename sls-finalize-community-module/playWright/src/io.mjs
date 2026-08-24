import fs from "node:fs/promises";
import path from "node:path";

export async function loadConfig(configPath) {
  const source = await fs.readFile(configPath, "utf8");
  const config = JSON.parse(source);
  validateConfig(config);
  return config;
}

export function validateConfig(config) {
  if (config?.schemaVersion !== 1) {
    throw new Error("The config must use schemaVersion 1.");
  }
  if (!config?.module?.id || !config?.module?.title || !config?.module?.adminEditUrl) {
    throw new Error("The config requires module.id, module.title, and module.adminEditUrl.");
  }
  const url = new URL(config.module.adminEditUrl);
  if (url.protocol !== "https:" || url.hostname !== "vle.learning.moe.edu.sg") {
    throw new Error("module.adminEditUrl must be an HTTPS URL on vle.learning.moe.edu.sg.");
  }
  if (!url.pathname.includes(`/admin/community-gallery/module/edit/${config.module.id}`)) {
    throw new Error("module.adminEditUrl must be the exact admin edit route for module.id.");
  }
  for (const field of ["subject", "level", "contentMap", "outcome", "questionKeyword"]) {
    if (!config?.defaults?.[field]) {
      throw new Error(`defaults.${field} is required.`);
    }
  }
  if (!Array.isArray(config?.defaults?.outcomePath)) {
    throw new Error("defaults.outcomePath must be an array of curriculum branches.");
  }
  if (!Array.isArray(config.sections) || config.sections.length === 0) {
    throw new Error("At least one section is required.");
  }
  for (const section of config.sections) {
    if (!section.label || !section.title || !Array.isArray(section.activities)) {
      throw new Error("Each section requires label, title, and an activities array.");
    }
    for (const activity of section.activities) {
      if (!activity.title) {
        throw new Error(`Section ${section.label} contains an activity without a title.`);
      }
      if (activity.reviewedOutcomePrefixes != null) {
        if (
          typeof activity.reviewedOutcomePrefixes !== "object" ||
          Array.isArray(activity.reviewedOutcomePrefixes)
        ) {
          throw new Error(
            `Section ${section.label} activity ${activity.title} reviewedOutcomePrefixes must be an object keyed by question number.`
          );
        }
        for (const [questionNumber, prefix] of Object.entries(activity.reviewedOutcomePrefixes)) {
          if (!/^\d+$/.test(questionNumber) || typeof prefix !== "string" || !prefix.trim()) {
            throw new Error(
              `Section ${section.label} activity ${activity.title} has an invalid reviewed outcome for question ${questionNumber}.`
            );
          }
        }
      }
    }
  }
  if (config.gamification) {
    validateGamificationConfig(config.gamification);
  }
}

export function validateGamificationConfig(gamification) {
  for (const field of ["recipe", "instructions", "title", "shortTitle", "description"]) {
    if (typeof gamification?.[field] !== "string" || !gamification[field].trim()) {
      throw new Error(`gamification.${field} is required.`);
    }
  }
  if (gamification.title === "Untitled Game" || gamification.shortTitle === "Untitled Game") {
    throw new Error("Gamification titles must be meaningful and cannot be Untitled Game.");
  }
}

export async function createRunPaths(options, moduleId) {
  const timestamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
  const runDir = path.join(options.outputRoot, moduleId, timestamp);
  const checkpointPath = path.join(options.stateRoot, `${moduleId}.json`);
  await fs.mkdir(runDir, { recursive: true });
  await fs.mkdir(options.stateRoot, { recursive: true });
  await fs.mkdir(options.profileDir, { recursive: true });
  return {
    runDir,
    checkpointPath,
    reportPath: path.join(runDir, "report.json"),
    tracePath: path.join(runDir, "trace.zip")
  };
}

export async function loadCheckpoint(checkpointPath, moduleId) {
  try {
    const checkpoint = JSON.parse(await fs.readFile(checkpointPath, "utf8"));
    if (checkpoint.moduleId !== moduleId) {
      throw new Error("Checkpoint module ID does not match the requested module.");
    }
    return checkpoint;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return {
      schemaVersion: 1,
      moduleId,
      updatedAt: null,
      sections: {}
    };
  }
}

export async function saveJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

export async function saveCheckpoint(checkpointPath, checkpoint) {
  checkpoint.updatedAt = new Date().toISOString();
  await saveJson(checkpointPath, checkpoint);
}

export function mergeDefaults(config) {
  return {
    ...config,
    sections: config.sections.map((section) => ({
      ...config.defaults,
      ...section,
      activities: section.activities.map((activity) => ({
        questionKeyword: section.questionKeyword ?? config.defaults.questionKeyword,
        ...activity
      }))
    }))
  };
}

export function applyTargetUrl(config, options) {
  if (!options.targetUrl) return config;

  const target = parseAdminModuleEditUrl(options.targetUrl);
  const configuredId = config.module.id;
  if (options.mode !== "inspect" && target.id !== configuredId) {
    throw new Error(
      `Refusing to ${options.mode} module ${target.id} with configuration for ${configuredId}. ` +
      "Create or select a matching JSON config first."
    );
  }

  return {
    ...config,
    target: {
      scope: target.scope,
      sectionId: target.sectionId,
      activityId: target.activityId,
      sourceUrl: target.sourceUrl
    },
    module: {
      ...config.module,
      id: target.id,
      title: target.id === configuredId ? config.module.title : null,
      adminViewUrl: target.adminViewUrl,
      adminEditUrl: target.adminEditUrl
    }
  };
}

// A section heading carries the same sidebar text as its activity when the two
// share a title, and that heading remains after the activity is deleted. Sidebar
// rows are counted by exact text, so the heading must always be discounted on a
// collision - including when the count has fallen to the heading alone.
// The SLS tagging tree is a flat row list whose depth comes from an inline
// padding-left, so branch paths are rebuilt by walking rows in order and keeping
// a stack indexed by depth. Branch rows set the stack at their depth; outcome
// rows capture whatever stack is above them.
export function buildOutcomePaths(rows) {
  // The tree's top level is indented (padding-left: 24px in SLS), so depths are
  // rebased on the shallowest row rather than assumed to start at zero.
  const base = rows.length ? Math.min(...rows.map((row) => row.depth)) : 0;
  const stack = [];
  const outcomes = [];
  for (const raw of rows) {
    const row = { ...raw, depth: raw.depth - base };
    stack.length = row.depth;
    if (row.isOutcome) {
      outcomes.push({ outcome: row.text, outcomePath: [...stack] });
    } else {
      stack[row.depth] = row.text;
    }
  }
  return outcomes;
}

export function activityRowCount(rawCount, title, sectionTitle) {
  if (sectionTitle && title === sectionTitle) return Math.max(0, rawCount - 1);
  return rawCount;
}

export function normalizeActivityRowTitle(value) {
  return String(value).replace(/^\d+\.\s*/, "").replace(/\s+/g, " ").trim();
}

export function normalizeSectionDisplayTitle(value) {
  return normalizeActivityRowTitle(String(value).replace(/^[A-Z]\.\s*/i, ""));
}

export function detectScope(value) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    return "module";
  }
  return /^\/(admin\/)?community-gallery\/(module|lesson)\/(view|edit)\/[0-9a-f-]+\/(section|activity)\//i.test(
    url.pathname
  )
    ? "activity"
    : "module";
}

export function parseAdminModuleEditUrl(value, { scope = "module" } = {}) {
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("The supplied module URL is not valid.");
  }
  const supportedPaths = [
    /^\/admin\/community-gallery\/module\/(?:edit|view)\/(?<id>[0-9a-f-]+)(?:\/module-plan)?\/?$/i,
    /^\/community-gallery\/module\/view\/(?<id>[0-9a-f-]+)(?:\/module-plan)?\/?$/i,
    /^\/community-gallery\/lesson\/view\/(?<id>[0-9a-f-]+)(?:\/cover)?\/?$/i,
    /^\/(?:admin\/)?community-gallery\/(?:module|lesson)\/(?:view|edit)\/(?<id>[0-9a-f-]+)\/(?<nested>section|activity)\/[0-9a-f-]+(?:\/activity\/[0-9a-f-]+)?\/?$/i
  ];
  const match = supportedPaths.map((pattern) => url.pathname.match(pattern)).find(Boolean);
  const nested = Boolean(match?.groups?.nested);
  if (
    url.protocol !== "https:" ||
    url.hostname !== "vle.learning.moe.edu.sg" ||
    !match ||
    (scope === "activity" && !nested)
  ) {
    throw new Error(
      "Paste an SLS Community Gallery module or lesson URL from vle.learning.moe.edu.sg."
    );
  }
  const moduleId = match.groups.id;
  const nestedIds = url.pathname.match(
    /\/section\/(?<sectionId>[0-9a-f-]+)(?:\/activity\/(?<activityId>[0-9a-f-]+))?/i
  );
  const adminViewUrl = `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${moduleId}/module-plan`;
  const adminEditUrl = `https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/${moduleId}/module-plan`;
  return {
    id: moduleId,
    scope: nested ? "activity" : "module",
    sectionId: nestedIds?.groups?.sectionId ?? null,
    activityId: nestedIds?.groups?.activityId ?? null,
    sourceUrl: url.href,
    converted: url.href.replace(/\/$/, "") !== adminViewUrl,
    adminViewUrl,
    adminEditUrl,
    url: adminViewUrl
  };
}

// A scaffolded config carries REVIEW-BEFORE-RUNNING markers where a human still has
// to paste the exact SLS wording. Scanning past them is fine and is how the real
// values get discovered, but a pass that writes to SLS must never start on a guess.
export const PLACEHOLDER_MARKER = "REVIEW-BEFORE-RUNNING";

export function unreviewedPlaceholders(config) {
  const found = [];
  const check = (where, key, value) => {
    if (typeof value === "string" && value.includes(PLACEHOLDER_MARKER)) found.push(`${where}.${key}`);
  };
  for (const [key, value] of Object.entries(config.defaults || {})) check("defaults", key, value);
  for (const section of config.sections || []) {
    for (const [key, value] of Object.entries(section)) check(`section ${section.label}`, key, value);
  }
  return found;
}

// Reads whether a question already carries a question-level tag, from the text of
// its settings card. SLS prints "Question Tags <values>", or "Question Tags -" when
// there are none. This is the cheapest reliable signal: no extra page visit, and it
// is what decides whether surgical tagging should leave a question alone.
export function questionTagState(cardText) {
  const flat = String(cardText ?? "").replace(/\s+/g, " ");
  const field = /Question Tags(.*?)(?:Authoring Copilot|$)/i.exec(flat);
  const questionTags = (field?.[1] ?? "").trim();
  return {
    questionTags,
    alreadyTagged: questionTags !== "" && questionTags !== "-"
  };
}

// Whether a question's own tag field already names a content map. The section
// summary shows an extra year ("Sec 1 Mathematics (G2) (2020) - 2020") that the
// question card does not, so the trailing year is trimmed before comparing.
export function questionCarriesMap(questionTags, contentMap) {
  if (!questionTags || !contentMap) return false;
  const base = String(contentMap).replace(/\s*-\s*\d{4}\s*$/, "").trim().toLowerCase();
  if (!base) return false;
  return String(questionTags).toLowerCase().includes(base);
}

// A question's Subject, Level and Content Map cascade: SLS offers no levels until a
// subject is chosen, and no content maps until both are. The content map's own name
// says which pair it belongs to - "Sec 1 Mathematics (G1) (2028)" is the G1 subject
// at Secondary 1 - so the pair can be derived rather than guessed.
export function subjectForContentMap(contentMap, fallback = null) {
  if (/Additional Mathematics/i.test(String(contentMap ?? ""))) {
    const stream = /\(G([23])\)/i.exec(String(contentMap ?? ""))?.[1];
    return stream
      ? `Additional Mathematics - G${stream}AMATHS`
      : "ADDITIONAL MATHEMATICS - A MATHS";
  }
  const band = /\(G([123])\)/.exec(String(contentMap ?? ""));
  return band ? `Mathematics - G${band[1]}MATHS` : fallback;
}

export function levelForContentMap(contentMap, fallback = null) {
  const text = String(contentMap ?? "");
  const secondary = /\bSec\s*([1-5])\b/i.exec(text);
  if (secondary) return `Secondary ${secondary[1]}`;
  const primary = /\bPri\s*([1-6])\b/i.exec(text);
  if (primary) return `Primary ${primary[1]}`;
  return fallback;
}
