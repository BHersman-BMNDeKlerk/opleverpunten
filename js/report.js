// Opbouw van het PDF-verslag (jsPDF) en de CSV-export.
import { STATUS_LABEL, PRIO_LABEL } from './constants.js';
import { resizeBlob } from './images.js';
import { fmtDate, todayISO, nlSort } from './ui.js';

const C = {
  ink: [26, 29, 27],
  muted: [98, 106, 100],
  line: [214, 218, 211],
  soft: [243, 244, 241],
  accent: [242, 183, 5],
  open: [198, 40, 40],
  gereed: [21, 101, 192],
  akkoord: [46, 125, 50],
  white: [255, 255, 255],
};
const M = 15; // marge in mm
const PT = 0.3528; // 1pt in mm
const LHF = 1.22; // regelafstand

export const opnameLabel = (o) => (o ? `${o.type} · ${fmtDate(o.datum)}` : '');

function opnameOrder(o) {
  return `${o?.datum || ''}|${String(o?.created || 0).padStart(15, '0')}`;
}

export function selectPoints(punten, opnames, o) {
  let list = punten.slice();
  if (o.opnameId) {
    const cur = opnames.find((x) => x.id === o.opnameId);
    const byId = new Map(opnames.map((x) => [x.id, x]));
    list = list.filter((p) => {
      if (p.opnameId === o.opnameId) return true;
      if (!o.inclEerder || !cur) return false;
      const po = byId.get(p.opnameId);
      return po && opnameOrder(po) < opnameOrder(cur);
    });
  }
  return list.filter((p) => o.statuses.includes(p.status)).sort((a, b) => a.nr - b.nr);
}

export function groupKey(p, groep) {
  if (groep === 'bouwlaag') return p.bouwlaag || 'Geen bouwlaag opgegeven';
  if (groep === 'verantwoordelijke') return p.verantwoordelijke || 'Niet toegewezen';
  return '';
}

function groupPoints(list, groep) {
  if (groep === 'geen') return [{ key: '', items: list }];
  const map = new Map();
  list.forEach((p) => {
    const k = groupKey(p, groep);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p);
  });
  return [...map.entries()].sort((a, b) => nlSort(a[0], b[0])).map(([key, items]) => ({ key, items }));
}

export async function buildReport({ project, opnames, punten, fotoMap, plans, settings, o, onProgress = () => {} }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.setLineHeightFactor(LHF);
  const opname = o.opnameId ? opnames.find((x) => x.id === o.opnameId) : null;
  const opById = new Map(opnames.map((x) => [x.id, x]));
  const list = selectPoints(punten, opnames, o);
  const groups = groupPoints(list, o.groep);
  const title = o.titel || 'Opleverrapport';
  doc.setProperties({ title: `${title} – ${project.naam}`, subject: opnameLabel(opname), creator: 'Opleverpunten' });

  // ---------- Foto's voorbereiden ----------
  const perPoint = { groot: 7, normaal: 4, compact: 1 }[o.fotoFormaat];
  const maxPx = { groot: 1500, normaal: 1100, compact: 640 }[o.fotoFormaat];
  const needed = [...new Set(list.flatMap((p) => (p.fotoIds || []).slice(0, perPoint)))];
  const imgs = new Map();
  for (let i = 0; i < needed.length; i++) {
    const f = fotoMap.get(needed[i]);
    if (f) {
      const r = await resizeBlob(f.blob || f.original, maxPx, 0.8);
      imgs.set(needed[i], { data: new Uint8Array(await r.blob.arrayBuffer()), w: r.w, h: r.h });
    }
    onProgress(((i + 1) / Math.max(1, needed.length)) * 0.8, `Foto's verwerken ${i + 1} van ${needed.length}`);
  }

  // ---------- Hulpfuncties ----------
  let W = 210;
  let H = 297;
  const TOP = M + 10;
  const bottom = () => H - M - 8;
  let y = M;
  const lh = (size) => size * PT * LHF;
  const setFont = (size, style = 'normal', color = C.ink) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(...color);
  };
  const lines = (txt, width) => doc.splitTextToSize(String(txt ?? ''), width);
  const addPage = (orientation = 'p') => {
    doc.addPage('a4', orientation);
    W = doc.internal.pageSize.getWidth();
    H = doc.internal.pageSize.getHeight();
    y = TOP;
  };
  const ensure = (h) => {
    if (y + h > bottom()) {
      addPage();
      return true;
    }
    return false;
  };
  const heading = (txt, sub) => {
    ensure(22);
    setFont(16, 'bold');
    doc.text(txt, M, y + 6);
    doc.setFillColor(...C.accent);
    doc.rect(M, y + 8.6, 16, 1.4, 'F');
    y += 14;
    if (sub) {
      setFont(9, 'normal', C.muted);
      const l = lines(sub, W - 2 * M);
      doc.text(l, M, y);
      y += l.length * lh(9) + 3;
    }
  };
  const pill = (status, xRight, yTop, size = 8) => {
    const label = STATUS_LABEL[status] || status;
    setFont(size, 'bold', C.white);
    const pw = doc.getTextWidth(label) + 5;
    const ph = size * PT + 2.8;
    doc.setFillColor(...(C[status] || C.muted));
    doc.roundedRect(xRight - pw, yTop, pw, ph, ph / 2, ph / 2, 'F');
    doc.text(label, xRight - pw / 2, yTop + ph / 2 + size * PT * 0.36, { align: 'center' });
    return ph;
  };
  const photo = (id, x, y0, bw, bh) => {
    const im = imgs.get(id);
    doc.setFillColor(...C.soft);
    doc.rect(x, y0, bw, bh, 'F');
    if (!im) {
      setFont(8, 'normal', C.muted);
      doc.text('Geen foto', x + bw / 2, y0 + bh / 2 + 1, { align: 'center' });
      return;
    }
    const s = Math.min(bw / im.w, bh / im.h);
    const w = im.w * s;
    const h = im.h * s;
    doc.addImage(im.data, 'JPEG', x + (bw - w) / 2, y0 + (bh - h) / 2, w, h, 'f' + id, 'FAST');
  };
  const location = (p) => [p.bouwlaag, p.ruimte].filter(Boolean).join(' · ');
  const fields = (p) =>
    [
      ['Locatie', location(p)],
      ['Verantwoordelijke', p.verantwoordelijke],
      ['Categorie', p.categorie],
      ['Prioriteit', PRIO_LABEL[p.prioriteit]],
      ['Gereed vóór', p.deadline ? fmtDate(p.deadline, true) : ''],
      ['Opname', opnameLabel(opById.get(p.opnameId))],
      ['Opmerking', p.opmerking],
    ].filter((f) => f[1]);

  // ---------- Voorblad ----------
  if (settings.logo) {
    try {
      const props = doc.getImageProperties(settings.logo);
      const s = Math.min(55 / props.width, 20 / props.height);
      doc.addImage(settings.logo, props.fileType, M, M + 2, props.width * s, props.height * s);
    } catch {
      /* logo overslaan */
    }
  }
  if (settings.bedrijf) {
    setFont(10, 'bold');
    doc.text(settings.bedrijf, W - M, M + 7, { align: 'right' });
  }
  y = 62;
  doc.setFillColor(...C.accent);
  doc.rect(M, y, 22, 2.4, 'F');
  y += 11;
  setFont(10, 'bold', C.muted);
  doc.text((opname ? opname.type : 'Alle opnames').toUpperCase(), M, y, { charSpace: 0.5 });
  y += 10;
  setFont(26, 'bold');
  const tl = lines(title, W - 2 * M);
  doc.text(tl, M, y);
  y += tl.length * lh(26);
  setFont(15, 'normal');
  const pl = lines(project.naam, W - 2 * M);
  doc.text(pl, M, y + 1);
  y += pl.length * lh(15) + 9;

  const kv = (rows, labelW = 44) => {
    const width = W - 2 * M;
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.2);
    rows.forEach(([k, v]) => {
      setFont(10, 'normal');
      const vl = lines(v, width - labelW);
      const hRow = vl.length * lh(10) + 3.4;
      ensure(hRow);
      doc.line(M, y, M + width, y);
      setFont(8.5, 'normal', C.muted);
      doc.text(k, M, y + 4.9);
      setFont(10, 'normal');
      doc.text(vl, M + labelW, y + 5);
      y += hRow;
    });
    doc.line(M, y, M + width, y);
    y += 8;
  };
  kv(
    [
      ['Project', project.naam],
      ['Projectnummer', project.nummer],
      ['Adres', [project.adres, project.plaats].filter(Boolean).join(', ')],
      ['Opdrachtgever', project.opdrachtgever],
      ['Aannemer', project.aannemer],
      ['Architect / adviseur', project.architect],
      ['Soort opname', opname?.type || 'Overzicht van alle opnames'],
      [opname ? 'Datum opname' : 'Rapportdatum', fmtDate(opname?.datum || todayISO(), true)],
      ['Opgenomen door', opname?.inspecteur],
      ['Aanwezigen', opname?.aanwezigen],
    ].filter((r) => r[1])
  );

  // Samenvatting
  const cnt = { open: 0, gereed: 0, akkoord: 0 };
  list.forEach((p) => (cnt[p.status] = (cnt[p.status] || 0) + 1));
  ensure(48);
  setFont(12, 'bold');
  doc.text('Samenvatting', M, y);
  y += 5;
  const boxes = [
    ['Totaal punten', list.length, C.ink],
    ['Open', cnt.open, C.open],
    ['Gereed', cnt.gereed, C.gereed],
    ['Akkoord', cnt.akkoord, C.akkoord],
  ];
  const bw = (W - 2 * M - 9) / 4;
  boxes.forEach(([label, n, col], i) => {
    const x = M + i * (bw + 3);
    doc.setFillColor(...C.soft);
    doc.rect(x, y, bw, 20, 'F');
    doc.setFillColor(...col);
    doc.rect(x, y, bw, 1.4, 'F');
    setFont(20, 'bold');
    doc.text(String(n), x + 4, y + 11.5);
    setFont(8.5, 'normal', C.muted);
    doc.text(label, x + 4, y + 17);
  });
  y += 27;

  // Tabel: punten per verantwoordelijke
  const table = (cols, rows, { fontSize = 8.5 } = {}) => {
    const totalW = cols.reduce((s, c) => s + c.w, 0);
    const pad = 1.8;
    const head = () => {
      doc.setFillColor(...C.ink);
      doc.rect(M, y, totalW, 7, 'F');
      setFont(7, 'bold', C.white);
      let x = M;
      cols.forEach((c) => {
        const right = c.align === 'right';
        doc.text(c.label.toUpperCase(), right ? x + c.w - pad : x + pad, y + 4.6, { align: right ? 'right' : 'left', charSpace: 0.2 });
        x += c.w;
      });
      y += 7;
    };
    ensure(16);
    head();
    let zebra = 0;
    rows.forEach((r) => {
      if (r.__group) {
        if (ensure(16)) head();
        doc.setFillColor(...C.accent);
        doc.rect(M, y, totalW, 6.5, 'F');
        setFont(8.5, 'bold', C.ink);
        doc.text(r.__group, M + pad, y + 4.5);
        y += 6.5;
        zebra = 0;
        return;
      }
      const cells = cols.map((c) => {
        setFont(fontSize, c.bold ? 'bold' : 'normal');
        return c.status ? null : lines(c.get(r), c.w - 2 * pad);
      });
      const n = Math.max(1, ...cells.map((l) => (l ? l.length : 1)));
      const hRow = n * lh(fontSize) + 2 * pad + 0.4;
      if (ensure(hRow)) head();
      if (zebra++ % 2) {
        doc.setFillColor(...C.soft);
        doc.rect(M, y, totalW, hRow, 'F');
      }
      let x = M;
      const base = y + pad + fontSize * PT * 0.82;
      cols.forEach((c, ci) => {
        if (c.status) {
          const s = c.get(r);
          doc.setFillColor(...(C[s] || C.muted));
          doc.circle(x + pad + 1.2, base - 1, 1.2, 'F');
          setFont(fontSize, 'normal');
          doc.text(STATUS_LABEL[s] || s, x + pad + 3.8, base);
        } else {
          setFont(fontSize, c.bold ? 'bold' : 'normal');
          const right = c.align === 'right';
          doc.text(cells[ci], right ? x + c.w - pad : x + pad, base, { align: right ? 'right' : 'left' });
        }
        x += c.w;
      });
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.15);
      doc.line(M, y + hRow, M + totalW, y + hRow);
      y += hRow;
    });
    y += 7;
  };

  const perVer = groupPoints(list, 'verantwoordelijke');
  if (list.length) {
    setFont(12, 'bold');
    ensure(30);
    doc.text('Punten per verantwoordelijke', M, y);
    y += 4;
    table(
      [
        { label: 'Verantwoordelijke', w: 92, get: (r) => r.key },
        { label: 'Open', w: 22, align: 'right', get: (r) => String(r.open) },
        { label: 'Gereed', w: 22, align: 'right', get: (r) => String(r.gereed) },
        { label: 'Akkoord', w: 22, align: 'right', get: (r) => String(r.akkoord) },
        { label: 'Totaal', w: 22, align: 'right', bold: true, get: (r) => String(r.items.length) },
      ],
      perVer.map((g) => ({
        ...g,
        open: g.items.filter((p) => p.status === 'open').length,
        gereed: g.items.filter((p) => p.status === 'gereed').length,
        akkoord: g.items.filter((p) => p.status === 'akkoord').length,
      }))
    );
  }
  if (opname?.opmerkingen) {
    ensure(20);
    setFont(12, 'bold');
    doc.text('Algemene opmerkingen', M, y);
    y += 6;
    setFont(10, 'normal');
    lines(opname.opmerkingen, W - 2 * M).forEach((l) => {
      ensure(lh(10));
      doc.text(l, M, y);
      y += lh(10);
    });
    y += 6;
  }

  // ---------- Overzichtslijst ----------
  if (o.overzicht && list.length) {
    addPage();
    heading('Overzicht opleverpunten', `${list.length} punten${o.groep !== 'geen' ? `, gegroepeerd op ${o.groep}` : ''}`);
    const rows = [];
    groups.forEach((g) => {
      if (g.key) rows.push({ __group: `${g.key} (${g.items.length})` });
      rows.push(...g.items);
    });
    table(
      [
        { label: 'Nr.', w: 12, bold: true, get: (p) => String(p.nr) },
        { label: 'Locatie', w: 36, get: location },
        { label: 'Omschrijving', w: 72, get: (p) => p.omschrijving || '–' },
        { label: 'Verantwoordelijke', w: 33, get: (p) => p.verantwoordelijke || '–' },
        { label: 'Status', w: 27, status: true, get: (p) => p.status },
      ],
      rows
    );
  }

  // ---------- Plattegronden ----------
  if (o.plattegronden) {
    const planList = plans.filter((pl) => list.some((p) => p.plattegrondId === pl.id && p.pin));
    for (let i = 0; i < planList.length; i++) {
      const pl = planList[i];
      onProgress(0.82 + (0.08 * i) / planList.length, `Plattegrond ${pl.naam}`);
      const r = await resizeBlob(pl.blob, 2600, 0.85);
      const data = new Uint8Array(await r.blob.arrayBuffer());
      addPage(pl.w > pl.h ? 'l' : 'p');
      heading(`Plattegrond: ${pl.naam}`);
      // legenda
      let lx = M;
      ['open', 'gereed', 'akkoord'].forEach((s) => {
        doc.setFillColor(...C[s]);
        doc.circle(lx + 1.6, y + 0.6, 1.6, 'F');
        setFont(8.5, 'normal', C.muted);
        doc.text(STATUS_LABEL[s], lx + 4.6, y + 1.6);
        lx += 26;
      });
      y += 7;
      const bwP = W - 2 * M;
      const bhP = bottom() - y;
      const s = Math.min(bwP / r.w, bhP / r.h);
      const iw = r.w * s;
      const ih = r.h * s;
      const ix = M + (bwP - iw) / 2;
      const iy = y;
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.3);
      doc.rect(ix, iy, iw, ih);
      doc.addImage(data, 'JPEG', ix, iy, iw, ih, 'plan' + pl.id, 'FAST');
      list
        .filter((p) => p.plattegrondId === pl.id && p.pin)
        .forEach((p) => {
          const px = ix + p.pin.x * iw;
          const py = iy + p.pin.y * ih;
          const rad = p.nr >= 100 ? 3.3 : 2.8;
          doc.setFillColor(...C[p.status]);
          doc.setDrawColor(255, 255, 255);
          doc.setLineWidth(0.5);
          doc.circle(px, py, rad, 'FD');
          setFont(p.nr >= 100 ? 6 : 6.8, 'bold', C.white);
          doc.text(String(p.nr), px, py + 0.85, { align: 'center' });
        });
    }
  }

  // ---------- Opleverpunten met foto's ----------
  if (list.length) {
    addPage();
    heading('Opleverpunten');
  }
  const detailText = (p, x, y0, width, dry) => {
    let yy = y0;
    if (!dry) {
      setFont(15, 'bold');
      doc.text(`#${p.nr}`, x, yy + 5.4);
      pill(p.status, x + width, yy + 0.8);
    }
    yy += 9.5;
    setFont(10.5, 'bold');
    const om = lines(p.omschrijving || '(geen omschrijving)', width);
    if (!dry) doc.text(om, x, yy + 3.6);
    yy += om.length * lh(10.5) + 2.6;
    const labelW = 33;
    for (const [k, v] of fields(p)) {
      setFont(8.5, 'normal');
      const vl = lines(v, width - labelW);
      if (!dry) {
        setFont(6.8, 'bold', C.muted);
        doc.text(k.toUpperCase(), x, yy + 3, { charSpace: 0.15 });
        setFont(8.5, 'normal');
        doc.text(vl, x + labelW, yy + 3.1);
      }
      yy += vl.length * lh(8.5) + 1.4;
    }
    return yy - y0;
  };
  const compactText = (p, x, y0, width, dry) => {
    let yy = y0;
    if (!dry) {
      setFont(11, 'bold');
      doc.text(`#${p.nr}`, x, yy + 4.2);
      pill(p.status, x + width, yy, 7.5);
    }
    yy += 7.5;
    setFont(9.5, 'bold');
    const om = lines(p.omschrijving || '(geen omschrijving)', width);
    if (!dry) doc.text(om, x, yy + 3.2);
    yy += om.length * lh(9.5) + 1.2;
    const meta = [
      location(p),
      p.verantwoordelijke,
      p.categorie,
      PRIO_LABEL[p.prioriteit] ? `prioriteit ${PRIO_LABEL[p.prioriteit].toLowerCase()}` : '',
      p.deadline ? `gereed vóór ${fmtDate(p.deadline)}` : '',
      (p.fotoIds?.length || 0) > 1 ? `${p.fotoIds.length} foto's` : '',
    ]
      .filter(Boolean)
      .join('  ·  ');
    setFont(8, 'normal', C.muted);
    const ml = lines(meta, width);
    if (!dry) doc.text(ml, x, yy + 2.9);
    yy += ml.length * lh(8) + 0.8;
    if (p.opmerking) {
      setFont(8, 'italic', C.ink);
      const ol = lines(p.opmerking, width);
      if (!dry) doc.text(ol, x, yy + 2.9);
      yy += ol.length * lh(8) + 0.8;
    }
    return yy - y0;
  };
  const extras = (ids, x, y0, tw, th, perRow, maxCount) => {
    const show = ids.slice(0, maxCount);
    show.forEach((id, i) => photo(id, x + (i % perRow) * (tw + 3), y0 + Math.floor(i / perRow) * (th + 3), tw, th));
    return show.length ? Math.ceil(show.length / perRow) * (th + 3) : 0;
  };
  const sep = () => {
    doc.setDrawColor(...C.line);
    doc.setLineWidth(0.2);
    doc.line(M, y, W - M, y);
    y += 5;
  };

  for (const g of groups) {
    if (g.key) {
      ensure(12 + { groot: 140, normaal: 72, compact: 40 }[o.fotoFormaat]);
      doc.setFillColor(...C.ink);
      doc.rect(M, y, W - 2 * M, 8, 'F');
      setFont(9.5, 'bold', C.white);
      doc.text(`${g.key}`, M + 3, y + 5.4);
      setFont(8.5, 'normal', C.white);
      doc.text(`${g.items.length} ${g.items.length === 1 ? 'punt' : 'punten'}`, W - M - 3, y + 5.4, { align: 'right' });
      y += 12;
    }
    for (const p of g.items) {
      const ids = p.fotoIds || [];
      if (o.fotoFormaat === 'groot') {
        const textH = detailText(p, M, 0, 88, true);
        const exH = ids.length > 1 ? Math.ceil(Math.min(ids.length - 1, 6) / 3) * 24 : 0;
        const blockH = 108 + Math.max(textH, exH);
        ensure(blockH + 5);
        photo(ids[0], M, y, W - 2 * M, 104);
        detailText(p, M, y + 108, 88, false);
        if (ids.length > 1) extras(ids.slice(1), M + 92, y + 108, 28, 21, 3, 6);
        y += blockH + 2;
      } else if (o.fotoFormaat === 'compact') {
        const tw = W - 2 * M - 49;
        const textH = compactText(p, 0, 0, tw, true);
        const blockH = Math.max(34, textH);
        ensure(blockH + 5);
        photo(ids[0], M, y, 44, 33);
        compactText(p, M + 49, y, tw, false);
        y += blockH + 2;
      } else {
        const tw = W - 2 * M - 94;
        const textH = detailText(p, 0, 0, tw, true);
        const nEx = Math.min(Math.max(0, ids.length - 1), 3);
        const exH = nEx ? 22 : 0;
        const blockH = Math.max(66, textH + exH);
        ensure(blockH + 5);
        photo(ids[0], M, y, 88, 66);
        detailText(p, M + 94, y, tw, false);
        if (nEx) extras(ids.slice(1), M + 94, y + Math.max(textH + 1, 66 - 19.5), 26, 19.5, 3, 3);
        y += blockH + 2;
      }
      sep();
    }
  }
  if (!list.length) {
    ensure(20);
    setFont(10, 'italic', C.muted);
    doc.text('Er zijn geen opleverpunten die aan de gekozen selectie voldoen.', M, y);
    y += 10;
  }

  // ---------- Ondertekening ----------
  if (o.handtekeningen) {
    onProgress(0.95, 'Ondertekening');
    const verklaring = settings.verklaring || '';
    setFont(9.5, 'normal');
    const vl = lines(verklaring, W - 2 * M);
    const need = 26 + vl.length * lh(9.5) + 62;
    if (y + need > bottom()) addPage();
    else y += 4;
    heading('Ondertekening');
    if (vl.length) {
      setFont(9.5, 'normal');
      doc.text(vl, M, y);
      y += vl.length * lh(9.5) + 7;
    }
    const sigs = opname?.handtekeningen || {};
    const colW = (W - 2 * M - 10) / 2;
    [
      ['Namens opdrachtgever', sigs.opdrachtgever, project.opdrachtgever],
      ['Namens aannemer', sigs.aannemer, project.aannemer],
    ].forEach(([label, sig, org], i) => {
      const x = M + i * (colW + 10);
      let yy = y;
      setFont(7, 'bold', C.muted);
      doc.text(label.toUpperCase(), x, yy, { charSpace: 0.3 });
      yy += 5;
      setFont(10, 'bold');
      doc.text(lines(sig?.naam || ' ', colW)[0], x, yy);
      yy += 4.5;
      setFont(8.5, 'normal', C.muted);
      doc.text(lines(org || ' ', colW)[0], x, yy);
      yy += 3;
      doc.setFillColor(...C.soft);
      doc.rect(x, yy, colW, 30, 'F');
      if (sig?.img) {
        try {
          const props = doc.getImageProperties(sig.img);
          const s = Math.min((colW - 8) / props.width, 26 / props.height);
          doc.addImage(sig.img, 'PNG', x + 4, yy + 2 + (26 - props.height * s) / 2, props.width * s, props.height * s);
        } catch {
          /* handtekening overslaan */
        }
      }
      doc.setDrawColor(...C.ink);
      doc.setLineWidth(0.3);
      doc.line(x, yy + 30, x + colW, yy + 30);
      setFont(8.5, 'normal', C.muted);
      doc.text(`Datum: ${fmtDate(opname?.datum || todayISO(), true)}`, x, yy + 35);
    });
    y += 60;
  }

  // ---------- Kop- en voetteksten ----------
  const n = doc.getNumberOfPages();
  const foot = [settings.bedrijf, settings.voettekst].filter(Boolean).join('  ·  ') || 'Opleverrapport';
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    const pw = doc.internal.pageSize.getWidth();
    const ph = doc.internal.pageSize.getHeight();
    doc.setFillColor(...C.accent);
    doc.rect(0, 0, pw, 2.2, 'F');
    if (i > 1) {
      setFont(8, 'bold');
      doc.text(lines(project.naam, pw / 2 - M)[0], M, M + 1);
      setFont(8, 'normal', C.muted);
      doc.text(lines(`${title}${opname ? ' · ' + fmtDate(opname.datum) : ''}`, pw / 2 - M)[0], pw - M, M + 1, { align: 'right' });
      doc.setDrawColor(...C.line);
      doc.setLineWidth(0.3);
      doc.line(M, M + 3.5, pw - M, M + 3.5);
    }
    setFont(7.5, 'normal', C.muted);
    doc.text(lines(foot, pw - 2 * M - 30)[0], M, ph - M + 4);
    doc.text(`Pagina ${i} van ${n}`, pw - M, ph - M + 4, { align: 'right' });
  }
  onProgress(1, 'Klaar');
  return { blob: doc.output('blob'), pages: n, count: list.length };
}

export function buildCSV(project, opnames, punten) {
  const byId = new Map(opnames.map((o) => [o.id, o]));
  const head = ['Nr', 'Omschrijving', 'Bouwlaag', 'Ruimte', 'Verantwoordelijke', 'Categorie', 'Prioriteit', 'Status', 'Gereed vóór', 'Opname', 'Datum opname', 'Vastgelegd op', 'Opmerking', "Aantal foto's"];
  const q = (v) => {
    const s = String(v ?? '');
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const rows = punten
    .slice()
    .sort((a, b) => a.nr - b.nr)
    .map((p) => {
      const o = byId.get(p.opnameId);
      return [
        p.nr,
        p.omschrijving,
        p.bouwlaag,
        p.ruimte,
        p.verantwoordelijke,
        p.categorie,
        PRIO_LABEL[p.prioriteit] || '',
        STATUS_LABEL[p.status] || p.status,
        p.deadline || '',
        o?.type || '',
        o?.datum || '',
        p.created ? new Date(p.created).toLocaleString('nl-NL') : '',
        p.opmerking,
        p.fotoIds?.length || 0,
      ];
    });
  const text = '﻿' + [head, ...rows].map((r) => r.map(q).join(';')).join('\r\n');
  return new Blob([text], { type: 'text/csv;charset=utf-8' });
}
