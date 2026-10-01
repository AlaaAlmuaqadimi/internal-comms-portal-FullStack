document.addEventListener('DOMContentLoaded', () => {
  const backdrop = document.getElementById('dialog-backdrop');
  const closeButton = document.getElementById('dialog-close');
  let opener = null;

  function closeDialog() {
    backdrop.hidden = true;
    backdrop.classList.add('hidden');
    document.querySelectorAll('.detail').forEach((detail) => {
      detail.hidden = true;
    });
    document.body.style.overflow = '';
    if (opener) opener.focus();
  }

  document.querySelectorAll('.notice').forEach((card) => {
    card.addEventListener('click', () => {
      opener = card;
      document.querySelectorAll('.detail').forEach((detail) => {
        detail.hidden = detail.dataset.detail !== card.dataset.index;
      });
      const wasUnread = card.classList.contains('unread');
      card.classList.remove('unread');
      backdrop.hidden = false;
      backdrop.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      closeButton.focus();
      notify(wasUnread ? 'تم فتح الإشعار وتحديده كمقروء.' : 'تم فتح تفاصيل الإشعار.');
    });
  });

  closeButton.addEventListener('click', closeDialog);
  backdrop.addEventListener('click', (event) => {
    if (event.target === backdrop) closeDialog();
  });
  document.addEventListener('keydown', (event) => {
    if (backdrop.hidden) return;
    if (event.key === 'Escape') closeDialog();
    if (event.key === 'Tab') {
      const focusable = [closeButton];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
  });
});
