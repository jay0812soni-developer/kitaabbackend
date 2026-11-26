import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schema = fs.readFileSync(path.join(__dirname, '..', '..', 'db', 'schema.sql'), 'utf8');
const client = await pool.connect();
try {
  await client.query(schema);
  const tables = await client.query(
    `SELECT table_schema, table_name FROM information_schema.tables
     WHERE table_schema = 'kitaab' ORDER BY table_name`
  );
  console.log('Tables:', tables.rows.map((r) => r.table_name).join(', '));
  console.log('Schema OK');
} finally {
  client.release();
  await pool.end();
}
