CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    description TEXT NOT NULL CHECK (length(trim(description)) BETWEEN 1 AND 80),
    category TEXT NOT NULL CHECK (length(trim(category)) BETWEEN 1 AND 40),
    transaction_date TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC NOT NULL CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_transactions_date_id
    ON transactions (transaction_date DESC, id DESC);
