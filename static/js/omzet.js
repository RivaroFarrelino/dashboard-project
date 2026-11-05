const $ = id => document.getElementById(id);
const SVG_NS = 'http://www.w3.org/2000/svg';
const state = { bulan: [], pilih: null, rows: [], sales: [] };

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

async function init() {
  try {
    state.bulan = await ambilJson('/api/omzet/bulan');
  } catch (e) {
    tampilPesan(e.message);
    return;
  }
  if (!state.bulan.length) {
    tampilPesan('Belum ada data omzet.');
    return;
  }
  const daftar = state.bulan.map(b => b.bulan);
  const dariUrl = new URLSearchParams(location.search).get('bulan');
  const awal = daftar.includes(dariUrl) ? dariUrl : daftar[daftar.length - 1];
  $('pilih-bulan').innerHTML = [...daftar].reverse().map(b => `<option value="${b}">${bulanPanjang(b)}</option>`).join('');
  $('pilih-bulan').addEventListener('change', e => pilihBulan(e.target.value, true));
  pilihBulan(awal, false);
}

async function pilihBulan(bulan, simpanUrl) {
  state.pilih = bulan;
  $('pilih-bulan').value = bulan;
  if (simpanUrl) history.replaceState(null, '', `/omzet?bulan=${bulan}`);
  tampilPesan('');
  renderKpiDasar();
  renderChart();
  $('tbl-omzet').innerHTML = '<tbody><tr><td class="loading">Memuat data omzet…</td></tr></tbody>';
  $('list-sales').innerHTML = '<div class="loading">Memuat…</div>';
  try {
    const data = await ambilJson(`/api/omzet?bulan=${encodeURIComponent(bulan)}`);
    if (state.pilih !== bulan) return;
    state.rows = data.rows;
    state.sales = data.sales;
    renderKpiDetail();
    renderSales();
    renderTabel();
  } catch (e) {
    tampilPesan(e.message);
    $('tbl-omzet').innerHTML = '';
    $('list-sales').innerHTML = '';
  }
}

const nilaiBulan = b => {
  const r = state.bulan.find(x => x.bulan === b);
  return r ? Number(r.omzet) : 0;
};

function renderKpiDasar() {
  const b = state.pilih;
  const ini = nilaiBulan(b);
  const lalu = nilaiBulan(bulanSebelum(b));
  $('k-omzet').innerHTML = ringkas(ini);
  $('k-omzet').title = fmtAngka.format(ini);
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
  const tahun = b.slice(0, 4);
  const ytd = state.bulan.filter(x => x.bulan.startsWith(tahun) && x.bulan <= b).reduce((a, x) => a + Number(x.omzet), 0);
  $('k-ytd').innerHTML = ringkas(ytd);
  $('k-ytd').title = fmtAngka.format(ytd);
  $('k-ytd-sub').textContent = `Jan – ${bulan(b)}`;
}

function renderKpiDetail() {
  const n = state.rows.length;
  const total = state.rows.reduce((a, r) => a + Number(r.nilai), 0);
  const so = new Set(state.rows.map(r => r.so_no)).size;
  const baru = state.rows.filter(r => Number(r.omzet_ke) === 1).length;
  $('k-jml').textContent = fmtAngka.format(n);
  $('k-jml-sub').textContent = `${baru} omzet baru · ${n - baru} perubahan kontrak · ${so} SO`;
  $('k-rata').innerHTML = n ? ringkas(total / n) : STRIP;
  const adaGrup = state.sales.filter(s => s.grup);
  const capai = adaGrup.filter(s => Number(s.omzet) >= Number(s.batas_omzet)).length;
  $('k-sales').textContent = fmtAngka.format(state.sales.length);
  $('k-sales-sub').textContent = `${capai} dari ${adaGrup.length} sales bergrup capai batas`;
}

function renderChart() {
  const el = $('chart-bulan');
  const seri = deretBulan(state.pilih, 12).map(b => ({ bulan: b, nilai: nilaiBulan(b) }));
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
    const aktif = s.bulan === state.pilih;
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
      const b = g.dataset.bulan;
      if ([...$('pilih-bulan').options].some(o => o.value === b)) pilihBulan(b, true);
    });
  });
}

function renderSales() {
  if (!state.sales.length) {
    $('list-sales').innerHTML = '<div class="loading">Tidak ada omzet di bulan ini.</div>';
    return;
  }
  const maks = Math.max(...state.sales.map(s => Math.max(Number(s.omzet), Number(s.batas_omzet || 0))), 1);
  $('list-sales').innerHTML = state.sales.map(s => {
    const omzet = Number(s.omzet);
    const batas = Number(s.batas_omzet || 0);
    const lebar = Math.max(0, omzet) / maks * 100;
    const posBatas = batas / maks * 100;
    const capai = s.grup && omzet >= batas;
    const info = s.grup
      ? `${esc(s.grup)} · batas ${ringkas(batas)} · ${capai ? '<span class="badge b-green">Tier atas</span>' : `${fmtPersen.format(batas ? omzet / batas * 100 : 0)}%`}`
      : '<span class="muted">Tanpa grup komisi</span>';
    return `
      <div class="sales-row">
        <div class="sales-top"><b>${teks(s.sales)}</b><span class="num">${angka(omzet)}</span></div>
        <div class="sales-bar">
          <span class="isi ${capai ? 'capai' : ''}" style="width:${lebar}%"></span>
          ${s.grup ? `<span class="batas" style="left:${posBatas}%"></span>` : ''}
        </div>
        <div class="small muted">${info} · ${s.jml} omzet</div>
      </div>`;
  }).join('');
}

function barisCocok(r, q) {
  if (!q) return true;
  return [r.so_no, r.customer, r.project_code, r.project_name, r.sales, r.arsitek, r.kontraktor, r.pmsm]
    .some(v => String(v ?? '').toLowerCase().includes(q));
}

function renderTabel() {
  const q = $('cari-omzet').value.trim().toLowerCase();
  const rows = state.rows.filter(r => barisCocok(r, q));
  const total = rows.reduce((a, r) => a + Number(r.nilai), 0);
  $('judul-tabel').textContent = `Daftar omzet ${bulan(state.pilih)} · ${rows.length} baris`;
  if (!rows.length) {
    $('tbl-omzet').innerHTML = `<tbody><tr><td class="loading">${state.rows.length ? 'Tidak ada yang cocok dengan pencarian.' : 'Tidak ada omzet di bulan ini.'}</td></tr></tbody>`;
    return;
  }
  const body = rows.map(r => `
    <tr>
      <td>${tanggal(r.tanggal)}</td>
      <td><b>${esc(r.so_no)}</b></td>
      <td>${Number(r.omzet_ke) === 1 ? '<span class="badge b-blue">Omzet 1</span>' : `<span class="badge b-amber">Omzet ${esc(r.omzet_ke)}</span>`}</td>
      <td>${teks(r.customer)}</td>
      <td>${r.project_code ? `<a href="/project?kode=${encodeURIComponent(r.project_code)}">${esc(r.project_code)}</a>` : STRIP}</td>
      <td class="wrap">${teks(r.project_name)}</td>
      <td class="num">${angka(r.kontrak)}</td>
      <td class="num"><b>${angka(r.nilai)}</b></td>
      <td>${teks(r.sales)}</td>
      <td>${teks(r.arsitek)}</td>
      <td>${teks(r.kontraktor)}</td>
      <td>${teks(r.pmsm)}</td>
    </tr>`).join('');
  $('tbl-omzet').innerHTML = `
    <thead><tr>
      <th>Tanggal</th><th>No SO</th><th>Jenis</th><th>Customer</th><th>Kode Project</th><th>Nama Project</th>
      <th class="num">Kontrak</th><th class="num">Omzet</th><th>Sales</th><th>Arsitek</th><th>Kontraktor</th><th>PMSM</th>
    </tr></thead>
    <tbody>${body}</tbody>
    <tfoot><tr><td colspan="7"><b>Total</b></td><td class="num"><b>${angka(total)}</b></td><td colspan="4"></td></tr></tfoot>`;
}

function unduhCsv() {
  const q = $('cari-omzet').value.trim().toLowerCase();
  const rows = state.rows.filter(r => barisCocok(r, q));
  const kolom = [
    ['Tanggal', r => r.tanggal], ['No SO', r => r.so_no], ['Omzet Ke', r => r.omzet_ke], ['Customer', r => r.customer],
    ['Kode Project', r => r.project_code], ['Nama Project', r => r.project_name], ['Kontrak', r => r.kontrak],
    ['Omzet', r => r.nilai], ['Sales', r => r.sales], ['Arsitek', r => r.arsitek], ['Kontraktor', r => r.kontraktor], ['PMSM', r => r.pmsm]
  ];
  const sel = v => {
    const s = String(v ?? '');
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const isi = [kolom.map(k => k[0]).join(';'), ...rows.map(r => kolom.map(k => sel(k[1](r))).join(';'))].join('\r\n');
  const blob = new Blob(['﻿' + isi], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `omzet-astral-${state.pilih}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

document.addEventListener('DOMContentLoaded', () => {
  let t = null;
  $('cari-omzet').addEventListener('input', () => { clearTimeout(t); t = setTimeout(renderTabel, 150); });
  $('unduh-csv').addEventListener('click', unduhCsv);
  init();
});