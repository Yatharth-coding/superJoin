import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../db.js';
import { runExtractionPipeline } from '../extraction/pipeline.js';

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

    // Run extraction pipeline synchronously (prototype — no background jobs)
    await runExtractionPipeline(document.id, filepath);

    // Return the completed document with facts
    const result = await prisma.document.findUnique({
      where: { id: document.id },
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

    res.status(201).json(result);
  } catch (err) {
    console.error('[Upload] Error:', err);
    res.status(500).json({ error: 'Failed to process document', details: (err as Error).message });
  }
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
