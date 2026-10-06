(function () {
  'use strict';

  const startedAt = Date.now();
  const MAX_EVENTS = 100;
  const QUESTION_ORDER = ['oil', 'cookies', 'books', 'pear', 'table', 'water', 'sugar', 'salt'];
  const WORD_ICONS = { oil: '🛢️', cookies: '🍪', books: '📚', pear: '🍐', table: '🪑', water: '💧', sugar: '🍬', salt: '🧂' };
  let run = 1;
  let lastSignature = '';
  const state = {
    schemaVersion: '2.2',
    activityId: 'countable-uncountable-sort-8',
    startedAt,
    run,
    placements: {},
    items: {},
    history: [],
    tipsViewed: {},
    helpViews: 0,
    checks: 0,
    completed: false
  };

  const misconceptionFor = (word, chosen, expected) => {
    if (chosen === expected) return null;
    if (expected === 'uncountable') {
      if (['water', 'oil'].includes(word)) return 'counts-liquid-directly';
      if (['salt', 'sugar'].includes(word)) return 'counts-grains-or-portions-as-substance';
      return 'counts-substance-directly';
    }
    return 'treats-separate-object-as-mass';
  };

  const misconceptionExplanation = (word, code) => {
    const explanations = {
      oil: 'The learner may be treating "oil" as a countable object, or may be thinking of countable containers or units, such as a bottle or spoonful, instead of the substance itself.',
      water: 'The learner may be counting glasses or bottles of water rather than recognising that "water" names the substance. The container or unit is countable; the water is not.',
      salt: 'The learner may be counting grains, packets or pinches rather than recognising that "salt" names the substance. A stated unit is needed before it can be counted.',
      sugar: 'The learner may be counting cubes, spoonfuls or packets rather than recognising that "sugar" names the substance. The portion or container is countable, not the sugar itself.',
      books: 'The learner may be treating "books" like the uncountable category "literature", overlooking that individual books are separate objects that can be counted.',
      cookies: 'The learner may be confusing individual cookies with the substance "cookie dough". Whole cookies are separate items and can be counted.',
      pear: 'The learner may be treating the whole fruit like juice or pulp. An individual pear is a separate object that can be counted.',
      table: 'The learner may be overlooking that "table" refers to separate individual items that can be counted one by one.'
    };
    return code ? (explanations[word] || 'The learner may be applying the countable–uncountable distinction inconsistently and may benefit from naming exactly what is being counted.') : null;
  };

  const elapsed = () => Number(((Date.now() - startedAt) / 1000).toFixed(1));
  const push = evt => {
    state.history.push(Object.assign({ t: elapsed(), run }, evt));
    if (state.history.length > MAX_EVENTS) state.history.splice(0, state.history.length - MAX_EVENTS);
  };

  function itemRecord(word, expected) {
    if (!state.items[word]) state.items[word] = {
      itemId: 'word-' + word, word, expected, attempts: 0, revisions: 0,
      firstChoice: null, finalChoice: null, correct: null, misconceptionCode: null,
      firstPlacementSec: null, finalPlacementSec: null, modes: []
    };
    return state.items[word];
  }

  function recordPlacement(word, chosen, expected, mode) {
    const item = itemRecord(word, expected);
    const previous = item.finalChoice;
    if (previous === chosen) return;
    item.attempts += 1;
    if (previous !== null) item.revisions += 1;
    if (item.firstChoice === null) {
      item.firstChoice = chosen;
      item.firstPlacementSec = elapsed();
    }
    item.finalChoice = chosen;
    item.finalPlacementSec = elapsed();
    item.correct = chosen === expected;
    item.misconceptionCode = misconceptionFor(word, chosen, expected);
    if (!item.modes.includes(mode)) item.modes.push(mode);
    state.placements[word] = chosen;
    push({
      type: previous === null ? 'placement' : 'revision', q: word, itemId: item.itemId,
      value: chosen, expected, correct: item.correct, misconceptionCode: item.misconceptionCode,
      previousValue: previous, mode
    });
    render();
  }

  function recordTip(word) {
    state.tipsViewed[word] = (state.tipsViewed[word] || 0) + 1;
    push({ type: 'hint', q: word, itemId: 'word-' + word, hintLevel: 1 });
    render();
  }

  function recordHelp(opened) {
    if (opened) state.helpViews += 1;
    push({ type: opened ? 'help-opened' : 'help-closed' });
  }

  function recordCheck(results) {
    state.checks += 1;
    results.forEach(result => {
      const item = itemRecord(result.word, result.correct ? result.zone : result.correctZone);
      item.finalChoice = result.zone;
      item.correct = result.correct;
      item.misconceptionCode = misconceptionFor(result.word, result.zone, item.expected);
      push({
        type: 'answer', q: result.word, itemId: item.itemId, value: result.zone,
        expected: item.expected, correct: result.correct,
        misconceptionCode: item.misconceptionCode,
        misconception: misconceptionExplanation(result.word, item.misconceptionCode),
        attempt: state.checks
      });
    });
    state.completed = true;
    push({ type: 'completion', q: 'all-items', value: correctCount() + '/8', expected: '8/8', correct: correctCount() === 8 });
    save('activity-completed', true);
    render();
  }

  function recordReset() {
    const prior = snapshotSummary();
    run += 1;
    state.run = run;
    state.placements = {};
    state.items = {};
    state.tipsViewed = {};
    state.checks = 0;
    state.completed = false;
    push({ type: 'new-run', priorRunSummary: prior });
    save('new-run');
    render();
  }

  const itemList = () => Object.values(state.items);
  const correctCount = () => itemList().filter(i => i.correct === true).length;
  const attemptedCount = () => itemList().filter(i => i.finalChoice !== null).length;
  const revisionCount = () => itemList().reduce((n, i) => n + i.revisions, 0);
  const misconceptionCounts = () => itemList().reduce((out, i) => {
    if (i.misconceptionCode) out[i.misconceptionCode] = (out[i.misconceptionCode] || 0) + 1;
    return out;
  }, {});

  function snapshotSummary() {
    return {
      attempted: attemptedCount(), correct: correctCount(), total: 8,
      revisions: revisionCount(), checks: state.checks,
      hintsUsed: Object.values(state.tipsViewed).reduce((a, b) => a + b, 0),
      misconceptionCounts: misconceptionCounts(), elapsedSec: elapsed()
    };
  }

  function teacherFeedback(summary) {
    const misconceptions = Object.entries(summary.misconceptionCounts)
      .sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ': ' + v).join(', ') || 'none observed';
    const unresolved = itemList().filter(i => i.correct === false).map(i => i.word).join(', ') || 'none';
    return [
      'Diagnostic noun sort — ' + summary.correct + '/8 correct; ' + summary.attempted + '/8 attempted.',
      'Misconceptions: ' + misconceptions + '.',
      'Items needing follow-up: ' + unresolved + '.',
      'Process: ' + summary.revisions + ' revisions; ' + summary.hintsUsed + ' learning-tip views; ' + summary.elapsedSec + 's elapsed.',
      'Teaching prompt: ask the learner what is being counted—the substance itself, a separate object, or its container/unit.'
    ].join(' ');
  }

  function teachingMoves(records) {
    const codes = new Set(records.map(record => record.misconceptionCode).filter(Boolean));
    const moves = [];
    if (codes.has('counts-liquid-directly')) {
      moves.push('Ask: “Are you counting the liquid, or the bottle/glass that contains it?” Contrast <strong>oil</strong> with <strong>a bottle of oil</strong>.');
    }
    if (codes.has('counts-grains-or-portions-as-substance')) {
      moves.push('Ask the learner to add a measurable unit: <strong>a grain/pinch of salt</strong> or <strong>a spoonful/cube of sugar</strong>.');
    }
    if (codes.has('treats-separate-object-as-mass')) {
      moves.push('Use the “one, two, three” test with the object: <strong>one table, two tables</strong>. Contrast it with the mass category <strong>furniture</strong>.');
    }
    if (!moves.length && records.length === 8) {
      moves.push('Consolidate the rule by asking the learner to explain what makes an item countable and to give one container/unit example for an uncountable noun.');
    }
    return moves;
  }

  function orderedItems() {
    return QUESTION_ORDER.map(word => state.items[word]).filter(Boolean);
  }

  function questionRecords() {
    return orderedItems().map((item, index) => ({
      questionNumber: index + 1,
      itemId: item.itemId,
      question: item.word,
      studentAnswer: item.finalChoice,
      correctAnswer: item.expected,
      correct: item.correct === true,
      attempt: Math.max(1, state.checks || 1),
      marks: item.correct === true ? 1 : 0,
      maxMarks: 1,
      misconceptionCode: item.misconceptionCode,
      misconception: misconceptionExplanation(item.word, item.misconceptionCode),
      firstAnswer: item.firstChoice,
      revisions: item.revisions,
      firstPlacementSec: item.firstPlacementSec,
      finalPlacementSec: item.finalPlacementSec,
      modes: item.modes.slice()
    }));
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  }

  function buildRichFeedback(summary, records) {
    const accuracy = Math.round((summary.correct / 8) * 100);
    const incorrect = records.filter(record => !record.correct);
    const misconceptionSummary = incorrect.length
      ? incorrect.map(record => WORD_ICONS[record.question] + ' <strong>' + escapeHtml(record.question) + '</strong>: ' + escapeHtml(record.misconception)).join('<br>')
      : '✅ No misconception was observed in the checked responses.';
    const rows = records.map(record => {
      const revision = record.revisions > 0
        ? '<br><small>Changed from ' + escapeHtml(record.firstAnswer) + '</small>'
        : '';
      const insight = record.misconception
        ? '<span style="color:#9a3412"><strong>Possible misconception:</strong> ' + escapeHtml(record.misconception) + '</span>'
        : '<span style="color:#166534">Understood in this attempt</span>';
      return '<tr>' +
        '<td style="padding:8px;border-bottom:1px solid #dbe4ee;text-align:center"><strong>Q' + record.questionNumber + '</strong></td>' +
        '<td style="padding:8px;border-bottom:1px solid #dbe4ee"><span style="font-size:22px">' + WORD_ICONS[record.question] + '</span> <strong>' + escapeHtml(record.question) + '</strong></td>' +
        '<td style="padding:8px;border-bottom:1px solid #dbe4ee">' + escapeHtml(record.studentAnswer || 'Not answered') + revision + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #dbe4ee">' + escapeHtml(record.correctAnswer) + '</td>' +
        '<td style="padding:8px;border-bottom:1px solid #dbe4ee;text-align:center">' + (record.correct ? '✅' : '❌') + '<br><strong>' + record.marks + '/1</strong></td>' +
        '<td style="padding:8px;border-bottom:1px solid #dbe4ee">' + insight + '</td>' +
        '</tr>';
    }).join('');
    const moves = teachingMoves(records).map(move => '<li style="margin:5px 0">' + move + '</li>').join('');
    const journey = 'Placed <strong>' + summary.attempted + '/8</strong> · Revised <strong>' + summary.revisions + '</strong> · Viewed tips <strong>' + summary.hintsUsed + '</strong> · Checked <strong>' + summary.checks + '</strong> time' + (summary.checks === 1 ? '' : 's') + ' · Time <strong>' + summary.elapsedSec + 's</strong>';

    return '<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.4;max-width:980px">' +
      '<div style="background:#173a63;color:white;padding:14px 16px;border-radius:10px 10px 0 0"><strong style="font-size:18px">📊 Countable &amp; Uncountable Nouns — Learning Analytics</strong><br><span style="font-size:12px">Teacher diagnostic view</span></div>' +
      '<div style="border:1px solid #cad6e2;border-top:0;padding:14px;background:#f8fbff">' +
        '<table style="width:100%;border-collapse:separate;border-spacing:8px"><tr>' +
          '<td style="background:white;border:1px solid #dbe4ee;border-radius:8px;padding:10px;text-align:center"><strong style="font-size:24px;color:#173a63">' + summary.correct + '/8</strong><br><small>Score</small></td>' +
          '<td style="background:white;border:1px solid #dbe4ee;border-radius:8px;padding:10px;text-align:center"><strong style="font-size:24px;color:#173a63">' + accuracy + '%</strong><br><small>Accuracy</small></td>' +
          '<td style="background:white;border:1px solid #dbe4ee;border-radius:8px;padding:10px;text-align:center"><strong style="font-size:24px;color:#173a63">' + summary.attempted + '/8</strong><br><small>Completed</small></td>' +
          '<td style="background:white;border:1px solid #dbe4ee;border-radius:8px;padding:10px;text-align:center"><strong style="font-size:24px;color:#173a63">' + incorrect.length + '</strong><br><small>Needs review</small></td>' +
        '</tr></table>' +
        '<div style="background:#dbeafe;border-radius:999px;height:12px;overflow:hidden;margin:4px 8px 10px"><div style="background:' + (accuracy >= 75 ? '#16a34a' : accuracy >= 50 ? '#f59e0b' : '#dc2626') + ';height:12px;width:' + accuracy + '%"></div></div>' +
        '<div style="font-size:13px;text-align:center;color:#42566c">' + journey + '</div>' +
      '</div>' +
      '<div style="border:1px solid #cad6e2;border-top:0;padding:14px"><strong>🧠 Misconception picture</strong><div style="background:#fff7ed;border-left:4px solid #f97316;padding:10px;margin-top:8px">' + misconceptionSummary + '</div></div>' +
      '<div style="border:1px solid #cad6e2;border-top:0;padding:14px"><strong>🔎 Question-by-question evidence</strong>' +
        '<table style="width:100%;border-collapse:collapse;margin-top:8px;font-size:13px"><thead><tr style="background:#eef4fa"><th style="padding:8px">#</th><th style="padding:8px;text-align:left">Picture &amp; word</th><th style="padding:8px;text-align:left">Student</th><th style="padding:8px;text-align:left">Correct</th><th style="padding:8px">Mark</th><th style="padding:8px;text-align:left">Insight</th></tr></thead><tbody>' + rows + '</tbody></table>' +
      '</div>' +
      '<div style="border:1px solid #cad6e2;border-top:0;padding:14px;background:#f0fdf4"><strong>🎯 Suggested teaching move</strong><ul style="margin:6px 0 0 20px;padding:0">' + moves + '</ul></div>' +
      '<div style="border:1px solid #cad6e2;border-top:0;border-radius:0 0 10px 10px;padding:9px 14px;font-size:11px;color:#526579">These signals describe behaviour in this interactive. Use them to guide a conversation, not as a definitive judgment of ability or intent.</div>' +
      '</div>';
  }

  function transportSafeHistory() {
    return state.history.slice(-MAX_EVENTS).map(event => ({
      t: event.t,
      run: event.run,
      event: event.type,
      itemId: event.itemId || null,
      word: event.q || null,
      choice: event.value || null,
      answerKey: event.expected || null,
      isCorrect: event.correct,
      misconceptionCode: event.misconceptionCode || null,
      attempt: event.attempt || null,
      previousChoice: event.previousValue || null,
      mode: event.mode || null,
      hintLevel: event.hintLevel || null
    }));
  }

  function buildPayload(reason) {
    const summary = snapshotSummary();
    const items = questionRecords();
    const richFeedback = buildRichFeedback(summary, items);
    const safeHistory = transportSafeHistory();
    return {
      schemaVersion: state.schemaVersion,
      reason,
      score: summary.correct,
      max: 8,
      success: state.completed && summary.correct === 8,
      progress: summary.attempted / 8,
      feedback: richFeedback,
      summary,
      quiz: { attempted: summary.attempted, correct: summary.correct, total: 8, items },
      hiddenMarks: {
        totalMarks: summary.correct,
        maxMarks: 8,
        items: items.map(item => ({
          id: item.itemId,
          question: item.question,
          correctOption: item.correctAnswer,
          userSelection: item.studentAnswer,
          marks: item.marks,
          maxMarks: item.maxMarks,
          attempt: item.attempt,
          misconceptionCode: item.misconceptionCode,
          misconception: item.misconception
        }))
      },
      details: {
        analyticsPurpose: 'diagnostic-teaching', run,
        teacherSummary: teacherFeedback(summary),
        questionByQuestionFeedback: items,
        misconceptionCounts: summary.misconceptionCounts,
        itemAnalytics: items,
        timeline: safeHistory,
        privacy: 'No raw keystrokes or learner identity stored.'
      },
      // Keep the vendor-compatible history semantically rich but avoid its generic
      // attempt formatter replacing the purpose-built feedback above. The vendor
      // formatter only treats q/value/expected answer records as quiz attempts.
      history: safeHistory
    };
  }

  function save(reason, force) {
    // Do not publish an empty start/pause state as if it were a scored result.
    if (attemptedCount() === 0 && reason !== 'new-run') return;
    const payload = buildPayload(reason);
    const signature = JSON.stringify([reason, payload.score, payload.progress, payload.history.length, payload.summary.revisions, payload.summary.hintsUsed]);
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    window.__xapiLastState = payload;
    try {
      if (typeof window.storeState === 'function') window.storeState(payload);
    } catch (error) {
      console.warn('Learning analytics could not be saved; activity remains available.', error);
    }
  }

  function label(code) {
    return ({
      'counts-liquid-directly': 'Counts a liquid as separate objects',
      'counts-grains-or-portions-as-substance': 'Counts grains/portions instead of naming a unit',
      'counts-substance-directly': 'Counts a substance directly',
      'treats-separate-object-as-mass': 'Treats a separate object as a mass noun'
    })[code] || code;
  }

  function render() {
    const host = document.getElementById('analyticsPanel');
    if (!host) return;
    const s = snapshotSummary();
    const misconceptions = Object.entries(s.misconceptionCounts);
    const timeline = state.history.slice(-30).map(e =>
      '<div class="log-entry ' + (e.correct === false ? 'incorrect' : e.correct === true ? 'correct' : '') + '">' +
      '<span class="timestamp">t=' + e.t + 's</span><span class="action-desc"><strong>' + e.type.replaceAll('-', ' ') + '</strong>' +
      (e.q ? ' — ' + e.q : '') + (e.value ? ': ' + e.value : '') + (e.previousValue ? ' (from ' + e.previousValue + ')' : '') + '</span></div>'
    ).join('') || '<p>No learning actions yet.</p>';
    const questions = QUESTION_ORDER.map(word => {
      const i = state.items[word];
      if (!i) return '<tr><td>' + word + '</td><td>Not placed</td><td>—</td><td>—</td><td>—</td></tr>';
      const explanation = misconceptionExplanation(word, i.misconceptionCode);
      return '<tr><td>' + word + '</td><td>' + (i.finalChoice || '—') + '</td><td>' + (i.correct ? '✓ Correct' : '✗ Review') + '</td><td>' + i.revisions + '</td><td>' + (explanation || '—') + '</td></tr>';
    }).join('');
    host.innerHTML = '<div class="analytics-header"><h3>📊 Learning Analytics</h3><button id="closeAnalyticsBtn" class="close-btn" aria-label="Close analytics">✕</button></div>' +
      '<div class="analytics-tabs"><button class="tab-btn active" data-panel="overview">Overview</button><button class="tab-btn" data-panel="misconceptions">Misconceptions</button><button class="tab-btn" data-panel="timeline">Timeline</button><button class="tab-btn" data-panel="questions">Questions</button></div>' +
      '<div class="analytics-content">' +
      '<section class="analytics-view active" data-view="overview"><div class="metric-grid"><div><strong>' + s.correct + '/8</strong><span>Correct</span></div><div><strong>' + s.attempted + '/8</strong><span>Placed</span></div><div><strong>' + s.revisions + '</strong><span>Revisions</span></div><div><strong>' + s.hintsUsed + '</strong><span>Tips viewed</span></div></div><p class="teacher-note">' + teacherFeedback(s) + '</p></section>' +
      '<section class="analytics-view" data-view="misconceptions">' + (misconceptions.length ? misconceptions.map(([k,v]) => '<div class="miscon-row"><strong>' + v + '</strong><span>' + label(k) + '</span></div>').join('') : '<p>No misconception has been observed yet. This does not mean mastery until all eight items are checked.</p>') + '</section>' +
      '<section class="analytics-view" data-view="timeline"><p class="privacy-note">Timeline records semantic learning actions and relative time. Literal keystrokes are not recorded.</p><div class="log-container">' + timeline + '</div></section>' +
      '<section class="analytics-view" data-view="questions"><div class="question-table-wrap"><table class="question-table"><thead><tr><th>Word</th><th>Final choice</th><th>Outcome</th><th>Revisions</th><th>Diagnostic signal</th></tr></thead><tbody>' + questions + '</tbody></table></div></section></div>';
    host.querySelector('#closeAnalyticsBtn').addEventListener('click', () => document.getElementById('toggleAnalyticsBtn').click());
    host.querySelectorAll('[data-panel]').forEach(btn => btn.addEventListener('click', () => {
      host.querySelectorAll('[data-panel]').forEach(b => b.classList.toggle('active', b === btn));
      host.querySelectorAll('[data-view]').forEach(v => v.classList.toggle('active', v.dataset.view === btn.dataset.panel));
    }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
      render();
      const checkButton = document.getElementById('checkBtn');
      if (checkButton) {
        checkButton.addEventListener('click', () => setTimeout(() => {
          if (state.completed) return;
          const results = [];
          document.querySelectorAll('#countableDropArea .word-card, #uncountableDropArea .word-card').forEach(card => {
            const zone = card.closest('#countableDropArea') ? 'countable' : 'uncountable';
            const correctZone = card.dataset.type;
            results.push({
              word: card.dataset.word,
              icon: card.dataset.icon,
              feedback: card.dataset.feedback,
              zone,
              correctZone,
              correct: zone === correctZone
            });
          });
          if (results.length === 8) recordCheck(results);
        }, 0));
      }
    }, 0);
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save('pause', true); });
  window.addEventListener('beforeunload', () => save('exit', true));

  window.learningAnalytics = { recordPlacement, recordTip, recordHelp, recordCheck, recordReset, save, render, buildPayload };
})();
