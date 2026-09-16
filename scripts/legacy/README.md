# Legacy one-off migrations (Supabase era)

These scripts were run once against the old hosted database and are kept only for reference.
Everything they did is now part of `src/lib/db.js → initSchema()` and `scripts/bootstrap-db.js`.
They talk to PostgreSQL directly and will not work with the SQLite driver. Do not run them on a new database.
