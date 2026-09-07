import prisma from '../db.js';
import { extractPagesFromPDF, chunkPages } from './pdfExtractor.js';
import { extractFactsFromChunk, type ExtractedFact } from './llmExtractor.js';
import { normalizeAll } from '../normalization/normalizers.js';

/**
 * Orchestrates the full fact extraction pipeline for a document:
 * 1. Extract text per page from the PDF
 * 2. Chunk pages into overlapping groups
 * 3. Call Claude for each chunk to extract facts
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
    console.log(`[Pipeline] Extracting text from PDF...`);
    const pages = await extractPagesFromPDF(filepath);
    console.log(`[Pipeline] Extracted ${pages.length} pages`);

    // Update page count
    await prisma.document.update({
      where: { id: documentId },
      data: { pageCount: pages.length },
    });

    if (pages.length === 0) {
      await prisma.document.update({
        where: { id: documentId },
        data: { status: 'done' },
      });
      return;
    }

    // Step 2: Chunk pages (groups of 2 with overlap)
    const chunks = chunkPages(pages, 2);
    console.log(`[Pipeline] Created ${chunks.length} chunks`);

    // Step 3: Extract facts from each chunk via Claude
    const allFacts: ExtractedFact[] = [];
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(
        `[Pipeline] Processing chunk ${i + 1}/${chunks.length} (pages ${chunk.map((p) => p.pageNumber).join(', ')})`
      );
      const facts = await extractFactsFromChunk(chunk, documentId);
      console.log(`[Pipeline] Extracted ${facts.length} facts from chunk ${i + 1}`);
      allFacts.push(...facts);
    }

    // Step 4: Normalize all facts
    console.log(`[Pipeline] Normalizing ${allFacts.length} facts...`);
    const normalizedFacts = allFacts.map(normalizeAll);

    // Step 5: Deduplicate facts from overlapping chunks
    // Two facts are duplicates if they share the same evidence_quote and source_page
    const seen = new Set<string>();
    const uniqueFacts = normalizedFacts.filter((fact) => {
      const key = `${fact.sourcePage ?? fact.source_page}::${fact.evidenceQuote ?? fact.evidence_quote}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    console.log(`[Pipeline] ${normalizedFacts.length} → ${uniqueFacts.length} facts after dedup`);

    // Step 6: Persist to database
    for (const fact of uniqueFacts) {
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
        },
      });
    }

    // Mark as done
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'done' },
    });

    console.log(`[Pipeline] Done. ${uniqueFacts.length} facts persisted for document ${documentId}`);
  } catch (err) {
    console.error(`[Pipeline] Error processing document ${documentId}:`, err);
    await prisma.document.update({
      where: { id: documentId },
      data: { status: 'error' },
    });
    throw err;
  }
}
