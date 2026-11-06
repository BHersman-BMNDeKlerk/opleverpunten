// Markeren op foto's, handtekeningen en plattegrond-viewer.
import { openOverlay, icon, esc, toast } from './ui.js';
import { loadImage, canvasToBlob, resizeBlob } from './images.js';

const COLORS = ['#E53935', '#FFD60A', '#FFFFFF', '#1E88E5'];
const TOOL_LABEL = { circle: 'Cirkel', arrow: 'Pijl', pen: 'Vrije lijn', rect: 'Rechthoek' };

export function drawStroke(ctx, s) {
  const p = s.points;
  if (!p?.length) return;
  ctx.save();
  ctx.strokeStyle = s.color;
  ctx.fillStyle = s.color;
  ctx.lineWidth = s.width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = s.width * 0.9;
  const a = p[0];
  const b = p[p.length - 1];
  if (s.tool === 'pen') {
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    if (p.length === 1) ctx.lineTo(a[0] + 0.1, a[1]);
    for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  } else if (s.tool === 'circle') {
    ctx.beginPath();
    ctx.ellipse(
      (a[0] + b[0]) / 2,
      (a[1] + b[1]) / 2,
      Math.max(1, Math.abs(b[0] - a[0]) / 2),
      Math.max(1, Math.abs(b[1] - a[1]) / 2),
      0,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  } else if (s.tool === 'rect') {
    ctx.strokeRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  } else if (s.tool === 'arrow') {
    const ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
    const head = s.width * 4.2;
    const bx = b[0] - Math.cos(ang) * head * 0.6;
    const by = b[1] - Math.sin(ang) * head * 0.6;
    ctx.beginPath();
    ctx.moveTo(a[0], a[1]);
    ctx.lineTo(bx, by);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b[0], b[1]);
    ctx.lineTo(b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45));
    ctx.lineTo(b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45));
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export async function renderAnnotated(original, strokes, w, h) {
  const img = original instanceof HTMLImageElement ? original : await loadImage(original);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);
  strokes.forEach((s) => drawStroke(ctx, s));
  const blob = await canvasToBlob(c, 'image/jpeg', 0.86);
  c.width = c.height = 0;
  return blob;
}

// Volledig scherm: markeringen tekenen op een foto. Geeft {blob, thumb, strokes} of null.
export function annotate(foto) {
  return new Promise(async (resolve) => {
    let img;
    try {
      img = await loadImage(foto.original);
    } catch (e) {
      toast(e.message, 'error');
      return resolve(null);
    }
    const W = foto.w;
    const H = foto.h;
    const strokes = (foto.strokes || []).map((s) => ({ ...s, points: s.points.map((q) => [...q]) }));
    const lw = Math.max(4, Math.round(Math.max(W, H) / 170));
    let tool = 'circle';
    let color = COLORS[0];
    let cur = null;
    let finished = false;

    const ov = openOverlay('ann', { history: true, onBack: () => finish(null, true) });
    ov.el.innerHTML = `
      <div class="ann-bar">
        <div class="ann-group" role="group" aria-label="Gereedschap">
          ${Object.keys(TOOL_LABEL)
            .map((t) => `<button class="tool ${t === tool ? 'on' : ''}" data-tool="${t}" aria-label="${TOOL_LABEL[t]}" title="${TOOL_LABEL[t]}">${icon(t)}</button>`)
            .join('')}
        </div>
        <div class="ann-group" role="group" aria-label="Kleur">
          ${COLORS.map((c) => `<button class="swatch ${c === color ? 'on' : ''}" data-color="${c}" style="--c:${c}" aria-label="Kleur ${c}"></button>`).join('')}
        </div>
        <div class="ann-group">
          <button class="tool" data-a="undo" aria-label="Laatste ongedaan maken" title="Ongedaan maken">${icon('undo')}</button>
          <button class="tool" data-a="clear" aria-label="Alle markeringen wissen" title="Alles wissen">${icon('trash')}</button>
        </div>
        <span class="grow"></span>
        <button class="btn dark" data-a="cancel">Annuleren</button>
        <button class="btn primary" data-a="save">${icon('check')}<span>Gereed</span></button>
      </div>
      <div class="ann-stage"><canvas aria-label="Foto, teken om te markeren"></canvas></div>`;

    const stage = ov.el.querySelector('.ann-stage');
    const canvas = ov.el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = W;
    canvas.height = H;

    const fit = () => {
      const r = stage.getBoundingClientRect();
      const s = Math.min((r.width - 20) / W, (r.height - 20) / H);
      canvas.style.width = Math.max(50, W * s) + 'px';
      canvas.style.height = Math.max(50, H * s) + 'px';
    };
    const ro = new ResizeObserver(fit);
    ro.observe(stage);
    fit();

    const draw = () => {
      ctx.drawImage(img, 0, 0, W, H);
      strokes.forEach((s) => drawStroke(ctx, s));
      if (cur) drawStroke(ctx, cur);
    };
    let raf = 0;
    const redraw = () => {
      if (!raf)
        raf = requestAnimationFrame(() => {
          raf = 0;
          draw();
        });
    };
    draw();

    const pt = (e) => {
      const r = canvas.getBoundingClientRect();
      return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
    };
    canvas.addEventListener('pointerdown', (e) => {
      if (cur) return;
      canvas.setPointerCapture(e.pointerId);
      const q = pt(e);
      cur = { tool, color, width: lw, points: tool === 'pen' ? [q] : [q, q] };
      redraw();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      if (cur.tool === 'pen') evs.forEach((ev) => cur.points.push(pt(ev)));
      else cur.points[1] = pt(e);
      redraw();
    });
    const end = () => {
      if (!cur) return;
      const a = cur.points[0];
      const b = cur.points[cur.points.length - 1];
      if (cur.tool === 'pen' || Math.hypot(b[0] - a[0], b[1] - a[1]) > lw * 1.5) strokes.push(cur);
      cur = null;
      redraw();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);

    ov.el.querySelector('.ann-bar').addEventListener('click', async (e) => {
      const t = e.target.closest('button');
      if (!t) return;
      if (t.dataset.tool) {
        tool = t.dataset.tool;
        ov.el.querySelectorAll('[data-tool]').forEach((b) => b.classList.toggle('on', b === t));
      } else if (t.dataset.color) {
        color = t.dataset.color;
        ov.el.querySelectorAll('[data-color]').forEach((b) => b.classList.toggle('on', b === t));
      } else if (t.dataset.a === 'undo') {
        strokes.pop();
        redraw();
      } else if (t.dataset.a === 'clear') {
        strokes.length = 0;
        redraw();
      } else if (t.dataset.a === 'cancel') {
        finish(null);
      } else if (t.dataset.a === 'save') {
        t.disabled = true;
        try {
          const blob = strokes.length ? await renderAnnotated(img, strokes, W, H) : null;
          const thumb = (await resizeBlob(blob || foto.original, 400, 0.72)).blob;
          finish({ blob, thumb, strokes });
        } catch (err) {
          t.disabled = false;
          toast(err.message, 'error');
        }
      }
    });

    function finish(result, fromBack) {
      if (finished) return;
      finished = true;
      ro.disconnect();
      if (!fromBack) ov.close();
      resolve(result);
    }
  });
}

// Handtekening zetten. Geeft een PNG data-URL of null.
export function signaturePad(title) {
  return new Promise((resolve) => {
    let finished = false;
    const ov = openOverlay('modal-back', { history: true, onBack: () => finish(null, true) });
    ov.el.innerHTML = `<div class="modal sig-modal" role="dialog" aria-modal="true">
      <h2>${esc(title)}</h2>
      <p class="muted">Teken met een vinger of pen in het vak.</p>
      <div class="sig-area"><canvas aria-label="Handtekeningvak"></canvas><span class="sig-line" aria-hidden="true"></span></div>
      <div class="modal-actions"><button class="btn ghost" data-a="clear">Opnieuw</button><span class="grow"></span>
      <button class="btn ghost" data-a="cancel">Annuleren</button><button class="btn primary" data-a="ok">${icon('check')}<span>Opslaan</span></button></div></div>`;
    const area = ov.el.querySelector('.sig-area');
    const canvas = area.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    let box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    let drawing = false;
    let last = null;
    const setup = () => {
      const r = area.getBoundingClientRect();
      canvas.width = Math.round(r.width * dpr);
      canvas.height = Math.round(r.height * dpr);
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2.6 * dpr;
      box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    };
    setup();
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) * dpr, (e.clientY - r.top) * dpr];
    };
    const grow = ([x, y]) => {
      box.x0 = Math.min(box.x0, x);
      box.y0 = Math.min(box.y0, y);
      box.x1 = Math.max(box.x1, x);
      box.y1 = Math.max(box.y1, y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = pos(e);
      grow(last);
      ctx.beginPath();
      ctx.arc(last[0], last[1], ctx.lineWidth / 2, 0, Math.PI * 2);
      ctx.fillStyle = '#111';
      ctx.fill();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs) {
        const q = pos(ev);
        ctx.beginPath();
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(q[0], q[1]);
        ctx.stroke();
        grow(q);
        last = q;
      }
    });
    const stop = () => (drawing = false);
    canvas.addEventListener('pointerup', stop);
    canvas.addEventListener('pointercancel', stop);

    ov.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'clear') {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setup();
      } else if (a === 'cancel') finish(null);
      else if (a === 'ok') {
        if (box.x1 < 0) return toast('Zet eerst een handtekening in het vak.', 'warn');
        const pad = 6 * dpr;
        const x = Math.max(0, box.x0 - pad);
        const y = Math.max(0, box.y0 - pad);
        const w = Math.min(canvas.width, box.x1 + pad) - x;
        const h = Math.min(canvas.height, box.y1 + pad) - y;
        const out = document.createElement('canvas');
        const s = Math.min(1, 700 / w);
        out.width = Math.round(w * s);
        out.height = Math.round(h * s);
        out.getContext('2d').drawImage(canvas, x, y, w, h, 0, 0, out.width, out.height);
        finish(out.toDataURL('image/png'));
      }
    });

    function finish(v, fromBack) {
      if (finished) return;
      finished = true;
      if (!fromBack) ov.close();
      resolve(v);
    }
  });
}

// Plattegrond met zoomknoppen en genummerde markeringen.
export function mountPlan(box, { url, w, h, pins = [], onTap, onPin }) {
  box.innerHTML = `<div class="plan-scroll"><div class="plan-inner"><img alt="Plattegrond" draggable="false"><div class="plan-pins"></div></div></div>
    <div class="plan-tools">
      <button type="button" class="iconbtn" data-z="out" aria-label="Uitzoomen">${icon('zoomOut')}</button>
      <button type="button" class="iconbtn" data-z="fit" aria-label="Passend maken">${icon('fit')}</button>
      <button type="button" class="iconbtn" data-z="in" aria-label="Inzoomen">${icon('zoomIn')}</button>
    </div>`;
  const scroll = box.querySelector('.plan-scroll');
  const inner = box.querySelector('.plan-inner');
  const img = inner.querySelector('img');
  const pinsEl = inner.querySelector('.plan-pins');
  img.src = url;
  let z = 1;

  function layout(keep) {
    const sw = scroll.clientWidth;
    const sh = scroll.clientHeight;
    if (!sw || !sh) return;
    const fit = Math.min(sw / w, sh / h);
    const iw = w * fit * z;
    const ih = h * fit * z;
    const canKeep = keep && inner.offsetWidth > 0;
    const cx = canKeep ? (scroll.scrollLeft + sw / 2 - inner.offsetLeft) / inner.offsetWidth : 0.5;
    const cy = canKeep ? (scroll.scrollTop + sh / 2 - inner.offsetTop) / inner.offsetHeight : 0.5;
    inner.style.width = iw + 'px';
    inner.style.height = ih + 'px';
    inner.style.marginLeft = Math.max(0, (sw - iw) / 2) + 'px';
    inner.style.marginTop = Math.max(0, (sh - ih) / 2) + 'px';
    scroll.scrollLeft = cx * iw - sw / 2;
    scroll.scrollTop = cy * ih - sh / 2;
    box.classList.toggle('zoomed', z > 1);
  }

  function setPins(list) {
    pinsEl.innerHTML = list
      .map(
        (p) =>
          `<button type="button" class="mpin ${p.cls || ''}" style="left:${(p.x * 100).toFixed(3)}%;top:${(p.y * 100).toFixed(3)}%" data-pin="${esc(p.id)}" aria-label="Punt ${esc(p.label)}">${esc(p.label)}</button>`
      )
      .join('');
  }
  setPins(pins);

  inner.addEventListener('click', (e) => {
    const pb = e.target.closest('[data-pin]');
    if (pb && onPin) return onPin(pb.dataset.pin);
    if (!onTap) return;
    const r = img.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    onTap({ x: +x.toFixed(4), y: +y.toFixed(4) });
  });
  box.querySelector('.plan-tools').addEventListener('click', (e) => {
    const b = e.target.closest('[data-z]');
    if (!b) return;
    z = b.dataset.z === 'in' ? Math.min(z * 1.6, 10) : b.dataset.z === 'out' ? Math.max(z / 1.6, 1) : 1;
    layout(true);
  });
  const ro = new ResizeObserver(() => layout(true));
  ro.observe(scroll);
  layout(false);
  return { setPins, destroy: () => ro.disconnect() };
}

// Overlay om een punt op een plattegrond te plaatsen.
export function pickPin({ plans, plattegrondId, pin, others = [], label = '+' }) {
  return new Promise((resolve) => {
    let planId = plans.some((p) => p.id === plattegrondId) ? plattegrondId : plans[0].id;
    let cur = planId === plattegrondId ? pin : null;
    let finished = false;
    let viewer;
    const urls = new Map();
    const url = (pl) => {
      if (!urls.has(pl.id)) urls.set(pl.id, URL.createObjectURL(pl.blob));
      return urls.get(pl.id);
    };
    const ov = openOverlay('pinpick', { history: true, onBack: () => finish(null, true) });
    ov.el.innerHTML = `<div class="pp-bar">
        <div class="pp-title"><b>Plaats op plattegrond</b><span>Tik op de plek van het opleverpunt</span></div>
        ${
          plans.length > 1
            ? `<select class="pp-sel" aria-label="Plattegrond">${plans
                .map((p) => `<option value="${esc(p.id)}" ${p.id === planId ? 'selected' : ''}>${esc(p.naam)}</option>`)
                .join('')}</select>`
            : `<span class="pp-name">${esc(plans[0].naam)}</span>`
        }
        <span class="grow"></span>
        <button class="btn" data-a="clear">Markering weghalen</button>
        <button class="btn ghost" data-a="cancel">Annuleren</button>
        <button class="btn primary" data-a="ok">${icon('check')}<span>Opslaan</span></button>
      </div><div class="planbox pp-box"></div>`;
    const box = ov.el.querySelector('.pp-box');
    const pinsFor = () => [
      ...others
        .filter((o) => o.plattegrondId === planId && o.pin)
        .map((o) => ({ id: o.id, x: o.pin.x, y: o.pin.y, label: o.nr, cls: `p-${o.status} dim` })),
      ...(cur ? [{ id: '__cur', x: cur.x, y: cur.y, label, cls: 'cur' }] : []),
    ];
    const mount = () => {
      const pl = plans.find((p) => p.id === planId);
      viewer?.destroy();
      viewer = mountPlan(box, {
        url: url(pl),
        w: pl.w,
        h: pl.h,
        pins: pinsFor(),
        onTap: (q) => {
          cur = q;
          viewer.setPins(pinsFor());
        },
      });
    };
    mount();
    ov.el.querySelector('.pp-sel')?.addEventListener('change', (e) => {
      planId = e.target.value;
      cur = null;
      mount();
    });
    ov.el.querySelector('.pp-bar').addEventListener('click', (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'ok') finish(cur ? { plattegrondId: planId, pin: cur } : { plattegrondId: null, pin: null });
      else if (a === 'cancel') finish(null);
      else if (a === 'clear') {
        cur = null;
        viewer.setPins(pinsFor());
      }
    });
    function finish(v, fromBack) {
      if (finished) return;
      finished = true;
      viewer?.destroy();
      urls.forEach((u) => URL.revokeObjectURL(u));
      if (!fromBack) ov.close();
      resolve(v);
    }
  });
}
