// Drives the whole pipeline across every known module and reports what passed.
// Deliberately never deletes: it runs inspect -> scan -> apply --keep-originals
// only. Deletion requires an explicit, separate instruction.
import { spawn } from "node:child_process";
import process from "node:process";

const MODULES = [
  ["P3 multiplication",     "428156f1-90f1-4b64-865f-66b354b5501f", "configs/p3-multiplication-algorithms.json"],
  ["P4 word problems",      "475c8d69-c910-4c2c-9e57-fb9ddce1bf5b", "configs/p4-internal-transfer-total-given.json"],
  ["P5 fractions add/sub",  "aa9e13e8-9a47-4c1c-ae1c-40268ce42935", "configs/p5-fractions-addition-subtraction.json"],
  ["P5 word problems",      "303b9ff7-75b3-44bb-a82f-9b4f3ef433ef", "configs/ast-fa-math-p5-word-problems-involving-whole-numbers-and-dec.json"],
  ["P5 fractions sub/mult", "6fb9a678-02d8-4c24-b035-f4dc7087beb7", "configs/ast-fa-math-p5-fractions-subtracting-fractions-and-multiplyi.json"]
];
const only = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const modes = process.argv.includes("--scan-only") ? ["scan"] : ["scan", "apply"];

// A sweep outlives an SLS session, so an expired session must not be reported as
// a code failure. Re-authenticate once (silent when the profile holds saved
// credentials) and retry; if it still cannot sign in, record BLOCKED, not FAIL.
const AUTH_EXPIRED = /authentication is required/i;

async function runWithAuthRetry(args) {
  let result = await run(args);
  if (!AUTH_EXPIRED.test(result.out)) return result;
  console.log("   session expired mid-sweep; re-authenticating...");
  await runScript("scripts/auth.mjs");
  result = await run(args);
  return result;
}

function runScript(script, args = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: process.cwd() });
    let out = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { out += c; });
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

function run(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ["scripts/run.mjs", ...args], { cwd: process.cwd() });
    let out = "";
    child.stdout.on("data", (c) => { out += c; });
    child.stderr.on("data", (c) => { out += c; });
    child.on("close", (code) => resolve({ code: code ?? 1, out }));
  });
}

const results = [];
for (const [label, id, config] of MODULES) {
  if (only.length && !only.some((o) => label.includes(o) || id.startsWith(o))) continue;
  const url = `https://vle.learning.moe.edu.sg/admin/community-gallery/module/view/${id}/module-plan`;
  for (const mode of modes) {
    const extra = mode === "apply" ? ["--keep-originals"] : [];
    process.stdout.write(`\n### ${label} :: ${mode}\n`);
    const { code, out } = await runWithAuthRetry([mode, "--config", config, "--url", url, "--headless", ...extra]);
    const summary = out
      .split("\n")
      .filter((line) => /Harvested|Reusing|questions read|Learning outcome verified|run stopped|could not|note:|Activity:/.test(line))
      .slice(0, 12)
      .join("\n");
    console.log(summary || "(no notable output)");
    const failure = /run stopped: (.*)/.exec(out);
    const blocked = AUTH_EXPIRED.test(out);
    results.push({
      label,
      mode,
      ok: code === 0,
      blocked: blocked && code !== 0,
      why: failure ? failure[1].slice(0, 110) : ""
    });
  }
}

console.log("\n================ SELF-TEST SUMMARY ================");
for (const r of results) {
  const status = r.ok ? "PASS" : r.blocked ? "BLOCKED" : "FAIL";
  console.log(`${status.padEnd(7)} ${r.label.padEnd(24)} ${r.mode.padEnd(6)} ${r.blocked ? "SLS sign-in required" : r.why}`);
}
const failed = results.filter((r) => !r.ok && !r.blocked).length;
const blocked = results.filter((r) => r.blocked).length;
const passed = results.filter((r) => r.ok).length;
console.log(`${passed} passed, ${failed} failed, ${blocked} blocked (of ${results.length})`);
process.exitCode = failed ? 1 : 0;
