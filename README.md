# Fact Knowledge Layer

A prototype backend and frontend for extracting, normalizing, and reconciling structured facts from financial PDFs. Built as a hiring assignment submission.

## Setup and Run Instructions

### Prerequisites
- Node.js (v18+)
- A Google Gemini API Key

### 1. Installation
Clone the repository and install all dependencies from the root directory:
```bash
git clone [<repo-url>](https://github.com/Yatharth-coding/superJoin.git)
cd starter-datasets
npm install
```

### 2. Environment Setup
Copy the example environment file in the `backend` directory and add your API key:
```bash
cp backend/.env.example backend/.env
```
Edit `backend/.env` and set `GEMINI_API_KEY=your_key_here`.

### 3. Start the Backend
```bash
cd backend
npm start
```
The backend runs on `http://localhost:3000`. It automatically creates a local SQLite database (`dev.db`).

### 4. Start the Frontend
In a new terminal window, start the React Vite frontend:
```bash
cd frontend
npm run dev
```
Open `http://localhost:5173` in your browser.

### 5. Ingest the Starter PDFs
You can use the frontend UI to upload the PDFs one by one. Alternatively, run the ingestion script from the `backend` folder which automatically uploads all 6 PDFs and triggers reconciliation:
```bash
cd backend
npx tsx ingest.ts
```
*(Note: Google Gemini's free tier is limited to 15 requests per minute. The ingestion script and backend automatically back off and wait 45 seconds when hitting rate limits to ensure large 100-page documents succeed without crashing.)*

---

## Video Demo Link

[[Insert Loom/YouTube Video Link Here](https://drive.google.com/drive/folders/1MIDum3wp84R5uRrHFPg3QEw73Ll_8i3D?usp=sharing)]

---

## Approach

### Architecture
```text
[ PDFs ] ---> (Multer/Express) ---> (pdf-parse chunking) ---> (Gemini Flash LLM)
                                                                     |
                                                                     v
(Frontend UI) <--- (Relationships API) <--- (Reconciliation Engine) <--- (SQLite DB)
```

### Key Decisions
1. **Page-level Overlapping Chunking:** Financial tables often span pages. We chunk PDFs by taking 2 pages at a time (1-2, 2-3, 3-4) to ensure no facts are lost at page boundaries.
2. **Deterministic-then-LLM Reconciliation:** Comparing every fact across documents is $O(N^2)$. We built a Two-Stage pipeline:
   - *Deterministic Matching:* We prune candidate pairs using lightweight word-overlap on predicates and subjects. If they match precisely in normalized value/period, we skip the LLM entirely (`CORROBORATED`).
   - *LLM Reasoning:* We only call Gemini for facts that differ, asking it to distinguish between genuine `CONTRADICTION` and differences explained by context (`CONTEXT_RESOLVED`).
3. **SQLite over PostgreSQL:** Used for portability in this prototype so the reviewer can run it instantly without a Docker container or Postgres instance.
4. **Deterministic Normalization:** Extracted currencies and percentages are normalized deterministically in code (e.g., converting "₹ Cr" to billions of INR base units) rather than relying on LLM math, ensuring auditable and reproducible conversions.
5. **Handling Ambiguity:** The schema supports `UNCERTAIN` relationship types. Gemini is strictly instructed to classify discrepancies as `CONTEXT_RESOLVED` if scopes/periods differ, rather than forcing a contradiction.
6. **AI Tools Used:** Cursor/Claude/Gemini was used for rapid scaffolding of the Express boilerplate, Tailwind UI, and regex generation for the currency normalizers.

---

## Limitations and Next Steps

- **Table Extraction Quality:** `pdf-parse` loses structural fidelity on complex multi-column financial tables. Moving to `pdf2json` or Vision-based LLM extraction (sending raw images of pages) would drastically improve table parsing.
- **Semantic Matching:** Currently, fact matching relies on simple string similarity. "Revenue" and "Sales" might not match perfectly. Integrating a lightweight local embedding model (e.g., `all-MiniLM-L6-v2`) would improve recall.
- **Scanned PDFs:** The current approach lacks OCR. Unselectable text in older PDFs will result in 0 extracted facts.
- **Rate Limiting Handling:** Currently, extraction pauses sequentially when the API hits limits. In a production system, this should be offloaded to a true background queue (e.g., BullMQ/Redis) with robust retry mechanisms.

---

## Additional Notes
- The database contains a `/api/facts/:id/flag` endpoint built for "Failure-case tooling" allowing engineers to manually mark mis-extracted facts.
- Check `DECISIONS.md` for a deeper dive into the engineering trade-offs made during development.
