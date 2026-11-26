/**
 * Import InfinityFree dump into kitaab.* schema.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import he from 'he';
import { pool, query } from '../src/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dumpPath =
  process.argv[2] || path.join(__dirname, '..', '..', 'if0_39278499_ledger.sql');

function unescape(s) {
  if (s == null) return s;
  return he.decode(String(s));
}

function parseValuesBlob(sql, table) {
  const marker = `INSERT INTO \`${table}\``;
  const start = sql.indexOf(marker);
  if (start < 0) return [];
  const valuesIdx = sql.indexOf('VALUES', start);
  const end = sql.indexOf(';\n', valuesIdx);
  const cut = end > 0 ? end : sql.indexOf(';', valuesIdx);
  const valuesBlob = sql.slice(valuesIdx + 6, cut).trim();
  const rows = [];
  let i = 0;
  const skipWs = () => {
    while (i < valuesBlob.length && /\s/.test(valuesBlob[i])) i++;
  };
  const readValue = () => {
    skipWs();
    if (valuesBlob.startsWith('NULL', i) && !/[A-Za-z0-9_]/.test(valuesBlob[i + 4] || '')) {
      i += 4;
      return null;
    }
    if (valuesBlob[i] === "'") {
      i++;
      let s = '';
      while (i < valuesBlob.length) {
        const ch = valuesBlob[i];
        if (ch === '\\') {
          const next = valuesBlob[i + 1];
          if (next === 'n') {
            s += '\n';
            i += 2;
            continue;
          }
          if (next === 'r') {
            s += '\r';
            i += 2;
            continue;
          }
          if (next === "'" || next === '\\') {
            s += next;
            i += 2;
            continue;
          }
          s += next;
          i += 2;
          continue;
        }
        if (ch === "'" && valuesBlob[i + 1] === "'") {
          s += "'";
          i += 2;
          continue;
        }
        if (ch === "'") {
          i++;
          break;
        }
        s += ch;
        i++;
      }
      return s;
    }
    let num = '';
    while (i < valuesBlob.length && /[0-9.eE+-]/.test(valuesBlob[i])) num += valuesBlob[i++];
    return num.includes('.') ? Number(num) : Number(num);
  };

  while (i < valuesBlob.length) {
    skipWs();
    if (valuesBlob[i] === ',') {
      i++;
      continue;
    }
    if (valuesBlob[i] !== '(') break;
    i++;
    const fields = [];
    while (true) {
      fields.push(readValue());
      skipWs();
      if (valuesBlob[i] === ',') {
        i++;
        continue;
      }
      if (valuesBlob[i] === ')') {
        i++;
        break;
      }
      throw new Error(`Parse error in ${table} near ${valuesBlob.slice(i, i + 30)}`);
    }
    rows.push(fields);
  }
  return rows;
}

const sql = fs.readFileSync(dumpPath, 'utf8');

const jewellers = parseValuesBlob(sql, 'jewellers');
console.log('Jewellers', jewellers.length);
let n = 0;
for (const f of jewellers) {
  const [id, name, passcode_hash, birthdate, birth_month, lockout_time, created_at, session_token, security_question, security_answer] = f;
  try {
    await query(
      `INSERT INTO kitaab.jewellers
       (id, name, passcode_hash, birthdate, birth_month, lockout_time, created_at, session_token, security_question, security_answer)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, passcode_hash = EXCLUDED.passcode_hash`,
      [
        id,
        unescape(name),
        passcode_hash,
        birthdate,
        birth_month,
        lockout_time,
        created_at || new Date().toISOString(),
        session_token,
        security_question,
        security_answer,
      ]
    );
    n++;
  } catch (e) {
    console.error('jeweller', id, e.message);
  }
}
console.log('Jewellers upserted', n);

const customers = parseValuesBlob(sql, 'customers');
console.log('Customers', customers.length);
n = 0;
for (const f of customers) {
  const [id, jeweller_id, name, created_at] = f;
  try {
    await query(
      `INSERT INTO kitaab.customers (id, jeweller_id, name, created_at)
       VALUES (?,?,?,?)
       ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
      [id, jeweller_id, unescape(name), created_at || new Date().toISOString()]
    );
    n++;
  } catch (e) {
    console.error('customer', id, e.message);
  }
}
console.log('Customers upserted', n);

const transactions = parseValuesBlob(sql, 'transactions');
console.log('Transactions', transactions.length);
n = 0;
for (const f of transactions) {
  const [id, jeweller_id, customer_id, type, category, date, fine, weight, amount, created_at] = f;
  try {
    await query(
      `INSERT INTO kitaab.transactions
       (id, jeweller_id, customer_id, type, category, date, fine, weight, amount, created_at)
       VALUES (?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount`,
      [
        id,
        jeweller_id,
        customer_id,
        type,
        category,
        date,
        fine ?? 0,
        weight ?? 0,
        amount ?? 0,
        created_at || new Date().toISOString(),
      ]
    );
    n++;
  } catch (e) {
    console.error('tx', id, e.message);
  }
}
console.log('Transactions upserted', n);

for (const table of ['jewellers', 'customers', 'transactions']) {
  try {
    await query(
      `SELECT setval(pg_get_serial_sequence('kitaab.${table}', 'id'), COALESCE((SELECT MAX(id) FROM kitaab.${table}), 1))`
    );
  } catch (e) {
    console.warn('setval', table, e.message);
  }
}

await pool.end();
console.log('Migration done');
