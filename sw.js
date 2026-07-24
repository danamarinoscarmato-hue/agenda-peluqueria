/* Service worker de Agenda Peluquería.
   Se usa SOLO para las notificaciones: mostrar el aviso, abrir la app al
   tocarlo y chequear recordatorios en segundo plano cuando el teléfono lo
   permite. No guarda caché, así las actualizaciones de la app llegan siempre. */

const SYNC_URL = "https://app-delta-b0a47-default-rtdb.firebaseio.com/.json";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

/* al tocar el aviso: trae la app al frente, o la abre si estaba cerrada */
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const abiertas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (abiertas.length > 0) return abiertas[0].focus();
    return self.clients.openWindow("./");
  })());
});

/* preferencia guardada por la app (IndexedDB, compartida con la página) */
const idb = () => new Promise((res, rej) => {
  const req = indexedDB.open("salon-notif", 1);
  req.onupgradeneeded = () => req.result.createObjectStore("kv");
  req.onsuccess = () => res(req.result);
  req.onerror = () => rej(req.error);
});
const idbGet = (k) => idb().then((db) => new Promise((res) => {
  const t = db.transaction("kv").objectStore("kv").get(k);
  t.onsuccess = () => res(t.result); t.onerror = () => res(undefined);
})).catch(() => undefined);
const idbSet = (k, v) => idb().then((db) => new Promise((res) => {
  const t = db.transaction("kv", "readwrite");
  t.objectStore("kv").put(v, k);
  t.oncomplete = () => res(); t.onerror = () => res();
})).catch(() => {});

/* misma regla que la app: recordatorios listos desde las 10:00 del último
   día de trabajo anterior al turno (domingo y lunes cerrado) */
const addDias = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const cerrado = (iso) => [0, 1].includes(new Date(iso + "T12:00:00").getDay());
const contarPendientes = (datos) => {
  const ahora = new Date();
  return ((datos && datos.turnos) || []).filter((t) => {
    if (t.recordado) return false;
    const f = new Date(t.fecha + "T" + (t.hora || "09:00"));
    let dia = addDias(t.fecha, -1);
    while (cerrado(dia)) dia = addDias(dia, -1);
    return f > ahora && ahora >= new Date(dia + "T10:00:00");
  }).length;
};

const chequear = async () => {
  if ((await idbGet("notif-on")) !== "si") return;
  const hoy = new Date().toISOString().slice(0, 10);
  if ((await idbGet("notif-avisado")) === hoy) return;
  try {
    const r = await fetch(SYNC_URL);
    if (!r.ok) return;
    const n = contarPendientes(await r.json());
    if (n > 0) {
      await self.registration.showNotification("Agenda Peluquería", {
        body: n === 1 ? "Hay 1 recordatorio listo para enviar 💬" : "Hay " + n + " recordatorios listos para enviar 💬",
        tag: "recordatorios",
      });
      await idbSet("notif-avisado", hoy);
    }
  } catch {}
};

self.addEventListener("periodicsync", (e) => { if (e.tag === "recordatorios") e.waitUntil(chequear()); });
