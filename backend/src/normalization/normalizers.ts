import type { ExtractedFact } from '../extraction/llmExtractor.js';

// ─── Currency multipliers ──────────────────────────────────────────────────────
// These convert shorthand unit references to their base multiplier.
// E.g., "₹ Cr" means the raw_value is in crores of INR → multiply by 10,000,000.


// Build case-insensitive regex patterns and their multipliers
const MULTIPLIER_PATTERNS: { pattern: RegExp; multiplier: number }[] = [
  // Crore variants: Cr, Crore, Crores
  { pattern: /\bcr(?:ore)?s?\b/i, multiplier: 10_000_000 },
  // Lakh variants: L, Lakh, Lakhs, Lac
  { pattern: /\blakhs?\b|\blacs?\b/i, multiplier: 100_000 },
  // Billion variants: Bn, Billion, Billions
  { pattern: /\bbn\b|\bbillions?\b/i, multiplier: 1_000_000_000 },
  // Million variants: Mn, Mil, Million, Millions
  { pattern: /\bmn\b|\bmil\b|\bmillions?\b/i, multiplier: 1_000_000 },
  // Thousand variants: K, Thousand, Thousands
  { pattern: /\bk\b|\bthousands?\b/i, multiplier: 1_000 },
  // Trillion
  { pattern: /\btrillions?\b|\btn\b/i, multiplier: 1_000_000_000_000 },
];

// Currency symbol → base unit mapping
const CURRENCY_SYMBOLS: Record<string, string> = {
  '₹': 'INR',
  'rs': 'INR',
  'rs.': 'INR',
  'inr': 'INR',
  '$': 'USD',
  'usd': 'USD',
  'us$': 'USD',
  '€': 'EUR',
  'eur': 'EUR',
  '£': 'GBP',
  'gbp': 'GBP',
  '¥': 'JPY',
  'jpy': 'JPY',
};

/**
 * Detects the base currency from a raw_unit string.
 * Returns the base currency code (e.g., "INR") or null if unknown.
 */
function detectCurrency(rawUnit: string): string | null {
  const lower = rawUnit.toLowerCase().trim();
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (lower.includes(symbol)) return code;
  }
  return null;
}

/**
 * Detects a magnitude multiplier from a raw_unit string.
 * Returns the multiplier (e.g., 10_000_000 for crore) or 1 if none found.
 */
function detectMultiplier(rawUnit: string): number {
  for (const { pattern, multiplier } of MULTIPLIER_PATTERNS) {
    if (pattern.test(rawUnit)) return multiplier;
  }
  return 1;
}

/**
 * Parses a raw value string like "8,142" or "1,23,456" into a number.
 * Handles Indian and Western number formatting.
 */
function parseRawNumber(rawValue: string): number | null {
  // Remove commas and spaces
  const cleaned = rawValue.replace(/[,\s]/g, '');
  // Handle parentheses as negative: (123) → -123
  const negative = cleaned.startsWith('(') && cleaned.endsWith(')');
  const stripped = negative ? cleaned.slice(1, -1) : cleaned;
  const num = parseFloat(stripped);
  if (isNaN(num)) return null;
  return negative ? -num : num;
}

/**
 * Normalizes currency values in a fact.
 * Converts "8,142" with unit "₹ Cr" to normalizedValue=81420000000, normalizedUnit="INR".
 */
export function normalizeCurrency(fact: ExtractedFact): ExtractedFact {
  if (!fact.rawUnit || !fact.rawValue) return fact;

  const currency = detectCurrency(fact.rawUnit);
  if (!currency) return fact; // Not a currency unit — skip

  const multiplier = detectMultiplier(fact.rawUnit);
  const numericValue = parseRawNumber(fact.rawValue);

  if (numericValue === null) return fact;

  return {
    ...fact,
    normalizedValue: numericValue * multiplier,
    normalizedUnit: currency,
  };
}

// ─── Percentage normalizer ─────────────────────────────────────────────────────

/**
 * Normalizes percentage values.
 * "18" with unit "%" → normalizedValue=0.18, normalizedUnit="ratio"
 * "0.18" with unit "%" → normalizedValue=0.18, normalizedUnit="ratio"
 * 
 * Heuristic: if raw_value > 1 and unit is %, divide by 100.
 *            if raw_value <= 1 and unit is %, treat as already a ratio.
 */
export function normalizePercentage(fact: ExtractedFact): ExtractedFact {
  if (!fact.rawUnit || !fact.rawValue) return fact;

  const unitLower = fact.rawUnit.trim().toLowerCase();
  // Check for percentage indicators
  const isPercent = unitLower === '%' || unitLower === 'percent' || unitLower === 'percentage'
    || unitLower.includes('%') || unitLower === 'bps' || unitLower === 'basis points';

  if (!isPercent) return fact;

  const numericValue = parseRawNumber(fact.rawValue);
  if (numericValue === null) return fact;

  // Handle basis points: 1 bp = 0.01%
  if (unitLower === 'bps' || unitLower === 'basis points') {
    return {
      ...fact,
      normalizedValue: numericValue / 10000,
      normalizedUnit: 'ratio',
    };
  }

  // For percentages: if value > 1, it's like "18%" → 0.18
  // If value <= 1, it's ambiguous — could be "0.18%" (very small) or already a ratio.
  // Convention: treat as percentage points (divide by 100).
  return {
    ...fact,
    normalizedValue: numericValue / 100,
    normalizedUnit: 'ratio',
  };
}

// ─── Date/Period normalizer ────────────────────────────────────────────────────
// Indian fiscal year: April 1 to March 31
// FY24 = FY2024 = April 1, 2023 to March 31, 2024
// FY2023-24 = same as FY24
// Q1 FY24 = April 1, 2023 to June 30, 2023
// Q2 FY24 = July 1, 2023 to September 30, 2023
// Q3 FY24 = October 1, 2023 to December 31, 2023
// Q4 FY24 = January 1, 2024 to March 31, 2024
// H1 FY24 = April 1, 2023 to September 30, 2023
// H2 FY24 = October 1, 2023 to March 31, 2024

interface FiscalPeriod {
  periodStart: string;
  periodEnd: string;
}

/**
 * Given a fiscal year end year (e.g., 2024 for FY24), returns the start/end dates.
 */
function fyDates(endYear: number): FiscalPeriod {
  return {
    periodStart: `${endYear - 1}-04-01`,
    periodEnd: `${endYear}-03-31`,
  };
}

/**
 * Given a quarter (1-4) and fiscal year end year, returns the start/end dates.
 */
function quarterDates(quarter: number, fyEndYear: number): FiscalPeriod {
  switch (quarter) {
    case 1:
      return { periodStart: `${fyEndYear - 1}-04-01`, periodEnd: `${fyEndYear - 1}-06-30` };
    case 2:
      return { periodStart: `${fyEndYear - 1}-07-01`, periodEnd: `${fyEndYear - 1}-09-30` };
    case 3:
      return { periodStart: `${fyEndYear - 1}-10-01`, periodEnd: `${fyEndYear - 1}-12-31` };
    case 4:
      return { periodStart: `${fyEndYear}-01-01`, periodEnd: `${fyEndYear}-03-31` };
    default:
      return fyDates(fyEndYear);
  }
}

/**
 * Given a half (1-2) and fiscal year end year, returns the start/end dates.
 */
function halfDates(half: number, fyEndYear: number): FiscalPeriod {
  if (half === 1) {
    return { periodStart: `${fyEndYear - 1}-04-01`, periodEnd: `${fyEndYear - 1}-09-30` };
  }
  return { periodStart: `${fyEndYear - 1}-10-01`, periodEnd: `${fyEndYear}-03-31` };
}

/**
 * Parses a fiscal year string into the end year.
 * Examples:
 *   "FY24" → 2024
 *   "FY2024" → 2024
 *   "FY2023-24" → 2024
 *   "FY23-24" → 2024
 */
function parseFYEndYear(fyStr: string): number | null {
  // Match "FY2023-24" or "FY23-24" — use the end part
  const rangeMatch = fyStr.match(/FY\s*(\d{2,4})\s*[-–]\s*(\d{2,4})/i);
  if (rangeMatch) {
    const endPart = rangeMatch[2];
    if (endPart.length === 2) return 2000 + parseInt(endPart, 10);
    return parseInt(endPart, 10);
  }

  // Match "FY24" or "FY2024"
  const singleMatch = fyStr.match(/FY\s*(\d{2,4})/i);
  if (singleMatch) {
    const year = parseInt(singleMatch[1], 10);
    if (year < 100) return 2000 + year;
    return year;
  }

  return null;
}

/**
 * Normalizes date/period fields in a fact.
 * Parses fiscal year references (FY24, Q4 FY24, H1 FY24) into ISO date ranges.
 * Only operates on facts where periodStart/periodEnd contain FY-style strings,
 * or where the evidence_quote/raw_value contains FY references the LLM didn't resolve.
 */
export function normalizeDatePeriod(fact: ExtractedFact): ExtractedFact {
  // If already have properly formatted ISO dates, skip
  if (fact.periodStart && /^\d{4}-\d{2}-\d{2}$/.test(fact.periodStart) &&
      fact.periodEnd && /^\d{4}-\d{2}-\d{2}$/.test(fact.periodEnd)) {
    return fact;
  }

  // Try to parse FY references from periodStart/periodEnd fields or evidence_quote
  const textToSearch = [
    fact.periodStart || '',
    fact.periodEnd || '',
    fact.evidenceQuote || '',
  ].join(' ');

  // Match "Q1 FY24", "Q4 FY2023-24", etc.
  const quarterFyMatch = textToSearch.match(/Q([1-4])\s*FY\s*(\d{2,4}(?:\s*[-–]\s*\d{2,4})?)/i);
  if (quarterFyMatch) {
    const quarter = parseInt(quarterFyMatch[1], 10);
    const fyEndYear = parseFYEndYear(`FY${quarterFyMatch[2]}`);
    if (fyEndYear) {
      const dates = quarterDates(quarter, fyEndYear);
      return { ...fact, periodStart: dates.periodStart, periodEnd: dates.periodEnd };
    }
  }

  // Match "H1 FY24", "H2 FY2024", etc.
  const halfFyMatch = textToSearch.match(/H([12])\s*FY\s*(\d{2,4}(?:\s*[-–]\s*\d{2,4})?)/i);
  if (halfFyMatch) {
    const half = parseInt(halfFyMatch[1], 10);
    const fyEndYear = parseFYEndYear(`FY${halfFyMatch[2]}`);
    if (fyEndYear) {
      const dates = halfDates(half, fyEndYear);
      return { ...fact, periodStart: dates.periodStart, periodEnd: dates.periodEnd };
    }
  }

  // Match standalone "FY24" or "FY2023-24"
  const fyMatch = textToSearch.match(/FY\s*(\d{2,4}(?:\s*[-–]\s*\d{2,4})?)/i);
  if (fyMatch) {
    const fyEndYear = parseFYEndYear(`FY${fyMatch[1]}`);
    if (fyEndYear) {
      const dates = fyDates(fyEndYear);
      return { ...fact, periodStart: dates.periodStart, periodEnd: dates.periodEnd };
    }
  }

  // Match calendar year "CY2024" or "CY24"
  const cyMatch = textToSearch.match(/CY\s*(\d{2,4})/i);
  if (cyMatch) {
    let year = parseInt(cyMatch[1], 10);
    if (year < 100) year = 2000 + year;
    return { ...fact, periodStart: `${year}-01-01`, periodEnd: `${year}-12-31` };
  }

  return fact;
}

// ─── Combined normalizer ──────────────────────────────────────────────────────

/**
 * Runs all normalizers on a fact in sequence.
 * Order matters: currency first (to set normalizedValue), then percentage,
 * then date (independent of value normalization).
 */
export function normalizeAll(fact: ExtractedFact): ExtractedFact {
  let normalized = normalizeCurrency(fact);
  normalized = normalizePercentage(normalized);
  normalized = normalizeDatePeriod(normalized);
  return normalized;
}
