import { Router } from 'express';
import { requireJeweller } from '../auth.js';
import { pool, query, queryResult } from '../db.js';

export const customersRouter = Router();
customersRouter.use(requireJeweller);

customersRouter.get('/', async (req, res) => {
  try {
    const rows = await query(
      'SELECT id, name, created_at FROM kitaab.customers WHERE jeweller_id = ? ORDER BY name ASC',
      [req.jeweller.sub]
    );
    return res.json({ status: 'success', customers: rows });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to list customers' });
  }
});

customersRouter.post('/', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    if (!name) {
      return res.status(400).json({ status: 'error', message: 'Name required' });
    }
    const result = await queryResult(
      'INSERT INTO kitaab.customers (jeweller_id, name) VALUES (?, ?) RETURNING id, name, created_at',
      [req.jeweller.sub, name]
    );
    return res.status(201).json({ status: 'success', customer: result.rows[0] });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to add customer' });
  }
});

customersRouter.delete('/:id', async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    const jewellerId = req.jeweller.sub;
    await client.query('BEGIN');
    const owned = await client.query(
      'SELECT id FROM kitaab.customers WHERE id = $1 AND jeweller_id = $2 LIMIT 1',
      [id, jewellerId]
    );
    if (!owned.rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ status: 'error', message: 'Not found' });
    }
    await client.query(
      'DELETE FROM kitaab.transactions WHERE customer_id = $1 AND jeweller_id = $2',
      [id, jewellerId]
    );
    await client.query(
      'DELETE FROM kitaab.customers WHERE id = $1 AND jeweller_id = $2',
      [id, jewellerId]
    );
    await client.query('COMMIT');
    return res.json({ status: 'success' });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Delete failed' });
  } finally {
    client.release();
  }
});
