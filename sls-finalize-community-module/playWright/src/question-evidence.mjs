import { createRequire } from "node:module";
import path from "node:path";
import { createWorker, PSM } from "tesseract.js";

const require = createRequire(import.meta.url);
const englishData = require("@tesseract.js-data/eng");

export function shouldUseImageOcr(text) {
  const normalized = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return true;
  const words = normalized.match(/[A-Za-z]+(?:'[A-Za-z]+)?/g) ?? [];
  return (
    words.length < 14 ||
    /\b(?:diagram|figure|graph|image|shown|given\s+(?:shape|solid|prism|cylinder|triangle|quadrilateral))\b/i.test(
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
