# Engineering Decisions Log

## 1. Prisma + SQLite over raw SQL

**Decision**: Use Prisma ORM with SQLite.

**Why**: Prisma gives us type-safe database access with minimal boilerplate. SQLite
is file-based (zero-config) — perfect for a prototype that needs to "just work" on
any dev machine without Docker or a running database server. Migration to PostgreSQL
later is a one-line datasource change.

## 2. Predicates as free-text strings, NOT enums

**Decision**: Store `predicate` as a plain `String` column, not a Prisma `enum` or
lookup table.

**Why**: The system must generalize to any PDF domain. Hardcoding predicates like
`revenue_from_services` means every new document type requires a schema migration.
Free-text predicates let the LLM create new fact types on the fly (e.g. `gdp_growth_rate`
from a macro PDF, or `employee_count` from an HR report). We add an index on `predicate`
for query performance, but no foreign-key constraint.

## 3. Page-level chunking over whole-document extraction

**Decision**: Extract text per page and send 2-page overlapping chunks to the LLM.

**Why**: Whole-document extraction loses page provenance — we'd have no `source_page`
for each fact. Page-level extraction preserves traceability. We use 2-page overlapping
windows (pages [1,2], [2,3], [3,4]…) because tables and context often span page
boundaries. Deduplication on the overlap is handled at persist time by checking for
duplicate evidence_quote + source_page pairs.

## 4. pdf-parse over pdfjs-dist

**Decision**: Use `pdf-parse` for text extraction.

**Why**: `pdf-parse` wraps `pdfjs-dist` internally but provides a simpler Node.js API
with a per-page text callback. We avoid the complexity of managing pdfjs workers and
canvas rendering on the server. Trade-off: less control over rendering, but sufficient
for text-heavy documents.

## 5. Synchronous extraction (no job queue)

**Decision**: The upload endpoint runs extraction synchronously and returns when done.

**Why**: This is a prototype. Adding Bull/Redis or a job queue adds infrastructure
complexity without proportional value at this stage. For a production system, we'd
queue extraction and return a job ID immediately.

## 6. Deterministic normalization separate from LLM

**Decision**: Currency/date/percentage normalization runs as post-processing code,
NOT as additional LLM calls.

**Why**: Normalization rules are deterministic (1 crore = 10,000,000). Running them
in code is faster, cheaper, auditable, and reproducible. LLM-based normalization
would be non-deterministic and harder to debug when values are wrong.

### Fact Extraction & Normalization
- Extracted facts are modeled with a dynamic predicate (e.g. `revenue_from_services`) rather than a hardcoded enum. This allows the system to flexibly adapt to new documents.
- Value normalization strips commas and normalizes units into standard base formats (e.g. `INR` instead of `Rs. Cr` with numbers multiplied appropriately) using a deterministic rules engine.

## 7. Cross-Document Comparison (Reconciliation)

**Goal:** Compare facts across documents to determine if they corroborate, contradict, or are resolved by context.

**Decision: Two-Stage Hybrid Approach (Deterministic + LLM)**

Comparing every fact against every other fact scales terribly ($O(N^2)$). Calling an LLM for all those pairs is too slow, too expensive, and prone to hallucinations on unrelated data.

To solve this, we implemented a **Two-Stage Pipeline**:
1. **Deterministic Candidate Matching:** Facts are evaluated using a lightweight word-overlap algorithm on their `subject` and `predicate`. If they aren't similar (e.g., comparing "Revenue" to "Employee Headcount"), they are instantly discarded.
2. **Deterministic Shortcut:** If candidate facts match precisely on normalized values, periods, and scope, they are instantly marked as `CORROBORATED` without an LLM call.
3. **LLM Reasoning Fallback:** If facts have different values or scopes, we pass them to Gemini to reason whether it's a genuine `CONTRADICTION` or `CONTEXT_RESOLVED` (e.g., Q3 vs FY24). 

*Trade-off:* We lose some semantic matching capability by not using vector embeddings (e.g., "Sales" vs "Revenue" might miss in a pure string-overlap), but it's drastically cheaper and faster for a prototype. We also save heavily on LLM costs by pruning unrelated pairs and skipping obvious matches.

**Incremental Processing**
Reconciliation runs selectively via `POST /api/documents/:id/reconcile`. It only compares the newly uploaded document's facts against existing documents in the database and skips pairs that already have an existing relationship record.

## 8. Dates as ISO strings, not SQLite integers

**Decision**: Store `periodStart`/`periodEnd` as nullable `String` columns.

**Why**: SQLite has no native DATE type. Storing ISO 8601 strings (`2023-04-01`) is
human-readable in debug queries, sorts correctly lexicographically, and avoids
Unix-timestamp confusion. Prisma's `DateTime` for SQLite auto-converts to strings
anyway, but explicit `String` makes the intent clear.
