const fmtAngka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });
const fmtQty = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
const fmtPersen = new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const fmtTanggal = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
const NAMA_BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const STRIP = '–';

const ada = v => v !== null && v !== undefined && v !== '';

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const teks = v => ada(v) ? esc(v) : STRIP;

const angka = v => {
  if (!ada(v)) return STRIP;
  const n = Number(v);
  const s = fmtAngka.format(n);
  return n < 0 ? `<span class="neg">${s}</span>` : s;
};

const qty = v => ada(v) ? fmtQty.format(Number(v)) : STRIP;

const persen = v => ada(v) ? `${fmtPersen.format(Number(v))}%` : STRIP;

const persenKomisi = v => ada(v) ? `${fmtPersen.format(Number(v) * 100)}%` : STRIP;

const ringkas = v => {
  if (!ada(v)) return STRIP;
  const n = Number(v);
  const a = Math.abs(n);
  if (a >= 1e9) return `Rp ${fmtPersen.format(n / 1e9)} M`;
  if (a >= 1e6) return `Rp ${fmtPersen.format(n / 1e6)} jt`;
  return `Rp ${fmtAngka.format(n)}`;
};

const tanggal = v => {
  if (!ada(v)) return STRIP;
  const d = new Date(String(v).slice(0, 10) + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? esc(v) : fmtTanggal.format(d);
};

const bulan = v => {
  if (!ada(v)) return STRIP;
  const [y, m] = String(v).split('-');
  return `${NAMA_BULAN[Number(m) - 1] || m} ${y}`;
};

const barPersen = v => {
  if (!ada(v)) return STRIP;
  const n = Math.max(0, Math.min(100, Number(v)));
  return `<div class="pct-cell"><div class="bar ${n >= 100 ? 'full' : ''}"><span style="width:${n}%"></span></div><span class="v">${persen(v)}</span></div>`;
};

const CSRF = (document.querySelector('meta[name="csrf-token"]') || {}).content || '';

function keLogin() {
  const tujuan = location.pathname + location.search;
  location.href = `/login?next=${encodeURIComponent(tujuan)}`;
}

async function mintaJson(url, opsi, pesanPutus, pesanGagal) {
  let res;
  try {
    res = await fetch(url, opsi);
  } catch (e) {
    throw new Error(pesanPutus);
  }
  let data = null;
  try {
    data = await res.json();
  } catch (e) {
    data = null;
  }
  if (res.status === 401) {
    keLogin();
    throw new Error((data && data.pesan) || 'Sesi berakhir. Silakan login lagi.');
  }
  if (!res.ok) throw new Error((data && data.pesan) || pesanGagal);
  return data;
}

function ambilJson(url) {
  return mintaJson(url, { headers: { Accept: 'application/json' } },
    'Koneksi ke server terputus. Periksa internet lalu coba lagi.',
    'Data belum bisa dimuat. Coba lagi beberapa saat lagi.');
}

function kirimJson(url, body) {
  return mintaJson(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-CSRF-Token': CSRF },
    body: JSON.stringify(body || {})
  }, 'Koneksi ke server terputus. Perubahan belum tersimpan.', 'Perubahan belum tersimpan. Coba lagi.');
}

(async () => {
  const el = document.getElementById('sync-info');
  if (!el) return;
  try {
    const info = await ambilJson('/api/info');
    const t = info.sync_terakhir;
    el.textContent = t ? `Data BC per ${tanggal(t)}, ${t.slice(11, 16)} WIB` : 'Belum ada sync';
  } catch (e) {
    el.textContent = '';
  }
})();