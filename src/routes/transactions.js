import { Router } from 'express';
import { requireJeweller } from '../auth.js';
import { query, queryResult } from '../db.js';

export const transactionsRouter = Router();
transactionsRouter.use(requireJeweller);

async function assertCustomer(jewellerId, customerId) {
  const rows = await query(
    'SELECT id, name FROM kitaab.customers WHERE id = ? AND jeweller_id = ? LIMIT 1',
    [customerId, jewellerId]
  );
  return rows[0] || null;
}

function sumNet(rows) {
  const jama = rows.filter((r) => r.type === 'jama');
  const udhar = rows.filter((r) => r.type === 'udhar');
  const sum = (list, field) => list.reduce((a, b) => a + Number(b[field] || 0), 0);
  return {
    fine: sum(jama, 'fine') - sum(udhar, 'fine'),
    weight: sum(jama, 'weight') - sum(udhar, 'weight'),
    amount: sum(jama, 'amount') - sum(udhar, 'amount'),
  };
}

transactionsRouter.get('/khatabook', async (req, res) => {
  try {
    const category = req.query.category ? String(req.query.category) : null;
    const from = req.query.from || null;
    const to = req.query.to || null;
    let sql = `
      SELECT t.*, c.name AS customer_name
      FROM kitaab.transactions t
      LEFT JOIN kitaab.customers c ON c.id = t.customer_id
      WHERE t.jeweller_id = ?`;
    const params = [req.jeweller.sub];
    if (category && ['gold', 'silver'].includes(category)) {
      sql += ' AND t.category = ?';
      params.push(category);
    }
    if (from && to) {
      sql += ' AND t.date BETWEEN ? AND ?';
      params.push(from, to);
    }
    sql += ' ORDER BY t.date DESC, t.id DESC';
    const rows = await query(sql, params);
    return res.json({
      status: 'success',
      transactions: rows,
      net: sumNet(rows),
      count: rows.length,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to load khatabook' });
  }
});

transactionsRouter.post('/', async (req, res) => {
  try {
    const customerId = Number(req.body.customer_id);
    const type = String(req.body.type || '');
    const category = String(req.body.category || '');
    const date = String(req.body.date || '');
    const fine = Number(req.body.fine || 0);
    const weight = Number(req.body.weight || 0);
    const amount = Number(req.body.amount || 0);

    if (!customerId || !['jama', 'udhar'].includes(type) || !['gold', 'silver'].includes(category) || !date) {
      return res.status(400).json({ status: 'error', message: 'Invalid transaction fields' });
    }
    const customer = await assertCustomer(req.jeweller.sub, customerId);
    if (!customer) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    const result = await queryResult(
      `INSERT INTO kitaab.transactions
       (jeweller_id, customer_id, type, category, date, fine, weight, amount)
       VALUES (?,?,?,?,?,?,?,?) RETURNING *`,
      [req.jeweller.sub, customerId, type, category, date, fine, weight, amount]
    );
    return res.status(201).json({ status: 'success', transaction: result.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to save transaction' });
  }
});

transactionsRouter.get('/', async (req, res) => {
  try {
    const customerId = Number(req.query.customer_id);
    const category = req.query.category ? String(req.query.category) : null;
    const type = req.query.type ? String(req.query.type) : null;
    const from = req.query.from || null;
    const to = req.query.to || null;
    if (!customerId) {
      return res.status(400).json({ status: 'error', message: 'customer_id required' });
    }
    const customer = await assertCustomer(req.jeweller.sub, customerId);
    if (!customer) {
      return res.status(404).json({ status: 'error', message: 'Customer not found' });
    }

    let sql =
      'SELECT * FROM kitaab.transactions WHERE jeweller_id = ? AND customer_id = ?';
    const params = [req.jeweller.sub, customerId];
    if (category) {
      sql += ' AND category = ?';
      params.push(category);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    if (from && to) {
      sql += ' AND date BETWEEN ? AND ?';
      params.push(from, to);
    }
    sql += ' ORDER BY date ASC, id ASC';
    const rows = await query(sql, params);

    return res.json({
      status: 'success',
      customer_name: customer.name,
      transactions: rows,
      jama: rows.filter((r) => r.type === 'jama'),
      udhar: rows.filter((r) => r.type === 'udhar'),
      net: sumNet(rows),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to load ledger' });
  }
});

transactionsRouter.put('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const type = String(req.body.type || '');
    const category = String(req.body.category || '');
    const date = String(req.body.date || '');
    const fine = Number(req.body.fine || 0);
    const weight = Number(req.body.weight || 0);
    const amount = Number(req.body.amount || 0);

    if (
      !id ||
      !['jama', 'udhar'].includes(type) ||
      !['gold', 'silver'].includes(category) ||
      !date
    ) {
      return res.status(400).json({ status: 'error', message: 'Invalid transaction fields' });
    }

    const rows = await query(
      `UPDATE kitaab.transactions
       SET type = ?, category = ?, date = ?, fine = ?, weight = ?, amount = ?
       WHERE id = ? AND jeweller_id = ?
       RETURNING *`,
      [type, category, date, fine, weight, amount, id, req.jeweller.sub]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Not found' });
    }
    return res.json({ status: 'success', transaction: rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to update transaction' });
  }
});

transactionsRouter.delete('/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const rows = await query(
      'DELETE FROM kitaab.transactions WHERE id = ? AND jeweller_id = ? RETURNING id',
      [id, req.jeweller.sub]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Not found' });
    }
    return res.json({ status: 'success' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Delete failed' });
  }
});
