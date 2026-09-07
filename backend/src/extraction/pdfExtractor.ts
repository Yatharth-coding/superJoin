import fs from 'fs';
// @ts-ignore — pdf-parse has no type declarations
import pdfParse from 'pdf-parse';

/**
 * Represents the extracted text from a single PDF page.
 */
export interface PageText {
  pageNumber: number; // 1-indexed
  text: string;
}

/**
 * Extracts text from a PDF file, page by page.
 *
 * Uses pdf-parse's pagerender callback to capture text per page.
 * Returns an array of { pageNumber, text } objects.
 */
export async function extractPagesFromPDF(filepath: string): Promise<PageText[]> {
  const dataBuffer = fs.readFileSync(filepath);
  const pages: PageText[] = [];

  // pdf-parse calls pagerender for each page. We use the built-in text extraction
  // but capture it per-page by hooking into the render callback.
  // The pageData object exposes getTextContent() for each page.
  const options = {
    // Custom page renderer that extracts text from each page individually
    pagerender: async (pageData: any) => {
      const textContent = await pageData.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      pages.push({
        pageNumber: pageData.pageNumber, // 1-indexed in pdf.js
        text: pageText,
      });

      // Return the text so pdf-parse doesn't complain
      return pageText;
    },
  };

  const parsed = await pdfParse(dataBuffer, options);

  // Sort by page number (should already be in order, but be safe)
  pages.sort((a, b) => a.pageNumber - b.pageNumber);

  return pages;
}

/**
 * Groups pages into overlapping chunks of `chunkSize` pages.
 * Overlaps by 1 page to handle content split across page boundaries.
 *
 * Example with chunkSize=2 and 5 pages:
 *   Chunk 1: pages [1, 2]
 *   Chunk 2: pages [2, 3]
 *   Chunk 3: pages [3, 4]
 *   Chunk 4: pages [4, 5]
 */
export function chunkPages(pages: PageText[], chunkSize: number = 2): PageText[][] {
  if (pages.length === 0) return [];
  if (pages.length <= chunkSize) return [pages];

  const chunks: PageText[][] = [];
  // Step by (chunkSize - 1) to create 1-page overlap
  const step = Math.max(1, chunkSize - 1);

  for (let i = 0; i < pages.length; i += step) {
    const chunk = pages.slice(i, i + chunkSize);
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    // If the chunk reached the end, stop
    if (i + chunkSize >= pages.length) break;
  }

  return chunks;
}
