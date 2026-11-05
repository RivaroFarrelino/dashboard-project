const $ = id => document.getElementById(id);
const PANAH = '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';
const STATUS_PSI = {
  AKTIF: ['Tagihan', 'b-green'],
  POTONG_DP: ['Potong DP', 'b-amber'],
  VOID: ['Batal', 'b-red'],
  REALISASI_DP: ['Realisasi DP', 'b-gray'],
  TANPA_LEDGER: ['Tanpa ledger', 'b-gray'],
  CEK: ['Perlu cek', 'b-amber']
};
const DIHITUNG = ['AKTIF', 'POTONG_DP'];

const state = { kode: null, so: [], dokumen: null };

function tampilPesan(teksPesan) {
  const el = $('pesan');
  el.textContent = teksPesan;
  el.hidden = !teksPesan;
}

function setupCari() {
  const input = $('cari-project');
  const list = $('hasil-cari');
  let timer = null;
  let urut = 0;
  let pilihan = [];
  let aktif = -1;

  const tutup = () => { list.hidden = true; aktif = -1; };

  const render = () => {
    if (!pilihan.length) {
      list.innerHTML = '<div class="search-item muted">Tidak ada project yang cocok</div>';
    } else {
      list.innerHTML = pilihan.map((p, i) => `
        <div class="search-item ${i === aktif ? 'aktif' : ''}" data-i="${i}">
          <div><b>${esc(p.kode)}</b> · ${teks(p.nama)}</div>
          <div class="small muted">${teks(p.customer)} · ${p.jml_so} SO</div>
        </div>`).join('');
    }
    list.hidden = false;
  };

  const cari = async q => {
    const no = ++urut;
    try {
      const data = await ambilJson(`/api/projects?q=${encodeURIComponent(q)}`);
      if (no !== urut) return;
      pilihan = data;
      aktif = -1;
      render();
    } catch (e) {
      if (no !== urut) return;
      list.innerHTML = `<div class="search-item muted">${esc(e.message)}</div>`;
      list.hidden = false;
    }
  };

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { tutup(); return; }
    timer = setTimeout(() => cari(q), 250);
  });

  input.addEventListener('keydown', e => {
    if (list.hidden || !pilihan.length) return;
    if (e.key === 'ArrowDown') { aktif = (aktif + 1) % pilihan.length; render(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { aktif = (aktif - 1 + pilihan.length) % pilihan.length; render(); e.preventDefault(); }
    else if (e.key === 'Enter') { const p = pilihan[aktif < 0 ? 0 : aktif]; if (p) { pilih(p.kode); } e.preventDefault(); }
    else if (e.key === 'Escape') { tutup(); }
  });

  list.addEventListener('mousedown', e => {
    const item = e.target.closest('[data-i]');
    if (item) pilih(pilihan[Number(item.dataset.i)].kode);
  });

  input.addEventListener('blur', () => setTimeout(tutup, 150));

  function pilih(kode) {
    tutup();
    input.value = '';
    input.blur();
    history.pushState({ kode }, '', `/project?kode=${encodeURIComponent(kode)}`);
    muatProject(kode);
  }
}

async function muatProject(kode) {
  state.kode = kode;
  tampilPesan('');
  $('kosong').hidden = true;
  $('project-view').hidden = false;
  $('tbl-so').innerHTML = '<tbody><tr><td class="loading">Memuat data project…</td></tr></tbody>';
  try {
    const data = await ambilJson(`/api/project/${encodeURIComponent(kode)}`);
    if (state.kode !== kode) return;
    state.so = data.so;
    renderHeader(data.header);
    renderSo(data.so);
  } catch (e) {
    $('project-view').hidden = true;
    $('kosong').hidden = false;
    tampilPesan(e.message);
  }
}

function renderHeader(h) {
  document.title = `${h.kode} · Project`;
  $('p-kode').textContent = h.kode;
  $('p-nama').textContent = h.nama || STRIP;
  $('p-customer').textContent = h.customer || STRIP;
  $('p-alamat').textContent = h.alamat || STRIP;
  $('p-jml-so').textContent = `${h.jml_so} SO · ${h.jml_closed} closed`;
  $('k-kontrak').innerHTML = ringkas(h.kontrak);
  $('k-kontrak').title = fmtAngka.format(h.kontrak);
  $('k-pi').innerHTML = ringkas(h.pi_created);
  $('k-pi-pct').textContent = `${persen(h.pct_pi)} dari kontrak`;
  $('k-paid').innerHTML = ringkas(h.paid);
  $('k-paid-pct').textContent = `${persen(h.pct_paid)} dari kontrak`;
  $('k-inv').innerHTML = ringkas(h.invoice_created);
  $('k-ots').innerHTML = `Sisa OTS ${ringkas(h.sisa_ots)}`;
  setBar('k-fg', h.pct_fg_finish);
  setBar('k-ship', h.pct_ship);
}

function setBar(id, v) {
  $(id).textContent = persen(v);
  const n = ada(v) ? Math.max(0, Math.min(100, Number(v))) : 0;
  $(`${id}-bar`).style.width = `${n}%`;
  $(`${id}-bar`).parentElement.classList.toggle('full', n >= 100);
}

function badgeSo(r) {
  const b = [];
  if (r.is_closed) b.push('<span class="badge b-green">Closed</span>');
  else if (r.status_bc) b.push(`<span class="badge b-blue">${esc(r.status_bc)}</span>`);
  if (r.hilang_di_bc) b.push('<span class="badge b-red">Hilang di BC</span>');
  return b.join(' ');
}

function renderSo(rows) {
  const nOmzet = Math.max(1, ...rows.map(r => r.omzet.length));
  const omzetHead = Array.from({ length: nOmzet }, (_, i) => `<th class="num">Omzet ${i + 1}</th>`).join('');
  const head = `
    <thead>
      <tr class="grp">
        <th class="g-so sticky" colspan="1"></th>
        <th class="g-so" colspan="16">Sales Order</th>
        <th class="g-omzet" colspan="${nOmzet + 2}">Omzet</th>
        <th class="g-komisi" colspan="6">Komisi</th>
        <th></th>
      </tr>
      <tr>
        <th class="sticky">Sales Order</th>
        <th>Status</th><th>Order Date</th><th>External Doc No</th><th>Company</th><th>TOP</th><th>Sales</th><th>Arsitek</th>
        <th>Kontraktor</th><th>PMSM</th><th>Currency</th><th class="num">Total Kontrak</th><th class="num">Nilai SO</th>
        <th>Paid × Kontrak</th><th>FG Finish</th><th>Shipment</th><th>FG Tagih</th>
        <th class="sep">Tanggal</th>${omzetHead}<th class="num">Cash In</th>
        <th class="sep num">% Komisi Sales</th><th class="num">Nilai Komisi</th><th class="num">% Komisi Tim</th>
        <th class="num">Nilai Komisi Tim</th><th>Tgl Keluar Komisi</th><th>Bulan Komisi</th>
        <th class="sep"></th>
      </tr>
    </thead>`;
  const body = rows.map(r => {
    const omzet = Array.from({ length: nOmzet }, (_, i) => `<td class="num">${r.omzet[i] ? angka(r.omzet[i].nilai) : STRIP}</td>`).join('');
    const k = r.komisi || {};
    const komisiNull = !r.is_closed ? 'title="Komisi muncul setelah SO lunas 100%"' : '';
    return `
      <tr class="so-row" data-so="${esc(r.so_no)}">
        <td class="sticky"><span class="so-no">${PANAH}${esc(r.so_no)}</span></td>
        <td>${badgeSo(r)}</td>
        <td>${tanggal(r.order_date)}</td>
        <td>${teks(r.external_document_no)}</td>
        <td>${teks(r.company)}</td>
        <td>${teks(r.top)}</td>
        <td>${teks(r.sales)}</td>
        <td>${teks(r.arsitek)}</td>
        <td>${teks(r.kontraktor)}</td>
        <td>${teks(r.pmsm)}</td>
        <td>${teks(r.currency_code || 'IDR')}</td>
        <td class="num">${angka(r.kontrak)}</td>
        <td class="num">${angka(r.nilai_so)}</td>
        <td>${barPersen(r.pct_paid)}</td>
        <td>${barPersen(r.pct_fg_finish)}</td>
        <td>${barPersen(r.pct_ship)}</td>
        <td>${barPersen(r.pct_fg_tagih)}</td>
        <td class="sep">${tanggal(r.first_paid_date)}</td>
        ${omzet}
        <td class="num">${angka(r.paid)}</td>
        <td class="sep num" ${komisiNull}>${persenKomisi(k.pct_komisi)}</td>
        <td class="num" ${komisiNull}>${angka(k.nilai_komisi)}</td>
        <td class="num" ${komisiNull}>${persenKomisi(k.pct_tim)}</td>
        <td class="num" ${komisiNull}>${angka(k.nilai_tim)}</td>
        <td>${tanggal(k.tanggal_keluar_komisi)}</td>
        <td>${bulan(k.bulan_komisi)}</td>
        <td class="sep"><button class="btn-sm" data-dokumen="${esc(r.so_no)}">Proforma / Invoice</button></td>
      </tr>`;
  }).join('');
  $('tbl-so').innerHTML = head + `<tbody>${body}</tbody>`;
}

async function toggleLines(tr) {
  const so = tr.dataset.so;
  const next = tr.nextElementSibling;
  if (next && next.classList.contains('detail-row')) {
    next.remove();
    tr.classList.remove('buka');
    return;
  }
  tr.classList.add('buka');
  const colspan = tr.children.length;
  const detail = document.createElement('tr');
  detail.className = 'detail-row';
  detail.innerHTML = `<td colspan="${colspan}"><div class="detail-box"><div class="loading">Memuat sales lines…</div></div></td>`;
  tr.after(detail);
  aturLebarDetail();
  const box = detail.querySelector('.detail-box');
  try {
    const rows = await ambilJson(`/api/so/${encodeURIComponent(so)}/lines`);
    box.innerHTML = renderLines(so, rows);
  } catch (e) {
    box.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
}

function aturLebarDetail() {
  const wrap = $('tbl-so').parentElement;
  wrap.style.setProperty('--lebar-wrap', `${wrap.clientWidth}px`);
}

const ukuran = v => ada(v) && Number(v) !== 0 ? qty(v) : STRIP;

function renderLines(so, rows) {
  if (!rows.length) return `<div class="loading">SO ${esc(so)} belum punya sales lines.</div>`;
  const body = rows.map(r => `
    <tr>
      <td>${teks(r.item_no)} ${r.is_fg ? '' : '<span class="badge b-gray">Hardware</span>'}</td>
      <td>${teks(r.nama_item)}</td>
      <td class="num">${ukuran(r.lebar)}</td>
      <td class="num">${ukuran(r.tinggi)}</td>
      <td class="num">${qty(r.qty)}</td>
      <td class="num">${angka(r.harga)}</td>
      <td class="num">${angka(r.nilai)}</td>
      <td>${r.is_fg ? tanggal(r.tgl_output) : STRIP}</td>
      <td class="num">${r.is_fg ? qty(r.qty_output) : STRIP}</td>
      <td>${tanggal(r.tgl_ship)}</td>
      <td class="num">${qty(r.qty_ship)}</td>
      <td>${teks(r.prod_order_no)}</td>
      <td>${tanggal(r.due_finish)}</td>
      <td>${r.is_fg ? barPersen(r.pct_fg_finish) : STRIP}</td>
      <td class="num">${r.is_fg ? qty(r.qty_tagih) : STRIP}</td>
      <td>${barPersen(r.pct_ship)}</td>
    </tr>`).join('');
  return `
    <div class="detail-title">Sales lines ${esc(so)} · ${rows.length} baris</div>
    <div class="table-wrap">
      <table class="tbl">
        <thead><tr>
          <th>Item No</th><th>Nama Item</th><th class="num">Lebar</th><th class="num">Tinggi</th><th class="num">Qty</th>
          <th class="num">Harga</th><th class="num">Nilai</th><th>Tanggal Output</th><th class="num">Qty Output</th>
          <th>Tanggal Shipment</th><th class="num">Qty Shipment</th><th>Prod Order No</th><th>Due Date Finish</th>
          <th>FG Finish</th><th class="num">Qty Tagih</th><th>Shipment</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

async function bukaDokumen(so) {
  const modal = $('modal-dokumen');
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  $('m-judul').textContent = `SO ${so}`;
  $('m-kpi').innerHTML = '<div class="loading">Memuat…</div>';
  $('tbl-pi').innerHTML = '';
  $('tbl-inv').innerHTML = '';
  pilihTab('proforma');
  try {
    const data = await ambilJson(`/api/so/${encodeURIComponent(so)}/dokumen`);
    state.dokumen = data;
    const s = data.so;
    $('m-judul').textContent = `SO ${s.so_no} · ${s.customer || ''} · ${s.project_code || ''}`;
    $('m-kpi').innerHTML = [
      ['Proforma Created', angka(s.pi_created)],
      ['Proforma Paid', angka(s.paid)],
      ['% Created / Kontrak', persen(s.pct_pi)],
      ['% Paid / Kontrak', persen(s.pct_paid)],
      ['Invoice Created', angka(s.invoice_created)],
      ['Sisa OTS', angka(s.sisa_ots)]
    ].map(([l, v]) => `<div><span>${l}</span><b>${v}</b></div>`).join('');
    renderProforma(data.proforma);
    renderInvoice();
  } catch (e) {
    $('m-kpi').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
}

function renderProforma(rows) {
  $('m-n-pi').textContent = `(${rows.length})`;
  if (!rows.length) { $('tbl-pi').innerHTML = '<tbody><tr><td class="loading">Belum ada proforma untuk SO ini.</td></tr></tbody>'; return; }
  const body = rows.map(r => `
    <tr class="${r.hilang_di_bc ? 'redup' : ''}">
      <td>${tanggal(r.posting_date)}</td>
      <td>${teks(r.no)} ${r.hilang_di_bc ? '<span class="badge b-red">Hilang di BC</span>' : ''}</td>
      <td>${teks(r.status_pi)}</td>
      <td>${teks(r.nomor_so)}</td>
      <td>${teks(r.proforma_type)}</td>
      <td>${tanggal(r.due_date)}</td>
      <td>${teks(r.currency_code || 'IDR')}</td>
      <td class="num">${angka(r.amount_ori)}</td>
      <td class="num">${r.currency_code ? (Number(r.kurs) > 0 ? fmtQty.format(r.kurs) : '<span class="badge b-amber">Kurs kosong</span>') : '1'}</td>
      <td class="num">${angka(r.nilai)}</td>
      <td class="num">${angka(r.dibayar)}</td>
      <td>${teks(r.external_document_no)}</td>
      <td>${teks(r.remark)}</td>
      <td>${teks(r.posting_description)}</td>
    </tr>`).join('');
  $('tbl-pi').innerHTML = `
    <thead><tr>
      <th>Tanggal Proforma</th><th>Nomor</th><th>Status PI</th><th>Nomor SO</th><th>Proforma Type</th><th>Due Date PI</th>
      <th>Currency</th><th class="num">Amount Ori</th><th class="num">Kurs</th><th class="num">Nilai</th><th class="num">Dibayar (PCI)</th>
      <th>Ext Doc No</th><th>Remark</th><th>Posting Description</th>
    </tr></thead>
    <tbody>${body}</tbody>`;
}

function renderInvoice() {
  const semua = $('m-semua').checked;
  const all = (state.dokumen && state.dokumen.invoice) || [];
  const rows = all.filter(r => semua || ['AKTIF', 'POTONG_DP', 'VOID', 'CEK'].includes(r.psi_status));
  const tersembunyi = all.length - rows.length;
  $('m-n-inv').textContent = `(${all.filter(r => DIHITUNG.includes(r.psi_status)).length} tagihan)`;
  $('m-filter-wrap').hidden = !all.some(r => ['REALISASI_DP', 'TANPA_LEDGER'].includes(r.psi_status));
  if (!rows.length) {
    $('tbl-inv').innerHTML = `<tbody><tr><td class="loading">${tersembunyi ? `Ada ${tersembunyi} invoice realisasi DP (nilai 0). Centang “Tampilkan realisasi DP” untuk melihat.` : 'Belum ada invoice untuk SO ini.'}</td></tr></tbody>`;
    return;
  }
  const body = rows.map(r => {
    const [label, kelas] = STATUS_PSI[r.psi_status] || [r.psi_status, 'b-gray'];
    return `
      <tr class="${DIHITUNG.includes(r.psi_status) ? '' : 'redup'}">
        <td>${teks(r.psi_no)}</td>
        <td><span class="badge ${kelas}" title="${esc(r.status_reason || '')}">${label}</span></td>
        <td>${tanggal(r.posting_date)}</td>
        <td>${tanggal(r.tanggal_bayar)}</td>
        <td class="num">${angka(DIHITUNG.includes(r.psi_status) ? r.nilai_bersih : r.nilai_psi)}</td>
        <td>${teks(r.external_document_no)}</td>
        <td>${teks(r.posting_description)}</td>
      </tr>`;
  }).join('');
  $('tbl-inv').innerHTML = `
    <thead><tr>
      <th>PSI No</th><th>Status</th><th>Tanggal PSI</th><th>Tanggal Bayar</th><th class="num">Nominal</th>
      <th>External Document No</th><th>Posting Description</th>
    </tr></thead>
    <tbody>${body}</tbody>`;
}

function pilihTab(nama) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === nama));
  document.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== nama; });
}

function tutupModal() {
  $('modal-dokumen').hidden = true;
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
  setupCari();
  window.addEventListener('resize', aturLebarDetail);

  $('tbl-so').addEventListener('click', e => {
    const btn = e.target.closest('[data-dokumen]');
    if (btn) { e.stopPropagation(); bukaDokumen(btn.dataset.dokumen); return; }
    const tr = e.target.closest('tr.so-row');
    if (tr) toggleLines(tr);
  });

  document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => pilihTab(t.dataset.tab)));
  $('m-semua').addEventListener('change', renderInvoice);
  $('modal-dokumen').addEventListener('click', e => {
    if (e.target.id === 'modal-dokumen' || e.target.closest('[data-tutup]')) tutupModal();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('modal-dokumen').hidden) tutupModal(); });

  window.addEventListener('popstate', () => {
    const kode = new URLSearchParams(location.search).get('kode');
    if (kode) muatProject(kode);
  });

  const kode = new URLSearchParams(location.search).get('kode');
  if (kode) muatProject(kode);
});