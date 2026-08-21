// Playwright Codegen can refer to page1/page2 without emitting a declaration when
// a user creates a browser tab through Chrome's UI. Repair that narrow Codegen
// output defect so the saved recording at least parses and can be reviewed or
// replayed after its locators and copied values have been hardened.
export function repairUndeclaredPages(source) {
  const referenced = [...source.matchAll(/\b(page\d+)\s*\./g)].map((match) => match[1]);
  const pageNames = [...new Set(referenced)];
  const missing = pageNames.filter(
    (name) => !new RegExp(`\\b(?:const|let|var)\\s+${name}\\b`).test(source),
  );

  if (missing.length === 0) return { source, repairedPages: [] };

  let repaired = addContextFixture(source);
  for (const pageName of missing) {
    const firstUse = new RegExp(`^(\\s*)await\\s+${pageName}\\.`, "m");
    repaired = repaired.replace(
      firstUse,
      `$1const ${pageName} = await context.newPage();\n$1await ${pageName}.`,
    );
  }

  return { source: repaired, repairedPages: missing };
}

function addContextFixture(source) {
  return source.replace(
    /async\s*\(\{\s*([^}]*)\s*\}\)\s*=>/,
    (whole, fixtures) => {
      const names = fixtures
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean);
      if (!names.includes("context")) names.push("context");
      return `async ({ ${names.join(", ")} }) =>`;
    },
  );
}
