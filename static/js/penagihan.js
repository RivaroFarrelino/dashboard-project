const $ = id => document.getElementById(id);
const state = { status: 'belum', halaman: 1, data: null, pilih: new Set(), urut: 0, bukaSo: new Set(), bukaFp: new Set(), bukaOp: new Set() };

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
  $('tbl-fg').innerHTML = '<div class="loading">Memuat FG…</div>';
  try {
    const data = await ambilJson(`/api/penagihan?${params}`);
    if (no !== state.urut) return;
    state.data = data;
    state.pilih.clear();
    if (params.get('q')) {
      data.rows.forEach(r => { state.bukaSo.add(r.so_no); state.bukaFp.add(kunciFp(r)); state.bukaOp.add(kunciOpR(r)); });
    }
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

const TANPA_OPENING = '(tanpa kode opening)';
const labelFp = r => r.fppp_no || r.fppp_kode || '(tanpa FPPP)';
const kunciFp = r => `${r.so_no}|${labelFp(r)}`;
const kunciOpR = r => `${kunciFp(r)}|${r.kode_opening || TANPA_OPENING}`;
const bisaDipilih = r => state.status === 'semua' || (state.status === 'sudah' ? Boolean(r.is_ticked) : !r.is_ticked);
const SVG_PANAH = '<svg class="panah" viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>';

function kelompok(rows) {
  const so = new Map();
  rows.forEach(r => {
    if (!so.has(r.so_no)) so.set(r.so_no, { so: r.so_no, info: r, rows: [], fps: new Map() });
    const g = so.get(r.so_no);
    g.rows.push(r);
    const fk = kunciFp(r);
    if (!g.fps.has(fk)) g.fps.set(fk, { key: fk, fp: labelFp(r), rows: [], ops: new Map() });
    const f = g.fps.get(fk);
    f.rows.push(r);
    const ok = kunciOpR(r);
    if (!f.ops.has(ok)) f.ops.set(ok, { key: ok, op: r.kode_opening || TANPA_OPENING, rows: [] });
    f.ops.get(ok).rows.push(r);
  });
  return [...so.values()].map(g => ({
    ...g,
    nOp: [...g.fps.values()].reduce((a, f) => a + f.ops.size, 0),
    fps: [...g.fps.values()].map(f => ({ ...f, ops: [...f.ops.values()] }))
  }));
}

const tglMaks = (rows, k) => rows.reduce((m, r) => (r[k] && (!m || r[k] > m) ? r[k] : m), null);

function ringkasGrup(rows) {
  const tagih = rows.filter(r => r.is_ticked);
  return {
    n: rows.length,
    nilai: rows.reduce((a, r) => a + Number(r.nilai || 0), 0),
    nTagih: tagih.length,
    nominal: tagih.reduce((a, r) => a + Number(r.nilai_tagih || 0), 0)
  };
}

const sel = (cls, isi, attr = '') => `<div class="${cls}" ${attr}>${isi}</div>`;
const cek = (tipe, kunciNya, label) => `<label class="cek-area"><input type="checkbox" data-cek="${tipe}" data-key="${esc(kunciNya)}" aria-label="${esc(label)}"></label>`;
const statusTagih = g => g.nTagih === 0 ? '<span class="muted small">–</span>'
  : `<span class="tagih-n ${g.nTagih === g.n ? 'penuh' : ''}">${g.nTagih}/${g.n}</span><span class="small muted">${angka(g.nominal)}</span>`;

function renderTabel() {
  const { rows, total, halaman, ukuran } = state.data;
  const label = { belum: 'belum ditagih', sudah: 'sudah ditagih', semua: '' }[state.status];
  $('judul-tabel').textContent = `Daftar FG ${label}`.trim();
  const awal = total ? (halaman - 1) * ukuran + 1 : 0;
  const grup = kelompok(rows);
  $('info-halaman').textContent = total ? `SO ${fmtAngka.format(awal)}–${fmtAngka.format(awal + grup.length - 1)} dari ${fmtAngka.format(total)}` : '';
  $('btn-prev').disabled = halaman <= 1;
  $('btn-next').disabled = halaman * ukuran >= total;
  updatePilih();
  if (!grup.length) {
    $('tbl-fg').innerHTML = '<div class="loading">Tidak ada FG untuk filter ini.</div>';
    return;
  }
  const head = `
    <div class="fg-head">
      <label class="cek-area"><input type="checkbox" id="pilih-semua" aria-label="Pilih semua"></label>
      <div>SO</div><div>Customer</div><div>TOP</div><div>Proforma</div><div class="num">Item</div><div class="num">Nilai</div><div class="num">Ditagih</div>
    </div>`;
  const body = grup.map(g => {
    const rg = ringkasGrup(g.rows);
    const bukaSo = state.bukaSo.has(g.so);
    const fps = g.fps.map(f => {
      const rf = ringkasGrup(f.rows);
      const bukaFp = state.bukaFp.has(f.key);
      const ops = f.ops.map(o => {
      const ko = o.key;
      const ro = ringkasGrup(o.rows);
      const bukaOp = state.bukaOp.has(ko);
      const unit = o.rows.map(r => r.kode_unit).filter(Boolean);
      const items = o.rows.map(r => `
        <tr class="${r.is_ticked ? 'ditagih' : ''}" data-k="${esc(kunci(r))}">
          <td class="cek">${cek('item', kunci(r), `Pilih ${r.item_no}`)}</td>
          <td><b>${teks(r.kode_unit)}</b></td>
          <td>${teks(r.item_no)}</td>
          <td class="wrap">${teks(r.nama_item)}</td>
          <td class="num">${qty(r.qty)}</td>
          <td class="num">${angka(r.nilai)}</td>
          <td>${tanggal(r.tgl_output)}</td>
          <td>${tanggal(r.tgl_tarik)}</td>
          <td>${teks(r.prod_order_no)}</td>
          <td class="num">${r.is_ticked && ada(r.nilai_tagih) ? `<b>${angka(r.nilai_tagih)}</b>` : ''}</td>
          <td class="small muted">${r.is_ticked ? `${teks(r.updated_by)}<br>${teks(r.updated_at)}` : ''}</td>
        </tr>`).join('');
      return `
        <div class="fg-op ${bukaOp ? 'buka' : ''}" data-op="${esc(ko)}">
          <div class="fg-op-head" data-toggle-op="${esc(ko)}">
            ${cek('op', ko, `Pilih opening ${o.op}`)}
            <div class="fg-judul">${SVG_PANAH}<b>${esc(o.op)}</b></div>
            ${sel('fg-unit small muted', unit.length ? esc(unit.join(', ')) : '')}
            ${sel('', '')}
            ${sel('num', `${ro.n} item`)}
            ${sel('num', angka(ro.nilai))}
            ${sel('num fg-tagih', statusTagih(ro))}
          </div>
          <div class="fg-op-isi" ${bukaOp ? '' : 'hidden'}>
            <table class="tbl fg-item">
              <thead><tr>
                <th class="cek"></th><th>Kode Unit</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th>
                <th>Tanggal Output</th><th>Tanggal Tarik</th><th>Prod Order No</th><th class="num">Nominal Tagih</th><th>Ditandai oleh</th>
              </tr></thead>
              <tbody>${items}</tbody>
            </table>
          </div>
        </div>`;
      }).join('');
      return `
        <div class="fg-fp ${bukaFp ? 'buka' : ''}" data-fp="${esc(f.key)}">
          <div class="fg-op-head fg-fp-head" data-toggle-fp="${esc(f.key)}">
            ${cek('fp', f.key, `Pilih FPPP ${f.fp}`)}
            <div class="fg-judul">${SVG_PANAH}<b>${esc(f.fp)}</b></div>
            ${sel('', `<span class="muted small">Selesai</span> ${tanggal(tglMaks(f.rows, 'tgl_fppp'))}`)}
            ${sel('', `<span class="muted small">Tarik</span> ${tanggal(tglMaks(f.rows, 'tgl_tarik'))}`)}
            ${sel('num', `${rf.n} item<div class="small muted">${f.ops.length} opening</div>`)}
            ${sel('num', angka(rf.nilai))}
            ${sel('num fg-tagih', statusTagih(rf))}
          </div>
          <div class="fg-fp-isi" ${bukaFp ? '' : 'hidden'}>${ops}</div>
        </div>`;
    }).join('');
    return `
      <div class="fg-so ${bukaSo ? 'buka' : ''}" data-so="${esc(g.so)}">
        <div class="fg-so-head" data-toggle-so="${esc(g.so)}">
          ${cek('so', g.so, `Pilih ${g.so}`)}
          <div class="fg-judul">${SVG_PANAH}<div><b>${esc(g.so)}</b> <button type="button" class="btn-riwayat" data-riwayat="${esc(g.so)}">Riwayat</button><div class="small muted">${g.info.project_code ? `<a href="/project?kode=${encodeURIComponent(g.info.project_code)}">${esc(g.info.project_code)}</a>` : ''} ${teks(g.info.quo)}</div></div></div>
          ${sel('wrap', teks(g.info.customer))}
          ${sel('', teks(g.info.top))}
          ${sel('', daftarPi(g.info.proforma))}
          ${sel('num', `${rg.n} item<div class="small muted">${g.fps.length} FPPP · ${g.nOp} opening</div>`)}
          ${sel('num', angka(rg.nilai))}
          ${sel('num fg-tagih', statusTagih(rg))}
        </div>
        <div class="fg-so-isi" ${bukaSo ? '' : 'hidden'}>${fps}</div>
      </div>`;
  }).join('');
  $('tbl-fg').innerHTML = head + body;
  syncCek();
}

function kunciGrup(tipe, key) {
  const rows = state.data.rows.filter(bisaDipilih);
  if (tipe === 'item') return rows.some(r => kunci(r) === key) ? [key] : [];
  if (tipe === 'so') return rows.filter(r => r.so_no === key).map(kunci);
  if (tipe === 'fp') return rows.filter(r => kunciFp(r) === key).map(kunci);
  if (tipe === 'op') return rows.filter(r => kunciOpR(r) === key).map(kunci);
  return rows.map(kunci);
}

function syncCek() {
  const setCek = (el, keys) => {
    const n = keys.filter(k => state.pilih.has(k)).length;
    el.disabled = !keys.length;
    el.checked = keys.length > 0 && n === keys.length;
    el.indeterminate = n > 0 && n < keys.length;
  };
  document.querySelectorAll('#tbl-fg input[data-cek]').forEach(el => setCek(el, kunciGrup(el.dataset.cek, el.dataset.key)));
  const semua = $('pilih-semua');
  if (semua) setCek(semua, kunciGrup('semua'));
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
        </div>
      </div>
      <div class="table-wrap">
        <table class="tbl">
          <thead><tr><th>Kode Opening</th><th>Kode Unit</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai</th></tr></thead>
          <tbody>${so.items.map(it => `
            <tr>
              <td>${teks(it.kode_opening)}</td>
              <td>${teks(it.kode_unit)}</td>
              <td>${teks(it.item_no)}</td>
              <td class="wrap">${teks(it.nama_item)}</td>
              <td class="num">${qty(it.qty)}</td>
              <td class="num">${angka(it.nilai)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr><td colspan="5">DPP</td><td class="num">${angka(so.dpp)}</td></tr>
            <tr><td colspan="5">PPN ${fmtPersen.format(data.ppn * 100)}%</td><td class="num">${angka(so.ppn)}</td></tr>
            <tr><td colspan="5"><b>Subtotal</b></td><td class="num"><b>${angka(so.subtotal)}</b></td></tr>
            <tr><td colspan="5"><b>Total</b></td><td class="num"><input class="input-nominal input-sub" data-tot inputmode="numeric" value="${fmtAngka.format(so.total)}" aria-label="Total ${esc(so.so_no)}"></td></tr>
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

async function bukaRiwayat(so) {
  const isi = $('m-riwayat-isi');
  $('m-riwayat-sub').textContent = so;
  isi.innerHTML = '<div class="loading">Memuat riwayat…</div>';
  $('m-riwayat').hidden = false;
  document.body.style.overflow = 'hidden';
  try {
    const d = await ambilJson(`/api/penagihan/riwayat/${encodeURIComponent(so)}`);
    const r = d.ringkas;
    $('m-riwayat-sub').textContent = [r.so_no, r.customer, r.project_code, r.top].filter(Boolean).join(' · ');
    const kpi = [
      ['Kontrak', r.kontrak], ['DP terbayar', r.dp], ['Cash in', r.cash_in],
      ['Item ditagih', r.nilai_item, `${r.jml_item} item`], ['Nominal ditagih', r.nominal], ['Sisa kontrak', r.sisa]
    ].map(([l, v, sub]) => `<div class="riwayat-kpi"><span>${l}</span><b>${angka(v)}</b>${sub ? `<small>${sub}</small>` : ''}</div>`).join('');
    const baris = d.riwayat.map((e, i) => {
      const batal = e.aksi === 'UNTICK';
      const items = e.items.map(it => `
        <tr>
          <td>${teks(it.kode_opening)}</td><td>${teks(it.kode_unit)}</td><td>${teks(it.item_no)}</td>
          <td class="wrap">${teks(it.nama_item)}</td><td class="num">${qty(it.qty)}</td>
          <td class="num">${angka(it.line_amount)}</td><td class="num">${angka(it.nilai)}</td>
        </tr>`).join('');
      return `
        <tr class="riwayat-baris ${batal ? 'batal' : ''}" data-buka="${i}">
          <td>${SVG_PANAH}</td>
          <td>${e.waktu ? `${tanggal(e.waktu)} ${esc(String(e.waktu).slice(11, 16))}` : STRIP}</td>
          <td>${teks(e.oleh)}</td>
          <td>${batal ? '<span class="badge b-red">Batal</span>' : '<span class="badge b-green">Tagih</span>'}</td>
          <td class="num">${e.items.length}</td>
          <td class="num">${angka(e.nilai_item)}</td>
          <td class="num"><b>${batal ? angka(-e.nominal) : angka(e.nominal)}</b></td>
        </tr>
        <tr class="riwayat-item" data-isi="${i}" hidden><td></td><td colspan="6">
          <table class="tbl">
            <thead><tr><th>Kode Opening</th><th>Kode Unit</th><th>Item No</th><th>Nama Item</th><th class="num">Qty</th><th class="num">Nilai Item</th><th class="num">Nominal</th></tr></thead>
            <tbody>${items}</tbody>
          </table>
        </td></tr>`;
    }).join('');
    isi.innerHTML = `
      <div class="riwayat-ringkas">${kpi}</div>
      <div class="table-wrap">
        <table class="tbl riwayat-tbl">
          <thead><tr><th></th><th>Waktu</th><th>Oleh</th><th>Aksi</th><th class="num">Item</th><th class="num">Nilai Item</th><th class="num">Nominal</th></tr></thead>
          <tbody>${baris || '<tr><td colspan="7" class="loading">Belum ada penagihan.</td></tr>'}</tbody>
        </table>
      </div>`;
  } catch (e) {
    isi.innerHTML = `<div class="alert">${esc(e.message)}</div>`;
  }
}

function tutupRiwayat() {
  $('m-riwayat').hidden = true;
  document.body.style.overflow = '';
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

  document.querySelectorAll('[data-tutup-riwayat]').forEach(b => b.addEventListener('click', tutupRiwayat));
  $('m-riwayat').addEventListener('click', e => {
    if (e.target === $('m-riwayat')) { tutupRiwayat(); return; }
    const tr = e.target.closest('tr[data-buka]');
    if (!tr) return;
    const isi = $('m-riwayat-isi').querySelector(`tr[data-isi="${tr.dataset.buka}"]`);
    isi.hidden = !isi.hidden;
    tr.classList.toggle('buka', !isi.hidden);
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('m-riwayat').hidden) tutupRiwayat(); });

  $('btn-kosong').addEventListener('click', () => {
    state.pilih.clear();
    syncCek();
    updatePilih();
  });

  $('tbl-fg').addEventListener('change', e => {
    const el = e.target;
    if (!(el.matches('input[data-cek]') || el.id === 'pilih-semua')) return;
    const keys = el.id === 'pilih-semua' ? kunciGrup('semua') : kunciGrup(el.dataset.cek, el.dataset.key);
    keys.forEach(k => (el.checked ? state.pilih.add(k) : state.pilih.delete(k)));
    syncCek();
    updatePilih();
  });

  $('tbl-fg').addEventListener('click', e => {
    const rw = e.target.closest('[data-riwayat]');
    if (rw) { bukaRiwayat(rw.dataset.riwayat); return; }
    if (e.target.closest('label.cek-area, input, a, button')) return;
    const so = e.target.closest('[data-toggle-so]');
    const op = e.target.closest('[data-toggle-op]');
    const fp = e.target.closest('[data-toggle-fp]');
    const toggle = (set, key, wadah, isi) => {
      const buka = !set.has(key);
      if (buka) set.add(key); else set.delete(key);
      wadah.classList.toggle('buka', buka);
      wadah.querySelector(isi).hidden = !buka;
    };
    if (op) { toggle(state.bukaOp, op.dataset.toggleOp, op.closest('.fg-op'), '.fg-op-isi'); return; }
    if (fp) { toggle(state.bukaFp, fp.dataset.toggleFp, fp.closest('.fg-fp'), '.fg-fp-isi'); return; }
    if (so) toggle(state.bukaSo, so.dataset.toggleSo, so.closest('.fg-so'), '.fg-so-isi');
  });

  muat();
});