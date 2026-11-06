// Foto's verkleinen, omzetten en PDF-plattegronden inlezen.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const isBlob = src instanceof Blob;
    const url = isBlob ? URL.createObjectURL(src) : src;
    const img = new Image();
    img.onload = () => {
      if (isBlob) setTimeout(() => URL.revokeObjectURL(url), 15000);
      resolve(img);
    };
    img.onerror = () => {
      if (isBlob) URL.revokeObjectURL(url);
      reject(new Error('Afbeelding kon niet worden gelezen. Gebruik een JPG- of PNG-bestand.'));
    };
    img.src = url;
  });
}

export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.85) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Afbeelding kon niet worden opgeslagen.'))), type, quality)
  );
}

export async function resizeBlob(src, max, quality = 0.82, type = 'image/jpeg') {
  const img = src instanceof HTMLImageElement ? src : await loadImage(src);
  const w0 = img.naturalWidth;
  const h0 = img.naturalHeight;
  const s = Math.min(1, max / Math.max(w0, h0));
  const w = Math.max(1, Math.round(w0 * s));
  const h = Math.max(1, Math.round(h0 * s));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (type === 'image/jpeg') {
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const blob = await canvasToBlob(c, type, quality);
  c.width = c.height = 0;
  return { blob, w, h };
}

// Maakt van een cameraopname een opslagvriendelijke foto plus miniatuur.
export async function makePhoto(file) {
  const main = await resizeBlob(file, 1800, 0.84);
  const thumb = await resizeBlob(main.blob, 400, 0.72);
  return { original: main.blob, blob: null, thumb: thumb.blob, w: main.w, h: main.h, strokes: [] };
}

export const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export function dataURLToBlob(url) {
  const [head, data] = url.split(',');
  const mime = (head.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream';
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ---------- pdf.js (alleen geladen als het nodig is) ----------
let pdfjsReady;
function loadPdfJs() {
  if (!pdfjsReady) {
    pdfjsReady = new Promise((resolve, reject) => {
      if (window.pdfjsLib) return resolve(window.pdfjsLib);
      const s = document.createElement('script');
      s.src = 'vendor/pdfjs/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
        resolve(window.pdfjsLib);
      };
      s.onerror = () => {
        pdfjsReady = null;
        reject(new Error('De PDF-lezer kon niet worden geladen.'));
      };
      document.head.appendChild(s);
    });
  }
  return pdfjsReady;
}

// Zet elke pagina van een PDF-tekening om naar een afbeelding.
export async function pdfToImages(file, maxPages = 20, target = 2600) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const out = [];
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: target / Math.max(v1.width, v1.height) });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    out.push({ blob: await canvasToBlob(c, 'image/jpeg', 0.9), w: c.width, h: c.height, page: i, pages: pdf.numPages });
    c.width = c.height = 0;
  }
  return out;
}

// Toont de pagina's van een gemaakt verslag als voorbeeld.
export async function renderPdfPages(blob, container, maxPages = 80) {
  const lib = await loadPdfJs();
  const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  container.innerHTML = '';
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const width = Math.min(820, container.clientWidth || 800);
  for (let i = 1; i <= Math.min(pdf.numPages, maxPages); i++) {
    const page = await pdf.getPage(i);
    const v1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: (width * dpr) / v1.width });
    const c = document.createElement('canvas');
    c.width = Math.round(vp.width);
    c.height = Math.round(vp.height);
    c.className = 'pdfpage';
    c.setAttribute('aria-label', `Pagina ${i}`);
    container.appendChild(c);
    await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
  }
  return pdf.numPages;
}
