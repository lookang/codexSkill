import path from "node:path";

const DEFAULT_CONFIG = "configs/p3-multiplication-algorithms.json";

export function parseArgs(argv, cwd = process.cwd()) {
  const [mode = "inspect", ...rest] = argv;
  if (!new Set(["scan", "inspect", "apply", "resume", "harvest", "tag"]).has(mode)) {
    throw new Error(`Unknown mode: ${mode}. Use scan, inspect, apply, resume, harvest, or tag.`);
  }

  const options = {
    mode,
    configPath: path.resolve(cwd, DEFAULT_CONFIG),
    targetUrl: null,
    profileDir: path.resolve(cwd, ".auth", "chrome-profile"),
    authStatePath: path.resolve(cwd, ".auth", "sls-state.json"),
    outputRoot: path.resolve(cwd, "output"),
    stateRoot: path.resolve(cwd, ".state"),
    headless: false,
    slowMoMs: 200,
    refreshTaxonomy: false,
    tagQuestions: false,
    tagOnlyQuestion: null,
    deleteOriginals: false,
    renameCopies: true,
    startSection: null,
    timeoutMs: 15_000
  };

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    const next = rest[index + 1];
    if (argument === "--config") {
      options.configPath = path.resolve(cwd, requireValue(argument, next));
      index += 1;
    } else if (argument === "--url") {
      options.targetUrl = requireValue(argument, next);
      index += 1;
    } else if (argument === "--profile") {
      options.profileDir = path.resolve(cwd, requireValue(argument, next));
      index += 1;
    } else if (argument === "--auth-state") {
      options.authStatePath = path.resolve(cwd, requireValue(argument, next));
      index += 1;
    } else if (argument === "--output") {
      options.outputRoot = path.resolve(cwd, requireValue(argument, next));
      index += 1;
    } else if (argument === "--state") {
      options.stateRoot = path.resolve(cwd, requireValue(argument, next));
      index += 1;
    } else if (argument === "--start-section") {
      options.startSection = requireValue(argument, next).toUpperCase();
      index += 1;
    } else if (argument === "--timeout") {
      options.timeoutMs = Number.parseInt(requireValue(argument, next), 10);
      index += 1;
    } else if (argument === "--slow-mo") {
      options.slowMoMs = Number.parseInt(requireValue(argument, next), 10);
      index += 1;
    } else if (argument === "--tag-only-question") {
      options.tagOnlyQuestion = requireValue(argument, next);
      options.tagQuestions = true;
      index += 1;
    } else if (argument === "--tag-questions") {
      options.tagQuestions = true;
    } else if (argument === "--refresh-taxonomy") {
      options.refreshTaxonomy = true;
    } else if (argument === "--headless") {
      options.headless = true;
    } else if (argument === "--headed") {
      options.headless = false;
    } else if (argument === "--delete-originals") {
      options.deleteOriginals = true;
    } else if (argument === "--keep-originals") {
      options.deleteOriginals = false;
    } else if (argument === "--keep-copy-suffix") {
      options.renameCopies = false;
    } else if (argument === "--rename-copies") {
      options.renameCopies = true;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!Number.isFinite(options.slowMoMs) || options.slowMoMs < 0 || options.slowMoMs > 5_000) {
    throw new Error("--slow-mo must be between 0 and 5000 milliseconds.");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000) {
    throw new Error("--timeout must be at least 1000 milliseconds.");
  }
  return options;
}

function requireValue(argument, value) {
  if (!value || value.startsWith("--")) {
    throw new Error(`${argument} requires a value.`);
  }
  return value;
}
