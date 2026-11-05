USE dashboard_project;

START TRANSACTION;

DELETE FROM komisi_anggota WHERE tahun = 2026;
DELETE FROM komisi_lintas WHERE tahun = 2026;

INSERT INTO komisi_grup (tahun, kode, brand, tipe, is_counter, nama, batas_omzet, persen_bawah, persen_atas, aktif) VALUES
  (2026, 'FG-A',     'AST',  'INDIVIDU', 0, 'Astral FG - Yozella, Stephanie, Sherry', 2500000000.00, 0.0050, 0.0100, 1),
  (2026, 'FG-B',     'AST',  'INDIVIDU', 0, 'Astral FG - Alessandro',                 2000000000.00, 0.0050, 0.0100, 1),
  (2026, 'FG-C',     'AST',  'INDIVIDU', 0, 'Astral FG - Cahyo, Haneke',              2000000000.00, 0.0050, 0.0100, 1),
  (2026, 'FG-CTR',   'AST',  'INDIVIDU', 1, 'Astral FG - Sales Counter',               500000000.00, 0.0050, 0.0100, 1),
  (2026, 'ASTA-SNR', 'ASTA', 'INDIVIDU', 0, 'ASTA - Senior',                          1000000000.00, 0.0050, 0.0100, 1),
  (2026, 'ASTA-A',   'ASTA', 'INDIVIDU', 0, 'ASTA - Reguler',                          500000000.00, 0.0050, 0.0100, 1),
  (2026, 'FRS-A',    'FOR',  'INDIVIDU', 0, 'Forise - Reguler',                       1000000000.00, 0.0050, 0.0100, 1),
  (2026, 'FRS-CTR',  'FOR',  'INDIVIDU', 1, 'Forise - Sales Counter',                  600000000.00, 0.0050, 0.0100, 1),
  (2026, 'CRA-A',    'CAR',  'INDIVIDU', 0, 'Carra - Reguler',                        1000000000.00, 0.0050, 0.0100, 1),
  (2026, 'TIM-FG',   'AST',  'TIM',      0, 'Komisi Tim Astral FG (Krisna)',         10000000000.00, 0.0050, 0.0100, 1),
  (2026, 'TIM-ASTA', 'ASTA', 'TIM',      0, 'Komisi Tim ASTA (Krisna)',               4000000000.00, 0.0050, 0.0100, 1),
  (2026, 'TIM-FRS',  'FOR',  'TIM',      0, 'Komisi Tim Forise (Nanda)',              2000000000.00, 0.0050, 0.0100, 1),
  (2026, 'TIM-CRA',  'CAR',  'TIM',      0, 'Komisi Tim Carra (Nanda)',               2000000000.00, 0.0050, 0.0100, 1)
ON DUPLICATE KEY UPDATE
  brand = VALUES(brand),
  tipe = VALUES(tipe),
  is_counter = VALUES(is_counter),
  nama = VALUES(nama),
  batas_omzet = VALUES(batas_omzet),
  persen_bawah = VALUES(persen_bawah),
  persen_atas = VALUES(persen_atas),
  aktif = VALUES(aktif);

INSERT INTO komisi_anggota (tahun, kode_grup, nama_panggilan, sales_dim5, catatan) VALUES
  (2026, 'FG-A',     'Yozella',          'YOZELLA ADJIE PRATAM', NULL),
  (2026, 'FG-A',     'Stephanie',        'STEPHANIE MARCELLA',   NULL),
  (2026, 'FG-A',     'Sherry',           'SHERRY SURYANI WIJOY', NULL),
  (2026, 'FG-B',     'Alessandro',       'ALESSANDRO KEVIN',     NULL),
  (2026, 'FG-C',     'Cahyo',            'CAHYONO',              NULL),
  (2026, 'FG-C',     'Haneke',           'HANEKE TIARA',         NULL),
  (2026, 'FG-CTR',   'Diva',             'DIVA RAHMADANI',       NULL),
  (2026, 'FG-CTR',   'Talia',            'TALIA AYUNINGTYAS UT', NULL),
  (2026, 'FG-CTR',   'Hotmauli',         'HOTMAULI SINAGA',      NULL),
  (2026, 'FG-CTR',   'Jehsica',          'JESIHCA CRISTIN',      NULL),
  (2026, 'FG-CTR',   'Siti Fatimah Dea', 'SITI FATHIMAH DEA AD', NULL),
  (2026, 'FG-CTR',   'Utami',            'SHAFIRA UTAMI',        'Tebakan dari sheet SalesTeamMember, perlu konfirmasi'),
  (2026, 'FG-CTR',   'Adinda',           'ADINDA SITI',          NULL),
  (2026, 'FG-CTR',   'Wela',             'WELA RAHMADANI',       NULL),
  (2026, 'FG-CTR',   'Nova Lorenza',     'NOVIA LORENZA TUMANG', NULL),
  (2026, 'ASTA-SNR', 'Filia',            'FILIA KHARIZA',        NULL),
  (2026, 'ASTA-A',   'Linggar',          'LINGGAR DANI ULI NUH', NULL),
  (2026, 'ASTA-A',   'Ahmad',            NULL,                   'Kode Dim5 belum dipilih: AHMAD AMIR YAHYA / AHMAD MIFTAHUDDIN / AHMAD SUDRAJAT'),
  (2026, 'ASTA-A',   'Dewi',             NULL,                   'Kode Dim5 belum dipilih: DEWI CHRISTINA / DEWI CRISTI ARITONAN / DEWI EKA WATI / DEWI NURHAYATI'),
  (2026, 'ASTA-A',   'Tessa',            'TESSA SEPTIANI',       NULL),
  (2026, 'FRS-A',    'Suryo',            'SURYO WAHYUDI',        'Suryo punya 2 kode Dim5'),
  (2026, 'FRS-A',    'Suryo',            'MUHAMMAD SURYO',       'Suryo punya 2 kode Dim5'),
  (2026, 'FRS-CTR',  'Anggi',            'ANGGI YUNISYAH ABADI', NULL),
  (2026, 'FRS-CTR',  'Dhaeh',            'DHAEH P SLAMIATI',     NULL),
  (2026, 'CRA-A',    'Suryo',            'SURYO WAHYUDI',        'Suryo punya 2 kode Dim5'),
  (2026, 'CRA-A',    'Suryo',            'MUHAMMAD SURYO',       'Suryo punya 2 kode Dim5'),
  (2026, 'TIM-FG',   'Krisna',           'KRISNA ADI WIJAYA',    'Manager'),
  (2026, 'TIM-ASTA', 'Krisna',           'KRISNA ADI WIJAYA',    'Manager'),
  (2026, 'TIM-FRS',  'Nanda',            'MADE AYU NANDA SUHAR', 'Manager, tebakan kode Dim5, perlu konfirmasi'),
  (2026, 'TIM-CRA',  'Nanda',            'MADE AYU NANDA SUHAR', 'Manager, tebakan kode Dim5, perlu konfirmasi');

INSERT INTO komisi_lintas (tahun, brand_dijual, brand_asal_penjual, tipe_penjual, aturan, persen) VALUES
  (2026, 'AST',  'ASTA', 'SEMUA',   'IKUT_GRUP_ASAL', NULL),
  (2026, 'ASTA', 'AST',  'COUNTER', 'FLAT',           0.0025),
  (2026, 'ASTA', 'AST',  'REGULER', 'FLAT',           0.0025),
  (2026, 'FOR',  'AST',  'REGULER', 'FLAT',           0.0025);

INSERT INTO komisi_tim_anggota (manager_dim5, sales_dim5, aktif) VALUES
  ('KRISNA ADI WIJAYA', 'YOZELLA ADJIE PRATAM', 1),
  ('KRISNA ADI WIJAYA', 'STEPHANIE MARCELLA',   0),
  ('KRISNA ADI WIJAYA', 'ALESSANDRO KEVIN',     1),
  ('KRISNA ADI WIJAYA', 'SHERRY SURYANI WIJOY', 1),
  ('KRISNA ADI WIJAYA', 'CAHYONO',              0),
  ('KRISNA ADI WIJAYA', 'HANEKE TIARA',         1),
  ('KRISNA ADI WIJAYA', 'DIVA RAHMADANI',       1),
  ('KRISNA ADI WIJAYA', 'TALIA AYUNINGTYAS UT', 1),
  ('KRISNA ADI WIJAYA', 'HOTMAULI SINAGA',      1),
  ('KRISNA ADI WIJAYA', 'JESIHCA CRISTIN',      1),
  ('KRISNA ADI WIJAYA', 'ADINDA SITI',          1),
  ('KRISNA ADI WIJAYA', 'SITI FATHIMAH DEA AD', 1),
  ('KRISNA ADI WIJAYA', 'SHAFIRA UTAMI',        1),
  ('KRISNA ADI WIJAYA', 'CITRA AINUN',          1),
  ('KRISNA ADI WIJAYA', 'AGUNG FIRDAUS HAMDAN', 0),
  ('KRISNA ADI WIJAYA', 'ANDI WIJAYA',          0)
ON DUPLICATE KEY UPDATE aktif = VALUES(aktif);

COMMIT;
