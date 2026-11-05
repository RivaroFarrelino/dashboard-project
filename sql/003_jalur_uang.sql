USE dashboard_project;

ALTER TABLE bc_proforma_header
  MODIFY no VARCHAR(30) NOT NULL,
  MODIFY status_pi VARCHAR(50) NULL,
  ADD COLUMN IF NOT EXISTS project_code VARCHAR(20) NULL AFTER brand,
  ADD COLUMN IF NOT EXISTS doc_status VARCHAR(30) NULL AFTER status_pi,
  ADD COLUMN IF NOT EXISTS quo_norm VARCHAR(50) NULL AFTER external_document_no,
  ADD COLUMN IF NOT EXISTS proforma_amount_paid_bc DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER kurs,
  ADD COLUMN IF NOT EXISTS actual_invoice_no VARCHAR(30) NULL AFTER proforma_amount_paid_bc,
  ADD COLUMN IF NOT EXISTS posted_sales_invoice VARCHAR(30) NULL AFTER actual_invoice_no,
  ADD COLUMN IF NOT EXISTS missing_in_bc_since DATETIME NULL AFTER last_seen_at,
  ADD INDEX IF NOT EXISTS idx_pi_psi (posted_sales_invoice),
  ADD INDEX IF NOT EXISTS idx_pi_actual (actual_invoice_no),
  ADD INDEX IF NOT EXISTS idx_pi_brand_seen (brand, last_seen_at),
  ADD INDEX IF NOT EXISTS idx_pi_quo (quo_norm);

ALTER TABLE bc_proforma_line
  MODIFY document_no VARCHAR(30) NOT NULL,
  ADD COLUMN IF NOT EXISTS brand VARCHAR(20) NULL AFTER line_no,
  ADD COLUMN IF NOT EXISTS description_2 VARCHAR(150) NULL AFTER description,
  ADD COLUMN IF NOT EXISTS quantity DECIMAL(18,4) NOT NULL DEFAULT 0 AFTER description_2,
  ADD INDEX IF NOT EXISTS idx_pil_brand_seen (brand, last_seen_at);

ALTER TABLE bc_cashier_in_header
  MODIFY cashier_in_no VARCHAR(30) NOT NULL,
  ADD COLUMN IF NOT EXISTS external_document_no VARCHAR(50) NULL AFTER posting_date,
  ADD COLUMN IF NOT EXISTS description VARCHAR(150) NULL AFTER external_document_no,
  ADD COLUMN IF NOT EXISTS currency_code VARCHAR(10) NULL AFTER description,
  ADD COLUMN IF NOT EXISTS total_amount DECIMAL(18,2) NOT NULL DEFAULT 0 AFTER currency_code;

ALTER TABLE bc_cashier_in_line
  MODIFY cashier_in_no VARCHAR(30) NOT NULL,
  ADD INDEX IF NOT EXISTS idx_cil_brand (brand);

ALTER TABLE app_psi_link
  MODIFY pi_no VARCHAR(30) NULL,
  MODIFY link_method ENUM('PI','ORDER_NO','QUO','PROJECT','PENGGANTI','MANUAL','BELUM') NOT NULL DEFAULT 'BELUM';

UPDATE app_sync_cursor SET last_value = 'FREE' WHERE entity = 'LOCK_SO';
