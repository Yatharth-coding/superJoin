import { execSync } from 'child_process';
import path from 'path';

const datasets = [
  '../starter-datasets/delhivery/01-delhivery-prospectus-2022-excerpt.pdf',
  '../starter-datasets/delhivery/02-delhivery-annual-report-fy24-excerpt.pdf',
  '../starter-datasets/delhivery/03-delhivery-q4-fy24-earnings-presentation.pdf',
  '../starter-datasets/india-macroeconomy/01-india-economic-survey-2024-25-excerpt.pdf',
  '../starter-datasets/india-macroeconomy/02-rbi-annual-report-2024-25-excerpt.pdf',
  '../starter-datasets/india-macroeconomy/03-imf-india-2025-article-iv-consultation.pdf'
];

async function run() {
  console.log('Starting ingestion of 6 datasets...');
  for (const pdf of datasets) {
    console.log(`\n========================================`);
    console.log(`Uploading: ${pdf}`);
    try {
      const uploadCmd = `curl.exe -s -X POST http://localhost:3000/api/documents/upload -F "file=@${pdf}"`;
      const responseStr = execSync(uploadCmd, { encoding: 'utf-8' });
      const doc = JSON.parse(responseStr);
      console.log(`Done! Document ID: ${doc.id}`);
      console.log(`Extracted Facts: ${doc.facts ? doc.facts.length : 0}`);

      console.log(`Reconciling facts for ${doc.id}...`);
      const reconcileCmd = `curl.exe -s -X POST http://localhost:3000/api/documents/${doc.id}/reconcile`;
      const reconcileStr = execSync(reconcileCmd, { encoding: 'utf-8' });
      const rec = JSON.parse(reconcileStr);
      console.log(`Reconciliation result:`, rec);

    } catch (e: any) {
      console.error(`Error processing ${pdf}:`, e.message);
    }
  }
  console.log('\nIngestion Complete.');
}

run();
