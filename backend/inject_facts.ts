import prisma from './src/db.js';
import { v4 as uuidv4 } from 'uuid';
import { runIncrementalReconciliation } from './src/reconciliation/engine.js';

async function run() {
  console.log('Injecting test facts...');
  
  // 1. Create a dummy document for Annual Report
  const doc = await prisma.document.create({
    data: {
      id: 'dummy-doc-123',
      filename: '02-delhivery-annual-report-fy24-excerpt.pdf',
      filepath: 'fake/path.pdf',
      pageCount: 10,
      status: 'done'
    }
  });

  // 2. Insert facts
  await prisma.fact.createMany({
    data: [
      {
        id: `fact_${uuidv4()}`,
        documentId: doc.id,
        subject: 'Delhivery Limited',
        predicate: 'revenue_growth_yoy',
        rawValue: '30%',
        rawUnit: '%',
        normalizedValue: 0.3,
        normalizedUnit: 'ratio',
        periodStart: '2023-04-01',
        periodEnd: '2024-03-31',
        scope: 'segment: PTL',
        sourcePage: 12,
        evidenceQuote: 'PTL segment revenue grew by exactly 30% YoY in FY24.',
        confidence: 0.99,
        raw: '{}'
      },
      {
        id: `fact_${uuidv4()}`,
        documentId: doc.id,
        subject: 'Delhivery Limited',
        predicate: 'net_working_capital_days',
        rawValue: '45',
        rawUnit: 'days',
        normalizedValue: 45,
        normalizedUnit: 'days',
        periodStart: '2022-04-01',
        periodEnd: '2023-03-31',
        scope: null,
        sourcePage: 15,
        evidenceQuote: 'Net working capital days stood at 45 days for FY23.',
        confidence: 0.95,
        raw: '{}'
      },
      {
        id: `fact_${uuidv4()}`,
        documentId: doc.id,
        subject: 'Delhivery Limited',
        predicate: 'pat_loss_reduction',
        rawValue: '500',
        rawUnit: 'Rs. Cr',
        normalizedValue: 5000000000,
        normalizedUnit: 'INR',
        periodStart: '2021-04-01',
        periodEnd: '2022-03-31', // Different period
        scope: null,
        sourcePage: 16,
        evidenceQuote: 'PAT loss reduced by 500 Cr in FY22.',
        confidence: 0.9,
        raw: '{}'
      }
    ]
  });

  console.log('Facts inserted. Running reconciliation...');
  await runIncrementalReconciliation(doc.id);
  
  const rels = await prisma.relationship.findMany({
    include: {
      factA: true, factB: true
    }
  });
  
  for (const r of rels) {
    console.log(`\n=== ${r.relationshipType} ===`);
    console.log(`ID: ${r.id}`);
    console.log(`Reason: ${r.reasoning}`);
  }
}

run();
