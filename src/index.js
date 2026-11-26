import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config, missingCriticalEnv } from './config.js';
import { ensureAdminSeeded } from './auth.js';
import { pool } from './db.js';
import { authRouter } from './routes/auth.js';
import { customersRouter } from './routes/customers.js';
import { transactionsRouter } from './routes/transactions.js';

const app = express();
app.set('trust proxy', 1);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin || config.corsOrigins.includes('*') || config.corsOrigins.length === 0) {
        return cb(null, true);
      }
      if (config.corsOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('Not allowed by CORS'));
    },
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, max: 400 }));

app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, app: 'kitaab', version: '1.0.1' });
  } catch {
    res.status(503).json({ ok: false });
  }
});

app.use('/api/auth', authRouter);
app.use('/api/customers', customersRouter);
app.use('/api/transactions', transactionsRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ status: 'error', message: 'Server error' });
});

async function boot() {
  const missing = missingCriticalEnv();
  if (missing.length) {
    console.error('Missing env:', missing.join(', '));
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
