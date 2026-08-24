import { createRequire } from "node:module";
import path from "node:path";
import { createWorker, PSM } from "tesseract.js";

const DATA_DISPLAY = /\b(?:pie charts?|bar graphs?|line graphs?|pictograms?|data tables?|tables?)\b|\bgraphs?\b[\s\S]{0,60}\b(?:number of|data)\b/i;
const EVIDENCE_STOPWORDS = new Set([
  "about", "after", "again", "below", "chart", "data", "from", "graph", "many",
  "question", "shows", "table", "that", "their", "there", "these", "they", "this",
  "those", "using", "what", "when", "where", "which", "with"
]);

const clean = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

const evidenceTokens = (value) => new Set(
  (clean(value).toLowerCase().match(/[a-z]+/g) ?? [])
    .filter((token) => token.length >= 3 && !EVIDENCE_STOPWORDS.has(token))
    .map((token) => token.length > 4 && token.endsWith("s") && !token.endsWith("ss")
      ? token.slice(0, -1)
      : token)
);

const overlap = (left, right) => {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
};

export function extractSharedStimulus(text) {
  const normalized = clean(text);
  if (!DATA_DISPLAY.test(normalized)) return "";
  const sentences = normalized.match(/[^.!?]+[.!?]?/g) ?? [normalized];
  return clean(sentences.find((sentence) => DATA_DISPLAY.test(sentence)) ?? normalized).slice(0, 600);
}

export function primaryQuestionEvidenceText(evidence = {}) {
  const parts = [clean(evidence.stem)];
  if (clean(evidence.diagramOcr)) parts.push(`[Diagram OCR: ${clean(evidence.diagramOcr)}]`);
  if (clean(evidence.sharedStimulus)) parts.push(`[Shared stimulus: ${clean(evidence.sharedStimulus)}]`);
  if (clean(evidence.sharedDiagramOcr)) {
    parts.push(`[Shared diagram OCR: ${clean(evidence.sharedDiagramOcr)}]`);
  }
  return parts.filter(Boolean).join(" ");
}

// Page breaks can leave a common chart only on the first page while later
// subquestions retain just category names. Carry the display sentence and its OCR
// forward only when the later stem overlaps the chart labels or at least two
// meaningful words from the stimulus. This is deliberately narrower than using
// the entire activity as context: an unrelated later question must not inherit a
// pie-chart tag.
export function attachSharedQuestionContext(evidenceById, questionIds) {
  const enriched = new Map();
  let current = null;
  for (let index = 0; index < questionIds.length; index += 1) {
    const id = questionIds[index];
    if (!evidenceById.has(id)) continue;
    const original = evidenceById.get(id);
    const evidence = {
      stem: clean(original.stem),
      suggestedAnswer: clean(original.suggestedAnswer),
      diagramOcr: clean(original.diagramOcr),
      sharedStimulus: clean(original.sharedStimulus),
      sharedDiagramOcr: clean(original.sharedDiagramOcr),
      sharedFromQuestionId: original.sharedFromQuestionId ?? null
    };
    const ownStimulus = extractSharedStimulus(evidence.stem);
    if (ownStimulus) {
      current = {
        id: String(id),
        index,
        stimulus: ownStimulus,
        stimulusTokens: evidenceTokens(ownStimulus),
        diagramOcr: evidence.diagramOcr,
        diagramTokens: evidenceTokens(evidence.diagramOcr)
      };
    } else if (current && index - current.index <= 4) {
      const stemTokens = evidenceTokens(evidence.stem);
      const sharesDiagramLabel = overlap(stemTokens, current.diagramTokens) >= 1;
      const sharesStimulusLanguage = overlap(stemTokens, current.stimulusTokens) >= 2;
      if (sharesDiagramLabel || sharesStimulusLanguage) {
        evidence.sharedStimulus = current.stimulus;
        evidence.sharedDiagramOcr = current.diagramOcr;
        evidence.sharedFromQuestionId = current.id;
      } else {
        // A non-matching question ends the contiguous shared-stimulus group; do
        // not let a coincidental word several questions later revive old context.
        current = null;
      }
    }
    evidence.primaryText = primaryQuestionEvidenceText(evidence);
    evidence.supportingText = evidence.suggestedAnswer;
    evidence.sources = [
      evidence.stem && "stem",
      evidence.diagramOcr && "diagram-ocr",
      evidence.sharedStimulus && "shared-stimulus",
      evidence.sharedDiagramOcr && "shared-diagram-ocr",
      evidence.suggestedAnswer && "suggested-answer"
    ].filter(Boolean);
    enriched.set(id, evidence);
  }
  return enriched;
}

const require = createRequire(import.meta.url);
const englishData = require("@tesseract.js-data/eng");

export function shouldUseImageOcr(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const words = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  return (
    words.length < 14 ||
    /\b(?:diagram|figure|graphs?|charts?|image|shown|given\s+(?:shape|solid|prism|cylinder|triangle|quadrilateral))\b/i.test(
      normalized,
    )
  );
}

export function createQuestionImageOcr({ logger = () => {} } = {}) {
  let workerPromise = null;

  const getWorker = async () => {
    if (!workerPromise) {
      workerPromise = createWorker("eng", 1, {
        cachePath: path.join(process.cwd(), ".npm-cache", "tesseract"),
        gzip: englishData.gzip,
        langPath: englishData.langPath,
        logger,
      }).then(async (worker) => {
        await worker.setParameters({
          preserve_interword_spaces: "1",
          tessedit_pageseg_mode: PSM.SPARSE_TEXT,
        });
        return worker;
      });
    }
    return workerPromise;
  };

  return {
    async recognize(image) {
      const worker = await getWorker();
      const result = await worker.recognize(image);
      return {
        confidence: Number(result.data.confidence ?? 0),
        text: String(result.data.text ?? "").replace(/\s+/g, " ").trim(),
      };
    },
    async terminate() {
      if (!workerPromise) return;
      const worker = await workerPromise.catch(() => null);
      workerPromise = null;
      await worker?.terminate().catch(() => {});
    },
  };
}
