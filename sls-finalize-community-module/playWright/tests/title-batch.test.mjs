import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { DEFAULT_TITLE_SHEET, parseTitleSheet, selectRows, sheetTitleTargets, prefixedTitle, curriculumTitleLabel, simplifyTopicTitle, purposeTitle, searchableTitle, titleContainsToken, prefixRemovalDecision, previewPrefixRemovals, previewTitles, applyTitles } from "../src/title-batch.mjs";
import { createTitleBrowser, TitleLoginRequired } from "../src/title-browser.mjs";

const id = "bd398506-fdbd-43b0-9c5f-c26f5affaf19";
const id2 = "86334ad4-7247-479c-9cc8-22155e8ae224";
const url = (uuid = id) => `https://vle.learning.moe.edu.sg/community-gallery/module/view/${uuid}`;
const rows = [["Title", "URL"], ["Old sheet title", url(), url().replace("/community", "/admin/community")], ["Duplicate", url()], ["Second", url(id2)]];

test("exact Sheet tab and host validation", () => {
  assert.equal(parseTitleSheet(DEFAULT_TITLE_SHEET).gid, "447883961");
  assert.equal(parseTitleSheet(`[Sheet](${DEFAULT_TITLE_SHEET})`).sheetId, "1GnyhDb2_jjOK2GBXHDtzBCSJz7-4xdwH-hOM3jl-Nr4");
  assert.throws(() => parseTitleSheet(DEFAULT_TITLE_SHEET.replace("docs.google.com", "evil.example")));
  assert.throws(() => parseTitleSheet("https://docs.google.com/spreadsheets/d/abc/edit"));
});

test("Sheet targets deduplicate public/admin URLs and repeated rows", () => {
  const targets = sheetTitleTargets(rows);
  assert.equal(targets.length, 2);
  assert.deepEqual(targets[0].rows, [2, 3]);
  assert.equal(targets[0].id, id);
  assert.equal(sheetTitleTargets(rows, "4")[0].id, id2);
  assert.deepEqual(sheetTitleTargets([["Markdown", `[Module](${url()})`]])[0].rows, [1]);
});

test("ambiguous or unsupported links stop rather than choose the wrong module", () => {
  assert.throws(() => sheetTitleTargets([["Mixed", url(), url(id2)]]), /multiple different/);
  assert.throws(() => sheetTitleTargets([["Broken", "https://vle.learning.moe.edu.sg/login"]]), /unsupported/);
  assert.throws(() => sheetTitleTargets([["No modules"]]), /No SLS/);
});

test("Sheet row ranges are bounded and validated", () => {
  assert.deepEqual([...selectRows("2-3,4", 4)], [2, 3, 4]);
  assert.equal(selectRows("all", 4), null);
  for (const spec of ["0", "4-2", "1-500000000", "abc", "2,"]) assert.throws(() => selectRows(spec, 4));
});

test("prefix is a single line, preserves titles and is idempotent", () => {
  assert.equal(prefixedTitle("Angles & Shapes", "Topical Revision -"), "Topical Revision - Angles & Shapes");
  assert.equal(prefixedTitle("Topical Revision - Angles", "Topical Revision - "), "Topical Revision - Angles");
  assert.equal(prefixedTitle("TOPICAL REVISION - Angles", "Topical Revision -"), "TOPICAL REVISION - Angles");
  for (const prefix of ["", " ", "One\nTwo"]) assert.throws(() => prefixedTitle("Angles", prefix));
  assert.throws(() => prefixedTitle("", "Revision -"));
});

test("curriculum labels use compact, searchable saved Subject and Level values", () => {
  assert.equal(curriculumTitleLabel([
    { subject: "Mathematics - MATHS", level: "Primary 1" }
  ]), "P1 Mathematics");
  assert.equal(curriculumTitleLabel([
    { subject: "Mathematics - MATHS", level: "Primary 4" },
    { subject: "Mathematics - MATHS", level: "Primary 5" }
  ]), "P4-P5 Mathematics");
  assert.equal(curriculumTitleLabel([
    { subject: "Mathematics - MATHS", level: "Primary 3" },
    { subject: "Mathematics - MATHS", level: "Primary 5" }
  ]), "P3 & P5 Mathematics");
  assert.equal(curriculumTitleLabel([
    { subject: "Mathematics - MATHS", level: "Primary 5" },
    { subject: "Foundation Mathematics - FMATHS", level: "Primary 5" }
  ]), "P5 Mathematics / P5 Foundation Mathematics");
  assert.equal(curriculumTitleLabel([
    { subject: "Mathematics - G2MATHS", level: "Secondary 1" }
  ]), "Sec 1 Mathematics G2");
  assert.throws(() => curriculumTitleLabel([]), /No verified/);
});

test("searchable titles normalize purpose and leading level without duplicating them", () => {
  const tags = [{ subject: "Mathematics - MATHS", level: "Primary 1" }];
  const expected = "Topical Revision - P1 Mathematics - Addition within 100";
  assert.equal(searchableTitle("Addition within 100", "Topical Revision -", tags), expected);
  assert.equal(searchableTitle("P1 Addition within 100", "Topical Revision -", tags), expected);
  assert.equal(searchableTitle("Topical revision - Addition within 100", "Topical Revision -", tags), expected);
  assert.equal(searchableTitle(expected, "Topical Revision -", tags), expected);
});

test("child-facing title removes the authoring-process phrase and keeps FA-Math", () => {
  const original = "Topical revision - Addition and Subtraction within 100 (Algorithm - Recall, Practise and Quiz using FA-Math)";
  const expected = "Topical Revision - Addition and Subtraction within 100 (FA-Math)";
  assert.equal(simplifyTopicTitle("Addition (Algorithm - Recall, Practice and Quiz using FA Maths)"), "Addition (FA-Math)");
  assert.equal(purposeTitle(original, "Topical Revision -"), expected);
  assert.equal(purposeTitle(expected, "Topical Revision -"), expected);
  assert.equal(purposeTitle("P1 Addition and Subtraction within 100 (Algorithm - Recall, Practise and Quiz using FA-Math)", "Topical Revision -"), expected);
});

test("AST rollback detection is token-aware and removes only a leading purpose prefix", () => {
  assert.equal(titleContainsToken("Topical Revision - AST - Fractions", "AST"), true);
  assert.equal(titleContainsToken("Topical Revision - AST_FA-Math P3", "ast"), true);
  assert.equal(titleContainsToken("Topical Revision - Faster arithmetic", "AST"), false);
  assert.deepEqual(prefixRemovalDecision("Topical Revision - AST - Fractions", "Topical Revision -", "AST"), {
    eligible: true,
    after: "AST - Fractions",
    reason: "matching title and removable leading prefix",
  });
  assert.equal(prefixRemovalDecision("AST - Fractions", "Topical Revision -", "AST").eligible, false);
  assert.equal(prefixRemovalDecision("Topical Revision - Fractions", "Topical Revision -", "AST").eligible, false);
});

test("conditional prefix-removal preview reports candidates and leaves other titles untouched", async () => {
  const live = new Map([[id, "Topical Revision - AST_FA-Math P3"], [id2, "Topical Revision - Rate (FA-Math)"]]);
  const plan = await previewPrefixRemovals(sheetTitleTargets(rows), "Topical Revision -", "AST", {
    read: async (target) => live.get(target.id),
  });
  assert.equal(plan[0].status, "planned");
  assert.equal(plan[0].after, "AST_FA-Math P3");
  assert.equal(plan[1].status, "skipped");
  assert.equal(plan[1].after, "Topical Revision - Rate (FA-Math)");
});

test("ordinary prefix preview excludes AST titles by token without hiding other titles", async () => {
  const live = new Map([[id, "AST_FA-Math P3 Fractions"], [id2, "Rate (FA-Math)"]]);
  const plan = await previewTitles(sheetTitleTargets(rows), "Topical Revision -", {
    read: async (target) => live.get(target.id),
  }, undefined, { excludeText: "AST" });
  assert.equal(plan[0].status, "skipped");
  assert.equal(plan[0].after, "AST_FA-Math P3 Fractions");
  assert.equal(plan[1].status, "planned");
  assert.equal(plan[1].after, "Topical Revision - Rate (FA-Math)");
});

test("curriculum preview uses saved SLS tags and reports its label", async () => {
  const adapter = {
    read: async () => "Topical revision - Addition within 100",
    readCurriculum: async () => [{ subject: "Mathematics - MATHS", level: "Primary 1" }]
  };
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Topical Revision -", adapter, undefined, { curriculum: true });
  assert.equal(plan[0].curriculumLabel, "P1 Mathematics");
  assert.equal(plan[0].after, "Topical Revision - P1 Mathematics - Addition within 100");
  assert.equal(plan[0].status, "planned");
});

test("preview is read-only and uses live titles; rerun does not write twice", async () => {
  let live = "Live angles title";
  let writes = 0;
  const adapter = { read: async () => live, write: async (_, before, after) => { assert.equal(live, before); live = after; writes++; } };
  const targets = sheetTitleTargets(rows, "2");
  const plan = await previewTitles(targets, "Revision -", adapter);
  assert.equal(plan[0].before, live);
  assert.equal(writes, 0);
  const checkpoints = [];
  await applyTitles(plan, adapter, async (items) => checkpoints.push(items[0].status));
  assert.equal(writes, 1);
  assert.equal(plan[0].status, "verified");
  assert.deepEqual(checkpoints, ["saving", "verified"]);
  const again = await previewTitles(targets, "Revision -", adapter);
  await applyTitles(again, adapter);
  assert.equal(writes, 1);
});

test("a concurrent title change prevents mutation and stops later modules", async () => {
  let current = "Original";
  let writes = 0;
  const adapter = { read: async () => current, write: async () => writes++ };
  const plan = await previewTitles(sheetTitleTargets(rows), "Revision -", adapter);
  current = "Teacher changed this";
  await assert.rejects(applyTitles(plan, adapter), /changed since preview/);
  assert.equal(writes, 0);
  assert.equal(plan[0].status, "failed");
  assert.equal(plan[1].status, "planned");
});

test("unpersisted saves are reported as failures, not successes", async () => {
  const adapter = { read: async () => "Original", write: async () => {} };
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Revision -", adapter);
  await assert.rejects(applyTitles(plan, adapter), /did not match after reopening/);
  assert.equal(plan[0].status, "failed");
});

test("verified and already-current SLS titles are tracked after persistence", async () => {
  let live = "Original";
  const tracked = [];
  const adapter = { read: async () => live, write: async (_, __, after) => { live = after; } };
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Revision -", adapter);
  await applyTitles(plan, adapter, undefined, { afterVerified: async (item) => { tracked.push(item.after); return { cells: ["K2"] }; } });
  assert.equal(plan[0].status, "verified");
  assert.equal(plan[0].sheetStatus, "verified");
  assert.deepEqual(tracked, ["Revision - Original"]);
  const again = await previewTitles(sheetTitleTargets(rows, "2"), "Revision -", adapter);
  await applyTitles(again, adapter, undefined, { afterVerified: async (item) => { tracked.push(item.after); return { cells: ["K2"] }; } });
  assert.equal(again[0].status, "unchanged");
  assert.equal(again[0].sheetStatus, "verified");
  assert.equal(tracked.length, 2);
});

test("Sheet tracking failure preserves the fact that SLS was verified", async () => {
  let live = "Original";
  const adapter = { read: async () => live, write: async (_, __, after) => { live = after; } };
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Revision -", adapter);
  await assert.rejects(applyTitles(plan, adapter, undefined, {
    afterVerified: async () => { throw new Error("Sheet cell could not be verified"); }
  }), /Sheet cell/);
  assert.equal(plan[0].status, "verified");
  assert.equal(plan[0].sheetStatus, "failed");
});

// Fixtures use selectors observed in an existing SLS trace, with all requests intercepted.
async function browserFixture(t, {
  delay = 0,
  delayedEditorMount = 0,
  persist = true,
  maxLength,
  login = false,
  closeEditorOnBlur = false,
} = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let title = "Angles & Shapes";
  let writes = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;
    if (pathname === "/save-title") {
      writes++;
      if (persist) title = JSON.parse(request.postData()).title;
      return route.fulfill({ json: { ok: true } });
    }
    if (login || pathname === "/login") {
      return route.fulfill({ contentType: "text/html", body: '<button>LOGIN WITH SLS</button>' });
    }
    const edit = pathname.includes("/edit/");
    const root = `https://vle.learning.moe.edu.sg/admin/community-gallery/module`;
    const html = `<!doctype html><html><body>
      <button id="mode">${edit ? "Done" : "Edit"}</button>
      <div id="title-mount">${edit && delayedEditorMount
        ? ""
        : '<div class="course-plan-module-title"><div class="output-area"></div></div>'}</div>
      <div class="activity"><input value="Activity must stay unchanged"></div>
      <script>
        const original = ${JSON.stringify(title)};
        const edit = ${edit};
        let dirty = false;
        let draft = original;
        function mountTitleEditor() {
          const mount = document.getElementById('title-mount');
          if (!mount.querySelector('.course-plan-module-title')) {
            mount.innerHTML = '<div class="course-plan-module-title"><div class="output-area"></div></div>';
          }
          const area = mount.querySelector('.output-area');
          setTimeout(() => {
            area.innerHTML = ${edit
              ? `'<div class="title-view"><h4><span></span><div class="edit-indicator"></div></h4></div>'`
              : `'<h4></h4>'`};
            area.querySelector('h4 > span, h4').textContent = original;
          }, ${delay});
          area.addEventListener('click', (event) => {
            if (!event.target.closest('h4')) return;
            area.innerHTML = '<input class="bx--text-input" ${maxLength === undefined ? "" : `maxlength="${maxLength}"`}>';
            const input = area.querySelector('input');
            input.value = original;
            input.addEventListener('input', () => { dirty = true; draft = input.value; });
            if (${closeEditorOnBlur}) input.addEventListener('blur', () => {
              area.innerHTML = '<div class="title-view"><h4><span></span></h4></div>';
              area.querySelector('span').textContent = draft;
            });
          });
        }
        if (edit && ${delayedEditorMount} > 0) setTimeout(mountTitleEditor, ${delayedEditorMount});
        else mountTitleEditor();
        document.getElementById('mode').addEventListener('click', async () => {
          if (edit && dirty) await fetch('/save-title', {method:'POST', body:JSON.stringify({title:draft})});
          location.href = ${JSON.stringify(root)} + '/' + (edit ? 'view' : 'edit') + '/${id}';
        });
      </script></body></html>`;
    return route.fulfill({ contentType: "text/html", body: html });
  });
  return { page, adapter: createTitleBrowser(page, { timeout: 2000, log: () => {} }), state: () => ({ title, writes }) };
}

test("Chrome fixture: delayed title rendering, scoped rename, save/reopen and idempotent rerun", async (t) => {
  const { page, adapter, state } = await browserFixture(t, { delay: 150 });
  const targets = sheetTitleTargets(rows, "2");
  const plan = await previewTitles(targets, "Topical Revision -", adapter);
  await applyTitles(plan, adapter);
  assert.equal(plan[0].status, "verified");
  assert.equal(state().title, "Topical Revision - Angles & Shapes");
  assert.equal(await page.locator(".activity input").inputValue(), "Activity must stay unchanged");
  await applyTitles(await previewTitles(targets, "Topical Revision -", adapter), adapter);
  assert.equal(state().writes, 1);
});

test("Chrome fixture: SLS may close the inline title editor immediately on blur", async (t) => {
  const { adapter, state } = await browserFixture(t, { closeEditorOnBlur: true });
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Topical Revision -", adapter);
  await applyTitles(plan, adapter);
  assert.equal(plan[0].status, "verified");
  assert.equal(state().title, "Topical Revision - Angles & Shapes");
  assert.equal(state().writes, 1);
});

test("Chrome fixture: waits for a delayed Module Plan title mount before selecting a layout", async (t) => {
  const { adapter, state } = await browserFixture(t, { delayedEditorMount: 250 });
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Topical Revision -", adapter);
  await applyTitles(plan, adapter);
  assert.equal(plan[0].status, "verified");
  assert.equal(state().title, "Topical Revision - Angles & Shapes");
  assert.equal(state().writes, 1);
});

test("Chrome fixture: title length guard prevents truncation", async (t) => {
  const { adapter, state } = await browserFixture(t, { maxLength: 20 });
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Topical Revision -", adapter);
  await assert.rejects(applyTitles(plan, adapter), /20-character limit/);
  assert.equal(state().writes, 0);
});

test("Chrome fixture: save failure never becomes verified", async (t) => {
  const { adapter, state } = await browserFixture(t, { persist: false });
  const plan = await previewTitles(sheetTitleTargets(rows, "2"), "Revision -", adapter);
  await assert.rejects(applyTitles(plan, adapter));
  assert.equal(plan[0].status, "failed");
  assert.equal(state().title, "Angles & Shapes");
});

test("Chrome fixture: login boundary performs no mutations", async (t) => {
  const { adapter, state } = await browserFixture(t, { login: true });
  await assert.rejects(adapter.read(sheetTitleTargets(rows, "2")[0]), TitleLoginRequired);
  assert.equal(state().writes, 0);
});
