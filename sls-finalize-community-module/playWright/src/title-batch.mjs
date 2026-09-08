import { parseAdminModuleEditUrl } from "./io.mjs";

export const DEFAULT_TITLE_SHEET = "https://docs.google.com/spreadsheets/d/1GnyhDb2_jjOK2GBXHDtzBCSJz7-4xdwH-hOM3jl-Nr4/edit?pli=1&gid=447883961#gid=447883961";
export const DEFAULT_TITLE_PREFIX = "Topical Revision -";

export function parseTitleSheet(value) {
  const text = String(value).trim().replace(/^\[[\s\S]*?\]\((https:\/\/[^\s]+)\)$/, "$1");
  const url = new URL(text);
  const sheetId = /^\/spreadsheets\/d\/([\w-]+)(?:\/|$)/.exec(url.pathname)?.[1];
  const gid = new URLSearchParams(url.hash.slice(1)).get("gid") ?? url.searchParams.get("gid");
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || !sheetId || !/^\d+$/.test(gid ?? "")) {
    throw new Error("Use a Google Sheets URL including the exact tab's gid.");
  }
  return { sheetId, gid, url: url.href };
}

export function selectRows(spec, total) {
  if (!spec || spec.trim().toLowerCase() === "all") return null;
  const selected = new Set();
  for (const token of spec.split(",")) {
    const match = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token.trim());
    if (!match) throw new Error("Rows must be all or numbers/ranges such as 7-10,12.");
    const first = Number(match[1]);
    const last = Number(match[2] ?? match[1]);
    if (first < 1 || first > last || last > total) throw new Error(`Row range ${token} is outside 1-${total}.`);
    for (let n = first; n <= last; n += 1) selected.add(n);
  }
  return selected;
}

export function sheetTitleTargets(rows, rowSpec = "all") {
  const selected = selectRows(rowSpec, rows.length);
  const targets = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    const rowNumber = index + 1;
    if (selected && !selected.has(rowNumber)) continue;
    const row = rows[index];
    const urls = row.flatMap((cell) => [...String(cell).matchAll(/https:\/\/vle\.learning\.moe\.edu\.sg\/[^\s<>"\])]+/g)].map((match) => match[0]));
    if (!urls.length) continue;
    const parsed = urls.map((url) => {
      try { return parseAdminModuleEditUrl(url); }
      catch { throw new Error(`Row ${rowNumber} contains an unsupported SLS URL: ${url}`); }
    });
    if (new Set(parsed.map((target) => target.id.toLowerCase())).size !== 1) {
      throw new Error(`Row ${rowNumber} links to multiple different modules. Separate these before renaming.`);
    }
    const target = parsed[0];
    const key = target.id.toLowerCase();
    const existing = targets.get(key);
    if (existing) existing.rows.push(rowNumber);
    else targets.set(key, { ...target, rows: [rowNumber], sheetTitle: String(row[0] ?? "").trim() });
  }
  if (!targets.size) throw new Error("No SLS module links were found in the selected rows. The Sheet is read-only; check its sharing settings and tab.");
  return [...targets.values()];
}

export function prefixedTitle(title, prefix) {
  if (!title?.trim()) throw new Error("The live module title is blank; no rename will be attempted.");
  const clean = String(prefix).trim();
  if (!clean || /[\r\n\t\x00-\x1f]/.test(clean)) throw new Error("Enter a non-empty, single-line title prefix.");
  const start = `${clean} `;
  return title.toLocaleLowerCase().startsWith(start.toLocaleLowerCase()) ? title : start + title;
}

function cleanSubject(subject) {
  const text = String(subject || "").trim();
  if (!text) throw new Error("A saved Subject tag is blank.");
  const name = text.split(/\s+-\s+/)[0].trim();
  const stream = /(?:^|[^A-Z0-9])G([123])(?:[A-Z]|\b)/i.exec(text)?.[1];
  return `${name}${stream ? ` G${stream}` : ""}`;
}

function shortLevel(level) {
  const text = String(level || "").trim();
  let match = /^Primary\s+(\d+)$/i.exec(text);
  if (match) return { family: "P", number: Number(match[1]), display: `P${match[1]}` };
  match = /^Secondary\s+(\d+)$/i.exec(text);
  if (match) return { family: "Sec", number: Number(match[1]), display: `Sec ${match[1]}` };
  match = /^(?:Junior College|JC)\s*(\d+)$/i.exec(text);
  if (match) return { family: "JC", number: Number(match[1]), display: `JC${match[1]}` };
  if (!text) throw new Error("A saved Level tag is blank.");
  return { family: text, number: null, display: text };
}

function compactLevels(levels) {
  const unique = [...new Map(levels.map((level) => [`${level.family}:${level.display}`, level])).values()];
  const sameFamily = new Set(unique.map((level) => level.family)).size === 1;
  const numeric = unique.every((level) => Number.isInteger(level.number));
  if (!sameFamily || !numeric || unique.length === 1) return unique.map((level) => level.display).join(" & ");
  unique.sort((a, b) => a.number - b.number);
  const consecutive = unique.every((level, index) => index === 0 || level.number === unique[index - 1].number + 1);
  const family = unique[0].family;
  if (!consecutive) return unique.map((level) => level.display).join(" & ");
  if (family === "P" || family === "JC") return `${unique[0].display}-${unique.at(-1).display}`;
  if (family === "Sec") return `Sec ${unique[0].number}-${unique.at(-1).number}`;
  return `${unique[0].display}-${unique.at(-1).display}`;
}

export function curriculumTitleLabel(subjectLevels) {
  if (!Array.isArray(subjectLevels) || subjectLevels.length === 0) {
    throw new Error("No verified Subject and Level tags are available for the title.");
  }
  const groups = new Map();
  for (const entry of subjectLevels) {
    const subject = cleanSubject(entry.subject);
    const level = shortLevel(entry.level);
    const levels = groups.get(subject) ?? [];
    levels.push(level);
    groups.set(subject, levels);
  }
  return [...groups.entries()]
    .map(([subject, levels]) => `${compactLevels(levels)} ${subject}`)
    .join(" / ");
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripExistingPurpose(title, purpose) {
  const clean = purpose.trim().replace(/[\s-]+$/, "").trim();
  return title.replace(new RegExp(`^\\s*${escapeRegExp(clean)}\\s*[-:]\\s*`, "i"), "").trim();
}

function stripLeadingLevel(title) {
  return title.replace(
    /^\s*(?:(?:P(?:rimary)?\s*\d+|Sec(?:ondary)?\s*\d+|JC\s*\d+)(?:\s*(?:-|&|\/|and)\s*(?:P(?:rimary)?\s*|Sec(?:ondary)?\s*|JC\s*)?\d+)?)(?:\s+(?:(?:Foundation|Additional)\s+)?(?:Mathematics|Maths?|A\s*Math|AMath))?\s*[-_:]?\s*/i,
    ""
  ).trim();
}

export function simplifyTopicTitle(title) {
  return String(title || "")
    .replace(
      /\(\s*Algorithm\s*-\s*Recall\s*,\s*Practi[cs]e\s+and\s+Quiz\s+using\s+FA[\s-]*Maths?\s*\)/gi,
      "(FA-Math)"
    )
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function purposeTitle(title, purpose) {
  if (!title?.trim()) throw new Error("The live module title is blank; no rename will be attempted.");
  const cleanPurpose = String(purpose).trim();
  if (!cleanPurpose || /[\r\n\t\x00-\x1f]/.test(cleanPurpose)) throw new Error("Enter a non-empty, single-line title prefix.");
  const base = simplifyTopicTitle(stripLeadingLevel(stripExistingPurpose(title.trim(), cleanPurpose)));
  if (!base) throw new Error("Removing the existing purpose and level leaves no topic title.");
  return `${cleanPurpose.replace(/[\s-]+$/, "").trim()} - ${base}`;
}

export function titleContainsToken(title, requiredText) {
  const token = String(requiredText ?? "").trim();
  if (!token || /[\r\n\t\x00-\x1f]/.test(token)) {
    throw new Error("Enter non-empty, single-line text that must occur in the title.");
  }
  const pattern = new RegExp(`(?:^|[^A-Za-z0-9])${escapeRegExp(token)}(?=$|[^A-Za-z0-9])`, "i");
  return pattern.test(String(title ?? ""));
}

export function prefixRemovalDecision(title, purpose, requiredText) {
  if (!title?.trim()) throw new Error("The live module title is blank; no rename will be attempted.");
  const before = String(title).trim();
  if (!titleContainsToken(before, requiredText)) {
    return { eligible: false, after: before, reason: `does not contain the required title text "${String(requiredText).trim()}"` };
  }
  const after = stripExistingPurpose(before, purpose);
  if (after === before) {
    return { eligible: false, after: before, reason: `does not begin with the prefix "${String(purpose).trim()}"` };
  }
  if (!after) throw new Error("Removing the title prefix would leave a blank module title.");
  return { eligible: true, after, reason: "matching title and removable leading prefix" };
}

export function searchableTitle(title, purpose, subjectLevels) {
  if (!title?.trim()) throw new Error("The live module title is blank; no rename will be attempted.");
  const cleanPurpose = String(purpose).trim();
  if (!cleanPurpose || /[\r\n\t\x00-\x1f]/.test(cleanPurpose)) throw new Error("Enter a non-empty, single-line title prefix.");
  const label = curriculumTitleLabel(subjectLevels);
  const base = simplifyTopicTitle(stripLeadingLevel(stripExistingPurpose(title.trim(), cleanPurpose)));
  if (!base) throw new Error("Removing the existing purpose and level leaves no topic title.");
  return `${cleanPurpose.replace(/[\s-]+$/, "").trim()} - ${label} - ${base}`;
}

// The adapter separates curriculum-independent batch decisions from SLS UI controls.
export async function previewTitles(targets, prefix, adapter, checkpoint = async () => {}, { curriculum = false, excludeText = null } = {}) {
  const plan = [];
  for (const target of targets) {
    const before = await adapter.read(target);
    if (excludeText && titleContainsToken(before, excludeText)) {
      plan.push({
        ...target,
        before,
        after: before,
        subjectLevels: [],
        curriculumLabel: null,
        reason: `contains excluded title text "${String(excludeText).trim()}"`,
        status: "skipped",
      });
      await checkpoint(plan);
      continue;
    }
    const subjectLevels = curriculum ? await adapter.readCurriculum(target) : [];
    const curriculumLabel = curriculum ? curriculumTitleLabel(subjectLevels) : null;
    const after = curriculum ? searchableTitle(before, prefix, subjectLevels) : purposeTitle(before, prefix);
    plan.push({ ...target, before, after, subjectLevels, curriculumLabel, status: before === after ? "unchanged" : "planned" });
    await checkpoint(plan);
  }
  return plan;
}

export async function previewPrefixRemovals(targets, prefix, requiredText, adapter, checkpoint = async () => {}) {
  const plan = [];
  for (const target of targets) {
    const before = await adapter.read(target);
    const decision = prefixRemovalDecision(before, prefix, requiredText);
    plan.push({
      ...target,
      before,
      after: decision.after,
      reason: decision.reason,
      status: decision.eligible ? "planned" : "skipped",
    });
    await checkpoint(plan);
  }
  return plan;
}

export async function applyTitles(plan, adapter, checkpoint = async () => {}, { afterVerified } = {}) {
  for (const item of plan) {
    if ((item.status === "unchanged" || item.status === "verified") && (!afterVerified || item.sheetStatus === "verified")) continue;
    let slsVerified = item.status === "unchanged" || item.status === "verified";
    try {
      if (!slsVerified) {
        const current = await adapter.read(item);
        if (current === item.after) {
          item.status = "unchanged";
        } else {
          if (current !== item.before) throw new Error(`Title changed since preview: "${current}". Review again before continuing.`);
          item.status = "saving";
          await checkpoint(plan);
          await adapter.write(item, item.before, item.after);
          const reopened = await adapter.read(item);
          if (reopened !== item.after) throw new Error(`Saved title did not match after reopening: "${reopened}".`);
          item.status = "verified";
        }
        slsVerified = true;
        await checkpoint(plan);
      }
      if (afterVerified && item.sheetStatus !== "verified") {
        item.sheetStatus = "updating";
        await checkpoint(plan);
        item.sheet = await afterVerified(item);
        item.sheetStatus = "verified";
        await checkpoint(plan);
      }
    } catch (error) {
      if (!slsVerified) item.status = "failed";
      else if (afterVerified) item.sheetStatus = "failed";
      item.error = error.message;
      await checkpoint(plan);
      throw new Error(`Stopped at Sheet row(s) ${item.rows.join(", ")} / ${item.id}: ${error.message}`, { cause: error });
    }
  }
}
