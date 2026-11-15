"use strict";
// Coach mode (owned by Claude; prototype 2026-10-23 on Sets & Venn Challenge; Explore and Practice 2026-10-24).
// A spoken tutor that watches the learner work: it reads the goal, waits while they drag, then says what their move
// did, what is still missing and what to try, and lights up the part it is talking about. Every sentence comes from
// the pilot's own goal checks through an adapter, so the coach never decides what is mathematically true.
//
// Adapter (one per pilot, registered with CambridgeCoach.register):
//   {
//     id: "sets-venn",
//     mount(): { button: Element, panel: Element } | null  // the Coach button goes after `button`, the panel after `panel`;
//                                // asked on every tick, so the button and panel follow the learner from mode to mode
//     isActive(): boolean        // the coach may talk now (e.g. Challenge mode with a mission open)
//     pausedText(): string       // optional: shown while not active but mounted (e.g. "paused while Slow Solve is open")
//     snapshot(): { scene, moves, result, ... }  // scene: mission key; moves: board key; result: check outcome key
//     react(reason, prev, cur): { show, say, look: [selector], press: [selector] } | null
//        reason: "start" (new mission or coach turned on), "move" (board settled after a change),
//                "check" (the check result changed), "idle" (no move for a while), "hint" (still no move)
//     support(reason, cur, line): optional; called after each line, so the adapter can record coaching as support
//   }
// Speech: the browser's own speechSynthesis, preferring natural/neural voices; the learner can choose the voice.
// Never changes pilot state.

(() => {
  if (window.CambridgeCoach) return;
  const doc = document;
  const synth = window.speechSynthesis || null;
  const ON_KEY = "cambridge-coach", VOICE_KEY = "cambridge-coach-voice";
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: the choice lasts for this page only */ } },
  };
  let SETTLE_MS = 1100, IDLE_MS = 20000, HINT_MS = 25000, SILENT = false;
  const POLL_MS = 250;
  let adapter = null, on = store.get(ON_KEY) === "on", chosenVoice = store.get(VOICE_KEY) || "";
  let btn = null, panel = null, textEl = null, select = null;
  let last = null;            // the snapshot the coach last reacted to
  let pending = null, pendingSince = 0, lastChange = Date.now(), idleSaid = 0, pointerDown = false;
  let lastLine = null;
  const log = [];

  // ---------- Voices ----------
  // Natural/neural voices (Edge "Online (Natural)", Google, Apple premium) sound far less robotic than the defaults.
  function voiceScore(v) {
    if (!/^en(?:-|_|$)/i.test(v.lang)) return -1;
    let s = 0;
    if (/natural|neural|premium|enhanced/i.test(v.name)) s += 100;
    if (/google/i.test(v.name)) s += 60;
    if (/\b(sonia|libby|maisie|aria|jenny|guy|ryan|natasha|william|clara|emma|ava|andrew|brian|samantha|daniel|karen|serena|moira)\b/i.test(v.name)) s += 30;
    if (/en[-_](GB|SG|AU|NZ|IE)/i.test(v.lang)) s += 8; else if (/en[-_]US/i.test(v.lang)) s += 5;
    if (/espeak|robot|novelty|whisper|zarvox|bad news|bells|trinoids/i.test(v.name)) s -= 80;
    return s;
  }
  const englishVoices = () => (synth ? synth.getVoices() : []).filter(v => voiceScore(v) >= 0).sort((a, b) => voiceScore(b) - voiceScore(a));
  function currentVoice() {
    const vs = englishVoices();
    return vs.find(v => v.voiceURI === chosenVoice) || vs[0] || null;
  }

  // ---------- Speaking ----------
  // One sentence per utterance: short utterances sound more natural (a pause between ideas) and avoid the Chrome
  // cut-off on long ones. A timer stands in for "end" where a browser never fires it (headless, no voices).
  let queue = [], speaking = false, talkId = 0, endTimer = null, quietSince = Date.now();
  function sentences(text) { return String(text || "").split(/(?<=[.!?])\s+(?=[A-Z0-9"“])/).map(s => s.trim()).filter(Boolean); }
  function say(text) {
    stopTalking();
    queue = sentences(text);
    const id = ++talkId;
    next(id);
  }
  function next(id) {
    if (id !== talkId) return;
    clearTimeout(endTimer);
    const line = queue.shift();
    if (!line) { speaking = false; quietSince = Date.now(); paintSpeaking(); return; }
    speaking = true; paintSpeaking();
    const words = line.split(/\s+/).length;
    const fallback = SILENT ? 60 : 900 + words * 380;
    const done = () => { if (id === talkId) { clearTimeout(endTimer); setTimeout(() => next(id), 260); } };
    if (!synth || SILENT) { endTimer = setTimeout(done, fallback); return; }
    const u = new SpeechSynthesisUtterance(line);
    const v = currentVoice();
    if (v) { u.voice = v; u.lang = v.lang; } else u.lang = "en-GB";
    u.rate = v && voiceScore(v) >= 100 ? 1 : 0.95;
    u.pitch = 1;
    u.onend = u.onerror = done;
    endTimer = setTimeout(done, fallback + 1500);
    try { synth.speak(u); } catch (e) { endTimer = setTimeout(done, fallback); }
  }
  function stopTalking() {
    talkId++; queue = []; speaking = false; clearTimeout(endTimer);
    if (synth) try { synth.cancel(); } catch (e) { /* nothing to stop */ }
    paintSpeaking();
  }
  function paintSpeaking() { if (panel) panel.classList.toggle("is-speaking", speaking); }

  // ---------- Pointing ----------
  function clearMarks() { doc.querySelectorAll(".cc-look, .cc-press").forEach(el => el.classList.remove("cc-look", "cc-press")); }
  // A target is a selector, an element, a list of them, or a function returning one (as in the Slow Solve tutors).
  function elementsOf(t) {
    if (!t) return [];
    if (typeof t === "function") { try { return elementsOf(t()); } catch (e) { return []; } }
    if (typeof t === "string") { try { return [...doc.querySelectorAll(t)]; } catch (e) { return []; } }
    if (t instanceof Element) return [t];
    if (Array.isArray(t) || t instanceof NodeList) return [...t].flatMap(elementsOf);
    return [];
  }
  function mark(list, cls) {
    for (const t of list || []) elementsOf(t).forEach(el => el.classList.add(cls));
  }

  // ---------- Reacting ----------
  function react(reason, prev, cur) {
    let line = null;
    try { line = adapter.react(reason, prev, cur); } catch (e) { if (window.console) console.warn("Coach:", e); }
    if (!line) return;
    lastLine = line;
    clearMarks(); mark(line.look, "cc-look"); mark(line.press, "cc-press");
    if (textEl) textEl.innerHTML = line.show;
    log.push({ time: Date.now(), reason, show: textOf(line.show), say: line.say, look: line.look || [], press: line.press || [] });
    if (log.length > 5000) log.shift(); // a long test session stays within it; learners never reach it
    say(line.say);
    try { if (adapter.support) adapter.support(reason, cur, line); } catch (e) { if (window.console) console.warn("Coach support record:", e); }
    doc.dispatchEvent(new CustomEvent("cambridge-coach:line", { detail: { reason, show: textOf(line.show), say: line.say } }));
  }
  const textOf = html => { const d = doc.createElement("div"); d.innerHTML = html || ""; return d.textContent.replace(/\s+/g, " ").trim(); };

  function snapshot() { try { return adapter.snapshot(); } catch (e) { return null; } }
  function tick() {
    if (!adapter) return;
    ensureMounted();
    const active = on && safe(() => adapter.isActive());
    paintPanel(active);
    if (!active) { if (last) { last = null; pending = null; stopTalking(); clearMarks(); } return; }
    const cur = snapshot();
    if (!cur) return;
    if (!last || cur.scene !== last.scene) { last = cur; pending = null; lastChange = Date.now(); idleSaid = 0; react("start", null, cur); return; }
    if (cur.result !== last.result) {
      // A new check result is answered at once. A result that clears (the learner moved a chip after checking) is not
      // news on its own: keep the old board so the move is still answered below.
      if (cur.result) { const prev = last; last = cur; pending = null; lastChange = Date.now(); idleSaid = 0; react("check", prev, cur); return; }
      last = Object.assign({}, cur, { moves: last.moves, st: last.st });
    }
    if (cur.moves !== last.moves) {
      // Wait until the board has stopped changing and the finger or mouse is up, so the coach never talks over a drag.
      if (!pending || pending.moves !== cur.moves) { pending = cur; pendingSince = Date.now(); }
      lastChange = Date.now(); idleSaid = 0;
      if (!pointerDown && Date.now() - pendingSince >= SETTLE_MS) { const prev = last; last = cur; pending = null; react("move", prev, cur); }
      return;
    }
    pending = null;
    // Idle time counts from the learner's last move or the end of the coach's last sentence, whichever is later.
    const quiet = Date.now() - Math.max(lastChange, quietSince);
    if (!speaking && idleSaid === 0 && quiet >= IDLE_MS) { idleSaid = 1; react("idle", last, cur); }
    else if (!speaking && idleSaid === 1 && quiet >= HINT_MS) { idleSaid = 2; react("hint", last, cur); }
  }
  const safe = fn => { try { return !!fn(); } catch (e) { return false; } };

  // ---------- Button and panel ----------
  function ensureMounted() {
    let where = null;
    try { where = adapter.mount(); } catch (e) { where = null; }
    if (!where || !where.button || !where.panel) return;
    // Follow the learner: when the anchors move (another mode, a re-rendered panel), move the button and panel too.
    if (btn && btn.isConnected && btn.previousElementSibling !== where.button) where.button.insertAdjacentElement("afterend", btn);
    if (panel && panel.isConnected && panel.previousElementSibling !== where.panel) where.panel.insertAdjacentElement("afterend", panel);
    if (btn && btn.isConnected && panel && panel.isConnected) { paintButton(); return; }
    if (!btn || !btn.isConnected) {
      btn = doc.createElement("button");
      btn.type = "button"; btn.id = "cambridge-coach-toggle"; btn.className = "button cc-toggle";
      btn.addEventListener("click", () => setOn(!on));
      where.button.insertAdjacentElement("afterend", btn);
    }
    if (!panel || !panel.isConnected) {
      panel = doc.createElement("section");
      panel.id = "cambridge-coach"; panel.className = "cc-panel"; panel.setAttribute("aria-label", "Coach");
      panel.innerHTML = '<div class="cc-head"><span class="cc-face" aria-hidden="true"></span><strong>Coach</strong>'
        + '<button type="button" class="cc-again" data-cc="again" title="Say that again">↻ Say again</button>'
        + '<label class="cc-voice" for="cambridge-coach-voice">Voice <select id="cambridge-coach-voice" name="cambridge-coach-voice" data-cc="voice"></select></label></div>'
        + '<p class="cc-text" role="status" aria-live="polite"></p>';
      textEl = panel.querySelector(".cc-text");
      select = panel.querySelector("select");
      panel.querySelector('[data-cc="again"]').addEventListener("click", () => { if (lastLine) say(lastLine.say); });
      select.addEventListener("change", () => {
        chosenVoice = select.value; store.set(VOICE_KEY, chosenVoice);
        say("This is my voice now. I'll use it while you work.");
      });
      where.panel.insertAdjacentElement("afterend", panel);
      // A page that re-renders its task panel rebuilds the coach panel too: keep showing the last line.
      if (lastLine && textEl) textEl.innerHTML = lastLine.show;
      fillVoices();
    }
    paintButton();
  }
  function fillVoices() {
    if (!select) return;
    const vs = englishVoices(), cur = currentVoice();
    select.replaceChildren(...(vs.length ? vs.map((v, i) => new Option(`${v.name.replace(/^Microsoft\s+|\s+Online \(Natural\)/g, "")}${i === 0 ? " (best)" : ""}`, v.voiceURI)) : [new Option("Browser voice", "")]));
    select.value = cur ? cur.voiceURI : "";
    select.disabled = !vs.length;
  }
  if (synth && synth.addEventListener) synth.addEventListener("voiceschanged", fillVoices);

  function paintButton() {
    if (!btn) return;
    btn.setAttribute("aria-pressed", String(on));
    btn.textContent = on ? "Coach on" : "Coach";
    btn.title = on ? "The coach is talking you through this. Press to turn it off." : "Turn on the coach: it reads the task, watches what you do and talks you through it.";
  }
  function paintPanel(active) {
    if (!panel) return;
    panel.hidden = !on;
    panel.classList.toggle("is-paused", on && !active);
    if (on && !active && textEl) {
      let why = "";
      try { why = adapter.pausedText ? adapter.pausedText() : ""; } catch (e) { why = ""; }
      if (why && textEl.textContent !== why) textEl.textContent = why;
    }
  }
  function setOn(value) {
    on = !!value; store.set(ON_KEY, on ? "on" : "off");
    last = null; pending = null;
    if (!on) { stopTalking(); clearMarks(); }
    paintButton(); tick();
  }

  // ---------- Start ----------
  function start() {
    doc.addEventListener("pointerdown", () => { pointerDown = true; }, true);
    const up = () => { pointerDown = false; };
    doc.addEventListener("pointerup", up, true);
    doc.addEventListener("pointercancel", up, true);
    setInterval(tick, POLL_MS);
    tick();
  }

  window.CambridgeCoach = Object.freeze({
    register(def) { adapter = def; if (doc.readyState !== "loading") tick(); },
    isOn: () => on,
    // True while the coach owns the voice: the shared read-aloud stays quiet then.
    isTalking: () => on && !!adapter && !!last,
    setOn,
    voices: () => englishVoices().map(v => ({ name: v.name, lang: v.lang, score: voiceScore(v) })),
    log: () => log.slice(),
    lastLine: () => (lastLine ? { show: textOf(lastLine.show), say: lastLine.say } : null),
    // Tests shorten the waits; learners always get the defaults.
    setTimings(t) { if (t.settle) SETTLE_MS = t.settle; if (t.idle) IDLE_MS = t.idle; if (t.hint) HINT_MS = t.hint; if ("silent" in t) SILENT = !!t.silent; },
  });

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start);
  else start();
})();
