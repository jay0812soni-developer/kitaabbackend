import { Router } from 'express';
import jwt from 'jsonwebtoken';
import {
  hashPasscode,
  requireJeweller,
  signJewellerToken,
  verifyPasscode,
} from '../auth.js';
import { config } from '../config.js';
import { query, queryResult } from '../db.js';

export const authRouter = Router();

function signResetToken(jewellerId) {
  return jwt.sign(
    { sub: jewellerId, role: 'reset' },
    config.jwt.secret,
    { expiresIn: '15m' }
  );
}

function verifyResetToken(token) {
  const payload = jwt.verify(token, config.jwt.secret);
  if (payload.role !== 'reset' || !payload.sub) {
    throw new Error('Invalid reset token');
  }
  return Number(payload.sub);
}

authRouter.post('/signup', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const passcode = String(req.body.passcode || '');
    if (!name || !passcode) {
      return res.status(400).json({ status: 'error', message: 'Name and passcode required' });
    }
    if (passcode.length < 4) {
      return res.status(400).json({ status: 'error', message: 'Passcode must be at least 4 characters' });
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
      needs_security: true,
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
      `SELECT id, name, passcode_hash, security_question, security_answer, birth_month
       FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [name]
    );
    if (!rows.length || !(await verifyPasscode(passcode, rows[0].passcode_hash))) {
      return res.status(401).json({ status: 'error', message: 'Invalid name or passcode' });
    }
    const token = signJewellerToken(rows[0]);
    const needsSecurity = !rows[0].security_answer;
    return res.json({
      status: 'success',
      jeweller_id: rows[0].id,
      jeweller_name: rows[0].name,
      token,
      needs_security: needsSecurity,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Login failed' });
  }
});

authRouter.get('/me', requireJeweller, async (req, res) => {
  try {
    const rows = await query(
      `SELECT id, name, security_question, security_answer, birth_month, created_at
       FROM kitaab.jewellers WHERE id = ? LIMIT 1`,
      [req.jeweller.sub]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Not found' });
    }
    const j = rows[0];
    return res.json({
      status: 'success',
      jeweller: {
        id: j.id,
        name: j.name,
        security_question: j.security_question || null,
        has_security: !!j.security_answer,
        has_birth_month: !!j.birth_month,
        created_at: j.created_at,
      },
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to load profile' });
  }
});

authRouter.post('/set-security', requireJeweller, async (req, res) => {
  try {
    const question = String(req.body.security_question || '').trim();
    const answer = String(req.body.security_answer || '').trim();
    const birthMonth = String(req.body.birth_month || '').trim();
    if (!question || !answer) {
      return res.status(400).json({ status: 'error', message: 'Security question and answer required' });
    }
    const answerHash = await hashPasscode(answer.toLowerCase());
    await query(
      `UPDATE kitaab.jewellers
       SET security_question = ?, security_answer = ?, birth_month = COALESCE(NULLIF(?, ''), birth_month)
       WHERE id = ?`,
      [question, answerHash, birthMonth, req.jeweller.sub]
    );
    return res.json({ status: 'success' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Failed to save security' });
  }
});

authRouter.get('/security-question', async (req, res) => {
  try {
    const name = String(req.query.name || '').trim();
    if (!name) {
      return res.status(400).json({ status: 'error', message: 'Name required' });
    }
    const rows = await query(
      `SELECT security_question, security_answer, birth_month
       FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [name]
    );
    if (!rows.length) {
      return res.status(404).json({ status: 'error', message: 'Account not found' });
    }
    return res.json({
      status: 'success',
      security_question: rows[0].security_question || null,
      has_security: !!rows[0].security_answer,
      has_birth_month: !!rows[0].birth_month,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Lookup failed' });
  }
});

authRouter.post('/forgot/verify', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const answer = String(req.body.security_answer || '').trim();
    const rows = await query(
      `SELECT id, security_question, security_answer FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [name]
    );
    if (!rows.length || !rows[0].security_answer) {
      return res.status(404).json({ status: 'error', message: 'Account or security not set' });
    }
    const ok = await verifyPasscode(answer.toLowerCase(), rows[0].security_answer);
    if (!ok) {
      return res.status(401).json({ status: 'error', message: 'Incorrect answer' });
    }
    return res.json({
      status: 'success',
      jeweller_id: rows[0].id,
      reset_token: signResetToken(rows[0].id),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Verify failed' });
  }
});

authRouter.post('/forgot/birth-month', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const birthMonth = String(req.body.birth_month || '').trim();
    if (!name || !birthMonth) {
      return res.status(400).json({ status: 'error', message: 'Name and birth month required' });
    }
    const rows = await query(
      `SELECT id, birth_month, lockout_time FROM kitaab.jewellers WHERE LOWER(name) = LOWER(?) LIMIT 1`,
      [name]
    );
    if (!rows.length || !rows[0].birth_month) {
      return res.status(404).json({ status: 'error', message: 'Account or birth month not set' });
    }
    if (rows[0].lockout_time && new Date(rows[0].lockout_time) > new Date()) {
      return res.status(429).json({ status: 'error', message: 'Too many attempts. Try again later.' });
    }
    if (String(rows[0].birth_month).toLowerCase() !== birthMonth.toLowerCase()) {
      return res.status(401).json({ status: 'error', message: 'Incorrect birth month' });
    }
    return res.json({
      status: 'success',
      jeweller_id: rows[0].id,
      reset_token: signResetToken(rows[0].id),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Verify failed' });
  }
});

authRouter.post('/reset-passcode', async (req, res) => {
  try {
    const resetToken = String(req.body.reset_token || '');
    const newPasscode = String(req.body.new_passcode || '');
    if (!resetToken || newPasscode.length < 4) {
      return res.status(400).json({ status: 'error', message: 'Valid reset token and new passcode required' });
    }
    let jewellerId;
    try {
      jewellerId = verifyResetToken(resetToken);
    } catch {
      return res.status(401).json({ status: 'error', message: 'Reset link expired or invalid' });
    }
    const hash = await hashPasscode(newPasscode);
    await query('UPDATE kitaab.jewellers SET passcode_hash = ?, lockout_time = NULL WHERE id = ?', [
      hash,
      jewellerId,
    ]);
    return res.json({ status: 'success' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ status: 'error', message: 'Reset failed' });
  }
});
