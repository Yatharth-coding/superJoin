import { execSync } from 'child_process';

const datasets = [
  '../starter-datasets/delhivery/03-delhivery-q4-fy24-earnings-presentation.pdf',
  '../starter-datasets/delhivery/02-delhivery-annual-report-fy24-excerpt.pdf'
];

async function run() {
  console.log('Starting ingestion of 2 datasets...');
  for (const pdf of datasets) {
    console.log(`\n========================================`);
    console.log(`Uploading: ${pdf}`);
    try {
      const uploadCmd = `curl.exe -s -X POST http://localhost:3000/api/documents/upload -F "file=@${pdf}"`;
      const responseStr = execSync(uploadCmd, { encoding: 'utf-8' });
      const doc = JSON.parse(responseStr);
      console.log(`Upload started! Document ID: ${doc.id}`);

      // Poll until status is 'done' or 'error'
      let isDone = false;
      while (!isDone) {
        const statusCmd = `curl.exe -s http://localhost:3000/api/documents/${doc.id}`;
        const statusStr = execSync(statusCmd, { encoding: 'utf-8' });
        const docStatus = JSON.parse(statusStr);
        console.log(`Status: ${docStatus.status}...`);
        if (docStatus.status === 'done' || docStatus.status === 'error') {
          isDone = true;
          console.log(`Extraction complete with status: ${docStatus.status}. Extracted ${docStatus.facts?.length || 0} facts.`);
        } else {
          // wait 5 seconds
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      }
    } catch (e: any) {
      console.error(`Error processing ${pdf}:`, e.message);
    }
  }
  console.log('\nIngestion Complete.');
}

run();
