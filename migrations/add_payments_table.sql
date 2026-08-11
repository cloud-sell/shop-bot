CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  telegram_user_id INTEGER NOT NULL REFERENCES telegram_users(id),
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  cryptomus_uuid TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_uuid ON payments(cryptomus_uuid);
