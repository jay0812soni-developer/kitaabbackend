import { Router } from 'express';
import {
  requireAdmin,
  signAdminToken,
  verifyPasscode,
} from '../auth.js';
import { query } from '../db.js';

export const adminRouter = Router();

adminRouter.post('/login', async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const password = String(req.body.password || '');
    if (!username || !password) {
      return res.status(400).json({ status: 'error', message: 'Username and password required' });
    }
    const rows = await query(
      'SELECT id, username, password_hash FROM kitaab.admins WHERE username = ? LIMIT 1',
      [username]
    );
    if (!rows.length || !(await verifyPasscode(password, rows[0].password_hash))) {
      return res.status(401).json({ status: 'error', message: 'Invalid username or password' });
    }
    const token = signAdminToken(rows[0]);
    return res.json({
      status: 'success',
      token,
      admin: { id: rows[0].id, username: rows[0].username },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

adminRouter.get('/overview', requireAdmin, async (req, res) => {
  try {
    const [jewellers] = await query('SELECT COUNT(*)::int AS c FROM kitaab.jewellers');
    const [customers] = await query('SELECT COUNT(*)::int AS c FROM kitaab.customers');
    const [transactions] = await query('SELECT COUNT(*)::int AS c FROM kitaab.transactions');
    const recent = await query(
      `SELECT j.id, j.name, j.created_at,
              (SELECT COUNT(*)::int FROM kitaab.customers c WHERE c.jeweller_id = j.id) AS customer_count,
              (SELECT COUNT(*)::int FROM kitaab.transactions t WHERE t.jeweller_id = j.id) AS transaction_count,
              (SELECT MAX(t.date) FROM kitaab.transactions t WHERE t.jeweller_id = j.id) AS last_txn_date
       FROM kitaab.jewellers j
       ORDER BY j.created_at DESC
       LIMIT 20`
    );
    return res.json({
      status: 'success',
      totals: {
        jewellers: jewellers.c,
        customers: customers.c,
        transactions: transactions.c,
      },
      recent_jewellers: recent,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to load overview' });
  }
});

adminRouter.get('/jewellers', requireAdmin, async (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    const from = req.query.from || null;
    const to = req.query.to || null;
    let sql = `
      SELECT j.id, j.name, j.created_at,
             (SELECT COUNT(*)::int FROM kitaab.customers c WHERE c.jeweller_id = j.id) AS customer_count,
             (SELECT COUNT(*)::int FROM kitaab.transactions t WHERE t.jeweller_id = j.id) AS transaction_count,
             (SELECT COALESCE(SUM(CASE WHEN t.type='jama' THEN t.amount ELSE -t.amount END),0)
                FROM kitaab.transactions t WHERE t.jeweller_id = j.id) AS net_amount
      FROM kitaab.jewellers j
      WHERE 1=1`;
    const params = [];
    if (q) {
      sql += ' AND LOWER(j.name) LIKE ?';
      params.push(`%${q}%`);
    }
    if (from) {
      sql += ' AND j.created_at::date >= ?';
      params.push(from);
    }
    if (to) {
      sql += ' AND j.created_at::date <= ?';
      params.push(to);
    }
    sql += ' ORDER BY j.name ASC';
    const rows = await query(sql, params);
    return res.json({ status: 'success', jewellers: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to list jewellers' });
  }
});

adminRouter.get('/jewellers/:id', requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const jewellers = await query(
      'SELECT id, name, created_at, security_question, birth_month FROM kitaab.jewellers WHERE id = ? LIMIT 1',
      [id]
    );
    if (!jewellers.length) {
      return res.status(404).json({ status: 'error', message: 'Jeweller not found' });
    }
    const customers = await query(
      'SELECT id, name, created_at FROM kitaab.customers WHERE jeweller_id = ? ORDER BY name ASC',
      [id]
    );
    const transactions = await query(
      `SELECT t.id, t.type, t.category, t.date, t.fine, t.weight, t.amount, t.created_at,
              c.name AS customer_name
       FROM kitaab.transactions t
       LEFT JOIN kitaab.customers c ON c.id = t.customer_id
       WHERE t.jeweller_id = ?
       ORDER BY t.date DESC, t.id DESC
       LIMIT 200`,
      [id]
    );
    const jamaAmt = transactions.filter((t) => t.type === 'jama').reduce((a, t) => a + Number(t.amount || 0), 0);
    const udharAmt = transactions.filter((t) => t.type === 'udhar').reduce((a, t) => a + Number(t.amount || 0), 0);
    return res.json({
      status: 'success',
      jeweller: {
        ...jewellers[0],
        has_security: !!jewellers[0].security_question,
      },
      customers,
      transactions,
      nets: {
        amount: jamaAmt - udharAmt,
        customer_count: customers.length,
        transaction_count: transactions.length,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to load jeweller' });
  }
});
