import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { deflateRawSync } from "node:zlib";
import { chromium } from "@playwright/test";
import {
  assessGptPage,
  buildChatGptDeliveryPrompt,
  buildGptZipFileName,
  chatGptChromeLaunchOptions,
  findExistingChatGptPage,
  inspectZipPackage,
  launchChatGptPersistentContext,
  resolvePreferredChatGptModel,
} from "../src/gpt-interactive.mjs";
import {
  readAcpPageState,
  selectFileComponentFromAddMenu,
} from "../src/acp-interactive-runner.mjs";

test("GPT ZIP names deterministically bind an activity and SLS page", () => {
  assert.equal(
    buildGptZipFileName({ activityId: "109307754", pageIndex: 0 }),
    "ChatGPT56_109307754_P1.zip",
  );
});

test("ChatGPT Chrome keeps its sandbox and suppresses the automation banner flag", () => {
  const options = chatGptChromeLaunchOptions({ headless: false, slowMoMs: 75 });
  assert.equal(options.channel, "chrome");
  assert.equal(options.chromiumSandbox, true);
  assert.deepEqual(options.ignoreDefaultArgs, ["--enable-automation"]);
  assert.equal(options.args.includes("--no-sandbox"), false);
  assert.equal(options.slowMo, 75);
});

test("the most recently opened ChatGPT tab in the SLS context is reused", () => {
  const sls = { url: () => "https://vle.learning.moe.edu.sg/admin/community-gallery" };
  const olderChat = { url: () => "https://chatgpt.com/" };
  const prompt = { url: () => "https://iwant2study.moe.edu.sg/promptLibrary/" };
  const signedInChat = { url: () => "https://chatgpt.com/c/example" };
  const context = { pages: () => [sls, olderChat, prompt, signedInChat] };
  assert.equal(findExistingChatGptPage(context), signedInChat);
});

test("an unavailable preferred ChatGPT model warns and continues with the visible fallback", async (t) => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  await page.setContent(`
    <label><input type="radio" role="radio" aria-label="Work">Work</label>
    <button data-testid="model-switcher-dropdown-button">GPT-4o</button>
  `);
  const warnings = [];
  const model = await resolvePreferredChatGptModel(page, {
    warn: (message) => warnings.push(message),
  });
  assert.deepEqual(model, {
    requested: "GPT-5.6 Sol High",
    label: "GPT-4o",
    preferred: false,
  });
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /WARNING: GPT-5\.6 Sol High is not available/);
  assert.match(warnings[0], /CONTINUING WITH: GPT-4o/);
});

test("a locked dedicated ChatGPT profile pauses once and retries in the same run", async () => {
  const expected = { pages: () => [] };
  let launches = 0;
  let pauses = 0;
  const context = await launchChatGptPersistentContext({
    profileDir: "dedicated-chatgpt-profile",
    launchOptions: { channel: "chrome" },
    waitForUser: async () => { pauses += 1; },
    launch: async () => {
      launches += 1;
      if (launches === 1) throw new Error("ProcessSingleton: profile already in use");
      return expected;
    },
  });
  assert.equal(context, expected);
  assert.equal(launches, 2);
  assert.equal(pauses, 1);
});

test("a dedicated ChatGPT profile that remains locked stops after one retry", async () => {
  let launches = 0;
  await assert.rejects(
    launchChatGptPersistentContext({
      profileDir: "dedicated-chatgpt-profile",
      launchOptions: { channel: "chrome" },
      waitForUser: async () => {},
      launch: async () => {
        launches += 1;
        throw new Error("existing browser session is already in use");
      },
    }),
    /still locked after the retry/,
  );
  assert.equal(launches, 2);
});

test("a native ACP ZIP is preserved while one GPT comparison remains eligible", () => {
  const question = { number: 1, text: "Add one quarter and one half." };
  const result = assessGptPage({
    faQuestions: [question],
    completedInteractiveFiles: ["Interactive_20260907104325.zip"],
  }, { expectedFileName: "ChatGPT56_109307754_P1.zip" });
  assert.equal(result.status, "candidate");
  assert.equal(result.question, question);
});

test("the exact deterministic GPT ZIP makes a rerun idempotent", () => {
  const result = assessGptPage({
    faQuestions: [{ number: 1, text: "Add one quarter and one half." }],
    completedInteractiveFiles: ["Interactive_original.zip", "ChatGPT56_109307754_P1.zip"],
  }, { expectedFileName: "ChatGPT56_109307754_P1.zip" });
  assert.equal(result.status, "complete");
});

test("a different GPT ZIP blocks an ambiguous second comparison", () => {
  const result = assessGptPage({
    faQuestions: [{ number: 1, text: "Add one quarter and one half." }],
    completedInteractiveFiles: ["ChatGPT56_other_P1.zip"],
  }, { expectedFileName: "ChatGPT56_109307754_P1.zip" });
  assert.equal(result.status, "blocked");
  assert.match(result.reason, /pairing is ambiguous/i);
});

test("multi-question pages remain blocked until meaningful page breaks exist", () => {
  const result = assessGptPage({
    faQuestions: [{ text: "Q1" }, { text: "Q2" }],
    completedInteractiveFiles: [],
  }, { expectedFileName: "ChatGPT56_109307754_P1.zip" });
  assert.equal(result.status, "blocked");
  assert.match(result.reason, /page breaks/i);
});

test("the ChatGPT prompt requires a real root-index ZIP with the exact name", () => {
  const output = buildChatGptDeliveryPrompt("Build a fractions model.", {
    fileName: "ChatGPT56_109307754_P1.zip",
  });
  assert.match(output, /downloadable ZIP named exactly ChatGPT56_109307754_P1\.zip/);
  assert.match(output, /index\.html at the ZIP root/i);
  assert.match(output, /Do not call image-generation tools/i);
  assert.match(output, /Build a fractions model\./);
});

test("ZIP inspection verifies the actual root index.html bytes and CRC", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "sls-gpt-zip-"));
  try {
    const file = path.join(temp, "valid.zip");
    const html = Buffer.from(`<!doctype html><html><body>${"working interactive ".repeat(20)}</body></html>`);
    await fs.writeFile(file, simpleZip("index.html", html));
    const result = await inspectZipPackage(file);
    assert.equal(result.rootIndex.name, "index.html");
    assert.equal(result.rootIndex.verifiedBytes, html.length);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test("ZIP inspection accepts normally deflated root index.html content", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "sls-gpt-zip-"));
  try {
    const file = path.join(temp, "deflated.zip");
    const html = Buffer.from(`<!doctype html><html><body>${"deflated interactive ".repeat(20)}</body></html>`);
    await fs.writeFile(file, simpleZip("index.html", html, { deflate: true }));
    const result = await inspectZipPackage(file);
    assert.equal(result.rootIndex.compressionMethod, 8);
    assert.equal(result.rootIndex.verifiedBytes, html.length);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test("ZIP inspection rejects index.html nested inside a folder", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "sls-gpt-zip-"));
  try {
    const file = path.join(temp, "nested.zip");
    const html = Buffer.from(`<!doctype html><html><body>${"nested ".repeat(40)}</body></html>`);
    await fs.writeFile(file, simpleZip("package/index.html", html));
    await assert.rejects(inspectZipPackage(file), /root-level index\.html.*nested/i);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test("ZIP inspection rejects a corrupt root index.html CRC", async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "sls-gpt-zip-"));
  try {
    const file = path.join(temp, "corrupt.zip");
    const html = Buffer.from(`<!doctype html><html><body>${"content ".repeat(40)}</body></html>`);
    const zip = simpleZip("index.html", html);
    zip[30 + Buffer.byteLength("index.html") + 20] ^= 0xff;
    await fs.writeFile(file, zip);
    await assert.rejects(inspectZipPackage(file), /CRC check/i);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});

test("SLS page state recognises uploaded ZIPs outside native Text components", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <div class="lesson-activity-component file" style="display:block;width:300px;height:50px">
        <button>ChatGPT56_109307754_P1.zip</button>
      </div>
    `);
    const state = await readAcpPageState(page);
    assert.equal(state.completedInteractives, 1);
    assert.deepEqual(state.completedInteractiveFiles, ["ChatGPT56_109307754_P1.zip"]);
  } finally {
    await browser.close();
  }
});

test("the current Text/Media menu opens File from Device through hover", async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`
      <style>
        .menu, .submenu { list-style: none; margin: 0; padding: 0; }
        .submenu { display: none; position: absolute; left: 120px; top: 0; }
        li { position: relative; width: 160px; min-height: 32px; }
        li:hover > .submenu { display: block; }
        .item-wrapper { display: block; height: 32px; }
      </style>
      <div class="add-component-bar">
        <div class="multi-layer-menu">
          <ul class="menu">
            <li class="text-media">
              <span class="item-wrapper"><div>Text/Media</div></span>
              <ul class="submenu">
                <li><span><div id="file-option">File from Device</div></span></li>
              </ul>
            </li>
          </ul>
        </div>
      </div>
      <script>
        document.querySelector("#file-option").addEventListener("click", () => {
          document.body.dataset.selected = "file";
        });
      </script>
    `);
    await selectFileComponentFromAddMenu(page, { timeoutMs: 1000 });
    assert.equal(await page.locator("body").getAttribute("data-selected"), "file");
  } finally {
    await browser.close();
  }
});

function simpleZip(name, contents, { deflate = false } = {}) {
  const fileName = Buffer.from(name);
  const crc = crc32(contents);
  const payload = deflate ? deflateRawSync(contents) : contents;
  const method = deflate ? 8 : 0;
  const local = Buffer.alloc(30 + fileName.length);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(0, 6);
  local.writeUInt16LE(method, 8);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(payload.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(fileName.length, 26);
  fileName.copy(local, 30);

  const central = Buffer.alloc(46 + fileName.length);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(0, 8);
  central.writeUInt16LE(method, 10);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(payload.length, 20);
  central.writeUInt32LE(contents.length, 24);
  central.writeUInt16LE(fileName.length, 28);
  central.writeUInt32LE(0, 42);
  fileName.copy(central, 46);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(local.length + payload.length, 16);
  return Buffer.concat([local, payload, central, eocd]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
