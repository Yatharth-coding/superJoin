import { Router, type Request, type Response } from 'express';
import prisma from '../db.js';

const router = Router();

// ─── GET /api/facts ────────────────────────────────────────────────────────────
// Query filters (all optional, combinable):
//   ?document_id=<id>
//   ?predicate=<predicate>
//   ?subject=<subject>

router.get('/', async (req: Request, res: Response): Promise<void> => {
  try {
    const { document_id, predicate, subject } = req.query;

    const where: any = {};
    if (document_id && typeof document_id === 'string') {
      where.documentId = document_id;
    }
    if (predicate && typeof predicate === 'string') {
      where.predicate = { contains: predicate };
    }
    if (subject && typeof subject === 'string') {
      where.subject = { contains: subject };
    }

    const facts = await prisma.fact.findMany({
      where,
      orderBy: [{ documentId: 'asc' }, { sourcePage: 'asc' }],
      select: {
        id: true,
        subject: true,
        predicate: true,
        rawValue: true,
        rawUnit: true,
        normalizedValue: true,
        normalizedUnit: true,
        periodStart: true,
        periodEnd: true,
        scope: true,
        sourcePage: true,
        evidenceQuote: true,
        confidence: true,
        extractionNotes: true,
        documentId: true,
        document: {
          select: {
            filename: true,
          },
        },
      },
    });

    res.json({
      count: facts.length,
      facts,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch facts', details: (err as Error).message });
  }
});

export { router as factRoutes };
