export function normaliseExactToken(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s_-]+/g, "");
}

export function safeExactCategoryMatch(left: string, right: string): boolean {
  return normaliseExactToken(left) === normaliseExactToken(right);
}

export function normaliseMissingMarker(value: string): string | null {
  const token = value.trim().toLocaleLowerCase();
  if (["", "na", "n/a", "null", "none", "missing"].includes(token)) return null;
  return value.trim();
}
