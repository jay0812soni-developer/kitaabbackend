import { pool } from './db.js';

/** Idempotent column/index extras for modern recovery lockout */
export async function ensureSchemaExtras() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE kitaab.jewellers
      ADD COLUMN IF NOT EXISTS recovery_fails INT NOT NULL DEFAULT 0
    `);
  } catch (e) {
    // TiDB / older PG may not support IF NOT EXISTS on ADD COLUMN
    try {
      await client.query(
        `ALTER TABLE kitaab.jewellers ADD COLUMN recovery_fails INT NOT NULL DEFAULT 0`
      );
    } catch (e2) {
      if (!String(e2.message || '').toLowerCase().includes('duplicate') &&
          !String(e2.message || '').toLowerCase().includes('already exists')) {
        console.warn('recovery_fails column:', e2.message);
      }
    }
  } finally {
    client.release();
  }
}
