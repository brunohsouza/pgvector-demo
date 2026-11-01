import pg from 'pg'
import pgvector from 'pgvector/pg'

export const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres',
  // Runs, and is awaited, on every new connection before it is handed out:
  // teaches node-postgres to read the vector type.
  onConnect: async (client) => pgvector.registerTypes(client),
})

export const toSql = pgvector.toSql
