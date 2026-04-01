/**
 * Maximum of all present sub-scores (text, link, document). Null if none present.
 */
export function computeGlobalScore(
  textScore: number | null,
  linkScore: number | null,
  documentScore: number | null
): number | null {
  const scores = [textScore, linkScore, documentScore].filter((s): s is number => s != null);
  if (scores.length === 0) return null;
  const max = Math.max(...scores);
  return Math.round(max * 100) / 100;
}
