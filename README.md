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

## Endpoint

| Path | Isi |
|---|---|
| `/project?kode=KODE` | Halaman Project |
| `/api/projects?q=` | Pencarian project |
| `/api/project/<kode>` | Header project + daftar SO |
| `/api/so/<so>/lines` | Sales lines |
| `/api/so/<so>/dokumen` | Proforma + invoice |
| `/healthz` | Cek koneksi database |