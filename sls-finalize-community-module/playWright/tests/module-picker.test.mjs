import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { askForModule, readRememberedModuleUrl, rememberModuleUrl } from "../src/module-picker.mjs";

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
