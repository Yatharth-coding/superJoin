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

  // Shortcut 1: Exact matches (same value, unit, period, scope)
  if (sameNormValue && sameUnit && samePeriod && sameScope && factA.normalizedValue !== null) {
    return {
      relationship_type: "CORROBORATED" as const,
      reasoning: "Deterministic match: Both facts have identical normalized values, units, periods, and scope.",
      confidence: 1.0
    };
  }

  // Shortcut 2: Same value+unit but different period → CONTEXT_RESOLVED
  if (sameNormValue && sameUnit && !samePeriod && factA.normalizedValue !== null && factA.periodStart && factB.periodStart) {
    return {
      relationship_type: "CONTEXT_RESOLVED" as const,
      reasoning: `Same value reported for different time periods: ${factA.periodStart} to ${factA.periodEnd} vs ${factB.periodStart} to ${factB.periodEnd}.`,
      confidence: 0.9
    };
  }

  // Shortcut 3: Same period+scope but different values → likely contradiction
  if (!sameNormValue && samePeriod && sameScope && factA.normalizedValue !== null && factB.normalizedValue !== null) {
    // Check if the difference is significant (>5%)
    const max = Math.max(Math.abs(factA.normalizedValue), Math.abs(factB.normalizedValue));
    const diff = Math.abs(factA.normalizedValue - factB.normalizedValue);
    if (max > 0 && diff / max > 0.05) {
      // Still ask LLM for nuance — it might be a scope/unit difference the normalizer missed
      return askLLMToReconcile(factA, factB);
    }
  }

  // If not a clear deterministic match, ask LLM to reason about it
  return askLLMToReconcile(factA, factB);
}

/**
 * Runs reconciliation for a specific document against all facts in the DB.
 * Now also reconciles within the same document.
 */
export async function runIncrementalReconciliation(documentId: string) {
  // 1. Get all facts for this document
  const newFacts = await prisma.fact.findMany({
    where: { documentId }
  });

  if (newFacts.length === 0) return 0;

  // 2. Get ALL facts (including same document — for intra-doc reconciliation)
  const allFacts = await prisma.fact.findMany();

  if (allFacts.length < 2) return 0;

  let processedCount = 0;
  const MAX_PAIRS = 150; // Cap to avoid very long runs
  let pairsProcessed = 0;

  // 3. Compare each new fact to all other facts
  for (const newFact of newFacts) {
    if (pairsProcessed >= MAX_PAIRS) break;

    for (const otherFact of allFacts) {
      if (pairsProcessed >= MAX_PAIRS) break;
      
      // Don't compare a fact with itself
      if (newFact.id === otherFact.id) continue;

      // Check if they are candidates
      if (!areCandidates(newFact, otherFact)) {
        continue;
      }

      // Check if relationship already exists
      const existingRel = await prisma.relationship.findFirst({
        where: {
          OR: [
            { factAId: newFact.id, factBId: otherFact.id },
            { factAId: otherFact.id, factBId: newFact.id }
          ]
        }
      });

      if (existingRel) continue;

      // Reconcile
      try {
        const result = await reconcilePair(newFact, otherFact);

        // Save to DB
        await prisma.relationship.create({
          data: {
            factAId: newFact.id,
            factBId: otherFact.id,
            relationshipType: result.relationship_type,
            reasoning: result.reasoning,
            confidence: result.confidence
          }
        });

        processedCount++;
        pairsProcessed++;
        console.log(`[Reconciliation] ${result.relationship_type}: "${newFact.predicate}" vs "${otherFact.predicate}" (pair ${pairsProcessed}/${MAX_PAIRS})`);
      } catch (err: any) {
        console.error(`[Reconciliation] Failed to reconcile ${newFact.id} and ${otherFact.id}:`, err.message);
        pairsProcessed++; // Still count it to avoid infinite loops
      }
    }
  }

  console.log(`[Reconciliation] Complete: ${processedCount} relationships created (${pairsProcessed} pairs processed)`);
  return processedCount;
}
