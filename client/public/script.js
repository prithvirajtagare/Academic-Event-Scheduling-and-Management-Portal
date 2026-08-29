(function () {
  const state = window.__CAL_STATE__;

  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }

  function reloadWith(params) {
    const url = new URL(window.location.origin + '/');
    const merged = { year: state.year, month: state.month, category: state.category, date: state.selectedDate, ...params };
    Object.entries(merged).forEach(([k, v]) => {
      if (v !== null && v !== undefined && v !== '') url.searchParams.set(k, v);
    });
    window.location.href = url.toString();
  }

  /* ---------------- Login modal ---------------- */
  const loginOverlay = qs('#loginOverlay');
  const loginBtn = qs('#loginBtn');
  const logoutBtn = qs('#logoutBtn');

  if (loginBtn) {
    loginBtn.addEventListener('click', () => loginOverlay.classList.add('show'));
  }
  const loginCancelBtn = qs('#loginCancelBtn');
  if (loginCancelBtn) {
    loginCancelBtn.addEventListener('click', () => loginOverlay.classList.remove('show'));
  }
  const loginSubmitBtn = qs('#loginSubmitBtn');
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', async () => {
      const username = qs('#loginUser').value.trim();
      const password = qs('#loginPass').value.trim();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (data.success) {
        window.location.reload();
      } else {
        qs('#loginError').textContent = data.message || 'Incorrect username or password.';
        qs('#loginError').classList.add('show');
      }
    });
  }
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/';
    });
  }

  /* ---------------- Event modal ---------------- */
  const eventOverlay = qs('#eventOverlay');

  function openEventModal(mode, eventData, presetDate) {
    qs('#eventError').classList.remove('show');
    qs('#eventModalTitle').textContent = mode === 'add' ? 'Add event' : 'Edit event';
    qs('#eventModalSub').textContent = mode === 'add'
      ? 'creates a new entry in the Events table'
      : `editing entry #${eventData.id} in the Events table`;
    qs('#eventSubmitBtn').textContent = mode === 'add' ? 'Save event' : 'Save changes';
    qs('#eventSubmitBtn').dataset.mode = mode;
    qs('#fId').value = eventData ? eventData.id : '';
    qs('#fTitle').value = eventData ? eventData.title : '';
    qs('#fDate').value = eventData ? eventData.date : (presetDate || state.selectedDate || new Date().toISOString().slice(0, 10));
    qs('#fTime').value = eventData ? eventData.time : '';
    qs('#fCategory').value = eventData ? eventData.category : 'workshop';
    qs('#fVenue').value = eventData ? eventData.venue : '';
    qs('#fDesc').value = eventData ? eventData.description : '';
    eventOverlay.classList.add('show');
  }

  const panelAddBtn = qs('#panelAddBtn');
  if (panelAddBtn) {
    panelAddBtn.addEventListener('click', () => openEventModal('add', null, panelAddBtn.dataset.date));
  }
  qsa('.quick-add').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openEventModal('add', null, btn.dataset.date);
    });
  });
  qsa('[data-edit-event]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const data = JSON.parse(btn.dataset.editEvent);
      openEventModal('edit', data);
    });
  });
  qsa('[data-delete-event]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this event?')) return;
      const id = btn.dataset.deleteEvent;
      await fetch(`/api/events/${id}`, { method: 'DELETE' });
      reloadWith({ date: state.selectedDate });
    });
  });

  const eventCancelBtn = qs('#eventCancelBtn');
  if (eventCancelBtn) {
    eventCancelBtn.addEventListener('click', () => eventOverlay.classList.remove('show'));
  }

  const eventSubmitBtn = qs('#eventSubmitBtn');
  if (eventSubmitBtn) {
    eventSubmitBtn.addEventListener('click', async () => {
      const mode = eventSubmitBtn.dataset.mode;
      const payload = {
        title: qs('#fTitle').value.trim(),
        date: qs('#fDate').value,
        time: qs('#fTime').value.trim(),
        category: qs('#fCategory').value,
        venue: qs('#fVenue').value.trim(),
        description: qs('#fDesc').value.trim()
      };
      const id = qs('#fId').value;
      const url = mode === 'add' ? '/api/events' : `/api/events/${id}`;
      const method = mode === 'add' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();

      if (res.ok) {
        eventOverlay.classList.remove('show');
        const d = payload.date;
        reloadWith({ year: Number(d.slice(0, 4)), month: Number(d.slice(5, 7)), date: d });
      } else {
        qs('#eventError').textContent = data.message || 'Something went wrong.';
        qs('#eventError').classList.add('show');
      }
    });
  }

  /* ---------------- Reminders ---------------- */
  qsa('.rem-checkbox').forEach((cb) => {
    cb.addEventListener('change', () => {
      const wrap = qs(`#rem-email-${cb.dataset.eventId}`);
      wrap.classList.toggle('show', cb.checked);
    });
  });
  qsa('[data-send-reminder]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const eventId = btn.dataset.sendReminder;
      const input = qs(`#rem-input-${eventId}`);
      const email = input.value.trim();
      if (!email || !email.includes('@')) {
        input.style.borderColor = '#D5493F';
        return;
      }
      const res = await fetch('/api/reminders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventId, email })
      });
      const data = await res.json();
      if (data.success) {
        qs(`#rem-confirm-${eventId}`).classList.add('show');
      }
    });
  });

  /* ---------------- Calendar poster (Year/Sem/Custom download + share) ---------------- */
  const posterYearSelect = qs('#posterYear');
  const posterScopeSelect = qs('#posterScope');
  const downloadPosterBtn = qs('#downloadPosterBtn');
  const customRangeFields = qs('#customRangeFields');
  const customFromMonth = qs('#customFromMonth');
  const customFromYear = qs('#customFromYear');
  const customToMonth = qs('#customToMonth');
  const customToYear = qs('#customToYear');
  const customLabelInput = qs('#customLabel');
  const posterAddEventBtn = qs('#posterAddEventBtn');

  const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const CAT_COLOR = { workshop: '#6D5FFD', seminar: '#2E86DE', fest: '#E0812A', exam: '#D5493F', holiday: '#2F9E5B' };
  const centerYear = state.year || new Date().getFullYear();

  function fillYearSelect(sel, selectedYear) {
    for (let y = centerYear - 2; y <= centerYear + 2; y++) {
      const opt = document.createElement('option');
      opt.value = String(y);
      opt.textContent = String(y);
      if (y === selectedYear) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function fillMonthSelect(sel, selectedMonth) {
    MONTH_NAMES.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = String(i + 1);
      opt.textContent = name;
      if (i + 1 === selectedMonth) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  if (posterYearSelect) fillYearSelect(posterYearSelect, centerYear);
  if (customFromMonth) {
    fillMonthSelect(customFromMonth, 1);
    fillYearSelect(customFromYear, centerYear);
    fillMonthSelect(customToMonth, 12);
    fillYearSelect(customToYear, centerYear);
  }

  function updatePosterScopeVisibility() {
    if (!posterScopeSelect) return;
    const isCustom = posterScopeSelect.value === 'custom';
    if (posterYearSelect) posterYearSelect.style.display = isCustom ? 'none' : '';
    if (customRangeFields) customRangeFields.style.display = isCustom ? 'inline-flex' : 'none';
  }
  if (posterScopeSelect) {
    posterScopeSelect.addEventListener('change', updatePosterScopeVisibility);
    updatePosterScopeVisibility();
  }

  /** Builds an ordered list of {year, month} pairs covered by the current toolbar selection, plus a display label. */
  function getSelectedPeriods() {
    const scope = posterScopeSelect.value;

    if (scope === 'custom') {
      const fy = Number(customFromYear.value), fm = Number(customFromMonth.value);
      const ty = Number(customToYear.value), tm = Number(customToMonth.value);
      const periods = [];
      let y = fy, m = fm;
      // Guard against an accidentally-reversed range or a huge span.
      let safety = 0;
      while ((y < ty || (y === ty && m <= tm)) && safety < 60) {
        periods.push({ year: y, month: m });
        m += 1;
        if (m > 12) { m = 1; y += 1; }
        safety += 1;
      }
      if (periods.length === 0) periods.push({ year: fy, month: fm });
      const customLabel = (customLabelInput.value || '').trim();
      const label = customLabel || `${MONTH_SHORT[fm - 1]} ${fy} \u2013 ${MONTH_SHORT[tm - 1]} ${ty}`;
      return { periods, label, fileTag: `custom-${fy}${String(fm).padStart(2, '0')}-${ty}${String(tm).padStart(2, '0')}` };
    }

    const year = Number(posterYearSelect.value);
    if (scope === 'sem-odd') {
      return { periods: [7, 8, 9, 10, 11, 12].map((month) => ({ year, month })), label: `${year} \u00b7 Odd Semester (Jul\u2013Dec)`, fileTag: `${year}-odd-sem` };
    }
    if (scope === 'sem-even') {
      return { periods: [1, 2, 3, 4, 5, 6].map((month) => ({ year, month })), label: `${year} \u00b7 Even Semester (Jan\u2013Jun)`, fileTag: `${year}-even-sem` };
    }
    return { periods: Array.from({ length: 12 }, (_, i) => ({ year, month: i + 1 })), label: `${year} \u00b7 Full Year`, fileTag: `${year}-full-year` };
  }

  function buildMonthCell(year, monthNum, eventsByDate) {
    const wrap = document.createElement('div');
    wrap.className = 'poster-month';
    const h3 = document.createElement('h3');
    h3.textContent = MONTH_SHORT[monthNum - 1] + ' ' + year;
    wrap.appendChild(h3);

    const grid = document.createElement('div');
    grid.className = 'poster-month-grid';
    DOW_SHORT.forEach((d) => {
      const el = document.createElement('div');
      el.className = 'pdow';
      el.textContent = d;
      grid.appendChild(el);
    });

    const firstDow = new Date(year, monthNum - 1, 1).getDay();
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    for (let i = 0; i < firstDow; i++) {
      grid.appendChild(document.createElement('div'));
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const cell = document.createElement('div');
      cell.className = 'pday';
      cell.textContent = String(d);
      const dayEvents = eventsByDate[dateStr];
      if (dayEvents && dayEvents.length) {
        cell.classList.add('has-event');
        cell.style.background = CAT_COLOR[dayEvents[0].category] || 'var(--navy)';
      }
      grid.appendChild(cell);
    }
    wrap.appendChild(grid);
    return wrap;
  }

  /** Fetches all events, builds the offscreen poster DOM for the given periods/label, and returns the element to rasterize. */
  async function buildPoster(periods, label) {
    const periodKeys = new Set(periods.map((p) => `${p.year}-${String(p.month).padStart(2, '0')}`));
    const res = await fetch('/api/events?category=all');
    const allEvents = await res.json();
    const filtered = allEvents
      .filter((e) => periodKeys.has(e.date.slice(0, 7)))
      .sort((a, b) => a.date.localeCompare(b.date));

    const eventsByDate = {};
    filtered.forEach((e) => {
      if (!eventsByDate[e.date]) eventsByDate[e.date] = [];
      eventsByDate[e.date].push(e);
    });

    const root = qs('#posterRoot');
    root.innerHTML = '';

    const poster = document.createElement('div');
    poster.className = 'poster';

    const header = document.createElement('div');
    header.className = 'poster-header';
    header.innerHTML = `
      <img src="/logo.jpg" alt="logo">
      <div>
        <h1>${state.instituteName}</h1>
        <div class="poster-sub">Department of ${state.deptName} &middot; Event Calendar</div>
      </div>
      <div class="poster-scope">${label}</div>
    `;
    poster.appendChild(header);

    const body = document.createElement('div');
    body.className = 'poster-body';

    const monthsGrid = document.createElement('div');
    monthsGrid.className = 'poster-months';
    periods.forEach((p) => monthsGrid.appendChild(buildMonthCell(p.year, p.month, eventsByDate)));
    body.appendChild(monthsGrid);

    const listWrap = document.createElement('div');
    listWrap.className = 'poster-list';
    const listTitle = document.createElement('h3');
    listTitle.textContent = `All events (${filtered.length})`;
    listWrap.appendChild(listTitle);

    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'poster-list-empty';
      empty.textContent = 'No events scheduled in this period.';
      listWrap.appendChild(empty);
    } else {
      filtered.forEach((e) => {
        const [ey, em, ed] = e.date.split('-').map(Number);
        const row = document.createElement('div');
        row.className = 'poster-list-item';
        const yearTag = periods.some((p) => p.year !== periods[0].year) ? ` ${ey}` : '';
        row.innerHTML = `
          <span class="swatch" style="background:${CAT_COLOR[e.category] || '#999'}"></span>
          <span class="pd">${MONTH_SHORT[em - 1]} ${ed}${yearTag}</span>
          <span class="pt">${e.title}</span>
        `;
        listWrap.appendChild(row);
      });
    }
    body.appendChild(listWrap);
    poster.appendChild(body);

    const footer = document.createElement('div');
    footer.className = 'poster-footer';
    footer.textContent = `Generated from the ${state.deptShort} department calendar`;
    poster.appendChild(footer);

    root.appendChild(poster);
    return poster;
  }

  async function renderPosterCanvas() {
    const { periods, label, fileTag } = getSelectedPeriods();
    const posterEl = await buildPoster(periods, label);
    const canvas = await html2canvas(posterEl, { scale: 2, backgroundColor: '#ffffff', useCORS: true });
    qs('#posterRoot').innerHTML = '';
    return { canvas, label, fileTag };
  }

  if (downloadPosterBtn) {
    downloadPosterBtn.addEventListener('click', async () => {
      const originalText = downloadPosterBtn.textContent;
      downloadPosterBtn.textContent = 'Generating\u2026';
      downloadPosterBtn.disabled = true;
      try {
        const { canvas, fileTag } = await renderPosterCanvas();
        const link = document.createElement('a');
        link.download = `${state.deptShort.replace(/[^a-z0-9]+/gi, '-')}-calendar-${fileTag}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      } catch (err) {
        console.error('Failed to generate poster image:', err);
        alert('Sorry, something went wrong generating the image.');
      } finally {
        downloadPosterBtn.textContent = originalText;
        downloadPosterBtn.disabled = false;
      }
    });
  }

  /* ---------------- Admin: quick "add event" from the poster toolbar ---------------- */
  if (posterAddEventBtn) {
    posterAddEventBtn.addEventListener('click', () => openEventModal('add', null, null));
  }

  /* ---------------- Admin: share calendar poster by email ---------------- */
  const shareOverlay = qs('#shareOverlay');
  const shareBtn = qs('#shareBtn');
  const shareCancelBtn = qs('#shareCancelBtn');
  const shareSendBtn = qs('#shareSendBtn');
  const shareError = qs('#shareError');
  const shareSuccess = qs('#shareSuccess');
  const shareEmailInput = qs('#shareEmailInput');
  const shareAddBtn = qs('#shareAddBtn');
  const shareSaveContactBtn = qs('#shareSaveContactBtn');
  const shareRecipientsEl = qs('#shareRecipients');
  const shareMailBookBtn = qs('#shareMailBookBtn');
  const mailBookList = qs('#mailBookList');

  let shareRecipients = [];

  function isValidEmailClient(email) {
    return /^\S+@\S+\.\S+$/.test(email);
  }

  function renderRecipients() {
    shareRecipientsEl.innerHTML = '';
    shareRecipients.forEach((email) => {
      const chip = document.createElement('span');
      chip.className = 'share-chip';
      chip.innerHTML = `${email}<span class="x" data-email="${email}">\u2715</span>`;
      shareRecipientsEl.appendChild(chip);
    });
  }

  function addRecipient(email) {
    const clean = (email || '').trim().toLowerCase();
    if (!clean) return false;
    if (!isValidEmailClient(clean)) {
      shareError.textContent = 'That doesn\u2019t look like a valid email address.';
      shareError.classList.add('show');
      return false;
    }
    if (!shareRecipients.includes(clean)) shareRecipients.push(clean);
    renderRecipients();
    return true;
  }

  if (shareRecipientsEl) {
    shareRecipientsEl.addEventListener('click', (e) => {
      const x = e.target.closest('.x');
      if (!x) return;
      shareRecipients = shareRecipients.filter((email) => email !== x.dataset.email);
      renderRecipients();
    });
  }

  async function loadMailBook() {
    mailBookList.innerHTML = '<div class="mailbook-empty">Loading\u2026</div>';
    try {
      const res = await fetch('/api/contacts');
      const list = await res.json();
      mailBookList.innerHTML = '';
      if (!Array.isArray(list) || list.length === 0) {
        mailBookList.innerHTML = '<div class="mailbook-empty">No saved addresses yet.</div>';
        return;
      }
      list.forEach((c) => {
        const row = document.createElement('div');
        row.className = 'mailbook-item';
        row.innerHTML = `<span>${c.email}${c.label ? ' \u2013 ' + c.label : ''}</span><span class="rm" data-id="${c.id}">Remove</span>`;
        row.addEventListener('click', (e) => {
          if (e.target.classList.contains('rm')) return;
          addRecipient(c.email);
        });
        row.querySelector('.rm').addEventListener('click', async (e) => {
          e.stopPropagation();
          await fetch(`/api/contacts/${c.id}`, { method: 'DELETE' });
          loadMailBook();
        });
        mailBookList.appendChild(row);
      });
    } catch (err) {
      mailBookList.innerHTML = '<div class="mailbook-empty">Couldn\u2019t load the mail book.</div>';
    }
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareRecipients = [];
      renderRecipients();
      shareEmailInput.value = '';
      shareError.classList.remove('show');
      shareSuccess.classList.remove('show');
      mailBookList.classList.remove('show');
      shareOverlay.classList.add('show');
    });
  }
  if (shareCancelBtn) {
    shareCancelBtn.addEventListener('click', () => shareOverlay.classList.remove('show'));
  }
  if (shareAddBtn) {
    shareAddBtn.addEventListener('click', () => {
      if (addRecipient(shareEmailInput.value)) {
        shareError.classList.remove('show');
        shareEmailInput.value = '';
      }
    });
  }
  if (shareEmailInput) {
    shareEmailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        shareAddBtn.click();
      }
    });
  }
  if (shareSaveContactBtn) {
    shareSaveContactBtn.addEventListener('click', async () => {
      const email = (shareEmailInput.value || '').trim().toLowerCase();
      if (!isValidEmailClient(email)) {
        shareError.textContent = 'Enter a valid email before saving it to the mail book.';
        shareError.classList.add('show');
        return;
      }
      try {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Could not save contact.');
        shareError.classList.remove('show');
        addRecipient(email);
        if (mailBookList.classList.contains('show')) loadMailBook();
      } catch (err) {
        shareError.textContent = err.message;
        shareError.classList.add('show');
      }
    });
  }
  if (shareMailBookBtn) {
    shareMailBookBtn.addEventListener('click', () => {
      const willShow = !mailBookList.classList.contains('show');
      mailBookList.classList.toggle('show', willShow);
      if (willShow) loadMailBook();
    });
  }
  if (shareSendBtn) {
    shareSendBtn.addEventListener('click', async () => {
      shareError.classList.remove('show');
      shareSuccess.classList.remove('show');
      if (shareRecipients.length === 0) {
        shareError.textContent = 'Add at least one recipient first.';
        shareError.classList.add('show');
        return;
      }
      const originalText = shareSendBtn.textContent;
      shareSendBtn.textContent = 'Sending\u2026';
      shareSendBtn.disabled = true;
      try {
        const { canvas, label } = await renderPosterCanvas();
        const imageDataUrl = canvas.toDataURL('image/png');
        const res = await fetch('/api/share-poster', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: shareRecipients,
            subject: `${state.deptShort} Department Calendar \u2014 ${label}`,
            text: `Attached is the ${state.deptShort} department calendar (${label}).`,
            imageDataUrl
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Sending failed.');
        shareSuccess.classList.add('show');
        shareRecipients = [];
        renderRecipients();
      } catch (err) {
        shareError.textContent = err.message;
        shareError.classList.add('show');
      } finally {
        shareSendBtn.textContent = originalText;
        shareSendBtn.disabled = false;
      }
    });
  }
})();
