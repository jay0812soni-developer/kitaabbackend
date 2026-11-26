import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import { query } from './db.js';

export async function ensureAdminSeeded() {
  const rows = await query(
    'SELECT id FROM kitaab.admins WHERE username = ? LIMIT 1',
    [config.admin.username]
  );
  if (rows.length) return;
  const hash = await bcrypt.hash(config.admin.password, 12);
  await query('INSERT INTO kitaab.admins (username, password_hash) VALUES (?, ?)', [
    config.admin.username,
    hash,
  ]);
  console.log(`Seeded admin: ${config.admin.username}`);
}

export function signJewellerToken(jeweller) {
  return jwt.sign(
    { sub: jeweller.id, name: jeweller.name, role: 'jeweller' },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );
}

export function requireJeweller(req, res, next) {
  const header = req.headers.authorization || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return res.status(401).json({ status: 'error', message: 'Unauthorized' });
  }
  try {
    const payload = jwt.verify(match[1], config.jwt.secret);
    if (payload.role !== 'jeweller') {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    req.jeweller = payload;
    next();
  } catch {
    return res.status(401).json({ status: 'error', message: 'Invalid token' });
  }
}

/** Accept PHP $2y$ bcrypt and plain legacy passcodes */
export async function verifyPasscode(plain, stored) {
  if (!stored) return false;
  if (stored.startsWith('$2y$') || stored.startsWith('$2a$') || stored.startsWith('$2b$')) {
    const normalized = stored.startsWith('$2y$')
      ? `$2a$${stored.slice(4)}`
      : stored;
    return bcrypt.compare(plain, normalized);
  }
  return plain === stored;
}

export async function hashPasscode(plain) {
  return bcrypt.hash(plain, 12);
}
