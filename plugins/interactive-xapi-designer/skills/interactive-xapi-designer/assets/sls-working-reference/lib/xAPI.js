(function () {
  'use strict';

  // --- Stable Scope Identification ---
  // ALWAYS use the folder path as the unique ID for the activity scope.
  // This ensures that ALL tabs (SLS frame, tool's new tab, SLS native button)
  // use the exact same localStorage keys for config and sync data.
  var getStablePath = function () {
    try {
      var p = window.location.pathname;
      var folder = p.substring(0, p.lastIndexOf('/')) || p;
      return folder;
    } catch (e) {
      return 'default_scope';
    }
  };

  var APP_SCOPE = getStablePath();
  var CONFIG_KEY = 'xapi_config::' + APP_SCOPE;
  var STATE_KEY = 'xapi_last_state::' + APP_SCOPE;
  var DEBUG_PANEL_ENABLED = false;
  try {
    DEBUG_PANEL_ENABLED = new URLSearchParams(window.location.search).get('xapiDebug') === '1';
  } catch (e) {}

  var XAPIUtils = {
    parameters: null,

    getParameters: function () {
      if (this.parameters) return this.parameters;

      try {
        var urlParams = new URLSearchParams(window.location.search);
        var endpoint = urlParams.get('endpoint');
        var auth = urlParams.get('auth');
        var agentRaw = urlParams.get('agent');
        var stateId = urlParams.get('stateId');
        var activityId = urlParams.get('activityId');

        // Check if we have core parameters in URL
        if (endpoint && auth && endpoint !== 'null' && auth !== 'null') {
          var config = {
            endpoint: endpoint,
            auth: auth,
            agentRaw: agentRaw,
            stateId: stateId,
            activityId: activityId,
            t: Date.now()
          };
          // Persist to localStorage for SLS native "New Tab" support
          try {
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            console.log('[xAPI] Configuration persisted for scope:', APP_SCOPE);
          } catch (e) { }
        } else {
          // Fallback to localStorage if URL params are missing
          try {
            var cached = localStorage.getItem(CONFIG_KEY);
            if (cached) {
              var config = JSON.parse(cached);
              endpoint = endpoint || config.endpoint;
              auth = auth || config.auth;
              agentRaw = agentRaw || config.agentRaw;
              stateId = stateId || config.stateId;
              activityId = activityId || config.activityId;
              console.log('[xAPI] Configuration recovered for scope:', APP_SCOPE);
            }
          } catch (e) { }
        }

        // --- Resilience: Synthesize missing activityId or agent if absolutely necessary ---
        // If we still lack activityId but have endpoint, use the folder path as a fallback IRI
        if (!activityId && endpoint) {
          activityId = 'http://sls.native.fallback/' + APP_SCOPE.replace(/^\//, '');
          console.warn('[xAPI] Missing activityId. Using fallback:', activityId);
        }

        // Configure ADL.XAPIWrapper if we have valid endpoint and auth
        if (endpoint && auth && endpoint !== 'null' && auth !== 'null' && typeof window.ADL !== 'undefined' && window.ADL.XAPIWrapper) {
          var ep = endpoint;
          if (ep.charAt(ep.length - 1) !== '/') {
            ep += '/';
          }
          window.ADL.XAPIWrapper.changeConfig({
            endpoint: ep,
            auth: 'Basic ' + auth
          });
        }

        // Parse agent
        var agent = null;
        if (agentRaw && agentRaw !== 'null') {
          try {
            agent = JSON.parse(agentRaw);
          } catch (e) {
            console.warn('[xAPI] Invalid agent JSON:', e);
          }
        } else if (endpoint) {
          // Mock agent if missing but endpoint present (last resort for native new tab)
          agent = { "mbox": "mailto:student@sls.native.fallback", "name": "SLS Student (New Tab)" };
          console.warn('[xAPI] Missing agent. Using anonymous fallback.');
        }

        var params = { agent: agent, stateId: stateId || 'default_state', activityId: activityId, endpoint: endpoint, auth: auth };

        // Only cache if we actually found something useful
        if (endpoint && auth) {
          this.parameters = params;
        }
        return params;
      } catch (e) {
        console.warn('[xAPI] getParameters failed:', e);
        return null;
      }
    }
  };

  window.XAPIUtils = XAPIUtils;

  function cacheState(stateValue) {
    try {
      localStorage.setItem(STATE_KEY, JSON.stringify({ t: Date.now(), state: stateValue }));
    } catch (e) {}
  }

  function readCachedState() {
    try {
      var raw = localStorage.getItem(STATE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && parsed.state ? parsed : null;
    } catch (e) {
      return null;
    }
  }

  function preferCachedState(stateValue) {
    try {
      var cached = readCachedState();
      if (!cached || !cached.state) return stateValue;
      var cachedState = cached.state;
      if (!stateValue) return cachedState;
      if (stateValue && stateValue.reason && /pause|hidden/i.test(stateValue.reason)) return cachedState;
      if (stateValue && stateValue.feedback && /quiz pause/i.test(String(stateValue.feedback))) return cachedState;
      var cachedHistoryLen = Array.isArray(cachedState.history) ? cachedState.history.length : 0;
      var localHistoryLen = Array.isArray(stateValue && stateValue.history) ? stateValue.history.length : 0;
      if (cachedHistoryLen > localHistoryLen) return cachedState;
    } catch (e) {}
    return stateValue;
  }

  function ensureSendStateHook() {
    try {
      if (!window.ADL || !window.ADL.XAPIWrapper || !window.ADL.XAPIWrapper.sendState) return;
      if (window.__xapiSendStateHooked) return;
      var original = window.ADL.XAPIWrapper.sendState;
      window.ADL.XAPIWrapper.sendState = function (activityId, agent, stateId, registration, stateValue) {
        var preferred = preferCachedState(stateValue);
        return original.call(this, activityId, agent, stateId, registration, preferred);
      };
      window.__xapiSendStateHooked = true;
    } catch (e) {}
  }

  function shouldSendStatements(params) {
    try {
      if (!params || !params.endpoint) return false;
      if (window.__xapiForceStatements === true) return true;

      var endpointUrl = new URL(params.endpoint, window.location.href);
      var currentUrl = new URL(window.location.href);
      var isSameOrigin = endpointUrl.origin === currentUrl.origin;
      return isSameOrigin;
    } catch (e) {
      return false;
    }
  }

  function safeText(v) {
    try {
      if (v == null) return '';
      return String(v);
    } catch (e) {
      return '';
    }
  }

  function isLikelyAttemptLogHtml(s) {
    try {
      var t = safeText(s);
      if (!t) return false;
      // Our quiz attempt log HTML uses <strong>Qn:</strong> and lines like "Student answer:".
      // Use a heuristic so we don't accidentally treat genuine timeline feedback as attempt log.
      return /<strong>\s*Q\d+\s*:/i.test(t) && /Student\s*answer\s*:/i.test(t);
    } catch (e) {
      return false;
    }
  }

  function isLikelyTimelineFeedback(s) {
    try {
      var t = safeText(s);
      if (!t) return false;
      // Timeline tracker feedback includes these headers.
      return /(Interactive Response Assistant|Action Log\s*:|\bAction\s+Log\b)/i.test(t);
    } catch (e) {
      return false;
    }
  }

  function buildActivityLogFromState(stateValue) {
    try {
      if (!stateValue) return '';
      if (!Array.isArray(stateValue.actionLog) || stateValue.actionLog.length === 0) return '';

      var summary = stateValue.summary || {};
      var score = stateValue.score != null ? Number(stateValue.score) : null;
      var max = stateValue.max != null ? Number(stateValue.max) : null;

      var lines = [];
      lines.push('Feedback');
      lines.push('Interactive Response Assistant');
      lines.push(new Date().toLocaleString());
      if (summary && summary.interactions != null) lines.push('Interactions: ' + summary.interactions);
      if (summary && summary.elapsedSec != null) lines.push('Elapsed Time: ' + summary.elapsedSec + 's');
      if (score != null && !Number.isNaN(score)) {
        lines.push('Score: ' + score + (max != null && !Number.isNaN(max) ? (' / ' + max) : ''));
      }
      if (summary && summary.uniqueTargets != null) lines.push('Unique Explorations: ' + summary.uniqueTargets);
      lines.push('');
      lines.push('Action Log:');
      stateValue.actionLog.forEach(function (a) {
        try {
          var label = a && a.label ? a.label : (a && a.type ? a.type : 'event');
          var time = (a && a.t != null) ? a.t : 0;
          lines.push('t=' + time + 's ' + label);
        } catch (e) {}
      });
      return lines.join('<br>');
    } catch (e) {
      return '';
    }
  }

  function sanitizeFeedbackHtml(html) {
    try {
      var s = safeText(html);
      if (!s) return '';

      // Remove scripts and a few high-risk tags. Keep <br>/<strong> etc.
      s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
      s = s.replace(/<\s*\/?\s*(iframe|object|embed|style|link|meta)[^>]*>/gi, '');

      // If the feedback is plain-text (no <br>), convert newlines so it displays nicely in SLS.
      if (!/<br\s*\/?\s*>/i.test(s) && /\n/.test(s)) {
        s = s.replace(/\r/g, '').replace(/\n/g, '<br>');
      }
      return s;
    } catch (e) {
      return '';
    }
  }

  // Some interactives don't populate stateValue.history (our quiz tracker may not hook),
  // but *do* write rich quiz information into timeline-style logs (actionLog/actions/feedback).
  // This function tries to derive a history-like array from those logs so we can still build:
  // - result.response (plain attempt log)
  // - result.extensions.quizAttemptLog
  function deriveQuizHistoryFromTimeline(stateValue) {
    try {
      if (!stateValue) return null;

      var entries = [];
      var seen = {};

      function addLine(s) {
        var t = safeText(s).replace(/\s+/g, ' ').trim();
        if (!t) return;
        if (seen[t]) return;
        seen[t] = true;
        entries.push(t);
      }

      // 1) Prefer structured actionLog if present
      if (Array.isArray(stateValue.actionLog)) {
        stateValue.actionLog.forEach(function (a) {
          if (a && a.label) addLine(a.label);
        });
      }

      // 2) Include learning-analytics style actions (captured from DOM log entries)
      if (Array.isArray(stateValue.actions)) {
        stateValue.actions.forEach(function (a) {
          if (!a) return;
          if (String(a.type || '') === 'learning-analytics') {
            if (a.data && a.data.text) addLine(a.data.text);
            else if (a.data && a.data.action && a.data.details) addLine(String(a.data.action) + ': ' + String(a.data.details));
            else if (a.data && a.data.action) addLine(a.data.action);
          }
        });
      }

      // 3) As a last resort, parse the feedback HTML/text
      if (stateValue.feedback) {
        var fb = safeText(stateValue.feedback)
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<[^>]+>/g, ' ')
          .replace(/\r/g, '');

        fb.split(/\n/).forEach(addLine);
      }

      if (!entries.length) return null;

      var history = [];
      var currentQuestion = null;

      function normalizeQuestionText(s) {
        var t = safeText(s).trim();
        if (!t) return null;

        // Strip leading 'Quiz Problem X/Y:' if present
        var m1 = /^Quiz\s+Problem\s*\d+\s*\/\s*\d+\s*:\s*(.*)$/i.exec(t);
        if (m1 && m1[1]) return m1[1].trim();
        return t;
      }

      entries.forEach(function (line) {
        var t = safeText(line).trim();
        if (!t) return;

        // New question/problem announcements
        var qAnn = /(new\s+quiz\s+problem\s+generated|new\s+problem\s+generated|new\s+question\s+generated)\s*:\s*(.*)$/i.exec(t);
        if (qAnn && qAnn[2]) {
          currentQuestion = normalizeQuestionText(qAnn[2]);
          return;
        }

        var qAnn2 = /^(q\d+|qexploration)\s*:\s*(.*)$/i.exec(t);
        if (qAnn2 && qAnn2[2]) {
          currentQuestion = safeText(qAnn2[2]).trim();
          return;
        }

        // Answer submitted line pattern (common in our prompt-library generated interactives)
        // Example: "📤 Answer submitted: User answer: 61, Correct: 60, Result: Incorrect, Mode: quiz"
        if (/answer\s+submitted/i.test(t)) {
          var m = /User\s*answer\s*:\s*([^,]+),\s*Correct\s*:\s*([^,]+),\s*Result\s*:\s*([^,]+)(?:,|$)/i.exec(t);
          if (m) {
            var ua = safeText(m[1]).trim();
            var ca = safeText(m[2]).trim();
            var r = safeText(m[3]).trim();
            var isCorrect = /correct|right/i.test(r) && !/incorrect|wrong/i.test(r);
            history.push({
              t: Date.now(),
              type: 'answer_submitted',
              q: currentQuestion || null,
              value: ua,
              expected: ca,
              correct: isCorrect,
              result: isCorrect ? 'correct' : 'incorrect'
            });
            return;
          }
        }

        // Quiz log entry pattern (multi-line text flattened)
        // Example: "Q2: Find area... Student answer: 61 Correct answer: 60 ❌ Wrong (Attempt 1)"
        if (/student\s*answer\s*:/i.test(t) && /correct\s*answer\s*:/i.test(t)) {
          var qHead = /^(q\s*\d+|qexploration)\s*:\s*([^\n]+)$/i.exec(t);
          if (qHead && qHead[2]) currentQuestion = safeText(qHead[2]).trim();

          var ua2 = /student\s*answer\s*:\s*([^\n]+?)(?:correct\s*answer\s*:|$)/i.exec(t);
          var ca2 = /correct\s*answer\s*:\s*([^\n]+?)(?:✅|❌|\(|$)/i.exec(t);
          var attemptM = /attempt\s*(\d+)/i.exec(t);
          var isCorrect2 = /✅|\bcorrect\b/i.test(t) && !/❌|\bwrong\b/i.test(t);

          history.push({
            t: Date.now(),
            type: 'quiz_log',
            q: currentQuestion || null,
            value: ua2 && ua2[1] ? safeText(ua2[1]).trim() : null,
            expected: ca2 && ca2[1] ? safeText(ca2[1]).trim() : null,
            correct: isCorrect2,
            result: isCorrect2 ? 'correct' : 'incorrect',
            attempt: attemptM ? Number(attemptM[1]) : null
          });
          return;
        }
      });

      // If we derived nothing, return null.
      if (!history.length) return null;
      return history.slice(-80);
    } catch (e) {
      return null;
    }
  }

  window.storeState = function (stateValue) {
    try {
      if (!window.ADL || !window.ADL.XAPIWrapper) {
        console.warn('[xAPI] ADL.XAPIWrapper not available');
        return;
      }
      stateValue = preferCachedState(stateValue);

      // If quiz attempts exist (either from the quiz tracker OR derived from timeline logs),
      // make `feedback` an attempt-by-attempt log.
      // Reason: Some SLS views only surface the state "feedback" and not our custom statements.
      try {
        var __historyForFeedback = null;
        if (stateValue && Array.isArray(stateValue.history) && stateValue.history.length) {
          __historyForFeedback = stateValue.history;
        } else if (stateValue) {
          __historyForFeedback = deriveQuizHistoryFromTimeline(stateValue);
        }

        if (Array.isArray(__historyForFeedback) && __historyForFeedback.length) {
          // HTML is used for state feedback because many LRS/UIs collapse raw newlines.
          var __attemptHtml = formatQuizAttemptLogHtml(__historyForFeedback);
          if (__attemptHtml) {
            // Preserve and re-append the original Timeline feedback/activity log.
            // Previously we overwrote feedback entirely so the quiz attempt log appears in SLS,
            // but that hid the Timeline "Action Log" that was useful for review.
            var __oldFeedback = stateValue && stateValue.feedback != null ? String(stateValue.feedback) : '';
            try { stateValue.details = stateValue.details || {}; } catch (e) {}

            var __storedOriginal = '';
            try {
              if (stateValue && stateValue.details && stateValue.details.originalFeedback != null) {
                __storedOriginal = String(stateValue.details.originalFeedback);
              }
            } catch (e) {}

            // If the stored original is actually our attempt log (older buggy state), ignore it.
            if (__storedOriginal && isLikelyAttemptLogHtml(__storedOriginal)) {
              __storedOriginal = '';
            }

            // If the stored original exists but doesn't look like the timeline/activity log,
            // allow replacement with a better candidate.
            if (__storedOriginal && !isLikelyTimelineFeedback(__storedOriginal)) {
              __storedOriginal = '';
            }

            // Capture original feedback once (only if it looks like the timeline/activity log)
            // and only if we don't already have a preserved copy.
            if (!__storedOriginal && __oldFeedback && !isLikelyAttemptLogHtml(__oldFeedback) && isLikelyTimelineFeedback(__oldFeedback)) {
              try {
                stateValue.details.originalFeedback = __oldFeedback;
                __storedOriginal = __oldFeedback;
              } catch (e) {}
            }

            // Fallback: build an activity log from actionLog if we didn't get a timeline feedback string.
            if (!__storedOriginal) {
              __storedOriginal = buildActivityLogFromState(stateValue);
            }

            var __combinedFeedback = String(__attemptHtml);
            if (__storedOriginal) {
              __combinedFeedback +=
                '<br><br>' +
                '<hr style="border:0;border-top:1px solid #cbd5e1;">' +
                '<br><strong>Activity Log</strong><br>' +
                sanitizeFeedbackHtml(__storedOriginal);
            }

            stateValue.feedback = String(__combinedFeedback).substring(0, 15000);

            // Improve score if the interactive doesn't report quiz scoring.
            // Only override when score is missing/0 but we can compute a better value.
            try {
              var s0 = stateValue && stateValue.score != null ? Number(stateValue.score) : null;
              var derived = deriveQuizScoreFromHistory(__historyForFeedback, stateValue);
              if (derived && (s0 == null || Number.isNaN(s0) || s0 <= 0) && derived.raw >= 0) {
                stateValue.score = derived.raw;
                if (stateValue.max == null || Number.isNaN(Number(stateValue.max)) || Number(stateValue.max) <= 0) {
                  stateValue.max = derived.max;
                }
              }
            } catch (e) {}
          }
        }
      } catch (e) {}
      try { window.__xapiLastState = stateValue; } catch (e) { }
      var params = XAPIUtils.getParameters();

      // Detailed Guard Notification
      if (!params) {
        console.warn('[xAPI] storeState: No parameters available. Tracking locally only.');
        return;
      }

      var missing = [];
      if (!params.endpoint) missing.push('endpoint');
      if (!params.auth) missing.push('auth');
      if (!params.activityId) missing.push('activityId');
      if (!params.agent) missing.push('agent');

      if (missing.length > 0) {
        console.warn('[xAPI] storeState: Cannot send to SLS server. Missing: ' + missing.join(', '));
        return;
      }

      // sendState must be resilient: in some embedded contexts, ADL wrapper can throw
      // DOMException (e.g., storage/security policy). We still want to build statement payload.
      try {
        ensureSendStateHook();
        window.ADL.XAPIWrapper.sendState(params.activityId, params.agent, params.stateId, null, stateValue);
        console.log('[xAPI] Submitted to SLS:', stateValue);
      } catch (e) {
        console.warn('[xAPI] sendState failed (non-fatal):', e);
      }
      try { cacheState(stateValue); } catch (e) {}

      // Also send an xAPI statement that includes score in result.score so it
      // appears in LRS statement queries (some SLS views rely on statements).
      // This is best-effort and will not throw. We skip cross-origin endpoints
      // by default to avoid CORS preflight failures breaking new-tab launches.
      try {
        if (!shouldSendStatements(params)) {
          return;
        }
        var scoreRaw = (stateValue && stateValue.score != null) ? Number(stateValue.score) : null;
        if (scoreRaw != null && !Number.isNaN(scoreRaw)) {
          var history = stateValue && stateValue.history ? stateValue.history : null;
          // Fallback: derive quiz attempt history from timeline logs if the quiz tracker
          // didn't populate stateValue.history.
          if ((!Array.isArray(history) || !history.length) && stateValue) {
            history = deriveQuizHistoryFromTimeline(stateValue);
          }
          var lastEvt = Array.isArray(history) && history.length ? history[history.length - 1] : null;

          var max = null;
          if (stateValue && stateValue.max != null && !Number.isNaN(Number(stateValue.max))) max = Number(stateValue.max);
          if (max == null && stateValue && stateValue.total != null && !Number.isNaN(Number(stateValue.total))) max = Number(stateValue.total);

          var scoreObj = { raw: scoreRaw, min: 0 };
          if (max != null) {
            scoreObj.max = max;
            scoreObj.scaled = max > 0 ? Math.max(0, Math.min(1, scoreRaw / max)) : 0;
          }

          var result = { score: scoreObj };
          if (Array.isArray(history) && history.length) {
            // IMPORTANT: xAPI result.response should be plain text (LRS-friendly),
            // not HTML. We generate a concise attempt-by-attempt log.
            var attemptText = formatQuizAttemptLogPlain(history);
            if (attemptText) {
              result.response = String(attemptText).substring(0, 1000);
            } else {
              // Fallback to existing feedback if any
              result.response = String(stateValue.feedback || '').substring(0, 255);
            }
          } else if (stateValue && stateValue.feedback) {
            result.response = String(stateValue.feedback).substring(0, 255);
          }
          // Preserve additional payload for analytics/debugging
          if (stateValue && (stateValue.hiddenMarks || stateValue.details || stateValue.history || stateValue.actionLog || stateValue.summary || stateValue.quiz)) {
            result.extensions = result.extensions || {};
            if (stateValue.hiddenMarks) result.extensions['https://iwant2study.org/xapi/extensions/hiddenMarks'] = stateValue.hiddenMarks;
            if (stateValue.details) result.extensions['https://iwant2study.org/xapi/extensions/details'] = stateValue.details;
            if (stateValue.history) result.extensions['https://iwant2study.org/xapi/extensions/quizHistory'] = stateValue.history;
            if (Array.isArray(history) && history.length) {
              result.extensions['https://iwant2study.org/xapi/extensions/quizAttemptLog'] = buildQuizAttemptLogExtension(history);
              result.extensions['https://iwant2study.org/xapi/extensions/quizAttemptLogSource'] = stateValue.history ? 'history' : 'timeline';
            }
            if (stateValue.actionLog) result.extensions['https://iwant2study.org/xapi/extensions/actionLog'] = stateValue.actionLog;
            if (stateValue.summary) result.extensions['https://iwant2study.org/xapi/extensions/summary'] = stateValue.summary;
            if (stateValue.quiz) result.extensions['https://iwant2study.org/xapi/extensions/quizSummary'] = stateValue.quiz;
          }

          var statement = {
            actor: params.agent,
            verb: { id: 'http://adlnet.gov/expapi/verbs/scored', display: { 'en-US': 'scored' } },
            object: { id: params.activityId },
            result: result,
            timestamp: new Date().toISOString()
          };

          var scoreSig = [scoreRaw, max, history ? history.length : 0, lastEvt ? lastEvt.t : 0].join('|');
          var scoreSigKey = 'xapi_last_score_sig::' + APP_SCOPE;
          var lastScoreSig = null;
          try { lastScoreSig = localStorage.getItem(scoreSigKey); } catch (e) {}

          if (String(scoreSig) !== String(lastScoreSig)) {
            try { localStorage.setItem(scoreSigKey, String(scoreSig)); } catch (e) {}
            window.ADL.XAPIWrapper.sendStatement(statement);
            console.log('[xAPI] Score statement sent:', scoreObj);
          }

          try {
            var analyticsSig = [stateValue && stateValue.reason ? stateValue.reason : '', scoreRaw, max, history ? history.length : 0, lastEvt ? lastEvt.t : 0].join('|');
            var analyticsKey = 'xapi_last_analytics::' + APP_SCOPE;
            var lastAnalytics = null;
            try { lastAnalytics = localStorage.getItem(analyticsKey); } catch (e) {}

            if (analyticsSig && String(analyticsSig) !== String(lastAnalytics)) {
              try { localStorage.setItem(analyticsKey, String(analyticsSig)); } catch (e) {}

              var reason = stateValue && stateValue.reason ? String(stateValue.reason) : '';
              var verb = /answer/i.test(reason)
                ? { id: 'http://adlnet.gov/expapi/verbs/answered', display: { 'en-US': 'answered' } }
                : { id: 'http://adlnet.gov/expapi/verbs/experienced', display: { 'en-US': 'experienced' } };

              var analyticsStatement = {
                actor: params.agent,
                verb: verb,
                object: { id: params.activityId },
                result: result,
                timestamp: new Date().toISOString()
              };

              window.ADL.XAPIWrapper.sendStatement(analyticsStatement);
              console.log('[xAPI] Analytics statement sent:', analyticsSig);
            }
          } catch (e) {
            console.warn('[xAPI] Unable to send analytics statement (non-fatal):', e);
          }
        }
      } catch (e) {
        console.warn('[xAPI] Unable to send score statement (non-fatal):', e);
      }
    } catch (err) {
      console.error('[xAPI] storeState error (handled):', err);
    }
  };

  window.getState = function () {
    try {
      if (!window.ADL || !window.ADL.XAPIWrapper) return null;
      var params = XAPIUtils.getParameters();
      if (!params || !params.activityId || !params.agent || !params.endpoint) return null;

      var result = window.ADL.XAPIWrapper.getState(params.activityId, params.agent, params.stateId);
      console.log('[xAPI] Retrieved state:', result);
      return result;
    } catch (err) {
      console.error('[xAPI] getState error (handled):', err);
      return null;
    }
  };

  window.updateStore = function () {
    try {
      var sInput = document.getElementById("score-input");
      var fInput = document.getElementById("feedback-input");
      if (sInput || fInput) {
        window.storeState({
          score: sInput ? sInput.value : 0,
          feedback: fInput ? fInput.value : ""
        });
      }
    } catch (e) { }
  };

  function ensureDebugPanel() {
    if (!DEBUG_PANEL_ENABLED) return;
    if (document.getElementById('xapi-debug-panel')) return;
    if (!document.body) return;
    var panel = document.createElement('div');
    panel.id = 'xapi-debug-panel';
    panel.style.cssText = 'position:fixed;right:20px;bottom:80px;z-index:99999;width:320px;background:rgba(15,23,42,0.95);color:#e2e8f0;border-radius:10px;box-shadow:0 10px 25px rgba(0,0,0,0.25);font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:12px;';

    var header = document.createElement('div');
    header.style.cssText = 'padding:8px 10px;cursor:move;background:rgba(30,41,59,0.9);border-top-left-radius:10px;border-top-right-radius:10px;font-weight:600;display:flex;align-items:center;justify-content:space-between;';
    header.textContent = 'xAPI Live Feedback';

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.cssText = 'background:transparent;border:none;color:#e2e8f0;font-size:16px;cursor:pointer;margin-left:8px;';
    closeBtn.onclick = function () { panel.style.display = 'none'; };
    header.appendChild(closeBtn);

    var body = document.createElement('div');
    body.id = 'xapi-debug-body';
    body.style.cssText = 'padding:10px;max-height:280px;overflow:auto;white-space:pre-wrap;line-height:1.4;';
    body.textContent = 'Waiting for xAPI events...';

    panel.appendChild(header);
    panel.appendChild(body);
    document.body.appendChild(panel);

    var pos = { x: 0, y: 0, left: 0, top: 0, dragging: false };
    header.addEventListener('mousedown', function (e) {
      pos.dragging = true;
      pos.x = e.clientX;
      pos.y = e.clientY;
      var rect = panel.getBoundingClientRect();
      pos.left = rect.left;
      pos.top = rect.top;
      document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', function (e) {
      if (!pos.dragging) return;
      var dx = e.clientX - pos.x;
      var dy = e.clientY - pos.y;
      panel.style.left = (pos.left + dx) + 'px';
      panel.style.top = (pos.top + dy) + 'px';
      panel.style.right = 'auto';
      panel.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', function () {
      pos.dragging = false;
      document.body.style.userSelect = '';
    });
  }

  function formatQuizAnalytics(history) {
    try {
      var events = Array.isArray(history) ? history.slice(-40) : [];
      var attemptByQ = {};
      var lines = [];
      events.forEach(function (evt, index) {
        var ts = evt.t ? new Date(evt.t) : new Date();
        var time = ts.toLocaleTimeString();
        var type = (evt.type || '').toString();
        var label = type ? type.replace(/_/g, ' ').toUpperCase() : 'EVENT';
        var icon = 'ℹ️';
        if (evt.correct === true) icon = '✅';
        if (evt.correct === false) icon = '❌';

        // Attempt count (best-effort): count answer-like events per question text/id.
        var qKey = evt && (evt.q != null ? String(evt.q) : (evt.name != null ? String(evt.name) : ''));
        var isAttemptLike = !!(qKey && (evt.value != null || evt.expected != null || /answer/i.test(String(evt.type || ''))));
        var attemptNo = null;
        if (isAttemptLike) {
          attemptByQ[qKey] = (attemptByQ[qKey] || 0) + 1;
          attemptNo = attemptByQ[qKey];
        }

        var parts = [];
        parts.push('<strong>#' + (index + 1) + ' ' + icon + ' ' + label + ' @ ' + time + '</strong>');
        if (evt.q) parts.push('Challenge: ' + evt.q);
        if (evt.value != null) parts.push('Student Answer: ' + evt.value);
        if (evt.expected != null) parts.push('Correct Answer: ' + evt.expected);
        if (attemptNo != null) parts.push('Attempt: ' + attemptNo);
        if (evt.result != null) {
          var resLabel = String(evt.result).toLowerCase();
          if (resLabel === 'correct') {
            parts.push('Result: ✅ Correct');
          } else if (resLabel === 'incorrect') {
            parts.push('Result: ❌ Incorrect');
          } else {
            parts.push('Result: ' + evt.result);
          }
        }
        lines.push('<div>' + parts.join('<br>') + '</div>');
      });
      if (lines.length === 0) {
        lines.push('<div>Waiting for xAPI events...</div>');
      }
      return lines.join('<div style="margin:6px 0;"></div>');
    } catch (e) {
      return 'Waiting for xAPI events...';
    }
  }

  function normalizeCorrectness(evt) {
    try {
      if (!evt) return null;
      if (evt.correct === true) return true;
      if (evt.correct === false) return false;
      if (evt.result != null) {
        var r = String(evt.result).toLowerCase();
        if (r === 'correct') return true;
        if (r === 'incorrect' || r === 'wrong') return false;
      }
    } catch (e) {}
    return null;
  }

  function buildAttemptLog(history) {
    var raw = Array.isArray(history) ? history.slice(-120) : [];
    var attemptByQ = {};
    var events = [];

    raw.forEach(function (evt) {
      try {
        if (!evt) return;
        var qKey = evt.q != null ? String(evt.q) : (evt.name != null ? String(evt.name) : '');
        var type = String(evt.type || '');
        var isAttemptLike = !!(qKey && (evt.value != null || evt.expected != null || /answer/i.test(type)));
        if (!isAttemptLike) return;

        attemptByQ[qKey] = (attemptByQ[qKey] || 0) + 1;
        var attemptNo = attemptByQ[qKey];
        var correct = normalizeCorrectness(evt);

        events.push({
          t: evt.t || null,
          type: type || null,
          q: qKey.substring(0, 220),
          studentAnswer: evt.value != null ? String(evt.value).substring(0, 220) : null,
          correctAnswer: evt.expected != null ? String(evt.expected).substring(0, 220) : null,
          correct: correct,
          attempt: attemptNo
        });
      } catch (e) {}
    });

    // Build per-question summary using the final enriched event for each question.
    var byQuestion = {};
    events.forEach(function (e) {
      byQuestion[e.q] = {
        question: e.q,
        attempts: e.attempt,
        lastStudentAnswer: e.studentAnswer,
        correctAnswer: e.correctAnswer,
        correct: e.correct
      };
    });

    var questionSummaries = Object.keys(byQuestion).map(function (k) { return byQuestion[k]; });

    return {
      events: events.slice(-80),
      byQuestion: questionSummaries.slice(-60)
    };
  }

  function escapeHtml(s) {
    try {
      return safeText(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    } catch (e) {
      return '';
    }
  }

  function formatQuizAttemptLogPlain(history) {
    try {
      var attemptLog = buildAttemptLog(history);
      var events = attemptLog && attemptLog.events ? attemptLog.events : [];
      if (!events.length) return '';

      var qIndex = {};
      var qCounter = 0;

      var lines = [];
      events.forEach(function (e) {
        var qi = 0;
        if (e.q) {
          if (!qIndex[e.q]) {
            qCounter += 1;
            qIndex[e.q] = qCounter;
          }
          qi = qIndex[e.q];
        }
        var status = 'Attempt ' + e.attempt;
        if (e.correct === true) status = '✅ Correct (Attempt ' + e.attempt + ')';
        if (e.correct === false) status = '❌ Wrong (Attempt ' + e.attempt + ')';
        lines.push(
          (qi ? ('Q' + qi + ': ') : 'Q: ') + (e.q || '') +
          (e.studentAnswer != null ? ('\nStudent answer: ' + e.studentAnswer) : '') +
          (e.correctAnswer != null ? ('\nCorrect answer: ' + e.correctAnswer) : '') +
          '\n' + status
        );
      });
      return lines.join('\n\n');
    } catch (e) {
      return '';
    }
  }

  // HTML version for SLS-visible feedback panels (many SLS views render HTML but
  // collapse raw newlines). We keep statements `result.response` as plain text.
  function formatQuizAttemptLogHtml(history) {
    try {
      var attemptLog = buildAttemptLog(history);
      var events = attemptLog && attemptLog.events ? attemptLog.events : [];
      if (!events.length) return '';

      var qIndex = {};
      var qCounter = 0;

      var blocks = [];
      events.forEach(function (e) {
        var qi = 0;
        if (e.q) {
          if (!qIndex[e.q]) {
            qCounter += 1;
            qIndex[e.q] = qCounter;
          }
          qi = qIndex[e.q];
        }
        var status = 'Attempt ' + e.attempt;
        if (e.correct === true) status = '✅ Correct (Attempt ' + e.attempt + ')';
        if (e.correct === false) status = '❌ Wrong (Attempt ' + e.attempt + ')';

        var header = (qi ? ('Q' + qi + ': ') : 'Q: ') + escapeHtml(e.q || '');
        var sa = e.studentAnswer != null ? ('Student answer: ' + escapeHtml(e.studentAnswer)) : '';
        var ca = e.correctAnswer != null ? ('Correct answer: ' + escapeHtml(e.correctAnswer)) : '';
        var st = escapeHtml(status);

        // Use <br> explicitly because many LMS/LRS views collapse raw newlines,
        // and sometimes sanitize <div> blocks.
        blocks.push(
          '<strong>' + header + '</strong>' +
          '<br>' +
          (sa ? (sa + '<br>') : '') +
          (ca ? (ca + '<br>') : '') +
          st
        );
      });
      return blocks.join('<br><br>');
    } catch (e) {
      return '';
    }
  }

  function deriveQuizScoreFromHistory(history, stateValue) {
    try {
      var attemptLog = buildAttemptLog(history);
      var byQuestion = attemptLog && attemptLog.byQuestion ? attemptLog.byQuestion : [];
      if (!byQuestion.length) return null;

      // Raw score: count questions that are correct (best-effort using last correctness).
      var correctCount = 0;
      byQuestion.forEach(function (q) {
        if (q && q.correct === true) correctCount += 1;
      });

      // Max: prefer explicit max/total from stateValue if present.
      var max = null;
      if (stateValue && stateValue.max != null && !Number.isNaN(Number(stateValue.max))) max = Number(stateValue.max);
      if (max == null && stateValue && stateValue.total != null && !Number.isNaN(Number(stateValue.total))) max = Number(stateValue.total);

      function tryParseMaxFromText(txt) {
        try {
          var t = safeText(txt);
          if (!t) return null;
          var m = /Quiz\s*Problem\s*\d+\s*\/\s*(\d+)/i.exec(t);
          if (m && m[1]) {
            var n = Number(m[1]);
            if (!Number.isNaN(n) && n > 0) return n;
          }
        } catch (e) {}
        return null;
      }

      // If max not provided, try to parse from original logs (most reliable).
      if (max == null && stateValue) {
        // actionLog is typically structured and contains "Quiz Problem X/10".
        if (Array.isArray(stateValue.actionLog)) {
          for (var a = 0; a < stateValue.actionLog.length; a++) {
            var lbl = stateValue.actionLog[a] && stateValue.actionLog[a].label;
            var parsed = tryParseMaxFromText(lbl);
            if (parsed != null) { max = parsed; break; }
          }
        }
        // preserved original feedback (timeline summary)
        if (max == null && stateValue.details && stateValue.details.originalFeedback) {
          max = tryParseMaxFromText(stateValue.details.originalFeedback);
        }
      }

      // If max still not provided, try to parse from question label like "Quiz Problem 2/10".
      if (max == null) {
        for (var i = 0; i < byQuestion.length; i++) {
          var qq = byQuestion[i] && byQuestion[i].question ? String(byQuestion[i].question) : '';
          var parsed2 = tryParseMaxFromText(qq);
          if (parsed2 != null) { max = parsed2; break; }
        }
      }

      // As a fallback, use number of unique questions observed.
      if (max == null) max = byQuestion.length;

      return { raw: correctCount, max: max };
    } catch (e) {
      return null;
    }
  }

  function buildQuizAttemptLogExtension(history) {
    try {
      var attemptLog = buildAttemptLog(history);
      return {
        generatedAt: new Date().toISOString(),
        eventCount: attemptLog && attemptLog.events ? attemptLog.events.length : 0,
        events: attemptLog && attemptLog.events ? attemptLog.events : [],
        byQuestion: attemptLog && attemptLog.byQuestion ? attemptLog.byQuestion : []
      };
    } catch (e) {
      return { generatedAt: new Date().toISOString(), eventCount: 0, events: [], byQuestion: [] };
    }
  }

  function renderDebugPanel(stateValue) {
    try {
      if (!DEBUG_PANEL_ENABLED) return;
      if (!stateValue) return;
      ensureDebugPanel();
      var body = document.getElementById('xapi-debug-body');
      if (!body) return;

      if (Array.isArray(stateValue.history) && stateValue.history.length) {
        body.innerHTML = formatQuizAnalytics(stateValue.history);
        return;
      }

      var summary = stateValue.summary || {};
      var lines = [];
      if (stateValue.feedback) {
        lines.push(stateValue.feedback);
      } else {
        lines.push('Feedback');
        lines.push('Interactive Response Assistant');
        lines.push(new Date().toLocaleString());
        lines.push('Interactions: ' + (summary.interactions || 0));
        lines.push('Elapsed Time: ' + (summary.elapsedSec || 0) + 's');
        if (stateValue.score != null) {
          lines.push('Score: ' + stateValue.score + (stateValue.max != null ? (' / ' + stateValue.max) : ''));
        }
        lines.push('Unique Explorations: ' + (summary.uniqueTargets || 0));
        lines.push('');
        lines.push('Action Log:');
      }

      if (Array.isArray(stateValue.actionLog)) {
        stateValue.actionLog.forEach(function (a) {
          lines.push('[' + a.t + 's] ' + a.type + (a.label ? (' — ' + a.label) : ''));
        });
      }

      body.textContent = lines.join('\n');
    } catch (e) {
      console.warn('[xAPI] debug panel render failed', e);
    }
  }

  function syncFromCache() {
    try {
      var cached = readCachedState();
      if (cached && cached.state) {
        window.__xapiLastState = cached.state;
        renderDebugPanel(cached.state);

        // Push cached child-tab state to LRS when parent tab is active
        try {
          var params = XAPIUtils.getParameters();
          if (params && params.activityId && params.agent && params.endpoint) {
            ensureSendStateHook();
            window.ADL.XAPIWrapper.sendState(params.activityId, params.agent, params.stateId, null, cached.state);
          }
        } catch (e) {}
      } else if (window.__xapiLastState) {
        renderDebugPanel(window.__xapiLastState);
      }
    } catch (e) {}
  }

  window.addEventListener('storage', function (e) {
    if (e && e.key === STATE_KEY) {
      syncFromCache();
    }
  });

  window.addEventListener('focus', function () {
    syncFromCache();
  });

  // Initial parse on load
  XAPIUtils.getParameters();
  // Show panel if state is already present
  syncFromCache();

  // Hook into storeState for live updates
  var __origStoreState = window.storeState;
  window.storeState = function (stateValue) {
    try {
      __origStoreState(stateValue);
    } finally {
      renderDebugPanel(stateValue);
    }
  };
})();
