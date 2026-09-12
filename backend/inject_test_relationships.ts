import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();

async function run() {
  const docs = await prisma.document.findMany();
  if (docs.length === 0) return;
  const docId = docs[0].id;

  // Insert two conflicting facts
  const factA = await prisma.fact.create({
    data: {
      id: `fact_${uuidv4()}`,
      documentId: docId,
      subject: 'Delhivery Limited',
      predicate: 'total_revenue',
      rawValue: '2000',
      rawUnit: 'Cr',
      normalizedValue: 20000000000,
      normalizedUnit: 'INR',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      scope: 'consolidated',
      sourcePage: 10,
      evidenceQuote: 'Total revenue was 2000 Cr.',
      confidence: 1.0,
      raw: '{}'
    }
  });

  const factB = await prisma.fact.create({
    data: {
      id: `fact_${uuidv4()}`,
      documentId: docId,
      subject: 'Delhivery Limited',
      predicate: 'total_revenue_from_operations',
      rawValue: '1500',
      rawUnit: 'Cr',
      normalizedValue: 15000000000,
      normalizedUnit: 'INR',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      scope: 'consolidated',
      sourcePage: 12,
      evidenceQuote: 'Revenue from operations reported at 1500 Cr.',
      confidence: 1.0,
      raw: '{}'
    }
  });

  const factC = await prisma.fact.create({
    data: {
      id: `fact_${uuidv4()}`,
      documentId: docId,
      subject: 'Delhivery Limited',
      predicate: 'total_revenue',
      rawValue: '1500',
      rawUnit: 'Cr',
      normalizedValue: 15000000000,
      normalizedUnit: 'INR',
      periodStart: '2022-04-01',
      periodEnd: '2023-03-31', // Different period -> Context resolved
      scope: 'consolidated',
      sourcePage: 13,
      evidenceQuote: 'Last year revenue was 1500 Cr.',
      confidence: 1.0,
      raw: '{}'
    }
  });

  // Create relationships manually to bypass rate limit for demonstration
  await prisma.relationship.create({
    data: {
      factAId: factB.id,
      factBId: factC.id,
      relationshipType: 'CONTEXT_RESOLVED',
      reasoning: 'Different periods: FY23 vs FY24',
      confidence: 0.95
    }
  });

  await prisma.relationship.create({
    data: {
      factAId: factA.id,
      factBId: factB.id,
      relationshipType: 'CONTRADICTION',
      reasoning: 'Contradicting revenue numbers for the same period and scope.',
      confidence: 0.95
    }
  });

  const factD = await prisma.fact.create({
    data: {
      id: `fact_${uuidv4()}`,
      documentId: docId,
      subject: 'Delhivery Limited',
      predicate: 'revenue_total',
      rawValue: '2000',
      rawUnit: 'Cr',
      normalizedValue: 20000000000,
      normalizedUnit: 'INR',
      periodStart: '2023-04-01',
      periodEnd: '2024-03-31',
      scope: 'consolidated',
      sourcePage: 15,
      evidenceQuote: 'Total revenue of the company is 2000 Cr.',
      confidence: 1.0,
      raw: '{}'
    }
  });

  await prisma.relationship.create({
    data: {
      factAId: factA.id,
      factBId: factD.id,
      relationshipType: 'CORROBORATED',
      reasoning: 'Both facts agree on the exact same revenue number for the same period and scope.',
      confidence: 0.99
    }
  });

  console.log('Test facts and relationships injected.');
}

run()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
