// Hulpfuncties voor de interface: escapen, datums, iconen, overlays, meldingen.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 9);

export const nlSort = (a, b) => String(a).localeCompare(String(b), 'nl', { numeric: true, sensitivity: 'base' });

export function todayISO() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export function fmtDate(v, long = false) {
  if (!v) return '';
  const d = typeof v === 'number' ? new Date(v) : new Date(v.length === 10 ? v + 'T12:00:00' : v);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: long ? 'long' : 'short', year: 'numeric' });
}

export function fmtSize(bytes) {
  if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' kB';
  return (bytes / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB';
}

// ---------- Iconen ----------
const P = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  camera: '<path d="M3 8h3.5l2-3h7l2 3H21v11H3z"/><circle cx="12" cy="13" r="3.6"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-9 9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  pin: '<path d="M12 21s-6-5.5-6-11a6 6 0 1 1 12 0c0 5.5-6 11-6 11z"/><circle cx="12" cy="10" r="2.2"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  pen: '<path d="M4 20l4-1L19 8l-3-3L5 16z"/><path d="M14 7l3 3"/>',
  arrow: '<path d="M5 19L19 5M10 5h9v9"/>',
  circle: '<circle cx="12" cy="12" r="8"/>',
  rect: '<rect x="4" y="6" width="16" height="12"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5v3M12 18.5v3M4.6 4.6l2.1 2.1M17.3 17.3l2.1 2.1M2.5 12h3M18.5 12h3M4.6 19.4l2.1-2.1M17.3 6.7l2.1-2.1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  share: '<path d="M12 15V4M8 8l4-4 4 4M5 12v8h14v-8"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  plan: '<path d="M3 4h18v16H3z"/><path d="M3 12h8V4M11 20v-4h10M15 4v5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  sign: '<path d="M3 17c3 0 4-6 6-6s1 6 3 6 3-3 4-3 2 2 5 2"/><path d="M3 21h18"/>',
  zoomIn: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8 11h6M11 8v6"/>',
  zoomOut: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5M8 11h6"/>',
  fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="1"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  clipboard: '<rect x="5" y="4" width="14" height="17" rx="1.5"/><path d="M9 4V2.8h6V4M8.5 10h7M8.5 14h7M8.5 18h4"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  open: '<path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6"/>',
  mark: '<path d="M12 21s-6.5-5.8-6.5-11.5a6.5 6.5 0 1 1 13 0C18.5 15.2 12 21 12 21z"/><path d="M9 9.5l2.2 2.2L15.5 7.5"/>',
};
export const icon = (n, cls = '') =>
  `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || ''}</svg>`;

// ---------- Overlays met ondersteuning voor de terugknop ----------
const overlays = [];
let skipPop = 0;
let waiters = [];
let historyEnabled = true;

export function setHistoryEnabled(v) {
  historyEnabled = v;
}

export function whenHistorySettled() {
  if (!skipPop) return Promise.resolve();
  return new Promise((r) => {
    waiters.push(r);
    setTimeout(r, 500);
  });
}

export function openOverlay(cls, { history = false, onBack } = {}) {
  const el = document.createElement('div');
  el.className = 'overlay ' + cls;
  document.body.appendChild(el);
  document.body.classList.add('has-overlay');
  const entry = { el, onBack, pushed: false };
  overlays.push(entry);
  if (history && historyEnabled) {
    try {
      window.history.pushState({ overlay: true }, '');
      entry.pushed = true;
    } catch {
      /* geen history beschikbaar */
    }
  }
  const close = () => {
    const i = overlays.indexOf(entry);
    if (i < 0) return;
    overlays.splice(i, 1);
    el.remove();
    if (!overlays.length) document.body.classList.remove('has-overlay');
    if (entry.pushed) {
      skipPop++;
      window.history.back();
    }
  };
  return { el, close };
}

// Wordt aangeroepen bij popstate. Geeft true terug als een overlay de gebeurtenis heeft afgehandeld.
export function handlePop() {
  if (skipPop) {
    skipPop--;
    if (!skipPop) waiters.splice(0).forEach((r) => r());
    return true;
  }
  for (let i = overlays.length - 1; i >= 0; i--) {
    const entry = overlays[i];
    if (entry.pushed) {
      overlays.splice(i, 1);
      entry.el.remove();
      if (!overlays.length) document.body.classList.remove('has-overlay');
      entry.onBack?.();
      return true;
    }
  }
  return false;
}

document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || !overlays.length) return;
  const entry = overlays[overlays.length - 1];
  if (!entry.onBack) return;
  if (entry.pushed) window.history.back();
  else {
    overlays.pop();
    entry.el.remove();
    if (!overlays.length) document.body.classList.remove('has-overlay');
    entry.onBack();
  }
});

// ---------- Dialogen ----------
export function ask({ title, message = '', ok = 'OK', cancel = 'Annuleren', danger = false }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      ov.close();
      resolve(v);
    };
    const ov = openOverlay('modal-back', { onBack: () => finish(false) });
    ov.el.innerHTML = `<div class="modal" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t">
      <h2 id="dlg-t">${esc(title)}</h2>${message ? `<p>${esc(message)}</p>` : ''}
      <div class="modal-actions"><button class="btn ghost" data-r="0">${esc(cancel)}</button>
      <button class="btn ${danger ? 'danger-fill' : 'primary'}" data-r="1">${esc(ok)}</button></div></div>`;
    ov.el.addEventListener('click', (e) => {
      if (e.target === ov.el) return finish(false);
      const b = e.target.closest('[data-r]');
      if (b) finish(b.dataset.r === '1');
    });
    ov.el.querySelector('[data-r="1"]').focus();
  });
}

export function promptText({ title, label = '', value = '', ok = 'Opslaan' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      ov.close();
      resolve(v);
    };
    const ov = openOverlay('modal-back', { onBack: () => finish(null) });
    ov.el.innerHTML = `<form class="modal" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2>
      <label class="field"><span>${esc(label)}</span><input id="dlg-input" value="${esc(value)}" autocomplete="off"></label>
      <div class="modal-actions"><button type="button" class="btn ghost" data-c>Annuleren</button>
      <button class="btn primary" type="submit">${esc(ok)}</button></div></form>`;
    const form = ov.el.querySelector('form');
    form.onsubmit = (e) => {
      e.preventDefault();
      finish(form.querySelector('input').value.trim());
    };
    ov.el.addEventListener('click', (e) => {
      if (e.target === ov.el || e.target.closest('[data-c]')) finish(null);
    });
    const inp = form.querySelector('input');
    inp.focus();
    inp.select();
  });
}

export function chooseSheet(title, options, extra) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      ov.close();
      resolve(v);
    };
    const ov = openOverlay('modal-back', { onBack: () => finish(null) });
    ov.el.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h2>${esc(title)}</h2>
      <div class="choices">${options
        .map(
          (o, i) => `<button class="choice ${o.active ? 'on' : ''}" data-i="${i}">
          <span class="choice-t">${esc(o.label)}</span>${o.sub ? `<span class="choice-s">${esc(o.sub)}</span>` : ''}
          ${o.active ? icon('check') : ''}</button>`
        )
        .join('')}</div>
      <div class="modal-actions">${extra ? `<button class="btn" data-x>${icon('plus')}<span>${esc(extra.label)}</span></button>` : ''}
      <button class="btn ghost" data-c>Sluiten</button></div></div>`;
    ov.el.addEventListener('click', (e) => {
      if (e.target === ov.el || e.target.closest('[data-c]')) return finish(null);
      if (e.target.closest('[data-x]')) return finish(extra.value);
      const b = e.target.closest('[data-i]');
      if (b) finish(options[+b.dataset.i].value);
    });
  });
}

export function busy(msg) {
  const ov = openOverlay('modal-back busy');
  ov.el.innerHTML = `<div class="busy-card" role="status" aria-live="polite"><div class="spinner"></div>
    <p class="busy-msg">${esc(msg)}</p><div class="bar" hidden><i></i></div></div>`;
  const m = ov.el.querySelector('.busy-msg');
  const bar = ov.el.querySelector('.bar');
  return {
    set(text, frac) {
      if (text) m.textContent = text;
      if (frac != null) {
        bar.hidden = false;
        bar.firstElementChild.style.width = Math.round(Math.min(1, frac) * 100) + '%';
      }
    },
    close: ov.close,
  };
}

let toastWrap;
export function toast(msg, kind = 'ok') {
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastWrap);
  }
  const t = document.createElement('div');
  t.className = 'toast t-' + kind;
  t.textContent = msg;
  toastWrap.appendChild(t);
  setTimeout(() => t.classList.add('out'), kind === 'error' ? 5000 : 2600);
  setTimeout(() => t.remove(), kind === 'error' ? 5400 : 3000);
}
