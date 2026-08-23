export function normalizeModuleIdentityText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function visiblePageContainsModuleTitle(expectedTitle, visiblePageText) {
  const expected = normalizeModuleIdentityText(expectedTitle);
  const visible = normalizeModuleIdentityText(visiblePageText);
  return expected.length > 0 && visible.includes(expected);
}
