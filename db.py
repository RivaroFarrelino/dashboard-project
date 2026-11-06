import os

import pymysql
from flask import g


def get_db():
    if "db" not in g:
        g.db = pymysql.connect(
            host=os.environ.get("DB_HOST", "localhost"),
            port=int(os.environ.get("DB_PORT", "3306")),
            user=os.environ.get("DB_USER", "dashboard_app"),
            password=os.environ.get("DB_PASSWORD", ""),
            database=os.environ.get("DB_NAME", "dashboard_project"),
            charset="utf8mb4",
            cursorclass=pymysql.cursors.DictCursor,
            autocommit=True,
            connect_timeout=10,
            read_timeout=60,
            init_command="SET time_zone = '+07:00'",
        )
    return g.db


def query(sql, params=None):
    with get_db().cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def query_one(sql, params=None):
    rows = query(sql, params)
    return rows[0] if rows else None


def close_db(_=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def transaksi(perintah):
    conn = get_db()
    conn.begin()
    try:
        with conn.cursor() as cur:
            for sql, params in perintah:
                cur.execute(sql, params)
        conn.commit()
    except Exception:
        conn.rollback()
        raise