// Scripted "screen recording" of the live Heat Transfer v2 sim.
// Real mouse drags/clicks in headless Chrome with a large visible cursor; the sim is advanced one
// model step per captured frame (deterministic 30 fps), with the Play button shown as playing.
//   node record.mjs        -> work/frames/*.jpg + work/marks.json
//   node record.mjs --dry  -> one PNG per mark in work/dry/
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const DRY = process.argv.includes('--dry');
const URL = 'https://iwant2study.moe.edu.sg/lookangejss/03thermalphysics_09transferofthermalenergy/ejss_model_HeatTransferv2/HeatTransferv2_Simulation.xhtml';
const FPS = 30;
const FR = 'work/frames', DRYD = 'work/dry';
for (const d of [FR, DRYD]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

const b = await puppeteer.launch({ executablePath: process.env.CHROME_PATH, headless: true });   // CHROME_PATH: e.g. Chrome for Testing via `npx @puppeteer/browsers install chrome`
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1.5 });   // screenshots are 1920x1080
await p.goto(URL, { waitUntil: 'networkidle2' });
await new Promise(r => setTimeout(r, 3000));
// stretch both panels so the app fills the 16:9 frame (the sim caps them at 500 px)
const fill = () => p.evaluate(() => { const v = _model.getView(); for (const k of ['Transfer', 'Graph']) { try { v[k].linkProperty('Height', () => 528); } catch (e) {} } _model.update(); });
await fill();
await new Promise(r => setTimeout(r, 800));

// large, high-contrast cursor + click ripple (headless screenshots have no pointer)
await p.evaluate(() => {
  const d = document.createElement('div');
  d.id = '__cur';
  d.style.cssText = 'position:fixed;left:0;top:0;width:40px;height:40px;z-index:2147483647;pointer-events:none;transform:translate(-200px,-200px);filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))';
  d.innerHTML = `<svg width="40" height="40" viewBox="0 0 24 24"><path d="M3 2 L3 19 L7.5 15 L10.5 22 L13.5 20.8 L10.6 14 L17 14 Z" fill="#ffe14a" stroke="#000" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const r = document.createElement('div');
  r.id = '__rip';
  r.style.cssText = 'position:fixed;left:0;top:0;width:50px;height:50px;margin:-25px 0 0 -25px;border-radius:50%;border:4px solid #ff3b4e;z-index:2147483646;pointer-events:none;opacity:0';
  document.body.appendChild(r); document.body.appendChild(d);
  const st = document.createElement('style'); st.textContent = '*{user-select:none!important;-webkit-user-select:none!important}'; document.head.appendChild(st);
  window.__cur = (x, y, rip) => {
    d.style.transform = `translate(${x - 3}px,${y - 2}px)`;
    r.style.left = x + 'px'; r.style.top = y + 'px';
    r.style.opacity = rip > 0 ? String(rip) : '0';
    r.style.transform = `scale(${1.6 - rip})`;
  };
});

let frame = 0, cx = 1000, cy = 780, rip = 0;
const marks = [];
const W = ms => new Promise(r => setTimeout(r, ms));
const raf = () => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const S = () => p.evaluate(() => _model._userSerialize());
const txt = id => p.evaluate(id => document.getElementById(id)?.innerText || '', id);
const box = id => p.evaluate(id => { const e = document.getElementById(id); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? [r.x, r.y, r.width, r.height].map(Math.round) : null; }, id);
const ctr = async id => { const r = await box(id); return r && [r[0] + r[2] / 2, r[1] + r[3] / 2]; };
const fakePlay = on => p.evaluate(on => {
  if (!window.__ip) { window.__ip = _model.isPlaying; window.__ipa = _model.isPaused; }
  _model.isPlaying = on ? () => true : window.__ip; _model.isPaused = on ? () => false : window.__ipa; _model.update();
}, on);

async function snap() {
  await p.evaluate((x, y, r) => window.__cur(x, y, r), cx, cy, rip);
  rip = Math.max(0, rip - 0.12);
  await raf();
  if (!DRY) await p.screenshot({ path: `${FR}/${String(frame).padStart(5, '0')}.jpg`, type: 'jpeg', quality: 90 });
  frame++;
}
async function hold(sec) { const n = Math.round(sec * FPS); for (let i = 0; i < n; i++) { if (DRY && rip <= 0 && i > 0) { frame++; continue; } await snap(); } }
const ease = u => u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
async function moveTo(x, y, sec = 0.6) {
  const n = Math.max(1, Math.round(sec * FPS)), x0 = cx, y0 = cy;
  for (let i = 1; i <= n; i++) { const u = ease(i / n); cx = x0 + (x - x0) * u; cy = y0 + (y - y0) * u; await p.mouse.move(cx, cy); await snap(); }
}
async function click(id, label, real = true) {
  const c = await ctr(id);
  await moveTo(c[0], c[1], 0.6);
  await hold(0.15);
  if (real) await p.mouse.click(c[0], c[1]);
  if (real) await fill();
  rip = 1; marks.push({ name: 'click', frame, t: frame / FPS, x: c[0], y: c[1], label });
  await snap(); await hold(0.35);
}
// drag a range slider's thumb to value v (real mouse drag)
async function slide(id, v, sec = 1.0) {
  const r = await box(id + '.slider');
  const [mn, mx, cur] = await p.evaluate(id => { const s = document.getElementById(id + '.slider'); return [+s.min, +s.max, +s.value]; }, id);
  const px = val => r[0] + 8 + (r[2] - 16) * (val - mn) / (mx - mn), y = r[1] + r[3] / 2;
  await moveTo(px(cur), y, 0.6); await hold(0.15);
  await p.mouse.down(); rip = 0.8; await snap();
  await moveTo(px(v), y, sec);
  for (let k = 0; k < 40; k++) {                 // nudge until the slider reports the wanted value
    const now = await p.evaluate(id => +document.getElementById(id + '.slider').value, id);
    if (Math.abs(now - v) < 1e-6) break;
    cx += now > v ? -2 : 2; await p.mouse.move(cx, cy); await snap();
  }
  await p.mouse.up(); await snap();
  const got = await p.evaluate(id => +document.getElementById(id + '.slider').value, id);
  marks.push({ name: 'slide', frame, t: frame / FPS, id, value: got, box: r });
  if (Math.abs(got - v) > 1e-6) console.log('WARN slider', id, 'wanted', v, 'got', got);
  await hold(0.4);
}
// advance the model: `per` model steps per captured frame, until done() or maxFrames
async function run(per, done, maxFrames, tag) {
  await fill();
  await fakePlay(true);
  let f = 0;
  for (; f < maxFrames; f++) {
    for (let k = 0; k < per; k++) await p.evaluate(() => _model.step());
    await snap();
    if (await p.evaluate(done)) break;
  }
  await W(600);
  await fakePlay(false);
  await snap();
  await mark(tag);
}
async function track(tag, list) { const s = await S(); list.push({ frame, t: frame / FPS, simT: s.t, bT: s.bT, cT: s.cT }); }
async function mark(name, extra = {}) {
  const s = await S();
  const m = { name, frame, t: frame / FPS, simMin: +(s.t / 60).toFixed(2), bT: +s.bT.toFixed(2), cT: +s.cT.toFixed(2), cView: s.cView,
    readout: await txt('temperatureReadout'), flow: await txt('heatFlowReadout'), stage: await txt('stageHeading'),
    boxes: Object.fromEntries(await Promise.all(['playPauseButton2', 'resetButton3', 'transferShortcut', 'temperatureReadout', 'heatFlowReadout', 'slider22', 'heat2', 'slider2', 'slider23', 'checkBox', 'Transfer', 'Graph', '.myBoxPanelOk.okbt'].map(async k => [k, await box(k)]))), ...extra };
  marks.push(m);
  if (DRY) await p.screenshot({ path: `${DRYD}/${String(marks.length).padStart(2, '0')}_${name}.png` });
  console.log(`${m.t.toFixed(2)}s ${name} | ${m.stage} | ${m.readout} | ${m.flow}`);
}
const atTarget = () => { const s = _model._userSerialize(); return s.bT >= s.maxT - 1e-6; };

// ------------------------------------------------------------------ 1. intro
await p.evaluate(() => _model._userUnserialize({ dt: 0.25 }));
await mark('intro');
await hold(2.5);

// ------------------------------------------------------------------ 2. heating on LOW
await click('playPauseButton2', 'Play', false);
await run(1, atTarget, 2000, 'low_done');        // dt 0.25 s x 5 sub-steps per model step
await hold(2.5);
await click('.myBoxPanelOk.okbt', 'Ok');
await mark('low_ok');
await hold(1.0);

// ------------------------------------------------------------------ 3. reset, HIGH heater
await click('resetButton3', 'Reset');
await p.evaluate(() => _model._userUnserialize({ dt: 0.25 }));
await mark('reset1');
await slide('heat2', 5, 1.0);
await mark('high_set');
await click('playPauseButton2', 'Play', false);
await run(1, atTarget, 2000, 'high_done');
await hold(2.5);
await click('.myBoxPanelOk.okbt', 'Ok');      // event hand-off to stage 2: beaker at target, heater off
await p.evaluate(() => _model._userUnserialize({ dt: 0.5 }));
await mark('stage2');
await hold(2.0);

// ------------------------------------------------------------------ 4. transfer: 100 °C beaker, 25 °C bath, 0.1 kg
const checked = await p.evaluate(() => document.getElementById('checkBox.checkbox').checked);
if (!checked) await click('checkBox.checkbox', 'Show heat flow');
await click('playPauseButton2', 'Play', false);
await p.evaluate(() => _model._userUnserialize({ arrowNum: 3 })); await fill();
const curve1 = [];
for (let i = 0; i < 1500; i++) {
  await fakePlay(true);
  await p.evaluate(() => _model.step());
  await snap(); await track('t1', curve1);
  if (i === 110) await mark('t1_early');
  if ((await S()).t >= 12.5 * 60) break;
}
await fakePlay(false); await snap();
await mark('t1_done', { peakBath: Math.max(...curve1.map(c => c.cT)), peakAt: curve1.reduce((a, c) => c.cT > a.cT ? c : a).simT / 60 });
await hold(3.0);

// ------------------------------------------------------------------ 5. reverse: beaker 40 °C, bath 90 °C
await click('resetButton3', 'Reset');
await slide('slider22', 40, 1.0);
await click('transferShortcut', 'Start transfer at target');
await p.evaluate(() => _model._userUnserialize({ dt: 0.5 }));
await slide('slider2', 90, 1.0);
await mark('rev_set');
await hold(1.5);
await click('playPauseButton2', 'Play', false);
await p.evaluate(() => _model._userUnserialize({ arrowNum: 3 })); await fill();
const curve2 = [];
for (let i = 0; i < 1500; i++) {
  await fakePlay(true);
  await p.evaluate(() => _model.step());
  await snap(); await track('t2', curve2);
  if (i === 55) await mark('rev_early');
  if ((await S()).t >= 10 * 60) break;
}
await fakePlay(false); await snap();
await mark('rev_done', { peakBeaker: Math.max(...curve2.map(c => c.bT)), peakAt: curve2.reduce((a, c) => c.bT > a.bT ? c : a).simT / 60 });
await hold(3.0);

// ------------------------------------------------------------------ 6. heavier bath: 1.0 kg at 25 °C
await click('resetButton3', 'Reset');
await click('transferShortcut', 'Start transfer at target');
await p.evaluate(() => _model._userUnserialize({ dt: 0.5 }));
await slide('slider23', 1.0, 1.0);
await mark('mass_set');
await hold(1.5);
await click('playPauseButton2', 'Play', false);
await p.evaluate(() => _model._userUnserialize({ arrowNum: 3 })); await fill();
const curve3 = [];
for (let i = 0; i < 1500; i++) {
  await fakePlay(true);
  await p.evaluate(() => _model.step());
  await snap(); await track('t3', curve3);
  if ((await S()).t >= 12.5 * 60) break;
}
await fakePlay(false); await snap();
await mark('mass_done', { peakBath: Math.max(...curve3.map(c => c.cT)), peakAt: curve3.reduce((a, c) => c.cT > a.cT ? c : a).simT / 60 });
await moveTo(1150, 690, 0.6);
await hold(3.0);
await mark('end');

fs.writeFileSync('work/marks.json', JSON.stringify({ fps: FPS, frames: frame, marks, curve1, curve2, curve3 }, null, 1));
console.log('frames', frame, (frame / FPS).toFixed(1) + 's');
await b.close();
