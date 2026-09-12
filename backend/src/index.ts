import 'dotenv/config';
import express from 'express';
import { runIncrementalReconciliation } from './reconciliation/engine.js';
import cors from 'cors';
import { documentRoutes } from './routes/documents.js';
import { factRoutes } from './routes/facts.js';
import prisma from './db.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Routes
app.use('/api/documents', documentRoutes);
app.use('/api/facts', factRoutes);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Reconciliation & Relationship Endpoints ─────────────────────────────────

app.post('/api/documents/:id/reconcile', async (req, res) => {
  try {
    const documentId = req.params.id;
    const document = await prisma.document.findUnique({ where: { id: documentId } });
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const count = await runIncrementalReconciliation(documentId);
    res.json({ success: true, message: `Reconciled ${count} new relationship pairs.` });
  } catch (error: any) {
    console.error('Reconciliation error:', error);
    res.status(500).json({ error: 'Failed to reconcile facts', details: error.message });
  }
});

app.get('/api/relationships', async (req, res) => {
  try {
    const type = req.query.type as string;
    const relationships = await prisma.relationship.findMany({
      where: type ? { relationshipType: type } : undefined,
      include: {
        factA: { 
          select: { 
            subject: true, predicate: true, rawValue: true, rawUnit: true,
            normalizedValue: true, normalizedUnit: true,
            periodStart: true, periodEnd: true, scope: true,
            sourcePage: true, evidenceQuote: true, confidence: true,
            documentId: true,
            document: { select: { filename: true } }
          } 
        },
        factB: { 
          select: { 
            subject: true, predicate: true, rawValue: true, rawUnit: true,
            normalizedValue: true, normalizedUnit: true,
            periodStart: true, periodEnd: true, scope: true,
            sourcePage: true, evidenceQuote: true, confidence: true,
            documentId: true,
            document: { select: { filename: true } }
          } 
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(relationships);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch relationships' });
  }
});

app.get('/api/relationships/:id', async (req, res) => {
  try {
    const relationship = await prisma.relationship.findUnique({
      where: { id: req.params.id },
      include: {
        factA: { include: { document: true } },
        factB: { include: { document: true } }
      }
    });
    if (!relationship) return res.status(404).json({ error: 'Not found' });
    res.json(relationship);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch relationship' });
  }
});

// ─── Required Cases — dynamic lookup ──────────────────────────────────────────
// Returns one example of each relationship type, plus a low-confidence/flagged fact

app.get('/api/required-cases', async (_req, res) => {
  try {
    const types = ['CORROBORATED', 'CONTRADICTION', 'CONTEXT_RESOLVED', 'UNCERTAIN'];
    const cases: Record<string, any> = {};

    for (const type of types) {
      const rel = await prisma.relationship.findFirst({
        where: { relationshipType: type },
        include: {
          factA: { include: { document: true } },
          factB: { include: { document: true } }
        },
        orderBy: { confidence: 'desc' }
      });
      cases[type] = rel || null;
    }

    // Find an extraction failure — low confidence or flagged fact
    const failureFact = await prisma.fact.findFirst({
      where: {
        OR: [
          { isFlagged: true },
          { confidence: { lt: 0.6 } },
          { extractionNotes: { not: null } }
        ]
      },
      include: { document: true },
      orderBy: { confidence: 'asc' }
    });

    cases['EXTRACTION_FAILURE'] = failureFact || null;

    res.json(cases);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch required cases' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const factCount = await prisma.fact.count();
    const docCount = await prisma.document.count();
    const flagsCount = await prisma.fact.count({ where: { isFlagged: true } });
    
    // Group relationships by type
    const relStats = await prisma.relationship.groupBy({
      by: ['relationshipType'],
      _count: true
    });

    // Document status breakdown
    const docStatuses = await prisma.document.groupBy({
      by: ['status'],
      _count: true
    });

    // Recent documents
    const recentDocs = await prisma.document.findMany({
      orderBy: { uploadedAt: 'desc' },
      take: 10,
      include: { _count: { select: { facts: true } } }
    });

    res.json({
      documents: docCount,
      facts: factCount,
      flaggedFacts: flagsCount,
      relationships: relStats.reduce((acc, curr) => {
        acc[curr.relationshipType] = curr._count;
        return acc;
      }, {} as Record<string, number>),
      documentStatuses: docStatuses.reduce((acc, curr) => {
        acc[curr.status] = curr._count;
        return acc;
      }, {} as Record<string, number>),
      recentDocuments: recentDocs
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.post('/api/facts/:id/flag', async (req, res) => {
  try {
    const { reason } = req.body;
    const fact = await prisma.fact.update({
      where: { id: req.params.id },
      data: { isFlagged: true, flagReason: reason || 'Manually flagged' }
    });
    res.json({ success: true, fact });
  } catch (error) {
    res.status(500).json({ error: 'Failed to flag fact' });
  }
});
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
