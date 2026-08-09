#!/usr/bin/env node
/*
 * Headless generator check for every FAMath activity.
 *
 * The browser harnesses that verified the adaptive ladder and the Level 3 Think items had to load each
 * activity in an iframe — KaTeX fonts, Three.js scenes and a full render per activity, around 50 seconds
 * each, so a full pass over 397 activities ran to hours and was only ever sampled.
 *
 * Nothing about problem generation needs a browser. This runs the shipped template's own script in a Node
 * VM with a stub DOM, skips init() so no UI is built, and calls the generators directly. Same code path a
 * learner gets, no rendering, whole library in seconds.
 *
 *   node _source/headless_check.js              # every activity
 *   node _source/headless_check.js Primary6     # only folders starting with Primary6
 *   node _source/headless_check.js --draws 12   # more samples per step (default 6)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourceRoot = __dirname;
const projectRoot = path.dirname(sourceRoot);
const TOTAL_QUESTIONS = 6;
// Below this many objects a row fits on one line at any sane width, so packing buys nothing.
const WRAP_RISK = 8;

// ---------- extract the activity script from the template ----------
function buildScript() {
  const template = fs.readFileSync(path.join(sourceRoot, 'index.template.html'), 'utf8');
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let match, body = '';
  while ((match = re.exec(template))) if (match[1].includes('__ACTIVITY_CONFIG__')) body = match[1];
  if (!body) throw new Error('Could not find the activity script in index.template.html');

  let code = body
    .replace('__ACTIVITY_CONFIG__', 'globalThis.__FAMATH_CONFIG__')
    .replace('__THREE_RUNTIME_SCRIPT__', '');

  // Booting would build the whole UI. Swap the boot call for an export of the internals instead.
  if (!/\n\s*init\(\);/.test(code)) {
    throw new Error('init() call not found — the template changed shape and this harness needs updating');
  }
  code = code.replace(/\n(\s*)init\(\);/, `\n$1globalThis.__FAMATH_EXPORTS__ = {
      makeProblem, makeProblemAtStep, genericThinkProblem, genericThinkAuditFor, choiceAuditFor,
      p6ChallengeAuditFor, problemHasValidChoices, problemSignature, problemDifficultyScore,
      availableLevels, thinkSupported, tutorialSteps, visualHTML, netFoldLayout, state, CONFIG
    };`);
  return new vm.Script(code, { filename: 'famath-activity.js' });
}

// ---------- a DOM permissive enough for the script's top-level code ----------
// Only the generators are exercised, but the script builds an element lookup table as it loads, so every
// property access has to return something harmless rather than throw.
function stubElement() {
  const target = function () { return stubElement(); };
  return new Proxy(target, {
    get(_, prop) {
      if (prop === Symbol.toPrimitive || prop === Symbol.toStringTag) return undefined;
      if (prop === Symbol.iterator) return function* () {};
      if (prop === 'length') return 0;
      if (prop === 'then') return undefined;
      if (prop === 'hidden' || prop === 'open' || prop === 'checked' || prop === 'disabled') return false;
      if (prop === 'textContent' || prop === 'innerHTML' || prop === 'value' || prop === 'className') return '';
      if (prop === 'map' || prop === 'filter' || prop === 'forEach' || prop === 'slice') return () => [];
      return stubElement();
    },
    set() { return true; },
    apply() { return stubElement(); },
    has() { return true; }
  });
}

function makeContext() {
  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear()
  };
  const document = {
    getElementById: () => stubElement(),
    querySelector: () => stubElement(),
    querySelectorAll: () => [],
    createElement: () => stubElement(),
    addEventListener() {}, removeEventListener() {},
    documentElement: stubElement(),
    body: stubElement(),
    title: ''
  };
  const context = {
    console, Math, Date, JSON, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite, encodeURIComponent, decodeURIComponent,
    setTimeout, clearTimeout, setInterval, clearInterval,
    document, localStorage,
    location: { search: '?famathTest=1', href: 'http://localhost/', pathname: '/' },
    navigator: { userAgent: 'node', sendBeacon: () => true },
    performance: { now: () => Date.now() },
    requestAnimationFrame: cb => setTimeout(cb, 0),
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
    speechSynthesis: { speak() {}, cancel() {}, getVoices: () => [] },
    SpeechSynthesisUtterance: function () {},
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }),
    katex: { render() {}, renderToString: t => String(t) },
    getComputedStyle: () => stubElement()
  };
  context.window = context;
  context.globalThis = context;
  context.self = context;
  return vm.createContext(context);
}

// ---------- long-decimal scan ----------
// A choice button showing 26.666666666666668 is a display defect and a maths defect: it overflows the
// button, it is not an answer any pupil would write, and it silently marks itself out as the wrong one.
// Anything a learner reads should carry at most two decimal places.
const MAX_DECIMALS = 2;
function longDecimalsIn(value) {
  const found = [];
  for (const match of String(value).matchAll(/\d+\.(\d+)/g)) {
    if (match[1].length > MAX_DECIMALS) found.push(match[0]);
  }
  return found;
}
function problemLongDecimals(problem) {
  const offenders = [];
  const inspect = (label, value) => {
    if (value === null || value === undefined) return;
    longDecimalsIn(value).forEach(v => offenders.push(`${label}=${v}`));
  };
  inspect('answer', problem.answer);
  (Array.isArray(problem.options) ? problem.options : []).forEach(o => inspect('option', o));
  inspect('prompt', problem.prompt);
  return offenders;
}

// ---------- displayed-algebra agreement ----------
// An item publishes a worked line: p4.solutionTex, and a plain-text `bridge`. Whatever number those end on
// is what a learner reads as the result, so it has to be the accepted answer. A Level 3 composite angle
// question shipped with solutionTex ending "x = 50" while the answer was 175, which is exactly how a
// learner who reasoned correctly got marked wrong — the panel confirmed the wrong number.
// "Ends on the answer" is too strict: a fact-family bridge legitimately closes on a factor
// ("3 × 3 = 9; 9 ÷ 3 = 3"), and a thousands separator splits 9,075 into 9 and 075. The dependable rule is
// weaker and far more reliable — whatever working the learner is shown must at least CONTAIN the value
// being marked correct. If the answer appears nowhere in it, the two disagree.
function numbersIn(text) {
  const cleaned = String(text)
    .replace(/(\d),(?=\d{3}\b)/g, '$1')   // thousands separators
    .replace(/\\[a-zA-Z]+/g, ' ')         // TeX commands
    .replace(/[{}^]/g, ' ');
  return (cleaned.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
}
function algebraDisagreements(problem) {
  const answer = Number(problem.answer);
  if (!Number.isFinite(answer)) return [];        // only checkable for numeric answers
  const out = [];
  const check = (label, text) => {
    if (typeof text !== 'string' || !text.trim()) return;
    const shown = numbersIn(text);
    if (!shown.length || shown.includes(answer)) return;
    out.push(`${label} never shows the answer ${answer}  [${String(text).slice(0, 70)}]`);
  };
  check('solutionTex', problem.p4 && problem.p4.solutionTex);
  check('bridge', problem.bridge);
  return out;
}

// ---------- SVG label placement scan ----------
// A label naming a property must sit beside the feature it names and clear of the figure. Dropping one
// inside a filled shape puts text over the fill and the stroke, so the fact being taught becomes the
// hardest thing on the diagram to read. Anchor points are computable from the markup, so this needs no
// browser: find every <text> whose anchor falls inside a drawn <rect> or <polygon>.
//
// Two signals, because the real fault is only partly computable. Whether a label sits beside the FEATURE
// it names is semantic — "one corner = 90°" describes a corner, "whole 9 × 7" describes a whole region,
// and only a reader can tell those apart. So this reports:
//
//   CROSSES AN EDGE — the text runs over a shape outline. Always wrong, always worth fixing.
//   review          — a descriptive label drawn inside a figure. Correct when it names the region it sits
//                     on, wrong when it names a localised feature somewhere else in the drawing.
//
// The review list is short enough to read. Treat it as a prompt for judgement, not a failure.
//
// Short strings are ignored. Numerals and one-word marks legitimately sit inside cells, bars and grid
// squares; a descriptive phrase does not, and phrases are what this is looking for.
const LABEL_MIN_LENGTH = 9;
// These figure labels render around 13-15px, where average glyph advance is close to 7px.
const LABEL_CHAR_WIDTH = 7;
function textSpan(x, anchor, text) {
  const width = text.length * LABEL_CHAR_WIDTH;
  if (anchor === 'middle') return [x - width / 2, x + width / 2];
  if (anchor === 'end') return [x - width, x];
  return [x, x + width];
}
function svgBlocks(html) {
  return [...String(html).matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)].map(m => m[1]);
}
function shapeBoxes(svg) {
  const boxes = [];
  for (const m of svg.matchAll(/<rect\b[^>]*>/g)) {
    const attr = name => { const hit = m[0].match(new RegExp(`\\b${name}="(-?[\\d.]+)"`)); return hit ? Number(hit[1]) : null; };
    const x = attr('x'), y = attr('y'), w = attr('width'), h = attr('height');
    if ([x, y, w, h].every(v => v !== null)) boxes.push({ kind: 'rect', x1: x, y1: y, x2: x + w, y2: y + h });
  }
  for (const m of svg.matchAll(/<polygon\b[^>]*\bpoints="([^"]+)"[^>]*>/g)) {
    const nums = m[1].trim().split(/[\s,]+/).map(Number).filter(Number.isFinite);
    const xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
    if (xs.length && ys.length) boxes.push({ kind: 'polygon', x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) });
  }
  return boxes;
}
function labelOverlaps(html) {
  const hits = [];
  for (const svg of svgBlocks(html)) {
    const boxes = shapeBoxes(svg);
    if (!boxes.length) continue;
    for (const m of svg.matchAll(/<text\b([^>]*)>([\s\S]*?)<\/text>/g)) {
      const text = m[2].replace(/<[^>]*>/g, '').trim();
      if (text.length < LABEL_MIN_LENGTH || !/\s/.test(text)) continue;
      const x = Number((m[1].match(/\bx="(-?[\d.]+)"/) || [])[1]);
      const y = Number((m[1].match(/\by="(-?[\d.]+)"/) || [])[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      const anchor = (m[1].match(/\btext-anchor="([^"]+)"/) || [])[1] || 'start';
      const [left, right] = textSpan(x, anchor, text);
      const inside = boxes.find(b => x > b.x1 + 2 && x < b.x2 - 2 && y > b.y1 + 2 && y < b.y2 - 2);
      const straddled = boxes.find(b =>
        y > b.y1 - 4 && y < b.y2 + 4 &&
        ((left < b.x1 - 1 && right > b.x1 + 1) || (left < b.x2 - 1 && right > b.x2 + 1)));
      if (straddled) hits.push(`CROSSES AN EDGE  "${text.slice(0, 48)}" spans x ${Math.round(left)}..${Math.round(right)} over ${straddled.kind} ${straddled.x1},${straddled.y1}-${straddled.x2},${straddled.y2}`);
      else if (inside) hits.push(`review  "${text.slice(0, 48)}" at (${x},${y}) drawn inside ${inside.kind} ${inside.x1},${inside.y1}-${inside.x2},${inside.y2}`);
    }
  }
  return hits;
}

// ---------- repeated-object row scan ----------
// The fit-don't-wrap principle: a row of N repeated objects should shrink to stay on ONE line rather than
// wrap, because a second row pushes the question and the answer buttons below the fold and the learner has
// to scroll away from the model to read what it asks. A row only needs the treatment if it can actually
// carry enough objects to wrap, so this counts the direct children every row component really produces.
const VOID_TAGS = new Set(['br', 'img', 'input', 'hr', 'meta', 'link', 'source', 'use', 'path', 'circle', 'rect', 'line', 'polygon', 'ellipse', 'stop']);
// Rows already packed with the count-aware width formula.
const PACKED_ROWS = new Set(['story-icon-row', 'fraction-wholes-board', 'fraction-pie-board']);
// Every container in the activity area that lays repeated objects out in a line.
const ROW_CLASSES = [
  'story-icon-row', 'fraction-wholes-board', 'objects', 'mini-dots', 'set-row', 'sequence', 'groups',
  'array', 'length-bars', 'graph-icons', 'ordinal-track', 'order-bank', 'choice-grid', 'fraction-jump-line',
  'fraction-group-tray', 'fraction-recipient-tray', 'money-tray', 'base10-row'
];

// Count direct element children of the first element carrying `className`, walking tag depth so nested
// SVG internals are not mistaken for children.
function countDirectChildren(html, className) {
  const open = new RegExp(`<([a-zA-Z][\\w-]*)([^>]*\\bclass="[^"]*\\b${className}\\b[^"]*")[^>]*?(/?)>`);
  const match = open.exec(html);
  if (!match || match[3] === '/') return 0;
  const tagRe = /<(\/?)([a-zA-Z][\w-]*)([^>]*?)(\/?)>/g;
  tagRe.lastIndex = match.index + match[0].length;
  let depth = 0, children = 0, tag;
  while ((tag = tagRe.exec(html))) {
    const closing = tag[1] === '/', name = tag[2].toLowerCase(), selfClosing = tag[4] === '/';
    if (closing) {
      if (depth === 0) break;      // the container's own closing tag
      depth--;
      continue;
    }
    if (VOID_TAGS.has(name) || selfClosing) { if (depth === 0) children++; continue; }
    if (depth === 0) children++;
    depth++;
  }
  return children;
}

function scanRows(html, into) {
  if (!html) return;
  for (const cls of ROW_CLASSES) {
    if (!html.includes(cls)) continue;
    const n = countDirectChildren(html, cls);
    if (n > (into[cls] || 0)) into[cls] = n;
  }
}

// ---------- read every built activity's CONFIG ----------
function readConfig(indexPath) {
  const html = fs.readFileSync(indexPath, 'utf8');
  const marker = 'const CONFIG = ';
  const start = html.indexOf(marker);
  if (start < 0) return null;
  let i = start + marker.length, depth = 0, inString = false, escaped = false;
  for (; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; break; } }
  }
  try { return JSON.parse(html.slice(start + marker.length, i)); } catch (_) { return null; }
}

// ---------- the checks ----------
function checkActivity(script, config, draws) {
  const context = makeContext();
  context.__FAMATH_CONFIG__ = config;
  const issues = [];
  try { script.runInContext(context, { timeout: 20000 }); }
  catch (e) { return [`script failed to load: ${e.message}`]; }

  const api = context.__FAMATH_EXPORTS__;
  if (!api) return ['script loaded but exported nothing'];

  const decimals = new Set();
  const algebra = new Set();
  const validAt = (level, step) => {
    api.state.level = level;
    api.state.problems = [];
    let problem = null;
    try { problem = api.makeProblem(config.kind, step, level); }
    catch (e) { issues.push(`level ${level} step ${step + 1}: threw ${e.message}`); return null; }
    if (!problem) { issues.push(`level ${level} step ${step + 1}: generated nothing`); return null; }
    if (!api.problemHasValidChoices(problem)) {
      issues.push(`level ${level} step ${step + 1}: invalid choices ${JSON.stringify(problem.options)}`);
      return null;
    }
    problemLongDecimals(problem).forEach(d => decimals.add(`L${level} ${d}`));
    algebraDisagreements(problem).forEach(d => algebra.add(`L${level} ${d}`));
    return problem;
  };

  let levels = [1];
  try { levels = api.availableLevels(); }
  catch (e) { issues.push(`availableLevels threw: ${e.message}`); }

  // Level 1 across the whole ladder, plus the difficulty trend the adaptive step depends on. The trend is
  // measured through makeProblemAtStep, not the raw generator, because that is the path a learner gets —
  // it is where the candidate ranking that gives flat generators their ramp is applied.
  const scores = [];
  for (let step = 0; step < TOTAL_QUESTIONS; step++) {
    for (let draw = 0; draw < draws; draw++) validAt(1, step);
    let total = 0, counted = 0;
    for (let draw = 0; draw < draws; draw++) {
      api.state.level = 1;
      api.state.problems = [];
      let served = null;
      try { served = api.makeProblemAtStep(step, 0); }
      catch (e) { issues.push(`adaptive step ${step + 1}: threw ${e.message}`); continue; }
      if (!served || !api.problemHasValidChoices(served)) {
        issues.push(`adaptive step ${step + 1}: invalid served problem`);
        continue;
      }
      total += api.problemDifficultyScore(served); counted++;
    }
    scores.push(counted ? total / counted : 0);
  }
  const ramps = scores[TOTAL_QUESTIONS - 1] > scores[0] * 1.02;

  // Level 2 is hand-written Primary 6 only; Level 3 must produce a Think item at every step.
  for (const level of levels.filter(l => l !== 1)) {
    for (let step = 0; step < TOTAL_QUESTIONS; step++) {
      for (let draw = 0; draw < Math.min(draws, 4); draw++) {
        const problem = validAt(level, step);
        if (!problem) break;
        if (problem.challengeLevel !== level) {
          issues.push(`level ${level} step ${step + 1}: served a level ${problem.challengeLevel || 1} item`);
          break;
        }
        if (level === 3 && problem.thinkBase) {
          const audit = api.genericThinkAuditFor([problem]);
          if (!audit.allPassed) {
            issues.push(`level 3 step ${step + 1}: ${JSON.stringify(audit.questions[0].checks)}`);
            break;
          }
        }
      }
    }
  }
  // Widest repeated-object row this objective can produce, plus labels buried inside a figure — both read
  // from the same generated markup, in the activity area and in the tutorial.
  const rowMax = {};
  const buriedLabels = new Set();
  for (let step = 0; step < TOTAL_QUESTIONS; step++) {
    for (let draw = 0; draw < Math.min(draws, 4); draw++) {
      const problem = validAt(1, step);
      if (!problem) continue;
      let mainHtml = '';
      try { mainHtml = api.visualHTML(problem) || ''; } catch (_) { mainHtml = ''; }
      scanRows(mainHtml, rowMax);
      labelOverlaps(mainHtml).forEach(hit => buriedLabels.add(hit));
      let steps = null;
      try { steps = api.tutorialSteps(problem); } catch (_) { steps = null; }
      if (Array.isArray(steps)) steps.forEach(s => {
        if (s && typeof s.html === 'string') { scanRows(s.html, rowMax); labelOverlaps(s.html).forEach(hit => buriedLabels.add(hit)); }
      });
    }
  }

  // Does this objective actually draw both a bar and a circle model? The representation checkbox is only
  // meaningful where a tutorial step emits a .repr-holder; anywhere else it is a control over nothing.
  let usesRepr = false;
  for (let step = 0; step < TOTAL_QUESTIONS && !usesRepr; step++) {
    const problem = validAt(1, step);
    if (!problem) continue;
    let steps = null;
    try { steps = api.tutorialSteps(problem); } catch (_) { steps = null; }
    if (Array.isArray(steps)) usesRepr = steps.some(s => s && typeof s.html === 'string' && s.html.includes('repr-holder'));
  }

  return { issues, levels, ramps, usesRepr, rowMax, buriedLabels: [...buriedLabels], decimals: [...decimals], algebra: [...algebra], scores: scores.map(s => Number(s.toFixed(2))) };
}

// ---------- run ----------
function main() {
  const args = process.argv.slice(2);
  const drawsFlag = args.indexOf('--draws');
  const draws = drawsFlag >= 0 ? Number(args[drawsFlag + 1]) || 6 : 6;
  const filter = args.find(a => !a.startsWith('--') && a !== String(draws)) || '';

  const script = buildScript();
  const folders = fs.readdirSync(projectRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && /^(Primary|Secondary)/.test(d.name))
    .map(d => d.name)
    .filter(name => !filter || name.startsWith(filter))
    .sort();

  const started = Date.now();
  const failures = [];
  const flat = [];
  const levelCounts = {};
  const withRepr = [];
  const rowStats = {};   // class -> { max, worstFolder, activities }
  const longDecimals = [];
  const algebraBad = [];
  const buried = [];
  let checked = 0;

  for (const folder of folders) {
    const indexPath = path.join(projectRoot, folder, 'index.html');
    if (!fs.existsSync(indexPath)) { failures.push(`${folder}: no index.html`); continue; }
    const config = readConfig(indexPath);
    if (!config) { failures.push(`${folder}: could not read CONFIG`); continue; }

    const result = checkActivity(script, config, draws);
    checked++;
    if (Array.isArray(result)) { failures.push(`${folder}: ${result.join('; ')}`); continue; }
    if (result.issues.length) failures.push(`${folder} (${config.kind})\n    ${result.issues.join('\n    ')}`);
    if (!result.ramps) flat.push(`${folder} (${config.kind}) scores ${result.scores.join(' → ')}`);
    if (result.usesRepr) withRepr.push(`${folder} (${config.kind})`);
    if (result.buriedLabels.length) buried.push(`${folder} (${config.kind})\n      ${result.buriedLabels.slice(0, 4).join('\n      ')}`);
    if (result.algebra.length) algebraBad.push(`${folder} (${config.kind})\n      ${result.algebra.slice(0, 4).join('\n      ')}`);
    if (result.decimals.length) longDecimals.push(`${folder} (${config.kind})\n      ${result.decimals.slice(0, 6).join('  ')}`);
    for (const [cls, n] of Object.entries(result.rowMax)) {
      const stat = rowStats[cls] || (rowStats[cls] = { max: 0, worstFolder: '', activities: 0, crowded: 0 });
      stat.activities++;
      if (n >= WRAP_RISK) stat.crowded++;
      if (n > stat.max) { stat.max = n; stat.worstFolder = folder; }
    }
    const key = result.levels.join(',');
    levelCounts[key] = (levelCounts[key] || 0) + 1;
    if (checked % 50 === 0) process.stdout.write(`  ...${checked}/${folders.length}\n`);
  }

  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`\nFAMath headless generator check — ${checked} activities in ${seconds}s (${draws} draws per step)\n`);
  console.log('Challenge levels offered:');
  Object.entries(levelCounts).sort().forEach(([k, v]) => console.log(`  [${k}] : ${v}`));
  console.log(`\nValues shown to a learner with more than ${MAX_DECIMALS} decimal places (${longDecimals.length} activities):`);
  longDecimals.forEach(line => console.log('  ' + line));

  console.log(`\nDisplayed working that ends on a different number from the answer (${algebraBad.length}):`);
  algebraBad.forEach(line => console.log('  ' + line));

  console.log(`\nFigure labels: edge collisions, plus in-figure labels to review (${buried.length}):`);
  buried.forEach(line => console.log('  ' + line));

  console.log('\nRepeated-object rows — widest row each component can produce:');
  console.log('  packed?  max  crowded/used  component            worst case');
  Object.entries(rowStats).sort((a, b) => b[1].max - a[1].max).forEach(([cls, s]) => {
    const packed = PACKED_ROWS.has(cls) ? '  yes  ' : (s.max >= WRAP_RISK ? '  NO   ' : '  n/a  ');
    console.log(`  ${packed} ${String(s.max).padStart(4)}  ${String(s.crowded).padStart(4)}/${String(s.activities).padEnd(5)} ${cls.padEnd(22)} ${s.max >= WRAP_RISK ? s.worstFolder : ''}`);
  });
  console.log(`  (crowded = rows with ${WRAP_RISK}+ objects, the point where wrapping starts to cost a row)`);

  console.log(`\nShow the bar/circle representation toggle — tutorial emits .repr-holder (${withRepr.length} of ${checked}):`);
  withRepr.forEach(line => console.log('  ' + line));
  console.log(`\nDifficulty does not rise from step 1 to 6 (${flat.length}):`);
  flat.forEach(line => console.log('  ' + line));
  console.log(`\nFAILURES (${failures.length}):`);
  failures.forEach(line => console.log('  ' + line));
  console.log(failures.length ? '\nFAIL' : '\nPASS — every activity generates valid problems at every step and level');
  return failures.length ? 1 : 0;
}

process.exit(main());
