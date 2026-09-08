import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { inflateRaw } from "node:zlib";
import { chromium } from "@playwright/test";
import { formatAcpQuestionTopic } from "./acp-interactive.mjs";
import { GuardError } from "./sls-runner.mjs";

const CHATGPT_URL = "https://chatgpt.com/";
const CHATGPT_ORIGIN = "https://chatgpt.com";
const REQUIRED_MODEL = /GPT-5\.6\s+Sol[\s\S]*High/i;
const inflateRawAsync = promisify(inflateRaw);

export function buildGptZipFileName({ activityId, pageIndex }) {
  const id = String(activityId ?? "").replace(/[^A-Za-z0-9_-]/g, "");
  if (!id) throw new Error("A stable SLS activity ID is required for the GPT ZIP name.");
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new Error("A zero-based SLS page index is required for the GPT ZIP name.");
  }
  return `ChatGPT56_${id}_P${pageIndex + 1}.zip`;
}

export function assessGptPage({ faQuestions = [], completedInteractiveFiles = [] } = {}, {
  expectedFileName,
} = {}) {
  if (faQuestions.length === 0) {
    return { status: "skip", reason: "no FA Math question on this page" };
  }
  const gptFiles = completedInteractiveFiles.filter((name) => /^ChatGPT56_.*\.zip$/i.test(name));
  if (expectedFileName && completedInteractiveFiles.includes(expectedFileName)) {
    return { status: "complete", reason: `the verified GPT ZIP ${expectedFileName} is already present` };
  }
  if (gptFiles.length > 0) {
    return {
      status: "blocked",
      reason: `a different GPT ZIP is already present (${gptFiles.join(", ")}); pairing is ambiguous`,
    };
  }
  if (faQuestions.length !== 1) {
    return {
      status: "blocked",
      reason: `${faQuestions.length} FA Math questions share this page; run meaningful page breaks first`,
    };
  }
  const question = faQuestions[0];
  if (!formatAcpQuestionTopic(question)) {
    return { status: "blocked", reason: "the FA Math question text could not be read safely" };
  }
  return {
    status: "candidate",
    reason: "one FA Math question needs one ChatGPT interactive comparison",
    question,
  };
}

export function buildChatGptDeliveryPrompt(prompt, { fileName }) {
  const source = String(prompt ?? "").trim();
  if (!source) throw new Error("The Prompt Library text is required.");
  if (!/\.zip$/i.test(fileName ?? "")) throw new Error("A .zip output filename is required.");
  return [
    "Create the complete educational HTML5 interactive described below.",
    "Use Work mode and produce real downloadable files, not only a code block or explanation.",
    "Do not call image-generation tools. Build the interface directly with HTML, CSS, JavaScript, Canvas, or inline SVG as appropriate.",
    "",
    "DELIVERY CONTRACT:",
    "- Produce a self-contained file named exactly index.html.",
    `- Produce a downloadable ZIP named exactly ${fileName}.`,
    "- Put index.html at the ZIP root, not inside a folder.",
    "- Keep all runtime assets inside the ZIP and use relative paths only.",
    "- Validate the ZIP and confirm that root-level index.html is non-empty before presenting the download.",
    "- Do not claim a browser or viewport test passed unless it was actually run.",
    "- Finish by attaching the real ZIP so an automated browser can download it.",
    "",
    "SOURCE PROMPT LIBRARY SPECIFICATION:",
    source,
  ].join("\n");
}

export async function inspectZipPackage(filePath) {
  const buffer = await fs.readFile(filePath);
  if (buffer.length < 22 || buffer.readUInt32LE(0) !== 0x04034b50) {
    throw new GuardError(`${path.basename(filePath)} is not a readable ZIP archive.`);
  }

  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset < 0) throw new GuardError(`${path.basename(filePath)} has no valid ZIP directory.`);
  const totalEntries = buffer.readUInt16LE(eocdOffset + 10);
  const centralOffset = buffer.readUInt32LE(eocdOffset + 16);
  const entries = [];
  let cursor = centralOffset;

  for (let index = 0; index < totalEntries; index += 1) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) {
      throw new GuardError(`${path.basename(filePath)} has a malformed ZIP directory entry.`);
    }
    const flags = buffer.readUInt16LE(cursor + 8);
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const crc = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const nameStart = cursor + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd > buffer.length) {
      throw new GuardError(`${path.basename(filePath)} contains a truncated ZIP filename.`);
    }
    const name = buffer.subarray(nameStart, nameEnd).toString("utf8").replace(/\\/g, "/");
    if (flags & 0x1) throw new GuardError(`${path.basename(filePath)} contains an encrypted entry: ${name}.`);
    if (unsafeZipPath(name)) throw new GuardError(`${path.basename(filePath)} contains an unsafe path: ${name}.`);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    entries.push({
      name,
      flags,
      compressionMethod,
      crc,
      compressedSize,
      uncompressedSize,
      localHeaderOffset,
    });
    cursor = nameEnd + extraLength + commentLength;
  }

  const rootIndex = entries.find((entry) => entry.name === "index.html");
  if (!rootIndex) {
    const nested = entries.find((entry) => /(^|\/)index\.html$/i.test(entry.name));
    const detail = nested ? ` It was nested at ${nested.name}.` : "";
    throw new GuardError(`${path.basename(filePath)} does not contain root-level index.html.${detail}`);
  }
  const rootIndexContents = await readZipEntry(buffer, rootIndex, path.basename(filePath));
  if (rootIndexContents.length < 200) {
    throw new GuardError(`${path.basename(filePath)} has an empty or implausibly small root index.html.`);
  }
  if (!/<html\b|<!doctype\s+html/i.test(rootIndexContents.toString("utf8", 0, 4096))) {
    throw new GuardError(`${path.basename(filePath)} has a root index.html that is not recognisable HTML.`);
  }
  return {
    filePath,
    bytes: buffer.length,
    entryCount: entries.length,
    entries,
    rootIndex: { ...rootIndex, verifiedBytes: rootIndexContents.length },
  };
}

export async function openChatGptSession({
  profileDir,
  existingContext,
  storageStatePath,
  headless = false,
  slowMoMs = 100,
  timeoutMs = 30_000,
  waitForUser,
} = {}) {
  if (headless) {
    throw new GuardError("ChatGPT Work generation requires visible Chrome; remove --headless for the apply run.");
  }
  let context = existingContext;
  let page = findExistingChatGptPage(existingContext);
  let ownedContext = false;
  if (context) {
    if (page) console.log("Using the signed-in ChatGPT tab already open beside SLS.");
    else {
      console.log("Opening ChatGPT in a new tab beside SLS...");
      page = await context.newPage();
    }
  } else {
    await fs.mkdir(profileDir, { recursive: true });
    context = await launchChatGptPersistentContext({
      profileDir,
      launchOptions: chatGptChromeLaunchOptions({ headless: false, slowMoMs }),
      waitForUser,
    });
    page = context.pages()[0] ?? (await context.newPage());
    ownedContext = true;
  }
  page.setDefaultTimeout(timeoutMs);
  page.setDefaultNavigationTimeout(Math.max(timeoutMs, 60_000));
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: CHATGPT_ORIGIN }).catch(() => {});
  if (!isChatGptPage(page)) await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });
  const model = await ensureChatGptReady(page, { waitForUser });
  if (existingContext && storageStatePath) {
    await fs.mkdir(path.dirname(storageStatePath), { recursive: true });
    await context.storageState({ path: storageStatePath, indexedDB: true });
    console.log("Saved the combined SLS and ChatGPT session for the next GPT run.");
  }
  return { context, page, waitForUser, ownedContext, model };
}

export function findExistingChatGptPage(context) {
  if (!context?.pages) return null;
  return [...context.pages()].reverse().find(isChatGptPage) ?? null;
}

function isChatGptPage(page) {
  try {
    return new URL(page.url()).hostname === "chatgpt.com";
  } catch {
    return false;
  }
}

export async function launchChatGptPersistentContext({
  profileDir,
  launchOptions,
  waitForUser,
  launch = (dir, options) => chromium.launchPersistentContext(dir, options),
} = {}) {
  try {
    return await launch(profileDir, launchOptions);
  } catch (error) {
    if (!isProfileLockError(error)) throw error;
    if (!waitForUser) {
      throw new GuardError(
        `The dedicated ChatGPT browser profile is already open. Close that automation window and retry. Profile: ${profileDir}`,
      );
    }
    console.log("\nThe dedicated ChatGPT automation Chrome window is already open.");
    console.log("Close that window only; your normal Chrome windows can remain open.");
    await waitForUser("After closing the ChatGPT automation window, press Enter to continue this run: ");
    try {
      return await launch(profileDir, launchOptions);
    } catch (retryError) {
      if (!isProfileLockError(retryError)) throw retryError;
      throw new GuardError(
        `The dedicated ChatGPT profile is still locked after the retry. Close its Chrome window and rerun. Profile: ${profileDir}`,
      );
    }
  }
}

function isProfileLockError(error) {
  return /existing browser session|already in use|ProcessSingleton|profile.*lock/i.test(String(error?.message ?? error));
}

export function chatGptChromeLaunchOptions({ headless = false, slowMoMs = 100 } = {}) {
  return {
    channel: "chrome",
    headless,
    viewport: headless ? { width: 1440, height: 1000 } : null,
    acceptDownloads: true,
    slowMo: slowMoMs,
    chromiumSandbox: true,
    // Google's OAuth flow rejects Playwright's default --no-sandbox launch and
    // may also show an automation warning. Keep the real Chrome sandbox enabled
    // and omit only the automation banner flag; all other Playwright defaults stay.
    ignoreDefaultArgs: ["--enable-automation"],
    args: headless ? [] : ["--start-maximized"],
  };
}

export async function generateChatGptZip(session, prompt, {
  fileName,
  downloadDir,
  timeoutMs = 30 * 60_000,
} = {}) {
  const { page } = session;
  await fs.mkdir(downloadDir, { recursive: true });
  await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });
  session.model = await ensureChatGptReady(page, { waitForUser: session.waitForUser });
  const deliveryPrompt = buildChatGptDeliveryPrompt(prompt, { fileName });
  const composer = chatGptComposer(page);
  await composer.click();

  let pasted = false;
  try {
    await page.evaluate((text) => navigator.clipboard.writeText(text), deliveryPrompt);
    await composer.press(process.platform === "darwin" ? "Meta+V" : "Control+V");
    await page.waitForTimeout(800);
    pasted = true;
  } catch {
    await composer.fill(deliveryPrompt);
  }

  if (pasted) {
    const attachedPrompt = page.getByText(/Pasted text.*\.txt/i).last();
    if (await isVisible(attachedPrompt)) {
      await composer.fill(
        `Create and attach the downloadable ${fileName} requested in the pasted Prompt Library specification.`,
      );
    }
  }

  const send = page.getByRole("button", { name: /Send prompt/i }).last();
  if (await isUsable(send)) await send.click();
  else await composer.press("Enter");

  await page.waitForURL(/chatgpt\.com\/c\//, { timeout: 60_000 }).catch(() => {});
  const chatUrl = page.url();
  console.log(`      ChatGPT Work started: ${chatUrl}`);
  const zipButton = await waitForChatGptZip(page, fileName, timeoutMs);
  const targetPath = path.join(downloadDir, fileName);
  const download = await triggerChatGptDownload(page, zipButton, timeoutMs);
  const failure = await download.failure();
  if (failure) throw new GuardError(`ChatGPT ZIP download failed: ${failure}`);
  await download.saveAs(targetPath);
  const zip = await inspectZipPackage(targetPath);
  return {
    fileName,
    filePath: targetPath,
    chatUrl,
    zipBytes: zip.bytes,
    zipEntryCount: zip.entryCount,
    rootIndexBytes: zip.rootIndex.verifiedBytes,
    chatGptModel: session.model,
  };
}

export async function ensureChatGptReady(page, { waitForUser } = {}) {
  await page.waitForTimeout(1_500);
  assertGoogleOauthWasNotRejected(page);
  if (!(await isVisible(chatGptComposer(page)))) {
    console.log("\nChatGPT sign-in is required in the newly opened Chrome window.");
    console.log("This browser context does not read or print your credentials.");
    if (!waitForUser) throw new GuardError("ChatGPT authentication is required.");
    await waitForUser(
      "Sign in to ChatGPT, then press Enter here. The runner will prefer Work and GPT-5.6 Sol High when available... ",
    );
    assertGoogleOauthWasNotRejected(page);
    await page.goto(CHATGPT_URL, { waitUntil: "domcontentloaded" });
  }
  await chatGptComposer(page).waitFor({ state: "visible", timeout: 60_000 }).catch(() => {
    throw new GuardError("ChatGPT authentication was not verified after the sign-in pause.");
  });

  return resolvePreferredChatGptModel(page);
}

export async function resolvePreferredChatGptModel(page, { warn = console.warn } = {}) {
  await selectWorkMode(page);
  if (!(await requiredModelIsVisible(page))) await trySelectRequiredModel(page);
  await selectWorkMode(page);
  if (await requiredModelIsVisible(page)) {
    const model = { requested: "GPT-5.6 Sol High", label: "GPT-5.6 Sol High", preferred: true };
    console.log("ChatGPT Work verified with GPT-5.6 Sol High.");
    return model;
  }

  const label = await currentChatGptModelLabel(page);
  warn([
    "",
    "=======================================================================",
    "WARNING: GPT-5.6 Sol High is not available in this ChatGPT account/UI.",
    `CONTINUING WITH: ${label}`,
    "The generated interactive may be weaker; ZIP and SLS upload checks remain strict.",
    "=======================================================================",
  ].join("\n"));
  return { requested: "GPT-5.6 Sol High", label, preferred: false };
}

function assertGoogleOauthWasNotRejected(page) {
  if (/accounts\.google\.com\/.*\/signin\/rejected/i.test(page.url())) {
    throw new GuardError(
      "Google rejected this browser sign-in. Close the old ChatGPT automation window and rerun " +
        "RUN-SLS-GPT.cmd; the hardened launcher now enables Chrome's sandbox. If the page was " +
        "left over from an earlier run, use Try again after relaunching.",
    );
  }
}

async function selectWorkMode(page) {
  const work = page.getByRole("radio", { name: /^Work$/i });
  if ((await work.count()) === 0) return;
  if (!(await work.isChecked().catch(() => false))) await work.check().catch(() => work.click());
}

async function requiredModelIsVisible(page) {
  const buttons = page.locator("button:visible").filter({ hasText: REQUIRED_MODEL });
  return (await buttons.count().catch(() => 0)) > 0;
}

async function trySelectRequiredModel(page) {
  const selector = page.locator("button:visible").filter({ hasText: /GPT[-\s]?\d/i }).last();
  if (!(await isUsable(selector))) return;
  await selector.click();
  await page.waitForTimeout(300);
  const model = page.getByText(/GPT-5\.6\s+Sol/i).last();
  if (await isVisible(model)) {
    await model.click().catch(async () => {
      await model.locator("xpath=ancestor-or-self::*[@role='menuitem'][1]").click();
    });
    await page.waitForTimeout(300);
  }
  if (await requiredModelIsVisible(page)) return;
  const high = page.getByText(/^High$/i).last();
  if (await isVisible(high)) await high.click();
}

async function currentChatGptModelLabel(page) {
  const likelySelectors = page.locator([
    '[data-testid*="model-switcher"]:visible',
    'button[aria-label*="model" i]:visible',
  ].join(", "));
  const likely = (await likelySelectors.allInnerTexts().catch(() => []))
    .map((value) => value.replace(/\s+/g, " ").trim())
    .find(Boolean);
  if (likely) return likely;

  const buttonTexts = await page.locator("button:visible").allInnerTexts().catch(() => []);
  return buttonTexts
    .map((value) => value.replace(/\s+/g, " ").trim())
    .find((value) => /(?:GPT|ChatGPT|Thinking|Instant|Auto|Pro|o\d)/i.test(value))
    || "the currently selected ChatGPT model (exact label unavailable)";
}

async function waitForChatGptZip(page, fileName, timeoutMs) {
  const started = Date.now();
  let nextUpdate = started + 30_000;
  while (Date.now() - started < timeoutMs) {
    const buttons = page.getByRole("button", { name: fileName, exact: true });
    for (let index = (await buttons.count()) - 1; index >= 0; index -= 1) {
      const button = buttons.nth(index);
      if (await isUsable(button)) return button;
    }
    const links = page.getByRole("link", { name: fileName, exact: true });
    for (let index = (await links.count()) - 1; index >= 0; index -= 1) {
      const link = links.nth(index);
      if (await isUsable(link)) return link;
    }
    const body = await page.locator("body").innerText().catch(() => "");
    if (/usage limit|message limit|something went wrong|network error|unable to complete/i.test(body)) {
      throw new GuardError("ChatGPT reported an error or usage limit before producing the ZIP.");
    }
    if (Date.now() >= nextUpdate) {
      console.log(`      Still waiting for ChatGPT ZIP (${Math.round((Date.now() - started) / 1000)}s elapsed)...`);
      nextUpdate += 30_000;
    }
    await page.waitForTimeout(5_000);
  }
  throw new GuardError(
    `ChatGPT did not expose the downloadable ${fileName} within ${Math.round(timeoutMs / 1000)} seconds.`,
  );
}

async function triggerChatGptDownload(page, zipButton, timeoutMs) {
  const attemptTimeout = Math.min(20_000, timeoutMs);
  try {
    return await Promise.all([
      page.waitForEvent("download", { timeout: attemptTimeout }),
      zipButton.click(),
    ]).then(([download]) => download);
  } catch {
    const downloadButton = page.getByRole("button", { name: /^Download file$/i }).last();
    if (!(await isUsable(downloadButton))) {
      throw new GuardError("ChatGPT exposed the ZIP name but no working download control.");
    }
    return Promise.all([
      page.waitForEvent("download", { timeout: attemptTimeout }),
      downloadButton.click(),
    ]).then(([download]) => download).catch(() => {
      throw new GuardError("ChatGPT's ZIP download control did not produce a browser download.");
    });
  }
}

function chatGptComposer(page) {
  return page.locator('#prompt-textarea:visible, [data-testid="prompt-textarea"]:visible').last();
}

function findEndOfCentralDirectory(buffer) {
  const minimum = Math.max(0, buffer.length - 65_557);
  for (let index = buffer.length - 22; index >= minimum; index -= 1) {
    if (buffer.readUInt32LE(index) === 0x06054b50) return index;
  }
  return -1;
}

function unsafeZipPath(name) {
  return !name || name.startsWith("/") || /^[A-Za-z]:/.test(name) ||
    name.split("/").some((part) => part === "..");
}

async function readZipEntry(buffer, entry, archiveName) {
  if (entry.uncompressedSize > 100 * 1024 * 1024 || entry.compressedSize > 50 * 1024 * 1024) {
    throw new GuardError(`${archiveName} contains an implausibly large root index.html.`);
  }
  const offset = entry.localHeaderOffset;
  if (offset + 30 > buffer.length || buffer.readUInt32LE(offset) !== 0x04034b50) {
    throw new GuardError(`${archiveName} has a malformed local header for index.html.`);
  }
  const nameLength = buffer.readUInt16LE(offset + 26);
  const extraLength = buffer.readUInt16LE(offset + 28);
  const localName = buffer.subarray(offset + 30, offset + 30 + nameLength)
    .toString("utf8")
    .replace(/\\/g, "/");
  if (localName !== entry.name) {
    throw new GuardError(`${archiveName} has inconsistent ZIP headers for root index.html.`);
  }
  const dataStart = offset + 30 + nameLength + extraLength;
  const dataEnd = dataStart + entry.compressedSize;
  if (dataEnd > buffer.length) {
    throw new GuardError(`${archiveName} contains truncated index.html data.`);
  }
  const compressed = buffer.subarray(dataStart, dataEnd);
  let contents;
  if (entry.compressionMethod === 0) contents = Buffer.from(compressed);
  else if (entry.compressionMethod === 8) contents = await inflateRawAsync(compressed).catch(() => null);
  else {
    throw new GuardError(
      `${archiveName} uses unsupported ZIP compression method ${entry.compressionMethod} for index.html.`,
    );
  }
  if (!contents || contents.length !== entry.uncompressedSize) {
    throw new GuardError(`${archiveName} could not verify the full contents of root index.html.`);
  }
  if (crc32(contents) !== entry.crc) {
    throw new GuardError(`${archiveName} failed the CRC check for root index.html.`);
  }
  return contents;
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

async function isVisible(locator) {
  return (await locator.count().catch(() => 0)) > 0 && await locator.isVisible().catch(() => false);
}

async function isUsable(locator) {
  return await isVisible(locator) && await locator.isEnabled().catch(() => false);
}
