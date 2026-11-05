:root {
  --bg: #f4f5f9;
  --surface: #ffffff;
  --surface-2: #f8f9fc;
  --border: #e6e8ef;
  --text: #1d2130;
  --muted: #6b7185;
  --accent: #5b5bd6;
  --accent-soft: #ececfb;
  --green: #1f9d6b;
  --green-soft: #e3f5ed;
  --amber: #b7791f;
  --amber-soft: #fbf1df;
  --red: #d64545;
  --red-soft: #fbe6e6;
  --gray-soft: #eef0f4;
  --shadow: 0 1px 2px rgba(20, 24, 40, .04), 0 4px 16px rgba(20, 24, 40, .04);
  --radius: 14px;
}

* { box-sizing: border-box; }
html, body { margin: 0; }
body {
  font-family: "Inter", system-ui, -apple-system, "Segoe UI", sans-serif;
  font-size: 14px;
  color: var(--text);
  background: var(--bg);
}
h1, h2, h3 { margin: 0; font-weight: 600; }
h1 { font-size: 22px; }
h2 { font-size: 18px; }
h3 { font-size: 15px; }
a { color: var(--accent); text-decoration: none; }
svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; flex-shrink: 0; }
.muted { color: var(--muted); }
.small { font-size: 12px; }
.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.neg { color: var(--red); }

.layout { display: flex; min-height: 100vh; }
.sidebar {
  width: 236px;
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 18px;
  position: sticky;
  top: 0;
  height: 100vh;
}
.logo { display: flex; gap: 10px; align-items: center; padding: 0 6px; }
.logo-mark { width: 38px; height: 38px; display: block; }
.logo-title { font-weight: 600; }
.logo-sub { font-size: 12px; color: var(--muted); }
.brand-pill {
  background: var(--accent-soft); color: var(--accent);
  border-radius: 10px; padding: 8px 12px; font-size: 13px;
}
.nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px; border-radius: 10px;
  color: var(--muted); font-weight: 500;
}
.nav-item:hover { background: var(--surface-2); color: var(--text); }
.nav-item.active { background: var(--accent); color: #fff; }
.sync-info { margin-top: auto; font-size: 12px; color: var(--muted); padding: 0 6px; line-height: 1.5; }

.content { flex: 1; min-width: 0; padding: 26px 28px 40px; }
.page-head {
  display: flex; justify-content: space-between; align-items: flex-end;
  gap: 16px; margin-bottom: 20px; flex-wrap: wrap;
}
.page-head p { margin: 4px 0 0; }

.search { position: relative; width: min(440px, 100%); }
.search > svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); }
.search input {
  width: 100%; height: 42px; padding: 0 14px 0 38px;
  border: 1px solid var(--border); border-radius: 12px;
  background: var(--surface); font: inherit; color: var(--text); outline: none;
}
.search input:focus { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); }
.search-list {
  position: absolute; z-index: 20; top: 48px; left: 0; right: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 12px; box-shadow: var(--shadow);
  max-height: 360px; overflow-y: auto;
}
.search-item { padding: 10px 14px; cursor: pointer; border-bottom: 1px solid var(--border); }
.search-item:last-child { border-bottom: 0; }
.search-item:hover, .search-item.aktif { background: var(--surface-2); }
.search-item b { color: var(--accent); }
.search-item .small { margin-top: 2px; }

.card {
  background: var(--surface); border: 1px solid var(--border);
  border-radius: var(--radius); box-shadow: var(--shadow);
  padding: 18px 20px; margin-bottom: 16px;
}
.card-head { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.chip {
  display: inline-block; padding: 3px 10px; border-radius: 999px;
  background: var(--accent-soft); color: var(--accent); font-weight: 600; font-size: 12px;
}
.project-title { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.info-grid { display: grid; grid-template-columns: 1fr 2fr 1fr; gap: 16px; margin: 0; }
.info-grid dt { font-size: 12px; color: var(--muted); margin-bottom: 3px; }
.info-grid dd { margin: 0; font-weight: 500; }

.kpi-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 14px; margin-bottom: 2px; }
.kpi { padding: 16px; }
.kpi-label { font-size: 12px; color: var(--muted); margin-bottom: 6px; }
.kpi-value { font-size: 20px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kpi-sub { font-size: 12px; color: var(--muted); margin-top: 4px; }
.bar { height: 6px; background: var(--gray-soft); border-radius: 99px; overflow: hidden; margin-top: 10px; }
.bar span { display: block; height: 100%; background: var(--accent); border-radius: 99px; width: 0; transition: width .4s; }
.bar.full span { background: var(--green); }

.table-wrap { overflow-x: auto; border: 1px solid var(--border); border-radius: 12px; }
.tbl { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 13px; }
.tbl th, .tbl td { padding: 9px 12px; border-bottom: 1px solid var(--border); text-align: left; white-space: nowrap; }
.tbl thead th { background: var(--surface-2); color: var(--muted); font-weight: 600; font-size: 12px; position: sticky; top: 0; }
.tbl thead tr.grp th { text-align: left; color: var(--text); font-size: 12px; border-right: 1px solid var(--border); }
.tbl thead tr.grp th.g-so { background: #eef0fd; }
.tbl thead tr.grp th.g-omzet { background: #e8f6ef; }
.tbl thead tr.grp th.g-komisi { background: #fdf3e3; }
.tbl tbody tr:last-child td { border-bottom: 0; }
.tbl .num { text-align: right; }
.tbl .sep { border-left: 1px solid var(--border); }
.tbl-so tbody tr.so-row { cursor: pointer; }
.tbl-so tbody tr.so-row:hover td { background: var(--surface-2); }
.tbl-so tbody tr.so-row.buka td { background: var(--accent-soft); }
.tbl-so .sticky { position: sticky; left: 0; background: var(--surface); z-index: 1; }
.tbl-so thead .sticky { background: var(--surface-2); z-index: 2; }
.tbl-so tbody tr.so-row:hover td.sticky { background: var(--surface-2); }
.tbl-so tbody tr.so-row.buka td.sticky { background: var(--accent-soft); }
.so-no { font-weight: 600; display: flex; align-items: center; gap: 6px; }
.so-no svg { width: 14px; height: 14px; color: var(--muted); transition: transform .2s; }
.buka .so-no svg { transform: rotate(90deg); }
.detail-row > td { background: var(--surface-2); padding: 12px 0; }
.detail-box { position: sticky; left: 0; width: calc(var(--lebar-wrap, 100%) - 2px); padding: 0 12px; }
.detail-row .table-wrap { background: var(--surface); }
.detail-title { font-weight: 600; margin-bottom: 8px; font-size: 13px; }

.badge {
  display: inline-block; padding: 2px 8px; border-radius: 999px;
  font-size: 11px; font-weight: 600; line-height: 1.6; white-space: nowrap;
}
.b-green { background: var(--green-soft); color: var(--green); }
.b-amber { background: var(--amber-soft); color: var(--amber); }
.b-red { background: var(--red-soft); color: var(--red); }
.b-gray { background: var(--gray-soft); color: var(--muted); }
.b-blue { background: var(--accent-soft); color: var(--accent); }

.pct-cell { display: flex; align-items: center; gap: 8px; min-width: 110px; }
.pct-cell .bar { flex: 1; margin-top: 0; height: 5px; }
.pct-cell span.v { min-width: 44px; text-align: right; font-variant-numeric: tabular-nums; }

.btn, .btn-sm {
  display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text);
  border-radius: 10px; font: inherit; font-weight: 500; cursor: pointer;
}
.btn { padding: 9px 14px; }
.btn-sm { padding: 5px 10px; font-size: 12px; }
.btn:hover, .btn-sm:hover { border-color: var(--accent); color: var(--accent); }
.btn-icon { border: 0; background: transparent; cursor: pointer; color: var(--muted); padding: 6px; border-radius: 8px; }
.btn-icon:hover { background: var(--surface-2); color: var(--text); }

.empty { text-align: center; padding: 80px 20px; }
.empty-icon { width: 56px; height: 56px; border-radius: 16px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; margin: 0 auto 14px; }
.empty-icon svg { width: 26px; height: 26px; }
.empty p { max-width: 420px; margin: 8px auto 0; }
.alert { background: var(--amber-soft); color: var(--amber); border-radius: 12px; padding: 12px 16px; margin-bottom: 16px; font-weight: 500; }
.loading { padding: 18px; color: var(--muted); text-align: center; }

.modal { position: fixed; inset: 0; background: rgba(20, 24, 40, .45); display: grid; place-items: center; padding: 20px; z-index: 50; }
.modal[hidden] { display: none; }
.modal-box { background: var(--surface); border-radius: 18px; width: min(1180px, 100%); max-height: calc(100vh - 40px); display: flex; flex-direction: column; box-shadow: 0 20px 60px rgba(20, 24, 40, .25); }
.modal-head { display: flex; justify-content: space-between; align-items: flex-start; padding: 18px 22px; border-bottom: 1px solid var(--border); }
.modal-body { padding: 18px 22px 22px; overflow-y: auto; }
.mini-kpi { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; margin-bottom: 16px; }
.mini-kpi div { background: var(--surface-2); border-radius: 12px; padding: 10px 12px; }
.mini-kpi span { display: block; font-size: 11px; color: var(--muted); margin-bottom: 4px; }
.mini-kpi b { font-variant-numeric: tabular-nums; }
.tabs { display: flex; gap: 6px; align-items: center; margin-bottom: 12px; flex-wrap: wrap; }
.tab { border: 0; background: transparent; padding: 8px 14px; border-radius: 10px; font: inherit; font-weight: 500; color: var(--muted); cursor: pointer; }
.tab.active { background: var(--accent-soft); color: var(--accent); }
.check { margin-left: auto; display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
tr.redup td { color: var(--muted); }

@media (max-width: 1280px) {
  .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .mini-kpi { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 860px) {
  .layout { flex-direction: column; }
  .sidebar { width: 100%; height: auto; position: static; flex-direction: row; flex-wrap: wrap; align-items: center; padding: 12px 16px; gap: 10px; border-right: 0; border-bottom: 1px solid var(--border); }
  .logo-sub, .sync-info, .brand-pill { display: none; }
  .nav { flex-direction: row; width: 100%; overflow-x: auto; }
  .nav-item { padding: 8px 10px; white-space: nowrap; }
  .content { padding: 18px 16px 32px; }
  .info-grid { grid-template-columns: 1fr; }
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
  .kpi-value { font-size: 17px; }
  .mini-kpi { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .modal { padding: 8px; }
  .modal-head, .modal-body { padding-left: 14px; padding-right: 14px; }
}