#!/usr/bin/env node
/*
 * Fold-geometry check for the 3D nets, run against the REAL Three.js.
 *
 * An earlier version of this check re-implemented the hinge maths by hand and reported every net correct
 * while the rendered nets were visibly broken. It agreed with the renderer's *intent*, which is exactly
 * what a test must never do — both were written from the same wrong assumption about Euler order. Three.js
 * composes rotation.x and rotation.y on one object as Rx·Ry (Y applied first), so a face folding about a
 * spun hinge turned about its parent's axis instead of its own edge.
 *
 * This version builds the tree from genuine THREE.Group objects and asks Three.js itself for the world
 * positions and normals, so any disagreement about matrix order surfaces here rather than on screen.
 *
 *   node _source/net_fold_check.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const sourceRoot = __dirname;

// Load the CLASSIC build the activities actually ship, not the ES module in vendor/. Using the shipped
// artefact means the check exercises the same Three.js a learner's browser runs.
function loadThree() {
  const projectRoot = path.dirname(sourceRoot);
  const netsActivity = fs.readdirSync(projectRoot)
    .find(name => /^Primary4_39_GEO_Nets/.test(name));
  const classic = netsActivity && path.join(projectRoot, netsActivity, 'lib', 'three.r150.classic.js');
  if (!classic || !fs.existsSync(classic)) {
    throw new Error('Shipped three.r150.classic.js not found — run _source/build.ps1 first');
  }
  const context = vm.createContext({
    console, Math, Date, JSON, Object, Array, Number, String, Boolean, Symbol, Map, Set, WeakMap, WeakSet,
    ArrayBuffer, Float32Array, Uint16Array, Uint32Array, Int32Array, Uint8Array, Uint8ClampedArray,
    isNaN, isFinite, parseFloat, parseInt
  });
  // The shipped bundle announces itself to the page when it finishes loading; stub that away.
  context.CustomEvent = function CustomEvent() {};
  context.dispatchEvent = function () {};
  context.self = context; context.window = context; context.globalThis = context;
  new vm.Script(fs.readFileSync(classic, 'utf8')).runInContext(context);
  const THREE = context.THREE || context.window.THREE;
  if (!THREE || !THREE.Group) throw new Error('Classic Three.js build did not expose a global THREE');
  return THREE;
}

// Read the layout out of the template so this check can never drift from what ships.
function loadLayout() {
  const html = fs.readFileSync(path.join(sourceRoot, 'index.template.html'), 'utf8');
  const body = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).find(b => b.includes('__ACTIVITY_CONFIG__'));
  const code = body
    .replace('__ACTIVITY_CONFIG__', '({id:"P4",kind:"p4_identify_nets",objective:"nets",shortTitle:"t"})')
    .replace('__THREE_RUNTIME_SCRIPT__', '')
    .replace(/\n(\s*)init\(\);/, '\n$1globalThis.__X = { netFoldLayout, NET_FACE_ATTACH, netFaceGeometry };');
  const stub = () => new Proxy(function () {}, {
    get(_, prop) {
      if (prop === 'length') return 0;
      if (prop === Symbol.iterator) return function* gen() {};
      return stub();
    },
    set: () => true, apply: () => stub(), has: () => true
  });
  const context = {
    console, Math, Date, JSON, Number, String, Boolean, Array, Object, Set, Map, RegExp, Error,
    parseInt, parseFloat, isNaN, isFinite, setTimeout, clearTimeout, setInterval, clearInterval,
    document: {
      getElementById: () => stub(), querySelector: () => stub(), querySelectorAll: () => [],
      createElement: () => stub(), addEventListener() {}, documentElement: stub(), body: stub()
    },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {}, clear() {} },
    location: { search: '' }, navigator: { userAgent: 'node' }, performance: { now: () => 0 },
    requestAnimationFrame: () => 0, cancelAnimationFrame() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
    speechSynthesis: { speak() {}, cancel() {} }, SpeechSynthesisUtterance: function () {},
    fetch: () => Promise.resolve({}), katex: { render() {}, renderToString: t => t },
    getComputedStyle: () => stub()
  };
  context.window = context; context.globalThis = context; context.self = context;
  vm.createContext(context);
  new vm.Script(code).runInContext(context);
  return context.__X;
}

// The same hinge tree the renderer builds: outer group carries position and spin, inner group only ever
// rotates about its own X, children hang off the inner group so a fold carries everything beyond it.
function foldNet(T, layout, attach, folded) {
  const root = new T.Group(), nodes = new Map();
  layout.faces.forEach(face => {
    const hinge = new T.Group(), pivot = new T.Group();
    hinge.add(pivot);
    if (!face.parent) root.add(hinge);
    else {
      const parent = nodes.get(face.parent);
      const pw = parent.face.w, pd = parent.face.d, rooted = !parent.face.parent;
      const on = face.on || 'far', spin = (attach[on] || 0) * Math.PI / 180;
      const position = on === 'far' ? [0, 0, rooted ? pd / 2 : pd]
        : on === 'near' ? [0, 0, rooted ? -pd / 2 : 0]
        : on === 'right' ? [pw / 2, 0, rooted ? 0 : pd / 2]
        : [-pw / 2, 0, rooted ? 0 : pd / 2];
      hinge.position.set(...position);
      hinge.rotation.y = spin;
      parent.pivot.add(hinge);
    }
    if (folded) pivot.rotation.x = -(face.fold || 0) * Math.PI / 180;
    nodes.set(face.id, { face, hinge, pivot });
  });
  root.updateMatrixWorld(true);
  return nodes;
}

const round = n => Math.round(n * 1000) / 1000;

// Measure the face's REAL vertices, built by the same netFaceGeometry the renderer uses. Deriving a
// centroid from the layout instead is what hid the last defect: the base's geometry started at its hinge
// while the walls were placed around its centre, so every computed centroid agreed while the rendered
// floor sat half a face out from under the walls.
function measure(T, X, solid) {
  const layout = X.netFoldLayout(solid);
  const nodes = foldNet(T, layout, X.NET_FACE_ATTACH, true);
  const rows = []; measure.lastNodes = nodes;
  nodes.forEach(node => {
    const { face, pivot } = node;
    const geometry = X.netFaceGeometry(T, face), position = geometry.attributes.position;
    const box = new T.Box3(), centre = new T.Vector3();
    for (let i = 0; i < position.count; i++) {
      box.expandByPoint(new T.Vector3().fromBufferAttribute(position, i).applyMatrix4(pivot.matrixWorld));
    }
    box.getCenter(centre);
    node.box = box;
    const normal = new T.Vector3(0, 1, 0).transformDirection(pivot.matrixWorld);
    rows.push({
      id: face.id,
      centre: [round(centre.x), round(centre.y), round(centre.z)],
      extent: [
        `x[${round(box.min.x)},${round(box.max.x)}]`,
        `y[${round(box.min.y)},${round(box.max.y)}]`,
        `z[${round(box.min.z)},${round(box.max.z)}]`
      ].join(' '),
      normal: [round(normal.x), round(normal.y), round(normal.z)]
    });
  });
  return { layout, rows };
}

// A closed box, judged from the real vertex extents: every face must lie exactly on one of the six sides
// of the box [-w/2,w/2] x [0,h] x [-d/2,d/2], and its other two dimensions must span that side fully. A
// face that is flat but slid sideways passes a centroid test and fails this one.
function judgeBox(T, nodes, w, d, h) {
  const problems = [], tol = 0.02;
  const sides = {
    base:  { x: [-w / 2, w / 2], y: [0, 0],     z: [-d / 2, d / 2] },
    top:   { x: [-w / 2, w / 2], y: [h, h],     z: [-d / 2, d / 2] },
    front: { x: [-w / 2, w / 2], y: [0, h],     z: [d / 2, d / 2] },
    back:  { x: [-w / 2, w / 2], y: [0, h],     z: [-d / 2, -d / 2] },
    right: { x: [w / 2, w / 2],  y: [0, h],     z: [-d / 2, d / 2] },
    left:  { x: [-w / 2, -w / 2], y: [0, h],    z: [-d / 2, d / 2] }
  };
  nodes.forEach(({ face, box }) => {
    const want = sides[face.id];
    if (!want || !box) return;
    [['x', box.min.x, box.max.x], ['y', box.min.y, box.max.y], ['z', box.min.z, box.max.z]]
      .forEach(([axis, lo, hi]) => {
        const [wantLo, wantHi] = want[axis];
        if (Math.abs(lo - wantLo) > tol || Math.abs(hi - wantHi) > tol) {
          problems.push(`${face.id} spans ${axis}[${round(lo)},${round(hi)}] but that side of the box is ${axis}[${wantLo},${wantHi}]`);
        }
      });
  });
  return problems;
}

// Normals come out pointing inward for every folded face, so their sign says nothing useful. The test that
// actually means "this solid closes" is that the faces MEET: a pyramid's four slant faces must share one
// apex, and a prism's two sloping rectangles must share one ridge. Each face's far tip is (0,0,d) in its
// own canonical frame, so transforming that point is enough to check it.
function judgeMeeting(T, layout, nodes) {
  const problems = [];
  const tips = [];
  // The base must sit centred under the solid. Without this the prism and pyramid would sail past the
  // very defect that displaced the cube's floor, since tip coincidence alone says nothing about the base.
  nodes.forEach(({ face, box }) => {
    if (face.parent || !box) return;
    if (Math.abs(box.min.x + box.max.x) > 0.02 || Math.abs(box.min.z + box.max.z) > 0.02) {
      problems.push(`base spans x[${round(box.min.x)},${round(box.max.x)}] z[${round(box.min.z)},${round(box.max.z)}] — not centred under the solid`);
    }
  });
  nodes.forEach(({ face, pivot }) => {
    if (!face.parent) return;
    const tip = new T.Vector3(0, 0, face.d).applyMatrix4(pivot.matrixWorld);
    tips.push({ id: face.id, shape: face.shape, tip: [round(tip.x), round(tip.y), round(tip.z)] });
  });
  const sloping = tips.filter(t => t.shape === 'tri' || layout.solid === 'prism');
  const group = layout.solid === 'pyramid' ? tips : tips.filter(t => t.shape !== 'tri');
  if (layout.solid === 'pyramid') {
    const first = group[0];
    group.forEach(t => {
      const off = Math.max(...t.tip.map((v, i) => Math.abs(v - first.tip[i])));
      if (off > 0.02) problems.push(`${t.id} apex ${t.tip.join(',')} does not meet ${first.id} apex ${first.tip.join(',')}`);
    });
    if (Math.abs(first.tip[0]) > 0.02 || Math.abs(first.tip[2]) > 0.02) {
      problems.push(`apex ${first.tip.join(',')} is not above the centre of the base`);
    }
  }
  if (layout.solid === 'prism') {
    const ridge = group.filter(t => /side/.test(t.id));
    if (ridge.length === 2) {
      const off = Math.max(...ridge[0].tip.map((v, i) => Math.abs(v - ridge[1].tip[i])));
      if (off > 0.02) problems.push(`sloping faces do not meet: ${ridge[0].tip.join(',')} vs ${ridge[1].tip.join(',')}`);
    }
  }
  void sloping;
  return { problems, tips };
}

const T = loadThree();
const X = loadLayout();
let failures = 0;

for (const solid of ['cube', 'cuboid', 'prism', 'pyramid']) {
  const { layout, rows } = measure(T, X, solid);
  console.log(`\n${solid.toUpperCase()}  (${layout.label})`);
  rows.forEach(r => console.log(`   ${r.id.padEnd(6)} ${r.extent}`));
  const base = layout.faces[0];
  let problems;
  if (solid === 'cube' || solid === 'cuboid') {
    problems = judgeBox(T, measure.lastNodes, base.w, base.d, layout.faces.find(f => f.id === 'front').d);
  } else {
    const meeting = judgeMeeting(T, layout, measure.lastNodes);
    problems = meeting.problems;
    meeting.tips.filter(t => /side|f\d/.test(t.id))
      .forEach(t => console.log(`   ${t.id.padEnd(6)} far tip ${t.tip.join(', ')}`));
  }
  problems.forEach(p => console.log('   FAIL  ' + p));
  failures += problems.length;
}

console.log(failures
  ? `\nFAIL — ${failures} fold problem(s)`
  : '\nPASS — every net folds closed: centres and face normals both correct');
process.exit(failures ? 1 : 0);
