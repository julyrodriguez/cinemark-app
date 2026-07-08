import { Platform } from "react-native";
import {
  collection as firestoreCollection,
  doc as firestoreDoc,
  getDocs as firestoreGetDocs,
  getDoc as firestoreGetDoc,
  addDoc as firestoreAddDoc,
  setDoc as firestoreSetDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
  onSnapshot as firestoreOnSnapshot,
  query as firestoreQuery,
  orderBy as firestoreOrderBy,
  where as firestoreWhere,
  limit as firestoreLimit,
  serverTimestamp as firestoreServerTimestamp,
  QueryConstraint
} from "firebase/firestore";
import { db as realFirestoreDb, auth } from "./firebaseConfig";

// Base URL de la API local (se puede configurar mediante variables de entorno)
// Reemplazar con la URL final del túnel de Cloudflare o la IP de tu servidor
const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || "http://localhost:3001/api";

// Estado global para rastrear si el servidor local está caído
let fallbackModeActive = false;

export function isFallbackMode() {
  return fallbackModeActive;
}

// Obtener el ID Token de Firebase Auth actual para autenticar con la API Docker
async function getAuthToken(): Promise<string | null> {
  const currentUser = auth.currentUser;
  if (!currentUser) return null;
  try {
    return await currentUser.getIdToken(true);
  } catch (err) {
    console.error("Error al obtener Firebase Auth Token:", err);
    return null;
  }
}

// Representa una referencia compatible con el SDK de Firestore
export class DbRef {
  type: "collection" | "document" | "query";
  path: string[];
  firestoreRef: any;
  constraints?: QueryConstraint[];

  constructor(type: "collection" | "document" | "query", path: string[], firestoreRef: any, constraints?: QueryConstraint[]) {
    this.type = type;
    this.path = path;
    this.firestoreRef = firestoreRef;
    this.constraints = constraints;
  }
}

// Mock de la base de datos local
export const db = {};

// 1. Mock de collection()
export function collection(database: any, ...pathSegments: string[]): DbRef {
  const firestoreRef = firestoreCollection(realFirestoreDb, pathSegments[0], ...pathSegments.slice(1));
  return new DbRef("collection", pathSegments, firestoreRef);
}

// 2. Mock de doc()
export function doc(database: any, ...pathSegments: string[]): DbRef {
  // Manejar caso donde se pasa una referencia de colección como primer argumento
  if (database instanceof DbRef) {
    const parentRef = database;
    const segments = [...parentRef.path, ...pathSegments];
    const firestoreRef = firestoreDoc(realFirestoreDb, segments[0], ...segments.slice(1));
    return new DbRef("document", segments, firestoreRef);
  }
  const firestoreRef = firestoreDoc(realFirestoreDb, pathSegments[0], ...pathSegments.slice(1));
  return new DbRef("document", pathSegments, firestoreRef);
}

// 3. Mock de query()
export function query(dbRef: DbRef, ...queryConstraints: QueryConstraint[]): DbRef {
  const firestoreRef = firestoreQuery(dbRef.firestoreRef, ...queryConstraints);
  return new DbRef("query", dbRef.path, firestoreRef, queryConstraints);
}

// Re-exportar constraints sin modificar
export const orderBy = firestoreOrderBy;
export const where = firestoreWhere;
export const limit = firestoreLimit;
export const serverTimestamp = firestoreServerTimestamp;

// 4. Mock de getDocs() (Lectura de colecciones)
export async function getDocs(dbRef: DbRef) {
  if (fallbackModeActive) {
    console.warn("[DB Service] Servidor offline: Leyendo desde Firestore de respaldo.");
    return await firestoreGetDocs(dbRef.firestoreRef);
  }

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    // Construir ruta de la API según los segmentos
    // Ruta en Firestore: cines/{cineId}/{subColName} o cines/{cineId}/{subColName}/{parentId}/{subSubColName}
    const path = dbRef.path;
    let url = "";

    if (path.length === 1 && path[0] === "cines") {
      url = `${API_BASE_URL}/cines`;
    } else if (path.length === 3 && path[0] === "cines") {
      const [_, cineId, subColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}`;
    } else if (path.length === 5 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}`;
    } else {
      // Si la colección no sigue el patrón estándar, usar fallback a Firestore directamente
      return await firestoreGetDocs(dbRef.firestoreRef);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 segundos de timeout

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();

    // Mapear el array JSON devuelto a la estructura de QuerySnapshot que espera Firestore
    return {
      empty: data.length === 0,
      size: data.length,
      docs: data.map((docData: any) => ({
        id: docData.id,
        exists: () => true,
        data: () => docData
      }))
    };
  } catch (err: any) {
    console.error("[DB Service] Error al conectar con la API local, activando Modo Respaldo:", err.message);
    fallbackModeActive = true;
    // Intentar leer de Firestore
    return await firestoreGetDocs(dbRef.firestoreRef);
  }
}

// 5. Mock de getDoc() (Lectura de un documento específico)
export async function getDoc(dbRef: DbRef) {
  if (fallbackModeActive) {
    return await firestoreGetDoc(dbRef.firestoreRef);
  }

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 2 && path[0] === "cines") {
      const [_, cineId] = path;
      url = `${API_BASE_URL}/cines/${cineId}`;
    } else if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else {
      return await firestoreGetDoc(dbRef.firestoreRef);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      headers: {
        "Authorization": `Bearer ${token}`
      },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (res.status === 404) {
      return { exists: () => false, data: () => null };
    }

    if (!res.ok) {
      throw new Error(`Error HTTP: ${res.status}`);
    }

    const data = await res.json();
    return {
      id: path[path.length - 1],
      exists: () => true,
      data: () => data
    };
  } catch (err: any) {
    console.error("[DB Service] Error en getDoc al conectar con la API, usando Firestore:", err.message);
    fallbackModeActive = true;
    return await firestoreGetDoc(dbRef.firestoreRef);
  }
}

// Helper para verificar si estamos en modo lectura obligatoria y bloquear escrituras
function checkWritePermissions() {
  if (fallbackModeActive) {
    const errorMsg = "Servidor local fuera de línea. Modo de solo lectura activo. No se permiten actualizaciones.";
    if (Platform.OS === "web") {
      alert(errorMsg);
    }
    throw new Error(errorMsg);
  }
}

// 6. Mock de addDoc() (Crear documento con ID auto-generado)
export async function addDoc(dbRef: DbRef, data: any) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 3 && path[0] === "cines") {
      const [_, cineId, subColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}`;
    } else if (path.length === 5 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}`;
    } else {
      return await firestoreAddDoc(dbRef.firestoreRef, data);
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

    const result = await res.json();
    return { id: result.id };
  } catch (err: any) {
    console.error("[DB Service] Error en addDoc:", err.message);
    throw err;
  }
}

// 7. Mock de setDoc() (Crear/sobreescribir documento con ID específico)
export async function setDoc(dbRef: DbRef, data: any, options?: any) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 2 && path[0] === "cines") {
      const [_, cineId] = path;
      url = `${API_BASE_URL}/cines/${cineId}`;
    } else if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else if (path.length === 6 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}/${docId}`;
    } else {
      return await firestoreSetDoc(dbRef.firestoreRef, data, options);
    }

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[DB Service] Error en setDoc:", err.message);
    throw err;
  }
}

// 8. Mock de updateDoc() (Actualizar parcialmente un documento)
export async function updateDoc(dbRef: DbRef, data: any) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else if (path.length === 6 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}/${docId}`;
    } else {
      return await firestoreUpdateDoc(dbRef.firestoreRef, data);
    }

    const res = await fetch(url, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(data)
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[DB Service] Error en updateDoc:", err.message);
    throw err;
  }
}

// 9. Mock de deleteDoc() (Eliminar documento)
export async function deleteDoc(dbRef: DbRef) {
  checkWritePermissions();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Usuario no autenticado");

    const path = dbRef.path;
    let url = "";

    if (path.length === 4 && path[0] === "cines") {
      const [_, cineId, subColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${docId}`;
    } else if (path.length === 6 && path[0] === "cines") {
      const [_, cineId, subColName, parentId, subSubColName, docId] = path;
      url = `${API_BASE_URL}/cines/${cineId}/${subColName}/${parentId}/${subSubColName}/${docId}`;
    } else {
      return await firestoreDeleteDoc(dbRef.firestoreRef);
    }

    const res = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);
    return { success: true };
  } catch (err: any) {
    console.error("[DB Service] Error en deleteDoc:", err.message);
    throw err;
  }
}

// 10. Mock de onSnapshot() (Escucha en tiempo real)
// Apunta a Firestore directamente, lo que garantiza el tiempo real y el modo de respaldo nativos
export function onSnapshot(dbRef: DbRef, callback: any, errorCallback?: any) {
  return firestoreOnSnapshot(
    dbRef.firestoreRef,
    (snapshot: any) => {
      // Mapeamos los datos para asegurar compatibilidad
      callback(snapshot);
    },
    (err: any) => {
      if (errorCallback) {
        errorCallback(err);
      } else {
        console.error("[DB Service] Error en onSnapshot:", err);
      }
    }
  );
}

// 11. Mock de httpsCallable() para interceptar funciones de Firebase y llamarlas en el backend local
import { httpsCallable as firestoreHttpsCallable } from "firebase/functions";

export { functions } from "./firebaseConfig";

export function httpsCallable(functionsInstance: any, functionName: string) {
  return async (data: any) => {
    if (fallbackModeActive) {
      console.warn(`[DB Service] Servidor offline: Llamando a la Cloud Function de respaldo: ${functionName}`);
      const realCallable = firestoreHttpsCallable(functionsInstance, functionName);
      const res = await realCallable(data);
      return res;
    }

    try {
      const token = process.env.EXPO_PUBLIC_API_TOKEN || "jariel2026";
      const authToken = await getAuthToken();

      const headers: any = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      };

      if (authToken) {
        headers["x-firebase-auth"] = `Bearer ${authToken}`;
      }

      const res = await fetch(`${API_BASE_URL}/functions/${functionName}`, {
        method: "POST",
        headers,
        body: JSON.stringify(data || {})
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Error HTTP: ${res.status}`);
      }

      const result = await res.json();
      return result;
    } catch (err: any) {
      console.error(`[DB Service] Falló la llamada a la función ${functionName} en la API:`, err.message);
      console.warn(`[DB Service] Intentando fallback directo a Firebase Cloud Functions para ${functionName}...`);
      const realCallable = firestoreHttpsCallable(functionsInstance, functionName);
      const res = await realCallable(data);
      return res;
    }
  };
}
