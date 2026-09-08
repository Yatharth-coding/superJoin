import type { Fact } from '@prisma/client';

/**
 * Normalizes a string for comparison by lowercasing,
 * removing special characters, and trimming.
 */
export function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Simple word overlap similarity between two strings.
 * Returns a value between 0.0 and 1.0
 */
export function getWordOverlap(str1: string, str2: string): number {
  const words1 = normalizeString(str1).split(' ').filter(w => w.length > 0);
  const words2 = normalizeString(str2).split(' ').filter(w => w.length > 0);

  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersection = 0;

  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }

  // Jaccard similarity or Dice coefficient. Let's use Dice.
  return (2 * intersection) / (set1.size + set2.size);
}

/**
 * Determines if two facts are candidates for reconciliation.
 * - Subjects must be identical or very similar (e.g., "Delhivery" vs "Delhivery Limited").
 * - Predicates must be identical or very similar.
 */
export function areCandidates(factA: Fact, factB: Fact): boolean {
  // If subjects are very different, they aren't comparable
  const subjectSimilarity = getWordOverlap(factA.subject, factB.subject);
  if (subjectSimilarity < 0.5) return false;

  // Predicates must be related
  const predSimilarity = getWordOverlap(factA.predicate, factB.predicate);
  if (predSimilarity < 0.5) return false;

  return true;
}
