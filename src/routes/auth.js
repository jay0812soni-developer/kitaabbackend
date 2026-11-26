import { Router } from 'express';
import {
  hashPasscode,
  signJewellerToken,
  verifyPasscode,
} from '../auth.js';
import { query, queryResult } from '../db.js';

export const authRouter = Router();

authRouter.post('/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const passcode = String(req.body.passcode || '');
    if (!name || !passcode) {
      return res.status(400).json({ status: 'error', message: 'Name and passcode required' });
    }
    const existing = await query(
      'SELECT id FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    if (existing.length) {
      return res.status(409).json({ status: 'error', message: 'Jeweller name already registered' });
    }
    const hash = await hashPasscode(passcode);
    const result = await queryResult(
      'INSERT INTO kitaab.jewellers (name, passcode_hash) VALUES (?, ?) RETURNING id, name',
      [name, hash]
    );
    const jeweller = result.rows[0];
    const token = signJewellerToken(jeweller);
    return res.status(201).json({
      status: 'success',
      jeweller_id: jeweller.id,
      jeweller_name: jeweller.name,
      token,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Signup failed' });
  }
});

authRouter.post('/login', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const passcode = String(req.body.passcode || '');
    if (!name || !passcode) {
      return res.status(400).json({ status: 'error', message: 'Name and passcode required' });
    }
    const rows = await query(
      'SELECT id, name, passcode_hash FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1',
      [name]
    );
    if (!rows.length || !(await verifyPasscode(passcode, rows[0].passcode_hash))) {
      return res.status(401).json({ status: 'error', message: 'Invalid name or passcode' });
    }
    const token = signJewellerToken(rows[0]);
    return res.json({
      status: 'success',
      jeweller_id: rows[0].id,
      jeweller_name: rows[0].name,
      token,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

authRouter.post('/set-security', async (req, res) => {
  try {
    const jewellerId = Number(req.body.jeweller_id);
    const question = String(req.body.security_question || '').trim();
    const answer = String(req.body.security_answer || '').trim();
    if (!jewellerId || !question || !answer) {
      return res.status(400).json({ status: 'error', message: 'Missing fields' });
    }
    const answerHash = await hashPasscode(answer.toLowerCase());
    await query(
      `UPDATE kitaab.jewellers SET security_question = ?, security_answer = ? WHERE id = ?`,
      [question, answerHash, jewellerId]
    );
    return res.json({ status: 'success' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to save security' });
  }
});

authRouter.post('/forgot/verify', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const question = String(req.body.security_question || '').trim();
    const answer = String(req.body.security_answer || '').trim();
    const rows = await query(
      `SELECT id, security_question, security_answer FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [name]
    );
    if (!rows.length || !rows[0].security_answer) {
      return res.status(404).json({ status: 'error', message: 'Account or security not set' });
    }
    if (question && rows[0].security_question && question !== rows[0].security_question) {
      return res.status(401).json({ status: 'error', message: 'Incorrect security question' });
    }
    const ok = await verifyPasscode(answer.toLowerCase(), rows[0].security_answer);
    if (!ok) {
      return res.status(401).json({ status: 'error', message: 'Incorrect answer' });
    }
    return res.json({ status: 'success', jeweller_id: rows[0].id });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Verify failed' });
  }
});

authRouter.post('/reset-passcode', async (req, res) => {
  try {
    const jewellerId = Number(req.body.jeweller_id);
    const newPasscode = String(req.body.new_passcode || '');
    if (!jewellerId || newPasscode.length < 4) {
      return res.status(400).json({ status: 'error', message: 'Invalid request' });
    }
    const hash = await hashPasscode(newPasscode);
    await query('UPDATE kitaab.jewellers SET passcode_hash = ? WHERE id = ?', [hash, jewellerId]);
    return res.json({ status: 'success' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Reset failed' });
  }
});
