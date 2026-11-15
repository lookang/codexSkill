"use strict";
// Guided Slow Solve tutor (owned by Claude; see AGENTS.md "Slow Solve ownership").
// A pilot registers a definition; on every re-render this engine rewrites the open Slow Solve
// step from the pilot's live state and highlights exactly what the learner should look at or press.
//
// Definition:
//   {
//     id: "chance",
//     isActive(): boolean,             // Challenge mode with Slow Solve open, and this pilot path is covered
//     stepIndex(): number,             // current step (0-based), read from the pilot's own state
//     textContainer(): Element|null,   // where the step text goes (e.g. ".solver .solver-step")
//     context(): object,               // live values (counts, choices...); ctx.key changes when the situation changes
//     steps(ctx): [{ title, html, focus: [ { target, mark?, all? } ] }]
//     showTitle: false                 // optional: the pilot's panel already shows the step title
//   }
// focus.target: CSS selector, Element, Element[] or () => Element|Element[]
// focus.mark:   text to wrap and blink inside the target (first match), e.g. "Red 7"
// focus.look:   true = "look at this" (yellow blinking glow). Use for text, numbers and model parts.
// Otherwise the element gets a pulsing red box, which means "press this": use it only for the
// control the learner should operate next, never for something that changes when tapped.

(() => {
  if (window.CambridgeGuidedSolver) return;
  const defs = [];
  let scheduled = false;
  let applying = false;
  let lastKey = "";
  let observer = null;
  const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function toElements(target) {
    if (!target) return [];
    if (typeof target === "function") return toElements(target());
    if (typeof target === "string") return [...document.querySelectorAll(target)];
    if (target instanceof Element) return [target];
    if (Array.isArray(target) || target instanceof NodeList) return [...target].flatMap(toElements);
    return [];
  }

  function clearHighlights() {
    document.querySelectorAll(".gs-focus, .gs-look").forEach(el => el.classList.remove("gs-focus", "gs-look"));
    document.querySelectorAll("mark.gs-mark").forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
  }

  function markText(root, needle) {
    if (!needle) return null;
    // Exact match first, then ignoring case ("1 red" also finds "1 Red").
    return markFirst(root, needle, false) || markFirst(root, needle.toLowerCase(), true);
  }

  function markFirst(root, needle, ignoreCase) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const at = (ignoreCase ? node.nodeValue.toLowerCase() : node.nodeValue).indexOf(needle);
      if (at < 0) continue;
      const range = document.createRange();
      range.setStart(node, at);
      range.setEnd(node, at + needle.length);
      const mark = document.createElement("mark");
      mark.className = "gs-mark";
      range.surroundContents(mark);
      return mark;
    }
    return null;
  }

  function apply() {
    scheduled = false;
    applying = true;
    try {
      clearHighlights();
      const def = defs.find(d => { try { return d.isActive(); } catch (e) { return false; } });
      document.body.toggleAttribute("data-gs-active", !!def);
      if (!def) { lastKey = ""; return; }
      const ctx = def.context();
      const steps = def.steps(ctx) || [];
      if (!steps.length) return;
      const index = Math.max(0, Math.min(steps.length - 1, def.stepIndex()));
      const step = steps[index];

      const box = def.textContainer();
      if (box) {
        const html = def.showTitle === false
          ? `<span class="gs-text">${step.html}</span>`
          : `<strong>${step.title}</strong><span class="gs-text">${step.html}</span>`;
        // Rewrite when the step changed, or when the page wrote its own text into the same box (the tutor's span is gone).
        if (box.getAttribute("data-gs-html") !== html || !box.querySelector(":scope > .gs-text")) {
          box.innerHTML = html;
          box.setAttribute("data-gs-html", html);
        }
        box.setAttribute("data-gs-ready", "");
      }

      const focused = [];
      for (const f of step.focus || []) {
        const els = toElements(f.target);
        for (const el of (f.all ? els : els.slice(0, 1))) {
          if (f.mark) {
            const m = markText(el, f.mark);
            if (m) focused.push(m);
          } else {
            el.classList.add(f.look ? "gs-look" : "gs-focus");
            focused.push(el);
          }
        }
      }
      // A reading-only step still needs one thing to press: the Next step button.
      if (!document.querySelector(".gs-focus") && index < steps.length - 1) {
        const next = realButton(NEXT_SEL);
        if (next && !next.disabled) next.classList.add("gs-focus");
      }

      const key = `${def.id}|${index}|${ctx.key || ""}`;
      if (key !== lastKey) {
        lastKey = key;
        // Tell listeners (the shared read-aloud) that a new step or new advice is showing.
        const tmp = document.createElement("div"); tmp.innerHTML = step.html;
        document.dispatchEvent(new CustomEvent("cambridge-guided-solver:step", {
          detail: { id: def.id, step: index, count: steps.length, title: step.title || "", text: tmp.textContent.trim(), container: box },
        }));
        const first = focused[0];
        if (first && typeof first.scrollIntoView === "function") {
          const r = first.getBoundingClientRect();
          if (r.top < 0 || r.bottom > window.innerHeight) {
            first.scrollIntoView({ block: "center", behavior: reduceMotion() ? "auto" : "smooth" });
          }
        }
      }
    } catch (error) {
      if (window.console) console.warn("Guided Slow Solve:", error);
    } finally {
      updateNav();
      if (observer) observer.takeRecords();
      applying = false;
    }
  }

  // ---------- Always-reachable Back / Next (lookang, 2026-10-19) ----------
  // Some pages fix their height and clip the guide, so its Next button can sit below the window where neither the
  // page nor the guide scrolls. While the guide is open and its real Next button is not on screen, a small bar at the
  // bottom of the window repeats Back and Next: it presses the page's own buttons, copies their words and disabled
  // state, and carries the red box when Next is the thing to press. It hides as soon as the real button is visible.
  const NEXT_SEL = '#solver-next, #challenge-solver-next, [id$="solver-next"], [data-action="solver-next"], [data-solver-next]';
  const BACK_SEL = '#solver-prev, #solver-previous, #challenge-solver-back, [id$="solver-back"], [id$="solver-prev"], [id$="solver-previous"], [data-action="solver-prev"], [data-action="solver-back"], [data-action="solver-previous"]';
  const realButton = sel => [...document.querySelectorAll(sel)].find(b => !b.closest(".gs-nav") && b.getClientRects().length && getComputedStyle(b).visibility !== "hidden") || null;
  let nav = null, navFrame = 0;
  function makeNav() {
    nav = document.createElement("div");
    nav.className = "gs-nav";
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", "Slow Solve steps");
    nav.hidden = true;
    nav.innerHTML = '<button type="button" class="gs-nav-back" data-gs-nav="back"></button><button type="button" class="gs-nav-next" data-gs-nav="next"></button>';
    nav.addEventListener("click", event => {
      const which = event.target.closest("[data-gs-nav]")?.dataset.gsNav;
      const real = which && realButton(which === "next" ? NEXT_SEL : BACK_SEL);
      if (real && !real.disabled) { real.click(); schedule(); }
    });
    document.body.appendChild(nav);
  }
  // On screen means: its centre is inside the window and nothing (a clipping card, another layer) covers it.
  function onScreen(el) {
    const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && (hit === el || el.contains(hit));
  }
  function updateNav() {
    const active = document.body.hasAttribute("data-gs-active");
    const next = active ? realButton(NEXT_SEL) : null;
    if (!next) { if (nav) nav.hidden = true; return; }
    if (!nav) makeNav();
    nav.hidden = true; // measure without the bar in the way
    if (onScreen(next)) return;
    const back = realButton(BACK_SEL);
    const [backBtn, nextBtn] = nav.children;
    const label = el => (el.textContent || "").replace(/\s+/g, " ").trim();
    const setText = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    setText(nextBtn, `${label(next) || "Next step"} ▸`);
    nextBtn.disabled = !!next.disabled;
    nextBtn.classList.toggle("gs-focus", next.classList.contains("gs-focus"));
    backBtn.hidden = !back;
    if (back) { setText(backBtn, `◂ ${label(back) || "Back"}`); backBtn.disabled = !!back.disabled; }
    nav.hidden = false;
  }
  const navSoon = () => { if (!navFrame) navFrame = requestAnimationFrame(() => { navFrame = 0; updateNav(); }); };

  function schedule() {
    if (scheduled || applying) return;
    scheduled = true;
    // A hidden or background tab pauses animation frames, so a short timer also runs the update (whichever comes first).
    let ran = false;
    const run = () => { if (ran) return; ran = true; apply(); };
    requestAnimationFrame(run);
    setTimeout(run, 120);
  }

  function start() {
    observer = new MutationObserver(() => { if (!applying) schedule(); });
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("input", schedule, true);
    document.addEventListener("change", schedule, true);
    document.addEventListener("click", () => setTimeout(schedule, 0), true);
    addEventListener("scroll", navSoon, { capture: true, passive: true });
    addEventListener("resize", navSoon);
    schedule();
  }

  window.CambridgeGuidedSolver = Object.freeze({
    register(def) { defs.push(def); if (document.body) schedule(); },
    refresh: schedule,
    // Read-only: each registered tutor's steps for the live state, whether or not Slow Solve is open. The AI Coach
    // (cambridge-coach-kit.js) reads them to know what the learner has done and what is next. Nothing is rendered.
    peek() {
      return defs.map(d => {
        try {
          const ctx = d.context(), steps = (d.steps(ctx) || []).map(s => ({ title: s.title || "", html: s.html || "", focus: s.focus || [] }));
          let active = false;
          try { active = !!d.isActive(); } catch (e) { active = false; }
          return { id: d.id, key: String(ctx.key || ""), steps, active };
        } catch (e) { return { id: d.id, error: String(e && e.message || e), steps: [] }; }
      });
    },
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
