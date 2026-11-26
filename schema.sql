-- Kitaab — jeweller ledger (PostgreSQL / TiDB Cloud Starter)
-- No FKs: legacy InfinityFree dump has orphaned customer/tx rows.
CREATE SCHEMA IF NOT EXISTS kitaab;

CREATE TABLE IF NOT EXISTS kitaab.jewellers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  passcode_hash VARCHAR(255) NOT NULL,
  birthdate DATE DEFAULT NULL,
  birth_month VARCHAR(20) DEFAULT NULL,
  lockout_time TIMESTAMPTZ DEFAULT NULL,
  session_token VARCHAR(255) DEFAULT NULL,
  security_question VARCHAR(255) DEFAULT NULL,
  security_answer VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_kitaab_jewellers_name ON kitaab.jewellers (LOWER(name));

CREATE TABLE IF NOT EXISTS kitaab.customers (
  id SERIAL PRIMARY KEY,
  jeweller_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kitaab_customers_jeweller ON kitaab.customers(jeweller_id);

CREATE TABLE IF NOT EXISTS kitaab.transactions (
  id SERIAL PRIMARY KEY,
  jeweller_id INT NOT NULL,
  customer_id INT NOT NULL,
  type VARCHAR(10) NOT NULL CHECK (type IN ('jama', 'udhar')),
  category VARCHAR(10) NOT NULL CHECK (category IN ('gold', 'silver')),
  date DATE NOT NULL,
  fine DOUBLE PRECISION DEFAULT 0,
  weight DOUBLE PRECISION DEFAULT 0,
  amount DOUBLE PRECISION DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_kitaab_tx_lookup
  ON kitaab.transactions(jeweller_id, customer_id, category, date);

CREATE TABLE IF NOT EXISTS kitaab.admins (
  id SERIAL PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
