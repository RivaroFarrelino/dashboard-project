import hmac
import logging
import os
from datetime import date, datetime
from decimal import Decimal

from flask import Flask, Response, jsonify, redirect, render_template, request
from flask.json.provider import DefaultJSONProvider
from werkzeug.exceptions import HTTPException

import db

BRAND = "AST"
BRAND_NAMA = "Astral"
PESAN_GAGAL = "Data belum bisa dimuat. Coba lagi beberapa saat lagi."


def _json_default(o):
    if isinstance(o, Decimal):
        return float(o)
    if isinstance(o, (date, datetime)):
        return o.isoformat()
    return DefaultJSONProvider.default(o)


class JsonProvider(DefaultJSONProvider):
    default = staticmethod(_json_default)
    ensure_ascii = False


app = Flask(__name__)
app.json = JsonProvider(app)
app.teardown_appcontext(db.close_db)
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dashboard")


@app.errorhandler(Exception)
def handle_error(err):
    if isinstance(err, HTTPException):
        if request.path.startswith("/api/"):
            return jsonify(pesan="Data tidak ditemukan." if err.code == 404 else PESAN_GAGAL), err.code
        return err
    log.exception("Gagal memproses %s", request.path)
    if request.path.startswith("/api/"):
        return jsonify(pesan=PESAN_GAGAL), 500
    return render_template("error.html", pesan=PESAN_GAGAL), 500


@app.before_request
def cek_akses():
    user = os.environ.get("BASIC_AUTH_USER")
    password = os.environ.get("BASIC_AUTH_PASSWORD")
    if not user or not password or request.path == "/healthz":
        return None
    auth = request.authorization
    if auth and hmac.compare_digest(auth.username or "", user) and hmac.compare_digest(auth.password or "", password):
        return None
    return Response("Silakan login untuk membuka dashboard.", 401, {"WWW-Authenticate": 'Basic realm="Dashboard Project"'})


@app.context_processor
def inject_globals():
    return {"brand_nama": BRAND_NAMA}


@app.get("/")
def index():
    return redirect("/project")


@app.get("/project")
def page_project():
    return render_template("project.html", active="project")


@app.get("/omzet")
def page_omzet():
    return render_template("segera.html", active="omzet", judul="Omzet")


@app.get("/penagihan-fg")
def page_penagihan():
    return render_template("segera.html", active="penagihan", judul="Penagihan FG")


@app.get("/healthz")
def healthz():
    db.query_one("SELECT 1 AS ok")
    return jsonify(status="ok")


@app.get("/api/info")
def api_info():
    row = db.query_one(
        "SELECT DATE_FORMAT(CONVERT_TZ(MAX(finished_at), '+00:00', '+07:00'), '%%Y-%%m-%%d %%H:%%i') AS sync_terakhir "
        "FROM app_sync_log WHERE brand = %s AND status = 'OK'",
        (BRAND,),
    )
    return jsonify(sync_terakhir=row["sync_terakhir"] if row else None)


@app.get("/api/projects")
def api_projects():
    q = request.args.get("q", "").strip()
    like = f"%{q}%"
    rows = db.query(
        "SELECT project_code AS kode, MAX(project_name) AS nama, MAX(sell_to_customer_name) AS customer, "
        "COUNT(*) AS jml_so, MAX(posting_date) AS so_terakhir "
        "FROM bc_sales_header "
        "WHERE brand = %s AND project_code IS NOT NULL "
        "AND (project_code LIKE %s OR project_name LIKE %s OR sell_to_customer_name LIKE %s OR no LIKE %s) "
        "GROUP BY project_code ORDER BY so_terakhir DESC LIMIT 30",
        (BRAND, like, like, like, like),
    )
    return jsonify(rows)


@app.get("/api/project/<kode>")
def api_project(kode):
    so_rows = db.query(
        "SELECT * FROM v_project_so WHERE project_code = %s ORDER BY tanggal_so DESC, so_no DESC",
        (kode,),
    )
    if not so_rows:
        return jsonify(pesan="Project tidak ditemukan."), 404

    komisi = {
        r["so_no"]: r
        for r in db.query(
            "SELECT so_no, grup, pct_komisi, nilai_komisi, grup_tim, pct_tim, nilai_tim, "
            "tanggal_keluar_komisi, bulan_komisi FROM v_komisi_so WHERE project_code = %s",
            (kode,),
        )
    }
    omzet = {}
    for r in db.query(
        "SELECT o.so_no, o.omzet_ke, o.tanggal, o.nilai FROM v_omzet o "
        "JOIN bc_sales_header h ON h.no = o.so_no WHERE h.brand = %s AND h.project_code = %s "
        "ORDER BY o.so_no, o.omzet_ke",
        (BRAND, kode),
    ):
        omzet.setdefault(r["so_no"], []).append({"ke": r["omzet_ke"], "tanggal": r["tanggal"], "nilai": r["nilai"]})

    qty = db.query_one(
        "SELECT SUM(c.qty_fg) AS qty_fg, SUM(c.qty_fg_finish) AS qty_fg_finish, "
        "SUM(c.qty_item) AS qty_item, SUM(c.qty_ship) AS qty_ship "
        "FROM app_calc_so c JOIN bc_sales_header h ON h.no = c.so_no "
        "WHERE h.brand = %s AND h.project_code = %s",
        (BRAND, kode),
    ) or {}

    for r in so_rows:
        k = komisi.get(r["so_no"], {})
        r["komisi"] = {key: k.get(key) for key in (
            "grup", "pct_komisi", "nilai_komisi", "grup_tim", "pct_tim", "nilai_tim",
            "tanggal_keluar_komisi", "bulan_komisi")}
        r["omzet"] = omzet.get(r["so_no"], [])

    kontrak = sum(float(r["kontrak"] or 0) for r in so_rows)
    pi_created = sum(float(r["pi_created"] or 0) for r in so_rows)
    paid = sum(float(r["paid"] or 0) for r in so_rows)
    invoice = sum(float(r["invoice_created"] or 0) for r in so_rows)

    def pct(a, b):
        a, b = float(a or 0), float(b or 0)
        return round(a / b * 100, 2) if b > 0 else None

    utama = so_rows[0]
    header = {
        "kode": kode,
        "nama": utama["project_name"],
        "customer": utama["customer"],
        "alamat": utama["alamat"],
        "jml_so": len(so_rows),
        "jml_closed": sum(1 for r in so_rows if r["is_closed"]),
        "kontrak": kontrak,
        "pi_created": pi_created,
        "pct_pi": pct(pi_created, kontrak),
        "paid": paid,
        "pct_paid": pct(paid, kontrak),
        "invoice_created": invoice,
        "sisa_ots": kontrak - invoice,
        "pct_fg_finish": pct(qty.get("qty_fg_finish"), qty.get("qty_fg")),
        "pct_ship": pct(qty.get("qty_ship"), qty.get("qty_item")),
    }
    return jsonify(header=header, so=so_rows)


@app.get("/api/so/<so_no>/lines")
def api_so_lines(so_no):
    rows = db.query(
        "SELECT line_no, item_no, nama_item, lebar, tinggi, qty, harga, nilai, is_fg, tgl_output, qty_output, "
        "prod_order_no, due_finish, tgl_ship, qty_ship, qty_tagih, pct_fg_finish, pct_ship "
        "FROM v_so_line WHERE so_no = %s ORDER BY line_no",
        (so_no,),
    )
    return jsonify(rows)


@app.get("/api/so/<so_no>/dokumen")
def api_so_dokumen(so_no):
    so = db.query_one(
        "SELECT so_no, project_code, customer, currency_code, kontrak, pi_created, pct_pi, paid, pct_paid, "
        "invoice_created, sisa_ots FROM v_project_so WHERE so_no = %s",
        (so_no,),
    )
    if not so:
        return jsonify(pesan="SO tidak ditemukan."), 404

    proforma = db.query(
        "SELECT h.no, h.posting_date, h.status_pi, h.doc_status, h.nomor_so, h.proforma_type, h.due_date, "
        "h.currency_code, h.kurs, h.external_document_no, h.remark, h.posting_description, "
        "(h.missing_in_bc_since IS NOT NULL) AS hilang_di_bc, "
        "COALESCE((SELECT SUM(pl.amount_ori) FROM bc_proforma_line pl WHERE pl.document_no = h.no), 0) AS amount_ori, "
        "COALESCE((SELECT SUM(ci.amount) FROM bc_cashier_in_line ci WHERE ci.document_no = h.no AND ci.brand = %s), 0) AS dibayar "
        "FROM bc_proforma_header h WHERE h.nomor_so = %s ORDER BY h.posting_date, h.no",
        (BRAND, so_no),
    )
    for p in proforma:
        kurs = float(p["kurs"] or 0)
        p["nilai"] = float(p["amount_ori"] or 0) * kurs if kurs > 0 else None

    invoice = db.query(
        "SELECT l.psi_no, l.posting_date, l.psi_status, l.status_reason, l.link_method, l.nilai_psi, l.nilai_bersih, "
        "p.external_document_no, p.posting_description, "
        "(SELECT MAX(c.closed_at_date) FROM bc_cust_ledger_entry c WHERE c.document_no = l.psi_no "
        "AND c.document_type = 'Invoice' AND c.is_open = 0) AS tanggal_bayar "
        "FROM app_psi_link l LEFT JOIN bc_psi_header p ON p.no = l.psi_no "
        "WHERE l.so_no = %s ORDER BY l.posting_date, l.psi_no",
        (so_no,),
    )
    return jsonify(so=so, proforma=proforma, invoice=invoice)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)