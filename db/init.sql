-- Runs once, when the Docker volume is first created.
-- The table is created by the demo, because its vector size depends on the
-- embedding provider (1536 for OpenAI and Gemini here, 1024 for Voyage).
CREATE EXTENSION IF NOT EXISTS vector;
