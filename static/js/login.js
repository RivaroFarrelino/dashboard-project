(() => {
  const form = document.getElementById('form-login');
  const user = document.getElementById('username');
  const pass = document.getElementById('password');
  const mata = document.getElementById('lihat-password');
  const caps = document.getElementById('info-capslock');
  const tombol = document.getElementById('tombol-masuk');

  mata.addEventListener('click', () => {
    const lihat = pass.type === 'password';
    pass.type = lihat ? 'text' : 'password';
    mata.setAttribute('aria-pressed', String(lihat));
    mata.setAttribute('aria-label', lihat ? 'Sembunyikan password' : 'Tampilkan password');
    mata.querySelector('.ikon-buka').toggleAttribute('hidden', lihat);
    mata.querySelector('.ikon-tutup').toggleAttribute('hidden', !lihat);
    pass.focus();
  });

  const cekCaps = e => {
    if (typeof e.getModifierState === 'function') caps.hidden = !e.getModifierState('CapsLock');
  };
  pass.addEventListener('keydown', cekCaps);
  pass.addEventListener('keyup', cekCaps);
  pass.addEventListener('blur', () => { caps.hidden = true; });

  form.addEventListener('submit', e => {
    user.value = user.value.trim();
    const kosong = !user.value ? user : (!pass.value ? pass : null);
    if (kosong) {
      e.preventDefault();
      kosong.closest('.field').classList.add('salah');
      kosong.focus();
      return;
    }
    if (tombol.disabled) {
      e.preventDefault();
      return;
    }
    tombol.disabled = true;
    tombol.classList.add('proses');
    tombol.querySelector('.label').textContent = 'Memeriksa…';
  });

  [user, pass].forEach(el => el.addEventListener('input', () => el.closest('.field').classList.remove('salah')));

  window.addEventListener('pageshow', e => {
    if (e.persisted) {
      tombol.disabled = false;
      tombol.classList.remove('proses');
      tombol.querySelector('.label').textContent = 'Masuk';
      pass.value = '';
    }
  });
})();
