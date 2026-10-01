// Shared by the register form and the settings page: select-all/none, text search,
// relation filter chips, a unit dropdown, and (on the register form) reloading the
// allowed accounts + kitchen options when the chosen position changes.
document.addEventListener('DOMContentLoaded', () => {
  const list = document.getElementById('contact-list');
  if (!list) return;
  const counter = document.getElementById('selected-count');
  const search = document.getElementById('contact-search');
  const unit = document.getElementById('unit');
  let activeRelation = 'all';

  const boxes = () => [...list.querySelectorAll('input[type="checkbox"]')];
  const options = () => [...list.querySelectorAll('.contact-option')];
  const sections = () => [...list.querySelectorAll('section[data-relation]')];
  const unitSelect = () => list.querySelector('#unit-filter');

  function updateCounter() {
    if (counter) counter.textContent = boxes().filter((b) => b.checked).length;
  }

  function applyFilters() {
    const term = (search.value || '').trim().toLocaleLowerCase('ar');
    const unitTerm = unitSelect() ? unitSelect().value : '';
    options().forEach((o) => {
      const matchesTerm = !term || o.dataset.search.toLocaleLowerCase('ar').includes(term);
      const matchesUnit = !unitTerm || o.dataset.unit === unitTerm;
      const matchesRelation = activeRelation === 'all' || o.closest('section[data-relation]').dataset.relation === activeRelation;
      o.hidden = !(matchesTerm && matchesUnit && matchesRelation);
    });
    sections().forEach((s) => {
      const visible = activeRelation === 'all' || s.dataset.relation === activeRelation;
      s.hidden = !visible || [...s.querySelectorAll('.contact-option')].every((o) => o.hidden);
    });
  }

  function rebuildUnitFilter() {
    const sel = unitSelect();
    if (!sel) return;
    const current = sel.value;
    const units = [...new Set(options().map((o) => o.dataset.unit).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ar'));
    sel.innerHTML = '<option value="">كل الوحدات</option>' + units.map((u) => `<option value="${u.replace(/"/g, '&quot;')}">${u}</option>`).join('');
    if (units.includes(current)) sel.value = current;
  }

  function wireFilterChips() {
    list.querySelectorAll('.relation-filter').forEach((btn) => {
      btn.addEventListener('click', () => {
        activeRelation = btn.dataset.relation;
        list.querySelectorAll('.relation-filter').forEach((b) => b.classList.toggle('active', b === btn));
        applyFilters();
      });
    });
    const first = list.querySelector('.relation-filter[data-relation="all"]');
    if (first) first.classList.add('active');
    const sel = unitSelect();
    if (sel) sel.addEventListener('change', applyFilters);
  }

  function refreshUi() {
    activeRelation = 'all';
    rebuildUnitFilter();
    wireFilterChips();
    applyFilters();
    updateCounter();
    if (window.lucide) lucide.createIcons();
  }

  list.addEventListener('change', (e) => {
    if (e.target.matches('input[type="checkbox"]')) updateCounter();
  });
  const selectAll = document.getElementById('select-all');
  const selectNone = document.getElementById('select-none');
  if (selectAll) selectAll.addEventListener('click', () => {
    boxes().forEach((b) => { if (!b.closest('.contact-option').hidden) b.checked = true; });
    updateCounter();
  });
  if (selectNone) selectNone.addEventListener('click', () => {
    boxes().forEach((b) => (b.checked = false));
    updateCounter();
  });
  search.addEventListener('input', applyFilters);

  if (unit) {
    unit.addEventListener('change', async () => {
      try {
        const res = await fetch(`/register/candidates?unit=${encodeURIComponent(unit.value)}`);
        if (!res.ok) throw new Error(res.status);
        list.innerHTML = await res.text(); // server-rendered, already HTML-escaped
        search.value = '';
        refreshUi();
      } catch (e) {
        notify('تعذّر تحميل الحسابات المتاحة. حاول مرة أخرى.');
      }
    });
  }
  refreshUi();
});
