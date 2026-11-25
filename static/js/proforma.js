const $ = id => document.getElementById(id);
const TIPE_PI = ['Phase', 'Final'];
const state = { halaman: 1, data: null, urut: 0, aktif: null };

function tampilPesan(t) {
  $('pesan').textContent = t;
  $('pesan').hidden = !t;
}

let timerToast = null;
function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 2600);
}

const STATUS = { DIBUAT: ['Dibuat', 'b-green'], GAGAL: ['Gagal', 'b-red'], PROSES: ['Proses', 'b-amber'] };
const badge = s => { const [l, c] = STATUS[s] || [s, 'b-gray']; return `<span class="badge ${c}">${esc(l)}</span>`; };
const waktu = v => (v ? `${tanggal(v)} ${esc(String(v).slice(11, 16))}` : STRIP);

async function muat() {
  const no = ++state.urut;
  const p = new URLSearchParams({ q: $('f-cari').value.trim(), halaman: state.halaman });
  tampilPesan('');
  $('tbl-pf').innerHTML = '<tbody><tr><td class="loading">Memuat proforma…</td></tr></tbody>';
  try {
    const data = await ambilJson(`/api/proforma?${p}`);
    if (no !== state.urut) return;
    state.data = data;
    render();
  } catch (e) {
    if (no !== state.urut) return;
    tampilPesan(e.message);
    $('tbl-pf').innerHTML = '';
  }
}

function render() {
  const { rows, total, halaman, ukuran } = state.data;
  const awal = total ? (halaman - 1) * ukuran + 1 : 0;
  $('info-halaman').textContent = total ? `${fmtAngka.format(awal)}–${fmtAngka.format(awal + rows.length - 1)} dari ${fmtAngka.format(total)}` : '';
  $('btn-prev').disabled = halaman <= 1;
  $('btn-next').disabled = halaman * ukuran >= total;
  if (!rows.length) {
    $('tbl-pf').innerHTML = '<tbody><tr><td class="loading">Belum ada proforma.</td></tr></tbody>';
    return;
  }
  $('tbl-pf').innerHTML = `
    <thead><tr>
      <th>Dibuat</th><th>No PI</th><th>SO</th><th>Customer</th><th>Tipe</th><th>Ext Doc No</th>
      <th>Posting Date</th><th>Due Date</th><th class="num">Amount</th><th class="num">Dibayar</th><th>Status PI</th><th>Oleh</th>
    </tr></thead>
    <tbody>${rows.map(r => `
      <tr class="baris-pf" data-id="${r.id}" tabindex="0">
        <td>${waktu(r.created_at)}</td>
        <td><b>${teks(r.pi_no)}</b></td>
        <td>${teks(r.so_no)}</td>
        <td class="wrap">${teks(r.customer)}</td>
        <td>${teks(r.proforma_type)}</td>
        <td>${teks(r.ext_doc)}</td>
        <td>${tanggal(r.posting_date)}</td>
        <td>${tanggal(r.due_date)}</td>
        <td class="num">${angka(r.amount)}</td>
        <td class="num">${angka(r.dibayar)}</td>
        <td>${teks(r.status_pi)}</td>
        <td>${teks(r.created_by)}</td>
      </tr>`).join('')}
    </tbody>`;
}

const field = (label, isi, lebar) => `<label class="field${lebar ? ' field-lebar' : ''}"><span class="field-label">${label}</span><span class="field-input">${isi}</span></label>`;

async function bukaDetail(id) {
  state.aktif = null;
  $('m-pf-isi').innerHTML = '<div class="loading">Memuat…</div>';
  $('m-pf-foot').hidden = true;
  $('m-pf').hidden = false;
  document.body.style.overflow = 'hidden';
  try {
    const d = await ambilJson(`/api/proforma/${id}`);
    const p = d.proforma;
    state.aktif = p;
    $('m-pf-judul').textContent = p.pi_no || 'Proforma gagal dibuat';
    $('m-pf-sub').textContent = [p.so_no, p.customer, p.project_code].filter(Boolean).join(' · ');
    const bisaEdit = p.status === 'DIBUAT' && p.pi_no;
    const form = bisaEdit ? `
      <div class="pf-form">
        ${field('Tipe', `<select id="e-tipe">${TIPE_PI.map(t => `<option ${t === p.proforma_type ? 'selected' : ''}>${t}</option>`).join('')}</select>`)}
        ${field('Amount', `<input id="e-amount" class="input-nominal" inputmode="numeric" value="${fmtAngka.format(Number(p.amount || 0))}">`)}
        ${field('Posting Date', `<input id="e-posting" type="date" value="${esc(String(p.posting_date || '').slice(0, 10))}">`)}
        ${field('Due Date', `<input id="e-due" type="date" value="${esc(String(p.due_date || '').slice(0, 10))}">`)}
        ${field('External Document No', `<input id="e-ext" maxlength="35" value="${esc(p.ext_doc || '')}">`)}
        ${field('Your Reference', `<input id="e-ref" maxlength="35" value="${esc(p.your_ref || '')}">`)}
        ${field('Work Description', `<textarea id="e-work" rows="3" maxlength="2000">${esc(p.work_desc || '')}</textarea>`, true)}
        ${field('Remarks', `<textarea id="e-remark" rows="3" maxlength="2000">${esc(p.remarks || '')}</textarea>`, true)}
      </div>` : `<div class="alert">${esc(p.pesan || 'Proforma ini tidak bisa diubah.')}</div>`;
    const items = d.items.map(it => `
      <tr><td>${teks(it.kode_opening)}</td><td>${teks(it.kode_unit)}</td><td>${teks(it.item_no)}</td>
      <td class="wrap">${teks(it.nama_item)}</td><td class="num">${qty(it.qty)}</td><td class="num">${angka(it.line_amount)}</td></tr>`).join('');
    const riwayat = d.riwayat.map(r => `<li><b>${esc(r.aksi === 'BUAT' ? 'Dibuat' : 'Diubah')}</b> ${waktu(r.waktu)} · ${teks(r.oleh)}</li>`).join('');
    $('m-pf-isi').innerHTML = `
      <div class="tagih-ringkas small pf-ringkas">
        <span>Status <b>${badge(p.status)}</b></span>
        <span>Status PI <b>${teks(p.status_pi)}</b></span>
        <span>Dibayar <b>${angka(p.dibayar)}</b></span>
        <span>Dibuat <b>${waktu(p.created_at)} · ${teks(p.created_by)}</b></span>
      </div>
      ${form}
      <div class="detail-title pf-sub-judul">Item ditagih</div>
      <div class="table-wrap"><table class="tbl">
        <thead><tr><th>Kode Opening</th><th>Kode Unit</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th></tr></thead>
        <tbody>${items || '<tr><td colspan="6" class="loading">Tidak ada data item.</td></tr>'}</tbody>
      </table></div>
      ${riwayat ? `<div class="detail-title pf-sub-judul">Riwayat</div><ul class="pf-riwayat">${riwayat}</ul>` : ''}`;
    $('m-pf-foot').hidden = !bisaEdit;
    $('m-pf-info').textContent = p.updated_at ? `Terakhir diubah ${String(p.updated_at)} · ${p.updated_by || ''}` : '';
  } catch (e) {
    $('m-pf-isi').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
}

const bacaAngka = v => {
  if (!/[0-9]/.test(String(v ?? ''))) return NaN;
  const n = Number(String(v).replace(/[^0-9,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

async function simpanEdit() {
  const p = state.aktif;
  if (!p) return;
  const baru = {
    proforma_type: $('e-tipe').value,
    amount: bacaAngka($('e-amount').value),
    posting_date: $('e-posting').value,
    due_date: $('e-due').value,
    ext_doc: $('e-ext').value.trim(),
    your_ref: $('e-ref').value.trim(),
    work_desc: $('e-work').value.trim(),
    remarks: $('e-remark').value.trim()
  };
  const lama = {
    proforma_type: p.proforma_type, amount: Number(p.amount), posting_date: String(p.posting_date || '').slice(0, 10),
    due_date: String(p.due_date || '').slice(0, 10), ext_doc: p.ext_doc || '', your_ref: p.your_ref || '',
    work_desc: p.work_desc || '', remarks: p.remarks || ''
  };
  if (!Number.isFinite(baru.amount) || baru.amount <= 0) { toast('Amount tidak valid.'); return; }
  const ubah = Object.fromEntries(Object.entries(baru).filter(([k, v]) => String(v) !== String(lama[k])));
  if (!Object.keys(ubah).length) { toast('Tidak ada perubahan.'); return; }
  const tombol = $('m-pf-simpan');
  tombol.disabled = true;
  tombol.textContent = 'Menyimpan ke BC…';
  try {
    await kirimJson(`/api/proforma/${p.id}/ubah`, ubah);
    toast(`${p.pi_no} tersimpan.`);
    await bukaDetail(p.id);
    muat();
  } catch (e) {
    toast(e.message);
  } finally {
    tombol.disabled = false;
    tombol.textContent = 'Simpan ke BC';
  }
}

function tutup() {
  $('m-pf').hidden = true;
  document.body.style.overflow = '';
}

document.addEventListener('DOMContentLoaded', () => {
  let t = null;
  $('f-cari').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.halaman = 1; muat(); }, 350); });
  $('btn-prev').addEventListener('click', () => { state.halaman -= 1; muat(); });
  $('btn-next').addEventListener('click', () => { state.halaman += 1; muat(); });
  $('tbl-pf').addEventListener('click', e => { const tr = e.target.closest('tr[data-id]'); if (tr) bukaDetail(tr.dataset.id); });
  $('tbl-pf').addEventListener('keydown', e => { const tr = e.target.closest('tr[data-id]'); if (tr && e.key === 'Enter') bukaDetail(tr.dataset.id); });
  document.querySelectorAll('[data-tutup-pf]').forEach(b => b.addEventListener('click', tutup));
  $('m-pf').addEventListener('click', e => { if (e.target === $('m-pf')) tutup(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('m-pf').hidden) tutup(); });
  $('m-pf-simpan').addEventListener('click', simpanEdit);
  $('m-pf-isi').addEventListener('focusout', e => {
    if (e.target.id === 'e-amount') { const n = bacaAngka(e.target.value); if (Number.isFinite(n)) e.target.value = fmtAngka.format(Math.round(n)); }
  });
  muat();
});