import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  askForModule,
  pickAndRememberModule,
  readRememberedModuleUrl,
  rememberModuleUrl,
  rememberModuleUrlIfSls
} from "../src/module-picker.mjs";

const MODULE_URL =
  "https://vle.learning.moe.edu.sg/community-gallery/module/view/b9d790d6-8775-4fd7-bc11-7d86d2077fbe";

test("the last valid SLS module URL is remembered between launches", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sls-module-picker-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  assert.equal(await readRememberedModuleUrl(root), null);
  await rememberModuleUrl(root, MODULE_URL);
  assert.equal(await readRememberedModuleUrl(root), MODULE_URL);
});

test("an invalid URL cannot replace the remembered SLS module", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sls-module-picker-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));

  await rememberModuleUrl(root, MODULE_URL);
  await assert.rejects(() => rememberModuleUrl(root, "https://example.com/not-sls"), /SLS Community Gallery/);
  assert.equal(await readRememberedModuleUrl(root), MODULE_URL);
});

test("pressing Enter accepts the remembered module instead of the configured fallback", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sls-module-picker-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await rememberModuleUrl(root, MODULE_URL);

  const selected = await askForModule({
    root,
    defaultUrl: "https://vle.learning.moe.edu.sg/community-gallery/module/view/428156f1-90f1-4b64-865f-66b354b5501f",
    ask: async () => "",
    stop: async (message) => {
      throw new Error(message);
    }
  });
  assert.equal(selected, MODULE_URL);
});

test("one launcher's explicit module becomes every launcher's next default", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sls-module-picker-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const replacement =
    "https://vle.learning.moe.edu.sg/admin/community-gallery/module/edit/c0b3b7a0-3a55-41c7-ab7e-b297016843c0/section/105854740/activity/109513713?pageNo=1";

  const target = await pickAndRememberModule({
    root,
    defaultUrl: MODULE_URL,
    argv: ["--url", replacement],
    ask: async () => {
      throw new Error("an explicit URL must not prompt");
    },
    stop: async (message) => {
      throw new Error(message);
    }
  });

  assert.equal(target.id, "c0b3b7a0-3a55-41c7-ab7e-b297016843c0");
  assert.equal(await readRememberedModuleUrl(root), replacement);
  assert.equal(
    await askForModule({
      root,
      defaultUrl: MODULE_URL,
      ask: async () => "",
      stop: async (message) => {
        throw new Error(message);
      }
    }),
    replacement
  );
});

test("recording another website preserves the shared last SLS module", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "sls-module-picker-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await rememberModuleUrl(root, MODULE_URL);

  assert.equal(await rememberModuleUrlIfSls(root, "https://iwant2study.moe.edu.sg/"), false);
  assert.equal(await readRememberedModuleUrl(root), MODULE_URL);
});

test("every public launcher uses the shared module memory", async () => {
  const root = path.resolve(import.meta.dirname, "..");
  const sharedLaunchers = [
    "scripts/one-shot.mjs",
    "scripts/module-action.mjs",
    "scripts/page-break.mjs",
    "scripts/remove-copy.mjs",
    "scripts/selected-workflow.mjs",
    "scripts/smoke-module-actions.mjs",
    "scripts/acp-interactive.mjs"
  ];
  for (const relative of sharedLaunchers) {
    const source = await fs.readFile(path.join(root, relative), "utf8");
    assert.match(source, /pickAndRememberModule/, `${relative} must use the shared picker`);
  }
  const recorder = await fs.readFile(path.join(root, "scripts/record-workflow.mjs"), "utf8");
  assert.match(recorder, /rememberModuleUrlIfSls/, "the recorder must preserve or update shared SLS memory");
});
