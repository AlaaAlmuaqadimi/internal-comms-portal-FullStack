document.addEventListener('DOMContentLoaded', () => {
  const cards = [...document.querySelectorAll('.employee')];
  const search = document.getElementById('search');
  const filters = ['department', 'section', 'status'].map((id) => document.getElementById(id));
  const count = document.getElementById('count');
  const empty = document.getElementById('empty');
  const loading = document.getElementById('loading');
  const modal = document.getElementById('modal');
  let loadTimer;
  let previousFocus;
  let selectedId = null;

  function render() {
    const query = search.value.trim().toLocaleLowerCase('ar');
    const [department, section, status] = filters.map((el) => el.value);
    let visible = 0;
    cards.forEach((card) => {
      const d = card.dataset;
      const matches =
        (!query || [d.name, d.department, d.unit].some((v) => v.toLocaleLowerCase('ar').includes(query))) &&
        (!department || d.department === department) &&
        (!section || d.section === section) &&
        (!status || d.status === status);
      card.hidden = !matches;
      if (matches) visible++;
    });
    count.textContent = String(visible);
    empty.classList.toggle('hidden', visible !== 0);
  }

  function changedWithLoading() {
    loading.classList.remove('hidden');
    render();
    clearTimeout(loadTimer);
    loadTimer = setTimeout(() => loading.classList.add('hidden'), 320);
  }

  function resetAll() {
    search.value = '';
    filters.forEach((el) => (el.value = ''));
    render();
    notify('تمت إعادة ضبط البحث والفلاتر.');
    search.focus();
  }

  search.addEventListener('input', render);
  filters.forEach((el) => el.addEventListener('change', changedWithLoading));
  document.getElementById('reset').addEventListener('click', resetAll);
  document.getElementById('empty-reset').addEventListener('click', resetAll);

  function closeModal() {
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    document.getElementById('modal-feedback').textContent = '';
    if (previousFocus) previousFocus.focus();
  }

  cards.forEach((card) =>
    card.querySelector('.contact').addEventListener('click', (event) => {
      previousFocus = event.currentTarget;
      selectedId = event.currentTarget.dataset.id;
      document.getElementById('modal-name').textContent = card.dataset.name;
      document.getElementById('modal-feedback').textContent = '';
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      document.getElementById('modal-close').focus();
    })
  );
  document.getElementById('modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener('keydown', (event) => {
    if (modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') closeModal();
    if (event.key === 'Tab') {
      const controls = [...modal.querySelectorAll('button')];
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });

  document.getElementById('call-action').addEventListener('click', () => {
    if (selectedId) window.location.href = `/call/active?contact=${encodeURIComponent(selectedId)}`;
  });
  document.getElementById('message-action').addEventListener('click', () => {
    const message = 'معاينة فقط: لم تُرسل رسالة حقيقية.';
    document.getElementById('modal-feedback').textContent = message;
    notify(message, 3500);
  });

  render();
});
