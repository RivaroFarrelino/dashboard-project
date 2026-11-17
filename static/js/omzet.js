const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const state = { bulan: [], dari: '', sampai: '', sales: '', rows: [], sales_list: [], satuBulan: false, noMuat: 0, noSeri: 0 };

function tampilPesan(t) {
  $('pesan').textContent = t;
  $('pesan').hidden = !t;
}

const bulanPanjang = v => {
  const [y, m] = v.split('-');
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });
};

const bulanSebelum = v => {
  const [y, m] = v.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

const deretBulan = (akhir, n) => {
  const out = [akhir];
  while (out.length < n) out.unshift(bulanSebelum(out[0]));
  return out;
};

const isoTgl = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const akhirBulan = b => { const [y, m] = b.split('-').map(Number); return isoTgl(new Date(y, m, 0)); };
const rentangBulan = b => [`${b}-01`, akhirBulan(b)];
const validTgl = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());

function rentangCepat(kode) {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  if (kode === 'bulan-ini') return [isoTgl(new Date(y, m, 1)), isoTgl(new Date(y, m + 1, 0))];
  if (kode === 'bulan-lalu') return [isoTgl(new Date(y, m - 1, 1)), isoTgl(new Date(y, m, 0))];
  if (kode === 'ytd') return [`${y}-01-01`, isoTgl(now)];
  if (kode === 'tahun-lalu') return [`${y - 1}-01-01`, `${y - 1}-12-31`];
  return null;
}

function bulanTunggal() {
  const { dari, sampai } = state;
  const b = dari.slice(0, 7);
  return dari === `${b}-01` && sampai === akhirBulan(b) ? b : null;
}

function labelPeriode() {
  const b = bulanTunggal();
  if (b) return bulan(b);
  return `${tanggal(state.dari)} – ${tanggal(state.sampai)}`;
}

function isiKontrol() {
  $('f-dari').value = state.dari;
  $('f-sampai').value = state.sampai;
  const sales = $('f-sales');
  if (state.sales && ![...sales.options].some(o => o.value === state.sales)) sales.add(new Option(state.sales, state.sales));
  sales.value = state.sales;
  sales.classList.toggle('ada', Boolean(state.sales));
  document.querySelectorAll('#cepat .chip-f').forEach(c => {
    const r = rentangCepat(c.dataset.v);
    const aktif = r && r[0] === state.dari && r[1] === state.sampai;
    c.classList.toggle('aktif', aktif);
    c.setAttribute('aria-pressed', aktif);
  });
}

function simpanUrl() {
  const p = new URLSearchParams({ dari: state.dari, sampai: state.sampai });
  if (state.sales) p.set('sales', state.sales);
  history.replaceState(null, '', `/omzet?${p}`);
}

async function muatSeri() {
  const no = ++state.noSeri;
  const qs = state.sales ? `?sales=${encodeURIComponent(state.sales)}` : '';
  const data = await ambilJson(`/api/omzet/bulan${qs}`);
  if (no === state.noSeri) state.bulan = data;
}

async function init() {
  const p = new URLSearchParams(location.search);
  state.sales = (p.get('sales') || '').trim();
  try {
    await muatSeri();
  } catch (e) {
    tampilPesan(e.message);
    return;
  }
  const bulanUrl = p.get('bulan');
  if (validTgl(p.get('dari')) && validTgl(p.get('sampai'))) {
    state.dari = p.get('dari');
    state.sampai = p.get('sampai');
  } else if (/^\d{4}-\d{2}$/.test(bulanUrl || '')) {
    [state.dari, state.sampai] = rentangBulan(bulanUrl);
  } else {
    const terakhir = state.bulan.length ? state.bulan[state.bulan.length - 1].bulan : isoTgl(new Date()).slice(0, 7);
    [state.dari, state.sampai] = rentangBulan(terakhir);
  }
  ambilJson('/api/projects/opsi').then(o => {
    const sel = $('f-sales');
    o.sales.forEach(v => { if (![...sel.options].some(x => x.value === v)) sel.add(new Option(v, v)); });
    sel.value = state.sales;
  }).catch(() => {});
  muat();
}

function setRentang(dari, sampai) {
  if (dari > sampai) [dari, sampai] = [sampai, dari];
  state.dari = dari;
  state.sampai = sampai;
  muat();
}

async function muat(seriBaru = false) {
  const no = ++state.noMuat;
  isiKontrol();
  simpanUrl();
  tampilPesan('');
  $('tbl-omzet').classList.add('memuat');
  if (!state.rows.length) $('tbl-omzet').innerHTML = '<tbody><tr><td class="loading">Memuat data omzet…</td></tr></tbody>';
  $('list-sales').classList.add('memuat');
  try {
    if (seriBaru) await muatSeri();
    if (no !== state.noMuat) return;
    renderKpiDasar();
    renderChart();
    const p = new URLSearchParams({ dari: state.dari, sampai: state.sampai });
    if (state.sales) p.set('sales', state.sales);
    const data = await ambilJson(`/api/omzet?${p}`);
    if (no !== state.noMuat) return;
    state.rows = data.rows;
    state.sales_list = data.sales;
    state.satuBulan = data.satu_bulan;
    renderKpiDetail();
    renderSales();
    renderTabel();
  } catch (e) {
    if (no !== state.noMuat) return;
    tampilPesan(e.message);
    state.rows = [];
    $('tbl-omzet').innerHTML = '';
    $('list-sales').innerHTML = '';
  } finally {
    if (no === state.noMuat) {
      $('tbl-omzet').classList.remove('memuat');
      $('list-sales').classList.remove('memuat');
    }
  }
}

const nilaiBulan = b => {
  const r = state.bulan.find(x => x.bulan === b);
  return r ? Number(r.omzet) : 0;
};

function renderKpiDasar() {
  const b = bulanTunggal();
  const bAkhir = state.sampai.slice(0, 7);
  $('k-label').textContent = b ? 'Omzet bulan' : 'Omzet periode';
  if (b) {
    const ini = nilaiBulan(b);
    const lalu = nilaiBulan(bulanSebelum(b));
    const sekarang = new Date();
    const berjalan = b === `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}`;
    if (berjalan) {
      $('k-delta').textContent = `Bulan berjalan · ${bulan(bulanSebelum(b))}: ${ringkas(lalu)}`;
    } else if (lalu) {
      const d = (ini - lalu) / Math.abs(lalu) * 100;
      $('k-delta').innerHTML = `<span class="${d < 0 ? 'turun' : 'naik'}">${d < 0 ? '▼' : '▲'} ${fmtPersen.format(Math.abs(d))}%</span> vs ${bulan(bulanSebelum(b))}`;
    } else {
      $('k-delta').textContent = `Tidak ada omzet di ${bulan(bulanSebelum(b))}`;
    }
  } else {
    $('k-delta').textContent = labelPeriode();
  }
  const tahun = bAkhir.slice(0, 4);
  const ytd = state.bulan.filter(x => x.bulan.startsWith(tahun) && x.bulan <= bAkhir).reduce((a, x) => a + Number(x.omzet), 0);
  $('k-ytd').innerHTML = ringkas(ytd);
  $('k-ytd').title = fmtAngka.format(ytd);
  $('k-ytd-sub').textContent = `Jan – ${bulan(bAkhir)}`;
}

function renderKpiDetail() {
  const ev = state.rows.flatMap(r => r.omzet.filter(o => o.masuk));
  const total = ev.reduce((a, o) => a + Number(o.nilai), 0);
  $('k-omzet').innerHTML = ringkas(total);
  $('k-omzet').title = fmtAngka.format(total);
  const baru = ev.filter(o => Number(o.ke) === 1).length;
  $('k-jml').textContent = fmtAngka.format(ev.length);
  $('k-jml-sub').textContent = `${baru} omzet baru · ${ev.length - baru} perubahan kontrak · ${state.rows.length} SO`;
  $('k-rata').innerHTML = ev.length ? ringkas(total / ev.length) : STRIP;
  const list = state.sales_list;
  $('k-sales').textContent = fmtAngka.format(list.length);
  if (state.satuBulan) {
    const adaGrup = list.filter(s => s.grup);
    const capai = adaGrup.filter(s => Number(s.omzet) >= Number(s.batas_omzet)).length;
    $('k-sales-sub').textContent = `${capai} dari ${adaGrup.length} sales bergrup capai batas`;
  } else {
    $('k-sales-sub').textContent = labelPeriode();
  }
}

function renderChart() {
  const el = $('chart-bulan');
  const bDari = state.dari.slice(0, 7), bSampai = state.sampai.slice(0, 7);
  const seri = deretBulan(bSampai, 12).map(b => ({ bulan: b, nilai: nilaiBulan(b) }));
  const W = 640, H = 240, padL = 52, padR = 8, padT = 12, padB = 28;
  const maks = Math.max(...seri.map(s => s.nilai), 1);
  const min = Math.min(...seri.map(s => s.nilai), 0);
  const skala = v => padT + (maks - v) / (maks - min) * (H - padT - padB);
  const y0 = skala(0);
  const lebarSlot = (W - padL - padR) / seri.length;
  const lebarBar = Math.min(28, lebarSlot - 6);
  const langkah = maks / 4;
  let grid = '';
  for (let i = 0; i <= 4; i++) {
    const v = langkah * i;
    const y = skala(v);
    grid += `<line x1="${padL}" x2="${W - padR}" y1="${y}" y2="${y}" class="grid"/>`;
    grid += `<text x="${padL - 8}" y="${y + 4}" class="axis" text-anchor="end">${ringkas(v).replace('Rp ', '')}</text>`;
  }
  const bars = seri.map((s, i) => {
    const x = padL + i * lebarSlot + (lebarSlot - lebarBar) / 2;
    const y = Math.min(skala(s.nilai), y0);
    const h = Math.max(Math.abs(skala(s.nilai) - y0), s.nilai ? 2 : 0);
    const r = Math.min(4, lebarBar / 2, h);
    const atas = s.nilai >= 0;
    const path = atas
      ? `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + lebarBar - r} Q${x + lebarBar},${y} ${x + lebarBar},${y + r} V${y + h} Z`
      : `M${x},${y} V${y + h - r} Q${x},${y + h} ${x + r},${y + h} H${x + lebarBar - r} Q${x + lebarBar},${y + h} ${x + lebarBar},${y + h - r} V${y} Z`;
    const aktif = s.bulan >= bDari && s.bulan <= bSampai;
    const [th, bl] = s.bulan.split('-');
    const label = `${NAMA_BULAN[Number(bl) - 1]}${bl === '01' || i === 0 ? ` ’${th.slice(2)}` : ''}`;
    return `<g class="bar-g ${aktif ? 'aktif' : ''}" data-bulan="${s.bulan}" data-nilai="${s.nilai}">
      <rect x="${padL + i * lebarSlot}" y="${padT}" width="${lebarSlot}" height="${H - padT - padB}" class="hit"/>
      ${s.nilai ? `<path d="${path}" class="bar ${s.nilai < 0 ? 'neg' : ''}"/>` : ''}
      <text x="${x + lebarBar / 2}" y="${H - 8}" class="axis ${aktif ? 'tebal' : ''}" text-anchor="middle">${label}</text>
    </g>`;
  }).join('');
  el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik omzet 12 bulan">${grid}<line x1="${padL}" x2="${W - padR}" y1="${y0}" y2="${y0}" class="base"/>${bars}</svg><div class="tip" hidden></div>`;
  const tip = el.querySelector('.tip');
  el.querySelectorAll('.bar-g').forEach(g => {
    g.addEventListener('mousemove', e => {
      const box = el.getBoundingClientRect();
      tip.innerHTML = `<b>${bulanPanjang(g.dataset.bulan)}</b><br>${fmtAngka.format(Number(g.dataset.nilai))}`;
      tip.hidden = false;
      const x = Math.min(e.clientX - box.left + 12, box.width - tip.offsetWidth - 4);
      tip.style.left = `${x}px`;
      tip.style.top = `${e.clientY - box.top - 44}px`;
    });
    g.addEventListener('mouseleave', () => { tip.hidden = true; });
    g.addEventListener('click', () => {
      const [d, s2] = rentangBulan(g.dataset.bulan);
      setRentang(d, s2);
    });
  });
}

function renderSales() {
  const list = state.sales_list;
  $('judul-sales').textContent = state.satuBulan ? 'Omzet per sales' : `Omzet per sales · ${labelPeriode()}`;
  $('info-sales').hidden = !state.satuBulan;
  if (!list.length) {
    $('list-sales').innerHTML = '<div class="loading">Tidak ada omzet di periode ini.</div>';
    return;
  }
  const maks = Math.max(...list.map(s => Math.max(Number(s.omzet), state.satuBulan ? Number(s.batas_omzet || 0) : 0)), 1);
  $('list-sales').innerHTML = list.map(s => {
    const omzet = Number(s.omzet);
    const batas = Number(s.batas_omzet || 0);
    const lebar = Math.max(0, omzet) / maks * 100;
    const posBatas = batas / maks * 100;
    const capai = state.satuBulan && s.grup && omzet >= batas;
    const info = !state.satuBulan ? '' : s.grup
      ? `${esc(s.grup)} · batas ${ringkas(batas)} · ${capai ? '<span class="badge b-green">Tier atas</span>' : `${fmtPersen.format(batas ? omzet / batas * 100 : 0)}%`}`
      : '<span class="muted">Tanpa grup komisi</span>';
    return `
      <div class="sales-row">
        <div class="sales-top"><b>${teks(s.sales)}</b><span class="num">${angka(omzet)}</span></div>
        <div class="sales-bar">
          <span class="isi ${capai ? 'capai' : ''}" style="width:${lebar}%"></span>
          ${state.satuBulan && s.grup ? `<span class="batas" style="left:${posBatas}%"></span>` : ''}
        </div>
        <div class="small muted">${info ? `${info} · ` : ''}${s.jml} omzet</div>
      </div>`;
  }).join('');
}

function barisCocok(r, q) {
  if (!q) return true;
  return [r.so_no, r.customer, r.project_code, r.project_name, r.sales, r.arsitek, r.kontraktor, r.pmsm]
    .some(v => String(v ?? '').toLowerCase().includes(q));
}

const jumlahKolomOmzet = rows => Math.max(1, ...rows.map(r => r.omzet.length));

function selOmzet(o) {
  if (!o) return `<td class="num muted">${STRIP}</td>`;
  const ini = o.masuk;
  return `<td class="num omzet-sel ${ini ? 'ini' : 'lain'}">
    <div>${angka(o.nilai)}</div><div class="small">${Number(o.ke) === 1 ? tanggal(o.tanggal) : bulan(o.bulan)}</div></td>`;
}

function renderTabel() {
  const q = $('cari-omzet').value.trim().toLowerCase();
  const rows = state.rows.filter(r => barisCocok(r, q));
  const total = rows.reduce((a, r) => a + Number(r.omzet_periode), 0);
  $('judul-tabel').textContent = `Daftar omzet ${labelPeriode()} · ${rows.length} SO`;
  if (!rows.length) {
    $('tbl-omzet').innerHTML = `<tbody><tr><td class="loading">${state.rows.length ? 'Tidak ada yang cocok dengan pencarian.' : 'Tidak ada omzet di periode ini.'}</td></tr></tbody>`;
    return;
  }
  const n = jumlahKolomOmzet(rows);
  const headOmzet = Array.from({ length: n }, (_, i) => `<th class="num">Omzet ${i + 1}</th>`).join('');
  const body = rows.map(r => `
    <tr>
      <td class="beku"><b>${esc(r.so_no)}</b></td>
      <td class="beku beku-teks" title="${esc(r.customer || '')}">${teks(r.customer)}</td>
      <td class="beku">${r.project_code ? `<a href="/project?kode=${encodeURIComponent(r.project_code)}">${esc(r.project_code)}</a>` : STRIP}</td>
      <td class="beku beku-akhir beku-teks" title="${esc(r.project_name || '')}">${teks(r.project_name)}</td>
      <td class="num">${angka(r.kontrak)}</td>
      ${Array.from({ length: n }, (_, i) => selOmzet(r.omzet[i])).join('')}
      <td class="num sep"><b>${angka(r.omzet_periode)}</b></td>
      <td>${teks(r.sales)}</td>
      <td>${teks(r.arsitek)}</td>
      <td>${teks(r.kontraktor)}</td>
      <td>${teks(r.pmsm)}</td>
    </tr>`).join('');
  $('tbl-omzet').innerHTML = `
    <thead><tr>
      <th class="beku">No SO</th><th class="beku">Customer</th><th class="beku">Kode Project</th><th class="beku beku-akhir">Nama Project</th><th class="num">Kontrak</th>
      ${headOmzet}<th class="num sep">Omzet ${esc(labelPeriode())}</th><th>Sales</th><th>Arsitek</th><th>Kontraktor</th><th>PMSM</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td class="beku beku-akhir" colspan="4"><b>Total</b></td><td></td><td colspan="${n}"></td><td class="num sep"><b>${angka(total)}</b></td><td colspan="4"></td></tr></tfoot>`;
  bekukanKolom();
}

function bekukanKolom() {
  const tbl = $('tbl-omzet');
  const head = [...tbl.querySelectorAll('thead th.beku')];
  if (!head.length) return;
  let kiri = 0;
  const posisi = head.map(th => { const x = kiri; kiri += th.getBoundingClientRect().width; return x; });
  tbl.querySelectorAll('tr').forEach(tr => {
    tr.querySelectorAll('.beku').forEach((sel, i) => { sel.style.left = `${posisi[i] ?? 0}px`; });
  });
}

function unduhCsv() {
  const q = $('cari-omzet').value.trim().toLowerCase();
  const rows = state.rows.filter(r => barisCocok(r, q));
  const n = jumlahKolomOmzet(rows);
  const kolom = [
    ['No SO', r => r.so_no], ['Customer', r => r.customer], ['Kode Project', r => r.project_code],
    ['Nama Project', r => r.project_name], ['Kontrak', r => r.kontrak]
  ];
  for (let i = 0; i < n; i++) {
    kolom.push([`Omzet ${i + 1}`, r => r.omzet[i] ? r.omzet[i].nilai : '']);
    kolom.push([`Bulan Omzet ${i + 1}`, r => r.omzet[i] ? r.omzet[i].bulan : '']);
  }
  kolom.push([`Omzet ${state.dari} sd ${state.sampai}`, r => r.omzet_periode], ['Sales', r => r.sales], ['Arsitek', r => r.arsitek],
    ['Kontraktor', r => r.kontraktor], ['PMSM', r => r.pmsm]);
  const sel = v => {
    let s = String(v ?? '');
    if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [kolom.map(k => k[0]).join(';'), ...rows.map(r => kolom.map(k => sel(k[1](r))).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `omzet-astral-${state.dari}_${state.sampai}${state.sales ? `-${state.sales.replace(/[^A-Za-z0-9]+/g, '_')}` : ''}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.addEventListener('DOMContentLoaded', () => {
  window.addEventListener('resize', bekukanKolom);
  let t = null;
  $('cari-omzet').addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderTabel, 150); });
  $('unduh-csv').addEventListener('click', unduhCsv);
  $('cepat').addEventListener('click', e => {
    const c = e.target.closest('.chip-f');
    if (!c) return;
    const r = rentangCepat(c.dataset.v);
    if (r) setRentang(r[0], r[1]);
  });
  ['f-dari', 'f-sampai'].forEach(id => $(id).addEventListener('change', () => {
    const d = $('f-dari').value, s2 = $('f-sampai').value;
    if (validTgl(d) && validTgl(s2)) setRentang(d, s2);
    else isiKontrol();
  }));
  $('f-sales').addEventListener('change', e => {
    state.sales = e.target.value;
    muat(true);
  });
  init();
});