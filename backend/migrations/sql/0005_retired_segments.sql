-- A recording replaced by a newer one of the same script (a new voice) is deleted from
-- storage once nothing can still be playing it; its row stays for the cost ledger.
ALTER TABLE segments DROP CONSTRAINT IF EXISTS segments_status_check;
ALTER TABLE segments ADD CONSTRAINT segments_status_check
    CHECK (status IN ('pending', 'ready', 'failed', 'retired'));
