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
      <td class="cek"><input type="checkbox" data-pilih aria-label="Pilih"></td>
      <td><label class="switch"><input type="checkbox" data-tagih ${r.is_ticked ? 'checked' : ''}><span></span></label></td>
      <td>${tanggal(r.tgl_output)}</td>
      <td>${teks(r.prod_order_no)}</td>
      <td title="${esc(r.fppp_kode || '')}">${teks(r.fppp_no)}</td>
      <td><b>${esc(r.so_no)}</b></td>
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
      <th class="cek"><input type="checkbox" id="pilih-semua" aria-label="Pilih semua"></th>
      <th>Ditagih</th><th>Tanggal Output</th><th>Prod Order No</th><th>FPPP No</th><th>SO No</th><th>QUO / CO</th>
      <th>Kode Project</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th><th class="num">Nominal Tagih</th><th>Ditandai oleh</th>
    </tr></thead>
    <tbody>${body}</tbody>`;
}

function updatePilih() {
  const n = state.pilih.size;
  $('info-pilih').textContent = n ? `${n} item dipilih` : '';
  $('btn-tandai').disabled = !n;
  $('btn-batal').disabled = !n;
  $('btn-tandai').hidden = state.status === 'sudah';
  $('btn-batal').hidden = state.status === 'belum';
}

function barisDariKunci(k) {
  return state.data.rows.find(r => kunci(r) === k);
}

async function simpan(rows, tagih, nominal = {}) {
  const items = rows.map(r => ({ so_no: r.so_no, line_no: r.line_no, nominal: nominal[kunci(r)] }));
  const hasil = await kirimJson('/api/penagihan/tandai', { items, tagih });
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
  const t = String(v ?? '').replace(/[^0-9,-]/g, '').replace(',', '.');
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};

const konfirmasi = { rows: [], data: null, selesai: null, ppn: 0.11 };

const plusPpn = dpp => Math.floor(dpp * (1 + konfirmasi.ppn) + 0.5);

function tutupKonfirmasi(tersimpan) {
  $('m-tagih').hidden = true;
  document.body.style.overflow = '';
  const selesai = konfirmasi.selesai;
  konfirmasi.selesai = null;
  if (selesai) selesai(tersimpan);
}

function isiJikaTidakFokus(inp, n) {
  if (document.activeElement !== inp) inp.value = fmtAngka.format(Math.round(n));
}

function hitungTotalKonfirmasi() {
  let total = 0;
  let valid = true;
  document.querySelectorAll('#m-tagih-isi [data-so]').forEach(blok => {
    let sub = 0;
    blok.querySelectorAll('input[data-k]').forEach(inp => {
      const n = bacaAngka(inp.value);
      const salah = !Number.isFinite(n) || n < 0;
      inp.classList.toggle('salah', salah);
      if (salah) valid = false; else sub += n;
    });
    const totSo = plusPpn(sub);
    total += totSo;
    const sisa = Number(blok.dataset.sisa);
    const subInp = blok.querySelector('input[data-sub]');
    const totInp = blok.querySelector('input[data-tot]');
    isiJikaTidakFokus(subInp, sub);
    isiJikaTidakFokus(totInp, totSo);
    subInp.classList.remove('salah');
    totInp.classList.remove('salah');
    blok.querySelector('[data-ppn]').innerHTML = angka(totSo - sub);
    const warn = blok.querySelector('[data-warn]');
    warn.hidden = totSo <= sisa + 1;
    warn.textContent = `Melebihi sisa tagihan ${fmtAngka.format(sisa)}.`;
  });
  const totalInp = $('m-tagih-total');
  isiJikaTidakFokus(totalInp, total);
  totalInp.classList.remove('salah');
  $('m-tagih-simpan').disabled = !valid;
}

function bagiNominal(inputs, jumlah) {
  let sisa = Math.max(0, Math.round(jumlah));
  inputs.forEach((inp, i) => {
    const batas = Number(inp.dataset.nilai) || 0;
    const ambil = i === inputs.length - 1 ? sisa : Math.min(batas, sisa);
    inp.value = fmtAngka.format(ambil);
    sisa -= ambil;
  });
}

function ubahGabungan(inp, inputs, termasukPpn) {
  const n = bacaAngka(inp.value);
  if (!Number.isFinite(n) || n < 0) {
    inp.classList.add('salah');
    $('m-tagih-simpan').disabled = true;
    return;
  }
  bagiNominal(inputs, termasukPpn ? n / (1 + konfirmasi.ppn) : n);
  hitungTotalKonfirmasi();
}

function renderKonfirmasi(data) {
  $('m-tagih-isi').innerHTML = data.so.map(so => `
    <div class="tagih-so" data-so="${esc(so.so_no)}" data-sisa="${Number(so.sisa)}">
      <div class="tagih-so-head">
        <div><b>${esc(so.so_no)}</b> <span class="muted">· ${teks(so.customer)} · ${teks(so.project_code)}${so.top ? ` · TOP ${esc(so.top)}` : ''}</span></div>
        <div class="tagih-ringkas small">
          <span>Kontrak <b>${angka(so.kontrak)}</b></span>
          <span>DP terbayar <b>${angka(so.dp)}</b></span>
          <span>Sudah ditagih <b>${angka(so.sudah_ditagih)}</b></span>
          <span>Sisa tagihan <b>${angka(so.sisa)}</b></span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th><th class="num">Nominal Tagih</th></tr></thead>
          <tbody>${so.items.map(it => `
            <tr>
              <td>${teks(it.item_no)}</td>
              <td class="wrap">${teks(it.nama_item)}</td>
              <td class="num">${qty(it.qty)}</td>
              <td class="num">${angka(it.nilai)}</td>
              <td class="num"><input class="input-nominal" data-k="${esc(`${it.so_no}|${it.line_no}`)}" data-nilai="${Number(it.nilai)}" inputmode="numeric" value="${fmtAngka.format(it.nominal)}" aria-label="Nominal tagih ${esc(it.item_no)}"></td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="4"><b>Subtotal</b></td><td class="num"><input class="input-nominal input-sub" data-sub inputmode="numeric" aria-label="Subtotal ${esc(so.so_no)}"></td></tr>
            <tr><td colspan="4">PPN ${fmtPersen.format(konfirmasi.ppn * 100)}%</td><td class="num" data-ppn></td></tr>
            <tr><td colspan="4"><b>Total</b></td><td class="num"><input class="input-nominal input-sub" data-tot inputmode="numeric" aria-label="Total ${esc(so.so_no)}"></td></tr>
          </tfoot>
        </table>
      </div>
      <div class="tagih-warn" data-warn hidden></div>
    </div>`).join('');
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
    konfirmasi.ppn = Number(data.ppn ?? 0.11);
    renderKonfirmasi(data);
  } catch (e) {
    $('m-tagih-isi').innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
  return tunggu;
}

async function simpanKonfirmasi() {
  const nominal = {};
  document.querySelectorAll('#m-tagih-isi input[data-k]').forEach(inp => { nominal[inp.dataset.k] = Math.round(bacaAngka(inp.value)); });
  const rows = konfirmasi.rows.filter(r => kunci(r) in nominal);
  const tombol = $('m-tagih-simpan');
  tombol.disabled = true;
  try {
    await simpan(rows, true, nominal);
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
  $('m-tagih-isi').addEventListener('input', e => {
    if (e.target.matches('input[data-k]')) hitungTotalKonfirmasi();
    if (e.target.matches('input[data-sub]')) ubahGabungan(e.target, [...e.target.closest('[data-so]').querySelectorAll('input[data-k]')], false);
    if (e.target.matches('input[data-tot]')) ubahGabungan(e.target, [...e.target.closest('[data-so]').querySelectorAll('input[data-k]')], true);
  });
  $('m-tagih-total').addEventListener('input', e => ubahGabungan(e.target, [...document.querySelectorAll('#m-tagih-isi input[data-k]')], true));
  $('m-tagih-total').addEventListener('focusout', () => hitungTotalKonfirmasi());
  $('m-tagih-isi').addEventListener('focusout', e => {
    if (e.target.matches('input[data-sub], input[data-tot]')) { hitungTotalKonfirmasi(); return; }
    if (!e.target.matches('input[data-k]')) return;
    const n = bacaAngka(e.target.value);
    if (Number.isFinite(n) && e.target.value.trim() !== '') e.target.value = fmtAngka.format(Math.round(n));
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