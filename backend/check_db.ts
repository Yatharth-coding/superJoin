import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

async function main() {
  const facts = await p.fact.count();
  const docs = await p.document.count();
  const rels = await p.relationship.count();
  const relTypes = await p.relationship.groupBy({ by: ['relationshipType'], _count: true });
  const docList = await p.document.findMany({
    select: { id: true, filename: true, status: true, pageCount: true, _count: { select: { facts: true } } }
  });
  console.log(JSON.stringify({ facts, docs, rels, relTypes, docList }, null, 2));
  await p.$disconnect();
}

main();
