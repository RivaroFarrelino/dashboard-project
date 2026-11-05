USE dashboard_project;

ALTER TABLE bc_prod_order
  ADD COLUMN IF NOT EXISTS finished_date DATE NULL AFTER due_date_fppp,
  ADD INDEX IF NOT EXISTS idx_po_status (status, finished_date);

ALTER TABLE bc_prod_order_line
  ADD INDEX IF NOT EXISTS idx_pol_status (status);

ALTER TABLE bc_item_ledger_entry
  ADD INDEX IF NOT EXISTS idx_ile_brand_type_entry (brand, entry_type, entry_no);

ALTER TABLE bc_shipment_line
  ADD INDEX IF NOT EXISTS idx_shl_brand_posting (brand, posting_date),
  ADD INDEX IF NOT EXISTS idx_shl_item (item_no);
