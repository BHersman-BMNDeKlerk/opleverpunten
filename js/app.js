// Opleverpunten: projecten, opnames, opleverpunten met foto's en verslagen.
import * as db from './db.js';
import {
  $, $$, esc, uid, nlSort, todayISO, fmtDate, fmtSize, icon, toast, ask, promptText, chooseSheet, busy,
  handlePop, whenHistorySettled, setHistoryEnabled,
} from './ui.js';
import { makePhoto, resizeBlob, blobToDataURL, dataURLToBlob, pdfToImages, renderPdfPages } from './images.js';
import { annotate, signaturePad, pickPin, mountPlan } from './draw.js';
import { buildReport, buildCSV, selectPoints, opnameLabel } from './report.js';
import {
  STATUSES, STATUS_LABEL, STATUS_UITLEG, OPNAME_TYPES, RAPPORT_TITELS, CATEGORIEEN, PRIORITEITEN, PRIO_LABEL, DEFAULT_SETTINGS,
} from './constants.js';

const app = document.getElementById('app');
const camInput = document.getElementById('camInput');
const galInput = document.getElementById('galInput');

// ---------- Instellingen ----------
let settingsCache;
async function getSettings() {
  if (!settingsCache) {
    const s = await db.get('instellingen', 'app');
    settingsCache = { ...DEFAULT_SETTINGS, ...(s || {}), id: 'app' };
  }
  return settingsCache;
}
async function saveSettings(s) {
  settingsCache = s;
  await db.put('instellingen', s);
}

// ---------- Object-URL's per scherm ----------
let curUrls = [];
const objURL = (blob) => {
  if (!blob) return '';
  const u = URL.createObjectURL(blob);
  curUrls.push(u);
  return u;
};

// ---------- Navigatie ----------
const stack = [{ name: 'home', params: {} }];
let histOK = true;
try {
  history.replaceState({ depth: 1 }, '');
} catch {
  histOK = false;
}
setHistoryEnabled(histOK);

async function go(name, params = {}) {
  await whenHistorySettled();
  stack[stack.length - 1].scroll = window.scrollY;
  stack.push({ name, params });
  if (histOK) {
    try {
      history.pushState({ depth: stack.length }, '');
    } catch {
      histOK = false;
      setHistoryEnabled(false);
    }
  }
  render(true);
}
function back() {
  if (stack.length <= 1) return;
  if (histOK) history.back();
  else {
    stack.pop();
    render();
  }
}
function replace(name, params = {}) {
  stack[stack.length - 1] = { name, params };
  render(true);
}
window.addEventListener('popstate', () => {
  if (handlePop()) return;
  if (stack.length > 1) {
    stack.pop();
    render();
  }
});

let renderSeq = 0;
async function render(toTop = false) {
  const seq = ++renderSeq;
  const entry = stack[stack.length - 1];
  const prevUrls = curUrls;
  curUrls = [];
  try {
    const mount = await VIEWS[entry.name](entry.params, entry);
    if (seq !== renderSeq) return;
    app.onclick = app.oninput = app.onchange = app.onsubmit = null;
    mount();
    window.scrollTo(0, toTop ? 0 : entry.scroll || 0);
  } catch (err) {
    console.error(err);
    if (seq !== renderSeq) return;
    app.innerHTML =
      topbar({ title: 'Er ging iets mis' }) +
      `<main class="wrap"><div class="empty"><h2>Dit scherm kon niet worden geladen</h2><p>${esc(err.message)}</p>
      <button class="btn primary" data-act="home">Naar projecten</button></div></main>`;
    bind({ home: () => location.reload() });
  } finally {
    prevUrls.forEach((u) => URL.revokeObjectURL(u));
  }
}

function bind(map) {
  app.onclick = (e) => {
    const t = e.target.closest('[data-act]');
    if (!t || !app.contains(t)) return;
    const act = t.dataset.act;
    const fn = act === 'back' ? back : map[act];
    if (!fn) return;
    Promise.resolve()
      .then(() => fn(t, e))
      .catch((err) => {
        console.error(err);
        toast(err.message || 'Er ging iets mis', 'error');
      });
  };
}

// ---------- Gedeelde onderdelen ----------
function topbar({ title, eyebrow = '', showBack = stack.length > 1, actions = '' }) {
  return `<header class="topbar"><div class="wrap topbar-in">
    ${
      showBack
        ? `<button class="iconbtn" data-act="back" aria-label="Terug">${icon('back')}</button>`
        : `<span class="brand" aria-hidden="true">${icon('mark')}</span>`
    }
    <div class="tb-title">${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1></div>
    <div class="tb-actions">${actions}</div>
  </div><div class="tape" aria-hidden="true"></div></header>`;
}

const counts = (pts) => {
  const c = { open: 0, gereed: 0, akkoord: 0, total: pts.length };
  pts.forEach((p) => (c[p.status] = (c[p.status] || 0) + 1));
  return c;
};
const statusBar = (c) =>
  c.total
    ? `<div class="sbar" role="img" aria-label="${c.open} open, ${c.gereed} gereed, ${c.akkoord} akkoord">
        ${c.open ? `<span class="b-open" style="flex:${c.open}"></span>` : ''}
        ${c.gereed ? `<span class="b-gereed" style="flex:${c.gereed}"></span>` : ''}
        ${c.akkoord ? `<span class="b-akkoord" style="flex:${c.akkoord}"></span>` : ''}</div>`
    : `<div class="sbar"></div>`;
const legend = (c) =>
  `<div class="legend"><span><i class="b-open"></i>${c.open} open</span><span><i class="b-gereed"></i>${c.gereed} gereed</span><span><i class="b-akkoord"></i>${c.akkoord} akkoord</span></div>`;
const pill = (s) => `<span class="pill st-${s}">${STATUS_LABEL[s]}</span>`;
const byDateDesc = (a, b) => (b.datum || '').localeCompare(a.datum || '') || (b.created || 0) - (a.created || 0);

const datalist = (id, values) =>
  `<datalist id="${id}-list">${values.map((v) => `<option value="${esc(v)}"></option>`).join('')}</datalist>`;
const fInput = (id, label, value = '', { type = 'text', list = null, attrs = '' } = {}) =>
  `<label class="field"><span>${label}</span><input id="${id}" type="${type}" value="${esc(value)}" ${list ? `list="${id}-list"` : ''} ${attrs} autocomplete="off">${list ? datalist(id, list) : ''}</label>`;
const fText = (id, label, value = '', rows = 3, attrs = '') =>
  `<label class="field"><span>${label}</span><textarea id="${id}" rows="${rows}" ${attrs}>${esc(value)}</textarea></label>`;
const fSelect = (id, label, options, value) =>
  `<label class="field"><span>${label}</span><select id="${id}">${options
    .map((o) => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${v === value ? 'selected' : ''}>${esc(l)}</option>`;
    })
    .join('')}</select></label>`;
const seg = (name, options, value) =>
  `<div class="seg seg-${name}" role="group" aria-label="${name}">${options
    .map(
      ([v, l]) =>
        `<button type="button" class="${v === value ? 'on' : ''} sv-${v}" data-act="seg" data-name="${name}" data-v="${v}" aria-pressed="${v === value}">${l}</button>`
    )
    .join('')}</div>`;
const val = (id) => (app.querySelector('#' + id)?.value ?? '').trim();

function download(blob, name) {
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 60000);
}
const safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim();

function pickPhotos(kind) {
  const input = kind === 'camera' ? camInput : galInput;
  input.value = '';
  return new Promise((resolve) => {
    input.onchange = () => {
      const files = [...input.files].filter((f) => !f.type || f.type.startsWith('image/'));
      if (files.length) resolve(files);
    };
    input.click();
  });
}

async function ensureActiveOpname(projectId) {
  const project = await db.get('projecten', projectId);
  const actief = await db.get('opnames', project.actieveOpnameId);
  if (actief) return actief.id;
  const s = await getSettings();
  const o = {
    id: uid(),
    projectId,
    type: 'Tussentijdse opname',
    datum: todayISO(),
    inspecteur: s.inspecteur || '',
    aanwezigen: '',
    opmerkingen: '',
    handtekeningen: { opdrachtgever: { naam: '', img: null }, aannemer: { naam: '', img: null } },
    created: Date.now(),
  };
  project.actieveOpnameId = o.id;
  await db.put('opnames', o);
  await db.put('projecten', project);
  toast(`Opname aangemaakt: ${o.type}, ${fmtDate(o.datum)}`);
  return o.id;
}

async function startNewPoint(projectId, files) {
  const b = files.length ? busy(files.length > 1 ? `${files.length} foto's verwerken…` : 'Foto verwerken…') : null;
  try {
    const fotos = [];
    for (const f of files) fotos.push({ id: uid(), projectId, ...(await makePhoto(f)), isNew: true });
    const opnameId = await ensureActiveOpname(projectId);
    const project = await db.get('projecten', projectId);
    const last = project.laatste || {};
    const punt = {
      id: uid(),
      projectId,
      opnameId,
      nr: null,
      omschrijving: '',
      bouwlaag: last.bouwlaag || '',
      ruimte: last.ruimte || '',
      verantwoordelijke: '',
      categorie: 'Beschadiging',
      prioriteit: 'normaal',
      status: 'open',
      deadline: '',
      opmerking: '',
      fotoIds: [],
      plattegrondId: last.plattegrondId || null,
      pin: null,
    };
    b?.close();
    await go('punt', { projectId, state: { punt, fotos, removed: [], isNew: true, sel: 0, origStatus: 'open' } });
  } catch (err) {
    b?.close();
    throw err;
  }
}

// =====================================================================
// Projectenoverzicht
// =====================================================================
async function viewHome() {
  const [projecten, punten, opnames] = await Promise.all([db.all('projecten'), db.all('punten'), db.all('opnames')]);
  projecten.sort((a, b) => (b.updated || b.created || 0) - (a.updated || a.created || 0));
  return () => {
    app.innerHTML =
      topbar({
        title: 'Projecten',
        eyebrow: 'Opleverpunten',
        showBack: false,
        actions: `<button class="btn ghost" data-act="settings">${icon('gear')}<span class="lbl">Instellingen</span></button>
          <button class="btn primary" data-act="nieuw">${icon('plus')}<span>Nieuw project</span></button>`,
      }) +
      `<main class="wrap">${
        projecten.length
          ? `<div class="pgrid">${projecten
              .map((p) => {
                const pts = punten.filter((x) => x.projectId === p.id);
                const c = counts(pts);
                const last = opnames.filter((o) => o.projectId === p.id).sort(byDateDesc)[0];
                return `<article class="pcard" data-act="open" data-id="${p.id}" tabindex="0" role="button" aria-label="Open ${esc(p.naam)}">
                  <div class="pcard-top"><span class="mono">${esc(p.nummer || '—')}</span><span>${esc(p.plaats || '')}</span></div>
                  <h2>${esc(p.naam)}</h2>
                  <p class="muted">${esc(p.opdrachtgever || 'Geen opdrachtgever ingevuld')}</p>
                  ${statusBar(c)}
                  <div class="pcard-foot">${legend(c)}</div>
                  <div class="pcard-last">${last ? `Laatste opname: <b>${esc(last.type)}</b>, ${fmtDate(last.datum)}` : 'Nog geen opname'}</div>
                </article>`;
              })
              .join('')}</div>`
          : `<div class="empty">${icon('clipboard', 'big')}<h2>Nog geen projecten</h2>
              <p>Maak een project aan voor het gebouw dat je gaat opnemen. Daarna loop je rond en leg je elk opleverpunt vast met een foto.</p>
              <div class="row-actions"><button class="btn primary big" data-act="nieuw">${icon('plus')}<span>Nieuw project</span></button>
              <button class="btn" data-act="sample">Voorbeeldproject laden</button></div></div>`
      }</main>`;
    bind({
      settings: () => go('instellingen'),
      nieuw: () => go('projectForm', {}),
      open: (t) => go('project', { id: t.dataset.id, tab: 'punten' }),
      sample: loadSample,
    });
    app.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.classList?.contains('pcard')) e.target.click();
    };
  };
}

async function loadSample() {
  const b = busy('Voorbeeldproject klaarzetten…');
  try {
    const { seedSample } = await import('./sample.js');
    await seedSample((await getSettings()).inspecteur);
    toast('Voorbeeldproject geladen');
  } finally {
    b.close();
  }
  render();
}

// =====================================================================
// Project aanmaken / wijzigen
// =====================================================================
async function viewProjectForm(params) {
  const p = params.id ? await db.get('projecten', params.id) : {};
  const all = await db.all('projecten');
  const uniq = (k) => [...new Set(all.map((x) => x[k]).filter(Boolean))].sort(nlSort);
  return () => {
    app.innerHTML =
      topbar({ title: params.id ? 'Projectgegevens wijzigen' : 'Nieuw project', eyebrow: params.id ? esc(p.naam) : 'Project' }) +
      `<main class="wrap narrow"><form class="form panel" id="pform">
        ${fInput('naam', 'Projectnaam *', p.naam, { attrs: 'required placeholder="Bijv. Kantoorgebouw De Werf"' })}
        <div class="grid2">${fInput('nummer', 'Projectnummer', p.nummer, { attrs: 'placeholder="Bijv. 2026-014"' })}
        ${fInput('plaats', 'Plaats', p.plaats, { list: uniq('plaats') })}</div>
        ${fInput('adres', 'Adres', p.adres)}
        <div class="grid2">${fInput('opdrachtgever', 'Opdrachtgever', p.opdrachtgever, { list: uniq('opdrachtgever') })}
        ${fInput('aannemer', 'Aannemer', p.aannemer, { list: uniq('aannemer') })}</div>
        ${fInput('architect', 'Architect / adviseur', p.architect, { list: uniq('architect') })}
        ${fText('omschrijving', 'Omschrijving van het werk', p.omschrijving, 3)}
        <div class="row-actions end"><button type="button" class="btn ghost" data-act="back">Annuleren</button>
        <button class="btn primary big" type="submit">${icon('check')}<span>${params.id ? 'Opslaan' : 'Project aanmaken'}</span></button></div>
      </form></main>`;
    bind({});
    $('#pform').onsubmit = async (e) => {
      e.preventDefault();
      const data = {};
      ['naam', 'nummer', 'plaats', 'adres', 'opdrachtgever', 'aannemer', 'architect', 'omschrijving'].forEach((k) => (data[k] = val(k)));
      if (!data.naam) return toast('Vul een projectnaam in', 'warn');
      const now = Date.now();
      if (params.id) {
        await db.put('projecten', { ...p, ...data, updated: now });
        toast('Projectgegevens opgeslagen');
        back();
      } else {
        const np = { id: uid(), ...data, created: now, updated: now, volgnr: 0, actieveOpnameId: null };
        await db.put('projecten', np);
        toast('Project aangemaakt');
        replace('project', { id: np.id, tab: 'punten' });
      }
    };
  };
}

// =====================================================================
// Project (punten, opnames, plattegronden, gegevens)
// =====================================================================
async function viewProject(params) {
  const project = await db.get('projecten', params.id);
  if (!project) throw new Error('Dit project bestaat niet meer.');
  const [opnames, punten, fotos, plans] = await Promise.all([
    db.byProject('opnames', project.id),
    db.byProject('punten', project.id),
    db.byProject('fotos', project.id),
    db.byProject('plattegronden', project.id),
  ]);
  opnames.sort(byDateDesc);
  const fotoMap = new Map(fotos.map((f) => [f.id, f]));
  const opById = new Map(opnames.map((o) => [o.id, o]));
  const actief = opById.get(project.actieveOpnameId) || null;
  const tab = params.tab || 'punten';
  const c = counts(punten);
  const F = (params.filter ||= { q: '', status: 'alle', opname: '', ver: '', laag: '', sort: 'nieuw' });
  const distinct = (k) => [...new Set(punten.map((p) => p[k]).filter(Boolean))].sort(nlSort);
  const thumbUrls = new Map();
  const thumb = (p) => {
    const f = fotoMap.get(p.fotoIds?.[0]);
    if (!f) return '';
    if (!thumbUrls.has(f.id)) thumbUrls.set(f.id, objURL(f.thumb));
    return thumbUrls.get(f.id);
  };

  const tabs = [
    ['punten', 'Punten', punten.length],
    ['opnames', 'Opnames', opnames.length],
    ['plattegronden', 'Plattegronden', plans.length],
    ['gegevens', 'Gegevens', null],
  ];

  function bodyPunten() {
    const fcount = (s) => (s === 'alle' ? punten.length : c[s]);
    return `<div class="filters">
        <label class="search">${icon('search')}<input id="q" type="search" placeholder="Zoek op nummer, omschrijving of ruimte" value="${esc(F.q)}" aria-label="Zoeken"></label>
        <div class="seg seg-filter" role="group" aria-label="Status">${[['alle', 'Alle'], ...STATUSES]
          .map(([v, l]) => `<button class="${F.status === v ? 'on' : ''}" data-act="fstatus" data-s="${v}">${l} <b>${fcount(v)}</b></button>`)
          .join('')}</div>
      </div>
      <div class="filters">
        <select id="fop" class="sel" aria-label="Opname"><option value="">Alle opnames</option>${opnames
          .map((o) => `<option value="${o.id}" ${F.opname === o.id ? 'selected' : ''}>${esc(opnameLabel(o))}</option>`)
          .join('')}</select>
        <select id="flaag" class="sel" aria-label="Bouwlaag"><option value="">Alle bouwlagen</option>${distinct('bouwlaag')
          .map((v) => `<option ${F.laag === v ? 'selected' : ''}>${esc(v)}</option>`)
          .join('')}</select>
        <select id="fver" class="sel" aria-label="Verantwoordelijke"><option value="">Alle verantwoordelijken</option>${distinct('verantwoordelijke')
          .map((v) => `<option ${F.ver === v ? 'selected' : ''}>${esc(v)}</option>`)
          .join('')}</select>
        <select id="fsort" class="sel" aria-label="Sortering">${[
          ['nieuw', 'Nieuwste eerst'],
          ['nr', 'Op nummer'],
          ['locatie', 'Op locatie'],
        ]
          .map(([v, l]) => `<option value="${v}" ${F.sort === v ? 'selected' : ''}>${l}</option>`)
          .join('')}</select>
      </div>
      <div id="plist" class="plist"></div>`;
  }

  function renderList() {
    const q = F.q.toLowerCase();
    let list = punten.filter(
      (p) =>
        (F.status === 'alle' || p.status === F.status) &&
        (!F.opname || p.opnameId === F.opname) &&
        (!F.laag || p.bouwlaag === F.laag) &&
        (!F.ver || p.verantwoordelijke === F.ver) &&
        (!q || [`#${p.nr}`, String(p.nr), p.omschrijving, p.ruimte, p.bouwlaag, p.verantwoordelijke, p.opmerking].some((v) => String(v || '').toLowerCase().includes(q)))
    );
    if (F.sort === 'nr') list.sort((a, b) => a.nr - b.nr);
    else if (F.sort === 'locatie') list.sort((a, b) => nlSort(`${a.bouwlaag}|${a.ruimte}`, `${b.bouwlaag}|${b.ruimte}`) || a.nr - b.nr);
    else list.sort((a, b) => b.nr - a.nr);
    const el = $('#plist');
    if (!punten.length) {
      el.innerHTML = `<div class="empty">${icon('camera', 'big')}<h2>Nog geen opleverpunten</h2>
        <p>Loop door het gebouw en tik op <b>Foto maken</b> zodra je een opleverpunt ziet. Na de foto vul je de omschrijving en locatie in.</p></div>`;
      return;
    }
    if (!list.length) {
      el.innerHTML = `<div class="empty small"><p>Geen punten gevonden met deze filters.</p><button class="btn" data-act="freset">Filters wissen</button></div>`;
      return;
    }
    el.innerHTML = list
      .map((p) => {
        const t = thumb(p);
        const loc = [p.bouwlaag, p.ruimte].filter(Boolean).join(' · ');
        return `<div class="prow" data-act="punt" data-id="${p.id}">
          <div class="thumb">${t ? `<img src="${t}" alt="" loading="lazy">` : icon('image')}${p.fotoIds?.length > 1 ? `<span class="thumb-n">${p.fotoIds.length}</span>` : ''}</div>
          <div class="pbody">
            <div class="pline"><span class="nr">#${p.nr}</span>${p.prioriteit === 'hoog' ? '<span class="prio">Hoog</span>' : ''}${p.pin ? `<span class="pinmark" title="Op plattegrond">${icon('pin')}</span>` : ''}</div>
            <div class="pdesc">${esc(p.omschrijving || 'Geen omschrijving')}</div>
            <div class="pmeta">${esc(loc || 'Geen locatie')}${p.verantwoordelijke ? ` · <b>${esc(p.verantwoordelijke)}</b>` : ''}${p.deadline ? ` · gereed vóór ${fmtDate(p.deadline)}` : ''}</div>
          </div>
          <label class="selwrap st-${p.status}"><span class="sr">Status van punt ${p.nr}</span><select class="status-sel" data-id="${p.id}">${STATUSES.map(
            ([v, l]) => `<option value="${v}" ${p.status === v ? 'selected' : ''}>${l}</option>`
          ).join('')}</select></label>
        </div>`;
      })
      .join('');
  }

  function bodyOpnames() {
    return `<div class="section-head"><p class="muted">Nieuwe punten worden vastgelegd in de actieve opname. Maak per rondgang een opname aan, zoals een tussentijdse opname of de eindopname.</p>
      <button class="btn primary" data-act="opNieuw">${icon('plus')}<span>Nieuwe opname</span></button></div>
      ${
        opnames.length
          ? `<div class="ogrid">${opnames
              .map((o) => {
                const pc = counts(punten.filter((p) => p.opnameId === o.id));
                const hs = o.handtekeningen || {};
                const signed = ['opdrachtgever', 'aannemer'].filter((k) => hs[k]?.img).length;
                const isAct = o.id === project.actieveOpnameId;
                return `<article class="ocard ${isAct ? 'is-active' : ''}">
                  <div class="ocard-head"><div><div class="eyebrow">${fmtDate(o.datum, true)}</div><h3>${esc(o.type)}</h3></div>${isAct ? '<span class="badge">Actief</span>' : ''}</div>
                  <p class="muted">${o.inspecteur ? `Opgenomen door ${esc(o.inspecteur)}` : 'Opnemer niet ingevuld'}</p>
                  ${statusBar(pc)}
                  <div class="ocard-meta"><span>${pc.total} ${pc.total === 1 ? 'punt' : 'punten'} vastgelegd</span><span>${icon('sign')} ${signed}/2 getekend</span></div>
                  <div class="row-actions">
                    ${isAct ? '' : `<button class="btn small" data-act="opActief" data-id="${o.id}">Actief maken</button>`}
                    <button class="btn small" data-act="opEdit" data-id="${o.id}">${icon('edit')}<span>Bewerken</span></button>
                    <button class="btn small primary" data-act="opVerslag" data-id="${o.id}">${icon('file')}<span>Verslag</span></button>
                  </div>
                </article>`;
              })
              .join('')}</div>`
          : `<div class="empty small"><p>Nog geen opnames. Bij het eerste punt wordt automatisch een tussentijdse opname aangemaakt.</p></div>`
      }`;
  }

  function bodyPlans() {
    const pinCount = (id) => punten.filter((p) => p.plattegrondId === id && p.pin).length;
    return `<div class="section-head"><p class="muted">Voeg tekeningen toe als foto, afbeelding of PDF. Daarna kun je elk opleverpunt op de plattegrond prikken; de markeringen komen ook in het verslag.</p>
      <label class="btn primary">${icon('upload')}<span>Plattegrond toevoegen</span><input type="file" id="planInput" accept="image/*,application/pdf,.pdf" multiple hidden></label></div>
      ${
        plans.length
          ? `<div class="plgrid">${plans
              .sort((a, b) => nlSort(a.naam, b.naam))
              .map(
                (pl) => `<button class="plcard" data-act="planOpen" data-id="${pl.id}">
                  <span class="plimg"><img src="${objURL(pl.thumb || pl.blob)}" alt="" loading="lazy"></span>
                  <span class="pltxt"><b>${esc(pl.naam)}</b><span>${pinCount(pl.id)} ${pinCount(pl.id) === 1 ? 'punt' : 'punten'} gemarkeerd</span></span></button>`
              )
              .join('')}</div>`
          : `<div class="empty small">${icon('plan', 'big')}<p>Nog geen plattegronden toegevoegd.</p></div>`
      }`;
  }

  function bodyGegevens() {
    const rows = [
      ['Projectnummer', project.nummer],
      ['Adres', [project.adres, project.plaats].filter(Boolean).join(', ')],
      ['Opdrachtgever', project.opdrachtgever],
      ['Aannemer', project.aannemer],
      ['Architect / adviseur', project.architect],
      ['Omschrijving', project.omschrijving],
      ['Aangemaakt', fmtDate(project.created, true)],
    ];
    return `<div class="twocol"><section class="panel"><div class="panel-head"><h2 class="h2">Projectgegevens</h2>
        <button class="btn small" data-act="projEdit">${icon('edit')}<span>Wijzigen</span></button></div>
        <dl class="kv">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v ? esc(v) : '<span class="muted">—</span>'}</dd>`).join('')}</dl></section>
      <section class="panel"><h2 class="h2">Exporteren</h2>
        <div class="stack">
          <button class="btn" data-act="csv">${icon('table')}<span>Puntenlijst als CSV (Excel)</span></button>
          <button class="btn" data-act="backup">${icon('download')}<span>Backup van dit project</span></button>
          <p class="muted small">De backup bevat alle opnames, punten, foto's en plattegronden. Terugzetten kan via Instellingen, ook op een ander apparaat.</p>
          <hr><button class="btn danger" data-act="projDel">${icon('trash')}<span>Project verwijderen</span></button>
        </div></section></div>`;
  }

  return () => {
    const body = { punten: bodyPunten, opnames: bodyOpnames, plattegronden: bodyPlans, gegevens: bodyGegevens }[tab]();
    app.innerHTML =
      topbar({
        eyebrow: esc([project.nummer, project.plaats].filter(Boolean).join(' · ') || 'Project'),
        title: esc(project.naam),
        actions: `<button class="btn" data-act="verslag">${icon('file')}<span class="lbl">Verslag maken</span></button>`,
      }) +
      `<div class="subbar"><div class="wrap subbar-in">
        <nav class="tabs" role="tablist">${tabs
          .map(([k, l, n]) => `<button class="tab ${tab === k ? 'on' : ''}" role="tab" aria-selected="${tab === k}" data-act="tab" data-tab="${k}">${l}${n != null ? `<b>${n}</b>` : ''}</button>`)
          .join('')}</nav>
        <button class="opname-chip" data-act="opKies" aria-label="Actieve opname kiezen">
          <span class="dot ${actief ? 'on' : ''}"></span><span><small>Actieve opname</small>${actief ? esc(opnameLabel(actief)) : 'Nog geen opname'}</span>${icon('chevron')}</button>
      </div></div>
      <main class="wrap ${tab === 'punten' ? 'has-capbar' : ''}">${body}</main>
      ${
        tab === 'punten'
          ? `<div class="capbar"><div class="wrap capbar-in">
              <div class="capbar-stats">${legend(c)}</div>
              <button class="btn" data-act="zonder">${icon('plus')}<span class="lbl">Zonder foto</span></button>
              <button class="btn" data-act="galerij">${icon('image')}<span class="lbl">Uit galerij</span></button>
              <button class="btn primary big" data-act="foto">${icon('camera')}<span>Foto maken</span></button>
            </div></div>`
          : ''
      }`;

    bind({
      tab: (t) => {
        params.tab = t.dataset.tab;
        render(true);
      },
      verslag: () => go('verslag', { projectId: project.id, opnameId: actief?.id || '' }),
      opKies: async () => {
        const v = await chooseSheet(
          'Actieve opname',
          opnames.map((o) => ({ value: o.id, label: o.type, sub: `${fmtDate(o.datum, true)}${o.inspecteur ? ' · ' + o.inspecteur : ''}`, active: o.id === project.actieveOpnameId })),
          { label: 'Nieuwe opname', value: '__new' }
        );
        if (v === '__new') return go('opname', { projectId: project.id });
        if (v) {
          project.actieveOpnameId = v;
          await db.put('projecten', project);
          render();
        }
      },
      foto: () => pickPhotos('camera').then((files) => startNewPoint(project.id, files)),
      galerij: () => pickPhotos('galerij').then((files) => startNewPoint(project.id, files)),
      zonder: () => startNewPoint(project.id, []),
      punt: (t, e) => {
        if (e.target.closest('.selwrap')) return;
        go('punt', { projectId: project.id, id: t.dataset.id });
      },
      fstatus: (t) => {
        F.status = t.dataset.s;
        $$('.seg-filter button').forEach((b) => b.classList.toggle('on', b === t));
        renderList();
      },
      freset: () => {
        Object.assign(F, { q: '', status: 'alle', opname: '', ver: '', laag: '' });
        render();
      },
      opNieuw: () => go('opname', { projectId: project.id }),
      opEdit: (t) => go('opname', { projectId: project.id, id: t.dataset.id }),
      opVerslag: (t) => go('verslag', { projectId: project.id, opnameId: t.dataset.id }),
      opActief: async (t) => {
        project.actieveOpnameId = t.dataset.id;
        await db.put('projecten', project);
        toast('Actieve opname gewijzigd');
        render();
      },
      planOpen: (t) => go('plattegrond', { projectId: project.id, id: t.dataset.id }),
      projEdit: () => go('projectForm', { id: project.id }),
      csv: () => {
        download(buildCSV(project, opnames, punten), safeName(`Opleverpunten ${project.nummer || ''} ${project.naam}.csv`));
      },
      backup: () => exportBackup([project.id], safeName(`Backup ${project.nummer || ''} ${project.naam} ${todayISO()}.json`)),
      projDel: async () => {
        const ok = await ask({
          title: 'Project verwijderen?',
          message: `"${project.naam}" wordt met alle ${punten.length} punten, foto's en plattegronden van dit apparaat verwijderd. Dit kan niet ongedaan worden gemaakt. Maak eventueel eerst een backup.`,
          ok: 'Verwijderen',
          danger: true,
        });
        if (!ok) return;
        await db.delProject(project.id);
        toast('Project verwijderd');
        back();
      },
    });

    if (tab === 'punten') {
      renderList();
      app.oninput = (e) => {
        if (e.target.id === 'q') {
          F.q = e.target.value;
          renderList();
        }
      };
      app.onchange = async (e) => {
        const t = e.target;
        if (t.classList.contains('status-sel')) {
          const p = punten.find((x) => x.id === t.dataset.id);
          p.status = t.value;
          p.statusDatum = p.updated = Date.now();
          await db.put('punten', p);
          t.parentElement.className = `selwrap st-${p.status}`;
          Object.assign(c, counts(punten));
          $('.capbar-stats').innerHTML = legend(c);
          $$('.seg-filter button').forEach((b) => (b.querySelector('b').textContent = b.dataset.s === 'alle' ? punten.length : c[b.dataset.s]));
          toast(`Punt #${p.nr}: ${STATUS_LABEL[p.status]}`);
          return;
        }
        const map = { fop: 'opname', flaag: 'laag', fver: 'ver', fsort: 'sort' };
        if (map[t.id]) {
          F[map[t.id]] = t.value;
          renderList();
        }
      };
    }
    if (tab === 'plattegronden') {
      $('#planInput').onchange = async (e) => {
        const files = [...e.target.files];
        e.target.value = '';
        if (files.length) await addPlans(project.id, files);
        render();
      };
    }
  };
}

async function addPlans(projectId, files) {
  const b = busy('Plattegrond inlezen…');
  let n = 0;
  try {
    for (const file of files) {
      const base = file.name.replace(/\.[^.]+$/, '');
      const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
      const pages = isPdf ? await pdfToImages(file) : [{ ...(await resizeBlob(file, 3000, 0.88)), page: 1, pages: 1 }];
      for (const pg of pages) {
        b.set(`Plattegrond inlezen: ${base}${pg.pages > 1 ? ` (blad ${pg.page})` : ''}`);
        const thumb = (await resizeBlob(pg.blob, 640, 0.75)).blob;
        await db.put('plattegronden', {
          id: uid(),
          projectId,
          naam: pg.pages > 1 ? `${base} – blad ${pg.page}` : base,
          blob: pg.blob,
          thumb,
          w: pg.w,
          h: pg.h,
          created: Date.now(),
        });
        n++;
      }
    }
    toast(n === 1 ? 'Plattegrond toegevoegd' : `${n} plattegronden toegevoegd`);
  } catch (err) {
    console.error(err);
    toast(`Plattegrond kon niet worden ingelezen: ${err.message}`, 'error');
  } finally {
    b.close();
  }
}

// =====================================================================
// Opleverpunt vastleggen / bewerken
// =====================================================================
async function viewPunt(params) {
  const project = await db.get('projecten', params.projectId);
  const [opnames, alle, plans, s] = await Promise.all([
    db.byProject('opnames', project.id),
    db.byProject('punten', project.id),
    db.byProject('plattegronden', project.id),
    getSettings(),
  ]);
  if (!params.state) {
    const punt = await db.get('punten', params.id);
    if (!punt) throw new Error('Dit punt bestaat niet meer.');
    const fotos = (await Promise.all((punt.fotoIds || []).map((id) => db.get('fotos', id)))).filter(Boolean);
    params.state = { punt: structuredClone(punt), fotos, removed: [], isNew: false, sel: 0, origStatus: punt.status };
  }
  const st = params.state;
  const p = st.punt;
  opnames.sort(byDateDesc);
  const distinct = (k) => [...new Set(alle.map((x) => x[k]).filter(Boolean))].sort(nlSort);
  const verList = [...new Set([...distinct('verantwoordelijke'), ...s.verantwoordelijken])];
  const urlCache = new Map();
  const furl = (f, which) => {
    const k = `${f.id}|${which}|${f.rev || 0}`;
    if (!urlCache.has(k)) urlCache.set(k, objURL(which === 'thumb' ? f.thumb : f.blob || f.original));
    return urlCache.get(k);
  };
  let saving = false;

  function drawPhotos() {
    if (st.sel >= st.fotos.length) st.sel = Math.max(0, st.fotos.length - 1);
    const f = st.fotos[st.sel];
    $('#photos').innerHTML = `
      ${
        f
          ? `<button type="button" class="ph-main" data-act="annotate" aria-label="Foto markeren"><img src="${furl(f, 'main')}" alt="Foto ${st.sel + 1} van het opleverpunt">
              <span class="ph-hint">${icon('pen')}<span>Tik om te markeren</span></span></button>`
          : `<div class="ph-main ph-empty"><div>${icon('camera', 'big')}<p>Nog geen foto bij dit punt</p></div></div>`
      }
      <div class="ph-strip">
        ${st.fotos
          .map(
            (x, i) => `<div class="ph-t ${i === st.sel ? 'on' : ''}" data-act="phSel" data-i="${i}"><img src="${furl(x, 'thumb')}" alt="Foto ${i + 1}">
            ${x.strokes?.length ? `<span class="ph-badge" title="Gemarkeerd">${icon('pen')}</span>` : ''}
            <button type="button" class="ph-del" data-act="phDel" data-i="${i}" aria-label="Foto ${i + 1} verwijderen">${icon('x')}</button></div>`
          )
          .join('')}
        <button type="button" class="ph-add" data-act="addCam">${icon('camera')}<span>Foto</span></button>
        <button type="button" class="ph-add" data-act="addGal">${icon('image')}<span>Galerij</span></button>
      </div>`;
  }

  function drawPin() {
    const plan = plans.find((x) => x.id === p.plattegrondId);
    $('#pinInfo').innerHTML =
      plan && p.pin
        ? `${icon('pin')}<span>Gemarkeerd op <b>${esc(plan.naam)}</b></span>`
        : `<span class="muted">${plans.length ? 'Nog niet op een plattegrond geplaatst' : 'Voeg eerst een plattegrond toe bij het project'}</span>`;
    $('#pinBtn').disabled = !plans.length;
    $('#pinBtn span').textContent = p.pin ? 'Wijzigen' : 'Plaatsen';
  }

  function collect() {
    ['omschrijving', 'bouwlaag', 'ruimte', 'verantwoordelijke', 'categorie', 'deadline', 'opmerking'].forEach((k) => (p[k] = val(k)));
    p.opnameId = val('opnameSel') || p.opnameId;
  }

  async function persist() {
    collect();
    if (!p.omschrijving && !st.fotos.length) {
      toast('Voeg een foto of omschrijving toe', 'warn');
      return false;
    }
    const now = Date.now();
    const toStore = st.fotos
      .filter((f) => f.isNew || f.dirty)
      .map((f) => ({ id: f.id, projectId: project.id, original: f.original, blob: f.blob || null, thumb: f.thumb, w: f.w, h: f.h, strokes: f.strokes || [] }));
    await db.put('fotos', ...toStore);
    st.fotos.forEach((f) => (f.isNew = f.dirty = false));
    await db.del('fotos', ...st.removed);
    st.removed = [];
    p.fotoIds = st.fotos.map((f) => f.id);
    const proj = await db.get('projecten', project.id);
    if (st.isNew) {
      proj.volgnr = (proj.volgnr || 0) + 1;
      p.nr = proj.volgnr;
      p.created = now;
    }
    if (p.status !== st.origStatus) p.statusDatum = now;
    p.updated = now;
    proj.laatste = { bouwlaag: p.bouwlaag, ruimte: p.ruimte, plattegrondId: p.plattegrondId };
    proj.updated = now;
    await db.put('punten', p);
    await db.put('projecten', proj);
    st.isNew = false;
    st.origStatus = p.status;
    return true;
  }

  return () => {
    app.innerHTML =
      topbar({
        eyebrow: esc(project.naam),
        title: st.isNew ? 'Nieuw opleverpunt' : `Punt #${p.nr}`,
        actions: st.isNew ? '' : `<button class="btn danger" data-act="del">${icon('trash')}<span class="lbl">Verwijderen</span></button>`,
      }) +
      `<main class="wrap has-capbar"><div class="editor">
        <section class="ed-photos" id="photos"></section>
        <form class="form" id="edForm" autocomplete="off">
          ${fText('omschrijving', 'Omschrijving', p.omschrijving, 3, 'placeholder="Wat is er aan de hand?"')}
          <div class="chips" aria-label="Snelle teksten">${s.snelteksten.map((t) => `<button type="button" class="chip" data-act="snel" data-t="${esc(t)}">${esc(t)}</button>`).join('')}</div>
          <div class="grid2">
            ${fInput('bouwlaag', 'Bouwlaag', p.bouwlaag, { list: distinct('bouwlaag'), attrs: 'placeholder="Bijv. 2e verdieping"' })}
            ${fInput('ruimte', 'Ruimte', p.ruimte, { list: distinct('ruimte'), attrs: 'placeholder="Bijv. 2.14 Kantoor"' })}
          </div>
          ${fInput('verantwoordelijke', 'Verantwoordelijke partij', p.verantwoordelijke, { list: verList, attrs: 'placeholder="Kies of typ een partij"' })}
          <div class="field"><span>Status</span>${seg('status', STATUSES, p.status)}<small class="hint" id="statusHint">${STATUS_UITLEG[p.status]}</small></div>
          <div class="grid2">
            ${fSelect('categorie', 'Categorie', CATEGORIEEN, p.categorie)}
            <div class="field"><span>Prioriteit</span>${seg('prioriteit', PRIORITEITEN, p.prioriteit)}</div>
          </div>
          <div class="grid2">
            ${fInput('deadline', 'Gereed vóór', p.deadline, { type: 'date' })}
            ${fSelect('opnameSel', 'Vastgelegd tijdens', opnames.map((o) => [o.id, opnameLabel(o)]), p.opnameId)}
          </div>
          <div class="field"><span>Plattegrond</span><div class="pinrow"><div id="pinInfo" class="pininfo"></div>
            <button type="button" class="btn" id="pinBtn" data-act="pin">${icon('pin')}<span>Plaatsen</span></button></div></div>
          ${fText('opmerking', 'Opmerking / afhandeling', p.opmerking, 2, 'placeholder="Bijv. afspraak over herstel"')}
        </form>
      </div></main>
      <div class="capbar"><div class="wrap capbar-in">
        <button class="btn ghost" data-act="back">Annuleren</button><span class="grow"></span>
        ${st.isNew ? `<button class="btn" data-act="saveNext">${icon('camera')}<span>Opslaan + volgende foto</span></button>` : ''}
        <button class="btn primary big" data-act="save">${icon('check')}<span>Opslaan</span></button>
      </div></div>`;
    drawPhotos();
    drawPin();

    const addPhotos = async (files) => {
      const b = busy('Foto verwerken…');
      try {
        for (const f of files) st.fotos.push({ id: uid(), projectId: project.id, ...(await makePhoto(f)), isNew: true });
        st.sel = st.fotos.length - 1;
        drawPhotos();
      } finally {
        b.close();
      }
    };

    bind({
      annotate: async () => {
        const f = st.fotos[st.sel];
        const res = await annotate(f);
        if (res) {
          Object.assign(f, res, { dirty: true, rev: (f.rev || 0) + 1 });
          drawPhotos();
        }
      },
      phSel: (t, e) => {
        if (e.target.closest('.ph-del')) return;
        st.sel = +t.dataset.i;
        drawPhotos();
      },
      phDel: async (t) => {
        const i = +t.dataset.i;
        const ok = await ask({ title: 'Foto verwijderen?', message: 'De foto wordt verwijderd zodra je het punt opslaat.', ok: 'Verwijderen', danger: true });
        if (!ok) return;
        const [f] = st.fotos.splice(i, 1);
        if (!f.isNew) st.removed.push(f.id);
        drawPhotos();
      },
      addCam: () => pickPhotos('camera').then(addPhotos),
      addGal: () => pickPhotos('galerij').then(addPhotos),
      snel: (t) => {
        const ta = $('#omschrijving');
        const v = ta.value.trim();
        ta.value = v ? `${v}, ${t.dataset.t.toLowerCase()}` : t.dataset.t;
      },
      seg: (t) => {
        const name = t.dataset.name;
        p[name] = t.dataset.v;
        $$(`[data-act="seg"][data-name="${name}"]`).forEach((b) => {
          b.classList.toggle('on', b === t);
          b.setAttribute('aria-pressed', b === t);
        });
        if (name === 'status') $('#statusHint').textContent = STATUS_UITLEG[p.status];
      },
      pin: async () => {
        collect();
        const res = await pickPin({
          plans,
          plattegrondId: p.plattegrondId,
          pin: p.pin,
          others: alle.filter((x) => x.id !== p.id),
          label: p.nr || '+',
        });
        if (res) {
          p.plattegrondId = res.plattegrondId;
          p.pin = res.pin;
          drawPin();
        }
      },
      save: async () => {
        if (saving) return;
        saving = true;
        try {
          if (await persist()) {
            toast(`Punt #${p.nr} opgeslagen`);
            back();
          }
        } finally {
          saving = false;
        }
      },
      saveNext: async () => {
        if (saving) return;
        // De camera moet direct in de klik geopend worden, anders blokkeert de browser dit.
        const next = pickPhotos('camera');
        saving = true;
        try {
          if (await persist()) {
            toast(`Punt #${p.nr} opgeslagen`);
            back();
            next.then((files) => startNewPoint(project.id, files));
          }
        } finally {
          saving = false;
        }
      },
      del: async () => {
        const ok = await ask({ title: `Punt #${p.nr} verwijderen?`, message: "Het punt en de bijbehorende foto's worden verwijderd.", ok: 'Verwijderen', danger: true });
        if (!ok) return;
        const stored = await db.get('punten', p.id);
        await db.del('punten', p.id);
        await db.del('fotos', ...(stored?.fotoIds || []));
        toast(`Punt #${p.nr} verwijderd`);
        back();
      },
    });
    $('#edForm').onsubmit = (e) => e.preventDefault();
  };
}

// =====================================================================
// Opname aanmaken / bewerken (incl. handtekeningen)
// =====================================================================
async function viewOpname(params) {
  const project = await db.get('projecten', params.projectId);
  const s = await getSettings();
  if (!params.state) {
    let o;
    if (params.id) o = structuredClone(await db.get('opnames', params.id));
    else {
      const prev = (await db.byProject('opnames', project.id)).sort(byDateDesc)[0];
      o = {
        id: uid(),
        projectId: project.id,
        type: prev ? 'Eindopname' : 'Tussentijdse opname',
        datum: todayISO(),
        inspecteur: s.inspecteur || '',
        aanwezigen: prev?.aanwezigen || '',
        opmerkingen: '',
        handtekeningen: { opdrachtgever: { naam: '', img: null }, aannemer: { naam: '', img: null } },
        created: Date.now(),
      };
    }
    o.handtekeningen ||= { opdrachtgever: { naam: '', img: null }, aannemer: { naam: '', img: null } };
    params.state = { o, isNew: !params.id };
  }
  const { o, isNew } = params.state;
  const nPunten = (await db.byProject('punten', project.id)).filter((p) => p.opnameId === o.id).length;
  const sigLabel = { opdrachtgever: 'Opdrachtgever', aannemer: 'Aannemer' };

  const sigBox = (k) => {
    const h = o.handtekeningen[k];
    return h.img ? `<img src="${h.img}" alt="Handtekening ${sigLabel[k].toLowerCase()}">` : `<span class="muted">Nog niet getekend</span>`;
  };
  const collect = () => {
    o.type = val('type');
    o.datum = val('datum') || todayISO();
    o.inspecteur = val('inspecteur');
    o.aanwezigen = val('aanwezigen');
    o.opmerkingen = val('opmerkingen');
    ['opdrachtgever', 'aannemer'].forEach((k) => (o.handtekeningen[k].naam = val('sn-' + k)));
  };

  return () => {
    app.innerHTML =
      topbar({
        eyebrow: esc(project.naam),
        title: isNew ? 'Nieuwe opname' : esc(o.type),
        actions: isNew ? '' : `<button class="btn danger" data-act="del">${icon('trash')}<span class="lbl">Verwijderen</span></button>`,
      }) +
      `<main class="wrap narrow has-capbar"><form class="form" id="oform">
        <section class="panel form">
          <div class="grid2">${fSelect('type', 'Soort opname', OPNAME_TYPES, o.type)}${fInput('datum', 'Datum', o.datum, { type: 'date' })}</div>
          ${fInput('inspecteur', 'Opgenomen door', o.inspecteur, { attrs: 'placeholder="Naam van de opnemer"' })}
          ${fText('aanwezigen', 'Aanwezigen', o.aanwezigen, 3, 'placeholder="Eén per regel, bijv. J. de Vries – opdrachtgever"')}
          ${fText('opmerkingen', 'Algemene opmerkingen', o.opmerkingen, 3, 'placeholder="Komt op het voorblad van het verslag"')}
        </section>
        <section class="panel">
          <h2 class="h2">Ondertekening</h2>
          <p class="muted">Laat beide partijen op het tablet tekenen. De handtekeningen komen onderaan het verslag van deze opname.</p>
          <div class="sig-grid">${['opdrachtgever', 'aannemer']
            .map(
              (k) => `<div class="sig">
              ${fInput('sn-' + k, `Naam ${sigLabel[k].toLowerCase()}`, o.handtekeningen[k].naam, { attrs: 'placeholder="Naam ondertekenaar"' })}
              <div class="sig-box" id="sb-${k}">${sigBox(k)}</div>
              <div class="row-actions"><button type="button" class="btn" data-act="sign" data-k="${k}">${icon('sign')}<span>Tekenen</span></button>
              <button type="button" class="btn ghost" data-act="unsign" data-k="${k}">Wissen</button></div>
            </div>`
            )
            .join('')}</div>
        </section>
      </form></main>
      <div class="capbar"><div class="wrap capbar-in">
        <button class="btn ghost" data-act="back">Annuleren</button><span class="grow"></span>
        <button class="btn primary big" data-act="save">${icon('check')}<span>${isNew ? 'Opname aanmaken' : 'Opslaan'}</span></button>
      </div></div>`;
    bind({
      sign: async (t) => {
        collect();
        const k = t.dataset.k;
        const img = await signaturePad(`Handtekening ${sigLabel[k].toLowerCase()}${o.handtekeningen[k].naam ? ': ' + o.handtekeningen[k].naam : ''}`);
        if (img) {
          o.handtekeningen[k].img = img;
          o.handtekeningen[k].getekend = Date.now();
          $('#sb-' + k).innerHTML = sigBox(k);
        }
      },
      unsign: (t) => {
        const k = t.dataset.k;
        o.handtekeningen[k].img = null;
        $('#sb-' + k).innerHTML = sigBox(k);
      },
      save: async () => {
        collect();
        await db.put('opnames', o);
        if (isNew) {
          const proj = await db.get('projecten', project.id);
          proj.actieveOpnameId = o.id;
          proj.updated = Date.now();
          await db.put('projecten', proj);
          toast(`${o.type} aangemaakt en actief gemaakt`);
        } else toast('Opname opgeslagen');
        back();
      },
      del: async () => {
        if (nPunten) return toast(`Deze opname bevat ${nPunten} punten. Verplaats of verwijder die eerst.`, 'warn');
        if (!(await ask({ title: 'Opname verwijderen?', ok: 'Verwijderen', danger: true }))) return;
        await db.del('opnames', o.id);
        if (project.actieveOpnameId === o.id) {
          const proj = await db.get('projecten', project.id);
          proj.actieveOpnameId = null;
          await db.put('projecten', proj);
        }
        toast('Opname verwijderd');
        back();
      },
    });
    $('#oform').onsubmit = (e) => e.preventDefault();
  };
}

// =====================================================================
// Plattegrond bekijken
// =====================================================================
async function viewPlattegrond(params) {
  const plan = await db.get('plattegronden', params.id);
  if (!plan) throw new Error('Deze plattegrond bestaat niet meer.');
  const project = await db.get('projecten', params.projectId);
  const punten = (await db.byProject('punten', project.id)).filter((p) => p.plattegrondId === plan.id && p.pin);
  params.f ||= 'alle';
  const c = counts(punten);
  return () => {
    app.innerHTML =
      topbar({
        eyebrow: esc(project.naam),
        title: esc(plan.naam),
        actions: `<button class="btn" data-act="rename">${icon('edit')}<span class="lbl">Naam wijzigen</span></button>
          <button class="btn danger" data-act="del">${icon('trash')}<span class="lbl">Verwijderen</span></button>`,
      }) +
      `<main class="wrap">
        <div class="filters"><div class="seg seg-filter" role="group" aria-label="Status">${[['alle', 'Alle'], ...STATUSES]
          .map(([v, l]) => `<button class="${params.f === v ? 'on' : ''}" data-act="f" data-s="${v}">${l} <b>${v === 'alle' ? c.total : c[v]}</b></button>`)
          .join('')}</div>
          <p class="muted small">Tik op een nummer om het punt te bekijken. Een punt plaats je via het punt zelf.</p></div>
        <div class="planbox" id="planbox"></div>
        <div id="pinCard"></div>
      </main>`;
    const url = objURL(plan.blob);
    const pins = () =>
      punten.filter((p) => params.f === 'alle' || p.status === params.f).map((p) => ({ id: p.id, x: p.pin.x, y: p.pin.y, label: p.nr, cls: 'p-' + p.status }));
    const viewer = mountPlan($('#planbox'), {
      url,
      w: plan.w,
      h: plan.h,
      pins: pins(),
      onPin: async (id) => {
        const p = punten.find((x) => x.id === id);
        const f = await db.get('fotos', p.fotoIds?.[0]);
        $('#pinCard').innerHTML = `<div class="pincard">
          <div class="thumb">${f ? `<img src="${objURL(f.thumb)}" alt="">` : icon('image')}</div>
          <div class="pbody"><div class="pline"><span class="nr">#${p.nr}</span>${pill(p.status)}</div>
            <div class="pdesc">${esc(p.omschrijving || 'Geen omschrijving')}</div>
            <div class="pmeta">${esc([p.ruimte, p.verantwoordelijke].filter(Boolean).join(' · '))}</div></div>
          <button class="btn primary" data-act="openPunt" data-id="${p.id}">Openen</button>
          <button class="iconbtn" data-act="closeCard" aria-label="Sluiten">${icon('x')}</button></div>`;
      },
    });
    bind({
      f: (t) => {
        params.f = t.dataset.s;
        $$('.seg-filter button').forEach((b) => b.classList.toggle('on', b === t));
        viewer.setPins(pins());
      },
      openPunt: (t) => go('punt', { projectId: project.id, id: t.dataset.id }),
      closeCard: () => ($('#pinCard').innerHTML = ''),
      rename: async () => {
        const naam = await promptText({ title: 'Naam plattegrond', label: 'Naam', value: plan.naam });
        if (!naam) return;
        plan.naam = naam;
        await db.put('plattegronden', plan);
        render();
      },
      del: async () => {
        const ok = await ask({
          title: 'Plattegrond verwijderen?',
          message: punten.length ? `${punten.length} punten verliezen hun markering op deze plattegrond. De punten zelf blijven bestaan.` : '',
          ok: 'Verwijderen',
          danger: true,
        });
        if (!ok) return;
        punten.forEach((p) => {
          p.plattegrondId = null;
          p.pin = null;
        });
        await db.put('punten', ...punten);
        await db.del('plattegronden', plan.id);
        toast('Plattegrond verwijderd');
        back();
      },
    });
  };
}

// =====================================================================
// Verslag maken
// =====================================================================
async function viewVerslag(params) {
  const project = await db.get('projecten', params.projectId);
  const [opnames, punten, plans, s] = await Promise.all([
    db.byProject('opnames', project.id),
    db.byProject('punten', project.id),
    db.byProject('plattegronden', project.id),
    getSettings(),
  ]);
  opnames.sort(byDateDesc);
  const titleFor = (id) => RAPPORT_TITELS[opnames.find((x) => x.id === id)?.type] || 'Opleverrapport';
  const o = (params.opts ||= {
    opnameId: params.opnameId || '',
    inclEerder: true,
    statuses: ['open', 'gereed', 'akkoord'],
    groep: 'geen',
    fotoFormaat: 'normaal',
    overzicht: true,
    plattegronden: true,
    handtekeningen: true,
    titel: titleFor(params.opnameId),
    titelAuto: true,
  });
  let result = null;

  const summary = () => {
    const list = selectPoints(punten, opnames, o);
    const c = counts(list);
    const pinned = list.filter((p) => p.pin).length;
    const withPhoto = list.filter((p) => p.fotoIds?.length).length;
    return `<div class="sum-n"><b>${c.total}</b><span>${c.total === 1 ? 'punt' : 'punten'} in dit verslag</span></div>
      ${statusBar(c)}${legend(c)}
      <p class="muted small">${withPhoto} met foto · ${pinned} op plattegrond</p>`;
  };

  return () => {
    app.innerHTML =
      topbar({ eyebrow: esc(project.naam), title: 'Verslag maken' }) +
      `<main class="wrap"><div class="rgrid">
        <form class="panel form" id="rform">
          ${fSelect('r-opname', 'Opname', [['', 'Alle opnames (totaaloverzicht)'], ...opnames.map((x) => [x.id, opnameLabel(x)])], o.opnameId)}
          <label class="check" id="eerderRow" ${o.opnameId ? '' : 'hidden'}><input type="checkbox" id="r-eerder" ${o.inclEerder ? 'checked' : ''}>
            <span>Ook punten uit eerdere opnames meenemen</span></label>
          ${fInput('r-titel', 'Titel van het verslag', o.titel)}
          <fieldset class="field"><legend>Statussen</legend><div class="checks">${STATUSES.map(
            ([v, l]) => `<label class="check"><input type="checkbox" name="r-status" value="${v}" ${o.statuses.includes(v) ? 'checked' : ''}><span>${l}</span></label>`
          ).join('')}</div></fieldset>
          ${fSelect('r-groep', 'Groeperen op', [['geen', 'Niet groeperen (op nummer)'], ['bouwlaag', 'Bouwlaag'], ['verantwoordelijke', 'Verantwoordelijke partij']], o.groep)}
          <div class="field"><span>Fotoformaat</span>${seg('fotoFormaat', [['groot', 'Groot'], ['normaal', 'Normaal'], ['compact', 'Compact']], o.fotoFormaat)}
            <small class="hint" id="fmtHint"></small></div>
          <fieldset class="field"><legend>Onderdelen</legend><div class="checks col">
            <label class="check"><input type="checkbox" id="r-overzicht" ${o.overzicht ? 'checked' : ''}><span>Overzichtslijst van alle punten</span></label>
            <label class="check"><input type="checkbox" id="r-plans" ${o.plattegronden ? 'checked' : ''} ${plans.length ? '' : 'disabled'}><span>Plattegronden met genummerde punten</span></label>
            <label class="check"><input type="checkbox" id="r-sign" ${o.handtekeningen ? 'checked' : ''}><span>Ondertekening</span></label>
          </div></fieldset>
        </form>
        <section class="rside">
          <div class="panel sum" id="sum">${summary()}</div>
          <button class="btn primary big wide" data-act="gen">${icon('file')}<span>PDF-verslag maken</span></button>
          <div id="result"></div>
          <div id="preview" class="preview" hidden></div>
        </section>
      </div></main>`;

    const hints = { groot: 'Eén grote foto per punt, twee punten per pagina', normaal: 'Foto naast de gegevens, drie punten per pagina', compact: 'Kleine foto, zes tot acht punten per pagina' };
    const setHint = () => ($('#fmtHint').textContent = hints[o.fotoFormaat]);
    setHint();
    const read = () => {
      const prev = o.opnameId;
      o.opnameId = val('r-opname');
      o.inclEerder = $('#r-eerder').checked;
      o.statuses = $$('input[name="r-status"]:checked').map((x) => x.value);
      o.groep = val('r-groep');
      o.overzicht = $('#r-overzicht').checked;
      o.plattegronden = $('#r-plans').checked;
      o.handtekeningen = $('#r-sign').checked;
      const t = val('r-titel');
      if (t !== o.titel) {
        o.titel = t;
        o.titelAuto = false;
      }
      if (prev !== o.opnameId && o.titelAuto) {
        o.titel = titleFor(o.opnameId);
        $('#r-titel').value = o.titel;
      }
      $('#eerderRow').hidden = !o.opnameId;
      $('#sum').innerHTML = summary();
    };
    app.onchange = read;
    app.oninput = (e) => e.target.id === 'r-titel' && read();

    bind({
      seg: (t) => {
        o.fotoFormaat = t.dataset.v;
        $$('[data-act="seg"]').forEach((b) => b.classList.toggle('on', b === t));
        setHint();
      },
      gen: async () => {
        read();
        if (!o.statuses.length) return toast('Kies minimaal één status', 'warn');
        const list = selectPoints(punten, opnames, o);
        if (!list.length) return toast('Er vallen geen punten binnen deze selectie', 'warn');
        const b = busy('Verslag opbouwen…');
        try {
          const ids = new Set(list.flatMap((p) => p.fotoIds || []));
          const fotoMap = new Map();
          for (const id of ids) {
            const f = await db.get('fotos', id);
            if (f) fotoMap.set(id, f);
          }
          const opn = opnames.find((x) => x.id === o.opnameId);
          const res = await buildReport({ project, opnames, punten, fotoMap, plans, settings: s, o, onProgress: (fr, m) => b.set(m, fr) });
          const name = safeName(`${o.titel} ${project.nummer || ''} ${project.naam} ${opn ? opn.datum : todayISO()}.pdf`);
          result = { ...res, name, file: new File([res.blob], name, { type: 'application/pdf' }) };
        } catch (err) {
          console.error(err);
          toast(`Verslag maken mislukt: ${err.message}`, 'error');
          return;
        } finally {
          b.close();
        }
        const canShare = !!navigator.canShare?.({ files: [result.file] });
        $('#result').innerHTML = `<div class="panel result">
          <div class="result-file">${icon('file', 'big')}<div><b>${esc(result.name)}</b><span>${result.pages} pagina's · ${result.count} punten · ${fmtSize(result.blob.size)}</span></div></div>
          <div class="row-actions">
            <button class="btn primary" data-act="dl">${icon('download')}<span>Downloaden</span></button>
            ${canShare ? `<button class="btn" data-act="share">${icon('share')}<span>Delen / mailen</span></button>` : ''}
            <a class="btn" href="${objURL(result.blob)}" target="_blank" rel="noopener">${icon('open')}<span>Openen</span></a>
          </div></div>`;
        const pv = $('#preview');
        pv.hidden = false;
        pv.innerHTML = '<p class="muted">Voorbeeld laden…</p>';
        renderPdfPages(result.blob, pv).catch((err) => {
          console.error(err);
          pv.innerHTML = '<p class="muted">Het voorbeeld kan hier niet worden getoond. Download of open het verslag.</p>';
        });
      },
      dl: () => download(result.blob, result.name),
      share: async () => {
        try {
          await navigator.share({ files: [result.file], title: result.name });
        } catch (err) {
          if (err.name !== 'AbortError') toast('Delen is niet gelukt. Download het bestand en verstuur het handmatig.', 'error');
        }
      },
    });
  };
}

// =====================================================================
// Instellingen en backup
// =====================================================================
async function viewInstellingen() {
  const s = { ...(await getSettings()) };
  let est = null;
  try {
    est = await navigator.storage?.estimate?.();
  } catch {
    /* niet beschikbaar */
  }
  let persisted = false;
  try {
    persisted = await navigator.storage?.persisted?.();
  } catch {
    /* niet beschikbaar */
  }
  return () => {
    app.innerHTML =
      topbar({ eyebrow: 'Opleverpunten', title: 'Instellingen' }) +
      `<main class="wrap narrow has-capbar"><form class="form" id="sform">
        <section class="panel form"><h2 class="h2">Verslag</h2>
          ${fInput('bedrijf', 'Bedrijfsnaam', s.bedrijf, { attrs: 'placeholder="Komt rechtsboven op het voorblad"' })}
          <div class="field"><span>Logo</span><div class="logo-row"><div class="logo-box" id="logoBox">${s.logo ? `<img src="${s.logo}" alt="Logo">` : '<span class="muted">Geen logo</span>'}</div>
            <label class="btn">${icon('upload')}<span>Kiezen</span><input type="file" id="logoInput" accept="image/*" hidden></label>
            <button type="button" class="btn ghost" data-act="logoDel">Weghalen</button></div></div>
          ${fInput('inspecteur', 'Standaard opnemer', s.inspecteur, { attrs: 'placeholder="Jouw naam"' })}
          ${fInput('voettekst', 'Voettekst', s.voettekst, { attrs: 'placeholder="Bijv. adres of telefoonnummer"' })}
          ${fText('verklaring', 'Tekst bij ondertekening', s.verklaring, 4)}
        </section>
        <section class="panel form"><h2 class="h2">Keuzelijsten</h2>
          ${fText('verantwoordelijken', 'Verantwoordelijke partijen (één per regel)', s.verantwoordelijken.join('\n'), 6)}
          ${fText('snelteksten', 'Snelle teksten voor omschrijvingen (één per regel)', s.snelteksten.join('\n'), 6)}
        </section>
        <section class="panel"><h2 class="h2">Gegevens op dit apparaat</h2>
          <p class="muted">Alle projecten en foto's staan alleen op dit apparaat, in deze browser. Maak regelmatig een backup, zeker vóór je browsergegevens wist of van tablet wisselt.</p>
          <dl class="kv">
            <dt>Gebruikte opslag</dt><dd>${est?.usage != null ? `${fmtSize(est.usage)}${est.quota ? ` van ongeveer ${fmtSize(est.quota)}` : ''}` : 'Onbekend'}</dd>
            <dt>Beschermd tegen opschonen</dt><dd>${persisted ? 'Ja' : 'Nee, de browser kan gegevens wissen bij ruimtegebrek'}</dd>
          </dl>
          <div class="row-actions">
            <button type="button" class="btn" data-act="backupAll">${icon('download')}<span>Backup van alles</span></button>
            <label class="btn">${icon('upload')}<span>Backup terugzetten</span><input type="file" id="importInput" accept=".json,application/json" hidden></label>
            ${persisted ? '' : `<button type="button" class="btn ghost" data-act="persist">Opslag beschermen</button>`}
            <button type="button" class="btn ghost" data-act="sample">Voorbeeldproject laden</button>
          </div>
        </section>
      </form></main>
      <div class="capbar"><div class="wrap capbar-in"><button class="btn ghost" data-act="back">Annuleren</button><span class="grow"></span>
        <button class="btn primary big" data-act="save">${icon('check')}<span>Opslaan</span></button></div></div>`;
    const lines = (id) => val(id).split('\n').map((x) => x.trim()).filter(Boolean);
    bind({
      save: async () => {
        Object.assign(s, {
          bedrijf: val('bedrijf'),
          inspecteur: val('inspecteur'),
          voettekst: val('voettekst'),
          verklaring: val('verklaring'),
          verantwoordelijken: lines('verantwoordelijken'),
          snelteksten: lines('snelteksten'),
        });
        await saveSettings(s);
        toast('Instellingen opgeslagen');
        back();
      },
      logoDel: () => {
        s.logo = null;
        $('#logoBox').innerHTML = '<span class="muted">Geen logo</span>';
      },
      backupAll: () => exportBackup(null, `Opleverpunten backup ${todayISO()}.json`),
      persist: async () => {
        const ok = await navigator.storage?.persist?.().catch(() => false);
        toast(ok ? 'Opslag is beschermd' : 'De browser staat dit nu niet toe. Installeer de app op het beginscherm en probeer opnieuw.', ok ? 'ok' : 'warn');
        if (ok) render();
      },
      sample: async () => {
        await loadSample();
      },
    });
    $('#logoInput').onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const r = await resizeBlob(f, 600, 0.92, 'image/png');
      s.logo = await blobToDataURL(r.blob);
      $('#logoBox').innerHTML = `<img src="${s.logo}" alt="Logo">`;
    };
    $('#importInput').onchange = async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) await importBackup(f);
    };
    $('#sform').onsubmit = (e) => e.preventDefault();
  };
}

async function exportBackup(projectIds, name) {
  const b = busy('Backup maken…');
  try {
    const projecten = (await db.all('projecten')).filter((p) => !projectIds || projectIds.includes(p.id));
    const out = { app: 'opleverpunten', versie: 1, gemaakt: new Date().toISOString(), projecten, opnames: [], punten: [], fotos: [], plattegronden: [], instellingen: null };
    for (const p of projecten) {
      out.opnames.push(...(await db.byProject('opnames', p.id)));
      out.punten.push(...(await db.byProject('punten', p.id)));
      const fotos = await db.byProject('fotos', p.id);
      for (let i = 0; i < fotos.length; i++) {
        const f = fotos[i];
        b.set(`Foto's inpakken (${p.naam})`, (i + 1) / fotos.length);
        out.fotos.push({ ...f, original: await blobToDataURL(f.original), blob: f.blob ? await blobToDataURL(f.blob) : null, thumb: await blobToDataURL(f.thumb) });
      }
      for (const pl of await db.byProject('plattegronden', p.id)) {
        out.plattegronden.push({ ...pl, blob: await blobToDataURL(pl.blob), thumb: pl.thumb ? await blobToDataURL(pl.thumb) : null });
      }
    }
    if (!projectIds) out.instellingen = await getSettings();
    download(new Blob([JSON.stringify(out)], { type: 'application/json' }), name);
    toast('Backup gedownload');
  } finally {
    b.close();
  }
}

async function importBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return toast('Dit bestand is geen geldige backup.', 'error');
  }
  if (data?.app !== 'opleverpunten') return toast('Dit bestand is geen backup van Opleverpunten.', 'error');
  const n = data.projecten?.length || 0;
  const ok = await ask({
    title: 'Backup terugzetten?',
    message: `${n} ${n === 1 ? 'project' : 'projecten'} uit ${fmtDate(data.gemaakt, true)}. Projecten die al op dit apparaat staan worden overschreven met de versie uit de backup.`,
    ok: 'Terugzetten',
  });
  if (!ok) return;
  const b = busy('Backup terugzetten…');
  try {
    await db.put('projecten', ...data.projecten);
    await db.put('opnames', ...(data.opnames || []));
    await db.put('punten', ...(data.punten || []));
    const fotos = data.fotos || [];
    for (let i = 0; i < fotos.length; i += 25) {
      b.set("Foto's terugzetten", i / fotos.length);
      await db.put(
        'fotos',
        ...fotos.slice(i, i + 25).map((f) => ({ ...f, original: dataURLToBlob(f.original), blob: f.blob ? dataURLToBlob(f.blob) : null, thumb: dataURLToBlob(f.thumb) }))
      );
    }
    await db.put('plattegronden', ...(data.plattegronden || []).map((pl) => ({ ...pl, blob: dataURLToBlob(pl.blob), thumb: pl.thumb ? dataURLToBlob(pl.thumb) : null })));
    if (data.instellingen) await saveSettings({ ...DEFAULT_SETTINGS, ...data.instellingen, id: 'app', voorbeeldGeladen: true });
    toast(`${n} ${n === 1 ? 'project' : 'projecten'} teruggezet`);
  } catch (err) {
    console.error(err);
    toast(`Terugzetten mislukt: ${err.message}`, 'error');
  } finally {
    b.close();
  }
}

// =====================================================================
const VIEWS = {
  home: viewHome,
  projectForm: viewProjectForm,
  project: viewProject,
  punt: viewPunt,
  opname: viewOpname,
  plattegrond: viewPlattegrond,
  verslag: viewVerslag,
  instellingen: viewInstellingen,
};

async function init() {
  try {
    await db.open();
  } catch (err) {
    app.innerHTML = `<main class="wrap"><div class="empty"><h2>Opslag niet beschikbaar</h2><p>${esc(err.message)}</p>
      <p>Deze app bewaart gegevens in de browser. Gebruik geen privévenster en sta websitegegevens toe.</p></div></main>`;
    return;
  }
  const s = await getSettings();
  if (!s.voorbeeldGeladen) {
    if (!(await db.all('projecten')).length) {
      const b = busy('Voorbeeldproject klaarzetten…');
      try {
        const { seedSample } = await import('./sample.js');
        await seedSample(s.inspecteur);
      } catch (err) {
        console.error(err);
      } finally {
        b.close();
      }
    }
    await saveSettings({ ...s, voorbeeldGeladen: true });
  }
  render(true);
  const local = ['localhost', '127.0.0.1'].includes(location.hostname);
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || local)) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
init();
