import json
import logging
import math
import os
import re
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal
from urllib import error as urlerror, request as urlrequest

from flask import Flask, g, jsonify, redirect, render_template, request
from flask.json.provider import DefaultJSONProvider
from werkzeug.exceptions import HTTPException

import auth
import db

BRAND = "AST"
BRAND_NAMA = "Astral"
PESAN_GAGAL = "Data belum bisa dimuat. Coba lagi beberapa saat lagi."
ASET_VERSI = str(int(max(
    (os.path.getmtime(os.path.join(d, f)) for d, _, fs in os.walk(os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")) for f in fs),
    default=0,
)))


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
auth.init_app(app)
logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"), format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("dashboard")
N8N_PROFORMA_URL = os.environ.get("N8N_PROFORMA_URL", "").strip()
N8N_PROFORMA_TOKEN = os.environ.get("N8N_PROFORMA_TOKEN", "").strip()
PI_ITEM = "SALES-AST-PL"
PI_LOKASI = "FG-AST"
PI_JATUH_TEMPO = 30
PI_TIPE = ("Phase", "Final")


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


@app.context_processor
def inject_globals():
    return {"brand_nama": BRAND_NAMA, "user": g.get("user"), "aset_v": ASET_VERSI}


@app.get("/")
def index():
    return redirect("/project")


@app.get("/project")
def page_project():
    return render_template("project.html", active="project")


@app.get("/omzet")
def page_omzet():
    return render_template("omzet.html", active="omzet")


@app.get("/healthz")
def healthz():
    db.query_one("SELECT 1 AS ok")
    return jsonify(status="ok")


@app.get("/api/info")
def api_info():
    row = db.query_one(
        "SELECT DATE_FORMAT(MAX(finished_at), '%%Y-%%m-%%d %%H:%%i') AS sync_terakhir "
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
        "COUNT(*) AS jml_so, MAX(posting_date) AS so_terakhir, "
        "IF(%s = '', NULL, MAX(CASE WHEN no LIKE %s THEN no END)) AS so_cocok "
        "FROM bc_sales_header "
        "WHERE brand = %s AND project_code IS NOT NULL "
        "AND (project_code LIKE %s OR project_name LIKE %s OR sell_to_customer_name LIKE %s OR no LIKE %s) "
        "GROUP BY project_code ORDER BY so_terakhir DESC LIMIT 30",
        (q, like, BRAND, like, like, like, like),
    )
    return jsonify(rows)


UKURAN_DAFTAR = 50
URUT_DAFTAR = {
    "kode": "kode", "nama": "nama", "customer": "customer", "sales": "sales", "jml_so": "jml_so",
    "kontrak": "kontrak", "pct_paid": "pct_paid", "pct_fg": "pct_fg", "pct_ship": "pct_ship",
    "sisa_ots": "sisa_ots", "so_terakhir": "so_terakhir",
}
TGL_SO = "COALESCE(h.order_date, h.posting_date)"
SQL_DAFTAR = (
    "SELECT h.project_code AS kode, MAX(h.project_name) AS nama, MAX(h.sell_to_customer_name) AS customer, "
    "GROUP_CONCAT(DISTINCT h.sales_dim5 ORDER BY h.sales_dim5 SEPARATOR ', ') AS sales, "
    "COUNT(*) AS jml_so, SUM(h.contract_amount) AS kontrak, SUM(COALESCE(c.paid, 0)) AS paid, "
    "IF(SUM(h.contract_amount) > 0, SUM(COALESCE(c.paid, 0)) / SUM(h.contract_amount) * 100, NULL) AS pct_paid, "
    "IF(SUM(COALESCE(c.qty_fg, 0)) > 0, SUM(COALESCE(c.qty_fg_finish, 0)) / SUM(c.qty_fg) * 100, NULL) AS pct_fg, "
    "IF(SUM(COALESCE(c.qty_item, 0)) > 0, SUM(COALESCE(c.qty_ship, 0)) / SUM(c.qty_item) * 100, NULL) AS pct_ship, "
    "SUM(h.contract_amount) - SUM(COALESCE(i.inv, 0)) AS sisa_ots, "
    "MAX(" + TGL_SO + ") AS so_terakhir "
    "FROM bc_sales_header h "
    "LEFT JOIN app_calc_so c ON c.so_no = h.no "
    "LEFT JOIN (SELECT so_no, SUM(nilai_bersih) AS inv FROM app_psi_link "
    "WHERE psi_status IN ('AKTIF', 'POTONG_DP') AND so_no IS NOT NULL GROUP BY so_no) i ON i.so_no = h.no "
    "WHERE h.brand = %s AND h.project_code IS NOT NULL "
    "GROUP BY h.project_code "
)
HAVING_STATUS = {
    "bayar": {
        "belum": "SUM(COALESCE(c.paid, 0)) <= 0",
        "dp": "SUM(COALESCE(c.paid, 0)) > 0 AND SUM(h.contract_amount > 0 AND c.lunas_date IS NULL) > 0",
        "lunas": "SUM(h.contract_amount > 0) > 0 AND SUM(h.contract_amount > 0 AND c.lunas_date IS NULL) = 0",
    },
    "produksi": {
        "belum": "SUM(COALESCE(c.qty_fg, 0)) > 0 AND SUM(COALESCE(c.qty_fg_finish, 0)) = 0",
        "sebagian": "SUM(COALESCE(c.qty_fg_finish, 0)) > 0 AND SUM(COALESCE(c.qty_fg_finish, 0)) < SUM(COALESCE(c.qty_fg, 0))",
        "selesai": "SUM(COALESCE(c.qty_fg, 0)) > 0 AND SUM(COALESCE(c.qty_fg_finish, 0)) >= SUM(COALESCE(c.qty_fg, 0))",
    },
    "kirim": {
        "belum": "SUM(COALESCE(c.qty_item, 0)) > 0 AND SUM(COALESCE(c.qty_ship, 0)) = 0",
        "sebagian": "SUM(COALESCE(c.qty_ship, 0)) > 0 AND SUM(COALESCE(c.qty_ship, 0)) < SUM(COALESCE(c.qty_item, 0))",
        "selesai": "SUM(COALESCE(c.qty_item, 0)) > 0 AND SUM(COALESCE(c.qty_ship, 0)) >= SUM(COALESCE(c.qty_item, 0))",
    },
}


@app.get("/api/projects/opsi")
def api_projects_opsi():
    sales = db.query(
        "SELECT DISTINCT sales_dim5 AS sales FROM bc_sales_header "
        "WHERE brand = %s AND sales_dim5 IS NOT NULL AND sales_dim5 <> '' ORDER BY sales_dim5",
        (BRAND,),
    )
    tgl = TGL_SO.replace("h.", "")
    tahun = db.query(
        "SELECT DISTINCT YEAR(" + tgl + ") AS tahun FROM bc_sales_header "
        "WHERE brand = %s AND project_code IS NOT NULL AND " + tgl + " IS NOT NULL ORDER BY tahun DESC",
        (BRAND,),
    )
    return jsonify(sales=[r["sales"] for r in sales], tahun=[r["tahun"] for r in tahun])


@app.get("/api/projects/daftar")
def api_projects_daftar():
    a = request.args
    having, params = [], [BRAND]
    q = a.get("q", "").strip()[:100]
    if q:
        like = f"%{q}%"
        having.append("SUM(h.project_code LIKE %s OR h.project_name LIKE %s OR h.sell_to_customer_name LIKE %s OR h.no LIKE %s) > 0")
        params += [like] * 4
    sales = a.get("sales", "").strip()[:50]
    if sales:
        having.append("SUM(h.sales_dim5 = %s) > 0")
        params.append(sales)
    for kunci, pilihan in HAVING_STATUS.items():
        nilai = a.get(kunci, "")
        if nilai in pilihan:
            having.append(pilihan[nilai])
    tahun, bulan = a.get("tahun", ""), a.get("bulan", "")
    if re.fullmatch(r"\d{4}", tahun):
        if re.fullmatch(r"\d{1,2}", bulan) and 1 <= int(bulan) <= 12:
            having.append("SUM(YEAR(" + TGL_SO + ") = %s AND MONTH(" + TGL_SO + ") = %s) > 0")
            params += [int(tahun), int(bulan)]
        else:
            having.append("SUM(YEAR(" + TGL_SO + ") = %s) > 0")
            params.append(int(tahun))
    sql = SQL_DAFTAR + ("HAVING " + " AND ".join(having) + " " if having else "")
    if a.get("hitung") == "1":
        return jsonify(total=db.query_one("SELECT COUNT(*) AS n FROM (" + sql + ") x", params)["n"])
    urut = URUT_DAFTAR.get(a.get("urut", ""), "so_terakhir")
    arah = "ASC" if a.get("arah") == "asc" else "DESC"
    try:
        halaman = max(1, int(a.get("halaman", "1")))
    except ValueError:
        halaman = 1
    rows = db.query(
        "SELECT x.*, COUNT(*) OVER () AS total FROM (" + sql + ") x "
        f"ORDER BY {urut} {arah}, kode LIMIT %s OFFSET %s",
        params + [UKURAN_DAFTAR, (halaman - 1) * UKURAN_DAFTAR],
    )
    if rows:
        total = rows[0]["total"]
    elif halaman > 1:
        total = db.query_one("SELECT COUNT(*) AS n FROM (" + sql + ") x", params)["n"]
    else:
        total = 0
    for r in rows:
        r.pop("total", None)
    return jsonify(rows=rows, total=total, halaman=halaman, ukuran=UKURAN_DAFTAR)


def _is_valas(kode):
    return bool(kode) and str(kode).upper() not in ("IDR", "RP")


def _kurs_so(so_list):
    if not so_list:
        return {}
    tanda = ", ".join(["%s"] * len(so_list))
    rows = db.query(
        "SELECT nomor_so AS so_no, kurs FROM ("
        "SELECT nomor_so, kurs, ROW_NUMBER() OVER (PARTITION BY nomor_so ORDER BY posting_date DESC, no DESC) AS rn "
        "FROM bc_proforma_header WHERE nomor_so IN (" + tanda + ") AND kurs > 0 AND missing_in_bc_since IS NULL"
        ") x WHERE rn = 1",
        so_list,
    )
    return {r["so_no"]: float(r["kurs"]) for r in rows}


def _ke_rupiah(r, kurs):
    def kali(v):
        return round(float(v or 0) * kurs, 2) if kurs else None

    r["kurs"] = kurs
    r["kontrak_valas"] = r["kontrak"]
    r["nilai_so_valas"] = r["nilai_so"]
    r["kontrak"] = kali(r["kontrak"])
    r["nilai_so"] = kali(r["nilai_so"])
    r["pi_created"] = kali(r["pi_created"])
    kontrak = float(r["kontrak"] or 0)
    r["pct_pi"] = round(float(r["pi_created"] or 0) / kontrak * 100, 2) if kontrak > 0 else None
    r["pct_paid"] = round(float(r["paid"] or 0) / kontrak * 100, 2) if kontrak > 0 else None
    r["sisa_ots"] = kontrak - float(r["invoice_created"] or 0) if kurs else None
    for o in r["omzet"]:
        o["nilai_valas"] = o["nilai"]
        o["nilai"] = kali(o["nilai"])
    for key in ("nilai_komisi", "nilai_tim"):
        if r["komisi"].get(key) is not None:
            r["komisi"][key] = round(float(r["komisi"][key]) * kurs) if kurs else None


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
        "SELECT o.so_no, o.omzet_ke, o.tanggal, o.bulan, o.nilai FROM v_omzet o "
        "JOIN bc_sales_header h ON h.no = o.so_no WHERE h.brand = %s AND h.project_code = %s "
        "ORDER BY o.so_no, o.omzet_ke",
        (BRAND, kode),
    ):
        omzet.setdefault(r["so_no"], []).append(
            {"ke": r["omzet_ke"], "tanggal": r["tanggal"], "bulan": r["bulan"], "nilai": r["nilai"]})

    valas = [r["so_no"] for r in so_rows if _is_valas(r.get("currency_code"))]
    kurs = _kurs_so(valas)

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
        if r["so_no"] in valas:
            _ke_rupiah(r, kurs.get(r["so_no"]))

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
    header["ada_valas"] = bool(valas)
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
        "(h.missing_in_bc_since IS NOT NULL) AS hilang_di_bc, (h.is_batal = 1 AND COALESCE((SELECT SUM(pl.line_amount) FROM bc_proforma_line pl WHERE pl.document_no = h.no), 0) >= 0) AS is_batal, "
        "COALESCE(NULLIF(h.your_reference_txt, ''), h.your_reference) AS your_reference, "
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
    nopay = db.query_one("SELECT nopay_in, nopay_out FROM app_calc_so WHERE so_no = %s", (so_no,)) or {}
    so["nopay_in"] = nopay.get("nopay_in") or 0
    so["nopay_out"] = nopay.get("nopay_out") or 0
    alokasi = db.query(
        "SELECT target_pi, target_so, source_pi, source_so, ref, amount, tgl, sumber, "
        "IF(target_so = %s, 'IN', 'OUT') AS arah "
        "FROM app_nopay_alloc WHERE amount > 0 AND (target_so = %s OR source_so = %s) "
        "ORDER BY tgl, target_pi, ref",
        (so_no, so_no, so_no),
    )
    return jsonify(so=so, proforma=proforma, invoice=invoice, nopay=alokasi)


def _tanggal_arg(nilai):
    try:
        return date.fromisoformat(str(nilai)[:10])
    except ValueError:
        return None


def _sales_arg(args):
    return args.get("sales", "").strip()[:50]


@app.get("/api/omzet/bulan")
def api_omzet_bulan():
    sales = _sales_arg(request.args)
    rows = db.query(
        "SELECT o.bulan, SUM(o.nilai) AS omzet, COUNT(*) AS jml "
        "FROM v_omzet o JOIN bc_sales_header h ON h.no = o.so_no "
        "WHERE h.brand = %s" + (" AND h.sales_dim5 = %s" if sales else "") + " GROUP BY o.bulan ORDER BY o.bulan",
        (BRAND, sales) if sales else (BRAND,),
    )
    return jsonify(rows)


@app.get("/api/omzet")
def api_omzet():
    a = request.args
    bulan = a.get("bulan", "")
    if re.fullmatch(r"\d{4}-\d{2}", bulan):
        dari = date(int(bulan[:4]), int(bulan[5:]), 1)
        sampai = (dari.replace(day=28) + timedelta(days=4)).replace(day=1) - timedelta(days=1)
    else:
        dari, sampai = _tanggal_arg(a.get("dari", "")), _tanggal_arg(a.get("sampai", ""))
    if not dari or not sampai:
        return jsonify(pesan="Pilih periode terlebih dahulu."), 400
    if dari > sampai:
        dari, sampai = sampai, dari
    if (sampai - dari).days > 366 * 3:
        return jsonify(pesan="Periode maksimal 3 tahun."), 400
    sales = _sales_arg(a)
    filter_sales = " AND h.sales_dim5 = %s" if sales else ""
    p_sales = [sales] if sales else []
    events = db.query(
        "SELECT o.so_no, o.omzet_ke, o.tanggal, o.bulan, o.nilai, h.sell_to_customer_name AS customer, h.project_code, "
        "h.project_name, h.contract_amount AS kontrak, h.sales_dim5 AS sales, h.arsitek_dim7 AS arsitek, "
        "h.kontraktor_dim8 AS kontraktor, h.pmsm_dim6 AS pmsm "
        "FROM v_omzet o JOIN bc_sales_header h ON h.no = o.so_no "
        "WHERE h.brand = %s" + filter_sales + " AND o.so_no IN (SELECT x.so_no FROM v_omzet x WHERE x.tanggal BETWEEN %s AND %s) "
        "ORDER BY o.so_no, o.omzet_ke",
        [BRAND] + p_sales + [dari, sampai],
    )
    per_so = {}
    for e in events:
        so = per_so.setdefault(e["so_no"], {
            key: e[key] for key in (
                "so_no", "customer", "project_code", "project_name", "kontrak",
                "sales", "arsitek", "kontraktor", "pmsm")
        })
        so.setdefault("omzet", []).append(
            {"ke": e["omzet_ke"], "tanggal": e["tanggal"], "bulan": e["bulan"], "nilai": e["nilai"],
             "masuk": dari <= e["tanggal"] <= sampai})
    rows = list(per_so.values())
    for r in rows:
        periode = [o for o in r["omzet"] if o["masuk"]]
        r["omzet_periode"] = sum(float(o["nilai"] or 0) for o in periode)
        r["tanggal_periode"] = min(o["tanggal"] for o in periode)
    rows.sort(key=lambda r: (r["tanggal_periode"], r["so_no"]))
    if rows:
        so_list = [r["so_no"] for r in rows]
        info = {}
        for i in range(0, len(so_list), 500):
            bagian = so_list[i:i + 500]
            for x in db.query(
                "SELECT so_no, top, paid, sisa_ots FROM v_project_so WHERE so_no IN ("
                + ", ".join(["%s"] * len(bagian)) + ")",
                bagian,
            ):
                info[x["so_no"]] = x
        for r in rows:
            x = info.get(r["so_no"]) or {}
            r["top"], r["cash_in"], r["ots"] = x.get("top"), x.get("paid"), x.get("sisa_ots")
            r["status"] = "BARU" if any(o["masuk"] and int(o["ke"]) == 1 for o in r["omzet"]) else "PERUBAHAN"
    satu_bulan = (dari.year, dari.month) == (sampai.year, sampai.month)
    per_sales = {}
    for r in rows:
        x = per_sales.setdefault(r["sales"], {"sales": r["sales"], "omzet": 0.0, "jml": 0})
        x["omzet"] += r["omzet_periode"]
        x["jml"] += sum(1 for o in r["omzet"] if o["masuk"])
    grup = {}
    if satu_bulan and per_sales:
        nama = [k for k in per_sales if k]
        if nama:
            grup = {g["sales_dim5"]: g for g in db.query(
                "SELECT sales_dim5, kode, aturan, batas_omzet FROM v_sales_grup WHERE tahun = %s AND sales_dim5 IN ("
                + ", ".join(["%s"] * len(nama)) + ")",
                [dari.year] + nama,
            )}
    daftar_sales = []
    for x in per_sales.values():
        g_ = grup.get(x["sales"]) or {}
        x.update(grup=g_.get("kode"), aturan=g_.get("aturan"), batas_omzet=g_.get("batas_omzet"))
        daftar_sales.append(x)
    daftar_sales.sort(key=lambda x: -x["omzet"])
    return jsonify(dari=dari, sampai=sampai, satu_bulan=satu_bulan, rows=rows, sales=daftar_sales)


PERIODE_HARI = {"30": 30, "90": 90, "180": 180}
MAKS_ITEM_TAGIH = 500
PPN = 0.11
FPPP_BRAND = {
    "A": "ASTA", "B": "AST", "C": "RSD", "D": "AST", "E": "RSD", "F": "ABX", "G": "MAX", "H": "ASTA",
    "I": "POL", "J": "MAX", "K": "POL", "L": "MAX", "M": "RAE", "N": "RAS", "O": "MAX", "P": "CAR",
    "Q": "CAR", "R": "POL", "S": "RSD", "T": "POL", "U": "MAX", "V": "ADE", "W": "ASTB", "X": "MAX", "Y": "ADS",
}
FPPP_KODE = "COALESCE(l.fppp_no, LEFT(l.item_no, 8))"
_FPPP_HURUF = "FIELD(UPPER(LEFT(" + FPPP_KODE + ", 1)), " + ", ".join(f"'{k}'" for k in FPPP_BRAND) + ")"
FPPP_NO = (
    f"IF({FPPP_KODE} REGEXP '^[A-Za-z][0-9]{{7}}$' AND {_FPPP_HURUF} > 0, "
    f"CONCAT(SUBSTRING({FPPP_KODE}, 6, 3), '/FPPP/', ELT({_FPPP_HURUF}, "
    + ", ".join(f"'{v}'" for v in FPPP_BRAND.values())
    + f"), '/', SUBSTRING({FPPP_KODE}, 4, 2), '/20', SUBSTRING({FPPP_KODE}, 2, 2)), {FPPP_KODE})"
)
UKURAN_HALAMAN_SO = 25
FG_COND = (
    "l.brand = %s AND l.type = 'Item' AND l.item_no <> 'SO-AST' "
    "AND COALESCE(l.parent_item_no, l.item_no) = l.item_no AND l.line_amount <> 0"
)
FPPP_STAT = (
    "(SELECT l.document_no AS so_no, " + FPPP_KODE + " AS fk, COUNT(*) AS n, "
    "SUM(COALESCE(o.qty_output, 0) >= l.quantity) AS n_ok, MAX(o.tgl_output) AS tgl "
    "FROM bc_sales_line l LEFT JOIN app_calc_item_output o ON o.item_no = l.item_no "
    "WHERE " + FG_COND + " GROUP BY l.document_no, fk) f"
)
FROM_PENAGIHAN = (
    "FROM bc_sales_line l "
    "JOIN bc_sales_header h ON h.no = l.document_no "
    "LEFT JOIN app_calc_item_output o ON o.item_no = l.item_no "
    "LEFT JOIN app_fg_tagih t ON t.so_no = l.document_no AND t.line_no = l.line_no "
    "LEFT JOIN bc_item i ON i.no = l.item_no "
    "LEFT JOIN app_fg_tarik tr ON tr.so_no = l.document_no AND tr.line_no = l.line_no "
    "JOIN " + FPPP_STAT + " ON f.so_no = l.document_no AND f.fk = " + FPPP_KODE + " "
)
FPPP_SIAP = "f.n_ok = f.n"
FILTER_STATUS = {
    "belum": "AND COALESCE(t.is_ticked, 0) = 0 AND " + FPPP_SIAP + " ",
    "sudah": "AND t.is_ticked = 1 ",
    "semua": "AND (t.is_ticked = 1 OR " + FPPP_SIAP + ") ",
}


def _filter_penagihan(args):
    periode = args.get("periode", "90")
    where = "WHERE " + FG_COND + " "
    params = [BRAND, BRAND]
    sejak = None
    if periode in PERIODE_HARI:
        sejak = date.today() - timedelta(days=PERIODE_HARI[periode])
    elif periode == "tahun":
        sejak = date(date.today().year, 1, 1)
    if sejak:
        where += "AND f.tgl >= %s "
        params.append(sejak)
    q = args.get("q", "").strip()[:100]
    if q:
        like = f"%{q}%"
        where += (
            "AND (l.document_no LIKE %s OR h.project_code LIKE %s OR h.project_name LIKE %s "
            "OR h.sell_to_customer_name LIKE %s OR l.item_no LIKE %s OR h.external_document_no LIKE %s "
            "OR o.prod_order_no LIKE %s OR " + FPPP_KODE + " LIKE %s OR " + FPPP_NO + " LIKE %s "
            "OR i.kode_opening LIKE %s OR i.kode_unit LIKE %s) "
        )
        params += [like] * 11
    progres = [p for p in str(args.get("progres", "")).split(",") if p in PROGRES]
    if progres:
        where += (
            "AND l.document_no IN (SELECT pg.so_no FROM (" + SQL_PROGRES + ") pg WHERE "
            + " OR ".join(PROGRES[p] for p in progres) + ") "
        )
        params.append(BRAND)
    kontrak = [p for p in str(args.get("kontrak", "")).split(",") if p in PROGRES_KONTRAK]
    if kontrak:
        where += (
            "AND l.document_no IN (SELECT pk.so_no FROM (" + SQL_PROGRES_KONTRAK + ") pk WHERE "
            + " OR ".join(PROGRES_KONTRAK[p] for p in kontrak) + ") "
        )
        params.append(BRAND)
    return where, params


@app.get("/penagihan-fg")
def page_penagihan():
    return render_template("penagihan.html", active="penagihan")


@app.get("/api/penagihan")
def api_penagihan():
    where, params = _filter_penagihan(request.args)
    status = request.args.get("status", "belum")
    filter_status = FILTER_STATUS.get(status, FILTER_STATUS["belum"])
    if request.args.get("hitung") == "1":
        n = db.query_one(
            "SELECT COUNT(DISTINCT l.document_no) AS n " + FROM_PENAGIHAN + where + filter_status, params,
        )["n"]
        return jsonify(total=n)
    try:
        halaman = max(1, int(request.args.get("halaman", "1")))
    except ValueError:
        halaman = 1
    ringkas = db.query_one(
        "SELECT COUNT(*) AS jml, COALESCE(SUM(l.line_amount), 0) AS nilai, "
        "COALESCE(SUM(t.is_ticked = 1), 0) AS jml_tagih, "
        "COALESCE(SUM(IF(t.is_ticked = 1, l.line_amount, 0)), 0) AS nilai_tagih, "
        "COALESCE(SUM(IF(t.is_ticked = 1, t.nilai_tagih, 0)), 0) AS nominal_tagih "
        + FROM_PENAGIHAN + where + FILTER_STATUS["semua"],
        params,
    )
    so_page = db.query(
        "SELECT l.document_no AS so_no, MAX(f.tgl) AS tgl, COUNT(*) OVER () AS total "
        + FROM_PENAGIHAN + where + filter_status
        + "GROUP BY l.document_no ORDER BY tgl DESC, so_no DESC LIMIT %s OFFSET %s",
        params + [UKURAN_HALAMAN_SO, (halaman - 1) * UKURAN_HALAMAN_SO],
    )
    total = so_page[0]["total"] if so_page else 0
    so_list = [r["so_no"] for r in so_page]
    rows = []
    if so_list:
        rows = db.query(
            "SELECT l.document_no AS so_no, l.line_no, l.item_no, l.description AS nama_item, l.quantity AS qty, "
            "l.line_amount AS nilai, " + FPPP_NO + " AS fppp_no, " + FPPP_KODE + " AS fppp_kode, o.prod_order_no, "
            "o.qty_output, o.tgl_output, f.tgl AS tgl_fppp, tr.tgl_tarik, i.kode_opening, i.kode_unit, "
            "h.external_document_no AS quo, h.project_code, h.project_name, "
            "h.sell_to_customer_name AS customer, h.payment_terms_code AS top, "
            "COALESCE(t.is_ticked, 0) AS is_ticked, t.nilai_tagih, t.updated_by, "
            "DATE_FORMAT(t.updated_at, '%%Y-%%m-%%d %%H:%%i') AS updated_at "
            + FROM_PENAGIHAN + where + filter_status
            + "AND l.document_no IN (" + ", ".join(["%s"] * len(so_list)) + ") "
            "ORDER BY l.document_no, COALESCE(i.kode_opening, 'zzz'), i.kode_unit, l.line_no",
            params + so_list,
        )
    proforma = _proforma_so(so_list)
    urutan = {so: i for i, so in enumerate(so_list)}
    rows.sort(key=lambda r: urutan.get(r["so_no"], 0))
    for r in rows:
        r["proforma"] = proforma.get(r["so_no"], [])
    return jsonify(ringkas=ringkas, total=total, halaman=halaman, ukuran=UKURAN_HALAMAN_SO, rows=rows)


SQL_PI_SO = (
    "SELECT so_no, SUM(amt) AS amt FROM ("
    "SELECT h.nomor_so AS so_no, COALESCE(SUM(pl.line_amount), 0) AS amt, MAX(h.is_batal) AS batal "
    "FROM bc_proforma_header h LEFT JOIN bc_proforma_line pl ON pl.document_no = h.no "
    "WHERE h.missing_in_bc_since IS NULL GROUP BY h.no, h.nomor_so "
    "UNION ALL SELECT so_no, amount, 0 FROM app_proforma WHERE status = 'DIBUAT' "
    "AND pi_no NOT IN (SELECT no FROM bc_proforma_header WHERE missing_in_bc_since IS NULL)"
    ") x WHERE NOT (x.batal = 1 AND x.amt >= 0) GROUP BY so_no"
)


SQL_PROGRES = (
    "SELECT fg.so_no, IF(ABS(COALESCE(pi.amt, 0) - fg.nilai) <= 1, 100, COALESCE(pi.amt, 0) / fg.nilai * 100) AS pct "
    "FROM (SELECT l.document_no AS so_no, SUM(l.line_amount) AS nilai FROM bc_sales_line l "
    "WHERE " + FG_COND + " GROUP BY l.document_no HAVING nilai > 0) fg "
    "LEFT JOIN (" + SQL_PI_SO + ") pi ON pi.so_no = fg.so_no"
)
SQL_PROGRES_KONTRAK = (
    "SELECT h.no AS so_no, IF(ABS(COALESCE(pi.amt, 0) - h.contract_amount) <= 1, 100, "
    "COALESCE(pi.amt, 0) / h.contract_amount * 100) AS pct "
    "FROM bc_sales_header h LEFT JOIN (" + SQL_PI_SO + ") pi ON pi.so_no = h.no "
    "WHERE h.brand = %s AND h.contract_amount > 0"
)
PROGRES_KONTRAK = {
    "0": "pk.pct < 1",
    "30": "(pk.pct >= 1 AND pk.pct < 50)",
    "50": "(pk.pct >= 50 AND pk.pct < 70)",
    "70": "(pk.pct >= 70 AND pk.pct < 100)",
    "100": "pk.pct = 100",
    "lebih": "pk.pct > 100",
}
PROGRES = {
    "lt50": "pg.pct < 50",
    "50_85": "(pg.pct >= 50 AND pg.pct < 85)",
    "85_99": "(pg.pct >= 85 AND pg.pct < 100)",
    "100": "pg.pct >= 100",
}


@app.get("/api/penagihan/banding")
def api_penagihan_banding():
    where, params = _filter_penagihan(request.args)
    r = db.query_one(
        "SELECT COUNT(*) AS jml_so, COALESCE(SUM(x.jml), 0) AS jml, COALESCE(SUM(x.jml_tagih), 0) AS jml_tagih, "
        "COALESCE(SUM(x.n_fppp), 0) AS jml_fppp, COALESCE(SUM(fp.nilai), 0) AS nilai, "
        "COALESCE(SUM(COALESCE(pi.amt, 0)), 0) AS nilai_pi, "
        "COALESCE(SUM(GREATEST(0, fp.nilai - COALESCE(pi.amt, 0))), 0) AS nilai_belum, "
        "COALESCE(SUM(h.contract_amount), 0) AS kontrak, "
        "COALESCE(SUM(GREATEST(0, h.contract_amount - COALESCE(pi.amt, 0))), 0) AS kontrak_belum "
        "FROM (SELECT l.document_no AS so_no, COUNT(*) AS jml, SUM(t.is_ticked = 1) AS jml_tagih, "
        "COUNT(DISTINCT " + FPPP_KODE + ") AS n_fppp "
        + FROM_PENAGIHAN + where + FILTER_STATUS["semua"] + "GROUP BY l.document_no) x "
        "JOIN (SELECT l.document_no AS so_no, SUM(l.line_amount) AS nilai FROM bc_sales_line l "
        "WHERE " + FG_COND + " GROUP BY l.document_no) fp ON fp.so_no = x.so_no "
        "JOIN bc_sales_header h ON h.no = x.so_no "
        "LEFT JOIN (" + SQL_PI_SO + ") pi ON pi.so_no = x.so_no",
        params + [BRAND],
    )
    return jsonify(r)


def _proforma_so(so_list):
    if not so_list:
        return {}
    tanda = ", ".join(["%s"] * len(so_list))
    hasil = {}
    for r in db.query(
        "SELECT nomor_so AS so_no, no, proforma_type AS tipe FROM bc_proforma_header "
        "WHERE nomor_so IN (" + tanda + ") AND missing_in_bc_since IS NULL ORDER BY nomor_so, posting_date, no",
        so_list,
    ):
        hasil.setdefault(r["so_no"], []).append({"no": r["no"], "tipe": r["tipe"]})
    return hasil


def _usul_proforma(so_list, baris_dipilih):
    tanda = ", ".join(["%s"] * len(so_list))
    info = {r["so_no"]: r for r in db.query(
        "SELECT no AS so_no, sell_to_customer_no AS customer_no, external_document_no AS quo, project_code, "
        "dim3_code, dim4_code, sales_dim5, pmsm_dim6, arsitek_dim7, kontraktor_dim8 "
        "FROM bc_sales_header WHERE no IN (" + tanda + ")",
        so_list,
    )}
    sisa_fg = {r["so_no"]: int(r["n"] or 0) for r in db.query(
        "SELECT l.document_no AS so_no, COUNT(*) AS n FROM bc_sales_line l "
        "LEFT JOIN app_fg_tagih t ON t.so_no = l.document_no AND t.line_no = l.line_no AND t.is_ticked = 1 "
        "WHERE l.document_no IN (" + tanda + ") AND " + FG_COND + " AND t.so_no IS NULL GROUP BY l.document_no",
        so_list + [BRAND],
    )}
    jml_pl = {r["so_no"]: int(r["n"] or 0) for r in db.query(
        "SELECT x.so_no, COUNT(*) AS n FROM ("
        "SELECT nomor_so AS so_no, no FROM bc_proforma_header WHERE nomor_so IN (" + tanda + ") "
        "AND missing_in_bc_since IS NULL AND external_document_no LIKE %s "
        "UNION SELECT so_no, pi_no FROM app_proforma WHERE so_no IN (" + tanda + ") AND status = 'DIBUAT'"
        ") x GROUP BY x.so_no",
        so_list + ["%-PL%"] + so_list,
    )}
    dipilih = {}
    for b in baris_dipilih:
        dipilih[b["so_no"]] = dipilih.get(b["so_no"], 0) + 1
    hasil = {}
    for so_no in so_list:
        i = info.get(so_no) or {}
        ke = jml_pl.get(so_no, 0) + 1
        dasar = (i.get("quo") or so_no).strip()
        hasil[so_no] = {
            **i,
            "ke": ke,
            "ext_doc": f"{dasar}-PL.{ke}"[:50],
            "tipe": "Final" if sisa_fg.get(so_no, 0) - dipilih.get(so_no, 0) <= 0 else "Phase",
        }
    return hasil


def _panggil_n8n(isi):
    if not N8N_PROFORMA_URL or not N8N_PROFORMA_TOKEN:
        return {"ok": False, "pesan": "Pembuatan proforma belum diaktifkan."}
    req = urlrequest.Request(
        N8N_PROFORMA_URL,
        data=json.dumps(isi, default=str).encode(),
        headers={"Content-Type": "application/json", "Accept": "application/json", "User-Agent": "DashboardProject/1.0", "X-Dashboard-Token": N8N_PROFORMA_TOKEN},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=50) as r:
            data = json.loads(r.read() or b"{}")
    except urlerror.HTTPError as e:
        mentah = e.read() or b""
        try:
            data = json.loads(mentah or b"{}")
        except ValueError:
            data = {}
        log.warning("n8n proforma HTTP %s server=%s: %s", e.code, e.headers.get("Server", "-"), mentah[:200].decode(errors="replace"))
        pesan = data.get("pesan") if isinstance(data, dict) else None
        if not pesan:
            pesan = {
                401: "Token n8n tidak cocok. Cek credential Dashboard Proforma Token dan env N8N_PROFORMA_TOKEN.",
                403: "Token n8n tidak cocok. Cek credential Dashboard Proforma Token dan env N8N_PROFORMA_TOKEN.",
                404: "Webhook n8n tidak ditemukan. Pastikan workflow Buat Proforma Dashboard aktif dan URL production benar.",
            }.get(e.code, f"Workflow n8n error ({e.code}). Cek Executions di n8n.")
        return {"ok": False, "pesan": pesan}
    except Exception as e:
        log.warning("n8n proforma gagal: %s", e)
        return {"ok": False, "pesan": "Server n8n tidak merespons. Coba lagi."}
    if not isinstance(data, dict):
        return {"ok": False, "pesan": "Balasan n8n tidak dikenal."}
    return data


def _buat_proforma(so_no, usul, amount, tipe, batch, oleh):
    posting = date.today()
    jatuh = posting + timedelta(days=PI_JATUH_TEMPO)
    work = f"PELUNASAN KE {usul['ke']}"
    key = f"{batch}|{so_no}"
    db.query(
        "INSERT INTO app_proforma (batch, so_no, proforma_type, ext_doc, work_desc, posting_date, due_date, amount, status, created_by) "
        "VALUES (%s, %s, %s, %s, %s, %s, %s, %s, 'PROSES', %s)",
        (key, so_no, tipe, usul["ext_doc"], work, posting, jatuh, amount, oleh),
    )
    pf = db.query_one("SELECT id FROM app_proforma WHERE batch = %s", (key,))
    hasil = _panggil_n8n({
        "aksi": "buat",
        "kunci": key,
        "header": {
            "Sell_to_Customer_No": usul.get("customer_no"),
            "Nomor_SO": so_no,
            "Proforma_Type": tipe,
            "External_Document_No": usul["ext_doc"],
            "WorkDescriptionTxt": work,
            "Posting_Date": posting.isoformat(),
            "Due_Date": jatuh.isoformat(),
            "Location_Code": PI_LOKASI,
            "Shortcut_Dimension_1_Code": BRAND,
            "Shortcut_Dimension_2_Code": usul.get("project_code") or "",
        },
        "baris": {
            "No": PI_ITEM,
            "Description": f"ALUMINIUM DOOR & WINDOW {usul['ext_doc']}"[:100],
            "Description_2": "PELUNASAN " + BRAND,
            "Location_Code": PI_LOKASI,
            "Quantity": 1,
            "Unit_Price": amount,
            "Shortcut_Dimension_2_Code": usul.get("project_code") or "",
            "ShortcutDimCode3": usul.get("dim3_code") or "",
            "ShortcutDimCode4": usul.get("dim4_code") or "",
            "ShortcutDimCode5": usul.get("sales_dim5") or "",
            "ShortcutDimCode6": usul.get("pmsm_dim6") or "",
            "ShortcutDimCode7": usul.get("arsitek_dim7") or "",
            "ShortcutDimCode8": usul.get("kontraktor_dim8") or "",
        },
    })
    pi_no = str(hasil.get("pi_no") or "").strip()[:30]
    if hasil.get("ok") and pi_no:
        db.query("UPDATE app_proforma SET status = 'DIBUAT', pi_no = %s, pesan = NULL WHERE id = %s", (pi_no, pf["id"]))
        db.query("INSERT INTO app_proforma_log (proforma_id, aksi, isi, oleh) VALUES (%s, 'BUAT', %s, %s)",
                 (pf["id"], json.dumps({"amount": amount, "tipe": tipe}), oleh))
        log.info("Proforma %s dibuat untuk %s oleh %s (%s)", pi_no, so_no, oleh, amount)
        return {"ok": True, "pi_no": pi_no}
    pesan = str(hasil.get("pesan") or "Proforma gagal dibuat di BC.")[:500]
    db.query("UPDATE app_proforma SET status = 'GAGAL', pesan = %s WHERE id = %s", (pesan, pf["id"]))
    return {"ok": False, "pesan": pesan}


def _kunci_item(items):
    kunci, lihat = [], set()
    for it in (items or [])[:MAKS_ITEM_TAGIH]:
        try:
            k = (str(it["so_no"])[:20], int(it["line_no"]))
        except (KeyError, TypeError, ValueError):
            continue
        if k not in lihat:
            lihat.add(k)
            kunci.append(k)
    return kunci


def _baris_tagih(kunci):
    kondisi = " OR ".join(["(l.document_no = %s AND l.line_no = %s)"] * len(kunci))
    rows = db.query(
        "SELECT l.document_no AS so_no, l.line_no, l.item_no, l.description AS nama_item, l.quantity AS qty, "
        "l.line_amount, COALESCE(t.is_ticked, 0) AS is_ticked, t.nilai_tagih, i.kode_opening, i.kode_unit "
        "FROM bc_sales_line l LEFT JOIN app_fg_tagih t ON t.so_no = l.document_no AND t.line_no = l.line_no "
        "LEFT JOIN bc_item i ON i.no = l.item_no "
        "WHERE l.brand = %s AND (" + kondisi + ")",
        [BRAND] + [v for k in kunci for v in k],
    )
    urut = {k: i for i, k in enumerate(kunci)}
    return sorted(rows, key=lambda r: urut.get((r["so_no"], r["line_no"]), 0))


def _nilai_item(line_amount):
    return float(math.floor(float(line_amount or 0) + 0.5))


def _dpp(nilai):
    return float(math.floor(float(nilai or 0) / (1 + PPN) + 0.5))


def _posisi_kontrak(so_list):
    if not so_list:
        return {}
    tanda = ", ".join(["%s"] * len(so_list))
    header = {r["so_no"]: r for r in db.query(
        "SELECT no AS so_no, contract_amount AS kontrak, currency_code FROM bc_sales_header WHERE no IN (" + tanda + ")",
        so_list,
    )}
    kurs = _kurs_so([k for k, v in header.items() if _is_valas(v.get("currency_code"))])
    dp = {r["so_no"]: float(r["dp"] or 0) for r in db.query(
        "SELECT pi.nomor_so AS so_no, SUM(x.amount) AS dp FROM ("
        "SELECT document_no AS pi_no, amount FROM bc_cashier_in_line WHERE brand = %s "
        "UNION ALL SELECT target_pi, amount FROM app_nopay_alloc WHERE amount > 0 "
        "UNION ALL SELECT source_pi, -amount FROM app_nopay_alloc WHERE amount > 0 AND source_pi IS NOT NULL"
        ") x JOIN bc_proforma_header pi ON pi.no = x.pi_no "
        "WHERE pi.nomor_so IN (" + tanda + ") AND NOT (pi.is_batal = 1 AND COALESCE((SELECT SUM(pl.line_amount) FROM bc_proforma_line pl WHERE pl.document_no = pi.no), 0) >= 0) "
        "AND (pi.proforma_type = %s OR (pi.proforma_type IS NULL AND pi.external_document_no LIKE %s)) "
        "GROUP BY pi.nomor_so",
        [BRAND] + so_list + ["Down Payment", "%-DP%"],
    )}
    sudah = {r["so_no"]: float(r["nominal"] or 0) for r in db.query(
        "SELECT t.so_no, SUM(COALESCE(t.nilai_tagih, ROUND(l.line_amount))) AS nominal "
        "FROM app_fg_tagih t JOIN bc_sales_line l ON l.document_no = t.so_no AND l.line_no = t.line_no "
        "WHERE t.is_ticked = 1 AND t.so_no IN (" + tanda + ") GROUP BY t.so_no",
        so_list,
    )}
    pi = {}
    for r in db.query(
        "SELECT h.nomor_so AS so_no, h.is_batal, COALESCE(SUM(l.line_amount), 0) AS amt FROM bc_proforma_header h "
        "LEFT JOIN bc_proforma_line l ON l.document_no = h.no "
        "WHERE h.nomor_so IN (" + tanda + ") AND h.missing_in_bc_since IS NULL GROUP BY h.no, h.nomor_so, h.is_batal",
        so_list,
    ):
        amt = float(r["amt"] or 0)
        if r["is_batal"] and amt >= 0:
            continue
        pi[r["so_no"]] = pi.get(r["so_no"], 0) + amt
    for r in db.query(
        "SELECT so_no, SUM(amount) AS amt FROM app_proforma WHERE so_no IN (" + tanda + ") AND status = 'DIBUAT' "
        "AND pi_no NOT IN (SELECT no FROM bc_proforma_header WHERE missing_in_bc_since IS NULL) GROUP BY so_no",
        so_list,
    ):
        pi[r["so_no"]] = pi.get(r["so_no"], 0) + float(r["amt"] or 0)
    calc = {r["so_no"]: r for r in db.query(
        "SELECT so_no, paid, persen_dp FROM app_calc_so WHERE so_no IN (" + tanda + ")", so_list,
    )}
    hasil = {}
    for so_no in so_list:
        k = kurs.get(so_no, 1)
        kontrak = float((header.get(so_no) or {}).get("kontrak") or 0) * k
        c = calc.get(so_no) or {}
        cash = float(c.get("paid") or 0)
        terpakai = max(cash, pi.get(so_no, 0) * k)
        hasil[so_no] = {"kontrak": kontrak, "cash": cash, "persen_dp": float(c.get("persen_dp") or 0),
                        "dp": dp.get(so_no, 0), "sudah": sudah.get(so_no, 0), "pi": pi.get(so_no, 0) * k,
                        "sisa": float(max(0, round(kontrak - terpakai)))}
    return hasil


@app.post("/api/penagihan/hitung")
def api_penagihan_hitung():
    kunci = _kunci_item((request.get_json(silent=True) or {}).get("items"))
    if not kunci:
        return jsonify(pesan="Tidak ada item yang dipilih."), 400
    baris = [b for b in _baris_tagih(kunci) if not b["is_ticked"]]
    if not baris:
        return jsonify(pesan="Semua item terpilih sudah ditandai ditagih."), 400
    so_list = list(dict.fromkeys(b["so_no"] for b in baris))
    tanda = ", ".join(["%s"] * len(so_list))
    header = {r["so_no"]: r for r in db.query(
        "SELECT no AS so_no, sell_to_customer_name AS customer, project_code, payment_terms_code AS top "
        "FROM bc_sales_header WHERE no IN (" + tanda + ")",
        so_list,
    )}
    posisi = _posisi_kontrak(so_list)
    proforma = _proforma_so(so_list)
    usul = _usul_proforma(so_list, baris)
    hasil = []
    for so_no in so_list:
        h = header.get(so_no) or {}
        p = posisi.get(so_no) or {}
        kontrak, dp_so, sudah_so, cash_so = p.get("kontrak", 0), p.get("dp", 0), p.get("sudah", 0), p.get("cash", 0)
        pdp, sisa = p.get("persen_dp", 0), p.get("sisa", 0)
        items = [{"so_no": so_no, "line_no": b["line_no"], "item_no": b["item_no"], "nama_item": b["nama_item"],
                  "kode_opening": b.get("kode_opening"), "kode_unit": b.get("kode_unit"),
                  "qty": b["qty"], "nilai": _nilai_item(b["line_amount"])}
                 for b in baris if b["so_no"] == so_no]
        subtotal = sum(it["nilai"] for it in items)
        potong = max(round(cash_so * pdp / 100), round(subtotal - sisa))
        dpp = _dpp(subtotal)
        hasil.append({"so_no": so_no, "customer": h.get("customer"), "project_code": h.get("project_code"),
                      "top": h.get("top"), "proforma": proforma.get(so_no, []), "kontrak": kontrak, "dp": dp_so,
                      "cash_in": cash_so, "persen_dp": pdp, "potong": potong, "sudah_ditagih": sudah_so, "total_pi": p.get("pi", 0),
                      "sisa": sisa, "items": items, "subtotal": subtotal,
                      "tipe_usul": usul[so_no]["tipe"], "ext_doc_usul": usul[so_no]["ext_doc"], "dpp": dpp, "ppn": subtotal - dpp,
                      "total": float(max(0, subtotal - potong))})
    return jsonify(so=hasil, ppn=PPN)


@app.post("/api/penagihan/tandai")
def api_penagihan_tandai():
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    tagih = bool(data.get("tagih"))
    kunci = _kunci_item(items)
    if not kunci:
        return jsonify(pesan="Tidak ada item yang dipilih."), 400
    baris = _baris_tagih(kunci)
    ubah = [b for b in baris if bool(b["is_ticked"]) != tagih]
    oleh = g.user["username"]
    batch = datetime.now().strftime("%Y%m%d%H%M%S") + "-" + secrets.token_hex(3)
    buat_pi = tagih and bool(data.get("buat_pi"))
    proforma, gagal = [], []
    posisi = _posisi_kontrak(list(dict.fromkeys(b["so_no"] for b in ubah))) if tagih else {}
    if buat_pi and ubah:
        so_pi = list(dict.fromkeys(b["so_no"] for b in ubah))
        if len(so_pi) > 5:
            return jsonify(pesan="Buat proforma maksimal 5 SO sekaligus."), 400
        total_so = data.get("total") if isinstance(data.get("total"), dict) else {}
        usul = _usul_proforma(so_pi, ubah)
        for so_no in so_pi:
            try:
                amount = float(math.floor(float(total_so[so_no]) + 0.5))
            except (KeyError, TypeError, ValueError):
                return jsonify(pesan="Total tagihan belum terkirim. Muat ulang halaman lalu coba lagi."), 400
            if amount <= 0:
                continue
            if amount > posisi.get(so_no, {}).get("sisa", 0) + 1:
                return jsonify(pesan=f"Tagihan {so_no} melebihi sisa kontrak."), 400
            lunas_kontrak = amount >= posisi.get(so_no, {}).get("sisa", 0) - 1
            tipe = "Final" if usul[so_no]["tipe"] == "Final" and lunas_kontrak else "Phase"
            hasil = _buat_proforma(so_no, usul[so_no], amount, tipe, batch, oleh)
            if hasil["ok"]:
                proforma.append({"so_no": so_no, "pi_no": hasil["pi_no"]})
            else:
                gagal.append({"so_no": so_no, "pesan": hasil["pesan"]})
        if gagal:
            batal = {x["so_no"] for x in gagal}
            ubah = [b for b in ubah if b["so_no"] not in batal]
    nominal = {}
    if tagih:
        total_so = data.get("total") if isinstance(data.get("total"), dict) else {}
        for so_no in dict.fromkeys(b["so_no"] for b in ubah):
            try:
                total = float(math.floor(float(total_so[so_no]) + 0.5))
            except (KeyError, TypeError, ValueError):
                return jsonify(pesan="Total tagihan belum terkirim. Muat ulang halaman (Ctrl+Shift+R) lalu coba lagi."), 400
            if total < 0 or total > 1e13:
                return jsonify(pesan="Total tagihan tidak boleh minus."), 400
            if total > posisi.get(so_no, {}).get("sisa", 0) + 1:
                return jsonify(pesan=f"Tagihan {so_no} melebihi sisa kontrak."), 400
            item_so = [b for b in ubah if b["so_no"] == so_no]
            dpp = [max(0.0, float(b["line_amount"] or 0)) for b in item_so]
            jumlah = sum(dpp)
            sisa = total
            for i, b in enumerate(item_so):
                bagian = sisa if i == len(item_so) - 1 else float(math.floor(total * (dpp[i] / jumlah if jumlah else 1 / len(item_so))))
                nominal[(b["so_no"], b["line_no"])] = bagian
                sisa -= bagian
    if ubah:
        perintah = []
        for b in ubah:
            k = (b["so_no"], b["line_no"])
            nilai = nominal.get(k) if tagih else None
            perintah.append((
                "INSERT INTO app_fg_tagih (so_no, line_no, item_no, qty_tagih, nilai_tagih, is_ticked, updated_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s) ON DUPLICATE KEY UPDATE item_no = VALUES(item_no), "
                "qty_tagih = VALUES(qty_tagih), nilai_tagih = VALUES(nilai_tagih), is_ticked = VALUES(is_ticked), "
                "updated_by = VALUES(updated_by)",
                (b["so_no"], b["line_no"], b["item_no"], b["qty"] if tagih else 0, nilai, 1 if tagih else 0, oleh),
            ))
            perintah.append((
                "INSERT INTO app_fg_tagih_log (so_no, line_no, item_no, action, qty, nilai, done_by, batch) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s, %s)",
                (b["so_no"], b["line_no"], b["item_no"], "TICK" if tagih else "UNTICK", b["qty"],
                 nilai if tagih else b.get("nilai_tagih"), oleh, batch),
            ))
        db.transaksi(perintah)
        log.info("Penagihan FG: %s item di%s oleh %s", len(ubah), "tandai" if tagih else "batalkan", oleh)
    return jsonify(diubah=len(ubah), oleh=oleh, nominal={f"{k[0]}|{k[1]}": v for k, v in nominal.items()},
                   diubah_kunci=[f'{b["so_no"]}|{b["line_no"]}' for b in ubah], proforma=proforma, gagal=gagal)

@app.get("/api/penagihan/riwayat/<so_no>")
def api_penagihan_riwayat(so_no):
    so_no = so_no[:20]
    h = db.query_one(
        "SELECT h.no AS so_no, h.sell_to_customer_name AS customer, h.project_code, h.payment_terms_code AS top, "
        "h.contract_amount AS kontrak, COALESCE(c.paid, 0) AS cash_in "
        "FROM bc_sales_header h LEFT JOIN app_calc_so c ON c.so_no = h.no WHERE h.no = %s AND h.brand = %s",
        (so_no, BRAND),
    )
    if not h:
        return jsonify(pesan="SO tidak ditemukan."), 404
    aktif = db.query_one(
        "SELECT COUNT(*) AS jml, COALESCE(SUM(l.line_amount), 0) AS nilai_item, "
        "COALESCE(SUM(COALESCE(t.nilai_tagih, ROUND(l.line_amount))), 0) AS nominal "
        "FROM app_fg_tagih t JOIN bc_sales_line l ON l.document_no = t.so_no AND l.line_no = t.line_no "
        "WHERE t.so_no = %s AND t.is_ticked = 1",
        (so_no,),
    ) or {}
    log_rows = db.query(
        "SELECT g.id, g.line_no, g.item_no, g.action, g.qty, g.nilai, g.done_by, g.batch, "
        "DATE_FORMAT(g.done_at, '%%Y-%%m-%%d %%H:%%i') AS waktu, l.description AS nama_item, l.line_amount, "
        "i.kode_opening, i.kode_unit "
        "FROM app_fg_tagih_log g "
        "LEFT JOIN bc_sales_line l ON l.document_no = g.so_no AND l.line_no = g.line_no "
        "LEFT JOIN bc_item i ON i.no = g.item_no "
        "WHERE g.so_no = %s ORDER BY g.done_at DESC, g.id DESC LIMIT 2000",
        (so_no,),
    )
    grup = {}
    for r in log_rows:
        k = r["batch"] or f'{r["action"]}|{r["done_by"]}|{r["waktu"]}'
        e = grup.setdefault(k, {"waktu": r["waktu"], "oleh": r["done_by"], "aksi": r["action"],
                                "nilai_item": 0.0, "nominal": 0.0, "items": []})
        e["nilai_item"] += float(r["line_amount"] or 0)
        e["nominal"] += float(r["nilai"] or 0)
        e["items"].append({k2: r[k2] for k2 in ("line_no", "item_no", "nama_item", "kode_opening", "kode_unit", "qty", "line_amount", "nilai")})
    dp = db.query_one(
        "SELECT COALESCE(SUM(x.amount), 0) AS dp FROM ("
        "SELECT document_no AS pi_no, amount FROM bc_cashier_in_line WHERE brand = %s "
        "UNION ALL SELECT target_pi, amount FROM app_nopay_alloc WHERE amount > 0 "
        "UNION ALL SELECT source_pi, -amount FROM app_nopay_alloc WHERE amount > 0 AND source_pi IS NOT NULL"
        ") x JOIN bc_proforma_header pi ON pi.no = x.pi_no "
        "WHERE pi.nomor_so = %s AND NOT (pi.is_batal = 1 AND COALESCE((SELECT SUM(pl.line_amount) FROM bc_proforma_line pl WHERE pl.document_no = pi.no), 0) >= 0) "
        "AND (pi.proforma_type = %s OR (pi.proforma_type IS NULL AND pi.external_document_no LIKE %s))",
        (BRAND, so_no, "Down Payment", "%-DP%"),
    ) or {}
    kontrak = float(h["kontrak"] or 0)
    dp_so = float(dp.get("dp") or 0)
    nominal = float(aktif.get("nominal") or 0)
    tertutup = dp_so + nominal
    ringkas = {**h, "dp": dp_so, "jml_item": aktif.get("jml") or 0, "nilai_item": aktif.get("nilai_item") or 0,
               "nominal": nominal, "tertutup": tertutup, "sisa": max(0.0, kontrak - tertutup)}
    return jsonify(ringkas=ringkas, riwayat=list(grup.values()))


@app.get("/proforma-fg")
def page_proforma():
    return render_template("proforma.html", active="proforma")


SQL_PROFORMA = (
    "SELECT p.id, p.so_no, p.pi_no, p.proforma_type, p.ext_doc, p.work_desc, p.remarks, p.your_ref, "
    "p.posting_date, p.due_date, p.amount, p.status, p.pesan, p.created_by, "
    "DATE_FORMAT(p.created_at, '%%Y-%%m-%%d %%H:%%i') AS created_at, p.updated_by, "
    "DATE_FORMAT(p.updated_at, '%%Y-%%m-%%d %%H:%%i') AS updated_at, "
    "s.sell_to_customer_name AS customer, s.project_code, h.status_pi, h.doc_status, "
    "COALESCE((SELECT SUM(c.amount) FROM bc_cashier_in_line c WHERE c.document_no = p.pi_no), 0) AS dibayar "
    "FROM app_proforma p "
    "LEFT JOIN bc_sales_header s ON s.no = p.so_no "
    "LEFT JOIN bc_proforma_header h ON h.no = p.pi_no "
)


@app.get("/api/proforma")
def api_proforma():
    a = request.args
    where, params = "WHERE p.status = 'DIBUAT' AND p.pi_no IS NOT NULL ", []
    q = a.get("q", "").strip()[:100]
    if q:
        like = f"%{q}%"
        where += "AND (p.pi_no LIKE %s OR p.so_no LIKE %s OR p.ext_doc LIKE %s OR s.sell_to_customer_name LIKE %s OR s.project_code LIKE %s) "
        params += [like] * 5
    try:
        halaman = max(1, int(a.get("halaman", "1")))
    except ValueError:
        halaman = 1
    ukuran = 50
    total = db.query_one(
        "SELECT COUNT(*) AS n FROM app_proforma p LEFT JOIN bc_sales_header s ON s.no = p.so_no " + where, params,
    )["n"]
    rows = db.query(
        SQL_PROFORMA + where + "ORDER BY p.created_at DESC, p.id DESC LIMIT %s OFFSET %s",
        params + [ukuran, (halaman - 1) * ukuran],
    )
    return jsonify(rows=rows, total=total, halaman=halaman, ukuran=ukuran)


@app.get("/api/proforma/<int:pid>")
def api_proforma_detail(pid):
    row = db.query_one(SQL_PROFORMA + "WHERE p.id = %s", (pid,))
    if not row:
        return jsonify(pesan="Proforma tidak ditemukan."), 404
    batch_tagih = (db.query_one("SELECT batch FROM app_proforma WHERE id = %s", (pid,)) or {}).get("batch", "").split("|")[0]
    items = db.query(
        "SELECT g.item_no, l.description AS nama_item, g.qty, l.line_amount, g.nilai, i.kode_opening, i.kode_unit "
        "FROM app_fg_tagih_log g "
        "LEFT JOIN bc_sales_line l ON l.document_no = g.so_no AND l.line_no = g.line_no "
        "LEFT JOIN bc_item i ON i.no = g.item_no "
        "WHERE g.batch = %s AND g.so_no = %s AND g.action = 'TICK' ORDER BY g.id",
        (batch_tagih, row["so_no"]),
    )
    riwayat = db.query(
        "SELECT aksi, isi, oleh, DATE_FORMAT(waktu, '%%Y-%%m-%%d %%H:%%i') AS waktu FROM app_proforma_log "
        "WHERE proforma_id = %s ORDER BY id DESC LIMIT 50",
        (pid,),
    )
    return jsonify(proforma=row, items=items, riwayat=riwayat)


EDIT_PROFORMA = {
    "work_desc": ("WorkDescriptionTxt", 2000),
    "remarks": ("RemarksTxt", 2000),
    "your_ref": ("Your_Reference", 35),
    "ext_doc": ("External_Document_No", 35),
}


@app.post("/api/proforma/<int:pid>/ubah")
def api_proforma_ubah(pid):
    row = db.query_one("SELECT * FROM app_proforma WHERE id = %s", (pid,))
    if not row or row["status"] != "DIBUAT" or not row["pi_no"]:
        return jsonify(pesan="Proforma tidak bisa diubah."), 400
    data = request.get_json(silent=True) or {}
    header, kolom = {}, {}
    for k, (bc, panjang) in EDIT_PROFORMA.items():
        if k in data:
            v = str(data.get(k) or "").strip()[:panjang]
            header[bc] = v
            kolom[k] = v
    if "proforma_type" in data:
        if data["proforma_type"] not in PI_TIPE:
            return jsonify(pesan="Tipe proforma tidak dikenal."), 400
        header["Proforma_Type"] = kolom["proforma_type"] = data["proforma_type"]
    for k, bc in (("posting_date", "Posting_Date"), ("due_date", "Due_Date")):
        if k in data:
            try:
                d = date.fromisoformat(str(data[k])[:10])
            except ValueError:
                return jsonify(pesan="Format tanggal tidak valid."), 400
            header[bc] = d.isoformat()
            kolom[k] = d
    baris = {}
    if "amount" in data:
        try:
            amount = float(math.floor(float(data["amount"]) + 0.5))
        except (TypeError, ValueError):
            return jsonify(pesan="Amount tidak valid."), 400
        if amount <= 0 or amount > 1e13:
            return jsonify(pesan="Amount harus lebih dari 0."), 400
        baris["Unit_Price"] = amount
        kolom["amount"] = amount
    if not kolom:
        return jsonify(pesan="Tidak ada perubahan."), 400
    if "posting_date" in kolom or "due_date" in kolom:
        ke_tgl = lambda v: v if isinstance(v, date) or v is None else date.fromisoformat(str(v)[:10])
        pd_ = kolom.get("posting_date", ke_tgl(row["posting_date"]))
        dd_ = kolom.get("due_date", ke_tgl(row["due_date"]))
        if pd_ and dd_ and dd_ < pd_:
            return jsonify(pesan="Due Date tidak boleh sebelum Posting Date."), 400
    hasil = _panggil_n8n({"aksi": "ubah", "pi_no": row["pi_no"], "header": header, "baris": baris})
    if not hasil.get("ok"):
        return jsonify(pesan=str(hasil.get("pesan") or "Proforma gagal diubah di BC.")[:300]), 400
    oleh = g.user["username"]
    set_sql = ", ".join(f"{k} = %s" for k in kolom)
    db.transaksi([
        ("UPDATE app_proforma SET " + set_sql + ", updated_by = %s, updated_at = NOW() WHERE id = %s",
         list(kolom.values()) + [oleh, pid]),
        ("INSERT INTO app_proforma_log (proforma_id, aksi, isi, oleh) VALUES (%s, 'UBAH', %s, %s)",
         (pid, json.dumps(kolom, default=str), oleh)),
    ])
    log.info("Proforma %s diubah oleh %s: %s", row["pi_no"], oleh, ", ".join(kolom))
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)