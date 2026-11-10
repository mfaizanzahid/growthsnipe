-- Diagnostic service enrichment progress.
--
-- ISN fee detail lives only on the per-order read, so enrichment runs in
-- workflow batches. This flag lets each batch claim only orders that still need
-- detail reads without looping forever on a permanently unreadable order.
ALTER TABLE diagnostic_orders ADD COLUMN services_enriched INTEGER NOT NULL DEFAULT 0;
