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

## 7. Dates as ISO strings, not SQLite integers

**Decision**: Store `periodStart`/`periodEnd` as nullable `String` columns.

**Why**: SQLite has no native DATE type. Storing ISO 8601 strings (`2023-04-01`) is
human-readable in debug queries, sorts correctly lexicographically, and avoids
Unix-timestamp confusion. Prisma's `DateTime` for SQLite auto-converts to strings
anyway, but explicit `String` makes the intent clear.
