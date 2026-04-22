/**
 * database.js — Supabase (PostgreSQL) Connection
 *
 * Uses the `pg` (node-postgres) library to connect to Supabase's
 * PostgreSQL database via the connection string from your .env file.
 *
 * Provides a better-sqlite3 compatible wrapper so ALL existing route
 * files work unchanged:
 *   db.prepare(sql).run(a, b, c)   ✅
 *   db.prepare(sql).get(a, b)      ✅
 *   db.prepare(sql).all(a)         ✅
 *   db.exec(sql)                   ✅
 *
 * NOTE: PostgreSQL uses $1, $2, $3... placeholders, not ?
 * The wrapper converts ? → $1 $2 $3 automatically.
 */

const { Pool } = require('pg');

let pool;

async function initDB() {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }   // Required for Supabase
  });

  const client = await pool.connect();
  console.log('✅ Connected to Supabase PostgreSQL');
  client.release();

  await initSchema();
}

async function initSchema() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id       TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        email         TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS projects (
        project_id  TEXT PRIMARY KEY,
        user_id     TEXT NOT NULL,
        title       TEXT NOT NULL,
        description TEXT,
        tech_stack  TEXT,
        status      TEXT DEFAULT 'submitted',
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS files (
        file_id       TEXT PRIMARY KEY,
        project_id    TEXT NOT NULL,
        original_name TEXT NOT NULL,
        object_name   TEXT NOT NULL,
        bucket_name   TEXT NOT NULL,
        file_url      TEXT,
        file_size     INTEGER,
        mime_type     TEXT,
        uploaded_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE
      );
    `);
    console.log('✅ Database schema initialized');
  } finally {
    client.release();
  }
}

// Converts SQLite ? placeholders → PostgreSQL $1 $2 $3
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

function getDB() {
  return {
    exec: async (sql) => {
      const client = await pool.connect();
      try { await client.query(sql); }
      finally { client.release(); }
    },

    prepare: (sql) => {
      const pgSql = convertPlaceholders(sql);
      return {
        run: async (...args) => {
          const client = await pool.connect();
          try { await client.query(pgSql, args.flat()); }
          finally { client.release(); }
        },
        get: async (...args) => {
          const client = await pool.connect();
          try {
            const result = await client.query(pgSql, args.flat());
            return result.rows[0] || null;
          } finally { client.release(); }
        },
        all: async (...args) => {
          const client = await pool.connect();
          try {
            const result = await client.query(pgSql, args.flat());
            return result.rows;
          } finally { client.release(); }
        }
      };
    }
  };
}

module.exports = { initDB, getDB };
