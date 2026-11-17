const $ = id => document.getElementById(id);
const state = { status: 'belum', halaman: 1, data: null, pilih: new Set(), urut: 0 };

const kunci = r => `${r.so_no}|${r.line_no}`;

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

async function muat() {
  const no = ++state.urut;
  const params = new URLSearchParams({
    q: $('f-cari').value.trim(),
    status: state.status,
    periode: $('f-periode').value,
    halaman: state.halaman
  });
  tampilPesan('');
  $('tbl-fg').innerHTML = '<tbody><tr><td class="loading">Memuat item FG…</td></tr></tbody>';
  try {
    const data = await ambilJson(`/api/penagihan?${params}`);
    if (no !== state.urut) return;
    state.data = data;
    state.pilih.clear();
    renderRingkas();
    renderTabel();
  } catch (e) {
    if (no !== state.urut) return;
    tampilPesan(e.message);
    $('tbl-fg').innerHTML = '';
  }
}

function renderRingkas() {
  const r = state.data.ringkas;
  const jml = Number(r.jml), nilai = Number(r.nilai);
  const jt = Number(r.jml_tagih), nt = Number(r.nilai_tagih);
  $('k-fg').textContent = fmtAngka.format(jml);
  $('k-fg-sub').innerHTML = `Nilai ${ringkas(nilai)}`;
  $('k-tagih').textContent = fmtAngka.format(jt);
  $('k-tagih-sub').innerHTML = `Ditagih ${ringkas(Number(r.nominal_tagih || 0))} · ${persen(jml ? jt / jml * 100 : 0)} item`;
  $('k-tagih-bar').style.width = `${jml ? Math.min(100, jt / jml * 100) : 0}%`;
  $('k-belum').textContent = fmtAngka.format(jml - jt);
  $('k-belum-sub').innerHTML = `Nilai ${ringkas(nilai - nt)}`;
}

function daftarPi(list) {
  if (!list || !list.length) return STRIP;
  return `<div class="pi-list">${list.map(p => `<span>${esc(p.no)}</span>`).join('')}</div>`;
}

function renderTabel() {
  const { rows, total, halaman, ukuran } = state.data;
  const label = { belum: 'belum ditagih', sudah: 'sudah ditagih', semua: '' }[state.status];
  $('judul-tabel').textContent = `Daftar item FG ${label}`.trim();
  const awal = total ? (halaman - 1) * ukuran + 1 : 0;
  $('info-halaman').textContent = `Menampilkan ${fmtAngka.format(awal)}–${fmtAngka.format((halaman - 1) * ukuran + rows.length)} dari ${fmtAngka.format(total)} item`;
  $('btn-prev').disabled = halaman <= 1;
  $('btn-next').disabled = halaman * ukuran >= total;
  updatePilih();
  if (!rows.length) {
    $('tbl-fg').innerHTML = '<tbody><tr><td class="loading">Tidak ada item untuk filter ini.</td></tr></tbody>';
    return;
  }
  const body = rows.map(r => `
    <tr class="${r.is_ticked ? 'ditagih' : ''}" data-k="${esc(kunci(r))}">
      <td class="cek"><label class="cek-area"><input type="checkbox" data-pilih aria-label="Pilih" ${state.pilih.has(kunci(r)) ? 'checked' : ''}></label></td>
      <td>${tanggal(r.tgl_output)}</td>
      <td>${teks(r.prod_order_no)}</td>
      <td title="${esc(r.fppp_kode || '')}">${teks(r.fppp_no)}</td>
      <td><b>${esc(r.so_no)}</b></td>
      <td class="wrap">${teks(r.customer)}</td>
      <td>${teks(r.top)}</td>
      <td>${daftarPi(r.proforma)}</td>
      <td>${teks(r.quo)}</td>
      <td>${r.project_code ? `<a href="/project?kode=${encodeURIComponent(r.project_code)}" title="${esc(r.project_name || '')}">${esc(r.project_code)}</a>` : STRIP}</td>
      <td>${teks(r.item_no)}</td>
      <td class="wrap">${teks(r.nama_item)}</td>
      <td class="num">${qty(r.qty)}</td>
      <td class="num">${angka(r.nilai)}</td>
      <td class="num">${r.is_ticked && ada(r.nilai_tagih) ? `<b>${angka(r.nilai_tagih)}</b>` : ''}</td>
      <td class="small muted">${r.is_ticked ? `${teks(r.updated_by)}<br>${teks(r.updated_at)}` : ''}</td>
    </tr>`).join('');
  $('tbl-fg').innerHTML = `
    <thead><tr>
      <th class="cek"><label class="cek-area"><input type="checkbox" id="pilih-semua" aria-label="Pilih semua"></label></th>
      <th>Tanggal Output</th><th>Prod Order No</th><th>FPPP No</th><th>SO No</th><th>Customer</th><th>TOP</th><th>Proforma</th><th>QUO / CO</th>
      <th>Kode Project</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th><th class="num">Nominal Tagih</th><th>Ditandai oleh</th>
    </tr></thead>
    <tbody>${body}</tbody>`;
}

function updatePilih() {
  const n = state.pilih.size;
  const nilai = [...state.pilih].map(barisDariKunci).filter(Boolean).reduce((a, r) => a + Number(r.nilai || 0), 0);
  $('info-pilih').textContent = `${fmtAngka.format(n)} item dipilih`;
  $('info-nilai').textContent = `Nilai ${fmtAngka.format(nilai)}`;
  $('aksi-bar').hidden = !n;
  document.body.classList.toggle('ada-aksi', n > 0);
  $('btn-tandai').hidden = state.status === 'sudah';
  $('btn-batal').hidden = state.status === 'belum';
}

function barisDariKunci(k) {
  return state.data.rows.find(r => kunci(r) === k);
}

async function simpan(rows, tagih, total = {}) {
  const items = rows.map(r => ({ so_no: r.so_no, line_no: r.line_no }));
  const hasil = await kirimJson('/api/penagihan/tandai', { items, tagih, total });
  const sekarang = new Date();
  const waktu = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}-${String(sekarang.getDate()).padStart(2, '0')} ${String(sekarang.getHours()).padStart(2, '0')}:${String(sekarang.getMinutes()).padStart(2, '0')}`;
  const ringkasData = state.data.ringkas;
  rows.forEach(r => {
    if (Boolean(r.is_ticked) === tagih) return;
    const arah = tagih ? 1 : -1;
    const nilaiTagih = tagih ? Number((hasil.nominal || {})[kunci(r)] || 0) : Number(r.nilai_tagih || 0);
    r.is_ticked = tagih ? 1 : 0;
    r.nilai_tagih = tagih ? nilaiTagih : null;
    r.updated_by = tagih ? hasil.oleh : null;
    r.updated_at = tagih ? waktu : null;
    ringkasData.jml_tagih = Number(ringkasData.jml_tagih) + arah;
    ringkasData.nilai_tagih = Number(ringkasData.nilai_tagih) + arah * Number(r.nilai);
    ringkasData.nominal_tagih = Number(ringkasData.nominal_tagih || 0) + arah * nilaiTagih;
  });
  renderRingkas();
  return hasil;
}

const bacaAngka = v => {
  if (!/[0-9]/.test(String(v ?? ''))) return NaN;
  const n = Number(String(v).replace(/[^0-9,-]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

const konfirmasi = { rows: [], data: null, selesai: null };

function tutupKonfirmasi(tersimpan) {
  $('m-tagih').hidden = true;
  document.body.style.overflow = '';
  const selesai = konfirmasi.selesai;
  konfirmasi.selesai = null;
  if (selesai) selesai(tersimpan);
}

function totalSo(blok) {
  return bacaAngka(blok.querySelector('input[data-tot]').value);
}

function hitungTotalKonfirmasi(sumber) {
  const blok = [...document.querySelectorAll('#m-tagih-isi [data-so]')];
  const totalInp = $('m-tagih-total');
  if (sumber === totalInp && blok.length === 1) {
    blok[0].querySelector('input[data-tot]').value = totalInp.value;
  }
  let total = 0;
  let valid = true;
  blok.forEach(b => {
    const inp = b.querySelector('input[data-tot]');
    const n = totalSo(b);
    const salah = !Number.isFinite(n) || n < 0;
    inp.classList.toggle('salah', salah);
    if (salah) { valid = false; return; }
    total += n;
    const warn = b.querySelector('[data-warn]');
    const sisa = Number(b.dataset.sisa);
    warn.hidden = n <= sisa + 1;
    warn.textContent = `Melebihi sisa tagihan ${fmtAngka.format(sisa)}.`;
  });
  if (sumber !== totalInp) totalInp.value = valid ? fmtAngka.format(Math.round(total)) : '';
  totalInp.classList.toggle('salah', sumber === totalInp && !valid);
  $('m-tagih-simpan').disabled = !valid;
}

function renderKonfirmasi(data) {
  $('m-tagih-isi').innerHTML = data.so.map(so => `
    <div class="tagih-so" data-so="${esc(so.so_no)}" data-sisa="${Number(so.sisa)}">
      <div class="tagih-so-head">
        <div class="tagih-so-judul"><b>${esc(so.so_no)}</b>${so.project_code ? `<span class="muted">${esc(so.project_code)}</span>` : ''}</div>
        <dl class="tagih-meta">
          <div><dt>Customer</dt><dd>${teks(so.customer)}</dd></div>
          <div><dt>TOP</dt><dd>${teks(so.top)}</dd></div>
          <div class="lebar"><dt>Proforma</dt><dd>${daftarPi(so.proforma)}</dd></div>
        </dl>
        <div class="tagih-ringkas small">
          <span>Kontrak <b>${angka(so.kontrak)}</b></span>
          <span>DP terbayar <b>${angka(so.dp)}</b></span>
          <span>Sudah ditagih <b>${angka(so.sudah_ditagih)}</b></span>
          <span>Sisa tagihan <b>${angka(so.sisa)}</b></span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th></tr></thead>
          <tbody>${so.items.map(it => `
            <tr>
              <td>${teks(it.item_no)}</td>
              <td class="wrap">${teks(it.nama_item)}</td>
              <td class="num">${qty(it.qty)}</td>
              <td class="num">${angka(it.nilai)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="3"><b>Subtotal</b></td><td class="num"><b>${angka(so.subtotal)}</b></td></tr>
            <tr><td colspan="3">PPN ${fmtPersen.format(data.ppn * 100)}%</td><td class="num">${angka(so.ppn)}</td></tr>
            <tr><td colspan="3"><b>Total</b></td><td class="num"><input class="input-nominal input-sub" data-tot inputmode="numeric" value="${fmtAngka.format(so.total)}" aria-label="Total ${esc(so.so_no)}"></td></tr>
          </tfoot>
        </table>
      </div>
      <div class="tagih-warn" data-warn hidden></div>
    </div>`).join('');
  $('m-tagih-total').readOnly = data.so.length > 1;
  hitungTotalKonfirmasi();
}

async function bukaKonfirmasi(rows) {
  konfirmasi.rows = rows;
  $('m-tagih-isi').innerHTML = '<div class="loading">Menghitung nominal…</div>';
  $('m-tagih-total').value = '';
  $('m-tagih-simpan').disabled = true;
  $('m-tagih').hidden = false;
  document.body.style.overflow = 'hidden';
  const tunggu = new Promise(res => { konfirmasi.selesai = res; });
  try {
    const data = await kirimJson('/api/penagihan/hitung', { items: rows.map(r => ({ so_no: r.so_no, line_no: r.line_no })) });
    konfirmasi.data = data;
    renderKonfirmasi(data);
  } catch (e) {
    $('m-tagih-isi').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
  return tunggu;
}

async function simpanKonfirmasi() {
  const total = {};
  document.querySelectorAll('#m-tagih-isi [data-so]').forEach(b => { total[b.dataset.so] = Math.round(totalSo(b)); });
  const kunciItem = new Set(konfirmasi.data.so.flatMap(so => so.items.map(it => `${it.so_no}|${it.line_no}`)));
  const rows = konfirmasi.rows.filter(r => kunciItem.has(kunci(r)));
  const tombol = $('m-tagih-simpan');
  tombol.disabled = true;
  try {
    await simpan(rows, true, total);
    toast(`${rows.length} item ditandai ditagih.`);
    tutupKonfirmasi(true);
  } catch (e) {
    toast(e.message);
    tombol.disabled = false;
  }
}

async function aksiMassal(tagih) {
  const rows = [...state.pilih].map(barisDariKunci).filter(Boolean).filter(r => Boolean(r.is_ticked) !== tagih);
  if (!rows.length) { toast('Semua item terpilih sudah dalam status itu.'); return; }
  if (tagih) {
    if (await bukaKonfirmasi(rows)) { state.pilih.clear(); renderTabel(); }
    return;
  }
  const total = rows.reduce((a, r) => a + Number(r.nilai_tagih || 0), 0);
  if (!confirm(`Batalkan tagih untuk ${rows.length} item (nominal ${fmtAngka.format(total)})?`)) return;
  try {
    await simpan(rows, false);
    toast(`${rows.length} item dibatalkan.`);
    state.pilih.clear();
    renderTabel();
  } catch (e) {
    toast(e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  let t = null;
  $('f-cari').addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => { state.halaman = 1; muat(); }, 350); });
  $('f-periode').addEventListener('change', () => { state.halaman = 1; muat(); });
  $('f-status').addEventListener('click', e => {
    const b = e.target.closest('button[data-v]');
    if (!b) return;
    document.querySelectorAll('#f-status button').forEach(x => x.classList.toggle('aktif', x === b));
    state.status = b.dataset.v;
    state.halaman = 1;
    muat();
  });
  $('btn-prev').addEventListener('click', () => { state.halaman -= 1; muat(); window.scrollTo({ top: 0 }); });
  $('btn-next').addEventListener('click', () => { state.halaman += 1; muat(); window.scrollTo({ top: 0 }); });
  $('btn-tandai').addEventListener('click', () => aksiMassal(true));
  $('btn-batal').addEventListener('click', () => aksiMassal(false));
  document.querySelectorAll('[data-tutup-tagih]').forEach(b => b.addEventListener('click', () => tutupKonfirmasi(false)));
  $('m-tagih').addEventListener('click', e => { if (e.target === $('m-tagih')) tutupKonfirmasi(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('m-tagih').hidden) tutupKonfirmasi(false); });
  $('m-tagih-simpan').addEventListener('click', simpanKonfirmasi);
  $('m-tagih-isi').addEventListener('input', e => { if (e.target.matches('input[data-tot]')) hitungTotalKonfirmasi(e.target); });
  $('m-tagih-total').addEventListener('input', e => hitungTotalKonfirmasi(e.target));
  const rapikan = inp => { const n = bacaAngka(inp.value); if (Number.isFinite(n)) inp.value = fmtAngka.format(Math.round(n)); };
  $('m-tagih-isi').addEventListener('focusout', e => { if (e.target.matches('input[data-tot]')) { rapikan(e.target); hitungTotalKonfirmasi(); } });
  $('m-tagih-total').addEventListener('focusout', e => { if (!e.target.readOnly) { rapikan(e.target); hitungTotalKonfirmasi(e.target); } });

  $('btn-kosong').addEventListener('click', () => {
    state.pilih.clear();
    document.querySelectorAll('#tbl-fg [data-pilih], #pilih-semua').forEach(c => { c.checked = false; });
    updatePilih();
  });

  $('tbl-fg').addEventListener('change', async e => {
    if (e.target.id === 'pilih-semua') {
      const on = e.target.checked;
      document.querySelectorAll('#tbl-fg [data-pilih]').forEach(c => { c.checked = on; });
      state.pilih = on ? new Set(state.data.rows.map(kunci)) : new Set();
      updatePilih();
      return;
    }
    const tr = e.target.closest('tr[data-k]');
    if (!tr) return;
    const k = tr.dataset.k;
    if (e.target.matches('[data-pilih]')) {
      if (e.target.checked) state.pilih.add(k); else state.pilih.delete(k);
      updatePilih();
      return;
    }
    if (e.target.matches('[data-tagih]')) {
      const r = barisDariKunci(k);
      const tagih = e.target.checked;
      e.target.checked = !tagih;
      if (tagih) {
        if (await bukaKonfirmasi([r])) renderTabel();
        return;
      }
      if (!confirm(`Batalkan tagih ${r.item_no} (nominal ${fmtAngka.format(Number(r.nilai_tagih || 0))})?`)) return;
      e.target.disabled = true;
      try {
        await simpan([r], false);
        renderTabel();
        toast(`${r.item_no} dibatalkan.`);
      } catch (err) {
        toast(err.message);
        e.target.disabled = false;
      }
    }
  });

  muat();
});