const $ = id => document.getElementById(id);
const LABEL_PERAN = { ADMIN: 'Admin', FINANCE: 'Finance' };
const KELAS_PERAN = { ADMIN: 'b-blue', FINANCE: 'b-green' };
const state = { rows: [], saya: null, edit: null };

let timerToast = null;
function toast(t) {
  const el = $('toast');
  el.textContent = t;
  el.hidden = false;
  clearTimeout(timerToast);
  timerToast = setTimeout(() => { el.hidden = true; }, 2600);
}

function tampilPesan(t) {
  $('pesan').textContent = t;
  $('pesan').hidden = !t;
}

function waktu(v) {
  if (!ada(v)) return '<span class="muted">Belum pernah</span>';
  return `${tanggal(v)}, ${esc(String(v).slice(11, 16))}`;
}

async function muat() {
  $('tbl-user').innerHTML = '<tbody><tr><td class="loading">Memuat pengguna…</td></tr></tbody>';
  try {
    const data = await ambilJson('/api/pengguna');
    state.rows = data.rows;
    state.saya = data.saya;
    tampilPesan('');
    render();
  } catch (e) {
    $('tbl-user').innerHTML = '';
    tampilPesan(e.message);
  }
}

function render() {
  const rows = state.rows;
  const aktif = rows.filter(r => r.is_active).length;
  $('judul-tabel').textContent = `Daftar pengguna · ${aktif} aktif dari ${rows.length}`;
  if (!rows.length) {
    $('tbl-user').innerHTML = '<tbody><tr><td class="loading">Belum ada pengguna.</td></tr></tbody>';
    return;
  }
  const body = rows.map(r => {
    const saya = r.id === state.saya;
    const status = [];
    status.push(r.is_active ? '<span class="badge b-green">Aktif</span>' : '<span class="badge b-gray">Nonaktif</span>');
    if (r.dikunci) status.push('<span class="badge b-red">Terkunci sementara</span>');
    if (r.is_active && r.harus_ganti) status.push('<span class="badge b-amber">Password sementara</span>');
    return `
      <tr class="${r.is_active ? '' : 'redup'}" data-id="${r.id}">
        <td><b>${esc(r.nama)}</b>${saya ? ' <span class="muted small">(Anda)</span>' : ''}<span class="sub-sel">Dibuat ${tanggal(r.created_at)}${r.created_by ? ` oleh ${esc(r.created_by)}` : ''}</span></td>
        <td>${esc(r.username)}</td>
        <td><span class="badge ${KELAS_PERAN[r.peran] || 'b-gray'}">${esc(LABEL_PERAN[r.peran] || r.peran)}</span></td>
        <td>${status.join(' ')}</td>
        <td>${waktu(r.last_login_at)}</td>
        <td class="aksi-sel">
          <button class="btn-sm" data-aksi="ubah">Ubah</button>
          ${saya ? '' : '<button class="btn-sm" data-aksi="reset">Reset password</button>'}
          ${saya ? '' : `<button class="btn-sm" data-aksi="status">${r.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button>`}
        </td>
      </tr>`;
  }).join('');
  $('tbl-user').innerHTML = `
    <thead><tr>
      <th>Nama</th><th>Username</th><th>Peran</th><th>Status</th><th>Login terakhir</th><th></th>
    </tr></thead>
    <tbody>${body}</tbody>`;
}

function bukaModal(id) {
  $(id).hidden = false;
  const fokus = $(id).querySelector('input:not([hidden]):not([disabled]), button.btn-utama');
  if (fokus) fokus.focus();
}

function tutupModal(el) {
  el.closest('.modal').hidden = true;
}

function errorForm(t) {
  const el = $('f-error');
  el.querySelector('span').textContent = t || '';
  el.hidden = !t;
}

function bukaForm(r) {
  state.edit = r || null;
  errorForm('');
  $('m-form-judul').textContent = r ? 'Ubah pengguna' : 'Tambah pengguna';
  $('f-nama').value = r ? r.nama : '';
  $('f-username').value = r ? r.username : '';
  $('f-username').disabled = Boolean(r);
  $('f-username-info').hidden = Boolean(r);
  $('f-peran').value = r ? r.peran : 'FINANCE';
  const saya = r && r.id === state.saya;
  $('f-peran').disabled = Boolean(saya);
  $('f-aktif-wrap').hidden = !r || saya;
  $('f-aktif').checked = r ? Boolean(r.is_active) : true;
  $('f-catatan').hidden = Boolean(r);
  $('f-simpan').textContent = r ? 'Simpan perubahan' : 'Tambah pengguna';
  bukaModal('m-form');
}

function tampilPassword(hasil) {
  $('p-username').textContent = hasil.username;
  $('p-password').textContent = hasil.password_sementara;
  bukaModal('m-password');
}

async function simpanForm(e) {
  e.preventDefault();
  const tombol = $('f-simpan');
  const nama = $('f-nama').value.trim();
  const username = $('f-username').value.trim().toLowerCase();
  if (nama.length < 2) { errorForm('Nama minimal 2 karakter.'); $('f-nama').focus(); return; }
  if (!state.edit && !/^[a-z0-9._-]{3,30}$/.test(username)) {
    errorForm('Username 3–30 karakter: huruf kecil, angka, titik, strip, atau garis bawah.');
    $('f-username').focus();
    return;
  }
  tombol.disabled = true;
  try {
    if (state.edit) {
      await kirimJson(`/api/pengguna/${state.edit.id}`, { nama, peran: $('f-peran').value, is_active: $('f-aktif').checked });
      $('m-form').hidden = true;
      toast('Perubahan disimpan.');
    } else {
      const hasil = await kirimJson('/api/pengguna', { nama, username, peran: $('f-peran').value });
      $('m-form').hidden = true;
      tampilPassword(hasil);
    }
    await muat();
  } catch (err) {
    errorForm(err.message);
  } finally {
    tombol.disabled = false;
  }
}

async function aksiBaris(e) {
  const b = e.target.closest('button[data-aksi]');
  if (!b) return;
  const r = state.rows.find(x => String(x.id) === b.closest('tr').dataset.id);
  if (!r) return;
  if (b.dataset.aksi === 'ubah') { bukaForm(r); return; }
  if (b.dataset.aksi === 'reset') {
    if (!confirm(`Reset password ${r.nama}? Password lama langsung tidak berlaku dan ${r.nama} otomatis keluar dari semua perangkat.`)) return;
    b.disabled = true;
    try {
      tampilPassword(await kirimJson(`/api/pengguna/${r.id}/reset`));
      await muat();
    } catch (err) {
      toast(err.message);
    } finally {
      b.disabled = false;
    }
    return;
  }
  if (b.dataset.aksi === 'status') {
    const aktifkan = !r.is_active;
    if (!aktifkan && !confirm(`Nonaktifkan ${r.nama}? Dia otomatis keluar dan tidak bisa login sampai diaktifkan lagi.`)) return;
    b.disabled = true;
    try {
      await kirimJson(`/api/pengguna/${r.id}`, { nama: r.nama, peran: r.peran, is_active: aktifkan });
      toast(`${r.nama} ${aktifkan ? 'diaktifkan' : 'dinonaktifkan'}.`);
      await muat();
    } catch (err) {
      toast(err.message);
      b.disabled = false;
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('btn-tambah').addEventListener('click', () => bukaForm(null));
  $('f-user').addEventListener('submit', simpanForm);
  $('tbl-user').addEventListener('click', aksiBaris);
  document.querySelectorAll('[data-tutup]').forEach(b => b.addEventListener('click', () => tutupModal(b)));
  document.querySelectorAll('.modal').forEach(m => m.addEventListener('click', e => { if (e.target === m && m.id !== 'm-password') m.hidden = true; }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal:not([hidden])').forEach(m => { if (m.id !== 'm-password') m.hidden = true; });
  });
  $('p-salin').addEventListener('click', async () => {
    const teksPw = $('p-password').textContent;
    try {
      await navigator.clipboard.writeText(teksPw);
      toast('Password disalin.');
    } catch (e) {
      const range = document.createRange();
      range.selectNodeContents($('p-password'));
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      toast('Tekan Ctrl+C untuk menyalin.');
    }
  });
  $('m-password').querySelectorAll('[data-tutup]').forEach(b => b.addEventListener('click', () => { $('p-password').textContent = ''; }));
  muat();
});