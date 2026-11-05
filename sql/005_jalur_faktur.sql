USE dashboard_project;

ALTER TABLE bc_psi_header
  ADD INDEX IF NOT EXISTS idx_psi_brand (brand, posting_date),
  ADD INDEX IF NOT EXISTS idx_psi_preassigned (pre_assigned_no);

ALTER TABLE bc_psi_line
  ADD INDEX IF NOT EXISTS idx_psil_project (project_code);

ALTER TABLE bc_credit_memo_header
  ADD INDEX IF NOT EXISTS idx_cm_brand (brand, posting_date),
  ADD INDEX IF NOT EXISTS idx_cm_project (project_code);

ALTER TABLE bc_cust_ledger_entry
  ADD INDEX IF NOT EXISTS idx_cle_brand (brand, document_type),
  ADD INDEX IF NOT EXISTS idx_cle_customer (customer_no),
  ADD INDEX IF NOT EXISTS idx_cle_project (project_code);

INSERT INTO app_sync_cursor (entity, brand, last_value) VALUES ('daily_full', 'AST', 'BELUM')
ON DUPLICATE KEY UPDATE last_value = last_value;
