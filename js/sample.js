// Voorbeeldproject met getekende voorbeeldfoto's en een plattegrond.
import * as db from './db.js';
import { uid } from './ui.js';
import { canvasToBlob, resizeBlob } from './images.js';
import { renderAnnotated } from './draw.js';

const W = 1200;
const H = 900;

function base(ctx, top = '#ECE7DC', bottom = '#D8D1C3') {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
}
function vignette(ctx) {
  const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.font = '600 22px Arial, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.textAlign = 'right';
  ctx.fillText('VOORBEELDFOTO', W - 24, H - 24);
}
function crack(ctx, x0, y0, x1, y1, color = '#5b544a', width = 3, jitter = 14) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  const n = 18;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    ctx.lineTo(x0 + (x1 - x0) * t + (Math.random() - 0.5) * jitter, y0 + (y1 - y0) * t + (Math.random() - 0.5) * jitter);
  }
  ctx.stroke();
}

const SCENES = {
  wand(ctx) {
    base(ctx);
    ctx.fillStyle = '#4b4f4c';
    ctx.fillRect(0, H - 90, W, 90);
    ctx.fillStyle = '#c9c2b4';
    ctx.fillRect(W - 170, 0, 30, H - 90);
    crack(ctx, 380, 360, 760, 470, '#7e766a', 4, 10);
    crack(ctx, 400, 380, 720, 470, '#a59d8f', 2, 8);
    return [[330, 280], [810, 540]];
  },
  deur(ctx) {
    base(ctx, '#E9E6E0', '#D5D0C7');
    ctx.fillStyle = '#B98B5A';
    ctx.fillRect(380, 40, 440, H);
    for (let i = 0; i < 40; i++) {
      ctx.strokeStyle = `rgba(90,55,25,${0.08 + Math.random() * 0.1})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      const x = 380 + Math.random() * 440;
      ctx.moveTo(x, 40);
      ctx.bezierCurveTo(x + 10, 300, x - 10, 600, x + 5, H);
      ctx.stroke();
    }
    ctx.fillStyle = '#9aa0a3';
    ctx.fillRect(360, 30, 20, H);
    ctx.fillRect(820, 30, 20, H);
    ctx.fillStyle = '#c4c9cc';
    ctx.fillRect(740, 470, 60, 16);
    const g = ctx.createRadialGradient(560, 620, 4, 560, 620, 70);
    g.addColorStop(0, 'rgba(50,25,5,0.6)');
    g.addColorStop(1, 'rgba(50,25,5,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(560, 620, 80, 55, 0.3, 0, Math.PI * 2);
    ctx.fill();
    return [[230, 830], [520, 640], 'arrow'];
  },
  plafond(ctx) {
    base(ctx, '#F1F1EE', '#E1E1DC');
    ctx.strokeStyle = '#b9bcb8';
    ctx.lineWidth = 10;
    for (let x = -60; x < W; x += 300) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 300) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(845, 305, 290, 290);
    const g = ctx.createRadialGradient(400, 460, 10, 400, 460, 140);
    g.addColorStop(0, 'rgba(140,95,40,0.55)');
    g.addColorStop(0.7, 'rgba(160,120,60,0.25)');
    g.addColorStop(1, 'rgba(160,120,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(245, 305, 290, 290);
    return [[230, 290], [560, 610]];
  },
  wcd(ctx) {
    base(ctx, '#EDEDE8', '#DCDCD5');
    ctx.fillStyle = '#f7f7f5';
    ctx.fillRect(330, 320, 180, 180);
    ctx.strokeStyle = '#c8c8c2';
    ctx.lineWidth = 3;
    ctx.strokeRect(330, 320, 180, 180);
    ctx.fillStyle = '#2f3330';
    ctx.beginPath();
    ctx.arc(390, 410, 12, 0, Math.PI * 2);
    ctx.arc(450, 410, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5f6360';
    ctx.fillRect(660, 320, 180, 180);
    ctx.fillStyle = '#3a3d3b';
    ctx.fillRect(685, 345, 130, 130);
    [['#8B5A2B', 0], ['#1E5AA8', 25], ['#C9B000', 50]].forEach(([c, dx]) => {
      ctx.strokeStyle = c;
      ctx.lineWidth = 9;
      ctx.beginPath();
      ctx.moveTo(720 + dx, 360);
      ctx.bezierCurveTo(700 + dx, 420, 760 + dx, 430, 730 + dx, 470);
      ctx.stroke();
    });
    return [[630, 290], [870, 530], 'rect'];
  },
  vloer(ctx) {
    base(ctx, '#C9C3B7', '#B5AE9F');
    ctx.strokeStyle = '#8f897d';
    ctx.lineWidth = 6;
    for (let x = 0; x < W; x += 300) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 300) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    crack(ctx, 620, 320, 880, 580, '#4a453d', 3, 18);
    crack(ctx, 760, 450, 700, 590, '#4a453d', 2, 10);
    return [[570, 280], [930, 630]];
  },
  kozijn(ctx) {
    base(ctx, '#E7E3DA', '#D3CEC2');
    ctx.fillStyle = '#5d6366';
    ctx.fillRect(220, 80, 760, 640);
    const g = ctx.createLinearGradient(0, 120, 0, 680);
    g.addColorStop(0, '#9ec3db');
    g.addColorStop(1, '#d9e8f0');
    ctx.fillStyle = g;
    ctx.fillRect(270, 130, 660, 540);
    ctx.fillStyle = '#8a8f91';
    ctx.fillRect(200, 720, 800, 40);
    ctx.fillStyle = '#2a2c2b';
    ctx.fillRect(230, 716, 260, 8);
    return [[190, 650], [530, 800]];
  },
};

async function samplePhoto(projectId, scene, color = '#E53935') {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');
  const [a, b, tool = 'circle'] = SCENES[scene](ctx);
  vignette(ctx);
  const original = await canvasToBlob(c, 'image/jpeg', 0.82);
  const strokes = [{ tool, color, width: 9, points: tool === 'arrow' ? [a, b] : [a, b] }];
  const blob = await renderAnnotated(original, strokes, W, H);
  const thumb = (await resizeBlob(blob, 400, 0.72)).blob;
  return { id: uid(), projectId, original, blob, thumb, w: W, h: H, strokes };
}

async function samplePlan() {
  const PW = 2400;
  const PH = 1500;
  const c = document.createElement('canvas');
  c.width = PW;
  c.height = PH;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PW, PH);
  // stramien
  ctx.strokeStyle = '#9aa7b4';
  ctx.lineWidth = 2;
  ctx.setLineDash([30, 10, 6, 10]);
  ctx.font = '600 34px Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const xs = [200, 600, 1000, 1400, 1800, 2200];
  const ys = [200, 700, 850, 1300];
  xs.forEach((x, i) => {
    ctx.beginPath();
    ctx.moveTo(x, 110);
    ctx.lineTo(x, PH - 80);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(x, 70, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#56636f';
    ctx.fillText('ABCDEF'[i], x, 72);
    ctx.setLineDash([30, 10, 6, 10]);
  });
  ys.forEach((y, i) => {
    ctx.beginPath();
    ctx.moveTo(110, y);
    ctx.lineTo(PW - 80, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(70, y, 32, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillText(String(i + 1), 70, y + 2);
    ctx.setLineDash([30, 10, 6, 10]);
  });
  ctx.setLineDash([]);
  // wanden
  ctx.strokeStyle = '#1b1e1c';
  ctx.lineWidth = 22;
  ctx.strokeRect(200, 200, 2000, 1100);
  ctx.lineWidth = 10;
  const wall = (x0, y0, x1, y1) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  };
  wall(200, 700, 2200, 700);
  wall(200, 850, 2200, 850);
  [600, 1000, 1400, 1800].forEach((x) => wall(x, 200, x, 700));
  [900, 1300, 1700].forEach((x) => wall(x, 850, x, 1300));
  // deuren
  ctx.fillStyle = '#fff';
  ctx.strokeStyle = '#1b1e1c';
  ctx.lineWidth = 3;
  const door = (x, y, up) => {
    ctx.fillRect(x, y - 8, 90, 16);
    ctx.beginPath();
    if (up) {
      ctx.moveTo(x, y);
      ctx.arc(x, y, 90, -Math.PI / 2, 0);
    } else {
      ctx.moveTo(x, y);
      ctx.arc(x, y, 90, 0, Math.PI / 2);
    }
    ctx.stroke();
  };
  [420, 820, 1220, 1620, 2020].forEach((x) => door(x, 700, true));
  [600, 1100, 1500, 1950].forEach((x) => door(x, 850, false));
  // ramen
  ctx.strokeStyle = '#4b88b8';
  ctx.lineWidth = 8;
  for (let x = 260; x < 2160; x += 200) wall(x, 1300, x + 120, 1300);
  for (let x = 260; x < 2160; x += 200) wall(x, 200, x + 120, 200);
  // ruimtenamen
  ctx.fillStyle = '#1b1e1c';
  const room = (x, y, nr, naam, m2) => {
    ctx.font = '700 40px Arial, sans-serif';
    ctx.fillText(nr, x, y - 28);
    ctx.font = '400 34px Arial, sans-serif';
    ctx.fillText(naam, x, y + 16);
    ctx.font = '400 26px Arial, sans-serif';
    ctx.fillStyle = '#6b7178';
    ctx.fillText(m2, x, y + 54);
    ctx.fillStyle = '#1b1e1c';
  };
  room(400, 450, '2.01', 'Kantoor', '24,0 m²');
  room(800, 450, '2.02', 'Overleg', '24,0 m²');
  room(1200, 450, '2.03', 'Kantoor', '24,0 m²');
  room(1600, 450, '2.04', 'Pantry', '24,0 m²');
  room(2000, 450, '2.05', 'Toiletten', '24,0 m²');
  room(1200, 775, '2.00', 'Gang', '');
  room(550, 1075, '2.10', 'Open werkplek', '49,0 m²');
  room(1100, 1075, '2.11', 'Stilteruimte', '28,0 m²');
  room(1500, 1075, '2.12', 'Techniek', '28,0 m²');
  room(1950, 1075, '2.13', 'Archief', '35,0 m²');
  // titelblok
  ctx.textAlign = 'left';
  ctx.font = '600 28px Arial, sans-serif';
  ctx.fillText('Plattegrond 2e verdieping  ·  schaal 1:100  ·  VOORBEELD', 200, PH - 40);
  const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
  const thumb = (await resizeBlob(blob, 640, 0.75)).blob;
  return { blob, thumb, w: PW, h: PH };
}

export async function seedSample(inspecteur = '') {
  const projectId = uid();
  const now = Date.now();
  const opT = {
    id: uid(),
    projectId,
    type: 'Tussentijdse opname',
    datum: '2026-10-08',
    inspecteur: inspecteur || 'A. Jansen',
    aanwezigen: 'A. Jansen – opzichter namens opdrachtgever\nM. Bakker – uitvoerder hoofdaannemer',
    opmerkingen: 'Opname van de 2e verdieping na afronding van het afbouwwerk. Installaties zijn nog niet ingeregeld.',
    handtekeningen: { opdrachtgever: { naam: '', img: null }, aannemer: { naam: '', img: null } },
    created: now - 3000,
  };
  const opE = {
    id: uid(),
    projectId,
    type: 'Eindopname',
    datum: '2026-10-29',
    inspecteur: inspecteur || 'A. Jansen',
    aanwezigen: 'A. Jansen – opzichter namens opdrachtgever\nJ. de Vries – opdrachtgever\nM. Bakker – uitvoerder hoofdaannemer\nS. Yilmaz – projectleider installaties',
    opmerkingen: 'Het werk wordt opgeleverd onder voorbehoud van herstel van onderstaande punten binnen twee weken.',
    handtekeningen: { opdrachtgever: { naam: 'J. de Vries', img: null }, aannemer: { naam: 'M. Bakker', img: null } },
    created: now - 2000,
  };
  const plan = { id: uid(), projectId, naam: '2e verdieping', created: now, ...(await samplePlan()) };
  const L = '2e verdieping';
  const defs = [
    [opT, 'wand', 'Kras in wandafwerking naast kozijn', '2.01 Kantoor', 'Schilder', 'Beschadiging', 'normaal', 'akkoord', '', '', [0.12, 0.25]],
    [opT, 'deur', 'Deuk in deurblad, deur vervangen of herstellen', '2.03 Kantoor', 'Hoofdaannemer', 'Beschadiging', 'normaal', 'gereed', '', '', [0.47, 0.44]],
    [opT, 'plafond', 'Plafondplaat met waterschade vervangen', '2.00 Gang', 'Afbouw/plafonds', 'Beschadiging', 'hoog', 'open', '2026-11-12', 'Oorzaak lekkage eerst laten onderzoeken door installateur W.', [0.62, 0.52]],
    [opT, 'wcd', 'Afdekplaat wandcontactdoos ontbreekt', '2.04 Pantry', 'Installateur E', 'Ontbreekt', 'normaal', 'gereed', '', '', [0.69, 0.37]],
    [opE, 'vloer', 'Scheur in vloertegel', '2.05 Toiletten', 'Vloerenlegger', 'Beschadiging', 'normaal', 'open', '2026-11-12', '', [0.85, 0.36]],
    [opE, 'kozijn', 'Kitvoeg onderzijde kozijn ontbreekt', '2.10 Open werkplek', 'Gevelbouwer', 'Afwerking', 'hoog', 'open', '2026-11-12', '', [0.2, 0.84]],
    [opE, 'wand', 'Schilderwerk bijwerken na montage radiator', '2.11 Stilteruimte', 'Schilder', 'Afwerking', 'laag', 'open', '2026-11-12', '', [0.47, 0.78]],
    [opE, null, 'Brandmanchet ontbreekt bij leidingdoorvoer', '2.12 Techniek', 'Installateur W', 'Brandveiligheid', 'hoog', 'open', '2026-11-05', 'Foto volgt bij heropname.', [0.62, 0.8]],
  ];
  const fotos = [];
  const punten = [];
  for (let i = 0; i < defs.length; i++) {
    const [op, scene, oms, ruimte, ver, cat, prio, status, deadline, opm, pin] = defs[i];
    const f = scene ? await samplePhoto(projectId, scene, i % 3 === 2 ? '#FFD60A' : '#E53935') : null;
    if (f) fotos.push(f);
    punten.push({
      id: uid(),
      projectId,
      opnameId: op.id,
      nr: i + 1,
      omschrijving: oms,
      bouwlaag: L,
      ruimte,
      verantwoordelijke: ver,
      categorie: cat,
      prioriteit: prio,
      status,
      deadline,
      opmerking: opm,
      fotoIds: f ? [f.id] : [],
      plattegrondId: plan.id,
      pin: { x: pin[0], y: pin[1] },
      created: now - (defs.length - i) * 60000,
      updated: now,
    });
  }
  await db.put('fotos', ...fotos);
  await db.put('plattegronden', plan);
  await db.put('opnames', opT, opE);
  await db.put('punten', ...punten);
  await db.put('projecten', {
    id: projectId,
    naam: 'Kantoorgebouw De Werf (voorbeeld)',
    nummer: '2026-014',
    adres: 'Werfkade 12',
    plaats: 'Utrecht',
    opdrachtgever: 'Stichting Huisvesting Midden',
    aannemer: 'Bouwbedrijf Van Rijn',
    architect: 'Atelier Noord Architecten',
    omschrijving: 'Renovatie en herindeling 2e verdieping kantoorgebouw. Dit is een voorbeeldproject; verwijder het gerust.',
    volgnr: punten.length,
    actieveOpnameId: opE.id,
    laatste: { bouwlaag: L, ruimte: '', plattegrondId: plan.id },
    created: now - 5000,
    updated: now,
  });
  return projectId;
}
