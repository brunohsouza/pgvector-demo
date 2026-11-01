-- Runs once, when the Docker volume is first created.
-- The table is created by the demo, because its vector size depends on the
-- embedding provider (see the providers table in src/embed.js).
CREATE EXTENSION IF NOT EXISTS vector;
