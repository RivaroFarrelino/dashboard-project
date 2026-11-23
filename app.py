import logging
import math
import os
import re
from datetime import date, datetime, timedelta
from decimal import Decimal

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
    return where, params


@app.get("/penagihan-fg")
def page_penagihan():
    return render_template("penagihan.html", active="penagihan")


@app.get("/api/penagihan")
def api_penagihan():
    where, params = _filter_penagihan(request.args)
    status = request.args.get("status", "belum")
    filter_status = FILTER_STATUS.get(status, FILTER_STATUS["belum"])
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
        "l.line_amount, COALESCE(t.is_ticked, 0) AS is_ticked, i.kode_opening, i.kode_unit "
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
        "SELECT no AS so_no, sell_to_customer_name AS customer, project_code, payment_terms_code AS top, "
        "contract_amount AS kontrak, currency_code FROM bc_sales_header WHERE no IN (" + tanda + ")",
        so_list,
    )}
    kurs = _kurs_so([k for k, v in header.items() if _is_valas(v.get("currency_code"))])
    for k, v in kurs.items():
        header[k]["kontrak"] = float(header[k]["kontrak"] or 0) * v
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
    proforma = _proforma_so(so_list)
    hasil = []
    for so_no in so_list:
        h = header.get(so_no) or {}
        kontrak = float(h.get("kontrak") or 0)
        sisa = float(max(0, round(kontrak - dp.get(so_no, 0) - sudah.get(so_no, 0))))
        items = [{"so_no": so_no, "line_no": b["line_no"], "item_no": b["item_no"], "nama_item": b["nama_item"],
                  "kode_opening": b.get("kode_opening"), "kode_unit": b.get("kode_unit"),
                  "qty": b["qty"], "nilai": _nilai_item(b["line_amount"])}
                 for b in baris if b["so_no"] == so_no]
        subtotal = sum(it["nilai"] for it in items)
        dpp = _dpp(subtotal)
        hasil.append({"so_no": so_no, "customer": h.get("customer"), "project_code": h.get("project_code"),
                      "top": h.get("top"), "proforma": proforma.get(so_no, []), "kontrak": kontrak, "dp": dp.get(so_no, 0),
                      "sudah_ditagih": sudah.get(so_no, 0), "sisa": sisa, "items": items,
                      "subtotal": subtotal, "dpp": dpp, "ppn": subtotal - dpp, "total": min(subtotal, sisa)})
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
            item_so = [b for b in ubah if b["so_no"] == so_no]
            dpp = [max(0.0, float(b["line_amount"] or 0)) for b in item_so]
            jumlah = sum(dpp)
            sisa = total
            for i, b in enumerate(item_so):
                bagian = sisa if i == len(item_so) - 1 else float(math.floor(total * (dpp[i] / jumlah if jumlah else 1 / len(item_so))))
                nominal[(b["so_no"], b["line_no"])] = bagian
                sisa -= bagian
    oleh = g.user["username"]
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
                "INSERT INTO app_fg_tagih_log (so_no, line_no, item_no, action, qty, nilai, done_by) "
                "VALUES (%s, %s, %s, %s, %s, %s, %s)",
                (b["so_no"], b["line_no"], b["item_no"], "TICK" if tagih else "UNTICK", b["qty"], nilai, oleh),
            ))
        db.transaksi(perintah)
        log.info("Penagihan FG: %s item di%s oleh %s", len(ubah), "tandai" if tagih else "batalkan", oleh)
    return jsonify(diubah=len(ubah), oleh=oleh, nominal={f"{k[0]}|{k[1]}": v for k, v in nominal.items()})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")), debug=False)