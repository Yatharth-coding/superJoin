import prisma from '../db.js';
import { extractPagesFromPDF, chunkPages } from './pdfExtractor.js';
import { extractFactsFromChunk, type ExtractedFact } from './llmExtractor.js';
import { normalizeAll } from '../normalization/normalizers.js';
import { EventEmitter } from 'events';

// Global event emitter for progress updates
export const pipelineEvents = new EventEmitter();
pipelineEvents.setMaxListeners(50);

export interface ProgressEvent {
  documentId: string;
  stage: 'parsing' | 'extracting' | 'normalizing' | 'saving' | 'reconciling' | 'done' | 'error';
  chunksTotal?: number;
  chunksProcessed?: number;
  factsExtracted?: number;
  message: string;
}

function emitProgress(event: ProgressEvent) {
  pipelineEvents.emit(`progress:${event.documentId}`, event);
  console.log(`[Pipeline] [${event.stage}] ${event.message}`);
}

/**
 * Orchestrates the full fact extraction pipeline for a document:
 * 1. Extract text per page from the PDF
 * 2. Chunk pages into overlapping groups
 * 3. Call Gemini for each chunk to extract facts (with concurrency)
 * 4. Normalize facts (currency, percentage, dates)
 * 5. Deduplicate facts from overlapping chunks
 * 6. Persist to database
 */
export async function runExtractionPipeline(documentId: string, filepath: string): Promise<void> {
  // Update status to processing
  await prisma.document.update({
    where: { id: documentId },
    data: { status: 'processing' },
  });

  try {
    // Step 1: Extract text per page
    emitProgress({ documentId, stage: 'parsing', message: 'Extracting text from PDF...' });
    const pages = await extractPagesFromPDF(filepath);
    
    // Update page count
    await prisma.document.update({
      where: { id: documentId },
      data: { pageCount: pages.length },
    });
    
    emitProgress({ documentId, stage: 'parsing', message: `Extracted ${pages.length} pages` });

    if (pages.length === 0) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'done' },
      });
      emitProgress({ documentId, stage: 'done', factsExtracted: 0, message: 'No pages found in PDF' });
      return;
    }

    // Step 2: Chunk pages — larger chunks (5 pages, step 4) to reduce API calls
    const CHUNK_SIZE = 5;
    const chunks = chunkPages(pages, CHUNK_SIZE);
    emitProgress({ 
      documentId, stage: 'extracting', 
      chunksTotal: chunks.length, chunksProcessed: 0, factsExtracted: 0,
      message: `Created ${chunks.length} chunks from ${pages.length} pages` 
    });

    // Step 3: Extract facts from each chunk — sequential with rate limiting
    // (parallel would hammer the API and cause 429s)
    const allFacts: ExtractedFact[] = [];
    const CONCURRENCY = 2; // Process 2 chunks at a time
    
    for (let i = 0; i < chunks.length; i += CONCURRENCY) {
      const batch = chunks.slice(i, i + CONCURRENCY);
      const batchPromises = batch.map((chunk, batchIdx) => {
        const chunkIdx = i + batchIdx;
        return extractFactsFromChunk(chunk, documentId).then(facts => {
          console.log(
            `[Pipeline] Chunk ${chunkIdx + 1}/${chunks.length} (pages ${chunk.map(p => p.pageNumber).join(',')}) → ${facts.length} facts`
          );
          return facts;
        });
      });

      const batchResults = await Promise.all(batchPromises);
      for (const facts of batchResults) {
        allFacts.push(...facts);
      }

      emitProgress({
        documentId, stage: 'extracting',
        chunksTotal: chunks.length,
        chunksProcessed: Math.min(i + CONCURRENCY, chunks.length),
        factsExtracted: allFacts.length,
        message: `Processed ${Math.min(i + CONCURRENCY, chunks.length)}/${chunks.length} chunks (${allFacts.length} facts so far)`
      });
    }

    // Step 4: Normalize all facts
    emitProgress({ documentId, stage: 'normalizing', factsExtracted: allFacts.length, message: `Normalizing ${allFacts.length} facts...` });
    const normalizedFacts = allFacts.map(normalizeAll);

    // Step 5: Deduplicate facts from overlapping chunks
    // Two facts are duplicates if they share the same evidence_quote and source_page
    const seen = new Set<string>();
    const uniqueFacts = normalizedFacts.filter((fact) => {
      // Use a composite key: page + truncated evidence quote (to handle slight LLM variations)
      const page = fact.sourcePage ?? fact.source_page;
      const quote = (fact.evidenceQuote ?? fact.evidence_quote ?? '').slice(0, 80);
      const key = `${page}::${fact.subject}::${fact.predicate}::${quote}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    emitProgress({ 
      documentId, stage: 'saving', 
      factsExtracted: uniqueFacts.length,
      message: `${normalizedFacts.length} → ${uniqueFacts.length} facts after dedup. Saving to database...` 
    });

    // Step 6: Persist to database
    for (const fact of uniqueFacts) {
      try {
        await prisma.fact.create({
          data: {
            id: fact.id,
            subject: fact.subject,
            predicate: fact.predicate,
            rawValue: fact.raw_value ?? null,
            rawUnit: fact.raw_unit ?? null,
            normalizedValue: fact.normalizedValue ?? fact.normalized_value ?? null,
            normalizedUnit: fact.normalizedUnit ?? fact.normalized_unit ?? null,
            periodStart: fact.periodStart ?? fact.period_start ?? null,
            periodEnd: fact.periodEnd ?? fact.period_end ?? null,
            scope: fact.scope ?? null,
            sourcePage: fact.source_page,
            evidenceQuote: fact.evidence_quote,
            confidence: fact.confidence,
            extractionNotes: fact.extraction_notes ?? null,
            raw: fact.raw,
            documentId: documentId,
          }
        });
      } catch (err) {
        // Ignore duplicate key errors if any
      }
    }

    // Mark as done
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'done' },
    });

    emitProgress({ 
      documentId, stage: 'done', 
      factsExtracted: uniqueFacts.length,
      message: `Done! ${uniqueFacts.length} facts persisted for document ${documentId}` 
    });
  } catch (err) {
    console.error(`[Pipeline] Error processing document ${documentId}:`, err);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'error' },
    });
    emitProgress({ 
      documentId, stage: 'error', 
      message: `Error: ${(err as Error).message}` 
    });
    throw err;
  }
}
