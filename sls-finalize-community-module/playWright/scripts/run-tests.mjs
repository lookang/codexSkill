import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const testsRoot = path.join(root, "tests");
const testFiles = (await fs.readdir(testsRoot, { withFileTypes: true }))
  .filter((entry) => entry.isFile() && entry.name.endsWith(".test.mjs"))
  .map((entry) => path.join(testsRoot, entry.name))
  .sort();

if (testFiles.length === 0) {
  process.stderr.write("No tests/*.test.mjs files were found.\n");
  process.exit(1);
}

// Pass explicit paths instead of a shell glob. cmd.exe used by npm on Windows
// does not expand tests/*.test.mjs consistently, while macOS shells do; explicit
// arguments make the same suite run on both platforms.
const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
