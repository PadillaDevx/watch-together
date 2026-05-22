import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

// Pool is created lazily on first connectWithRetry call
let pool: Pool;
let _db: ReturnType<typeof drizzle<typeof schema>>;

function getPool(): Pool {
  if (!pool) {
    const url = process.env['DATABASE_URL'];
    if (!url) throw new Error('[DB] DATABASE_URL environment variable is not set');
    pool = new Pool({ connectionString: url });
    _db = drizzle(pool, { schema });
  }
  return pool;
}

export function get_db() {
  if (!_db) getPool(); // ensure initialized
  return _db;
}

// Convenience proxy — same API as before
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
  get(_target, prop) {
    return Reflect.get(get_db(), prop);
  },
});

export async function connectWithRetry(retries = 3, delayMs = 2000): Promise<void> {
  const p = getPool();
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const client = await p.connect();
      client.release();
      console.log('[DB] Connected to PostgreSQL');
      return;
    } catch (err) {
      if (attempt === retries) {
        console.error('[DB] All connection attempts failed');
        throw err;
      }
      console.warn(`[DB] Connection attempt ${attempt} failed, retrying in ${delayMs}ms...`);
      await new Promise(res => setTimeout(res, delayMs));
    }
  }
}
