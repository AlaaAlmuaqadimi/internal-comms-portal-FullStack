document.addEventListener('DOMContentLoaded', () => {
  const $ = (id) => document.getElementById(id);
  let seconds = 0;
  let interval;
  let returnFocus = null;

  const format = (n) => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

  function startClock() {
    clearInterval(interval);
    interval = setInterval(() => {
      seconds++;
      $('timer').textContent = format(seconds);
    }, 1000);
  }

  function showView(id) {
    ['call-view', 'summary-view'].forEach((view) => {
      $(view).hidden = view !== id;
    });
  }

  function openModal(id, trigger, focusId) {
    returnFocus = trigger;
    $(id).hidden = false;
    $(id).setAttribute('aria-hidden', 'false');
    $(focusId).focus();
  }

  function closeModal(id) {
    $(id).hidden = true;
    $(id).setAttribute('aria-hidden', 'true');
    if (returnFocus && returnFocus.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus();
  }

  $('mute').addEventListener('click', () => {
    const active = $('mute').getAttribute('aria-pressed') !== 'true';
    $('mute').setAttribute('aria-pressed', String(active));
    $('mute-label').hidden = active;
    $('unmute-label').hidden = !active;
    notify(active ? 'تم تفعيل الكتم في المعاينة.' : 'تم إلغاء الكتم في المعاينة.');
  });

  $('speaker').addEventListener('click', () => {
    const active = $('speaker').getAttribute('aria-pressed') !== 'true';
    $('speaker').setAttribute('aria-pressed', String(active));
    $('speaker-label').hidden = active;
    $('speaker-on-label').hidden = !active;
    notify(active ? 'مكبر الصوت قيد التشغيل في المعاينة.' : 'مكبر الصوت متوقف في المعاينة.');
  });

  function setKeypad(open) {
    $('keypad').hidden = !open;
    $('keypad-toggle').setAttribute('aria-expanded', String(open));
    if (open) $('digits').focus();
    else $('keypad-toggle').focus();
  }

  $('keypad-toggle').addEventListener('click', () => setKeypad($('keypad').hidden));
  $('keypad-close').addEventListener('click', () => setKeypad(false));
  $('digits').addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9*#]/g, '').slice(0, 24);
  });
  document.querySelectorAll('.digit').forEach((button) =>
    button.addEventListener('click', () => {
      if ($('digits').value.length < 24) $('digits').value += button.dataset.digit;
      $('digits').focus();
    })
  );
  $('digits-clear').addEventListener('click', () => {
    $('digits').value = '';
    $('digits').focus();
    notify('تم مسح الأرقام.');
  });

  $('participant-toggle').addEventListener('click', (e) => {
    $('participant-result').textContent = '';
    openModal('participant-modal', e.currentTarget, 'participant-close');
  });
  $('participant-close').addEventListener('click', () => closeModal('participant-modal'));
  document.querySelectorAll('.person').forEach((button) =>
    button.addEventListener('click', () => {
      const message = `تم اختيار ${button.dataset.person} للمشاركة في المعاينة فقط.`;
      $('participant-result').textContent = message;
      notify(message);
    })
  );

  $('end-open').addEventListener('click', (e) => openModal('end-modal', e.currentTarget, 'end-cancel'));
  $('end-cancel').addEventListener('click', () => closeModal('end-modal'));
  $('end-confirm').addEventListener('click', () => {
    clearInterval(interval);
    $('summary-time').textContent = format(seconds);
    closeModal('end-modal');
    showView('summary-view');
    $('restart').focus();
    notify('انتهت معاينة المكالمة.');
  });

  ['participant-modal', 'end-modal'].forEach((id) =>
    $(id).addEventListener('click', (e) => {
      if (e.target === $(id)) closeModal(id);
    })
  );

  document.addEventListener('keydown', (e) => {
    const modal = ['end-modal', 'participant-modal'].map($).find((el) => !el.hidden);
    if (!modal) return;
    if (e.key === 'Escape') {
      closeModal(modal.id);
      return;
    }
    if (e.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('button:not([disabled])')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });

  $('restart').addEventListener('click', () => {
    seconds = 0;
    $('timer').textContent = '00:00';
    $('digits').value = '';
    $('keypad').hidden = true;
    $('keypad-toggle').setAttribute('aria-expanded', 'false');
    $('mute').setAttribute('aria-pressed', 'false');
    $('speaker').setAttribute('aria-pressed', 'false');
    $('mute-label').hidden = false;
    $('unmute-label').hidden = true;
    $('speaker-label').hidden = false;
    $('speaker-on-label').hidden = true;
    showView('call-view');
    startClock();
    $('mute').focus();
    notify('بدأت معاينة مكالمة جديدة.');
  });

  startClock();
});
