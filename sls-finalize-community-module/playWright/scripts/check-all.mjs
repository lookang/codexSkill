import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { loadConfig } from "../src/io.mjs";

const root = process.cwd();
const sourceRoots = ["scripts", "src", "tests"];
const jsonRoots = ["configs", "taxonomy"];

const sourceFiles = (await Promise.all(sourceRoots.map((dir) => filesUnder(path.join(root, dir)))))
  .flat()
  .filter((file) => file.endsWith(".mjs"));

for (const file of sourceFiles) {
  const checked = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
    windowsHide: true
  });
  if (checked.status !== 0) {
    process.stderr.write(checked.stderr || checked.stdout || `Syntax check failed: ${file}\n`);
    process.exit(1);
  }
}

const jsonFiles = [path.join(root, "package.json"), path.join(root, "package-lock.json")];
for (const dir of jsonRoots) jsonFiles.push(...(await filesUnder(path.join(root, dir))).filter((file) => file.endsWith(".json")));
for (const file of jsonFiles) JSON.parse(await fs.readFile(file, "utf8"));

const configFiles = jsonFiles.filter((file) => file.includes(`${path.sep}configs${path.sep}`));
for (const file of configFiles) await loadConfig(file);

const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const cmdFiles = (await filesUnder(root, { recursive: false })).filter((file) => file.endsWith(".cmd"));
const windowsActions = new Map();
for (const file of cmdFiles) {
  const text = await fs.readFile(file, "utf8");
  const base = path.basename(file, ".cmd");
  let foundAction = base === "00-install-and-check" ? "setup" : null;
  for (const match of text.matchAll(/npm\.cmd\s+run\s+([^\s%]+)/gi)) {
    const script = match[1];
    if (!packageJson.scripts?.[script]) {
      throw new Error(`${path.basename(file)} calls missing package script "${script}".`);
    }
    foundAction ??= script;
  }
  if (!foundAction) throw new Error(`${path.basename(file)} exposes no npm package action.`);
  windowsActions.set(base, foundAction);
}

const macLaunchers = (await filesUnder(root, { recursive: false })).filter((file) => file.endsWith(".command"));
const macActions = new Map();
for (const file of macLaunchers) {
  const source = await fs.readFile(file, "utf8");
  const base = path.basename(file, ".command");
  // GitHub's Windows checkout can materialize text files with CRLF even though
  // Git stores them with LF. Accept either newline while still requiring the
  // portable POSIX shell shebang as the first line.
  if (!/^#!\/bin\/sh\r?\n/.test(source)) throw new Error(`${path.basename(file)} must start with #!/bin/sh.`);
  if (!source.includes('"$@"')) throw new Error(`${path.basename(file)} does not forward all command-line arguments.`);
  const match = /run-macos\.sh"\s+([^\s"']+)/.exec(source);
  if (!match) throw new Error(`${path.basename(file)} does not call scripts/run-macos.sh.`);
  if (match[1] !== "setup" && !packageJson.scripts?.[match[1]]) {
    throw new Error(`${path.basename(file)} calls missing package script "${match[1]}".`);
  }
  macActions.set(base, match[1]);
}

for (const [base, action] of windowsActions) {
  if (!macActions.has(base)) throw new Error(`${base}.cmd has no matching ${base}.command launcher.`);
  if (macActions.get(base) !== action) {
    throw new Error(`${base}.command runs "${macActions.get(base)}" but ${base}.cmd runs "${action}".`);
  }
}
for (const base of macActions.keys()) {
  if (!windowsActions.has(base)) throw new Error(`${base}.command has no matching ${base}.cmd launcher.`);
}

const macRunner = path.join(root, "scripts", "run-macos.sh");
const macRunnerSource = await fs.readFile(macRunner, "utf8");
for (const action of new Set(macActions.values())) {
  if (action !== "setup" && !macRunnerSource.includes(action)) {
    throw new Error(`scripts/run-macos.sh does not allow the ${action} launcher action.`);
  }
}

// On macOS and Linux, ask the system shell to parse every launcher too. The
// static parity checks above still run on Windows, while the CI macOS job makes
// this a real executable-shell gate for every published .command file.
if (process.platform !== "win32") {
  const shellCheck = spawnSync("sh", ["-n", macRunner, ...macLaunchers], {
    cwd: root,
    encoding: "utf8"
  });
  if (shellCheck.status !== 0) {
    throw new Error(shellCheck.stderr || shellCheck.stdout || "macOS launcher shell syntax check failed.");
  }
}

console.log(
  `Checked ${sourceFiles.length} JavaScript files, ${jsonFiles.length} JSON files, ` +
    `${configFiles.length} SLS configs, ${cmdFiles.length} CMD launchers, and ` +
    `${macLaunchers.length} macOS launchers.`
);

async function filesUnder(dir, { recursive = true } = {}) {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isFile()) files.push(full);
    else if (recursive && entry.isDirectory()) files.push(...(await filesUnder(full)));
  }
  return files;
}
