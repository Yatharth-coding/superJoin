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
  const words1 = normalizeString(str1).split(' ').filter(w => w.length > 1); // skip single chars
  const words2 = normalizeString(str2).split(' ').filter(w => w.length > 1);

  if (words1.length === 0 || words2.length === 0) return 0;

  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersection = 0;

  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }

  // Dice coefficient
  return (2 * intersection) / (set1.size + set2.size);
}

/**
 * Checks if one string contains the other as a substring (normalized).
 */
function isSubstring(str1: string, str2: string): boolean {
  const n1 = normalizeString(str1);
  const n2 = normalizeString(str2);
  if (n1.length === 0 || n2.length === 0) return false;
  return n1.includes(n2) || n2.includes(n1);
}

// Common stop words to ignore in predicate matching
const STOP_WORDS = new Set(['the', 'of', 'in', 'to', 'for', 'and', 'or', 'a', 'an', 'is', 'was', 'from']);

/**
 * Smarter predicate similarity that strips common prefixes/suffixes and
 * checks for semantic overlap.
 */
function predicateSimilarity(pred1: string, pred2: string): number {
  const n1 = normalizeString(pred1);
  const n2 = normalizeString(pred2);
  
  if (n1 === n2) return 1.0;
  
  // Check substring match (e.g., "revenue" matches "revenue_from_services")
  if (isSubstring(n1, n2)) return 0.7;
  
  // Word overlap excluding stop words
  const words1 = n1.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w));
  const words2 = n2.split(' ').filter(w => w.length > 1 && !STOP_WORDS.has(w));
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  let intersection = 0;
  for (const w of set1) {
    if (set2.has(w)) intersection++;
  }
  
  return (2 * intersection) / (set1.size + set2.size);
}

/**
 * Determines if two facts are candidates for reconciliation.
 * Uses relaxed thresholds and smarter matching.
 */
export function areCandidates(factA: Fact, factB: Fact): boolean {
  // Don't compare a fact with itself
  if (factA.id === factB.id) return false;
  
  // If subjects are very different, they aren't comparable
  const subjectSimilarity = getWordOverlap(factA.subject, factB.subject);
  const subjectSubstring = isSubstring(factA.subject, factB.subject);
  if (subjectSimilarity < 0.3 && !subjectSubstring) return false;

  // Predicates must be related
  const predSimilarity = predicateSimilarity(factA.predicate, factB.predicate);
  if (predSimilarity < 0.3) return false;

  return true;
}
