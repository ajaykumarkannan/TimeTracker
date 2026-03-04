/**
 * Simple fuzzy match - checks if all characters in query appear in order in target.
 * Returns match status and a score (higher = better match).
 */
export function fuzzyMatch(query: string, target: string): { match: boolean; score: number } {
  const q = query.toLowerCase();
  const t = target.toLowerCase();

  if (!q) return { match: true, score: 1 };
  if (t.includes(q)) return { match: true, score: 2 };

  let qIdx = 0;
  let consecutiveMatches = 0;
  let maxConsecutive = 0;

  for (let tIdx = 0; tIdx < t.length && qIdx < q.length; tIdx++) {
    if (t[tIdx] === q[qIdx]) {
      qIdx++;
      consecutiveMatches++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveMatches);
    } else {
      consecutiveMatches = 0;
    }
  }

  const match = qIdx === q.length;
  const score = match ? maxConsecutive / q.length : 0;
  return { match, score };
}
