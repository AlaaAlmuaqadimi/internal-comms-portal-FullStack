document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  const rows = [...document.querySelectorAll('.call-row')];
  const tabs = [...document.querySelectorAll('.filter')];
  const names = { all: 'الكل', incoming: 'الواردة', outgoing: 'الصادرة', missed: 'الفائتة' };
  let active = 'all';
  let focusReturn = null;
  let selectedId = null;

  function render() {
    const term = $('call-search').value.trim().toLocaleLowerCase('ar');
    let count = 0;
    rows.forEach((row) => {
      const show = (active === 'all' || row.dataset.type === active) && row.dataset.search.toLocaleLowerCase('ar').includes(term);
      row.hidden = !show;
      if (show) count++;
    });
    $('result-count').textContent = new Intl.NumberFormat('ar-LY').format(count);
    $('empty-state').hidden = count !== 0;
  }

  function chooseFilter(value, announce = true) {
    active = value;
    tabs.forEach((tab) => {
      tab.setAttribute('aria-selected', String(tab.dataset.filter === value));
      tab.tabIndex = tab.dataset.filter === value ? 0 : -1;
    });
    render();
    if (announce) notify('تم عرض المكالمات: ' + names[value]);
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => chooseFilter(tab.dataset.filter));
    tab.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      const next = tabs[(index + (e.key === 'ArrowLeft' ? 1 : tabs.length - 1)) % tabs.length];
      next.focus();
      chooseFilter(next.dataset.filter);
    });
  });

  $('call-search').addEventListener('input', render);
  const reset = $('reset-filters');
  if (reset) {
    reset.addEventListener('click', () => {
      $('call-search').value = '';
      chooseFilter('all', false);
      $('call-search').focus();
      notify('تمت إعادة ضبط التصفية.');
    });
  }

  function closeModal() {
    $('call-modal').hidden = true;
    if (focusReturn && focusReturn.isConnected) focusReturn.focus();
  }

  document.querySelectorAll('.call-button').forEach((button) =>
    button.addEventListener('click', () => {
      focusReturn = button;
      selectedId = button.dataset.contact;
      $('selected-person').textContent = button.dataset.person;
      $('call-modal').hidden = false;
      $('cancel-call').focus();
    })
  );
  $('cancel-call').addEventListener('click', closeModal);
  $('start-call').addEventListener('click', () => {
    if (selectedId) window.location.href = `/call/active?contact=${encodeURIComponent(selectedId)}`;
  });
  $('call-modal').addEventListener('click', (e) => {
    if (e.target === $('call-modal')) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if ($('call-modal').hidden) return;
    if (e.key === 'Escape') return closeModal();
    if (e.key !== 'Tab') return;
    const controls = [$('start-call'), $('cancel-call')];
    if (e.shiftKey && document.activeElement === controls[0]) { e.preventDefault(); controls[1].focus(); }
    else if (!e.shiftKey && document.activeElement === controls[1]) { e.preventDefault(); controls[0].focus(); }
  });

  chooseFilter('all', false);
});
