import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config, missingCriticalEnv } from './config.js';
import { ensureAdminSeeded } from './auth.js';
import { ensureSchemaExtras } from './schemaExtras.js';
import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { customersRouter } from './routes/customers.js';
import { transactionsRouter } from './routes/transactions.js';
import { apiLimiter, authLimiter, securityHeaders } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(securityHeaders);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (config.corsOrigins.includes('*') || config.corsOrigins.length === 0) {
        return cb(null, true);
      }
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', apiLimiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/signup', authLimiter);
app.use('/api/auth/forgot', authLimiter);
app.use('/api/auth/forgot/birth-month', authLimiter);
app.use('/api/auth/reset-passcode', authLimiter);
app.use('/api/auth/security-question', authLimiter);
app.use('/api/admin/login', authLimiter);

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, app: 'kitaab', version: '1.0.1' });
  } catch {
    res.status(503).json({ ok: false });
  }
});

// Express treats /admin and /admin/ as the same route by default, so a
// redirect from /admin → /admin/ loops forever. Serve the login page directly.
const adminDir = path.join(__dirname, '..', 'public', 'admin');
app.get(['/admin', '/admin/'], (_req, res) => {
  res.sendFile(path.join(adminDir, 'index.html'));
});
app.use('/admin', express.static(adminDir, { index: false, redirect: false }));

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/customers', customersRouter);
app.use('/api/transactions', transactionsRouter);

app.use((err, _req, res, _next) => {
  console.error(err.message || err);
  if (String(err.message || '').includes('CORS')) {
    return res.status(403).json({ status: 'error', message: 'Forbidden' });
  }
  res.status(500).json({ status: 'error', message: 'Server error' });
});

async function boot() {
  const missing = missingCriticalEnv();
  if (missing.length) {
    console.error('Missing env:', missing.join(', '));
  }
  try {
    await ensureSchemaExtras();
  } catch (e) {
    console.warn('Schema extras skipped:', e.message);
  }
  try {
    await ensureAdminSeeded();
  } catch (e) {
    console.warn('Admin seed skipped:', e.message);
  }
  app.listen(config.port, () => {
    console.log(`Kitaab API 1.0.1 on :${config.port}`);
  });
}

boot();
