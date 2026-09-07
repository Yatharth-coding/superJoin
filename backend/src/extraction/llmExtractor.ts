import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import type { PageText } from './pdfExtractor.js';

// ─── Zod schema for validating LLM fact output ────────────────────────────────

const LLMFactSchema = z.object({
  subject: z.string(),
  predicate: z.string(),
  raw_value: z.string().nullable().optional(),
  raw_unit: z.string().nullable().optional(),
  normalized_value: z.number().nullable().optional(),
  normalized_unit: z.string().nullable().optional(),
  period_start: z.string().nullable().optional(),
  period_end: z.string().nullable().optional(),
  scope: z.string().nullable().optional(),
  source_page: z.number(),
  evidence_quote: z.string(),
  confidence: z.number().min(0).max(1),
  extraction_notes: z.string().nullable().optional(),
});

const LLMFactArraySchema = z.array(LLMFactSchema);

export type LLMFact = z.infer<typeof LLMFactSchema>;

export interface ExtractedFact extends LLMFact {
  id: string;
  raw: string; // serialized original LLM JSON for debugging
  // Camel-case aliases set by normalizers (coexist with snake_case from LLM)
  normalizedValue?: number | null;
  normalizedUnit?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  sourcePage?: number;
  evidenceQuote?: string;
}

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a precise fact extraction engine. Your job is to read PDF text and extract ONLY meaningful, structured facts as a JSON array.

RULES:
1. Extract numerical facts (financial figures, counts, percentages, ratios, dates), named entities with attributes, and key semantic facts (roles, statuses, designations).
2. Do NOT invent or infer facts. Only extract what is EXPLICITLY stated in the text.
3. For each fact, include the EXACT verbatim quote (evidence_quote) from the text where you found it. Copy the text precisely, including any formatting.
4. If a value's meaning is genuinely ambiguous (e.g., "reduced by 20%" vs "is 20%"), set confidence lower (0.5-0.7) and explain the ambiguity in extraction_notes.
5. Use snake_case for predicate names (e.g., "revenue_from_services", "employee_count", "gdp_growth_rate"). Create new predicate names as needed — do NOT limit yourself to a fixed set.
6. Normalize subject names consistently (e.g., always "Delhivery Limited" not sometimes "Delhivery" and sometimes "Delhivery Ltd").
7. For source_page, use the page number indicated in the input for the chunk of text containing the fact.
8. Set scope when context makes it clear (e.g., "consolidated", "standalone", "India", "global", "segment: express parcel"). Leave null if not determinable.
9. For period_start and period_end, use ISO date format (YYYY-MM-DD) when the text specifies a time period. Use Indian fiscal year conventions: FY24 = April 1, 2023 to March 31, 2024. Leave null if the fact is not time-bound.
10. For raw_value, copy the number exactly as written in the text (e.g., "8,142" not 8142). For raw_unit, copy the unit exactly as written (e.g., "₹ Cr", "USD Mn", "%").
11. For normalized_value, convert to the base unit (e.g., crores to plain INR, millions to plain USD, "18%" to 0.18). For normalized_unit, use the base unit (e.g., "INR", "USD", "ratio"). If you cannot normalize confidently, leave normalized_value as null and note why.

OUTPUT FORMAT:
Return ONLY a valid JSON array of fact objects. No markdown, no explanation, no wrapping.
Each fact object must have this shape:
{
  "subject": "string — entity the fact is about",
  "predicate": "string — snake_case fact type",
  "raw_value": "string or null — the value as written",
  "raw_unit": "string or null — the unit as written",
  "normalized_value": number or null,
  "normalized_unit": "string or null — base unit",
  "period_start": "YYYY-MM-DD or null",
  "period_end": "YYYY-MM-DD or null",
  "scope": "string or null",
  "source_page": number,
  "evidence_quote": "exact verbatim text",
  "confidence": number between 0 and 1,
  "extraction_notes": "string or null"
}

If the text contains NO extractable facts, return an empty array: []`;

// ─── Claude API client ─────────────────────────────────────────────────────────

let anthropicClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error(
        'ANTHROPIC_API_KEY is not set. Copy .env.example to .env and add your key.'
      );
    }
    anthropicClient = new Anthropic({ apiKey });
  }
  return anthropicClient;
}

// ─── JSON parsing helpers ──────────────────────────────────────────────────────

/**
 * Strips markdown code fences from LLM output, if present.
 * Handles ```json ... ``` and ``` ... ```
 */
function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  // Remove ```json or ``` prefix
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  // Remove trailing ```
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  return cleaned.trim();
}

/**
 * Attempts to parse JSON from LLM output, with fence stripping.
 * Returns the parsed array or null if unparseable.
 */
function tryParseJSON(text: string): any | null {
  const cleaned = stripMarkdownFences(text);
  try {
    return JSON.parse(cleaned);
  } catch {
    // Try to find a JSON array in the text
    const arrayMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        return null;
      }
    }
    return null;
  }
}

// ─── Extraction for a single chunk ─────────────────────────────────────────────

const MAX_RETRIES = 2;

/**
 * Calls Claude to extract facts from a chunk of PDF pages.
 * Retries once on JSON parse failure.
 */
export async function extractFactsFromChunk(
  chunk: PageText[],
  documentId: string
): Promise<ExtractedFact[]> {
  const client = getClient();

  // Build the user message with page numbers clearly indicated
  const userMessage = chunk
    .map(
      (page) =>
        `--- PAGE ${page.pageNumber} ---\n${page.text}`
    )
    .join('\n\n');

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: userMessage,
          },
        ],
      });

      // Extract text content from response
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text content in Claude response');
      }

      const rawOutput = textBlock.text;
      const parsed = tryParseJSON(rawOutput);

      if (parsed === null) {
        throw new Error(`Failed to parse JSON from LLM output: ${rawOutput.slice(0, 200)}`);
      }

      // Validate with Zod
      const validated = LLMFactArraySchema.parse(parsed);

      // Convert to ExtractedFacts with IDs
      return validated.map((fact) => ({
        ...fact,
        id: `fact_${uuidv4()}`,
        raw: JSON.stringify(fact),
      }));
    } catch (err) {
      lastError = err as Error;
      console.warn(
        `Extraction attempt ${attempt + 1}/${MAX_RETRIES} failed for pages [${chunk.map((p) => p.pageNumber).join(', ')}]: ${(err as Error).message}`
      );

      // On last attempt, don't retry
      if (attempt === MAX_RETRIES - 1) break;

      // Brief pause before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  // All retries failed — log and return empty rather than crashing the whole pipeline
  console.error(
    `All extraction attempts failed for pages [${chunk.map((p) => p.pageNumber).join(', ')}]: ${lastError?.message}`
  );
  return [];
}
