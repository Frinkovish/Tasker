const normalize = (text: string) =>
  text
    .normalize("NFKC")
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whole words only, so "Sam" isn't found in "sample". */
export function appearsIn(text: string, phrase: string | null): boolean {
  if (!phrase) return false;
  const wanted = normalize(phrase);
  if (!wanted) return false;
  return new RegExp(
    `(?<![\\p{L}\\p{N}])${escapeRegExp(wanted)}(?![\\p{L}\\p{N}])`,
    "u",
  ).test(normalize(text));
}

export { normalize as normalizeText };
