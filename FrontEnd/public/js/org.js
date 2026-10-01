document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.edit-toggle').forEach((btn) =>
    btn.addEventListener('click', () => {
      const target = document.getElementById(btn.dataset.target);
      if (target) target.hidden = !target.hidden;
    })
  );
  document.querySelectorAll('.delete-unit').forEach((btn) =>
    btn.addEventListener('click', (e) => {
      if (!window.confirm('هل تريد حذف هذه الوحدة؟ هذا الإجراء لا يمكن التراجع عنه.')) e.preventDefault();
    })
  );
});
