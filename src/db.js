import pg from 'pg'
import pgvector from 'pgvector/pg'

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5433/postgres',
  // Runs, and is awaited, on every new connection before it is handed out:
  // teaches node-postgres to read the vector type.
  onConnect: async (client) => pgvector.registerTypes(client),
})

// Without a listener an idle connection dropped by Postgres (restart, OOM) crashes the process.
pool.on('error', (err) => console.error('Postgres pool error:', err.message))

export const toSql = pgvector.toSql
