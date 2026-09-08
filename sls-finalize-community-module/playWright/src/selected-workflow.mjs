export const SELECTED_WORKFLOW_CHILD_FLAG = "--selected-workflow";
export const INDIVIDUAL_STAGE_BEHAVIOR_FLAG = "--individual-stage-behavior";

export function isSelectedWorkflowChild(args = []) {
  return args.includes(SELECTED_WORKFLOW_CHILD_FLAG);
}

export function isReusableSlsAuthFailure(output = "") {
  const text = String(output);
  return (
    /SLS authentication is required/i.test(text) ||
    /Reusable SLS authentication was not found/i.test(text) ||
    /reusable SLS session (?:is missing or )?expired/i.test(text) ||
    /Selected workflow requires a reusable SLS session/i.test(text)
  );
}

export const SELECTED_WORKFLOW_STAGES = [
  {
    id: "automation",
    number: "1",
    label: "Curriculum and question automation",
    script: "scripts/one-shot.mjs",
    args: [],
    safeOrder: 1,
  },
  {
    id: "page-break",
    number: "2",
    label: "Meaningful page breaks",
    script: "scripts/page-break.mjs",
    args: [],
    safeOrder: 3,
  },
  {
    id: "thumbnail",
    number: "3",
    label: "Featured image",
    script: "scripts/module-action.mjs",
    args: ["thumbnail"],
    safeOrder: 5,
  },
  {
    id: "gamification",
    number: "4",
    label: "Gamification",
    script: "scripts/module-action.mjs",
    args: ["gamify"],
    safeOrder: 6,
  },
  {
    id: "acp-interactive",
    number: "5",
    label: "ACP practice interactives",
    script: "scripts/acp-interactive.mjs",
    args: [],
    safeOrder: 4,
  },
  {
    id: "add-teacher",
    number: "6",
    label: "Add Wee Loo Kang and completed-assignment printing",
    script: "scripts/module-action.mjs",
    args: ["add-teacher"],
    safeOrder: 7,
  },
  {
    id: "remove-copy",
    number: "7",
    label: 'Remove trailing " - Copy" from activity titles',
    script: "scripts/remove-copy.mjs",
    args: [],
    safeOrder: 2,
  },
];

export const COMPLETE_FLOW_STAGE_IDS = [
  "automation",
  "page-break",
  "thumbnail",
  "add-teacher",
];

export function parseSelectedWorkflowSteps(value) {
  const text = String(value ?? "").trim().toLocaleLowerCase();
  if (!text || new Set(["complete", "standard", "four", "4-stage"]).has(text)) {
    return SELECTED_WORKFLOW_STAGES.filter((stage) => COMPLETE_FLOW_STAGE_IDS.includes(stage.id)).sort(
      (left, right) => left.safeOrder - right.safeOrder,
    );
  }
  if (new Set(["auto", "all", "*"]).has(text)) {
    return [...SELECTED_WORKFLOW_STAGES].sort(
      (left, right) => left.safeOrder - right.safeOrder,
    );
  }

  const aliases = new Map();
  for (const stage of SELECTED_WORKFLOW_STAGES) {
    aliases.set(stage.number, stage.id);
    aliases.set(stage.id, stage.id);
  }
  aliases.set("pagebreak", "page-break");
  aliases.set("page", "page-break");
  aliases.set("copy", "remove-copy");
  aliases.set("cleanup", "remove-copy");
  aliases.set("removecopy", "remove-copy");
  aliases.set("image", "thumbnail");
  aliases.set("gamify", "gamification");
  aliases.set("game", "gamification");
  aliases.set("acp", "acp-interactive");
  aliases.set("acpinteractive", "acp-interactive");
  aliases.set("interactive", "acp-interactive");
  aliases.set("teacher", "add-teacher");
  aliases.set("credits", "add-teacher");
  aliases.set("wee-loo-kang", "add-teacher");

  const requested = new Set();
  for (const token of text.split(/[,+.\s]+/).filter(Boolean)) {
    const range = token.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (start > end) {
        throw new Error(`Range "${token}" must be written from the lower choice to the higher choice.`);
      }
      for (let number = start; number <= end; number += 1) {
        const stage = aliases.get(String(number));
        if (!stage) {
          throw new Error(`Range "${token}" contains choice ${number}. Choose only 1-7.`);
        }
        requested.add(stage);
      }
      continue;
    }
    const stage = aliases.get(token);
    if (!stage) {
      throw new Error(
        `Unknown stage "${token}". Choose 1-7; names automation, page-break, thumbnail, ` +
          `gamification, acp-interactive, add-teacher, remove-copy; COMPLETE; or AUTO.`,
      );
    }
    requested.add(stage);
  }
  return SELECTED_WORKFLOW_STAGES.filter((stage) => requested.has(stage.id)).sort(
    (left, right) => left.safeOrder - right.safeOrder,
  );
}
