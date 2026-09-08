import prisma from '../db.js';
import type { Fact } from '@prisma/client';
import { areCandidates } from './matcher.js';
import { askLLMToReconcile } from './llmReconciler.js';

/**
 * Checks if two values are equal within a 1% tolerance.
 */
function isCloseEnough(valA: number | null, valB: number | null): boolean {
  if (valA === null || valB === null) return valA === valB;
  if (valA === 0 && valB === 0) return true;
  const max = Math.max(Math.abs(valA), Math.abs(valB));
  const diff = Math.abs(valA - valB);
  return diff / max < 0.01;
}

/**
 * Reconciles two facts. First tries deterministic shortcuts, then falls back to LLM.
 */
export async function reconcilePair(factA: Fact, factB: Fact) {
  // Deterministic checks
  const sameNormValue = isCloseEnough(factA.normalizedValue, factB.normalizedValue);
  const sameUnit = factA.normalizedUnit === factB.normalizedUnit;
  const samePeriod = factA.periodStart === factB.periodStart && factA.periodEnd === factB.periodEnd;
  const sameScope = factA.scope === factB.scope;

  // Shortcut 1: Exact matches
  if (sameNormValue && sameUnit && samePeriod && sameScope && factA.normalizedValue !== null) {
    return {
      relationship_type: "CORROBORATED",
      reasoning: "Deterministic match: Both facts have identical normalized values, units, periods, and scope.",
      confidence: 1.0
    };
  }

  // If not a clear deterministic match, ask LLM to reason about it
  return askLLMToReconcile(factA, factB);
}

/**
 * Runs reconciliation for a specific document against all other facts in the DB.
 */
export async function runIncrementalReconciliation(documentId: string) {
  // 1. Get all facts for this document
  const newFacts = await prisma.fact.findMany({
    where: { documentId }
  });

  if (newFacts.length === 0) return 0;

  // 2. Get all facts from OTHER documents
  const existingFacts = await prisma.fact.findMany({
    where: {
      documentId: { not: documentId }
    }
  });

  if (existingFacts.length === 0) return 0;

  let processedCount = 0;

  // 3. Compare each new fact to existing facts
  for (const newFact of newFacts) {
    for (const oldFact of existingFacts) {
      // Check if they are candidates
      if (!areCandidates(newFact, oldFact)) {
        continue;
      }

      // Check if relationship already exists
      const existingRel = await prisma.relationship.findFirst({
        where: {
          OR: [
            { factAId: newFact.id, factBId: oldFact.id },
            { factAId: oldFact.id, factBId: newFact.id }
          ]
        }
      });

      if (existingRel) continue;

      // Reconcile
      try {
        const result = await reconcilePair(newFact, oldFact);

        // Save to DB
        await prisma.relationship.create({
          data: {
            factAId: newFact.id,
            factBId: oldFact.id,
            relationshipType: result.relationship_type,
            reasoning: result.reasoning,
            confidence: result.confidence
          }
        });

        processedCount++;
      } catch (err: any) {
        console.error(`Failed to reconcile ${newFact.id} and ${oldFact.id}:`, err.message);
      }
    }
  }

  return processedCount;
}
