import hashlib
import hmac
import logging
import os
import re
import secrets
import time
from datetime import timedelta
from urllib.parse import urlsplit

from flask import Blueprint, flash, g, jsonify, redirect, render_template, request, session, url_for
from werkzeug.security import check_password_hash, generate_password_hash

import db

bp = Blueprint("auth", __name__)
log = logging.getLogger("dashboard.auth")

PERAN = {"SUPER": "Super", "FINANCE": "Finance"}
MAKS_GAGAL_USER = 5
MAKS_GAGAL_IP = 20
MENIT_KUNCI = 15
JAM_SESI = 12
HARI_INGAT = 30
POLA_USERNAME = re.compile(r"^[a-z0-9._-]{3,30}$")
HURUF_SEMENTARA = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
TANPA_LOGIN = {"auth.login", "healthz", "static"}
BEBAS_GANTI = {"auth.akun", "auth.ganti_password", "auth.logout", "api_info"}
PESAN_SESI = "Sesi berakhir. Silakan login lagi."
PESAN_SALAH = "Username atau password salah."
PESAN_KEDALUWARSA = "Halaman sudah terlalu lama dibuka. Silakan coba lagi."

_HASH_DUMMY = generate_password_hash(secrets.token_hex(16))


def init_app(app):
    kunci = os.environ.get("SECRET_KEY", "").strip()
    if not kunci:
        log.warning("SECRET_KEY belum diisi, memakai kunci turunan dari DB_PASSWORD")
        kunci = hashlib.sha256(("dashboard-project-sesi:" + os.environ.get("DB_PASSWORD", "")).encode()).hexdigest()
    app.secret_key = kunci
    app.config.update(
        SESSION_COOKIE_NAME="dp_sesi",
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE", "1") != "0",
        PERMANENT_SESSION_LIFETIME=timedelta(days=HARI_INGAT),
        MAX_CONTENT_LENGTH=1024 * 1024,
    )
    app.register_blueprint(bp)
    app.before_request(cek_login)
    app.after_request(header_keamanan)
    app.jinja_env.globals.update(csrf_token=csrf_token, nama_peran=lambda p: PERAN.get(p, p))


def csrf_token():
    if "csrf" not in session:
        session["csrf"] = secrets.token_urlsafe(32)
    return session["csrf"]


def _csrf_valid():
    kirim = request.headers.get("X-CSRF-Token") or request.form.get("csrf", "")
    simpan = session.get("csrf", "")
    return bool(simpan) and hmac.compare_digest(kirim, simpan)


def ip_klien():
    for h in ("CF-Connecting-IP", "X-Real-IP"):
        v = request.headers.get(h, "").strip()
        if v:
            return v[:45]
    xff = request.headers.get("X-Forwarded-For", "")
    if xff:
        return xff.split(",")[0].strip()[:45]
    return (request.remote_addr or "")[:45]


def catat(aksi, username=None, user_id=None, keterangan=None, oleh=None):
    try:
        db.query(
            "INSERT INTO app_login_log (username, user_id, aksi, keterangan, ip, user_agent, oleh) "
            "VALUES (%s, %s, %s, %s, %s, %s, %s)",
            ((username or "")[:30] or None, user_id, aksi, (keterangan or "")[:100] or None, ip_klien(),
             (request.user_agent.string or "")[:255] or None, oleh),
        )
    except Exception:
        log.exception("Gagal mencatat log login %s", aksi)


def password_sementara():
    return "-".join("".join(secrets.choice(HURUF_SEMENTARA) for _ in range(4)) for _ in range(3))


def cek_password_baru(baru, ulang, username, lama=None):
    if not baru:
        return "Isi password baru."
    if len(baru) > 128:
        return "Password baru terlalu panjang."
    if baru != ulang:
        return "Ulangi password baru belum sama."
    if baru.lower() == (username or "").lower():
        return "Password tidak boleh sama dengan username."
    if lama is not None and baru == lama:
        return "Password baru harus berbeda dari password lama."
    return None


def _muat_user():
    uid = session.get("uid")
    if not uid:
        return None
    if time.time() > float(session.get("exp", 0)):
        session.clear()
        return None
    u = db.query_one(
        "SELECT id, username, nama, peran, is_active, harus_ganti, versi_sesi, "
        "DATE_FORMAT(last_login_at, '%%Y-%%m-%%d %%H:%%i') AS last_login_at, "
        "DATE_FORMAT(password_changed_at, '%%Y-%%m-%%d %%H:%%i') AS password_changed_at "
        "FROM app_user WHERE id = %s",
        (uid,),
    )
    if not u or not u["is_active"] or u["versi_sesi"] != session.get("ver"):
        session.clear()
        return None
    return u


def _tolak(pesan, kode):
    if request.path.startswith("/api/"):
        return jsonify(pesan=pesan), kode
    return None


def cek_login():
    g.user = None
    if request.endpoint in ("static", "healthz"):
        return None
    g.user = _muat_user()
    if request.method == "POST" and not _csrf_valid():
        if request.endpoint == "auth.login":
            return None
        return _tolak(PESAN_KEDALUWARSA, 400) or redirect(url_for("auth.login"))
    if request.endpoint in TANPA_LOGIN:
        return None
    if g.user is None:
        tujuan = request.full_path if request.query_string else request.path
        return _tolak(PESAN_SESI, 401) or redirect(url_for("auth.login", next=tujuan))
    if g.user["harus_ganti"] and request.endpoint not in BEBAS_GANTI:
        return _tolak("Ganti password dulu sebelum melanjutkan.", 403) or redirect(url_for("auth.akun"))
    return None


def header_keamanan(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    resp.headers.setdefault("Referrer-Policy", "same-origin")
    if request.endpoint != "static":
        resp.headers["Cache-Control"] = "no-store"
    return resp


def butuh_peran(*peran):
    if g.user is None or g.user["peran"] not in peran:
        return _tolak("Anda tidak punya akses untuk tindakan ini.", 403) or redirect(url_for("index"))
    return None


def _tujuan_aman(nilai):
    if not nilai:
        return None
    nilai = nilai.replace("\\", "/")
    bagian = urlsplit(nilai)
    if bagian.scheme or bagian.netloc or not nilai.startswith("/") or nilai.startswith("//"):
        return None
    if nilai.startswith(("/login", "/logout", "/api/")):
        return None
    return nilai.rstrip("?") or None


def _mulai_sesi(u, ingat):
    session.clear()
    session.permanent = bool(ingat)
    session["uid"] = u["id"]
    session["ver"] = u["versi_sesi"]
    session["exp"] = time.time() + (HARI_INGAT * 86400 if ingat else JAM_SESI * 3600)
    session["csrf"] = secrets.token_urlsafe(32)


@bp.route("/login", methods=["GET", "POST"])
def login():
    tujuan = _tujuan_aman(request.values.get("next"))
    if g.user is not None and request.method == "GET":
        return redirect(tujuan or url_for("index"))
    if request.method == "GET":
        return render_template("login.html", username="", next=tujuan or "", pesan=None)

    username = request.form.get("username", "").strip().lower()[:30]
    password = request.form.get("password", "")[:128]
    ingat = request.form.get("ingat") == "1"

    def gagal(pesan, kode=401):
        return render_template("login.html", username=username, next=tujuan or "", pesan=pesan), kode

    if not _csrf_valid():
        return gagal(PESAN_KEDALUWARSA, 400)
    if not username or not password:
        return gagal("Isi username dan password.", 400)

    ip = ip_klien()
    blokir = db.query_one(
        "SELECT COUNT(*) AS n FROM app_login_log WHERE ip = %s AND aksi IN ('GAGAL', 'DIKUNCI', 'DIBLOKIR') "
        "AND created_at > NOW() - INTERVAL %s MINUTE",
        (ip, MENIT_KUNCI),
    )
    if blokir and blokir["n"] >= MAKS_GAGAL_IP:
        catat("DIBLOKIR", username, keterangan="terlalu banyak percobaan dari IP")
        return gagal(f"Terlalu banyak percobaan login dari perangkat ini. Coba lagi {MENIT_KUNCI} menit lagi.", 429)

    u = db.query_one(
        "SELECT id, username, nama, password_hash, is_active, harus_ganti, versi_sesi, gagal_login, "
        "GREATEST(0, CEIL(TIMESTAMPDIFF(SECOND, NOW(), kunci_sampai) / 60)) AS sisa_kunci "
        "FROM app_user WHERE username = %s",
        (username,),
    )
    if u and u["sisa_kunci"]:
        catat("DIKUNCI", username, u["id"])
        return gagal(f"Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi {int(u['sisa_kunci'])} menit lagi.", 429)

    cocok = check_password_hash(u["password_hash"] if u else _HASH_DUMMY, password)
    if not u or not cocok:
        if u:
            kunci = u["gagal_login"] + 1 >= MAKS_GAGAL_USER
            db.query(
                "UPDATE app_user SET gagal_login = IF(%s, 0, gagal_login + 1), "
                "kunci_sampai = IF(%s, NOW() + INTERVAL %s MINUTE, kunci_sampai) WHERE id = %s",
                (kunci, kunci, MENIT_KUNCI, u["id"]),
            )
            catat("GAGAL", username, u["id"], "password salah" + (", akun dikunci" if kunci else ""))
            if kunci:
                return gagal(f"Akun dikunci sementara karena terlalu banyak percobaan. Coba lagi {MENIT_KUNCI} menit lagi.", 429)
        else:
            catat("GAGAL", username, keterangan="username tidak dikenal")
        return gagal(PESAN_SALAH)

    if not u["is_active"]:
        catat("GAGAL", username, u["id"], "akun nonaktif")
        return gagal("Akun ini sudah dinonaktifkan. Hubungi admin dashboard.", 403)

    db.query(
        "UPDATE app_user SET gagal_login = 0, kunci_sampai = NULL, last_login_at = NOW() WHERE id = %s",
        (u["id"],),
    )
    _mulai_sesi(u, ingat)
    catat("LOGIN", username, u["id"], "ingat 30 hari" if ingat else None)
    db.query("DELETE FROM app_login_log WHERE created_at < NOW() - INTERVAL 180 DAY LIMIT 1000")
    log.info("Login berhasil: %s", username)
    if u["harus_ganti"]:
        return redirect(url_for("auth.akun"))
    return redirect(tujuan or url_for("index"))


@bp.post("/logout")
def logout():
    if g.user:
        catat("LOGOUT", g.user["username"], g.user["id"])
    session.clear()
    flash("Anda sudah keluar.", "info")
    return redirect(url_for("auth.login"))


@bp.get("/akun")
def akun():
    return render_template("akun.html", active="akun", pesan=None)


@bp.post("/akun/password")
def ganti_password():
    u = g.user
    lama = request.form.get("lama", "")[:128]
    baru = request.form.get("baru", "")[:128]
    ulang = request.form.get("ulang", "")[:128]
    row = db.query_one("SELECT password_hash FROM app_user WHERE id = %s", (u["id"],))
    if not row or not check_password_hash(row["password_hash"], lama):
        return render_template("akun.html", active="akun", pesan="Password lama salah."), 400
    salah = cek_password_baru(baru, ulang, u["username"], lama)
    if salah:
        return render_template("akun.html", active="akun", pesan=salah), 400
    db.query(
        "UPDATE app_user SET password_hash = %s, harus_ganti = 0, versi_sesi = versi_sesi + 1, "
        "password_changed_at = NOW() WHERE id = %s",
        (generate_password_hash(baru), u["id"]),
    )
    session["ver"] = u["versi_sesi"] + 1
    session["csrf"] = secrets.token_urlsafe(32)
    catat("GANTI_PASSWORD", u["username"], u["id"], oleh=u["username"])
    flash("Password berhasil diganti. Perangkat lain yang memakai akun ini otomatis keluar.", "ok")
    return redirect(url_for("auth.akun"))


@bp.get("/pengguna")
def pengguna():
    tolak = butuh_peran("SUPER")
    if tolak:
        return tolak
    return render_template("pengguna.html", active="pengguna", peran=PERAN)


@bp.get("/api/pengguna")
def api_pengguna():
    tolak = butuh_peran("SUPER")
    if tolak:
        return tolak
    rows = db.query(
        "SELECT id, username, nama, peran, is_active, harus_ganti, "
        "(kunci_sampai IS NOT NULL AND kunci_sampai > NOW()) AS dikunci, "
        "DATE_FORMAT(last_login_at, '%%Y-%%m-%%d %%H:%%i') AS last_login_at, "
        "DATE_FORMAT(created_at, '%%Y-%%m-%%d') AS created_at, created_by "
        "FROM app_user ORDER BY is_active DESC, nama",
        (),
    )
    return jsonify(rows=rows, saya=g.user["id"])


def _data_pengguna(data):
    nama = " ".join(str(data.get("nama", "")).split())[:100]
    peran = str(data.get("peran", ""))
    if len(nama) < 2:
        return None, None, "Nama minimal 2 karakter."
    if peran not in PERAN:
        return None, None, "Pilih peran yang tersedia."
    return nama, peran, None


@bp.post("/api/pengguna")
def api_tambah_pengguna():
    tolak = butuh_peran("SUPER")
    if tolak:
        return tolak
    data = request.get_json(silent=True) or {}
    nama, peran, salah = _data_pengguna(data)
    username = str(data.get("username", "")).strip().lower()
    if not salah and not POLA_USERNAME.match(username):
        salah = "Username 3–30 karakter: huruf kecil, angka, titik, strip, atau garis bawah."
    if salah:
        return jsonify(pesan=salah), 400
    if db.query_one("SELECT id FROM app_user WHERE username = %s", (username,)):
        return jsonify(pesan="Username sudah dipakai."), 409
    sementara = password_sementara()
    db.query(
        "INSERT INTO app_user (username, nama, password_hash, peran, harus_ganti, created_by) "
        "VALUES (%s, %s, %s, %s, 1, %s)",
        (username, nama, generate_password_hash(sementara), peran, g.user["username"]),
    )
    baru = db.query_one("SELECT id FROM app_user WHERE username = %s", (username,))
    catat("TAMBAH_USER", username, baru["id"] if baru else None, PERAN[peran], g.user["username"])
    return jsonify(username=username, password_sementara=sementara), 201


@bp.post("/api/pengguna/<int:uid>")
def api_ubah_pengguna(uid):
    tolak = butuh_peran("SUPER")
    if tolak:
        return tolak
    data = request.get_json(silent=True) or {}
    nama, peran, salah = _data_pengguna(data)
    if salah:
        return jsonify(pesan=salah), 400
    aktif = 1 if data.get("is_active", True) else 0
    target = db.query_one("SELECT id, username, peran, is_active FROM app_user WHERE id = %s", (uid,))
    if not target:
        return jsonify(pesan="Pengguna tidak ditemukan."), 404
    if uid == g.user["id"] and (peran != "SUPER" or not aktif):
        return jsonify(pesan="Anda tidak bisa menurunkan peran atau menonaktifkan akun sendiri."), 400
    keluar = int(peran != target["peran"] or aktif != target["is_active"])
    db.query(
        "UPDATE app_user SET nama = %s, peran = %s, is_active = %s, versi_sesi = versi_sesi + %s WHERE id = %s",
        (nama, peran, aktif, keluar, uid),
    )
    perubahan = f"{PERAN[peran]}, {'aktif' if aktif else 'nonaktif'}"
    catat("UBAH_USER", target["username"], uid, perubahan, g.user["username"])
    return jsonify(ok=True)


@bp.post("/api/pengguna/<int:uid>/reset")
def api_reset_pengguna(uid):
    tolak = butuh_peran("SUPER")
    if tolak:
        return tolak
    target = db.query_one("SELECT id, username FROM app_user WHERE id = %s", (uid,))
    if not target:
        return jsonify(pesan="Pengguna tidak ditemukan."), 404
    if uid == g.user["id"]:
        return jsonify(pesan="Untuk akun sendiri, ganti password lewat menu Akun."), 400
    sementara = password_sementara()
    db.query(
        "UPDATE app_user SET password_hash = %s, harus_ganti = 1, gagal_login = 0, kunci_sampai = NULL, "
        "versi_sesi = versi_sesi + 1 WHERE id = %s",
        (generate_password_hash(sementara), uid),
    )
    catat("RESET_PASSWORD", target["username"], uid, oleh=g.user["username"])
    return jsonify(username=target["username"], password_sementara=sementara)