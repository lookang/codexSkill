"use strict";
// EJSS Guide Kit: puts a Slow Solve guide and a spoken Coach on any EJSS / WebEJS simulation.
// Generic: nothing in this file knows about one particular simulation. Each simulation adds its own small file
// (here sim-guide.js) that calls EjssGuide.define({...}) with its steps and coach lines.
//
// It reuses two engines unchanged: cambridge-guided-solver.js (step text + red/yellow highlights) and
// cambridge-coach.js (spoken tutor). This kit supplies what an EJSS page lacks: the two buttons, one floating
// window that holds both the Slow Solve steps and the Coach, and a way to read the model.
//
// The window floats over the page, so opening it never moves the simulation. The learner can drag it by its top
// bar, resize it by its corner grip, and double-click the bar to send it back to its corner. Its place and size are
// remembered in this browser only.
//
// The model is read with _model._userSerialize(), which every EJSS page has. The kit never writes to the model.
//
// Definition (one per simulation):
//   {
//     id: "em-strength",
//     mount(): { button: Element, panel: Element },  // the buttons go after `button`; the window is added after
//                                                    // `panel` (it floats, so this only decides which part of the
//                                                    // page owns it, e.g. the part that goes full screen)
//     floatButtons: true,              // optional: the control row has no room, so the buttons float bottom-left
//     key(s): string,                  // changes whenever the guide text should be worked out again
//     steps(s): [{ title, html, focus: [{ target, look? }] }],   // html must be well-formed (XHTML pages): <b>..</b> only
//     loopStep: 1, loopLabel: "Run another trial",   // optional: what Next does on the last step
//     coach: { scene(s), moves(s), result(s), react(reason, prev, s) }   // optional; react returns { show, look, press }
//   }
// Events for analytics: EjssGuide.on((evt, s) => ...) receives "ready", "change", "tick", "slow-solve-open",
// "slow-solve-close", "slow-solve-step", "coach-line", plus anything a simulation file emits itself.

(() => {
  if (window.EjssGuide) return;
  const doc = document;
  const POLL_MS = 250;
  const GEO_KEY = "ejss-guide-window";
  const MIN_W = 240, MIN_H = 110, EDGE = 4;
  const listeners = [];
  let def = null, cur = null, curAt = 0, lastKey = null, started = false, registered = false;
  let open = false, step = 0;
  let btn = null, holder = null, win = null, bar = null, panel = null, textEl = null, countEl = null, backBtn = null, nextBtn = null;
  let pointerDown = false, frame = 0;
  // Where the window is. Until the learner moves or resizes it, it stays docked in the bottom-right corner.
  let geo = { placed: false, left: 0, top: 0, width: 380, height: 0 };

  const warn = (what, e) => { if (window.console) console.warn("EJSS guide: " + what, e); };

  // ---------- Reading the model ----------
  function read() {
    try {
      const m = window._model;
      return m && typeof m._userSerialize === "function" ? m._userSerialize() : null;
    } catch (e) { return null; }
  }
  function state() {
    const now = Date.now();
    if (!cur || now - curAt > 60) { const s = read(); if (s) { cur = s; curAt = now; } }
    return cur;
  }
  function emit(type, data) {
    const evt = Object.assign({ type }, data || {});
    for (const fn of listeners.slice()) { try { fn(evt, cur); } catch (e) { warn("listener", e); } }
  }
  const keyOf = s => { try { return String(def.key(s)); } catch (e) { return ""; } };
  const stepsOf = s => { try { return (s && def.steps(s)) || []; } catch (e) { warn("steps", e); return []; } };
  const coachOn = () => { try { return !!(window.CambridgeCoach && def.coach && window.CambridgeCoach.isOn()); } catch (e) { return false; } };

  // ---------- Where the window sits ----------
  function loadGeo() {
    try {
      const g = JSON.parse(localStorage.getItem(GEO_KEY) || "null");
      if (g && [g.left, g.top, g.width].every(Number.isFinite)) geo = { placed: true, left: g.left, top: g.top, width: g.width, height: Number.isFinite(g.height) ? g.height : 0 };
    } catch (e) { /* no saved place: the window starts docked */ }
  }
  function saveGeo() {
    try {
      if (geo.placed) localStorage.setItem(GEO_KEY, JSON.stringify({ left: geo.left, top: geo.top, width: geo.width, height: geo.height }));
      else localStorage.removeItem(GEO_KEY);
    } catch (e) { /* private window: the place lasts for this page only */ }
  }
  // Keeps the whole window inside the browser window, whatever size either of them is.
  function clampGeo() {
    const vw = window.innerWidth, vh = window.innerHeight;
    geo.width = Math.max(MIN_W, Math.min(geo.width, vw - 2 * EDGE));
    if (geo.height) geo.height = Math.max(MIN_H, Math.min(geo.height, vh - 2 * EDGE));
    const h = Math.min(geo.height || (win ? win.offsetHeight : 0) || MIN_H, vh - 2 * EDGE);
    geo.left = Math.max(EDGE, Math.min(geo.left, vw - geo.width - EDGE));
    geo.top = Math.max(EDGE, Math.min(geo.top, vh - h - EDGE));
  }
  function applyGeo() {
    if (!win) return;
    win.classList.toggle("eg-docked", !geo.placed);
    const set = (name, value) => { if (win.style[name] !== value) win.style[name] = value; };
    if (geo.placed) {
      clampGeo();
      set("left", geo.left + "px"); set("top", geo.top + "px");
      set("width", geo.width + "px"); set("height", geo.height ? geo.height + "px" : "");
    } else {
      set("left", ""); set("top", ""); set("height", "");
      set("width", Math.max(MIN_W, Math.min(geo.width, window.innerWidth - 2 * EDGE)) + "px");
    }
  }
  // From the docked corner to a place of its own: start from exactly where it is now.
  function unDock(keepHeight) {
    const r = win.getBoundingClientRect();
    geo.left = r.left; geo.top = r.top; geo.width = r.width;
    if (keepHeight) geo.height = r.height;
    geo.placed = true;
  }
  function dock() { geo = { placed: false, left: 0, top: 0, width: 380, height: 0 }; applyGeo(); saveGeo(); }
  function startDrag(e, sizing) {
    if (e.button) return;
    e.preventDefault();
    unDock(sizing);
    const x0 = e.clientX, y0 = e.clientY, from = Object.assign({}, geo);
    const move = ev => {
      const dx = ev.clientX - x0, dy = ev.clientY - y0;
      if (sizing) { geo.width = from.width + dx; geo.height = from.height + dy; } else { geo.left = from.left + dx; geo.top = from.top + dy; }
      applyGeo();
    };
    const end = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", end, true);
      window.removeEventListener("pointercancel", end, true);
      win.classList.remove("is-moving");
      saveGeo();
    };
    win.classList.add("is-moving");
    window.addEventListener("pointermove", move, true);
    window.addEventListener("pointerup", end, true);
    window.addEventListener("pointercancel", end, true);
  }
  // Keyboard: arrow keys move the window, Shift + arrow keys resize it.
  function barKey(e) {
    const d = { ArrowLeft: [-16, 0], ArrowRight: [16, 0], ArrowUp: [0, -16], ArrowDown: [0, 16] }[e.key];
    if (!d) return;
    e.preventDefault();
    unDock(e.shiftKey);
    if (e.shiftKey) { geo.width += d[0]; geo.height += d[1]; } else { geo.left += d[0]; geo.top += d[1]; }
    applyGeo(); saveGeo();
  }

  // ---------- Buttons and the window ----------
  function make(tag, attrs, text) {
    const el = doc.createElement(tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    if (text != null) el.textContent = text;
    return el;
  }
  function build() {
    const name = def.buttonText || "Slow Solve";
    btn = make("button", { type: "button", id: "ejss-guide-toggle", class: "eg-toggle", "aria-expanded": "false", title: "A step-by-step guide to this simulation" }, name);
    btn.addEventListener("click", () => setOpen(!open));
    // floatButtons: the simulation's own control row is full, so the two buttons float in the bottom-left corner
    // instead of joining it. The coach engine puts its button right after ours, inside the same holder.
    if (def.floatButtons) { holder = make("div", { class: "eg-launcher" }); holder.appendChild(btn); }

    win = make("div", { id: "ejss-guide-window", class: "eg-window eg-docked", role: "region", "aria-label": "Guide" });
    win.hidden = true;
    bar = make("div", { class: "eg-bar", tabindex: "0", role: "button", "aria-label": "Guide window. Drag to move it. Arrow keys move it, Shift and arrow keys resize it. Double-click to send it back to the corner.", title: "Drag to move · double-click to send back to the corner" });
    bar.appendChild(make("span", { class: "eg-grip", "aria-hidden": "true" }, "⠿"));
    bar.appendChild(make("span", { class: "eg-bar-text" }, "Guide · drag to move"));
    bar.addEventListener("pointerdown", e => startDrag(e, false));
    bar.addEventListener("dblclick", dock);
    bar.addEventListener("keydown", barKey);
    const body = make("div", { class: "eg-body" });
    const grip = make("div", { class: "eg-size", "aria-hidden": "true", title: "Drag to resize" });
    grip.addEventListener("pointerdown", e => startDrag(e, true));

    panel = make("section", { id: "ejss-guide", class: "eg-panel", "aria-label": name });
    panel.hidden = true;
    const head = make("div", { class: "eg-head" });
    head.appendChild(make("strong", { class: "eg-title" }, name));
    countEl = make("span", { class: "eg-count" }, "");
    head.appendChild(countEl);
    const close = make("button", { type: "button", class: "eg-close", "aria-label": "Close " + name }, "×");
    close.addEventListener("click", () => { setOpen(false); btn.focus(); });
    textEl = make("p", { class: "solver-step eg-step", role: "status", "aria-live": "polite" }, "");
    const nav = make("div", { class: "eg-nav" });
    // No arrows in the words: the stylesheet draws them, and the engine's floating bar adds its own.
    backBtn = make("button", { type: "button", id: "solver-prev", class: "eg-back" }, "Back");
    nextBtn = make("button", { type: "button", id: "solver-next", class: "eg-next" }, "Next step");
    backBtn.addEventListener("click", () => goTo(step - 1));
    nextBtn.addEventListener("click", () => {
      const n = stepsOf(state()).length;
      goTo(step < n - 1 ? step + 1 : (def.loopStep || 0));
    });
    nav.appendChild(backBtn); nav.appendChild(nextBtn);
    head.appendChild(nav); head.appendChild(close);
    panel.appendChild(head); panel.appendChild(textEl);
    // The coach engine adds its own panel right after this one, so both live in the same window.
    body.appendChild(panel);
    win.appendChild(bar); win.appendChild(body); win.appendChild(grip);
    loadGeo();
  }
  function mount() {
    let where = null;
    try { where = def.mount(); } catch (e) { where = null; }
    if (!where || !where.button || !where.panel) return false;
    if (!btn) build();
    // The simulation may rebuild or move its own controls: follow them.
    const first = holder || btn;
    if (!first.isConnected || first.previousElementSibling !== where.button) where.button.insertAdjacentElement("afterend", first);
    if (!win.isConnected || win.previousElementSibling !== where.panel) where.panel.insertAdjacentElement("afterend", win);
    return true;
  }
  function setText(el, text) { if (el.textContent !== text) el.textContent = text; }
  // The window shows while Slow Solve is open or the coach is on, and holds whichever of the two is in use.
  function showWindow() {
    if (!win) return;
    const show = open || coachOn();
    if (win.hidden === show) { win.hidden = !show; if (show) applyGeo(); }
    else if (show && geo.placed) applyGeo();
  }
  function paint() {
    if (!panel) return;
    const n = stepsOf(state()).length;
    step = Math.max(0, Math.min(Math.max(0, n - 1), step));
    if (panel.hidden !== !open) panel.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    btn.classList.toggle("is-open", open);
    setText(countEl, n ? `Step ${step + 1} of ${n}` : "");
    backBtn.disabled = step === 0;
    setText(nextBtn, step < n - 1 ? "Next step" : (def.loopLabel || "Start again"));
    showWindow();
    if (window.CambridgeGuidedSolver) window.CambridgeGuidedSolver.refresh();
  }
  function setOpen(value) {
    if (!panel) return;
    open = !!value;
    // Slow Solve now owns the highlights: clear any the coach left from its last line.
    if (open) doc.querySelectorAll(".cc-look, .cc-press").forEach(el => el.classList.remove("cc-look", "cc-press"));
    emit(open ? "slow-solve-open" : "slow-solve-close", { step });
    paint();
  }
  function goTo(index) {
    const list = stepsOf(state());
    const next = Math.max(0, Math.min(list.length - 1, index));
    if (next === step) return;
    step = next;
    emit("slow-solve-step", { step, title: (list[step] && list[step].title) || "" });
    paint();
  }

  // ---------- The two engines ----------
  function register() {
    if (registered) return;
    registered = true;
    if (window.CambridgeGuidedSolver) {
      window.CambridgeGuidedSolver.register({
        id: def.id,
        isActive: () => open && !!panel && panel.isConnected,
        stepIndex: () => step,
        textContainer: () => textEl,
        context: () => { const s = state(); return { s, key: keyOf(s) }; },
        steps: ctx => stepsOf(ctx.s),
      });
    }
    const c = def.coach;
    if (window.CambridgeCoach && c) {
      const text = html => { const d = doc.createElement("div"); d.innerHTML = html || ""; return d.textContent.replace(/\s+/g, " ").trim(); };
      const call = (fn, s, fallback) => { try { return fn ? String(fn(s)) : fallback; } catch (e) { return fallback; } };
      window.CambridgeCoach.register({
        id: def.id,
        mount: () => (btn && panel && btn.isConnected && panel.isConnected ? { button: btn, panel } : null),
        // The coach keeps talking while Slow Solve is open (lookang, 2026-11-15): both run in the same window.
        isActive: () => !!state(),
        snapshot() {
          // The coach polls on its own clock: bring the simulation file's own bookkeeping up to date first.
          tick();
          const s = state();
          return s ? { scene: call(c.scene, s, def.id), moves: call(c.moves, s, ""), result: call(c.result, s, ""), st: s } : null;
        },
        react(reason, prev, now) {
          const line = c.react(reason, prev && prev.st, now.st);
          if (!line || !line.show) return null;
          // One pointer at a time: while Slow Solve is open its step owns the red and yellow highlights, so the
          // coach only speaks. Otherwise the two could point at different things at once.
          return { show: line.show, say: line.say || text(line.show), look: open ? [] : line.look || [], press: open ? [] : line.press || [] };
        },
        support(reason) { emit("coach-line", { reason }); },
      });
    }
  }

  // ---------- Watching ----------
  function tick() {
    if (!def) return;
    curAt = 0;
    const s = state();
    if (!s || !mount()) return;
    register();
    const k = keyOf(s);
    if (k !== lastKey) { const first = lastKey === null; lastKey = k; emit(first ? "ready" : "change"); paint(); }
    showWindow();
    emit("tick");
  }
  function start() {
    if (started) return;
    started = true;
    // A drag inside the simulation changes the model many times between two polls: sample it every frame.
    doc.addEventListener("pointerdown", () => { pointerDown = true; }, true);
    const up = () => { pointerDown = false; setTimeout(tick, 0); };
    doc.addEventListener("pointerup", up, true);
    doc.addEventListener("pointercancel", up, true);
    const moved = () => { if (pointerDown && !frame) frame = requestAnimationFrame(() => { frame = 0; tick(); }); };
    doc.addEventListener("pointermove", moved, true);
    doc.addEventListener("touchmove", moved, { capture: true, passive: true });
    window.addEventListener("resize", () => { if (win && !win.hidden) applyGeo(); });
    setInterval(tick, POLL_MS);
    tick();
  }

  window.EjssGuide = Object.freeze({
    define(d) { def = d; if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", start); else start(); },
    state,
    el: id => doc.getElementById(id),
    on(fn) { listeners.push(fn); },
    emit,
    isOpen: () => open,
    step: () => step,
    setOpen,
    goTo,
    resetWindow: dock,
  });
})();
