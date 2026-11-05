CREATE DATABASE IF NOT EXISTS dashboard_project
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE dashboard_project;

CREATE TABLE IF NOT EXISTS bc_dimension_value (
  dimension_code VARCHAR(20) NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (dimension_code, code)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_sales_header (
  no VARCHAR(20) NOT NULL,
  brand VARCHAR(20) NOT NULL,
  document_type VARCHAR(20) NULL,
  status VARCHAR(30) NULL,
  sell_to_customer_no VARCHAR(20) NULL,
  sell_to_customer_name VARCHAR(100) NULL,
  sell_to_contact VARCHAR(100) NULL,
  sell_to_county VARCHAR(50) NULL,
  external_document_no VARCHAR(50) NULL,
  quo_norm VARCHAR(50) NULL,
  project_code VARCHAR(20) NULL,
  project_name VARCHAR(100) NULL,
  dim3_code VARCHAR(20) NULL,
  dim4_code VARCHAR(20) NULL,
  sales_dim5 VARCHAR(20) NULL,
  pmsm_dim6 VARCHAR(20) NULL,
  arsitek_dim7 VARCHAR(20) NULL,
  kontraktor_dim8 VARCHAR(20) NULL,
  salesperson_code VARCHAR(20) NULL,
  responsibility_center VARCHAR(20) NULL,
  location_code VARCHAR(20) NULL,
  currency_code VARCHAR(10) NULL,
  payment_terms_code VARCHAR(20) NULL,
  posting_date DATE NULL,
  document_date DATE NULL,
  due_date DATE NULL,
  shipment_date DATE NULL,
  completely_shipped TINYINT(1) NOT NULL DEFAULT 0,
  contract_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  amount_including_vat DECIMAL(18,2) NOT NULL DEFAULT 0,
  proforma_amount_created DECIMAL(18,2) NOT NULL DEFAULT 0,
  proforma_amount_paid_bc DECIMAL(18,2) NOT NULL DEFAULT 0,
  first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  missing_in_bc_since DATETIME NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (no),
  KEY idx_sh_brand_project (brand, project_code),
  KEY idx_sh_quo (quo_norm),
  KEY idx_sh_sales (sales_dim5),
  KEY idx_sh_customer (sell_to_customer_no),
  KEY idx_sh_last_seen (last_seen_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_sales_line (
  document_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  brand VARCHAR(20) NOT NULL,
  type VARCHAR(20) NULL,
  item_no VARCHAR(30) NULL,
  parent_item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  warna VARCHAR(30) NULL,
  desc_warna VARCHAR(50) NULL,
  lebar DECIMAL(18,2) NOT NULL DEFAULT 0,
  tinggi DECIMAL(18,2) NOT NULL DEFAULT 0,
  fppp_no VARCHAR(20) NULL,
  prod_order_no VARCHAR(20) NULL,
  klaes_sales_order_no VARCHAR(20) NULL,
  gen_prod_posting_group VARCHAR(20) NULL,
  location_code VARCHAR(20) NULL,
  unit_of_measure_code VARCHAR(10) NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  quantity_shipped DECIMAL(18,4) NOT NULL DEFAULT 0,
  quantity_invoiced DECIMAL(18,4) NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  planned_shipment_date DATE NULL,
  shipment_date DATE NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_no, line_no),
  KEY idx_sl_item (item_no),
  KEY idx_sl_fppp (fppp_no),
  KEY idx_sl_parent (parent_item_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_proforma_header (
  no VARCHAR(20) NOT NULL,
  brand VARCHAR(20) NULL,
  nomor_so VARCHAR(20) NULL,
  document_type VARCHAR(30) NULL,
  proforma_type VARCHAR(30) NULL,
  status_pi VARCHAR(30) NULL,
  sell_to_customer_no VARCHAR(20) NULL,
  sell_to_customer_name VARCHAR(100) NULL,
  external_document_no VARCHAR(50) NULL,
  posting_description VARCHAR(150) NULL,
  work_description TEXT NULL,
  remark TEXT NULL,
  salesperson_code VARCHAR(20) NULL,
  currency_code VARCHAR(10) NULL,
  kurs DECIMAL(18,6) NOT NULL DEFAULT 1,
  posting_date DATE NULL,
  document_date DATE NULL,
  due_date DATE NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (no),
  KEY idx_pi_so (nomor_so)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_proforma_line (
  document_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  amount_ori DECIMAL(18,2) NOT NULL DEFAULT 0,
  line_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_no, line_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_cashier_in_header (
  cashier_in_no VARCHAR(20) NOT NULL,
  posting_date DATE NULL,
  lines_synced TINYINT(1) NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cashier_in_no),
  KEY idx_ci_lines_synced (lines_synced)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_cashier_in_line (
  cashier_in_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  posting_date DATE NULL,
  transaction_type VARCHAR(30) NULL,
  reference VARCHAR(30) NULL,
  reference_no VARCHAR(30) NULL,
  reference_name VARCHAR(100) NULL,
  document_no VARCHAR(30) NULL,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  brand VARCHAR(20) NULL,
  project_code VARCHAR(20) NULL,
  sales_dim5 VARCHAR(20) NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (cashier_in_no, line_no),
  KEY idx_cil_document (document_no),
  KEY idx_cil_posting (posting_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_prod_order (
  no VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL,
  description VARCHAR(150) NULL,
  fppp_doc_no VARCHAR(100) NULL,
  order_no VARCHAR(20) NULL,
  location_code VARCHAR(20) NULL,
  due_date DATE NULL,
  due_date_fppp DATE NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (no),
  KEY idx_po_order (order_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_prod_order_line (
  prod_order_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  status VARCHAR(20) NOT NULL,
  item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  kode_unit VARCHAR(20) NULL,
  sales_order_no VARCHAR(20) NULL,
  location_code VARCHAR(20) NULL,
  brand VARCHAR(20) NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  finished_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  remaining_quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (prod_order_no, line_no),
  KEY idx_pol_item (item_no),
  KEY idx_pol_so (sales_order_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_item_ledger_entry (
  entry_no BIGINT NOT NULL,
  posting_date DATE NULL,
  entry_type VARCHAR(30) NULL,
  document_type VARCHAR(30) NULL,
  document_no VARCHAR(30) NULL,
  document_line_no INT NULL,
  item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  location_code VARCHAR(20) NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  unit_of_measure_code VARCHAR(10) NULL,
  order_type VARCHAR(20) NULL,
  order_no VARCHAR(20) NULL,
  order_line_no INT NULL,
  source_no VARCHAR(30) NULL,
  source_order_no VARCHAR(20) NULL,
  brand VARCHAR(20) NULL,
  project_code VARCHAR(20) NULL,
  sales_dim5 VARCHAR(20) NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_no),
  KEY idx_ile_item_type (item_no, entry_type),
  KEY idx_ile_order (order_no),
  KEY idx_ile_source_order (source_order_no),
  KEY idx_ile_posting (posting_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_shipment_header (
  no VARCHAR(20) NOT NULL,
  brand VARCHAR(20) NULL,
  order_no VARCHAR(20) NULL,
  external_document_no VARCHAR(50) NULL,
  sell_to_customer_no VARCHAR(20) NULL,
  posting_date DATE NULL,
  shipment_date DATE NULL,
  location_code VARCHAR(20) NULL,
  shipment_method_code VARCHAR(20) NULL,
  shipping_agent_code VARCHAR(20) NULL,
  shipping_agent_service_code VARCHAR(30) NULL,
  project_code VARCHAR(20) NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (no),
  KEY idx_shh_order (order_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_shipment_line (
  document_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  order_no VARCHAR(20) NULL,
  item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  location_code VARCHAR(20) NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  quantity_invoiced DECIMAL(18,4) NOT NULL DEFAULT 0,
  posting_date DATE NULL,
  shipment_date DATE NULL,
  brand VARCHAR(20) NULL,
  project_code VARCHAR(20) NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_no, line_no),
  KEY idx_shl_order_item (order_no, item_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_psi_header (
  no VARCHAR(30) NOT NULL,
  brand VARCHAR(20) NULL,
  sell_to_customer_no VARCHAR(20) NULL,
  sell_to_customer_name VARCHAR(100) NULL,
  order_no VARCHAR(20) NULL,
  pre_assigned_no VARCHAR(30) NULL,
  external_document_no VARCHAR(50) NULL,
  posting_description VARCHAR(150) NULL,
  quo_norm VARCHAR(50) NULL,
  work_description TEXT NULL,
  salesperson_code VARCHAR(20) NULL,
  payment_terms_code VARCHAR(20) NULL,
  currency_code VARCHAR(10) NULL,
  project_code VARCHAR(20) NULL,
  posting_date DATE NULL,
  document_date DATE NULL,
  due_date DATE NULL,
  cancelled TINYINT(1) NOT NULL DEFAULT 0,
  corrective TINYINT(1) NOT NULL DEFAULT 0,
  closed TINYINT(1) NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (no),
  KEY idx_psi_quo (quo_norm),
  KEY idx_psi_project (project_code),
  KEY idx_psi_customer (sell_to_customer_no),
  KEY idx_psi_order (order_no),
  KEY idx_psi_posting (posting_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_psi_line (
  document_no VARCHAR(30) NOT NULL,
  line_no INT NOT NULL,
  type VARCHAR(20) NULL,
  item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  description_2 VARCHAR(150) NULL,
  order_no VARCHAR(20) NULL,
  project_code VARCHAR(20) NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  unit_price DECIMAL(18,2) NOT NULL DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  amount_including_vat DECIMAL(18,2) NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_no, line_no),
  KEY idx_psil_order (order_no),
  KEY idx_psil_item (item_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_credit_memo_header (
  no VARCHAR(30) NOT NULL,
  brand VARCHAR(20) NULL,
  sell_to_customer_no VARCHAR(20) NULL,
  pre_assigned_no VARCHAR(30) NULL,
  external_document_no VARCHAR(50) NULL,
  applies_to_doc_type VARCHAR(20) NULL,
  applies_to_doc_no VARCHAR(30) NULL,
  salesperson_code VARCHAR(20) NULL,
  project_code VARCHAR(20) NULL,
  posting_date DATE NULL,
  cancelled TINYINT(1) NOT NULL DEFAULT 0,
  corrective TINYINT(1) NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (no),
  KEY idx_cm_applies (applies_to_doc_no),
  KEY idx_cm_customer (sell_to_customer_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_credit_memo_line (
  document_no VARCHAR(30) NOT NULL,
  line_no INT NOT NULL,
  type VARCHAR(20) NULL,
  item_no VARCHAR(30) NULL,
  description VARCHAR(150) NULL,
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0,
  line_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (document_no, line_no),
  KEY idx_cml_item (type, item_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bc_cust_ledger_entry (
  entry_no BIGINT NOT NULL,
  posting_date DATE NULL,
  document_type VARCHAR(30) NULL,
  document_no VARCHAR(30) NULL,
  customer_no VARCHAR(20) NULL,
  description VARCHAR(150) NULL,
  quo_norm VARCHAR(50) NULL,
  external_document_no VARCHAR(50) NULL,
  brand VARCHAR(20) NULL,
  project_code VARCHAR(20) NULL,
  sales_dim5 VARCHAR(20) NULL,
  original_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  remaining_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 1,
  closed_at_date DATE NULL,
  reversed TINYINT(1) NOT NULL DEFAULT 0,
  reversed_by_entry_no BIGINT NULL,
  reversed_entry_no BIGINT NULL,
  bc_modified_at DATETIME NULL,
  synced_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entry_no),
  KEY idx_cle_document (document_no),
  KEY idx_cle_quo (quo_norm),
  KEY idx_cle_modified (bc_modified_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_contract_history (
  id BIGINT NOT NULL AUTO_INCREMENT,
  so_no VARCHAR(20) NOT NULL,
  contract_amount DECIMAL(18,2) NOT NULL,
  valid_from DATE NOT NULL,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  source ENUM('SYNC','BACKFILL') NOT NULL DEFAULT 'SYNC',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ch_so_date (so_no, valid_from),
  KEY idx_ch_so (so_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_so_state (
  so_no VARCHAR(20) NOT NULL,
  first_paid_date DATE NULL,
  lunas_date DATE NULL,
  closed_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (so_no),
  KEY idx_ss_closed (closed_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_fg_tagih (
  so_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  item_no VARCHAR(30) NOT NULL,
  qty_tagih DECIMAL(18,4) NOT NULL DEFAULT 0,
  is_ticked TINYINT(1) NOT NULL DEFAULT 0,
  updated_by VARCHAR(100) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (so_no, line_no),
  KEY idx_ft_item (item_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_fg_tagih_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  so_no VARCHAR(20) NOT NULL,
  line_no INT NOT NULL,
  item_no VARCHAR(30) NOT NULL,
  action ENUM('TICK','UNTICK') NOT NULL,
  qty DECIMAL(18,4) NOT NULL DEFAULT 0,
  done_by VARCHAR(100) NULL,
  done_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_ftl_so (so_no, line_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_psi_link (
  psi_no VARCHAR(30) NOT NULL,
  psi_status ENUM('AKTIF','VOID','POTONG_DP','CEK') NOT NULL DEFAULT 'CEK',
  status_reason VARCHAR(50) NULL,
  so_no VARCHAR(20) NULL,
  pi_no VARCHAR(20) NULL,
  link_method ENUM('ORDER_NO','QUO','PROJECT','PENGGANTI','MANUAL','BELUM') NOT NULL DEFAULT 'BELUM',
  replaced_by_psi_no VARCHAR(30) NULL,
  replaces_psi_no VARCHAR(30) NULL,
  is_manual_override TINYINT(1) NOT NULL DEFAULT 0,
  detected_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (psi_no),
  KEY idx_pl_so (so_no),
  KEY idx_pl_status (psi_status),
  KEY idx_pl_replaced (replaced_by_psi_no)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_sync_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  entity VARCHAR(50) NOT NULL,
  brand VARCHAR(20) NULL,
  run_id VARCHAR(50) NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  rows_fetched INT NOT NULL DEFAULT 0,
  rows_upserted INT NOT NULL DEFAULT 0,
  status ENUM('RUNNING','OK','ERROR') NOT NULL DEFAULT 'RUNNING',
  message TEXT NULL,
  PRIMARY KEY (id),
  KEY idx_sync_entity (entity, started_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS app_sync_cursor (
  entity VARCHAR(50) NOT NULL,
  brand VARCHAR(20) NOT NULL,
  last_value VARCHAR(50) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (entity, brand)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS komisi_grup (
  tahun SMALLINT NOT NULL,
  kode VARCHAR(20) NOT NULL,
  brand VARCHAR(20) NOT NULL,
  tipe ENUM('INDIVIDU','TIM') NOT NULL,
  is_counter TINYINT(1) NOT NULL DEFAULT 0,
  nama VARCHAR(100) NOT NULL,
  batas_omzet DECIMAL(18,2) NOT NULL,
  persen_bawah DECIMAL(7,4) NOT NULL,
  persen_atas DECIMAL(7,4) NOT NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (tahun, kode),
  KEY idx_kg_brand (tahun, brand, tipe)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS komisi_anggota (
  id INT NOT NULL AUTO_INCREMENT,
  tahun SMALLINT NOT NULL,
  kode_grup VARCHAR(20) NOT NULL,
  nama_panggilan VARCHAR(50) NOT NULL,
  sales_dim5 VARCHAR(20) NULL,
  catatan VARCHAR(150) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_ka (tahun, kode_grup, nama_panggilan, sales_dim5),
  KEY idx_ka_sales (tahun, sales_dim5),
  CONSTRAINT fk_ka_grup FOREIGN KEY (tahun, kode_grup) REFERENCES komisi_grup (tahun, kode)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS komisi_lintas (
  id INT NOT NULL AUTO_INCREMENT,
  tahun SMALLINT NOT NULL,
  brand_dijual VARCHAR(20) NOT NULL,
  brand_asal_penjual VARCHAR(20) NOT NULL,
  tipe_penjual ENUM('SEMUA','REGULER','COUNTER') NOT NULL DEFAULT 'SEMUA',
  aturan ENUM('FLAT','IKUT_GRUP_ASAL') NOT NULL,
  persen DECIMAL(7,4) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kl (tahun, brand_dijual, brand_asal_penjual, tipe_penjual)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS komisi_tim_anggota (
  id INT NOT NULL AUTO_INCREMENT,
  manager_dim5 VARCHAR(20) NOT NULL,
  sales_dim5 VARCHAR(20) NOT NULL,
  aktif TINYINT(1) NOT NULL DEFAULT 1,
  PRIMARY KEY (id),
  UNIQUE KEY uk_kta (manager_dim5, sales_dim5)
) ENGINE=InnoDB;
