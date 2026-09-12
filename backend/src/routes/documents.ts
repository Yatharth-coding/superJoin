import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db.js';
import { runExtractionPipeline, pipelineEvents, type ProgressEvent } from '../extraction/pipeline.js';
import { runIncrementalReconciliation } from '../reconciliation/engine.js';

const router = Router();

// ─── Multer setup ──────────────────────────────────────────────────────────────
// Store uploads as /backend/uploads/<uuid>.pdf
const uploadsDir = path.resolve('uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadsDir),
  filename: (_req, _file, cb) => {
    const id = uuidv4();
    cb(null, `${id}.pdf`);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// ─── POST /api/documents/upload ────────────────────────────────────────────────
// Returns immediately with the document record, then processes async.

router.post('/upload', upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No PDF file provided. Send a file with field name "file".' });
      return;
    }

    const { originalname, path: filepath } = req.file;

    // Create document record
    const document = await prisma.document.create({
      data: {
        filename: originalname,
        filepath: filepath,
        pageCount: 0, // updated during extraction
        status: 'pending',
      },
    });

    console.log(`[Upload] Document created: ${document.id} (${originalname})`);

    // Return immediately — extraction happens in the background
    res.status(201).json(document);

    // Fire-and-forget: run extraction pipeline, then reconciliation
    runExtractionPipeline(document.id, filepath)
      .then(async () => {
        console.log(`[Upload] Extraction complete for ${document.id}. Starting reconciliation...`);
        try {
          const count = await runIncrementalReconciliation(document.id);
          console.log(`[Upload] Reconciliation complete: ${count} relationships found for ${document.id}`);
        } catch (err) {
          console.error(`[Upload] Reconciliation error for ${document.id}:`, err);
        }
      })
      .catch((err) => {
        console.error(`[Upload] Pipeline error for ${document.id}:`, err);
      });

  } catch (err) {
    console.error('[Upload] Error:', err);
    res.status(500).json({ error: 'Failed to process document', details: (err as Error).message });
  }
});

// ─── GET /api/documents/:id/progress — SSE stream ─────────────────────────────
// Client connects here and receives real-time progress events.

router.get('/:id/progress', async (req: Request, res: Response): Promise<void> => {
  const documentId = req.params.id;
  
  // Check if document exists
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // If already done or error, send final status immediately
  if (doc.status === 'done' || doc.status === 'error') {
    const factCount = await prisma.fact.count({ where: { documentId } });
    res.json({
      documentId,
      stage: doc.status === 'done' ? 'done' : 'error',
      factsExtracted: factCount,
      message: doc.status === 'done' ? `Complete. ${factCount} facts extracted.` : 'Processing failed.',
    });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  // Send initial event
  res.write(`data: ${JSON.stringify({ documentId, stage: 'connected', message: 'Connected to progress stream' })}\n\n`);

  // Listen for progress events
  const onProgress = (event: ProgressEvent) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
    
    // Close connection when done or error
    if (event.stage === 'done' || event.stage === 'error') {
      setTimeout(() => {
        pipelineEvents.off(`progress:${documentId}`, onProgress);
        res.end();
      }, 500);
    }
  };

  pipelineEvents.on(`progress:${documentId}`, onProgress);

  // Clean up on client disconnect
  req.on('close', () => {
    pipelineEvents.off(`progress:${documentId}`, onProgress);
  });
});

// ─── GET /api/documents ────────────────────────────────────────────────────────

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  try {
    const documents = await prisma.document.findMany({
      orderBy: { uploadedAt: 'desc' },
      include: {
        _count: { select: { facts: true } },
      },
    });
    res.json(documents);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch documents', details: (err as Error).message });
  }
});

// ─── GET /api/documents/:id ────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  try {
    const document = await prisma.document.findUnique({
      where: { id: req.params.id },
      include: {
        facts: {
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
          },
        },
      },
    });

    if (!document) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    res.json(document);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch document', details: (err as Error).message });
  }
});

export { router as documentRoutes };
