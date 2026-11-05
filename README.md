# Dashboard Project

Aplikasi web Flask untuk dashboard project per brand (Part 1: Astral). Data dibaca dari database `dashboard_project` di MariaDB, yang diisi oleh workflow n8n **Sync BC Astral**.

## Struktur folder

```
dashboard-project/
├── app.py
├── db.py
├── requirements.txt
├── Dockerfile
├── .dockerignore
├── .gitignore
├── .env.example
├── templates/
│   ├── base.html
│   ├── project.html
│   ├── segera.html
│   └── error.html
└── static/
    ├── css/app.css
    └── js/
        ├── common.js
        └── project.js
```

## Environment variable

| Nama | Isi |
|---|---|
| `DB_HOST` | Host MariaDB di Coolify (nama internal container) |
| `DB_PORT` | `3306` |
| `DB_USER` | `dashboard_app` |
| `DB_PASSWORD` | Password user `dashboard_app` |
| `DB_NAME` | `dashboard_project` |
| `BASIC_AUTH_USER` | Username sementara untuk membuka dashboard |
| `BASIC_AUTH_PASSWORD` | Password sementara untuk membuka dashboard |

Kalau `BASIC_AUTH_USER` dan `BASIC_AUTH_PASSWORD` dikosongkan, dashboard terbuka tanpa login.

## Deploy di Coolify

1. Repo GitHub berisi folder di atas.
2. Coolify → New Resource → Private Repository (GitHub App) → pilih repo.
3. Build Pack: **Dockerfile**. Port: **8000**.
4. Isi environment variable sesuai tabel.
5. Domain: misalnya `https://dashboardproject.automasiworkflow.com`.
6. Network: samakan dengan aplikasi lain yang sudah bisa mengakses MariaDB (Connect to Predefined Network).
7. Health check path: `/healthz`.
8. Deploy.

## Endpoint

| Path | Isi |
|---|---|
| `/project?kode=KODE` | Halaman Project |
| `/api/projects?q=` | Pencarian project |
| `/api/project/<kode>` | Header project + daftar SO |
| `/api/so/<so>/lines` | Sales lines |
| `/api/so/<so>/dokumen` | Proforma + invoice |
| `/healthz` | Cek koneksi database |