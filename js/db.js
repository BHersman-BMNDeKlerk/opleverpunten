// Kleine IndexedDB-laag. Alle gegevens (ook foto's) blijven op het apparaat.

const NAME = 'opleverpunten';
const VERSION = 1;
const STORES = {
  projecten: [],
  opnames: ['projectId'],
  punten: ['projectId'],
  fotos: ['projectId'],
  plattegronden: ['projectId'],
  instellingen: [],
};
const PROJECT_STORES = ['opnames', 'punten', 'fotos', 'plattegronden'];

let dbPromise;

export function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = () => {
        const d = r.result;
        for (const [name, indexes] of Object.entries(STORES)) {
          if (!d.objectStoreNames.contains(name)) {
            const s = d.createObjectStore(name, { keyPath: 'id' });
            indexes.forEach((i) => s.createIndex(i, i));
          }
        }
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.onblocked = () => reject(new Error('De database is geblokkeerd door een ander geopend tabblad.'));
    });
  }
  return dbPromise;
}

const wrap = (req) =>
  new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });

const done = (tx) =>
  new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error || new Error('Opslaan afgebroken (is de opslag vol?)'));
  });

export async function get(store, id) {
  if (id == null) return undefined;
  const d = await open();
  return wrap(d.transaction(store).objectStore(store).get(id));
}

export async function all(store) {
  const d = await open();
  return wrap(d.transaction(store).objectStore(store).getAll());
}

export async function byProject(store, projectId) {
  const d = await open();
  return wrap(d.transaction(store).objectStore(store).index('projectId').getAll(projectId));
}

export async function put(store, ...objs) {
  if (!objs.length) return;
  const d = await open();
  const tx = d.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  objs.forEach((o) => s.put(o));
  await done(tx);
}

export async function del(store, ...ids) {
  if (!ids.length) return;
  const d = await open();
  const tx = d.transaction(store, 'readwrite');
  const s = tx.objectStore(store);
  ids.forEach((id) => s.delete(id));
  await done(tx);
}

export async function delProject(id) {
  const d = await open();
  const tx = d.transaction(['projecten', ...PROJECT_STORES], 'readwrite');
  tx.objectStore('projecten').delete(id);
  for (const name of PROJECT_STORES) {
    const st = tx.objectStore(name);
    st.index('projectId').getAllKeys(id).onsuccess = (e) => e.target.result.forEach((k) => st.delete(k));
  }
  await done(tx);
}
