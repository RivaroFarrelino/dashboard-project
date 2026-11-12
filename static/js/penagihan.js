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
  $('k-tagih-sub').innerHTML = `${ringkas(nt)} · ${persen(jml ? jt / jml * 100 : 0)} item`;
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
      <td class="small muted">${r.is_ticked ? `${teks(r.updated_by)}<br>${teks(r.updated_at)}` : ''}</td>
    </tr>`).join('');
  $('tbl-fg').innerHTML = `
    <thead><tr>
      <th class="cek"><input type="checkbox" id="pilih-semua" aria-label="Pilih semua"></th>
      <th>Ditagih</th><th>Tanggal Output</th><th>Prod Order No</th><th>FPPP No</th><th>SO No</th><th>QUO / CO</th>
      <th>Kode Project</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th><th>Ditandai oleh</th>
    </tr></thead>
    <tbody>${body}</tbody>`;
}

function updatePilih() {
  const n = state.pilih.size;
  $('info-pilih').textContent = n ? `${n} item dipilih` : '';
  $('btn-tandai').disabled = !n;
  $('btn-batal').disabled = !n;
}

function barisDariKunci(k) {
  return state.data.rows.find(r => kunci(r) === k);
}

async function simpan(rows, tagih) {
  const items = rows.map(r => ({ so_no: r.so_no, line_no: r.line_no }));
  const hasil = await kirimJson('/api/penagihan/tandai', { items, tagih });
  const sekarang = new Date();
  const waktu = `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}-${String(sekarang.getDate()).padStart(2, '0')} ${String(sekarang.getHours()).padStart(2, '0')}:${String(sekarang.getMinutes()).padStart(2, '0')}`;
  const ringkasData = state.data.ringkas;
  rows.forEach(r => {
    if (Boolean(r.is_ticked) === tagih) return;
    r.is_ticked = tagih ? 1 : 0;
    r.updated_by = tagih ? hasil.oleh : null;
    r.updated_at = tagih ? waktu : null;
    const arah = tagih ? 1 : -1;
    ringkasData.jml_tagih = Number(ringkasData.jml_tagih) + arah;
    ringkasData.nilai_tagih = Number(ringkasData.nilai_tagih) + arah * Number(r.nilai);
  });
  renderRingkas();
  return hasil;
}

async function aksiMassal(tagih) {
  const rows = [...state.pilih].map(barisDariKunci).filter(Boolean).filter(r => Boolean(r.is_ticked) !== tagih);
  if (!rows.length) { toast('Semua item terpilih sudah dalam status itu.'); return; }
  const total = rows.reduce((a, r) => a + Number(r.nilai), 0);
  if (!confirm(`${tagih ? 'Tandai' : 'Batalkan tagih untuk'} ${rows.length} item (nilai ${fmtAngka.format(total)})?`)) return;
  try {
    await simpan(rows, tagih);
    toast(`${rows.length} item ${tagih ? 'ditandai ditagih' : 'dibatalkan'}.`);
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
      e.target.disabled = true;
      try {
        await simpan([r], tagih);
        tr.classList.toggle('ditagih', tagih);
        tr.lastElementChild.innerHTML = tagih ? `${teks(r.updated_by)}<br>${teks(r.updated_at)}` : '';
        toast(`${r.item_no} ${tagih ? 'ditandai ditagih' : 'dibatalkan'}.`);
      } catch (err) {
        e.target.checked = !tagih;
        toast(err.message);
      } finally {
        e.target.disabled = false;
      }
    }
  });

  muat();
});