// lib/eventos.ts
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
} from "@/lib/dbService";
import { CINES_COLLECTION, db } from "./firebaseConfig";
import { Evento } from "./types";
import { sanitizeCineId } from "@/shared/utils";

function getEventosCol(cineId: string) {
  const safeId = sanitizeCineId(cineId);
  if (!safeId) {
    throw new Error("cineId inválido para eventos");
  }
  return collection(db, CINES_COLLECTION, safeId, "eventos");
}

export function mapSnapToEvento(s: any): Evento {
  const data = s.data();

  const diaHora = data.diaHora?.toDate
    ? data.diaHora.toDate()
    : new Date(data.diaHora);

  return {
    id: s.id,
    diaHora,
    pelicula: data.pelicula,
    sala: data.sala,
    kdm: !!data.kdm,
    dcp: !!data.dcp,
    desayuno: !!data.desayuno,
    combo: !!data.combo,
    timestamp:
      data.timestamp ??
      (diaHora instanceof Date ? diaHora.getTime() : Date.now()),
  };
}

export async function crearEvento(
  e: Omit<Evento, "id" | "timestamp">,
  cineId: string
) {
  const payload = {
    ...e,
    diaHora: Timestamp.fromDate(e.diaHora),
    timestamp: e.diaHora.getTime(),
  };

  const col = getEventosCol(cineId);
  await addDoc(col, payload);
}

export function listenEventosTodos(
  setter: (evs: Evento[]) => void,
  cineId: string
) {
  const col = getEventosCol(cineId);
  const qy = query(col, orderBy("diaHora", "asc"));

  return onSnapshot(
    qy,
    (snap) => {
      const now = Date.now();
      const list = snap.docs.map(mapSnapToEvento);

      list.sort((a, b) => {
        const da = a.diaHora.getTime() - now;
        const db = b.diaHora.getTime() - now;

        const ga = da >= 0 ? 0 : 1;
        const gb = db >= 0 ? 0 : 1;

        if (ga !== gb) return ga - gb;
        if (ga === 0) return da - db;
        return Math.abs(da) - Math.abs(db);
      });

      setter(list);
    },
    (err) => console.log("listenEventosTodos error:", err.code, err.message)
  );
}

export async function borrarEvento(id: string, cineId: string) {
  const col = getEventosCol(cineId);
  await deleteDoc(doc(col, id));
}

export async function actualizarEvento(
  id: string,
  patch: Partial<
    Pick<Evento, "sala" | "kdm" | "dcp" | "desayuno" | "combo" | "diaHora">
  >,
  cineId: string
) {
  const col = getEventosCol(cineId);
  const ref = doc(col, id);
  const data: any = {};

  if (patch.sala !== undefined) data.sala = String(patch.sala).trim();
  if (patch.kdm !== undefined) data.kdm = !!patch.kdm;
  if (patch.dcp !== undefined) data.dcp = !!patch.dcp;
  if (patch.desayuno !== undefined) data.desayuno = !!patch.desayuno;
  if (patch.combo !== undefined) data.combo = !!patch.combo;

  if (patch.diaHora !== undefined) {
    data.diaHora = Timestamp.fromDate(patch.diaHora);
    data.timestamp = patch.diaHora.getTime();
  }

  await updateDoc(ref, data);
}