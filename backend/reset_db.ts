import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function reset() {
  console.log('Resetting database...');
  
  // Delete in order: relationships → facts → documents
  const delRels = await prisma.relationship.deleteMany();
  console.log(`Deleted ${delRels.count} relationships`);
  
  const delFacts = await prisma.fact.deleteMany();
  console.log(`Deleted ${delFacts.count} facts`);
  
  const delDocs = await prisma.document.deleteMany();
  console.log(`Deleted ${delDocs.count} documents`);
  
  console.log('Database reset complete. Ready for fresh uploads.');
  await prisma.$disconnect();
}

reset();
