import { GoogleGenerativeAI } from '@google/generative-ai';
import type { Fact } from '@prisma/client';

let geminiClient: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!geminiClient) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('API key is not set.');
    }
    geminiClient = new GoogleGenerativeAI(apiKey);
  }
  return geminiClient;
}

const SYSTEM_PROMPT = `You are a financial reasoning engine. 
Compare these two extracted facts from financial documents and determine their relationship.

Determine the relationship using exactly one of these categories:
- CORROBORATED: Both facts state the same metric and agree in value (after accounting for units/currency conversions) for the same period and scope.
- CONTRADICTION: Both describe the exact same metric, period, and scope, but genuinely disagree in value.
- CONTEXT_RESOLVED: They differ in value, but there is a clear contextual explanation (e.g. different time period, different scope, different unit, or "reported" vs "adjusted").
- UNCERTAIN: It is unclear if they are directly comparable or if the difference can be resolved.

Prefer CONTEXT_RESOLVED over CONTRADICTION if there is a plausible non-conflicting explanation. Do not paper over genuine conflicts.

Respond ONLY with valid JSON in this exact format:
{
  "relationship_type": "CORROBORATED" | "CONTRADICTION" | "CONTEXT_RESOLVED" | "UNCERTAIN",
  "reasoning": "1-3 sentences explaining why, referencing periods, scope, or units.",
  "confidence": 0.95
}`;

export type ReconcileResult = {
  relationship_type: "CORROBORATED" | "CONTRADICTION" | "CONTEXT_RESOLVED" | "UNCERTAIN";
  reasoning: string;
  confidence: number;
};

function stripMarkdownFences(text: string): string {
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
  cleaned = cleaned.replace(/\n?```\s*$/i, '');
  return cleaned.trim();
}

export async function askLLMToReconcile(factA: Fact, factB: Fact): Promise<ReconcileResult> {
  const client = getClient();
  const model = client.getGenerativeModel({
    model: 'gemini-flash-latest',
    systemInstruction: SYSTEM_PROMPT,
  });

  const prompt = `
Fact A:
- Subject: ${factA.subject}
- Predicate: ${factA.predicate}
- Raw Value/Unit: ${factA.rawValue} ${factA.rawUnit || ''}
- Normalized Value/Unit: ${factA.normalizedValue} ${factA.normalizedUnit || ''}
- Period: ${factA.periodStart} to ${factA.periodEnd}
- Scope: ${factA.scope || 'Unspecified'}
- Evidence Quote: "${factA.evidenceQuote}"

Fact B:
- Subject: ${factB.subject}
- Predicate: ${factB.predicate}
- Raw Value/Unit: ${factB.rawValue} ${factB.rawUnit || ''}
- Normalized Value/Unit: ${factB.normalizedValue} ${factB.normalizedUnit || ''}
- Period: ${factB.periodStart} to ${factB.periodEnd}
- Scope: ${factB.scope || 'Unspecified'}
- Evidence Quote: "${factB.evidenceQuote}"

Determine their relationship. Output JSON only.
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  
  if (!text) throw new Error('No response from Gemini');
  
  try {
    const json = JSON.parse(stripMarkdownFences(text));
    return {
      relationship_type: json.relationship_type,
      reasoning: json.reasoning,
      confidence: json.confidence || 0.8
    };
  } catch (e) {
    throw new Error('Failed to parse LLM reconciliation response: ' + text);
  }
}
