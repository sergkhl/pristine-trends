# Agent overrides

## Database migrations

- **`supabase/migrations/001_schema.sql`** is the **initial, fully complete** schema for a fresh database. Treat it as the canonical “from zero” definition: new tables, columns, indexes, and constraints that belong in the baseline should be reflected here so a new environment matches production intent in one file.

- **When you need to change the database structure** (after `001` exists), **add a new numbered migration file** (e.g. `002_*.sql`, `003_*.sql`) with only the **delta**—`ALTER TABLE`, new objects, data backfills, etc. Do **not** strip or hollow out `001_schema.sql` in favor of only incremental files; keep `001` complete for greenfield setups.
