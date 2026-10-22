-- Per-card auto-retry budgets: record which saved card each charge attempt ran against.
-- Nullable so legacy rows stay valid (they are ignored by the per-card guard).
ALTER TABLE transactions ADD COLUMN payment_method_id TEXT;
